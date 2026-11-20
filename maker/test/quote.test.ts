import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuote, toPx, fromPx, VolTracker } from "../src/quote.js";
import { RiskGuard } from "../src/risk.js";
import { midFromBook } from "../src/price.js";

const dec = { base: 18, quote: 6 };
const P = { baseSpreadBps: 8, minSpreadBps: 4, volMultiplier: 1.5, skewBps: 10, sideNotionalUsd: 750, inventoryUse: 0.9, maxInventoryRatio: 0.8 };
const e18 = 10n ** 18n;
// 20 WHYPE + 1500 USDC at mid 40 -> 800 + 1500, base share ~0.35
const inv = { baseRaw: 20n * e18, quoteRaw: 1500n * 10n ** 6n };

test("price units round trip", () => {
  assert.equal(toPx(40.123456, dec, false), 40_123_456n);
  assert.equal(fromPx(40_123_456n, dec), 40.123456);
  assert.equal(toPx(40.1234561, dec, true), 40_123_457n);
});

test("balanced inventory quotes symmetric around mid", () => {
  const balanced = { baseRaw: 25n * e18, quoteRaw: 1000n * 10n ** 6n }; // 1000 vs 1000
  const q = buildQuote(40, 0, balanced, dec, P);
  assert.equal(q.halfSpreadBps, 8);
  assert.equal(q.bidPx, 39_968_000n); // 40 * (1 - 0.0008)
  assert.equal(q.askPx, 40_032_000n);
});

test("bid < ask always, spread widens with volatility", () => {
  const calm = buildQuote(40, 0, inv, dec, P);
  const wild = buildQuote(40, 20, inv, dec, P);
  assert.ok(calm.bidPx < calm.askPx);
  assert.equal(wild.halfSpreadBps, 8 + 30);
  assert.ok(wild.askPx - wild.bidPx > calm.askPx - calm.bidPx);
});

test("long base shifts quotes down, short base shifts up", () => {
  const long = buildQuote(40, 0, { baseRaw: 40n * e18, quoteRaw: 400n * 10n ** 6n }, dec, P);
  const short = buildQuote(40, 0, { baseRaw: 5n * e18, quoteRaw: 1800n * 10n ** 6n }, dec, P);
  assert.ok(long.centre < 40);
  assert.ok(short.centre > 40);
});

test("sizes respect notional and inventory", () => {
  const q = buildQuote(40, 0, inv, dec, P);
  // notional 750 / 40 = 18.75 base; ask limited by 90% of 20 = 18
  assert.equal(q.askSize, 18n * e18);
  assert.ok(q.bidSize <= (1350n * 10n ** 6n * e18) / q.bidPx);
  assert.ok(q.bidSize <= 18_750_000_000_000_000_000n);
});

test("one-sided inventory stops the heavy side", () => {
  const allBase = buildQuote(40, 0, { baseRaw: 50n * e18, quoteRaw: 10n * 10n ** 6n }, dec, P);
  assert.equal(allBase.bidSize, 0n);
  assert.ok(allBase.askSize > 0n);
  const allQuote = buildQuote(40, 0, { baseRaw: 1n * e18, quoteRaw: 2000n * 10n ** 6n }, dec, P);
  assert.equal(allQuote.askSize, 0n);
  assert.ok(allQuote.bidSize > 0n);
});

test("vol tracker", () => {
  const v = new VolTracker(0.5);
  v.update(40);
  assert.equal(v.bps(), 0);
  v.update(40.4); // ~1% move
  assert.ok(v.bps() > 60 && v.bps() < 80);
});

test("risk: stale price, jump cooldown, daily loss halt", () => {
  const r = new RiskGuard({ maxPriceAgeMs: 1500, jumpBps: 150, cooldownMs: 5000, maxDailyLossUsd: 150 });
  const t = Date.UTC(2026, 10, 11, 10);
  assert.equal(r.checkPrice(40, t - 2000, t).ok, false);
  assert.equal(r.checkPrice(40, t, t).ok, true);
  assert.equal(r.checkPrice(41, t + 100, t + 100).ok, false); // 2.5% jump
  assert.equal(r.checkPrice(41, t + 3000, t + 3000).ok, false); // still cooling
  assert.equal(r.checkPrice(41, t + 6000, t + 6000).ok, true);
  assert.equal(r.checkPnl(2300, t).ok, true);
  assert.equal(r.checkPnl(2200, t + 1).ok, true);
  const v = r.checkPnl(2100, t + 2);
  assert.equal(v.ok, false);
  assert.equal(r.halted, true);
});

test("mid from Hyperliquid book", () => {
  assert.equal(midFromBook([[{ px: "39.9", sz: "1" }], [{ px: "40.1", sz: "1" }]]), 40);
  assert.equal(midFromBook([[], [{ px: "40.1", sz: "1" }]]), undefined);
  assert.equal(midFromBook([[{ px: "41", sz: "1" }], [{ px: "40", sz: "1" }]]), undefined);
});
