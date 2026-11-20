# How to bridge to Robinhood Chain

To trade on Robinhood Chain you need funds there: a little ETH for gas, and ETH or USDG to swap. If your funds are on another chain, Stoa's **Bridge in** page moves them over and hands you straight to Trade. Routes come from LI.FI over Across, the one bridge whose LI.FI call names the receiver in the transaction itself, so Stoa can check it before you sign.

## 1. Open Bridge in

Go to [stoadex.com/bridge](https://stoadex.com/bridge) and connect your wallet. Any EVM wallet works (MetaMask, Rabby, OKX, Coinbase Wallet and others).

## 2. Pick where the funds are

Choose the source chain and token:

| From | Tokens |
| --- | --- |
| Base | ETH, USDC |
| Arbitrum | ETH, USDC, USDT0 |
| Ethereum | ETH, USDC, USDT |
| Optimism | ETH, USDC |

A few pairs have no checkable route (for example USDC on Optimism to ETH, or anything from BNB Chain to USDG). Bridge ETH or USDG instead, then swap on Stoa.
| BNB Chain | USDT, USDC |

Then choose what should arrive on Robinhood Chain: **ETH** (gas and most pairs) or **USDG** (the stablecoin most stock-token pools use).

## 3. Check the quote

Enter an amount. Stoa asks LI.FI for a route for this wallet and shows what it delivers:

- **You receive at least**: the minimum after slippage. The transfer does not settle for less.
- **Bridge fees**: the bridge's and LI.FI's fees, in dollars, plus the source-chain gas. Stoa adds no fee to a bridge.
- **Arrives in**: the route's own estimate.
- **Bridge**: which bridge carries this transfer.

## 4. Sign on the source chain

Stoa switches your wallet to the source chain. A token needs an **approve** first (for exactly the amount you send), then the **bridge** transaction. Both go to LI.FI's contract `0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE` from your own wallet, and Stoa never holds the funds. Before your wallet opens, Stoa decodes the bridge transaction and refuses it unless it sends exactly the token and amount you picked, to your own address on Robinhood Chain (with refunds to you too), that the token you picked is what arrives and the bridge must deliver at least the minimum on screen, and that it asks for no more ETH than you typed. If the quote has to be refreshed and the new minimum is more than 0.5% lower, Stoa stops and shows it before you sign.

Bridge in works with regular wallets. A smart-contract wallet (a Safe or a smart account) may not control the same address on Robinhood Chain, so Stoa stops before sending from one.

## 5. Swap on Stoa

When the transfer lands, the funds are in the same address on Robinhood Chain. Tap **Swap on Stoa** to go to [Trade](https://stoadex.com/trade?chain=robinhood) with them selected. Keep a little ETH for gas.

Only want $STOA? Skip the bridge and swap: [Buy $STOA from any chain](https://stoadex.com/token#anychain) pays on the source chain and delivers $STOA on Robinhood Chain in one step (up to $500 per purchase for now). See [How to buy $STOA](buy-stoa.md).

## If something looks wrong

- The page shows the source transaction and a tracking link while the transfer is on its way. You can close the page; the funds still arrive.
- If a route cannot complete, the bridge refunds on the source chain. Check the tracking link before you try again.
