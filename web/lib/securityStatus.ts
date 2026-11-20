import { createPublicClient, formatEther, http, parseAbi, type Address } from "viem";
import rh from "./deployments-4663.json";
import { ROBINHOOD } from "./networks";
import { computeGuard } from "./v4guard";
import { srv } from "@/lib/serverRpc";

/** Live security status of Stoa on Robinhood Chain, read from the chain (server side, cached a minute by the page).
 *  Every value here is something anyone can check on the explorer: who owns each contract, whether it is paused,
 *  the governance delays, which venues the router uses and which are still waiting in the timelock. */

const D = rh as unknown as Record<string, string | number | undefined>;
const a = (k: string) => (typeof D[k] === "string" && /^0x[0-9a-fA-F]{40}$/.test(D[k] as string) ? (D[k] as Address) : undefined);
export const KEEPER = "0xbf666e8D054935170b9f09127247905A975b3B80" as Address;

const abi = parseAbi([
  "function owner() view returns (address)",
  "function paused() view returns (bool)",
  "function guardian() view returns (address)",
  "function getMinDelay() view returns (uint256)",
  "function delay() view returns (uint256)",
  "function setupLocked() view returns (bool)",
  "function adapterCount() view returns (uint256)",
  "function adapters(uint256) view returns (address)",
  "function isAdapter(address) view returns (bool)",
  "function getThreshold() view returns (uint256)",
  "function getOwners() view returns (address[])",
]);

export type ContractRow = { name: string; address: Address; owner?: Address; ownerLabel: string; paused?: boolean; guardian?: Address };
export type VenueRow = { name: string; address: Address; live: boolean };
export type Status = {
  checkedAt: number;
  contracts: ContractRow[];
  timelockDelayH: number | null;
  routerDelayH: number | null;
  setupLocked: boolean | null;
  safe: { threshold: number; owners: number } | null;
  venues: VenueRow[];
  v4Guard: { ok: boolean; poisoned: number; oldInRouter: boolean } | null;
  keeperEth: string | null;
  guardianEth: string | null;
};

const LABELS = (): Record<string, string> => ({
  [String(a("timelock")).toLowerCase()]: "48h timelock",
  [String(a("stoaBuyback")).toLowerCase()]: "StoaBuyback",
  [String(a("safe")).toLowerCase()]: "admin Safe",
  [KEEPER.toLowerCase()]: "keeper",
});

export async function securityStatus(): Promise<Status> {
  const c = createPublicClient({ chain: ROBINHOOD.chain, transport: http(srv(ROBINHOOD.chain.rpcUrls.default.http[0])) });
  const list: [string, Address | undefined][] = [
    ["StoaRouter", a("router")],
    ["FeeDistributor", a("feeDistributor")],
    ["StoaBuyback", a("stoaBuyback")],
    ["Limit orders (StoaLimitV2)", a("limit")],
    ["Rug Cover", a("rugCover")],
    ["Spotlight", a("spotlightMarket")],
    ["Uniswap V4 adapter (V2)", a("uniswapV4AdapterV2")],
    ["Metric adapter", a("metricAdapter")],
  ];
  const cs = list.filter((x): x is [string, Address] => Boolean(x[1]));
  const reads = await c.multicall({
    allowFailure: true,
    contracts: cs.flatMap(([, addr]) => [
      { address: addr, abi, functionName: "owner" as const },
      { address: addr, abi, functionName: "paused" as const },
      { address: addr, abi, functionName: "guardian" as const },
    ]),
  });
  const labels = LABELS();
  const contracts: ContractRow[] = cs.map(([name, addr], i) => {
    const owner = reads[i * 3]?.result as Address | undefined;
    return {
      name, address: addr, owner,
      ownerLabel: owner ? labels[owner.toLowerCase()] ?? "other" : "no owner",
      paused: reads[i * 3 + 1]?.result as boolean | undefined,
      guardian: reads[i * 3 + 2]?.result as Address | undefined,
    };
  });

  const R = a("router"), T = a("timelock"), S = a("safe");
  const gov = await c.multicall({
    allowFailure: true,
    contracts: [
      { address: T!, abi, functionName: "getMinDelay" },
      { address: R!, abi, functionName: "delay" },
      { address: R!, abi, functionName: "setupLocked" },
      { address: R!, abi, functionName: "adapterCount" },
      { address: S ?? T!, abi, functionName: "getThreshold" },
      { address: S ?? T!, abi, functionName: "getOwners" },
    ] as const,
  });
  const hours = (v: unknown) => (typeof v === "bigint" ? Number(v) / 3600 : null);
  const n = Number((gov[3]?.result as bigint | undefined) ?? 0n);
  const inRouter = n ? await c.multicall({ allowFailure: true, contracts: Array.from({ length: n }, (_, i) => ({ address: R!, abi, functionName: "adapters" as const, args: [BigInt(i)] as const })) }) : [];
  const live = new Set(inRouter.map((r) => String(r.result ?? "").toLowerCase()).filter(Boolean));

  // every adapter Stoa has deployed on Robinhood Chain: live in the router, or still on its way through the timelock
  const venues: VenueRow[] = Object.entries(ROBINHOOD.venues).map(([addr, name]) => ({ name, address: addr as Address, live: live.has(addr) }));
  const known = new Set(Object.keys(ROBINHOOD.venues));
  for (const addr of live) if (!known.has(addr)) venues.push({ name: "Other venue", address: addr as Address, live: true });

  let v4Guard: Status["v4Guard"] = null;
  try {
    const g = await computeGuard();
    v4Guard = { ok: g.poisoned.length === 0, poisoned: g.poisoned.length, oldInRouter: g.oldInRouter };
  } catch { /* the monitor in GitHub Actions still runs; the page just doesn't show it */ }

  const guardianAddr = contracts.find((x) => x.name === "StoaRouter")?.guardian;
  const [k, gd] = await Promise.all([
    c.getBalance({ address: KEEPER }).catch(() => null),
    guardianAddr ? c.getBalance({ address: guardianAddr }).catch(() => null) : Promise.resolve(null),
  ]);
  return {
    checkedAt: Date.now(),
    contracts,
    timelockDelayH: hours(gov[0]?.result),
    routerDelayH: hours(gov[1]?.result),
    setupLocked: (gov[2]?.result as boolean | undefined) ?? null,
    safe: S && gov[4]?.status === "success" ? { threshold: Number(gov[4].result as bigint), owners: ((gov[5]?.result as readonly Address[] | undefined) ?? []).length } : null,
    venues,
    v4Guard,
    keeperEth: k === null ? null : Number(formatEther(k)).toFixed(4),
    guardianEth: gd === null || gd === undefined ? null : Number(formatEther(gd)).toFixed(4),
  };
}

export const fmtEth = (v: string | null) => (v === null ? "—" : `${v} ETH`);
