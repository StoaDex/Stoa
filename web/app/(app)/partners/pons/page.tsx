import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/ui";
import CopyButton from "@/components/CopyButton";

// Partnership proposal for the Pons team. Not linked from the site; shared directly.
export const metadata: Metadata = { title: "Stoa × Pons", description: "What Stoa already does for Pons tokens, and three small ways Pons can link to it.", robots: { index: false, follow: false } };

const EX = "0x13E6993417616De724F2b337D65063f229e96718";
const LINKS: { t: string; why: string; tpl: string; ex: string }[] = [
  { t: "Safety check link", why: "Shows buyers whether a token can be sold and what tax it charges, from a simulated buy and sell. Nothing is sent.", tpl: "https://stoadex.com/check/robinhood/{token}", ex: `https://stoadex.com/check/robinhood/${EX}` },
  { t: "Safety badge (image)", why: "The same result as a small live badge, re-checked every 30 minutes, for token pages or creator profiles.", tpl: '<a href="https://stoadex.com/check/robinhood/{token}"><img src="https://stoadex.com/badge/safety/robinhood/{token}" alt="Stoa safety check" height="20"></a>', ex: `https://stoadex.com/badge/safety/robinhood/${EX}` },
  { t: "Rug Cover for creators", why: "The token's page on Stoa, where its creator can bond ETH behind a promise not to sell their own tokens; buyers who buy with cover are paid from the bond if they do.", tpl: "https://stoadex.com/launches/{token}", ex: "https://stoadex.com/cover" },
  { t: "Trade after graduation", why: "Compares the graduated Uniswap V4 pool with every other venue for the buyer's amount; curve trades still pay Pons' fee.", tpl: "https://stoadex.com/trade?chain=robinhood&buy={token}", ex: `https://stoadex.com/trade?chain=robinhood&buy=${EX}` },
];

export default function PonsPage() {
  return (
    <section className="page">
      <PageHead eyebrow="PARTNERSHIP PROPOSAL" title="Stoa × Pons">
        Stoa already trades every Pons token, on the curve and after graduation. Here is what that gives Pons today, and three small links that would make Pons launches safer to buy.
      </PageHead>

      <div className="panel pad" style={{ marginBottom: 16 }}>
        <div className="lbl">WHAT STOA ALREADY DOES FOR PONS TOKENS</div>
        <ul className="list prose">
          <li><span>Curve trades</span><b>Stoa&apos;s router buys and sells on Pons bonding curves through a dedicated adapter (live since 18 Nov 2026). Every curve trade through Stoa pays Pons&apos; 1% fee and the creator tax, as on Pons itself.</b></li>
          <li><span>After graduation</span><b>Stoa&apos;s keeper adds each new graduation pool to the router, usually within the hour.</b></li>
          <li><span>Launches</span><b><Link href="/launches">stoadex.com/launches</Link> lists live Pons curves with progress, market cap, creator tax and age, and links back to Pons.</b></li>
          <li><span>Safety check</span><b>Any Pons token can be checked for a failed sell, hidden tax or concentrated supply before buying.</b></li>
          <li><span>Rug Cover</span><b>Built for Pons: only the wallet the Pons factory records as a token&apos;s creator can open a cover for it.</b></li>
        </ul>
      </div>

      <div className="panel pad" style={{ marginBottom: 16 }}>
        <div className="lbl">WHAT WE PROPOSE · LINKS ONLY, NO CODE OR CONTRACT CHANGES</div>
        {LINKS.map((l) => (
          <div key={l.t} style={{ borderTop: "1px solid var(--line)", marginTop: 12, paddingTop: 12 }}>
            <div className="rowx"><b>{l.t}</b><a href={l.ex} target="_blank" rel="noopener noreferrer">Example →</a></div>
            <p className="note" style={{ margin: "4px 0 8px" }}>{l.why}</p>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <code style={{ flex: 1, minWidth: 0, fontSize: 12, overflowWrap: "anywhere", background: "var(--bg2, #f6f4ef)", padding: "8px 10px", borderRadius: 8 }}>{l.tpl}</code>
              <CopyButton text={l.tpl} />
            </div>
          </div>
        ))}
        <p className="note" style={{ marginBottom: 0 }}>Replace <code>{"{token}"}</code> with the token&apos;s address. All of it is free, needs no key and changes nothing on Pons&apos; side beyond a link.</p>
      </div>

      <div className="panel pad" style={{ marginBottom: 16 }}>
        <div className="lbl">WHAT STOA OFFERS IN RETURN</div>
        <ul className="list prose">
          <li><span>Co-announcement</span><b>A joint post on X, Telegram and FOMO when the links go live.</b></li>
          <li><span>Visibility</span><b>Pons named as the launchpad on Stoa&apos;s Launches page, docs and Rug Cover pages, as it is today.</b></li>
          <li><span>Data</span><b>Stoa&apos;s open data on launches and creator behavior, for Pons&apos; own analysis.</b></li>
          <li><span>Spotlight</span><b>Pons projects can bid for Stoa&apos;s weekly sponsored slots, voted by $STOA holders.</b></li>
        </ul>
      </div>

      <div className="panel pad">
        <div className="lbl">ABOUT STOA</div>
        <p style={{ marginTop: 8 }}>A swap router on Robinhood Chain: every venue compared for the exact amount, a free safety check, and Robinhood&apos;s price next to the on-chain price for stock tokens. Open source, in an independent security review by Hey Research Lab. <Link href="/press">Press kit</Link> · <Link href="/security">Security status</Link></p>
        <p className="note" style={{ marginBottom: 0 }}>Contact: <a href="https://x.com/StoaDEX" target="_blank" rel="noopener noreferrer">@StoaDEX on X</a> · <a href="https://t.me/StoaDexChat" target="_blank" rel="noopener noreferrer">Telegram</a></p>
      </div>
    </section>
  );
}
