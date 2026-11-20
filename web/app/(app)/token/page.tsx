import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/ui";
import StoaCA from "@/components/StoaCA";
import TokenUtility from "@/components/TokenUtility";
import AnyChainBuy from "@/components/AnyChainBuy";
import { readLocked, readSupply } from "@/lib/stoaSupply";
import { weekPrices } from "@/lib/priceHistory";
import PriceChart from "@/components/PriceChart";
import StoaDashboard from "@/components/StoaDashboard";
import { CA } from "@/lib/stoaAddress";

const description = "Stoa's protocol fees buy and burn $STOA every week, makers bond it, holders vote in Spotlight to earn projects' ETH bids, and backers lock it behind Rug Cover. Live supply, burns and locks.";
export const metadata: Metadata = {
  alternates: { canonical: "/token" },
  title: "$STOA",
  description,
  openGraph: { title: "$STOA · Stoa", description, type: "website", siteName: "Stoa" },
  twitter: { card: "summary_large_image", site: "@StoaDex", title: "$STOA · Stoa", description },
};

// the at-a-glance numbers are read on the server (every minute) so they are on the page at first paint; the browser
// then keeps them live. A slow RPC only leaves them to the browser.
export const revalidate = 60;

async function initial() {
  try {
    const [s, l] = await Promise.race([
      Promise.all([readSupply(), readLocked()]),
      new Promise<never>((_, r) => setTimeout(() => r(new Error("slow")), 5_000)),
    ]);
    return { supply: s.max.toString(), burned: s.burned.toString(), curve: s.inCurve.toString(), spot: l.spotlight.toString(), cover: l.cover.toString(), bonds: l.bonds.toString() };
  } catch {
    return null;
  }
}

export default async function TokenPage() {
  const [init, history] = await Promise.all([initial(), weekPrices("robinhood", CA).catch(() => null)]);
  return (
    <section className="page">
      <PageHead eyebrow="$STOA · ROBINHOOD CHAIN" title="What $STOA does" action={<Link className="cta" href="/trade?chain=robinhood">Trade</Link>}>
        Four jobs, all enforced by contracts: Stoa&apos;s protocol fees buy $STOA and burn it, makers bond $STOA to quote Stoa pools, holders vote in Spotlight to earn the ETH projects bid, and backers lock it behind Rug Cover.
      </PageHead>
      <StoaCA />
      {history && <PriceChart points={history} symbol="$STOA" source="GeckoTerminal" />}
      <StoaDashboard />
      <AnyChainBuy />
      <TokenUtility init={init} />
    </section>
  );
}
