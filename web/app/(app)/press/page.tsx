import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/ui";
import CopyButton from "@/components/CopyButton";
import { stockTokens } from "@/lib/stocks";
import { readLocked, readSupply } from "@/lib/stoaSupply";

const description = "Stoa press kit: what Stoa is, key facts, a short and a long description, logos, screenshots and how to reach the team.";
export const metadata: Metadata = {
  title: "Press kit",
  description,
  alternates: { canonical: "/press" },
  openGraph: { title: "Press kit · Stoa", description, type: "website", siteName: "Stoa" },
  twitter: { card: "summary_large_image", site: "@StoaDex", title: "Press kit · Stoa", description },
};
export const revalidate = 3600;

const SHORT = "Stoa is a swap router on Robinhood Chain that compares every venue it routes for your exact amount, shows Robinhood's own price next to the on-chain price for every Robinhood Stock Token, and checks a token can be sold before you buy it.";
const LONG = "Stoa (stoadex.com) is a swap router on Robinhood Chain and Elysium. Each swap is compared across every venue the router uses, including Uniswap V2, V3 and V4, Aero, Ramses, Metric and the Pons launch curves, and filled on the one that returns the most for the exact amount, for a 2 basis-point fee. For Robinhood Stock Tokens, Stoa shows Robinhood's own price next to the on-chain price, the gap between them, earnings dates and limit orders at Robinhood's price. A free safety check simulates a buy and a sell of any token before you trade. Stoa's contracts are open source and in an independent security review by Hey Research Lab, its code is mirrored and signed on Twigpine, and its on-chain data is published as open datasets on Hugging Face. The $STOA token is used for Spotlight, where projects bid ETH for sponsored slots and $STOA holders vote and share the bids, and protocol fees buy back and burn $STOA every week.";

const TIMELINE: [string, string][] = [
  ["12 Nov 2026", "Stoa live on Elysium"],
  ["14 Nov 2026", "First swaps through Stoa's router on Robinhood Chain; $STOA launched"],
  ["16 Nov 2026", "Independent security review by Hey Research Lab begins"],
  ["20 Nov 2026", "Open datasets on Hugging Face; code mirrored and signed on Twigpine"],
  ["23 Nov 2026", "Spotlight week 1, Points season 1 and the first weekly $STOA buyback"],
];

const SHOTS: [string, string][] = [
  ["stoa-trade-phone.jpg", "Trade on a phone: every venue compared for the amount"],
  ["stoa-stocks-desktop.jpg", "Stock tokens: Robinhood's price next to the on-chain price"],
  ["stoa-stocks-phone.jpg", "Stock tokens on a phone"],
  ["stoa-check-phone.jpg", "Safety check: a simulated buy and sell"],
  ["stoa-spotlight-phone.jpg", "Spotlight: sponsored slots voted by $STOA holders"],
];

const m = (v: bigint) => `${(Number(v) / 1e24).toFixed(2)}M`;

async function facts() {
  const [st, sup, lk] = await Promise.all([
    stockTokens().catch(() => null),
    readSupply().catch(() => null),
    readLocked().catch(() => null),
  ]);
  return {
    stocks: st ? { all: st.stocks.length, route: st.stocks.filter((s) => s.route).length } : null,
    burned: sup ? m(sup.burned) : null,
    locked: lk ? m(lk.total) : null,
  };
}

export default async function PressPage() {
  const f = await facts();
  const FACTS: [string, React.ReactNode][] = [
    ["What", "Swap router (DEX aggregator) with stock token tools"],
    ["Networks", "Robinhood Chain (chain 4663) and Elysium"],
    ["Venues compared", "Uniswap V2, V3 and V4, Aero, Ramses, Metric, Pons curves, up."],
    ["Fee", "2 basis points per swap"],
    ["Stock tokens", f.stocks ? `${f.stocks.all} Robinhood Stock Tokens listed, ${f.stocks.route} swappable on Stoa today` : "Every Robinhood Stock Token, with Robinhood's price next to the on-chain price"],
    ["Security", <>Independent security review by Hey Research Lab; <Link href="/security">security status</Link></>],
    ["Open", <>Source on <a href="https://github.com/StoaDex/Stoa" target="_blank" rel="noopener noreferrer">GitHub</a>, signed mirror on Twigpine, datasets on <a href="https://huggingface.co/StoaDex" target="_blank" rel="noopener noreferrer">Hugging Face</a></>],
    ["Token", <>$STOA on Robinhood Chain, <code style={{ overflowWrap: "anywhere" }}>0x13E6993417616De724F2b337D65063f229e96718</code>{f.burned ? ` · ${f.burned} burned` : ""}{f.locked ? ` · ${f.locked} locked in Stoa` : ""}</>],
    ["Live numbers", <><Link href="/stats">Stats</Link> · <Link href="/report">State of Robinhood Chain</Link> · <Link href="/token">$STOA</Link></>],
  ];
  return (
    <section className="page">
      <PageHead eyebrow="PRESS KIT" title="Writing about Stoa?">
        Everything you need in one place: what Stoa is, the facts, logos and screenshots. Free to use when writing about Stoa.
      </PageHead>

      <div className="panel pad" style={{ marginBottom: 16 }}>
        <div className="rowx"><div className="lbl">IN ONE SENTENCE</div><CopyButton text={SHORT} /></div>
        <p style={{ marginBottom: 0, marginTop: 8 }}>{SHORT}</p>
      </div>

      <div className="panel pad" style={{ marginBottom: 16 }}>
        <div className="rowx"><div className="lbl">ABOUT STOA · LONGER</div><CopyButton text={LONG} /></div>
        <p style={{ marginBottom: 0, marginTop: 8 }}>{LONG}</p>
      </div>

      <div className="panel pad" style={{ marginBottom: 16 }}>
        <div className="lbl">FACTS</div>
        <ul className="list prose">{FACTS.map(([k, v]) => <li key={k}><span>{k}</span><b>{v}</b></li>)}</ul>
      </div>

      <div className="panel pad" style={{ marginBottom: 16 }}>
        <div className="lbl">TIMELINE</div>
        <ul className="list">{TIMELINE.map(([d, t]) => <li key={d}><span>{t}</span><b style={{ whiteSpace: "nowrap" }}>{d}</b></li>)}</ul>
      </div>

      <div className="panel pad" style={{ marginBottom: 16 }}>
        <div className="lbl">LOGOS</div>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/press/stoa-logo.png" alt="Stoa logo" width={72} height={72} style={{ borderRadius: 16 }} />
          <div className="note" style={{ margin: 0 }}>
            <a href="/press/stoa-logo.png" download>Logo, 256 px PNG</a> · <a href="/press/stoa-logo-200.png" download>Logo, 200 px PNG</a><br />
            Write it as <b>Stoa</b>; the token is <b>$STOA</b>. Please do not change the mark&apos;s colors or shape.
          </div>
        </div>
      </div>

      <div className="panel pad" style={{ marginBottom: 16 }}>
        <div className="lbl">SCREENSHOTS</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 12, marginTop: 10 }}>
          {SHOTS.map(([file, cap]) => (
            <a key={file} href={`/press/${file}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/press/${file}`} alt={cap} loading="lazy" style={{ width: "100%", height: 220, objectFit: "cover", objectPosition: "top", borderRadius: 12, border: "1px solid var(--line)" }} />
              <small className="note" style={{ display: "block", margin: "6px 0 0" }}>{cap}</small>
            </a>
          ))}
        </div>
      </div>

      <div className="panel pad">
        <div className="lbl">CONTACT</div>
        <p style={{ marginTop: 8 }}>For interviews, questions or a quote: send a direct message to <a href="https://x.com/StoaDEX" target="_blank" rel="noopener noreferrer">@StoaDEX on X</a>, or write in <a href="https://t.me/StoaDexChat" target="_blank" rel="noopener noreferrer">Telegram</a>.</p>
        <p className="note" style={{ marginBottom: 0 }}>Stoa is not affiliated with Robinhood Markets, Inc. Robinhood Stock Tokens are issued by Robinhood Assets (Jersey) Limited and are not offered in every country. Nothing on this page is investment advice.</p>
      </div>
    </section>
  );
}
