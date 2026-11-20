import "server-only";
import { createPublicClient, erc20Abi, formatEther, getAddress, http, type Address } from "viem";
import { ROBINHOOD } from "./networks";
import { srv } from "@/lib/serverRpc";
import { SPOT, epochAt, spotlightAbi } from "./spotlight";

const net = ROBINHOOD;

export type Earned = { address: Address; eth: number; weeks: number; rows: { week: number; token: Address; symbol: string; eth: number; claimed: boolean }[] };

/** what a wallet has earned in Spotlight, claimed or not: for every settled week and every winning token it voted
 *  for, payout × its votes ÷ all votes (the contract's own claimable formula, without the claimed check). Read
 *  from SpotlightMarket's views, nothing indexed. */
export async function readEarned(who: string): Promise<Earned> {
  const address = getAddress(who);
  const empty: Earned = { address, eth: 0, weeks: 0, rows: [] };
  const e = epochAt(Math.floor(Date.now() / 1000));
  if (!SPOT || e < 1) return empty;
  const spot: Address = SPOT;
  const c = createPublicClient({ chain: net.chain, transport: http(srv(net.chain.rpcUrls.default.http[0]), { timeout: 10_000, fetchOptions: { headers: { "user-agent": "curl/8.5.0" } } }) });
  const eps = Array.from({ length: e }, (_, i) => i);
  const voted = await c.multicall({ contracts: eps.map((x) => ({ address: spot, abi: spotlightAbi, functionName: "votedTokens" as const, args: [BigInt(x), address] as const })), allowFailure: false });
  const pairs = eps.flatMap((x, i) => (voted[i] as readonly Address[]).map((t) => [x, t] as const));
  if (!pairs.length) return empty;
  const r = await c.multicall({
    allowFailure: false,
    contracts: pairs.flatMap(([x, t]) => [
      { address: spot, abi: spotlightAbi, functionName: "candidates" as const, args: [BigInt(x), t] as const },
      { address: spot, abi: spotlightAbi, functionName: "votesOf" as const, args: [BigInt(x), t, address] as const },
      { address: spot, abi: spotlightAbi, functionName: "claimable" as const, args: [BigInt(x), t, address] as const },
    ]),
  });
  const won = pairs.map(([x, t], i) => {
    const [, votes, payout, , , , isWon] = r[3 * i] as unknown as readonly [bigint, bigint, bigint, number, boolean, boolean, boolean];
    const mine = r[3 * i + 1] as bigint, left = r[3 * i + 2] as bigint;
    const wei = isWon && votes > 0n ? (payout * mine) / votes : 0n;
    return { week: x + 1, token: t, wei, claimed: wei > 0n && left === 0n };
  }).filter((w) => w.wei > 0n);
  const toks = [...new Set(won.map((w) => w.token))];
  const syms = toks.length ? await c.multicall({ contracts: toks.map((t) => ({ address: t, abi: erc20Abi, functionName: "symbol" as const })), allowFailure: true }) : [];
  const sym = (t: Address) => { const i = toks.indexOf(t); return syms[i]?.status === "success" ? String(syms[i].result).slice(0, 16) : `${t.slice(0, 6)}…`; };
  const rows = won.map((w) => ({ week: w.week, token: w.token, symbol: sym(w.token), eth: Number(formatEther(w.wei)), claimed: w.claimed }));
  const total = won.reduce((a, w) => a + w.wei, 0n);
  return { address, eth: Number(formatEther(total)), weeks: new Set(rows.map((x) => x.week)).size, rows };
}
