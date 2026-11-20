import type { Metadata } from "next";
import PoolsBody from "@/components/PoolsBody";

export const metadata: Metadata = {
  alternates: { canonical: "/pools" },
  title: "Pools",
  description: "The pools behind each Stoa swap on Elysium and Robinhood Chain, with liquidity and 24-hour volume.",
};

export default function PoolsPage() {
  return (
    <section className="page">
      <PoolsBody />
    </section>
  );
}
