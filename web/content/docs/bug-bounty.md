# Security reports

**The paid bug bounty ended on 17 November 2026.** Stoa no longer pays cash rewards for security reports. Reports are still welcome: send them privately as described below, and valid findings are credited in the [security review](security-review.md), with your name or anonymously.

Why: Stoa is a small team with a small budget. Its contracts have had an [independent security review](security-review.md) by Hey Research Lab, and every finding from it is fixed. While the bounty ran (16 and 17 November), most reports were duplicates or out of scope, and checking them took time away from building. Reports sent while it ran are answered individually.

## How to report

Report privately through **GitHub only**: [report a vulnerability](https://github.com/StoaDex/Stoa/security/advisories/new) on the StoaDex/Stoa repository. The report stays private between you and the team.

A good report has the affected contract and function, the impact, and a Foundry test that reproduces it, on a fork of the live network where it matters. The repository's `contracts/test` folder has fork tests for both networks to start from.

Direct messages on X, Telegram or anywhere else are not reports and are not answered. The team never asks for payment, a deposit or a wallet signature to look at a report: anyone who does is not Stoa.

Please do not disclose the issue publicly, or to anyone else, until it is fixed and the team has agreed to disclosure.

## Credit

- Valid findings are written up in the [security review](security-review.md) once fixed, crediting the reporter if they want.
- One credit per root cause: if two people report the same issue, the first complete report is credited.
- Issues already listed in the [security review](security-review.md) or in [contracts/AUDIT.md](https://github.com/StoaDex/Stoa/blob/main/contracts/AUDIT.md) are known.

## Scope

**In scope:** Stoa's own contracts on Elysium and Robinhood Chain, as listed on [Contracts](contracts.md): StoaRouter, the venue adapters, StoaPool maker pools, MakerRegistry, FeeDistributor, StoaBuyback, BondRegistry, SpotlightMarket, RugCover, StoaLimitV2, and how they use the timelock and the admin Safe. Also the app at [stoadex.com](https://stoadex.com), for issues that could make someone sign a harmful transaction.

**Out of scope:**

- Contracts Stoa does not control: tokens (including the $STOA token, a Pons launch), Uniswap, Aero, Ramses, Liquidity Book, Pons, Permit2, WETH, WHYPE, USDG, USDC and the Safe contracts. Report those to their teams.
- Issues that need a compromised admin key, guardian or keeper, and known limits of those roles: see [Admin and permissions](admin.md) and the findings in the [security review](security-review.md).
- Losses a user's own slippage limit allows, and prices on third-party venues.
- Denial of service against websites or RPCs, spam, missing security headers or best practices with no impact, and attacks on third-party services (RPC providers, DexScreener, Vercel, X).
- Phishing, social engineering, and anything that needs physical access to a device.

## Rules

- Test on a local fork, never against live funds. Do not touch other people's funds, and stop at the smallest proof that the issue is real.
- Do not degrade the live app or networks for other users.
- Team members and their relatives are not eligible.
- Research done in good faith under these rules is welcome: the team will not take legal action against you for it.

## What happens next

The team acknowledges a report within 48 hours and gives a first assessment within 7 days. For a live risk, the guardian can pause swaps at once while a fix goes through the timelock. Fixed issues are written up in the [security review](security-review.md), crediting the reporter if they want. There is no cash reward.
