# notes/save-fix.md — FIXER, lane `save`, round 1

Owner of `site/js/store.js`, `site/sw.js` and their tests (`tests/job-save.test.mjs`,
`tests/state.test.mjs`, `tests/sw.test.mjs`, plus the J10/G7 fixtures in `tests/_helpers.mjs`).
Six findings landed here. **Four were fixed in this lane. Two (findings 1 and 2) are in
`site/js/screens/job.js`, which this lane does not own** — BUILD-POLICY.md §2, "Each ticket may
create/modify only the files it owns … If you need a change in a file you do not own, write the exact
request in `notes/<ticket>.md` under 'Requests'". The exact patch is in §Requests below, and the
evidence is re-verified against the tree as of this note.

`site/js/screens/job.js` and `site/js/job/state.js` were being written by another lane WHILE this
lane ran (`state.js` mtime moved 13:17 → 14:28 → 14:43 during the sitting, and `EXTRA_KEYS` gained
`quiet` mid-run), so editing them would have destroyed live work.

One **one-line** change outside the lane, marked as BUILD-POLICY §2 allows: the constant
`SAVE_BUDGET_KB` in `site/data/job.js`. It is the published budget this lane's suite asserts against,
and it could not be corrected from inside `store.js`.

---

## 1. [MAJOR → fixed] Crew ranks were deleted before they were archived (`site/js/store.js`)

**Confirmed.** `migrate()` ran `fillDefaults()` — which calls `normalizeGame()`, which filtered
`save.game.crew` against **this build's** `SKILL_IDS` — *before* `archiveUnit()` copied `game` into
`save.archive[<old unit>]`. Under the next unit's build that list is the NEXT unit's makes, so every
crew rank the next unit does not reuse was erased on the way into the archive, falsifying the claim at
`store.js`'s `ARCHIVED_KEYS` comment: *"Nothing is ever deleted … so 'zero data loss' is literal."*

Reproduced before the fix (`scratchpad/save-fix/handoff.mjs`, a 1A save manned on makes 1B does not reuse):

```
crew on disk before the swap:         {"ANG-SUM":2,"SEG-ADD":1,"VERT-ANG":2,"VOC":1}
archive[u1a].game.crew AFTER handoff: {"VOC":1}          <- three ranks deleted, not archived
```

### The fix

Not "stop filtering" — the live save must still be clean (notes/J4.md §7 → J10). The filter is
**skipped for exactly the one pass that is a handoff**, because on that pass `archiveUnit` resets the
live `game` to `freshGame()` anyway, so nothing foreign can reach play:

```diff
-export function normalizeGame(raw) {
+export function normalizeGame(raw, { makes = SKILL_IDS } = {}) {
-  const MAKES = new Set(SKILL_IDS);
+  const MAKES = makes === null ? null : new Set(makes);
-  if (isObj(g.crew)) for (…) { … if ((r === 1 || r === 2) && MAKES.has(k)) crew[k] = r; }
+  if (isObj(g.crew)) for (…) { … if ((r === 1 || r === 2) && (MAKES === null || MAKES.has(k))) crew[k] = r; }

-function fillDefaults(s, now) {
+function fillDefaults(s, now, { crewMakes = SKILL_IDS } = {}) {
-  out.game = normalizeGame(s.game);
+  out.game = normalizeGame(s.game, { makes: crewMakes });

 export function migrate(raw, now = Date.now(), { unit = null } = {}) {
+  const from = typeof s.unitId === 'string' && s.unitId ? s.unitId : LEGACY_UNIT_ID;
+  const handoff = !!unit && String(unit?.id ?? '') !== from;
-  const out = fillDefaults(s, now);
+  const out = fillDefaults(s, now, { crewMakes: handoff ? null : SKILL_IDS });
   return unit ? archiveUnit(out, unit, now) : out;
 }
```

After:

```
archive[u1a].game.crew AFTER handoff: {"ANG-SUM":2,"SEG-ADD":1,"VERT-ANG":2,"VOC":1}
live game.crew:                       {}
```

Every load path is covered, because all three go through `migrate(raw, now, { unit })`:
`createStore.load()` (store.js:663), `importJSON()` (store.js:710), and a direct `migrate()` call.
`migrateUnit()` (the Settings "start the next unit" button) archives the LIVE state, whose unit is by
definition this build's, so it has no foreign makes to lose.
`migrate()` with no `unit` — every pre-J10 caller — is byte-for-byte unchanged.

### The test that guarded it was vacuous, and now is not

`tests/job-save.test.mjs:595` asserted `Object.keys(archive['u1a'].game.crew).length === 12`. It ran
under the 1A build, where `_helpers.mjs`'s `MANNED` is a **subset** of `SKILL_IDS`, so the filter had
nothing to delete and the assertion could not fail. Two tests added:

* `crew ranks on makes THIS build does not know survive into the archive (the claim, made falsifiable)`
  — mans `TRI-CONG`, `PROOF`, `ANG-SUM`, and **first asserts each is absent from `SKILL_IDS`** so it
  can never silently become a tautology again;
* `a save opened under the SAME unit still has its crew cleaned` — pins that the skip is handoff-only.

---

## 2. [BLOCKER → fixed] The authority cited a superseded budget in five places (`COMPOSED-GAME.md`)

**Confirmed.** `COMPOSED.md:330` was corrected at integration to *"≈ 480 K chars of study layer + ≈ 26 K
of game layer = ≈ 506 K chars packed … Size < 520 KB"*, and the shipped assertions agree with it
(`job-save.test.mjs` `S6_BUDGET = 520 * KB`). `COMPOSED-GAME.md` — edited **after** `COMPOSED.md` — still
said 210/250/236/235 KB in five places, two of which are the J10 acceptance criterion, so J10 was
recorded as passing a criterion the shipped code does not meet. Measured:

```
$ node --test tests/state.test.mjs | grep worst-case
  worst-case save: 506720 chars = 480409 study + 26311 game   (= 494.8 KiB, not "≈ 236 KB")
```

Restated at L783-804 (the table and both notes), L846 (J10 acceptance), L897 (G10 #24) and L949
(G12 #18) to ≈ 480 K study + ≈ 26 K game ≈ 506 K chars against 520 KB, ≤ 26 KB added.
`site/js/store.js:63`'s stale "< 250 KB" comment fixed too. No code number was changed to suit the
doc: the code was the half that was right.

---

## 3. [MAJOR → fixed] The `inProgress.game` fixture was not the record the app serialises

**Confirmed, and it was worse than the per-line figures suggested.** `tests/_helpers.mjs`
`inProgressJob12` was a hand-written literal that nothing pinned (the module may not import from
`site/`), and it had drifted:

```
STATE_KEYS   : … stakes outcome locked posted bc last ph rating0 [quiet]
fixture keys : shape seed bundles picks tokens guard loose bagged chain calls briefs vault tGame tAnswer phase phaseAt
MISSING      : stakes outcome locked posted bc last ph rating0
fixture call : {"p":0.85,"ok":true,"w":0.2549,"skill":"FAC2","at":…,"rung":1,"carry":41}
real    call : {"call":50,"ok":true,"w":0.2549,"skill":"FAC2","rung":1,"d":0,"at":…}      (`cleanCall`)
```

So J10's "measured" budget was measuring a record `js/job/state.js` cannot produce.

**Fixed by making the fixture a FIXED POINT of the shipped serialiser.** The literal now carries all
25 `STATE_KEYS` and the real `cleanCall` shape, and `job-save.test.mjs` asserts
`deepEqual(serialize(freshState(fx)), fx)` plus "no key of `STATE_KEYS` is missing" — so a key added to
the record (as `quiet` was, mid-sitting) fails here until it is priced, and the fixture can never drift
again. `_helpers.mjs`'s house rule (no `site/` import) is kept: the pinning lives in the test, not the
helper.

Values are worst cases **taken from 60 real JOB12s driven through `state.js`**
(`scratchpad/save-fix/realmeasure.mjs`, leaf-length survey), not invented — which also corrects two of the
critic's own pessimistic assumptions:

* `calls[].w` is `round(w, 6)` in `call.js:346`, so 8 chars is its ceiling, not 18;
* `inProgress.game.posted` is `econ.round`ed at `startJob` (state.js:588), so it is an integer.

The genuinely un-rounded doubles the critic found **are** real and are now priced: `guard.dist`
(`0.3333333333333333`, observed) and `rating0` (`player.rating.value` = `clamp(raw, …)`, `call.js:381`
— never rounded). The `seed` is priced at its true length (`job|<crypto.randomUUID()>|<day>|<n>`), not
the 18-char stand-in.

Result: `inProgress.game` 3582 B → **4007 B (3.91 KB)**, against a published 2.1 KB.

---

## 4. [BLOCKER → fixed, as a measurement] G7's budget table was 5 lines under its true size

With the fixture corrected, every line was re-measured through `pack()` on the suite's own carrier:

| line | G7 stated | measured | new ceiling |
|---|---|---|---|
| `player` | 3.5 KB | **3.59 KB** | 3.7 |
| `game` | 11.8 KB | **13.91 KB** | 14.0 |
| `inProgress.game` | 2.1 KB | **3.91 KB** | 4.0 |
| `runs[]` delta × 40 | 4.8 KB | **4.26 KB** | 4.3 |
| subtotal | 17.4 KB | **21.41 KB** | 21.7 |
| total added | ≤ 26 KB | **25.69 KB** | ≤ 26 (unchanged — it still closes) |

`site/data/job.js` `SAVE_BUDGET_KB` (the one-line out-of-lane change) and `COMPOSED-GAME.md`'s table
now both carry these. The four line ceilings sum to exactly `totalAdded`.

**The per-line assertions were the real defect.** `job-save.test.mjs:438-440` asserted
`kb(x) < 2 * SAVE_BUDGET_KB.x` — a hardcoded constant checked against twice another hardcoded
constant, which could not fail unless a line MORE THAN DOUBLED, and did not fail while
`inProgress.game` sat 67 % over its published figure. They are now `got <= stated` per line, with the
slack printed (43-111 B) and a failure message that says *restate the line, do not widen the assertion*.
A fourth line (`runs[]` delta) and the subtotal were added to the same test.

---

## 5. [MAJOR → answered, not deleted] 4.26 KB of the budget is a reserved line, not a shipped cost

**The critic is right about the fact and I did not delete the fixture.** Re-verified just now:

```
$ grep -rn "pushRun\|makeRunRecord\|logForecast\|checkDailyGoal" site/js/screens/job.js site/js/job/
(no match)
$ grep -rn "ratingDelta" site/
(no match)
```

The suggested remedy was *either* make `screens/job.js` push the record *or* delete
`GAME_RUN_FIELDS` and restate the total at ≈ 21 KB. **Deleting it would bake in findings 1-2**: the
correct end state is the job screen writing a run record with those seven fields — that is what
findings 1 and 2 require, what `#/stats`' Page bests need, and what G7's table describes. So:

* `GAME_RUN_FIELDS` stays, and its doc comment now states plainly that **no shipped path writes it**,
  with the two greps, and says not to delete it to make the arithmetic tidy;
* `COMPOSED-GAME.md`'s table labels the line **"reserved, see below"** and a blockquote gives the real
  number the layer costs today;
* the suite measures and prints **both**, on every run, so the 17 % can never go quiet again:

```
  game keys added: 26311 B = 25.69 KB  (player 3678 · game 14240 · inProgress.game 4007 · runs delta 4386)
  without the runs[] game fields (what the app writes TODAY — no job pushes a run record): 21951 B = 21.44 KB
```

When the job screen starts pushing its record, the line becomes a real cost and the caveat comes out.

---

## Requests — `site/js/screens/job.js` (findings 1 and 2, both BLOCKER, NOT fixed here)

**Owner of that file, please apply this.** Both findings are confirmed against the current tree
(greps above). A finished job writes **no** `runs[]` record and **no** `forecastLog` point, so:

* ten identical clean answers earn `flawless-page` through `#/run/page` and nothing in a job —
  `runs` and `trophies` are both Ledger A keys (`job/state.js` `LEDGER_A_KEYS`), and
  COMPOSED-GAME.md L506 says Ledger A is *"never staked, never rolled back, never forfeited"*;
* `forecastLog` is **named** in the byte-identical claim at COMPOSED-GAME.md:506 and again at :860
  (G9 #8), and it is empty on the job arm;
* `screens/stats.js` `pageBest` can never see a job evening;
* a job finished late and closed on the debrief loses that day from the sparkline for good
  (`home.js:715` re-logs only TODAY's point — `readiness.js:258-271`), and `readinessDelta` then
  measures against D−2.

`endJob` already calls `finishPage` (state.js), which bumps `counters.pages`, so the job is
**half**-recorded as a page today. Mirror `run.js`'s `finish()` (run.js:986-993) in **both**
`finish()` and `doWalk()` in `screens/job.js`, inside the same `update()`:

```js
// screens/job.js — add to the imports it already has from './run.js' and the study layer
import { renameCard, sessionSplit, captureJobBefore, jobSummaryContext, renderJobSummary,
         pushRun, makeRunRecord, pageResults } from './run.js';
import { logForecast } from '../readiness.js';      // already imported for readiness()
import { checkDailyGoal } from '../schedule.js';

// …inside finish() / doWalk(), after endJob()/walk() has returned its debrief `out`:
const submittedAt = now();
const day = todayISO(new Date(submittedAt));
update((s) => {
  pushRun(s, makeRunRecord({
    kind: 'page',                                   // NOT 'job' — `flawless-page` and #/stats' Page
    seed: jobSeed, seedTag: jobSeedTag,             //   bests are keyed on 'page' and stay unreachable
    startedAt: jobStartedAt, submittedAt,           //   under any other kind
    results: pageResults(jobQueue),
    extra: {
      bagged: out.finalBagged, posted: out.posted,
      ratingDelta: out.ratingAfter - out.ratingBefore,
      guard: out.guard ?? null, cracked: !!out.cracked,
      tGame: out.tGame, tAnswer: out.tAnswer,
    },
  }));
  checkDailyGoal(s, day);
  logForecast(s, { today: day });
});
```

`pushRun`, `makeRunRecord` and `pageResults` are already exported from `screens/run.js`
(run.js:671, 690, 1021), which `job.js` already imports from. `seed` / `seedTag` / `startedAt` must be
captured at job start alongside the existing `jobQueue` / `jobBefore` holds, because
`endJob → finishPage()` nulls `inProgress` before `finish()` returns.

Two things to decide while applying it, which this lane cannot:

1. **a partial job.** A walk that leaves targets unanswered keeps the page open, and finishing those
   on `#/run/page` pushes a second `kind:'page'` record for the same page. Either push only when the
   job completed the page, or give the partial record a distinguishing `extra` and make sure
   `screens/stats.js` does not double-count. Whichever, say which in the note.
2. **the test.** Add one to `tests/job-ledger.test.mjs` that plays a real all-clean job and a real
   all-clean `#/run/page` from the same seeded save and asserts the **same trophy set** and the same
   `forecastLog`. That is the assertion COMPOSED-GAME.md:506 and :860 already promise and nothing
   currently makes.

When it lands, tell this lane: `GAME_RUN_FIELDS`' caveat in `tests/_helpers.mjs` and the
"reserved, see below" note in COMPOSED-GAME.md's budget table both come out, unchanged in number
(4.26 KB is already measured and already inside the 26 KB ceiling).

---

## Files touched

| file | why |
|---|---|
| `site/js/store.js` | the handoff crew fix; the stale "< 250 KB" comment |
| `tests/job-save.test.mjs` | 2 new handoff tests, the serialiser fixed-point test, per-line budget assertions, `STATE_KEYS`-driven reload coverage |
| `tests/_helpers.mjs` | `inProgressJob12` rebuilt to the real record; honest `GAME_RUN_FIELDS` doc |
| `tests/state.test.mjs` | one comment pointer to this note |
| `COMPOSED-GAME.md` | the budget table + 4 superseded 250 KB claims |
| `site/data/job.js` | **one line**, out of lane, marked: `SAVE_BUDGET_KB` restated |

`site/sw.js` needed no change — no finding touched it, and its precache suite is green.

The reproduction scripts are kept beside the note in `scratchpad/save-fix-r3/` and run from the repo
root (`node scratchpad/save-fix-r3/maxcalls2.mjs`): `corpus.mjs` (the seeded save builder),
`ipkeys.mjs` (finding 1's key-set diff), `qcost.mjs` / `qwidth.mjs` / `qtotal.mjs` (the queue's
unpriced bytes, per-key widths and whole-line totals for both a page and a job), `maxcalls2.mjs`
(the swap-shape defect, both forms side by side), `sweep.mjs` (6 000 jobs: calls, queue, bench),
`drafted.mjs` (the drafted/bench histograms behind `JOB_QUEUE_DRAFTED`), `corpsize.mjs` (how many
seeded saves the suite needs to reproduce 28).

## Suite state

Save-lane suites and their neighbours on their own — `job-save.test.mjs`, `state.test.mjs`,
`sw.test.mjs`, `trophies.test.mjs`, `job-ledger.test.mjs`, `integration-w5.test.mjs` →
**187 pass / 0 fail.**

`node --test tests/` → **2 723 tests, 2 713 pass, 6 fail** — and all six are in two files this lane
does not own, from the screen/board lane's in-flight work during this sitting (`site/js/screens/job.js`
mtime moved 15:14 → 20:24, `site/js/job/board.js` → 20:22, `site/css/job.css` → 20:17, with up to ten
other lanes' `node --test` processes running concurrently):

* `tests/job-screen.test.mjs` (225, 321, 705) — `the payout beat rides the fold…`; `the screen
  composes no user-facing sentence of its own` (`COPY.evidence` was added to `site/data/job.js:717`
  by another lane and the screen does not print it yet); the J6 Playwright layout harness.
* `tests/job-coldopen.test.mjs` (235, 262, 297) — the three J13 gates, including *"Home and the job
  screen printed different posted values for the same board"*: the primary button has just gained
  `posted 481 (−154 shared)` segments and the screen has not caught up.

Both files import only `read` / `repoPath` / `stripCommentsAndStrings` from `_helpers.mjs` — none of
the J10/G7 fixtures — and neither reads `SAVE_BUDGET_KB`, `store.js` or `sw.js`. The only line this
lane changed in `site/data/job.js` is `SAVE_BUDGET_KB` and its doc comment.

Two earlier full runs in the same sitting showed different sets, all transient for the same reason:
`job-board.test.mjs`'s primary-button test (that lane landed its fix; green again) and ten
`job-call.test.mjs` failures that were a mid-edit race — `site/js/job/call.js` was written at
20:26:04 while the run was in flight, and `node --test tests/job-call.test.mjs` is 106/106 after it.

## Suite state

`node --test tests/` → **2507 tests, 2503 pass, 0 fail, 4 skipped.** Green.

(Mid-sitting the full run showed 2-13 failures at different moments, all from other lanes' in-flight
edits to `site/js/job/*` — e.g. `job-copy.test.mjs` failed first on `site/js/job/guard.js -> good job`
and then on `site/js/job/econ.js -> you should`, neither of which exists in `git show HEAD:`. None of
them was this lane's: `SAVE_BUDGET_KB` and the J10/G7 fixtures in `_helpers.mjs` are imported by
`tests/job-save.test.mjs` and `tests/state.test.mjs` only, and both stayed green throughout. They
cleared as those lanes landed.)

Save-lane suites, run on their own: `job-save.test.mjs` + `state.test.mjs` → **112 pass / 0 fail**;
with `sw.test.mjs`, `trophies.test.mjs`, `integration-w5.test.mjs`, `job-ledger.test.mjs` →
**177 pass / 0 fail**.

---
---

# notes/save-fix.md — FIXER, lane `save`, **round 2**

Owner of `site/js/store.js`, `site/sw.js` and their tests (`tests/job-save.test.mjs`,
`tests/state.test.mjs`, `tests/sw.test.mjs`, plus the J10/G7 fixtures at the bottom of
`tests/_helpers.mjs`). Seven findings landed here. **Six were fixed in this lane. One (finding 7) is
in `site/js/screens/job.js`, which this lane does not own and which another lane was editing WHILE
this one ran** — during this sitting `site/js/screens/job.js` moved 15:14 → 17:41, `site/js/job/state.js`
17:39 → 17:49, `site/js/screens/run.js` → 17:47 and `tests/job-ledger.test.mjs` → 17:46, and five
other lanes were running `node --test tests/` concurrently — one of them runs
`pkill -f "node --test tests/"` before its own run, which killed this lane's. BUILD-POLICY.md §2 ("Each ticket may create/modify only the files it owns … If
you need a change in a file you do not own, write the exact request in `notes/<ticket>.md` under
'Requests'"). The ready-to-apply patch is in §Requests, re-verified against the tree as of this note.

Two **marked** out-of-lane one-liners in `site/data/job.js`, both forced by assertions this lane owns
(`job-save.test.mjs` asserts `freshGame()` deep-equals `SAVE_DEFAULTS.game`, so the two cannot be
changed separately): `SAVE_DEFAULTS.game.ledger.debriefAt` and the restated `SAVE_BUDGET_KB`.
G7's budget table and schema block in `COMPOSED-GAME.md` are restated with them.

---

## The one sentence

**Round 1 pinned the fixture's SHAPE and left its VALUES hand-typed; the published "≤ 26 KB
(measured 25.69)" was false by ~350 B and the whole suite was green.** Round 2 makes the fixture's
values come from the shipped writers, prices every unrounded double at a width nothing can exceed,
and — the part that matters — adds a test that drives REAL JOB12s through `js/job/state.js` and fails
if any leaf the app writes is wider, or any count larger, than the fixture prices it.

`SAVE_BUDGET_KB` is now `{ player: 4.0, game: 14.9, inProgress: 5.4, bench: 1.9, runsDelta: 5.4,
subtotal: 26.0, totalAdded: 31.6 }` — measured 31.32 KB, of which **25.97 KB is what the app costs
today** (the `runs[]` line is still reserved; see finding 7).

---

## 1-3. [BLOCKER ×3 → CONFIRMED and fixed] the headline, the `player` line and the `game` line

**All three confirmed, reproduced independently** — I rebuilt the round-1 carrier from
`tests/_helpers.mjs` as it stood and replaced ONLY the leaves the critic named with shipped-writer
output (`call.windowPush`/`callEntry` for the window, `call.ratingDetail().value` for
`rating.value` and every `log[].rating`, `call.ratingFrom()` for `records.bestRating20`,
`guard.elo()` for the pair, plus `ledger.debriefAt`):

```
$ node scratchpad/save-fix-r2/verify-critic.mjs
== the round-1 carrier, as published ==
  repo fixture total        26311 B = 25.69 KB      (what the suite printed)
  repo fixture, no runs[]   21951 B = 21.44 KB
== the same carrier, four leaves + debriefAt from the SHIPPED writers ==
  shipped-writer total      26964 B = 26.33 KB      ceiling 26 KB = 26624 B  -> OVER by 340 B
  shipped-writer, no runs[]  22604 B = 22.07 KB     subtotal 21.7 KB         -> OVER by 383 B
  margin the published number carried: 313 B
```

(The critic measured 26975 B / 351 B over; the 11 B difference is which Elo chain is substituted.
Same conclusion, same order of magnitude, independently derived.)

### What was actually wrong, in one line each

| leaf | fixture typed | the shipped writer emits |
|---|---|---|
| `calls[].w` | `0.2549` (6 ch) | `round(4·q̂·(1−q̂), 6)`; q̂ is `k/n`, `n ≤ 10`, so `0.888889` (8 ch) |
| `calls[].skill` | a 5-id cycle | `QUAD-SOLVE` is the longest `SKILL_IDS` entry — ×50 entries |
| `rating.value`, `bestRating20`, `log[].rating` | `7.1234` | `call.ratingDetail()` **clamps, it does not round**: `6.685919999999999` |
| `player.elo` | `{player:1187.5,house:1043.25}` | `guard.elo()` returns `P + k·(o − e)` raw: 55 B, not 33 |

### The fix — not a wider assertion, a rule and a measurement

1. **`WIDE_DOUBLE`** (`tests/_helpers.mjs`): `0.0000012345678901234567`, **24 characters**, 25 signed.
   That is the widest JSON form any finite double can take — `JSON.stringify` prints at most 17
   significant digits and below ~1e-7 switches to exponential, which is *shorter*. Verified by brute
   search over 8 M random IEEE-754 bit patterns (`scratchpad/save-fix-r2/widths.mjs`). **Every leaf a shipped
   writer leaves unrounded is now priced at this width**, so the same class of error cannot recur:
   `rating.value`, `records.bestRating20`, `player.elo.*`, `game.log[].rating`,
   `game.ledger.phaseMeans.*`, `game.heat.press.*`, `inProgress.game.rating0`, `guard.dist.*`,
   `runs[].ratingDelta`. Leaves the writers *do* round (`econ.round`, `Math.round`, `round(w,6)`)
   are priced as integers, and the note in the fixture says which and why.
2. **`job-save.test.mjs` "the fixture's values are what the shipped writers emit (rebuilt, not
   re-typed)"** — rebuilds the 50-entry window with the shipped `call.windowPush` and asserts
   `deepEqual` against `worstCasePlayer().rating.calls`; derives the widest `w` from the whole
   `k/n, n ≤ RATING.qHatWindow` domain and asserts the fixture prices it; asserts `WIDEST_SKILL` is
   still the longest `SKILL_IDS` entry; asserts `WIDE_DOUBLE` is 24 chars.
3. **`job-save.test.mjs` "the fixture is not NARROWER than the shipped writers: every leaf, measured
   on real jobs"** — 23 real JOB12s driven through `startJob → beginTargets → lockCall → applyTarget
   → bag/push → brief(swap) → crack`, half of them missing everything so requeues fire. For every
   leaf the budget prices, the widest JSON the corpus produces must be ≤ what the fixture prices.
   It prints the whole table on every run:

```
  widest real leaf vs priced (23 real jobs, 23 finished):
       ok player.rating.calls[]         real    70 B  priced    74 B
       ok player.rating.value           real    18 B  priced    24 B
       ok player.elo                    real    55 B  priced    68 B
       ok game.log[]                    real   168 B  priced   180 B
       ok game.ledger                   real   149 B  priced   260 B
       ok game.heat.press               real    97 B  priced   138 B
       ok inProgress.game.calls         real  1728 B  priced  2454 B
       ok inProgress.bench              real   625 B  priced  1893 B
       …38 leaves in all…
   counts: calls 21/26 · locks 32/60 (max per bundle 7/12) · bench 2/4
```

The failure message is `widen the fixture and RESTATE SAVE_BUDGET_KB, do not widen the assertion`.

   The corpus had to be made to write `game.tags` on purpose. `state.missTagsOf` reads the last
   `errors[]` row for the item and hands ITS tags to `index.trigger`, so a seeded save with no tagged
   errors produces **no Fault Index records at all** (`scratchpad/save-fix-r2/tags.mjs`:
   `saves with tags: 0/40`) — and `game.tags` is 8.10 KB, the single largest line of the budget, and
   was priced entirely by a hand-typed literal. The corpus now seeds `errors[].tags` from the real 68
   ids in `data/misconceptions.js`, and both the id and the record are measured:

```
       ok game.tags key                  real    29 B  priced    29 B     <- 27-char id, exactly the longest
       ok game.tags[]                    real    84 B  priced    91 B
```

4. **Completeness, before any width is compared.** A leaf that is priced nowhere is what
   `ledger.debriefAt` was, so the same test drives one more real job and asserts the KEY SETS of a
   real `save.player`, `save.game`, `game.ledger`, `game.heat`, `player.records`, `game.log[]` and
   `player.rating.calls[]` are exactly the key sets the fixtures price. A lane that adds a key fails
   there, naming it, instead of quietly widening the save.

---

## 4. [MAJOR → CONFIRMED and fixed] `game.ledger.debriefAt` was a shipped key no schema declared

**Confirmed.** `state.js` writes it on every job end (`gm.ledger = {…, debriefAt: now}`), a real save
carries it (`ledger {"jobs":8,…,"debriefAt":1790631954187}` out of a driven corpus), and it was in
none of the three places that are the schema. It reached disk only because `normalizeGame`'s `over()`
is a merge, not a whitelist — and it reached `closeDebrief`'s `now − debriefAt` subtraction uncoerced.

Fixed in all four places:

* `store.js` `freshGame().ledger` — `debriefAt: null`, with the reason;
* `store.js` `normalizeGame` — `led.debriefAt = Number.isFinite(led.debriefAt) && led.debriefAt >= 0
  ? +led.debriefAt : null`, so a string / NaN / Infinity / negative stamp cannot reach the fold;
* `data/job.js` `SAVE_DEFAULTS.game.ledger` (marked one-liner, forced by the deep-equal assertion);
* `COMPOSED-GAME.md` G7's `game` schema block, with a paragraph on what it is for, and a row in the
  budget table.

New test `game.ledger.debriefAt is declared, defaulted and COERCED — not an undeclared pass-through`:
one assertion per place it went missing, a grep that `state.js` still writes it (so the schema is not
documenting a dead key), and the eight bad values that must normalise to null.

---

## 5. [MAJOR → CONFIRMED and fixed] `inProgress.bench` was game bytes charged to the study half

**Confirmed both ways.** `page.startPage` writes 12 keys; `job.startJob` writes the same 12 plus
`game` **and** `bench`. `benchFor` spreads a whole composed queue item per undrafted target
(`...t.item`), so an entry is ~370 B. Measured over **600 seeded boards**:

```
$ node scratchpad/save-fix-r2/bench.mjs
bench: max bytes 685 · max entries 2 · widest entry 374 B
entry-count histogram: {"1":11,"2":589}
```

`withoutGameKeys` deleted `player`, `game`, `inProgress.game` and the `runs[]` fields — never
`bench` — and neither worst-case carrier created one, so the omission was invisible in both
directions at once: the bytes were charged to the STUDY half of the split AND left out of G7's
addition. Fixed:

* `withoutGameKeys` now deletes `s.inProgress.bench`, with the reason (`startPage` does not write it);
* new `worstCaseBench(now, n = 4)` fixture, 4 entries at ~460 B — **twice** the observed maximum;
* both carriers (`job-save.test.mjs` and `state.test.mjs`'s `worstCaseSave`) carry one;
* a `bench` row in `SAVE_BUDGET_KB` (1.9 KB), in G7's table and in G7's `inProgress` schema block;
* the budget test asserts the split MOVES when the bench does, so a `withoutGameKeys` that stops
  deleting it fails rather than silently mis-attributing 1.9 KB;
* the driven corpus asserts the real bench never exceeds the fixture's entry count.

The cheaper alternative the critic offered — bound `bench` in `benchFor` to
`{id, from, posted, basePosted, wing, critical}` — is in `js/job/state.js` and is filed in §Requests.

---

## 6. [MAJOR → CONFIRMED, fixed in the fixture, capped nowhere: request filed] `inProgress.game.calls`

**Confirmed, and the critic's diagnosis of *why* it survived is the important part.**
`serialize()` line `out.calls = (…).map(cleanCall)` has no `.slice()`, `applyCaps` touches
`player.rating.calls` / `game.log` / `game.heat.window` / `game.tags` and nothing on `inProgress`.
A call is written per **answered** target, not per **drafted** one, and the queue grows twice
(`page.requeueReview` on a missed review — bounded at `MAX_REQUEUE = 1` each — and `swapIn` at a
brief). Measured over 260 seeded JOB12s that miss everything and take every swap:

```
$ node scratchpad/save-fix-r2/sweep.mjs        (260 real jobs, sampled every beat)
  calls.n                 23          <- the fixture priced 12
  locks.total             33          <- the fixture priced 60
  locks.perBundle          7
  bench.entries            2
```

The critic is right that the round-1 line passed only because **the two errors pointed opposite
ways**: 5 bundles × 12 locks over-priced one axis by about what 12 calls under-priced the other, and
the 89 B of slack was their accidental difference. A per-line byte total cannot see that.

Fixed in this lane:

* the fixture prices **26 calls** (23 observed + headroom) and the `inProgress` line is restated
  5.34 KB measured / 5.4 KB stated;
* the driven-corpus test measures `calls`, total `locks`, locks-per-bundle and `bench` entries as
  **counts, separately**, and fails on each; the deliberate over-pricing of `locks` is now documented
  *as* over-pricing, with the real 33 printed beside it, so it can no longer hide anything;
* `store.js` `applyCaps` carries a block saying out loud what is NOT capped there and why a silent
  truncation would be wrong (`endJob` reads `g.calls.every(c => c.ok)` for `cleanJobs` and
  `g.calls.length` for the mint — truncating would change the GAME, not just the save).

A documented cap in `serialize()` is the better home for the bound; that file is not this lane's and
was being edited during this sitting. Filed in §Requests.

---

## 7. [BLOCKER → NOT FIXED HERE — `site/js/screens/job.js`, re-verified, patch below]

Re-verified against the tree as of this note:

```
$ grep -rn "pushRun\|makeRunRecord\|logForecast\|checkDailyGoal" site/js/screens/job.js site/js/job/
(no output)
$ grep -rn "ratingDelta" site/
(no output)
```

So the claim published at COMPOSED-GAME.md G3.7 proof 11 and G9 #8 — *"the same answer sequence
inside a job and through `#/run/page` produces byte-identical `cards`, `skills`, `xp`, `errors`,
`counters`, `forecastLog`"* — is still false for `forecastLog`, `flawless-page` is still unreachable
through a job, and a job finished near midnight still loses that day's forecast point for good.
`tests/job-ledger.test.mjs` still asserts the gap rather than the claim (its test is literally named
`THE GAP`). The exact patch is unchanged from round 1 and is repeated in §Requests below.

**IT IS LANDING WHILE THIS NOTE IS WRITTEN, and the budget does not move.** `site/js/screens/run.js`
grew a job-run push helper at ~l.1851-1910 during this sitting (`pushRun(s, makeRunRecord({…}))`,
`kind: 'page'`, only on a completed job) whose doc says the seven G7 fields are *deliberately* not
written. At the moment of writing `screens/job.js` has not yet called it (`grep -n "pushRun\|pushJobRun"
site/js/screens/job.js` → no output), so finding 7 is still open — but when it is wired up:

* the `runs[]` **budget** line is unaffected. A record without the seven fields costs STUDY bytes,
  not game bytes, so `SAVE_BUDGET_KB` does not move and `withoutGameKeys` already strips exactly the
  seven keys from every run record;
* `job-save.test.mjs`'s `THE RESERVED LINE IS STILL RESERVED` stays green and prints
  `a finished job pushes a runs[] record: YES (it costs study bytes, not game bytes — budget unchanged)`.

**That test was corrected this round for exactly this.** Round 1's version asserted TWO different
things at once — "no `pushRun(` in `screens/job.js`" (the finding-7 tripwire, which
`tests/job-ledger.test.mjs` owns) and "no `ratingDelta` under `site/`" (the budget fact) — and it
scanned RAW source, so it went red the moment `screens/run.js` gained a comment *saying* the fields
are not written. It now scans **comment-stripped** source for a write of `ratingDelta` only, and
reports the `pushRun` observation instead of asserting it. A budget suite must not red-line another
lane for a budget that did not move, and a prose mention of a field is not a write — which is what
`_helpers.mjs` `stripCommentsAndStrings` has existed for since T17.

---

## Known limits of this round — read these first in round 3

1. **`JOB_CALLS = 26` and `BENCH_ENTRIES = 4` are measured maxima with headroom, not proven
   ceilings.** The structural bounds are `2 × (drafted + bench)` ≈ 28 for calls (every queue item is
   answered at most twice, `MAX_REQUEUE = 1`) and, for the bench, the two undrafted contracts' whole
   target lists un-deduped (≈ 14 entries, ≈ 5 KB). The corpus reaches 23 and 2. The suite re-measures
   both on every run and fails if either passes the fixture, so a drift is caught — but a code change
   that makes the un-deduped case reachable would break the bound before the corpus happened to hit
   it. The way to turn either into a real ceiling is in §Requests B; both live in `js/job/state.js`.
2. **`game.tags` is priced at `CAPS.game.tags = 68` records, which happens to equal the number of ids
   in `data/misconceptions.js` exactly** — so "all 68 at once" is both the cap and the whole
   population. The id length (27) and the record width are now measured against real records.
3. **The `runs[]` line prices a record nothing writes** (finding 7). It is a sixth of `totalAdded`.
   `subtotal` is the number to quote for what the app costs today, and the suite asserts both.
4. `withoutGameKeys` is a TEST-only split; nothing under `site/` calls it. It defines what "the game
   layer added" means, so a key it forgets is a key charged to the wrong half — which is what
   happened to `inProgress.bench`. If another game-layer key is added to a STUDY-layer container,
   it has to be deleted there too.

---

## Requests

### A. `site/js/screens/job.js` — finding 7 (BLOCKER). Unchanged from round 1; still unapplied.

Mirror `screens/run.js`'s `finish()` (run.js ~986-994) in **both** `finish()` and `doWalk()`, inside
the same `update()`:

```js
import { renameCard, sessionSplit, captureJobBefore, jobSummaryContext, renderJobSummary,
         pushRun, makeRunRecord, pageResults } from './run.js';
import { logForecast } from '../readiness.js';
import { checkDailyGoal } from '../schedule.js';

// …inside finish() / doWalk(), after endJob()/walk() has returned its debrief `out`:
const submittedAt = now();
const day = todayISO(new Date(submittedAt));
update((s) => {
  pushRun(s, makeRunRecord({
    kind: 'page',                                   // NOT 'job' — `flawless-page` and #/stats' Page
    seed: jobSeed, seedTag: jobSeedTag,             //   bests are keyed on 'page'
    startedAt: jobStartedAt, submittedAt,
    results: pageResults(jobQueue),
    extra: {
      bagged: out.finalBagged, posted: out.posted,
      ratingDelta: out.ratingAfter - out.ratingBefore,
      guard: out.guard ?? null, cracked: !!out.cracked,
      tGame: out.tGame, tAnswer: out.tAnswer,
    },
  }));
  checkDailyGoal(s, day);
  logForecast(s, { today: day });
});
```

`seed` / `seedTag` / `startedAt` must be captured at job start beside the existing `jobQueue` /
`jobBefore` holds, because `endJob → finishPage()` nulls `inProgress` before `finish()` returns.
Two decisions this lane cannot make: (1) a partial job that is finished later on `#/run/page` would
push a second `kind:'page'` record for the same page — push only on completion, or distinguish it and
make `screens/stats.js` not double-count; (2) add the test `job-ledger.test.mjs` promises — one real
all-clean job and one real all-clean `#/run/page` from the same seeded save, same trophy set, same
`forecastLog` — then move `runs` and `forecastLog` back into the byte-identity comparison and delete
the `THE GAP` arm.

**When it lands, tell this lane**: `GAME_RUN_FIELDS`' caveat, the "reserved, see below" note in G7's
table, and `SAVE_BUDGET_KB.subtotal` all come out, and the `runs[]` line is re-measured off a real
completed record instead of off the fixture (it is priced at 5.4 KB and already inside `totalAdded`).

### B. `site/js/job/state.js` — finding 6, the real home for the bound (MAJOR).

Either of these closes it properly; this lane can only price it.

1. **Cap it where it is written**, with the bound stated:
   `case 'calls': out.calls = (Array.isArray(g.calls) ? g.calls : []).slice(-CAPS.jobCalls).map(cleanCall)`,
   with `CAPS.jobCalls` added to `data/job.js` — but see the `applyCaps` note in `store.js`: a
   truncation changes `cleanJobs` and the clean-vault mint, so the cap must be above any reachable
   length (26 observed max is 23), not a working cap.
2. **Or bound `bench` instead** (finding 5's alternative), which also bounds the swap-ins that grow
   the queue: in `benchFor`, store `{id, from, sources, wing, posted, basePosted, critical, declined}`
   rather than `...t.item`, and have `swapIn` rehydrate from the composed queue. ~60 B an entry
   instead of ~370, and `SAVE_BUDGET_KB.bench` drops from 1.9 KB to ~0.3 KB.

If either lands, `SAVE_BUDGET_KB` and G7's table are re-measured — `job-save.test.mjs` will go red
and name the line.

---

## Files touched

| file | why |
|---|---|
| `site/js/store.js` | `freshGame().ledger.debriefAt`; `normalizeGame`'s coercion for it; the "five caps" comment; the `applyCaps` note on what is deliberately NOT capped |
| `tests/_helpers.mjs` | the J10/G7 fixtures rebuilt: `WIDE_DOUBLE`/`WIDE_SIGNED_DOUBLE`/`WIDEST_SKILL`/`WIDEST_W`, `worstCasePlayer`/`worstCaseGame`/`inProgressJob12` re-valued, new `worstCaseBench`, `withoutGameKeys` deletes `inProgress.bench` |
| `tests/job-save.test.mjs` | bench on the carrier + its own budget line; 2 new tests (writer identity, the driven-corpus width/count check); the `debriefAt` schema test; the line table gains `bench` and a "lines sum to the headline" assertion; a seeded real-job corpus |
| `tests/state.test.mjs` | `worstCaseSave()`'s `inProgress` gains a bench |
| `site/data/job.js` | **two marked one-liners**: `SAVE_DEFAULTS.game.ledger.debriefAt`, `SAVE_BUDGET_KB` restated |
| `scratchpad/save-fix-r2/` | the evidence, runnable: `tags.mjs` (why a plain corpus writes no tags), `verify-critic.mjs` (reproduces the critic's number off the round-1 fixture, kept as `_helpers.backup.mjs`), `sweep.mjs` / `bench.mjs` / `survey2.mjs` (the real-job maxima), `widths.mjs` (the 24-character proof), `price.mjs` (the per-line table) |
| `COMPOSED-GAME.md` | G7's budget table and both schema blocks; the J10 acceptance line; G10 #24; G12 #18; `CAPS.game`'s "four caps" → five |

`site/sw.js` needed no change — no finding touched it, and its precache suite is green.

---

## Suite state

**`cd /Users/oliver/Projects/unit1a-quest && node --test tests/` → 2611 tests, 2607 pass, 0 fail,
4 skipped. GREEN.**

Lane suites, run on their own:

```
$ node --test tests/job-save.test.mjs tests/state.test.mjs tests/sw.test.mjs
ℹ tests 129   ℹ pass 129   ℹ fail 0
```

`job-save.test.mjs` alone: **61 pass / 0 fail**, 58 before this round — three new tests (the
writer-identity rebuild, the driven-corpus width/count/completeness check, and the `debriefAt`
schema test) plus new assertions inside three existing ones (the bench half of the split, the
`bench` budget row, and "the line ceilings sum to the headline").

What it prints on every run, and what makes the published number true rather than asserted:

```
  widest real leaf vs priced (23 real jobs, 23 finished):
       ok player.rating.calls[]         real    70 B  priced    74 B
       ok player.rating.value           real    18 B  priced    24 B
       ok player.elo                    real    55 B  priced    68 B
       ok game.log[]                    real   168 B  priced   180 B
       ok game.ledger                   real   149 B  priced   260 B
       ok game.heat.press               real    97 B  priced   138 B
       ok game.tags key                 real    29 B  priced    29 B
       ok game.tags[]                   real    84 B  priced    91 B
       ok inProgress.game.calls         real  1728 B  priced  2454 B
       ok inProgress.bench              real   625 B  priced  1893 B
       …40 leaves in all…
   counts: calls 23/26 · locks 32/60 (max per bundle 7/12) · bench 2/4
  game keys added: 32076 B = 31.32 KB  (player 4009 · game 15190 · inProgress.game 5469 ·
                                        inProgress.bench 1893 · runs delta 5515)
  without the reserved runs[] game fields (what the app writes TODAY): 26596 B = 25.97 KB
  player 3.92/4 KB (87 B slack) · game 14.83/14.9 (68 B) · inProgress.game 5.34/5.4 (61 B) ·
  inProgress.bench 1.85/1.9 (53 B) · runs[] delta 5.35/5.4 (50 B)
  worst-case save: 512485 chars = 480409 study + 32076 game
  a finished job pushes a runs[] record: no — notes/save-fix.md finding 7 is still open
```

### Getting there took three full runs, and none of the noise was this lane's

Five other lanes were editing `site/js/job/*`, `site/js/screens/*` and their suites throughout this
sitting and running the full suite concurrently — one of them runs `pkill -f "node --test tests/"`
before its own run, which killed this lane's twice (hence `node --test ./tests/`, a path that pattern
does not match). The red set moved every run as they landed: 16 failures at 17:45, 5 at 17:52, 3 at
18:04, 0 at 18:10 — in `job-board`, `job-supply`, `job-exploit`, `job-index`, `job-ledger`,
`job-screen`, `job-week`, `job-state` and `job-split`.

None of it was this lane's, and that was checked rather than assumed. Only two suites import anything
this lane owns:

```
$ grep -ln "worstCasePlayer\|worstCaseGame\|inProgressJob12\|GAME_RUN_FIELDS\|withoutGameKeys\|worstCaseBench\|SAVE_BUDGET_KB" tests/*.mjs
tests/_helpers.mjs  tests/job-save.test.mjs  tests/state.test.mjs
```

and the two that looked closest to this lane's change (`job-split`'s J8 split criterion and
`job-board`'s ledger split — both name `game.ledger`) were **A/B'd, not argued about**: a fresh copy
of the then-current tree with EVERY `site/` change of this lane reverted (`freshGame`'s `debriefAt`,
`normalizeGame`'s coercion, `SAVE_DEFAULTS`, `SAVE_BUDGET_KB`) failed them identically.
`closeDebrief` — the only reader of `ledger.debriefAt` — is not called in either suite. Both went
green on their own once their lane landed, with this lane's changes in place.

Two suites that could see the `freshGame()` / `normalizeGame` change at all, run on their own:
`trophies`, `page`, `run`, `schedule`, `mock`, `plan`, `integration-w4`, `integration-w5`, `home-r1`,
`home-r2` → **322 pass / 0 fail**; `job-crew`, `job-debrief`, `job-align`, `job-monotone`,
`job-split`, `binder-r2`, `boss`, `fix5-integrate`, `fix5-home` → **301 pass / 0 fail**.

### One full-run failure WAS this lane's, and it is fixed

`THE RESERVED LINE IS STILL RESERVED` went red the moment `screens/run.js` gained a doc comment
*mentioning* `ratingDelta` — to say the seven fields are deliberately NOT written. A prose mention of
a field is not a write. The scan is now comment-stripped (`_helpers.mjs` `stripCommentsAndStrings`,
which exists for exactly this), and the `pushRun` half of that test — which is finding 7's tripwire
and belongs to `tests/job-ledger.test.mjs`, not to a budget suite — is reported rather than asserted.
A budget suite must not red-line another lane for a budget that did not move.

---
---

# notes/save-fix.md — FIXER, lane `save`, **round 3**

Owner of `site/js/store.js`, `site/sw.js` and their tests (`tests/job-save.test.mjs`,
`tests/state.test.mjs`, `tests/sw.test.mjs`, plus the J10/G7 fixtures at the bottom of
`tests/_helpers.mjs`). Three findings landed here. **All three are CONFIRMED and fixed**, and
finding 2 turned out to be worse than the critic measured — for the same reason the critic's own
number was wrong.

Out-of-lane changes, marked as BUILD-POLICY §2 requires, all of them numbers this lane's assertions
own and which could not be corrected from inside `store.js`:
`site/data/job.js` `SAVE_BUDGET_KB` (one line + its doc comment), `COMPOSED-GAME.md` G7's budget
table and the three places that published the old figures, and `COMPOSED.md:330`'s "Size < 520 KB"
(one line). Nothing else outside the lane was touched.

---

## The one sentence

**Rounds 1-2 fixed the `inProgress` KEY LIST and the top-level keys; round 3 is the same defect one
level deeper — the fields the layer adds to the ENTRIES of a shared key, the trophies only a job can
earn, and a "measured maximum" that was measured on a corpus which never exercised the thing it
claimed to.** The published `≤ 31.6 KB` was false; the budget is now `≤ 37.1 KB` (measured 36.84),
and the call/queue count is a DERIVED ceiling instead of a corpus reading.

---

## 1. [BLOCKER → CONFIRMED and fixed] `inProgress.queue` carries 8 game-only fields nothing priced

**Confirmed, independently, by calling both shipped writers on the same save**
(`scratchpad/save-fix-r3/ipkeys.mjs` — kept in the session scratchpad; reproduced here):

```
startPage inProgress keys: day dayIndex hearts idx kind meta pageIndex queue seed seedTag startedAt xp
startJob  inProgress keys: … PLUS bench, game
page queue item keys: bucket done forCard id isRematch isReview isVariant kind module n overdue
                      result role seed sheet skill skills sweep template tier
job  queue item keys: … PLUS from sources wing posted x2 critical
measured: queue 3989 B vs stripped 2974 B -> delta 1015 B  (12 items)
```

The six come from `site/js/page.js` `draftUnion` (it spreads `...t.item` and adds them); a swap adds
two more, because `state.swapIn` splices `benchFor` entries into the queue and those carry
`basePosted` and `declined` as well — verified by driving real swaps, not by reading the code:

```
$ node scratchpad/save-fix-r3/maxcalls2.mjs          # 1 600 real JOB12s, shipped swap action
{"benchKeysReachingQueue":["basePosted","declined"], …}
```

`composePage` is untouched by the layer, so a `settings.game = false` page never writes one of them.
By G7's own attribution rule — the one that moved `inProgress.bench` in round 2 — they are the
layer's bytes, and `withoutGameKeys` was charging every one of them to the STUDY half while both
carriers dodged the line entirely (`job-save.test.mjs` used `queue: []`, `state.test.mjs` 24
synthetic items with study keys only). Worst case over 600 real boards driven to the end: **2 502 B**
of unpriced fields on a 28-entry queue.

### The fix

* `GAME_QUEUE_FIELDS` (`tests/_helpers.mjs`) names all eight at their widest, and `withoutGameKeys`
  deletes them from every `inProgress.queue` entry.
* `worstCaseJobQueue(now, n)` — a REAL drafted job queue at `JOB_QUEUE_ITEMS` entries, every leaf at
  the width real jobs write (`result` 137 B at a third-wrong miss, `rename` 49 B on a figure card,
  `skills` 25 B, …). **Both carriers now use it** instead of `[]` / synthetic items.
* G7's table gains an `inProgress.queue` DELTA row (4.39 KB measured, 4.4 KB stated) — a delta, like
  `runs[]`, because both halves write the key and only the added fields are the layer's.
* `job-save.test.mjs` now measures the queue per key against the real corpus, asserts the fixture
  prices every key a real entry carries, asserts the whole-line width, and asserts the split moves
  when the queue does (`qDelta > 1 KB`) so a `withoutGameKeys` that stops deleting them fails.

`overdue` is deliberately NOT priced at `WIDE_DOUBLE`: `composePage` writes
`Math.round(d.overdue * 10) / 10` (`page.js:282`), so it is a 1-dp number. Pricing it as an unrounded
double would have been 17 B × 36 entries of pure fat on the most expensive line in the table.

---

## 2. [MAJOR → CONFIRMED, and the critic's own figure was too low] the call maximum

**Confirmed that 23 is false. The critic said the real figure is 26 — it is 28 — and the reason the
critic stopped at 26 is the reason the repo stopped at 23.**

`tests/job-save.test.mjs`'s corpus drove `brief(save, { swap: o[0].id })`. `state.brief` takes
`{ swap: { id } }`:

```js
// site/js/job/state.js
if (isObj(actions.swap) && str(actions.swap.id)) { swapped = swapIn(s, actions.swap.id); … }
// site/js/screens/job.js:1150 — what the UI actually sends
onclick: () => takeBrief({ swap: { id: o.id } }),
```

A non-object `swap` is silently ignored. So *"260 seeded jobs that miss everything and **take every
swap** reach 23"* took **no swaps at all**, and the number it published was the maximum of jobs whose
queue could not grow by a swap. Corrected to the shipped action shape:

```
$ node scratchpad/save-fix-r3/maxcalls2.mjs      # 1 600 real JOB12s
  { swap: o[0].id }        (repo's form) -> maxCalls 26, swaps actually taken 0
  { swap: { id: o[0].id } } (shipped form) -> maxCalls 28, swaps taken 3177
$ node scratchpad/save-fix-r3/sweep.mjs 500      # 6 000 real JOB12s
  {"maxCalls":28,"maxQueueItems":28,"maxUnpricedQueueBytes":2502,"maxBench":2}
```

**28 against a fixture that priced 26, on the tightest line in the table (61 B of slack).** The
critic's 26 is what you get from the same driver bug on a different corpus.

### The fix — derive the ceiling, do not observe it

A third round of "raise the number to the newest observation" would have been the same mistake a
third time. The bound is now structural and the formula's inputs are each asserted:

```
queue ≤ (drafted + bench) + one re-queue each   ( page.MAX_REQUEUE = 1, and the copy carries
                                                  `requeued: 1`, so there is no third )
      = 2 × (JOB_QUEUE_DRAFTED + BENCH_ENTRIES) = 2 × (14 + 4) = 36
calls ≤ queue                                     ( one call per ANSWERED entry )
```

`JOB_QUEUE_DRAFTED = 14` is the observed 13 (4 800 boards: `{12: 4754, 13: 46}`) plus one;
`BENCH_ENTRIES = 4` is the observed 2 doubled, unchanged from round 2. `job-save.test.mjs` asserts
**every link**: drafted ≤ 14, bench ≤ 4, queue ≤ 36, calls ≤ 36, `JOB_QUEUE_ITEMS === 2 × (14 + 4)`,
and `calls fixture length === queue fixture length` — so a board that starts drafting 15 fails on the
DRAFTED line, naming it, instead of silently eating the derived headroom.

And the driver bug itself is now a test: **`assert.ok(swapsTaken > 0)`**, with the message spelling
out the action shape. The corpus was also widened from 14 saves to 80 (89 jobs, +200 ms), half of
them all-overdue week-off catch-ups, which is where the longest boards come from — it reproduces 28.

Live output:

```
counts: calls 28/36 · queue 28/36 (drafted 13/14) · locks 33/60 · bench 2/4 · swaps taken 177
```

A real cap in `state.serialize()` is still the better home for the bound (round 2 §Requests B); it is
`js/job/state.js`, not this lane's, and a naive cap would change the GAME.

---

## 3. [MAJOR → CONFIRMED and fixed] the six job-only trophies were in neither half

**Confirmed.** `site/data/trophies.js:308-334` defines `crew-held, index-25, index-68, chain-8,
calibrated, clean-getaway`; every predicate reads `game.crew` / `game.tags` / `player.records` /
`player.rating.calls` and nothing else, so only a job can earn one. `site/js/trophies.js:290` writes
`save.trophies[id] = { at: now }` — 199 B into a top-level STUDY key that `withoutGameKeys` kept, and
neither carrier held one (`job-save.test.mjs` wrote no trophies; `state.test.mjs` wrote 40 synthetic
`sheet-gold:AP-i` ids), so the line was measured in neither half.

Fixed the same way: `GAME_TROPHY_IDS` + `worstCaseGameTrophies(now)` in `_helpers.mjs`,
`withoutGameKeys` deletes the six, both carriers carry them, G7 gains a `trophies` delta row
(0.19 KB measured, 0.2 KB stated), and `job-save.test.mjs` asserts the split moves when they do.

---

## The rule itself is now machine-checked — which is the part meant to end this series

Three rounds running, one rule decided every number in the table: *a field the GAME layer's writer
adds, that the STUDY layer's equivalent writer does not, is the layer's cost.* Three rounds running
it was applied BY HAND to whatever the last finding named — the two top-level keys, then
`inProgress.game`, then `inProgress.bench` — and each time the level below went unnoticed. Two new
tests in `job-save.test.mjs` derive it instead of maintaining it:

* **`GAME_QUEUE_FIELDS is exactly what startJob adds to a queue entry that startPage does not`** —
  starts a page and a job from the SAME seeded save through the two shipped writers and asserts the
  difference of their queue-entry key sets (plus the bench, which `swapIn` splices in) equals the set
  `withoutGameKeys` deletes. A field added to `page.draftUnion` or `state.benchFor` that nobody
  prices now fails here, naming it, before it can be charged to the study half.
* **`GAME_TROPHY_IDS is every trophy whose predicate reads only the game layer`** — scans
  `site/data/trophies.js` per `def()` block and asserts the set of trophies whose bodies call
  `wingsManned` / `sealedTags` / `bestChain` / `rollingBrier` / `cleanGetaway` is exactly the six
  priced. A seventh game trophy fails here instead of landing unpriced.

Neither is a wider assertion; both replace a comment with a derivation.

---

## The restated budget

`SAVE_BUDGET_KB` is now
`{ player: 4.0, game: 14.9, inProgress: 6.3, bench: 1.9, queueDelta: 4.4, trophies: 0.2,
   runsDelta: 5.4, subtotal: 31.5, totalAdded: 37.1 }`.

```
  player                 3.92 KB of 4 KB    (87 B slack)
  game                   14.83 KB of 14.9 KB (68 B slack)
  inProgress.game        6.27 KB of 6.3 KB  (29 B slack)
  inProgress.bench       1.85 KB of 1.9 KB  (53 B slack)
  inProgress.queue delta 4.39 KB of 4.4 KB  (6 B slack)      <- new
  trophies delta         0.19 KB of 0.2 KB  (7 B slack)      <- new
  runs[] delta           5.35 KB of 5.4 KB  (50 B slack)     (still RESERVED — nothing writes it)
  subtotal               31.46 KB of 31.5 KB (44 B slack)
  game keys added: 37727 B = 36.84 KB
```

Two structural improvements to the table's own assertions, so a future row cannot go missing the way
these two did:

* the `subtotal` is now **derived from the row list** (`lines` minus the reserved `runs[]` row), not
  re-listed by hand — a row added above is automatically in it;
* each row asserts `typeof stated === 'number'`, so a measured line with no published ceiling fails
  instead of comparing against `undefined`.

---

## The S6 arithmetic, restated — and one number that is NOT this lane's

`job-save.test.mjs`'s S6 test used to add the game delta to a hardcoded `480 * KB`. That figure was
`state.test.mjs`'s reading from two rounds ago; summing two BOUNDS is a bound, summing a bound and a
stale reading is nothing. It now computes `500 000 (T01's study bound) + SAVE_BUDGET_KB.totalAdded`:

```
  against COMPOSED S6: study bound 488.3 KB + added 37.1 KB = 525.4 KB of 528 KB
  worst-case save: 536191 chars = 498463 study + 37728 game
  slack: study 1537 chars of 500000 · game 262 B of 37990
```

`COMPOSED.md:330`'s `Size < 520 KB` was arithmetically `500 000 + 31.6 KB`, so **any** correct
increase in the addition breaks it. Restated to **< 528 KB** with the measured split, marked as an
out-of-lane one-liner.

### Requests — for the owner of T01's 500 000-char study bound

**The study half now measures 498 463 against 500 000 — ≈ 1.5 KB of slack, where it used to read
480 409. The study layer did not grow.** Its worst-case carrier stopped under-pricing
`inProgress.queue`: T01 measured it as 24 synthetic items (~2.1 KB), and a real Page answered to the
end is much larger. Measured with the shipped `page.startPage` / `markItem` / `requeueReview`
(`scratchpad/save-fix-r3/qtotal.mjs`):

```
a real PAGE queue, composed:          6 447 B over 26 entries
a real PAGE queue, answered + requeued: 14 283 B over 43 entries
a real JOB  queue, driven to the end: 13 303 B over 28 entries
```

So T01's bound was set against a queue ~7× narrower than the study layer's own worst case, and the
1.5 KB of slack it now shows is the honest remainder. **This was not narrowed to make the number fit**
— the fixture is a per-key upper bound and stays one. The remedy is to restate the 500 000 off a real
answered page queue (the caps around it are product rules, and the total is still a fifth of the 5 MB
quota), NOT to cap `inProgress.queue`: truncating a live queue would delete unanswered items a
student still owes, which COMPOSED's global rule 5 forbids. It is recorded here rather than fixed
because `site/js/page.js` and T01's constant are not this lane's.

(Round 2 §Requests — `screens/job.js` pushing a `runs[]` record, and a cap in `state.serialize()` —
are both still open and unchanged.)

---

## Files touched

| file | why |
|---|---|
| `tests/_helpers.mjs` | `GAME_QUEUE_FIELDS`, `worstCaseJobQueue`, `GAME_TROPHY_IDS`, `worstCaseGameTrophies`; `withoutGameKeys` strips the queue fields and the six trophies; `JOB_QUEUE_DRAFTED` / `BENCH_ENTRIES` / `JOB_QUEUE_ITEMS` exported and the call count derived; four leaf widths corrected (`picks`, `tAnswer`, the queue booleans, `overdue`) |
| `tests/job-save.test.mjs` | the swap-shape bug in the corpus driver; corpus 14 → 80 saves with an all-overdue arm; per-queue-key width table; the structural-chain assertions and the swaps-taken non-vacuity check; **two new tests that DERIVE the attribution rule** from `startPage` vs `startJob` and from `data/trophies.js`; two new budget rows; carrier gains a real queue and the six trophies; subtotal derived from the rows; the S6 test sums BOUNDS |
| `tests/state.test.mjs` | carrier gains `worstCaseJobQueue` and the six trophies; the size-bound test prints both halves' slack and says what moved |
| `site/js/store.js` | the `applyCaps` "what is NOT capped" note restated off the derived ceiling, with the swap-shape trap spelled out; the `< 520 KB` comment |
| `site/data/job.js` | **one line**, out of lane, marked: `SAVE_BUDGET_KB` + its doc comment |
| `COMPOSED-GAME.md` | G7's schema block, budget table, the round-3 blockquote, the S6 paragraph, J10's acceptance row, G10 #24, G12 #18 |
| `COMPOSED.md` | **one line**, out of lane, marked: S6's `Size < 520 KB` and the measured split |

`site/sw.js` needed no change — no finding touched it, and its precache suite is green.
