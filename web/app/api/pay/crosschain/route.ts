import { getAddress, isAddress, type Hex } from "viem";
import { limited } from "@/lib/api";
import { isJson } from "@/lib/anychainServer";
import { PAY_CROSS_MAX_USDG, PAY_SOURCES, USDG_RH, checkPayCross, type PayCrossQuote } from "@/lib/payAnychain";
import type { RelayOrder } from "@/lib/relayOrder";

// POST /api/pay/crosschain {chainId, payer, to, amount}: Relay route paying `amount` USDG (6 decimals) to `to` on
// Robinhood Chain from ETH on Base, Arbitrum, Optimism or Ethereum. Checked here and again in the browser.
export const dynamic = "force-dynamic";
const ZERO = "0x0000000000000000000000000000000000000000";

export async function POST(req: Request) {
  const slow = limited(req);
  if (slow) return slow;
  if (!isJson(req)) return Response.json({ error: "bad request" }, { status: 415 });
  const b = (await req.json().catch(() => null)) as { chainId?: number; payer?: string; to?: string; amount?: string } | null;
  const chainId = Number(b?.chainId), payer = String(b?.payer ?? ""), to = String(b?.to ?? "");
  let amount: bigint;
  try { amount = BigInt(String(b?.amount ?? "")); } catch { return Response.json({ error: "bad amount" }, { status: 400 }); }
  if (!(PAY_SOURCES as readonly number[]).includes(chainId) || !isAddress(payer, { strict: false }) || !isAddress(to, { strict: false }) || amount <= 0n) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  if (amount > BigInt(PAY_CROSS_MAX_USDG) * 1_000_000n) {
    return Response.json({ error: `Paying from another chain is limited to ${PAY_CROSS_MAX_USDG} USDG for now. Pay on Robinhood Chain, or ask for a smaller amount.` }, { status: 422 });
  }
  const r = await fetch("https://api.relay.link/quote", {
    method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(12_000),
    body: JSON.stringify({
      user: payer, recipient: to, refundTo: payer, originChainId: chainId, destinationChainId: 4663, originCurrency: ZERO,
      destinationCurrency: USDG_RH, amount: amount.toString(), tradeType: "EXACT_OUTPUT", protocolVersion: "v2",
    }),
  }).catch(() => null);
  const j = r ? ((await r.json().catch(() => null)) as Record<string, unknown> | null) : null;
  type Step = { requestId?: string; items?: { data?: { chainId?: number; to?: string; data?: string; value?: string } }[] };
  const steps = (j?.steps ?? []) as Step[];
  const order = (j?.protocol as { v2?: { orderData?: RelayOrder } } | undefined)?.v2?.orderData;
  const item = steps.length === 1 && steps[0].items?.length === 1 ? steps[0].items[0].data : undefined;
  if (!r?.ok || !order || !item?.to || !item.data || item.value === undefined) {
    return Response.json({ error: r?.status === 429 ? "Relay is busy. Try again in a few seconds." : "No route from this chain right now." }, { status: r?.status === 429 ? 429 : 404 });
  }
  const details = (j?.details ?? {}) as { currencyIn?: { amountUsd?: string }; timeEstimate?: number };
  const q: PayCrossQuote = {
    chainId, payer: getAddress(payer), to: getAddress(to), amount: amount.toString(),
    tx: { chainId: Number(item.chainId), to: getAddress(item.to), data: item.data as Hex, value: String(item.value) },
    order, requestId: String(steps[0].requestId ?? ""),
    inUsd: details.currencyIn?.amountUsd !== undefined ? Number(details.currencyIn.amountUsd) : null,
    etaSeconds: typeof details.timeEstimate === "number" ? details.timeEstimate : null,
  };
  const why = checkPayCross(q, { chainId, payer, to, amount });
  if (why) return Response.json({ error: why }, { status: 422 });
  return Response.json(q, { headers: { "cache-control": "no-store" } });
}
