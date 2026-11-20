import { createPublicClient, http, parseAbi, parseAbiItem, type Address } from "viem";
import { ROBINHOOD } from "@/lib/networks";
import { CA } from "@/lib/stoaAddress";
import { STOA_CURVE } from "@/lib/stoaSupply";
import { srv } from "@/lib/serverRpc";

// $STOA price history on its Pons bonding curve, rebuilt from the curve's own trade events: start from today's
// reserves and walk back through every buy and sell (the curve is x*y=k on these reserves, so the spot price after
// each trade is exact). Not prerendered; the CDN keeps each answer for a minute.
export const dynamic = "force-dynamic";
const CACHE = { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" };

const LAUNCH_BLOCK = 114276768n;
const BUY = parseAbiItem("event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 creatorTax)");
const SELL = parseAbiItem("event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 creatorTax)");
const curveAbi = parseAbi([
  "function quoteReserve() view returns (uint256)",
  "function tokenReserve() view returns (uint256)",
  "function launchSupply() view returns (uint256)",
  "function graduated() view returns (bool)",
]);
const routerAbi = parseAbi(["function quote(address,address,uint256) returns ((uint256 amountOut, address mid, (address venue, bool isPool) leg1, (address venue, bool isPool) leg2))"]);
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as Address;
const ua = { fetchOptions: { headers: { "user-agent": "curl/8.5.0" } }, timeout: 20_000 };
/** at most this many points in the answer (latest per time bucket) */
const MAX_POINTS = 240;

export type PricePoint = { t: number; eth: number };

export async function GET() {
  try {
    const c = createPublicClient({ chain: ROBINHOOD.chain, transport: http(srv(ROBINHOOD.logsRpc), ua) });
    const head = await c.getBlock();
    // the public RPC caps a log query at 10M blocks (about 12 days here): read in windows
    const logs = async <E extends typeof BUY | typeof SELL>(event: E) => {
      const all = [];
      for (let a = LAUNCH_BLOCK; a <= head.number; a += 9_000_000n) {
        const z = a + 8_999_999n < head.number ? a + 8_999_999n : head.number;
        all.push(...(await c.getLogs({ address: STOA_CURVE, event, fromBlock: a, toBlock: z })));
      }
      return all;
    };
    const [buys, sells, q, tr, supply, graduated] = await Promise.all([
      logs(BUY) as Promise<Awaited<ReturnType<typeof c.getLogs<typeof BUY>>>>,
      logs(SELL) as Promise<Awaited<ReturnType<typeof c.getLogs<typeof SELL>>>>,
      c.readContract({ address: STOA_CURVE, abi: curveAbi, functionName: "quoteReserve", blockNumber: head.number }),
      c.readContract({ address: STOA_CURVE, abi: curveAbi, functionName: "tokenReserve", blockNumber: head.number }),
      c.readContract({ address: STOA_CURVE, abi: curveAbi, functionName: "launchSupply" }),
      c.readContract({ address: STOA_CURVE, abi: curveAbi, functionName: "graduated", blockNumber: head.number }),
    ]);
    type Ev = { block: bigint; idx: number; ts: number; buy: boolean; a: bigint; b: bigint; fee: bigint; tax: bigint };
    // Robinhood Chain RPCs usually add blockTimestamp to logs; otherwise estimate from the block distance (~9.4 blocks/s)
    const ts = (l: { blockTimestamp?: unknown; blockNumber: bigint | null }) => {
      const v = l.blockTimestamp === null || l.blockTimestamp === undefined ? NaN : Number(l.blockTimestamp);
      return Number.isFinite(v) && v > 1e9 ? v : Number(head.timestamp) - Number(head.number - (l.blockNumber ?? head.number)) / 9.4;
    };
    const evs: Ev[] = [
      ...buys.map((l) => ({ block: l.blockNumber!, idx: l.logIndex!, ts: ts(l as never), buy: true, a: l.args.quoteIn!, b: l.args.tokensOut!, fee: l.args.fee!, tax: l.args.creatorTax! })),
      ...sells.map((l) => ({ block: l.blockNumber!, idx: l.logIndex!, ts: ts(l as never), buy: false, a: l.args.tokensIn!, b: l.args.quoteOut!, fee: l.args.fee!, tax: l.args.creatorTax! })),
    ].sort((x, y) => (x.block === y.block ? y.idx - x.idx : x.block > y.block ? -1 : 1)); // newest first

    // walk back from today's reserves; graduated curves are empty, so there is nothing to walk back from
    const pts: PricePoint[] = [];
    if (!graduated && tr > 0n) {
      let Q = q, T = tr;
      pts.push({ t: Number(head.timestamp), eth: Number(Q) / Number(T) });
      for (const e of evs) {
        pts.push({ t: Math.round(e.ts), eth: Number(Q) / Number(T) });
        if (e.buy) { Q -= e.a - e.fee - e.tax; T += e.b; } else { Q += e.b + e.fee + e.tax; T -= e.a; }
        if (T <= 0n || Q <= 0n) break;
      }
      pts.push({ t: evs.length ? Math.round(evs[evs.length - 1].ts) - 1 : Number(head.timestamp), eth: Number(Q) / Number(T) }); // launch price
    }
    pts.reverse();
    // thin to MAX_POINTS: keep the last point of each time bucket, always keep the first and the last
    let out = pts;
    if (pts.length > MAX_POINTS) {
      const t0 = pts[0].t, span = Math.max(1, pts[pts.length - 1].t - t0), step = span / (MAX_POINTS - 1);
      const byBucket = new Map<number, PricePoint>();
      for (const p of pts) byBucket.set(Math.floor((p.t - t0) / step), p);
      out = [pts[0], ...byBucket.values(), pts[pts.length - 1]].sort((a, b) => a.t - b.t);
    }

    let ethUsd: number | null = null;
    try {
      const r = await c.simulateContract({ address: ROBINHOOD.contracts.router!, abi: routerAbi, functionName: "quote", args: ["0x0000000000000000000000000000000000000000", USDG, 10n ** 16n] });
      ethUsd = (Number(r.result.amountOut) / 1e6) * 100;
    } catch { /* USD fields stay empty */ }

    return Response.json(
      { token: CA, curve: STOA_CURVE, graduated, trades: evs.length, supply: Number(supply) / 1e18, ethUsd, points: out, updated: new Date().toISOString() },
      { headers: CACHE },
    );
  } catch {
    return Response.json({ error: "Robinhood Chain RPC unavailable, try again shortly", points: [] }, { status: 503 });
  }
}
