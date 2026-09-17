# OPEN ISSUES — everything still open across all 30 ticket notes

*Assembled by T17 at the end of Wave 5 from `notes/T00…T16.md` and `notes/INTEGRATION-W0…W4.md`.*

**Every item below was re-checked against the code as it stands today**, not copied forward. Items that the
notes raise but that have since been fixed are in §D so nobody chases them again; the counts and file:line
references are from this pass. Suite at the time of writing: **`node --test tests/` → 1138 pass, 0 fail**
(both discovery paths — see `notes/T17.md`).

Triage:

| | meaning |
|---|---|
| **BLOCKER** | the student meets this in normal use this week, and it costs them study time or tells them something untrue |
| **MAJOR** | wrong, visible or load-bearing, but survivable for one unit; fix before the next student |
| **MINOR** | cosmetic, internal, or a decision that can be deferred without harm |

---

## A. BLOCKERS

### A1. T18 Visual QA has never been run — S9 is unscored
No `notes/T18.md` exists. It is the last unstarted build ticket and the only acceptance gate that has not
been met: **"the S9 checklist scores 10/10 by a reviewer who did not build it."** Every lane shot its own
screens and read them, and `INTEGRATION-W0…W4` each did a cross-screen pass, but nobody has done the
systematic sweep the ticket asks for — 375×667 / 390×844 / 768×1024 / 1280×800 × dark and light, keyboard
open on Card and Mock, `prefers-reduced-motion` on, **measured** contrast ≥ 4.5:1, every tap target ≥ 44 px,
Lighthouse mobile ≥ 95/95.

Eight notes have already written T18's regression set for it (T09 §7, T10 §7, T11 §Requests, T12 §Requests,
T13 §6, T14 §7, T16 §Requests, T08a/T08b/T08c/T08d) — the work is scoped, not started. Two known measurement
failures are waiting for it: the header `T−N` chip is **41 × 24 px** against the 44 px floor (T10 #3), and
BLITZ's answer row sits mid-screen rather than in the thumb zone on an 812 px phone (INTEGRATION-W4 #3).
**Owner: T18.**

### A2. One clean placement item removes all 55 M1 cards from the plan — permanently
`site/js/page.js:80` — `cardIsPlaced = save.cards[id].placed || save.jumps[c.module]`. S7 says a clean
placement item marks its module placed "exactly like JUMP HERE", and M1 (`Lexicon`) holds **55 originals**.
So a student who answers one notation item correctly in the placement loses the entire vocabulary / notation
/ definitions / facts / classify sheet from their new-card pool — and because those cards were never
attempted, `lastAt == null` and they never come back as *reviews* either. They stay tappable in the Binder,
but the week's plan will never serve them.

**DECIDED AND FIXED at Wave 5 integration** — `notes/INTEGRATION-W5.md` §1.1. A module with more than
`PLACE_MAX_ORIGINALS` (40) originals now needs `PLACE_LARGE_CLEAN` (2) clean placement clusters before the
placement marks it placed; M1 and M9 have one cluster each, so the placement never places them and JUMP
HERE (10 items, ≥ 8) is the gate that can. The skill still gets its m = 80 and its `placedAt`, and the
summary says why the module stayed in the plan. Pinned by `tests/integration-w5.test.mjs`.

T14 raised this (`notes/T14.md` #3) and explicitly declined to decide it alone. Its proposed one-line fix:
require a clean item **and** ≥ 2 clean clusters before placing a module with more than 40 originals.
**Owner: T14 / product decision. This is the single highest-cost open item for a student studying this week.**

### A3. The plan strip promises "flash only" and the composer ignores it
`site/js/plan.js:132,149` returns `microFlashOnly: true` on a lowered day and `composeOpts()` forwards it;
**nothing reads it** (`grep microFlashOnly site/js` → plan.js only). The strip tells the student their
vocabulary and notation will be flash cards today; the page is then composed exactly as normal. The other two
thirds of the lowering (target 12, tier-4 → 1) *are* honoured, so only this line is untrue.

S9 #10 is "Honest". **DECIDED AND FIXED at Wave 5 integration** — `notes/INTEGRATION-W5.md` §1.2: the flag is
now read by `composePage` (`LIMITS.microEveryLowered` — every second new slot is a tier-1 recall card instead
of every fourth: 6 of 12 rather than 3 of 12 on the D = 3 fixture) and the strip line says exactly that
instead of promising a read-only flash mode the app does not have. All three lowering lines are now true.
(INTEGRATION-W4 §5 #1.)

---

## B. MAJOR

### B1. A heavy-review day composes ~34 minutes against S1's 10–25
`pageMax` (20) bounds reviews + rematches + new, but the 3 weak-spot Variants, the 2-item algebra floor and
the tier ramp ride on top of it; a 17-review day is simply long. Verified on the midweek fixture:
`RUN NEXT · 17 reviews + 4 new + 4 variants · ~34 min`. The estimate itself is honest (`{1:0.5, 2:1.5, 3:3,
4:5}` minutes per tier, T10 #4) — it is the composition that is over budget. **Owner: T10/T14.**
(INTEGRATION-W4 §5 #2.)

### B2. The 51 Quizlet stems were never verified against the Quizlet
`quizlet.com/254286132` returns HTTP 403 to a fetch and no browser was connected in T00's or T06d's sitting,
so `qz-01..18` and `bonus-01..33` rest on `content/SOURCE.md` §5 alone. Three bonus stems are abbreviated with
"…" in SOURCE (`bonus-04`, `bonus-11`, `bonus-12`) and **eight were expanded from shorthand into full
sentences** by T06d (`bonus-04/05/10/11/12/16/32/33`). Letters are unaffected. SOURCE.md is the declared
content authority, so nothing is *wrong* — but 18 quiz cards the student may be graded on have never been
diffed against the source they came from.

Fix (10 minutes with a browser): open the set once, paste the card list into `source/quizlet.txt`
(git-ignored), diff the 51 stems. **Owner: whoever has a browser. (T00 #1, T06d #3/#4.)**

### B3. `qz-04`'s ⚑ note nudges the student toward the wrong answer
The mandated flag text says "arguably A", but the card grades **S** and S is mathematically right (a ray lies
on a line, and a line can be skew to another line, so a line and a ray are coplanar only *sometimes*). Global
rule 5 says a teacher/checker disagreement shows a ⚑ note and never a changed answer, so the wording was kept
verbatim — but as written it tells the student the right answer might be wrong.
T06d's suggested rewording: *"Quizlet says S — and S is right (the skew case); an earlier draft flagged it as
A."* **Owner: content (`content/SOURCE.md` + `site/data/cards/asn.js`). (T06d #2.)**

### B4. A blank Boss-B4 setup cannot be skipped on purpose
S3 says "a wrong or blank setup costs no heart but forfeits flawless". In B4 the slot is *required*, so a
blank submit is `malformed` (free, no progress) and the only way past it without an answer is three
deliberate wrongs — which reveals the whole item and books it as a miss. No heart is lost either way, so
nothing is scored wrongly; it is a dead end the student can sit in.
Fix (one line, T09): honour `part.optional === true` in `mode:'boss'` for the entry while keeping the
widget's Skip button hidden, or expose `showSolution()` on the view controller. **Owner: T09/T12. (T12 #1.)**

### B5. `js/mastery.js` and `js/schedule.js` are two implementations of one Leitner ladder
They agree today, and `tests/integration-w3.test.mjs` pins them to each other so they cannot silently drift —
but the next person to change a bucket interval has to know to change both. Carried unchanged since Wave 3.
**Owner: T10. (INTEGRATION-W3, INTEGRATION-W4 §5 #5.)**

### B6. Sound has been wired since Wave 3 and has never been heard
`site/js/sound.js` is complete and subscribed, but no lane has played it: Wave 3 and Wave 4 integration both
ran after 22:00, when the user's own quiet-hours rule forbids audio. Volume, pitch ladder and the
`comboPitch()` curve are therefore untested by ear. **Owner: T18 (daytime pass). (T15 §Requests,
INTEGRATION-W4 §5 #5.)**

### B7. `store.js` worst-case save is ≈ 480 000 chars, not the spec's "≈ 210 KB"
S6's arithmetic assumed 300 B per card; 20 history entries alone are 600 B packed. T01 kept the **spec caps**
(history 20, errors 300, runs 40, work 1 KB × 3 mocks), bounded the fields the spec left open, compacted
history on disk, and `state.test.mjs` asserts < 500 000 chars — ≈ 1 MB of the 5 MB UTF-16 quota, so nothing
breaks. The open part is a decision: **accept 500 K as the documented bound, or name the caps to cut**
(reaching 250 KB needs history ≈ 6, runs ≈ 25, Scratch ≈ 200 chars, Mock work ≈ 512). T17's unit archive does
not change the live bound (`applyCaps` does not touch `archive`), but a second archived unit roughly doubles
the on-disk save. **DECIDED at Wave 5 integration: accept 500 K as the documented bound**
(`notes/INTEGRATION-W5.md` §3). The spec caps stay as T01 wrote them and `state.test.mjs`'s `< 500 000 chars`
is the contract. Cutting history to 6 and runs to 25 to reach the spec's 210 KB would cost the student real
review history to save 1 % of a quota that is under no pressure. Revisit when a THIRD unit is archived —
and export-then-evict there, not here. (T01 #1.)

---

## C. MINOR

**Content**

* **79 of 213 M1 misconceptions carry no `tag`** (`site/data/cards/m1.js`). They still show their `msg`, so
  the student sees the right feedback; they just never count in the Patterns panel. T06a asked T06g for five
  vocabulary keys (`confused-point-line-plane`, `confused-angle-parts`, `confused-bisector`,
  `confused-intersection-facts`, `confused-vocab`); none exists. One-line change per table once they do. (T06a #4.)
* `wp-14` and `wp-16` have **no generator** — their ratio *expressions* fit none of S2's three shapes, so they
  are the only two M4/M5 originals with no Infinite view. A fourth `csratio` shape would close it. (T07a #1.)
* `T-notation` / `T-vocab` emit `figure: null`; the letters are generated and carried but no figure model is.
  The items read fine ("Points Z, F, Y and K are labelled in the figure…"). A small fan figure from T07b would
  finish them. (T07c #1.)
* The GCF templates never pull out a **monomial** GCF (`8n² + 4n → 4n(2n+1)`); S2 fixes the GCF as a constant
  and every Kuta §6 GCF item is constant too. A new `kind` in `gen/factor.js` if the real test differs. (T07c #4.)
* `T-quad-ctx` can never reach the `angle-over-180` reject reason (unreachable by construction), and
  `T-fig-bisect-Q` can draw `x = 0` as a root (legal, but reads like a trick). (T07c #3, T07b.)
* Two `doc-05` typographic details are unrecoverable from the raster (one space vs two after "∠ABC?"; the math
  is italic in the image). Neither changes wording. (T00 #3.)
* `fac-*` stems keep the transcript's verbatim "Factor each completely." prefix and the `²` glyph rather than
  `^2`; both are deliberate and internally consistent. (T06e #1, #2.)

**Engine / UI**

* `T-fig-bisect-L` is registered **tier 4** but S7 lists it in a placement it also calls "all tier ≤ 3". T14
  kept S7's explicit list and put it last; one of the two must move. (T14 §7 → T07b.)
* JUMP HERE is still offered on a **fully cleared** module (`!t.placed` is the only gate in `binder.js`), where
  it cannot teach anything. One condition. (INTEGRATION-W4 §5 #4.)
* The Night-Before mini-mock still shows **per-item feedback** rather than the Mock's silence. Scored on first
  try, so the numbers are honest. T13's engine should take the block over. (T14 #2.)
* `isQuietHours` is `getHours() >= 22`, so **00:30 is not quiet**. Arguably `>= 22 || < 5`. (T14 #4.)
* The Post-test "How did it go?" entry is reachable from `#/night`, `#/morning`, `#/run/post` and the plan
  strip — **but not from Home**. One line in `page.js nextAction`. (T14 #5.)
* `base.js`'s 200 ms double-submit guard is **time-based, not target-based**, so two fast taps on *different*
  strip slots drop the second. A `detail.slot`-aware guard would fit. (T08d #2.)
* The lazy widget proxy forwards only part of the contract (`setRaw`, `skip`, `openSecond`, `preview`, `split`
  are missing until `loadFor()` has run). Screens do await it; document it as mandatory or finish the proxy.
  (T08b #1.)
* `widgets/rootcase.js`'s three-column `cases` stage stacks on a phone (`ang-05`); the reject reason menu can
  reach 10 chips on `ang-10`. Both deliberate, both worth T18's eye. (T08a #3, #5, T08c.)
* BLITZ **recycles** its pool (`items[i % len]`) instead of reshuffling, and its `+20 XP` Daily bonus is flat
  and banked only on finishing. Unreachable in a 60–90 s round with 28–54 entries. (T16 #2, #3.)
* `#/run/missed` shows the first 5 of the list, not a rotating window — a student stalled on one item keeps
  seeing it first. (T16 #4.)
* `home.js planStrip()`'s pill loop is **dead on the happy path** (plan.js replaces it) and left standing on
  purpose as the failure mode. (T14 §7, INTEGRATION-W4 §5 #7.)
* `run.js` exports a duplicate `JUMP` constant + `applyJump` alongside `onboard.js`'s; the live path is
  T14's and the duplicate is inert, but they should import one of the two. (T16 §Requests.)
* `setupMiss` is persisted by the ≤ 5 s autosave tick, so a reload inside that window forgives a Boss setup
  miss. (T12 #3.)
* The `work` scratch survives only on the **three most recent** Mock-like runs (`CAPS.workRuns`); an older
  report prints "Nothing written here." Correct per S6. (T13 #3.)
* `store.js` `update(fn, {immediate:true})` wrote nothing when the state happened to be clean (`flush()` is
  dirty-gated). **Fixed by T17** — listed here only because a note may still describe the old behaviour.

**Tooling / policy**

* **No `apple-touch-icon` on iOS, by policy.** `coverage.test.mjs` asserts zero PNG/JPG/GIF/WEBP/PDF anywhere
  under `site/` (BUILD-POLICY §1) and iOS ignores SVG touch icons, so the home-screen icon falls back to a
  screenshot. **DECIDED at Wave 5 integration: accept it — no raster, no `<link>`** (`notes/INTEGRATION-W5.md`
  §3). BUILD-POLICY §1 is the one rule that cannot be undone once Pages has served it, CI now enforces it on
  the uploaded folder, and the whole cost is a home-screen icon that falls back to a screenshot, on iOS only.
  (T15 §Requests, T01 #3.)
* **The precache list goes stale whenever a file lands under `site/{js,css,data,assets}`.** Run
  `node qa/gen-precache.mjs` and commit the one-line diff; `tests/sw.test.mjs` is the alarm. Deliberately not
  in CI — the Action must not rewrite the repo it is testing. In sync at 105 paths today. (T15 #1.)
* `notes/sweep-w1.mjs` was **superseded** by `coverage.test.mjs` and was **deleted at Wave 5 integration**.
  (T06f §Requests → T17.)
* `gen.test.mjs` is ~43 s of the 47 s suite (5 000 seeds × 21 templates). `GEN_SEEDS` is the knob if it ever
  needs to be faster; it does not today. (T07a #4.)
* Watch for `*/` inside a JS block comment and `/*` inside a CSS comment — both have broken the whole boot
  graph mid-wave, and neither is caught by `node --test` until the module fails to load.
  (INTEGRATION-W4 §6, T15 §Requests.)

**Duplication left in place deliberately (T17 judged the swap riskier than the duplication)**

* `js/grader/mc.js` `hash53` / `stableOrder` duplicate `js/rng.js`'s `cyrb53` / `mulberry32`. T05 asked T17 to
  swap them. **Not done:** `asn.js` and `termmatch.js` import `stableOrder` from `mc.js`, and option order is
  a *rendered* property pinned by fixtures in `golden.test.mjs` / `word-graders.test.mjs`. A different hash
  reorders every mc/asn/termmatch option on every seed. Worth doing, but as its own change with the fixtures
  re-baselined in the same commit — not as a side effect of consolidation. (T05 §Requests → T17.)
* `cleanMsg()` (strip the leading glyph off a grader message) appears in **8 files** under `site/js/widgets`.
  It belongs in `widgets/base.js`. Not T17's files. (T08d §Requests → T17.)
* `pickN(rng, arr, n)` is private in `js/gen/factor.js`, `quad.js`, `notation.js` and `classify.js` (each
  avoiding `rng.shuffle`'s one-draw-per-element cost against the real 200-draw cap); it belongs in
  `js/gen/contract.js`. Also: T07a's templates expose `gen(seed, params)` while T07c's expose `gen(rng, opts)`
  and the registry bridges them — one shape would be cleaner. (T07c §Requests → T17.)

---

## D. Raised in a note, verified FIXED — do not re-chase

| raised in | item | status today |
|---|---|---|
| T00 #2, T06a #1, T06d #1, T06e #3, T06g #1 (five lanes) | `node --test tests/` fails on Node ≥ 25 (directory positional) | Fixed by `tests/index.js`; both discovery paths green, and CI now runs the policy command on Node 22 **and** 24 |
| T11 #2 | nine trophy counters never bumped → nine trophies unreachable | All 11 counters are bumped: `screens/card.js:512-523, 753, 770-774, 839` and `screens/mock.js:383-392` |
| T11 #1 | `qa/shot.mjs --state` is overwritten by the app's debounced write | Fixed — `qa/shot.mjs:51` warms up on `version.js` so the app cannot boot before the save is injected |
| T13 #2 | `widgets/rootcase.js` has no `ctx.values` restore | Landed at Wave 4 (`restoreValues(ctx.values)`, `found` restored first; pinned by `integration-w4.test.mjs`) |
| T12 #2 | boss auto-H1 records a hint the student never saw | Fixed — the second-miss auto-hint now respects the hidden ladder (pinned by `integration-w4.test.mjs`) |
| T16 §Req, T14 §4.1 | a **failed** JUMP writes `m = 0` | Both writers now write nothing on a fail; byte-compared in `integration-w4.test.mjs` |
| T09 §Req → T01 | `app.js` had its own copy of the S4 XP ladder | `app.js:7` imports `xpForLevel/levelFor/rankFor` from `js/xp.js` and re-exports them |
| T06c §Req → T06g | the `grouping` misconception key | Added (`data/misconceptions.js:77`); all 11 `wp.js` entries carry `tag:'grouping'` |
| T08c §Req, T07b §Req | `site/dev-widgets.html` / `site/dev-gen.html` inside the deploy artifact | Gone — `site/` holds one HTML file, and CI's `artifact-policy` job now fails on any raster/PDF/`site/content` |
| T00 §Req → T04 | F1 `rightMarks` should be `[['B','A']]` | `data/figures.js:27` — `rightMarks: [['B','A']]` |
| T02, T06b #1, T06c #1, T06f #1, T08a #1, T08c, T08d #1 | the misconception tag scan red on `num.js` / `figsystem.js` / `csquad.js` / `strip.js` | All green; the scan passes on every file under `site/` |
| T06f §Req → T17 | dedupe the numeric round-trip builder shared with `golden.test.mjs` | Done — `correctRaw()` lives once in `tests/_helpers.mjs` |
| INTEGRATION-W4 §2.1 | Readiness showed "—" on deep links to `#/mock`, `#/boss/:id` | Derived in the shell on every state change |

---

## E. Unfulfilled requests, by owner

Requests that no ticket has picked up. Each is one line to a few in a file the requester did not own.

| owner | request | from |
|---|---|---|
| **T18** | run the ticket at all — §A1 | eight notes |
| **T10 / product** | the M1 placement wipe (§A2) and `microFlashOnly` (§A3) | T14, INTEGRATION-W4 |
| **T09** | honour `part.optional` for a Boss-B4 setup entry, or expose `showSolution()` (§B4) | T12 |
| **T07b** | reconsider `T-fig-bisect-L`'s `tier: 4` against S7's placement | T14 |
| **T06g** | five vocabulary misconception keys so M1's 79 tagless entries can carry one | T06a |
| **T08a** | finish the lazy widget proxy (or document `loadFor()` as mandatory); make `wire()`'s submit guard slot-aware; `Object.defineProperties` in `handle()` so a widget can expose a getter; hoist `cleanMsg()` into `base.js` | T08b, T08d |
| **T07a** | `contract.js`: add `case 'strip'` to `answerFor()` and pass `{ model }` to `checkAnswers()` so `gen.check()` works for figure templates; hoist `pickN` | T07b, T07c |
| **T11 / T14** | gate JUMP HERE on a module that is not already cleared | INTEGRATION-W4 |
| **T16** | set `daily[today].missesDrilled` at the *end* of a drill so `report.js startDrill()`'s three lines can go; import one `applyJump` | T13, T14 |
| **integrator** | ✔ done at Wave 5: 500 K bound **accepted** (§B7), `apple-touch-icon` **declined — policy stands**, `notes/sweep-w1.mjs` **deleted**, §A2 and §A3 **fixed**. Still open: reword `qz-04`'s ⚑ (§B3) — a content call | T01, T15, T06f, T06d |
| **whoever has a browser** | diff the 51 Quizlet stems (§B2) | T00, T06d |

---

## F. Standing rules for whoever picks these up

1. `node --test tests/` green **before** you touch anything, and again before you hand off. It is the deploy
   gate (`.github/workflows/pages.yml`) on Node 22 and Node 24.
2. `node qa/gen-precache.mjs` after any file lands under `site/{js,css,data,assets}`.
3. **Read the screenshots.** Three of Wave 4's four defects were invisible to `node --test`.
4. Fix a failing test by fixing your change. Never delete or skip another lane's test.
5. BUILD-POLICY §1 is not negotiable and is now enforced by CI: no scans, PNGs, PDFs or page exports under
   `site/`, nothing from `source/` or `designs/` tracked, `noindex` stays.
