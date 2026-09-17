# QA ROUND 2 — integration (2026-09-17)

Visual-QA fix round 2: six fixer groups edited in parallel; this note is the integrator's pass over the
merged tree. Version bumped to `APP_VERSION = "2026-09-17c"`. Suite: **`node --test` → 1229 pass, 0 fail**
(1189 after round 1; the fixers added 40 tests, four in new files `tests/card-r2.test.mjs` (6),
`tests/page-r2.test.mjs` (9), `tests/home-r2.test.mjs` (5), `tests/binder-r2.test.mjs` (4), the rest in
`boss.test.mjs`, `card-r1.test.mjs`, `roots-cases.test.mjs`, `word-graders.test.mjs`). `qa/gen-precache.mjs` →
list up to date (116 files); `tests/sw.test.mjs` 13/13. Browser-side geometry the DOM-free suite cannot run is
pinned by `node qa/r2-home-pins.mjs chip|place|cold` (new, Playwright).

## 1. What the fixers reported (fixed / not fixed)

| group | fixed | not | tests on hand-off | where documented |
|---|---|---|---|---|
| Card + widgets | 12 | 4 | green | `polish.css` "card r2" block comments; `// card r2` comments in `card.js`, `widgets/pairs.js`, `widgets/equation.js`, `widgets/multi.js`, `grader/reject.js`, `grader/cases.js`; `tests/card-r2.test.mjs` |
| Today's Page run + Summary + BLITZ + Drill | 12 | 2 | **red** | `tests/page-r2.test.mjs` header (no note section); `polish.css` "page r2" |
| Home · Onboarding · Placement · Settings | 8 | 3 | green | `notes/T10.md` §"r2 fixes" (T14 points there); `tests/home-r2.test.mjs`; `qa/r2-home-pins.mjs` |
| Binder + Stats + Sheet + Night | 7 | 3 | green | `polish.css` "binder r2"; `tests/binder-r2.test.mjs` header (no note section) |
| Mock + Report + Boss | 11 | 3 | green | `notes/T12.md` §r2, `notes/T13.md` §r2; `polish.css` "mock r2" + addendum |
| Content audit | 4 | 1 | green | COMPOSED S10 revision 2026-09-17c (content r2); `polish.css` "content r2" |

The page group's "red" hand-off was transient: the merged tree was green on the integrator's first run with
nothing deleted or skipped. Only the Home group put its **not-fixed** items on record (T10 §r2 "Still open");
the other five groups' "not" tallies are, again, not on record — round 3's critic must re-derive them from the
screens.

### Fixes, by group (the load-bearing ones)

**Card.** The pairs verdict is mirrored right under the figure (`figNote`) so a wedge tap's result is where the
thumb is; optional setup is compact and its message row shares the line with "Skip setup"; ✓ / silver at text
grade; doc-07 wedge labels; ASN chips; `.card-skills` wraps; the dock Continue fills its row. Reject menu
dedupes by reason id and caps at six; the cases second-miss line is one line; a one-sided field swap keeps the
num diagnosis (S9 #4); a multi field label carries its wedge's expression.

**Page run.** No frozen foil sheen under reduced motion; the 60 px mint grid; BLITZ wrong-tap marks (✗ on the
pressed option, ✓ on the right one); the page progress denominator; the Summary plan line without its
"RUN NEXT ·" prefix; phone hint placement (inline hint scrolled clear of header + dock); the miss verdict
scrolls into view; the pairs helper text names an angle THIS figure has; the equation prompt without the mode
aside.

**Home.** Header chip hit box measured 48 × 46 (the r1 `::before` was clipped by base.css's
`.chip { overflow: hidden }`); `readiness()` returns `early` under 4 tested skills with band "Too early to
say" and the hero prints "N of 19 skills tested" (a 2-answer quit no longer reads "Getting there · 57"); the
CTA's redundant "holding at 12" sub-line dropped; the placement's in-run "Start from zero" (which APPLIED every
answer so far) replaced by "Skip the rest (n)" in the dock + ← to the intro; compact placement head (44 px, was
106–129); cold boot: home.js imports page.js / plan.js dynamically — first paint 26 files / 398 KB, 2.8 s on
3G-class (was 73 files / 1.32 MB / 7.7 s). **On record as still open:** the CTA path still drags
data/cards.js → templates → 17 js/gen/* → the whole grader (≈ 800 KB), and screens.css + widgets.css are
~190 KB of the first paint — a lazy template registry / cards-index and per-screen CSS are the remaining cuts
to S9 #1.

**Binder / Stats / Night.** Mini-mock silence (S7): nothing per box or per item until hand-in — no field
reason line, no strip ANSWER row, no setup split, no HP pips, no ✓ / ✗ marks (`.nb-mini` CSS + `ctx.mock` in
the strip widget and runner, `save:false / xpFactor:0`); a mini-mock with fewer than 4 of 8 scored items never
writes an accuracy and `readiness.latestMock` skips it (a 1-item sample cannot replace the 20-item Baseline);
gold / platinum tile chips at text grade (`--plat-ink`); Stats error card stacks at phone width.

**Mock / Report / Boss.** Keyboard-open phone layout (`:root[data-kb="open"]` + `max-height: 520px`): boss
head un-sticks, the dock's miss line collapses to one 44 px row; "Skip the setup" clears the blank-submit
verdict, dims the widget and writes a boss-worded hint; CONTINUE? check question asks for a VALUE from the
working (decoys from other numbers, near-misses fabricated); boss head opaque (r1's 94 % + blur smeared the
strip); HP pips on the skill line; SUBMIT dialog's "M:SS still on the clock" refreshes every tick; the
Mock's reserved verdict line hidden (a blank band under A/S/N); Report wording "this paper now counts as your
Mock score".

**Content.** ASN ⚑ note reads "⚑ Graded S (the teacher's answer). ‹disputed›." (grading clause first); on a
wrong verdict that will ask the chips, the full reason line waits for the chip verdict (it was printing the
correct chip verbatim two lines above "Which reason is the right one?"); verdict / reason / ⚑ at text grade
(`--ok-ink`, `--warn-ink`); the spent hint ladder reads "No hints left" (was "No hints leftnull").

## 2. Integrator pass (merged tree)

Shot at 375×667, light and dark, `qa/fixtures/midweek.json`: `#/today`, `#/card/ang-10`, `#/run/page`,
`#/binder`, `#/mock` (10 shots) + `#/today` ×2 and `#/card/ang-10` ×1 after the fix below. **All 13 shots:
zero console errors, zero horizontal overflow, no missing CSS.** One layout regression from the merge, fixed:

* **Home hero overran its card (both themes).** The r1 sparkline (`polish.css` "home r1": svg pinned at
  96 px + a `nowrap` caption) is 228 px wide; the hero text column at 375 is 221 px. Because the sparkline's
  min-content set the column, the whole `.hero-text` grid ran ~14 px past the card edge — the caption's
  "22 → 38" and the terms line's "40/164" both sat outside the border. Measured after the fix
  (`--eval` on `.rd-spark` / `.hero-text`): spark right 342 = column right 342, svg 72 px. The terms line
  now wraps at its " · " as home r2 intended (`text-wrap: balance`, nowrap spans).
  Fix: `home.js` `sparklineSvg` — `preserveAspectRatio="none"` (the svg shrinks sideways only), the end
  dot is a round-capped zero-length stroke (the Stats sparkline's own trick, so it never squashes into an
  ellipse); `polish.css` "integration r2" — `.rd-spark svg { flex: 1 1 96px; min-width: 48px; max-width:
  96px }`, `non-scaling-stroke` on line and baseline. No test pinned the old markup.
* Card `ang-10` scrolled to the setup slot after the `.w-msg` consolidation (below): the message line and
  "Skip setup" still share one row; the empty message is out of flow.
* Page run item 1 (review, pairs figure), Binder cover + Vocab tiles, Mock intro: unchanged from round 1 in
  both themes; the mock r2 / binder r2 / page r2 blocks did not disturb each other.

### polish.css: duplicate-rule audit

Sixteen selectors appear twice; every pair is a later round superseding an earlier one, the later rule wins by
source order, and each carries a comment saying why. Two pairs were **contradictions** (an r1 declaration the
r2 rule reverts outright) and were collapsed so one declaration is the truth:

* `.boss-screen .boss-head` — mock r1 set `background: color-mix(94 %)` + `backdrop-filter: blur(8px)`; mock r2
  sets `background: var(--bg)` + `backdrop-filter: none`. The r1 declarations are gone; a pointer comment stays.
* `.w-eq-actions .w-msg` — card r1 set `flex: 1 1 160px; margin-inline-end: auto`; home r2 sets `flex: 1 1 100%;
  margin-inline-end: 0` (+ `display:none` while empty). r1 keeps only `min-width: 0`.

Left as two blocks (refinements, not fights): `.hdr a.chip::before` inset −10 → −12 px (r2 also un-clips it);
`.nb-rep-count[data-counted]` `--ok`/`--warn` → `--ok-ink`/`--warn-ink`; `.w-dock-actions .card-continue`
(page r2 `max-width:none`, card r2 adds `flex: 1 1 100%`); `.card-inline-hint` (r1 box, r2 scroll margins);
`.nb-mini-next` (box, then scroll margin); `.card-screen` phone grid vs `.boss-screen .card-screen` (round 1's
verdict stands: different on purpose, Boss wins by specificity).

## 3. Remaining findings (for round 3)

1. **Not-fixed items are unrecorded for five of six groups** (card 4, page 2, binder 3, mock 3, content 1).
   Only Home's three are written down (T10 §r2). Round 3 should start from the screens, not the tallies.
2. **Cold boot still misses S9 #1** ("< 1 s / ≤ 2.5 s 3G"): first paint is 2.8 s 3G-class, the composed CTA
   8.1 s. The two cuts are named in T10 §r2 (lazy template registry + cards-index for `qFor`; per-screen CSS).
3. **T18 sweep still not run** (OPEN-ISSUES A1): 390×844 / 768×1024 / 1280×800 × dark and light, keyboard open
   on Card and Mock, reduced motion, measured contrast, Lighthouse. Round 2 fixed the keyboard-open Boss
   layout and several contrast tokens, but nobody has scored the checklist end to end.
4. `polish.css` is at 521 lines of append-only rounds. Two more rounds and it should be folded back into
   `screens.css` / `widgets.css` by block owner (BUILD-POLICY "append only" was written for tickets, not for an
   indefinite QA loop).
5. Hero sparkline on a 360 px phone: the svg floors at 48 px; below ~350 px the caption would push again.
   Not a 375 / 390 concern; noted so the T18 sweep checks 360.

## 4. Scores (integrator's read of the five screens, S9 bar)

| screen | light | dark | note |
|---|---|---|---|
| Home | 9 | 9 | hero now inside its card; provisional honesty landed; cold boot still over budget (S9 #1) |
| Card | 9 | 9 | figure, setup slot, dock all right; verdict-under-figure not exercised in the static shot |
| Page run | 9 | 9 | unchanged from r1 at item 1; Summary / BLITZ fixes pinned by tests, not re-shot here |
| Binder | 9 | 9 | tiles body-tinted, chips at text grade; sheet not re-opened this pass |
| Mock | 9 | 9 | intro only; in-paper fixes (dialog tick, hidden verdict line) pinned in T13 §r2 |

Overall: **9 / 10** against S9 with S9 #1 (cold boot) and the unrun T18 sweep as the two withheld points.
