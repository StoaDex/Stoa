"use client";
import Link from "next/link";
import { useReadContract, useReadContracts } from "wagmi";
import { zeroAddress } from "viem";
import { ROBINHOOD } from "@/lib/networks";
import { routerAbi } from "@/lib/abi";
import { CA } from "@/lib/stoaAddress";
import { PONS_URL, STOA_CURVE, curveAbi } from "@/lib/stoaSupply";

/** Homepage line under the hero: $STOA's live curve progress, read from Robinhood Chain every 15 seconds, with a Buy
 *  button that goes to Stoa's swap screen once Stoa routes $STOA (Pons curve adapter live, or after graduation), to
 *  Pons before that. Renders nothing until the chain answers. */
export default function StoaPulse() {
  const id = ROBINHOOD.chain.id;
  const r = useReadContracts({
    contracts: [
      { address: STOA_CURVE, abi: curveAbi, functionName: "realQuoteReserve", chainId: id },
      { address: STOA_CURVE, abi: curveAbi, functionName: "graduationThreshold", chainId: id },
      { address: STOA_CURVE, abi: curveAbi, functionName: "graduated", chainId: id },
    ] as const,
    query: { refetchInterval: 15_000 },
  });
  const ponsLive = useReadContract({
    address: ROBINHOOD.contracts.router, abi: routerAbi, functionName: "isAdapter", args: [ROBINHOOD.pons ?? zeroAddress],
    chainId: id, query: { enabled: !!ROBINHOOD.pons, refetchInterval: 60_000 },
  }).data === true;
  const raised = r.data?.[0]?.result as bigint | undefined, thr = r.data?.[1]?.result as bigint | undefined;
  const grad = r.data?.[2]?.result as boolean | undefined;
  if (grad === undefined || (!grad && (raised === undefined || !thr))) return null;
  const pct = grad ? 100 : Math.min(99.9, (Number(raised) / Number(thr!)) * 100);
  const onStoa = grad || ponsLive;
  const trade = `/trade?chain=robinhood&buy=${CA}`;
  return (
    <div className="stoapulse">
      <Link href="/token" className="sp-info" aria-label={`$STOA ${grad ? "graduated to Uniswap V4" : `${pct.toFixed(1)}% to graduation`}, details`}>
        <span className="sp-dot" aria-hidden />
        <b>$STOA</b>
        <span className="sp-txt">{grad ? "graduated to Uniswap V4" : `${pct.toFixed(1)}% to graduation`}</span>
        {!grad && <span className="sp-bar" aria-hidden><i style={{ width: `${pct}%` }} /></span>}
      </Link>
      {onStoa
        ? <Link className="sp-buy" href={trade}>Buy on Stoa</Link>
        : <a className="sp-buy" href={PONS_URL} target="_blank" rel="noopener noreferrer">Buy on Pons ↗</a>}
    </div>
  );
}
