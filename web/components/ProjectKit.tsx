"use client";
import { useState } from "react";
import { isAddress } from "viem";
import { SITE } from "@/lib/chain";
import CopyButton from "@/components/CopyButton";

/** paste a Robinhood Chain token address: every Stoa link and snippet for that token, ready to copy */
export default function ProjectKit() {
  const [v, setV] = useState("");
  const a = v.trim();
  const ok = isAddress(a, { strict: false });
  const t = ok ? a.toLowerCase() : "";
  const badge = `${SITE}/badge/safety/robinhood/${t}`;
  const check = `${SITE}/check/robinhood/${t}`;
  const rows: { lbl: string; what: string; value: string; open?: string; img?: string }[] = ok ? [
    { lbl: "TOKEN PAGE", what: "Price, chart, safety check and a buy box for your token.", value: `${SITE}/tokens/robinhood/${t}`, open: `/tokens/robinhood/${t}` },
    { lbl: "BUY LINK", what: "Opens Trade with your token picked: put it in your bio or pinned post.", value: `${SITE}/trade?chain=robinhood&buy=${t}`, open: `/trade?chain=robinhood&buy=${t}` },
    { lbl: "SAFETY BADGE · HTML", what: "Live result of a simulated buy and sell through Stoa's router, re-checked every 30 minutes.", value: `<a href="${check}"><img src="${badge}" alt="Stoa safety check" height="20"></a>`, img: `/badge/safety/robinhood/${t}` },
    { lbl: "SAFETY BADGE · MARKDOWN", what: "The same badge for a GitHub README or docs.", value: `[![Stoa safety check](${badge})](${check})` },
    { lbl: "SWAP WIDGET", what: "A swap box for your website. Colors and your referral wallet: open the widget builder.", open: "/build/widget", value: `<iframe src="${SITE}/embed/swap/robinhood/${t}?pay=ETH" width="100%" height="330" style="max-width:420px;border:0;border-radius:16px" title="Swap on Stoa" loading="lazy"></iframe>` },
    { lbl: "SPOTLIGHT VOTE PAGE", what: "After you bid: the page to share so $STOA holders vote for your token.", value: `${SITE}/spotlight/vote/${t}`, open: `/spotlight/vote/${t}` },
  ] : [];
  return (
    <div className="panel pad" style={{ marginBottom: 16 }}>
      <div className="lbl">YOUR KIT · PASTE YOUR TOKEN</div>
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="Robinhood Chain token address, 0x…" aria-label="Token address" spellCheck={false}
        style={{ width: "100%", marginTop: 10, padding: "12px 14px", borderRadius: 12, border: `1px solid ${a && !ok ? "#B4442E" : "var(--line)"}`, background: "#fff", fontFamily: "var(--mono)", fontSize: 14 }} />
      {a && !ok && <p className="note" style={{ color: "#B4442E" }}>That is not a token address: it starts with 0x and has 42 characters.</p>}
      {!a && <p className="note" style={{ marginBottom: 0 }}>Every link and snippet below is made for your token. Nothing is sent and nothing is saved.</p>}
      {rows.map((r) => (
        <div key={r.lbl} style={{ borderTop: "1px solid var(--line)", marginTop: 14, paddingTop: 12 }}>
          <div className="rowx"><div className="lbl">{r.lbl}</div>{r.open && <a href={r.open}>Open →</a>}</div>
          <p className="note" style={{ margin: "4px 0 8px" }}>{r.what}</p>
          {r.img && <p style={{ margin: "0 0 8px" }}><img src={r.img} alt="Stoa safety check badge for this token" height={20} /></p>}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <code style={{ flex: 1, minWidth: 0, fontSize: 12, overflowWrap: "anywhere", background: "var(--bg2, #f6f4ef)", padding: "8px 10px", borderRadius: 8 }}>{r.value}</code>
            <CopyButton text={r.value} />
          </div>
        </div>
      ))}
    </div>
  );
}
