import { createPublicClient, erc20Abi, formatEther, http, type Address } from "viem";
import { ROBINHOOD } from "./networks";
import { srv } from "@/lib/serverRpc";
import { BID_WINDOW, SLOTS, SPOT, SPOT_START, WEEK, epochAt, epochStart, spotlightAbi } from "./spotlight";

const net = ROBINHOOD;
const iso = (t: number) => new Date(t * 1000).toISOString();
const stoa = (v: bigint) => Number(formatEther(v));

type EpochInfo = readonly [{ slots: number; cutBps: number; entryFee: bigint; minBid: bigint; maxBid: bigint; quorum: bigint }, boolean, boolean, readonly Address[], readonly Address[]];

/** Server side: Spotlight on Robinhood Chain right now, read from SpotlightMarket. One snapshot for the API and MCP:
 *  the week in progress (phase and its closing times), the rules, every candidate with its bid and votes, last week's
 *  winners, and the $STOA locked. */
export async function readSpotlight() {
  if (!SPOT) throw new Error("Spotlight is not deployed");
  const spot: Address = SPOT;
  const rpcs = [...(net.chain.rpcUrls.default.http as readonly string[]), net.logsRpc];
  let last: unknown;
  for (const url of rpcs) {
    try {
      const c = createPublicClient({ chain: net.chain, transport: http(srv(url), { fetchOptions: { headers: { "user-agent": "curl/8.5.0" } }, timeout: 8_000 }) });
      const now = Math.floor(Date.now() / 1000);
      const e = epochAt(now);
      const race = Math.max(0, e);
      const start = epochStart(race);
      const [info, prev, locked, paid, burned, paused] = await Promise.all([
        c.readContract({ address: SPOT, abi: spotlightAbi, functionName: "epochInfo", args: [BigInt(race)] }) as Promise<EpochInfo>,
        e >= 1 ? (c.readContract({ address: SPOT, abi: spotlightAbi, functionName: "epochInfo", args: [BigInt(e - 1)] }) as Promise<EpochInfo>) : Promise.resolve(null),
        c.readContract({ address: SPOT, abi: spotlightAbi, functionName: "totalLocked" }),
        c.readContract({ address: SPOT, abi: spotlightAbi, functionName: "totalPaidToVoters" }),
        c.readContract({ address: SPOT, abi: spotlightAbi, functionName: "totalBurned" }),
        c.readContract({ address: SPOT, abi: spotlightAbi, functionName: "paused" }),
      ]);
      const [p, , , list] = info;
      const rows = list.length
        ? await c.multicall({ contracts: list.map((t) => ({ address: spot, abi: spotlightAbi, functionName: "candidates", args: [BigInt(race), t] })), allowFailure: false })
        : [];
      const tokens = [...new Set([...list, ...(prev?.[4] ?? [])])];
      const syms = tokens.length
        ? await c.multicall({ contracts: tokens.map((t) => ({ address: t, abi: erc20Abi, functionName: "symbol" })), allowFailure: true })
        : [];
      const sym = (t: Address) => {
        const i = tokens.indexOf(t);
        const known = net.tokens.find((x) => x.address.toLowerCase() === t.toLowerCase());
        return known?.symbol ?? (syms[i]?.status === "success" ? String(syms[i].result).slice(0, 16) : null);
      };
      const candidates = list
        .map((t, i) => {
          const [pot, votes, , , , canceled] = rows[i] as unknown as readonly [bigint, bigint, bigint, number, boolean, boolean, boolean];
          return { token: t, symbol: sym(t), bidEth: Number(formatEther(pot)), votesStoa: stoa(votes), reachesQuorum: votes >= p.quorum && votes > 0n, canceled };
        })
        .sort((a, b) => b.bidEth - a.bidEth);
      const phase = e < 0 ? "before_week_1" : now < start + BID_WINDOW ? "bids_open" : "votes_only";
      return {
        chain: "robinhood", chainId: net.chain.id, contract: SPOT, paused,
        week: race + 1, phase,
        opensAt: e < 0 ? iso(SPOT_START) : null,
        bidsCloseAt: iso(start + BID_WINDOW), votesCloseAt: iso(start + WEEK),
        rules: { slots: Number(p.slots) || SLOTS, quorumStoa: stoa(p.quorum), minBidEth: Number(formatEther(p.minBid)), maxBidEth: Number(formatEther(p.maxBid)), entryFeeEth: Number(formatEther(p.entryFee)), toVotersPct: 100 - Number(p.cutBps) / 100 },
        stoaLocked: stoa(locked as bigint),
        candidates,
        lastWeekWinners: prev ? prev[4].map((t) => ({ token: t, symbol: sym(t) })) : [],
        totals: { ethPaidToVoters: Number(formatEther(paid as bigint)), stoaBurned: stoa(burned as bigint) },
        note: `Slots are sponsored and not reviewed by Stoa. The largest bids with at least the quorum of votes win; voters share ${100 - Number(p.cutBps) / 100}% of a winning bid in ETH. Nothing is promised: payouts depend only on what projects bid. Run safety_check before buying a Spotlight token. Lock and vote on stoadex.com/spotlight.`,
        updated: iso(now),
      };
    } catch (x) {
      last = x;
    }
  }
  throw last;
}
