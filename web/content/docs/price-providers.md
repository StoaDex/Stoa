# Price providers

Each pool names the source its maker uses to price quotes.

- **HyperCore orderbook** — Elysium can read Hyperliquid's orderbook directly from a contract after the HyperCore upgrade, expected about four weeks after the 9 Nov 2026 mainnet.
- **Hyperliquid API** — used by Stoa's own maker until the upgrade is live.
- **Oracle feeds** — for assets with a trusted on-chain feed.
- **A maker's own model** — for curators running custom strategies.

Makers choose their own source. Each pool can also turn on a [quote guard](price-provider-guide.md) that checks every quote against an independent price, and the guard can be swapped (for example to the HyperCore precompile) without redeploying the pool.
