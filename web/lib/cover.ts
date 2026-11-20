import { BaseError, ContractFunctionRevertedError, parseAbi, type Address } from "viem";
import { useBytecode, useReadContracts } from "wagmi";
import { ROBINHOOD } from "./networks";
import { ERROR_TEXT, routerAbi } from "./abi";

/** Rug Cover on Robinhood Chain: a Pons token's creator bonds ETH behind a promise not to sell or move the tokens in
 *  their wallet; buyers who buy through Stoa with cover get the ETH they spent back if the creator's wallet drops
 *  below what it held when the cover opened. Contract: contracts/src/RugCover.sol (CREATE2, same address forever). */

export const COVER = ROBINHOOD.contracts.cover;
export const OPEN = 1, RELEASED = 2, BREACHED = 3;
/** covered buys stop this long before a term ends; a bond can be released this long after it ends */
export const SALE_STOP = 86_400, GRACE = 86_400, UNLOCK_DELAY = 7 * 86_400, STREAM = 7 * 86_400;

const coverOnly = parseAbi([
  "struct Params { uint32 term; uint16 feeBps; uint16 capacityBps; uint16 premiumBps; uint16 walletCapBps; uint16 bountyBps; uint16 burnBps; uint16 minFloorBps; uint64 minFee; uint64 minBond; uint64 maxBond; uint64 minCover; uint64 maxCover; uint96 maxTotalBonds; }",
  "struct Term { address creator; uint8 status; uint64 openedAt; uint64 endsAt; uint96 bond; uint96 capacity; uint96 sold; uint128 floor; uint16 premiumBps; uint16 walletCapBps; uint16 bountyBps; uint16 burnBps; uint64 minCover; uint64 maxCover; }",
  "struct Leg { address venue; bool isPool; }",
  "struct SwapParams { address tokenIn; address tokenOut; address mid; Leg leg1; Leg leg2; uint256 amountIn; uint256 minOut; address to; uint256 deadline; address referrer; }",
  "function open(address token, uint256 bond) payable returns (uint256 id)",
  "function release(address token, address to) returns (uint256 bond)",
  "function buyCovered(SwapParams s) payable returns (uint256 amountOut)",
  "function claim(address token, uint256 id, address to) returns (uint256 amount)",
  "function breach(address token) returns (uint256 bounty)",
  "function withdrawCredit(address to) returns (uint256 amount)",
  "function lock(uint256 amount)",
  "function requestUnlock(uint256 amount)",
  "function withdraw(address to) returns (uint256 amount)",
  "function emergencyWithdraw(address to) returns (uint256 amount)",
  "function claimRewards(address to) returns (uint256 amount)",
  "function params() view returns (Params)",
  "function feeFor(uint256 bond) view returns (uint256)",
  "function premiumFor(address token, uint256 cover) view returns (uint256)",
  "function term(address token, uint256 id) view returns (Term)",
  "function latestTerm(address token) view returns (uint256 id, Term t)",
  "function breachable(address token) view returns (bool)",
  "function openTokens() view returns (address[])",
  "function creatorOf(address token) view returns (address)",
  "function termCount(address token) view returns (uint256)",
  "function coverOf(address token, uint256 id, address buyer) view returns (uint256)",
  "function backers(address) view returns (uint128 active, uint128 pending, uint64 unlockAt)",
  "function earned(address backer) view returns (uint256)",
  "function credits(address) view returns (uint256)",
  "function paused() view returns (bool)",
  "function totalBonds() view returns (uint256)",
  "function totalOwed() view returns (uint256)",
  "function burnPot() view returns (uint256)",
  "function totalBurned() view returns (uint256)",
  "function totalActive() view returns (uint256)",
  "function totalLocked() view returns (uint256)",
  "function unstreamed() view returns (uint256)",
  "event Opened(address indexed token, uint256 indexed id, address indexed creator, uint256 bond, uint256 fee, uint256 floor, uint256 endsAt, uint256 capacity)",
  "event Covered(address indexed token, uint256 indexed id, address indexed buyer, uint256 cover, uint256 premium, uint256 out)",
  "event Breached(address indexed token, uint256 indexed id, address indexed caller, uint256 owed, uint256 bounty, uint256 rest)",
  "event Released(address indexed token, uint256 indexed id, address to, uint256 bond)",
  "event Claimed(address indexed token, uint256 indexed id, address indexed buyer, address to, uint256 amount)",
  "error ZeroAddress()", "error ZeroAmount()", "error BadAmount()", "error BadParams()", "error BadBond()", "error BadValue()",
  "error BadSwap()", "error BadCover()", "error NotCreator()", "error TermOpen()", "error BondCap()", "error FloorTooLow()",
  "error NoCover()", "error SalesClosed()", "error CreatorCannotBuy()", "error CapacityFull()", "error WalletCap()",
  "error Breachable()", "error NotBreached()", "error TooEarly()", "error NothingToClaim()", "error NotPaused()",
  "error IsPaused()", "error NotGuardian()", "error NotKeeper()", "error SendFailed()", "error NoRenounce()",
]);
/** the cover contract's ABI plus the router's errors, so a swap that reverts inside a covered buy reads clearly */
export const coverAbi = [...coverOnly, ...routerAbi.filter((x) => x.type === "error" && !coverOnly.some((c) => c.type === "error" && c.name === x.name))];

/** Messages for Rug Cover reverts; the router's own (slippage, expired...) come from ERROR_TEXT. */
export const COVER_ERRORS: Record<string, string> = {
  BadBond: "The bond is outside the allowed range.",
  BadValue: "The ETH sent does not match. Refresh and try again.",
  BadSwap: "This buy cannot be covered: it must be a swap from ETH to the token, paid to your wallet.",
  BadCover: "This amount is outside the range one covered buy allows.",
  NotCreator: "Only the wallet that launched this token on Pons can open its cover.",
  TermOpen: "This token already has an open cover.",
  BondCap: "Rug Cover holds as many bonds as its beta limit allows right now. Try again when one is released.",
  FloorTooLow: "The creator wallet must hold at least the minimum share of supply to open a cover.",
  NoCover: "This token has no open cover.",
  SalesClosed: "Covered buys for this term have stopped: they close a day before the term ends.",
  CreatorCannotBuy: "The creator cannot buy cover on their own token.",
  CapacityFull: "This buy would go past the cover left on this token.",
  WalletCap: "This buy would go past the cover one wallet can hold on this token.",
  Breachable: "The creator's wallet is below its floor: the cover can be breached, not bought or released.",
  NotBreached: "The creator's wallet still holds its floor.",
  TooEarly: "Not yet: this opens later.",
  NothingToClaim: "There is nothing to claim.",
  NotPaused: "Rug Cover is not paused.",
  IsPaused: "Paused for safety: new covers, covered buys and locks are stopped. Claims, breaches, releases and unlocks still work.",
  ZeroAmount: "Enter an amount.",
  BadAmount: "Enter an amount you have locked.",
  SendFailed: "Sending ETH to that address failed.",
};

export type Term = {
  creator: Address; status: number; openedAt: bigint; endsAt: bigint; bond: bigint; capacity: bigint; sold: bigint; floor: bigint;
  premiumBps: number; walletCapBps: number; bountyBps: number; burnBps: number; minCover: bigint; maxCover: bigint;
};
export type Params = {
  term: number; feeBps: number; capacityBps: number; premiumBps: number; walletCapBps: number; bountyBps: number; burnBps: number;
  minFloorBps: number; minFee: bigint; minBond: bigint; maxBond: bigint; minCover: bigint; maxCover: bigint; maxTotalBonds: bigint;
};

const chainId = ROBINHOOD.chain.id;
const balAbi = parseAbi(["function balanceOf(address) view returns (uint256)", "function totalSupply() view returns (uint256)"]);

/** true once the contract is deployed (its code is at the CREATE2 address); the UI stays hidden before */
export function useCoverLive() {
  const code = useBytecode({ address: COVER, chainId, query: { enabled: !!COVER, staleTime: 300_000 } });
  return !!COVER && !!code.data && code.data !== "0x";
}

export type TermView = {
  id: bigint; term: Term; open: boolean; balance: bigint; supply: bigint; holding: boolean; paused: boolean;
  /** seconds; 0 once covered buys have stopped */
  salesLeft: number;
  /** cover still for sale, wei */
  left: bigint;
};

/** A token's latest term with its creator's balance now; refreshes every 15 s. */
export function useTerm(token: Address | undefined, live: boolean) {
  const r = useReadContracts({
    contracts: [
      { address: COVER!, abi: coverOnly, functionName: "latestTerm", args: [token!], chainId },
      { address: token!, abi: balAbi, functionName: "totalSupply", chainId },
      { address: COVER!, abi: coverOnly, functionName: "paused", chainId },
    ],
    query: { enabled: live && !!token, refetchInterval: 15_000 },
  });
  const latest = r.data?.[0]?.result as readonly [bigint, Term] | undefined;
  const creator = latest?.[1].creator;
  const bal = useReadContracts({
    contracts: [{ address: token!, abi: balAbi, functionName: "balanceOf", args: [creator!], chainId }],
    query: { enabled: live && !!token && !!creator && latest![0] > 0n, refetchInterval: 15_000 },
  });
  if (!latest) return { data: undefined as TermView | undefined, loading: r.isLoading, refetch: () => { void r.refetch(); void bal.refetch(); } };
  const [id, term] = latest;
  const balance = (bal.data?.[0]?.result as bigint | undefined) ?? 0n;
  const now = Math.floor(Date.now() / 1000);
  const data: TermView | undefined = id === 0n ? undefined : {
    id, term, open: term.status === OPEN, balance, supply: (r.data?.[1]?.result as bigint | undefined) ?? 0n,
    holding: bal.data ? balance >= term.floor : true, paused: r.data?.[2]?.result === true,
    salesLeft: Math.max(0, Number(term.endsAt) - SALE_STOP - now),
    left: term.capacity > term.sold ? term.capacity - term.sold : 0n,
  };
  return { data, loading: r.isLoading || bal.isLoading, refetch: () => { void r.refetch(); void bal.refetch(); } };
}

/** tokens with an open term (for Covered badges in lists) */
export function useOpenTokens(live: boolean) {
  const r = useReadContracts({
    contracts: [{ address: COVER!, abi: coverOnly, functionName: "openTokens", chainId }],
    query: { enabled: live, refetchInterval: 60_000 },
  });
  return new Set(((r.data?.[0]?.result as Address[] | undefined) ?? []).map((a) => a.toLowerCase()));
}

export const pct = (part: bigint, whole: bigint, dp = 2) => (whole === 0n ? "0" : (Number((part * 1_000_000n) / whole) / 10_000).toFixed(dp));
export const eth = (v: bigint, dp = 4) => {
  const n = Number(v) / 1e18;
  return n === 0 ? "0" : n < 10 ** -dp ? `<${10 ** -dp}` : n.toLocaleString("en-US", { maximumFractionDigits: dp });
};
export function until(ts: number) {
  const s = ts - Date.now() / 1000;
  if (s <= 0) return "ended";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.max(1, Math.floor((s % 3600) / 60));
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}
export const when = (ts: number | bigint) =>
  new Date(Number(ts) * 1000).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

/** Readable text for a failed cover transaction: Rug Cover's errors, then the router's, then the wallet's. */
/** the Rug Cover-specific text for a revert, if the error is one of Rug Cover's own */
export function coverErrorText(e: unknown): string | undefined {
  if (!(e instanceof BaseError)) return undefined;
  const rev = e.walk((x) => x instanceof ContractFunctionRevertedError);
  const n = rev instanceof ContractFunctionRevertedError ? rev.data?.errorName : undefined;
  return n ? COVER_ERRORS[n] : undefined;
}

export function explainCover(e: unknown): string {
  if (e instanceof BaseError) {
    const rev = e.walk((x) => x instanceof ContractFunctionRevertedError);
    const n = rev instanceof ContractFunctionRevertedError ? rev.data?.errorName : undefined;
    if (n && COVER_ERRORS[n]) return COVER_ERRORS[n];
    if (n && ERROR_TEXT[n]) return ERROR_TEXT[n].replace(/HYPE/g, "ETH");
    if (/User rejected|denied/i.test(e.shortMessage)) return "You rejected the request in your wallet.";
    if (/insufficient funds/i.test(e.shortMessage)) return "Not enough ETH for this and gas.";
    return e.shortMessage;
  }
  return (e as Error)?.message ?? "Something went wrong.";
}
