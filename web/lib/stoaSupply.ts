import { createPublicClient, erc20Abi, http, parseAbi, type Address } from "viem";
import { ROBINHOOD } from "./networks";
import { CA } from "./stoaAddress";
import { srv } from "@/lib/serverRpc";

/** $STOA's Pons bonding curve. Unsold $STOA sits here until the curve graduates to a Uniswap V4 pool. */
export const STOA_CURVE = "0xd0b519310688e830c9aee29ae117edc3fbb1c13f" as Address;
export const BURN = "0x000000000000000000000000000000000000dEaD" as Address;
export const curveAbi = parseAbi([
  "function graduationThreshold() view returns (uint256)",
  "function graduated() view returns (bool)",
  "function realQuoteReserve() view returns (uint256)",
]);
/** the hook Pons gives the Uniswap V4 pool it creates at graduation (ETH pair, locked liquidity) */
export const PONS_HOOK = "0xe5e702641ea86f4ae6cc3cdaed2b886f976be044" as Address;
export const PONS_URL = `https://ponsfamily.com/launchpad/${CA}`;

export type Supply = {
  /** every $STOA ever minted (fixed at launch) */
  max: bigint;
  /** minted minus burned */
  total: bigint;
  /** total minus the unsold $STOA still on the bonding curve */
  circulating: bigint;
  burned: bigint;
  inCurve: bigint;
  curveEth: bigint;
  threshold: bigint;
  graduated: boolean;
};

/** Server side: reads straight from Robinhood Chain (dedicated RPC first, public RPC as fallback). */
export async function readSupply(): Promise<Supply> {
  const rpcs = [...(ROBINHOOD.chain.rpcUrls.default.http as readonly string[]), ROBINHOOD.logsRpc];
  let last: unknown;
  for (const url of rpcs) {
    try {
      const c = createPublicClient({ chain: ROBINHOOD.chain, transport: http(srv(url), { fetchOptions: { headers: { "user-agent": "curl/8.5.0" } }, timeout: 8_000 }) });
      const [max, burned, inCurve, curveEth, threshold, graduated] = await Promise.all([
        c.readContract({ address: CA, abi: erc20Abi, functionName: "totalSupply" }),
        c.readContract({ address: CA, abi: erc20Abi, functionName: "balanceOf", args: [BURN] }),
        c.readContract({ address: CA, abi: erc20Abi, functionName: "balanceOf", args: [STOA_CURVE] }),
        // ETH raised, as the curve counts it for graduation (its balance can also hold fees)
        c.readContract({ address: STOA_CURVE, abi: curveAbi, functionName: "realQuoteReserve" }),
        c.readContract({ address: STOA_CURVE, abi: curveAbi, functionName: "graduationThreshold" }),
        c.readContract({ address: STOA_CURVE, abi: curveAbi, functionName: "graduated" }),
      ]);
      const total = max - burned;
      return { max, total, circulating: total - inCurve, burned, inCurve, curveEth, threshold, graduated };
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

/** whole-token decimal string, e.g. "657409872.69" */
export const units = (v: bigint, dp = 2) => {
  const s = (Number(v) / 1e18).toFixed(dp);
  return s.replace(/\.?0+$/, "");
};

/** Server side: $STOA locked in Stoa's contracts (Spotlight votes, Rug Cover backers, maker bonds). Missing contracts
 *  count as 0. */
export async function readLocked(): Promise<{ total: bigint; spotlight: bigint; cover: bigint; bonds: bigint }> {
  const C = ROBINHOOD.contracts;
  const lockAbi = parseAbi(["function totalLocked() view returns (uint256)", "function totalBonded() view returns (uint256)"]);
  const rpcs = [...(ROBINHOOD.chain.rpcUrls.default.http as readonly string[]), ROBINHOOD.logsRpc];
  let last: unknown;
  for (const url of rpcs) {
    try {
      const c = createPublicClient({ chain: ROBINHOOD.chain, transport: http(srv(url), { fetchOptions: { headers: { "user-agent": "curl/8.5.0" } }, timeout: 8_000 }) });
      const [spotlight, cover, bonds] = await Promise.all([
        C.spotlight ? c.readContract({ address: C.spotlight, abi: lockAbi, functionName: "totalLocked" }) : 0n,
        C.cover ? c.readContract({ address: C.cover, abi: lockAbi, functionName: "totalLocked" }) : 0n,
        C.bonds ? c.readContract({ address: C.bonds, abi: lockAbi, functionName: "totalBonded" }) : 0n,
      ]);
      return { total: spotlight + cover + bonds, spotlight, cover, bonds };
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

/** the next weekly buyback (buyback-robinhood.yml: Mondays 13:41 UTC), unix seconds */
export function nextBuybackAt(nowSec: number) {
  const d = new Date(nowSec * 1000);
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 13, 41) / 1000;
  let add = (1 - d.getUTCDay() + 7) % 7;
  if (add === 0 && nowSec >= t) add = 7;
  return t + add * 86400;
}
