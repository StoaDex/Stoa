"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";

/** The section under the 3D walk on the home page: every live feature as a glass card with its own small animation,
 *  stacked as you scroll (each card slides over the last), then how Stoa is kept safe. Only live features; the
 *  animations are illustrations, they show no live figures. */
type F = { h: string; t: string; k: string; d: string; tag?: string; v: React.ReactNode };

const FEATURES: F[] = [
  { h: "/trade", t: "Swap", k: "TRADE", d: "Every venue Stoa routes, compared for your exact amount, in one block. Your swap fills on the one that pays the most.", v: <VSwap /> },
  { h: "/stocks", t: "Stock tokens", k: "STOCKS", tag: "Robinhood", d: "Every Robinhood Stock Token with Robinhood's price next to the on-chain price, a swap where Stoa routes it, a watchlist and price alerts.", v: <VStocks /> },
  { h: "/docs/limit-orders", t: "Limit orders", k: "SET A PRICE", tag: "Robinhood", d: "Sell at a price you set. Stoa's keeper fills it through the router when the market gets there, never below your minimum.", v: <VLimit /> },
  { h: "/check", t: "Safety check", k: "BEFORE YOU BUY", tag: "Free", d: "Paste any token address at stoadex.com/check: Stoa simulates the buy and the sell back on the live chain and shows hidden taxes, whether it sells and who holds it. Share the result on X.", v: <VSafety /> },
  { h: "/cover", t: "Rug Cover", k: "PONS TOKENS", tag: "Robinhood", d: "Buy a Pons token with its creator's ETH bonded behind a 7-day promise not to sell. If the creator breaks it, buyers claim from the bond.", v: <VCover /> },
  { h: "/launches", t: "Launches", k: "NEW TOKENS", tag: "Robinhood", d: "New Pons tokens on their curve or graduated, with what the creator's wallet bought and still holds.", v: <VCurve /> },
  { h: "/spotlight", t: "Spotlight", k: "WEEKLY SLOT", tag: "Robinhood", d: "Projects bid ETH for a weekly spot on Stoa. $STOA lockers vote and receive the ETH. Week 1 opens 23 November.", v: <VSpot /> },
  { h: "/portfolio", t: "Portfolio", k: "YOUR WALLET", d: "Every token you hold, with profit and loss for what you bought through Stoa, valued with the router's own quote.", v: <VPnl /> },
  { h: "/wrapped", t: "Wrapped", k: "SHARE IT", d: "Your swaps on Stoa as a trading card: volume, favorite venue, top token. Tilt it, share it.", v: <VCard /> },
  { h: "/docs/api", t: "API for bots", k: "BUILD", d: "The route and a ready-to-send swap in one call, with your own referrer.", v: <VApi /> },
];

const TRUST = [
  { h: "/docs/security-review", b: "Independent security review", s: "by Hey Research Lab. Findings are published once fixed." },
  { h: "/docs/admin", b: "48-hour timelock", s: "on every admin change, signed by a 2-of-3 Safe and public before it runs." },
  { h: "https://github.com/StoaDex/Stoa", b: "Open source", s: "Every contract and this site, on GitHub." },
  { h: "/docs/bug-bounty", b: "Security reports", s: "Found a bug? Report it privately on GitHub and get credited." },
];

export default function HomeLive() {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const els = root.current?.querySelectorAll<HTMLElement>("[data-in]");
    if (!els) return;
    // each card animates while it is on screen
    const io = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle("in", e.isIntersecting)), { threshold: 0.2 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return (
    <section id="live" className="homelive" ref={root}>
      <div className="hl-in">
        <div className="hl-head" data-in>
          <Colonnade />
          <div className="hl-k">ON STOA TODAY</div>
          <h2>Everything you can do, in one place</h2>
          <p>Keep scrolling. Tap a card to open it.</p>
        </div>
        <div className="hl-stack">
          {FEATURES.map((f, i) => (
            <Link key={f.t} href={f.h} className="hl-card" style={{ "--i": i } as React.CSSProperties} data-in>
              <div className="hl-vis" aria-hidden="true">{f.v}</div>
              <div className="hl-txt">
                <div className="hl-k2"><span>{ROMAN[i] ?? i + 1} · {f.k}</span>{f.tag && <b>{f.tag}</b>}</div>
                <h3>{f.t}</h3>
                <p>{f.d}</p>
                <span className="hl-go">Open {f.t} →</span>
              </div>
            </Link>
          ))}
        </div>
        <div className="hl-temple">
        <div className="hl-ent" data-in>
          <svg className="pedi" viewBox="0 0 600 60" preserveAspectRatio="none" aria-hidden="true"><path d="M2 59 L300 3 L598 59 Z" /><path d="M40 52 L300 12 L560 52" className="fine" /></svg>
          <span className="hl-k">HOW IT IS KEPT SAFE</span>
        </div>
        <div className="hl-trust">
          {TRUST.map((t, i) => {
            const st = { "--d": `${i * 90}ms` } as React.CSSProperties;
            const body = <><b>{t.b}</b><span>{t.s}</span></>;
            return t.h.startsWith("http")
              ? <a key={t.b} href={t.h} target="_blank" rel="noopener noreferrer" data-in style={st}>{body}</a>
              : <Link key={t.b} href={t.h} data-in style={st}>{body}</Link>;
          })}
        </div>
        <div className="hl-steps" aria-hidden="true"><i /><i /><i /></div>
        </div>
        <div className="btns hl-end" data-in>
          <Link className="cta" href="/trade">Start trading</Link>
          <Link className="ghost" href="/docs">Read the docs</Link>
        </div>
      </div>
    </section>
  );
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

/** A temple front drawn in line: pediment, entablature, six fluted columns and three steps. It draws itself when the
 *  section comes into view. Decoration only. */
function Colonnade() {
  const cols = [0, 1, 2, 3, 4, 5].map((i) => 70 + i * 92);
  return (
    <svg className="colo" viewBox="0 0 600 230" aria-hidden="true">
      <path d="M40 74 L300 14 L560 74 Z" />
      <path d="M58 66 L300 26 L542 66" className="fine" />
      <path d="M30 74 H570 V92 H30 Z" />
      <path d="M36 100 H564" className="fine" />
      {cols.map((x) => (
        <g key={x}>
          <path d={`M${x - 20} 104 H${x + 20} V112 H${x - 20} Z`} />
          <path d={`M${x - 14} 112 V186 M${x + 14} 112 V186`} />
          <path d={`M${x - 5} 116 V182 M${x + 5} 116 V182`} className="fine" />
          <path d={`M${x - 20} 186 H${x + 20} V194 H${x - 20} Z`} />
        </g>
      ))}
      <path d="M24 194 H576 V202 H24 Z" />
      <path d="M14 202 H586 V210 H14 Z" />
      <path d="M4 210 H596 V218 H4 Z" />
    </svg>
  );
}

/* ---- illustrations: plain SVG and CSS, animated only while their card is in view (.in) ---- */
const d = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

function VSwap() {
  const rows: [string, number, boolean][] = [["Venue A", 64, false], ["Venue B", 94, true], ["Venue C", 50, false]];
  return (
    <div className="v-swap">
      {rows.map(([n, w, best], i) => (
        <div key={n} className={`v-row${best ? " best" : ""}`} style={{ ...d(i * 180), "--w": `${w}%` } as React.CSSProperties}>
          <span>{best ? "✓ " : ""}{n}</span><em><i /></em>
        </div>
      ))}
      <div className="v-cap">same block · same amount</div>
    </div>
  );
}

function VLimit() {
  return (
    <svg className="v-svg v-limit" viewBox="0 0 300 150">
      <line x1="10" y1="48" x2="290" y2="48" className="target" />
      <text x="16" y="40" className="vl">your price</text>
      <path d="M10 124 L50 112 L80 118 L115 94 L150 100 L185 72 L215 78 L245 47 L290 36" className="price" pathLength={1} />
      <circle cx="245" cy="47" r="7" className="hit" />
      <text x="245" y="74" textAnchor="middle" className="vl vok">filled</text>
    </svg>
  );
}

function VStocks() {
  // illustration only: no live prices
  return (
    <div className="v-stocks">
      <div className="vs-h"><span>Token</span><span>Robinhood</span><span>On-chain</span></div>
      {["Tesla", "Nvidia", "S&P 500", "Apple"].map((t, i) => (
        <div key={t} className="vs-r" style={d(200 + i * 220)}>
          <b>{t}</b><span className="bar" /><span className="bar on" />
        </div>
      ))}
    </div>
  );
}

function VSafety() {
  return (
    <div className="v-safety">
      <svg viewBox="0 0 60 70" className="shield"><path d="M30 4 L54 13 V34 C54 50 43 60 30 66 C17 60 6 50 6 34 V13 Z" /><path d="M19 35 L27 43 L42 27" className="tick" pathLength={1} /></svg>
      <ul>
        {["Buy tax", "Sell tax", "Sells back", "Holders"].map((l, i) => <li key={l} style={d(250 + i * 250)}><span>{l}</span><b>checked</b></li>)}
      </ul>
      <i className="scan" />
    </div>
  );
}

function VCover() {
  return (
    <div className="v-cover">
      <div className="ringw">
        <svg viewBox="0 0 120 120" className="ring"><circle cx="60" cy="60" r="50" className="bg" /><circle cx="60" cy="60" r="50" className="fg" pathLength={1} /></svg>
        <div className="mid"><b>7</b><span>days</span></div>
      </div>
      <div className="lock"><span>Creator&apos;s ETH</span><i>bonded</i></div>
    </div>
  );
}

function VCurve() {
  const p = "M10 140 C 120 136, 200 110, 250 30";
  return (
    <svg className="v-svg v-curve" viewBox="0 0 300 150">
      <path d={p} className="curve" pathLength={1} />
      <line x1="250" y1="12" x2="250" y2="146" className="grad" />
      <text x="242" y="22" textAnchor="end" className="vl">graduation</text>
      <circle r="6" className="dot"><animateMotion dur="3.6s" repeatCount="indefinite" path={p} /></circle>
      <text x="260" y="58" className="vl vok">V4 pool</text>
    </svg>
  );
}

function VSpot() {
  return (
    <div className="v-spot">
      <i className="beam" />
      <div className="bars">
        {[46, 82, 60].map((h, i) => <span key={i} style={{ ...d(i * 180), "--h": `${h}%` } as React.CSSProperties} className={i === 1 ? "win" : undefined} />)}
      </div>
      <div className="v-cap">votes from $STOA lockers</div>
    </div>
  );
}

function VPnl() {
  const l = "M10 118 L45 112 L75 120 L105 96 L140 102 L170 80 L205 86 L240 58 L290 42";
  return (
    <svg className="v-svg v-pnl" viewBox="0 0 300 150">
      <path d={`${l} L290 150 L10 150 Z`} className="area" />
      <path d={l} className="line" pathLength={1} />
      <text x="290" y="28" textAnchor="end" className="vl vok">profit and loss</text>
    </svg>
  );
}

function VCard() {
  return (
    <div className="v-card">
      <div className="tc"><span className="tl">STOA WRAPPED</span><b>Your swaps</b><span className="tr">volume · venue · top token</span><i className="shine" /></div>
    </div>
  );
}

function VApi() {
  return (
    <div className="v-api">
      <span className="l" style={d(0)}>GET /api/v1/quote</span>
      <span className="l" style={d(450)}>  ?sellToken=native&amp;buyToken=…</span>
      <span className="l vok" style={d(900)}>→ route · minOut · tx</span>
    </div>
  );
}
