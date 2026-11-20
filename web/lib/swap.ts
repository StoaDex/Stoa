import type { Address } from "viem";
import { NATIVE, WHYPE, type Token } from "./tokens";

export type SwapKind = "wrap" | "unwrap" | "hypeIn" | "hypeOut" | "erc20";

/** Which call a pair needs. Native <-> wrapped native (HYPE/WHYPE, ETH/WETH) is a plain wrap, not a swap. */
export function swapKind(sell: Token, buy: Token, wrapped: Address = WHYPE): SwapKind {
  const sN = sell.address === NATIVE, bN = buy.address === NATIVE;
  if (sN && buy.address.toLowerCase() === wrapped.toLowerCase()) return "wrap";
  if (bN && sell.address.toLowerCase() === wrapped.toLowerCase()) return "unwrap";
  if (sN) return "hypeIn";
  if (bN) return "hypeOut";
  return "erc20";
}

export type Leg = { venue: Address; isPool: boolean };
/** A route as returned by StoaRouter.quote (eth_call). mid is the zero address for a direct swap. */
export type Route = { amountOut: bigint; mid: Address; leg1: Leg; leg2: Leg };

const ZERO = "0x0000000000000000000000000000000000000000";
export const isHop = (r: Route) => r.mid.toLowerCase() !== ZERO;
export const hasRoute = (r: Route) => r.leg1.venue.toLowerCase() !== ZERO && r.amountOut > 0n;

/** Human name of a venue: Stoa pools by flag, known adapters by address, anything else generic. */
export function venueName(l: Leg, known: Record<string, string> = {}): string {
  if (l.isPool) return "Stoa maker pool";
  return known[l.venue.toLowerCase()] ?? "Outside venue";
}

/** "Stoa maker pool" or "Aero → Stoa maker pool (via WHYPE)". */
export function describeRoute(r: Route, known: Record<string, string> = {}, hop = "WHYPE"): string {
  if (!isHop(r)) return venueName(r.leg1, known);
  const a = venueName(r.leg1, known), b = venueName(r.leg2, known);
  return a === b ? `${a} (via ${hop})` : `${a} → ${b} (via ${hop})`;
}

/** The router takes native HYPE as the zero address on either side, so token addresses pass through. */
export function swapParams(
  sell: Token, buy: Token, r: Route, amountIn: bigint, min: bigint, to: Address, deadline: bigint, referrer: Address,
) {
  return {
    tokenIn: sell.address, tokenOut: buy.address, mid: r.mid, leg1: r.leg1, leg2: r.leg2,
    amountIn, minOut: min, to, deadline, referrer,
  };
}

/** What the trader set in the swap form. A swap is prepared asynchronously (fresh quote, gas estimate), so the
 *  parameters sent to the wallet are checked against the form as it is right before sending. */
export type SwapForm = { amount: string; slip: number; sell: string; buy: string };

/** True if the form still holds what the swap was prepared from (addresses compared case-insensitively). */
export function sameForm(a: SwapForm, b: SwapForm): boolean {
  return a.amount === b.amount && a.slip === b.slip && a.sell.toLowerCase() === b.sell.toLowerCase() &&
    a.buy.toLowerCase() === b.buy.toLowerCase();
}

export const FORM_CHANGED = "The swap form changed while this swap was being prepared. Check the amount and tap Swap again.";

/** Minimum output after slippage, rounded down. slippage in percent, e.g. 0.5 */
export function minOut(amountOut: bigint, slippagePct: number): bigint {
  const bps = BigInt(Math.round(slippagePct * 100));
  return (amountOut * (10_000n - bps)) / 10_000n;
}

/** Parse a decimal string into raw units; returns undefined for invalid input. */
export function parseAmount(v: string, decimals: number): bigint | undefined {
  const s = v.trim();
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return undefined;
  const [i, f = ""] = s.split(".");
  if (f.length > decimals) return undefined;
  const raw = BigInt((i || "0") + f.padEnd(decimals, "0"));
  return raw > 0n ? raw : undefined;
}

/** Format raw units for display with up to `max` decimals, trimming zeros. */
/** Display amount with decimals that fit the size: 2 above 1,000, 4 above 1, else 6. Keeps big outputs on one line. */
export function fmtAmt(raw: bigint, decimals: number): string {
  const one = 10n ** BigInt(decimals);
  const abs = raw < 0n ? -raw : raw;
  return fmt(raw, decimals, abs >= 1000n * one ? 2 : abs >= one ? 4 : 6);
}

export function fmt(raw: bigint, decimals: number, max = 6): string {
  const neg = raw < 0n; if (neg) raw = -raw;
  const base = 10n ** BigInt(decimals);
  const int = raw / base;
  let frac = (raw % base).toString().padStart(decimals, "0").slice(0, max).replace(/0+$/, "");
  const intS = int.toLocaleString("en-US");
  return (neg ? "-" : "") + (frac ? `${intS}.${frac}` : intS);
}

/** Effective price of a quote: buy units per sell unit. */
export function rate(amountIn: bigint, inDec: number, amountOut: bigint, outDec: number): number {
  if (amountIn === 0n) return 0;
  return Number(amountOut) / 10 ** outDec / (Number(amountIn) / 10 ** inDec);
}

/** Referral from ?ref=0x..., never the user's own address. */
export function cleanRef(ref: string | null | undefined, self?: string): Address | undefined {
  if (!ref || !/^0x[0-9a-fA-F]{40}$/.test(ref)) return undefined;
  if (self && ref.toLowerCase() === self.toLowerCase()) return undefined;
  return ref as Address;
}
