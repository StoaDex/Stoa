import "server-only";
import { createPublicClient, erc20Abi, formatUnits, http, parseAbi, parseUnits, type Address } from "viem";
import { ROBINHOOD } from "./networks";
import { srv } from "./serverRpc";
import { NATIVE } from "./tokens";
import { CA as STOA } from "./stoaAddress";
import { stockTokens } from "./stocks";

const net = ROBINHOOD;
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as Address;
const lc = (a: string) => a.toLowerCase();
const routerAbi = parseAbi([
  "function isAdapter(address) view returns (bool)",
  "function quote(address,address,uint256) view returns ((uint256 amountOut, address mid, (address venue, bool isPool) leg1, (address venue, bool isPool) leg2))",
]);
const adapterAbi = parseAbi(["function quote(address tokenIn, address tokenOut, uint256 amountIn) view returns (uint256)"]);

export type VenueRow = {
  time: number; block: string; pair: string; sell: string; buy: string; amount_in: number;
  venue: string; venue_address: string; amount_out: number | null; vs_best_bps: number | null; router_out: number | null;
};

/** A fixed basket of swaps on Robinhood Chain quoted on every venue Stoa's router uses, in one block: what each venue
 *  alone would return (direct, one hop) and what the router's own route returns. For the open venue-quotes dataset.
 *  Read-only eth_calls; nothing is sent. A venue with no pool for a pair shows no amount. */
export async function venueSnapshot(): Promise<VenueRow[]> {
  const router = net.contracts.router;
  if (!router) return [];
  const c = createPublicClient({ chain: net.chain, transport: http(srv(net.chain.rpcUrls.default.http[0]), { timeout: 15_000, fetchOptions: { headers: { "user-agent": "curl/8.5.0" } } }) });
  const addrs = Object.keys(net.venues) as Address[];
  const isA = await c.multicall({ contracts: addrs.map((a) => ({ address: router, abi: routerAbi, functionName: "isAdapter" as const, args: [a] as const })), allowFailure: true });
  const venues = addrs.filter((_, i) => isA[i]?.result === true);
  const st = await stockTokens().catch(() => null);
  const stock = (s: string) => st?.stocks.find((x) => x.symbol === s && x.route)?.address as Address | undefined;
  type T = { sym: string; addr: Address; dec: number };
  const ETH: T = { sym: "ETH", addr: NATIVE as Address, dec: 18 }, G: T = { sym: "USDG", addr: USDG, dec: 6 }, S: T = { sym: "STOA", addr: STOA as Address, dec: 18 };
  const legs: [T, T, string[]][] = [[ETH, G, ["0.05", "0.5", "5"]], [G, ETH, ["100", "1000", "10000"]], [ETH, S, ["0.05", "0.5"]]];
  const picks = ["TSLA", "NVDA", "SPCX", "QQQ", "AMD"].map((s) => [s, stock(s)] as const).filter((p): p is readonly [string, Address] => !!p[1]);
  const decs = picks.length ? await c.multicall({ contracts: picks.map(([, a]) => ({ address: a, abi: erc20Abi, functionName: "decimals" as const })), allowFailure: true }) : [];
  picks.forEach(([s, a], i) => { const d = decs[i]?.result; if (typeof d === "number") legs.push([G, { sym: s, addr: a, dec: d }, ["100", "1000"]]); });
  const block = await c.getBlockNumber();
  const time = Math.floor(Date.now() / 1000);
  const out: VenueRow[] = [];
  for (const [x, y, sizes] of legs) {
    const a = lc(x.addr) === lc(NATIVE) ? net.wrapped : x.addr, b = lc(y.addr) === lc(NATIVE) ? net.wrapped : y.addr;
    for (const size of sizes) {
      const amt = parseUnits(size, x.dec);
      const r = await c.multicall({
        contracts: [
          { address: router, abi: routerAbi, functionName: "quote" as const, args: [x.addr, y.addr, amt] as const },
          ...venues.map((v) => ({ address: v, abi: adapterAbi, functionName: "quote" as const, args: [a, b, amt] as const })),
        ] as never,
        allowFailure: true, blockNumber: block,
      }) as { result?: unknown }[];
      const best = r[0]?.result as { amountOut: bigint } | undefined;
      const routerOut = best && best.amountOut > 0n ? Number(formatUnits(best.amountOut, y.dec)) : null;
      const vals = venues.map((_, i) => r[i + 1]?.result as bigint | undefined);
      const top = vals.reduce<bigint>((m, v) => (v && v > m ? v : m), 0n);
      venues.forEach((v, i) => {
        const o = vals[i];
        out.push({
          time, block: block.toString(), pair: `${x.sym}/${y.sym}`, sell: x.sym, buy: y.sym, amount_in: Number(size),
          venue: net.venues[lc(v)] ?? "venue", venue_address: lc(v),
          amount_out: o && o > 0n ? Number(formatUnits(o, y.dec)) : null,
          vs_best_bps: o && o > 0n && top > 0n ? Number(((top - o) * 10_000n) / top) : null,
          router_out: routerOut,
        });
      });
    }
  }
  return out;
}
