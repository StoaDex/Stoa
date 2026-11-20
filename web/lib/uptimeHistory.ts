// Uptime history from the 15-minute outside checks (.github/workflows/uptime.yml), published as status.json on the
// status-data branch. Days are UTC; a run counts as up only when every check in it passed.
export type UptimeDay = { runs: number; okRuns: number; checks: Record<string, [number, number]> };
export type Incident = { start: number; last: number; end?: number; checks: string[] };
export type UptimeStatus = { updated: number; days: Record<string, UptimeDay>; incidents: Incident[]; current?: { ok: boolean; failing: string[]; checks: string[] } };

export async function readUptime(): Promise<UptimeStatus | null> {
  try {
    const r = await fetch("https://raw.githubusercontent.com/StoaDex/Stoa/status-data/status.json", { next: { revalidate: 300 }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    return (await r.json()) as UptimeStatus;
  } catch {
    return null;
  }
}

/** share of runs with every check passing over the last `days` UTC days (today included); null without runs */
export function uptimePct(s: UptimeStatus, days: number, now = Date.now()): { pct: number | null; runs: number } {
  let runs = 0, ok = 0;
  for (let i = 0; i < days; i++) {
    const k = new Date(now - i * 86400_000).toISOString().slice(0, 10);
    const d = s.days[k];
    if (d) { runs += d.runs; ok += d.okRuns; }
  }
  return { pct: runs ? (ok / runs) * 100 : null, runs };
}
