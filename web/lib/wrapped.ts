import "server-only";
import { cache } from "react";
import { createPublicClient, erc20Abi, http, isAddress, parseAbi, getAddress, type Address } from "viem";
import { NETS, ROBINHOOD, type Net } from "./networks";
import { routedEvent } from "./abi";
import { NATIVE } from "./tokens";
import { CA as STOA } from "./stoaAddress";
import { srv } from "@/lib/serverRpc";

/** Stoa Wrapped: one wallet's swaps through Stoa on every chain, read from the routers' Routed events where the wallet is
 *  the recipient, valued the same way as /stats (stablecoin side, else gas-token side at the router's current quote,
 *  else DexScreener's current price), plus the $STOA it holds or has locked in Spotlight. Server only; the page and its
 *  link card cache the result for 10 minutes. */

export type Edition = "Classic" | "Marble" | "Gold";
export interface Wrapped {
  address: Address;
  swaps: number;
  usd: number;
  first: number | null;
  last: number | null;
  chains: { key: Net["key"]; name: string; swaps: number; usd: number }[];
  topVenue: { name: string; swaps: number } | null;
  venues: number;
  topToken: { symbol: string; swaps: number } | null;
  tokens: number;
  biggest: { usd: number; symIn: string; symOut: string; chain: Net["key"]; hash: string } | null;
  /** swaps by other wallets that named this wallet as their referrer */
  referred: number;
  stoa: { held: number; locked: number };
  edition: Edition;
  updated: number;
}

interface Swap { chain: Net["key"]; hash: string; time: number; tIn: string; tOut: string; symIn: string; symOut: string; usd: number | null; venues: string[] }

const ua = { fetchOptions: { headers: { "user-agent": "curl/8.5.0" } }, timeout: 20_000 };
const quoteAbi = parseAbi(["function quote(address,address,uint256) returns ((uint256 amountOut, address mid, (address venue, bool isPool) leg1, (address venue, bool isPool) leg2))"]);
const accountsAbi = parseAbi(["function accounts(address holder) view returns (uint128 active, uint128 pending, uint64 unlockAt)"]);
const backersAbi = parseAbi(["function backers(address) view returns (uint128 active, uint128 pending, uint64 unlockAt)"]);
const lc = (a: string) => a.toLowerCase();
/** at or above this much $STOA (held plus locked in Spotlight) a card is Gold; any $STOA makes it Marble */
export const GOLD_STOA = 1_000_000;

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

async function chainRead(net: Net, who: Address): Promise<{ swaps: Swap[]; referred: number }> {
  const router = net.contracts.router;
  if (!router || !net.deployed) return { swaps: [], referred: 0 };
  const c = createPublicClient({ chain: net.chain, transport: http(srv(net.logsRpc), { ...ua, batch: { batchSize: 100 } }) });
  const head = await c.getBlockNumber();
  const span = net.logsSpan === 0n ? head : net.logsSpan;
  const mine: Awaited<ReturnType<typeof c.getLogs<typeof routedEvent>>> = [];
  let referred = 0;
  for (let a = net.deployBlock; a <= head; a += span) {
    const z = a + span - 1n < head ? a + span - 1n : head;
    const [m, r] = await Promise.all([
      c.getLogs({ address: router, event: routedEvent, args: { to: who }, fromBlock: a, toBlock: z }),
      c.getLogs({ address: router, event: routedEvent, args: { referrer: who }, fromBlock: a, toBlock: z }),
    ]);
    mine.push(...m);
    referred += r.filter((l) => lc(l.args.to ?? "") !== lc(who)).length;
  }

  const stamp = (l: (typeof mine)[number]) => Number((l as unknown as { blockTimestamp?: string | bigint }).blockTimestamp ?? 0);
  const missing = [...new Set(mine.filter((l) => !stamp(l)).map((l) => l.blockNumber!))];
  const times = new Map<bigint, number>();
  await Promise.all(missing.map(async (b) => times.set(b, Number((await c.getBlock({ blockNumber: b })).timestamp))));

  const meta = new Map<string, { symbol: string; decimals: number }>(net.tokens.map((t) => [lc(t.address), { symbol: t.symbol, decimals: t.decimals }]));
  meta.set(lc(NATIVE), { symbol: net.gas, decimals: 18 });
  const unknown = [...new Set(mine.flatMap((l) => [lc(l.args.tokenIn!), lc(l.args.tokenOut!)]))].filter((a) => !meta.has(a));
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

  const stables = new Set(net.stables.map(lc));
  const gasSide = new Set([lc(NATIVE), lc(net.wrapped)]);
  let gasUsd = 0;
  if (mine.length) {
    try {
      const amt = net.key === "robinhood" ? 10n ** 16n : 10n ** 17n;
      const q = await c.simulateContract({ address: router, abi: quoteAbi, functionName: "quote", args: [NATIVE, net.stable, amt] });
      gasUsd = Number(q.result.amountOut) / 10 ** (meta.get(lc(net.stable))?.decimals ?? 6) / (Number(amt) / 1e18);
    } catch { /* DexScreener below */ }
  }
  const others = [...new Set(mine.flatMap((l) => [lc(l.args.tokenIn!), lc(l.args.tokenOut!)]))].filter((a) => !stables.has(a) && !gasSide.has(a));
  const dex = mine.length ? await dexPrices(net, gasUsd ? others : [...others, lc(net.wrapped)]) : {};
  if (!gasUsd) gasUsd = dex[lc(net.wrapped)] ?? 0;
  const venueName = (v: string) => {
    if (lc(v) === lc(NATIVE)) return null;
    if (net.contracts.pool && lc(v) === lc(net.contracts.pool)) return "Stoa maker pool";
    return net.venues[lc(v)] ?? null;
  };

  const swaps = mine.map((l) => {
    const tIn = lc(l.args.tokenIn!), tOut = lc(l.args.tokenOut!);
    const mIn = meta.get(tIn)!, mOut = meta.get(tOut)!;
    const aIn = Number(l.args.amountIn!) / 10 ** mIn.decimals, aOut = Number(l.args.amountOut!) / 10 ** mOut.decimals;
    let usd: number | null = null;
    if (stables.has(tIn)) usd = aIn;
    else if (stables.has(tOut)) usd = aOut;
    else if (gasSide.has(tIn) && gasUsd) usd = aIn * gasUsd;
    else if (gasSide.has(tOut) && gasUsd) usd = aOut * gasUsd;
    else if (dex[tIn]) usd = aIn * dex[tIn];
    else if (dex[tOut]) usd = aOut * dex[tOut];
    const venues = [...new Set([venueName(l.args.venue1!), venueName(l.args.venue2!)].filter((v): v is string => !!v))];
    return { chain: net.key, hash: l.transactionHash!, time: stamp(l) || times.get(l.blockNumber!) || 0, tIn, tOut, symIn: mIn.symbol, symOut: mOut.symbol, usd, venues } satisfies Swap;
  });
  return { swaps, referred };
}

export async function stoaOf(who: Address): Promise<{ held: number; locked: number }> {
  const c = createPublicClient({ chain: ROBINHOOD.chain, transport: http(srv(ROBINHOOD.logsRpc), ua) });
  const spot = ROBINHOOD.contracts.spotlight, cover = ROBINHOOD.contracts.cover;
  const [bal, acc, back] = await Promise.allSettled([
    c.readContract({ address: STOA, abi: erc20Abi, functionName: "balanceOf", args: [who] }),
    spot ? c.readContract({ address: spot, abi: accountsAbi, functionName: "accounts", args: [who] }) : Promise.reject(new Error("no spotlight")),
    // Rug Cover backers: fails (and counts nothing) until the contract is deployed
    cover ? c.readContract({ address: cover, abi: backersAbi, functionName: "backers", args: [who] }) : Promise.reject(new Error("no cover")),
  ]);
  return {
    held: bal.status === "fulfilled" ? Number(bal.value) / 1e18 : 0,
    locked: (acc.status === "fulfilled" ? (Number(acc.value[0]) + Number(acc.value[1])) / 1e18 : 0)
      + (back.status === "fulfilled" ? (Number(back.value[0]) + Number(back.value[1])) / 1e18 : 0),
  };
}

function top(counts: Map<string, number>) {
  let best: { name: string; n: number } | null = null;
  for (const [name, n] of counts) if (!best || n > best.n) best = { name, n };
  return best;
}

async function read(address: string): Promise<Wrapped | null> {
  if (!isAddress(address)) return null;
  const who = getAddress(address);
  const nets = NETS.filter((n) => n.contracts.router && n.deployed);
  const [res, stoa] = await Promise.all([
    Promise.all(nets.map((n) => chainRead(n, who).catch(() => null))),
    stoaOf(who).catch(() => ({ held: 0, locked: 0 })),
  ]);
  if (res.every((r) => r === null)) throw new Error("no chain answered");
  const all = res.flatMap((r) => r?.swaps ?? []).sort((a, b) => a.time - b.time);

  const venueCount = new Map<string, number>();
  for (const s of all) for (const v of s.venues) venueCount.set(v, (venueCount.get(v) ?? 0) + 1);
  // the token a wallet trades most, leaving out gas tokens and stablecoins unless that is all it traded
  const plain = new Set(nets.flatMap((n) => [lc(NATIVE), lc(n.wrapped), ...n.stables.map(lc)]));
  const tokenCount = new Map<string, number>(), anyCount = new Map<string, number>();
  for (const s of all) for (const [t, sym] of [[s.tIn, s.symIn], [s.tOut, s.symOut]]) {
    anyCount.set(sym, (anyCount.get(sym) ?? 0) + 1);
    if (!plain.has(t)) tokenCount.set(sym, (tokenCount.get(sym) ?? 0) + 1);
  }
  const tv = top(venueCount), tt = top(tokenCount.size ? tokenCount : anyCount);
  const big = all.filter((s) => s.usd !== null).sort((a, b) => b.usd! - a.usd!)[0];
  const total = stoa.held + stoa.locked;
  return {
    address: who,
    swaps: all.length,
    usd: all.reduce((a, s) => a + (s.usd ?? 0), 0),
    first: all.length ? all[0].time : null,
    last: all.length ? all[all.length - 1].time : null,
    chains: nets.map((n, i) => ({ key: n.key, name: n.name, swaps: res[i]?.swaps.length ?? 0, usd: (res[i]?.swaps ?? []).reduce((a, s) => a + (s.usd ?? 0), 0) })),
    topVenue: tv ? { name: tv.name, swaps: tv.n } : null,
    venues: venueCount.size,
    topToken: tt ? { symbol: tt.name, swaps: tt.n } : null,
    tokens: new Set(all.flatMap((s) => [s.tIn, s.tOut])).size,
    biggest: big ? { usd: big.usd!, symIn: big.symIn, symOut: big.symOut, chain: big.chain, hash: big.hash } : null,
    referred: res.reduce((a, r) => a + (r?.referred ?? 0), 0),
    stoa,
    edition: total >= GOLD_STOA ? "Gold" : total > 0 ? "Marble" : "Classic",
    updated: Math.floor(Date.now() / 1000),
  };
}

/** once per request: metadata, page and link card share the read */
export const readWrapped = cache(read);

/** Quest checks (/api/quest): a wallet's Robinhood Chain swaps through Stoa from `since` (unix seconds), the ones worth
 *  at least `minUsd`, and the $STOA it has locked (Spotlight, plus Rug Cover backing). Read from the router's Routed
 *  events where the wallet is the recipient, valued the same way as Wrapped. */
export async function questProgress(address: string, since: number, until: number, minUsd: number) {
  if (!isAddress(address)) return null;
  const who = getAddress(address);
  const [r, stoa] = await Promise.all([chainRead(ROBINHOOD, who), stoaOf(who).catch(() => ({ held: 0, locked: 0 }))]);
  const swaps = r.swaps.filter((s) => s.time >= since && s.time <= until);
  const qualifying = swaps.filter((s) => (s.usd ?? 0) >= minUsd);
  return { address: who, swaps: swaps.length, qualifying: qualifying.length, usd: swaps.reduce((a, s) => a + (s.usd ?? 0), 0), locked: stoa.locked };
}
