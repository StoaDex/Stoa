"use client";
import Link from "next/link";
import { TokenIcon } from "./ui";
import { useSpotlightWinners } from "./spotlightData";

/** This week's Spotlight winners as cards (Launches, Tokens). Renders nothing until there are winners. */
export default function SpotlightStrip() {
  const ws = useSpotlightWinners();
  if (!ws.length) return null;
  return (
    <div className="panel pad" style={{ marginBottom: 20 }}>
      <div className="rowx">
        <div className="lbl">SPOTLIGHT</div>
        <Link href="/spotlight" className="chip" title="Projects bid ETH for these slots; $STOA holders voted for them and earn the bids">Sponsored · chosen by $STOA holders</Link>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 10, marginTop: 14 }}>
        {ws.map((t) => (
          <Link key={t.address} href={`/trade?chain=robinhood&buy=${t.address}`} className="ghost" style={{ borderColor: "var(--line)", background: "#fff", minHeight: 52, justifyContent: "flex-start" }}>
            <TokenIcon t={t} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.symbol}</span>
            <small style={{ marginLeft: "auto", color: "var(--muted)" }}>Trade</small>
          </Link>
        ))}
      </div>
      <p className="note">Projects bid ETH for these slots and $STOA holders voted for them. Not reviewed by Stoa: check the contract before you buy.</p>
    </div>
  );
}

/** The same winners as a row at the top of Trade's token list (Robinhood Chain only). A pick goes through the same
 *  import path as a pasted address, so an unlisted token keeps its "unverified" warning. */
export function SpotlightPicks({ onImport }: { onImport: (address: string) => void }) {
  const ws = useSpotlightWinners();
  if (!ws.length) return null;
  return (
    <div style={{ padding: "4px 8px 8px", borderBottom: "1px solid var(--line)", marginBottom: 6 }}>
      <div className="rowx" style={{ marginBottom: 6 }}>
        <small style={{ fontFamily: "var(--num)", letterSpacing: ".12em", color: "var(--muted)" }}>SPOTLIGHT</small>
        <Link href="/spotlight" style={{ fontSize: 11.5, color: "var(--muted)" }}>Sponsored</Link>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {ws.map((t) => (
          <button key={t.address} type="button" className="ghost" style={{ padding: "6px 10px", minHeight: 0 }} onClick={() => onImport(t.address)}>
            <TokenIcon t={t} />{t.symbol}
          </button>
        ))}
      </div>
    </div>
  );
}
