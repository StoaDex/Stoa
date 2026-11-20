# Aggregator integration

Route your users through Stoa pools.

There are two ways in:

- **Through the router.** Call `quote(tokenIn, tokenOut, amountIn)` with `eth_call` to get the best route across Stoa pools and Uniswap, then pass that route to `swap`. See [Router and SDK](router-sdk.md).
- **Straight to a pool.** Each `StoaPool` exposes `quoteOut(tokenIn, amountIn)` and `swap(tokenIn, amountIn, minOut, to, referrer)`. Quotes are valid for 2 blocks, so read and fill in the same block where you can.

Pass your own address as `referrer` to earn 10% of the protocol fee on the flow you send. Contact the team on X for integration details. Aggregator partners will be listed here once integrations are live.
