import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/ui";
import CheckForm from "@/components/CheckForm";

const description = "Free token safety check for Robinhood Chain: paste a token address and Stoa simulates a buy and a sell-back through its live router, showing failed sells, hidden taxes, the round-trip cost and who holds the supply. Nothing is sent.";
export const metadata: Metadata = {
  title: "Token safety check for Robinhood Chain",
  description,
  alternates: { canonical: "/check" },
  openGraph: { title: "Token safety check for Robinhood Chain · Stoa", description, type: "website", siteName: "Stoa", url: "/check" },
  twitter: { card: "summary_large_image", site: "@StoaDex", title: "Token safety check for Robinhood Chain · Stoa", description },
};

export default function CheckPage() {
  return (
    <section className="page" style={{ maxWidth: 760 }}>
      <PageHead eyebrow="SAFETY CHECK · FREE" title="Is this token safe to buy?">
        Paste any Robinhood Chain token address. Stoa simulates buying a little and selling it straight back through its live router, without sending anything, and shows what it finds.
      </PageHead>
      <div className="panel pad" style={{ marginBottom: 16 }}>
        <CheckForm autoFocus />
        <p className="note">Get the address from the project&apos;s own website or X account, never from a reply or a DM.</p>
      </div>
      <div className="panel pad">
        <div className="lbl">WHAT IT CHECKS</div>
        <ul className="list" style={{ marginTop: 8 }}>
          <li>Sell back <b>Whether a test sell works right after a test buy</b></li>
          <li>Hidden tax <b>What the buy and the sell pay less than their quote</b></li>
          <li>Round trip <b>The cost of buying and selling back at once, fees and price impact included</b></li>
          <li>Holders <b>How much the creator (Pons launches) and the ten largest wallets hold</b></li>
        </ul>
        <p className="note">A pass describes the token today; its owner can still change the rules later. More: <Link href="/docs/check-token-robinhood-chain">How to check a token on Robinhood Chain</Link>.</p>
      </div>
    </section>
  );
}
