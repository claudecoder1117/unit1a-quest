# FIX5 — lane "gen", round 1: bug 2 (placement item 1 names a figure that does not exist)

## Root cause
`site/js/gen/notation.js` always prefixed the stem with `Points … are labelled in the figure.` (`figureLine()`)
but `assemble()` hard-coded `figure: null`. The placement's first cluster is `T-notation {kind:'ray'}`
(`screens/onboard.js`), so the first problem a student sees contradicted itself. Swept before the fix:
2000/2000 T-notation seeds claimed a figure and 0 had one. `T-vocab` (`vocab.js:163`, also `figure: null`) never
mentions a figure in any stem, prompt or option (0/2000 seeds), so it was left alone and is **not** version-bumped.

## The change
**Generator (`site/js/gen/notation.js`, templateVersion 1 → 2)**
- New `figureFor(rng, spec, points)`: builds a small `poly` figure from the item's own letters and gates it with
  `validate() = []`, `lint(m, {widthPx:343}) = []`, `accidentalSums() = []`, every stroke inside the viewBox,
  points ≥ 34 apart, no letter on another object's stroke, no two objects' strokes crossing (up to 60 re-rolls on
  a forked rng stream `notation-figure|<kind>|<letters>`, so the question text for a seed is unchanged).
- What is drawn: the named object exactly as the question describes it: ray AB as a ray starting at A with the
  arrowhead past B (it points left as often as right, 256/500), line AB with two arrowheads, segment/length AB
  plain, ∠ABC / m∠ABC as two rays from B, the plane through A, B, C as an unlettered outline with the three points
  inside and every other letter outside it, ≅ / = as both angles drawn with EQUAL spans. Every other letter goes
  OFF the named object, as a second line/ray/segment (random kind) or a lone point, so the named object has no
  second name (no ray AX for ray AB). Letters are drawn at 21 viewBox units.
- `read` items (mc “What does {ray AB} name?”) and a plane named by ONE letter need no picture: their stem is now
  just the question, with no mention of a figure. (Drawing the read item's object would give away the answer.)
- Also: a one-letter plane (P/Q/R/M/N) was not always one of the builder's letters (`part.letters = points`), so
  it could only be typed. The builder now offers it.
- Figure object: `{ id: 'G-not-<seedTag>-<kind>-<letters>', spec, rename:{}, labels:[], notToScale:false }`. The id
  includes kind and letters because `svg.render()` memoises by id (a forced-kind placement item and a Variant
  on the same seed must not share a cached SVG).

**Figure engine: ADDITIVE ONLY** (`site/js/figure/model.js`, `site/js/figure/svg.js`). There are four new
optional `poly` fields. No shipped or generated figure uses them, so their output is unchanged:
- `arrows: ['none'|'end'|'both', …]` parallel to `segments`: 'end' draws the chain as a ray from its first
  point (stroke runs 34 units past the last point to an arrowhead, class `fig-ray`), 'both' as a line (`fig-line`).
- `labelDirs: {A: deg}`: explicit letter direction (rotated/mirrored/renamed with the figure).
- `outline: [[x,y], …]`: an unlettered closed plane outline (`<g class="fig-planes"><path class="fig-plane">`),
  whose edges `lint()` treats as strokes; `validate()` accepts a poly with an outline and no segments.
- `letterSize: n` (10–30): bigger point letters (inline `style="font-size"`, gap scaled). See the deviation below.
- `describe()` names rays/lines/plane/lone points for these figures (aria: “Figure: ray UN; ray VE; point B”).
- Proof of no change: a one-off diff rendered every shipped figure (plain + rotated/mirrored) and 150 seeds of
  every other figure template with the git-HEAD engine and the new engine: **1060 renders + lints, 0 diffs**.
  `tests/fix5-gen.test.mjs` pins the render hashes of F1, F2, D5, D7 and AH.

**CSS:** `/* === fix5:gen r1 === */` at the end of `site/css/polish.css`: `.fig-plane` stroke style only.

## Tests
`tests/fix5-gen.test.mjs` (9 tests): 2000 unforced seeds plus 250 per forced kind (all 10 kinds) plus 400
placement seeds. A stem mentions "figure" only when `figure` is non-null. Only `read` and one-letter planes have
no figure. Every figure passes validate, lint at 343 px and accidental sums, and its drawn points equal the stem's
points. Each figure is checked against its answer: ray = chain [endpoint, through] with 'end'; line 'both';
seg/len 'none'; angle = two 'end' rays from the vertex with 20° < measure < 160°; plane = named points inside the
outline, extras outside, not collinear; ≅/= = equal measures. No other letter lies on the named object, and strokes
stay inside the viewBox. Grading still works with the figure on ctx (own build correct; reversed ray wrong + `ray-order`).
Also covered: T-vocab 2000 seeds never mention a figure, T-notation version is 2, the shipped-figure hashes, and
the optional-field validation and stroke kinds. `node --test` → **1263 pass, 0 fail** (the count includes other lanes' new tests).

## Evidence (all under `qa/screenshots/fix5-gen/`, git-ignored; driver `qa/fix5-gen-walk.mjs`, dev page `qa/fix5-gen-figures.html`)
Before:
- `before-s9-p-05-place-item1.png` (copy of the S9 scorecard shot) and `before-place-item1-light.png`: the stem says
  "labelled in the figure" and no figure is drawn. DOM probe: `figure:false`.
- `before-variant-ray.png`: same on a `#/variant/T-notation` card.

After (375×667):
- `final-place-item1-light.png`, `after-place-item1-light.png`, `after-place-item1-dark.png`: placement item 1 with the
  figure. DOM probe: its letters equal the stem's letters, `clipped:[]`, `over:[]`, no horizontal overflow.
- `after-grade-place1-correct.png`: placement item 1 answered by real taps (ray → Z → U) → "Correct", GOLD +29 XP.
- `after-grade-fix5-gen-a-correct.png`: Variant `fix5-gen-a` (plane TKV) built by taps → Correct.
- `after-grade-fix5-gen-b-wrong.png`: Variant `fix5-gen-b` answered ray YT for ray TY → wrong, "Endpoint first…".
- Dev page, 16 T-notation renders (all 9 figure kinds): `final-dev-a-light.png` (ray ×3, line), `after-dev-b-light.png`
  (line, seg, len, ang; shot before `letterSize`), `after2-dev-c-light.png` (ang, m, plane ×2), `final-dev-d-dark.png`
  (cong, eq ×2, ray). DOM report: 0 clipped, 0 overlapping letters, 0 validate/lint issues.
  `after-dev-v-light.png` has 8 T-vocab items (all four modes): no figure, no figure wording.

## Spec deviations / notes for other lanes
- **Engine extension instead of a new figure kind.** Optional `poly` fields meant no change to angle, pair or
  generic code paths, and the pre/post render diff confirms nothing moved.
- **`letterSize` exists because of another lane's fold fix.** `polish.css` (the `max-width:1023px and max-height:760px`
  block, run/card lane) caps non-pairs card figures at **150 px** tall on short phones. A 400×260 figure there is
  ≈ 0.58 px per unit, so the standard 15-unit letters would be ≈ 8.7 px. The mini-figures use 21 units
  (≈ 12 px). The same cap makes the expression labels on shipped figures (13 units, e.g. ang-10) ≈ 7.5 px on those
  phones. **Run/card lane: please check that.**
- `read` items and one-letter planes lost the figure sentence. The spec rule is "a variant whose question does not
  need a figure must not say 'in the figure'".
- Observed, not mine: `#/variant/T-notation?seed=…&kind=ray` did not force the kind in the browser. The card was a
  `cong` item, although `generate(…, {kind:'ray'})` in Node honours it. `resolveTemplate()` reads `query`, so the
  query probably doesn't reach `createCardView`'s `opts.query` (`screens/card.js`, card lane).
- T-vocab unchanged; no version bump (no stem or option ever claimed a figure).
