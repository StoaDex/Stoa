import { encodeFunctionData, getAddress, isAddress, type Address, type Hex } from "viem";
import { limited } from "@/lib/api";
import { isJson, ethToTokenRoute, stoaPrices } from "@/lib/anychainServer";
import { stockTokens } from "@/lib/stocks";
import { ETH_USD_FLOOR } from "@/lib/anychain";
import { CROSS_BUY, CROSS_BUY_ABI, STOCK_MAX_USD, STOCK_SLIPPAGE_BPS, STOCK_SOURCES, checkStockQuote, type StockQuote } from "@/lib/stockAnychain";
import type { RelayOrder } from "@/lib/relayOrder";

// POST /api/anychain/stock {chainId, user, stock, ethOut, referrer?}: a Relay route that deposits ETH on the source
// chain and, on Robinhood Chain, calls StoaCrossBuy.buy with `ethOut` ETH to buy `stock` for the user. Stoa builds the
// call from its own router quote; the quote is checked here and again in the browser (lib/stockAnychain.ts).
export const dynamic = "force-dynamic";
const ZERO = "0x0000000000000000000000000000000000000000";

export async function POST(req: Request) {
  const slow = limited(req);
  if (slow) return slow;
  if (!isJson(req)) return Response.json({ error: "bad request" }, { status: 415 });
  const b = (await req.json().catch(() => null)) as { chainId?: number; user?: string; stock?: string; ethOut?: string; referrer?: string } | null;
  const chainId = Number(b?.chainId), user = String(b?.user ?? ""), stockIn = String(b?.stock ?? "");
  let ethOut: bigint;
  try { ethOut = BigInt(String(b?.ethOut ?? "")); } catch { return Response.json({ error: "bad amount" }, { status: 400 }); }
  if (!(STOCK_SOURCES as readonly number[]).includes(chainId) || !isAddress(user, { strict: false }) || !isAddress(stockIn, { strict: false }) || ethOut <= 0n) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const ref = b?.referrer && isAddress(b.referrer, { strict: false }) && b.referrer.toLowerCase() !== user.toLowerCase() ? getAddress(b.referrer) : (ZERO as Address);
  const { stocks } = await stockTokens();
  const s = stocks.find((x) => x.address.toLowerCase() === stockIn.toLowerCase());
  if (!s) return Response.json({ error: "Only Robinhood stock tokens can be bought this way." }, { status: 400 });
  if (s.halted) return Response.json({ error: `${s.symbol} is halted right now. Try again when it trades.` }, { status: 422 });
  const px = await stoaPrices();
  if (!px.ethUsd) return Response.json({ error: "busy" }, { status: 503 });
  if ((Number(ethOut) / 1e18) * Math.max(px.ethUsd, ETH_USD_FLOOR) > STOCK_MAX_USD) {
    return Response.json({ error: `Buying stocks from another chain is limited to $${STOCK_MAX_USD} per purchase for now. Use a smaller amount.` }, { status: 422 });
  }
  const stock = getAddress(s.address);
  const rt = await ethToTokenRoute(stock, ethOut);
  if (!rt) return Response.json({ error: "no route" }, { status: 404 });
  const out = rt.route.amountOut, minOut = (out * (10_000n - STOCK_SLIPPAGE_BPS)) / 10_000n;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const buyData = encodeFunctionData({
    abi: CROSS_BUY_ABI, functionName: "buy",
    args: [stock, rt.route.mid, rt.route.leg1, rt.route.leg2, minOut, getAddress(user), deadline, ref],
  });
  const r = await fetch("https://api.relay.link/quote", {
    method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(12_000),
    body: JSON.stringify({
      user, recipient: user, refundTo: user, originChainId: chainId, destinationChainId: 4663, originCurrency: ZERO,
      destinationCurrency: ZERO, amount: ethOut.toString(), tradeType: "EXACT_OUTPUT", protocolVersion: "v2",
      txs: [{ to: CROSS_BUY, value: ethOut.toString(), data: buyData }],
    }),
  }).catch(() => null);
  const j = r ? ((await r.json().catch(() => null)) as Record<string, unknown> | null) : null;
  type Step = { id?: string; requestId?: string; items?: { data?: { chainId?: number; to?: string; data?: string; value?: string } }[] };
  const steps = (j?.steps ?? []) as Step[];
  const order = (j?.protocol as { v2?: { orderData?: RelayOrder } } | undefined)?.v2?.orderData;
  const item = steps.length === 1 && steps[0].items?.length === 1 ? steps[0].items[0].data : undefined;
  if (!r?.ok || !order || !item?.to || !item.data || item.value === undefined) {
    return Response.json({ error: r?.status === 429 ? "busy" : "no route" }, { status: r?.status === 429 ? 429 : 404 });
  }
  const details = (j?.details ?? {}) as { currencyIn?: { amountUsd?: string }; timeEstimate?: number };
  const q: StockQuote = {
    chainId, user: getAddress(user), stock, symbol: s.symbol, decimals: rt.decimals,
    ethOut: ethOut.toString(), out: out.toString(), minOut: minOut.toString(), buyData: buyData as Hex,
    tx: { chainId: Number(item.chainId), to: getAddress(item.to), data: item.data as Hex, value: String(item.value) },
    order, requestId: String(steps[0].requestId ?? ""), ethUsd: px.ethUsd,
    inUsd: details.currencyIn?.amountUsd !== undefined ? Number(details.currencyIn.amountUsd) : null,
    etaSeconds: typeof details.timeEstimate === "number" ? details.timeEstimate : null,
  };
  const why = checkStockQuote(q, { user: q.user, chainId, stock, ethOut });
  if (why) return Response.json({ error: why.startsWith("Buying") ? why : "no checkable route" }, { status: 422 });
  return Response.json(q, { headers: { "cache-control": "no-store" } });
}
