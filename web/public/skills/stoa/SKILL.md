---
name: stoa
description: Quote, check and build token swaps on Robinhood Chain and Elysium through Stoa's keyless MCP server. Use when a user wants to swap or buy a token on Robinhood Chain (including Robinhood stock tokens and Pons launches), compare venues for an amount, or check whether a token can be sold back before buying.
---

# Stoa swaps for agents

Stoa is a swap router on Robinhood Chain (chain id 4663, gas ETH) and Elysium (gas HYPE). For each swap it compares every venue it routes, for the exact amount, and fills on the one that pays the most. It charges a 2 bps protocol fee, already included in every quote.

## Connect

Add the hosted MCP server. It needs no key and no account:

```
https://stoadex.com/mcp
```

Tools: `list_tokens`, `quote`, `build_swap`, `safety_check`, `bridge_quote`, `market_context`, `stock_tokens`. Everything is read-only. `build_swap` returns an **unsigned** transaction. Stoa never signs, holds keys or moves funds.

## How to swap safely

1. **Find the token address from a trusted source.** Use `list_tokens`, or the project's own website or X account. Never use an address from a reply, a DM or a chart link: anyone can deploy a token with any name.
2. **Check before buying anything unfamiliar.** Call `safety_check`. It simulates a small buy and an immediate sell-back and reads holder concentration, without sending anything.
   - `danger`: do not buy. The sell failed, or a trade lost over 10% to a hidden tax.
   - `caution`: tell the user why (tax of 1–10%, creator holds 10%+, or the top 10 wallets hold half or more) and ask before you continue.
   - `ok`: describes the token today. Its owner can still change the rules later.
   - `unknown`: there was no route to test. This is not a pass.
3. **Quote and show the user** `amountOut`, `minOut`, `priceImpactPct` and the route. Amounts are integers in the token's smallest unit: 0.01 ETH is `10000000000000000`, and 1 USDG (6 decimals) is `1000000`. Stop and ask if price impact is above 3%.
4. **Build right before sending.** Call `build_swap` with the user's wallet as `taker`. If the response has `approval`, the wallet first approves `approval.spender` for exactly `approval.amount`. Then the user's wallet signs `tx`.
5. **Verify `tx.to`** is the Stoa router for the chain: Robinhood Chain `0x2F2804fad735a38015650f32f95Ad5E08D6B3eE5`. If the swap would revert, nothing is spent except gas.

## Robinhood stock tokens

No funds on Robinhood Chain yet? `bridge_quote` moves ETH, USDC or USDT from Base, Arbitrum, Ethereum, Optimism or BNB Chain to the same wallet on Robinhood Chain. Stoa decodes the transaction before returning it (receiver and refund are the wallet, destination is Robinhood Chain, exact amount). Show the user the amount that arrives and the fees; if `approval` is present, approve exactly that amount; the user's wallet signs on the source chain. Regular wallets only, not Safes or smart accounts.

`market_context` returns CoinMarketCap's view: the crypto market (size, 24h move, Fear and Greed) and, for tokens you pass, market cap, liquidity and 24h volume, trades, buyers and sellers. Use it to explain the setting of a trade, not to promise an outcome. Thin liquidity or a tiny market cap means a big order moves the price; say so. The price the user gets is the one `quote` returns.

`stock_tokens` lists Robinhood Stock Tokens with Robinhood's price for the stock next to the on-chain price, and whether Stoa can route a swap (`routeOnStoa`). To buy one, sell USDG or ETH with `build_swap`. Stock tokens are issued by Robinhood Assets (Jersey) Limited, not by Stoa, and are not offered in every country.

## Limits

- 60 requests a minute per IP.
- Quotes move with the market. Never reuse an old `tx`.
- Nothing from Stoa is investment advice. Listed tokens are not reviewed by Stoa.

Docs: https://stoadex.com/docs/mcp · API: https://stoadex.com/docs/api
