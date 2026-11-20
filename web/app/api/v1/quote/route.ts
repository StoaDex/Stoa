import { API_HEADERS, apiQuote, limited } from "@/lib/api";

// GET /api/v1/quote?chain=robinhood&sellToken=native&buyToken=0x…&amount=10000000000000000&slippageBps=50&taker=0x…&recipient=0x…&referrer=0x…
// The router's best route for this exact amount; with a taker, also the swap transaction to send. Docs: /docs/api
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const block = limited(req);
  if (block) return block;
  const u = new URL(req.url).searchParams;
  const get = (k: string) => u.get(k) ?? undefined;
  return apiQuote({
    chain: get("chain") ?? "", sellToken: get("sellToken") ?? "", buyToken: get("buyToken") ?? "", amount: get("amount") ?? "",
    slippageBps: get("slippageBps"), taker: get("taker"), recipient: get("recipient"), referrer: get("referrer"), deadlineSeconds: get("deadlineSeconds"),
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: API_HEADERS });
}
