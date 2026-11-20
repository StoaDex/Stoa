# How to swap on Robinhood Chain

A first-time guide to swapping tokens on Robinhood Chain with Stoa: setting up the network, getting ETH for gas, making the swap and checking a token before you buy it.

## Robinhood Chain in short

| | |
| --- | --- |
| What it is | An Ethereum Layer 2 built on Arbitrum, run by Robinhood |
| Chain ID | 4663 |
| Gas | Paid in ETH |
| Public RPC | `https://rpc.mainnet.chain.robinhood.com` |
| Explorer | [robinhoodchain.blockscout.com](https://robinhoodchain.blockscout.com) |

## 1. Connect a wallet

Open [stoadex.com/trade?chain=robinhood](https://stoadex.com/trade?chain=robinhood) and press **Connect wallet**. Any EVM wallet works. If your wallet doesn't know Robinhood Chain yet, Stoa asks it to add the network. You can also install Stoa as an app: **Install the app** at the bottom of any page on Android and desktop Chrome or Edge, or **Add to Home Screen** from Safari's Share menu on iPhone.

## 2. Get ETH on the chain

You need a little ETH on Robinhood Chain for gas. A swap costs a few cents at most. Bring it in with the Arbitrum canonical bridge or a partner bridge listed in [Robinhood Chain's bridging docs](https://docs.robinhood.com/chain/bridging/). Only use links from those docs.

## 3. Make the swap

1. Pick the token you sell and the token you buy. ETH works directly: the router wraps and unwraps it for you.
2. Enter the amount. Stoa's router compares every venue it uses on Robinhood Chain, directly and through WETH, and shows the route it found under the quote.
   Under the details, **Second opinion** shows what other routers (0x and 1inch) quote for the same amount right now, so you can compare. Stoa only shows their prices; your swap always goes through Stoa's router.
3. Check **Price impact**, **Minimum received** and slippage (0.1%, 0.5% or 1%). If the fill would be worse than your slippage allows, the swap reverts and you only pay gas.
4. The first time you sell a token, your wallet asks for an approval of **only that amount**.
5. Confirm. The tokens arrive in the same transaction.

## 4. Check a token before you buy it

Anyone can launch a token on Robinhood Chain, including fakes that copy a real name. Before you buy something new:

- **Check the address.** The token picker marks where a token came from (for example a Pons launch, or the official $STOA). Anything else shows as **Unverified**. Compare the address with the project's own site or X account.
- **Read the safety check.** When you buy an unverified token, Trade first simulates buying a little and selling it straight back. It tells you whether you could sell, any hidden tax on the buy or the sell, the round-trip cost, and how much of the supply the creator and the ten largest wallets hold. A pass only describes the token today: its owner can still change the rules.
- **Look for the Covered badge.** Some token creators lock ETH in [Rug Cover](rug-cover.md) as a promise not to sell their launch tokens. If they do sell, buyers who bought with cover are paid from that bond.

More on each step: [How to check a token before you buy](check-token-robinhood-chain.md).

## 5. Beyond a simple swap

- **Limit orders**: sell at a price you set, filled by Stoa's keeper when the market gets there. See [How to set a limit order on Robinhood Chain](limit-order-robinhood-chain.md).
- **Stock tokens**: tokens that follow US shares, with Robinhood's price next to the on-chain price. See [How to buy stock tokens](buy-stock-tokens.md).
- **New launches**: Pons tokens, on their bonding curve or after graduation. See [Trade Pons tokens](trade-pons.md).
- **Portfolio**: your balances and watchlist in one place. See [Portfolio](portfolio.md).

## Costs

The pool's fee (already in the quote), Stoa's router fee of 2 bps, and gas in ETH. There is no sign-up and no deposit into Stoa.

## If something goes wrong

- **"No route"**: the router has no pool for that pair yet. Try buying through ETH or USDG, or check whether the token trades in a pool Stoa doesn't use yet (the swap screen says so).
- **The swap reverted**: the price moved more than your slippage while the transaction was pending. Nothing was swapped. Try again, or raise slippage a little for volatile tokens.
- **The token doesn't show in your wallet**: add it by its address, which you can copy from the token picker or the explorer.

See also: [Trade](trade.md), [Risks and safeguards](risks.md), [FAQ](faq.md).
