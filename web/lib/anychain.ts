import { decodeFunctionData, encodeFunctionData, parseAbi, type Address } from "viem";
import { NATIVE_ZERO, SOURCES, sameAddr } from "./bridge";
import { checkRelayOrder, type RelayOrder } from "./relayOrder";

/** Buy $STOA from any chain: Trustware (trustware.io) routes a deposit from Base, Arbitrum, Ethereum, Optimism or BNB
 *  Chain into $STOA on Robinhood Chain. Quotes come through Stoa's server (/api/anychain/*, the Trustware key never
 *  reaches the browser). Only Relay depository routes are used: the user deposits on the source chain into Relay's
 *  canonical Depository against an order id, and Relay's solver delivers $STOA on Robinhood Chain.
 *
 *  What Stoa checks before the wallet opens: the call goes to Relay's Depository, as depositNative or depositErc20, the
 *  depositor is the user's own address, and it deposits exactly the token and amount picked; any approval is for that
 *  token, that amount and the Depository only. What it cannot check yet: the recipient, token and minimum on Robinhood
 *  Chain live in Relay's off-chain order, which Trustware does not return yet. When a route passes it on, it is checked
 *  (lib/relayOrder.ts: it must hash to the id in the deposit and pay exactly this buyer); until every route does, each
 *  purchase is capped at MAX_USD, valued at Stoa's own prices. */

export const STOA_RH = "0x13E6993417616De724F2b337D65063f229e96718" as Address;
export const DST_CHAIN = 4663;
/** Relay's canonical Depository (the same address on every chain; api.relay.link/chains, protocol.v2.depository) */
export const RELAY_DEPOSITORY = "0x4cD00E387622C35bDDB9b4c962C136462338BC31" as Address;
/** The most one purchase may move while the delivery side cannot be checked before signing */
export const MAX_USD = 500;
/** Shown to everyone once enabled; until then only with ?preview=anychain on /token */
export const ANYCHAIN_PUBLIC = true;
/** Relay Depository calls; a token deposit carries no native value */
const ABI = parseAbi([
  "function depositNative(address depositor, bytes32 id) payable",
  "function depositErc20(address depositor, address token, uint256 amount, bytes32 id)",
]);

export interface TwTx { chainId: number; to: Address; data: `0x${string}`; value?: string | number; gasLimit?: string | number }
export interface TwApproval { chainId: number; tokenAddress: Address; spender: Address; amount: string }
export interface TwEstimate { fromAmount: string; fromAmountUsd?: string; toAmount: string; toAmountMin: string; toAmountUsd?: string; etaSeconds?: number; fees?: { type: string; amountUsd?: string }[] }
/** What /api/anychain/quote returns. ethUsd and stoaPerUsd are Stoa's own prices (its router on Robinhood Chain), not
 *  Trustware's; sig is Stoa's server signature of the intent id, which /status and /receipt require. */
export interface AnyQuote {
  intentId: string; expiresAt?: string; provider: string; estimate: TwEstimate; transaction: TwTx; approvals: TwApproval[];
  ethUsd?: number | null; stoaPerUsd?: number | null; sig?: string; exp?: number;
  /** Relay's order data for the deposit, when the route passes it on. When present it must be exactly this purchase
   *  (lib/relayOrder.ts: the id it hashes to is the id in the deposit call); a route that sends one that is not is refused. */
  order?: RelayOrder;
}
/** Relay's chain slugs (api.relay.link/chains, protocol.v2.chainId) */
export const RELAY_SLUG: Record<number, string> = { 1: "ethereum", 8453: "base", 42161: "arbitrum", 10: "optimism", 56: "bnb", 4663: "robinhood" };
/** the furthest out an order's output deadline may be (Relay's run about 7 days) */
const ORDER_MAX_DAYS = 8;
/** the most Stoa's and Trustware's dollar values may differ before a quote is refused */
const USD_TOLERANCE = 0.05;
/** The lowest ETH price the $500 cap ever uses. Stoa's ETH price is one router quote; if it ever read low, the cap
 *  would let more ETH through, so the cap values ETH at no less than this. */
export const ETH_USD_FLOOR = 1200;
/** the least toAmountMin may be against toAmount (the figure the impact line uses), in basis points */
const MIN_VS_OUT_BPS = 9_800n;

/** the purchase's dollar value on Stoa's side: stablecoins from the amount and Stoa's own decimals, ETH at Stoa's own
 *  price. null when it cannot be worked out (no ETH price), which refuses the quote. */
export function usdOf(want: AnyWant, ethUsd?: number | null): number | null {
  const s = SOURCES.find((x) => x.chain.id === want.chainId);
  const t = s?.tokens.find((x) => sameAddr(x.address, want.token));
  if (!t) return null;
  const units = Number(want.amount) / 10 ** t.decimals;
  if (sameAddr(t.address, NATIVE_ZERO)) return ethUsd && ethUsd > 0 ? units * ethUsd : null;
  return units; // USDC, USDT, USDT0: dollars
}

/** the dollar value the $500 cap uses: like usdOf, but ETH at no less than ETH_USD_FLOOR */
export function capUsdOf(want: AnyWant, ethUsd?: number | null): number | null {
  return usdOf(want, ethUsd && ethUsd > 0 ? Math.max(ethUsd, ETH_USD_FLOOR) : null);
}

/** the 32-byte Relay order id a Depository call commits to, or null when the calldata is not a deposit */
export function depositIdOf(data: string): `0x${string}` | null {
  try {
    const c = decodeFunctionData({ abi: ABI, data: data as `0x${string}` });
    return (c.functionName === "depositNative" ? c.args[1] : c.args[3]) as `0x${string}`;
  } catch {
    return null;
  }
}

export interface AnyWant { user: Address; chainId: number; token: Address; amount: bigint }

/** the source chains and tokens Stoa offers (Bridge in's list) */
export function sourceOk(chainId: number, token: string) {
  const s = SOURCES.find((x) => x.chain.id === chainId);
  return !!s && s.tokens.some((t) => sameAddr(t.address, token));
}

/** null when the deposit does exactly what the user picked; otherwise why it is refused */
export function checkAnyQuote(q: AnyQuote, want: AnyWant): string | null {
  const bad = "This route looks wrong, so Stoa stopped it before your wallet. Nothing was sent. Get a new quote.";
  if (q.provider !== "relay") return bad;
  const tx = q.transaction;
  if (Number(tx.chainId) !== want.chainId || !sameAddr(tx.to, RELAY_DEPOSITORY)) return bad;
  if (!sourceOk(want.chainId, want.token)) return bad;
  if (BigInt(q.estimate.fromAmount) !== want.amount) return bad;
  // the minimum must be real and close to the quoted output, since the impact line reads the output
  let outMin: bigint, out: bigint;
  try { outMin = BigInt(q.estimate.toAmountMin); out = BigInt(q.estimate.toAmount); } catch { return bad; }
  if (outMin <= 0n || outMin > out || outMin * 10_000n < out * MIN_VS_OUT_BPS) return bad;
  const value = BigInt(tx.value ?? 0);
  let call: ReturnType<typeof decodeFunctionData<typeof ABI>>;
  try { call = decodeFunctionData({ abi: ABI, data: tx.data }); } catch { return bad; }
  // the calldata must be exactly the canonical encoding of what was decoded: no trailing bytes, no dirty address words
  if (encodeFunctionData({ abi: ABI, functionName: call.functionName, args: call.args } as Parameters<typeof encodeFunctionData<typeof ABI>>[0]).toLowerCase() !== String(tx.data).toLowerCase()) return bad;
  const native = sameAddr(want.token, NATIVE_ZERO);
  if (native) {
    if (call.functionName !== "depositNative") return bad;
    const [depositor] = call.args;
    if (!sameAddr(depositor, want.user) || value !== want.amount) return bad;
    if (q.approvals.length) return bad;
  } else {
    if (call.functionName !== "depositErc20") return bad;
    const [depositor, token, amount] = call.args;
    if (!sameAddr(depositor, want.user) || !sameAddr(token, want.token) || amount !== want.amount || value !== 0n) return bad;
    // the only approval a deposit needs: this token, this amount, to the Depository
    for (const a of q.approvals) {
      if (Number(a.chainId) !== want.chainId || !sameAddr(a.tokenAddress, want.token) || !sameAddr(a.spender, RELAY_DEPOSITORY) || BigInt(a.amount) > want.amount) return bad;
    }
  }
  // the delivery side, when the route passes Relay's order data: it must hash to the id in the deposit and pay exactly
  // the buyer, on Robinhood Chain, in $STOA, at least the minimum shown, with every refund to the buyer
  if (q.order !== undefined) {
    const depositId = native ? call.args[1] : call.args[3];
    const why = checkRelayOrder(q.order, {
      depositId: depositId as string, user: want.user, fromSlug: RELAY_SLUG[want.chainId] ?? "", toSlug: RELAY_SLUG[DST_CHAIN],
      currency: native ? NATIVE_ZERO : want.token, amount: want.amount, outCurrency: STOA_RH, minOut: outMin,
      maxDeadline: Math.floor(Date.now() / 1000) + ORDER_MAX_DAYS * 86_400,
    });
    if (why) return bad;
  }
  // the cap uses Stoa's own figure; Trustware's, when it sends one, must agree with it
  const ours = usdOf(want, q.ethUsd), cap = capUsdOf(want, q.ethUsd);
  if (ours === null || cap === null) return "Stoa could not price this purchase right now, so it stopped it before your wallet. Try again in a minute.";
  if (cap > MAX_USD) return `Buying $STOA from another chain is limited to $${MAX_USD} per purchase for now. Use a smaller amount.`;
  // ETH is valued at Stoa's own router price, so for ETH Trustware's dollar figure is required as a second opinion: a
  // low router read can then never lift the cap on its own
  if (native && (q.estimate.fromAmountUsd === undefined || q.estimate.fromAmountUsd === null)) return bad;
  if (q.estimate.fromAmountUsd !== undefined && q.estimate.fromAmountUsd !== null) {
    const theirs = Number(q.estimate.fromAmountUsd);
    if (!Number.isFinite(theirs) || theirs <= 0 || Math.abs(theirs - ours) > ours * USD_TOLERANCE) return bad;
  }
  return null;
}
