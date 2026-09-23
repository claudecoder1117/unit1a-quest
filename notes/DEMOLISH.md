# DEMOLISH — the cut, executed

**Authority** `designs/CUT-BRIEF.md` (the game layer) and `designs/CUT-SPEC.md` (the shape of what
survives). `COMPOSED.md` and `BUILD-POLICY.md` rule and are untouched; BUILD-POLICY wins.

This lane deleted the mechanics CUT-BRIEF deletes — their code, their tests, their copy, their CSS
and their save keys — and left the two ideas that survive (**you bid on yourself before you see the
question**, and **your streak is a pile you can lose**) as working seams for the build lanes.

**`node --test tests/` is GREEN.**

| | before | after |
|---|---|---|
| tests | 3 073 | 1 391 |
| suites | 424 | 93 |
| pass | 3 069 | 1 387 |
| fail | **0** | **0** |
| skipped | 4 | 4 |
| wall clock | 420 s | 111 s |

The four skips are the same four as before (Playwright-gated browser arms). No test was weakened,
skipped or silenced to get here: every deletion below is a test whose mechanic no longer exists.

---

## 1. Files deleted

### `site/js/job/` — the cut modules (6 029 lines)

| file | lines | what it was |
|---|---|---|
| `site/js/job/board.js` | 1 367 | the board of 5, the 3-of-5 draft, the shape table, the projection |
| `site/js/job/crew.js` | 2 290 | the crew, capacity, STEADY / HELD, forgiveness, the chain-hold |
| `site/js/job/guard.js` | 1 725 | the Guard, the wings, tokens, pressing, the press equilibrium, heat |
| `site/js/job/index.js` | 647 | the Fault Index and its 68 tags, tells, sealing, Backchecks |

### `qa/` — the old layer's acceptance harnesses (2 942 lines)

| file | lines | what it drove |
|---|---|---|
| `qa/job-screen.mjs` | 1 164 | J6's acceptance: the board sheet, the press panel, the envelope, the payout beat |
| `qa/job-walk.mjs` | 1 295 | J13's visual walk: the cold open, the two-pass board, the debrief |
| `qa/job-clock.mjs` | 483 | J8's split measurement against the phase machine |

All three import deleted modules or drive deleted verbs; nothing under `site/` imports any of them.

### `tests/` — 32 files (36 622 lines)

Each one covers a mechanic the brief cuts. **A test of a mechanic that no longer exists is not a
regression**; the list is here so the deletion is a record rather than a disappearance.

| test file | lines | the mechanic it covered |
|---|---|---|
| `job-board.test.mjs` | 4 069 | the board of 5, drafting 3 of 5, the supply rows, the projection |
| `job-crew.test.mjs` | 3 879 | the crew, capacity, the crew matrix, cold crew, idle rules |
| `job-guard.test.mjs` | 3 342 | the Guard, tokens, pressing, the press equilibrium, the heat window |
| `job-call.test.mjs` | 3 094 | the four-rung call ladder, the rating, credit, the rank thresholds |
| `job-econ.test.mjs` | 2 724 | loot, ρ, the chain, the fee, cold, scope, the ×2, the exit bonuses |
| `job-exploit.test.mjs` | 2 135 | exploit hunts over the cut economy (declines, quit-scum, press farming) |
| `job-meta-constants.test.mjs` | 2 044 | the duplicated constants of the cut tables (crew, guard, Elo, Fault Index) |
| `job-screen.test.mjs` | 2 037 | the old job screen: the board sheet, the envelope, the payout beat, the brief |
| `job-week.test.mjs` | 2 013 | the week gate's board policy, the REVIEW BOARD, G2's crew terminus |
| `job-align.test.mjs` | 1 650 | crew alignment and the make/wing tables |
| `job-state.test.mjs` | 1 498 | the ten-phase state machine, the getaway, CALL IT, COMMIT |
| `job-split.test.mjs` | 1 193 | the projected split over the cut phase machine |
| `job-index.test.mjs` | 1 015 | the Fault Index, tells, sealing, Backchecks |
| `job-debrief.test.mjs` | 892 | the debrief's six blocks, the regret lines, the decision count |
| `job-state-r1/r2/r3.test.mjs` | 845 / 391 / 388 | the brief window's re-press, the getaway, the quiet close |
| `job-copy.test.mjs` | 804 | the fourteen-noun COPY table |
| `job-monotone.test.mjs` | 634 | monotonicity of the cut payout ladder |
| `job-juice.test.mjs` | 590 | the six animation cues of the cut screen (bag drop, chain tick, guard bars) |
| `job-supply.test.mjs` | 490 | the per-wing supply numerals |
| `job-audit-allow.test.mjs` | 436 | the four job waivers in `qa/audit-allow.json` (removed — see §4) |
| `job-shape-measured.test.mjs` | 364 | the shape table's measured wall clock |
| `job-coldopen.test.mjs` | 311 | the cold-open path through the board |
| `run-lane-r2.test.mjs` | 630 | the job's run record, written at the debrief terminal |
| `run-lane-v1.test.mjs` | 466 | the debrief's q̂-at-the-seal, the commit run's dating |
| `run-lane-v2.test.mjs` | 363 | the debrief's decision count and split tile |
| `run-lane-v3.test.mjs` | 352 | "EV-max" naming two rungs across Settings and the debrief |
| `run-lane-r3.test.mjs` | 349 | the call-regret line's two ladders |
| `run-lane-r1.test.mjs` | 307 | the debrief's idle line and the guard-bar heading |
| `_job-reach.mjs` | 331 | reachability helper for the cut state machine (used only by `job-screen`) |
| `_run-again.mjs` | 185 | the debrief's "Another board" repeat-route harness |

**Kept and rewritten, not deleted** (the prompt's KEEP list):

* `tests/job-ledger.test.mjs` — **the Law of Two Ledgers**, 951 → 768 lines. Every byte-identity
  assertion is kept verbatim; the job arm now drives `startJob → call → answer → bank → endJob`
  instead of `beginTargets / lockCall / applyTarget / bag / push / brief / crack / walk / callIt`.
  17 tests, all passing. Two things moved in it and both are recorded in the file:
  * the vacuity list shrank from `frozen, variants, streak, jumps` to `jumps` — the game now runs
    the WHOLE composed page, so the corpus reaches Variant items and the daily goal;
  * `drafted` / `composed` / `partial` are gone from the run record, because there is no draft.
* `tests/job-save.test.mjs` — the save, 1 989 → 230 lines, rewritten to the new schema: the two
  schema copies deep-equal, the v2 → v3 migration, the `inProgress.game` round trip and a killed
  tab, and the layer's total cost on disk (**213 B**, against the old budget's 26 KB).

---

## 2. Files reduced

| file | before | after | what went |
|---|---|---|---|
| `site/js/job/state.js` | 2 216 | 499 | the ten phases, the guard draw, the press, the chain, the brief, the getaway, CALL IT, COMMIT, the vault, the rating window, the rank ratchet, the Elo pair, the job log, the debrief. **Kept:** `guardSave` (verbatim), `LEDGER_A_KEYS`, `LEDGER_B_KEYS`, `queueOf`, `serialize` / `deserialize`, `applyTarget`'s study write (now `answer`), `endJob`'s `finishPage`. **New verbs:** `startJob`, `call`, `answer`, `bank`, `endJob`, plus `callsFor` / `priceOf` / `splitOf` |
| `site/js/job/econ.js` | 1 541 | 100 | everything but the payoff table. It is now CUT-SPEC §2 exactly: `CALLS`, `PAYS`, `COSTS`, `MULT_MAX`, `mult`, `offered`, `canCall`, `payOf`, `costOf`, `honestCall`, `BANDS`, `shouldPush`. **SEAM:** CUT-SPEC §8 names this module `job/pay.js`. The payoff lane should RENAME this file and move its three importers, never add a second module beside it |
| `site/js/job/call.js` | 1 172 | 139 | the rating ladder, credit, the ranks, the Elo pair, the evidence and disagreement bands, the regret line. **Kept:** `qHatDetail`, `qHatFor`, `sealedCallOf` and their three helpers — the cut at the seal now reads `inProgress.game.call.at` |
| `site/js/screens/job.js` | 2 874 | 295 | the whole old screen. It is now the three slots, the face-down card, the three calls, bank, and the study card engine mounted as-is |
| `site/js/screens/run.js` | 2 809 | 1 653 | the debrief: the bag drop, the take block, the ledger block, the guard redraw, the two regret lines, the realised order, the inferred decisions, the split tile, tomorrow's board. **Kept:** `captureJobBefore` and `commitJobRun`, reduced — the game must still file the page's `runs[]` record, the forecast point and the daily goal, or the same answers earn a trophy on one route and nothing on the other |
| `site/js/screens/home.js` | 848 | 403 | the two-pass board panel, the contract rows, the supply numerals, the cold-crew strip, the shape/ends/split line, the 22:00 refusal with its one-tap alternative, the Clean Getaway payment. Home's primary button is `page.nextAction`'s, pointed at `#/run/job` by `plan.nextActionFor` |
| `site/js/screens/settings.js` | 1 062 | 440 | the five printed-formula panels (call, guard, ladder, posted, rating) and the module-level law builders. The game card is now the toggle plus the three band lines and the greyed-call note |
| `site/js/screens/stats.js` | 807 | 465 | the Ledger panel, the crew grid, the Fault Index panel, the Reliability scorecard |
| `site/js/screens/mock.js` | 1 437 | 1 167 | `applyMockCall` and the Mock's whole weight/eligibility apparatus — it entered the prediction in the game's rating window. The prediction slider and `calibration()` are the study layer's and are untouched |
| `site/js/plan.js` | 852 | 525 | the shape table, the projected end time, the 22:00 refusal, the REVIEW BOARD, the crew terminus, `commitIsDue`, `payCleanGetaway`, `jobBoundary`. **Kept:** `gameOn`, the clock helpers, `boardPolicy`, `jobAction`, `jobEntryGate`, `nextActionFor`, all reduced to "is the game on, and is there a session to resume" |
| `site/js/page.js` | 1 359 | 559 | `composeBundles`, `draftUnion`, `jobBudget`, `jobTargetOf`, the contract letters, the critical replication, the coverage proof, the supply rows — the board's half of the composer. **`composePage` and every study function above that block are untouched, line for line** |
| `site/js/store.js` | 838 | 687 | the old `player` / `game` schemas, `freshTag`, the five `CAPS.game` caps and their trims, the unit-handoff crew filter |
| `site/js/app.js` | 478 | 460 | the header's three stake read-outs (`loose` / `bag` / `chain`) |
| `site/data/job.js` | 1 308 | 148 | the whole constants table. What is left: `QHAT`, `SPLIT`, `WEEK`, `SAVE_DEFAULTS`, `IN_PROGRESS_KEYS`, `COPY` (CUT-SPEC §6's list and nothing else) |
| `site/data/trophies.js` | 383 | 256 | six game trophies and their predicates (see §3) |
| `site/css/job.css` | 880 | 94 | the board sheet, the press panel, the guard bars, the envelope, the payout beat, the brief, the getaway, the debrief, the bag drop |
| `site/css/screens.css` | 1 628 | 1 529 | the `G-job` block (Home's board, the three Stats panels, the debrief's sections) |
| `tests/_helpers.mjs` | 822 | 341 | the game-layer worst-case fixtures (the rating window, the crew, the 68 tags, the heat window, the job log, `inProgress.game`, the bench, the six trophies, the reserved run fields, `withoutGameKeys`, `archivedGameBytes`) |

`tests/state.test.mjs` (861 → 806), `tests/mock.test.mjs` (773 → 618) and `tests/trophies.test.mjs`
(485 → 471) lost the sections that covered cut mechanics: the game half of the worst-case save and
its 26 KB budget, the Mock's five rating-call tests, and the six game-trophy fixtures.

---

## 3. Save keys dropped, and the migration that drops them

`SAVE_VERSION` **2 → 3**. `store.js MIGRATIONS[2]` replaces exactly two top-level keys and deletes
one nested one; **every other key of a v2 save is spread through untouched**, asserted key by key in
`tests/job-save.test.mjs`.

**`save.player` — was:** `rating {calls[≤50], value, n}`, `rank`, `elo {player, house}`,
`records {bestBag, bestChain, bestRating20, bestRating, cleanJobs, cracked, walked, cleanGetaway}`.
**Now:** `{ best: 0 }` — the best day, in points.

**`save.game` — was:** `crew{}`, `heat {press, weight, jobs, window[≤10]}`, `tags{≤68}`,
`backchecks {held, mintedDay}`, `ledger {jobs, tGame, tAnswer, phaseMeans, debriefAt}`, `log[≤30]`,
`commit {kind, byMin, honored, bound}`. **Now:** `{ today: 0, day: null }`.

**`inProgress.game` — was:** 24 keys (`shape, seed, bundles, picks, tokens, guard, loose, bagged,
chain, calls, briefs, vault, tGame, tAnswer, phase, phaseAt, stakes, outcome, locked, posted, bc,
last, ph, rating0, quiet, tellOff`). **Now:** the seven of `IN_PROGRESS_KEYS` — `pile, streak, call,
answered, tGame, tAnswer, seed`. A v2 save's live record is **dropped**, and the PAGE it was running
is left exactly as it is: `queue` and `idx` survive untouched, so a half-answered page is still
there as a plain Today's Page and not one item of it leaves the schedule.

**Nothing is carried over into the new currency.** `records.bestBag`, the rating, the rank and the
Elo pair were denominated in loot, bagged and rating points. Re-printing one of them as `best 419`
would put a number on screen that the engine never computed — the one thing CUT-BRIEF's hard limits
forbid outright. `best` starts at 0 and is earned again in points.

Also dropped: `CAPS.game` (the five caps) and the four `applyCaps` trims that enforced them — the
two keys are three scalars now and are bounded by construction.

**Trophies removed** (`site/data/trophies.js`, 60 remain): `crew-held` (the crew), `index-25` and
`index-68` (the Fault Index), `chain-8` (the chain), `calibrated` (the rating's Brier score),
`clean-getaway` (the Night Before's stamp, which paid a Backcheck). `flawless-page` lost its
`partial` gate: the game runs the whole composed page, so there is no subset to be partial of.

---

## 4. Everything else that moved

* `qa/audit-allow.json` — the four attributed job waivers (`job-answer-kb`, `job-payout-kb`) are
  gone; the two `states: ["*"]` waivers stay. `tests/job-audit-allow.test.mjs` went with them.
* `node qa/gen-precache.mjs` was re-run: `sw.js` is **123 paths**, the four deleted modules removed.
* `ROUTE_PATTERNS` is still **13**; `#/run/job` is still the run route's own delegate, and
  `tests/run.test.mjs` asserts both.
* No `Math.random` under `site/js` (`tests/no-random.test.mjs` is green).

---

## 5. Verified by hand

`python3 -m http.server -d site` and a real browser:

* `#/today` — renders, CTA is `page.nextAction`'s, no board panel, no console error from the app.
* `#/run/page` — composes and renders a question with its figure, hint ladder and dock. Unchanged.
* `#/run/job` — the new screen: three slots (`0 pile` · `×1 streak` · `new — you got this right`),
  the skill name, three calls with the two the pile cannot cover greyed out, and `bank`. Tapping a
  call flips to the study card engine.

One console line appears on every route, before and after this work: the preview browser refuses to
register `sw.js` ("An unknown error occurred when fetching the script"). `sw.js` serves 200 and
`tests/sw.test.mjs` is green; it is the sandbox, not the app.

---

## 6. Seams and requests for the build lanes

1. **`job/econ.js` is CUT-SPEC's `job/pay.js`.** Rename it; do not add a second payoff module. Its
   importers are `job/state.js`, `screens/job.js` and `screens/settings.js`.
2. **`job/state.js` is a working engine, not a stub** — `startJob / call / answer / bank / endJob`
   run, and `tests/job-ledger.test.mjs` drives them. Rewrite freely, but the Law of Two Ledgers test
   is the contract: the study write in `answer` is `requeueReview` then `markItem`, in that order,
   with `screens/run.js record()`'s exact result record.
3. **The split meter is fed by the screen.** `tGame` / `tAnswer` take an `ms` from each verb's opts;
   the state machine reads no clock of its own. `state.splitOf(g)` is the measured percentage, and
   the end-of-session line prints it. The shipped screen measures beat-to-beat wall clock — whether
   that is the honest boundary is the screen lane's to decide.
4. **`screens/job.js` is minimal on purpose.** Three slots, three calls, bank, the card engine. It
   does not animate the flip, and the strip scrolls out of view above a tall card on a phone — both
   are the screen lane's, and the streak tick (the one number that may animate) is already wired to
   `[data-tick]` in `css/job.css`.
5. **The app header still prints two numbers during play** (`hdr-readiness`, `hdr-tminus`). Whether
   CUT-BRIEF's three-number limit reaches the app shell is a screen decision; it is named in
   `js/app.js` rather than decided by this lane.
6. **`data/job.js SKILL_GROUPS`** (exported as `WINGS` for its one caller) is the old wing table,
   kept only because `js/gen/asn-reason.js` — a study generator this lane may not touch — imports it
   for skill grouping. No surface prints it. Whoever next owns that generator should move the table
   into it and delete the export.
7. **`qa/audit-states.mjs` still catalogues five job states** that drive the deleted board. They are
   a QA catalog rather than a product surface, and `tests/fix-boss-miss.test.mjs` greps the file, so
   they were left alone; the screen lane will want to replace them with states for the new screen.
