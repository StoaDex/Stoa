import "server-only";
import { createPublicClient, erc20Abi, http, parseAbi, type Address } from "viem";
import { NETS, type Net } from "./networks";
import { routedEvent } from "./abi";
import { NATIVE } from "./tokens";
import { srv } from "@/lib/serverRpc";

/** Swaps routed through Stoa on every chain, read from the routers' Routed events: one event per settled swap
 *  (a failed swap reverts and emits nothing). Each swap counts once, valued on its stablecoin side when it has one,
 *  else on its gas-token side at the router's current quote, else at DexScreener's current price of either token.
 *  Same counting as the volume adapter in the repo. Server only: served from /api/stats behind a 5-minute CDN cache. */

export interface StatSwap {
  chain: Net["key"]; hash: string; time: number;
  tokenIn: string; tokenOut: string; symIn: string; symOut: string;
  amountIn: number; amountOut: number; usd: number | null;
  /** the referrer the swap paid (zero address when none) */
  referrer?: string;
  /** who received the output (the trader; a limit order or helper contract still pays out to its owner) */
  trader?: string;
}
export interface ChainStats {
  key: Net["key"]; name: string; explorer: string; router: string;
  swaps: number; swaps24h: number; usdAll: number; usd7d: number; usd24h: number; first: number | null; unpriced: number; ok: boolean;
}
export interface DayStats { date: string; chains: Record<string, { swaps: number; usd: number }> }
export interface ReferrerStats {
  address: string; chains: string[]; swaps: number; usd: number; usd7d: number;
  /** distinct wallets (not the referrer itself) that swapped $1 or more through it this UTC month: the integrator bonus test */
  walletsMonth: number;
}
export interface TraderStats { address: string; swaps: number; usd: number }
export interface TopToken { chain: Net["key"]; token: string; symbol: string; buys: number; usd: number }
export interface RouterStats {
  updated: number; chains: ChainStats[]; days: DayStats[]; recent: StatSwap[];
  /** the largest priced swaps of the last 24 hours (top 10) */
  largest24h: StatSwap[];
  /** tokens bought most through Stoa in the last 24 hours, by dollar value, the gas token and stablecoins left out */
  topBought24h: TopToken[];
  /** referrers ranked by the volume of the swaps they referred (top 25) */
  referrers: ReferrerStats[];
  /** wallets ranked by the dollar value they swapped this UTC week (from Monday 00:00 UTC), top 10. No prizes. */
  traders: { weekStart: number; list: TraderStats[] };
  total: { swaps: number; usdAll: number; usd7d: number; usd24h: number };
}

const ua = { fetchOptions: { headers: { "user-agent": "curl/8.5.0" } }, timeout: 20_000 };
const quoteAbi = parseAbi(["function quote(address,address,uint256) returns ((uint256 amountOut, address mid, (address venue, bool isPool) leg1, (address venue, bool isPool) leg2))"]);
const lc = (a: string) => a.toLowerCase();

async function dexPrices(net: Net, addrs: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (!addrs.length) return out;
  try {
    const r = await fetch(`https://api.dexscreener.com/tokens/v1/${net.dexscreener}/${addrs.slice(0, 30).join(",")}`, { signal: AbortSignal.timeout(8_000) });
    if (!r.ok) return out;
    const pairs = (await r.json()) as { baseToken: { address: string }; priceUsd?: string; liquidity?: { usd?: number } }[];
    const liq: Record<string, number> = {};
    for (const p of pairs) {
      const a = lc(p.baseToken.address), usd = Number(p.priceUsd), l = p.liquidity?.usd ?? 0;
      if (usd > 0 && isFinite(usd) && addrs.includes(a) && (liq[a] ?? -1) < l) { liq[a] = l; out[a] = usd; }
    }
  } catch { /* unpriced */ }
  return out;
}

async function chainSwaps(net: Net): Promise<{ swaps: StatSwap[]; ok: boolean }> {
  const router = net.contracts.router;
  if (!router || !net.deployed) return { swaps: [], ok: true };
  const c = createPublicClient({ chain: net.chain, transport: http(srv(net.logsRpc), { ...ua, batch: { batchSize: 100 } }) });
  const head = await c.getBlockNumber();
  const span = net.logsSpan === 0n ? head : net.logsSpan;
  const logs: Awaited<ReturnType<typeof c.getLogs<typeof routedEvent>>> = [];
  for (let a = net.deployBlock; a <= head; a += span) {
    const z = a + span - 1n < head ? a + span - 1n : head;
    logs.push(...(await c.getLogs({ address: router, event: routedEvent, fromBlock: a, toBlock: z })));
  }

  // timestamps: some RPCs put blockTimestamp on each log (Elysium), others leave it 0 (Robinhood Chain)
  const stamp = (l: (typeof logs)[number]) => Number((l as unknown as { blockTimestamp?: string | bigint }).blockTimestamp ?? 0);
  const missing = [...new Set(logs.filter((l) => !stamp(l)).map((l) => l.blockNumber!))];
  const times = new Map<bigint, number>();
  await Promise.all(missing.map(async (b) => times.set(b, Number((await c.getBlock({ blockNumber: b })).timestamp))));

  // symbols and decimals: the app's token list, then the token contracts
  const meta = new Map<string, { symbol: string; decimals: number }>(net.tokens.map((t) => [lc(t.address), { symbol: t.symbol, decimals: t.decimals }]));
  meta.set(lc(NATIVE), { symbol: net.gas, decimals: 18 });
  const unknown = [...new Set(logs.flatMap((l) => [lc(l.args.tokenIn!), lc(l.args.tokenOut!)]))].filter((a) => !meta.has(a));
  await Promise.all(unknown.map(async (a) => {
    const [s, d] = await Promise.allSettled([
      c.readContract({ address: a as Address, abi: erc20Abi, functionName: "symbol" }),
      c.readContract({ address: a as Address, abi: erc20Abi, functionName: "decimals" }),
    ]);
    meta.set(a, {
      symbol: (s.status === "fulfilled" ? String(s.value) : "TOKEN").replace(/[^\w.$-]/g, "").slice(0, 12) || "TOKEN",
      decimals: d.status === "fulfilled" ? Number(d.value) : 18,
    });
  }));

  // prices: stablecoins at $1, the gas token at the router's quote, anything else at DexScreener's current price
  const stables = new Set(net.stables.map(lc));
  const gasSide = new Set([lc(NATIVE), lc(net.wrapped)]);
  let gasUsd = 0;
  try {
    const amt = net.key === "robinhood" ? 10n ** 16n : 10n ** 17n; // 0.01 ETH, 0.1 HYPE
    const q = await c.simulateContract({ address: router, abi: quoteAbi, functionName: "quote", args: [NATIVE, net.stable, amt] });
    const sd = meta.get(lc(net.stable))?.decimals ?? 6;
    gasUsd = Number(q.result.amountOut) / 10 ** sd / (Number(amt) / 1e18);
  } catch { /* priced below if DexScreener has it */ }
  const others = [...new Set(logs.flatMap((l) => [lc(l.args.tokenIn!), lc(l.args.tokenOut!)]))].filter((a) => !stables.has(a) && !gasSide.has(a));
  const dex = await dexPrices(net, gasUsd ? others : [...others, lc(net.wrapped)]);
  if (!gasUsd) gasUsd = dex[lc(net.wrapped)] ?? 0;

  const swaps = logs.map((l) => {
    const tIn = lc(l.args.tokenIn!), tOut = lc(l.args.tokenOut!);
    const mIn = meta.get(tIn)!, mOut = meta.get(tOut)!;
    const amountIn = Number(l.args.amountIn!) / 10 ** mIn.decimals, amountOut = Number(l.args.amountOut!) / 10 ** mOut.decimals;
    let usd: number | null = null;
    if (stables.has(tIn)) usd = amountIn;
    else if (stables.has(tOut)) usd = amountOut;
    else if (gasSide.has(tIn) && gasUsd) usd = amountIn * gasUsd;
    else if (gasSide.has(tOut) && gasUsd) usd = amountOut * gasUsd;
    else if (dex[tIn]) usd = amountIn * dex[tIn];
    else if (dex[tOut]) usd = amountOut * dex[tOut];
    return {
      chain: net.key, hash: l.transactionHash!, time: stamp(l) || times.get(l.blockNumber!) || 0,
      tokenIn: l.args.tokenIn!, tokenOut: l.args.tokenOut!, symIn: mIn.symbol, symOut: mOut.symbol, amountIn, amountOut, usd,
      referrer: l.args.referrer ? lc(l.args.referrer) : undefined,
      trader: l.args.to ? lc(l.args.to) : undefined,
    } satisfies StatSwap;
  });
  return { swaps, ok: true };
}

/** every swap on every chain, newest first, with its trader and referrer (server only; for points and stats) */
export async function readSwaps(): Promise<StatSwap[]> {
  const nets = NETS.filter((n) => n.contracts.router && n.deployed);
  const res = await Promise.all(nets.map((n) => chainSwaps(n).catch(() => ({ swaps: [] as StatSwap[], ok: false }))));
  if (res.every((r) => !r.ok)) throw new Error("no chain answered");
  return res.flatMap((r) => r.swaps).sort((a, b) => b.time - a.time);
}

export async function readRouterStats(): Promise<RouterStats> {
  const nets = NETS.filter((n) => n.contracts.router && n.deployed);
  const res = await Promise.all(nets.map((n) => chainSwaps(n).catch(() => ({ swaps: [] as StatSwap[], ok: false }))));
  if (res.every((r) => !r.ok)) throw new Error("no chain answered");
  const now = Math.floor(Date.now() / 1000);
  const sum = (s: StatSwap[], since = 0) => s.filter((x) => x.time >= since).reduce((a, x) => a + (x.usd ?? 0), 0);
  const chains: ChainStats[] = nets.map((n, i) => {
    const s = res[i].swaps;
    return {
      key: n.key, name: n.name, explorer: n.explorer, router: n.contracts.router!,
      swaps: s.length, swaps24h: s.filter((x) => x.time >= now - 86400).length, usdAll: sum(s), usd7d: sum(s, now - 7 * 86400), usd24h: sum(s, now - 86400),
      first: s.length ? Math.min(...s.map((x) => x.time || now)) : null, unpriced: s.filter((x) => x.usd === null).length, ok: res[i].ok,
    };
  });
  const all = res.flatMap((r) => r.swaps).sort((a, b) => b.time - a.time);
  chains.sort((a, b) => b.usdAll - a.usdAll); // the busiest chain first

  // UTC days from the first swap to today, newest first (30 at most)
  const days: DayStats[] = [];
  const firstT = all.length ? Math.min(...all.map((x) => x.time || now)) : now;
  for (let d = Math.floor(now / 86400); d >= Math.floor(firstT / 86400) && days.length < 30; d--) {
    const inDay = all.filter((x) => Math.floor(x.time / 86400) === d);
    days.push({
      date: new Date(d * 86400_000).toISOString().slice(0, 10),
      chains: Object.fromEntries(nets.map((n) => {
        const s = inDay.filter((x) => x.chain === n.key);
        return [n.key, { swaps: s.length, usd: sum(s) }];
      })),
    });
  }
  // referrers: every swap that paid one, grouped by referrer and ranked by referred volume
  const ZERO = "0x0000000000000000000000000000000000000000";
  const refs = new Map<string, ReferrerStats>();
  const monthWallets = new Map<string, Set<string>>();
  const d0 = new Date(now * 1000), monthStart = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1) / 1000;
  for (const x of all) {
    if (!x.referrer || x.referrer === ZERO) continue;
    const r = refs.get(x.referrer) ?? { address: x.referrer, chains: [], swaps: 0, usd: 0, usd7d: 0, walletsMonth: 0 };
    r.swaps++; r.usd += x.usd ?? 0;
    if (x.time >= now - 7 * 86400) r.usd7d += x.usd ?? 0;
    if (!r.chains.includes(x.chain)) r.chains.push(x.chain);
    if (x.time >= monthStart && x.trader && x.trader !== x.referrer && (x.usd ?? 0) >= 1) {
      const w = monthWallets.get(x.referrer) ?? new Set<string>();
      w.add(x.trader); monthWallets.set(x.referrer, w);
    }
    refs.set(x.referrer, r);
  }
  for (const [a, w] of monthWallets) { const r = refs.get(a); if (r) r.walletsMonth = w.size; }
  const referrers = [...refs.values()].sort((a, b) => b.usd - a.usd || b.swaps - a.swaps).slice(0, 25);
  // this UTC week's traders: 1970-01-01 was a Thursday, so weeks starting Monday are offset by 4 days
  const weekStart = Math.floor((now - 4 * 86400) / (7 * 86400)) * 7 * 86400 + 4 * 86400;
  const tr = new Map<string, TraderStats>();
  for (const x of all) {
    if (x.time < weekStart || !x.trader || x.trader === ZERO) continue;
    const t = tr.get(x.trader) ?? { address: x.trader, swaps: 0, usd: 0 };
    t.swaps++; t.usd += x.usd ?? 0;
    tr.set(x.trader, t);
  }
  const traders = { weekStart, list: [...tr.values()].sort((a, b) => b.usd - a.usd || b.swaps - a.swaps).slice(0, 10) };
  const strip = (x: StatSwap) => { const { referrer, trader, ...rest } = x; void referrer; void trader; return rest; };
  const day = all.filter((x) => x.time >= now - 86400);
  const largest24h = day.filter((x) => x.usd !== null).sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0)).slice(0, 10).map(strip);
  // the gas token, its wrapped form and stablecoins are what people pay with, not what they buy into
  const plain = new Set(["eth", "weth", "hype", "whype", "usdg", "usdc", "usdt", "usdt0", "usde", "usdh"]);
  const bought = new Map<string, TopToken>();
  for (const x of day) {
    if (plain.has(x.symOut.toLowerCase())) continue;
    const k = `${x.chain}:${x.tokenOut.toLowerCase()}`;
    const t = bought.get(k) ?? { chain: x.chain, token: x.tokenOut, symbol: x.symOut, buys: 0, usd: 0 };
    t.buys++; t.usd += x.usd ?? 0;
    bought.set(k, t);
  }
  const topBought24h = [...bought.values()].sort((a, b) => b.usd - a.usd || b.buys - a.buys).slice(0, 8);
  return {
    updated: now, chains, days, recent: all.slice(0, 20).map(strip), largest24h, topBought24h, referrers, traders,
    total: { swaps: all.length, usdAll: sum(all), usd7d: sum(all, now - 7 * 86400), usd24h: sum(all, now - 86400) },
  };
}
