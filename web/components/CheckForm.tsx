"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** Paste a token address, open its safety check at /check/<chain>/<address>. */
export default function CheckForm({ chain = "robinhood", autoFocus = false }: { chain?: string; autoFocus?: boolean }) {
  const [v, setV] = useState("");
  const [err, setErr] = useState(false);
  const router = useRouter();
  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const a = v.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) { setErr(true); return; }
    router.push(`/check/${chain}/${a}`);
  };
  return (
    <form onSubmit={go} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <input value={v} onChange={(e) => { setV(e.target.value); setErr(false); }} placeholder="Token address, 0x…" autoFocus={autoFocus}
        aria-label="Token address" spellCheck={false}
        style={{ flex: "1 1 260px", minWidth: 0, padding: "12px 14px", borderRadius: 12, border: `1px solid ${err ? "#B4442E" : "var(--line)"}`, background: "#fff", fontFamily: "var(--mono)", fontSize: 14 }} />
      <button type="submit" className="cta">Check token</button>
      {err && <p className="note" style={{ width: "100%", marginTop: 0, color: "#B4442E" }}>That is not a token address: it starts with 0x and has 42 characters.</p>}
    </form>
  );
}
