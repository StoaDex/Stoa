"use client";
import { useState } from "react";
import Link from "next/link";
import { coverAbi, useCoverLive } from "@/lib/cover";
import { spotlightAbi } from "@/lib/spotlight";
import { useNow } from "./spotlightData";
import { useQuery } from "@tanstack/react-query";
import { BaseError, encodeFunctionData, erc20Abi, parseUnits, zeroAddress, type Address, type Hash } from "viem";
import { useAccount, usePublicClient, useReadContracts } from "wagmi";
import { useChainWrite } from "@/lib/chainWrite";
import { ROBINHOOD, addressUrlOn, txUrlOn } from "@/lib/networks";
import { CA } from "@/lib/stoaToken";
import { bondAbi, buybackAbi, feeStateAbi, routerAbi, v4AdapterAbi } from "@/lib/abi";
import { getLogsOn } from "@/lib/logs";
import { fmt } from "@/lib/swap";
import { usePrices, fmtUsd } from "@/lib/prices";
import { opId, timelockBatchAbi, ZERO32, type BatchOp } from "@/lib/venuePackage";
import { useWalletModal } from "./Providers";
import { Sk } from "./ui";
import { BURN as BURN_ADDR, PONS_HOOK, PONS_URL, STOA_CURVE, curveAbi } from "@/lib/stoaSupply";
import { findV4Pools, sameKey, type PoolKey } from "@/lib/v4";
import { ponsCurveAbi } from "@/lib/ponsLaunch";

const net = ROBINHOOD;
const C = net.contracts;
const STOA = CA;
const BURN = BURN_ADDR;
const USDG = net.stable, WETH = net.wrapped;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const n = (v: bigint | undefined, d = 18, max = 2) => (v === undefined ? undefined : fmt(v, d, max));
const big = (v: bigint | undefined) => (v === undefined ? undefined : Number(v / 10n ** 18n).toLocaleString("en-US"));

/** the timelock batch that hands the FeeDistributor to StoaBuyback (contracts/script/TokenPackageRobinhood.sol) */
function handoverOp(fees: Address, bb: Address): BatchOp {
  return {
    targets: [fees, bb],
    values: [0n, 0n],
    payloads: [
      encodeFunctionData({ abi: [{ type: "function", name: "transferOwnership", inputs: [{ type: "address" }], outputs: [], stateMutability: "nonpayable" }], args: [bb] }),
      encodeFunctionData({ abi: [{ type: "function", name: "acceptFeeOwnership", inputs: [], outputs: [], stateMutability: "nonpayable" }] }),
    ],
    predecessor: ZERO32,
    salt: ZERO32,
  };
}

function Cell({ label, v, sub }: { label: string; v?: string; sub?: string }) {
  return (
    <div className="panel pad">
      <div className="lbl">{label}</div>
      <div style={{ fontFamily: "var(--num)", fontSize: 24, marginTop: 6 }}>{v ?? <Sk w={110} />}</div>
      {sub && <p className="note" style={{ marginTop: 6 }}>{sub}</p>}
    </div>
  );
}

/** where $STOA stands on its Pons bonding curve; once it graduates the panel says so and links to the trade.
 *  Between graduation and the keeper's next run, the graduation pool is not in the router yet. */
function CurvePanel({ routable }: { routable?: boolean }) {
  const pub = usePublicClient({ chainId: net.chain.id });
  const { isConnected } = useAccount();
  const { open } = useWalletModal();
  const { writeContractAsync } = useChainWrite();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; hash?: Hash } | null>(null);
  const r = useReadContracts({
    contracts: [
      { address: STOA_CURVE, abi: curveAbi, functionName: "graduationThreshold", chainId: net.chain.id },
      { address: STOA_CURVE, abi: curveAbi, functionName: "graduated", chainId: net.chain.id },
      { address: STOA, abi: erc20Abi, functionName: "balanceOf", args: [STOA_CURVE], chainId: net.chain.id },
      { address: STOA, abi: erc20Abi, functionName: "balanceOf", args: [BURN], chainId: net.chain.id },
      { address: STOA, abi: erc20Abi, functionName: "totalSupply", chainId: net.chain.id },
    ] as const,
    query: { refetchInterval: 10_000 },
  });
  // ETH raised as the curve counts it for graduation (its balance can also hold fees)
  const eth = useQuery({ queryKey: ["stoa-curve-eth"], enabled: !!pub, refetchInterval: 10_000, queryFn: () => pub!.readContract({ address: STOA_CURVE, abi: curveAbi, functionName: "realQuoteReserve" }) });
  const thr = r.data?.[0]?.result as bigint | undefined, grad = r.data?.[1]?.result as boolean | undefined;
  const inCurve = r.data?.[2]?.result as bigint | undefined, burned = r.data?.[3]?.result as bigint | undefined, supply = r.data?.[4]?.result as bigint | undefined;
  const pct = grad ? 100 : eth.data !== undefined && thr ? Math.min(99.9, (Number(eth.data) / Number(thr)) * 100) : undefined;
  const circ = supply !== undefined && burned !== undefined && inCurve !== undefined ? supply - burned - inCurve : undefined;
  // graduated but not routable yet: the Pons graduation pool, if the adapter does not know it
  const pending = useQuery({
    queryKey: ["stoa-grad-pool", grad, routable],
    enabled: !!pub && !!C.v4 && grad === true && routable === false,
    refetchInterval: 30_000,
    queryFn: async (): Promise<PoolKey | null> => {
      const keys = (await findV4Pools(net, STOA)).filter((k) => k.hooks.toLowerCase() === PONS_HOOK && k.currency0 === zeroAddress);
      const known = (await pub!.readContract({ address: C.v4!, abi: v4AdapterAbi, functionName: "keysFor", args: [WETH, STOA] })) as PoolKey[];
      return keys.find((k) => !known.some((x) => sameKey(x, k))) ?? null;
    },
  });

  const ethTxt = (v?: bigint) => (v === undefined ? undefined : (Number(v) / 1e18).toFixed(3).replace(/\.?0+$/, ""));
  return (
    <div className="panel pad">
      <div className="rowx"><div className="lbl">$STOA ON ITS PONS BONDING CURVE</div><span className="chip live">{grad ? "Graduated" : pct === undefined ? "…" : `${pct.toFixed(1)}%`}</span></div>
      <div style={{ marginTop: 14, height: 12, borderRadius: 999, background: "#E6ECF5", overflow: "hidden" }} role="progressbar" aria-label="Bonding curve progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ? Math.round(pct) : 0}>
        <div style={{ width: `${pct ?? 0}%`, height: "100%", borderRadius: 999, background: "var(--accent)", transition: "width .6s ease" }} />
      </div>
      <p style={{ marginTop: 12 }}>
        {grad
          ? routable === false
            ? "$STOA has graduated to its Uniswap V4 pool. Stoa's keeper adds that pool to the router on its next run, usually within the hour."
            : "$STOA has graduated to its Uniswap V4 pool and routes on Stoa, so the weekly buyback buys it there. The pool's Pons hook takes 2.8% of each buy and sell."
          : routable
            ? <>{ethTxt(eth.data) ?? "…"} of {ethTxt(thr) ?? "…"} ETH raised. $STOA already trades on Stoa on its curve, so the weekly buyback can buy it now. At {ethTxt(thr) ?? "…"} ETH the curve graduates to a Uniswap V4 pool with locked liquidity, and Stoa routes that pool instead.</>
            : <>{ethTxt(eth.data) ?? "…"} of {ethTxt(thr) ?? "…"} ETH raised. At {ethTxt(thr) ?? "…"} ETH the curve graduates to a Uniswap V4 pool with locked liquidity. Stoa's keeper adds that pool to its router, and the weekly buyback starts buying $STOA.</>}
      </p>
      {grad && routable === false && pending.data && (
        <div className="notice" style={{ marginTop: 12, marginBottom: 0 }}>
          The graduation pool is not on Stoa&apos;s router yet. Stoa&apos;s keeper adds it, usually within the hour.
        </div>
      )}
      {msg && <p className="note" style={{ color: msg.ok ? undefined : "#B4532A" }}>{msg.text}{msg.hash && <> · <a href={txUrlOn(net, msg.hash)} target="_blank" rel="noopener noreferrer">View</a></>}</p>}
      <div className="rows">
        <span>Still on the curve</span><span>{big(inCurve) ?? "…"} STOA</span>
        <span>Circulating</span><span>{big(circ) ?? "…"} STOA</span>
      </div>
      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {grad || routable ? <Link className="cta" href={`/trade?chain=robinhood&buy=${STOA}`}>Trade $STOA on Stoa</Link> : <a className="cta" href={PONS_URL} target="_blank" rel="noopener noreferrer">Buy on Pons ↗</a>}
        <Link className="note" style={{ marginTop: 0 }} href="/docs/buy-stoa">How to buy</Link>
        <a className="note" style={{ marginTop: 0 }} href="/api/stoa/supply" target="_blank" rel="noopener noreferrer">Supply API</a>
      </div>
      <p className="note" style={{ marginTop: 10 }}>Track $STOA on <a href="https://www.coingecko.com/en/coins/stoa" target="_blank" rel="noopener noreferrer">CoinGecko</a> · <a href="https://www.geckoterminal.com/robinhood/tokens/0x13e6993417616de724f2b337d65063f229e96718" target="_blank" rel="noopener noreferrer">GeckoTerminal</a> · <a href="https://dexscreener.com/robinhood/0x3cf63de2530870232ec7075aec62ca539031c3c5a17dba5e016771238bf64180" target="_blank" rel="noopener noreferrer">DexScreener</a></p>
    </div>
  );
}

/** $STOA market cap since launch, from /api/stoa/price (rebuilt from the curve's trades), with today's point read
 *  live from the curve every 10 seconds. After graduation: market cap from Stoa's best quote, from the V4 pool. */
function PricePanel() {
  const pub = usePublicClient({ chainId: net.chain.id });
  const [range, setRange] = useState<"24h" | "all">("all");
  const q = useQuery({
    queryKey: ["stoa-price"],
    refetchInterval: 60_000,
    queryFn: async () => (await (await fetch("/api/stoa/price")).json()) as { points: { t: number; eth: number }[]; supply: number; ethUsd: number | null; trades: number; graduated?: boolean },
  });
  const now$ = useReadContracts({
    contracts: [
      { address: STOA_CURVE, abi: ponsCurveAbi, functionName: "quoteReserve", chainId: net.chain.id },
      { address: STOA_CURVE, abi: ponsCurveAbi, functionName: "tokenReserve", chainId: net.chain.id },
      { address: STOA_CURVE, abi: ponsCurveAbi, functionName: "graduated", chainId: net.chain.id },
    ] as const,
    query: { refetchInterval: 10_000 },
  });
  const [qr, tr, gradNow] = [now$.data?.[0]?.result, now$.data?.[1]?.result, now$.data?.[2]?.result] as [bigint | undefined, bigint | undefined, boolean | undefined];
  const graduated = gradNow === true || q.data?.graduated === true;
  // after graduation: what 0.001 ETH buys through Stoa's router, and ETH in USDG (not waiting on the history API)
  const v4 = useQuery({
    queryKey: ["stoa-v4-price"],
    enabled: graduated && !!pub && !!net.contracts.router,
    refetchInterval: 15_000,
    queryFn: async () => {
      const q = (to: Address, amt: bigint) => pub!.simulateContract({ address: net.contracts.router!, abi: routerAbi, functionName: "quote", args: [zeroAddress, to, amt] }).then((r) => r.result.amountOut).catch(() => 0n);
      const [tok, usdg] = await Promise.all([q(STOA, 10n ** 15n), q(USDG, 10n ** 16n)]);
      return { price: tok > 0n ? 1e15 / Number(tok) : null, ethUsd: usdg > 0n ? (Number(usdg) / 1e6) * 100 : null };
    },
  });
  const usd = v4.data?.ethUsd ?? q.data?.ethUsd ?? null, supply = q.data?.supply ?? 1e9;
  const mcap = (eth: number) => (usd ? eth * supply * usd : null);
  const fmtUsd = (v: number | null) => (v === null ? "—" : v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`);
  if (graduated) {
    const p = v4.data?.price ?? null;
    return (
      <div className="panel pad">
        <div className="lbl">$STOA MARKET CAP · UNISWAP V4</div>
        <div style={{ fontSize: 30, fontWeight: 700, marginTop: 10 }}>{v4.isLoading ? <Sk w={120} /> : p === null ? "—" : fmtUsd(mcap(p))}</div>
        <p className="note">
          {p === null
            ? "$STOA has graduated from its Pons curve. Its market cap shows here once its Uniswap V4 pool routes on Stoa."
            : <>From Stoa&apos;s best quote for a small buy (0.001 ETH), times the 1B supply, refreshed every 15 seconds. $STOA graduated from its Pons curve to Uniswap V4.</>}
        </p>
      </div>
    );
  }
  const hist = q.data?.points ?? [];
  const tip = qr !== undefined && tr ? { t: Math.floor(Date.now() / 1000), eth: Number(qr) / Number(tr) } : null;
  const all = tip && (!hist.length || tip.t > hist[hist.length - 1].t) ? [...hist, tip] : hist;
  const now = all.length ? all[all.length - 1].t : 0;
  const pts = range === "24h" ? all.filter((p) => p.t >= now - 86_400) : all;
  const last = all.length ? all[all.length - 1].eth : 0;
  const base = pts.length ? pts[0].eth : 0;
  const ch = base ? (last / base - 1) * 100 : 0;
  const W = 600, H = 150;
  let path = "", area = "";
  if (pts.length > 1) {
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t || t0 + 1;
    const lo = Math.min(...pts.map((p) => p.eth)), hi = Math.max(...pts.map((p) => p.eth));
    const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W;
    const y = (v: number) => H - 8 - ((v - lo) / Math.max(1e-30, hi - lo)) * (H - 16);
    path = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.eth).toFixed(1)}`).join("");
    area = `${path}L${W},${H}L0,${H}Z`;
  }
  return (
    <div className="panel pad">
      <div className="rowx">
        <div className="lbl">$STOA MARKET CAP · ON THE CURVE</div>
        <div style={{ display: "flex", gap: 6 }}>
          {(["24h", "all"] as const).map((r) => <button key={r} type="button" className="chip" style={{ cursor: "pointer", border: 0, opacity: range === r ? 1 : 0.55 }} onClick={() => setRange(r)}>{r === "all" ? "Since launch" : "24h"}</button>)}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 30, fontWeight: 700 }}>{q.isLoading ? <Sk w={120} /> : fmtUsd(mcap(last))}</span>
        {pts.length > 1 && <span style={{ fontFamily: "var(--num)", color: ch >= 0 ? "#1F8A4C" : "#B4532A" }}>{ch >= 0 ? "+" : ""}{ch.toFixed(1)}% {range === "all" ? "since launch" : "in 24h"}</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 150, marginTop: 10, display: "block" }} role="img" aria-label="$STOA market cap chart">
        <defs><linearGradient id="stoaArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#4C97F0" stopOpacity=".25" /><stop offset="1" stopColor="#4C97F0" stopOpacity="0" /></linearGradient></defs>
        {area && <path d={area} fill="url(#stoaArea)" />}
        {path && <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
      </svg>
      <p className="note">
        Rebuilt from {q.data?.trades ?? "…"} trades on the Pons curve: the curve&apos;s own reserves after each buy and sell, times the 1B supply, in USD at today&apos;s ETH price{usd ? ` ($${usd.toFixed(0)})` : ""}. The latest point is read live from the curve every 10 seconds.
      </p>
    </div>
  );
}

// Stoa's team account on fomo (fomo.family, username @StoaDex). fomo's team tag needs the team to hold at least 0.5% of supply
// there; the team bought 6.8M $STOA on the Pons curve for it on 15 Nov 2026 and keeps at least 0.5% while the tag is active.
const TEAM_WALLET = "0xfe6f7c6e2ad2c3594fe7fb61c28c4499bbb83bf0" as Address;

/** the next weekly buyback: buyback-robinhood.yml runs Mondays at 13:41 UTC (GitHub may start it a few minutes late) */
function nextBuyback(nowSec: number) {
  const d = new Date(nowSec * 1000);
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 13, 41) / 1000;
  const day = d.getUTCDay(); // 0 Sun, 1 Mon
  let add = (1 - day + 7) % 7;
  if (add === 0 && nowSec >= t) add = 7;
  return t + add * 86400;
}
const pctOf = (a?: bigint, b?: bigint) => (a === undefined || !b ? undefined : `${((Number(a) / Number(b)) * 100).toFixed(2)}%`);

/** One screen of $STOA facts, all read live from the chain: supply and burns, what holders have locked in Stoa's
 *  contracts, the team's share and the next buyback. */
/** 1e27 wei → "1B", 22.39M, 977.61M */
const cmp = (v?: bigint) => (v === undefined ? undefined : Number(v / 10n ** 18n).toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 }));
function Glance(q: { init: GlanceInit; supply?: bigint; burned?: bigint; buybackBurned?: bigint; bonded?: bigint; team?: bigint; launch?: bigint; waitingUsd?: number; live: boolean }) {
  // server-read numbers until the browser's own reads land
  const b = (v?: string) => (v === undefined ? undefined : BigInt(v));
  const p = { ...q, supply: q.supply ?? b(q.init?.supply), burned: q.burned ?? b(q.init?.burned), bonded: q.bonded ?? b(q.init?.bonds) };
  const r = useReadContracts({
    contracts: [
      { address: STOA, abi: erc20Abi, functionName: "balanceOf", args: [STOA_CURVE], chainId: net.chain.id },
      ...(C.spotlight ? [{ address: C.spotlight, abi: spotlightAbi, functionName: "totalLocked", chainId: net.chain.id }] : []),
      ...(C.cover ? [{ address: C.cover, abi: coverAbi, functionName: "totalLocked", chainId: net.chain.id }] : []),
    ] as never,
    query: { refetchInterval: 30_000 },
  });
  const now = useNow(60_000); // 0 until mounted, so the server and the first client render agree
  const res = (r.data ?? []) as { result?: unknown }[];
  const curve = (res[0]?.result as bigint | undefined) ?? b(q.init?.curve);
  const spot = C.spotlight ? ((res[1]?.result as bigint | undefined) ?? b(q.init?.spot)) : 0n;
  const cover = C.cover ? ((res[C.spotlight ? 2 : 1]?.result as bigint | undefined) ?? b(q.init?.cover)) : 0n;
  const circ = p.supply !== undefined && p.burned !== undefined && curve !== undefined ? p.supply - p.burned - curve : undefined;
  const locked = spot !== undefined && cover !== undefined && p.bonded !== undefined ? spot + cover + p.bonded : undefined;
  const teamAll = p.team !== undefined && p.launch !== undefined ? p.team + p.launch : undefined;
  const next = nextBuyback(now || Math.floor(Date.now() / 1000));
  const days = Math.floor((next - now) / 86400), hours = Math.floor(((next - now) % 86400) / 3600);
  const nextTxt = `${new Date(next * 1000).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}, 13:41 UTC`;
  return (
    <div className="panel pad">
      <div className="rowx"><div className="lbl">$STOA AT A GLANCE</div><span className="chip live">Live from the chain</span></div>
      <div className="glance">
        <div><span>Total supply</span><b>{cmp(p.supply) ?? <Sk w={70} />}</b><small>All of it started on the Pons bonding curve</small></div>
        <div><span>Burned</span><b>{cmp(p.burned) ?? <Sk w={70} />}</b><small>{pctOf(p.burned, p.supply) ?? "…"} of supply at the burn address{p.buybackBurned ? ` · ${cmp(p.buybackBurned)} by buybacks` : ""}</small></div>
        <div><span>Circulating</span><b>{cmp(circ) ?? <Sk w={70} />}</b><small>Supply minus burned{curve ? " and what the curve still holds" : ""}</small></div>
        <div><span>Locked by holders</span><b>{cmp(locked) ?? <Sk w={70} />}</b><small>{locked === undefined ? "…" : `${pctOf(locked, circ) ?? "…"} of circulating · Spotlight ${cmp(spot)}, Rug Cover ${cmp(cover)}, maker bonds ${cmp(p.bonded)}`}</small></div>
        <div><span>Team and launch wallets</span><b>{pctOf(teamAll, p.supply) ?? <Sk w={70} />}</b><small>of supply · no presale, no team allocation</small></div>
        <div><span>Next buyback</span><b>{p.live ? (now ? `${days}d ${hours}h` : "…") : "—"}</b><small>{p.live ? `${now ? nextTxt : "Mondays, 13:41 UTC"} · fees waiting ${p.waitingUsd === undefined ? "…" : p.waitingUsd < 0.01 ? "< $0.01" : p.waitingUsd < 1000 ? `$${p.waitingUsd.toFixed(2)}` : fmtUsd(p.waitingUsd)}` : "Starts once the buyback contract owns the fees"}</small></div>
      </div>
      <p className="note" style={{ marginTop: 12 }}>Every number is read from Robinhood Chain when you open this page. Details and contracts are below.</p>
    </div>
  );
}

const TEAM_BUY_TX = "0xbf4ca2f6bff0c6124ebafe82eaca82faf873248e3d027322182efb60f49d7bf3";
// the dev wallet that launched $STOA on Pons (the creator Pons records); it sent all 22.0M $STOA it received to 0x…dEaD
// in 12 transfers between 14 and 17 Nov 2026. Its live balance is shown next to the team wallet's.
const LAUNCH_WALLET = "0x8dac20c0fe1c59d337808f234921a89ee0c1346a" as Address;

export type GlanceInit = { supply: string; burned: string; curve: string; spot: string; cover: string; bonds: string } | null;

export default function TokenUtility({ init = null }: { init?: GlanceInit }) {
  const pub = usePublicClient({ chainId: net.chain.id });
  const live = !!(C.buyback && C.bonds && C.fees && C.timelock);
  const op = live ? handoverOp(C.fees!, C.buyback!) : null;
  const r = useReadContracts({
    contracts: live ? [
      { address: C.fees!, abi: feeStateAbi, functionName: "owner", chainId: net.chain.id },
      { address: C.buyback!, abi: buybackAbi, functionName: "totalBurned", chainId: net.chain.id },
      { address: STOA, abi: erc20Abi, functionName: "balanceOf", args: [BURN], chainId: net.chain.id },
      { address: C.fees!, abi: feeStateAbi, functionName: "protocolAccrued", args: [USDG], chainId: net.chain.id },
      { address: C.fees!, abi: feeStateAbi, functionName: "protocolAccrued", args: [WETH], chainId: net.chain.id },
      { address: C.timelock!, abi: timelockBatchAbi, functionName: "getTimestamp", args: [opId(op!)], chainId: net.chain.id },
      { address: C.bonds!, abi: bondAbi, functionName: "totalBonded", chainId: net.chain.id },
      { address: C.bonds!, abi: bondAbi, functionName: "totalSlashed", chainId: net.chain.id },
      { address: STOA, abi: erc20Abi, functionName: "totalSupply", chainId: net.chain.id },
      { address: STOA, abi: erc20Abi, functionName: "balanceOf", args: [TEAM_WALLET], chainId: net.chain.id },
      { address: STOA, abi: erc20Abi, functionName: "balanceOf", args: [LAUNCH_WALLET], chainId: net.chain.id },
    ] as const : [],
    query: { enabled: live, refetchInterval: 30_000 },
  });
  const v = (i: number) => r.data?.[i]?.result as bigint | string | undefined;
  const feesOwner = v(0) as string | undefined;
  const active = !!feesOwner && !!C.buyback && feesOwner.toLowerCase() === C.buyback.toLowerCase();
  const burnedBuyback = v(1) as bigint | undefined, burnedAll = v(2) as bigint | undefined;
  const accU = v(3) as bigint | undefined, accW = v(4) as bigint | undefined, ts = v(5) as bigint | undefined;
  const bonded = v(6) as bigint | undefined, slashed = v(7) as bigint | undefined, supply = v(8) as bigint | undefined;
  const team = v(9) as bigint | undefined, launchBal = v(10) as bigint | undefined;
  const px = usePrices(net, [net.tokens[1], net.tokens[2]]);
  const waitingUsd = accU !== undefined && accW !== undefined ? Number(accU) / 1e6 + (Number(accW) / 1e18) * (px(net.tokens[1])?.usd ?? 0) : undefined;

  // is there a route to $STOA yet (it trades on its Pons bonding curve until it graduates to Uniswap V4)
  const route = useQuery({
    queryKey: ["stoa-route"],
    enabled: !!pub && !!C.router,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { result } = await pub!.simulateContract({ address: C.router!, abi: routerAbi, functionName: "quote", args: [USDG, STOA, 10n ** 6n] });
      return result.amountOut > 0n;
    },
  });
  const history = useQuery({
    queryKey: ["buybacks", C.buyback],
    enabled: !!C.buyback,
    refetchInterval: 120_000,
    queryFn: async () => {
      const logs = await getLogsOn(net, { address: C.buyback!, event: buybackAbi[2], fromBlock: net.deployBlock });
      return logs.reverse().slice(0, 10).map((l) => ({ hash: l.transactionHash, token: l.args.token as Address, amountIn: l.args.amountIn as bigint, burned: l.args.stoaBurned as bigint }));
    },
  });
  const when = (t: bigint) => new Date(Number(t) * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const status = !live ? "Deploying" : feesOwner === undefined ? undefined : active ? "Active" : ts && ts > 1n ? `Starts ${when(ts)}` : "Queued in the timelock";
  const symOf = (a: Address) => (a.toLowerCase() === USDG.toLowerCase() ? "USDG" : a.toLowerCase() === WETH.toLowerCase() ? "WETH" : a.toLowerCase() === STOA.toLowerCase() ? "STOA" : short(a));
  const decOf = (a: Address) => (a.toLowerCase() === USDG.toLowerCase() ? 6 : 18);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Glance init={init} supply={supply} burned={burnedAll} buybackBurned={burnedBuyback} bonded={bonded} team={team} launch={launchBal} waitingUsd={waitingUsd} live={live && active} />
      <CurvePanel routable={route.data} />
      <PricePanel />
      {/* 1. buyback & burn */}
      <div className="panel pad">
        <div className="rowx"><div className="lbl">1 · PROTOCOL FEES BUY AND BURN $STOA</div><span className="chip live">{status ?? "…"}</span></div>
        <p style={{ marginTop: 10 }}>
          Every swap through Stoa on Robinhood Chain pays a 2 bps protocol fee. Every week those fees are swapped into $STOA through the Stoa router and burned in the same transaction. The fee contract is owned by a buyback contract that cannot send fees anywhere else.
        </p>
        {live && !active && <p className="note">The fee contract moves to the buyback contract through the 48-hour timelock{ts && ts > 1n ? `: from ${when(ts)}` : ""}. Until then fees keep accruing and are used in the first run.</p>}
        {route.data === false && <p className="note">$STOA still trades on its Pons bonding curve, so the router has no route to it yet. Fees wait and are used once $STOA graduates to Uniswap V4.</p>}
      </div>
      <div className="grid3 sgrid">
        <Cell label="BURNED BY BUYBACKS" v={live ? (burnedBuyback === undefined ? undefined : `${big(burnedBuyback)} STOA`) : "—"} sub="Weekly, every Monday" />
        <Cell label="FEES WAITING" v={live ? (waitingUsd === undefined ? undefined : waitingUsd < 0.01 ? "< $0.01" : fmtUsd(waitingUsd)) : "—"} sub={live && accU !== undefined && accW !== undefined ? `${n(accU, 6, 4)} USDG · ${n(accW, 18, 6)} WETH` : undefined} />
        <Cell label="$STOA BURNED, ALL SOURCES" v={burnedAll === undefined ? undefined : `${big(burnedAll)}`} sub={supply ? `${((Number(burnedAll ?? 0n) / Number(supply)) * 100).toFixed(2)}% of supply at the burn address` : undefined} />
      </div>
      {(history.data?.length ?? 0) > 0 && (
        <div className="panel" style={{ overflow: "hidden" }}>
          <table className="tbl">
            <thead><tr><th>FEES USED</th><th>$STOA BURNED</th><th /></tr></thead>
            <tbody>{history.data!.map((h) => (
              <tr key={h.hash}><td style={{ fontFamily: "var(--num)" }}>{fmt(h.amountIn, decOf(h.token), 6)} {symOf(h.token)}</td><td style={{ fontFamily: "var(--num)" }}>{fmt(h.burned, 18, 2)}</td><td style={{ textAlign: "right" }}><a href={txUrlOn(net, h.hash)} target="_blank" rel="noopener noreferrer">View</a></td></tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {/* 2. maker bonds */}
      <div className="panel pad">
        <div className="rowx"><div className="lbl">2 · MAKERS BOND $STOA</div><span className="chip live">{live ? "Live" : "Deploying"}</span></div>
        <p style={{ marginTop: 10 }}>
          Stoa maker pools on Robinhood Chain are quoted by makers who bond $STOA. A maker can quote only while its bond is at least the pool&apos;s minimum. A maker that posts abusive quotes gets slashed, and slashed $STOA is burned. Withdrawing a bond takes 3 days, longer than the 48-hour timelock, so a slash always lands first.
        </p>
      </div>
      <div className="grid3 sgrid">
        <Cell label="BONDED BY MAKERS" v={live ? (bonded === undefined ? undefined : `${big(bonded)} STOA`) : "—"} />
        <Cell label="SLASHED AND BURNED" v={live ? (slashed === undefined ? undefined : `${big(slashed)} STOA`) : "—"} />
        <Cell label="UNBONDING DELAY" v="3 days" sub="Longer than the 48h timelock" />
      </div>
      {live && <BondPanel />}

      <div className="panel pad">
        <div className="rowx"><div className="lbl">3 · HOLDERS VOTE IN SPOTLIGHT</div><span className="chip live">Week 1 opens 23 Nov</span></div>
        <p style={{ marginTop: 10 }}>
          Every week projects bid ETH for three sponsored slots on Stoa. Holders lock $STOA and vote: the three largest bids with at least 1M $STOA of votes win, 90% of each goes to the holders who voted for it, and 10% buys $STOA and burns it. Losing bids are refunded.
        </p>
        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Link className="cta" href="/spotlight">Open Spotlight</Link>
          <Link className="note" style={{ marginTop: 0 }} href="/docs/spotlight">Rules and risks</Link>
        </div>
      </div>

      <div className="panel pad">
        <div className="rowx"><div className="lbl">4 · HOLDERS BACK RUG COVER</div><CoverStatus /></div>
        <p style={{ marginTop: 10 }}>
          Pons creators bond ETH behind a promise not to sell or move the tokens in their wallet, and pay a fee. Holders who lock $STOA as backers receive 90% of those fees and of bonds forfeited in a breach, in ETH, over 7 days. Locked $STOA never pays a claim. Every buyer premium buys $STOA and burns it.
        </p>
        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Link className="cta" href="/cover">Open Rug Cover</Link>
          <Link className="note" style={{ marginTop: 0 }} href="/docs/rug-cover">Rules and risks</Link>
        </div>
      </div>

      <div className="panel pad">
        <div className="rowx"><div className="lbl">WHO HOLDS $STOA</div>{team !== undefined && supply ? <span className="chip live">Team {((Number(team) / Number(supply)) * 100).toFixed(2)}% of supply</span> : null}</div>
        <p style={{ marginTop: 10 }}>
          No presale and no team allocation: all 1B $STOA started on the Pons bonding curve.
        </p>
        <ul className="list" style={{ marginTop: 8 }}>
          <li>Team wallet (fomo, @StoaDex) <b>{team === undefined ? "…" : `${big(team)} $STOA`}, bought on the curve</b></li>
          <li>Launch wallet (the dev wallet that launched $STOA on Pons) <b>{launchBal === undefined ? "…" : `${big(launchBal)} $STOA`} today; it burned the 22.0M it received</b></li>
        </ul>
        <p style={{ marginTop: 10 }}>
          fomo&apos;s team tag requires the team to hold at least 0.5% of supply on its fomo account, so the team bought 6.8M $STOA on the Pons curve on 15 November 2026 (<a href={txUrlOn(net, TEAM_BUY_TX)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>transaction</a>) and keeps at least 0.5% there while the tag is active.
        </p>
        <p className="note">Team: <a href={addressUrlOn(net, TEAM_WALLET)} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "var(--mono)" }}>{TEAM_WALLET}</a><br />Launch: <a href={addressUrlOn(net, LAUNCH_WALLET)} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "var(--mono)" }}>{LAUNCH_WALLET}</a></p>
      </div>

      <div className="panel pad">
        <div className="lbl">WHAT $STOA IS NOT</div>
        <ul className="list">
          <li>A share of fees <b>Fees burn $STOA; holders are not paid from fees</b></li>
          <li>A promised yield <b>Spotlight pays voters only from projects&apos; bids; Rug Cover backers only from creators</b></li>
          <li>Audited <b>Contracts are verified and had an independent security review (HEY Research Lab), not an audit</b></li>
        </ul>
        <p className="note">Contracts: <a href={addressUrlOn(net, C.buyback ?? zeroAddress)} target="_blank" rel="noopener noreferrer">StoaBuyback</a> · <a href={addressUrlOn(net, C.bonds ?? zeroAddress)} target="_blank" rel="noopener noreferrer">BondRegistry</a> · <a href={addressUrlOn(net, STOA)} target="_blank" rel="noopener noreferrer">$STOA</a>. How it works in detail: <Link href="/docs/token">docs</Link>. Who controls each contract and what waits in the 48-hour timelock: <Link href="/security">security status</Link>.</p>
      </div>
    </div>
  );
}

function BondPanel() {
  const { address, isConnected } = useAccount();
  const { open } = useWalletModal();
  const pub = usePublicClient({ chainId: net.chain.id });
  const { writeContractAsync } = useChainWrite();
  const [amt, setAmt] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; hash?: Hash } | null>(null);
  const me = address ?? zeroAddress;
  const r = useReadContracts({
    contracts: [
      { address: STOA, abi: erc20Abi, functionName: "balanceOf", args: [me], chainId: net.chain.id },
      { address: STOA, abi: erc20Abi, functionName: "allowance", args: [me, C.bonds!], chainId: net.chain.id },
      { address: C.bonds!, abi: bondAbi, functionName: "bonds", args: [me], chainId: net.chain.id },
    ] as const,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });
  const pools = useQuery({
    queryKey: ["bond-pools", C.bonds],
    refetchInterval: 120_000,
    queryFn: async () => (await getLogsOn(net, { address: C.bonds!, event: bondAbi.find((x) => x.type === "event" && x.name === "PoolListed") as never, fromBlock: net.deployBlock })).length,
  });
  const bal = r.data?.[0]?.result as bigint | undefined, allow = r.data?.[1]?.result as bigint | undefined;
  const b = r.data?.[2]?.result as readonly [bigint, bigint, bigint] | undefined;
  const [active, pending, unlockAt] = b ?? [0n, 0n, 0n];
  let raw: bigint | undefined;
  try { raw = amt ? parseUnits(amt, 18) : undefined; } catch { raw = undefined; }
  const now = BigInt(Math.floor(Date.now() / 1000));
  const open_ = (pools.data ?? 0) > 0;

  async function send(label: string, fn: () => Promise<Hash>) {
    if (!pub) return;
    setBusy(label); setMsg(null);
    try {
      const hash = await fn();
      const rc = await pub.waitForTransactionReceipt({ hash });
      if (rc.status !== "success") throw new Error("Transaction reverted");
      setMsg({ ok: true, text: `${label}: confirmed`, hash }); setAmt(""); void r.refetch();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof BaseError ? e.shortMessage : (e as Error).message });
    } finally { setBusy(null); }
  }
  const w = (functionName: "bond" | "requestUnbond" | "withdrawUnbonded", args: readonly [bigint] | readonly []) =>
    writeContractAsync({ address: C.bonds!, abi: bondAbi, functionName: functionName as never, args: args as never, chainId: net.chain.id });

  if (!isConnected) return <div className="panel pad"><div className="lbl">YOUR BOND</div><p className="note">Connect a wallet to bond or withdraw $STOA.</p><button className="cta" type="button" onClick={open}>Connect wallet</button></div>;
  const btn = (label: string, on: () => void, disabled: boolean) => (
    <button className="ghost" type="button" disabled={!!busy || disabled} onClick={on} style={{ marginRight: 8, marginTop: 8 }}>{busy === label ? `${label}…` : label}</button>
  );
  return (
    <div className="panel pad">
      <div className="lbl">YOUR BOND</div>
      <ul className="list">
        <li>Wallet <b>{n(bal) ?? "—"} STOA</b></li>
        <li>Bonded <b>{n(active)} STOA</b></li>
        <li>Unbonding <b>{n(pending)} STOA{pending > 0n ? ` · ${unlockAt <= now ? "ready" : `from ${new Date(Number(unlockAt) * 1000).toLocaleString()}`}` : ""}</b></li>
      </ul>
      <input className="inp" inputMode="decimal" placeholder="Amount of $STOA" value={amt} onChange={(e) => setAmt(e.target.value.replace(/,/g, ".").replace(/[^0-9.]/g, ""))} />
      {open_ && raw !== undefined && raw > 0n && (allow ?? 0n) < raw
        ? btn("Approve $STOA", () => send("Approve $STOA", () => writeContractAsync({ address: STOA, abi: erc20Abi, functionName: "approve", args: [C.bonds!, raw!], chainId: net.chain.id })), false)
        : btn("Bond", () => send("Bond", () => w("bond", [raw!])), !open_ || !raw || raw > (bal ?? 0n))}
      {btn("Request unbond", () => send("Request unbond", () => w("requestUnbond", [raw!])), !raw || raw > active)}
      {btn("Withdraw", () => send("Withdraw", () => w("withdrawUnbonded", [])), pending === 0n || unlockAt > now)}
      {msg && <div className={msg.ok ? "ok" : "err"} style={{ marginTop: 10 }}>{msg.text}{msg.hash && <> · <a href={txUrlOn(net, msg.hash)} target="_blank" rel="noopener noreferrer">View</a></>}</div>}
      <p className="note">
        {open_
          ? "Bond only if you run, or are about to run, an approved maker for a Stoa pool. A bond earns nothing by itself and can be slashed."
          : "Bonding opens with the first Robinhood maker pool. Bond only if you will run a maker: a bond earns nothing by itself and can be slashed. "}
        {!open_ && <Link href="/curators">Apply to run a pool</Link>}
      </p>
    </div>
  );
}

/** live or not yet: Rug Cover switches on once its contract's code is at its CREATE2 address */
function CoverStatus() {
  const live = useCoverLive();
  return <span className="chip live">{live ? "Live" : "Deploying"}</span>;
}
