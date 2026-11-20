import "server-only";
import { unstable_cache } from "next/cache";
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { ROBINHOOD } from "./networks";
import logoList from "./stock-logos.json";
import { srv } from "@/lib/serverRpc";

// company logos, stored on Stoa's own site (public/stocks/<address>.webp): Robinhood's logo CDN serves the same
// placeholder for every token and does not load on some networks. Tokens without one get a ticker badge.
const LOGOS = new Set(logoList as string[]);

/** Robinhood Stock Tokens on Robinhood Chain: the list and reference prices come from Robinhood's public Stock Token
 *  API (api.robinhood.com/rhj, read-only, no key), the on-chain market from DexScreener's public token API. Reference
 *  prices are already per token (Robinhood applies each token's corporate-action multiplier). Cached a minute. */
export interface Stock {
  symbol: string; name: string; address: string; logo: string | null;
  /** Robinhood's bid/ask for one token, from the underlying shares */
  bid: number | null; ask: number | null; halted: boolean;
  /** the deepest on-chain pool DexScreener knows for the token */
  dex: { priceUsd: number; liquidityUsd: number; volume24h: number; change24h: number | null } | null;
  /** Stoa's router quotes a 100 USDG buy right now */
  route: boolean;
  /** Stoa's Metric adapter has an oracle-priced Metric pool for USDG -> this token, and the router uses that adapter */
  metric: boolean;
}

const RH = "https://api.robinhood.com/rhj";
const CHAIN = 4663;
const lc = (a: string) => a.toLowerCase();

type Asset = { tokenSymbol: string; tokenName?: string; status?: string; logoUrl?: string; deployments?: { contractAddress: string; chainId: number }[] };
type Quote = { tokenSymbol: string; tokenBid?: string; tokenAsk?: string; isTradingHalt?: boolean; deployments?: { contractAddress: string; chainId: number }[] };
type Pair = { baseToken: { address: string }; quoteToken: { address: string }; priceUsd?: string; priceNative?: string; liquidity?: { usd?: number }; volume?: { h24?: number }; priceChange?: { h24?: number } };

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { accept: "application/json", "user-agent": "stoadex.com" }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return r.json() as Promise<T>;
}

const onChain = (d?: { contractAddress: string; chainId: number }[]) => d?.find((x) => x.chainId === CHAIN)?.contractAddress;
const num = (v?: string) => (v && isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);

async function dexMarkets(addrs: string[]): Promise<Map<string, NonNullable<Stock["dex"]>>> {
  const out = new Map<string, NonNullable<Stock["dex"]>>();
  const want = new Set(addrs.map(lc));
  const chunks: string[][] = [];
  for (let i = 0; i < addrs.length; i += 30) chunks.push(addrs.slice(i, i + 30));
  await Promise.all(chunks.map(async (c) => {
    try {
      const pairs = await json<Pair[]>(`https://api.dexscreener.com/tokens/v1/robinhood/${c.join(",")}`);
      for (const p of Array.isArray(pairs) ? pairs : []) {
        const liq = p.liquidity?.usd ?? 0;
        const base = lc(p.baseToken.address), quote = lc(p.quoteToken.address);
        const usd = Number(p.priceUsd);
        // the stock token is usually the base; when it is the quote, its price is base price / base-in-quote
        const side = want.has(base) ? { a: base, usd, ch: p.priceChange?.h24 ?? null }
          : want.has(quote) && Number(p.priceNative) > 0 ? { a: quote, usd: usd / Number(p.priceNative), ch: null } : null;
        if (!side || !isFinite(side.usd) || side.usd <= 0) continue;
        const prev = out.get(side.a);
        if (prev && prev.liquidityUsd >= liq) continue;
        out.set(side.a, { priceUsd: side.usd, liquidityUsd: liq, volume24h: p.volume?.h24 ?? 0, change24h: side.ch });
      }
    } catch { /* that chunk shows no on-chain market this minute */ }
  }));
  return out;
}

const metricAbi = parseAbi(["function poolsFor(address tokenIn, address tokenOut) view returns (address[])", "function isAdapter(address) view returns (bool)"]);

/** stock tokens with a Metric pool on Stoa's Metric adapter (USDG -> token), once the router uses that adapter */
async function metricTokens(addrs: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const adapter = (ROBINHOOD.contracts as { metric?: Address }).metric;
  const router = ROBINHOOD.contracts.router;
  if (!adapter || !router || !addrs.length) return out;
  const c = createPublicClient({ chain: ROBINHOOD.chain, transport: http(srv(ROBINHOOD.chain.rpcUrls.default.http[0]), { timeout: 20_000, fetchOptions: { headers: { "user-agent": "curl/8.5.0" } } }) });
  try {
    if (!(await c.readContract({ address: router, abi: metricAbi, functionName: "isAdapter", args: [adapter] }))) return out;
    const r = await c.multicall({ allowFailure: true, contracts: addrs.map((t) => ({ address: adapter, abi: metricAbi, functionName: "poolsFor" as const, args: [ROBINHOOD.stable, t as Address] as const })) });
    r.forEach((x, j) => { if (x.status === "success" && (x.result as readonly Address[]).length > 0) out.add(lc(addrs[j])); });
  } catch { /* no Metric tags this time */ }
  return out;
}

const quoteAbi = parseAbi(["function quote(address,address,uint256) returns ((uint256 amountOut, address mid, (address venue, bool isPool) leg1, (address venue, bool isPool) leg2))"]);

/** which tokens Stoa's router can buy with 100 USDG right now (eth_call, nothing sent). A quote checks every venue,
 *  about 2M gas, so the calls go in small batches. */
async function routable(addrs: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const router = ROBINHOOD.contracts.router;
  if (!router || !addrs.length) return out;
  const c = createPublicClient({ chain: ROBINHOOD.chain, transport: http(srv(ROBINHOOD.chain.rpcUrls.default.http[0]), { timeout: 20_000, fetchOptions: { headers: { "user-agent": "curl/8.5.0" } } }) });
  const chunks: string[][] = [];
  for (let i = 0; i < addrs.length; i += 8) chunks.push(addrs.slice(i, i + 8));
  for (let i = 0; i < chunks.length; i += 4) {
    await Promise.all(chunks.slice(i, i + 4).map(async (ch) => {
      try {
        const r = await c.multicall({ allowFailure: true, contracts: ch.map((t) => ({ address: router, abi: quoteAbi, functionName: "quote" as const, args: [ROBINHOOD.stable, t as Address, 100_000_000n] as const })) });
        r.forEach((x, j) => { if (x.status === "success" && x.result.amountOut > 0n) out.add(lc(ch[j])); });
      } catch { /* that batch shows no route this time */ }
    }));
  }
  return out;
}

async function load(): Promise<{ stocks: Stock[]; updated: number }> {
  const [assets, prices] = await Promise.all([json<{ assets: Asset[] }>(`${RH}/assets`), json<{ quotes: Quote[] }>(`${RH}/prices`).catch(() => ({ quotes: [] }))]);
  const quotes = new Map<string, Quote>();
  for (const q of prices.quotes ?? []) { const a = onChain(q.deployments); if (a) quotes.set(lc(a), q); }
  const list = (assets.assets ?? []).filter((x) => x.status !== "ASSET_STATUS_INACTIVE" && onChain(x.deployments));
  const all = list.map((x) => onChain(x.deployments)!);
  const [dex, metric] = await Promise.all([dexMarkets(all), metricTokens(all)]);
  // a token with a Metric pool may have no pool DexScreener lists: check its route too
  const routes = await routable(all.filter((a) => dex.has(lc(a)) || metric.has(lc(a))));
  const stocks = list.map((x): Stock => {
    const address = onChain(x.deployments)!;
    const q = quotes.get(lc(address));
    return {
      symbol: x.tokenSymbol,
      name: (x.tokenName ?? x.tokenSymbol).replace(/\s*•\s*Robinhood Token$/, ""),
      address, logo: LOGOS.has(lc(address)) ? `/stocks/${lc(address)}.webp` : null,
      bid: num(q?.tokenBid), ask: num(q?.tokenAsk), halted: !!q?.isTradingHalt,
      dex: dex.get(lc(address)) ?? null,
      route: routes.has(lc(address)),
      metric: metric.has(lc(address)),
    };
  });
  // tokens Stoa routes first, then other on-chain markets (deepest first), then the rest by ticker
  stocks.sort((a, b) => Number(b.route) - Number(a.route) || (b.dex?.liquidityUsd ?? -1) - (a.dex?.liquidityUsd ?? -1) || a.symbol.localeCompare(b.symbol));
  return { stocks, updated: Date.now() };
}

export const stockTokens = unstable_cache(load, ["stock-tokens-v2"], { revalidate: 120 });

export const mid = (s: Pick<Stock, "bid" | "ask">) => (s.bid && s.ask ? (s.bid + s.ask) / 2 : s.bid ?? s.ask ?? null);

/** one stock token by ticker (case-insensitive), from the same cached list */
export async function stockBySymbol(symbol: string): Promise<{ stock: Stock; all: Stock[]; updated: number } | null> {
  const d = await stockTokens();
  const stock = d.stocks.find((s) => s.symbol.toLowerCase() === symbol.toLowerCase());
  return stock ? { stock, all: d.stocks, updated: d.updated } : null;
}

/** A company name without share-class and legal suffixes, for page titles: "Space Exploration Technologies Corp. Class
 *  A Common Stock" becomes "Space Exploration Technologies". */
export function shortName(name: string): string {
  let n = name.trim();
  const tails = [
    /\s+American Depositary Shares?$/i, /\s+ADRs?$/i, /\s+Class [A-C]( Common Stock| Ordinary Shares| Shares)?$/i,
    /\s+(Common Stock|Ordinary Shares|Common Shares)$/i, /,?\s+(Inc\.?|Corp\.?|Corporation|Co\.?|Ltd\.?|plc|N\.V\.|S\.A\.|Holdings?)$/i,
  ];
  for (let again = true; again; ) {
    again = false;
    for (const t of tails) {
      const m = n.replace(t, "");
      if (m !== n && m.length >= 2) { n = m; again = true; }
    }
  }
  return n;
}

