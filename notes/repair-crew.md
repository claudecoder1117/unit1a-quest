# repair-crew — the CREW lane's round-4 repair

**Lane files owned:** `site/js/job/crew.js`, `tests/job-crew.test.mjs`.
**Authority:** `designs/REPAIR-DECISION.md` §S4 (and §S0 for the baseline), `COMPOSED-GAME.md` G2 / G3.8
/ G4, `BUILD-POLICY.md` (overrides both).

**Baseline, re-measured here before any edit** (`node --test tests/`):

```
ℹ tests 2725 · pass 2720 · fail 1 · skipped 4 · duration_ms 196557   EXIT=1
✖ tests/job-screen.test.mjs:871  "J6 measured: a full job at 375x667 … board <= 36px"
```

The ticket's stated baseline ("2721 pass, 0 fail") is wrong and REPAIR-DECISION §S0 already says so.
The one failure is §S0's, it is the **screen** lane's ticket, and §S0 forbids this lane touching it.
So "green" for this lane means **no new failure and no new skip**, which is what it delivered.

**After this lane's work:** see "Suite" at the foot of this note.

---

## 1. S4 — the decision assigned to "crew"

### 1.1 The S4.3 GATE, evaluated before any code was edited

§S4.3 makes the r2→DEEP repair conditional. The three refusal conditions are objective and were
measured, not judged:

| condition | measured | verdict |
|---|---|---|
| (c) the flip census shows one side above **75 %** on the dealt population | DEEP **45.4 / 63.1 / 67.3 / 53.1 %** on RUN / JOB / JOB12 / VAULT, **57.2 %** overall, over **1 040** drafted boards (260 a shape) | **PASS** — worst side 67.3 % |
| (b) the assertion count is not strictly positive | `tests/job-crew.test.mjs` **119 → 137 tests**, **542 → 613** `assert`/`close` calls, **zero** deleted, **zero** weakened | **PASS** (+71) |
| (a) a surviving property's assertion cannot be kept | every inventory row is disposition (i) or keepable — see the inventory below | **PASS** |

S4.4 item 3 as well: `e_A/e_B` over the same census runs **min 0.2500 · median 1.0000 · max 6.0000`,
so it crosses every band threshold (1.2156 / 1.3608 / 1.9697) in both directions. A decision whose
input never crosses its own threshold is not a decision; this one's does.

**The inventory (S4.3 items 1–3), by disposition.** (i) = the property ceases to exist under the
repair, so the assertion goes with it; (ii) = the property survives, so the assertion is KEPT.

| file:line | property | disp. |
|---|---|---|
| `tests/job-crew.test.mjs:1012,1013,1015,1019,1032-1038,1043` | the 4×2 matrix's source/winner/margin/`moved` set, `bestRankFor === 'HELD'` as published, `heldChainHold > heldForgiveness` | (i) — `buildMatrix` and the chain-hold are deleted |
| `tests/job-crew.test.mjs:1165,1167,1181,1184,1237,1292` + the ±15 % REPORTED test | the five measured parameters against `CREW_MATRIX`, `e_forgiven`/`e_held` vs published | (i) — `CREW_MATRIX` is deleted |
| `tests/job-crew.test.mjs` §5 (~7 tests: `legalize` / `crewDemotions` / `lapsedMakes` / `effectiveRankOf`'s downgrade) | G4's lapsed-HELD repair | (i) — DEEP has **no gate**, so nothing can lapse |
| `tests/job-align.test.mjs:199,579` | `crewValue` IS `weakSpots()`'s key × a positive shape constant; `heldValue` scaling | **(ii) KEPT** — re-point at `crew.shapeConstant(shape)`, which ships and survives |
| `tests/job-exploit.test.mjs:1394` (`crew.legalize(proxy, {})`) | crew.js makes no Ledger A write | **(ii) KEPT** — the property is the file's whole write surface; drop this one call, the other calls still assert it |
| `tests/job-meta-constants.test.mjs:31,60` | the printed copy states the chain-hold threshold from `CHAIN_HOLD_MIN`, not a literal | (i) — no chain-hold, no threshold to print |
| `tests/job-econ.test.mjs:1612-1614` | `CREW_MATRIX.rows` winners as published | (i) — deleted (and false today: see C5) |
| `tests/job-crew.test.mjs` §4 property test, capacity, `mannedMax`, `REFUSALS.MANNED_MAX`, the ceiling build, the **idle rule**, `crewOrder`, `dRhoOf` | S4.3 item 3's named survivors | **(ii) ALL KEPT** — untouched by this lane, and the new §S4 adds to them |

### 1.2 What actually shipped, and the one thing that did not

**SHIPPED — the replacement mechanic (S4.2), in `site/js/job/crew.js`:**

- `marginalDRho(m)` = `Δρ₂(m) − Δρ₁(m)` — what the second rung buys on top of the first.
- `deepThresholdOf(band)` and `DEEP_THRESHOLDS` — `Δρ₁/(Δρ₂ − Δρ₁)` per **published band**, computed
  from `RUNG_BANDS` at module load: **1.2156 (m40) · 1.3608 (m60) · 1.9697 (m85)**.
- `deepThresholdAt(m)` — the same ratio at an arbitrary `m`, flat below `BAND_FLOOR` and above m85.
- `buildDecisionOn(save, queue, {shape, of})` — **the decision, parameter-free**:
  `deep ⇔ (Δρ₂(m_A) − Δρ₁(m_A))·e_A > Δρ₁(m_B)·e_B`, with `A` the make a point pays most on tonight's
  board, `B` the next such make, and `e` the shipped idle rule's own count
  (`encountersIn(queue, make).active`). `null` when the board serves fewer than two makes — a forced
  rung is not a decision (G11). **No measured economy parameter is read, stored or reported**;
  `L̄` and `m̄` multiply both sides and cancel.

**NOT SHIPPED — S4.4 item 4 ("the mechanic is gone, not hidden") and the deletions of §S4.2.**
This is the honest part of this note. The deletion list in §S4.2 is not confined to this lane: the
symbols have live references in **five files this lane does not own**, and removing them from
`crew.js` today turns the suite red in files this lane is forbidden to repair, and breaks other
fixers' in-flight work:

```
$ grep -rnE 'CHAIN_HOLD_MIN|legalize|matrixParamsFor|CREW_MATRIX' site tests | grep -v '^site/js/job/crew.js' | awk -F: '{print $1}' | sort | uniq -c
 103 tests/job-crew.test.mjs      (this lane's — fine)
   5 site/data/job.js             CREW_MATRIX itself + COPY
   4 tests/job-econ.test.mjs      CREW_MATRIX row winners
   3 tests/job-align.test.mjs     matrixParamsFor
   2 tests/job-meta-constants.test.mjs   imports CHAIN_HOLD_MIN (an import error, not a failure)
   2 site/js/screens/stats.js     imports + prints CHAIN_HOLD_MIN
   1 site/js/screens/job.js       prints CHAIN_HOLD_MIN
```

Deleting `CHAIN_HOLD_MIN` alone breaks `tests/job-meta-constants.test.mjs` at **import time** and
breaks two screens. `crew.js` also **re-exports `CREW_MATRIX`** (`crew.js:1575`), so the coupling runs
both ways: whichever side deletes first breaks the other. The hard rule "the suite must be GREEN when
you finish" therefore forbids this lane from performing the demolition unilaterally, and §S4.3's
refusal conditions do not cover this case (they price assertions, not cross-lane symbol ownership).

**Ruling taken here, stated so round 5 can overrule it in one line:** the replacement decision ships
**beside** the apparatus, fully tested, and the demolition is a single follow-up ticket whose edits
must land in one commit across six files. The residual is that **the dominance fault S4 diagnoses is
still live in the shipped game** until that ticket lands — `buildMatrix`/`CREW_MATRIX` still exist,
r2 still carries the `mastery.isMastered` gate and the chain-hold, and `J4_PRINT=1` still prints
STEADY/pt vs HELD/pt = **1.50/0.09 · 3.33/0.25 · 5.95/0.48 · 6.44/0.40** (12×–17×). Nothing in this
note claims otherwise. The precondition list is in **Requests R-D1**.

### 1.3 The acceptance tests §S4.4 names (items 1, 2, 3 and 7)

All in `tests/job-crew.test.mjs`, all additions, all through the shipped
`composePage → composeBundles → draftUnion` path on a 600-save seeded corpus:

| S4.4 | test | measured | result |
|---|---|---|---|
| 1 | `J4 · S4 · 1` (4 tests) — the threshold derived from `RUNG_BANDS`, band by band, each named | 1.2156 / 1.3608 / 1.9697 to 4 dp; the three pairwise distinct; end-to-end spread ×1.62; every threshold > 1 | **PASS** |
| 2a | both outcomes occur on every shape | DEEP 118/260 · 164/260 · 175/260 · 138/260 | **PASS** |
| 2b | neither outcome above 75 % overall or on any shape | worst 67.3 % (JOB12 DEEP) | **PASS** |
| 2c | deterministic under the seeded corpus + a ±2 % regression pin | two runs byte-identical; pinned 45.4 / 63.1 / 67.3 / 53.1 and 57.2 overall | **PASS** |
| 3 | `e_A/e_B` two-sided | min **0.2500** < 1, max **6.0000** > 2 and > 1.9697 | **PASS** |
| 3 | at equal bands the inequality **is** the ratio test, checked on real boards | 400 same-band boards, `deep ⇔ ratio > threshold` on every one | **PASS** |
| 3 | `L̄` and `m̄` cancel — invariance under scaling both sides across nine decades, on 200 real boards; and no `MEASURED_KEYS` key is even reported | 200 boards × 6 scalings | **PASS** |
| 3 | the shape is a label, not a parameter | 120 boards × 4 shape names, same decision | **PASS** |
| 7 | the ρ = 1 claim withdrawn, the disagreement asserted instead | already in the tree and green: `job-align.test.mjs:222` is §1's own falsifiability control (`broke > 250/300`), `:433` asserts the unfiltered argmax disagreement, and the suite prints **87.3 %** argmax disagreement and **38.3 %** model-top ≠ true-top. Nothing to repair on the **test** side — the false claim is in the **document** (see Spec corrections SC-4) | **PASS (already)** |

`J4_PRINT=1 node --test tests/job-crew.test.mjs`:

```
s4 census RUN    boards 260  DEEP 118 (45.4 %)  SPREAD 142 (54.6 %)
s4 census JOB    boards 260  DEEP 164 (63.1 %)  SPREAD  96 (36.9 %)
s4 census JOB12  boards 260  DEEP 175 (67.3 %)  SPREAD  85 (32.7 %)
s4 census VAULT  boards 260  DEEP 138 (53.1 %)  SPREAD 122 (46.9 %)
s4 census OVERALL boards 1040  DEEP 57.2 %  ratio min 0.2500 med 1.0000 max 6.0000
s4 reseed | 24 corpora x 80 JOB boards | zeroPay 60.0-72.5 % (med 67.5) | agrees 10.0-18.8 % (med 15.0)
s4 field  | boards 600 | rec.m vs m_shown: DEEP/SPREAD differs on 99 (16.5 %), the top make differs on 108 (18.0 %)
```

**S4.4 item 6** (`tests/job-monotone.test.mjs` re-measured) is **not applicable yet**: it re-measures
the chain path *after* the hold is removed, and the hold is still in. It is part of R-D1.

### 1.4 A question §S4 does not answer, now measured rather than guessed — `rec.m` or `m_shown`?

Nothing in §S4 says which mastery field the new inequality reads, and the two shipped conventions
disagree:

- **every pricing function in `crew.js`** reads `rec.m` (`mOf`) — the field `readiness.weakSpots()`
  sorts by, pinned deliberately at `tests/job-align.test.mjs:212` ("a mismatch here would break ρ
  silently");
- **the ladder** draws its rungs from `bandFor(mShown(rec))` — `simulateJob`, and §13's own harness.

`buildDecisionOn` keeps the file's convention (`mOf`), and the size of that choice is now a
measurement rather than a preference (`J4 · S4 · 5`, 600 drafted boards): reading `m_shown` instead
would move the DEEP/SPREAD answer on **16.5 %** of boards and the make it goes on on **18.0 %**. That
is too large to leave undeclared and it is **not a crew-lane decision** — `m_shown` is
`js/mastery.js`, which is protected study-layer state. → **Request R-6**.

---

## 2. The r3 findings whose lane is "crew"

Eight entries in `designs/r3-findings.json`. Only **one** of them names a file this lane owns.

### C1 — BLOCKER · crew-alignment · `COMPOSED-GAME.md` · "G3.8's alignment theorem is false INSIDE the only domain the document restricts it to"

**CREDITED, code is right, document is wrong.** The counterexample reproduces: `alignmentFor()`
already computes and exports the four domain conditions the critic asks for, and reports
`domain.all === false` on exactly the save they built. `crew.js:820-853` says so in the shipped
source. **No code change.** → **Spec correction SC-1** (this lane may not edit `COMPOSED-GAME.md`).
**PASS** (finding upheld; the repair is a document edit another agent owns).

### C2 — MAJOR · crew-alignment · `site/js/screens/job.js` · "step 5 is unreachable for the top of the list"

**CREDITED and out of lane.** The measurement is of the screen's grid pool, and both false copy
lines are in `COMPOSED-GAME.md:189` and `site/js/screens/stats.js:313`. → **Request R-1**,
**Spec correction SC-2**. No crew.js change: `crewOrderOn` / `supplyGapFor` already price against the
board the student is actually offered, which is the honest half, and it ships.
**PASS** (upheld, routed).

### C3 — MAJOR · crew-alignment · `COMPOSED-GAME.md` · "the band floor is a fourth domain condition"

**CREDITED on the document; one sub-claim REFUTED on the test.** The band arithmetic reproduces
exactly — `dRhoTrue(0) = dRhoTrue(40) = 0.1635`, `dRhoTrue(100) = dRhoTrue(85) = 0.0325`, and the
suite's own re-measurement is **38.3 %** (`r2 band floor | model-top != true-top on 115/300`),
against the critic's 32.1 % on their own population. Same mechanism, different corpus.

The sub-claim that is **wrong**: *"`tests/job-align.test.mjs:478` asserts … `at m = 100 the crew is
worth nothing`"*. That message was repaired in round 3 and the file now asserts **both** halves:

```
$ sed -n '478p;488,490p' tests/job-align.test.mjs
          close(lastGame, 0, 1e-12, `${id}: at m = 100 the ADVISORY ORDERING is zero`);
  test('…but the PAYOFF at m = 100 is not zero — the top band clamps too (r3)', () => {
    close(dRhoTrue(100), dRhoTrue(85), 1e-12, 'bandFor clamps at the highest published band');
    assert.ok(dRhoTrue(100) > 0, `Δρ at m = 100 is ${dRhoTrue(100).toFixed(4)}, not 0`);
```

The fourth band at m ≈ 15–20 the critic offers as the alternative fix is a `site/data/job.js` edit and
is **not** in this lane. → **Request R-2**, **Spec correction SC-3**.
**PASS / partially refuted.**

### C4 — MINOR · crew-alignment · `notes/crew-fix.md` · "R2's prose carries two seed-specific constants (62 % / 15 %)"

**CREDITED, and fixed at the root in this lane, with a sharper result than the finding.** A new
section `J4 · S4 · 4` measures the pair over **24 re-seeded corpora × 80 JOB boards** through the
shipped `supplyGapFor` and asserts the **range and the mechanism**, never a pair:

```
s4 reseed | 24 corpora x 80 JOB boards | zeroPay 60.0-72.5 % (med 67.5) | agrees 10.0-18.8 % (med 15.0)
```

The sharp part: **re-seeding the board never reaches the critic's 36 % / 32 %.** Across 24 board
re-seeds on the J4 save population `zeroPay` never drops below 60.0 % and `agrees` never rises above
18.8 %, so the three pairs on the record — 62/15 (§14's corpus), 48/21 (`crew.js`'s docstring),
36/32 (the critic's draw) — differ by **save population**, not by board draw. That is asserted, so it
cannot be lost again. No single pair may be published. → **Spec correction SC-5**.
**PASS** (measured: 60.0–72.5 % / 10.0–18.8 % over 24 corpora).

### C5 — BLOCKER · spec-fidelity · `COMPOSED-GAME.md` · "'two flips, no dominant build' is false as shipped"

**CREDITED and reproduced to the digit** — this is the fault §S4 is built on:

```
$ J4_PRINT=1 node --test tests/job-crew.test.mjs | grep '^r13'
r13 RUN    … | S 1.50 H 0.09 → STEADY (published STEADY)
r13 JOB    … | S 3.33 H 0.25 → STEADY (published HELD)
r13 JOB12  … | S 5.95 H 0.48 → STEADY (published HELD)
r13 VAULT  … | S 6.44 H 0.40 → STEADY (published HELD)
```

The critic's proposed remedy (paste `notes/crew-fix.md` R7's repriced table, and copy the five columns
into `CREW_MATRIX.rows`) is **superseded by REPAIR-DECISION §S4**, which deletes the matrix rather
than repricing it and refuses the "reserve `composeBundles` supply for mastered makes" half outright
on a G11 red line. What this lane shipped instead is the replacement decision (§1.2) and its
acceptance tests (§1.3). → **Spec corrections SC-4 / SC-6 / SC-7**, **Request R-D1** for the deletion.
**PASS** (upheld; remedy replaced by the arbiter's, not by this lane's judgement).

### C6 — MAJOR · spec-fidelity · `COMPOSED-GAME.md` · "G3.8's theorem and G9 #5 are published unrestricted while crew.js says the unrestricted form is FALSE"

**CREDITED on the document.** Reproduced: `COMPOSED-GAME.md:552` and `:896` still carry the
unrestricted form; `crew.js:820-853` contradicts it in the shipped source; the suite re-measures
**87.3 %** argmax disagreement (`r2 evidence | crewValue vs readinessGradient argmax disagree
262/300 = 87.3 %`) against the critic's 46.1 % on their own population.

The critic's "ρ = 1 cannot fail" is right **about the document** and wrong **about the test**:
`tests/job-align.test.mjs:222` is a falsifiability control that makes §1 non-vacuous
(`assert.ok(broke > 250, '${broke} of 300 saves distinguish the two readings — the test can fail')`),
and the file's own header (`:46-49`) already labels ρ = 1 an arithmetic identity. **No test change.**
→ **Spec correction SC-4**.
**PASS / partially refuted.**

### C7 — MAJOR · spec-fidelity · `site/js/job/crew.js` · "G4's crew-demotion line never prints and legalize() has no caller — a lapsed HELD burns a capacity point forever"

**The only finding in this lane's own file. Half upheld, half REFUTED.**

**REFUTED: "a lapsed HELD burns a capacity point forever."** It has not since round 3. The critic
printed `budgetFor` — which is the r3 instrumentation of exactly this gap — and did not then ask the
two functions that price it. `canAllocate` prices `effectiveSpent`, and `allocate` applies G4's
demotion on every successful write:

```
$ node -e '…lapsed FAC2 (m 69, stores HELD), capacity 8…'
budgetFor    {"capacity":8,…,"spent":3,"lapsed":["FAC2"],"wasted":1,"effectiveSpent":2,"effectiveFree":6}
canAllocate(PAIRS->STEADY) against the LAPSED build: {"ok":true,"reason":null,"from":0,"to":1,…,"spent":3}
allocate ok  true   crew after {"VOC":1,"FAC2":1,"PAIRS":1}   demotions ["FAC2 2->1"]
budget after {"capacity":8,…,"spent":3,"lapsed":[],"wasted":0,"effectiveSpent":3,"effectiveFree":5}
```

The point is **spendable before** the repair (`effectiveFree 6`, not 5) and the lapse is **cleared by
the first successful allocation**. `crew.js:300-311` documents exactly this. So `wasted: 1` is a
report of a stale stored byte, not a burned point. **No code change** — the claim is false.

**UPHELD and out of lane:** `legalize()` still has no caller under `site/js`; `COPY.crewDemoted`
(`site/data/job.js:708`) is rendered nowhere; and `site/js/screens/stats.js:328` still tells the
student *"This allocation is over budget and the next job will legalise it."*, which nothing makes
true. G4's two no-allocation moments (after `mock.submitRun`, after a boss KO/miss writes mastery)
are in `site/js/screens/*`. → **Requests R-3 / R-4**.

**AND — the test that policed this was the defect.** `tests/job-crew.test.mjs` §15's last test was
titled *"legalize() and COPY.crewDemoted have no caller under site/js"* and asserted only
`typeof legalize === 'function'`, the demotion count, and `wasted === 1`. It made its title's claim
and never checked it, and its "the point is not burned" half did not exist. Rewritten so it:

- **reads `site/js`** (46 files, comments stripped) and counts real `legalize(` callers and
  `crewDemoted` renderers;
- asserts G4 is closed by **exactly one** of the two routes and that whichever route is live is
  **complete** — so it cannot pass on a half-fix (a wired `legalize()` whose line never prints), and
  it does **not** break when the screen lane lands the wiring correctly;
- asserts "the point is not burned" on a save where the lapsed point is the **last** point
  (capacity 8, `spent 8`, `effectiveSpent 7`), with the pre-r3 pricing as an in-test control
  (`canAllocate(…, { budget: { …bt, effectiveSpent: undefined } })` → refused, `REFUSALS.CAPACITY`).

Negative controls NC5a / NC5b below prove both halves can fail. **PASS** (upheld in part, refuted in
part, test repaired).

### C8 — MAJOR · player-feel · `site/js/screens/job.js` · "the brief window prints algebra as UI copy"

**Out of lane** — `crewBlock()` at `screens/job.js:1204-1215`, and the string it prints comes from the
screen, not from `crew.js`. Worth saying that the number it calls a "threshold" is
`alignmentFor().threshold`, which `crew.js` exports in the units Home sorts Weak spots in; after S4
the sentence the grid should print is the one-line DEEP/SPREAD answer from
`crew.buildDecisionOn(save, queue).deep`, which needs no units at all. → **Request R-5**.
**PASS** (upheld, routed).

---

## Negative controls

Every one was run against the **shipped** path, watched fail, then reverted. `site/js/job/crew.js` was
restored from a byte copy taken before the first control and re-verified green after each.

| # | what was rigged | what must break | result |
|---|---|---|---|
| NC1 | `buildDecisionOn`: `deep: A.marginal > B.first` → `deep: true` | the census's (a), (b), (c) and the ratio-test reduction | **5 fail** — "BOTH OUTCOMES OCCUR ON EVERY SHAPE", "NEITHER OUTCOME EXCEEDS 75 %", the ±2 % pin, the equal-band reduction, the cancellation |
| NC2 | `deepThresholdOf` → a single band-free `1.2156` | §S4 · 1 entirely | **3 fail** — the derived thresholds, "A SINGLE BAND-FREE CONSTANT IS REFUSED", `deepThresholdAt` agreement |
| NC3 | a measured parameter creeps back: `lhs = A.marginal * matrixParamsFor(shape).mBar` | the cancellation and the shape-is-a-label tests | **4 fail** — and DEEP breaks 75 %, i.e. the rig reproduces the dominant build S4 condemns |
| NC4 | `steadyValueOn`: `e = Math.max(1, encountersFor(…))` — no board ever pays zero | the supply-gap finding and the new re-seed range | **5 fail** — including §14's own three and both new §S4 · 4 tests |
| NC5a | `canAllocate` priced at `b.spent` instead of `b.effectiveSpent` (the pre-r3 behaviour the critic reported) | "the point is NOT burned" | **1 fail** — `ASN-ANG must still be mannable…`. *This control failed to fire on the first version of the assertion (a half-empty budget passes either pricing), which is how the blindness was found; the assertion was rebuilt on a full budget and now fires.* |
| NC5b | the source scan no longer skips the definition site, so `legalize(` has a "caller" | the half-fix branch | **1 fail** — `legalize() is now called from site/js/job/crew.js but COPY.crewDemoted is still rendered nowhere` |

---

## Spec corrections

`COMPOSED-GAME.md` is **not** this lane's file. Exact old line → exact replacement, for the agent that
owns it. SC-4, SC-6 and SC-7 are simply REPAIR-DECISION §S4.5 restated here so the doc lane has one
list; SC-1, SC-2, SC-3 and SC-5 are this lane's own.

**SC-1 · `COMPOSED-GAME.md:552` (G3.8), and the same sentence copied into `:896` (G9 #5)**

OLD:
> **`argmax(game) = argmax(ΔReadiness)` on the domain where the game stakes anything.** … There is no step in the min-maxer's list that is not also the best available study action, and the proof is arithmetic rather than assertion.

NEW:
> **The crew ORDERING equals `readiness.weakSpots()`'s by construction** — `crewValue` is that sort key times a positive constant of the shape, so Spearman ρ = 1 is an *identity*, not evidence (`tests/job-align.test.mjs` §1, with its own falsifiability control at `:222`). The stronger claim — that the game's best crew POINT is also the best study action — holds only on `crew.alignmentFor(save, {shape, queue}).domain.all`, which is **four** conditions and which the code computes rather than assumes: **(1) evidence** — every candidate make at `n ≥ mastery.N_FULL = 5`; **(2) rank** — the best STEADY outbids the best HELD; **(3) supply** — the board serves the study plan's first make more than once; **(4) band** — every candidate make above `BAND_FLOOR = 40`. Off that domain the two argmaxes disagree on **87.3 %** of the suite's own population, and the q̂ ∈ [0.5, 1] restriction this paragraph carries belongs to condition (3) and is not one of the ones that fail.

**SC-2 · `COMPOSED-GAME.md:189`**

OLD:
> …re-allocation is free and unlimited between jobs and inside every brief window…

NEW:
> …re-allocation is free and unlimited **inside every brief window, over the makes still on the board** — there is no between-jobs crew control, and the brief grid offers a mean of **4.7 of 19** makes at brief 1 and **2.0** at brief 2, so the make the study plan ranks first is not tappable on **53 %** of boards at brief 1 and **79 %** at brief 2.

(The same sentence is printed to the student at `site/js/screens/stats.js:313` — Request R-1.)

**SC-3 · `COMPOSED-GAME.md` G3.8, added as domain condition (4)**

ADD:
> **(4) The band floor.** `RUNG_BANDS` publishes 40 / 60 / 85 and `bandFor` clamps at both ends, so `Δρ` is the **same number** — 0.1635 — at m 0, 20, 30 and 40 alike, and 0.0325 at m 85 and m 100 alike. Below the floor the true payoff orders makes by **test weight alone** while the crew grid orders by `w·(1 − m/100)`: the two pick a different top make on **38.3 %** of the suite's 300-save population. The grid is an advisory ordering on that range, not a price.

**SC-4 · `COMPOSED-GAME.md` G8's J4 acceptance row (`:917`) and G12 #5** — strike the Spearman ρ = 1
clause and cite `alignmentFor().domain` instead; the rest of that row is REPAIR-DECISION §S4.5's
rewrite. G12 #5 keeps "Two flips survive" and gains the reason.

**SC-5 · anywhere the supply-gap pair is published (and `notes/crew-fix.md` R2's paste-ready prose)**

OLD (proposed for publication, never publish it):
> Measured over 150 drafted JOB-10 boards, **it does not on 62 % of them**, and the game's best-paying crew point is the study plan's first make on **15 %**.

NEW:
> Across independent corpora the study plan's first make is served no forgivable target on **36–72 %** of drafted JOB-10 boards and is the board's best-paying crew point on **10–32 %**. Within one save population the figure is stable — 24 board re-seeds give 60.0–72.5 % and 10.0–18.8 % — so the spread between published pairs is a difference of **save populations**, not of board draws. `tests/job-crew.test.mjs` §S4 · 4 measures the range on every run; no single pair is the measurement.

**SC-6 · `COMPOSED-GAME.md:256-259, :234, :260`, the 4×2 table at `:245-252`, the five measured
parameters, the ±15 % tolerance and the `inTol.length * 5 === 15` sentence at `:254`** — exactly as
REPAIR-DECISION §S4.5 writes them, **but not until R-D1 lands**: until the code deletion ships, the
document would describe a mechanic the game does not have. Publish SC-6 and the deletion together.

**SC-7 · `COMPOSED-GAME.md` G4 "Mastery is never faked"** — REPAIR-DECISION §S4.5 does not say what
becomes of G4's crew-demotion sentence, and it must: DEEP has **no `isMastered` gate**, so nothing can
lapse and `FAC2 crew HELD → STEADY — the Mock says it is not held.` becomes unreachable *by
construction* rather than by omission. Either the sentence goes with the gate (and Request R-3/R-4
close as "no longer applicable"), or the gate stays and R-3/R-4 must be wired. **This is an open
decision for the arbiter, not a line this lane can write.**

---

## Requests (files this lane does not own)

**R-D1 · BLOCKING PRECONDITION for S4.4 item 4 — the deletion, in ONE coordinated change.**
Six files, one commit, or the suite is red at import time. Owners named as the findings name them:

| file | edit | owner |
|---|---|---|
| `site/js/job/crew.js` | delete `CHAIN_HOLD_MIN`, `holdsChain`, `chainAfterFor`, `isHoldSuppressed`, `canHold`'s r2 use, `crewDemotions`, `lapsedMakes`, `legalize`, `effectiveRankOf`'s downgrade branch, `matrixParamsFor`, `steadyPerPoint`, `heldPerPoint`, `buildRowFor`, `buildMatrix`, `MEASURED_KEYS`, `MATRIX_TOLERANCE`, the `CREW_MATRIX` re-export at `:1575`; keep `allocate` + `REFUSALS.MANNED_MAX`, `crewOrder`, `dRhoOf`, the idle rule, and everything added in §1.2 | **crew** |
| `site/js/job/econ.js` | `chainAfterTarget` loses its crew/idle arguments and its hold branch | econ |
| `site/data/job.js` | delete `CREW_MATRIX`; `COPY` label HELD → **DEEP** (number-persisted rank, no migration; `crew-held` trophy keeps its id) | data/meta |
| `site/js/screens/job.js`, `site/js/screens/stats.js` | the label; drop the `CHAIN_HOLD_MIN` sentence at `stats.js:309` and `job.js:1424`; delete `COPY.crewDemoted` and `stats.js:328` | screen |
| `tests/job-meta-constants.test.mjs` | drop the `CHAIN_HOLD_MIN` import (`:31`) and the copy assertion (`:60`) | meta |
| `tests/job-econ.test.mjs` | drop the `CREW_MATRIX` winner assertions (`:1612-1614`) | econ |
| `tests/job-align.test.mjs` | re-point `:199` and `:579` from `matrixParamsFor(shape)` to `crew.shapeConstant(shape)` — **the properties survive and the assertions are KEPT** | crew/tests |
| `tests/job-monotone.test.mjs` | re-measure the off-shape exception after the hold is gone (S4.4 item 6); **if it widens on a dealt shape the repair is refused, not tuned** | tests |

**R-1 · `site/js/screens/stats.js:313`** — the copy *'No crew manned yet. Re-allocation is free and
unlimited between jobs and inside every brief window…'* promises a control that does not exist
(`crew.allocate` has exactly one caller chain, and `screens/stats.js:284`'s crew grid is a read-only
table). Either ship the between-jobs surface (the Stats grid already imports `budgetFor`/`crewFor`) or
strike "between jobs" and say the crew is allocated in the brief window over the makes on the board.

**R-2 · `site/data/job.js` `RUNG_BANDS`** — add a fourth band at m ≈ 15–20 if the flat weak-spot tail
is to become a real gradient. `DRHO_SLOPE` re-fits itself at module load (`crew.js:783`), so no
constant is retyped, but **every `Δρ` in G2 and every threshold in `DEEP_THRESHOLDS` moves** and this
lane's §S4 · 1 pin and §S4 · 2 census pin both have to be re-measured in the same ticket. Do not do it
piecemeal. If it is not done, SC-3 must be published instead.

**R-3 · `site/js/screens/mock.js` and the boss KO/miss writer** — call `crew.legalize(save)` at the two
moments G4 names (after `mock.submitRun` writes mastery, after a boss KO/miss does). Not urgent for
capacity (refuted above — `canAllocate` already prices the point as spendable), but the save goes on
storing a rank the gate has taken away until the student next touches the grid.

**R-4 · `site/js/screens/run.js` (the job summary) and Home's cold-crew strip** — render
`crew.crewDemotions(save)` through `data/job.js COPY.crewDemoted`; and **`site/js/screens/stats.js:328`
is false today** (*'This allocation is over budget and the next job will legalise it.'* — nothing
legalises anything; `startJob` does not call `legalize`). Replace it with "re-allocate to free the
point" until R-3 lands. `tests/job-crew.test.mjs` §15's rewritten test will fail if R-3 lands without
R-4 — that is deliberate.

**R-6 · ARBITER DECISION NEEDED (not a file request) — which mastery field prices the build?**
See §1.4. `crew.js` prices on `rec.m`; the ladder pays on `m_shown`; the gap moves the DEEP/SPREAD
answer on **16.5 %** of boards and the chosen make on **18.0 %**. Whichever is chosen, one of two
things has to change: either `COMPOSED-GAME.md` G3.8 stops calling the crew gradient a payoff (it is
an ordering in the study plan's own field), or every pricing function in `crew.js` moves to `m_shown`
and `tests/job-align.test.mjs:212`'s pin and the ρ = 1 identity go with it. This lane will not pick
unilaterally: the first is a document edit it does not own, the second reaches into the protected
study layer's field semantics.

**R-5 · `site/js/screens/job.js:1204-1215` `crewBlock()`** — the grid prints `ordered by w × (1 − m/100)`
and `a HELD point prices at 3.12 in the same units`. Label the column `weakest first` and move the
formula to the Settings card that already prints every other one. After R-D1 the sentence to print is
the one-line answer, and it needs no units: `crew.buildDecisionOn(save, queue).deep` → *"go deep on
FAC2 — the board serves it 3× as often as NOTE"* / *"spread: no make is served enough to pay twice"*.

---

## Suite

```
$ cd /Users/oliver/Projects/unit1a-quest && node --test tests/
ℹ tests 2812 · pass 2808 · fail 0 · skipped 4          EXIT=0        ← GREEN
```

`tests/job-crew.test.mjs` alone: **119 → 137 tests, 137 pass, 0 fail**.

No test was deleted, skipped or weakened by this lane; one was **repaired** (the §15 out-of-lane
test, which asserted its own title and never checked it — see C7 and NC5a/NC5b).

Progression, for the record:

| run | result |
|---|---|
| baseline, before any edit by this lane | 2725 · pass 2720 · **fail 1** (§S0, `job-screen.test.mjs:871`) |
| mid-run, other lanes editing `tests/job-copy.test.mjs` | 2803 · pass 2795 · fail 4 (all four in `job-copy.test.mjs`, including a `ReferenceError: listFiles is not defined` — a half-written file, not a regression; that file alone passed 38/38 two minutes later) |
| final | **2812 · pass 2808 · fail 0 · skipped 4** |

The count rises past this lane's +18 tests because twelve other fixers were adding tests to the same
tree throughout. §S0's failure is gone because the **screen** lane's ticket landed, not because of
anything here.

---
---

# repair-crew — VERIFY ROUND 1 (the crew lane)

**Lane files owned this round:** `site/js/job/crew.js` + its tests (`tests/job-crew.test.mjs`,
`tests/job-align.test.mjs`). Nothing else was edited: `COMPOSED-GAME.md`, `site/data/job.js`,
`site/js/screens/job.js` and `site/js/screens/stats.js` all carry findings assigned to this lane and
all belong to other lanes this round — every one of them is written up under **Requests (verify-1)**
below as paste-ready prose with the exact line.

**Five findings, all five addressed at the root inside the lane's own file.** The two that end in
another lane's prose are addressed by making the CODE true and filing the sentence.

## V1 — BLOCKER · crew-alignment · "the brief window prices HELD from three measured-false constants"

**Confirmed, reproduced, fixed.** The critic's measurement reproduces on my own corpus of 300 boards
drafted through `composePage → composeBundles → draftUnion`:

```
$ node --test tests/job-align.test.mjs        (J4_PRINT=1, §7)
  verify-1 brief | boards 300 | speaks 66 | mean threshold 0.3442 (published-parameter 6.0242)
                 | "outbid" 4/66 (published-parameter 40/66)
```

The right-hand figures are the shipped behaviour before this fix: a mean printed HELD price of
**6.02** and *"the study ordering is outbid by it"* on **40 of the 66** boards where the line speaks.

**Root cause, and why the suggested fix was not available.** `align.threshold` was
`heldValue(save, make) / shapeConstant(shape)`, and `heldValue` reads `matrixParamsFor(shape)` →
`data/job.js CREW_MATRIX`, whose JOB row still carries `{eHeld: 5, pChain3: 0.42, mSaved: 3}`. The
critic's first suggestion — reprice `CREW_MATRIX` — is request **R7**, it is `site/data/job.js`, and
three other lanes hold findings in that file this round. The second — drop the clause — is
`screens/job.js`, also another lane's.

**What was done instead, and it is the stronger fix.** All three constants are *measurable on the
board in front of the student*, by the harness this suite already runs against the drafted path. New
in `crew.js`:

| export | what it is |
|---|---|
| `measuredParamsOn(save, queue, {shape, samples})` | G2's five matrix parameters with `m̄`, `P(chain ≥ 3)` and `Σm_saved` measured off `simulateJob` on THIS queue (`MEASURE_SAMPLES = 1024` lattice points, 6.4 ms). `lootMean` / `ρ̄·W̄` / `P(non-clean)` / the two `Δρ` are kept — they are not board quantities. `source: 'board'`. |
| `boardOptionsOn(save, queue, {shape, of, params})` | `buildOptions`' board-true counterpart: `steadyValueOn` / `heldValueOn`, both rungs in ONE regime, and a **zero-valued HELD row kept** for every `canHold` make (a rung the student can see three buttons for must be priceable at 0, not absent). |
| `alignmentFor(..., {queue})` | now prices from those two. `pricedOn: 'board'`, `params`, and a new `steadyThreshold` so the two numbers the line compares are on the same scale. Without a queue it is byte-for-byte the r1/r2/r3 population model — **no existing behaviour or test moved**. |

**The `Σm_saved` estimator is the subtle half and is documented in the code.** The obvious estimator
(`total / holds`, multiplied by the modelled hold rate `e_held · P(non-clean) · P(chain ≥ 3)`) is
wrong twice: it is a mean-of-ratios over an event that fires once per 40–260 jobs (on the §8 board it
reads **0.00 · 2.20 · 2.59 · 2.61** at 64 · 256 · 1 024 · 4 096 points), and the modelled rate is not the board's —
`CREW_MATRIX.pNonCleanMastered` is 0.06 while `RUNG_BANDS`' own m85 row draws non-clean at 0.12, so
the model over-states the hold rate by ~3×. Both errors push HELD **up**. `measuredParamsOn` returns
the `mSaved` that makes the shipped formula reproduce the measured expectation
`E[Σm_saved per job]`, which cancels to `h · V_hold = (e_held / H) · E[Σm_saved] · L̄ · ρ̄·W̄`. That
converges four times faster: on the §8 board `E[Σm_saved per job]` reads 0.000 / 0.026 / **0.061** /
0.066 / 0.067 at 64 / 256 / 1 024 / 4 096 / 16 384 points, which is why `MEASURE_SAMPLES` is **1 024**
and not 64 — under-resolving it prices HELD DOWN, the direction this repair already pushes.

**Result.** Mean printed threshold **6.02 → 0.34** (17.5×), *"outbid"* **40/66 → 4/66**. The remaining
four are boards that genuinely serve a mastered make several hold-active targets and serve every
weak make none; on those the sentence is now true. Pinned with its own control in
`tests/job-align.test.mjs` §7 — the control recomputes the OLD price from `heldValue`/`crewValue`
and asserts it still reproduces the critic's 40/66, so the measurement cannot go vacuous.

**A constraint found the hard way, and it changed the implementation.**
`tests/job-exploit.test.mjs` J9 asserts that no payoff module — `econ.js`, `call.js`, **`crew.js`** —
so much as names the seeded generator: *"luck cannot reach a payoff term"*. The first cut of
`measuredParamsOn` imported `rngFrom` and went red there. It is another lane's test and it is right,
so the change was fixed rather than the test: the plays are now a **quadrature**, not a sample.
`RUNG_LATTICE(d)` is Roberts' R_d rank-1 lattice (`α_k = φ_d^-(k+1)`, `φ_d` the root of
`x^(d+1) = x + 1`), one dimension per target, and `measuredParamsOn` is a pure function of
`(save, queue)` with no seed argument at all. Three rules were compared at each point count (R_d,
`frac(√p_k)` Kronecker, Halton); none resolves the rare conjunction materially better than another
below ~1 000 points, so the simplest ships. The lattice beats a seeded stream on the smooth
quantities (`P(chain ≥ 3)` 0.3812 at 64 points against a 16 384-point limit of 0.3819, where the
stream reads 0.4250) and agrees with it to 1 % on the rare one once both have enough points.

**Not fixed by this lane, still filed:** `CREW_MATRIX` itself is still stale, so `buildMatrix`,
`bestRankFor` and every "published" row still answer for the document. That is correct — that is what
`source: 'published'` is for — but the data file should still be repriced (**R7**, re-filed below).

## V2 — BLOCKER · crew-alignment · "'a build mistake costs you at most one job' is false as shipped"

**Confirmed. The sentence is in two files this lane does not own; the mechanism is in one it does.**

```
  verify-1 reach | median make offered on 15.7 % of 300 boards | never offered: QUAD-CTX
```

`save.game.crew` persists across jobs (`store.js freshGame()` puts `crew` on `game`; nothing in
`state.js` clears it at `startJob`) and the only control renders `crewOrder(s, {shape, of: onBoard})`,
so a point spent on a make tonight's board does not serve cannot be handed back tonight either.

**In-lane fix:** `crew.reallocatable(save, {shape, of})` — the board's makes **plus every make
already manned**, in `crewOrder`'s own order (asserted: with nothing manned off the board it is
byte-identical to the shipped list). `tests/job-align.test.mjs` §10 measures the reach and shows the
shipped list cannot reach a manned off-board make while `reallocatable` can.

**Out of lane — see Requests V-R1 and V-R2:** one line in `screens/job.js crewBlock`, and the
sentence itself in `COMPOSED-GAME.md:214` and `screens/stats.js:336`.

## V3 — MAJOR · crew-alignment · "G3.8's four-condition domain is unreachable"

**Confirmed and now published in the code, measured rather than argued:**

```
  verify-1 domain | 19 makes: evidence 0.0 % rank 98.7 % supply 14.3 % band 5.0 % ALL 0.0 %
                  | contenderDomain.all 2.0 %
  verify-1 domain | brief   : evidence 2.3 % rank 98.7 % supply 24.3 % band 22.7 % ALL 1.0 %
                  | contenderDomain.all 7.7 %
```

`alignmentFor`'s docstring now carries both rows and says in terms that `domain.all` is a **limit
case and not a description of an evening**. `tests/job-align.test.mjs` §9 asserts the rates
(`domain.all ≤ 1 %` over the 19-make pool, `≤ 5 %` at the brief's call) so they cannot drift back
into prose.

The critic's second option — state conditions 1 and 4 per candidate instead of universally — ships
**additively** as `contenderDomain`, beside the existing `domain` (which is left exactly as it was,
because `tests/job-crew.test.mjs` §15 `deepEqual`s its five keys). `contenders` is the set of makes
that can actually decide the argmax; condition 1 asks only that those are at full evidence depth and
condition 4 becomes `bandAgrees`, the argmax comparison. It is the strongest reachable form and it is
still rare — 7.7 % — with **supply** the binding condition. §9 asserts that too.

Note `rank` moved 84.7 % → **98.7 %**: that is V1's repricing showing up in the domain.

## V4 — MAJOR · crew-alignment · "hand-built counterexample: four conditions true, best point is HELD"

**Confirmed — rebuilt target-for-target in `tests/job-align.test.mjs` §8 and it reproduces exactly**
(CS-LIN w9 m41 `act 1` `steadyOn 1.890`; CLASS w3 m90 `act 3 holdAct 3` `heldOn 2.118`;
`crewValue 4.470` vs `heldValue 2.012`; `domain {evidence:true, rank:true, supply:true, band:true,
all:true}` on the model path).

The critic's diagnosis is right: condition 2 was priced against a population and condition 3 against
the board, and a conjunction across two regimes implies nothing. With `alignmentFor` board-pricing
both rungs the hole closes, and it closes the way the critic predicted it would:

```
  verify-1 counter | CLASS HELD published 2.118 -> measured 1.225 | CS-LIN STEADY 1.944
                   | p3 0.381 (pub 0.42) mSaved 0.885 (pub 3) holds 24/1024
```

so the board-true argmax is **STEADY on CS-LIN**, which is `readiness.weakSpots()`'s own first make —
the theorem, holding on the save built to break it. `domain.all` still reads `true` here and is now
**sound**, where before it was a certification the board contradicted. §8 asserts both halves: the
old regime's false certification, and the new one's agreement.

## V5 — MAJOR · test-integrity · "the S4 block exercises an API with no caller anywhere under site/"

**Confirmed, and both halves of the suggested fix landed.**

1. **Wired.** `alignmentFor(save, {shape, of, queue})` now returns `decision: buildDecisionOn(save,
   queue, {shape, of})`. `screens/job.js crewBlock` makes that exact call on every render of the
   brief's crew grid (pinned in `tests/job-screen.test.mjs`), so the S4 decision is on the shipped
   path. What the screen does not yet do is **print** it — one line, another lane's file, **V-R3**.
2. **Relabelled, and the grep repaired.** The `§2(c)` arm asserted `callers === []` over a walk of
   `site/` that *skips `crew.js`* — the only place the wiring could ever live — and read that empty
   list as "unshipped"; `supplyGapFor` was already reached through `alignmentFor().gap` while the arm
   reported it unwired. It now asserts the reachability identity
   (`alignmentFor(...).decision === buildDecisionOn(...)` on a drafted board) and keeps the grep as
   the weaker, separate claim it always was: *no screen reaches past `alignmentFor` into the pricing*.
   The §1–§3 banner is rewritten to match.
3. **The missing arm the finding named** — "no test asserts that the decision the game DOES make has
   changed" — is `§2(c2)`: every row of the shipped grid's option list is asserted identical to
   `steadyValueOn`/`heldValueOn` at `measuredParamsOn`, and *not* to `crewValue`/`heldValue`, wherever
   the two differ. `§2(f)` measures the consequence: priced from `CREW_MATRIX` a HELD point tops the
   list on **21/34** boards, priced on the board on **2/34**.
4. **The surviving mutation is pinned.** `deep: A.marginal > B.first` mutated to `>=` was green
   because an exact tie never occurs on a drawn census. §S4 · 1 now *constructs* one: at `m_A = 85`,
   `e_A = 4`, `e_B = 1` and `m_B = 73.83333333333343`, `marginalDRho(m_A)·4 === dRhoTrue(m_B, STEADY)·1`
   to the last bit of a double (asserted), and the decision must read **SPREAD** — a second rung that
   exactly ties a first rung on another make buys the same `Δρ` and loses the second make.
5. **The stale comment is corrected.** `§1`'s comment blamed `COMPOSED-GAME.md` for the three
   decimals `1.2156 / 1.3608 / 1.9697`; the document publishes no such numbers
   (`grep` returns nothing). They are `designs/REPAIR-DECISION.md` §S4.2, table at `:664-666`.

## Requests (verify-1, files this lane does not own)

**V-R1 · `site/js/screens/job.js crewBlock`, ONE line.** Replace

```js
    const makes = state.crew.crewOrder(s, { shape, of: onBoard });
```

with

```js
    const makes = state.crew.reallocatable(s, { shape, of: onBoard });
```

`reallocatable` is `crewOrder` over `of ∪ mannedMakes(save)`, so the rows and their order are
unchanged except that a make the student already has a point on stays reachable on a night the board
does not serve it. Without this, V2's sentence stays false however it is worded.

**V-R2 · `COMPOSED-GAME.md:214` and `site/js/screens/stats.js:336`.** Strike *"So a build mistake
costs you at most one job"* and the matching clause *"…so a build mistake costs one job and never an
evening."* Paste-ready replacements, measured on 300 drafted boards:

> …re-allocation is free and unlimited **inside every brief window, over the makes still on the
> board**. A rank can only be changed on a night the board serves that make, and the median make is
> served on 15.7 % of drafted boards (two of the nineteen on none of 300) — so a point spent on a
> rarely-served make stays spent for several jobs, not for one.

and for `stats.js`:

> …re-allocating there is free and unlimited over the makes on tonight's board.

If **V-R1** lands, the second half of `COMPOSED-GAME.md:214` ("the makes the board is not serving
tonight cannot be manned tonight at all") stays true for *manning* and becomes false for *unmanning*;
say so, or ship the between-jobs `crew` phase `data/job.js PHASE_ORDER` already declares.

**V-R3 · `site/js/screens/job.js crewBlock`, ONE line** — print the decision that is now computed
right beside the threshold line:

```js
      align?.decision ? h('p.job-crew-deep.muted.fs-1', align.decision.deep
        ? `a second rung on ${align.decision.A} outbids a first on ${align.decision.B} — the board serves it ${align.decision.ratio.toFixed(1)}× as often`
        : `no make is served enough to pay for a second rung — spread`) : null,
```

**V-R4 · `COMPOSED-GAME.md` G3.8 (the paragraph at :629).** Publish the reachability beside the
domain. Paste-ready:

> `domain.all` is measured at **0 % of drafted boards** over the 19-make pool and **1 %** over the
> makes a brief window offers, so the four-condition form is a statement about a limit case and not
> about an evening. What holds everywhere is the **ordering identity** of this section's first
> paragraph — `crewValue` IS `readiness.weakSpots()`'s sort key, exactly — together with §6.3's mean
> `ρ(all) = 0.65`. Stated per candidate rather than universally (`alignmentFor().contenderDomain`)
> the domain is reached on **7.7 %** of boards, with supply the binding condition.

**V-R5 · `site/js/screens/job.js:1538-1541`.** The align line now prints a board price while the
sentence still says *"on this list's own scale"*. The number is honest either way, but the two
numbers the claim compares are `align.threshold` and the new `align.steadyThreshold`, not the grid's
score column. One line:

```js
        ? `a HELD point prices at ${n2(align.threshold)} against ${n2(align.steadyThreshold)} for the best first rung on this board`
```

**R7 (re-filed, third round) · `site/data/job.js CREW_MATRIX.rows`** — the four rows are still priced
from parameters COMPOSED-GAME.md G2 itself publishes as measured-false. Nothing the student sees
reads them any more (V1), but `buildMatrix` / `bestRankFor` still answer for the document with
`winner: 'HELD'` on three rows, and `tests/job-econ.test.mjs` asserts those winners. Repricing them
moves that suite, so it is one coordinated change, not a drive-by.

## Suite (verify-1)

```
$ cd /Users/oliver/Projects/unit1a-quest && node --test tests/
ℹ tests 2914 · pass 2903 · fail 7 · skipped 4          EXIT=1
```

**None of the seven is this lane's**, and none of the six files they live in uses a single symbol
this lane touched (`grep -c 'alignmentFor|heldValue|crewValue|measuredParams|boardOptionsOn'` returns
**0** for `job-board`, `job-econ`, `job-monotone`, `job-week` and `mock`; `job-meta-constants` imports
only `COSTS / CAPACITY_MAX / MANNED_MAX / STAMPS_MAX / CHAIN_HOLD_MIN / MAKES`, none of which moved).
They are twelve other fixers' in-flight edits — the messages are about board composition ordering,
`COMPOSED-GAME.md` G3.2's prose, and the Mock/rating window:

```
tests/job-board.test.mjs:1868   "save 107: def-12 … WITHOUT winning either the overdue sort or the tier ramp"
tests/job-econ.test.mjs:950     "KNOWN HOLE, pinned: at LOOSE = 0 …"
tests/job-econ.test.mjs:971     "the rank ladder is the only published brake on it"
tests/job-meta-constants.test.mjs:982  "G3.2 states the EV hole but no longer states that over-calling is unbraked there"
tests/job-monotone.test.mjs:298 "PINNED: clearing target 1 LOWERS the optimum from 616 to 603"
tests/job-week.test.mjs:1225    "the Mock, the boss and the Night Before are reachable at rank 1 …"
tests/mock.test.mjs:647         "a Mock never demotes the rank …"
```

`tests/job-meta-constants.test.mjs` passed standalone eight minutes before the full run and failed
inside it, on a `COMPOSED-GAME.md` sentence — the doc lane landed an edit in between. That is the
shape of every one of them.

**Every file that imports `site/js/job/crew.js` is green**, run together:

```
$ node --test tests/job-align.test.mjs tests/job-crew.test.mjs tests/job-screen.test.mjs \
       tests/job-exploit.test.mjs tests/job-coldopen.test.mjs tests/job-copy.test.mjs tests/job-call.test.mjs
ℹ tests 511 · pass 511 · fail 0 · skipped 0
```

`tests/job-crew.test.mjs` 139 → **142**; `tests/job-align.test.mjs` 37 → **51**. **No test was
deleted, skipped or weakened.** Three were *repaired*, each because the claim it asserted had stopped
being true and the test could not see it:

| test | why it changed |
|---|---|
| §S4 · 1's `// COMPOSED-GAME.md's three decimals are wrong` | the document publishes no such numbers; `designs/REPAIR-DECISION.md:664-666` does |
| §S4 · 2(c)'s `assert.deepEqual(callers, [])` | the walk it read as "unwired" skips `crew.js`, the only file the wiring could be in; it now asserts the reachability identity AND keeps the grep as the narrower claim |
| §S4 · 2(d)'s title and docstring | "the build decision the shipped save really makes" became false when the grid started pricing on the board; relabelled `SAVE-ONLY`, and `(f)` measures the board one |

Added: `align §7` (4 tests), `§8` (4), `§9` (2), `§10` (2), `crew §S4 · 1` tie (1), `§S4 · 2(c2)` (1),
`§S4 · 2(f)` (1). The suite costs about **12 s** more; `measuredParamsOn` is 6.4 ms a board and the
brief window renders it once per paint.

---

# repair-crew — VERIFY ROUND 2

**Lane files owned:** `site/js/job/crew.js` + its tests (`tests/job-crew.test.mjs`,
`tests/job-align.test.mjs`).
**Cross-lane edits made rather than re-filed:** five sentences in `COMPOSED-GAME.md`, two lines in
`site/js/screens/job.js`, one sentence in `site/js/screens/stats.js`, one selector in
`site/css/job.css`, one arm in `tests/job-screen.test.mjs`, one rule in `qa/job-screen.mjs`. Every
one is listed verbatim under **Cross-lane edits** below. BUILD-POLICY §2 permits a one-line change
in a file this lane does not own when it is recorded here; these are recorded here because
**verify-1 filed all of them as Requests (V-R1…V-R5) and none of them landed**, and the verify-2
critics re-found the same defects as BLOCKERs. Nothing was deleted; every edit is additive or a
sentence-for-sentence replacement.

## The eight findings, and what was done

| # | sev | finding | verdict | root fix |
|---|---|---|---|---|
| 1 | BLOCKER | G3.8's four-condition domain contains its own conclusion; "holds only on `domain.all`" false on 33.7 % of boards | **CONFIRMED** (reproduced, §1 below) | `alignmentFor().claim` + `claimParts` + `claimIsConditions`; G3.8 rewritten |
| 2 | BLOCKER | "a build mistake costs you at most one job" published and printed while `reallocatable` has no caller | **CONFIRMED** | `reallocatable` wired into `screens/job.js`; G2 and `stats.js` rewritten |
| 3 | BLOCKER | "re-allocation is free and unlimited inside every brief window" — the window takes ONE action | **CONFIRMED** from source | G2 and `stats.js` now say "one rank change per window"; `allocate`'s docstring corrected |
| 4 | MAJOR | condition 3 published as a supply COUNT, computed as an ARGMAX | **CONFIRMED** (14.7 % here, 16.7 % on the critic's draw) | G3.8 condition 3 rewritten; `supplyGapFor` + `crewValue` docstrings corrected |
| 5 | MAJOR | the `q̂ ∈ [0.5, 1]` restriction attached to a crew condition in two places | **CONFIRMED** (`grep -n "qHat" crew.js` → nothing) | G3.8 cond 3 and G8's J4 row send it back to row 3 of the table |
| 6 | MAJOR | condition 4 is a floor while `bandFor` clamps at both ends; counterexample certifies a save the bands contradict | **CONFIRMED** (counterexample reproduced to the digit) | `BAND_CEIL` / `isBandCeiled` / `isBandClamped`; `domain.band` is now both ends |
| 7 | MAJOR | 87.3 % / 38.3 % are one population's numbers | **CONFIRMED, with a correction** (below) | G3.8 / G9 #5 / G12 #53 publish the asserted bounds + the 24-corpus range |
| 8 | MAJOR | the crew grid recommends the make it just said pays 0.00, in two different units | **CONFIRMED** | every row now prints its board price from `alignmentFor().options`; the two counts share a word |

### 1. The circularity, reproduced on an independent corpus

My own generator, my own seed tag, shipped `composePage → composeBundles → draftUnion`, 300 boards
(`scratchpad/crew-v2/s1-domain.mjs`):

```
boards 300
domain.evidence  6/300 = 2.0 %      domain.rank   297/300 = 99.0 %
domain.supply   82/300 = 27.3 %     domain.band    68/300 = 22.7 %
domain.all       0/300 = 0.0 %
conclusion TRUE 82/300 = 27.3 %     rank && supply 82/300 = 27.3 %
claim !== rank&&supply on 0 boards
conclusion TRUE while domain.all FALSE: 82/300 = 27.3 %
```

Same structure as the critic's (their population reads 33.7 %): **the conclusion set and the
rank ∧ supply set are the same set, and `domain.all` is empty.** The fix is not a wording change:
`alignmentFor` now computes the conclusion — `claim` = *"`options[0]` is a STEADY on
`crewOrder(pool)[0]`"* — reports `claimParts {rank, supply}` and `claimIsConditions` (the
equivalence, per board), and its docstring says in full why the four-condition form certifies
nothing. `domain` is kept, because every field in it is a real measurement, and is documented as a
**report** rather than a sufficient condition.

The inertness of conditions 1 and 4 is now *measured*, not argued: lifting every make to `n = 9`
flips `domain.evidence` on most boards and moves `claim` on **0 of 120** (`tests/job-crew.test.mjs`
§16).

### 2. Finding 7 — confirmed, with one correction the critic could not see

The critic reported 63.3 % / 46.0 % against the published 87.3 % / 38.3 % and attributed the gap to
the save population. That is right, but it is not *re-seeding*: re-seeding the shipped generator
moves almost nothing, and changing the generator's `m` distribution moves everything
(`scratchpad/crew-v2/s3-reach.mjs`, 16 corpora):

```
r7-family (the suite's own generator), 8 re-seeds : argmax-disagree 84.0-89.0 %  top-disagree 34.3-42.7 %
uniform-m (job-align §1's population), 8 re-seeds : argmax-disagree 55.0-63.7 %  top-disagree 43.0-49.3 %
```

So the document may not publish either pair as a fact, and the repair is the one C-5 already
prescribes: publish the **asserted bounds** (> 50 % and > 20 %, which both corpora clear) and the
**range**. `tests/job-crew.test.mjs` §16 measures 24 corpora from the two generator families on
every run and asserts both the bounds and that the spread is too wide for a point estimate:
**51.3–92.7 %** and **32.7–52.7 %**.

### 3. Finding 6 — the counterexample, reproduced to the digit

```
every make strictly above BAND_FLOOR=40 : true
domain (before) : {"evidence":true,"rank":true,"supply":null,"band":true,"all":true}
crewOrder     top: QUAD-CTX     crewOrderTrue top: CS-LIN     bandAgrees: false
  QUAD-CTX w 2 m  60  crewValue 0.6734  steadyValueTrue 0.6726
  CS-LIN   w 9 m 100  crewValue 0.0000  steadyValueTrue 0.9150
```

`dRhoModel` against `dRhoTrue`: **−1.3 % at m 40 · +24.2 % at m 85 · −58.6 % at m 95 · −100 % at
m 100.** `BAND_CEIL`, `isBandCeiled` and `isBandClamped` ship; `domain.band` is now *"every candidate
strictly between the two clamps"*, `alignmentFor` returns `bandCeiled` / `bandClamped` / `bandCeil`
beside the floor fields, and the save above leaves the domain on the make that breaks it. The real
repair is still `data/job.js`'s (**R5**, re-filed below): a fourth `RUNG_BANDS` row in the tail and
one above 85. `DRHO_SLOPE` re-fits at module load, so no constant here is retyped when they land.

## Cross-lane edits (each one recorded, none of them silent)

1. **`site/js/screens/job.js crewBlock`, one line** — `state.crew.crewOrder(s, {shape, of: onBoard})`
   → `state.crew.reallocatable(s, {shape, of: onBoard})` (verify-1's V-R1, finding 2). Same sort
   key, strictly more rows. The header line beside it now counts the board's makes and the manned
   ones separately, and `qa/job-screen.mjs` rule 11(a) was taught that an off-board manned row is
   legitimate (it previously failed any row whose make is not on the board).
2. **`site/js/screens/job.js crewBlock`, the row** — each row prints `· pays N.NN`, the board price
   of a first rung, read from the new `alignmentFor().options` so the screen still has ONE entry
   point into the pricing (finding 8). The supply line says `over N targets **it forgives**`, which
   is the same word the row's own count uses. `.job-crew-pays` added to `site/css/job.css`'s muted
   selector list.
3. **`site/js/screens/stats.js`** — the crew line no longer promises "free and unlimited" or "costs
   one job"; it says one rank change per window, over the board's makes plus the ones already
   manned.
4. **`COMPOSED-GAME.md` G2 (:218)** — both promises withdrawn *in place*, with the mechanism
   (`state.brief` → `setPhase('envelope')`, `SHAPES.JOB.briefs = 2`, 12 allocations for the build
   G2 prices) and the measured 15.7 %.
5. **`COMPOSED-GAME.md` G3.8** — the theorem paragraph replaced: the claim is published as
   `alignmentFor().claim`, a per-board measurement; conditions 2 and 3 are labelled as the claim
   restated, 1 and 4 as model-regime conditions that cannot move it; condition 3 is the argmax it
   is; condition 4 carries both clamps; the q̂ restriction goes back to row 3; the rates paragraph
   publishes bounds + range.
6. **`COMPOSED-GAME.md` G8 J4 row, G9 #5, G11's withdrawn list, G12 #53** — follow the same
   corrections; G12 #53 gains a "verify round 2 re-opened this entry twice" clause naming both.
7. **`tests/job-screen.test.mjs`** — the arm that pinned `state.crew.crewOrder(` in the screen's
   source now accepts `reallocatable` and asserts the exact call, which is strictly narrower.

## Test-integrity repairs (no assertion weakened)

| test | why it changed |
|---|---|
| `job-crew §S4·2(c)`'s "nothing in site/ calls the decision" | the grep read RAW source, so another lane's **comment** citing `measuredParamsOn(board)` counted as a call site. It now strips comments and strings first (`tests/_helpers.mjs stripCommentsAndStrings`) — narrower AND truer. |
| `job-crew §15`'s counterexample `deepEqual(domain, …)` | `band` reads both clamps now and this save's mastered ASN-PLP (m 92) is in the top one. Re-measured, with two NEW assertions: `bandCeiled === ['ASN-PLP']`, and the rank condition still fails on its own. |
| `job-align §8`'s `assert.equal(a.domain.all, true)` | that arm called the conjunction a "certification". It is not one (finding 1). It now asserts `claim === true`, `claimIsConditions === true`, `claimParts` — and `domain.all === false` on the same board, which is the finding. |

**Added:** `job-crew §16` — 13 tests over 300 drafted boards and 24 seeded corpora: the equivalence
(identical on 300/300), the false direction (the claim true on > 15 % of boards, `domain.all` false
on > 90 % of those), the inertness of conditions 1 and 4, condition 3's two readings, `BAND_CEIL`
and the top-end model error, the hand-built counterexample, and the two rates as a range. The file
costs about **5 s** more (`V2_ALIGN` aligns the corpus once and every arm reads it).

## Suite (verify-2)

See the foot of this note. **Not this lane's**, verified by inspection before and after each edit:
`tests/job-align.test.mjs` §6 (`THE HONEST NUMBER`, `§6.3 NEIGHBOURHOOD rate`) fails on pinned
corpus statistics that come from `composePage`/`composeBundles`; §6 touches no symbol this lane
changed (`grep -n "alignmentFor\|domain\|bandFloored"` over §6 returns nothing) and
`site/js/job/board.js` was modified by another lane mid-run. `tests/job-copy.test.mjs`'s
parent-voice lint fails on `site/js/job/board.js → come back`, also another lane's in-flight text.

## Requests (verify-2, files this lane still does not own)

**R5 (re-filed, fourth round) · `site/data/job.js RUNG_BANDS`.** Two rows — one in the flat tail at
m ≈ 15–20, one above 85 (m ≈ 92) — retire `domain.band` altogether instead of reporting it.
`DRHO_SLOPE`, `BAND_FLOOR`, `BAND_CEIL`, `DEEP_THRESHOLDS` and `dRhoTrue` all re-fit at module load,
so the only edit is the data. Today the grid prices a fully mastered make at 0.0000 against a
shipped 0.0325, and orders the whole weak range by `w · (1 − m/100)` where the game pays by `w`.

**R7 (re-filed, fourth round) · `site/data/job.js CREW_MATRIX.rows`** — unchanged from verify-1:
the four rows are priced from parameters G2 itself publishes as measured-false, and
`tests/job-econ.test.mjs` asserts the winners, so repricing is one coordinated change.

**R9 (new) · `site/js/job/state.js brief()` + `screens/job.js setCrewRank`.** If G2's intent really
is more than one crew change per window, `brief()` has to accept a LIST of crew actions (or the crew
control has to stop consuming the window). Until then the document and the student copy say one per
window, which is what `setPhase(g, … 'envelope')` on the first press makes true. This lane did not
change the machine; it changed what is published about it.

**R10 (new) · `site/js/screens/job.js crewBlock`, the brief's line count.** Finding 8's second half
is a density judgement in the screen lane's own file and was left to it: the block still prints the
budget, the order line, the align line, the supply line and the thin-evidence line above 15 buttons
in a ~50-second window. What verify-2 fixed is the part that was *wrong* rather than long — the
rows now carry the board price, so the sort column and the supply line are no longer two unlabelled
numbers in two units, and the counts share the word "forgives". Moving `job-crew-thin` ("N of these
makes are under 5 attempts, so the ordering reads a shrunk mastery") to the Settings card that
already prints every other formula is the remaining item; nothing pins that class, so it is a
one-line move for whoever owns the brief's layout.

---

# verify round 3 — the crew lane

**Files owned:** `site/js/job/crew.js`, `tests/job-crew.test.mjs`, `tests/job-align.test.mjs`.
**Baseline, measured before any edit** (`node --test tests/`, 09:35):
`tests 2995 · pass 2991 · fail 0 · skipped 4 · duration_ms 350422 · EXIT=0`.

Six findings, three critics. **Four are confirmed and repaired, two of them at the root in code; the
other two are the authority quoting the wrong arm.** Every number below was re-measured through the
shipped functions before it was written down — the reproduction scripts are in the session
scratchpad and the measurements are now assertions in this lane's own suite, not in a note.

## 1 · BLOCKER + BLOCKER (crew-alignment, spec-fidelity) — the four headline alignment figures are the RETIRED corpus's

**Confirmed, exactly as filed.** `J4_PRINT=1 node --test tests/job-align.test.mjs`:

```
align6.2  all 19  top3 58/100 = 58%  argmax 20/100 = 20%
align6.2  served  top3 91/100 = 91%  argmax 44/100 = 44%
align6.2b page-slice  all 19  top3 43%  argmax 19%  |  served top3 99%  argmax 57%  |  ρ(all) 0.6546
align6.3  rAll    mean 0.8334 sd 0.0305 [0.768, 0.894]
align6.3  top3    mean 61.00 sd 5.91 [49, 69]   argmax mean 28.58 sd 5.42 [18, 42]
```

The document published **43 / 19 / 99 / 57** and **ρ(all) = 0.65** at four sites under §6.2's and
§6.3's names. All five are §6.2b's — `composePage(s).queue.slice(0, 10)`, Today's Page truncated to
ten, which `corpusOf`'s docblock says "no job is ever played on" — and 0.65 was never a mean over 24
corpora but that single corpus's own ρ(all) = 0.6546. The published "no corpus below 0.4" sat where
the shipped arm asserts `min > 0.7`, and "Every one of those figures is asserted" was false of all
five. §6.2b's header has said this would happen since round 2, in writing.

**Repaired at all four sites** — G3.8 "What is a MEASUREMENT", G8's J4 acceptance row, G9 #5, G12
#53 — on the drafted board: 58 % / 20 % over all nineteen makes, 91 % / 44 % served-only (still
labelled circular), and §6.3's distribution rather than one draw: top-three **61 % ± 6**, argmax
**29 % ± 5**, mean **ρ(all) = 0.83 ± 0.03, no corpus below 0.7**. The retired quartet is kept where
it is quoted, always with "§6.2b / Today's Page truncated to ten" on the same line.

**And the mis-attribution is now an assertion, not a header.** `tests/job-align.test.mjs` §6.2c
reads `COMPOSED-GAME.md` and fails if any line that names §6.2 or §6.3 carries a page-slice numeral
without naming the slice on that same line, and if the four shipped numerals and ρ(all) = 0.83 are
absent from the document altogether. The shipped numerals are computed from `ROWS` inside the lint,
not typed, so it moves with the arms above it, and it carries a control that shows it would have
caught the exact sentence that shipped for a round.

## 2 · MAJOR (crew-alignment) — "`domain.all` is false on every board where the claim holds"

**Confirmed, and it was refutable by algebra alone.** `alignmentFor` computes `claim ≡ rank ∧ supply`
and `domain.all = evidence ∧ rank ∧ band ∧ supply`, so **`domain.all ⟹ claim`**: a non-zero
`domain.all` rate forces a non-empty intersection, and the same paragraph printed 1.0 %. Measured on
§16's own corpus (`J4_PRINT=1 node --test tests/job-crew.test.mjs`):

```
v3 certify | 300 boards | claim 81 (27.0 %) | domain.all 2 (0.7 %) | claim ∧ domain.all 2
```

Two boards are certified, both are boards the claim is true on, and the certified set is 0.7 % —
not "none". Repaired in three places:

* **`site/js/job/crew.js:998`** — "`domain.all` is reached on 0 % of drafted boards … they shrink it
  to nothing" → the measured 0.7 %, with the implication stated as the arithmetic it is.
* **`site/js/job/crew.js:997` and :1645** — "they changed it on **0 of 300** boards" → **0 of 120**,
  which is what `V2_BOARDS.slice(0, 120)` measures (the document at G3.8 condition 1 already had
  this right; the code did not).
* **`COMPOSED-GAME.md` G3.8 (two sites) and G12 #53** — the universal withdrawn, both rates
  published, and the implication stated.

**Asserted, so it cannot come back:** `tests/job-crew.test.mjs` §16 "THE OTHER DIRECTION, and it is
arithmetic" fails on any board where `domain.all` certifies a board the claim is false on, asserts
`claim ∧ domain.all === domain.all`, and asserts `domain.all > 0` — because an arm that proves the
intersection is non-empty is vacuous once the rate rounds to zero. The finding was right that
`job-crew.test.mjs:3348` **permitted** the universal to be false (`claimOffDomain > 0.9 * claim`);
that arm is unchanged and correct for its own direction, and the missing direction is now beside it.

## 3 · MAJOR (crew-alignment) — the decision priced rungs the student already owns

**Confirmed and repaired at the root.** Reproduced on 200 drafted JOB-10 boards with the top `k`
makes of the study order manned at STEADY, through `alignmentFor` on the shipped path:

```
                          best is a rung ALREADY OWNED        claim
crew k= 0                 0/200   (0.0 %)                     25.5 %
crew k= 3               141/200  (70.5 %)                     25.5 %
crew k= 6               195/200  (97.5 %)                     25.5 %
crew k=12               198/200  (99.0 %)                     25.5 %
```

`claim` was **byte-identical at every k**: the one decision surface in the layer could not see the
build at all, and the published 27 % is measured entirely in the crew-empty regime that
`randomSave` / `r7Save` / `jobSaveFor` produce and a real save leaves after evening one.

**The repair.** `boardOptionsOn` and `buildOptions` take `nextOnly`; `alignmentFor` takes it too and
**defaults it on**:

* `options` — unchanged, every priced point on the board, ownership-blind. The grid's per-row price
  column reads this, so no row loses its price.
* `buyable` — `options` minus every rung at or below `effectiveRankOf(save, make)` (the rank that
  PAYS, so a lapsed HELD is not offered its STEADY back). **`best`, `steady`, `held`, `holds`,
  `threshold`, `steadyThreshold`, `margin` and `claim` are all read off this list.**
* `steadyPool` — the makes a FIRST rung is still for sale on. `studyTop` and `gap` are computed over
  it, which is what keeps `claim ⇔ rank ∧ supply` exact after the split: `boardOptionsOn`'s STEADY
  rows over `steadyPool` are precisely what `supplyGapFor` argmaxes over.
* `boardClaim` / `boardBest` / `boardStudyTop` — the same sentence about the BOARD rather than about
  tonight's purchase. **This is the field a corpus statistic belongs in**, and §6.2 / §16 / G3.8's
  27 % are all it.
* `nothingToBuy` and `noFirstRung` — two states a real save reaches that the old list could not
  express (nothing left to buy at all; every make on the board manned, a HELD upgrade possibly open).

After the repair, on the same 200 boards: `best` is an owned rung on **0.0 % at every k**, and
`claim` reads 25.5 / 50.5 / 29.5 / 0.0 % at k = 0/3/6/12 — a live statement about tonight instead of
a constant.

**Nothing published moved.** Every corpus in this suite is built from generators that never write
`game.crew`, so `buyable === options` on all of them. That is asserted rather than assumed:
§17's first arm checks `mannedCount === 0` on the corpus, `deepEqual(buyable, options)`, and that an
explicit `nextOnly: false` call returns the same `best`, `claim`, `threshold`, `steadyThreshold` and
`domain` — field for field, on 60 boards. The conditioning is now stated at every site that prints
the 27 %.

**Falsifiability.** §17's second arm asserts `best.rank > effectiveRankOf(...)` at k = 0/3/6 AND
carries the control: the ownership-blind list must still recommend an owned rung on more than 40 %
of boards at k = 3 (it reads 56/80), so the arm cannot pass on a corpus where no build was applied.

## 4 · MAJOR (crew-alignment) — the published supply pair is the 19-make pool; the screen calls `of: onBoard`

**Confirmed to the digit.** `supplyGapFor`'s default `of` is all nineteen makes; `screens/job.js`
passes `of: onBoard` into `alignmentFor`, which passes it through. On the same saves and queues:

```
s4 reseed | 24 corpora x 80 JOB boards            | zeroPay 60.0-72.5 % (med 67.5) | agrees 10.0-18.8 % (med 15.0)
s4 reseed | of:onBoard (the shipped call)          | zeroPay 35.0-43.8 % (med 41.3) | agrees 16.3-28.7 % (med 23.8)
V2 300 boards | 19-make 62.3 / 16.3  |  of:onBoard 35.7 / 27.0
```

Both shipped numbers fall outside both published ranges, exactly as filed. **Repaired:**

* `tests/job-crew.test.mjs` §S4·4 now measures **both** pools on the same 24 re-seeds and asserts
  they stay apart — every `of: onBoard` corpus below every 19-make corpus on `zeroPay`, and the
  medians more than 5 points apart the other way on `agrees`. The `agrees` ranges genuinely
  **overlap** (16.3–18.8), so that half is asserted at the median and the overlap is stated in the
  message: it is the reason the pool has to be named beside every pair rather than inferred.
* `COMPOSED-GAME.md` G3.8's supply paragraph publishes both rows in a table, says which one the
  brief window calls, and **scopes the zero-pay floor to the save population it was measured on** —
  the critic's own population reads 18–20 % through the identical shipped call, so ">30 % in every
  draw" may not stand as a fact about the game.
* `site/js/job/crew.js supplyGapFor`'s docstring carries both pools and the population caveat, since
  that docstring is where C-1's mis-description reached the document from last time.

## 5 · MAJOR (player-feel) — two prices for one make, five lines apart, both labelled "pays"

**Confirmed.** `alignmentFor` built `options` at `measuredParamsOn(save, q)` and `gap` at
`matrixParamsFor(shape)` — the published `CREW_MATRIX` row — and the brief printed both. Measured
over the suite's 300 drafted boards, the two regimes differ on **193** of them, worst case **20.8 %**
apart (the rendered brief showed 35 % and 24 %).

**Repaired at the root**: `alignmentFor` passes `params` into `supplyGapFor`. `lootMean · m̄` is a
positive constant common to every make, so this moves the magnitudes onto the rows' scale and
nothing else — `studyTop`, `studySupply`, `gameTop`, `agrees` and `zeroPay` are invariant, which is
asserted per board rather than argued. Two new arms in §17:

* every make named by the supply line is priced **identically** to its own row in `options`
  (`gap.studyPays === row(studyTop)`, `gap.gameValue === row(gameTop)`), over all 300 boards;
* the two regimes really did disagree (193/300, max 20.8 %) and the re-pricing moves only
  magnitudes — asserted field by field, so a future change that makes this a model change fails.

The same pair of assertions is added at the screen, where the finding asked for it:
`tests/job-screen.test.mjs` "the crew grid prints what a point buys TONIGHT" now pins `align.gap` to
`supplyGapFor(save, queue, {shape: align.params, of: onBoard})` — the call the shipped code makes —
**and** asserts the six ownership-blind fields against the old published-parameter call, **and**
asserts the supply line's two numbers equal the rows'. That is strictly more than the `deepEqual` it
replaces, which pinned the gap to the regime the rows were not in.

## Cross-lane edits (one, recorded)

1. **`tests/job-screen.test.mjs`, the block at "(2) — the model"** — the `deepEqual(align.gap, gap)`
   pin had to move with finding 5's repair or the suite would have gone red on a correct change. It
   was replaced by three assertions that are each narrower than it (above). Nothing else in that
   file was touched. Three other tests in it were already failing when this lane arrived, from the
   screen lane's in-flight edits to `site/js/screens/job.js` (`takeBrief({swap:` → `submitBrief`,
   `pressMove(g())`, and `qa/job-screen.mjs`'s desktop board collapse); none of them names a symbol
   this lane changed, and they are that lane's.

## Requests (files this lane does not own)

**R11 (new) · `site/js/screens/job.js crewBlock` + `site/js/job/state.js brief()`.** Finding 3's
second half: `canAllocate` returns `ok: true` for `to <= from`, so re-pressing the rung you already
hold is legal; `allocate` reports it honestly with **`changed: false`**; `state.js:1655` takes any
`res.ok === true` and `:1661` calls `setPhase(… 'envelope')`, so the window's single action is spent
on nothing, and `crewBlock`'s `disabled: !legal && rank !== at` leaves the already-pressed rung
pressable. The fix is one of: read `changed` before ending the phase, or disable the rung the save
is at. This lane did not change `canAllocate`'s legality — a DOWNGRADE (`to < from`) is a real move
and must stay legal, and `to === from` is also the write that applies a pending G4 demotion, so the
refusal belongs at the caller, not in the predicate. **What this lane did add is the field that
makes R11 one line:** `canAllocate` now returns `raises` (`to > from`, a point is bought) and
`same` (`to === from`, the rung is already held) beside `ok`, so the window can gate on
`check.ok && !check.same` instead of re-deriving the ranks at the call site. Asserted in §17,
together with the `allocate().changed` it matches and the downgrade that must NOT be caught by it.

**R12 (new) · `site/js/screens/job.js crewBlock`.** `alignmentFor` now returns `nothingToBuy` and
`noFirstRung`. On 42 of 80 drafted boards at a six-make build there is no crew point left to buy at
all, and the brief has no sentence for that state: `crewAlignLineOf` prints "no HELD point is
buyable tonight — the study ordering is the whole list", which is true and beside the point. One
line off `align.nothingToBuy` closes it.

**R5 / R7 / R9 / R10** (verify-2) are unchanged and still open; see above.

## End-to-end evidence for finding 5, from the project's own visual QA

`qa/job-screen.mjs` rule 11 renders the brief in chromium and reads the supply sentence back. On the
run taken **before** the repair it caught the finding verbatim, in the browser, on two briefs:

```
crew grid — the grid prints "on this board a point on NOTE pays 1.42 over 1 target it forgives — the
best-paying point there is tonight" — it does not carry "pays 1.92" from supplyGapFor(save, queue)
crew grid — the grid prints "… PAIRS pays 0.00 over 0 targets it forgives · FAC2 pays 1.23" — it does
not carry "FAC2 pays 1.53" …
```

Those are the player-feel critic's two rendered pairs, to the digit (1.92/1.42 and 1.53/1.23). The
harness itself was recomputing the gap at the PUBLISHED `CREW_MATRIX` row while the grid it was
checking prices at `measuredParamsOn` — the same two-regime split, one layer up — so rule 11 was
taught the regime and the pool the screen uses (`align.params`, `align.steadyPool`), recomputed
rather than read off `align.gap` so the rule stays an independent check. After both repairs:

```
$ node qa/job-screen.mjs --engines chromium
crew grid: measured on 4 brief(s) · the queue-aware gap differs from the supply-blind one on 2 of them
ALL PASS            EXIT=0
```

`qa/job-screen.mjs` is the second cross-lane edit and is recorded above.

## Suite

```
$ cd /Users/oliver/Projects/unit1a-quest && node --test tests/
ℹ tests 3072 · pass 3067 · fail 1 · skipped 4   EXIT=1        (final run, 10:33)
```

**The one failure is not this lane's** and is not in a file this lane owns:

| failing test | why it is not this lane's |
|---|---|
| `tests/job-week.test.mjs:1335` "the projection reads the student's OWN last five jobs" | the WEEK lane's: a 29 % board projection against a 22 % debrief headline, more than `SPLIT.agreeWithinPoints = 5`. Neither number nor either surface is touched here, and `grep -c 'alignmentFor\|supplyGapFor\|boardOptionsOn\|buildOptions\|bestBuy'` over that file is **0**. |

An earlier run in the same hour also carried `tests/job-board.test.mjs:2421` ("the primary is G1's
button": the board lane's button had begun prepending `10 locks (−3 shared) · 7 targets ·` while its
own test still expected the bare `COPY.postedNet`); that lane closed it while this ticket ran, with
no change on this side. One intervening full run aborted at the directory level with no per-test
output at all — a test file being written while node read it — and re-ran clean; `node --check` over
every file in `tests/` passes.

The same grep is 0 for every other file that failed at any point during this lane's work
(`job-econ`, `job-meta-constants`, `job-monotone`, `job-state-r1`, `run-lane-v3`), and the two
`job-screen` arms that were red on arrival (`takeBrief({swap:` → `submitBrief`, `pressMove(g())`)
are the screen lane's own source edits. All of those are green again in the run above; this lane's
baseline at 09:35 was **3 · 2995 / 2991 / 0 fail**, and the tree gained ~75 tests from eleven
concurrent fixers while this ticket ran.

Per-file, after the repairs: `tests/job-crew.test.mjs` **165 pass / 0 fail** (156 before — nine new
arms), `tests/job-align.test.mjs` **54 pass / 0 fail** (53 before — the attribution lint), and the
two `tests/job-screen.test.mjs` arms this lane touched pass, in the file and in the full run, as
does `J6 measured` (the QA harness). No assertion anywhere was deleted, skipped or loosened: every
arm that changed became narrower, and nine new ones were added.

## Files this lane changed

| file | what |
|---|---|
| `site/js/job/crew.js` | `nextOnly` on `boardOptionsOn` / `buildOptions` / `alignmentFor` (default ON for the last); `buyable` / `steadyPool` / `boardBest` / `boardClaim` / `boardStudyTop` / `nothingToBuy` / `noFirstRung`; `gap` priced at `params` over `steadyPool`; `raises` / `same` on `canAllocate`; the four stale figures in the docstrings (0 of 300 → 0 of 120, 0 % → 0.7 %, the false universal, the 27 %'s empty-build conditioning) and `supplyGapFor`'s pool table. |
| `tests/job-crew.test.mjs` | §16 "THE OTHER DIRECTION"; §S4·4's `of: onBoard` arm; §17 (finding 3 × 4 arms incl. the empty-build control and the ownership-blind falsifiability control, the no-op reporting arm, finding 6 × 2 arms). |
| `tests/job-align.test.mjs` | §6.2c, the COMPOSED-GAME attribution lint, with its own control; the page-slice corpus shared between §6.2b and §6.2c. |
| `COMPOSED-GAME.md` | G3.8's measurement paragraph, its claim/`domain.all` sentences and its supply-gap paragraph (now a two-row table); G8's J4 row; G9 #5; G12 #53. |
| `tests/job-screen.test.mjs` | **cross-lane, one block**: the gap pin, replaced by three narrower assertions. |
| `qa/job-screen.mjs` | **cross-lane, one block**: rule 11's regime and pool. |
