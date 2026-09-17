# FIX5 — lane "run", round 1 (S9 scorecard rough edges 3 and 4)

Files touched: `site/js/screens/run.js`, `site/js/screens/card.js` (layout only: one mount-time scroll helper),
`site/css/polish.css` (appended block `/* === fix5:run r1 === */`), `tests/fix5-run.test.mjs` (new, 6 tests),
dev-only `qa/fix5-run-measure.mjs` and `qa/fix5-run-summary.mjs` (new). `node --test` → 1263 pass, 0 fail.
No change to `data/modules.js` (the readiness/home lane owns it): the family name is re-worded where the Summary
renders it.

## Bug 3 — Page answer control below the fold at 375×667

**Root cause.** Stacked chrome ate 160 px before the paper: the run head was three rows (Quit button + two-line
title block, then a full-width progress row: 72–156), the card chip row put the skill name on its own line
(172–219), the paper padded 20 px, the figure reserved up to 190 px, and the notation builder's preview box is
84 px. On item 1 the first tap target ("line") sat at 736 px with the dock at 606.

**Change.**
- `run.js runHead()`: the Quit link's arrow and label are separate spans (aria-label unchanged:
  "Quit — progress is kept"). CSS < 1024 px: the head is one row — 44×44 "←" button (label visually hidden
  ≤ 639 px), title, "0 of 13 done" — and the progress bar is a 3 px line on the head's bottom border. The
  "11 new + 2 variants" subtitle is hidden ≤ 639 px (still shown 640–1023 inline). Only a head whose right side
  is the progress count is `nowrap`; BLITZ's clock/score HUD keeps wrapping (a nowrap BLITZ head overflowed 375 —
  caught and fixed in this round, `after/after-blitz-375.png`).
- Chip row < 1024: the skill name sits beside the chips (`flex: 1 1 110px`) → 24 px row.
- `@media (max-width: 1023px) and (max-height: 760px)`: card gap 8, paper padding 12/12/12/36, stem line-height
  1.42, run-screen top padding 8, notation preview 60 px (was 84), figure capped at 150 px — **except on a pairs
  card**, whose figure is the answer surface (wedges must stay ≥ 44 px, S9 #9).
- `card.js revealAnswer()` (called right after `focusFirst()`): phones (< 1024), card mode only (never Boss/Mock/
  sandbox), after the navigation slide settles; if less than 28 px of the first answer control shows above the
  dock, scroll by the smallest clean edge (chip row or paper top under the app bar) that lifts it, capped so the
  stem's first line stays below the app bar. Instant, no focus (page r2 "no auto-focus on a phone" stands).
  Only item 6 (a pairs card with a 3-line stem + 3-line note) needs it at 375×667.

**Measured** (`node qa/fix5-run-measure.mjs [--w --h --dark --motion no-preference]`; fresh Page from
`qa/screenshots/s9/after-ace.json`, items reached via `inProgress.idx`; control = first enabled
button/input in `.card-parts`, dock top 606 at 375×667):

| 375×667 | before: control top / stem top | after: control top / stem top / scrollY |
|---|---|---|
| page 1 (notation) | 736 / 248 FAIL | 570 / 166 / 0 |
| page 2 (notation) | 685 / 248 FAIL | 522 / 166 / 0 |
| page 3 (mc) | 319 / 248 | 228 / 166 / 0 |
| page 4 (notation) | 711 / 248 FAIL | 546 / 166 / 0 |
| page 5 (notation) | 711 / 248 FAIL | 522 / 166 / 0 |
| page 6 (pairs, ang-wu-1) | 775 / 277 FAIL | 574 / 91 / 100 (auto-lift, paper top at the app bar) |
| #/card/ang-10 | 575 (setup) / 165 | 513 / 157 / 0 |
| #/card/wp-01 | 420 (setup) / 251 | 398 / 243 / 0 |
| #/card/not-04 | 585 / 148 | 493 / 137 / 0 |

(The first "before" run counted the notation preview `<output>` as the control — 628/577/603…; the table uses
the corrected selector for both.) Same with motion on and after a Home → Page navigation: identical, scrollY 0 on
item 1. 390×844: all pass with scrollY 0 (item 1 control 680, dock 783). 375×667 dark: item 1 identical.
Keyboard-open 375×380 with the field focused: wp-01 input 208–256, key row 272–320, Submit 328–372; Page item 11
(systems Variant) the same numbers — all in view.

**≥ 1024 — a pre-existing bug found while checking for regressions.** `base.css .screen { max-width: 680px }`
capped the run screen, so the card inside laid out 680 + 320 rail in 680 px: the paper got 336 px, its two-column
stem track 0 px, and the stem printed one letter per line on every Page item with a figure at 1280×800 (visible in
the scorecard's own `qa/screenshots/s9/v-laptop-light-page.png`, shot 04:03 before any fix5 work; re-seen in
`qa/screenshots/fix5-run/before/before-page-item1-1280x800-stem-crushed.png`). Fix: `.run-screen:has(> .run-stage > .card-screen) { max-width: none }` at ≥ 1024 — the run now lays
out exactly like `#/card/:id` (item 1 control 632, dock 739). The Summary and BLITZ keep 680.

## Bug 4 — Summary family tiles

**Root cause.** The caption was a 60 px box with `overflow-wrap: anywhere`, so "Quadratics, a > 1" broke before its
comma; and a family tile's rarity (S4: Bronze/Silver/Gold at 1/2/3 Gold Variants, Platinum at 6 across ≥ 2 days)
was shown with no word that it counts Variants, right under a "◆ GOLD +72 XP" card.

**Change (run.js + CSS).**
- `familyDisplayName()` renders "Quadratics, a > 1" as "Quadratics (a > 1)", the parenthetical in a `nowrap` span.
- A family tile's `<li data-fam="true">` spans two grid columns (130 px) and gets a third caption line from
  `familyProgressLine(save.variants[fam])`: "1/3 Gold ◆ → Gold", "2/3 Gold ◆ → Gold", "4/6 Gold ◆ → Platinum",
  "6 Gold ◆ · day 1 of 2", "6 Gold ◆ · 2 days" — pinned against `familyRarity` at every step.
- Under the grid, only when a family tile minted, one legend line: "◆ Family tile — it counts Gold Variants, not
  one card: " + `foilRule(famId)` (the exact sentence the Binder tooltip prints).
- The tile's aria-label is the full sentence ("Quadratics (a > 1) family tile — bronze, 1 Gold Variant so far.
  Bronze / Silver / …"); the visual caption is aria-hidden for family tiles only.
- Original captions: `overflow-wrap: break-word` (no mid-word breaks for short labels); every li `align-content:
  start` so a taller two-column row does not push its neighbour's caption down.

Checked (`node qa/fix5-run-summary.mjs [--w 390 --h 844] [--dark]`, synthetic Summary: all items cleared, families
at 1 and 2 Gold): every family caption line is exactly one line box at 375 and 390, light and dark; no overflow;
reduced motion → tiles opacity 1, transform none, sheen opacity 0 (final tiles shown). Real walk
(`node qa/s9-walk.mjs page`): Summary text "◆ ◐ Systems ◐ silver 2/3 Gold ◆ → Gold … Quadratics (a > 1) ○ bronze
1/3 Gold ◆ → Gold ◆ Family tile — it counts Gold Variants…", overflow 0, low-contrast 0.

## Evidence (all under `qa/screenshots/fix5-run/`, git-ignored)
- before: `before/p-09-page-item1.png`, `before/p-11-summary.png`, `before/p-11-summary-mid.png` (scorecard run),
  `before/repro/*` (my reproduction run, identical), `before/before-page-item{1..6}-375x667.png`,
  `before/before-card-{ang-10,wp-01,not-04}-375x667.png`, `before/before-page-item1-full.png`.
- after (walk): `after/walk/p-09-page-item1.png`, `after/walk/p-10-page-item3.png` (progress line at 2/13),
  `after/walk/p-11-summary.png`, `after/walk/p-11-summary-mid.png` (flip + sheen mid-mint), `after/walk/p-11-summary-full.png`.
- after (measure): `after/after-page-item{1..6}-375x667.png`, `…-375x667-dark.png`, `…-390x844.png`,
  `…-1280x800.png`, `after/after-card-*-{375x667,390x844,1280x800}.png`, `after/after-kb-wp01-375x380.png`,
  `after/after-kb-page-item11-375x380.png`, `after/after-nav-motion-page-item1-375x667.png`, `after/after-blitz-375.png`.
- after (summary): `after/after-summary-mint-{375x667,375x667-dark,390x844,390x844-dark}-reduced.png`.

## Spec deviations / notes
- S5 says figure ≤ 320 px on phones; on short phones (≤ 760 px tall) non-pairs figures now cap at 150 px. Labels
  stay legible at 375 (checked in the item 1–5 shots); pairs figures are untouched.
- The page subtitle ("11 new + 2 variants") is not shown ≤ 639 px; it is still in the DOM (and shown ≥ 640).
- `qa/s9-walk.mjs page` still ends in a SCRIPT ERROR in its Mock section (armCard waits for `.card-screen` inside
  the Mock) — identical in my before run; not this lane's.
- Not done: a separate audit of every non-Page run kind at 375×667 (drill/daily/missed/upgrade share the same head
  and card, so they inherit the fix; only BLITZ has a different head and was shot).

---

# FIX5 — lane "run", round 2 (critic r1: pass=false, wow 6)

Files touched: `site/js/screens/run.js`, `site/js/screens/card.js` (one threshold in `revealAnswer`),
`site/css/polish.css` (one rule in the r1 block made Page-only; new block `/* === fix5:run r2 === */` appended),
`site/data/modules.js` (**two display strings only**: family names, as the lane brief allowed),
`tests/fix5-run.test.mjs` (rewritten), QA: `qa/fix5-run-heads.mjs` (new), `qa/fix5-run-real.mjs` (copy of the
critic's `qa/crit-run-real.mjs`, output → `qa/screenshots/fix5-run/r2/`), `qa/fix5-run-measure.mjs` +
`qa/fix5-run-summary.mjs` (exit codes, `--set A|B`, fixtures), fixtures `qa/fixtures/fix5-run-{after-ace,upgrade,ladder}.json`
(copies of the git-ignored walk/critic states, so the geometry checks work from a clean checkout).
`node --test` → 1272 tests, 1268 pass, 0 fail, 4 skipped (the opt-in browser tests below).

## Major — phones hid every run's subtitle (regression from r1)
**Root cause.** r1's `@media (max-width: 639px) { .run-sub { display: none } }` hit every `runHead()` user, so
Upgrade lost "N Bronze/Silver originals — hints off, first try only.", Drill "Unlimited — these pay full XP",
Daily "+20 XP for finishing", BLITZ "wrong = −3 s · 3 strikes".
**Change.** `runHead({ …, kind })` stamps `data-kind` on `.run-head` (all 4 call sites pass it). The hide rule is now
`.run-head[data-kind="page"] .run-sub` (Page only; its "11 new + 2 variants" is not a rule). Below 1024 every other
kind with a subtitle wraps: `.run-titles { display: contents }`, the subtitle `order: 3; flex: 1 1 100%;
white-space: normal` → its own full-width muted line under the one-row head (head 64–133 at 375). BLITZ: title
`flex: 1 1 auto; white-space: normal` and HUD `order: 4`, so the row reads ← "BLITZ · Vocabulary & Notation" /
rule line / clock-score row (my first r2 attempt ellipsised it to "BLITZ · Vocabu…" — caught in the shot, fixed).
**Measured** (`node qa/fix5-run-heads.mjs [--w --h --dark]`, exit 1 on failure): 375×667, 360×640 dark, 768×1024 —
all PASS: Upgrade/Drill/Daily/BLITZ subtitle visible at 110–128, untruncated; Page subtitle hidden < 640 (shown
inline ≥ 640); Quit 44×44; no overflow, no console errors. Shots: `qa/screenshots/fix5-run/r2/{upgrade,daily,drill,blitz}-375.png`,
`qa/screenshots/fix5-run/r2/heads/*`.

## Minor — item 1's builder buttons only peeked above the dock
**Change.** Short phones (≤ 760 px tall, < 1024 wide): notation preview 44 px (was 60) with 4 px margin, figure
margin-top 6 px — item 1's whole first button row now fits with **no scroll**. `revealAnswer()` threshold raised from
28 px to the control's full height capped at 52 px (`Math.min(r.height, 52)`), so where it does not fit (shorter
viewports) the lift shows the whole row, still capped by the stem's first line.
**Measured** (`qa/fix5-run-measure.mjs`, control top–bottom / dock top / scrollY):

| viewport | item 1 | item 2 | item 3 | item 4 | item 5 | item 6 (pairs) |
|---|---|---|---|---|---|---|
| 375×667 r1 (critic, real flow) | 570–621 / 606 (36 of 51 px) | 522 | 228 | 546 | 522 | 574 / 100 |
| **375×667 r2** | **546–597 / 606 / 0** | 498–549 / 0 | 228–320 / 0 | 522–573 / 0 | 498–549 / 0 | 554–602 / 116 (stem 75, app bar 56) |
| 390×844 | 680–731 / 783 / 0 | 629 / 0 | 254 / 0 | 655 / 0 | 629 / 0 | 697–745 / 0 |
| 1280×800 | 632–682 / 739 / 0 | 632 | 337 | 632 | 632 | 723–771 (rail layout unchanged) |
| 360×640 | 485–536 / 579 / 61 | 498 / 0 | 228 / 0 | 522 / 0 | 522 / 0 | 534–582 / 126 |
| 667×375 landscape | 213–263 / 314 / 61 (critic r1: 282, 32 px showing) | 213 | 170 | 235 | 213 | 201–249 |

Cards at 375×667: `ang-10` 509–557, `wp-01` 398–446, `not-04` 469–520, all scrollY 0. 375×667 dark identical.
Real Home → Page flow with motion (`node qa/fix5-run-real.mjs x 375 667`): items 1–5 scrollY 0 (item 1 546–597),
pairs items auto-lift; all 13 items control + stem OK. Keyboard open 375×380 (`--kb`, wp-01 and Page item 13 roots
input): input 208–256, key row 272–320, Submit 328–372 — all in view (S9 #9 holds).
Known, outside the required viewport: 375×553 item 6 (pairs) — the list/type input stays below the dock; the
figure wedges (tap two angles = the answer surface) are on screen (`r2/measure/r2-page-item6-375x553.png`); the
critic saw the same in r1.

## Minor — ladder line wrapped to 2 lines when a family minted Gold
**Change.** `familyProgressLine()` rewritten; every output is ≤ 19 characters and the span is `white-space: nowrap`.

## Minor — Summary and Binder disagreed (1/3 vs 1/6; "Quadratics (a > 1)" vs "Quadratics, a > 1")
**Change.** One name, one fraction.
- `data/modules.js`: `fam-quad-a1/a2` are now named "Quadratics (a = 1)" / "Quadratics (a > 1)" — Binder title,
  aria and list row, the Summary, and anything else reading `familyById[].name` all agree; `familyDisplayName()` is
  now a no-op on data names (kept for old comma labels).
- Ladder line uses the Binder popover's fraction (`have / 6`, capped at 6, `binder.js tileInfo`) plus the next rung:
  "0/6 ◆ → Bronze at 1", "1/6 ◆ → Silver at 2", "2/6 ◆ → Gold at 3", "3/6 ◆ → Platinum" … "5/6 ◆ → Platinum",
  "6/6 ◆ · 1 of 2 days" (Gold, day rule missing), "6/6 ◆ · 2 of 2 days" (Platinum) — the Binder prints
  "6 / 6 Gold Variants · 1 of 2 days". Tile aria-label: "… — gold, 3 of 6 Gold Variants, 1 of 2 days. <rule>".
  The legend still prints `foilRule('fam-*')` verbatim.
**Measured** (`node qa/fix5-run-summary.mjs --set A|B [--w 390 --h 844] [--dark]`; set A = 1/2/3/4 Gold Variants,
set B = 5, 6 on 1 day, 6 on 2 days, 9 on 2 days; all four family tiles mint): every family caption line = 1 line
box inside the 130 px caption (widest 126 px: "1/6 ◆ → Silver at 2", "6/6 ◆ · 2 of 2 days"), no caption line of
any tile starts with punctuation, reduced motion → opacity 1 / transform none — PASS at 375×667 and 390×844, light
and dark (8 runs). Critic's scenario (`STATE=qa/fixtures/fix5-run-ladder.json MOTION=reduce node qa/fix5-run-real.mjs x 375 667`,
real Page walk): Systems "● gold / 3/6 ◆ → Platinum", Quadratics (a > 1) "★ platinum / 6/6 ◆ · 2 of 2 days", each
13 px (one line). Binder (state-ladder, Algebra tab): tiles aria "Quadratics (a > 1) — Gold", no comma.
Shots: `r2/r2-summary-mint-set{A,B}-{375x667,390x844}{,-dark}-reduced.png`, `r2/ladder/summary-375x667-reduce.png`.

## Minor — tests were regex-on-source
`tests/fix5-run.test.mjs` rewritten. Unit tests kept/extended: family names comma-free in data and unchanged by
`familyDisplayName`; `familyProgressLine` exact strings at every step AND the named next rung is the rung
`familyRarity` reaches, for n = 0…9 × 1–2 days, ≤ 19 chars; legend = `foilRule`; every `runHead` call passes `kind`.
All CSS/JS source-string pins removed. Geometry now runs in a real browser as **opt-in** tests
(`FIX5_RUN_BROWSER=1 node --test tests/fix5-run.test.mjs`, ~55 s, 8/8 pass): measure 375×667 / 390×844 / 1280×800
(exit 1 unless control top above dock and stem line visible), keyboard-open 375×380, run heads 375 + 360 dark,
Summary sets A/B at 375 light + 390 dark. **For HANDOFF (integrator):** mention that opt-in command.

## Walk re-run
`node qa/s9-walk.mjs page`: `p-09-page-item1.png` — one-row head, chips, stem, figure, the full "line / segment /
ray / length" row above the dock; `p-11-summary.png` — "Systems ◐ silver 2/6 ◆ → Gold at 3", "Quadratics (a > 1)
○ bronze 1/6 ◆ → Silver at 2", legend; `p-11-summary-mid.png` — flip + sheen mid-mint, captions final. Overflow 0,
low-contrast 0. The walk still ends in the pre-existing Mock `armCard` SCRIPT ERROR (not this lane).

## Spec deviations (r2)
- On viewports ≤ 760 px tall the notation preview is 44 px (S5 widget spec 84) — the "??" / built symbol still
  centres in it at fs-5.
- Non-Page run heads on phones are two lines (row + rule line), ~20 px taller than r1; the answer-above-dock
  invariant is only required for the Page and the three cards, which are unaffected.
- `data/modules.js` family names changed (readiness/home lane file; display strings only, allowed by the brief).
  SW cache: `site/version.js` not bumped by this lane.
