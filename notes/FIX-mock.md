# FIX:mock — round 2

Ticket `fix:mock r2`. One finding, one root cause, one new convention.

Owned/changed files:
* `site/css/polish.css` — appended block `/* === fix:mock r2 === */` (nothing else in the file touched)
* `tests/fix-mock-r2.test.mjs` — new (4 static assertions, no browser)
* `qa/fixmock-r2.mjs` — new dev driver (the measured, cross-engine proof)
* this note

Not touched: `site/css/screens.css`, `site/js/screens/report.js`, `qa/audit-states.mjs`
(requests to their owners at the bottom).

---

## 1. The finding

`V4-report-split-dead` — **major**, `mock-report-expanded` (`#/mock/report/1`, one row expanded),
**every viewport ≥ 720 px**, measured at 1440×900 and 2560×1440, chromium (confirmed here in webkit
too), both themes.

`.report-split` is the "YOUR SCRATCH | WORKED SOLUTION" pair — S7's whole point on this screen is
that you read your own working *beside* the right answer. It was a **single 618 px column at every
desktop width**, where HEAD gave `273.625px 328.375px`. On the one screen the student reads after a
Mock, his answer and the correct answer were stacked.

## 2. Root cause

Not the 680 px reading column, and not a missing container. **A container query whose threshold was
carried over from the `@media` rule it replaced, without being re-derived for the new box.**

LAYOUT-ROOT correctly moved the rule off the viewport:

```css
/* screens.css:1284 */
@container report (min-width: 720px) { .report-split { grid-template-columns: minmax(18ch, 1fr) minmax(18ch, 1.2fr); gap: 16px; } }
```

…and kept the number `720`. But `report` is `.report-screen`, and `.report-screen` is a `.screen`,
which `base.css:190` caps at the prose column: `.screen { max-width: var(--col) }`, `--col: 680px`.
**680 < 720, so the rule cannot match at any viewport, in any engine, at any zoom.** It is dead code
that looks alive.

This is the mirror image of the bug LAYOUT-ROOT was written for. There a component laid itself out
for a width it did not have (1024 px of tracks inside 680 px → a 0 px stem). Here a component
refuses a layout it *does* have the width for. Both are the same root mistake: **the rule is keyed
to a box that is not the box that reshapes.**

Why nothing caught it:

* `qa/layout-audit.mjs` is blind to this class **by construction** — one readable column is not a
  0 px track, not an overlap, not an occlusion and not an overflow. It reported **0 findings** on
  `mock-report` / `mock-report-expanded` before the fix and 0 after. The finding came from the
  HEAD-to-HEAD comparison, not from the net.
* `tests/layout-root.test.mjs`'s `REHOSTABLE` lint already lists `.report-split`, but it only asks
  "is a `@container` rule governing this selector in both directions?" — it never asks whether the
  threshold is **reachable**. A dead threshold passes it.

Both holes are now closed (§5).

## 3. What changed

Two things, neither of them a per-viewport patch.

### (a) The query container is the parent of the thing that reshapes — `.report-item-b` / `reportrow`

`.report-screen` is four levels and **62 px of chrome** above `.report-split`:

| level | costs | running width at a ≥ 768 px viewport |
|---|---|---|
| `.report-screen` (`container-name: report`) | — | **680** |
| `.report-card` | padding 16 + 16 | 648 |
| `.report-item` | border 1 + 1, `border-left: 3px` status stripe | 642 |
| `.report-item-b` | padding 12 + 12 | **618** |
| `.report-split` | — | **618** |

Any threshold written against `report` is really "the split's width, plus whatever the chrome costs
today" — it rots the next time the report gains a border. `.report-item-b` is the split's direct
parent and **its content box *is* the split's width** (618 = 618, measured in both engines), so it
is the only honest box to query. It hosts no `position: fixed` or `position: absolute` descendant,
so `container-type`'s layout containment traps nothing (LAYOUT-ROOT §checklist #4 — verified by
grep and by `tests/layout-root.test.mjs`'s own container lint, which still passes). It is also the
right container for any future rule inside an expanded report row.

### (b) The threshold is in `ch`, derived from the content

| term | value | why |
|---|---|---|
| stem floor | 18ch | the LAYOUT-ROOT floor for a column that holds words |
| solution floor | 18ch | same |
| gap | 16 px = 1.56ch | `.report-split`'s own gap |
| marker gutter | 20 px = 1.95ch | `.report-solution`'s `padding-left` — it is *inside* the right column, so it is width the text does not get |
| **need** | **39.5ch** | |
| **declared** | **44ch** | need + ~11 % headroom, so the narrower column is ≥ 19ch the moment it first splits |

In `ch`, **not px**, because the need scales with the text: at 200 % text zoom a px threshold would
still say "there is room" while two 18ch floors no longer fit, and the tracks would spill. For the
same reason both floors keep the `min(100%, …)` guard — a floor that can never be wider than the
grid can never cause overflow. (The bare `minmax(18ch, 1fr)` in screens.css only holds at the
default font size; that is the second half of why this block, not that one, has the last word.)

Below 44ch the split is **one column** and the text is never squeezed: the worked solution drops
under the scratch — what a phone gets today and what it should keep getting.

```css
.report-item-b { container-type: inline-size; container-name: reportrow; }
@container reportrow (min-width: 44ch) {
  .report-split { grid-template-columns: minmax(min(100%, 18ch), 1fr) minmax(min(100%, 18ch), 1.2fr); gap: 16px; }
}
@container reportrow (max-width: 43.99ch) {
  .report-split { grid-template-columns: minmax(min(100%, 18ch), 1fr); gap: 12px; }
}
```

The `max-width` branch is there so this block has the last word **in both directions** instead of
racing the legacy rule: if a later lane ever widens `.report-screen` past 720 px, the dead
`@container report (min-width: 720px)` wakes up with *unguarded* 18ch floors, and under text zoom it
would fire while the split can no longer hold them.

**Not done on purpose:** widening `.report-screen` past 680 px. The 680 px prose column is the
design (S5 reading column, and every other prose screen shares it), HEAD read fine inside it, and
"make the box bigger until the stale number matches" is the patch, not the fix.

## 4. Measurements

`node qa/fixmock-r2.mjs --engines chromium,webkit --themes light,dark --widths 375,500,560,768,834,1024,1280,1440,1900,2560`
— 3 states × 10 widths × 2 themes × 2 engines = **120 measurements, ALL PASS**.
The "before" column is a **file-copy A/B** (`--site <copy>` with the block `sed`-stripped): the live
tree is never edited to take a reading, because other lanes are appending to `polish.css` while this
runs.

`.report-split`, light theme, **identical in chromium and webkit** except for webkit's sub-pixel
rounding (`328.359375` vs `328.375`):

| viewport | `.report-screen` | `.report-item-b` inner | `.report-split` | tracks BEFORE | tracks AFTER |
|---|---|---|---|---|---|
| 375 | 343 | 281 | 281 | `281px` (1 col) | `281px` (1 col) — 28.8ch, under the 44ch threshold |
| 500 | 468 | 406 | 406 | `406px` (1 col) | `406px` (1 col) — 41.6ch, in the headroom band |
| 560 | 528 | 466 | 466 | `466px` (1 col) | **`204.5px 245.5px`** (2 col) — narrower column 20.9ch |
| 768 | 680 | 618 | 618 | `618px` (1 col) | **`273.625px 328.375px`** — 26.6ch |
| 834 | 680 | 618 | 618 | `618px` (1 col) | **`273.625px 328.375px`** |
| 1024 | 680 | 618 | 618 | `618px` (1 col) | **`273.625px 328.375px`** |
| 1280 | 680 | 618 | 618 | `618px` (1 col) | **`273.625px 328.375px`** |
| 1440 | 680 | 618 | 618 | `618px` (1 col) | **`273.625px 328.375px`** |
| **1900** (the student's window) | 680 | 618 | 618 | **`618px` (1 col)** | **`273.625px 328.375px`** |
| 2560 | 680 | 618 | 618 | `618px` (1 col) | **`273.625px 328.375px`** |

The 618 px row is HEAD's own number, which is the point: the fix restores what the student used to
read, it does not invent a new layout. Dark theme is identical at every width (colour only).

Also measured and asserted at every width, both engines, both themes: no document horizontal
overflow; no descendant of the split spills its column (`scrollWidth > clientWidth`) — this is the
one that matters for the monospace `pre.report-work`; `.report-answers` never resolves a 0 px track;
`.report-actions` never wraps past two rows at ≥ 1024 px.

### The third state — the item a student actually reads

The auditor's `mock-report-expanded` expands **item 10**: its "find a miss" regex is `/✗|miss|0\b/`
and the string `"10"` matches `0\b`, so the state is a **correct** item with an **empty** scratch and
a one-step solution — the easiest possible payload for a two-column grid. So this driver adds
`mock-report-worst`: same fixture, patched in `localStorage` and re-rendered by the app, with a
realistic five-line typed scratch on every item, then the **first 0/5 item** expanded — item 15
"Diagram algebra": figure, a 40 %-share setup part left blank, and a **six-step** worked solution
with monospace math. That is the state the PNGs below were read from. It passes the same assertions.

### Screenshots read (not just taken)

`qa/screenshots/fixmock-r2/` (git-ignored), 120 PNGs. Read during the fix, all four breakpoint
classes in **both themes**:

| PNG | what it shows |
|---|---|
| `after-mock-report-worst-375-light-chromium.png` | phone: one column, scratch box above the six steps, monospace wraps, no clipping |
| `after-mock-report-expanded-375-dark-webkit.png` | phone dark: one column |
| `after-mock-report-worst-834-dark-webkit.png` | tablet dark: two columns, 273.6 / 328.4 |
| `after-mock-report-expanded-834-light-chromium.png` | tablet light: two columns |
| `after-mock-report-worst-1440-light-webkit.png` | laptop light: two columns, scratch paper box beside step 1–6 |
| `after-mock-report-expanded-1440-dark-chromium.png` | laptop dark: two columns |
| `after-mock-report-worst-1900-light-chromium.png` | **the student's width**: figure, scratch, and the full six-step solution side by side |
| `after-mock-report-worst-1900-dark-chromium.png` | the same in dark |

## 5. How it is kept fixed

`node --test`: **1320 tests, 1316 pass, 0 fail, 4 skipped** (the 4 new ones are this ticket's; other
lanes landed tests in the same window, so the total moved by more than 4).

`tests/fix-mock-r2.test.mjs` — static, no browser:

1. `.report-item-b` is an inline-size container named `reportrow`.
2. The rule with the **last word** on `.report-split`'s columns (CSS files are linted in cascade
   order) is keyed to `reportrow`, and a `max-width` branch exists so the legacy rule can never
   decide.
3. The threshold is in `ch` (a px threshold is rejected with the text-zoom reason), inside the
   derived 40–52ch band, and **both** tracks carry a `minmax(min(100%, Nch), …)` floor.
4. **The dead-threshold lint.** Any `@container report (min-width: Npx)` with `N > --col` (680) must
   have a *live* container pair governing the same selectors, or it is reported. This is the check
   that was missing: it is the one that would have caught V4 at CI time instead of after the
   student read the screen.

**Negative controls** — a check that cannot fail its own defect is worthless. Both are re-runnable
without touching the live tree (`U1A_CSS_ROOT` for the test, `--site` for the driver):

```sh
mkdir -p /tmp/nc && cp -R site /tmp/nc/ && sed -i '' '/=== fix:mock r2 ===/,$d' /tmp/nc/site/css/polish.css
U1A_CSS_ROOT=/tmp/nc node --test tests/fix-mock-r2.test.mjs        # 4 tests, 4 FAIL
node qa/fixmock-r2.mjs --site /tmp/nc/site --engines chromium,webkit --themes light   # FAILURES on every width >= 560
```

Un-fixed, all four tests fail and the driver reports **88 failures** — every width ≥ 560 px, in both
engines, with the 618 px rows naming HEAD's `273.625px 328.375px` explicitly so the fix cannot be
scored green by going one-column everywhere.
`before-mock-report-worst-1900-light-chromium.png` is the defect at the student's own width: the
scratch a full-width block, the six-step solution stacked underneath it. The lint in
#4 **passed the un-fixed tree on its first draft** — its "is there a live pair?" regex was allowed
to run past a closing brace and found the selector in the *next* `@container` block. That is exactly
the blindness this note is about, and it is why the lint now parses block by block. Caught by the
negative control, not by review.

`node qa/layout-audit.mjs --only mock-report --engine both` — **0 findings, 0 blockers, 0 majors**
(`qa/audit/fixmock-r2-after.json`); it also reported 0 before the fix, which is the honest statement
about what the net can and cannot see.

## 6. Requests for other owners

* **`screens.css` owner (T13 block):** fold `@container report (min-width: 720px)` (L1284) into
  `@container reportrow (min-width: 44ch)` with the `min(100%, …)`-guarded floors and delete the
  pair in `polish.css` §fix:mock r2. The `@container report (min-width: 520px)` rule for
  `.report-actions .btn` (L1225) is **alive** (520 ≤ 680) and correct as it stands — but the box it
  really governs is `.report-actions` (648 px, not 680), so if that threshold is ever raised, move
  it to a container on `.report-card` rather than nudging the number.
* **`qa/audit-states.mjs` owner:** `mock-report-expanded`'s miss-finder is
  `/✗|miss|0\b/.test(b.innerText)` — `"10"` matches `0\b`, so the state expands a **correct** item
  with an empty scratch and a one-step solution. The screen worth auditing is a missed item with a
  figure, a typed scratch and a multi-step solution. `qa/fixmock-r2.mjs`'s `mock-report-worst`
  builds exactly that (patch `work` on the run's items in `localStorage`, reload, expand the first
  `0 / 5`); please lift it into the state list, or tighten the regex to `/✗|\b0\s*\/\s*5\b/`. As it
  stands the auditor has never measured the report's hard case.
* **`tests/layout-root.test.mjs` owner:** the `REHOSTABLE` lint asks whether a `@container` rule
  governs a selector in both directions, but never whether its **threshold is reachable**. Test #4
  here generalises to any container whose element is a `.screen` (capped at `--col` unless
  `.screen:has(.card-screen)` lifts it); worth folding into that file so every container, not just
  `report`, is checked. Today's other thresholds are all reachable: `stats` 640, `run` 560,
  `answers` 380–640, `paper` 600/640, `cardhost` 520/960 — verified by grep after this fix.
* **App shell owner (`.hdr`, base.css:65):** not a finding and not touched — noting it so the next
  reader of these PNGs does not re-report it. `.hdr` is `background: color-mix(in srgb, var(--bg)
  86%, transparent)` + `backdrop-filter: blur(10px)`, i.e. 14 % transparent by design. Headless
  webkit does not apply `backdrop-filter`, so in every scrolled screenshot the content behind the
  header reads as plain overlapping text (`after-mock-report-worst-834-dark-webkit.png`: "uct /
  midpoint (two cases)" behind the XP chip). It is a render artefact of the frosted design, app-wide,
  and `qa/layout-audit.mjs` deliberately excludes sticky app chrome from its occlusion detector.
