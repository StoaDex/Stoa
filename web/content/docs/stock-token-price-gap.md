# Why stock token prices differ from Robinhood

A Robinhood Stock Token has two prices at any moment: Robinhood's own price for the token, and what it trades for in a pool on Robinhood Chain. They are usually close, but not equal. This page explains why, and how to read the gap Stoa shows.

## The two prices

- **Robinhood's price** is the middle of Robinhood's bid and ask for one token. It follows the underlying shares while the US market, extended hours or the overnight session is open.
- **The on-chain price** is set by trades in a pool on Robinhood Chain. Stoa shows the deepest pool's price, and on Trade the price your exact amount would get across every venue it routes.

The gap is how far the on-chain price is from Robinhood's: a negative gap means the token is cheaper on-chain, a positive one dearer.

## Why they differ

### Market hours

On-chain pools trade at any hour, every day. Robinhood's price only moves while a US session is open. On weekends and market holidays the reference stands still while on-chain trading goes on, so gaps tend to widen then and narrow once the market reopens. The badge on [Stocks](https://stoadex.com/stocks) shows which session is open right now.

### Pool depth

A pool's price moves with every trade, and a small pool moves more. A buy of a few thousand dollars can push a thin pool's price up noticeably, and it stays there until someone trades it back. That is also why the price for your amount on Trade can differ from the pool's quoted price: larger amounts move it more.

### Closing a gap takes someone on both sides

A gap closes when traders buy the cheaper side and sell the dearer one. That needs access to both Robinhood and the chain, capital, time and fees, so gaps under about a percent often last, and larger ones can last hours when few people are trading.

### Stale and halted quotes

A pool that barely trades keeps an old price, and a stock that is halted on Robinhood can show a wide, stale quote. Stoa leaves these out of its gap views: pools with under $100 of volume in 24 hours, gaps over 25%, and tokens Robinhood marks as halted.

### Dividends

Robinhood does not pay Stock Token dividends in cash: the token's multiplier increases, so one token can stand for slightly more than one share over time. Stoa compares per-token prices as Robinhood quotes them, which already include it. See [Robinhood's Stock Token page](https://robinhood.com/rhj/stocktokens/).

## Reading the gap on Stoa

- [Stocks](https://stoadex.com/stocks) can sort every token by its gap, cheaper or dearer on-chain, among pools with real liquidity.
- Each stock page shows the gap over the last 7 days, from Stoa's [open dataset](open-data.md).
- On [Trade](trade.md), a stock token swap shows Robinhood's price next to the price you would get, and one tap opens a [limit order](limit-orders.md) at Robinhood's price.
- A **Gap vs Robinhood** alert on a watched token tells you when it is a set percent cheaper or dearer on-chain ([Stock tokens](stocks.md)).

## What a gap is not

A gap is not a promise of profit. Fees, price impact and gas can cost more than the gap, the gap can widen before it narrows, and Robinhood's price can move while you trade. Stock Tokens are issued by Robinhood Assets (Jersey) Limited, not by Stoa, and are not offered in every country. Nothing here is investment advice.
