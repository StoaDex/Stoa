import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/ui";
import QuestCheck from "@/components/QuestCheck";
import { QUEST, questDate, questSpan } from "@/lib/quest";

export const metadata: Metadata = {
  title: "Stoa Explorer quest",
  description: `Swap on Stoa on Robinhood Chain, follow and share, and enter the draw for ${QUEST.pool}. ${QUEST.winners} winners.`,
  alternates: { canonical: "/quest" },
};

export default function QuestPage() {
  const steps: [string, string, React.ReactNode][] = [
    ["1", "Follow @StoaDex on X", <>Opened from the quest page on Zealy.</>],
    ["2", "Quote the quest post on X", <>Add a line of your own and paste the link on Zealy.</>],
    ["3", `Swap $${QUEST.minUsd} or more on Stoa`, <>Any pair on Robinhood Chain, through <Link href="/trade">stoadex.com/trade</Link>. Checked on-chain.</>],
    ["4", `Hold $${QUEST.holdUsd} of $STOA`, <>In your wallet or locked, when you claim. <Link href="/token">About $STOA</Link>. Checked on-chain.</>],
    ["+1", "Bonus: share a real result", <>Post a <Link href="/check">safety check</Link> result or your <Link href="/wrapped">Wrapped</Link> card on X and mention @StoaDex. More XP.</>],
    ["+1", "Bonus: lock any $STOA", <>In <Link href="/spotlight#lock">Spotlight</Link>, where it votes and earns the ETH projects bid. More XP. Checked on-chain.</>],
  ];
  return (
    <section className="page" style={{ maxWidth: 760 }}>
      <PageHead eyebrow="QUEST · ROBINHOOD CHAIN" title={QUEST.name}>
        Four tasks and two bonuses. {QUEST.winners} winners share {QUEST.pool}, run on Zealy.
      </PageHead>
      <div className="panel pad">
        <div className="rowx"><div className="lbl">THE TASKS</div><span className="chip">{questSpan()}</span></div>
        <ol className="qsteps">
          {steps.map(([n, t, d]) => <li key={t}><span className="qn">{n}</span><span><b>{t}</b><small>{d}</small></span></li>)}
        </ol>
        {QUEST.url
          ? <a className="big pri" href={QUEST.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>Open the quest on Zealy ↗</a>
          : <p className="note">The Zealy page opens with the quest on {questDate(QUEST.start)}.</p>}
      </div>
      <div style={{ marginTop: 16 }}><QuestCheck /></div>
      <details className="panel pad fold-panel" style={{ marginTop: 16 }}>
        <summary className="lbl">RULES</summary>
        <ul className="qrules">
          <li>{QUEST.winners} winners × $5 in $STOA ({QUEST.pool}), picked on Zealy after the quest closes from entrants who completed tasks 1 to 4. Bonuses add XP.</li>
          <li>Only swaps through Stoa&apos;s router on Robinhood Chain between {questDate(QUEST.start)} and {questDate(QUEST.end)}, worth ${QUEST.minUsd} or more, count. Any pair.</li>
          <li>One entry per person. Wash trading, bot wallets and copies of one person are removed before the draw.</li>
          <li>Prizes are sent in $STOA on Robinhood Chain to the winning wallet within 7 days of the close. Stoa will never DM you or ask for a key or a payment.</li>
          <li>Swaps carry the usual risks; nothing here is investment advice.</li>
        </ul>
      </details>
    </section>
  );
}
