import type { Metadata } from "next";
import { Suspense } from "react";
import Pay from "@/components/Pay";
import { PageHead } from "@/components/ui";

export const metadata: Metadata = {
  title: "Stoa Pay: payment links on Robinhood Chain",
  description: "Ask for USDG with a link. Whoever pays can use ETH, USDG, a stock token or any token Stoa routes on Robinhood Chain, and you receive USDG.",
  alternates: { canonical: "/pay" },
};

export default function PayPage() {
  return (
    <section className="page">
      <PageHead compact eyebrow="STOA PAY" title="Get paid in USDG, with a link">Share a link, and they pay with whatever they hold on Robinhood Chain. You receive USDG, in one transaction.</PageHead>
      <Suspense fallback={<div className="panel pad" style={{ maxWidth: 560 }}>Loading…</div>}><Pay /></Suspense>
    </section>
  );
}
