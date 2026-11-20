# Limit orders

Sell a token at the price you choose instead of the price right now. On Robinhood Chain, open [Trade](https://stoadex.com/trade), pick the **Limit** tab, and set the least you accept.

First time? [How to set a limit order on Robinhood Chain](limit-order-robinhood-chain.md) walks through it step by step, with examples.

## How it works

1. Pick what you sell and what you buy, and the amount, as for a swap.
2. Set the price: how much of the token you buy each unit you sell must pay at least. It starts at today's market price; the +2%, +5% and +10% buttons set it above.
3. Pick when the order expires: 1, 7 or 30 days.
4. Confirm. Selling ETH sends it with the order; selling a token asks for an approval of that amount first.

Your deposit waits in the **StoaLimitV2** contract. About every 5 minutes, Stoa's keeper checks every open order. When the router can pay your minimum, the keeper swaps your deposit through it, and the router pays you directly. If the price moves back before the swap lands, the swap reverts and the order stays open.

## What you can count on

- **Never less than your minimum.** The router itself reverts any fill below it, whoever sends it.
- **Paid to you only.** A fill always pays the order's maker, nobody else.
- **Cancel any time.** Cancel from the order list and your deposit comes straight back, even if limit orders are paused. After an order expires, anyone (Stoa's keeper does it) can return the deposit to you.
- **Fill it yourself.** If the market pays your price and you do not want to wait for the keeper, press **Fill now**.
- **Same fee as a swap.** The router takes its usual 2 bps; there is no extra fee for limit orders. A referral link works the same way.

## Limits

- Up to 20 open orders per wallet, each lasting at most 30 days.
- Tokens that take a fee on every transfer cannot be used: the router refuses to sell them.
- Fills wait for the keeper, which runs about every 5 minutes but can be later. A price that only touches your limit for a moment may not fill.
- Only the keeper or you can fill an order. A rule that let anyone fill would let them push a pool to exactly your minimum and keep the difference.

## Contract

`StoaLimitV2` on Robinhood Chain: [`0xE42b3B429417182E8621F0d19A9a1dAdC31D1C12`](https://robinhoodchain.blockscout.com/address/0xE42b3B429417182E8621F0d19A9a1dAdC31D1C12), live since 16 November 2026. It is owned by the 48-hour timelock, with the router's guardian (who can pause new orders and fills, never cancels) and the buyback keeper. Nobody, owner included, can move a deposit anywhere but to its maker or through the router to its maker. Source: [contracts/src/StoaLimitV2.sol](https://github.com/StoaDex/Stoa/blob/main/contracts/src/StoaLimitV2.sol).

It replaces the first contract, [`0xf570F16D9dBcf6FF5fF8F2b6dF321ca4Fa4355B3`](https://robinhoodchain.blockscout.com/address/0xf570F16D9dBcf6FF5fF8F2b6dF321ca4Fa4355B3), which capped open orders at 1,000 across all wallets: anyone could fill that cap with dust orders from new wallets and block new orders (reported by Hey Research Lab in the [independent security review](security-review.md)). StoaLimitV2 has no such cap. The first contract never had an order.

## Buy if cheaper

Each stock token's page on [Stocks](https://stoadex.com/stocks) has **Buy if 5% cheaper** and **Buy if 10% cheaper**. They open the Limit tab for 50 USDG with the price set 5% or 10% below the on-chain price now; change the amount or price before you place it. Any link can do the same with `&mode=limit&dip=5` on a Trade link.
