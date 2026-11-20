# How to buy stock tokens on Robinhood Chain

Robinhood Stock Tokens are ERC-20 tokens that track US shares (Apple, Tesla, Nvidia and about 200 more) on Robinhood Chain. They trade on-chain around the clock, and Stoa can swap them where a pool exists. This guide goes from an empty wallet to your first stock token.

{% hint style="warning" %}

Stock Tokens are issued by Robinhood Assets (Jersey) Limited, not by Stoa, and they are not offered in every country. Check Robinhood's terms for yours before you buy. Stoa only routes swaps between tokens. Nothing here is investment advice.

{% endhint %}

## 1. Get a wallet on Robinhood Chain

Any EVM wallet works (Robinhood Wallet, MetaMask, Rabby and others). You don't need to add the network by hand: Stoa adds Robinhood Chain (chain ID 4663) when you connect. Your address is the same as on Ethereum.

## 2. Bring ETH and USDG to the chain

- **ETH** pays gas on Robinhood Chain. A swap costs a few cents at most, so a small amount is enough.
- **USDG** (Paxos' dollar stablecoin) is what most stock token pools are paired with. You can also start with ETH only and swap part of it to USDG on Stoa.

To move funds in, use the Arbitrum canonical bridge or one of the partner bridges listed in [Robinhood Chain's bridging docs](https://docs.robinhood.com/chain/bridging/). Robinhood's docs say deposits from Ethereum usually arrive within about 10 minutes. Only use bridge links from those docs: fake bridges are a common scam on new chains.

## 3. Find the stock

Open [Stocks](https://stoadex.com/stocks). Each row shows two prices:

- **Robinhood**: the middle of Robinhood's bid and ask, which follows the real shares while a US session is open.
- **On-chain**: what the token trades for in its deepest pool, and how far that is from Robinhood's price.

The badge at the top says whether the US market is open, in extended hours, in the overnight session or closed. On-chain pools trade at any time, but outside the sessions they have no live reference price, so the gap can grow. If the on-chain price is far from Robinhood's, wait or buy a smaller amount.

Every stock also has its own page, such as [stoadex.com/stocks/AAPL](https://stoadex.com/stocks/AAPL), with both prices and a share card.

## 4. Swap

1. Press **Swap** next to the stock. It opens [Trade](https://stoadex.com/trade?chain=robinhood) with USDG to sell and the stock token to buy. **Swap** only shows when Stoa's router can buy the token right now.
2. Connect your wallet and enter the amount of USDG.
3. Check the quote: **Price impact**, **Minimum received** and the route. Stock token pools are often thin, so a large order can move the price. Above 3% impact the app highlights it; above 15% you must confirm.
4. Confirm in your wallet. The stock token arrives in the same transaction.

Selling works the same way, with the stock token on the sell side.

## 5. Keep an eye on it

- Tap ☆ to add the stock to your watchlist. It shows on [Portfolio](https://stoadex.com/portfolio) and as quick picks above the swap form.
- **Alert** sets a price. Stoa tells you once the on-chain price reaches it, while Stoa is open in a tab or as the installed app.
- To sell at a set price instead of watching, use the **Limit** tab on Trade. See [Limit orders](limit-orders.md).

## Costs

- The pool's own fee (shown in the quote) and Stoa's router fee of 2 bps.
- Gas in ETH, a few cents at most.
- No account, no sign-up and no deposit into Stoa: the swap goes from your wallet through the router and back to your wallet.

## Common questions

**Why is there no Swap button on some stocks?** That token has no pool Stoa can use yet. Stoa's keeper looks for new stock token pools every day and adds the ones that are deep enough, so the list grows on its own.

**Why is the on-chain price different from the stock price?** The on-chain price comes from the token's own pool, which only moves when people trade it. The gap is usually smallest while the US market is open.

**Is a stock token the same as owning the share?** No. It is a token issued by Robinhood Assets (Jersey) Limited under its own terms. Read them before you buy.

See also: [Stock tokens](stocks.md), [Trade](trade.md), [Risks and safeguards](risks.md).
