import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isAddress } from "viem";
import { PageHead } from "@/components/ui";
import RefSave from "@/components/RefSave";
import { RULES, SEASON_START } from "@/lib/pointsScore";

// /r/<wallet>: an invite to Stoa from a referrer. Saves the referral like ?ref= and points to Trade; its card is the
// invite image people share.
type P = { params: Promise<{ address: string }> };
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export const revalidate = 300;

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { address } = await params;
  if (!isAddress(address, { strict: false })) return {};
  const title = "You're invited to swap on Stoa";
  const description = "Swap on Robinhood Chain with every route compared for your amount: stock tokens, launches and more, for a 2 bps fee. Swaps earn Stoa Points.";
  return { title, description, robots: { index: false, follow: true }, openGraph: { title: `${title} · Stoa`, description, siteName: "Stoa" }, twitter: { card: "summary_large_image", site: "@StoaDex", title: `${title} · Stoa`, description } };
}

export default async function Invite({ params }: P) {
  const { address } = await params;
  if (!isAddress(address, { strict: false })) notFound();
  const live = Date.now() / 1000 >= SEASON_START;
  const trade = `/trade?chain=robinhood&ref=${address}`;
  const STEPS: { n: string; t: string; d: React.ReactNode; cta: React.ReactNode }[] = [
    { n: "1", t: "Get ETH on Robinhood Chain", d: <>Bridge from Base, Arbitrum, Ethereum, Optimism or BNB Chain in one step. Already have ETH there? Skip this.</>, cta: <Link className="ghost" href="/bridge">Bridge in</Link> },
    { n: "2", t: "Swap", d: <>Pick a token or a stock token like TSLA or NVDA. Stoa compares every venue it routes for your exact amount, and shows Robinhood&apos;s price next to the on-chain one.</>, cta: <Link className="cta" href={trade}>Start swapping</Link> },
    { n: "3", t: "Collect points", d: <>{live ? "Every swap earns Stoa Points this season" : "From Mon 23 Nov, 00:00 UTC, every swap earns Stoa Points"}: 1 per $1, and stock tokens count {RULES.STOCK_X}×. Points have no promised value.</>, cta: <Link className="ghost" href="/points">How points work</Link> },
  ];
  return (
    <section className="page">
      <RefSave address={address} />
      <PageHead eyebrow={`INVITED BY ${short(address)}`} title="Your friend invited you to Stoa" action={<Link className="cta" href={trade}>Start swapping</Link>}>
        Swaps on Robinhood Chain, every venue compared for your amount, for a 2 bps fee.
      </PageHead>
      <ol style={{ listStyle: "none", padding: 0, margin: "0 0 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {STEPS.map((s) => (
          <li key={s.n} className="panel pad" style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <span aria-hidden="true" style={{ flex: "none", width: 34, height: 34, borderRadius: 999, background: "var(--accent, #2563eb)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{s.n}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{s.t}</div>
              <p className="note" style={{ margin: "4px 0 10px" }}>{s.d}</p>
              {s.cta}
            </div>
          </li>
        ))}
      </ol>
      <div className="panel pad">
        <div className="lbl">GOOD TO KNOW</div>
        <ul className="list prose">
          <li><span>Your funds</span><b>Your wallet signs every swap. Stoa never holds your funds.</b></li>
          <li><span>Before you buy</span><b>The <Link href="/check">safety check</Link> simulates a buy and a sell of any token, so you see a hidden tax or a token you cannot sell.</b></li>
          <li><span>Reviewed</span><b>Stoa&apos;s contracts are in an independent security review by Hey Research Lab. <Link href="/security">Security status</Link></b></li>
          <li><span>Your friend</span><b>Earns 10% of Stoa&apos;s fee on your swaps and 10% of your points as a bonus. You pay nothing extra, and your own points are not reduced.</b></li>
        </ul>
      </div>
      <p className="note" style={{ marginTop: 10 }}>Robinhood Stock Tokens are issued by Robinhood and are not offered in every country. Not financial advice.</p>
    </section>
  );
}
