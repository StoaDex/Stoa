import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getAddress, isAddress } from "viem";
import LaunchToken from "@/components/LaunchToken";
import { readLaunch as read } from "@/lib/ponsLaunch";

/** once per request: metadata and page share the read */
const readLaunch = cache(read);

// /launches/<token>: one Pons launch, shareable with its own link card. Rendered on first visit, then kept a minute.
export const revalidate = 60;
/** none at build: each token page is rendered on its first visit, then cached */
export async function generateStaticParams() { return []; }

type P = { params: Promise<{ token: string }> };
const usd = (v: number | null) => (v === null ? "" : v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`);

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { token } = await params;
  if (!isAddress(token, { strict: false })) return {};
  const a = getAddress(token);
  let title = "Pons launch", description = "A Pons launch on Robinhood Chain: curve progress, market cap and creator tax, read from the chain. On Stoa.";
  try {
    const l = await readLaunch(a);
    if (l) {
      title = `$${l.symbol} · Pons launch`;
      const cap = l.mcapUsd ? `Market cap ${usd(l.mcapUsd)}. ` : "";
      description = l.graduated
        ? `$${l.symbol} (${l.name}) graduated from its Pons curve to Uniswap V4. ${cap}${l.routable ? "Trade it on Stoa." : "On Stoa."}`
        : `$${l.symbol} (${l.name}) is ${l.progress.toFixed(1)}% of the way to graduation on its Pons curve (${(+l.raised).toFixed(2)} of ${(+l.threshold).toFixed(1)} ${l.pairSymbol}). ${cap}Live on Stoa.`;
    }
  } catch { /* generic card text */ }
  return {
    title, description,
    alternates: { canonical: `/launches/${a}` },
    openGraph: { title: `${title} · Stoa`, description, type: "website", siteName: "Stoa", url: `/launches/${a}` },
    twitter: { card: "summary_large_image", site: "@StoaDex", title: `${title} · Stoa`, description },
  };
}

export default async function LaunchTokenPage({ params }: P) {
  const { token } = await params;
  if (!isAddress(token, { strict: false })) notFound();
  const a = getAddress(token);
  let known = true;
  try { known = (await readLaunch(a)) !== null; } catch { /* RPC down: let the page retry in the browser */ }
  if (!known) notFound();
  return (
    <section className="page">
      <LaunchToken token={a} />
    </section>
  );
}
