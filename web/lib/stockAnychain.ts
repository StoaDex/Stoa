import { decodeFunctionData, encodeFunctionData, parseAbi, type Address, type Hex } from "viem";
import dep from "./deployments-4663.json";
import { ETH_USD_FLOOR, RELAY_DEPOSITORY, RELAY_SLUG } from "./anychain";
import { checkRelayCallOrder, type RelayOrder } from "./relayOrder";

/** Buy a stock token from another chain in one transaction. The buyer deposits ETH on Base, Arbitrum, Optimism or
 *  Ethereum into Relay's Depository; Relay delivers ETH on Robinhood Chain to StoaCrossBuy together with a call to
 *  `buy`, which swaps it through the Stoa router into the stock token and sends it to the buyer. If that swap fails
 *  (the price moved past the minimum, a paused router, a halted token), StoaCrossBuy sends the ETH to the buyer instead.
 *
 *  Unlike the $STOA route (Trustware), this asks Relay directly, which returns Relay's order data. So the delivery side
 *  is checked too, in the browser, before the wallet opens: the order hashes to the id in the deposit, every refund
 *  goes to the buyer, and the one call it makes is exactly the buy Stoa built, for this buyer, this token and at least
 *  the minimum shown (lib/relayOrder.ts checkRelayCallOrder). */

export const CROSS_BUY = dep.crossBuy as Address;
/** source chains that pay in their native ETH */
export const STOCK_SOURCES = [8453, 42161, 10, 1] as const;
/** the most one purchase may move (in USD at Stoa's ETH price), as for $STOA */
export const STOCK_MAX_USD = 500;
/** what the swap on Robinhood Chain accepts below the quote: the delivery takes a few seconds */
export const STOCK_SLIPPAGE_BPS = 150n;
/** the most the source deposit may exceed the ETH delivered on Robinhood Chain (Relay's fee and gas), in bps */
const MAX_OVERHEAD_BPS = 500n;
const MAX_DEADLINE_S = 2 * 3600;

export const CROSS_BUY_ABI = parseAbi([
  "function buy(address tokenOut, address mid, (address venue, bool isPool) leg1, (address venue, bool isPool) leg2, uint256 minOut, address to, uint256 deadline, address referrer) payable returns (uint256)",
  "event Bought(address indexed to, address indexed tokenOut, uint256 ethIn, uint256 amountOut, address referrer)",
  "event Refunded(address indexed to, address indexed tokenOut, uint256 ethIn)",
]);
const DEPOSIT_ABI = parseAbi(["function depositNative(address depositor, bytes32 id) payable"]);

export interface StockQuote {
  chainId: number; user: Address; stock: Address; symbol: string; decimals: number;
  /** ETH delivered to StoaCrossBuy on Robinhood Chain (wei), and the swap it funds */
  ethOut: string; out: string; minOut: string; buyData: Hex;
  /** the deposit to send on the source chain */
  tx: { chainId: number; to: Address; data: Hex; value: string };
  order: RelayOrder; requestId: string;
  /** Stoa's ETH price (its router, USDG) and Relay's dollar figure for the deposit */
  ethUsd: number; inUsd: number | null; etaSeconds: number | null;
}

export interface StockWant { user: Address; chainId: number; stock: Address; ethOut: bigint }

/** null when the quote does exactly what the buyer picked; otherwise why it is refused */
export function checkStockQuote(q: StockQuote, w: StockWant, now = Math.floor(Date.now() / 1000)): string | null {
  const bad = "This route looks wrong, so Stoa stopped it before your wallet. Nothing was sent. Get a new quote.";
  if (!(STOCK_SOURCES as readonly number[]).includes(w.chainId) || q.chainId !== w.chainId) return bad;
  if (q.user.toLowerCase() !== w.user.toLowerCase() || q.stock.toLowerCase() !== w.stock.toLowerCase()) return bad;
  let ethOut: bigint, out: bigint, minOut: bigint, value: bigint;
  try { ethOut = BigInt(q.ethOut); out = BigInt(q.out); minOut = BigInt(q.minOut); value = BigInt(q.tx.value); } catch { return bad; }
  if (ethOut !== w.ethOut || out <= 0n || minOut <= 0n || minOut > out || minOut * 10_000n < out * (10_000n - STOCK_SLIPPAGE_BPS - 1n)) return bad;
  // the deposit: Relay's Depository on the source chain, from the buyer, canonical encoding
  if (Number(q.tx.chainId) !== w.chainId || q.tx.to.toLowerCase() !== RELAY_DEPOSITORY.toLowerCase()) return bad;
  let dep: ReturnType<typeof decodeFunctionData<typeof DEPOSIT_ABI>>;
  try { dep = decodeFunctionData({ abi: DEPOSIT_ABI, data: q.tx.data }); } catch { return bad; }
  if (encodeFunctionData({ abi: DEPOSIT_ABI, functionName: "depositNative", args: dep.args }).toLowerCase() !== q.tx.data.toLowerCase()) return bad;
  if (dep.args[0].toLowerCase() !== w.user.toLowerCase()) return bad;
  if (value < ethOut || value * 10_000n > ethOut * (10_000n + MAX_OVERHEAD_BPS)) return bad;
  // the swap on Robinhood Chain: this stock, to this buyer, at least the minimum shown, a near deadline
  let buy: ReturnType<typeof decodeFunctionData<typeof CROSS_BUY_ABI>>;
  try { buy = decodeFunctionData({ abi: CROSS_BUY_ABI, data: q.buyData }); } catch { return bad; }
  if (buy.functionName !== "buy") return bad;
  const [tokenOut, , , , bMin, to, deadline] = buy.args;
  if (tokenOut.toLowerCase() !== w.stock.toLowerCase() || to.toLowerCase() !== w.user.toLowerCase() || bMin !== minOut) return bad;
  if (deadline > BigInt(now + MAX_DEADLINE_S)) return bad;
  // the order behind the deposit: hashes to its id, refunds to the buyer, and makes exactly that call with that ETH
  const why = checkRelayCallOrder(q.order, {
    depositId: dep.args[1], user: w.user, fromSlug: RELAY_SLUG[w.chainId] ?? "", toSlug: RELAY_SLUG[4663],
    amount: value, call: { to: CROSS_BUY, data: q.buyData, value: ethOut }, maxDeadline: now + 8 * 86_400,
  });
  if (why) return bad;
  // the cap, at Stoa's ETH price (never below the floor); Relay's figure, when given, must agree within 5%
  if (!(q.ethUsd > 0)) return "Stoa could not price this purchase right now, so it stopped it before your wallet. Try again in a minute.";
  const usd = (Number(value) / 1e18) * Math.max(q.ethUsd, ETH_USD_FLOOR);
  if (usd > STOCK_MAX_USD) return `Buying stocks from another chain is limited to $${STOCK_MAX_USD} per purchase for now. Use a smaller amount.`;
  if (q.inUsd !== null) {
    const ours = (Number(value) / 1e18) * q.ethUsd;
    if (!(q.inUsd > 0) || Math.abs(q.inUsd - ours) > ours * 0.05) return bad;
  }
  return null;
}
