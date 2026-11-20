import type { Address, Hex } from "viem";

/** All settings come from environment variables (see .env.example). */
export interface Config {
  rpcUrl: string;
  wsUrl?: string;
  chainId: number;
  privateKey: Hex;
  pool: Address;

  // price source
  priceSource: "hyperliquid" | "static";
  hlCoin: string; // Hyperliquid coin used as the reference price, e.g. "HYPE"
  hlHttp: string;
  hlWs: string;
  staticMid: number; // only for priceSource=static (tests, dry runs)

  // quoting
  baseSpreadBps: number; // half-spread around the centre price
  minSpreadBps: number;
  volMultiplier: number; // extra half-spread per bps of short-term volatility
  skewBps: number; // max centre shift when inventory is fully one-sided
  sideNotionalUsd: number; // size offered per side in each quote
  validBlocks: number; // 1..2 on the pool at launch
  inventoryUse: number; // share of inventory a quote may use (0..1)

  // risk
  maxInventoryRatio: number; // stop buying base above this share of value in base (and vice versa)
  maxDailyLossUsd: number;
  maxPriceAgeMs: number;
  jumpBps: number; // price jump between ticks that triggers a cooldown
  cooldownMs: number;
  killFile: string;

  // transactions
  priorityFeeGwei: number;
  gasLimit: bigint;
  maxPendingTx: number;
  pollMs: number;

  dryRun: boolean;
  healthPort: number;
}

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}
const num = (name: string, def: number) => (process.env[name] ? Number(process.env[name]) : def);

export function loadConfig(): Config {
  const dryRun = process.env.DRY_RUN === "1";
  const c: Config = {
    rpcUrl: req("RPC_URL"),
    wsUrl: process.env.WS_URL || undefined,
    chainId: num("CHAIN_ID", 99901),
    privateKey: (dryRun && !process.env.PRIVATE_KEY
      ? "0x0000000000000000000000000000000000000000000000000000000000000001"
      : req("PRIVATE_KEY")) as Hex,
    pool: req("POOL") as Address,

    priceSource: (process.env.PRICE_SOURCE as Config["priceSource"]) || "hyperliquid",
    hlCoin: process.env.HL_COIN || "HYPE",
    hlHttp: process.env.HL_HTTP || "https://api.hyperliquid.xyz/info",
    hlWs: process.env.HL_WS || "wss://api.hyperliquid.xyz/ws",
    staticMid: num("STATIC_MID", 0),

    baseSpreadBps: num("BASE_SPREAD_BPS", 8),
    minSpreadBps: num("MIN_SPREAD_BPS", 4),
    volMultiplier: num("VOL_MULTIPLIER", 1.5),
    skewBps: num("SKEW_BPS", 10),
    sideNotionalUsd: num("SIDE_NOTIONAL_USD", 750),
    validBlocks: num("VALID_BLOCKS", 2),
    inventoryUse: num("INVENTORY_USE", 0.9),

    maxInventoryRatio: num("MAX_INVENTORY_RATIO", 0.8),
    maxDailyLossUsd: num("MAX_DAILY_LOSS_USD", 150),
    maxPriceAgeMs: num("MAX_PRICE_AGE_MS", 1500),
    jumpBps: num("JUMP_BPS", 150),
    cooldownMs: num("COOLDOWN_MS", 5000),
    killFile: process.env.KILL_FILE || "./KILL",

    priorityFeeGwei: num("PRIORITY_FEE_GWEI", 0.5),
    gasLimit: BigInt(num("GAS_LIMIT", 120000)),
    maxPendingTx: num("MAX_PENDING_TX", 3),
    pollMs: num("POLL_MS", 100),

    dryRun,
    healthPort: num("HEALTH_PORT", 8787),
  };
  if (c.validBlocks < 1) throw new Error("VALID_BLOCKS must be >= 1");
  if (c.inventoryUse <= 0 || c.inventoryUse > 1) throw new Error("INVENTORY_USE must be in (0,1]");
  if (c.maxInventoryRatio <= 0.5 || c.maxInventoryRatio >= 1) throw new Error("MAX_INVENTORY_RATIO must be in (0.5,1)");
  return c;
}
