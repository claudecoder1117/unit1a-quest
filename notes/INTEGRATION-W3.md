# INTEGRATION-W3 — Wave 3 (T09 Card+XP+mastery · T10 Schedule+Page+Home · T11 Binder+Stats+Trophies · T15 Settings+SW+Sound)

No agent failed; no lane reported red tests. The suite was already green on arrival (878 pass). Integration was
therefore not repair work but **connection** work: three of the four lanes shipped modules that nothing called.

**Suite after integration: `node --test tests/` → 893 tests, 893 pass, 0 fail** (≈ 45 s; the 15 new ones are
`tests/integration-w3.test.mjs`, below). `node qa/gen-precache.mjs --check` → up to date (105 files).

---

## 1. What was wired (the "Requests" sections, fulfilled)

### 1.1 One S4 level ladder — `site/js/app.js`
T01 wrote `xpForLevel` / `levelFor` / `rankFor` before `js/xp.js` existed; T09 then wrote them again. The shell now
imports and re-exports xp.js's versions (`import { … } from './xp.js'; export { … } from './xp.js';`), so `home.js`
(which imports them *from app.js*) keeps working unchanged and S4 is written once. The numbers were already
identical — `xp.test.mjs` asserted that against S4's printed values — so this is a pure de-duplication.

### 1.2 The Card screen now writes T10's schedule state — `site/js/screens/card.js`
notes/T10.md §7 asked for five things; all five are in:

| what | where | why it matters |
|---|---|---|
| **test clamp** | `rec.due = clampDue(dueFor(rec.bucket, now), { now, testAt: testAtOf(sv) })` in `finishClear` | T09 open issue 2: without it a card cleared the day before the test came due *after* the test. Verified in the browser: a bucket-1 clear 32 h before the test lands at **+12 h**, not +24 h. |
| **`lastFirstTry`** | written `true` on a clear, `false` on a reveal | `page.js missedOriginals()` reads it; it was falling back to a heuristic. |
| **`clearRematch`** | on a **first-try** clear, keyed by card id (or `forCard`/template for a Variant) | closes the error entries that `pendingRematches()` turns into Rematches. |
| **`freezeVariant`** | replaces the hand-rolled `sv.frozen[id] = {…}` in `finishRevealed` | T10's writer owns the record shape (it also carries `lastAt`/`params` and prunes at bucket ≥ 3), so `dueList()` and `applyFrozenOutcome()` see what they expect. |
| `recordDueCorrect` | **not** called — deliberately | `mastery.updateSkill(rec, s, { dueReview })` already writes `lastDueCorrectAt` with the same 12 h gate, and both modules read the same field. Calling both would double-write. Pinned by a test (§3). |

`recordRematch` is likewise not called: `card.js logError()` already pushes error entries in exactly the shape
`pendingRematches()` reads (`item`, `seed`, `template`, `forCard`, `cleared:false`). Verified end to end — a
three-wrong miss on `not-08` produced a `T-notation` Rematch `forCard: not-08` at position 3 of the next Page.

### 1.3 The trophy counters have call sites — `site/js/screens/card.js`
notes/T11.md open issue 2: nine trophies were unreachable in the running app because nothing called `bump`.
All eleven `owner: 'T09'` counters in `data/trophies.js COUNTERS` are now bumped:

* **per part, at the moment it is graded** (`partCounters()`): `setups` (an `equation` slot graded correct — it
  used to be counted only when the whole card cleared, so a right setup on a card you then missed counted
  nothing), `rejects`, `bothRoots` / `twoCases` (ang-10 / ang-05, correct on the first submit of that part),
  `forgeFlash` (a `factored` part correct in ≤ 30 s, `resetRun` when slower or wrong), `asnReasoned`.
* **at the clear / miss**: `notationClean` (clean clear of an `not-*` card or a `T-notation` Variant; `resetRun`
  on a non-clean clear **and** on a miss), `signLead` (`fac-16` / `T-factor-neg`), `systems` (`doc-07` / `T-sys` /
  `T-fig-system`), `coldRecall` (a review cleared ≥ 2 days after the card was last seen), `comebacks`.

Ops are **buffered per card** (`st.cops`) and flushed inside the one `update()` the finish path already makes, so a
grade never costs an extra save write, a sandbox card writes nothing, and an abandoned card writes no half-counters.
Verified in Chromium: `wp-01` clean clear → `counters.setups 1`; `not-01` clean → `notationClean 1 / notationCleanBest 1`;
three wrongs on `not-08` → `notationClean 0` with `notationCleanBest` kept.

**`asnReasoned` distinctness** ("count each statement once") is kept on the card record as `cards[id].reasoned`,
not as a set inside `counters` (which `counterValue()` reads as a number). In Card mode the reason line is *shown*
rather than asked (S3), so the counted event is "verdict right, no wrong chip behind it"; in Full 36 it is the chip.

### 1.4 `bus.emit('graded', …)` — `site/js/screens/card.js`
T11's engine listens on `'graded'` and on `'state'`. It only had `'state'`, so a toast landed on the next save
write rather than on the grade. The card now emits both `'card:graded'` (its own detailed event, unchanged) and
`'graded'`. Verified: a clear of `voc-01` writes `trophies['first-blood']` immediately.

### 1.5 Sound is subscribed — `site/js/screens/index.js`
Nothing called `js/sound.js`. The Card screen already emits the cues, so the subscription lives in the wiring
module next to the trophy install, and every future screen gets it for free:

```js
bus.on('sfx', cue => { if (cue === 'levelup') sound.play('level'); else if (cue === 'correct' || cue === 'wrong') sound.play(cue); });
bus.on('card:cleared', r => { if (r.comboAfter >= 5 && r.comboAfter > r.comboBefore) sound.combo(r.comboAfter); });
```

`'almost'` is deliberately silent (Global rule 2: an almost costs nothing, so it must not *sound* like a miss).
The combo chime rides on top of the correct cue only from the amber tier (≥ 5) so it stays an event, not a texture.
`play()` is a no-op when sound is off (the default), after 22:00, or without WebAudio, so this is safe to call
unconditionally. **No audio was produced during this integration** — it ran inside Oliver's quiet hours; the
wiring was verified by counting bus events, not by listening. Someone should hear it in daylight.

### 1.6 The header ring on a Settings deep link — `site/js/screens/settings.js`
Home, Binder and Stats all push `setHeader({ readiness, provisional })`; Settings did not, so landing straight on
`#/settings` showed `—` in the ring while the page itself printed `38`. One line in `readinessCard()`, same idiom.

---

## 2. Requests that were closed without code

* **`qa/shot.mjs --state` (T11 open issue 1)** — already fixed by T10 (the warm-up load now hits `version.js`
  instead of the app root, so the app cannot boot and write a fresh save over the injected one). Re-verified:
  `--eval` on the mid-week fixture reads back `testDate: 2026-09-22`, and the Binder renders 40/164 cleared.
  T11's `addInitScript` alternative is not needed.
* **`apple-touch-icon-180.png` (T15)** — **declined, and the decline stands.** BUILD-POLICY §1 forbids PNGs under
  `site/` and `tests/coverage.test.mjs` enforces it. iOS ignores SVG touch icons, so the home-screen icon falls
  back to a screenshot. Relaxing the rule for our own artwork is a product decision, not an integration one; it is
  listed as open below.
* **`node qa/gen-precache.mjs` (T15)** — run and checked; 105 paths, in sync. **Added to the integrator checklist
  at the bottom of this note.**

---

## 3. New tests — `tests/integration-w3.test.mjs` (15)

Wave 3 landed **two** implementations of the S4 spaced-review primitives: `js/mastery.js` (T09) and
`js/schedule.js` (T10). The Card screen now uses mastery.js for the interval and schedule.js for the clamp, so a
drift between them would silently corrupt every due date. The new file pins the seam:

1. `INTERVALS`, `MAX_BUCKET`, the mastered thresholds and the decay constants are identical in both modules.
2. `nextBucket(b, outcome)` agrees for every bucket × outcome (18 pairs).
3. `mastery.dueFor(b, at) === schedule.dueAfter(at, b)` for every bucket.
4. `isMastered` and `mShown` agree on six sample records (including the `lastDueCorrectAt: null` case).
5. The clamp really does pull a +1-day interval in front of a test 12 h away, and never into the past.
6. `app.js` re-exports the ladder from `xp.js` and does not redeclare it (source assertion — this is the exact
   duplication that was just removed, and it should not come back).
7. Every screen file that exists is imported *and* registered in `screens/index.js` (so a later wave cannot land a
   screen that no route reaches).
8. The Wave 3 call sites exist: `card.js` imports `schedule.js` and `trophies.js`, calls `clampDue`,
   `freezeVariant`, `clearRematch`, writes `lastFirstTry`, emits `'graded'`, and **names every `owner: 'T09'`
   counter key from `data/trophies.js`** — that last one is generated from `COUNTERS`, so adding a counter to the
   catalogue without a call site turns this test red.

---

## 4. Screens loaded and read (Chromium, 375 px unless noted)

| route | result |
|---|---|
| `#/today` fresh | zero console errors, no horizontal overflow. Readiness ring dashed/provisional, "Warm-up" primary, Today card, empty weak spots, 19 skill bars. |
| `#/card/ang-10` fresh | zero errors. Paper + "10)", verbatim stem with overlines, the redrawn figure with both expression labels and the "Not to scale" chip, 4 pips, Scratch, hint ladder, the optional setup, the Solve/Keep-or-reject/Cases rail. |
| `#/binder` + mid-week fixture | zero errors. 24 % / 40-164, rarity strip, 11 sheet tabs, packet section headings, rarity dots. |
| `#/stats` + mid-week fixture, dark | zero errors. Ghost target, sparkline, 14-day XP bars, rarity, 19 skill bars, bests, all 60 trophies, Patterns, Errors. |
| `#/settings` + mid-week fixture | zero errors; header ring now `38` (was `—`) after §1.6. Both Readiness formulas printed from `readiness.js`, live export box, About/update card. |

Scripted walkthroughs (a scratchpad Playwright driver, not committed): `wp-01` setup + answer → **GOLD +35**
(`20 × 1.5 clean = 30 + 5 speed = 35`), `counters.setups 1`, `lastFirstTry true`; `not-01` mc clean → GOLD +20,
`notationClean 1`; `not-08` three wrongs → "✗ BRONZE 0 XP · a Rematch is queued", `lastFirstTry false`,
`notationClean` reset, 3 uncleared error entries; a `T-vocab` Variant second-try clear → **◆ SILVER +5**
(`10 × 0.6 2nd try × 0.8 variant`); `voc-01` clear → `trophies['first-blood']`; the `not-08` miss composed into a
25-item Page whose item 3 is `T-notation#… role:rematch forCard:not-08`.

---

## 5. Still open (nothing here blocks Wave 4)

1. **`js/mastery.js` and `js/schedule.js` remain two implementations of one idea.** They agree today and the new
   test keeps them agreeing, but the right end state is one module. Doing the merge now would mean rewriting two
   green, heavily-tested files on the same day a real student starts using the app, so it is deliberately deferred.
   If it is ever done, `schedule.js` is the superset (clamp, frozen Variants, Rematch log, daily goal) and
   `mastery.js` is the one the Card imports.
2. **Nine counters still have no call site outside the Card**: `notationClean` / `forgeFlash` etc. are bumped by
   card clears, but the Boss (T12), Mock (T13) and Run (T16) screens must bump the same keys when *they* grade, or
   a student who only plays Pages will see the counters stall. The contract is `data/trophies.js COUNTERS` and the
   test in §3 item 8 will not catch a *missing* screen, only a missing counter.
3. **Run records are still thin** (T11 open issue 3): `#/stats` prints `—` for per-Page XP and Mock accuracy until
   T12/T13/T16 write `xp`, `items[].credit/clean`, `acc`/`scorePct`, `pred`, `won`, `hearts`.
4. **`apple-touch-icon`**: still no home-screen icon on iOS, by policy. Needs a product decision (relax §1 for our
   own artwork, or accept the screenshot fallback).
5. **Sound has never been heard** — wired and event-verified, but muted by quiet hours during integration.
6. `#/run/*`, `#/boss/*`, `#/mock`, `#/onboard`, `#/sheet` are still T01's placeholders (T12/T13/T14/T16). Home's
   primary button already calls `startPage()` before navigating, so `run.js` will find `inProgress` ready.
7. The header `T−N` chip is 41 × 24 px — the one interactive element under 44 px in the app (T10 open issue 3, T18).

## 6. Integrator checklist for Wave 4
1. `node --test tests/` green **before** touching anything, so you know what you broke.
2. **`node qa/gen-precache.mjs`** after any file lands under `site/js|css|data|assets` — `tests/sw.test.mjs` goes
   red otherwise, and an unlisted file 404s in airplane mode with nothing in the browser to tell you.
3. Watch for `*/` inside a JS block comment and `/*` inside a CSS comment — both have broken the whole boot graph
   in this repo once each, and neither shows up in `node --test`.
4. Read the screenshots. Two Wave 3 defects (invisible SVGs, an overflowing grid) were found only that way.
