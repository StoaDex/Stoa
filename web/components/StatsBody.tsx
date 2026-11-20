"use client";
import { useQuery } from "@tanstack/react-query";
import type { RouterStats } from "@/lib/routerStats";
import { Sk } from "./ui";

const usd = (v: number) => (v >= 1000 ? "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "$" + v.toFixed(2));
const amt = (v: number) => v.toLocaleString("en-US", { maximumSignificantDigits: 6 });
const swapsTxt = (n: number) => `${n.toLocaleString("en-US")} swap${n === 1 ? "" : "s"}`;
const short = (n: string) => n.replace(" Chain", "");

function Cell({ label, v, sub }: { label: string; v?: string; sub?: string }) {
  return (
    <div className="panel pad">
      <div className="lbl">{label}</div>
      <div style={{ fontFamily: "var(--num)", fontSize: 24, marginTop: 6 }}>{v ?? <Sk w={110} />}</div>
      <p className="note" style={{ marginTop: 6, minHeight: 18 }}>{sub ?? ""}</p>
    </div>
  );
}

/** Volume through the Stoa router on every chain, from /api/stats (read from the routers' events, CDN-cached
 *  5 minutes). Refreshed every 5 minutes while the page is open. */
export default function StatsBody() {
  const q = useQuery({
    queryKey: ["router-stats"],
    queryFn: async () => {
      const r = await fetch("/api/stats");
      if (!r.ok) throw new Error(String(r.status));
      return (await r.json()) as RouterStats;
    },
    refetchInterval: 300_000, staleTime: 240_000, retry: 2,
  });
  const s = q.data;
  const per = (k: "usd24h" | "usd7d" | "usdAll") => s?.chains.map((c) => `${short(c.name)} ${usd(c[k])}`).join(" · ");
  const unpriced = s?.chains.reduce((a, c) => a + c.unpriced, 0) ?? 0;

  if (q.isError && !s) return <p className="note">Could not read the routers right now. Try again in a minute.</p>;
  return (
    <>
      <div className="grid3 sgrid" style={{ marginBottom: 16 }}>
        <Cell label="VOLUME · ALL TIME" v={s && usd(s.total.usdAll)} sub={s && `${swapsTxt(s.total.swaps)} on ${s.chains.length} chains`} />
        <Cell label="LAST 7 DAYS" v={s && usd(s.total.usd7d)} sub={per("usd7d")} />
        <Cell label="LAST 24 HOURS" v={s && usd(s.total.usd24h)} sub={per("usd24h")} />
      </div>

      <div className="panel" style={{ overflow: "hidden", marginBottom: 16 }}>
        <table className="tbl">
          <thead><tr><th>CHAIN</th><th style={{ textAlign: "right" }}>SWAPS</th><th className="hm" style={{ textAlign: "right" }}>24H</th><th className="hm" style={{ textAlign: "right" }}>7 DAYS</th><th style={{ textAlign: "right" }}>ALL TIME</th><th /></tr></thead>
          <tbody>
            {s ? s.chains.map((c) => (
              <tr key={c.key}>
                <td style={{ fontWeight: 600 }}>{c.name}{!c.ok && <span className="note"> · not answering right now</span>}</td>
                <td style={{ textAlign: "right", fontFamily: "var(--num)" }}>{c.swaps.toLocaleString("en-US")}</td>
                <td className="hm" style={{ textAlign: "right", fontFamily: "var(--num)" }}>{usd(c.usd24h)}</td>
                <td className="hm" style={{ textAlign: "right", fontFamily: "var(--num)" }}>{usd(c.usd7d)}</td>
                <td style={{ textAlign: "right", fontFamily: "var(--num)" }}>{usd(c.usdAll)}</td>
                <td style={{ textAlign: "right" }}><a href={`${c.explorer}/address/${c.router}`} target="_blank" rel="noopener noreferrer">Router</a></td>
              </tr>
            )) : <tr><td colSpan={6}><Sk w={240} /></td></tr>}
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ overflow: "hidden", marginBottom: 16 }}>
        <table className="tbl">
          <thead><tr><th>DAY (UTC)</th>{s?.chains.map((c) => <th key={c.key} style={{ textAlign: "right" }}>{short(c.name).toUpperCase()}</th>)}<th className="hm" style={{ textAlign: "right" }}>TOTAL</th></tr></thead>
          <tbody>
            {s ? s.days.map((d) => {
              const tot = Object.values(d.chains).reduce((a, x) => ({ swaps: a.swaps + x.swaps, usd: a.usd + x.usd }), { swaps: 0, usd: 0 });
              return (
                <tr key={d.date}>
                  <td style={{ fontFamily: "var(--num)" }}>{d.date}</td>
                  {s.chains.map((c) => {
                    const x = d.chains[c.key] ?? { swaps: 0, usd: 0 };
                    return <td key={c.key} style={{ textAlign: "right", fontFamily: "var(--num)" }}>{usd(x.usd)}<span className="note" style={{ display: "block", fontSize: 12 }}>{swapsTxt(x.swaps)}</span></td>;
                  })}
                  <td className="hm" style={{ textAlign: "right", fontFamily: "var(--num)" }}>{usd(tot.usd)}<span className="note" style={{ display: "block", fontSize: 12 }}>{swapsTxt(tot.swaps)}</span></td>
                </tr>
              );
            }) : <tr><td><Sk w={240} /></td></tr>}
          </tbody>
        </table>
      </div>

      <div className="grid2" style={{ marginTop: 24, alignItems: "start" }}>
        <div>
          <div className="lbl" style={{ marginBottom: 10 }}>MOST BOUGHT · LAST 24H</div>
          <div className="panel" style={{ overflow: "hidden" }}>
            <table className="tbl">
              <thead><tr><th>TOKEN</th><th style={{ textAlign: "right" }}>BUYS</th><th style={{ textAlign: "right" }}>VALUE</th></tr></thead>
              <tbody>
                {s ? (s.topBought24h?.length ? s.topBought24h.map((t) => (
                  <tr key={`${t.chain}:${t.token}`}>
                    <td><a href={`/tokens/${t.chain}/${t.token}`}>{t.symbol}</a> <span className="note hm" style={{ margin: 0 }}>{short(s.chains.find((c) => c.key === t.chain)?.name ?? t.chain)}</span></td>
                    <td style={{ textAlign: "right", fontFamily: "var(--num)" }}>{t.buys}</td>
                    <td style={{ textAlign: "right", fontFamily: "var(--num)" }}>{t.usd ? usd(t.usd) : "—"}</td>
                  </tr>
                )) : <tr><td colSpan={3} className="note">Nothing bought in the last 24 hours yet.</td></tr>) : <tr><td colSpan={3}><Sk w={200} /></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <div className="lbl" style={{ marginBottom: 10 }}>LARGEST SWAPS · LAST 24H</div>
          <div className="panel" style={{ overflow: "hidden" }}>
            <table className="tbl">
              <thead><tr><th>SOLD</th><th>BOUGHT</th><th style={{ textAlign: "right" }}>VALUE</th></tr></thead>
              <tbody>
                {s ? (s.largest24h?.length ? s.largest24h.map((x) => {
                  const c = s.chains.find((y) => y.key === x.chain);
                  return (
                    <tr key={x.hash}>
                      <td style={{ fontFamily: "var(--num)" }}>{amt(x.amountIn)} {x.symIn}</td>
                      <td style={{ fontFamily: "var(--num)" }}>{amt(x.amountOut)} {x.symOut}</td>
                      <td style={{ textAlign: "right", fontFamily: "var(--num)" }}>{c ? <a href={`${c.explorer}/tx/${x.hash}`} target="_blank" rel="noopener noreferrer">{usd(x.usd ?? 0)}</a> : usd(x.usd ?? 0)}</td>
                    </tr>
                  );
                }) : <tr><td colSpan={3} className="note">No priced swaps in the last 24 hours yet.</td></tr>) : <tr><td colSpan={3}><Sk w={200} /></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="rowx" style={{ margin: "24px 0 10px" }}>
        <div className="lbl">TOP TRADERS · THIS WEEK</div>
        <span className="note" style={{ margin: 0 }}>{s?.traders ? `from ${new Date(s.traders.weekStart * 1000).toUTCString().slice(5, 11)} UTC` : ""}</span>
      </div>
      <div className="panel" style={{ overflow: "hidden" }}>
        <table className="tbl">
          <thead><tr><th style={{ width: 36 }}>#</th><th>WALLET</th><th style={{ textAlign: "right" }}>SWAPS</th><th style={{ textAlign: "right" }}>VOLUME</th></tr></thead>
          <tbody>
            {s ? (s.traders?.list.length ? s.traders.list.map((t, i) => (
              <tr key={t.address}>
                <td style={{ fontFamily: "var(--num)", color: "var(--muted)" }}>{i + 1}</td>
                <td style={{ fontFamily: "var(--mono)", fontSize: 13 }}><a href={`/wrapped/${t.address}`}>{t.address.slice(0, 6)}…{t.address.slice(-4)}</a></td>
                <td style={{ textAlign: "right", fontFamily: "var(--num)" }}>{t.swaps}</td>
                <td style={{ textAlign: "right", fontFamily: "var(--num)" }}>{usd(t.usd)}</td>
              </tr>
            )) : <tr><td colSpan={4} className="note">No swaps this week yet.</td></tr>) : <tr><td colSpan={4}><Sk w={220} /></td></tr>}
          </tbody>
        </table>
      </div>
      <p className="note" style={{ margin: "8px 2px 0" }}>Wallets that received the output of swaps routed through Stoa, ranked by value. Resets every Monday 00:00 UTC. No prizes; just the board.</p>

      <div className="lbl" style={{ margin: "24px 0 10px" }}>LATEST SWAPS</div>
      <div className="panel" style={{ overflow: "hidden", marginBottom: 16 }}>
        <table className="tbl">
          <thead><tr><th>WHEN</th><th className="hm">CHAIN</th><th>SOLD</th><th>BOUGHT</th><th className="hm" style={{ textAlign: "right" }}>VALUE</th><th /></tr></thead>
          <tbody>
            {s ? (s.recent.length ? s.recent.map((x) => {
              const c = s.chains.find((y) => y.key === x.chain);
              return (
                <tr key={x.hash}>
                  <td>{x.time ? new Date(x.time * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                  <td className="hm">{c ? short(c.name) : x.chain}</td>
                  <td style={{ fontFamily: "var(--num)" }}>{amt(x.amountIn)} {x.symIn}</td>
                  <td style={{ fontFamily: "var(--num)" }}>{amt(x.amountOut)} {x.symOut}</td>
                  <td className="hm" style={{ textAlign: "right", fontFamily: "var(--num)" }}>{x.usd === null ? "—" : usd(x.usd)}</td>
                  <td style={{ textAlign: "right" }}>{c && <a href={`${c.explorer}/tx/${x.hash}`} target="_blank" rel="noopener noreferrer">View</a>}</td>
                </tr>
              );
            }) : <tr><td colSpan={6} className="note">No swaps yet.</td></tr>) : <tr><td colSpan={6}><Sk w={240} /></td></tr>}
          </tbody>
        </table>
      </div>

      <div className="panel pad">
        <div className="lbl">HOW THIS IS COUNTED</div>
        <ul style={{ margin: "10px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6, fontSize: 14.5, lineHeight: 1.5 }}>
          <li>The swaps come straight from the chain: every swap that settles through a Stoa router emits one <code>Routed</code> event, and a failed swap reverts and emits nothing.</li>
          <li>Each swap counts once, on one side: the stablecoin side when there is one, else the gas-token side (ETH or HYPE) at the router&apos;s current quote, else the current DexScreener price of either token.{unpriced > 0 ? ` ${swapsTxt(unpriced)} could not be priced and count as $0.` : ""}</li>
          <li>Includes every swap since launch, the team&apos;s own launch checks too. Updated every 5 minutes{s ? `; last read ${new Date(s.updated * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}` : ""}.</li>
          <li>The same numbers as JSON: <a href="/api/stats">/api/stats</a>. Router source: <a href="https://github.com/StoaDex/Stoa/blob/main/contracts/src/StoaRouter.sol" target="_blank" rel="noopener noreferrer">StoaRouter.sol</a>.</li>
        </ul>
      </div>
    </>
  );
}
