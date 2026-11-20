"use client";
import { useEffect, useState } from "react";

// The launch-day panel (/launch): Spotlight, Points, swaps, buyback and uptime on one screen, refreshed every 30 s from
// the same public endpoints the site uses. Nothing here is private data; the page is simply not linked anywhere.
type Cand = { token: string; symbol: string; bidEth: number; votesStoa: number; reachesQuorum: boolean; canceled: boolean };
type Spot = { week: number; phase: string; opensAt?: string; bidsCloseAt?: string; votesCloseAt?: string; stoaLocked: number; candidates: Cand[]; paused?: boolean };
type Pts = { seasonStart: number; wallets: number; preview?: boolean; top: { address: string; points: number; swaps: number }[] };
type Stats = { total: { swaps: number; usd24h: number; usd7d: number }; recent: { chain: string; hash: string; time: number; symIn: string; symOut: string; usd: number }[] };
type Up = { updated: number; current?: { ok: boolean; failing: string[] }; days: Record<string, { runs: number; okRuns: number }> };

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const usd = (v: number) => `$${v.toLocaleString("en-US", { maximumFractionDigits: v < 100 ? 2 : 0 })}`;
const num = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });
const hhmm = (t: number) => new Date(t * 1000).toISOString().slice(11, 16);
const ago = (t: number) => { const s = Date.now() / 1000 - t; return s < 90 ? "just now" : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 129600 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`; };
const left = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${s % 60}s`; };

async function j<T>(u: string): Promise<T | null> { try { const r = await fetch(u, { cache: "no-store" }); return r.ok ? ((await r.json()) as T) : null; } catch { return null; } }

export default function LaunchPanel() {
  const [spot, setSpot] = useState<Spot | null>(null);
  const [pts, setPts] = useState<Pts | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [burn, setBurn] = useState<number | null>(null);
  const [up, setUp] = useState<Up | null>(null);
  const [at, setAt] = useState(0);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const load = async () => {
      const [s, p, st, b, u] = await Promise.all([
        j<Spot>("/api/v1/spotlight"), j<Pts>("/api/points"), j<Stats>("/api/stats"), j<{ stoaBurnedByBuybacks: number | null }>("/api/launch"),
        j<Up>("https://raw.githubusercontent.com/StoaDex/Stoa/status-data/status.json"),
      ]);
      if (s) setSpot(s); if (p) setPts(p); if (st) setStats(st); if (b) setBurn(b.stoaBurnedByBuybacks); if (u) setUp(u);
      setAt(Date.now());
    };
    setNow(Date.now());
    void load();
    const a = setInterval(load, 30_000), c = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(a); clearInterval(c); };
  }, []);

  const PHASE: Record<string, string> = { before_week_1: "opens Mon 00:00 UTC", bids_open: "bids open", votes_only: "votes only, bids closed" };
  const start = (pts?.seasonStart ?? 1_795_392_000) * 1000;
  const live = now >= start;
  const day = new Date(now).toISOString().slice(0, 10);
  const upToday = up?.days?.[day];
  const cands = (spot?.candidates ?? []).filter((c) => !c.canceled).sort((a, b) => b.bidEth - a.bidEth);
  const rhRecent = (stats?.recent ?? []).filter((x) => x.chain === "robinhood" && x.symIn !== x.symOut).slice(0, 8);
  const tile = { background: "#fff", border: "1px solid var(--line)", borderRadius: 14, padding: "12px 14px" } as const;
  const big = { fontFamily: "var(--num)", fontSize: 26, lineHeight: 1.1 } as const;

  if (!now) return <div className="panel pad"><p className="note" style={{ margin: 0 }}>Loading…</p></div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="panel pad" style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <div className="lbl">{live ? "SEASON 1 AND SPOTLIGHT WEEK 1 ARE LIVE" : "SPOTLIGHT AND POINTS START IN"}</div>
          <div style={{ ...big, fontSize: 30 }}>{live ? `${left(now - start)} in` : left(start - now)}</div>
        </div>
        <div className="note" style={{ margin: 0, textAlign: "right" }}>{new Date(now).toISOString().slice(11, 19)} UTC<br />{at ? `updated ${Math.round((now - at) / 1000)} s ago` : "loading…"}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
        <div style={tile}><div className="lbl">SITE</div><div style={{ ...big, color: up?.current ? (up.current.ok ? "#15803d" : "#b91c1c") : "inherit" }}>{up?.current ? (up.current.ok ? "Up" : "Problem") : "—"}</div><small className="note">{up?.current && !up.current.ok ? up.current.failing.join(", ") : upToday ? `${upToday.okRuns}/${upToday.runs} checks ok today` : "outside checks every 15 min"}</small></div>
        <div style={tile}><div className="lbl">$STOA LOCKED</div><div style={big}>{spot ? num(spot.stoaLocked) : "—"}</div><small className="note">{spot ? (spot.phase === "before_week_1" ? "week 1 opens Mon 00:00 UTC" : `week ${spot.week} · ${PHASE[spot.phase] ?? spot.phase.replace(/_/g, " ")}`) : ""}</small></div>
        <div style={tile}><div className="lbl">SWAPS 24H</div><div style={big}>{stats ? usd(stats.total.usd24h) : "—"}</div><small className="note">{stats ? `7 days ${usd(stats.total.usd7d)}` : ""}</small></div>
        <div style={tile}><div className="lbl">POINTS</div><div style={big}>{pts ? num(pts.wallets) : "—"}</div><small className="note">{pts?.preview ? "wallets (preview)" : "wallets on the board"}</small></div>
        <div style={tile}><div className="lbl">BURNED BY BUYBACK</div><div style={big}>{burn === null ? "—" : num(burn)}</div><small className="note">$STOA · runs Mon 13:41 UTC</small></div>
      </div>

      <div className="panel pad">
        <div className="rowx"><div className="lbl">SPOTLIGHT RACE · TOP 3 THAT REACH 1M VOTES WIN</div><a href="/spotlight">Open →</a></div>
        {spot?.paused && <p className="err" style={{ marginTop: 8 }}>SpotlightMarket is paused.</p>}
        {!cands.length ? <p className="note" style={{ marginBottom: 0 }}>{spot ? (spot.phase === "before_week_1" ? `No bids yet: bidding opens ${spot.opensAt ? new Date(spot.opensAt).toUTCString().slice(0, 22) + " UTC" : "Mon 00:00 UTC"}.` : "No bids yet this week.") : "Loading…"}</p> : (
          <table className="tbl" style={{ marginTop: 8 }}>
            <thead><tr><th>TOKEN</th><th style={{ textAlign: "right" }}>BID</th><th style={{ textAlign: "right" }}>VOTES</th><th style={{ textAlign: "right" }}>1M</th></tr></thead>
            <tbody>{cands.map((c) => (
              <tr key={c.token}><td><a href={`/spotlight/vote/${c.token}`}>{c.symbol}</a></td><td style={{ textAlign: "right", fontFamily: "var(--num)" }}>{c.bidEth.toFixed(3)}</td><td style={{ textAlign: "right", fontFamily: "var(--num)" }}>{num(c.votesStoa)}</td><td style={{ textAlign: "right" }}>{c.reachesQuorum ? "✓" : "–"}</td></tr>
            ))}</tbody>
          </table>
        )}
        {spot?.bidsCloseAt && <p className="note" style={{ marginBottom: 0 }}>Bids close {new Date(spot.bidsCloseAt).toUTCString().slice(0, 22)} UTC · votes close {spot.votesCloseAt ? new Date(spot.votesCloseAt).toUTCString().slice(0, 22) + " UTC" : ""}</p>}
      </div>

      <div className="grid2 eq" style={{ alignItems: "start" }}>
        <div className="panel pad">
          <div className="rowx"><div className="lbl">POINTS · TOP 5</div><a href="/points">Board →</a></div>
          {!pts?.top?.length ? <p className="note" style={{ marginBottom: 0 }}>{live ? "No points yet this season." : "The board starts at 00:00 UTC Monday."}</p> : (
            <ul className="list">{pts.top.slice(0, 5).map((r, i) => <li key={r.address}><span><a href={`/points/${r.address}`} style={{ fontFamily: "var(--mono)", fontSize: 13 }}>{i + 1}. {short(r.address)}</a></span><b>{num(r.points)}</b></li>)}</ul>
          )}
        </div>
        <div className="panel pad">
          <div className="rowx"><div className="lbl">LATEST SWAPS · ROBINHOOD CHAIN</div><a href="/stats">Stats →</a></div>
          {!rhRecent.length ? <p className="note" style={{ marginBottom: 0 }}>None yet.</p> : (
            <ul className="list">{rhRecent.map((x) => <li key={x.hash}><span>{x.symIn} → {x.symOut} <small className="note" style={{ margin: 0 }}>{hhmm(x.time)} UTC · {ago(x.time)}</small></span><b>{usd(x.usd)}</b></li>)}</ul>
          )}
        </div>
      </div>
      <p className="note">Refreshes every 30 seconds from Stoa&apos;s public endpoints. Bookmark this page; it is not linked from the site.</p>
    </div>
  );
}
