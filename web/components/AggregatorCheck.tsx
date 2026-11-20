"use client";
import { useEffect, useState } from "react";
import { fmt } from "@/lib/swap";

type Q = { name: "0x" | "1inch" | "Rialto"; out: string };

/** 0x's, 1inch's and Rialto's quotes for the same amount on Robinhood Chain, next to Stoa's route: a second opinion the trader
 *  can see. Fetched once per pair and amount (not on every 4-second refresh). Hidden when no aggregator answers. */
export default function AggregatorCheck({ sell, buy, amt, out, decimals, symbol }: { sell: string; buy: string; amt: bigint; out: bigint; decimals: number; symbol: string }) {
  const [quotes, setQuotes] = useState<Q[] | null>(null);
  useEffect(() => {
    setQuotes(null);
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/aggregators?sell=${sell}&buy=${buy}&amount=${amt}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : { quotes: [] }))
        .then((j: { quotes?: Q[] }) => setQuotes(Array.isArray(j.quotes) ? j.quotes : []))
        .catch(() => { /* a check, not a requirement */ });
    }, 600);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [sell, buy, amt]);
  if (!quotes?.length || out <= 0n) return null;
  const rows = quotes.map((q) => ({ ...q, n: BigInt(q.out), d: Number(BigInt(q.out) - out) / Number(out) }));
  const better = rows.filter((r) => r.d > 0.001).sort((a, b) => b.d - a.d)[0];
  return (
    <div className="panel pad" style={{ marginTop: 10, padding: "10px 12px" }}>
      <div className="rowx"><div className="lbl">SECOND OPINION</div><span className="note" style={{ marginTop: 0 }}>same amount, quoted now</span></div>
      <div className="det" style={{ marginTop: 6 }}>
        <span>Stoa</span><span>{fmt(out, decimals, 6)} {symbol}</span>
        {rows.flatMap((r) => [
          <span key={r.name + "-k"}>{r.name}</span>,
          <span key={r.name + "-v"}>{fmt(r.n, decimals, 6)} {symbol} <small style={{ color: "var(--muted)", fontWeight: 400 }}>({r.d >= 0 ? "+" : ""}{(r.d * 100).toFixed(2)}%)</small></span>,
        ])}
      </div>
      {better
        ? <p className="note" style={{ marginTop: 8 }}>{better.name} quotes {(better.d * 100).toFixed(2)}% more for this amount right now, before gas. Swaps on Stoa earn Points and pay your referrer; the choice is yours.</p>
        : <p className="note" style={{ marginTop: 8 }}>Stoa&apos;s route gives as much or more than {rows.map((r) => r.name).join(" and ")} for this amount right now.</p>}
    </div>
  );
}
