import { isAddress } from "viem";
import { readEarned } from "@/lib/spotlightEarned";

/** GET /api/spotlight/earned?address=0x…: ETH a wallet has earned in Spotlight (claimed or not), by week and token */
export async function GET(req: Request) {
  const a = new URL(req.url).searchParams.get("address") ?? "";
  if (!isAddress(a, { strict: false })) return Response.json({ error: "address must be a wallet address" }, { status: 400 });
  try {
    return Response.json(await readEarned(a), { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch {
    return Response.json({ error: "Robinhood Chain did not answer, try again in a minute" }, { status: 503 });
  }
}
