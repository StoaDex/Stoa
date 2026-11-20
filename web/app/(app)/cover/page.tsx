import type { Metadata } from "next";
import CoverBody from "@/components/CoverBody";

const description = "Pons creators bond ETH behind a promise not to sell or move the tokens in their wallet. Buy through Stoa with cover and claim your ETH back if that wallet dumps.";
export const metadata: Metadata = {
  alternates: { canonical: "/cover" },
  title: "Rug Cover",
  description,
  openGraph: { title: "Rug Cover · Stoa", description, type: "website", siteName: "Stoa" },
  twitter: { card: "summary_large_image", site: "@StoaDex", title: "Rug Cover · Stoa", description },
};

export default function CoverPage() {
  return (
    <section className="page">
      <CoverBody />
    </section>
  );
}
