import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/ui";
import PointsMine from "@/components/PointsMine";
import PointsBoard from "@/components/PointsBoard";
import { RULES, SEASON_START, readPoints } from "@/lib/points";

export const metadata: Metadata = {
  title: "Points",
  description: "Stoa Points, season 1: earned from swaps routed through Stoa and from swaps you refer. No promised value: not a token, not claimable, not transferable.",
  alternates: { canonical: "/points" },
};
export const revalidate = 300;


export default async function PointsPage() {
  const b = await readPoints().catch(() => null);
  const started = Date.now() / 1000 >= SEASON_START;
  const start = new Date(SEASON_START * 1000).toUTCString().slice(0, 16);
  return (
    <section className="page">
      <PageHead eyebrow="POINTS · SEASON 1" title="Swap, refer, collect points" action={<a className="ghost" href="/cal/points.ics">Add the start to your calendar</a>}>
        Every swap routed through Stoa earns points, and so does every swap made through your referral link. {started ? `Season 1 started ${start}, 00:00 UTC.` : `Season 1 starts ${start}, 00:00 UTC.`}
      </PageHead>
      <div className="notice" style={{ marginBottom: 16 }}>
        Points have <b>no promised value</b>. They are not a token, cannot be claimed, sold or transferred, and nothing is promised for them. Stoa will never ask you to pay, deposit or sign anything for points.
      </div>
      <div className="grid2 eq" style={{ alignItems: "start", marginBottom: 16 }}>
        <PointsMine />
        <div className="panel pad">
          <div className="lbl">HOW POINTS ARE COUNTED</div>
          <ul className="list prose">
            <li><span>Swaps</span><b>1 point per $1 swapped through Stoa, from ${RULES.MIN_USD}, valued like Stats. Robinhood Stock Tokens count {RULES.STOCK_X}×.</b></li>
            <li><span>Referrals</span><b>{RULES.REF_SHARE * 100}% of the points of every swap made through your link (<Link href="/referrals">Referrals</Link>).</b></li>
            <li><span>Daily cap</span><b>At most {RULES.DAILY_CAP.toLocaleString("en-US")} points a UTC day from your own swaps.</b></li>
            <li><span>No farming</span><b>A swap that undoes your own opposite swap within an hour earns nothing, stablecoin-to-stablecoin swaps earn nothing, and wallets that only trade to farm points can be removed.</b></li>
            <li><span>Source</span><b>Read from the routers&apos; Routed events on Robinhood Chain and Elysium; anyone can recount. Updated every 5 minutes.</b></li>
          </ul>
        </div>
      </div>
      <div className="panel" style={{ overflow: "hidden" }}>
        <div className="rowx" style={{ padding: "16px 18px 0" }}><div className="lbl">LEADERBOARD</div><span className="note" style={{ margin: 0 }}>{b ? `${b.wallets} wallets` : ""}</span></div>
        {!b ? <p className="note" style={{ padding: "0 18px 16px" }}>The chains did not answer. Try again in a minute.</p>
          : <PointsBoard rows={b.rows.slice(0, 500)} stockX={RULES.STOCK_X} showMoves={started && Date.now() / 1000 >= SEASON_START + 86400}
              empty={started ? "No points yet this season." : `Nothing yet: points count from ${start}, 00:00 UTC.`} />}
      </div>
      <p className="note" style={{ marginTop: 10 }}>Stoa can change these rules during the season; changes are written on this page with their date. Not financial advice.</p>
    </section>
  );
}
