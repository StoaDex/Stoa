# Metric pools

On Robinhood Chain, Stoa's router also checks [Metric](https://github.com/Metricxyz) pools. Metric pools are oracle-priced: instead of a price set by the balance of two tokens, each pool quotes from a live price feed, the way a market maker quotes from the market. They trade WETH against USDG and Robinhood Stock Tokens against USDG.

## When a swap uses Metric

Metric is one more venue next to Uniswap V2, V3 and V4, Aero, Ramses and the Pons curves. On every swap the router asks each venue what you would receive and takes the route that pays the most, after Stoa's fee. A Metric pool is used only when it pays more than the others for your exact amount. The quote screen shows which venue fills the swap. On [Stocks](https://stoadex.com/stocks), a **Metric** tag marks the stock tokens that have a Metric pool.

## How Stoa picks a Metric pool

A pair can have several Metric pools with different depths and spreads. For each direction of each pair, Stoa's adapter keeps an ordered list of up to four pools:

- **Ranked daily.** Stoa's keeper ranks the pools each morning by what they pay on orders of about $50, $300, $1,500 and $5,000, and writes the order on-chain. Only real Metric pools for that exact pair can be on a list: the adapter checks each one against Metric's factory.
- **One pool per swap.** A swap goes to the first pool on the list that takes the whole amount. A pool that would fill only part of it is skipped, and the next one is tried. The quote follows the same rule, so it shows what the swap will do.
- **A bad list costs price, never funds.** The router still checks the minimum you accept, and the adapter checks every fill.

## What to know

- **The price follows the feed.** A Metric pool quotes from its oracle. When a pool is paused or cannot quote, Metric's quoter refuses it and the router uses another venue.
- **Stock tokens outside market hours.** Stock Tokens trade on-chain at any time, but their reference price moves only while US markets, extended hours or the overnight session are open. See [Stock tokens](stocks.md) for the two prices Stoa shows.
- **Partial fills are not accepted.** Stoa never sends you less than the full swap of your input: a pool that cannot take all of it is not used.
- **Not reviewed by Stoa.** Metric's pools and price feeds are Metric's own contracts. Stoa only routes to them.

## Contract

`MetricAdapter` on Robinhood Chain: [`0x1341DB53ed69cE1DeF86BDBfc60D5FD92Cf9004f`](https://robinhoodchain.blockscout.com/address/0x1341DB53ed69cE1DeF86BDBfc60D5FD92Cf9004f). It is owned by the 48-hour timelock, and Stoa's keeper sets its pool lists. The router added it through the timelock and the router's 24-hour wait, on 19 November 2026. Source: [contracts/src/adapters/MetricAdapter.sol](https://github.com/StoaDex/Stoa/blob/main/contracts/src/adapters/MetricAdapter.sol). All addresses: [Contract addresses](contracts.md).
