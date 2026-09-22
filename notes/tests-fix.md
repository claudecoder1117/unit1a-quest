# tests — fixer round 1

Lane: `tests` (the `tests/*` suites and the two QA harness files the round's findings named,
`qa/audit-states.mjs` and `qa/layout-audit.mjs`).

`cd /Users/oliver/Projects/unit1a-quest && node --test tests/` → **2507 tests, 2503 pass, 0 fail,
4 skipped, 238 s** at the end of this round.
`node qa/layout-audit.mjs --only job --vp 375x667 --engine chromium --theme light` →
**11 states, 0 findings, 40 s** (was: 5 states, two of which never arrived and passed anyway).

---

## 1 · The rating tests that asserted nothing  (finding 1, MAJOR)

**`tests/job-exploit.test.mjs`** — the `jobs()` harness took its `q̂` from a hardcoded list
(0.55/0.70/0.80/0.85/0.90) while drawing its rungs from bands that clear 81–99 % of the time. The
window was therefore scoring a player whose stated belief sat far below their realised rate, which
is the one thing `w = 4q̂(1−q̂)` cannot price, and the mixed baseline scored a **raw 11.930, clamped
to a perfect 10.00**, under a single assertion of `> 5`.

* `qHat` is now the band's own clear rate, `1 − bandFor(band)[4]` — the same coupling
  `state.js:792` gets for free by reading `call.qHatFor` off the save the outcome wrote.
* the baseline is bounded **on both sides** (`8.94 ± 0.15`), asserted **not clamped**, and its rank
  is pinned at Called 5; the realised clear rate is asserted against the q̂ it reported.
* the old behaviour is kept as a **named control** (`jobs('mixed', { qHatOf })`): understating q̂
  must clamp, and must score higher than honest play. That is the defect, machine-checked.

**`tests/job-call.test.mjs`** — added `J2 · end to end: the rating a calibrated student actually
earns, on a real save`. It plays eight jobs on five seeded saves through `state.applyTarget`, taking
the **call** from `honestCall(qHatFor(save, make))` (clamped to what the rank may legally call), the
**outcome** from `drawRung(bandFor(mShown(rec)))`, and writing the history entry `qHatFor` reads
back — the loop `state.js:778/792` closes in the shipped game and no test anywhere closed before.

Measured, and now asserted: **3.67 · 4.27 · 4.83 · 5.81 · 6.64**, mean 5.04, never clamped, window
11–41 of 50 slots. The isolated Monte Carlo's 9.998 is the ceiling of a *full* window, not a
prediction about play — end to end only informative calls fill the fixed-50 divisor.

**`tests/job-week.test.mjs`** — the propriety sweep is correct for what it claims (`p* = q` at a
fixed `q`), and it is now labelled as such. Added `THE OTHER AXIS`: over the whole (pred, score)
grid the credit's argmax is the **entire diagonal** — (0, 0) pays exactly what (100, 100) pays — so
the scoring rule does not exclude the tank. The brakes are then asserted where they actually live:
`mockCallEligible` (half the items attempted, 20 s per item, no retry, one per day, one per seed),
one window slot per day out of fifty, and the mastery/Readiness cost of a 0-score paper.

## 2 · The ρ = 1 identity  (finding 2, BLOCKER)

`crewValue` is `shapeConstant(shape) * (w * (1 − m/100))` and `skillState().score` is
`def.w * (1 − m/100)`. Spearman ρ = 1 between them is arithmetic. §1 of `job-align.test.mjs` still
asserts it — it is the document's claim and it does pin the *field* both functions read — but the
acceptance now rests on **§5, added this round**: the realised payoff gradient against a realised
ΔReadiness, two independent pipelines.

* GAME side: the marginal LOOSE one STEADY point returns, priced off `rhoFor` / `carryFor` /
  `missFor` / `chainAfterTarget`, rungs from `bandFor` + `drawRung`, **under G2's real idle rule**
  (`ownDueReviewIndices`), common random numbers between the two arms.
* STUDY side: `readiness(save).r` before and after one clean answer through `mastery.updateSkill`.

Measured over 100 composed boards: **ρ = 0.65 over all 19 makes, 0.23 over the 9 the corpus ever
serves**, and only **2–4 makes per board can return anything at all** (a make's own due review is
idle, so a make served once pays nothing). The mechanism is supply, not weakness:
`encounters_i ∝ w_i` — `crewValue`'s middle factor — is the modelling step that does not survive
contact with `composePage`. A rotation control confirms the correlation is about the makes.

## 3 · The ledger's flat arm  (finding 3, MAJOR)

* `writeLedgerA` gained the three writes it was missing from `card.js`: the daily-goal +
  `markStreakDay` line (`card.js:903`), the **cleared-Variant** branch (`card.js:934-940`:
  `save.variants`, `goldDays`, `foilProgress`, thaw) and the **missed-Variant** branch
  (`card.js:1005`: `freezeVariant`). `variants`, `frozen`, `daily` and `streak` are no longer
  compared between two objects nothing ever touched.
* `runFlatScreen()` — a new arm that runs **all four** of `run.js:finish()`'s writes
  (`finishPage`, `pushRun(makeRunRecord(…))`, `checkDailyGoal`, `logForecast`).
* `J5c — the comparison is not vacuous, and where it still is, it says so`: a per-key audit that
  fails when a compared key stops being written, and names the five that the arms genuinely cannot
  reach (`runs`, `forecastLog`, `variants`, `frozen`, `trophies`) instead of letting them pass free.
  The Variant branches are driven directly, because this corpus composes no Variant items.
* `THE GAP` pins the divergence the honest arm exposes — **see Requests below**.

## 4 · The ≤ 26 KB save budget  (finding 4, MAJOR)

The `runs[]` line of G7's table is a **reserved ceiling**: no shipped path writes a job run record.
`withoutRunFields` was being printed and then checked only against `<= added`, which is free.

* the figure the layer actually costs today is now two-sided: `withoutRunFields ≤ SAVE_BUDGET_KB.subtotal`
  and `> 15 KB`, and the reserved line is asserted to be worth more than 4 KB of the bound.
  Measured this round: **25.69 KB with the reserved fields, 21.44 KB without**.
* `THE RESERVED LINE IS STILL RESERVED` machine-checks the grep the comment used to assert in prose:
  `screens/job.js` contains no `pushRun(`, and `ratingDelta` occurs in no file under `site/`. When
  either becomes false the test fails and names the two acceptable resolutions.

## 5 · The split criterion  (finding 5, BLOCKER)

`projectFor` (board.js:343) spends **measured** means for the five fixed phases and **constants**
for the two per-target terms (`ANSWER_MINUTES_PER_TIER`, `DECISION_SECONDS`) — which are 60–80 % of
the projection. Every walkthrough in the file advanced its fake clock by exactly those two tables,
so "within 5 points" was arithmetic on one table.

Added `J8 · the split criterion against a clock the projection does not own`: the same machine, the
same two accumulators, driven by a student who is **not** the tables (slower on the stem, quicker on
the beat), seasoned with three of their own sittings so the fixed phases are genuinely theirs.

    shape   board printed   debrief measured   gap
    RUN         31 %             17.4 %        13.6
    JOB         31 %             16.1 %        14.9
    JOB12       30 %             15.0 %        15.0
    VAULT       31 %             16.8 %        14.2

against a published ceiling of 5. A control feeds the same function a clock built out of the two
tables and the gap collapses — which names the mechanism as the per-target terms rather than the
fixed phases.

## 6–10 · The QA harness

* **`attemptWrong` (audit-states.mjs)** — `.w-cz-slot` was tried *before* `.wd-chip`, so on a cloze
  every attempt selected a blank, left it empty and graded `almost` (free), and the card never
  reached a graded outcome. `midweek.json`'s first job target is the VOC cloze `def-02`, so this
  fired on every job state in the catalog. Added a cloze branch that fills **every** blank through
  its own picker (and any `.w-cz-in` typed blank), and a **pairs** branch that picks `data-count`
  actual pairs instead of one lone angle. `job-payout` reaches its beat in 2 rounds now.
* **`unreached` (layout-audit.mjs)** — `runState` now checks `state.root` after `prepare()` and
  pushes a **BLOCKER** when the declared root is not in the DOM, then skips the sweep. A state that
  cannot be reached fails loudly instead of silently measuring whatever screen was up. It
  immediately caught two of my own new states while I was building them, and one that has nothing to
  do with this lane — see Requests.
* **states added**: `job-getaway`, `job-brief`, `job-vault`, `job-answer-kb`, `job-payout-kb`, and a
  real `job-debrief` that plays a two-target job to a CRACKed vault. The old walk-out state is kept
  under its own name, `job-debrief-quit`, because the quit debrief has no regret lines, no mint, no
  histogram and no skill bars.
* **`trimJob`** cuts the drafted queue to two targets and re-enters the job, which is what makes the
  getaway, the vault and a finished debrief reachable in seconds. It leaves the app **before**
  editing `localStorage` — the store flushes its in-memory save on unload, so editing under a live
  page and then navigating writes the untrimmed queue straight back over the edit.
* **per-state viewports** — a state may now declare `vps`. `VP_KB = [375×667, 375×331, 390×400,
  320×460]` is what an open keyboard actually leaves; `VP_ALL`'s shortest phone row is 568 px, so
  J6's own acceptance configuration ("375×667 **with the keyboard open**") was measured at zero
  viewports. An explicit `--vp` still wins, and a state with its own list skips the text-zoom pass
  (that pass resizes to 1900×1200 and would un-pin the configuration the state exists to measure).

## 11 · The crew argmax  (finding 11, BLOCKER — partly wrong, see below)

Added `J4 · 13 · the 4×2 matrix measured off composeBundles → draftUnion, under G2's real idle rule`.
All five parameters are measured on the queue a job is actually played on, and the argmax is
computed by running `steadyPerPoint` / `heldPerPoint` over **those** numbers rather than over
`CREW_MATRIX.rows`:

    shape   mBar     eF      eH      P3      Σm_saved | S/pt   H/pt   measured   published
    RUN     1.2108   1.2647  0.4412  0.1422  0.6000   | 1.50   0.09   STEADY     STEADY
    JOB     1.3312   1.8235  0.7647  0.2588  0.6000   | 3.37   0.25   STEADY     HELD
    JOB12   1.2797   2.2778  1.2778  0.1984  0.8000   | 6.04   0.61   STEADY     HELD
    VAULT   1.2000   1.5000  0.7778  0.1387  0.0000   | 6.81   0.53   STEADY     HELD

`e_held` is 3–6× below the published figure on every shape because HELD is gated on mastery and
mastered makes are the ones the composer serves least. §8's argmax test is annotated to say it pins
the *document*; §13 is the game. The sensitivity is asserted too: there IS an `e_held` at which HELD
wins, so the mechanic is repriceable rather than dead.

---

## Requests (other lanes)

1. **`screens/job.js` writes no `runs[]` record, no `forecastLog` point and never calls
   `checkDailyGoal`.** `run.js:finish()` does all three; `screens/job.js:943` calls `state.endJob`
   and stops. G3.7 proof 11 / G9 #8 name `forecastLog` among the six keys that must be
   byte-identical, and COMPOSED-GAME.md:795 prices a job's `runs[]` fields at 4.8 KB — so the
   document expects a job to write one. Pinned in `tests/job-ledger.test.mjs` → `THE GAP`, and in
   `tests/job-save.test.mjs` → `THE RESERVED LINE IS STILL RESERVED`. Both tests fail, with the
   instruction in the message, the day the job screen starts writing them.
2. **`board.js projectFor` spends constants for the per-target terms.** Fold the student's own
   answer and decision seconds into `game.ledger.phaseMeans` (the machinery is already there —
   `state.js` folds `g.ph[phase]`) and spend those, or stop describing the board↔debrief agreement
   as measured in COMPOSED-GAME G1 statement 2. `tests/job-split.test.mjs` → `THE GAP` fails when
   this lands, and its message says to delete it and assert agreement instead.
3. **`crew.js simulateJob` (:734) and `encountersIn` (:706) still read `isDueReview`**, which
   `crew.js:412` says is not the idle rule (`isIdleFor` is). Measured: on the drafted union the two
   rules agree on **2 280 of 2 280** (make, board) pairs, because `spreadSkills` never puts two due
   reviews of one make in one job — so nothing in the numbers above depends on it. It is still
   wrong in principle and `job-crew.test.mjs` §13 asserts the agreement, so it fails the day a
   drafted job carries two reviews of one make.
4. **G2's 4×2 matrix does not survive measurement** (§11 above). By G2's own rule the table is what
   updates. That means `site/data/job.js CREW_MATRIX`, and if HELD then loses everywhere the
   mechanic needs repricing or deleting — a product call, not a tolerance.
5. **`home-mock-cta` never arrives.** The new `unreached` detector found it on the first full-catalog
   run: `.home-primary[data-kind="mock"]` is not in the DOM on `mock-cta.json` (T−3, goal met, no
   Mock taken). Home now leads with "Tonight's Board", so either the Mock CTA has been displaced by
   the game layer at a moment where the Mock should still lead, or the state's root is stale. Home
   lane's call; it had been reporting PASS while measuring the wrong screen.

---

# tests — fixer round 2

Lane: `tests/*` plus the two QA harnesses the round's findings named (`qa/job-screen.mjs`,
`qa/job-walk.mjs`) and `qa/layout-audit.mjs`. Nine findings, all MAJOR but one BLOCKER. Every one is
a defect in what a test *establishes*, not in what it *claims*, so every fix below either widens the
population a test runs over, rebuilds one side of a comparison out of the shipped payout functions,
or replaces prose with a number the file computes.

Other lanes were editing `site/js/job/*`, `site/js/page.js`, `site/js/screens/job.js`,
`site/css/job.css` and `site/data/job.js` throughout this round. Everything below was measured
against the tree as it stood at the end; two findings (1 and 8) were partly closed by those lanes
while this one ran, and the tests now assert the fixed behaviour rather than the defect.

---

## 1 · The push/bag grid that compared the model with itself  (finding 1, MAJOR)

`tests/job-econ.test.mjs` — `the PRINTED threshold never contradicts the app's own push/bag
arithmetic, anywhere on the grid`. "Anywhere" was `loose × chain × L × call`: `scope`, `guarded`,
`tokens`, `cold`, `tell` and `x2` never appeared, and both sides of the comparison were
`breakevenQ` and `pushMinusBag`, which shared the identical omission.

* The grid now carries an eleventh axis — every one of those six factors, off, on, and all together,
  guarded and unguarded — and the right-hand side is `pushMinusBagFromPayout`, i.e. PUSH − BAG
  rebuilt from `carryFor` / `missFor` / `bagBankExact`. **5 000+ multiplied states and 5 000+
  payout-cross-checked verdicts**, asserted, where there were none.
* The J1 lane had, in parallel, split `stateL` into `gainLFor` / `lossLFor` and added its own
  payout-built test. The two are complementary: theirs walks eight named priced targets, this one
  sweeps the whole state space. Neither existed before the round.

**The other half of finding 1**, which nothing else covered: the escalation direction was asserted
only on `deepQStar` / `shallowQStar` — the two forms `econ.js` says are the published TABLE's and are
NOT printed. New test, `the PRINTED q* falls with the chain on a shallow pile — and can RISE on a
deep one`:

    S > 0, shallow at every chain   the printed q* strictly FALLS    241 / 241 ladders
    deep at every chain             it RISES on                      145 / 543 ladders

    L 70, S 300, call 70:  0.2857 → 0.2914 → 0.2939 → 0.2961 → 0.2977

`0.10·S` is the one term that does not scale with `m_chain`, so on a deep pile the fee's head start
at `m = 1` is spent and `q*` climbs toward `L_loss·P / (L_gain·ρ̄·W + L_loss·P)`. The fee is exactly
what G3.2's deep table drops. **See Requests 1.**

## 2 · The 500-job simulation asserted the player's press, not the guard's y  (finding 2, MAJOR)

`tests/job-guard.test.mjs` §10. G8's J3 row names `y` — `guardDist(save).y` — and the section
returned `counts.map(c => c/total)`, the player's empirical press `x`. The two are the same vector
only at ε = 0.

* `simulate()` now returns the GUARD's `y` (the mean of the last 100 published mixes) as well as `x`.
* **`equilibriumY(values, ε)`** — the closed form derived in the test from the best-response
  condition `v_i(1 − y_i) = k` with the un-pressed wings pinned at the floor `ε/n`:
  `k = (m − M) / Σ(1/v_i)` with `M = 1 − (n − m)·ε/n`. At ε = 0 it is `fixedPointMix` exactly.
  Asserted at every rank's ε to **1e-3**, not to a tolerance:

        rank 1 (ε .25)   y = .5667 .3500 .0833      rank 3/4 (ε .15)  y = .5800 .3700 .0500
        rank 2 (ε .20)   y = .5733 .3600 .0667      rank 5   (ε .10)  y = .5867 .3800 .0333

* A new arm drives the SAME dynamic through the shipped path — `pushHeat` → `xHatFrom` →
  `guardDist`, no re-implementation of `x̂` — and lands on the same closed form within 0.025.
* Two published statements are now pinned as false-in-the-shipped-game, with the number attached:
  at Called 1 the guard's `y₁` is 0.5667, **0.033 from the published 0.60**; and `y₃` is held at
  `ε/n`, so *"wing 3 leaves the support"* is an ε = 0 statement. At ε = 0 the shipped path settles
  at **7/11 : 4/11** rather than 0.60 : 0.40, because `xHatFrom` reads a ten-job window and the press
  is three indivisible tokens. **See Requests 2.**

## 3 + 4 · §6's alignment numbers  (findings 3 and 4, MAJOR)

`tests/job-align.test.mjs` §6. The header claimed *"top three on 97 % of boards"* and *"exact argmax
42 %"*. Neither reproduces under any reading of §6's own generator, seeds and `realisedTake`, and
neither was asserted by anything.

* New **§6.2**, computed by the file on the shipped seeds and asserted:

        per board, over ALL 19 makes      top3  43 / 100 = 43 %     argmax  19 / 100 = 19 %
        per board, over SERVED only       top3  99 / 100 = 99 %     argmax  57 / 100 = 57 %
        corpus argmax FAC2 ranks 8 of 19 by total ΔReadiness

  Both readings are asserted, and the served-only one is bounded against chance (mean 4.8 served
  makes per board, so a top-three hit is ~60 % for free) and labelled circular — restricted supply
  is the defect being measured.
* `rServed > 0.15` is gone. It was a hardcoded constant checked against a hardcoded constant: with
  the generator, the recipe and the board count held fixed and only the seed string changed, it
  fails on a third of re-seeds. New **§6.3** builds **24 independent corpora** (100 boards each,
  ~4 s) and asserts the distribution:

        ρ(all 19)   mean 0.6535  sd 0.0666  [0.567, 0.790]   ← robust; no corpus below 0.4
        ρ(served)   mean 0.2112  sd 0.1686  [-0.067, 0.612]  ← 8 of 24 at or below 0.15

  The claim that survives is the mean, and the spread is asserted too: if `sd` collapses the
  estimate has become stable and a floor could be asserted directly, and the test says so.
  With nine served makes 1/√(n−1) ≈ 0.35, which the observed spread is the order of. **See
  Requests 3.**

## 5 · The deferred critical, on 5 of 37 saves  (finding 5, MAJOR)

`tests/job-board.test.mjs` — `a target a job does not reach stays due and LEADS the next board`. The
loop carried `checked < 5`; 37 of the 50 corpus saves match its filter. Replaying its own assertions
over all 37 found **7 failures and 3 more in the first half**, none of them reported.

* The cap is gone (`checked >= 30`, with the count in the message).
* `Math.max(...deferredAt) < firstOrdinary` was MIS-SPECIFIED. `page.js isCriticalTarget` returns
  false for `role === 'rematch'`, and `composePage` step 2 seats every pending Rematch right after
  the two-item opener, so on any Page carrying one the assertion is unsatisfiable by construction —
  it would red-flag correct behaviour. It is replaced by what the composer actually guarantees, and
  what holds **37 / 37**: the deferred criticals lead the next board's REVIEW BLOCK, ahead of every
  `new` / `weak` / `floor` item. The Rematch cases are counted and asserted (≥ 6) so the day
  `isCriticalTarget` counts a pending Rematch, the stronger sentence can be restored.
* The genuine counterexample (corpus save 19) is asserted rather than excluded, and every occurrence
  must be exactly the bucket/overdue disagreement: criticality is bucket-based
  (`bucket ≤ 2 ∨ overdue ≥ 1 d ∨ sweep`), `composePage` sorts dues on overdue days, so a warm
  non-critical review 0.5 d overdue leads a deferred bucket-1 critical 0.2 d overdue. The test
  requires the leading item to be a due review that WINS the overdue sort and is non-critical only
  by bucket — anything else is a new defect. **See Requests 4.**
* The first half over-claimed too: it asserted the return of every non-Variant queue item, including
  `new` and `weak` cards that were never on the schedule (three corpus saves drop one to three of
  them, because the new-card pool is re-drawn per Page and shrinks when reviews are heavy). Global
  rule 5 is about the SCHEDULE, so the guarantee is now asserted over the due items, and every
  dropped pool card is required to have had no Leitner record.

## 6 · `trophies` was waived, not measured  (finding 6, MAJOR)

`tests/job-ledger.test.mjs` listed `trophies` among the keys *"compared without ever being written"*
with the note *"driven by the run summary, not by the grade"* — offered as a reason it was safe. It
is the mechanism of a loss: a job writes no run summary, so it cannot earn a run trophy the
identical flat play does earn. No call to `trophies.check()` existed anywhere in the file.

New **THE TROPHY GAP**: four corpus saves, an all-CLEAN script, `runFlatScreen` against `runInJob`,
`trophyCheck` on both. `flawless-page` fires on the flat arm and not on the job arm, on 4 of 4. Both
directions are then *explained by a transplant rather than by a comment*:

* every trophy the job LOSES must come back when the flat arm's `runs` is grafted on — otherwise it
  is a study-ledger divergence and the byte-identity tests above are lying;
* every trophy the job GAINS (`chain-8`, from `save.player.records.bestChain`) must appear when the
  job's Ledger B (`game` + `player`, neither of which is in `LEDGER_A_KEYS`) is grafted onto the
  flat arm.

It is asserted in the direction it runs, like `THE GAP`, and its message says to delete it and move
`trophies` into the byte-identity comparison once the job screen writes its run record.

## 7 · Proof 8 ran against a tanker stripped of its rewards  (finding 7, MAJOR)

`tests/job-exploit.test.mjs` priced every target as `{ scope: isMastered ? 0.5 : 1, cold: 1,
tokens: 0, guarded: false }`, so the "strictly dominated" claim was tested against a tanker paid
none of the three multipliers that reward tanking.

* Targets are now priced from a REAL record: one card per make through `schedule.applyOutcome`, so
  `bucket` / `overdueDays` (and therefore `cold`) come from the shipped scheduler; `scopeFlags`
  carries the item's own review status (`xp.scopeFor` reads `isReview` BEFORE `isMastered`); and a
  `tell` record is triggered by a miss and resolved by a clean clear, the pair `state.applyTarget`
  drives. The old arm is kept as a named control (`stripped: true`).
* New test **THE TANKER IS PAID WHAT TANKING PAYS** asserts, per seed, that all three multipliers
  move the tanker's way, and that the stripped control is blind to them (`cold ≡ 1`, `tell ≡ 1`).
* The conclusion survives, and is now established rather than assumed: honest wins **8 / 8** seeds,
  tanker/honest **0.789** (was 0.709 with the multipliers deleted; the round-2 critic's independent
  full state-machine run got 0.769).
* A second arm runs the sharpest form — throw at **call 50, where `P = 0` and the miss is free**.
  Honest still wins 8 / 8, tanker at 78.6 % of honest.

## 8 · The 264 px board sheet  (finding 8, BLOCKER)

`assert.equal(LAYOUT.boardSheetPx, 264)` against the literal `264` in `site/data/job.js`. Nothing
else consumed the constant: `grep -rn 264 site/css/` was empty and the board rendered at ~477 px.

* The self-comparison is gone. In its place, a rule that cannot rot: **every `LAYOUT` px constant
  must have a consumer that can fail a run** — a CSS custom property carrying its value and
  consumed by a rule, or a rendered measurement in the QA harness that reads it. The test computes
  the orphan list and asserts it empty. It found three more the finding had not named —
  `railPx`, `railMinWidthPx`, `phoneWidthPx`, all re-typed as literals in `qa/job-screen.mjs`.
* `qa/job-screen.mjs` now reads all four from the table and measures each: the OPEN board during the
  decision phases and at the getaway; the rail's width against `railPx` (±7.5 %, because the rail is
  a token rather than a literal); and — new — that there is NO rail below `railMinWidthPx`, without
  which the 1024 was a number nothing read.
* Both QA harnesses arm that measurement **from the stylesheet**: `SHEET_RULE_SHIPPED` is true only
  when `job.css` publishes `--job-board-sheet: <boardSheetPx>px` AND a rule consumes it, and the
  check is a `warn` (with the reason printed) until then, a hard `fail` after. `qa/job-walk.mjs:802`
  is upgraded from `warn` on the same switch, which is what the finding asked for.
* The J6 lane shipped `--job-board-sheet: 264px` + `max-block-size: min(var(--job-board-sheet),
  38dvh)` while this round ran, so the switch is already thrown. Measured after it:

        node qa/job-screen.mjs --engines chromium --themes light
          worst board height with a stem in the DOM: 36px (max 36)
          worst OPEN board height, decision phases at 375x667: 253.45px (sheet 264px — ENFORCED, fatal)
          rail 1280: board 320px beside a 688px column · sticky
          no rail 960: beside=false
          ALL PASS

  The juice test now asserts the CSS rule directly (not "one of two consumers"), so deleting it goes
  red here as well as in both harnesses.

## 9 · The text-zoom pass ran only where zoom cannot bite  (finding 9, MAJOR)

`qa/layout-audit.mjs` ran its `html{font-size:20px}` pass at 1900x1200 and nowhere else — the one
width with horizontal room for 20 px text to reflow into.

* The pass now runs at the NARROWEST viewport in the state's list as well as at 1900x1200.
* States with their own `vps` are no longer skipped. The old reason (resizing to 1900x1200 un-pins
  the configuration they exist to measure) is answered by zooming at their own size instead; a
  pinned keyboard and a text-zoom setting are independent things a student can have at once.
* Second hole, same line: `CFG.vpSpec === 'all'` made an explicit `--vp` silently DROP a state's own
  pinned rows, so `--vp phone` measured `job-answer-kb` / `job-payout-kb` at seven phone widths and
  never at 375x331 — the keyboard height those states exist for. `--vp` now UNIONS with the pinned
  rows instead of replacing them, and the flag help says so.
* `tests/layout-audit.test.mjs` (the `--selftest` calibration) still passes; a real run of
  `--only job-board,job-answer-kb --vp 375x667 --engine chromium --theme light` completes clean.
* **Proof the narrow pass is not a no-op.** On a throwaway copy of the harness, the zoom tag was
  widened to `html{font-size:20px} .job-board,.card-screen,.job-panel{min-inline-size:1400px}` and
  run against `job-answer-kb --vp all`, the state that used to be skipped entirely:

        findings 6   viewports ['1900x1200@zoom20', '320x460@zoom20']

  Two zoom viewports where there were none for this state and one for every other. The copy was
  deleted and its two screenshots removed from `qa/audit/png/`; `qa/layout-audit.mjs` is untouched
  by it.
* **One byte, unrelated but worth recording.** `qa/layout-audit.mjs` carried a literal NUL as the
  separator in `const sig = (s.pass || '') + '\0' + …` (the suspect-grouping key). Harmless at
  runtime — `node --check` passes and the audit runs — but it made `file(1)` report the source as
  `data` and put `grep` into binary mode, so ordinary `grep -n foo qa/layout-audit.mjs` printed
  NOTHING on a 1 400-line file anyone maintaining it would search. Replaced with a space; the file
  is now `Java source, Unicode text, UTF-8 text` and greps normally. It was the only NUL under
  `tests/`, `qa/` or `site/`.

---

## Requests (other lanes' files; nothing below was edited by this lane)

1. **COMPOSED-GAME G3.2** — *"as the chain deepens `q*` FALLS while the amount at risk GROWS"* is
   true of the fee-free table form and false of the number on screen on a deep pile (145 of 543
   ladders rise; `L 70, S 300, call 70` goes 0.2857 → 0.2977). Say which form the sentence is about.
2. **COMPOSED-GAME G3.4 / G8's J3 row** — *"converges to `y = (.60,.40)` ±0.03"* is the **ε = 0**
   idealisation. Restate it as such and print the per-rank `y` beside it (the closed form is in
   `job-guard.test.mjs` as `equilibriumY`), or widen the tolerance to something the ε floor can
   meet. Same sentence: *"wing 3 leaves the support"* is only true at ε = 0 — in the game the floor
   holds it at `ε/n` (0.083 at Called 1). And the shipped path settles at 7/11 : 4/11 even at ε = 0,
   because `xHatFrom`'s ten-job window quantises a three-token press.
3. **COMPOSED-GAME G3.8 / G9 #5** — the alignment theorem's honest per-board rates are **top-three
   43 %, exact argmax 19 %** over all nineteen makes (the population §6 correlates). 19 % is the
   number the theorem earns. The 97 % / 42 % in the old §6 header reproduced nothing and is gone.
4. **COMPOSED-GAME.md:498** — *"rises on the overdue sort and **leads the next board**"*. What the
   composer guarantees is that a deferred critical leads the next board's **review block**; it does
   not lead a Rematch (seated at slot 3 by `composePage` step 2 and not a critical target), and it
   does not lead a warmer non-critical review, because criticality is bucket-based while the due
   sort is overdue-based (corpus save 19). Either amend the sentence, or widen
   `page.js isCriticalTarget` to count a pending Rematch — the test asserts the Rematch count so it
   will tell you when that lands.
5. **`site/js/screens/job.js breakevenQOf` (:452)** — it passes `{loose, chain, call, tier, loot,
   rungs, crew}`. `state.pricedTarget` has `scopeFlags`, `bucket`, `overdueDays`, `tell`, `tokens`,
   `guarded`, `rank` and `x2` right there, and `econ.gainLFor` / `lossLFor` now read all of them.
   Until the call site passes the priced target, the fix inside `econ.js` prints the same q* whether
   the target is a cold tagged review on the guarded wing or a bare T1.

---

## State at hand-off

`node --test tests/` was run four times during this round. The tree was being rewritten by four or
five other lanes throughout, so each run is a snapshot of a moving target:

    17:28  baseline, before any round-2 edit   2510 tests  2506 pass  0 fail  4 skipped
    17:55  after findings 1-9                  2608 tests  2599 pass  5 fail  4 skipped
    18:00  after findings 1-9                  2608 tests  2600 pass  4 fail  4 skipped
    18:05  after findings 1-9                  2609 tests  2601 pass  4 fail  4 skipped  (225 s)
    18:10  FINAL, GREEN                        2611 tests  2607 pass  0 fail  4 skipped  (223 s)

The tree gained **101 tests** across all lanes this round (2510 → 2611); this lane's share is the
eleven new `test(...)` blocks listed in §§1-9 above plus the widened populations inside existing
ones (the grid alone went from 784 states to 8 624).

**The suite is GREEN at hand-off.** The failures in the three intermediate runs were never in this
lane's work and never in the nine findings — every one was a board / split / screen lane mid-edit,
and all of them cleared without anything further from here:

* The four that remain at 18:05 — `a student with a ledger gets their OWN split…` and `two students
  with the same board and different histories get different splits` (`tests/job-board.test.mjs`,
  `describe('J5 / the board the student reads')`), `…on a shape the ledger has NEVER SEEN` and
  `THE GAP: the board's projection and the debrief's measurement…` (`tests/job-split.test.mjs`) —
  are the split-honesty lane's own round-2 tests, asserting a `projectFor` model that
  `site/js/job/board.js` is still being rewritten to match (`b.split` 42 against a model saying 52).
* `J6 measured: a full job at 375x667…` failed in the 18:00 run with
  `ReferenceError: meansForShape is not defined at projectFor (js/job/board.js:442)` — a torn read
  of `board.js` while that lane was saving it. The function exists a minute later. The four QA
  failures it produced (`seal — never reached an envelope`, `walk — no target was answered`, …) are
  all downstream of that one ReferenceError, not of the new sheet/rail checks.
* `collapsedLineOf is COPY.collapsedBoard…` — the J6 screen lane's own test against
  `site/js/screens/job.js`.

By 18:10 the board lane had landed its `projectFor` rewrite and all four cleared on their own:

    node --test tests/job-board.test.mjs   → 86 tests, 86 pass, 0 fail
    node --test tests/job-split.test.mjs   → 34 tests, 34 pass, 0 fail

The eight files this lane touched, re-run together at the end:

    node --test tests/job-econ tests/job-guard tests/job-align tests/job-board tests/job-exploit \
                tests/job-ledger tests/job-juice tests/layout-audit
      → 458 tests, 458 pass, 0 fail

`node qa/job-screen.mjs --engines chromium --themes light` → **ALL PASS**, with the new open-board,
rail-width and no-rail-below-threshold measurements live and the sheet check armed fatal.

---

# tests — fixer round 3

Lane: `tests` (the `tests/*` suites the round's findings named, plus the two QA harnesses they
named: `qa/job-screen.mjs` and `qa/audit-states.mjs`, and `qa/layout-audit.mjs`'s fold).

Six findings, five of them a version of the same disease: **a test that cannot fail for the reason
it is named after.** Four were green while the defect they name was live; one was green because the
harness stopped one call short of the thing it was measuring; one was green because the keyboard it
measured was not a keyboard.

Files changed: `tests/job-call.test.mjs`, `tests/job-ledger.test.mjs`, `tests/job-exploit.test.mjs`,
`tests/job-board.test.mjs`, `tests/job-screen.test.mjs`, `qa/job-screen.mjs`, `qa/audit-states.mjs`,
`qa/layout-audit.mjs`. **No file under `site/` was touched by this lane.**

---

## 1 · Propriety was proved about arithmetic, never about the ship  (finding 1, MAJOR)

**The finding is correct about the tests and was OVERTAKEN on the code.** `site/js/job/call.js` now
defaults `qHatDetail`'s `before` cut to the save's own sealed call (`sealedCallOf` →
`inProgress.game.locked.at`), so `state.applyTarget` gets the snapshot whether it asks or not. The
critic's own reproduction now reports the opposite of what they measured:

    $ node /tmp/critic-r3/c-endo2.mjs
    make=ASN-PLP  q̂ AT LOCK = 0.7 (7/10)  w_exogenous = 0.840000
    CLEAR -> q̂_after=0.8  w_stored=0.84
    MISS  -> q̂_after=0.7  w_stored=0.84          (the critic measured 0.64 vs 0.84)

The *test* finding stands in full: nothing in the suite read what `state.js` stores, so the fix
landing changed no test's colour — exactly as its breaking would not have. Added **§14, `R3 · the
weight the SHIPPED path stores, read off the save it wrote`** (`tests/job-call.test.mjs`):

* **THE INVARIANT** — one save, `startJob → lockCall`, cloned, then `card.js`'s history push and
  `state.applyTarget` on BOTH branches: `calls.at(-1).w` must be byte-identical and equal to
  `weightFor(q̂_at_lock)`. Its CONTROL asserts the same two saves read live (`before: null`) DO
  differ and that `w_clear < w_miss`, so the arm cannot pass by measuring nothing.
* **the realised argmax** — the objective is built from the two weights the shipped path wrote, and
  its argmax must be `honestCall(q)` at every q in 0.60…0.95; the un-snapshotted weights must bend
  it meeker somewhere, or the arm is not measuring the defect it names.
* **every staked target of the five end-to-end saves** — `e2ePlay` now checks, per target, that the
  stored entry equals `callEntry({ call, ok, qHat: q̂_at_lock })`. Over five saves × eight jobs:
  **311 staked targets, 0 mismatches, and the endogenous reading would have differed on 90** of
  them. Before this, `e2ePlay` asserted only `rating >= 2.5 / <= 8.5`, which both regimes satisfy.

Two harnesses the finding named as spec-modelling now go through the shipped door instead:

* the R2 steady-state `play()` pushed the sitting AFTER reading q̂ (a caller careful enough to read
  first). It now pushes first and reads with a SEAL on the save, so `qHatDetail` applies its own cut.
* `the snapshot` passed `before` explicitly — a parameter no shipped file passed. It now also drives
  the default (seal on the save), the opt-out (`before: null`) and the no-seal case.

**One number moved, and it is the fix landing.** The end-to-end population was pinned in round 2 at
3.67 · 4.27 · 4.83 · 5.81 · 6.64 (mean 5.04) — measured while a truthful student's clears were
discounted against their misses. The same play, same seeds, same RNG now measures
**5.085 · 5.489 · 6.317 · 6.996 · 9.188, mean 6.615**, and the band in the test is those numbers.

> **Request — COMPOSED-GAME G3.1 (and whoever owns the rank ladder).** Seed 0 reaches **Called 5**
> off honest play (9.188, 30 of 50 slots informative). Round 2's arm asserted that was impossible
> (`rankFor(rating) < 5`, "Called 5 off truthful play on a mostly-blank window"). With an exogenous
> weight it IS reachable. Either that is the intended reward for a well-calibrated student — in
> which case G3.1's prose about what honest play scores should say so — or the ladder needs
> re-tuning now that the systematic discount is gone. This lane only measures.

## 2 · The crew grid was covered by a regex that matched the bug  (finding 2, MAJOR)

`tests/job-screen.test.mjs`'s arm asserted `/state\.crew\.alignmentFor\(/` over the file's own text,
which matches the supply-blind `alignmentFor(s, {shape, of})` exactly as well as the correct
`alignmentFor(s, {shape, of, queue})`. Replaced with three things, in order of strength:

1. **The rendered sentence** — `qa/job-screen.mjs` rule 11 (new). At every brief it reads
   `.job-crew-supply`, `.job-crew-align` and every `.job-crew-board` cell out of the DOM and
   compares them with `crew.supplyGapFor(save, queue)` / `crew.alignmentFor(...)` computed in-page
   from the same save: per-row `N left · forgives M` exactly, the supply sentence's make, its
   `pays N.NN` and its `over N targets`, the other make's price when the two disagree, and the HELD
   threshold and its `leads it` / `is outbid by it` verdict. It also fails if the printed count is
   the SUPPLY-BLIND one where this board differs. Measured on a live walk: **2 briefs, and on 1 of
   them the queue-aware gap and the supply-blind gap genuinely differ** — the line the report prints
   so the rule cannot quietly become vacuous.
2. **The model, headless** — the replacement arm composes 12 real boards and asserts
   `alignmentFor({queue}).gap` IS `supplyGapFor(save, queue)`, that the blind call cannot report a
   supply condition, and that the two disagree on at least one board (and that at least one board
   has the study top paying 0 on it — the case the grid exists to print).
3. **A source pin that can tell the two apart**: the argument list, not the function name.

The spawn test now also asserts the harness's own measurement line, so a rule that stops measuring
fails instead of reporting no failures.

## 3 · "99.5 % of drafts, ±1 otherwise" is not what the build does  (finding 3, MAJOR)

Confirmed, per shape, over 400 saves × every legal draft (15 984 drafts) through the shipped
`postBoard`:

    RUN    want  6   96.70 % exact   {0: 3864, +1: 132}
    JOB    want 10   99.25 % exact   {−1: 6, 0: 3966, +1: 24}
    JOB12  want 12   96.37 % exact   {−3: 6, −2: 20, −1: 110, 0: 3851, +1: 9}
    VAULT  want  7   97.82 % exact   {0: 3909, +1: 87}

The old test asserted `±3`, `exact/total > 0.6`, on ONE shape and fifty saves: a build that hit the
budget on 61 % of drafts with ±3 scatter passed it. It now loops the four shapes over the wide
corpus and asserts each shape's own measured floor and spread, plus: RUN / JOB / VAULT hold ±1
absolutely (0 drafts outside), JOB12 does not (26), and **no shape reaches the published 99.5 %** —
asserted as such, with the message naming the document, so the day the composer improves, the test
says so instead of silently passing.

> **Request — COMPOSED-GAME G8 (J5 row) and §568.** *"every legal draft serves the shape's target
> count exactly (99.5 % of drafts; ±1 otherwise)"* is false on three of four shapes and breaks ±1 on
> JOB12 (down to −3; corpus save 90 serves 10 against a 12-target shape on all ten of its drafts).
> Either restate it as "96–99 % exact; ±1 on every shape but JOB12, which goes to ±3 on a Page too
> thin to feed it", or tighten `composeBundles`' `choicePer` / `coreN` on a thin Page — the test is
> written so that tightening turns the JOB12 assertion red and tells you to move it.

## 4 · THE GAP and THE TROPHY GAP anchored a bug the app had already fixed  (finding 4, MAJOR)

`runInJob` stopped at `state.js` and never called `jobSummaryContext`, which `screens/job.js:1421`
calls on EVERY job terminal — so `runs`, `forecastLog` and `trophies` compared `[]` to `[]`, and two
arms asserted the ABSENCE of writes the app now makes, with messages saying to delete them when it
did. Done, exactly as the arms' own messages and `notes/run-fix.md` Request 1 asked:

* `runInJob` takes `screens/job.js`'s two snapshots where the screen takes them (`captureJobBefore`
  off the raw save, `queueOf(save).slice()` — SHALLOW, re-read on every beat as `render()` does, so
  a requeued Rematch is in the record), captures the debrief off `push()`/`bag()`, and calls
  `jobSummaryContext(save, debrief, { queue, before })` at the terminal. `terminal: false` keeps the
  state-machine-only arm for the guard proof.
* `runFlatScreen` now records `pageResults(queue)` — what `run.js:record()` actually stores — instead
  of a hand-built list with no `skill`, no `tier` and no `xp` (it was comparing `xp: 0` against 178).
* Both arms award trophies at the same beats the app's own installer does (`trophies.evaluate`,
  `screens/index.js:72` listens on 'graded' and 'state'), so `save.trophies` is a key the comparison
  WRITES rather than one it leaves untouched.
* `THE GAP` → **THE RUN RECORD**: both routes write exactly one `runs[]` record for the page they
  closed and the two are compared through `runShape` (everything except `seed` / `seedTag` /
  `submittedAt` — the identity of the sitting), `forecastLog` and `daily` byte-for-byte, the job's
  record carries `composePage`'s own seed, and a CONTROL plays the same job with the terminal off to
  prove `js/job/*` still writes none of it.
* `THE TROPHY GAP` → **THE TROPHIES**: an all-clean job earns `flawless-page` and **loses nothing**
  (`lost` is asserted `[]`), the awarded sets are compared, and every trophy the job earns and the
  flat page does not is still proved to come from Ledger B by transplant.
* The vacuity audit's waived list shrank from `[forecastLog, frozen, runs, trophies, variants]` to
  `[frozen, variants]`, and `forecastLog`, `runs` and `trophies` are now asserted to be exercised.

`node --test tests/job-ledger.test.mjs` → **17 tests, 17 pass**.

## 5 · The anti-exploit suite could not see the q̂ it polices  (finding 5, MAJOR)

**(a) the evidence never moved.** `runJob` drove `startJob → lockCall → applyTarget` but never wrote
`save.cards[*].history`, so `qHatFor` inside `applyTarget` read the seeded value for ever. Added
`writeStudyHistory` (card.js:922/1001's one line, a Variant writing no card record as card.js does)
and wired it into the answer beat, before `applyTarget`, with `study: false` for the arms that are
about the machine alone (proof 11's write spy, where the harness's card.js stand-in would correctly
be reported as a Ledger A write). New arm **THE EVIDENCE MOVES**, five all-miss jobs, both ways:

    study off   histories 10/10 unchanged · 0 informative calls · 50 blank slots · rating 5.000
    study on    7 makes reach 20 sittings · 21 informative calls ·                 rating 0.000

**(b) proof 8 modelled the wrong event and the wrong student.** `h.push(rung <= 1)` is the FIRST-TRY
rate; `call.js:737` counts a CLEAR. Changed to `rung < 4`. And every arm drew its rung from
`bandFor(mShown(rec))`, i.e. assumed true ability equals what the save says — so the proof could only
ever test a student who had genuinely become worse. New arm **THE STUDENT WHO KNOWS THE ANSWER AND
THROWS IT** (`trueM: 85` fixes the band, `throwEvery: 2` throws on a cadence independent of the save)
— over the same 8 seeds:

    bagged  honest 840–1039   tanked 314–441    (the tanker keeps 35–47 %)
    rating  honest 9.39–10.0  tanked 7.19–7.82
    m_shown honest 85.6–96.2  tanked 63.2–67.9  (the save sagged; the ability did not)

and the same result at call 50, where `carryOf(50).P === 0` and the miss is free. The proof survives
the honest form of its own hypothesis.

## 6 · Both QA harnesses modelled a keyboard that does not exist  (finding 6, BLOCKER)

Confirmed in full. `qa/job-screen.mjs` shrank the LAYOUT viewport to 375x331 and `qa/audit-states.mjs`
set `data-kb="open"` without ever setting `--kb`. The first moves the fold and every sticky dock
together, so nothing can be found underneath; the second styles the page keyboard-open while nothing
is lifted. Both are configurations no device produces.

* **`qa/job-screen.mjs`** — the layout viewport stays 375x667 and `openKeyboard()` shrinks
  `visualViewport` and fires its resize, so the app's OWN `keyboardInset()` (mounted by `card.js`'s
  dock) publishes `--kb` and `data-kb` from it. The harness writes neither. `PROBE_DOCK`,
  `PROBE_REACH` and `PROBE_BRIEF` now take the fold from `visualViewport.offsetTop + height`.
  Rule 1 asserts the layout viewport did NOT move and that the app published an inset; **rule 1b**
  (new) asserts the submit / continue controls are above the keys; **rule 6** now runs a third pass
  at 375x667 WITH the keyboard open. Report line, from a live walk:

      keyboard open (chromium/light): layout viewport 667px · visible band 0..331 · --kb 336px · data-kb open

  All of it PASSES, because `css/job.css` gained `bottom: calc(var(--job-dock-h) + var(--kb))` in
  the same round — which is the point: the harness can now VERIFY that fix instead of being blind to
  it either way.
* **`qa/audit-states.mjs`** — `pinKeyboard` shrinks the visual viewport (phone widths only) and
  publishes `--kb` beside `data-kb`, guarded so its own writes do not loop the MutationObserver.
  `VP_KB` was `[[375,667],[375,331],[390,400],[320,460]]` — one impossible row (keyboard open, full
  height, nothing lifted) and three shrunken LAYOUT viewports; it is now four real phone layout
  viewports `[[375,667],[390,844],[360,640],[320,568]]`, each with KB_PX taken off the visual one.
* **`qa/layout-audit.mjs`** — `pageDetect`'s `vh` is the visual fold, not `innerHeight`. With no
  keyboard the two are identical, so nothing else in the corpus moves. `tests/layout-audit.test.mjs`
  (the `--selftest` calibration) still passes.

### What the corrected keyboard model immediately found

`pinKeyboard` also FOCUSES a live answer field before it publishes the inset, because a keyboard is
opened by a focus and the app answers that focus with `keepVisible()` — pinning the keys up with
nothing focused would invent a state no student sits in and every finding it produced would be an
artefact. With that in place, one state, one viewport:

    $ node qa/layout-audit.mjs --only boss-b4-miss-dock-kb --vp 375x667 --engine chromium --theme light
    verdict: 9 blockers, 2 majors → FAIL
      BLOCKER unreachable-answer  input#f-1 starts at y 342px, at or below the dock top (162px)
      BLOCKER overlap            three in-flow parts covered by the fixed dock with the page scrolled to its end
      BLOCKER offscreen          .card-scratch-toggle still below the fold (top 398px, band 331px)

The dock is now LIFTED (top 162, inside the 0..331 band the keyboard leaves) — the app's `--kb` doing
its job — and what that reveals is that the answering content behind it has nowhere to go on this
state. Under the old model the whole page was 331 px tall with `--kb: 0`, everything fitted, and the
state reported PASS. These are for the boss / layout lanes: this lane's job was to make them visible,
and `node --test tests/layout-audit.test.mjs` (the detector calibration) is still green.

---

## What I could not verify at hand-off, and why

`qa/job-screen.mjs` and `qa/layout-audit.mjs` were run green with the new rules at 20:05–20:12. From
about 20:25 every job-screen run fails to mount at all, and it is not this lane's change:

    warning: run: job delegate unavailable ReferenceError: Cannot access 'fitRaf' before initialization
      at scheduleBoardFit (js/screens/job.js:446:5)
      at render (js/screens/job.js:521:5)
      at mount (js/screens/job.js:382:3)

`mount()` calls `render()` at line 381, and `let fitRaf = 0` is at line 433 — a temporal dead zone,
so `#/run/job` falls through to `run.js`'s placeholder and NO job state is reachable in a browser.
It is a one-line move (`let fitRaf = 0` above `mount`'s render call) in `site/js/screens/job.js`,
which this lane does not own. Until it lands, `tests/job-screen.test.mjs`'s measured arm and every
`job-*` state in `qa/layout-audit.mjs` fail for that reason and no other.

## Requests (other lanes' files; nothing below was edited by this lane)

1. **`site/js/screens/job.js`** — the `fitRaf` TDZ above. The job screen does not mount.
2. **COMPOSED-GAME G3.1** — honest play now reaches Called 5 (see §1).
3. **COMPOSED-GAME G8 J5 / §568** — the 99.5 % / ±1 draft claim (see §3).
4. **`site/data/job.js` / COMPOSED-GAME:334** — `qHatWindow`'s comment and the document still say
   q̂ is the first-try rate; `call.js` counts clears. Round 2 raised this; proof 8 was modelling the
   stale reading until this round, so it is worth closing.
