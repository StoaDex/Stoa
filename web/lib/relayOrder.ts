import { concat, encodeAbiParameters, keccak256, toBytes, toHex, type Address, type Hex } from "viem";

/** Relay protocol v2 orders (what a Depository deposit commits to).
 *
 *  A deposit call carries a 32-byte order id. That id is the EIP-712 struct hash of Relay's order data, with the types
 *  published in @relay-protocol/settlement-sdk (ORDER_EIP712_TYPES). So the order data can be checked locally, whoever
 *  forwards it: recompute the id, compare it with the id in the deposit call, then read who gets paid, on which chain,
 *  in which token, at least how much, where refunds go, and which solver fills it. Order data edited to look right no
 *  longer hashes to the id in the deposit. If Relay moves to another order format the id stops matching and every
 *  order is refused until this is updated, which is the safe way to fail. */

export interface RelayOrder {
  version: string;
  solverChainId: string;
  solver: string;
  salt: string;
  inputs: {
    payment: { chainId: string; currency: string; amount: string; weight: string };
    refunds: { chainId: string; recipient: string; currency: string; minimumAmount: string; deadline: number | string; extraData: string }[];
  }[];
  output: {
    chainId: string;
    payments: { recipient: string; currency: string; minimumAmount: string; expectedAmount: string }[];
    deadline: number | string;
    calls: string[];
    extraData: string;
  };
  fees: { recipientChainId: string; recipient: string; currencyChainId: string; currency: string; amount: string }[];
}

type Field = [name: string, type: string];
const T: Record<string, Field[]> = {
  Order: [["version", "string"], ["solverChainId", "string"], ["solver", "address"], ["salt", "uint256"], ["inputs", "Input[]"], ["output", "Output"], ["fees", "Fee[]"]],
  Input: [["payment", "InputPayment"], ["refunds", "InputRefund[]"]],
  InputPayment: [["chainId", "string"], ["currency", "bytes"], ["amount", "uint256"], ["weight", "uint256"]],
  InputRefund: [["chainId", "string"], ["recipient", "bytes"], ["currency", "bytes"], ["minimumAmount", "uint256"], ["deadline", "uint32"], ["extraData", "bytes"]],
  Output: [["chainId", "string"], ["payments", "OutputPayment[]"], ["deadline", "uint32"], ["calls", "bytes[]"], ["extraData", "bytes"]],
  OutputPayment: [["recipient", "bytes"], ["currency", "bytes"], ["minimumAmount", "uint256"], ["expectedAmount", "uint256"]],
  Fee: [["recipientChainId", "string"], ["recipient", "bytes"], ["currencyChainId", "string"], ["currency", "bytes"], ["amount", "uint256"]],
};

function deps(t: string, seen: Set<string>) {
  const b = t.endsWith("[]") ? t.slice(0, -2) : t;
  if (!T[b] || seen.has(b)) return;
  seen.add(b);
  for (const [, ft] of T[b]) deps(ft, seen);
}
function encodeType(primary: string) {
  const s = new Set<string>();
  deps(primary, s);
  s.delete(primary);
  return [primary, ...[...s].sort()].map((n) => `${n}(${T[n].map(([fn, ft]) => `${ft} ${fn}`).join(",")})`).join("");
}
function encodeValue(type: string, v: unknown): Hex {
  if (type.endsWith("[]")) return keccak256(concat((v as unknown[]).map((x) => encodeValue(type.slice(0, -2), x))));
  if (T[type]) return hashStruct(type, v as Record<string, unknown>);
  if (type === "string") return keccak256(toBytes(String(v)));
  if (type === "bytes") return keccak256(String(v) as Hex);
  if (type === "address") return encodeAbiParameters([{ type: "address" }], [String(v) as Address]);
  if (type.startsWith("uint")) return toHex(BigInt(v as string | number), { size: 32 });
  throw new Error(`type ${type}`);
}
function hashStruct(type: string, d: Record<string, unknown>): Hex {
  return keccak256(concat([keccak256(toBytes(encodeType(type))), ...T[type].map(([fn, ft]) => encodeValue(ft, d[fn]))]));
}

/** the order id a deposit for this order must carry */
export function relayOrderId(o: RelayOrder): Hex {
  return hashStruct("Order", o as unknown as Record<string, unknown>);
}

/** Relay's solver as pinned by Stoa (Relay's docs give it as the signer of orderSignature; every order seen fills with it) */
export const RELAY_SOLVER = "0xf70da97812cb96acdf810712aa562db8dfa3dbef";

const lc = (s: string) => s.toLowerCase();
const ZERO = "0x0000000000000000000000000000000000000000";

export interface OrderWant {
  /** the id in the deposit call */
  depositId: string;
  /** the buyer: the only recipient of every refund, and of the output unless recipient is set */
  user: string;
  /** who gets the output when it is not the buyer (Stoa Pay: the person who asked to be paid) */
  recipient?: string;
  /** Relay chain slugs, e.g. "base" and "robinhood" */
  fromSlug: string;
  toSlug: string;
  /** what is paid in (address(0) for the native coin) and how much */
  currency: string;
  amount: bigint;
  /** what must arrive and at least how much */
  outCurrency: string;
  minOut: bigint;
  /** the latest acceptable output deadline (unix seconds) */
  maxDeadline: number;
}

/** null when the order is exactly the purchase the buyer picked; otherwise why it is refused */
export function checkRelayOrder(o: RelayOrder | null | undefined, w: OrderWant): string | null {
  if (!o || typeof o !== "object") return "no order";
  let id: string;
  try { id = relayOrderId(o); } catch { return "order does not hash"; }
  if (lc(id) !== lc(w.depositId)) return "order is not the one the deposit commits to";
  if (lc(o.solver) !== RELAY_SOLVER) return "unknown solver";
  if (o.inputs.length !== 1) return "more than one input";
  const p = o.inputs[0].payment;
  if (p.chainId !== w.fromSlug || lc(p.currency) !== lc(w.currency) || BigInt(p.amount) !== w.amount) return "input is not what was picked";
  for (const r of o.inputs[0].refunds) {
    if (lc(r.recipient) === lc(w.user)) continue;
    // Stoa Pay: Relay may settle on the destination chain by paying the requester in the output token; that is still
    // the payment going where it was asked to
    if (w.recipient && lc(r.recipient) === lc(w.recipient) && r.chainId === w.toSlug && lc(r.currency) === lc(w.outCurrency)) continue;
    return "a refund goes to someone else";
  }
  if (o.output.chainId !== w.toSlug) return "output on another chain";
  if (o.output.calls.length) return "output makes calls";
  if (o.output.payments.length !== 1) return "more than one output payment";
  const out = o.output.payments[0];
  if (lc(out.recipient) !== lc(w.recipient ?? w.user)) return "output goes to someone else";
  if (lc(out.currency) !== lc(w.outCurrency)) return "output is another token";
  if (BigInt(out.minimumAmount) < w.minOut) return "output minimum is below what was shown";
  if (Number(o.output.deadline) > w.maxDeadline) return "deadline too far out";
  for (const f of o.fees) if (BigInt(f.amount) > 0n && lc(f.recipient) !== ZERO) return "order carries a fee";
  return null;
}

/** Relay's receiver on the destination chain for orders that make a call: it takes the output and runs the call. The same
 *  contract at the same address on Base and Robinhood Chain (seen in every call order, Nov 2026). Pinned, so an order
 *  that pays anyone else is refused. */
export const RELAY_CALL_RECEIVER = "0x0729e2a4716d9f7dd17858d5d504426d228697f7";

export interface CallOrderWant {
  depositId: string;
  /** the buyer: every refund goes here */
  user: string;
  fromSlug: string;
  toSlug: string;
  /** the native coin paid in on the source chain, exactly */
  amount: bigint;
  /** the one call the output must make, and the native value it carries */
  call: { to: string; data: string; value: bigint };
  maxDeadline: number;
}

/** null when a call order pays the native coin to Relay's receiver and makes exactly the call Stoa built (the buy on
 *  StoaCrossBuy, which sends the token to the buyer or the ETH back to them); otherwise why it is refused */
export function checkRelayCallOrder(o: RelayOrder | null | undefined, w: CallOrderWant): string | null {
  if (!o || typeof o !== "object") return "no order";
  let id: string;
  try { id = relayOrderId(o); } catch { return "order does not hash"; }
  if (lc(id) !== lc(w.depositId)) return "order is not the one the deposit commits to";
  if (lc(o.solver) !== RELAY_SOLVER) return "unknown solver";
  if (o.inputs.length !== 1) return "more than one input";
  const p = o.inputs[0].payment;
  if (p.chainId !== w.fromSlug || lc(p.currency) !== ZERO || BigInt(p.amount) !== w.amount) return "input is not what was picked";
  if (!o.inputs[0].refunds.length) return "no refund path";
  for (const r of o.inputs[0].refunds) if (lc(r.recipient) !== lc(w.user)) return "a refund goes to someone else";
  if (o.output.chainId !== w.toSlug) return "output on another chain";
  if (o.output.payments.length !== 1) return "more than one output payment";
  const out = o.output.payments[0];
  if (lc(out.recipient) !== RELAY_CALL_RECEIVER || lc(out.currency) !== ZERO || BigInt(out.minimumAmount) < w.call.value) return "output is not the call's funding";
  if (o.output.calls.length !== 1) return "not exactly one call";
  // a call is encoded as (address to, (bytes data), uint256 value); compared byte for byte with Stoa's own encoding
  let want: Hex;
  try { want = encodeAbiParameters([{ type: "address" }, { type: "tuple", components: [{ type: "bytes" }] }, { type: "uint256" }], [w.call.to as Address, [w.call.data as Hex], w.call.value]); } catch { return "call does not encode"; }
  if (lc(o.output.calls[0]) !== lc(want)) return "call is not the one Stoa built";
  if (Number(o.output.deadline) > w.maxDeadline) return "deadline too far out";
  for (const f of o.fees) if (BigInt(f.amount) > 0n && lc(f.recipient) !== ZERO) return "order carries a fee";
  return null;
}
