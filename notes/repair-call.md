# notes/repair-call.md — the `call` lane's round-4 repair

**Owner of this ticket:** `site/js/job/call.js` + the test files that cover it.
**Authority:** `designs/REPAIR-DECISION.md` §S3 (the structural fault assigned to this lane),
`designs/r3-findings.json` (every entry whose `lane` is `"call"`), `BUILD-POLICY.md` (overrides both).
Finding numbers below are the 0-based array index in `designs/r3-findings.json`, which is the
numbering `REPAIR-DECISION.md` itself uses ("findings 11, 16, 18, 22", "finding 12", "finding 29").

**Files changed by this ticket**

| file | why |
|---|---|
| `site/js/job/call.js` | S3.1(a): `ratingDetail` floors the printed rank on the held rank; `ratingDetail`'s docblock rewritten (the round-3 docblock described a default-off hook — it is now the shipped rule, which is item 9 of the decision's "WHAT WE ARE NO LONGER CLAIMING"); `rankFor`'s `opts.floor` docblock re-pointed at the ratchet |
| `tests/job-call.test.mjs` | S3.4 items 1, 2, 3, 5 added as a new section; the message at the old `:1204` rewritten per §S3.3's ruling; one header line pointing at the pending doc correction |
| `tests/job-meta-constants.test.mjs` | one assertion block whose asserted property no longer exists after S3 (see "The one test the decision did not enumerate") |
| `notes/repair-call-evidence.mjs` (new) | the four measurements below, as one runnable script — two BLOCKERs are REFUTED here and a refutation needs its command to survive the scratchpad |

Nothing else was touched. No test was deleted, skipped or weakened.

---

## 1. S3 — the rank becomes a floor (the structural fault this lane owns)

**S3.1(a), as specified, two lines in `site/js/job/call.js ratingDetail`:**

```js
// before
  const held = !measured && Number.isFinite(opts.rank);
  rank: held ? rankOf(opts.rank).rank : rankFor(value),
// after
  const bare = rankFor(value);
  const rank = rankFor(value, { floor: opts.rank });
  rank,
  measured, held: Number.isFinite(opts.rank) && rank > bare,
```

`rankFor(rating, { floor })` already shipped (`call.js:581-586`, "the hook a display needs so the
ladder never DEMOTES. Default-off.") and was already tested. This ticket calls it. No new constant,
no schema change, no signature change (`rankFor.length === 1` still holds, pinned at
`job-call.test.mjs`).

`held` now means **the floor BOUND** — the window on its own would have printed something lower —
which is the only reading under which `held` is not a synonym for `!measured`.

**The fault, re-measured here through the shipped `ratingDetail`** (homogeneous 50-call window at
`honestCall(q̂)`, outcomes proportioned to q̂):

| q̂ | rung | clears | rating | `n` | rank without the floor | with `{rank: 5}` | guardMult / calls |
|---|---|---|---|---|---|---|---|
| 0.90 | 85 | 45/50 | 9.536 | 50 | Called 5 | Called 5 | 0.75 · 50,70,85,95 |
| 0.93 | 95 | 46/50 | 8.656 | 50 | **Called 4** | Called 5 (`held`) | 0.70 → 0.75 |
| 0.93 | 95 | 47/50 | 9.031 | 50 | Called 5 | Called 5 | — |
| 0.95 | 95 | 0/50 informative | 5.000 | **0** | **Called 2** | Called 5 (`held`) | 0.55 · 50,70,85 |

One honest qualifier on `REPAIR-DECISION.md` §S3.2's own table, found while reproducing it, and it
changes nothing about the verdict: the q̂ 0.90 and 0.95 rows reproduce exactly, but the q̂ = 0.93 row
(**8.656 / Called 4**) is the **46**-clear window — 0.93 × 50 = 46.5, and the 47-clear window reads
**9.031 / Called 5**. That row is rounding-fragile in exactly the way §S3.2 already says its
`k`-ladder is, which is **why the acceptance tests pin the floor PROPERTY and never a rating**.
(For the record, since the table does not name its rungs: `honestCall(0.93) = 95`, because the
`ratingIndifference()` cut is 0.900.)

**Why the critics' own named fix (`held = !measured`) was insufficient, as a number:** in the
S3-item-3 walk below (11 steps, measured with `node notes/repair-call-evidence.mjs § 4`), **5** steps would have
been demoted without the floor — `bare` rank 5 → 4 → 4 → 3 → 2 → 2 — and **4 of those 5 are
`measured === true`**. `held = !measured` rescues exactly **1** of the 5, the `k = 0` corner.

### S3.4 acceptance tests, in `tests/job-call.test.mjs` (new section, 4 tests)

| item | test | result | the number measured |
|---|---|---|---|
| 1 | a MEASURED window with a BINDING floor holds | **PASS** | 25 informative slots at q̂ 0.90 / rung 85, 22 cleared → rating **7.0664**, `rankFor = 3`, `{rank: 5}` → rank **5**, `held true` (the arbiter's own counter-case, reproduced to 4 dp) |
| 2 | a NON-BINDING floor is transparent, and `held` ⟺ the floor bound | **PASS** | floors 1/2/3 leave rank at 3, `held false`; `held === (rank > rankFor(value))` over floors `null,1..5` |
| 3 | the whole SLIDE, not the corner | **PASS** | walk `k = 50 → 0` in steps of 5 at q̂ 0.85, carrying the rank forward: rank non-decreasing at every step, finishes at Called 5; ratings `10.000 … 9.641 · 8.713 · 7.785 · 6.856 · 5.928 · 5.000`; **5** steps would have fallen without the floor, **4** of them with `measured === true` |
| 5 | downward mobility that must survive | **PASS** | over-calling 95 on q̂ 0.5: `n = 50`, rating **0.00**, bare rank 1, floor 5 → rank 5 `held` (the published cost, S3.6); cowardice 50-on-everything: `measured true`, rating exactly **5.00**, **Called 2** from floors `null/1/2` |

Items **4** (the three writers pass `{rank}`; `tests/job-state.test.mjs` / `tests/mock.test.mjs`)
and **6** (finding 29's printed bands; `site/data/job.js` + `screens/settings.js`) live in other
lanes' files — see **Requests**. Item 4's *code* has since landed in those lanes (verified:
`state.js:1179`, `state.js:1893`, `mock.js:569` all pass `{ rank: … }`), so the ratchet is live in
the persisted save; its *test* is still theirs to write. No grep pin on `state.js` / `mock.js` was
added from here — a pin in this lane would have been red for however long those lanes took, and the
suite has to be green at every lane's finish.

### NEGATIVE CONTROL (the four new tests can fail)

Reverted the two lines to the pre-S3 form, left the tests alone, re-ran:

```
$ node --test --test-name-pattern 'S3 ·' tests/job-call.test.mjs      # pre-S3 code
✖ a MEASURED window with a BINDING floor holds — rank is a ratchet (S3 item 1)
    AssertionError: a student who earned Called 5 is not demoted to 3 for mastering their makes
✖ the whole SLIDE, not the corner: every step of the walk into mastery holds (S3 item 3)
    AssertionError: k = 20: the rank FELL 5 → 4 — the ratchet is not holding
✖ downward mobility that must survive the ratchet, and does (S3 item 5)
    AssertionError: the rank is HELD — the published cost of the ratchet (S3.6)
ℹ pass 1 · fail 3
```

then restored the floor and re-ran: `ℹ tests 110 · pass 110 · fail 0` (the file has since grown to
**113** — the `tests`/`doc` lane added §S1.3's opt-out lint to the same file; both sections are green
together). Item 2 passes in **both**
regimes by construction — it is the restatement of the old `:1203`'s intent ("a non-binding floor is
never held"), which is true of both implementations, and it is labelled as such rather than counted
as a ratchet pin.

### The one test the decision did not enumerate

`tests/job-meta-constants.test.mjs:294` asserted, in terms, the rule S3 replaces:

```js
const measured = ratingDetail(coward, RATING.N, { rank: 5 });
assert.equal(measured.held, false, 'a MEASURED window may not be held');
assert.equal(rankOf(measured.rank).name, 'Called 2',
  'measured cowardice must still be printed as Called 2 — the hold is not a floor on being wrong');
```

Under S3 a rank **is** a floor on being wrong — that is exactly S3.6's published cost ("An
over-caller who once reached a band keeps it"), and S3.4 item 5 states the surviving property as
*"Called 2 from any floor of 1 or 2"*, not from a floor of 5. So the **property** that assertion
names no longer exists (disposition (i) in the S4.3 vocabulary). The test was not deleted or
weakened: the control now runs over **three** non-binding floors (`null`, 1, 2) instead of one
impossible one, keeping every assertion it made (all measurements, rating exactly 5.00, `held false`,
Called 2 printed), and a **new** block (c) was added beside it asserting the ratchet's published
cost (floor 5 binds → Called 5 held, rating still 5.00, `measured` still true). Assertions in that
test: **14 → 18 written, 14 → 28 executed** (the control loop runs its five over three floors).
`tests/job-meta-constants.test.mjs` → `13 tests, 13 pass, 0 fail` when this edit landed, and
`31 tests, 31 pass, 0 fail` at hand-off (the meta lane has since added its own round-4 arms to the
same file; they are green beside this one).

This file is the `meta` lane's main home. If the meta fixer is editing the same test, this block is
the only thing this ticket touched in it (test *"behaviour: a mastered student keeps Called 5, and
measured cowardice still falls to Called 2"*, part (b) and the new part (c)); the title was left
alone deliberately so the conflict is visible rather than silent.

---

## 2. Every `lane: "call"` finding in `designs/r3-findings.json`

| # | severity | critic | verdict | what I did |
|---|---|---|---|---|
| **11** | BLOCKER | call-propriety | **REFUTED (stale)** | no code change; the weight is already exogenous by default. Proof below. |
| **18** | BLOCKER | exploit-hunt | **REFUTED (stale)** | same defect, same refutation; the fix the finding asks for ("store `w` on `g.locked`") is explicitly refused by `REPAIR-DECISION.md` §S1.1 and is not needed. |
| **12** | MAJOR | call-propriety | **REFUTED (stale)** | Called 5 is reachable by honest play; the 8.213 / 1.607 ceiling is the endogenous regime. Proof below. |
| **24** | MAJOR | econ-math | **CONFIRMED — doc only** | the code is right (`−8.10` is the 95 call). `COMPOSED-GAME.md` is not this lane's file → **Spec corrections**. |
| **35** | MINOR | spec-fidelity | **CONFIRMED — doc only** | duplicate of 24 (same line, same defect) → **Spec corrections**. |
| **36** | MINOR | spec-fidelity | **CONFIRMED — doc only** | measured 2.0425 pp, published 2.1 pp → **Spec corrections**. `call.js:12` already says 2.04. |
| **40** | BLOCKER | player-feel | **CONFIRMED — call.js side already done, the sentence is another lane's** | `call.regretOf` already returns `ratingCost` (the conversion `RATING.scale·w·cost/RATING.N`), pinned at `job-call.test.mjs`. `screens/run.js:1759` destructures `{ best, cost }` and drops it → **Requests**. |

### #11 and #18 — "the rating weight is read AFTER the outcome it weighs" — REFUTED

The findings quote `state.js` passing no `before:` and conclude the read is live. That inference is
false against the shipped tree: since round 3 the cut is `qHatDetail`'s **default**, taken from the
save's own seal (`call.js sealedCallOf` → `inProgress.game.locked.at`, written by `state.lockCall`).
A caller that passes only `{ cards }` gets the snapshot; `before: null` is the opt-out.

Reproduction of the critics' own experiment (oldest sitting a miss, 7/10 clears, the sitting being
scored pushed by the grade path before `applyTarget`, exactly as `screens/card.js:922` does):

```
$ node notes/repair-call-evidence.mjs      # section 1
q̂ at the seal (the DEFAULT cut) : clear 0.7 · miss 0.7 · sealed true/true
w stored through callEntry      : clear 0.84 · miss 0.84 · ratio 1
THE CONTROL — before:null, the pre-round-3 read the critics measured:
  q̂ after a clear 0.8 → w 0.640000 | q̂ after a miss 0.7 → w 0.840000 | ratio 1.312500   ← the finding's own 0.64 / 0.84 / 1.3125
VERDICT: STALE — exogenous by default (and the control is alive)
```

`w_clear = 0.64`, `w_miss = 0.84`, ratio `1.3125` are the finding's own numbers — they are what the
**opt-out** read still produces, which is why the control is alive and the first row is evidence
rather than an absence.

And the shipped pins are not blind. Disabling only the seal default in `call.js`
(`const seal = null;`) fails five of them:

```
$ node --test --test-name-pattern '…' tests/job-call.test.mjs      # seal default disabled
✖ THE INVARIANT: the same call stores the same w whether it is cleared or missed
✖ …and the argmax of the REALISED objective, built from the stored weights, is honestCall(q)
✖ every staked target of the five end-to-end saves stored the lock-time weight
✖ THE FIX: with a call sealed, q̂ is the same number whatever the outcome turns out to be
✖ the window stops being selected ON THE OUTCOME: a miss cannot enter where a clear could not
ℹ pass 1 · fail 5
```

restored → `ℹ tests 110 · pass 110 · fail 0`. Those arms drive the real
`startJob → beginTargets → lockCall → (card.js history push) → applyTarget` path over 311 staked
targets on five seeded saves, and they carry their own controls (`endoWould > 50`, `meeker > 0`).

### #12 — "Called 5 is unreachable by honest play, ceiling 8.213" — REFUTED

```
$ node notes/repair-call-evidence.mjs      # section 2
continuous peak : mean w·c 2.4998 at q̂ 0.853 rung 85 (honestCall 85, w·E[c] 2.4998)
reachable grid  : mean w·c 2.2680 at q̂ 0.9 rung 85  ← the honest per-slot maximum a 10-sitting window can express
Called 5 asks for RANK_MEAN_WC 1.95 (rating 8.9); the grid buys rating 9.536
through the SHIPPED scorer: a 50-slot window at that policy, 45 of 50 cleared → ratingDetail 9.536 · n 50 · Called 5
VERDICT: STALE — Called 5 is reachable by honest play; 8.213 / 1.607 is the ENDOGENOUS regime
```

Both regimes are asserted in the shipped suite (`R3 · Called 5 is reachable by honest play again`),
including the endogenous ceiling as the arm's own control. Note the qualifier
`REPAIR-DECISION.md` insists on: **2.4998 is the continuous peak and is not reachable on a
10-sitting window**; on the reachable grid the best is **2.2680** (q̂ 0.9) → rating **9.536** →
Called 5. The finding's conclusion fails in either reading.

---

## 3. Spec corrections (`COMPOSED-GAME.md` — the `doc` lane owns the file)

Two findings prove published numerals false while the code is right. Exact substitutions:

**(a) findings #24 + #35 — G3.1's Sanity table (currently `COMPOSED-GAME.md:381`).**

OLD (exact line):
```
| systematic over-calling (95 on `q̂ = .5` material) | −4.90 | **0.00** (clamped) |
```
NEW (exact line):
```
| systematic over-calling (95 on `q̂ = .5` material) | −8.10 | **0.00** (clamped) |
```

Measured through the shipped `call.js` (this one command covers both corrections):

```
$ node notes/repair-call-evidence.mjs      # section 3
G3.1 Sanity row "systematic over-calling (95 on q̂ = .5 material)" — published mean −4.90:
  call 70: w 1.0000 · E[c] -1.60 · w·E[c] -1.60 · rating 1.80
  call 85: w 1.0000 · E[c] -4.90 · w·E[c] -4.90 · rating 0.00
  call 95: w 1.0000 · E[c] -8.10 · w·E[c] -8.10 · rating 0.00
  → −4.90 is the 85 call; the 95 call is −8.10 (the rating column, 0.00, is right either way)
G3.1 "2.1 percentage points wide":
  [0.775000, 0.777778) money 70 rank 85 → 0.2778 pp
  [0.882353, 0.900000) money 95 rank 85 → 1.7647 pp
  total 2.0425 pp → 2.0, not 2.1
```

`−4.90` is the **85** call; the 95 call is `−8.10`. The rating column is right either way (both
clamp), so nothing downstream moves. Keep the `95` label and change the mean — that is the option
both critics named, and it keeps the row's teaching point (over-calling is the worst rung).
`site/data/job.js PUBLISHED.sanityRating.overcall` is the **rating** column (`0.00`) and does
**not** mirror the mean, so this correction moves no constant and no test: `job-call.test.mjs`
already asserts both means from the formula (`−8.10` for 95, `−4.90` recorded as the 85 call) and
stays green after the edit. Add the G12 line the way the 0.796 → 0.795 correction got one.

**(b) finding #36 — G3.1's disagreement-band width (currently `COMPOSED-GAME.md:359`, sentence end).**

OLD (exact substring):
```
and it is 2.1 percentage points wide on purpose.
```
NEW (exact substring):
```
and it is 2.04 percentage points wide in total — 0.28 pp in the lower band and 1.76 pp in the upper — on purpose.
```

The two widths are in the section-3 output above: **0.2778 pp** and **1.7647 pp**, total
**2.0425 pp**.

`settings.js` prints each band's own width (0.3 / 1.8) and is unaffected; `call.js:12` already says
"2.04 percentage points wide in total", so this edit also removes a doc-vs-code disagreement.

---

## 4. Requests (files this lane does not own)

1. **`state` lane — `site/js/job/state.js` (S3.1(b)) — ALREADY LANDED, verified, nothing to do.**
   Re-checked at the end of this ticket: `state.js:1179` (`applyTarget`) and `:1893` (`endJob`) both
   call `call.ratingDetail(p.rating.calls, CAPS.calls, { rank: p.rank })` and then write
   `p.rank = detail.rank`, so the floor is live in the persisted path, not only on the audit
   surfaces. The state lane's own acceptance test (S3.4 item 4) belongs in
   `tests/job-state.test.mjs`.
2. **`screen` lane — `site/js/screens/mock.js` (S3.1(b)) — ALREADY LANDED, verified.**
   `mock.js:569` passes `{ rank: save.player.rank }` (the third writer). Acceptance test S3.4
   item 4 belongs in `tests/mock.test.mjs`.
3. **`screen` lane — `site/js/screens/settings.js:635` (CONSEQUENCE OF THIS TICKET, do this one
   first).** `held` changed meaning: it now means *the floor BOUND*, which can happen on a window
   with 25 measurements in it, not only on an empty one. The Settings rating hint is gated on
   `live.held` alone and opens with *"No informative call in the window, so the rating reads exactly
   5.00 and measures nothing at all"* — for a measured+held window (e.g. `n = 25`, rating 7.07,
   floor 5) that sentence is now false. Gate the existing wording on `live.held && live.n === 0`
   and add the binding-floor arm: *"The rank beside it is the one your ledger holds; the rating is
   what this window measured."* (`screens/stats.js:268` is already gated on `rating.n === 0` first
   and stays accurate.) This is the one place where S3 makes a shipped sentence wrong, and the
   `call` lane cannot reach the file.
4. **`screen` lane — `site/js/screens/job.js` + `site/data/job.js COPY` (S3.1(d)).** After the
   ratchet the board can read `rating 5.00 · 0/50 informative calls` beside `Called 5`. Lead the
   line with the held rank and, where `n === 0`, print words instead of a bare 5.00. The wording
   already ships (`screens/job.js:198-200` `rating unchanged · no measurement`) — promote it through
   `data/job.js COPY`, do not write a new sentence.
5. **`screen` lane — finding #29 / S3.1(e), `site/data/job.js RANKS[].bandTop` +
   `screens/settings.js:542`.** `bandTop 4.9 / 6.4 / 7.6 / 8.8` against `min 5 / 6.5 / 7.7 / 8.9`
   leaves four 0.1-wide ratings in no printed band (verified: `rankFor(4.95) === 1`, whose printed
   top is 4.9). The rank is now the number the student reads, so this stops being cosmetic. Derive
   the printed band from `RANK_THRESHOLDS` (which `call.js` already re-exports) and render it
   half-open, e.g. `5.0 to under 6.5`. No primitive was added to `call.js` for this: an export with
   no caller is what round-3's own critics called dead code, and the fix needs none. S3.4 item 6 is
   that lane's acceptance test (`{4.95, 6.45, 7.65, 8.85}` each inside the printed band of
   `rankFor(rating)`).
6. **`state` lane (writer) — `player.records.bestRating` (S3.1(c)) — HALF LANDED.** The coercion
   (`store.js:177-185`) and both prints (`settings.js:628-633`, `stats.js:259-264`) exist, but
   **nothing writes the field**: `state.js:1900` still writes only `rec.bestRating20`. Add
   `rec.bestRating = Math.max(num(rec.bestRating, 0), detail.value)` beside it — otherwise the
   `best rating 9.90` line the ratchet owes G9 #4 never prints, because under a floor `p.rank` is a
   stored high-water and is no longer recomputable from the 50-call window alone. Audit surfaces
   only (`settings.js` ratingCard, `stats.js` ledgerPanel); not the board line.
7. **`run` lane — finding #40, `site/js/screens/run.js:1759` (+ `site/data/job.js COPY.regret2`).**
   ```js
   const { best, cost } = jobCall.regretOf({ call: called, qHat: q, ladder: DEBRIEF_CALL_LADDER.best });
   ```
   `cost` is in **credit** points; `COPY.regret2` labels it `rating`. `call.regretOf` already
   returns `ratingCost = RATING.scale · w · cost / RATING.N` for exactly this line. Measured here
   through `regretOf` itself (called 70): q̂ 0.55 → credit gap **0.8000**, w 0.990, ratingCost
   **0.0317** (25.3×); q̂ 0.8 → gap **0.3000**, w 0.640, ratingCost **0.0077** (39.1×); q̂ 0.95 →
   gap **2.5000** but w **0** below the gate, so ratingCost is exactly **0** — that call never
   entered the window and cost no rating at all.
   Two live options, and the choice is the run lane's + doc's, not this one's:
   (i) print `worst.ratingCost` and drop the 1-dp rounding gate at `run.js:1764` (at 1 dp every
   honest line rounds to 0.0 and the teaching line disappears — so this needs 2-3 dp); or
   (ii) keep `cost` and relabel the unit in `COPY.regret2` to `credit`, which also fixes
   `COMPOSED-GAME.md:638` and `:725` (`cost 0.3 rating` → `cost 0.3 credit`) — a doc consequence,
   listed here rather than in "Spec corrections" because the code is wrong too and the doc edit
   depends on which option ships. Note also that the envelope `worst` is selected on `cost`; if
   (i) ships, select on `ratingCost` too, since `w` varies per envelope and the two argmaxes can
   differ.
8. **`doc` lane — G12.** Record findings **11 / 18** (propriety) and **12** (the 8.213 ceiling) as
   **stale**, with the two commands in §2 above, so round 5 does not re-fix them. Per arbiter rule 3,
   the file-timestamp argument is not the reason and must not be cited: the re-measurement is.

---

## 5. Suite

Measured in this lane, in order:

```
$ node --test tests/job-call.test.mjs            →  tests 113 · pass 113 · fail 0
                                                    (106 at baseline; +4 mine, +3 the tests lane's S1 lint)
$ node --test tests/job-meta-constants.test.mjs  →  tests  31 · pass  31 · fail 0
$ node --test tests/job-call.test.mjs tests/job-meta-constants.test.mjs
                                                 →  tests 144 · pass 144 · fail 0
$ node --test tests/     (mid-ticket, all of this lane's changes in)
                                                 →  tests 2752 · pass 2748 · fail 0 · skipped 4 · EXIT 0
$ node --test tests/     (at hand-off)           →  tests 2806 · pass 2801 · fail 1 · skipped 4 · EXIT 1
```

The stated baseline ("2725 tests, 2721 pass, 4 skipped") is superseded — per `REPAIR-DECISION.md`
§S0 no ticket may quote it, and the tree has since grown twelve lanes' tests.

**The one failure at hand-off is the `screen` lane's S5 work in flight, not this lane's.**
`tests/job-screen.test.mjs:871` → `qa/job-screen.mjs`:

```
FAIL — 1
  chromium/light: brief press — the submit did not redraw the guard
                  (drawnAt 1790033426132 vs phaseAt 1790033426132)
```

That is §S5.5 item 1's own acceptance criterion (the screen submits ONE atomic press and it fires
exactly one redraw), measured by the harness the S5 ticket edits, in the two files
(`tests/job-screen.test.mjs`, `qa/job-screen.mjs`) that §S0 rules **no S1–S5 ticket may touch**.
It is reproducible on its own (`node --test tests/job-screen.test.mjs` → 62 tests, 61 pass, 1 fail)
and has nothing to reach this lane through: `ratingDetail`'s rank/held cannot move a guard
`drawnAt`. The same file was red at the stated baseline for a *different* reason (§S0's mount
timeout), green in this ticket's mid-run (the S0 fix landed: that arm passed a real 65.7 s
Playwright walk with a non-empty row table), and is red again now for the S5 reason above.

Also honest: **twelve fixers are editing this tree concurrently**, so any whole-suite number is a
moving measurement. Cross-file failures seen mid-ticket were transient and not reproducible in
isolation (`tests/job-index.test.mjs` → 90/90 alone; `tests/run-lane-r3.test.mjs` → 15/15 alone;
`tests/job-week.test.mjs` → 104/104 alone after the week lane's `home.copyParts` landed). Every
failure attributable to **this** lane's change was fixed at the root — one, in
`tests/job-meta-constants.test.mjs`, documented above — and no test was deleted, skipped or
weakened to get there.

## 6. Open issues

- **`tests/job-screen.test.mjs:871` is red at hand-off** — the `screen` lane's S5 brief-press
  submit does not yet fire the redraw its own acceptance test measures (§5). Not this lane's file
  and not reachable from this lane's change; recorded so the campaign does not lose it.
- S3 is live end-to-end: all three `p.rank` writers pass `{rank}` (verified above), so the ratchet
  reaches the save and not just the two audit surfaces.
- **`player.records.bestRating` is read and coerced but never written** (Request 6). Until that
  one-line writer lands, the audit surfaces print no `best rating` and G9 #4's replacement claim
  (S3.5) is not yet true on screen.
- **`screens/settings.js:635`'s hint is now false for a measured+held window** (Request 3). That is
  a direct consequence of `held` changing meaning and it is the highest-priority hand-off from this
  lane.
- Finding #40's sentence is unfixed in `screens/run.js`; only the module-side number
  (`regretOf().ratingCost`) exists. Filed as Request 7.
- Finding #29 is unfixed (Request 5); S3.4 item 6 therefore has no home in this lane.
- The published cost of the ratchet (S3.6) is now asserted in two test files and is **not** yet
  published in `COMPOSED-GAME.md` G2/G4 — that is the `doc` lane's §S3.5 edit.

---

# ROUND 4 (verify round 1) — the S3 ratchet was a lottery, and the rank is now priced off the calls

Ticket: `call` lane, verify round 1. One BLOCKER, from `call-propriety`:
*"The S3 rank ratchet turns the rating into a one-way lottery: over-reporting strictly dominates
truth-telling for the rank, and at q = 3/5 it is free on BOTH published ladders."*
Owned file: `site/js/job/call.js` (+ `tests/job-call.test.mjs`).

## R4.1 The blocker is real, and it reproduces on the shipped path

Driven exactly as `state.applyTarget:1184-1187` drives it — `q̂` snapshotted before the outcome,
`windowPush` → `ratingDetail(win, 50, { rank })` → the returned rank persisted as the next call's
floor — 400 lives of 300 calls each, `rngFrom('ratchet', seed)`:

```
=== the ratchet currency: max_t rankFor(rating_t), persisted ===   (BEFORE the fix)
honest     q=0.55   P(>=3)  33.0%  P(>=4)   5.3%  P(>=5)   0.8%  meanRank 2.39
always70   q=0.55   P(>=3)  83.0%  P(>=4)  42.0%  P(>=5)   8.0%  meanRank 3.33
honest     q=0.60   P(>=3)  68.5%  P(>=4)  20.3%  P(>=5)   3.5%  meanRank 2.92
always70   q=0.60   P(>=3)  98.8%  P(>=4)  84.8%  P(>=5)  35.8%  meanRank 4.19
honest     q=0.65   P(>=3)  94.0%  P(>=4)  57.0%  P(>=5)  18.8%  meanRank 3.70
always70   q=0.65   P(>=3) 100.0%  P(>=4)  99.0%  P(>=5)  78.5%  meanRank 4.78
```

The mechanism is arithmetic, not a tuning accident. S3 made every writer persist
`p.rank = ratingDetail(..., {rank: p.rank}).rank`, so the currency that gates the 95 rung and
`guardMult` stopped being `E[rating]` and became `max_t rating_t`. **A max over a noisy statistic
pays for variance.** The window's rating has a sampling sd of ≈ 2.1 rating points against rank bands
1.2–1.5 wide, so a mean-preserving spread strictly dominates — and the honest call at `q̂ ≤ 0.6` is
the zero-variance report (`c(0.5, o) = 0` either way), which is the worst possible holding in that
currency. At a true rate of 0.50 the honest player prints **exactly 5.000 with probability 1** and
is Called 2 for ever, while any report with variance eventually ratchets past them.

## R4.2 Two rows of the evidence do not say what they are quoted as saying

Recorded because round 5 should not re-litigate them.

1. **e4: "always-70 beats honestCall(q̂) at every true rate tested (0.60, 0.65)."** At those rates
   **70 IS the truthful rung** — `honestCall(0.65) = 70`, and `regretOf({call: 70, qHat: 0.65}).cost
   = 0`, the app's own verdict. What e4 measures there is that reporting a *noisy estimate* of your
   rate scores worse than reporting the rate — which is strict propriety working, not a lie paying.
2. **"the brake on systematic over-calling is the CARRY ladder, not the rating — at q = 3/5 that
   brake is exactly zero."** True at that single point, and only there, because 3/5 is the 50↔70
   indifference of both ladders. For every q at which 70 is a genuine over-call the brake is
   strictly positive (`node .../carry.mjs`):

```
q      honestCall  evFor(q,50)  evFor(q,70)   carry brake     E[c] gap
0.50       50      0.5000       0.4000       +0.100000     +1.600000
0.55       50      0.5500       0.5000       +0.050000     +0.800000
0.59       50      0.5900       0.5800       +0.010000     +0.160000
0.60       50      0.6000       0.6000       +0.000000     +0.000000     <- the indifference point
0.65       70      0.6500       0.7000        (70 is the honest rung here: regret 0)
```

So the surviving defect is the one in R4.1: the **rank**, not the credit and not the carry.

## R4.3 What the tree pins, and why fix (a) had to take this shape

The finding's option (a) ("floor the rank on a statistic a single lucky window cannot spike") cannot
be built as a penalty or as a different floor, because `rank = max(rankFor(value), floor)` is pinned
in both directions by tests this lane may not touch:

| pin | file | what it fixes |
|---|---|---|
| `held` coward / `wild` (50×95 at q̂ 0.5, rating 0.00) with floor 5 → rank 5 | `tests/job-meta-constants.test.mjs:353, 1081` | the floor may never be capped downward |
| `after` (mastered window) with floor 5 → rank 5 | `tests/job-meta-constants.test.mjs:1069` | ditto |
| coward with floor 1 → Called 2 | `tests/job-meta-constants.test.mjs:340` | promotion off a floor must be full |
| `t.rank === 5` at rating 9.536, no floor | `tests/job-meta-constants.test.mjs:1063` | the no-floor path is the plain band lookup |

A confidence-bound penalty is also arithmetically dead: those two promotion pins leave at most
0.566 / 0.636 rating points of slack, i.e. `Z <= 0.74` on the window's own standard error — far too
weak to matter against a 2.1-point sd. And a penalty large enough to block the lie (`> 3.5`) would
put Called 5 out of reach of everybody, because the rating clamps at 10 and the top band starts at
8.9. **Option (a) therefore has to cap the rank on an OUTCOME-FREE statistic, not penalise a noisy
one.** That is what shipped.

## R4.4 The fix — `earned = min(value, ceiling)`

`site/js/job/call.js`, `ratingDetail` + the new module-private `slotCeiling`:

```js
for (const e of win) { sum += e.w * e.c; best += slotCeiling(e.w, e.p); if (e.informative) n++; }
const ceiling = clamp(RATING.base + RATING.scale * (best / size), RATING.min, RATING.max);
const earned  = Math.min(value, ceiling);
const rank    = rankFor(earned, { floor: opts.rank });

function slotCeiling(w, p) {                     // w·E[c](p, q̂) — the slot's WORTH, outcome-free
  const ww = clamp(num(w), 0, RATING.weightK / 4);
  if (ww <= 0 || !Number.isFinite(p)) return 0;
  const [lo, hi] = informativeBand(ww);          // the two q̂ with `weightFor(q̂) === w`
  return ww * expectedCredit(p, num(p) >= (lo + hi) / 2 ? hi : lo);
}
```

`ceiling` is the rating the student's **own reports** are worth on this material. It reads `ok` on
no slot, so no run of luck can raise it; and because the credit is strictly proper it is maximised
**slot by slot** by the truthful rung. The rating `value` is untouched — it is still the
measurement, and it is still allowed to be lucky. Only the rank, which buys tools, is capped.

Three properties, all asserted:

* **the ratchet still holds every rank a student owns** — the floor is applied exactly as before,
  so every S3 pin above passes unchanged. `earned` only ever lowers the rank a window EARNS.
* **`rank <= rankFor(value)` with no floor** — the cap can never invent a rank the rating did not
  reach, so the published rating→rank band table stays true as an upper bound.
* **Called 5 stays reachable by honest play** — the cap of a truthful window is exactly
  `expectedRating(q̂)` (asserted, §6). Over the q̂ the game can actually compute (a clear rate over
  `qHatWindow = 10` sittings, so k/10) it peaks at **9.536 at q̂ = 0.90**, above the 8.9 threshold;
  on a continuous q̂ it would peak at 9.998 at q̂ = 0.85.

New fields on the detail: `ceiling`, `earned`, `capped`. Nothing was removed. No new constant and no
new numeral (`job-call.test.mjs`'s decimal-literal lint passes).

## R4.5 What it measures now

**The headline case, deterministically closed.** At q̂ = 3/5 — where the two rungs are exactly tied
on both ladders — a 70 call is now worth exactly the neutral, so *no* outcome sequence can print
above 5.00 (`§3`, every clear count from 0/50 to 50/50):

```
BEFORE: rankFor(ratingDetail(fifty 70-calls at q̂ 3/5, all cleared).value) === 5   ← banked for ever
AFTER : ratingDetail(same window, {rank: 2}).rank === 2, and ceiling === 5.000 at every clear count
```

**Honest vs one rung over, on the floored rank the game persists** (the finding's own acceptance
criterion), 250 lives × 300 calls, mean banked rank:

```
true q   honest   +1 rung   -1 rung          true q   honest   +1 rung   -1 rung
0.50      2.064     2.020     2.000          0.75      4.472     3.920     3.608
0.55      2.260     2.108     2.036          0.81      4.768     4.112     3.920
0.60      2.744     2.480     2.164          0.86      4.752     4.212     3.952
0.65      3.444     3.060     2.572          0.92      4.412     4.092     3.784
0.70      4.032     3.536     3.116
```

Honest wins at every rate, in both directions. Against FIXED policies, `P(ever reach Called 5)`:

```
true q   always50  always70  always85  always95   honest
0.60        0.0%      0.0%      0.0%      0.0%     0.4%      (was: always70 35.8%)
0.81        0.0%      0.4%     56.0%      9.6%    76.8%
```

**Not a tautology.** `§4` ratchets the pre-fix statistic (`max_t rankFor(value)`) on the *same*
draws and requires it to still show the defect; the test fails if it does not.

## R4.6 Known limit, pinned rather than hidden — the unreadable branch of `w`

`w = K·q̂(1−q̂)` is symmetric, and the entry stores `w`, not `q̂`, so `q̂` and `1−q̂` are the same slot.
`slotCeiling` therefore reads the branch that FLATTERS the call (flattering can only ever cap too
high, so nobody is demoted by the ambiguity). On the readable branch — `q̂ >= 0.5`, which is every
clear rate the composer's own `RUNG_BANDS` produce (0.81 / 0.92 / 0.99) — the root IS the slot's q̂
and truth is the exact slot-by-slot maximiser (`§1`). On the other branch (material the student
misses more often than not) a lie can out-cap the honest 50 — e.g. at q̂ = 0.1 the 70 call caps at
1.728 against the truth's 0.000 — and there it is the OTHER term, `min(value, …)`, that closes it:
that lie's realised rating is catastrophic on exactly that material (`§1b` asserts it on the window
whose clear count is the one q̂ describes). Closing it inside the cap needs `q̂` itself in the entry,
which is the save schema — Request 4 below.

**Residual, measured and named.** A *mixed* fixed policy (`always 70`) still edges `honestCall(q̂)`
on the banked rank at true rates 0.50–0.65, by 0.04–0.19 of a rank (e.g. 2.396 vs 2.260 at 0.55).
That gap is `q̂`-ESTIMATOR noise, not the scoring rule: with a stable q̂ the same comparison inverts
outright — at q̂ = 0.55 held fixed, `always 70` caps at 3.42 (Called 1) against the honest 50's
exactly 5.00 (Called 2). The estimator is `RATING.qHatWindow = 10` in `site/data/job.js`, which this
lane does not own; recorded for the `econ` lane rather than papered over here.

## R4.7 Requests (files this lane does not own)

1. **`screen` lane — `site/js/screens/settings.js`, `stats.js`, `job.js`.** `ratingDetail` now
   returns `ceiling`, `earned` and `capped`. `capped === true` means *"your rating ran ahead of what
   your calls were worth; the rank reads the calls"*, and it is the one case where a student can see
   `rating 7.20 · Called 2` with no floor in play. The three rating surfaces should say so in words
   (`held` already covers the other direction). Suggested sentence, to be written by that lane:
   *"The rank prices the calls you made; the rating prices how they landed."*
2. **`screen`/`state` lanes — read the legal rungs off the RANK, never off the rating band.**
   `player.rank` may now be LOWER than `rankFor(player.rating.value)`. `site/js` is already clean
   (`state.callsAvailable` / `lockCall` both gate on `guard.rankOf(save)`); the only offender in the
   tree was this lane's own e2e harness, fixed here (`tests/job-call.test.mjs:1677`, the `e2ePlay` harness). Any new
   surface that derives available calls from the rating will seal a rung the game then refuses.
3. **`doc` lane — `COMPOSED-GAME.md` G2 "Rank" and G3.7 #9.** The rank is no longer "the band the
   rating falls in, floored by what you hold": it is *"the band the rating falls in, capped by what
   your calls were worth, floored by what you hold"*. G3.7 #9's sentence *"The brake on systematic
   over-calling is the CARRY ladder, not the rating"* is now true of the **credit** and false of the
   **rank** — the rank brake is the cap. Both need the qualification; the numbers are in R4.5.
   G3.8 #3 ("truthful self-assessment is the dominant reporting policy") is restored on the rank and
   should carry its domain: the readable branch of `w` (R4.6).
4. **`save`/`state` lanes — store `q̂` on the rating entry instead of `w`.** `w = weightFor(q̂)` is
   recoverable from `q̂` exactly, so this is the same information at the same byte cost, and it would
   close R4.6's branch ambiguity in the cap rather than in the rating. It touches `callEntry`'s
   shape, `store.js`'s coercion and `state.js`'s `g.calls.push({ w: entry.w })`, so it is a
   cross-lane change, not this one's.

## R4.8 Suite

```
$ node --test tests/job-call.test.mjs
  tests 119 · pass 119 · fail 0            (108 at the start of this ticket; +6 mine, +5 landed by
                                            the `run` lane mid-ticket when it removed `before:`)
```

Blast radius, measured by A/B rather than argued (the tree has twelve lanes editing it, so a raw
failure count proves nothing). `site/js/job/call.js` copied aside, the two rank lines reverted to
`rankFor(value, …)`, the eleven test files that carry any failure run both ways:

```
$ node --test tests/job-align … tests/mock.test.mjs      (rank lines PRE-fix)
  tests 706 · pass 683 · fail 23
$ node --test tests/job-align … tests/mock.test.mjs      (rank lines POST-fix)
  tests 706 · pass 683 · fail 23
$ diff <(pre failures) <(post failures)
  (no output — the fix introduces ZERO new failures)
```

Whole suite, at hand-off:

```
$ cd /Users/oliver/Projects/unit1a-quest && node --test tests/
  tests 2916 · pass 2912 · fail 0 · skipped 4 · EXIT 0
```

(Two failures seen in an intermediate whole-suite run — `job-board.test.mjs` "a target a job does
not reach stays due" and `job-meta-constants.test.mjs` "G3.2 no longer offers a rank brake" — were
other lanes' files being rewritten DURING that four-minute run: both pass in isolation, with and
without this lane's change. The stated ticket baseline of 2725/2721 is superseded per
`REPAIR-DECISION.md` §S0; the tree has grown twelve lanes' tests since.)

The three failures inside the files this lane reads most (`mock.test.mjs` "a Mock never demotes the
rank", `job-exploit.test.mjs` "no payoff module imports the rng", "the ×1.25 is worth a QUARTER")
were confirmed by the same A/B to be other lanes' in-flight work: `screens/mock.js`, `data/job.js`,
`screens/run.js` and `job/econ.js` were all rewritten within ten minutes of this measurement.

## R4.9 Open issues

- **R4.6's residual and its branch ambiguity** are the honest boundary of this repair: the cap makes
  truth the maximiser wherever the window can read what the material was, and `min(value, …)` covers
  the rest. Request 4 is the only way to make the theorem unconditional.
- **The three rating surfaces do not yet explain `capped`** (Request 1), so a student whose luck ran
  ahead of their calls sees a rank the screen cannot account for.
- `COMPOSED-GAME.md` still publishes the uncapped rank rule (Request 3).

---

# VERIFY ROUND 2 — the `call` lane (site/js/job/call.js)

Four findings against this file: two BLOCKERs from `call-propriety` / `exploit-hunt`, one BLOCKER
from `test-integrity`, one MAJOR from `test-integrity`. All four are fixed at the root. The two
root causes turned out to be halves of one defect in round 4's rank cap, and both are now closed.

## R5.1 F1 — the cap guessed which material the call was made on, and guessed to flatter

**Reproduced first, in the shipped module.** `slotCeiling(w, p)` picked the root of `w` by
`num(p) >= (lo + hi) / 2`. `informativeBand(w)` is symmetric about ½ and every `CALL_LEVELS[i].p`
is ≥ ½, so the selector resolved to `hi` on every game call. Per-slot ceiling, read back out of
`ratingDetail` on a one-slot window (rating scale), PRE-fix:

```
q̂=0.1 honest 50 -> 50:5.0000  70:8.4560  85:9.5360  95:9.5360   (argmax 85)
q̂=0.2 honest 50 -> 50:5.0000  70:9.0960  85:9.4800  95:8.4560   (argmax 85)
q̂=0.3 honest 50 -> 50:5.0000  70:7.6880  85:6.1760  95:3.4880   (argmax 70)
```

**Why no rule over `(w, p)` can fix it.** An 85 lie at q̂ = 0.1 and an honest 85 at q̂ = 0.9 write
the *identical* slot. The suite now asserts that as a one-line equality (§1's negative control),
so the impossibility is on the record rather than in an argument. Taking the *lower* root instead
prices the honest master at q̂ = 0.1 and demotes them — the S3 fault again.

**The fix is in the save schema, at zero byte cost.** `callEntry` stores the slot's own `q̂` and
`windowOf` derives `w = round(K·q̂(1−q̂), 6)` from it; `slotCeiling(w, p, q)` reads the material
instead of guessing a root. Post-fix, same table:

```
q̂=0.1 honest 50 -> 50:5.0000  70:0.0000  85:0.0000  95:0.0000
q̂=0.2 honest 50 -> 50:5.0000  70:0.0000  85:0.0000  95:0.0000
q̂=0.3 honest 50 -> 50:5.0000  70:0.0000  85:0.0000  95:0.0000
```

**Byte cost: zero, and that is why it could ship in this lane.** The entry is `{p, ok, q, skill, at}`
where it was `{p, ok, w, skill, at}` — same key count, and the widest value is 8 characters in both
forms (`round(1/3, 6) = 0.333333` against `round(4·(1/3)(2/3), 6) = 0.888889`). Measured through the
real budget test, `player.rating.calls[]` is **70 B real against 74 B priced** and G7's `player`
line is unmoved, so `SAVE_BUDGET_KB` and G7's table did not have to be restated. An ADDITIVE `q`
would have cost ~650 B on a 50-slot window against 49 B of slack on the `player` line and 326 B on
the 39.6 KB headline — it does not fit, which is why the field was swapped rather than added.

**The one form that keeps the old reading** is a slot with no make and therefore no clear rate:
`screens/mock.js mockCall` writes `callEntry({ p: 1 − err, w: mockCallWeight(ŝ) })`. Those keep
`{p, ok, w, skill, at}` byte for byte (including their `{p: null, w: 0}` blank), and `windowOf`
reads either form, so **every window written before this round scores and caps exactly as it did**
(asserted in §1b).

## R5.2 F2 — `min(value, ceiling)` was the other half of the same blocker

The q̂ fix alone does **not** restore G3.8 #3. Driven through §4's own harness with the family
extended to branch-conditional policies, `+1 rung wherever the honest call is the bottom rung`
still out-banked truth at four of six true q (e.g. 2.200 against 2.133 at q = 0.55).

**Why.** `ceiling` is the worth of a report conditional on the ESTIMATE q̂; `value` realises at the
student's TRUE rate — and a window is selected into the honest 70 rung precisely when q̂ has run
*above* that true rate. At a true q of 0.55, 60 lives × 200 calls, windows 50…200:

```
honest                   value >= its own ceiling in   4.7 % of windows   mean(value − ceiling) −1.501
+1 rung on the           value >= its own ceiling in  45.9 % of windows   mean(value − ceiling) −0.098
  bottom-rung branch
```

So the `min` threw the truthful ceiling away 19 windows in 20 and the liar's away 1 in 2. It was
not a safeguard; it was the leak. `earned = ceiling` now, and the `value` term bought nothing it
was claimed to: a ceiling above the neutral requires `w ≥ 0.25` AND a rung worth more than the 50's
flat 0, i.e. q̂ ≥ 0.7, so the ceiling *is* a competence measurement.

**Mean banked rank, shipped path (`windowPush → ratingDetail({rank}) → persisted rank`), 60 lives ×
200 calls per cell, eight policies:**

```
true q | truth | +1 unif | −1 unif | +1 q̂≤.35 | +2 q̂≤.35 | +1 btm | +2 btm | top btm
 0.50  | 2.233 |  2.033  |  2.033  |  2.150   |  2.133   | 2.083  | 2.000  | 2.000
 0.55  | 2.700 |  2.067  |  2.083  |  2.617   |  2.617   | 2.250  | 2.100  | 2.083
 0.60  | 3.167 |  2.333  |  2.367  |  3.117   |  3.117   | 2.867  | 2.283  | 2.133
 0.65  | 3.533 |  2.700  |  2.717  |  3.500   |  3.483   | 3.317  | 2.783  | 2.450
 0.70  | 4.083 |  3.450  |  3.300  |  4.067   |  4.067   | 4.050  | 3.733  | 3.450
 0.80  | 4.650 |  4.000  |  3.783  |  4.650   |  4.650   | 4.650  | 4.550  | 4.533
```

Truth is the **strict** argmax in all 48 cells. §4 drives five of these policies (the two uniform
arms plus three branch-conditional ones) and asserts it, with §5's anti-tautology control kept.

## R5.3 F3 / F4 — the capping quantity is published and PRINTED

`ratingDetail` gains **`offBand`** — true exactly when the printed rank is not the band the printed
rating falls in, in either direction (the ratchet's floor included). Both audit builders now print
the number that explains it:

- `screens/settings.js ratingAuditParts` → `worth`, rendered in `ratingCard`'s headline, with a
  hint under it naming which number is which, a second published formula line for the rank, and a
  label over the band legend saying the bands are what a *rating* buys.
- `screens/stats.js ledgerRatingParts` → `worth`, rendered in `ledgerPanel`, with the same sentence.

`tests/job-call.test.mjs` S3-CAP **§7** drives BOTH shipped line builders over 1 125 shipped windows
(9 q̂ × 4 rungs × 5 clear counts × 5 held ranks) and asserts: the line leads with the live rating,
names the rank the save holds, and — whenever the rating's band and the rank differ — contains the
ceiling. It also replays the exploit-hunt's own save verbatim (q̂ ≈ 0.5, top legal call, 50/50
cleared) and asserts `your calls were worth 0.00` is in both strings. Red before this change.

F4's arm: §1b builds the slot `screens/mock.js` actually writes (`p = 1 − err` with `err > 0.5`,
i.e. `p = 0.25` on a w = 0.64 slot), asserts the ceiling is `w·E[c](p, lo)` and STRICTLY above the
`hi` reading (a 7.68 swing in w·c units), and pins the high arm too. Verified by mutation:

```
$ sed 's/num(p) >= (lo + hi) \/ 2 ? hi : lo/hi/' → job-call.test.mjs  tests 119 · pass 118 · fail 1 (§1b)
$ sed 's/>=/>/'                                   → job-call.test.mjs  tests 119 · pass 119 · fail 0
```

The second mutant is **equivalent, not untested**: `E[c](½, q) = 10 − 40·¼ = 0` for every q, so at
`p = ½` the two roots pay the same and the tie side is unobservable. §1b asserts that too, so the
next sweep does not re-file it.

## R5.4 Files changed

Owned by this lane:

- `site/js/job/call.js` — `callEntry` (stores `q`), `weightOf` / `qHatOf` (new exports, the single
  readers of the two entry forms), `windowOf`, `slotCeiling(w, p, q)`, `ratingDetail`
  (`earned = ceiling`, new `offBand`), and the three banners that claimed the old rules.
- `tests/job-call.test.mjs` — §1 extended to every q̂ with the pre-fix reading as its negative
  control; §1b rewritten onto the Mock's form and the legacy window; §4's family extended to five
  policies; §6 re-pointed onto "the rank moves with no outcome"; §7 new.

Outside this lane, each one forced by the change and marked here per BUILD-POLICY §2:

- `site/js/job/state.js` — 2 lines + 1 comment: `entry.w` → `call.weightOf(entry)` at
  `applyTarget`, `g.calls.push({ w: entryW })`, and the `min(value, ceiling)` in the audit-record
  comment. The lane's own `detail.earned` writers are untouched and still correct.
- `site/js/screens/mock.js` — 1 comment line (`detail.earned = min(value, ceiling)`).
- `site/js/screens/settings.js`, `site/js/screens/stats.js` — the `worth` part, the panel hints and
  the band-legend label (R5.3). This is what findings 2 and 3 ask for by name.
- `tests/_helpers.mjs` — `WIDEST_Q` and the fixture's `w:` → `q:`. Forced: the G7 completeness
  assertion compares the fixture's key set against a real save's, which is exactly its job.
- `tests/job-index.test.mjs` — 1 line, `w1[0].w` → `weightOf(w1[0])`; the claim is unchanged.
- `tests/job-meta-constants.test.mjs` — the `bestRating` high-water arm now samples `earned` (the
  quantity BOTH writers store, per `state.js`'s own comment) instead of `value`, which could only
  ever agree while `earned` was `min(value, ceiling)`. Strengthened, not weakened: it also asserts
  the record differs from the live rating and that the series really moved.
- `COMPOSED-GAME.md` — G2 "Rank" (the ratchet line, THE CAP's code block and its new paragraph, the
  price bullet, the audit-record paragraph), G3.1 :415, G9 #4 :1052 (the exception now names BOTH
  directions and says they are printed), G12 #78.

## R5.5 Suite

```
$ node --test tests/job-call.test.mjs
  tests 120 · pass 120 · fail 0
$ node --test tests/job-meta-constants.test.mjs tests/job-index.test.mjs tests/job-call.test.mjs
  tests 282 · pass 282 · fail 0
```

Whole-suite result and the four failures that are NOT this lane's are in R5.6.

## R5.6 Requests

1. **`run` lane + `data/job.js` — the debrief's rating line has the same contradiction.**
   `screens/run.js:2555` renders `JOB_COPY.ratingLine({ rank, rating, n, N })`, which prints the
   HELD rank beside the live rating and nothing that reconciles them. It does not print the band
   legend, so a student cannot catch it there the way they could on Settings, but the fix is the
   same shape: give `COPY.ratingLine` an optional `worth` clause and pass
   `ratingDetail(...).offBand ? detail.ceiling : null`. Findings 2 and 3 named only the two audit
   surfaces, which is why this lane stopped there.
2. **Mock slots still tighten the cap and can never raise it.** An accurate Mock forecast
   (`p = 1 − err → 1` at `w = 1`) has a double-root ceiling of −10 per slot while it PAYS +10, so a
   Mock-heavy window is `capped` and its game calls are dragged with it. Unchanged by this round
   (the reading is identical to what shipped) and out of scope for these four findings, but it is a
   real interaction between `screens/mock.js`'s error-equivalent `p` and a ceiling built for
   forecasts of a clear. Owner: whoever owns `screens/mock.js` + this file together.

**Whole suite at hand-off** (06:55, with the `econ` lane rewriting `site/js/job/econ.js` live — it
was last written three minutes before this run):

```
$ node --test tests/
  tests 2994 · pass 2985 · fail 5 · skipped 4
```

The five are the `econ` lane's in-flight payout-ladder rewrite and none of them is this lane's:

```
job-exploit  "the guard multiplies both branches too"          econ.carryFor/missFor expectation
job-exploit  "the ×1.25 is worth a QUARTER of the target"      econ.settle
job-monotone "PINNED: clearing target 1 LOWERS the optimum"    OPT() moved 483 → 476
job-monotone "G3.7 proof 2 as SCOPED — ALL 2ⁿ outcome vectors" the same optimum
job-screen   "the published 30 % is what that arithmetic …"    "G3 says 30 %; the ladder pays 19.7 %"
```

`site/js/job/econ.js` imports `xp.js`, `schedule.js` and `data/job.js` and **not** `call.js`; the
monotone arm builds its target descriptors by hand and never touches a rating, a rank, a window
entry or a weight. The failure set changed three times in nine minutes (6 → 10 → 5) while this lane
changed nothing, and the messages moved with `econ.js`'s mtime each time.

**Every test file this lane's change can reach is green:**

```
$ node --test tests/job-call tests/job-save tests/job-state tests/job-state-r3 tests/mock \
              tests/job-week tests/job-index tests/job-meta-constants tests/job-ledger \
              tests/job-copy tests/job-debrief tests/job-crew
  tests 827 · pass 827 · fail 0
```

---

# VERIFY ROUND 3 — the `call` lane (`site/js/job/call.js`)

Four findings: **2 BLOCKER** (call-propriety), **2 MAJOR** (call-propriety, player-feel). All four
were verified against the shipped code before anything was edited; **none was refuted**, and one of
them (R6.2) turned out to be understated — widening the q̂ grid immediately exposed a second, smaller
fact no test had ever seen (the 6 dp the slot stores its evidence at), which is now pinned too.

Every numeral published below is one a shipped function produces **and** a test asserts.

---

## R6.1 F1 (BLOCKER) — `RATING.mockWeight = 1.0` was a fiction with a student-facing render

**The finding, reproduced.** `site/data/job.js` published `mockWeight: 1.0` ("the weight is DEFINED
at 1.0"), `screens/settings.js` printed it verbatim to the student, `COMPOSED-GAME.md` repeated it at
six sites, and `tests/job-call.test.mjs` asserted it — while **nothing in `screens/mock.js` ever read
the constant**. The shipped law is `mockCallWeight(ŝ) = min(4ŝ(1−ŝ), MOCK_CALL_W)` with
`MOCK_CALL_W = INFORMATIVE_MIN = 0.25`, gated so it is **0** below the gate:

```
RATING.mockWeight (published) = 1        MOCK_CALL_W (shipped) = 0.25   MOCK_CALL_SLOT_MAX = 2.5
sHat=null  mockCallWeight=0      sHat=0.5  mockCallWeight=0.25      sHat=0.95 mockCallWeight=0
```

So a perfect Mock forecast is worth `2·(0.25×10)/50 = 0.10` rating, not the `0.40` the panel implied
— a **4× overstatement of the app's only calibration surface outside a job** — and a first-ever Mock
is worth exactly **0.00** while the panel called it the heaviest call in the window. The second half
of the printed sentence was false too: the weight is **measured** from `mockPriorMean`, not defined.

**Why no test saw it.** The arm handed `callEntry` a constant no shipped caller passes:

```js
test('the Mock enters the window at the defined weight w = 1.0 (G12 #40d)', () => {
  const e = callEntry({ p: 0.7, ok: true, w: JOB.RATING.mockWeight, skill: null, at: 1 });
  assert.equal(e.w, 1);            // …a test of callEntry's pass-through, not of the Mock
```

`tests/job-week.test.mjs:600-604` asserted the OPPOSITE fact about the same mechanic
(`MOCK_CALL_W === 0.25`, `MOCK_CALL_SLOT_MAX === 2.5`) and both suites were green, because neither
drove the mechanic.

**The repair.**

- `site/data/job.js` — `mockWeight: 0.25`, redocumented as the Mock's weight **CEILING** (= `MOCK_CALL_W`
  = `informativeMin`) with the measured law and the history of the drift. *(This is the week lane's own
  Request (a) in `notes/repair-week.md:434-438`, filed in verify r1 and never applied.)*
- `site/js/screens/settings.js` — the "the Mock" legend row now prints the shipped rule:
  `w = min(4ŝ(1 − ŝ), 0.25)` on ŝ = your mean score over the last ten papers, **0** on a first-ever
  paper and **0** outside the informative band, so one Mock can never add more than **2.50** to
  `Σ(wᵢ·cᵢ)` — "about one job call, not four". *(Week lane's Request (b).)*
- `site/js/job/call.js` — `callEntry`'s banner and `slotCeiling`'s "the one slot that has no q̂"
  paragraph said "DEFINED rather than measured" in this file's own words. Both now say what is true:
  the Mock has no `q̂` because it has no **make**, and its weight is measured off its own history.
- `COMPOSED-GAME.md` — six sites corrected (G3.7 proof 4, G7's file table, G8's J11 scope row, the
  J11 acceptance row, G12 #40d, G12 #75).
- `tests/job-call.test.mjs` — the arm above is replaced by one that **drives `screens/mock.js`**
  (`applyMockCall` → `player.rating.calls`) over three regimes and asserts `RATING.mockWeight` IS
  `MOCK_CALL_W`, so the two suites can never assert contradictory weights again:

| driven arm | ŝ | `w` | stored entry | rating move |
|---|---|---|---|---|
| first-ever paper, perfect forecast | `null` | 0 | `{p: null, ok: true, w: 0, …}` — BLANK | **0.00** |
| one prior paper at 50, perfect forecast | 0.50 | **0.25** | `{p: 1, ok: true, w: 0.25, …}` | **+0.10** |
| one prior paper at 95, perfect forecast | 0.95 | 0 | BLANK | 0.00 |

with `2·(1.0×10)/50 = 0.40` asserted beside it as the number the old constant implied, and a source
guard that fails if Settings ever tells the student the weight is "defined rather than guessed" again.

## R6.2 F2 (BLOCKER) — "every reachable q̂ is `k/10`" is false; 6/7 pays 2.4980

**The finding, reproduced.** `call.js qHatDetail` divides by the sittings the make **has**:

```js
const win = seenBefore.slice(-size); const of = win.length; … const qHat = of > 0 ? hits / of : null;
```

so a make reports sevenths until its eighth sitting and tenths only from its tenth. The informative
**reachable** set has **31** members, not 9 — `informativeQHats().length === 31`, verified — and four
of them beat the 2.2680 the Sanity table published as the reachable maximum:

```
6/7 = 0.8571  w 0.4898  w·E[c] 2.4980      8/9 = 0.8889  w 0.3951  w·E[c] 2.3660
5/6 = 0.8333  w 0.5556  w·E[c] 2.4630      9/10 = 0.9000 w 0.3600  w·E[c] 2.2680  ← the published "max"
7/8 = 0.8750  w 0.4375  w·E[c] 2.4500      continuous peak 2.4998
```

6/7 is **10.1 %** above the published figure and within **0.0018** of the continuous peak.

**Nothing is broken by it** — `argmax_p w·E[c](p, q̂) == honestCall(q̂)` holds at all 31, 0 mismatches
— but §1, the slot-by-slot identity the whole rank cap rests on, was **verified on 9 of 31**, because
the grid was a constructor inside the test:

```js
const QHATS = Array.from({length: JOB.RATING.qHatWindow + 1}, (_, k) => k / JOB.RATING.qHatWindow).filter(isInformative);
assert.deepEqual(QHATS, [0.1, …, 0.9], 'the informative q̂ grid came out as …');   // pinned the wrong set as fact
```

**The repair.**

- `site/js/job/call.js` — **`reachableQHats(size)` and `informativeQHats(size)` are new exports**: the
  grid is now the *code's*, importable, with the argument and the four falsified claims in the
  docblock. `wTimesEcDiscrete`'s docblock carries the corrected reachable maximum.
- `tests/job-call.test.mjs` — S3-CAP's `QHATS` is `informativeQHats()`; the old decile set is kept as
  `DECILES` and asserted to be a **strict subset**, with `QHATS.length >= 31` as a floor so the arm can
  never shrink back. §1 additionally **drives `qHatDetail`** over every reachable `(hits, of)` and
  asserts the divisor is `of` and not the window — the mechanism, not just the set — and asserts the
  reachable argmax is 6/7 at 2.4980 with exactly four values above 2.2680. §1, §4, §6 and the new §8
  now sweep 31 values instead of 9.
- `COMPOSED-GAME.md` — four sites corrected: G2 THE CAP (`{0.1 … 0.9}` "asserted as that set"), the two
  Sanity rows (`.85` and `.90`), G3.7 #8's anti-tanking argument, plus the G11 withdrawn list and
  G12 #48 which restate the same grid. **G3.7 #8's residual is re-derived where it moves and where it
  does not:** the throw channel peaks at **one throw in SEVEN**, worth 2.4980 — essentially the
  continuous ceiling rather than 91 % of it — but the *rank* prize is unchanged, because fifty honest
  slots are worth 9.996 at 6/7 and 9.536 at 9/10 and **both are Called 5**. So "a throw buys a tool
  already owned" survives; the `w·E[c]` figure and the throw RATE did not.
- `site/js/screens/mock.js` — the two comments that justify `MOCK_CALL_W` cited "the reachable-grid
  best 2.2680" and "4.41×"; both corrected (2.4980, 4.00×).

**WHAT THE WIDER GRID IMMEDIATELY CAUGHT, and this is the part the finding did not predict.** Two §
arms went red the moment the grid stopped being deciles:

```
q̂ 0.6666666666666666: the cap is not w·E[c] at the honest rung  expected 0.948148148148148 ± 1e-9, got 0.9481519407360084
q̂ 0.6666666666666666: the cap and expectedRating disagree       expected 6.8962962962962955 ± 1e-9, got 6.8963038814720035
```

`callEntry` stores `q̂` at 6 dp and `weightOf` rounds `w` to 6 dp (its banner prices G7's byte budget
on exactly that), while `expectedRating` computes both exactly. **Every decile is exact at 6 dp**, so
nine values could never see it; 2/3, 6/7, 1/7 … are not. Both arms are now **stricter**, not looser:
the shipped identity is asserted to `1e-12` against the quantities the pipeline really uses
(`weightOf(slot) × expectedCredit(p, qHatOf(slot))`), the published form is asserted to within
`scale·5e-7·c_max` — a bound *derived* from the two roundings, not a widened tolerance — and where
`stored === q` the published form is still asserted exactly.

## R6.3 F3 (MAJOR) — the rank cap is proper in `q̂`, not in belief

**The finding, reproduced, through `callEntry → ratingDetail` on the app's own m60 material**
(`RUNG_BANDS[60]` clears 0.92; a 7-of-10 record reads q̂ = 0.70; `honestCall(0.70) = 70`,
`honestCall(0.92) = 95`), fifty slots of each:

| report | per-slot `w·E[c](p, q̂)` | ceiling | rank | per-slot `E[w·c]` at the TRUE rate |
|---|---|---|---|---|
| 70 — honest about the record | 1.3440 | 7.688 | **Called 3** | 4.3008 |
| 85 | 0.5880 | 6.176 | Called 2 | 5.7624 |
| 95 — honest about the target | −0.7560 | 3.488 | **Called 1** | **5.8968** |

The report that is TRUE about this student's clearing earns the **highest rating** in expectation
(+1.596 a slot) and the **lowest rank** — two bands, and Called 3 is the gate on the 95 button itself.

**It is not fixable in code and the fix is not attempted.** `ok` is the only other thing a slot
carries, and pricing the rank off an outcome is precisely the S3 lottery the ratchet exists to refuse
(R4/R5 above removed it, with the measurement). Before the r4 repair the rank was
`rankFor(value, {floor})`, which IS proper in belief; moving it onto `ceiling` closed the ratchet hole
and moved the propriety onto `q̂` — **and the sentences above it did not move.** So the repair is the
qualifier, stated at every site that makes the claim:

- `site/js/job/call.js` — `slotCeiling` gains a "PROPER IN THE REPORT AGAINST q̂ — WHICH IS NOT THE
  SAME AS PROPER IN BELIEF" section with the table above; `ratingDetail`'s banner and its inline
  ratchet comment both carry the qualifier instead of the bare "the truthful rung".
- `site/js/screens/settings.js` — the `p = q` hint is **scoped to the RATING** ("the only way to score
  well on the RATING…", which is where it is true), and the rank formula block gains one clause:
  `E[cᵢ]` is taken against q̂, your RECORD on the make, so a call that is right about this target but
  far from that record is worth more RATING than it is worth RANK.
- `COMPOSED-GAME.md` G3.1 — the identity now reads "the rung that is truthful **about `q̂`**", followed
  by the measured table and a paragraph naming this a SCOPE rather than a defect. G2 THE CAP's headline
  carries the same qualifier.
- `tests/job-call.test.mjs` **§8** (new) — drives the table through the shipped path and asserts both
  directions: the rating's argmax is the TRUE rate's rung, the rank's argmax is the RECORD's rung, the
  ranks are 3 / 2 / 1, and the gap is 1.596 a slot. It then re-asserts that the identity against `q̂`
  is untouched over all 31 reachable values, so the arm cannot be read as reporting a broken cap.

## R6.4 F4 (MAJOR) — the sealed envelope could not say whether the call would count

**The finding, reproduced.** `INFORMATIVE_MIN` cuts at **q̂ = 0.9330127**, which is **strictly inside**
the top evidence band `[0.8375, 1]`, so one printed sentence covered both kinds of call:

```
q̂ 0.84 -> w 0.5376  (counts)      q̂ 0.95 -> w 0.1900  (BLANK — pays exactly 0)
q̂ 0.90 -> w 0.3600  (counts)      q̂ 1.00 -> w 0.0000  (BLANK — pays exactly 0)
```

and the student learned which only in `payoutLineOf`, after committing. On the repo's own mid-week
fixture **60 % of a 40-job arm's calls (240 of 400)** are blank slots, because spaced repetition
drives q̂ to 1 on reviewed makes: the better the student, the more of their calls stop counting.

**The suggested "fourth band" fix is REFUSED, with the reason.** Splitting `[0.8375, 1]` at the cutoff
makes `[0.93301, 1]` a band whose every q̂ has honest rung 95 **and** EV-max 95 — a band that names the
argmax, which is the one thing the partition exists to prevent, and `job-call.test.mjs`'s own law-6
arm (every band ≥ 2 rungs on both ladders) would go red. **What ships is the opposite shape:** ONE
state, shared by BOTH tails, printed **instead of** the band. `measures === false` denotes
`[0, 0.06699) ∪ (0.93301, 1]`, whose honest rung is 50 **or** 95 and whose EV-max rung is 50 **or** 95
— so it carries **strictly less** than the band it replaces (band 0 and band 2 each resolve their own
tail today). Global law 6 is better served after the change than before it.

- `site/js/job/call.js` — **`evidenceOf(qHat)` is a new export**: `{ band, measures, w }`, `band: null`
  exactly when the call cannot score, with the law-6 argument and the refusal above in its docblock.
- `site/js/screens/job.js` — `evidenceWordsOf` (the single function the envelope AND the vault line go
  through, which is why both had to move together or the two surfaces would compose back into the
  tail) returns the blank sentence for a non-measuring record:
  `too one-sided to score a call — loot still pays, the rating does not`. No rung, no fraction, no
  window size; `null` (→ "no history yet") still means no history.
- `tests/job-call.test.mjs` **§9** (new) — asserts the cutoff is inside the top band, the four readings
  above, that both tails are ONE state that decodes to `{50, 95}` on both ladders, that the blank set
  is exactly `reachable − informative`, and drives the shipped `envelopeLinesOf` to assert the two
  tails print the same sentence and it differs from the band sentence it replaces.
- `tests/job-screen.test.mjs` — the law-6 sweep is **strengthened**: a sentence's region is now the
  union of the bands it touches restricted to its own `measures` state, a band sentence must still be
  one band, and **the blank sentence must span TWO** — if it ever collapsed onto one tail it would name
  a rung and the arm fails. `seen.size` is `evidenceBands().length + 1`.

## R6.5 Files changed

**Owned by this lane**

- `site/js/job/call.js` — `reachableQHats`, `informativeQHats`, `evidenceOf` (new exports);
  `wTimesEcDiscrete`, `callEntry`, `slotCeiling` and `ratingDetail` docblocks/banners corrected.
  No behavioural change to any existing function: the three new exports are additive and every
  existing arm is byte-identical in what it computes.
- `tests/job-call.test.mjs` — the Mock arm rewritten onto the shipped path; `QHATS` re-pointed at the
  code's grid with a ≥ 31 floor and a `qHatDetail`-driven mechanism check; two identity arms tightened
  to 1e-12 against the stored quantities with a derived rounding bound; **§8** and **§9** new.

**Outside this lane, each one forced by a finding assigned to this lane, marked here per BUILD-POLICY §2**

| file | change | why it could not wait for its owner |
|---|---|---|
| `site/data/job.js` | `mockWeight: 1.0 → 0.25` + its docblock | one line; it is F1's root, and it is the week lane's own unapplied Request (a) |
| `site/js/screens/settings.js` | the Mock legend row; the `p = q` hint scoped to the rating; one clause added to the rank formula block | these are the *student-facing* halves of F1 and F3 — leaving them is leaving the blocker |
| `site/js/screens/mock.js` | two comment numerals (2.2680 → 2.4980, 4.41× → 4.00×) | comments only; named by F2 |
| `site/js/screens/job.js` | `evidenceWordsOf` — the blank-record sentence | F4 has no fix that lives only in `call.js`; `call.js` deliberately holds no copy |
| `tests/job-screen.test.mjs` | the law-6 sweep, strengthened | forced by the line above, and it is the arm that proves the change is law-6 *safer* |
| `COMPOSED-GAME.md` | 6 sites (F1), 6 sites (F2), 2 sites (F3) | findings 2 and 3 are filed against this file with this lane as owner |

Nothing under `js/grader/*`, `js/gen/*`, `js/widgets/*`, `js/figure/*`, `js/xp.js`, `js/mastery.js`,
`js/schedule.js`, `js/readiness.js` or `js/rarity.js` was touched. `call.js` still imports exactly
`../../data/job.js`, has no decimal literal outside comments and stays DOM-free — the provenance and
discipline arms that assert all three are green.

**One more test outside this lane, and it is the SECOND half of F2.** `tests/job-meta-constants.test.mjs`
held the doc↔code pin on the grid:

```js
const printed = capture(SPEC, /`q̂ ∈ \{([^}]+)\}`/, '…').split(',').map(Number);
const computed = Array.from({length: RATING.qHatWindow + 1}, (_, k) => k / RATING.qHatWindow).filter(isInformative);
assert.deepEqual(printed, computed);
```

— it compared the document's deciles against a **decile generator**, so the two agreed and both were
wrong, under a message that says in its own words why that matters ("publishing the wrong set
publishes the identity over the wrong domain"). The generator is now `call.informativeQHats()`, and
what the document is held to is the grid's **shape** — its size (31, published at G12 #78) and its
maximum (2.4980 at 6/7, published at the Sanity row, G3.7 #8 and G12 #78) — because a 31-member set
is not a thing a spec line should transcribe. It also asserts the reachable grid is still strictly
larger than the deciles, so a regression in `qHatDetail`'s divisor fails here as well as in §1.

## R6.6 Suite

```
$ node --test tests/job-call.test.mjs
  tests 123 · pass 123 · fail 0            (was 119 before this round: §8 and §9 are new,
                                            plus the rewritten Mock arm and the widened §1)
$ node --test tests/job-meta-constants.test.mjs tests/job-call.test.mjs tests/job-screen.test.mjs
  tests 292 · pass 292 · fail 0            (job-screen's Playwright arm included)
$ node --test tests/job-call tests/job-save tests/job-state tests/mock tests/job-week \
              tests/job-index tests/job-meta-constants tests/job-ledger tests/job-copy \
              tests/job-debrief tests/job-exploit
  tests 725 · pass 723 · fail 2
```

**Whole suite** (`node --test tests/`, with the other lanes editing the tree live — 26 concurrent
`node --test` runs on the box while this ran). Two passes, forty minutes apart:

```
mid-round   tests 3059 · pass 3046 · fail  9 · skipped 4
at hand-off tests 3072 · pass 3067 · fail  1 · skipped 4
```

Eight of the nine closed on their own while this lane changed nothing that could reach them. The
one left at hand-off is **not this lane's**: `job-week.test.mjs:1403`, "the board projected 29 %
against a debrief headline of 22 % — more than `SPLIT.agreeWithinPoints = 5`" — `postBoard`'s split
projection against `run.js sessionSplit` off the entry `state.endJob` wrote. No call, entry, weight,
window, rating or rank appears in that arm, and this lane touched none of those four files.

**None of the nine was this lane's**, and each was checked rather than assumed:

| failing test | file | why it is not this lane's |
|---|---|---|
| the board's printed NET posted equals the post-dedupe value | `job-board` | board lane; no call, entry, weight, window or rank in it |
| the number the button prints IS the number the job posts | `job-board` | same |
| the primary is G1's button: the letters it drafts and the posted it pays | `job-board` | same |
| the log entry records the WHOLE queue against the answered targets | `job-board` | same |
| a clock outside the [1/6, 6] clamp is BOUNDED, not deleted | `job-board` | same |
| WALK at the getaway banks LOOSE at FULL value | `job-monotone` | econ/run lane — `econ.settle`, no rating term |
| "Tanking is strictly dominated" is retracted at every site it appears | `job-meta-constants` | fails on **another lane's new G12 entry**, verbatim: "WALK was **strictly dominated, in every state, by a branch that could not lose.**" — a WALK claim, not a tanking one, caught by the lint's `/strictly dominated/`. Evaluated all four sites of that phrase against the lint's own `RETRACTS` window: 662 RETRACTED, 1178 inside G11's withdrawn list (exempt), **1281 — this lane's edited G12 #48 — RETRACTED**, and the WALK line BARE. It has since gone green on its own, without this lane touching it |
| J6 measured: a full job at 375x667 with the keyboard open | `job-screen` | `qa/job-screen.mjs`'s own FAIL block names the cause: two **crew grid** assertions (`supplyGapFor(save, queue)`), present in the pre-edit baseline run of this session. Green again by the final run |
| the projection reads the student's OWN last five jobs | `job-week` | "the board projected 29 % against a debrief headline of 22 %" — the split/board lane |

The four files this lane's change can reach — `job-call`, `job-screen`, `job-meta-constants`,
`job-week` (the Mock half) — are green together.

## R6.7 Requests (files this lane does not own)

1. **`site/js/screens/job.js` — the VAULT line inherits F4's fix and should be read once by its
   owner.** `vaultLineOf` and `envelopeLinesOf` both go through `evidenceWordsOf`, which is why both
   had to move together (a vault line printing `clear rate 84 % or more` one tap before an envelope
   printing `too one-sided to score a call` would compose straight back to the tail, hence to the
   rung — the composition hazard that arm exists to close). The vault sentence now reads
   `FAC2 grade 3 · too one-sided to score a call — loot still pays, the rating does not · crack
   breaks even at 0.43`, which is true of a crack as well as of a call but is not wording this lane
   chose for that surface. A `COPY` entry would let `data/job.js` own both sentences —
   `notes/repair-screen.md` Request 2 already asks for the vault half.
2. **`site/js/screens/mock.js` + `site/data/job.js` — the last unpublished half of F1.**
   `MOCK_CALL_W` and `RATING.mockWeight` are now the same number in two files with no assertion
   binding them at the source (`tests/job-call.test.mjs` asserts they are equal at runtime, which
   is the safety net, not the design). `mock.js` should import the constant from `data/job.js`, or
   `data/job.js` should drop it and `settings.js` should import `MOCK_CALL_W`. Either way it is one
   line in a file the week/mock lane owns, and it is the only remaining route back to the drift.
3. **`designs/SPEC-CORRECTIONS.md`.** Its preamble says "No fixer edited `COMPOSED-GAME.md`". That
   has not been true since round 4 (see R5.4) and is not true of this round: findings 2 and 3 are
   filed **against `COMPOSED-GAME.md` with `call` as the owning lane**, so the corrections are
   applied rather than filed. Fourteen sites, listed in R6.1–R6.3 and in the table in R6.5.

## R6.8 Open issues

1. **The belief/q̂ gap is published, not closed** (F3). It cannot be closed inside the slot: the only
   other thing a slot carries is `ok`, and pricing the rank off an outcome is the S3 lottery the
   ratchet removed, with the measurement. If a later round wants the rank to be proper in belief, the
   thing that has to change is what the slot STORES — a second, student-supplied estimate beside `q̂`
   — and that is a save-schema decision with a G7 byte cost, not a scoring-rule tweak.
2. **`RATING.mockWeight` is now correct and still unread by the code that implements it** (Request 2).
3. **The 6 dp storage bound is asserted, not designed.** `callEntry` rounds `q̂` to 6 dp and `weightOf`
   rounds `w` to 6 dp, so the published `expectedRating(q̂)` and the shipped `ceiling` differ by up to
   `scale·5e-7·c_max` at any q̂ that is not exact at 6 dp — 22 of the 31 reachable informative values.
   It is far below the 0.01 the rating prints at and below every band edge, and the arm now pins both
   the exact identity (against the stored quantities) and the bound (against the published form). If
   a later round widens the stored precision, the bound is the thing to re-derive.

## R6.9 Spec corrections — APPLIED, not filed

Findings 2 and 3 name `COMPOSED-GAME.md` as the file and `call` as the lane, so this lane applied
them. Fourteen sites; grep the OLD text, not the line number (four lanes were editing the file).

**F1 — the Mock's weight (6 sites).** Every one replaced `w = 1.0` with
`w = min(4ŝ(1−ŝ), 0.25)` plus "measured off that history rather than defined", the 2.50 slot
ceiling, and the 0-with-no-prior-paper / 0-outside-the-band cases:
G3.7 proof 4 · G7's `screens/mock.js` file-table row · G8's J11 scope row · the J11 acceptance row ·
G12 #40d (which also gains the two test files that now drive it) · G12 #75.

**F2 — the reachable q̂ grid (6 sites).**

| site | was | now |
|---|---|---|
| G2 THE CAP | "Over the informative grid, which is exactly `q̂ ∈ {0.1 … 0.9}` (asserted as that set)" | the reachable grid `h/of` for `of = min(10, sittings)`, **31** informative members, with the nine-of-31 defect named and the new exports cited |
| G3.1 Sanity, `q̂ = .85` row | "`RATING.qHatWindow` is 10, so every reachable q̂ is `k/10` and this row is a bound" | .85 needs 17 clears in 20 so it is still a bound — but a nearly tight one, since the reachable best is 2.4980 |
| G3.1 Sanity, `q̂ = .90` row | "the best a 10-sitting window can actually express" | **not** the best: 2.4980 (6/7), 2.4630 (5/6), 2.4500 (7/8), 2.3660 (8/9) all beat 2.2680 |
| G3.7 #8 | "every reachable q̂ is `k/10` … 2.268 at 0.9 … throwing one in eight walks a master to the top of that ladder" | peak **2.4980 at 6/7 — one throw in SEVEN**, essentially the continuous 2.4998; the channel is 10.1 % richer than published. **The rank prize is unchanged** — 9.996 at 6/7 and 9.536 at 9/10 are both Called 5 — so "a throw buys a tool already owned" stands |
| G11 withdrawn list | "the reachable 10-sitting grid" | the reachable grid, with 6/7 / 2.4980 named |
| G12 #48 | "on the reachable 10-sitting grid `w·E[c]` is 0/0/1.344/2.240/2.268/0 at q̂ = 0.5 … 1.0" | those are the DECILES, and the deciles are not the grid; reachable peak 2.4980 at 6/7 |
| G12 #78 | "the slot-by-slot propriety identity over the whole informative grid (`q̂ ∈ {0.1 … 0.9}`, asserted as that set)" | the reachable grid, 31 values, best 2.4980 at 6/7, with the nine-of-31 history — **and this is the site `tests/job-meta-constants.test.mjs` now pins the size and the maximum against** |

**F3 — the propriety scope (2 sites).** G3.1's "because `c` is strictly proper, `ceiling` is
maximised slot by slot by the truthful rung, so truth-telling is the best RANK policy as an
identity" now reads "…by the rung that is truthful **about `q̂`**… so reporting your RECORD ON THE
MAKE is the best RANK policy…", followed by a new paragraph with the 70/85/95 table, the two-band
gap, and the reason it is a scope and not a defect. G2 THE CAP's headline carries the same
qualifier and points at G3.1 for the measurement.
