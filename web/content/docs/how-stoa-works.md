# How Stoa works

Four parts work together on every swap: makers, pools, the router and you.

Maker posts a quote → Pool stores it → Router compares sources → You get the best fill

## 1. Makers quote

A maker runs a bot that reads a price source and posts a bid, an ask, a size and an expiry to its pool. Quotes refresh whenever the price moves past a threshold, targeting about every 200 ms.

## 2. Pools hold inventory

Each `StoaPool` holds the tokens that fill swaps and only accepts quotes that are still fresh. In the first version, a pool's curator supplies its inventory. Public liquidity vaults come after the contracts are audited.

## 3. The router picks the best fill

When you enter an amount, `StoaRouter` asks every Stoa pool for a price and compares it with the other venues on Elysium that hold real liquidity: Uniswap V2, V3 and V4, Aero, Ramses and a Liquidity Book (DLMM) exchange. It also checks a two-step route through WHYPE and picks the best venue for each step, so a launchpad token that only trades against HYPE on Uniswap V4 can still finish in the deepest HYPE/USDC pool. Your swap then follows that route in one transaction.

The router only sends funds to venues on its allowlist, measures what you actually receive, and reverts below your minimum (for standard tokens; a token that taxes transfers is covered in [Risks](risks.md)). If no maker quote is valid, the swap fills on the best outside venue. More venues can be added as adapters after a public 24-hour wait.

## 4. You sign once

You set a maximum slippage. If the price you get would be worse than that, the transaction reverts and your funds stay in your wallet.
