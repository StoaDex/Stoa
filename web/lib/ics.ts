import { SPOT_START, WEEK } from "./spotlight";
import { SEASON_START } from "./pointsScore";

/** Calendar files (.ics) people can add with one tap: Points season 1 starting, and the weekly Spotlight reminders
 *  (last hours to vote, then a check for ETH to claim). Times in UTC; every calendar app shows them in local time. */
type Ev = { uid: string; start: number; mins: number; title: string; text: string; url: string; weekly?: number; alarmMins?: number };

const stamp = (t: number) => new Date(t * 1000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
// lines longer than 75 octets are folded (RFC 5545 3.1)
const fold = (l: string) => { const out: string[] = []; let s = l; while (s.length > 74) { out.push(s.slice(0, 74)); s = " " + s.slice(74); } out.push(s); return out.join("\r\n"); };

export const CALENDARS: Record<string, { name: string; events: Ev[] }> = {
  points: {
    name: "Stoa Points",
    events: [{
      uid: "points-s1-start", start: SEASON_START, mins: 30, title: "Stoa Points season 1 starts",
      text: "From now on, swaps through Stoa and swaps made through your referral link earn points. Points have no promised value.",
      url: "https://stoadex.com/points", alarmMins: 15,
    }],
  },
  spotlight: {
    name: "Stoa Spotlight",
    events: [
      {
        uid: "spotlight-vote", start: SPOT_START + WEEK - 4 * 3600, mins: 240, title: "Spotlight: last hours to vote",
        text: "Voting closes at the end of this event. Vote with your locked $STOA for the tokens you back: the winners' ETH goes to their voters.",
        url: "https://stoadex.com/spotlight#mine", weekly: 12, alarmMins: 0,
      },
      {
        uid: "spotlight-claim", start: SPOT_START + WEEK + 6 * 3600, mins: 30, title: "Spotlight: check for ETH to claim",
        text: "Last week is settled. If a token you voted for won, your ETH is ready to claim.",
        url: "https://stoadex.com/spotlight#claims", weekly: 12,
      },
    ],
  },
};

export function ics(id: string): string | null {
  const cal = CALENDARS[id];
  if (!cal) return null;
  const now = Math.floor(Date.now() / 1000);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Stoa//stoadex.com//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${esc(cal.name)}`];
  for (const e of cal.events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}@stoadex.com`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(e.start)}`, `DTEND:${stamp(e.start + e.mins * 60)}`,
      `SUMMARY:${esc(e.title)}`, `DESCRIPTION:${esc(`${e.text}\n${e.url}`)}`, `URL:${e.url}`);
    if (e.weekly) lines.push(`RRULE:FREQ=WEEKLY;COUNT=${e.weekly}`);
    if (e.alarmMins !== undefined) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.title)}`, `TRIGGER:-PT${e.alarmMins}M`, "END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
