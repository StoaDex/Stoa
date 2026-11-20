# Embed a swap widget or buy button

Put Stoa on your token's website, and earn 10% of Stoa's fee on the swaps it brings. There are two embeds: the **swap widget**, where visitors type an amount and see a live quote, and the smaller **buy card**.

## Swap widget

Make yours on [stoadex.com/build/widget](https://stoadex.com/build/widget): pick the token, what visitors pay with, light or dark, and your wallet for the referral, then copy the code. It looks like this:

```html
<iframe src="https://stoadex.com/embed/swap/robinhood/<token address>?pay=ETH&ref=<your wallet>"
  width="100%" height="330" style="max-width:420px;border:0;border-radius:16px"
  title="Swap on Stoa" loading="lazy"></iframe>
```

| Parameter | Value |
| --- | --- |
| Token address | $STOA, a token listed under [Tokens](https://stoadex.com/tokens), a Robinhood Stock Token Stoa routes, or a Pons launch Stoa routes |
| `pay` | `ETH` or `USDG`: what the widget starts with. Visitors can switch |
| `amount` | Optional. The amount it starts with, such as `0.01` |
| `theme` | Optional. `dark` for a dark widget; light by default |
| `ref` | Optional. Your wallet address: swaps made through the widget pay you the referral share |

The visitor types an amount and the widget asks Stoa's router for the best route across every venue it uses, refreshed every 20 seconds. **Swap on Stoa** opens stoadex.com in a new tab with the same tokens and amount filled in; the visitor checks the quote and confirms there, in their own wallet. Nothing is signed inside the widget.

Tokens Stoa does not list or route get a short notice instead of a widget.

## Buy card

A small card with the token's price and 24-hour change, what a small buy gets on Stoa right now and on which venue, and a **Buy on Stoa** button. The button opens Stoa in a new tab with the token selected and your referral attached. No wallet connects inside the card, so it cannot ask your visitors to sign anything.

The price comes from DexScreener and the route is read live from Stoa's router. Both refresh every minute.

### Pons launches

A Pons launch gets its own card: price, creator tax, and how far its curve is from graduation (or that it has graduated to Uniswap V4). The button opens Stoa with the launch selected, so it can be bought on its curve from day one. Launch cards are marked as unverified: Stoa does not review launches.

### Add the buy card

Open the token's page under [Tokens](https://stoadex.com/tokens) (or a launch's page under [Launches](https://stoadex.com/launches)), connect your wallet and press **Copy embed code**. The code carries your wallet as the referrer. It looks like this:

```html
<iframe src="https://stoadex.com/embed/robinhood/<token address>?ref=<your wallet>"
  width="100%" height="230" style="max-width:420px;border:0;border-radius:16px"
  title="Buy on Stoa" loading="lazy"></iframe>
```

| Part | Value |
| --- | --- |
| Network | `robinhood` or `elysium` |
| Token address | Any token listed under [Tokens](https://stoadex.com/tokens), $STOA (`0x13E6993417616De724F2b337D65063f229e96718`), or any Pons launch on Robinhood Chain |
| `ref` | Optional. Your wallet address: swaps made through the card pay you the referral share |
| Size | 230 px high fits the card; any width from about 300 px |

## What you earn

The same as any referral link: 10% of the 2 bps protocol fee on each swap made through the card, booked to your address in the FeeDistributor and claimable on [Referrals](https://stoadex.com/referrals). See [Referrals](referrals.md).

## Not an endorsement

The card is an open tool: any project can put it on its own site, and showing it is not an endorsement or partnership from Stoa. Before you buy any token, check it on [Check](https://stoadex.com/check).

## Safety

- Only `/embed` pages can be framed by other sites. Every other Stoa page refuses to load in a frame.
- Neither the widget nor the card connects a wallet or asks for a signature. Trading happens on stoadex.com, in its own tab.
- Listed tokens are not reviewed by Stoa. The card shows the token's contract on its page: check it before you promote a token.
