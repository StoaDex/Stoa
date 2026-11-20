"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { erc20Abi, parseAbiItem, type Address } from "viem";
import { getLogsOn } from "@/lib/logs";
import { useAccount, usePublicClient, useReadContracts } from "wagmi";
import { SEASON_START } from "@/lib/pointsScore";
import { useChainWrite } from "@/lib/chainWrite";
import { SITE } from "@/lib/chain";
import { feesAbi } from "@/lib/abi";
import { fmt } from "@/lib/swap";
import { useNet, useWalletModal } from "./Providers";
import CopyButton from "./CopyButton";

const FEE_NOTIFIED = parseAbiItem("event FeeNotified(address indexed from, address indexed token, uint256 amount, address indexed referrer, uint256 toReferrer)");

export default function Referrals() {
  const net = useNet();
  const elysium = net.chain, CONTRACTS = net.contracts;
  const pub = usePublicClient({ chainId: elysium.id });
  const BASE = [net.tokens[2], net.tokens[1]].map((t) => ({ s: t.symbol, a: t.address as Address, d: t.decimals }));
  const { address, isConnected } = useAccount();
  // referral fees come in whatever token each swap delivered (a Pons launch, $STOA, …): find them from the fee log
  const extra = useQuery({
    queryKey: ["ref-tokens", net.key, address],
    enabled: !!address && !!CONTRACTS.fees && !!pub,
    staleTime: 120_000,
    queryFn: async () => {
      const logs = await getLogsOn(net, { address: CONTRACTS.fees!, event: FEE_NOTIFIED, args: { referrer: address }, fromBlock: net.deployBlock });
      const seen = new Set(BASE.map((t) => t.a.toLowerCase()));
      const found = [...new Set(logs.map((l) => (l.args.token as Address).toLowerCase()))].filter((a) => !seen.has(a)) as Address[];
      return Promise.all(found.slice(0, 30).map(async (a) => {
        const known = net.tokens.find((t) => t.address.toLowerCase() === a);
        if (known) return { s: known.symbol, a, d: known.decimals };
        const [sym, dec] = await Promise.all([
          pub!.readContract({ address: a, abi: erc20Abi, functionName: "symbol" }).catch(() => "TOKEN"),
          pub!.readContract({ address: a, abi: erc20Abi, functionName: "decimals" }).catch(() => 18),
        ]);
        return { s: String(sym).replace(/[^\w.$-]/g, "").slice(0, 12) || "TOKEN", a, d: Number(dec) };
      }));
    },
  });
  const TOK = [...BASE, ...(extra.data ?? [])];
  const { open } = useWalletModal();
  const { writeContractAsync } = useChainWrite();
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const owed = useReadContracts({
    contracts: TOK.map((t) => ({ address: CONTRACTS.fees!, abi: feesAbi, functionName: "referralOwed" as const, args: [address!, t.a] as const, chainId: elysium.id })),
    query: { enabled: !!address && !!CONTRACTS.fees, refetchInterval: 15_000 },
  });
  const amounts = TOK.map((_, i) => (owed.data?.[i]?.result as bigint | undefined) ?? 0n);
  const any = amounts.some((a) => a > 0n);
  const link = address ? `${SITE}/trade?ref=${address}` : "";

  async function claim() {
    if (!pub || !address) return;
    setBusy(true); setMsg(null);
    try {
      const hash = await writeContractAsync({ address: CONTRACTS.fees!, abi: feesAbi, functionName: "claimReferral", args: [TOK.filter((_, i) => amounts[i] > 0n).map((t) => t.a), address], chainId: elysium.id });
      const r = await pub.waitForTransactionReceipt({ hash });
      if (r.status !== "success") throw new Error("Transaction reverted");
      setMsg({ ok: true, t: "Claimed" }); void owed.refetch();
    } catch (e) {
      setMsg({ ok: false, t: (e as { shortMessage?: string }).shortMessage ?? (e as Error).message });
    } finally { setBusy(false); }
  }

  return (
    <div className="grid2">
      <div className="panel pad">
        <div className="lbl">YOUR LINK</div>
        {!isConnected ? (
          <div className="empty" style={{ padding: "28px 10px" }}><p>Connect a wallet to create your referral link.</p><button className="cta" type="button" onClick={open}>Connect wallet</button></div>
        ) : (
          <>
            <div className="box" style={{ marginTop: 12 }}><div className="row"><span className="addrchip" style={{ wordBreak: "break-all" }}>{link}</span><CopyButton text={link} /></div></div>
            <p className="note" style={{ marginTop: 8 }}>
              Or share your invite card: <a href={`https://x.com/intent/post?text=${encodeURIComponent("Swapping on Robinhood Chain? Stoa compares every route for your exact amount, stock tokens included, and swaps earn Points. Here's my invite:")}&url=${encodeURIComponent(`${SITE}/r/${address}`)}`} target="_blank" rel="noopener noreferrer">Post on X ↗</a>
              {" · "}<CopyButton text={`${SITE}/r/${address}`} label="Copy invite link" />
            </p>
            <RefPoints address={address!} />
            <div className="lbl" style={{ marginTop: 20 }}>EARNED ON {net.short.toUpperCase()}, NOT CLAIMED</div>
            <ul className="list">{TOK.map((t, i) => (i < BASE.length || amounts[i] > 0n) && <li key={t.a}>{t.s} <b>{CONTRACTS.fees ? fmt(amounts[i], t.d, 6) : "—"}</b></li>)}</ul>
            <button className="big pri" type="button" disabled={!any || busy || !CONTRACTS.fees} onClick={claim}>{busy ? "Claiming…" : !CONTRACTS.fees ? "Opens at launch" : any ? "Claim" : "Nothing to claim yet"}</button>
            {msg && <div className={msg.ok ? "ok" : "err"}>{msg.t}</div>}
          </>
        )}
      </div>
      <div className="panel pad"><div className="lbl">HOW IT WORKS</div><ul className="list"><li>Share your stoadex.com link <b>Any channel</b></li><li>Friends trade through it <b>Remembered on their device</b></li><li>You earn from their swaps <b>10% of protocol fee</b></li><li>Works on every network <b>Claim per network</b></li></ul></div>
    </div>
  );
}

/** Points season 1 from the swaps this wallet referred (10% of their points), and how many there were. Before the
 *  season starts: the same rules over the last 7 days, as a preview. */
function RefPoints({ address }: { address: string }) {
  const pre = Date.now() / 1000 < SEASON_START;
  const q = useQuery({
    queryKey: ["ref-points", address, pre],
    refetchInterval: 120_000,
    queryFn: async () => (await (await fetch(`/api/points?address=${address}${pre ? "&preview=1" : ""}`)).json()) as { row: { refPoints: number; refSwaps?: number } | null },
  });
  const pts = q.data?.row?.refPoints ?? 0, n = q.data?.row?.refSwaps ?? 0;
  return (
    <div className="box" style={{ marginTop: 14 }}>
      <div className="row"><span className="blab">{pre ? "POINTS FROM YOUR REFERRALS · PREVIEW, LAST 7 DAYS" : "POINTS FROM YOUR REFERRALS · SEASON 1"}</span></div>
      <div className="row"><b style={{ fontFamily: "var(--num)", fontSize: 24 }}>{q.isLoading ? "…" : pts.toLocaleString("en-US", { maximumFractionDigits: 1 })}</b><span className="note" style={{ margin: 0 }}>{n} referred {n === 1 ? "swap" : "swaps"} · <a href="/points">Points</a></span></div>
      {pre && <p className="note" style={{ margin: "6px 0 0" }}>Counts from Mon 23 Nov, 00:00 UTC: 10% of the points of every swap made through your link.</p>}
    </div>
  );
}
