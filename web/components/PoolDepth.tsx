"use client";
import { useEffect, useState } from "react";
import { useBlockNumber, useReadContract } from "wagmi";
import { CONTRACTS, elysium } from "@/lib/chain";
import { poolAbi } from "@/lib/abi";
import { fmt } from "@/lib/swap";
import { Pair } from "./ui";

const LV = [10, 8, 6, 4, 2];

/** Live maker quote for WHYPE/USDC when the pool is deployed; otherwise a labelled illustration. */
export default function PoolDepth() {
  const pool = CONTRACTS.pool;
  const { data: bn } = useBlockNumber({ chainId: elysium.id, watch: !!pool, query: { enabled: !!pool } });
  const q = useReadContract({ address: pool, abi: poolAbi, functionName: "current", chainId: elysium.id, query: { enabled: !!pool, refetchInterval: 1500 } });
  const [bars, setBars] = useState(() => LV.map((_, i) => [30 + (4 - i) * 12, 30 + (4 - i) * 12]));
  useEffect(() => {
    if (pool) return;
    const id = setInterval(() => !document.hidden && setBars((b) => b.map((r) => r.map((x) => Math.min(98, Math.max(12, x + (Math.random() - 0.5) * 18))))), 1200);
    return () => clearInterval(id);
  }, [pool]);

  const cur = q.data as readonly [bigint, bigint, bigint, bigint, bigint] | undefined;
  const live = !!(cur && bn !== undefined && cur[4] > bn);
  const never = !!cur && cur[0] === 0n;

  return (
    <div className="panel pad">
      <div className="rowx"><Pair /><span className="chip live">{!pool ? "Opening soon" : !cur ? "Checking quote…" : live ? "Quoting" : never ? "Waiting for makers" : "No live quote"}</span></div>
      {pool && !cur ? (
        <p className="note" style={{ marginTop: 14 }}>Live on Elysium. Reading the maker quote from the chain… Swaps fill on the best outside venue whenever no maker quotes.</p>
      ) : pool && cur && never ? (
        <p className="note" style={{ marginTop: 14 }}>No maker has quoted this pool yet. Swaps fill on the best outside venue until one does.</p>
      ) : pool && cur ? (
        <div className="det" style={{ marginTop: 14 }}>
          <span>Maker bid</span><span>{fmt(cur[0], 6, 4)} USDC · {fmt(cur[2], 18, 2)} WHYPE</span>
          <span>Maker ask</span><span>{fmt(cur[1], 6, 4)} USDC · {fmt(cur[3], 18, 2)} WHYPE</span>
          <span>Spread</span><span>{cur[0] > 0n ? (((Number(cur[1]) - Number(cur[0])) / Number(cur[0])) * 10_000).toFixed(1) : "—"} bps</span>
          <span>Quote valid until block</span><span>{cur[4].toString()}</span>
        </div>
      ) : (
        <>
          <div className="depth">
            {LV.map((l, i) => (
              <div className="dr" key={l}><span className="b" style={{ width: `${bars[i][0]}%` }} /><span className="m">±{l} bps</span><span className="a" style={{ width: `${bars[i][1]}%` }} /></div>
            ))}
            <div className="mid">MID</div>
          </div>
          <p className="note">Illustration of how maker depth shows here. Live depth replaces it when the pool opens.</p>
        </>
      )}
    </div>
  );
}
