"use client";
import { useEffect, useRef, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import type { WidgetBuy, WidgetToken } from "@/lib/embed";

type Quote = { amountOut: string; priceImpactPct: number | null; route: { legs: { name: string | null }[] } };
type Props = { chain: string; chainName: string; buy: WidgetBuy; pays: WidgetToken[]; payIndex: number; amount: string; refAddr: string | null; site: string; dark?: boolean };

const clean = (s: string) => s.replace(/,/g, ".").replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
const fmtOut = (raw: string, d: number) => {
  const v = Number(formatUnits(BigInt(raw), d));
  return v.toLocaleString("en-US", { maximumFractionDigits: v >= 1000 ? 2 : v >= 1 ? 4 : 8 });
};
const abs = (site: string, u: string | null) => (u ? (u.startsWith("http") ? u : `${site}${u}`) : null);

/** the swap widget: type an amount, see Stoa's live quote, then open Stoa with the same swap filled in. No wallet
 *  connects inside the frame, so it can never ask a visitor to sign anything on someone else's site. */
export default function EmbedSwap({ chain, chainName, buy, pays, payIndex, amount: start, refAddr, site, dark }: Props) {
  const [pay, setPay] = useState(payIndex);
  const [amount, setAmount] = useState(start);
  const [q, setQ] = useState<Quote | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "none" | "error">("idle");
  const seq = useRef(0);
  const p = pays[pay];

  useEffect(() => {
    let wei: bigint;
    try { wei = amount && Number(amount) > 0 ? parseUnits(amount, p.decimals) : 0n; } catch { wei = 0n; }
    if (wei === 0n) { setQ(null); setState("idle"); return; }
    const id = ++seq.current;
    setState("loading");
    const run = async () => {
      try {
        const u = `/api/v1/quote?chain=${chain}&sellToken=${p.address}&buyToken=${buy.address}&amount=${wei}`;
        const r = await fetch(u, { cache: "no-store" });
        if (id !== seq.current) return;
        if (r.status === 422) { setQ(null); setState("none"); return; }
        if (!r.ok) { setState("error"); return; }
        setQ((await r.json()) as Quote); setState("idle");
      } catch { if (id === seq.current) setState("error"); }
    };
    const t = setTimeout(run, 450);
    const again = setInterval(run, 20_000); // a quote is only good for seconds: keep it fresh while the card is open
    return () => { clearTimeout(t); clearInterval(again); };
  }, [amount, p.address, p.decimals, chain, buy.address]);

  const venues = q ? [...new Set(q.route.legs.map((l) => l.name).filter(Boolean))].join(" → ") : "";
  const link = `${site}/trade?chain=${chain}&sell=${p.symbol}&buy=${buy.address}${amount && Number(amount) > 0 ? `&amount=${amount}` : ""}${refAddr ? `&ref=${refAddr}` : ""}`;
  const logo = abs(site, buy.logo);

  return (
    <div className={`embed em-swap${dark ? " em-dark" : ""}`}>
      <div className="em-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo ? <img src={logo} alt="" width={40} height={40} className="em-logo" /> : <span className="em-logo em-glyph">{buy.symbol.slice(0, 1)}</span>}
        <div className="em-id">
          <b>Buy {buy.symbol}</b>
          <span>{buy.name} · {chainName}</span>
        </div>
      </div>

      <div className="em-field">
        <label htmlFor="em-amt">You pay</label>
        <div className="em-row">
          <input id="em-amt" type="text" inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} onChange={(e) => setAmount(clean(e.target.value))} />
          {pays.length > 1 ? (
            <div className="em-pay" role="group" aria-label="Pay with">
              {pays.map((t, i) => (
                <button key={t.symbol} type="button" aria-pressed={i === pay} className={i === pay ? "on" : ""} onClick={() => { const def = (t2: WidgetToken) => (t2.address === "native" ? "0.01" : "25"); if (amount === def(p)) setAmount(def(t)); setPay(i); }}>{t.symbol}</button>
              ))}
            </div>
          ) : <span className="em-unit">{p.symbol}</span>}
        </div>
      </div>

      <div className="em-field" aria-live="polite">
        <label>You get</label>
        <div className="em-out">
          {state === "loading" && !q ? <span className="em-dim">Checking every venue…</span>
            : state === "none" ? <span className="em-dim">No route for this amount right now</span>
            : state === "error" ? <span className="em-dim">Quote unavailable, try again</span>
            : q ? <><b>{fmtOut(q.amountOut, buy.decimals)} {buy.symbol}</b><small>{venues ? `via ${venues}` : "best venue for this amount"}{q.priceImpactPct !== null && q.priceImpactPct >= 0.01 ? ` · impact ${q.priceImpactPct.toFixed(2)}%` : ""}</small></>
            : <span className="em-dim">Enter an amount</span>}
        </div>
      </div>

      <a className="em-buy" href={link} target="_blank" rel="noopener noreferrer">Swap on Stoa ↗</a>
      <div className="em-foot">
        <a href={site} target="_blank" rel="noopener noreferrer">Powered by <b>STOA</b></a>
        <span>{buy.kind === "launch" ? "Unverified launch · " : ""}2 bps fee · not financial advice</span>
      </div>
    </div>
  );
}
