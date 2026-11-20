import type { Metadata } from "next";
import Link from "next/link";
import TokenBrowser from "@/components/TokenBrowser";
import { PageHead } from "@/components/ui";
import { NETS } from "@/lib/networks";
import { listedTokens } from "@/lib/tokenInfo";
import SpotlightStrip from "@/components/SpotlightStrip";
import { CoveredStrip } from "@/components/CoverPanel";

const description = "Every token Stoa lists on Robinhood Chain and Elysium, each with its live price and the route Stoa finds for it.";
export const metadata: Metadata = {
  alternates: { canonical: "/tokens" },
  title: "Tokens",
  description,
  openGraph: { title: "Tokens · Stoa", description, type: "website", siteName: "Stoa" },
  twitter: { card: "summary_large_image", site: "@StoaDex", title: "Tokens · Stoa", description },
};

export default function TokensPage() {
  const all = listedTokens();
  const nets = [...NETS].filter((n) => n.deployed).sort((a, b) => (a.key === "robinhood" ? -1 : b.key === "robinhood" ? 1 : 0));
  return (
    <section className="page">
      <PageHead eyebrow="TOKENS" title="Tokens on Stoa" action={<Link className="cta" href="/trade">Trade</Link>}>
        Every token Stoa lists, by network. Each page shows the live price and the route Stoa finds right now. Listed tokens are not reviewed by Stoa: check the contract address before you buy.
      </PageHead>
      <SpotlightStrip />
      <CoveredStrip />
      <TokenBrowser nets={nets.map((n) => ({
        key: n.key, name: n.name,
        tokens: all.filter((x) => x.net.key === n.key).map(({ token: t }) => ({ address: t.address, symbol: t.symbol, name: t.name, logo: t.logo })),
      })).filter((n) => n.tokens.length)} />
    </section>
  );
}
