"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { zeroAddress } from "viem";
import { PageHead, Sk } from "./ui";
import SpotlightStrip from "./SpotlightStrip";
import { useNet } from "./Providers";
import { ROBINHOOD } from "@/lib/networks";
import { routerAbi } from "@/lib/abi";
import type { Launch } from "@/app/api/pons/launches/route";
import { CA } from "@/lib/stoaAddress";
import { SITE } from "@/lib/chain";
import { ponsCurveAbi } from "@/lib/ponsLaunch";
import { shareOrCopy, useRefFromUrl } from "@/lib/share";
import { useCoverLive, useOpenTokens } from "@/lib/cover";

const PONS = (a: string) => `https://ponsfamily.com/launchpad/${a}`;
const usd = (v: number | null) => (v === null ? "—" : v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`);
function age(ts: number) {
  const s = Math.max(0, Date.now() / 1000 - ts);
  return s < 3600 ? `${Math.max(1, Math.round(s / 60))}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`;
}

/** Live Pons launches on Robinhood Chain, read from the chain by /api/pons/launches. Trade buttons go to Stoa once the
 *  Pons curve adapter is in the router (curves) or for graduated tokens (their Uniswap V4 pool); otherwise to Pons. */
export default function LaunchesBody() {
  const net = useNet();
  const [all, setAll] = useState(false);
  const q = useQuery({
    queryKey: ["pons-launches"],
    refetchInterval: 60_000,
    queryFn: async () => (await (await fetch("/api/pons/launches")).json()) as { launches: Launch[]; scanned?: number; error?: string },
  });
  const ponsLive = useReadContract({
    address: ROBINHOOD.contracts.router, abi: routerAbi, functionName: "isAdapter", args: [ROBINHOOD.pons ?? zeroAddress],
    chainId: ROBINHOOD.chain.id, query: { enabled: !!ROBINHOOD.pons, refetchInterval: 60_000 },
  }).data === true;

  // referral: a ?ref= on this page is remembered like on Trade, and links shared from here carry the sharer's wallet
  const { address } = useAccount();
  const [copied, setCopied] = useState<string | null>(null);
  useRefFromUrl();
  const refQ = address ? `ref=${address}` : "";
  const linkFor = (l?: Launch) => `${SITE}/launches${l ? `/${l.token}` : ""}${refQ ? `?${refQ}` : ""}`;
  async function share(key: string, url: string, text: string) {
    if ((await shareOrCopy(url, text)) === "copied") { setCopied(key); setTimeout(() => setCopied(null), 1600); }
  }

  // the list comes from the API (CDN-cached a minute); progress and market cap stay live, read from the curves every 10s
  const base = useMemo(() => (q.data?.launches ?? []).filter((l) => !l.graduated), [q.data]);
  const fresh = useReadContracts({
    contracts: base.flatMap((l) => [
      { address: l.curve, abi: ponsCurveAbi, functionName: "realQuoteReserve", chainId: ROBINHOOD.chain.id } as const,
      { address: l.curve, abi: ponsCurveAbi, functionName: "quoteReserve", chainId: ROBINHOOD.chain.id } as const,
      { address: l.curve, abi: ponsCurveAbi, functionName: "tokenReserve", chainId: ROBINHOOD.chain.id } as const,
    ]),
    query: { enabled: base.length > 0, refetchInterval: 10_000 },
  });
  const ethUsd = (q.data as { ethUsd?: number | null } | undefined)?.ethUsd ?? null;
  const liveRows = useMemo(() => base.map((l, i) => {
    const raised = fresh.data?.[3 * i]?.result as bigint | undefined, qr = fresh.data?.[3 * i + 1]?.result as bigint | undefined, tr = fresh.data?.[3 * i + 2]?.result as bigint | undefined;
    if (raised === undefined || qr === undefined || !tr || !l.supply) return l;
    const thr = +l.threshold, r = Number(raised) / 1e18, mcapEth = (Number(qr) / Number(tr)) * l.supply;
    return { ...l, raised: r.toFixed(4), progress: thr > 0 ? Math.min(99.9, (r / thr) * 100) : l.progress, mcapEth: mcapEth.toFixed(2), mcapUsd: ethUsd ? mcapEth * ethUsd : l.mcapUsd };
  }), [base, fresh.data, ethUsd]);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"close" | "new" | "cap">("close");
  const [near, setNear] = useState(false);
  const [onlyCov, setOnlyCov] = useState(false);
  const coverLive = useCoverLive();
  const covered = useOpenTokens(coverLive);
  const needle = search.trim().toLowerCase();
  const live = liveRows
    .filter((l) => !near || l.progress >= 80)
    .filter((l) => !onlyCov || covered.has(l.token.toLowerCase()))
    .filter((l) => !needle || (l.symbol + " " + l.name + " " + l.token).toLowerCase().includes(needle))
    .sort((a, b) => sort === "new" ? b.launchedAt - a.launchedAt : sort === "cap" ? (b.mcapUsd ?? 0) - (a.mcapUsd ?? 0) : b.progress - a.progress);
  const grads = (q.data?.launches ?? []).filter((l) => l.graduated);
  const shown = all ? live : live.slice(0, 20);
  const trade = (l: Launch) => `/trade?chain=robinhood&buy=${l.token}`;

  return (
    <>
      <PageHead eyebrow="PONS LAUNCHES · ROBINHOOD CHAIN" title="Every live launch, one list" action={<button type="button" className="cta" onClick={() => share("page", linkFor(), "Every live Pons launch on Robinhood Chain, with curve progress:")}>{copied === "page" ? "Link copied" : "Share this list"}</button>}>
        Tokens on their Pons bonding curve that have raised at least 0.05 ETH in the last few days, by ETH raised, read straight from the curves.
        {ponsLive ? " Trade any of them on Stoa, from ETH or any token." : " Stoa's Pons curve adapter goes live on 18 Nov (48h timelock); until then the buttons open Pons."}
      </PageHead>
      <SpotlightStrip />
      {net.key !== "robinhood" && <div className="notice" style={{ marginBottom: 16 }}>Pons runs on Robinhood Chain. Swaps from this page switch you there.</div>}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <input type="search" placeholder="Search name, ticker or address" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search launches"
          style={{ flex: "1 1 220px", minWidth: 0, padding: "10px 14px", borderRadius: 12, border: "1px solid var(--line)", background: "#fff", font: "inherit", fontSize: 14 }} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {([["close", "Closest to graduation"], ["new", "Newest"], ["cap", "Market cap"]] as const).map(([k, label]) => (
            <button key={k} type="button" className="chip" style={{ cursor: "pointer", border: 0, opacity: sort === k ? 1 : 0.55 }} aria-pressed={sort === k} onClick={() => setSort(k)}>{label}</button>
          ))}
          <button type="button" className="chip" style={{ cursor: "pointer", border: 0, opacity: near ? 1 : 0.55 }} aria-pressed={near} onClick={() => setNear(!near)}>80%+ only</button>
          {coverLive && <button type="button" className="chip" style={{ cursor: "pointer", border: 0, opacity: onlyCov ? 1 : 0.55 }} aria-pressed={onlyCov} onClick={() => setOnlyCov(!onlyCov)}>Covered only</button>}
        </div>
      </div>
      <div className="panel" style={{ overflow: "hidden", marginBottom: 20 }}>
        <table className="tbl">
          <thead><tr><th>TOKEN</th><th>CURVE</th><th className="hm">MARKET CAP</th><th className="hm">CREATOR TAX</th><th className="hm">AGE</th><th /></tr></thead>
          <tbody>
            {q.isLoading && [0, 1, 2, 3, 4].map((i) => <tr key={i}><td colSpan={6}><Sk w={260} /></td></tr>)}
            {!q.isLoading && !live.length && <tr><td colSpan={6} style={{ color: "var(--muted)" }}>{q.data?.error ?? (needle || near || onlyCov ? "No launch matches." : "No curve has raised 0.05 ETH in the last few days.")}</td></tr>}
            {shown.map((l) => (
              <tr key={l.token}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span aria-hidden style={{ position: "relative", overflow: "hidden", width: 30, height: 30, borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#EAF1FB", color: "var(--accent)", fontWeight: 700, flex: "none" }}>
                      {l.symbol[0]}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {l.logo && <img src={l.logo} alt="" width={30} height={30} loading="lazy" style={{ position: "absolute", inset: 0, width: 30, height: 30, objectFit: "cover" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />}
                    </span>
                    <Link href={`/launches/${l.token}`} style={{ minWidth: 0, color: "inherit" }}>
                      <div style={{ fontWeight: 600 }}>{l.symbol}{l.token.toLowerCase() === CA.toLowerCase() && <span className="chip live" style={{ marginLeft: 6 }}>Stoa&apos;s token</span>}{covered.has(l.token.toLowerCase()) && <span className="chip cov">Covered</span>}</div>
                      <div style={{ fontSize: 12.5, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>{l.name}</div>
                    </Link>
                  </div>
                </td>
                <td style={{ minWidth: 120 }}>
                  <div style={{ height: 8, borderRadius: 999, background: "#E6ECF5", overflow: "hidden" }}><div style={{ width: `${l.progress}%`, height: "100%", background: "var(--accent)" }} /></div>
                  <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4, fontFamily: "var(--num)" }}>{l.progress.toFixed(1)}% · {(+l.raised).toFixed(2)}/{(+l.threshold).toFixed(1)} ETH</div>
                </td>
                <td className="hm" style={{ fontFamily: "var(--num)" }}>{usd(l.mcapUsd)}</td>
                <td className="hm" style={{ fontFamily: "var(--num)" }}>{(l.creatorTaxBps / 100).toFixed(1)}%</td>
                <td className="hm" style={{ fontFamily: "var(--num)" }}>{age(l.launchedAt)}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                  <button type="button" className="ghost" style={{ padding: "3px 10px", fontSize: 12.5, minHeight: 0 }} aria-label={`Share ${l.symbol}`}
                    onClick={() => share(l.token, linkFor(l), `$${l.symbol} is ${l.progress.toFixed(0)}% of the way to graduation on its Pons curve.`)}>
                    {copied === l.token ? "Copied" : "Share"}
                  </button>
                  {ponsLive
                    ? <Link href={trade(l)} className="go" style={{ margin: 0 }}>Trade</Link>
                    : <a href={PONS(l.token)} className="go" style={{ margin: 0 }} target="_blank" rel="noopener noreferrer">Pons</a>}
                  </div>
                </td>
              </tr>
            ))}
            {live.length > 20 && <tr><td colSpan={6}><button type="button" className="ghost" onClick={() => setAll(!all)}>{all ? "Show top 20" : `Show all ${live.length}`}</button></td></tr>}
          </tbody>
        </table>
      </div>

      {grads.length > 0 && (
        <div className="panel pad" style={{ marginBottom: 20 }}>
          <div className="lbl">RECENTLY GRADUATED · NOW ON UNISWAP V4</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {grads.map((l) => <Link key={l.token} href={`/launches/${l.token}`} className="chip" title={l.name}>{l.symbol}{covered.has(l.token.toLowerCase()) && " · Covered"}</Link>)}
          </div>
          <p className="note">Graduated tokens trade on their Uniswap V4 pool. Stoa&apos;s keeper adds each graduation pool to the router, usually within the hour.</p>
        </div>
      )}

      <p className="note">
        {address
          ? <>Links you share from this page carry your referral: you earn 10% of Stoa&apos;s protocol fee on the swaps they bring, claimable on <Link href="/referrals">Referrals</Link>.</>
          : <>Connect a wallet and the links you share from this page carry your referral (10% of Stoa&apos;s protocol fee on the swaps they bring).</>}
      </p>
      <p className="note">
        <Link href="/docs/trade-pons">How Pons trading on Stoa works</Link>. Unverified launches, not reviewed by Stoa: anyone can launch a token on Pons, and most go to zero. Curve trades pay Pons&apos; 1% fee and the token&apos;s creator tax on top of Stoa&apos;s 2 bps. Progress and market cap update every 10 seconds straight from the curves; the list itself refreshes every minute{q.data?.scanned ? `, from the last ${q.data.scanned.toLocaleString()} launches` : ""}. Tap a token for its own page and link card.{coverLive && <> Covered: the creator bonded ETH behind its wallet on <Link href="/cover">Rug Cover</Link>.</>}
      </p>
    </>
  );
}
