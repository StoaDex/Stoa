import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHead } from "@/components/ui";
import RefKeeper from "@/components/RefKeeper";
import { readSwap } from "@/lib/swapShare";
import { NATIVE } from "@/lib/tokens";

// /swap/<chain>/<hash>: one swap through Stoa, shared by the trader with their referral link. A mined transaction never
// changes, so the page is rendered on its first visit and kept for a day.
export const revalidate = 86400;
export async function generateStaticParams() { return []; }

type P = { params: Promise<{ chain: string; hash: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { chain, hash } = await params;
  const s = await readSwap(chain, hash).catch(() => null);
  if (!s) return { title: "Swap", robots: { index: false } };
  const title = `${s.amountIn} ${s.symIn} → ${s.amountOut} ${s.symOut}`;
  const description = `Swapped on Stoa on ${s.netName}${s.venues.length ? `, filled on ${s.venues.join(" and ")}` : ""}. Every swap compares every venue the router uses on the network and fills on the one that pays the most.`;
  return {
    title, description,
    robots: { index: false },
    openGraph: { title: `${title} · Stoa`, description, type: "website", siteName: "Stoa", url: `/swap/${chain}/${hash}` },
    twitter: { card: "summary_large_image", site: "@StoaDex", title: `${title} · Stoa`, description },
  };
}

export default async function SwapPage({ params }: P) {
  const { chain, hash } = await params;
  const s = await readSwap(chain, hash).catch(() => null);
  if (!s) notFound();
  const side = (t: string, sym: string) => (t.toLowerCase() === NATIVE ? sym : t);
  const trade = `/trade?chain=${s.net}&sell=${side(s.tokenIn, s.symIn)}&buy=${side(s.tokenOut, s.symOut)}`;
  const when = new Date(s.time * 1000).toUTCString().replace(" GMT", " UTC");
  return (
    <section className="page">
      <RefKeeper />
      <PageHead eyebrow={`SWAP · ${s.netName.toUpperCase()}`} title="Swapped on Stoa" />
      <div className="panel pad" style={{ maxWidth: 640 }}>
        <div className="lbl">PAID</div>
        <div style={{ fontSize: 30, fontWeight: 700, marginTop: 6, overflowWrap: "anywhere" }}>{s.amountIn} {s.symIn}</div>
        <div className="lbl" style={{ marginTop: 18 }}>GOT</div>
        <div style={{ fontSize: 30, fontWeight: 700, marginTop: 6, color: "var(--blue, #1F5FB0)", overflowWrap: "anywhere" }}>{s.amountOut} {s.symOut}</div>
        <div className="det" style={{ marginTop: 18 }}>
          <span>Network</span><span>{s.netName}</span>
          {s.venues.length > 0 && <><span>Filled by</span><span>{s.venues.join(" → ")}</span></>}
          <span>Time</span><span>{when}</span>
          <span>Transaction</span><span><a href={s.explorerTx} target="_blank" rel="noopener noreferrer">{`${s.hash.slice(0, 10)}…${s.hash.slice(-6)}`} ↗</a></span>
        </div>
        <Link className="big pri" href={trade} style={{ display: "flex", justifyContent: "center", alignItems: "center", textDecoration: "none", marginTop: 18 }}>
          Swap {s.symIn} → {s.symOut} on Stoa
        </Link>
        <p className="note">Every swap on Stoa checks every venue the router has on {s.netName} and fills on the one that pays the most, for a 2 bps fee. Read straight from the transaction on-chain.</p>
      </div>
    </section>
  );
}
