"use client";
import { useEffect, useState } from "react";

type Day = { date: string; holders: number; burned: number; locked: number; curve: number };
type H = { days: Day[]; holders: number; transfers: number; updated: number; burnBy: { buyback: number | null; spotlight: number | null } };

const big = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : v.toFixed(0));
const sign = (v: number, f: (x: number) => string) => (v > 0 ? `+${f(v)}` : v < 0 ? `−${f(-v)}` : "no change");

function Spark({ days, k, color, label }: { days: Day[]; k: "holders" | "burned" | "locked"; color: string; label: string }) {
  const W = 300, H = 70, P = 4;
  const v = days.map((d) => d[k]);
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const x = (i: number) => P + (i / Math.max(1, v.length - 1)) * (W - 2 * P);
  const y = (n: number) => P + (1 - (n - lo) / span) * (H - 2 * P);
  const line = v.map((n, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(n).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`${label} per day from ${days[0].date} to ${days[days.length - 1].date}: ${big(v[0])} to ${big(v[v.length - 1])}`} preserveAspectRatio="none" style={{ display: "block", marginTop: 6 }}>
      <path d={`${line} L${x(v.length - 1)} ${H} L${x(0)} ${H} Z`} fill={color} opacity={0.12} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** $STOA since launch: holders, burned and locked per day, and where the burn came from. Loads after the page. */
export default function StoaDashboard() {
  const [h, setH] = useState<H | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { fetch("/api/stoa/history").then((r) => (r.ok ? r.json() : Promise.reject())).then(setH).catch(() => setErr(true)); }, []);
  if (err) return null;
  const days = h?.days ?? [];
  const last = days[days.length - 1], wk = days[Math.max(0, days.length - 8)];
  const tile = { background: "#fff", border: "1px solid var(--line)", borderRadius: 14, padding: "12px 14px", minWidth: 0 } as const;
  const other = last && h ? Math.max(0, last.burned - (h.burnBy.buyback ?? 0) - (h.burnBy.spotlight ?? 0)) : 0;
  return (
    <div className="panel pad" style={{ marginBottom: 16 }}>
      <div className="lbl">$STOA SINCE LAUNCH · PER DAY</div>
      {!last ? <p className="note" style={{ marginBottom: 0 }}>Reading every $STOA transfer since launch…</p> : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginTop: 10 }}>
            <div style={tile}>
              <div className="lbl">HOLDERS</div>
              <div style={{ fontFamily: "var(--num)", fontSize: 26 }}>{last.holders.toLocaleString("en-US")}</div>
              <small className="note">{sign(last.holders - wk.holders, (x) => x.toLocaleString("en-US"))} in 7 days</small>
              <Spark days={days} k="holders" color="#2563eb" label="Holders" />
            </div>
            <div style={tile}>
              <div className="lbl">BURNED</div>
              <div style={{ fontFamily: "var(--num)", fontSize: 26 }}>{big(last.burned)}</div>
              <small className="note">{sign(last.burned - wk.burned, big)} in 7 days</small>
              <Spark days={days} k="burned" color="#b45309" label="$STOA burned" />
            </div>
            <div style={tile}>
              <div className="lbl">LOCKED IN STOA</div>
              <div style={{ fontFamily: "var(--num)", fontSize: 26 }}>{big(last.locked)}</div>
              <small className="note">Spotlight, Rug Cover, maker bonds</small>
              <Spark days={days} k="locked" color="#15803d" label="$STOA locked" />
            </div>
          </div>
          <ul className="list" style={{ marginTop: 12 }}>
            <li><span>Burned by the weekly buyback</span><b>{h!.burnBy.buyback === null ? "—" : big(h!.burnBy.buyback)}</b></li>
            <li><span>Burned by Spotlight (10% of winning bids and entry fees)</span><b>{h!.burnBy.spotlight === null ? "—" : big(h!.burnBy.spotlight)}</b></li>
            <li><span>Burned at launch and by holders</span><b>{big(other)}</b></li>
          </ul>
          <p className="note" style={{ marginBottom: 0 }}>Rebuilt from all {h!.transfers.toLocaleString("en-US")} $STOA transfers on Robinhood Chain; holders counts every address holding any, except the burn address. Updated hourly. The first buyback runs Mon 23 Nov, 13:41 UTC.</p>
        </>
      )}
    </div>
  );
}
