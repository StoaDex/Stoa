import "server-only";

/** Earnings report dates of the companies behind Robinhood Stock Tokens, from Robinhood's public market-data API
 *  (api.robinhood.com/marketdata/earnings, read-only, no key). Kept 6 hours. A date Robinhood has not confirmed yet
 *  is shown as expected. */
export type Report = { date: string; timing: "am" | "pm" | null; verified: boolean; estimate: number | null; actual: number | null; year: number; quarter: number };
type Raw = { symbol: string; year: number; quarter: number; eps?: { estimate?: string | null; actual?: string | null }; report?: { date?: string; timing?: string | null; verified?: boolean } | null };

const RH = "https://api.robinhood.com/marketdata/earnings/";
const num = (v?: string | null) => (v != null && isFinite(Number(v)) ? Number(v) : null);
const today = () => new Date().toISOString().slice(0, 10);

async function get(qs: string): Promise<Raw[]> {
  try {
    const r = await fetch(`${RH}?${qs}`, { headers: { accept: "application/json", "user-agent": "stoadex.com" }, signal: AbortSignal.timeout(8_000), next: { revalidate: 21_600 } });
    if (!r.ok) return [];
    return ((await r.json()) as { results?: Raw[] }).results ?? [];
  } catch {
    return [];
  }
}

const toReport = (x: Raw): Report | null =>
  x.report?.date ? { date: x.report.date, timing: x.report.timing === "am" || x.report.timing === "pm" ? x.report.timing : null, verified: !!x.report.verified, estimate: num(x.eps?.estimate), actual: num(x.eps?.actual), year: x.year, quarter: x.quarter } : null;

/** the next report on or after today, and the last one that has a result */
export async function earningsFor(symbol: string): Promise<{ next: Report | null; last: Report | null }> {
  const rows = (await get(`symbol=${encodeURIComponent(symbol.toUpperCase())}`)).map(toReport).filter((r): r is Report => !!r).sort((a, b) => a.date.localeCompare(b.date));
  const t = today();
  return { next: rows.find((r) => r.date >= t) ?? null, last: [...rows].reverse().find((r) => r.date < t && r.actual !== null) ?? null };
}

/** reports from today through the next 7 days for the given tickers, soonest first */
export async function earningsWeek(symbols: string[]): Promise<{ symbol: string; report: Report }[]> {
  const want = new Set(symbols.map((s) => s.toUpperCase()));
  const t = today();
  return (await get("range=7day"))
    .filter((x) => want.has(x.symbol.toUpperCase()))
    .map((x) => ({ symbol: x.symbol.toUpperCase(), report: toReport(x) }))
    .filter((x): x is { symbol: string; report: Report } => !!x.report && x.report.date >= t)
    .sort((a, b) => a.report.date.localeCompare(b.report.date));
}

export const whenTxt = (r: Report) => `${new Date(`${r.date}T00:00:00Z`).toUTCString().slice(0, 11)}${r.timing === "pm" ? ", after the US market closes" : r.timing === "am" ? ", before the US market opens" : ""}`;
