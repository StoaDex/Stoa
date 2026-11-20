import type { Address } from "viem";
import popular from "./popular-tokens.json";
import bridged from "./bridged-tokens.json";

export const NATIVE = "0x0000000000000000000000000000000000000000" as Address;

export interface Token {
  symbol: string;
  name: string;
  address: Address; // NATIVE for HYPE
  decimals: number;
  glyph: string;
  tone: "native" | "hype" | "usd" | "bridged" | "other";
  /** official icon (served from /public/tokens); letters are used when missing */
  logo?: string;
}

/** Canonical Elysium tokens (from Kinetiq's contract list). */
export const WHYPE = (process.env.NEXT_PUBLIC_WHYPE || "0xbA876237B0F021A6c6D852d6c26E107997cC5E81") as Address;
export const USDC = (process.env.NEXT_PUBLIC_USDC || "0xb47c4C8F73F009CC0C0d3f92B388d13E293F0B65") as Address;

export const TOKENS: Token[] = [
  { symbol: "HYPE", name: "Native", address: NATIVE, decimals: 18, glyph: "H", tone: "native", logo: "/tokens/hype.svg" },
  { symbol: "WHYPE", name: "Wrapped HYPE", address: WHYPE, decimals: 18, glyph: "H", tone: "hype", logo: "/tokens/hype.svg" },
  { symbol: "USDC", name: "USD Coin", address: USDC, decimals: 6, glyph: "$", tone: "usd", logo: "/tokens/usdc.svg" },
];

export const isNative = (t: Token) => t.address === NATIVE;

/** Major tokens bridged from HyperEVM through Elysium's canonical token bridge. Each address was checked on-chain:
 *  `l1Address()` is the HyperEVM token and the standard gateway (0x5DC8…aF1f) maps it back to this address. Only tokens the router can quote are listed. */
const CHECKED: [string, string, string, number, string][] = [
  ["KNTQ", "Kinetiq Governance Token", "0xe45a355d9e9cAd2aD85F2d03E3eE3102A036acF0", 18, "kntq.png"],
  ["kHYPE", "Kinetiq Staked HYPE", "0x248888D396A546A69A188f3Deb476964e581E9d0", 18, "khype.png"],
  ["USD₮0", "USD₮0", "0x3BdE42a1dA8F1D95564f2c4a51a0cF73a725674C", 6, "usdt0.svg"],
  ["UBTC", "Unit Bitcoin", "0xE9C29585EAe4B9a55b02a9605AEa892B40d972E8", 8, "ubtc.png"],
  ["UETH", "Unit Ethereum", "0x7A66A75fe41Bc26867C17fe1bc7D1C076EBd4eCd", 18, "ueth.png"],
  ["PURR", "Purr", "0x46b131573Ca7c2674b652BbeB7FC16D530396aEC", 18, "purr.png"],
];
const MAINNET = (process.env.NEXT_PUBLIC_CHAIN_ID ?? "99901") === "99901";
export const VERIFIED: Token[] = MAINNET
  ? CHECKED.map(([symbol, name, address, decimals, logo]) => ({
      symbol, name: `${name} · bridged`, address: address as Address, decimals, glyph: symbol[0], tone: "bridged" as const, logo: `/tokens/${logo}`,
    }))
  : [];
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const used = (list: Token[]) => ({ addr: new Set(list.map((t) => t.address.toLowerCase())), sym: new Set(list.map((t) => t.symbol.toLowerCase())) });

/** Other tokens from the canonical bridge that the router can trade both ways, refreshed daily by
 *  contracts/script/data/bridged_tokens.py. Anyone can bridge any HyperEVM token, so these keep the unverified-token
 *  warning; only VERIFIED above gets the check mark. Symbols already used by a core or verified token are left out. */
const core = used([...TOKENS, ...VERIFIED]);
export const BRIDGED: Token[] = MAINNET
  ? (bridged as { symbol: string; address: string; decimals: number }[])
      .filter((t) => !core.addr.has(t.address.toLowerCase()) && !core.sym.has(t.symbol.toLowerCase()))
      .map((t) => ({ symbol: t.symbol, name: `Bridged from HyperEVM · ${short(t.address)}`, address: t.address as Address, decimals: t.decimals, glyph: t.symbol[0] ?? "?", tone: "other" as const }))
  : [];
const taken = used([...TOKENS, ...VERIFIED, ...BRIDGED]);

/** Tokens with the most traded Uniswap V4 pools on Elysium (the pools Stoa registers at launch). Not reviewed by
 *  Stoa: they always show their address. "Montra launch" / "PerpMe launch" only say which launchpad created the token
 *  (from its public token list or its verified factory contract), not that it is safe. Tokens copying the symbol of a Montra launch or of a verified token from another address are left out. */
export const POPULAR: Token[] = MAINNET
  ? (popular as { symbol: string; address: string; decimals: number; logo?: string; montra?: boolean; launchpad?: string }[])
      .filter((t) => !taken.addr.has(t.address.toLowerCase()) && !taken.sym.has(t.symbol.toLowerCase()))
      // the list is sorted by trading activity: keep the most traded token per symbol, drop look-alikes
      .filter((t, i, a) => a.findIndex((x) => x.symbol.toLowerCase() === t.symbol.toLowerCase()) === i)
      .map((t) => ({
        symbol: t.symbol, name: `${t.montra ? "Montra launch" : t.launchpad ? `${t.launchpad} launch` : "Unverified"} · ${short(t.address)}`, address: t.address as Address,
        decimals: t.decimals, glyph: t.symbol[0] ?? "?", tone: "other" as const, logo: t.logo,
      }))
  : [];
