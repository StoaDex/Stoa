# Referrals

Earn 10% of the protocol fee on swaps from people you refer.

## How it works

1. Connect a wallet on [Referrals](https://stoadex.com/referrals) to get your link: `stoadex.com/trade?ref=<your address>`.
2. Share it, or press **Share** next to any token on [Launches](https://stoadex.com/launches) or on a token's own page: those links carry your referral too. When someone opens Stoa through your link, their browser remembers you as their referrer, and every swap they make in the app names your address on-chain.
3. Your share is recorded by the FeeDistributor contract on every one of those swaps.

## How you get paid

| Item | Detail |
| --- | --- |
| Your share | 10% of the 2 bps protocol fee: 0.2 bps of the swap, about $0.02 per $1,000 swapped |
| Paid in | The token the trader received, for example USDC on a HYPE to USDC swap, USDG on an ETH to USDG swap, or the token itself when someone buys a Pons launch. Referrals lists every token you have earned in |
| Networks | Elysium and Robinhood Chain, one link for both. Earnings are kept per network: switch network on Referrals to see and claim each |
| Where it sits | In the FeeDistributor contract, booked to your address |
| How to claim | Press **Claim** on [Referrals](https://stoadex.com/referrals) or Portfolio, any time, to any address you choose. You pay only the gas |
| Minimum | None |
| Who can claim | Only your own wallet. The admin cannot take referral earnings |

## Invite card

On [Referrals](https://stoadex.com/referrals), **Post on X** or **Copy invite link** shares `stoadex.com/r/<your wallet>`. It works like your referral link (the visitor's browser remembers you) and, when posted, shows an invite image with your short address. Swaps made through it also give you 10% of their [Points](points.md).

You cannot refer yourself in the app: a link with your own address is ignored. Earnings are visible on-chain before you claim.

## Top referrers

[Referrals](https://stoadex.com/referrals) ranks referrers by the volume of the swaps their links brought in, on both networks, read from the routers' `Routed` events: swaps, total volume, the last 7 days and an estimate of what each earned (10% of the 2 bps fee, so about 0.002% of the volume). Connect your wallet to see your own row highlighted.

## Integrator bonus

From December 2026, apps that send swaps through Stoa get a monthly bonus on top of the 10% share.

| Item | Detail |
| --- | --- |
| Who | Anyone whose bot, wallet, widget, agent or app names their address as `referrer` |
| Test | At least 10 different wallets swap $1 or more through your address in a UTC month. Your own wallet does not count |
| Bonus | $10 USDG for that month |
| Slots | Up to 5 integrators a month, ranked by wallets, then volume |
| Paid | By Stoa on Robinhood Chain in the first week of the next month, after a check for wash trading |
| Where to see it | The **Wallets · month** column on [Referrals](https://stoadex.com/referrals) |

The bonus is paid from Stoa's treasury, not by a contract: the board shows who qualifies, and the payment transactions are public on Robinhood Chain.
