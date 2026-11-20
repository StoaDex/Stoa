import { readSpotlight } from "@/lib/spotlightServer";

export const revalidate = 30;

/** Spotlight on Robinhood Chain right now: the week, its phase and closing times, the rules, every candidate with its
 *  ETH bid and $STOA votes, last week's winners and the $STOA locked. */
export async function GET() {
  try {
    return Response.json(await readSpotlight(), { headers: { "cache-control": "public, s-maxage=30, stale-while-revalidate=120", "access-control-allow-origin": "*" } });
  } catch {
    return Response.json({ error: "Robinhood Chain did not answer, try again in a minute" }, { status: 503 });
  }
}
