/** The US stock market session at a given moment, in New York time. Robinhood prices its Stock Tokens from the
 *  underlying shares, which trade in regular hours (9:30 to 16:00), extended hours (7:00 to 9:30 and 16:00 to 20:00)
 *  and overnight (20:00 to 7:00, Sunday night to Friday morning). The tokens themselves move on Robinhood Chain at any
 *  time; outside these sessions their pools have no live reference price. */
export type Session = "regular" | "extended" | "overnight" | "closed";

// NYSE full-day closures and 13:00 early closes. Extend this list each year.
const HOLIDAYS = new Set([
  "2026-11-26", "2026-12-25",
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
]);
const EARLY_CLOSE = new Set(["2026-11-27", "2026-12-24", "2027-11-26"]);

/** New York wall-clock parts for an instant */
function ny(t: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23",
  }).formatToParts(t).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, wd: p.weekday as string, min: Number(p.hour) * 60 + Number(p.minute) };
}

const OPEN = 9 * 60 + 30, CLOSE = 16 * 60, EARLY = 13 * 60, PRE = 7 * 60, POST = 20 * 60;

const isTradingDay = (t: Date) => { const { day, wd } = ny(t); return !["Sat", "Sun"].includes(wd) && !HOLIDAYS.has(day); };

export function session(t: Date = new Date()): Session {
  const { day, min } = ny(t);
  const today = isTradingDay(t);
  if (today) {
    const early = EARLY_CLOSE.has(day);
    const close = early ? EARLY : CLOSE;
    if (min >= OPEN && min < close) return "regular";
    if (min >= PRE && min < OPEN) return "extended";
    if (min >= close && min < POST && !early) return "extended";
    if (min < PRE) return "overnight"; // the overnight session that started the evening before
  }
  // from 20:00 the overnight session runs into the next trading day's morning
  if (min >= POST && isTradingDay(new Date(t.getTime() + 12 * 3600_000))) return "overnight";
  return "closed";
}

export const SESSION_LABEL: Record<Session, string> = {
  regular: "US market open",
  extended: "US extended hours",
  overnight: "US overnight session",
  closed: "US market closed",
};

/** The next start of regular hours (9:30 New York) after t, or null if none within 10 days. Regular hours always open
 *  on a quarter hour in UTC, so stepping in 15-minute steps lands on it exactly. */
export function nextRegularOpen(t: Date = new Date()): Date | null {
  const step = 15 * 60_000;
  let x = Math.ceil(t.getTime() / step) * step;
  const end = t.getTime() + 10 * 86_400_000;
  let prev = session(new Date(x - step));
  for (; x <= end; x += step) {
    const s = session(new Date(x));
    if (s === "regular" && prev !== "regular") return new Date(x);
    prev = s;
  }
  return null;
}
