import "server-only";
import { createPublicClient, http, parseAbiItem, type Address } from "viem";
import { ROBINHOOD } from "./networks";
import { CA } from "./stoaAddress";
import { BURN, STOA_CURVE } from "./stoaSupply";
import { srv } from "./serverRpc";

/** $STOA over time, rebuilt from every Transfer of the token since it was minted (block 114,276,768): per UTC day, the
 *  number of addresses holding any, $STOA burned (held by 0x…dEaD), $STOA locked in Stoa's contracts (Spotlight,
 *  Rug Cover, maker bonds) and $STOA still on the launch curve. Blocks are dated from timestamps sampled every
 *  ~200k blocks (Robinhood Chain logs carry no time), so a day boundary can be off by minutes. */
const FIRST = 114_200_000n;
const WINDOW = 1_000_000n; // the public RPC refuses larger log queries for a busy token
const ev = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const ZERO = "0x0000000000000000000000000000000000000000";

export type StoaDay = { date: string; holders: number; burned: number; locked: number; curve: number };
export type StoaHistory = { days: StoaDay[]; holders: number; transfers: number; updated: number };

export async function readStoaHistory(): Promise<StoaHistory> {
  const net = ROBINHOOD;
  const c = createPublicClient({ chain: net.chain, transport: http(srv(net.logsRpc ?? net.chain.rpcUrls.default.http[0]), { timeout: 20_000 }) });
  const head = await c.getBlockNumber();
  const ranges: [bigint, bigint][] = [];
  for (let f = FIRST; f <= head; f += WINDOW) ranges.push([f, f + WINDOW - 1n > head ? head : f + WINDOW - 1n]);
  const chunks = await Promise.all(ranges.map(([fromBlock, toBlock]) => c.getLogs({ address: CA, event: ev, fromBlock, toBlock })));
  const logs = chunks.flat().sort((a, b) => (a.blockNumber === b.blockNumber ? (a.logIndex ?? 0) - (b.logIndex ?? 0) : Number(a.blockNumber! - b.blockNumber!)));

  // block -> time, by sampling and interpolating
  const step = 200_000n;
  const samples: bigint[] = [];
  for (let b = FIRST; b < head; b += step) samples.push(b);
  samples.push(head);
  const times = await Promise.all(samples.map((b) => c.getBlock({ blockNumber: b }).then((x) => Number(x.timestamp))));
  const timeOf = (b: bigint) => {
    let i = samples.findIndex((s) => s > b);
    if (i <= 0) i = i === 0 ? 1 : samples.length - 1;
    const b0 = Number(samples[i - 1]), b1 = Number(samples[i]), t0 = times[i - 1], t1 = times[i];
    return t0 + ((Number(b) - b0) / (b1 - b0 || 1)) * (t1 - t0);
  };

  const C = net.contracts;
  const lockers = new Set([C.spotlight, C.cover, C.bonds].filter(Boolean).map((a) => (a as Address).toLowerCase()));
  const burn = BURN.toLowerCase(), curve = STOA_CURVE.toLowerCase();
  const bal = new Map<string, bigint>();
  let holders = 0;
  const add = (a: string, v: bigint) => {
    if (a === ZERO) return;
    const before = bal.get(a) ?? 0n, after = before + v;
    bal.set(a, after);
    if (a === burn || a === curve) return;
    if (before === 0n && after > 0n) holders++;
    else if (before > 0n && after === 0n) holders--;
  };
  const lockedNow = () => { let s = 0n; for (const l of lockers) s += bal.get(l) ?? 0n; return s; };
  const days: StoaDay[] = [];
  const snap = (date: string) => days.push({ date, holders, burned: Number(bal.get(burn) ?? 0n) / 1e18, locked: Number(lockedNow()) / 1e18, curve: Number(bal.get(curve) ?? 0n) / 1e18 });
  let cur = "";
  for (const l of logs) {
    const d = new Date(timeOf(l.blockNumber!) * 1000).toISOString().slice(0, 10);
    if (cur && d !== cur) snap(cur);
    cur = d;
    const { from, to, value } = l.args as { from: Address; to: Address; value: bigint };
    add(from.toLowerCase(), -value);
    add(to.toLowerCase(), value);
  }
  if (cur) snap(cur);
  // carry the last day through today
  const today = new Date().toISOString().slice(0, 10);
  if (days.length && days[days.length - 1].date !== today) {
    const last = days[days.length - 1];
    for (let t = Date.parse(last.date) + 86400_000; t <= Date.parse(today); t += 86400_000) days.push({ ...last, date: new Date(t).toISOString().slice(0, 10) });
  }
  return { days, holders, transfers: logs.length, updated: Math.floor(Date.now() / 1000) };
}
