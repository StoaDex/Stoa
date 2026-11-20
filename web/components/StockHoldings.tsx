"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { erc20Abi, formatUnits, type Address } from "viem";
import { useReadContracts } from "wagmi";
import { ROBINHOOD } from "@/lib/networks";

type S = { symbol: string; name: string; address: Address; logo: string | null; referencePriceUsd: number | null; halted: boolean; onChain: { priceUsd: number } | null; routeOnStoa: boolean };
const usd = (v: number) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The wallet's Robinhood Stock Tokens: amount, value at Robinhood's price, and the on-chain price's gap to it */
export default function StockHoldings({ address }: { address: Address }) {
  const list = useQuery({
    queryKey: ["stocks-list"],
    staleTime: 120_000,
    queryFn: async () => ((await (await fetch("/api/v1/stocks")).json()) as { stocks: S[] }).stocks,
  });
  const stocks = list.data ?? [];
  const bals = useReadContracts({
    contracts: stocks.map((s) => ({ address: s.address, abi: erc20Abi, functionName: "balanceOf" as const, args: [address] as const, chainId: ROBINHOOD.chain.id })),
    allowFailure: true,
    query: { enabled: stocks.length > 0, refetchInterval: 60_000 },
  });
  // Stock Tokens use 18 decimals (Robinhood's spec); read per token only for what is held
  const held = stocks
    .map((s, i) => ({ s, raw: (bals.data?.[i]?.result as bigint | undefined) ?? 0n }))
    .filter((x) => x.raw > 0n)
    .map(({ s, raw }) => {
      const amt = Number(formatUnits(raw, 18));
      const ref = s.referencePriceUsd, dex = s.onChain?.priceUsd ?? null;
      return { s, amt, value: ref ? amt * ref : dex ? amt * dex : null, gap: ref && dex ? ((dex - ref) / ref) * 100 : null };
    })
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const total = held.reduce((a, x) => a + (x.value ?? 0), 0);
  if (list.isLoading || bals.isLoading) return null;
  return (
    <div className="panel" style={{ gridColumn: "1 / -1", overflowX: "auto" }}>
      <div className="rowx" style={{ padding: "16px 18px 0" }}>
        <div className="lbl">YOUR STOCK TOKENS · ROBINHOOD CHAIN</div>
        {held.length > 0 && <span className="chip">{usd(total)}</span>}
      </div>
      {held.length === 0 ? (
        <p className="note" style={{ padding: "6px 18px 16px", margin: 0 }}>No Robinhood Stock Tokens in this wallet. <Link href="/stocks">Browse stock tokens</Link>: they trade on-chain at any hour.</p>
      ) : (
        <table className="tbl" style={{ marginTop: 8 }}>
          <thead><tr><th>STOCK</th><th style={{ textAlign: "right" }}>AMOUNT</th><th style={{ textAlign: "right" }}>VALUE</th><th className="hm" style={{ textAlign: "right" }}>ON-CHAIN VS ROBINHOOD</th></tr></thead>
          <tbody>
            {held.map(({ s, amt, value, gap }) => (
              <tr key={s.address}>
                <td><Link href={`/stocks/${s.symbol.toLowerCase()}`} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {s.logo ? <img src={s.logo} alt="" width={22} height={22} style={{ borderRadius: 999 }} /> : null}{s.symbol}
                </Link></td>
                <td style={{ textAlign: "right", fontFamily: "var(--num)" }}>{amt.toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>
                <td style={{ textAlign: "right", fontFamily: "var(--num)" }}>{value === null ? "—" : usd(value)}</td>
                <td className="hm" style={{ textAlign: "right", fontFamily: "var(--num)", color: gap === null ? undefined : gap >= 0 ? "#1E6B41" : "#8A2B20" }}>{s.halted ? "Halted" : gap === null ? "—" : `${gap >= 0 ? "+" : ""}${gap.toFixed(2)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {held.length > 0 && <p className="note" style={{ padding: "0 18px 14px", margin: "8px 0 0" }}>Valued at Robinhood&apos;s price (mid of bid and ask). The last column is how far the on-chain price sits from it: a gap shows most while the US market is closed. Set a price alert with ☆ on any stock&apos;s page.</p>}
    </div>
  );
}
