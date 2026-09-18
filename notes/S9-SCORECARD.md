# S9 SCORECARD — final check (2026-09-17, build 2026-09-17c)

Scored by a reviewer who built none of it, against COMPOSED S9 as amended (S10 2026-09-17b: #1 "≥ 55";
BUILD-POLICY §1: no "Show original" / "Teacher's key" — those clauses of #2 and #10 are struck, not scored).
Method: `qa/s9-walk.mjs` (Playwright, serves `site/` like `qa/shot.mjs`; new, dev-only) walked a FRESH visit →
onboarding (3 steps) → placement aced 8/8 → Home → Today's Page (13 items, all first-try) → Summary → Binder →
Mock (start, answer item 1, Next, reload, resume, amber/pulse) → Settings export, at 375×667 light; the same save
was then re-shot at 375×667 dark, 390×844, 768×1024 and 1280×800 light+dark (`shots` mode), offline (`offline`
mode), and probed for horizontal overflow, tap targets < 44 px and text contrast < 4.5:1 on every shot.
Single-card checks used `qa/shot.mjs`. Suite: **`node --test` → 1229 pass, 0 fail, 40 s.** Header-chip and
cold-boot pins: `node qa/r2-home-pins.mjs chip` all hold; `cold` fails its own two budgets (see #1).

Evidence lives in `qa/screenshots/s9/` (git-ignored, 80+ PNGs + the state fixtures `after-ace.json`,
`after-page.json`, `midmock.json` + the driver logs `*.out`). Paths below are relative to that folder.

## The ten criteria

| # | criterion | verdict | evidence |
|---|---|---|---|
| 1 | Cold open ≤ 20 s; Home < 1 s, no spinner; primary button says what to do; first card answerable; aced placement → provisional ≥ 55, no all-19 weak strip, no plan warning | **PASS** (with a budget caveat) | Fresh visit: Home painted with CTA **"Warm-up"** in 32 ms (`p-01-fresh.png`); step 2 sandbox is a live wp card with a labelled `angle =` box (`p-03-onboard2-sandbox.png`); placement item 1 is a "Build the symbol" tap widget (`p-05-place-item1.png`). Aced 8/8: summary **"Readiness 57 · Provisional — over the 8 of 19 skills tested"** (`p-07-place-summary.png`); Home **57 · Getting there · provisional · 8 of 19 · mastery 80 % of 8 tested**, weak spots "No weak spots yet", plan strip "11 new cards a day gets the packet cleared with a day to spare", CTA "RUN NEXT · 13 items" (`p-08-home.png`, `p-08-home-full.png`). Caveat: `r2-home-pins cold` — 3G-class paint 2.8 s (budget 2.5), Wi-Fi *returning-visit* CTA 1.08 s (< 1 s) — the fresh visit is instant, the composed CTA is not; open in T10 §r2. |
| 2 | Figure better than the scan: crisp at any DPR, labels never touch a ray, nested arcs never overlap, "Not to scale" on expression figures | **PASS** | `c-figures.png` (T04 page, all 11 figures at 1280, DPR 2: lint clean, no overlaps); `c-ang10.png` / `v-phone-dark-ang10.png` / `v-laptop-light-ang10.png` (F1A at 375 + 1280, light + dark: right-angle mark, nested arc, `−x + 84` and `2x² − 4x + 3` clear of every ray, **Not to scale** chip). "Show original" is struck by BUILD-POLICY §1. |
| 3 | Real notation in stems, hints, solutions and the student's own built answer | **PASS** | Stem: `<span class="mf mf-line" aria-label="line EC">EC</span>` renders the two-headed arrow over both letters at 375 and 1280 (`c-ang10.png`, `v-laptop-light-ang10.png`). Built answer: tapping ray · F · B on not-04 renders `<span class="mf mf-ray" aria-label="ray FB">FB</span>` in the build box and grades GOLD (`c-not04-built.png`). Placement item 8's strip and the Summary rows carry the same `mf` markup (`p-11-summary-full.png`). |
| 4 | A wrong answer teaches in one line; no generic "Incorrect" | **PASS** | wp-01, typed **73** in `angle =` → **"✗ Angle: That's the complement — the question asks for the angle."** (`c-wp01-73.png`). A wrong pairs pick on ang-wu-2 → "26 + 154 = 180 — that's supplementary (a linear pair), not complementary" (`p-stuck-page-7.png`, from an earlier driver run). Missed-root / wrong-factoring lines pinned by `roots-cases.test.mjs`, `word-graders.test.mjs`, `card-r2.test.mjs` — not re-typed here. |
| 5 | Multi-part problems visibly drain; roots → keep/reject → cases progressive on one card | **PASS** | ang-10: **`○○○○ 0/4`** pips ("0 of 4 parts cleared") and the **1 Solve · 2 Keep or reject · 3 Cases** stage tabs on one card (`c-ang10.png`, `v-laptop-light-ang10.png`). The −1/2 ↔ 5.5°/174.5° pairing and "both cases required" are pinned by `roots-cases.test.mjs`. |
| 6 | Nothing rushes thinking: no clock on Card/Boss, par after clear, Mock amber at 60 s, pulse at 10 s without resizing, nothing auto-advances | **PASS** | No `[class*=clock]`/`[class*=timer]` inside any card (`c-ang10.png` eval); par appears only in the result strip after the clear ("0:00 · par 0:45", `p-05b-place-item1-correct.png`). Mock clock: `data-t="amber"`, colour `rgb(184,101,10)`, **17 px / 40 px wide** at 0:54; `data-t="pulse"`, animation `mock-pulse`, **still 17 px / 40 px** at 0:07 (`p-15c-mock-amber.png`, `p-15c-mock-pulse.png`). All 21 walked cards needed a Continue tap. |
| 7 | The mint is the moment: tiles flip in with one foil sheen on the Summary; per-card feedback ≤ 240 ms; no other full-screen effect | **PASS** | `p-11-summary-mid.png` (300 ms in: tiles mid-flip, sheen sweeping tile by tile), `p-11-summary.png` (13 tiles landed). No `position: fixed` element on `body` at the Summary (probe `fullscreen: []`). Feedback: ok-tint 180 ms, tick 240 ms, fig-draw 150 ms (`css/motion.css`). Note: the "Flawless Page · Trophy earned" toast fires at the same instant over the title — a banner, not a full-screen effect. |
| 8 | The Binder is the packet: originals under sheet tabs in sheet order with the teacher's numbering; tinted tiles; cover at 50 / 100 / Platinum; Home Readiness = Settings formula | **PASS** | 12 sheet tabs with counts (Vocab 6/55 · p.1 5/7 · … · Bonus —), sections TERMS (§0) / NOTATION / DEFINITIONS / FACTS / CLASSIFY with the sheet's numbers, gold-tinted bodies + 4 px foot, "Plain cover · The cover changes at 50 % cleared", rarity chips (`p-12-binder.png`, `v-phone-dark-binder.png`, `v-laptop-light-binder.png`). Settings "READINESS IS COMPUTED" prints **58 · Getting there · provisional · over 10 of 19 skills tested** and the provisional formula `R = round(100 × (0.5·M + 0.2·C) / 0.7)` — Home ring reads 58 (`p-16-settings-full.png`, `v-laptop-light-home.png`). |
| 9 | Phone-complete at 375 with the keyboard open: input, key row and Submit visible; negatives and fractions typeable; wedges ≥ 44 px, side list fallback; no horizontal scroll anywhere | **PASS** (marginal on wedge height) | 375×380 (keyboard-open height) with `angle =` focused: input 198–246, key row **− / ( ) °** 274–318, Submit 328–372 — all in view (`c-wp01-keyboard.png`). Zero horizontal overflow on all 40 multi-viewport shots + 16 walk shots. Wedge hit boxes measure **96×42** (CFD/AFE at 375) and 82×44 at 390 — 2 px under the letter of "≥ 44" on two wedges at 375; the "Every angle in the figure (8)" side list and the typed `∠CFD` field are both live fallbacks (`p-stuck-page-7.png`). |
| 10 | Honest and offline: airplane mode after one load works everywhere; a killed tab mid-Mock resumes with the true time; ⚑ on disagreements; nothing buyable or locked; after 22:00 says stop without locking | **PASS** | SW cached 116 files on first load; offline `#/today`, `#/binder`, `#/card/ang-10`, `#/mock`, `#/settings`, `#/stats`, `#/run/page` all render with 0 errors (`o-*.png`, `offline.out`). Mock: reload 24 s in → **"Mock #1 · in progress · 39:36 left · 1/20 answered · back on question 2 · The clock kept running while the tab was closed"**, Resume lands on 2/20 at 39:34 (`p-15-mock-resume.png`, `p-15b-mock-resumed.png`). ⚑ text on qz-04/ASN per QA-ROUND-2 content audit. Night screen: "Thirty minutes, then stop … Start / Skip to the sweep / Straight to the mini-mock" — every door open (`c-night.png`). The 22:00 soft close itself was not exercised at this hour (pinned by `night` tests). "Teacher's key not cached" is struck by BUILD-POLICY §1. |

**Sweep results (all shots):** console errors 0 (only Playwright's "Service Worker registration blocked" warning);
horizontal overflow 0/56; measured text contrast < 4.5:1: **0** across 7 routes × light/dark
(`contrast.out`); tap targets < 44 px: header `T−N` chip (41×24 visual, **48×46 hit** — pinned OK), the Home
"Mock #1 · 20 items · 40 min" text link (167×32), the five Stats tab chips (32 px tall), two figure wedges (42 px
tall at 375). Reduced-motion Summary not re-shot (page-r2 pins the no-frozen-sheen rule).

**S9: 10 / 10 pass**, two of them with caveats (#1 budgets, #9 wedge height) that are listed below rather than
hidden. Overall wow: **8 / 10** — the product is complete, honest and quick; the remaining edges are the ones a
student meets in the first ten minutes.

## What a student will notice first (≤ 5 rough edges) — all five fixed in v2026-09-17d

1. **"I got it right and my number went down."** Every clean answer on a *new* skill drops the provisional
   Readiness/mastery and can list the skill as weak: after four first-try page items from the aced Home,
   the hero reads "mastery 73 % of 9 tested" (was 80 %) and **"Weak spots · Vocabulary 7 · Drill 5"** after one
   correct vocab answer (`p-17-home-midpage-dip.png`, `dip` mode); an earlier driver run that quit at 7/13 items
   showed the ring at **47** (`p-13-mock-rules.png`, first run) before the full page brought it to 58. It is the
   published `m_shown = m × min(1, n/5)` rule doing its job, but the words "weak" and the falling number read as
   a verdict on answers that were right. Fix idea: a skill with `n < 3` and no wrong answer says "just started"
   (grey), not "weak"; or show the ring's delta as "+ still testing".
   **FIXED (fix5 home r1–r3 + integrator, v2026-09-17d).** A clean first-try answer never lowers the provisional
   Readiness or the mastery %, and a skill with no wrong or hinted answer is grey "Just started", never weak. Dip run:
   57 / 80 % → **61 / 84 %** after four clean Page items (`qa/screenshots/s9/p-17-home-midpage-dip.png`). The critic r3
   blocker (a wrong *optional* setup, then a GOLD clear: 57 → 50 plus "Weak spots · Diagram Algebra 7") was fixed at merge.
   `readiness.saveEvidence` ignores errors[] rows from the setup slot, so it now reads **58**, with FIG-ALG shown as "just
   started" (`qa/screenshots/fix5-integrate/setupwrong-home.png`). The same merge found that Home's housekeeping and
   an answer's `decayAll` kept separate decay ledgers, so idle days were charged twice (80 → 74 → 68). That is
   fixed: one ledger, and owed decay is charged at boot before any screen mounts. A tab reopened straight onto
   #/run/page after 5 idle days shows 53 and then 55 after a clean item, with no drop inside the answer
   (`fix5-integrate/idle-direct-after1.png`). Tests: `tests/fix5-home.test.mjs`, `tests/fix5-integrate.test.mjs`.
2. **Placement item 1 says "Points Z, N, K and X are labelled in the figure" and there is no figure**
   (`p-05-place-item1.png`) — `T-notation` emits `figure: null` (OPEN-ISSUES C). The very first problem in the
   app contradicts itself. Either draw the small fan figure or reword the generated stem when there is none.
   **FIXED (fix5 gen r1).** T-notation v2 draws a small figure from the item's own letters, gated by validate/lint.
   Items that need no picture (`read`, one-letter plane) no longer mention a figure. Evidence:
   `qa/screenshots/s9/p-05-place-item1.png` and `qa/screenshots/fix5-gen/integrate-place-item1-light.png`. The
   integrator also stopped the phone answer-lift from parking the card's chip row half under the sticky
   Placement head, which is what the walk shot showed. Tests: `tests/fix5-gen.test.mjs` (2000+ seeds).
3. **On a phone, the Page's answer box starts below the fold.** Three stacked headers (app bar · "← Quit /
   Today's Page / 0 of 13 done" · card chips) plus the paper push "Build the symbol…" under the dock on item 1
   at 375×667 (`p-09-page-item1.png`). The figure is visible; the thing to tap is not.
   **FIXED (fix5 run r1–r2).** The run head is now one 44 px row, the chips sit beside the skill name, and short
   phones get tighter paper. The item-1 builder row sits above the dock (`qa/screenshots/s9/p-09-page-item1.png`;
   measured table in `notes/FIX5-run.md`). Integrator follow-up: the 150 px figure cap now applies only to
   notation-builder cards. ang-10's algebra labels had shrunk to ≈ 7.5 px and are back to 13 px, with the setup
   field still above the dock at 548 px (`qa/screenshots/fix5-integrate/card-ang10-375-light.png`).
4. **The Summary's family tiles say bronze/silver while the card just said GOLD**, and the label
   "Quadratics, a > 1" wraps to "Quadratics / , a > 1" with an orphaned comma (`p-11-summary.png`). The family
   ladder is per spec (Foil rule), but the tile under a "◆ GOLD +72 XP" result reading "bronze" needs one word
   of explanation ("family tile · 1 of 6 Gold").
   **FIXED (fix5 run r1–r2).** Family tiles span two columns. They name the family ("Quadratics (a = 1)") and show
   the ladder line "2/6 ◆ → Gold at 3", and a one-line legend explains that family tiles count Gold Variants. No
   orphaned comma (`qa/screenshots/s9/p-11-summary.png`). Tests: `tests/fix5-run.test.mjs`.
5. **Home shows the Mock twice** once the CTA becomes "Mock #1": the big button *and* the underlined
   "Mock #1 · 20 items · 40 min" link right under the plan strip (`v-laptop-light-home.png`,
   `v-phone-dark-home.png`); the link is also a 32 px tap target. Smaller kin: the placement summary's module
   names ("Factor Forge", "ASN Arena", "Lexicon") are the only lore words left in the app (Appendix A says none).
   **FIXED (fix5 home r1–r3).** When the CTA is the Mock, Home has exactly one Mock entry (the 56 px button). In
   other states the plan link is a 44 px target (`qa/screenshots/fix5-home/r3/mockcta-light-full.png`; in
   `s9/p-08-home.png` the CTA is RUN NEXT, so the link stays). Module names contain no lore
   (`qa/screenshots/s9/p-07-place-summary.png`), and M6 is now "Diagram Algebra" to match the skill name.

## Sixth rough edge, found by the student on the live site — fixed in v2026-09-17e

6. **"the question is going vertical and is hard to read."** Safari, ~1900×1200, `#/onboard?step=3`,
   PLACEMENT item 1: the question printed **one letter per line**, with the run header, the card chips and the
   Scratch heading piled on each other. It is the one defect this scorecard's method could not have caught —
   the S9 walk ran at 375×667 and re-shot at 1280×800, and the bug needed a card hosted at **680 px inside a
   ≥ 1024 px viewport**, which only onboarding's placement does.
   **FIXED (LAYOUT-ROOT, then TRIAGE + six B-lanes, closed out by FINAL).** Root cause: every responsive rule
   was keyed to the viewport while the card engine is mounted in seven hosts of unrelated width, and every text
   track had a 0 px floor; the app had **no container queries at all**. Now the card reads its own host
   (`.card-host` + six more containers) and no column that holds words may collapse. The placement's stem
   measures **314 px = 30.6 ch on 3 lines**, identical at 1280×800, 1900×1200 and 2560×1440 in webkit
   (`qa/screenshots/final/place-item1-*.png`, read by eye). Full write-ups: `notes/LAYOUT-ROOT.md` (cause +
   conventions), `notes/AUDIT.md` (the new auditor), `notes/LAYOUT-PERFECT.md` (the final gate).

**New gate, because this scorecard's method missed #6.** `npm run audit` measures **95 screen states × 17
viewports × light/dark × chromium + webkit**, plus a text-zoom and an animations pass — ≈ **7 220 screens** —
and fails on a blocker or major. Final run: **0 findings, 0 waived**, and 0 again with the allow-list emptied.
Its 11 detectors are calibrated against nine deliberately planted defects (`qa/audit/selftest.html`) and a
clean control that must stay silent; CI runs that self-test with a real browser and blocks the deploy if it
rots. `node --test`: **1350 tests, 1346 pass, 0 fail, 4 skipped**.

Two S9 caveats above are also now closed by measurement rather than argument: **#9's wedge height** (the 42 px
wedges) was fixed by lane B3 to the 44 px rule, and **the tap-target waiver on the header T−N chip** that
`notes/AUDIT-TRIAGE.md` left open is dormant — the chip passes on its own (`notes/LAYOUT-PERFECT.md` §5).

## Not scored / left to the next pass

* `node qa/r2-home-pins.mjs cold` still fails its own budgets (3G paint 2.8 s vs 2.5; returning-visit CTA
  1.08 s vs 1 s) — the two cuts are named in T10 §r2.
* Lighthouse mobile ≥ 95/95 (T18 checklist) was not run.
* Sound (B6) still unheard — quiet hours.
* The driver forces the correct raw through the widget's `raw()` (in-memory patch of `js/widgets/index.js`
  served by `qa/s9-walk.mjs`, nothing on disk), so a forced item's widget does not repaint its own display
  (the "??" build box in `p-05b-place-item1-correct.png` is the driver, not the app — `c-not04-built.png` is the
  real tap path). Every grade, XP, tile and save write is the app's own.
