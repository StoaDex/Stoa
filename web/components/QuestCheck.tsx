"use client";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { isAddress } from "viem";

type R = { swap: 0 | 1; lock: 0 | 1; swaps: number; qualifyingSwaps: number; lockedStoa: number } | { error: string };

/** Checks the two on-chain tasks for an address, with the same chain reads Zealy uses. */
export default function QuestCheck() {
  const { address } = useAccount();
  const [a, setA] = useState("");
  const [r, setR] = useState<R | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (address && !a) setA(address); }, [address, a]);
  const check = async () => {
    if (!isAddress(a.trim())) { setR({ error: "Paste a 0x address." }); return; }
    setBusy(true); setR(null);
    try { setR(await (await fetch(`/api/quest?address=${a.trim()}`)).json()); } catch { setR({ error: "Could not read the chain just now. Try again in a minute." }); }
    setBusy(false);
  };
  const row = (ok: boolean, label: string, sub: string) => (
    <div className="qrow"><span className={ok ? "qok" : "qno"} aria-hidden="true">{ok ? "✓" : "–"}</span><span><b>{label}</b><small>{sub}</small></span><span className="sr-only">{ok ? "done" : "not yet"}</span></div>
  );
  return (
    <div className="panel pad">
      <div className="lbl">CHECK YOUR ON-CHAIN TASKS</div>
      <div className="tb-bar" style={{ marginTop: 10 }}>
        <input type="text" placeholder="Your wallet, 0x…" value={a} onChange={(e) => setA(e.target.value)} aria-label="Wallet address" spellCheck={false} />
        <button type="button" className="cta" onClick={check} disabled={busy}>{busy ? "Checking…" : "Check"}</button>
      </div>
      {r && ("error" in r ? <p className="note" style={{ color: "#B4442E" }}>{r.error}</p> : (
        <div style={{ marginTop: 12 }}>
          {row(r.swap === 1, "Swap $10 or more on Stoa", `${r.qualifyingSwaps} of ${r.swaps} swaps since the quest opened count`)}
          {row(r.lock === 1, "Bonus: $STOA locked", r.lockedStoa ? `${r.lockedStoa.toLocaleString("en-US")} $STOA locked` : "None locked yet")}
          <p className="note">Zealy reads the same answer when you claim there. New swaps show within a few minutes.</p>
        </div>
      ))}
    </div>
  );
}
