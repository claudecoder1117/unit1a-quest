# crew — round-1 fix pass (THE JOB game layer)

Lane: **crew**. Files owned and changed:

- `/Users/oliver/Projects/unit1a-quest/site/js/job/crew.js`
- `/Users/oliver/Projects/unit1a-quest/tests/job-crew.test.mjs`
- `/Users/oliver/Projects/unit1a-quest/tests/job-align.test.mjs` (J4's second suite — see the collision note at the end)

`cd /Users/oliver/Projects/unit1a-quest && node --test tests/` → **# tests 2503 · # pass 2499 · # fail 0**
(4 skipped — the same four the tree carried before this pass.)

Eleven findings came in. **Seven were in this lane and are fixed at the root in `crew.js`.** Four live
in files this lane does not own (`COMPOSED-GAME.md`, `site/data/job.js`, `site/js/screens/job.js`,
`site/js/page.js`, `site/js/mock.js`) and are written up below as exact, quotable requests — another
agent was editing every one of those files while this ran, and BUILD-POLICY §2 forbids the reach-in.

---

## 1. FIXED — the idle rule stood the crew down on EVERY due review (BLOCKER #10)

**The defect.** `isIdleFor` returned `isDueReview(target)`. `composeBundles` fills a job
criticals-first and a critical is by definition a due review, so once a student carries ≥ 10 dues
**100 % of a drafted job is `role: 'review'`** and the old rule idled the crew on all of it:
`e_forgiven 0.000`, `e_held 0.000`, both ranks paying literally nothing on the shape the app defaults
to, in exactly the state G3.8 #1 drives the student into. The whole crew meta was inert.

**The root cause is a misreading of G2, not a missing feature.** COMPOSED-GAME.md:195 says:

> **Crew goes idle on the make's own due review, and only there.** When the target *is* the review
> that made the make cold, the crew stands down for that target … **The rest of the make's targets in
> that job keep their forgiveness**, and HELD's chain-hold is suppressed on due-review targets only.

Two scopes in one sentence, deliberately different, and the second clause only carries information if
the first is the singular it is written as. G1's Cold-crew line agrees (`4 crew idle on their own
reviews · 9 dues` — four idle against nine dues). `crew.js`'s own `isDueReview` docstring already said
"the review that made its make cold", singular. The code idled all of them.

**The fix.** `crew.js` now implements both scopes:

- `ownDueReviewKey(save, make, {now, queue})` — the ONE target that is the make's own due review: its
  **coldest**, in `schedule.dueList`'s own order (overdue desc, bucket asc, key asc). Two sources, one
  rule: a `queue` scopes it to the drafted job; without one it reads the head of `dueList(save)` for
  that make, which is what the composer drafted from.
- `makeOfCard(id, forCard)` maps a card to its make through `data/source-manifest.js` — the same map
  `readiness.js` builds. Verified against the real composer: **5 580 / 5 580** review targets over
  400 seeded saves resolve to exactly the `skill` label `composePage` printed, 0 mismatches.
- `isIdleFor` → forgiveness stands down on that one target only.
- `isHoldSuppressed` (new) → HELD's chain-hold stands down on **every** due review of the make.
- `encountersIn` now reports `active` (e_forgiven: all but the own review) and `holdActive`
  (e_held: everything that is not a review at all); `simulateJob` applies the same two scopes.
- **`crew.js` reads no clock.** `dueOf` passes a caller-supplied `now` through and otherwise lets
  `schedule.js` supply its own default, so G3.7's zero-clock-reads grep
  (`tests/job-exploit.test.mjs:557`) still passes.

**Measured, through the real composer** (`tests/job-crew.test.mjs` §9, 1 000 seeded saves, 10⁴ jobs):

| shape | e_forgiven before | after |
|---|---|---|
| RUN | 1.039 | **1.313** |
| JOB-10 | 1.604 | **2.177** |
| JOB-12 | 1.316 | **2.423** |
| VAULT-7 | 1.076 | **1.503** |

and on the **drafted bundle path**, which is where the number was 0.000, a STEADY is now served
≥ 1.0 targets on every shape. `m̄`, `e_held`, `P(chain ≥ 3)` and `Σm_saved` reproduce J4's original
measurement to four decimals — the fix moves exactly the parameter it should and nothing else.

**Live, on `qa/fixtures/midweek.json` through `state.startJob`** (10 targets, 8 of them reviews):
a four-STEADY build now pays on 2 targets and idles 3; before, it paid on 1 (the single rematch).

**Residual, and it is not in this lane.** The remaining inertness is supply: `composeBundles` serves
most makes exactly ONE review, and that one review is legitimately the make's own. See Request R4.

## 2. FIXED — `isIdleFor` ignored the crew rank (MAJOR #8)

A make with no crew has no crew to stand down. The screen printed `VOC crew idle — this target is its
own due review` on 9 of 11 envelopes for a student with `save.game.crew = {}`, several targets before
the brief first showed them a crew grid. `simulateJob` had guarded on the rank all along
(`isDueReview(t) && rank > 0`); the two implementations disagreed and the screen used the unguarded
one. `isIdleFor` now returns `false` when `effectiveRankOf(save, make) === BARE`.

**Live check:** the midweek save as shipped now reports **0 idle of 10 targets** (was 9 of 11).
The test that "covered" this asserted the OPPOSITE of its own title
(`a bare make is never "idle"` … `assert.equal(isIdleFor(...), true)`); it now asserts its title, and
a second test drives the critic's exact zero-crew board.

## 3. FIXED — the build had no per-make HELD price (BLOCKER #4)

`crewValue` prices STEADY; `heldPerPoint` prices a ROW of the matrix and is make-agnostic; there was
no `heldValue` anywhere. So the build's argmax was unrepresentable, and because `crewValue ∝
(1 − m/100)` while HELD's gate is `m ≥ 85`, every HELD-eligible make sat at the BOTTOM of `crewOrder`
— the game's best point pointing at the last row of the study plan, with nothing in the layer saying
so. New in `crew.js`:

- `heldValue(save, make, shape)` — the row price with `e_held` scaled by the make's encounter share
  `w / W̄` (the same ratio `encountersFor` uses; both of HELD's terms scale with how often the make is
  served). `0` unless `canHold`, so G4's lapse removes it automatically.
- `buildOptions(save, {shape})` / `bestBuy(save)` — every point the save could buy, priced per point,
  best first. The real build argmax.
- `alignmentFor(save, {shape})` — **the theorem's domain, computed**: both argmaxes, whether the
  claim holds on this save, and the threshold it fails at, printed in `w · (1 − m/100)` units so it
  can be read straight against Home's Weak spots.

`tests/job-align.test.mjs` §5 measures it: on a population that can actually buy HELD the unrestricted
claim fails on a real fraction of saves, and every time it fails it fails the same way — the best buy
is a HELD on a mastered make sitting past position 9 of 19 in `crewOrder`.

## 4. FIXED — `argmax(game) = argmax(ΔReadiness)` was asserted unrestricted (BLOCKER #3)

`readiness.masteryTerm` reads `m_shown = m · min(1, n/5)`; the published derivation drops
`min(1, n/5)` across a "∝", and `tests/job-align.test.mjs:367` filtered the population to `n ≥ 5` and
called that "the set a build chooses from" — the filter removed precisely the makes the dropped term
applies to, and the suite's own generator draws `n ∈ [1, 8]`.

`crewValue` was **not** changed: it is exactly `readiness.weakSpots()`'s sort key (ρ = 1, §1,
untouched) and that is the study plan the app actually prints. Multiplying `min(1, n/5)` into it would
break the true, tested identity in order to chase a formula `weakSpots()` does not follow either.
Instead the layer now publishes the missing terms and the suite measures the gap:

- `readinessGradient(save, make)` — the **exact** ΔReadiness for one clean clear, computed by running
  the shipped `mastery.updateSkill(rec, 100)` and differencing the shipped `m_shown`. No guessed α, no
  dropped factor, and it carries the `n + 1` bump the document's own corrected formula still misses.
- `nOf`, `evidenceDepth` — the term itself.
- align §4 now has two tests: **ON the domain** (equal evidence depth → the argmaxes coincide,
  exactly) and **OFF it** (the unfiltered population → they disagree on > 25 % of saves, with the
  mechanism named: the game prefers the thinner-evidence make). A third assertion shows that restoring
  `min(1, n/5)` reproduces the document's own derivation to the bit — so the dropped term is the whole
  of that discrepancy — and that even the corrected linearisation is not the step the game takes.

The unrestricted sentence still stands in three places in COMPOSED-GAME.md. See Request R2.

## 5. FIXED — the linearised Δρ̂ against the real band payoff (MAJOR #5)

`dRhoModel` fits through the origin; the real Δρ comes from `RUNG_BANDS` via `bandFor`, which clamps
below m = 40. New: `dRhoTrue(m, rank)`, `dRhoModelError(m)`, `steadyValueTrue(save, make, shape)` —
the payoff the game actually pays. Measured and asserted in `tests/job-crew.test.mjs` §13:

- Δρ is **exactly flat** for every m ≤ 40 — the whole weak-spot range — so the true payoff orders
  makes by **test weight alone** there, while `crewValue` orders by `w · (1 − m/100)`;
- the model is **+24.2 %** at m = 85 (where HELD's gate sits) and **+64.6 %** at m = 0;
- the two orderings pick a different top make on > 15 % of the align population (align §5).

The `DRHO_SLOPE` docstring's "mildly concave" was backwards and is corrected: the chord slopes `y/x`
at the three shipped bands are 0.2725 · 0.2688 · 0.2167 and RISE with `x` — convex on the shipped
range, flat below m = 40, S-shaped overall. Asserted, not asserted-away. The real repair for the flat
tail is a band below 40 in `data/job.js`; see Request R5.

## 6. FIXED — G3.7 #8's start-of-day `m_shown` snapshot does not exist (MAJOR #6)

It does not exist anywhere in the layer (`state.js:1268` snapshots the RATING; `guard.js:345` is a cap
projection). The guarantee it was written to support holds anyway, by a stronger mechanism, and
`crew.js` now proves it instead of asserting it:

- `tankingCheck(save, make, {drop, target})` — drop `m` by any amount, at any rank: the payout never
  rises. The ladder's only crew input is `forgivenessOf`, which reads the **rank**; the rank's only
  `m`-dependence is `canHold`, which can only ever REMOVE HELD. §13 runs it at BARE/STEADY/HELD for
  drops of 10/20/40/90 and asserts the payout is flat in `m` both above and below the gate — there is
  no gradient to farm in either direction.
- The one `(1 − m)` term in the layer is `crewValue`, which is an advisory ORDERING and pays nothing.
  `tankingCheck` reports that separately (`orderRose`) rather than hiding it.

The doc sentence still promises a snapshot. See Request R3.

## 7. FIXED (the half that is in this lane) — the lapsed HELD (MAJOR #11)

`legalize()` still has no caller under `site/js` — that wiring is in `mock.js` / `state.js` /
`screens/job.js` (Request R6). What IS fixed here is that the waste is no longer invisible:

- `budgetFor(save)` now returns `lapsed` (the makes whose stored HELD the gate no longer justifies),
  `wasted` (points paid for value not delivered) and `effectiveSpent`;
- `lapsedMakes(save, crew)` and `crewDemotions(save)` — the latter is G4's debrief line as data,
  in the exact `{make, from, to, reason, fromName, toName}` shape the screen needs, and §13 asserts it
  agrees with `legalize()`'s own `changes[]` and is idempotent after the repair.

## 8. FIXED (in this file's own claims) — the ±15 % and the flip (BLOCKERS #1, #2)

Both defects live in `COMPOSED-GAME.md` and `site/data/job.js` (Requests R1, R7). What this lane could
fix is that `crew.js` and its suite repeated the same false claims:

- `matrixParamsFor`'s docstring said the suite "asserts within ±15 %" — corrected to what is actually
  asserted, with the winner finding stated;
- `relErr`, `MATRIX_TOLERANCE` and `bestRankFor` docstrings corrected;
- **the suite now machine-checks the count.** `WITHIN ±15 %` asserts the exact set of cells that
  reproduce — `['RUN.mBar', 'JOB.mBar', 'JOB12.mBar']`, **3 of 20** — so the false claim cannot come
  back by drift: if a later change makes more cells land, the test fails and the document has to be
  re-read rather than quietly re-believed.
- The existing test `the flip structure is what the measurement CAN and CANNOT confirm` still asserts
  `measuredRow(id).winner === 'STEADY'` on **all four** rows. G2's own update rule ("a moved winner
  means the row is wrong") therefore fired on three rows and has not been honoured.

---

## Requests for other file owners

### R1 — `COMPOSED-GAME.md` (the ±15 % claim, three places) · BLOCKER

Lines **229**, **834** and **929** all claim the twenty matrix parameters are asserted within ±15 %.
Three of twenty are. Replace with what `tests/job-crew.test.mjs` §9 asserts, which `notes/J4.md` §5.1
already states correctly:

> `m̄`, `e_forgiven`, `e_held`, `P(chain ≥ 3)` and `Σm_saved` are measured off `composePage` +
> `composeBundles` over 1 000 seeded saves and a 10⁴-job simulation. **`m̄` reproduces within ±15 % on
> the RUN, JOB-10 and JOB-12 rows — three of the twenty cells.** Every other cell is asserted at its
> measured value with a bounded deviation and a ±2 % regression pin; `e_held` is asserted BELOW the
> published number on every shape, because it is structurally unreachable rather than noisy.

### R2 — `COMPOSED-GAME.md` G3.8 / G9 criterion 5 (the alignment theorem) · BLOCKER

Two independent restrictions, both currently missing:

1. **Line 525's derivation drops `min(1, n/5)`.** Either restore it in the formula and state the
   domain, or say plainly that the equality is against `readiness.weakSpots()`'s sort key (which also
   ignores `n`) and holds against ΔReadiness only on makes of equal evidence depth. `crew.readinessGradient`
   is the exact gradient if you want to quote a number.
2. **Line 508 ("There is no step in the min-maxer's list that is not also the best available study
   action") and G9 #5 ignore HELD.** Add the domain to the theorem line itself:

   > holds while `max_i w_i(1 − m_i/100) ≥ heldValue(best) / k(shape)` — `crew.alignmentFor(save, shape)`
   > returns the threshold, the two argmaxes and whether it holds.

   G2 flip 2 already states the caveat ("For a student with no mastered make…"); the theorem
   statement, step 5 and G9 #5 drop it.

### R3 — `COMPOSED-GAME.md` G3.7 #8 (line 500, the snapshot) · MAJOR

Delete the sentence *"Any `(1 − m)` term in the layer reads the start-of-day snapshot of `m_shown`, so
today's tanking cannot pay today"* and replace it with the mechanism that is actually there:

> No `(1 − m)` term in the layer reaches a payout. The ladder's only crew input is `forgivenessOf`,
> which reads the **rank**; the rank's only dependence on `m` is `canHold`, which can only ever remove
> HELD. Tanking therefore cannot raise a payout today or any other day — asserted by
> `crew.tankingCheck` at every rank over drops of 10/20/40/90.

Implementing the snapshot instead would break the ρ = 1 identity in `job-align`, which is the honest
signal, not a regression — but it is a bigger change than the sentence is worth.

### R4 — `site/js/page.js` `composeBundles` (the supply half of BLOCKER #10) · BLOCKER-adjacent

The idle rule is fixed; the supply is not. `page.js:755-760` takes `criticals = criticalAll.slice(0,
budget.targets)` and `page.js:678-686` defines a critical as a REVIEW, so a drafted job is still
~100 % reviews and most makes are served exactly ONE target — which is legitimately their own due
review, so the crew still earns nothing **on those makes**. `notes/J4.md` §5.3 option (a): reserve
~30 % of `budget.targets` for new/weak/floor, with the overflow criticals staying due under Global
rule 5. `tests/job-crew.test.mjs` §9.4 measures the drafted path and will show the movement.

### R5 — `site/data/job.js` `RUNG_BANDS` (MAJOR #5) · MAJOR

There is no band below m = 40, so `bandFor` clamps and the true Δρ is flat across the entire
weak-spot range while `crewValue` keeps rising. Either add an m20 (or m0) row — the model then has
something to fit and `DRHO_SLOPE` re-derives itself at module load, no constant to retype — or accept
the flat tail and let G3.8 say that below m = 40 the game's forgiveness value orders by test weight.
`crew.dRhoTrue` / `crew.steadyValueTrue` are the functions that expose whichever choice is made.

### R6 — `site/js/mock.js`, `site/js/job/state.js`, `site/js/screens/job.js` (MAJOR #11) · MAJOR

`crew.legalize(save)` has no caller. G4 names the two moments:

```js
// after mock.submitRun, and after a boss KO/miss writes mastery:
const { save: repaired, changes } = crew.legalize(save);
// …then render each change through COPY.crewDemoted({ make }) in the debrief
// (and on Home's cold-crew strip when the drop happened outside a job).
```

`crew.crewDemotions(save)` returns the same set as pure data if you only need the line. Until this
lands, `budgetFor(save).wasted` is how many capacity points a lapsed HELD is burning.

### R7 — `site/data/job.js` `CREW_MATRIX.rows` + `COMPOSED-GAME.md` G2 (BLOCKER #2) · BLOCKER

Priced with the repo's own measured parameters, `crew.buildRowFor` returns **STEADY on all four
rows**, not `STEADY · HELD · HELD · HELD`. G2:229 says *"If a measured parameter moves the winner of a
row, the row in this document is wrong and the ticket updates it."* It moved on three rows. Two things
have to happen together:

1. re-derive the `CREW_MATRIX` rows from the real `composeBundles` path — the `e_forgiven` column in
   particular is now measured **above** the published numbers on every shape (1.31 / 2.18 / 2.42 /
   1.50 against 0.9 / 1.4 / 1.7 / 1.0), because those numbers were written for the per-make idle rule
   G12 #4 replaced and were never re-derived;
2. rewrite "Flip 1 — shape": as measured, **STEADY dominates every row**. `notes/J4.md` §5.2 names the
   threshold HELD needs (e_held ≥ ~6.7 on a JOB-10 with everything else at its measured value; the
   board supplies 0.45). Either fix the supply so the hold is reachable, or publish that HELD is a
   late-unit purchase and stop calling the build the layer's central tension.

### R8 — `site/js/screens/job.js` + `site/data/job.js` (the ladder line) · BLOCKER #9 / MAJOR #7

**Not fixed — this lane does not own either file, and both were being edited while this ran.** Still
live as of this note: `screens/job.js:128` passes the MAKE where the copy expects a rank, and
`data/job.js:634` hardcodes `forgives one`, so a student with no crew reads
`attempt 2 · crew VOC forgives one · ρ 0.45 · +10 loose` — beside the un-forgiven `LADDER[2]`, which
proves nothing forgave anything. The crew side needs no new API; `crewFor` already returns everything:

```js
export function ladderLineOf(p, save) {
  if (!p || p.free || !p.ok || p.rung === 0) return '';
  const make = p.target?.make ?? null;
  const c = crew.crewFor(save, make, p.target);          // .forgives, .name, .idle
  const attempt = p.rung >= 2 ? p.rung : 1;
  const rho = num(p.rho, 0).toFixed(2);
  const loose = Math.abs(econ.round(num(p.delta, 0)));
  return c.forgives > 0
    ? COPY.ladderCrew({ attempt, make, rank: c.name, rungs: c.forgives, rho, loose })
    : COPY.ladderBare({ attempt, make, rho, loose });
}
```

with, in `data/job.js`:

```js
ladderCrew: ({ attempt, make, rank, rungs, rho, loose }) =>
  `attempt ${attempt} · ${make} crew ${rank} forgave ${rungs === 1 ? 'one rung' : `${rungs} rungs`} · ρ ${rho} · +${loose} loose`,
ladderBare: ({ attempt, make, rho, loose }) =>
  `attempt ${attempt} · no crew on ${make} · ρ ${rho} · +${loose} loose`,
```

and a test that drives `ladderLineOf` off a real payout record and asserts the printed ρ equals
`econ.rhoFor(rung, crew.forgivenessOf(save, make, target))` — the current copy test
(`tests/job-econ.test.mjs:1065`) hands the template a rank name and a hand-written ρ and then asserts
the string it just built.

### R9 — `site/js/job/state.js` + `site/js/job/econ.js` (one field, the second idle scope) · MINOR

G2 has two scopes; `econ.settle` takes one boolean, so the payout currently applies the forgiveness
scope to both. `crewFor()` now returns `holdIdle` for the other one. One line each:

```js
// state.js:486 (jobEnvelopeFor) and :522
holdIdle: cr.holdIdle,
// econ.settle: the ladder keeps `target.idle`; the CHAIN takes both
chainAfterTarget(rung, crew, chain, { idle: target.idle || target.holdIdle })
```

Until then a HELD crew can hold the chain on a due review that is not the make's own, which G2 says it
should not. The direction is generous to the player, so it is a MINOR, not a blocker.

---


## Findings this lane judged correct but could not fix in-lane

#1, #2 (COMPOSED-GAME.md + `data/job.js`), #7, #9 (`screens/job.js` + `data/job.js`). None of them is
wrong; all four are re-stated above with the exact text or patch. **No finding in this batch was
found to be mistaken.**

## Collision note

`tests/job-align.test.mjs` was being written by another agent during this pass — a second
`J4 · align · 5` describe block ("the MEASURED gradient: realised payoff vs realised ΔReadiness")
appeared after mine. Both blocks are present and both pass; the duplicate section NUMBER is cosmetic
and whoever lands last should renumber. My additions are the header block at the top, the two §4 tests
(`ON THE DOMAIN` / `OFF IT`) and the first `align · 5` describe. Nothing of theirs was edited.

## New exports (for J6 / J7 / J8 / J9)

```js
keyOf(t) · overdueOf(t) · makeOfCard(id, forCard?)
ownDueReviewKey(save, make, { now?, queue? }) : string|null
ownDueReviewIndices(queue) : Map<make, index>
isIdleFor(save, make, target, { now?, queue? })      // + rank gate, + one-per-make
isHoldSuppressed(save, make, target)
crewFor(save, make, target?, opts?)                  // + .holdIdle, .chainHold now honours it
forgivenessOf / chainAfterFor / holdsChain           // all take the same opts
lapsedMakes(save, crew?) · crewDemotions(save)
budgetFor(save, crew?)                               // + .lapsed .wasted .effectiveSpent
encountersIn(queue, make)                            // + .holdActive .reviews
nOf · evidenceDepth · readinessGradient(save, make)
dRhoTrue(m, rank?) · dRhoModelError(m) · steadyValueTrue(save, make, shape?)
heldValue(save, make, shape?) · buildOptions(save, opts?) · bestBuy(save, opts?)
alignmentFor(save, { shape?, of? }) : { steady, held, holds, best, threshold, margin }
tankingCheck(save, make, { drop?, target?, shape? })
```

---
---

# crew — ROUND 2 fix pass

Lane: **crew**. Files owned and changed this round:

- `/Users/oliver/Projects/unit1a-quest/site/js/job/crew.js`
- `/Users/oliver/Projects/unit1a-quest/tests/job-crew.test.mjs`

Six findings came in. **One is in this lane and is fixed at the root** (#3/#6 are two faces of it).
**Four are defects in `COMPOSED-GAME.md`, which this lane does not own** — they are round 1's R1, R2
and R7, re-filed below with paste-ready replacement prose and with the repriced table the document
needs. **No finding in this batch was found to be mistaken.**

`cd /Users/oliver/Projects/unit1a-quest && node --test tests/job-crew.test.mjs` →
**# tests 102 · # pass 102 · # fail 0** (was 88).

## 1. FIXED — `crewValue` was sold as a payoff gradient and is priced against supply that does not exist (r2 BLOCKER #3, MAJOR #6)

**The defect.** `encountersFor` modelled `encounters_i = e_forgiven(shape) · w_i / W̄` — every make
gets a strictly positive, weight-proportional encounter count. `composeBundles` does not deal boards
that way. Measured by the suite over **150 drafted 10-target JOB queues** (`composeBundles` →
`draftUnion`, the queue a job is played on), with G2's own idle rule applied:

```
$ J4_PRINT=1 node --test tests/job-crew.test.mjs | grep 'r2 supply'
r2 supply | boards 150 | study #1 pays ZERO 93 (62 %) | study #1 == best-paying make 22 (15 %)
          | forgivable-target histogram {"0":93,"1":47,"2":10}
```

So on **93 of 150 boards a crew point on the make the study plan ranks FIRST returns exactly zero**,
and the make whose point pays most on the board is that make on **22 of 150 (15 %)**. An independent
run over 300 boards with a different seed tag: 48 % and 21 %. The magnitudes move with the
population; the mechanism does not — supply, not test weight, decides what a point is worth.

The same modelling step is what makes the `Δρ` finding bite: `bandFor` clamps at the lowest published
band, so `dRhoTrue` is **one number (0.1635) for every m ≤ 40** — the whole weak-spot range — and the
true payoff there orders makes by `w` alone. The two orderings pick a different top make on
**115/300 = 38.3 %** of seeded saves (`grep 'r2 band floor'`).

**The fix, in `crew.js`.** `crewValue` itself is UNCHANGED — it is an exact positive multiple of
`readiness.weakSpots()`'s sort key (ρ = 1 is an identity, not a coincidence) and bending it would
break the one true thing in the row. What changed is that the layer stops quoting it as a price and
now has one:

- `encountersFor(save, make, shape, { queue })` — **with a queue it returns the measurement**
  (`encountersIn(queue, make).active`, an integer that can be 0); without one it returns the model,
  and the docstring carries the histogram above so the model can never again be read as the truth.
- `steadyValueOn(save, make, queue, {shape})` — `steadyValueTrue` with that one term replaced by the
  measurement. Returns **exactly 0** when the board serves the make nothing.
- `heldValueOn(save, make, queue, {shape})` — the same for HELD, off `holdActive`.
- `crewOrderOn(save, queue, {shape, of})` — the makes ordered by what a point on them *pays here*.
- `supplyGapFor(save, queue, {shape, of})` — the finding as data: `{studyTop, studySupply, studyPays,
  gameTop, gameValue, agrees, zeroPay}`.
- `BAND_FLOOR` (= 40) and `isBandFloored(m)` — the clamp named and exported instead of implied.
- `crewValue` / `encountersFor` / `DRHO_SLOPE` docstrings corrected; the r1 docstring's "≈ 28 %" for
  the ordering split was measured on a narrower population and is now 39 % with the measurement
  beside it.

**Tested** — `tests/job-crew.test.mjs` §14, three describes, 13 new tests: the queue path IS
`encountersIn().active`; `steadyValueOn` reproduces the ladder arithmetic to 1e-12; the zero-pay and
agreement shares are measured and **bounded in the direction they went** (`zeroShare ≥ 0.40`,
`agreeShare ≤ 0.35`) so a later repair of `composeBundles` fails the test and forces the document to
be re-read; `crewOrderOn` and `crewOrder` are shown to be different orderings on real boards; the band
floor is asserted flat at every m ≤ 40 with a worked two-make counterexample.

## 2. FIXED — §8's ARGMAX test was a constant asserted against itself (r2 BLOCKER #1, second half)

`tests/job-crew.test.mjs` §8 asserted `bestRankFor('JOB') === 'HELD'` and then
`row.winner === row.params.published.winner` for every row. Both sides read `matrixParamsFor(id)` →
`CREW_MATRIX.rows`: the document read back through its own numbers, structurally incapable of
failing, standing exactly where the suite's guard on G2's flip structure was supposed to be.

- The measurement that used to live inside §13 is **hoisted to module scope** (unchanged — a pure
  move) so §8 can use it. §8's ARGMAX test now prices the two shipped formulas with the five
  parameters MEASURED off `composeBundles` → `draftUnion`, asserts `source === 'measured'` on every
  row, asserts **STEADY wins all four shapes by over 4×**, and asserts that the winner moved on
  exactly `['JOB','JOB12','VAULT']`.
- The old check survives, relabelled as what it is and nothing more: *"the published table reproduces
  its OWN arithmetic — and that is the whole of what it shows"*.
- `buildRowFor` now returns **`source`** (`'published'` | `'measured'`), `publishedWinner` and
  `agreesWithPublished`, and `MEASURED_KEYS` is exported — so no caller can read a `winner` without
  being able to see which of the two matrices it came from. `bestRankFor`'s docstring says plainly
  that with no `over` it answers for the document and the document is wrong on three of four rows.

This removes the false flip from everything this lane owns. It **cannot** remove it from
`data/job.js`'s `CREW_MATRIX` or from `COMPOSED-GAME.md` — see R7 below, unapplied since round 1.

---

# Requests for other file owners — ROUND 2

**R1, R2 and R7 were filed in round 1 and have NOT been applied.** `notes/crew-fix.md` was written at
15:03 and `COMPOSED-GAME.md` was edited at 15:06 — the document was touched after the requests were
filed and the requests were not honoured. Line numbers below are current as of this pass and drift
between passes; each request carries the `grep` that finds its text. They are restated here with the replacement text ready to
paste, plus the repriced table R7 needs, so applying them is a copy rather than a decision.

### R1 (re-filed · BLOCKER) — `COMPOSED-GAME.md` the "±15 %" claim, THREE places

Line numbers in this document drift between passes — locate by text:

```
$ grep -n '±15' COMPOSED-GAME.md
231  …"and the test asserts each within ±15 % of the row above."            (G2, "the numbers")
867  …"land within ±15 % of the G2 table"                                   (G8, the J4 row)
962  …"the parameters are measured by J4 with a ±15 % tolerance"            (G12 #5)
```


The document says the test asserts all twenty matrix parameters within ±15 %. The shipped test
asserts the **opposite**, and names the exact set:

```
tests/job-crew.test.mjs  →  assert.deepEqual(inTol, ['RUN.mBar', 'JOB.mBar', 'JOB12.mBar'])
                            assert.equal(inTol.length * 5, 15, '3 of 20 cells — not 20 of 20')
$ J4_PRINT=1 node --test tests/job-crew.test.mjs
RUN    mBar -1.7%  eF +45.9%  eH -91.6%  P3 +83.6%  mSaved -82.0%
JOB    mBar +1.2%  eF +55.5%  eH -90.9%  P3 -19.0%  mSaved -48.2%
JOB12  mBar -3.5%  eF +42.5%  eH -90.4%  P3 -28.3%  mSaved -59.6%
VAULT  mBar -17.3% eF +50.3%  eH -89.8%  P3 -51.0%  mSaved -77.5%
```

**Paste this in place of the "±15 %" sentence at all three lines:**

> `m̄`, `e_forgiven`, `e_held`, `P(chain ≥ 3)` and `Σm_saved` are measured off `composePage` +
> `composeBundles` over 1 000 seeded saves and a 10⁴-job simulation. **`m̄` reproduces within ±15 % on
> the RUN, JOB-10 and JOB-12 rows — three of the twenty cells.** Every other cell is asserted at its
> measured value with a bounded deviation and a ±2 % regression pin; `e_held` is asserted BELOW the
> published number on every shape, because it is structurally unreachable rather than noisy.

### R2 (re-filed · BLOCKER) — `COMPOSED-GAME.md` the alignment theorem, TWO places

```
$ grep -n "no step in the min-maxer's list" COMPOSED-GAME.md          →  550   (G3.8)
$ grep -n 'A min-maxer is an optimal student' COMPOSED-GAME.md        →  890   (G9 #5)
```


Still published unrestricted in G3.8: *"**`argmax(game) = argmax(ΔReadiness)` on the domain where the
game stakes anything.** … There is no step in the min-maxer's list that is not also the best
available study action, and the proof is arithmetic rather than assertion."* The shipped code says
the opposite in its own docstring (`site/js/job/crew.js`: *"The unrestricted form … is FALSE as
written, in three separate ways"*), and the suite measures all three.

The `q̂ ≥ 0.5` restriction the paragraph does carry is **row 3's** and is not the one that fails.

**Paste this in place of G3.8's final sentence, and as G9 criterion 5's body:**

> The crew ORDERING is `readiness.weakSpots()`'s ordering **by construction** — `crewValue` is an
> exact positive multiple of that sort key, so Spearman ρ = 1 is an identity rather than a result
> (`site/js/job/crew.js` `crewValue` against `site/js/readiness.js` `skillState().score`). The
> stronger claim — that the game's best crew point is also the best available study action — holds on
> a stated domain and not off it. `crew.alignmentFor(save, {shape, queue})` computes all three
> conditions and prints the boundary in `w · (1 − m/100)` units, the units Home's Weak spots are
> sorted in:
>
> 1. **evidence** — every candidate make at `n ≥ 5` (`mastery.N_FULL`), where `m_shown = m` and the
>    derivation's dropped `min(1, n/5)` is 1. Off it the game prefers the thinner-evidence make: on
>    an unfiltered population the two argmaxes disagree on **60 % to 87 % of saves** depending on how
>    the evidence depths are drawn.
> 2. **rank** — the best STEADY outbids the best HELD, i.e.
>    `max_i w_i(1 − m_i/100) ≥ heldValue(best) / k(shape)`; `alignmentFor().threshold` is that number.
>    Off it the best point goes on a mastered make, which has nothing left to study.
> 3. **supply** — the board serves the study plan's first make more than once, so a point on it
>    forgives something. Measured over 150 drafted JOB-10 boards, **it does not on 62 % of them**, and
>    the game's best-paying crew point is the study plan's first make on **15 %**.

### R5 (re-filed · MAJOR) — `site/data/job.js` `RUNG_BANDS`: no band below m = 40

`bandFor` clamps, so the true `Δρ` is **0.1635 for every m ≤ 40** — the entire weak-spot range — and
the true payoff there orders makes by test weight alone while `crewValue` keeps rising. Measured:
the two orderings pick a different top make on **38.3 %** of seeded saves. Add an `m20` (or `m15`)
row and `DRHO_SLOPE` re-fits itself at module load — no constant to retype — and G2's distribution
table at :203-207 gains a fourth row. Until then, **G3.8 must say that below m = 40 the crew gradient
and the true payoff order makes differently, and name the figure.** `crew.BAND_FLOOR`,
`crew.isBandFloored`, `crew.dRhoTrue` and `crew.steadyValueTrue` expose whichever choice is made.

### R7 (re-filed · BLOCKER, with the repriced table) — `site/data/job.js` `CREW_MATRIX.rows` + `COMPOSED-GAME.md` G2

```
$ grep -n 'Three states, two flips' COMPOSED-GAME.md                  →  233   (G2, + the two Flip bullets under it)
$ grep -n 'the argmax of the 4×2 matrix is STEADY on RUN' …           →  867   (G8, the J4 row)
$ grep -n 'Two flips survive' COMPOSED-GAME.md                        →  962   (G12 #5)
   and the 4×2 table itself is the four rows above line 231.
```


G2 publishes RUN STEADY, JOB-10 **HELD**, JOB-12 **HELD**, VAULT-7 **HELD**, and calls it
*"Three states, two flips, no dominant build"*. Measured on the path a job is played on, **STEADY
wins all four and is over 4× HELD on every one of them**:

```
$ J4_PRINT=1 node --test tests/job-crew.test.mjs | grep '^r13'
r13 RUN    | S 1.50 H 0.09 → STEADY (published STEADY)
r13 JOB    | S 3.33 H 0.25 → STEADY (published HELD)
r13 JOB12  | S 5.95 H 0.48 → STEADY (published HELD)
r13 VAULT  | S 6.44 H 0.40 → STEADY (published HELD)
```

G2:229 sets the rule the document then breaks: *"If a measured parameter moves the winner of a row,
the row in this document is wrong and the ticket updates it — the flip structure below is the claim,
not the decimals."* It moved on three of four rows.

**The repriced table, measured off `composeBundles` → `draftUnion` (the drafted path). Paste it over
G2's 4×2 table and copy the same five columns into `data/job.js CREW_MATRIX.rows`:**

| shape | `m̄` | `e_forgiven` | `e_held` | `P(chain ≥ 3)` | `Σm_saved` | **STEADY / pt** | **HELD / pt** | winner |
|---|---|---|---|---|---|---|---|---|
| RUN | 1.21 | 1.26 | 0.44 | 0.14 | 0.60 | **1.50** | 0.09 | **STEADY** |
| JOB-10 | 1.33 | 1.82 | 0.76 | 0.26 | 0.60 | **3.33** | 0.25 | **STEADY** |
| JOB-12 | 1.27 | 2.26 | 1.03 | 0.18 | 0.80 | **5.95** | 0.48 | **STEADY** |
| VAULT-7 | 1.21 | 1.41 | 0.59 | 0.14 | 0.00 | **6.44** | 0.40 | **STEADY** |

`Σm_saved` is 0.00 on the VAULT row because **no chain-hold fired at all** in 34 drafted VAULT-7
boards — seven targets, and the mastered makes the hold needs are not among them. It is a measured
zero, not a missing cell; if the row is published it should be published with that sentence.

**Paste this in place of "Three states, two flips, no dominant build" and the two Flip bullets
under it (and strike "Two flips survive" from G12 #5):**

> **One dominant rung, and one real decision:**
> - **There is no shape flip.** STEADY wins on all four shapes and is over 4× HELD on every one of
>   them. The chain-hold's value scales with `L̄` and with chain depth, but it also scales with
>   `e_held` — how many targets of a *mastered* make a job serves — and the composer serves 0.44 to
>   1.03 of them against the 2.8–5.6 this table used to assume. **HELD is currently unreachable, not
>   merely weak**; a JOB-10 needs `e_held ≈ 6.7` before HELD wins with everything else at its measured
>   value, and the drafted union supplies 0.76. Either `composeBundles` reserves supply for mastered
>   makes (J5) or HELD is published as a late-unit purchase.
> - **The decision that is left is Flip 2 alone** — *which* weak makes to STEADY, ordered by
>   `w · (1 − m/100)`, which is the sort key `readiness.weakSpots()` already uses. Note the supply
>   condition with it: on 62 % of drafted boards the first make on that list is served no forgivable
>   target and a point on it pays nothing (`crew.supplyGapFor`).

And in **G8's J4 acceptance row**, replace *"the argmax of the 4×2 matrix is STEADY on RUN and
HELD on JOB-10 / JOB-12 / VAULT"* with *"the argmax of the 4×2 matrix, priced from the measured
parameters, is **STEADY on all four shapes**, by a factor of more than 4 on each"*.

### R4 (re-filed · BLOCKER-adjacent) — `site/js/page.js` `composeBundles`: the supply half

Unchanged from round 1, and it is now measured twice over: a drafted job is ~100 % reviews, most
makes are served exactly one target, and that target is legitimately the make's own due review, so
the crew earns nothing on it. `notes/J4.md` §5.3 option (a): reserve ~30 % of `budget.targets` for
new/weak/floor. `tests/job-crew.test.mjs` §14's two bounds are written so that this repair **fails
them** and forces G3.8 row 2 to be re-read — that is deliberate.

### R10 (new · MINOR) — `site/js/screens/job.js` `crewBlock` re-implements `encountersIn`

`crewBlock` computes `left` / `forgives` per row inline (`ownDueReviewKey` + `isDueReview` + a manual
key compare). That is exactly `crew.encountersIn(queue, make)` — `.total` and `.active` — and the two
can drift. One-line swap:

```js
const c = state.crew.encountersIn(queue, mk);   // { total, active, holdActive, idle, reviews }
// c.total is `left`, c.active is `forgives`
```

And the row can now print what the point is worth on *this* board rather than only the study key:
`state.crew.steadyValueOn(s, make, queue, { shape })` — it is 0 exactly when `c.active` is 0, which
is 62 % of boards for the make the grid lists first. `state.crew.supplyGapFor(s, queue)` returns the
whole comparison, and `alignmentFor(s, { shape, of: onBoard, queue })` now carries `.domain.supply`
alongside the `.holds` the block already prints.

## What the suite prints (every number in this note is reproducible)

```
$ cd /Users/oliver/Projects/unit1a-quest && J4_PRINT=1 node --test tests/job-crew.test.mjs
RUN    mBar 1.2774 (pub 1.3, -1.7%)  eF 1.3132 (pub 0.9, +45.9%)  eH 0.3036 (pub 3.6, -91.6%) …
JOB    mBar 1.4171 (pub 1.4, +1.2%)  eF 2.1772 (pub 1.4, +55.5%)  eH 0.4532 (pub 5,   -90.9%) …
JOB12  mBar 1.4478 (pub 1.5, -3.5%)  eF 2.4232 (pub 1.7, +42.5%)  eH 0.5380 (pub 5.6, -90.4%) …
VAULT  mBar 1.3235 (pub 1.6, -17.3%) eF 1.5028 (pub 1,   +50.3%)  eH 0.2856 (pub 2.8, -89.8%) …
r13 RUN    | S 1.50 H 0.09 → STEADY (published STEADY)
r13 JOB    | S 3.33 H 0.25 → STEADY (published HELD)
r13 JOB12  | S 5.95 H 0.48 → STEADY (published HELD)
r13 VAULT  | S 6.44 H 0.40 → STEADY (published HELD)
r2 supply     | boards 150 | study #1 pays ZERO 93 (62 %) | study #1 == best-paying make 22 (15 %)
              | forgivable-target histogram {"0":93,"1":47,"2":10}
r2 band floor | model-top != true-top on 115/300 = 38.3 %
r2 evidence   | crewValue vs readinessGradient argmax disagree 262/300 = 87.3 %
```

## Suite state at the end of this pass

`node --test tests/job-crew.test.mjs tests/job-align.test.mjs` → **142 pass, 0 fail** (crew 104 — it was 88 before
this pass — and align 38, unchanged).

`node --test tests/` → **2 611 tests · 2 606 pass · 1 fail · 4 skipped.** The one failure is
`tests/job-screen.test.mjs` → *"J6 measured: a full job at 375x667 with the keyboard open, board
<= 36px on every target"* (`AssertionError: qa/job-screen.mjs failed` — the Playwright layout walk).
**It was already failing on the first run of this pass, before a line of this lane was changed**, and
it is the screen lane's file.

Other lanes were editing live throughout: intermediate runs of this pass also caught
`tests/job-split.test.mjs`, `tests/job-board.test.mjs`, `tests/job-coldopen.test.mjs` and a
`collapsedLineOf` mismatch red, and `site/js/page.js` was briefly unparseable
(`assignLabels is not defined` at `page.js:892`) and then whole again. All of those had cleared by
the final run. Nothing in this pass changes behaviour outside `crew.js`'s own exports: the only
signature touched is `encountersFor`, which gained an OPTIONAL fourth argument, and `alignmentFor` /
`buildRowFor`, which gained fields and changed none.

## Findings this lane judged correct but could not fix in-lane

r2 #1, #2, #4, #5 — all four are text in `COMPOSED-GAME.md` (and, for #1/#4, five stale constants in
`site/data/job.js`). Every one is correct as reported; every one is re-filed above with the exact
replacement text. **BUILD-POLICY §2 forbids this lane the reach-in, and the round-2 prompt states
that another agent is editing those files concurrently.** The in-lane half of #1 and #4 — the
self-referential §8 test and the exported `bestRankFor` publishing the document's flip without
saying so — is fixed here.

## New exports (round 2)

```js
encountersFor(save, make, shape?, { queue? })        // queue → the measurement, not the model
steadyValueOn(save, make, queue, { shape? })
heldValueOn(save, make, queue, { shape? })
crewOrderOn(save, queue, { shape?, of? })
supplyGapFor(save, queue, { shape?, of? })
  : { shape, studyTop, studySupply, studyPays, gameTop, gameValue, agrees, zeroPay }
alignmentFor(save, { shape?, of?, queue? })
  : { …r1 fields, domain: { evidence, rank, supply, all }, thinEvidence, evidenceFloor, gap }
buildRowFor(shape, over?)  : { …r1 fields, source, publishedWinner, agreesWithPublished }
BAND_FLOOR · isBandFloored(m) · MEASURED_KEYS
```

---

# Round 3 — the crew lane

Lane: **crew**. Files owned and changed this round:

```
site/js/job/crew.js          the two in-lane defects, at the root
tests/job-crew.test.mjs      §15 — 15 new tests (119 in this file, was 104)
tests/job-align.test.mjs     the "worth nothing" claim corrected and doubled (39, was 38)
```

Seven findings were routed here. **Two were in this lane and are fixed at the root. Five are in
`COMPOSED-GAME.md`, `site/data/job.js` and `site/js/screens/*.js`, which this lane does not own**, and
every one of the five reproduces exactly as reported — commands and output below. Nothing was fixed
by weakening a test or a claim: the suite grew by 16 tests and no assertion was relaxed.

## 0. Every routed finding, verified before anything was touched

| # | severity | verdict | where the fix lands |
|---|---|---|---|
| 1 | BLOCKER | **CONFIRMED, reproduced byte for byte** | `COMPOSED-GAME.md:552` — doc |
| 2 | MAJOR | **CONFIRMED** | `site/js/screens/job.js` + `stats.js` + doc |
| 3 | MAJOR | **CONFIRMED** | `site/data/job.js` RUNG_BANDS **or** doc — in-lane half FIXED |
| 4 | MAJOR | **CONFIRMED** | `site/js/screens/job.js` — UI copy |
| 5 | BLOCKER | **CONFIRMED, reproduced** | `COMPOSED-GAME.md` G2/G8/G12 + `data/job.js` — doc |
| 6 | MAJOR | **CONFIRMED** | `COMPOSED-GAME.md:552` + `:896` — doc |
| 7 | MAJOR | **CONFIRMED** | in-lane half FIXED; wiring + copy out of lane |

### Finding 1 — reproduced exactly, and the code is already right

The critic's save, rebuilt from its description and run through the shipped module:

```
$ node scratchpad/crew-r3/ce.mjs
N_FULL 5 BAND_FLOOR 40
crewOrder[0..4] CS-LIN, NOTE, PAIRS, FIG-ALG, VOC
best         {"make":"ASN-PLP","rank":2,"name":"HELD","value":4.694742527999997}
best STEADY  {"make":"CS-LIN","rank":1,"name":"STEADY","value":3.6362308459354846}
holds        false
domain       {"evidence":true,"rank":false,"supply":null,"band":true,"all":false}
rank of ASN-PLP in study order: 19 of 19
```

**`site/js/job/crew.js` reports this correctly and always has** — `alignmentFor().domain.rank` is
`false` on exactly this save, and `crew.js`'s own docstring has said since round 1 that the
unrestricted sentence is false. There is no code defect here. The defect is one paragraph of
`COMPOSED-GAME.md`, and it is R2, filed in round 1, re-filed in round 2, re-filed again below.
The save is now pinned in `tests/job-crew.test.mjs` §15 so the counterexample cannot be lost:

```
$ node --test tests/job-crew.test.mjs | grep -A3 'counterexample'
▶ J4 · 15 · r3: the hand-built counterexample to G3.8's alignment theorem
  ✔ the save really is inside BOTH restrictions the published paragraph carries
  ✔ THE FINDING: the game's best crew point is the study plan's LAST make, 19 of 19
  ✔ and the make the game points at has nothing left to study — it is already mastered
```

### Findings 2 and 4 — confirmed, and entirely inside `site/js/screens/`

```
$ grep -rn 'legalize\|crewDemotions\|COPY.crewDemoted' site/js/ | grep -v 'js/job/crew.js'
(no output — three greps, no callers)
$ grep -rn "allocate(" site/js/ | grep -v 'js/job/crew.js' | grep -v '^.*//'
site/js/job/state.js:1444:    const res = crew.allocate(unguard(s), actions.crew.make, actions.crew.rank);
```

`crewBlock` is rendered only at `screens/job.js:1116` inside the brief panel and lists
`crewOrder(s, { shape, of: onBoard })`; `screens/stats.js:294` `crewGrid` is a read-only `<table>`.
Both re-verified by reading the shipped source this round. The two false published sentences are
still there verbatim:

```
COMPOSED-GAME.md:189   "re-allocation is free and unlimited between jobs and inside every brief window"
site/js/screens/stats.js:321  'This allocation is over budget and the next job will legalise it.'
```

### Finding 3 — confirmed; the in-lane half is fixed, the data half is not this lane's

```
$ node scratchpad/crew-r3/band.mjs
RUNG_BANDS keys: [ '40', '60', '85' ]
m   0  dRhoTrue 0.1635  dRhoModel 0.2691  err  64.6%  floored true
m  20  dRhoTrue 0.1635  dRhoModel 0.2153  err  31.7%  floored true
m  40  dRhoTrue 0.1635  dRhoModel 0.1614  err  -1.3%  floored true
m  85  dRhoTrue 0.0325  dRhoModel 0.0404  err  24.2%  floored false
m 100  dRhoTrue 0.0325  dRhoModel 0.0000  err -100.0%  floored false
at m=100: crewValue 0   steadyValueTrue 0.7117
```

### Finding 5 — confirmed, reproduced from the shipped suite

```
$ J4_PRINT=1 node --test tests/job-crew.test.mjs | grep '^r13'
r13 RUN    | S 1.50 H 0.09 → STEADY (published STEADY)
r13 JOB    | S 3.33 H 0.25 → STEADY (published HELD)
r13 JOB12  | S 5.95 H 0.48 → STEADY (published HELD)
r13 VAULT  | S 6.44 H 0.40 → STEADY (published HELD)
```

The in-lane half was already done in r1/r2: `buildRowFor()` computes `winner` from the parameters
and carries `publishedWinner` / `agreesWithPublished` beside it, and §13's
*"THE ARGMAX, MEASURED: STEADY wins every shape — G2's flip structure does not survive"* asserts it.
What is left is `COMPOSED-GAME.md` G2/G8/G12 and `data/job.js CREW_MATRIX.rows` — R7 below.

## 1. What was fixed at the root, in this lane

### Finding 7 — G4's demotion now happens on the write, and the point it burned comes home

The mechanical half of G4 always worked: `effectiveRankOf` downgrades a lapsed HELD at READ time, so
the ladder never over-forgave. What did not work is everything else the rule promises — the save went
on storing a rank the gate had taken away, and the capacity point it cost was locked out of an
8-point L1 budget for as long as nobody called `legalize()`, which is **forever**, because nothing
under `site/js` calls it.

`allocate()` is the ONLY legal way `save.game.crew` ever changes (G2, and this file's own invariant),
so the repair now rides on it rather than waiting for a caller that does not exist:

* `canAllocate` prices the budget at `budgetFor().effectiveSpent` and reads `from` off the
  **effective** rank, so the lapsed point is spendable *immediately*, before any repair;
* `allocate` applies G4's lapsed-HELD demotions to the build it writes on every **successful** call,
  and returns them as `demotions` — the `{make, from, to, reason, fromName, toName}` rows
  `data/job.js COPY.crewDemoted` prints, handed to the caller instead of waiting for one;
* a **refusal** still returns the crew and the save byte-unchanged (the §4 property test's invariant
  is untouched and still asserted on all 10 000 calls) — `demotions` is reported there as data;
* `budgetFor` gained `effectiveFree = capacity − effectiveSpent`, the number a screen should print.

Measured on the critic's own save (`scratchpad/crew-r3/f7.mjs`, and `tests/job-crew.test.mjs` §15):

```
before:  spent 3  effectiveSpent 2  wasted 1  free 5  effectiveFree 6  lapsed ["FAC2"]
after ONE allocation through the only write path:
         demotions [{"make":"FAC2","from":2,"to":1,"reason":"not-mastered",…}]
         crew {"NOTE":1,"FAC2":1,"PAIRS":1}   spent 3  effectiveSpent 3  wasted 0
filling the build to the brim WITH the lapse still in place:
         manned 8  spent 8  capacity 8        ← all eight points reachable (was seven)
```

### Finding 3 — the band floor is now the FOURTH domain condition, not a loose measurement

r2 exported `BAND_FLOOR`, `dRhoTrue`, `isBandFloored` and `dRhoModelError` as *quantities* and left
`alignmentFor().domain` with three conditions. That was the defect the r3 critic named: the flat tail
below m = 40 breaks the theorem's crew row on a third of saves and was not in its domain.

* `alignmentFor().domain.band` — true iff **no candidate make sits at or below `BAND_FLOOR = 40`**
  (inclusive: `dRhoTrue(40) === dRhoTrue(0)`, so 40 is the clamp, not the first live point);
* `bandFloored` — the offenders, exactly parallel to `thinEvidence`;
* `bandFloor` — the constant, exactly parallel to `evidenceFloor`;
* `bandAgrees` — the measured consequence: `crewOrder(s)[0] === crewOrderTrue(s)[0]`;
* `crewOrderTrue(save, {shape, of})` — **new export**: `crewOrder` with `dRhoModel` replaced by the
  shipped band and nothing else changed. It is the ordering the game actually pays;
* `domain.all` is now the conjunction of all four.

```
$ J4_PRINT=1 node --test tests/job-crew.test.mjs | grep '^r3'
r3 band domain | crewOrder top != crewOrderTrue top on 115/300 = 38.3 %
```

Two docstring defects fixed with it: the `crewValue` header said the unrestricted theorem is false
*"in three separate ways"* and then listed **four**; and `tests/job-align.test.mjs`'s
*"at m = 100 the crew is worth nothing"* is true of `crewValue` (an ordering) and false of the game —
`bandFor` clamps at the TOP band too, so a mastered make is paid at the m85 rate. The assertion is
**kept** (it pins the ordering's own zero) and a second test now states the other half, so the pair
can never again be read as a claim about the payoff.

## 2. Suite state

```
$ node --test tests/job-crew.test.mjs tests/job-align.test.mjs
tests 158 · pass 158 · fail 0          (was 142 — crew 104→119, align 38→39)

$ node --test tests/job-align.test.mjs tests/job-crew.test.mjs tests/job-coldopen.test.mjs \
       tests/job-copy.test.mjs tests/job-econ.test.mjs tests/job-meta-constants.test.mjs \
       tests/job-exploit.test.mjs tests/job-index.test.mjs tests/job-state.test.mjs \
       tests/job-monotone.test.mjs tests/job-split.test.mjs tests/trophies.test.mjs
tests 606 · pass 606 · fail 0          (every other suite that imports crew.js)
```

`tests/job-copy.test.mjs`'s banned-phrase lint caught one of this round's new comments
(`site/js/job/crew.js → come back`) — a real catch on a retention phrase in a code comment. The
comment was reworded; that suite is green.

Other lanes were writing throughout: `site/js/job/state.js`, `guard.js`, `econ.js`, `board.js`,
`call.js`, `site/data/job.js`, `site/js/screens/job.js` and `COMPOSED-GAME.md` all changed between
20:02 and 20:07 while this pass ran. Failures seen in intermediate whole-suite runs and traced to
those lanes, **not to this one**: `tests/job-call.test.mjs` (its own file rewritten one second
before the run; it imports only `crew.bandFor` and `crew.drawRung`, and calls no function this
round touched — `grep -cE "allocate|budgetFor|alignmentFor" tests/job-call.test.mjs` → `0`),
`tests/job-ledger.test.mjs` ×2 (both assert a job does NOT yet write `runs[]`/`flawless-page`, and
the run lane has just made it do so), `tests/job-board.test.mjs`, `tests/job-save.test.mjs`,
`tests/job-debrief.test.mjs` ×2 (already failing on the **baseline** run before a line of this lane
was changed) and `tests/job-screen.test.mjs` (the Playwright layout walk).

## 3. Requests — the five findings this lane is forbidden to fix

**`COMPOSED-GAME.md` has no owning lane.** `notes/meta-fix.md` §1 declines it as "files owned by
lanes that were editing them during this round"; `notes/index-fix.md:70` declines it; this note
declined it in rounds 1 and 2. That is the structural reason three rounds of correct, paste-ready
requests have gone unapplied — not oversight by any one agent. **It needs an owner, or the composer
has to apply these directly.** R1/R2/R5/R7 stand exactly as re-filed above in the round-2 section;
the round-3 evidence for each is in §0 of this note. R8 is new.

### R8 (new · MAJOR) — `legalize()` and `COPY.crewDemoted` still have no caller (finding 7's other half)

`allocate()` now covers every crew change the STUDENT makes. G4 names two moments that carry no
allocation, and a line that must print. Both are outside this lane:

1. **`site/js/mock.js` / the mock submit path** — after `mock.submitRun` writes mastery, call
   `crew.legalize(save)` and keep its `changes`.
2. **the boss path** — after a boss KO/miss writes mastery, the same.
3. **`site/js/screens/run.js`** (the job debrief) and **Home's cold-crew strip** — render
   `crew.crewDemotions(save)` through `data/job.js COPY.crewDemoted`, which produces G4's exact
   published line: `FAC2 crew HELD → STEADY — the Mock says it is not held.`
4. **`site/js/screens/stats.js:321`** prints `'This allocation is over budget and the next job will
   legalise it.'` **Nothing legalises anything** — `startJob` does not call `legalize()`, and
   `allocate`'s new repair covers the lapsed-HELD case only, not an over-capacity build left by a
   unit handoff. Until (1)–(3) ship, that sentence must read something like:
   *'This allocation is over budget. Stand a make down in the next brief window to bring it back
   inside capacity.'*
5. **`site/js/screens/stats.js:315`** should print `budget.effectiveFree` beside `budget.free` (or
   instead of it) — `budgetFor` now returns it, and it is the number the student can actually spend.

### R9 (new · MAJOR) — `site/js/screens/job.js` `crewBlock`: the algebra is UI copy (finding 4)

`job.js:1204-1215` prints `ordered by w × (1 − m/100)` as a column label and
`a HELD point prices at 3.12 in the same units` as a sentence, on the one screen a fourteen-year-old
reads at 22:40 the night before a test. G6's promise for this layer is *"the driest possible
antagonist … because it is just his data"*, and the same panel's other four options are plain
English. Requested:

* label the column **`weakest first`** and move the formula to the Settings card that already prints
  every other one (`screens/settings.js`);
* replace the alignment sentence with the decision it is evidence for, or drop it — it names no
  action a player can take. If it stays, the honest short form is *"a mastered make would pay more
  here"* / *"your weakest make still pays most"*, which is `align.holds` in words;
* the per-row `m 40 · 3.12` is two numbers for one row — `crew.steadyValueOn(s, make, queue,
  {shape})` is what the point pays **on this board** and is 0 on 62 % of boards for the make the grid
  lists first. Printing a number that is not the payoff is the r2 finding wearing a different hat.

### R10 (re-filed · MINOR, unchanged) — `crewBlock` re-implements `encountersIn`

Unchanged from round 2. `crew.encountersIn(queue, make)` returns `{total, active, holdActive}`;
`crewBlock` computes `left`/`forgives` inline and the two can drift.

## 4. New exports (round 3)

```js
crewOrderTrue(save, { shape?, of? })      // the ordering the SHIPPED BANDS pay (dRhoTrue, not the model)
budgetFor(save, crew?) : { …r2 fields, effectiveFree }
crewDemotions(save, crew?)                // second argument is new; default unchanged
allocate(save, make, rank, opts?) : { …r2 fields, demotions }
alignmentFor(save, opts?) : { …r2 fields, domain: { …, band }, bandFloored, bandFloor, bandAgrees }
```

No signature was broken: `crewDemotions` gained an OPTIONAL second argument, `allocate` /
`budgetFor` / `alignmentFor` gained fields and removed none. `canAllocate`'s `from` and `spent` now
report the EFFECTIVE rank and spend, which is the finding-7 fix and is asserted in §15.

### The doc line numbers in the round-3 findings are already stale

`COMPOSED-GAME.md` was edited at 20:05 while this pass ran. Every one of the five sentences is still
published verbatim; only the line numbers moved. Re-grepped at 20:12:

```
$ grep -n "no step in the min-maxer" COMPOSED-GAME.md                → 579   (was 552 — G3.8, R2)
$ grep -n "Three states, two flips" COMPOSED-GAME.md                 → 250   (was 235 — G2,   R7)
$ grep -n "argmax of the 4×2 matrix is STEADY on RUN" COMPOSED-GAME.md → 900 (was 873 — G8,   R7)
$ grep -n "Two flips survive" COMPOSED-GAME.md                       → 995   (was 968 — G12,  R7)
$ grep -n "free and unlimited between jobs" COMPOSED-GAME.md         → 204   (was 189 — G2,   R8/R9)
$ grep -n "free and unlimited between jobs" site/js/screens/stats.js → 320
```

Whoever applies R1/R2/R5/R7 should grep for the SENTENCE, not the line.

## 5. Final suite state (20:20, with four other lanes still writing)

```
$ node --test tests/                                       # whole suite
fail 3 — tests/job-board.test.mjs:1499 · tests/job-screen.test.mjs:321 · :705

$ node --test <every test file that imports site/js/job/crew.js>   (18 files)
tests 934 · pass 932 · fail 2 — tests/job-save.test.mjs (written 20:18, mid-edit; the
   assertion is a scan of site/data/trophies.js and its line number moved 556→586 between two
   runs one minute apart)
```

**No failure anywhere is in this lane's files, and none is reachable from this round's changes.**
Proof, per failing file — the count of references to every function this round touched
(`allocate`, `canAllocate`, `budgetFor`, `alignmentFor`, `crewDemotions`, `crewOrderTrue`,
`effectiveFree`, `legalize`):

```
tests/job-board.test.mjs          0      a regex on the primary button's label
tests/job-call.test.mjs           0      imports only crew.bandFor / crew.drawRung (cleared by 20:20)
tests/job-meta-constants.test.mjs 0      source-text greps on screens/settings.js + stats.js (cleared)
tests/job-save.test.mjs           0      a scan of site/data/trophies.js
tests/job-screen.test.mjs         1      line 584, a source grep for `state.crew.alignmentFor(` — it PASSES;
                                         the two failures are :321 (COPY.evidence never printed) and
                                         :705 (the Playwright layout walk, already red on the baseline)
tests/job-debrief.test.mjs        —      both failures were red on the BASELINE run, before this lane
                                         changed a line; cleared by 20:20
```

`node --test tests/job-crew.test.mjs tests/job-align.test.mjs` → **158 pass, 0 fail**, on every run
of this pass.
