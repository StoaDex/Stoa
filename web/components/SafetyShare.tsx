"use client";
import { useState } from "react";
import { SITE } from "@/lib/chain";
import type { Safety } from "@/lib/safety";

const LABEL: Record<Safety["verdict"], string> = { ok: "Passed ✅", caution: "Caution ⚠️", danger: "Risky 🚩", unknown: "Not checked" };
const pct = (v: number) => `${v.toFixed(1)}%`;

/** Post a safety check result on X, linking to its /check page (which has its own share card). */
export default function SafetyShare({ s }: { s: Safety }) {
  const [copied, setCopied] = useState(false);
  if (s.verdict === "unknown") return null;
  const url = `${SITE}/check/${s.chain}/${s.token}`;
  const t = s.test;
  const lines = [`$${s.symbol} on Stoa's free safety check: ${LABEL[s.verdict]}`, ""];
  if (t) lines.push(`→ Sell back: ${t.sellOk ? "works" : "failed"}`);
  if (t?.sellOk) lines.push(`→ Hidden tax: ${(t.buyTaxPct ?? 0) >= 0.1 ? pct(t.buyTaxPct!) : "none"} buy / ${(t.sellTaxPct ?? 0) >= 0.1 ? pct(t.sellTaxPct!) : "none"} sell`);
  if (s.creatorPct !== null) lines.push(`→ Creator wallet: ${pct(s.creatorPct)} of supply`);
  lines.push("", "Check any Robinhood Chain token before you buy:");
  const text = lines.join("\n");
  const x = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  return (
    <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
      <a className="ghost" href={x} target="_blank" rel="noopener noreferrer" style={{ borderColor: "var(--line)", background: "#fff" }}>Share result on X</a>
      <button type="button" className="ghost" style={{ borderColor: "var(--line)", background: "#fff" }}
        onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* blocked */ } }}>
        {copied ? "Link copied" : "Copy link"}
      </button>
    </div>
  );
}
