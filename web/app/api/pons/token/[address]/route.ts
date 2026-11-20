import { getAddress, isAddress } from "viem";
import { readLaunch } from "@/lib/ponsLaunch";

// One Pons launch for /launches/<address>: curve progress, price, market cap and whether Stoa routes it, read from
// Robinhood Chain. A handful of reads, so the CDN keeps each answer for only a few seconds.
export const dynamic = "force-dynamic";
const CACHE = { "cache-control": "public, s-maxage=5, stale-while-revalidate=30" };

export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!isAddress(address, { strict: false })) return Response.json({ error: "not an address" }, { status: 400 });
  try {
    const l = await readLaunch(getAddress(address));
    if (!l) return Response.json({ error: "not a Pons launch" }, { status: 404, headers: { "cache-control": "public, s-maxage=300" } });
    return Response.json(l, { headers: CACHE });
  } catch {
    return Response.json({ error: "Robinhood Chain RPC unavailable, try again shortly" }, { status: 503 });
  }
}
