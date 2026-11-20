import "server-only";
import { createPublicClient, erc20Abi, getAddress, http, parseAbi, type Address } from "viem";
import type { Net } from "./networks";
import { routedEvent } from "./abi";
import { NATIVE } from "./tokens";
import { srv } from "@/lib/serverRpc";

/** Profit and loss for one wallet on one network, from its swaps through Stoa (the router's Routed events paid to it).
 *  Kept in the gas token (ETH or HYPE), since most trades are against it: swaps against a stablecoin count at today's
 *  gas-token price. Average cost per token; realized on sells; unrealized on what is still held, valued with the
 *  router's own quote for selling it now. Tokens bought elsewhere are not counted. */

export type PnlRow = {
  token: Address; symbol: string; decimals: number;
  bought: string; sold: string; held: string;
  /** gas-token amounts, as decimal strings */
  cost: string; proceeds: string; value: string | null;
  realized: number; unrealized: number | null; pnlPct: number | null;
  swaps: number;
};
export type Pnl = { chain: Net["key"]; gas: string; gasUsd: number | null; rows: PnlRow[]; realized: number; unrealized: number; checkedAt: number };

const ua = { fetchOptions: { headers: { "user-agent": "curl/8.5.0" } }, timeout: 20_000 };
const quoteAbi = parseAbi(["function quote(address,address,uint256) returns ((uint256 amountOut, address mid, (address venue, bool isPool) leg1, (address venue, bool isPool) leg2))"]);
const lc = (a: string) => a.toLowerCase();
const toNum = (v: bigint, d: number) => Number(v) / 10 ** d;

export async function readPnl(net: Net, wallet: string): Promise<Pnl> {
  const who = getAddress(wallet);
  const router = net.contracts.router!;
  const c = createPublicClient({ chain: net.chain, transport: http(srv(net.logsRpc), { ...ua, batch: { batchSize: 50 } }) });
  const head = await c.getBlockNumber();
  const span = net.logsSpan === 0n ? head : net.logsSpan;
  const logs: { tIn: string; tOut: string; aIn: bigint; aOut: bigint }[] = [];
  for (let a = net.deployBlock; a <= head; a += span) {
    const z = a + span - 1n < head ? a + span - 1n : head;
    for (const l of await c.getLogs({ address: router, event: routedEvent, args: { to: who }, fromBlock: a, toBlock: z })) {
      logs.push({ tIn: lc(l.args.tokenIn!), tOut: lc(l.args.tokenOut!), aIn: l.args.amountIn!, aOut: l.args.amountOut! });
    }
  }
  const gasSide = new Set([lc(NATIVE), lc(net.wrapped)]), stables = new Set(net.stables.map(lc));
  const stableDec = new Map(net.tokens.filter((t) => stables.has(lc(t.address))).map((t) => [lc(t.address), t.decimals]));

  // today's gas-token price in the network's main stablecoin, from the router
  let gasUsd: number | null = null;
  try {
    const amt = net.gas === "ETH" ? 10n ** 16n : 10n ** 17n;
    const q = await c.simulateContract({ address: router, abi: quoteAbi, functionName: "quote", args: [NATIVE, net.stable, amt] });
    gasUsd = toNum(q.result.amountOut, stableDec.get(lc(net.stable)) ?? 6) / toNum(amt, 18);
  } catch { /* stable-side swaps then cannot be converted */ }
  const inGas = (token: string, amount: bigint): number | null => {
    if (gasSide.has(token)) return toNum(amount, 18);
    if (stables.has(token)) return gasUsd ? toNum(amount, stableDec.get(token) ?? 6) / gasUsd : null;
    return null;
  };

  type Acc = { bought: bigint; sold: bigint; cost: number; proceeds: number; swaps: number };
  const acc = new Map<string, Acc>();
  const get = (t: string) => acc.get(t) ?? (acc.set(t, { bought: 0n, sold: 0n, cost: 0, proceeds: 0, swaps: 0 }), acc.get(t)!);
  for (const l of logs) {
    const plainIn = gasSide.has(l.tIn) || stables.has(l.tIn), plainOut = gasSide.has(l.tOut) || stables.has(l.tOut);
    if (plainIn && !plainOut) { // a buy
      const v = inGas(l.tIn, l.aIn); if (v === null) continue;
      const a = get(l.tOut); a.bought += l.aOut; a.cost += v; a.swaps++;
    } else if (!plainIn && plainOut) { // a sell
      const v = inGas(l.tOut, l.aOut); if (v === null) continue;
      const a = get(l.tIn); a.sold += l.aIn; a.proceeds += v; a.swaps++;
    } // token-to-token swaps carry no gas-token price and are left out
  }

  // a token only sold through Stoa (bought elsewhere) has no cost here to measure against
  const tokens = [...acc.keys()].filter((t) => acc.get(t)!.bought > 0n) as Address[];
  const meta = await Promise.all(tokens.map(async (t) => {
    const [s, d, b] = await Promise.allSettled([
      c.readContract({ address: t, abi: erc20Abi, functionName: "symbol" }),
      c.readContract({ address: t, abi: erc20Abi, functionName: "decimals" }),
      c.readContract({ address: t, abi: erc20Abi, functionName: "balanceOf", args: [who] }),
    ]);
    return {
      symbol: (s.status === "fulfilled" ? String(s.value) : "TOKEN").replace(/[^\w.$-]/g, "").slice(0, 12) || "TOKEN",
      decimals: d.status === "fulfilled" ? Number(d.value) : 18,
      balance: b.status === "fulfilled" ? b.value : 0n,
    };
  }));

  const rows: PnlRow[] = await Promise.all(tokens.map(async (t, i) => {
    const a = acc.get(t)!, m = meta[i];
    const avg = a.bought > 0n ? a.cost / toNum(a.bought, m.decimals) : 0; // gas per token
    const soldCounted = a.sold < a.bought ? a.sold : a.bought;
    const realized = a.bought > 0n ? a.proceeds * (Number(soldCounted) / Number(a.sold || 1n)) - avg * toNum(soldCounted, m.decimals) : 0;
    const left = a.bought > a.sold ? a.bought - a.sold : 0n;
    const held = m.balance < left ? m.balance : left;
    let value: number | null = held === 0n ? 0 : null;
    if (held > 0n) {
      try {
        const q = await c.simulateContract({ address: router, abi: quoteAbi, functionName: "quote", args: [t, NATIVE, held] });
        value = toNum(q.result.amountOut, 18);
      } catch { value = null; }
    }
    const unrealized = value === null ? null : value - avg * toNum(held, m.decimals);
    const basis = avg * toNum(soldCounted + held, m.decimals);
    const pnlPct = unrealized === null || basis === 0 ? null : ((realized + unrealized) / basis) * 100;
    return {
      token: getAddress(t), symbol: m.symbol, decimals: m.decimals,
      bought: a.bought.toString(), sold: a.sold.toString(), held: held.toString(),
      cost: a.cost.toString(), proceeds: a.proceeds.toString(), value: value === null ? null : value.toString(),
      realized, unrealized, pnlPct, swaps: a.swaps,
    };
  }));
  rows.sort((x, y) => Number(y.cost) - Number(x.cost));
  return {
    chain: net.key, gas: net.gas, gasUsd, rows,
    realized: rows.reduce((s, r) => s + r.realized, 0), unrealized: rows.reduce((s, r) => s + (r.unrealized ?? 0), 0),
    checkedAt: Math.floor(Date.now() / 1000),
  };
}
