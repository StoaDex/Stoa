import { createPublicClient, erc20Abi, http, parseAbi, parseAbiItem, type Address } from "viem";
import { ROBINHOOD } from "@/lib/networks";
import { PONS_FACTORY as FACTORY, logoUrl, ponsCurveAbi, ponsLogoAbi, type Launch } from "@/lib/ponsLaunch";
import { srv } from "@/lib/serverRpc";

// Live Pons launches on Robinhood Chain: tokens still on their bonding curve (with real ETH raised) and the ones that
// graduated recently. Read from the chain once a minute for every visitor; Pons' own site is the source for the rest.
// Not prerendered at build (a slow RPC would fail the deploy); Vercel's CDN caches each answer for a minute instead.
export const dynamic = "force-dynamic";
// a stuck RPC must not hold the function for the platform's 300 s: give up after 45 s (the CDN keeps serving the last answer)
export const maxDuration = 60;
const DEADLINE_MS = 45_000;
const CACHE = { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" };

const LAUNCHED = parseAbiItem("event TokenLaunched(address indexed token, address indexed curve, address indexed creator, address pairToken, uint256 a, uint256 b)");
const GRADUATED = parseAbiItem("event GraduationTokensPermanentlyLocked(address indexed token, uint256 amount)");
const curveAbi = ponsCurveAbi, logoAbi = ponsLogoAbi;
const routerAbi = parseAbi(["function quote(address,address,uint256) returns ((uint256 amountOut, address mid, (address venue, bool isPool) leg1, (address venue, bool isPool) leg2))"]);
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as Address;
/** ~3.5 days of Robinhood Chain blocks (about 9.4 blocks a second) */
const WINDOW = 2_800_000n;
/** below this, a curve is noise (most launches never raise anything) */
const MIN_RAISED = 50_000_000_000_000_000n; // 0.05 ETH

export type { Launch };

const eth = (v: bigint, dp = 4) => (Number(v) / 1e18).toFixed(dp);
const ua = { fetchOptions: { headers: { "user-agent": "curl/8.5.0" } }, timeout: 20_000 };

export async function GET() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error("deadline")), DEADLINE_MS); });
  try {
    return await Promise.race([read(), deadline]);
  } catch {
    return Response.json({ error: "Robinhood Chain RPC unavailable, try again shortly", launches: [] }, { status: 503 });
  } finally {
    clearTimeout(timer);
  }
}

async function read(): Promise<Response> {
  {
    const logsClient = createPublicClient({ chain: ROBINHOOD.chain, transport: http(srv(ROBINHOOD.logsRpc), ua) });
    const rpc = (ROBINHOOD.chain.rpcUrls.default.http as readonly string[])[0] ?? ROBINHOOD.logsRpc;
    const c = createPublicClient({ chain: ROBINHOOD.chain, transport: http(srv(rpc), ua) });

    const head = await logsClient.getBlockNumber();
    const logs = await logsClient.getLogs({ address: FACTORY, event: LAUNCHED, fromBlock: head - WINDOW, toBlock: head });
    const seen = new Set<string>();
    const all = logs
      .map((l) => ({ token: l.args.token!, curve: l.args.curve! }))
      .reverse()
      .filter((x) => !seen.has(x.token.toLowerCase()) && seen.add(x.token.toLowerCase()));

    // pass 1: ETH each curve raised (0 once graduated), in sequential chunks so public RPCs don't rate-limit us
    const raised: bigint[] = [];
    for (let i = 0; i < all.length; i += 500) {
      const r = await c.multicall({
        allowFailure: true, batchSize: 1_000_000,
        contracts: all.slice(i, i + 500).map((x) => ({ address: x.curve, abi: curveAbi, functionName: "realQuoteReserve" }) as const),
      });
      raised.push(...r.map((x) => (x.result as bigint | undefined) ?? 0n));
    }
    const cands = all.map((x, i) => ({ ...x, raised: raised[i], grad: false })).filter((x) => x.raised >= MIN_RAISED);
    const chk = await c.multicall({
      allowFailure: true, batchSize: 1_000_000,
      contracts: cands.flatMap((x) => [
        { address: x.curve, abi: curveAbi, functionName: "graduated" } as const,
        { address: x.curve, abi: curveAbi, functionName: "isNativeQuote" } as const,
      ]),
    });
    const live = cands
      .filter((_, i) => chk[2 * i]?.result === false && chk[2 * i + 1]?.result === true)
      .sort((a, b) => (b.raised > a.raised ? 1 : -1))
      .slice(0, 60);
    // graduations in the same window, newest first
    const gl = await logsClient.getLogs({ address: FACTORY, event: GRADUATED, fromBlock: head - WINDOW, toBlock: head });
    const curveOf = new Map(all.map((x) => [x.token.toLowerCase(), x.curve]));
    const grads = gl.reverse()
      .map((l) => l.args.token!)
      .filter((t, i, a) => a.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i)
      .slice(0, 15)
      .map((t) => ({ token: t, curve: (curveOf.get(t.toLowerCase()) ?? "0x0000000000000000000000000000000000000000") as Address, raised: 0n, grad: true }));
    const pick = [...live, ...grads];

    // pass 2: details for the ones we show
    const det = await c.multicall({
      allowFailure: true, batchSize: 1_000_000,
      contracts: pick.flatMap((x) => [
        { address: x.token, abi: erc20Abi, functionName: "name" } as const,
        { address: x.token, abi: erc20Abi, functionName: "symbol" } as const,
        { address: x.curve, abi: curveAbi, functionName: "graduationThreshold" } as const,
        { address: x.curve, abi: curveAbi, functionName: "quoteReserve" } as const,
        { address: x.curve, abi: curveAbi, functionName: "tokenReserve" } as const,
        { address: x.curve, abi: curveAbi, functionName: "launchSupply" } as const,
        { address: x.curve, abi: curveAbi, functionName: "launchedAt" } as const,
        { address: x.curve, abi: curveAbi, functionName: "creatorTaxBps" } as const,
        { address: x.token, abi: logoAbi, functionName: "logo" } as const,
      ]),
    });
    let ethUsd: number | null = null;
    try {
      const q = await c.simulateContract({ address: ROBINHOOD.contracts.router!, abi: routerAbi, functionName: "quote", args: ["0x0000000000000000000000000000000000000000", USDG, 10n ** 16n] });
      ethUsd = Number(q.result.amountOut) / 1e6 * 100;
    } catch { /* USD column stays empty */ }

    const out: Launch[] = pick.map((x, i) => {
      const r = (k: number) => det[9 * i + k]?.result;
      const thr = (r(2) as bigint | undefined) ?? 0n, qr = (r(3) as bigint | undefined) ?? 0n, tr = (r(4) as bigint | undefined) ?? 0n;
      const supply = (r(5) as bigint | undefined) ?? 10n ** 27n;
      // spot price on the curve (ETH per token) times the full supply; graduated curves are empty, so no curve price
      const mcap = !x.grad && tr > 0n ? (qr * supply) / tr : 0n;
      return {
        token: x.token, curve: x.curve,
        name: String(r(0) ?? "").slice(0, 40), symbol: String(r(1) ?? "?").slice(0, 16),
        raised: eth(x.raised), threshold: eth(thr, 2), graduated: !!x.grad,
        progress: x.grad ? 100 : thr > 0n ? Math.min(99.9, Number((x.raised * 10_000n) / thr) / 100) : 0,
        mcapEth: eth(mcap, 2), mcapUsd: mcap > 0n && ethUsd ? (Number(mcap) / 1e18) * ethUsd : null,
        launchedAt: Number((r(6) as bigint | undefined) ?? 0n), creatorTaxBps: Number((r(7) as bigint | undefined) ?? 0n),
        logo: logoUrl(r(8)), supply: Number(supply) / 1e18,
      };
    });
    return Response.json({ updated: new Date().toISOString(), scanned: all.length, ethUsd, launches: out }, { headers: CACHE });
  }
}
