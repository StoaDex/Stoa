# Internal security review

A review of the deployed contracts by the Stoa team, published in full. **This is not an external audit.** An independent audit is still planned before caps rise or vaults open.

**Independent security review under way.** Since 16 November 2026, [Hey Research Lab](https://x.com/HeyResearch) is reviewing RugCover, SpotlightMarket, StoaLimit and StoaRouter at commit [`c524b82`](https://github.com/StoaDex/Stoa/tree/c524b82/contracts), the code the live contracts run. It is a review, not an audit. Findings come to Stoa privately first, with a test, and are published here once fixed. The scope, build steps and known issues are in [contracts/AUDIT.md](https://github.com/StoaDex/Stoa/blob/main/contracts/AUDIT.md).

## Update, 20 November 2026: RugCover floor above uint128

### I-19 A creator balance above 2^128 would store a truncated floor

**Status: not reachable; hardened in the app; fix in the next RugCover version.** Severity: Informational. Reported in a public pull request (#6) on 20 November 2026 by [kiranoye94-cmd](https://github.com/kiranoye94-cmd), with a Foundry test pair.

`RugCover.open()` stores the creator's balance as the floor with `uint128(bal)` and no upper bound. A balance at or above 2^128 (about 3.4e38 in the token's smallest units) would be cut short, so the creator could later sell down to the stored value without the term counting as breached. It needs a Pons token whose creator holds more than 2^128 units. Every Pons launch so far (75 on 20 November 2026) has a supply of 1e27, more than 300 billion times smaller, so no live term can reach it. **Hardening:** the Rug Cover page refuses to open a cover for such a balance. **Fix:** `open()` rejects a balance above `type(uint128).max` in the next RugCover version, which goes through review and the timelock like every contract change. Further reports of this root cause are duplicates.

## Update, 18 November 2026: website and API report

Reported privately on 18 November 2026 by [Radenlingga](https://github.com/Radenlingga). No contract or user funds were affected.

- **RPC keys in the website code.** The RPC endpoints the browser uses accepted requests from any site, so others could spend Stoa's RPC quota. **Fixed:** each key now only answers stoadex.com, and the server reads through a separate key that never reaches the browser.
- **API rate limit not enforced across servers.** The documented 60 requests a minute per IP was counted per server instance. **Fix in progress:** enforced at the edge for every `/api/v1/` path.
- **Unknown API paths answered with an HTML page.** **Fixed:** they now return a JSON 404 like the rest of the [API](api.md).

## Update, 17 November 2026: known issue from the bug bounty

### K-1 A token that taxes transfers can be delivered below the trader's minimum

**Status: open, no live exposure; fixed before any Stoa pool quotes.** Severity: Medium. Reported through the [bug bounty](bug-bounty.md) on 16 November 2026, with a Foundry test that reproduces it.

On a route whose last leg is a venue adapter, the router checks `minOut` against the amount it sends, then transfers it to the recipient. If the output token takes a tax on that transfer, the recipient receives less than the router measured, and can end up below `minOut` while the swap succeeds. The shortfall is the token's own tax; nobody else receives it. Pool legs are not affected: they measure the recipient's balance.

It needs a route that charges no router fee on that last leg: a route through a Stoa maker pool, or a router fee set to 0. Today no Stoa pool quotes on either chain and the router fee is 2 bps, so a swap to such a token through an adapter reverts (the fee check in the FeeDistributor fails) rather than delivering less. **Fix:** measure the recipient's balance on the final leg, as pool legs already do, in the router version that ships before the first Stoa pool quotes. Until then the router fee stays above 0 and no Stoa pool is given a maker. Tokens that tax transfers are not supported; the safety check on Trade shows a token's taxes before you buy. Further reports of this root cause are duplicates.

## Update, 16 November 2026: findings from the independent security review

Hey Research Lab reported two Medium findings, each with a test that reproduces it on a fork of Robinhood Chain. Both are fixed. Neither was used on-chain and no funds were lost.

### M-HRL-1 StoaLimit: anyone could block new limit orders with dust

**Status: fixed on 16 November 2026.** StoaLimit capped open orders at 1,000 across all wallets. Since an order can be 1 wei, anyone could open 20 dust orders from each of 50 new wallets, for little more than gas, and every new order would revert until those orders were cancelled. No deposit was at risk. **Fix:** limit orders moved to [StoaLimitV2](https://robinhoodchain.blockscout.com/address/0xE42b3B429417182E8621F0d19A9a1dAdC31D1C12), which has no cap across wallets; each wallet still has up to 20 open orders, and the keeper reads open orders in pages. The first StoaLimit never had an order. A test opens dust orders from many wallets and checks a new order still goes through.

### M-HRL-2 Uniswap V4 pool registry

**Status: fixed on 16 November 2026; the new adapter replaced the first one in the router on 19 November 2026, through the 48-hour timelock. UniswapV4AdapterV3 follows through the same timelock.** A finding about which Uniswap V4 pools the router uses. **Fix:** a new [UniswapV4AdapterV2](https://robinhoodchain.blockscout.com/address/0x27958279F95225b2a5517E7DD12b6Fc0317E5c5d) where only Stoa's keeper (or the timelock) can register pools, and the Add pool buttons are gone from the site. Until the swap is done, the site, the API and the keeper check the current adapter's pool list before using it, and the keeper compares router quotes against a second price before any buyback or burn. Full details are published here once the new adapter is live.

## Update, 16 November 2026: bug bounty reports

Two reports from outside researchers through the [bug bounty](bug-bounty.md), checked against the code. Neither puts funds at risk.

### L-11 A route through two Stoa pools pays the pool fee twice

Each Stoa pool takes its 2 bps on its own leg, and the router only skips its own fee when a route uses a pool; it cannot waive a pool's fee. A two-leg route through two Stoa pools (for example MEME → WHYPE in one pool, WHYPE → USDC in another) therefore pays the fee on each leg, while the docs said once per swap. Reproduced by the reporter in a local test (`test_twoStoaPoolsChargeProtocolFeeTwiceOnOneHop`) and confirmed in the code. The quote includes both fees, so nobody receives less than their minimum, and the router only picks that route when it still pays the most. Today it cannot happen: there is one Stoa pool, WHYPE/USDC on Elysium. Status: the fee docs now describe it; the team will weigh it before any second pool is added. Rated Low under the bounty.

### L-12 The swap form could send a stale amount to the wallet

A swap is prepared asynchronously (a fresh quote and a gas estimate) after Swap is tapped. If the amount or the slippage changed during that second, the wallet was still asked for the values from when Swap was tapped, so it could show a different amount than the form. The values were the trader's own and consistent with each other, so nobody could take funds with it, but the wallet and the screen disagreed. Reproduced by the reporter with the real Trade component and mocked wallet calls. Status: fixed on 17 November 2026. The form is locked while a swap is prepared, and the parameters are compared with the form right before they go to the wallet; if they differ, nothing is sent. Rated Low under the bounty.

### I-18 The Spotlight entry cap counts canceled tokens (by design)

`cancel` frees one of the 100 places in the race but not one of the 255 entries a week, so a week that has seen 255 entries takes no new tokens even after cancels. The cap is what keeps `finalize` cheap, and it is covered by `test_listedCapBoundsFinalize`. Filling a week this way costs 1,755 times the base entry fee (1.755 ETH today), all of it burned as $STOA; the bids themselves are refunded. Status: the Spotlight page now says canceled entries count toward the 255.

## Update, 16 November 2026: StoaLimit

A review of the limit order contract before its deployment.

| Item | Value |
| --- | --- |
| Contract | StoaLimit: makers deposit what they sell with a minimum; the keeper or the maker fills it through StoaRouter |
| Code | [contracts/src/StoaLimit.sol](https://github.com/StoaDex/Stoa/blob/main/contracts/src/StoaLimit.sol), about 260 lines of Solidity 0.8.28 |
| Address | `0xf570F16D9dBcf6FF5fF8F2b6dF321ca4Fa4355B3` on Robinhood Chain (CREATE2) |

**Method.** Line-by-line reading and 16 unit, attack and fuzz tests: fills at and below the minimum, sell orders paid in ETH, fills by a stranger, the keeper routing through an unlisted venue, fills after expiry and twice, cancels by the maker and by strangers before and after expiry, a maker contract that tries to take its refund twice, pause scope, admin roles, bad inputs, a fee-on-transfer token, the per-maker cap, and a fuzz test (512 runs of 40 random creates, fills and cancels) that the contract always holds exactly the deposits of open orders and lists exactly the open orders. A fork test fills a buy order for USDG and a sell order of $STOA for ETH on the live router. All pass.

**Result.** No issue lets anyone take a deposit. A deposit only ever goes back to its maker or through the router, which pays the maker and reverts below the order's minimum. One low finding and two informational.

### L-10 The keeper decides when, and along which route, an order fills

Only the keeper or the maker can fill. A misused keeper key could fill orders at exactly their minimum when the market paid more, or not fill them at all. It can never pay a maker less than the minimum, send anything elsewhere, or keep a deposit; the maker can fill or cancel at any time.

### I-16 Fills are limited to the keeper and the maker (by design)

A permissionless fill would let anyone push a pool to exactly an order's minimum, fill, and keep the difference. The cost is that fills wait for the keeper, about every 5 minutes.

### I-17 Tokens that change balances on their own are not supported

Fee-on-transfer tokens are refused when the order is created. A token that rebases downwards could leave the contract short for the last order in that token; the docs ask for standard tokens only.

## Update, 15 November 2026: RugCover

A review of the Rug Cover contract before its deployment.

| Item | Value |
| --- | --- |
| Contract | RugCover: Pons creators bond ETH behind their wallet's balance; covered buyers claim from the bond after a breach; $STOA backers earn creator fees and forfeited bonds |
| Code | [contracts/src/RugCover.sol](https://github.com/StoaDex/Stoa/blob/main/contracts/src/RugCover.sol), about 665 lines of Solidity 0.8.28 |
| Address | `0x64498e94fEaC6750885818e5EE7921042395B301` on Robinhood Chain (CREATE2) |

**Method.** Line-by-line reading against a list of ways to drain or game the cover, each with its own test: a creator buying their own cover from other wallets and dumping, a floor below the creator's balance, moving tokens out instead of selling, a dump in the last minute of a term, buying more and selling only the extra, selling more cover than the bond, a wallet that is not the Pons creator, a backer locking just before income lands, a covered buy routed to another token or recipient, a reentrant claim, parameter changes on open terms, and pause and emergency exits. Payouts are fixed in ETH at purchase, so no price feed can be pushed. 32 unit, attack and fuzz tests, including a fuzz test (512 runs) that a creator who rugs their own cover always loses money, and one that every wei that comes in leaves to a buyer, a creator, a backer, the breach caller or the burn, with under 100 wei of rounding left behind; a fork test with a real Pons token's creator on the live router (open, covered buy, dump, breach, claim, burn); Slither 0.11 with 102 detectors. All pass.

**Result.** No issue allows anyone to take ETH or $STOA. Nobody, owner and guardian included, can send funds anywhere except to a buyer, a creator, a backer, the breach caller or the burn. Two low findings and four informational.

### L-8 The keeper sets the burn's price limit

The same as L-4 and L-6: `burn` takes its minimum output from the keeper, so a leaked keeper key could burn the pot at a bad price. The pot holds premiums and 10% of creator income, and can only become burned $STOA.

### L-9 The guardian can pause new covers indefinitely

The guardian can pause, and only the timelock can unpause, so a misused guardian key could stop new covers, covered buys and locks for at least 48 hours. Claims, breaches, releases, unlocks and ETH claims keep working during a pause, and backers can take all their $STOA out at once.

### I-12 Only the creator's own wallet is watched (by design)

A creator who spread tokens to other wallets before opening a cover can still sell those. The app says so wherever cover is offered, and each token's page shows what the creator wallet bought in the token's first minute and how much of it is gone.

### I-13 A creator can buy their own cover (by design)

Cover sold on a term never exceeds 75% of the bond, and the breach bounty is at most 2%, so a creator who covers themselves and dumps always forfeits at least 23% of the bond, plus the fee, the premiums and Pons' fees. At least 10% of the forfeited part is burned whoever the backers are. The fuzz test above checks the loss.

### I-14 Cover follows the purchase, not the balance (by design)

A buyer who already sold is still paid after a breach. Claims need no oracle and no token handover, and the money always comes from the bond of the creator who broke the promise.

### I-15 Slither results on RugCover (false positives or by design)

"Sends ETH to arbitrary user": claims, releases, credits and reward claims send only the caller's own entitlement, to an address the caller chooses. "Reentrancy" in `buyCovered` and `burn`: both are `nonReentrant`, update state before the call, and call only the trusted router. "Timestamp": terms and streams are measured in days. "Assembly": `creatorOf` reads two words of the Pons factory's answer and masks them to addresses. "Strict equality": zero checks are intended.

## Update, 15 November 2026: SpotlightMarket

A review of the Spotlight contract before its deployment (week 1 opens 23 November 2026).

| Item | Value |
| --- | --- |
| Contract | SpotlightMarket: weekly sponsored slots, ETH bids paid to $STOA voters, 10% burned |
| Code | [contracts/src/SpotlightMarket.sol](https://github.com/StoaDex/Stoa/blob/main/contracts/src/SpotlightMarket.sol), about 590 lines of Solidity 0.8.28 |
| Address | `0xf3A995D4240c0F36da697E5292B294052a1706B5` on Robinhood Chain (CREATE2) |

**Method.** Line-by-line reading against a list of ways to game the market, each with its own attack test: a project voting for itself, last-second bid changes, locking just before the close, double-counting the same $STOA, spamming the candidate list, sandwiching the burn, parameter changes mid-week, a reentrant claim, a voter contract that refuses ETH, and pause and emergency exits. 29 unit and attack tests, including a fuzz test (512 runs) that every wei bid ends up with a voter, a bidder or the burn; a fork test that runs a full week on the live router with real $STOA and burns through its Uniswap V4 pool; Slither 0.11 with 102 detectors. All pass.

**Result.** No issue allows anyone to take ETH or $STOA. Nobody, owner and guardian included, can send funds anywhere except to the voter, the bidder or the burn. Two low findings and three informational.

### L-6 The keeper sets the burn's price limit

Like the buyback (L-4), `burn` takes its minimum output from the keeper, so a leaked keeper key could burn the pot at a bad price. The pot is small (10% of winning bids plus entry fees) and can only become burned $STOA.

### L-7 The guardian can pause new activity indefinitely

The guardian can pause, and only the timelock can unpause, so a misused guardian key could stop new bids, locks and votes for at least 48 hours. Claims, refunds, withdrawals and settling keep working during a pause, and every holder can take all their $STOA out at once.

### I-9 A project can vote for its own token (by design)

Winners are ranked by bid, not by votes, and anyone can vote for any token, so a project that votes for itself shares its bid with every other voter of its token. Votes only decide eligibility (the quorum) and who is paid.

### I-10 Rounding and unclaimed ETH (by design)

Each voter's share is rounded down, so a few wei per winning token stay in the contract. Claims and refunds never expire.

### I-11 Slither results on SpotlightMarket (false positives or by design)

"Sends ETH to arbitrary user": claims and refunds send only the caller's own entitlement, to an address the caller chooses. "Reentrancy" in `burn`: it is `nonReentrant` and the router is trusted code. "Timestamp": weeks are measured in days, far beyond any block timestamp drift. "Uninitialized local" and "strict equality": zero starting values and a `from == 0` check are intended.

## Update, 15 November 2026: Robinhood Chain contracts

A second round covering everything deployed since the first review, mostly on Robinhood Chain. The first review (12 November, Elysium) follows below, unchanged except for status updates.

| Item | Value |
| --- | --- |
| Contracts | StoaRouter (Robinhood Chain build, with Permit2), StoaPoolL2, BondRegistry, StoaBuyback, FeeDistributor, PonsCurveAdapter, the Aero and Ramses tick-spacing adapter, and the Uniswap V2, V3 and V4 adapters |
| Code | As deployed on Robinhood Chain; addresses on [Contracts](contracts.md) |
| Size | All Stoa contracts together: about 2,430 lines of Solidity 0.8.28 |

**Method.** Line-by-line reading of the new and changed paths (buyback, bonds, the L2 pool's block timing, the Pons curve adapter), Slither 0.11 with 102 detectors over every Stoa contract (85 results: every High and Medium result is triaged below or in the first review; the rest are gas and style notes), 73 unit and attack tests, and 22 fork tests against live Robinhood Chain venues and Pons curves. All pass.

**Result.** No issue allows anyone to take user funds. One new medium finding about admin trust, two new low findings, four informational. Every Slither result marked High is a false positive explained below or in the first review (I-2, I-3, I-4).

### M-3 The timelock can hand the fee contract to a new owner

**Status: by design, mitigated by the 48-hour timelock.** StoaBuyback forwards the owner's calls to the FeeDistributor, except the one that withdraws protocol fees. That keeps settings such as the referral share adjustable, and it also allows moving the FeeDistributor to a different owner, for example an improved buyback contract. A new owner could withdraw protocol fees, so the guarantee that fees can only buy and burn $STOA holds as long as no such move happens. Any move is a 2-of-3 Safe proposal that waits 48 hours in public on the timelock first.

### L-4 The buyback's price limit is set by the keeper

`StoaBuyback.buyback` takes the minimum output from the keeper. The keeper script quotes the router and allows 2% slippage, but the contract does not cap it. A leaked keeper key could therefore run buybacks with no price limit and lose part of the accrued fees to a sandwich. It could not send fees anywhere other than a $STOA burn. The keeper wallet holds only gas, and the owner can replace it through the timelock.

### L-5 Pons curve quotes copy Pons' own math

`PonsCurveAdapter` predicts a curve's output with the same formula as the Pons curve, fee and creator tax included (Slither flags its divide-then-multiply). If the prediction and the curve ever differ, the swap reverts on the adapter's own minimum, so a trade can fail but never fill worse than quoted. The adapter leaves the buy that would graduate a curve, and a launch's anti-sniper window, to Pons.

### I-5 Balance and reentrancy warnings on the Pons curve adapter (false positive)

Only the router, which is `nonReentrant`, can call the adapter's `swap`. The curve is looked up from the Pons factory and must match the token, and the adapter measures the ETH and tokens it actually receives. Unexpected extra ETH could only increase what the trader gets.

### I-6 Unused return values (by design)

The router, the buyback and the adapters ignore the amounts venues report and measure balances instead (see "What was checked and held up" below). Slither flags each ignored return value.

### I-7 Keeper can be set to the zero address (by design)

Setting StoaBuyback's keeper to zero leaves only the owner able to run buybacks. That is the intended way to stop the keeper.

### I-8 Strict equalities and zero-start variables (by design)

Slither flags strict equality checks in the router and the pools. They are the point: a venue must take exactly the input it was given, and a fee-on-transfer token is refused when the received amount differs. It also flags local variables in the V4 and Liquidity Book adapters that start at zero, which is the intended starting value.

## First review, 12 November 2026 (Elysium)

### Scope

| Item | Value |
| --- | --- |
| Date | 12 November 2026 |
| Contracts | StoaRouter, StoaPool, MakerRegistry, FeeDistributor, and the six venue adapters (Uniswap V2, V3, V4, Aero, Ramses, Liquidity Book) |
| Code | As deployed on Elysium mainnet and verified on [Sourcify](https://repo.sourcify.dev/99901/0x104752D50ef893da579Ad813918269e09Ea17dbA) |
| Size | About 1,760 lines of Solidity 0.8.28, OpenZeppelin 5.1 |

### Method

- Line-by-line reading of every swap, quote, bond, fee and admin path
- Static analysis with Slither (76 detectors); every result triaged below
- 57 unit and attack tests and 11 fork tests against live Elysium pools
- Two mainnet test swaps through the production router (HYPE to USDC and back), both successful

### Summary

| Severity | Count |
| --- | --- |
| Critical | 0 |
| High | 0 |
| Medium | 2 (1 resolved, 1 mitigated) |
| Low | 3 |
| Informational | 4 |

No issue allows anyone to take user funds. The two medium findings are about admin trust, not code bugs.

### Findings

#### M-1 Admin is a single wallet

**Status: resolved on 12 November 2026.** Ownership moved to a 2-of-3 Safe (see the update at the end of this finding). Original finding: The owner and guardian of every contract is one wallet. If its key leaks, an attacker could pause swaps, withdraw maker pool inventory, slash maker bonds or propose a new venue. They could **not** upgrade code, move funds from user wallets, or add a venue without the 24-hour public wait, which gives time to react. **Update:** every contract is now owned by the 2-of-3 admin Safe `0xBF715C84b1C0759C87Da368c1476b80ac0C5055F`. One leaked key can no longer act alone; the router guardian stays a single wallet that can only pause. See [Admin and permissions](admin.md).

#### M-2 Owner can withdraw maker pool inventory

**Status: mitigated on 12 November 2026.** Any withdrawal now waits 48 hours in public behind the timelock. Original finding: Maker pool inventory is supplied by Stoa itself, so this is how it is managed. Before any outside deposits are accepted, pool inventory moves into vaults the owner cannot withdraw from. Vaults stay closed until the external audit.

#### L-1 A quote outlives a maker's removal for up to 2 blocks

A pool checks the maker's approval and bond when a quote is posted, not on each swap. If a maker is removed or starts unbonding, its last quote stays valid until it expires, at most 2 blocks (about 200–400 ms). The owner or guardian can cancel a quote at once, and a bond stays slashable for 24 hours after unbonding starts.

#### L-2 Traders can name themselves as referrer

A trader can pass their own address as referrer and receive 10% of the protocol fee back, a rebate of 0.2 bps. This costs the protocol a little and nothing to other users. Accepted.

#### L-3 Direct pool swaps accept any recipient

`StoaPool.swap` does not itself reject the zero address as recipient; standard tokens such as WHYPE and USDC revert on such a transfer anyway. It only matters to someone calling the pool directly with a mistaken recipient, never through the router or app, which always checks the recipient.

#### I-1 Fee rounding

Pool and router fees are taken from an output that was already rounded down, so the fee can be off by less than one smallest unit of the token. Every rounding goes in the pool's favor; no loss to users.

#### I-2 Reentrancy warnings (false positive)

Slither flags external calls before balance checks in the router and adapters. Both router swap functions, the pool swap and every bond and fee withdrawal are `nonReentrant`, and venues must be allowlisted, so these paths cannot be re-entered.

#### I-3 Native HYPE sent to a caller-chosen address (by design)

The router sends native HYPE to the recipient the trader chose, after checking the output against the trader's minimum. The bond registry sends HYPE only to the maker withdrawing or to the treasury.

#### I-4 V4 key list "never initialized" (false positive)

The V4 adapter's pool list is a mapping filled by `register`. Slither's warning does not apply.

## What was checked and held up

- **Input and output are measured, not trusted.** Each leg checks that the venue took exactly the input, and the final output is measured against the trader's minimum (except a token that taxes the final transfer from an adapter leg, K-1 above).
- **Only allowlisted venues.** Unknown venues, wrong pairs and removed venues revert. Fork tests confirm adapters reject strangers and fake callbacks.
- **Approvals.** The router pulls only the swap amount from the caller and clears any approval it gives a pool.
- **Fee accounting.** Fees must be backed by tokens the distributor actually holds, and referral earnings can only be claimed by the referrer.
- **Bonds.** Slashing takes active bond first, then pending; a maker cannot withdraw within the 24-hour delay.
- **$STOA bonds.** BondRegistry rejects fee-on-transfer tokens, burns slashed $STOA, and keeps unbonding (3 days) longer than the timelock (48 hours), so a maker cannot leave before a slash lands. Fork-tested with the real $STOA token.
- **Buyback.** StoaBuyback has no function that sends protocol fees anywhere but a $STOA buy and burn, and its pass-through to the FeeDistributor refuses the fee withdrawal call (see M-3 for what the owner can still change). Fork-tested with real fees in USDG, WETH and a graduated Pons token.
- **No upgradeability.** No proxies, no self-destruct, no delegatecall to outside code.

## Next steps

1. ~~Move ownership to a multisig~~ Done: 2-of-3 admin Safe.
1. ~~Add a delay to admin actions~~ Done: 48-hour timelock in front of every contract; maker bonds take 3 days to withdraw.
2. External audit before raising the $500 per-swap cap or opening vaults.
3. Paid bug bounty: ran on 16 and 17 November 2026 and has ended. Security reports are still welcome privately and credited, see [Security reports](bug-bounty.md).
