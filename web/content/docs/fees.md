# Fees

What a swap costs on Stoa.

| Fee | Size | Who receives it |
| --- | --- | --- |
| Maker spread | Set by each maker's quote | The maker / pool |
| Protocol fee | 2 bps (0.02%) of the swap, on every route | Stoa's FeeDistributor contract |
| Venue fee | The outside pool's fee, when the swap fills on Uniswap, Aero, Ramses or Liquidity Book | That venue's liquidity providers |
| Pons curve fee | Pons' 1% fee plus the token's creator tax, when the swap fills on a Pons bonding curve | Pons and the token's creator |
| Pons pool fee | Taken by the hook on the Uniswap V4 pool Pons creates at graduation. $STOA's pool takes 2.8% of each buy and sell, the same as its curve did | Pons' hook |
| Referral share | 10% of the protocol fee | The wallet that referred you |
| Network gas | Elysium gas | The network |

The protocol fee is charged once per swap, even when a route has two legs: by the Stoa pool if the route uses one, otherwise by the router. The one exception is a two-leg route through two Stoa pools: each pool takes its own fee on its leg, so that route pays it twice. The quote already includes both fees, the router only picks that route when it still pays you the most, and today no route can use two Stoa pools.

Example: a $1,000 swap pays $0.20 in protocol fee, of which $0.02 goes to the referrer if there is one.

On Robinhood Chain the protocol's share buys $STOA every week and burns it: see [$STOA](token.md).
