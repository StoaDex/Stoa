import { test } from "node:test";
import assert from "node:assert/strict";
import { RULES, SEASON_START, score } from "../lib/pointsScore.ts";
import type { StatSwap } from "../lib/routerStats.ts";

const A = "0x00000000000000000000000000000000000000aa", B = "0x00000000000000000000000000000000000000bb", R = "0x00000000000000000000000000000000000000cc";
const ETH = "0x0000000000000000000000000000000000000000", USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168", X = "0x00000000000000000000000000000000000000dd", TSLA = "0x00000000000000000000000000000000000000ee";
let n = 0;
const sw = (t: number, trader: string, tokenIn: string, tokenOut: string, usd: number, o: Partial<StatSwap> = {}): StatSwap => ({
  chain: "robinhood", hash: `0x${(n++).toString(16)}`, time: SEASON_START + t, tokenIn, tokenOut,
  symIn: tokenIn === USDG ? "USDG" : "X", symOut: tokenOut === USDG ? "USDG" : "X", amountIn: 1, amountOut: 1, usd, trader, ...o,
});

test("points: before the season and under the minimum earn nothing", () => {
  const m = score([sw(-10, A, ETH, X, 50), sw(10, A, ETH, X, RULES.MIN_USD / 2)], new Set());
  assert.equal(m.get(A)?.points ?? 0, 0);
});

test("points: a round trip within the hour earns once; stock tokens count double", () => {
  const m = score([sw(0, A, USDG, X, 100), sw(600, A, X, USDG, 100), sw(10_000, B, USDG, TSLA, 50)], new Set([TSLA]));
  assert.equal(m.get(A)!.swapPoints, 100);
  assert.equal(m.get(B)!.swapPoints, 50 * RULES.STOCK_X);
});

test("points: daily cap, referral share, no self-referral, stable-to-stable earns nothing", () => {
  const m = score([
    sw(0, A, ETH, X, 1500, { referrer: R }), sw(60, A, ETH, TSLA, 1500, { referrer: R }),
    sw(120, B, ETH, X, 100, { referrer: B }),
    sw(180, B, USDG, USDG, 100, { symIn: "USDG", symOut: "USDC", tokenOut: "0x1" }),
  ], new Set());
  assert.equal(m.get(A)!.swapPoints, RULES.DAILY_CAP);
  assert.equal(m.get(R)!.refPoints, RULES.DAILY_CAP * RULES.REF_SHARE);
  assert.equal(m.get(B)!.refPoints, 0);
  assert.equal(m.get(B)!.swaps, 1);
});

import { review } from "../lib/pointsScore.ts";
test("review: flags repeated round trips and mutual referrals", () => {
  const s = [
    sw(0, A, USDG, X, 50), sw(60, A, X, USDG, 50), sw(120, A, USDG, X, 50), sw(180, A, X, USDG, 50), sw(240, A, USDG, X, 50), sw(300, A, X, USDG, 50),
    sw(400, B, ETH, X, 20, { referrer: R }), sw(500, R, ETH, X, 20, { referrer: B }),
  ];
  const f = review(s, new Set());
  assert.ok(f.find((x) => x.address === A)?.flags.some((t) => t.includes("round trips")));
  assert.ok(f.find((x) => x.address === B)?.flags.some((t) => t.includes("referred by it")));
  assert.ok(f.find((x) => x.address === R)?.flags.some((t) => t.includes("referred by it")));
});
