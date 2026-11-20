# Rug Cover

A Pons token's creator puts ETH behind a promise not to sell or move the tokens in their wallet. If you buy that token through Stoa with cover and the creator's wallet drops below its promise before the creator takes the bond back, you claim the ETH you spent, from their bond. You keep the tokens. Everything runs on [stoadex.com/cover](https://stoadex.com/cover), on Trade and on each token's Launches page.

Rug Cover is a contract with fixed rules, not insurance. It pays what the rules below say, from the creator's bond, and nothing else.

## Why only the creator wallet

The most common rug on Pons is the creator selling the tokens they bought at launch. Of 60 recent Pons launches checked on-chain on 15 November 2026, 52 creators bought between 0.57% and 10% of supply in the launch, and 47 of them had since sold or moved almost all of it. Rug Cover makes that one pattern expensive, and checks it with a single on-chain read: the token balance of the creator's wallet.

## How a cover runs

1. **The creator opens a cover.** Only the wallet the Pons factory records as the token's creator can open one. It sends a bond in ETH plus a fee. The floor is the wallet's whole balance of the token at that moment, at least 0.5% of supply.
2. **Buyers buy with cover.** On Trade, a token with an open cover shows "Buy with Rug Cover". You pay with ETH plus a 1% premium. The ETH that goes into the swap is your cover. The swap is a normal Stoa swap to your wallet, with your slippage limit.
3. **If the creator's wallet drops below the floor,** at any moment before the bond is released, anyone can trigger the breach and earns 1% of the bond for it. Stoa's keeper checks every open cover about every 5 minutes. Each covered buyer then claims their cover in ETH.
4. **If the floor holds,** the creator can release the bond from 24 hours after the term ends, and the cover ends. A dump in the last minute of the term is still visible during those 24 hours and can be breached.

Selling and moving count the same: a transfer to another wallet, to a pool or to the burn address also lowers the balance. Tokens the creator buys after opening can be sold, as long as the balance stays at or above the floor.

## Who pays and who gets what

| Who | Pays | Gets |
| --- | --- | --- |
| Creator | A bond (back after the term if the floor holds) and a fee of 2% of the bond | A "Covered" badge on Trade, Launches, Tokens and the token's page |
| Buyer | A premium of 1% of the ETH spent | If the creator breaches before release: all the ETH spent, and the tokens stay theirs |
| $STOA backer | Locks $STOA (7-day unlock) | 90% of creator fees and of forfeited bonds, in ETH, paid out over 7 days |
| Burn | — | Every buyer premium, plus 10% of creator fees and forfeited bonds, buys $STOA and burns it |

**On a breach** the bond is split in this order: covered buyers first (at most 75% of the bond), then 1% to whoever triggered the breach, then the rest: 90% to backers and 10% to the burn.

**Backers never pay for a breach.** Locked $STOA is never used to pay anyone. Backers only receive ETH that creators paid. Buyer premiums are not shared with backers: they are burned.

**Cover follows the purchase, not the balance.** A buyer who already sold the tokens is still paid if the creator breaches before release. The money always comes from the bond of the creator who broke the promise.

## The numbers

| Rule | Beta value | Contract limit |
| --- | --- | --- |
| Bond per token | 0.05 to 1 ETH | at most 10 ETH |
| All open bonds together | at most 20 ETH | raised only through the timelock |
| Term | 7 days, release from 24 hours after | 2 to 30 days |
| Floor | the creator's whole balance when the cover opens, at least 0.5% of supply | — |
| Creator fee | 2% of the bond per term, at least 0.002 ETH | at most 10% |
| Cover a term can sell | 75% of the bond | at most 75% |
| Buyer premium | 1% of the ETH spent | at most 5% |
| One covered buy | 0.005 to 0.25 ETH | — |
| One wallet's cover on a token | at most 25% of what the term can sell | — |
| Covered buys stop | 24 hours before the term ends | — |
| Breach bounty | 1% of the bond | at most 2% |
| Burn share | 10% of creator fees and forfeited bonds | 10% to 20% |
| Backer unlock | 7 days; locked $STOA stops earning as soon as an unlock is requested | — |

Example: a creator bonds 0.5 ETH and pays a 0.01 ETH fee. Buyers can buy up to 0.375 ETH of cover. A buyer who spends 0.1 ETH pays a 0.001 ETH premium, and if the creator dumps before release, claims 0.1 ETH.

Changes go through the 48-hour timelock and apply only to covers opened afterwards. An open cover keeps the rules it opened with.

## What is not covered

- **Other wallets of the creator.** Only the wallet that launched the token on Pons counts. Tokens it moved to other wallets before the cover opened are not part of the promise; the token's page shows what the creator wallet bought in the token's first minute and how much of it is gone.
- **The price falling because other holders sell.** That is not a rug by this rule.
- **Buys without cover,** buys made before the cover opened, and buys of tokens with no open cover.
- **Tokens not launched on Pons.** Only Pons launches can be covered.

## Safety

- **The creator always loses on a self-rug.** A creator who buys all the cover from their own wallets and then dumps gets back at most 75% of the bond plus the 1% bounty, and loses the rest, the fee, the premiums and the Pons fees. Even as the only backer they lose money, because at least 10% is always burned. A fuzz test checks this.
- **Cover can never exceed the bond.** A covered buy that would go past the term's capacity or a wallet's limit reverts: a buy is covered in full or not at all, and the app says so before you sign.
- **No oracle.** Cover is fixed in ETH when you buy, so no price can be pushed to inflate a claim.
- **Nobody can take the money.** The contract has no function that sends ETH or $STOA anywhere except to a buyer, a creator, a backer, the breach caller or the burn. It is owned by the 48-hour timelock.
- **Pause without trapping funds.** The guardian can pause new covers, covered buys and locks. Claims, breaches, releases, unlocks and ETH claims keep working, and backers can take their $STOA out at once during a pause. Only the timelock can unpause.
- **The burn cannot be sandwiched cheaply.** Only the keeper (or the timelock) spends the burn pot on $STOA, with a minimum output from a fresh quote, the same rule as the weekly buyback and Spotlight.
- **Beta caps.** At most 1 ETH of bond per token and 20 ETH in all.
- **No formal audit yet.** RugCover is in Hey Research Lab's independent security review (since 16 Nov 2026) and is covered by unit, attack, fuzz and fork tests and Slither; see [Security review](security-review.md).

## Contract

`RugCover` on Robinhood Chain: [`0x64498e94fEaC6750885818e5EE7921042395B301`](https://robinhoodchain.blockscout.com/address/0x64498e94fEaC6750885818e5EE7921042395B301). The address is fixed by CREATE2 before deployment, through the standard deterministic deployer; the app switches Rug Cover on only once the contract's code is at that address. It is owned by the 48-hour timelock from its constructor, with the router's guardian and the buyback keeper. Source: [contracts/src/RugCover.sol](https://github.com/StoaDex/Stoa/blob/main/contracts/src/RugCover.sol).
