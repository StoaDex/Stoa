"use client";
import { useQuery } from "@tanstack/react-query";
import type { CmcDexToken } from "@/lib/cmc";

const usd = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `$${v >= 1e9 ? (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? (v / 1e3).toFixed(1) + "K" : v.toFixed(0)}`;

/** CoinMarketCap's view of the token being bought on Robinhood Chain: market cap, liquidity and the last 24 hours.
 *  Context only; the price you get is Stoa's quote above. Hidden when CMC has no data. */
export default function CmcPanel({ token, note = "context only, the price you get is the quote above" }: { token: string; note?: string }) {
  const q = useQuery({
    queryKey: ["cmc", token.toLowerCase()],
    staleTime: 300_000,
    retry: 0,
    queryFn: async () => {
      const r = await fetch(`/api/cmc/${token}`);
      if (!r.ok) throw new Error("unavailable");
      return (await r.json()) as CmcDexToken | { listedOnCmc: false };
    },
  });
  const d = q.data;
  if (!d || !d.listedOnCmc) return null;
  const day = d.last24h;
  const ch = day?.priceChangePct;
  return (
    <div className="cmc">
      <div className="cmc-h"><span>COINMARKETCAP · 24H</span>{ch !== null && ch !== undefined && <b className={ch >= 0 ? "up" : "down"}>{ch >= 0 ? "+" : ""}{ch.toFixed(1)}%</b>}</div>
      <div className="cmc-g">
        <div><span>Market cap</span><b>{usd(d.marketCapUsd)}</b></div>
        <div><span>Liquidity</span><b>{usd(d.liquidityUsd)}</b></div>
        <div><span>Volume</span><b>{usd(day?.volumeUsd)}</b></div>
        <div><span>Trades</span><b>{day?.trades ?? "—"}</b></div>
      </div>
      {day && day.buyers !== null && day.sellers !== null && <div className="cmc-f">{day.buyers} buyers · {day.sellers} sellers · {note}</div>}
    </div>
  );
}
