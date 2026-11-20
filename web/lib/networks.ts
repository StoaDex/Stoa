import { defineChain, type Address, type Chain } from "viem";
import { CONTRACTS, DEPLOY_BLOCK, LOGS_RPC, RPCS, VENUE_NAMES, elysium } from "./chain";
import { TOKENS, VERIFIED, BRIDGED, POPULAR, NATIVE, WHYPE, USDC, type Token } from "./tokens";
import rh from "./deployments-4663.json";
import rhPopular from "./popular-tokens-4663.json";

/** Everything the app needs to know about one chain. Elysium keeps its original modules (chain.ts, tokens.ts);
 *  Robinhood Chain is described here. Components read the selected one with useNet(). */
/** A venue adapter deployed for the router but possibly not added yet (the admin page adds it through the timelock).
 *  Concentrated-liquidity venues keyed by tick spacing: `factory` and `spacings` are what the adapter checks. */
export interface NewVenue { address: Address; name: string; dexId: string; factory: string; spacings: number[] }

export interface Net {
  key: "elysium" | "robinhood";
  name: string;
  short: string;
  /** official network logo, served from /public/networks */
  logo: string;
  chain: Chain;
  /** gas token symbol, shown in messages */
  gas: string;
  native: Token;
  /** wrapped native token: the router's hop token */
  wrapped: Address;
  /** main stablecoin */
  stable: Address;
  tokens: Token[];
  /** how many entries at the start of `tokens` are core tokens (native, wrapped, stable) */
  core: number;
  contracts: { router?: Address; pool?: Address; fees?: Address; v4?: Address; registry?: Address; safe?: Address; timelock?: Address; buyback?: Address; bonds?: Address; spotlight?: Address; cover?: Address; limit?: Address };
  deployed: boolean;
  deployBlock: bigint;
  venues: Record<string, string>;
  /** RPC that answers eth_getLogs (and its block-range cap per query) */
  logsRpc: string;
  logsSpan: bigint;
  v4PoolManager: Address;
  dexscreener: string;
  stables: string[];
  explorer: string;
  /** venues the router checks, for copy */
  venueList: string;
  /** maker pools exist on this chain */
  makers: boolean;
  /** deployed venue adapters that may not be in the router yet (the admin page adds them through the timelock) */
  newVenues: NewVenue[];
  /** Pons bonding-curve adapter: tokens still on their launch curve (listed as live once the router uses it) */
  pons?: Address;
}

const addr = (v?: string) => (v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as Address) : undefined);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export const ELYSIUM: Net = {
  key: "elysium",
  name: "Elysium",
  short: "Elysium",
  logo: "/networks/elysium.svg",
  chain: elysium,
  gas: "HYPE",
  native: TOKENS[0],
  wrapped: WHYPE,
  stable: USDC,
  tokens: [...TOKENS, ...VERIFIED, ...BRIDGED, ...POPULAR],
  core: TOKENS.length,
  contracts: CONTRACTS,
  deployed: Boolean(CONTRACTS.router),
  deployBlock: DEPLOY_BLOCK,
  venues: VENUE_NAMES,
  logsRpc: LOGS_RPC,
  logsSpan: 0n, // no cap on Kinetiq's RPC
  v4PoolManager: "0xe2E105D3f7209A9da11F83ccf3E7398a753823F1",
  dexscreener: "elysium",
  stables: ["0xb47c4c8f73f009cc0c0d3f92b388d13e293f0b65", "0x3bde42a1da8f1d95564f2c4a51a0cf73a725674c"],
  explorer: "https://elysium.kinetiq.xyz",
  venueList: "Uniswap V2/V3/V4, Aero, Ramses and Liquidity Book",
  makers: true,
  newVenues: [],
};

// ---------------------------------------------------------------- Robinhood Chain (chain 4663)
const RH_PUBLIC_RPC = "https://rpc.mainnet.chain.robinhood.com";
/** Reads and transactions: NEXT_PUBLIC_ROBINHOOD_RPC_URL (comma list, first = primary), public RPC otherwise. */
const RH_RPCS = (process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL || RH_PUBLIC_RPC).split(",").map((s) => s.trim()).filter(Boolean);
export const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: RH_RPCS } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
});
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" as Address;
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as Address;
const RH_CORE: Token[] = [
  { symbol: "ETH", name: "Native", address: NATIVE, decimals: 18, glyph: "Ξ", tone: "native", logo: "/tokens/eth.svg" },
  { symbol: "WETH", name: "Wrapped Ether", address: WETH, decimals: 18, glyph: "Ξ", tone: "hype", logo: "/tokens/eth.svg" },
  { symbol: "USDG", name: "Global Dollar", address: USDG, decimals: 6, glyph: "$", tone: "usd", logo: "/tokens/0x5fc5360d0400a0fd4f2af552add042d716f1d168.webp" },
];
const D = rh as unknown as Partial<Record<string, string>> & { block?: number };
const rhUsed = new Set(RH_CORE.map((t) => t.symbol.toLowerCase()));
/** The most traded tokens in Uniswap V4 pools that Stoa registers on Robinhood Chain, rebuilt daily by
 *  contracts/script/data/popular_tokens.py (24h volume, liquidity floor, Stoa's safety check, a logo). Not reviewed by
 *  Stoa; any other token still trades by pasting its address. */
const RH_POPULAR: Token[] = (rhPopular as { symbol: string; address: string; decimals: number; launchpad?: string; kind?: string; logo?: string }[])
  .filter((t) => t.symbol && !rhUsed.has(t.symbol.toLowerCase()))
  // the list is sorted by trading activity: keep the most traded token per symbol (look-alikes drop out), then
  // keep it only if it has a logo
  .filter((t, i, a) => a.findIndex((x) => x.symbol.toLowerCase() === t.symbol.toLowerCase()) === i)
  .filter((t) => t.logo)
  .map((t) => ({
    symbol: t.symbol, name: `${t.kind === "stock" ? "Robinhood stock token" : t.launchpad ? `${t.launchpad} launch` : "Unverified"} · ${short(t.address)}`, address: t.address as Address,
    decimals: t.decimals, glyph: t.symbol[0] ?? "?", tone: "other" as const, logo: t.logo,
  }));
const rhContracts = {
  router: addr(D.router), fees: addr(D.feeDistributor), v4: addr(D.uniswapV4Adapter), registry: addr(D.makerRegistry),
  safe: addr(D.safe), timelock: addr(D.timelock), buyback: addr(D.stoaBuyback), bonds: addr(D.bondRegistry),
  spotlight: addr(D.spotlightMarket), cover: addr(D.rugCover), limit: addr(D.limit), metric: addr(D.metricAdapter),
};
export const ROBINHOOD: Net = {
  key: "robinhood",
  name: "Robinhood Chain",
  short: "Robinhood",
  logo: "/networks/robinhood.png",
  chain: robinhood,
  gas: "ETH",
  native: RH_CORE[0],
  wrapped: WETH,
  stable: USDG,
  tokens: [...RH_CORE, ...RH_POPULAR],
  core: RH_CORE.length,
  contracts: rhContracts,
  deployed: Boolean(rhContracts.router),
  deployBlock: BigInt(D.block ?? 0),
  venues: Object.fromEntries(
    ([[D.uniswapV2Adapter, "Uniswap V2"], [D.uniswapV3Adapter, "Uniswap V3"], [D.uniswapV4Adapter, "Uniswap V4"], [D.aeroAdapter, "Aero"], [D.ramsesAdapter, "Ramses"], [D.ponsAdapter, "Pons curve"], [D.metricAdapter, "Metric"], [D.uniswapV4AdapterV2, "Uniswap V4"], [D.upAdapter, "up."]] as const)
      .filter(([a]) => addr(a))
      .map(([a, n]) => [a!.toLowerCase(), n]),
  ),
  // log scans stay on the public RPC: free Alchemy and dRPC plans cap eth_getLogs at 10 and 10,000 blocks
  logsRpc: process.env.NEXT_PUBLIC_ROBINHOOD_LOGS_RPC_URL || RH_PUBLIC_RPC,
  logsSpan: 9_000_000n, // the public RPC caps a log query at 10M blocks
  v4PoolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
  dexscreener: "robinhood",
  stables: [USDG.toLowerCase()],
  explorer: "https://robinhoodchain.blockscout.com",
  venueList: "Uniswap V2, V3 and V4",
  makers: false,
  pons: addr(D.ponsAdapter),
  newVenues: ([
    [D.aeroAdapter, "Aero", "aero", "0xc63d7338c178e805c544b8f897066bd3bbcbe136", [1, 10, 50, 100, 150, 200, 250]],
    [D.ramsesAdapter, "Ramses", "ramses", "0xe0c4ceb92d08ca985bb70fe0a22feb121a9854a8", [1, 5, 10, 50, 100, 200, 300, 500]],
  ] as const)
    .filter(([a]) => addr(a))
    .map(([a, name, dexId, factory, spacings]) => ({ address: a as Address, name, dexId, factory, spacings: [...spacings] })),
};

export const NETS: Net[] = [ROBINHOOD, ELYSIUM]; // Robinhood first: the default network and the first one listed
export const netById = (id?: number) => NETS.find((n) => n.chain.id === id);
export const netByKey = (k?: string | null) => NETS.find((n) => n.key === k);

export const txUrlOn = (n: Net, hash: string) => `${n.explorer}/tx/${hash}`;
export const addressUrlOn = (n: Net, a: string) => `${n.explorer}/address/${a}`;
export { RPCS };
