# notes/AUDIT-HARNESS.md — ticket AUDIT-HARNESS (the layout safety net)

## What was built

| file | role |
| --- | --- |
| `qa/layout-audit.mjs` | the auditor. Serves the repo root itself (server copied from `qa/shot.mjs`), imports the state catalog from `./audit-states.mjs`, sweeps the matrix, measures 11 detectors in the page, writes `qa/audit/report.json` + evidence PNGs, prints a summary, exits 1 on any unwaived BLOCKER/MAJOR. |
| `qa/audit/selftest.html` | five planted defects (calibration target — **do not "fix" this page**). |
| `qa/audit/selftest-clean.html` | the control page. Must report zero findings. |
| `qa/audit-allow.json` | waivers, each with a mandatory REASON. Waived hits are printed as `waived`, never dropped. |
| `tests/layout-audit.test.mjs` | runs the self-test under `node --test`; skips gracefully with no browser binary. |
| `notes/AUDIT.md` | how to run it, what each detector means, how to waive with a reason. |

`qa/audit-states.mjs` is **not** mine — the state-catalog lane owns it. I wrote a placeholder only while
the file was missing; that lane's real 92-state catalog landed mid-ticket and replaced it (contract
unchanged, so nothing on my side had to move).

## The command other lanes should use

```
cd /Users/oliver/Projects/unit1a-quest && node qa/layout-audit.mjs
```

Full matrix: 92 states x 17 viewports x light+dark x chromium+webkit, plus a text-zoom pass
(`html{font-size:20px}`) and an animations-enabled pass at 1900x1200. ~45 min, exit 1 while anything
is broken. Tight loops while fixing one screen:

```
node qa/layout-audit.mjs --only placement,run-page --vp desktop --engine chromium --theme light
node qa/layout-audit.mjs --only placement-item-1 --vp 1900x1200     # the student's own window
node qa/layout-audit.mjs --selftest                                  # detectors only, ~4 s
```

## It reproduces the reported bug, by measurement

`placement-item-1` at 1900x1200, straight out of the report:

```
BLOCKER collapsed-text  .card-screen > .card-stage > .card-paper > .card-stem
        text (119 chars) in a 0px content box (floor 62px = max(60px, 6ch)); 94 rendered line(s), and it spills out of the box
BLOCKER zero-track      .card-screen > .card-stage > .card-paper > .card-stem
        grid child collapsed to 0.0px wide but carries text; parent grid-template-columns: 0px 250px
MAJOR   squeeze         (same element) text block is only 0.0ch wide while its container offers 26.3ch
```

Seen at `1024x768 … 2560x1440` and in the zoom and motion passes, in **both** engines and themes, and
at **no** phone width — which is the shape of the bug: a viewport-keyed rule applied to a component
hosted at a width the viewport knows nothing about. The PNG
(`qa/audit/png/placement-item-1-1900x1200-light-chromium.png`) is the student's screenshot, letter by
vertical letter.

**And it now reports it fixed.** Late in this ticket the CSS lane landed `container-type: inline-size`
on `.card-host` / `.card-stage` / `.card-parts` / `.run-screen` and friends in `polish.css`; re-running
`--only placement-item-1 --vp 1900x1200` returns zero findings on `.card-stem`. The net found the
defect, a fix lane fixed the cause, and the net agrees — which is the whole point of building it.

## Detector calibration: what fired falsely, and what was done about it

Every one of these was found by running the net against the real app and reading the result. They are
recorded because each is a trap a future detector change can fall back into.

1. **Inline bounding boxes** — a wrapped `<span>`'s bounding box is as wide as the paragraph and as
   tall as all its lines, so `li > b` "covered `li > span.muted` by 100%". Overlap now compares
   `getClientRects()` **line boxes**. (52 phantom blockers on `onboard-3-intro` alone.)
2. **Intentional stacking** — the mock's Question-map bottom sheet legitimately covers the paper: 235
   phantom blockers on `mock-mid-map`. Overlap now skips pairs on different **opaque positioned
   surfaces** (`surfaceOf`). Deliberately *not* done by hit-testing: `elementFromPoint` returns the
   topmost box regardless of background, and in any overlap both boxes cover the shared region, so
   "is the lower one topmost anywhere" is false for **every** overlap — using it would have silenced
   the whole detector. It nearly shipped that way, passing the self-test only because the planted
   labels sat below the fold where `elementFromPoint` returns `null`. The plants were moved above the
   fold and the self-test now **fails** if they ever drift off screen again.
3. **Out-of-flow children and `textContent`** — `.card-foot` and the mock's `.rail` looked like "0px
   tall but carries text": `textContent` includes `hidden` children, and an absolutely/fixed child
   (the sheet) neither sizes its grid track nor is painted in it. `zero-track` now counts only
   **visible, in-flow** text and controls.
4. **Screen-reader-only text** — `.sr-only` (base.css) and `.run-quit-label` (polish.css) are 1px +
   `clip-path: inset(50%)` **on purpose**. `collapsed-text`, `clipped-text` and `contrast` skip them.
5. **The dock and the header** — a fixed bottom dock covers whatever is at the bottom of a long page;
   that is normal and scrollable-away. Their checks now run where the reader can do nothing more about
   it: the header against content at `scrollY 0`, the dock at the **end** of the scroll, and
   `unreachable-answer` after `scrollIntoView({block:'center'})` on the control itself. (Before this,
   `run-page-item-1` reported a phantom unreachable answer at 375x667.)
6. **Multi-track rows** — `squeeze` fired on every two-column grid cell on a phone. A cell's track
   width *is* its available width, so a genuine multi-track parent is no longer counted.
7. **`label[for]`** — a styled file input (`#set-file` in Settings) is tapped through its label, which
   may be anywhere in the DOM. `tap-target` now follows `label[for]`, not just wrapping ancestors.
8. **Sub-pixel tap targets** — "hit box 44x44 (< 44x44)" is how a detector teaches people to ignore
   it. 0.5px tolerance, and fractional sizes print one decimal.
9. **Closed `<details>`** — the Stats screen's collapsed trophy groups produced **830** phantom
   blockers. Browsers hide a closed `<details>`'s content on the `::details-content` pseudo-element,
   so no real ancestor carries `display:none` or `content-visibility:hidden` and walking computed
   styles cannot see it — while Chromium still reports full geometry for that content. `hiddenUp` now
   treats anything inside a closed `<details>` (other than its `<summary>`) as hidden.
10. **Box geometry vs text ink** — a full-width `.weak-name` row "covered 100 %" of the `.weak-m`
   badge sitting in its empty right-hand half. Overlap now compares where text is actually **inked**
   (a `Range` over each element's own text nodes, line by line); elements with no own text still fall
   back to their line boxes.
11. **Padding-tight labels** — an 8-char chip needing 57px inside a 55px box is fine. The
   `collapsed-text` spill threshold is +8px, not +2px; the real bug spills by hundreds.
12. **Server layout** — my first version served the repo root with the app at `/site/`, which 404'd the
   catalog's `import('/data/cards.js')` and produced 32 phantom `console` findings. It now serves
   `site/` at the origin root like `qa/shot.mjs`, with the auditor's own pages under `/__qa/`.
13. **`.sr-only` ink** — the ink-rect change (10) re-admitted screen-reader-only text through the back
   door: a 1px `.sr-only` box clips the *paint*, not the *layout*, so a `Range` over it returns a
   full-width line. One `span.sr-only` inside the mock's flag button "covered" the Map button next to
   it — 140 blockers across four engine/theme combinations. `.sr-only` text is now out of the
   collision test entirely.
14. **Grazing vs covered** — two texts sharing 51px² at 320px were graded the same BLOCKER as text
   buried under text. Text-on-text is now BLOCKER only from 15 % coverage up, MAJOR below ("the two
   texts graze each other"), and the vertical gate is 6px rather than 4px because a `Range` client
   rect is the line box, leading included — consecutive lines can share a few pixels without a glyph
   touching.

Net effect on the same 10-state slice: **1940 measurements / 78 "defects" → 21 measurements / 4
defects**. Across all 92 states at 320 / 768 / 1900 in both engines, the noisiest single state went
from 830 findings to 9, and the final run is **942 measurements / 202 distinct defects over 55
states, at most 8 per state** — a spread that reads like a real defect list rather than a cluster of
one detector misfiring. The self-test stayed green in both engines through every one of these changes.

## Design decisions worth knowing

* **Measure by resize, confirm by reload.** Navigating the whole matrix would take hours, so each task
  prepares its state once and sweeps the viewports by resizing. Viewports whose findings are identical
  form one group, and each group is re-checked **once** by a clean load at its widest viewport. A
  finding that survives is reported; one that does not is kept as `MINOR / unconfirmed: true` with a
  note. Nothing is dropped. `--no-confirm` skips it. This is what took a 10-state slice from ~15 min to
  ~2.5 min, and it also removed a third state-preparation: the evidence PNG is taken from the
  already-prepared confirm page.
* **Findings are keyed by type + selector + counterpart, never by rendered text** — a generated card
  draws a different question on every fresh save, so text keys made every stable defect look like a
  resize artefact.
* **One defect, many viewports.** `report.json` keeps every per-viewport measurement (the viewport list
  is what tells you which breakpoint is wrong) but also carries `groups`: one row per
  (type, state, theme, engine, selector) with its viewport list. The printed summary shows groups, and
  the header line says "N distinct defects behind M measurements".
* **The self-test is a preamble, not an option.** A default run refuses to audit the app if a detector
  cannot catch its own plant or cries wolf on the control page.

## Open issues / requests

* **For the fix lanes** (not mine to fix — the net only reports): the systemic cause is that the app has
  **no container queries at all** (`grep -rn "container-type|@container" site/css` → nothing), and text
  tracks are `minmax(0, 1fr)`, i.e. free to collapse to zero instead of having a floor and dropping to
  one column. Confirmed defects beyond the placement one, from the slice: `mock-rules` has a
  `grid-template-columns: 24px 245px 7.8px` third track holding text (all widths); `home-midweek`'s
  `.home-rail .skill-name` clips vertically (`overflow y: 55>37`) and its `.skill-tag` collides with a
  neighbouring row at 375x667; `sheet-print` has a 3.7:1 `.sh-stamp`; `mock-report-expanded`'s
  `.report-src-a` is an 86x16 tap target; `.fig-wedge-hit` is 86x38 in figures.
* `.gitignore` — added `qa/audit/png/` and `qa/audit/*.json` (one-line additions to a file I do not own,
  per BUILD-POLICY §2). The self-test **pages** stay committed; they are the calibration target.
* `tests/layout-audit.test.mjs` adds one test (1293 → 1294). No existing test was modified.
* The reduced-motion/animation pass runs at 1900x1200 only. If a fix lane suspects an animation-driven
  collision at another width, add the width with `--vp`.
* Waivers currently in `qa/audit-allow.json`: header status read-outs for `tap-target` (the real hit
  target is the 48px `#hdr-home` / settings anchor around them) and `.sr-only`/`aria-hidden` text for
  `contrast`. Both carry their reason in the file and are printed as `waived` in every run.
