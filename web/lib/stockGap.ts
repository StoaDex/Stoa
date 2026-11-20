/** A pool that barely trades keeps an old price: its gap against Robinhood is not a market, so the gap views leave it
 *  out (seen with CBRS: $148K of liquidity, $13 of 24h volume, on-chain 12% above Robinhood). */
export const STALE_VOLUME_USD = 100;
export const isStalePool = (dex: { volume24h: number } | null | undefined) => !!dex && !(dex.volume24h >= STALE_VOLUME_USD);
