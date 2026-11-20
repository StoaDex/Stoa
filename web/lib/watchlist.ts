"use client";
import { useSyncExternalStore } from "react";

/** The watchlist and price alerts live in this browser only (localStorage): no account, nothing sent anywhere.
 *  Alerts are checked while Stoa is open in a tab or as the installed app (see AlertWatcher). */
/** via: the token to sell when opening Trade for it (stock tokens trade against USDG) */
export interface Watch { chain: string; address: string; symbol: string; logo?: string; via?: string; added: number }
/** kind "gap" (Robinhood Stock Tokens): price is a percentage; "below" fires when the on-chain price is at least that
 *  much under Robinhood's price, "above" when it is that much over. fired then holds the gap it saw, in percent. */
export interface PriceAlert { id: string; chain: string; address: string; symbol: string; dir: "above" | "below"; price: number; created: number; fired?: number; firedAt?: number; kind?: "price" | "gap" }
interface State { watch: Watch[]; alerts: PriceAlert[] }

const KEY = "stoa.watch.v1";
const EVENT = "stoa-watch";
const EMPTY: State = { watch: [], alerts: [] };
const MAX_WATCH = 50, MAX_ALERTS = 30;
const lc = (a: string) => a.toLowerCase();

let cache: { raw: string | null; state: State } = { raw: null, state: EMPTY };

function read(): State {
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEY); } catch { return EMPTY; }
  if (raw === cache.raw) return cache.state;
  let state = EMPTY;
  try {
    const v = raw ? JSON.parse(raw) : null;
    if (v && Array.isArray(v.watch) && Array.isArray(v.alerts)) state = { watch: v.watch, alerts: v.alerts };
  } catch { /* a damaged entry starts over */ }
  cache = { raw, state };
  return state;
}

function write(next: State) {
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode or full storage: nothing is kept */ }
  dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb(); };
  addEventListener(EVENT, cb);
  addEventListener("storage", onStorage); // other tabs
  return () => { removeEventListener(EVENT, cb); removeEventListener("storage", onStorage); };
}

export function useWatch(): State {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

const same = (a: { chain: string; address: string }, b: { chain: string; address: string }) => a.chain === b.chain && lc(a.address) === lc(b.address);

export function isWatched(s: State, chain: string, address: string) {
  return s.watch.some((w) => same(w, { chain, address }));
}

export function toggleWatch(t: Omit<Watch, "added">) {
  const s = read();
  if (isWatched(s, t.chain, t.address)) {
    write({ watch: s.watch.filter((w) => !same(w, t)), alerts: s.alerts });
  } else {
    write({ watch: [{ ...t, symbol: t.symbol.slice(0, 16), added: Date.now() }, ...s.watch].slice(0, MAX_WATCH), alerts: s.alerts });
  }
}

export function addAlert(a: Omit<PriceAlert, "id" | "created">) {
  const s = read();
  const alert: PriceAlert = { ...a, symbol: a.symbol.slice(0, 16), id: Math.random().toString(36).slice(2, 10), created: Date.now() };
  const watch = isWatched(s, a.chain, a.address) ? s.watch : [{ chain: a.chain, address: a.address, symbol: alert.symbol, added: Date.now() }, ...s.watch];
  write({ watch, alerts: [alert, ...s.alerts].slice(0, MAX_ALERTS) });
}

export function removeAlert(id: string) {
  const s = read();
  write({ watch: s.watch, alerts: s.alerts.filter((x) => x.id !== id) });
}

/** marks an alert as fired; returns false if another tab got there first */
export function markFired(id: string, price: number): boolean {
  const s = read();
  const a = s.alerts.find((x) => x.id === id);
  if (!a || a.fired) return false;
  write({ watch: s.watch, alerts: s.alerts.map((x) => (x.id === id ? { ...x, fired: price, firedAt: Date.now() } : x)) });
  return true;
}

export const crossed = (a: PriceAlert, v: number) => (a.kind === "gap" ? (a.dir === "above" ? v >= a.price : v <= -a.price) : a.dir === "above" ? v >= a.price : v <= a.price);
/** how an alert reads: "TSLA below $350" or "TSLA on-chain 1% cheaper than Robinhood" */
export const alertText = (a: Pick<PriceAlert, "symbol" | "dir" | "price" | "kind">, usd: (v: number) => string) =>
  a.kind === "gap" ? `${a.symbol} on-chain ${a.price}% ${a.dir === "below" ? "cheaper" : "dearer"} than Robinhood` : `${a.symbol} ${a.dir} ${usd(a.price)}`;
