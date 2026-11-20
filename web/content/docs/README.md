# Introduction

Stoa is a swap router on Robinhood Chain and Elysium: every swap is compared across every venue the router uses on the network before you sign. On Elysium it is also a PropAMM hub, with pools priced live by professional makers.

## What Stoa is

Most AMMs price a trade with a fixed formula. On Stoa, every pool is priced by **makers** who post bid and ask quotes on-chain, block after block. That is called a proactive AMM, or PropAMM. Because Elysium produces a block every 100–200 ms, makers can update prices several times a second at low cost.

## Who it is for

| You are | What you do on Stoa |
| --- | --- |
| Trader | Swap on the best route across Stoa maker pools, Uniswap V2/V3/V4, Aero, Ramses and Liquidity Book on Elysium; Uniswap V2/V3/V4, Aero, Ramses, Metric and Pons launch curves on Robinhood Chain. |
| Liquidity provider | Pool vaults (ERC-4626 shares that grow with fees) open after the external audit. |
| Curator / maker | Run a pool: bring a price source, post a HYPE bond, quote every block. |
| Builder | Use the router, SDK and LP tokens inside your own app or contract. |

## Key facts

| Item | Value |
| --- | --- |
| Networks | Elysium (Hyperliquid L2 by Kinetiq), chain ID 99901 · Robinhood Chain, chain ID 4663 |
| First pool | WHYPE / USDC |
| Protocol fee | 2 bps per swap |
| Quote validity | 2 blocks |
| Launch limit | $500 per swap |

## How Stoa launches

Stoa launches **router first**. Every swap is checked across Uniswap V2/V3/V4, Aero, Ramses and Liquidity Book and filled on the best of them, so trading works before any maker pool holds inventory. Maker pools join the same router as curators come online, and win whenever they quote a better price. Nothing changes for you as a trader.

{% hint style="info" %}

Stoa is live on Elysium mainnet. The router and the WHYPE/USDC maker pool are deployed; the pool starts quoting when its first maker comes online. Until then every swap fills on the best outside venue. Vaults open after the external audit.

{% endhint %}
