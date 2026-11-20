import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkLifiTx } from "../lib/bridge";

// real LI.FI Across quotes into Robinhood Chain (ETH and USDC on Base, to ETH and to USDG), recorded 18 Nov 2026
const fixtures = JSON.parse(readFileSync(new URL("./fixtures/lifi-quotes.json", import.meta.url), "utf8")) as {
  want: { user: `0x${string}`; chainId: number; token: `0x${string}`; amount: string; toToken: `0x${string}`; minOut: string };
  tx: { to: `0x${string}`; data: `0x${string}`; value?: string; chainId: number };
}[];
const X = "1111111111111111111111111111111111111111";
const W = (f: (typeof fixtures)[number]) => ({ ...f.want, amount: BigInt(f.want.amount), minOut: BigInt(f.want.minOut) });
// the Across data (third argument): word index of a field inside it
const acrossWord = (data: string, k: number) => { const a = data.slice(10); const at = Number(BigInt("0x" + a.slice(128, 192))) / 32; return 10 + (at + k) * 64; };
const setWord = (data: `0x${string}`, pos: number, v: bigint) => (data.slice(0, pos) + v.toString(16).padStart(64, "0") + data.slice(pos + 64)) as `0x${string}`;

test("real quotes pass", () => {
  assert.ok(fixtures.length >= 2);
  for (const f of fixtures) assert.equal(checkLifiTx(f.tx, W(f)), null);
});

test("swapping the user's address anywhere in the call is refused", () => {
  for (const f of fixtures) {
    const want = W(f);
    const me = f.want.user.slice(2).toLowerCase(), body = f.tx.data.slice(10).toLowerCase();
    let i = -1, n = 0;
    while ((i = body.indexOf(me, i + 1)) >= 0) {
      n++;
      const data = (f.tx.data.slice(0, 10) + body.slice(0, i) + X + body.slice(i + 40)) as `0x${string}`;
      assert.notEqual(checkLifiTx({ ...f.tx, data }, want), null);
    }
    assert.ok(n >= 3); // BridgeData receiver, Across receiver, Across refund address
  }
});

test("a different amount, chain, token, contract or extra value is refused", () => {
  for (const f of fixtures) {
    const want = W(f);
    assert.notEqual(checkLifiTx(f.tx, { ...want, amount: want.amount - 1n }), null);
    assert.notEqual(checkLifiTx(f.tx, { ...want, chainId: want.chainId + 1 }), null);
    assert.notEqual(checkLifiTx(f.tx, { ...want, token: `0x${X}` }), null);
    assert.notEqual(checkLifiTx({ ...f.tx, to: `0x${X}` }, want), null);
    assert.notEqual(checkLifiTx({ ...f.tx, value: (BigInt(f.tx.value ?? 0) + 10n ** 17n).toString() }, want), null);
    assert.notEqual(checkLifiTx({ ...f.tx, data: ("0xdeadbeef" + f.tx.data.slice(10)) as `0x${string}` }, want), null);
  }
});

test("the asset and amount that arrive on Robinhood Chain are checked", () => {
  for (const f of fixtures) {
    const want = W(f);
    const pOut = acrossWord(f.tx.data, 4), pMul = acrossWord(f.tx.data, 5), pAsset = acrossWord(f.tx.data, 3);
    const out = BigInt("0x" + f.tx.data.slice(pOut, pOut + 64)), mul = BigInt("0x" + f.tx.data.slice(pMul, pMul + 64));
    assert.ok(out >= want.minOut);
    // a relayer asked for 1 wei (it would keep the rest as its fee)
    assert.notEqual(checkLifiTx({ ...f.tx, data: setWord(f.tx.data, pOut, 1n) }, want), null);
    assert.notEqual(checkLifiTx({ ...f.tx, data: setWord(f.tx.data, pOut, want.minOut - 1n) }, want), null);
    // the multiplier LI.FI uses to recompute outputAmount after the source swaps
    assert.notEqual(checkLifiTx({ ...f.tx, data: setWord(f.tx.data, pMul, 1n) }, want), null);
    assert.notEqual(checkLifiTx({ ...f.tx, data: setWord(f.tx.data, pMul, mul / 2n) }, want), null);
    // another asset arriving, or the user expecting another one
    assert.notEqual(checkLifiTx({ ...f.tx, data: setWord(f.tx.data, pAsset, BigInt("0x" + X)) }, want), null);
    const other = BigInt(want.toToken) === 0n ? "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" : "0x0000000000000000000000000000000000000000";
    assert.notEqual(checkLifiTx(f.tx, { ...want, toToken: other as `0x${string}` }), null);
    // a minimum higher than the route delivers
    assert.notEqual(checkLifiTx(f.tx, { ...want, minOut: out + 1n }), null);
  }
});

test("receiver and refund are checked even when the call claims no source swaps", () => {
  let n = 0;
  for (const f of fixtures.filter((f) => BigInt(f.tx.value ?? 0) === 0n)) {
    // BridgeData is a dynamic tuple at the offset in head word 0: word 4 sendingAssetId, 6 minAmount, 8 hasSourceSwaps
    const a = f.tx.data.slice(10); const bdAt = Number(BigInt("0x" + a.slice(0, 64))) / 32;
    const bdWord = (k: number) => 10 + (bdAt + k) * 64;
    const flagOff = setWord(f.tx.data, bdWord(8), 0n);
    const sending = ("0x" + f.tx.data.slice(bdWord(4) + 24, bdWord(4) + 64)) as `0x${string}`;
    const minAmount = BigInt("0x" + f.tx.data.slice(bdWord(6), bdWord(6) + 64));
    // a user who picked exactly what the bridge sends: the no-swap path passes untouched...
    const want = { ...W(f), token: sending, amount: minAmount };
    assert.equal(checkLifiTx({ ...f.tx, data: flagOff }, want), null);
    // ...and still refuses another receiver or refund address in the Across data
    assert.notEqual(checkLifiTx({ ...f.tx, data: setWord(flagOff, acrossWord(f.tx.data, 0), BigInt("0x" + X)) }, want), null);
    assert.notEqual(checkLifiTx({ ...f.tx, data: setWord(flagOff, acrossWord(f.tx.data, 1), BigInt("0x" + X)) }, want), null);
    n++;
  }
  assert.ok(n >= 1);
});
