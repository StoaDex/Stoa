# Trade Pons tokens on Stoa

[Pons](https://ponsfamily.com) is a token launchpad on Robinhood Chain. Every Pons token starts on its own bonding curve and moves to a Uniswap V4 pool when the curve fills. Stoa trades it at both stages, and [Launches](https://stoadex.com/launches) lists the live ones.

## The two stages

| Stage | Where the token trades | What Stoa does |
| --- | --- | --- |
| On the curve | The token's Pons bonding curve. Buys push the price up, sells push it down (x·y=k on the curve's reserves) | Trades on the curve through the Pons curve adapter (live since 18 Nov 2026) |
| Graduated | A Uniswap V4 pool that Pons creates and fills when the curve reaches its target, usually 4.2 ETH. The pool's liquidity is locked | Routes the V4 pool. Stoa's keeper adds every new graduation pool to the router, usually within the hour |

## Find a token

- [Launches](https://stoadex.com/launches) shows every Pons curve that raised at least 0.05 ETH in the last few days, with curve progress, market cap, creator tax and age, plus recent graduations. Search by name, ticker or address, sort by closest to graduation, newest or market cap.
- Every launch has its own page, `stoadex.com/launches/<token address>` (tap a token on Launches): curve progress, price, market cap and creator tax, refreshed every 10 seconds, with a Trade or Pons button. Its link card on X and Telegram shows the token's logo and progress.
- On the swap screen, pick the token from the list (live launches are in it) or paste its contract address.
- Tokens marked **Covered** have a creator who bonded ETH behind their wallet with [Rug Cover](rug-cover.md). Buy them with ETH and tick "Buy with Rug Cover" to be covered.

## Costs

| Cost | Size | Goes to |
| --- | --- | --- |
| Pons fee (curve only) | 1% of each buy and sell | Pons |
| Creator tax (curve only) | Set by the creator at launch, usually 0% to 4%. Launches shows it for each token | The token's creator |
| Pons pool fee (graduated) | Taken by the hook on the V4 pool Pons creates. $STOA's pool has a 0% swap fee and its hook takes 2.8% of each buy and sell, the same as its curve did | Pons' hook |
| Stoa protocol fee | 2 bps (0.02%) | Stoa's fee contract (10% to your referrer, if you have one) |

On a curve fill, the swap screen shows a **Curve fees** line with the exact Pons fee and creator tax. Both are already included in the amount you see.

## What Stoa leaves to Pons

- **The buy that would graduate a curve.** That buy takes the last tokens on the curve, gets part of its ETH refunded and moves the token to Uniswap V4 in the same transaction. Stoa does not quote it; buy a little less, or buy on Pons.
- **Curves priced in another token** instead of ETH, and **the first seconds after a launch**, when Pons charges a decaying anti-sniper tax. Once a launch priced in **USDG** graduates, its pool pairs it with USDG and Stoa routes it from USDG (swap ETH to USDG first). Launches priced in other tokens, such as stock tokens, stay on Pons.
- **Pools other people create** for a Pons token. Only the pool Pons creates at graduation is added automatically.

## Before you buy

Anyone can launch a token on Pons in a minute. Stoa does not review them: most go to zero, and a creator can sell their own tokens at any time. A token being on Launches or routable on Stoa says nothing about its quality. Check the contract address, look at who is behind it, and only buy what you can afford to lose. See [Risks](risks.md).

## Share and earn

Every token on Launches, and every token page, has a **Share** button. The link opens the token's own page with its link card. With your wallet connected, it carries your referral: you earn 10% of Stoa's protocol fee on the swaps it brings. See [Referrals](referrals.md).
