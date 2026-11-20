# Bounty Fix

**Reward:** $530.00
**Issue:** https://github.com/StoaDex/Stoa/issues/14
**Repo:** https://github.com/StoaDex/Stoa

---

## Issue

Bounty #3 entry: Public Stoa swaps dashboard (Robinhood Chain)

**Bounty #3 — Public dashboard of Stoa swaps on Robinhood Chain**

Live dashboard: https://doms99999.github.io/stoa-dashboard/
Code + queries (open source): https://github.com/doms99999/stoa-dashboard

**What it shows**
- Total swaps and USD volume (all time, 24h, 7d)
- Unique traders and unique referrers
- Routes per venue (share + volume)
- Top pairs, top referrers, and the 100 most recent swaps with Blockscout links

**How it works (queries shared)**
All figures are read from the StoaRouter `Routed` event on Robinhood Chain (4663), contract `0x2F2804fad735a38015650f32f95Ad5E08D6B3eE5`, via `eth_getLogs` over the full chain history in 10M-block ranges. `fetch-swaps.js` in the repo decodes every event with the router ABI, resolves token symbols/decimals, and prices each swap in USD (the USDG side, or the ETH/WETH side at Stoa's own ETH→USDG quote). Re-running the script regenerates `data.json`, which the static page renders.

Snapshot at submission: 32 swaps all-time, $530 volume, 19 unique traders.

Referrer / payout address (Robinhood Chain): `0xD294e1d6824ddC84172452EE88D57c014543F7D0`


---

## Process

### 1. Orient yourself first
Before touching any code:
- Read the README and any relevant docs
- Run: find . -type f | grep -v node_modules | grep -v .git | grep -v dist | head -60
- Grep for the key terms from the issue title to find the relevant files
- Read the files around the bug — understand what's currently happening

### 2. Find and read the tests
- Look for test files near the relevant code (*.test.ts, *.spec.js, __tests__, etc.)
- Read them — they tell you what behavior is expected
- Understand what a passing fix looks like before writing a line

### 3. Implement the fix
- Make the MINIMAL change that fixes the issue — nothing more
- Do not refactor, rename, reorganize, or clean up unrelated code
- Do not add dependencies unless the issue explicitly requires it
- Do not modify config files (package.json, tsconfig.json, etc.) unless that IS the fix
- One logical change, one commit

### 4. Verify
- Run the test suite: check package.json scripts for "test", "lint", "typecheck"
  Common commands: npm test, yarn test, pnpm test, pytest, go test ./..., cargo test
- If TypeScript is present: npx tsc --noEmit
- Fix any test failures your change caused — if a test was wrong before, update it

### 5. Commit and document
- git add -A
- git commit -m "fix: Bounty #3 entry: Public Stoa swaps dashboard (Robinhood Chain)"
- Write AGENT_SUMMARY.md with:
  - Root cause: what was wrong and why
  - Fix: what you changed and the reasoning
  - Verification: how to confirm it works
  - Concerns: anything a reviewer should know

---

## Stop conditions

If ANY of these are true, write "UNCERTAIN: [reason]" at the top of AGENT_SUMMARY.md, make NO code changes, and stop:
- The fix requires changing more than ~5 files
- You cannot determine what the correct behavior should be
- The issue requires a database migration, API key, or external service
- You find 3+ open PRs already attempting this fix (high competition)
- The repo is not in a language/framework you can reason about confidently

A clean UNCERTAIN is better than a bad PR.
