import { createPublicClient, http, type AbiEvent, type Address, type GetLogsReturnType } from "viem";
import type { Net } from "./networks";
import { srv } from "@/lib/serverRpc";

/** eth_getLogs from `from` to the head, in windows when the network's RPC caps the block range. */
export async function getLogsOn<E extends AbiEvent>(
  net: Net, q: { address: Address; event: E; args?: Record<string, unknown>; fromBlock: bigint },
): Promise<GetLogsReturnType<E>> {
  const c = createPublicClient({ chain: net.chain, transport: http(srv(net.logsRpc)) });
  if (net.logsSpan === 0n) return (await c.getLogs({ ...q, toBlock: "latest" } as never)) as GetLogsReturnType<E>;
  const head = await c.getBlockNumber();
  const out: unknown[] = [];
  for (let a = q.fromBlock; a <= head; a += net.logsSpan) {
    const z = a + net.logsSpan - 1n < head ? a + net.logsSpan - 1n : head;
    out.push(...((await c.getLogs({ ...q, fromBlock: a, toBlock: z } as never)) as unknown[]));
  }
  return out as GetLogsReturnType<E>;
}
