import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isAddress } from "viem";
import { PageHead } from "@/components/ui";
import { readPoints } from "@/lib/points";

// /points/<wallet>: one wallet's season points and rank, for sharing. Read from the routers' events.
export const revalidate = 300;
type P = { params: Promise<{ address: string }> };
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const n = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 1 });

async function mine(address: string) {
  const b = await readPoints().catch(() => null);
  if (!b) return null;
  const i = b.rows.findIndex((r) => r.address === address.toLowerCase());
  return { wallets: b.wallets, rank: i < 0 ? null : i + 1, row: i < 0 ? null : b.rows[i] };
}

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { address } = await params;
  if (!isAddress(address, { strict: false })) return {};
  const m = await mine(address);
  const title = m?.row ? `${short(address)}: ${n(m.row.points)} Stoa Points, rank ${m.rank}` : "Stoa Points, season 1";
  const description = "Stoa Points: earned from swaps routed through Stoa and from referrals. No promised value.";
  return { title, description, robots: { index: false, follow: true }, openGraph: { title: `${title} · Stoa`, description, siteName: "Stoa" }, twitter: { card: "summary_large_image", site: "@StoaDex", title: `${title} · Stoa`, description } };
}

export default async function WalletPoints({ params }: P) {
  const { address } = await params;
  if (!isAddress(address, { strict: false })) notFound();
  const m = await mine(address);
  return (
    <section className="page">
      <p className="note" style={{ margin: "0 0 8px" }}><Link href="/points">← Points</Link></p>
      <PageHead eyebrow={`POINTS · SEASON 1 · ${short(address)}`} title={m?.row ? `${n(m.row.points)} points · rank ${m.rank} of ${m.wallets}` : "No points yet"}>
        Points come from swaps routed through Stoa and from swaps made through a referral link. They have no promised value: not a token, not claimable, not transferable.
      </PageHead>
      {m?.row && (
        <div className="panel pad" style={{ marginBottom: 16 }}>
          <ul className="list">
            <li>From swaps <b>{n(m.row.swapPoints)} · {m.row.swaps} {m.row.swaps === 1 ? "swap" : "swaps"}</b></li>
            <li>From referrals <b>{n(m.row.refPoints)}</b></li>
          </ul>
        </div>
      )}
      <div className="panel pad">
        <Link className="cta" href={`/trade?ref=${address.toLowerCase()}`}>Swap through this card</Link> <Link className="ghost" href="/points">How points work</Link>
        <p className="note" style={{ marginBottom: 0 }}>Swaps made after tapping the button count as referrals for {short(address)}. You still earn your own points as usual.</p>
      </div>
    </section>
  );
}
