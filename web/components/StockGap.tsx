"use client";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import type { Token } from "@/lib/tokens";
import { SESSION_LABEL, nextRegularOpen, session } from "@/lib/marketHours";

type Ref = { address: string; symbol: string; referencePriceUsd: number | null; halted: boolean };
const isStock = (t: Token) => t.name.endsWith("Robinhood Stock Token");
const utc = (d: Date) => `${d.toLocaleString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })} UTC`;
const usd = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 4 : 2 })}`;

/** For a swap into or out of a Robinhood Stock Token: Robinhood's own price for one token next to the price this swap
 *  works out to (the other side valued in USD), and how far apart they are. Robinhood's price comes from the underlying
 *  shares (/api/v1/stocks); outside US market hours it follows the overnight session. Shows nothing for other tokens. */
export default function StockGap({ sell, buy, amtIn, out, usdOf, onLimit }: {
  sell: Token; buy: Token; amtIn: bigint; out: bigint; usdOf: (t?: Token) => { usd: number } | undefined;
  /** opens the Limit tab priced this % above the market rate (more of the token you get): set when limit orders work here */
  onLimit?: (startPct: number) => void;
}) {
  const stockSide = isStock(buy) ? "buy" : isStock(sell) ? "sell" : null;
  const refs = useQuery({
    queryKey: ["stock-refs"],
    enabled: !!stockSide,
    staleTime: 60_000,
    queryFn: async () => ((await (await fetch("/api/v1/stocks")).json()) as { stocks: Ref[] }).stocks,
  });
  if (!stockSide || amtIn === 0n || out === 0n) return null;
  const stock = stockSide === "buy" ? buy : sell, other = stockSide === "buy" ? sell : buy;
  const ref = refs.data?.find((r) => r.address.toLowerCase() === stock.address.toLowerCase());
  const otherUsd = usdOf(other)?.usd;
  if (!ref || !ref.referencePriceUsd || !otherUsd) return null;
  const stockAmt = Number(formatUnits(stockSide === "buy" ? out : amtIn, stock.decimals));
  const otherAmt = Number(formatUnits(stockSide === "buy" ? amtIn : out, other.decimals));
  if (stockAmt <= 0) return null;
  const px = (otherAmt * otherUsd) / stockAmt;
  const gap = (px / ref.referencePriceUsd - 1) * 100;
  // buying above Robinhood's price, or selling below it, is the side that costs the trader
  const worse = stockSide === "buy" ? gap > 0 : gap < 0;
  const big = Math.abs(gap) >= 1;
  // Weekend guard: outside regular US hours the pool has no live reference, so its price can drift and snap back at the
  // open. Say which session it is, when regular hours start, and warn when this swap is on the costly side of the gap.
  const now = new Date(), sess = session(now), offHours = sess !== "regular";
  const opens = offHours ? nextRegularOpen(now) : null;
  const guard = offHours && worse && Math.abs(gap) >= 1 && !ref.halted;
  return (
    <>
    {offHours && (
      <div className="note" style={guard
        ? { margin: "8px 0 0", padding: "8px 10px", borderRadius: 10, background: "rgba(194,65,45,.08)", color: "#7c2d12" }
        : { margin: "8px 0 0" }}>
        <b>{SESSION_LABEL[sess]}</b>{opens && <> · regular hours open {utc(opens)}</>}
        {guard && <>. This swap prices {stock.symbol} {Math.abs(gap).toFixed(2)}% {stockSide === "buy" ? "above" : "below"} Robinhood. Off-hours prices often move back at the open: a limit order at Robinhood&apos;s price only fills if the market comes to you.</>}
      </div>
    )}
    <div className="note" style={{ margin: "8px 0 0", display: "flex", flexWrap: "wrap", gap: "2px 10px", alignItems: "baseline" }}>
      <span>Robinhood: <b>{usd(ref.referencePriceUsd)}</b></span>
      <span>This swap: <b>{usd(px)}</b> per {stock.symbol}</span>
      <span style={{ color: big ? (worse ? "#c2412d" : "#15803d") : "var(--muted)", fontWeight: big ? 600 : 400 }}>
        {Math.abs(gap) < 0.01 ? "same as Robinhood" : `${Math.abs(gap).toFixed(2)}% ${gap > 0 ? "above" : "below"} Robinhood`}
      </span>
      {ref.halted && <span style={{ color: "#c2412d" }}>Trading is halted on Robinhood</span>}
      {onLimit && worse && Math.abs(gap) >= 0.3 && !ref.halted && (
        // a limit order at Robinhood's price: buying, the tokens you get rise by the gap; selling, the USD you get rises
        // by Robinhood's price over this one
        <button type="button" className="ghost" style={{ padding: "4px 10px", fontSize: 13 }}
          onClick={() => onLimit(stockSide === "buy" ? gap : (ref.referencePriceUsd! / px - 1) * 100)}>
          {stockSide === "buy" ? "Buy" : "Sell"} at Robinhood&apos;s price with a limit order
        </button>
      )}
    </div>
    </>
  );
}
