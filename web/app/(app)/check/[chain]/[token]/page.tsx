import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isAddress } from "viem";
import { PageHead } from "@/components/ui";
import SafetyPanel from "@/components/SafetyPanel";
import CheckForm from "@/components/CheckForm";
import CopyButton from "@/components/CopyButton";
import { netByKey } from "@/lib/networks";

// /check/<chain>/<token>: the safety check for one token, the page a shared result links to. The check itself runs in
// the browser through /api/safety (cached two minutes); the share card (opengraph-image) runs it on the server.
type P = { params: Promise<{ chain: string; token: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { chain, token } = await params;
  const net = netByKey(chain);
  if (!net || !isAddress(token, { strict: false })) return {};
  const title = `Safety check for ${token.slice(0, 6)}…${token.slice(-4)} on ${net.name}`;
  const description = `Stoa's free safety check for token ${token} on ${net.name}: a simulated buy and sell-back through the live router, hidden taxes, round-trip cost and holders.`;
  return {
    title, description,
    robots: { index: false, follow: true },
    openGraph: { title: `${title} · Stoa`, description, type: "website", siteName: "Stoa", url: `/check/${net.key}/${token}` },
    twitter: { card: "summary_large_image", site: "@StoaDex", title: `${title} · Stoa`, description },
  };
}

export default async function CheckToken({ params }: P) {
  const { chain, token } = await params;
  const net = netByKey(chain);
  if (!net || !isAddress(token, { strict: false })) notFound();
  return (
    <section className="page" style={{ maxWidth: 760 }}>
      <PageHead eyebrow={`SAFETY CHECK · ${net.name.toUpperCase()}`} title="Is this token safe to buy?">
        A simulated buy and sell-back through Stoa&apos;s live router: nothing is sent and nothing to sign.
      </PageHead>
      <div className="panel pad" style={{ marginBottom: 16 }}>
        <div className="lbl">TOKEN</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          <code style={{ fontFamily: "var(--mono)", fontSize: 14, wordBreak: "break-all" }}>{token}</code>
          <CopyButton text={token} />
        </div>
        <p className="note">Compare this address with the one on the project&apos;s own website before you trust any result.</p>
      </div>
      <SafetyPanel chain={net.key} token={token} />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <Link className="cta" href={`/trade?chain=${net.key}&buy=${token}`}>Swap on Stoa</Link>
        <Link className="ghost" href="/docs/check-token-robinhood-chain" style={{ borderColor: "var(--line)", background: "#fff" }}>How to read this</Link>
      </div>
      <div className="panel pad">
        <div className="lbl">CHECK ANOTHER TOKEN</div>
        <div style={{ marginTop: 10 }}><CheckForm chain={net.key} /></div>
      </div>
    </section>
  );
}
