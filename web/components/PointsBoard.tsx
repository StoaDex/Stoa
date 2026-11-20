"use client";
import { useMemo, useState } from "react";
import type { PointsRow } from "@/lib/pointsScore";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const n = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 1 });

function Move({ rank, prev, fresh }: { rank: number; prev?: number | null; fresh: boolean }) {
  if (prev === undefined || !fresh) return null;
  if (prev === null) return <small style={{ color: "#1d4ed8", fontWeight: 600 }}>new</small>;
  const d = prev - rank;
  if (d === 0) return <small style={{ color: "var(--muted)" }}>–</small>;
  return <small style={{ color: d > 0 ? "#15803d" : "#b91c1c", fontWeight: 600 }}>{d > 0 ? `▲${d}` : `▼${-d}`}</small>;
}

/** the season board: search any wallet, rank change over the last 24 hours, and which wallets earned the stock-token 2× */
export default function PointsBoard({ rows, empty, stockX, showMoves }: { rows: PointsRow[]; empty: string; stockX: number; showMoves: boolean }) {
  const [q, setQ] = useState("");
  const ranked = useMemo(() => rows.map((r, i) => ({ r, rank: i + 1 })), [rows]);
  const s = q.trim().toLowerCase();
  const shown = s ? ranked.filter(({ r }) => r.address.includes(s)).slice(0, 50) : ranked.slice(0, 50);
  const full = /^0x[0-9a-f]{40}$/.test(s);
  return (
    <>
      <div style={{ padding: "10px 18px 0" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a wallet: 0x…" aria-label="Find a wallet on the board" spellCheck={false}
          style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "#fff", fontFamily: "var(--mono)", fontSize: 13 }} />
        {s && <p className="note" style={{ margin: "6px 0 0" }}>{shown.length ? `${shown.length} ${shown.length === 1 ? "wallet" : "wallets"} found.` : full ? <>Not on the board yet. <a href={`/points/${s}`}>Open its card</a></> : "No wallet matches."}</p>}
      </div>
      <table className="tbl" style={{ marginTop: 8 }}>
        <thead><tr><th style={{ width: 52 }}>#</th><th>WALLET</th><th className="hm" style={{ textAlign: "right" }}>SWAPS</th><th style={{ textAlign: "right" }}>POINTS</th></tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={4} className="note">{empty}</td></tr>
            : shown.map(({ r, rank }) => (
              <tr key={r.address}>
                <td style={{ fontFamily: "var(--num)", color: "var(--muted)", whiteSpace: "nowrap" }}>{rank} <Move rank={rank} prev={r.prevRank} fresh={showMoves} /></td>
                <td style={{ fontFamily: "var(--mono)", fontSize: 13 }}>
                  <a href={`/points/${r.address}`}>{short(r.address)}</a>
                  {(r.stockSwaps ?? 0) > 0 && <span title={`Swapped Robinhood Stock Tokens, which count ${stockX}×`} style={{ marginLeft: 6, fontFamily: "var(--sans, inherit)", fontSize: 11, fontWeight: 600, padding: "1px 6px", borderRadius: 999, background: "#ecfdf5", color: "#15803d", border: "1px solid #bbf7d0" }}>stocks {stockX}×</span>}
                  {(r.refPoints ?? 0) > 0 && <span title="Earns points from referred swaps" style={{ marginLeft: 6, fontFamily: "var(--sans, inherit)", fontSize: 11, fontWeight: 600, padding: "1px 6px", borderRadius: 999, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>referrer</span>}
                </td>
                <td className="hm" style={{ textAlign: "right", fontFamily: "var(--num)" }}>{r.swaps}</td>
                <td style={{ textAlign: "right", fontFamily: "var(--num)" }}>{n(r.points)}</td>
              </tr>
            ))}
        </tbody>
      </table>
      {showMoves && rows.length > 0 && <p className="note" style={{ padding: "0 18px 12px", margin: 0 }}>▲▼ change in rank over the last 24 hours · <b>new</b>: joined the board in that time.</p>}
    </>
  );
}
