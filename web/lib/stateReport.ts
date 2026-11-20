import "server-only";
import { unstable_cache } from "next/cache";
import { readSwaps } from "./routerStats";
import { mid, stockTokens } from "./stocks";
import { readSpotlight } from "./spotlightServer";
import { isStalePool, STALE_VOLUME_USD } from "./stockGap";

const HF = "https://huggingface.co/datasets/StoaDex";
const lc = (a: string) => a.toLowerCase();

function csv(t: string): Record<string, string>[] {
  const rows: string[][] = []; let r: string[] = [], c = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { r.push(c); c = ""; } else if (ch === "\n") { r.push(c); rows.push(r); r = []; c = ""; } else if (ch !== "\r") c += ch;
  }
  if (c || r.length) { r.push(c); rows.push(r); }
  const [h, ...b] = rows;
  return b.filter((x) => x.length === h.length).map((x) => Object.fromEntries(h.map((k, i) => [k, x[i]])));
}
const get = (path: string) => fetch(`${HF}/${path}`, { next: { revalidate: 3600 } }).then((r) => (r.ok ? r.text() : "")).catch(() => "");

export type StateReport = {
  from: string; to: string; generated: string;
  stoa: { swaps: number; usd: number; wallets: number; topPairs: { pair: string; swaps: number; usd: number }[] };
  stocks: { tracked: number; liquid: number; routed: number; medianGapNow: number | null; cheaper: { symbol: string; gap: number }[]; dearer: { symbol: string; gap: number }[]; snapshots: number; medianGapWeek: number | null };
  venues: { block: string; time: string; pair: string; amountIn: number; rows: { venue: string; out: number; vsTopPct: number }[] } | null;
  spotlight: { week: number; phase: string; stoaLocked: number; candidates: number } | null;
};
const median = (v: number[]) => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** "State of Robinhood Chain" for the last 7 days, from Stoa's own data: swaps through Stoa, stock token prices against
 *  Robinhood's (live and from the open dataset), venue depth for one swap in one block, and Spotlight. */
async function load(): Promise<StateReport> {
  const now = Math.floor(Date.now() / 1000), from = now - 7 * 86400;
  const [swaps, st, sp, venueCsv] = await Promise.all([
    readSwaps().catch(() => []), stockTokens().catch(() => null), readSpotlight().catch(() => null), get("robinhood-chain-venue-quotes/resolve/main/latest.csv"),
  ]);
  const week = swaps.filter((s) => s.time >= from && s.chain === "robinhood");
  const pairs = new Map<string, { pair: string; swaps: number; usd: number }>();
  for (const s of week) { if (s.symIn === s.symOut) continue; /* two tokens sharing a symbol: not a readable pair */ const k = `${s.symIn} → ${s.symOut}`; const p = pairs.get(k) ?? { pair: k, swaps: 0, usd: 0 }; p.swaps++; p.usd += s.usd ?? 0; pairs.set(k, p); }
  // stock gaps now
  const live = (st?.stocks ?? []).flatMap((s) => { const m = mid(s); if (!m || !s.dex || s.halted || s.dex.liquidityUsd < 50_000 || isStalePool(s.dex)) return []; const g = ((s.dex.priceUsd - m) / m) * 100; return Math.abs(g) <= 25 ? [{ symbol: s.symbol, gap: g }] : []; });
  // the week from the dataset: median absolute gap over every snapshot of liquid tokens
  const days = Array.from({ length: 7 }, (_, i) => new Date((now - i * 86400) * 1000).toISOString().slice(0, 10));
  const files = await Promise.all(days.map((d) => get(`robinhood-stock-tokens/resolve/main/data/${d.slice(0, 7)}/${d}.csv`)));
  const wk: number[] = []; const snaps = new Set<string>();
  for (const f of files) for (const r of f ? csv(f) : []) {
    const b = Number(r.robinhood_bid), a = Number(r.robinhood_ask), o = Number(r.onchain_price), l = Number(r.liquidity_usd);
    if (!(b > 0 && a > 0 && o > 0) || l < 50_000 || r.halted === "True" || !(Number(r.volume24h_usd) >= STALE_VOLUME_USD)) continue;
    const g = ((o - (a + b) / 2) / ((a + b) / 2)) * 100;
    if (Math.abs(g) > 25) continue;
    wk.push(Math.abs(g)); snaps.add(r.snapshot_utc);
  }
  // venues: 5 ETH → USDG at the latest snapshot
  let venues: StateReport["venues"] = null;
  const vr = venueCsv ? csv(venueCsv).filter((r) => r.pair === "ETH/USDG" && r.amount_in === "5" && r.amount_out) : [];
  if (vr.length) {
    const top = Math.max(...vr.map((r) => Number(r.amount_out)));
    venues = { block: vr[0].block, time: vr[0].snapshot_utc, pair: "ETH → USDG", amountIn: 5, rows: vr.map((r) => ({ venue: r.venue, out: Number(r.amount_out), vsTopPct: ((top - Number(r.amount_out)) / top) * 100 })).sort((x, y) => y.out - x.out) };
  }
  return {
    from: new Date(from * 1000).toISOString(), to: new Date(now * 1000).toISOString(), generated: new Date().toISOString(),
    stoa: { swaps: week.length, usd: week.reduce((a, s) => a + (s.usd ?? 0), 0), wallets: new Set(week.map((s) => s.trader).filter(Boolean).map((x) => lc(x!))).size, topPairs: [...pairs.values()].sort((a, b) => b.usd - a.usd).slice(0, 5) },
    stocks: {
      tracked: st?.stocks.length ?? 0, liquid: live.length, routed: (st?.stocks ?? []).filter((s) => s.route).length,
      medianGapNow: median(live.map((x) => Math.abs(x.gap))),
      cheaper: live.filter((x) => x.gap < 0).sort((a, b) => a.gap - b.gap).slice(0, 3), dearer: live.filter((x) => x.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, 3),
      snapshots: snaps.size, medianGapWeek: median(wk),
    },
    venues,
    spotlight: sp ? { week: sp.week, phase: sp.phase, stoaLocked: sp.stoaLocked, candidates: sp.candidates.filter((c) => !c.canceled).length } : null,
  };
}

export const readStateReport = unstable_cache(load, ["state-of-robinhood-chain"], { revalidate: 3600 });
