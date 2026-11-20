import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/ui";
import CopyButton from "@/components/CopyButton";
import MirrorSync from "@/components/MirrorSync";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Open source and open data",
  description: "Stoa's code, data and reviews in the open: the source on GitHub and a signed mirror on Twigpine, open datasets on Hugging Face (swaps, Robinhood Stock Token prices, venue quotes, contract releases) with checksums, a public export API, and the independent security review by HEY Research Lab.",
  alternates: { canonical: "/open" },
};

export const revalidate = 120;

const HF = "https://huggingface.co/datasets/StoaDex/stoa-onchain";
const VERIFY = "sha256sum data/*.csv data/spotlight.json   # compare with manifest.json";

const PLACES: { name: string; href: string; what: string; tag: string }[] = [
  { name: "Source code on GitHub", href: "https://github.com/StoaDex/Stoa", what: "Contracts, the web app, the SDK, the agent tools and every automation that runs Stoa, in one public repository.", tag: "CODE" },
  { name: "Signed mirror on Twigpine", href: "https://explorer.twigpine.com/repos/z6Mkogs4MbcB3pBnpQygxpgWtt6LTJSCbmpiBhRBHgHvnMRt/stoa", what: "The same code mirrored to Twigpine, a decentralized git network, on every push to main. Each push is signed with Stoa's own key, so the copy can be checked without trusting GitHub.", tag: "MIRROR" },
  { name: "Stoa on-chain dataset", href: HF, what: "Every swap routed through Stoa, a daily summary, the Points board and the Spotlight week. Refreshed every 6 hours, tagged every week, with a manifest of SHA-256 checksums.", tag: "DATA" },
  { name: "Robinhood Stock Tokens dataset", href: "https://huggingface.co/datasets/StoaDex/robinhood-stock-tokens", what: "Every Robinhood Stock Token four times a day: Robinhood's own bid and ask next to the deepest on-chain price, the gap, liquidity and volume.", tag: "DATA" },
  { name: "Venue quotes dataset", href: "https://huggingface.co/datasets/StoaDex/robinhood-chain-venue-quotes", what: "The same swaps (ETH, USDG, $STOA, stock tokens, several sizes) quoted on every venue Stoa routes, all in one block, four times a day.", tag: "DATA" },
  { name: "Contract release archive", href: "https://huggingface.co/datasets/StoaDex/stoa-contracts", what: "Contract source, ABIs, deployed addresses and security documents as one reproducible archive per release, with SHA-256 checksums and the Git commit it was built from.", tag: "RELEASES" },
  { name: "Dashboard on Hugging Face", href: "https://huggingface.co/spaces/StoaDex/stoa-dashboard", what: "Volume through Stoa, the largest stock token gaps and live venue quotes, read straight from the datasets.", tag: "DASHBOARD" },
  { name: "Export API", href: "/api/v1/export?set=swaps", what: "The data live, as JSON: set=swaps, points, spotlight, stocks or venues. No key.", tag: "API" },
  { name: "Independent security review by HEY Research Lab", href: "https://heyresearch.xyz/project/stoa", what: "Reviews of Stoa's contracts and their follow-ups, by an outside lab. Findings and fixes are tracked on Security status.", tag: "REVIEW" },
];

export default function OpenPage() {
  return (
    <section className="page">
      <PageHead eyebrow="OPEN · CODE, DATA, REVIEWS" title="Check everything yourself">
        Stoa runs on public contracts, and everything around them is public too: the code, the data it produces and the outside reviews of it. Nothing here asks you to trust a screenshot.
      </PageHead>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {PLACES.map((p) => (
          <a key={p.name} className="panel pad" href={p.href} target={p.href.startsWith("http") ? "_blank" : undefined} rel={p.href.startsWith("http") ? "noopener noreferrer" : undefined} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
            <div className="rowx"><div className="lbl">{p.tag}</div><span style={{ color: "var(--accent-d)", fontWeight: 600 }}>Open →</span></div>
            <div style={{ fontSize: 18, fontWeight: 600, marginTop: 6 }}>{p.name}</div>
            <p className="note" style={{ marginBottom: 0 }}>{p.what}</p>
          </a>
        ))}

        <Suspense fallback={<div className="panel pad"><div className="lbl">CODE MIRROR · LIVE CHECK</div><p className="note" style={{ marginBottom: 0 }}>Checking…</p></div>}>
          <MirrorSync />
        </Suspense>

        <div className="panel" style={{ overflow: "hidden" }}>
          <div className="pad" style={{ paddingBottom: 0 }}><div className="rowx"><div className="lbl">LIVE DASHBOARD · FROM THE DATASETS</div><a href="https://huggingface.co/spaces/StoaDex/stoa-dashboard" target="_blank" rel="noopener noreferrer">Open on Hugging Face →</a></div></div>
          <iframe title="Stoa open data dashboard" src="https://stoadex-stoa-dashboard.static.hf.space" loading="lazy" style={{ display: "block", width: "100%", height: 1400, border: 0, marginTop: 8 }} referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups" />
        </div>

        <div className="panel pad">
          <div className="lbl">VERIFY A DATASET UPDATE</div>
          <p className="note">Download an update from Hugging Face, then hash its files. The hashes must match <code>manifest.json</code> in the same update. Every row comes from Stoa&apos;s routers&apos; <code>Routed</code> events, so you can also recount them from the chain.</p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <code style={{ fontSize: 13, overflowWrap: "anywhere" }}>{VERIFY}</code>
            <CopyButton text="sha256sum data/*.csv data/spotlight.json" />
          </div>
        </div>

        <p className="note">
          Also open: <Link href="/status">System status</Link> · <Link href="/security">Security status</Link> · <Link href="/stats">Stats</Link> · <Link href="/docs/open-data">How the dataset is built</Link>. Nothing on this page is financial advice; points have no promised value.
        </p>
      </div>
    </section>
  );
}
