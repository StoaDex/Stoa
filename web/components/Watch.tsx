"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NETS, netByKey } from "@/lib/networks";
import { fetchPrices, fmtUsd, usePrices } from "@/lib/prices";
import type { Token } from "@/lib/tokens";
import { Ticker } from "./ui";
import { addAlert, alertText, crossed, isWatched, markFired, removeAlert, toggleWatch, useWatch, type PriceAlert, type Watch } from "@/lib/watchlist";

type StockRef = { address: string; referencePriceUsd: number | null; halted: boolean; onChain: { priceUsd: number } | null };
/** on-chain price vs Robinhood's, in percent, per stock token address (lowercase) */
async function stockGaps(): Promise<Record<string, number>> {
  const j = (await (await fetch("/api/v1/stocks")).json()) as { stocks: StockRef[] };
  const out: Record<string, number> = {};
  for (const s of j.stocks) if (s.referencePriceUsd && s.onChain?.priceUsd && !s.halted) out[s.address.toLowerCase()] = ((s.onChain.priceUsd - s.referencePriceUsd) / s.referencePriceUsd) * 100;
  return out;
}

const tradeHref = (w: { chain: string; address: string; via?: string }) => `/trade?chain=${w.chain}${w.via ? `&sell=${w.via}` : ""}&buy=${w.address}`;

const asToken = (w: Pick<Watch, "symbol" | "address" | "logo">): Token =>
  ({ symbol: w.symbol, name: w.symbol, address: w.address as Token["address"], decimals: 18, glyph: w.symbol.slice(0, 1), tone: "other", logo: w.logo });

/** ☆ / ★ button that follows a token in this browser's watchlist */
export function WatchStar({ chain, address, symbol, logo, via, label, small }: { chain: string; address: string; symbol: string; logo?: string; via?: string; label?: boolean; small?: boolean }) {
  const s = useWatch();
  const on = isWatched(s, chain, address);
  return (
    <button type="button" className={`ghost star${on ? " on" : ""}${small ? " sm" : ""}`} aria-pressed={on} aria-label={label ? `${on ? "Watching" : "Watch"} ${symbol}` : on ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`}
      title={on ? "In your watchlist" : "Add to watchlist"} onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleWatch({ chain, address, symbol, logo, via }); }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
        <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" />
      </svg>
      {label && <span>{on ? "Watching" : "Watch"}</span>}
    </button>
  );
}

function usePermission() {
  const [p, setP] = useState<NotificationPermission | "unsupported">("default");
  useEffect(() => { setP(typeof Notification === "undefined" ? "unsupported" : Notification.permission); }, []);
  const ask = async () => {
    if (typeof Notification === "undefined") return;
    // phones show notifications through the service worker (the same one the installed app uses)
    try { if ("serviceWorker" in navigator && location.protocol === "https:") await navigator.serviceWorker.register("/sw.js"); } catch { /* notifications still work on desktop */ }
    setP(await Notification.requestPermission());
  };
  return { p, ask };
}

function AlertForm({ w, price, gap, onDone }: { w: Watch; price?: number; gap?: number; onDone: () => void }) {
  const [kind, setKind] = useState<"price" | "gap">("price");
  const [gdir, setGdir] = useState<PriceAlert["dir"]>("below");
  const [v, setV] = useState(price ? String(Number(price.toPrecision(4))) : "");
  const [g, setG] = useState("1");
  const target = Number(kind === "gap" ? g : v);
  const ok = isFinite(target) && target > 0 && (kind === "price" || target <= 25);
  const dir: PriceAlert["dir"] = kind === "gap" ? gdir : price && target < price ? "below" : "above";
  return (
    <form className="alertform" onSubmit={(e) => { e.preventDefault(); if (!ok) return; addAlert({ chain: w.chain, address: w.address, symbol: w.symbol, dir, price: target, kind }); onDone(); }}>
      {gap !== undefined && (
        <div className="seg" role="tablist" style={{ alignSelf: "flex-start" }}>
          <button type="button" role="tab" className={kind === "price" ? "on" : undefined} aria-selected={kind === "price"} onClick={() => setKind("price")}>Price</button>
          <button type="button" role="tab" className={kind === "gap" ? "on" : undefined} aria-selected={kind === "gap"} onClick={() => setKind("gap")}>Gap vs Robinhood</button>
        </div>
      )}
      {kind === "gap" ? (
        <>
          <label className="note" style={{ margin: 0 }}>Alert when {w.symbol} on-chain is at least this much {gdir === "below" ? "cheaper" : "dearer"} than Robinhood&apos;s price (now {gap! >= 0 ? "+" : ""}{gap!.toFixed(2)}%)</label>
          <div style={{ display: "flex", gap: 8 }}>
            <select className="ghost" value={gdir} onChange={(e) => setGdir(e.target.value as PriceAlert["dir"])} aria-label="Cheaper or dearer on-chain"><option value="below">Cheaper</option><option value="above">Dearer</option></select>
            <input inputMode="decimal" autoFocus placeholder="%" value={g} onChange={(e) => setG(e.target.value.replace(/[^0-9.]/g, ""))} aria-label={`Gap in percent for ${w.symbol}`} style={{ width: 90 }} />
            <button className="cta" type="submit" disabled={!ok}>Set</button>
            <button className="ghost" type="button" onClick={onDone}>Cancel</button>
          </div>
        </>
      ) : (
      <>
      <label className="note" style={{ margin: 0 }}>Alert when {w.symbol} is {ok ? dir : "at"}</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input inputMode="decimal" autoFocus placeholder="Price in USD" value={v} onChange={(e) => setV(e.target.value.replace(/[^0-9.]/g, ""))} aria-label={`Alert price for ${w.symbol} in USD`} />
        <button className="cta" type="submit" disabled={!ok}>Set</button>
        <button className="ghost" type="button" onClick={onDone}>Cancel</button>
      </div>
      </>
      )}
    </form>
  );
}

/** The watchlist with live prices and price alerts. `chain` limits it to one network. */
export function WatchlistPanel({ chain, empty }: { chain?: string; empty?: React.ReactNode }) {
  const s = useWatch();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [form, setForm] = useState<string | null>(null);
  const { p, ask } = usePermission();
  const nets = NETS.filter((n) => n.deployed && (!chain || n.key === chain));
  const getters = Object.fromEntries(nets.map((n) => [n.key, usePrices(n, s.watch.filter((w) => w.chain === n.key).map(asToken))])); // eslint-disable-line react-hooks/rules-of-hooks
  const watch = s.watch.filter((w) => getters[w.chain]);
  const gaps = useQuery({ queryKey: ["stock-gaps"], queryFn: stockGaps, enabled: watch.some((w) => w.chain === "robinhood"), staleTime: 60_000 }).data;
  if (!mounted) return null;
  if (!watch.length) return empty ? <>{empty}</> : null;
  const alerts = s.alerts.filter((a) => getters[a.chain]);
  return (
    <div className="panel pad watchlist" style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div className="lbl">YOUR WATCHLIST · {watch.length}</div>
        {alerts.length > 0 && p === "default" && <button className="ghost" type="button" onClick={ask}>Turn on alert notifications</button>}
      </div>
      <div className="wl">
        {watch.map((w) => {
          const price = getters[w.chain]?.(asToken(w));
          const id = `${w.chain}:${w.address}`;
          return (
            <div key={id} className="wlrow">
              <div className="wlhead">
                <Link href={tradeHref(w)} className="wlsym">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {w.logo && !w.logo.includes("cdn.robinhood.com") ? <img src={w.logo} alt="" width={26} height={26} loading="lazy" /> : <Ticker symbol={w.symbol} size={26} />}
                  <b>{w.symbol}</b>{!chain && <small>{netByKey(w.chain)?.short}</small>}
                </Link>
                <span className="wlprice">{price ? fmtUsd(price.usd) : "—"}{price?.ch24 != null && <small className={price.ch24 >= 0 ? "up" : "dn"}>{price.ch24 >= 0 ? "+" : ""}{price.ch24.toFixed(1)}%</small>}</span>
                <span className="wlbtns">
                  <button className="ghost" type="button" onClick={() => setForm(form === id ? null : id)} aria-expanded={form === id}>Alert</button>
                  <Link className="ghost" href={tradeHref(w)}>Trade</Link>
                  <WatchStar chain={w.chain} address={w.address} symbol={w.symbol} logo={w.logo} via={w.via} />
                </span>
              </div>
              {form === id && <AlertForm w={w} price={price?.usd} gap={w.chain === "robinhood" ? gaps?.[w.address.toLowerCase()] : undefined} onDone={() => setForm(null)} />}
            </div>
          );
        })}
      </div>
      {alerts.length > 0 && (
        <>
          <div className="lbl" style={{ marginTop: 16 }}>ALERTS</div>
          <div className="wl" style={{ marginTop: 8 }}>
            {alerts.map((a) => (
              <div key={a.id} className="wlalert">
                <span>{alertText(a, fmtUsd)}{a.fired !== undefined ? <small className="up"> · reached {a.kind === "gap" ? `${a.fired.toFixed(2)}%` : fmtUsd(a.fired)}</small> : <small> · waiting</small>}</span>
                <button className="ghost" type="button" onClick={() => removeAlert(a.id)} aria-label={`Delete alert ${a.symbol} ${a.dir} ${a.price}`}>Delete</button>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="note" style={{ marginBottom: 0 }}>
        Saved in this browser only. Alerts are checked every minute while Stoa is open in a tab or as the installed app; prices come from DexScreener, and gap alerts compare them with Robinhood&apos;s price.
        {alerts.length > 0 && p === "denied" && " Notifications are blocked for stoadex.com in your browser settings, so alerts show on the page only."}
      </p>
    </div>
  );
}

type Toast = { id: string; text: string; href: string };

/** Checks the price alerts every minute while the site is open and notifies when one is reached (once per alert). */
export function AlertWatcher() {
  const s = useWatch();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const busy = useRef(false);
  const pending = s.alerts.filter((a) => !a.fired);
  const key = pending.map((a) => a.id).join();
  useEffect(() => {
    if (!pending.length || location.pathname.startsWith("/embed")) return; // not inside widgets on other sites
    const check = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        for (const n of NETS.filter((x) => x.deployed)) {
          const mine = pending.filter((a) => a.chain === n.key);
          if (!mine.length) continue;
          const priceOnes = mine.filter((a) => a.kind !== "gap"), gapOnes = mine.filter((a) => a.kind === "gap");
          const prices = priceOnes.length ? await fetchPrices(n, [...new Set(priceOnes.map((a) => a.address))]).catch(() => ({} as Record<string, { usd: number }>)) : {};
          const gaps = gapOnes.length ? await stockGaps().catch(() => ({} as Record<string, number>)) : {};
          for (const a of mine) {
            const v = a.kind === "gap" ? gaps[a.address.toLowerCase()] : prices[a.address.toLowerCase()]?.usd;
            if (v === undefined || (a.kind !== "gap" && !v) || !crossed(a, v) || !markFired(a.id, v)) continue;
            const text = a.kind === "gap" ? `${alertText(a, fmtUsd)}: now ${v >= 0 ? "+" : ""}${v.toFixed(2)}%` : `${a.symbol} is ${a.dir} ${fmtUsd(a.price)}: now ${fmtUsd(v)}`;
            const href = tradeHref({ ...a, via: s.watch.find((w) => w.chain === a.chain && w.address.toLowerCase() === a.address.toLowerCase())?.via });
            setToasts((t) => [...t, { id: a.id, text, href }].slice(-3));
            try {
              if (typeof Notification !== "undefined" && Notification.permission === "granted") {
                const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
                if (reg) await reg.showNotification("Stoa price alert", { body: text, icon: "/icon.png", tag: a.id, data: { url: href } });
                else new Notification("Stoa price alert", { body: text, icon: "/icon.png", tag: a.id });
              }
            } catch { /* the toast on the page still shows */ }
          }
        }
      } finally { busy.current = false; }
    };
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!toasts.length) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <Link href={t.href} onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>{t.text}</Link>
          <button type="button" aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>×</button>
        </div>
      ))}
    </div>
  );
}
