import { isAddress } from "viem";
import { limited } from "@/lib/api";
import { aggregatorQuotesWithStatus, aggregatorsOn } from "@/lib/aggregators";

// GET /api/aggregators?sell=&buy=&amount= : 0x's and 1inch's quotes on Robinhood Chain for the same amount, shown next to
// Stoa's route in Trade as a check. Empty list when no aggregator key is set or neither answers.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!aggregatorsOn()) return Response.json({ quotes: [] }, { headers: { "cache-control": "no-store" } });
  const slow = limited(req);
  if (slow) return slow;
  const u = new URL(req.url);
  const sell = u.searchParams.get("sell") ?? "", buy = u.searchParams.get("buy") ?? "", amount = u.searchParams.get("amount") ?? "";
  if (!isAddress(sell, { strict: false }) || !isAddress(buy, { strict: false }) || !/^\d{1,60}$/.test(amount) || amount === "0") {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const { quotes, status } = await aggregatorQuotesWithStatus(sell, buy, amount);
  return Response.json({ quotes, status }, { headers: { "cache-control": "no-store" } });
}
