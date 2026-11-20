import "server-only";
import { isAddress } from "viem";
import { netByKey } from "./networks";
import { NATIVE } from "./tokens";
import { CA as STOA_CA } from "./stoaAddress";

/** Market context from CoinMarketCap for the MCP market_context tool. Uses the Pro API with CMC_API_KEY when set
 *  (server env only, never sent to the client), otherwise CMC's keyless public API, which has a small shared limit. */
const KEY = process.env.CMC_API_KEY;
const BASE = "https://pro-api.coinmarketcap.com";

async function cmc<T = any>(path: string, ttl = 60): Promise<T | null> {
  const r = await cmcRaw<T>(path, ttl);
  return r.ok ? r.data : null;
}

async function cmcRaw<T = any>(path: string, ttl: number): Promise<{ ok: true; data: T | null } | { ok: false }> {
  const tries: [string, HeadersInit][] = KEY ? [[`${BASE}${path}`, { "X-CMC_PRO_API_KEY": KEY, accept: "application/json" }]] : [];
  tries.push([`${BASE}/public-api${path}`, { accept: "application/json" }]);
  for (const [url, headers] of tries) {
    try {
      const r = await fetch(url, { headers, next: { revalidate: ttl }, signal: AbortSignal.timeout(10_000) });
      const j = await r.json().catch(() => null);
      if (r.ok && j && String(j.status?.error_code ?? "0") === "0") return { ok: true, data: (j.data ?? null) as T | null };
    } catch { /* try the next route */ }
  }
  return { ok: false };
}

const num = (v: unknown, d = 6) => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? null : Number(Number(v).toPrecision(d)));

export type CmcDexToken = {
  address: string; symbol: string; name: string; listedOnCmc: true;
  priceUsd: number | null; marketCapUsd: number | null; liquidityUsd: number | null; high24hUsd: number | null; low24hUsd: number | null;
  last24h: { volumeUsd: number | null; trades: number | null; buyers: number | null; sellers: number | null; priceChangePct: number | null } | null;
  pools: number | null; cmcRiskLabel: string | null; website: string | null; x: string | null; source: string;
};

/** CMC's DEX data for one Robinhood Chain token: null when CMC has none, "error" when CMC did not answer. */
export async function cmcDexToken(address: string, ttl = 60): Promise<CmcDexToken | null | "error"> {
  const res = await cmcRaw<any>(`/v1/dex/token?platform=robinhood&address=${address}`, ttl);
  if (!res.ok) return "error";
  const d = res.data;
  if (!d || !d.addr) return null;
  const day = Array.isArray(d.sts) ? d.sts.find((s: any) => s.tp === "24h") ?? d.sts[d.sts.length - 1] : null;
  return {
    address: d.addr, symbol: d.sym, name: d.n, listedOnCmc: true,
    priceUsd: num(d.p), marketCapUsd: num(d.mcap, 8), liquidityUsd: num(d.liqUsd, 8),
    high24hUsd: num(d.ph24h), low24hUsd: num(d.pl24h),
    last24h: day ? { volumeUsd: num(day.vu, 8), trades: num(day.txs), buyers: num(day.nb), sellers: num(day.ns), priceChangePct: day.pc === undefined || day.pc === null ? null : num(Number(day.pc) * 100, 4) } : null,
    pools: num(d.nps), cmcRiskLabel: d.rl ?? null, website: d.web ?? null, x: d.tw ?? null,
    source: "CoinMarketCap DEX data",
  };
}

export async function marketContext(input: { tokens?: unknown }) {
  const net = netByKey("robinhood")!;
  const asked = (Array.isArray(input.tokens) ? input.tokens : input.tokens ? [input.tokens] : []).map(String).slice(0, 5);

  const [global, fg, majors] = await Promise.all([
    cmc<any>("/v1/global-metrics/quotes/latest?convert=USD", 300),
    cmc<any>("/v3/fear-and-greed/latest", 600),
    cmc<any[]>("/v2/simple/price?symbol=BTC,ETH,USDG&convert=USD", 60),
  ]);
  const px = (s: string) => num(majors?.find((x) => x.symbol === s)?.quotes?.[0]?.price);
  const g = global?.quote?.USD;

  const tokens = await Promise.all(asked.map(async (raw) => {
    const t = raw.trim();
    if (/^(native|eth)$/i.test(t) || t.toLowerCase() === NATIVE.toLowerCase()) return { input: t, symbol: "ETH", priceUsd: px("ETH"), source: "CoinMarketCap" };
    const known = isAddress(t, { strict: false }) ? net.tokens.find((x) => x.address.toLowerCase() === t.toLowerCase()) : net.tokens.find((x) => x.symbol.toUpperCase() === t.toUpperCase());
    const address = isAddress(t, { strict: false }) ? t : /^\$?stoa$/i.test(t) ? STOA_CA : known?.address;
    if (!address) return { input: t, error: "unknown token: pass a Robinhood Chain address (list_tokens has the verified ones)" };
    const r = await cmcDexToken(address);
    if (r === "error") return { input: t, address, symbol: known?.symbol ?? null, error: "CoinMarketCap did not answer for this token, try again shortly" };
    if (!r) return { input: t, address, symbol: known?.symbol ?? null, listedOnCmc: false, note: "CoinMarketCap has no market data for this token yet. Use quote for Stoa's on-chain price and safety_check before buying." };
    return { input: t, ...r };
  }));

  if (!global && !fg && !majors && tokens.every((x: any) => !x.listedOnCmc && !x.priceUsd)) return { error: "CoinMarketCap did not answer, try again shortly" };
  return {
    market: {
      totalMarketCapUsd: num(g?.total_market_cap, 8), marketCapChange24hPct: num(g?.total_market_cap_yesterday_percentage_change, 4),
      btcDominancePct: num(global?.btc_dominance, 4), ethDominancePct: num(global?.eth_dominance, 4),
      btcUsd: px("BTC"), ethUsd: px("ETH"), usdgUsd: px("USDG"),
      fearAndGreed: fg ? { value: fg.value, label: fg.value_classification, updated: fg.update_time } : null,
    },
    tokens,
    note: "Context only, not advice. Prices here are CoinMarketCap's; the price a swap gets is the one quote returns. A low market cap or thin liquidity means a large trade moves the price a lot.",
    source: "Data from CoinMarketCap (coinmarketcap.com)",
    access: KEY ? "CoinMarketCap Pro API" : "CoinMarketCap keyless public API",
  };
}
