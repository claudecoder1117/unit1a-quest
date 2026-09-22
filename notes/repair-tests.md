# tests — REPAIR round (the fixer for the `tests` lane)

Lane: `tests/job-*.test.mjs`, plus the two QA harnesses the round's own findings name and that this
lane has owned since round 2 (`qa/job-walk.mjs`, `qa/layout-audit.mjs`). **`qa/job-screen.mjs` and
`tests/job-screen.test.mjs:871` are NOT touched** — REPAIR-DECISION §S0 reserves them to the `screen`
lane, and §S0's ruling is quoted below because it is now closed.

**No file under `site/` was edited by this lane.** Four requests for other lanes are at the bottom,
and one spec correction for the doc agent.

---

## THE SUITE

    BASELINE, 22:31, before any edit of mine   2735 tests · 2724 pass · 7 fail · 4 skipped · EXIT 1
    FINAL,     23:10, after every edit below    2817 tests · 2813 pass · 0 fail · 4 skipped · EXIT 0

    the six files this lane edited, each run alone
      tests/job-split.test.mjs           34 · 34 · 0     (no test added; one tautology made a measurement)
      tests/job-week.test.mjs           104 · 104 · 0    (+1 test, 2 rewritten, 1 lint narrowed correctly)
      tests/job-copy.test.mjs            38 · 38 · 0     (+7 tests — the new §10 screen-prose lint)
      tests/job-call.test.mjs           113 · 113 · 0    (+3 tests — the §S1 opt-out lint)
      tests/job-exploit.test.mjs         56 · 56 · 0     (+4 tests — the §S2.3 pins)
      tests/job-meta-constants.test.mjs  32 · 32 · 0     (+1 test, 1 file added to the phrase lint)
    +16 tests from this lane; the rest of the 2735 → 2817 delta is the other lanes'.
    Nothing was deleted, skipped or weakened. `qa/job-walk.mjs` and `qa/layout-audit.mjs` are not
    under `node --test tests/`; both were run directly and are recorded under findings 10 and 11.

The stated baseline in the ticket (2725 / 2721 / 0 fail) is wrong twice over: the count had already
moved to 2735, and **seven tests were red**. Five of the seven were other lanes' code mid-landing and
closed themselves while this round ran (`tests/job-ledger.test.mjs:560`, `:589`,
`tests/job-meta-constants.test.mjs:256`, `tests/run-lane-r3.test.mjs` ×3 — all green when re-run at
22:52). The sixth and seventh were §S0.

---

## S0 — PRE-FLIGHT: **CLOSED, and not by me** (lane: screen, with tests)

    $ node --test tests/job-screen.test.mjs
      tests 62 · pass 62 · fail 0 · skipped 0 · EXIT 0        (was: 62 · 61 · 1)

    $ node qa/job-screen.mjs --engines chromium --themes light        → EXIT 0, ALL PASS
      chromium  light  target 1    36   5   queue 0/10
      chromium  light  target 2    36   5   queue 1/10
      …
      chromium  light  debrief     —    5   10 targets
      worst board height with a stem in the DOM, across every target of every walk: 36px (max 36)
      keyboard open (chromium/light): layout viewport 667px · visible band 0..331 · --kb 336px · data-kb open
      crew grid: measured on 2 brief(s) · the queue-aware gap differs from the supply-blind one on 1 of them

Every clause of §S0's acceptance is met: 62/0, `ALL PASS`, a non-empty row table with `target 1 … 36`,
**2** measured briefs, a `debrief` row. The cause was the one `notes/tests-fix.md` round 3 named and
could not fix from this lane — a temporal dead zone in `site/js/screens/job.js` (`let fitRaf = 0`
declared below `mount()`'s call to `render()`), so `#/run/job` never mounted and every measurement
read 0. `fitRaf` is now declared at `screens/job.js:324`, above `mount`. Nothing was skipped, no
timeout was raised and no assertion was deleted. **PASS (verified, not fixed by this lane).**

---

## THE ELEVEN FINDINGS IN THIS LANE

`designs/r3-findings.json` carries no `id` field, so each finding is numbered below in the order this
lane worked them — BLOCKER, then MAJOR, then MINOR — and identified by its `critic` and its `file`,
which are unique within the lane. `node -e '…filter(x => x.lane === "tests")'` returns exactly these
eleven: 1 BLOCKER, 5 MAJOR, 5 MINOR.

Six of the eleven had already been repaired by the round-3 `tests` fixer (`notes/tests-fix.md`
§§1-6 of "fixer round 3"). I re-verified each rather than take the note's word for it, and say so.

| # | sev | file | verdict |
|---|---|---|---|
| 1 | BLOCKER | `qa/job-screen.mjs`, `qa/audit-states.mjs` | **PASS** — already fixed, re-verified |
| 2 | MAJOR | `tests/job-screen.test.mjs` crew grid | **PASS** — already fixed, re-verified |
| 3 | MAJOR | `tests/job-call.test.mjs` propriety | **PASS** — already fixed, re-verified |
| 4 | MAJOR | `tests/job-exploit.test.mjs` q̂ blindness | **PASS** — already fixed, re-verified |
| 5 | MAJOR | `tests/job-ledger.test.mjs` THE GAP | **PASS** — already fixed, re-verified |
| 6 | MAJOR | `tests/job-board.test.mjs` 99.5 % | **PASS** — already fixed, re-verified |
| 7 | MINOR | `tests/job-split.test.mjs:794` tautology | **FIXED this round** |
| 8 | MINOR | `tests/job-week.test.mjs:955` hardcoded 60 | **FIXED this round** (+ one part REFUTED-as-stale) |
| 9 | MINOR | `tests/job-copy.test.mjs` lint scope | **FIXED this round** (+ one part stale) |
| 10 | MINOR | `qa/job-walk.mjs` permanent red | **FIXED this round** |
| 11 | MINOR | `qa/layout-audit.mjs` stale PNGs | **FIXED this round** |

### 1 · BLOCKER — both QA harnesses modelled a keyboard that does not exist  (layout-safari)

Already repaired. Re-verified: `grep -c visualViewport` → `qa/job-screen.mjs` **12**,
`qa/audit-states.mjs` **2**, `qa/layout-audit.mjs` **2** (it was one listener and no measurement).
The live report line proves the model is now a real device configuration — layout viewport **667 px**
(not shrunk), visible band **0..331**, `--kb` **336 px** published by the app's own `keyboardInset()`,
`data-kb open`. **PASS.**

### 2 · MAJOR — the crew grid was covered by a regex that matched the bug  (crew-alignment)

Already repaired at `tests/job-screen.test.mjs:701`. Re-verified all three layers: the source pin is
now on the ARGUMENT LIST (`/alignmentFor\(s,\s*\{\s*shape,\s*of:\s*onBoard,\s*queue\s*\}\)/`, which
the supply-blind call cannot satisfy); the headless arm composes 12 boards and asserts
`alignmentFor({queue}).gap === supplyGapFor(save, queue)` plus that the blind call cannot report a
supply condition; and `qa/job-screen.mjs` rule 11 reads the RENDERED sentence — measured live this
round on **2 briefs, the two gaps genuinely differing on 1 of them**, which is what stops the rule
becoming vacuous. **PASS.**

### 3 · MAJOR — propriety was proved about arithmetic, never about the ship  (call-propriety)

Already repaired: `tests/job-call.test.mjs` §14 `R3 · the weight the SHIPPED path stores, read off the
save it wrote`, whose `THE INVARIANT` drives `startJob → lockCall`, clones, performs `card.js`'s own
history push and runs `state.applyTarget` on both branches, asserting `calls.at(-1).w` byte-identical
— with a CONTROL that the same two saves read live (`before: null`) DO differ. `node --test
tests/job-call.test.mjs` → **113 pass, 0 fail** (106 before my two additions below). **PASS.**

### 4 · MAJOR — the anti-exploit suite was structurally blind to the q̂ it polices  (exploit-hunt)

Already repaired: `writeStudyHistory` (card.js:922's own line) is wired into `runJob`'s answer beat
before `applyTarget`, `THE EVIDENCE MOVES` asserts both regimes, proof 8's `h.push(rung <= 1)` is now
`h.push(rung < 4)` (the CLEAR, which is what `call.js` counts), and `THE STUDENT WHO KNOWS THE ANSWER
AND THROWS IT` decouples true ability from `m_shown` via `trueM`. **PASS.**

### 5 · MAJOR — THE GAP / THE TROPHY GAP anchored a bug the app had already fixed  (ledger-invariance)

Already repaired: `runInJob` now takes `captureJobBefore` off the raw save and calls
`jobSummaryContext(save, debrief, { queue, before })` at the terminal (`tests/job-ledger.test.mjs:387`),
both GAP arms are gone, and `runs` / `forecastLog` / `trophies` are compared rather than waived. 17
tests, 17 pass. **PASS.**

### 6 · MAJOR — "99.5 % of drafts, ±1 otherwise" is not what the build does  (board-schedule)

Already repaired: the arm loops all four shapes over 400 saves × every legal draft (15 984 drafts),
asserts each shape's own measured floor, and asserts that **no shape reaches the published 99.5 %** —
so the day the composer improves, the test says so instead of silently passing. **PASS.** (The
document half is the board lane's request, already filed in `notes/tests-fix.md` round 3 §3.)

---

### 7 · MINOR — `tests/job-split.test.mjs:794` is a tautology  (split-honesty)  **FIXED**

**CONFIRMED.** `sessionSplit(job, save)` with no third argument returns `idle: 0` for every job
(`run.js:2058-2064` — `idleMeasured` is false without `opts.wall`), and `SPLIT.deadMs` **is** 0, so
the line asserted `0 === 0` on any session, measured or not.

    NEGATIVE CONTROL, shipped function, a 500 s session:
      sessionSplit(d, null)                       → {"idle":0,   "idleMeasured":false}
      sessionSplit(d, null, {wall: 1_100_000})    → {"idle":600000,"idleMeasured":true}
    i.e. the old line printed "0 ms idle" for a session with TEN MINUTES of dead time.

Fixed by handing the call the walkthrough's own independent clock (`{ wall: w.elapsed }`), asserting
`idleMeasured === true` as well as `idle === SPLIT.deadMs`, and adding a control inside the loop: the
same debrief with a clock 600 000 ms longer than the banked phases must print exactly that gap.
`node --test tests/job-split.test.mjs` → **34 pass, 0 fail**.

### 8 · MINOR — Home's projection asserted a constant against its own constants  (split-honesty)  **FIXED, second half REFUTED as stale**

**(a) CONFIRMED and fixed.** `tests/job-week.test.mjs` built `tGame: 300000, tAnswer: 200000` by hand
and asserted `m.split === 60`: 300/(300 + 200) by construction. The arm now drives **five real jobs**
through the state machine (`playJob`, new in this file) at a pace no published table owns — 47 s to
answer, 6 s to decide, 11 s per fixed phase — reads the entries `state.endJob` wrote, and asserts
them against a SECOND pipeline: the number `run.js sessionSplit` headlines at the debrief of the last
of those jobs, within `SPLIT.agreeWithinPoints`.

    MEASURED: board split 22 % · debrief headline 22 % · gap 0 · band 5 · brochure 43.2
    NEGATIVE CONTROLS (all three against the shipped code)
      A  five ZERO-TARGET walk entries instead of real jobs → projectionSource falls back to
         `projected` (`~31 % game · projected`) and assertion (1) FAILS.
      B  the same arm at the published tables' pace ({36,12,5,18}) moves the measured quantity
         22 % → 38 % and the board follows it to the point (gap 0 both times) — so the number is
         the clock's, not a constant's.
      C  four slow-answer jobs then one deliberator's job → board 9 % vs last-job headline 90 %,
         **gap 81**. The ±5 band is an assertion that can fail.

**(b) REFUTED as stale — the critic's own fix is no longer the right one, and the root is already
fixed.** The finding asks for `abs(home.boardModel(...).split − postBoard(...).split) <=
SPLIT.agreeWithinPoints`. I measured that disagreement first, against the estimator `home.js` carried
at the time:

    12 saves × the shape Home's own gate picks
      LEDGER branch (both sides read save.game.log)   gaps 2–7 points, median 5
      PROJECTED branch (job 1, no log)                gaps 7–21 points, median 13

…and then found the home lane had **removed the second number at the root** while this round ran:
`screens/home.js:20` deletes pass 1's `PUBLISHED.shapeTable` shim and `:286-289` makes `minutes`,
`wallS`, `endsAt`, `ends`, `split`, `projection` and `projectionSource` *"ALWAYS null here, and that
is the contract"* — because pass 1 has neither tonight's draft nor `job/board.js` (G10 #20). There is
now exactly ONE projection in the product, so an agreement test between two numbers is unwritable.
What replaces it is stronger and is what the finding was really about:

* `pass 1 paints a real board: rows, wings, and NOT ONE per-draft numeral` — all seven keys asserted
  null, plus source pins that the shape-table shim and `COPY.projection` are gone from `home.js`;
* `THE AGREEMENT: one projection, and the numeral Home shows is the BOARD's` — over 12 saves × three
  week states (**24+ posting states reached**), pass 1 prints no per-draft number on any of them, the
  board prints one on all of them, `COPY.projection`'s two sentence forms are asserted against
  `projectionSource`, the shape never drifts between the passes, and the source pin is that pass 2
  writes `board.projection` into the node pass 1 reserved (`home.js:477`). Both branches of the
  board's own estimator are then exercised explicitly (`projected` on a cold save, `ledger` after
  five real jobs).

**Collateral, same file, caused by another lane landing mid-round:** `tests/job-week.test.mjs:889`
(*"nothing in J11's four files gates … on rank"*) went red when the S3 lane gave `screens/mock.js`
the ratchet floor (`ratingDetail(rating.calls, JOB_CAPS.calls, { rank: save.player.rank })`). The
rule being policed is that rank gates no card/boss/Mock/hint/solution/Variant — and a floor argument
is an input to a number, not a branch. The lint now blanks out that exact form, re-runs the ORIGINAL
assertion over what is left (so any other read still fails), asserts the floor is passed at **exactly
one** site in those four files, and adds a new arm that fails if any of them ever BRANCHES on the
rank (`player.rank` next to a comparison or a ternary). Nothing was relaxed.
`node --test tests/job-week.test.mjs` → **104 pass, 0 fail**.

### 9 · MINOR — the copy lint G6 calls "enforced" covered only the table  (spec-fidelity)  **FIXED**

**CONFIRMED.** Every voice test in `tests/job-copy.test.mjs` §§1-5 was scoped to `CORPUS` (the
`data/job.js` string table) or to `LAYER_SOURCES` (the table plus the DOM-free modules plus
`screens/job.js`). The four screens carrying most of the layer's prose — `settings.js` (the five
formula panels), `home.js` (the Board panel), `stats.js` (the Ledger, the crew grid, the Fault Index),
`run.js` (the debrief) — were linted by nothing, which is how a false guard sentence lived in
`settings.js` for a round.

New §10, `the voice rules are linted over the four screens that carry the prose`: a small
string/template/**regex-aware** lexer (`literalsOf`) + a template-hole blanker (`withoutHoles`) +
a prose filter (`isProse`) yield **728 prose literals** across the six files, and all five of G6's
rules run over them.

    NEGATIVE CONTROLS, in-memory copies of the six sources, detectors lifted out of the test file:
      baseline                                                 728 prose literals, every arm CLEAN
      + hint('Great work on that streak!')      settings.js  → bang = 1, praise = Great      @:912
      + h('p','We think you should get some sleep')  home.js  → first = we, parent = get some sleep @:850
      + h('span','nice')                           stats.js  → CLEAN, correctly (one token is not
                                                               prose); h('span','nice one there')
                                                             → praise = nice @:731, NOT allowlisted
      opensValue forced false (the regex branch deleted)       728 → 573 prose, **15 spurious
                                                               offenders** (11 bang, 4 praise)

Two deliberate narrowings, each with its own positive assertion so it cannot become a blanket:
`I` is matched case-SENSITIVELY on the screens (the English pronoun is always capitalised; a lower-case
standalone `i` there is a loop index — `settings.js` prints the water-filling pseudo-code verbatim,
`for i in over: y_i = cap`, because G7 requires the printed law to be the computed one; the table's
own case-blind sweep in §3 is untouched); and two third-person technical uses of praise words are
allowlisted INDIVIDUALLY with their reason and their exact sentence (`a perfect call at 85` — the
Brier credit at p = o; `Page complete — flawless` — the `flawless` ledger field / `flawless-page`
trophy), asserted to exist and pinned at a count of two.

**The finding's second half is now stale, and the remainder is pinned.** It named nine COPY entries
with no `COPY.<key>` call site under `site/js`; the screen lanes have since routed six. Measured now:
**3 dead** — `contractRow` (dev-only by design: `board.js` composes the row for the console report),
`repeat`, `cleanGetaway`. Asserted by name and by count so the list can only shrink, alongside a new
arm that fails if any screen re-types a line the table already owns (`reviewBoard`, `schoolWindow`,
`boardTitle`, `coldCrew` — the duplication behind the original list). See Request 2.
`node --test tests/job-copy.test.mjs` → **38 pass, 0 fail**.

### 10 · MINOR — `qa/job-walk.mjs` is permanently red at desktop  (player-feel)  **FIXED**

**CONFIRMED, exactly as reported.**

    BEFORE:  $ node qa/job-walk.mjs jobs   → EXIT 1, FAIL (8)
      x board collapse — chromium-1280-light-jobA-walk-03-stem: a stem is in the DOM and the
        board is 599 px (> 36)                                        … and 7 more, all at 1280 px

`job-walk.mjs:500` applied the check at every width, while the collapse rules in `css/job.css` all
sit inside `@container jobscreen (max-width: 895.98px)` and G6 requires the opposite above
`LAYOUT.railMinWidthPx`: *"≥ 1024 px: the board lives in the 320 px right rail, permanently visible"*.
The harness was flagging the design, on the one state where the design is right.

Fixed by gating the collapse check on `s.inner < LAYOUT.railMinWidthPx` and asserting **the rail**
at or above it — `beside` is `qa/job-screen.mjs PROBE_RAIL`'s own predicate verbatim, so the two
harnesses agree about what a rail is — plus width against `LAYOUT.railPx` ±7.5 % and not collapsed.
The report now prints what it measured, so a rule that stops measuring cannot report no failures.

    AFTER:   $ node qa/job-walk.mjs jobs   → EXIT 0, ALL PASS
      rail measured on 8 desktop state(s) at or above 1024px
       · chromium-1280-light-jobA-walk-03-stem: rail 320x599 beside a 688 px column at 1280 px

    NEGATIVE CONTROL: with the expected rail width doubled (`LAYOUT.railPx * 2`), the new arm fails
    on all 8 desktop states — so it measures the rail rather than merely passing. Reverted.

The narrow-form arm is unchanged and still fires: the 375 px states in the same run report the board
collapsed to 36 px.

### 11 · MINOR — `qa/audit/png/` holds PNGs no run can ever clear  (layout-safari)  **FIXED**

**CONFIRMED.** The clearing loop matched `f.startsWith(id + '-')` against the ids in THIS run only,
so a RENAMED id was unreachable for ever: `'run-page-1900x1200-light-chromium.png'.startsWith(
'run-page-item-1-')` is false. Four PNGs from `onboard-3-placement` and `run-page` — ids that stopped
existing when the catalog was rewritten — survived every run, and because a clean state writes no
PNG they were the ONLY pictures in the folder.

Two sweeps now. (1) the states in THIS run are cleared by prefix, exactly as before, so a filtered
run never deletes evidence of states it is not re-auditing; (2) on a FULL, unfiltered run any file
that **no id in the whole catalog** can own is an orphan and goes, with the list printed. A
`README.md` is written beside them saying that a clean run writes no PNG, so an empty folder stops
reading as "not audited".

    NEGATIVE CONTROL (the exact two-sweep block, against a temp folder seeded with the four real
    orphans plus one live-but-not-in-this-run id plus one in-run id):
      OLD prefix-only, run = [job-board]   → all four orphans SURVIVE
      NEW filtered (--only job-board)      → orphans KEPT (correct: not this run's business)
      NEW full (no --only)                 → orphans: [4 files], left: [README.md]

Verified end to end that the harness still runs (`node qa/layout-audit.mjs --only job-board --vp
375x667 --engine chromium --theme light` completes and writes the README), that
`node --test tests/layout-audit.test.mjs` (the detector calibration) is still green, and the four
stale files are gone from the tree. The filtered run surfaces a pre-existing `unreached` BLOCKER on
`job-board` — see Request 4; it is not this lane's and no `node --test` arm depends on it.

---

## THE DECISIONS ASSIGNED TO THIS LANE

### §S1.3 item 1 — the opt-out lint  **LANDED** (`tests/job-call.test.mjs`, new §S1)

**A CORRECTION TO THE DECISION'S OWN MEASUREMENT, with the command.** §S1.3(1) says to grep
`site/js/` for `before:` and assert the result set is **EMPTY**, on the stated basis that "the only
hits are three docblock lines inside `call.js` itself". That is stale against this tree:

    $ grep -rn 'before:' site/js/ | grep -v '^site/js/job/call.js'
      site/js/figure/svg.js:36:    // … Two things were wrong before:      (a comment)
      site/js/screens/run.js:857:  p.meta  = { …, before: snap }           (the page's tile snapshot)
      site/js/screens/run.js:1821: ip.meta = { …, before: snap }           (the same snapshot)
      site/js/screens/job.js:1701: jobSummaryContext(…, { queue, before: jobBefore ?? undefined })

The run lane's r3 debrief snapshot added three LIVE `before:` keys that have nothing to do with q̂.
An empty-set assertion over that grep is red today and would have to be relaxed to an allowlist of
three unrelated call sites — a weaker pin than the invariant needs. So the lint asserts the
**invariant** instead of the string: no `before:` is an argument to `qHatDetail(`, `qHatFor(`,
`callEntry(` or `ratingDetail(` anywhere under `site/js/` (comments and string bodies stripped,
paren-balanced argument extraction), the sealed-default branch in `call.js` is asserted to still
exist, and a behavioural arm shows a caller passing only `{cards}` gets the cut.

    NEGATIVE CONTROL, in-memory copies of all 40 lane files:
      baseline                                                                 → []
      state.js:1167's own read → `{ cards: opts.cards ?? cardById, before: null }`
                                                      → ['site/js/job/state.js:1167 qHatFor']

Three tests added; the lexer has its own calibration arm (nested parens, the opt-out visible in the
argument text, and ≥ 4 real q̂ call sites found in the tree, so the scan cannot be scanning nothing).

### §S1.3 item 2 — the phrase lint  **LANDED for `site/data/job.js`; the spec half is on record**

`site/data/job.js` was corrected by the meta lane while this round ran (`:195` and `:210-211`), so the
lint's file list now includes it, asserted on **both readings**: the raw file must not contain
"first-try rate" anywhere, and it must state "CLEAR rate" both raw and after `prose()` — because
`prose()` strips block comments, and a docblock invisible to the lint is exactly how the drift
survived three rounds of a green suite.

`COMPOSED-GAME.md:361` still carries the first-try reading and this lane may not edit it. What is
asserted instead is the audit trail's own invariant, in a new arm: **the drift is either corrected in
the document or recorded here as a spec correction with its exact replacement.** Deleting the record
without fixing the document fails it; so does the document drifting back after the record is retired;
and when the doc agent lands the edit the `else` branch becomes dead and the arm collapses to the
strict assertion. Its first run, before this note existed, failed with *"the drift is now neither
fixed nor recorded"* — that is the negative control.

### §S2.3 — the four pins  **LANDED** (`tests/job-exploit.test.mjs`, inside proof 8)

They live inside proof 8 because `week()` there is the vetted harness for this exact question: one
student, a fixed true ability (`trueM`), a throw cadence independent of the save (`throwEvery`), every
target priced through the shipped `econ.settle` off a real Leitner record, and **the rank pinned**
(`rank: 3`) — which is what lets the throw cost be measured separately from the rank prize.

Run them with `S2_PRINT=1 node --test tests/job-exploit.test.mjs`.

1. **Monotone in the throw rate at a common rank.** Signs only, per the arbiter's rule that no
   policy-dependent constant may be pinned.

        φ        0      1/16    1/8     1/4
        bagged   7211   6468    5360    4215      non-increasing, strictly down at 1/8
        thrown      0     28      51      93

   CONTROL: the honest arm is asserted deterministic across the four calls, so the monotonicity is
   measuring the throws and not the seeds.
2. **The rank prize is bounded below the throw cost.** `RANKS[5].guardMult / RANKS[4].guardMult =
   0.75/0.70` read off `RANKS`, divided by the minimum number of wings a board spans (3, G1) →
   bound **2.38 % < 2.5 %**, against a measured throw cost of **25.7 %** at φ = 1/8 on the same eight
   seeds. Only the two one-sided bounds are asserted (`bound < 0.025`, `cost > 0.09`). The arm also
   asserts `RANKS[5].calls` equals `RANKS[4].calls`, because the bound is only valid while the 95 rung
   is already held at Called 4.
3. **The bucket lever is a STOCK lever, not a flow lever — G3.7(3)(d) as published is false.**

        φ             0       1/8     1/4     1/2
        take        3136 →   2837 →  2275 →  1562      strictly falling
        stock rate  267.5 →  378.1 → 435.0 → 406.3      +52 % end to end
        mean bucket  3.00 →   2.61 →  2.11 →  1.14      strictly falling

   The stock rate's rise is asserted end-to-end and over the first two steps, **not** monotone: it
   turns over between 1/4 and 1/2 because by then most cards sit in bucket 1, where `I(b)` can fall
   no further. The monotone form is false and would have to be tuned to pass, so it is not asserted.
   **THE MECHANISM CONTROL, which is the published sentence itself:** with the fixed target count
   removed — every due card served, however many that is — the take RISES instead
   (4420 → 4694 → 5235 → 6409), because a dropped bucket returns sooner and colder. The fall is a
   property of *a job serving a fixed number of targets*, not of the Leitner arithmetic, and the test
   asserts both directions. A further control asserts the honest arm's own rate DECAYS over the same
   fortnight (proof 3(d)'s result), so "the rate rises" is a property of the throws, not the calendar.
4. **The 50 rung is free both ways.** `CARRY_LADDER[50] = {W:1,P:0}`, `RATING_LADDER[50] = {0,0}`,
   `creditOf(50, true) === creditOf(50, false) === 0`, plus the Brier arithmetic that FORCES it
   (`c(0.5,1) = c(0.5,0) = 0` from `CREDIT.base − CREDIT.k(p−o)²`) so a rebalance of `CREDIT` cannot
   quietly break proof 6, plus a settle arm showing a missed 50 takes nothing at LOOSE 0/60/300.
   CONTROL: every other rung DOES price its miss (`P > 0`, `creditOf(id, false) < 0`), so this is a
   property of the 50 alone.

### §S3.4, §S4.4, §S5.5 — **NOT written by this lane, deliberately**

Each of those is a decision whose primary lane is `call` / `crew` / `screen`, and each acceptance test
asserts behaviour that does not exist yet in the tree I can see:

* §S3 landed in `call.js` while I worked (the floor is at `call.js:539` now) and `screens/mock.js`
  passes the held rank; `state.js:1072` and `:1785` still call `ratingDetail(p.rating.calls,
  CAPS.calls)` with no `rank:` option, so §S3.4 item 4 ("the three writers actually pass it") would be
  red. I adapted `job-week.test.mjs`'s rank lint to the two writers that HAVE landed (above) rather
  than pre-empt the arm.
* §S4 has not landed at all (`crew.js` still exports `CHAIN_HOLD_MIN` and `holdsChain`, `data/job.js`
  still has `CREW_MATRIX`), and §S4.3 makes the whole repair conditional on a gate whose outcome the
  crew lane owns and has not published. Writing §S4.4 now would either be red or would pin the
  fallback the gate has not chosen.
* §S5 has not landed (`screens/job.js` has no pending brief allocation).

Writing those arms now would put the suite red on other lanes' half-finished work, which is the one
thing the hard rules forbid outright. The lane that lands each mechanic should write its own
acceptance arm; if that lane is told not to touch `tests/job-*.test.mjs`, hand me the mechanic and
I will land the arms in one pass. Requests 1 and 3 say so.

---

## Spec corrections

One, for the doc agent. It is the finding-15 drift, and §S1.5 of REPAIR-DECISION already specifies
it; it is repeated here verbatim because `tests/job-meta-constants.test.mjs` now asserts that this
record exists for as long as the document has not moved.

**`COMPOSED-GAME.md:361` — OLD (exact line):**

> **The anti-farming weight, and why the rating is a SUM over a fixed window.** `w = 4·q̂(1−q̂)`, `q̂` = your first-try rate on that make over the trailing 10 attempts. `q̂ = .5 → w = 1.00`; `.8 → .64`; `.9 → .36`; `.933 → .25`; `.97 → .116`.

**NEW (exact replacement):**

> **The anti-farming weight, and why the rating is a SUM over a fixed window.** `w = 4·q̂(1−q̂)`, `q̂` = your **CLEAR rate on that make over the trailing 10 sittings** — the same event `econ.settle` prices, so one button forecasts one event. `q̂ = .5 → w = 1.00`; `.8 → .64`; `.9 → .36`; `.933 → .25`; `.97 → .116`.

`site/data/job.js`'s half of the same correction is already landed by the meta lane, and the lint now
covers that file. When this line moves, the `else` branch of
`tests/job-meta-constants.test.mjs` → *"the SPEC: COMPOSED-GAME.md:361 either states the CLEAR rate or
its correction is on record"* becomes dead and the arm collapses to `assert.match(spec, /CLEAR rate/)`.

---

## Requests

1. **`site/js/job/state.js` — the two remaining ratchet writers (S3 lane).** `state.js:1072`
   (`applyTarget`) and `:1785` (`endJob`) still call `call.ratingDetail(p.rating.calls, CAPS.calls)`
   with no `rank:` option, so they overwrite `p.rank` with the bare recomputation and the floor that
   `screens/settings.js`, `screens/stats.js` and now `screens/mock.js` pass is a rank those two lines
   have already demoted. REPAIR-DECISION §S3.1(b) specifies `{ rank: p.rank }` at both. When it lands,
   tell me and I will add §S3.4's items 3-6 (the binding-floor case, the whole slide, the
   three-writers arm, and finding 29's band check) to `tests/job-call.test.mjs` and
   `tests/job-state.test.mjs` in one pass.
2. **`site/data/job.js` / `site/js/screens/*` — three COPY entries with no call site (copy + screen
   lanes).** `COPY.repeat` and `COPY.cleanGetaway` have zero `COPY.<key>` call sites under `site/js`;
   either route the screen's literal through the table or delete the entry, because a table entry no
   screen reads is a second source of truth for whatever the screen types instead.
   `COPY.contractRow` is dev-only by design (`board.js`'s console report) and is fine as it is — say
   so in a comment if you want the count to mean something. `tests/job-copy.test.mjs` §10 asserts the
   list is exactly `['cleanGetaway', 'contractRow', 'repeat']`, so it will tell you the day it moves.
3. **`site/js/job/crew.js`, `site/js/screens/job.js` — S4 and S5 have not landed (crew, screen
   lanes).** `crew.js` still exports `CHAIN_HOLD_MIN` / `holdsChain`, `data/job.js` still carries
   `CREW_MATRIX`, and `screens/job.js` has no screen-local pending brief allocation. §S4.4 and §S5.5
   are unwritable against this tree. Publish the §S4.3 gate's outcome (the repair or the S4.7
   fallback) and the HELD → DEEP label decision, and the acceptance arms can follow in one pass.
4. **`qa/audit-states.mjs` / `site/js/screens/job.js` — `job-board` is `unreached` (screen / board
   lanes).** `node qa/layout-audit.mjs --only job-board --vp 375x667 --engine chromium --theme light`
   → `BLOCKER unreached` on `.job-screen[data-phase="board"] .job-contracts`: *"prepare() finished but
   its declared root is not in the DOM"*. The `fitRaf` TDZ that caused the round-3 version of this is
   fixed and `qa/job-screen.mjs` now walks a whole job, so this is either a stale root selector in the
   state's declaration or a real board-phase regression. Nothing under `node --test tests/` depends on
   it, which is why it is a request rather than a blocker here.

---
---

# tests — VERIFY ROUND 1 (the same lane, the round-1 verifiers' findings)

Lane: `tests/job-*.test.mjs` plus `tests/state.test.mjs`'s size bound and the layout harness
(`qa/audit-states.mjs`, `qa/audit-allow.json`) — the files the five findings name.
**No file under `site/` was edited.** Requests for other lanes are at the bottom.

    node --test tests/     BEFORE  2817 tests · 2813 pass · 0 fail · 4 skipped · EXIT 0
                           AFTER   2916 tests · 2912 pass · 0 fail · 4 skipped · EXIT 0

    node qa/layout-audit.mjs --only job --engine both --theme both
                           BEFORE  372 findings · 252 BLOCKER · 120 MAJOR · 0 waived · FAIL (exit 1)
                           AFTER     0 findings · 130 waived (each with a reason and a named control
                                     state that owns it) · PASS (exit 0) · 522 s
                                     waived: overlap 64 · offscreen 40 · unreachable-answer 24 · contrast 2
                                     11 states x 17 viewports x 2 themes x 2 engines

---

## 1 · The Mock anti-tank test proved one thing and asserted another  (MAJOR, exploit-hunt)

`tests/job-week.test.mjs:682-694`. The comment said *"the tank cannot fill the window: it buys 1/50
of the rating for a whole evening's work"*. The assertion under it (one slot a day) is true; the
inference is not. `call.ratingDetail` is `5 + 2·Σ(w·c)/N` with **N = 50 fixed** — not a mean over
filled slots — so one slot is not one fiftieth of the rating, it is a fixed `2·(w·c)/50` of rating
POINTS. Nothing in `tests/` bounded what the channel could reach.

**Kept** `:694` (it is true) and rewrote its comment to say what it does and does not prove.
**Added** `THE BOUND THE GATE IS NOT — a Mock slot against the best honest slot, and the rank each
buys`, which computes both sides from the shipped constants and then drives the result through the
shipped writers:

| quantity | computed from | value |
|---|---|---|
| a tanked Mock slot, `w·c` | `MOCK_CALL_W × call.credit(1, true)` | **10.000** |
| best honest slot, reachable | `max wTimesEcDiscrete(k/10)`, `k` = the `qHatWindow` grid | **2.2680** (at q̂ 0.9) |
| best honest slot, theoretical | fine sweep of the same function | 2.4998 (at q̂ 0.853) |
| ratio | | **4.409 ×** |
| evenings of a tanked Mock per rank | `Σ(w·c) ≥ (T−5)·N/2` | Called 3 **4** · Called 4 **7** · Called 5 **10** |
| honest calls per rank at the ceiling | same, at 2.2680 | 17 · 30 · **43** |

and then twelve real evenings through `mock.applyMockCall` on a real save, one tanked paper a day,
seeds fresh, `now` advanced a day at a time so the `already-today` gate is satisfied honestly:

    mock tank ladder [evening, rating, rank]
    [[1,5.4,2],[2,5.8,2],[3,6.2,2],[4,6.6,3],[5,7,3],[6,7.4,3],[7,7.8,4],[8,8.2,4],[9,8.6,4],[10,9,5],[11,9.4,5],[12,9.8,5]]

Evening 10 → rating **9.000** → **Called 5**, on twelve blank papers. The arithmetic and the shipped
machine agree to the digit, and the test asserts the agreement (`reached(r) === tankSlots[r-1]`).

**This is a defect of `site/js/screens/mock.js`, not of the suite** — see Requests · A. The test
pins the numbers in BOTH directions so a repricing cannot land silently.

---

## 2 · The S4 census guarded a build decision the game does not implement  (MAJOR, crew-alignment)

`tests/job-crew.test.mjs` §S4·2(b) failed with *"a dominant build"*, which claimed it was the
suite's guard against one. Measured on the section's own 1 040-board corpus:

    boards 1040   DEEP 595 (57.2 %)   SPREAD 445
    DEEP whose make A the save may legally HOLD:  3  =  0.29 % of decisions, 0.50 % of the DEEP
    canAllocate(save, A, HELD) on the rest -> { ok:false, reason:'not-mastered' }, allocate -> crew {}
    callers of buildDecisionOn / deepThresholdAt / DEEP_THRESHOLDS / marginalDRho / heldValueOn /
      crewOrderOn / supplyGapFor / crewOrderTrue / steadyValueOn under site/js + site/data:  none

So twelve green tests certified the two-sidedness of an unshipped inequality while the decision the
game DOES implement was unmeasured. Four changes, none of them a deletion:

* a banner over §S4 stating that §1-§3 measure an unshipped mechanic, with the two measurements that
  make that machine-checked rather than a comment;
* **(b) relabelled** — `25 %…75 %` is still asserted (it is a real property of `RUNG_BANDS` and worth
  pinning for the day R-D1 lands) but it no longer fails with *"a dominant build"*, and the census
  now prints the legality column beside every shape;
* **(c) NEW — the legality census**: `deepLegalPct < 1 %`, the allocator's refusal `by name` on the
  census's own illegal examples, the three legal ones proved legal, and the no-caller grep as an
  assertion (`assert.deepEqual(callers, [])`), so the banner cannot rot;
* **(d) NEW — the guard that was missing**: `buildOptions`, the STEADY-vs-HELD decision the shipped
  save really makes, over the same 1 040 boards.

      shipped build decision: boards 1040  STEADY 940 (90.4 %)  HELD 100 (9.6 %)
        HELD on offer at all: 316 (30.4 %) — of those STEADY 216 (68.4 %), HELD 100 (31.6 %)
        RUN {"boards":260,"steady":252,"held":8,"offered":79}   JOB {"…":227/33/79}
        JOB12 {"…":226/34/79}                                   VAULT {"…":235/25/79}

  Unconditionally the build is **dominant — 90.4 %, fifteen points outside the same 75 % test** §2(b)
  applies to the unshipped inequality. Conditionally, on the 316 boards where the student has a
  mastered make to hold at all, it is two-sided (68.4 / 31.6) and inside the band. Both are pinned,
  because they say different things: the defect is about who can REACH the decision, not the prices.
  G2's *"two flips, no dominant build"* is false as shipped — the crew lane's own round-3 BLOCKER,
  now machine-checked here.

---

## 3 · The walk-repair acceptance arm ran on one seed and through `force: true`  (MAJOR, split-honesty)

`tests/job-board.test.mjs` "THE CRITERION survives a history of mid-job walks" — the arm
COMPOSED-GAME.md cites by name — seasoned every one of its twelve cells from `CORPUS[2]`, a
hardcoded index, in a file that builds a 50-save corpus and a 400-save wide corpus; and it seasoned
them through `state.startJob(..., { force: true })`, the flag whose own docblock calls it *"the
deliberate override"* for a Today's Page in progress. A mid-job walk always leaves one, and
`grep -n force site/js/screens/job.js` returns nothing, so the history it seasoned with is one no
student can hold.

Both fixed at the root:

* **`force` is gone.** New `clearLeftoverPage(save)` finishes the leftover page through the shipped
  writers (`page.markItem` × n → `page.finishPage`), which is the path the screen forces the student
  down. Measured: after walking at 3 of 7 the save is `{kind:'page', idx:3, len:10, game:false}` and
  the next `startJob` throws `JobStateError: page-in-progress — 7 left on Today's Page`; seven
  `markItem`s and a `finishPage` later it starts with no flag at all.
* **The sweep is the whole corpus** — 50 saves × 4 shapes × 3 walk levels = 600 cells in 2.1 s. And
  the published claim splits in two, only one half of which is true:

      walks = 0   200 cells   over-band   0 (0.0 %)   median 0.37   p90 0.84   max 2.15
      walks = 3   200 cells   over-band   0 (0.0 %)   median 0.90   p90 2.37   max 2.51
      walks = 5   200 cells   over-band  48 (24.0 %)  median 3.37   p90 6.05   max 7.49

  `SPLIT.agreeWithinPoints` is 5. The 0- and 3-walk levels are now asserted **per cell** (400 cells
  with nowhere to hide, where there used to be eight); the 5-walk level is asserted as a
  distribution at its measured shape, with upper bounds only, so a repair in the board lane cannot
  break this file. **COMPOSED-GAME.md:124's "up to five of five" overstates it** — see Requests · B.

* **The CONTROL now names the mechanism.** The old one wrote `e.postedAnswered = e.posted` on the
  walker's own save and asserted the rate halved — a property of `postedOf`'s two-branch `if`. It is
  kept, honestly labelled as a reproduction of the pre-round-3 WRITE, and a second, independently
  clocked walker was added: identical history, identical shape, answering exactly twice as slowly.
  `projectionRates.answer` scales by **2.000000000** and `projectionRates.decision` is
  bit-identical, on `assert.equal`. That is the recovered pace really being the student's own.

---

## 4 · `--only job` was permanently RED, and all 372 findings came from a keyboard on a card with no text field  (BLOCKER, layout-safari)

`qa/audit-states.mjs` stated the rule and did not enforce it: `pinKeyboard`'s focus probe returned
`!!f` and the return value was **discarded**, so the inset was pinned regardless. `job-answer-kb` and
`job-payout-kb` both stopped on target 1 of `qa/fixtures/midweek.json` — a cloze, answered by tapping
chips, zero text inputs — so nothing was focused, `widgets/base.js keepVisible()` never ran, nothing
was scrolled, and every `offscreen` / `overlap` / `unreachable-answer` hit fired. Verbatim the
artefact the comment above `pinKeyboard` predicts.

Four changes:

1. **`pinKeyboard` refuses.** The probe's answer is load-bearing: no focusable field → it THROWS,
   naming the widgets it found and the `activeElement`, and `layout-audit.mjs` reports that as a
   `(state.prepare)` BLOCKER. A state that cannot open a keyboard can no longer pretend to.
2. **`jobToTypedTarget(page)`** walks the live job — driven by the screen's own `data-phase`, bounded
   — missing the targets that mount no field and stopping on the first that does. `css/job.css`
   already records that the fixture mounts live text inputs on three of its ten targets.
3. **`job-payout-kb` was measuring a configuration that does not exist**, and the app's own code
   settles it rather than an argument: the beat is drawn from `applyTarget`, which runs off the
   card's `onDone`, and `screens/card.js:1023 lockAll()` runs first — `entry.w.lock(true)` sets
   `input.disabled = true` on every field (`widgets/base.js:431`) and hides the keypad dock. A
   disabled field is blurred and a blurred field closes the keyboard. Measured at the beat on a
   TYPED target: `widgets: ["w w-pairs is-complete is-locked"], activeElement: MAIN`, zero focusable
   fields. The state now drives a typed target, **asserts that the app took the keyboard away**
   (throws if a field is still live, so the reasoning cannot go stale), and measures the beat at the
   `VP_KB` phone heights with `--kb: 0`. Whether `.job-beat` should ride `--kb` through the OS's
   dismissal animation is a `site/css/job.css` question and is left there.
4. **Two CONTROL STATES, so what survives can be ATTRIBUTED instead of argued about.**
   `card-pairs-kb` is `#/card/ang-wu-1` — the very card the job stops on — at the same `VP_KB`
   heights with the same real focus and the same 336 px inset, and no job anywhere;
   `card-pairs-locked` is the same card answered to the end. Result, at 375×667/chromium/light:

       job-answer-kb findings, and whether card-pairs-kb reproduces them
         BOTH  4  offscreen          .card-side .card-scratch-wrap > button.card-scratch-toggle
         BOTH  6  offscreen          .card-side .hint-ladder > button.card-hint-btn
         BOTH  6  overlap            .w-pairs-foot > p.w-pairs-count
         BOTH  6  overlap            .w-pairs-foot > button.w-pairs-undo
         BOTH  2  overlap            .card-scratch-toggle  (+2 on its two spans)
         BOTH  6  unreachable-answer input#wpairs-1-in
       job-only: NONE.   card-only: none.
       job-payout-kb's one finding — contrast 4.21:1 on the pairs widget's wrong-state red — is
       reproduced on card-pairs-locked (.w-pairs-figmsg-t > .w-mk, same colours, same ratio).

   **Every single survivor is the study layer's card chrome**, reproduced with no job in the page.
   They are waived in `qa/audit-allow.json` **on the two job states only**, each with the control
   named in its reason, and they stand UNWAIVED on the control states — so the study layer's net
   still fails on them and nothing is muted anywhere. `audit-allow.json`'s `_doc` now defines this
   second kind of entry ("an ATTRIBUTED waiver") and its condition: a control state outside the host
   that reproduces the hit and is left live. Study-layer backlog: Requests · C.

---

## 5 · The study-half worst case omitted `inProgress.meta`  (MAJOR, save-budget)

Half of this landed in the `save` lane while this round was running: `tests/_helpers.mjs` now
exports `GAME_META_FIELDS` and `worstCaseJobBefore`, `withoutGameKeys` strips the seven game fields
out of `inProgress.meta.before`, `SAVE_BUDGET_KB` carries a `metaDelta` row, and
`tests/state.test.mjs`'s carrier holds the snapshot's GAME half. Two residuals were left, and both
are the difference between a number that is measured and a number that is *stated*:

1. **`inProgress.meta` is not only the before-snapshot.** `page.startPage` CREATES the slot, with the
   page-label block (`day, dayIndex, pageIndex, D, q, qEff, R, warn, first, counts, tier4, modules,
   carried, boss, seedTag, minutes, minutesMax`), on the flat Page route as well as the job route —
   and no carrier held it, so ~278 B of STUDY bytes that every live page and every live job carries
   were in neither half. `PAGE_META` now puts **the shipped writer's own block** on the carrier
   (built by calling `startPage`, not typed out), and a new arm proves it is the shipped writer's key
   for key, that `withoutGameKeys` does not strip it, and that it moves the study half and not the
   game addition. Cost, measured: **276 chars**.

2. **The excess over T01's bound was printed and not asserted**, so `notes/repair-save.md` Request D
   could expire in silence. It is now pinned in both directions:

       worst-case save: 538 996 chars = 498 772 study + 40 224 game     (study slack 1 228 of 500 000)
       a LIVE in-progress save (label block + FULL before-snapshot): study 504 843 of 500 000 — over by 4 843

   `assert.ok(over > 0)` fails the day someone answers Request D (and says so: *"fold the snapshot
   into the carrier and delete this arm"*); `assert.ok(over <= 6000)` fails the day it grows. The
   carrier itself is left as the save lane set it — that decision is theirs and it is recorded in
   their own docblock. **G7's "≈ 1.5 KB of slack" is a statement about a carrier that omits both
   halves of this** — see Requests · B.

---

## THE SUITE

    node --test tests/          BEFORE  2817 · 2813 pass · 0 fail · 4 skipped · EXIT 0
                                AFTER   2916 · 2912 pass · 0 fail · 4 skipped · EXIT 0  (284 s)

    THE TREE MOVED UNDER THIS RUN, and it is worth recording how it was told apart from my own work.
    Two full-suite runs during this round came back red — 7 failures, then 2 — every one of them in a
    file this lane does not own (job-econ, job-meta-constants, job-state, job-call, and one arm of
    job-board's Global-rule-5 section), while `site/js/job/{board,call,crew,econ,guard}.js`,
    `site/js/screens/*` and `site/data/job.js` were all being rewritten by the other fixer lanes in
    the same ten minutes (mtimes 03:03-03:20). Each time, the four files THIS lane edited were
    re-run alone against the tree of the moment and came back 413 / 413 / 0, and each red arm went
    green on its own as its owner landed (`tests/job-call.test.mjs` last, 03:20). Nothing was
    adjusted here to chase them.

    the four files this round edited, each run alone  (413 tests · 413 pass · 0 fail)
      tests/job-week.test.mjs     +1 test  (THE BOUND THE GATE IS NOT)
      tests/job-crew.test.mjs     +2 tests (S4 §2(c) legality, §2(d) the shipped build decision)
      tests/job-board.test.mjs    +0 tests (the walk arm rewritten: 12 cells -> 600, force dropped)
      tests/state.test.mjs        +1 test  (the page-label block and Request D's ratchet)
    and the layout harness
      qa/audit-states.mjs         pinKeyboard refuses; jobToTypedTarget; job-payout-kb re-specified;
                                  +2 control states (card-pairs-kb, card-pairs-locked)
      qa/audit-allow.json         +4 ATTRIBUTED waivers, each naming the control that owns the hit

---

## Requests (verify round 1)

**A · `site/js/screens/mock.js` — `MOCK_CALL_W` is 4.4× the best slot honest play can reach (call /
screen lanes).** A tanked Mock stores `p = 1` and is paid `credit(1, true) = 10`, the ceiling of the
credit, because a self-fulfilling forecast is exact; the best honest slot is 2.2680. Ten tanked
evenings buy Called 5, against 43 honest calls for the same rank — measured end to end through
`applyMockCall` in `tests/job-week.test.mjs`. The gate (20 items × 20 s) is a cost, not a bound, and
one-slot-a-day is not one either. Repricing `MOCK_CALL_W`, or capping the credit a self-scored paper
may claim, is the fix. Every number is pinned in that test, so whatever lands has to come back and
restate them.

**B · `COMPOSED-GAME.md` — two published sentences are now measured and wrong (doc agent).**
  * **:124** — the split criterion "up to five of five" mid-job walks: true to three of five on
    every save and every shape (400 cells, 0 misses), and at five of five it misses on **24.0 %** of
    cells, worst 7.49 points against `SPLIT.agreeWithinPoints` 5. The honest sentence is "up to three
    of five, and degrades at five of five, where the projection window holds no finished job".
  * **:946** — "the study half now measures 498 463 against T01's 500 000, i.e. ≈ 1.5 KB of slack".
    The carrier that produces that figure omits the page-label block and the study half of the
    before-snapshot; with both, the same carrier measures **504 843**, i.e. **4 843 over**. The slack
    sentence has to be restated off the live figure, or T01's bound restated — but not inherited.
  * and G2's "two flips, no dominant build", already the crew lane's BLOCKER, is now machine-checked
    at 90.4 % STEADY in `tests/job-crew.test.mjs` §S4·2(d).

**C · the STUDY layer's card chrome at keyboard height (study / css owners).** Six defects, all
reproduced on `card-pairs-kb` and `card-pairs-locked` with no job in the page, all live in those
states' exit code:
  * `.card-side .hint-ladder .card-hint-btn` and `.card-side .card-scratch-wrap .card-scratch-toggle`
    are below the fold with the page scrolled to its end at 375×667 with a 336 px keyboard (top 453 px
    and 354 px against a 331 px band), and overlapped by the lifted dock at 320×568@zoom20;
  * `.w-pairs-foot`'s count line and UNDO button sit under the lifted dock (dock top 214 px, element
    265-309 px);
  * `input#wpairs-1-in` — the pairs widget's own answer field — starts at y 342 px, below the dock
    top at 214 px, and `keepVisible()` cannot scroll it clear because the picker is taller than the
    band the keyboard leaves. `unreachable-answer`, six viewports;
  * the pairs widget's wrong-state red measures **4.21:1** against the 4.5:1 the detector needs at
    15 px (`rgb(217,45,76)` on its own pink ground).

**D · `qa/fixtures/midweek.json` (QA owner) — the two keyboard states now walk up to several targets
to find a typed one, which costs a few seconds per state.** A fixture whose FIRST target mounts a
text input would make `job-answer-kb` instant and remove the walk entirely. Not a blocker: the walk
is bounded and driven by `data-phase`.

---
---

# VERIFY ROUND 2 — the tests lane

Ten findings, all of them the same accusation in ten places: **an assertion that cannot fail for the
thing it is named after.** A constant compared with itself, a distribution measured on one seed, a
board no job is played on, a branch no arm reaches, a waiver defended by prose. Every fix below
replaces the claim with a measurement of the shipped machine, and where the measurement says the
product is wrong, it says so in the test rather than being softened.

Two of the ten turned out to be wrong as stated, and both are refuted below with the command and its
output (findings 4 and 1). Two are open defects in code this lane does not own, and are pinned in
both directions with the fix instruction in the failure message (Requests · F and · G).

    node --test tests/     BEFORE  2920 · 2916 pass · 0 fail · 4 skipped · EXIT 0   (297 s)
    node --test tests/     AFTER   see THE SUITE at the end of this section

---

## 1 · call-propriety — §1b and §4 cannot fail for the defect they name  (MAJOR)

**Landed by the call lane while this round ran, and verified here.** `site/js/job/call.js` (06:25)
now stores `q̂` on the entry, so `slotCeiling` no longer has to guess which root of
`w = 4q̂(1−q̂)` the report came from; §1 and §1b in `tests/job-call.test.mjs` were rewritten by that
lane (§1b is now the Mock's double-root branch, with a mutant-killing separation assertion), and §4's
family now carries the branch-conditional policies this finding asked for by name.

Re-measured here after their fix, over the whole family the finding names — `shift(0/±1)`, the four
constant rungs, and `weakBold70/85/95` (over-call only where `honestCall(q̂)` is the bottom rung) —
driven through the shipped `windowPush → ratingDetail({rank}) → rank`, 60 lives × 200 calls:

    true q  0.20 … 0.45   every policy banks 2.000 — nothing moves on unreadable material
    true q  0.50          truth 2.233   best lie 2.083 (weakBold70)
    true q  0.55          truth 2.700   best lie 2.250 (weakBold70)
    true q  0.60          truth 3.167   best lie 2.867 (weakBold70)
    true q  0.65          truth 3.533   best lie 3.317 (weakBold70)
    true q  0.70          truth 4.083   best lie 4.050 (weakBold70)
    TRUTH WINS at every true q, against all nine deviations.

Before their fix (measured on this tree at 06:05, same harness) `weakBold70` beat truth at true q
0.50 / 0.55 / 0.60 / 0.65 / 0.70 — exactly the finding's claim. The negative control is therefore
real and it is now closed.

**What this lane added: §6b.** The finding's third complaint — "§6's Called-5 arm takes `Math.max`
over single-q̂ homogeneous windows, which is arithmetic about the cap rather than a measurement of
honest play" — was still true after their rewrite. §6's last two lines take the best `ceiling` over
nine windows of fifty identical calls, a window no student produces. `§6b Called 5 is reachable BY
PLAYING HONESTLY` drives the shipped path instead, 60 lives × 200 calls, q̂ recomputed from the
student's own clear history the way `state.applyTarget` recomputes it:

    true q   truth reaches Called 5   always-95   always-50
    0.70              15 %                0 %        0 %
    0.80              65 %                7 %        0 %
    0.85              68 %                8 %        0 %
    0.95               5 %                2 %        0 %

and it asserts three things the arithmetic could not: the top rank is REACHED by truthful play, it is
never cheaper to lie for, and it COLLAPSES on material cleared 19 times in 20 (G3.7 #3's anti-farming
claim, which nothing else in the file measures end to end).

---

## 2 · exploit-hunt — no arm ever graded a card with `inProgress.game` absent  (MAJOR)

True, and the policy it hides is real. `tests/job-exploit.test.mjs` now carries
`J9 · verify-2 · the q̂ read is bought OUTSIDE the job`, two arms:

* **the isolation, asserted not claimed** — two saves, one seed, five all-clean jobs each, with six
  study sittings between jobs that push `{at, ok}` into `cards[*].history` and call nothing else. The
  Leitner records, the skills and the XP come out BYTE-IDENTICAL (`ledgerOf` is asserted equal), so
  the only difference between the two saves is the q̂ the envelope reads;
* **the measurement**, 8 seeds:

      realised carry   mean −3.2 % … −4.0 %, negative on 6 of 8 — the MONEY ladder is not farmable
                       this way (the exact mean moves with the econ lane's in-flight prices; the
                       SIGN is what the arm asserts)
      rating / rank    +0.00 … +1.17 rating on 7 of 8, and +1 RANK on 5 of 8; never −1

`w = 4q̂(1−q̂)` is maximised at q̂ = ½, so sittings DELIBERATELY missed outside the stake make every
call inside the stake worth more, and the ratchet banks the best window the student ever printed. The
cost is paid in the study layer (a Leitner bucket), never in the job, and the seal only fixes WHEN the
history is cut, not WHERE it came from. The carry claim is asserted as a claim; the rank half is
asserted as a bounded, present defect that fails the day it is closed — **Requests · F**.

---

## 3 · crew-alignment — §6 measures a board no job is played on  (MAJOR)

True and now fixed at the root: `corpusOf` drafts through `composeBundles → draftUnion`, the path
§7's own 300-board corpus has always used, and `board: 'page'` keeps the old corpus as a named
control. Every figure §6 publishes was re-measured on the drafted board:

                                     page slice (old)      DRAFTED board (now)
    §6.2 top-three, all 19 makes           43 %                   58 %
    §6.2 exact argmax                      19 %                   20 %
    §6.2 served-only                    99 % / 57 %            91 % / 44 %
    §6.1 ρ(all) / ρ(served)            0.6546 / 0.30         0.8270 / 0.4909
    §6.1 corpus argmax                 FAC2, 8th of 19       NOTE, 4th of 19
    §6.3 mean ρ(all) over 24 corpora        0.65            0.8334 ± 0.0305 [0.768, 0.894]
    §6.3 mean ρ(served)                     0.30            0.5950 ± 0.1540 [0.167, 0.783]
    §6.3 served makes per corpus            ~9.6                   10.71 [9, 13]

**The job's own board is BETTER aligned with the study plan than Today's Page truncated to ten.**
Two arms were added rather than two numbers changed:

* **§6.2b** keeps the page-slice corpus, reproduces 43 % / 19 % from it exactly, and asserts the two
  boards are different populations (≤ 5 of 100 boards draft the page's first ten; ρ(all) strictly
  lower on the slice). The retired figures stay machine-checked and can never be quoted as "the
  board" again;
* **§6.3's neighbourhood arm** makes the headline a DISTRIBUTION for the same reason ρ is one: over
  24 corpora the top-three rate is 61 % ± 6 [49, 69] and the argmax rate 28.6 % ± 5 [18, 42]. The
  critic's own draft seed measured 64 % / 32 %; both that and this file's 58 % / 20 % are inside the
  band, which is the point. The top-three separation from the page slice is a FLOOR (every one of 24
  corpora beats 43 %); the argmax separation is only a MEAN (the worst corpus is 18 %, below the page
  slice's 19 %) and is asserted as a mean, in those words.

**Requests · E** carries the three COMPOSED-GAME.md lines (:645, :1000, :1023) that still publish
43 % / 19 % / ρ 0.65 as the board's.

---

## 4 · ledger-invariance — "a job that deals the WHOLE page earns it" is unreachable  (MAJOR)

**Half true, and the headline is wrong.** The finding's own words are "720 completed jobs, four
shapes, with and without swaps: `flawless-page` is awarded on the job route ZERO times". Measured
here through the shipped terminal (`playJob → jobSummaryContext → commitJobRun`, `trophyCheck` on the
save afterwards), on two populations:

    $ node --test tests/run-lane-r2.test.mjs        (J_PRINT=1)
      light population:  24 completed all-clean jobs across four shapes: 6 rows partial:false,
                         6 earned flawless-page, coverage 55–100 % of the composed page;
                         whole-page rows: JOB12 11/11 ×6
      loaded population: 24 completed all-clean jobs across four shapes: 0 rows partial:false,
                         0 earned flawless-page, coverage 25–57 % of the composed page

So the hatch **is** reachable in the shipped app — a JOB12 on an 11-item page deals the lot and earns
the trophy — and `data/trophies.js:200-202`'s sentence has reachable instances. What is true is the
finding's mechanism: on a mid-unit page (16–28 items) no shape gets near it, which is the population
the critic measured. Both facts are now arms, and the old test is renamed to what it measures
(`commitJobRun honours the 'composed' it is HANDED`) with the hand-set line kept and guarded by
`assert.ok(before.composed > queue.length)` — i.e. the fixture now proves it is a fixture.

---

## 5 · split-honesty — G9 #1's only guard is data/job.js against data/job.js  (MAJOR)

True. `decisionCount('JOB').perItem.full >= JOB.SPLIT.densityMinFull` is arithmetic over literals in
`site/data/job.js` checked against another literal in the same file; it would pass with `debriefOf`
printing zero. Both econ lines are KEPT (the published table must still reproduce from the constants)
and relabelled as the table's own arithmetic, and the product claim is now measured in
`tests/job-split.test.mjs` §`G9 #1, MEASURED`, through a played full-use job, on every shape:

    shape   debriefOf().perItem   G1's count (a window = its options)
    RUN            2.67                      3.67
    JOB            2.50                      3.50
    JOB12          2.42                      3.25
    VAULT          2.57                      3.43

The gap is a DEFINITION — `debriefOf` charges a brief WINDOW as one decision (the skip), G1 charges
the options taken inside it — and only one of the two is published. The arm asserts both directions:
the machine's own density clears the DEFAULT floor on every shape, G1's count clears the FULL floor,
and the day the shipped number reaches `densityMinFull` the arm fails and says to replace itself with
the plain assertion G9 #1 has always claimed. **Requests · G.**

---

## 6 · test-integrity — four waivers hide 47 findings and nothing runs the control  (MAJOR)

True, and the counts in the reasons really had gone stale. The audit was re-run on the four states
and the attribution reproduces EXACTLY, hit for hit:

    $ node qa/layout-audit.mjs --only job-answer-kb,job-payout-kb,card-pairs-kb,card-pairs-locked \
        --engine chromium --theme light --vp phone
      WAIVED on job-answer-kb              LIVE on card-pairs-kb
        9 offscreen  .card-hint-btn          9 offscreen  .card-hint-btn
        7 offscreen  .card-scratch-toggle    7 offscreen  .card-scratch-toggle
        9 overlap    .w-pairs-undo           9 overlap    .w-pairs-undo
        9 overlap    .w-pairs-count          9 overlap    .w-pairs-count
        2 overlap    .card-scratch-toggle    2 overlap    .card-scratch-toggle
        1 overlap    .card-side-h            1 overlap    .card-side-h
        1 overlap    span.muted.fs-1         1 overlap    span.muted.fs-1
        8 unreachable-answer #wpairs-1-in    8 unreachable-answer #wpairs-1-in
      WAIVED on job-payout-kb              LIVE on card-pairs-locked
        1 contrast   .w-pairs-chip-t         7 contrast   .w-mk   (same token pair, other element)

The attribution is sound; what was missing is that **nothing checked it**. Each of the four entries
now carries a machine-readable `attribution` block — `{ control, measuredAt, command, hits[{ type,
selector, onHost, controlSelector?, onControl }] }` — the four `reason` strings were rewritten off
this run, and the new `tests/job-audit-allow.test.mjs` gates all of it on every `node --test tests/`:

1. every state-scoped waiver has an attribution, with a date and a `node qa/layout-audit.mjs …`
   command, and still says ATTRIBUTED;
2. the control exists in `qa/audit-states.mjs`, is not one of the host states, and is covered by no
   state-scoped waiver of the same detector;
3. every hit is a real count on both sides and the control carries at least as many as the host;
4. **reconciliation** — when `qa/audit/report.json` is on disk AND `rep.command` is the block's own
   command, the committed counts must equal that run's, hit for hit, and every waived hit in it must
   be enumerated in some block. A waived hit in no block is a finding being hidden, and that arm is
   the one that would have caught these 47.

No browser runs in CI: `tests/final-layout.test.mjs:136` is right that the matrix must not, so the
MEASUREMENT is committed instead and the reconciliation fires the moment anyone runs the audit.

---

## 7 · player-feel — G6's four sound cues are a dead table tested against itself  (MAJOR)

True: `assert.equal(SOUND_CUES.length, 4)` plus a `deepEqual` of the same four ids. The cues have no
reader anywhere (93 files under `site/js` scanned, 0 hits; `sound.js`'s registry is
`['correct','wrong','mint','level','combo']`; the four ids appear only as `@keyframes` names in
`site/css/job.css`). The table cannot be deleted from `site/data/job.js` by this lane
(**Requests · H**), so the assertion was replaced with one that measures the app:
`the four G6 cues are DECLARED and UNBUILT` scans `site/js` and `sound.js`'s `CUES` registry and
asserts BOTH are empty of these ids — and if either half ever gains one it switches into the real
coverage test (every id registered, every id called), so half a build fails here and a finished build
fails here saying to replace it with a spy on `sound.play` through a whole job.

---

## 8 · layout-safari — the at-rest rule runs at two sizes, neither of them the narrowest  (MAJOR)

True; round 3's fix never landed. `qa/job-screen.mjs` rules 10 and 10b now share one sweep:

    const REACH_VPS = [[320, 568], [360, 740], [PHONE_W, 667], [844, 390]];   // VP_ALL's phones

and the NARROWEST is swept twice — once plain and once under `html{font-size:20px !important}`, the
text-zoom pass that exhausts the slack `syncBoardFit` converges on. The measured margin is now
printed rather than being an invisible property:

    $ node qa/job-screen.mjs --engines chromium --themes light
      at-rest reach sweep: 320x568, 360x740, 375x667, 844x390 (narrowest also at 20px text)
        tightest call row (target 0): 8px under the fold — the first call rung at 375x667
        tightest call row (target 3): 51px under the fold — the last call rung at 320x568@zoom20
        tightest getaway: 8px under the fold — CRACK at 320x568
      ALL PASS

Re-run across the whole matrix — `node qa/job-screen.mjs` (chromium AND webkit, light AND dark) —
**ALL PASS, exit 0**, with the same three margins on all four engine/theme combinations. The suite
gates it: `tests/job-screen.test.mjs`'s "J6 measured" spawns the driver and asserts `ALL PASS`, so
the two new viewports and the zoom pass are inside `node --test tests/` (72 s of it).

The finding's own measurement ("at 320x568 with 20 px text the call row sits 16 px below the fold at
rest in both engines") does NOT reproduce on this tree: at that size and that zoom the last rung has
51 px of slack. Either the screen lane's `syncBoardFit` repair landed between the two measurements or
the critic's tree differed; the rule now runs there, so the question cannot be reopened by argument.
The tightest margin anywhere is 8 px — that is the number to watch, and it is in the report.

---

## 9 · save-budget — S6 closes on three constants  (MAJOR)

True. The old arm was `500_000 + 39.6 KB < 528 KB` — 540 550.4 < 540 672, with 121.6 B of margin and
no measurement in the closing assertion. It is now a measurement on a carrier that saturates BOTH
halves at once: the study layer filled past every `store.CAPS` line and cut back by `applyCaps` (the
carrier asserts it is AT each cap), the game layer at every `CAPS.game` line, the page-label block
taken from the shipped `startPage`, and the FULL before-snapshot from `captureJobBefore`'s own field
list.

    COMPOSED S6, measured: 532.3 KB total = 493.0 KB study + 39.3 KB addition, against 528 KB
      → OVER by 4 396 chars;  study half 504 843 vs T01's 500 000 → over by 4 843

The overrun is one thing in both lines: the before-snapshot's STUDY half (its `skills` array alone is
3.6 KB of `readiness.skillStates()`) is written by the flat Page route too, so it is inside T01's
bound and does not fit there. Pinned in both directions with the flip instruction in the message, and
the old arithmetic is kept as what it is — a statement about two BOUNDS that closes only because the
study term is a bound the live carrier exceeds. This is `notes/repair-save.md` Request D, now
asserted at the TOTAL as well as at the study half.

---

## 10 · board-schedule — the five-of-five bounds are one CLOCK's  (MAJOR)

Half landed before this round (a second clock, `DELIBERATOR`, with per-clock bands). The finding asks
for "a slow answerer, a deliberator and a table-pace student", so two more clocks were added and the
sweep is now 50 saves × 4 shapes × 6 walk levels × **4 clocks = 4 800 cells**:

    clock         answer rate      decision rate   over at five of five   median   worst
    TABLE_PACE    1.00             1.00                   0 %             0.20     2.11
    SLOW_STEM     1.80–2.00        1.00                   0 %             0.78     2.69
    CLOCK         0.79–1.47        0.71–0.93             13 %             2.32     5.88
    DELIBERATOR   0.35–0.67        1.53–2.14            100 %            14.22    21.78

and at walks 0…4 every one of the four clocks is inside the band on every cell (worst 2.32).

**The bands are no longer the only claim.** The sweep now asserts the MECHANISM: order the four
clocks by how far their decision pace is from `DECISION_SECONDS` and the five-of-five miss rate is
non-decreasing, while the clock whose ANSWER pace is furthest from the table misses nothing. That is
why the residue exists — at five of five the window holds no finished job, so the decision term has
nothing to rate and falls back to the shipped table under a sentence with the student's name on it,
while the answer term still rates every walked prefix. A fifth clock can be added without touching a
band, and a change that breaks the ordering fails here naming both clocks.

---

## Requests (verify round 2)

**E · `COMPOSED-GAME.md` — three published lines are measured on Today's Page, not on the board
(doc lane).** :645 ("the game's best crew point is in the study plan's top three on **43 %** of
boards and is its exact argmax on **19 %** … mean **ρ(all) = 0.65**"), :1000 (G8's J4 row) and :1023
(G9 #5). On the board a job is drafted on they are **58 % / 20 %** for this file's own corpus, with
the honest published form being the band over 24 corpora: **top-three 61 % ± 6, argmax 29 % ± 5,
ρ(all) 0.83 ± 0.03**. Every number is asserted in `tests/job-align.test.mjs` §6.2 / §6.2b / §6.3, and
§6.2b keeps 43 % / 19 % alive under the label *Today's Page*, so the doc can quote either as long as
it says which.

**F · the rank can be bought OUTSIDE the stake (call lane).** Study sittings that are deliberately
missed with no job open move q̂ towards ½, which is where `w = 4q̂(1−q̂)` pays most; measured through
the shipped machine (8 seeds × 5 all-clean jobs, study ledgers byte-identical) that buys **+1 rank on
5 of 8 seeds** and costs 3–4 % of realised carry. The seal fixes when the history is cut, not where
it came from. Closing it means pricing the slot off evidence the student cannot manufacture for free
— e.g. weighting a slot by the STAKED history behind it — and `tests/job-exploit.test.mjs`
§`J9 · verify-2` fails the day it is closed, telling its owner to flip it to `assert.equal(rankUp, 0)`.

**G · `debriefOf().perItem` and `SPLIT.densityMinFull` count different things (econ lane).** The
debrief prints 2.42–2.67 decisions per graded item on the full-use path; the published floor is 3 and
is computed by charging each brief window its options. Either charge the window its options in
`econ.decisionCount`'s counterpart inside `debriefOf`, or restate `densityMinFull` as the floor for
the count the student is actually shown. `tests/job-split.test.mjs` §`G9 #1, MEASURED` asserts both
counts and fails the day they converge.

**H · `SOUND_CUES` is a table with no reader (data/job.js owner, or the screen lane).** Four cues
declared, zero readers under `site/js`, none of the four ids in `sound.js`'s `CUES` registry, and
`site/data/job.js:871`'s comment still reads "G6 — four sound cues, off by default" in the present
tense. Either build them (and `tests/job-juice.test.mjs` will demand a `sound.play` spy through a
whole job) or delete the table and the comment. COMPOSED-GAME.md:1030 already discloses they were
never built, so this is a dead table, not a false claim.

**I · the pairs widget's geometry is still a study-layer BLOCKER (study / css owners).** Unchanged
from Requests · C last round, and now machine-gated: 44 live BLOCKERs on `card-pairs-kb` and 9 MAJORs
on `card-pairs-locked`, of which 8 `unreachable-answer` on `input#wpairs-1-in` are reachable INSIDE a
job. `tests/job-audit-allow.test.mjs` will not let the attribution drift, but only the widget's owner
can retire it.

---

## THE SUITE

    node --test tests/     BEFORE   2920 · 2916 pass · 0 fail · 4 skipped · EXIT 0   (297 s)
    node --test tests/     AFTER    2991 · 2982 pass · 5 fail · 4 skipped · EXIT 1   (317 s)

**+71 tests; the five failures are in five arms this lane did not write, in four files whose SOURCE
was being rewritten by other lanes during the run** (`site/js/job/econ.js`, `guard.js`, `board.js`,
`site/js/screens/job.js` — mtimes 06:19–06:41, inside the ten minutes of the run). Told apart by
A/B rather than by assertion, the way this lane's round-1 note did it:

* the ten files this round touched, run alone at the end: **8 of 10 at 0 fail** —
  `job-align 53/53 · job-split 37/37 · job-juice 35/35 · job-save 70/70 · job-board 106/106 ·
  job-audit-allow 4/4 · job-call 121/121 · run-lane-r2 17/17`;
* **`tests/job-exploit.test.mjs`** — the two red arms are `:215` (*the guard multiplies both
  branches too*) and `:1786` (*the ×1.25 is worth a QUARTER*), both pre-existing, both reading
  `econ.carryFor` / `econ.tellFor` / `econ.guardMultFor`. With this round's two added arms STRIPPED
  and the rest of the file run unchanged: **the same two arms fail, at the same lines** (57 tests,
  55 pass, 2 fail) — the additions are not implicated, and they pass in both runs;
* **`tests/job-econ.test.mjs`** — three red arms (`:476` and two J1 carry-ladder arms). The version
  of that file at `git show HEAD` fails **17** against the same tree; the working-tree version fails
  3. The file is being repaired by its own lane against an economy that is still moving, and this
  round's edit to it is a comment and two assertion MESSAGES at `:1626`, hundreds of lines away;
* `tests/job-monotone.test.mjs` ×2 and `tests/job-screen.test.mjs` `:1204` are the same economy and
  `screens/job.js` respectively; neither file was touched this round.

Nothing here was adjusted to chase those, and nothing was skipped or weakened to get green.

    files edited        tests/job-align.test.mjs      corpusOf → the DRAFTED board; §6.2 re-measured;
                                                      +§6.2b (the page slice, labelled); +§6.3 the
                                                      neighbourhood as a distribution        (+2 tests)
                        tests/job-exploit.test.mjs    +J9 verify-2: grading with no job open  (+2)
                        tests/job-call.test.mjs       +§6b Called 5 reached by honest play    (+1)
                        tests/job-split.test.mjs      +G9 #1 MEASURED on every shape          (+1)
                        tests/job-econ.test.mjs       the two density lines relabelled as the table's
                                                      own arithmetic; SOUND_CUES comment      (+0)
                        tests/job-juice.test.mjs      the sound-cue self-comparison → a wiring scan (+0)
                        tests/job-save.test.mjs       S6 closed on a measured save            (+1)
                        tests/job-board.test.mjs      +TABLE_PACE and SLOW_STEM clocks; the
                                                      five-of-five mechanism assertion        (+0)
                        tests/run-lane-r2.test.mjs    the hatch renamed + measured on two
                                                      populations                             (+2)
                        tests/job-audit-allow.test.mjs   NEW — the attributed waivers, gated   (+4)
    harness             qa/job-screen.mjs             one REACH_VPS sweep for rules 10 and 10b,
                                                      320x568 and 360x740 added, a 20px-text pass at
                                                      the narrowest, the measured slack printed
                        qa/audit-allow.json           four `attribution` blocks, four reasons
                                                      re-measured off the run that produced them

---
---

# tests — VERIFY ROUND 3 (the fixer for the `tests` lane)

Lane: `tests/job-*.test.mjs`. **No file under `site/`, `qa/` or `designs/` was edited by this pass**,
and `COMPOSED-GAME.md` was not edited either. Four findings, all MAJOR, all from independent critics.
Three are closed at the root in this lane; the fourth is closed on the half this lane owns (the false
citation) and filed with its measurement for the two files that own the rest.

| # | critic | file | verdict |
|---|---|---|---|
| 1 | split-honesty | `tests/job-board.test.mjs` | **FIXED** — the arm rebuilt in two registers over 1 400 cells |
| 2 | test-integrity | `tests/job-meta-constants.test.mjs` | **FIXED** — the disjunction collapsed, two controls added |
| 3 | test-integrity | `tests/job-audit-allow.test.mjs` | **FIXED** — the reconciler made a pure function, five controls |
| 4 | layout-safari | `qa/job-screen.mjs` | **PART-FIXED in lane** — citation corrected and pinned; CSS + harness filed as Requests |

---

## 1 · MAJOR — `worst <= 20` under a name that certified the criterion  (split-honesty)

**Confirmed, and worse than the finding says.** The arm at `tests/job-board.test.mjs` ran ONE corpus
save (`CORPUS[1]`), one shape, seven clocks, and closed on `assert.ok(worst <= 20)` — four times
`SPLIT.agreeWithinPoints = 5` — under a name ending *no table under "your last 5 jobs"*. Swept to the
50-save corpus × 4 shapes × 7 flat clocks the worst is **20.96**, not 18.3: `CORPUS[1]` was not a hard
case, it was one case.

**What the rebuilt arm asserts.** Mid-pass the board lane landed the other half of this finding in
`site/js/job/board.js` — `personalRates` now reports `bounded` per term and `projectFor` demotes a
line whose pooled rate IS a clamp bound to `projected` (board.js:772-780). So the register selector
is the board's own label, exactly as in the adjacent walk arm, and the arm no longer has to invent
one. Re-measured against that build:

    s/stem   ledger   worst    projected   over %   median   worst    answer rate lo–hi
       40      200     0.52        0          —        —        —      0.308 – 0.889
       25      200     0.50        0          —        —        —      0.192 – 0.556
       20      197     0.66        3        0.0      1.59     2.17     0.167 – 0.444
       15      171     0.54       29       31.0      3.23     8.74     0.167 – 0.333
       12      105     0.54       95       32.6      2.45    13.41     0.167 – 0.267
       10       44     0.50      156       44.2      4.66    16.90     0.167 – 0.222
        8        3     0.41      197       79.2      7.95    20.96     0.167 – 0.178

    LEDGER    920 cells — 0 outside SPLIT.agreeWithinPoints, worst 0.66
    PROJECTED 480 cells — 55.2 % over, median 5.57, p90 12.45, worst 20.96

* **per cell on every `ledger` line**, at `SPLIT.agreeWithinPoints` itself — never a multiple of it;
* **a distribution per clock** on the demoted lines, `over % / median / worst`, with the clock beside
  it, and only `worst` on a row of fewer than 20 cells (a share over 3 cells is noise, and the arm
  says so rather than pretending otherwise). WHICH clock a flat student starts saturating at is the
  estimator's business, so the arm pins the ladder's SHAPE — the clamp may not bind at all at 40 or
  25 s/stem, it MUST bind at 10 and 8, the demoted share is monotone in the clock, and the register
  carries > 100 cells — rather than demanding that the three-cell 20 s row keep existing;
* **the label is the mechanism**, asserted per cell: `projectionSource === 'projected'` ⟺
  `bounded.answer || bounded.decision`, 1 400 of 1 400, 0 disagreements. Without this the two
  registers would be a classification this test invented rather than the one the student sees;
* nothing is dropped, still per cell: `n.answer === n.decision === 5`, the rate inside the clamp and
  under 1, at every clock — the round-1 fix, unchanged;
* monotone in the clock, on the share demoted AND on the p90 of every cell, which is the "no cliff"
  claim the old single-save `gaps[k] >= gaps[k-1] - 1.5` was making on seven points.

The name now states which register it asserts where. `tests/job-meta-constants.test.mjs` §G captures
the WALK arm by its own prefix and reads its three literals by regex; this arm deliberately avoids
those three expression shapes so that §G keeps capturing the walk arm and not this one.

**Also fixed in the same file, because the state lane tripped it mid-pass.** The tripwire at
`:2578` (`queueTargets === undefined` / `postedAnswered === undefined`, message "state.js now records
the queue length — read it") fired at 09:41 and un-fired by 09:49: the state lane added `queueTargets`
and `calls` to the log row, `tests/job-save.test.mjs` went red on the 30-row budget (+29 B a row,
+870 B), and the fields came back off. A pair of `undefined` assertions cannot tell *not written yet*
from *written and reverted*. The row's SHAPE is pinned instead — the exact set of optional fields the
entry carries — and the value assertions for each field sit under that pin, so they can never go
vacuous and an arrival or a departure fails with the list either way.

The rest of that sequence, for the record, because it is the pin working as intended: at 10:00 the
state lane landed `queueTargets` for good, byte-neutral (it pays for itself by rounding the log's own
copy of `rating` to 4 dp), and updated the pin in place from `[]` to `['queueTargets']` with the
measurement beside it. `calls` is still out at 11 B a row against 320 B of headroom; `postedAnswered`
is REFUTED by the board lane's own measurement and must never arrive. Three states in one hour, and
each one failed loudly with the field list rather than passing quietly on `undefined`.

---

## 2 · MAJOR — the S1.3(2) lint could not fail  (test-integrity)

**Confirmed exactly as reported.** The `COMPOSED-GAME.md` half was a disjunction whose `else` branch
demanded three strings, and a repair note that quotes both the withdrawn sentence and its replacement
carries all three for ever:

    $ for s in "Spec corrections" "first-try rate on that make over the trailing 10 attempts" \
               "CLEAR rate on that make over the trailing 10 sittings"; do
        grep -c -- "$s" notes/repair-tests.md; done
    1
    1
    1

So the branch was satisfied unconditionally and the document was free. The arm's own comment ("the
document still carries the first-try reading today") had also gone stale — the doc lane landed the
correction at COMPOSED-GAME.md:433 — which is why nobody noticed the pin had never armed.

**Fixed.**

* `COMPOSED-GAME.md` joins `settings.js` / `stats.js` / `trophies.js` / `data/job.js` in the same
  file loop, raw and after `prose()`. That is what §S1.3(2) asked for in the first place: *no*
  occurrence of `first-try rate` anywhere in the scanned set, one rule over one set.
* The disjunction is gone. What is left is the POSITIVE half — the corrected sentence must be
  present, so a silent deletion is not a way past the ban — plus **two negative controls** that run
  the real predicate over a mutated copy of the real document: the exact revert the critic performed
  (flagged on both counts) and the quiet deletion (flagged on one). Without them the arm would again
  prove only that a phrase is absent from a file it is absent from.
* **No note is read any more.** A pin whose truth condition is a string in a permanent document is
  the defect, not a lesser form of it. The `LANDED`/`OPEN` marker idea in the finding's suggested fix
  has the same failure mode one step later, so it was not built.
* **The class, without widening a lint.** The suggestion to add `first-try rate` to arm B's
  `WITHDRAWN` list cannot be taken as written: arm B requires a withdrawn phrase to be PRESENT and
  retracted within reading distance, and the strict ban above requires it to be absent. The document
  keeps the withdrawal on record in its own words — COMPOSED-GAME.md:433's parenthetical and the
  bullet at :1150 both say "the first-attempt rate over the trailing 10 attempts" — and those two
  sites are genuine retractions written in idioms `RETRACTS` does not carry ("It was published as
  …, which is a different event"). Adding them would mean widening the retraction vocabulary of a
  lint whose whole value is that it is narrow. Instead the class is covered with no vocabulary at
  all: **every** occurrence in the document of the phrase family `<word> rate on that make over the
  trailing <n> <unit>` must read `CLEAR 10 sittings`. That catches a bare re-assertion of the
  definition anywhere, in either phrasing, and it is green today.

### Spec corrections — LANDED

The §S1.3(2) correction recorded by the previous pass is **landed** in the document and is now gated
strictly rather than by a note. Recorded for the audit trail only; nothing reads this section.

    OLD  `q̂` = your first-try rate on that make over the trailing 10 attempts.
    NEW  `q̂` = your **CLEAR rate on that make over the trailing 10 sittings** — the same event
         `econ.settle` prices, so one button forecasts one event.

---

## 3 · MAJOR — the RECONCILIATION arm had never run  (test-integrity)

**Confirmed, all three gates.** Reproduced against the report on disk: `checked = 0` for all four
attributed waivers, so 130 waived findings on `job-answer-kb` / `job-payout-kb` were compared with
nothing. The three independent causes:

  (a) `covered.has(s)` was exact membership in `rep.config.only`, while `qa/layout-audit.mjs:1318`
      treats `--only` as a PREFIX list. A report from the layer's own acceptance command
      (`--only job`, notes/J6.md) has `config.only = ['job']`, so `covered.has('job-answer-kb')` was
      false and every host dropped out — the gate could not fire on the one command it exists to gate;
  (b) the command check was exact string equality, so any other run skipped in silence;
  (c) `qa/audit/report.json` is gitignored, so on a fresh checkout and in CI the arm was dead by
      construction, leaving three structural arms over hand-written JSON.

**Fixed.** `reconcile(report, blocks)` is now a pure function and every block lands in exactly one of
`compared` / `notComparable` / `outOfScope`, with the reason on the record:

* **prefix matching**, identical to `layout-audit.mjs`'s own `--only` semantics;
* **presence and orphans run on ANY report that covers a host state**, whatever command produced it —
  both are set operations on `(state, type, selector)` and do not depend on the matrix. Against the
  report on disk that is 130 of 130 waived rows matched to an enumerated hit, **0 orphans**, and all
  nine hits still live. Under the old arm both of these sat behind `if (!checked) return;`;
* **counts only against a comparable matrix** — `config.engines`, `config.themes`, `config.vpSpec`,
  the three axes a detector runs per. `--only` is deliberately not one of them: it decides which
  states are visited, never how many times a defect fires inside one;
* **a comparable report that compares nothing is a FAILURE**, not a `return`; an incomparable one is
  refused **by name**, printing both commands, which is what the run currently on disk gets:

        offscreen: counts not reconciled — the block was measured by
            node qa/layout-audit.mjs --only job-answer-kb,job-payout-kb,card-pairs-kb,card-pairs-locked --engine chromium --theme light --vp phone
          and the report on disk is
            node qa/layout-audit.mjs --only job,run,home --engine both --no-confirm

* **five synthetic controls** built out of the committed attribution itself, which run on every
  `node --test tests/` with no browser and no report on disk — the answer to (c). They assert that
  the function reconciles a `--only job` report by prefix, names a hidden waived hit as an orphan,
  catches a count that has drifted by one on the host AND on the control, refuses a wider matrix by
  name while still orphan-checking it, and reports a hit the run no longer produces as ABSENT.

Measured, and worth recording: filtering the on-disk report down to the attribution's own matrix does
**not** reproduce its counts (`unreachable-answer input#wpairs-1-in`: 8 claimed, 5 under a
chromium/light/phone filter, 6 without the viewport filter). That is why the compatibility check
refuses rather than filters — `qa/audit-states.mjs` gives these states their own `vps` (`VP_KB`),
which `--vp` does not override, so a filtered wide run is not the narrow run.

---

## 4 · MAJOR — the `--kb` net is one viewport wide  (layout-safari)

**Confirmed on the half this lane can measure, and the contradiction settled against the comment.**

`qa/job-screen.mjs:996-998` says the keyboard is up at the payout beat "because tapping submit does
not blur the field". `qa/audit-states.mjs:979-1004` says `card.js lockAll()` runs first and there is
nothing focused for a keyboard to be open for — and it THROWS if a field is still editable when it
gets there. The code settles it and `audit-states` is right:

    site/js/screens/card.js lockAll()   →  e.w.lock(true) on every entry, then contBtn.focus()

`site/css/job.css:623` carries the same refuted belief in writing ("`screens/card.js` never blurs on
grade"). So rule 6's keyboard pass is a CONSERVATIVE check of a state the student is not in — worth
running, not worth believing a reason for.

**In lane, fixed.** `tests/job-screen.test.mjs:240` used to end "(qa/job-screen.mjs rule 6 measures
this)", full stop, over a rule whose loop is `[[667, false], [812, false], [667, true]]` at
`PHONE_W`. The citation now states its scope, and a new arm PINS it by reading the harness rather
than describing it: the keyboard pass's covered viewports are parsed out of rule 6's own loop
literal, `REACH_VPS` out of its own declaration, and the uncovered list — `320x568`, `360x740`,
`844x390` — **may only shrink**. The same arm asserts that `job-payout-kb` forces `--kb: 0px`, so
rule 6's third pass really is the only keyboard-open measurement of this beat in the repo, which is
what makes the coverage number load-bearing.

**Requests (not this lane's files).**

* **`qa/job-screen.mjs` (screen lane).** Correct rule 6's comment — the app closes the keyboard
  itself — and run the keyboard pass at every width in the file's own `REACH_VPS`, not at `PHONE_W`
  alone. When it covers a width, delete that width from `KNOWN_UNCOVERED` in
  `tests/job-screen.test.mjs` in the same edit; the arm is written to go red and say so.
* **`site/css/job.css` (screen lane).** Delete the "never blurs on grade" clause, and give
  `.job-beat` a shrink path — drop the chain/ladder rows into the ledger line — when
  `100dvh - var(--kb)` is under the beat's own height. layout-safari's measurement at 320x568 with
  the repo's own `KB_PX` (336): band 232 px, beat 221 px, beat top −38 px, and 25 of the payout
  line's 45 px clipped off the TOP. No `bottom` offset can fit a 221 px box in a 232 px band once
  the dock is under it, so adding `--kb` moved that failure from below the fold to above the top
  edge. 320x568 is `qa/layout-audit.mjs` VP_ALL row 1 and `qa/audit-states.mjs` VP_KB row 4.
* **`qa/audit-states.mjs` (audit lane), secondary.** `job-payout-kb`'s "no editable field at the
  beat" is asserted on ONE target — the pairs card it walks to — and `card.js lockAll()` swallows
  per-widget failures (`catch { /* proxy */ }`, card.js:1023). A widget whose `lock()` throws would
  leave a live field and no state would see it.
* **`qa/audit-allow.json` (audit lane).** `hits[].byConfig`, so the acceptance command's own counts
  are committed too and land in the reconciler's `compared` branch instead of its `notComparable`
  one. Today the only reconcilable report is one nobody has a reason to produce.

---

## THE SUITE

    BASELINE (mine, 09:35, before any edit)   2995 tests · 2991 pass · 0 fail · 4 skipped · EXIT 0
    FINAL    (10:38)                          3073 tests · 3069 pass · 0 fail · 4 skipped · EXIT 0

The ticket's stated baseline (2725 / 2721) is three rounds stale; 2995 is what the tree measured when
this pass started. **+78 tests over the pass, of which this lane added 7** — the rest are the six
other lanes landing at the same time. Nothing was deleted, skipped or weakened.

    files edited   tests/job-board.test.mjs          the clamp arm rebuilt in two registers over
                                                     1 400 cells; the log-row tripwire re-armed as a
                                                     SHAPE pin                              (+0 tests)
                   tests/job-meta-constants.test.mjs the S1.3(2) disjunction collapsed; COMPOSED-GAME.md
                                                     added to the phrase loop; two negative controls;
                                                     the q̂-definition class rule            (+0 tests)
                   tests/job-audit-allow.test.mjs    `reconcile()` extracted as a pure function;
                                                     prefix + matrix compatibility; presence and
                                                     orphans unconditional; five controls    (+5 tests)
                   tests/job-screen.test.mjs         the `--kb` citation corrected and its coverage
                                                     pinned off the harness source           (+1 test)
                   notes/repair-tests.md             this section
    files NOT edited   anything under site/, qa/ or designs/, and COMPOSED-GAME.md.

**A note on running the suite in this tree today.** Six lanes were landing while this pass ran, and
three arms went red and green again underneath it without anything in this lane changing:
`tests/job-board.test.mjs` §the toll line (the board lane moved `sharedLine` to the printed-rows
basis at 09:59), `:3226` TABLE_PACE, and `tests/job-week.test.mjs:1335` — all three transient,
mid-write snapshots of `site/js/job/board.js`. Every one of them was re-run alone after the lane
settled. Also: `/private/tmp/.../scratchpad/` is SHARED between the lanes, not per session — two
lanes writing `full3.txt` interleaved their output into one file and produced a summary block that
read `fail 0` next to a `✖ failing tests:` list. The run above is written to a uniquely named file
for that reason, and its exit code is its own.
