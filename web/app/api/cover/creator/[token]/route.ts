import { getAddress, isAddress } from "viem";
import { readCreatorHistory } from "@/lib/creatorHistory";

// A Pons token's creator wallet: what it bought in the token's first minute and what it holds now. Shown with Rug
// Cover on /launches/<token>. The balance moves, so the CDN keeps an answer for a minute.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isAddress(token, { strict: false })) return Response.json({ error: "not an address" }, { status: 400 });
  try {
    const h = await readCreatorHistory(getAddress(token));
    if (!h) return Response.json({ error: "not a Pons launch" }, { status: 404, headers: { "cache-control": "public, s-maxage=300" } });
    return Response.json(h, { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch {
    return Response.json({ error: "Robinhood Chain RPC unavailable, try again shortly" }, { status: 503 });
  }
}
