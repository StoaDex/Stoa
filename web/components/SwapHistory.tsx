"use client";
import { useEffect, useState } from "react";
import { erc20Abi, type Address, type Hash } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { txUrlOn } from "@/lib/networks";
import { getLogsOn } from "@/lib/logs";
import { useNet } from "./Providers";
import { routedEvent } from "@/lib/abi";
import { NATIVE } from "@/lib/tokens";
import { fmt } from "@/lib/swap";
import { SITE } from "@/lib/chain";
import { shareOrCopy } from "@/lib/share";

type Row = { hash: Hash; time: number; tokenIn: Address; tokenOut: Address; amountIn: bigint; amountOut: bigint };
type Meta = Record<string, { symbol: string; decimals: number }>;

/** The connected wallet's swaps through the Stoa router, read straight from on-chain events. */
export default function SwapHistory() {
  const net = useNet();
  const elysium = net.chain, CONTRACTS = net.contracts;
  const txUrl = (h: string) => txUrlOn(net, h);
  const KNOWN: Meta = Object.fromEntries(net.tokens.map((t) => [t.address.toLowerCase(), { symbol: t.symbol, decimals: t.decimals }]));
  const { address } = useAccount();
  const pub = usePublicClient({ chainId: elysium.id });
  const [rows, setRows] = useState<Row[] | null>(null); // every swap, newest first; the table shows the latest 25
  const [meta, setMeta] = useState<Meta>(KNOWN);
  useEffect(() => { setRows(null); setErr(false); setMeta(KNOWN); }, [net.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const [err, setErr] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!address || !CONTRACTS.router || !net.logsRpc) return;
    let stop = false;
    (async () => {
      let r: Row[] = [];
      try {
        const logs = await getLogsOn(net, { address: CONTRACTS.router!, event: routedEvent, args: { sender: address }, fromBlock: net.deployBlock });
        r = [...logs].reverse().map((l) => ({
          hash: l.transactionHash!, time: Number((l as unknown as { blockTimestamp?: string }).blockTimestamp ?? 0),
          tokenIn: l.args.tokenIn!, tokenOut: l.args.tokenOut!, amountIn: l.args.amountIn!, amountOut: l.args.amountOut!,
        }));
        if (!stop) setRows(r);
      } catch {
        if (!stop) setErr(true);
        return;
      }
      try {
        // symbols for tokens the app does not list
        const unknown = [...new Set(r.flatMap((x) => [x.tokenIn, x.tokenOut]).map((a) => a.toLowerCase()))].filter((a) => !KNOWN[a] && a !== NATIVE.toLowerCase());
        if (pub && unknown.length) {
          const res = await pub.multicall({ contracts: unknown.flatMap((a) => [
            { address: a as Address, abi: erc20Abi, functionName: "symbol" as const },
            { address: a as Address, abi: erc20Abi, functionName: "decimals" as const },
          ]), allowFailure: true });
          const add: Meta = {};
          unknown.forEach((a, i) => {
            const sym = res[2 * i]?.result as string | undefined, dec = res[2 * i + 1]?.result as number | undefined;
            add[a] = { symbol: (sym ?? "TOKEN").replace(/[^\w.$-]/g, "").slice(0, 12), decimals: dec ?? 18 };
          });
          if (!stop) setMeta((m) => ({ ...m, ...add }));
        }
      } catch { /* symbols are cosmetic */ }
    })();
    return () => { stop = true; };
  }, [address, pub, net]); // eslint-disable-line react-hooks/exhaustive-deps

  // each swap has a shareable page that carries this wallet's referral (/swap/<chain>/<hash>)
  async function share(r: Row) {
    const link = `${SITE}/swap/${net.key}/${r.hash}${address ? `?ref=${address}` : ""}`;
    const text = `Swapped ${fmt(r.amountIn, m(r.tokenIn).decimals, 4)} ${m(r.tokenIn).symbol} for ${fmt(r.amountOut, m(r.tokenOut).decimals, 4)} ${m(r.tokenOut).symbol} on @StoaDEX.`;
    if ((await shareOrCopy(link, text)) === "copied") { setCopied(r.hash); setTimeout(() => setCopied(null), 1600); }
  }
  // every swap as a CSV file, for records and tax tools; amounts in token units, times in UTC
  function csv() {
    if (!rows?.length) return;
    const q = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const plain = (v: bigint, d: number) => {
      const s0 = v.toString().padStart(d + 1, "0");
      const i = s0.slice(0, s0.length - d), f = s0.slice(s0.length - d).replace(/0+$/, "");
      return f ? `${i}.${f}` : i;
    };
    const head = ["date_utc", "chain", "sold_amount", "sold_token", "sold_token_address", "bought_amount", "bought_token", "bought_token_address", "tx_hash", "explorer"];
    const lines = rows.map((r) => [
      r.time ? new Date(r.time * 1000).toISOString().replace("T", " ").slice(0, 19) : "",
      net.name, plain(r.amountIn, m(r.tokenIn).decimals), m(r.tokenIn).symbol, r.tokenIn,
      plain(r.amountOut, m(r.tokenOut).decimals), m(r.tokenOut).symbol, r.tokenOut, r.hash, txUrl(r.hash),
    ].map((x) => q(String(x))).join(","));
    const blob = new Blob([[head.join(","), ...lines].join("\n") + "\n"], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `stoa-swaps-${net.key}-${address?.slice(0, 8) ?? "wallet"}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const m = (a: Address) => meta[a.toLowerCase()] ?? (a === NATIVE ? { symbol: net.gas, decimals: 18 } : { symbol: "…", decimals: 18 });
  if (!CONTRACTS.router) return <p className="note">Your swaps on {net.name} will show here once Stoa is live there.</p>;
  if (err) return <p className="note">Could not load swap history right now.</p>;
  if (!rows) return <p className="note">Loading swaps…</p>;
  if (!rows.length) return <p className="note">No swaps on {net.name} yet from this wallet.</p>;
  return (
    <>
    <div className="rowx" style={{ marginBottom: 8 }}>
      <span className="note" style={{ margin: 0 }}>{rows.length > 25 ? `Latest 25 of ${rows.length} swaps.` : `${rows.length} swap${rows.length === 1 ? "" : "s"}.`}</span>
      <button type="button" className="ghost" onClick={csv}>Download CSV</button>
    </div>
    <table className="tbl">
      <thead><tr><th>WHEN</th><th>SOLD</th><th>BOUGHT</th><th /></tr></thead>
      <tbody>
        {rows.slice(0, 25).map((r) => (
          <tr key={r.hash}>
            <td>{r.time ? new Date(r.time * 1000).toLocaleString() : "—"}</td>
            <td style={{ fontFamily: "var(--num)" }}>{fmt(r.amountIn, m(r.tokenIn).decimals, 4)} {m(r.tokenIn).symbol}</td>
            <td style={{ fontFamily: "var(--num)" }}>{fmt(r.amountOut, m(r.tokenOut).decimals, 4)} {m(r.tokenOut).symbol}</td>
            <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
              <button type="button" className="linkbtn" onClick={() => share(r)}>{copied === r.hash ? "Copied" : "Share"}</button>
              {" · "}<a href={txUrl(r.hash)} target="_blank" rel="noopener noreferrer">View</a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    </>
  );
}
