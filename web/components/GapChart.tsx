import type { GapPoint } from "@/lib/gapHistory";

const fmt = (v: number) => `$${v.toLocaleString("en-US", { maximumFractionDigits: v < 10 ? 3 : 2 })}`;
const day = (t: number) => new Date(t * 1000).toUTCString().slice(5, 11);

/** On-chain price against Robinhood's price for one stock token over the last 7 days (server-drawn SVG), with the gap
 *  at each snapshot. From Stoa's open dataset; snapshots every 6 hours. */
export default function GapChart({ points, symbol }: { points: GapPoint[]; symbol: string }) {
  const W = 640, H = 200, P = 8;
  const has = points.length >= 2;
  const lo = has ? Math.min(...points.flatMap((p) => [p.mid, p.onchain])) : 0, hi = has ? Math.max(...points.flatMap((p) => [p.mid, p.onchain])) : 1;
  const pad = (hi - lo) * 0.12 || hi * 0.01;
  const t0 = has ? points[0].t : 0, t1 = has ? points[points.length - 1].t : 1;
  const x = (t: number) => P + ((t - t0) / (t1 - t0 || 1)) * (W - 2 * P);
  const y = (v: number) => P + (1 - (v - (lo - pad)) / (hi - lo + 2 * pad)) * (H - 2 * P);
  const line = (k: "mid" | "onchain") => points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const avg = has ? points.reduce((a, p) => a + p.gap, 0) / points.length : 0;
  return (
    <div className="panel pad" style={{ marginBottom: 16 }}>
      <div className="rowx"><div className="lbl">ON-CHAIN VS ROBINHOOD · 7 DAYS</div>{last && <span className="chip">{`now ${last.gap >= 0 ? "+" : ""}${last.gap.toFixed(2)}%`}</span>}</div>
      {has ? (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${symbol} on-chain price against Robinhood's price, last 7 days`} style={{ marginTop: 10, display: "block" }}>
            <path d={line("mid")} fill="none" stroke="#9AA4B2" strokeWidth={2.5} strokeDasharray="6 5" />
            <path d={line("onchain")} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
            {points.map((p) => <circle key={p.t} cx={x(p.t)} cy={y(p.onchain)} r={2.5} fill="var(--accent)"><title>{`${new Date(p.t * 1000).toUTCString().slice(5, 22)} UTC · on-chain ${fmt(p.onchain)} · Robinhood ${fmt(p.mid)} · ${p.gap >= 0 ? "+" : ""}${p.gap.toFixed(2)}%`}</title></circle>)}
          </svg>
          <div className="rowx note" style={{ marginTop: 6 }}><span>{day(t0)}</span><span>{day(t1)}</span></div>
          <p className="note" style={{ marginBottom: 0 }}>
            <span style={{ color: "var(--accent)" }}>━</span> on-chain · <span style={{ color: "#9AA4B2" }}>┅</span> Robinhood (mid) · average gap {avg >= 0 ? "+" : ""}{avg.toFixed(2)}% over {points.length} snapshots.
            {" "}From Stoa&apos;s <a href="https://huggingface.co/datasets/StoaDex/robinhood-stock-tokens" target="_blank" rel="noopener noreferrer">open dataset</a>, every 6 hours. Outside US market hours Robinhood&apos;s price follows the overnight session.
          </p>
        </>
      ) : (
        <p className="note" style={{ marginBottom: 0 }}>History builds up from 20 Nov 2026, four snapshots a day, in Stoa&apos;s <a href="https://huggingface.co/datasets/StoaDex/robinhood-stock-tokens" target="_blank" rel="noopener noreferrer">open dataset</a>. Check back soon.</p>
      )}
    </div>
  );
}
