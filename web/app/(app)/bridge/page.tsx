import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/ui";
import BridgePanel from "@/components/BridgePanel";

const description = "Bridge ETH, USDC or USDT from Base, Arbitrum, Ethereum, Optimism or BNB Chain to Robinhood Chain, then swap on Stoa. Stoa checks every bridge transaction before your wallet opens; you sign in your own wallet and Stoa adds no fee.";
export const metadata: Metadata = {
  title: "Bridge to Robinhood Chain",
  description,
  alternates: { canonical: "/bridge" },
  openGraph: { title: "Bridge to Robinhood Chain · Stoa", description, type: "website", siteName: "Stoa", url: "/bridge" },
  twitter: { card: "summary_large_image", site: "@StoaDex", title: "Bridge to Robinhood Chain · Stoa", description },
};

export default function BridgePage() {
  return (
    <section className="page" style={{ maxWidth: 560 }}>
      <PageHead eyebrow="BRIDGE IN" title="Bring funds to Robinhood Chain">
        Send ETH or stablecoins from another chain and they arrive in the same wallet on Robinhood Chain, ready to swap on Stoa.
      </PageHead>
      <Link href="/token#anychain" className="spotban bar" style={{ marginBottom: 16 }}>
        <span className="sb-dot" aria-hidden="true" />
        <span className="sb-t">Want $STOA? Buy it straight from Base, Arbitrum, Ethereum, Optimism or BNB Chain</span>
        <span className="sb-go">Buy $STOA →</span>
      </Link>
      <BridgePanel />
      <div className="panel pad" style={{ marginTop: 16 }}>
        <div className="lbl">GOOD TO KNOW</div>
        <ul className="list prose" style={{ marginTop: 8 }}>
          <li><span>Gas</span> <b>You pay gas on the source chain. Bring a little ETH to Robinhood Chain too, for gas there.</b></li>
          <li><span>Steps</span> <b>Tokens may need an approve first, then the bridge transaction. Both happen on the source chain.</b></li>
          <li><span>Time</span> <b>Most transfers land within minutes; the quote shows the estimate.</b></li>
          <li><span>Fees</span> <b>The bridge&apos;s and LI.FI&apos;s fees are shown before you sign. Stoa adds nothing.</b></li>
        </ul>
        <p className="note">More: <Link href="/docs/bridge-to-robinhood-chain">How to bridge to Robinhood Chain</Link>.</p>
      </div>
    </section>
  );
}
