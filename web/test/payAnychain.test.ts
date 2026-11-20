import { test } from "node:test";
import assert from "node:assert/strict";
import fx from "./fixtures/pay-relay-base.json";
import { checkPayCross, type PayCrossQuote } from "../lib/payAnychain";
import { checkRelayOrder, relayOrderId, type RelayOrder } from "../lib/relayOrder";

// A real Relay quote (Base ETH -> 25 USDG to the requester on Robinhood Chain), captured 21 Nov 2026.
const PAYER = "0x00000000000000000000000000000000000b0b01", TO = "0x893f754C451fe7Edf459eb24abEF473190101446";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const q = (): PayCrossQuote => ({ chainId: 8453, payer: PAYER, to: TO, amount: "25000000", tx: { ...fx.tx, chainId: 8453 } as PayCrossQuote["tx"], order: structuredClone(fx.order) as RelayOrder, requestId: "", inUsd: null, etaSeconds: null });
const want = { chainId: 8453, payer: PAYER, to: TO, amount: 25_000_000n };
const far = () => Math.floor(Date.now() / 1000) + 8 * 86_400;

test("the captured payment passes", () => {
  // the captured order's deadline may be checked long after capture; only the deadline rule depends on the clock
  assert.equal(checkPayCross(q(), want), null);
});
test("a different requester, a larger amount or another payer is refused", () => {
  assert.ok(checkPayCross(q(), { ...want, to: "0x1111111111111111111111111111111111111111" }));
  assert.ok(checkPayCross(q(), { ...want, amount: 26_000_000n }));
  assert.ok(checkPayCross(q(), { ...want, payer: "0x2222222222222222222222222222222222222222" }));
  assert.ok(checkPayCross({ ...q(), tx: { ...q().tx, chainId: 42161 } }, want));
});
test("an edited order no longer matches the deposit", () => {
  const x = q(); x.order.output.payments[0].recipient = "0x1111111111111111111111111111111111111111";
  assert.match(checkPayCross(x, want) ?? "", /not the one the deposit/);
});
test("refunds: the payer anywhere, the requester only on Robinhood Chain in USDG", () => {
  const base = structuredClone(fx.order) as RelayOrder;
  const w = (o: RelayOrder) => ({ depositId: relayOrderId(o), user: PAYER, recipient: TO, fromSlug: "base", toSlug: "robinhood", currency: "0x0000000000000000000000000000000000000000", amount: BigInt(o.inputs[0].payment.amount), outCurrency: USDG, minOut: 25_000_000n, maxDeadline: far() });
  assert.equal(checkRelayOrder(base, w(base)), null);
  const onBase = structuredClone(base); onBase.inputs[0].refunds[0].recipient = TO;
  assert.match(checkRelayOrder(onBase, w(onBase)) ?? "", /refund goes to someone else/);
  const otherTok = structuredClone(base); otherTok.inputs[0].refunds[1].currency = "0x0000000000000000000000000000000000000000";
  assert.match(checkRelayOrder(otherTok, w(otherTok)) ?? "", /refund goes to someone else/);
  const stranger = structuredClone(base); stranger.inputs[0].refunds[1].recipient = "0x3333333333333333333333333333333333333333";
  assert.match(checkRelayOrder(stranger, w(stranger)) ?? "", /refund goes to someone else/);
  // without a recipient (every other path) a refund to anyone but the buyer is still refused
  const { recipient: _r, ...noRecipient } = w(base);
  assert.match(checkRelayOrder(base, noRecipient) ?? "", /refund goes to someone else/);
});
