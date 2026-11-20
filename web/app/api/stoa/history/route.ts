import { unstable_cache } from "next/cache";
import { createPublicClient, formatUnits, http, parseAbi } from "viem";
import { ROBINHOOD } from "@/lib/networks";
import { srv } from "@/lib/serverRpc";
import { readStoaHistory } from "@/lib/stoaHistory";

// GET /api/stoa/history: $STOA per UTC day since launch (holders, burned, locked, on the launch curve), rebuilt from
// the token's Transfer events, plus how the burn splits between the weekly buyback, Spotlight and everything else.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const cached = unstable_cache(() => readStoaHistory(), ["stoa-history-v1"], { revalidate: 3600 });
const counters = parseAbi(["function totalBurned() view returns (uint256)"]);

export async function GET() {
  try {
    const net = ROBINHOOD, C = net.contracts;
    const c = createPublicClient({ chain: net.chain, transport: http(srv(net.chain.rpcUrls.default.http[0])) });
    const read = (a?: `0x${string}`) => (a ? c.readContract({ address: a, abi: counters, functionName: "totalBurned" }).then((v) => Number(formatUnits(v, 18))).catch(() => null) : Promise.resolve(null));
    const [h, buyback, spotlight] = await Promise.all([cached(), read(C.buyback), read(C.spotlight)]);
    return Response.json({ ...h, burnBy: { buyback, spotlight } }, { headers: { "cache-control": "public, s-maxage=600, stale-while-revalidate=3600" } });
  } catch {
    return Response.json({ error: "the chain did not answer, try again shortly" }, { status: 503 });
  }
}
