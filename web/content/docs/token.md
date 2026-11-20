# $STOA

$STOA is Stoa's official token, launched on [Pons](https://ponsfamily.com/launchpad/0x13E6993417616De724F2b337D65063f229e96718) on Robinhood Chain: `0x13E6993417616De724F2b337D65063f229e96718`. It has four jobs, all enforced by contracts. Live numbers are on the [$STOA page](https://stoadex.com/token).

## 1. Protocol fees buy and burn $STOA

Every swap through Stoa on Robinhood Chain pays a 2 bps protocol fee to the FeeDistributor (referrers keep their 10% share). The FeeDistributor is owned by **StoaBuyback**, a contract with one way to move protocol fees out: swap them into $STOA through the Stoa router and send the $STOA to the burn address `0x…dEaD`, in the same transaction.

- **Every Monday** a keeper wallet runs the buyback for each fee token worth at least $1 that has a route to $STOA. Smaller amounts wait for the next week. Fees that are already $STOA are burned without a swap.
- The keeper only chooses the route and a minimum output. Its script allows 2% slippage; the contract itself does not cap it, so a leaked keeper key could buy at a bad price (see L-4 in the [security review](security-review.md)). It cannot send fees anywhere else: the contract does not allow it.
- The buyback swap pays the normal 2 bps fee, in $STOA, which the next run burns too.
- $STOA graduated from its Pons bonding curve on 15 November 2026, so the buyback buys it from its Uniswap V4 pool, which Stoa routes. A buy there pays the pool's 2.8% Pons fee, the same rate as on the curve.
- The owner (the 48-hour timelock) keeps the FeeDistributor's other settings, such as the referral share, through StoaBuyback. It cannot withdraw protocol fees. Changing the policy itself would mean handing the FeeDistributor to a different contract, a public 48-hour timelock action like every other.

Every buyback emits `BoughtAndBurned(token, amountIn, stoaBurned)`, and `totalBurned()` on StoaBuyback adds them up.

The handover of the FeeDistributor to StoaBuyback was scheduled in the timelock on 15 November 2026 ([transaction](https://robinhoodchain.blockscout.com/tx/0xcde838eaf0c90199f58053964acf903f6d69853fce3b07681125546d0ccc7c07)) and executed after the 48-hour delay, on 17 November 2026 ([transaction](https://robinhoodchain.blockscout.com/tx/0xef3052b0a8b03974ca69ea098181a3863fdbaa9b924498c5e3ec55eeddf5859c)): StoaBuyback now owns the FeeDistributor. The keeper runs every Monday at 13:41 UTC, and fees collected before the handover are included in its first run.

Today this covers Robinhood Chain, where $STOA lives. Fees on Elysium stay in Elysium's FeeDistributor.

## 2. Makers bond $STOA

Stoa maker pools on Robinhood Chain are quoted by makers who bond $STOA in the **BondRegistry**.

- One bond per maker covers all its pools. A maker can quote a pool while the owner has approved it for that pool and its bond is at least the pool's minimum.
- A maker that posts abusive quotes can be **slashed**. Slashed $STOA is **burned**, not sent to anyone.
- Withdrawing a bond takes **3 days**, longer than the 48-hour timelock, so a slash always lands before a maker can leave.
- Bonding opens with the first Robinhood Chain maker pool. A bond earns nothing by itself: it only lets an approved maker quote. To run a pool, see [Become a curator](become-a-curator.md).

## 3. Holders vote in Spotlight

From 23 November 2026, projects bid ETH every week for three sponsored slots on Stoa. Holders lock $STOA in **SpotlightMarket** and vote. The three largest bids with at least 1M $STOA of votes win: 90% of each goes to the holders who voted for it, and 10%, plus every entry fee, buys $STOA and burns it. Losing bids are refunded. Rules, numbers and risks: [Spotlight](spotlight.md).

## 4. Backers earn from Rug Cover

In [Rug Cover](rug-cover.md), a Pons token's creator bonds ETH behind a promise not to sell or move the tokens in their wallet, and pays a fee. Holders who lock $STOA in **RugCover** as backers receive 90% of those creator fees and of bonds forfeited in a breach, in ETH, paid out over 7 days. Locked $STOA is never used to pay a claim. Buyer premiums are not shared: every premium buys $STOA and burns it, together with 10% of the creator income.

## Where to track it

The [$STOA page](https://stoadex.com/token) opens with **$STOA at a glance**, read live from the chain: total supply, burned, circulating, $STOA locked by holders (Spotlight, Rug Cover and maker bonds), the team and launch wallets' share, and the next weekly buyback with the fees waiting for it. [This week on Stoa](https://stoadex.com/weekly) shows each week's volume, buybacks, Spotlight and releases.

$STOA is listed on [CoinGecko](https://www.coingecko.com/en/coins/stoa) (since 17 November 2026) and [GeckoTerminal](https://www.geckoterminal.com/robinhood/tokens/0x13e6993417616de724f2b337d65063f229e96718), and its pool is on [DexScreener](https://dexscreener.com/robinhood/0x3cf63de2530870232ec7075aec62ca539031c3c5a17dba5e016771238bf64180). Their supply figures come from the endpoints below.

## Supply

$STOA has a fixed supply of 1,000,000,000, all minted at launch on Pons. Nothing can mint more. There was no presale and no team allocation: every token started on the Pons bonding curve, and the team bought its 0.68% there like everyone else (see [Team wallet](#team-wallet)).

- **Total supply** is everything minted minus what sits at the burn address `0x…dEaD`.
- **Circulating supply** is the total supply minus the unsold $STOA still on the Pons bonding curve. When the curve graduates, that $STOA moves into the Uniswap V4 pool and counts as circulating.

The numbers are read from Robinhood Chain every 5 minutes and served for trackers and anyone else:

| Endpoint | Returns |
| --- | --- |
| [`/api/stoa/supply`](https://stoadex.com/api/stoa/supply) | JSON: max, total, circulating, burned, on the curve, curve progress |
| [`/api/stoa/total-supply`](https://stoadex.com/api/stoa/total-supply) | Total supply as a plain number |
| [`/api/stoa/circulating-supply`](https://stoadex.com/api/stoa/circulating-supply) | Circulating supply as a plain number |

## Team wallet

Stoa's team account on [fomo](https://fomo.family), @StoaDex, holds $STOA at `0xfe6f7c6e2ad2c3594fe7fb61c28c4499bbb83bf0`. fomo gives a token's team a team tag, so holders on fomo see updates straight from the team, only if the team's fomo account holds at least 0.5% of supply. Stoa's team tag was granted on 15 November 2026. The team bought 6.8M $STOA (0.68%) on the Pons curve with 0.1 ETH on 15 November 2026 ([transaction](https://robinhoodchain.blockscout.com/tx/0xbf4ca2f6bff0c6124ebafe82eaca82faf873248e3d027322182efb60f49d7bf3)) and keeps at least 0.5% there while the tag is active. The live balance is on the [$STOA page](https://stoadex.com/token).

The dev wallet that launched $STOA on Pons, `0x8dac20c0fe1c59d337808f234921a89ee0c1346a`, burned every $STOA it received: 22.0M (2.2% of supply) sent to the burn address `0x…dEaD` in 12 transfers between 14 and 17 November 2026. It holds none today.

## What $STOA is not

- **Not a share of fees.** Protocol fees burn $STOA. Holders are not paid from Stoa's fees.
- **Not a promised yield.** Bonding earns nothing by itself and can be slashed. Spotlight voters are paid only from what projects bid, and Rug Cover backers only from what creators pay or forfeit; either can be nothing in a given week.
- **Not audited yet.** StoaBuyback and BondRegistry are source-verified on Sourcify, like every Stoa contract, and covered by unit and fork tests. They have not had an external audit.

## Contracts (Robinhood Chain)

| Contract | Address |
| --- | --- |
| $STOA | [`0x13E6993417616De724F2b337D65063f229e96718`](https://robinhoodchain.blockscout.com/address/0x13E6993417616De724F2b337D65063f229e96718) |
| StoaBuyback | [`0x2Eb53EBA6f04447d9ce03B4AfB421887239ae244`](https://robinhoodchain.blockscout.com/address/0x2Eb53EBA6f04447d9ce03B4AfB421887239ae244) |
| BondRegistry | [`0x7eD43F104f9317578806De89e9d478D297d468D4`](https://robinhoodchain.blockscout.com/address/0x7eD43F104f9317578806De89e9d478D297d468D4) |
| FeeDistributor | [`0x76c30317bB8C0bC47E2aC5D83b329FE9F386F4e7`](https://robinhoodchain.blockscout.com/address/0x76c30317bB8C0bC47E2aC5D83b329FE9F386F4e7) |
| SpotlightMarket | [`0xf3A995D4240c0F36da697E5292B294052a1706B5`](https://robinhoodchain.blockscout.com/address/0xf3A995D4240c0F36da697E5292B294052a1706B5) |
| RugCover | [`0x64498e94fEaC6750885818e5EE7921042395B301`](https://robinhoodchain.blockscout.com/address/0x64498e94fEaC6750885818e5EE7921042395B301) |

Both new contracts are owned by the 48-hour timelock and verified on [Sourcify](https://repo.sourcify.dev/4663/0x2Eb53EBA6f04447d9ce03B4AfB421887239ae244) (exact match).
