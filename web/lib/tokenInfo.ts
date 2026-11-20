import "server-only";
import { unstable_cache } from "next/cache";
import { createPublicClient, formatUnits, getAddress, http, isAddress, parseAbi, parseUnits, type Address } from "viem";
import { NETS, netByKey, type Net } from "./networks";
import { NATIVE, type Token } from "./tokens";
import { CA } from "./stoaAddress";
import { srv } from "@/lib/serverRpc";

/** A token Stoa lists on one network, with its market (DexScreener) and Stoa's best route for a small buy, read live.
 *  Backs /tokens/<chain>/<address> and the /embed buy widget. Cached a minute per token. */
export interface TokenInfo {
  net: Net["key"]; netName: string; gas: string; explorer: string;
  address: Address; symbol: string; name: string; decimals: number; logo: string | null; launchpad: string | null;
  priceUsd: number | null; change24h: number | null; liquidityUsd: number | null; volume24h: number | null; fdvUsd: number | null;
  /** what a small buy with the gas token gets on Stoa right now */
  quote: { amountIn: string; amountOut: string; venues: string[] } | null;
  updated: number;
}

const ua = { fetchOptions: { headers: { "user-agent": "curl/8.5.0" } }, timeout: 12_000 };
const quoteAbi = parseAbi(["function quote(address,address,uint256) returns ((uint256 amountOut, address mid, (address venue, bool isPool) leg1, (address venue, bool isPool) leg2))"]);
const lc = (a: string) => a.toLowerCase();

/** The tokens that get a page: every listed token on a live network except the gas token and its wrapper. */
export function listedTokens(): { net: Net; token: Token }[] {
  return NETS.filter((n) => n.deployed).flatMap((n) => n.tokens
    .filter((t) => t.address !== NATIVE && lc(t.address) !== lc(n.wrapped))
    .map((token) => ({ net: n, token })));
}

/** $STOA has its own page (/token) but can be embedded like any listed token */
const STOA_TOKEN: Token = { symbol: "STOA", name: "Stoa", address: CA as Address, decimals: 18, glyph: "S", tone: "other", logo: "/logo.png" };
export const isStoa = (chain: string, address: string) => chain === "robinhood" && lc(address) === lc(CA);

export function findListed(chain: string, address: string): { net: Net; token: Token } | null {
  const net = netByKey(chain);
  if (!net || !isAddress(address, { strict: false })) return null;
  if (isStoa(chain, address)) return { net, token: STOA_TOKEN };
  const token = net.tokens.find((t) => lc(t.address) === lc(address) && t.address !== NATIVE && lc(t.address) !== lc(net.wrapped));
  return token ? { net, token } : null;
}

/** "Pons launch · 0x12…34" -> "Pons"; plain names stay as they are */
const launchpadOf = (t: Token) => /^(\w+) launch ·/.exec(t.name)?.[1] ?? null;
const cleanName = (t: Token) => (/ · 0x/.test(t.name) || t.name === "Unverified" ? t.symbol : t.name);

const amt = (raw: bigint, decimals: number) => {
  const v = Number(formatUnits(raw, decimals));
  return v.toLocaleString("en-US", { maximumFractionDigits: v >= 1000 ? 0 : v >= 1 ? 4 : 8 });
};

async function read(chain: string, address: string): Promise<TokenInfo | null> {
  const hit = findListed(chain, address);
  if (!hit) return null;
  const { net, token } = hit;
  const addr = getAddress(token.address);

  const market = (async () => {
    try {
      const r = await fetch(`https://api.dexscreener.com/tokens/v1/${net.dexscreener}/${addr}`, { signal: AbortSignal.timeout(8_000) });
      if (!r.ok) return null;
      const pairs = (await r.json()) as { baseToken: { address: string }; priceUsd?: string; priceChange?: { h24?: number }; liquidity?: { usd?: number }; volume?: { h24?: number }; fdv?: number }[];
      const own = pairs.filter((p) => lc(p.baseToken.address) === lc(addr)).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
      if (!own.length) return null;
      const p = own[0];
      return {
        priceUsd: Number(p.priceUsd) || null, change24h: p.priceChange?.h24 ?? null, liquidityUsd: p.liquidity?.usd ?? null,
        volume24h: own.reduce((s, x) => s + (x.volume?.h24 ?? 0), 0), fdvUsd: p.fdv ?? null,
      };
    } catch { return null; }
  })();

  const quote = (async () => {
    if (!net.contracts.router) return null;
    try {
      const c = createPublicClient({ chain: net.chain, transport: http(srv(net.logsRpc), ua) });
      const small = net.gas === "ETH" ? "0.01" : "1";
      const { result } = await c.simulateContract({ address: net.contracts.router, abi: quoteAbi, functionName: "quote", args: [NATIVE, addr, parseUnits(small, 18)] });
      if (!result.amountOut) return null;
      const name = (v: string) => (net.contracts.pool && lc(v) === lc(net.contracts.pool) ? "Stoa maker pool" : net.venues[lc(v)] ?? null);
      const venues = [...new Set([name(result.leg1.venue), result.leg2.venue !== NATIVE ? name(result.leg2.venue) : null].filter((v): v is string => !!v))];
      return { amountIn: small, amountOut: amt(result.amountOut, token.decimals), venues };
    } catch { return null; /* no route right now */ }
  })();

  const [m, q] = await Promise.all([market, quote]);
  return {
    net: net.key, netName: net.name, gas: net.gas, explorer: net.explorer,
    address: addr, symbol: token.symbol, name: cleanName(token), decimals: token.decimals, logo: token.logo ?? null, launchpad: launchpadOf(token),
    priceUsd: m?.priceUsd ?? null, change24h: m?.change24h ?? null, liquidityUsd: m?.liquidityUsd ?? null, volume24h: m?.volume24h ?? null, fdvUsd: m?.fdvUsd ?? null,
    quote: q, updated: Math.floor(Date.now() / 1000),
  };
}

/** cached a minute per token, shared by the token page, its link card and the embed widget */
export const readToken = (chain: string, address: string) =>
  unstable_cache(() => read(chain, lc(address)), ["token-info", chain, lc(address)], { revalidate: 60 })();

export const usdFmt = (v: number | null) => {
  if (v === null || !isFinite(v)) return "—";
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
};
export const priceFmt = (v: number | null) =>
  v === null || !isFinite(v) ? "—" : v >= 1 ? `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : `$${v.toPrecision(3)}`;
