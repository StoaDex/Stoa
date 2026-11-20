import "server-only";
import { createPublicClient, decodeErrorResult, decodeFunctionResult, encodeFunctionData, erc20Abi, getAddress, http, parseAbi, parseEther, type Address, type Hex } from "viem";
import type { Net } from "./networks";
import { routerAbi } from "./abi";
import { SAFETY_SIM_CODE } from "./safetySimCode";
import { srv } from "@/lib/serverRpc";

/** Token safety check: buy a small amount through the live router and sell it straight back, inside one eth_call with
 *  a throwaway simulator contract (contracts/src/tools/SafetySim.sol) placed by a state override, so nothing is ever
 *  sent. Plus who holds the supply: the Pons creator wallet and the largest holders (Blockscout, Robinhood Chain). */

export type Safety = {
  chain: Net["key"]; token: Address; symbol: string;
  test: { amountIn: string; gas: string; buyOk: boolean; sellOk: boolean; buyTaxPct: number | null; sellTaxPct: number | null; roundTripPct: number | null; why: string | null } | null;
  creatorPct: number | null;
  top10Pct: number | null;
  verdict: "ok" | "caution" | "danger" | "unknown";
  notes: string[];
  checkedAt: number;
};

const ua = { fetchOptions: { headers: { "user-agent": "curl/8.5.0" } }, timeout: 20_000 };
const SIM = "0x5afe5afe5afe5afe5afe5afe5afe5afe5afe5afe" as Address;
const FROM = "0x000000000000000000000000000000000000c0de" as Address;
const simAbi = parseAbi([
  "struct Result { uint256 buyQuoted; uint256 buyGot; uint256 sellQuoted; uint256 sellGot; bool buyOk; bool sellOk; bytes buyError; bytes sellError; }",
  "function check(address router, address token, uint256 amountIn) returns (Result r)",
]);
const factoryAbi = parseAbi(["function getLaunchedToken(address) view returns (address token, address curve, address creator)"]);
const PONS_FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e" as Address;
const lc = (a: string) => a.toLowerCase();
const NO_ROUTE = "Stoa has no route to this token right now";
const NOT_TESTED = "the test sell ran out of gas for the quote, so it says nothing about the token";
/** reverts that mean the simulation was short of gas or lost a route, not that the token refuses a sale: the V4
 *  adapter's LowGas (0x4a48966d), and the router's UnknownVenue (0x360f0e2b) when the sell quote lost its V4 leg
 *  (HEY Research Lab, UniswapV4AdapterV3 follow-up, F-5) */
const UNTESTED = new Set(["0x4a48966d", "0x360f0e2b"]);
const pct = (part: bigint, whole: bigint) => (whole > 0n ? Number((part * 1_000_000n) / whole) / 10_000 : 0);

/** what a revert from the router or the token means, in plain words */
function why(data: Hex): string {
  if (!data || data === "0x") return "the token reverted without a reason";
  try {
    const e = decodeErrorResult({ abi: routerAbi, data });
    if (e.errorName === "BadToken") return "the token takes a fee on every transfer, which Stoa's router refuses to sell";
    if (e.errorName === "Slippage") return "the sale returned nothing";
    return `the router refused it (${e.errorName})`;
  } catch { /* not a router error */ }
  try {
    const e = decodeErrorResult({ abi: parseAbi(["error Error(string)"]), data });
    return `the token reverted: "${String(e.args[0]).slice(0, 80)}"`;
  } catch { return "the token reverted"; }
}

async function simulate(net: Net, token: Address): Promise<Safety["test"]> {
  if (!net.contracts.router) return null;
  const c = createPublicClient({ chain: net.chain, transport: http(srv(net.logsRpc), ua) });
  const amountIn = net.gas === "ETH" ? parseEther("0.001") : parseEther("0.05");
  const res = await c.call({
    account: FROM, to: SIM,
    data: encodeFunctionData({ abi: simAbi, functionName: "check", args: [net.contracts.router, token, amountIn] }),
    stateOverride: [{ address: SIM, code: SAFETY_SIM_CODE, balance: parseEther("10") }],
    // four simulations of up to six V4 pools each (quote and swap, buy and sell), at up to 2M gas each, plus the swaps
    gas: 60_000_000n,
  });
  const r = decodeFunctionResult({ abi: simAbi, functionName: "check", data: res.data! });
  if (r.buyQuoted === 0n) return { amountIn: amountIn.toString(), gas: net.gas, buyOk: false, sellOk: false, buyTaxPct: null, sellTaxPct: null, roundTripPct: null, why: NO_ROUTE };
  const buyTax = r.buyOk && r.buyQuoted > 0n ? Math.max(0, (1 - Number(r.buyGot) / Number(r.buyQuoted)) * 100) : null;
  const sellTax = r.sellOk && r.sellQuoted > 0n ? Math.max(0, (1 - Number(r.sellGot) / Number(r.sellQuoted)) * 100) : null;
  return {
    amountIn: amountIn.toString(), gas: net.gas, buyOk: r.buyOk, sellOk: r.sellOk,
    buyTaxPct: buyTax === null ? null : Number(buyTax.toFixed(2)), sellTaxPct: sellTax === null ? null : Number(sellTax.toFixed(2)),
    roundTripPct: r.sellOk ? Number(((Number(r.sellGot) / Number(amountIn)) * 100 - 100).toFixed(2)) : null,
    why: !r.buyOk ? why(r.buyError) : !r.sellOk ? (UNTESTED.has(r.sellError.slice(0, 10)) ? NOT_TESTED : why(r.sellError)) : null,
  };
}

/** largest holders that are wallets, not contracts (pools, curves) or the burn address — Robinhood Chain's Blockscout */
async function top10(net: Net, token: Address, supply: bigint): Promise<number | null> {
  if (net.key !== "robinhood" || supply === 0n) return null;
  try {
    const r = await fetch(`https://robinhoodchain.blockscout.com/api/v2/tokens/${token}/holders`, { signal: AbortSignal.timeout(8_000), headers: { accept: "application/json" } });
    if (!r.ok) return null;
    const j = (await r.json()) as { items?: { address?: { hash?: string; is_contract?: boolean }; value?: string }[] };
    const burn = new Set(["0x000000000000000000000000000000000000dead", "0x0000000000000000000000000000000000000000"]);
    const wallets = (j.items ?? []).filter((h) => h.address?.hash && !h.address.is_contract && !burn.has(lc(h.address.hash))).slice(0, 10);
    if (!wallets.length) return null;
    return pct(wallets.reduce((a, h) => a + BigInt(h.value ?? "0"), 0n), supply);
  } catch { return null; }
}

export async function readSafety(net: Net, token: Address): Promise<Safety> {
  const c = createPublicClient({ chain: net.chain, transport: http(srv(net.logsRpc), ua) });
  const t = getAddress(token);
  const [sym, supply] = await Promise.all([
    c.readContract({ address: t, abi: erc20Abi, functionName: "symbol" }).catch(() => "TOKEN"),
    c.readContract({ address: t, abi: erc20Abi, functionName: "totalSupply" }).catch(() => 0n),
  ]);
  const creator = net.key === "robinhood"
    ? c.readContract({ address: PONS_FACTORY, abi: factoryAbi, functionName: "getLaunchedToken", args: [t] })
        .then(async (rec) => (lc(rec[0]) === lc(t) ? pct(await c.readContract({ address: t, abi: erc20Abi, functionName: "balanceOf", args: [rec[2]] }), supply) : null))
        .catch(() => null)
    : Promise.resolve(null);
  const [test, creatorPct, holders] = await Promise.all([simulate(net, t).catch(() => null), creator, top10(net, t, supply)]);

  const notes: string[] = [];
  let verdict: Safety["verdict"] = test ? "ok" : "unknown";
  const bad = (v: Safety["verdict"]) => { if (v === "danger" || (v === "caution" && verdict !== "danger")) verdict = v; };
  if (test && test.why === NO_ROUTE) { verdict = "unknown"; notes.push(`${NO_ROUTE}, so it could not be test-traded.`); }
  else if (test && !test.buyOk) { bad("caution"); notes.push(`A test buy through Stoa failed: ${test.why}.`); }
  else if (test && !test.sellOk && test.why === NOT_TESTED) { verdict = "unknown"; notes.push(`A test buy worked, but ${NOT_TESTED}.`); }
  else if (test && !test.sellOk) { bad("danger"); notes.push(`A test sell failed right after a test buy: ${test.why}. You may not be able to sell this token through Stoa.`); }
  for (const [label, v] of [["buy", test?.buyTaxPct], ["sell", test?.sellTaxPct]] as const) {
    if (v !== null && v !== undefined && v >= 10) { bad("danger"); notes.push(`The ${label} pays ${v.toFixed(1)}% less than its quote: a hidden tax.`); }
    else if (v !== null && v !== undefined && v >= 1) { bad("caution"); notes.push(`The ${label} pays ${v.toFixed(1)}% less than its quote: a tax on transfers.`); }
  }
  if (creatorPct !== null && creatorPct >= 10) { bad("caution"); notes.push(`The creator's wallet holds ${creatorPct.toFixed(1)}% of supply.`); }
  if (holders !== null && holders >= 50) { bad("caution"); notes.push(`The ten largest wallets hold ${holders.toFixed(1)}% of supply.`); }
  return { chain: net.key, token: t, symbol: String(sym).replace(/[^\w.$-]/g, "").slice(0, 12) || "TOKEN", test, creatorPct, top10Pct: holders, verdict, notes, checkedAt: Math.floor(Date.now() / 1000) };
}
