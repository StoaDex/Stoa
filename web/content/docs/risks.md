# Risks and safeguards

What can go wrong, and what limits it.

| Risk | Safeguard |
| --- | --- |
| A contract bug affects pool funds | Maker pool inventory is supplied by Stoa, not by outside depositors; per-swap caps stay until the audit |
| A venue misbehaves or lies about its output | The router measures what you actually received and reverts below your minimum; it also reverts if a venue does not take exactly your input |
| You buy a token that taxes transfers | Such tokens are not supported. Through a venue adapter with Stoa's 2 bps fee, the swap reverts. A route through a Stoa pool would check your minimum before the token's tax on the last transfer, so you could receive less (K-1 in the [security review](security-review.md)); no Stoa pool quotes today, and the fix ships before one does. The safety check on Trade shows a token's taxes before you buy |
| A malicious venue is added | New venues wait 72 hours in public before they can go live (48-hour timelock, then the router's 24-hour wait); the guardian can pause the router at once. Uniswap V4 pools can only be added if their hooks are on an allowlist fixed at deployment, on each network |
| Something goes wrong | The router can be paused at once by the owner or the guardian |
| The admin key is misused or lost | Admin cannot upgrade code, move funds from your wallet or add a venue without a 24-hour public wait. Every contract is owned by a 48-hour timelock controlled by a 2-of-3 Safe multisig: one leaked key is not enough, and every admin action is public for 48 hours before it runs. All Safe signers are held by the team. See [Admin and permissions](admin.md) |
| A Spotlight token is a scam | Every slot is labelled Sponsored and links to the rules. The app shows a winner only if it can be bought and sold on Stoa; the guardian can cancel a scam's bid until Saturday (refunded in full), and the app can hide a winner at any time |
| A bug in SpotlightMarket | The guardian can pause new bids, locks and votes at once; claims, refunds and withdrawals keep working, and every holder can take their $STOA out immediately during a pause. Beta cap of 0.5 ETH per token per week |
| A Rug Cover creator rugs through another wallet, or holders dump | Rug Cover watches only the creator's own wallet, and every page that offers cover says so. The token's page shows what the creator wallet bought at launch and how much of it is already gone |
| A creator buys their own cover, then dumps | Cover sold on a token never exceeds 75% of its creator's bond, so the creator always forfeits at least a quarter of it; at least 10% of what is forfeited is burned whoever the backers are |
| A bug in RugCover | The guardian can pause new covers, covered buys and locks at once; claims, breaches, releases, unlocks and ETH claims keep working, and backers can take their $STOA out immediately during a pause. Beta caps of 1 ETH of bond per token and 20 ETH in all |
| A limit order does not fill at the moment its price is touched | The keeper checks about every 5 minutes and can be later; the maker can press Fill now, and can always cancel and take the deposit back, even during a pause |
| A bug in StoaLimitV2 | The guardian can pause new orders and fills at once; cancels keep working, so every deposit can always go back to its maker. Fills never pay below the order's minimum, enforced by the router |
| The safety check passes a token that turns bad later | The check simulates today's behavior only; the app says so next to every result. A token's owner can still change its rules |
| A maker posts abusive quotes | Makers must be approved and bond at least 10 HYPE, which can be slashed. Bonds take 3 days to withdraw, longer than the 48-hour timelock, so a maker cannot pull out before a slash |
| Contracts are not externally audited yet | A full [internal review](security-review.md) found no critical or high issues; per-swap cap of $500 on maker pools; vaults stay closed until the external audit |
| Unlimited token approvals | The app approves only the amount of each swap unless you opt in |
| Fake or copycat tokens | Tokens imported by address are marked unverified and need an explicit confirmation. The official $STOA is read on-chain from the dev wallet's launch, so a copycat can never carry the "Official Stoa token" mark |
| Thin pools | Price impact is shown; above 15% you must confirm before swapping |
| A maker loses money in a fast market | Daily loss limits, spreads that widen with volatility, emergency stop |
| A stale price is used | Quotes expire after 2 blocks; pools reject expired quotes |
| No maker quote available | The router fills on the best outside venue (Uniswap, Aero, Ramses or Liquidity Book on Elysium; Uniswap, Aero, Ramses, Metric or a Pons curve on Robinhood Chain) |
| Thin pool for a small token | Price impact is shown before you sign; your slippage limit reverts bad fills |
| HyperCore upgrade is delayed | Makers keep using the Hyperliquid API until it ships |
| Two networks, two sets of contracts | Robinhood Chain has its own router, Safe and 48-hour timelock, with the same signers and the same rules. A pause on one network does not stop the other. See [Contract addresses](contracts.md) |
