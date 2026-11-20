import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkRelayOrder, relayOrderId, type OrderWant, type RelayOrder } from "../lib/relayOrder";

// real Relay quotes (POST api.relay.link/quote/v2 with includeProtocolData), dummy addresses, never deposited
const load = (f: string) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"));
const honestEth = load("relay-eth-honest.json"), otherEth = load("relay-eth-other-recipient.json"), honestUsdc = load("relay-usdc-honest.json");
const depositIdIn = (q: { steps: { id: string; items: { data: { data: string } }[] }[] }) =>
  `0x${q.steps.find((s) => s.id === "deposit")!.items[0].data.data.slice(-64)}`;
const user = "0x1111111111111111111111111111111111111111";
const STOA = "0x13E6993417616De724F2b337D65063f229e96718";
const want = (q: typeof honestEth, over: Partial<OrderWant> = {}): OrderWant => ({
  depositId: depositIdIn(q), user, fromSlug: "base", toSlug: "robinhood",
  currency: q.protocol.v2.orderData.inputs[0].payment.currency, amount: BigInt(q.protocol.v2.orderData.inputs[0].payment.amount),
  outCurrency: STOA, minOut: BigInt(q.protocol.v2.orderData.output.payments[0].minimumAmount),
  maxDeadline: Number(q.protocol.v2.orderData.output.deadline) + 1, ...over,
});

test("the recomputed id equals Relay's order id and the id in the deposit call", () => {
  for (const q of [honestEth, otherEth, honestUsdc]) {
    const id = relayOrderId(q.protocol.v2.orderData);
    assert.equal(id.toLowerCase(), q.protocol.v2.orderId.toLowerCase());
    assert.equal(id.toLowerCase(), depositIdIn(q).toLowerCase());
  }
});

test("honest orders pass", () => {
  assert.equal(checkRelayOrder(honestEth.protocol.v2.orderData, want(honestEth)), null);
  assert.equal(checkRelayOrder(honestUsdc.protocol.v2.orderData, want(honestUsdc)), null);
});

test("an order that pays someone else is refused", () => {
  assert.match(checkRelayOrder(otherEth.protocol.v2.orderData, want(otherEth)) ?? "", /someone else/);
});

test("order data edited to look honest no longer matches the deposit", () => {
  const o: RelayOrder = structuredClone(otherEth.protocol.v2.orderData);
  o.output.payments[0].recipient = user;
  for (const r of o.inputs[0].refunds) r.recipient = user;
  assert.equal(checkRelayOrder(o, want(otherEth)), "order is not the one the deposit commits to");
});

test("an honest order against another deposit, a lower minimum, a far deadline or an unknown solver is refused", () => {
  const o = honestEth.protocol.v2.orderData;
  assert.notEqual(checkRelayOrder(o, want(honestEth, { depositId: depositIdIn(otherEth) })), null);
  assert.equal(checkRelayOrder(o, want(honestEth, { minOut: BigInt(o.output.payments[0].minimumAmount) + 1n })), "output minimum is below what was shown");
  assert.equal(checkRelayOrder(o, want(honestEth, { maxDeadline: Number(o.output.deadline) - 1 })), "deadline too far out");
  assert.equal(checkRelayOrder(o, want(honestEth, { amount: 1n })), "input is not what was picked");
  assert.equal(checkRelayOrder(null, want(honestEth)), "no order");
});
