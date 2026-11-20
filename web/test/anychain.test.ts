import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeFunctionData, parseAbi, type Address } from "viem";
import { ETH_USD_FLOOR, MAX_USD, RELAY_DEPOSITORY, capUsdOf, checkAnyQuote, depositIdOf, type AnyQuote } from "../lib/anychain";
import { NATIVE_ZERO } from "../lib/bridge";

const ABI = parseAbi(["function depositNative(address depositor, bytes32 id) payable", "function depositErc20(address depositor, address token, uint256 amount, bytes32 id)"]);
const user = "0x1111111111111111111111111111111111111111" as Address;
const id = `0x${"ab".repeat(32)}` as const;
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;

function nativeQuote(amount: bigint, over: Partial<AnyQuote["estimate"]> = {}, ethUsd = 3000): AnyQuote {
  return {
    intentId: "00000000-0000-4000-8000-000000000000", provider: "relay", approvals: [], ethUsd, stoaPerUsd: 30000,
    estimate: { fromAmount: amount.toString(), fromAmountUsd: String((Number(amount) / 1e18) * ethUsd), toAmount: "1000000000000000000000", toAmountMin: "990000000000000000000", ...over },
    transaction: { chainId: 8453, to: RELAY_DEPOSITORY, value: amount.toString(), data: encodeFunctionData({ abi: ABI, functionName: "depositNative", args: [user, id] }) },
  };
}
const want = (amount: bigint, token: Address = NATIVE_ZERO) => ({ user, chainId: 8453, token, amount });

test("an honest ETH deposit under the cap passes", () => {
  const a = 10n ** 17n; // 0.1 ETH at $3,000
  assert.equal(checkAnyQuote(nativeQuote(a), want(a)), null);
});

test("a low ETH price cannot lift the cap: ETH is valued at no less than the floor", () => {
  const a = 10n ** 18n; // 1 ETH: $1,200 at the floor, over $500 however low the router read
  assert.match(checkAnyQuote(nativeQuote(a, {}, 1), want(a)) ?? "", /limited to \$500/);
  assert.ok((capUsdOf(want(a), 1) ?? 0) >= ETH_USD_FLOOR);
  assert.ok((capUsdOf(want(a), 5000) ?? 0) > MAX_USD);
});

test("no ETH price refuses", () => {
  const a = 10n ** 16n;
  assert.match(checkAnyQuote(nativeQuote(a, {}, 0), want(a)) ?? "", /could not price/);
});

test("the minimum must be within 2% of the quoted output, and not above it", () => {
  const a = 10n ** 16n;
  assert.notEqual(checkAnyQuote(nativeQuote(a, { toAmountMin: "1" }), want(a)), null);
  assert.notEqual(checkAnyQuote(nativeQuote(a, { toAmountMin: "970000000000000000000" }), want(a)), null);
  assert.notEqual(checkAnyQuote(nativeQuote(a, { toAmountMin: "1000000000000000000001" }), want(a)), null);
  assert.equal(checkAnyQuote(nativeQuote(a, { toAmountMin: "980000000000000000000" }), want(a)), null);
});

test("an ETH purchase without Trustware's dollar figure is refused", () => {
  const a = 10n ** 17n;
  const q = nativeQuote(a);
  delete q.estimate.fromAmountUsd;
  assert.notEqual(checkAnyQuote(q, want(a)), null);
});

test("Trustware's dollar figure must agree with Stoa's", () => {
  const a = 10n ** 17n; // $300
  assert.equal(checkAnyQuote(nativeQuote(a, { fromAmountUsd: "301" }), want(a)), null);
  for (const v of ["1", "0", "", "-1", "abc"]) assert.notEqual(checkAnyQuote(nativeQuote(a, { fromAmountUsd: v }), want(a)), null, v);
});

test("stablecoins are valued from their own decimals", () => {
  assert.equal(capUsdOf(want(500_000_000n, BASE_USDC), null), 500);
  assert.equal(capUsdOf(want(500_000_001n, BASE_USDC), null)! > MAX_USD, true);
});

test("depositIdOf reads the order id from either deposit call", () => {
  assert.equal(depositIdOf(encodeFunctionData({ abi: ABI, functionName: "depositNative", args: [user, id] })), id);
  assert.equal(depositIdOf(encodeFunctionData({ abi: ABI, functionName: "depositErc20", args: [user, BASE_USDC, 5n, id] })), id);
  assert.equal(depositIdOf("0x12345678"), null);
});

test("Relay's order data, when passed on, must be exactly this purchase", async () => {
  const { readFileSync } = await import("node:fs");
  const load = (f: string) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"));
  const buyer = "0x1111111111111111111111111111111111111111" as Address;
  for (const [f, ok] of [["relay-eth-honest.json", true], ["relay-eth-other-recipient.json", false]] as const) {
    const r = load(f);
    const dep = r.steps.find((s: { id: string }) => s.id === "deposit").items[0].data;
    const od = r.protocol.v2.orderData;
    const amount = BigInt(od.inputs[0].payment.amount);
    const min = BigInt(od.output.payments[0].minimumAmount), exp = BigInt(od.output.payments[0].expectedAmount);
    const q: AnyQuote = {
      intentId: "00000000-0000-4000-8000-000000000000", provider: "relay", approvals: [], ethUsd: 3000, stoaPerUsd: 30000,
      estimate: { fromAmount: amount.toString(), fromAmountUsd: String((Number(amount) / 1e18) * 3000), toAmount: (min * 10_000n >= exp * 9_800n ? exp : min).toString(), toAmountMin: min.toString() },
      transaction: { chainId: 8453, to: RELAY_DEPOSITORY, value: amount.toString(), data: dep.data }, order: od,
    };
    // the deposit's depositor is the dummy user in both fixtures; only the order differs
    const why = checkAnyQuote(q, { user: buyer, chainId: 8453, token: NATIVE_ZERO, amount });
    if (ok) assert.equal(why, null, f); else assert.notEqual(why, null, f);
  }
});
