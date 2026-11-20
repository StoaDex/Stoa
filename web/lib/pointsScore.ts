import type { StatSwap } from "./routerStats";

/** Stoa Points, season 1. Earned from swaps routed through Stoa and from swaps made through a referral link, counted
 *  from the routers' Routed events. Points have no promised value: they are not a token, cannot be claimed or
 *  transferred, and the rules can change (always written on /points). Rules, in order:
 *   - a swap counts from SEASON_START, at its dollar value (same pricing as /stats), and only from MIN_USD
 *   - stablecoin-to-stablecoin swaps earn nothing; a Robinhood Stock Token on either side earns STOCK_X
 *   - round trips earn once: a swap that undoes the same wallet's opposite swap of the same pair within ROUND_TRIP_S
 *     earns nothing
 *   - each wallet earns at most DAILY_CAP points per UTC day from its own swaps
 *   - a referrer earns REF_SHARE of the points of the swaps it referred (not its own), uncapped by the trader's cap
 *   - Stoa's own wallets earn nothing */
export const SEASON_START = 1_795_392_000; // Mon 23 Nov 2026 00:00 UTC
export const RULES = { MIN_USD: 1, STOCK_X: 2, ROUND_TRIP_S: 3600, DAILY_CAP: 2000, REF_SHARE: 0.1 } as const;
const STABLE = new Set(["usdg", "usdc", "usdt", "usdt0", "usde", "usdh"]);
const EXCLUDED = new Set(["0xbf666e8d054935170b9f09127247905a975b3b80", "0xa1a495484536c52046d07209c60059cf9613d386", "0xac75133729d6b5d615aa696d0828dc31fcb83ed8"]);
const ZERO = "0x0000000000000000000000000000000000000000";
const lc = (a: string) => a.toLowerCase();

export type PointsRow = { address: string; points: number; swapPoints: number; refPoints: number; swaps: number; refSwaps?: number; stockSwaps?: number; prevRank?: number | null };
export type PointsBoard = { seasonStart: number; updated: number; wallets: number; total: number; rows: PointsRow[] };

/** `from`: count swaps from this time (the season start; earlier for the pre-season preview) */
export function score(swaps: StatSwap[], stocks: Set<string>, from: number = SEASON_START): Map<string, PointsRow> {
  const out = new Map<string, PointsRow>();
  const row = (a: string) => { let r = out.get(a); if (!r) { r = { address: a, points: 0, swapPoints: 0, refPoints: 0, swaps: 0 }; out.set(a, r); } return r; };
  const day = new Map<string, number>(); // wallet|utc day -> points so far
  const last = new Map<string, number>(); // wallet|tokenIn|tokenOut -> time of that swap
  for (const x of [...swaps].sort((a, b) => a.time - b.time)) {
    if (x.time < from || !x.trader || x.trader === ZERO || EXCLUDED.has(x.trader)) continue;
    const usd = x.usd ?? 0;
    if (usd < RULES.MIN_USD) continue;
    if (STABLE.has(x.symIn.toLowerCase()) && STABLE.has(x.symOut.toLowerCase())) continue;
    const t = x.trader, kIn = lc(x.tokenIn), kOut = lc(x.tokenOut);
    last.set(`${t}|${kIn}|${kOut}`, x.time);
    const back = last.get(`${t}|${kOut}|${kIn}`);
    if (back !== undefined && x.time - back <= RULES.ROUND_TRIP_S) continue; // undoes a recent swap: no points
    const mult = stocks.has(kIn) || stocks.has(kOut) ? RULES.STOCK_X : 1;
    const dk = `${t}|${Math.floor(x.time / 86400)}`;
    const used = day.get(dk) ?? 0;
    const pts = Math.max(0, Math.min(usd * mult, RULES.DAILY_CAP - used));
    day.set(dk, used + pts);
    const r = row(t); r.swapPoints += pts; r.swaps++;
    if (mult > 1 && pts > 0) r.stockSwaps = (r.stockSwaps ?? 0) + 1;
    const ref = x.referrer;
    if (ref && ref !== ZERO && ref !== t && !EXCLUDED.has(ref) && pts > 0) { const rr = row(ref); rr.refPoints += pts * RULES.REF_SHARE; rr.refSwaps = (rr.refSwaps ?? 0) + 1; }
  }
  for (const r of out.values()) r.points = Math.round((r.swapPoints + r.refPoints) * 10) / 10;
  return out;
}


export type Flag = { address: string; points: number; rank: number; flags: string[] };

/** Patterns worth a human look before a season's board is trusted (not applied automatically; never published):
 *  repeated round trips, referrers and referred wallets that refer each other, referrers whose referred wallets only
 *  make tiny swaps, wallets made only of minimum-size swaps, and wallets at the daily cap on many days. */
export function review(swaps: StatSwap[], stocks: Set<string>): Flag[] {
  const rows = [...score(swaps, stocks).values()].filter((r) => r.points > 0).sort((a, b) => b.points - a.points);
  const rank = new Map(rows.map((r, i) => [r.address, i + 1]));
  const pts = new Map(rows.map((r) => [r.address, r.points]));
  const season = [...swaps].filter((x) => x.time >= SEASON_START && x.trader && x.trader !== ZERO && !EXCLUDED.has(x.trader)).sort((a, b) => a.time - b.time);
  const flags = new Map<string, Set<string>>();
  const add = (a: string, f: string) => { let s = flags.get(a); if (!s) { s = new Set(); flags.set(a, s); } s.add(f); };
  const last = new Map<string, number>(), trips = new Map<string, number>();
  const usdBy = new Map<string, number[]>(), refOf = new Map<string, Set<string>>(), days = new Map<string, Map<number, number>>();
  for (const x of season) {
    const t = x.trader!, kIn = lc(x.tokenIn), kOut = lc(x.tokenOut);
    const back = last.get(`${t}|${kOut}|${kIn}`);
    if (back !== undefined && x.time - back <= RULES.ROUND_TRIP_S) trips.set(t, (trips.get(t) ?? 0) + 1);
    last.set(`${t}|${kIn}|${kOut}`, x.time);
    const u = x.usd ?? 0;
    usdBy.set(t, [...(usdBy.get(t) ?? []), u]);
    const d = Math.floor(x.time / 86400), dm = days.get(t) ?? new Map<number, number>();
    dm.set(d, (dm.get(d) ?? 0) + u * (stocks.has(kIn) || stocks.has(kOut) ? RULES.STOCK_X : 1)); days.set(t, dm);
    if (x.referrer && x.referrer !== ZERO && x.referrer !== t) { const s = refOf.get(x.referrer) ?? new Set<string>(); s.add(t); refOf.set(x.referrer, s); }
  }
  for (const [t, n] of trips) if (n >= 3) add(t, `${n} round trips within an hour`);
  for (const [r, kids] of refOf) for (const k of kids) if (refOf.get(k)?.has(r)) { add(r, `refers ${k.slice(0, 8)}… and is referred by it`); add(k, `refers ${r.slice(0, 8)}… and is referred by it`); }
  for (const [r, kids] of refOf) {
    const tiny = [...kids].filter((k) => (usdBy.get(k) ?? []).every((u) => u < 5));
    if (kids.size >= 5 && tiny.length / kids.size >= 0.8) add(r, `${tiny.length} of ${kids.size} referred wallets only made swaps under $5`);
  }
  for (const [t, us] of usdBy) if (us.length >= 10 && us.every((u) => u >= RULES.MIN_USD && u < 3)) add(t, `${us.length} swaps, all between $${RULES.MIN_USD} and $3`);
  for (const [t, dm] of days) { const capped = [...dm.values()].filter((v) => v >= RULES.DAILY_CAP).length; if (capped >= 3) add(t, `at the daily cap on ${capped} days`); }
  return [...flags.entries()].map(([address, f]) => ({ address, points: pts.get(address) ?? 0, rank: rank.get(address) ?? 0, flags: [...f] }))
    .sort((a, b) => b.points - a.points);
}
