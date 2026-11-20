import { readUptime, uptimePct } from "@/lib/uptimeHistory";

const fmtPct = (p: number | null) => (p === null ? "—" : p >= 99.995 ? "100%" : `${p.toFixed(2)}%`);
const when = (t: number) => new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC";
const dur = (a: number, b: number) => { const m = Math.max(15, Math.round((b - a) / 60)); return m < 90 ? `${m} min` : `${(m / 60).toFixed(1)} h`; };

export default async function UptimeHistory() {
  const s = await readUptime();
  if (!s || !Object.keys(s.days).length) {
    return (
      <div className="panel pad" style={{ marginBottom: 16 }}>
        <div className="lbl">UPTIME · OUTSIDE CHECKS EVERY 15 MINUTES</div>
        <p className="note" style={{ marginBottom: 0 }}>History starts building from 20 Nov 2026. Check back in an hour.</p>
      </div>
    );
  }
  const d7 = uptimePct(s, 7), d30 = uptimePct(s, 30);
  const days = Array.from({ length: 30 }, (_, i) => new Date(Date.now() - (29 - i) * 86400_000).toISOString().slice(0, 10));
  const inc = [...s.incidents].reverse().slice(0, 8);
  return (
    <div className="panel pad" style={{ marginBottom: 16 }}>
      <div className="lbl">UPTIME · OUTSIDE CHECKS EVERY 15 MINUTES</div>
      <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginTop: 8 }}>
        <div><div style={{ fontFamily: "var(--num)", fontSize: 30 }}>{fmtPct(d7.pct)}</div><div className="note" style={{ margin: 0 }}>last 7 days · {d7.runs} runs</div></div>
        <div><div style={{ fontFamily: "var(--num)", fontSize: 30 }}>{fmtPct(d30.pct)}</div><div className="note" style={{ margin: 0 }}>last 30 days</div></div>
      </div>
      <div aria-label="Daily uptime, last 30 days" style={{ display: "flex", gap: 3, marginTop: 14, height: 34, alignItems: "stretch" }}>
        {days.map((k) => {
          const d = s.days[k];
          const p = d ? d.okRuns / d.runs : null;
          const bg = p === null ? "var(--line, #e5e7eb)" : p >= 0.999 ? "#15803d" : p >= 0.97 ? "#a16207" : "#b91c1c";
          return <span key={k} title={d ? `${k}: ${d.okRuns}/${d.runs} runs passed` : `${k}: no data`} style={{ flex: 1, borderRadius: 3, background: bg, opacity: p === null ? 0.5 : 1 }} />;
        })}
      </div>
      <div className="note" style={{ display: "flex", justifyContent: "space-between", margin: "4px 0 0" }}><span>30 days ago</span><span>today</span></div>
      <div className="lbl" style={{ marginTop: 16 }}>INCIDENTS</div>
      {inc.length ? (
        <ul className="list">
          {inc.map((i) => (
            <li key={i.start} style={{ alignItems: "flex-start" }}>
              <span style={{ minWidth: 0 }}>{i.checks.join(", ")}<small style={{ display: "block", color: "var(--muted)" }}>{when(i.start)}{i.end ? ` · about ${dur(i.start, i.end)}` : " · ongoing"}</small></span>
              <b style={{ color: i.end ? "#15803d" : "#b91c1c", whiteSpace: "nowrap" }}>{i.end ? "Resolved" : "Ongoing"}</b>
            </li>
          ))}
        </ul>
      ) : <p className="note" style={{ marginBottom: 0 }}>None in the last 30 days.</p>}
      <p className="note" style={{ marginBottom: 0 }}>Checked from outside every 15 minutes: home page, Trade, a live router quote, the stock token and Spotlight APIs. A run counts as up only when all of them pass. <a href="https://github.com/StoaDex/Stoa/blob/main/.github/workflows/uptime.yml" target="_blank" rel="noopener noreferrer">How it works</a></p>
    </div>
  );
}
