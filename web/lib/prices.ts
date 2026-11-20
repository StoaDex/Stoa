"use client";
import { useQuery } from "@tanstack/react-query";
import { NATIVE, type Token } from "./tokens";
import type { Net } from "./networks";

/** USD prices from DexScreener's public token API (Elysium and Robinhood Chain are supported). Display only: swaps
 *  always use the on-chain quote. Each token takes the pair with the most liquidity. Refreshed every 30 seconds. */
export interface Price { usd: number; ch24?: number }
const keyOf = (net: Net, a: string) => (a.toLowerCase() === NATIVE.toLowerCase() ? net.wrapped.toLowerCase() : a.toLowerCase());

export async function fetchPrices(net: Net, addrs: string[]): Promise<Record<string, Price>> {
  const out: Record<string, Price> = {};
  const uniq = [...new Set(addrs.map((a) => keyOf(net, a)))];
  for (let i = 0; i < uniq.length; i += 30) {
    const r = await fetch(`https://api.dexscreener.com/tokens/v1/${net.dexscreener}/${uniq.slice(i, i + 30).join(",")}`);
    if (!r.ok) continue;
    const pairs = (await r.json()) as { baseToken: { address: string }; quoteToken: { address: string }; priceUsd?: string; priceNative?: string; priceChange?: { h24?: number }; liquidity?: { usd?: number } }[];
    const best: Record<string, number> = {};
    const take = (a: string, usd: number, liq: number, ch24?: number) => {
      if (!usd || !isFinite(usd) || !uniq.includes(a) || (best[a] ?? -1) >= liq) return;
      best[a] = liq; out[a] = { usd, ch24 };
    };
    for (const p of pairs) {
      const liq = p.liquidity?.usd ?? 0, usd = Number(p.priceUsd);
      take(p.baseToken.address.toLowerCase(), usd, liq, p.priceChange?.h24);
      // the token can also be the quote side (the wrapped native nearly always is): base price / base-in-quote
      if (Number(p.priceNative) > 0) take(p.quoteToken.address.toLowerCase(), usd / Number(p.priceNative), liq * 0.999);
    }
  }
  // stablecoins show $1: a thin pair would otherwise print 100 USDC as $100.80
  for (const a of net.stables) if (uniq.includes(a)) out[a] = { usd: 1, ch24: 0 };
  return out;
}

export function usePrices(net: Net, tokens: Token[]) {
  const addrs = tokens.map((t) => t.address).sort();
  const q = useQuery({ queryKey: ["prices", net.key, addrs.join()], queryFn: () => fetchPrices(net, addrs), refetchInterval: 30_000, staleTime: 25_000, enabled: addrs.length > 0 });
  return (t?: Token) => (t ? q.data?.[keyOf(net, t.address)] : undefined);
}

export function fmtUsd(v: number) {
  if (!isFinite(v) || v <= 0) return "";
  if (v >= 1) return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const d = Math.min(10, Math.max(2, 1 - Math.floor(Math.log10(v)) + 2));
  return "$" + v.toFixed(d);
}
