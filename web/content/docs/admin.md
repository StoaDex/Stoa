# Admin and permissions

Who controls what in Stoa, and what nobody can do.

## Who holds the keys

| Role | Address | Type |
| --- | --- | --- |
| Owner of every Stoa contract | `0xeBa02cCc1f724Cd098fc20492EF9313e1ED2417B` | Timelock, **48 hours**, controlled by the admin Safe |
| Admin Safe (proposes and executes through the timelock) | `0xBF715C84b1C0759C87Da368c1476b80ac0C5055F` | Safe multisig, **2 of 3** |
| Router guardian (emergency pause only) | `0x5A63C75B38e7ee42220Cc3A57702E06D1D8903c9` | Wallet, also one of the Safe signers |
| Treasury (receives slashed bonds) | `0xDF129a523aEb072a2CEcbA50170eAb2fcB183C4c` | Wallet |

## The admin Safe

Every Stoa contract is owned by a 48-hour timelock (`0xeBa02cCc1f724Cd098fc20492EF9313e1ED2417B`, OpenZeppelin TimelockController), and only the admin Safe (v1.3.0, `0xBF715C84b1C0759C87Da368c1476b80ac0C5055F`) can schedule or run actions through it. Any admin action needs **2 of the Safe's 3 signers**, then waits **48 hours in public** before it can run:

| Signer | Address |
| --- | --- |
| Owner wallet | `0x5A63C75B38e7ee42220Cc3A57702E06D1D8903c9` |
| Deployer wallet | `0x056896d7d62fB4faE30f53d76CB55264f4c5c500` |
| Treasury wallet | `0xDF129a523aEb072a2CEcbA50170eAb2fcB183C4c` |

Ownership of the router, the maker pool, the maker registry, the fee distributor and the Uniswap V4 adapter moved to the Safe on 12 November 2026 ([transaction](https://elysium.kinetiq.xyz/tx/0xe4985bc225ae5d038b6e26fb61426065ca49f0fe2cdc8cce0efb94a5a98f0902)). You can check the owner of each contract on-chain at any time. The router's guardian stays a single wallet on purpose, so an emergency pause is never slowed down by collecting signatures. A guardian can pause swaps but cannot unpause them, move funds or change settings. Ownership uses a two-step transfer: a new owner has to accept, so it cannot be sent to a wrong address by mistake. Any change of owner is an on-chain event anyone can watch.

**Who holds the signers.** All three signer wallets are held by the Stoa team. The Safe protects against one key being leaked or lost; it is not a separation of power between independent parties. Adding an independent signer is planned.

**48-hour timelock.** Since 12 November 2026 every owner action, including withdrawing maker pool inventory, slashing a bond, approving a maker or adding a venue, must be scheduled on-chain and wait 48 hours before it can run. Anyone can see a scheduled action during that window. The timelock has no admin: only the Safe can schedule, run or cancel, and the delay itself can only change through the same 48-hour wait. Maker bonds take 3 days to withdraw, longer than the timelock, so a maker cannot leave before a slash lands.

The deployer wallet has no admin rights of its own; it is one of the three Safe signers and can act only together with a second signer.

## Robinhood Chain

Stoa on Robinhood Chain has the same setup, with its own contracts. They were deployed on 14 November 2026 by a fresh wallet that handed everything over in the same run and kept no rights:

| Role | Address | Type |
| --- | --- | --- |
| Owner of every Stoa contract | `0xAC75133729d6B5d615aA696d0828dC31fcB83ed8` | Timelock, **48 hours**, controlled by the admin Safe |
| Admin Safe | `0xa1a495484536c52046d07209C60059cf9613D386` | Safe multisig, **2 of 3**, the same three signers as on Elysium |
| Router guardian (emergency pause only) | `0x5A63C75B38e7ee42220Cc3A57702E06D1D8903c9` | Wallet, also one of the Safe signers |

The deployer briefly held timelock roles at a zero delay so the timelock could accept the contracts and raise its own delay to 48 hours; it then revoked every role it had, including admin. The Safe is the only proposer, executor and canceller. Maker bonds on Robinhood Chain also take 3 days to withdraw.

Adding Aero and Ramses on Robinhood Chain takes three Safe transactions, all from the **New venues** panel of the admin page: schedule (the router's propose and execute are queued in the timelock together), propose after 48 hours, then add them after the router's 24-hour wait. Each step needs two of the three signers, and anyone can follow it on-chain in the timelock. The Uniswap V4 adapter's allowed hooks are fixed in its code and cannot be changed by anyone.

## What the owner can do

| Power | Limit |
| --- | --- |
| Add a new venue (pool or adapter) to the router | 48 hours through the timelock, then the router's own 24-hour wait: 72 hours in public before it can go live. The setup phase is locked, so there is no shortcut. |
| Remove a venue | 48 hours through the timelock. To stop a venue at once, the guardian pauses the router. |
| Pause swaps | Instant, by the owner or the guardian. Only the owner can unpause. |
| Approve or remove makers on a pool | Makers also need a bond of at least **10 HYPE** to quote. |
| Slash a maker's bond | Sends the slashed HYPE to the treasury, after the 48-hour wait. Used when a maker posts abusive quotes. |
| Set the per-swap cap on a maker pool | Currently **$500** per swap on WHYPE/USDC. |
| Withdraw pool inventory | Maker pool inventory is supplied by Stoa today, not by outside depositors. |
| Set the referral share | Currently **10%** of the protocol fee. |
| Withdraw protocol fees | Only the protocol's share; referral earnings are claimable only by the referrer. On Robinhood Chain, from 17 November 2026, nobody can: the FeeDistributor is owned by StoaBuyback, which can only turn protocol fees into burned $STOA (see [$STOA](token.md)). |

Pool settings (how long quotes stay valid, the pool fee within its hard maximum of 0.30%, the quote check) belong to the *pool guardian*, which is the maker registry's owner: the timelock. Changing them waits 48 hours in public like every other owner action. The router guardian wallet has exactly one power: pausing the router.

## What nobody can do

- **Upgrade the code.** No contract is upgradeable. The code verified on [Sourcify](https://repo.sourcify.dev/99901/0x104752D50ef893da579Ad813918269e09Ea17dbA) is the code that runs.
- **Move funds from your wallet.** The router only pulls the exact amount of the swap you sign, from you, inside that swap. The app approves only that amount unless you opt in to more.
- **Hold your funds between swaps.** The router finishes every swap in one transaction and checks what you received against your minimum.
- **Add a Uniswap V4 hook.** Only pools whose hooks are on the allowlist fixed at deployment can be added.
- **Take referral earnings.** They are claimable only by the referrer's own address.

## Settings at a glance

| Setting | Value |
| --- | --- |
| New-venue waiting period | 72 hours (48 h timelock + 24 h router wait) |
| Maker minimum bond | 10 HYPE |
| Maker bond withdrawal delay | 3 days |
| Delay on every admin action | 48 hours (timelock) |
| Per-swap cap on maker pools | $500 |
| Protocol fee | 2 bps |
| Referral share | 10% of the protocol fee |

All values can be read on-chain from the contracts listed in [Contract addresses](contracts.md).
