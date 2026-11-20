import { createPublicClient, formatUnits, http } from "viem";
import { ROBINHOOD } from "@/lib/networks";
import { buybackAbi } from "@/lib/abi";
import { srv } from "@/lib/serverRpc";

// GET /api/launch: the few on-chain numbers the launch panel (/launch) needs that no other endpoint gives:
// $STOA burned by the weekly buyback so far. Read-only; the CDN keeps the answer 30 seconds.
export const dynamic = "force-dynamic";

export async function GET() {
  const net = ROBINHOOD;
  const bb = net.contracts.buyback;
  let burned: number | null = null;
  try {
    if (bb) {
      const c = createPublicClient({ chain: net.chain, transport: http(srv(net.chain.rpcUrls.default.http[0])) });
      burned = Number(formatUnits(await c.readContract({ address: bb, abi: buybackAbi, functionName: "totalBurned" }), 18));
    }
  } catch { /* chain did not answer */ }
  return Response.json({ buyback: bb ?? null, stoaBurnedByBuybacks: burned, updated: Math.floor(Date.now() / 1000) }, { headers: { "cache-control": "public, s-maxage=30, stale-while-revalidate=60" } });
}
