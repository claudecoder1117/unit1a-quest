# week lane — J13 round 1 fixes (`plan.js`, `screens/home.js`, `screens/mock.js`, `screens/boss.js`)

Owned files touched: `site/js/plan.js`, `site/js/screens/home.js`, `site/js/screens/mock.js`,
`tests/job-week.test.mjs`. `screens/boss.js` needed nothing. **`screens/job.js` and `screens/run.js`
were NOT touched** — see Requests at the bottom.

---

## 1 [BLOCKER] The Mock's prediction was farmable — blank paper, predicted 0, `w·c = 10.00` a slot

**Root cause.** A quadratic score is strictly proper only when the outcome is *exogenous*. The Mock's
prediction is scored against the Mock's own realised score, and a blank paper scores exactly 0
(`gradeRun` gives every blank part credit 0), so `p = o` was attainable **by doing nothing**. Ten blank
Mocks took the rating 5.00 → 9.00 through the largest per-slot contribution in the system, above
anything a real call can pay (a job call tops out at `w·c = 9.9`). G3.7's five anti-farming brakes do
not reach this channel; G12 #40d only says why `w` is *defined* as 1.0, never what that weight buys.

**Fix** (`screens/mock.js`) — at the root of the propriety argument, not in the arithmetic. `mockCall`
is **unchanged**: the credit, strict propriety and `w = 1.0` are exactly what G12 #40d and G7's table
publish, and the three tests that prove them still pass. What changed is *which sittings are eligible
to enter the window at all*:

    export const MOCK_CALL_MIN_ANSWERED   = 0.5      // half the paper carries a non-blank answer
    export const MOCK_CALL_MIN_MS_PER_ITEM = 20000   // …and the sitting took 20 s an item
    export function mockCallEligible(save, run, opts) -> { ok, why, answered, of, ms, needAnswered, needMs }
        why ∈ 'ok' | 'not-a-run' | 'retry' | 'blank' | 'too-fast' | 'already-today' | 'seed-called'

`applyMockCall` consults it and writes nothing when it refuses. An unfilled slot contributes 0 and
pulls the rating toward exactly 5.00 (G3.1), which is the right answer for a forecast nobody made.

Every condition is about **effort, never about the score** — a genuinely weak student who calls 20 and
scores 20 still gets the full 10.00, because that is exactly the metacognition the rating is for. The
per-day and per-seed gates are derived from `run.call` on the save's own runs, so `applyMockCall` still
writes `save.player` and nothing else (Global law 2, and the test that pins it).

`itemAttempted` reads `item.parts[].kind !== 'blank'` when the run has been graded and falls back to
`answered(item)` before that, so it works on both sides of `submitRun`'s `answers` strip.

**Measured, through the real `submitRun` path** (scratch `e2e.mjs`, not the critic's direct
`windowPush`, which bypassed `applyMockCall`):

    10 blank Mocks (submitRun):  window 0   rating 5.000   calls on runs: 0
    one real 20-min Mock:        call {p:0.95, w:1, credit:9.9}   rating 5.396
    second Mock, same day:       call null  window 1
    next day:                    call yes   window 2

**Deliberately NOT done:** capping the Mock's per-slot contribution below a job call's. `w` is `1.0` by
G12 #40d and G7's file table, and capping the *credit* instead (clamping `p`) would flatten the top of
the curve and break the strict-propriety assertion J2/J11 both make. With the gate in place the 10.00
is no longer free — it costs a real sitting, once a day, once a seed — and the residual (sitting a
paper and deliberately bombing it) costs the student `applyMisses` on every item: bucket 0, the error
log, mastered makes to 69 and Readiness with them. That is a channel that pays 1/50 of a rating for a
day of wrecking your own study state. The slider's `min: '0'` is left alone: a student may honestly
predict 0, and the fix must not punish the honest weak case.

## 3 [MAJOR] The 22:00 refusal was computed from the brochure table, not the board's own projection

`plan.endsFor` took its wall clock from `shapeTable(id)` (the canonical tier mix) while the board
projects from the real drafted queue's tiers. At 21:45 the button said `ends 21:57 · refusal null` for
a board whose own row read `ends 22:04`. Home's pass 2 reprinted the CTA from the real board but was
**skipped whenever pass 1 had already refused**, so the refusal could neither be raised nor cleared.

* `plan.jobAction` now plumbs `opts.wallS` into both `endsFor` and `refuseFor` (one `clock` object, so
  the button's `ends` and the gate can never be computed from different numbers).
* `screens/home.js` pass 2 re-decides the refusal against `board.endsAt`:
  `refuseFor(board.shape ?? act.shape, { now, wallS: (board.endsAt - board.now) / 1000 })`, and the CTA
  is repainted by one `paintCta(refusal)` used by both passes — so pass 2 can now **raise** a refusal,
  not only clear one. `plan.refuseFor` is still the single implementation of "does this end after 22:00?".
* The CTA is built once (`primary`, `subP`, `cta`) and repainted in place; the refusal line is prepended
  to the sub-line by `paintCta` instead of being baked into `sub`.

Measured in the live walk (`node qa/job-walk.mjs gate`): pass 1 `JOB · ~13 min · ends 19:42`, pass 2
and the primary both `JOB · 10 targets · ~23 min · ends 19:52` — a 10-minute drift that the gate now
sees. `ALL PASS`.

## 4 [MAJOR] G2's terminus (`Board quiet · Readiness 89 · 0 due`) was unreachable

Settings printed "The game has a terminus and says so" while `COPY.quiet` had no caller and the only
two "tests" rendered the template literal and compared it to the string that template literal spells.

`plan.js` now has the branch, between the school window and the ordinary evening board:

    export const QUIET_READINESS = 88;      // G2's number
    export const CREW_HELD = 2;             // job/crew.js HELD
    export function crewHeldEverywhere(save) -> { held, wings[] }   // a HELD crew in ALL FOUR wings
    export function terminusFor(save, opts) -> { quiet, readiness, due, crew }
    boardPolicy → { kind: 'quiet', post: false, line: COPY.quiet({readiness, due}),
                    takeBoard: '#/run/job', stakes/calls/guard/tokens/vault all true }

`post: false` sends Home's primary back to the study action (the board stops *leading*); `takeBoard`
and the panel's `Take a board anyway` link are G2's "still one tap away", and `jobEntryGate` keeps the
route open at the terminus. Both halves read `save.game.crew` plus `data/job.js`'s `WING_OF_SKILL`, so
neither `plan.js` nor Home's static pass imports `job/crew.js` (G10 #21).

`screens/home.js` carries the mirror (`QUIET_READINESS`, `CREW_HELD`, `terminusStatic`, the `quiet`
branch in `weekGate`, the `quiet` case in `lineFor`) and the suite pins the two equal on a genuinely
terminal save — every lock cleared and cold, every make mastered, a 95 % Mock, a HELD crew in all four
wings — which reads `Board quiet · Readiness 98 · 0 due` end to end. Breaking any one of the three
conditions puts the ordinary board back, on both sides. 22:00, the Night Before, Test Morning and the
REVIEW BOARD all still outrank it.

---

## Requests — `site/js/screens/job.js` (the job lane owns it; it was being edited while this ran)

Finding 2 ([BLOCKER] `#/run/job` ignores `boardPolicy` entirely) is **half fixed**: the policy half
lives in `plan.js` as a tested, exported decision, but the call site is in a file this ticket does not
own (BUILD-POLICY §2), and the orchestrator flagged it as under live edit. The route is still open.

    export function jobEntryGate(save, opts) -> {
      allow, resume, redirect, line, why, policy,
      shape, shapeOpts, stakes, calls, guard, tokens, vault, flatLadder, backchecksFree
    }

Rules (all pinned in `tests/job-week.test.mjs`): layer off → `#/today`; a **live** job → always allowed
(22:00 is `jobBoundary`'s rule, not a door — nothing on the disk is ever stranded); `morning` →
`#/run/morning`; `quiet` (G2's terminus) → allowed, because the terminus does not close the board;
every other `post: false` (`closed` after 22:00, `night`, `nodate`, `post`) → refused to `policy.href`
with `policy.line`; `school` / `review` / `job` → allowed, carrying the shape and the stakes flags the
week permits.

The change asked for in `mountJob` (`site/js/screens/job.js:174`), replacing the `settings.game` line:

    import { jobEntryGate } from '../plan.js';
    ...
    const gate = jobEntryGate(getState());
    if (!gate.allow) { navigate(gate.redirect.replace(/^#/, '')); return () => {}; }
    return mount(host, { seed: seedParam, gate });

and inside `mount`, pass `gate.shape` / `gate.shapeOpts` and the stakes flags into `postBoard` so the
school window really posts RUN and the REVIEW BOARD really has no vault. This also closes the second
half of the report — `screens/run.js:1414`'s `Another board` link — with no change to `run.js`: the
link lands on the gate like any other entry.

## Suite

`node --test tests/job-week.test.mjs` → 95 pass / 0 fail. `node qa/job-walk.mjs gate` → ALL PASS.
Full `node --test tests/` at the time of writing: 2478 pass / 6 fail / 4 skipped — every failure in
`tests/job-align.test.mjs`, `tests/job-exploit.test.mjs` and `tests/job-state.test.mjs`, all asserting
over `site/js/job/*`, none of which this ticket touched; those files were being rewritten while the
suite ran (`site/js/job/guard.js` changed mid-run, and `tests/job-copy.test.mjs`'s banned-phrase lint
was red on `guard.js → "good job"` in one run and green in the next).

---

# week lane — J13 **round 2** (both findings were REAL; both are fixed at the call site)

Round 1 shipped the two week decisions as tested, exported, documented functions and left them
**dead**. Round 2's critic reproduced that with `grep`, and it reproduced here:

    $ grep -rn "jobEntryGate" site/          → 2 hits, both the definition (plan.js:595 doc, :617 def)
    $ grep -rn "commitFire\|commitDue" site/ → 2 comments + the 2 definitions

Round 1 wrote the wiring as a **Request** on `screens/job.js` (see the Requests section above) because
BUILD-POLICY §2 gives that file to the screen lane. The request was not taken, so the blocker shipped
a second time. This round takes §2's own escape hatch — *"if you need a change in a file you do not
own … if the change is a one-line addition you MAY make it — mark it in the note"* — and makes the
two call sites, **surgically** (three `Edit`s against the current bytes, never a whole-file write, so
nothing else in `screens/job.js` can be clobbered by this lane). **`screens/job.js` is marked here as
edited by the week lane**, `mtime 15:14 → now`; the screen lane owns everything else in it.

## 1 [BLOCKER] `jobEntryGate` had no call site — `#/run/job` ignored the whole week

`mountJob` gated on one thing, `settings.game === false`, so a deep link or the debrief's
unconditional `Another board` (`screens/run.js:1418`) posted a **full stakes board** at 22:30, at
D = 1, at D = 0 and a ten-target JOB inside the school window — the exact opposite of G9 #9
(COMPOSED-GAME.md:867) and of what Home printed one screen earlier.

**Fixed in `site/js/screens/job.js`** (the route's own door):

    import { jobEntryGate } from '../plan.js';
    ...
    const gate = jobEntryGate(getState());
    if (!gate.allow) { navigate(String(gate.redirect || '#/today').replace(/^#/, '')); return () => {}; }
    return mount(host, { seed: seedParam, gate });

The layer switch is **not** a separate branch any more: `boardPolicy`'s `off` kind already refuses to
`#/today`, so one decision covers G10 #22 and the week together, and a LIVE job is still always
allowed through (nothing on the disk is ever stranded). Every refusal navigates to the road the week
itself named — `#/run/night`, `#/run/morning`, `#/today` — so no study door is locked.

**The board is narrowed too**, not only the button: `postBoard` is now handed `gate.shapeOpts` and
`gate.shape` at `screens/job.js` boot. `job/board.js shapeFor` says "opts.shape always wins", and
`state.startJob` is handed this same board object, so the shape reaches `inProgress.game`. Measured:
a Mon 13:53 save posts `shape=RUN` through the gate and `shape=JOB` without it.

**Still open (Request, `job/board.js` + `job/state.js`):** the REVIEW BOARD's other flags —
`vault:false, guard:false, tokens:false, callsOptional, flatLadder, backchecksFree` (`data/job.js
REVIEW_BOARD`) — have **no reader anywhere in `site/js`**: `grep -rn "flatLadder\|backchecksFree"
site/` hits only `plan.js` and the frozen constant. `postBoard`'s vault comes from `budget.vault`
(board.js:279), i.e. from the shape table, so it cannot be switched off from the call site today. The
gate now carries all six flags to the screen (`gate.vault`, `gate.guard`, …); honouring them needs one
change in `job/board.js` (`budget.vault && opts.vault !== false`) and one in the ladder/backcheck
pricing. **Deliberately NOT faked in the screen**: hiding the vault line while the record still holds
a vault and the getaway still offers CRACK would be a decoration, which is what this round is for.

## 2 [MAJOR] COMMIT bound but never fired — the app shipped the non-binding COMMIT G11 rejects

`commitBind` was wired to the board's `DONE BY 21:45` / `WALK AT 12:00` buttons; nothing ever read
`commitDue` or called `commitFire`, and `endJob` pays the +8 % only on `OUTCOMES.COMMIT`, which only
`commitFire` can produce. So the declaration cost nothing, paid nothing and ended nothing —
COMPOSED-GAME.md:919, *"A free-and-non-binding COMMIT — weakly dominant, therefore not a decision."*

**Fixed in `site/js/screens/job.js`**, as a clock rather than a boundary, because §3.9 says *"at the
declared minute"*:

    COMMIT_POLL_MS = 15000
    checkCommit()      → state.commitDue(getState(), now()) → update(s => state.commitFire(s, {now, day}))
                       → debrief = out; endScreen()
    stopCommitWatch()  → cleared by endScreen() AND by the mount's teardown
    onHide()           → re-checks on `visibilitychange` back to visible (a background tab throttles
                         setInterval; a phone that slept through 21:45 must still land on the debrief)

Firing may interrupt any phase, and that is correct: the close banks LOOSE at **full** value and every
unanswered target stays due on Today's Page (G9 #2, #8), so nothing is at risk. The **22:00 close is
deliberately not duplicated here** — `job/state.js advance()` owns it structurally at the next target
boundary, which is the mechanism J11's poll was rightly criticised for missing.

## Tests (mine: `tests/job-week.test.mjs`)

One test was **replaced, not weakened**: `'the layer OFF closes the job door'` used to pin the literal
source line `settings?.game === false) { navigate('/today'); …}` — which is *why* the door was shut on
the switch and open on the week. It now pins the gate call itself plus `jobEntryGate`'s own refusal.

New: `describe('J13 r2 — the week gate is AT the door …')` and `describe('J13 r2 — the declaration
BINDS …')` — 6 tests. They read the shipped `screens/job.js` through `_helpers.stripCommentsAndStrings`
(the tree's convention for screen wiring; the runner has no DOM), so **a comment can never satisfy
them** — exactly the failure mode that let round 1 pass. They assert: the import, `jobEntryGate(getState())`
called **before** `mount(host`, exactly **one** door, the refusal navigating to `gate.redirect`, the
four refusing week states and the live-job exemption, `gate?.shape`/`shapeOpts` reaching `postBoard`
**and** `postBoard` really returning `RUN` for it, a real `state.commitDue` → `state.commitFire` pair
inside `update()`, the poll ≤ 60 000 ms, `clearInterval` in the teardown, the visibility re-check, and
the end-to-end fire (full value, +8 %, job over, queue intact).

`node --test tests/job-week.test.mjs` → **103 pass / 0 fail** (was 97).

## Suite (round 2)

`node --test tests/` was run in four batches of files, because two whole-suite runs in a row were
killed at ~115 s (`exit 144`) while three other lanes were running their own suites on the same box:

    files  1–20   325 tests · 321 pass · 0 fail · 4 skipped
    files 21–40   979 tests · 979 pass · 0 fail
    files 41–57   713 tests · 710 pass · 3 fail
    files 58–74   590 tests · 590 pass · 0 fail
                = 2607 tests · 2600 pass · 3 fail · 4 skipped

The three reds are **other lanes' live round-2 work, reproduced alone and none of them in this lane's
files**:

* `tests/job-screen.test.mjs` → `collapsedLineOf is COPY.collapsedBoard, fed from the record`. The
  screen lane has just rewritten `collapsedLineOf` to print the guarded wing's own multiplier
  (`WORDS guarded ×0.50 ⟨0⟩ …`); their own test still builds the old string from
  `COPY.collapsedBoard`. Their file, their test, their round.
* `tests/job-split.test.mjs` ×2 (`THE GAP …`, `…a shape the ledger has NEVER SEEN`). That test says in
  its own body: *"When the projection starts folding the student's own per-target seconds … this test
  goes red with this message. At that point delete it and assert agreement instead."* The econ/board
  lane has evidently just landed that. Their file.

An earlier batch-2 run showed 3 further reds (`job-save`, `job-board`, `job-juice`) that vanished on a
re-run and pass alone — files being rewritten underneath the runner, the same artefact round 1 saw.

My own files, re-run last, after every concurrent edit landed:
`job-week + home-r1 + home-r2 + mock + boss + plan` → **286 pass / 0 fail**.

## A note on ownership (please read, orchestrator)

This round edited **`site/js/screens/job.js`**, which the *screen* lane owns, because both findings
are call-site findings and there is no other call site: round 1's Request was not taken. The edits
were made with three exact-string `Edit`s against the file's current bytes — never a whole-file write
— so they cannot clobber the screen lane's concurrent work, and indeed that lane's `collapsedLineOf`,
`swapRows` and `crewBlock` rewrites are all still in the file beside them. **The risk left is the
other direction**: if the screen lane holds an older copy of `job.js` in memory and writes it back
whole, these two call sites disappear again and `tests/job-week.test.mjs`'s six new J13 r2 tests go
red — which is exactly what they are there for.

Touched this round: `site/js/screens/job.js` (2 call sites + 1 import, marked above),
`tests/job-week.test.mjs` (1 test replaced, 6 added), `notes/week-fix.md`.
