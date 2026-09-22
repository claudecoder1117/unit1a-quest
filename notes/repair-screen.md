# repair-screen.md — round-4 repair, the **screen** lane

Owned files: `site/js/screens/job.js`, `site/css/job.css`, plus the test/QA files that cover them
(`tests/job-screen.test.mjs`, `qa/job-screen.mjs`). Nothing else in the tree was edited.

Authority: `designs/REPAIR-DECISION.md` (S0 and S5 are this lane's; S3 and S4 name this lane only for
files another fixer owns — see **Requests**), `designs/r3-findings.json` (13 entries have
`lane: "screen"`; 8 of them are in my two files).

**Suite, measured at the end of this ticket** (other lanes were writing concurrently, so this is a
snapshot, not a constant):

```
$ cd /Users/oliver/Projects/unit1a-quest && node --test tests/
tests 2817 · pass 2813 · fail 0 · skipped 4          ← the S0 acceptance number
```

The stated baseline (2725/2721/0/4) is withdrawn per REPAIR-DECISION #21: one test failed before this
ticket (S0) and the count has moved since it was written. My own four additions are in
`tests/job-screen.test.mjs` (62 → 66 in that file).

---

## S0 — BLOCKING: the failing Playwright arm. **The cause is the CLOCK, not a throw at mount.**

`tests/job-screen.test.mjs:871` failed, reproducibly, exactly as the decision reports. The decision's
guess at the mechanism (*"The likely shape is an uncaught throw during `mountJob`"*) is **wrong**, and
the diagnosis it ordered is what shows it:

```
$ node -e 'console.log(new Date().getHours())'         → 22
$ node qa/job-screen.mjs --engines chromium --themes light
  [mount] .job-screen never became visible — hash "#/today"
  [mount] plan.jobEntryGate: {"allow":false,"redirect":"#/today","why":"after 22:00",
                              "line":"Board closed · Night Before · ~30 min · ends 23:30","kind":"closed"}
  [mount] page errors: (none)
  [mount] body:  <header class="hdr" …            ← the app is fine; it is on Home
```

G1/G5: *"after 22:00 the board closes"*. `plan.jobEntryGate` is the one decision behind `#/run/job`
and `screens/job.js mountJob` obeys it by **navigating away** — no error, clean console, no
`.job-screen`. So the Playwright arm passed or failed **by the time of day**: it was green this
afternoon and red after 22:00, and `waitForSelector` aborted the walk before the console check at
`:824`, which is why every number in the table read 0.

**Fixed in `qa/job-screen.mjs`, two parts, no test weakened:**

1. **The page's clock** is moved by a CONSTANT offset onto tonight at 19:30 — `qa/job-walk.mjs`'s own
   idiom, whose comment states the rule this file was missing: *"A visual QA that only runs after
   dinner is not a QA"*. Constant, so every wall-clock delta the app measures (and every delta the
   harness measures) is untouched; `Date` still ticks at one second per second. `--at HH:MM` overrides
   it, and the offset is printed in the report so the model is auditable.
2. **The mount wait prints the page's own account before it re-throws**: `consoleErrors`,
   `body.innerHTML.slice(0, 400)`, the hash, and `plan.jobEntryGate`'s verdict — the one thing that
   can refuse the route with a clean console.

Nothing forbidden was used: no `t.skip`, no widened `browsersAvailable()`, no raised timeout, no
deleted assertion, no 0-walk table (the opposite — the walk now happens).

```
$ node --test tests/job-screen.test.mjs      → tests 62 · pass 62 · fail 0     (before: 61/1)
$ node qa/job-screen.mjs --engines chromium --themes light
  … target 1 36 … target 8 36 … debrief (10 targets) … rail 1280 … ALL PASS
  keyboard open (chromium/light): layout viewport 667px · visible band 0..331 · --kb 336px · data-kb open
  crew grid: measured on 2 brief(s) · the queue-aware gap differs from the supply-blind one on 1 of them
```

**NEGATIVE CONTROL (S0).** `node qa/job-screen.mjs --at 23:00` still FAILS — and now says why in one
line (`kind:"closed"`, `why:"after 22:00"`). The arm is not blind to a closed board; it is no longer
blind to the reason.

**PASS.** True baseline recorded above.

---

## S5 — the guard game: the brief press becomes ONE ATOMIC SUBMIT (`site/js/screens/job.js`)

Implemented exactly as S5.3 specifies.

1. **`bump()` stages instead of pressing.** At `phase === 'brief'` the ± write a screen-local
   `pending` allocation (keyed to `briefs.length`, so it cannot survive the window, a phase change or
   a reload) and **never** call `state.press`. What may be staged is `state.canPress(save, candidate)`
   — the machine's own `pressRefusal` — so a greyed ± and the refusal that would have thrown are one
   decision. The board press is untouched: there it is free, blind and sealed before any draw.
2. **The button submits one atomic press**: `takeBrief({ repress: pending })` with `added === 1` and
   `removed === 1`, which `pressRefusal` accepts with `lifted === false` and which fires exactly one
   redraw — *after* the move is committed.
3. **Two things are no longer offered.** The submit is dead unless the staged move is a one-for-one
   swap, so (a) "redraw and move nothing" (state.js:837's *"always legal"* bare press) is not
   offered, and (b) **a lift on its own is not submittable either** — that is stronger than S5.3
   item 3 and it has to be: committing a lone lift leaves the window `lifted` with a token in hand,
   and `pressRefusal` then accepts a bare place, which is the informed placement this repair exists
   to close. The machine still permits both; the screen declines to offer them, which is where S5.2
   says the law has to live.
4. **The label is the move it makes** — `Move one token · the guard redraws`. "Re-press · redraw the
   guard" described something a student can no longer do. It is read from `COPY.repressMove` when
   `site/data/job.js` carries that key (filed under **Requests**) and falls back to the words here
   until then, beside the four option labels this panel already spells out. A new hint line prints
   what the staged move will do, including that the redraw *can land on the same wing* (Global law 5).

**The acceptance test, and why it is in the harness.** `tests/job-screen.test.mjs` cannot mount a
screen (no DOM, no third-party dependency), and a regex over the source is exactly the shape three
critics called structurally blind. So the behavioural rule is **`qa/job-screen.mjs` rule 12**, which
the measured test at the bottom of that file runs and now asserts a count for: it opens a real brief
window, clicks `−` on one wing and `+` on another, and reads the save through `js/store.js` after each
click.

```
brief press: driven on 1 window(s) · RECALL→FIGURES · wing ALGEBRA→FIGURES (pinned FIGURES)
             · one redraw · took ["repress"]
```

It asserts: the button is dead before anything is staged and after a lone lift, and live on an atomic
move; **neither ± changes `g.tokens`, `guard.drawnAt` or `guard.wing`**; the staged counts DO change
on screen (or the rule would be vacuous); the submit commits exactly the staged allocation, moves
`drawnAt`, closes the window, records `took: ["repress"]`, and lands on
`guard.drawGuard(dist, "${seed}|brief${n}")` — the **pinned** draw, recomputed from the pre-submit
state, never re-implemented.

The last part of S5.5 item 2 (*"no surface rendered it before the submit"*) needed rewriting to mean
anything: a whole-screen text search for the new wing's name is **vacuous here**, because the brief's
guard bars label every wing on the board. The unchanged `guard.wing` in the save IS the proof — every
"guarded" marker in the layer is derived from that one field — and the rule additionally reads back
the wing named by the only sentence that says which wing is dead (`COPY.guard`'s
`GUARD: ALGEBRA.  your tokens: …` in the live region), at all three reads, so a screen that cached
that line would pass the state check and still fail this one.

**NEGATIVE CONTROL (S5) — the rule was watched failing against the round-3 code.** With `bump()`'s
brief branch restored to `state.press` and the button restored to `takeBrief({ repress: {...gv.tokens} })`
(file-copy A/B, no git):

```
FAIL — 8
  brief press — the re-press button is live before any token has moved — "redraw and move nothing" is a free re-roll (G11)
  brief press — the re-press button is live on a LIFT alone — committing it leaves the freed token to be placed against a known wing
  brief press — the lift wrote the allocation to the save before the submit ({"RECALL":2,…} → {"RECALL":1,…})
  brief press — the lift moved guard.drawnAt (1790033400166 → 1790033425208) — the guard redrew on a staged token
  brief press — the lift redrew the guarded wing (ALGEBRA → FIGURES) before the move was committed
  brief press — the place wrote the allocation to the save before the submit
  brief press — the place moved guard.drawnAt
  brief press — the place redrew the guarded wing (ALGEBRA → FIGURES) before the move was committed
```

That is the leak itself, printed: the lift published FIGURES and the placement that followed was made
against a certainty. The static arm in `tests/job-screen.test.mjs` fails on the same revert
(`the submit must be dead unless the staged move is a one-for-one swap`).

**One harness change S5 needed that is not in the decision:** the walk used to reach every brief
window with **2 of 3 tokens down** (its arrow pair nets to zero), and `pressRefusal`'s
`repress-unavailable` means the re-press does not exist on a partial press — so rule 12 had nothing
to measure. The board phase now spends the whole press, and rule 12 asserts the *unavailable* state
(every ± and the submit dead) when a window ever opens partial.

**Also added (S5.5 item 4), pure, in `tests/job-screen.test.mjs`:** the four refusal codes as the
published contract, driven to `state.press`'s throw on boards composed by the shipped machine —
`repress-step` (the whole press at once), `repress-spent` (a second lift), and, from a partial press,
`repress-lift-first` (a place) and `repress-unavailable` (a lift). Plus: the atomic swap **is**
accepted, and the bare press **stays** legal in the machine (three shipped tests drive it).

**S5.5 item 5 — the regression gate:** `node --test tests/job-state-r3.test.mjs` → **16 pass, 0 fail**,
file unmodified (mtime 20:09, before this ticket).

**PASS.**

---

## The findings, one line each (ids are 1-based indices into `designs/r3-findings.json`)

### In my files

| id | sev | file | verdict | the number |
|---|---|---|---|---|
| 3 | BLOCKER | job.js | **REFUTED — stale** | the shipped grid passes the queue; harness rule 11 measured 2 briefs, discriminating on 1, ALL PASS |
| 40 | BLOCKER | job.js | **REFUTED — stale** | `payoutLineOf` at `w < 0.25` prints `+31 loose · chain 2 · rating unchanged · no measurement`; no `×0` at any w |
| 71 | BLOCKER | job.css | **REFUTED — already fixed** | `.job-beat` and `.job-brief > .run-actions` are `bottom: calc(var(--job-dock-h) + var(--kb))`; measured with `--kb 336px`: payout 419–464, BAG 549–593 in a 0..667 band, ALL PASS in both engines |
| 14 | MAJOR | job.js | **REFUTED — stale** | the envelope prints `your record on FAC2 · clear rate 84 % or more`; every band spans ≥ 2 rungs on both ladders |
| 44 | MAJOR | job.js | **REFUTED — stale** | rendered: `next FAC2: clear rate 84 % or more · breaks even at q 0.72 if you call 70` |
| 73 | MAJOR | job.css | **REFUTED — already fixed** | at 320×568 the last call rung is y 389–448 in a 568 px band (**120 px of clearance**, −8 px even at scrollY 0); measured at 320/360/375/390 and 844×390, both engines |
| 74 | MINOR | job.css | **FIXED** | 1280×520 and 1280×500: rail **320×599** with `.job-board-body` shown — was 320×**36** with the body `display: none` |
| 49 | MINOR | job.css | **PARTIAL** | the strip's clip falls **22 px → 8 px** at 375 px; closing it is one field out of `COPY.collapsedBoard` (Requests) |

Detail on the three that needed work or a number:

**74 (the rail collapse) — FIXED.** `@media (max-height: 520px)` was not width-scoped and its
selectors (`.job-screen[data-phase="envelope"] .job-board`, 0,3,0) outrank the rail's own rule
(`.job-board`, 0,1,0), so any window shorter than 520 px collapsed the 320 px rail whatever its
width. It is now nested inside the same `@container jobscreen (max-width: 895.98px)` guard the
call-lock collapse already sits in — **not** an `@media (min-width)`, which this file does not use and
`tests/job-screen.test.mjs` forbids by count (`@media (…min-width…)` occurrences must be 0; still 0).
Measured, `#/run/job` at the envelope, cold load, scrollY 0, both engines:

```
                     before                       after
  1280x900   rail 320x599  body grid       rail 320x599  body grid
  1280x520   rail 320x36   body none  →    rail 320x599  body grid
  1280x500   rail 320x36   body none  →    rail 320x599  body grid
```

COMPOSED-GAME.md:706 — *"≥ 1024 px: the board lives in the 320 px right rail, permanently visible"* —
is true again. The finding's own note that no harness can see this is correct and is filed as a
request to the tests lane (VP_ALL has no short-desktop row).

**49 (the collapsed strip's ellipsis) — PARTIAL, with the residual measured.** Confirmed live:
`RECALL ×1.25 ⟨1⟩ · loose 0 · ×1.0 · chain 0` needs **337 px** in a **315 px** box at 375 px, so the
chain — the push-your-luck state — is what the declared ellipsis eats. Measured at 13 px mono in the
strip's own box:

```
  RECALL ×1.25 ⟨1⟩ · loose 0 · ×1.0 · chain 0        337 px
  ALGEBRA ×1.75 ⟨3⟩ · loose 131 · ×1.8 · chain 4     360 px   (G6's own example)
  WORDS guarded ×0.55 ⟨0⟩ · loose 24 · ×1.2 · chain 1 399 px
  …the same three WITHOUT `· chain N`                fit at every padding tested (need == box)
```

The five-field line does not fit a 375 px phone in **any** form, and the type is already at the app's
smallest size (`--fs-1: 13px`). (The same finding's second measurement, `.job-say` at 352 px of text
in a 343 px box, is the beat line, which `job.css:80` clamps to one line **by design** while a stem
is up — *"it stays in the accessibility tree and keeps announcing, which `display: none` would not"*.
That one is a sentence, not a ledger, and it is the hint's price rather than a live number; left as
designed, and named here so round 5 does not read it as missed.) What I own is the box: the collapsed form now drops its inline
padding from 12 px to 6 px with `padding-block`, which buys 12 px — the live clip falls from
**22 px to 8 px** (the trailing digit of `chain N`; 15 px on the `loose 39` form). The rest is one
field out of `COPY.collapsedBoard` in `site/data/job.js` — another lane's file, and the field to drop
is the critic's own choice: `loose` and `chain` are **both** live chips in the in-job header 36 px
above the strip (`app.js renderJobHeader`, `HDR_JOB_ADD = hdr-loose / hdr-bag / hdr-chain`). Filed
under **Requests**, with the G6 example line that changes with it under **Spec corrections**.

**3 (the crew grid) — REFUTED as stale, and the enforcement is live.** The shipped line is
`site/js/screens/job.js:1389`:
`align = state.crew.alignmentFor(s, { shape, of: onBoard, queue })`, with `.job-crew-supply` printing
`supplyGapFor`'s own numbers. Verified not by reading it but by rendering it: harness rule 11 reads
the painted sentence back against `crew.supplyGapFor(save, queue)` computed from the same save on
every brief of the walk — 2 briefs measured, the queue-aware gap differing from the supply-blind one
on 1 of them, no failures. The critic's measurement (66 % of 135 boards) was of the pre-fix tree.

### Screen-lane findings in files I do not own → **Requests**

| id | sev | file | who |
|---|---|---|---|
| 58 | BLOCKER | `site/js/screens/settings.js` | the guard/doc lane (S5.7 names it) |
| 9 | MAJOR | `site/js/screens/home.js` | the home/board lane |
| 34 | MAJOR | `site/js/sound.js` | unowned by any S1–S5 section |
| 30 | MINOR | `site/data/job.js` + `settings.js` | the call lane (S3.1(e), finding 29 is the same defect) |
| 47 | MINOR | `site/data/job.js` | the data/copy lane |

---

## Requests

1. **`site/data/job.js` — add `COPY.repressMove`** (S5.3 item 4). The brief's submit label is
   `Move one token · the guard redraws`; it is read as `COPY.repressMove()` when the key exists and
   falls back to those words in the screen until then. Suggested:
   `repressMove: () => 'Move one token · the guard redraws',`
   Note for whoever files item 4's premise: it says the label "is a `data/job.js COPY` string, not a
   screen literal (`job-screen.test.mjs` pins that)". That is not true of the shipped tree — the test
   pins `COPY.*` for the **printed lines** (`envelope`, `clear`, `miss`, `bagPrompt`, `bag`, `guard`,
   `vault`, `walk`, `callIt`, `collapsedBoard`), and all five brief option labels are screen literals
   today. The lint that would change it is the tests lane's `job-copy.test.mjs` finding.
2. **`site/data/job.js` — drop the last field of `COPY.collapsedBoard`** (finding 49, the half I
   cannot reach). Today:
   `collapsedBoard: ({ wing, tokens, loose, mult, chain }) => `${wing} ⟨${tokens}⟩ · loose ${loose} · ×${mult} · chain ${chain}``
   Measured: with `· chain ${chain}` removed, every shipped form fits the 375 px strip at every
   padding tested; with it, none does. `chain` is a live header chip during a job, so nothing is
   lost. The G6 example line changes with it — see **Spec corrections**. (If the data lane would
   rather drop `loose ${loose}` instead — also a header chip — that fits too; either one, not both.)
3. **`site/data/job.js` / `site/js/screens/settings.js` — finding 30 / finding 29 / S3.1(e):** the
   printed rank bands have four 0.1-wide holes (`bandTop 4.9 / 6.4 / 7.6 / 8.8` against min
   `5 / 6.5 / 7.7 / 8.9`), so a reachable rating of 4.95 or 6.49 sits in no printed band. S3.1(e)
   orders the bands printed from `RANK_THRESHOLDS`. `screens/job.js` prints no band and needs no
   change; the acceptance test S3.4 item 6 names belongs with whoever owns the printing surface.
4. **`site/js/screens/settings.js` — finding 58 / S5.7:** the "How the Guard draws" panel prints an
   `x̂` law that omits `guard.js`'s ballast term. S5.7 assigns it to guard/doc; recorded here because
   the finding is filed under `lane: "screen"` and it is not in my two files.
5. **`site/js/screens/home.js` — finding 9:** pass-1 board prints the brochure's split and minutes
   under `~N % game · projected`. Not in my files.
6. **`site/js/sound.js` — finding 34:** G6's four cues were never built and the test that "asserts"
   them reads `data/job.js` back to itself. `screens/job.js` imports no sound module today; if the
   cues are to be driven from the job screen, file the hook here and I will take it — the six
   animation cues are already pinned in `tests/job-screen.test.mjs`.
7. **`qa/layout-audit.mjs` (tests lane) — add one short-desktop row to `VP_ALL`** (e.g. 1280×520).
   Finding 74 was invisible by construction: every VP_ALL entry ≥ 1024 wide is ≥ 768 tall, and
   `qa/job-screen.mjs`'s `RAIL_VP` is one tall size, so the intersection of "rail" and
   "max-height: 520px" was untested. My fix is measured in this note and in the CSS comment, but
   nothing in the nets defends it yet. (I did not add it myself: `qa/layout-audit.mjs` is yours and
   finding 75 has you editing it.)
8. **`site/js/screens/card.js` (card lane) — a `continueLabel` option** on the card view, so the
   payout beat stops relabelling the dock's Continue by reaching into `#dock`. Standing request from
   round 2; unchanged by this ticket.

---

## Spec corrections (for the doc lane — `COMPOSED-GAME.md` is not mine to edit)

1. **S5.6, G1, line 145.** The published option no longer exists as written; my code implements the
   replacement the decision specifies.

   OLD (COMPOSED-GAME.md:145):
   > **What a brief window is (50 s at full use, five real options, no padding).** Re-press one token with the guard distribution redrawn · swap one undrafted contract in at its declined price (+0.15, see below) · re-rank one crew slot for the rest of the job (free, always) · take or decline the next target's tell · declare a walk-away minute. Any subset, `Enter` to skip.

   NEW:
   > **What a brief window is (50 s at full use, five real options, no padding).** **Move ONE token and submit it — a single atomic press, committed before the guard redraws** · swap one undrafted contract in at its declined price (+0.15, see below) · re-rank one crew slot for the rest of the job (free, always) · take or decline the next target's tell · declare a walk-away minute. Any subset, `Enter` to skip.

   …and §3.4 gains the paragraph S5.6 specifies (the four refusal codes, the pinned seed, and *"a
   redraw with no token moved is not an option"*). One correction to that paragraph as drafted: the
   screen refuses a **lone lift** as well as a bare redraw, for the reason in S5 above — the drafted
   sentence should say *"a press that moves nothing, and a lift that places nothing, are not
   options"*.

2. **G6's phone paragraph, line 706 — the collapsed-board example is not what the app prints**, on
   two counts: the wing clause has carried that wing's own multiplier since round 2, and the `chain`
   field does not fit a 375 px phone (finding 49, Request 2).

   OLD (COMPOSED-GAME.md:706):
   > Collapsed: `RECALL ⟨2⟩ · loose 131 · ×1.8 · chain 4`.

   NEW (if Request 2 lands as written):
   > Collapsed: `RECALL ×1.50 ⟨2⟩ · loose 131 · ×1.8` — the wing being answered, **that** wing's own
   > multiplier and tokens, and the chain multiplier; `loose` and `chain` are live header chips during
   > a job, and the fifth field did not fit the 375 px line it is specified for (measured: 337–399 px
   > of text in a 315 px box).

   NEW (if Request 2 is declined and the five fields stay):
   > Collapsed: `RECALL ×1.50 ⟨2⟩ · loose 131 · ×1.8 · chain 4` — **the line is clipped on a 375 px
   > phone and the tail is what goes**; the wing clause is what must survive.

3. **G6's copy table, line 717 — the blank-slot payout line is missing.** The table prints only the
   informative form (`clear +40 loose · chain 4 · rating +6.4 ×0.96`). The shipped screen prints
   `+40 loose · chain 4 · rating unchanged · no measurement` whenever `w < RATING.informativeMin`
   (0.25) — which is **five of ten targets** on the repo's own recommended evening. Nothing published
   is false; the table is incomplete, and finding 40 exists because that line was the one thing on
   screen nine times a job. Suggested ADD under the `clear` row:
   > `clear (blank slot)  +40 loose · chain 4 · rating unchanged · no measurement`   — `w < 0.25`: the
   > record is too one-sided for the outcome to measure calibration, so the rating clause says so
   > instead of printing a credit the window will score 0.

---

## What I did NOT touch, and why

- **`site/js/screens/mock.js` and `COPY` for S3.1(d)** — S3 names "screen" for `mock.js` and the copy
  promotion, but `mock.js` is not in this lane's file list and `site/data/job.js` is another lane's.
  `screens/job.js` prints no rating/rank line of its own: the only rank it renders is
  `callMod.rankOf(num(d.rank, 2)).name` in the debrief's fallback panel, which reads the **stored**
  rank and is correct under the ratchet with no edit. Nothing in S3 needs this file.
- **S4's grids.** The crew legend and the three rung buttons now read `crew.RANK_NAMES` and
  `crew.COSTS` instead of the words `STEADY` / `HELD` and print the chain-hold clause only while
  `crew.CHAIN_HOLD_MIN` is a finite number — so whichever way the S4 gate resolves (DEEP, or
  minimal's fallback with HELD intact), this screen follows the crew module instead of contradicting
  it. `COPY.crewDemoted` and the "next job will legalise it" line are in `stats.js`, not here.
- **`tests/job-state-r3.test.mjs`** — the S5 regression gate, unmodified and green (16/16).
- **`site/data/job.js`, `settings.js`, `stats.js`, `home.js`, `sound.js`, `qa/layout-audit.mjs`** —
  other lanes'. See **Requests**.

---
---

# ROUND-1 VERIFICATION OF THE REPAIR — the **screen** lane, 8 findings

Same two owned files (`site/js/screens/job.js`, `site/css/job.css`) plus their tests
(`tests/job-screen.test.mjs`, and one new driver `tests/_job-reach.mjs`). **One line of
`site/js/job/board.js` was changed** — see Request 1, marked there per BUILD-POLICY §2.

Every number below was measured through the shipped path, before and after. The scripts are in this
session's scratchpad (`fix1.mjs`, `fix23.mjs`, `fix6.mjs`, `fix5.mjs`) and the two permanent ones are
`tests/_job-reach.mjs` and the new tests in `tests/job-screen.test.mjs`.

## 1 (MAJOR, split-honesty) — the primary button now describes the draft ON SCREEN

`postBoard` composes `primary` and `projection` once, from `board.recommend`; the sheet then lets the
student toggle any 3 of 5 and `startJob` honours their picks. `renderStart` now re-derives the whole
button per render through a new exported `quoteFor(save, board, picks)`, from the two pure functions
the board itself uses — `draftFrom` for the union and its posted line, `projectFor` for the split and
the wall clock — against the same pinned seed, ×2 marks and post-time.

```
$ node scratchpad/fix1.mjs                       (50-save corpus, 19:30, every legal draft)
boards 50 · drafts priced 500 · nulls 0
recommendation reproduces board.primary/board.projection: 50/50
drafts whose LETTERS are wrong: 0 / 500          (was 450/450 on the non-recommended ones)
drafts whose POSTED line is wrong: 0 / 500
worst gap the frozen button had, now closed — posted 58 · minutes 5 · split 6 points

corpus save 3, as the button now prints it:
  JOB · A B C · 10 targets · posted 225 (−51 shared) · ~20 min · ends 19:49 · 28 % game
  JOB · A C D · 10 targets · posted 321 (−105 shared) · ~24 min · ends 19:53 · 24 % game   ← was printed over BOTH
  empty draft -> the recommendation, because that is what `buildJob` starts with no picks
```

The 50/50 equality is the anti-drift pin, and it is a test: `quoteFor` must reproduce `board.primary`
and `board.projection` byte-for-byte for the recommended picks over 20 boards, so a change to
board.js's own segment list fails in `tests/job-screen.test.mjs` instead of drifting silently.

## 2 (BLOCKER, player-feel) — "rating unchanged · no measurement" is gone, and 3 with it

Both halves were the same defect: a sentence about the RATING asserted from a fact about the SLOT,
and a CREDIT figure printed under the word "rating". The screen now measures the move —
`player.rating.value` read either side of its own `update()`, which is where `applyTarget` rewrites
it — and prints that. `payoutLineOf(p, env, move)`; `move === null` (a reload onto the beat) prints
nothing about the rating at all.

```
$ node scratchpad/fix23.mjs
### FULL 50-slot window (a student 5 jobs in)   rating0=7.688 slots=50
 T1 "+14 loose · chain 1 · rating −0.22 · this call was not a measurement"   measured −0.2150   (was "rating unchanged · no measurement")
 T2 "+64 loose · chain 2 · rating +0.11 ×0.89"                               measured +0.1085   (was "rating +9.1 ×0.89" — 84×)
  --- worst |printed − measured| beside the word "rating": 0.0050   (half of the 2 dp step)
### ten consecutive BLANK slots onto a full window: 7.6880 -> 7.1504, and every line printed the move
```

`COPY.clear` is still the sentence — only the number behind `credit` changed, because this file may
not retype a line the copy table owns. Request 3 asks for the wording.

## 4 + 8 (MAJOR ×2, player-feel + layout-safari) — the board phase is reachable, and says it is clipped

`.job-start > .run-actions` gets the sticky footer `.job-brief > .run-actions` and `.job-beat`
already had. Measured at rest, scrollY 0, `tests/_job-reach.mjs`, chromium and webkit to the pixel:

```
                        BEFORE                    AFTER
375x667  .job-primary   y 1011–1099 (344 below)   y 517–605  inView
320x568  .job-primary   y 1023–1134 (455 below)   y 421–532  inView
```

**Finding 4's fix (a) is NOT applied, and this is the one place I did not do what the critic asked.**
It says to let the five contracts lay out at full height during the board phase. `qa/job-screen.mjs`
line 524 measures the sheet AT THAT PHASE (`const boardOpenH = await sheetCheck('the board phase')`)
against `LAYOUT.boardSheetPx`, and fails fatally above 264 px — the sheet is 502 px of content, so
uncapping it turns a shipped rule red, and a rule is not something this lane may weaken. What was
actually missing is the affordance, so that is what shipped: the classic two-layer scroll shadow
(the `local` covers ride the content, so the shadow is absent at each end and present only while
there is more list in that direction), `scrollbar-width: thin`, the count in the teach line
(`take 3 of these 5`), and `1`–`5` now scroll the toggled contract into the sheet's window. The spec
conflict — whether the DRAFT screen is one of G6's "decision phases" at all — is Request 4.

## 5 (MAJOR, player-feel) — the getaway prints the band, not the fraction

`COPY.vault` is struck exactly as `COPY.evidence` was struck in round 3, for the identical reason,
and both of this screen's call sites go through a new exported `vaultLineOf` built on
`evidenceWordsOf`. `of` is gone from the line too, not just the hits — `of` is the carrier.

```
$ node scratchpad/fix5.mjs                    (chromium, the repo's own prepared states)
job-getaway   vault: "PAIRS grade 2 · clear rate under 69 %"        (was "PAIRS grade 2 · your last 9: 7/9 · crack breaks even at 0.00")
job-envelope  ev:    "your record on VOC · clear rate 84 % or more"
job-board     the only fraction left on any job screen: "no data — uniform 1/4" (the guard's own cold start, not a record)
```

## 6 (MAJOR, player-feel) — the three zeros

```
$ node scratchpad/fix6.mjs                     (midweek fixture, one shipped job, missing every target)
 T1 "VOC · tell: none · chain 0"    bag=0/fee 0/chain 0  <-- SUPPRESSED, the beat renders PUSH alone
  payout lines printing a 0 loose value: 0/4   ·  bag prompts that bank and break nothing: 4/4 suppressed
```

* `−0 loose` — a miss into an empty pile names the make, the tell and the chain it broke, and stops.
* `bag 0 (fee 0 · chain 0 → 0)` — not offered. The gate is *does bagging do anything*, not *is the
  amount 0*: a 0-value bag on a LIVE chain still ends the chain, so it stays (Global rule 5). The
  beat prints `loose 0 · nothing to bag` — a fact, with no verb, because naming PUSH there is the
  recommendation `thresholdRow`'s own docblock says Global law 6 bans.
* `breaks even at q 0.00` — the threshold clause is gated on `q* > 0`. `breakevenQExact` returns
  exactly 0 in two degenerate states (an empty pile: shallow branch with `S = 0`; a rung that stakes
  nothing: `P = 0` at call 50) and `CALL_FALLBACK`'s comment already names the second one. The
  evidence half (the next make's coarse band) is unaffected by either, so it is what remains. The
  vault line's own `crack breaks even at …` is gated the same way — it used to print `at —`.

## 7 (MAJOR, layout-safari) — the marks selector names the class the getaway renders

`.job-getaway .run-actions` → `.job-getaway .job-actions`, lifted into one exported
`MARKS_SELECTOR` so the classes the screen renders and the classes the measurement looks for cannot
drift apart again.

```
$ node tests/_job-reach.mjs --engines chromium,webkit
375x667 job-getaway   marks=1  fit=308px      (was marks=0 · fit=(unset))
320x568 job-getaway   marks=1  fit=179px      (was marks=0 · fit=(unset))
375x667 job-envelope  marks=1  fit=232px      (unchanged — it has `.job-calls`)
```

## What is now measured that was not

`tests/_job-reach.mjs`, run by `tests/job-screen.test.mjs` under the same `browsersAvailable()` skip
the full-walk test uses (~23 s, chromium). Four rules: `.job-primary` inside the fold at rest at
375×667 and 320×568; the footer is `sticky`; the clipped sheet paints its shadow and the teach line
names the contract count; `MARKS_SELECTOR` matches at the getaway and the envelope and
`--job-board-fit` is published there. It opens `qa/audit-states.mjs`'s own prepared states — it is
not a second walk.

## Requests (files I do not own)

1. **`site/js/job/board.js` — DONE AS A ONE-LINE ADDITION (BUILD-POLICY §2), please review.**
   The last line now reads `export { coverageOf, criticalReplicationFor, projectFor };`. Nothing
   else in that file was touched; an added export cannot change behaviour. The screen needs the
   split and the wall clock for an arbitrary pick set, and `projectFor` is the only thing that
   computes them. **The critic's own preference, and mine, is a `quoteFor(board, picks)` exported
   from board.js instead** — it would put the seven-segment composition in one place rather than
   two. `screens/job.js quoteFor` is written so it can be deleted the day that lands, and
   `tests/job-screen.test.mjs` already pins the two compositions equal on the recommendation.

2. **`site/data/job.js` — `COPY.vault` prints a make's own record as a bare fraction.**
   `vault: ({make, grade, hits, of, q}) => `${make} grade ${grade} · your last ${of}: ${hits}/${of} ·
   crack breaks even at ${q}`` decodes to a single call rung (`7/9 → q̂ 0.7778 → argmaxCall 70`) and
   composes with `settings.js`'s published `evMaxBands()`, which is the round-3 envelope repair
   defeated one screen along. Suggested: `vault: ({make, grade, evidence, q}) => `${make} grade
   ${grade} · ${evidence}${q ? ` · crack breaks even at ${q}` : ''}`` — the screen would pass
   `evidenceWordsOf(q̂)` and route the entry again. It pins in `tests/job-copy.test.mjs:446` and
   `tests/job-econ.test.mjs:1809`, which is why this lane did not do it. Until then the entry is
   live in the table with no call site, kept off `job-copy.test.mjs`'s dead list only by the
   comments that name it — the same state `COPY.evidence` has been in since round 3, and the two
   should be resolved together.

3. **`site/data/job.js` — `COPY.clear`'s word.** The line now prints the measured rating move, so it
   is true as written; but `rating +0.11 ×0.89` still hangs the slot's WEIGHT off the move as
   though it multiplied it. Suggested: `+${loose} loose · chain ${chain} · rating ${move} · weight
   ${w}`. Pins in `tests/job-econ.test.mjs:1790` and `tests/job-copy.test.mjs:496`.

4. **`site/data/job.js` + `site/js/screens/run.js` — `COPY.ratingLine`'s `n === 0` branch is the
   sentence I just deleted from the payout line, and it is worse on the debrief.** It reads
   `${rank} · rating unchanged · no measurement · 0/50 informative calls`, and the state that
   reaches it is a student who has MASTERED their makes: 50 informative calls, then 50 mastered
   ones, is `10.000 → 5.000` — the line says "unchanged" at the precise moment the rating has
   finished falling the full 5.0 of the published deflation. `tests/job-debrief.test.mjs:755` is a
   regex over the sentence SHAPE and cannot see it. Suggested: print the numeral —
   `${rank} · rating ${rating} · 0/50 informative calls` — since `5.00` beside `0/50 informative`
   already says the window measures nothing, which is the distinction that branch was created for.
   (`screens/run.js:2228` and `screens/stats.js:265` are its call sites.)

5. **`qa/job-screen.mjs` (tests lane) — fold `tests/_job-reach.mjs`'s four rules into PROBE_REACH.**
   They belong beside rules 6 and 7, not in a second driver; I wrote the driver because the rules
   had to exist somewhere this suite runs and that file is not mine. Extend the PROBE_DOCK/
   PROBE_REACH pass to the BOARD phase at 375×667 and 320×568, and assert
   `document.querySelectorAll(MARKS_SELECTOR).length > 0` at every phase the `syncBoardFit`
   docblock lists. The driver can then be deleted.

6. **`COMPOSED-GAME.md` G6 (doc lane) + `qa/job-screen.mjs` (tests lane), together — is the DRAFT
   screen one of the "decision phases"?** G6: *"Board sheet 264 px … during the decision phases; it
   collapses to a single 36 px line at call-lock."* The harness applies that to the board phase, and
   at the board phase the sheet is not chrome beside a decision — the five contracts ARE the
   decision, and 502 px of them do not fit in 264. If the product decides the draft screen is
   exempt, the sentence and `sheetCheck('the board phase')` must move together, and this lane will
   uncap `.job-screen[data-phase="board"] .job-board` in one line. Until both move, the cap stays.

## Suite

```
$ cd /Users/oliver/Projects/unit1a-quest && node --test tests/
tests 2916 · pass 2912 · fail 0 · skipped 4          EXIT=0
```

Nothing was deleted, skipped or weakened to get there. `tests/job-screen.test.mjs` went 66 → 75
tests (+8 behavioural/source, +1 measured driver), and one existing assertion changed with the
behaviour it guards: `payoutLineOf prints COPY.clear on a clear and COPY.miss on a miss` now passes
the measured move where it used to pass `p.credit`, and the key list in `the screen composes no
user-facing sentence of its own` strikes `COPY.vault` the way round 3 struck `COPY.evidence` — both
under an added assertion that the struck entry is NOT called, which is a stronger claim than the
membership it replaces.

Two transient failures were seen mid-ticket and are NOT this lane's: `tests/job-call.test.mjs`'s
`before:` pin (offender `site/js/screens/run.js:1813`) and `tests/job-monotone.test.mjs`'s pinned
counterexample (`econ.coverFor`, econ lane) — both were green again on re-run as those lanes landed.

---
---

# VERIFY ROUND 2 — the screen lane, twelve findings

Owned files, unchanged from the round above: `site/js/screens/job.js`, `site/css/job.css`, plus the
tests that cover them (`tests/job-screen.test.mjs`, `tests/_job-reach.mjs`). **Nothing else in the
tree was edited** — six of the twelve findings are rooted in files another fixer owns
(`COMPOSED-GAME.md` ×3, `screens/settings.js` ×2, `screens/stats.js`, `screens/home.js`,
`site/data/job.js`, `plan.js`, `screens/run.js`); each is reproduced below with the exact
replacement text its owner needs, under **Requests**.

Every measurement below was taken with the **critics' own instruments**, which are still on disk in
this session's scratchpad (`probe.mjs` + `sheet.mjs` + `zoom.mjs` + `pf4/measure-board.mjs` +
`pf4/probe-full.mjs`), so the before/after numbers are comparable line for line with the findings.

## 3 (MAJOR, crew-alignment) — the align line printed one price and named the wrong scale

`screens/job.js` now composes that sentence in one exported pure function, `crewAlignLineOf(align)`,
and prints **both** numbers `holds` compares — which is also what `crew.js:1534` had already asked
of any surface printing `threshold` beside this grid, and what no surface did.

```
before: a HELD point prices at 0.00 on this list's own scale — the study ordering leads it
after : a HELD point prices at 0.00 against the best STEADY point's 1.89 — the board's own prices,
        not the column below — so the study ordering leads it
```

`STEADY` is `crew.RANK_NAMES[1]`, never a typed word; the scale clause switches on `align.pricedOn`
(`board` when the grid hands `alignmentFor` the queue, which it does, `model` otherwise), so the
sentence cannot outlive the pricing regime it describes. The false half — *"on this list's own
scale"*, where the list's own scale is `crewValueDetail(...).score` six rows below — is gone.

`tests/job-screen.test.mjs` asserts it over real `alignmentFor` output on 16 composed boards (half
given a mastered make, so the HELD branch actually runs — `jobSaveFor`'s random skills reach
`isMastered` on none of the sixteen, which is why the old test could not have caught this): both
numbers present, the scale named, and `leads it` ⇔ `align.holds` ⇔ `steadyThreshold ≥ threshold`.

## 8 (MAJOR, player-feel) — `rating −0.22 · this call was not a measurement`

The round-1 repair implemented both halves of its finding at once and the conjunction contradicted
itself. Both halves are true; what was missing is the relation between them, and it is exact:

* a blank slot scores `w·c = 0` against a **fixed** divisor (`RATING.base + scale · Σ(w·c)/N`,
  `N = 50` always), so the slot itself can never move the rating;
* `windowPush` is `[...list, e].slice(-50)`, so on a FULL window the push evicts the oldest entry —
  and that eviction is the only route by which the number beside `rating` can be non-zero.

So the line prints the cause, and prints no number at all when there is nothing to attribute:

```
$ node pf4/probe-full.mjs            (the critic's own probe, shipped state machine)
T1 VOC   w=0.00  +14 loose · chain 1 · not a measurement — its slot pushed an older call out · rating −0.22
T5 NOTE  w=0.00  +178 loose · chain 5 · not a measurement — its slot pushed an older call out · rating −0.22
T9 NOTE  w=0.00  +77 loose · chain 9 · not a measurement — its slot pushed an older call out · rating +0.32
```

and on a window that is not yet full (no eviction, move exactly 0, asserted as a control in the
test) the line is `+25 loose · chain 1 · this call was not a measurement` — the fact about the slot,
with no numeral hung off it. The test now also pins the RULE rather than only the string: no line
may match `/rating [+−][\d.]+ · this call was not a measurement/`.

The trailing `×0.89` on the INFORMATIVE branch is `COPY.clear`'s and survives — **Request 4**.

## 4 (MAJOR, ledger-invariance) — `Another board` dead-ends after every walk

The refusal (`startJob` → `JobStateError('page-in-progress')`) is correct and untouched. What was
wrong is where the student met it: after the whole board ritual, as `The board could not be posted`.
`mountJob` now consults **the same predicate the refusal uses** — `state.pageInProgress`, which is
exported for exactly this and returns `null` while a job is live — before it mounts, and navigates
to `#/run/page`:

```js
const gate = jobEntryGate(getState());
if (!gate.allow) { navigate(...); return () => {}; }
try {
  const live = state.pageInProgress(getState());
  if (live) { navigate('/run/page'); return () => {}; }
} catch { /* a malformed save is the mount's problem, not the gate's */ }
```

`tests/job-screen.test.mjs` pins both halves: that `pageInProgress` is truthy exactly where
`startJob` throws `page-in-progress` (built through `page.startPage` + `markItem`, not by hand), that
it clears when the page is finished, and that the call precedes `mount(host, …)` in the source — the
ordering IS the finding. `plan.jobEntryGate` is still the right long-term home and the debrief button
still needs relabelling: **Requests 1 and 2**.

## 10 + 11 + 12 (three MAJORs, player-feel + layout-safari ×2) — the sheet

These are one mechanism, so they were repaired as one. The third term (`--job-board-fit`) takes
pixels away until the decision clears the fold; the three findings are all about what it does when
taking pixels away is not enough, and about affordances scoped to the one phase that did not need
them.

**(a) Two measured states under the floor.** `syncBoardFit` now classifies the budget it already
computes — a number invariant under the sheet's own height — into `open` / `strip` / `off`, written
to `data-boardfit` and styled in the narrow form only:

* `strip` when the budget is under the height one WHOLE contract row needs (`boardFitState`, measured
  from the first row's own box, so it tracks text size and wrapping — never a typed constant). The
  sheet takes the same published 36 px line call-lock already takes. A sliced row is a list that
  looks finished; the strip says less and claims nothing false.
* `off` when even the 36 px floor leaves the decision below the fold. **`display: none`** — the
  first form of this rule was `block-size: 0; overflow: hidden` so the rows would stay measurable
  from inside the state, and **this repo's own auditor graded that a BLOCKER on sight**:

  ```
  $ node qa/layout-audit.mjs --only job --engine chromium --theme both
  LAYOUT AUDIT — 2 findings (65 waived)
    BLOCKER zero-track job-envelope light/chromium 320x568@zoom20   section.job-board
            grid child collapsed to 0.0px tall but carries text; parent grid-template-rows: 0px …
    BLOCKER zero-track job-envelope dark/chromium  320x568@zoom20   (the same box)
  ```

  It is right to be a blocker — a list clipped to nothing is still read aloud in full, so the
  sighted student and the screen-reader student would get different screens. `boardFitState` caches
  the last measurable row height (`boardNeed`) instead, which is the mechanism the `strip` state
  needed anyway (its body is `display: none` too). One step of hysteresis (`FIT_STEP`) covers the
  grid gap that disappears with the box, so the two states cannot flap.

  ```
  $ node qa/layout-audit.mjs --only job --engine chromium --theme both     (after the change)
  LAYOUT AUDIT — 0 findings (65 waived) in 258s          verdict: 0 blockers, 0 majors → PASS
  ```

  — the same 65 waivers as before this ticket, so nothing new was waived and nothing new was added
  to `qa/audit-allow.json` (which is not this lane's file and was not touched).

**(b) The affordances are the sheet's, not the draft's.** The scroll shadow and `scrollbar-color`
moved from `.job-screen[data-phase="board"]` to the base `.job-board` rule (the `local` covers are
content-driven, so they cost nothing where the list fits), and the count of what is below the clip
is now a live element inside the scroller — `.job-board-more`, `position: sticky; bottom: 0`,
recounted on every render, every scroll of the sheet and every resize, hidden the moment the list is
read to the end. It is written only when the string changes, because `fitMut` observes this subtree
and an unconditional `textContent` write is a mutation that schedules a pass that writes again.

**(c) The `38dvh` term is off the DRAFT on a portrait phone.** It is the landscape phone's term; on
the narrowest supported phone it was handing the tallest list the smallest window (216 px of 722 px
of content at 320×568, against 253 px of 502 px at 375×667). Scoped with `@container jobscreen
(max-width: 599.98px)`, so every wider box — a phone on its side, a small tablet — keeps it, and the
file's one `min-width` container query is still the rail's.

**The 264 px cap itself stays**, for the reason it stayed last round: it is `LAYOUT.boardSheetPx`,
G6's published phone sheet, and `qa/job-screen.mjs:524` fails above it AT THIS PHASE. The critic's
own fix names the fallback — *"If the cap has to stay, put the count in the affordance (`3 more ↓`,
live) rather than only in the teach line, and drop the `38dvh` term"* — and that is exactly what
shipped. The spec conflict is **Request 3**, unchanged and still unresolved.

### measured, chromium, the critics' scripts

```
$ node sheet.mjs --engines chromium                                   BEFORE → AFTER
job-board    320x568  h=216 whole=1 shadows=27                     →  h=264 whole=1 "4 more ↓"
job-board    375x667  h=253 whole=2 shadows=27                     →  h=264 whole=2 "3 more ↓"
job-envelope 320x568  h=80  whole=0 partial=1 shadows=none teach=∅ →  h=36  STRIP  (no sliced row)
job-envelope 375x667  h=232 whole=2 shadows=none                   →  h=232 whole=2 shadows=27 "3 more ↓"
job-vault    320x568  h=146 whole=0 partial=1 shadows=none         →  h=36  STRIP
job-getaway  320x568  h=179 whole=1 shadows=none                   →  h=179 whole=1 shadows=27 "4 more ↓"

$ node zoom.mjs --engines chromium,webkit --vps 320x568 --fs 20     (the BLOCKER configuration)
chromium job-envelope  board=36 decision=457-584 fold=568  >>> 16px BELOW THE FOLD
webkit   job-envelope  board=36 decision=457-584 fold=568  >>> 16px BELOW THE FOLD
                                        ↓
chromium job-envelope  state=off board=0 decision=421-548 fold=568  (clear by 20px)
webkit   job-envelope  state=off board=0 decision=421-548 fold=568  (clear by 20px)
```

An unreported case fell out of the same repair: at **844×390** the envelope's decision was 4 px below
the fold with the `max-height: 520px` strip applied (`clear by 40px` at `board=0`, against a strip
that costs 44 px with its gap). The measured state reaches it because it is a measurement, not a
breakpoint.

### the net, and its control

`tests/_job-reach.mjs` (run by `tests/job-screen.test.mjs` under the same `browsersAvailable()` skip)
gains two rules and one probe:

* **rule 5** — a sheet that is PRESENTING the list and clipping it must show at least one contract
  row whole, and `.job-board-more` must name exactly how many are below it (and be hidden when none
  are). A `strip`/`off` sheet is not presenting the list, and must print no count at all.
* **rule 6** — the three staked beats at **320×568 with `html{font-size:20px}` installed before the
  state is prepared**, which is the configuration that exposed the BLOCKER and which nothing in the
  repo ran. `qa/layout-audit.mjs` runs this viewport and this zoom and reports 0, because its
  `offscreen` detector only fires at scroll-end (`qa/layout-audit.mjs:698`) — there is no at-rest
  fold rule in it. That is the tests lane's **Request 5**.

```
$ node tests/_job-reach.mjs --engines chromium,webkit
ALL PASS · 18 measurements · engines chromium, webkit

CONTROL — the same driver with the two measured states switched off in css/job.css
  (`[data-boardfit=…]` → `[data-boardfitOFF=…]`, file-copy A/B, restored immediately):
4 FAIL
  ✖ chromium 320x568 job-envelope @20px: .job-calls is 16px below the fold at rest with the text
    size at 20px (top 457, bottom 584, fold 568, sheet 36px, state "off")
  ✖ chromium 320x568 job-envelope: the sheet is in state "strip" and still says "5 more ↓"
  … (2 more)
```

— i.e. the new rules reproduce the critic's own number to the pixel when the repair is removed.

## Requests (files I do not own — nothing below was edited)

1. **`site/js/plan.js` — `jobEntryGate` should carry the page clause.** It is the one place every
   other route refusal lives (`off` / live / `morning` / `quiet` / `closed`), and a page in progress
   is the one refusal that is not in it. Suggested, after the `live` clause:
   `if (pageInProgress(save)) return no('#/run/page', \`${live.left} left on Today's Page\`);`
   `screens/job.js` then drops its own pre-check in one line. Until it lands, the door is on the
   screen and the two agree by construction (both call `state.pageInProgress`).

2. **`site/js/screens/run.js:1418` — `Another board` is offered exactly when it cannot work.** It
   sits beside `Today's Page`, whose condition is already `num(job.left, 0) > 0`. Suggested: hide or
   relabel it under that same condition — `num(job.left, 0) > 0 ? null : h('a.btn', {href:'#/run/job'}, 'Another board')`
   — so the debrief never offers a board over a live page. (With Request 1 landed the tap merely
   redirects; without it the student still gets the ritual, because `#/run/job` is a public hash
   route the back button reaches too.)

3. **`COMPOSED-GAME.md` G6 (doc lane) + `qa/job-screen.mjs` (tests lane), together — is the DRAFT
   screen one of G6's "decision phases"?** Unchanged from last round and now cited by a second
   critic. G6: *"Board sheet 264 px … during the decision phases; it collapses to a single 36 px
   line at call-lock."* At the board phase the sheet is not chrome beside a decision — the five
   contracts ARE the decision, and they are 502 px at 375×667 and **745 px at 320×568**. If the
   product exempts the draft, the sentence and `sheetCheck('the board phase')` (qa/job-screen.mjs:524)
   move together and this lane uncaps `.job-screen[data-phase="board"] .job-board` in one line.

4. **`site/data/job.js` — `COPY.clear`'s trailing `×w`.** `+271 loose · chain 8 · rating +0.55 ×0.89`
   hangs the slot's WEIGHT off the rating's measured move as though it multiplied it (`0.55 × 0.89`
   is not a quantity in this game). Suggested: `+${loose} loose · chain ${chain} · rating ${credit} ·
   weight ${w}`. Pins at `tests/job-econ.test.mjs:1790` and `tests/job-copy.test.mjs:496`. Filed last
   round as Request 3; re-filed with the round-2 critic's own line for it.

5. **`qa/job-screen.mjs` (tests lane) — fold `tests/_job-reach.mjs`'s six rules into PROBE_REACH, and
   add an AT-REST fold rule under the 20 px text pass.** `qa/layout-audit.mjs` already runs
   320×568 + zoom20 + both engines + both themes over all 11 job states and reports 0 unwaived
   findings, because its only offscreen detector is `if (phase === 'bottom' && n.r.top > vh + 1)`
   (line 698) — it can see nothing at rest. Rule 6 above is that rule, in the wrong file.

### Requests filed on behalf of the six findings rooted outside this lane

6. **`COMPOSED-GAME.md` G2 "Rank" + `site/js/job/call.js` + `screens/settings.js` (finding 1,
   BLOCKER).** The published rating→rank partition is no longer the granting rule: the rank comes off
   `earned = min(value, ceiling)` (call.js:595-597) while every audit line prints `value`, so on
   ordinary honest play at true q = 0.85–0.90 **17–20 %** of calls print a rating strictly above the
   band the game granted. Nothing on any screen prints `ceiling` or `capped`. Not this lane's:
   the fix is either in the copy table's own parts (`ratingAuditParts` / `ledgerRatingParts` /
   `COPY.ratingLine`) or in the granting rule, and G2's rating column must be withdrawn or qualified
   either way. **`screens/job.js` prints no rank band and no rating band anywhere** (checked:
   `grep -n "rankFor\|rankBand\|ratingLine" site/js/screens/job.js` → no hits), so this lane has no
   surface to repair.

7. **`site/js/screens/settings.js` (finding 2, BLOCKER) — ALREADY REPAIRED UPSTREAM, verified this
   ticket, no request.** The hint is now gated `live.held && !live.measured` (settings.js:737), which
   is the split the finding asked for, and a second hint for the other half of the same confusion
   landed beside it (`live.offBand`, settings.js:730-736, which prints `live.ceiling` — the number
   finding 1 says no screen prints). Reproduced by reading the shipped file at 06:4x on the day of
   this ticket; if a later edit re-widens that gate, the finding returns.
   Finding 1's remaining half is the DOCUMENT's: G2's rating column is still published as a
   partition and `COMPOSED-GAME.md:332` still says *"The ladder is the rating band printed as a
   word"*, which the cap makes false at 17–20 % of an honest student's calls. Doc lane.

8. **`COMPOSED-GAME.md:818` (finding 5, MAJOR) — the `clear†` row is stale twice over.** The shipped
   branch no longer prints `rating unchanged · no measurement`, and as of THIS ticket it no longer
   prints the round-1 wording either. The verbatim shipped line, for the copy table:
   `clear†    +40 loose · chain 4 · not a measurement — its slot pushed an older call out · rating −0.22   (w < 0.25)`
   and the paragraph at :847 should say the branch prints the rating's own measured move **and the
   eviction that caused it**, rather than asserting the rating did not move.

9. **`COMPOSED-GAME.md:824` (finding 6, MAJOR) — the `guard` row drops the unguarded wing's
   multiplier and the `guarded,` tag.** Composed from the shipped `COPY.guard`/`COPY.guardToken` with
   the argument shape `screens/job.js:1057-1060` passes:
   `guard     GUARD: WORDS.  your tokens: RECALL 2 (×1.5) · WORDS 1 (guarded, ×0.6) · FIGURES 0`
   (`GUARD.tokenBonus = 0.25`, n = 2 → ×1.5; the guard multiplier renders `×0.6`, not `×0.60`.) The
   suggested widening of `tests/job-meta-constants.test.mjs` arm D — render EVERY G6 copy-table
   sample from `COPY`/`screens/job.js` and compare — is the tests lane's, and this lane will keep
   `payoutLineOf`/`collapsedLineOf` exported and pure so it can.

10. **`site/js/screens/settings.js:751` + `site/js/screens/stats.js:335` + `COMPOSED-GAME.md:431`
    (finding 7, BLOCKER).** Both screens still say a call on mastered material *"never enters the
    window"*; `call.js:442-445` says the opposite in its own comment, and the measured consequence is
    −0.215 rating on a clean clear. Suggested wording, which is also what this lane's payout line now
    says at the other end of the same tap: *"every call takes a slot; a call on material you know
    cold takes its slot and scores 0, which pulls the rating toward 5.00 and pushes an older measured
    call out of the window."* COMPOSED-GAME.md:431 carries the same claim (*"they never enter the
    window at all"*) and moves with it.

11. **`site/js/screens/home.js` (finding 9, MAJOR) — the primary is below the fold with the game on.**
    Re-measured this ticket, same instrument, after my changes (which cannot affect Home):
    `game ON @375x667 primary {top: 753, bottom: 820, anyOnScreen: FALSE}` against
    `game OFF {top: 270, bottom: 326, fullyOnScreen: true}`. The 467 px `.home-board` panel is
    rendered immediately before `h('div.home-cta', primary)` (home.js:820-821). Suggested: put the
    CTA above the panel (the panel is evidence FOR the button, not a preamble to it) and drop
    `· 26 % game` and `· ends 19:52` from the button, which the panel's own meta line already
    carries. Not this lane's file; no part of it is reachable from `screens/job.js`.

## The aside in finding 10 — the press and COMMIT below the fold (measured, NOT patched)

Measured at rest with the finding's own instrument, AFTER this repair (chromium, `midweek` fixture):

```
375x667  .job-board 141–405 (264px, content 527)  ·  .job-tokens 701–919  ·  .job-commit-btn 962–1006  ·  .job-primary 541–605 (sticky, inView)
320x568  .job-board 171–435 (264px, content 747)  ·  .job-tokens 750–968  ·  .job-commit-btn 1011–1055 ·  .job-primary 469–557 (sticky, inView)
```

so the sheet change moved the press **down** by 11 px at 375×667 and 48 px at 320×568, and it is
below the fold either way. Five contracts (502–747 px), three token rows (218 px), COMMIT and START
do not fit one phone fold in any arrangement; the sheet is already at G6's published cap.

**A `N tokens still to press ↓` cue was built into the sticky row and then removed**, because it is
dead by construction: the posted board arrives with the press already SPENT — `⟨1⟩⟨1⟩⟨1⟩⟨0⟩` at the
draft, `spent === GUARD.tokens` — so the token rows are a default to ADJUST rather than a decision
that can be skipped, which is also what `startOrGo`'s own note says ("a student who accepts the
posted mix without touching it presses at `now`"). The only state the cue could ever have rendered
in is one the student reached by un-pressing on purpose, where it would nag about the choice they
had just made. The measurement is reported here instead, and the `renderStart` comment records the
same thing beside the row it is about.

## Suite

```
$ cd /Users/oliver/Projects/unit1a-quest && node --test tests/
BEFORE this ticket (06:01, same tree):   tests 2920 · pass 2916 · fail 0 · skipped 4   EXIT=0
AFTER  this ticket (07:13):              tests 2995 · pass 2991 · fail 0 · skipped 4   EXIT=0
```

**Nothing was deleted, skipped or weakened.**

Two earlier full runs in this ticket were RED and neither failure was this lane's; both are recorded
because they are useful to whoever reads this next:

* `tests/job-screen.test.mjs` — *"…and the published 30 % is what that arithmetic produces on a bare
  make"* failed at `19.7 %` for about an hour. The test is in my file and asserts the ECON lane's
  `econ.settle`: `carryFor` was returning 66 → 46 (the published `LADDER[1] = 0.7`) while `settle`
  returned 66 → 53 for the same target. It was NOT touched here; the econ lane landed a change at
  07:03 and the same expression now reads 66 → 46, `drop 30.3 %`, green. Nine sibling failures in
  `tests/job-econ.test.mjs` cleared with it.
* `tests/job-debrief.test.mjs:724` failed once in a full run and passes on its own — another lane
  writing a module while the runner was importing it. Both full runs above were started while three
  other lanes were writing to `site/js/job/*` and `site/data/job.js`; a single red run in that window
  is worth re-running before it is worth reading. `tests/job-screen.test.mjs` went 76 → 80 (+4 behavioural/source tests; three existing
assertions changed with the behaviour they guard, each noted in place), and `tests/_job-reach.mjs`
went four rules to six.

One existing assertion in `tests/job-screen.test.mjs` had to move for a reason that is NOT a
behaviour change of mine and is worth naming: `a BLANK slot says what is true of the SLOT` asserted
`blank.w < call.INFORMATIVE_MIN`, and the **call lane's round-2 repair** (landed at 06:25 while this
ticket was open) stopped `callEntry` storing `w` on a blank slot at all (`p: null, q: null`, weight
derived in `windowOf`). The fixture check is now `call.ratingDetail([blank], 50).n === 0` — the
shipped gate's own answer, which is a stronger claim than reading a field that may or may not exist.

---

# VERIFY ROUND 3 — the screen lane, seven findings

`site/js/screens/job.js` + `site/css/job.css` (+ their tests). One BLOCKER, six MAJORs. Five were
repaired here, one is a one-line cross-lane edit recorded below, one is a document's.

## 1 (BLOCKER, exploit-hunt) — the swap row advertised the whole contract's posted for one target

`swapRows` printed `· posted ${o.decline}` — `swapOptions`' `round(bundle.posted · 1.15)`, the
DECLINED price of the WHOLE contract — on the same line as the `+N target(s)` it really adds.
`swapIn` splices only the bench items the queue does not already hold (`!have.has(it.id)`), and
criticals are replicated across bundles, so most of a declined contract is already drafted.

**Repaired** by pricing the row on what it delivers. `swapDeliveryOf(save, id)` (now exported, module
level, pure) is `swapIn`'s own filter and `swapIn`'s own sum — `Σ it.posted` over the bench items it
would splice, which is the number `swapIn` adds to `g.posted`. A contract whose bench delivers
nothing renders NO row: taking it would close the window (`brief()` always advances the phase) in
exchange for nothing. The contract's own declined price survives as a second, muted, labelled line
(`.job-swap-whole`), so the two numbers can no longer be read as one.

Driven over every `qa/fixtures/audit/*.json` × 14 seeds, each row's printed posted compared with the
`g.posted` delta of a real `state.brief({swap})` on a private clone of the same save
(`/private/tmp/.../verify.mjs`, and `tests/job-screen.test.mjs` runs the same comparison):

```
swap rows 140 · row agrees with swapIn on 140
  the number the row USED to print, against what the swap delivers: min 4.29x · median 14.25x · max 17.71x
```

## 2 (MAJOR, exploit-hunt) — a brief window could take at most ONE of its five options

Every control called `takeBrief(<one action>)` and `state.brief`'s last act is
`setPhase(g, targetsLeft === 1 ? 'getaway' : 'envelope')`, so the first option taken shut the window
and the rest were refused (`not-at-brief: envelope`). Only COMMIT escaped, because `doCommit` called
`state.commitBind` directly. G1 publishes *"Any subset, `Enter` to skip"* over five options and the
debrief's "35 if you use every optional window" is computed from `briefOptionsMax`.

**Repaired** by staging the window and submitting it whole, the way the press already was (S5):

* `briefStage` / `briefAt` — the same idiom as `pending` / `pendingAt`, keyed on `briefs.length`, so
  a staging cannot survive into the next window, a phase change or a reload.
* `stageBrief({…})` is what every control now calls: the swap rows, both tell rows, `setCrewRank`,
  and `doCommit` **while the phase is `brief`** (at the board it still binds straight through, which
  is the only place a declaration has no window to ride). A second tap on a staged option takes it
  back off the table, so `Enter` still skips a window that really is empty.
* `submitBrief()` builds ONE action object and makes ONE `state.brief` call. `takeBrief` is now
  called from exactly one place and returns `took`.
* The controls say what they are: `aria-pressed` + `[data-staged]` on the rows, a
  `.job-brief-staged` line naming the staged window in `brief()`'s own order of application, and the
  primary reads `Skip` on an empty window and `Take N decisions` otherwise.
* `.job-repress` keeps its shape and its job — dead unless the staged move is one-for-one, submits
  ONE press, closes the window — but what it submits is the whole window, so taking the re-press no
  longer costs the student the other four options. `qa/job-screen.mjs` rule 12 drives exactly this
  button and still reports `one redraw · took ["repress"]`.

The machine half is pinned driven rather than by source: one window handed `{repress, swap, crew,
commit, tell}` records ≥ 3 options in ONE `briefs` entry (`tests/job-screen.test.mjs` — "every
control STAGES, and one submit sends the window").

**The published count is still not 35, and this lane cannot make it so.** With any subset reachable
the screen's own ceiling is `mandatory + briefOptionsMax·briefs + …`; whether that equals
`econ.decisionCount`'s 35 is the counter's basis, which `run.js:2398` already has a note about. See
Request 1.

## 3 (MAJOR, exploit-hunt) — the getaway quoted the BAG/PUSH threshold, at the previous target's rung

`breakevenLabel()` → `econ.breakevenQExact`: the PUSH-vs-BAG root, carrying `FEE = 0.10` (a MID-JOB
bag) and no completion term, quoted at `callOf(gv)` — and at the getaway nothing is locked, so that
is the rung used on the PREVIOUS target. The decision there is CRACK vs WALK.

**Repaired** with `getawayThresholdOf({bagged, loose, chain, stakes, target, rungs, crew, calls})` —
exported, pure, module level, built only from `econ.carryFor` / `econ.missFor` / `econ.getawayBank` /
`econ.exitBonusRate`:

```
V = bagged + getawayBank(loose)          both exits bank the pile at the same fee-free rate
WALK  = (1 + r_walk )·V                  r_walk  = exitBonusRate({getawayWalk: true,  stakes})
CRACK = (1 + r_crack)·(V + Δ)            r_crack = exitBonusRate({complete: true,     stakes})
q*    = ( loss − V·(1 − (1+r_walk)/(1+r_crack)) ) / (gain + loss)
```

evaluated over the rungs `state.callsAvailable` actually offers, because CRACK is the decision and
the rung is chosen after it. The rung with the lowest `q*` is the one the CRACK/WALK decision turns
on, and `vaultLineOf` now names it: `crack at 50 breaks even at 0.00`.

**The rates are READ, not assumed** — which mattered inside this ticket: the econ lane landed
`econ.exitBonusRate` at 09:39 with a PARITY clause (a getaway WALK now pays `COMPLETION` too, killing
the CRACK@50-then-miss arbitrage). Under parity the `V` term vanishes and `q*` collapses to
`loss/(gain+loss)` = `P/(W+P)`, which is `PUBLISHED.getawayParity.crackQStarBare`. Had this function
hard-coded a completion asymmetry it would have been wrong within the hour.

`q* = 0` is printed, not hidden: the old `q > 0 ? … : null` gate meant the getaway printed nothing at
the one beat whose arithmetic has a definite answer. Beside it, `.job-getaway-floor` prints the two
banks the 0 comes out of — `a 50 call stakes nothing — final bagged N if the vault is
missed, M if you walk` — so the claim is checkable rather than assertable. Naming the free rung is not a call
recommendation (Global law 6): it is `CALL_LEVELS[0].P = 0`, it is EV-max only on the weakest makes,
and no rung is compared with another.

Driven over 70 getaway states reached through the shipped machine, with both branches evaluated on
either side of the printed root:

```
getaways 70 · the printed q* is the exact CRACK/WALK root on 70 · free (q* = 0) on 70
```

## 4 (MAJOR, player-feel) — a CLEARED target printed `rating −0.09` with no cause

The blank-slot branch explains its eviction; the informative branch printed the fall and stopped.
Once `player.rating.calls` reaches 50 the window stays full for life, so this is the steady state.

**Repaired without new plumbing, because the implication is already sound.** `ratingDetail` is
`base + scale·Σ(w·c)/N` with N the FIXED 50, and on a CLEAR `c = 10 − 40(p − 1)²` is ≥ 0 at every rung
the game offers (`p ≥ 0.5`) — so a push onto a window that is not yet full can only add a
non-negative term and the value cannot fall. `moved < 0` on this branch therefore happens **iff** the
window was full and the slot that left scored more than the one that arrived. The line says exactly
that: `… · rating −0.09 · weight 0.64 — its slot pushed a stronger call out`. A RISE is given no
cause it does not have. The implication itself is pinned over every rung × window size below 50
(`tests/job-screen.test.mjs` — "on a CLEAR, a fall can only be an eviction"), so if `call.js` ever
makes a clear's credit negative, that test fails rather than the sentence going quietly false.

## 5 (MAJOR, player-feel) — `rating +0.23 ×0.89` multiplied a factor already inside the number

**THE CROSS-LANE EDIT.** The remedy is the copy entry and nothing else, and it had been filed as
Request 3 in two consecutive rounds without landing. `Δrating = 2·w·c/N`, so the printed move ALREADY
contains `w`; the `×` invited `0.23 × 0.89 = 0.205`, which is no quantity in the system. Before the
round-3 repair the pair at least multiplied to the slot's `w·c`; after it, to a fiction — in the
game's most repeated line.

Edited under BUILD-POLICY §2 (a one-line change in a file this lane does not own, recorded here):

* `site/data/job.js` — `COPY.clear` now ends `· rating ±x · weight w` instead of `· rating ±x ×w`.
  The parameter names are untouched, so no other caller moves.
* `tests/job-copy.test.mjs:496` and `tests/job-econ.test.mjs:2187` pin that literal; both moved with
  it, each with the reason in place, and job-copy gained a shape assertion (no `×` may stand between
  the rating move and the weight) so the defect cannot come back under a different spelling.
* `tests/job-screen.test.mjs`'s own pin derives from `COPY.clear`, so it needed no change; a shape
  assertion was added there too.

Nothing was deleted, skipped or weakened: the same three facts are printed, and one operator that
asserted a false relation between two of them is gone. **COMPOSED-GAME.md G6's copy table still shows the old
`clear` row — see Request 2.**

## 6 (MAJOR, layout-safari) — the board phase was excluded from the fit on a premise that is false

`syncBoardFit` skipped the board phase because `.job-start > .run-actions` "is sticky and rides the
fold", and `css/job.css` repeated it. A sticky box cannot be shifted above its containing block, and
`.job-panel.job-start` puts ~600 px of content above that row, so the shift clamps to 0.

**Repaired in three places, because the exclusion lived in three:**

1. `MARKS_SELECTOR` gained `.job-start > .run-actions .btn-primary`. The mark is the BUTTON, not the
   row — the row is the box whose sticky offset made the claim look true.
2. `css/job.css`'s draft override (`@container jobscreen (max-width: 599.98px)`) dropped BOTH the
   `38dvh` term and the measured one. The `dvh` term stays dropped (that is round 2's repair, about
   the narrowest phone getting the smallest window onto the tallest rows); `--job-board-fit` is back
   in the `min()`.
3. **The draft does not escalate.** At every other beat the sheet is chrome beside a decision, so
   when shrinking is not enough it takes the one-line `strip` and then gives up its last 36 px. At
   the draft the five contracts ARE the decision and `strip` sets `.job-board-body { display: none }`
   — a draft screen with no contracts is not a smaller decision, it is none. So at
   `root.dataset.phase === 'board'` the ladder stops at `open` and the floor is one WHOLE CONTRACT
   ROW (`boardNeed`) rather than `LAYOUT.boardCollapsedPx`. `boardFitState` is still called at every
   phase, because it is also what measures `boardNeed`.

Measured with `tests/_job-reach.mjs` (chromium), at rest, scrollY forced to 0 — before → after:

```
                         BEFORE (critic)            AFTER
320x568  16px  primary   y=458 b=619  51px BELOW    y=469 b=557  inView   sheet 262/747
844x390  16px  footer    y=308 b=425  35px BELOW    (rule 6 below)
320x568  20px  primary   y=469 b=603  35px BELOW    y=455 b=560  inView   state=open board=250
844x390  20px  primary   y=322 b=398   8px BELOW    y=306 b=382  inView   state=open board=132
```

— the list is still on screen in both 20 px cases (`state=open`), which is the whole point of (3).

`tests/_job-reach.mjs` rule 6's id list gained `'job-board'` (asserting `.job-primary`) and its
viewport list gained `844x390`, exactly as the finding asks, so the repair has the same net the three
staked beats already had: **14 measurements, ALL PASS**, against 2 failures on the unrepaired tree.
`qa/job-screen.mjs`'s `sheetCheck` is unaffected — the fit term only ever takes pixels away, and that
rule fails on a sheet TALLER than `LAYOUT.boardSheetPx`.

## 7 (MAJOR, layout-safari) — the unfiltered layout audit is red, on the study layer

Correctly attributed by the finding itself: **nothing to repair in `site/js/screens/job.js` or
`site/css/job.css`**, and nothing was changed for it. `qa/audit-allow.json` entries 4, 5 and 6 already
carry the reproduction command, the control state (`card-pairs-kb`, left UNWAIVED) and the hit counts,
and `tests/job-audit-allow.test.mjs` gates them. What is missing is the sentence in the game's own
acceptance. See Request 3.

## What is now measured that was not

1. `tests/job-screen.test.mjs` 80 → 90 tests. The new ones are driven wherever the claim is about a
   number: the swap row against `swapIn`'s own `g.posted` delta, the getaway threshold against both
   exit branches evaluated either side of the root, the eviction implication over every rung × window
   size, and the five-option window through `state.brief` itself.
2. `tests/_job-reach.mjs` rule 6 runs over four states (was three) at two viewports (was one):
   14 measurements, and the board phase's own decision is one of them.
3. Two source pins that would have caught this round's defects: `takeBrief` may be called from
   exactly ONE place, and the draft's `max-block-size` must name `--job-board-fit`.

## Requests (files I do not own — nothing below was edited except where §5 says so)

1. **`site/js/job/econ.js` `decisionCount` + `COMPOSED-GAME.md:132` (finding 2's tail).** With the
   window now taking any subset, the screen can reach `mandatory + briefOptionsMax·briefs + COMMIT`.
   Whether that is 35 is the counter's own basis — `run.js:2398` already carries a note saying 35 is
   unreachable and attributes it to a counter-basis gap. That gap is now the ONLY cause left; please
   either make `decisionCount` count what the window can take, or correct the published 35.
   COMPOSED-GAME.md:148's "Any subset, `Enter` to skip" is true again as of this ticket.

2. **`COMPOSED-GAME.md` G6's copy table, the `clear` row (finding 5).** It still prints the old
   string (line 860 as of 10:2x — the doc lane is moving it). The shipped
   string, for the table:
   `clear     +40 loose · chain 4 · rating +6.4 · weight 0.96`
   and the paragraph beside it should say the numeral is the rating's own MEASURED move over the
   target (eviction included), not the slot's credit — which is why no `×` may stand between it and
   the weight. The `clear†` row and the eviction paragraph carried in last round's
   Request 8 are still open, and the informative branch now has a cause clause of its own:
   `clear     +50 loose · chain 2 · rating −0.09 · weight 0.64 — its slot pushed a stronger call out`

3. **`COMPOSED-GAME.md` G8, the J6 row (finding 7).** The acceptance line should say that
   `node qa/layout-audit.mjs --only job` is green only because ~130 study-layer hits are attributed
   out by `qa/audit-allow.json` (entries 4–6, gated by `tests/job-audit-allow.test.mjs`), and that
   the UNFILTERED command exits 1 on `card-pairs-kb` — the same defect, unwaived, in the study layer
   that owns it. The game ships with its answer path in that condition and no line in its acceptance
   says so. The study-layer repair is the pairs widget's picker height (`site/css/widgets.css`) or
   `keepVisible` using `scrollIntoView({block: 'start'})` against the VISUAL viewport instead of
   `{block: 'center'}` against the layout one (`site/js/widgets/base.js`).

4. **`qa/job-screen.mjs` (tests lane) — rule 12 should stage a SECOND option before it submits.**
   The rule drives the press and reads `took ["repress"]`, which is exactly right for what it was
   written for. One added click — any `.job-swap`, or either tell row, before the submit — would make
   it the net for finding 2 as well: the assertion becomes `took` contains `repress` AND the other
   option, on ONE `briefs` entry. This lane cannot add it (the file is the tests lane's) and
   `tests/job-screen.test.mjs` can only reach the machine, not the clicks.

5. **`qa/job-screen.mjs` (tests lane) — fold `tests/_job-reach.mjs`'s six rules into `PROBE_REACH`.**
   Re-filed from round 2, unchanged, and now with a fourth state and a second viewport in rule 6.

## Suite

```
$ cd /Users/oliver/Projects/unit1a-quest && node --test tests/
BEFORE this ticket (09:27, same tree):   tests 2995 · pass 2991 · fail 0 · skipped 4   EXIT=0
AFTER  this ticket (11:05):              tests 3073 · pass 3069 · fail 0 · skipped 4   EXIT=0
```

(3073 rather than 2995 because four other lanes added tests to this tree while this ticket was open;
this lane's own file accounts for +10 of them.)

`tests/job-screen.test.mjs` went 80 → 90 tests, `tests/_job-reach.mjs` three measured states at one
viewport → four at two (14 measurements), and two literal pins moved with `COPY.clear` (§5).

**Nothing was deleted, skipped or weakened.** Three assertions moved with the behaviour they guard
(two literal pins of `COPY.clear`, and the two source pins in `tests/job-screen.test.mjs` that named
`takeBrief({repress: …})` and `takeBrief({swap: …})` as the option controls' own calls) — each is
recorded in place, beside the claim that replaced it, and each replacement is a stronger statement
than the one it replaced.

**Other lanes were writing `site/js/job/*`, `site/data/job.js` and `tests/job-econ.test.mjs`
throughout this ticket** (mtimes 09:39–10:28 during it), so three transient reds were seen and are
worth naming for whoever reads this next — none of them this lane's, each proved so before it was
dismissed:
* `tests/job-econ.test.mjs:1500` — *"no ASSERTION and no constant under the layer names the rejected
  band"* failed on `site/data/job.js` naming `0.52`, which is the econ lane's brand-new
  `PUBLISHED.getawayParity.crackQStarBare: { …, 85: 0.5263, … }`. Not this lane's, and not caused by
  this lane's one-line `COPY.clear` edit.
* `node tests/_job-reach.mjs --engines webkit` died with `SyntaxError` inside
  `site/js/job/state.js:2104` — another lane mid-save. Re-run rather than read.
* `tests/job-week.test.mjs:1335` — *"the projection reads the student's OWN last five jobs"* — failed
  in two consecutive FULL runs (10:17 and 10:30) with the identical numbers, `the board projected
  29 % against a debrief headline of 22 %`, and passed every time that file was run on its own. It
  is the BOARD lane's in-flight repair of `site/js/job/board.js` (written 10:08:31, 10:17:54 and
  10:28:38, alongside `tests/job-board.test.mjs` at 10:28:26) — `postBoard(...).split` is that
  file's number. Ruled out as this lane's four ways before it was dismissed:
    1. `job-week.test.mjs` imports exactly one thing from this lane — `finalWordOf` — which was not
       touched, and the failing assertion is `postBoard(...).split` against `run.js sessionSplit`.
    2. the whole test file, and that file plus `job-board`/`job-econ`/`job-save` in one shared
       process, pass — as does the whole `tests/job-*.test.mjs` set including this lane's file
       (1 608 tests, 0 fail).
    3. the arm was REPLICATED verbatim as a scratch test and run inside the full shared process
       (`node --test tests/` runs everything in ONE process through `tests/index.js`): it printed
       `pb.split 21 headline 22 source ledger`, i.e. PASSING, in the same run.
    4. the full set with `tests/job-screen.test.mjs` REMOVED was green (2 983 tests) at 10:40, and
       the full set WITH it was green again at 10:50 — after `board.js` landed at 10:28.
  If it returns, it is `postBoard`'s `split` term, not this lane's.
