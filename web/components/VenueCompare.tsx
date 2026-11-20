"use client";
import { VenueIcons, venueIds } from "./VenueIcons";
import { useQuery } from "@tanstack/react-query";
import { parseAbi, type Address, type PublicClient } from "viem";
import type { Net } from "@/lib/networks";
import type { Token } from "@/lib/tokens";
import { NATIVE } from "@/lib/tokens";
import { fmtAmt, isHop, describeRoute, type Route } from "@/lib/swap";
import { OLD_V4 } from "@/lib/v4guard";

// adapters' quote is not marked view (some venues simulate the swap), but it is only ever eth_call'ed here
const adapterAbi = parseAbi(["function quote(address tokenIn, address tokenOut, uint256 amountIn) view returns (uint256)"]);
const routerAbi = parseAbi([
  "function isAdapter(address) view returns (bool)",
  "function quote(address,address,uint256) view returns ((uint256 amountOut, address mid, (address venue, bool isPool) leg1, (address venue, bool isPool) leg2))",
]);
const lc = (a: string) => a.toLowerCase();

/** The swap screen's venue comparison: what each venue the router uses would give for this exact amount, direct,
 *  next to what Stoa fills. Venue quotes are the venues' own (before Stoa's 2 bps); Stoa's is what you receive.
 *  Shown only when at least two venues quote the pair directly, so there is something to compare. */
export default function VenueCompare({ net, pub, sell, buy, amt, route, out, block }: {
  net: Net; pub?: PublicClient; sell: Token; buy: Token; amt: bigint; route: Route; out: bigint; block?: bigint;
}) {
  const router = net.contracts.router;
  const live = useQuery({
    queryKey: ["live-venues", net.key],
    enabled: !!pub && !!router,
    staleTime: 300_000,
    queryFn: async () => {
      const addrs = Object.keys(net.venues) as Address[];
      const res = await pub!.multicall({ contracts: addrs.map((a) => ({ address: router!, abi: routerAbi, functionName: "isAdapter" as const, args: [a] as const })), allowFailure: true });
      return addrs.filter((_, i) => res[i]?.result === true);
    },
  });
  const a = lc(sell.address) === lc(NATIVE) ? net.wrapped : sell.address;
  const b = lc(buy.address) === lc(NATIVE) ? net.wrapped : buy.address;
  const quotes = useQuery({
    // read in the block the swap box quoted (Trade's getQuote), so ✓ and the fill below are exactly the swap box's route
    // and amount; without a block (the swap box's fallback), the router's own pick in the same multicall is used
    queryKey: ["venue-quotes", net.key, sell.address, buy.address, amt.toString(), live.data?.join(), block?.toString()],
    enabled: !!pub && !!router && !!live.data?.length && lc(a) !== lc(b),
    staleTime: 3_000,
    refetchInterval: block ? false : 4_000,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const vs = live.data!;
      const res = await pub!.multicall({
        contracts: [
          { address: router!, abi: routerAbi, functionName: "quote" as const, args: [sell.address, buy.address, amt] as const },
          ...vs.map((v) => ({ address: v, abi: adapterAbi, functionName: "quote" as const, args: [a, b, amt] as const })),
        ] as never,
        allowFailure: true,
        ...(block ? { blockNumber: block } : {}),
      }) as { result?: unknown }[];
      const best = res[0]?.result as Route | undefined;
      return { stoa: best?.amountOut ?? 0n, best, rows: vs.map((v, i) => ({ venue: v, name: net.venues[lc(v)] ?? "Venue", out: (res[i + 1]?.result as bigint | undefined) ?? 0n })) };
    },
  });

  const all = (quotes.data?.rows ?? []).filter((r) => r.out > 0n).sort((x, y) => (y.out > x.out ? 1 : y.out < x.out ? -1 : 0));
  // a venue quoting under half of the best has almost no liquidity for this pair: not a real alternative, and it would
  // make Stoa's edge look bigger than it is
  const rows = all.filter((r) => r.out * 2n >= all[0]?.out);
  if (rows.length < 2) return null;
  const thin = all.length - rows.length;
  // ✓ marks the swap box's route when the rows were read in its block (the usual case), so ✓ and "Filled by" always agree.
  // Without that block, ✓ is the router's own pick in the rows' multicall, except when the swap box skipped Stoa's first
  // V4 adapter for this pair (lib/v4guard) and the router's raw pick still uses it, or the read failed.
  const legs = (r: Route) => [r.leg1.venue, r.leg2.venue].map(lc);
  const best = quotes.data?.best;
  const guarded = !!best && legs(best).includes(OLD_V4) && !legs(route).includes(OLD_V4);
  const shown = block || !best || best.amountOut === 0n || guarded ? route : best;
  const used = !isHop(shown) && !shown.leg1.isPool ? lc(shown.leg1.venue) : null;
  const worst = rows[rows.length - 1];
  const fill = shown === route ? out : shown.amountOut;
  const gain = fill - worst.out;
  const d = buy.decimals, sym = buy.symbol;
  return (
    <div className="cmp">
      <div className="lbl">EVERY VENUE, THIS AMOUNT</div>
      <div className="det" style={{ marginTop: 6 }}>
        {(isHop(shown) || shown.leg1.isPool) && <>
          <span style={{ color: "var(--ink)", fontWeight: 600 }}>✓ {describeRoute(shown, net.venues, net.tokens[1].symbol)}</span>
          <span style={{ color: "var(--accent)", fontWeight: 600 }}>{fmtAmt(fill, d)} {sym}</span></>}
        {rows.map((r) => {
          const on = lc(r.venue) === used;
          return [
            <span key={r.venue + "n"} style={{ display: "flex", alignItems: "center", gap: 8, ...(on ? { color: "var(--ink)", fontWeight: 600 } : {}) }}><VenueIcons ids={venueIds(r.name).slice(0, 1)} />{on ? "✓ " : ""}{r.name}</span>,
            <span key={r.venue + "v"} style={on ? { color: "var(--accent)", fontWeight: 600 } : undefined}>{fmtAmt(r.out, d)} {sym}</span>,
          ];
        })}
      </div>
      {gain > 0n && <div className="gain">+{fmtAmt(gain, d)} {sym} on Stoa vs {worst.name}, after the 2 bps fee</div>}
      <p className="note" style={{ marginTop: 6, fontSize: 12 }}>Each venue&apos;s own quote for the whole amount, direct, before Stoa&apos;s fee. ✓ is the route Stoa fills.{thin > 0 ? ` ${thin} venue${thin === 1 ? "" : "s"} with almost no liquidity for this pair left out.` : ""}</p>
    </div>
  );
}
