import { createPublicClient, erc20Abi, http, parseAbi, type Address } from "viem";
import { ROBINHOOD } from "./networks";
import { srv } from "@/lib/serverRpc";

// One Pons launch, read straight from Robinhood Chain (server side): used by /api/pons/token/<address>, the
// /launches/<address> page metadata and its link card. The list of launches lives in /api/pons/launches.

export const PONS_FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e" as Address;
export const PONS_HOOK = "0xe5e702641ea86f4ae6cc3cdaed2b886f976be044";
export const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as Address;
const ZERO = "0x0000000000000000000000000000000000000000" as Address;

export const ponsCurveAbi = parseAbi([
  "function graduated() view returns (bool)",
  "function realQuoteReserve() view returns (uint256)",
  "function graduationThreshold() view returns (uint256)",
  "function quoteReserve() view returns (uint256)",
  "function tokenReserve() view returns (uint256)",
  "function launchSupply() view returns (uint256)",
  "function launchedAt() view returns (uint256)",
  "function isNativeQuote() view returns (bool)",
  "function creatorTaxBps() view returns (uint256)",
  "function pairToken() view returns (address)",
]);
export const ponsLogoAbi = parseAbi(["function logo() view returns (string)"]);
const routerAbi = parseAbi(["function quote(address,address,uint256) returns ((uint256 amountOut, address mid, (address venue, bool isPool) leg1, (address venue, bool isPool) leg2))"]);

export type Launch = {
  token: Address; curve: Address; name: string; symbol: string;
  raised: string; threshold: string; progress: number; graduated: boolean;
  mcapEth: string; mcapUsd: number | null; launchedAt: number; creatorTaxBps: number; logo: string | null;
  /** launch supply in whole tokens, for market cap = price x supply */
  supply: number;
};
export type LaunchInfo = Launch & {
  /** priced in ETH on its curve (most launches); otherwise in `pair` (USDG, a stock token...) */
  native: boolean;
  pair: Address | null;
  pairSymbol: string;
  /** Stoa's router routes to this token right now from `tradeFrom` (curve adapter or Uniswap V4 pool) */
  routable: boolean;
  tradeFrom: "ETH" | "USDG" | null;
  /** USD per token: the curve's spot price, or Stoa's best quote once graduated */
  priceUsd: number | null;
  ethUsd: number | null;
  updated: string;
};

/** ipfs://<cid> logos go through our own proxy (/api/pons/logo); anything else is not shown. `token` lets the proxy
 *  check a logo that is not in the launches list against the token itself. */
export const logoUrl = (v: unknown, token?: Address) => {
  const m = /^ipfs:\/\/(?:ipfs\/)?([A-Za-z0-9]{46,130})$/.exec(String(v ?? "").trim());
  return m ? `/api/pons/logo/${m[1]}${token ? `?t=${token}` : ""}` : null;
};

export const ua = { fetchOptions: { headers: { "user-agent": "curl/8.5.0" } }, timeout: 15_000 };
export const rhClient = () => {
  const rpc = (ROBINHOOD.chain.rpcUrls.default.http as readonly string[])[0] ?? ROBINHOOD.logsRpc;
  return createPublicClient({ chain: ROBINHOOD.chain, transport: http(srv(rpc), ua) });
};
const eth = (v: bigint, dp = 4) => (Number(v) / 1e18).toFixed(dp);

/** The Pons curve of a token, or null when the Pons factory never launched it. getLaunchedToken returns a static
 *  struct that starts (token, curve, ...) and is all zeros for unknown tokens. */
export async function curveOf(token: Address, c = rhClient()): Promise<Address | null> {
  const { data } = await c.call({ to: PONS_FACTORY, data: `0x3cf28b5a${token.slice(2).toLowerCase().padStart(64, "0")}` });
  if (!data || data.length < 2 + 128) return null;
  const t = `0x${data.slice(26, 66)}`, curve = `0x${data.slice(90, 130)}` as Address;
  return t.toLowerCase() === token.toLowerCase() && !/^0x0+$/.test(curve) ? curve : null;
}

/** Everything the token page shows. null: not a Pons launch. Throws when the RPC is down. */
export async function readLaunch(token: Address): Promise<LaunchInfo | null> {
  const c = rhClient();
  const curve = await curveOf(token, c);
  if (!curve) return null;
  const r = await c.multicall({
    allowFailure: true,
    contracts: [
      { address: token, abi: erc20Abi, functionName: "name" },
      { address: token, abi: erc20Abi, functionName: "symbol" },
      { address: curve, abi: ponsCurveAbi, functionName: "graduationThreshold" },
      { address: curve, abi: ponsCurveAbi, functionName: "quoteReserve" },
      { address: curve, abi: ponsCurveAbi, functionName: "tokenReserve" },
      { address: curve, abi: ponsCurveAbi, functionName: "launchSupply" },
      { address: curve, abi: ponsCurveAbi, functionName: "launchedAt" },
      { address: curve, abi: ponsCurveAbi, functionName: "creatorTaxBps" },
      { address: token, abi: ponsLogoAbi, functionName: "logo" },
      { address: curve, abi: ponsCurveAbi, functionName: "graduated" },
      { address: curve, abi: ponsCurveAbi, functionName: "realQuoteReserve" },
      { address: curve, abi: ponsCurveAbi, functionName: "isNativeQuote" },
      { address: curve, abi: ponsCurveAbi, functionName: "pairToken" },
    ] as const,
  });
  const v = (i: number) => r[i]?.result;
  const thr = (v(2) as bigint | undefined) ?? 0n, qr = (v(3) as bigint | undefined) ?? 0n, tr = (v(4) as bigint | undefined) ?? 0n;
  const supplyWei = (v(5) as bigint | undefined) ?? 10n ** 27n;
  const graduated = v(9) === true, raised = graduated ? 0n : ((v(10) as bigint | undefined) ?? 0n);
  const native = v(11) === true;
  const pairAddr = v(12) as Address | undefined;
  const pair = native || !pairAddr || /^0x0+$/.test(pairAddr) ? null : pairAddr;
  const isUsdg = !!pair && pair.toLowerCase() === USDG.toLowerCase();
  let pairSymbol = "ETH", pairDec = 18;
  if (pair) {
    const m = await c.multicall({ allowFailure: true, contracts: [{ address: pair, abi: erc20Abi, functionName: "symbol" }, { address: pair, abi: erc20Abi, functionName: "decimals" }] as const });
    pairSymbol = String(m[0]?.result ?? "?").slice(0, 12);
    pairDec = Number(m[1]?.result ?? 18);
  }

  // ETH/USD, and Stoa's own route to the token (from ETH, or from USDG for launches priced in USDG)
  const quote = async (from: Address, to: Address, amount: bigint) => {
    try {
      const q = await c.simulateContract({ address: ROBINHOOD.contracts.router!, abi: routerAbi, functionName: "quote", args: [from, to, amount] });
      return q.result.amountOut;
    } catch { return 0n; }
  };
  const [usdOut, tokOut] = await Promise.all([quote(ZERO, USDG, 10n ** 16n), native ? quote(ZERO, token, 10n ** 15n) : isUsdg ? quote(USDG, token, 10n ** 6n) : Promise.resolve(0n)]);
  const ethUsd = usdOut > 0n ? (Number(usdOut) / 1e6) * 100 : null;
  // curve: exact spot price from its reserves; graduated: what Stoa's best route pays for a small buy
  const spot = !graduated && tr > 0n ? Number(qr) / 10 ** pairDec / (Number(tr) / 1e18) : null; // pair units per token
  let priceUsd: number | null = null;
  if (native) priceUsd = ethUsd === null ? null : (spot ?? (tokOut > 0n ? 1e15 / Number(tokOut) : NaN)) * ethUsd;
  else if (isUsdg) priceUsd = spot ?? (tokOut > 0n ? 1e18 / Number(tokOut) : null);
  if (priceUsd !== null && !Number.isFinite(priceUsd)) priceUsd = null;
  const supply = Number(supplyWei) / 1e18;
  const mcapUsd = priceUsd === null ? null : priceUsd * supply;
  const fmtPair = (x: bigint, dp: number) => (Number(x) / 10 ** pairDec).toFixed(dp);
  return {
    token, curve,
    name: String(v(0) ?? "").slice(0, 40), symbol: String(v(1) ?? "?").slice(0, 16),
    raised: fmtPair(raised, 4), threshold: fmtPair(thr, 2), graduated,
    progress: graduated ? 100 : thr > 0n ? Math.min(99.9, Number((raised * 10_000n) / thr) / 100) : 0,
    mcapEth: mcapUsd !== null && ethUsd ? (mcapUsd / ethUsd).toFixed(2) : "0", mcapUsd,
    launchedAt: Number((v(6) as bigint | undefined) ?? 0n), creatorTaxBps: Number((v(7) as bigint | undefined) ?? 0n),
    logo: logoUrl(v(8), token), supply,
    native, pair, pairSymbol, routable: tokOut > 0n, tradeFrom: native ? "ETH" : isUsdg ? "USDG" : null, priceUsd, ethUsd,
    updated: new Date().toISOString(),
  };
}
