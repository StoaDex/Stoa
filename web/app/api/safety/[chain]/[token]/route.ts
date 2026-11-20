import { isAddress } from "viem";
import { netByKey } from "@/lib/networks";
import { readSafety } from "@/lib/safety";

// GET /api/safety/<chain>/<token>: a simulated buy and sell through the live router, plus how concentrated the supply
// is. Read-only (eth_call); the CDN keeps an answer two minutes.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ chain: string; token: string }> }) {
  const { chain, token } = await params;
  const net = netByKey(chain);
  if (!net || !isAddress(token, { strict: false })) return Response.json({ error: "unknown chain or not an address" }, { status: 400 });
  try {
    return Response.json(await readSafety(net, token), { headers: { "cache-control": "public, s-maxage=120, stale-while-revalidate=300" } });
  } catch {
    return Response.json({ error: "the chain did not answer, try again shortly" }, { status: 503 });
  }
}
