import { aggregatorQuotes, aggregatorsOn } from "@/lib/aggregators";
import { isAddress } from "viem";
import { gloamSwapUrl } from "@/lib/gloam";
import { readSpotlight } from "@/lib/spotlightServer";
import { gapHistory } from "@/lib/gapHistory";
import { readSwaps } from "@/lib/routerStats";
import { readPoints } from "@/lib/points";
import { venueSnapshot } from "@/lib/venueSnapshot";
import { API_HEADERS, apiQuote, limited } from "@/lib/api";
import { NETS, netByKey } from "@/lib/networks";
import { NATIVE } from "@/lib/tokens";
import { readSafety } from "@/lib/safety";
import { mid, stockTokens } from "@/lib/stocks";
import { isStalePool } from "@/lib/stockGap";
import { bridgeQuote } from "@/lib/bridgeQuote";
import { marketContext } from "@/lib/cmc";

// https://stoadex.com/mcp: Stoa as a hosted, keyless MCP server (Streamable HTTP, stateless, JSON responses).
// Read-only: every tool reads the chain or Stoa's own data. build_swap returns an UNSIGNED transaction; nothing here
// can sign, hold keys or move funds. Same limits as the public API (60 requests a minute per IP). Docs: /docs/mcp

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PROTOCOL = "2025-06-18";
const SERVER = { name: "stoa", title: "Stoa: every route, compared", version: "1.0.0" };
const INSTRUCTIONS = [
  "Stoa is a swap router on Robinhood Chain (chain id 4663, gas ETH) and Elysium (gas HYPE).",
  "Rules for agents: 1) Get token addresses from list_tokens or from the project's own site, never from a reply or DM.",
  "2) Run safety_check before buying any token that is not in list_tokens' verified set; a 'danger' verdict means do not buy.",
  "3) Quote, show the user amountOut, minOut, price impact and route, and only then call build_swap.",
  "4) build_swap returns an unsigned transaction: the user's own wallet signs it. If selling a token (not native), the wallet must first approve approval.spender for approval.amount.",
  "5) Quotes move: rebuild right before sending. Amounts are integers in the token's smallest unit (wei).",
  "6) No funds on Robinhood Chain yet? bridge_quote moves ETH, USDC or USDT from Base, Arbitrum, Ethereum, Optimism or BNB Chain; Stoa decodes and checks the transaction before returning it, and the user's wallet signs it on the source chain.",
  "7) market_context gives CoinMarketCap's view (crypto market, Fear and Greed, a token's market cap, liquidity and 24h trading) to put a trade in context; it is not advice, and the price a swap gets is the one quote returns.",
].join(" ");

const chainProp = { type: "string", enum: ["robinhood", "elysium"], description: "Network. Default robinhood." };
const tokenProp = (what: string) => ({ type: "string", description: `${what}: a token address, or "native" for the gas token (ETH on Robinhood Chain, HYPE on Elysium).` });
const ro = { readOnlyHint: true, openWorldHint: true };

const TOOLS = [
  {
    name: "list_tokens",
    title: "List tokens",
    description: "Tokens Stoa lists on a network, with address, symbol and decimals, plus the router address. Any other token address can still be quoted, but treat it as unverified and run safety_check first.",
    inputSchema: { type: "object", properties: { chain: chainProp }, additionalProperties: false },
    annotations: ro,
  },
  {
    name: "quote",
    title: "Quote a swap",
    description: "Compare every venue Stoa routes for this exact amount and return the route it would fill: amountOut (after Stoa's 2 bps fee), minOut for the slippage, price impact and the venues. Read-only.",
    inputSchema: {
      type: "object", required: ["sellToken", "buyToken", "amount"], additionalProperties: false,
      properties: {
        chain: chainProp, sellToken: tokenProp("Token to sell"), buyToken: tokenProp("Token to buy"),
        amount: { type: "string", description: "Amount to sell, integer in the sell token's smallest unit (wei). 0.01 ETH = 10000000000000000." },
        slippageBps: { type: "integer", minimum: 0, maximum: 5000, description: "Max slippage in basis points. Default 50 (0.5%)." },
      },
    },
    annotations: ro,
  },
  {
    name: "build_swap",
    title: "Build an unsigned swap",
    description: "Same as quote, plus the unsigned transaction (to, data, value, chainId) for the taker's wallet to sign, and the approval it needs first when selling a token. Stoa never signs or sends anything.",
    inputSchema: {
      type: "object", required: ["sellToken", "buyToken", "amount", "taker"], additionalProperties: false,
      properties: {
        chain: chainProp, sellToken: tokenProp("Token to sell"), buyToken: tokenProp("Token to buy"),
        amount: { type: "string", description: "Amount to sell, integer in the sell token's smallest unit (wei)." },
        taker: { type: "string", description: "The wallet that signs, pays and receives." },
        slippageBps: { type: "integer", minimum: 0, maximum: 5000, description: "Max slippage in basis points. Default 50." },
        referrer: { type: "string", description: "Optional wallet that earns 10% of Stoa's fee on this swap." },
        deadlineSeconds: { type: "integer", minimum: 15, maximum: 1800, description: "Seconds until the transaction expires. Default 120." },
      },
    },
    annotations: ro,
  },
  {
    name: "safety_check",
    title: "Token safety check",
    description: "Simulate a small buy and an immediate sell-back of a token through Stoa's live router (eth_call, nothing sent), and read how concentrated its supply is. Returns verdict ok | caution | danger | unknown, buy and sell tax, round-trip cost, creator and top-10 holdings. A pass describes the token today; its owner can still change the rules.",
    inputSchema: { type: "object", required: ["token"], additionalProperties: false, properties: { chain: chainProp, token: { type: "string", description: "Token address." } } },
    annotations: ro,
  },
  {
    name: "bridge_quote",
    title: "Bridge to Robinhood Chain",
    description: "Move ETH, USDC or USDT from Base, Arbitrum, Ethereum, Optimism or BNB Chain to the same wallet on Robinhood Chain (arriving as ETH or USDG), through LI.FI over Across. Returns an unsigned transaction on the source chain that Stoa has already decoded: receiver and refund address are the wallet, destination is Robinhood Chain, it spends exactly the amount asked. If 'approval' is present, approve exactly that amount first. Regular wallets only.",
    inputSchema: {
      type: "object", required: ["fromChain", "fromToken", "amount", "wallet"], additionalProperties: false,
      properties: {
        fromChain: { type: "string", enum: ["base", "arbitrum", "ethereum", "optimism", "bsc"], description: "Where the funds are now." },
        fromToken: { type: "string", description: "ETH, USDC, USDT or USDT0, as available on that chain." },
        toToken: { type: "string", enum: ["ETH", "USDG"], description: "What arrives on Robinhood Chain. Default ETH." },
        amount: { type: "string", description: "Integer amount of fromToken in its smallest unit (18 decimals for ETH and BNB Chain stables, 6 for USDC/USDT elsewhere)." },
        wallet: { type: "string", description: "The user's wallet: it signs on the source chain and receives on Robinhood Chain." },
      },
    },
    annotations: ro,
  },
  {
    name: "market_context",
    title: "Market context (CoinMarketCap)",
    description: "CoinMarketCap data to put a trade in context: total crypto market cap and 24h change, BTC and ETH prices and dominance, the Fear and Greed index, and for up to 5 Robinhood Chain tokens their price, market cap, liquidity, 24h high/low, volume, trades, buyers and sellers. Use it before suggesting or explaining a trade; use quote for the price a swap actually gets.",
    inputSchema: {
      type: "object", additionalProperties: false,
      properties: {
        tokens: { type: "array", maxItems: 5, items: { type: "string" }, description: "Optional. Robinhood Chain token addresses (or symbols from list_tokens, or \"native\" for ETH). Leave out for the market overview only." },
      },
    },
    annotations: ro,
  },
  {
    name: "stock_tokens",
    title: "Robinhood stock tokens",
    description: "Robinhood Stock Tokens on Robinhood Chain: Robinhood's price for the underlying stock next to the on-chain price, liquidity, 24h volume and whether Stoa can route a swap. Optionally filter by ticker.",
    inputSchema: { type: "object", additionalProperties: false, properties: { symbol: { type: "string", description: "Optional ticker, e.g. NVDA." }, routableOnly: { type: "boolean", description: "Only stocks Stoa can swap right now." } } },
    annotations: ro,
  },
  {
    name: "stock_gaps",
    title: "Stock token price gaps",
    description: "Robinhood Stock Tokens whose on-chain price is furthest from Robinhood's own price right now: cheaper or dearer on-chain, among pools with real liquidity that actually trade (pools with under $100 of 24h volume and gaps over 25% are left out as stale). Optionally a 7-day history of one token's gap from Stoa's open dataset. Information, not trading advice; outside US market hours Robinhood's price follows the overnight session.",
    inputSchema: { type: "object", additionalProperties: false, properties: {
      side: { type: "string", enum: ["any", "cheaper", "dearer"], description: "cheaper: on-chain below Robinhood; dearer: above. Default any." },
      minLiquidityUsd: { type: "number", description: "Minimum on-chain liquidity, default 50000." },
      limit: { type: "number", description: "How many, 1 to 20, default 10." },
      historyFor: { type: "string", description: "Optional ticker (e.g. TSLA): also return its gap every 6 hours for the last 7 days." },
    } },
    annotations: ro,
  },
  {
    name: "open_data",
    title: "Stoa open data",
    description: "Stoa's public on-chain data: every swap routed through Stoa (newest first), the Points season 1 board, or the venue-quote basket (the same swaps quoted on every Robinhood Chain venue in one block). Also lists the open datasets on Hugging Face with their download links and checksums.",
    inputSchema: { type: "object", additionalProperties: false, properties: {
      set: { type: "string", enum: ["datasets", "swaps", "points", "venues"], description: "datasets (default): where the open data lives; swaps; points; venues." },
      limit: { type: "number", description: "Rows for swaps or points, 1 to 200, default 50." },
    } },
    annotations: ro,
  },
  {
    name: "spotlight",
    title: "Spotlight this week",
    description: "Stoa Spotlight on Robinhood Chain: projects bid ETH for 3 sponsored slots a week and $STOA holders lock and vote; voters share most of each winning bid. Returns the week, its phase (before_week_1, bids_open, votes_only) and closing times, the rules (quorum, min bid, entry fee), every candidate with its bid and votes, last week's winners and the $STOA locked. Sponsored, not reviewed: run safety_check before buying a Spotlight token.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    annotations: ro,
  },
] as const;

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };
const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const err = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
const text = (v: unknown, isError = false) => ({ content: [{ type: "text", text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }], structuredContent: typeof v === "object" ? v : undefined, isError });
const str = (v: unknown) => (v === undefined || v === null ? undefined : String(v));

async function callTool(name: string, a: Record<string, unknown>) {
  const chain = str(a.chain) ?? "robinhood";
  switch (name) {
    case "list_tokens": {
      const net = netByKey(chain);
      if (!net || !net.deployed) return text("chain must be robinhood or elysium", true);
      return text({
        chain: net.key, chainId: net.chain.id, router: net.contracts.router ?? null, native: { symbol: net.gas, address: "native", wrapped: net.wrapped },
        tokens: net.tokens.filter((t) => t.address !== NATIVE).map((t) => ({ address: t.address, symbol: t.symbol, name: t.name, decimals: t.decimals })),
        note: "Listed is not reviewed: names marked 'Pons launch' or 'Unverified' can be anything. Run safety_check before buying them.",
      });
    }
    case "quote":
    case "build_swap": {
      if (name === "build_swap" && !str(a.taker)) return text("taker is required", true);
      const r = await apiQuote({
        chain, sellToken: str(a.sellToken) ?? "", buyToken: str(a.buyToken) ?? "", amount: str(a.amount) ?? "",
        slippageBps: str(a.slippageBps), taker: name === "build_swap" ? str(a.taker) : undefined,
        referrer: name === "build_swap" ? str(a.referrer) : undefined, deadlineSeconds: name === "build_swap" ? str(a.deadlineSeconds) : undefined,
      });
      const body = await r.json().catch(() => ({ error: "bad response" }));
      if (!r.ok) return text(body, true);
      if (name === "build_swap") body.note = "Unsigned. Check tx.to is the Stoa router for this chain, show the user amountOut and minOut, approve first if 'approval' is present, then let the user's wallet sign.";
      if (name === "build_swap" && str(a.referrer)) body.referrerTerms = "The referrer earns 10% of Stoa's 2 bps fee on-chain (claim on stoadex.com/referrals). Apps whose referrer address brings 10+ different wallets in a UTC month also get a $10 USDG integrator bonus for that month (up to 5 apps; stoadex.com/referrals#integrator-bonus).";
      if (name === "quote" && (chain ?? "robinhood") === "robinhood" && aggregatorsOn()) {
        const sell = str(a.sellToken) ?? "", buy = str(a.buyToken) ?? "";
        const tok = (v: string) => (v === "native" || v === "ETH" ? NATIVE : v);
        if (isAddress(tok(sell), { strict: false }) && isAddress(tok(buy), { strict: false })) {
          const others = await aggregatorQuotes(tok(sell), tok(buy), str(a.amount) ?? "0").catch(() => []);
          if (others.length) body.secondOpinion = { quotes: others, note: "Other routers' quotes for the same amount (raw units of the buy token), for comparison only: Stoa does not route through them." };
        }
      }
      return text(body);
    }
    case "safety_check": {
      const net = netByKey(chain);
      const token = str(a.token) ?? "";
      if (!net || !net.deployed) return text("chain must be robinhood or elysium", true);
      if (!isAddress(token, { strict: false })) return text("token must be an address", true);
      try {
        const s = await readSafety(net, token);
        // where Gloam lists the token, a link to trade it privately there (a separate app: its own router and pools)
        const url = net.key === "robinhood" && s.verdict !== "danger" ? gloamSwapUrl(s.symbol) : null;
        return text(url ? { ...s, privateSwap: { app: "Gloam", url, note: "Gloam is a separate app that swaps from a private balance; Stoa does not route it. The user reviews and confirms there." } } : s);
      } catch { return text("the chain did not answer, try again shortly", true); }
    }
    case "bridge_quote": {
      const r = await bridgeQuote({ fromChain: str(a.fromChain), fromToken: str(a.fromToken), toToken: str(a.toToken), amount: str(a.amount), wallet: str(a.wallet) }).catch(() => ({ error: "the bridge service did not answer, try again shortly" }));
      return text(r, "error" in r);
    }
    case "market_context": {
      const r = await marketContext({ tokens: a.tokens }).catch(() => ({ error: "CoinMarketCap did not answer, try again shortly" }));
      return text(r, "error" in r);
    }
    case "spotlight": {
      try { return text(await readSpotlight()); } catch { return text("Robinhood Chain did not answer, try again shortly", true); }
    }
    case "stock_gaps": {
      const data = await stockTokens().catch(() => null);
      if (!data) return text("stock data is unavailable right now, try again shortly", true);
      const side = str(a.side) ?? "any", minLiq = Number(a.minLiquidityUsd ?? 50_000), limit = Math.min(20, Math.max(1, Number(a.limit ?? 10) || 10));
      const rows = data.stocks.flatMap((s) => {
        const ref = mid(s);
        if (!ref || !s.dex || s.halted || s.dex.liquidityUsd < minLiq || isStalePool(s.dex)) return [];
        const gap = ((s.dex.priceUsd - ref) / ref) * 100;
        if (Math.abs(gap) > 25 || (side === "cheaper" && gap >= 0) || (side === "dearer" && gap <= 0)) return [];
        return [{ symbol: s.symbol, name: s.name, address: s.address, robinhoodPriceUsd: ref, onChainPriceUsd: s.dex.priceUsd, gapPct: Number(gap.toFixed(3)), liquidityUsd: s.dex.liquidityUsd, volume24h: s.dex.volume24h, routeOnStoa: s.route }];
      }).sort((x, y) => Math.abs(y.gapPct) - Math.abs(x.gapPct)).slice(0, limit);
      let history: unknown = undefined;
      const hs = str(a.historyFor)?.toUpperCase();
      if (hs) {
        const st = data.stocks.find((x) => x.symbol.toUpperCase() === hs);
        history = st ? (await gapHistory(st.address).catch(() => [])).map((p) => ({ time: new Date(p.t * 1000).toISOString(), robinhoodMidUsd: p.mid, onChainUsd: p.onchain, gapPct: Number(p.gap.toFixed(3)) })) : `no stock token with ticker ${hs}`;
      }
      return text({ chain: "robinhood", updated: new Date(data.updated).toISOString(), side, minLiquidityUsd: minLiq, count: rows.length, stocks: rows, history,
        note: "gapPct: on-chain price vs Robinhood's mid price. A gap is information, not a trade signal: pools move, swaps pay price impact and gas, and outside US market hours Robinhood follows the overnight session. Quote the exact amount with quote before swapping. Not financial advice." });
    }
    case "open_data": {
      const set = str(a.set) ?? "datasets", limit = Math.min(200, Math.max(1, Number(a.limit ?? 50) || 50));
      if (set === "datasets") return text({
        datasets: [
          { name: "stoa-onchain", url: "https://huggingface.co/datasets/StoaDex/stoa-onchain", holds: "every swap through Stoa's routers, daily volume, Points board, Spotlight week; manifest.json with SHA-256", updated: "every 6 hours, tagged weekly" },
          { name: "robinhood-stock-tokens", url: "https://huggingface.co/datasets/StoaDex/robinhood-stock-tokens", holds: "every Robinhood Stock Token: Robinhood bid/ask vs on-chain price, gap, liquidity, volume", updated: "4 snapshots a day" },
          { name: "robinhood-chain-venue-quotes", url: "https://huggingface.co/datasets/StoaDex/robinhood-chain-venue-quotes", holds: "a basket of swaps quoted on every venue Stoa routes, in one block", updated: "4 snapshots a day" },
          { name: "stoa-contracts", url: "https://huggingface.co/datasets/StoaDex/stoa-contracts", holds: "contract source, ABIs, deployments and security docs per release, reproducible tarball with SHA-256", updated: "when the contracts change" },
        ],
        api: "https://stoadex.com/api/v1/export?set=swaps|points|spotlight|stocks|venues", license: "CC BY 4.0", page: "https://stoadex.com/open",
      });
      try {
        if (set === "swaps") { const r = (await readSwaps()).slice(0, limit); return text({ set, count: r.length, swaps: r.map((x) => ({ chain: x.chain, time: new Date(x.time * 1000).toISOString(), tx: x.hash, sell: x.symIn, buy: x.symOut, amountIn: x.amountIn, amountOut: x.amountOut, usd: x.usd })) }); }
        if (set === "points") { const b = await readPoints(); return text({ set, seasonStart: new Date(b.seasonStart * 1000).toISOString(), wallets: b.wallets, top: b.rows.slice(0, limit), note: "Points have no promised value." }); }
        if (set === "venues") return text({ set, rows: await venueSnapshot(), note: "Each venue alone, one hop, before fees; router_out is Stoa's route after its 2 bps fee. A reading at one block, not a fill." });
      } catch { return text("the chains did not answer, try again shortly", true); }
      return text("set must be datasets, swaps, points or venues", true);
    }
    case "stock_tokens": {
      const data = await stockTokens().catch(() => null);
      if (!data) return text("stock data is unavailable right now, try again shortly", true);
      const sym = str(a.symbol)?.toUpperCase();
      const list = data.stocks
        .filter((s) => (!sym || s.symbol.toUpperCase() === sym) && (!a.routableOnly || s.route))
        .slice(0, sym ? 1 : 60)
        .map((s) => {
          const ref = mid(s);
          return {
            symbol: s.symbol, name: s.name, address: s.address, halted: s.halted, robinhoodPriceUsd: ref,
            onChain: s.dex ? { priceUsd: s.dex.priceUsd, liquidityUsd: s.dex.liquidityUsd, volume24h: s.dex.volume24h, change24h: s.dex.change24h } : null,
            gapPct: ref && s.dex ? Number((((s.dex.priceUsd - ref) / ref) * 100).toFixed(3)) : null,
            routeOnStoa: s.route,
          };
        });
      if (sym && !list.length) return text(`no Robinhood stock token with ticker ${sym}`, true);
      return text({ chain: "robinhood", updated: new Date(data.updated).toISOString(), count: list.length, stocks: list, note: "Issued by Robinhood Assets (Jersey) Limited, not by Stoa, and not offered in every country. Swap with build_swap, selling USDG or ETH." });
    }
  }
  return null;
}

async function handle(m: Rpc) {
  switch (m.method) {
    case "initialize":
      return ok(m.id, { protocolVersion: PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER, instructions: INSTRUCTIONS });
    case "ping":
      return ok(m.id, {});
    case "tools/list":
      return ok(m.id, { tools: TOOLS });
    case "tools/call": {
      const p = m.params ?? {};
      const out = await callTool(String(p.name ?? ""), (p.arguments as Record<string, unknown>) ?? {});
      return out ? ok(m.id, out) : err(m.id, -32602, `unknown tool: ${String(p.name)}`);
    }
    case "resources/list": return ok(m.id, { resources: [] });
    case "prompts/list": return ok(m.id, { prompts: [] });
    default:
      return err(m.id, -32601, `method not found: ${m.method}`);
  }
}

const H = { ...API_HEADERS, "access-control-allow-methods": "GET, POST, DELETE, OPTIONS", "access-control-allow-headers": "content-type, mcp-session-id, mcp-protocol-version, accept", "access-control-expose-headers": "mcp-session-id" };

export async function POST(req: Request) {
  const block = limited(req);
  if (block) return block;
  let msg: unknown;
  try { msg = await req.json(); } catch { return Response.json(err(null, -32700, "parse error"), { status: 400, headers: H }); }
  const batch = Array.isArray(msg) ? (msg as Rpc[]) : [msg as Rpc];
  const out = [];
  for (const m of batch) {
    if (!m || typeof m !== "object" || typeof m.method !== "string") { out.push(err(null, -32600, "invalid request")); continue; }
    if (m.id === undefined) continue; // notification (e.g. notifications/initialized): no reply
    out.push(await handle(m));
  }
  if (!out.length) return new Response(null, { status: 202, headers: H });
  return Response.json(Array.isArray(msg) ? out : out[0], { headers: H });
}

// Stateless server: no server-initiated stream and no sessions to end.
export function GET(req: Request) {
  if ((req.headers.get("accept") ?? "").includes("text/event-stream")) return new Response(null, { status: 405, headers: { ...H, allow: "POST, OPTIONS" } });
  return Response.json({ ...SERVER, transport: "streamable-http", endpoint: "https://stoadex.com/mcp", tools: TOOLS.map((t) => t.name), docs: "https://stoadex.com/docs/mcp", note: "POST JSON-RPC here from an MCP client." }, { headers: H });
}
export function DELETE() { return new Response(null, { status: 405, headers: H }); }
export function OPTIONS() { return new Response(null, { status: 204, headers: H }); }
