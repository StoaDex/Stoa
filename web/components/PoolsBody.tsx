"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { encodeAbiParameters, keccak256, parseAbi, zeroAddress, type Address } from "viem";
import { usePublicClient } from "wagmi";
import { PageHead, Pair, Sk } from "./ui";
import { useNet } from "./Providers";
import PoolDepth from "./PoolDepth";
import RouterStats from "./RouterStats";
import { v4AdapterAbi } from "@/lib/abi";
import type { Net } from "@/lib/networks";

/** Pools page. Elysium: the maker-quoted pool. Robinhood Chain: the most liquid pool of each listed token among the
 *  pools the router actually checks (Uniswap V2 and V3 from the official factories, Uniswap V4 pools registered in
 *  Stoa's adapter), with liquidity and volume from DexScreener. */
export default function PoolsBody() {
  const net = useNet();
  return net.key === "robinhood" ? <RobinhoodPools net={net} /> : <ElysiumPools />;
}

function ElysiumPools() {
  const net = useNet();
  const live = !!net.contracts.pool;
  return (
    <>
      <PageHead eyebrow="POOLS" title="Every pool is a column" action={<Link className="cta" href="/curators">Run a pool</Link>}>
        Each pool is priced by its own makers. When no maker quotes, swaps still fill on Uniswap, Aero, Ramses or Liquidity Book through the router.
      </PageHead>
      <RouterStats />
      <div className="panel" style={{ overflow: "hidden", marginBottom: 20 }}>
        <table className="tbl">
          <thead><tr><th>POOL</th><th className="hm">PRICING</th><th className="hm">FEE</th><th className="hm">PER-SWAP CAP</th><th>STATUS</th><th /></tr></thead>
          <tbody>
            <tr>
              <td><Pair /></td><td className="hm">Maker-quoted</td><td className="hm" style={{ fontFamily: "var(--num)" }}>2 bps</td><td className="hm" style={{ fontFamily: "var(--num)" }}>$500</td>
              <td><span className="chip live">{live ? "Deployed" : "Opening soon"}</span></td>
              <td style={{ textAlign: "right" }}><Link href="/trade?chain=elysium" className="go" style={{ margin: 0 }}>Trade</Link></td>
            </tr>
            <tr><td colSpan={6} style={{ color: "var(--muted)", fontSize: 13.5 }}>Want your token here? Curators can apply to run a pool. <Link href="/curators">How it works</Link></td></tr>
          </tbody>
        </table>
      </div>
      <PoolDepth />
    </>
  );
}

// ---------------------------------------------------------------- Robinhood Chain
const UNI_V2_FACTORY = "0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f";
const UNI_V3_FACTORY = "0x1f7d7550b1b028f7571e69a784071f0205fd2efa";
const DYNAMIC = 0x800000;
const poolAbi = parseAbi(["function factory() view returns (address)", "function fee() view returns (uint24)", "function tickSpacing() view returns (int24)"]);
const isAdapterAbi = parseAbi(["function isAdapter(address) view returns (bool)"]);
const keyParams = [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }] as const;

type DsPair = {
  dexId: string; labels?: string[]; pairAddress: string;
  baseToken: { address: string; symbol: string }; quoteToken: { address: string; symbol: string };
  liquidity?: { usd?: number }; volume?: { h24?: number }; info?: { imageUrl?: string };
};
type Row = { id: string; venue: string; fee: string; hooked: boolean; base: Side; quote: Side; liq: number; vol: number };
type Side = { address: string; symbol: string; logo?: string };

const usd = (v: number) =>
  v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`;
// fee in hundredths of a bip: 3000 -> 0.3%, 112 -> 0.0112% (Aero and Ramses fees are set per pool and can be tiny)
const feeText = (f: number) => (f === DYNAMIC ? "dynamic" : `${+(f / 10_000).toFixed(f < 1000 ? 4 : 2)}%`);

/** Venues added to the router since launch (Aero, Ramses): only those the router uses right now. */
async function liveNewVenues(net: Net, pub: NonNullable<ReturnType<typeof usePublicClient>>) {
  if (!net.contracts.router || !net.newVenues.length) return [];
  const r = await pub.multicall({ allowFailure: true, contracts: net.newVenues.map((v) => ({ address: net.contracts.router!, abi: isAdapterAbi, functionName: "isAdapter" as const, args: [v.address] as const })) });
  return net.newVenues.filter((_, i) => r[i]?.result === true);
}

async function loadPools(net: Net, pub: NonNullable<ReturnType<typeof usePublicClient>>): Promise<{ rows: Row[]; venues: string[] }> {
  const W = net.wrapped.toLowerCase();
  const extra = await liveNewVenues(net, pub);
  const asks = net.tokens.filter((t) => t.address !== zeroAddress).map((t) => t.address.toLowerCase()).slice(0, 60);
  const pairs: DsPair[] = [];
  for (let i = 0; i < asks.length; i += 30) {
    const r = await fetch(`https://api.dexscreener.com/tokens/v1/${net.dexscreener}/${asks.slice(i, i + 30).join(",")}`);
    if (r.ok) pairs.push(...((await r.json()) as DsPair[]));
  }
  // the wrapped native and the stablecoin trade on many venues: list all their pools, not only the top one
  for (const t of [net.wrapped, net.stable]) {
    const r = await fetch(`https://api.dexscreener.com/token-pairs/v1/${net.dexscreener}/${t}`);
    if (r.ok) pairs.push(...((await r.json()) as DsPair[]));
  }
  const seen = new Set<string>();
  const cand = pairs.filter((p) => {
    const id = p.pairAddress.toLowerCase();
    const v = p.labels?.[0];
    const uni = p.dexId === "uniswap" && (v === "v2" || v === "v3" || v === "v4");
    if (seen.has(id) || !(uni || extra.some((x) => x.dexId === p.dexId)) || (p.liquidity?.usd ?? 0) < 1_000) return false;
    seen.add(id);
    return true;
  });

  // on-chain check that the router really uses each pool
  const isV4 = (p: DsPair) => p.dexId === "uniswap" && p.labels?.[0] === "v4";
  const pooled = cand.filter((p) => !isV4(p));
  const v4 = cand.filter(isV4);
  const canon = (a: string) => (a.toLowerCase() === zeroAddress ? W : a.toLowerCase()) as Address;
  const call = (fn: "factory" | "fee" | "tickSpacing") =>
    pub.multicall({ allowFailure: true, contracts: pooled.map((p) => ({ address: p.pairAddress as Address, abi: poolAbi, functionName: fn })) });
  const [facts, fees, spacings, keys] = await Promise.all([
    call("factory"), call("fee"), call("tickSpacing"),
    net.contracts.v4
      ? pub.multicall({ allowFailure: true, contracts: v4.map((p) => ({ address: net.contracts.v4!, abi: v4AdapterAbi, functionName: "keysFor" as const, args: [canon(p.baseToken.address), canon(p.quoteToken.address)] as const })) })
      : Promise.resolve([]),
  ]);

  const known = new Map(net.tokens.map((t) => [t.address.toLowerCase(), t]));
  const side = (t: { address: string; symbol: string }, img?: string): Side => {
    const k = known.get(t.address.toLowerCase());
    return { address: t.address, symbol: k?.symbol ?? t.symbol, logo: k?.logo ?? img };
  };
  const rows: Row[] = [];
  const row = (p: DsPair, venue: string, fee: number, hooked = false) =>
    rows.push({ id: p.pairAddress, venue, fee: feeText(fee), hooked, base: side(p.baseToken, p.info?.imageUrl), quote: side(p.quoteToken), liq: p.liquidity?.usd ?? 0, vol: p.volume?.h24 ?? 0 });
  pooled.forEach((p, i) => {
    const f = (facts[i]?.result as string | undefined)?.toLowerCase();
    const fee = Number(fees[i]?.result ?? 0);
    if (!f) return;
    if (p.dexId === "uniswap") {
      const v2 = p.labels![0] === "v2";
      if (f !== (v2 ? UNI_V2_FACTORY : UNI_V3_FACTORY)) return;
      if (!v2 && ![100, 500, 3000, 10000].includes(fee)) return; // the V3 adapter checks the four standard tiers
      return row(p, v2 ? "Uniswap V2" : "Uniswap V3", v2 ? 3000 : fee);
    }
    // Aero / Ramses: the adapter's own factory and one of the tick spacings it checks
    const v = extra.find((x) => x.dexId === p.dexId);
    const ts = Number(spacings[i]?.result ?? 0);
    if (v && f === v.factory && v.spacings.includes(ts)) row(p, v.name, fee);
  });
  v4.forEach((p, i) => {
    const list = (keys[i]?.result ?? []) as readonly { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address }[];
    const k = list.find((k) => keccak256(encodeAbiParameters(keyParams, [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks])).toLowerCase() === p.pairAddress.toLowerCase());
    if (k) row(p, "Uniswap V4", k.fee, k.hooks !== zeroAddress);
  });
  return { rows: rows.sort((a, b) => b.liq - a.liq), venues: extra.map((x) => x.name) };
}

function Logo({ s }: { s: Side }) {
  const src = s.address.toLowerCase() === zeroAddress ? "/tokens/eth.svg" : s.logo;
  // eslint-disable-next-line @next/next/no-img-element
  if (src) return <img className="ti img" src={src} alt="" width={26} height={26} loading="lazy" />;
  return <span className="ti" style={{ background: "linear-gradient(135deg,#6B7482,#A9B2C0)" }}>{s.symbol[0] ?? "?"}</span>;
}

function RobinhoodPools({ net }: { net: Net }) {
  const pub = usePublicClient({ chainId: net.chain.id });
  const q = useQuery({
    queryKey: ["pools", net.key],
    queryFn: () => loadPools(net, pub!),
    enabled: !!pub,
    refetchInterval: 60_000,
    staleTime: 50_000,
  });
  const [all, setAll] = useState(false);
  const rows = q.data?.rows ?? [];
  const added = q.data?.venues ?? [];
  const venueText = added.length ? `Uniswap V2, V3 and V4, ${added.join(" and ")}` : "Uniswap V2, V3 and V4";
  const shown = all ? rows : rows.slice(0, 20);
  const tradeHref = (r: Row) => {
    const t = (s: Side) => (s.address.toLowerCase() === zeroAddress ? "ETH" : s.address);
    return `/trade?chain=robinhood&sell=${t(r.quote)}&buy=${t(r.base)}`;
  };
  return (
    <>
      <PageHead eyebrow="POOLS · ROBINHOOD CHAIN" title="The pools behind each swap" action={<Link className="cta" href="/trade?chain=robinhood">Trade</Link>}>
        On Robinhood Chain the router checks every {venueText} pool it knows for your pair and fills on the one that pays the most. Below are the most liquid of those pools.
      </PageHead>
      <RouterStats />
      <div className="panel" style={{ overflow: "hidden", marginBottom: 20 }}>
        <table className="tbl">
          <thead><tr><th>POOL</th><th className="hm">VENUE</th><th className="hm">FEE</th><th>LIQUIDITY</th><th className="hm">VOLUME · 24H</th><th /></tr></thead>
          <tbody>
            {q.isLoading || !pub ? (
              [0, 1, 2, 3, 4].map((i) => (
                <tr key={i}><td><Sk w={140} /></td><td className="hm"><Sk w={90} /></td><td className="hm"><Sk w={50} /></td><td><Sk w={70} /></td><td className="hm"><Sk w={70} /></td><td /></tr>
              ))
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} style={{ color: "var(--muted)", fontSize: 13.5 }}>{q.isError ? "Could not load pools right now. Try again in a minute." : "No pools found."}</td></tr>
            ) : (
              shown.map((r) => (
                <tr key={r.id}>
                  <td><div className="pair"><Logo s={r.base} /><Logo s={r.quote} />{r.base.symbol} / {r.quote.symbol}</div></td>
                  <td className="hm">{r.venue}{r.hooked ? " · hook" : ""}</td>
                  <td className="hm" style={{ fontFamily: "var(--num)" }}>{r.fee}</td>
                  <td style={{ fontFamily: "var(--num)" }}>{usd(r.liq)}</td>
                  <td className="hm" style={{ fontFamily: "var(--num)" }}>{usd(r.vol)}</td>
                  <td style={{ textAlign: "right" }}><Link href={tradeHref(r)} className="go" style={{ margin: 0 }}>Trade</Link></td>
                </tr>
              ))
            )}
            {rows.length > shown.length && (
              <tr><td colSpan={6} style={{ textAlign: "center" }}><button type="button" className="go" style={{ margin: 0, background: "none", border: 0, cursor: "pointer", color: "var(--accent)" }} onClick={() => setAll(true)}>Show all {rows.length} pools</button></td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="note">
        Liquidity and volume come from DexScreener and are for display. Every swap uses the on-chain quote at the moment you trade.
        V4 pools are listed once Stoa&apos;s keeper registers them in its adapter: it adds the most traded pools every day and Pons graduation pools within the hour.
        Maker-quoted pools are on Elysium only for now.
      </p>
    </>
  );
}
