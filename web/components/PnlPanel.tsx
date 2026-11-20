"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { Pnl } from "@/lib/pnl";
import type { Net } from "@/lib/networks";

const amt = (raw: string, d: number) => {
  const n = Number(raw) / 10 ** d;
  return n >= 1e6 ? `${(n / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })}M` : n >= 1e3 ? `${(n / 1e3).toLocaleString("en-US", { maximumFractionDigits: 1 })}K` : n.toLocaleString("en-US", { maximumFractionDigits: 4 });
};
const g = (v: number, dp = 4) => `${v > 0 ? "+" : ""}${v.toLocaleString("en-US", { maximumFractionDigits: dp })}`;
const color = (v: number | null) => (v === null ? undefined : v > 0 ? "#1F7A4D" : v < 0 ? "#B4442E" : undefined);

/** Profit and loss per token from the connected wallet's swaps through Stoa on the current network. */
export default function PnlPanel({ net, address }: { net: Net; address: string }) {
  const q = useQuery({
    queryKey: ["pnl", net.key, address.toLowerCase()],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await fetch(`/api/pnl/${net.key}/${address}`);
      if (!r.ok) throw new Error("unavailable");
      return (await r.json()) as Pnl;
    },
  });
  const p = q.data;
  const usd = (v: number) => (p?.gasUsd ? ` · ${v < 0 ? "−" : ""}$${Math.abs(v * p.gasUsd).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "");
  return (
    <div className="panel pad" style={{ gridColumn: "1 / -1", overflowX: "auto" }}>
      <div className="rowx">
        <div className="lbl">PROFIT AND LOSS · SWAPS THROUGH STOA ON {net.short.toUpperCase()}</div>
        {p && p.rows.length > 0 && <span className="chip" style={{ color: color(p.realized + p.unrealized) }}>{g(p.realized + p.unrealized)} {p.gas}{usd(p.realized + p.unrealized)}</span>}
      </div>
      {p && p.rows.length > 0 && (
        <p className="note" style={{ margin: "6px 0 0" }}>
          <a href={`https://x.com/intent/post?text=${encodeURIComponent(`My P&L from swaps on @StoaDEX (${net.name}): ${g(p.realized + p.unrealized)} ${p.gas}. Every route compared on every swap.`)}&url=${encodeURIComponent(`https://stoadex.com/pnl/${net.key}/${address}`)}`} target="_blank" rel="noopener noreferrer">Share your P&amp;L on X ↗</a>
          {" · "}<a href={`/pnl/${net.key}/${address}`}>Card</a>
        </p>
      )}
      {q.isLoading ? <p className="note">Reading your swaps…</p>
        : q.isError ? <p className="note">Could not read your swaps right now. Try again in a minute.</p>
        : !p?.rows.length ? <p className="note">No token bought through Stoa on {net.name} yet. Buy one on <Link href="/trade">Trade</Link> and its profit and loss shows here.</p>
        : (
          <table className="tbl" style={{ marginTop: 10 }}>
            <thead><tr><th>TOKEN</th><th className="hm" style={{ textAlign: "right" }}>COST</th><th className="hm" style={{ textAlign: "right" }}>SOLD FOR</th><th style={{ textAlign: "right" }}>HELD · VALUE NOW</th><th style={{ textAlign: "right" }}>PROFIT / LOSS</th></tr></thead>
            <tbody>
              {p.rows.map((r) => {
                const total = r.unrealized === null ? null : r.realized + r.unrealized;
                return (
                  <tr key={r.token}>
                    <td><b>{r.symbol}</b><div className="note" style={{ marginTop: 2 }}>{r.swaps} {r.swaps === 1 ? "swap" : "swaps"}</div></td>
                    <td className="hm" style={{ textAlign: "right", fontFamily: "var(--num)" }}>{Number(r.cost).toLocaleString("en-US", { maximumFractionDigits: 5 })} {p.gas}</td>
                    <td className="hm" style={{ textAlign: "right", fontFamily: "var(--num)" }}>{Number(r.proceeds) ? `${Number(r.proceeds).toLocaleString("en-US", { maximumFractionDigits: 5 })} ${p.gas}` : "—"}</td>
                    <td style={{ textAlign: "right", fontFamily: "var(--num)" }}>{amt(r.held, r.decimals)}<div className="note" style={{ marginTop: 2 }}>{r.value === null ? "no quote" : `${Number(r.value).toLocaleString("en-US", { maximumFractionDigits: 5 })} ${p.gas}`}</div></td>
                    <td style={{ textAlign: "right", fontFamily: "var(--num)", color: color(total) }}>{total === null ? "—" : `${g(total, 5)} ${p.gas}`}<div className="note" style={{ marginTop: 2, color: color(total) }}>{r.pnlPct === null ? "" : `${g(r.pnlPct, 1)}%`}</div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      <p className="note">Counts only swaps through Stoa that paid this wallet, at the average price you paid. Value now is what Stoa&apos;s router quotes for selling what you still hold. Swaps against {net.key === "robinhood" ? "USDG" : "USDC"} count at today&apos;s {p?.gas ?? "gas token"} price; token-to-token swaps are left out.</p>
    </div>
  );
}
