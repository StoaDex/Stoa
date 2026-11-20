"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { erc20Abi, type Address, type PublicClient } from "viem";
import { ROBINHOOD } from "@/lib/networks";
import { routerAbi } from "@/lib/abi";
import { SPOT, SPOTLIGHT_HIDDEN, epochAt, spotlightAbi, type SpotCandidate, type SpotParams } from "@/lib/spotlight";
import type { Token } from "@/lib/tokens";

const net = ROBINHOOD;

/** unix seconds, refreshed every `ms`. 0 until the page has mounted, so the server render and the first client render
 *  agree (no hydration mismatch on countdowns); callers show placeholders while it is 0. */
export function useNow(ms = 15_000) {
  const [t, setT] = useState(0);
  useEffect(() => {
    setT(Math.floor(Date.now() / 1000));
    const id = setInterval(() => setT(Math.floor(Date.now() / 1000)), ms);
    return () => clearInterval(id);
  }, [ms]);
  return t;
}

/** is the Spotlight contract on chain yet (it has a known CREATE2 address before the deploy) */
export function useSpotLive() {
  const pub = usePublicClient({ chainId: net.chain.id });
  return useQuery({
    queryKey: ["spot-live", SPOT],
    enabled: !!pub && !!SPOT,
    refetchInterval: (q) => (q.state.data ? false : 60_000),
    queryFn: async () => {
      const code = await pub!.getCode({ address: SPOT! });
      return !!code && code !== "0x";
    },
  }).data === true;
}

export type SpotTokenMeta = { symbol: string; decimals: number; logo?: string };

/** symbol, decimals and the app's logo for a list of tokens (failed reads fall back to a short address) */
export async function tokenMeta(pub: PublicClient, tokens: Address[]): Promise<Record<string, SpotTokenMeta>> {
  if (!tokens.length) return {};
  const r = await pub.multicall({
    contracts: tokens.flatMap((t) => [
      { address: t, abi: erc20Abi, functionName: "symbol" },
      { address: t, abi: erc20Abi, functionName: "decimals" },
    ]),
    allowFailure: true,
  });
  const out: Record<string, SpotTokenMeta> = {};
  tokens.forEach((t, i) => {
    const known = net.tokens.find((x) => x.address.toLowerCase() === t.toLowerCase());
    const sym = r[2 * i]?.status === "success" ? String(r[2 * i].result) : `${t.slice(0, 6)}…${t.slice(-4)}`;
    const dec = r[2 * i + 1]?.status === "success" ? Number(r[2 * i + 1].result) : 18;
    out[t.toLowerCase()] = { symbol: known?.symbol ?? sym.slice(0, 16), decimals: known?.decimals ?? dec, logo: known?.logo };
  });
  return out;
}

export type SpotEpoch = { epoch: number; params: SpotParams; opened: boolean; finalized: boolean; candidates: SpotCandidate[]; winners: Address[] };

/** one week: its rules, every candidate and its winners */
export async function readEpoch(pub: PublicClient, epoch: number): Promise<SpotEpoch> {
  const [p, opened, finalized, list, winners] = (await pub.readContract({ address: SPOT!, abi: spotlightAbi, functionName: "epochInfo", args: [BigInt(epoch)] })) as readonly [
    { slots: number; cutBps: number; entryFee: bigint; minBid: bigint; maxBid: bigint; quorum: bigint }, boolean, boolean, readonly Address[], readonly Address[],
  ];
  const rows = list.length
    ? await pub.multicall({ contracts: list.map((t) => ({ address: SPOT!, abi: spotlightAbi, functionName: "candidates", args: [BigInt(epoch), t] })), allowFailure: false })
    : [];
  const candidates = list.map((t, i) => {
    const [pot, votes, payout, index, , canceled, won] = rows[i] as unknown as readonly [bigint, bigint, bigint, number, boolean, boolean, boolean];
    return { token: t, pot, votes, payout, index, canceled, won };
  });
  return { epoch, params: { ...p, slots: Number(p.slots), cutBps: Number(p.cutBps) }, opened, finalized, candidates, winners: [...winners] };
}

/** can the token be bought AND sold on Stoa right now (a honeypot or a dead pool fails) */
export async function sellable(pub: PublicClient, token: Address, decimals: number): Promise<boolean> {
  try {
    const { result: buy } = await pub.simulateContract({ address: net.contracts.router!, abi: routerAbi, functionName: "quote", args: [net.wrapped, token, 10n ** 15n] });
    if (buy.amountOut === 0n) return false;
    const back = buy.amountOut / 2n || 10n ** BigInt(Math.max(0, decimals - 2));
    const { result: sell } = await pub.simulateContract({ address: net.contracts.router!, abi: routerAbi, functionName: "quote", args: [token, net.wrapped, back] });
    return sell.amountOut > 0n;
  } catch {
    return false;
  }
}

/** this week's Spotlight: last week's winners, settled, not hidden, and still tradable both ways on Stoa */
export function useSpotlightWinners() {
  const pub = usePublicClient({ chainId: net.chain.id });
  const live = useSpotLive();
  const now = useNow(60_000);
  const e = epochAt(now);
  return useQuery({
    queryKey: ["spot-winners", e],
    enabled: !!pub && live && e >= 1,
    refetchInterval: 120_000,
    queryFn: async (): Promise<Token[]> => {
      const ep = await readEpoch(pub!, e - 1);
      if (!ep.finalized) return [];
      const ws = ep.winners.filter((w) => !SPOTLIGHT_HIDDEN.includes(w.toLowerCase()));
      const meta = await tokenMeta(pub!, ws);
      const ok = await Promise.all(ws.map((w) => sellable(pub!, w, meta[w.toLowerCase()].decimals)));
      return ws
        .filter((_, i) => ok[i])
        .map((w) => {
          const m = meta[w.toLowerCase()];
          return { symbol: m.symbol, name: "Spotlight · sponsored", address: w, decimals: m.decimals, glyph: m.symbol[0] ?? "?", tone: "other" as const, logo: m.logo };
        });
    },
  }).data ?? [];
}
