import { decodeFunctionData, parseAbi, type Address, type Hex } from "viem";
import { RELAY_DEPOSITORY, RELAY_SLUG } from "./anychain";
import { checkRelayOrder, type RelayOrder } from "./relayOrder";

/** Stoa Pay from another chain: the payer deposits ETH on Base, Arbitrum, Optimism or Ethereum into Relay's Depository,
 *  and Relay's solver pays the requested USDG to the requester on Robinhood Chain. Relay returns its order data, so the
 *  whole payment is checked before the wallet opens, here and on the server: the deposit is depositNative from the
 *  payer, the order hashes to the id in that deposit, pays exactly the requester at least the amount asked in USDG on
 *  Robinhood Chain, refunds only the payer, makes no calls and carries no fee. */

export const PAY_SOURCES = [8453, 42161, 10, 1] as const;
/** the most one cross-chain payment may be, until this path has its own review */
export const PAY_CROSS_MAX_USDG = 500;
export const USDG_RH = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as Address;
const ZERO = "0x0000000000000000000000000000000000000000";
const DEP = parseAbi(["function depositNative(address depositor, bytes32 id) payable"]);

export type PayCrossQuote = {
  chainId: number; payer: Address; to: Address; amount: string;
  tx: { chainId: number; to: Address; data: Hex; value: string };
  order: RelayOrder; requestId: string; inUsd: number | null; etaSeconds: number | null;
};

/** null when the quote is exactly this payment; otherwise why it is refused */
export function checkPayCross(q: PayCrossQuote, w: { chainId: number; payer: string; to: string; amount: bigint }): string | null {
  if (!(PAY_SOURCES as readonly number[]).includes(w.chainId) || q.tx.chainId !== w.chainId) return "Wrong source chain.";
  if (q.tx.to.toLowerCase() !== RELAY_DEPOSITORY.toLowerCase()) return "The deposit does not go to Relay's Depository.";
  let id: Hex;
  try {
    const d = decodeFunctionData({ abi: DEP, data: q.tx.data });
    if (d.functionName !== "depositNative") return "Unexpected deposit.";
    if (d.args[0].toLowerCase() !== w.payer.toLowerCase()) return "The deposit is not from your address.";
    id = d.args[1];
  } catch { return "Stoa could not read the deposit."; }
  const value = BigInt(q.tx.value);
  if (value <= 0n) return "Nothing to pay.";
  const why = checkRelayOrder(q.order, {
    depositId: id, user: w.payer, recipient: w.to, fromSlug: RELAY_SLUG[w.chainId], toSlug: "robinhood",
    currency: ZERO, amount: value, outCurrency: USDG_RH, minOut: w.amount, maxDeadline: Math.floor(Date.now() / 1000) + 8 * 86_400,
  });
  return why ? `Relay's order is not this payment (${why}).` : null;
}
