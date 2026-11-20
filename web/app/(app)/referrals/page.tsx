import type { Metadata } from "next";
import Link from "next/link";
import Referrals from "@/components/Referrals";
import ReferralBoard from "@/components/ReferralBoard";
import { PageHead } from "@/components/ui";
export const metadata: Metadata = {
  title: "Referrals",
  description: "Share your Stoa link and earn 10% of the protocol fee on every swap made through it, claimable on-chain on Robinhood Chain and Elysium.",
  alternates: { canonical: "/referrals" },
};
export default function Page() {
  return (
    <section className="page">
      <PageHead eyebrow="REFERRALS" title="Bring traders, share the fee">Share your link. You earn 10% of the protocol fee on every swap made through it.</PageHead>
      <Referrals />
      <div id="integrator-bonus" className="panel pad" style={{ marginTop: 20 }}>
        <div className="rowx"><div className="lbl">INTEGRATOR BONUS · $10 USDG A MONTH</div><span className="chip">From December 2026</span></div>
        <p style={{ marginTop: 10 }}>Built a bot, wallet, widget or app that sends swaps through Stoa with your address as <code>referrer</code>? If at least 10 different wallets swap $1 or more through it in a UTC month, you get a $10 USDG bonus for that month, on top of your 10% fee share. Up to 5 integrators a month, ranked by wallets, then volume.</p>
        <p className="note" style={{ marginTop: 8 }}>Counted from the router&apos;s on-chain events, shown live in the board below. Your own wallet does not count toward your 10. Paid by Stoa on Robinhood Chain in the first week of the next month, after a check for wash trading. <Link href="/build">Ways to integrate →</Link></p>
      </div>
      <ReferralBoard />
    </section>
  );
}
