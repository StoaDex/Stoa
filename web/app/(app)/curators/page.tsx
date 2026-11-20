import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/ui";

export const metadata: Metadata = {
  title: "Curators",
  description: "Run a Stoa pool on Elysium: bring a price feed or quoting strategy, post a bond, quote on-chain every block and keep the spread when the router fills you.",
  alternates: { canonical: "/curators" },
};

const STEPS = [
  ["I", "Post a bond", "Curators lock a HYPE bond. It keeps quotes honest and can be slashed for bad pricing."],
  ["II", "Quote every block", "Your maker posts bid and ask on-chain. The router sends flow to you when your price beats every other venue."],
  ["III", "Earn the spread", "Makers keep the spread they quote. Pools reviewed by the team get a Verified badge."],
];

export default function CuratorsPage() {
  return (
    <section className="page">
      <PageHead eyebrow="III · RUN A POOL" title="Makers hold the center" action={<a className="cta" href="https://x.com/StoaDEX" target="_blank" rel="noopener noreferrer">Apply on X</a>}>
        Bring a price feed or a quoting strategy, post a bond, and run a pool that anyone on Elysium can trade.
      </PageHead>
      <div className="grid3">
        {STEPS.map(([n, h, p]) => <div key={n} className="panel pad step"><span className="num">{n}</span><h3>{h}</h3><p>{p}</p></div>)}
      </div>
      <div className="grid2" style={{ marginTop: 20 }}>
        <div className="panel pad"><div className="lbl">CURRENT PARAMETERS</div><ul className="list"><li>Quote validity <b>2 blocks</b></li><li>Max swap size <b>$500 at launch</b></li><li>Protocol fee <b>2 bps</b></li><li>Bond asset <b>HYPE</b></li></ul></div>
        <div className="panel pad"><div className="lbl">WHAT YOU NEED</div><ul className="list"><li>A price source or strategy <b>Required</b></li><li>A bot that can post every block <b>Required</b></li><li>Stoa maker kit <b>Open source at launch</b></li></ul><Link className="go" href="/docs/getting-started">Read the curator guide</Link></div>
      </div>
    </section>
  );
}
