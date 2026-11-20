/** Pure quoting logic: no I/O, so it can be unit-tested. */

export interface Inventory {
  baseRaw: bigint;
  quoteRaw: bigint;
}
export interface Decimals {
  base: number;
  quote: number;
}
export interface QuoteParams {
  baseSpreadBps: number;
  minSpreadBps: number;
  volMultiplier: number;
  skewBps: number;
  sideNotionalUsd: number;
  inventoryUse: number;
  maxInventoryRatio: number;
}
export interface MakerQuote {
  bidPx: bigint; // quote raw per 1e18 base raw
  askPx: bigint;
  bidSize: bigint; // base raw the pool will buy
  askSize: bigint; // base raw the pool will sell
  centre: number;
  halfSpreadBps: number;
  invRatio: number; // share of value held in base
}

const UINT96_MAX = (1n << 96n) - 1n;
const SCALE = 10n ** 18n;

/** Price (quote per 1 base, human units) -> pool price units. */
export function toPx(price: number, dec: Decimals, roundUp: boolean): bigint {
  const scaled = price * 10 ** dec.quote;
  const int = BigInt(roundUp ? Math.ceil(scaled - 1e-9) : Math.floor(scaled + 1e-9));
  return (int * SCALE) / 10n ** BigInt(dec.base);
}

/** Pool price units -> human price. */
export function fromPx(px: bigint, dec: Decimals): number {
  return Number((px * 10n ** BigInt(dec.base)) / SCALE) / 10 ** dec.quote;
}

export function inventoryValue(inv: Inventory, mid: number, dec: Decimals) {
  const base = Number(inv.baseRaw) / 10 ** dec.base;
  const quote = Number(inv.quoteRaw) / 10 ** dec.quote;
  const baseUsd = base * mid;
  const total = baseUsd + quote;
  return { base, quote, baseUsd, total, ratio: total > 0 ? baseUsd / total : 0.5 };
}

export function buildQuote(mid: number, volBps: number, inv: Inventory, dec: Decimals, p: QuoteParams): MakerQuote {
  if (!(mid > 0)) throw new Error("mid must be > 0");
  const v = inventoryValue(inv, mid, dec);

  // Long base -> shift the centre down so the pool sells base more readily (and buys less).
  const imbalance = Math.max(-1, Math.min(1, (v.ratio - 0.5) * 2));
  const centre = mid * (1 - (imbalance * p.skewBps) / 10_000);

  const halfSpreadBps = Math.max(p.minSpreadBps, p.baseSpreadBps + p.volMultiplier * volBps);
  const bid = centre * (1 - halfSpreadBps / 10_000);
  const ask = centre * (1 + halfSpreadBps / 10_000);
  const bidPx = toPx(bid, dec, false);
  let askPx = toPx(ask, dec, true);
  if (askPx <= bidPx) askPx = bidPx + 1n;

  // sizes, in base raw units
  const notionalBase = BigInt(Math.floor((p.sideNotionalUsd / mid) * 10 ** dec.base));
  const useBps = BigInt(Math.floor(p.inventoryUse * 10_000));
  const quoteBudget = (inv.quoteRaw * useBps) / 10_000n;
  const bidByInventory = bidPx > 0n ? (quoteBudget * SCALE) / bidPx : 0n;
  let bidSize = min(notionalBase, bidByInventory);
  let askSize = min(notionalBase, (inv.baseRaw * useBps) / 10_000n);

  if (v.ratio >= p.maxInventoryRatio) bidSize = 0n; // too much base: stop buying it
  if (v.ratio <= 1 - p.maxInventoryRatio) askSize = 0n; // too little base: stop selling it

  return {
    bidPx,
    askPx,
    bidSize: min(bidSize, UINT96_MAX),
    askSize: min(askSize, UINT96_MAX),
    centre,
    halfSpreadBps,
    invRatio: v.ratio,
  };
}

const min = (a: bigint, b: bigint) => (a < b ? a : b);

/** Short-term volatility as an EWMA of squared log returns, in bps per tick. */
export class VolTracker {
  private ewma = 0;
  private last?: number;
  constructor(private alpha = 0.1) {}
  update(mid: number): number {
    if (this.last !== undefined && this.last > 0) {
      const r = Math.log(mid / this.last);
      this.ewma = this.alpha * r * r + (1 - this.alpha) * this.ewma;
    }
    this.last = mid;
    return this.bps();
  }
  bps(): number {
    return Math.sqrt(this.ewma) * 10_000;
  }
}
