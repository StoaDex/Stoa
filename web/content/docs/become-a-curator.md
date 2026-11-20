# Become a curator

Curators run their own maker pools on Stoa.

A curator picks a pair and a price source, supplies the pool's inventory, and runs a maker that quotes every block ([Become a maker](become-a-maker.md)). In return the curator keeps the spread it quotes. During launch, pools are listed by the Stoa team: reach out on X to apply.

## The bond

Makers post a bond before they can quote. Each pool sets a minimum bond, and a maker below it cannot quote. A bond can be slashed for clearly bad pricing, and withdrawing it takes a waiting period so it cannot be pulled right after a bad quote.

- **Elysium:** the bond is in **HYPE**, per pool. Slashed HYPE goes to the treasury.
- **Robinhood Chain:** the bond is in **$STOA**, one bond for all of a maker's pools, held by the [BondRegistry](token.md). Slashed $STOA is burned. Withdrawing takes 3 days. The BondRegistry is live: you can bond and withdraw on the [$STOA page](https://stoadex.com/token), and you can quote once the first Robinhood Chain maker pool is listed with your address approved.

## Verified pools

Pools reviewed by the team get a Verified badge in [Pools](https://stoadex.com/pools). Pools can also turn on an independent quote check that rejects prices too far from a reference.
