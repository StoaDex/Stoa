# Stoa Pay

Ask to be paid in USDG on Robinhood Chain with a link. Whoever opens it can pay with what they hold: USDG, ETH, a stock token or any token Stoa routes on Robinhood Chain, or ETH on Base, Arbitrum, Optimism or Ethereum. You receive USDG.

Open [stoadex.com/pay](https://stoadex.com/pay).

## Ask for a payment

1. Enter the wallet that should receive the USDG (connect your wallet to fill it in), the amount (up to 10,000 USDG) and, if you like, a short note such as "Logo design".
2. Copy the link, share it, or show the QR code.

Nothing is stored. The link itself is the request: it carries your address, the amount and the note. Anyone with it can pay you; it never lets anyone take funds from you.

## Pay a request

Open the link and check the address with the person who sent it. Stoa does not know who an address belongs to.

**On Robinhood Chain**

- **USDG**: a plain transfer of the amount asked.
- **Any other token**: one swap through Stoa's router, paid straight to the requester. The swap's minimum is the amount asked, so they never get less. If the price moves before it lands so that they would, the swap does not go through and you keep your token. Any extra from the swap goes to them.

**From another chain**

Pick Base, Arbitrum, Optimism or Ethereum and pay with ETH there. Relay delivers the USDG on Robinhood Chain, usually in under a minute. Before your wallet opens, Stoa checks Relay's order: it must pay exactly the requester at least the amount asked, in USDG, on Robinhood Chain, refund only you, make no other calls and carry no hidden fee. Paying from another chain is limited to 500 USDG per payment for now.

Payments on-chain cannot be reversed.

## For apps

A payment link is a URL: `https://stoadex.com/pay?to=0x…&amount=25&note=Logo%20design` (amount in USDG, up to two decimals; the note is plain text up to 80 characters, links are removed). To build the swap yourself, the [HTTP API](api.md) quote takes an optional `recipient`: the swap pays it instead of the taker.
