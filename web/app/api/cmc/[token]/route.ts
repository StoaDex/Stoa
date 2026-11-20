import { isAddress } from "viem";
import { cmcDexToken } from "@/lib/cmc";

// GET /api/cmc/<token>: CoinMarketCap's DEX data for a Robinhood Chain token (market cap, liquidity, last 24h), shown on
// Trade. The CDN keeps an answer five minutes so the CMC key's monthly credits go a long way.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isAddress(token, { strict: false })) return Response.json({ error: "not an address" }, { status: 400 });
  const r = await cmcDexToken(token, 300);
  if (r === "error") return Response.json({ error: "CoinMarketCap did not answer" }, { status: 503, headers: { "cache-control": "public, s-maxage=30" } });
  return Response.json(r ?? { listedOnCmc: false }, { headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
