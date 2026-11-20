import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { getAddress, isAddress } from "viem";
import { SITE } from "@/lib/chain";
import { cleanRef } from "@/lib/swap";
import { findListed, priceFmt, readToken } from "@/lib/tokenInfo";
import { readLaunch, type LaunchInfo } from "@/lib/ponsLaunch";
import { EMBED_OFF } from "@/lib/embed";

// /embed/<chain>/<token>?ref=<wallet>: a small buy card any website can put in an iframe. It shows the token's price and
// Stoa's best route right now; Buy opens Stoa in a new tab with the referral, so no wallet ever connects inside the frame.
// The only route Stoa lets other sites frame (see next.config.mjs). Listed tokens and $STOA get the quote card; any
// Pons launch on Robinhood Chain (on its curve or graduated) gets a launch card with its curve progress and creator tax.

export const metadata: Metadata = { title: "Buy on Stoa", robots: { index: false, follow: false } };

type P = { params: Promise<{ chain: string; token: string }>; searchParams: Promise<{ ref?: string }> };

/** a minute per launch, like the listed tokens */
const launchCached = (a: string) =>
  unstable_cache(async () => readLaunch(getAddress(a)).catch(() => null), ["embed-launch", a.toLowerCase()], { revalidate: 60 })();


const abs = (u: string | null) => (u ? (u.startsWith("http") ? u : `${SITE}${u}`) : null);

function Foot({ unverified }: { unverified?: boolean }) {
  return (
    <div className="em-foot">
      <a href={SITE} target="_blank" rel="noopener noreferrer">Powered by <b>STOA</b></a>
      <span>{unverified ? "Unverified launch · not financial advice" : "2 bps fee · not financial advice"}</span>
    </div>
  );
}

function LaunchCard({ l, refAddr }: { l: LaunchInfo; refAddr?: string | null }) {
  const r = refAddr ? `&ref=${refAddr}` : "";
  const sym = `$${l.symbol}`;
  const logo = abs(l.logo);
  const href = l.routable
    ? `${SITE}/trade?chain=robinhood${l.tradeFrom === "USDG" ? "&sell=USDG" : ""}&buy=${l.token}${r}`
    : `${SITE}/launches/${l.token}${refAddr ? `?ref=${refAddr}` : ""}`;
  return (
    <div className="embed">
      <div className="em-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo ? <img src={logo} alt="" width={40} height={40} className="em-logo" /> : <span className="em-logo em-glyph">{l.symbol.slice(0, 1)}</span>}
        <div className="em-id">
          <b>{sym}</b>
          <span>Pons launch · Robinhood Chain</span>
        </div>
        <div className="em-px">
          <b>{priceFmt(l.priceUsd)}</b>
          <span>tax {(l.creatorTaxBps / 100).toFixed(1)}%</span>
        </div>
      </div>
      <div className="em-q">
        {l.graduated
          ? <>Graduated to Uniswap V4<small>{l.routable ? "Stoa routes it now: every venue compared for your amount." : "Open Stoa to see the pool and its route."}</small></>
          : <><b>{l.progress.toFixed(1)}%</b> of the way to graduation<small>{(+l.raised).toFixed(2)} of {(+l.threshold).toFixed(1)} {l.pairSymbol} on its Pons curve. Stoa trades it on the curve.</small></>}
      </div>
      <a className="em-buy" href={href} target="_blank" rel="noopener noreferrer">{l.routable ? `Buy ${sym} on Stoa ↗` : `View ${sym} on Stoa ↗`}</a>
      <Foot unverified />
    </div>
  );
}

export default async function Embed({ params, searchParams }: P) {
  const [{ chain, token }, sp] = await Promise.all([params, searchParams]);
  const ref = cleanRef(sp.ref);
  if (EMBED_OFF.has(token.toLowerCase())) {
    return (
      <div className="embed">
        <div className="em-q">This buy card is no longer available.<small>Check any token on stoadex.com/check before you buy.</small></div>
        <Foot />
      </div>
    );
  }
  const hit = findListed(chain, token);
  if (!hit) {
    if (chain !== "robinhood" || !isAddress(token, { strict: false })) notFound();
    const l = await launchCached(token);
    if (!l) notFound();
    return <LaunchCard l={l} refAddr={ref} />;
  }
  const t = await readToken(chain, token).catch(() => null);
  const sym = hit.token.symbol;
  const buy = `${SITE}/trade?chain=${hit.net.key}&buy=${hit.token.address}${ref ? `&ref=${ref}` : ""}`;
  const ch = t?.change24h ?? null;
  const logo = hit.token.logo ? (hit.token.logo.startsWith("http") ? hit.token.logo : `${SITE}${hit.token.logo}`) : null;
  return (
    <div className="embed">
      <div className="em-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo ? <img src={logo} alt="" width={40} height={40} className="em-logo" /> : <span className="em-logo em-glyph">{sym.slice(0, 1)}</span>}
        <div className="em-id">
          <b>{sym}</b>
          <span>{hit.net.name}</span>
        </div>
        <div className="em-px">
          <b>{priceFmt(t?.priceUsd ?? null)}</b>
          {ch !== null && <span className={ch >= 0 ? "up" : "down"}>{ch >= 0 ? "+" : ""}{ch.toFixed(2)}%</span>}
        </div>
      </div>
      <div className="em-q">
        {t?.quote
          ? <>{t.quote.amountIn} {hit.net.gas} → <b>{t.quote.amountOut} {sym}</b><small>every venue Stoa routes on {hit.net.name}, compared{t.quote.venues.length ? `, now on ${t.quote.venues.join(" → ")}` : ""}</small></>
          : <>Every route compared on {hit.net.name}<small>Open Stoa to get a live quote for any amount.</small></>}
      </div>
      <a className="em-buy" href={buy} target="_blank" rel="noopener noreferrer">Buy {sym} on Stoa ↗</a>
      <Foot />
    </div>
  );
}
