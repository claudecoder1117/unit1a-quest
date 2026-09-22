# board-fix — round 1 fixer, the BOARD lane

Lane files: `site/js/job/board.js`, `site/js/page.js` (the `composeBundles` / `draftUnion` / `jobBudget`
block only — `composePage` is untouched and its fifty digests still pin it), `tests/job-board.test.mjs`.
Authority: `COMPOSED-GAME.md` (amended here where a claim was false), overridden by `BUILD-POLICY.md`.

Nine findings came in. **Eight were real and are fixed at the root. One (#3) was half wrong about its
mechanism and is answered with a measurement plus a better fix than the one suggested.** Every number
below is reproducible from the shipped corpus generator (`tests/job-board.test.mjs seededSave`, tag
`job-board-corpus`); saves 0–49 are the shipped fifty, 50+ are the same generator run wider.

---

## 1 — [BLOCKER] "Any 3-of-5 draft contains every critical due item" was false (doc + test + design)

**True.** `page.js` capped the criticals at `budget.targets` and the test iterated `b.critical` — the
POST-cap list — so it could not have failed however many dues the board dropped. Measured: 2280 of
3996 drafts were missing at least one critical that was on the composed Page.

Fixed three ways:

* **Design.** The pool is now two kinds of lock: a **core** of `targets − draft·u` locks that every
  legal draft carries (criticals first, most overdue first), plus **one choice lock per contract**
  (`u = 1`), so a `d`-draft is `core + d` = the shape's target count exactly. The criticals are
  reported in three disjoint named parts whose union is exactly the criticals on the composed Page:
  `critical[]` (core — in every draft), `criticalOptional[]` (posted as a choice lock), `deferred[]`
  (not posted tonight; still due, and they lead the next board).
* **Doc.** G3.7 proof 7 now states the real guarantee and names the three parts; the G8 J5 acceptance
  row now says the coverage is measured against `composePage`'s own output.
* **Test.** A new test recomputes the criticals from `b.page.queue` (never from `b.critical`),
  asserts the three-part partition is exactly the Page's criticals, asserts 100 % core coverage on
  every legal draft, and asserts that a deferred critical is posted by nobody and still on the Page.

## 2 — [MAJOR] The wing-span test could not see a 4-wing Page collapse to 1 wing

**True**, both halves. The test read `available` off `b.pool` (the board's own selection), and 7 of
the 50 shipped saves spanned fewer wings than their Page carried — save 29 posted a one-wing board
off a four-wing Page, where the guard's published bar reads 1.00.

* `page.js choiceLocks()` now reserves the choice locks **wing-first**: one lock per wing the Page
  carries that the core missed, up to `min(3, wings on the Page)`, taken in the composer's own order.
* The test measures `available` from `b.page.queue` via `WING_OF_SKILL`, and a second test pins save
  29 by name (≥ 3 wings posted, guard support ≥ 3, no bar at 1.00, no one-wing draft).
* Measured after the fix: **0 of 200 boards** span fewer than `min(3, wings on the Page)`.

## 3 — [MAJOR] "The board re-selects what is studied" — HALF WRONG, and fixed anyway

The observable facts were right (33/50 boards posted none of the composer's new/weak work; every
draft identical on 66 % of boards). **The mechanism claim was wrong**: the board was not
re-prioritising the composer's queue. `composePage` emits its dues FIRST, most overdue first, so the
criticals-first pool was the composer's own head-of-queue on **173 of 200 boards**, item for item:

```
$ node scratchpad/p2.mjs        # before the fix
boards where pool === the first |pool| items of the composed Page (composer order): 173  differs: 27
```

What actually caused it was the shape: a mean Page is 19.5 items and a JOB-10 is ten, and the
composer's order puts every due ahead of every new card. So the fix is not to stop re-selecting (the
board was not), it is to make the slice keep the composer's **mix** and to make the draft mean
something. The core+choice design does both, and does it without changing the composer:

| | before | after |
|---|---|---|
| boards where the Page offered new/weak work and the board posted none | 33 / 50 | **0 / 200** |
| `everyDraftIdentical` | 66 % | **3.5 %** |
| drafts that land on the shape's target count exactly | 66 % | **99.5 %** (worst deviation ±1) |
| boards spanning < `min(3, wings on the Page)` | 7 / 50 | **0 / 200** |
| core vs the composer's own head-of-queue | — | identical on 168 / 200 |

14 simulated days, one sitting a day, every target answered clean (`scratchpad/c11.mjs`, the critic's
own script) — the job path now introduces the new work the composer scheduled instead of dropping it,
at the same 140 answered targets:

```
save 4   JOB answered 140 {"review":107,"new":33}     (before: new 8)
save 20  JOB answered 140 {"review":108,"new":32}     (FLAT first-10-of-page: 140 reviews, 0 new)
save 0   JOB answered 101 {"review":69,"new":32}      (before: new 35)
```

Price, stated in G4 and not hidden: about three more dues per night are deferred than when the board
posted ten of them. They are named in `deferred[]`, still due, and they lead the next board (proved
end to end — see #5). **The backlog does not rot**, because the core IS the most-overdue dues, so a
deferred one only rises — 14 days of one job a night (`scratchpad/p5.mjs`, every target clean):

```
save 4   deferred/worst-overdue by day: 6/9  5/8  1/5  2/2  2/2  7/2  7/2  6/3  6/4  7/4  7/4  7/4  7/4  7/4
save 20  deferred/worst-overdue by day: 6/9  7/7  1/4  7/2  7/2  6/3  7/3  7/4  6/4  7/4  7/4  6/4  6/4  5/4
save 2   deferred/worst-overdue by day: 7/9  7/8  4/7  4/4  1/2  0/2  0/1  0/1  0/1  2/1  0/2  0/1  0/1  0/1
```

The worst overdue item goes from 9 days to a flat 2–4 and stays there.

G4 now carries a paragraph, "What the shape does to the Page", with the whole mechanism and both
measurements. G1's DRAFT verb is a real decision on 96.5 % of boards.

## 4 — [MAJOR] The 1→4 ramp broke on drafts the oracle says are arrangeable

**True.** `arrangeJob`'s greedy is myopic: its feasibility filter only asks whether the rest stays
arrangeable under the run cap, never whether taking a higher-tier lock now forfeits monotonicity.

* `page.js` now runs the greedy first and, **only if its order is not monotone**, an exact memoised
  band search (`arrangeBands`) — the same decomposition the suite's `existsMonotone` oracle uses,
  returning the witness. Greedy-first keeps every other draft byte-identical; only the broken case moves.
* The corpus assertion is now over **400 saves × 10 drafts**, not 50 (≈ 0.3 s).

```
$ node scratchpad/c7.mjs        # after
saves 0..399, draft cases 3996
run-cap violations (a run<=2 order EXISTS): 0
ramp violations (a monotone run-safe order EXISTS): 0      (was 1 — save 211, picks ACD)
```

## 5 — [MAJOR] Two Global-rule-5 tests could not fail

**True.** One re-posted the board from the same UNMUTATED save (nothing was answered, so it asserted
only that `composePage` is deterministic — already pinned by the digest test); the other asserted
`b.deferred ⊆ page.queue`, and `deferred` is derived from `page.queue` inside `composeBundles`.

Both replaced:

* **The walk the sentence describes**: answer the drafted union through the study layer's own
  `applyOutcome` + `markItem`, `finishPage`, re-compose the day with `plan.composeOpts`, then assert
  (a) every unposted scheduled item is back, and (b) **every deferred critical sits ahead of every
  non-critical item** on the next Page — position, not presence. (Infinite Variants are excluded and
  why is written in the test: they are generated per page from the seed, not scheduled.)
* **A real save** whose composed Page carries more criticals than the shape can hold, asserting the
  three-part partition, that no deferred id is posted, and that every posted lock is a lock the
  composer put on the Page.

## 6 — [BLOCKER] WALK-scumming re-rolled the whole board for one keystroke

**True.** `endJob` logs every outcome including a zero-target walk, `jobIndexFor` counted log
entries, and the day's seed is `job|profile|day|jobIndex`.

`jobIndexFor` now counts only jobs that **answered a target** (`targets > 0`), for both log entries
and run records. The critic's own script, re-run:

```
$ node /tmp/critic-exploit/01-quitscum.mjs
distinct seeds: 1 of 12        (was 12 of 12)
best x2 count seen: 0  worst: 0
best posted: 198  worst: 198   (was 279 / 177)
guard wings seen: WORDS        (was WORDS RECALL)
```

New test: eight consecutive `startJob` → `walk` cycles, asserting the seed, job index, ×2 marks, the
five contracts' locks and posted values and all ten priced drafts are byte-identical; and that a job
which answers something DOES advance the index. G3.7 proof 6 amended to say what closes which half.

**Residue, reported not hidden (see Requests 2 and 3):** the board's published *guard distribution*
still moves across walks, because `state.endJob` feeds `guard.pushHeat` with `{ press: g.tokens,
posted: g.posted }` on a zero-target walk — `g.posted` is the board's stake, not what was answered.
Not this lane's file.

## 7 — [MAJOR] The projection's ledger branch was shape-blind and poisoned by walks

**True.** With any log at all, `projectFor` threw away the per-draft `gameS` it had just computed and
returned a raw `Σ tGame / Σ (tGame + tAnswer)` over the last five entries — no shape term at all —
while `wallS` (which prints `ends HH:MM`) stayed per-shape. Three walks printed `~100 % game · your
last 3 jobs`.

`projectFor` is now one model: the student's own rolling phase means (G1 statement 1's actual
specification) spent on **this draft's** tiers, decision seconds and brief windows. The log is read
for one thing only — how many REAL jobs are behind them, which is what the line is allowed to claim.

## 8 — [MAJOR] Contract rows print "grade 1" while holding grade-3 locks

**True and NOT FIXABLE IN THIS LANE** — `site/js/screens/job.js:481` hand-builds the row from
`b.grade` (the minimum tier) instead of the `gradeLabel` band `page.js` already computes and
`COPY.contractRow` already takes. The board's own printed row (`board.js` `line`) is correct.
Filed as Request 1, with a new test in this lane asserting a mixed-tier contract publishes
`grade N–M` on the object and in the board's printed row, so the screen has only to render it.

## 9 — [BLOCKER] Board projection vs debrief headline disagreed by up to 12.8 points

**True.** Two separate causes: (a) the shape-blind ledger branch of #7; (b) the board projected the
SESSION basis (debrief read credited) while the debrief HEADLINES the measured basis (it cannot
measure its own screen), so the two were different quantities.

* `projectFor` now projects the headline's own quantity — the debrief read is in neither term of the
  split — and still spends it in `wallS`, so `ends HH:MM` is unchanged. One model, two questions.
* `tests/job-split.test.mjs` §3.3 rewritten: the history is the ledger `endJob` itself wrote, and a
  second test crosses shapes (the student has played every OTHER shape). §3.4's `<= 7` carve-out is
  gone; the job-1 full-use bound is now published in G1 and asserted against the headline.

Measured after the fix (`J8_PRINT=1 node --test tests/job-split.test.mjs`):

| case | worst gap |
|---|---|
| ledger, same shape, both paths | 3.4 pts (VAULT/full) |
| ledger, a shape the ledger has NEVER seen, both paths | 3.2 pts (RUN/full) |
| job 1, default path | 1.1 pts (was 3.8 on the session basis) |
| job 1, full-use path | 6.9 pts — published in G1 statement 2, asserted at ≤ 7 |

---

## What changed, file by file

* **`site/js/page.js`** — `composeBundles` steps 2–6 rewritten (core + choice locks, the wing floor,
  the three-part critical partition); new `choiceLocks()`, `JOB_CHOICE_LOCKS`, `JOB_WINGS_MIN`;
  `arrangeJob` split into `arrangeGreedy` + the exact `arrangeBands` second pass. `ordinaryRep` is
  gone from the return (replaced by `choicePer`); `core`, `choice` and `criticalOptional` are new.
  **`composePage` is untouched** — the fifty digests in `tests/job-board.test.mjs` still pass.
* **`site/js/job/board.js`** — `jobIndexFor` counts only answered jobs; `projectFor` rewritten
  (one model, headline basis, walks excluded from "your last N jobs"); the board object gains
  `core`, `choice`, `criticalOptional`, `deferredLine`, `choicePer`.
* **`tests/job-board.test.mjs`** — the corpus is extended to 400 saves for the two order laws; seven
  tests added or replaced (see above). 82 tests, all green.
* **`COMPOSED-GAME.md`** — G1 statement 2, G3.7 proofs 6 and 7, G4 (new paragraph), the G8 J5 and J8
  acceptance rows.
* **`tests/job-split.test.mjs`** (not this lane's file — finding 9 lands in `board.js` and its
  assertions had to move with it) — §3.3 rewritten into two tests, §3.4 replaced, the `<= 7` carve-out
  replaced by a published, documented bound.
* **`tests/job-state.test.mjs`** (not this lane's file — broke because of this lane's change) — the
  "every queue item ends done" test compared the served order against a PREFIX of the drafted queue.
  That held only while a JOB-10 was ten reviews: `page.requeueReview` inserts a missed review's copy
  after the last review in the queue, which is the middle of a job that also carries new work. Now
  asserts the real invariant (subsequence + every extra beat is a re-queue).
* **`qa/job-walk.mjs`** (dev-only harness, one line) — the printed-probability check looked for
  `.job-ev, .job-evidence`, neither of which exists; it fell through to the whole envelope's
  `textContent`, where `9/9` runs into the next element's numerals and the regex read `9/9150270385`.
  Now looks for `.job-env-evidence`, the class `screens/job.js:656` actually renders.

## Requests (files this lane does not own)

1. **`site/js/screens/job.js:481`** — render the band: `${b.gradeLabel ?? \`grade ${b.grade ?? 1}\`}`
   instead of `grade ${b.grade ?? 1}` (or call `COPY.contractRow`, which exists for this row). Every
   row on a real board reads "grade 1" today while three of five hold grade-3 locks — 3 answer-minutes
   against 0.5 — so the one column that makes the draft a real choice is both constant and wrong.
2. **`site/js/job/state.js` (`endJob`)** — a zero-target outcome must weigh 0 in the press window:
   `guard.pushHeat(gm.heat, { press: g.tokens, posted: postedRecorded })` is fed the board's stake, so
   eight walks moved the guard's published distribution from `{.25,.25,.25,.25}` to `{0,0,0,1}` for
   free. Evidence: `scratchpad/w1.mjs`. (The log entry's own `posted` has the same problem.) Same
   line, second half: `endJob` also folds a walk's phase durations into `ledger.phaseMeans`, so a
   student who walks repeatedly drives their own board-read mean towards 4 s and the printed
   projection with it. Harmless to every payoff — it moves no money and no rating — but it is a
   measurement, and a walk is not one. A zero-target outcome should update neither.
3. **`site/js/job/guard.js`** — `guardDist` printed `{"RECALL":0,"FIGURES":0,"WORDS":0,"ALGEBRA":1}`
   with `eps 0.2` and `n 4` on a four-wing support. G3.4 says "the ε floor guarantees no cluster
   becomes dead weight; the 0.75 cap guarantees the guard is never a certainty". Neither held there.
4. **`site/js/screens/home.js:247-261`** — `boardModel` still computes the split as a raw
   `Σ tGame / Σ (tGame + tAnswer)` over the last five log entries, walks included, while printing a
   per-shape `wallS` beside it. Same two defects as findings 7 and 9, in the Home copy. It should call
   the board's own projection, or repeat the fixed form.
5. **`tests/job-exploit.test.mjs:749`** — the suite name "every legal draft of every posted board
   contains 100 % of the critical dues" now overclaims; it measures `b.critical`, which is the core.
   Rename to the core, or assert the three-part partition as `tests/job-board.test.mjs` does.
6. **`site/js/screens/job.js`** — the board object now carries `deferredLine` ("N due reviews are not
   posted tonight · they lead the next board"). Nothing renders it. A student who is told what the
   board did not post can decide to run a second job; today that fact is invisible.

---

# board-fix — ROUND 2, the BOARD lane

Lane files: `site/js/job/board.js`, `site/js/page.js`, `tests/job-board.test.mjs`. Two files outside
the lane were touched and both are named below with the reason. Authority: `COMPOSED-GAME.md`
(amended here where a claim was false), overridden by `BUILD-POLICY.md`.

Five findings came in. **Four were real and are fixed at the root. One (#5) is real and is NOT
fixed, because its only root is a line in a file another lane is editing right now** — it is
re-filed under Requests with the exact diff and a reproduction.

Suite: `node --test tests/` → **2630 pass / 0 fail**.

---

## r2 §1 — [MAJOR] G4's "the brief windows land where the composer's role transitions land" — TRUE, and now measured

The critic is right and the mechanism they name is the right one: `draftUnion` re-sorts the drafted
union by **tier** (`arrangeJob`), so the composer's role blocks are deliberately scrambled and do
not reach the job. Reproduced on this lane's own corpus generator, 400 boards × every legal draft of
≥ 9 targets (`scratchpad/roles.mjs`):

```
drafts 3556
role transition at BOTH 3->4 and 7->8: 270 (7.6%)
at 3->4 only: 361   at 7->8 only: 1392   NEITHER: 1533 (43.1%)
drafts where role blocks are review→new→weak in order: 640 (18.0%)
drafts where a review/rematch comes AFTER a new card: 2791 (78.5%)
mean index of LAST review 7.03   mean index of FIRST new 4.23
lastReview index histogram {"0":64,"1":40,"2":103,"3":66,"4":115,"5":124,"6":166,"7":1194,"8":760,"9":784}
```

So: a transition at the 3→4 boundary in 17.7 % of drafts, at 7→8 in 46.7 %, at both in 7.6 %, at
neither in 43.1 %.

* **Doc.** G4's "Flow shape inside a job" keeps its first sentence (the ramp IS preserved and IS the
  tension curve) and replaces the second with the correction, the mechanism and all of the numbers
  above. The windows are at 4 and 8 for pacing; that is now the whole claim.
* **Test.** `tests/job-board.test.mjs` §6c measures the same four quantities over the same 400
  boards and fails if the coincidence is quietly re-asserted (or if it silently becomes true), plus
  a second test for what IS true — fixed window indices, and every draft getting harder as it goes.

## r2 §2 — [BLOCKER] The board on Home is not the board you get when you tap it

**True, and worse than cosmetic.** `screens/home.js:417` posted with `{...plan.composeOpts(save),
page: act.page}`, `screens/job.js:243` with `{now, seed, tellFor}`: the same save, the same day, the
same pinned seed `job|…|0`, two different queues — because `postBoard` composed with whatever
options and whatever pre-composed page its caller happened to hold. The job screen's queue was also
the UNLOWERED one (the S1 `tier4 = 2`, no `microFlashOnly`) under a Home printing "13 new a day is
more than a day holds — the target is 12".

Root fix, in this lane: **`postBoard` takes no composition options from anybody.** It calls
`plan.composeOpts(save)` itself (`composeInputsFor`), forwards only `now / today / shape / seed /
jobIndex / tellFor`, and **ignores `opts.page`** — the key Home passes. A fixtures-only seam
`opts.pageOverride` replaces it for the three synthetic-queue tests that need one (thin board, dry
board, mixed-grade band). Both screens now get the same board whatever they pass, and both get the
one the plan strip is describing.

20 of the 50 corpus saves have the plan lowering, so this moved real boards, not a theoretical case.

* **Test.** `tests/job-board.test.mjs` §6b replays Home's exact call (plan opts minus `q`, a
  pre-composed page, a tell hook) and the job screen's exact call on all fifty saves and asserts
  `id:label:wing:locks:posted:gradeLabel` is byte-identical on every row, plus the same seed,
  recommendation, posted and split; and a second test that the board composed the PLAN's page.

## r2 §3 — [MAJOR] The draft and the press are both no-ops on a recall-heavy board

**The complaint is right; half the suggested mechanism was not.** The critic's board DID span three
wings (its own `guard: 3 wings on the board` says so — round 1's `choiceLocks` wing floor was
working). What collapsed was the part a student can see: all five contracts printed the same NAME
and the same wing, because with a shared core every bundle's strict top-count make is the same make
on a save whose due list is one sheet. Five rows that read as one row, in front of a DRAFT this
document counts among the 24 mandatory decisions.

Both halves are fixed, at the root:

* **`page.js assignLabels` (new).** The five names are now chosen together — a maximum bipartite
  matching (Kuhn) over (contract → the makes it actually holds), each contract preferring its
  most-supplied make, contracts in board order — so the board carries as many distinct names as the
  posted locks can support. A greedy first-come pass cannot promise that: corpus save 5 posts six
  makes across five contracts and greedily named only four of them (`VOC ASN-ANG ASN-PLP CS-LIN
  VOC`). `overflow` now counts from the make the contract is NAMED after, so `B · VOC +5` reads "the
  VOC one, plus five other locks" — the same reading G1's own `A · VOC +2` has. A contract the
  matching cannot name uniquely keeps its own top make, which is the pre-round-1 rule.
* **`board.js` — the press is dropped when it cannot matter.** On a board whose whole support is
  certain to be guarded, `pressAdvice`'s own `marginal = GUARD.tokenBonus · v · (1 − y)` is 0
  everywhere, and yet G3.4 requires it to spend all three tokens somewhere — so it spent them on the
  wing guaranteed to be guarded. The board now carries `pressMatters`, recommends **zero** tokens
  (the correct play), and prints `one wing tonight · RECALL · no press · the 3 tokens cannot change
  a payoff`. `wingsShort` says the board is under `GUARD.postedSpanWings`; `oneMake` / `oneMakeLine`
  say `one make tonight · ASN-ANG · every contract is a slice of the same block`. `guardSupport` no
  longer prints "1 wings".
* **Doc.** G1's contract paragraph and G4's supply response 1 carry both rules and the evidence.
* **Tests.** distinct names = the matching's maximum on all 400 corpus boards; the one-sheet fixture
  (one make, one wing, zero tokens, both lines); and that the press is still a real three-token
  allocation on > 80 % of multi-wing corpus boards.

## r2 §4 — [BLOCKER] `~N % game · your last N jobs` was 86 % brochure

**True, and the most important of the five.** Both per-target terms were shipped constants at both
ends — `projectFor` summed `ANSWER_MINUTES_PER_TIER` and `DECISION_SECONDS`, and so did every
walkthrough's fake clock — so the published criterion was arithmetic on one table, not a measurement
of a student. `tests/job-split.test.mjs` said so itself, in a describe that asserted `gap > 5` and
carried an instruction: *"When the projection starts folding the student's own per-target seconds …
this test goes red with this message. At that point delete it and assert agreement instead."* That
is what happened.

Two changes in `board.js`, both reading only what `save.game.log` and `game.ledger` already hold:

1. **`personalRates(save, base, tonight)`** — the two per-target terms are the tables **scaled by
   the student's own measured rate against them**. Per logged real job: `tAnswer` ÷ what tonight's
   own draft costs at that job's share, and `tGame − fixed` ÷ the same for the decision table.
   Three things took several passes to get right and each is worth recording:
   * the **share** is by POSTED value, not target count. The log keeps no tier mix; `LOOT` is very
     nearly proportional to `ANSWER_MINUTES_PER_TIER` (6/30, 18/90, 38/180, 70/300 = .200 .200 .211
     .233), so posted is the best available stand-in. A per-target share rates a JOB history against
     a RUN's six cheapest locks and was 7 points off on `RUN/full`.
   * on the log's own **basis**: `endJob` records `g.posted`, which is post-×2. Rating a post-×2
     history against a pre-×2 `postedNet` is a standing −14 % (`X2.p`). Tonight's figure is
     `postedNet × (1 + X2.p)` — the expectation, not tonight's realised marks, because the log
     cannot say how the history's marks fell and a lucky board is not a fast student.
   * **pooled** `Σ measured / Σ expected`, not a mean of per-job ratios: the mean of ratios reads a
     6-target job as equal evidence to a 12-target one, and Jensen pulls it off the truth (it said
     0.88 where the pooled ratio says 1.00 for a student who IS the tables). A job whose own ratio
     is outside `[1/6, 6]` is a phone left on the answer screen and is dropped from both sums.
2. **`meansForShape(base, log, shapeId)`** — the rolling phase means are re-expressed in tonight's
   shape's own published `FIXED_PHASES` column. A RUN's board read is published at 12 s against a
   JOB's 18, its getaway at 20 against 25, its debrief at 40 against 65; spending a JOB-shaped blend
   on a RUN night was worth 3.4 points **before round 2 touched anything**, and worth 7 once the
   decision term (which is `tGame` minus those very means) started being rated against them.

Measured, over the real machine and the real screen call sequence:

```
                        board  debrief   gap        board  debrief   gap
SAME-shape history      RUN/default 30 / 30.9 0.9    RUN/full 32 / 33.8 1.8
                        JOB/default 31 / 32.2 1.2    JOB/full 38 / 38.9 0.9
                        JOB12/def   30 / 31.0 1.0    JOB12/full 36 / 36.8 0.8
                        VAULT/def   31 / 32.1 1.1    VAULT/full 37 / 38.4 1.4
ledger of every OTHER   RUN/default 32 / 30.9 1.1    RUN/full 38 / 33.8 4.2
shape (cross-shape)     JOB/default 32 / 32.2 0.2    JOB/full 38 / 38.9 0.9
                        JOB12/def   30 / 31.0 1.0    JOB12/full 36 / 36.8 0.8
                        VAULT/def   32 / 32.1 0.1    VAULT/full 38 / 38.4 0.4
```

and against the critic's own two clocks — a slow answerer (17.5–18.6 points off before) and a
deliberator (33.8–35.4 off, the other way) — every shape now agrees within the published 5, while
the BOARD still separates the two students by more than 30 points, which is the part that proves
the agreement is not a constant.

* **Doc.** G1 statement 2 carries the correction, both mechanisms and both measurement tables. The
  "within 5 points" sentence now also claims "on a clock that is nobody's published table, in both
  directions of error", which is what is asserted.
* **Tests.** `tests/job-split.test.mjs`'s last describe is rewritten from `assert.ok(gap > 5)` to
  the agreement it was holding the place for, over two opposite clocks × four shapes, plus a test
  that the two students are genuinely far apart. `tests/job-board.test.mjs` gains "two students with
  the same board and different histories get different splits" (13 % vs 38 % on one save).
* The board now exposes `projectionRates` so a test can pin the model's shape without re-deriving
  the estimator.

## r2 §5 — [MAJOR] Every contract row prints "grade 1" — REAL, NOT FIXED, NOT THIS LANE'S LINE

Confirmed, reproduced (`scratchpad/grade.mjs`, a 60-card save, today's code):

```
A label=ASN-ANG grade=1 gradeHi=2 gradeLabel="grade 1–2"   SCREEN PRINTS: "3 locks · grade 1 · RECALL · ~3 min"
B label=NOTE    grade=1 gradeHi=2 gradeLabel="grade 1–2"   SCREEN PRINTS: "3 locks · grade 1 · RECALL · ~4 min"
E label=VOC     grade=1 gradeHi=2 gradeLabel="grade 1–2"   SCREEN PRINTS: "4 locks · grade 1 · RECALL · ~4 min"
```

The board's own data is correct and has been since round 1: every row carries `gradeLabel` and the
printed `line` already reads `· grade 1–2 ·`. The only defect is one template literal in
`site/js/screens/job.js` (now line 577), which is a file this lane does not own and which another
agent is editing in this same round — `BUILD-POLICY.md` §2 and the round's own ticket both forbid
touching it. Re-filed under Requests with the exact one-line diff. It is the same request round 1
filed as item 1; it is still open.

---

## Files changed

* **`site/js/job/board.js`** — `composeInputsFor` + `postBoard` composition canonicalised;
  `pressMatters` / `pressLine` / `wingsPosted` / `wingsShort` / `oneMake` / `oneMakeLine`;
  `guardSupport` singular; `projectFor` rewritten around `personalRates` + `meansForShape`;
  `projectionRates` exposed.
* **`site/js/page.js`** — `rankedMakes` + `assignLabels` (the matching); `finishBundle` takes its
  assigned name and counts `overflow` from it.
* **`tests/job-board.test.mjs`** — §6b (one board) and §6c (the flow shape) added; label test
  rewritten to the new rule plus a distinctness test and the one-sheet fixture; press tests; the
  ledger-split test now pins the model through `projectionRates`; `page:` → `pageOverride:` at the
  three fixture call sites; the walk-scumming loop passes `force: true` (see below).
* **`COMPOSED-GAME.md`** — G1 contract naming, G1 statement 2 (the split), G4 "one board, composed
  once", G4 "Flow shape inside a job", G4 supply response 1.
* **`tests/job-split.test.mjs`** (not this lane's file — the finding lands in `board.js` and that
  file's own last describe asserts the opposite, with a written instruction to replace it when the
  fix lands; leaving it would have left the suite red). Last describe rewritten into the agreement
  criterion over two opposite clocks.

## Things that broke and were NOT this lane's doing

* `tests/job-board.test.mjs` "WALK-SCUMMING IS DEAD" started throwing `page-in-progress: 10 left on
  Today's Page` from `state.js startJob` — a guard another lane added this round (its own comment
  says "round 2, ledger-invariance"). Verified not mine: `plan.composeOpts(CORPUS[6])` is
  `{q:12, tier4:2, microFlashOnly:false}`, i.e. identical to the composer's own defaults, so this
  lane's change does not move that save's board at all. The loop now passes `force: true` — that
  lane's own documented override — because what the test is about is that the BOARD does not
  re-roll across walks, not whether a live page may be overwritten.

## Requests (files this lane does not own)

1. **`site/js/screens/job.js:577`** — STILL OPEN from round 1, now with a second round of evidence.
   Render the band: `${b.gradeLabel ?? \`grade ${b.grade ?? 1}\`}` instead of `grade ${b.grade ?? 1}`
   (or call `COPY.contractRow`, which exists for exactly this row). Every row reads "grade 1" while
   holding grade-2/3/4 locks — 3 answer-minutes against 0.5 — so the one column that prices the
   draft is constant and wrong. Please also add the assertion the critic asked for: at least two rows
   of a mixed-tier board print different grade strings.
2. **`site/js/screens/home.js:417`** — `fillBoard` may stop passing `compose` and `page` to
   `postBoard`; both are now ignored (see r2 §2). Harmless as-is, but the parameters are dead and
   reading them suggests a knob that no longer exists.
3. **`site/js/screens/job.js`** — the board now carries `pressLine`, `oneMakeLine` and (from round 1)
   `deferredLine`. Nothing renders them. The one-wing case is the case where a student is otherwise
   asked for a 3-token allocation that cannot change a payoff.

---

# board-fix — ROUND 3, the BOARD lane

Lane files: `site/js/job/board.js`, `site/js/page.js`, `tests/job-board.test.mjs`, plus
`COMPOSED-GAME.md` where a claim in it was false. **No file outside the lane was written** — three of
the five findings land in files another agent is editing this round (`site/js/screens/job.js`,
`site/data/job.js`, `site/js/job/state.js`), and each is either fixed inside this lane at its own
root or filed under Requests with the exact diff and a reproduction.

Five findings came in. **All five are real. Four are fixed at the root in this lane. One (#3) is a
screen-layout defect this lane cannot reach and must not touch** — with the proof of why below.

Every number here reproduces from `scratchpad/board3/` (the test's own corpus generator, tag
`job-board-corpus`, saves 0…399) against the read-only pre-ticket export at `/tmp/critic_head`.

---

## r3 §1 — [BLOCKER] the 50-digest "permanent pin" could not see the change this build made — TRUE

Reproduced exactly, both ways:

```
$ node scratchpad/board3/digest.mjs /tmp/critic_head 400 > dig_head.json     # git archive HEAD
$ node scratchpad/board3/digest.mjs . 400                > dig_cur.json
head vs current      mismatches: [102]
$ node scratchpad/board3/digest.mjs . 400 --no-j5b       > dig_noj5b.json
head vs no-J5b(live) mismatches: []
```

So the critic is right about the defect and right about the cause — J5b's `data/templates.js` entry
for `T-asn-reason` reaches `composePage` through `templateForSkill` → `templatesForSkill` — and there
is a third, better answer than either of the two offered, because the second run above proves
something stronger than "widen the pin and strike the claim":

* **The pin is now 400 digests** (`DIGESTS`, saves 0…399, the file's own `wideSave`). The first fifty
  are byte-for-byte the fifty that were there, and the test asserts that too.
* **The pre-ticket claim is kept and made testable instead of struck.** `data/templates.js` exports
  the registry object and `allTemplates()` reads it live (no cache), so a test can take J5b's one
  entry out and compose against the *pre-ticket registry*. With it out, all 400 saves reproduce
  `git archive HEAD` exactly; `J5B_DIVERGENCE = {102: 7205490269157262}` carries the one save that
  differs and the digest it had before the ticket. That is the honest form of "the study layer is
  untouched": the FUNCTION is byte-identical, and the composed PAGE differs exactly where J5b's own
  new template is drawn — one save in four hundred, named.
* A third test proves the listed divergence is J5b's and not a licence: save 102's Page must actually
  contain a `T-asn-reason` item, and at most 5 of 400 saves may be listed at all.
* **Doc.** G8's J5 row and the `page.js` J5 banner (the old "stays byte-identical for the same seed")
  now say this in the same words. Option (b) — gating the template behind `settings.game` — was not
  taken: it would make the RECALL wing's supply fix (G4 response 2) conditional on the game layer
  being on, which is a product change, in a file this lane does not own.

## r3 §2 — [MAJOR] `LIMITS.sameSkillRun` broken on a real RUN board — TRUE, and fixed in the composition

Reproduced over every shape, not just RUN (`scratchpad/board3/runcap.mjs`, 4 shapes × 400 saves ×
every legal draft):

```
before   shapes=RUN,JOB,JOB12,VAULT  draft cases=15984
         run-cap breaks: 1   ramp breaks: 0   drafts whose multiset admits NO run<=2 order: 1
         {"shape":"RUN","save":69,"picks":"ADE","run":3,"feasible":false,
          "skills":"VOC VOC PAIRS VOC VOC VOC","dropped":1}
after    run-cap breaks: 0   ramp breaks: 0   drafts whose multiset admits NO run<=2 order: 0
```

The critic's diagnosis is exactly right — the arranger is blameless, 5 VOC + 1 PAIRS admits no order
under the cap, and `dropped = 1` shows `draftUnion` correctly refusing `spreadSkills`' drop (Global
rule 5). The one thing worth adding is that **the page had plenty of other makes**: save 69's own
composed queue is `VOC VOC ASN-ANG VOC VOC ASN-ANG ASN-PLP ASN-ANG ASN-ANG PAIRS SEG-ALG NOTE VOC
FAC2 …`. So this is not a shape that cannot be served; it is a board that posted badly, and it can be
fixed at the root rather than qualified away.

* **`page.js runCapFor(targets, k)`** — the arrangement's own existence condition as a count:
  `m ≤ k·(targets − m + 1)`, i.e. at most 4 of a RUN-6, 5 of a VAULT-7, 7 of a JOB-10, 8 of a JOB12.
* **`choiceLocks` enforces it when the board picks what to post.** One choice lock goes to each
  contract, so a `d`-draft can take ANY `d` of them: a make with `c` in the core and `j` among the
  choice locks reaches `c + min(j, d)` in the worst draft, and that is what must stay inside the cap.
  Candidates that would break it are skipped in all three preference passes and taken only in a
  last-resort fill, so `core + d·choicePer = targets` still holds exactly on a Page with nothing else
  to give (the flat Page keeps the cap by DROPPING; a job may not drop, so a job must not compose the
  overflow in the first place).
* **Blast radius, measured board by board** (`scratchpad/board3/boardsnap.mjs`, 4 shapes × 400 saves
  = 1600 boards): **1 board changed**, RUN/69, contract E's choice lock `voc-02` → `not-04`. The
  fifty-save digest pin on `composePage` is untouched by it (composition ≠ composing).
* **Tests.** The 400-save order-law loop now runs `for (const shape of Object.keys(SHAPES))` — the
  hole the critic found, confirmed here: with no shape argument `shapeFor` served only JOB and VAULT,
  so two of four shapes, RUN among them, were never exercised by the assertion that guards them. It
  now asserts three things on all 15 984 drafts: the run cap, the ramp wherever an order exists, and
  — new — that **no drafted queue is a multiset no arranger could have ordered** (`top ≤
  runCapFor(len)`), plus a shape-coverage assertion so the hole cannot reopen silently. A second test
  drives save 69 through the school window's exact public call
  (`{shape:'RUN', shapeOpts:{shape:'RUN'}}`).
* **Doc.** G1's "Draft, then interleave" no longer says the laws hold "exactly as they hold on the
  flat Page" (they hold by a different mechanism, and the run cap holds absolutely while the ramp
  yields); G8's J5 row carries the width and the new invariant.

## r3 §3 — [MAJOR] DRAFT shows 2 of its 5 contracts on a phone — REAL, NOT THIS LANE'S FILE

Confirmed as out of reach, not dismissed. The finding is in `site/js/screens/job.js` and its CSS;
this lane owns `board.js` and `page.js`, and `BUILD-POLICY.md` §2 plus this round's own ticket forbid
writing another agent's file. It is not a case where the board could quietly help either:

* `postBoard` is DOM-free and viewport-blind **by design** (G3.7 proof 5, and the file's own header).
  Posting fewer contracts on a narrow screen would make the draft — and therefore the payoff — a
  function of screen width, and would take `postedCountFor(queue)` → `BOARD.draftFor` with it: 5
  contracts draft 3, 3 contracts draft 2, so a phone would play a different game from a laptop on the
  same save. G1 counts DRAFT among the 24 mandatory decisions precisely as a 3-of-5.
* The board already carries everything the affordance needs (`contracts`, `draft`, `posted`,
  `thinLine`). What is missing is a peek row / `2 more ↓` / horizontal strip — markup and CSS.

Filed under Requests 1 with the shape of the fix. (Note for whoever takes it: `tests/job-screen.test.mjs`
was already failing this round on the same sheet — `worst OPEN board height … 253.45px` and "the first
call rung is outside a 375x667 viewport at rest" — so the nested scroller is live in that lane's own
suite, which is the right place for it to be fixed and measured.)

## r3 §4 — [MAJOR] the job never tells you what it pays — TRUE, fixed on the board's own string

`grep -rn "postedNet\|postedFlat" site/js/screens/` still returns nothing, and it does not need to:
**both screens render `board.primary`** (`screens/job.js:645` the button, `screens/home.js
primaryLineFor` the CTA, which returns `board.primary` when there is a board). So the fix is one
string, in this lane's file, and it reaches both surfaces without touching either:

```
before  JOB · 10 targets · ~23 min · ends 19:52 · 26 % game
after   JOB · B C E · 10 targets · posted 516 (−218 shared) · ~23 min · ends 19:52 · 26 % game
```

which is G1's published button (`TAKE THE POSTED JOB · A D E · 10 targets · posted 100 (−5 shared) ·
…`). Re-measured with the critic's own probe, `scratchpad/pf3/probe11.mjs`:

```
primary button : JOB · B C E · 10 targets · posted 516 (−218 shared) · ~23 min · ends 19:52 · 26 % game
(the word "posted" appears on the CTA: true )      <- was false
drafted contracts: B=164 + C=198 + E=154 = 516
```

* `draftFrom().line` is now the only composer of that segment and its flat branch calls
  `COPY.postedFlat` instead of a local literal — which is how that COPY entry came to have zero call
  sites while this file printed its text anyway. `board.postedLine` exposes it on its own for a
  screen that wants the payout without the button.
* **The drift guard.** `COPY.primary` is the same sentence minus the two new segments, and
  `screens/home.js` still falls back to it, so the test asserts `primary` IS `COPY.primary` plus the
  letters and the payout on all fifty corpus boards. If `data/job.js`'s owner moves that template,
  this lane goes red instead of silently diverging.
* `% game` was kept: G1's own worked button prints it, and the minor asking for its removal was not
  this lane's finding.
* Measured while doing it: **every full board's recommendation shares a core lock** (0 of 3996 corpus
  drafts have `shared = 0`), so the flat `posted N` form belongs to the thin one-contract board; both
  branches now have a test.

## r3 §5 — [BLOCKER] a mid-job WALK writes the whole queue's `posted` — TRUE, fixed in the estimator

Reproduced on this lane's own corpus, through the real machine (`scratchpad/board3/walkgap.mjs`):

```
LOG ENTRY {"day":"2026-09-16","shape":"JOB","targets":3,…,"posted":200,"tGame":55000,"tAnswer":90000}
   -> targets = 3 of 10, posted = 200 = the WHOLE drafted queue

mid-job walks in the last 5 jobs    0      2      3      5      (table-pace student, honest 27.1 %)
board printed, before              27     31     37     69
board printed, after               27     27     27     25

16 cells (4 saves × 4 shapes, 3 walks each, a clock that is nobody's table):
   before  over 5 points: 12 of 16   worst 14.2
   after   over 5 points:  0 of 16   worst  1.7
```

The root the critic names is in `state.js` (`entry.posted = g.posted`, the drafted queue's value,
never reduced on a walk) — **another lane's file this round**. But the root inside this lane is real
and is the one that matters for the published criterion: `personalRates` rates MEASURED seconds
against an EXPECTED cost, and the expectation has to be of the targets that were actually answered.

* **`prefixFractionsOf(entry, ramp)`** — how much of that job the student answered, as a fraction,
  and **one fraction per term, because the two terms are in different units**. A job is served on the
  1→4 ramp, so a walker answered the CHEAPEST targets: 6 of a JOB12's 12 is half the targets, ~24 %
  of its answer seconds and ~37 % of its decision seconds. A single flat `answered / targets` is
  wrong in both directions at once (it left a 7.2-point gap on `JOB12`, in the other direction — the
  board then under-printed). The fractions are taken against **tonight's own drafted ramp** —
  cumulative `ramp.answer[k]` / `ramp.decision[k]`, built in `projectFor` where the queue already is
  — because that is a real board's real tier mix, where the shape's published `tierMix` is a nominal
  row nothing composes exactly. The shape's row is the fallback when there is no draft yet.
* **`reachedGetaway(entry)`** — `fixedS` subtracts `m.getaway` only from a job that reached it. The
  critic is right that a partial job's decision rate was depressed by seconds that were never spent.
* **Both are exactly 1 (and the getaway is subtracted) for a completed job**, so nothing on the
  finished path moves: `tests/job-split.test.mjs` (the round-2 criterion, both clocks × four shapes)
  and the rest of the suite are untouched by this.
* **Forward-compatible with the state lane's fix, deliberately.** If `endJob` ever records the
  answered value, `board.js` prefers `entry.postedAnswered` and skips the estimate entirely; if it
  records the drafted length, `queuedTargetsOf` prefers `entry.queueTargets` over the shape's row.
  Nothing writes either today, and a test asserts they are still absent — so the day `state.js`
  starts writing one, this lane goes red and gets read instead of double-counting. **Request 3 says
  exactly this: do not silently change the meaning of `entry.posted`; add a field.**
* **Tests** (`tests/job-board.test.mjs`, new describe "a mid-job WALK is measured on what it
  answered"): the criterion itself, driven `startJob → lockCall → applyTarget → push → walk` on a
  clock that is nobody's table, every shape × {0, 3, 5} walks of the last five, asserted at
  `SPLIT.agreeWithinPoints`; the entry-shape pin above; and a CONTROL that reproduces the defect from
  the same save by setting `postedAnswered = posted` (i.e. "the whole queue was answered"), which
  makes the rate read less than half the student's own pace and takes the split back outside the
  published 5 points. The cell the critic asked for in `tests/job-split.test.mjs` is here instead,
  because that file is not this lane's and the finding's root is `board.js`.

---

## Files changed

* **`site/js/job/board.js`** — `draftFrom` flat branch → `COPY.postedFlat`; `primary` rebuilt as
  G1's button (letters + payout) and `postedLine` exposed; `queuedTargetsOf` / `reachedGetaway` /
  `prefixFractionsOf` / `rampFractionOf` added; `projectFor` builds the cumulative `ramp` and passes
  it; `personalRates` rates each past job on its answered prefix and subtracts the getaway only where
  it happened.
* **`site/js/page.js`** — `runCapFor` (exported); `choiceLocks` takes the shape's `draft`/`targets`
  and keeps every legal draft inside the cap, with a last-resort fill that preserves the exact target
  count; the J5 banner's "byte-identical" claim rewritten to what is true and tested.
* **`tests/job-board.test.mjs`** — §1 rewritten (400 digests, the pre-ticket registry test, the
  divergence test); the wide order-law test now loops every shape and asserts composition feasibility
  and shape coverage; the save-69 RUN test; the primary-button tests (G1 form + `COPY.primary` drift
  guard + the thin board's flat form); the mid-job WALK describe.
* **`COMPOSED-GAME.md`** — G8's J5 row (the pin, the width, the run-cap invariant, the button); G1's
  "Draft, then interleave"; G1 statement 2 (the round-3 walk correction and the criterion sentence).

## Requests (files this lane does not own)

1. **`site/js/screens/job.js` + `site/css/job.css`** — r3 §3. Five contract rows, 521 px of them, in
   a 253 px nested scroller with no scrollbar on touch: at 375×667 two rows are fully visible and the
   teach line above says "take 3 of these". Make the off-screen rows countable — a peek row, a
   `2 more ↓` affordance, or a horizontal card strip — or give the sheet the height for five rows at
   375 px. The board object already carries `contracts`, `draft` and `posted`; this is markup and CSS
   only, and capping the posted count is NOT an option (it would make the payoff a function of screen
   width — see r3 §3). Same sheet as that file's own failing layout test this round.
2. **`site/data/job.js`** — `COPY.primary` should take all seven segments (`shape, picks, targets,
   posted, minutes, ends, split`) so the button's form lives in the copy file rather than being
   composed in `board.js` from `COPY.postedNet`/`postedFlat` plus a join. Until then
   `tests/job-board.test.mjs` pins the two together. While you are there: G1 prints the same button
   twice with different arithmetic — `posted 105 (−5 shared)` (gross first) and `posted 100 (−5
   shared)` for a union described as "posted 100" — and the shipped template is the gross form.
3. **`site/js/job/state.js:1723`** — r3 §5. `entry.posted` is the DRAFTED queue's value while
   `entry.targets` is the answered count, so the two fields describe different jobs whenever the
   student walks out mid-job. `board.js` now estimates the answered part from the ramp, and prefers
   two fields if they ever appear: **`postedAnswered`** (the answered targets' posted value — the
   exact quantity) and **`queueTargets`** (the drafted queue's length). Please add a field rather than
   changing what `posted` means: Elo (`eloOutcome`), `heat` (`pushHeat`) and the debrief headline all
   read `postedRecorded` and want the full-queue value, and a silent change would be double-counted
   here. `tests/job-board.test.mjs` asserts both fields are still absent, so it will go red and be
   read the day one is written.
4. **`site/js/screens/job.js`** — still open from rounds 1 and 2: nothing renders `pressLine`,
   `oneMakeLine` or `deferredLine`.

## Suite state when this lane finished

`node --test tests/` → **2725 tests, 2718 pass, 3 fail** at exit (it was 2715/6 twenty minutes
earlier and 2698/3 before this lane started: the screen lane is writing `site/js/screens/job.js`,
`site/css/job.css` and `tests/job-screen.test.mjs` as this runs, and the count follows their saves).
All three are in that lane's own suite and none can be reached from this one:

```
tests/job-screen.test.mjs:225  "it must clear card.js's dock by the measured height"  — a grep of screens/job.js source
tests/job-screen.test.mjs:374  "the bag/push row prints no fraction either"          — a grep of screens/job.js source
tests/job-screen.test.mjs:852  the 375x667 board-height walk                         — the same sheet as r3 §3
```

`tests/job-board.test.mjs` is **98/98**, and the files this lane could have moved
(`job-split`, `job-exploit`, `job-econ`, `job-week`) are **301/301**.

**The one of those six that could plausibly have been this lane's — the cold-open walk, which now
reads a longer primary button — was A/B'd rather than argued about.** With `primary` temporarily
restored to its pre-round-3 form and nothing else changed:

```
the primary button   JOB · 10 targets · ~23 min · ends 19:52 · 26 % game → #/run/job
FAIL (4)   waiting for locator('.job-screen .job-primary')   waiting for locator('.job-screen') ×2 …
```

— the same four failures, so the job screen not mounting is not this string. The walk's own Home
screenshot (`qa/screenshots/job-walk/chromium-1280-light-jobA-walk-00-home.png`, 20:36) shows the new
CTA rendering correctly, and there is no `pageerror` or console error anywhere in the run, so
`postBoard` is not throwing either. board.js was restored immediately after the A/B and re-verified
(98/98).
