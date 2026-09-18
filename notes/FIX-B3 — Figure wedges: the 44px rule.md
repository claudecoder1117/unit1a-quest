# FIX:B3 — Figure wedges: the 44 px rule

Ticket fix:B3, round 1. Every figure question shipped wedge hit boxes under S5's own floor
("Tap targets ≥ 44 px, **wedge hit areas ≥ 44 px**"). S9 #9 logged it as its one unfixed caveat.

Owned files: `site/js/figure/svg.js` · `site/css/figure.css` · the `/* === TRIAGE:fig === */` block in
`site/css/polish.css`. **Nothing was added to figure.css or polish.css — the defect is geometry, and a
CSS pad cannot fix it (see §2c).** Also touched, because they pin behaviour this ticket deliberately
changes: `tests/fix5-gen.test.mjs`, `tests/card-r1.test.mjs`. New dev tool: `qa/fix-b3-wedges.mjs`.

---

## 1. The findings

| # | sev | states | measured |
|---|---|---|---|
| 5 | MAJOR | card-classify, card-multipart, card-notation, card-pairs, card-rootcase-roots/-reject/-cases, card-strip, mock-mid, mock-mid-map, run-page-item-1, run-upgrade, variant-fig-pairs (13) | `svg.fig.fig-fan > g.fig-wedges > g.fig-wedge > path.fig-wedge-hit` — hit box **93.4 × 40.9** (< 44×44), 16 viewports, chromium + webkit, both themes |
| 14 | MAJOR | card-rootcase-cases | the same 93.4 × 40.9 on `.fig-wedge.is-linked` |

Both are one defect in one function. Reproduced before touching anything with
`node qa/fix-b3-wedges.mjs`: **37 of 152** hit boxes under 44 × 44 on the card routes alone, worst
**33.8 × 33.8**; and every one of the 13 states failed at 834 / 1440 / 1900 (fig 280 px) as well as at
320 / 375.

## 2. Root cause

`layoutFan()` sized the wedge hit path like this:

```js
const WEDGE_MIN = 60, WEDGE_MAX = 140, BAND = 58, MIN_CHORD = 60;  // "every wedge hit ≥ 44 px at 375"
const R1 = Math.max(WEDGE_MIN, ...atomic.map(a => Math.min(WEDGE_MAX, MIN_CHORD / (2 * Math.sin(R(a.span / 2))))));
```

Three separate faults, and the first two are the same fault `notes/LAYOUT-ROOT.md` names — a component
sized against an **assumed px width** instead of its own.

**(a) It measured the CHORD; a thumb (and the auditor) get the BOUNDING BOX.** The chord rule makes a
sector's *width across the arc* `2r·sin(span/2)`. The axis-aligned box of a sector that hugs an axis is
only `r·sin(span)` thick. For F1's ∠CFD (span 26° starting at 0°) that is 58.5 vb against a 60 vb chord —
and it is the *thin* number that decides whether a target is 44 px. Hence 93.4 × **40.9**: wide enough
in one direction, 3 px short in the other, on every figure question in the app.

**(b) 343 px was never the width the figure is hosted at.** `MIN_CHORD = 60` was calibrated for "≈ 0.78
css px per viewBox unit" — a 375 px phone minus 2 × 16 px gutters. Measured, in every host, both
engines, 16 widths (`node qa/fix-b3-wedges.mjs`):

| host | viewport | figure element | figure **drawn** |
|---|---|---|---|
| `#/card`, run, mock, night (wide) | 834 / 1440 / 1900 | 280 | 280 |
| `#/card` phone | 375 | 293 | **230.8** |
| `#/card` phone | 320 | 238 | **230.8** |
| `#/card` pairs | 1440 | 340 | 340 |
| mock | 834+ | 650 | 650 |

So the same viewBox geometry landed anywhere from **33.8 px to 67.5 px** of hit box. 343 px is not any
of those numbers.

Note the third column against the fourth: **the figure's element box is not its drawing width.**
`.card-figure .fig` carries a `max-height` (150 px on a short phone), and an `<svg>` with the default
`preserveAspectRatio` letterboxes its viewBox — a 293 × 150 element paints the 400 × 260 viewBox at
230.8 px wide and centres it. The scale is `min(w, h·400/260)`, never `w`. Measuring the element box
(which is what an eyeball does) over-reports the figure by up to 21 % — that is why the first pass of
this fix aimed at 238 px and was still 1 px short at 320 × 568.

**(c) And a CSS pad cannot rescue it.** The obvious cheap fix is a transparent, scale-independent pad
on the hit path:

```css
.fig-wedge-hit { stroke: transparent; stroke-width: 8px; vector-effect: non-scaling-stroke; }
```

Measured in both engines (scratch probe): **`getBoundingClientRect()` on an SVG shape ignores stroke** —
93.1 × 40.8 before and after, with a scaling stroke, a non-scaling stroke, and a *painted* stroke. So a
pad would have grown the real target while the auditor went on reporting the old number: the exact
"never make the auditor blind" failure. The region has to be big **in the path data**.

## 3. What changed

`site/js/figure/svg.js` only. **The drawing is untouched** — `WEDGE_MIN / WEDGE_MAX / BAND / MIN_CHORD`
still size the drawn sector and the ring pitch, and `fill:` is the same path it always was. The hit path
is now solved on its own by `hitRegion()`:

```js
const HIT_MIN_PX = 44;      // S5's floor
const HIT_PAD_PX = 2;       // the auditor fails under 43.5 and the engines disagree by ≈ 0.5 px
const HIT_REF_W  = 230;     // px — the narrowest the app DRAWS a figure (qa/fix-b3-wedges.mjs)
const HIT_MIN    = ((HIT_MIN_PX + HIT_PAD_PX) * VIEW.w) / HIT_REF_W;   // 80 viewBox units
```

* **Atomic wedge (level 0)** — a sector whose radius is the smallest that clears `HIT_MIN` in **both**
  directions (`HIT_MIN / min(unit box w, h)`), never smaller than the drawn wedge (a highlight must
  never reach past its own target), and capped by the room the viewBox has for it, so a wedge grows
  into the figure's **own** box rather than out over the card. Over every figure the app can build —
  the five shipped ones plus 360 generated fans from the six `T-fig-*` templates, **1273 atomic
  wedges** — the radius the box needs fits inside the viewBox in all but a handful of generated fans
  whose vertex sits near an edge; those get up to `HIT_SPILL = 24` vb of slack rather than ship a
  target 1 px under the floor.
* **Composite wedge (level k)** — still the ring outside everything more specific than it, but because
  atomic radii now differ per wedge, the ring's inner boundary is a **staircase** (one sub-band per
  angular run) instead of one circle. That is what keeps the rings disjoint *without* pushing every
  ring out to the widest of them: on F1, ∠AFC's ring stays exactly where it was (133.4 → 191.4) and only
  ∠BFD / ∠BFE, which sit over the enlarged ∠CFD / ∠AFE, move. The outer radius starts at the drawn one
  and grows (4 vb at a time) only while the region's box is short.
* **`lint()`** now measures the hit path the renderer actually emits (`w.hitBox`), defaults `widthPx` to
  `HIT_REF_W` instead of 343, and requires **both** sides to clear the floor. The old test was
  `Math.max(w, h) < minPx || w*h < minPx²` — an area escape hatch that passes 93 × 41 without blinking.
  That is how this shipped past a lint that was supposed to catch it.

`qa/fix-b3-wedges.mjs` (new) drives the 13 states through `qa/audit-states.mjs` in both engines, prints
every hit box under 44 × 44, and **fails if any host draws a figure narrower than `HIT_REF_W`** — so the
one measured constant in the fix cannot go stale silently.

## 4. The measurements after

`node qa/fix-b3-wedges.mjs` — the 13 states × {320, 375, 834, 1440, 1900} × chromium + webkit:

```
0 of 940 wedge hit boxes under 44x44
smallest hit dimension anywhere: 46.2 px
narrowest DRAWN figure: 230.8px — chromium 320x568 card-notation (F1)   (svg.js HIT_REF_W = 230)
```

**`node qa/layout-audit.mjs --only <the 13 states> --engine both --theme both`** (16 viewports, light +
dark, motion + reduced, 52 runs per engine): **0 findings, 0 blockers, 0 majors → PASS** — from 6+
majors on a single state before.

| state | fig drawn | min hit box, before → after |
|---|---|---|
| card-classify @ 1900 | 280 | 40.9 → **54.1** |
| card-classify @ 320 | 230.8 | 34.8 → **46.0** |
| card-strip (D5) @ 1900 | 280 | 41.1 → **54.1** |
| card-multipart (AH) @ 1900 | 280 | 41.9 → **54.1** |
| card-notation @ 375 | 230.8 | 33.8 → **44.6** |
| run-upgrade @ 375 | 230.8 | 33.8 → **44.6** |
| variant-fig-pairs @ 320 | 230.8 | 41.6 → **46.0** |
| mock-mid @ 834 | 650 | 67.5 → **89.2** |
| card-rootcase-cases (finding 14, `.is-linked`) @ 1900 | 280 | 40.9 → **54.1** |

F1's own wedges, viewBox units → px at a 230 px figure:

| wedge | lvl | drawn r | hit outer | hit box (vb) | px @ 230 |
|---|---|---|---|---|---|
| CFD | 0 | 133.4 | **182.5** | 182.5 × 80.0 | 104.9 × **46.0** |
| BFC | 0 | 133.4 | 133.4 | 119.9 × 133.4 | 68.9 × 76.7 |
| AFB | 0 | 133.4 | 133.4 | 133.4 × 133.4 | 76.7 × 76.7 |
| AFE | 0 | 133.4 | **182.5** | 182.5 × 80.0 | 104.9 × **46.0** |
| DFE | 0 | 133.4 | 133.4 | 253.2 × 133.4 | 145.6 × 76.7 |
| BFD | 1 | 191.4 | 206.5 | 206.5 × 206.5 | 118.7 × 118.7 |
| AFC | 1 | 191.4 | 191.4 *(unmoved)* | 363.4 × 191.4 | 208.9 × 110.1 |
| BFE | 1 | 191.4 | 206.5 | 206.5 × 297.0 | 118.7 × 170.8 |

Offline, over all 365 models (5 shipped + 360 generated): **0 wedges under 44 px at a 230 px figure,
`lint()` clean on every one.**

Behaviour re-checked by hit-testing real points in both engines (`#/card/ang-wu-1`, 1440):
inside ∠CFD → CFD · the newly enlarged ∠CFD area (r = 160) → CFD (the band no longer claims it) ·
r = 160 at 50° → the composite ∠BFD · r = 80 at 50° → BFC · r = 80 at 270° → DFE. Selecting a wedge
still highlights exactly the drawn sector (`b3-1440-light-sel.png`).

Screenshots read at 375 × 667 light + dark, 834 × 1112 dark, 1440 × 900 light (wedge selected),
1900 × 1200 light: the drawing is pixel-for-pixel what it was — which is the point, and
`tests/fix5-gen.test.mjs` now pins it as such.

## 5. Tests

`node --test` — **1305 pass, 0 fail.** Two tests were updated, both because they pin behaviour this
ticket deliberately changes:

* `tests/fix5-gen.test.mjs` "shipped figures render byte-identically" — the wedge hit `d` moved on
  purpose, so `PINNED` is re-pinned. It gained a second, stronger pin: `DRAWN` hashes the same render
  with every `.fig-wedge-hit` `d` deleted, and **restoring the old chord-rule hit paths reproduces the
  old hashes exactly** (verified: F1 3716098328355016, D5 6272278498943874, D7 129767291472064,
  AH 1607330075836753, F2 untouched) — so `DRAWN` is identical across the two engines and still guards
  the drawing byte for byte.
* `tests/card-r1.test.mjs` source pin — it asserted the chord rule delivers 44 px at 375. It still pins
  the four drawing constants, and now also pins `HIT_MIN_PX ≥ 44`, `HIT_PAD_PX ≥ 1`, `HIT_REF_W ≤ 238`
  and that `HIT_MIN` is computed from px → viewBox units rather than being a magic number.

`tests/gen.test.mjs` and `js/gen/figpairs.js` gate generated figures on `lint(model, {widthPx: 343})`;
the new geometry clears 44 px at 230 px, so it clears it at 343 by a wide margin and no generator is
starved (verified over 60 seeds × 6 templates).

## 6. Open — for the lead, NOT fixed here

**The wedge hit paths overhang the figure box, and they always did.** `.fig` is `overflow: visible`, and
the drawn level-1 rings already stand outside the viewBox: at `#/card/cls-01` (1900),
`document.elementFromPoint` 10 px **above** and 10 px **below** the `<svg>` returns `.fig-wedge-hit`. A
tap on the question text just above the figure selects ∠BFD. Measured overhang over all 365 models,
before → after this ticket:

```
OLD  n=1585  p50=0.0  p90=9.8   p99=81.0  max=85.0   over 24vb: 107   over 60vb: 36
NEW  n=1585  p50=0.0  p90=14.0  p99=81.0  max=109.0  over 24vb: 112   over 60vb: 39
```

i.e. this ticket does not meaningfully change it (median 0, p99 identical), but it does not fix it
either, and it is a real defect — the figure eats taps on whatever the layout puts next to it. It is out
of scope here because the only honest fix (clipping the hit paths to the figure box, in the path data,
not with `clip-path` — `getBoundingClientRect` ignores clipping, so `clip-path` would hide the loss from
the auditor) trades directly against the 44 px floor: room-capped rings cannot give a 26° wedge a 44 px
box in a 230 px figure. **Requests:** (1) a `figure-overhang` detector in `qa/layout-audit.mjs`
(elementFromPoint just outside `svg.fig` must not be a `.fig-wedge-hit`); (2) a decision from the layout
lane on `.card-figure`'s `max-height: 150px` at 320 × 568 — it throws away 21 % of the width the card
already gives the figure (293 px of element, 230.8 px of drawing), and every one of these targets scales
with that number.

**Poly figures.** `layoutPoly` builds a per-vertex fan, so poly wedges get the same treatment. They are
off by default (`opts.wedges ?? false`) and no shipped card turns them on, but wedges from adjacent
vertices of a small polygon can now overlap sooner than they did. If a `pairs` card is ever pointed at a
poly figure, measure it first.
