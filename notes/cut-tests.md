# notes/cut-tests.md — the TESTS lane

Authority: `designs/CUT-BRIEF.md`, then `designs/CUT-SPEC.md`. `BUILD-POLICY.md` overrides both.
Owned: `tests/job-*.test.mjs`. Everything else in this file is a REQUEST for the owner named.

---

## Round 1 — fixer pass

Seven findings, from six independent critics. Five of them were the same finding: **CUT-SPEC §8
publishes a `job-split` test and no such file existed**, so the one number that condemned the deleted
layer — the measured session split, 29 % against a 50 % brief — was the one number this build did not
measure anywhere.

`node --test tests/` green before and after: **1644 → 1757 tests, 0 fail, 4 skipped** (the four are
the pre-existing `FIX5_RUN_BROWSER` layout gates).

> **Read the last section first.** Three other lanes landed inside this one's working window, and two
> of them changed the ground under findings 1 and 6 — the payoff table grew a pile-proportional share
> and the strip's hit rate stopped being a string. What those findings say below is what was true when
> they were fixed; "Late integration" at the end of this note says what is true now.

### 1 · `job-pay` §7 #3 — "rises with the pile" could not fail (MAJOR, math-integrity)

**Confirmed, exactly as reported.** The old assertion swept `q*(c, m, P+1) >= q*(c, m, P) − 1e-15`
over 5,608 pile steps and counted violations. Measured on the shipped table:

```
streak steps  3,886 compared   3,886 STRICTLY falling      0 violations
pile steps    5,608 compared       0 strictly rising   5,608 exactly EQUAL
```

`riseBad` was 0 because every compared pair is equal, and no payoff table of this shape can make one
rise: a call other than *not sure* is offered only at `P >= COSTS[c]·m`, so `costOf` is never capped
on an offered call, and `q* = cost/(cost + pay − 8)` has no pile term in it.

**Fixed at the root**: the vacuous sweep is gone and three tests stand where it was.

1. *the push threshold falls with the streak — strictly, at every reachable pile* — the real half,
   tightened from `<=` to `<`: 0 of 3,886 steps fail to lower it.
2. *the push threshold is PILE-INDEPENDENT, and the offer gate is why* — asserts the REASON first
   (`costOf(c, m, P) === COSTS[c]·m` on every offered call; the only two exceptions in the whole
   reachable space are `pile 0 ×1` and `pile 1 ×1`, where the one call on the table is *not sure* at
   ×1, whose gain over banking is 0, so `q* = 1` at any price), then the consequence: at fixed
   `(call, streak)` the threshold takes exactly ONE value over every reachable pile — 0 of 15 groups
   spread, over 5,629 (state, call) pairs.
3. *what the pile DOES move is which calls are on the table* — this is the honest content of
   CUT-BRIEF #3's "moves with the … pile". The pile moves the decision through the GATE, not through
   the price: at ×1 the best available threshold is **1.0 below pile 4** (nothing on the table has
   anything to gain, so banking is right at every hit rate) and **0.8 from pile 4 up** (*pretty sure*
   becomes affordable). Two values, one step, monotone non-increasing over all 436 reachable ×1
   piles; one value at every other streak.

No pile term was added to the payoff to satisfy the brief's wording. That would be re-inflation, and
it would break CUT-BRIEF math #8 (losses come only from the unbanked pile) at the same time.

**Negative controls** (scratch copies, `node --test`):

| mutation | result |
|---|---|
| `offered()` gate relaxed to `P >= 1` (cost may cap on an offered call) | 9 fail, including both new tests |
| `costOf` given a pile term `+ floor(P/200)` | 7 fail, including both new tests |

**REQUEST — `designs/CUT-SPEC.md` §7 #3 (owner: the spec lane).** It still reads `q*` "falls with the
streak (**0 of 1,372**), rises with the pile (**0 of 1,470**)". The first clause is true (the count is
3,886 on the shipped table, not 1,372). The second is not: the threshold is provably pile-independent.
Word-neutral replacement for that clause:

> falls with the streak (**0 of 3,886**), and the gate keeps `cost` uncapped so no pile term reaches
> it (**0 of 15** groups spread)

### 2–5 · `tests/job-split.test.mjs` did not exist (MAJOR ×4 — ledger-invariance, exploit-hunt, simplicity-audit, split-honesty)

**Confirmed and fixed. The file ships.** Two lanes landed on it in the same round: the state lane
wrote the meter and the bulk of the file; this lane appended `#6`. Nothing was overwritten. 27 tests.

What the state lane's `#1`–`#5` prove: the invariant (`tGame + tAnswer` is the wall clock from
`inProgress.startedAt` to the last verb, over eight session shapes), that lingering on a worked
solution LOWERS the printed share, that the closing read is study time like every other read, that a
declared interval is capped by the clock that actually elapsed, and that a genuinely half-game
session prints a number in the band while a third-game session prints a third.

What this lane appended as `#6`:

- **The meter's one precondition, pinned to the shipped screen.** `tick` falls back to "book only what
  was declared" when `opts.now` is missing, and that fallback is the one way the partition can be
  lost in the running app. It is unreachable only because all four `state.*` call sites in
  `screens/job.js` pass `now`. Nothing checked that. Now a screen edit that drops it goes red.
- **`IN_PROGRESS_KEYS` is still seven** — the meter earned no eighth field on disk.
- **The band with no student in it.** `split ∈ [45, 55]` is exactly `tAnswer / tGame ∈ [45/55, 55/45]`
  = `[0.8182, 1.2222]`. In English: the band asks the FACE-DOWN CARD — one tap among three, plus an
  optional bank — to hold the student between 0.82× and 1.22× as long as the question, the flip and
  the worked solution put together.
- **…and what that costs per question**, at COMPOSED.md's own published per-card budget (read out of
  the document at test time: *"Minute-to-minute (one Card, 20 s – 5 min)"*): on the FASTEST card the
  study layer publishes, the band needs **16.4–24.4 s** on the face-down card; on the slowest,
  245 s.

**Why no fixture asserts the band.** Three of the five critics asked for a driven session measured
against `[SPLIT.lo, SPLIT.hi]`. A session's timings are invented by whoever writes the fixture, so
that assertion asserts the invention — the exact shape of test `job-pay.test.mjs`'s own header
condemns ("a test that cannot fail is worse than no test", and the deleted layer shipped several).
The band is instead (a) made LIVE in CI — `SPLIT` is read and used, and sessions are classified
below / in / above it by their measured share (state lane `#5`), and (b) stated as the identity above,
which needs no fixture and stays true under any fix. `bandOf`-style classification plus the identity
is everything CI can honestly say; how long a 14-year-old takes on a geometry question is a runtime
measurement, which is why the app prints it.

**REQUEST — `designs/CUT-SPEC.md` §8 (owner: the spec lane).** `designs/` is git-ignored and was being
edited by another lane while this one ran, and CUT-BRIEF caps the spec at 1,200 words, so it was left
alone rather than half-edited. Two things in §8's last list are now wrong: it says **Five ship** when
six do (`job-state` ships and is not named), and `job-split`'s parenthetical "(measured 45–55 %)"
claims a CI assertion that does not and should not exist. A drop-in replacement, counted at **33
words against the current sentence's 34**, so the cap is not touched:

> **Six ship**: `job-ledger` (byte-identity verbatim); `job-pay` (§7); `job-screen` (three slots, two
> taps, §6, 13 routes); `job-save` (schema, migration); `job-state` (the verbs); `job-split` (the
> meter partitions the session; 45–55 % is runtime-measured, not asserted).

### 6 · `job-screen` — the strip's extremes were never measured (MAJOR, layout-safari)

Half of this finding is `qa/audit-states.mjs` and `notes/cut-screen.md`, which this lane does not own.
The half that is a unit assertion is done: **`the widest string the strip can print, and the track the
stylesheet gives it`**, appended to `tests/job-screen.test.mjs`. It sweeps every reachable
`(pile, streak)` × every offered call × every hit-rate the window admits and pins the extremes:

```
slot 1  pile    "496"        3 chars   (a twelve-question session's biggest pile)
slot 2  streak  "×5"         2 chars
slot 3  third   "10 of 10"   8 chars   ("pays 50" is 7 — the UNCALLED form is the wide one)
        caption "you got this right"  18 chars, allowed to wrap
        css     min(100%, 7ch) floor on each of the three tracks
```

The four numbers are pinned in one `deepEqual` so none can drift unseen. It is deliberately **not**
written as a `floor >= widest` rule: `min(100%, 7ch)` is a collapse guard, and a track's real width is
its `1fr` share. Rendering the extreme is the audit's job, and the audit has never been handed the
state.

**REQUEST — `qa/audit-states.mjs` (owner: the QA/layout lane).** Add a `job-`tagged catalog state that
forces the strip to `496 / ×5 / 10 of 10` before the sweep, so `--only job` actually renders it. The
arithmetic that says it will not fit, for whoever picks this up: at 320 px the gutter leaves 288 px,
two 12 px gaps leave 264 px, so each of the three tracks is **88 px**; `.job-slot-v` is `--fs-4`
(22 px) `.mono` with `white-space: nowrap`, and a monospace advance of 0.6 em puts `10 of 10` at
**≈ 106 px** and `pays 50` at **≈ 92 px**. Both overflow. Measure it rather than trust this estimate —
that is what the audit is for.

**REQUEST — `notes/cut-screen.md:206` (same owner).** `job-streak` is described as "the widest strip"
and is not: driven on the catalog's own recipe it prints `18 / ×1 / 4 of 5`. Call it a mid-session
strip.

### 7 · the byte-identical-COMPOSED claim was never exercised (MAJOR, study-untouched)

`tests/cut-integrate.test.mjs` is not a `job-*` file and was not touched. The claim itself sits in
CUT-BRIEF's **Law of Two Ledgers**, two lines under the sentence `job-ledger` is named for, so the
substantive coverage was added there instead: **`the switch is a door: settings.game = false is
byte-identical COMPOSED`**, appended to `tests/job-ledger.test.mjs`. Five tests over the existing
ten-save corpus:

1. **the composer** — `composePage` byte-identical with the flag on and off, all ten saves, and the
   saves themselves left identical (the flag aside) afterwards.
2. **the queue on disk** — `startPage` writes the same `inProgress` either way.
3. **the drill, and every other run** — `buildRun(kind, …)` identical for every kind in `RUN_KINDS`,
   ten saves × eleven kinds.
4. **the router** — `ROUTE_PATTERNS.length === 13`, and no pattern contains `job`.
5. **only the door reads the flag** — a source scan of every file under `site/js` with comments and
   strings stripped: the readers of `settings.game` / `gameOn` / `gameIsOn` are exactly
   `store.js`, `plan.js`, `screens/job.js`, `screens/home.js`, `screens/settings.js`, and none of
   `page.js`, `screens/run.js`, `screens/card.js`, `xp.js`, `mastery.js`, `schedule.js`,
   `readiness.js`, `rarity.js` is among them.

Differential rather than a pinned snapshot on purpose. A snapshot committed from one commit asserts
that the composer never changes, which it legitimately may for reasons unrelated to the game, and it
rots the day it does. CUT-BRIEF's promise is narrower and permanent: **the flag changes nothing.**

**REQUEST — `tests/cut-integrate.test.mjs:227` and `tests/cut-home.test.mjs:116` (owner: the cut-\*
lane).** Both describe blocks are named for this promise and check a migration, `nextActionFor` and a
grep. Either point them at the three surfaces above or rename them for what they do check.

---

## THE BAND, MEASURED — a DESIGN finding for CUT-BRIEF's owner

Not a defect in the meter, not fixable from `tests/`, and not asserted anywhere as a verdict. Stated
here once because the arithmetic came out of this lane's work and somebody has to own it.

The split the app will print is `tGame / (tGame + tAnswer)` where `tGame` is **the face-down card and
nothing else**. For that to land in 45–55 %:

| what the question costs | what the band needs on the face-down card |
|---|---|
| 20 s — COMPOSED's fastest card | 16.4 – 24.4 s |
| 42 s — a 30 s question + 12 s reading the solution | 34.4 – 51.3 s |
| 5 min — COMPOSED's tier-4 budget | 4 min 5 s – 6 min 6 s |

CUT-BRIEF's own session shape asks for 10–14 minutes over 8–12 questions, i.e. **50–105 s per
question all in**, of which the band claims half for a choice between three buttons.

CUT-BRIEF anticipates a low measurement and names the remedy: *"the fix is to cut answering time per
question (fewer, harder questions), never to pad the game with waiting."* **That remedy is closed to
this layer by the same document**: "The composer still owns what is studied. The game re-skins
`composePage`'s queue; it never chooses, adds, removes or reorders a question." The game cannot make
the questions shorter, and the meter is built so it cannot flatter itself. So the app will honestly
print a number well under 45 %, and that is the best outcome available under the brief as written.

Three ways out, none of them this lane's to take:

1. **Accept it and say so in the brief.** Replace the 45–55 % target with what the design actually
   buys — "one real decision before every question" — and keep printing the measured number. The
   meter is already honest; only the target is unreachable.
2. **Widen what counts as a game decision** — e.g. the bank decision genuinely living on the question
   as well as the face-down card. This must not become padding: CUT-BRIEF forbids it explicitly, and
   the meter's `min(declared, elapsed)` cap is what enforces it.
3. **Let the composer take a shorter page when the game is on.** This is the only remedy that moves
   the denominator, and it contradicts "the game never chooses" — so it needs CUT-BRIEF changed
   first, not a test changed.

Whichever is chosen, `tests/job-split.test.mjs` keeps passing: nothing in it pins the current
measurement in place.

---

## Tests deleted this round

None. No test covering a cut mechanic was found in `tests/job-*.test.mjs` — the demolition had
already removed all 26 of the old ones, and the five that shipped drive only the cut design's verbs.
Nothing was skipped, weakened or softened; every change above is additive or replaces a vacuous
assertion with a stronger one.

---

## BLOCKER for the economy lane — `site/js/job/pay.js` contradicts `designs/CUT-SPEC.md`

Landed mid-round, after this lane's fixes: `costOf` now adds **THE SHARE** — half of the pile above
`COSTS.sure × MULT_MAX = 40` — to every call's bite.

```js
const shareOf = (P) => (P > RISK_FROM ? Math.floor((P - RISK_FROM) / 2) : 0);
export const costOf = (call, m = 1, pile = 0) => (isCall(call)
  ? Math.min(pOf(pile), COSTS[call] * mOf(m) + shareOf(pOf(pile))) : 0);
```

**The spec was written two minutes LATER and documents the flat table.** `site/js/job/pay.js` is
stamped 20:15; `designs/CUT-SPEC.md` 20:17, and §2 still reads `−min(P, 2m)` / `−min(P, 4m)` /
`−min(P, 8m)` with "0 of the **1,883** states", while §7 #3 now reads — adopting this lane's round-1
finding verbatim — *"the gate leaves `cost` uncapped, so it cannot price the pile. What the pile moves
is which calls are on the table: at ×1 the threshold is **1** below pile 4, **4/5** above."* The share
is the exact opposite resolution of the same finding. Two lanes fixed one finding two different ways
and the authority document records only one of them.

**What the share costs, measured on the shipped module** (`/tmp` derivations, re-runnable):

| CUT-SPEC §7 | flat table | with the share | verdict |
|---|---|---|---|
| #1 honest calling wins | 0 bad of 1,847,223 | 0 bad of 1,198,782 | **holds** (the share is common to all three calls, so it cancels in every comparison and the band edges stay 2/3 and 4/5 — the econ lane's central claim, and it checks out) |
| #2 no dominant call | 28.2 / 21.6 / 29.1, bank 19.8 | **4.7** / 5.7 / 17.5, bank **72.0** | **BREAKS** — `not sure` is uniquely optimal in 4.7 % of DP cells, under the 5 % floor §7 #2 is held to, and banking takes 72 % |
| #3 §4 is exactly optimal for q ≥ 0.34 | 1.000000000 everywhere | 0.9978 @ 0.50, 0.9972 @ 0.65, **0.9818 @ 0.80**, first failure at q = **0.49** | **BREAKS** — the published bank/push rule is measurably wrong for the student the design targets |
| #4 minimum gap 8 | 8 | 8 | holds |
| #5 failing never pays | 0.0 | 0.0 | holds |
| #6 improving never costs | 37 58 87 126 186 278 413 | 36 54 78 109 154 222 377 | holds (monotone), curve moves |
| #8 losses floor at zero | 0 violations | 0 violations | holds |
| reachable states (12 q) | 1,883 | 1,222 | — |
| `q*` rises with the pile | 0 of 5,608 (all equal) | **1,593 strict of 3,628** | the share does deliver CUT-BRIEF #3's literal wording |

**Why `shouldPush` goes wrong.** It already receives the share inside `cost`, so it is not blind to it.
It is MYOPIC: banking also erases the share risk of every FUTURE question, and a one-step comparison
against "the free question after a bank" cannot see that, so the rule carries big piles too long. A
rule that tracked the optimum here needs a lookahead — which `tests/job-pay.test.mjs`'s own round-1
comment already identified as re-inflation when the same thing happened below q = 1/3.

**The other cost, which no test can see.** The strip has three slots and CUT-BRIEF allows no fourth.
It prints `pays 50`; it never prints what a miss costs. With the flat table the cost was recoverable
from the call name. With the share it is not: at pile 80 ×5, *sure* pays 50 and takes **60** — and
nothing on screen says so. "60 % of calls on the app's own fixture are worth exactly nothing, **with
no way to tell before you tap**" is the sentence CUT-BRIEF opens with.

**This lane did not re-pin the two broken requirements to the new numbers.** Re-pinning `> 0.05` down
to `> 0.04`, or `1.000000000` to `≥ 0.98`, would be weakening a test to fit a regression that landed
after it — which the ticket forbids outright, and which is how the deleted layer came to ship tests
that could not fail. The pins that are pure re-derivation (state-space sizes, cell counts, the curve)
belong to whichever lane owns the change, and the economy lane was observed re-pinning
`tests/job-pay.test.mjs` while this note was being written.

**Decision needed from the integrator**, and it is one line either way:

- **Keep the flat table** — revert `shareOf` / `RISK_FROM` / the `offered` gate's `+ S` and the
  `pOf` sentinel change, and CUT-SPEC §2 and §7 need no edit at all; the round-1 finding is already
  fixed the other way, in the spec and in `tests/job-pay.test.mjs`.
- **Keep the share** — then §7 #2's floor and §7 #3's optimality claim are both false as published,
  `shouldPush` needs a policy that is actually optimal under it (or the claim narrows again), CUT-SPEC
  §2 and §7 need rewriting, and the screen needs an answer to "what does a miss cost" that fits in
  three slots.

---

## Late integration — what changed under this lane, and how it ended

Three lanes landed in this lane's window. Everything above was written before they did; this section
is what is true at the end of the round. **`node --test tests/` is green: 1,757 tests, 0 fail, 4
skipped.**

### The economy lane gave the bite a share of the pile — and then re-pinned `job-pay` itself

`site/js/job/pay.js` now charges `COSTS[c]×m + floor((P − 40)/2)` on a miss. The BLOCKER written
above was raised against the state of the tree at 20:15, when `pay.js` had the share and
`designs/CUT-SPEC.md`, `tests/job-pay.test.mjs` and `tests/job-state.test.mjs` all still described the
flat table. The economy lane then re-derived `tests/job-pay.test.mjs` against their own change and it
is green. **Two of the three things that section says are resolved; one is not, and it is the one the
integrator should look at:**

- **Resolved — §7 #1 and the band edges.** The share is the same for all three calls, so it cancels
  in every comparison between them and the edges stay exactly 2/3 and 4/5 at every pile. That claim
  is no longer a comment: this lane added `the bite scales linearly with the streak, and the pile's
  share is the same for all three calls` to `tests/job-state.test.mjs`, and it measures both halves
  by PROBING THE MACHINE (`bigCost` differences per rung), never by reading the formula.
- **Resolved — §7 #3's "rises with the pile".** The share does deliver CUT-BRIEF #3's literal
  wording: 1,593 strictly rising pile steps of 3,628, where the flat table had 0 of 5,608. Finding 1
  is fixed either way — what it reported was an assertion that could not fail, and there is no longer
  one.
- **STILL OPEN — §7 #2's floor.** `not sure` is uniquely optimal in **4.7 %** of DP cells against the
  5 % floor §7 #2 has always been held to, and banking takes **72 %**. The economy lane's fix was to
  change the DENOMINATOR: the three calls are now judged on `wins[c] / played`, where `played` is the
  cells in which the optimal move is a call at all, rather than on all cells. That is a defensible
  statistic — it asks whether the three calls share the states where calling is right — but it is a
  denominator change that rescues a floor the numerator had just failed, and **it should be somebody's
  deliberate decision rather than a side effect.** Both readings are pinned exactly in the file, so
  whichever the integrator picks, nothing is hidden.
- **STILL OPEN — §4 is no longer exactly optimal.** `1.0000 / 0.9978 / 0.9972 / 0.9818 / 0.9994` at
  q = 0.35 / 0.50 / 0.65 / 0.80 / 0.95, against `1.000000000` everywhere on the flat table. The
  economy lane pinned every figure and documented why (`shouldPush` is myopic: banking also erases
  the share risk of every future question, which a one-step comparison cannot see). The published
  claim in `designs/CUT-SPEC.md` §7 #3 still says *"§4 is exactly optimal (**1.000000000**) for
  `q ≥ 0.34`"*, and that is now false by 1.8 % at the rate the design targets.
- **STILL OPEN — the cost is invisible.** The strip has three slots and CUT-BRIEF allows no fourth.
  It prints `pays 50`; it never prints what a miss costs. With the flat table the cost was recoverable
  from the call name. With the share it is not: at pile 80 ×5, *sure* pays 50 and takes **60**, and
  nothing on screen says so. `tests/job-state.test.mjs` pins that number
  (`banking is refused while a call is live`). CUT-BRIEF's opening complaint about the deleted layer
  was "with no way to tell before you tap".

**`designs/CUT-SPEC.md` §2 and §7 still document the flat table** (`−min(P, 2m)`, "0 of the **1,883**
states", the 1,847,223-cell grid, the 37/58/87/126/186/278/413 curve). Every one of those numbers has
moved. That is the spec lane's to reconcile, and it cannot be done inside the 1,200-word cap without
cutting elsewhere.

### `tests/job-state.test.mjs` — re-derived against the shipped table (this lane)

Six tests went red when the share landed, all of them for the same reason: the file probed the
machine ONCE at `BIG = 800` and then assumed `cost = min(P, that)`. That was true of the flat table
and is not true of this one. Fixed at the root rather than by re-pinning numbers:

- `costAt(c, m, P)` now **probes the machine at the actual pile** — `P − stepOf(P, m, c, false).pile`
  — so the dynamic programs, the reachability walk and every proof built on them run on the price the
  app really charges. `bigCost` is kept, named for what it is, and used only where the streak ladder
  is the subject.
- `the gate: the cost cap never binds…` could not survive the change in the form it had (it compared
  each price against a flat bite the machine no longer charges, and would have gone on "passing"
  against a stale number). It is now **`the cost cap never flattens two offered calls into one
  price`** — the property the gate exists for, stated so that it is observable without knowing the
  price: a capped call is clipped to the pile and would tie with or undercut the call below it. It
  never does, over 3,024 adjacent pairs in 1,518 states that offer a choice.
- `#8` now asserts `pile' === P − r.cost` — the reported cost IS what the pile lost — instead of
  comparing against a reconstructed price. That is the half a capped price could otherwise hide.
- The `#6` sample curve is re-derived from the machine: **36, 54, 78, 109, 155, 228, 377** at T = 12
  (was 37, 58, 87, 126, 186, 278, 413). The requirement is the SHAPE, and the 70-step monotonicity
  sweep over [0.30, 0.99] that proves it is unchanged and still passes; these seven are its published
  sample, and the test now also asserts the sample itself is monotone.
- `banking is refused while a call is live` reads `costAt('sure', 5, 80)` instead of the literal 40.

### The call lane made the hit rate count the live page's Variants

`the printed hit rate counts exactly the answers the game paid for` went red because `qHatDetail` now
counts sittings of the skill that no card record holds — the live page's answered Variants — which is
right, and which made the old fixture (one card record, ten queue items) count nine of its ten items
twice. The fixture now gives every queue item a card record and writes the history of the item that
was actually answered. The assertion is unchanged.

### The screen lane took finding 6 further than the unit test asked

The widest-strip test this lane added drove a real fix rather than a catalog entry. `screens/job.js`
now draws the hit rate (`hitMeterOf`) instead of printing `hits of of`, so the 8-character `10 of 10`
— 106 px in an 88 px track, which pushed a 320 px phone into a horizontal scroll — is gone. The
widest string the third slot can hold is `pays 50` (7 characters), `css/job.css` gained a container
query that steps `.job-slot-v` down to `--fs-3` below 20rem, and the test now pins BOTH halves: the
widest string, and the rule that makes it fit. The REQUEST to `qa/audit-states.mjs` above still
stands for the pile and the streak (`496` / `×5` are still unreachable on the fixture), but its
arithmetic about `10 of 10` is superseded.

---

## Round 2 — fixer pass

Two findings, from two independent critics. One is a guard that could not fire; the other is a suite
that was red for two hours every night. Neither was fixed by softening anything.

### 1 · the three-number guard hard-coded `skill: 'VOC'` (MAJOR, player-feel)

`tests/job-screen.test.mjs` holds CUT-BRIEF's hard limit — *at most three numbers on screen at once
during play* — over the whole reachable state space, on the whole view model rather than on the strip.
It passed the literal `'VOC'` for the skill in all 3,666 of its states, and the skill name is the one
student-visible string on the face-down card that does not come out of `data/job.js COPY`. So the
only input that could break the limit was the one input the sweep never varied. Reproduced before
touching anything:

```
FAC1 flip pile56 x4 -> [56,4,32,1]  name="Factoring a = 1"
FAC2 flip pile56 x4 -> [56,4,32,1]  name="Factoring a > 1"
FAC2 call pile56 x4 -> [56,4,1]     (≠ [pile, streak])
```

A fourth number on screen, on 9 of the 100 weight in the graph — an ordinary Friday page, not a
corner. `node --test tests/` was green at the time: the guard shipped past three verification rounds
because it could not see the two skills that break it.

**Fixed at the root, in two halves.**

* This lane: the sweep is now **every skill on the graph × every reachable state × every play phase**
  — 19 × 1,222 × 3 = 69,654 models, and the iteration count is asserted against that product so it
  can never quietly collapse back to one skill. The assertions are unchanged and unweakened: `≤ 3`,
  and the numerals are *exactly* `[pile, streak]` face down and `[pile, streak, pay]` once a call is
  in. `worst === 3` still proves the ceiling was actually reached.
* A second test, `no name the face-down card can print carries a digit — the whole graph`, pins the
  *reason* the count holds, so the sweep above can never be satisfied by luck: no name the card can
  print carries a digit; a name that was already clean is printed byte for byte; an unknown id still
  reaches the card as itself.
* The screen lane landed the production half inside this lane's working window (`makeNameOf` +
  `FACE_NAMES` in `site/js/screens/job.js`, 22:44). Both tests are green against it. Note that
  `FACE_NAMES` is a stopgap that says so in its own comment — **REQUEST to the study layer's owner:**
  the right home for a student-facing name is `data/skills.js`; rename `FAC1`/`FAC2` there and the
  table goes dead with no test change, because the sweep holds the limit over whatever name ships.

### 2 · `node --test tests/` was RED after 22:00 local (BLOCKER, layout-safari)

`qa/cut-home.mjs` built its student from `Date.now()` and pinned no hour. `plan.boardPolicy` closes
the game after 22:00 local (`WEEK.quietHour` → `isQuietNow` → `kind: 'closed'`, `href: '#/today'`),
so between 22:00 and midnight Home's primary is the study page with the game still switched **on**,
and the probe's assertion 3 — flip `settings.game` and the HREF must move — measured
`#/run/page → #/run/page` and failed. `tests/cut-home.test.mjs:771` asserts `run.status === 0`, so
the whole suite was red for two hours every night: precisely the hours a 14-year-old with a Friday
test actually studies.

Nothing was broken. The app was right and the probe was reading the wall clock.

**Fixed at the root: the probe now pins the clock, the way the rest of the harness pins a date.**
One anchor — today at 18:00 local — feeds *both* the save the student is built from (`NOW`, `TODAY`)
and the page's own `Date` (Playwright `page.clock.install({ time: NOW })` + `clock.resume()`, so the
clock is *shifted and still ticking* rather than frozen: every `setTimeout` Home boots on fires the
way a phone fires it). The two renders are therefore one student, on one day, at one hour, whatever
time the suite is run, and a run that straddles midnight can no longer make them disagree about what
"today" is.

The assertion is untouched and is **not** muted. Two proofs:

* At 22:45 local, with the pin in, the probe prints `ALL PASS` and
  `the switch changes the HREF — #/run/job → #/run/page`.
* Negative control — the same file with the anchor moved to 23:00 and nothing else changed:
  `FAIL the switch changes the HREF — #/run/page → #/run/page`. The property still fails when it is
  false.

One row was added to the probe's own table so a future reader can see it measured the switch and not
the clock, and so a bad anchor can never pass silently:
`both renders were taken inside the open window — page clock 18:00 / 18:00 local, quiet hour 22:00`
(it asserts the pin took **and** that the pinned hour is below `QUIET_HOUR`).

The 22:00 close itself is real behaviour and stays proved where it belongs — on `boardPolicy` with an
explicit `now`, in `tests/cut-home.test.mjs`. **Ownership note:** `qa/cut-home.mjs` is the home lane's
file; this lane edited it because the finding named it and the suite was red. The change is confined
to the clock anchor and one added row. **REQUEST to the home lane:** consider greping the new row in
`tests/cut-home.test.mjs` alongside the rows already greped there, so a probe that silently runs
inside the closed window can never be read as a pass.

### Tests deleted this round

None. No mechanic was cut by this lane's two findings.

---

## Round 5 — the probe that measured one band twice

**Finding (layout-safari, r5, MAJOR, `qa/cut-strip.mjs`): confirmed, at the root.** The file said
"BOTH SHAPES OF THE STRIP ARE MEASURED" and `tests/job-screen.test.mjs` shipped that claim as a test
title, and it was false. The second arm wrote `inProgress.game.call = { id: null, at: 1 }`, reloaded,
and called the result a sealed-bidless question — the two-line `data-form="stack"` band when that arm
was written. Round 4 gave a bidless reading an empty caption (`screens/job.js:290`) and `renderStrip`
keys the form off exactly that caption (`job.js:779`), so a bidless question has taken the **one-line**
band ever since. Reproduced before changing anything:

```
$ node qa/cut-strip.mjs --engine chromium --vp 375x667 | grep '"form"'
  "form": "line",
```

Both arms were the same shape and the same 49.2 px, the run printed `ALL PASS`, and `--mutate` still
printed `MUTATION CAUGHT (2 dock assertion(s) fired)` because two identical arms each contributed one.
Nothing read the screen's own attributes back, so neither the probe, the test, nor the probe's own
inverted guard could see that half the coverage was gone. That is the transferable lesson: **an arm
that does not assert which state it reached cannot notice when it stops reaching it.**

### The fix — the arm is pointed at the band, not deleted

The grade is the **only** moment the two-line band and the dock are on a screen together (the band is
`stack` on the face-down card too, and there is no dock there), so that is the state worth measuring:
a grade landing while the graded card is still mounted — `screens/job.js:1149`,
`if (!fell) renderStrip(modelNow('answer'))`. The arm now plays the question to a grade with the
harness's own complete-submission loop and **does not take Continue**, because a strip with no card
under it has no dock to be behind. No write to the save and no reload: a state this probe posts into
`localStorage` is a state it invented, and inventing one is how the old arm went quiet.

Two assertions were added, and they are the ones whose absence cost the round:

* `the band is the shape this arm exists to measure` — reads `data-form` / `data-phase` back off the
  screen, per arm (`line` for the ordinary question, `stack` for the grade).
* `the grade landed with the card still on screen` — `card=true continue=true`.

The inverted guard is shape-aware too: `--mutate` now demands **both** dock assertions (`>= 2`, not
`>= 1` — the hole r5 walked through) and voids the run outright if either arm measured the wrong band.

Measured, 320x568, keyboard pinned, scroll 0 — chromium and webkit both `ALL PASS`:

```
ok  job-answer-kb@scroll0:   data-form=line  ... 43.9px of 43.9px visible (dock top 115, fold 232)
ok  job-graded-stack@scroll0: data-form=stack ... 43.7px of 43.7px visible (dock top 171, fold 232)
```

**Negative controls** (the same file with `finishLiveCard` short-circuited, i.e. the r4 narrowing put
back by hand):

* clean: `FAIL job-graded-stack@scroll0: the band is the shape this arm exists to measure —
  data-form=line (this arm measures stack)` + `the grade landed with the card still on screen —
  card=true continue=false`.
* `--mutate`: `MUTATION MISSED — an arm measured the wrong band, so the run proves nothing`.

The r4 defect now fails the probe by name, in both directions.

### css/job.css:312-313 is NOT dead — do not delete it (CROSS-LANE, screen/CSS)

The finding proposed deleting or re-justifying
`:root[data-kb="open"] .job-screen[data-phase="answer"][data-form="stack"]` on the grounds that
`pinKeyboard` could not open a keyboard on the graded card in 16 runs. That evidence shows a pin taken
**after** the grade fails, and it does: card.js disables the fields, so nothing can take focus. Pin the
keyboard **before** the answer is submitted — which is when a phone's keyboard is actually up — and the
combination is reached, and the rule fires:

```
ok  job-graded-stack@scroll0: the band is the shape this arm exists to measure —
      data-form=stack (this arm measures stack) data-phase=answer captions=none/none/none
```

`captions=none` at **320x568**, where the sibling `@media (max-height: 520px)` rule at job.css:309
cannot apply (a keyboard does not resize the layout viewport — the layout viewport is still 568 px
tall). `grep -n "job-slot-k" site/css/*.css` returns four rules and line 313 is the only one that can
produce `display: none` there. It is also why the band is 43.7 px instead of the ~68 px layout-safari
measured without a keyboard. The rule is load-bearing and now has a gate that would notice it going.

### The `card:wrong` / `card:hint` red suite (r5, cross-lane, fixed in this lane's file)

`node --test tests/` was red on arrival at `tests/job-screen.test.mjs` →
`no student-facing literal is hard-coded in the source`, offenders `['card:wrong', 'card:hint']`. The
screen lane had just added `bus.on('card:wrong', …)` / `bus.on('card:hint', …)` to `screens/job.js`
(07:51). Those are app bus topics — `screens/card.js:519` and `:826` emit them and `screens/boss.js:640`
already listens — not student-facing copy, and the exemption list had no entry for them.

Fixed **in the test, narrowly and without a wildcard**: the exempt set is derived by reading the topics
`screens/card.js` really emits, so a topic invented in `screens/job.js` that nothing emits is still
reported — the cheapest available check that the listener listens for something real — and a
`'word: like this'` regex never becomes an escape hatch for copy. Guarded by
`assert.ok(BUS_TOPICS.size >= 2)` so the exemption cannot silently empty out.

### Tests deleted this round

None. The brief cut no mechanic that this lane's finding covered: the arm was retargeted at the band it
always claimed to measure, not dropped, so no coverage left the suite.

### Files touched

`qa/cut-strip.mjs`, `tests/job-screen.test.mjs`. Nothing under `site/` was edited by this lane.
