import "server-only";

/** a token's on-chain USD price over the last week, in 4-hour candles, from GeckoTerminal's public API (no key,
 *  ~30 calls a minute, so each answer is kept half an hour). Its deepest pool is used. null when GeckoTerminal has no
 *  pool for the token or does not answer: the page simply shows no chart. */
export type PricePoint = { t: number; c: number };

const GT = "https://api.geckoterminal.com/api/v2/networks";
const H = { accept: "application/json;version=20230302", "user-agent": "stoadex.com" };

async function gt<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${GT}/${path}`, { headers: H, signal: AbortSignal.timeout(8_000), next: { revalidate: 1800 } });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

type Pools = { data?: { attributes?: { address?: string; reserve_in_usd?: string } }[] };
type Ohlcv = { data?: { attributes?: { ohlcv_list?: number[][] } } };

export async function weekPrices(network: string, token: string): Promise<PricePoint[] | null> {
  const pools = await gt<Pools>(`${network}/tokens/${token.toLowerCase()}/pools?page=1`);
  const best = (pools?.data ?? [])
    .map((p) => ({ a: p.attributes?.address, liq: Number(p.attributes?.reserve_in_usd ?? 0) }))
    .filter((p): p is { a: string; liq: number } => !!p.a)
    .sort((x, y) => y.liq - x.liq)[0];
  if (!best) return null;
  const o = await gt<Ohlcv>(`${network}/pools/${best.a}/ohlcv/hour?aggregate=4&limit=42&currency=usd&token=${token.toLowerCase()}`);
  const pts = (o?.data?.attributes?.ohlcv_list ?? [])
    .map((r) => ({ t: Number(r[0]), c: Number(r[4]) }))
    .filter((p) => isFinite(p.t) && isFinite(p.c) && p.c > 0 && p.t >= Date.now() / 1000 - 7 * 86400) // a quiet pool's last candles can be weeks old
    .sort((a, b) => a.t - b.t);
  return pts.length >= 6 ? pts : null;
}
