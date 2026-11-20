import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/ui";
import Stocks, { MarketStatus, type StockRow } from "@/components/Stocks";
import { session } from "@/lib/marketHours";
import { mid, stockTokens } from "@/lib/stocks";
import { earningsWeek, whenTxt } from "@/lib/earnings";

export const revalidate = 60;

const description = "Every Robinhood Stock Token on Robinhood Chain (TSLA, NVDA, AAPL, SPY and more): Robinhood's price next to the on-chain price, pool liquidity, US market status, and a swap on Stoa.";
export const metadata: Metadata = {
  alternates: { canonical: "/stocks" },
  title: "Stock tokens on Robinhood Chain",
  description,
  openGraph: { title: "Stock tokens on Robinhood Chain · Stoa", description, type: "website", siteName: "Stoa" },
  twitter: { card: "summary_large_image", site: "@StoaDex", title: "Stock tokens on Robinhood Chain · Stoa", description },
};

export default async function StocksPage() {
  const data = await stockTokens().catch(() => null);
  const week = data ? await earningsWeek(data.stocks.filter((s) => s.route).map((s) => s.symbol)) : [];
  const rows: StockRow[] = (data?.stocks ?? []).map((s) => ({ symbol: s.symbol, name: s.name, address: s.address, logo: s.logo, ref: mid(s), halted: s.halted, dex: s.dex, route: s.route, metric: s.metric }));
  const ld = {
    "@context": "https://schema.org", "@type": "ItemList", name: "Stock tokens on Robinhood Chain",
    itemListElement: rows.filter((r) => r.route).slice(0, 50).map((r, i) => ({ "@type": "ListItem", position: i + 1, name: `${r.symbol} · ${r.name}`, url: `https://stoadex.com/trade?chain=robinhood&buy=${r.address}` })),
  };
  return (
    <section className="page">
      <PageHead eyebrow="STOCK TOKENS · ROBINHOOD CHAIN" title="Tokenized stocks, on-chain" action={<MarketStatus initial={session()} />}>
        {rows.length ? `${rows.length} Robinhood Stock Tokens, ${rows.filter((r) => r.route).length} of them swappable on Stoa right now,` : "Robinhood Stock Tokens,"} each with Robinhood&apos;s own price next to what it trades for on-chain. Follow the ones you care about with ☆ and set a price alert.
      </PageHead>
      {week.length > 0 && (
        <div className="panel pad" style={{ marginBottom: 16 }}>
          <div className="lbl">EARNINGS IN THE NEXT 7 DAYS</div>
          <ul className="list">
            {week.slice(0, 8).map((w) => <li key={w.symbol}><Link href={`/stocks/${w.symbol.toLowerCase()}`}>{w.symbol}</Link><b>{whenTxt(w.report)}{w.report.verified ? "" : " (expected)"}</b></li>)}
          </ul>
          <p className="note" style={{ marginBottom: 0 }}>Stock tokens Stoa routes. Prices often move most around a report. Dates from Robinhood&apos;s market data.</p>
        </div>
      )}
      {data ? <Stocks rows={rows} updated={data.updated} /> : (
        <div className="panel pad"><p style={{ margin: 0 }}>Robinhood&apos;s stock token list did not load just now. Try again in a minute, or go to <Link href="/trade?chain=robinhood">Trade</Link>.</p></div>
      )}
      <p className="note" style={{ marginTop: 16 }}>
        Stock Tokens are issued by Robinhood Assets (Jersey) Limited, not by Stoa, and are not offered in every country: check Robinhood&apos;s terms for yours.
        Stoa only routes swaps between tokens; it does not hold, issue or price them. Nothing here is investment advice.
        Data: Robinhood&apos;s public Stock Token API and DexScreener.
      </p>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
    </section>
  );
}
