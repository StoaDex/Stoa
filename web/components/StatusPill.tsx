"use client";
import { useEffect, useState } from "react";

type S = { updated: number; current?: { ok: boolean; failing: string[] }; days: Record<string, { runs: number; okRuns: number }> };

/** footer pill: the outside uptime checks (status.json from the uptime workflow), read after the page has loaded.
 *  Shows nothing until there is data, and "status" without numbers when the data is older than an hour. */
export default function StatusPill() {
  const [s, setS] = useState<S | null>(null);
  useEffect(() => {
    const go = () => fetch("https://raw.githubusercontent.com/StoaDex/Stoa/status-data/status.json").then((r) => (r.ok ? r.json() : null)).then((j) => j && setS(j)).catch(() => {});
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(go); else setTimeout(go, 1500);
  }, []);
  if (!s?.current) return null;
  const fresh = Date.now() / 1000 - s.updated < 3600;
  let runs = 0, ok = 0;
  for (let i = 0; i < 7; i++) { const d = s.days[new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10)]; if (d) { runs += d.runs; ok += d.okRuns; } }
  const pct = runs ? (ok / runs) * 100 : null;
  const up = s.current.ok;
  const color = !fresh ? "#6b7280" : up ? "#15803d" : "#b45309";
  const text = !fresh ? "Status" : up ? "All systems up" : "Something is degraded";
  return (
    <a className="obadge" href="/status">
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: color, boxShadow: `0 0 0 3px ${color}26` }} />
      {text}{fresh && pct !== null && <small>{pct >= 99.995 ? "100" : pct.toFixed(1)}% · 7 days</small>}
    </a>
  );
}
