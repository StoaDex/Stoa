/** Stoa Explorer, a two-week quest run on Zealy. The on-chain tasks are checked by /api/quest/zealy, which Zealy calls
 *  with each entrant's wallet (/api/quest answers the same in Galxe's format). Times are UTC. */
export const QUEST = {
  name: "Stoa Explorer",
  start: Date.UTC(2026, 10, 19, 19, 0) / 1000, // Thu 19 Nov 2026, 19:00 UTC
  end: Date.UTC(2026, 11, 4, 23, 59, 59) / 1000, // Fri 4 Dec 2026, 23:59 UTC
  minUsd: 10, holdUsd: 5,
  pool: "$200 in $STOA",
  winners: 40,
  url: process.env.NEXT_PUBLIC_QUEST_URL || "https://zealy.io/cw/stoa",
} as const;
const D = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Sat 21 Nov, 00:00 UTC" */
export const questDate = (t: number) => { const d = new Date(t * 1000); return `${D[d.getUTCDay()]} ${d.getUTCDate()} ${M[d.getUTCMonth()]}, ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`; };
/** "21 Nov – 4 Dec" */
export const questSpan = () => { const a = new Date(QUEST.start * 1000), b = new Date(QUEST.end * 1000); return `${a.getUTCDate()} ${M[a.getUTCMonth()]} – ${b.getUTCDate()} ${M[b.getUTCMonth()]}`; };
