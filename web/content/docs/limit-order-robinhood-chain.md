# How to set a limit order on Robinhood Chain

A limit order sells a token at a price you choose instead of the price right now. You set it once, and Stoa fills it when the market gets there, so you don't have to watch the chart. This guide walks through a first order on [stoadex.com/trade](https://stoadex.com/trade?chain=robinhood), with two common uses: taking profit and buying cheaper.

## Before you start

- A wallet connected to Robinhood Chain, with a little ETH for gas. New to the chain? Start with [How to swap on Robinhood Chain](swap-robinhood-chain.md).
- The token you want to sell, in that wallet. A limit order holds your deposit until it fills, so the tokens must be there when you place it.
- Check the token you want to buy first, on [stoadex.com/check](https://stoadex.com/check). See [How to check a token on Robinhood Chain](check-token-robinhood-chain.md).

## 1. Open the Limit tab

Go to [Trade](https://stoadex.com/trade?chain=robinhood), make sure **Robinhood** is the network, and switch from **Swap** to **Limit**. Pick the token you sell, the token you buy, and the amount, the same way as a swap.

## 2. Set your price

The **Limit price** is how much of the token you buy you want for each unit you sell, for example `USDG per ETH`. It starts at the market price, shown next to the label.

- Press **+2%**, **+5%** or **+10%** to ask for that much more than the market pays now, or type your own price.
- **You receive at least** shows the exact minimum for your whole amount. The order can never fill below it.
- **Versus the market now** shows how far your price is from today's. If your price is below the market, Stoa warns you: a normal swap gets you more.

## 3. Pick an expiry and place it

Choose **1 day**, **7 days** or **30 days** for how long the order stays open, then press **Place limit order**. Selling ETH sends it with the order. Selling a token asks your wallet to approve only that amount first, then place the order.

Your deposit waits in Stoa's limit order contract, StoaLimitV2 (see [Limit orders](limit-orders.md)). Nobody, Stoa included, can send it anywhere but back to you or through the router to you.

## 4. Wait for the fill, or manage it

Your order shows under **Your limit orders** with the time left. About every 5 minutes, Stoa's keeper checks every open order. When the router can pay your minimum, the keeper swaps your deposit and the router pays you directly in the same transaction. The order then shows **Filled**.

- **Fill now**: if the market already pays your price and you don't want to wait for the keeper, fill it yourself.
- **Cancel**: takes your deposit straight back, any time, even if limit orders are paused.
- **Expired**: an order past its expiry no longer fills. The keeper sends the deposit back to you, or you can cancel it yourself.

## Example: take profit

You hold 0.1 ETH and the market pays 3,000 USDG per ETH. Sell **ETH**, buy **USDG**, amount **0.1**, press **+10%**: your limit price becomes 3,300 USDG per ETH and you receive at least 330 USDG. If ETH reaches that price within your expiry, the order fills. If it doesn't, cancel or let it expire and your ETH comes back.

The numbers here only show how the screen works; they are not a price view.

## Example: buy cheaper

A limit order can also buy a token for less than it costs now. Sell **USDG**, buy the token, and ask for **more of the token for each USDG**. Pressing **+5%** asks for 5% more tokens per USDG, which is the same as buying at a price about 5% lower. The order fills only if the token's price drops that far.

This works for [stock tokens](buy-stock-tokens.md) too: sell USDG for a stock token at a price below today's, or sell a stock token at a price above it.

## Good to know

- **Fee**: the same 2 bps as a swap. There is no extra fee for limit orders.
- **Fills wait for the keeper.** It runs about every 5 minutes but can be later, so a price that only touches your limit for a moment may not fill.
- **Up to 20 open orders** per wallet, each for at most 30 days.
- **Tokens that take a fee on every transfer** can't be used; the router refuses to sell them.
- A filled order pays only you, and never less than your minimum, whoever sends the fill.

## Quick checklist

1. Network is **Robinhood**, tab is **Limit**.
2. Right tokens, right amount.
3. **You receive at least** is the amount you really want.
4. Expiry fits how long you're willing to wait.
5. After placing, check **Your limit orders**: cancel any time if you change your mind.

See also: [Limit orders](limit-orders.md) (how the contract works), [How to swap on Robinhood Chain](swap-robinhood-chain.md), [Trade](trade.md).
