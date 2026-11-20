import { parseAbi, type Address } from "viem";
import { useBytecode } from "wagmi";
import { ROBINHOOD } from "./networks";
import { routerAbi } from "./abi";

/** Limit orders on Robinhood Chain (contracts/src/StoaLimit.sol, CREATE2): deposit what you sell, name the least you
 *  accept; Stoa's keeper fills through the router once the market pays it, about every 5 minutes. */
export const LIMIT = ROBINHOOD.contracts.limit;
export const OPEN = 1, FILLED = 2, CANCELLED = 3;

const only = parseAbi([
  "struct Order { address maker; uint8 status; uint64 expiry; address tokenIn; address tokenOut; address referrer; uint256 amountIn; uint256 minOut; }",
  "struct Leg { address venue; bool isPool; }",
  "function create(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, uint64 expiry, address referrer) payable returns (uint256 id)",
  "function cancel(uint256 id)",
  "function fill(uint256 id, address mid, Leg leg1, Leg leg2) returns (uint256 amountOut)",
  "function order(uint256 id) view returns (Order)",
  "function ordersOf(address maker) view returns (uint256[])",
  "function openCount(address) view returns (uint256)",
  "function paused() view returns (bool)",
  "event Filled(uint256 indexed id, address indexed maker, uint256 amountOut, address by)",
  "error ZeroAddress()", "error BadOrder()", "error BadValue()", "error BadToken()", "error TooMany()", "error NotOpen()",
  "error Expired()", "error NotAllowed()", "error IsPaused()", "error SendFailed()",
]);
export const limitAbi = [...only, ...routerAbi.filter((x) => x.type === "error" && !only.some((c) => c.type === "error" && c.name === x.name))];

export const LIMIT_ERRORS: Record<string, string> = {
  BadOrder: "This order is not valid: check the amounts and the expiry.",
  BadValue: "The ETH sent does not match the order. Try again.",
  BadToken: "This token takes a fee on every transfer, so a limit order could never be filled. Swap it instead.",
  TooMany: "You have 20 open limit orders, the most one wallet can have. Cancel one first.",
  NotOpen: "This order is no longer open.",
  Expired: "This order has expired. Cancel it to take your deposit back.",
  NotAllowed: "Only you or Stoa's keeper can fill this order.",
  IsPaused: "Limit orders are paused for safety: new orders and fills are stopped. You can still cancel and take your deposit back.",
  SendFailed: "Sending your deposit back failed.",
  Slippage: "The market does not pay your minimum yet. Your order stays open.",
};

export type Order = { maker: Address; status: number; expiry: bigint; tokenIn: Address; tokenOut: Address; referrer: Address; amountIn: bigint; minOut: bigint };

export function useLimitLive() {
  const code = useBytecode({ address: LIMIT, chainId: ROBINHOOD.chain.id, query: { enabled: !!LIMIT, staleTime: 300_000 } });
  return !!LIMIT && !!code.data && code.data !== "0x";
}
