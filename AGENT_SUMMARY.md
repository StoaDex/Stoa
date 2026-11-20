# Bounty #3 entry: Public Stoa swaps dashboard (Robinhood Chain)

Issue: https://github.com/StoaDex/Stoa/issues/14 · Commit: `27bea9d`

## Root cause

The issue is a bounty submission, not a code defect. Stoa's build bounties live in
`web/app/(app)/build/page.tsx`: a `BOUNTIES` array rendered on stoadex.com/build, plus a
`USED` list ("Used by") of third-party integrations. Bounty #3, "Public dashboard", was
still shown as open with no entry, and the submitted community dashboard was not listed
anywhere — so the live page contradicted the accepted submission (it also advertised
"2 OPEN" when only one bounty is left).

The precedent is commit `c0dbde8`, which claimed bounty #1 (Telegram bot): it added a
`won: { href, tx }` field to that bounty, listed the bot under `USED`, and decremented the
open count. This change mirrors it.

## Fix

One file, `web/app/(app)/build/page.tsx`:

1. Bounty #3 marked claimed: `won: { href: "https://github.com/StoaDex/Stoa/issues/14" }`,
   so it renders the `Claimed` chip and an `Entry` link to the submission.
2. `won.tx` made optional (`tx?: string`) and the rendered `· Paid tx` link wrapped in
   `{b.won.tx && ...}`. The USDG payout transaction for this entry is not known, and
   inventing or omitting a hash would have produced a dead `<a href={undefined}>` labelled
   "Paid tx". Bounty #1 keeps its real tx and renders exactly as before.
3. Dashboard added to `USED` as "Stoa Dashboard · Community" →
   https://doms99999.github.io/stoa-dashboard/, described as reading the router's `Routed`
   events, matching how the Telegram bot was listed.
4. Panel header `· 2 OPEN` → `· 1 OPEN` (swap widget is the only bounty still open).

Nothing else touched: no contracts, no docs, no config, no dependencies. I did not add a
`web/lib/changelog.ts` entry, because the precedent claim commit did not either (the
bounties themselves are already in the 2026-11-20 changelog entry).

## Verification

Run from `web/` (`npm install` first — node_modules is not checked in). All of CI's web job
passes:

```
npx tsc --noEmit     # clean
npm test             # 41 tests, 0 failures
npm run build        # succeeds, /build prerenders
```

Rendered `/build` HTML from the build output confirms the behaviour:

- bounty #1: `Claimed … <a href=".../issues/7">Entry</a> · <a …>Paid tx</a>` (unchanged)
- bounty #3: `Claimed … <a href=".../issues/14">Entry</a>` with no "Paid tx" link
- the dashboard URL appears in the Used by list, and the header reads `1 OPEN`

## Concerns for a reviewer

- **"Claimed" without a payout link.** The entry is accepted, the payment is not recorded
  here. When the USDG is sent, add `tx: "https://robinhoodchain.blockscout.com/tx/0x…"` to
  bounty #3's `won` object and the "Paid tx" link appears — no other change needed. The
  payout address from the issue is `0xD294e1d6824ddC84172452EE88D57c014543F7D0`; it is
  deliberately not in the page (bounty #1 does not list one either).
- **I did not commit `git add -A`** as the task file suggested. The working tree arrived
  with ~477 pre-existing whitespace-only modifications (CRLF vs LF on a Windows checkout,
  e.g. `contracts/test/Stoa.t.sol` shows 510 identical lines replaced). Committing those
  would have buried the fix; only `web/app/(app)/build/page.tsx` is staged and committed.
  `BOUNTY_TASK.md` and this file are left untracked.
- **External links are unverified.** The dashboard URL, its GitHub repo, and the snapshot
  figures (32 swaps, $530, 19 traders) come from the issue text; I had no network access to
  confirm the site is live or that its queries are published. Someone should load
  https://doms99999.github.io/stoa-dashboard/ before this ships, since /build states that
  an entry must be live and public with open code.
- The build page has no test coverage (`web/test/` holds only lib-level tests), so the
  rendered-HTML check above is the strongest available verification.
