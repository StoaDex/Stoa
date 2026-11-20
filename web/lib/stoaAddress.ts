import type { Address } from "viem";

/** $STOA on Robinhood Chain, pinned after launch (Pons, 14 Nov 2026, tx 0x8d67fba0…). Plain module so server code can import it. */
export const CA = (process.env.NEXT_PUBLIC_STOA_CA || "0x13E6993417616De724F2b337D65063f229e96718") as Address;
