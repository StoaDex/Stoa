import { createPublicClient, http, parseAbiItem, type Address } from "viem";
import { NATIVE } from "./tokens";
import type { Net } from "./networks";
import { srv } from "@/lib/serverRpc";

const INIT = parseAbiItem(
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)",
);

export type PoolKey = { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address };

const lc = (a: string) => a.toLowerCase();

/** V4 pools pairing `token` with the native coin, its wrapped token or the main stablecoin, newest first. */
export async function findV4Pools(net: Net, token: Address): Promise<PoolKey[]> {
  if (!net.logsRpc) return [];
  const c = createPublicClient({ chain: net.chain, transport: http(srv(net.logsRpc)) });
  const head = await c.getBlockNumber();
  // RPCs that cap the block range per query are read in windows, newest first, stopping at the first hits
  const windows: [bigint, bigint][] = [];
  if (net.logsSpan === 0n) windows.push([0n, head]);
  else for (let z = head; z >= 0n && windows.length < 20; z -= net.logsSpan) windows.push([z - net.logsSpan + 1n > 0n ? z - net.logsSpan + 1n : 0n, z]);
  const bases = new Set([lc(NATIVE), lc(net.wrapped), lc(net.stable)]);
  for (const [fromBlock, toBlock] of windows) {
    const [as0, as1] = await Promise.all([
      c.getLogs({ address: net.v4PoolManager, event: INIT, args: { currency0: token }, fromBlock, toBlock }),
      c.getLogs({ address: net.v4PoolManager, event: INIT, args: { currency1: token }, fromBlock, toBlock }),
    ]);
    const found = [...as0, ...as1]
      .filter((l) => bases.has(lc(lc(l.args.currency0!) === lc(token) ? l.args.currency1! : l.args.currency0!)))
      .sort((a, b) => Number(b.blockNumber - a.blockNumber))
      .map((l) => ({
        currency0: l.args.currency0!, currency1: l.args.currency1!, fee: Number(l.args.fee), tickSpacing: Number(l.args.tickSpacing), hooks: l.args.hooks!,
      }));
    if (found.length) return found;
  }
  return [];
}

export const sameKey = (a: PoolKey, b: PoolKey) =>
  lc(a.currency0) === lc(b.currency0) && lc(a.currency1) === lc(b.currency1) && a.fee === b.fee && a.tickSpacing === b.tickSpacing && lc(a.hooks) === lc(b.hooks);
