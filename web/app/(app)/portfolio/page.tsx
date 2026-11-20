import type { Metadata } from "next";
import Portfolio from "@/components/Portfolio";
import Link from "next/link";
import { PageHead } from "@/components/ui";
import { WatchlistPanel } from "@/components/Watch";
export const metadata: Metadata = { title: "Portfolio" };
export default function Page() {
  return (
    <section className="page">
      <PageHead eyebrow="PORTFOLIO" title="Your positions" action={<Link className="cta" href="/wrapped">Your Stoa Wrapped</Link>}>Balances, referral earnings and, later, vault shares in one place.</PageHead>
      <WatchlistPanel empty={<p className="note" style={{ marginTop: 0, marginBottom: 16 }}>Follow tokens with ☆ on <Link href="/stocks">Stocks</Link>, a token page or Trade: they show here with their price, and you can set a price alert.</p>} />
      <Portfolio />
    </section>
  );
}
