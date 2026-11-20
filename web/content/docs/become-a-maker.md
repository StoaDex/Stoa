# Become a maker

A maker quotes a Stoa pool: a bid and an ask, with sizes, refreshed every block. When a swap comes in, the router compares that quote with every other venue and fills against it when it gives the trader the most. The pool earns the spread: it buys below the market and sells above it.

A **curator** owns a pool's inventory and keeps what the spread earns; a **maker** is the wallet that posts the quotes. Usually they are the same team. See [Become a curator](become-a-curator.md) for the pool side.

## What each network asks of a maker

|  | Elysium | Robinhood Chain |
| --- | --- | --- |
| Pools | WHYPE/USDC is live and waiting for makers ([`0x7800…400a`](https://elysium.kinetiq.xyz/address/0x7800220F420C63F5Ed5e60a75E864465ff49400a)); more pairs on request | The first maker pool opens with the first maker; tell us the pair |
| Bond | **10 HYPE** per pool, in the MakerRegistry | **$STOA**, one bond for all your pools, in the [BondRegistry](token.md). Each pool sets its minimum when it is listed |
| Withdrawing a bond | 3 days | 3 days |
| A slashed bond | Goes to the treasury | Is burned |
| Gas | HYPE | ETH |

## Steps

1. **Apply.** DM [@StoaDEX](https://x.com/StoaDEX) with the pair, your price source, the size you want to quote and your maker address.
2. **Pool.** Quote an existing pool, or have a pool deployed for your pair with you as its owner, so the inventory and the spread are yours.
3. **Listing and approval.** The admin Safe lists the pool, sets its minimum bond and approves your maker address through the 48-hour timelock; a new pool also goes through the router's 24-hour wait before swaps can use it. About three days in all, every step public on-chain ([Admin and permissions](admin.md)).
4. **Bond.** On Elysium, call `bond(pool)` on the MakerRegistry and send at least 10 HYPE. On Robinhood Chain, approve $STOA and call `bond(amount)` on the BondRegistry, or use the bond panel on the [$STOA page](https://stoadex.com/token).
5. **Inventory.** The pool's owner sends both tokens of the pair to the pool. Only the owner can take them out (`withdraw`).
6. **Quote.** Start the [Maker kit](maker-kit.md) with `DRY_RUN=1` first, then live. Your pool shows in [Pools](https://stoadex.com/pools) once quotes are flowing.

You can quote only while all three hold: the pool is listed, your address is approved for it, and your bond is at least the pool's minimum.

## How a quote works

```solidity
// prices: quote-token raw units per 1e18 raw base units
function setQuote(uint128 bidPx, uint128 askPx, uint96 bidSize, uint96 askSize, uint8 validBlocks) external;
function cancelQuote() external;
```

- `askPx` must be above `bidPx`, and `bidPx` above zero.
- `validBlocks` is 1 or 2 (the pool's `maxValidBlocks`, 2 today): a quote expires on its own after that, about 200 to 400 ms on Elysium and 500 ms on Robinhood Chain, which counts its own 250 ms blocks. A bot that crashes stops quoting by itself.
- Each fill uses up the quoted size on its side. A new `setQuote` replaces the old quote.
- The maker, the pool owner or the guardian can pull the quote at any moment with `cancelQuote`.
- A pool can have a quote guard that rejects prices too far from an independent reference ([Build a price provider](price-provider-guide.md)), and a cap on one swap's size (500 USDC on WHYPE/USDC today).
- Swaps against the pool pay the pool's 2 bps fee to Stoa's fee contract.

## Slashing and leaving

A maker that posts clearly abusive prices can be slashed: part or all of its bond, by the owner, which is the 48-hour timelock. Withdrawing a bond takes 3 days (`requestUnbond`, wait, then `withdrawUnbonded`), longer than the timelock, so a slash always lands before a maker can leave.

## Risks for a maker

Quoting is not free money. The inventory can lose value when prices move, a slow or wrong price feed gets picked off, and a bad quote can cost the bond. The Maker kit stops quoting on a stale or jumping price, limits how much inventory one side can take and halts at a daily loss limit, but the risk stays with the maker.
