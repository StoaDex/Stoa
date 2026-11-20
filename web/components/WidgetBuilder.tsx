"use client";
import { useEffect, useState } from "react";
import { isAddress } from "viem";
import { useAccount } from "wagmi";
import { SITE } from "@/lib/chain";

export type Pick = { symbol: string; address: string };

const HEIGHT = 330;

/** pick a token, a look and a referral wallet; see the widget live and copy its one line of HTML */
export default function WidgetBuilder({ picks }: { picks: Pick[] }) {
  const { address } = useAccount();
  const [token, setToken] = useState(picks[0]?.address ?? "");
  const [pay, setPay] = useState<"ETH" | "USDG">("ETH");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [ref, setRef] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (address && !ref) setRef(address); }, [address]); // eslint-disable-line react-hooks/exhaustive-deps

  const okToken = isAddress(token.trim(), { strict: false });
  const okRef = !ref || isAddress(ref.trim(), { strict: false });
  const qs = new URLSearchParams();
  qs.set("pay", pay);
  if (theme === "dark") qs.set("theme", "dark");
  if (ref && okRef) qs.set("ref", ref.trim());
  const path = `/embed/swap/robinhood/${token.trim()}?${qs}`;
  const sym = picks.find((p) => p.address.toLowerCase() === token.trim().toLowerCase())?.symbol;
  const code = `<iframe src="${SITE}${path}" width="100%" height="${HEIGHT}" style="max-width:420px;border:0;border-radius:16px" title="${sym ? `Swap to ${sym}` : "Swap"} on Stoa" loading="lazy"></iframe>`;

  const seg = <T extends string>(label: string, v: T, set: (x: T) => void, opts: T[]) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="note" style={{ margin: 0 }}>{label}</span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {opts.map((o) => <button key={o} type="button" className={o === v ? "cta" : "ghost"} aria-pressed={o === v} onClick={() => set(o)} style={{ textTransform: "capitalize" }}>{o}</button>)}
      </div>
    </div>
  );

  return (
    <div className="grid2 eq" style={{ alignItems: "start", gap: 16 }}>
      <div className="panel pad" style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label className="note" style={{ margin: 0 }} htmlFor="wb-token">Token on Robinhood Chain</label>
          <input id="wb-token" className="inp" type="text" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} placeholder="0x… token address"
            style={{ fontFamily: "var(--mono)", fontSize: 13, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 10, width: "100%", boxSizing: "border-box" }} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {picks.map((p) => <button key={p.address} type="button" className="chip" onClick={() => setToken(p.address)} style={{ cursor: "pointer" }}>{p.symbol}</button>)}
          </div>
          <span className="note" style={{ margin: 0 }}>Works for tokens Stoa lists or routes: $STOA, listed tokens, Robinhood Stock Tokens and Pons launches with a route.</span>
        </div>
        {seg("Visitors pay with (they can switch)", pay, setPay, ["ETH", "USDG"])}
        {seg("Look", theme, setTheme, ["light", "dark"])}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label className="note" style={{ margin: 0 }} htmlFor="wb-ref">Your wallet, for the referral share (optional)</label>
          <input id="wb-ref" type="text" autoComplete="off" spellCheck={false} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="0x…"
            style={{ fontFamily: "var(--mono)", fontSize: 13, padding: "10px 12px", border: `1px solid ${okRef ? "var(--line)" : "#C0392B"}`, borderRadius: 10, width: "100%", boxSizing: "border-box" }} />
          {!okRef && <span className="note" style={{ margin: 0, color: "#8A2B20" }}>That is not a wallet address.</span>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="note" style={{ margin: 0 }}>Paste this where the widget should appear</span>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: 12, padding: 12, borderRadius: 10, background: "rgba(47,111,214,.06)", border: "1px solid var(--line)" }}>{okToken ? code : "Enter a token address first."}</pre>
          <button type="button" className="cta" disabled={!okToken || !okRef} style={{ justifySelf: "start" }}
            onClick={async () => { try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard blocked */ } }}>
            {copied ? "Copied" : "Copy code"}
          </button>
        </div>
      </div>
      <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
        <span className="lbl">PREVIEW</span>
        {okToken
          ? <iframe key={path} src={path} width="100%" height={HEIGHT} style={{ maxWidth: 420, border: 0, borderRadius: 16, boxShadow: "0 4px 18px rgba(20,30,60,.10)" }} title="Swap widget preview" />
          : <div className="panel pad note" style={{ width: "100%", maxWidth: 420, boxSizing: "border-box" }}>The preview shows here.</div>}
        <p className="note" style={{ maxWidth: 420, margin: 0 }}>
          No wallet connects inside the widget, so it never asks your visitors to sign anything on your site. The swap itself happens on stoadex.com. Showing the widget is not an endorsement from Stoa. <a href="/docs/embed">Docs</a>
        </p>
      </div>
    </div>
  );
}
