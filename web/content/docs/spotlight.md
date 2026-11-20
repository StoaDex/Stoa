# Spotlight

Every week projects bid ETH for three sponsored slots on Stoa, and $STOA holders who lock and vote are paid 90% of the winning bids. The other 10%, plus every entry fee, buys $STOA and burns it. Week 1 opens on Monday 23 November 2026 at 00:00 UTC on [stoadex.com/spotlight](https://stoadex.com/spotlight). New to voting? Start with [Spotlight for voters](spotlight-voters.md).

## How a week runs

1. **Monday 00:00 UTC, bids open.** A project bids ETH for its token. The first bid for a token in a week pays an entry fee and must be at least the minimum bid. Anyone can add to a token's bid.
2. **Saturday 00:00 UTC, bids close.** From here until the week ends, bids are final and only votes change, so holders vote with fixed numbers.
3. **Holders vote all week.** Lock $STOA and split your votes over up to ten tokens. You can change them until the week closes.
4. **Monday 00:00 UTC, the week closes.** Anyone can settle it. Among tokens with at least 1M $STOA of votes, the three largest bids win. Ties go to the token that entered first.
5. **The ETH is split.** For each winner, 10% of its bid goes to the burn pot and 90% to the holders who voted for it, pro rata to their votes. Every other bid can be refunded in full.
6. **The winners show for a week** at the top of Trade's token list, on Launches and on Tokens, marked "Sponsored".

## The numbers

| Rule | Value |
| --- | --- |
| Slots per week | 3 |
| Who wins | The largest bids among tokens with at least 1,000,000 $STOA of votes |
| Entry fee | 0.001 ETH for the first 20 tokens of a week, then 0.002 ETH for the next 20, and so on. Not refunded; it is burned |
| Minimum first bid | 0.01 ETH |
| Most one token can have in a week | 0.5 ETH (beta cap) |
| Burn share | 10% of each winning bid |
| Voting power | 1 locked $STOA = 1 vote, up to 10 tokens per holder per week |
| Tokens per week | Up to 100 in the race at once (a canceled token frees one of those places) and 255 entries in total, canceled ones included: once 255 tokens have entered, the week takes no new ones |

Parameter changes go through the 48-hour timelock and apply from the following week. The contract caps them: at most 5 slots, at most a 20% burn share, a base entry fee of at most 0.01 ETH and a minimum bid of at most 1 ETH.

## Locking and unlocking

- Lock $STOA on the Spotlight page. Locked $STOA votes and earns nothing by itself: you earn when a token you voted for wins.
- To leave, request an unlock. The $STOA stops voting at once and can be withdrawn when the current week ends.
- $STOA that voted this week can only be requested from next week on. So $STOA that votes stays locked until the end of the following week, about seven days at least. Nobody can lock just before the close, collect, and leave.
- The same $STOA can never vote twice in one week.

## Claims and refunds

- After a week is settled, claim your ETH on the Spotlight page, for one week or several at once, to any address you choose.
- A project whose token did not win, or was canceled, takes its bid back in full from the same page. The entry fee stays in the burn pot.
- Claims and refunds never expire. Rounding leaves at most a few wei per token behind.

## Share a candidate

Every token in the week's race has its own page, `stoadex.com/spotlight/vote/<token address>`, with its bid, its votes against the quorum, how to vote for it and a share card for X and Telegram. Projects can share it with their community; the Share link next to each token in the race table and the bid panel lead there.

## Safety

- **Sponsored, not reviewed.** Every slot says "Sponsored" and links here. Stoa does not review the projects: a winning token can still go to zero.
- **Checks before a winner shows.** The app shows a winner only if it can be bought and sold on Stoa right now and is not on the app's hidden list.
- **The guardian can only refund.** Until Saturday 00:00 UTC the guardian can cancel a bid for a scam or a honeypot. The bid becomes refundable in full, and voters still have two days to move their votes.
- **Pause without trapping funds.** The guardian can pause new bids, locks and votes. Claims, refunds, withdrawals and settling keep working, and during a pause every holder can take all their $STOA out at once. Only the timelock can unpause.
- **Nobody can take the money.** The contract has no function that sends anyone's ETH or $STOA anywhere except to the holder, the bidder or the burn.
- **The burn cannot be sandwiched cheaply.** Only the keeper (or the timelock) spends the burn pot, with a minimum output it sets from a fresh quote, the same rule as the weekly buyback.
- **Team wallets do not take part.** Stoa's team and dev wallets do not lock or vote.
- **No formal audit yet.** SpotlightMarket is in Hey Research Lab's independent security review (since 16 Nov 2026), is source-verified, and is covered by unit, attack and fork tests and Slither; see [Security review](security-review.md).

## For projects and agents

- Projects: [Spotlight for projects](https://stoadex.com/spotlight/projects) explains bidding in one page, and the bid form is on [Spotlight](https://stoadex.com/spotlight#bid).
- Agents and apps: `GET` [stoadex.com/api/v1/spotlight](https://stoadex.com/api/v1/spotlight) and the `spotlight` tool on the [MCP server](mcp.md) return the week in progress, its closing times (UTC), the rules, every candidate with its bid and votes, last week's winners and the $STOA locked.
- Holders: the lock panel switches your wallet to Robinhood Chain if needed, has a **Max** button, and approves the exact amount before locking. The counter at the top of the page shows how much $STOA is locked toward the 1M votes each winner needs.

## Contract

`SpotlightMarket` on Robinhood Chain: [`0xf3A995D4240c0F36da697E5292B294052a1706B5`](https://robinhoodchain.blockscout.com/address/0xf3A995D4240c0F36da697E5292B294052a1706B5), deployed on 15 November 2026 ([transaction](https://robinhoodchain.blockscout.com/tx/0xbe834ada0440ee669d0f7e3c3e189fb2aa4704c426bb5be6ed5359b13f84e1c9)) with CREATE2 through the standard deterministic deployer. It is owned by the 48-hour timelock from its constructor, with the router's guardian and the buyback keeper, and its source is verified on [Sourcify](https://repo.sourcify.dev/4663/0xf3A995D4240c0F36da697E5292B294052a1706B5) (exact match). Source: [contracts/src/SpotlightMarket.sol](https://github.com/StoaDex/Stoa/blob/main/contracts/src/SpotlightMarket.sol).

Payouts depend on what projects bid each week; nothing is promised.
