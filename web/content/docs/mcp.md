# MCP server for AI agents

Stoa runs a hosted MCP server, so an AI agent (Claude, Cursor, or any MCP client) can quote swaps, check tokens and build swap transactions on Robinhood Chain and Elysium. You don't need a key or an account.

```
https://stoadex.com/mcp
```

It uses the Streamable HTTP transport and is stateless. Every tool is read-only. `build_swap` returns an **unsigned** transaction that the user's own wallet signs: Stoa never signs, holds keys or moves funds.

## Tools

| Tool | What it does |
| --- | --- |
| `list_tokens` | Tokens Stoa lists on a network, with addresses and decimals, and the router address |
| `quote` | Compares every venue Stoa routes for an exact amount: `amountOut` (after the 2 bps fee), `minOut`, price impact and the route |
| `build_swap` | The same quote, plus the unsigned transaction for the `taker` wallet and, when selling a token, the approval it needs first |
| `safety_check` | Simulates a small buy and sell-back (nothing sent), plus creator and top-10 holdings. Verdict: `ok`, `caution`, `danger` or `unknown` |
| `bridge_quote` | Moves ETH, USDC or USDT from Base, Arbitrum, Ethereum, Optimism or BNB Chain to the same wallet on Robinhood Chain (as ETH or USDG), through LI.FI over Across. Returns an unsigned source-chain transaction that Stoa has already decoded: receiver and refund address are the wallet, destination is Robinhood Chain, exact amount. Regular wallets only |
| `market_context` | CoinMarketCap data to put a trade in context: total crypto market cap and 24h change, BTC and ETH prices, Fear and Greed, and for up to 5 Robinhood Chain tokens their price, market cap, liquidity and last 24h of trading. Context only; the price a swap gets is the one `quote` returns |
| `stock_tokens` | Robinhood Stock Tokens: Robinhood's price next to the on-chain price, liquidity, volume, and whether Stoa routes them |
| `spotlight` | This week's Spotlight on Robinhood Chain: the phase and closing times, the rules, every candidate with its ETH bid and $STOA votes, last week's winners and the $STOA locked. Sponsored slots, not reviewed |
| `stock_gaps` | Stock tokens whose on-chain price is furthest from Robinhood's (cheaper or dearer, real liquidity only), and optionally one token's gap every 6 hours for 7 days from Stoa's open dataset. Information, not trading advice |
| `open_data` | Stoa's open datasets on Hugging Face with links, or live: every routed swap, the Points board, or the venue-quote basket |

Arguments and responses match the [API](api.md): amounts are integers in the token's smallest unit, and `native` means the gas token.

## Add it to your agent

- **Claude** (Settings, Connectors) or **Claude Code**: add a custom connector with the URL above, or run `claude mcp add --transport http stoa https://stoadex.com/mcp`.
- **Cursor and other MCP clients**: add a remote (HTTP) server with the URL above.

## Skill file

Building your own agent in TypeScript? `npm i @stoadex/agent-tools` gives you the same tools for the Vercel AI SDK (`@stoadex/agent-tools/ai`), LangChain (`/langchain`) and OpenAI function calling (`/openai`), with an optional `referrer` so you earn 10% of Stoa's fee on swaps you build.

Agents that use skills can load [stoadex.com/skills/stoa/SKILL.md](https://stoadex.com/skills/stoa/SKILL.md). It teaches the safe order: take the address from a trusted source, run `safety_check`, show the quote to the user, then build the swap and let the user's wallet sign.

## Limits and safety

- 60 requests a minute per IP, shared with the API.
- Check that `tx.to` is the router listed on [Contracts](contracts.md) before signing anything an agent built.
- Listed tokens are not reviewed by Stoa, and a passed safety check describes the token today, not later. Nothing here is investment advice.
