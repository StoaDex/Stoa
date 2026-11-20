// Runs against the live server (stoadex.com/mcp). STOA_MCP=http://localhost:3311/mcp to test a local build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { listTools, callTool, stoa, StoaError } from "../dist/index.js";
import { stoaAiTools } from "../dist/ai.js";
import { stoaLangChainTools } from "../dist/langchain.js";
import { stoaOpenAITools } from "../dist/openai.js";
const o = { url: process.env.STOA_MCP };
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const ME = "0x3304E22DDaa22bCdC5fCa2269b418046aE7b566A";

test("lists the server's tools", async () => {
  const names = (await listTools(o)).map((t) => t.name);
  for (const n of ["list_tokens", "quote", "build_swap", "safety_check", "bridge_quote", "market_context", "stock_tokens"]) assert.ok(names.includes(n), n);
  assert.deepEqual((await listTools({ ...o, only: ["quote"] })).map((t) => t.name), ["quote"]);
});

test("quote and build_swap work, and the default referrer is passed", async () => {
  const s = stoa({ ...o, referrer: ME });
  const q = await s.quote({ sellToken: "native", buyToken: USDG, amount: "10000000000000000" });
  assert.ok(BigInt(q.amountOut) > 0n);
  const b = await s.buildSwap({ sellToken: "native", buyToken: USDG, amount: "10000000000000000", taker: ME });
  assert.equal(b.tx.to.toLowerCase(), q.router.toLowerCase());
  assert.ok(b.tx.data.toLowerCase().includes(ME.slice(2).toLowerCase()));
});

test("tool errors throw StoaError", async () => {
  await assert.rejects(callTool("safety_check", { token: "nope" }, o), StoaError);
});

test("Vercel AI SDK adapter", async () => {
  const t = await stoaAiTools({ ...o, only: ["list_tokens"] });
  const r = await t.list_tokens.execute({ chain: "robinhood" }, { toolCallId: "1", messages: [] });
  assert.equal(r.chainId, 4663);
});

test("LangChain adapter", async () => {
  const [t] = await stoaLangChainTools({ ...o, only: ["list_tokens"] });
  assert.equal(t.name, "list_tokens");
  assert.equal(JSON.parse(await t.invoke({ chain: "robinhood" })).chainId, 4663);
});

test("OpenAI adapter", async () => {
  const s = await stoaOpenAITools({ ...o, only: ["list_tokens", "safety_check"] });
  assert.equal(s.tools[0].type, "function");
  assert.equal(JSON.parse(await s.call("list_tokens", '{"chain":"robinhood"}')).chainId, 4663);
  assert.ok(JSON.parse(await s.call("safety_check", '{"token":"nope"}')).error);
});
