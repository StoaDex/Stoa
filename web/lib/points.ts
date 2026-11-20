import "server-only";
import { unstable_cache } from "next/cache";
import { readSwaps } from "./routerStats";
import { stockTokens } from "./stocks";
import { SEASON_START, score, type PointsBoard } from "./pointsScore";

export { RULES, SEASON_START } from "./pointsScore";
export type { PointsBoard, PointsRow } from "./pointsScore";
const lc = (a: string) => a.toLowerCase();

async function load(from: number = SEASON_START): Promise<PointsBoard> {
  const [swaps, st] = await Promise.all([readSwaps(), stockTokens().catch(() => null)]);
  const stocks = new Set((st?.stocks ?? []).map((s) => lc(s.address)));
  const all = [...score(swaps, stocks, from).values()].filter((r) => r.points > 0).sort((a, b) => b.points - a.points);
  // the board 24 hours ago, from the same swaps: rank then (null: not on the board yet)
  const dayAgo = Math.floor(Date.now() / 1000) - 86400;
  const before = [...score(swaps.filter((x) => x.time <= dayAgo), stocks, from).values()].filter((r) => r.points > 0).sort((a, b) => b.points - a.points);
  const prev = new Map(before.map((r, i) => [r.address, i + 1]));
  for (const r of all) r.prevRank = prev.get(r.address) ?? null;
  return { seasonStart: SEASON_START, updated: Math.floor(Date.now() / 1000), wallets: all.length, total: Math.round(all.reduce((a, r) => a + r.points, 0)), rows: all };
}

/** the whole board, recomputed at most every five minutes */
export const readPoints = unstable_cache(() => load(), ["stoa-points-s1"], { revalidate: 300 });

/** before the season: the same rules over the last 7 days, so a wallet can see what it would have earned. Not points. */
export const readPreview = unstable_cache(() => load(Math.floor(Date.now() / 1000) - 7 * 86400), ["stoa-points-preview"], { revalidate: 300 });
