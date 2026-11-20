import { NextResponse } from "next/server";
import { mid, stockTokens } from "@/lib/stocks";

export const revalidate = 60;

/** Robinhood Stock Tokens on Robinhood Chain with Robinhood's reference price and the deepest on-chain pool's price. */
export async function GET() {
  try {
    const { stocks, updated } = await stockTokens();
    return NextResponse.json(
      { chain: "robinhood", chainId: 4663, updated: new Date(updated).toISOString(), stocks: stocks.map((s) => ({ symbol: s.symbol, name: s.name, address: s.address, logo: s.logo, referencePriceUsd: mid(s), halted: s.halted, onChain: s.dex, routeOnStoa: s.route })) },
      { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300", "access-control-allow-origin": "*" } },
    );
  } catch {
    return NextResponse.json({ error: "stock token list unavailable, try again in a minute" }, { status: 503 });
  }
}
