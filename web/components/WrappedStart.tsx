"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { isAddress } from "viem";
import { useWalletModal } from "./Providers";

/** /wrapped: opens the connected wallet's card, or any wallet pasted in. */
export default function WrappedStart() {
  const { address } = useAccount();
  const { open } = useWalletModal();
  const router = useRouter();
  const [v, setV] = useState("");
  useEffect(() => { if (address) router.replace(`/wrapped/${address}`); }, [address, router]);
  const ok = isAddress(v.trim());
  return (
    <div className="panel empty">
      <img src="/logo.png" alt="" style={{ width: 64, height: 64 }} />
      <h3>Open your card</h3>
      <p>Connect the wallet you swap with, or paste any wallet address.</p>
      <button className="cta" type="button" onClick={open}>Connect wallet</button>
      <form style={{ display: "flex", gap: 8, maxWidth: 520, margin: "18px auto 0" }} onSubmit={(e) => { e.preventDefault(); if (ok) router.push(`/wrapped/${v.trim()}`); }}>
        <input className="inp" style={{ flex: 1, minWidth: 0, margin: 0 }} placeholder="0x…" value={v} onChange={(e) => setV(e.target.value)} aria-label="Wallet address" spellCheck={false} />
        <button className="cta" type="submit" disabled={!ok}>Open</button>
      </form>
    </div>
  );
}
