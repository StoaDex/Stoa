"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Header from "./Header";
import StoaCA from "./StoaCA";
import StoaPulse from "./StoaPulse";
import HomeLive from "./HomeLive";
import SpotlightBanner from "./SpotlightBanner";
import PointsBanner from "./PointsBanner";
import Footer from "./Footer";
import MobileNav from "./MobileNav";
import { CA as STOA_CA } from "@/lib/stoaAddress";

type Stop = { n: string; l: string; p: number; a: number };
type SceneApi = { stops: Stop[]; setTarget(p: number): void; jump(p: number): void; setPaused?(v: boolean): void; dispose(): void };

const CARDS: { a: number; b: number; body: React.ReactNode }[] = [
  { a: 0.12, b: 0.225, body: <><div className="k">THE STOA <b>ROBINHOOD CHAIN · ELYSIUM</b></div><h2>A market built like a stoa</h2><p>Every pool is a column. Stoa reads each one on-chain, every block, and shows you what every venue would pay before you sign.</p></> },
  { a: 0.235, b: 0.335, body: <><div className="k">I · TRADE <b>POOL</b></div><h2>WHYPE / USDC</h2><p>The light inside the column is live depth. Bids on one side, asks on the other.</p>
      <div className="rows"><span>Pricing</span><span>Maker-quoted</span><span>Quote refresh</span><span>Every block</span><span>Fee</span><span>2 bps</span><span>Status</span><span className="live">Live · awaiting makers</span></div>
      <Link className="go" href="/trade">Trade</Link></> },
  { a: 0.345, b: 0.455, body: <><div className="k">II · EARN <b>LP VAULTS</b></div><h2>Own a piece of the pool</h2><p>Vault shares that grow with every fee. Each ring that lights up is fees flowing to every share.</p><Link className="go" href="/earn">Earn</Link></> },
  { a: 0.465, b: 0.575, body: <><div className="k">III · RUN A POOL <b>CURATORS</b></div><h2>Makers hold the center</h2><p>Bring a price feed or a strategy, post a bond, and quote. Each orbiting light is a maker refreshing its price.</p><Link className="go" href="/curators">Become a curator</Link></> },
  { a: 0.585, b: 0.695, body: <><div className="k">IV · BUILD <b>SDK</b></div><h2>Every pool is a building block</h2><p>Router, SDK and hooks. Stack Stoa pools into vaults, aggregators and apps across Elysium and Robinhood Chain.</p><Link className="go" href="/docs/router-sdk">Read the docs</Link></> },
  { a: 0.71, b: 0.86, body: <><div className="k">THE ROUTER <b>EVERY VENUE</b></div><h2>Every column, checked</h2><p>Before you sign, the router compares every venue: maker quotes, Uniswap, Aero, Ramses and Liquidity Book on Elysium, and Uniswap V2, V3, V4, Aero, Ramses, Metric and Pons launch curves on Robinhood Chain. Then it fills where you get the most.</p></> },
  { a: 0.9, b: 1.01, body: <><div className="k">V · THE AGORA <b>STOA</b></div><h2>Enter the market</h2><p>Trade, earn, run a pool or build on it. The doors are open.</p>
      <StoaCA />
      <div className="btns"><Link className="cta" href="/trade">Launch app</Link><Link className="ghost" href="/docs">Read the docs</Link></div></> },
];

export default function Journey() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const api = useRef<SceneApi | null>(null);
  const [p, setP] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [stops, setStops] = useState<Stop[]>([]);
  const [past, setPast] = useState(false); // scrolled into the plain section under the 3D walk

  useEffect(() => {
    let alive = true;
    let last = -1;
    // the hero is already on screen (server-drawn); the 3D walk loads once the page is idle, so it never delays the
    // first paint or the first tap
    const idle = (f: () => void) => ("requestIdleCallback" in window ? (window as Window & { requestIdleCallback: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback(f, { timeout: 1500 }) : setTimeout(f, 300));
    idle(async () => {
      // no 3D walk where it would crawl: no GPU (software WebGL such as SwiftShader or llvmpipe) or Data Saver on.
      // The plain hero below has the same text and buttons.
      if (slowGL()) { if (alive) { setFailed(true); setReady(true); } return; }
      try {
        const { createScene } = await import("@/lib/scene");
        if (!alive || !canvas.current) return;
        const s: SceneApi = createScene(canvas.current, {
          onReady: () => alive && setReady(true),
          onProgress: (v: number) => { if (Math.abs(v - last) > 0.002) { last = v; setP(v); } },
        });
        api.current = s;
        setStops(s.stops);
        const read = () => { const m = trackEnd(); s.setTarget(m > 0 ? Math.min(1, scrollY / m) : 0); const pw = scrollY > m + innerHeight * 0.25; setPast(pw); s.setPaused?.(scrollY > m + innerHeight); document.body.classList.toggle("past-walk", pw); };
        addEventListener("scroll", read, { passive: true });
        read();
        (s as SceneApi & { _off?: () => void })._off = () => removeEventListener("scroll", read);
      } catch {
        if (alive) { setFailed(true); setReady(true); }
      }
    });
    return () => {
      alive = false;
      const s = api.current as (SceneApi & { _off?: () => void }) | null;
      s?._off?.(); s?.dispose();
      document.body.classList.remove("past-walk");
    };
  }, []);

  const go = (target: number) => {
    const m = trackEnd();
    window.scrollTo({ top: target * m, behavior: "smooth" });
  };
  const hero = Math.max(0, 1 - p / 0.05);
  let active = -1;
  stops.forEach((s, i) => { if (p >= s.a - 0.06) active = i; });

  return (
    <>
      <canvas id="gl" ref={canvas} aria-hidden="true" />
      <div id="load" className={ready ? "gone" : undefined} aria-hidden="true" />
      <Header extra={<SoundButton />} />

      {failed ? (
        <section className="hero" style={{ position: "relative" }}>
          <h1>STOA</h1><p>THE MARKET, QUOTED LIVE.</p><span className="sub">Every route compared, on Robinhood Chain and Elysium.</span>
          <div className="heroca"><StoaCA short /></div>
          <StoaPulse />
          <HeroButtons />
        </section>
      ) : (
        <>
          <section className="hero" style={{ opacity: hero, transform: `translateY(${(1 - hero) * -30}px)` }}>
            <h1>STOA</h1><p>THE MARKET, QUOTED LIVE.</p><span className="sub">Every route compared, on Robinhood Chain and Elysium.</span>
            <div className="heroca"><StoaCA short /></div>
          <StoaPulse />
            <HeroButtons />
          </section>
          <div className="hint" style={{ opacity: Math.max(0, 1 - p / 0.02) }}><span>SCROLL TO DESCEND</span><i /></div>
          {CARDS.map((c, i) => <article key={i} className={`card${!past && p >= c.a && p <= c.b ? " show" : ""}`}>{c.body}</article>)}
          <nav className="rail" aria-label="Journey" style={past ? { opacity: 0, pointerEvents: "none" } : undefined}>
            {stops.map((s, i) => (
              <span key={s.n} style={{ display: "contents" }}>
                <button type="button" className={i === active ? "on" : undefined} aria-label={`${s.n} ${s.l}`} onClick={() => go(s.p)}>
                  <span className="n">{s.n} · {s.l.toUpperCase()}</span><span className="t" />
                </button>
                {i < stops.length - 1 && <><span className="tick" /><span className="tick" /></>}
              </span>
            ))}
          </nav>
          <div id="track" />
        </>
      )}
      <HomeLive />
      <div className="homefoot"><Footer /></div>
      <MobileNav />
    </>
  );
}

/** Where the 3D walk ends: the bottom of #track, as a scroll offset. */
function trackEnd() {
  const t = document.getElementById("track");
  return t ? t.offsetTop + t.offsetHeight - innerHeight : document.documentElement.scrollHeight - innerHeight;
}

/** The hero's actions: trade first, then a jump to everything that is live. */
function HeroButtons() {
  return (
    <div className="herobtns">
      <Link className="cta" href="/trade">Trade now</Link>
      <a className="ghost" href="#live">What&apos;s on Stoa ↓</a>
      <div className="herogo" aria-label="Start here">
        <Link href={`/trade?chain=robinhood&buy=${STOA_CA}`}>Buy $STOA</Link>
        <Link href="/stocks">Buy stock tokens</Link>
        <Link href="/trade?chain=robinhood&sell=ETH&buy=USDG">ETH → USDG</Link>
        <Link href="/bridge">Bridge in</Link>
        <Link href="/check">Check a token</Link>
      </div>
      <div className="herospot"><SpotlightBanner variant="pill" /></div>
      <div className="herospot"><PointsBanner variant="pill" /></div>
    </div>
  );
}

/** Generated sea + soft pad. Starts only on a click (browsers block autoplay). */
function SoundButton() {
  const a = useRef<{ ac: AudioContext; master: GainNode; on: boolean; timer: number } | null>(null);
  const [on, setOn] = useState(false);
  useEffect(() => () => { if (a.current) { clearInterval(a.current.timer); a.current.ac.close(); } }, []);
  const toggle = async () => {
    try {
      if (!a.current) {
        const ac = new AudioContext();
        const master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
        const len = ac.sampleRate * 4, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
        let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
        const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
        const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 520;
        const sea = ac.createGain(); sea.gain.value = 0.35;
        const lfo = ac.createOscillator(); lfo.frequency.value = 0.09; const lg = ac.createGain(); lg.gain.value = 0.22; lfo.connect(lg); lg.connect(sea.gain);
        src.connect(lp); lp.connect(sea); sea.connect(master); src.start(); lfo.start();
        const pad = ac.createGain(); pad.gain.value = 0.035; pad.connect(master);
        [146.83, 220, 277.18, 329.63].forEach((f, i) => { const o = ac.createOscillator(); o.frequency.value = f; o.detune.value = (i - 1.5) * 4; o.connect(pad); o.start(); });
        const timer = window.setInterval(() => {
          if (!a.current?.on) return;
          const o = ac.createOscillator(), g = ac.createGain();
          o.frequency.value = [587.33, 659.25, 880, 987.77][Math.floor(Math.random() * 4)];
          g.gain.setValueAtTime(0, ac.currentTime); g.gain.linearRampToValueAtTime(0.05, ac.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 3.5);
          o.connect(g); g.connect(master); o.start(); o.stop(ac.currentTime + 3.6);
        }, 5200);
        a.current = { ac, master, on: false, timer };
      }
      const s = a.current;
      s.on = !s.on;
      if (s.ac.state === "suspended") await s.ac.resume();
      s.master.gain.setTargetAtTime(s.on ? 0.9 : 0, s.ac.currentTime, 0.4);
      setOn(s.on);
    } catch { /* audio unavailable */ }
  };
  return (
    <button className="ghost" type="button" aria-pressed={on} aria-label={on ? "Sound on" : "Sound off"} onClick={toggle}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <path d="M4 9v6h4l5 4V5L8 9H4z" /><path d={on ? "M16 9a4 4 0 010 6M19 6a8 8 0 010 12" : "M16 9l5 6M21 9l-5 6"} />
      </svg>
      <span className="hide-m">{on ? "Sound on" : "Sound off"}</span>
    </button>
  );
}

/** True when the 3D walk should be skipped: Data Saver, no WebGL, or WebGL drawn in software rather than on a GPU. */
function slowGL(): boolean {
  try {
    if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return true;
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return true;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const r = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(r);
  } catch { return true; }
}
