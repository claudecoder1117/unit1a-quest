# INTEGRATION — Wave 0 (T02 RNG/numparse/poly · T04 figure model/pairs/SVG)

Integrator pass after Wave 0. No agent failed; no ticket reported red tests. Nothing was re-implemented —
this pass verified, connected and recorded.

## 1. Tests

`cd /Users/oliver/Projects/unit1a-quest && node --test tests/` → **472 tests, 472 pass, 0 fail** (≈ 240 ms,
Node 26), both before and after the one content fix below. Files: `state` (T01), `misconceptions` (T06g),
`word-graders` + `strip` (T05), `numparse` + `poly` + `no-random` (T02), `pairs` (T04). Nothing was deleted
or skipped. `tests/index.js` (T01) is what makes the bare-directory form work on Node ≥ 21 — keep it, and do
not add `tests/index.test.mjs` (the runner would import every file twice).

## 2. Requests fulfilled / dispositioned

Wave-0 notes' "Requests" sections, item by item:

| from → to | request | disposition |
|---|---|---|
| T02 → T01/CI | keep `tests/index.js` (or switch the script to a glob) | kept; recorded here and in README-relevant docs |
| T02 → T05 | `mc.js:15` comment mentioning the forbidden call is fine (scanner strips comments) | verified: `no-random.test.mjs` scans all of `site/` and is clean |
| T02 → T03 / T06g / T07 | fixtures, tag catalogue, generator contract | future waves — no action possible now; all named exports exist |
| T04 → T06a | F1's ray C is 26° on the scan, not 31°; cls-01 / cls-03 quote 31° / 121° | **FIXED HERE** (see §4) |
| T04 → T06b, T07b, T08c, T09, T18 | figure specs to use, generation gate, wedge wiring, `element()` on the Card screen | future waves; every spec T04 pre-verified was re-checked here (§3) |
| T04 → T18 / integrator | "adopt the repo-root Playwright driver for `qa/figures.html`" | **DONE HERE**: `qa/shot.mjs` now has `--root` and `--eval` (§3) |
| T04 → T01/integrator | `site/css/figure.css` T04 block complete | confirmed; `index.html` already links all 7 stylesheets |
| T01 → integrator | "accept the 500 000-char saturated-save bound, or name caps to cut" | **DECISION: accept 500 K.** The S6 caps are product rules quoted in four places; 500 K packed is ≈ 1 MB UTF-16 against a 5 MB quota, and the bound is asserted by `state.test.mjs`. No ticket may raise a cap without re-running that test. |

No wiring was needed for the code itself: T02 and T04 are leaf modules (`rng`, `grader/normalize`,
`grader/poly`, `grader/pairs`, `figure/model`, `figure/svg`, `data/figures`) that the screens of waves 1+
import. `site/js/screens/index.js` is still an empty registry, which is correct — no screen ticket has landed.

## 3. Browser QA (what was loaded, looked at, and measured)

`qa/shot.mjs` gained two dev-only options (dev tooling under `qa/`, never served):
- `--root` serves the **repo root** instead of `site/`, so dev pages under `qa/` that import `../site/…`
  can be driven headlessly. This is the driver T04 asked T18 to adopt; it is now 4 lines in the existing tool
  instead of a second script.
- `--eval "<expr>"` prints the JSON value of an expression evaluated in the page (promises are awaited).
- A first argument starting with `/` is now a **path**; one starting with `#` is still a hash route.

Routes shot at 375 px (plus one at 1280) and read: `#/today`, `#/card/ang-10`, `#/settings` (dark),
`#/binder` (1280 × 800). All four render the T01 placeholder screens with the live header, **zero console
errors, zero failed requests, no horizontal overflow**, correct light/dark palettes.

```
node qa/shot.mjs "#/today"       /tmp/w0-today.png    --w 375
node qa/shot.mjs "#/card/ang-10" /tmp/w0-card.png     --w 375
node qa/shot.mjs "#/settings"    /tmp/w0-settings.png --w 375 --dark
node qa/shot.mjs "#/binder"      /tmp/w0-binder.png   --w 1280 --h 800
```

**Figures (the actual wave-0 deliverable, not reachable from any route yet):**

```
node qa/shot.mjs "/qa/figures.html" /tmp/w0-figures.png --w 375 --h 900 --root --full --eval "window.__figReport"
```
→ `errors: []`, `eval: []` (the page's own DOM audit: no clipped label, no label overlap, no wedge under
44 px), all ten cases rendered and eyeballed at 375 px: F1G, F1A (`−x + 84`, `2x² − 4x + 3` both inside the
viewBox), cls-01's 31° with the chip, F2 ± ticks, D5, D7, AH, the rotated/mirrored/relabelled variant and the
dark-paper card. Wedge-state colours in the F1G and D7 cards are that page's deliberate state demo
(`selected` / `ok` / `bad` / `linked`), not stray fills.

**Browser module smoke check** (these modules are Node-tested but nothing imports them in the browser yet, so
a browser-only parse regression — e.g. regex lookbehind on old iOS Safari — would otherwise stay invisible
until T09):
```
node qa/shot.mjs "#/today" /tmp/w0-modcheck.png --w 375 --eval "Promise.all([...23 module paths...].map(p=>import('./'+p).then(m=>p+' ok').catch(e=>p+' FAIL '+e.message)))"
```
→ all 23 site modules (every grader, `figure/*`, `rng`, `mathfmt`, every `data/*`) import cleanly in Chromium.
**Re-run this after any wave that touches `site/js` or `site/data`.**

**Card ↔ figure cross-check** (new, cheap, worth repeating each wave): every card carrying a `figure` spec was
resolved through T04's model — 9 cards (`not-03/04/05/06/09`, `cls-01..04`), all `validate() = []`,
`lint() = []`. Figure ids in card data all exist in `data/figures.js`.

**Publication policy (BUILD-POLICY §1) audit:** no `.png`/`.pdf`/`.html` under `site/` except `index.html`;
no `teacherKey` / `crop` identifier anywhere in `site/` or `tests/`; no external URL in any served file
(only the `www.w3.org` SVG namespace); no absolute paths; all 12 `content/*.png` scans confirmed git-ignored;
`git ls-files` tracks only `content/SOURCE.md` and `content/transcript.md` from `content/`. `site/` = 46 files, 596 KB.

## 4. The one defect fixed — cls-01 / cls-03 lost their "Not to scale" chip

`site/data/cards/m1.js` (T06a) built every F1 card with `notToScale: false`, because T06a assumed the drawing
had ray C at **31°**. T04 then modelled F1 from the scan, where ray C measures **≈ 26°** (∠BFC 64°, ∠BFE 116°,
∠AFC 154°). An explicit `notToScale: false` **overrides** the model's auto-detection, so cls-01 ("m∠CFD = 31°")
and cls-03 ("m∠BFE = 121°") would have shown a given measure that disagrees with the drawing by 5° with **no
chip** — a student checking with a protractor gets a different number and no explanation.

Fix (2 lines + the header comment, in T06a's file, integrator's call because that lane is closed):

```js
const F1 = (labels = []) => ({ id: 'F1', rename: {}, labels });   // was: …, notToScale: false
```

Auto-detection now decides per card: cls-01 and cls-03 → chip; the seven F1 cards with no numeric label
(`not-03/04/05/06/09`, cls-02, cls-04) → no chip, exactly as before. The header comment in `m1.js` was
corrected to the scan's geometry and now states that 31° / 59° / 121° / 149° are *given* data on a
not-to-scale drawing, with the drawn measures listed for any solution step that needs one. Every structural
fact those cards rely on is exact and unchanged (∠BFD = 90°, ∠AFD = 180°, A–F–D and E–F–C collinear,
∠AFE vertical to ∠CFD). No test pinned the old value; suite still 472/472.

## 5. Still open (carried forward, none blocking wave 1)

1. **T02 → T03:** a `roots` field typed `3 -1/2` (space-separated, no comma) parses as the single constant
   `3 − 1/2 = 5/2` and grades as a plain "wrong" instead of "one number per field". T03 must split on
   `/(\d)\s+(?=[-+−]?[\d.(])/` before parsing. (T02's own open issue; recorded so it is not lost.)
2. **cls-02 wording vs the drawing (T09/T06a, cosmetic).** The right-angle square on the scan sits in the
   **upper-left** (∠BFA); cls-02 says "the small square marks a right angle" and asks for ∠BFD. Both are 90°
   and the sentence is true, but a student may hunt for a square inside ∠BFD. If T09's Card screen makes this
   look odd, change the stem to "…the small square at F marks ∠BFA as a right angle" rather than moving the mark
   (the mark matches the packet).
3. **Save-size bound accepted at 500 K** (§2). Any cap change re-opens `state.test.mjs`.
4. T01's other open items, unchanged and owned by later tickets: no onboarding redirect (T14),
   `apple-touch-icon-180.png` not linked (T15), `markStreakDay()` provided but not yet called (T10/T13),
   `sw.js` not registered (T15).
5. `lint()` uses estimated text metrics; `qa/figures.html` re-measures with real fonts. Re-run the figures
   shot if the font stack ever changes (T15's self-hosted subsetting would be such a change).
6. Screens registry is empty — every route is a placeholder. Expected at this point; wave 1 changes it.

## 6. Commands the next integrator should run first

```sh
cd /Users/oliver/Projects/unit1a-quest
node --test tests/                                   # must be 0 fail
node qa/shot.mjs "#/today" /tmp/today.png --w 375    # console errors must be []
node qa/shot.mjs "/qa/figures.html" /tmp/figs.png --w 375 --h 900 --root --full --eval "window.__figReport"
```
