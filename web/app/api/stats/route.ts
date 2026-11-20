import { readRouterStats } from "@/lib/routerStats";

// Swaps routed through Stoa on every chain, read from the routers' events on request and kept by the CDN for
// 5 minutes. Not prerendered at build (a slow RPC would fail the deploy).
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const CACHE = { "cache-control": "public, s-maxage=300, stale-while-revalidate=600" };

/** Volume and swaps through the Stoa router, per chain and per UTC day, plus the latest swaps. Used by /stats. */
export async function GET() {
  try {
    const s = await readRouterStats();
    return Response.json({
      ...s,
      method: "One Routed event per settled swap on each Stoa router (a failed swap reverts and emits nothing). Each swap counts once, valued on its stablecoin side, else on its gas-token side at the router's current quote, else at DexScreener's current price.",
    }, { headers: CACHE });
  } catch {
    return Response.json({ error: "RPC unavailable, try again shortly" }, { status: 503 });
  }
}
