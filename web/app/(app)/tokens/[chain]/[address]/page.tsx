import type { Metadata } from "next";
import TokenTabs from "@/components/TokenTabs";
import { gloamSwapUrl } from "@/lib/gloam";
import Link from "next/link";
import { CoverChip } from "@/components/CoverPanel";
import { notFound, redirect } from "next/navigation";
import { PageHead } from "@/components/ui";
import { WatchStar } from "@/components/Watch";
import CopyButton from "@/components/CopyButton";
import RefKeeper from "@/components/RefKeeper";
import TokenShare from "@/components/TokenShare";
import SafetyPanel from "@/components/SafetyPanel";
import CmcPanel from "@/components/CmcPanel";
import { findListed, isStoa, listedTokens, priceFmt, readToken, usdFmt } from "@/lib/tokenInfo";
import { weekPrices } from "@/lib/priceHistory";
import PriceChart from "@/components/PriceChart";

// /tokens/<chain>/<address>: one listed token, its market and Stoa's best route for it right now.
// Rendered on first visit, then kept a minute.
export const revalidate = 60;
export async function generateStaticParams() { return []; }

/** a quote amount for reading: two decimals from 1 up, four significant digits below */
const short = (v: string) => {
  const n = Number(v.replace(/,/g, ""));
  if (!Number.isFinite(n)) return v;
  return n >= 1 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : n.toLocaleString("en-US", { maximumSignificantDigits: 4 });
};

type P = { params: Promise<{ chain: string; address: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { chain, address } = await params;
  const hit = findListed(chain, address);
  if (!hit) return {};
  const t = await readToken(chain, address).catch(() => null);
  const sym = hit.token.symbol, netName = hit.net.name, url = `/tokens/${hit.net.key}/${hit.token.address}`;
  const title = `Buy ${sym} on ${netName}: price, contract and safety check`;
  const price = t?.priceUsd ? `${sym} trades at ${priceFmt(t.priceUsd)}. ` : "";
  const description = `${price}Swap ${sym} on Stoa: every venue the router uses on ${netName} is compared on every swap. Contract ${hit.token.address}.`;
  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { title: `Buy ${sym} on ${netName} · Stoa`, description, type: "website", siteName: "Stoa", url },
    twitter: { card: "summary_large_image", site: "@StoaDex", title: `Buy ${sym} on ${netName} · Stoa`, description },
  };
}

export default async function TokenPage({ params }: P) {
  const { chain, address } = await params;
  if (isStoa(chain, address)) redirect("/token"); // $STOA has its own page
  const hit = findListed(chain, address);
  if (!hit) notFound();
  const t = await readToken(chain, address).catch(() => null);
  const { net, token } = hit;
  const sym = token.symbol;
  const buy = `/trade?chain=${net.key}&buy=${token.address}`;
  const sell = `/trade?chain=${net.key}&sell=${token.address}&buy=${net.gas}`;
  const others = listedTokens().filter((x) => x.net.key === net.key && x.token.address !== token.address && x.token.logo).slice(0, 12);
  const ch = t?.change24h ?? null;
  const faq: [string, string][] = [
    [`How do I buy ${sym} on ${net.name}?`, `Connect a wallet on Stoa, pick ${net.gas} or another token to pay with, enter an amount and tap Swap. Stoa quotes every venue it routes on ${net.name} for that amount and shows which one fills, what you get and your minimum before you sign.`],
    [`What is the ${sym} contract address?`, `${token.address} on ${net.name}. Anyone can create a token with any name, so compare this address with the one the project publishes before you buy.`],
    [`Is ${sym} safe to buy?`, `Stoa runs a safety check before you swap: a simulated buy and sell of ${sym} through the live router, which shows the tax on each and whether selling works, plus how concentrated its supply is. It is a check, not a guarantee: a token's owner can still change it later.`],
    [`What does a swap cost on Stoa?`, `A 2 bps (0.02%) protocol fee on the output, the venue's own pool fee and any tax the token charges, plus network gas. The quote already includes the fees.`],
  ];
  const faqLd = {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
  const gloam = net.key === "robinhood" ? gloamSwapUrl(sym) : null;
  const showSafety = token.tone === "other";
  const showMarket = net.key === "robinhood" && !/^(USDG|WETH|USDC|USDT)$/.test(sym) && token.address !== "0x0000000000000000000000000000000000000000";
  // the week's on-chain price, Robinhood Chain only (GeckoTerminal); stablecoins and ETH itself have nothing to show
  const history = showMarket ? await weekPrices("robinhood", token.address).catch(() => null) : null;
  const overview = (
    <>
      {history && <PriceChart points={history} symbol={sym} source="GeckoTerminal" />}
      <div className="panel tlist">
        <div>
          <div className="k">Contract</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
            <code style={{ fontFamily: "var(--mono)", fontSize: 13, overflowWrap: "anywhere" }}>{token.address.slice(0, 6)}…{token.address.slice(-4)}</code>
            <span style={{ display: "flex", gap: 8 }}>
              <CopyButton text={token.address} />
              <a className="cp" href={`${net.explorer}/token/${token.address}`} target="_blank" rel="noopener noreferrer">Explorer ↗</a>
            </span>
          </div>
        </div>
        {t?.launchpad === "Pons" && (
          <Link className="trow" href={`/launches/${token.address}`}>
            <span><strong>Curve, creator tax and Rug Cover</strong><small>{sym} on Launches</small></span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
          </Link>
        )}
        {gloam && (
          <a className="trow" href={gloam} target="_blank" rel="noopener noreferrer">
            <span><strong>Trade privately</strong><small>On Gloam, a separate app with its own pools</small></span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" /></svg>
          </a>
        )}
      </div>
      <div className="notice" style={{ margin: 0 }}>
        Listed because it trades on {net.name}, not reviewed by Stoa. Anyone can create a token with any name, so check the contract address before you buy.
      </div>
      {others.length > 0 && (
        <>
          <h2 className="tsec-h">More on {net.name}</h2>
          <div className="tchips">
            {others.map((o) => (
              <Link key={o.token.address} className="ghost tchip" href={`/tokens/${net.key}/${o.token.address}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {o.token.logo && <img src={o.token.logo} alt="" width={20} height={20} loading="lazy" />}{o.token.symbol}
              </Link>
            ))}
            <Link className="ghost" style={{ paddingLeft: 14 }} href="/tokens">All tokens →</Link>
          </div>
        </>
      )}
      <div className="panel pad tfaq">
        <div className="lbl">QUESTIONS</div>
        {faq.map(([q, a]) => (
          <details key={q}>
            <summary><h2>{q}</h2></summary>
            <p className="note" style={{ marginTop: 6, marginBottom: 0 }}>{a}</p>
          </details>
        ))}
      </div>
    </>
  );
  const tabs = [
    { key: "overview", label: "Overview", body: overview },
    ...(showSafety ? [{ key: "safety", label: "Safety", body: <SafetyPanel chain={net.key} token={token.address} /> }] : []),
    ...(showMarket ? [{ key: "market", label: "Market", body: <><CmcPanel token={token.address} note="context only, the price you get is Stoa's quote" /><p className="note" style={{ margin: "0 4px" }}>Price, liquidity, volume and FDV from DexScreener; the route on Stoa is read live from the router. Refreshed every minute.</p></> }] : []),
    { key: "share", label: "Share", body: <TokenShare chain={net.key} address={token.address} symbol={sym} /> },
  ];
  return (
    <section className="page">
      <RefKeeper />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <PageHead compact eyebrow={`TOKEN · ${net.name.toUpperCase()}`} title={`Buy ${sym} on Stoa`}>
        Stoa compares every venue it routes on {net.name} on every swap and fills where you get the most, for a 2 bps fee.
      </PageHead>

      <div className="grid2" style={{ alignItems: "start" }}>
        <div className="panel pad tmain">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {token.logo ? <img src={token.logo} alt="" width={48} height={48} style={{ borderRadius: 999, objectFit: "cover", background: "#EAF1FB", flex: "none" }} />
              : <span style={{ width: 48, height: 48, flex: "none", borderRadius: 999, background: "#EAF1FB", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "var(--accent)" }}>{sym.slice(0, 1)}</span>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)" }}>{sym}{net.key === "robinhood" && <CoverChip token={token.address} />}</div>
              <div className="note" style={{ marginTop: 1 }}>{t?.name && t.name !== sym ? `${t.name} · ` : ""}{net.name}{t?.launchpad ? ` · ${t.launchpad} launch` : ""}</div>
            </div>
            <WatchStar chain={net.key} address={token.address} symbol={sym} logo={token.logo} />
          </div>
          <div style={{ marginTop: 14, display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--serif)", fontSize: 40, lineHeight: 1, color: "var(--ink)" }}>{priceFmt(t?.priceUsd ?? null)}</span>
            {ch !== null && <span className="chg" style={{ color: ch >= 0 ? "#1E6B41" : "#8A2B20" }}>{ch >= 0 ? "+" : ""}{ch.toFixed(2)}% 24h</span>}
          </div>
          {t?.quote ? (
            <div className="tquote">
              <span>{t.quote.amountIn} {net.gas} → <b>{short(t.quote.amountOut)} {sym}</b></span>
              {t.quote.venues.length > 0 && <span className="via">via {t.quote.venues.join(" → ")}</span>}
            </div>
          ) : <p className="note">No route for {sym} on Stoa at this moment. Try again in a minute, or open Trade to check other amounts.</p>}
          <div className="tbtns">
            <Link className="b" href={buy}>Buy {sym}</Link>
            <Link className="s" href={sell}>Sell {sym}</Link>
          </div>
          <div className="tstats">
            <div><small>Liquidity</small><b>{usdFmt(t?.liquidityUsd ?? null)}</b></div>
            <div><small>24h volume</small><b>{usdFmt(t?.volume24h ?? null)}</b></div>
            <div><small>FDV</small><b>{usdFmt(t?.fdvUsd ?? null)}</b></div>
          </div>
        </div>

        <TokenTabs label={`${sym} details`} tabs={tabs} />
      </div>
    </section>
  );
}
