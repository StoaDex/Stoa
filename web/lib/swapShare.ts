import "server-only";
import { cache } from "react";
import { createPublicClient, decodeEventLog, erc20Abi, formatUnits, http, type Address, type Hash } from "viem";
import { netByKey, type Net } from "./networks";
import { routedEvent } from "./abi";
import { NATIVE } from "./tokens";
import { srv } from "@/lib/serverRpc";

/** One swap through a Stoa router, read from its transaction's Routed event. Backs the shareable /swap/<chain>/<hash>
 *  page and its link card. A transaction never changes once mined, so callers can cache the result for a long time. */
export interface SharedSwap {
  net: Net["key"]; netName: string; hash: Hash; time: number; explorerTx: string;
  tokenIn: Address; tokenOut: Address; symIn: string; symOut: string;
  amountIn: string; amountOut: string; venues: string[];
}

const ua = { fetchOptions: { headers: { "user-agent": "curl/8.5.0" } }, timeout: 15_000 };
const lc = (a: string) => a.toLowerCase();

/** Short human amount: 2 decimals from 1,000 up, 4 from 1 up, 6 below. */
function amt(raw: bigint, decimals: number): string {
  const v = Number(formatUnits(raw, decimals));
  const d = v >= 1000 ? 2 : v >= 1 ? 4 : 6;
  return v.toLocaleString("en-US", { maximumFractionDigits: d });
}

async function read(chain: string, hash: string): Promise<SharedSwap | null> {
  const net = netByKey(chain);
  if (!net?.contracts.router || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return null;
  const c = createPublicClient({ chain: net.chain, transport: http(srv(net.logsRpc), ua) });
  let receipt;
  try { receipt = await c.getTransactionReceipt({ hash: hash as Hash }); } catch { return null; /* unknown or pending */ }
  if (receipt.status !== "success") return null;
  const log = receipt.logs.find((l) => lc(l.address) === lc(net.contracts.router!));
  if (!log) return null;
  let ev;
  try { ev = decodeEventLog({ abi: [routedEvent], data: log.data, topics: log.topics }); } catch { return null; }
  const a = ev.args;

  const meta = async (t: Address) => {
    if (lc(t) === lc(NATIVE)) return { symbol: net.gas, decimals: 18 };
    const k = net.tokens.find((x) => lc(x.address) === lc(t));
    if (k) return { symbol: k.symbol, decimals: k.decimals };
    const [s, d] = await Promise.allSettled([
      c.readContract({ address: t, abi: erc20Abi, functionName: "symbol" }),
      c.readContract({ address: t, abi: erc20Abi, functionName: "decimals" }),
    ]);
    return {
      symbol: (s.status === "fulfilled" ? String(s.value) : "TOKEN").replace(/[^\w.$-]/g, "").slice(0, 12) || "TOKEN",
      decimals: d.status === "fulfilled" ? Number(d.value) : 18,
    };
  };
  const [mi, mo, block] = await Promise.all([meta(a.tokenIn), meta(a.tokenOut), c.getBlock({ blockNumber: receipt.blockNumber })]);
  const venueName = (v: Address) => {
    if (lc(v) === lc(NATIVE)) return null;
    if (net.contracts.pool && lc(v) === lc(net.contracts.pool)) return "Stoa maker pool";
    return net.venues[lc(v)] ?? null;
  };
  const venues = [...new Set([venueName(a.venue1), venueName(a.venue2)].filter((v): v is string => !!v))];

  return {
    net: net.key, netName: net.name, hash: hash as Hash, time: Number(block.timestamp), explorerTx: `${net.explorer}/tx/${hash}`,
    tokenIn: a.tokenIn, tokenOut: a.tokenOut, symIn: mi.symbol, symOut: mo.symbol,
    amountIn: amt(a.amountIn, mi.decimals), amountOut: amt(a.amountOut, mo.decimals), venues,
  };
}

/** once per request: metadata, page and link card share the read */
export const readSwap = cache(read);
