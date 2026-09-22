# notes/meta-fix.md — J7 "meta" lane, round 2

Lane files (COMPOSED-GAME.md:845, J7 row): `site/js/screens/stats.js`, `site/js/screens/settings.js`,
`site/data/trophies.js`. (`js/job/index.js` is in the same J7 row but is the `index` lane's — see
`notes/index-fix.md`.) Baseline before this round: `node --test tests/` = 2506 pass / 0 fail.

## 1. The four routed findings were mis-routed — none is in this lane

All four name files owned by lanes that were editing them *during this round*. I did not touch any of
them. Evidence that the ownership boundary is real, not a technicality:

```
$ stat -f "%Sm %N" -t "%Y-%m-%d %H:%M" <files>          # round-2 fixers running ~17:27
2026-09-21 14:37  site/js/screens/home.js      <- finding 3
2026-09-21 15:14  site/js/screens/job.js       <- finding 2
2026-09-21 14:58  site/js/job/board.js
2026-09-21 15:06  COMPOSED-GAME.md             <- finding 1
2026-09-16 23:16  site/js/sound.js             <- finding 4
2026-09-18 04:31  site/js/screens/stats.js     <- MINE (3 days cold)
2026-09-18 04:27  site/js/screens/settings.js  <- MINE
2026-09-18 04:22  site/data/trophies.js        <- MINE
```

I verified all four findings are **real** before declining them (details in the round-2 return value,
summarised here so the re-route does not have to re-derive them):

1. **Confirmed.** `COMPOSED-GAME.md:506` and `:866` publish byte-identity of `forecastLog`, while
   `tests/job-ledger.test.mjs:643-645` asserts the opposite and says so in its own message. Fix lands in
   `COMPOSED-GAME.md` (doc) or the job finish path. `forecastLog` is written by `js/readiness.js:259`
   (`logForecast`), never by a file in this lane.
2. **Confirmed.** `site/js/screens/job.js` — debrief tiles on a zero-target walk.
3. **Confirmed.** `site/js/screens/home.js:279-282` keeps the shape-blind raw Σ ratio with no
   `targets > 0` filter; `site/js/job/board.js:367-369` has the fixed per-draft form. `boardModel`
   should call board.js's projection. Test to re-point: `tests/job-week.test.mjs:938-946`.
4. **Confirmed.** `site/js/sound.js:21` `CUES` is untouched; the job layer contains no audio at all
   (`grep -rniE "audiocontext|play\(|sound" site/js/job/ site/js/screens/job.js site/css/job.css` →
   no output). `settings.js` imports `sound.js` but only for the Settings test button (`play('mint')`);
   appending cues to `CUES` needs no change here.

## 2. What I did fix — the same defect class, inside this lane

The critics' theme in round 2 was *a published number that no longer tracks the thing it describes, with
a test that compares a literal to a literal*. This lane's three files are the app's two "print the
formula" surfaces, so that class is native here. Four sites were restating constants instead of
interpolating them — each correct today, each silently wrong after any rebalance:

| file | was | now |
|---|---|---|
| `screens/stats.js` | `' · at or under 0.10'` / `' · the bar is 0.10'` | `${n2(RATING.calibratedBrierMax)}` |
| `screens/stats.js` | `capacity = 8 + floor(level / 2) … ${7} stamps` · `STEADY costs 1` · `HELD costs 2` · `chain at 3` | `${cap.base}`, `${CREW.levelsPerPoint}`, `${STAMPS_MAX}`, `${COSTS.STEADY}`, `${COSTS.HELD}`, `${CHAIN_HOLD_MIN}` |
| `screens/stats.js` | `'12 manned costs 12 points and the remaining 10 buy 10 HELD upgrades — 10 HELD, 2 STEADY, and seven makes always bare'` | `${MANNED_MAX}`, `${MANNED_MAX * COSTS.STEADY}`, `${CAPACITY_MAX - MANNED_MAX * COSTS.STEADY}`, `${CREW.maxBuildAtCeiling.{held,steady,bare}}` |
| `screens/settings.js` | `'The second derivative is −80'` | `−${2 * CREDIT.k}` |
| `data/trophies.js` | `index-25` `25`×3 · `index-68` `'all 68 … the sixty-eight mistakes'` · `chain-8` `'chain of 8 … at ×2.6'` · `calibrated` `'0.10 … over 20'` | `${INDEX_PART}`, `${INDEX_TAGS}`, `${CHAIN_DEEP}`, `${CHAIN_MULT_CAP}`, `${CALIBRATED_BRIER_MAX.toFixed(2)}`, `${CALIBRATED_WINDOW}` |

Every rendered string is **byte-identical today** (verified by rendering both forms side by side), with
two deliberate exceptions: `seven makes` → `7 makes` and `the sixty-eight mistakes` → `the 68 mistakes`,
so the numerals in those sentences are consistent and derived.

`trophies.js` still does not import `data/job.js` — that is its deliberate boot-path decision (41 KB a
student with the layer off never loads). The numbers stay repeated as local consts; the new test pins
each to its `data/job.js` original instead, the same discipline `GAME_WINGS` already uses.

Imports added: `stats.js` ← `COSTS, CAPACITY_MAX, STAMPS_MAX, CHAIN_HOLD_MIN` from `js/job/crew.js` and
`CREW` from `data/job.js`. `settings.js` needed none (`CREDIT` was already imported). No other lane's
file was touched.

## 3. New test — `tests/job-meta-constants.test.mjs` (9 tests)

Deliberately a **new file**: `tests/job-index.test.mjs` also covers this lane's two screens but is shared
with the `index` lane, which is live.

Two arms, because either alone is the bug the critics found:

- **source arm** — the sentence must *interpolate* (`${CREDIT.k}`), asserted by regex over the source,
  because `${CREDIT.k}` and `40` render identically today and only diverge on the day it changes. This is
  the arm that a literal-vs-literal test cannot have.
- **arithmetic arm** — the interpolated constant must also be *true*: `maxBuildAtCeiling` is checked
  against `capacityMax − mannedMax·COSTS.STEADY`, the two index trophies against
  `FAULT_INDEX.milestones`, `chain-8` against `CHAIN.cap`/`CHAIN.multCap`, `calibrated` against
  `RATING.calibrated*`, and `c(p,o)` is numerically shown strictly proper with `d²E/dp² = −2k`.

**Mutation-tested, so it is not another literal-vs-literal test.** Reverting two of the fixes to their
old literals and re-running:

```
✖ Stats prints the Brier bar from RATING.calibratedBrierMax, never as "0.10"
✖ the trophy descriptions interpolate rather than restate
ℹ pass 7   ℹ fail 2
```

Restored → 9/9 pass.

## Requests for other owners

- **home lane** — finding 3: point `boardModel` at `board.js`'s projection (or restate its fixed form)
  and re-point `tests/job-week.test.mjs:938-946` off its five-identical-JOB window, which is the one
  window shape where the wrong formula and the right one agree.
- **job/screen lane** — finding 2: suppress split/density/per-item tiles at 0 targets answered.
- **doc owner** — finding 1: `COMPOSED-GAME.md:506` and `:866` must stop naming `forecastLog`, or the job
  path must log one. `tests/job-ledger.test.mjs:643-645` already says which.
- **sound/job lane** — finding 4: either wire `SOUND_CUES` into `sound.js` `CUES` + `screens/job.js` call
  sites (respecting the existing quiet-hours mute), or strike the row from G7 and the sentence from G6.

## Note for whoever reads a red suite from this round

My first post-fix full run came back `2514 pass / 1 fail`. The failure was **not** mine and is already
gone. It was a *torn read* of two other lanes' in-flight edits:

```
site/js/screens/job.js   mtime 17:37:05   <- rewritten DURING my run (started ~17:33)
tests/job-week.test.mjs  mtime 17:36:04   <- rewritten DURING my run
```

The old `job-week.test.mjs` asserted a bare `settings?.game === false` line in `screens/job.js`; the
week lane replaced that assertion mid-run with one that asks for `jobEntryGate` instead — its new text
even says so: *"r2: the old form of this assertion pinned a bare `settings.game === false` line, which is
why the door was shut on the switch and wide open on the week."* The run had loaded the old test against
the new source. Re-running that file alone against the settled pair:

```
$ node --test tests/job-week.test.mjs
ℹ tests 103   ℹ pass 103   ℹ fail 0
```

The failing assertion reads `site/js/screens/job.js` and nothing else — no file this lane touched is in
its input. While several lanes are writing at once, treat a single red file whose mtime falls inside the
run window as a torn read and re-run that file before assigning it to anyone.

## Suite state when I finished (17:44)

`node --test tests/` is **not globally green, and not because of this lane.** The run drifts every few
minutes as other lanes land: 2510 tests at baseline → 2519 → 2527 across three runs of mine.

Last full run: `2527 tests · 2502 pass · 21 fail`. All 21 sit in files other lanes were editing while it
ran — `job-guard` (12), `job-split` (8), `job-call` (8), `job-board` (8), `job-index` (4), `job-exploit`
(4), `job-screen` (2), `no-random` (1) — covering `js/job/{guard,call,board,index}.js`,
`screens/job.js` and `screens/home.js`. Several are findings 2 and 3 being fixed in flight (*"the split
the board printed and the split the debrief printed agree"*, *"a student with a ledger gets their OWN
split"*). Not one failure reads a file this lane owns.

What I can hold green, and did:

```
$ node --test tests/job-meta-constants.test.mjs tests/trophies.test.mjs
ℹ tests 31   ℹ pass 31   ℹ fail 0

$ node --test --test-name-pattern="meta surface|Settings|Stats|crew grid|panel" tests/job-index.test.mjs
ℹ tests 34   ℹ pass 34   ℹ fail 0      # every "Settings prints the formula for …" assertion
```

Whoever runs the gate last should re-run the whole suite once the lanes are quiet.

## Open issues

None in this lane.

---

# notes/meta-fix.md — J7 "meta" lane, round 3

Lane files unchanged: `site/js/screens/stats.js`, `site/js/screens/settings.js`, `site/data/trophies.js`,
plus this lane's own `tests/job-meta-constants.test.mjs`.

## 0. Routing, again — but this time two of the five have a root in this lane

All five round-3 findings were *written* against `COMPOSED-GAME.md`, `js/job/{call,crew,state,econ}.js`,
`js/readiness.js`, `tests/job-{call,align,ledger}.test.mjs` — none of which is this lane's. The critics
are right about all five (nothing below disputes a finding). But findings 1 and 5 each have a **second,
independent root inside this lane that the critics did not look at**, and it is the half the student
actually sees:

| finding | the critic's root (not mine) | the root in THIS lane (fixed here) |
|---|---|---|
| 1 · q̂ is the clear rate, not the first-try rate | `COMPOSED-GAME.md:338`, `data/job.js:194` | **`screens/settings.js:518` printed the wrong definition to the student** |
| 5 · mastering demotes Called 5 → Called 2 | `js/job/state.js` (two `ratingDetail` call sites) | **both meta surfaces printed `rankNameFor(rating.value)`, so they demote on their own, whatever `state.js` stores** |

Findings 2 (Spearman ρ = 1 is an identity), 3 (`forecastLog`) and 4 (throwing a target dominates) have
**no surface in this lane at all** — verified, not assumed:

```
$ grep -in "Spearman\|weakSpots\|crewValue\|dominat\|tank" \
    site/js/screens/stats.js site/js/screens/settings.js site/data/trophies.js
(no output)
```
`stats.js:459` is the lane's only `forecastLog` mention and it *reads* the log to draw the Readiness
sparkline — it publishes no claim about who writes it, so the run lane's change (a completed job now
writes a forecast point) makes that panel more complete, not wrong. Requests for all three are in §4.

Other lanes were demonstrably live the whole sitting — `state.js` 20:09:30, `COMPOSED-GAME.md` 20:05:26,
`crew.js` 20:06:13, `econ.js` 20:05:51, `guard.js` 20:06:51, `tests/job-state-r3.test.mjs` created at
20:09:20 — so their files were left alone (BUILD-POLICY §2).

## 1. Finding 1 — Settings printed a statistic the app does not compute

`call.js:592`'s own header: *"`q̂` — the student's CLEAR rate on one make over the trailing
`QHAT_WINDOW` (10) sittings"*, and `qHatDetail` parses `e.attempt` only to ignore it
(`call.js:684-687`). Settings said the opposite. Reproduced against the shipped module:

```
$ node scratchpad/meta-r3/f1.mjs
SHIPPED qHatDetail  : qHat = 1  w = 0  informative = false
DOCUMENT first-try  : qHat = 0.5  w = 1  informative = true
window unit         : qHatWindow = 10  of = 10 (sittings scanned, not attempts)
```
Ten sittings, all cleared, five of them on attempt 3 with hints — an ordinary history. The two
readings differ by 0.5, which is the entire range of q̂; `w` differs by the full 1.00; and they
disagree about whether the call is a measurement at all. The panel also called the window unit
"attempts" when it is card-history **sittings**. Both halves are now the module's own words.

## 2. Finding 5 — the two meta surfaces demoted the student by themselves

`ratingDetail`'s header (`call.js:505-511`) says a display must read `measured` before it prints a
rank, and `rankFor`'s `opts.floor` is *"the hook a display needs so the ladder never DEMOTES"*. Neither
surface used either: both called `rankNameFor(rating.value)`, which is `rankFor` on a number. That is
not the rank the game grants — **the 95 call and the guard multiplier are gated on `player.rank`** — and
`value === 5.00` has two opposite causes (fifty measured 50-calls; or no measurement at all, which is
where a student who mastered their makes lives).

This is a **separate** defect from the `state.js` one, not a duplicate: even after `state.js` holds
`p.rank`, these two panels would have kept printing `Called 2`, because they never read `p.rank`.

Both now read it — `ratingDetail(calls, RATING.N, { rank: player.rank })` — and print
`rankOf(detail.rank).name`. Measured in the **shipped app**, same save, same screen, `qa/shot.mjs`
with a fixture of fifty perfect 95-calls on mastered material and `player.rank = 5`:

```
$ node qa/shot.mjs "#/stats" … --state scratchpad/meta-r3/mastered.json --eval "…'.st-ledger-rating'…"
  before:  "eval": "5.00 | Called 2 | · rating 5.00 · 0/50 informative calls"     "errors": []
  after :  "eval": "5.00 | Called 5 | · rating 5.00 · 0/50 informative calls"     "errors": []

$ node qa/shot.mjs "#/settings" … (the "How the rating is computed" card)
  after :  "5.00 · Called 5 · 0 of 50 informative calls
            No informative call in the window, so the rating reads exactly 5.00 and measures nothing
            at all. The rank beside it is the one your ledger holds, not one this window measured…
            q̂  your CLEAR rate on that make over the trailing 10 sittings — a sitting you cleared
            counts whatever attempt it landed on and however many hints it took…"
  horizontalOverflow: false · console errors: none · 390×844
```

The rating **value** still deflates to 5.00 — that is the anti-farming behaviour G2 wants and it is
untouched. Only the RANK, which gates tools, is held.

## 3. The test — `tests/job-meta-constants.test.mjs` grew a round-3 block (9 → 13 tests)

Same two-arm discipline as round 2, plus a control:

- **source arm** — the q̂ legend must interpolate the clear-rate sentence and no lane file may contain
  `first-try rate`; both panels must pass `{ rank: … }` to `ratingDetail` and print `rankOf().name`,
  and neither may go back to `rankNameFor(<value>)`.
- **behaviour arm** — driven through the shipped `call.js`, not against literals: a mastered window
  (50 × q̂ = 1) gives `n = 0`, `measured = false`, `value = 5.00`, old form `Called 2`, held form
  `Called 5`, and `RANKS[4].calls` contains 95 while `RANKS[1].calls` does not — so the demotion is
  shown to have teeth rather than asserted to.
- **the control, which is the point** — a *measured* cowardly window (50 × q̂ = 0.5 at call 50) scores
  the **same 5.00**, and there the rank must still fall to `Called 2` (`held === false`). The fix is a
  hold on an unmeasured window, not a floor on being wrong.

Mutation-tested, so it is not a literal-vs-literal test. Reverting either fix:

```
✖ source: the q̂ legend states the clear rate, and no lane file says "first-try rate"
✖ source: both panels read player.rank through ratingDetail and print rankOf().name
ℹ pass 11   ℹ fail 2
```
Restored → 13/13.

## 4. Requests for other owners (the three findings with no root here, plus the two halves I cannot reach)

1. **`call`/doc owner — finding 1's other half.** `COMPOSED-GAME.md:338` and `site/data/job.js:194` still
   say "first-try rate … trailing 10 attempts". Correct both to *the CLEAR rate on that make over the
   trailing 10 sittings*, note the replacement in G12, and then retire the standing-disagreement test at
   `tests/job-call.test.mjs:1662` (or reduce it to a plain clear-rate assertion). `call.js:263`'s comment
   also still says "first-try rate".
2. **`state` lane — finding 5's other half.** `site/js/job/state.js:1072` and `:1785` (line numbers as of
   20:09) still call `call.ratingDetail(p.rating.calls, CAPS.calls)` with no `opts`. Pass the held rank:
   `call.ratingDetail(p.rating.calls, CAPS.calls, { rank: p.rank })`. Until that lands, the save's stored
   `p.rank` is still recomputed to 2 on the next call, and these two panels will faithfully print the 2 —
   they now print what the game grants, which is the correct division of responsibility, not a mask.
3. **`crew` lane — finding 2.** `COMPOSED-GAME.md:896` (G9 #5) and `:873` (G8 J4 row) must say that
   ρ = 1 between `crewValue` and `weakSpots()`'s sort key is an **arithmetic identity** (one is a constant
   multiple of the other: `crew.js:868` vs `readiness.js:307`), and move the *measured* claims into those
   rows — §6.2's 43 % top-three / 19 % exact-argmax and §6.3's mean ρ(all) = 0.65, per the instruction
   already written at `tests/job-align.test.mjs:923`.
4. **`run`/`tests` lane — finding 3.** `COMPOSED-GAME.md:522` (proof 11) and `:899` (G9 #8) still say a
   job writes no forecast point; the shipped `screens/job.js → jobSummaryContext → run.js commitJobRun`
   path writes one. Rewrite both to: a **completed** job writes the same `page` run record, daily-goal
   check and forecast point that `#/run/page` writes; a bagged/quit/walked job writes none, exactly as a
   mid-page exit writes none — and cite `tests/run-lane-r2.test.mjs`, not `job-ledger.test.mjs`.
5. **`call`/`econ` lane — finding 4.** Nothing in this lane publishes "Tanking is strictly dominated".
   Note that `settings.js`'s neighbouring sentence — *"farming cards you have already mastered produces a
   rating of 5.00 and not a high one"* — is about clearing mastered material and is still true; the
   exploit runs the other way (throwing a target to LOWER q̂ into the informative band). It needs the
   Ledger-B price or the q̂-fell gate, in `econ.js`/`call.js`.

## 5. Suite state

`node --test tests/` at 20:15 — **2705 tests · 2698 pass · 3 fail**, none in this lane:

```
✖ the primary button prints targets, minutes, the end time and the projected split   tests/job-board.test.mjs
✖ the screen composes no user-facing sentence of its own  ("COPY.evidence is never printed")  tests/job-screen.test.mjs
✖ J6 measured: a full job at 375x667 … board <= 36px on every target                 tests/job-screen.test.mjs
```

A/B-proved not mine, by swapping this lane's two screens back to their pre-round-3 bytes and re-running
the same two files: **identical failure set, 3 fail either way.** And every test that reads any lane
file — `job-meta-constants`, `job-index`, `fix-stats`, `trophies`, `job-copy`, `layout-audit`,
`final-layout`, `run-lane-r2`, `fix5-home`, `job-call`, `integration-w3/w5`, `state`, `job-ledger`,
`job-shape-measured` — is green: **402 / 402**.

(The same full suite read 10 failures at 20:05 and 3 at 20:15 as other lanes landed. A red file whose
mtime falls inside the run window is still a torn read — see round 2's note.)

## Open issues

None in this lane. The two half-fixes above (Requests 1 and 2) are the only places where this lane's
surfaces can still be made to print something stale by a file it does not own.

### Addendum, 20:33 — the suite kept moving while this note was written

Two later full runs read `2720 / 2712 / 4 fail` and then a different four again, as the board, screen,
css and call lanes landed. Every failure in both runs A/B-tested clean against this lane: swapping
`screens/stats.js` and `screens/settings.js` back to their pre-round-3 bytes produced the **identical**
failure set each time. The latest pair, for the record —

```
✖ regretOf prices the same regret in BOTH units …      "RATING points at q̂ = 0.55 … expected 0.0317 ± 0.0005, got undefined"
✖ the debrief regret line is computed …
```
— are `call.js regretOf` returning `undefined` mid-edit (`site/js/job/call.js`, the `call` lane), and
they fail identically with this lane reverted:

```
### PRE-FIX lane files ###   ℹ tests 194  ℹ pass 192  ℹ fail 2   (the same two)
### RESTORED ###             ℹ tests 194  ℹ pass 192  ℹ fail 2   (the same two)
```

Whoever runs the gate last should re-run the whole suite once the lanes are quiet, per round 2's note.
