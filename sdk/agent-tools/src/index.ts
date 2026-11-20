/**
 * @stoadex/agent-tools: Stoa's MCP tools (https://stoadex.com/mcp) as plain async functions, plus adapters for the
 * Vercel AI SDK (`@stoadex/agent-tools/ai`), LangChain (`/langchain`) and OpenAI function calling (`/openai`).
 * Read-only: build_swap and bridge_quote return UNSIGNED transactions that the user's own wallet signs.
 */
export const DEFAULT_MCP_URL = "https://stoadex.com/mcp";

export interface StoaOptions {
  /** MCP endpoint. Default https://stoadex.com/mcp */
  url?: string;
  /** Your address: passed as `referrer` to build_swap when the call doesn't set one, so you earn 10% of Stoa's fee. */
  referrer?: string;
  /** Only expose these tools (e.g. ["list_tokens", "quote", "safety_check"]). Default: all. */
  only?: string[];
  fetch?: typeof fetch;
}

export interface StoaToolDef {
  name: string;
  title?: string;
  description: string;
  inputSchema: { type: "object"; properties?: Record<string, unknown>; required?: string[]; [k: string]: unknown };
}

export class StoaError extends Error {}

let nextId = 0;
async function rpc(o: StoaOptions, method: string, params?: Record<string, unknown>) {
  const f = o.fetch ?? fetch;
  const r = await f(o.url ?? DEFAULT_MCP_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++nextId, method, params }),
  });
  if (r.status === 429) throw new StoaError("Stoa rate limit (60 requests a minute): retry shortly");
  const j = (await r.json().catch(() => null)) as { result?: any; error?: { message: string } } | null;
  if (!j) throw new StoaError(`Stoa MCP answered ${r.status}`);
  if (j.error) throw new StoaError(j.error.message);
  return j.result;
}

/** The tool definitions the server publishes (name, description, JSON Schema input). */
export async function listTools(o: StoaOptions = {}): Promise<StoaToolDef[]> {
  const { tools } = await rpc(o, "tools/list");
  return (tools as StoaToolDef[]).filter((t) => !o.only || o.only.includes(t.name));
}

/** Call one tool. Returns the parsed JSON result; throws StoaError when the tool reports an error. */
export async function callTool<T = any>(name: string, args: Record<string, unknown> = {}, o: StoaOptions = {}): Promise<T> {
  const a = { ...args };
  if (name === "build_swap" && o.referrer && a.referrer === undefined) a.referrer = o.referrer;
  const res = await rpc(o, "tools/call", { name, arguments: a });
  const text: string = res?.content?.[0]?.text ?? "";
  let out: any = text;
  try { out = JSON.parse(text); } catch { /* plain-text answer */ }
  if (res?.isError) throw new StoaError(typeof out === "string" ? out : out?.error ?? JSON.stringify(out));
  return out as T;
}

type Args = Record<string, unknown>;
/** Typed shortcuts. Amounts are integers in the token's smallest unit, as strings. Chain defaults to "robinhood". */
export const stoa = (o: StoaOptions = {}) => ({
  listTokens: (a: { chain?: "robinhood" | "elysium" } = {}) => callTool("list_tokens", a, o),
  quote: (a: { sellToken: string; buyToken: string; amount: string; chain?: string; slippageBps?: number }) => callTool("quote", a as Args, o),
  buildSwap: (a: { sellToken: string; buyToken: string; amount: string; taker: string; chain?: string; slippageBps?: number; referrer?: string; deadlineSeconds?: number }) => callTool("build_swap", a as Args, o),
  safetyCheck: (a: { token: string; chain?: string }) => callTool("safety_check", a, o),
  bridgeQuote: (a: { fromChain: "base" | "arbitrum" | "ethereum" | "optimism" | "bsc"; fromToken: string; amount: string; wallet: string; toToken?: "ETH" | "USDG" }) => callTool("bridge_quote", a as Args, o),
  marketContext: (a: { tokens?: string[] } = {}) => callTool("market_context", a, o),
  stockTokens: (a: { symbol?: string; routableOnly?: boolean } = {}) => callTool("stock_tokens", a as Args, o),
});
