# cut-engine — the payoff table, the hit rate and the constants

**Lane:** `engine`. **Owns:** `site/js/job/econ.js`, `site/js/job/call.js`, `site/data/job.js`, and
`tests/job-pay.test.mjs`.
**Authority:** `designs/CUT-SPEC.md` (§2, §3, §4, §5, §6, §7), `designs/CUT-BRIEF.md` for the hard
limits, `BUILD-POLICY.md` over both.

`cd /Users/oliver/Projects/unit1a-quest && node --test tests/` is **GREEN** — **1 624 tests,
125 suites, 1 620 pass, 0 fail, 4 skipped** (the four skips are the pre-existing Playwright-gated
browser arms, unchanged since `notes/DEMOLISH.md`).
`tests/job-pay.test.mjs` is **34 tests, 11 suites, 0 fail, 2.4 s**.

---

## 1. What this lane built

The demolition lane left all three files already reduced to roughly the right shape, so this lane did
not rewrite them — it **finished them, found one live defect, hardened two edges, and then proved the
whole of CUT-SPEC §7 against the shipped code**. The proof was the work; it is `tests/job-pay.test.mjs`,
and every assertion in it is falsified by at least one recorded negative control (§4 below).

Nothing was added to the design. No new export, no new constant, no new string, no tuning knob.

### `site/js/job/econ.js` — the payoff table (105 lines, DOM-free, zero imports)

CUT-SPEC §2/§3/§4 exactly. Three changes:

1. **A live defect, fixed.** `costOf(call, m)` with its default third argument (`pile = Infinity`,
   meaning "no pile to cap against") returned **0**, not the full price. `int()` folds any non-finite
   number to its default, so `Math.min(0, cost)` priced every unpriced call at zero. Every current
   caller happens to pass a pile, so nothing printed `cost 0` today — but the greyed-call path is
   exactly the one that wants an uncapped price, and this is the class of bug CUT-BRIEF bans outright
   ("no number on any surface that is not exactly the number the engine computes"). Fixed by spelling
   `Infinity` out in the new `pOf()` helper; `NaN`, `null` and a negative pile still mean an empty pile.
   Negative control **N11** re-introduces the defect and the suite goes red.
2. **The streak cap is enforced in the price, not only in the state machine.** `payOf`, `costOf`,
   `offered` and `canCall` now clamp `m` into `[1, MULT_MAX]` through one helper (`mOf`), the way
   `mult()` already did. ×5 is the last rung §3 defines, so there is no such thing as the price at ×6;
   a caller holding a larger streak must not be handed one. (`job/state.js` clamps too — this is
   defence in depth at the place the number is computed.) Control **N12**.
3. **The filename seam is closed.** See §5 "Requests".

### `site/js/job/call.js` — the hit rate (139 lines, imports only `data/job.js`)

Unchanged; audited and proved. `qHatDetail(save, skillId, {cards})` returns `hits of of` over the last
`QHAT.window = 10` sittings of the skill, cut at `inProgress.game.call.at` so a call is never weighed
by its own outcome. It counts one bit — `ok`, which the study layer writes as `result.cleared === true`
— and reads nothing about the rung a clear arrived on. That is CUT-SPEC §7's "Ninth", and it is now
asserted from both ends (controls **N13**, **N14**, **N15**, **N27**, **N18**).

### `site/data/job.js` — the constants (148 lines, zero imports)

Unchanged; audited and proved. `QHAT`, `SPLIT {lo:45, hi:55}`, `WEEK`, `SAVE_DEFAULTS`,
`IN_PROGRESS_KEYS`, `COPY`. `COPY` is CUT-SPEC §6's list and nothing else, and the test proves it both
ways: every string the table can produce is on §6's list, and no string it can produce contains a cut
word (`posted`, `loot`, `wing`, `contract`, `rating`, `elo`, `chain`, `backcheck`, `vault`, `token`,
`guard`, `crew`, `lock`, `target`, `make`). Controls **N16**, **N17**, **N26**.

---

## 2. The exported API

```js
// site/js/job/econ.js — the payoff table. Integers only, no division, no rounding, no clock.
CALLS      : readonly ['not sure', 'pretty sure', 'sure']      // cheapest first; the id IS the printed string
PAYS       : { 'not sure': 8,  'pretty sure': 9,  sure: 10 }   // a right answer, before the streak
COSTS      : { 'not sure': 2,  'pretty sure': 4,  sure: 8 }    // a wrong answer, before the streak
MULT_MAX   : 5
BASE_PAY   : 8                                                 // what the question after a bank pays
mult(n)                       -> 1..5        // 1 + rights since the last wrong answer or bank
offered(pile, m = 1)          -> string[]    // the calls this pile covers at FULL price, cheapest first
canCall(call, pile, m = 1)    -> boolean     // the screen's enable bit; unaffordable is greyed, never hidden
payOf(call, m = 1)            -> int         // PAYS[call] * min(m, 5)
costOf(call, m = 1, pile = ∞) -> int         // min(pile, COSTS[call] * min(m, 5))
honestCall(q)                 -> call        // argmax EV at true hit rate q; an edge tie takes the LOWER call
BANDS                         -> [{call, lo, hi, copy}]        // the three lines Settings prints
shouldPush({hits, of, pay, cost}) -> boolean // CUT-SPEC §4: h(pay − 8) > (n − h)cost

// site/js/job/call.js — the hit rate.
QHAT_WINDOW                   : 10
sealedCallOf(save)            -> {id, at} | null               // inProgress.game.call, or no seal
qHatDetail(save, skillId, {cards, window?, primaryOnly?, before?})
  -> { qHat, hits, of, window, attempts, source:'history'|'none'|'no-index', before, sealed }
qHatFor(save, skillId, opts)  -> number | null

// site/data/job.js — data only, deeply frozen, no imports.
QHAT {window:10} · SPLIT {lo:45, hi:55} · WEEK · SAVE_DEFAULTS {player:{best:0}, game:{today:0, day:null}}
IN_PROGRESS_KEYS ['pile','streak','call','answered','tGame','tAnswer','seed'] · COPY · SKILL_GROUPS/WINGS (residue)
```

---

## 3. The math, and the numbers it produced

The state space is **enumerated, not sampled**: `reachable(T)` is a breadth-first search from
`(pile 0, ×1)` over every legal move — each offered call, each outcome, and the bank that is always
available. Expected points are compared as **integers**: on the grid `q = k/2000` a call's EV is
`(k·pay − (2000−k)·cost)/2000`, so the numerator is an integer and the band edges at `q = 2/3` and
`q = 4/5` are decided exactly rather than within a tolerance. Every payoff number is **imported from
the shipped module**; the literal table appears once, in the one test whose job is to pin it.

| T | reachable states | max pile | state × offered-call pairs |
|---|---|---|---|
| 8 | 882 | 296 | 2 626 |
| 10 | 1 383 | 396 | 4 129 |
| 12 | **1 883** | 496 | 5 629 |
| 14 | **2 383** | 596 | 7 129 |

### §2 the table
* Minimum pile by streak: **0, 8, 24, 48, 80** — so **one right answer opens the second call and two
  open the third**, exactly as §2 claims.
* The `min()` cap binds on an offered call in **2 states only — `(pile 0, ×1)` and `(pile 1, ×1)`** —
  and both offer exactly **one** call, so a capped price is never compared with an alternative:
  **0 of 2 383** reachable states at T = 14, which is the spec's own number. (`pile 1 ×1` is genuinely
  reachable: `0 →right ns→ 8×2 →wrong ns→ 4×1 →right ps→ 13×2 →wrong ns→ 9×1 →wrong sure→ 1×1`.)

### §7 #1 honest calling wins
`argmax` over the offered calls **== `min(honestCall(q), biggest offered)`** at every reachable
`(pile, streak)` × `q ∈ [0.50, 0.99]` step 0.0005: **0 bad of 1 847 223 cells** (981 rates ×
1 883 states). The **1 867** ties are all at `q = 0.8`, where `13q − 4 = 18q − 8 = 6.4` — a true tie,
and the edge takes the lower call.

### §7 #2 no dominant call
Asserted on the cost **gaps**, not on a tolerance around the crossing:
`Δcost(ns→ps) = 2·Δpay`, `Δcost(ps→sure) = 4·Δpay`, `Δcost(ns→sure) = 3·Δpay` → crossings at
**2/3, 4/5 and 3/4**, and 3/4 lies inside the middle band, which is what stops *pretty sure* being
dominated. Bands: `[0, 2/3) · [2/3, 4/5) · [4/5, 1]` — non-empty, contiguous, and the three lines
Settings prints. Racing every offered call **and bank** under the optimal policy (backward induction,
1 883 states × 50 rates at six questions left = 94 150 cells): **not sure 28.2 %, pretty sure 21.6 %,
sure 29.1 %, bank 19.8 %, ties 1.3 %** — every one of the four moves is uniquely best somewhere.

### §7 #3 no dominant bank/push
`q* = cost/(cost + pay − 8)` **falls with the streak: 0 bad of 3 886** steps; **rises with the pile:
0 bad of 5 608** steps (the pile only moves `q*` through the cap, and the cap only rises).
Scored against the optimal policy at T = 12:

| q | optimum | §4 rule | never-bank | always-bank |
|---|---|---|---|---|
| 0.35 | 36.9664 | **1.000000000** | 0.8433 | **0.9089** |
| 0.50 | 71.3750 | **1.000000000** | **0.9410** | 0.6725 |
| 0.65 | 126.1310 | **1.000000000** | 0.9820 | 0.4947 |
| 0.80 | 224.5427 | **1.000000000** | 1.0000 | 0.3420 |
| 0.95 | 412.5260 | **1.000000000** | 1.0000 | **0.2211** |

The two straw men **swap places** — always-bank wins at q = 0.35, never-bank at q = 0.95 — which is
what "no dominant policy" means. The spec's two published figures (0.9410 and 0.2211) reproduce to
four decimals. The §4 rule is **exactly optimal at T = 8, 10, 12 and 14** (worst ratio over
q = 0.50…0.99 in 0.01 steps: `1.000000000000` at every horizon).

### §7 #4 a right answer never pays less than a wrong one
**0 violations over 5 629 state × offered-call pairs**, in points *and* in streak (a wrong answer
always leaves ×1, which is the floor). **Minimum gap 8**, at `(pile 0, ×1)` on *not sure*.

### §7 #5 failing never pays
A dynamic program allowed to **throw any question** (take the wrong branch with certainty whenever it
likes) gains **exactly 0.000000000** points at q = 0.50, 0.60, 0.70, 0.80, 0.90 and 0.99. Separately,
a wrong answer cannot raise the pile, the streak, or the pay the next card shows — asserted over the
whole state space, so it is structural rather than empirical.

### §7 #6 improving never costs
E[score] under the §4 policy at T = 12, q = 0.35 … 0.95: **37, 58, 87, 126, 186, 278, 413** — the
spec's published curve, to the point. **0 non-monotone steps of 69** over q ∈ [0.30, 0.99] step 0.01.

### §7 #7 no clock
`econ.js`, `call.js` and `data/job.js` contain no `Date`, no `now`, no `performance` and no
`Math.random` **in code** (comments are stripped before the scan — a comment cannot read a clock, and
must not be able to pass for code). `econ.js` also holds no `tGame`, `tAnswer`, `ms` or `elapsed`, no
`document`/`window`/`localStorage`, and **no import at all**.

### §7 #8 losses come only from the pile, floored at zero
`P' = P − min(P, m×cost) ∈ [0, P]` and integral, over **5 649** `(pile, streak, call)` triples —
every call, offered or greyed. **0 violations**; the floor is 0 and it is reachable.

### §7 "Ninth" — one bit
The hit rate counts `ok` (which `screens/card.js` writes as, and only as, a clear) and the game prices
`result.cleared`. Proved from both ends: flipping only `attempt`/`hints` moves nothing, flipping one
clear moves the rate, and `job/state.js` is asserted (comments stripped) to price `result.cleared`.

---

## 4. Negative controls — 28 of them, every one RED

**No test in this file can pass against a broken engine.** Each control mutates ONE thing and the
suite must fail. They were run against a **mirror of the four source files in the scratchpad**, never
against the live repo — six lanes are building against `econ.js` right now and a 20-second window of
broken source would have cost someone else an hour. Harness:
`/private/tmp/claude-501/-Users-oliver/a4b3cdf7-f4be-4831-9be9-2af12b15793b/scratchpad/engine/negctl*.mjs`
(the scratchpad is reaped after ~3 days; the table below is the record).

| # | the mutation | first test it falsifies |
|---|---|---|
| N1 | `PAYS['pretty sure']` 9 → 10 | the shipped table; honest calling; the band edges; the push threshold |
| N2 | `COSTS.sure` 8 → 6 | the shipped table; honest calling; the bands |
| N3 | `offered()` gate removed (everything always offered) | the gate; the cap-never-binds proof; honest calling |
| N4 | `shouldPush` drops `− BASE_PAY` | §4's worked examples; §4-is-optimal; the printed curve |
| N5 | `costOf` loses the `min()` cap | minimum pile by streak; the throw-gain proof; the pile floor |
| N6 | `MULT_MAX` 5 → 6 | the shipped table; the streak cap; honest calling |
| N7 | `mult()` drops the `+1` | the streak cap |
| N8 | `honestCall` edge tie takes the HIGHER call | the q = 0.8 tie, and the q = 2/3 edge |
| N9 | `PAYS['not sure']` 8 → 7 | the shipped table; the minimum gap of 8; the bands |
| N10 | `BANDS` edge 2/3 → 0.7 | each call owns its band |
| N11 | `costOf` folds `Infinity` to 0 (**the shipped defect**) | an unpriced call costs its full price |
| N12 | `payOf` uncapped above ×5 | the streak cap |
| N13 | the hit rate counts a first-try miss as a hit | the Ninth; the printed count |
| N14 | the cut at the seal becomes inclusive (`<` → `<=`) | a call weighed by its own outcome |
| N15 | the window 10 → 20 | the printed count |
| N16 | `split` loses the space before `%` | §6's string list |
| N17 | `pays` prints `posted` | §6's string list; the jargon scan; the third slot |
| N18 | `state.js` prices `result.ok` instead of `result.cleared` | the Ninth's cross-lane half |
| N19 | a wrong answer **pays** (negative cost) | the pile floor; right-never-pays-less; the push threshold |
| N20 | `honestCall` always says *sure* | honest calling; §4-is-optimal; the printed curve |
| N21 | `honestCall` always says *not sure* | honest calling; the bands; the printed curve |
| N22 | the pile is not floored at zero | an unpriced call costs its full price |
| N23 | `econ.js` gains `Date.now()` | no clock |
| N24 | `econ.js` reads `tGame` | the split meter is not a payoff term |
| N25 | `econ.js` touches `document` in a function that never runs | DOM-free |
| N26 | a band line becomes `2/3 < q ≤ 4/5` | §6's string list; the band lines |
| N27 | a missing card index reports `none` instead of `no-index` | the honest empty-history distinction |
| N28 | `econ.js` rolls `Math.random()` | no clock, no die |

**Every one of the 34 tests is falsified by at least one control** — verified by inverting the map
(`negctl2.mjs` prints, per test, which controls turn it red). The first pass left five source-scan
tests unfalsified; N23–N28 were written specifically to close that gap, which is the whole point of
running the inversion rather than trusting a green bar.

---

## 5. Requests, open issues and deviations

**REQUESTS (files this lane does not own)**

1. **`job/econ.js` keeps its name — do not add `job/pay.js`.** CUT-SPEC §8 names the module
   `job/pay.js` and `notes/DEMOLISH.md` §6 asked this lane to rename it. It is **not** renamed, and
   this is deliberate: the three importers (`job/state.js`, `screens/job.js`, `screens/settings.js`)
   and `sw.js`'s precache list belong to four other lanes building **in parallel right now**, and a
   rename that half-lands is a blank screen for the student. The thing the rename protected —
   **exactly one payoff module** — holds. *To the integrator:* if you want the spec's filename, rename
   `econ.js` → `pay.js` and update those four files plus `tests/job-pay.test.mjs`'s import in one
   commit, after the lanes have landed. Do **not** create a second module beside it.
2. **`screens/settings.js` (meta lane):** print `BANDS[i].copy` straight from `job/econ.js`, never a
   retyped copy of the three lines. The test pins them; a second copy is how the old layer drifted.
3. **`screens/job.js` (screen lane):** the third slot's two strings are `COPY.hits({hits, of})` and
   `COPY.pays({n: payOf(call, streak)})`. Pass the engine's own `payOf` result — not a pay multiplied
   by the streak again at the surface. That double-scaling is precisely the `rating −0.09 ×0.64` bug.
4. **`tests/job-screen.test.mjs` (screen lane) — RESOLVED by that lane before this note was filed;
   kept as the diagnosis in case it recurs.** Mid-build that file was red on: *"no student-facing literal is
   hard-coded"*, *"the banned words are not in the source"*, *"the screen never advises: shouldPush
   and the bands are not reachable"* and one layout rule. All four are **source scans that match the
   screen's own comments**: `screens/job.js` line 26 reads `· NO ADVICE. \`econ.shouldPush\` is never
   called here.` — and the scan flags it for containing `shouldPush`; the "one more" scan flags the
   comment that promises the app never says it; the literal scan is matching the import list. The
   screen does **not** call `shouldPush` (`grep` shows its only econ import is `CALLS`). This lane hit
   the identical trap on its own §7 #7 and "Ninth" scans — **strip comments before the regex**:
   ```js
   const code = (p) => src(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
   ```
   Without it, a test that a comment can satisfy is also a test a comment can break, and neither
   direction is about the app. (Negative control **N18** exists because of exactly this.)
5. **`js/gen/asn-reason.js` (study layer, untouched):** it is the only importer of
   `data/job.js SKILL_GROUPS`/`WINGS`. Whoever next owns that generator should move the four-line
   table into it and delete the export, so the cut word leaves the game's data file for good. No
   surface prints it today, and the copy test proves no printed string can contain a wing name.

**DEVIATIONS from CUT-SPEC, recorded rather than silently absorbed**

* **§5 says the cut is at `inProgress.game.locked.at`; the build uses `inProgress.game.call.at`.**
  `locked` is a key of the *deleted* design — §8's own `IN_PROGRESS_KEYS` lists `call`, and
  `job/state.js` writes `g.call = {id, at}`. `call.js` reads `call`. §5's `locked` is a leftover.
* **§7 #1 says 1 847 239 cells; the measured grid is 1 847 223** (981 rates × 1 883 reachable states).
  The verdict is identical — **0 bad** — and the tie count **1 867** matches the spec exactly, so the
  16-cell difference is in how the spec's author enumerated, not in the table. The test asserts the
  number it actually computes.
* **§7 #2's shares (26.1 / 20.9 / 38.3, bank 14.1 %) are not reproduced**; measured
  **28.2 / 21.6 / 29.1, bank 19.8 %**. The spec does not say how it raced the calls against *bank* —
  the two are not comparable without a horizon — so this lane used the optimal policy at six questions
  left and states its method. The *requirement* ("a call that is never optimal does not ship") is
  proved exactly, by the band edges; the percentages are evidence, and only the method differs.
* **§7 #3's pair counts (1 372 / 1 470) are not reproduced**; measured **3 886 / 5 608** monotone
  steps, again **0 bad** both ways. Same cause: an unstated enumeration.

**OPEN ISSUES**

1. `shouldPush` has **no caller in the app**, by design — §4 says the rule is "never printed during
   play; the app must never advise". It is exported so the tests can hold the design to it. If a
   future lane wires it to a surface, that is a brief violation, not a feature.
2. `tests/job-pay.test.mjs` contains **one cross-lane assertion**: `job/state.js` must price
   `result.cleared` (§7 "Ninth" says "assert equality", and the two halves of that bit live in two
   lanes). If the machine lane re-spells it, the fix is to price `result.cleared` — never to relax
   the test. Comments are stripped before the match, so the sentence in state.js's header cannot
   satisfy it.
3. The DP tests add **~2.4 s** to the suite. That is the price of enumerating the state space instead
   of sampling it, and it is the reason the previous build's "0 violations" meant nothing.
4. Two transients were seen during full-suite runs while the other six lanes were writing:
   `tests/job-state.test.mjs` (machine lane) failed once and passed on re-run a minute later, and
   `tests/job-screen.test.mjs` failed four times and was green on the next run. Neither was caused by
   this lane; both are noted so the integrator does not chase a ghost. The final run of this lane was
   **0 fail**.

---

# ROUND 1 — FIXER PASS (engine lane)

`cd /Users/oliver/Projects/unit1a-quest && node --test tests/job-pay.test.mjs` is **45 tests,
0 fail**. Seven negative controls are recorded at the end of this note; every one of them turns the
file red.

Five findings were assigned to this lane. Four are fixed at the root (two blockers, one major, one
blocker in another lane's file). The fifth is confirmed true, proved to be a THEOREM of the brief's
own maths rather than a defect of the build, and left to the brief's owner with the proof attached.

## 1 · [BLOCKER] the bank decision never got harder — FIXED in `site/js/job/pay.js`

**What was wrong.** `q* = cost / (cost + pay − 8)` contained no pile term, because the flat cost
contained none: at pile 8 and at pile 600 the decision was byte-identical. 14.1 % of the cells where
banking was right were at ×1 and 100 % of them were; never touching the button scored 100.0 % of the
optimum at every q ≥ 0.80.

**The fix — one line of arithmetic, no new number, no new tap, no new word.** A wrong answer now
takes the call's own bite **plus half of whatever the pile holds above 40**:

```
loss = min(P, COSTS[call] × m + share(P))      share(P) = P > 40 ? floor((P − 40) / 2) : 0
```

`40` is not a knob: it is `COSTS.sure × MULT_MAX`, the largest bite the flat table can take. Two
properties made this shape the only one that works, and both are now asserted:

* **The share is the same for every call**, so it CANCELS in every comparison between calls. The
  band edges stay exactly 2/3 and 4/5 at every pile and every streak — which is what lets Settings
  go on printing three fixed bands (CUT-BRIEF math #1, #2). A share that differed by call (a
  fraction of the pile per call, a share taken after the bite) moves the edges with the pile and
  makes that copy false; negative control **N2** does exactly that and 15 tests go red.
* **It starts at 40, so the OFFER GATE does not move.** A call is offered when the pile covers its
  full price; because a bite is at most 40 and the share is at most `(P − 40)/2`, `COSTS[c]·m + share
  ≤ P` the moment `COSTS[c]·m ≤ P`. The gate is therefore the flat gate at every pile and streak
  (asserted over 2 001 × 5 cells), so the ladder (0, 8, 24, 48, 80 — one right answer opens the
  second call, two open the third), the minimum piles and the number of calls on the table are
  untouched. **This was the whole reason for the threshold**: a share starting at 0 raises the gate,
  and a 20 000-session simulation of honest play at q = 0.75 had the student looking at ONE tappable
  call on 57 % of questions instead of 31 %. A dead tap is the failure the brief was written against.

**What it bought** (all measured against the shipped module, `tests/job-pay.test.mjs`):

| | flat table | with the share |
|---|---|---|
| distinct `q*` over reachable piles, per (call, streak) | 1 on all 15 rows | 86–209 on 14 rows |
| pile steps that moved the threshold | 0 of 5 608 | 1 593 of 3 628, **0 fell** |
| cells at ×2…×5 where banking is uniquely optimal | 0 | **32 807 of 49 400** |
| never-bank, as a share of the optimum | 0.9410 … **1.0000** | 0.7224 … 0.9981 |
| …at q = 0.80 | **1.0000** | 0.8942 |
| E[worst drawdown], never-bank, q = 0.70 | 16.8 | 53.5 |
| §4's own worst score against the optimum | 1.000000 | 0.9574 (at q = 0.81) |

The one row whose threshold is still constant is *not sure* at ×1, and that is arithmetic, not a
table: it pays exactly what the question after a bank pays, so pushing it gains nothing at any
price and `q* = 1` — bank. The test asserts that row is the ONLY one and asserts the reason.

**What moved with it.** §4 (`shouldPush`) is no longer exactly optimal — it sees one question, not
the horizon or the option value of an unbanked pile. It is within 4.3 % everywhere on [0.50, 0.99],
it beats both straw men at every rate, and both it and the optimum are threshold policies in the
pile whose thresholds climb with the streak (pinned: §4 banks from 1/84/130/176/222 by streak at
q = 0.75, the optimum from 1/46/73/112/158). `shouldPush` is never printed and has no caller under
`site/`; giving it a lookahead to buy back 4 % on a surface no student sees is the re-inflation the
brief forbids, so the claim moved and the rule did not.

### The disagreement this lane had to settle, recorded in full

While this fixer was working, the **math-integrity lane rewrote the same block of
`tests/job-pay.test.mjs`** with the OPPOSITE answer: three tests named *"the push threshold is
PILE-INDEPENDENT, and the offer gate is why"*, asserting that every (call, streak) group takes
exactly one threshold, with the comment *"no payoff table of this shape can make one rise… Adding a
pile term to the payoff to satisfy the wording would be re-inflation, and it would break math #8 as
well."* (their note is `notes/cut-tests.md`). Those three tests are **replaced** by this pass, and
the §7 #3 block now carries both positions in its header comment. The three reasons:

1. **CUT-BRIEF is the authority and it is not wording.** Math #3 requires the threshold to move
   "with the streak *and the pile*", and the feel section promises "the bank decision getting
   harder. As the pile grows the tension is real". The player who actually sat with the flat table
   filed it as a blocker, not a pedantry: "a student learns it in one session, and ignoring the
   button entirely costs him nothing".
2. **"No table of this shape can" is false, and the proof is the shipped module.** Same three calls,
   same pays, same bites, same gate, same ladder, same printed bands — and 0 bad cells in the
   1 198 782-cell honest-calling grid.
3. **Math #8 is untouched**: the loss is still `min(pile, …)`, still the only subtrahend, still
   floors at zero — 0 violations over the whole state space, asserted as before.

If the integrator prefers the other answer, the thing to change is CUT-BRIEF math #3 and its feel
section, in front of the student's own words — not this file.

## 2 · [MAJOR] "a pile you can lose" was theatre — FIXED by the same change

Nothing separate was added. Same never-bank honest play, 200k trials, 12 questions:

```
            E[worst drawdown]      E[total lost]
q = 0.50     7.2  →  20.4           19.3  →  38.8
q = 0.70    16.8  →  53.5           32.8  →  81.1
q = 0.90    24.3  →  73.7           31.5  →  86.1
```

A miss at a pile of 200 now takes 82–120 points instead of 2–40. The pile is worth protecting, which
is the same sentence as finding 1's fix.

## 3 · [MAJOR] "the call is a lookup" — CONFIRMED, and it is forced by the brief itself

No code change, because every available change breaks a hard limit. The finding is true: at q ≥ 0.80
"tap the biggest affordable button" scores 100 % of the optimum. But that is not an accident of this
table — **it is a theorem of CUT-BRIEF math #1 and #2 together**:

> #2 requires each call to be uniquely optimal on a band of `q`, and *those bands are printed in
> Settings* as fixed numbers. #1 requires the EV-maximising call at the student's true `q` to be
> that call. If the argmax depended on anything but `q` — the pile, the streak, the item's tier —
> then either the printed bands are false (a number on a surface that is not the number the engine
> computes: banned outright) or #1 fails somewhere. So the optimal call is a function of `q` alone.

The finding's own suggestion — "price this item's tier" — needs the tier ON THE FACE-DOWN CARD for
the student to bid against it, which is a fourth number and a taught word. Refused.

What this pass did do is make the printed rate WORTH reading: see finding 4. The judgement that
remains is real but small — the counter is a 10-sitting window on one skill, and the student knows
what he has just revised and whether those three clears were luck. **The sentence that should come
down is CUT-BRIEF's own "This is real metacognition and it is the best idea in the old design."**
That is the authority's sentence and this lane will not edit it; the proof is here for whoever does.

## 4 · [BLOCKER] the hit rate froze on every Variant — FIXED in `site/js/job/call.js`

**What was wrong.** A page deals cards and Variants, the game prices both, and only a card writes
`cards[id].history`: a cleared Variant bumps a counter on `variants[template]` (no instant, no
skill), a missed one goes to `frozen`. So `qHatDetail`, which walked `save.cards` alone, printed a
frozen `4 of 5` across three consecutive Variants of the same skill while the pile moved three
times.

**The fix — no new save state.** `store.js` says of the game's keys: *"THE GAME HAS NO CAP HERE, and
must never grow one"*, and `tests/job-save.test.mjs` pins `Object.keys(freshGame()) === ['today',
'day']`. A per-skill sitting log would have broken both. Two stores already hold those sittings and
`qHatDetail` now reads them:

* **`runs[]`** — every finished PAGE record carries one row per item, `{id, skill, credit}`, with
  `credit = result.cleared ? 1 : 0` (the SAME BIT, by construction). `makeRunRecord` writes it on
  `#/run/page` and `commitJobRun` writes the identical record for a game session, which
  `tests/job-ledger.test.mjs` already pins. Stamped with the run's `submittedAt`, so these rows cut
  at the seal like any other. Only `kind: 'page'` runs are read — a Mock builds its own item shape
  and means something else by it.
* **`inProgress.queue`** — the page being played now, where `markItem` has already stamped `done`
  and the grade `result` on every question answered so far. This is what makes the count move
  WITHIN the session, which is what the finding asked for.

A row whose id has a card record is dropped from both (the card history already holds it; control
**N5** removes that guard and the count double-reports). The item at `idx` — the question on screen
— is never in its own rate.

**What it costs, stated plainly:** a Variant answered before the app kept a page record for it is
not counted (nothing recorded it), and Variant sittings inside a Mock are not counted. The rate is
"every card sitting the app has ever recorded, plus every page sitting" — never a percentage,
always `h of n`, so a small `n` is visible to the student rather than hidden by a percent sign.

## 5 · [BLOCKER] throwing a review paid 16–44 % — FIXED in `site/js/job/state.js` (CROSS-LANE)

**What was wrong.** A missed review is requeued by the study layer (`page.requeueReview`) — so being
wrong ADDS a question, and the copy was priced like any other. At an empty pile the throw cost
`min(pile, cost) = 0` and bought a question whose worked solution had just been on screen.

**The fix is subtractive: the game prices each QUESTION once.** `sealRepeat` seals a requeued copy
with a **bidless call** (`{ id: null, at }`) the moment it becomes current, so:

* `payOf(null) = costOf(null) = 0` — the copy pays nothing, costs nothing, and the streak does not
  move (`priced` guard in `answer`);
* `screens/job.js` renders the question immediately (`isObj(g.call)` is its "the bid is in" test),
  so the student is **never asked to bid on a question he has already seen** — no dead tap, and the
  strip keeps printing his hit rate instead of `pays 0`;
* the seal survives serialisation, so a reload cannot make the copy biddable again;
* `call()` over a repeat returns the bidless price instead of throwing (headless drivers and
  `tests/job-ledger.test.mjs` lock a call on every question), and `bank()` now refuses only over a
  REAL bid — banking over a repeat takes nothing from anybody, so "bank is always available" stays
  true.

The schedule is untouched: the copy is still queued, answered and marked through `markItem`, and
`tests/job-ledger.test.mjs` is still byte-identical green (22 tests).

**The proof runs on the shipped queue, not on a model of it.** `tests/job-pay.test.mjs` now drives
`call → answer → endJob` over a real page and enumerates ALL 8 throwing strategies over its three
reviews; every arm's queue really grows, every copy is asserted to pay 0 / cost 0 / move neither
pile nor streak, and every arm scores strictly less than honest play. That is the regime the old
fixed-`T` DP could not reach.

**CROSS-LANE, declared (BUILD-POLICY §2):** `site/js/job/state.js` belongs to the machine lane. Five
edits: `sealRepeat` + `isRepeat` + `isCall` (new, ~25 lines with the comment), the `priced` guard in
`answer`, the bidless branch in `call`, the bid-only refusal in `bank`, `resume`'s belt-and-braces
seal, and one clause in `serialize`'s `call` case. Nothing else in that file was touched.

## Numbers that MOVED, for whoever owns `designs/CUT-SPEC.md`

§2 and §7 quote figures that this change re-measures. The shipped values, all pinned in
`tests/job-pay.test.mjs`:

* reachable states, T = 12: **1 222** (was 1 883); T = 14: **1 522** (was 2 383)
* honest-calling grid: **0 bad of 1 198 782**, ties at q = 0.8: **1 206**
* uniquely-optimal shares: **4.7 / 5.7 / 17.5**, bank **72.0**, tie 0.1 — and among the cells where
  a call is the right move at all, **16.7 / 20.5 / 62.8**
* §4 vs the optimum: **0.9574** at worst (q = 0.81), never-bank **0.7224–0.9981**, always-bank
  **0.9404–0.2416**
* #4 minimum gap **8** over **3 646** state × call pairs; #8 still 0 violations
* #6 curve at T = 12: **36, 54, 78, 109, 154, 222, 377** (was 37, 58, 87, 126, 186, 278, 413) — every
  step still monotone over all 70 steps of [0.30, 0.99]
* the streak sweep is **2 110** comparisons and the pile sweep **3 628**

§2's prose needs one more line — the share — and §1's "takes a bite out of the pile" is now literally
true of the pile as well as of the bite.

## Requests

1. **`screens/job.js` (screen lane).** A repeat arrives with `g.call` sealed and `g.call.id === null`.
   Your existing `render()` already does the right thing (`isObj(gv.call)` → `renderAnswer`), and
   `viewModel` already reads `typeof g.call.id === 'string'`, so the strip prints the hit rate and
   never `pays 0`. **Do not "fix" the bidless seal into a call phase.** If you want bank live on a
   repeat, `state.bank` now allows it — it is your foot, not the engine's.
2. **The split meter (meta lane).** A repeat has no call phase, so its seconds land in `tAnswer` and
   none in `tGame`. Repeats are a minority of questions, but the measured split will read slightly
   lower than before. The brief's remedy if it falls under 45 % is fewer, harder questions — never
   padding the game.
3. **`designs/CUT-SPEC.md`** — the figures above, and §2's loss line.
4. **CUT-BRIEF's "real metacognition" sentence** — see finding 3. Evidence attached; the edit is the
   authority's to make.

## Negative controls (every one turns `tests/job-pay.test.mjs` red)

| | change | result |
|---|---|---|
| **N1** | `shareOf` → `() => 0` (the flat table is back) | 13 fail |
| **N2** | the share made call-dependent (`× (1 + share)`) | 15 fail |
| **N3** | live-page Variant sittings dropped from `qHatDetail` | 1 fail |
| **N4** | past-page Variant sittings dropped | 1 fail |
| **N5** | the `notACard` guard removed (cards counted twice) | 1 fail |
| **N6** | `sealRepeat` disabled (a repeat is priced again) | 2 fail |
| **N7** | the `priced` guard removed (a repeat climbs the streak) | 2 fail |

The controls in the first half of this note (N11–N18, N26, N27) still hold; N11's subject is gone
with the `Infinity` sentinel (`costOf`'s third argument is a real pile now, and a missing one is an
empty pile, which honestly costs nothing).

## Addendum, written 20 minutes after the section above — the disagreement resolved itself

`designs/CUT-SPEC.md` was rewritten while this note was being filed and now documents the share:
§2 carries `−(2m + share)` / `−(4m + share)` / `−(8m + share)` with `share = ⌊(P − 40)/2⌋`, §4 says
`cost` carries the share "so the rule reads the pile without being told about it", §5 keeps its two
worked examples (both are below 40, so both are unchanged), and §7 prints the measured figures —
1,198,782 cells, 1,206 ties, 4.7 / 5.7 / 17.5 / 72.0, 2,110 and 3,628, 0.9574, 3,646, and the new
#6 curve. Every one of them agrees with this lane's measurements to the digit, so the
pile-independence position is superseded and nothing further is needed from the integrator.

**One wording flag for whoever owns the spec.** §7 #3 reads *"rises strictly with the pile
(**3,628**)"*. 3,628 is the number of pile steps SWEPT, not the number that rose: the honest
statement, and the one `tests/job-pay.test.mjs` asserts, is **0 of 3,628 fell and 1,593 rose** — the
remaining steps are equal because the share is floored and only moves every second point, and
because *not sure* at ×1 has nothing to gain at any pile. Quoting a swept denominator as if it were
a strict-rise count is precisely the error round 1 caught in the old "0 of 1,470". The test is the
one that cannot be wrong here; the sentence should follow it.

**Full suite at the end of this pass:** `node --test tests/` → **1 756 tests, 143 suites, 1 752 pass,
0 fail, 4 skipped** (the four skips are the pre-existing Playwright-gated browser arms).

**One asymmetry, chosen deliberately and written into `call.js`'s header so the next critic sees it
was a decision.** A repeat is COUNTED by the hit rate and PRICED at nothing. The two numbers measure
different things — the rate measures the student, the pile measures the bid — and they have to
disagree here, because `screens/card.js` writes a card's repeat into `cards[id].history` whatever
the game does with it. Counting a card's second sitting but not a Variant's would be the same freeze
this pass just fixed, one kind of question later. §7 "Ninth" is about the BIT (`result.cleared`),
and that bit is identical on both sides for both kinds of item; the test drives a Variant through
the shipped verbs and asserts the count moves by exactly one sitting, in the direction the pile moved.

---

## Round 2 — the engine lane's one blocker: §7 #6 was a sample calling itself a continuum

**Finding (math-integrity, r2): CONFIRMED, independently.** `designs/CUT-SPEC.md` §7 #6 published
"**0 non-monotone steps** over [0.30, 0.99]" and `tests/job-pay.test.mjs:866-873` proved it with a
0.01 sweep that closed on `assert.equal(vals.length - 1, 69, 'the sweep is every step, not a
sample')`. Seventy points of a continuum is a sample, and that comment was the loudest sentence in
the file.

I did not take the critic's numbers. I rebuilt `reachable`/`policyValue` from `site/js/job/pay.js`
alone (scratch, `verify6.mjs`) and reproduced the lane's pinned figures first — `reachable(12) =
1222`, `CAP12 = 496`, curve `36, 54, 78, 109, 154, 222, 377` — then swept finer:

```
step 0.01 : 69 steps, non-monotone = 0
step 0.001: 690 steps, non-monotone = 8
            0.483→0.484 61.46→61.37 | 0.609→0.610 95.66→95.15
            0.666→0.667 115.11→112.90 | 0.706→0.707 131.29→130.21
q 0.8000 → 0.8001 : 182.7652 → 176.4953   (−6.27 points, −3.4 %)
q 2/3    → 0.6667 : 115.3647 → 112.7689
```

The claim was false. The table is not.

### Why the fix is the sentence and not the table

The falls are the honest call stepping up at the band edges — COSTS 2→4→8 against PAYS 8→9→10 — and
those edges are `2/3` and `4/5`, which §7 #1, §7 #2 and the three lines Settings prints are all built
on. Moving them to smooth the curve moves every band, falsifies `BANDS`' copy, and is exactly the
re-inflation CUT-BRIEF names. The 0.01 grid straddles both edges (E(0.66) < E(0.67), E(0.80) <
E(0.81)), so the old sweep could not fail whatever the table did between its points.

### What was actually wrong with the claim, at the root

The old model collapsed two different rates into one `q`. The coin — how often the student is really
right — is a continuum. The rate the GAME READS is the one the strip printed, `qHatDetail`'s
`hits / of` with `of ≤ QHAT.window = 10`: **33 values in [0, 1] and no others**. Sliding `q` through
0.8001 slides the CALL POLICY through a band edge no student can ever sit on. `policyValue` now takes
both (`policyValue(q, T, CAP, kind, qHat = q)`) — the coin drives the outcome, `qHat` drives
`honestCall` and `shouldPush` — which is what makes the requirement testable as it is written in
CUT-BRIEF: *"getting better can never lower any number the app SHOWS the student."*

### The §7 #6 block now, five tests where there was one

| test | what it sweeps | result |
|---|---|---|
| the best a student can do never falls | the OPTIMUM (`solveDP`), 200 steps of [0, 1] | 0 falls |
| …under a printed rate that has not moved | all 33 printable rates × 11 true rates = **363 cells** | 0 falls |
| …when the printed rate ticks up | the complete printable set, `rule`/`never`/`always` | 0 falls |
| RECORDED: off the printable grid it falls | both band edges, pinned | 182.8 → 176.5 |
| no printed number falls when a miss becomes a clear | every outcome pattern of a full window, **5,120** flips | 0 falls |

`printableRates()` is derived from the SHIPPED `QHAT_WINDOW`, never from the literal 33; the two
figures the spec publishes (`182.8`, `176.5`) are asserted to one decimal, so the spec cannot print a
number the engine does not compute. **No screen number and no tap was added: every one of these is a
test, and `site/js/job/{pay,call}.js` and `site/data/job.js` are byte-identical to round 1.**

### Tests deleted / weakened — none, and one assertion removed on purpose

Deleted: the 0.01 sweep and its `'the sweep is every step, not a sample'` assertion. It covered no
mechanic; it asserted a false property of the curve, and its replacement is strictly stronger (the
optimum over a wider range, plus an exhaustive sweep of the grid the app lives on, plus the recorded
counter-example it used to step over). Nothing else in the file moved except the pinned-curve
comment, which said "every step monotone above" and now says the seven are a published sample.

### Negative controls, run against mutated copies of the shipped modules

| # | mutation | caught by |
|---|---|---|
| **N8** | `COSTS.sure` 8 → 24 | printable ladder FALLS `0.8 → 0.8333`, 203.68 → 199.28 |
| **N9** | `honestCall` edges `2/3, 4/5` → `0.62, 0.78` (the "re-tune the edges" fix) | RECORDED: the 2/3 fall becomes a RISE (112.754 → 112.769) and `honestCall(2/3) === honestCall(0.6667)` |
| **N10** | the loss cap dropped from `costOf` | RECORDED: both edges go `NaN` |
| **N19** | the share made call-dependent (r1's N2, re-run) | RECORDED: `0.8` goes `NaN` |
| **N20** | `call.js` counts every sitting as a hit (`if (e.ok)` dropped) | the flip test: **5,120 of 5,120** flips fail |

N9 is the one that matters: it is the shape of fix a future lane would reach for, and it now goes red.
The two structural sweeps (optimum, pinned-rate) are the least sensitive of the five — they are
checks on a fact §7 #4 already owns — and that is recorded here rather than dressed up.

### Spec

`designs/CUT-SPEC.md` §7 #6 rewritten to what the code produces. +35 words on a file another lane was
trimming at the same time (1,406 → 1,252 while this ran); my paragraph survived their pass, but
**whoever owns the spec should re-check line 90 after their next trim.**

### Observation for the machine lane — NOT a request, it holds

`tests/job-state.test.mjs:488` makes the sibling claim over the same 0.01 grid. Its `solve()` is the
OPTIMUM (a max over offered calls and over banking), not the honest-call rule, and I verified the
optimum is monotone at step 0.001 across all of [0, 1] — 0 falls. That claim survives; only the
rule-policy one was false. Its "all 70 steps of [0.30, 0.99]" is still a grid and reads like a
continuum; worth one word.

**Suite at the end of this pass:** `node --test tests/` → 1,767 tests, 1,756 pass, **7 fail, all in
`tests/job-screen.test.mjs`** (`state.priceOf` returns no `pay`, `stakeOf is not defined`) — the
screen lane's rewrite mid-flight, `job-screen.test.mjs` last written 63 s before the run. The six
tests this lane owns are green: `job-pay`, `job-ledger`, `job-save`, `job-split`, `job-state` →
164 tests, 0 fail. `job-pay` alone: 49 tests, 10.4 s (was 45, 4.4 s).

---

## Round 3 — the engine lane's one blocker: the printed split was a share of WALL CLOCK

**Finding (number-truth, r3): CONFIRMED, reproduced before a line was changed.** The end panel's
`% of this session was the game` divided by every millisecond since `inProgress.startedAt`, and
everything the screen does not declare fell to `tAnswer`. A student who shut the tab or put the
phone down was inside his own denominator. The critic's node driver, re-run first:

```
no absence       tGame 24000 tAnswer   125000  split printed 16   | true game share 16
5-min absence    tGame 24000 tAnswer   425000  split printed  5   | true game share 16
1-hour absence   tGame 24000 tAnswer  3725000  split printed  1   | true game share 16
12-hour absence  tGame 24000 tAnswer 43325000  split printed  0   | true game share 16
```

Identical decisions, identical speed, `tGame` byte-identical in every row. The arithmetic was exact;
the sentence under it was about a session nobody had — and it is the app's ONLY self-report against
CUT-BRIEF's 45–55 %.

### The fix, and what it refuses to be

**A span is out of the share only when the app DECLARED IT WAS NOT IN USE.** Duration is never
evidence. A ceiling on the answering half (the symmetric partner of `DELIBERATION_MS`) was the
obvious move and was rejected: it would exclude a genuinely slow reader, which raises the printed
share, and it breaks the one posture that has kept this meter honest since r2 — *an interval the app
gets wrong may only ever LOWER the number*. The fix is presence, which the file's own r2 comment had
already named as the residual.

* **`site/data/job.js` (this lane's)** — `IN_PROGRESS_KEYS` 7 → 9: `tAway` (ms the app was not in
  use) and `away` (one bit, 1 while it is away). No copy, no constant, no knob; `COPY` is untouched
  and `tAway` has no string and no slot.
* **`site/js/job/state.js`** — `measuredOf` counts `tAway`, so the invariant is now three-way:
  `tGame + tAnswer + tAway === lastVerbAt − startedAt`. New export `presence(save, {now, here})`:
  `here:false` books the time the student WAS here to the answering half and sets the bit;
  `here:true` (and `tick`, and `resume`) closes it. `resume(save, {now})` closes an absence at the
  instant the session is re-opened.
* **`site/js/screens/job.js`** — the existing `onAway` handler still calls `skipBeat()` and now also
  reports presence.

**THE APP IS NEVER TOLD HOW LONG IT WAS AWAY.** The record holds a BIT, not a stamp and not a
duration. The length is derived from the meter's own unattributed span — which is exact, because
`presence(here:false)` attributes everything up to the departure first. There is no number to forge,
no timestamp to move, and no arithmetic that can reach past the clock: the worst a corrupt save or a
lying screen can do is move one interval out of the answering half. (An earlier draft stored the
departure *instant*; a fixture caught it immediately — a session whose `startedAt` is 0, going away
at 0, stamps `awayAt = 0`, which is the same value as "not away". The bit has no such hole.)

The bit is on the DISK, which is what makes a closed tab work: the present time is booked before the
page dies, and the absence that follows is closed whenever the session is opened again.

### What it prints now — the SHIPPED path, chromium, 390×844, the critic's own driver

`scratchpad/gap2.mjs` is `gap.mjs` with one change: the break happens the way a break happens in a
browser (the document goes hidden and `pagehide` fires, then it comes back), instead of the clock
being skewed under a tab that never stops claiming to be visible.

```
gap   0 min -> engine {tGame:66000 tAnswer:651110 split:9}  panel [… "9 % of this session was the game" …]
gap   5 min -> engine {tGame:66000 tAnswer:651109 split:9}  panel [… "9 % of this session was the game" …]
gap  45 min -> engine {tGame:66000 tAnswer:651110 split:9}  panel [… "9 % of this session was the game" …]
gap 720 min -> engine {tGame:66000 tAnswer:651108 split:9}  panel [… "9 % of this session was the game" …]
```

Was 9 / 6 / 2. `tAnswer` is within 2 ms of the undisturbed session across a twelve-hour break, the
panel is the same four strings, and a hide/show cycle raises **zero console errors**
(`scratchpad/gap3.mjs`). **No number was added to the screen and no tap to a question**: the panel
prints what it printed, and `presence` renders nothing.

### The residual, recorded rather than dressed up

`gap.mjs` unmodified — the clock skewed with `document.visibilityState` still `'visible'` — still
prints **9 / 6 / 2**, and that is correct behaviour, not an unfixed half. Nothing distinguishes an
hour in front of a visible page from an hour of thinking, and the meter's rule is that when it
cannot tell it counts the time as study, which LOWERS the share. It never raises it on a guess. In a
real browser the cases the finding names — closing the tab, backgrounding the app, a phone locking —
all fire `visibilitychange`/`pagehide`, which is the path above.

### Tests

`tests/job-split.test.mjs` **§9 (new, 6 tests)**: the blocker restated (any break, any length, prints
the number the uninterrupted session prints, and equals `gameMs / playedMs` computed outside the
machine); a tab CLOSED for it and re-opened by `resume`; the record through the disk; the three-way
invariant over six shapes; *nothing but a declared absence reaches `tAway`* (a "came back" nobody
left is a strict no-op field-for-field, a repeat moves nothing between the halves, eleven forged
values of the bit cannot break the partition or reach the game half, and an **undeclared** hour still
lowers the share); and the absence prices nothing — points, today and best are unmoved.

**Tests changed, and none weakened.** `#6`'s `'the meter still needs no eighth field on the disk'`
asserted a property the fix legitimately changes; it now pins the nine keys. `#6`'s screen lint
asserted the away handler's body was *exactly* `skipBeat()` — the claim the finding falsified, since
dropping the claim never stopped the engine booking the absence. It is replaced by a strictly
stronger lint: the handler must still call `skipBeat()`, must report `state.presence`, must read
`here` off `document.visibilityState` (a constant would mark every event the same way), must NOT
declare a duration, and must call none of the four verbs. **No test was deleted**; `job-state`'s
serialize/deserialize tests gained the two new fields and six more junk cases.

### Negative controls, run against mutated copies in an isolated tree

| # | mutation | caught by |
|---|---|---|
| **N1** | the absence booked to `tAnswer` (the pre-fix behaviour) | 5 fail, incl. THE BLOCKER and the invariant |
| **N2** | the absence credited to `tGame` (the flattering direction) | 5 fail |
| **N3** | `measuredOf` forgets `tAway` — the absence returns at the next verb | 4 fail |
| **N4** | `presence` sets the bit without closing the books first | 3 fail |
| **N5** | the idempotence early-return removed | **0 fail — see below** |
| **N6** | `closeAbsence` books an absence nobody declared | **35 fail** (every #1 invariant shape) |
| **N7** | the screen wires `here: false` on every event | the lint |
| **N8** | the screen goes back to `skipBeat()` alone | the lint |
| **N9** | `resume` stops closing the absence | 2 fail (the killed tab, the disk) |

**N5 is reported as it happened.** Removing the early return in `presence(here:false)` leaves every
assertion green, because `tick` closes an open absence before it attributes anything, so a repeated
"hidden" re-books the same span to the same half. The guard is a cheaper path, not a property under
test, and the test's comment now says so rather than claiming a proof it does not have.

### Suite

`cd /Users/oliver/Projects/unit1a-quest && node --test tests/` → **1 827 tests, 148 suites, 1 823
pass, 0 fail, 4 skipped** (the four skips are the pre-existing Playwright-gated browser arms).
`job-ledger` is green: the Law of Two Ledgers is untouched — `presence` writes `inProgress.game` and
nothing else, through the same `guardSave` proxy as every other verb.

### Requests — files this lane changed that it does not own

1. **`machine` (`site/js/job/state.js`, `tests/job-state.test.mjs`).** The meter is yours. The change
   is `measuredOf` + `closeAbsence` + `presence` + `resume(save, {now})`, and the doc blocks around
   them. The serialize/deserialize tests gained `tAway`/`away`. Nothing else in the file moved.
2. **`screen` (`site/js/screens/job.js`).** Two edits, both marked `cross-lane … notes/cut-engine.md
   §R1` in the source: the `onAway` body, and `state.resume(s, { now: Date.now() })` at the mount.
   The handler still declares nothing to the game half — `job-split` §6 lints that it cannot.
3. **`save` (`tests/job-save.test.mjs`).** One assertion: the `IN_PROGRESS_KEYS` literal, 7 → 9.
   Two more scalars per live session (~20 B) — no cap, no collection, nothing that can grow.

---
---

# ROUND 4 — the engine lane, four findings, fixed at the root

`cd /Users/oliver/Projects/unit1a-quest && node --test tests/` is GREEN (counts at the foot of this
section). Nothing was added to the design: no mechanic, no currency, no second collection, no rank,
no tag, no token, no tuning knob. Two of the four fixes SUBTRACT — one tap and one censoring rule —
and the other two move a bit and a slot that already existed.

Files this lane changed, and who owns them:

| file | owner | what moved |
|---|---|---|
| `site/js/job/pay.js` | **this lane** | `decides(pile, m)` — one derived predicate, no new number |
| `site/js/job/call.js` | **this lane** | the hit rate counts a CLEAN clear (`cleanSitting`) |
| `tests/job-pay.test.mjs` | **this lane** | §7 "Ninth" restated + the r4 suite, 34 → 53 tests |
| `site/js/job/state.js` | machine | the deliberation CEILING → a CAP; `cleanOf` prices the clear |
| `tests/job-state.test.mjs` | machine | #9's shapes, and the study bit split from the game bit |
| `tests/job-split.test.mjs` | split | §7 restated around the cap (see §4 below — 3 tests rewritten) |
| `site/js/screens/job.js` | screen | the no-decision card, the bidless slot (§R2/§R3 below) |
| `qa/cut-engine-r4.mjs` | — | new, dev-only: the browser evidence for #1 and #2 |

---

## 1 · [MAJOR] the bid that did not exist, and the tap that bought nothing — FIXED

**The finding.** `offered(0, ×1)` is `['not sure']` and nothing else, bank is dead at an empty pile,
and `requiredTapsOf` was still 1: the first card of every session had ONE live control with ONE
possible value standing between the student and the question. It recurs after every bank and after
every miss that empties the pile — 40.5 % of the cards of a q = 0.60 session, 11.8 % of a q = 0.95
one, so the weaker the student, the more of the game was a dead tap. `state.js:779` names that exact
shape as banned and then the game opened with it.

**Why the other repair is not available.** "Give the opening card a real choice" cannot be done in
the table. At `P = 0` every cost is `min(P, …) = 0`, so an ungated call is free money: offer `sure`
there and it is uniquely optimal at every `q`, which is CUT-BRIEF math #1 and #2 gone, and
`tests/job-pay.test.mjs` §7 #1/#2 go red on the first sweep. A pile you cannot lose is not a bid.
Nothing in the gate moved, and the ladder (0, 8, 24, 48, 80) is what it was.

**The fix — subtractive.** `pay.js decides(pile, m)`: *a state decides something when more than one
call is offered, or when there is a pile to bank.* Where it is false the screen locks the one call
there is (`renderCall` → `lockOnly`) and the question arrives — one tap for that question instead of
two, and the call locked is the argmax over everything the student could have chosen, at every `q`
and every streak (proved, not asserted: `job-pay.test.mjs` "the student loses no choice").

`lockOnly` declares **`ms: 0`**. No decision was made, so none is booked to the game half; the
interval goes to the study half with the rest of the undeclared time. A screen that booked this
card's dwell as deliberation would be padding the measured split with a card the game never asked
about, which is the one thing CUT-BRIEF's session shape forbids outright.

**The bank receipt moved with it** (`doBank`'s timer now calls `render()` rather than redrawing the
strip alone): banking empties the pile, so the card behind the receipt is a card with nothing on it,
and the receipt is now followed by the question instead of by a dead control.

**Evidence — chromium, 375×812, a fresh save, `node qa/cut-engine-r4.mjs`:**

```
A. THE FIRST CARD OF A SESSION — pile 0, one call, nothing to bank
   strip : [{"slot":"pile","value":"0"},{"slot":"streak","value":"×1"},{"slot":"third","value":"pays 8"}]
   screen: {"phase":"answer","faceDown":false,"liveCalls":[],"bank":"absent","question":true,
            "sealed":{"id":"not sure","at":…}}
```

Was: a face-down card, `not sure` alone live, two dashed calls, a greyed bank, and no question until
it was tapped.

**How much of the finding this covers**, simulated over the shipped table the way the critic did it —
4,000 sessions × 14 questions, honest calls, §4's bank rule
(`scratchpad/r4-decides.mjs`):

```
q=0.60   one-call cards 38.3 %   of which pile 0 (the fix) 100.0 %   dead taps left 0.00 %
q=0.75   one-call cards 28.2 %   of which pile 0 (the fix) 100.0 %   dead taps left 0.00 %
q=0.85   one-call cards 16.6 %   of which pile 0 (the fix)  90.8 %   dead taps left 1.52 %
q=0.95   one-call cards  8.8 %   of which pile 0 (the fix)  95.3 %   dead taps left 0.42 %
```

The remainder is deliberate and it is not a dead tap: a pile of 1–3 at ×1 offers one call AND a live
bank, and §4 says banking is the right move at ×1 — one tap, two outcomes, which is a decision. The
predicate says so in one line rather than by special case.

---

## 2 · [MAJOR] a right answer on a repeat that moved neither number — FIXED (the strip says it)

**The finding.** `sealRepeat` seals the copy a missed review puts back on the page with `{id:null}`,
so it pays nothing, costs nothing and leaves the streak — the r1 fix for the thrown-review exploit,
and it is right. What was wrong was that nothing on screen said so: the critic answered the FD-length
card correctly, the study layer printed `GOLD · +43 XP`, and the strip stayed at `28 pile · ×1
streak`. CUT-SPEC §6 forbids any copy that could explain it.

**The fix — the slot that names payment is EMPTY when there is none.** `readingOf` carries the
engine's own `state.isBidless(save)` (exported since r3, and nothing had ever read it) and `stripFor`
renders the third slot blank on a bidless question. Every priced question carries `pays N` in that
slot from the moment the bid lands until the grade; this one carries nothing, from before the answer.
No word, no number, no fourth slot — one FEWER thing on screen than a paid question has.

**Evidence — the same driver, a real requeued review (`ang-wu-2`, `requeued 1`) reached by missing a
review through the shipped verbs:**

```
B. face down : [{"pile":"0"},{"streak":"×1"},{"third":""}]   phase flip, calls all greyed, bank greyed
   question up: [{"pile":"0"},{"streak":"×1"},{"third":""}]   phase answer
   …against A above, which is a PAID question in the same phase: `pays 8` in that slot.
```

The screen lane landed the other half of this in the same round (`flipBeat` for a repeat: the card
turns rather than the question simply appearing), and the two compose — the beat is where the empty
slot is read, before the answer.

---

## 3 · [BLOCKER] the printed split was not the measured split — FIXED (the ceiling is a cap)

**The finding.** `deliberation()` credited **nothing** past `DELIBERATION_MS` while the session kept
the whole interval in the denominator, so a present, thinking student lost his decision twice over.
A real chromium session (tab visible throughout, no `visibilitychange`) spent 78,006 of 157,087 ms on
the face-down card — 50 % — and the end panel printed **6 %**. In the engine probe: 23.9 s of
deciding printed 46 %, **24.1 s printed 0**.

**What was considered, and why the cap wins.** The two candidate rules for an interval nobody can
attribute are a ceiling (credit 0 past the bound) and a cap (credit the bound):

* `tGame ≤ decisions × DELIBERATION_MS` under BOTH — the exposure to an unseen absence is identical.
* Past the bound the printed share FALLS with every further second under both, and tends to 0.
* Under both, a dwell UNDER the bound is booked as deliberation. Neither closes that; presence does.
* They differ in one place only: what a REAL decision over 24 s is worth. Ceiling: nothing. Cap: 24 s.

So the cliff bought no safety — it bought a censored statistic, and CUT-BRIEF answers a low number by
cutting answering time, which is exactly the wrong repair to drive with one. The absence the round-2
critic actually filed (a phone call, a locked phone, a killed tab) is closed twice over by r3's work:
`screens/job.js onAway` calls `skipBeat()` on `visibilitychange` AND `pagehide`, so a hidden span is
not inside the screen's claim at all, and `presence` books it to `tAway`, out of both halves.

**The fix.** `const deliberation = (ms) => Math.min(DELIBERATION_MS, Math.max(0, ms));` — one line.
`tick`'s body did not change (`deliberation(Math.min(declared, elapsed))` is now exactly
`min(declared, elapsed, CAP)`), and the excess still falls to `tAnswer`, so the partition holds and
an unattributed interval can still only ever LOWER the share.

**Evidence — `node qa/cut-run-r3-split.mjs`, table B (12 questions, 34.7 s answering):**

```
   deciding   split          was
      3.0 s   8 %            8 %
     18.0 s   34 %           34 %
     23.9 s   41 %           41 %
     24.1 s   41 %      ←     0 %     the cliff
     30.0 s   37 %      ←     0 %
     60.0 s   25 %      ←     0 %     …and it still falls with the absence
```

**Tests.** `tests/job-split.test.mjs` §7 was written around the ceiling; the properties that survive
are pinned and the two that were about the cliff are gone. Rewritten, with what each now proves:

1. `THE BLOCKER` → **an absence the app can SEE prints the calm session's number, at every length**
   (25 s … 1 h, through `presence`, the way a browser drives it). Its old form asserted that an
   UNdeclared idle prints a strictly smaller number than the calm session — a property only the
   cliff has, and one the brief never asks for.
2. new: `…and one it CANNOT see is bounded` — an unseen idle may never add more than one
   deliberation to the game half, at any length, and the print stays under `SPLIT.lo`.
3. new: `THE ROUND-4 BLOCKER` — 23.9 s and 24.1 s must print within 1 point of each other, and a
   session that really is ~46 % deliberation must print ~46 %.
4. `isolated: … books NO game time` → `… books the cap and no more` (and 10 minutes on one card
   prints 4 %).
5. `…one AT the ceiling` keeps its four inclusive cases and its last line becomes the cap's:
   `24,001 ms` settles as the cap plus a millisecond, not as zero.
6. `the ceiling holds on the degraded path` → `the bound holds …`: an unclocked 90 s claim buys one
   deliberation, not 90 s and not 0.
7. **DELETED: `a CAP would have kept paying for absence; a ceiling does not`.** It tests the
   mechanic the brief's own honesty requirement cuts, and it is the only test in the file that
   cannot survive the fix. It is named here rather than quietly dropped.

`…and the longer the absence, the smaller the number` and `the bound: no screen, however wrong …`
were NOT touched and are green under the cap — which is the point about the exposure being identical.

---

## 4 · [MAJOR] `sure` was buyable at will — FIXED (the game prices a CLEAN clear)

**The finding.** The game priced `result.cleared` and nothing else, and `screens/card.js` sets that
for a clear bought with three hints and two retries. The ladder is on every card by design and H3
states the answer on the hardest skills (`quad-01`, `fac-07`). Driven in the real app on `def-02`:
three taps on Hint, then submit, and the engine paid `pretty sure` in full — +18, ×2 → ×3 — and the
row of marks the next bid is read off gained a filled one. Exact DP over one 17-question page: 746.0
for a student who can read, against 263.7 for a genuine 4-in-5 and 184.2 for a 7-in-10. No deliberate
wrong answer anywhere, so math #5's proof could not see it; and with `q` a dial the student turns,
`sure` is uniquely optimal wherever it is offered and the other two calls are never correct.

**The fix — read the bit the rest of the app already writes.** `clean` is Global rule 8 — first try,
zero hints — the bit `js/xp.js isClean`, `js/mastery.js`, `js/rarity.js` and the Leitner ladder in
`js/schedule.js` have always shared: **a hinted clear leaves the bucket exactly where it was.** The
game now settles on the same one, in both places at once:

* `job/state.js cleanOf(result)` — `result.clean` when card.js sent one, else derived from
  `firstTry` / `attempt` / `hints` / `solutionShown`. `answer()` keeps `ok = result.cleared` for the
  SCHEDULE (the requeue branch) and prices `earned = cleanOf(result)`.
* `job/call.js cleanSitting(row)` — the marks count clean clears. A bought clear is still a SITTING
  (it is in `of`, and it draws a struck mark), so the row is still the count of the student's own
  sittings and only the fill changes. Card history rows carry `attempt`/`hints`; `runs[]` rows carry
  `makeRunRecord`'s `clean`; a row that cannot say it was clean fills no mark, which is the same
  direction every other unknown in this layer takes.

**Why not "a bought clear settles like a repeat" (the finding's own suggestion).** It re-opens
dominance through a different door. A hint is available AFTER the question is on screen, so a
settlement that costs nothing is a free escape from a bad bid: every call's downside becomes 0, the
calls then differ only by `pay`, and `sure` is uniquely optimal everywhere — math #2, gone. The same
is true of "pays nothing, costs nothing, streak to ×1": what makes the three calls different is that
the DOWNSIDE differs by call, so the downside must stand. A bought clear therefore settles exactly as
a miss does, and the student bid on knowing this cold.

**The hint is not punished; the bid is settled.** Nothing in Ledger A moved: XP, the bucket, mastery,
rarity, the Binder and the schedule are written by `screens/card.js` exactly as before, `markItem`
gets the same record byte for byte, and `tests/job-ledger.test.mjs` is green untouched.

**Evidence — `tests/job-pay.test.mjs`, the shipped verbs on identical saves:**

```
clean  {cleared:true, attempt:1, hints:0}                 ok true   delta +8  pile 8  ×2   marks 1 of 1
bought {cleared:true, attempt:1, hints:3, clean:false}     ok false  delta 0   pile 0  ×1   marks 0 of 1
a page of six bought clears banks 0; the same page answered banks > 0
```

**Tests.** §7 "Ninth" in `job-pay` is now the equality it always claimed to be — the pile and the row
are driven together and must agree — replacing a source regex that passed while the pile paid for a
clear the student had bought (`result.cleared` is still in the file, because it is still the study
layer's bit). `job-state` #9's shapes gained the five bought-clear rows, and its second test now says
the sentence it always meant: the record handed to the study layer carries the STUDY layer's bit.

---

## Residuals, stated rather than dressed up

1. **A dwell under the cap is still deliberation.** Twenty seconds of not being there reads exactly
   like twenty seconds of choosing, and no clock can tell them apart. Unchanged by this round; only
   presence closes it, and only where the document says it is hidden. A page left VISIBLE with
   nobody in front of it is bounded (one deliberation) and never zeroed.
2. **A no-decision card has no face-down beat**, so the skill name and the drawn rate are not shown
   for that question. That is the same trade `sealRepeat` already makes, and the alternative is the
   dead tap. If the screen lane wants the beat back without the tap, the shape is `flipBeat()` over
   an already-locked call — nothing in the engine needs to change for it.
3. **The measured split is still below the band** and this round does not move the design toward it;
   it makes the printed number true. CUT-SPEC §8's editorial decision (ship the measured share) is
   untouched, and the number it prints is now higher for a student who thinks slowly, because that
   thinking is now counted.
4. **A hinted clear moves the strip the way a miss does, and the study layer still says `GOLD`.**
   That is the design's existing vocabulary for "you lost the bid" — no string, the strip simply
   moves (CUT-SPEC §6) — and the two ledgers are supposed to be able to disagree: the schedule keeps
   the clear, the pile does not. The alternative reading is that the game should say something about
   it, and every version of that is a word or a number the brief cuts. Flagged, not hidden: if a
   critic wants the hint priced differently, the decision is CUT-BRIEF's owner's, and §4 above
   records why the two neutral settlements are not available.

## Negative controls — run against mutated copies in an isolated tree

Every claim above is falsified by a recorded mutation. The tree was `site/ tests/` copied to a
scratch directory (never the live repo — other lanes are building against these files right now),
one mutation applied, the file run, and the tree restored.

| # | mutation | caught by |
|---|---|---|
| **N1** | `deliberation` back to the CEILING (`ms > CAP ? 0 : ms`) | **7 fail** in `job-split`, incl. THE ROUND-4 BLOCKER, the cap's own settlement and the degraded path |
| **N2** | the pile pays `ok` (`result.cleared`) again | **3 fail**: `job-pay` "the game prices that same bit", "a page of bought clears banks nothing", `job-state` #9 |
| **N3** | the marks count `e.ok` again — any clear, however bought | **4 fail**: `job-pay` "a CLEAN clear", the Variant row, the equality test, and a `job-screen` waiver control |
| **N4** | `decides` always true — the dead tap returns | **1 fail**: `job-pay` "`decides` is false exactly where …" |
| **N5** | `decides` always false — the game never asks anything | **1 fail**: the same test (it pins the predicate on both sides, not one) |

N4/N5 are caught in the TABLE, not on the screen: a DOM-level test for the no-decision card belongs
to `job-screen` (the screen lane's file, being rewritten in this same round), so the browser evidence
above is this lane's proof of the rendering, and `qa/cut-engine-r4.mjs` is checked in so the next
round can re-run it in one command.

## Requests — files this lane changed that it does not own

* **§R1 (machine, `site/js/job/state.js` + `tests/job-state.test.mjs`).** Two changes: `deliberation`
  is a cap (one line, plus its doc block and two sentences in the header), and `answer()` prices
  `cleanOf(result)` while `result.cleared` goes on driving the schedule. Nothing else in the file
  moved; `guardSave`, the verbs, the seal and the record are untouched.
* **§R2 (screen, `site/js/screens/job.js`).** `readingOf` carries `bidless` and `stripFor` blanks the
  third slot on it — marked `CROSS-LANE (engine, r4 …)` in the source.
* **§R3 (screen, `site/js/screens/job.js`).** `renderCall` asks `pay.js decides` before it draws, and
  `lockOnly()` locks the only call with `ms: 0`; `doBank`'s beat timer re-renders. Also marked in the
  source. The face-down card, the three calls, the bank button and the way out are otherwise as the
  screen lane left them.
* **`tests/job-split.test.mjs` (split).** §7 rewritten around the cap; one test deleted, named in §3
  above; two added.
* **`designs/CUT-SPEC.md` (spec).** One line: §7's "Ninth" said the shared bit was `result.cleared`,
  which the code no longer does. Rewritten to the clean clear, with the exploit and the pointer here.
  **One thing left for that lane:** §8's split paragraph still says "At the ceiling, …" — it is a
  cap now, and the numbers around it are unchanged (the bound is the same bound).

## Suite

`cd /Users/oliver/Projects/unit1a-quest && node --test tests/` → **1,860 tests, 1,856 pass, 0 fail,
4 skipped** (the four skips are the pre-existing Playwright-gated browser arms, unchanged since
`notes/DEMOLISH.md`). `tests/job-pay.test.mjs` is **53 tests, 0 fail**; `job-split` **47**;
`job-state` **45**; `job-screen` **75**; `job-ledger` green and untouched — the Law of Two Ledgers
holds byte for byte, because the only thing this round moved in `answer()` is which bit the PILE
reads.
