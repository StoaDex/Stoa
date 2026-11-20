"use client";
import { useCallback } from "react";
import { useConfig, useSwitchChain, useWriteContract } from "wagmi";
import { getAccount } from "wagmi/actions";

/** `useWriteContract`, except that a call with `chainId` first moves the wallet to that network when it is on another
 *  one (wagmi would otherwise fail with a chain mismatch, e.g. a wallet still on Elysium signing on Robinhood Chain).
 *  Reads the wallet's network at call time, so two writes in a row (approve, then lock) switch at most once. */
export function useChainWrite() {
  const w = useWriteContract();
  const config = useConfig();
  const { switchChainAsync } = useSwitchChain();
  const writeContractAsync = useCallback(
    async (args: Parameters<typeof w.writeContractAsync>[0]) => {
      const want = (args as { chainId?: number }).chainId;
      if (want !== undefined && getAccount(config).chainId !== want) await switchChainAsync({ chainId: want });
      return w.writeContractAsync(args);
    },
    [w, config, switchChainAsync],
  ) as typeof w.writeContractAsync;
  return { ...w, writeContractAsync };
}
