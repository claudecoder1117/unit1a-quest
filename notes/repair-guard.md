# notes/repair-guard.md — the REPAIR round of the `guard` lane

**Lane:** `guard`. **Files owned:** `site/js/job/guard.js` + `tests/job-guard.test.mjs`.
**Authority:** `designs/REPAIR-DECISION.md` (§S5.7 is this lane's), `designs/r3-findings.json`
(4 entries with `lane: "guard"`), `COMPOSED-GAME.md`, and `BUILD-POLICY.md` over both.
Prior rounds of this lane: `notes/guard-fix.md` (rounds 1–3, requests R1–R15).

Nothing outside the two files above was edited. `COMPOSED-GAME.md` is NOT edited here — every doc
defect is recorded under **Spec corrections** with the exact old line and the exact replacement.

---

## Findings, one row each

| id | severity | what it says | verdict | measured |
| --- | --- | --- | --- | --- |
| **F30** | BLOCKER | Settings prints `yᵢ = 1 − k/vᵢ` as "the unexploitable" press | **PASS** — in-lane half was already shipped; the `settings.js` half landed this round (by the screen lane, from this file's export); the strings are now EXECUTED, not regex-matched; 4 doc lines → SC-4…SC-7 | `v=(30,20,10)`: guardMix `0.600 0.400 0.000` · press `0.447 0.379 0.174` · maximin `0.400 0.600 0.000` · pre-press `{1,1,1}` |
| **F58** | MAJOR | G8's J3 row false in three clauses; the test avoids the shipped path for equal `v` | **PASS on the code; the coverage clause is STALE (refuted below); doc → SC-8…SC-10** | `(30,20,10)` ε=0 index-order `0.6360` (7/11) · equal `v` `0.3636 0.3636 0.2727` (4/11,4/11,3/11) · farm `0.1034` JOB-only, `0.2000` all-RUN |
| **F59** | MINOR | the doc's printed water-filling block does not terminate in ≤ n−1 passes; "water-filling" names the wrong rule | **PASS** — reproduced exactly; docblock + two new tests in-lane; doc → SC-1, SC-2 | shipped 2 passes vs doc-literal **40** and **92**, same limit to 9.4e-16 · `(0.9,0.08,0.02)` → shipped `0.750 0.200 0.050`, level-filling `0.750 0.155 0.095` |
| **F60** | MINOR | "the guard may not take the same wing more than 3 jobs running" is falsifiable — `heldWing` overrides Mercy | **PASS, and it is worse than filed**: there are TWO certainty regimes, not one, and §6's sweep could not reach either | held board: `max y = 1` with Mercy blocking that wing · two-wing Mercy: `max y = 1` on the other wing · plain: `≤ 0.75` over 3 000 saves |

---

## F60 — the root fix, and the blind test that let the sentence stand

The finding is right and **the code is right**: the hold has to beat Mercy, or quitting buys a wing's
exemption and G3.7 proof 6 dies. What was wrong was the published sentence — and what let it stay
wrong for three rounds was a test of this lane's own.

`tests/job-guard.test.mjs` §6 carried `test('the guard is never a certainty: y_i ≤ 0.75 on every
support of 2 or more')`: 2 000 random saves, each built as `{ game: { heat: { window } } }` with
**no `game.log`**. `blockedWing` and `heldWing` both read `save.game.log`, so in that regime they
can only return `null` — the test asserted a bound over the one regime in which the bound has no
exceptions, while its title stated the bound unconditionally. Structurally unable to fail.

Measured on the shipped path (`/private/tmp/.../scratchpad/m1.mjs`, then asserted in §6b):

```
3 worked RECALL guards + 1 board walked out on with RECALL standing
  blockedWing → RECALL          (Mercy says no)
  heldWing    → RECALL          (the walked board says yes)
  guardDist   → {"RECALL":1,"FIGURES":0,"WORDS":0,"ALGEBRA":0}   blocked=null  held=RECALL
  control (no walked board)     → RECALL p = 0, max y = 0.75
3 worked RECALL guards, support = 2 wings
  guardDist   → {"RECALL":0,"FIGURES":1}                          max y = 1
```

So the shipped law is a **bound with two named exceptions**, both of which the board PRINTS before
the press (Global law 6) — which is what makes them conditions rather than leaks:

```
plain board               max y ≤ cap = 0.75
Mercy on a 2-wing board   the other wing is a certainty (the block empties the support)
a board you walked out on that wing is a certainty, Mercy notwithstanding
```

In-lane changes:

- `blockedWing`'s docblock now states the override, with the measurement and the reason it is
  deliberate. It no longer reads as an unconditional promise.
- **New export `CAP_PANEL_COPY`** — the `cap` legend, four sentences assembled from `GUARD.cap` and
  `GUARD.sameWingMaxRuns` with both exceptions named, for the same reason `PRESS_PANEL_COPY` exists:
  the panel prints this file's behaviour or it prints something a student falsifies in one evening.
  It also carries the honest replacement for the word **"unexploitable"** (see SC-11: the
  replacement REPAIR-DECISION §S5.7 prescribes is itself false of the shipped code).
- §6's test is **retitled to the regime it covers** and now asserts that regime explicitly
  (`blockedWing === null`, `heldWing === null`) and points at §6b. Its bound assertion is unchanged
  and unweakened.
- New **§6b** (4 tests): the conjunction; the two-wing certainty; a 3 000-save sweep that drives
  saves WITH a log, classifies each into a regime, asserts the law in each, and **asserts it reached
  each one** (`held > 100`, `mercy2 > 20`, `mercyWide > 20`, `plain > 500` — measured 3 000 saves,
  all four counters over the floor); and a `CAP_PANEL_COPY` test that checks every clause against
  the constants and the measurements.

## F59 — the projection: two separate doc defects, both reproduced

1. **The printed block does not terminate in ≤ n−1 passes.** A capped entry *equals* the cap, so it
   is not in `over` on the next pass; `free = { i : i ∉ over }` re-frees it, hands it excess again,
   and the loop converges by asymptote instead of by retirement. Same limit, 20×–46× the passes:

   ```
   cap 0.30  y = (0.60,0.25,0.10,0.05) → (0.300,0.300,0.267,0.133)   shipped 2 passes · doc 40
   cap 0.28  y = (0.50,0.30,0.15,0.05) → (0.280,0.280,0.280,0.160)   shipped 2 passes · doc 92
   cap 0.75  y = (0.9333,0.0333,0.0333) → (0.750,0.125,0.125)        shipped 1 pass  · doc 1   ← the worked example, which is why it went unnoticed
   ```

2. **"Water-filling" names the wrong rule.** The excess is shared PROPORTIONALLY; water-filling
   proper (the Euclidean projection onto the capped simplex) LEVELS it, `y_i = min(cap, y_i + λ)`.
   On `(0.90, 0.08, 0.02)` with `cap = 0.75` the shipped rule gives `(0.750, 0.200, 0.050)` and
   level-filling gives `(0.750, 0.155, 0.095)`. Both feasible, both sum-preserving; only the
   proportional one is the guard's distribution, and it is the one the doc and the panel print.

In-lane: the section header and `projectWithPasses`'s docblock record both facts with the numbers;
`project`/`guardDist` no longer call the constant "the water-filling cap"; two new tests pin the
difference (so nobody "corrects" the guard's draw into the other rule by renaming it) and execute
the doc's printed block against the shipped one.

## F58 — one clause refuted, the rest already closed in round 3

The three measurement clauses all reproduce and all are already recorded in-suite and exported from
`guard.js` (`BEST_RESPONSE_ACCEPTANCE`, `FARM_BAND` — round 3, `notes/guard-fix.md`). What remains
is the doc, which is SC-8…SC-10.

**REFUTED — the coverage clause.** The finding says: *"`tests/job-guard.test.mjs:1379
test('equal values converge to uniform — pure rotation')` calls `simulate(...)` and never
`simulateShipped(...)`, which the (30,20,10) block right above it DOES call. That asymmetry is what
hides it."* That was true when round 3 started and is not true of the tree the repair ran against:

```
$ grep -n "simulateShipped(\[25, 25, 25\]" tests/job-guard.test.mjs
1835:      const { y } = simulateShipped([25, 25, 25], { eps: 0, jobs: 2000, tail: 500, seed });
1850:      const { y } = simulateShipped([25, 25, 25], { eps: r.eps, jobs: 2000, tail: 500, seed: 'j3-a' });
1860:    const three = simulateShipped([25, 25, 25], { eps: 0, jobs: 500, tail: 100 });
1866:    const long = simulateShipped([25, 25, 25], { eps: 0, jobs: 5000, tail: 3000 });
1873:      const { y } = simulateShipped([25, 25, 25], { eps: r.eps, jobs: 2000, tail: 500 });
$ grep -n "equal values converge to uniform" tests/job-guard.test.mjs
1890:  test('equal values converge to uniform — pure rotation (the idealised loop)', () => {')
```

The equal-`v` case drives the shipped path at 500 / 2000 / 5000 jobs, at `n = 3` and `n = 4`, at
every rank, under both tie-breaks, in `RECORDED: equal v settled by WING_IDS order is
(4/11, 4/11, 3/11), and it is an attractor`; the idealised-loop test is now labelled as such. **No
code change made for this clause.**

## F30 — the in-lane half, and what landed elsewhere this round

`guard.js` has named the three vectors for their own sides since round 2 and exports the panel's
paragraph (`PRESS_PANEL_COPY`) since round 3. This round the screen lane applied **R12**:
`site/js/screens/settings.js:35` imports `PRESS_PANEL_COPY` and `:522` renders it, so the panel no
longer prints the House's mixing as the student's answer. Nothing left to do in this file for the
code half; the four doc sentences are SC-4…SC-7.

**What this round added at the root.** `X_HAT_FORMULA` has been implemented by hand and compared to
`xHatFrom` since round 2, but `GUARD_MIX_FORMULA`, `MAXIMIN_FORMULA` and `PRESS_FORMULA` were only
ever **regex-matched** (`assert.match(PRESS_FORMULA, /A − B\/vᵢ/)`): the published law could have
said anything containing those characters. New test **`THE THREE PUBLISHED LAWS ARE THE RUNNING
ONES`** reads each string as a law and checks it as a property of the shipped output over 600 random
boards × every rank's ε — `v_i(1 − y_i) = k` with `k = (n−1)/Σ(1/v_i)` for the guard mix, `x_i·v_i`
equal and worth `k` for the maximin, `p_i = A − B/v_i` with `A = (1 − ε/n)/(2(1 − ε))` and `Σp = 1`
for the press.

---

## Negative controls (each run against the shipped code; each MUST fail)

`/private/tmp/claude-501/-Users-oliver/a4b3cdf7-f4be-4831-9be9-2af12b15793b/scratchpad/negctl.mjs`:

```
CONTROL 1  blanket "max y <= 0.75" over saves WITH a log : FAILED at case 0: max y = 1
                                                           (held=RECALL, blocked=null, n=2)
CONTROL 2  "the guard may not take the same wing more than 3 jobs running":
           FAILED — RECALL is drawn with p = 1 after 3 worked RECALL guards
CONTROL 3  A = 1/(2(1−ε)), i.e. PRESS_FORMULA without ε/n : FAILED at Called 1:
           A = 0.611111111111111 vs ε-dropped 0.6666666666666666 (Δ 0.055556)
CONTROL 4  doc block "terminates in ≤ n−1 passes" (n = 4) : FAILED — 92 passes
```

Control 1 is the old §6 title asserted over §6b's regime — it fails on the first case, which is the
proof that the old test was blind rather than merely narrow. Control 3 is the term the regex could
not see. Controls 2 and 4 are the published sentences SC-3 and SC-1 replace.

---

## Tests

```
node --test tests/job-guard.test.mjs                        →  tests 133 · pass 133 · fail 0   (was 126 / 126 / 0)
node --test tests/job-guard.test.mjs tests/job-state-r3.test.mjs
                                                            →  tests 149 · pass 149 · fail 0
   (job-state-r3 is the S5 regression gate — its 16 tests are unmodified and green)
node --test <the 8 other files that import job/guard.js, + coverage + no-random>
                                                            →  tests 430 · pass 430 · fail 0
node --test tests/    (FINAL, and 10 other lanes were writing to this tree while it ran)
                                                            →  tests 2812 · pass 2808 · fail 0 · skipped 4 · EXIT 0
```

**The suite is GREEN on the last run of this round.** All 18 `J3 ·` suites are green in it. Three
failures seen in earlier full runs during the round were other lanes' live edits and were fixed by
their owners before this one: `tests/job-state.test.mjs:255` (← `site/js/job/state.js:232`),
`tests/job-week.test.mjs:895` (← `site/js/screens/mock.js`), and `tests/job-screen.test.mjs:871`
(§S0/S5's harness — `FAIL — 1 chromium/light: brief press — the submit did not redraw the guard`,
the `screen` lane's atomic press, since landed; §S0's mount failure is gone too — the harness paints
and measures 36px on every target, 2 briefs and a `debrief` row).

Per REPAIR-DECISION §S0 the "2725 / 2721 / 0 / 4" baseline may not be quoted; the tree grew to 2806
tests while this round ran (ten other lanes writing), of which +7 are this lane's new ones.

---

## Requests — changes needed in files this lane does not own

**R16 — `site/js/screens/settings.js`, the `cap` legend (F60).** The legend picked up the hold
exception during this round (good), but it still states the bound flatly — *"no wing may be drawn
with probability above 0.75, and the guard may not take the same wing more than 3 jobs running — with
one exception…"* — and there are **two** exceptions: the walked board, and Mercy on a **two-wing**
board, where the block empties the support and the other wing is drawn with certainty. The drop-in,
so the panel authors nothing and cannot drift from `GUARD`:

```js
import { CAP_PANEL_COPY } from '../job/guard.js';     // add to the existing guard.js import
```

and replace the `h('dt.mono', 'cap'), h('dd', …)` pair with

```js
        h('dt.mono', 'cap'), h('dd', CAP_PANEL_COPY[0]),
        h('dt.mono', 'Mercy'), h('dd', CAP_PANEL_COPY[1] + ' ' + CAP_PANEL_COPY[2]),
```

(or print all four with `...CAP_PANEL_COPY.map(s => hint(s))` under the `project` block). If the
lane would rather keep its own prose, the one clause it is missing is: *"and on a board with only
two wings on it, a blocked wing leaves the guard nowhere else to go — the other wing is drawn with
certainty."* `tests/job-guard.test.mjs` §6b asserts every clause of `CAP_PANEL_COPY` against the
measurement, so quoting it is cheaper than re-deriving it.

**R17 — `site/js/screens/settings.js`, the `x̂` legend (REPAIR-DECISION §S5.7 bullet 1, finding 57's
file).** Still prints `x̂ᵢ = Σⱼ(ωⱼ · shareᵢⱼ) / Σⱼ ωⱼ` by hand, with no `β`; the ballast is what
delivers the very next sentence ("no single job may be more than a quarter of the window"). Render
`X_HAT_FORMULA` (already imported at `settings.js:35`) instead of the hand-written string:
`formula(X_HAT_FORMULA.law)`, then `.omega`, `.ballast`, `.bound`. `tests/job-guard.test.mjs` §5
implements `X_HAT_FORMULA` literally and asserts it reproduces `xHatFrom`, so the panel and the code
cannot drift once it prints the object.

**R14 (re-filed from round 3, owner: `tests` lane, finding 37) — `tests/job-copy.test.mjs`.
LANDED during this round, and it is worth saying what it covers.** The four prose-carrying screens
(`settings.js`, `home.js`, `stats.js`, `run.js`) are now linted through the new `PROSE_SOURCES`
list at `:529` and the voice rules over it. `LAYER_SOURCES` (`:102`) is still the nine-file list, so
the *copy-table* lints still do not read the screens — which is the right split, but it means a
false sentence in a screen is now caught only by the voice rules, not by "is this claim the code's".
The sentences F30 and F60 are about lived in exactly that gap; the standing defence against it is
that the claim is exported from the module that computes it (`PRESS_PANEL_COPY`, `CAP_PANEL_COPY`,
`X_HAT_FORMULA`, `FARM_BAND`, `BEST_RESPONSE_ACCEPTANCE`) and asserted in `tests/job-guard.test.mjs`.

**R18 — `site/js/screens/job.js`, the brief panel (REPAIR-DECISION §S5.7 bullet 5, the `screen`
lane's S5.3 fix).** "The re-press can land on the same wing with probability `y_w`, so the brief
panel prints the distribution before the move" needs no new guard function and must not grow a
second one: `guardDist(save, { support })` is the published vector and `guardBars(dist)` already
returns `{wing, p, pct, blocked, held}` with whole percentages that sum to 100 — the same call the
board makes. A held or blocked board comes back flagged, so the brief panel can print "this wing is
standing at 100 %" from the same object rather than from a second rule.

**R15 (re-filed from round 3, owner: `board` lane) — `site/js/job/board.js`.**
`pressAdvice(dist, values.byWing)` leaves the tie-break at index order, so the debrief's
`bestResponseWing` always names RECALL on an exact tie. `pressAdvice(dist, values.byWing, { seed:
jobSeed })` fixes it; `bestResponseWings` (the whole tied set) is also available. No payoff and no
token count changes — `tokens` apportions `press`, never the argmax.

---

## Spec corrections — for the agent that owns `COMPOSED-GAME.md`

Line numbers are as of this writing and the doc is being edited by other lanes; **grep the old
text**, do not trust the number.

**SC-1 — `COMPOSED-GAME.md:472` and `:478`, the printed projection block (F59).**
OLD (`:472`):
> `project(y, cap):                     // water-filling; terminates in ≤ n−1 passes`

NEW:
> `project(y, cap):                     // cap-and-share; terminates in ≤ n−1 passes`

OLD (`:478`):
> `    free = { i : i ∉ over }`

NEW:
> `    free = { i : i not capped }      // an index that has been capped STAYS capped`

…and one half-line after the block, because the excess is shared in proportion and not levelled:
> Implemented literally with `free = { i : i ∉ over }` the same limit is still reached, but by
> asymptote, not by retirement: 40 passes on `(0.60, 0.25, 0.10, 0.05)` at `cap = 0.30` and 92 on
> `(0.50, 0.30, 0.15, 0.05)` at `cap = 0.28`, against 2 for the shipped loop. "Water-filling" is
> also a loose name for it — the excess is shared in **proportion** to the uncapped entries, not
> levelled: on `(0.90, 0.08, 0.02)` with `cap = 0.75` this rule gives `(0.750, 0.200, 0.050)` where
> `y_i = min(cap, y_i + λ)` would give `(0.750, 0.155, 0.095)`.

**SC-2 — `COMPOSED-GAME.md:1020`, G12 #10 (F59).**
OLD:
> Cap, redistribute the excess proportionally over the uncapped entries, repeat (≤ n−1 passes).

NEW:
> Cap, redistribute the excess proportionally over the entries **not yet capped**, repeat — which is
> what bounds it at ≤ n−1 passes; re-freeing a capped entry reaches the same limit in 40 and 92
> passes on the four-wing cases J3 pins. Proportional, not levelled, so "water-filling" is the loose
> name for it and the pseudo-code is the definition.

**SC-3 — `COMPOSED-GAME.md:619`, Mercy (F60).**
OLD:
> And the guard cannot take the same wing more than three jobs running (`y_i ≤ 0.75` plus a hard three-in-a-row cap, printed).

NEW:
> And the guard cannot take the same wing more than three jobs running (`y_i ≤ 0.75` plus a hard three-in-a-row cap, printed) — with two exceptions, both printed on the board before you press: a board you walked out on keeps its guard standing, Mercy included (G3.7 proof 6, and it is why quitting is worthless), and on a two-wing board a blocked wing leaves the guard nowhere else to go, so the other wing is drawn with certainty.

**SC-4 — `COMPOSED-GAME.md:498`, first sentence (F30).**
OLD:
> So the unexploitable strategy is **to mix pressure across skill clusters in proportion to their study value** — interleaved practice, weighted by test weight and overdue-ness. That is a Nash statement, not a slogan.

NEW:
> So the press the board pre-presses is `pᵢ = A − B/vᵢ`, `A = (1 − ε/n)/(2(1 − ε))` — the best reply to the guard this layer actually ships, whose `y` is a published mirror of your own last 10 jobs and not a minimiser. It is increasing in study value and positive on every wing the composer deals, which is what spreading pressure across the wings looks like here. Against a guard that *did* read the press and minimise, the unexploitable press is the maximin `xᵢ ∝ 1/vᵢ` — the reciprocal ordering, most weight on the LOWEST-value wing, because that is what equalises `xᵢ·vᵢ`. Neither of them is `yᵢ = 1 − k/vᵢ`, which is the HOUSE's mixing (§3.4 derives it from the player's indifference condition, and the side a condition pins is the other one). The three vectors are `PRESS_FORMULA`, `MAXIMIN_FORMULA` and `GUARD_MIX_FORMULA` in `js/job/guard.js`, and on `v = (30, 20, 10)` at the default rank (`ε = 0.20`) they are `(0.447, 0.379, 0.174)`, `(0.400, 0.600, 0)` and `(0.600, 0.400, 0)` — pressing the House's mix is worth 8.0 of an available 12.0.

**SC-5 — `COMPOSED-GAME.md:498`, third sentence (F60).**
OLD:
> the 0.75 cap guarantees the guard is never a certainty.

NEW:
> the 0.75 cap guarantees the guard is never a certainty on a board you have not already walked out on (the two exceptions are in G4 "Mercy": a held board, and a blocked wing on a two-wing board — both printed before the press).

**SC-6 — `COMPOSED-GAME.md:562`, G3.8 #2 (F30).**
OLD:
> 2. **Presses tokens at the mixed equilibrium** `y_i = 1 − k/v_i`. *Interleaving across clusters weighted by test weight and overdue-ness is the unexploitable strategy.*

NEW:
> 2. **Presses tokens at `pᵢ = A − B/vᵢ`, the best reply to the guard this layer ships** (`y_i = 1 − k/v_i` is the HOUSE's mixing, and pressing it is dominated — 8.0 against an available 12.0 on `v = (30,20,10)`). *`p` is increasing in study value and positive on every wing, so the optimal press is interleaving across clusters weighted by test weight and overdue-ness.*

**SC-7 — `COMPOSED-GAME.md:581` (the gradient table) and `:940` (G9 criterion 5) (F30).**
OLD (`:581`):
> `| wing token equilibrium | `v_i = Σ L·scope·cold` | test weight × overdue-ness = the composer's own priority |`

NEW:
> `| wing token press `pᵢ = A − B/vᵢ` (increasing in `v_i`) | `v_i = Σ L·scope·cold` | test weight × overdue-ness = the composer's own priority |`

OLD (`:940`, inside criterion 5):
> the token equilibrium is interleaving weighted by `w × cold`;

NEW:
> the token PRESS `pᵢ = A − B/vᵢ` is increasing in `v_i`, hence interleaving weighted by `w × cold` (the guard's own mixing `yᵢ = 1 − k/vᵢ` is the other side of that game and is not the student's advice);

**SC-8 — `COMPOSED-GAME.md:916`, G8's J3 row, the convergence clause (F58; = round 3's R13,
unapplied).**
OLD:
> a 500-job best-response simulation converges to `y = (.60,.40)` for `v = (30,20,10)` ±0.03 and to uniform for equal `v`;

NEW:
> a 500-job best-response simulation converges to `y = (.60,.40)` for `v = (30,20,10)` ±0.03 and to uniform for equal `v`, **at ε = 0 and with a TIED argmax settled uniformly** — the shipped `x̂` is a ten-job window pressed in three whole tokens, so `v_i(1 − y_i)` ties exactly on most jobs, and settling those ties by `WING_IDS` order instead lands on `(7/11, 4/11)` and on `(4/11, 4/11, 3/11)`, 0.036 and 0.061 out and stable to 5 000 jobs; at ε > 0 the target is the ε-floored equilibrium, which the shipped loop reaches inside 0.025 at every rank while `(.60,.40)` itself is 0.039 away at Called 1 (`BEST_RESPONSE_ACCEPTANCE` in `js/job/guard.js`);

**SC-9 — `COMPOSED-GAME.md:916`, the same row, the farm clause (F58).**
OLD:
> `x̂` is stake-weighted and no single job exceeds 25 % of the window (a 3-RUN + 1-VAULT farm moves `x̂` by < 0.08);

NEW:
> `x̂` is stake-weighted with uniform ballast `β` and no single job exceeds 25 % of the window at any window size (a 3-RUN + 1-VAULT farm moves `x̂` by < 0.08 on any window holding plan-sized or VAULT work — 0.058 / 0.061 / 0.071 measured — by 0.082 on a 9-JOB + 1-VAULT window, 0.103 on a JOB-10-only window and 0.200 on an all-RUN window, the school-hours week, where every job posts the same and `ω` has no spread to read; what holds on every window is the leverage bound, `FARM_BAND` in `js/job/guard.js`);

**SC-10 — `COMPOSED-GAME.md:1022`, G12 #12, last sentence (F58).**
OLD:
> J3 asserts a 3-RUN + 1-VAULT farm moves `x̂` by < 0.08.

NEW:
> J3 asserts a 3-RUN + 1-VAULT farm moves `x̂` by < 0.08 on every window that holds plan-sized or VAULT work, and records the three windows where it does not: 0.103 on a JOB-10-only window, 0.082 on 9-JOB + 1-VAULT, and 0.200 on the all-RUN school-hours week, where the stake weighting has nothing to weigh and the leverage bound `0.30 × (1 − 1/3)` is exactly what the farm takes.

**SC-11 — `COMPOSED-GAME.md:489`, the printed `x̂` law (REPAIR-DECISION §S5.7 bullet 1; finding 57's
doc half).**
OLD:
> `x̂_i = Σ_j ( ω_j · share_ij ) / Σ_j ω_j ,   ω_j = min( posted_j , 0.25 · Σ_k posted_k )`

NEW:
> ```
> x̂_i = ( Σ_j ω_j · share_ij + β/n ) / ( Σ_j ω_j + β ) ,   ω_j = min( posted_j , 0.25 · Σ_k posted_k )
> β   = max( 0 , max(ω)/0.25 − Σω )     // uniform ballast: added until the largest job IS 25 % of the window
> ```
> so `ω_j / (Σω + β) ≤ 0.25` for every job at every window size, job 1 included. Without `β` the
> ratio above puts 52 % of the window on one job in the 3-RUN + 1-VAULT attack named below and 85 %
> in a window of nine tiny jobs, and the next sentence would be false. (`X_HAT_FORMULA` in
> `js/job/guard.js`; J3 §5 executes it against `xHatFrom`.)

**SC-13 — `COMPOSED-GAME.md:495-496`, §3.4's fixed point (REPAIR-DECISION §S5.7 bullet 2).** The
two bullets are the ε = 0 closed form and are not labelled as such, and the shipped dynamic does not
settle there.
OLD:
> - Equal values `(v,v,v)`: `k = 2v/3`, `y = (⅓,⅓,⅓)` — pure rotation.
> - `v = (30,20,10)`: wing 3 leaves the support; `n = 2`, `k = 12.0`, `y = (0.60, 0.40)`.

NEW:
> Both bullets below are the **ε = 0 closed form** — the idealisation. At every rank the game ships,
> the target is the ε-floored equilibrium instead (an unpressed wing sits at `ε/n`, it never leaves
> the support), and the shipped ten-job × three-token dynamic settles at `(7/11, 4/11)` and
> `(4/11, 4/11, 3/11)` when a tied argmax is settled by wing order — stable to 5 000 jobs, because
> ten jobs pressed in three whole tokens tie `v_i(1 − y_i)` exactly on most jobs.
> - Equal values `(v,v,v)`, ε = 0: `k = 2v/3`, `y = (⅓,⅓,⅓)` — pure rotation. Shipped: `(4/11, 4/11, 3/11)`, 0.061 off uniform.
> - `v = (30,20,10)`, ε = 0: wing 3 leaves the support; `n = 2`, `k = 12.0`, `y = (0.60, 0.40)`. Shipped: `(7/11, 4/11)`, 0.036 off.

**SC-12 — `designs/REPAIR-DECISION.md` §S5.7, bullet 4 — a correction to the DECISION, not to
COMPOSED-GAME.md (F60).** The decision says:

> The student-facing word **"unexploitable"** in `settings.js` is replaced by the one property that is
> measured and true: the cap means the guard can never reach a wing more than **75 %** of the time.

That replacement is itself falsifiable on the shipped code: in two reachable, printed regimes the
guard reaches a wing **100 %** of the time (a held board; a blocked wing on a two-wing board — both
measured above). What shipped instead is the bound **with its two exceptions**, exported as
`CAP_PANEL_COPY` and asserted over 3 000 saves in §6b. Same intent, and it survives a student
testing it.

---

## Open

- **R16 and R17 are unapplied** (both in `settings.js`, which this lane does not own). Until R16
  lands, the panel prints a 0.75 bound with one of its two exceptions.
- The 12 spec corrections above are unapplied by design — `COMPOSED-GAME.md` belongs to a later
  agent.
- Carried from round 3, unchanged and NOT closable in this file: a held board publishes a certainty
  *before* the press, which is an edge over honest play that no fix inside `guard.js` can remove
  (pinning the seed on a getaway count leaks it identically, because it is also deterministic). The
  fix is in `state.js`/`board.js` — an abandoned board must be RESUMED, with its press, not
  re-posted (`notes/guard-fix.md` R1b). Recorded in the suite, not hidden.

---

# ROUND 5 — verify round 1, the `guard` lane

Six findings, all six reproduced before anything was changed. Scripts are kept in
`scratchpad/guard-r5/` (`boards.mjs`, `onewing.mjs`, `farm.mjs`, `farm2.mjs`, `dom.mjs`; git-ignored); every measurement
below is through the shipped path (`postBoard` → `pressAdvice`, or `pushHeat` → `xHatFrom`), never
through a re-implementation.

Files changed: `site/js/job/guard.js`, `tests/job-guard.test.mjs`, and — named in the findings and
cited line-by-line by them — the three lines of `site/js/screens/settings.js` that carried the
withdrawn cap sentence, plus four sentences of `COMPOSED-GAME.md`. Nothing else was touched.

## R5-1 (MAJOR, test-integrity) — the three published laws were never read by the test that claimed to run them

CONFIRMED. The round-4 test typed the law into the TEST (`const A_of = (eps, n) => …`) and asserted
`stationaryPress().A` against that; `PRESS_FORMULA` and `GUARD_MIX_FORMULA` appeared only in its
comments. Both strings are rendered to the student (`settings.js` → `PRESS_PANEL_COPY`).

FIXED at the root: the test now **reads the law out of the string and executes it**. `readLaw` is a
~30-line recursive-descent reader for the glyphs the published strings use (`−`, `ᵢ`, `ε`, implicit
multiplication) — it evaluates `+ − × ÷`, parentheses and the names it is handed, knows no algebra,
and throws rather than returning `NaN`. Each law is split out of its own string (`piece`) and run:

| string | what is lifted out of it and executed |
|---|---|
| `GUARD_MIX_FORMULA` | the `y` rule, the `k` numerator and the `Σ` body, against `fixedPointMix` |
| `MAXIMIN_FORMULA` | the proportionality `1/vᵢ`, its support clause and its value `k`, against `maximinPress` |
| `PRESS_FORMULA` | the `p` rule, the `A` term and the `Σp = 1` normalisation, against `stationaryPress` |

600 random boards × every rank's ε. **The negative controls are shipped**, not run once in a
scratchpad: the mutated `A = 1/(2(1 − ε))` and `k = n/Σ(1/vᵢ)` are handed to the same reader and the
disagreement is asserted. Exact-string pins for all four laws sit beside them as a drift guard for
rewordings the reader would still parse.

Mutation-tested against the shipped file (mutate → run → revert, file verified byte-identical after):

```
PRESS_FORMULA  A = (1 − ε/n)/(2(1 − ε)) → A = 1/(2(1 − ε))   ⇒ CAUGHT  (0.5833 vs 0.6667 at Called 1)
GUARD_MIX      k = (n − 1)/Σ(1/vᵢ)      → k = n/Σ(1/vᵢ)      ⇒ CAUGHT  (80.58 vs 161.16)
MAXIMIN        xᵢ ∝ 1/vᵢ                → xᵢ ∝ vᵢ            ⇒ CAUGHT  (0.4045 vs 0.5955)
```

All three survived the round-4 test. All three are red now.

## R5-2 (BLOCKER, guard-equilibrium) — the withdrawn unconditional cap claim was back in Settings

CONFIRMED, and it is false in three regimes, not one:

```
plain 3-wing        max y = 0.3333
held board          max y = 1.0000   held = RECALL        (y is overwritten AFTER the projection)
Mercy, 2-wing board max y = 1.0000   blocked = RECALL     (the block empties the support)
ONE-WING board      max y = 1.0000   blocked/held = null  (n·cap = 0.75 < 1 — no pass runs at all)
```

FIXED: `settings.js:529-531` deleted. `CAP_PANEL_COPY[3]` is already printed thirty lines above as
the `honestly` row and says everything true the sentence was reaching for, with its conditions, so
no replacement line was added — a second, weaker statement of the same bound is the defect.

And the hole that let it in is closed from this lane's side, since `tests/job-copy.test.mjs`
LAYER_SOURCES does not include `settings.js` (that is the `tests` lane's finding): a new test,
**"THE SETTINGS GUARD CARD QUOTES THESE LEGENDS AND DOES NOT RE-AUTHOR THEM"**, slices
`guardCard()` out of `settings.js`, asserts all four `CAP_PANEL_COPY[i]` and `PRESS_PANEL_COPY.map`
are rendered, and fails any line of the card's own prose that pairs the cap numeral with a universal
quantifier (`ever` / `always` / `whatever` / `regardless` / `every board`). The withdrawn sentence
trips it three separate ways.

## R5-3 (BLOCKER, guard-equilibrium) — "positive on every wing of every board the composer deals" is false

CONFIRMED on real boards (500 seeded saves through the shipped `postBoard`; `g1/boards.mjs`):

```
boards 500, press matters on 500
  2-wing boards:   7, p = 0 on a support wing on  0   ( 0.0 %)
  3-wing boards: 340, p = 0 on a support wing on  1   ( 0.3 %)
  4-wing boards: 153, p = 0 on a support wing on 85   (55.6 %)
  TOTAL: 86/500 = 17.2 %
  first example: wings [WORDS,RECALL,FIGURES,ALGEBRA]  v {71.25, 58.5, 131.25, 18}
                 p {0.3108, 0.2491, 0.4401, 0}  pressSupport [FIGURES,WORDS,RECALL]
```

FIXED: `PRESS_PANEL_COPY[1]` now states the two things that ARE universal — `p` never presses a
wing harder than one **a token is worth more on** (`B = (|S|·A − 1)/Σ_S(1/vᵢ) ≥ 0`, because `A ≥ ½`
and `|S| ≥ 2`), and `p > 0` on the support it KEEPS — and prints the real four-wing board
`v = (58.5, 131.25, 71.25, 18) → (0.25, 0.44, 0.31, 0)`. The same universal is corrected in
`stationaryPress`'s docblock and in `COMPOSED-GAME.md` §3.4 and G3.8 #2, where it was the *premise*
of the interleaving conclusion.

A SECOND UNIVERSAL WAS CAUGHT IN THE FIX ITSELF, before it shipped: the first draft read "never
presses a lower-value wing harder than a higher-value one", which is falsifiable on a HELD board.
`pressAdvice` zeroes a wing the guard is certain to take (`vPress`) before solving the press, so the
highest-STUDY-value wing on the board can be the one dropped:

```
pressAdvice({wings:[RECALL,FIGURES,WORDS], y:[1,0,0], eps:0.2}, {RECALL:500, FIGURES:20, WORDS:10})
  v     [500, 20, 10]
  press [0, 0.5278, 0.4722]      ← v = 500 pressed at 0, because a token there buys nothing
```

The shipped sentence orders by *what a token is worth on a wing*, names the certain-guard wing as
one the press drops, and that board is asserted in the test.

New test **"SENTENCE 2 IS TRUE ON FOUR WINGS TOO"**: the printed four-wing board is driven at every
rank's ε (ALGEBRA drops at all five), the printed vector is asserted to be the vector
`stationaryPress` returns, and the two universals are swept over 3 000 random boards with an
assertion that the sweep actually reaches the drop (`dropsSeen > 100`).

## R5-4 (MAJOR, guard-equilibrium) — a one-wing board is a third condition on the cap

CONFIRMED through the repo's own 14× ASN-ANG fixture and through `guardDist` directly:

```
wingsPosted 1 | guardSupport "guard: 1 wing on the board" | pressLine "one wing tonight · RECALL · no press"
guardDist   : y = {"RECALL":1}  blocked = null  held = null  n = 1
projectWithPasses([1], 0.75) = { y: [1], passes: 0 }        ← n·cap < 1, so no projection runs
```

FIXED: `CAP_PANEL_COPY[0]` states the bound **on a board with two or more wings in play** and names
the one-wing board (which the board already prints before the press); `[3]` counts three conditions.
The §6b sweep drives `n ∈ {1,2,3,4}` instead of `n = 2 + (k % 3)`, with a dedicated one-wing branch
(`held` null, `blocked` null — `blockedWing` refuses a one-wing support — `y = 1`, `passes = 0`) and
a coverage assertion `regimes.one > 100`. A named test drives the board itself, and the legend lint
fails any clause that prints `GUARD.cap` with no condition beside it. `COMPOSED-GAME.md` §3.4
corrected.

## R5-5 (MAJOR, guard-equilibrium) — the farm sentence generalised FARM_BAND off its window

CONFIRMED, through `pushHeat` (`g1/farm.mjs`, `g1/farm2.mjs`). `heatWindow` is `jobs.slice(-10)`, so
below ten jobs the three decoy RUNs are **added** to the window rather than evicting three of it:

```
honest window  1 -> farmed window  4 : Δ = 0.3000   *** the literal 3-RUN + 1-VAULT window ***
honest window  2 -> farmed window  5 : Δ = 0.1875
honest window  3 -> farmed window  6 : Δ = 0.1364
honest window  4 -> farmed window  7 : Δ = 0.0952
honest window  5 -> farmed window  8 : Δ = 0.0784   ← first inside the published band
```

The six ten-job figures reproduce exactly (0.0710 / 0.0580 / 0.0614 / 0.0821 / 0.1034 / 0.2000), so
the disagreement is the quantifier and not the arithmetic — as the critic said.

**A second condition the critic did not name, found while fixing this one and fixed with it:** the
ten-job qualifier alone does not make the claim true either. The move is `decoy share × (1 − the
farmed wing's honest share)`, so a **full ten-job VAULT window whose honest press never touched the
farmed wing** gives up the whole share — `Δ = 0.0870`, over the band — while the three published
figures are figures for a student who spreads the press. Restoring only "ten-job" would have left a
reachable counterexample.

FIXED: `FARM_BAND.holds` says `on a FULL 10-job window … and spreads the honest press`; a new
`FARM_BAND.shortWindow` publishes the short-window band; `misses` carries the 0.087 row. Two new
§5b tests measure both (`SHORT WINDOWS …`, `AND A FULL TEN-JOB WINDOW IS NOT ENOUGH ON ITS OWN …`),
the first driven through `pushHeat` rather than by handing `xHatFrom` a window object, and the
FARM_BAND publishing test now fails any string that says "on any window" or "on every window".
`COMPOSED-GAME.md` G8 J3 and G12 #12 corrected to match.

## R5-6 (MAJOR, guard-equilibrium) — "pressed by a player it is worth less than a flat press" is not universal

CONFIRMED. Over 4 000 random boards at every rank (`g1/dom.mjs`), pressing the House's own mix `y`
beats a flat press on **19.6 %** against a minimising guard and **36.4 %** against the shipped mirror
guard (8.2 % / 9.6 % on real `postBoard` boards). The suite never evaluated the comparison at all —
the only assertion on the sentence was `guard.includes(GUARD_MIX_FORMULA)`.

What IS universal, measured over the same 4 000 boards with **0** violations:

```
maximin never worse than y against a MINIMISING guard        : 0 violations
stationaryPress never worse than y against the SHIPPED guard : 0 violations
```

FIXED: `PRESS_PANEL_COPY[2]` prints the worked board's three numbers (8.0 / 10.0 / 12.0 — the numbers
the paragraph already carried) instead of a universal, says plainly that a flat press does not always
beat `y`, and states the two dominances that do hold everywhere. New test **"SENTENCE 3 IS BOUNDED TO
WHAT IS MEASURED"** asserts both dominances over 4 000 boards AND asserts the counterexample still
exists (`yBeatsFlat* > 200`), so the withdrawn universal cannot quietly come back green.

## Suite

`node --test tests/` — baseline before this lane's work: 2817 tests, 2813 pass, 0 fail, 4 skipped.
No test was deleted, skipped or weakened; four were strengthened in place and six added
(`tests/job-guard.test.mjs` alone: 133 → 139, all green).

One self-inflicted failure was found and fixed during the run: `tests/job-copy.test.mjs`
("none anywhere in the game layer's source, comments included") bans the phrase *come back*
everywhere under `js/job/`, comments included, and a docblock sentence added by this repair used it.
Reworded; `job-copy` is green.

Every other failure in the concurrent full-suite runs is in another lane's files — `job-econ`,
`job-week`, `job-debrief`, `job-screen`, `job-align`, `job-board`, `job-call`, `job-exploit`,
`job-monotone`, `mock` — with assertion messages about crew/econ pricing, the BAG button and the
board's posted value, mid-edit while those lanes work. Nothing in this lane changes behaviour at
all: every `guard.js` edit is a docblock or an exported COPY string, and the only render change is
the deletion of one false `hint()` in `settings.js`.

## Open / requests to other owners

- `tests/job-copy.test.mjs` LAYER_SOURCES (`tests` lane) still omits `site/js/screens/settings.js`.
  This lane now lints `guardCard()` from `tests/job-guard.test.mjs`, but that covers the guard card
  only — the round-3 fix bullet's request stands for the rest of the file.
- Carried, unchanged: a held board publishes a certainty *before* the press. No fix inside
  `guard.js` removes it; it belongs to `state.js`/`board.js` (an abandoned board must be RESUMED,
  with its press, not re-posted — `notes/guard-fix.md` R1b).
- Observed while verifying, NOT this lane's: `tests/job-meta-constants.test.mjs:982` ("and G3.2 no
  longer offers a rank brake at all") matches `/There is no EV brake on over-calling at `S = 0`/`
  against G3.2, and G3.2 now reads *"There **was** no EV brake…"* after the cover landed. The
  econ/call lane owns both sides of that pair.

---

# ROUND 6 — verify round 2 (`guard-equilibrium`)

**Files touched:** `site/js/job/guard.js`, `tests/job-guard.test.mjs`. Nothing else. No file outside
this lane was edited; `COMPOSED-GAME.md` corrections are under **Spec corrections (round 6)** below,
with the exact old text and the exact replacement.

All three findings were **reproduced through the shipped machine before anything was changed**
(`postBoard` → `startJob` → `walk` → `postBoard`, on seeded saves carrying a real 0-12-job press
history). Every figure published in this round is the one the suite now measures, not the critic's —
their harness is not in the repo, so their percentages and mine differ by a little; the defects are
identical.

## R6-1 (BLOCKER) — the hold does not make quitting worthless; it makes the wing unshoppable and hands it over free

**CONFIRMED, and it is weakly dominant.** Measured over 120 shipped boards
(`tests/job-guard.test.mjs` §5c, "THE HOLD IS NOT A PRICE"):

```
the walk costs      ratesElo false, 0 banked, rating unmoved, Elo unmoved on 120/120;
                    the ONLY durable write is records.walked += 1
the board returns   seed identical 120/120 · contract lines identical 120/120
                    guardDist().held = the wing that was drawn, byWing[wing] = 1 on 120/120
the walk is worth   vs playing on with the sealed press against the wing already shown:
                      best play after the walk   better 120 / 120, worse 0
                                                 +13.56 % mean, +0.87 % worst, +24.85 % best
                      the new board's pre-press  better 106, equal 14, worse 0, +7.61 % mean
```

So the published sentences were the exact opposite of the measurement. **Nothing in `guard.js` can
close it** — Global law 6 makes the board publish its distribution *before* the press, so a held
board must name the wing, and pinning the seed on a getaway count leaks it identically (that was
already recorded at `tests/job-guard.test.mjs` "RECORDED: the hold ends the SHOPPING"; round 6 stops
merely naming it and prices it). The close belongs to `state.js`/`board.js`: an abandoned board
RESUMED with its committed press rather than re-posted (`notes/guard-fix.md` R1b). **Request R6-a.**

FIXED, by publishing what was measured:
* `CAP_PANEL_COPY[2]` (the sentence the student reads in Settings) now says the hold ends the
  SHOPPING, that a walk is priced at nothing, and carries all four numbers.
* `heldWing`'s docblock carries the full table above plus "It does not make quitting worthless",
  and names the file the fix belongs in.
* `blockedWing`'s docblock: "the hold is what makes quitting worthless (G3.7 proof 6)" →
  "the hold ends the SHOPPING for a wing (G3.7 proof 6)".
* The new §5c test asserts every figure in the copy against the sweep — the win counts exactly, the
  mean and the floor to 0.2 points — and fails on any sentence containing *quitting is worthless* or
  *never a strategy*, so the withdrawn claim cannot be restated.

## R6-2 (BLOCKER) — the pre-press orders by STUDY VALUE, not by what a token is worth, on 17.6 % of boards

**CONFIRMED.** `pressAdvice` defines a token's worth as `marginalᵢ = 0.25·vᵢ·(1 − yᵢ)`;
`stationaryPress` solves `p = A − B/vPress` and `vPress` is the raw `vᵢ` on every wing the guard is
not *certain* to take, so `(1 − yᵢ)` is nowhere in the solve. Through the shipped `postBoard`, 500
seeded saves:

```
boards posted with a live press                                 500
ordering by `marginal` violated in p                             88   (17.6 %)
…and violated in the WHOLE TOKENS the board pre-fills            14   ( 2.8 %)
a real board (save 41): v = (103.5, 131.25, 33.75)  y = (0.148, 0.487, 0.365)
                        marginal = (22.05, 16.83, 5.36)  →  pre-press (1, 2, 0)
```

The round-5 verification was vacuous exactly as filed: it swept `stationaryPress(v, wings, {eps,n})`
with a raw `v`, no `y`, no `pressAdvice` and no board, asserted monotonicity in `v`, and labelled its
own failure *"a wing a token is worth LESS on was pressed harder"*.

**THE SOLVE WAS NOT CHANGED, AND THE REASON IS MEASURED.** `p` is the STATIONARY reply — it answers
the `y` that a repeated press itself creates, `yᵢ = (1 − ε)pᵢ + ε/n` — and at that `y` the two
orderings coincide: `vᵢ(1 − yᵢ) = vᵢ(1 − ε/n)/2 + (1 − ε)B`, increasing in `vᵢ`, **0 violations over
2 000 boards** (asserted). Handing `stationaryPress` `vᵢ(1 − yᵢ)` instead would make the pre-press a
greedy best reply to the bars on screen — which is what Global law 6 forbids the board to pre-fill
(`bestResponseWing` is DEBRIEF/Settings material for exactly that reason) and what makes the
mirror-House loop cycle (`BEST_RESPONSE_ACCEPTANCE.indexOrderTies`). So the SENTENCE was the defect.

FIXED:
* `PRESS_PANEL_COPY[1]`: *"never presses one wing harder than a wing a token is worth more on"* →
  *"never presses one wing harder than a wing of greater STUDY VALUE"*, followed by the gap named
  and measured ("STUDY VALUE IS NOT WHAT A TOKEN IS WORTH TONIGHT … 17.6 % of 500 shipped boards,
  and 2.8 % of them in the whole tokens the board pre-fills").
* `stationaryPress`'s docblock: the round-5 parenthetical claiming `vPress` is "the value A TOKEN
  BUYS" is replaced by what `vPress` is, with the measurement and the reason the solve stays.
* New test **"THE PRESS ORDERS BY STUDY VALUE, NOT BY WHAT A TOKEN BUYS"**: 500 boards through
  `postBoard` → `pressAdvice`, refuses to run on a uniform-`y` corpus (`nonUniform ≥ 70 %`), ties the
  published percentages to the measured ones (±5 / ±3 points, so composer drift fails the SENTENCE),
  and pins save 41 deterministically so the counterexample survives any drift at all.
* The old 3 000-board sweep keeps every assertion; only its mislabelled failure message is corrected
  to what it proves (monotonicity in the value it is handed).

## R6-3 (MAJOR) — "How the Guard draws" printed two laws for one symbol, and the second is off the bars by 0.33

**CONFIRMED.** `settings.js guardCard()` prints `formula('y = project((1 − ε)·x̂ + ε·uniform_n, cap
= 0.75)')` and then, in the same `<dl>`, `PRESS_PANEL_COPY[2]` carrying `yᵢ = 1 − k/vᵢ … — the GUARD
mixes this way`. Same letter, two laws, thirty lines apart, the second in the unqualified present
tense about a guard that mirrors `x̂` and never reads `v`. Over 400 shipped boards:

```
max | fixedPointMix(board.press.v).y − the printed bars |   0.709
mean                                                        0.332
boards where the two agree                                  0 of 400
```

FIXED **inside this lane's own file, so `settings.js` needs no edit**: `GUARD_MIX_FORMULA` is
renamed to `gᵢ` and its tail is now counterfactual —
`gᵢ = 1 − k/vᵢ,  k = (n − 1)/Σ(1/vᵢ)   — the way a GUARD that MINIMISED would have to mix; this one
does not, it mirrors x̂`. `PRESS_PANEL_COPY[2]` uses `g` throughout and states the separation with
its numbers; the `PRESS_PANEL_COPY` docblock follows the rename.

New test **"g IS NOT THE PRINTED y"** measures the two vectors apart over 400 shipped boards, ties
the published mean/max/agreement to the measurement, and asserts the mechanism directly: two boards
with the same press history and different `v` draw the same bars, while `fixedPointMix` does not.
The settings-card lint gains one clause: no legend the card renders may define `y` a second time.

## Tests (round 6)

`tests/job-guard.test.mjs`: 139 → **142**, all green. No test was deleted, skipped or weakened.
Three assertions were *corrected* rather than removed — the two that pinned the withdrawn ordering
sentence, and one mislabelled failure message — and each is now backed by a sweep through the
shipped path that the old assertion did not run. The file gains five imports (`job/board.js`,
`job/state.js`, `store.js`, `schedule.js`, `days.js`, `data/cards.js`, `data/source-manifest.js`)
and one harness, `shippedSave()`/`shippedBoard()`, because "the test never runs the shipped path"
was the second half of two of the three findings.

## Spec corrections (round 6) — for the agent that owns `COMPOSED-GAME.md`

**SC-R6-1 — §3.4, line 544.** Replace

> `p` never presses a wing harder than one **a token is worth more on**, and is positive on every wing **the press keeps**

with

> `p` never presses a wing harder than one of greater **study value**, and is positive on every wing **the press keeps**. Study value is not what a token is worth tonight — a token buys `0.25·vᵢ·(1 − yᵢ)`, and the guard's odds are not in `v`'s order — so the board can press harder on a wing a token is worth less on: **17.6 %** of 500 shipped `postBoard` boards, **2.8 %** of them in the whole tokens it pre-fills (`tests/job-guard.test.mjs`, "THE PRESS ORDERS BY STUDY VALUE…"). That is `p` being stationary rather than greedy: it answers the `y` a repeated press creates, `yᵢ = (1 − ε)pᵢ + ε/n`, and at that `y` the two orderings coincide (0 violations over 2 000 boards). Ordering by tonight's marginal instead would pre-fill the greedy argmax, which Global law 6 forbids

**SC-R6-2 — §3.4, line 544, the same paragraph.** `GUARD_MIX_FORMULA`'s symbol is now `g`, not `y`,
because the settings card already prints the draw law under `y`. Replace

> Neither of them is `yᵢ = 1 − k/vᵢ`, which is the **HOUSE's** mixing

with

> Neither of them is `gᵢ = 1 − k/vᵢ`, which is how a guard that **minimised** would have to mix — not this one, which mirrors `x̂` and never reads `v` (over 400 shipped boards the two differ by a mean of **0.332**, by as much as **0.709**, and agree on **0**)

**SC-R6-3 — G4 "Mercy, never a forced continue", line 690.** Replace

> (G3.7 proof 6, and it is part of why quitting is worthless; one answered target ends the hold)

with

> (G3.7 proof 6: the hold makes the wing **unshoppable** — it cannot be re-rolled — which is not the same as making quitting worthless; see #7 below for the measured price; one answered target ends the hold)

**SC-R6-4 — G12 #7, line 1025.** The opening clause *"Quitting is free and never a strategy"* is
measured false at the BOARD phase and must go. Replace the heading clause

> 7. **Quitting is free and never a strategy.**

with

> 7. **Quitting is free, and at the board that is the problem: one walk is worth about an eighth of a board.** Measured through `postBoard` → `startJob` → `walk` → `postBoard` over 120 shipped boards (`tests/job-guard.test.mjs` §5c): a walk at the board rates no Elo, banks nothing and moves no rating — its only durable write is `records.walked += 1` — and the re-posted board is byte-identical (seed 120/120, contracts 120/120) with the drawn wing now held at probability 1. Against the wing you were already shown, replacing a sealed press with a fresh three-token press is better on **120 of 120** boards, **+13.6 %** mean and **+0.9 %** at worst. The hold closes the *re-roll*, not the walk. The close is `startJob` refusing a fresh post while a held board stands, and resuming that board **with its committed press** (`notes/guard-fix.md` R1b); until it lands, `CAP_PANEL_COPY[2]` publishes the numbers above rather than the opposite.

The rest of #7 (the one-tap WALK, the lossless default, the 50 % auto-bag, the pinned seed, the
`page-in-progress` refusal) is unchanged and still holds.

## Requests — round 6

**R6-a (BLOCKER, `state.js` + `board.js` lanes).** An abandoned board must be **RESUMED**, not
re-posted: `startJob` refuses a fresh post while `heldWing(save)` is non-null and re-opens that
board with the tokens it had committed. That is the only change that removes the +13.6 % edge
measured above; no edit inside `guard.js` can, because the board is required to publish its
distribution before the press (Global law 6). Carried unchanged from round 5's Open list, now with a
price on it and a test that will notice when it lands (the §5c figures will move, the copy will fail
against them, and this lane restates the copy).

**R6-b (`tests` lane).** Carried: `tests/job-copy.test.mjs LAYER_SOURCES` still omits
`site/js/screens/settings.js`. This lane lints `guardCard()` from its own suite, which covers the
guard card only.

**R6-c (doc lane).** SC-R6-1 … SC-R6-4 above.

**R6-d (`board` lane, LIVE FAILURE, not this lane's).** At 06:20 on the round-6 run,
`tests/job-copy.test.mjs` §5 ("none anywhere in the game layer's source, comments included") fails
with `['site/js/job/board.js → come back']` — the banned-phrase lint bans *come back* everywhere
under `js/job/`, comments included, and a line added to `board.js` during this round uses it. One
reword fixes it. Recorded here because this lane hit the same trap in round 5 and the owner may not
be watching `job-copy`.

## Suite (round 6)

`tests/job-guard.test.mjs` alone: **142 tests, 142 pass, 0 fail**. The eight suites that read this
file's exports (`job-guard`, `job-copy`, `job-align`, `job-exploit`, `job-monotone`, `job-econ`,
`job-ledger`, `no-random`): **563 tests, 562 pass**, the one failure being R6-d above, in
`board.js`.

Full `node --test tests/` during this round: **2960 tests, 2947 pass, 9 fail, 4 skipped**. None of
the nine is in this lane. They are in `job-board`, `job-crew`, `job-debrief`, `job-meta-constants`
(×2), `job-screen` (×3), `job-state` (×2), and they are the concurrent lanes mid-edit — the file
mtimes at the moment the run finished were `state.js` 06:19:51, `job-board.test.mjs` 06:20:04,
`board.js` 06:18:54, `screens/job.js` 06:18:08, against this lane's `guard.js` 06:13:27 and
`job-guard.test.mjs` 06:14:29. Two of them name the cause in their own assertion message
(`records.bestRating` no longer stores `detail.value` in `state.js`; `job-board` no longer bounds the
five-of-five over-band share). Nothing in this round changes any behaviour at all: every `guard.js`
edit is a docblock or an exported COPY string, and no exported function's return value moved.

**Second full run, 06:27** (the round's last): **2965 tests, 2952 pass, 9 fail, 4 skipped**. All
three round-6 tests green again; the whole `job-guard` suite green in both runs. The nine failures
are a DIFFERENT NINE from the 06:20 run — `job-call`, `job-copy`, `job-index`, `job-meta-constants`
(×3), `job-save`, `job-screen` (×3) — with only `job-screen` and the mid-job-WALK lint in common.
A failure set that turns over completely between two runs of the same working tree, while this
lane's files sit unchanged between them, is the concurrent lanes writing, not this round's edits.

---

# ROUND 7 — verify round 3 (guard-equilibrium: 1 BLOCKER, 3 MAJOR)

Every finding reproduced before anything was edited, with the critic's own numbers where they
were reproducible from this lane. Nothing was refuted.

## R7-1 (BLOCKER) — the abandoned-board defence was switched off by a one-job desync

**CONFIRMED, and worse than "tier 2 is loose": the docblock that stood over it asserted the
opposite in two places and described a test the code did not run.**

The old `withLogEvidence` tier 2 validated only that the last `rows.length` log entries matched the
rows on `posted`, **position for position** — never that the rows WERE that tail. One job out of
step and any shifted pairing whose stake sequence happens to line up was accepted. Tier 3's
"unique" test could not catch it either: the EARLIEST pass was anchored at `let l = latest[0]`, so
`earliest[0] === latest[0]` by construction and the two passes could never disagree about a prefix.

Reproduced on the all-RUN school week the critic named (ten jobs at 36, a board drafted and walked
at job 3 pressing three tokens on RECALL, one night at job 6 with every token taken off):

```
$ node scratchpad/g/uniq.mjs            # before
DESYNCED   log 10  heat rows 9  credited 8   shares RECALL [0,1,0,0,0,0,0,0]  x̂ RECALL 0.1250
CONTROL    log 10  heat rows 10 credited 9   shares RECALL [0,0,…,0]          x̂ RECALL 0.0000
```

The walk's whole press reached `x̂` at full posted and an honest row was dropped in its place.

Sweep, 40 000 ten-job windows at the real per-shape stakes `{RUN 36, JOB 84, JOB12 152, VAULT 162}`,
half of them all-RUN weeks, one walk and one zero-press night per window, measuring **whether the
walk's CHOICE of wing moves `x̂`** (which isolates the farm from the drop — dropping rows moves `x̂`
toward uniform whatever the press was, and uniform cannot be aimed):

```
BEFORE   the walk's press reached x̂ on 10093 of 40000 (25.2 %)   max Δx̂ on the farmed wing 0.1837
AFTER    the walk's press reached x̂ on     0 of 40000            max Δx̂                    0.000000
```

**THE FIX — stop guessing the pairing, start proving it, at no save cost.** The save already
carries the two counters that measure the desync exactly: `game.ledger.jobs` counts every job that
reached `state.endJob` (which is every job that wrote a log entry — the same function writes both),
and `heat.jobs` counts every job `pushHeat` ACCEPTED (which is every job that wrote a row). Their
difference IS the number of jobs that ended without writing a row. New private `skipsEver(save, n)`
reads it, falling back to `log.length` when `ledger.jobs` is missing and the log has never been
truncated, and returning `null` — the conservative reading — whenever the counters do not add up.

The four tiers are now:

1. **SELF-DESCRIBING** — unchanged.
2. **IN STEP, AND PROVED** — `skips === 0`, so the window IS the log's tail; the `posted` checksum
   stays. If the checksum fails anyway the counters are not describing this window, so `skips` is
   reset to `null` before tier 3 rather than being trusted to bound its reach.
3. **FORCED** (this replaces the old "unique" tier) — for each row the FEASIBLE log entries are
   computed (`earliest[r] … latest[r]`, both greedy passes over the **same** reach, the reach
   bounded by the counted desync `rows.length + skips`), and the row takes evidence only when
   **every** feasible entry agrees on `targets` and `shape`. Agreement makes the conclusion
   independent of which alignment is true, which is the only property this function needs — and it
   is a per-row test, so one ambiguous row no longer costs the whole window.
4. **UNATTRIBUTABLE + an abandoned board in reach → DROPPED**, unchanged.

Driven end to end through the shipped machine (`postBoard → startJob(zero tokens) → walk →
postBoard → startJob(3 tokens on W) → walk`), 182 seeded pairs, the desync present on every one:
**max |Δx̂| from the walk choosing its wing = 0.000000000000.**

The three claims the finding called falsified are true again, and two of them are restated so they
say WHY rather than asserting it:

* `xHatFrom` docblock — "a board that was drafted and abandoned weighs nothing at all" now says it
  is a statement about the whole read path, not about that line, because on a shipped window the row
  carries no evidence of its own and `withLogEvidence` has to find it.
* `pushHeat` docblock — "walking out of it two seconds later leaves `x̂` exactly where it was" now
  distinguishes the caller that passes `targets` (refused on the spot) from the shipped caller that
  does not (refused at read time, by proof).
* `settings.js:558-559` ("why the guard cannot be walked onto a wing with throwaway jobs") needs no
  edit: it is measured true again. **No request is filed against the screen lane for it.**

The root fix the finding names first — `state.endJob` passing `targets`/`shape` into `pushHeat` —
is still the right one and is still NOT this lane's to make: it is +29 B a row / +290 B a window and
`tests/job-save.test.mjs` refuses that without `SAVE_BUDGET_KB` and G7's save-schema table moving
with the fixture. Filed as **R7-c** below. What landed here makes the window safe WITHOUT it.

## R7-2 (MAJOR) — "the press beats it on every board against the guard that ships"

**CONFIRMED.** "The guard that ships" named two different objects in one sentence and said which for
neither. Measured over 500 boards driven through the shipped `board.postBoard`:

```
$ node scratchpad/g/dom.mjs 500
(A) STATIONARY objective  U(x) = Σ xᵢvᵢ(1 − (1−ε)xᵢ − ε/n)   p worse than g on   0/500
(B) TONIGHT'S printed y   U(x) = Σ xᵢvᵢ(1 − yᵢ)              p worse than g on 491/500
                                                     mean shortfall 11.7 %, max 31.7 %
(C) maximin worse than g against a minimiser                                     0/500
```

(The critic reported 484/500, mean 13.5 %, max 45.8 % — same corpus, same direction, a slightly
different shortfall definition. The suite now computes the numbers it prints, so the two can never
drift again.)

`PRESS_PANEL_COPY[2]` now names a guard per half: the maximin half against "a guard that MINIMISES",
the press half against "the y a repeated press of itself creates … which is the guard this layer
converges to and NOT the bars above", followed by the 491/500 measurement against the printed `y`.

The 4 000-board assertion at `tests/job-guard.test.mjs` was indeed a tautology — `valueShipped` IS
`stationaryPress`'s own objective. It is **kept and relabelled as an OPTIMISER CHECK** (the solve
matching the objective this file publishes for it is worth asserting), and the sentence's claim is
now measured by a new test against the board's own printed `y`.

## R7-3 (MAJOR) — "the board prints the block"

**CONFIRMED, exactly as written.** `guardDist` zeroes the blocked wing, `screens/job.js:1246` puts
`blocked` on `dataset.blocked` and the fill on `scaleX(0)`, and the only style that reads the flag
(`site/css/job.css:511`, `.job-bar[data-blocked="true"] .job-bar-fill { background: var(--muted) }`)
recolours a zero-width element. `grep -rn "Mercy" site/js/` → `guard.js` and `settings.js` only: no
screen file. A blocked wing was on screen as `RECALL 0%`.

This lane owns the claim, not the pixels. Two things landed here:

* `CAP_PANEL_COPY[1]` no longer says "the board prints the block". It says the wing "leaves the draw
  entirely, and the board prints that wing at 0 % before you press" — which `guardBars` guarantees
  and the new test asserts (`pct === 0`, `blocked === true`, the bars still sum to 100).
* `guardDist().note` now carries a LINE on a blocked board, the way it already did for the cold
  start and the hold, so a screen has words to print rather than a flag to style. `data/job.js` has
  no `COPY.guardBlocked`, and `COPY` is not this lane's file, so the note is
  `COPY.guardBlocked?.({wing, runs}) ?? GUARD_BLOCK_NOTE(wing)` and `GUARD_BLOCK_NOTE` is exported
  from here. Printing it is **R7-a**.

## R7-4 (MAJOR) — the brief window's re-press is free on a held board

**CONFIRMED.** `state.press` redraws from `g.guard.dist`, which is `{...board.guard.byWing}` frozen
at board time, and on a held board `guardDist` overwrites that with a one-hot AFTER the projection.
So the redraw cannot move:

```
held board, six brief-window seeds  -> RECALL ×6          (200 seeds: moved 0 times)
plain board, same six seeds         -> WORDS, ALGEBRA, FIGURES, RECALL, ALGEBRA, FIGURES
500 shipped boards, both windows    -> an ordinary redraw moves the wing 62.6 % of the time
```

`SHAPES.JOB.briefs === 2`, so the hold buys two free moves inside the job against a wing that is
known and cannot move — and `CAP_PANEL_COPY[2]`'s "WHAT THE HOLD IS, AND WHAT IT IS NOT, measured"
list did not contain them. Two things landed here:

* `CAP_PANEL_COPY[2]` now counts them, with the 62.6 % / 1000-of-1000 measurement and the two
  windows, and names the vector a fix would draw from.
* `guardDist` now returns **`unheld` / `unheldByWing`** — the projection the hold overwrote,
  identical to `y` on every board that is not held. The redraw's price can be charged on a held
  board with that vector; nothing in this file can charge it, because `state.press` owns the
  redraw. Filed as **R7-b**. `unheld` does NOT reach the save: `state.js:378` copies only the
  `WING_IDS` keys of `dist` into `inProgress.game.guard`, so the save budget is untouched.

## Requests — round 7

**R7-a (`screen` lane, `site/js/screens/job.js`).** Two one-line changes, both for R7-3.
1. `renderStart()` prints `COPY.guardColdStart` off `board.guard.coldStart` at line 1212. Print
   `board?.guard?.note` the same way (it is the cold-start string on a cold board, the block line on
   a blocked one, the hold line if `data/job.js` ever grows `COPY.guardHeld`) — or print
   `guardMod.GUARD_BLOCK_NOTE(x.wing)` under the bars when a bar has `blocked`.
2. Line 1197 rebuilds the distribution as `{ byWing: gv.guard.dist, eps: gv.guard.eps }` once the
   job is live, and `blocked`/`held` do not survive that — `guardBars` reports `blocked: false` on a
   blocked board mid-job. `distOf` reads both flags off the object it is handed, so pass them:
   `{ byWing: gv.guard.dist, eps: gv.guard.eps, blocked: blockedWing(save, support), held: heldWing(save) }`,
   or keep them on the stored `gv.guard`.
   A bar marked only by `background: var(--muted)` on a `scaleX(0)` element is not a mark; if the
   block is to stay visual rather than textual it needs something that does not depend on the fill's
   width (strike the name, a chip beside the 0 %).

**R7-b (`state` lane, `site/js/job/state.js`).** The brief window's redraw is the only price the S5
repair rests on and it is zero on a held board. `guardDist` now returns `unheld` (the projected
distribution, before the hold flattened it). Either:
 (a) store it alongside `dist` on `inProgress.game.guard` and have `press()` redraw from it — the
     price then exists on a held board too and the hold stays absolute for the DRAW; or
 (b) refuse the re-press outright on a held board (`repress-unavailable`), rather than offering a
     move whose price is zero.
Either way `CAP_PANEL_COPY[2]` already publishes the measured figures and this lane will restate
them when the fix lands. NOTE for the save lane: (a) adds one vector to `inProgress.game.guard`;
`state.js:378` currently filters `dist` to `WING_IDS` keys, so a second such vector is +~40 B live.

**R7-c (`save` + `state` lanes, carried and now priced twice).** The real close for R7-1 is
`state.endJob` passing `{ targets: answered(s), shape: g.shape }` into `pushHeat` — both are in
scope on the line that writes them into the log entry — which makes every row self-describing and
retires `withLogEvidence` entirely. It needs `SAVE_BUDGET_KB` in `site/data/job.js` and G7's
save-schema table moved with the fixture (+29 B a row, +290 B a window). Until then the proof above
is load-bearing and must not be removed.

**R7-d (doc lane, `COMPOSED-GAME.md`).** G12 #7's hold list should gain the brief-window price (the
two free moves, 62.6 % vs 0 %), and G3.4's abandoned-board rule should say that the window's
evidence is established by proof against `game.log` rather than by position, until R7-c lands.

## Tests (round 7)

`tests/job-guard.test.mjs`: 142 → **147**, all green. Five new tests:

* *THE DESYNC IS ONE FREE ACTION, and the shipped machine still pays the farm nothing* — 60 seeded
  saves × 4 wings through `postBoard → startJob → walk` twice, asserting the desync actually
  happened on every run (so it cannot go vacuous) and that the walk's chosen wing moves `x̂` by 0.
* *40 000 desynced windows, real per-shape stakes* — the sweep above, asserting 0 windows moved.
* *THE PRESS BEATS g AGAINST THE GUARD IT CONVERGES TO, NOT AGAINST TONIGHT'S BARS* — 500 shipped
  boards, both objectives, with the published 491/500, 11.7 % and 31.7 % tied to the measurement.
* *MERCY IS ON THE BOARD AS A NUMBER AND A LINE* — `guardBars` pct/flag, the new `note`, and the
  withdrawal of "prints the block".
* *THE HOLD ALSO BUYS THE BRIEF WINDOWS* — `unheld` vs `y`, the redraw price with and without the
  hold, `SHAPES.JOB.briefs`, and the copy's figures.

**Two fixtures were CORRECTED, not weakened.** `saveRaw` in the two desync tests set
`heat.jobs = js.length` — the number of jobs that ENDED — while `pushHeat` sets it to the number of
rows it ACCEPTED. The gap between those two numbers is the desync the tests are about, so the old
fixtures declared "in step" on the very windows they had put out of step. They now write what the
shipped machine writes, and carry `ledger.jobs` as `state.endJob` does. Every original assertion in
both tests still holds, unchanged, against the honest fixture.

**One assertion was RELABELLED, not removed.** `valueShipped(p) >= valueShipped(y)` in the
4 000-board loop is the optimiser solving its own objective; it is kept as an optimiser check and
the sentence it used to "prove" is measured separately.

The comment block that justified the old behaviour ("a week of 84s pairs onto itself whichever way
the skip fell") is replaced by the reason it is false and by the school-week case where the same
shape pays.

## Suite (round 7)

`tests/job-guard.test.mjs` alone: **147 tests, 147 pass, 0 fail.**
The nine suites that read this file's exports (`job-guard`, `job-copy`, `job-align`, `job-exploit`,
`job-monotone`, `job-econ`, `job-ledger`, `job-save`, `job-state`, `no-random`): **784 tests, 783
pass** — the one failure being `job-monotone` "WALK at the getaway banks LOOSE at FULL value"
(`513 !== 466`, the machine banking MORE than `getawayOf` reports), which is the `state` lane's
walk path and cannot be reached from this file. `guard.js`/`job-guard.test.mjs` mtimes at that run
were 09:43/09:52 against `state.js` 09:55.

Full `node --test tests/` at 10:05: **3059 tests, 3047 pass, 8 fail, 4 skipped.** None of the eight
is in this lane, and each names a concurrent lane in its own message:

```
job-board       ×3  the toll line is not COPY.postedNet on the live-gross basis
                    the entry's `queueTargets` is not the drafted queue's length
                    the board labelled a window of five whole jobs `projected`
job-meta-const  ×2  COMPOSED-GAME.md:1461 re-asserts "Tanking is strictly dominated"
                    the document publishes the grid as {NaN}
job-monotone    ×1  WALK banked something other than the full pile
job-screen      ×1  qa/job-screen.mjs failed (Playwright layout run)
job-week        ×1  the board projected 29 % against a debrief headline of 22 %
```

(The suite is 3059 tests rather than the round's 2725 baseline because the other lanes have been
adding tests in the same tree throughout.)
