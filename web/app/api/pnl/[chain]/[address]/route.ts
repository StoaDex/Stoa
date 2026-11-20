import { isAddress } from "viem";
import { netByKey } from "@/lib/networks";
import { readPnl } from "@/lib/pnl";

// GET /api/pnl/<chain>/<address>: profit and loss from the wallet's swaps through Stoa on that network (Portfolio).
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ chain: string; address: string }> }) {
  const { chain, address } = await params;
  const net = netByKey(chain);
  if (!net || !net.contracts.router || !net.deployed || !isAddress(address, { strict: false })) return Response.json({ error: "unknown chain or not an address" }, { status: 400 });
  try {
    return Response.json(await readPnl(net, address), { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=120" } });
  } catch {
    return Response.json({ error: "the chain did not answer, try again shortly" }, { status: 503 });
  }
}
