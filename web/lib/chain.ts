import deployment from "./deployments.json";
import { defineChain, type Address } from "viem";

const id = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 99901);
/** One or more RPC URLs, comma-separated; the first is primary, the rest are fallbacks. */
export const RPCS = (process.env.NEXT_PUBLIC_RPC_URL || "").split(",").map((s) => s.trim()).filter(Boolean);
// Kinetiq's Elysium explorer (mainnet, chain 99901): /tx/<hash>, /address/<addr>
const explorer = process.env.NEXT_PUBLIC_EXPLORER_URL || (id === 99901 ? "https://elysium.kinetiq.xyz" : "");

export const elysium = defineChain({
  id,
  name: id === 99901 ? "Elysium" : `Local ${id}`,
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: RPCS } },
  blockExplorers: explorer ? { default: { name: "Explorer", url: explorer } } : undefined,
  contracts: id === 99901 ? { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } } : undefined,
});

const addr = (v?: string) => (v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as Address) : undefined);

// Written by the "Deploy contracts" workflow; env vars override it (local testing).
type DeployKey =
  | "router" | "poolWhypeUsdc" | "feeDistributor" | "uniswapV2Adapter" | "uniswapV3Adapter" | "uniswapV4Adapter"
  | "aeroAdapter" | "ramsesAdapter" | "liquidityBookAdapter" | "makerRegistry" | "safe" | "timelock";
const D = deployment as Partial<Record<DeployKey, string>> & { block?: number };

export const CONTRACTS = {
  router: addr(process.env.NEXT_PUBLIC_ROUTER) ?? addr(D.router),
  pool: addr(process.env.NEXT_PUBLIC_POOL_WHYPE_USDC) ?? addr(D.poolWhypeUsdc),
  fees: addr(process.env.NEXT_PUBLIC_FEE_DISTRIBUTOR) ?? addr(D.feeDistributor),
  v4: addr(process.env.NEXT_PUBLIC_UNIV4_ADAPTER) ?? addr(D.uniswapV4Adapter),
  registry: addr(process.env.NEXT_PUBLIC_MAKER_REGISTRY) ?? addr(D.makerRegistry),
  /** admin Safe (2 of 3) that owns the contracts once ownership is moved */
  safe: addr(D.safe),
  /** 48h timelock between the Safe and the contracts */
  timelock: addr(D.timelock),
};

/** Kinetiq's public RPC answers eth_getLogs over the whole chain when filtered by topic, so swap history and
 *  Uniswap V4 pool lookups read logs from it directly (no indexer). Paid RPCs often cap log ranges. */
export const LOGS_RPC = process.env.NEXT_PUBLIC_LOGS_RPC_URL || (id === 99901 ? "https://rpc.elysium.kinetiq.xyz" : RPCS[0] ?? "");
export const deployed = Boolean(CONTRACTS.router);
/** Block the contracts were deployed in: event queries start here. */
export const DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK || D.block || 0);

/** Display names for fallback venues the router may use, keyed by lowercase adapter address. */
export const VENUE_NAMES: Record<string, string> = Object.fromEntries(
  ([
    [addr(process.env.NEXT_PUBLIC_UNIV2_ADAPTER) ?? addr(D.uniswapV2Adapter), "Uniswap V2"],
    [addr(process.env.NEXT_PUBLIC_UNIV3_ADAPTER) ?? addr(D.uniswapV3Adapter), "Uniswap V3"],
    [addr(process.env.NEXT_PUBLIC_UNIV4_ADAPTER) ?? addr(D.uniswapV4Adapter), "Uniswap V4"],
    [addr(D.aeroAdapter), "Aero"],
    [addr(D.ramsesAdapter), "Ramses"],
    [addr(D.liquidityBookAdapter), "Liquidity Book"],
  ] as const)
    .filter(([a]) => a)
    .map(([a, n]) => [a!.toLowerCase(), n]),
);
export const CA = addr(process.env.NEXT_PUBLIC_CA);
export const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://stoadex.com";

export const txUrl = (hash: string) => (explorer ? `${explorer.replace(/\/$/, "")}/tx/${hash}` : undefined);
export const addressUrl = (a: string) => (explorer ? `${explorer.replace(/\/$/, "")}/address/${a}` : undefined);
