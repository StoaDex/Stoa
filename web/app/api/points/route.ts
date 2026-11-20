import { isAddress } from "viem";
import { SEASON_START, readPoints, readPreview } from "@/lib/points";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** GET /api/points?address=0x…: one wallet's season points and rank. Without an address: the top 100.
 *  &preview=1 before the season starts: the same rules over the last 7 days (what it would have earned). */
export async function GET(req: Request) {
  const a = (new URL(req.url).searchParams.get("address") ?? "").toLowerCase();
  if (a && !isAddress(a, { strict: false })) return Response.json({ error: "address must be a wallet address" }, { status: 400 });
  const preview = new URL(req.url).searchParams.get("preview") === "1" && Date.now() / 1000 < SEASON_START;
  try {
    const b = preview ? await readPreview() : await readPoints();
    const head = { seasonStart: b.seasonStart, updated: b.updated, wallets: b.wallets, preview, note: (preview ? "Preview only, last 7 days, not counted. " : "") + "Points have no promised value: not a token, not claimable, not transferable. Rules: stoadex.com/points" };
    if (!a) return Response.json({ ...head, top: b.rows.slice(0, 100) }, { headers: { "cache-control": "public, s-maxage=120, stale-while-revalidate=300" } });
    const i = b.rows.findIndex((r) => r.address === a);
    return Response.json({ ...head, address: a, rank: i < 0 ? null : i + 1, points: i < 0 ? 0 : b.rows[i].points, row: i < 0 ? null : b.rows[i] }, { headers: { "cache-control": "public, s-maxage=60" } });
  } catch {
    return Response.json({ error: "The chains did not answer, try again in a minute" }, { status: 503 });
  }
}
