import { createPublicClient, decodeFunctionData, http, parseAbi, parseAbiItem, type Address, type Hex } from "viem";
import { OLD_V4 } from "@/lib/v4guard";
import rh from "./deployments-4663.json";
import { ROBINHOOD } from "./networks";
import { srv } from "@/lib/serverRpc";

/** What is waiting in Stoa's timelock on Robinhood Chain, what it recently executed, and the latest pool keys
 *  registered on the Uniswap V4 adapter. Read from the chain's logs (server side; the page caches it a minute). */

const D = rh as unknown as Record<string, string | number | undefined>;
const a = (k: string) => (typeof D[k] === "string" && /^0x[0-9a-fA-F]{40}$/.test(D[k] as string) ? (D[k] as Address) : undefined);
const FROM = BigInt(Number(D.block ?? 0)); // the timelock and the adapters were all deployed after this block
const SPAN = 9_000_000n;
const lc = (x: string) => x.toLowerCase();

const scheduled = parseAbiItem("event CallScheduled(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data, bytes32 predecessor, uint256 delay)");
const executed = parseAbiItem("event CallExecuted(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data)");
const cancelled = parseAbiItem("event Cancelled(bytes32 indexed id)");
const registered = parseAbiItem("event Registered(bytes32 indexed poolId, address currency0, address currency1, address hooks)");
const unregistered = parseAbiItem("event Unregistered(bytes32 indexed poolId)");
const tlAbi = parseAbi(["function getTimestamp(bytes32 id) view returns (uint256)"]);
const symAbi = parseAbi(["function symbol() view returns (string)"]);
const adminAbi = parseAbi([
  "function propose(bool pool, address venue)",
  "function execute(bool pool, address venue)",
  "function cancel(bool pool, address venue)",
  "function addAdapter(address adapter)",
  "function removeAdapter(address adapter)",
  "function removePool(address pool)",
  "function setFallbackFeeBps(uint16 bps)",
  "function setGuardian(address g)",
  "function unpause()",
  "function transferOwnership(address newOwner)",
  "function acceptOwnership()",
  "function acceptFeeOwnership()",
  "function updateDelay(uint256 newDelay)",
]);

export type Call = { target: string; action: string };
export type Op = { id: Hex; calls: Call[]; readyAt: number | null; tx: Hex; done: boolean };
export type Reg = { tx: Hex; pair: string; block: bigint };
export type Activity = { pending: Op[]; recent: Op[]; registrations: Reg[]; totalRegistered: number; unregistered: number };

function nameOf(addr: string): string {
  const x = lc(addr);
  if (x === OLD_V4) return "Uniswap V4 adapter (first, removed)";
  if (a("uniswapV4AdapterV2") && x === lc(a("uniswapV4AdapterV2")!)) return "Uniswap V4 adapter (V2)";
  const venue = ROBINHOOD.venues[x];
  if (venue) return `${venue} adapter`;
  const known: [string, string][] = [
    ["router", "StoaRouter"], ["feeDistributor", "FeeDistributor"], ["stoaBuyback", "StoaBuyback"], ["limit", "Limit orders"],
    ["rugCover", "Rug Cover"], ["spotlightMarket", "Spotlight"], ["timelock", "Timelock"], ["safe", "Safe"], ["makerRegistry", "Maker registry"],
  ];
  for (const [k, n] of known) if (a(k) && lc(a(k)!) === x) return n;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function describe(target: string, data: Hex): Call {
  try {
    const d = decodeFunctionData({ abi: adminAbi, data });
    const arg = (v: unknown) => (typeof v === "string" && v.startsWith("0x") ? nameOf(v) : String(v));
    const verbs: Record<string, string> = {
      propose: "propose venue", execute: "add venue", cancel: "cancel venue", addAdapter: "add venue", removeAdapter: "remove venue",
      removePool: "remove pool", setFallbackFeeBps: "set fee (bps)", setGuardian: "set guardian", unpause: "unpause",
      transferOwnership: "hand ownership to", acceptOwnership: "accept ownership",
      acceptFeeOwnership: "take over FeeDistributor", updateDelay: "set timelock delay (s)",
    };
    const args = (d.args ?? []).filter((x) => typeof x !== "boolean");
    return { target: nameOf(target), action: `${verbs[d.functionName] ?? d.functionName}${args.length ? " " + args.map(arg).join(", ") : ""}` };
  } catch {
    return { target: nameOf(target), action: `call ${data.slice(0, 10)}` };
  }
}

export async function securityActivity(): Promise<Activity> {
  const c = createPublicClient({ chain: ROBINHOOD.chain, transport: http(srv(ROBINHOOD.logsRpc)) });
  const head = await c.getBlockNumber();
  const ranges: [bigint, bigint][] = [];
  for (let s = FROM; s <= head; s += SPAN) ranges.push([s, s + SPAN - 1n > head ? head : s + SPAN - 1n]);
  const logs = async <E extends typeof scheduled | typeof executed | typeof cancelled | typeof registered | typeof unregistered>(address: Address | undefined, event: E) =>
    address ? (await Promise.all(ranges.map(([fromBlock, toBlock]) => c.getLogs({ address, event, fromBlock, toBlock })))).flat() : [];

  const T = a("timelock");
  const [sch, exe, can, reg, unreg] = await Promise.all([
    logs(T, scheduled), logs(T, executed), logs(T, cancelled), logs(a("uniswapV4AdapterV2"), registered), logs(a("uniswapV4AdapterV2"), unregistered),
  ]);

  const ops = new Map<Hex, Op>();
  for (const l of sch) {
    const id = l.args.id as Hex;
    const op = ops.get(id) ?? { id, calls: [], readyAt: null, tx: l.transactionHash as Hex, done: false };
    op.calls.push(describe(l.args.target as string, l.args.data as Hex));
    ops.set(id, op);
  }
  const done = new Set(exe.map((l) => l.args.id as Hex));
  const gone = new Set(can.map((l) => l.args.id as Hex));
  const open = [...ops.values()].filter((o) => !done.has(o.id) && !gone.has(o.id));
  if (open.length && T) {
    const ts = await c.multicall({ allowFailure: true, contracts: open.map((o) => ({ address: T, abi: tlAbi, functionName: "getTimestamp" as const, args: [o.id] as const })) });
    open.forEach((o, i) => { const v = ts[i]?.result as bigint | undefined; o.readyAt = v && v > 1n ? Number(v) : null; });
  }
  open.sort((x, y) => (x.readyAt ?? 0) - (y.readyAt ?? 0));
  const exeTx = new Map(exe.map((l) => [l.args.id as Hex, l.transactionHash as Hex]));
  const recent = [...ops.values()].filter((o) => done.has(o.id)).map((o) => ({ ...o, done: true, tx: exeTx.get(o.id) ?? o.tx })).reverse().slice(0, 6);

  // latest pool keys registered on the V4 adapter, with token symbols
  const last = [...reg].sort((x, y) => Number(y.blockNumber - x.blockNumber)).slice(0, 6);
  const toks = [...new Set(last.flatMap((l) => [l.args.currency0 as Address, l.args.currency1 as Address]))];
  const syms = await c.multicall({ allowFailure: true, contracts: toks.map((t) => ({ address: t, abi: symAbi, functionName: "symbol" as const })) });
  const sym = (t: string) => (lc(t) === "0x0000000000000000000000000000000000000000" ? "ETH" : (syms[toks.indexOf(t as Address)]?.result as string | undefined) ?? `${t.slice(0, 6)}…`);
  const registrations = last.map((l) => ({ tx: l.transactionHash as Hex, block: l.blockNumber, pair: `${sym(l.args.currency0 as string)} / ${sym(l.args.currency1 as string)}` }));

  return { pending: open, recent, registrations, totalRegistered: reg.length, unregistered: unreg.length };
}
