import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isAddress } from "viem";
import { PageHead } from "@/components/ui";
import CopyButton from "@/components/CopyButton";
import { ethTxt, readVote, stoaTxt, utcTxt } from "@/lib/spotlightVote";
import { CA as STOA_CA } from "@/lib/stoaAddress";
import { unstable_cache } from "next/cache";
import { readSafety } from "@/lib/safety";
import { ROBINHOOD } from "@/lib/networks";
import type { Address } from "viem";

// the free safety check (simulated buy and sell-back, taxes, holders) for the candidate, kept 10 minutes
const safetyOf = unstable_cache(async (t: string) => readSafety(ROBINHOOD, t as Address), ["spotlight-vote-safety"], { revalidate: 600 });
const TONE = { ok: ["#15803d", "#E9F7EF", "Passed the safety check"], caution: ["#B45309", "#FFF5E5", "Check with care"], danger: ["#B42318", "#FDECEA", "Failed the safety check"], unknown: ["#475467", "#F2F4F7", "Could not be fully checked"] } as const;

// /spotlight/vote/<token>: a Spotlight candidate's own page, for projects to share with their community: its bid, its
// votes against the quorum, and how to lock $STOA and vote for it. Read from SpotlightMarket.
export const revalidate = 120;
type P = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { token } = await params;
  if (!isAddress(token, { strict: false })) return {};
  const v = await readVote(token).catch(() => null);
  const title = v ? `Vote for ${v.symbol} in Stoa Spotlight` : "Stoa Spotlight";
  const description = v ? `${v.symbol} bid ${ethTxt(v.bidEth)} ETH in Spotlight week ${v.week}. If it wins, ${v.toVotersPct}% of the bid goes to the $STOA holders who voted for it, in ETH. Votes close ${utcTxt(v.votesCloseAt)}.` : "Projects bid ETH for sponsored slots on Stoa; $STOA holders lock, vote and earn it.";
  return { title, description, alternates: { canonical: `/spotlight/vote/${token.toLowerCase()}` }, openGraph: { title, description, siteName: "Stoa" }, twitter: { card: "summary_large_image", site: "@StoaDex", title, description } };
}

export default async function VotePage({ params }: P) {
  const { token } = await params;
  if (!isAddress(token, { strict: false })) notFound();
  const v = await readVote(token).catch(() => undefined);
  const url = `https://stoadex.com/spotlight/vote/${token.toLowerCase()}`;
  if (v === undefined) return <section className="page"><div className="notice">Robinhood Chain did not answer. Try again in a minute.</div></section>;
  if (!v) return (
    <section className="page">
      <p className="note" style={{ margin: "0 0 8px" }}><Link href="/spotlight">← Spotlight</Link></p>
      <PageHead eyebrow="SPOTLIGHT" title="Not in this week's race">This token has no bid in the current Spotlight week. Projects can enter from Spotlight for projects.</PageHead>
      <Link className="cta" href="/spotlight/projects">Spotlight for projects</Link>
    </section>
  );
  const pct = v.quorumStoa > 0 ? Math.min(100, (v.votesStoa / v.quorumStoa) * 100) : 0;
  const safety = await safetyOf(v.token.toLowerCase()).catch(() => null);
  const share = `Vote for $${v.symbol} in @StoaDEX Spotlight week ${v.week}: ${ethTxt(v.bidEth)} ETH bid, ${v.toVotersPct}% goes to the $STOA holders who vote for it if it wins. Votes close ${utcTxt(v.votesCloseAt)}.`;
  return (
    <section className="page">
      <p className="note" style={{ margin: "0 0 8px" }}><Link href="/spotlight">← Spotlight</Link></p>
      <PageHead eyebrow={`SPOTLIGHT · WEEK ${v.week}`} title={`Vote for ${v.symbol}`}>
        {v.symbol} bid ETH for a sponsored slot on Stoa. $STOA holders choose the winners by locking and voting; if {v.symbol} wins, {v.toVotersPct}% of its bid is split among the holders who voted for it, in ETH.
      </PageHead>
      {v.canceled && <div className="notice">This bid was canceled; it can no longer win this week.</div>}
      <div className="grid3 sgrid" style={{ marginBottom: 16 }}>
        <div className="panel pad"><div className="lbl">BID</div><div style={{ fontFamily: "var(--num)", fontSize: 28, marginTop: 6 }}>{ethTxt(v.bidEth)} ETH</div><p className="note" style={{ marginBottom: 0 }}>{v.of > 0 ? `#${v.rank} of ${v.of} bids this week` : ""}</p></div>
        <div className="panel pad"><div className="lbl">VOTES</div><div style={{ fontFamily: "var(--num)", fontSize: 28, marginTop: 6 }}>{stoaTxt(v.votesStoa)} <small style={{ fontSize: 14, color: "var(--muted)" }}>/ {stoaTxt(v.quorumStoa)} $STOA</small></div>
          <div role="progressbar" aria-label="Votes toward the quorum" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} style={{ height: 8, borderRadius: 8, background: "rgba(47,111,214,.12)", marginTop: 10, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)" }} /></div></div>
        <div className="panel pad"><div className="lbl">STATUS</div><div style={{ fontSize: 22, fontWeight: 600, marginTop: 8 }}>{v.canceled ? "Canceled" : v.winning ? `Winning now (top ${v.slots})` : pct < 100 ? "Needs votes" : `Outside the top ${v.slots}`}</div><p className="note" style={{ marginBottom: 0 }}>Votes close {utcTxt(v.votesCloseAt)}</p></div>
      </div>
      {safety && (
        <div className="panel pad" style={{ marginBottom: 16, borderColor: TONE[safety.verdict][0] }}>
          <div className="rowx"><div className="lbl">SAFETY CHECK · {v.symbol.toUpperCase()}</div><span className="chip" style={{ background: TONE[safety.verdict][1], color: TONE[safety.verdict][0] }}>{TONE[safety.verdict][2]}</span></div>
          <ul className="list">
            <li><span>Test buy and sell-back</span><b>{!safety.test || (!safety.test.buyOk && safety.test.why) ? "not tested" : `${safety.test.buyOk ? "buy works" : "buy fails"} · ${safety.test.sellOk ? "sell works" : "sell fails"}`}</b></li>
            <li><span>Tax on buy / sell</span><b>{safety.test?.buyTaxPct != null ? `${safety.test.buyTaxPct.toFixed(1)}%` : "—"} / {safety.test?.sellTaxPct != null ? `${safety.test.sellTaxPct.toFixed(1)}%` : "—"}</b></li>
            <li><span>Top 10 holders</span><b>{safety.top10Pct != null ? `${safety.top10Pct.toFixed(1)}%` : "—"}</b></li>
          </ul>
          {safety.notes.length > 0 && <p className="note">{safety.notes.join(" ")}</p>}
          <p className="note" style={{ marginBottom: 0 }}>A simulation on the live chain, nothing sent; it cannot prove a token is safe. <Link href={`/check/robinhood/${v.token}`}>Full check</Link></p>
        </div>
      )}
      <div className="panel pad" style={{ marginBottom: 16 }}>
        <div className="lbl">HOW TO VOTE FOR {v.symbol.toUpperCase()}</div>
        <ol style={{ margin: "10px 0 14px", paddingLeft: 20, lineHeight: 1.7 }}>
          <li>Get $STOA on Robinhood Chain, and a little ETH for gas.</li>
          <li>Lock it on the Spotlight page: 1 locked $STOA is 1 vote.</li>
          <li>In the race table, put your votes on {v.symbol}. You can change them until the week closes.</li>
        </ol>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="cta" href="/spotlight#race">Lock and vote</Link>
          <Link className="ghost" href={`/trade?chain=robinhood&sell=ETH&buy=${STOA_CA}`}>Buy $STOA</Link>
          <Link className="ghost" href={`/check/robinhood/${v.token}`}>Check {v.symbol} first</Link>
        </div>
      </div>
      <div className="panel pad">
        <div className="lbl">SHARE</div>
        <p className="note">For {v.symbol}&apos;s team and community: this page and its card update as bids and votes change.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <a className="cta" href={`https://x.com/intent/post?text=${encodeURIComponent(share)}&url=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer">Share on X</a>
          <a className="ghost" href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(share)}`} target="_blank" rel="noopener noreferrer">Share on Telegram</a>
          <CopyButton text={url} label="Copy link" />
        </div>
        <p className="note" style={{ marginBottom: 0 }}>Slots are sponsored and not reviewed by Stoa. Payouts depend only on what projects bid; nothing is promised, and this is not financial advice.</p>
      </div>
    </section>
  );
}
