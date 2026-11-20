import type { Metadata } from "next";
import { Suspense } from "react";
import Trade from "@/components/Trade";
import TradeSkeleton from "@/components/TradeSkeleton";
import { PageHead } from "@/components/ui";
import AppInstall from "@/components/AppInstall";
import SpotlightBanner from "@/components/SpotlightBanner";
import PointsBanner from "@/components/PointsBanner";

export const metadata: Metadata = {
  title: "Swap on Robinhood Chain and Elysium",
  description: "Swap any listed token on Robinhood Chain and Elysium. Stoa compares every venue it routes for your exact amount and fills where you get the most, for a 2 bps fee.",
  alternates: { canonical: "/trade" },
};

export default function TradePage() {
  return (
    <section className="page">
      <PageHead compact eyebrow="I · TRADE" title="Every route, compared">Every swap checks every venue Stoa routes on the network you pick, for your exact amount, and fills where you get the most.</PageHead>
      <Suspense fallback={<TradeSkeleton />}><Trade aside={<><SpotlightBanner /><PointsBanner /></>} /></Suspense>
      <AppInstall variant="banner" />
    </section>
  );
}
