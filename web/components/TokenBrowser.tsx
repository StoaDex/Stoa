"use client";
import Link from "next/link";
import { useState } from "react";

type T = { address: string; symbol: string; name?: string; logo?: string };
type N = { key: string; name: string; tokens: T[] };

/** The token list: one network at a time, a search box, and the first 24 until asked. Every link stays in the page
 *  (search engines follow them all); the rest are only hidden. */
export default function TokenBrowser({ nets }: { nets: N[] }) {
  const [net, setNet] = useState(nets[0]?.key);
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);
  const k = q.trim().toLowerCase();
  const hit = (t: T) => !k || t.symbol.toLowerCase().includes(k) || (t.name ?? "").toLowerCase().includes(k) || t.address.toLowerCase() === k;
  return (
    <div className="panel pad tbrowse">
      <div className="tb-bar">
        {nets.length > 1 && (
          <div className="seg" role="tablist" aria-label="Network">
            {nets.map((n) => <button key={n.key} type="button" role="tab" aria-selected={net === n.key} className={net === n.key ? "on" : undefined} onClick={() => setNet(n.key)}>{n.name}</button>)}
          </div>
        )}
        <input type="search" placeholder="Search name, ticker or address" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tokens" />
      </div>
      {nets.map((n) => {
        const shown = n.tokens.filter(hit);
        return (
          <div key={n.key} hidden={net !== n.key}>
            <div className="lbl" style={{ margin: "14px 2px 10px" }}>{n.tokens.length} TOKENS ON {n.name.toUpperCase()}</div>
            <div className="tb-grid">
              {n.tokens.map((t) => {
                const i = shown.indexOf(t);
                return (
                  <Link key={t.address} href={`/tokens/${n.key}/${t.address}`} className="ghost tb-item" hidden={i < 0 || (!all && !k && i >= 24)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {t.logo ? <img src={t.logo} alt="" width={24} height={24} loading="lazy" /> : <span className="tb-glyph">{t.symbol.slice(0, 1)}</span>}
                    <span className="tb-sym">{t.symbol}</span>
                  </Link>
                );
              })}
            </div>
            {!shown.length && <p className="note">No token matches “{q}”.</p>}
            {!all && !k && shown.length > 24 && <button type="button" className="ghost" style={{ display: "flex", margin: "14px auto 0" }} onClick={() => setAll(true)}>Show all {shown.length}</button>}
          </div>
        );
      })}
    </div>
  );
}
