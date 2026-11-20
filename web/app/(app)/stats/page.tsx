import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/ui";
import StatsBody from "@/components/StatsBody";

const description = "Volume and swaps routed through Stoa on Robinhood Chain and Elysium, read straight from the routers' on-chain events.";
export const metadata: Metadata = {
  alternates: { canonical: "/stats" },
  title: "Stats",
  description,
  openGraph: { title: "Stats · Stoa", description, type: "website", siteName: "Stoa" },
  twitter: { card: "summary_large_image", site: "@StoaDex", title: "Stats · Stoa", description },
};

export default function StatsPage() {
  return (
    <section className="page">
      <PageHead eyebrow="STATS · ON-CHAIN" title="Volume through Stoa" action={<Link className="cta" href="/trade">Trade</Link>}>
        Every swap routed through Stoa on Robinhood Chain and Elysium, counted from the routers&apos; own on-chain events.
      </PageHead>
      <StatsBody />
    </section>
  );
}
