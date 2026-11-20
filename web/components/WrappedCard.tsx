"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { shareOrCopy } from "@/lib/share";
import type { Wrapped } from "@/lib/wrapped";

const usd = (v: number) => (v >= 1000 ? `$${(v / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}K` : `$${v.toLocaleString("en-US", { maximumFractionDigits: v >= 10 ? 0 : 2 })}`);
const num = (v: number) => (v >= 1e6 ? `${(v / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })}M` : v >= 1e3 ? `${(v / 1e3).toLocaleString("en-US", { maximumFractionDigits: 1 })}K` : v.toLocaleString("en-US", { maximumFractionDigits: 0 }));
const day = (t: number | null) => (t ? new Date(t * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—");
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The Wrapped trading card: tilts in 3D under the pointer, with a light that follows it; Gold cards carry a moving foil. */
export function WrappedCard({ w }: { w: Wrapped }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--rx", `${(0.5 - y) * 16}deg`); el.style.setProperty("--ry", `${(x - 0.5) * 20}deg`);
    el.style.setProperty("--mx", `${x * 100}%`); el.style.setProperty("--my", `${y * 100}%`);
  };
  const leave = () => { const el = ref.current; if (el) { el.style.removeProperty("--rx"); el.style.removeProperty("--ry"); } };
  const stoa = w.stoa.held + w.stoa.locked;
  return (
    <div className="wr-stage" onPointerMove={move} onPointerLeave={leave}>
      <div ref={ref} className={`wr-card wr-${w.edition.toLowerCase()}`}>
        <div className="wr-shine" aria-hidden="true" />
        <div className="wr-top">
          <span className="wr-brand"><img src="/logo.png" alt="" />STOA</span>
          <span className="wr-ed">{w.edition.toUpperCase()} EDITION</span>
        </div>
        <div className="wr-year">WRAPPED · 2026</div>
        <div className="wr-addr">{short(w.address)}</div>
        {w.swaps ? (
          <>
            <div className="wr-big">{usd(w.usd)}</div>
            <div className="wr-sub">routed through Stoa, in {w.swaps} {w.swaps === 1 ? "swap" : "swaps"}</div>
          </>
        ) : (
          <>
            <div className="wr-big" style={{ fontSize: 42 }}>No swaps yet</div>
            <div className="wr-sub">The first one compares every venue Stoa routes.</div>
          </>
        )}
        <div className="wr-grid">
          {w.swaps > 0 && <>
            <div><span>FAVORITE VENUE</span><b>{w.topVenue?.name ?? "—"}</b></div>
            <div><span>TOP TOKEN</span><b>{w.topToken?.symbol ?? "—"}</b></div>
            <div><span>BIGGEST SWAP</span><b>{w.biggest ? usd(w.biggest.usd) : "—"}</b></div>
            <div><span>FIRST SWAP</span><b>{day(w.first)}</b></div>
          </>}
          <div><span>$STOA</span><b>{stoa ? num(stoa) : "—"}</b></div>
          <div><span>SWAPS REFERRED</span><b>{w.referred}</b></div>
        </div>
        <div className="wr-chains">{w.chains.map((c) => <span key={c.key} className={c.swaps ? "on" : undefined}>{c.name} · {c.swaps}</span>)}</div>
        <div className="wr-foot">EVERY ROUTE COMPARED · STOADEX.COM</div>
      </div>
    </div>
  );
}

/** Share, copy, and a way to make your own when the card is someone else's. */
export function WrappedActions({ w }: { w: Wrapped }) {
  const { address } = useAccount();
  const [msg, setMsg] = useState("");
  const mine = address && address.toLowerCase() === w.address.toLowerCase();
  const url = `https://stoadex.com/wrapped/${w.address}?ref=${w.address}`;
  const text = w.swaps
    ? `My Stoa Wrapped: ${usd(w.usd)} routed in ${w.swaps} ${w.swaps === 1 ? "swap" : "swaps"}, each compared across every venue. ${w.edition} edition 🏛️`
    : "My Stoa Wrapped is waiting for its first swap 🏛️";
  const x = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  return (
    <div className="wr-actions">
      <a className="big pri" href={x} target="_blank" rel="noopener noreferrer">Share on X</a>
      <button className="big" type="button" onClick={async () => setMsg((await shareOrCopy(url, text)) === "copied" ? "Link copied" : "")}>{msg || "Copy link"}</button>
      {mine
        ? <Link className="big" href={`/trade?ref=${w.address}`}>Swap on Stoa</Link>
        : <Link className="big" href="/wrapped">Make your own</Link>}
      <p className="note">
        Read from the Stoa routers on Robinhood Chain and Elysium: every swap paid to this wallet, valued like Stats. Classic, then Marble with any $STOA, Gold with 1M $STOA or more held, or locked in Spotlight or Rug Cover.
        {" "}The link carries this wallet as referrer: anyone who swaps after opening it pays its referral share.
      </p>
    </div>
  );
}
