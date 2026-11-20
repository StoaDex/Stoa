import { computeGuard } from "@/lib/v4guard";

// GET /api/v1/v4-guard: pairs where someone other than Stoa's keeper changed pool keys on the first Uniswap V4
// adapter (Robinhood Chain). Quotes skip that adapter on those pairs until the timelock replaces it.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const g = await computeGuard();
    return Response.json(g, { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=60" } });
  } catch {
    // unknown: treat every pair on the old adapter as suspect rather than trust it
    return Response.json({ oldInRouter: true, poisoned: ["*"] }, { headers: { "cache-control": "no-store" } });
  }
}
