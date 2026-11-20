import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAddress } from "viem";
import { PageHead } from "@/components/ui";
import RefKeeper from "@/components/RefKeeper";
import { WrappedActions, WrappedCard } from "@/components/WrappedCard";
import { readWrapped } from "@/lib/wrapped";

// /wrapped/<address>: one wallet's Stoa Wrapped card, read from the routers' events. Rendered on its first visit and kept
// for 10 minutes, so new swaps show up soon after they land.
export const revalidate = 600;
export async function generateStaticParams() { return []; }

type P = { params: Promise<{ address: string }> };
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { address } = await params;
  if (!isAddress(address)) return { title: "Stoa Wrapped", robots: { index: false } };
  const w = await readWrapped(address).catch(() => null);
  const title = `Stoa Wrapped · ${short(address)}`;
  const description = w?.swaps
    ? `${w.swaps} ${w.swaps === 1 ? "swap" : "swaps"} through Stoa, each compared across every venue the router uses. ${w.edition} edition.`
    : "A Stoa Wrapped card, read from the chain.";
  return {
    title, description, robots: { index: false },
    openGraph: { title, description, type: "website", siteName: "Stoa", url: `/wrapped/${address}` },
    twitter: { card: "summary_large_image", site: "@StoaDex", title, description },
  };
}

export default async function WrappedPage({ params }: P) {
  const { address } = await params;
  if (!isAddress(address)) notFound();
  const w = await readWrapped(address).catch(() => null);
  return (
    <section className="page">
      <RefKeeper />
      <PageHead eyebrow={`STOA WRAPPED · ${short(address)}`} title="A year on Stoa" />
      {w ? (
        <div className="wr-wrap">
          <WrappedCard w={w} />
          <WrappedActions w={w} />
        </div>
      ) : (
        <div className="panel empty"><h3>The chain did not answer</h3><p>Reading this wallet&apos;s swaps timed out. Try again in a minute.</p></div>
      )}
    </section>
  );
}
