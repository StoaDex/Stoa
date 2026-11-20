# How to check a token before you buy on Robinhood Chain

Anyone can launch a token on Robinhood Chain in a minute, and some are built to take your money: copies of a real project's name, tokens you can buy but never sell, hidden taxes, or a creator who dumps right after launch. This guide shows what to check before you buy, using Stoa's free tools and the public explorer.

## 1. Make sure it's the right token

Fake tokens often copy a real name and ticker. The ticker proves nothing; only the contract address does.

- Get the address from the project itself: its website or its X account. Never from a reply, a DM or a random chart link.
- On Stoa, the token picker shows where a token came from: **Pons launch**, **Official Stoa token** (the one real $STOA), or **Unverified** for anything else, including tokens you paste by address.
- Open the address on [robinhoodchain.blockscout.com](https://robinhoodchain.blockscout.com) and check that its name, holder count and age look right. A days-old copy of a well-known name is a warning sign.

## 2. Run the safety check

Paste any address on [stoadex.com/check](https://stoadex.com/check), or buy an unverified token on [Trade](https://stoadex.com/trade?chain=robinhood), where Stoa runs the same safety check first. Every Pons token's page on [Launches](https://stoadex.com/launches) shows the same check. It **simulates** buying a small amount through the live router and selling it straight back, on the chain as it is now. Nothing is sent and it costs nothing.

| Result | What it means |
| --- | --- |
| **Passed** | The test buy and the test sell both worked, with no hidden tax and no warning on who holds the supply |
| **Caution** | It trades, but something needs a look: a tax of 1% to 10% on the buy or the sell, a creator wallet with 10% of supply or more, or ten wallets holding half the supply or more |
| **Risky** | The test sell failed right after a test buy (you may not be able to sell), or a buy or sell pays at least 10% less than its quote (a hidden tax) |
| **Not checked** | Stoa has no route to test it, or the test could not finish. This is not a pass: be extra careful |

The check also shows the round-trip cost (buying and selling back at once, pool fees and price impact included), how much of the supply the creator's wallet holds for Pons launches, and how much the ten largest wallets hold.

{% hint style="warning" %}

A pass only describes the token today. If its owner can still change the rules, they can add a tax or block sells later. Only buy what you can afford to lose.

{% endhint %}

## 3. Look at who holds the supply

The most common rug on new launches isn't a trick in the code. It's the creator selling. When Stoa checked 60 recent Pons launches on 15 November 2026, 52 creators had bought a slice of supply at launch, and 47 of them had since sold or moved almost all of it.

- **Creator's wallet**: shown in the safety check for Pons launches. A big share means one wallet can crash the price.
- **Ten largest wallets**: shown in the safety check. Pools and burn addresses can be among them, so check the list on the explorer's Holders tab.
- **Liquidity**: a Pons token that graduated trades in a Uniswap V4 pool with locked liquidity. For other tokens, check the pool on the explorer or on [Pools](https://stoadex.com/pools?chain=robinhood): a pool with very little in it means a big price impact, and a pool the creator can withdraw is a risk of its own.

## 4. Prefer tokens with a Covered badge

With [Rug Cover](rug-cover.md), a Pons token's creator locks ETH behind a promise not to sell or move the tokens in their wallet. Those tokens show a **Covered** badge on Trade, Launches and the token's page.

If you buy with **Buy with Rug Cover** (1% premium) and the creator's wallet drops below its promise before the bond is released, you claim back the ETH you spent from their bond, and you keep the tokens. It's a contract with fixed rules, not insurance: it covers the creator selling, not other risks, and it pays from the bond only.

## 5. Set limits when you buy

- Keep **slippage** low (0.1%, 0.5% or 1%). If the price moves more than that, the swap reverts and you only lose gas.
- Watch **price impact**. Stoa highlights it above 3% and asks you to confirm above 15%.
- Approve **only the amount** you sell, which is Stoa's default. An unlimited approval can be turned on in settings, but you don't need it.
- Start small with a new token, and check that you can sell a little before you add more.

## Quick checklist

1. Address from the project's own site or X account, not from a reply or DM.
2. Safety check says **Passed**, or you understand every Caution note.
3. Creator and top ten wallets don't hold so much they can crash the price.
4. Enough liquidity for your size (price impact under a few percent).
5. Bonus: a **Covered** badge, bought with Rug Cover.

See also: [How to swap on Robinhood Chain](swap-robinhood-chain.md), [Trade](trade.md), [Risks and safeguards](risks.md).
