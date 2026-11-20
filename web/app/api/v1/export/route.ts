import { readSwaps } from "@/lib/routerStats";
import { readPoints } from "@/lib/points";
import { readSpotlight } from "@/lib/spotlightServer";
import { stockTokens } from "@/lib/stocks";
import { venueSnapshot } from "@/lib/venueSnapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ZERO = "0x0000000000000000000000000000000000000000";
const H = { "cache-control": "public, s-maxage=3600, stale-while-revalidate=7200", "access-control-allow-origin": "*" };

/** GET /api/v1/export?set=swaps|points|spotlight|stocks|venues: Stoa's public on-chain data in one piece, for the open dataset on
 *  Hugging Face (scripts/hf-publish.py) and anyone who wants it.
 *  swaps: every swap through Stoa's routers (Routed events), oldest first. points: the season 1 board.
 *  spotlight: the Spotlight week in progress. stocks: every Robinhood Stock Token, Robinhood's bid/ask next to the
 *  deepest on-chain pool. venues: a fixed basket of swaps quoted on every venue the router uses, in one block (uncached). Everything here is public on-chain already; nothing off-chain is added. */
export async function GET(req: Request) {
  const set = new URL(req.url).searchParams.get("set") ?? "swaps";
  try {
    if (set === "swaps") {
      const s = await readSwaps();
      const rows = [...s].sort((a, b) => a.time - b.time).map((x) => ({
        chain: x.chain, time: x.time, tx: x.hash,
        token_in: x.tokenIn.toLowerCase(), symbol_in: x.symIn, amount_in: x.amountIn,
        token_out: x.tokenOut.toLowerCase(), symbol_out: x.symOut, amount_out: x.amountOut,
        usd: x.usd, trader: x.trader ?? null, referrer: x.referrer && x.referrer !== ZERO ? x.referrer : null,
      }));
      return Response.json({ set, generated: Math.floor(Date.now() / 1000), rows }, { headers: H });
    }
    if (set === "points") {
      const b = await readPoints();
      return Response.json({ set, generated: Math.floor(Date.now() / 1000), seasonStart: b.seasonStart, rows: b.rows.map((r, i) => ({ rank: i + 1, ...r })) }, { headers: H });
    }
    if (set === "spotlight") return Response.json({ set, generated: Math.floor(Date.now() / 1000), ...(await readSpotlight()) }, { headers: H });
    if (set === "stocks") {
      const st = await stockTokens();
      const rows = st.stocks.map((x) => {
        const mid = x.bid != null && x.ask != null ? (x.bid + x.ask) / 2 : null;
        const onchain = x.dex?.priceUsd ?? null;
        return {
          symbol: x.symbol, name: x.name, address: x.address.toLowerCase(), robinhood_bid: x.bid, robinhood_ask: x.ask, halted: x.halted,
          onchain_price: onchain, gap_pct: mid && onchain ? Math.round(((onchain - mid) / mid) * 1e6) / 1e4 : null,
          liquidity_usd: x.dex?.liquidityUsd ?? null, volume24h_usd: x.dex?.volume24h ?? null, change24h_pct: x.dex?.change24h ?? null, stoa_routes: x.route,
        };
      });
      return Response.json({ set, generated: Math.floor(Date.now() / 1000), updated: st.updated, rows }, { headers: H });
    }
    if (set === "venues") return Response.json({ set, generated: Math.floor(Date.now() / 1000), rows: await venueSnapshot() }, { headers: { "cache-control": "no-store", "access-control-allow-origin": "*" } });
    return Response.json({ error: "set must be swaps, points, spotlight, stocks or venues" }, { status: 400 });
  } catch {
    return Response.json({ error: "The chains did not answer, try again in a minute" }, { status: 503 });
  }
}
