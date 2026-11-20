import "server-only";
import { erc20Abi, parseAbi, parseAbiItem, type Address } from "viem";
import { PONS_FACTORY, ponsCurveAbi, rhClient } from "./ponsLaunch";

/** What a Pons token's creator wallet bought in the token's first minute and holds now, for Rug Cover's creator
 *  history on the token page: the most common rug on Pons is the creator selling or moving their launch buy. */
export type CreatorHistory = { creator: Address; launchedAt: number; launchBlock: string; devBuy: string; balance: string; supply: string };

const factoryAbi = parseAbi(["function getLaunchedToken(address) view returns (address token, address curve, address creator)"]);
const transfer = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const launchBlocks = new Map<string, bigint>(); // a launch block never changes: keep it for the life of the instance
/** blocks after the launch block counted as "the first minute" (Robinhood Chain makes about 5 blocks a second) */
const FIRST_MINUTE = 300n;

/** the first block at or after `ts`, by binary search from an estimate */
async function blockAt(c: ReturnType<typeof rhClient>, ts: number): Promise<bigint> {
  const head = await c.getBlock();
  if (ts >= Number(head.timestamp)) return head.number;
  const back = await c.getBlock({ blockNumber: head.number > 1_000_000n ? head.number - 1_000_000n : 0n });
  const rate = Number(head.number - back.number) / Math.max(1, Number(head.timestamp - back.timestamp));
  const guess = head.number - BigInt(Math.round((Number(head.timestamp) - ts) * rate));
  let lo = guess > 400_000n ? guess - 400_000n : 0n, hi = guess + 400_000n < head.number ? guess + 400_000n : head.number;
  while (lo > 0n && Number((await c.getBlock({ blockNumber: lo })).timestamp) > ts) lo = lo > 2_000_000n ? lo - 2_000_000n : 0n;
  while (hi < head.number && Number((await c.getBlock({ blockNumber: hi })).timestamp) < ts) hi = hi + 2_000_000n < head.number ? hi + 2_000_000n : head.number;
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    if (Number((await c.getBlock({ blockNumber: mid })).timestamp) < ts) lo = mid + 1n; else hi = mid;
  }
  return lo;
}

export async function readCreatorHistory(token: Address): Promise<CreatorHistory | null> {
  const c = rhClient();
  let rec: readonly [Address, Address, Address];
  try { rec = await c.readContract({ address: PONS_FACTORY, abi: factoryAbi, functionName: "getLaunchedToken", args: [token] }); } catch { return null; }
  if (rec[0].toLowerCase() !== token.toLowerCase()) return null;
  const [, curve, creator] = rec;
  const [launchedAt, balance, supply] = await Promise.all([
    c.readContract({ address: curve, abi: ponsCurveAbi, functionName: "launchedAt" }),
    c.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [creator] }),
    c.readContract({ address: token, abi: erc20Abi, functionName: "totalSupply" }),
  ]);
  const key = token.toLowerCase();
  let lb = launchBlocks.get(key);
  if (lb === undefined) { lb = await blockAt(c, Number(launchedAt)); launchBlocks.set(key, lb); }
  const logs = await c.getLogs({ address: token, event: transfer, args: { to: creator }, fromBlock: lb > 5n ? lb - 5n : 0n, toBlock: lb + FIRST_MINUTE });
  const devBuy = logs.reduce((a, l) => a + (l.args.value ?? 0n), 0n);
  return { creator, launchedAt: Number(launchedAt), launchBlock: lb.toString(), devBuy: devBuy.toString(), balance: balance.toString(), supply: supply.toString() };
}
