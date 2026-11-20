# How to buy $STOA

$STOA is Stoa's official token on Robinhood Chain. Contract: `0x13E6993417616De724F2b337D65063f229e96718`. Always check this address: anyone can launch a token called STOA, and only this one is Stoa's. It is also pinned on the [$STOA page](https://stoadex.com/token) and in the footer of every page.

## What you need

- A wallet on **Robinhood Chain** (chain ID 4663). Any EVM wallet works: Stoa adds the network when you connect.
- **ETH on Robinhood Chain**, for the trade and for gas. Gas is a few cents at most.

## Where $STOA trades now

$STOA launched on [Pons](https://ponsfamily.com/launchpad/0x13E6993417616De724F2b337D65063f229e96718) and graduated on 15 November 2026: its bonding curve filled and Pons moved it to a Uniswap V4 pool (ETH / STOA) with locked liquidity. That pool is where $STOA trades now, and Stoa routes it.

| Where to buy | How |
| --- | --- |
| Stoa | Swap ETH, or any token Stoa routes, for $STOA. Stoa fills it in the V4 pool |
| Pons | Open $STOA on Pons and buy with ETH; it trades the same pool |

## Buy from another chain

Hold ETH or stablecoins on Base, Arbitrum, Ethereum, Optimism or BNB Chain? Use **Buy $STOA from any chain** on the [$STOA page](https://stoadex.com/token#anychain): you pay on the source chain and $STOA arrives in the same wallet on Robinhood Chain, usually within a minute.

- **How it is routed.** [Trustware](https://trustware.io) routes it through Relay: you deposit into Relay's Depository on the source chain, and Relay delivers $STOA on Robinhood Chain.
- **What Stoa checks before your wallet opens.** The deposit goes to Relay's Depository, from your own address, with exactly the token and amount you picked; any approval is for that amount only. Stoa values the purchase at its own prices, not the route's.
- **Limit.** Up to $500 per purchase for now, because the delivery details sit in Relay's order, which Stoa cannot check before you sign yet.
- **Costs.** The route's fees (Relay and Trustware) are shown before you sign, with how much less $STOA you get than Stoa's own price. Stoa adds no fee of its own.
- **Wallets.** A regular wallet only: $STOA arrives at the same address, which a smart wallet may not control on Robinhood Chain.
- **Done means delivered.** The page shows done only once Robinhood Chain shows the $STOA in your wallet, at least the minimum shown.

## Buy on Stoa, step by step

1. Open [stoadex.com/trade?chain=robinhood&buy=0x13E6993417616De724F2b337D65063f229e96718](https://stoadex.com/trade?chain=robinhood&buy=0x13E6993417616De724F2b337D65063f229e96718). The link selects Robinhood Chain and $STOA for you.
2. Connect your wallet. If it is on another network, Stoa asks it to switch.
3. Pick what you pay with: ETH directly, or USDG or another token (Stoa swaps it to WETH first, in the same transaction).
4. Enter the amount and check the details under the quote:
   - **Filled by** says where the swap fills: *Uniswap V4*, $STOA's graduation pool.
   - **Price impact** and **Minimum received**. The pool's 2.8% fee (see Costs) is already in the amount you see.
5. Confirm in your wallet. $STOA arrives in the same transaction.

## Costs

| Cost | Size | Goes to |
| --- | --- | --- |
| Stoa protocol fee | 2 bps (0.02%) | Stoa's fee contract: 10% to the referrer if you came through a referral link, the rest buys and burns $STOA every week (from the 17 Nov handover) |
| Pons pool fee | 2.8% of each buy and sell | Taken by the hook Pons gives its graduation pools, the same rate $STOA paid on its curve (Pons' 1% fee plus the 1.8% creator tax set at launch). The pool itself has a 0% swap fee |
| Gas | A few cents at most | Robinhood Chain |

## Before you buy

$STOA is a new token with a small market. Its price can fall to zero. Stoa's contracts are source-verified and run behind a 2-of-3 Safe and a 48-hour timelock, but they have not had an external audit. Read [Risks](risks.md) and buy only what you can afford to lose.
