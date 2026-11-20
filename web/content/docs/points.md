# Points

Stoa Points count what each wallet does on Stoa in a season: the swaps it makes and the swaps it brings through its referral link. Season 1 starts **Monday 23 November 2026, 00:00 UTC**. The leaderboard is on [stoadex.com/points](https://stoadex.com/points).

**Points have no promised value.** They are not a token, cannot be claimed, sold or transferred, and nothing is promised for them. Stoa will never ask you to pay, deposit or sign anything for points.

## How points are counted

| Rule | Detail |
| --- | --- |
| Swaps | 1 point per $1 swapped through a Stoa router, from $1 a swap, valued the same way as [Stats](https://stoadex.com/stats) |
| Stock tokens | A swap with a Robinhood Stock Token on either side counts 2× |
| Referrals | 10% of the points of every swap made through your link (see [Referrals](referrals.md)); your own swaps don't count toward it |
| Daily cap | At most 2,000 points a UTC day from your own swaps |
| Round trips | A swap that undoes your own opposite swap of the same pair within an hour earns nothing |
| Stablecoins | Stablecoin-to-stablecoin swaps earn nothing |
| Stoa's wallets | Stoa's own keeper, Safe and timelock earn nothing |

Points come straight from the routers' `Routed` events on Robinhood Chain and Elysium, so anyone can recount them. The board updates every 5 minutes. After a swap, Trade shows about how many points it earned, before the daily cap.

Wallets that only trade to farm points (for example the same funds swapped back and forth, or groups of wallets referring each other) can be removed from the board. Stoa can change these rules during a season; any change is written on [stoadex.com/points](https://stoadex.com/points) with its date.

## Share your rank

Connect your wallet on [Points](https://stoadex.com/points) and press **Share your rank on X**. The link, `stoadex.com/points/<your wallet>`, shows a card with your points and rank.

## API

`GET https://stoadex.com/api/points?address=0x…` returns a wallet's points, rank and where they came from. Without an address it returns the top 100.
