# run lane — fixes

Owner files: `site/js/screens/run.js`, `site/js/app.js`, `site/index.html` (+ their own tests).

---

## Round 1

Three findings, all in `site/js/screens/run.js`. `app.js` and `index.html` needed no change (the
`/run/:kind/:id?` route the new drill link uses already exists — `app.js` `PATTERNS`).

New test file: **`tests/run-lane-r1.test.mjs`** (20 tests, pure — it imports `screens/run.js`,
`schedule.js` and `data/*` and never touches `js/job/state.js`, so a machine another lane is mid-edit
on cannot make it pass or fail for the wrong reason).

### 1. [BLOCKER] `0 ms idle` was `x − x` — now measured against a second clock

**The finding was right.** `state.debriefOf` derives `const wall = tGame + tAnswer`
(`js/job/state.js`), and `sessionSplit` printed `idle = job.wall − (tGame + tAnswer)`. Identically 0
for every session the app can produce.

**Fixed at the root, inside the lane.** The layer already carries an independent job-start stamp:
`startJob` writes `inProgress.startedAt` in the *same statement* that arms the phase machine's first
`phaseAt`, so `[startedAt, now]` is exactly the span `tGame + tAnswer` claims to cover.

- `captureJobBefore()` now snapshots `startedAt` (and patches a stored snapshot written before this
  landed). The snapshot, not `inProgress`, is what survives `finishPage`.
- new `jobWallMs(before, now)` → the independent wall clock, **frozen on first build**: once the
  debrief is on screen the app IS showing a result, so a re-render (resize, theme flip, back button)
  must not grow the number. Returns `null` when there is no stamp.
- `jobSummaryContext` carries it as `ctx.wallMs` (kept *beside* `elapsedMs`, never folded into it —
  `elapsedMs` feeds the flat Summary's `Time` fact and the BLITZ hero and may not change meaning).
- `sessionSplit(job, save, { wall })` computes `idle = wall − (tGame + tAnswer)` and reports
  `idleMeasured`. With no clock it prints **`idle not measured`**, not a 0 it never took.
  (`Number.isFinite`, not `Number(x)` — `Number(null) === 0` would put the tautology straight back.)

Measured end to end through the real machine
(`/private/tmp/.../scratchpad/idle2.mjs`): `banked 6 · wallMs 7 → idle 1 ms`. The residue is the
`endJob → debrief render` transition (`endScreen()`: `destroyView` → `flush` → `syncHeader` →
`render`), which is itself a window where the app is neither accepting input nor showing a result, so
it belongs in the number — it just makes it coarser than it needs to be. See **Request 1**: one
terminal `at` stamp on `debriefOf` makes it exact.

`tests/job-split.test.mjs:718`'s `/ms idle/` grep still matches; the printed string is unchanged in
shape.

### 2. [MAJOR] The guard bars are the redraw, and now the page says so

**The finding was right.** `guardDist(save, …)` reads the heat window `endJob` has *already* folded
this job's press into, so the bars are next board's. The page headed them `The guard` and captioned
them `drawn this job: ALGEBRA`, with the drawn wing's bar painted `--warn` — which reads as *these
are the odds, this is the one that came up*. A 25 % draw printed under a 31 % bar.

- heading → **`The guard · next board`**
- the caption is now `guardNote(wing, thisJobDist)` (exported, pure, tested):
  `next board’s odds, after tonight’s press · drawn this job: ALGEBRA at 25 %`
  Degrades to `… · drawn this job: ALGEBRA` with no dist, and `… · no guard drew this job` with no
  wing. **No percentage is invented when none was kept.**
- `thisJobDist` comes from `ctx.jobOpts.guard.dist`. `endJob` does not carry `g.guard.dist` out of
  the machine and `screens/job.js` passes no `guard` — see **Request 2**. Until then the wing prints
  without its price, which is honest; before this change it printed *under someone else's* price.

The `data-drawn` attribute and the `--warn` fill are kept (`job-debrief.test.mjs` reads the former;
the highlight is still the right anchor once the heading says which board it is).

### 3. [MAJOR] G5 #1 — "Tomorrow's board" is now built

**The finding was right**: `grep -rn dueList site/js/screens/` found nothing. Built as the debrief's
last block, between `plan` and the buttons:

```
Tomorrow’s board: 34 cold locks on VOC + ASN-PLP · posted 587 · FIGURES has been safe 3 jobs running · bringing dropped-gcf
[ Drill 5 · VOC ]
```

`tomorrowBoard(save, {now, at})` and `tomorrowLine(t)` are exported and pure. Every clause is read
from the three modules tomorrow's board will itself read, so a reviewer can recompute all of it from
the save (G9 #4):

| clause | source |
|---|---|
| `N cold locks` / `+ N swept` | `schedule.dueList(save, {now: tomorrow})`, split on `sweep` |
| `on A + B` | the two heaviest makes, `cards.byId[id].skills[0]` (frozen items via `forCard`) |
| `posted N` | `econ.postedFor` at the **floor** — no tokens, unguarded, no ×2, `scope 1.25` as the due reviews they are. Tomorrow's press and draw have not happened, so every decision tomorrow can only move it up |
| `WING has been safe N jobs running` | the trailing run in `game.log` a wing did not draw; `guard: null` entries (a job that posted nothing) are dropped, not counted as safe nights |
| `bringing tag, tag` | `index.tellDetail(save, make).tag` — the tag tomorrow's envelope will print as its tell |
| the one tap | `#/run/drill/<make>`, the weakest **named** make by `readiness.weakSpots()`, heaviest when neither is flagged |

THE CLOCK is this moment tomorrow, not midnight (`setDate(+1)`, DST-safe): a student who finishes at
20:00 is told what is on the board when they next sit down, and `dueList` derives its own `today`
and `D` from the same stamp so the sweep window is tomorrow's too.

Deviations from G5's sample string, deliberate:
- G5 writes `7 cold locks`; `dueList` also returns test-sweep items that are *not* overdue, so those
  are counted and printed separately (`+ N swept`) rather than called cold.
- The line lives in `run.js`, not `data/job.js COPY` — see **Request 3**.

Layout: the block is laid out inline (`display: grid; gap: 8px`), the way the other debrief blocks
are (`sum-regret`, the guard bars), because this screen does not own the stylesheet — **Request 4**.
Rendered and screenshotted at 375×812: line wraps to three mono lines, `Drill 5 · VOC` is a full
`.btn` hit box above the action row.

---

## Tests

`node --test tests/run-lane-r1.test.mjs` → 20 pass, 0 fail.
`node --test tests/` → **2 failures, neither in this lane**, both in files other lanes are editing
right now:

- `tests/job-exploit.test.mjs:557` — `site/js/job/crew.js reads the clock: Date.now` (crew lane)
- `tests/job-state.test.mjs:698` — queue items end without a `result` (state lane)

Everything that touches `screens/run.js` is green, including `job-debrief.test.mjs` (31/31, chromium
half included: the byte-identical flat-Summary comparison, the bag drop, and the **no-layout-shift**
observer over the guard redraw) and `job-split.test.mjs`.

Earlier in the session the whole suite was cascading from `ReferenceError: benchFor is not defined`
at `js/job/state.js:660`; that lane has since fixed it.

---

## Requests

1. **`site/js/job/state.js` (state lane) — put the terminal stamp on the debrief.** `endJob` already
   has it: `setPhase(g, TERMINAL_PHASE, now)`. Carry that `now` through `debriefOf` as `at`. The
   screen already prefers it — `jobSummaryContext` reads `num(debrief?.at, Date.now())` — so the
   idle measurement becomes exactly the un-phased time with no further edit here, and the
   `endJob → render` transition stops being folded into it.

2. **`site/js/screens/job.js` (screen lane) — hand the debrief this job's guard.** `endJob` destroys
   `inProgress.game`, so the distribution the guard was *drawn from* is unrecoverable at the
   debrief. Hold it beside `jobBefore`/`jobQueue` and pass it:
   `jobSummaryContext(getState(), d, { queue: jobQueue, before: jobBefore, guard: { wing, dist } })`
   — `run.js` already reads `opts.guard.dist` and will then print `drawn this job: ALGEBRA at 25 %`.
   (`decisions` stays deliberately omitted — `inferDecisions()` recovers it.)

3. **`site/data/job.js` (copy owner) — two strings want a home in `COPY`.** `tomorrowLine()` and
   `guardNote()` compose in `run.js`. `job-copy.test.mjs`'s narrow source sweep does not cover
   `screens/run.js`, so they are unlinted today. Suggested:
   `COPY.tomorrow({ cold, swept, makes, posted, wing, jobs, tags })` and
   `COPY.guardRedraw({ wing, pct })`.

4. **`site/css/screens.css` (T16) — a block for the new section.** `.sum-job-tomorrow { display:
   grid; gap: 8px; justify-items: start; }` and `.sum-tomorrow-line { margin: 0; }`, so the inline
   styles can come out of `run.js`.

5. **`tests/job-split.test.mjs` (J8) — feed the walkthrough's own clock to `sessionSplit`.** Line 709
   is `assert.equal(sessionSplit(w.debrief, w.save).idle, SPLIT.deadMs)`. That call now returns
   `idle: 0` with `idleMeasured: false` (nothing measured), which is still not evidence. Line 706
   already has the honest quantity — `w.elapsed − banked` — so pass it:
   `sessionSplit(w.debrief, w.save, { wall: w.elapsed }).idle` (with `w.elapsed` measured from the
   walkthrough's own start stamp), and the assertion becomes the measurement it is written as.

6. **`notes/J6b.md` / G8's J6b acceptance — add the missing acceptance line.** G5 #1 had no owner,
   which is why it was never built. Suggested: *"the debrief's last block is
   `schedule.dueList(save, {now: tomorrow})`'s cold-lock count, the two heaviest makes, the posted
   total from `econ.postedFor`, the guard's safe-wing run from `game.log`, the tags `index.tellFor`
   will bring, and one tap to `#/run/drill` on the named weak skill."*

## Open issues

- The idle number prints the `endJob → render` transition (1 ms measured in Node; a few ms more on
  device once `flush()` writes a full save to `localStorage`). It is real dead time, but Request 1
  makes it exact.
- `tomorrowBoard` prices tomorrow's locks as due **reviews** (`scope 1.25`) across the board. The
  composer may label some of them `new` or `variant` tomorrow, which scopes lower — so the printed
  `posted` is an upper bound on the review-priced half, not a promise. It is the same floor the
  board's own `postedFor` uses for a review target.

---

## Round 2

One finding, one blocker, fixed at the root. Owner files touched: **`site/js/screens/run.js` only**
(`app.js` and `index.html` needed nothing). New test file: **`tests/run-lane-r2.test.mjs`** (13 tests,
headless — it imports `js/job/state.js`, `page.js`, `trophies.js`, `schedule.js`, `readiness.js` and
`screens/run.js` and no other lane's screen).

### 1. [BLOCKER] A job forfeited `flawless-page` — the job now records the page it closed

**The finding was right, and I reproduced it before changing a line.** The critic's own script still
runs (`/private/tmp/.../scratchpad/lg5.mjs`); with the fix's call site removed it prints
`flawless-page  flat=true  job=false` on all four corpora, and `runs 1/0 · forecastLog 1/0`.

`state.endJob` ends a completed job with `finishPage(s)` and nothing else. `screens/run.js`'s own
`finish()` makes **three more writes at that same moment** — `pushRun(makeRunRecord({kind:'page', …}))`,
`checkDailyGoal`, `logForecast` — and `screens/job.js` made none of them, so
`data/trophies.js:194` (`someRun(r => kindOf(r)==='page' && r.status==='done' && items.every(isClean))`)
was unreachable from a job. `runs`, `forecastLog` and `trophies` are all in `js/job/state.js`'s own
`LEDGER_A_KEYS`, and COMPOSED-GAME.md G7 publishes *"Streak, trophies, XP, levels | unchanged"*.

**Fixed inside this lane.** New `commitJobRun(save, debrief, opts)` in `screens/run.js`, called from
the top of `jobSummaryContext` — the one function `screens/job.js` calls at the terminal, on every
path a job can end through (`finish`, the last `push`, a bag on the last beat, a walk at the
getaway), and the one that runs *before* the render that can throw. **`screens/job.js` did not need a
line changed**, which is what made the fix possible with the screen lane mid-edit.

Why not in `js/job/*`: those modules run against `guardSave`, which makes a Ledger A write **throw** —
correctly; that is the whole structural half of `job-ledger.test.mjs`. The record is the screen's to
write, exactly as it is on the flat page.

Decisions, each of which is a place this could have gone wrong:

| decision | why |
|---|---|
| `kind: 'page'`, not `'job'` | the trophy predicate is `kindOf(r)==='page'`, and a job **is** Today's Page — `finishPage` already counts it in `counters.pages` the same way (G7 "One queue, two skins") |
| only when `debrief.complete === true` | that is exactly `targetsLeft(s)===0`, the condition under which `endJob` calls `finishPage`. A bagged or walked job leaves the rest of the page live on `#/run/page`, and the flat screen writes nothing for a page it did not finish either. Whichever screen **closes** the page records it, once, over the whole queue (pinned in the test) |
| the seven G7 game fields (`bagged`, `posted`, `ratingDelta`, `guard`, `cracked`, `tGame`, `tAnswer`) are **not** written | that is a save-budget line the save lane owns (`job-save.test.mjs` "THE RESERVED LINE IS STILL RESERVED"), and the trophy invariance this fixes needs none of them. Writing `ratingDelta` would have turned that test red for a reason unrelated to the blocker |
| the clock is the **job's**, not the render's | `submittedAt` = `debrief.at` → `game.ledger.debriefAt` (the stamp `endJob` writes) → `Date.now()`; `today` = `game.log`'s last entry's `day` (the day `screens/job.js` handed `endJob`). Keyed on the render clock, a debrief read after midnight would file the forecast point and the streak on a day nothing was studied. Measured: without this, the probe's `daily` and `forecastLog` diverged from the flat arm; with it they are byte-identical |
| `seed` / `seedTag` come from the before-snapshot | `finishPage` nulls `inProgress`, so they are unrecoverable at the debrief. `captureJobBefore` now snapshots both (and patches an older stored snapshot, the same way it patches `startedAt`), so a mid-job reload still records the page's real seed |
| idempotent, twice over | the `runs[]` scan (`kind==='page'` at the same `startedAt`) survives a reload; a `runRecorded` flag on the before-snapshot covers a page with no start stamp. The flag is set **before** the write because `update()` notifies every subscriber and a subscriber that re-renders the debrief would otherwise re-enter mid-push |
| `update()` when `save === getState()`, direct mutation otherwise | through the store, `applyCaps` trims `runs[]` to its 40, the save is marked dirty and subscribers are notified — exactly as the flat `finish()` does. Handed a headless fixture it writes in place and flushes nothing |
| it runs **before** `after`/`tilesAfter` are read | `finish()` reads `after` off the save `update()` returned, so `checkDailyGoal` can meet the goal and stamp the streak before the Summary prints. Ordered the same way here, or the debrief would print a save that existed one statement ago |

**Save budget: no change.** The record is a plain page record, the same size and shape as the one
`#/run/page` already writes for the same queue, and it consumes one of `CAPS.runs = 40` slots that a
flat page would otherwise have consumed for that same page. `job-save.test.mjs` is green (61/61) and
COMPOSED-GAME.md:802's grep (`pushRun|makeRunRecord` in `screens/job.js`) is still empty.

**Measured end to end.** `/private/tmp/.../scratchpad/runfix1.mjs` (the critic's script with the
screen's own terminal call added to the job arm) and `…/livestore.mjs` (the same through the REAL
store, `update` + `flush` + subscriber notification):

```
corpus 0: flawless answers on the SAME 7 targets
   flat run record: kind=page status=done items=7 flawless=7
   job  run record: kind=page status=done items=7 flawless=7 complete=true
   runs  flat=1 job=1   forecastLog flat=1 job=1
   flawless-page  flat=true  job=true
   (no DIFFERS line: cards, skills, xp, errors, counters, forecastLog, runs,
    trophies, variants, frozen, daily, streak all byte-identical — the two
    records differ only in each arm's own startedAt/submittedAt)
```

New exports: `commitJobRun(save, debrief, {queue?, results?, before?, startedAt?, now?}) → record|null`.
`captureJobBefore`'s snapshot gains `seed` and `seedTag`.

---

## Tests (round 2)

- `node --test tests/run-lane-r2.test.mjs` → **13 pass, 0 fail**.
- `node --test tests/run-lane-r1.test.mjs tests/job-debrief.test.mjs tests/job-ledger.test.mjs` → **81 pass, 0 fail**.
- `node --test tests/job-screen.test.mjs` → **39 pass**, including the 52 s chromium arm that plays a
  **full job in a real browser** — i.e. `commitJobRun` has run end to end through the actual app.
- `node --test tests/job-save.test.mjs` → **61 pass**.
- `node --test tests/` → **2609 tests, 3 fail, none in this lane and none touching `screens/run.js`**:
  `job-board.test.mjs` "a student with a ledger gets their OWN split" and "two students with the same
  board and different histories get different splits", and `job-split.test.mjs` "THE GAP: the board's
  projection and the debrief's measurement come apart by more than 5 points" (which now reports a gap
  of **1.6** points and says so in its own message: *"the projection now tracks a clock it does not
  own, so this test has been overtaken"*). `tests/job-board.test.mjs` does not import
  `screens/run.js` at all; `job-split.test.mjs` imports only `sessionSplit`, untouched this round.
  The board lane is mid-edit on `js/job/board.js` — twice during this sitting it threw
  `ReferenceError: meansForShape is not defined` from `board.js:442` on import.

---

## Requests (round 2)

1. **`tests/job-ledger.test.mjs` (tests lane) — THE GAP arm at :618 is now stale.** It still passes,
   because its job arm is headless (`runInJob` drives `js/job/state.js` only and never reaches the
   screen), so it cannot see the fix. Its message — *"a job's finish() calls state.endJob and nothing
   else, so it writes neither a runs[] record nor a forecast point"* — is now false of the app.
   The arm's own instructions say what to do, and this is it: **delete the arm and move `runs`,
   `forecastLog` and `trophies` back into `COMPARED`**, with the job arm's terminal routed through the
   screen call the app makes:

   ```js
   // after runInJob(...), exactly as screens/job.js renderDebrief does:
   jobSummaryContext(job, debrief, { queue: jobQueue, before: jobBefore });
   ```

   where `jobBefore = captureJobBefore(state.unguard(job), state.queueOf(job))` and
   `jobQueue = state.queueOf(job).slice()` are taken right after `startJob`, and `debrief` is
   `endJob`'s return value (`runInJob` currently lets `push()` end the job and drops it — the screen
   calls `endJob` on the last beat instead; see `playJob` in `tests/run-lane-r2.test.mjs`, which is
   the same walk). The two arms are then byte-identical on every Ledger A key, measured above. Until
   that lands, `tests/run-lane-r2.test.mjs` is the coverage.

2. **`site/js/job/state.js` (state lane) — carry `day` on the debrief.** `commitJobRun` recovers the
   job's day from `game.log.at(-1).day`, which is correct but indirect. `endJob` already has
   `const day = str(opts.day) ?? todayISO(new Date(now))`; adding `day` (and the `at` of round 1's
   Request 1) to `debriefOf`'s `over` makes both reads direct and lets the log stay Ledger B's
   business.

3. **`COMPOSED-GAME.md` :802 (doc owner) — one clause to restate.** *"Until the job screen pushes its
   record"* is now half-true: a job pushes a **page** record (no game fields), so the reserved
   `runs[]` line is still reserved and the layer's real cost is still 21.44 KB, but the sentence reads
   as though nothing is written. Suggested: *"A completed job now pushes the same plain `page` record
   `#/run/page` pushes (`screens/run.js` `commitJobRun`) — which costs the budget nothing, being the
   record that page would have written anyway. The seven game fields remain unwritten; the `runs[]`
   line below is still a RESERVED ceiling."*

4. **`site/js/plan.js` (plan owner) — the steer is now safe, and that is worth a line.** The finding's
   second half was that `nextActionFor` substitutes the board for the `page` action every evening, so
   the route that could earn `flawless-page` was the one the student was steered away from. With the
   record written that is no longer true of any trophy, but the substitution is still the thing that
   makes trophy invariance load-bearing rather than cosmetic — worth naming at the substitution site
   so the next change to it knows what it is standing on.

## Open issues (round 2)

- A job that is **walked** records nothing, by design (the flat page records nothing for a page it
  did not finish either). The page it hands back is recorded in full by whichever screen closes it,
  which is pinned in `run-lane-r2.test.mjs`. If the product later wants a partial-page record, it
  belongs on BOTH screens at once, not on one.
- `commitJobRun` reads `save.game.log` for the day. That is Ledger B, read-only, from the screen —
  the same access `tomorrowBoard` already makes for the guard's safe-wing run. Request 2 retires it.

---

## Round 3

Two findings, both in `site/js/screens/run.js`. `app.js` and `index.html` needed no change.

New test file: **`tests/run-lane-r3.test.mjs`** (10 tests, pure — `screens/run.js`, `js/job/call.js`
and `js/job/state.js`, no browser, no `Math.random`). Two existing pins were re-aimed, both in
`tests/job-debrief.test.mjs` (run.js's own J6b suite) and `tests/run-lane-r1.test.mjs` (this lane's).

### 1. [MAJOR] The call-regret line mixed the two ladders — now it runs on ONE

**The finding was right, and it reproduces on the shipped modules.** `jobRegret` picked
`call.argmaxCall(q̂)` — the **carry** argmax — and then priced the difference with
`call.expectedCredit`, i.e. in **rating** credit, which is what `COPY.regret2` says out loud
(*"cost N rating"*). Outside G3.1's two published disagreement bands the two ladders agree, so the
mismatch was invisible. Inside them the line named the rung that *loses* the credit it was charging
for (`called 70`, the critic's case):

```
q̂ 0.885  OLD "EV-max was 95, cost 1.2 rating"   E[c]@95 5.760 < E[c]@85 5.880   → −0.120
q̂ 0.890  OLD "EV-max was 95, cost 1.3 rating"   E[c]@95 5.940 < E[c]@85 6.020   → −0.080
q̂ 0.895  OLD "EV-max was 95, cost 1.4 rating"   E[c]@95 6.120 < E[c]@85 6.160   → −0.040
q̂ 0.885  NOW "EV-max was 85, cost 5.9 rating"   E[c]@85 5.880 = max{50 0.000, 70 4.560, 85 5.880, 95 5.760}
```

Band 1 is the mirror and was equally wrong: at `q̂ = 0.7765` the old line named 70 (`E[c]` 2.8240)
against the credit-max 85 (2.8420). COMPOSED-GAME.md:336 calls that band *"the only place in the game
where the player must choose what they are playing for"* — the debrief was resolving it for the
student, in the other ladder's currency.

**Fixed at the root.** `js/job/call.js:725` already exported `regretOf({call, qHat, ladder})`, which
computes `best` and `cost` on one ladder consistently — and `grep -rn regretOf site/` found only its
own definition. The screen now calls it:

```js
const { best, cost } = jobCall.regretOf({ call: called, qHat: q, ladder: DEBRIEF_CALL_LADDER.best });
```

`DEBRIEF_CALL_LADDER` is now `{ best: 'rating', cost: 'rating' }`.

**Why `rating` and not `carry`:** the copy hard-codes the units (`cost ${cost} rating.`, pinned at
tests/job-call.test.mjs:966 and owned by `data/job.js`), so the rung must be the maximiser of
expected credit. **notes/J6b.md's justification for the mixed pair is false** and this is the proof:
it claimed `{best:'carry', cost:'rating'}` is *"the only combination under which G5 #2's own worked
line reproduces"* — but `honestCall(0.75) === argmaxCall(0.75) === 70`, so the two ladders AGREE at
the worked line's `q̂` and the rating-consistent pair reproduces it exactly
(`envelope 6: you called 85, EV-max was 70. cost 0.3 rating.`, asserted through `COPY.regret2` in
both suites). The carry pair reproduces the *rung* and then misprices it: its own cost there is
**0.05 loot**, not 0.3 rating.

Global law 6 is not weakened: it forbids pre-call surfaces from naming a maximiser and permits this
one to. The line still names a maximiser after the decision, computed by the call module; the carry
argmax keeps its published home in Settings, where both ladders and both bands are printed *before*
the call — which is where a money-vs-rank choice belongs.

What the tests now pin (the invariant, not the constant): across a 101-point grid of `q̂` and across
both `CALL_DISAGREEMENT_BANDS` at 8 points each, **the rung printed is the argmax of the ladder the
printed cost is denominated in**, taking it never loses that currency, and the cost is exactly the
difference on that same ladder. The band test also recomputes the OLD pair and asserts it is strictly
worse in the currency it printed, so the regression cannot return silently.

### 2. [MAJOR] Two different quantities were printed under one word — `posted`

**The finding was right.** The take block prints the DRAFTED job's posted
(`fact('Posted', …, '10 of 10 targets')`), `COPY.deflation` then says *"posted falls as you master
the material. That is the point."*, and three lines later `tomorrowLine` printed `posted 956` — which
is `econ.postedFor` summed over **every** lock in `dueList(save, {now: tomorrow})`: the whole backlog,
no draft, no shape cap. Read straight down the screen: 516, "posted falls", 956.

**Fixed by naming the backlog figure what it is.** The word `posted` on the debrief now refers to
exactly one quantity — the job's — and the tomorrow line reads:

```
Tomorrow’s board: 43 cold locks on VOC + FAC2 · worth 902 if you took them all · …
```

(singular: `worth 12 if you take it`). G5 #1's illustrative line says `posted 186` on a *7-lock*
board, where the backlog IS a job and the two readings coincide; on a real backlog they do not, and
the clause now says which one it is. `COPY.deflation` is untouched and still true of the only
`posted` left on the screen.

Pinned in `run-lane-r3.test.mjs` §2 on one real save: the backlog's lock count exceeds the job's
target count, the two figures differ, the line contains no `posted`, and `fact('Posted', …)` occurs
exactly once in the file and is fed `job.posted`.

### Re-aimed pins (both files are this lane's own)

- `tests/job-debrief.test.mjs` — *"the CALL line names `call.argmaxCall(q̂)`"* → *"names the maximiser
  of the ladder it prices"*, plus an equality against `call.regretOf` so the screen cannot hand-roll
  the pair again; the G5 #2 worked-line test now also drives the shipped ladder and `COPY.regret2`;
  *"the debrief is the one surface allowed to name the argmax"* now asserts the rung is computed by
  `call.regretOf` on the declared ladder (and still that `screens/job.js` names none of it).
- `tests/run-lane-r1.test.mjs` — the three `posted N` string pins became `worth N …`, plus a new
  assertion that the line contains no `posted` at all.

## Requests (round 3)

1. **`site/data/job.js` (copy owner) — `COPY.regret2`'s label.** The line now names the maximiser of
   expected *credit*, so "EV-max" reads as the expected value of the quantity the sentence prices,
   which is consistent but easy to misread as the carry EV. If the copy is ever reopened, the honest
   spelling is `best call was 85` or `credit-max was 85`. **Do not change it without this lane**:
   `tests/job-call.test.mjs:966` and the two suites above assert the current string.
2. **`notes/J6b.md` §2 (doc) — the `DEBRIEF_CALL_LADDER` paragraph is now false twice over**: the
   constant is `{best:'rating', cost:'rating'}`, and the claim that only the carry pair reproduces
   G5 #2's worked line is wrong (`honestCall(0.75) === 70`).
3. **`COMPOSED-GAME.md` G5 #1 (doc owner) — the illustrative line.** *"`posted 186`"* is a 7-lock
   board, where the backlog is a job; the shipped line now reads `worth 186 if you took them all` so
   that the word `posted` on that screen means one thing. Worth restating in the spec.

## Open issues (round 3)

- The deflation claim itself is still unmeasured: nothing on the debrief shows posted-per-lock over
  time, so *"posted falls as you master the material"* is an assertion the screen never evidences. It
  is now at least not contradicted by the line under it. A per-lock average on the tomorrow clause
  (`worth 902 · ~21 each`) would make it checkable night to night — one clause, this lane's file, but
  it is a design call, not a defect fix.
