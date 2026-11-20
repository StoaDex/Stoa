import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isAddress } from "viem";
import { PageHead } from "@/components/ui";
import PnlPanel from "@/components/PnlPanel";
import { netByKey } from "@/lib/networks";

// /pnl/<chain>/<wallet>: a wallet's profit and loss from swaps through Stoa, for sharing. Read from the chain.
type P = { params: Promise<{ chain: string; address: string }> };
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { chain, address } = await params;
  const net = netByKey(chain);
  if (!net || !isAddress(address, { strict: false })) return {};
  const title = `${short(address)}'s P&L on Stoa · ${net.name}`;
  const description = "Profit and loss from swaps through Stoa, read from the chain. Every route compared on every swap.";
  return { title, description, robots: { index: false, follow: true }, openGraph: { title, description, siteName: "Stoa" }, twitter: { card: "summary_large_image", site: "@StoaDex", title, description } };
}

export default async function PnlShare({ params }: P) {
  const { chain, address } = await params;
  const net = netByKey(chain);
  if (!net || !isAddress(address, { strict: false })) notFound();
  return (
    <section className="page">
      <PageHead eyebrow={`P&L · ${net.name.toUpperCase()} · ${short(address)}`} title="Profit and loss on Stoa">
        From this wallet&apos;s swaps through Stoa only, read from the chain: realized on what was sold, unrealized on what is still held at the router&apos;s quote now.
      </PageHead>
      <div className="grid2 eq"><PnlPanel net={net} address={address} /></div>
      <p className="note" style={{ marginTop: 12 }}><Link href="/trade">Swap on Stoa</Link> · Not financial advice.</p>
    </section>
  );
}
