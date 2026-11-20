import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/ui";
import WidgetBuilder, { type Pick } from "@/components/WidgetBuilder";
import { CA } from "@/lib/stoaAddress";
import { stockTokens } from "@/lib/stocks";

export const metadata: Metadata = {
  title: "Swap widget for your website",
  description: "Put a Stoa swap widget on your token's website: visitors type an amount, see the live quote across every venue Stoa routes on Robinhood Chain, and swap on Stoa. One line of HTML, light or dark, and you earn 10% of Stoa's fee.",
  alternates: { canonical: "/build/widget" },
};
export const revalidate = 600;

export default async function WidgetPage() {
  const stocks = (await stockTokens().catch(() => null))?.stocks ?? [];
  const picks: Pick[] = [
    { symbol: "STOA", address: CA },
    ...stocks.filter((s) => s.route).slice(0, 6).map((s) => ({ symbol: s.symbol, address: s.address })),
  ];
  return (
    <section className="page">
      <p className="note" style={{ margin: "0 0 8px" }}><Link href="/build">← Integrate Stoa</Link></p>
      <PageHead eyebrow="BUILD · SWAP WIDGET" title="A swap box for your website">
        Visitors type an amount and see what Stoa gets them right now, across every venue it routes. The button opens Stoa with the same swap filled in, and your wallet earns 10% of Stoa&apos;s fee on it.
      </PageHead>
      <WidgetBuilder picks={picks} />
    </section>
  );
}
