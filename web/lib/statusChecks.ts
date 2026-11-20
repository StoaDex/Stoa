import "server-only";
import { createPublicClient, http, parseUnits, type Address } from "viem";
import { ELYSIUM, ROBINHOOD, type Net } from "./networks";
import { routerAbi } from "./abi";
import { NATIVE } from "./tokens";
import { securityStatus } from "./securityStatus";
import { stockTokens } from "./stocks";
import { srv } from "@/lib/serverRpc";

/** /status: the parts Stoa depends on, checked live when the page is built (once a minute). Each check has a time
 *  limit, so one slow service shows as slow instead of holding the page. */
export type Level = "ok" | "warn" | "down";
export type Check = { group: string; name: string; level: Level; detail: string; ms?: number };

const within = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), ms))]);
const timed = async <T,>(f: () => Promise<T>, ms = 8_000): Promise<{ v: T; ms: number }> => { const t = Date.now(); const v = await within(f(), ms); return { v, ms: Date.now() - t }; };
const ua = { fetchOptions: { headers: { "user-agent": "curl/8.5.0" } }, timeout: 8_000 };

async function router(net: Net, amount: bigint, outDecimals: number, minOut: number): Promise<Check> {
  const name = `Swaps on ${net.name}`;
  try {
    // the same endpoint the stats read: every network has one even where the public list is set by env
    const c = createPublicClient({ chain: net.chain, transport: http(srv(net.logsRpc ?? net.chain.rpcUrls.default.http[0]), ua) });
    const r = net.contracts.router as Address;
    const { v, ms } = await timed(async () => Promise.all([
      c.readContract({ address: r, abi: routerAbi, functionName: "paused" }),
      c.simulateContract({ address: r, abi: routerAbi, functionName: "quote", args: [NATIVE, net.stable, amount] }),
    ]));
    const [paused, q] = v;
    if (paused) return { group: "Swaps", name, level: "down", detail: "The router is paused by its guardian: no swaps for now. Funds are not held by the router.", ms };
    const out = Number(q.result.amountOut) / 10 ** outDecimals;
    return out >= minOut
      ? { group: "Swaps", name, level: ms > 4000 ? "warn" : "ok", detail: ms > 4000 ? `Quoting, but slowly (${(ms / 1000).toFixed(1)} s)` : "Router live and quoting", ms }
      : { group: "Swaps", name, level: "down", detail: "The router answers but finds no route for a test amount", ms };
  } catch {
    return { group: "Swaps", name, level: "down", detail: `${net.name}'s RPC did not answer in time` };
  }
}

async function dexscreener(): Promise<Check> {
  const name = "Token prices (DexScreener)";
  try {
    const { v, ms } = await timed(async () => {
      const r = await fetch(`https://api.dexscreener.com/tokens/v1/robinhood/${ROBINHOOD.wrapped}`, { next: { revalidate: 60 }, signal: AbortSignal.timeout(8_000) });
      return r.ok ? ((await r.json()) as { priceUsd?: string }[]) : [];
    });
    return v.some((p) => Number(p.priceUsd) > 0)
      ? { group: "Data", name, level: "ok", detail: "Prices and 24h changes are loading", ms }
      : { group: "Data", name, level: "warn", detail: "No prices right now: USD values may be missing. Quotes are not affected.", ms };
  } catch {
    return { group: "Data", name, level: "warn", detail: "Not answering: USD values may be missing. Quotes are not affected." };
  }
}

async function stocks(): Promise<Check> {
  const name = "Stock prices (Robinhood)";
  try {
    const { v, ms } = await timed(() => stockTokens(), 10_000);
    const priced = v.stocks.filter((s) => s.bid || s.ask).length;
    return priced > 0
      ? { group: "Data", name, level: "ok", detail: `${priced} stock tokens priced`, ms }
      : { group: "Data", name, level: "warn", detail: "No reference prices right now. Swaps still work.", ms };
  } catch {
    return { group: "Data", name, level: "warn", detail: "Robinhood's price feed is not answering. Swaps still work." };
  }
}

async function contracts(): Promise<Check[]> {
  try {
    const s = await within(securityStatus(), 12_000);
    const out: Check[] = [];
    const show: Record<string, string> = { "Limit orders (StoaLimitV2)": "Limit orders", "Rug Cover": "Rug Cover", Spotlight: "Spotlight" };
    for (const c of s.contracts) {
      const label = show[c.name];
      if (!label) continue;
      out.push(c.paused
        ? { group: "Features", name: label, level: "down", detail: "Paused by its guardian. Withdrawals and claims still work where the contract allows them." }
        : { group: "Features", name: label, level: "ok", detail: "Live, not paused" });
    }
    const k = s.keeperEth === null ? null : Number(s.keeperEth);
    out.push(k === null
      ? { group: "Automation", name: "Keeper gas", level: "warn", detail: "Could not read the keeper's balance" }
      : { group: "Automation", name: "Keeper gas", level: k < 0.001 ? "down" : k < 0.003 ? "warn" : "ok", detail: k < 0.001 ? "Too little ETH for limit orders, Rug Cover and the weekly jobs to run" : k < 0.003 ? "Running, top-up due soon" : "Enough ETH for limit orders, Rug Cover and the weekly jobs" });
    if (s.v4Guard) out.push({ group: "Automation", name: "Uniswap V4 pool guard", level: s.v4Guard.ok ? "ok" : "warn", detail: s.v4Guard.ok ? "No pool changed by anyone but the keeper" : `${s.v4Guard.poisoned} pair(s) skipped on the older adapter; swaps route around them` });
    return out;
  } catch {
    return [{ group: "Features", name: "Contract checks", level: "warn", detail: "Robinhood Chain did not answer in time; try again in a minute" }];
  }
}

export async function runChecks(): Promise<{ checks: Check[]; at: number }> {
  const [rh, el, ds, st, cs] = await Promise.all([
    router(ROBINHOOD, parseUnits("0.01", 18), 6, 1),
    router(ELYSIUM, parseUnits("1", 18), 6, 0.1),
    dexscreener(),
    stocks(),
    contracts(),
  ]);
  return { checks: [rh, el, ...cs, ds, st], at: Date.now() };
}
