import "server-only";
import { unstable_cache } from "next/cache";
import { readSpotlight } from "./spotlightServer";

export type VoteInfo = {
  token: string; symbol: string; bidEth: number; votesStoa: number; quorumStoa: number; rank: number; of: number;
  winning: boolean; canceled: boolean; week: number; phase: string; votesCloseAt: string; bidsCloseAt: string; toVotersPct: number; slots: number;
};

/** One Spotlight candidate this week, for its share page and card. null when the token is not in this week's race. */
async function load(token: string): Promise<VoteInfo | null> {
  const s = await readSpotlight();
  const live = s.candidates.filter((c) => !c.canceled);
  const c = s.candidates.find((x) => x.token.toLowerCase() === token.toLowerCase());
  if (!c) return null;
  // the slots go to the largest bids among tokens with the quorum of votes (same rule as the contract)
  const leading = live.filter((x) => x.reachesQuorum).slice(0, s.rules.slots).map((x) => x.token.toLowerCase());
  return {
    token: c.token, symbol: c.symbol ?? `${c.token.slice(0, 6)}…`, bidEth: c.bidEth, votesStoa: c.votesStoa, quorumStoa: s.rules.quorumStoa,
    rank: live.findIndex((x) => x.token === c.token) + 1, of: live.length, winning: leading.includes(c.token.toLowerCase()), canceled: c.canceled,
    week: s.week, phase: s.phase, votesCloseAt: s.votesCloseAt, bidsCloseAt: s.bidsCloseAt, toVotersPct: s.rules.toVotersPct, slots: s.rules.slots,
  };
}

export const readVote = unstable_cache(load, ["spotlight-vote"], { revalidate: 120 });

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** "Mon 30 Nov, 00:00 UTC" from an ISO time */
export const utcTxt = (iso: string) => { const d = new Date(iso); return `${DAY[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}, ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`; };
export const ethTxt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: v < 1 ? 4 : 3 });
export const stoaTxt = (v: number) => (v >= 1e6 ? `${(v / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })}M` : v.toLocaleString("en-US", { maximumFractionDigits: 0 }));
