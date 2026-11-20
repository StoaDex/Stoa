# Audits

Audit status for Stoa contracts.

Stoa contracts have **no formal audit yet**. Since 16 November 2026, Hey Research Lab has been doing an **independent security review** of RugCover, SpotlightMarket, StoaLimit and StoaRouter; its fixed findings are published on [Security review](security-review.md), next to the team's own internal review (no critical or high findings). A formal audit is planned before swap and pool caps are raised or vaults open. Reports will be linked on this page.

## What has been done

- 102 unit and attack tests, plus fork tests that run the contracts against live venues: 23 on Robinhood Chain and 11 on Elysium
- Static analysis with Slither (102 detectors), with every High and Medium result triaged
- Every deployed contract is source-verified on Sourcify (router on [Elysium](https://repo.sourcify.dev/99901/0x104752D50ef893da579Ad813918269e09Ea17dbA) and on [Robinhood Chain](https://repo.sourcify.dev/4663/0x2F2804fad735a38015650f32f95Ad5E08D6B3eE5))
- Admin powers and their limits are listed in [Admin and permissions](admin.md)
- Contracts are not upgradeable: the code you see is the code that runs
- Private [security reports](bug-bounty.md) through GitHub, credited in the security review (the paid bug bounty ended on 17 November 2026)
