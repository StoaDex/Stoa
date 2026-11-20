# Build a price provider

Plug an independent price check into a pool.

Each pool can name a quote guard. When one is set, every maker quote is checked against it before it is accepted, so a broken or compromised maker cannot post a price far from the market. The guardian can set, replace or remove the guard without redeploying the pool.

```solidity
interface IQuoteGuard {
  // prices: quote-token raw units per 1e18 raw base units, as in StoaPool.setQuote
  function check(address base, address quote, uint128 bidPx, uint128 askPx)
    external view returns (bool ok);
}
```

A guard usually reads a reference price (an oracle, or Hyperliquid's orderbook once Elysium can read HyperCore) and returns `true` when the bid and ask are within a set distance of it.
