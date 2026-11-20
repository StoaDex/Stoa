import { getAddress, isAddress } from "viem";
import { API_HEADERS, apiError, apiQuote, limited } from "@/lib/api";
import { ROBINHOOD } from "@/lib/networks";
import { PAY_MAX_USDG } from "@/lib/pay";

// GET /api/pay/quote?token=0x…|native&amount=<USDG units>&payer=0x…&to=0x…[&referrer=0x…]
// Stoa Pay: the smallest amount of `token` that swaps to at least `amount` USDG, delivered straight to `to`.
// The swap's minOut is the requested amount itself, so the recipient never gets less; any extra goes to them too.
export const dynamic = "force-dynamic";

const USDG = ROBINHOOD.stable.toLowerCase();
// how much more than the reverse quote to put in: covers the fee, price impact both ways and a moving price
const BUFFERS = [1.004, 1.008, 1.015, 1.03, 1.06];

export async function GET(req: Request) {
  const block = limited(req);
  if (block) return block;
  const u = new URL(req.url).searchParams;
  const token = u.get("token") ?? "", amt = u.get("amount") ?? "", payer = u.get("payer") ?? "", to = u.get("to") ?? "";
  const referrer = u.get("referrer") ?? undefined;
  if (!isAddress(payer, { strict: false }) || !isAddress(to, { strict: false })) return apiError(400, "payer and to must be addresses");
  if (!/^\d{1,30}$/.test(amt) || BigInt(amt) === 0n) return apiError(400, "amount must be a positive integer in USDG units");
  const amount = BigInt(amt);
  if (amount > BigInt(PAY_MAX_USDG) * 1_000_000n) return apiError(400, `Stoa Pay is limited to ${PAY_MAX_USDG} USDG per payment`);
  if (token !== "native" && !isAddress(token, { strict: false })) return apiError(400, "token must be an address or native");
  if (token.toLowerCase() === USDG) return apiError(400, "USDG is paid with a plain transfer, no swap needed");

  // the reverse quote: about how much of `token` the requested USDG is worth
  const rev = await apiQuote({ chain: "robinhood", sellToken: ROBINHOOD.stable, buyToken: token, amount: amount.toString() });
  if (!rev.ok) return apiError(422, "No route from this token to USDG right now");
  const base = BigInt(((await rev.json()) as { amountOut: string }).amountOut);
  if (base === 0n) return apiError(422, "No route from this token to USDG right now");

  for (const b of BUFFERS) {
    const amountIn = (base * BigInt(Math.round(b * 10_000))) / 10_000n;
    const r = await apiQuote({
      chain: "robinhood", sellToken: token, buyToken: ROBINHOOD.stable, amount: amountIn.toString(),
      taker: getAddress(payer), recipient: getAddress(to), referrer, deadlineSeconds: "300", minOutExact: amount,
    });
    if (!r.ok) continue;
    const j = (await r.json()) as Record<string, unknown> & { amountOut: string };
    // keep 0.2% of headroom over the minimum, so the swap still clears if the price moves a little before it lands
    if (BigInt(j.amountOut) * 1000n < amount * 1002n) continue;
    return Response.json({ ...j, payment: { amount: amount.toString(), to: getAddress(to) } }, { headers: API_HEADERS });
  }
  return apiError(422, "Not enough liquidity to pay this amount with this token right now. Try another token or a smaller amount.");
}
