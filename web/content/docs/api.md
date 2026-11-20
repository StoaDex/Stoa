# API for bots and apps

Get Stoa's best route for any amount and a ready-to-send swap transaction with one HTTP call. Built for trading bots, wallets, Telegram bots and other apps. No key needed. Swaps go through the same router as the app, with the same 2 bps fee, and you can pass your own address as referrer to earn 10% of that fee on every swap you send.

Base URL: `https://stoadex.com/api/v1`. Building an AI agent? Use the [MCP server](mcp.md) instead.

## Quote and swap: `GET /quote`

| Parameter | Required | Meaning |
| --- | --- | --- |
| `chain` | yes | `robinhood` or `elysium` |
| `sellToken` | yes | token address, or `native` for ETH on Robinhood Chain and HYPE on Elysium |
| `buyToken` | yes | token address, or `native` |
| `amount` | yes | amount to sell, in the sell token's smallest unit (wei) |
| `slippageBps` | no | how far below the quote the swap may fill, in basis points; default 50 (0.5%), at most 5000 |
| `taker` | no | the wallet that sends the swap and receives the tokens; when set, the response includes the transaction |
| `recipient` | no | who receives the tokens instead of the taker (needs `taker`); used by [Stoa Pay](stoa-pay.md) |
| `referrer` | no | the address that earns the referral share of Stoa's fee |
| `deadlineSeconds` | no | how long the transaction stays valid; default 120, from 15 to 1800 |

Example: sell 0.01 ETH for USDG on Robinhood Chain.

```
curl "https://stoadex.com/api/v1/quote?chain=robinhood&sellToken=native&buyToken=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168&amount=10000000000000000&taker=0xYourWallet&referrer=0xYourWallet"
```

The response:

```json
{
  "chain": "robinhood", "chainId": 4663,
  "router": "0x2F2804fad735a38015650f32f95Ad5E08D6B3eE5",
  "amountIn": "10000000000000000", "amountOut": "18166402", "minOut": "18075569",
  "priceImpactPct": 0.0088,
  "route": { "mid": null, "legs": [{ "venue": "0x2880…A2E6", "isPool": false, "name": "Uniswap V3" }] },
  "fee": { "protocolBps": 2, "note": "already deducted from amountOut; referrers earn 10% of it" },
  "validForSeconds": 30,
  "tx": { "to": "0x2F28…3eE5", "chainId": 4663, "value": "10000000000000000", "data": "0x…" },
  "deadline": 1795392120
}
```

- `amountOut` is what the route pays now, after Stoa's fee. `minOut` is the least the swap accepts: if the price moves further, the transaction reverts and nothing is spent but gas.
- Send `tx` from the `taker` wallet as it is. Selling a token instead of `native`: approve `approval.spender` for `approval.amount` first; the response includes the `approval` object.
- Quotes move with the market. Ask again right before you send, especially on Elysium, where maker quotes last about two blocks.
- `route.mid` is set when the swap hops through the wrapped gas token; `legs` lists the venue for each leg.
- Errors come back as `{ "error": "…" }` with status 400 (bad input), 404 (unknown path), 422 (no route right now) or 429 (too many requests).

## Token list: `GET /tokens`

`GET /tokens?chain=robinhood` lists the tokens Stoa shows in the app on a network, with decimals, plus the router address. Any other token address can still be quoted.

## Spotlight: `GET /spotlight`

[stoadex.com/api/v1/spotlight](https://stoadex.com/api/v1/spotlight) returns Spotlight on Robinhood Chain right now: the week and its phase (`before_week_1`, `bids_open` or `votes_only`), when bids and votes close (UTC), the rules (quorum, minimum bid, entry fee, the share that goes to voters), every candidate with its bid in ETH and votes in $STOA, last week's winners, and the $STOA locked. It updates every 30 seconds. Spotlight slots are sponsored and not reviewed: check a token with the [safety check](https://stoadex.com/check) before buying it.

## Limits

- 60 requests a minute per IP. Need more for a production integration? Send a DM to [@StoaDEX](https://x.com/StoaDEX).
- The API reads the chain through public RPCs and can be briefly unavailable; your bot should retry with a short backoff.
- For full control, read the route from the router yourself and build the swap on-chain: see [Router and SDK](router-sdk.md).

## Safety

The router only trades on venues the timelock has allowlisted, pays only the `to` address in the transaction, and reverts below `minOut`. Check `tx.to` is the router listed on [Contracts](contracts.md) before you sign anything built from an API response.
