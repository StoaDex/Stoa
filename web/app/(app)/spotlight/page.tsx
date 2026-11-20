import type { Metadata } from "next";
import SpotlightBody from "@/components/SpotlightBody";

const description = "Projects bid ETH for three sponsored slots on Stoa every week. $STOA holders lock and vote, and the winning bids are paid to them.";
export const metadata: Metadata = {
  alternates: { canonical: "/spotlight" },
  title: "Spotlight",
  description,
  openGraph: { title: "Spotlight · Stoa", description, type: "website", siteName: "Stoa" },
  twitter: { card: "summary_large_image", site: "@StoaDex", title: "Spotlight · Stoa", description },
};

export default function SpotlightPage() {
  return (
    <section className="page">
      <SpotlightBody />
    </section>
  );
}
