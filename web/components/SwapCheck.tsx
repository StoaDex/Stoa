"use client";
import { useQuery } from "@tanstack/react-query";
import { parseAbi, type Address, type PublicClient } from "viem";
import type { Net } from "@/lib/networks";
import { NATIVE } from "@/lib/tokens";
import { fmtAmt } from "@/lib/swap";
import { OLD_V4 } from "@/lib/v4guard";

const adapterAbi = parseAbi(["function quote(address tokenIn, address tokenOut, uint256 amountIn) view returns (uint256)"]);
const isAdapterAbi = parseAbi(["function isAdapter(address) view returns (bool)"]);
const lc = (a: string) => a.toLowerCase();

/** After a swap: what the best single venue would have given for the same amount, read in the block just before the
 *  swap, next to what the trader actually received. States the numbers either way, including when a venue alone
 *  would have given more (prices move between the quote and the fill). */
export default function SwapCheck({ net, pub, sellToken, buyToken, decimals, symbol, paid, got, block }: {
  net: Net; pub?: PublicClient; sellToken: Address; buyToken: Address; decimals: number; symbol: string; paid: bigint; got: bigint; block: bigint;
}) {
  const router = net.contracts.router;
  const a = lc(sellToken) === lc(NATIVE) ? net.wrapped : sellToken;
  const b = lc(buyToken) === lc(NATIVE) ? net.wrapped : buyToken;
  const q = useQuery({
    queryKey: ["swap-check", net.key, a, b, paid.toString(), block.toString()],
    enabled: !!pub && !!router && lc(a) !== lc(b) && block > 0n,
    staleTime: Infinity,
    queryFn: async () => {
      const addrs = (Object.keys(net.venues) as Address[]).filter((v) => lc(v) !== OLD_V4);
      const live = await pub!.multicall({ contracts: addrs.map((v) => ({ address: router!, abi: isAdapterAbi, functionName: "isAdapter" as const, args: [v] as const })), allowFailure: true });
      const vs = addrs.filter((_, i) => live[i]?.result === true);
      if (!vs.length) return null;
      const r = await pub!.multicall({ contracts: vs.map((v) => ({ address: v, abi: adapterAbi, functionName: "quote" as const, args: [a, b, paid] as const })), allowFailure: true, blockNumber: block - 1n });
      const rows = vs.map((v, i) => ({ name: net.venues[lc(v)] ?? "Venue", out: (r[i]?.result as bigint | undefined) ?? 0n })).filter((x) => x.out > 0n);
      rows.sort((x, y) => (y.out > x.out ? 1 : y.out < x.out ? -1 : 0));
      return rows[0] ?? null;
    },
  });
  const best = q.data;
  if (!best) return null;
  const diff = got - best.out;
  const pct = Number((diff * 1_000_000n) / best.out) / 10_000;
  const same = Math.abs(pct) < 0.05; // within Stoa's 2 bps fee and rounding: it filled on that venue
  return (
    <p className="note" style={{ marginTop: 6 }}>
      {same
        ? <>Filled on par with {best.name}, the best single venue for this amount just before your swap ({fmtAmt(best.out, decimals)} {symbol} before Stoa&apos;s 0.02% fee).</>
        : diff > 0n
          ? <><b style={{ color: "#1E6B41" }}>+{fmtAmt(diff, decimals)} {symbol} ({pct.toFixed(2)}%)</b> more than {best.name}, the best single venue, quoted for the same amount just before your swap.</>
          : <>{best.name} alone quoted {fmtAmt(best.out, decimals)} {symbol} for the same amount just before your swap, {Math.abs(pct).toFixed(2)}% more than you received: the price moved between the quote and the fill.</>}
    </p>
  );
}
