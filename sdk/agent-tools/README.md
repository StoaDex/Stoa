# @stoadex/agent-tools

Stoa's swap tools for AI agents on **Robinhood Chain**, as plain functions and as ready-made tools for the **Vercel AI SDK**, **LangChain** and **OpenAI** function calling.

Your agent can list tokens, quote a swap across every venue, run a token safety check, build an **unsigned** swap, bridge funds in from other chains, read CoinMarketCap market context and look up Robinhood stock tokens. Stoa never signs, holds keys or moves funds: the user's own wallet signs every transaction.

No API key. Everything goes through Stoa's hosted MCP server at `https://stoadex.com/mcp` (60 requests a minute per IP). The tool list and schemas are read from the server, so new tools show up without updating the package.

```bash
npm i @stoadex/agent-tools
```

## Vercel AI SDK

```ts
import { generateText } from "ai";
import { stoaAiTools } from "@stoadex/agent-tools/ai";

const tools = await stoaAiTools({ referrer: "0xYourAddress" });
const { text } = await generateText({ model, tools, prompt: "What does 0.01 ETH buy in USDG on Robinhood Chain?" });
```

## LangChain

```ts
import { stoaLangChainTools } from "@stoadex/agent-tools/langchain";

const tools = await stoaLangChainTools();
const agent = createAgent({ model, tools });
```

## OpenAI (no extra dependency)

```ts
import { stoaOpenAITools } from "@stoadex/agent-tools/openai";

const stoa = await stoaOpenAITools();
const res = await client.chat.completions.create({ model, messages, tools: stoa.tools }); // stoa.responsesTools for the Responses API
for (const c of res.choices[0].message.tool_calls ?? [])
  messages.push({ role: "tool", tool_call_id: c.id, content: await stoa.call(c.function.name, c.function.arguments) });
```

## Plain functions

```ts
import { stoa } from "@stoadex/agent-tools";

const s = stoa({ referrer: "0xYourAddress" });
const q = await s.quote({ sellToken: "native", buyToken: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", amount: "10000000000000000" });
const ctx = await s.marketContext({ tokens: ["0x13E6993417616De724F2b337D65063f229e96718"] });
```

## Tools

| Tool | What it does |
| --- | --- |
| `list_tokens` | Verified tokens and the router address |
| `quote` | Route across every venue: amount out, minimum, price impact |
| `build_swap` | The same, plus an unsigned transaction for the user's wallet |
| `safety_check` | Simulated buy and sell-back, plus creator and top holders |
| `bridge_quote` | ETH, USDC or USDT from Base, Arbitrum, Ethereum, Optimism or BNB Chain to Robinhood Chain, decoded and checked before it's returned |
| `market_context` | CoinMarketCap: Fear and Greed, the crypto market, and a token's market cap, liquidity and 24h trading |
| `stock_tokens` | Robinhood stock tokens: Robinhood's price next to the on-chain price |

Options for every adapter: `referrer` (your address earns 10% of Stoa's fee on swaps built with `build_swap`), `only` (expose a subset of tools), `url` (another MCP endpoint).

## Safety

Tell your agent to get token addresses from `list_tokens` or the project's own site, run `safety_check` before buying anything unverified, and show the user the quote before building the swap. A `danger` verdict means don't buy. Amounts are integers in the token's smallest unit.

Docs: [stoadex.com/docs/mcp](https://stoadex.com/docs/mcp) · [Integrate Stoa](https://stoadex.com/build) · MIT
