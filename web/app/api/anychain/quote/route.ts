import { isAddress, type Address } from "viem";
import { tw } from "@/lib/trustware";
import { DST_CHAIN, MAX_USD, STOA_RH, capUsdOf, checkAnyQuote, depositIdOf, sourceOk, type AnyQuote } from "@/lib/anychain";
import { NATIVE_ZERO, sameAddr } from "@/lib/bridge";
import { limited } from "@/lib/api";
import { TICKET_TTL_S, isJson, signTicket, stoaPrices } from "@/lib/anychainServer";

// POST /api/anychain/quote {chainId, token, amount, user}: a Trustware route from a source chain into $STOA on Robinhood
// Chain, to the user's own address. Only Relay depository routes that pass checkAnyQuote are returned; the browser
// checks them again before the wallet opens.
export const dynamic = "force-dynamic";
const EVM_NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

export async function POST(req: Request) {
  const slow = limited(req);
  if (slow) return slow;
  if (!isJson(req)) return Response.json({ error: "bad request" }, { status: 415 });
  const b = (await req.json().catch(() => null)) as { chainId?: number; token?: string; amount?: string; user?: string } | null;
  const chainId = Number(b?.chainId), token = String(b?.token ?? ""), user = String(b?.user ?? "");
  let amount: bigint;
  try { amount = BigInt(String(b?.amount ?? "")); } catch { return Response.json({ error: "bad amount" }, { status: 400 }); }
  if (!sourceOk(chainId, token) || !isAddress(user, { strict: false }) || amount <= 0n) return Response.json({ error: "bad request" }, { status: 400 });
  const native = sameAddr(token, NATIVE_ZERO);
  // Stoa's own prices, read before asking Trustware: the $500 cap and the sanity check use these, never Trustware's
  const px = await stoaPrices();
  if (native && !px.ethUsd) return Response.json({ error: "busy" }, { status: 503 });
  // over the cap on Stoa's own figure: refused before any intent is created at Trustware
  const forCap = capUsdOf({ user: user as Address, chainId, token: token as Address, amount }, px.ethUsd);
  if (forCap === null) return Response.json({ error: "busy" }, { status: 503 });
  if (forCap > MAX_USD) return Response.json({ error: `Buying $STOA from another chain is limited to $${MAX_USD} per purchase for now. Use a smaller amount.` }, { status: 422 });
  const r = await tw("/routes/route", {
    method: "POST",
    body: JSON.stringify({
      fromChain: String(chainId), toChain: String(DST_CHAIN), fromToken: native ? EVM_NATIVE : token, toToken: STOA_RH,
      fromAmount: amount.toString(), fromAddress: user, toAddress: user, refundAddress: user, slippageBps: 100,
    }),
  });
  const d = (r.body.data ?? {}) as { intentId?: string; expiresAt?: string; route?: { provider?: string; estimate?: AnyQuote["estimate"]; execution?: { transaction?: AnyQuote["transaction"]; approvals?: AnyQuote["approvals"] }; protocol?: { v2?: { orderData?: AnyQuote["order"] } }; orderData?: AnyQuote["order"] } };
  if (!r.ok || !d.intentId || !d.route?.estimate || !d.route.execution?.transaction) {
    return Response.json({ error: r.status === 429 ? "busy" : "no route" }, { status: r.status === 429 ? 429 : 404 });
  }
  const q: AnyQuote = {
    intentId: d.intentId, expiresAt: d.expiresAt, provider: String(d.route.provider ?? ""), estimate: d.route.estimate,
    transaction: d.route.execution.transaction, approvals: d.route.execution.approvals ?? [],
    ethUsd: px.ethUsd, stoaPerUsd: px.stoaPerUsd,
  };
  // Relay's order data, if Trustware passes it on (asked in trustware-sdk#156): checked in checkAnyQuote
  const order = d.route.protocol?.v2?.orderData ?? d.route.orderData;
  if (order) q.order = order;
  const why = checkAnyQuote(q, { user: user as Address, chainId, token: token as Address, amount });
  if (why) return Response.json({ error: why.startsWith("Buying") ? why : "no checkable route" }, { status: 422 });
  // Stoa's signature over this intent, this buyer, this chain and the order id the deposit commits to
  q.exp = Math.floor(Date.now() / 1000) + TICKET_TTL_S;
  q.sig = signTicket({ intentId: d.intentId, user, chainId, depositId: depositIdOf(q.transaction.data)!, exp: q.exp });
  return Response.json(q, { headers: { "cache-control": "no-store" } });
}
