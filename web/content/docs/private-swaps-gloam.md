# Trade privately with Gloam

On a public chain every swap shows who made it. [Gloam](https://www.gloam.trade) is a separate app that swaps from a private balance: the chain still shows the tokens, the amounts and the time, but not who traded. Stoa does not run Gloam and does not route these swaps. Gloam uses its own router and its own allowlisted pools.

What Stoa adds is the check before the trade: the same safety check Stoa runs before any swap, on the same live chain.

## On stoadex.com

On a Robinhood Chain token page, **Trade privately** opens Gloam's Swap tab with the trade filled in (for example USDG into TSLA). You review the quote and confirm in Gloam. The link shows only for tokens Gloam's docs list for Robinhood Chain: USDG, ETH, USDe, U, cbBTC, VIRTUAL, PONS, CASHCAT, AI, ORBIO, GLOAM and stock tokens such as SPY, NVDA, TSLA and AAPL.

On Trade, when you buy a token Gloam lists, a line under the safety check links to the same trade on Gloam.

Before you open it, run [Stoa's safety check](https://stoadex.com/check) on the token: a test buy and sell through Stoa's router, simulated on the live chain, plus who holds the supply.

## For agents

An agent with both MCP servers can check a token on Stoa, then swap it privately on Gloam:

1. **Check** with Stoa's MCP (`stoadex.com/mcp`): call `safety_check` with the token. Stop if the verdict is `danger`; treat `caution` and `unknown` as a reason to ask the user. For tokens Gloam lists, the answer also carries `privateSwap.url`, a link the user can open to review and confirm the trade in Gloam.
2. **Quote** with Gloam's MCP (`@gloamtrade/mcp`): `gloam_swap_quote`.
3. **Swap**: `gloam_execute_private_swap`, then `gloam_finish_swap`.

Stoa's `safety_check` needs no API key. Agents that pay per call can also use it through Autonomo (see [Stoa for Autonomo agents](autonomo.md)). Gloam's own tools, limits and keys are described in [Gloam's docs](https://www.gloam.trade/docs/private-swaps).

## Good to know

- **Prices.** Gloam's swap uses its own pools and route. Its quote can differ from Stoa's quote for the same trade; compare both before you pick.
- **What stays public.** Tokens, amounts, timing and the fact that Gloam's router was used. Who swapped is what Gloam keeps private.
- **The token itself.** A private swap does not make a token safer. The safety check is about the token; Gloam is about who can see the trade.
