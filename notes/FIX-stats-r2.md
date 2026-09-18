# FIX:stats r2 — the Stats screen (`#/stats`), visual QA round 2

Ticket `fix:stats r2`. Two findings, both carried from round 1, both root-caused rather than patched
per viewport. Verdict of my own audit slice after the fix: **0 blockers, 0 majors.**

Owned / touched files:

| file | what |
|---|---|
| `site/css/polish.css` | new `/* === fix:stats r2 === */` block at the end (the tap targets); threshold 720 → 640 in §5c; **deleted** the two viewport-keyed stats `@media` rules inside the `binder r2` block |
| `site/css/screens.css` | threshold 720 → 640 in the T11/LAYOUT-ROOT `@container stats` block (one number + why) |
| `tests/fix-stats.test.mjs` | new, 7 tests (6 static + 1 measured, the measured one skips without Playwright) |
| `qa/fix-stats-r2.mjs` | new dev tool: real hit boxes by hit-test, container-threshold reachability, Stats track / overlap / clipped-ink / overflow checks, both engines, both themes |
| `notes/LAYOUT-ROOT.md` | the threshold table said `stats → 720 px` (now 640 + the arithmetic) and §6's request to fold the @media rules in is marked done |

Nothing in `site/js` changed: both defects were CSS.

---

## Finding V1 — the six section chips were 32 px tap targets (MAJOR, every viewport, both engines)

**Root cause.** `polish.css` L200-201 bought the missing 12 px with an escape hatch:

```css
.st-jump .chip { position: relative; height: 32px; … }
.st-jump .chip::before { content: ""; position: absolute; inset: -6px; }   /* r1 */
```

`base.css:115` says `.chip { … overflow: hidden; text-overflow: ellipsis; }` — commented "truncates
before it can overlap" — and an element's `overflow` clips its own absolutely positioned pseudo when
that element is the pseudo's containing block (`position: relative` makes it exactly that). The
promised hit area was therefore painted nowhere and hit-tested nowhere.

Measured with `elementFromPoint` stepping out from the chip's own edges (`node qa/fix-stats-r2.mjs`):
the hatch bought **one** pixel — 33 px, not 44 — identically in chromium and webkit, at 320 / 375 /
660 / 672 / 700 / 834 / 1024 / 1440 / 1900 / 2560, in both themes.

This is the same defect the **B1** lane root-caused for the header chip in this same wave
(`polish.css` `fix:B1`: "the r1 ::before hit box was clipped by base.css's `.chip { overflow: hidden }`")
and it had not carried over to this screen.

**Root fix — the hit target stops being an escape and becomes the box** (B1's shape, so both chips now
work the same way): the `<a>` is itself `height: var(--tap)` and `min-width: var(--tap)`, and the 32 px
pill S5 asks for is *painted inside it* by `::before { inset-block: 6px; inset-inline: 0 }`. base.css's
clip guard stays on and has nothing to clip; the border **colour** stays on the `<a>` (`border-width: 0`
+ `border-color: inherit` on the pseudo) so the `.chip[data-tone]` rules still reach the ring. The
focus ring hugs the pill (`outline-offset: -4px`), and `.st-jump`'s row gap drops to 0 with
`margin-top: 4px` because the box now carries 6 px of its own above and below each pill — the *visual*
rhythm is the 12 px it was in r1.

Same defect one row down, same fix: **`.st-skill-drill`** ("Drill 5") overrode `.btn`'s
`min-height: var(--tap)` down to 32/36 px and grew `::before { inset: -4px 0 }` for the rest; measured
**43 px**. The override and the hatch are both gone, so one token (`--tap`) owns the number again.

**After:**

| | visual box | real hit box (hit-tested) |
|---|---|---|
| `.st-jump .chip` before | 32 px tall | **33 px** |
| `.st-jump .chip` after | 44 px box, 32 px pill | **44 px** (probe reads 45 at the boundary) |
| `.st-skill-drill` before | 36 px | **43 px** |
| `.st-skill-drill` after | 44 px | **44 px** |

Functional proof, not just geometry: a real mouse click **3 px inside the top edge** of a chip's box —
dead space in r1 — now activates it (`scrollY 0 → 1008`, jumping to Skills). Keyboard focus draws the
ring around the pill, not around the invisible box (read the PNG at
`qa/screenshots/fix-stats-r2/` + the focus shot in the ticket's scratch dir).

**Negative control (the check can fail its own defect).** Re-injecting the r1 CSS into the live pages —
`node qa/layout-audit.mjs --only stats --engine chromium --vp 375x667,1440x900 --inject '.st-jump
.chip{height:32px;line-height:30px;min-width:0;…}.st-jump .chip::before{inset:-6px;…}'` — produces
**12 MAJOR tap-target findings**:

```
hit box 81.1x32 (< 44x44) — its pseudo-element would grow the box to 93.1x44,
but section.screen.stats > header.st-top > nav.st-jump > a.chip clips it
```

Worth recording *why* that message exists: when this ticket started, `qa/layout-audit.mjs` scored
these chips a clean **44×44** and the whole matrix returned zero tap-target findings, because the
detector added negative pseudo insets from the computed style without asking whether anything clips
them — it was reporting the CSS author's intention instead of the geometry. The **fix:qa r2** lane made
`pseudoGrow`/`pseudoClip` clip-aware mid-round, which is why the net now sees this class of defect.
`qa/fix-stats-r2.mjs` measures it the other way round (hit-testing, not style reading), so the two
agree from opposite directions.

## Finding V3 — the wide Stats layout could never render (MAJOR, every viewport ≥ 720 px)

**Root cause.** LAYOUT-ROOT moved the Stats rows from `@media (min-width: 720px)` to
`@container stats (min-width: 720px)` and kept the number ("unchanged number, right box"). But the
container is `.screen.stats`, and `base.css` caps every `.screen` at `--col` = **680 px**. The
threshold was 40 px above the container's permanent maximum, so:

* the wide rows in `screens.css:509` and `polish.css:820` were **dead CSS** — no viewport could match;
* `polish.css`'s `@container stats (max-width: 719.98px)` matched *everywhere*, so 2560 px desktops
  rendered the three-row phone layout (measured before: `.st-skills li [632px 40px]` at every width
  from 834 to 2560);
* and the only thing that ever varied was `binder r2`'s leftover `@media (min-width: 720px)
  .st-skills li`, i.e. the viewport-keyed rule the container query was supposed to replace.

**Root fix — the threshold, not the host.** Lifting `.screen`'s cap for Stats (the way
`.screen:has(.card-screen)` lifts it for the card) would have made the Stats column 1024 px wide and
changed a screen nobody complained about; the wide rows were always *designed* to fit the 680 px
reading column (that is what the old viewport rule did on tablet-and-up). So the number is re-derived
from what the row actually needs, in both files that declare it:

```
190 name + 8 + 108 bar + 8 + 46 val + 8 + 200 meta + 8 + 64 drill = 640
```

— the narrowest Stats column where all four fixed tracks keep their size and the bar is still ≥ 100 px.
The complement branch moves with it (`max-width: 639.98px`).

The `binder r2` block's two viewport-keyed stats `@media` rules are **deleted**, which LAYOUT-ROOT §6
had asked that block's owner to do at the next touch. Nothing was lost: §5c already declared the same
`.st-errors` / `.st-err-main` / `.st-err-side` / `.st-skill-meta` / `.st-skill-drill` rules in both
directions, and its `.st-skills li` template keeps the identical fixed 46 / 200 / 64 columns (every bar
still starts and ends on the same x) *plus* the 12ch floor on the name that the @media copy lacked.
They were also actively wrong in the new 672-711 px viewport window, where the column is 640-679 px:
wide skill rows with stacked error cards.

**Measured, before → after** (`node qa/fix-stats-r2.mjs --engine both`, chromium and webkit identical,
light and dark identical):

| viewport | `.screen.stats` | `.st-skills li` tracks before | after |
|---|---|---|---|
| 375 | 343 | `295px 40px` (stacked) | `295px 40px` (stacked — unchanged) |
| 660 | 628 | `580px 40px` | `580px 40px` (stacked — below the threshold) |
| **672** | **640** | `640px 40px` | **`190px 108px 46px 200px 64px`** (the threshold's own arithmetic, to the pixel) |
| 700 | 668 | `668px 40px` | `190px 136px 46px 200px 64px` |
| 834 / 1024 / 1440 / 1900 / 2560 | 680 | `632px 40px` | `190px 148px 46px 200px 64px` |

`.st-bars li` (XP-per-day and rarity) follows the same switch: `88px … 44px` at `--fs-1` below,
`140px … 56px` at `--fs-2` above. Skill-name width in its own font: **20.6 ch** in the wide row (the
LAYOUT-ROOT floor is 18 ch); the stacked row keeps 30.4 ch at 375.

## The test that would have caught both

`tests/fix-stats.test.mjs` (static, no browser, 6 tests + 1 measured):

1. **the parse is not vacuous** — 800+ rules, `.st-jump .chip` present, `@container stats` present;
2. **the dead-threshold lint can fail** — `deadThresholds()` is a pure function, exercised on a
   synthetic 720-px-on-a-680-px-container case (flags it), a reachable case (doesn't) and an unknown
   container (doesn't judge);
3. **no `@container` threshold exceeds its container's cap** — reads `--col` from `theme.css`, asserts
   `.screen` still caps at `--col` and that nothing lifts the cap for Stats, then judges every
   `@container stats (min-width: N)`; it also asserts the wide branch still *exists* (so "fixed by
   deletion" fails too);
4. **the Stats rows change shape on the container, never on the viewport** — a brace-scan of the CSS
   with at-rule context, so a template that goes back behind `@media (min-width: …)` fails, and ≥ 4
   `@container stats` templates must exist;
5. **no `.chip` buys its hit box with a negative-inset pseudo** — insets expanded per side through the
   cascade (`inset` vs a later `inset-block`/`inset-inline` pair), with its own negative control;
6. **the chips and Drill 5 are 44 px boxes from one token** — `height`/`min-width: var(--tap)`,
   `overflow: hidden` still on, `min-height: var(--tap)` on Drill 5, and the pill actually painted;
7. **measured** — runs `qa/fix-stats-r2.mjs` at 375 + 1440 and asserts `ALL PASS` *and* that the 1440
   row prints the wide template (a pass that measured nothing cannot slip through).

## Verification

* `node qa/layout-audit.mjs --only stats --engine both` → **0 findings, 0 waived, PASS** (1 state × 17
  viewports × 2 themes × 2 engines + the text-zoom and reduced-motion passes).
  `qa/audit/stats-before.json`, `qa/audit/stats-after.json`. No waiver was added or widened.
* `node qa/fix-stats-r2.mjs --engine both --widths 320,375,660,672,700,834,1024,1440,1900,2560` →
  **ALL PASS** (40 state/theme/engine/width combinations): every chip and Drill 5 ≥ 44 px, no Stats
  grid track at 0 px, no clipped ink (measured with a Range over the text, not `scrollWidth`), no
  sibling of a Stats row sharing pixels (214 pairs compared per state — the pass is not vacuous), no
  horizontal overflow, and every `@container` threshold on this route reachable.
  The 660-712 px band matters: the audit matrix has **no viewport between 430 and 768 px**, so the
  640-679 px container window this threshold opens is only measured here.
* PNGs read during the fix, all in `qa/screenshots/fix-stats-r2/` (git-ignored):
  `after-{375,834,1440,1900}-{light,dark}.png` (full page, written by the tool's `--shots`) and the
  viewport crops actually eyeballed — `read-{375,1900}-{light,dark}-chips.png` (the chip row),
  `read-{834,1440}-{light,dark}-skills.png` (the wide skill rows that were dead before),
  `read-672-light-threshold-edge.png` and `read-focus-ring.png` (the ring hugging the pill).
  Phone 375, tablet 834, laptop 1440 and wide 1900 were read in **both** themes.
* `node --test` → **1320 tests, 1316 pass, 0 fail, 4 skipped** (my 7 included; the total moves as other
  lanes in this shared tree add their own). No existing test was edited.

## Requests for other owners

* **`qa/layout-audit.mjs` (AUDIT-HARNESS owner).** The harness already visits every state at every
  width; have it record, per named container, the widest inline size it ever measures, and at the end
  compare that against the `@container <name> (min-width: N)` thresholds parsed from `site/css`. A
  threshold no state can reach is a layout nobody can see — it is what V3 was, and a per-screen lint
  like mine can only judge containers whose cap is knowable statically (today: `stats`). My
  `qa/fix-stats-r2.mjs` prints the reachability table for whatever route it drives, including the
  "not on this route" rows, so the shape of the check is already written down.
* **`report` container (`fix:mock r2` owner).** Same defect class, still in the tree:
  `@container report (min-width: 720px)` at `screens.css:1289`, `polish.css:1292` and `polish.css:1329`.
  That lane deliberately left those rules dead and took the last word with a new inner container
  (`reportrow`, a ch-based threshold), and its own tests prove they cannot decide anything — so my
  lint judges only `stats` and does not fail them. If the harness check above lands, they will show up
  as dead and can be removed rather than out-cascaded.
* **`notes/S9-SCORECARD.md` owner.** Its sweep list still names "the five Stats tab chips (32 px tall)"
  (there are six) under "tap targets < 44 px". They are 44 px now, hit-tested in both engines; that
  line can be struck when the scorecard is next re-run.
* **`.chip` owners generally.** `base.css`'s `.chip { overflow: hidden }` means **no chip anywhere can
  grow its hit box with a negative-inset pseudo.** Two lanes have now paid for that separately (B1's
  header chip, these six). The working shape is: the chip is the `var(--tap)` box, the pill is painted
  inside it by `::before`. `tests/fix-stats.test.mjs` lints every `.chip` pseudo in the app for it.

## Open issues

* The wide skill row keeps a fixed 200 px meta column and a fixed 64 px drill column, so on rows with
  neither (untested skills) there is a 264 px gutter between the value and the right edge. It is
  deliberate — the alternative is per-row `auto` tracks, and then no two bars start or end on the same
  x — but if the Stats screen is ever given the full 1024 px shell, re-derive the threshold rather than
  scaling those two numbers by eye.
* `.st-jump`'s chips are `<a href="#/stats">` with a JS scroll handler; with the boxes touching
  vertically (row-gap 0) two stacked chips share an edge. Adjacent 44 px targets that touch are normal,
  and no chip is reachable only through its neighbour's pixels (each was hit-tested independently).
