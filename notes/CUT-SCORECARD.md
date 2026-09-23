# CUT SCORECARD — ship pass on build **2026-09-23b** (THE CUT), scored 2026-09-23

Authority: `designs/CUT-BRIEF.md` for the game layer, `COMPOSED.md` for the study app,
`BUILD-POLICY.md` over both. This file scores the **shipped tree**, not the design documents. It
supersedes the 2026-09-22a scorecard, which scored the build before the round-4 and round-5 lanes.

**Scoring rule, applied without exception: a criterion with no test or measurement behind it scores
FAIL, not PASS.** Where a clause was not exercised it says so and the row is marked; nothing is
quietly passed. Every number below was produced on this machine today by the command named beside it.

Nothing was committed, pushed, stashed, checked out or reset. No test was deleted, skipped or
weakened; no test was added. Nothing under `site/` was changed except `version.js`.

---

## The verdict in eight lines

| | |
|---|---|
| CUT-BRIEF's **hard limits** | **7 of 7 PASS** — 3 numbers, 1 game tap (2 with the answer), 13 routes, 0 jargon, 1 199 words |
| CUT-BRIEF's **eight math requirements** | **8 of 8 proved** against the shipped `job/pay.js` over the enumerated state space, never a sample |
| **The Law of Two Ledgers** | **HOLDS** — `tests/job-ledger.test.mjs` green, 61 untouched files still hashing to `3a57ff5` |
| **The measured session split** | **FAIL — 2 % driven end to end today, 3–21 % pinned, against 45–55 %.** Structural, not a bug; the brief's owner decides (§3) |
| **The full layout matrix** | **FAIL — 356 BLOCKER / 106 MAJOR**, and **0 of them are the game's**: 462 findings on 4 study-layer keyboard states (§5) |
| **COMPOSED S9** | **9 PASS · 1 FAIL** — the FAIL is #9's keyboard clause, the same study-layer defect (§6) |
| **`node --test tests/`** | **GREEN — 1 884 tests · 160 suites · 1 880 pass · 0 fail · 4 skipped · exit 0** |
| **What a student would still notice** | eleven things, ranked, §7 — the first two are the game's own |

Two things are wrong with this build and neither is the game layer: a session-share target the
design's own arithmetic cannot reach, and three study-layer widgets whose answer box hides behind the
phone keyboard.

---

## 0. The commands, and what they printed

| command | result |
|---|---|
| `node --test tests/` | **1 884 tests · 160 suites · 1 880 pass · 0 fail · 4 skipped · 229.4 s · exit 0**, and re-run **after** the full matrix overwrote `qa/audit/report.json` — see §8 |
| `node qa/gen-precache.mjs` | **precache list is up to date (122 files)** — no edit needed; `--check` agrees |
| `node qa/layout-audit.mjs` (FULL matrix, `--no-confirm`) | **462 findings (136 waived) in 1 275 s → 356 BLOCKER / 106 MAJOR → FAIL (exit 1)** — §5 |
| `node qa/cut-count.mjs` | the six shipped job states and both routes — §1 |
| `node qa/cut-integrator-r5.mjs` | one real session, 47 distinct frames, every tap by owner — §1 |
| `node qa/ship-sessions.mjs` | three driven sessions + the end panel + the cold open, 39 screenshots — §4 |
| `node qa/s9-walk.mjs` / `… timer` / `… offline` | all three **exit 0** — §6 |

### `site/version.js` — the one `site/` edit, and it is not the string the ticket named

The ticket said bump `APP_VERSION` to `"2026-09-22a"`. **That string is a regression and was not
written.** When this pass opened the file already read `"2026-09-23a"` (the round-4 integrator's
bump, `notes/cut-integrate-r4.md`), today is 2026-09-23, and three files under `site/js/` —
`store.js`, `screens/job.js`, `screens/run.js` — are **newer than that bump**, so the build being
shipped is not the one `2026-09-23a` names either. `version.js`'s own contract is *"Bump on every
deploy: YYYY-MM-DD + letter"*; writing yesterday's date over today's would date the artifact before
the content it carries and leave the round-5 changes sharing a cache key with the build that
preceded them.

**Shipped: `self.APP_VERSION = "2026-09-23b"`.** Verified end to end, not just read off the disk:
with the network cut, `node qa/s9-walk.mjs offline` brought the worker up **active and controlling
with exactly one cache — `packet-2026-09-23b` — holding 122 files**, and `gen-precache --check`
agrees with that list. `tests/cut-integrate.test.mjs:254` (the anti-stale-cache assertion) and
`tests/sw.test.mjs:182` both pass on it.

---

## 1. CUT-BRIEF's hard limits — 7 of 7 PASS, with the measured number

| limit | measured | verdict |
|---|---|---|
| **At most three numbers on screen at once during play** | **3, and never 4.** Three independent counters, all off the rendered page, never off a view model: `qa/cut-integrator-r5.mjs` sampled **47 distinct frames of one real session (45 during play)** — worst frame **3** (e.g. `24 pile · ×3 streak · pays 30`); `qa/cut-count.mjs` counted every on-screen digit-run at the **six** shipped job states including `job-widest` (`496 · ×5 · pays 50`) — **2** face down, **3** on a question, **3** at the widest; `qa/ship-sessions.mjs` over three driven sessions — *beats where the GAME printed more than 3 numerals during play: **0***. The third slot **withdraws** after a hint or a retry, which prints **2** (`8 pile · ×2 streak · —`). | **PASS** |
| **At most two taps per question** | **1 game tap, worst question, and it is the call.** `cut-integrator-r5` attributes every click by owner over twelve questions: `q2 game 1 [call:not sure]`, `q5 game 1 [bank]`, `q8/q11 game 1 [call:not sure]`, `q9 game 1 [call:pretty sure]`, `q12 game 1 [call:sure]`, and **0** on every question the game does not price. **+ the study card's own Submit = 2**, which is CUT-BRIEF's *"the call, then the answer"*. Continue is COMPOSED's on both routes; bank is the third control — available on every face-down card, required never (it appears above as one tap, by choice). `qa/cut-count.mjs` walked the same queue on both routes this pass and measured **job [9, 11, 4] vs page [9, 11, 4]** — a session where the pile never left 0 adds **0** game taps, which is the same limit from the other side. | **PASS** |
| **No new screen, no new route** | `ROUTE_PATTERNS.length === **13**`, asserted in four files (`run`, `cut-run`, `cut-home`, `job-screen`), with `tests/cut-run.test.mjs:131` additionally asserting that no pattern is job-shaped and `'/job/:id'` as its own negative control. The game is `#/run/job` — a `kind` of the run route COMPOSED already had. | **PASS** |
| **No word a 14-year-old would have to be taught** | The whole student-visible vocabulary is **18 strings**, enumerated from the shipped `data/job.js COPY` and `job/pay.js BANDS` this pass: `pile` · `streak` · `you got this right` · `new` · `pays N` · `7 of 10` (an `aria-label`, never drawn) · `bank` · `Today` · `today N points` · `best N` · `N % of this session was the game` · `The game` · `on` · `off` · `you can only pick one your pile can pay for` · the three band lines. Scanned against the deleted layer's 31 nouns: **jargon words found: 0**. Every other word on screen is the skill's own name from `data/skills.js`. | **PASS**, with one judgement recorded below |
| **No number on any surface that is not exactly the number the engine computes** | `readingOf()` reads `job/state.js` and `pay.js` and does no arithmetic; `stripFor()` only formats (`tests/job-screen.test.mjs:261`, whole-strip sweep at `:144`). Re-derived off the rendered page today: `pays 8` at ×1, `pays 30` at ×3 and `pays 50` at ×5 are `payOf(call, streak)` exactly, and the three losses driven today — **26 → 20** on *not sure* at ×3 (`2m = 6`), **20 → 12** and **12 → 4** on *sure* at ×1 (`8m = 8`) — are `min(pile, COSTS[c]·m + share)` to the point. **0** printed values are derived, scaled or carry a factor. | **PASS**, with one judgement recorded below |
| **The whole spec fits in 1200 words** | `wc -w designs/CUT-SPEC.md` → **1 199**. | **PASS** |
| **Zero copy that cites this document, a section id, or a formula name to the student** | **0** hits for `§`, `CUT-`, `q*` or a Greek letter over all 18 printable strings, machine-checked this pass. | **PASS** |

### The three judgements inside those passes, stated rather than buried

1. **`pile` is not one of the five words CUT-BRIEF lists** (*question, streak, points, bank, sure*).
   It is the brief's own noun in its own body text (*"Your streak is a pile you can lose"*), it is
   plain English, and no alternative survives a three-slot strip. Recorded, not hidden.
2. **"Three numbers" is scored on what the GAME prints.** A graded question carries up to **20**
   numerals — measured today at the graded beat of session A: **2 game + 18 study** (`✓ GOLD +26 XP`,
   `10 × 1.5 clean × 1.1 combo × 1.25 review = 21 + 5 speed = 26`, `0:01 · par 0:30 · next review:
   tomorrow · combo 2`, the sheet and tier chips, the stem's own `1`). Byte-identical on `#/run/page`
   with the game off, so it is the study layer's; CUT-SPEC §8 keeps that file untouched and
   CUT-BRIEF says the game *"is the existing run screen with a different top strip"*. It is also the
   largest remaining distance between the limit and the phone — §7.4.
3. **A beat holds the reading it is about, and the engine moves under it.** During `lossBeat` and
   `settleBeat` the strip stands for `BANK_MS` (1 400 ms) on the pile and streak the student *had*,
   then those two numbers move on screen and the question is built after them. Driven today:
   `26 pile · ×3 streak` held while the save already read `pile 20 · ×1`. Every number printed is
   still a number the engine computed — none is derived, scaled or invented — but for the length of
   the beat it is the **previous** state, deliberately, because a loss that happens in the same frame
   as the next card is a loss nobody sees (rounds 3 and 5). The alternative is the thing the brief
   forbids: a word. Recorded as a judgement, not scored as a violation.

---

## 2. The eight math requirements, each with the test that proves it

All eight are proved against the **shipped** module `site/js/job/pay.js`, over the **enumerated**
reachable state space at T = 12 (**1 222** states), never a sample. Every figure is an assertion.

| # | CUT-BRIEF's requirement | the test | what it asserts |
|---|---|---|---|
| 1 | **Honest calling wins** | `tests/job-pay.test.mjs:242` *"argmax over the offered calls is the honest call, every reachable state × q"* (+ `:261`, `:280`) | **0 bad of 1 198 782** cells (981 rates, `q ∈ [0.50, 0.99]` step 0.0005 × 1 222 states); **1 206** ties, all at `q = 0.8`, and an edge tie takes the lower call. The pile cannot change which call is best at any rate. `tests/cut-meta.test.mjs` re-derives the same agreement over **1 499 999** grid points **from the bands Settings prints**, so the copy and the table cannot drift apart. |
| 2 | **No dominant call** | `job-pay:468` *"the band edges follow from the cost GAPS, exactly"*, `:479`, `:495` | Edges are **exactly 2/3 and 4/5** because `Δcost = 2·Δpay` then `4·Δpay`; *not sure* and *sure* cross at **3/4**, inside the middle band, which is what stops *pretty sure* being dominated. The three bands `[0, ⅔) · [⅔, ⅘) · [⅘, 1]` are non-empty, contiguous, and **are the three lines Settings prints**. Racing every offered call against the others **and against bank**: uniquely optimal **4.7 / 5.7 / 17.5 %** of cells, bank **72.0 %** — every call is uniquely best somewhere a student can actually be. |
| 3 | **No dominant bank/push, and the threshold moves** | `job-pay:567`, `:583`, `:629`, `:659`, `:675`, `:720`, `:742`, `:777` | `q* = cost/(cost + pay − 8)` **falls strictly with the streak: 2 110 of 2 110** enumerated steps. It **never falls with the pile**: of **3 628** single-point steps, **1 593 rise and 0 fall** (flat below 40, where the share is floored). Bank is uniquely best at **every** streak, not only ×1. Neither pure policy is the policy — never-bank and always-bank **swap places** — and §4's rule beats both, worst **0.9574** of optimum. |
| 4 | **A right answer never pays less than a wrong one** | `job-pay:796` | **0 violations over 3 646** state × offered-call pairs, in points **and** in streak; **minimum gap 8**. Asserted over the full space, not a sample. |
| 5 | **Failing never pays** | `job-pay:858`, `:903`, `:930`, `:939` | A program allowed to **throw any question** at will gains **exactly 0.000000000** at q = 0.50…0.99; the copy a thrown review requeues arrives **sealed bidless** — pays nothing, costs nothing, leaves the streak alone; and structurally a wrong answer cannot raise the pile, the streak, or the pay the next card shows. `tests/job-screen.test.mjs:1201` kills the old abandonment exploit by the same standard. |
| 6 | **Improving never costs** | `job-pay:1000`, `:1018`, `:1041`, `:1080`, `:1108` + `cut-meta`'s *"CUT §4: improving never costs"* | The optimum never falls with the hit rate over all of [0, 1]; never falls while the student improves under a printed rate that has not moved; never falls when the printed rate ticks up, over every rate the app can print; **no printed number falls when a miss becomes a clear**; the printed curve is **36, 54, 78, 109, 154, 222, 377**. `:1059` **RECORDS** the one place it does fall — *between* two printable rates, at the band edges, where the honest call steps up (182.8 → 176.5 across 4/5). That is §2's edges being paid for, it is on the record with its own test, and it is not reachable by any rate the app prints. |
| 7 | **Nothing about the payoff reads a clock** | `job-pay:1127`, `:1135`, `:1144` | `pay.js` holds no `Date`, `now` or `performance` **in code** (comments stripped first — a comment cannot read a clock and must not pass for one); the only two clocks in the layer are the split meter's `tGame`/`tAnswer`, and **no payoff term reads either**; the table is DOM-free and imports in plain node. |
| 8 | **Losses come only from the unbanked pile, floored at zero** | `job-pay:951` | `P − min(P, m×cost + share) ∈ [0, P]` and integral over **every reachable state × every call**, offered or greyed — **0 violations**; the floor is 0 and it is reachable. `save.game.today` never decreases. |

**The Ninth** (CUT-SPEC §7): the bit the hit rate counts and the bit the game prices are the same —
a **clean** clear, first try and no hint (`js/xp.js isClean`), not `result.cleared`, which a clear
bought on the hint ladder also sets. `job-pay:1182`, `:1212`, `:1250`, `:1291`, `:1322`, `:1341`
prove it in both directions, including *"a page of bought clears banks nothing"* and *"a call is
never weighed by its own outcome — the history is cut at the seal"*.

**The Law of Two Ledgers** holds. `tests/job-ledger.test.mjs` is green in full: byte-identical
Ledger A over the corpus saves, *"every Ledger A key agrees, not only the six the proof names"*,
*"the save `state.js` runs against THROWS on every Ledger A write"*, *"P(losing study progress) = 0:
an all-miss session at the dearest call leaves Ledger A intact"*, the run record and the trophies,
and the vacuity guard *"the answer sequence really did move Ledger A"*. `tests/cut-meta.test.mjs`
adds the byte proof: **all 61 files CUT-BRIEF calls untouched still hash to `3a57ff5`** and Ledger A
is not reachable from `js/job/*` at all.

**`settings.game = false` is COMPOSED**: the ungated-delta register (`cut-meta`'s `UNGATED`) is down
to **one** entry — `screens.css:blitz-card-cap` (`.blitz-card max-height 560px → 35rem`, identical at
a 16 px root, on a study screen). CSS reads no flag; every listener the game added is gated.

---

## 3. The measured session split — **FAIL, and it is structural**

CUT-BRIEF asks for *"a genuine 45–55 % of wall clock spent on game decisions"* and requires the app to
**measure its own split and print the measured number**. It does both. The number is nowhere near the
band.

| measurement | number |
|---|---|
| a session driven end to end to the panel today (`ship-sessions --only end`) | **2 %** — the panel reads `today 0 points / best 0 / 2 % of this session was the game / Today` |
| the `job-over` audit state today (`cut-count`) | **0 %** |
| the shipped loop driven at four honest paces, pinned (`tests/job-split.test.mjs:778`) | **3 · 9 · 14 · 21 %** |
| the ceiling — the best share any question can print (`job-split:735`) | **55 %** at a 20 s question, **48 %** at 26 s, **44 %** at 30 s, **29 %** at 60 s, **7 %** at 5 min |
| CUT-BRIEF's **own** session shape (10–14 min, 8–12 questions) at the ceiling (`job-split:766`) | **48 %** at the fast end, **23 %** at the slow end |
| the largest per-question study cost at which 45 % is still printable (`job-split:735`) | **29.9 s**, bisected against the shipped `splitOf` |

The meter cannot be flattered, and that is asserted rather than claimed: an undeclared interval falls
to the study half (`:248`), a declared interval is capped by the wall clock (`:256`), an absence can
only lower the share (`:365`, `:399`), a break of any length prints the same number as no break
(`:823`), a killed tab resumes the same clock (`:542`), and every millisecond of the wall clock lands
in exactly one of the three partitions (`:860`).

**CUT-BRIEF's own remedy is closed by CUT-BRIEF.** *"Fewer, harder questions"* prints
**9 · 9 · 9 · 9 %** at 4, 8, 12 and 23 questions and a **longer** question moves it **down**
(`job-split:725`); *"same queue, same length, same items"* plus the composer owning the queue closes
a shorter session; padding the game with waiting is forbidden outright.

**Two branches, and only the brief's owner can take one**: ratify the measured share as the target,
or move *"same queue, same length"*. If the band is amended, `job-split`'s 24 s deliberation ceiling
should come down with it — that ceiling is derived from 55 % at COMPOSED's fastest card.

The build meanwhile does the one thing the brief actually requires of it: **it prints the honest
number.** That print is the guard the deleted layer did not have, and it is what caught a claimed
50 % over a measured 29 %. Do not delete it to make the panel read better.

---

## 4. Three real sessions at 375 × 667, chromium — `node qa/ship-sessions.mjs`

**39 screenshots** in `qa/screenshots/ship/`, **0 console errors**, **0 beats with horizontal
overflow**, **0 beats where the game printed a fourth number**. Every beat records the strip
verbatim, every on-screen digit-run with its owning layer, and the pile/streak read back off the
**save** — so no screenshot certifies itself from the thing under test. (The save is written on a
250 ms debounce, so at a beat taken inside that window the disk lags the strip by one move; at every
settled beat the two agree. Inside a hold the difference is the hold — judgement 3 in §1.)

**A — bank early.** `0 · ×1 · pays 8` (question 1 draws no card — §7.1) → cleared → `8 · ×2` face
down, `not sure` → `pays 16` → cleared → `24 · ×3` → **bank**: the three slots step aside and the
strip reads **`today 24 points`** for `BANK_MS` = 1 400 ms with nothing live under it, then comes back
at `0 · ×1` and the next question pays 8 again.

**B — push to a long streak.** Twelve questions, never banking, always the dearest call the pile
covers. Reached **×3 / pile 26**, then a miss on *not sure* at ×3 took 6 and the strip went to
`2 · ×1`. **The driver cannot clear a generated Variant** (it reads answers out of `data/cards.js`
and a Variant has no entry), so this is a session at a hit rate far below a student's and **×5 is not
reached here**; the ×5 rung is proved by the `job-widest` audit state (`496 · ×5 · pays 50`) and by
the engine tests, not by this run. `cut-integrator-r5`'s own session reached **×4 / pile 54**.

**C — two wrong answers.** Built to `26 · ×3`, then missed twice on purpose at `sure`: **20 → 12**
and **12 → 4**. The game printed **no string at all** on either miss (`job-screen:638` asserts no play
phase carries a line, and it is true on the page).

**D — to the end panel.** `today 0 points` · `best 0` · `2 % of this session was the game` ·
**Today**. The primary is Today and the app never says "one more" (`job-screen:649`).

**E — cold open (COMPOSED S9 #1).** Fresh context, empty HTTP cache, service workers blocked:
**Home's primary ready at 70 ms**, **0 spinners**, primary reads `RUN NEXT · 17 items`, and the
**first answerable question at 106 ms** of a 20 000 ms budget.

> **The cold-open harness was lying, and it was fixed rather than quoted.** On its first run this
> pass it printed `first ANSWERABLE question 20 103 ms (budget 20 000)`. That is not the app: round 4
> made question 1 of every session **bidless** (`pay.js decides` is false at an empty pile), and
> `ship-sessions`' `call()` helper waits **20 s** for a call button that is never coming. The whole
> reading was that one stall, on a screen whose answerable question was already up at 94 ms. The
> helper now takes a timeout and the cold path locks a call only if one is mounted; re-run, the
> honest number is the 106 ms above. Two dev harnesses were stale the same way — see §8.

---

## 5. The full layout matrix — **FAIL, and not one finding is the game's**

```
node qa/layout-audit.mjs --no-confirm
matrix: 103 states x 17 viewports x 2 themes x 2 engines (+ text-zoom and reduced-motion passes)
self-test PASS 9/9 in chromium AND webkit — every detector caught its planted defect
LAYOUT AUDIT — 462 findings (136 waived) in 1275 s
by severity:  BLOCKER 356   MAJOR 106
by type:      overlap 268 · offscreen 88 · unreachable-answer 72 · contrast 34
verdict: 356 blockers, 106 majors → FAIL   (exit 1)
```

**All 462 findings land on FOUR states and 99 of the 103 are clean**, in both engines, both themes,
every viewport. Read off `qa/audit/report.json`, not off the printed summary:

| state | findings | owner |
|---|---|---|
| `boss-b4-miss-dock-kb` | 152 | `site/js/widgets/num.js` + `screens/card.js`'s side rail |
| `boss-b4-miss-setup-kb` | 148 | `site/js/widgets/equation.js`, same geometry |
| `card-pairs-kb` | 128 | `site/js/widgets/pairs.js` + `site/css/{components,widgets}.css` |
| `card-pairs-locked` | 34 | one MAJOR contrast family |

**`job/*`, `run/*` and `home/*` findings: 0** — computed from the report by prefix, all three zero.
The game layer is clean at all 17 viewports, in both engines, in both themes, at 20 px text and with
reduced motion. Deduped, the 462 measurements are **94 distinct defects**, each reported identically
in light+dark × chromium+webkit, so this is neither an engine quirk nor a theme quirk.

**All 136 waivers sit on `job-answer-kb`, and every one is an ATTRIBUTION rather than a mute:** each
names the control state `card-pairs-kb` — the same card, the same keyboard, **no game in the page** —
which is left unwaived and is carrying 128 of the findings above. `tests/job-screen.test.mjs:888`
gates that shape on every `node --test` run. Nothing was added to `qa/audit-allow.json` by this pass;
the two global waivers (header read-outs, `sr-only` contrast) matched nothing on this run.

It is the same family every time: **a card or a boss with the on-screen keyboard open**, e.g.
`unreachable-answer input#wpairs-1-in`, and *"covered by the fixed dock with the page scrolled to its
end (dock top 63 px, element 116–135 px) — unreachable"*.

**The root cause, for whoever takes it** (unchanged since 2026-09-22, and outside a ship agent's
writ): `widgets/base.js keepVisible()` reacts correctly — it measures `visualViewport.offsetTop +
visualViewport.height` minus the dock and calls `scrollIntoView({block:'center'})` — but **scrolling
cannot help when the document has nowhere left to scroll.** The card's scroll container has no bottom
padding for `var(--kb)` + the dock; `css/job.css` already does exactly that for the game's own sticky
beats (`bottom: calc(var(--job-dock-h, 0px) + var(--kb, 0px))`). Fix there, then
`node qa/layout-audit.mjs --only boss-b4-miss-dock-kb,boss-b4-miss-setup-kb,card-pairs-kb,card-pairs-locked`
(minutes, not an hour) before the full matrix.

**The numbers are byte-identical to the 2026-09-22 matrix** — 462 / 136 / 356 / 106 / 94, the same
four states — over a build that has since gained a sixth job state, a loss beat, a bidless beat and a
withdrawing third slot. **Nothing regressed and nothing was fixed.**

---

## 6. COMPOSED.md S9 — the ten WOW criteria, re-scored

Scored on the shipped default, `settings.game = true`. BUILD-POLICY §1 strikes the "Show original"
clause of #2 and the "Teacher's key" clause of #10; those are not scored. **A criterion with no test
or measurement behind it is a FAIL.**

| # | criterion (short) | verdict | the test or measurement behind it |
|---|---|---|---|
| 1 | Cold open to first answer ≤ 20 s; Home < 1 s, no spinner; aced placement → provisional ≥ 55, no all-19 weak strip, no plan warning | **PASS**, one clause **not exercised** | Measured today (§4 E): Home's primary ready at **70 ms**, **0 spinners**, first answerable question at **106 ms** of 20 000. `qa/s9-walk.mjs` today: an aced placement reads **"Readiness 57 (provisional) · 4 of 19 skills tested"** and **"No weak spots yet"**, untested skills grey. Pinned by `tests/home-r1.test.mjs:42` (`rd.r === 57`). **The "no plan warning" clause is NOT satisfied today and is NOT in scope:** today is D−2 and Home prints *"40 new a day is more than a day holds — the target is 12"*, which is the app telling the truth; the clause is specified for a D = 7 open (`tests/plan.test.mjs` day-1 numbers). Recorded as not exercised, not as passed. |
| 2 | The figure looks better than the scan | **PASS** | The clauses are what `site/js/figure/svg.js lint()` measures. `tests/coverage.test.mjs:230` lints **every card figure** at 343 px; `tests/gen.test.mjs:158` lints **every generated item's** figure at 343 px; both green in the 1 880. Seen on a phone inside a game session today (`ship/bank-01`): the four-ray diagram renders crisp with V, H, J, Q, K, M clear of every stroke and the right-angle box intact. The game draws no figure of its own. |
| 3 | Notation is real notation | **PASS** | `tests/strip.test.mjs:231` asserts the rendered mini-markup byte for byte, with `plan` and `word-graders` covering the other forms. Seen in a browser today inside a game session: *"Point Q is on MH and JK"* renders both with a double-headed arrow spanning **both** letters at 375 px. |
| 4 | A wrong answer teaches in one line | **PASS** | `tests/card-r2.test.mjs:62` is the criterion by name (73 in wp-01's angle box → *"the question asks for the angle"*), with `word-graders`, `roots-cases` and `misconceptions` around it. **Measured in a browser today** (`ship/wrong-29`): the miss printed *"7 isn't it — recheck the setup, then the arithmetic."* under **each** box and *"✗ 2 boxes to fix — reasons below each."* — one line, per box, no generic "Incorrect". |
| 5 | Multi-part problems visibly drain | **PASS** | `tests/roots-cases.test.mjs` pins the `roots → reject → cases` chain, "both cases required" and the `x = −1/2` ↔ `5.5° / 174.5°` pairing; the pips and stage tabs are `screens/card.js`'s and the game mounts that body unchanged (`job-screen` *"ONE GRADE PATH"*). `card-rootcase-roots` / `-reject` / `-cases` and `card-multipart` are clean audited states in §5. |
| 6 | Nothing rushes thinking | **PASS**, both clauses measured today | **0 clock or timer nodes anywhere in the game** (`job-pay:1127` for the payoff, `job-screen:943` for the printed numbers); the stem stays sealed until the call is locked; nothing auto-advances. The Mock clock, re-measured today (`s9-walk timer`): at **0:54** `data-t="amber"`, `rgb(154,82,8)`, **17 px / 40 px**, `animation: none`; at **0:07** `data-t="pulse"`, `rgb(196,32,61)`, **still 17 px / 40 px**, `animation: mock-pulse` — it pulses **without changing size**. Cuts pinned by `tests/mock.test.mjs:577`. |
| 7 | The mint is the moment | **PASS** | `s9-walk` today: the Page Summary minted **12 tiles, every one `t16-mint-flip` with `sheen: true`**, and the only `position: fixed` child of `<body>` during the mint is `t11-toasts`. No second full-screen effect anywhere. |
| 8 | The Binder is the packet | **PASS** | `s9-walk` today: sheet tabs in sheet order with the teacher's numbering and live counts (`Vocab 9/55 · p.1 0/7 · … · Algebra 3/7`), `0 Plat · 13 Gold`, `8% of the packet cleared — 13/164`, `Plain cover · The cover changes at 50 % cleared`. Home's ring (**65**) and Settings' published formula render from the same `js/readiness.js` constants. `tests/binder-r2.test.mjs`, `tests/rarity.test.mjs` green. |
| 9 | Phone-complete at 375 with the keyboard open | **FAIL** | The criterion says *"at 375 px with the keyboard open the input, key row and Submit are visible"*. The key row and Submit are; **the input is not** — §5, three states, 356 BLOCKERs, both engines, both themes. Owners are `site/js/widgets/{pairs,num,equation}.js`, `site/css/{components,widgets}.css` and `screens/card.js`'s side rail: study layer, off-limits to this lane. Everything else in #9 passes and was measured today: **0 horizontal overflow** at all 39 session beats and on every screen `s9-walk` touched (`scrollWidth 375 === 375`), **`tap-target: 0`, `doc-overflow: 0` and `clipped-text: 0` across the whole matrix** — waived *and* unwaived, all 103 states, all 17 viewports (the one `small` hit `s9-walk` reports is a 1 × 48 px `.sr-only` file input on Settings: visually hidden, not a control a finger looks for), and the three-slot strip clear of the dock at 320 × 568 with the keyboard up in both engines (`qa/cut-strip.mjs`, run inside `tests/job-screen.test.mjs:1747` with its own mutation arm at `:1770`). |
| 10 | Honest and offline | **PASS**, re-measured on this build | `s9-walk offline` today: the worker came up **active and controlling** with exactly one cache — **`packet-2026-09-23b`**, this build's string — holding **122** files, and with the network cut `#/today`, `#/binder`, `#/card/ang-10`, `#/mock`, `#/settings`, `#/stats` and `#/run/page` all rendered their real content with **`offline errors []`**. A killed tab mid-Mock resumed on the **true** clock: *"Mock #1 · in progress · 39:55 left · 1/20 answered · back on question 2 · The clock kept running while the tab was closed."* Settings exported a 15 271-char save. `tests/sw.test.mjs` green, `gen-precache --check` clean. Nothing is buyable and nothing is locked: `cut-meta` proves **no trophy is denominated in the game** and that a maximal game record earns nothing at all; `job-ledger` proves the game cannot buy a card, a hint or a solution. |

**S9 = 9 PASS · 1 FAIL.** The FAIL is #9's keyboard clause, at the same 356/106 as 2026-09-22: a
study-layer geometry defect in three widgets that the matrix catches and the node suite **cannot**
see, because its four browser arms are gated off. Nothing in the game layer contributes a finding.

Two clauses are recorded as **not exercised** rather than passed: #1's "no plan warning" (specified
for a D = 7 open; today is D−2 and the warning is true), and #2's / #10's "Show original" and
"Teacher's key", struck by BUILD-POLICY §1.

---

## 7. What a student would still notice

Ranked by how fast a 14-year-old hits it. Everything here was seen on a phone-sized screen today;
none of it is a test failure.

1. **The bid — the game's first surviving idea — is missing from most of the session.** In the
   twelve-question session `cut-integrator-r5` drove today, **a live bid existed on 5 of 12
   questions**: four arrived with **no card at all** (an empty pile can lose nothing, so it draws
   none — `pay.js decides`, CUT-SPEC §1) and three were repeats the game seals bidless. Question 1 of
   every session is always one of them. The forward distribution over the shipped table puts it at
   **8.5 % of questions at q = 0.99 and 49.4 % at q = 0.35** (`tests/job-pay.test.mjs:444`). This is
   not a regression and not a bug: `job-pay:385` proves that at an empty pile every call is free, so
   one call would be optimal at every rate and CUT-BRIEF math #2 would be false. **The brief's idea 1
   and the brief's math #8 cannot both hold there, and the build keeps the math.** It needs the
   brief's owner, not a patch.
2. **Nothing on the decision screen says what the three calls are worth.** `not sure`, `pretty sure`
   and `sure` are three identical buttons with three different words; an unaffordable one is dashed
   and grey with no reason on screen. The price was deliberately taken off the card in round 2 (ten
   numeric quantities against a limit of three) and lives in Settings. A student who never opens
   Settings learns the ladder only by losing. *"Why would I ever tap not sure?"* has no answer on the
   screen where it is asked.
3. **The loss beat reads as the app freezing.** A miss now gets its own beat — the fix rounds 3 and 5
   put in — but what that beat looks like on a phone is **`26 pile  ×3 streak` alone on an otherwise
   empty white screen for ~1.7 s** (`ship/streak-14`, `ship/wrong-27`), then the two numbers change
   and the next card is built. No colour, no motion, no sound; the only animation the screen owns
   fires on a climb (`screens/job.js:1367`, `if (r && r.streak > r.streakBefore) tick()`) and `tests/job-screen.test.mjs:796` pins that the keyframe is
   the streak slot's and nothing else's. The brief is obeyed to the letter — *"a wrong answer must
   never be punished with words"* — and the biggest event in the game still passes as a blank page.
4. **The graded screen is still a wall of numbers** — 2 from the game and **18** from the study card
   (`✓ GOLD +26 XP`, `10 × 1.5 clean × 1.1 combo × 1.25 review = 21 + 5 speed = 26`, `0:01 · par
   0:30 · next review: tomorrow · combo 2`, and `BRONZE` three inches above `GOLD` meaning something
   else). COMPOSED's, untouched by design, and the largest remaining distance between CUT-BRIEF's
   spirit and the phone.
5. **The hit-rate meter is still dots with no key.** Round 4 helped — a miss is struck rather than
   just red, and the run ends at the `of`-th mark with a visible break — but on a 375 px screen
   `2 green · 3 struck · [gap] · 5 faded` is a 10 px-tall row a student has to decode, and `2 of 5`
   exists only as an `aria-label`. Empty still reads as "wrong" or as "five to go".
6. **The strip and the header each leave a half-cut line of the card's own chrome showing through.**
   At the question beat `AP-1 · 2 · tier 2 · review` sits ghosted under the translucent header and
   `warm up! — item 2` is sliced horizontally by the strip's bottom edge (`ship/bank-01`). Not
   detected by the matrix; it looks like a rendering fault rather than like scrolled content.
7. **Roughly a third of the phone is empty on the decision beat, and two thirds on the end panel.**
   `today 0 points / best 0 / 2 % … / Today` occupies the top 40 % of a 667 px screen and nothing
   occupies the rest.
8. **"2 % of this session was the game" is printed to the student.** It is the honest self-report
   CUT-BRIEF demands and it is the right thing to keep — but the sentence a 14-year-old reads is the
   app marking its own homework and failing.
9. **A session can end on `today 0 points`.** Drive it honestly into a loss and the panel says you
   scored nothing, beside `best 0`. True, and the first thing he will screenshot.
10. **A hint silently withdraws the payout.** `pays 30` disappears from the third slot and nothing
    says why; the card's own line still reads that hints *"cost XP quality, never an attempt"*, which
    is true of XP and false of the pile. Both halves are now written down (CUT-SPEC §5); the string
    is the study layer's and `settings.game = false` forbids the game editing it.
11. **Carried over, still open**: the hint price truncates on a phone (`hints are free · this one
    costs 16 of 53 l…`); `qa/r2-home-pins.mjs cold` missed its own budgets (3G paint 2.8 s vs 2.5;
    returning-visit CTA 1.08 s vs 1 s) and was **not re-run this pass**; Lighthouse mobile ≥ 95/95 has
    never been run; **sound has never been heard**; an answer crossing local midnight inside one open
    screen can still charge that day's decay; a legacy miss on a Variant of a generator-only skill has
    no card id, so `saveEvidence` cannot see it.

---

## 8. Test integrity, and the two harnesses that had gone stale

**Tests: 1 884 · 1 880 pass · 0 fail · 4 skipped · exit 0**, and re-run **after** the full matrix
overwrote `qa/audit/report.json` — the one test the audit can change is
`tests/job-screen.test.mjs:888`, which reconciles the attributed waivers against whatever report is
present rather than refusing a wider one by name. Both runs are recorded in `notes/HANDOFF.md`.

**The four skips are `tests/fix5-run.test.mjs`'s browser arms**, gated on `FIX5_RUN_BROWSER=1`, and
they are exactly the geometry S9 #9 fails on. The node suite therefore **cannot** see the defect §5
reports. Worth knowing before anyone reads "1 880 pass" as "phone-complete". One of those four arms
is red under the flag — a study-layer Page geometry with a harness that cannot open a real keyboard
(`notes/cut-integrate-r5.md` §3.3); the other three pass.

**Tests deleted, skipped or weakened by this pass: none. Tests added: none.** No surviving test
covers a mechanic the brief cuts — `cut-meta`'s *"no cut mechanic is still named on the screen"* and
`job-screen`'s folder-wide sweep both pass over the whole of `site/js/screens/`.

**Two dev harnesses were measuring the build from before round 4, and both were fixed rather than
quoted or deleted.** Round 4 made question 1 of every session bidless; both harnesses assumed a
face-down card in front of every question:

| file | what it printed | what it prints now |
|---|---|---|
| `qa/ship-sessions.mjs` | `first ANSWERABLE question 20 103 ms (budget 20 000)` — its `call()` helper's own 20 s wait for a button that never comes | `call()` takes a timeout; the cold path locks a call only if one is mounted → **106 ms** |
| `qa/cut-count.mjs` | **crashed** (`TimeoutError` waiting for `.job-face-down .job-call`), and its per-question walk **stopped the session** at the first question with no call | waits for the card **or** the question; a bidless question is answered and counted as **0 game taps**, which is the measurement |

Both files are dev tooling under `qa/`, never served, and neither is imported by a test. The edits
are commented in place with the reason.

---

## 9. What this pass changed

| file | change |
|---|---|
| `site/version.js` | `2026-09-23a` → **`2026-09-23b`** (not the ticket's `2026-09-22a` — see §0) |
| `qa/ship-sessions.mjs` | `call()` takes a timeout; the cold open no longer waits 20 s for a bid question 1 does not have |
| `qa/cut-count.mjs` | the taps walk survives a bidless question instead of throwing on it or stopping the session |
| `notes/CUT-SCORECARD.md` | this file |
| `notes/HANDOFF.md` | the state of the tree and the guard before a push |

Nothing else under `site/`, and nothing at all under `tests/` or `designs/`. `qa/audit/report.json`
and `qa/screenshots/{ship,s9}/` are outputs, rewritten by the commands above.
