import type { Metadata } from "next";
import LaunchesBody from "@/components/LaunchesBody";

const description = "Every live Pons launch on Robinhood Chain with curve progress, market cap and creator tax, read from the chain.";
export const metadata: Metadata = {
  alternates: { canonical: "/launches" },
  title: "Pons launches",
  description,
  openGraph: { title: "Pons launches · Stoa", description, type: "website", siteName: "Stoa" },
  twitter: { card: "summary_large_image", site: "@StoaDex", title: "Pons launches · Stoa", description },
};

export default function LaunchesPage() {
  return (
    <section className="page">
      <LaunchesBody />
    </section>
  );
}
