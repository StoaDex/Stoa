import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/ui";
import { ROBINHOOD, addressUrlOn } from "@/lib/networks";
import { OLD_V4 } from "@/lib/v4guard";
import { fmtEth, KEEPER, securityStatus } from "@/lib/securityStatus";
import { securityActivity } from "@/lib/securityActivity";
import { txUrlOn } from "@/lib/networks";

const description = "Who controls each Stoa contract, what is paused, which venues the router uses, what is waiting in the timelock and which security findings are fixed. Read live from Robinhood Chain.";
export const metadata: Metadata = {
  alternates: { canonical: "/security" },
  title: "Security status",
  description,
  openGraph: { title: "Security status · Stoa", description, type: "website", siteName: "Stoa" },
  twitter: { card: "summary_large_image", site: "@StoaDex", title: "Security status · Stoa", description },
};
// read from the chain on the server, kept a minute
export const revalidate = 60;

const short = (x: string) => `${x.slice(0, 6)}…${x.slice(-4)}`;

function Badge({ tone, children }: { tone: "ok" | "wait" | "bad"; children: React.ReactNode }) {
  const s = tone === "ok" ? { background: "#E7F4EC", color: "#1F7A4D" } : tone === "wait" ? { background: "#FFF3DF", color: "#9A5B0B" } : { background: "#FDECEA", color: "#B4442E" };
  return <span style={{ ...s, padding: "3px 9px", borderRadius: 999, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{children}</span>;
}

const FINDINGS: { title: string; who: string; status: "fixed" | "rolling" | "known"; note: string; href: string }[] = [
  { title: "Limit orders: a global cap could be filled with dust orders", who: "Hey Research Lab (independent security review)", status: "fixed", note: "StoaLimitV2 has no global cap; confirmed in Hey's re-test.", href: "/docs/security-review" },
  { title: "Uniswap V4 adapter: a pair's real pool could be replaced", who: "Hey Research Lab (independent security review)", status: "fixed", note: "The router switched to UniswapV4AdapterV2, where only Stoa\u2019s keeper or the timelock registers pools, on 19 Nov 2026 through the 48h timelock. UniswapV4AdapterV3 (no eviction, pinned pools) follows through the same timelock.", href: "/docs/security-review" },
  { title: "K-1: tokens that tax transfers can arrive below the minimum", who: "Bug bounty report", status: "known", note: "No live exposure: no Stoa pool quotes today. The fix is written and tested in a new router, not yet deployed.", href: "/docs/security-review" },
  { title: "Two Stoa pools on one route charged the pool fee twice", who: "Bug bounty report", status: "known", note: "The quote already included both fees; no live route can do this today.", href: "/docs/security-review" },
  { title: "Swap form could send a stale amount to the wallet", who: "Bug bounty report", status: "fixed", note: "The form is locked while a swap is prepared, and parameters are checked right before they go to the wallet.", href: "/docs/security-review" },
];

export default async function SecurityPage() {
  // capped at 25 s so a slow RPC never fails the build (the page then shows "—" and refreshes within a minute)
  const cap = <T,>(p: Promise<T>) => Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 25_000))]);
  const [s, act] = await Promise.all([cap(securityStatus()), cap(securityActivity())]);
  const when = (t: number | null) => {
    if (!t) return "—";
    const h = (t * 1000 - Date.now()) / 3_600_000;
    const at = new Date(t * 1000).toUTCString().slice(5, 22) + " UTC";
    return h <= 0 ? `ready since ${at}` : `ready ${at} (in ${h < 1 ? `${Math.ceil(h * 60)} min` : `${Math.round(h)}h`})`;
  };
  const net = ROBINHOOD;
  return (
    <section className="page">
      <PageHead eyebrow="SECURITY · LIVE FROM ROBINHOOD CHAIN" title="Security status" action={<Link className="cta" href="/docs/bug-bounty">Report an issue</Link>}>
        Who controls each contract, what is paused, which venues the router uses and which findings are fixed. Read from the chain every minute: every line links to the explorer, so you can check it yourself.
      </PageHead>

      {!s ? <div className="notice">Robinhood Chain did not answer just now. Try again in a minute.</div> : (
        <>
          <div className="grid3 sgrid" style={{ gap: 12, marginBottom: 16 }}>
            <div className="panel pad stat"><div className="lbl">ADMIN CHANGES WAIT</div><span className="v">{s.timelockDelayH !== null ? `${s.timelockDelayH}h` : "—"}</span><div className="note" style={{ marginTop: 6 }}>Every owner action goes through a public timelock first{s.safe ? `, proposed by a ${s.safe.threshold}-of-${s.safe.owners} Safe` : ""}.</div></div>
            <div className="panel pad stat"><div className="lbl">NEW VENUES WAIT</div><span className="v">{s.routerDelayH !== null ? `+${s.routerDelayH}h` : "—"}</span><div className="note" style={{ marginTop: 6 }}>{s.setupLocked ? "The router is locked: a venue is proposed, then waits before it can be added." : "Router setup is not locked yet."}</div></div>
            <div className="panel pad stat"><div className="lbl">PAUSED CONTRACTS</div><span className="v">{s.contracts.filter((c) => c.paused).length}</span><div className="note" style={{ marginTop: 6 }}>A guardian can pause swaps in an emergency; only the timelock can unpause.</div></div>
          </div>

          <div className="panel pad" style={{ marginBottom: 16 }}>
            <div className="lbl">CONTRACTS · WHO CONTROLS THEM</div>
            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table className="tbl" style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                <thead><tr style={{ textAlign: "left", color: "var(--muted)" }}><th style={{ padding: "6px 8px" }}>Contract</th><th style={{ padding: "6px 8px" }}>Owner</th><th style={{ padding: "6px 8px" }}>State</th></tr></thead>
                <tbody>
                  {s.contracts.map((c) => (
                    <tr key={c.address} style={{ borderTop: "1px solid var(--line)" }}>
                      <td style={{ padding: "8px" }}><a href={addressUrlOn(net, c.address)} target="_blank" rel="noopener noreferrer">{c.name}</a> <span className="note">{short(c.address)}</span></td>
                      <td style={{ padding: "8px" }}>{c.owner ? <a href={addressUrlOn(net, c.owner)} target="_blank" rel="noopener noreferrer">{c.ownerLabel}</a> : c.ownerLabel}</td>
                      <td style={{ padding: "8px" }}>{c.paused === undefined ? <span className="note">no pause switch</span> : c.paused ? <Badge tone="bad">Paused</Badge> : <Badge tone="ok">Running</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid2" style={{ marginBottom: 16 }}>
            <div className="panel pad">
              <div className="lbl">VENUES THE ROUTER USES</div>
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                {s.venues.map((v) => (
                  <div key={v.address} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", fontSize: 14 }}>
                    <span><a href={addressUrlOn(net, v.address)} target="_blank" rel="noopener noreferrer">{v.address.toLowerCase() === OLD_V4 ? "Uniswap V4 (first adapter)" : v.name}</a> <span className="note">{short(v.address)}</span></span>
                    {v.live ? (v.address.toLowerCase() === OLD_V4 ? <Badge tone="wait">Being replaced</Badge> : <Badge tone="ok">Live</Badge>) : <Badge tone="wait">In the timelock</Badge>}
                  </div>
                ))}
              </div>
              <p className="note" style={{ marginTop: 12, marginBottom: 0 }}>A venue in the timelock is scheduled publicly and added only after the wait above. <Link href="/docs/admin">How admin changes work</Link></p>
            </div>
            <div className="panel pad">
              <div className="lbl">MONITORS</div>
              <div className="det" style={{ marginTop: 8 }}>
                <span>Uniswap V4 pool guard</span>
                <span>{s.v4Guard ? (s.v4Guard.ok ? <Badge tone="ok">No unexpected changes</Badge> : <Badge tone="bad">{s.v4Guard.poisoned} pair(s) avoided</Badge>) : "—"}</span>
                <span>Keeper gas balance</span>
                <span><a href={addressUrlOn(net, KEEPER)} target="_blank" rel="noopener noreferrer">{fmtEth(s.keeperEth)}</a></span>
                <span>Guardian gas balance</span>
                <span>{fmtEth(s.guardianEth)}</span>
              </div>
              <p className="note" style={{ marginTop: 12, marginBottom: 0 }}>The keeper runs the limit orders, Rug Cover, Spotlight, the weekly $STOA buyback and the Uniswap V4 pool list. A separate job checks the V4 adapters every 15 minutes and alerts the team.</p>
            </div>
          </div>
        </>
      )}

      {act && (
        <div className="grid2" style={{ marginBottom: 16 }}>
          <div className="panel pad">
            <div className="lbl">WAITING IN THE TIMELOCK</div>
            {act.pending.length === 0 ? <p className="note" style={{ marginBottom: 0 }}>Nothing is scheduled right now.</p> : (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
                {act.pending.map((o) => (
                  <div key={o.id} style={{ fontSize: 14 }}>
                    {o.calls.map((c, i) => <div key={i}><b>{c.target}</b>: {c.action}</div>)}
                    <div className="note" style={{ marginTop: 2 }}>{when(o.readyAt)} · <a href={txUrlOn(net, o.tx)} target="_blank" rel="noopener noreferrer">scheduled tx</a></div>
                  </div>
                ))}
              </div>
            )}
            {act.recent.length > 0 && (
              <>
                <div className="lbl" style={{ marginTop: 16 }}>RECENTLY EXECUTED</div>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  {act.recent.map((o) => (
                    <div key={o.id} className="note" style={{ margin: 0 }}>
                      {o.calls.map((c) => `${c.target}: ${c.action}`).join(" · ")} · <a href={txUrlOn(net, o.tx)} target="_blank" rel="noopener noreferrer">tx</a>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="panel pad">
            <div className="lbl">UNISWAP V4 POOLS · NEW ADAPTER</div>
            <div className="det" style={{ marginTop: 8 }}>
              <span>Pool keys registered</span><span>{act.totalRegistered}</span>
              <span>Removed after review</span><span>{act.unregistered}</span>
            </div>
            <div className="note" style={{ marginTop: 8 }}>
              Every removal is reviewed first; the 15-minute guard fails on any other. On 17 Nov 2026 the keeper removed
              19 empty pools that could not fill even a 0.01 ETH trade, found by the daily gas report.
            </div>
            {act.registrations.length > 0 && (
              <>
                <div className="lbl" style={{ marginTop: 14 }}>LATEST REGISTERED</div>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  {act.registrations.map((r) => (
                    <div key={r.tx + r.pair} style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                      <span>{r.pair}</span><a href={txUrlOn(net, r.tx)} target="_blank" rel="noopener noreferrer" className="note">tx</a>
                    </div>
                  ))}
                </div>
              </>
            )}
            <p className="note" style={{ marginTop: 12, marginBottom: 0 }}>Only Stoa&apos;s keeper or the timelock can register a pool key on this adapter. The keeper never removes one and never touches $STOA pools or ETH/USDG.</p>
          </div>
        </div>
      )}

      <div className="panel pad" style={{ marginBottom: 16 }}>
        <div className="lbl">FINDINGS AND WHAT HAPPENED TO THEM</div>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 14 }}>
          {FINDINGS.map((f) => (
            <div key={f.title} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ flex: "none", marginTop: 2 }}>{f.status === "fixed" ? <Badge tone="ok">Fixed</Badge> : f.status === "rolling" ? <Badge tone="wait">Fix rolling out</Badge> : <Badge tone="wait">Known, no live exposure</Badge>}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{f.title}</div>
                <div className="note" style={{ marginTop: 3 }}>{f.note} <span>Reported by {f.who}.</span> <Link href={f.href}>Details</Link></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="note">
        Stoa&apos;s contracts are open source on <a href="https://github.com/StoaDex/Stoa" target="_blank" rel="noopener noreferrer">GitHub</a> and verified on the explorer. They had an <Link href="/docs/security-review">independent security review</Link> by Hey Research Lab; this is not an audit. Found something? <Link href="/docs/bug-bounty">Report it privately</Link>: valid findings are credited here.
        {s && <> Checked {new Date(s.checkedAt).toUTCString().replace("GMT", "UTC")}.</>}
      </p>
    </section>
  );
}
