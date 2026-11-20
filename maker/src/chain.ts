import { createPublicClient, createWalletClient, defineChain, http, parseAbi, webSocket, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Config } from "./config.js";

export const poolAbi = parseAbi([
  "function base() view returns (address)",
  "function quote() view returns (address)",
  "function registry() view returns (address)",
  "function maxValidBlocks() view returns (uint8)",
  "function current() view returns (uint128 bidPx, uint128 askPx, uint96 bidSize, uint96 askSize, uint64 expiry)",
  "function setQuote(uint128 bidPx, uint128 askPx, uint96 bidSize, uint96 askSize, uint8 validBlocks)",
  "function cancelQuote()",
]);
export const registryAbi = parseAbi(["function isActiveMaker(address pool, address maker) view returns (bool)"]);
export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

export function makeClients(c: Config) {
  const chain = defineChain({
    id: c.chainId,
    name: c.chainId === 99901 ? "Elysium" : `chain-${c.chainId}`,
    nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
    rpcUrls: { default: { http: [c.rpcUrl], webSocket: c.wsUrl ? [c.wsUrl] : undefined } },
  });
  const transport = c.wsUrl ? webSocket(c.wsUrl) : http(c.rpcUrl, { batch: true });
  const account = privateKeyToAccount(c.privateKey as Hex);
  const pub = createPublicClient({ chain, transport, pollingInterval: c.pollMs });
  const wallet = createWalletClient({ chain, transport, account });
  return { chain, account, pub, wallet };
}
