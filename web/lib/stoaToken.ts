"use client";
import { useQuery } from "@tanstack/react-query";
import { createPublicClient, erc20Abi, getAddress, http, pad, type Address } from "viem";
import { ROBINHOOD, type Net } from "./networks";
import type { Token } from "./tokens";
import { CA } from "./stoaAddress";
import { srv } from "@/lib/serverRpc";

/** $STOA lives on Robinhood Chain, launched on Pons. It is found on-chain, not typed in: the web looks for a token
 *  the dev wallet created through Pons' V2 launch factory, so it appears seconds after the launch transaction lands,
 *  and a copycat from any other wallet never can. Pons records the creator (the wallet that sent the launch, with or
 *  without a dev buy) as the third indexed topic. NEXT_PUBLIC_STOA_CA, once set, skips the lookup. */
export const STOA_DEV = (process.env.NEXT_PUBLIC_STOA_DEV || "0x8DAc20C0FE1C59D337808f234921a89Ee0C1346a") as Address;
/** pinned after launch (lib/stoaAddress.ts); the log lookup below stays as a fallback for other builds */
export { CA };
const PONS_FACTORY = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e" as Address;
/** TokenLaunched: topic1 = token, topic2 = bonding curve, topic3 = creator */
const LAUNCH_TOPIC = "0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607" as const;
/** Robinhood Chain block when the watcher went live; the dev wallet had sent no transaction yet (nonce 0) */
const FROM_BLOCK = 114_270_000n;
const SPAN = 9_000_000n; // the public RPC caps a log query at 10M blocks
const POLL_MS = 3_000;
const TICKER = (process.env.NEXT_PUBLIC_STOA_TICKER || "STOA").toUpperCase();

async function logsFrom(client: ReturnType<typeof createPublicClient>): Promise<Address[]> {
  const q = (fromBlock: bigint, toBlock: bigint | "latest") => client.request({
    method: "eth_getLogs",
    params: [{ address: PONS_FACTORY, fromBlock: `0x${fromBlock.toString(16)}`, toBlock: toBlock === "latest" ? "latest" : `0x${toBlock.toString(16)}`, topics: [LAUNCH_TOPIC, null, null, pad(STOA_DEV)] }],
  }) as Promise<{ topics: `0x${string}`[] }[]>;
  let logs: { topics: `0x${string}`[] }[];
  try {
    logs = await q(FROM_BLOCK, "latest"); // one request while the range fits the RPC's 10M-block cap
  } catch {
    logs = [];
    const head = await client.getBlockNumber();
    for (let a = FROM_BLOCK; a <= head; a += SPAN) logs.push(...(await q(a, a + SPAN - 1n < head ? a + SPAN - 1n : head)));
  }
  return logs.map((l) => getAddress(`0x${l.topics[1].slice(26)}`));
}

async function find(): Promise<Token | null> {
  const seen = cached();
  if (seen && (!CA || seen.address.toLowerCase() === CA.toLowerCase())) return seen;
  const client = createPublicClient({ chain: ROBINHOOD.chain, transport: http(srv(ROBINHOOD.logsRpc), { batch: true }) });
  const created = CA ? [CA] : await logsFrom(client);
  if (!created.length) return null;
  // symbol and decimals for every candidate in one batched request; only the ticker STOA counts
  const meta = await Promise.all(created.map((a) => Promise.all([
    client.readContract({ address: a, abi: erc20Abi, functionName: "symbol" }).catch(() => ""),
    client.readContract({ address: a, abi: erc20Abi, functionName: "decimals" }).catch(() => 18),
  ])));
  const i = meta.findIndex(([s]) => s.toUpperCase().replace("$", "") === TICKER);
  if (i < 0) return null;
  const [symbol, decimals] = meta[i];
  const t: Token = { symbol, name: "Official Stoa token", address: created[i], decimals, glyph: symbol[0] ?? "S", tone: "bridged", logo: "/logo.png" };
  try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* storage blocked */ }
  return t;
}

/** A launch seen before on this device shows at once, before the chain is asked again. */
const KEY = `stoa.token.${STOA_DEV.toLowerCase()}`;
function cached(): Token | undefined {
  try { const v = localStorage.getItem(KEY); return v ? (JSON.parse(v) as Token) : undefined; } catch { return undefined; }
}

/** The launched token, known at build time: shown in the first HTML, with no request at all. */
const PINNED: Token | null = CA
  ? { symbol: "STOA", name: "Official Stoa token", address: CA, decimals: 18, glyph: "S", tone: "bridged", logo: "/logo.png" }
  : null;

/** Checks every 3 s until the launch is seen, then stays put. Pass a network to get null outside Robinhood Chain. */
export function useStoaToken(net?: Net) {
  const q = useQuery({
    enabled: !PINNED,
    queryKey: ["stoa-token"],
    queryFn: find,
    refetchInterval: (query) => (query.state.data ? false : POLL_MS),
    refetchIntervalInBackground: true,
    staleTime: (query) => (query.state.data ? Infinity : 2_000),
    retry: 2,
  });
  if (net && net.key !== "robinhood") return null;
  return PINNED ?? q.data ?? null;
}
