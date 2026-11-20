import { parseAbi } from "viem";

export const routerAbi = parseAbi([
  "struct Leg { address venue; bool isPool; }",
  "struct Quote { uint256 amountOut; address mid; Leg leg1; Leg leg2; }",
  "struct SwapParams { address tokenIn; address tokenOut; address mid; Leg leg1; Leg leg2; uint256 amountIn; uint256 minOut; address to; uint256 deadline; address referrer; }",
  "function quote(address tokenIn, address tokenOut, uint256 amountIn) returns (Quote q)",
  "function swap(SwapParams p) payable returns (uint256 amountOut)",
  "function paused() view returns (bool)",
  "function isAdapter(address) view returns (bool)",
  // errors, so wallets and the app can show a readable reason
  "error Expired()",
  "error UnknownVenue()",
  "error BadValue()",
  "error Slippage()",
  "error ZeroAmount()",
  "error IsPaused()",
  "error BadToken()",
  "error BadRecipient()",
  "error InputNotSpent()",
  "error NativeTransferFailed()",
  "error QuoteExpired()",
  "error SizeExceeded()",
  "error CapExceeded()",
  "error UnsupportedToken()",
  "error Partial()",
]);

/** Human text for contract errors (router, pools, adapters). */
export const ERROR_TEXT: Record<string, string> = {
  Expired: "The swap took too long to confirm. Try again.",
  UnknownVenue: "That route is no longer available. Refresh the quote and try again.",
  BadValue: "The HYPE amount sent does not match the swap.",
  Slippage: "The price moved past your slippage limit, so the swap was cancelled. Your funds are safe.",
  ZeroAmount: "Enter an amount.",
  IsPaused: "Swaps are paused for safety. Please try again later.",
  BadToken: "This token is not supported (for example, it charges a fee on transfer).",
  BadRecipient: "Invalid recipient.",
  InputNotSpent: "The venue did not fill the full amount, so the swap was cancelled.",
  NativeTransferFailed: "Sending HYPE to your wallet failed.",
  QuoteExpired: "The maker quote expired. Try again.",
  SizeExceeded: "Amount is larger than the maker is quoting right now.",
  CapExceeded: "Amount is above the per-swap limit of the maker pool.",
  UnsupportedToken: "This token is not supported.",
  Partial: "Not enough liquidity for the full amount.",
  HookNotAllowed: "This pool uses a hook Stoa does not route through.",
  NotInitialized: "That pool does not exist yet.",
  Known: "This pool is already added.",
  Full: "This pair already has its deepest pools added.",
};

export const routedEvent = parseAbi([
  "event Routed(address indexed sender, address indexed to, address indexed referrer, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, address mid, address venue1, address venue2)",
])[0];

export const v4AdapterAbi = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "function keysFor(address a, address b) view returns (PoolKey[])",
  "function hookAllowed(address hooks) view returns (bool)",
  "function register(PoolKey key)",
  "error HookNotAllowed()",
  "error NotInitialized()",
  "error Known()",
  "error Full()",
  "error BadKey()",
]);

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
]);

export const whypeAbi = parseAbi(["function deposit() payable", "function withdraw(uint256)"]);

export const poolAbi = parseAbi([
  "function current() view returns (uint128 bidPx, uint128 askPx, uint96 bidSize, uint96 askSize, uint64 expiry)",
  "function maxSwapQuote() view returns (uint256)",
  "function feeBps() view returns (uint16)",
]);

export const feesAbi = parseAbi([
  "function referralOwed(address referrer, address token) view returns (uint256)",
  "function claimReferral(address[] tokens, address to)",
]);

/** Owner / guardian functions used by the admin console. */
export const adminAbi = parseAbi([
  "function owner() view returns (address)",
  "function pendingOwner() view returns (address)",
  "function acceptOwnership()",
  "function transferOwnership(address newOwner)",
  "function guardian() view returns (address)",
  "function paused() view returns (bool)",
  "function isAdapter(address) view returns (bool)",
  "function setupLocked() view returns (bool)",
  "function delay() view returns (uint256)",
  "function fallbackFeeBps() view returns (uint16)",
  "function pause()",
  "function unpause()",
  "function setGuardian(address g)",
  "function propose(bool pool, address venue)",
  "function execute(bool pool, address venue)",
  "function cancel(bool pool, address venue)",
  "function pending(bytes32 id) view returns (uint256)",
  "function proposalId(bool pool, address venue) pure returns (bytes32)",
  "function removeAdapter(address adapter)",
  "function removePool(address pool)",
  "function adapterCount() view returns (uint256)",
  "function adapters(uint256 i) view returns (address)",
  "function protocolAccrued(address token) view returns (uint256)",
  "function withdrawProtocol(address token, uint256 amount, address to)",
  "function setMakerApproval(address pool, address maker, bool ok)",
  "function setMinBond(address pool, uint256 minBond)",
  "function minBond(address pool) view returns (uint256)",
  "function setPaused(bool p)",
  "function cancelQuote()",
  "function quoteGuard() view returns (address)",
  "function sweep(address token, address to)",
]);

/** $STOA utility on Robinhood Chain (contracts/src/StoaBuyback.sol, BondRegistry.sol). */
export const buybackAbi = parseAbi([
  "function totalBurned() view returns (uint256)",
  "function keeper() view returns (address)",
  "event BoughtAndBurned(address indexed token, uint256 amountIn, uint256 stoaBurned)",
]);
export const bondAbi = parseAbi([
  "function totalBonded() view returns (uint256)",
  "function totalSlashed() view returns (uint256)",
  "function unbondDelay() view returns (uint64)",
  "function bonds(address maker) view returns (uint128 amount, uint128 pending, uint64 unlockAt)",
  "function isPool(address pool) view returns (bool)",
  "function minBond(address pool) view returns (uint256)",
  "function approved(address pool, address maker) view returns (bool)",
  "function bond(uint256 amount)",
  "function requestUnbond(uint256 amount)",
  "function withdrawUnbonded()",
  "event PoolListed(address indexed pool, uint256 minBond)",
  "error NotPool()",
  "error ZeroAmount()",
  "error InsufficientBond()",
  "error StillLocked()",
  "error UnsupportedToken()",
  "error TooLarge()",
]);
export const feeStateAbi = parseAbi([
  "function owner() view returns (address)",
  "function protocolAccrued(address token) view returns (uint256)",
]);

/** PonsCurveAdapter: the token's Pons curve if the adapter can trade on it now (else the zero address) */
export const ponsAdapterAbi = parseAbi(["function curveOf(address token) view returns (address)"]);
export const ponsCurveAbi = parseAbi(["function feeBps() view returns (uint256)", "function creatorTaxBps() view returns (uint256)"]);
