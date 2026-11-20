import { createPublicClient, fallback, http, parseAbi, type Address, type PublicClient } from "viem";
import type { Route } from "./swap";
import { ROBINHOOD, type Net } from "./networks";
import { srv } from "@/lib/serverRpc";

/**
 * Guard for Stoa's first Uniswap V4 adapter on Robinhood Chain, until the timelock replaces it with
 * UniswapV4AdapterV2 (keeper-only pool registration). Anyone could register pool keys on the first one, and a full
 * pair's weakest key could be replaced by a pool with more raw in-range liquidity, which a narrow position buys
 * cheaply (reported by Hey Research Lab). Only Stoa's keeper has registered keys so far. If anyone else registers or
 * replaces a key, that pair is "poisoned": quotes here skip the old adapter on it and use the router's other venues.
 * Same rule as contracts/script/v4_guard.py (the keeper scripts and the monitoring workflow).
 */
export const OLD_V4 = "0x8965140fb51b2e99a0cd31a0e99eae01d36517b8";
const KEEPER = "0xbf666e8d054935170b9f09127247905a975b3b80";
const CHECKPOINT = 115_700_000n; // every key registered up to here came from the keeper (checked 16 Nov 2026)
const REGISTERED = "0xbf4e56ab1b86aa122b3182171b02e3a6867ddcfeb0c08dff3c335d40ca333523";
const ZERO = "0x0000000000000000000000000000000000000000";
const FEE_BPS = 2n; // the router's fee on adapter routes

const abi = parseAbi([
  "function isAdapter(address) view returns (bool)",
  "function adapters(uint256 i) view returns (address)",
  "function quote(address tokenIn, address tokenOut, uint256 amountIn) view returns (uint256)",
]);

export type Guard = { oldInRouter: boolean; poisoned: string[] };

const lc = (a: string) => a.toLowerCase();
const canon = (a: string) => (lc(a) === ZERO ? lc(ROBINHOOD.wrapped) : lc(a));
const pairKey = (a: string, b: string) => [canon(a), canon(b)].sort().join("-");

let serverMemo: { at: number; v: Guard } | null = null;
const senderCache = new Map<string, string>();

/** Server side: read the old adapter's logs since the checkpoint and the sender of each transaction. */
export async function computeGuard(): Promise<Guard> {
  if (serverMemo && Date.now() - serverMemo.at < 60_000) return serverMemo.v;
  const c = createPublicClient({ chain: ROBINHOOD.chain, transport: http(srv(ROBINHOOD.logsRpc)) });
  const oldInRouter = await c.readContract({ address: ROBINHOOD.contracts.router!, abi, functionName: "isAdapter", args: [OLD_V4 as Address] });
  if (!oldInRouter) {
    serverMemo = { at: Date.now(), v: { oldInRouter, poisoned: [] } };
    return serverMemo.v;
  }
  const logs = await c.getLogs({ address: OLD_V4 as Address, fromBlock: CHECKPOINT + 1n, toBlock: "latest" });
  const hashes = [...new Set(logs.map((l) => l.transactionHash).filter(Boolean))] as `0x${string}`[];
  // senders never change, so each is looked up once per instance, 8 at a time, through the server RPCs with the public
  // one last (about 180 lookups at once were refused with 429 from Vercel, which made every guard read "unknown")
  const urls = [...new Set([...(ROBINHOOD.chain.rpcUrls.default.http as readonly string[]).map((u) => srv(u)), ROBINHOOD.logsRpc])];
  const tc = createPublicClient({ chain: ROBINHOOD.chain, transport: fallback(urls.map((u) => http(u, { retryCount: 2, retryDelay: 300 })), { rank: false }) });
  const todo = hashes.filter((h) => !senderCache.has(h));
  for (let i = 0; i < todo.length; i += 8) {
    await Promise.all(todo.slice(i, i + 8).map(async (h) => senderCache.set(h, lc((await tc.getTransaction({ hash: h })).from))));
  }
  const senders = senderCache;
  const bad = new Set<string>();
  for (const l of logs) {
    if (!l.transactionHash || senders.get(l.transactionHash) === KEEPER) continue;
    if (l.topics[0] === REGISTERED) {
      const d = l.data.slice(2);
      bad.add(pairKey(`0x${d.slice(24, 64)}`, `0x${d.slice(88, 128)}`));
    } else {
      bad.add("*"); // an outsider transaction that only removed keys: trust no pair on the old adapter
    }
  }
  serverMemo = { at: Date.now(), v: { oldInRouter, poisoned: [...bad].sort() } };
  return serverMemo.v;
}

let clientMemo: { at: number; v: Guard } | null = null;

/** Browser side: the same answer from /api/v1/v4-guard, kept for a minute. A failed check counts as poisoned. */
export async function fetchGuard(): Promise<Guard> {
  if (clientMemo && Date.now() - clientMemo.at < 60_000) return clientMemo.v;
  try {
    const r = await fetch("/api/v1/v4-guard");
    if (!r.ok) throw new Error(String(r.status));
    clientMemo = { at: Date.now(), v: (await r.json()) as Guard };
  } catch {
    clientMemo = { at: Date.now() - 50_000, v: { oldInRouter: true, poisoned: ["*"] } };
  }
  return clientMemo.v;
}

/** Whether `route` sends a leg through the old adapter on a poisoned pair. */
export function usesPoisoned(route: Route, sell: string, buy: string, g: Guard): boolean {
  if (!g.oldInRouter || !g.poisoned.length) return false;
  const set = new Set(g.poisoned);
  const hop = lc(route.mid) !== ZERO;
  const legs: [string, string, string][] = hop
    ? [[sell, route.mid, route.leg1.venue], [route.mid, buy, route.leg2.venue]]
    : [[sell, buy, route.leg1.venue]];
  return legs.some(([x, y, v]) => lc(v) === OLD_V4 && (set.has("*") || set.has(pairKey(x, y))));
}

/**
 * The router's best route without the old V4 adapter: the best other venue directly, or through the wrapped native
 * token, as the router itself would pick (net of its fee). Null if no other venue has a route.
 */
/** The best route from every venue in the router except the ones in `skip` (always the old V4 adapter): each venue's own
 *  quote, direct or through the wrapped gas token. Used when the router's pick cannot be used. */
export async function routeWithoutOldV4(pub: PublicClient, net: Net, sell: Address, buy: Address, amount: bigint, skip: string[] = []): Promise<Route | null> {
  const router = net.contracts.router!;
  const idx = Array.from({ length: 16 }, (_, i) => BigInt(i));
  const listed = await pub.multicall({ contracts: idx.map((i) => ({ address: router, abi, functionName: "adapters" as const, args: [i] as const })), allowFailure: true });
  const out = new Set([OLD_V4, ...skip.map(lc)]);
  const venues = listed.map((r) => r.result as Address | undefined).filter((a): a is Address => !!a && !out.has(lc(a)));
  if (!venues.length) return null;
  const a = (lc(sell) === ZERO ? net.wrapped : sell) as Address;
  const b = (lc(buy) === ZERO ? net.wrapped : buy) as Address;
  const best = async (x: Address, y: Address, amt: bigint) => {
    const res = await pub.multicall({ contracts: venues.map((v) => ({ address: v, abi, functionName: "quote" as const, args: [x, y, amt] as const })), allowFailure: true });
    let out = 0n; let venue: Address | null = null;
    res.forEach((r, i) => { const o = (r.result as bigint | undefined) ?? 0n; if (o > out) { out = o; venue = venues[i]; } });
    return { out, venue: venue as Address | null };
  };
  const net0 = (o: bigint) => o - (o * FEE_BPS) / 10_000n;
  const none = { venue: ZERO as Address, isPool: false };
  const d = await best(a, b, amount);
  let route: Route | null = d.venue ? { amountOut: net0(d.out), mid: ZERO as Address, leg1: { venue: d.venue, isPool: false }, leg2: none } : null;
  const w = net.wrapped as Address;
  if (lc(a) !== lc(w) && lc(b) !== lc(w)) {
    const l1 = await best(a, w, amount);
    if (l1.venue && l1.out > 0n) {
      const l2 = await best(w, b, l1.out);
      if (l2.venue && net0(l2.out) > (route?.amountOut ?? 0n)) {
        route = { amountOut: net0(l2.out), mid: w, leg1: { venue: l1.venue, isPool: false }, leg2: { venue: l2.venue, isPool: false } };
      }
    }
  }
  return route;
}

/** Use the router's route unless it goes through the old V4 adapter on a poisoned pair; then the best other one. */
export async function guardRoute(pub: PublicClient, net: Net, sell: Address, buy: Address, amount: bigint, route: Route, g: Guard): Promise<Route | null> {
  if (net.chain.id !== ROBINHOOD.chain.id || !usesPoisoned(route, sell, buy, g)) return route;
  return routeWithoutOldV4(pub, net, sell, buy, amount);
}
