import { test } from "node:test";
import assert from "node:assert/strict";
import { minOut, parseAmount, fmt, swapKind, cleanRef, describeRoute, swapParams, hasRoute, sameForm, type Route } from "../lib/swap";
import { TOKENS, WHYPE, NATIVE } from "../lib/tokens";
import type { Address } from "viem";

const [HYPE, W, USDC] = TOKENS;

test("parseAmount", () => {
  assert.equal(parseAmount("1.5", 6), 1_500_000n);
  assert.equal(parseAmount("0.000001", 6), 1n);
  assert.equal(parseAmount("0.0000001", 6), undefined); // too many decimals
  assert.equal(parseAmount("0", 6), undefined);
  assert.equal(parseAmount("abc", 6), undefined);
  assert.equal(parseAmount(".5", 18), 5n * 10n ** 17n);
});

test("minOut applies slippage and rounds down", () => {
  assert.equal(minOut(10_000n, 0.5), 9_950n);
  assert.equal(minOut(999n, 1), 989n);
});

test("fmt", () => {
  assert.equal(fmt(1_234_567_890n, 6, 2), "1,234.56");
  assert.equal(fmt(10n ** 18n, 18), "1");
});

test("swap kind and router tokens", () => {
  assert.equal(swapKind(HYPE, W), "wrap");
  assert.equal(swapKind(W, HYPE), "unwrap");
  assert.equal(swapKind(HYPE, USDC), "hypeIn");
  assert.equal(swapKind(USDC, HYPE), "hypeOut");
  assert.equal(swapKind(USDC, W), "erc20");
});

const Z = NATIVE;
const POOL = "0x1111111111111111111111111111111111111111" as Address;
const UNI = "0x2222222222222222222222222222222222222222" as Address;

test("routes are described by their venues", () => {
  const direct: Route = { amountOut: 5n, mid: Z, leg1: { venue: POOL, isPool: true }, leg2: { venue: Z, isPool: false } };
  const hop: Route = { amountOut: 5n, mid: WHYPE, leg1: { venue: UNI, isPool: false }, leg2: { venue: POOL, isPool: true } };
  const hopSame: Route = { ...hop, leg2: { venue: UNI, isPool: false } };
  assert.equal(describeRoute(direct), "Stoa maker pool");
  assert.equal(describeRoute(hop), "Outside venue → Stoa maker pool (via WHYPE)");
  assert.equal(describeRoute(hopSame), "Outside venue (via WHYPE)");
  assert.equal(describeRoute(hop, { [UNI.toLowerCase()]: "Uniswap V3" }), "Uniswap V3 → Stoa maker pool (via WHYPE)");
  assert.equal(hasRoute({ ...direct, leg1: { venue: Z, isPool: false } }), false);
  assert.equal(hasRoute(direct), true);
});

test("swap params pass native HYPE as the zero address", () => {
  const r: Route = { amountOut: 9n, mid: Z, leg1: { venue: UNI, isPool: false }, leg2: { venue: Z, isPool: false } };
  const p = swapParams(HYPE, USDC, r, 10n, 8n, POOL, 99n, Z);
  assert.equal(p.tokenIn, NATIVE);
  assert.equal(p.tokenOut, USDC.address);
  assert.equal(p.minOut, 8n);
  assert.equal(p.leg1.venue, UNI);
});

test("referral cannot be yourself or garbage", () => {
  const a = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";
  assert.equal(cleanRef(a), a);
  assert.equal(cleanRef(a, a.toLowerCase()), undefined);
  assert.equal(cleanRef("0x123"), undefined);
});

test("sameForm: a swap prepared from an older form is not sent", () => {
  const a = { amount: "1", slip: 0.5, sell: "0xAbC0000000000000000000000000000000000001", buy: "0x0000000000000000000000000000000000000002" };
  assert.equal(sameForm(a, { ...a, sell: a.sell.toLowerCase() }), true);
  assert.equal(sameForm(a, { ...a, amount: "2" }), false); // amount changed while quoting
  assert.equal(sameForm(a, { ...a, slip: 0.1 }), false); // slippage changed while quoting
  assert.equal(sameForm(a, { ...a, buy: "0x0000000000000000000000000000000000000003" }), false);
});
