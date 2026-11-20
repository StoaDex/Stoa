import type { PricePoint } from "@/lib/priceHistory";

const W = 640, H = 180, PAD = 6;
const usd = (v: number) => (v >= 1 ? "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "$" + v.toPrecision(3));
const day = (t: number) => new Date(t * 1000).toUTCString().slice(5, 11);

/** a plain line of the on-chain price over the week, drawn on the server: no chart library, nothing to load */
export default function PriceChart({ points, symbol, source, stock }: { points: PricePoint[]; symbol: string; source: string; stock?: boolean }) {
  const cs = points.map((p) => p.c);
  const lo = Math.min(...cs), hi = Math.max(...cs);
  const span = hi - lo || hi * 0.01 || 1;
  const t0 = points[0].t, t1 = points[points.length - 1].t;
  const x = (t: number) => PAD + ((t - t0) / (t1 - t0 || 1)) * (W - 2 * PAD);
  const y = (c: number) => PAD + (1 - (c - lo) / span) * (H - 2 * PAD);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p.c).toFixed(1)}`).join(" ");
  const area = `${line} L${x(t1).toFixed(1)} ${H} L${x(t0).toFixed(1)} ${H} Z`;
  const ch = ((cs[cs.length - 1] - cs[0]) / cs[0]) * 100;
  const up = ch >= 0;
  const color = up ? "#1E6B41" : "#8A2B20";
  return (
    <figure className="panel pad" style={{ margin: "0 0 16px" }}>
      <div className="rowx">
        <div className="lbl">ON-CHAIN PRICE · 7 DAYS</div>
        <span style={{ fontFamily: "var(--num)", color }}>{up ? "+" : ""}{ch.toFixed(2)}%</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${symbol} on-chain price over 7 days: from ${usd(cs[0])} to ${usd(cs[cs.length - 1])}, low ${usd(lo)}, high ${usd(hi)}`} style={{ display: "block", marginTop: 10, height: "auto" }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="pc-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.18" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#pc-fill)" />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
        <span>{day(t0)}</span>
        <span>Low {usd(lo)} · High {usd(hi)}</span>
        <span>{day(t1)}</span>
      </div>
      <figcaption className="note" style={{ marginBottom: 0 }}>4-hour closes in its deepest on-chain pool, UTC, from {source}.{stock ? " On-chain trades happen at any hour, so this line moves while the US market is closed too." : " Past prices say nothing about where it goes next."}</figcaption>
    </figure>
  );
}
