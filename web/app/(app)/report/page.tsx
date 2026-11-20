import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/ui";
import { readStateReport } from "@/lib/stateReport";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: "State of Robinhood Chain: this week",
  description: "Robinhood Chain this week from Stoa's open data: swaps through Stoa, Robinhood Stock Token prices against Robinhood's own, how deep each venue is for the same swap, and Spotlight.",
  alternates: { canonical: "/report" },
};

const usd = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(2)}`);
const pct = (v: number | null, sign = true) => (v == null ? "—" : `${sign && v > 0 ? "+" : ""}${v.toFixed(2)}%`);
const day = (iso: string) => new Date(iso).toUTCString().slice(5, 16);

export default async function ReportPage() {
  const r = await readStateReport().catch(() => null);
  if (!r) return <section className="page"><div className="notice">The data did not load. Try again in a minute.</div></section>;
  return (
    <section className="page">
      <PageHead eyebrow={`REPORT · ${day(r.from)} TO ${day(r.to)} (UTC)`} title="State of Robinhood Chain" action={<Link className="ghost" href="/open">The open data</Link>}>
        The last 7 days on Robinhood Chain, from Stoa&apos;s own data: swaps routed through Stoa, stock token prices against Robinhood&apos;s, and how deep each venue is for the same swap. Refreshed every hour.
      </PageHead>

      <div className="grid3 sgrid" style={{ marginBottom: 16 }}>
        <div className="panel pad"><div className="lbl">SWAPS THROUGH STOA</div><div style={{ fontFamily: "var(--num)", fontSize: 30, marginTop: 6 }}>{r.stoa.swaps.toLocaleString("en-US")}</div><p className="note" style={{ marginBottom: 0 }}>{usd(r.stoa.usd)} · {r.stoa.wallets} wallets</p></div>
        <div className="panel pad"><div className="lbl">STOCK TOKENS</div><div style={{ fontFamily: "var(--num)", fontSize: 30, marginTop: 6 }}>{r.stocks.tracked}</div><p className="note" style={{ marginBottom: 0 }}>{r.stocks.liquid} with $50K+ liquidity · {r.stocks.routed} routed by Stoa</p></div>
        <div className="panel pad"><div className="lbl">MEDIAN GAP VS ROBINHOOD</div><div style={{ fontFamily: "var(--num)", fontSize: 30, marginTop: 6 }}>{pct(r.stocks.medianGapNow, false)}</div><p className="note" style={{ marginBottom: 0 }}>now · {pct(r.stocks.medianGapWeek, false)} over {r.stocks.snapshots} snapshots this week</p></div>
      </div>

      <div className="grid2" style={{ marginBottom: 16 }}>
        <div className="panel pad">
          <div className="lbl">CHEAPER ON-CHAIN NOW</div>
          <ul className="list">{r.stocks.cheaper.map((x) => <li key={x.symbol}><Link href={`/stocks/${x.symbol.toLowerCase()}`}>{x.symbol}</Link><b style={{ color: "#15803d" }}>{pct(x.gap)}</b></li>)}{!r.stocks.cheaper.length && <li>None right now</li>}</ul>
        </div>
        <div className="panel pad">
          <div className="lbl">DEARER ON-CHAIN NOW</div>
          <ul className="list">{r.stocks.dearer.map((x) => <li key={x.symbol}><Link href={`/stocks/${x.symbol.toLowerCase()}`}>{x.symbol}</Link><b style={{ color: "#c2412d" }}>{pct(x.gap)}</b></li>)}{!r.stocks.dearer.length && <li>None right now</li>}</ul>
        </div>
      </div>

      {r.venues && (
        <div className="panel pad" style={{ marginBottom: 16 }}>
          <div className="rowx"><div className="lbl">ONE SWAP, EVERY VENUE · {r.venues.amountIn} {r.venues.pair}</div><span className="chip">block {Number(r.venues.block).toLocaleString("en-US")}</span></div>
          <ul className="list">{r.venues.rows.map((v) => <li key={v.venue}><span>{v.venue}</span><b>{v.out.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDG <small style={{ color: "var(--muted)", fontWeight: 400 }}>{v.vsTopPct < 0.005 ? "top" : `−${v.vsTopPct.toFixed(2)}%`}</small></b></li>)}</ul>
          <p className="note" style={{ marginBottom: 0 }}>Each venue alone, one hop, before fees, all read in the same block ({r.venues.time.replace("T", " ").replace("Z", " UTC")}). A reading, not a fill. Trade quotes your exact amount across all of them.</p>
        </div>
      )}

      <div className="grid2" style={{ marginBottom: 16 }}>
        <div className="panel pad">
          <div className="lbl">TOP PAIRS THROUGH STOA</div>
          <ul className="list">{r.stoa.topPairs.map((p) => <li key={p.pair}><span>{p.pair}</span><b>{usd(p.usd)} · {p.swaps}</b></li>)}{!r.stoa.topPairs.length && <li>No swaps this week</li>}</ul>
        </div>
        {r.spotlight && (
          <div className="panel pad">
            <div className="lbl">SPOTLIGHT</div>
            <ul className="list">
              <li><span>Week</span><b>{r.spotlight.week} · {r.spotlight.phase.replace(/_/g, " ")}</b></li>
              <li><span>$STOA locked</span><b>{Math.round(r.spotlight.stoaLocked).toLocaleString("en-US")}</b></li>
              <li><span>Bids this week</span><b>{r.spotlight.candidates}</b></li>
            </ul>
            <Link className="ghost" href="/spotlight" style={{ marginTop: 10, display: "inline-flex" }}>Spotlight</Link>
          </div>
        )}
      </div>
      <p className="note">Sources: Stoa&apos;s routers (Routed events), Robinhood&apos;s public market data and DexScreener for stock prices, venue adapters&apos; quotes. The datasets are on <a href="https://huggingface.co/StoaDex" target="_blank" rel="noopener noreferrer">Hugging Face</a>. Not financial advice.</p>
    </section>
  );
}
