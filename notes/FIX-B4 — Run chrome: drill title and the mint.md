# FIX:B4 — Run chrome: drill title and the mint (round 1)

Two findings on the run screen's own chrome. Both were reproduced by measurement before anything was
touched, both were root-caused, and both are fixed in CSS only — `site/js/screens/run.js` needed no
change and was not modified.

**Owned files:** `site/js/screens/run.js` (unchanged) · `site/css/polish.css`, block
`/* === fix:B4 — Run chrome: drill title and the mint r1 === */` (appended at the end of the file).

**Verification command**

```
cd /Users/oliver/Projects/unit1a-quest && node qa/layout-audit.mjs \
  --only run-drill-cs-lin,run-page-summary --engine both --no-selftest
```

| | before | after |
|---|---|---|
| `--only run-drill-cs-lin,run-page-summary --engine both` | **20 blockers, 80 majors → FAIL** | **0 findings → PASS** |
| `node --test` | 1304 tests / 1300 pass / 0 fail / 4 skipped | unchanged: 1304 / 1300 / 0 / 4 |

---

## Finding #4 — `run-drill-cs-lin`, BLOCKER, clipped-text

`div.run-head-slot > header.run-head > div.run-titles > h1.run-title.fs-4` —
`scrollWidth 241 > clientWidth 142`, "Drill 5 · Word Pr…". At 320×568, 360×740, 375×667, 390×844 and
414×896, in **chromium and webkit**, in **both themes**.

### Root cause

`fix5:run r1` built the one-slim-row phone head (`@media (max-width: 1023px)`, polish.css L531-543)
by giving the `h1`

```css
.run-titles { flex: 1 1 auto; min-width: 0; … }
.run-title  { flex: 0 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
```

and `r2` then gave it `flex: 1 1 0` on any run that has a subtitle. That is **a text track with a
zero floor** — the heading's width is defined as "whatever the 44 px Quit button and the `0 of 5 done`
counter leave over" — which is exactly the defect `notes/LAYOUT-ROOT.md` §2(b) found in the card's
grid, one level down in flex instead of grid. The leftover is 142 px at a 320 px viewport; every run
whose title carries a skill / module / sheet name is longer than that:

| run | title | needs |
|---|---|---|
| `#/run/drill/<skill>` | `Drill 5 · Word Problems: Linear` | 241 px |
| `#/run/jump/<module>` | `JUMP HERE · <module name>` | similar |
| `#/run/blitz/<module>` | `BLITZ · <module name>` | similar |
| `#/run/upgrade?sheet=…` | `Upgrade · <sheet name>` | similar |

So this was never one screen's bug: it is every run whose title is composed at runtime.

### The fix, and why it is not a breakpoint

A heading is not a data cell — an ellipsis is never the right answer for the name of the thing you
are looking at. The ellipsis is therefore removed at **every** width and the `h1` wraps inside the
width it is given, with `min(100%, 12ch)` as the floor the convention asks for (`min(100%, …)` can
never be wider than the head, so a floor can never cause overflow — LAYOUT-ROOT §3). No `@container`
threshold is needed because the rule is correct at every host width; the app already did exactly this
for one run (`.run-head[data-kind="blitz"] .run-title { white-space: normal }`), so this only
generalises the treatment BLITZ already had to every run.

```css
.run-head .run-title {
  white-space: normal; overflow: visible; text-overflow: clip;
  overflow-wrap: break-word; min-width: min(100%, 12ch);
}
```

### Measured, `#/run/drill/CS-LIN`, chromium (webkit identical to the pixel)

| viewport | `.run-screen` | title box | lines | clipped? | **head height** |
|---|---|---|---|---|---|
| 320 | 288 | 141.9 → 141.9 | 1 → **2** | **yes → no** | 86.1 → **86.1** |
| 360 | 328 | 181.9 → 181.9 | 1 → 2 | **yes → no** | 68.5 → **68.5** |
| 375 | 343 | 196.9 → 196.9 | 1 → 2 | **yes → no** | 68.5 → **68.5** |
| 414 | 382 | 235.9 → 235.9 | 1 → 2 | **yes → no** | 68.5 → **68.5** |
| 430 | 398 | 251.9 | 1 | no | 68.5 → 68.5 |
| 768 / 834 | 680 | 481.1 | 1 | no | 68.5 → 68.5 |
| 1024 / 1280 / 1440 / 1900 | 992 / 1024 | 885.2 / 917.2 | 1 | no | 84 → 84 |

**The head does not grow.** Its row height is set by the 44 px Quit button, and a two-line `fs-3`
title is 39.1 px — so the full name is readable at 320 px at zero layout cost. (A bigger floor was
tried and rejected: `min(100%, 16ch)` pushes "0 of 5 done" onto its own row at 320/360 and takes the
head from 86.1 → 106.9 px, which is a regression against fix5:run r1's one-slim-row goal for no
legibility gain. 12ch matches the name floors the app already uses — `.weak-row`, `.st-skills li`.)

---

## Finding #10 — `run-page-summary`, MAJOR, clipped-text

`div.sum-mint > ul.sum-tiles > li > span.tile.sum-tile` — `overflow x: 128 > 58`, at 1900×1200 in the
animations-enabled pass, both engines, both themes.

### Root cause — and the triage guess was wrong

Triage read this as "a tile mid-flip during the mint animation … the static pass at the same size is
clean". The static pass is clean for a different reason, and the defect is **permanent**, not
transient. Measured on the live Summary (`qa/fixtures/audit/page-done.json`, 6 minted tiles):

```
t+0.6s  over-scrolling tiles: 1   #0 sw93/cw58   sheen translateX  35.1px
t+1.2s  over-scrolling tiles: 6   #0 sw128/cw58  sheen translateX  69.6px
t+2.6s  over-scrolling tiles: 6   #0 sw128/cw58  sheen translateX  69.6px   ← parked, and stays there
```

`.tile-sheen` (screens.css) is `position: absolute; inset: 0` inside `.tile { overflow: hidden }` and
sweeps with `@keyframes t11-sheen { translateX(-120% → 120%) }`. **A transformed absolutely-positioned
child contributes scrollable overflow to its `overflow: hidden` ancestor**, so during the sweep every
tile becomes a 128 px-wide scroll container — and `motion.css` gives the mint
`animation-fill-mode: both`, which parks the sheen at +69.6 px, so the overflow never goes away. Six
needless scroll boxes on the Summary, each of which can carry the tile's own number out of view if
anything ever scrolls one. The reduced-motion pass is clean only because motion.css's reduce block
sets `.sum-tile .tile-sheen { animation: none; opacity: 0 }` — no transform, no overflow.

The same markup is used by the Binder's foil tiles (`binder.js` L355), so the defect was app-wide.

### The fix

Keep the box that fills the tile still, and move the sweeping transform onto a pseudo-element inside
it, with the sheen itself as the clipper:

```css
.tile-sheen { overflow: clip; background: none; animation-name: none; }
.tile-sheen::before {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(118deg, transparent 34%, var(--t11-sheen) 47%, transparent 60%);
  animation-name: t11-sheen;
  animation-duration: inherit; animation-timing-function: inherit;
  animation-delay: inherit; animation-iteration-count: inherit; animation-fill-mode: inherit;
}
```

Three things make this a root-cause fix rather than a silencer:

* **`overflow: clip`, not `hidden`** — it clips without creating a scroll container, so the sheen
  contributes nothing to `.tile`'s scrollable overflow, while `.tile` keeps its own `overflow: hidden`
  and the auditor can still see a genuinely clipped tile **text**. The detector is not blinded: the
  only thing that stopped overflowing is the decoration.
* **Every animation longhand is `inherit`** — nothing is restated and nothing can drift out of sync.
  screens.css's `700ms var(--ease) 1`, motion.css's `820ms` + `both` for the mint, `run.js`'s inline
  per-tile `animation-delay` (`420 + k × 90 ms`, untouched), and BOTH reduced-motion overrides
  (screens.css `animation-duration: 0s`; motion.css `animation: none; opacity: 0`, which
  `tests/page-r2.test.mjs` pins) all flow through the element to the pseudo-element unchanged.
* **It degrades to today's behaviour** on an engine without `overflow: clip` — `.tile`'s own
  `overflow: hidden` still clips the sweep, so the visual is never at risk.

### Measured, before → after

| | chromium | webkit |
|---|---|---|
| `.sum-tile` scrollWidth / clientWidth, sheen parked | 128 / 58 → **58 / 58** | 128 / 58 → **58 / 58** |
| sheen transform at the same instant of the same sweep | element `21.6035px` → `::before` `21.6029px` | same track, `-69.6 → +69.6` |
| duration / delay / fill-mode on the animating box | `0.82s / 0.42s / both` | `0.82s / 0.42s / both` (unchanged) |

Visually identical: rendered frames of the tile grid captured at the same point of a slowed-down
sweep (`--t11-sheen` band crossing the tiles) match before and after.

---

## Screenshots read

`#/run/drill/CS-LIN` (midweek fixture) and `#/run/page` Summary (page-done fixture) at **375×667,
834×1112, 1440×900 and 1900×1200 in both themes** — 16 PNGs, all read. The title reads in full on two
lines at 375 (inside the Quit button's row, head height unchanged) and on one line from 430 up; the
mint grid, its captions, the family tile's ladder line and the rarity/skill/readiness blocks are
unchanged.

## Regression sweep beyond my two states

Because both fixes are unconditional (`.run-head .run-title` on every run, `.tile-sheen` everywhere it
is used), the whole neighbourhood was re-audited:

```
node qa/layout-audit.mjs --only run,binder,boss --engine both --no-selftest
```

**168 states x 17 viewports x 2 themes x 2 engines (+ zoom and motion passes): 0 blockers.** The 102
remaining MAJORs are all one type — `tap-target` on `svg.fig.fig-fan … path.fig-wedge-hit` (a pairs
figure's wedge hit areas, 87.4x38.3 and 93.4x41, on `run-upgrade` and `run-page-item-1`). That is a
figure/widget concern, not run chrome, and not in this ticket's findings or owned files. **No
clipped-text finding survives anywhere in run, binder or boss**, and no state regressed.

## Not mine, seen in passing

* **Contrast on `run-page-summary`** — the before-run also reported `MAJOR contrast` on
  `span.rarity[data-r="gold"]` (3.70:1, needs 4.5:1 for 13 px) and `span.sum-rd-delta` (4.46:1). Both
  live in the rarity/semantic **colour tokens** (`--gold-ink`, `--warn` in theme.css), not in the run
  chrome, so they are not in this ticket's owned files. They no longer reproduce in the after-run —
  another lane appears to have landed the token fix while this ticket was in flight — but if they come
  back they belong to the theme/colour owner, not here.
* **`.run-sub` still truncates** (`white-space: nowrap; text-overflow: ellipsis`, polish.css L537) for
  `data-kind="page"` between 640 and 1023 px. The auditor does not flag it and it is defensible — a
  subtitle is metadata, not the name of the thing — but the same "zero floor" shape is there. Left to
  the fix5:run owner.

## Requests for other owners

* **screens.css (T11 owner):** the `.tile-sheen` fix above duplicates the sheen's gradient literal so
  that it can sit on the pseudo-element that moves. When you next touch that block, fold it in —
  `.tile-sheen { overflow: clip }` with the gradient and the animation on `::before` — and delete the
  copy at the end of polish.css. The `@keyframes t11-sheen` themselves are reused as-is, unchanged.
* **polish.css `fix5:run` owner:** `.run-title`'s `white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis` inside `@media (max-width: 1023px)` (L536) is now **neutralised** from the
  fix:B4 block at the end of the file. The honest fix is to delete those three declarations there; the
  `flex`/`min-width` half of the rule is fine and should stay.
