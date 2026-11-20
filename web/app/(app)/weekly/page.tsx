import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/ui";
import WeeklyBody from "@/components/WeeklyBody";

const description = "One week on Stoa, Monday to Sunday UTC: volume routed, $STOA bought and burned, the Spotlight week and everything that shipped. Read from the chain.";
export const metadata: Metadata = {
  alternates: { canonical: "/weekly" },
  title: "This week on Stoa",
  description,
  openGraph: { title: "This week on Stoa", description, type: "website", siteName: "Stoa" },
  twitter: { card: "summary_large_image", site: "@StoaDex", title: "This week on Stoa", description },
};

export default function WeeklyPage() {
  return (
    <section className="page">
      <PageHead eyebrow="WEEKLY · ON-CHAIN" title="This week on Stoa" action={<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Link className="cta" href="/trade">Trade</Link><Link className="ghost" href="/report">State of Robinhood Chain</Link></div>}>
        Monday to Sunday, UTC. Volume, burns and Spotlight are read from the chain; what shipped comes from the changelog.
      </PageHead>
      <WeeklyBody />
    </section>
  );
}
