import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/ui";
import SpotlightBanner from "@/components/SpotlightBanner";

const description = "Bid ETH for one of three sponsored slots on Stoa for a week: the top of Trade's token list on Robinhood Chain, Launches and Tokens. Lose, and your bid comes back in full.";
export const metadata: Metadata = {
  alternates: { canonical: "/spotlight/projects" },
  title: "Spotlight for projects",
  description,
  openGraph: { title: "Spotlight for projects · Stoa", description, type: "website", siteName: "Stoa" },
  twitter: { card: "summary_large_image", site: "@StoaDex", title: "Spotlight for projects · Stoa", description },
};

const STEPS: [string, string, string][] = [
  ["1", "Check your token", "It has to be buyable and sellable on Stoa on Robinhood Chain. Run the safety check: a winner that fails it is not shown."],
  ["2", "Bid ETH, Monday to Saturday", "Bids open Monday 00:00 UTC and close Saturday 00:00 UTC. The first bid for a token is at least 0.01 ETH plus a small entry fee. Anyone can add to it."],
  ["3", "Get votes", "A token needs at least 1M $STOA of votes to win. $STOA holders lock and vote until Monday 00:00 UTC. Tell your community."],
  ["4", "Win a slot for a week", "The three largest bids that reach the votes win and show for the next week, marked Sponsored. Lose, and take your bid back in full."],
];

const WHERE: [string, string][] = [
  ["Trade", "The top of the token list on Robinhood Chain, where every swap starts"],
  ["Launches", "Above the live Pons launches"],
  ["Tokens", "Above every Robinhood Chain token Stoa lists"],
];

const FAQ: [string, string][] = [
  ["What does it cost?", "Your bid, from 0.01 ETH, plus an entry fee of 0.001 ETH for the first 20 tokens of a week (it rises by 0.001 ETH every 20 tokens). Beta cap: 0.5 ETH per token per week."],
  ["Where does my ETH go if I win?", "90% goes to the $STOA holders who voted for your token, pro rata to their votes. 10% buys $STOA and burns it. The entry fee is burned too."],
  ["And if I lose?", "Once the week is settled (anyone can settle it from Monday 00:00 UTC), your bid is refundable in full from the Spotlight page, and the refund never expires. Only the entry fee stays (it is burned)."],
  ["Is my project reviewed?", "No. Slots are sponsored and say so. The guardian can cancel a scam or a honeypot until Saturday 00:00 UTC; a canceled bid is refunded in full."],
  ["Can my community help?", "Yes. Anyone can add ETH to your token's bid, and anyone who holds $STOA can lock it and vote for you. Voters share the winning bid, so votes and bids go together."],
  ["Who controls the money?", "Only the contract. It has no function that sends ETH or $STOA anywhere except back to the bidder, to voters or to the burn. It is source-verified, reviewed internally, not externally audited."],
];

export default function SpotlightProjects() {
  return (
    <section className="page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org", "@type": "FAQPage",
        mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
      }) }} />
      <PageHead eyebrow="SPOTLIGHT · FOR PROJECTS" title="Put your token in front of every Stoa trader" action={<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Link className="cta" href="/spotlight#bid">Bid for a slot</Link><Link className="ghost" href="/check">Check your token</Link></div>}>
        Three sponsored slots a week on Robinhood Chain. Bid ETH, get $STOA holders to vote, and win a week at the top of Stoa. Lose, and your bid comes back.
      </PageHead>
      <SpotlightBanner />

      <div className="grid3" style={{ marginBottom: 16 }}>
        {WHERE.map(([t, d]) => (
          <div key={t} className="panel pad"><div className="lbl">SHOWN ON {t.toUpperCase()}</div><p style={{ marginTop: 8 }}>{d}.</p></div>
        ))}
      </div>

      <div className="panel pad" style={{ marginBottom: 16 }}>
        <div className="lbl">HOW IT WORKS</div>
        <ol className="steps">
          {STEPS.map(([n, t, d]) => (
            <li key={n}><span className="sn">{n}</span><div><b>{t}</b><p>{d}</p></div></li>
          ))}
        </ol>
      </div>

      <div className="panel pad" style={{ marginBottom: 16 }}>
        <div className="lbl">THE NUMBERS</div>
        <ul className="list">
          <li>Slots <b>3 a week</b></li>
          <li>Bids <b>Mon 00:00 to Sat 00:00 UTC</b></li>
          <li>Votes needed <b>1,000,000 $STOA</b></li>
          <li>Minimum first bid <b>0.01 ETH</b></li>
          <li>Entry fee <b>0.001 ETH, burned</b></li>
          <li>Losing bids <b>Refunded in full</b></li>
          <li>Winning bids <b>90% to voters, 10% buys and burns $STOA</b></li>
        </ul>
      </div>

      <div className="panel pad" style={{ marginBottom: 16 }}>
        <div className="lbl">QUESTIONS</div>
        <div className="faq">
          {FAQ.map(([q, a]) => (
            <details key={q}><summary>{q}</summary><p>{a}</p></details>
          ))}
        </div>
      </div>

      <div className="btns">
        <Link className="cta" href="/spotlight#bid">Bid for a slot</Link>
        <Link className="ghost" href="/docs/spotlight">Full rules and risks</Link>
      </div>
      <p className="note" style={{ marginTop: 12 }}>Parameters can change only through the 48-hour timelock and apply from the following week. Payouts to voters depend only on what projects bid; nothing is promised.</p>
    </section>
  );
}
