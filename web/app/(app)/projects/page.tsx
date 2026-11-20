import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/ui";
import ProjectKit from "@/components/ProjectKit";

const description = "For token projects on Robinhood Chain: a token page and buy link, a live safety-check badge, a swap widget for your site, and Spotlight slots where $STOA holders vote. Free, except Spotlight bids.";
export const metadata: Metadata = {
  title: "For token projects",
  description,
  alternates: { canonical: "/projects" },
  openGraph: { title: "For token projects · Stoa", description, type: "website", siteName: "Stoa" },
  twitter: { card: "summary_large_image", site: "@StoaDex", title: "For token projects · Stoa", description },
};

const TOOLS: { tag: string; name: string; what: string; href: string; cost: string }[] = [
  { tag: "SEEN", name: "Spotlight slots", what: "Three sponsored slots a week on Trade, Launches and Tokens. Projects bid ETH; $STOA holders lock and vote, and get most of each winning bid.", href: "/spotlight/projects", cost: "Bid from 0.01 ETH, plus a 0.001 ETH entry fee" },
  { tag: "TRUST", name: "Safety check and badge", what: "Stoa simulates a buy and a sell of your token through its live router, without sending anything. Show the live result on your site.", href: "/check", cost: "Free" },
  { tag: "BUY", name: "Swap widget", what: "A swap box for your website that buys your token on every venue Stoa compares. Add your wallet as referrer.", href: "/build/widget", cost: "Free" },
  { tag: "LISTED", name: "Token page and buy link", what: "Any token with a pool on a venue Stoa routes can be bought by its address, with a token page you can link to.", href: "/tokens", cost: "Free, nothing to apply for" },
  { tag: "BOTS", name: "API and agent tools", what: "Quotes, safety checks and token data for your bot or AI agent, with no key.", href: "/build", cost: "Free" },
];

export default function ProjectsPage() {
  return (
    <section className="page">
      <PageHead eyebrow="FOR TOKEN PROJECTS" title="Everything Stoa does for your token" action={<Link className="cta" href="/spotlight/projects">Spotlight for projects</Link>}>
        Paste your token address: your links, a live safety badge and a swap widget, all free.
      </PageHead>
      <ProjectKit />
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {TOOLS.map((x) => (
          <Link key={x.name} className="panel pad" href={x.href} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
            <div className="rowx"><div className="lbl">{x.tag}</div><span style={{ color: "var(--accent-d)", fontWeight: 600 }}>Open →</span></div>
            <div style={{ fontSize: 18, fontWeight: 600, marginTop: 6 }}>{x.name}</div>
            <p className="note" style={{ margin: "6px 0 4px" }}>{x.what}</p>
            <small style={{ color: "var(--muted)" }}>{x.cost}</small>
          </Link>
        ))}
        <p className="note">Spotlight slots are sponsored and not reviewed by Stoa; a safety check describes a token at the time of the check, and its owner can change the rules later. Questions: <a href="https://t.me/StoaDexChat" target="_blank" rel="noopener noreferrer">Telegram</a> or <a href="https://x.com/StoaDEX" target="_blank" rel="noopener noreferrer">@StoaDEX</a>.</p>
      </div>
    </section>
  );
}
