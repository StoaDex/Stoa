import { parseAbi, type Address } from "viem";
import { ROBINHOOD } from "./networks";
import rh from "./deployments-4663.json";

/** Spotlight Market on Robinhood Chain (contracts/src/SpotlightMarket.sol): projects bid ETH for three sponsored slots
 *  a week, $STOA holders lock and vote, and the winners' ETH goes to their voters (10% buys $STOA and burns it).
 *  Deployed with CREATE2, so the address is known before the contract exists: the app checks for code. */
export const SPOT = ROBINHOOD.contracts.spotlight;
export const SPOT_START = Number((rh as { spotlightStart?: number }).spotlightStart ?? 1_795_392_000); // Mon 23 Nov 2026 00:00 UTC
export const WEEK = 7 * 86400;
export const BID_WINDOW = 5 * 86400;
export const SLOTS = 3;
/** Stoa's own bid in Spotlight for its first weeks (week numbers as shown, from 1), so every week has a bid to vote for.
 *  Sent from Stoa's wallet like any other bid, for a token named in the weekly post; projects can outbid it. */
export const HOUSE_BID = { fromWeek: 1, toWeek: 4, eth: 0.11 } as const;

/** tokens the app never shows in Spotlight even if they won (a scam found after the cancel window). Lowercase. */
export const SPOTLIGHT_HIDDEN: string[] = [];

export const spotlightAbi = parseAbi([
  "struct Params { uint8 slots; uint16 cutBps; uint64 entryFee; uint64 minBid; uint96 maxBid; uint128 quorum; }",
  "function start() view returns (uint256)",
  "function paused() view returns (bool)",
  "function burnPot() view returns (uint256)",
  "function totalBurned() view returns (uint256)",
  "function totalPaidToVoters() view returns (uint256)",
  "function totalLocked() view returns (uint256)",
  "function entryFeeFor(uint256 epoch) view returns (uint256)",
  "function paramsFor(uint256 epoch) view returns (Params)",
  "function epochInfo(uint256 epoch) view returns (Params params, bool opened, bool finalized, address[] list, address[] winners)",
  "function candidates(uint256 epoch, address token) view returns (uint128 pot, uint128 votes, uint128 payout, uint8 index, bool listed, bool canceled, bool won)",
  "function accounts(address holder) view returns (uint128 active, uint128 pending, uint64 unlockAt)",
  "function availableVotes(address holder) view returns (uint256)",
  "function votedTokens(uint256 epoch, address voter) view returns (address[])",
  "function votesOf(uint256 epoch, address token, address voter) view returns (uint256)",
  "function contribution(uint256 epoch, address token, address bidder) view returns (uint256)",
  "function claimable(uint256 epoch, address token, address voter) view returns (uint256)",
  "function refundable(uint256 epoch, address token, address bidder) view returns (uint256)",
  "function lock(uint256 amount)",
  "function requestUnlock(uint256 amount)",
  "function withdraw(address to)",
  "function emergencyWithdraw(address to)",
  "function vote(address[] tokens, uint256[] amounts)",
  "function bid(address token) payable",
  "function refund(uint256 epoch, address token, address to) returns (uint256)",
  "function claim(uint256 epoch, address token, address to) returns (uint256)",
  "function claimMany(uint256[] epochs, address[] tokens, address to) returns (uint256)",
  "function finalize(uint256 epoch) returns (address[])",
  "event Bid(uint256 indexed epoch, address indexed token, address indexed bidder, uint256 amount, uint256 entryFee)",
  "event Voted(uint256 indexed epoch, address indexed voter, address[] tokens, uint256[] amounts)",
  "event Finalized(uint256 indexed epoch, address[] winners, uint256 toVoters, uint256 toBurnPot)",
  "event Burned(uint256 ethIn, uint256 stoaBurned)",
]);

export type SpotParams = { slots: number; cutBps: number; entryFee: bigint; minBid: bigint; maxBid: bigint; quorum: bigint };
export type SpotCandidate = { token: Address; pot: bigint; votes: bigint; payout: bigint; index: number; canceled: boolean; won: boolean };

/** the week in progress at unix time `t` (seconds); -1 before week 0 */
export const epochAt = (t: number) => (t < SPOT_START ? -1 : Math.floor((t - SPOT_START) / WEEK));
export const epochStart = (e: number) => SPOT_START + e * WEEK;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Mon 23 Nov, 00:00 UTC" */
export function utc(ts: number) {
  const d = new Date(ts * 1000);
  const hh = String(d.getUTCHours()).padStart(2, "0"), mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${hh}:${mm} UTC`;
}
/** "2d 4h", "3h 12m", "45s" */
export function left(sec: number) {
  if (sec <= 0) return "now";
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m` : `${sec}s`;
}
