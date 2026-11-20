import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHead, Ticker } from "@/components/ui";
import { MarketStatus } from "@/components/Stocks";
import { WatchStar } from "@/components/Watch";
import CopyButton from "@/components/CopyButton";
import { mid, shortName, stockBySymbol } from "@/lib/stocks";
import { ROBINHOOD, addressUrlOn } from "@/lib/networks";
import { weekPrices } from "@/lib/priceHistory";
import PriceChart from "@/components/PriceChart";
import { earningsFor, whenTxt } from "@/lib/earnings";
import { gapHistory } from "@/lib/gapHistory";
import GapChart from "@/components/GapChart";
import StockAnyChainBuy from "@/components/StockAnyChainBuy";

export const revalidate = 120;

const fmtUsd = (v: number) => (v >= 1 ? "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "$" + v.toPrecision(3));
const usd0 = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`);

export async function generateMetadata({ params }: { params: Promise<{ symbol: string }> }): Promise<Metadata> {
  const { symbol } = await params;
  const hit = await stockBySymbol(symbol).catch(() => null);
  if (!hit) return { title: "Stock token" };
  const { stock: s } = hit;
  const name = shortName(s.name);
  // routed stocks answer "how to buy" searches; the rest stay a price page
  const title = s.route ? `How to buy ${name} (${s.symbol}) on Robinhood Chain` : `${name} (${s.symbol}) stock token price on Robinhood Chain`;
  const description = s.route
    ? `Buy the ${name} (${s.symbol}) stock token on Robinhood Chain in one swap: USDG or ETH to ${s.symbol} on Stoa, with Robinhood's ${s.symbol} price next to the on-chain price, liquidity and the steps.`
    : `${name} (${s.symbol}) tokenized stock on Robinhood Chain: Robinhood's ${s.symbol} price next to the on-chain price, 24h volume and pool liquidity, updated every few minutes. See where it trades on-chain.`;
  return {
    title, description,
    alternates: { canonical: `/stocks/${s.symbol.toLowerCase()}` },
    openGraph: { title: `${title} · Stoa`, description, type: "website", siteName: "Stoa" },
    twitter: { card: "summary_large_image", site: "@StoaDex", title: `${title} · Stoa`, description },
  };
}

export default async function StockPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const hit = await stockBySymbol(symbol).catch(() => null);
  if (!hit) notFound();
  const { stock: s, all, updated } = hit;
  const ref = mid(s);
  const diff = ref && s.dex ? ((s.dex.priceUsd - ref) / ref) * 100 : null;
  const swap = `/trade?chain=robinhood&sell=USDG&buy=${s.address}`;
  const more = all.filter((x) => x.route && x.address !== s.address).slice(0, 12);
  const [history, earn, gaps] = await Promise.all([s.dex ? weekPrices("robinhood", s.address) : Promise.resolve(null), earningsFor(s.symbol), s.dex ? gapHistory(s.address).catch(() => []) : Promise.resolve([])]);
  const cell = (label: string, v: React.ReactNode, sub?: React.ReactNode) => (
    <div className="panel pad"><div className="lbl">{label}</div><div style={{ fontFamily: "var(--num)", fontSize: 24, marginTop: 6 }}>{v}</div>{sub && <div className="note" style={{ marginTop: 4 }}>{sub}</div>}</div>
  );
  const ld = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Stocks", item: "https://stoadex.com/stocks" },
      { "@type": "ListItem", position: 2, name: `${s.symbol} · ${s.name}`, item: `https://stoadex.com/stocks/${s.symbol.toLowerCase()}` },
    ],
  };
  const steps = [
    ["Have USDG or ETH on Robinhood Chain", `Hold USDG (or ETH for the swap and gas) in a wallet such as MetaMask, Rabby or OKX Wallet, on Robinhood Chain.`],
    [`Open the ${s.symbol} swap on Stoa`, `Swap ${s.symbol} opens Trade with USDG to sell and ${s.symbol} to buy. Check the token address matches ${s.address}.`],
    ["Enter an amount and read the quote", `Stoa compares every venue it routes for your exact amount and shows the rate, the venue, the 2 bps fee, price impact and the minimum you receive.`],
    ["Confirm in your wallet", `Approve USDG once if asked, then confirm the swap. ${s.symbol} arrives in the same wallet.`],
  ] as const;
  const faq: [string, string][] = [
    [`What is ${s.symbol} on Robinhood Chain?`, `A Robinhood Stock Token: an ERC-20 on Robinhood Chain, issued by Robinhood Assets (Jersey) Limited, that tracks ${s.name}. It is held in your own wallet and can be swapped on-chain like any other token.`],
    [`Why is the on-chain price different from Robinhood's price?`, `Robinhood's price follows the underlying shares. The on-chain price is whatever the token last traded for in its pool, so it drifts when the pool is thin or when the US market is closed and the shares are not trading.${diff != null ? ` Right now the gap is ${diff >= 0 ? "+" : ""}${diff.toFixed(2)}%.` : ""}`],
    [`Can I swap ${s.symbol} when the US market is closed?`, s.route ? `Yes. The pool trades at any hour, every day. Outside market hours there is no fresh share price behind it, so check the gap to Robinhood's last price before you swap.` : `Its pool trades at any hour, but Stoa has no route to it yet; the route is checked every day.`],
    [`What does a swap on Stoa cost?`, `A 2 bps (0.02%) protocol fee, already counted in the quote, plus Robinhood Chain gas, usually a few cents of ETH. The quote shows the venue, the price impact and the minimum you receive before you confirm.`],
  ];
  const faqLd = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) };
  const howTo = {
    "@context": "https://schema.org", "@type": "HowTo", name: `How to buy ${s.name} (${s.symbol}) on Robinhood Chain`,
    step: steps.map(([n, t], i) => ({ "@type": "HowToStep", position: i + 1, name: n, text: t })),
  };
  return (
    <section className="page">
      <p className="note" style={{ margin: "0 0 8px" }}><Link href="/stocks">← All stock tokens</Link></p>
      <PageHead eyebrow="STOCK TOKEN · ROBINHOOD CHAIN" title={`${s.name} (${s.symbol})`}
        action={<div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}><MarketStatus /><WatchStar chain="robinhood" address={s.address} symbol={s.symbol} logo={s.logo ?? undefined} via="USDG" label />{s.route ? <Link className="cta" href={swap}>Swap {s.symbol}</Link> : null}</div>}>
        {s.name} as a Robinhood Stock Token on Robinhood Chain. {s.route ? `Stoa routes it: Trade opens with USDG to sell and ${s.symbol} to buy.` : "Stoa has no route to it yet; its pools are checked every day."}
      </PageHead>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {s.logo ? <img src={s.logo} alt="" width={56} height={56} style={{ borderRadius: 999 }} /> : <Ticker symbol={s.symbol} size={56} />}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 13 }} title={s.address}>{s.address.slice(0, 8)}…{s.address.slice(-6)}</span>
          <span style={{ display: "flex", gap: 8 }}><CopyButton text={s.address} label="Copy address" /><a className="ghost" href={addressUrlOn(ROBINHOOD, s.address)} target="_blank" rel="noopener noreferrer">Explorer</a></span>
        </div>
      </div>
      <div className="grid3 sgrid" style={{ marginBottom: 16 }}>
        {cell("ROBINHOOD PRICE", s.halted ? "Halted" : ref ? fmtUsd(ref) : "—", "Mid of Robinhood's bid and ask for one token")}
        {cell("ON-CHAIN PRICE", s.dex ? fmtUsd(s.dex.priceUsd) : "No pool yet", diff != null ? `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}% from Robinhood's price` : undefined)}
        {cell("ON-CHAIN LIQUIDITY", s.dex ? usd0(s.dex.liquidityUsd) : "—", s.dex ? `24h volume ${usd0(s.dex.volume24h)}` : undefined)}
      </div>
      {(() => {
        // a report today or tomorrow (UTC): say so at the top, since prices often move most around it
        const n = earn.next;
        if (!n) return null;
        const today = new Date().toISOString().slice(0, 10), tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
        if (n.date !== today && n.date !== tomorrow) return null;
        return (
          <div className="notice" style={{ marginBottom: 16 }}>
            <b>{s.symbol} reports earnings {n.date === today ? "today" : "tomorrow"}</b>{n.timing === "pm" ? ", after the US market closes (about 21:00 UTC)" : n.timing === "am" ? ", before the US market opens (about 12:00 UTC)" : ""}{n.verified ? "" : " (date not yet confirmed)"}.
            {" "}Prices often move most around a report. On-chain {s.symbol} trades around the clock, while Robinhood&apos;s price follows extended and overnight sessions, so the gap below can widen. Not financial advice.
          </div>
        );
      })()}
      {history && <PriceChart points={history} symbol={s.symbol} source="GeckoTerminal" stock />}
      {s.dex && <GapChart points={gaps} symbol={s.symbol} />}
      {(earn.next || earn.last) && (
        <div className="panel pad" style={{ marginBottom: 16 }}>
          <div className="lbl">{shortName(s.name).toUpperCase()} EARNINGS</div>
          <ul className="list">
            {earn.next && <li><span>Next report{earn.next.verified ? "" : " (expected)"}</span><b>{whenTxt(earn.next)}</b></li>}
            {earn.next?.estimate != null && <li><span>EPS estimate</span><b>${earn.next.estimate.toFixed(2)}</b></li>}
            {earn.last && <li><span>Last report · Q{earn.last.quarter} {earn.last.year}</span><b>EPS ${earn.last.actual!.toFixed(2)}{earn.last.estimate != null ? ` vs $${earn.last.estimate.toFixed(2)} expected` : ""}</b></li>}
          </ul>
          <p className="note" style={{ marginBottom: 0 }}>Prices often move most around a report. The token trades on-chain at any hour, the shares don&apos;t: check the gap to Robinhood&apos;s price before you swap. Dates from Robinhood&apos;s market data; not investment advice.</p>
        </div>
      )}
      <details className="panel pad fold-panel" style={{ marginBottom: 16 }}>
        <summary className="lbl">HOW THIS WORKS</summary>
        <p style={{ marginTop: 8 }}>
          {s.symbol} on Robinhood Chain is a Robinhood Stock Token: an ERC-20 issued by Robinhood Assets (Jersey) Limited that tracks {s.name}. Robinhood&apos;s price follows the underlying shares while the US market, extended hours or the overnight session is open; the on-chain price is what the token trades for in its deepest pool, at any hour.
        </p>
        <p className="note" style={{ marginBottom: 0 }}>
          Stock Tokens are not offered in every country: check Robinhood&apos;s terms for yours. Stoa only routes swaps; nothing here is investment advice. <Link href="/docs/stocks">How Stocks works</Link> · <Link href="/docs/stock-token-price-gap">Why the prices differ</Link> · Updated {new Date(updated).toUTCString().slice(17, 22)} UTC.
        </p>
      </details>
      {s.route && !s.halted && <StockAnyChainBuy stock={s.address as `0x${string}`} symbol={s.symbol} />}
      {s.route && (
        <div className="panel pad" style={{ marginBottom: 16 }}>
          <div className="lbl">HOW TO BUY {s.symbol} ON ROBINHOOD CHAIN</div>
          <ol style={{ margin: "10px 0 0", paddingLeft: 22, display: "grid", gap: 10, lineHeight: 1.5, overflowWrap: "anywhere" }}>
            {steps.map(([n, t]) => <li key={n}><b>{n}.</b> {t}</li>)}
          </ol>
          <p style={{ marginTop: 12, marginBottom: 0, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link className="cta" href={swap}>Swap USDG to {s.symbol}</Link>
            <Link className="ghost" href={`${swap}&amount=50&mode=limit&dip=5`}>Buy if 5% cheaper</Link>
            <Link className="ghost" href={`${swap}&amount=50&mode=limit&dip=10`}>Buy if 10% cheaper</Link>
          </p>
          <p className="note" style={{ marginBottom: 0 }}>The two limit buttons open a limit order priced 5% or 10% below the on-chain price now. Your USDG waits in Stoa&apos;s limit order contract and fills only if the pool trades there; cancel any time. <Link href="/docs/limit-orders">How limit orders work</Link></p>
        </div>
      )}
      <div className="panel pad" style={{ marginBottom: 16 }}>
        <div className="lbl">{s.symbol} QUESTIONS</div>
        <ul className="list prose">
          {faq.map(([q, a]) => <li key={q}><span>{q}</span><b>{a}</b></li>)}
        </ul>
      </div>
      {more.length > 0 && (
        <div className="panel pad">
          <div className="lbl">OTHER STOCK TOKENS ON STOA</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {more.map((m) => <Link key={m.address} className="ghost" href={`/stocks/${m.symbol.toLowerCase()}`}>{m.symbol}</Link>)}
          </div>
        </div>
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      {s.route && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(howTo).replace(/</g, "\\u003c") }} />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd).replace(/</g, "\\u003c") }} />
    </section>
  );
}
