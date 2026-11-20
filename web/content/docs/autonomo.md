# Stoa for Autonomo agents

[Autonomo](https://autonomo.fun) lists paid x402 APIs that AI agents call and pay per call. Its hosted gateways and official APIs take USDG or $AUTONOMO on Robinhood Chain (or USDC on Base). An agent that is short on either can get it through Stoa in one swap, from ETH or any token Stoa routes, and then pay.

No key, no account. Stoa builds the transaction; the agent's own wallet signs and sends it. Stoa never holds keys or funds.

| Token on Robinhood Chain | Address |
| --- | --- |
| USDG | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` |
| $AUTONOMO | `0xE83C85E1eaD16FCFe85401E2b337Fb4FB5B5cC96` |

## Stoa's APIs on Autonomo

Two of Stoa's APIs are listed on Autonomo as paid x402 endpoints, so an agent that already pays through Autonomo can call them the same way:

| Endpoint | What it returns | Price |
| --- | --- | --- |
| `https://autonomo.fun/x/stoa-safety` | Stoa's safety check for a Robinhood Chain token: a test buy and sell through Stoa's router, simulated on the live chain, hidden taxes, and who holds the supply | $0.01 a call |
| `https://autonomo.fun/x/stoa-quote` | A swap quote on Robinhood Chain, and with a `taker` the ready-to-sign transaction (the approval is for the exact amount, never unlimited) | $0.01 a call |

Listings: [Stoa Token Safety Check](https://autonomo.fun/projects/stoa-token-safety-check-robinhood-chain) and [Stoa Swap Quote](https://autonomo.fun/projects/stoa-swap-quote-robinhood-chain), also in [autonomo.fun/llms.txt](https://autonomo.fun/llms.txt), the file agents read to find APIs.

Pay in USDG or $AUTONOMO on Robinhood Chain, or USDC on Base. The same data is free and keyless straight from Stoa (`stoadex.com/api/safety/robinhood/{token}`, `stoadex.com/api/v1/quote`, and the MCP server below); the Autonomo listings are for agents that find and pay for APIs through Autonomo.

## With MCP

Add Stoa's MCP server to the agent (`https://stoadex.com/mcp`, see [MCP server](mcp.md)), then:

1. `safety_check` the token you are buying (optional for USDG, worth it for any other token).
2. `quote` from `native` (ETH) to USDG or $AUTONOMO for the amount the API costs, plus a margin for a few calls.
3. `build_swap` with `taker` set to the agent's wallet. It returns the unsigned transaction, and the approval first when the agent sells a token instead of ETH.
4. The agent signs and sends it, then pays the Autonomo API from the same wallet.

## With the API

The same swap in one request (here 0.002 ETH for $AUTONOMO; use the USDG address for USDG):

```
curl "https://stoadex.com/api/v1/quote?chain=robinhood&sellToken=native&buyToken=0xE83C85E1eaD16FCFe85401E2b337Fb4FB5B5cC96&amount=2000000000000000&taker=0xAgentWallet"
```

Send the returned `tx` from the agent's wallet as it is. Details: [API for bots and apps](api.md).

## In TypeScript

`npm i @stoadex/agent-tools` gives an agent the same tools for the Vercel AI SDK, LangChain or OpenAI function calling. Set `referrer` to your own address to earn 10% of Stoa's fee on the swaps your agent builds.

## No funds on Robinhood Chain yet

`bridge_quote` moves ETH, USDC or USDT from Base, Arbitrum, Ethereum, Optimism or BNB Chain to the same wallet on Robinhood Chain, as ETH or USDG. Then swap as above.

## Good to know

- Every swap is checked across Uniswap V2, V3 and V4, Aero, Ramses and the Pons curves for the exact amount, for a 2 bps fee.
- Check that `tx.to` is the router on [Contracts](contracts.md) before signing.
- Stoa and Autonomo are separate projects. A swap through Stoa only gets the agent the token; the payment to an API goes from the agent to Autonomo.
