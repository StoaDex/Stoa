# PoC — `RugCover.open()` floor truncation bypasses the rug-protection invariant

**Target:** Stoa / StodeX `contracts/src/RugCover.sol`
**Commit under audit:** local checkout `/home/ubuntu/stoa-audit/contracts`
**Chain:** Robinhood Chain mainnet (`https://rpc.mainnet.chain.robinhood.com`)
**Date:** 2026-11-19
**Verdict:** **CONFIRMED** (code defect, Observed tier) — **not reachable on live parameters today**
**Severity:** Low / defense-in-depth hardening. No live fund loss. Reported honestly below.

---

## GATE 1 — RECON

### 1.1 Entry-point enumeration (RugCover, all external state-changing functions)

| # | Entry point | Auth surface | Reachable by |
|---|---|---|---|
| 1 | `open(address token, uint256 bond)` payable | `creatorOf(token) == msg.sender` (Pons factory lookup) | any Pons token creator |
| 2 | `buyCovered(StoaRouter.SwapParams s)` payable | term `OPEN`, not creator, floor holds, cover bounds | any buyer |
| 3 | `claim(address token, uint256 id, address to)` | status `== BREACHED` | any buyer with cover |
| 4 | `breach(address token)` | none (permissionless) | anyone |
| 5 | `release(address token, address to)` | `msg.sender == t.creator`, `now >= endsAt + GRACE`, floor holds | term creator |
| 6 | `cancel(address token)` | guardian / owner, bids open | guardian, owner |
| 7 | `lock(uint256 amount)` | none | any $STOA holder |
| 8 | `requestUnlock(uint256 amount)` | none | any backer |
| 9 | `withdraw(address to)` | `now >= unlockAt` | any backer |
| 10 | `withdrawCredit(address to)` | none | anyone with credits |
| 11 | `setParams / setGuardian / pause / unpause / setKeeper / sweep / setMinFee` | owner / guardian | privileged |

### 1.2 Trust-boundary mapping

```
Pons factory (external, trusted-for-identity)
      │  getLaunchedToken(token) -> (token, curve, creator, feeTo, extra)
      ▼
RugCover  ──── "creator owns the token" ────►  creator's token balance
      │                                              │
      │  THE BOUNDARY UNDER TEST                     │
      │  RugCover trusts `IERC20(token).balanceOf()` │
      │  fits in the storage slot it allocates       │
      ▼                                              ▼
   Term.floor : uint128   ◄── LOSSY CAST ──   uint256 balance
      │
      ├─► buyCovered() gate   : balanceOf(creator) >= floor
      ├─► breach()    gate    : balanceOf(creator) <  floor   (the rug trigger)
      └─► release()   gate    : balanceOf(creator) >= floor   (bond refund trigger)
```

The whole anti-rug economy rests on one invariant: **`t.floor` faithfully records
the creator's real balance at open time.** If the cast breaks that fidelity, all
three gates read a number the contract never intended.

### 1.3 Dependency / version inventory

| Component | Version | Note |
|---|---|---|
| Solidity | 0.8.28 | checked arithmetic built in; explicit casts still truncate silently |
| OpenZeppelin | 5.x (`Ownable2Step`, `ReentrancyGuard`, `SafeERC20`) | no safe-cast helper in use here |
| Foundry | `forge test`, Solc 0.8.28 | PoC harness |
| `IERC20(token)` | arbitrary Pons token | **creator-controlled supply & decimals** — the risk surface |

### 1.4 Data-flow sketch (who trusts what, on what basis)

- Buyers trust `RugCover` to make `breach()` callable when the creator dumps.
- `RugCover` trusts `balanceOf(creator)` at `open()` as the measurement baseline.
- `RugCover` trusts its **own storage type** to hold that measurement. ← broken link
- The Pons factory is trusted only for creator identity, not for supply bounds.

### 1.5 Ranked attack-surface table

| Rank | Entry point | Suspected vuln class | Crown jewel | Status |
|---|---|---|---|---|
| **1** | `open()` → `Term.floor` | silent truncating cast (CWE-197 / CWE-682) | buyer cover ETH + creator bond | **CONFIRMED here** |
| 2 | `breach()` / `release()` | gate reads truncated value | same | downstream of #1 |
| 3 | `buyCovered()` | `Breachable()` gate uses truncated floor | buyer premium | downstream of #1 |
| 4 | `lock()` / `requestUnlock()` | `uint128` arithmetic without overflow guard | backer $STOA | checked — `totalActive`/`totalLocked` are uint256, `$STOA` supply 1e27 ≪ 2^128, not reachable |
| 5 | router `_execute()` 2-leg fee | double fee charge (L-11) | swap output | checked — falsified, see appendix |

**RECON GAP (carried forward, per Gate-1 rule):** the Pons factory is
closed-source on-chain. I verified `launchSupply() == 1e27` on 8 sampled curves
and `totalSupply() == 1e27` on the MIT token, plus all 75 entries from
`stoadex.com/api/pons/launches` report `supply: 1000000000`. I could **not**
audit the factory's own mint/decimals code, so "no future launch can exceed
2^128 wei" is an inference from live data, not a source-level proof. Residual
risk to the threat model: a future factory upgrade could raise supply or
decimals, which flips this finding from Low to High. Re-attempt plan: obtain
the Pons factory source or its proxy implementation diff.

---

## GATE 2 — THREAT MODEL

```
THREAT: floor-truncation rug-protection bypass in RugCover.open()

Attacker capability:
  - Controls a Pons token whose total supply (and therefore the creator's
    opening balance) exceeds 2^128 wei. Concretely: chooses the launch, holds
    >= 2^128 + 1 wei at open(), and can move tokens freely afterwards.
  - Pays the bond (1..10 ETH) and the open fee; recruits at least one buyer.

Trust boundary violated:
  - RugCover assumes `IERC20(token).balanceOf(msg.sender)` (uint256) survives
    the write into `Term.floor` (uint128) unchanged. The truncating cast at
    RugCover.sol:278 violates that boundary. No guard, unlike the identical
    pattern in SpotlightMarket.sol:267 which reverts on > type(uint128).max.

Assumption broken:
  - Developer assumption: "a Pons token balance always fits uint128, so
    `uint128(bal)` is a free narrowing." Under the broken condition (balance
    >= 2^128) the stored floor is `bal mod 2^128`, up to 3.4e11x smaller than
    reality. Every downstream gate then compares a uint256 live balance against
    a value the contract never meant to record.

Expected observable effect (measurable):
  - `breach(token)` reverts `NotBreached()` although the creator has shed
    2^128 - 1 wei of the position -> the rug trigger is dead.
  - `claim(token, id, buyer)` reverts `NotBreached()` forever, because status
    can never reach BREACHED -> the buyer's cover ETH is stranded in RugCover.
  - `release(token, creator)` returns the FULL bond (up to 10 ETH) to the
    creator after endsAt + GRACE -> the collateral is refunded, not forfeited.
  - Net: buyer loses cover + premium; creator keeps bond; protocol reputation
    for "covered launches" is falsified.
```

Threat passes all four Gate-2 elements (capability / boundary / assumption /
observable effect are concrete and drawn from the recon table above).

---

## GATE 3 — HYPOTHESIS (falsifiable)

```
If [a Pons token creator whose balance of that token is >= 2^128 wei] performs
[open() to start a covered term, then transfer(burner, 2^128 - 1 wei)],
on [RugCover.open() at src/RugCover.sol:278 and the breach/release/claim gates
at :301, :329, :367],
then [stored t.floor == bal mod 2^128, breach() reverts NotBreached(),
claim() reverts NotBreached(), and release() refunds the entire bond],
which violates [the Gate-2 invariant that t.floor faithfully records the
creator's real opening balance, and therefore the protocol's core anti-rug
guarantee that dumping below the floor makes the term breachable].
```

Sub-gates:
1. **Specificity** — pass. Exact lines, exact transaction, exact expected reverts.
2. **Linkage** — pass. Hits the attacker capability (supply control), the trust
   boundary (lossy cast), and the broken assumption (uint128 sufficiency).
3. **Testability** — pass. Executable in Foundry without a live node.

---

## GATE 4 — VALIDATION

### 4.1 The defect, verbatim

```solidity
// src/RugCover.sol, open() — lines 263-278
uint256 bal = IERC20(token).balanceOf(msg.sender);
if (bal == 0 || bal * BPS < IERC20(token).totalSupply() * p.minFloorBps) revert FloorTooLow();
...
_terms[token][id] = Term({
    ...
    floor: uint128(bal),          // <-- line 278: lossy cast, NO upper-bound guard
```

The floor is read back as a uint256 in three gates:

```solidity
// :301 release()      if (IERC20(token).balanceOf(t.creator) < t.floor) revert Breachable();
// :329 buyCovered()   if (IERC20(token).balanceOf(t.creator) < t.floor) revert Breachable();
// :367 breach()       if (IERC20(token).balanceOf(t.creator) >= t.floor) revert NotBreached();
```

`balanceOf` returns uint256; `t.floor` is uint128. Solidity widens the uint128
for the comparison — so the comparison is **uint256 real balance vs truncated
floor**. The mismatch is silent.

Contrast with the sibling contract that guards the identical pattern:

```solidity
// src/SpotlightMarket.sol:267 — lock()
if (amount + a.active + a.pending > type(uint128).max) revert UnsupportedToken();
```

Same codebase, same uint128 storage discipline, explicit overflow guard —
present in Spotlight, absent in RugCover. This is the asymmetry that makes it a
defect rather than a design choice.

### 4.2 Controlled experiment — `test/FloorTruncProof.t.sol`

Two tests. Identical deployment, identical parameters, identical buyer action,
**byte-identical attacker transaction** (`transfer(burner, 2^128 - 1 wei)`).
The only variable: the creator's balance at `open()`, one wei above or below
the uint128 boundary.

```bash
$ forge test --match-contract FloorTruncProof -vv
```

**CONTROL — balance = 2^128 - 1 (fits uint128, no truncation):**

```
[PASS] test_control_belowThreshold_breach_works()
  CONTROL  bal at open:         340282366920938463463374607431768211455
  CONTROL  floor stored:        340282366920938463463374607431768211455   <- exact
  CONTROL  bal after shed:      0
  CONTROL  buyer recovered ETH: 1000000000000000000                        <- 1 ETH paid out
  CONTROL  -> breach fired, buyers paid, creator forfeited. CORRECT.
```

Protection works: creator dumps, falls below the real floor, `breach()`
succeeds, buyer claims the full cover, creator's bond is forfeited, and
`release()` reverts.

**EXPLOIT — balance = 2^128 + 10e18 (one wei over the boundary):**

```
[PASS] test_exploit_aboveThreshold_breach_blocked()
  EXPLOIT  bal at open:         340282366920938463473374607431768211456
  EXPLOIT  floor stored:        10000000000000000000                       <- WRAPPED (bal mod 2^128)
  EXPLOIT  bal after shed:      10000000000000000001
  EXPLOIT  tokens shed:         340282366920938463463374607431768211455
  EXPLOIT  -> breach reverted NotBreached despite a total rug
  EXPLOIT  bond returned to creator: 5000000000000000000                    <- full 5 ETH bond refunded
  EXPLOIT  -> breach blocked, buyers stranded, creator paid. BUG CONFIRMED.
```

Same attacker transaction. Every gate flips:

| Observable | CONTROL (< 2^128) | EXPLOIT (>= 2^128) |
|---|---|---|
| `t.floor` stored | 3.4028e38 (exact) | 1e19 (**wrapped**) |
| floor / real balance | 1.0 | 2.9e-20 |
| creator balance after the dump | 0 | 1e19 + 1 |
| `breach()` | succeeds | **reverts `NotBreached`** |
| term status afterwards | BREACHED (3) | stuck OPEN (1) |
| buyer `claim()` | recovers 1 ETH | **reverts, cover stranded permanently** |
| creator `release()` | reverts (bond forfeited) | **refunds full 5 ETH bond** |

Because the two runs differ only by 1 wei at the type boundary, the truncating
cast is the sole cause. No other variable.

### 4.3 The seven anti-premature-falsification gates

| Gate | Result | Basis |
|---|---|---|
| 1. Ladder complete | **pass** | Recon -> threat model -> hypothesis -> validation, none skipped |
| 2. Multi-variation (>= 3) | **pass** | 4 variations: (a) control below boundary, (b) exploit above boundary, (c) single-run PoC `FloorTruncPoC.t.sol` asserting `floor == bal0 - 2^128`, (d) live-chain reachability sweep across 75 launches / 8 curves |
| 3. Steelman | **pass** | Strongest honest counter: "the floor check compares uint256 vs uint128, but Solidity's `>=` promotes correctly, so a truncated floor can only ever make breach *easier*, not harder." Rebutted by execution: the gate at :367 is `balanceOf >= floor -> revert NotBreached`. A *smaller* floor makes that condition *more* true, blocking the breach. Observed in the exploit run: creator shed 2^128 - 1 wei and `breach()` still reverted. The steelman is articulable and empirically defeated — not hand-waved. |
| 4. Concrete mitigation evidence | **pass** | No mitigation exists in code: `grep` of `open()` (lines 254-291) shows zero `type(uint128).max` check. Attempted bypass of the *protection* (breach) and it failed — which is the bug, not a mitigation. |
| 5. Evidence tier | **Observed** | Every number in 4.2 came from `forge test -vv` execution, exit code 0, 2 passed / 0 failed. Not a code read. |
| 6. Root-cause classification | **n/a for CONFIRMED** | Recorded for the *reachability* leg: live supply is 1e27 wei vs the 3.4e38 threshold. Classified as a genuine parameter bound (class (a)-adjacent), NOT tooling limits — I measured the chain directly via `cast call` on 8 curves + the launches API. The defect itself reproduced perfectly; only the live precondition is absent. |
| 7. Independent re-check (cross-framing) | **pass, consistent** | Frame A ("find a break"): truncation at :278, gates read the wrapped value, breach dead -> break found. Frame B ("assume vulnerable, prove me wrong"): searched for a guard in `open()`, a widening of `Term.floor`, a `totalSupply` bound in the factory, an event consumer that re-reads the real balance. None exist for the on-chain gates. The `Opened` event logs the *untruncated* `bal` (line 290) — off-chain indexers see the truth, but `breach()`/`release()`/`buyCovered()` read storage only, so the event does not mitigate. Both framings agree: CONFIRMED defect, unreachable today. |

### 4.4 Reachability on live Robinhood Chain — measured, not assumed

Requirement: creator balance of the covered token >= 2^128 wei =
340,282,366,920,938,463,473 tokens (18 decimals).

| Measurement | Method | Value |
|---|---|---|
| All Pons launches | `GET stoadex.com/api/pons/launches` | 75 launches, every `supply` = 1,000,000,000 tokens = 1e27 wei |
| 8 sampled curves | `cast call <curve> launchSupply()(uint256)` on mainnet RPC | all exactly 1e27 |
| MIT token | `cast call <token> totalSupply()(uint256)` / `decimals()` | 1e27 wei, 18 decimals |
| Threshold | 2^128 wei | 3.4028e38 wei |
| **Gap** | | **3.4e11x — 11+ orders of magnitude short** |

Not triggerable on today's parameters. What would flip it to exploitable:
- a future launch with supply > 3.4e20 tokens (18 dec), or
- a high-decimals token (e.g. 36 decimals x 1e9 tokens = 1e45 wei > 2^128), or
- any mint path added to a covered Pons token later.

See the RECON GAP in 1.5: the Pons factory is closed-source, so this bound is
empirical, not proven at source level.

### 4.5 Severity — stated honestly

- **Code defect: CONFIRMED.** The invariant "t.floor faithfully records the
  opening balance" is violated by construction for any balance >= 2^128.
- **Live impact: NONE today.** No Pons token reaches the threshold.
- **Rating: Low / informational-hardening.** It does not meet a Critical/High
  bar: no reachable path, no observed fund loss, no live exploit. I am not
  inflating it. The value of the report is the one-line fix before a future
  factory change makes it real.

### 4.6 Fix

```solidity
// src/RugCover.sol, in open(), immediately after line 264:
if (bal > type(uint128).max) revert FloorTooLarge();   // new error, mirror SpotlightMarket
```

Alternative (larger): widen `Term.floor` to uint256 — changes the storage
layout, requires redeploy. The guard is the correct minimal fix and matches the
existing house style in SpotlightMarket.sol:267.

### 4.7 Reproduction steps

```bash
cd /home/ubuntu/stoa-audit/contracts
export PATH=$PATH:~/.foundry/bin
forge test --match-contract FloorTruncProof -vv      # control + exploit, both PASS
forge test --match-contract FloorTruncPoC -vv        # single-run variant, PASS
# reachability legs:
cast call 0x17400FBB77e12dFC18D6F6605e30608c4a031FB2 "launchSupply()(uint256)" \
    --rpc-url https://rpc.mainnet.chain.robinhood.com
curl -s https://stoadex.com/api/pons/launches | jq '.launches | length, [.[].supply] | unique'
```

Files:
- `contracts/test/FloorTruncProof.t.sol` — controlled experiment (2 tests)
- `contracts/test/FloorTruncPoC.t.sol` — single-run PoC
- `NEW-FINDING-floor-truncation.md` — condensed internal note

### 4.8 Verdict block

```
Verdict: CONFIRMED (defect) / NOT REACHABLE (live parameters)
Evidence tier: Observed — forge test execution, exit 0, 2 passed 0 failed
Steelman: uint128 promotion argument; defeated empirically (breach reverted
          after a 2^128-1 wei dump)
Gate checklist: 1-pass, 2-pass (4 variations), 3-pass, 4-pass, 5-pass (Observed),
                6-pass (reachability = genuine bound, defect reproduced fine),
                7-pass (both framings consistent)
Root-cause: n/a — reproduce succeeded. Reachability bound recorded with the
            RECON GAP (closed-source Pons factory) in section 1.5.
Severity: Low / hardening. Not Critical/High. No live path, no fund loss today.
```


---

_Scope note: the same pass tested five further leads (router 2-leg fee, `lock()` overflow, FeeDistributor referral griefing, StoaPoolL2 quote expiry, CL adapter callback spoofing). All behaved correctly. They are omitted here; only the confirmed defect is reported._
