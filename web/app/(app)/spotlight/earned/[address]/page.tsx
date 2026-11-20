import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isAddress } from "viem";
import { PageHead } from "@/components/ui";
import { readEarned } from "@/lib/spotlightEarned";

// /spotlight/earned/<wallet>: what a wallet earned by voting with $STOA in Spotlight, for sharing. Read from the chain.
export const revalidate = 300;

type P = { params: Promise<{ address: string }> };
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const ethTxt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: v < 1 ? 5 : 3 });

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { address } = await params;
  if (!isAddress(address, { strict: false })) return {};
  const e = await readEarned(address).catch(() => null);
  const title = e && e.eth > 0 ? `${short(address)} earned ${ethTxt(e.eth)} ETH in Spotlight` : "Spotlight earnings";
  const description = "$STOA holders lock and vote in Spotlight; 90% of each winning bid is paid to its voters in ETH. Read from the chain.";
  return { title, description, robots: { index: false, follow: true }, openGraph: { title: `${title} · Stoa`, description, siteName: "Stoa" }, twitter: { card: "summary_large_image", site: "@StoaDex", title: `${title} · Stoa`, description } };
}

export default async function Earned({ params }: P) {
  const { address } = await params;
  if (!isAddress(address, { strict: false })) notFound();
  const e = await readEarned(address).catch(() => null);
  return (
    <section className="page">
      <p className="note" style={{ margin: "0 0 8px" }}><Link href="/spotlight">← Spotlight</Link></p>
      <PageHead eyebrow={`SPOTLIGHT · ${short(address)}`} title={e && e.eth > 0 ? `${ethTxt(e.eth)} ETH earned by voting` : "No Spotlight earnings yet"}>
        $STOA holders lock and vote for the projects bidding in Spotlight. 90% of each winning bid goes to the holders who voted for it, in ETH.
      </PageHead>
      {e === null && <div className="notice">Robinhood Chain did not answer. Try again in a minute.</div>}
      {e && e.rows.length > 0 && (
        <div className="panel pad" style={{ marginBottom: 16 }}>
          <div className="lbl">BY WEEK</div>
          <ul className="list">
            {e.rows.map((r) => <li key={`${r.week}-${r.token}`}><span>Week {r.week} · voted {r.symbol}</span><b>{ethTxt(r.eth)} ETH{r.claimed ? "" : " · to claim"}</b></li>)}
          </ul>
        </div>
      )}
      <div className="panel pad">
        <p style={{ marginTop: 0 }}>Payouts depend only on what projects bid, and only voters of a winning token earn. Nothing is promised, and this is not financial advice.</p>
        <Link className="cta" href="/spotlight#calc">Estimate what your $STOA could earn</Link>
      </div>
    </section>
  );
}
