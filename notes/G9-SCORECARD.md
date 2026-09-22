# G9 + S9 SCORECARD — ship pass, build **2026-09-21a** (scored 2026-09-22)

Scored by the SHIP agent against `COMPOSED-GAME.md` §G9 (ten ADDICTIVE-BUT-HONEST criteria) and
`COMPOSED.md` §S9 (ten WOW criteria), with `BUILD-POLICY.md` overriding both. **Scoring rule for this
pass: a criterion whose only evidence is a sentence scores FAIL. Every PASS below names a test that
ran green in this session, or a number measured in this session, and says which.** Where the spec's
own text carries a measured condition or a withdrawal, the condition is repeated here rather than
quietly dropped — that is the whole point of G9 #6.

## Gates run for this ship pass

| gate | command | result |
|---|---|---|
| version | `site/version.js` | `self.APP_VERSION = "2026-09-21a"` (was `2026-09-17e`) |
| precache | `node qa/gen-precache.mjs` then `--check` | **127 files**, list already current, `--check` clean |
| unit suite | `node --test tests/` | **3073 tests · 3069 pass · 0 fail · 4 skipped · 411 s** (baseline 2725/2721/0/4 — the repair round added 348 tests, none removed). Re-run at the end of this pass, after the matrix overwrote `qa/audit/report.json`: identical, still green |
| layout matrix | `node qa/layout-audit.mjs` (FULL) | **356 BLOCKERs · 106 MAJORs → FAIL** (exit 1, 1 615 s). 104 of 108 states clean; all 462 findings are one study-layer family — *a card or boss with the keyboard open*. See **The layout matrix** |
| mock clock | `node qa/s9-walk.mjs timer` | amber at 0:54 and pulse at 0:07, **both 17 px / 40 px wide** — it pulses without resizing |
| offline | `node qa/s9-walk.mjs offline` | SW active + controlling, one cache **`packet-2026-09-21a`** with **127 files**, 7 routes render offline, `errors []` |
| job walk | `node qa/job-walk.mjs` | **ALL PASS**, 59 screenshots, 25 printed probabilities checked / 0 mismatched, 8 warnings |
| S9 walk | `node qa/s9-walk.mjs` | ran to the end **after a harness repair** (it had been aborting silently — see below) |
| no `Math.random` under `site/js` | `grep -rn 'Math\.random' site/js/` | 0 call sites (10 hits, every one a comment saying there is none) |
| `site/js/job/*` is DOM-free | plain-node `import()` of all seven modules | board 22 · call 55 · crew 114 · econ 86 · guard 57 · index 39 · state 76 exports, no DOM |

### The one repair this pass made: `qa/s9-walk.mjs`

`settings.game` ships **true** (`site/js/store.js:301`), so Home's primary button is the JOB board on
every save that posts one. `qa/s9-walk.mjs` predates the layer and waited on
`.home-primary[data-kind="page"]`; it timed out after 20 s, aborted the walk at Home, **and exited 0**.
Everything from Today's Page onwards — the Summary, the Binder, the Mock, Settings, S9 #4/#7/#8/#10 —
had been unmeasured since the layer landed, with a green-looking exit code over it. Three changes:

1. `tapTodaysPage()` — take the primary when it is the Page, and take Home's own
   `a[href="#/run/page"]` ("Run a page", `screens/home.js:761`, present exactly when the primary is not
   the Page) when it is not. That is COMPOSED-GAME G10 #14's "one tap" and it measures the same Page
   the walk always measured. Used by `walk`/`page` and by `dip`.
2. The keyboard is modelled the way `qa/job-screen.mjs` models it after the round-3 finding: the
   **layout** viewport stays 375×667 and only `visualViewport` shrinks, with every "in view" test
   against `visualViewport.offsetTop + visualViewport.height`. It used to call
   `setViewportSize(375, 380)`, which shrinks the layout viewport — something no keyboard does; it
   moves the sticky chrome up with the fold and can hide nothing.
3. A walk that throws now sets `process.exitCode = 1`. A gate that cannot fail is not a gate.

---

## G9 — ADDICTIVE BUT HONEST: **9 PASS · 1 FAIL**

| # | criterion (short) | verdict | the test or measurement behind it |
|---|---|---|---|
| 1 | A large, measured, printed share of the session is decisions — and the app says which share, on which basis | **PASS**, inside the condition the criterion itself now states | `tests/job-shape-measured.test.mjs` (13 tests) + `tests/job-split.test.mjs` (37) + `tests/job-board.test.mjs` (111), all green in the 3073. Measured in the browser this session: the board's pass-2 meta line printed `JOB · ~23 min · ends 19:52 · ~26 % game · **projected**` and the job screen's own primary printed the identical `posted` (job-walk: "posted, Home → job screen — identical"). **The condition, which is not hidden:** printed vs measured agree ≤ 1.19 points same-shape (800 cells) and ≤ 4.39 within a fixed-phase column (1 192 cells), but **across columns the band is 6.35 and 21 of 1 196 `ledger` cells sit outside 5 points** — published in G1 statement 2, cause named (a five-entry log cannot price a shape it never served), not closed. The word `projected` is the app saying "on which basis", and round 3 made the line demote itself to `projected` whenever the pooled rate sits on a clamp bound. |
| 2 | No item is ever removed from the schedule by a game decision; a job answers what the composer composed | **PASS** | `tests/job-board.test.mjs` — "a target a job does not reach stays due and LEADS the next board", driven end to end over **1 162 of 1 162 boards / 400 saves × every shape**; the 4 + 14 exceptions are `LIMITS.dues` and "a hard item is never first", both composer rules (SPEC-CORRECTIONS A-5). Browser check this session: the job's queue is the Page's queue — the walk's three jobs wrote `log 3 entries · ledger.jobs 3` and left Ledger A to `card.js`. |
| 3 | Knowing the math is the only way to win | **PASS**, with the bounded exception the criterion states | `tests/job-monotone.test.mjs` (15) — "RUN 6 · JOB 10 · VAULT 7 × 8 seeds: monotone in clears, **0 exceptions**", "the value is monotone in the RUNG, not only clear-vs-miss (n ≤ 5, all 5ⁿ vectors)", plus `tests/job-exploit.test.mjs` (59) over 10⁴ random states. The exception is pinned by name, not argued away: "PINNED: clearing target 1 LOWERS the optimum from 476 to 460" **off the dealt shapes**, bounded by its own test at ≤ 1 % of flips and ≤ 5 % of the bag, with "every clear still beats a miss AT ITS OWN BEAT". |
| 4 | Every probability is printed before the decision it affects — and no recommended action is | **PASS** | `tests/job-screen.test.mjs` (90) + `tests/job-exploit.test.mjs` + `tests/job-guard.test.mjs` (147) + `tests/job-meta-constants.test.mjs` (73) grep every pre-call surface for the EV-max rung. Measured this session in a real browser: **25 printed probabilities re-computed from the shipped `guard.js` / `call.js` against the rendered text, 0 mismatched**; the guard's four bars (`RECALL 25 % · FIGURES 25 % · WORDS 25 % · ALGEBRA 25 %`) and the four call rungs both render before the stem is unsealed. |
| 5 | A min-maxer is a good student — with the identity and the measurement kept apart | **PASS** (this was an r3 BLOCKER; the doc was repaired, not the number) | `tests/job-align.test.mjs` (54) names which is which in its own titles: "ρ = 1 over ALL NINETEEN makes" / "the theorem is falsifiable: a crewValue that read m_shown would NOT score ρ = 1" (the identity) against "OFF IT — the UNFILTERED population: the two argmaxes disagree, and the suite says how often" and "THE HONEST NUMBER: the orderings agree in DIRECTION, and it is not the identity" (the measurement). G9 #5 now says "arithmetic identity, not a measurement" in those words. |
| 6 | Nothing can be farmed — **except the RANK** | **FAIL — and the spec says so in its own text** | The anti-farming weight `w = 4q̂(1−q̂)` is built from `save.cards[*].history` (`site/js/job/call.js:1065`), which `screens/card.js` writes on **every** graded original, inside a job or on Today's Page. Free study is therefore evidence the game does not price. Measured: **Called 2 on 8/8 seeds for the honest master vs Called 4 on 8/8 for the student who marks one free sitting in five wrong, +6.91 % post-climb loot, byte-identical study ledger** (`node notes/repair-meta-evidence.mjs`, 48 simulated jobs, deliberately out of `node --test`). Pinned at the mechanic in `tests/job-meta-constants.test.mjs` §8 so it cannot regress unnoticed. The close is a one-line `call.js` change (build `q̂` only from staked job targets), filed as a Request in `notes/repair-meta.md` and **not taken in this build**. Verified still open by reading the shipped code this session. |
| 7 | Quitting is free and never a strategy | **PASS** | `tests/job-save.test.mjs` (56) — seed pinned so a reload cannot re-roll the guard, the bundles or the ×2; `tests/job-exploit.test.mjs` — bag-and-continue ≥ bag-and-quit in 10⁴ states; `tests/job-board.test.mjs` — `startJob`'s page-in-progress refusal and its toll. Browser: job A was walked in one tap and ended `walk · phase debrief · jobs 1`; the 1280 job header carries the WALK control as its back button. |
| 8 | Study state is never at risk | **PASS** (the r3 forecastLog BLOCKER was answered by fixing the claim AND the test) | `tests/job-ledger.test.mjs` (13) — "every Ledger A key agrees, not only the six the proof names", "the answer sequence really did move Ledger A — the comparison is not vacuous", "the save state.js runs against THROWS on every Ledger A write", "P(losing study progress) = 0: an all-miss job at the harshest call leaves Ledger A intact", and the repaired citation "THE RUN RECORD: a job files the page record, the forecast point and the daily goal the flat page files" (+ `tests/run-lane-r2.test.mjs`, 17). Browser: after one graded target the walk read `xp 1864 · 10 skills · 42 card records`, all written by the existing grade path, with `loose 14` in Ledger B only. |
| 9 | The app tells the truth about time and the week | **PASS** | `tests/job-week.test.mjs` (108) — D = 2 drops the stakes, D = 1 posts no board, a shape that would end after 22:00 is refused before it starts, and **pass 1 returns `null` for every per-draft numeral on every week state and seed that posts a board**, with no spinner and no `aria-busy`. Browser: board on screen at **33 ms with 33 pending numerals**, pass 2 at 773 ms, `page.js`/`plan.js` arriving at 726 ms (after the board was already up), **0 spinner nodes**, shift inside the board 1→2 **ZERO**. Every primary button printed targets · posted · minutes · end time · % game. |
| 10 | It is still the study tool | **PASS** | `tests/job-ledger.test.mjs` + `tests/job-save.test.mjs`. Browser, same save, layer toggled: **board panel gone, CTA back to "RUN NEXT · 17 items", Readiness 38 → 38 unchanged**. Readiness is rendered from `js/readiness.js` and Settings prints the same formula from the same constants (`screens/settings.js:432` `FORMULA_FULL`), so Home's ring and the published formula cannot drift apart by construction. |

**G9 = 9 / 10.** The one FAIL is the one the document itself declares; nothing here is scored on a
sentence alone.

---

## S9 — WOW: **9 PASS · 1 FAIL**

Scored on the **shipped default**, which is `settings.game = true`. Where the layer changes what the
criterion is about, both paths are named. BUILD-POLICY §1 strikes the "Show original" clause of #2 and
the "Teacher's key" clause of #10; those are not scored.

| # | criterion (short) | verdict | the test or measurement behind it |
|---|---|---|---|
| 1 | Cold open to first answer ≤ 20 s; Home < 1 s, no spinner; aced placement → provisional ≥ 55, no all-19 weak strip, no plan warning | **PASS on every clause except the plan warning, which is out of its own scope today** | `qa/job-walk.mjs` cold, real browser, empty HTTP cache, SW blocked: **first answer at 15 016 ms** against a 20 000 ms budget on G1's pinned path (human 15 000 ms + machine **16 ms**); Home's board **on screen at 33 ms**; **0 spinner nodes**. `qa/s9-walk.mjs`: aced placement → **"Readiness 57 · Provisional"**, weak spots **"No weak spots yet"**, untested skills grey. **The plan warning:** today is D = 2 and Home prints *"40 new a day is more than a day holds — the target is 12"*. S9 #1's no-warning clause is specified for a D = 7 open (Appendix A, `tests/plan.test.mjs` day-1 numbers); at two days out the warning is the app telling the truth, and the honest reading is that this clause was **not** exercised today rather than that it passed. |
| 2 | The figure looks better than the scan | **PASS** | The criterion's clauses are exactly what `site/js/figure/svg.js lint()` measures — `clipped: "…"`, `label on a stroke: "…"` (a label touching a ray), `overlap: "A" × "B"`, `label on its arc`, `chip overlaps` — and two tests run it over everything at phone width: `tests/coverage.test.mjs:230` lints **every card figure** at 343 px and `tests/gen.test.mjs:158` lints **every generated item's** figure at 343 px (`tests/fix5-gen.test.mjs` adds 2 000+ seeds). Both green in the 3073. Figures are also re-measured by the full matrix's card states under the overlap / clipped-text detectors. "Show original" is struck by BUILD-POLICY §1. The game layer draws no figure of its own (job-walk #2: "the job hosts `js/figure/*` through `card.js`; no new illustration and no PNG"). |
| 3 | Notation is real notation | **PASS** | Measured this session inside a job: `#/card/not-01` rendered `mf mf-line:line AB` twice in the same session, with the arrow spanning both letters; the job's own stem carried no notation object and so reported 0, which is the honest zero, not a miss. Pinned by `tests/strip.test.mjs` / `tests/card-r1.test.mjs`. |
| 4 | A wrong answer teaches in one line | **PASS on tests; NOT re-measured in a browser this session** | `tests/card-r2.test.mjs:62` is the criterion by name — *"card r2 / multi (S9 #4): 73 in wp-01's angle box teaches 'the question asks for the angle'"* — and asserts `/That's the complement — the question asks for the angle/`. Around it: `tests/word-graders.test.mjs` (the confusable ladder, e.g. `"That's supplementary, not complementary."` and authored `msg` overrides), `tests/roots-cases.test.mjs` (missed root / wrong factoring), `tests/misconceptions.test.mjs` ("every entry is {title, fix, area} — one line, student-facing, bounded" and "every misconception tag emitted under `site/js` and `site/data` is catalogued"). All green. **Caveat:** the S9 walk's deliberate-wrong branch needs a card with a text input, and this build's Page item 2 was a `notation:build` card, so the branch did not fire — the walk answered 13/13 correctly, and no wrong answer was rendered in a browser today. |
| 5 | Multi-part problems visibly drain | **PASS** | `tests/roots-cases.test.mjs` pins the −1/2 ↔ 5.5°/174.5° pairing and "both cases required"; the pips and stage tabs are `screens/card.js`'s and the job mounts that body unchanged (job-walk #5). `ang-10` is one of the 108 audited layout states. |
| 6 | Nothing rushes thinking | **PASS**, and the "without changing size" clause was re-measured today | **0 clock/timer nodes** anywhere in the job screen; the stem stays sealed until the call is locked; nothing auto-advances — the bag/push prompt *occupies* the continue tap (job-walk #6, `tests/job-state*.test.mjs`). The Mock clock, measured this session (`node qa/s9-walk.mjs timer`): at **0:54** `data-t="amber"`, `rgb(154,82,8)`, **17 px / 40 px wide**, `animation: none`; at **0:07** `data-t="pulse"`, `rgb(196,32,61)`, **still 17 px / 40 px wide**, `animation: mock-pulse`. Same size in both states — it pulses without resizing. The 60 s / 10 s cuts themselves are pinned by `tests/mock.test.mjs:577` (*"the Mock clock turns amber for the last 60 s and pulses for the last 10 s (S5 Motion, S9 #6)"*, `AMBER_MS = 60 000`, `PULSE_MS = 10 000`). |
| 7 | The mint is the moment | **PASS**, with one honest caveat | `qa/s9-walk.mjs` Page Summary: **12 tiles minted, every one `t16-mint-flip` with `sheen: true`**. The only `position: fixed` child of `<body>` during the mint is `t11-toasts`, a **40 px** banner — the same one the 2026-09-17 scorecard listed. The job's bag drop is 600 ms, in-place, `fullScreen: false` (`data/job.js:956`). |
| 8 | The Binder is the packet | **PASS** | `qa/s9-walk.mjs`: 12 sheet tabs with live counts (`Vocab 9/55 · p.1 0/7 · … · Bonus —`), sections `TERMS (§0) / NOTATION / DEFINITIONS / FACTS / CLASSIFY` in the sheet's own numbering, `Plain cover · The cover changes at 50 % cleared`, `0 Plat · 13 Gold · 0 Silver · 0 Bronze · 151 Left`. Home's ring (65) and Settings' published formula are rendered from the same `js/readiness.js` constants (`screens/settings.js:432`). `tests/binder-r2.test.mjs`, `tests/rarity.test.mjs` green. |
| 9 | Phone-complete at 375 with the keyboard open | **FAIL — the keyboard-open clause is measured for the first time, and it is broken** | The criterion says "at 375 px with the keyboard open the input, key row and Submit are visible". Measured: the key row and Submit are; **the input is not.** `boss-b4-miss-dock-kb` → `unreachable-answer input#f-1`, *"the first answer control starts at y 292 px, at or below the dock top (63 px) — it is behind the dock"*; `card-pairs-kb` — an ordinary card, **no job in the page** — → `unreachable-answer input#wpairs-1-in`, *"starts at y 342 px, at or below the dock top (214 px)"*; both on 6 viewports × 2 themes × 2 engines, with the miss message, the hint button and the scratch toggle under the dock beside them. **72 unreachable-answer + 88 offscreen + 268 overlap findings, none of them in the game layer** — the owners are `site/js/widgets/{pairs,num,equation}.js`, `site/css/{components,widgets}.css` and `screens/card.js`'s side rail, all off-limits to this pass. Everything else in #9 passes: **0 horizontal overflow** on every walked screen (`scrollWidth 375 === 375`), **0 tap targets under 44 px** in the job, and the 375 payout beat keeps `bag 53 (fee 5 · chain 1 → 0)` and `PUSH` above the fold. |
| 10 | Honest and offline | **PASS**, re-measured on this build | `node qa/s9-walk.mjs offline`, this session: the service worker came up **active and controlling** with exactly one cache — **`packet-2026-09-21a`**, the new version string — holding **127 files**, and with the network cut `#/today`, `#/binder`, `#/card/ang-10`, `#/mock`, `#/settings`, `#/stats` and `#/run/page` all rendered their real content with **`offline errors []`**. `tests/sw.test.mjs` green and `node qa/gen-precache.mjs --check` clean. `qa/s9-walk.mjs` mid-Mock kill/resume printed **"Mock #1 · in progress · 39:55 left · 1/20 answered · back on question 2 · The clock kept running while the tab was closed"** and resumed on the true clock; Settings exported a 15 796-char save to `packet-save-2026-09-22.json`; **0 console errors** across the whole walk (only Playwright's own "Service Worker registration blocked" warning). Nothing is buyable and nothing is locked: rank gates the 95 rung and the guard multiplier — loot — and no card, boss, Mock, hint or solution (G10 #11, `tests/job-week.test.mjs`). The 22:00 soft close was not exercised at this hour; it is pinned by the night tests. |

**S9 = 9 / 10.** The FAIL is #9's keyboard clause: a study-layer defect the auditor *catches* for the
first time — the 2026-09-18 matrix had no keyboard-open card state at all, so "0 findings" then and
356 BLOCKERs now are the same product measured by a better net. It is still a defect a phone student
meets in a Boss, and it is the single most important thing on this page.

---

## The layout matrix

`node qa/layout-audit.mjs` — the FULL matrix: **108 states × 17 viewports × 2 themes × 2 engines**
(chromium + webkit) plus a text-zoom and a reduced-motion pass, 4 workers. Self-test first: **9 of 9
detectors caught their planted defect in both engines (PASS)** — the detectors have not rotted.

```
verdict: 356 blockers, 106 majors → FAIL          (exit 1, 1 615 s, qa/audit/report.json)
total 462 findings · 94 grouped defects · 130 waived
bySeverity  BLOCKER 356 · MAJOR 106
byType      overlap 268 · offscreen 88 · unreachable-answer 72 · contrast 34
```

**104 of the 108 states are clean in both engines, both themes, all 17 viewports.** Every finding
lands on **four** states, and all four are the same defect family — *a card or boss with the
on-screen keyboard open* — in the **study layer**, which this pass is forbidden to touch:

| state | worst finding | what a student meets |
|---|---|---|
| `boss-b4-miss-dock-kb` | `unreachable-answer input#f-1` (BLOCKER) — *"the first answer control starts at y 292 px, at or below the dock top (63 px) — it is behind the dock"*, 6 viewports × 2 themes × 2 engines | Boss B4, a heart just lost, keyboard up: the banner is cut — *"Heart lost. Word problems, linear: write the sentence as one equation before you solv…"* — and **both answer boxes with their `999` in them sit under the keyboard**, with the dock's key row and Submit floating above them. `qa/audit/png/boss-b4-miss-dock-kb-375x667-light-chromium.png` |
| `boss-b4-miss-setup-kb` | same, plus `overlap` on `p.w-msg > span.w-msg-text` (BLOCKER) — the miss message itself is covered by the dock | *"The setup box is empty — type the equation, or skip it and answer th…"* — the sentence that tells the student what to do is both clipped and behind the dock. |
| `card-pairs-kb` | `unreachable-answer input#wpairs-1-in` (BLOCKER) — *"starts at y 342 px, at or below the dock top (214 px)"* | `#/card/ang-wu-1`, keyboard up, **no job anywhere in the page**: the pairs widget's "Type an angle" field, its UNDO and its count line are all under the dock; the hint button and the scratch toggle go with them (`offscreen`, "still below the fold with the page scrolled to its end"). |
| `card-pairs-locked` | `contrast 4.21:1` (MAJOR) — `rgb(217,45,76)` on `srgb(0.988, 0.934, 0.944)`, needs 4.5:1 at 15 px | the pairs widget's wrong-state red on its own pink ground. |

Deduped, that is **24 distinct defect signatures** (state × detector × selector), each reported in
all four theme × engine combinations, i.e. **it is not an engine quirk and not a theme quirk**.
Owners: `site/js/widgets/{pairs,num,equation}.js`, `site/css/{components,widgets}.css`,
`site/js/screens/card.js`'s side rail. Backlog: `notes/repair-tests.md`.

**Why the last matrix said "0 findings" and this one says FAIL.** The 2026-09-18 run (build
2026-09-17e) audited **95** states and had **no keyboard-open card state at all**; this one audits
**108**. Three of the new states (`card-pairs-kb`, `card-pairs-locked`, `job-payout-kb`) were added
today as unwaived *controls* for the attributed waivers, and `boss-b4-miss-{dock,setup}-kb` came in
with the game-layer commit, after the last clean full run. Same product, better net — but the defects
are real and a phone student meets them in a Boss.

The detector self-test ran first in both engines: **9 of 9 planted defects caught, PASS** — so the
net itself is intact, which is what makes the 462 credible.

### The waiver file is not a mute button

`qa/audit-allow.json` now carries **6 entries** (2 at the last handoff). Four are ATTRIBUTED waivers
added 2026-09-22: they waive a hit **on the job state that merely hosts another layer's screen**, and
each one names a **control state outside the host that reproduces the hit and is left UNWAIVED**.
`tests/job-audit-allow.test.mjs` gates every one of them on each `node --test` run: the control must
exist, be waived by nothing, and the counts must be the ones the named command produced. That is why
the matrix now reports the pairs-widget BLOCKERs instead of swallowing them.

---

## What a student would still notice

Ordered by how early they meet it. Nothing here is a crash; several are one-line copy fixes.

1. **Type an answer on a phone and the box can be behind the keyboard (BLOCKER, study layer).**
   In Boss B4 after a heart is lost (`input#f-1`, y 292 vs dock top 63) and on the pairs card
   (`input#wpairs-1-in`, y 342 vs dock top 214), the answer field is below the lifted dock and the
   page cannot be scrolled far enough to reach it; the miss message, the Hint button and the Scratch
   toggle go under with it. 6 viewports, both themes, both engines.
   Owners: `site/js/widgets/{pairs,num,equation}.js` + `site/css/{components,widgets}.css`.
   Backlog: `notes/repair-tests.md`. PNGs in `qa/audit/png/`.
2. **The hint price is truncated on a phone.** At 375 the line reads `hints are free · this one costs
   16 of 53 l…`; at 1280 it reads `…16 of 53 loose`. The one sentence that prices a hint is the one
   that gets cut (`qa/screenshots/job-walk/chromium-375-dark-jobB-full-03-stem.png`).
3. **"Vault cracked" over "0 XP this run" for the first second.** The debrief's hero number is held
   at `0` for `bagDropMs()` = 600 ms and then counts up over 500 ms (`screens/run.js:1295,1454`),
   while the header already reads `bag 424`. It is a transient, not a stuck zero — the walk caught
   the `0` on the full job (`…-jobB-full-10-debrief.png`) and the landed `23` on the walked one
   (`…-jobA-walk-10-debrief.png`) — but it is the biggest number on the screen and it is wrong for
   ~1.1 s. The flat Page summary has no hold and reads `519 XP this run` straight away.
4. **The chain pips read as empty boxes.** `GLYPHS.chainFilled = '▮'` / `chainEmpty = '▯'`
   (`data/job.js:943`): at phone size the row renders as one filled bar and seven near-invisible
   outlines — `▮ ▯▯▯▯▯▯▯ ×1.2` (cropped and inspected this session).
5. **Two counts of the same thing on one screen.** The Page Summary says `12 tiles minted` and, a
   thumb-scroll below, `Rarity GOLD ×13`; the job debrief says `6 tiles minted` and `GOLD ×9 BRONZE ×1`.
   Both are right (minted-this-run vs cleared-this-run) and neither says so.
6. **The board's first paint is a dotted skeleton.** G7 says pass 1 carries the labels, lock counts,
   cold days, wing labels and per-wing supply from the save alone and only the *posted numerals* wait
   for pass 2. Measured: `pass 1 meta inked — nothing inked; every cell is a placeholder`, i.e.
   `····· · ······· · ·········` for **740 ms**. There is no spinner and no shift *inside* the board,
   but the first thing a student sees is punctuation.
7. **Home reflows around the board between the two passes.** CLS 0.00114 and zero shift inside the
   board, but `.home-today` moves **+50 px** down and the CTA **−24 px** up at 773 ms — the button
   under the thumb moves after it is already readable.
8. **Desktop jargon on a phone.** `← / → press · ↑ / ↓ pick a wing`, `Scratch — show your work (S)`,
   `Hints (H)` are printed at 375 px where there is no keyboard. "Hints (H) — cost XP quality, never
   an attempt" reads as a typo either way.
9. **The debrief's teaching line is for a quant.** `you bagged at chain 4; the threshold said push
   (q* 0.00, your q̂ 1.00). cost 29 bagged` and `envelope 2: you called 70, EV-max was 95. cost 3.5
   credit`. The unit relabel from the r3 finding landed (it says *credit*, not *rating*); the sentence
   is still unreadable at 14.
10. **A red negative under "Vault cracked".** The job debrief's skill bars showed `Pairs in a Figure
    21 −4` under a run headed *Vault cracked · Flawless 9 / 10*. It is correct — it is the one item
    that went to the solution — but the screen never connects the red number to that item, and the
    headline two thumbs above says the job was cracked.
11. **Board panels clip mid-row at 375.** The contracts list and the Guard bars each show ~2.5 rows
    with the `3 more ↓` pill sitting on top of the third row's `posted` figure, and ALGEBRA's bar off
    screen, on the screen whose whole promise is "every probability is printed before the decision".
12. **The trophy toast lands on the screen's own title.** On the brief at 375 the `t11-toasts` banner
    — *"🏆 Cold Recall · Trophy earned"* — sits across the header row and covers "The Job"
    (`…-jobC-callit-08-brief.png`). The walk flags the same fixed layer on the bag prompt and the
    debrief; it is 40 px, not full-screen, so S9 #7 survives, but it is the one moment the app
    celebrates and it does it on top of the heading.
13. **The crew panel is a wall of prose.** Six run-on monospace lines on the brief — *"a HELD point
    prices at 0.00 against the best STEADY point's 6.85 — the board's own prices, not the column
    below — so the study ordering leads it…"* — with the per-make rows breaking into ragged columns
    (`bare  STEADY` on one line, an orphaned `HELD` 40 px below).
14. **Dead space.** ~500 px between COMMIT and the board footer at 375, and a broken tile row in the
    job debrief's "6 tiles minted" grid.
