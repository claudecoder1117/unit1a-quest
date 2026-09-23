# cut-verify — the integrator's pass after round 1 of THE CUT

**Authority** `designs/CUT-BRIEF.md`; `COMPOSED.md` and `BUILD-POLICY.md` rule and are untouched;
**BUILD-POLICY wins**. No `git commit`, `push`, `stash`, `checkout` or `reset` was run at any point.

This pass **supersedes `notes/cut-integrate.md` §1 and its open issues 1 and 2.** Both were wrong
about the shipped build — see §2 and §3. Everything else in that note still stands.

```
cd /Users/oliver/Projects/unit1a-quest && node --test tests/
  tests 1757 · suites 143 · pass 1753 · fail 0 · skipped 4      (the four Playwright-gated arms)

node qa/layout-audit.mjs --only job,run,home --engine both
  LAYOUT AUDIT — 0 findings (136 waived)     verdict: 0 blockers, 0 majors → PASS

node qa/gen-precache.mjs --check → precache list is up to date (122 files)
node qa/cut-count.mjs           → the two measurements below
```

**No test was deleted, skipped or weakened in this pass.**

---

## 1. THE TWO NUMBERS, MEASURED — `qa/cut-count.mjs` (new), chromium, 375 × 667

Both of CUT-BRIEF's hard limits are about what a human SEES and what a human TAPS, so both are
measured off the rendered page, never off `viewModel` — which is the thing under test. A number is a
**digit-run inside a text node whose own rect is on screen**: `×3` is one, `2 of 3` would be two.
Text that is `aria-hidden`, clipped to a screen-reader box, invisible, zero-area or outside the
visual viewport is not on screen and is listed separately, so nothing can hide from the count.

### NUMBERS — limit 3. The game prints **2 face down, 3 on the question. Never 4.**

Driven through `qa/audit-states.mjs`'s own state setups, so this counts the same screens the layout
audit gates.

| state | strip | game | study | shell | on screen |
|---|---|---|---|---|---|
| `job-facedown` | `0` · `×1` · *(marks)* | **2** | 0 | 0 | **2** |
| `job-streak` | `24` · `×3` · *(marks)* | **2** | 0 | 0 | **2** |
| `job-answer` | `0` · `×1` · `pays 8` | **3** | 7 | 0 | 10 |
| `job-answer-kb` | `0` · `×1` · `pays 8` | **3** | 7 | 0 | 10 |
| `job-over` (after play) | — | 3 | 0 | 4 | 7 |

* **The game never prints a fourth number in any play phase.** The three are exactly CUT-BRIEF's
  three: the pile, the streak multiplier, and what the question pays.
* **The app shell prints ZERO numbers for the whole of play** — all six `hdr-*` read-outs are
  `hidden` (verified directly on the live DOM, not inferred from `HDR_JOB_HIDE`).
* The **7 study numerals** are `screens/card.js`'s and are the question itself: the sheet chip
  (`AP-1 · 2`), the tier chip, `1 pair of complementary angles` in the stem, the widget's own
  `Pick 1 pair`, and the hint ladder's `1/3` in the dock. CUT-SPEC §8 keeps that file untouched and
  CUT-BRIEF says the game "is the existing run screen with a different top strip", so a geometry
  question that asks for one pair must print `1`. The limit governs what the GAME adds, and the
  game adds three read-outs and three digit-runs.
* `job-over` is **after** play; the shell's four are Readiness, T−6, the level ring and XP, handed
  back by `syncHeader()` once the session is over. CUT-BRIEF's limit says "during play".

### TAPS — limit 2. The game adds **exactly 1**, and it is the call.

The strongest available form of this proof: the SAME queue walked on BOTH routes with ONE answering
strategy, so the difference is exactly what the game adds. Eight questions, identical item ids,
identical tap sequences apart from the leading `call`:

```
#/run/job    10, 12,  5,  5,  8,  6,  3,  8
#/run/page    9, 11,  4,  4,  7,  5,  2,  7
difference     1,  1,  1,  1,  1,  1,  1,  1      ← every one of them the call
game-owned     1,  1,  1,  1,  1,  1,  1,  1
```

Bank was never needed and never tapped. Every other tap in the loop — the widget's own targets,
Submit, Continue — is COMPOSED's, unchanged from `#/run/page`. This agrees with the model-level pin
`requiredTapsOf` (1 in the call phase, 0 in the flip and the answer) and now stands on the rendered
page as well.

**The absolute column moves between runs and the difference does not**, which is the property that
makes this a measurement rather than a coincidence: the walk varies its picks per attempt (`card.js`
refuses to charge the same wrong answer twice), so a question that graded on the first attempt in
one run takes three in the next — an earlier run of the same eight read `10, 12, 5, 5, 15, 6, 3, 15`
against `9, 11, 4, 4, 14, 5, 2, 14`. Both routes move together, because one strategy drives both.
The difference was 1 on every question of every run.

---

## 2. THE HIT RATE IS DRAWN, NOT PRINTED — and four documents said otherwise

**The root contradiction in the tree, and the reason round 1's open issue 1 does not exist.**

`screens/job.js hitLineOf()` returns `''` whenever the skill has any history, and `new` when it has
none. The rate reaches the student as **one mark per sitting** — filled for a clear, struck for a
miss, empty for a sitting not yet had (`hitMeterOf` → `marksEl`), with `COPY.hits`'s `7 of 10` as
that row's `aria-label` and nowhere else. Measured on `job-streak`: `aria-label="4 of 6"`, ten marks,
**zero digit-runs on screen**.

`notes/cut-integrate.md` §1 reported the face-down card as `0 · ×1 · 2 of 3` and raised "the hit
rate is two digit-runs" as *"the one judgeable call in this pass"*, offering a percentage as the
remedy. **There is nothing to judge: the shipped build already prints no numeral there, and a
percentage would have made it worse** — one digit-run, but precision invented off three attempts and
a number the engine never computed (CUT-BRIEF: "No number on any surface that is not exactly the
number the engine computes"). The code and the tests were right; four pieces of prose were stale,
and a stale document is how a fixed defect gets re-opened. Corrected, all four to match the shipped,
tested behaviour:

| where | was |
|---|---|
| `designs/CUT-SPEC.md` §5 | "a third holding `7 of 10`" — now states the marks, the `''`/`new` rule, and why a ratio and a percentage are both refused |
| `designs/CUT-SPEC.md` §6 | `7 of 10` is now explicitly named as an `aria-label`, not a string on screen |
| `site/js/job/call.js` header | "The face-down card prints the answer as `7 of 10`" |
| `site/data/job.js` `COPY.hits` | "`7 of 10` — a count, never a percentage" with no note that it is never drawn |

`tests/job-screen.test.mjs` already held the correct behaviour over the full reachable state space —
*"at most three numbers on screen, in every play phase of every reachable state"*, counting
digit-runs and asserting `[pile, streak]` face down and `[pile, streak, pay]` on the question. Its
own docstring records the old failure it replaced (*"the test that stood here counted SLOTS, which is
how a three-slot strip printed four numbers for three verification rounds"*). Nothing there needed to
change; my chromium count is the independent confirmation that the model pin is truthful on the page.

---

## 3. `qa/fixtures/midweek.json` WAS STALE, AND IT HAD ALREADY EXPIRED — FIXED

Round 1 called this "the single highest-value QA ticket left" and did not make the change. It is
worse than that note described, and today is the day it broke.

`qa/audit-states.mjs` loads every fixture through `freshen()`, which re-anchors on a file's own
`auditAnchor` stamp. **`midweek.json` carried no stamp, so `freshen()` was a no-op on it** and its
`testDate: 2026-09-22` stayed frozen on the day it was built. Measured today:

```
AS FOUND       today 2026-09-22 → D = 0  · modeFor = post ("the test is done") · qFor.q = 40, warn
AS FIXED       today 2026-09-22 → D = 6  · modeFor = page                      · qFor.q = 10
               on 2027-03-05    → D = 6                                   (it no longer decays)
```

So every midweek-backed audit state — **the five job states and six run states inside this pass's
own acceptance command**, plus Home and the Binder — was auditing a **40-item post-test page**
instead of the 10-item mid-week page the fixture's name promises.

The fix is the one key round 1 identified, `"auditAnchor": "2026-09-16"` (`testDate` − 6), plus one
rule made single in `qa/fixtures/audit-build.mjs`: `midweekBase()` now prefers the stamp and keeps
its old `testDate + 6` rule only as a fallback for a hand-edited file that loses it, and the stamp is
stripped before the save reaches the browser (`unpack` does not drop unknown keys). The two rules
agree on every day by construction, because the stamp is exactly `testDate − 6`.

**Verified safe:** the layout audit was re-run on the corrected fixture and is unchanged —
0 findings, 136 waived, the same waiver counts. `node --test tests/` is unchanged at 1753 pass.

---

## 4. `job-streak` was auditing ×1 — FIXED

The state is named *"the face-down card carrying a pile and a streak"* and its setup played exactly
three questions and stopped, whatever they graded. `jobClearLive` can only clear widgets whose answer
it can read off `data/cards.js`, so a generated Variant fell through to `missOn`, the streak reset on
the miss, and the state was audited at **pile 18, streak ×1** — measured. The multiplier is the one
number CUT-BRIEF says should ever animate, and no audit state was rendering it above ×1.

It now plays the real loop (call → answer → Continue) until the ENGINE says the streak is there,
giving up after 8 questions rather than after 3 attempts, and it reads the pile and the streak off
the save rather than off the strip, so the state cannot certify itself from the thing under test.
It now reaches **pile 24, streak ×3**.

---

## 5. What I did NOT change, and why

1. **The study card's seven numerals on the question.** `screens/card.js` is COMPOSED's, CUT-SPEC §8
   keeps it untouched, and they are the question. §1 explains the reading.
2. **CUT-SPEC §8's split OWNER DECISION stands, unresolved and not mine.** The brief asks for a
   measured 45–55 % game share; the engine measures and prints the honest number, and it is under
   that. The brief's own remedy (fewer, harder questions) collides with its own "same queue, same
   length", so it needs Oliver, not an integrator. I did not touch the meter and I did not pad it.
3. **`data/job.js` still exports `SKILL_GROUPS`/`WINGS`** for one study generator — a study-layer
   ticket, as round 1 said.

## 6. Open issues

1. **Three node tests read `qa/fixtures/midweek.json` RAW and never re-anchor it**, so they compose
   against the wall clock the same way the audit did before §3: `tests/home-r1.test.mjs:90`,
   `tests/plan.test.mjs:782`, `tests/cut-home.test.mjs:704`. They are green today, but
   `home-r1`'s *"composes ≤ 25 minutes and keeps qMin new cards"* is currently asserted against a
   40-item **post-test** page rather than the mid-week page it names. Adding `auditAnchor` did not
   change them (it does not move `settings.testDate`), so nothing regressed — but the fix is to load
   them through `freshen()` and then re-check their thresholds, which may move and deserves its own
   verification run. It is a study-layer QA ticket and I did not open it inside this pass.
2. **`qa/cut-count.mjs` is a tool, not a gate.** Both limits need a browser, and the suite is
   node-only (its four Playwright arms are skipped). The model-level pins in
   `tests/job-screen.test.mjs` are the gate; this is the thing that proves the pins are not lying
   about the page. Re-run it after any change to the strip, the dock or `screens/card.js`.
3. **The strip is never audited at a three-digit pile.** `job-streak` reaches 24; `String(r.pile)`
   is unbounded and CUT-SPEC §6's own example copy is `today 186 points`. `pays 50` is the widest
   the third slot can print, so the pile slot is the only one that can still grow.
