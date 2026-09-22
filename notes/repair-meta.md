# repair-meta — the META lane's round-3 repair

**Owned files:** `site/js/screens/stats.js`, `site/js/screens/settings.js`, `site/data/trophies.js`,
and `tests/job-meta-constants.test.mjs` (the test file whose stated scope is exactly those three).

**Authority:** `designs/REPAIR-DECISION.md` (S1–S5), `designs/r3-findings.json` (every entry whose
`lane` is `meta`, plus every entry in another lane whose **fix lands in a file this lane owns** —
nobody else can make those edits). `BUILD-POLICY.md` overrides both.

---

## 0. The baseline, measured

REPAIR-DECISION §S0 is right and the task's stated baseline is wrong.

```
cd /Users/oliver/Projects/unit1a-quest && node --test tests/
→ ℹ tests 2725 · pass 2720 · fail 1 · skipped 4   (duration 198 s)
✖ tests/job-screen.test.mjs:871  "J6 measured: a full job at 375x667 with the keyboard open,
                                  board <= 36px on every target"   — qa/job-screen.mjs failed
                                  (page.waitForSelector timeout on `.job-screen`)
```

**2720 pass, not 2721, and 1 fail, not 0.** That one failure is S0's, it is in the `screen` lane's
file (`tests/job-screen.test.mjs` / `qa/job-screen.mjs`), it is unrelated to anything in this lane,
and this lane did not touch it. Everything below is measured against that baseline.

## 1. Findings whose `lane` is `meta`

| # | sev | title (short) | disposition | measured |
|---|---|---|---|---|
| M1 | BLOCKER | G9 #5 / G8 J4 sell the Spearman identity as a measurement | **SPEC CORRECTION** — code is right | ρ = 1 is an identity; the measurements are 43 % / 19 % |
| M2 | BLOCKER | tanking dominates honest play; four published claims false | **SPEC CORRECTION** (REPAIR-DECISION S2: zero code) | S2 ruling: no lane may price the 50 rung |
| M3 | BLOCKER | mastering the material demotes you (`state.js` writers) | **NOT THIS LANE** (`call`/`state`); this lane's half was already correct and is now pinned harder | `settings.js:620`/`stats.js:249` already pass `{rank}` (was :515 pre-edit) |
| M4 | BLOCKER | proof 11 / G9 #8 claim a job writes no forecast point | **SPEC CORRECTION** — code is right | `run-lane-r2.test.mjs:202` asserts it writes one |
| M5 | MAJOR | q̂ defined as the first-try rate in the doc and `data/job.js` | **SPEC CORRECTION + REQUEST** (neither file is mine) | the lint already pins my three files |
| M6 | MINOR | `rollingBrier`'s docblock describes the pre-round-2 window | **FIXED, and the root defect under it fixed too** | 0.0225 vs `null` on a real window |
| M7 | MINOR | the stake band is not "printed with its derivation in Settings" | **FIXED in code** (+ one spec correction for "over the four call rungs") | `[0.7629, 0.9253]`, peak 2.500 at 0.8536 |
| M8 | MINOR | `COPY.repeat` has no call site | **REQUEST** — `site/data/job.js` and `screens/job.js` are not mine | — |

## 2. Findings in other lanes whose fix lands in a file this lane owns

| idx | sev | lane | what | disposition |
|---|---|---|---|---|
| 57 | BLOCKER | screen | `guardCard` prints an x̂ law without the ballast β | **FIXED** |
| 30 | BLOCKER | guard | Settings prints the GUARD's own mixing as "the unexploitable" press | **FIXED** |
| 29 | MINOR | screen | rank bands have four 0.1-wide holes and Settings prints them | **FIXED** (= REPAIR-DECISION S3.1(e)) |
| 60 | MINOR | guard | the same-wing run rule is printed with no exception | **FIXED** (copy; the code behaviour is right) |
| 34 | MAJOR | crew | `stats.js` tells the student "the next job will legalise it" | **FIXED** (the `stats.js` half; `legalize()` wiring is the crew lane's) |
| 3 | MAJOR | crew | `stats.js` promises between-jobs re-allocation that does not exist | **FIXED** (the `stats.js` half) |
| 25 | MAJOR | econ | `settings.js:562` (was :457) states the chain/threshold direction unscoped | **REFUSED — do not fix.** See §5 |
| 59 | MINOR | guard | the doc's water-filling pseudo-code does not terminate | **no change**: `settings.js` already prints the fixed one. Doc-side only |
| 53/54 | MAJOR/MINOR | save | trophy save bytes; `settings.game` is an undeclared store key | **NOT THIS LANE** (`store.js` budget rows) |
| 13 | MAJOR | screen | Global law 6 by composition (`settings.js:460`, was :371, + the envelope) | **NOT THIS LANE**: the Settings EV-max table is G7's named exception; the raw-fraction print is `screens/job.js` |
| 11 | BLOCKER | call | cites `settings.js:445`'s (was :356) propriety sentence as falsified | **no change**: REPAIR-DECISION S1 rules finding 11 stale; the sentence is true of the sealed read |
| 37 | MINOR | tests | `job-copy.test.mjs LAYER_SOURCES` does not lint the four screens | **REQUEST** (not my file) |

---

## 3. What was changed, finding by finding

### M6 + the root defect under it — `site/data/trophies.js rollingBrier` — **PASS**

The critic called this "comment-only". It is not. The docblock said the window "holds only
informative ones (`windowPush` drops the rest)"; since the round-2 window fix a non-informative call
takes its slot as `{p: null, w: 0}`, and `rollingBrier` did `calls.slice(-size).filter(finite p)` —
**slice first**. That asks for the last twenty SLOTS to be informative, which is a different and far
harder claim than the one the trophy publishes ("over 20 informative calls"), and it disagreed with
the other surface in this lane that prints the same number: `screens/stats.js reliabilityBlock`
filters first.

Measured through the shipped `callEntry`/`windowPush`, on a 50-slot window that alternates a
calibrated 85-call at q̂ = 0.85 with a blank on mastered material:

```
slots 50 · informative 25
stats.js reliabilityBlock brier = 0.0225      → prints "at or under 0.10"
calibrated trophy earned        = false       → unearned, for ever
```

**Fixed at the root:** filter, then slice. Docblock rewritten to say what the window holds, that the
`Number.isFinite(c.p)` filter is what selects the informative calls (load-bearing, not defensive),
and that the filter comes first. The three existing pins in `tests/job-index.test.mjs:733`
(19 → false, 20 at 0.0225 → true, 20 alternating at 0.3725 → false) all still pass: they build
blank-free windows, which is exactly why they could not see this.

### idx 57 — `settings.js guardCard`: the x̂ law with its ballast — **PASS**

The panel printed `x̂ᵢ = Σⱼ(ωⱼ·shareᵢⱼ) / Σⱼ ωⱼ`. `guard.js xHatFrom` runs a three-term law with a
uniform ballast `β`, and `β/denom` is **0.50 on a two-job window and 0.75 on a one-job window** —
every window a new student has. It also made the panel's own next sentence ("no single job may be
more than a quarter of the window") false, because `ωⱼ ≤ cap·Σposted` bounds ω against Σposted, not
`ωⱼ/Σω`; `β` is what delivers the bound.

Now rendered from `guard.js X_HAT_FORMULA` (`.law`, `.omega`, `.ballast`, `.bound`) through a new
exported pure function `xHatLines()`, with `cap` resolved to `GUARD.jobWeightCap` and the markdown
backticks stripped. The interpolated ω line keeps its `${GUARD.jobWeightCap}` template because
`tests/job-index.test.mjs:843` pins that constant is interpolated; the new test asserts
`xHatLines().omega === X_HAT_FORMULA.omega` with `cap` resolved, so the two cannot drift.

### idx 30 — `settings.js guardCard`: the press paragraph — **PASS**

The one panel G7 allows to print the real formula told the student that "the unexploitable answer is
to spread pressure across the wings in proportion to their study value … a fixed point, not a slogan:
`yᵢ = 1 − k/vᵢ`". `guard.js` exports that same string labelled **the GUARD's** mixing, and exports
`PRESS_PANEL_COPY` — four sentences assembled from the implementation *for this panel* — which had
no consumer under `site/`. The panel now renders `PRESS_PANEL_COPY` verbatim, in order, plus one
sentence for the cap property S5.7 asks for ("no wing is ever drawn more than 75 % of the time").
Measured through the shipped `pressAdvice` on v = (30, 20, 10): `guardMix` puts **0 of 3** tokens on
the lowest-value wing, the board pre-presses **1**, and the maximin puts *more* weight on the lower
wing — the ordering the deleted sentence reversed.

### idx 29 / REPAIR-DECISION S3.1(e) — the rank bands are a partition — **PASS**

```
rating 4.95 → rank 1 Called 1, printed band 0.0–4.9 → contains? false
rating 6.45 → rank 2 Called 2, printed band 5.0–6.4 → contains? false
rating 7.65 → rank 3 Called 3, printed band 6.5–7.6 → contains? false
rating 8.85 → rank 4 Called 4, printed band 7.7–8.8 → contains? false
```

`RANKS[i].bandTop` is a display rounding 0.1 below the next threshold. New exported pure function
`rankBandCells()` prints off `RANK_THRESHOLDS` — the array `rankFor` actually compares against —
as `< 5.0 · 5.0 to < 6.5 · 6.5 to < 7.7 · 7.7 to < 8.9 · ≥ 8.9`. `bandTop` is no longer read by any
file under `site/`. The acceptance test sweeps [0, 10] in 0.01 steps and asserts **exactly one** band
holds each rating and that it is `rankOf(rankFor(r))`'s.

### idx 60 — the same-wing run rule, with its real exception — **PASS**

Measured on the shipped `blockedWing` / `heldWing` / `guardDist`:

```
3 worked RECALL guards          → blockedWing RECALL · guardDist RECALL 0
+ one abandoned RECALL board    → blockedWing RECALL · heldWing RECALL
                                → guardDist.blocked null · guardDist RECALL = 1.0
```

So the same wing *can* be drawn a fourth time running, and the override is inside `guardDist`, not in
Mercy. The `cap` legend now prints the exception (the anti-reroll rule) beside the run rule. The code
is right; only the sentence was incomplete.

### idx 34 + idx 3 — `stats.js crewGrid`'s two false promises — **PASS**

- *"This allocation is over budget and the next job will legalise it."* Nothing legalises anything:
  `crew.legalize(` has **zero call sites** under `site/js` outside `crew.js` itself (the test asserts
  that with comments and strings stripped, so it will go red the moment the crew lane wires it). The
  line now reports `spent` against `capacity` and tells the student to re-allocate. A second line was
  added for the half nobody printed at all: when `budgetFor().wasted > 0`, the lapsed makes are named
  and the wasted points counted — `crew.js`'s own docstring admits that gap and `budgetFor` already
  measures it.
- *"Re-allocation is free and unlimited between jobs and inside every brief window."* There is no
  between-jobs control: `crew.allocate` has one caller chain (`screens/job.js setCrewRank →
  takeBrief → state.brief`) and this grid is a read-only `<table>`. Shipping the between-jobs surface
  is not available to this lane — it needs a new entry point in `state.js` — so the copy now says
  where crew is actually allocated and that the grid is the read-out, not the control. **Request 2**
  carries the feature.

### REPAIR-DECISION S3.1(c) — the ratchet's audit line — **PASS (half of it; see Request 1)**

Both audit surfaces — and only those two — now print `Called 5 · best rating 9.90` from
`player.records.bestRating`, guarded by `Number.isFinite`, so nothing is invented while the record is
absent. It is **not** on the board line, per S3.1(c). The writer of `player.records.bestRating` is the
`save` lane's (Request 1); until it lands the line simply does not render.

### M7 / idx 28 — the stake band, derived — **PASS**

Nothing under `site/` imported `stakeBand` or `stakePeak`; the panel printed the literal
"q̂ ≈ 0.76 to 0.93". New exported `stakeBandLine()` reads both, and prints the substitution G3.1
claims is printed:

```
u = q̂(1 − q̂),  w·E[c] = 40u − 160u²,  peak at u = 0.125
q̂ 0.763 to 0.925, peaking at q̂ 0.854 where w·E[c] = 2.500
```

40 and 160 are interpolated as `RATING.weightK · CREDIT.base` and `RATING.weightK · CREDIT.k`. The
test re-measures the band as the ≥ 80 %-of-peak region of `econ.wTimesEc`.

### The withdrawn claims this lane was printing

Two entries from REPAIR-DECISION's "WHAT WE ARE NO LONGER CLAIMING" were live in `settings.js`:

- **#4** — the `N` legend sold the unfilled-slot arithmetic as an anti-farming *brake* ("which is why
  farming cards you have already mastered produces a rating of 5.00 and not a high one"). Rewritten:
  the same 5.00 is what an honest student reads once their makes are mastered, so it is **no
  measurement**, not a ceiling — and that is why the rank is a ratchet. The substring
  `contributes 0, which pulls the rating toward exactly 5.00`, which `job-index.test.mjs:854` pins,
  is kept.
- **#10** — "it recovers inside fifty informative calls; and it never takes a tool away from you" was
  attributing to the *rating* a property that belongs to the *rank*. Re-attributed.

---

## 4. Tests — `tests/job-meta-constants.test.mjs`, 13 → 31 tests (+18)

Everything that was in this file was a regex over source text. That technique caught round 2's defect
class (a panel restating a constant) and is **blind to round 3's**: a panel can interpolate every
constant correctly and still publish a law the code does not run. Both of this lane's blockers were
that, and both had a green test sitting beside them:

- `tests/job-guard.test.mjs:442` — *"THE PUBLISHED FORMULA IS THE RUNNING ONE: X_HAT_FORMULA,
  implemented literally, IS xHatFrom"* — asserts the exported **string** against `xHatFrom` and never
  looks at the surface that publishes it.
- `tests/job-guard.test.mjs:1270` — *"PRESS_PANEL_COPY names each vector for its own side"* — same
  shape: the paragraph was right in `guard.js` and unused.

So `settings.js` now exports the three pure functions the panels render from (`xHatLines`,
`rankBandCells`, `stakeBandLine`) and the new tests **import and execute** them. `settings.js`
imports cleanly in plain node (verified: `node -e "import('./site/js/screens/settings.js')"`), which
is what makes this possible; nothing about the DOM render path changed.

### NEGATIVE CONTROLS — every one of these was run by reverting the fix and watching the test fail

| control | what was reverted | result |
|---|---|---|
| NC1 | `rollingBrier` back to `calls.slice(-size).filter(...)` | **2 fail** — "a real 50-slot window with blanks in it earns the trophy…", "source: the filter runs BEFORE the slice…" |
| NC2 | `rankBandCells` back to `min`–`bandTop` | **2 fail** — "every reachable rating lands in exactly one printed band…", "source: …never bandTop again" |
| NC3 | `xHatLines` back to the two-term law, `ballast: ''` | **3 fail** — including "the rendered law, implemented literally, reproduces xHatFrom…" |
| NC4 | the false "unexploitable … in proportion to their study value" sentence restored | **1 fail** |
| NC5 | the stake band re-hardcoded to `'q̂ ≈ 0.76 to 0.93'` | **2 fail** |
| NC6 | `best rating` removed from the Stats ledger | **2 fail** |
| NC7 | both crew sentences restored verbatim | **2 fail** |

All seven files were restored from a scratchpad copy and the suite re-run green after each. NC3
failed on the **first** attempt only in its two string arms, not in the behavioural arm — because the
behavioural test had implemented the ballasted law by hand. That is the exact defect this lane is
repairing, so the test was rewritten to **read the cap and the ballast divisor out of the rendered
lines** (`xHatLines().omega`, `.ballast`) and implement whatever the panel prints. NC3 was then re-run
and failed in all three arms, including the arithmetic one.

Each test also carries its negative control **inline**, so it cannot rot:

- the two-term x̂ law is asserted to disagree with `xHatFrom` on exactly **4 of 5** windows (right
  only on the broad 10-job one);
- the `min`–`bandTop` rendering is asserted to leave exactly `[4.95, 6.45, 7.65, 8.85]` in no band;
- the slice-then-filter rule is asserted to return `null` on the window the shipped predicate now
  scores;
- `legalize(` is asserted to have no call site under `site/js`.

---

## 5. Findings REFUTED or refused — no code change, with the command

### idx 25 (`econ`) — `settings.js:457`'s unscoped threshold sentence: **DO NOT FIX**

The critic's fix option (a) is *"scope settings.js:562 (the line the finding calls :457) … and add a test asserting the string"*. Doing
that turns the suite **red**, because another lane already shipped a tripwire that pins the pairing:

```
tests/job-shape-measured.test.mjs:264  "the one place the app states the direction is still
                                        unscoped — so the document may not lean on it"
  const hits  = SETTINGS.match(/chain deepens[\s\S]{0,120}?threshold falls/g) ?? [];
  assert.equal(hits.length, 1);
  assert.equal(/shallow|S\s*<|pile can pay|deep pile/i.test(hits[0]), false,
    'the Settings sentence is now scoped — good; update COMPOSED-GAME G3.2, which currently says it is not');
  assert.ok(/does not scope|scopes nothing|with no scope/i.test(DOC), ...);
```

The copy and the document are a *pair*, and the document half is not mine. Fix option (b) — the doc
says plainly that the app states only the falling direction — is the branch the suite supports.
**Recorded as Spec correction SC-7; no code change.**

### M3 (BLOCKER) — this lane's half of the demotion is already right

```
$ grep -n "ratingDetail(" site/js/screens/settings.js site/js/screens/stats.js
site/js/screens/settings.js:620:  ratingDetail(s.player?.rating?.calls ?? [], RATING.N, { rank: s.player?.rank })
site/js/screens/stats.js:249:     ratingDetail(player.rating?.calls ?? [], RATING.N, { rank: player.rank })
```

Both surfaces already pass the held rank and print `rankOf(rating.rank).name`; REPAIR-DECISION
S3.1(b) says so ("already pass it and become correct as a side effect"). The three *writers*
(`state.applyTarget`, `state.endJob`, `mock.applyMockCall`) are the `call`/`state`/`screen` lanes'.
No change here beyond the audit line above.

### M1 (BLOCKER) — the code is right; only the scorecard is wrong

`crew.js crewValue`'s own docstring already states the identity, in these words: *"Everything to the
left of `w · (1 − m/100)` is a positive constant once the shape is fixed"*, and
`readiness.js:307` is `score: def.w * (1 - (rec?.m ?? 0) / 100)`. So ρ = 1 cannot fail for any save.
The suite's real measurements are `tests/job-align.test.mjs:952-953`:

```
assert.equal(all.top3pct, 43)   // the game's best make is in ΔReadiness's top three on 43 % of boards
assert.equal(all.argpct, 19)    // it is the exact argmax on 19 %
```

and neither number appears in `COMPOSED-GAME.md` (`grep -c alignmentFor COMPOSED-GAME.md` → 0). Also
`crew.js` measures the two argmaxes disagreeing on **870/1000** of this population. No code change —
**SC-1**.

### M2, M4, M5, M7(b) — published claims the code contradicts, or vice versa

All four are document-side. Evidence in §6. No code change.

### The `crew-held` trophy description needs no edit

REPAIR-DECISION's withdrawal #17 lists *"the `crew-held` trophy description"* among the places the
chain-hold is sold as the layer's payment for spaced review. It is not:

```
$ grep -n -A2 "crew-held" site/data/trophies.js
308: list.push(def('crew-held', 'craft', 'Crew Held',
309:   'Have a crew manned in all four wings — RECALL, FIGURES, WORDS and ALGEBRA — at the same time.',
```

No chain-hold, no spaced-review claim, and the predicate counts `crew[make] === 1 || 2`, so it is
rank-agnostic and survives a HELD → DEEP rename untouched (S4 keeps the id). **No change.**

---

## 6. Spec corrections — for whoever owns `COMPOSED-GAME.md`

This lane did not edit `COMPOSED-GAME.md`. Line numbers are as of this writing; the quoted OLD text
is verbatim from the current file, which has moved since the findings were written.

### SC-1 — `COMPOSED-GAME.md:940` (G9 criterion 5) — finding M1

**OLD:**
> 5. **A min-maxer is an optimal student, with numbers and with the domain stated.** Spearman ρ = 1 between the crew-value ordering and `weakSpots()`; the token equilibrium is interleaving weighted by `w × cold`;

**NEW:**
> 5. **A min-maxer is a good student, with the identity and the measurement kept apart.** Spearman ρ = 1 between the crew-value ordering and `weakSpots()`'s sort key is an **arithmetic identity, not a measurement** — `crewValue` is a positive constant of the shape times `w·(1 − m/100)`, which is that sort key (`crew.js crewValue`, `readiness.js:307`), so ρ = 1 cannot fail for any save. What is measured is **43 % top-three and 19 % exact-argmax against ΔReadiness over all nineteen makes** (99 % / 57 % over the makes the board actually serves), `tests/job-align.test.mjs` §6.2, and mean ρ(all) = 0.65 over 24 corpora in §6.3; the token equilibrium is interleaving weighted by `w × cold`;

### SC-2 — `COMPOSED-GAME.md:917` (G8, the J4 acceptance row) — finding M1

**OLD (the clause):**
> **Spearman ρ = 1 between `crewValue` order and `readiness.weakSpots()` order over 1 000 random saves**, with the `q̂ ≥ 0.5` domain restriction asserted explicitly

**NEW:**
> `crewValue` is an exact positive multiple of `readiness.weakSpots()`'s sort key, asserted as the **identity** it is (ρ = 1 over 1 000 random saves is a property of the expression); the *measured* alignment claims are §6.2's **43 % top-three / 19 % exact-argmax over all nineteen makes** and §6.3's mean ρ(all) = 0.65 over 24 corpora, with the `q̂ ≥ 0.5` domain restriction asserted explicitly

### SC-3 — `COMPOSED-GAME.md:585` (G3.8) — finding M1

**OLD (the last sentence):**
> There is no step in the min-maxer's list that is not also the best available study action, and the proof is arithmetic rather than assertion.

**NEW:**
> The part that is arithmetic is the **identity** `crewValue ∝ w·(1 − m/100)` — the same sort key `weakSpots()` uses — and `crew.js crewValue`'s own docstring lists the four ways the unrestricted claim ("no step in the min-maxer's list is not also the best available study action") is false as written, each as a computed, exported, tested quantity: ΔReadiness carries the `min(1, n/5)` evidence-depth term this gradient drops, and the two argmaxes disagree on **870 of 1 000** seeded saves of this population.

### SC-4 — `COMPOSED-GAME.md:555` (§3.7 proof 11) — finding M4

**OLD (the clause):**
> `forecastLog` is NOT one of them and never was: it is Readiness' forecast trace, written by `readiness.logForecast` from `screens/run.js finish()`, and a job's `finish()` calls `state.endJob` and writes no forecast point. The same test pins that divergence in the direction it really runs;

**NEW:**
> `forecastLog` is NOT one of them and never was: it is Readiness' forecast trace, not study progress. A **completed** job now writes the same forecast point, `runs[]` record and daily-goal check that `#/run/page` writes — `screens/job.js renderDebrief → jobSummaryContext → screens/run.js commitJobRun` — and a bagged, quit or walked job writes none, exactly as a mid-page exit writes none. `tests/run-lane-r2.test.mjs` ("the other two writes land too: the daily goal is checked and the forecast is logged") is the pin, and `tests/job-ledger.test.mjs` compares `forecastLog` between the two routes as byte-identical rather than as absent;

### SC-5 — `COMPOSED-GAME.md:943` (G9 #8) — finding M4

**OLD (the parenthesis):**
> (`forecastLog` is Readiness' forecast trace, not study progress, and a job writes none; the same test pins that. See §3.7 proof 11.)

**NEW:**
> (`forecastLog` is Readiness' forecast trace, not study progress. A completed job writes one, identically to `#/run/page` — pinned in `tests/run-lane-r2.test.mjs` and compared byte-for-byte in `tests/job-ledger.test.mjs` — and a bagged or quit job writes none. See §3.7 proof 11.)

### SC-6 — `COMPOSED-GAME.md:448` (§3.2, the stake band) — finding M7

**OLD:**
> the band the app names is the **stake band `q̂ ∈ [0.763, 0.925]`** — derived, printed with its derivation in Settings, and asserted in `job-econ.test.mjs` as the ≥ 80 %-of-peak region of `w(q̂)·E[c](q̂)` over the four call rungs.

**NEW:**
> the band the app names is the **stake band `q̂ ∈ [0.763, 0.925]`** — computed in `econ.stakeBand()` from the **continuous** `w(q̂)·E[c](q̂)`, printed in Settings with its own substitution (`u = q̂(1 − q̂)`, `w·E[c] = 40u − 160u²`, peak `u = 0.125`), and asserted in `job-econ.test.mjs` as its ≥ 80 %-of-peak region. The four-rung **discrete** object is a different one and its band is `[0.779, 0.925]`.

### SC-7 — `COMPOSED-GAME.md` G3.2 — finding idx 25, and why no code moved

The document must keep saying that the app's one statement of the escalation direction is
**unscoped**, because `tests/job-shape-measured.test.mjs:264` pins exactly that pairing and scoping
the Settings copy would break it. If a later ticket wants the copy scoped, it has to move the
document and that test in the same commit. (No replacement line: the current doc text already says
it, which is why this is a "do not fix", not a correction.)

### SC-8 — `COMPOSED-GAME.md:361` and `site/data/job.js:194` — finding M5

Already specified verbatim in REPAIR-DECISION §S1.5; repeated here because the finding is in this
lane. `site/data/job.js:194` still reads `/** q̂ is the first-try rate on that make over the trailing
10 attempts (G3.1). */` — verified this session.

### SC-9 — the four tanking claims — finding M2

REPAIR-DECISION §S2.4 specifies the replacements verbatim for `COMPOSED-GAME.md:549` (G3.7 #8),
`:539` (G3.7(3)(d)) and `:260` (G2), and §S2.5 the residual. The current file still carries the old
text at all three; the strings to search for are `Tanking is strictly dominated.`,
`raisable only by clearing *more of the packet*` and
`**Mastery strictly dominates forgiveness**`. Nothing in this lane's three files repeats any of
them (verified by grep), so no code moves for S2.

### SC-10 — `COMPOSED-GAME.md:617` (G4 "Tense when strong")

**OLD (the last sentence):** `Attendance cannot produce it.`
**NEW:** `Attendance cannot produce it; a chosen outcome can, and buys nothing, because the rank it would buy is already held.`
(REPAIR-DECISION S2.4's wording. Recorded here because finding M2 names this line.)

---

## Requests

1. **`save` lane — write `player.records.bestRating`.** REPAIR-DECISION S3.1(c) makes it the audit
   trail the rank ratchet owes (G7's save table, G9 #4). Both audit surfaces in this lane already
   print it, guarded by `Number.isFinite`, so nothing breaks while it is absent and it starts
   rendering the moment it exists: `site/js/screens/settings.js` (ratingCard, the `set-now` line) and
   `site/js/screens/stats.js` (`ledgerPanel`, the `st-ledger-rating` line), both as
   `· best rating 9.90`. A plain number beside the existing `records.bestRating20`, high-water,
   updated wherever the rating is written.

2. **`crew` lane — between-jobs crew allocation, or the doc line goes.** `crew.allocate` is reachable
   only through `screens/job.js setCrewRank → takeBrief → state.brief`, so there is no between-jobs
   surface for `COMPOSED-GAME.md:189` ("re-allocation is free and unlimited between jobs and inside
   every brief window") to be true of. This lane's copy has been corrected to what ships. If you want
   the surface, `stats.js crewGrid` is the obvious home and I will add the buttons — but it needs a
   state entry point that does not require an in-progress job, which is `state.js`, not mine. Tell me
   which and I will match it.

3. **`crew` lane — `CHAIN_HOLD_MIN` and `crewFor().chainHold` / `.lapsed` are consumed here.** If S4
   ships (r2 becomes DEEP, the chain-hold deleted), these break:
   - `site/js/screens/stats.js:33` — a **named** import of `CHAIN_HOLD_MIN` from `js/job/crew.js`; if
     the export goes, the module fails to load and the whole Stats screen dies.
   - `site/js/screens/stats.js:318` — `r.chainHold ? 'holds the chain at …' : …` and
     `r.lapsed ? 'lapsed — pays STEADY'` in the crew table's State column.
   - `site/js/screens/settings.js:548` — the crew table prints `r.chainHold` from `CREW_RANKS`.
   - `tests/job-meta-constants.test.mjs:31` — imports `CHAIN_HOLD_MIN` too, and §1 asserts the Stats
     capacity sentence interpolates it.
   Tell me the gate's outcome (S4 or the S4.7 fallback) and the HELD → DEEP label decision and I will
   land both in one pass. **Do not edit these four files** — BUILD-POLICY §2.

4. **`tests` lane — extend the `first-try rate` lint, once the doc lane has moved.**
   REPAIR-DECISION S1.3(2) asks for `tests/job-meta-constants.test.mjs:206-216`'s file list to grow to
   `site/data/job.js` and `COMPOSED-GAME.md`. **I have not added it**, because both files still say
   "first-try rate" today and the lint would turn the suite red, which the hard rule forbids. The
   exact edit, to apply in the same commit as SC-8:
   ```js
   for (const [name, src] of [['settings.js', SETTINGS], ['stats.js', STATS],
                              ['trophies.js', read('site/data/trophies.js')],
                              ['data/job.js', read('site/data/job.js')],
                              ['COMPOSED-GAME.md', read('COMPOSED-GAME.md')]]) {
     assert.ok(!/first-try rate/.test(prose(src)), `${name} still prints "first-try rate" for q̂`);
   }
   for (const p of ['site/data/job.js', 'COMPOSED-GAME.md']) {
     assert.match(read(p), /CLEAR rate/, `${p} does not state the CLEAR rate`);
   }
   ```

5. **`tests` lane — add the four screens to `job-copy.test.mjs LAYER_SOURCES`** (finding idx 37).
   `settings.js`, `stats.js`, `home.js` and `run.js` carry most of the layer's prose and are not
   linted; that is why the false guard sentence lived in `settings.js` for a round. Not my file.

6. **`board`/`screen` lane — `COPY.repeat` ('repeat · scope 0.5') has no call site** (finding M8).
   `site/data/job.js` and `screens/job.js` are not mine. Render it on the second board of an evening
   (where G3.7(3)'s anti-grind story needs it) or delete it and its `job-copy.test.mjs` lint row.

7. ~~**`screen` lane — S0 is still open.**~~ **CLOSED** — `tests/job-screen.test.mjs:871` passed on
   this lane's final full run (66 s, ✔). Nothing in this lane ever touched it.

---

## Result

```
cd /Users/oliver/Projects/unit1a-quest && node --test tests/job-meta-constants.test.mjs
→ ℹ tests 31 · pass 31 · fail 0        (13 before this ticket)

cd /Users/oliver/Projects/unit1a-quest && node --test tests/
→ ℹ tests 2812 · suites 369 · pass 2808 · fail 0 · skipped 4 · EXIT 0   (238 s)
   ✔ J6 measured: a full job at 375x667 with the keyboard open …        ← S0 is fixed; the
                                                                          screen lane landed it
                                                                          while this lane worked
```

**GREEN.** The baseline was 2725/2720/**1 fail**; it is now 2812/2808/**0 fail** — the other twelve
lanes added 87 tests alongside this lane's 18, and the S0 pre-flight failure is gone. One earlier
snapshot of this lane's own full run showed four failures in `tests/job-exploit.test.mjs`
("S2 · the throw is priced…"); that file imports nothing this lane owns, it was another lane's S2
pins mid-write, and it re-ran clean (56/56) minutes later. Request 7 below is therefore **closed**.

**The two screens were also RENDERED, in a real browser**, not just imported — the panels are DOM
trees and a test that imports a pure function does not prove they paint:

```
node qa/layout-audit.mjs --only settings,stats --vp phone --engine chromium --theme light
→ 3 states x 7 viewports — settings, stats, settings-export
→ LAYOUT AUDIT — 0 findings (0 waived) · verdict: 0 blockers, 0 majors → PASS

node --test tests/fix-stats.test.mjs tests/layout-audit.test.mjs
→ ℹ tests 8 · pass 8 · fail 0 · skipped 0     (Playwright really ran; nothing skipped)
```

Files changed by this lane, and nothing else:

- `site/js/screens/settings.js` — `xHatLines()`, `rankBandCells()`, `stakeBandLine()` added and
  exported; `guardCard` renders `X_HAT_FORMULA` and `PRESS_PANEL_COPY`; the `cap` legend gains the
  held-wing exception; `ratingCard` prints the partition, the derived stake band, the audit line, and
  two re-attributed sentences.
- `site/js/screens/stats.js` — `ledgerPanel` prints the audit line; `crewGrid`'s two false promises
  withdrawn and the wasted-point line added.
- `site/data/trophies.js` — `rollingBrier` filters before slicing; docblock rewritten.
- `tests/job-meta-constants.test.mjs` — +18 tests, each with a negative control.

---

# Verify round 1 — the META lane

Two findings, one BLOCKER in this lane's code and one MAJOR in a document this lane does not own.
Everything below was measured on this tree, with the shipped modules, at the timestamps shown.

## V1 [BLOCKER] `best rating 0.00` — the printed audit line was invented, and the test was a grep

**The finding is right, in both halves.** Reproduced through the shipped functions before touching
anything (`scratchpad/best-repro.mjs`, the printers' own expressions):

```
fresh bestRating = 0 | isFinite: true
fresh rating.value = 5 | rank 2 Called 2
CURRENT SETTINGS LINE -> 5.00 · Called 2 · best rating 0.00 · 0 of 50 informative calls
migrated old save bestRating = 0
SAVE_DEFAULTS default = 0
normalizePlayer({}) = 0
```

### Root cause, and where the root is

`Number.isFinite(bestRating)` was written as "has the save ever recorded a high-water?" and it has
not meant that since S3.1(c). The field is **declared** in both copies of the schema with a default
of `0` (`site/data/job.js:648`, `site/js/store.js:114`) and `normalizePlayer` coerces *every* value
— absent, string, NaN, ±Infinity, object — to that same `0` (`store.js:184`). Under a declared
field there is no "absent" state left for the guard to see: `0` **is** the absence, and the two
audit surfaces printed it as a reading, beside the rank it exists to audit (G9 #4's one printed
exception to "recomputable from the save").

The schema is the save lane's file and is not wrong — the fix belongs in the two printers, which are
this lane's, and it is the reading of the sentinel that was wrong. Both now ask the question they
meant to ask, through one named predicate per surface, with the reasoning on it:

```js
export const hasBestRating = (v) => Number.isFinite(v) && v > 0;
```

`> 0` is safe in both directions. Both writers (`state.applyTarget`, `state.endJob`, and
`screens/mock.js applyMockCall`) raise the high-water off `ratingDetail().value`, and an unmeasured
window alone already reads `RATING.base` = 5.00, so every save that has ever staked a target holds a
positive record. The one value it hides is a genuine high-water of exactly `0.00` — a single
catastrophic staked call, clamped at the floor, with nothing since — which prints nothing until the
next call lifts it. That **under**-reports by one line; it never invents one, and on disk that state
is indistinguishable from "never written" anyway. Both docblocks now say this instead of the
sentence the critic caught ("until the save holds one there is nothing to print").

### The printers are now callable, which is the other half of the fix

A grep test could not fail because there was nothing to run: `ratingCard` is nested inside
`mountSettings` and `ledgerPanel` was module-private. Both surfaces now build their headline in an
**exported, DOM-free line-builder** that the panel renders and the test executes — the same pattern
this file already uses for `xHatLines()` / `rankBandCells()` / `stakeBandLine()`:

- `screens/settings.js` → `hasBestRating`, `ratingAuditParts(save)`, `ratingAuditLine(save)`
- `screens/stats.js`   → `hasBestRating`, `ledgerRatingParts(save)`, `ledgerRatingLine(save)`

`neg` / `f1` / `f2` / `f3` moved from inside `mountSettings` to module level (unchanged otherwise),
because an exported builder cannot reach a formatter that lives inside the mount closure.

After:

```
fresh    SETTINGS -> 5.00 · Called 2 · 0 of 50 informative calls
fresh    STATS    -> 5.00 Called 2 · rating unchanged · no measurement · 0/50 informative calls
migrated SETTINGS -> 5.00 · Called 2 · 0 of 50 informative calls
record   SETTINGS -> 5.00 · Called 2 · best rating 9.54 · 0 of 50 informative calls
record   STATS    -> 5.00 Called 2 · best rating 9.54 · rating 5.09 · 1/50 informative calls
```

### A second defect, found by running the builder rather than reading it

The moment the Stats headline could be executed it printed **`undefined`** to the student:

```
STATS (before) -> 5.00 Called 2 · undefined · rating unchanged · no measurement · 0/50 informative calls
```

`COPY.ratingLine` is `({ rank, rating, n, N }) => …` and LEADS WITH THE HELD RANK (SPEC-CORRECTIONS
I-4, REPAIR-DECISION S3.1(d)) — `screens/stats.js` called it with no `rank` at all, so every save on
an unmeasured window rendered `${undefined} · rating unchanged · …`. It was invisible to the whole
suite for the same reason the 0.00 was: no test ever ran the builder. The panel prints the rank in
its own span (G9 #4 publishes the order `Called 5 · best rating 9.90`), so it now asks the copy
table for the same sentence with an empty rank and drops the separator that leaves — the words stay
single-sourced from the table, and the rank is printed exactly once. Not in `r3-findings.json`; it
is in this lane's file, on this lane's line, so it is fixed here rather than filed.

### The tests

`tests/job-meta-constants.test.mjs` §9 — the grep at :739-744 is **gone**, replaced by three
behavioural tests (the source arm above it, which pins that the sentence interpolates rather than
restates, is untouched):

1. *a save that has never recorded a high-water prints no audit number at all* — `store.fresh()` and
   `migrate({v: SAVE_VERSION})`, through `ratingAuditLine` / `ledgerRatingLine`: no `best rating`,
   no `0.00`, and the line still leads with the live 5.00. Plus the control that the guard is not
   simply "never print": a real record renders on both surfaces.
2. *after one played job the printed high-water is `max(rating over the play)`* — one job driven
   through the real machine (`startJob → beginTargets → lockCall → applyTarget → push/brief/crack`),
   no RNG, with the card-history write the grade path owns done by the test (`js/job/*` may not
   write Ledger A). It asserts the arm really played (≥ 5 staked targets, ≥ 3 distinct ratings) and
   that the high-water is **strictly above** the live rating, so the two numbers cannot be confused:
   `staked 9 · ratings 4.677 4.892 5.108 4.785 4.949 5.164 4.841 5.087 5.087 · high 5.16 · live 5.09`
   and both surfaces print `best rating 5.16`.
3. *both audit surfaces answer "is this a record?" identically, value by value* — 14 values across
   the two `hasBestRating` copies, including `0` and `0.0001`.

**Negative control (the mutation actually run, then reverted):** with
`hasBestRating = (v) => Number.isFinite(v)` restored in both files,
`node --test tests/job-meta-constants.test.mjs` → **34 tests, 32 pass, 2 fail**, first message:
`Settings on a fresh save invents the ratchet's audit record: "5.00 · Called 2 · best rating 0.00 · 0 of 50 informative calls"`.
Both files were restored from a scratchpad copy in the same command.

### One hazard for the save lane

The finding's alternative fix — *"seed the default from `SAVE_DEFAULTS.player.rating.value` (5.0)"* —
**would fail test 1 above, and it should.** A fresh save would then print `best rating 5.00`, which
is an invented record with a friendlier number. `tests/job-save.test.mjs:346`
(`normalizePlayer({}).records.bestRating === 0`) was NOT touched and does not need to be: `0` is a
perfectly good declared default once the printers read it as the sentinel it is.

## V2 [MAJOR] the 380 keyboard findings — verified, and both sentences corrected

### (a) "which pre-date this round" is false — measured

```
$ git log --format='%h %ci %s' -2 -- qa/audit-states.mjs
ca53259 2026-09-21 21:23:35 -0400 THE JOB game layer: 11 tickets built, 2 critic rounds applied (pre-repair baseline)
3a57ff5 2026-09-18 01:46:58 -0400 Container-driven layout: fix collapsed question text at desktop width, add a full-matrix layout auditor

$ git show 3a57ff5:qa/audit-states.mjs  | grep -c 'job-answer-kb'    → 0
$ git show 3a57ff5:qa/audit-states.mjs  | grep -c 'VP_KB'            → 0
$ git show 3a57ff5:qa/layout-audit.mjs  | grep -c 'visualViewport'   → 0   (78 693 bytes read)
$ git show ca53259:qa/audit-states.mjs  | grep -c 'VP_KB'            → 3
$ git show ca53259:qa/layout-audit.mjs  | grep -c 'visualViewport'   → 2
```

The two states, `VP_KB`, `pinKeyboard` **and the fold model every one of these findings is measured
against** do not exist in the last commit before this campaign (18 Sep). They exist in the
campaign's own baseline commit, and the harness names the critic who asked for them in its own
comments — `qa/audit-states.mjs:864` *"(layout-safari finding 4)"*, `:1004` *"ROUND 3
(layout-safari)"*. The layer's own notes record the matrix at **0** before them
(`notes/screen-fix.md:186`, the un-mutated 44-row `--only job --engine both --theme both` sweep;
`notes/tests-fix.md:8`). So this round created the states, this round moved the fold, and this
round's findings are the first findings those states have ever produced. "Pre-date this round"
cannot survive that, whatever the number turns out to be.

### (b) the reachability half, confirmed structurally without a browser

`pinKeyboard` (`qa/audit-states.mjs:1013-1021`) focuses
`'.card-parts input:not([type="hidden"]), .card-parts textarea'` and pins the 336 px keyboard
whether or not it found one. On a cloze card **whose blanks have choices**,
`site/js/widgets/cloze.js:49` renders `button.w-cz-slot` and pushes `{ …, input: null }` — the
branch that renders `input.w-cz-in` (:58) is the *no-choices* branch. There is nothing to focus, so
the critic's measured `focusCandidates = 0 · document.activeElement === BODY` is exactly what that
card produces: a keyboard pinned open on a card that opens none. The harness fix is the tests /
layout lane's; this note only confirms the mechanism it has to fix.

### What was changed, and why this lane touched two files it does not own

Both sentences are one clause of false attribution inside a document that is the authority for the
next ticket, and the fix instruction ("drop *which pre-date this round* either way") is
unconditional — it does not wait on the re-measure. Both edits are exact-match single-clause
replacements, which fail harmlessly if the owner has already rewritten the line, and
`COMPOSED-GAME.md` was being written while this ticket ran (its line number moved 1207 → 1210
between this lane's read and its write, and the edit still landed cleanly on the clause).

- **`COMPOSED-GAME.md`, item 70's last clause** — "which pre-date this round and live in the study
  layer's card chrome" is replaced by the provenance (both states and the fold are this round's own,
  named with their files), the measured `0` before them, the fact that `pinKeyboard` still pins the
  keyboard with no field focused, and therefore that the state must be made reachable and
  **re-measured before its count means anything**. The count itself is no longer asserted: 380 is
  the whole `--only job,run,home` run, 370 of it in these two states, and the verifying critic
  measured 372 — three numbers for one claim, none of them re-measurable until the harness is fixed.
- **`designs/SPEC-CORRECTIONS.md:202`** — the analysis is left standing and a **VERIFY ROUND 1**
  sentence is appended to it with (i) the git evidence above and (ii) the reachability gap, and it
  now says in the bullet's own words that the count and the "layout lane of its own" conclusion are
  *unverified* until the harness focuses a real field.

**Request V2-c · for the tests / layout lane, then the doc owner.** After `pinKeyboard` focuses a
control that really opens a keyboard (on a choices-cloze that is a `button.w-cz-slot`, not an
input), re-run `node qa/layout-audit.mjs --only job,run,home --engine both` and write the new
number into both places. If it comes back clean, delete the clause from item 70 rather than restate
it, and record the states' first honest number in `notes/tests-fix.md`.

## Result

```
cd /Users/oliver/Projects/unit1a-quest && node --test tests/job-meta-constants.test.mjs
→ ℹ tests 34 · pass 34 · fail 0     (this lane: 31 before, +3 behavioural, −1 grep)
→ ℹ tests 49 · pass 49 · fail 0     (re-run 25 min later: another verify lane appended its own
                                     doc-claim tests to this same file while this ticket ran, and
                                     all 49 are green together)
```

### The full suite: red from other lanes, and not from this one

Three full runs while twelve fixers wrote the tree at once:

```
02:48  node --test tests/  → tests 2834 · pass 2824 · fail  6 · skipped 4 · EXIT 1
03:05  node --test tests/  → tests 2852 · pass 2812 · fail 36 · skipped 4 · EXIT 1
03:20  node --test tests/  → tests 2886 · pass 2863 · fail 19 · skipped 4 · EXIT 1
```

The count moves every run because the tree is being written under the runner — the test total rose
2834 → 2886 during this ticket, and another verify lane appended tests to
`tests/job-meta-constants.test.mjs` itself. **No failure in any of the three runs is in a file this
lane owns, and none of their messages names one.** The failing files, and what they name:

| failing test | what the assertion names | lane |
| --- | --- | --- |
| `job-call.test.mjs` THE PIN | `site/js/screens/run.js:1813 → qHatFor(…, { before: … })` | run |
| `job-debrief.test.mjs` | the regret line's numbers moved (`q* 0.57 / cost 75` vs `0.71 / 11`) | debrief/econ |
| `job-econ.test.mjs` (×15, run 2 only) | `pushMinusBag`, `breakevenQExact`, the printed q\* | econ |
| `job-exploit.test.mjs` | `site/js/job/crew.js reaches for rngFrom` | crew |
| `job-save.test.mjs` (×3, run 1 only) | the save grew: 39.23 KB > 37.1 KB, archive 35.08 > 32.90 | save/state |
| `job-state.test.mjs` | `screens/mock.js applyMockCall` no longer lifts the rating | state |
| `job-week.test.mjs` (×7), `job-align.test.mjs` (×3), `job-board`, `job-screen`, `mock` | crew pricing, the Mock's slot, `payoutLineOf`, the measured job | crew / mock / screen |

The check that matters for this lane, re-run at the end:

```
cd /Users/oliver/Projects/unit1a-quest && node --test tests/job-meta-constants.test.mjs
→ ℹ tests 49 · pass 49 · fail 0 · EXIT 0
```

(and `grep -c 'screens/stats.js\|screens/settings.js\|data/trophies.js'` over the whole run-3 log
finds this lane's files on four lines, all of them `✔`: the two `Math.random` scans and the
`trophies.js` import scan.)

**Both screens were RENDERED, not just imported** — a pure-function test does not prove a panel
paints, and this ticket moved `f2` out of the mount closure and changed what `h()` is handed:

```
node qa/layout-audit.mjs --only settings,stats --vp phone --engine chromium --theme light
→ 3 states x 7 viewports (stats · settings · settings-export), + text-zoom and reduced-motion
→ LAYOUT AUDIT — 0 findings (0 waived) · verdict: 0 blockers, 0 majors → PASS   (EXIT 0)

(and in the full run) ✔ fix:stats r2 — measured: 44px hit boxes and a live wide layout (2.6 s, chromium)
```

Files changed by this verify round:

- `site/js/screens/settings.js` — `hasBestRating`, `ratingAuditParts()`, `ratingAuditLine()` added
  and exported; `ratingCard` renders the parts; `neg`/`f1`/`f2`/`f3` moved to module level.
- `site/js/screens/stats.js` — `hasBestRating`, `ledgerRatingParts()`, `ledgerRatingLine()` added
  and exported; `ledgerPanel` renders the parts; the `COPY.ratingLine` call gets the `rank` it always
  required, so the headline stops printing `undefined`.
- `tests/job-meta-constants.test.mjs` — the §9 grep replaced by three behavioural tests (+2 net).
- `COMPOSED-GAME.md` item 70 and `designs/SPEC-CORRECTIONS.md:202` — one clause each, V2 above.
- `site/data/trophies.js` — untouched this round; no verify-1 finding names it.

---

# VERIFY ROUND 2 — the META lane

**Owned:** `site/js/screens/stats.js`, `site/js/screens/settings.js`, `site/data/trophies.js` and
`tests/job-meta-constants.test.mjs`. Two findings, both against `COMPOSED-GAME.md`, both
**CONFIRMED by re-running the critics' own measurement before touching anything**, and both fixed
as far as this lane's ownership reaches — with the two mechanics that would close them at the root
filed as Requests below rather than left implied.

**Reproduction moved into the repo.** Both criticisms were measured from scripts in `/tmp`, and
macOS reaps `/private/tmp` after about three days. The measurement this round publishes is now
`notes/repair-meta-evidence.mjs` (same pattern as `notes/repair-call-evidence.mjs`): imports only
from `site/`, writes nothing, ~40 s, and is deliberately NOT in `node --test tests/`.

```
cd /Users/oliver/Projects/unit1a-quest && node notes/repair-meta-evidence.mjs
```

---

## V2-1 [BLOCKER] The rank is farmable at zero GAME cost by marking free STUDY sittings wrong

### Verdict: CONFIRMED, and reproduced twice — once on the critic's script, once on my own port

The critic's script still existed and reproduces verbatim:

```
$ node /tmp/exh/e12.mjs
seed 1: MASTER rank=2 loot=23238 (phase2 15006) | SANDBAG rank=4 loot=25722 (phase2 17912) → phase2 +19.37%
…
TOTAL loot 175030 → 184385 = +5.34%;  POST-CLIMB 115125 → 127917 = +11.11%;  wins BOTH currencies 6/8
```

My in-repo port (different RNG tag, so different draws — the conclusion is not a seed artefact):

```
$ node notes/repair-meta-evidence.mjs
§1  seed 1..8: MASTER rank=2 on 8/8, SANDBAG rank=4 on 8/8, study ledger identical: true on 8/8
    TOTAL loot 175030 → 184802 = +5.58%
    POST-CLIMB 115125 → 128518 = +11.63%   sandbag wins BOTH currencies on 6/8
§2  study clear rate 0.2 → RANK 3/4 (ceiling 5.40 / 7.86)
    study clear rate 0.8 → RANK 4/4 (ceiling 8.28 / 6.76)
```

The mechanism is exactly as cited. `call.qHatFor` builds `w = 4q̂(1−q̂)` out of
`save.cards[*].history`; `screens/card.js` pushes an entry there on **every graded original**, on
both the cleared branch and the missed branch, with no job test between the branch and the write. A
card failed on a plain Today's Page therefore moves the anti-farming weight and pays **no carry, no
chain and no rating** — which is G3.7 proof 4's own result, read the other way round. Everything
proof 8 priced ("the target itself, the chain, the XP, the bucket and the Readiness") is measured on
a throw that IS a staked target; the first two terms are zero for the throw an exploiter makes. In
the two arms above `schedule.applyOutcome` never runs on a thrown sitting, so Leitner box, due,
reps, lapses, ease, rarity, `skills` and `xp` are **byte-identical between the arms on 8 of 8**.

The cap does not bind either, and the critic's reason is right: the student is not lying about the
*report*, only choosing the *evidence*. `slotCeiling` resolves `w`'s two roots by taking the
flattering one, so a chosen q̂ = 0.2 at the 85 call is priced exactly as an earned q̂ = 0.8. Its own
docstring defence — "that lie's realised rating is catastrophic on exactly the material that makes
the branch ambiguous" — assumes the student's true clear probability equals q̂, and it does not when
the student picked q̂.

**Published bound before this round: "at most 2.5 % overall". Measured: +11.6 % post-climb and two
ranks. 4.6×.**

### What changed

| file | change |
| --- | --- |
| `COMPOSED-GAME.md` §3.7 proof 8 | new paragraph **VERIFY ROUND 2**: the throw need not be a job target, the measurement, the `slotCeiling` half, and the open mechanic |
| `COMPOSED-GAME.md` G3.8 #4 | *"Desirable difficulty is the only path to rank"* **withdrawn**; the step now states what is true (dearest, not only) |
| `COMPOSED-GAME.md` G9 #6 | **"Nothing can be farmed"** withdrawn; the criterion states its own exception and says it FAILS today |
| `COMPOSED-GAME.md` G9 preamble | "All ten must pass" → nine do, and which two carry what |
| `COMPOSED-GAME.md` G11 | both withdrawals added to the withdrawn-claims list |
| `COMPOSED-GAME.md` G12 | entry **VR2-FARM** (lettered, not numbered — the doc lane was appending 78–81 to the same changelog in the same hour and a duplicated `78.` is worse than a letter) |
| `site/js/screens/settings.js` | the rating panel gains an **`the evidence`** row: every graded original is a sitting, the game stakes only job targets, so the evidence that sets `w` is made somewhere the game charges nothing — and what it DOES cost is the study ledger |
| `tests/job-meta-constants.test.mjs` | §8 pins the two mechanism facts (microseconds, not 48 jobs) and §9/§10 pin the published claims |
| `notes/repair-meta-evidence.mjs` | new; the end-to-end measurement, in the repo |

**Why the Settings row rather than silence.** G9 #4 is "every probability is printed before the
decision it affects" and the document's whole architecture is publishing what it cannot close. The
row names the mechanic *and* its real price — the bucket drops, the mastery hit lands, the error is
logged, Readiness falls — which is the honest framing and also the only true deterrent: the thing it
costs is the thing the app is for.

**Why not just fix `w` here.** `qHatFor` is `site/js/job/call.js` and `rec.history.push` is
`site/js/screens/card.js`. Neither is this lane's file, and eleven other fixers are in the tree.
Request A below.

---

## V2-2 [MAJOR] The agreement claim carries no consistent-player condition

### Verdict: CONFIRMED

```
$ node /tmp/splitcrit/regime.mjs
history tap  → tonight tap : n=20 worst=1   (save 17 JOB: printed 28 vs measured 29,   ledger) over5=0
history full → tonight full: n=20 worst=1.7 (save 17 JOB: printed 33 vs measured 34.7, ledger) over5=0
history tap  → tonight FULL: n=20 worst=6.9 (save  7 JOB: printed 32 vs measured 38.9, ledger) over5=20
history full → tonight tap : n=20 worst=7.4 (save  1 VAULT: printed 40 vs measured 32.6, ledger) over5=18
```

The regimes are the app's own two published fixed-phase columns (`FIXED_PHASES.JOB.default` vs
`.full`), so this is not an invented clock. And the coverage gap is real: `job-split.test.mjs`'s
`seasoned(id, clock, jobs)` replays `walkWithClock(s, id, clock)` — **the same clock and the same
path it then measures** — so no arm in the suite crosses a regime. One nit in the finding's prose
is wrong and does not matter: `walkWithClock` *does* have a `brief` branch (`brief(save, {}, …)`),
it simply taps through it; the arm it lacks is the CHANGE of surface between history and tonight.

The failure is per-window: `projectFor` charges one blended `means.brief` per openable window
instead of the student's own rate of opening one. And the line still labels itself `ledger`, so the
board claims the student's own five jobs while being 7 points out.

### What changed

| file | change |
| --- | --- |
| `COMPOSED-GAME.md` G9 #1 | the claim now says "each measured against a history of its OWN surface", and publishes the four measured cells with 6.9 / 7.4 and the 20/20, 18/20 counts |
| `COMPOSED-GAME.md` G8, J8 row | the same condition, inline, plus the fact that no arm exercises the change |
| `COMPOSED-GAME.md` G11 / G12 | withdrawal bullet + entry **VR2-SPLIT** |
| `tests/job-meta-constants.test.mjs` | §9 pins the condition and the two measured numbers against drift |

`board.js projectFor` and `tests/job-split.test.mjs` are not this lane's files. Requests B and C.

---

## Requests — the two root mechanics this lane may not land, and the arm that would catch them

**Request A (call lane / exploit lane, BLOCKER, closes V2-1 at the root).** Build `q̂` only from
sittings that were themselves **staked job targets**, so manufacturing evidence costs what the
throw-rate pin in `tests/job-exploit.test.mjs` already measures. Concretely: `screens/card.js`
marks its history entry with the surface that graded it (or `state.applyTarget` writes a parallel
staked-sitting list), and `call.qHatDetail` filters on it. Two alternatives were considered and are
weaker, both recorded here so the next round does not re-derive them: (b) dropping the ratchet's
FLOOR back to a per-window recomputation whenever the window's evidence moved by more than a
threshold — this re-opens the S3 demotion the ratchet exists to close; (c) storing q̂ in the window
entry so `slotCeiling` stops taking the flattering root — a save-schema change that fixes the CAP
but not the ACTION, since the sandbagger's reports are honest about the evidence they chose. Only
(a) prices the action rather than the report. **Until A lands, G9 #6 fails and the document says so.**

**Request B (board/run lane, closes V2-2 at the root).** Give `projectFor` a path term. `game.log`
already carries `briefs`/`committed`, so the window cost can be charged against the student's own
rate of USING a window instead of a single blended `means.brief`.

**Request C (tests lane).** Add the cross-regime arm to `tests/job-split.test.mjs`: season with one
of the two published fixed-phase columns and measure on the other, both directions. Nothing
exercises it today, which is why the claim shipped unconditioned. `/tmp/splitcrit/regime.mjs` is the
shape of it (and will be reaped — the four measured cells are quoted above and in G9 #1).

---

## Suite

`tests/job-meta-constants.test.mjs` — this lane's file, and the only one it added tests to:

```
node --test tests/job-meta-constants.test.mjs   → tests 57 · pass 57 · fail 0
```

The full-suite run is recorded below; the tree is being written by eleven other fixers while it runs,
so failures are attributed by the file each assertion names.

---

## AMENDMENT, mid-ticket — half of V2-1 was closed by another lane while this one was open

Between the first measurement and the final suite run the **call lane landed the q̂-in-the-entry
change** (`call.js:436 callEntry` now writes `q`; `call.js:718 slotCeiling(w, p, q)` uses it when
present). That is candidate **(c)** from the finding's own list, and it closes exactly the half it
was predicted to close — the REPORT — and not the half that matters.

Re-measured through the same script, after the change:

```
§1  unchanged, byte for byte: MASTER rank=2 on 8/8 · SANDBAG rank=4 on 8/8
    POST-CLIMB 115125 → 128518 = +11.63 %   study ledger identical on 8/8
§2  CLOSED:  q̂ 0.2 → ceiling 0.00 · Called 2   (was 5.40 / 7.86 · Called 3/4)
             q̂ 0.3 → ceiling 0.00 · Called 2
             q̂ 0.5 → ceiling 0.00 · Called 2
    still paying: q̂ 0.8 → ceiling 8.28 / 6.76 · Called 4
```

**Why §1 does not move.** The cap prices the *report*, and the sandbagger's report is TRUE: they
manufactured a clear rate of 0.8 and then called the honest rung for 0.8. Nothing in a `calls[]`
entry says *where* the sitting that set q̂ happened, so a q̂ = 0.8 made on Today's Page and a
q̂ = 0.8 earned on staked job targets are the same slot, byte for byte. **Request A stands, and is
now the only candidate left** — (c) has landed and did not close it.

Everything this lane wrote was re-stated to the post-change truth rather than left as a stale
measurement: `COMPOSED-GAME.md` §3.7 proof 8 and G9 #6 now say the cap half is CLOSED and why §1 is
untouched by it; G12 **VR2-FARM** carries the same; `notes/repair-meta-evidence.mjs` §2 prints the
before/after; and the suite pin was rewritten from "THE CAP DOES NOT BIND" to **"the cap now binds
on a CHOSEN q̂ — and still cannot tell manufactured evidence from earned"**, which asserts both
directions: `chosen.ceiling < honest.ceiling` (the landed fix, so it cannot silently regress) and
`deepEqual(manufactured, honest)` with a guard on the entry's key set (the open half, so Request A
landing is what turns it red and forces a re-measure).

## Final suite

```
node --test tests/job-meta-constants.test.mjs   → tests 71 · pass 68 · fail 3
```

**None of the three is this lane's.** All three are assertions the DOC lane appended to this file in
the same hour, and all three are red because the CALL lane's change landed under them:

| failing test | what it asserts | why it is red | owner |
| --- | --- | --- | --- |
| `the READABLE BRANCH the document publishes is the set the code computes` | the first `` `q̂ ∈ {…}` `` in the document is the `q̂ ≥ ½` set | the doc lane's own new §3.1 bullet at `:349` publishes `{0.1 … 0.9}` and now matches the capture first | doc |
| `F1 — the q̂ < ½ hole is published as OPEN, not implied shut` | `lie.ceiling > honest.ceiling` on the unreadable branch | the stored q̂ closed F1; its own message says the document must now stop publishing it as open | doc (+ call) |
| `and the arm's NAME says which register it asserts where` | `tests/job-board.test.mjs` still bounds the five-of-five over-band share | the board lane is rewriting that assertion's name right now | board |

This lane did not touch any of the three, and deliberately did not edit them: F1's fix is the doc
lane's own paragraph and its own test, landed in the same hour, and two lanes rewriting one sentence
at once is how a document acquires two half-corrections.

### Final suite — last run of the ticket (the tree converged under it)

```
node --test tests/job-meta-constants.test.mjs   → tests 71 · pass 70 · fail 1
node --test tests/                              → tests 2991 · pass 2982 · fail 5 · skipped 4
node qa/layout-audit.mjs --only settings,stats --vp phone --engine chromium --theme light
                                                → LAYOUT AUDIT — 0 findings · verdict: PASS
```

The three doc-lane failures recorded above are GONE — that lane landed its corrections while this
one was finishing. The five that remain, attributed by the file each assertion names:

| failing test | names | lane |
| --- | --- | --- |
| `job-copy.test.mjs:307` "none anywhere in the game layer's source" | `site/js/job/board.js → come back` | board |
| `job-index.test.mjs:649` "the calls[] entry is BYTE-IDENTICAL, shielded or not" | a shielded entry's `w`/`ok` after the call lane's entry-shape change | call / index |
| `job-meta-constants.test.mjs:1401` "the document publishes the shipped ratchet rule" | G2 "Rank" must print `rankFor(min(value, ceiling), { floor })` | **doc** — its own test, its own paragraph, and its own G12 #78 entry already states the replacement |
| `job-screen.test.mjs:1077` the align line's two prices | `screens/job.js` | screen |
| `job-screen.test.mjs:1153` `mountJob` consults it BEFORE it mounts | `screens/job.js` | screen |

None is in a file this lane owns except the third, which is an assertion the doc lane appended to
this lane's test file about a sentence in its own section of `COMPOSED-GAME.md`. This lane did not
edit that sentence: the doc lane is landing G12 #78 as this is written, and two lanes rewriting one
sentence at once is how a document acquires two half-corrections.

**What this lane touched, in full:** `site/js/screens/settings.js` (one `dt`/`dd` pair + its
comment), `tests/job-meta-constants.test.mjs` (§8–§10, appended), `COMPOSED-GAME.md` (§3.7 proof 8,
G3.8 #4, G9 preamble, G9 #1, G9 #6, G8's J8 row, G11's withdrawn list, G12's new
"Verify round 2 — the meta lane" section), `designs/SPEC-CORRECTIONS.md` (M-10, M-11, both marked
ALREADY APPLIED), `notes/repair-meta-evidence.mjs` (new), this note.
`site/js/screens/stats.js` and `site/data/trophies.js` are **untouched**: neither finding names a
defect in them, and a lane that edits a file it has no measurement against is adding noise to a
tree eleven other fixers are writing.

---

# VERIFY ROUND 3 — the META lane

Four findings, all four CONFIRMED by re-running the evidence before anything was edited. All four
are the same defect wearing different clothes: **a numeral or a mechanism published in
`COMPOSED-GAME.md` that its own cited evidence contradicts, with nothing in `node --test tests/`
standing between the two.** Two of the four were written by the round-2 and round-3 REPAIRS
themselves, which is the part worth keeping: a correction that is not executable is just a newer
sentence, and it drifts exactly like the one it replaced.

No product code changed. Every fix is (a) the document restated to what the shipped machine
measures, and (b) an arm that MEASURES it and reads the document's own numerals back out of the
paragraph, so the pair cannot separate again.

## V3-1 [BLOCKER, ledger-invariance] "a bagged … job writes none" — BAG IS NOT A TERMINAL STATE

**Confirmed.** `OUTCOMES` (`site/js/job/state.js:290-300`) has no BAG word, and `bag()`
(`state.js:1282-1295`) ends in `advance(s, g, now)` — the same call `push()` ends in, which closes
the job only at `left === 0`. `commitJobRun`'s only gate is `debrief.complete !== true`.

Measured independently of the critic's script, with the `playJob` driver from
`tests/run-lane-r2.test.mjs` and `bag()` wherever it pushes, then the `jobSummaryContext` call
`screens/job.js renderDebrief` makes:

```
$ node scratchpad/meta-r3/bagprobe.mjs
save 3: bags=9 outcome=completed complete=true | runs 0->1 forecastLog 0->1 | row.kind=page partial=true drafted=10 composed=11 | OUTCOMES has BAGGED: false
save 4: bags=9 outcome=completed complete=true | runs 0->1 forecastLog 0->1 | row.kind=page partial=true drafted=10 composed=11 | OUTCOMES has BAGGED: false
save 5: bags=9 outcome=completed complete=true | runs 0->1 forecastLog 0->1 | row.kind=page partial=true drafted=10 composed=11 | OUTCOMES has BAGGED: false
save 6: bags=9 outcome=completed complete=true | runs 0->1 forecastLog 0->1 | row.kind=page partial=true drafted=10 composed=11 | OUTCOMES has BAGGED: false
save 7: bags=9 outcome=completed complete=true | runs 0->1 forecastLog 0->1 | row.kind=page partial=true drafted=10 composed=11 | OUTCOMES has BAGGED: false
```

The code is right. The document was wrong in the one paragraph that is the Law of Two Ledgers, and
wrong in the direction that reads to a later ticket as authority to add a gate on `bagged` — which
would silently drop the `runs[]` row, the forecast point and the daily-goal check for the majority
of real jobs.

**Changed** — the condition is now named as what it actually is, at all three sites:
`COMPOSED-GAME.md` §3.7 proof 11 (`:646`), G9 #8 (`:1068`), G12 #64 (`:1261`), plus
`designs/SPEC-CORRECTIONS.md` M-4 and M-5, whose NEW text is where this error entered the tree.
Proof 11 now also names the gate (`commitJobRun`'s `debrief.complete !== true`), because the gate is
the only thing a later ticket may implement.

**Pinned** — `tests/job-meta-constants.test.mjs` §11, three arms: `OUTCOMES` carries no BAG word and
`bag()` still ends in `advance()`; a job bagged at every beat on three corpus saves completes and
writes the row and the forecast point; and the document neither says "bagged … writes none" nor
omits the real condition.

## V3-2 [BLOCKER, test-integrity] VR2-FARM's +11.6 % / +5.6 % does not reproduce

**Confirmed.** The document's only cited reproduction is `node notes/repair-meta-evidence.mjs`
(named twice; `:1066` states outright that the end-to-end arm "is deliberately not in
`node --test tests/`"). It is seeded and takes **1.0 s**. Run twice, identical:

```
$ node notes/repair-meta-evidence.mjs
    seed 1: MASTER rank=2 loot=19819 (phase2 12833)  |  SANDBAG rank=4 loot=20781 (phase2 14420)  → phase2 12.37%   study ledger identical: true
    …
    TOTAL loot 146379 → 150734 = 2.98%
    POST-CLIMB 96614 → 103294 = 6.91%   sandbag wins BOTH currencies on 6/8; study ledger identical on 8/8
```

Published +11.6 % post-climb → measured **6.91 %**. Published +5.6 % overall → measured **2.98 %**.
Every QUALITATIVE claim still reproduces exactly (Called 2 on 8/8, Called 4 on 8/8, byte-identical
study ledger on 8/8, both currencies on 6/8) — it is only the two magnitudes, and the multiple
derived from them, that are false.

**This is drift, not fabrication, and that matters for the fix.** This lane's own VR2 record
(`notes/repair-meta.md:792`) shows the script printing `POST-CLIMB 115125 → 128518 = +11.63%` when
it was written; it now prints `96614 → 103294`. The economy moved under a published number and
nothing executed the script, so four sites drifted away from their own evidence.

**Changed** — the pair is restated at all four sites (`:636` proof 8, `:1066` G9 #6, `:1159` G11,
`:1299` G12 VR2-FARM), and the derived sentence with it: the published "at most 2.5 % overall"
residual is **1.19×** too small on the overall basis it is stated on, and 2.76× on the post-climb
basis. The old 4.6× was a post-climb percentage divided by an OVERALL bound — wrong in kind as well
as in value. Each site records that it was corrected and why.

**Pinned** — `tests/job-meta-constants.test.mjs` §12 spawns the script (as
`tests/job-screen.test.mjs:1529` spawns `tests/_job-reach.mjs`), asserts the four qualitative claims
against its stdout, parses `POST-CLIMB … = X%` / `TOTAL … = Y%` back out, and asserts every
occurrence of `+N % post-climb loot` and `(+N % overall)` in `COMPOSED-GAME.md` equals the measured
figure to 2 dp — plus the multiple, recomputed from the 2.5 % bound the document still quotes. Cost:
~1 s of suite time for a number that was published in four places with no executable check.

## V3-3 [MAJOR, split-honesty] G1 statement 2 still published the PRE-repair estimator

**Confirmed.** `COMPOSED-GAME.md:127` published, in the present tense and as one of the "two things
[that] now close it": *"each job's ratio dropped from both sums if it is outside `[1/6, 6]`"*.
`site/js/job/board.js:1044-1047` clamps:

```js
const add = (acc, meas, exp) => {
  if (!(exp > 0 && meas > 0)) return;
  acc.meas += exp * clampRate(meas / exp); acc.exp += exp; acc.n++;
};
```

`board.js`'s own docblock titles that change "AN OUTLIER IS BOUNDED, NOT DELETED (round-1
verification, split-honesty BLOCKER)". Measured through the shipped `postBoard`, five jobs on
record, clock swept:

```
$ node scratchpad/meta-r3/ratesprobe.mjs
20 s/stem  n.answer=5  answerRate=0.167
15 s/stem  n.answer=5  answerRate=0.167
10 s/stem  n.answer=5  answerRate=0.167
 6 s/stem  n.answer=5  answerRate=0.167
 2 s/stem  n.answer=5  answerRate=0.167
```

5 of 5 stay in the window at every clock, pinned at `RATE_MIN` — clamped, never dropped. Under the
sentence the document published, the 2 s/stem column would be empty and `rate()` would fall back to
1, which is the cliff that printed the shipped table under the words `your last 5 jobs`, 46.7 to
58.1 points from the debrief headline.

**Changed** — `:127` now states the clamp, with the failure it replaced named, and publishes the
measurement above. `designs/SPEC-CORRECTIONS.md` had no entry for this line at all (its stated job
is "every published line the repair round proved false"); it now has V3-3.

**Pinned** — `tests/job-meta-constants.test.mjs` §13: `add()` clamps and has no second early return
keyed on the bounds; `postBoard` keeps 5 of 5 at four clocks with the pooled rate inside
`RATE_CLAMP`; the document publishes the clamp floor the code ships and no longer publishes the
dropping version.

## V3-4 [MAJOR, test-integrity] G3.7 proof 2's scope ruling published the pre-repair rate

**Confirmed, and the critic's reading of which of the two sites is stale is right.** The same
document published both `0.190 % / 1.92 %` (`:616`, the scope blockquote — the place a reader goes
for the measurement) and `0.334 % / 2.32 %` (`:320`, G2's widening paragraph). I reproduced the
exact sweep `tests/job-monotone.test.mjs:422` runs, from a copy of that file with a `node:test`
shim, so the measurement is the shipped one and not a re-implementation:

```
$ ONLY="as SCOPED" node scratchpad/meta-r3/mono.mjs
PROBE-SCOPED-SWEEP: 137 of 40962 flips (0.334 %), worst 22 (2.32 % of the bag)
PROBE worst-n {"seed":0,"n":11,"worst":22}   worstRel-n {"seed":1,"n":11,"worstRel":0.0232}
```

**A second error in the same sentence, which the finding did not name.** `:616` attributed the
worst absolute drop of **22** to "a pinned four-target order (483 → 467)". Three things are wrong
with that: the worst drop of 22 is on an **eleven**-target order (above); the frozen four-target
counterexample drops **16**, not 22; and its pair is `476 → 460`, not `483 → 467` — 483/467 is its
pre-verify-2 pair, which `tests/job-monotone.test.mjs:306` documents in place and `:303` asserts
against 476/460. The published sentence was internally inconsistent too: 483 − 467 = 16.

**Changed** — `:616` now publishes `0.334 % of flips — 137 of 40 962 — at most 2.32 % of the bag,
worst absolute drop 22, on an eleven-target order`, and states the frozen four-target exhibit
separately at its real drop of 16 (`476 → 460`), with its pre-VR2 pair kept as history. `:320` is
untouched: it was right.

**Pinned** — inside `tests/job-monotone.test.mjs`'s own scoped-sweep test, where `rate`, `worstRel`,
`worst`, `violations` and `pairs` already exist, so the pin costs **zero extra runtime**. It parses
the five numerals out of the proof-2 blockquote and asserts each against the sweep it just ran, and
asserts the blockquote states the frozen counterexample's real drop. The two-sided band that was
already there could not catch this: a band pins the measurement, and nothing pinned the paragraph.

## Cross-lane edits (BUILD-POLICY §2)

This lane owns `site/js/screens/stats.js`, `site/js/screens/settings.js`, `site/data/trophies.js`
and `tests/job-meta-constants.test.mjs`. Two files outside that list were edited, both additively,
both recorded here:

- **`tests/job-monotone.test.mjs`** (econ/J9 lane) — one import (`read` from `./_helpers.mjs`) and
  one additive block at the END of the existing scoped-sweep test. No existing assertion was
  changed, relaxed or removed; the two-sided band and the `worst === 22` equality are exactly as
  that lane left them. **Request to that lane:** keep the doc-parse block with the sweep. Moving it
  into `job-meta-constants.test.mjs` would re-run a 9 s sweep purely to have a number to compare, so
  it belongs where the measurement already is. Alternative if that lane wants its file back: export
  `{ rate, worstRel, worst, violations, pairs }` from the sweep as a fixture this lane can import.
- **`designs/SPEC-CORRECTIONS.md`** (shared correction record) — M-4 and M-5's NEW text corrected in
  place (they are where "bagged … writes none" entered the tree), M-10's VR2 magnitude marked as of
  its round, and a new section **V** with V3-1…V3-4 marked ALREADY APPLIED.

`site/js/screens/stats.js`, `site/js/screens/settings.js` and `site/data/trophies.js` are
**untouched**: none of the four findings names a defect in them.

## What is NOT closed, and is not this lane's to close

- **VR2-FARM's mechanic is still OPEN** and this round did not touch it. Request A below stands:
  build `q̂` only from sittings that were themselves staked job targets (`js/job/call.js`). What
  changed is only that the document now prices it with numbers its own script prints. Note that the
  measured prize FELL between rounds (+11.63 % → +6.91 % post-climb) without anyone aiming at it —
  which is an argument for the pin, not against the fix.
- **The four magnitudes in V3-1…V3-4 are live measurements of a tree eleven fixers are editing.**
  `site/js/job/{econ,state,call,board}.js` were all written to within the minute while this ticket
  ran. If an economy change moves them, §12 and the monotone doc-parse go red and name the numeral
  to re-publish. That is the intended behaviour and it is the whole point of the round: the previous
  failure mode was that nothing went red at all.

## Suite

```
node --test tests/job-meta-constants.test.mjs   → tests 79 · pass 78 · fail 1   (79 = 71 + §11–§13's eight new arms)
node --test tests/job-monotone.test.mjs         → tests 15 · pass 14 · fail 1
node notes/repair-meta-evidence.mjs             → TOTAL 146379 → 150734 = 2.98% · POST-CLIMB 96614 → 103294 = 6.91%
                                                  (re-run after the board and econ lanes' 09:43 edits: unchanged)
```

Both remaining failures are other lanes' in-flight work, named by the file each assertion reads,
and **neither is in a sentence or a function this lane edited**:

| failing test | what it reads | lane |
| --- | --- | --- |
| `job-monotone.test.mjs:598` "WALK at the getaway banks LOOSE at FULL value" | `econ.getawayBank` — 513 vs 466 | econ / state (they are writing the **VR3-GETAWAY** entry about exactly this as I write) |
| `job-meta-constants.test.mjs` B · `"Tanking is strictly dominated" is retracted at every site` | `COMPOSED-GAME.md:1439` | econ / doc — see below |

**The second one needs a word from its author and is a two-character fix, so it is spelled out.**
The lint (section B, appended to this lane's file by the doc fixer lane in verify round 2) flags any
bare `strictly dominated` that has no retraction token within ±reading distance **on its own line**.
G12's changelog entries are exempt because `**Claimed` sits on the same line — that is how
**VR2-FARM** at `:1299` passes while quoting "Nothing can be farmed". The new **VR3-GETAWAY** entry
is the first G12 entry in the document **wrapped across lines**: its `**Claimed (…)` is on `:1437`
and the phrase is on `:1439`, two lines out of the window. Fix: unwrap that entry onto one line, as
every other G12 entry is. This lane did not touch the entry, the lint or the phrase — and did not
loosen the lint to hide someone else's line, which would have been the cheap way to a green run.

`node --test tests/` as a whole is red on roughly two dozen tests this hour across
`board`/`econ`/`state`/`save`/`screen`/`copy`; `site/js/job/{econ,state,call,board}.js` were all
written to during this ticket. Nothing in that list names a file, a sentence or a numeral this lane
edited. The four arms this ticket added were re-run against the tree as of the last of those
writes (09:43) and all four still measure what the document now publishes.

### Final full run, after the lane's last edit

```
node --test tests/    → tests 3059 · suites 420 · pass 3046 · fail 9 · skipped 4
```

(The 2 725-test baseline this round opened on has grown to 3 059 — eleven fixers are adding arms.
This lane added 8: `job-meta-constants.test.mjs` §11 ×3, §12 ×2, §13 ×3, plus six assertions folded
into `job-monotone.test.mjs`'s existing scoped-sweep test, which adds no test.)

All nine failures, by the file the runner names:

```
tests/job-board.test.mjs:631, :690, :2267, :2578, :3006   board lane  (5)
tests/job-monotone.test.mjs:598                           econ lane   (the getaway/WALK bank change)
tests/job-screen.test.mjs:1702                            screen lane
tests/job-week.test.mjs:1335                              state/week lane
tests/job-meta-constants.test.mjs:1120                    → COMPOSED-GAME.md:1439, econ/doc lane (above)
```

Every arm this lane added passes, and none of the nine reads a file, a sentence or a numeral this
lane edited. Nothing was deleted, skipped or weakened to get there — including the one failure that
lands in this lane's own test file, whose cause is another lane's line and whose fix is theirs.
