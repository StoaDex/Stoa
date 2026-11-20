import "server-only";
import { createPublicClient, getAddress, http, isAddress, type Address } from "viem";
import { ALLOWED_BRIDGES, DESTS, DST_CHAIN_ID, LIFI, LIFI_DIAMOND, NATIVE_ZERO, SOURCES, checkLifiTx, sameAddr, type LifiQuote } from "./bridge";

/** Bridge in for agents (MCP bridge_quote): the same LI.FI-over-Across route as stoadex.com/bridge, checked the same
 *  way before it is returned, so an agent never hands its user a transaction Stoa has not decoded. Unsigned. */
export async function bridgeQuote(p: { fromChain?: string; fromToken?: string; toToken?: string; amount?: string; wallet?: string }) {
  const src = SOURCES.find((s) => s.key === p.fromChain);
  if (!src) return { error: `fromChain must be one of ${SOURCES.map((s) => s.key).join(", ")}` };
  const sTok = src.tokens.find((t) => t.symbol.toUpperCase() === (p.fromToken ?? "").toUpperCase());
  if (!sTok) return { error: `fromToken on ${src.name} must be one of ${src.tokens.map((t) => t.symbol).join(", ")}` };
  const dTok = DESTS.find((t) => t.symbol.toUpperCase() === (p.toToken ?? "ETH").toUpperCase());
  if (!dTok) return { error: "toToken must be ETH or USDG" };
  if (!p.amount || !/^[1-9][0-9]{0,40}$/.test(p.amount)) return { error: `amount must be an integer in ${sTok.symbol}'s smallest unit (${sTok.decimals} decimals)` };
  if (!p.wallet || !isAddress(p.wallet, { strict: false })) return { error: "wallet must be the user's address" };
  const wallet = getAddress(p.wallet) as Address;
  const amount = BigInt(p.amount);

  // a smart-contract wallet may not control the same address on Robinhood Chain (EIP-7702 accounts are fine)
  let walletIsContract: boolean | null = null;
  try {
    const code = await createPublicClient({ chain: src.chain, transport: http(undefined, { timeout: 8_000 }) }).getCode({ address: wallet });
    walletIsContract = !!code && code !== "0x" && !code.toLowerCase().startsWith("0xef0100");
  } catch { /* unknown: said in the answer */ }
  if (walletIsContract) return { error: "This wallet is a smart contract on the source chain. Bridge in sends to the same address on Robinhood Chain, which a smart wallet may not control there, so only regular wallets are supported." };

  const q = new URLSearchParams({
    fromChain: String(src.chain.id), toChain: String(DST_CHAIN_ID), fromToken: sTok.address, toToken: dTok.address,
    fromAmount: amount.toString(), fromAddress: wallet, toAddress: wallet, integrator: "stoa", slippage: "0.005", allowBridges: ALLOWED_BRIDGES,
  });
  const r = await fetch(`${LIFI}/quote?${q}`, { cache: "no-store", signal: AbortSignal.timeout(25_000) });
  const j = (await r.json().catch(() => ({}))) as Partial<LifiQuote>;
  if (!r.ok || !j.estimate || !j.transactionRequest) return { error: dTok.symbol === "USDG" ? "No checkable route to USDG for this pair and amount. Bridge ETH instead, then swap on Stoa." : "No checkable route for this pair and amount right now." };
  const t = j.transactionRequest;
  const why = checkLifiTx(t, { user: wallet, chainId: src.chain.id, token: sTok.address, amount, toToken: dTok.address, minOut: BigInt(j.estimate.toAmountMin ?? 0) });
  if (why) return { error: "Stoa could not verify this route, so it is not returned. Try another token or amount." };

  const native = sameAddr(sTok.address, NATIVE_ZERO);
  const usd = (xs?: { amountUSD?: string }[]) => Number((xs ?? []).reduce((a, x) => a + Number(x.amountUSD ?? 0), 0).toFixed(4));
  return {
    from: { chain: src.key, chainId: src.chain.id, token: sTok.symbol, address: native ? "native" : sTok.address, amount: amount.toString(), decimals: sTok.decimals },
    to: { chain: "robinhood", chainId: DST_CHAIN_ID, token: dTok.symbol, address: sameAddr(dTok.address, NATIVE_ZERO) ? "native" : dTok.address, amount: j.estimate.toAmount, minAmount: j.estimate.toAmountMin, decimals: dTok.decimals, receiver: wallet },
    bridge: `${j.toolDetails?.name ?? j.tool} via LI.FI`,
    feesUsd: usd(j.estimate.feeCosts), gasUsd: usd(j.estimate.gasCosts), estimatedSeconds: j.estimate.executionDuration ?? null,
    approval: native ? null : { token: sTok.address, spender: LIFI_DIAMOND, amount: amount.toString(), note: "Approve exactly this amount, never unlimited." },
    tx: { to: t.to, data: t.data, value: t.value ?? "0", chainId: t.chainId },
    checked: ["tx.to is LI.FI's contract", "the call is LI.FI's Across bridge", `receiver and refund address are ${wallet}`, "destination chain is Robinhood Chain (4663)", "it spends exactly the token and amount asked", "value is capped", ...(walletIsContract === null ? [] : ["the wallet is not a smart contract"])],
    walletCheck: walletIsContract === null ? "Could not read the wallet's code on the source chain: make sure it is a regular wallet, not a Safe or smart account." : "ok",
    validForSeconds: 45,
    note: `Unsigned. The user's wallet signs on ${src.name}${native ? "" : " (approve first)"}. Funds arrive at the same address on Robinhood Chain, usually within minutes; then use quote and build_swap there. Stoa adds no fee to a bridge; fees shown are the bridge's and LI.FI's.`,
  };
}
