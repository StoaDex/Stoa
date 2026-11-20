import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/ui";
import { readSpotlight } from "@/lib/spotlightServer";
import { STOA_RH } from "@/lib/anychain";
import { HOUSE_BID } from "@/lib/spotlight";

export const metadata: Metadata = {
  title: "Earn",
  description: "Lock $STOA in Spotlight, vote for the tokens projects bid on, and share the winning bids in ETH, every week on Robinhood Chain.",
  alternates: { canonical: "/earn" },
};
export const revalidate = 60;

const num = (v: number, d = 0) => v.toLocaleString("en-US", { maximumFractionDigits: d });
const big = (v: number) => (v >= 1e9 ? `${num(v / 1e9, 2)}B` : v >= 1e6 ? `${num(v / 1e6, 2)}M` : v >= 1e3 ? `${num(v / 1e3, 1)}K` : num(v));

function Cell({ label, v, sub }: { label: string; v: string; sub?: string }) {
  return (
    <div className="panel pad">
      <div className="lbl">{label}</div>
      <div style={{ fontFamily: "var(--num)", fontSize: 24, marginTop: 6 }}>{v}</div>
      {sub && <p className="note" style={{ marginTop: 6 }}>{sub}</p>}
    </div>
  );
}

export default async function EarnPage() {
  const s = await readSpotlight().catch(() => null);
  const bids = s ? s.candidates.filter((c) => !c.canceled).reduce((a, c) => a + c.bidEth, 0) : 0;
  const toVoters = s?.rules.toVotersPct ?? 90;
  const week = s?.week ?? 1;
  const houseOn = week >= HOUSE_BID.fromWeek && week <= HOUSE_BID.toWeek;
  const phase = !s ? "" : s.phase === "before_week_1" ? `Week 1 opens ${new Date(s.opensAt!).toUTCString().slice(0, 22)} UTC` : s.phase === "bids_open" ? `Week ${week}: bids and votes open` : `Week ${week}: votes only`;

  return (
    <section className="page">
      <PageHead eyebrow="II · EARN" title="Earn ETH with $STOA">
        Lock $STOA in Spotlight and vote for the tokens projects bid on. When a token you voted for wins its week, you share {toVoters}% of its bid in ETH.
      </PageHead>

      <div className="grid3 sgrid">
        <Cell label="$STOA LOCKED" v={s ? big(s.stoaLocked) : "—"} sub={phase || undefined} />
        <Cell label="ETH BID THIS WEEK" v={s ? `${num(bids, 3)} ETH` : "—"} sub={s ? `${s.candidates.length} token${s.candidates.length === 1 ? "" : "s"} in the race, ${s.rules.slots} win` : undefined} />
        <Cell label="PAID TO VOTERS" v={s ? `${num(s.totals.ethPaidToVoters, 4)} ETH` : "—"} sub={s ? `${big(s.totals.stoaBurned)} $STOA bought and burned` : undefined} />
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="panel pad">
          <div className="lbl">HOW TO EARN</div>
          <ol className="qsteps">
            <li><span className="qn">1</span><span><b>Get $STOA</b><small><Link href={`/trade?chain=robinhood&buy=${STOA_RH}`}>Buy on Stoa</Link>, on Robinhood Chain.</small></span></li>
            <li><span className="qn">2</span><span><b>Lock it in Spotlight</b><small>Locked $STOA votes every week until you unlock it. Any amount.</small></span></li>
            <li><span className="qn">3</span><span><b>Vote by Sunday, 23:59 UTC</b><small>Split your votes over up to ten tokens in the race.</small></span></li>
            <li><span className="qn">4</span><span><b>Claim ETH</b><small>After the week, voters of each winning token share {toVoters}% of its bid, pro rata. The rest buys $STOA and burns it.</small></span></li>
          </ol>
          <Link className="big pri" href="/spotlight#lock" style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", marginTop: 12 }}>Lock and vote</Link>
          <p className="note" style={{ marginBottom: 0, textAlign: "center" }}><Link href="/spotlight#calc">Estimate what your $STOA could earn</Link></p>
        </div>
        <div className="panel pad">
          <div className="lbl">WHAT TO KNOW</div>
          <ul className="list">
            <li>Payouts come only from what is bid. If a token you voted for does not win, that week pays you nothing. Nothing is promised.</li>
            <li>A token wins only with at least {s ? big(s.rules.quorumStoa) : "1M"} $STOA of votes; losing bids go back to their bidders.</li>
            <li>$STOA that voted in a week stays locked until that week ends. Unlocking finishes at the end of the week you ask.</li>
            <li><span>Spotlight tokens are sponsored, not reviewed: <Link href="/check">check a token</Link> before you buy it.</span></li>
          </ul>
          {houseOn && (
            <p className="notice" style={{ marginTop: 12 }}>
              Weeks {HOUSE_BID.fromWeek} to {HOUSE_BID.toWeek}: Stoa adds a house bid of {HOUSE_BID.eth} ETH each week, for a token it names in its weekly post, so every week has a bid to vote for. Projects can outbid it.
            </p>
          )}
        </div>
      </div>

      <details className="panel pad fold-panel" style={{ marginTop: 16 }}>
        <summary className="lbl">LATER: POOL VAULTS</summary>
        <p className="note" style={{ marginTop: 8 }}>
          Stoa&apos;s own maker-quoted pools come first on Robinhood Chain, funded by their curators. Vaults that take deposits from anyone come after that,
          once makers and volume are in place and the vault contracts have had an independent security review, and they will open with deposit caps.
          Until then, there is nothing to deposit here. <Link href="/docs/provide-liquidity">How pool vaults will work</Link>.
        </p>
      </details>
    </section>
  );
}
