# Stoa × CoinMarketCap: market context for AI trading agents

**Build with CMC: API Hackathon, Round 2 · Track: AI Agents and Automation · #BuildwithCMC**

Stoa is a swap router on Robinhood Chain. Its hosted MCP server, `https://stoadex.com/mcp`, lets an AI agent list tokens, quote a swap across every venue, run a token safety check and build an **unsigned** swap that the user's own wallet signs. No key, no install.

For this hackathon we added a new tool, **`market_context`**, built on the CoinMarketCap API. An agent can call it before it suggests or explains a trade. It gets the state of the whole crypto market, plus CoinMarketCap's view of the exact Robinhood Chain token the user wants to buy: market cap, liquidity and what happened in the last 24 hours.

The CMC integration is new for this hackathon. Everything else on Stoa (router, quotes, safety check) existed before; it is listed here only because `market_context` is used together with it.

**DoraHacks submission:** https://dorahacks.io/build/51302 · **Post:** https://x.com/StoaDex/status/2123077120205414520

**Demo video (30 s):** https://stoadex.com/media/market-context-demo.mp4 (also in this folder: [`demo.mp4`](demo.mp4))

## What the agent can now say

Without CMC, an agent asked "buy $STOA with 0.5 ETH" only sees a quote. With `market_context`, it can answer like this (real data from the run below):

> The market is in **Extreme fear (12)** and down 1.2% today. $STOA has a **$36K market cap** and **$33K liquidity**, with 473 trades and $42K volume in 24h. That's thin: your 0.5 ETH would move the price about **10.7%**. A smaller order, or splitting it, gets you a better average.

It's context, not advice. The price the user actually gets is still the one `quote` returns, and nothing is signed or sent by the server.

## Try it

```bash
node hackathon/cmc/demo.mjs                        # $STOA, 0.5 ETH
node hackathon/cmc/demo.mjs 0xTokenAddress 0.1     # any Robinhood Chain token
```

No dependencies and no key needed (Node 18+). Or add `https://stoadex.com/mcp` to any MCP client (Claude, Cursor, Codex, etc.) and ask about a Robinhood Chain token.

Raw JSON-RPC:

```bash
curl -s https://stoadex.com/mcp -H 'content-type: application/json' -d '{
  "jsonrpc":"2.0","id":1,"method":"tools/call",
  "params":{"name":"market_context","arguments":{"tokens":["0x13E6993417616De724F2b337D65063f229e96718"]}}}'
```

## CMC API endpoints used

| Endpoint | What `market_context` takes from it |
|---|---|
| `GET /v1/global-metrics/quotes/latest` | Total crypto market cap, 24h change, BTC and ETH dominance |
| `GET /v3/fear-and-greed/latest` | CMC Fear and Greed value and label |
| `GET /v2/simple/price?symbol=BTC,ETH,USDG` | BTC, ETH and USDG prices |
| `GET /v1/dex/token?platform=robinhood&address=…` | Per token on Robinhood Chain: price, market cap, liquidity, 24h high/low, 24h volume, trades, buyers, sellers, price change, pool count |

Calls go to `pro-api.coinmarketcap.com` with the `X-CMC_PRO_API_KEY` header. The key lives only in the server's environment and never reaches the client. If the keyed call fails, the server falls back to CMC's keyless public API. Responses are cached for 60 s (prices, token data), 300 s (global metrics) and 600 s (Fear and Greed) to stay well inside the plan's limits.

Code:
- [`web/lib/cmc.ts`](../../web/lib/cmc.ts): CMC client and the `marketContext()` function
- [`web/app/mcp/route.ts`](../../web/app/mcp/route.ts): the MCP tool definition (`market_context`) and the instructions agents receive
- [`hackathon/cmc/demo.mjs`](demo.mjs): the demo above

## Evidence of a real call

[`sample-response.json`](sample-response.json) is the unedited output of `demo.mjs` on 18 Nov 2026 (`"access": "CoinMarketCap Pro API"`). An excerpt:

```json
"market": {
  "totalMarketCapUsd": 2165027000000,
  "marketCapChange24hPct": -1.159,
  "ethUsd": 1771.8,
  "fearAndGreed": { "value": 12, "label": "Extreme fear" }
},
"tokens": [{
  "symbol": "STOA", "listedOnCmc": true,
  "marketCapUsd": 36130.463, "liquidityUsd": 33257.723,
  "last24h": { "volumeUsd": 42469.937, "trades": 473, "buyers": 261, "sellers": 212, "priceChangePct": -20.56 },
  "pools": 2, "cmcRiskLabel": "safe"
}]
```

And the quote returned next to it: 0.5 ETH → 21,199,910 STOA, `priceImpactPct: 10.6517`.

## What the CMC API made possible

- **Robinhood Chain coverage on day one.** CMC's DEX endpoint already indexes Robinhood Chain (`platform=robinhood`), including small Pons launchpad tokens. The agent gets market cap, liquidity and 24h buyers/sellers for brand-new tokens that no centralized listing covers yet.
- **One call for "how is the market?"** Global metrics plus Fear and Greed give the agent a single sentence of context before any trade, instead of guessing from one token's chart.
- **A second opinion next to the router.** Stoa's quote says what a swap will get. CMC says how big and how liquid the token is. Together, the agent can warn about price impact in plain words before the user signs.

## Where it got in the way

- **DEX token fields are abbreviated** (`p`, `mcap`, `liqUsd`, `sts[].vu`, `nb`, `ns`) and not documented on the endpoint page we used. We mapped them by comparing against the chain and another data source.
- **`pc` in the 24h stats is a fraction, not a percent** (`-0.1655` means −16.55%). We only noticed by cross-checking, so the tool multiplies by 100.
- **The keyless API's shared limit is small.** We hit it within about ten test calls, so the production server uses a key, caches every response and falls back to keyless only if the keyed call fails.
- **`/v1/simple/price` needs `ids`**, while `/v2/simple/price` accepts symbols. Easy to fix once seen.

## Safety

`market_context` is read-only. Stoa never holds keys or funds. `build_swap` returns an unsigned transaction and the user's own wallet signs it. The tool's output and the agent instructions say plainly that it is context, not financial advice.

Links: [stoadex.com](https://stoadex.com) · [MCP docs](https://stoadex.com/docs/mcp) · [Agent skill](https://stoadex.com/skills/stoa/SKILL.md) · [X @StoaDex](https://x.com/StoaDex)
