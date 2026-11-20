# Active pools

An active pool is priced by a maker in real time instead of by a fixed curve.

## Active vs passive

|  | Passive AMM | Active pool (Stoa) |
| --- | --- | --- |
| Price comes from | Pool balances and a formula | A maker's live quote |
| Updates | Only when someone trades | Every few hundred ms |
| Stale-price losses | Arbitrageurs take them from LPs | Reduced: quotes expire after 2 blocks |

## Why this matters

When prices move on Hyperliquid, a passive pool keeps the old price until an arbitrageur trades against it. An active pool moves its price first, so traders get tighter spreads and liquidity providers lose less to arbitrage.
