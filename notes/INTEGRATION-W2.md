# INTEGRATION — Wave 2 (T06f manifest/rarity · T07a·b·c generators · T08a·b·c·d widgets)

Integrator pass after Wave 2. **No agent failed**, so nothing had to be re-implemented from a ticket's S8
text. T08c and T08d both reported red tests; both named the same two causes and both were right at the time
— `site/js/gen/figsystem.js`'s `tag = \`…\`` template literal read as a misconception tag, and
`tests/gen.test.mjs` failing to load against a mid-flight `data/templates.js`. **Their owners (T07b, T07a)
landed both fixes before hand-off**: the suite was already green when this pass started (723/723). This pass
therefore did what the wave could not do from inside a lane — closed the cross-lane requests, joined the
generator half of S3 to the widget half, and put the joins under test.

## 1. Tests

```
cd /Users/oliver/Projects/unit1a-quest && node --test tests/
```
→ **729 tests, 729 pass, 0 fail** (55 suites, ≈ 45 s, Node 26). 723 of those existed at the start of this
pass and were green then; the 6 new ones are `tests/integration-w2.test.mjs` (§4). No test was deleted,
skipped or weakened, and no test file owned by another ticket was edited.

`tests/gen.test.mjs` is ≈ 43 s of that on its own (21 templates × 5 000 seeds — T07a's harness). Everything
else runs in well under a second.

## 2. Requests fulfilled / dispositioned

| from → to | request | disposition |
|---|---|---|
| T08c, T06f → T07b | `js/gen/figsystem.js:175` — rename the `tag` local that the misconception scanner reads as a tag | **already fixed by T07b** (`figKey`, passed as `buildFigure({… tag: figKey})`; a non-literal, which the scanner ignores). `misconceptions.test.mjs` green |
| T08d → T07a/T07c | `gen.test.mjs` failed to load (`templateById` missing) + the `csquad.js` `'zero-angle'` tag | **already fixed in-lane**; both files load and scan clean |
| T08b, T08d → T08a | `mountPart`'s placeholder handle forwards only the standard contract, so a widget extra is missing on a lazily mounted part | **DONE HERE** — the placeholder is now a `Proxy`; §3.1 |
| T08b, T08d → T08a | screens are told to `await ready` from `js/widgets/index.js`, but no `ready` was exported | **DONE HERE** — `ready` + `loadAll()`; §3.1 |
| T08d → T08a | `handle()` spreads `impl`, so a widget cannot expose a live getter | **DONE HERE** — descriptors, not spread; §3.2 |
| T08c → T08a | delete the three `.w-pairs .w-msg[data-state]` colour rules if T08a's block covers them | **DONE HERE** — it does, and `--warn` ≡ `--almost` in all three themes; §3.3 |
| T08c → whoever owns `site/dev-widgets.html` | a dev page inside the deployed artifact | **already resolved**: T08a moved it to `qa/widgets.html`. `site/` contains exactly one HTML file (`index.html`) — verified, and `coverage.test.mjs`'s publication check is green |
| T08b → T08a | `.w-key { flex: 1 1 auto }` stretches a wrapped key; consider `0 1 auto` globally | **ADJUDICATED: no change**; §5.1 |
| T07b → T07a | keep the two `T07b:` one-liners in `gen/contract.js` (the `i` flag on `ID_RE`, `system` accepted without a `canonical`) | **kept** — both are load-bearing for `T-fig-xlines-L/Q`, `T-fig-bisect-L/Q` and `doc-07`'s system setup; `gen.test.mjs` covers both |
| T07b → T07a | `answerFor()` has no `strip`/`pairs` case; `checkAnswers()` passes no `ctx.model` | **PART DONE / PART DEFERRED**; §5.2 |
| T06f → T13, T11, T09, T10 · T07a/b/c → T09, T10, T11, T12, T13, T16 · T08a/b/c/d → T09, T13 | the Wave-3 screen contracts (rarity inputs, `ctx.card`/`ctx.seed`/`ctx.roots`/`ctx.figureEl`, `item.figure.spec` vs `figures.js` ids, pips, skip semantics) | **future waves.** Every API they name exists and is exercised by `tests/integration-w2.test.mjs` or the ticket's own tests. §6 is the checklist T09 should read first |
| T07b, T08a → T15 | new files for the `sw.js` precache list | **noted for T15**; §6. `sw.js` does not exist yet |
| T06f, T07c, T08d → T17 | consolidation (fold `notes/sweep-w1.mjs`, hoist `pickN`, one `gen(seed, params)` shape, `cleanMsg()` into `base.js`) | **left for T17** — all four are tidy-ups inside green code |

## 3. Changes made by this pass (6 files)

### 3.1 `site/js/widgets/index.js` (T08a's file — integrator wiring, BUILD-POLICY §2)
Two additions, both requested by T08b **and** T08d, neither of which could be made from their lanes:

```js
export function loadAll()      // → Promise<Map type→mount>: import every lazy widget
export const ready             // a LAZY THENABLE: `await ready` loads them, importing does not
```
`ready` is deliberately not `= loadAll()` (the grader registry's eager shape). Importing the widget
registry must stay cheap — five static modules — because that laziness is what let T08b/T08c/T08d ship
against a registry they did not own. A thenable gives the screens the documented spelling
(`await ready`) without paying for it at import.

`mountPart`'s placeholder handle is now wrapped in a `Proxy`. Before, a part whose widget was still
loading answered only the seven contract methods, so `w.stage()`, `w.progress()`, `w.preview()`,
`w.split()`, `w.openSecond()` … were `undefined` — exactly the extras T08b and T08d document. Now:
anything outside the contract forwards to the real widget once it lands (bound), a short allowlist of
known extras (`EARLY_EXTRAS`) is callable before that and answers `undefined`, and every other name
stays `undefined` so feature detection (`if (w.openSecond)`) still means something.

### 3.2 `site/js/widgets/base.js` (T08a's file) — `handle()` copies descriptors
```js
return Object.defineProperties(base, Object.getOwnPropertyDescriptors(Object(impl)));
```
notes/T08d.md request (b): the spread froze a getter's value at mount time, so widgets had to expose
`stage()`/`progress()` as functions. Both spellings now work; every existing widget is unaffected
(a plain method is a plain descriptor). Covered by the last test in `integration-w2.test.mjs`.

### 3.3 `site/css/widgets.css` (T08c's block) — three rules deleted at T08c's own request
`.w-pairs .w-msg[data-state="ok"|"bad"|"almost"]` were scoped copies written while T08a's block did not
exist. T08a's block styles the same three states for every widget, lands later in the file, and
`--warn` and `--almost` are the same value in light, dark and forced-dark — so the deletion is a no-op
on screen and one less place to keep in sync. The layout half of the T08c block (`.w-pairs .w-msg`
flex/size/muted colour) stays: it is more specific and still wins.

### 3.4 `qa/widgets.html` (dev tooling, never served) — now mounts **every** part type
The page was written while only T08a's widgets existed, so it printed "T08b/T08d widget, not this
ticket" over a dashed box for everything else. All four widget tickets have landed, so it now mounts
whatever the registry resolves, across eleven cards covering all 17 part types in the bank:
`ang-10, ang-05, doc-07, wp-10, ang-wu-1, fac-16, voc-01, def-10, not-03, cls-01, fact-01`.
`?mine=1` restores the T08a-only view; `?ids=…`, `?demo=`, `?kb=` are unchanged. `ctx` now also carries
`figure`, `seed`, `mode` and `settings`, which are the keys T08c and T08d read.
This is the wave's integration proof — see §4.

### 3.5 `.gitignore` + a stray file
`/*.png` added (repo-root screenshots — `qa/shot.mjs`'s default output path) and the stray `shot.png`
left at the root by an earlier lane deleted, so `git add -A` cannot sweep a QA screenshot into the repo.
Nothing under `site/` is affected; BUILD-POLICY §1 is unchanged and still green in `coverage.test.mjs`.

### 3.6 `tests/integration-w2.test.mjs` (new, owned by the integrator) — §4.

## 4. What was actually verified (not just asserted)

**Browser, `node qa/shot.mjs`, 375 px, light and dark — four routes plus both dev pages, zero console
errors, zero `requestfailed`, no horizontal overflow anywhere:**

| route | result |
|---|---|
| `#/today` (`/tmp/w2-today.png`) | shell, header rings, T− chip, placeholder + route list — clean |
| `#/card/ang-10` (`/tmp/w2-card.png`) | route params render; T09's screen still a placeholder, as expected |
| `#/binder` `--dark` (`/tmp/w2-binder.png`) | dark theme clean |
| `/qa/figures.html` (`/tmp/w2-figures.png`) | T04 figures still `valid · lint clean` after the CSS edit |
| `/qa/widgets.html` (`/tmp/w2-widgets-all.png`) | **19 widget instances across 11 cards, all four tickets, mounted together** — types reported by `__t08a.report()`: `equation roots equation roots strip equation multi equation ratio pairs factored mc term termmatch cloze notation classify cloze asn`; `smallTargets: []` (nothing under 44 px), `horizontalOverflow: false` |
| `/qa/widgets.html?ids=ang-wu-1,voc-01` (`/tmp/w2-pairs.png`) | the pairs widget draws figure F1 (rename A→G), 8 angle pills, typed field + Add, "0 of 3 pairs found" / Undo; the mc widget renders voc-01's four options — read the PNGs, both correct |

**Node.** All 18 widget modules import cleanly outside a browser and expose `mount` (`missing` is empty),
which is what makes the lazy registry safe.

**`tests/integration-w2.test.mjs` — 6 tests over the seams no ticket could test alone:**
1. the registry is lazy (the 8 static types, no lazy module imported at load) and `ready`/`loadAll` exist;
2. `await ready` loads all ten lazy modules and leaves `missing` empty — a widget that loses its `mount`
   export or throws at import now fails the suite instead of failing silently at run time;
3. **every part type used by the card bank has a widget** (17 types, T06* → T08*);
4. **every part type the 21 generator templates emit has a widget** (T07a/b/c → T08a/b/c/d);
5. `loadFor` resolves a real card through `composeParts` (ang-10: the setup slot *and* the rootcase group)
   and `pipsForCard(ang-10) === 4`;
6. `handle()` fills the contract, lets a widget override it, and preserves a getter (§3.2).

## 5. Adjudications

**5.1 `.w-key { flex: 1 1 auto }` stays (T08b → T08a).** T08b is right that a key which wraps onto a
second line stretches — but T08a's rule already caps it at `max-width: 88px`, so the worst case is an
88 px key, not "half the row". Changing the global would restyle every key row in the app (num, ratio,
rootcase, strip, cloze) to settle a bounded cosmetic difference, in a wave where no screen renders a key
row for real yet. T08b's `.w-factored .w-key, .w-equation .w-key { flex: 0 1 auto }` override is kept as
written. **T18 owns the final call** once the Card screen is on screen at 375 px.

**5.2 `answerFor()` / `checkAnswers()` (T07b → T07a).** Half of this is already true: `answerFor()`'s
`default` branch returns `part.answer`, which is exactly the `strip` case asked for — no change needed.
The other half (`checkAnswers()` passing `ctx.model` so `options.gradeCheck` works for figure templates)
is **deferred, not refused**: `contract.js` cannot import `templates.js`'s `modelOf` (that is a cycle),
so it would have to resolve `item.figure` itself, and the pairs grader already falls back to
`part.figure` — which is how T07b's shipped items pass today. It is an ergonomics improvement inside a
green harness, with a real chance of turning a 20 000-seed sweep red for a bad reason. **T17** should do
it deliberately, with `figure/model.js` imported directly into `contract.js`.

**5.3 `ang-10`'s stem reads "identify: x, m< CFD, m<DFE".** Not a bug — the worksheet types `m<` for
`m∠`, and the card carries a `note` saying so (T06b). Left verbatim; the `note` is what the Card screen
should surface.

**5.4 `ang-wu-*` stems say "line AD" while the figure labels the left point G.** Also not a bug and also
documented on the card: `content/SOURCE.md` records that the printed warm-up figure uses G while the
sentence and the teacher's key use A. Fidelity wins; the note explains it to the student.

## 6. Still open (for the waves that own it)

- **T09 (`screens/card.js`) — the checklist this wave wrote for you.** `await ready` (graders) **and**
  `await loadFor(composeParts(card.parts))` (widgets) before the first mount; one `ctx` per part, the same
  object to `mount()` and `grade()`, with `card` (the card *or* the generated item), the same `seed`, and
  `roots: w.found()` when grading a `reject`; `figureEl` = the rendered `<svg>` if the screen draws the
  figure; `ctx.shortcuts = false` on any mounted-but-inactive widget; `pipsForCard(card.parts)` for the pip
  row; `setupTried = true` on any non-skipped setup submit (S4 Gold); a skipped setup records nothing; do
  not render the equation slot's verdict twice. A **Variant**'s figure is `item.figure.spec` + `item.figure`
  as opts, never a `data/figures.js` id.
- **T15 (`sw.js`) precache list** — the files added this wave that do not exist in any list yet:
  `js/widgets/{base,num,multi,rootcase,ratio,index,factored,equation,pairs,strip,asn,mc,notation,term,termmatch,cloze,classify,shortcuts}.js`,
  `js/gen/*.js` (16 files), `data/templates.js`, `data/source-manifest.js`, `js/rarity.js`.
- **T13 (`data/blueprint.js`)** — export `eligible(id, letter)` or `candidates(letter, cards)` and
  `coverage.test.mjs` starts checking the Mock blueprint against the manifest automatically (T06f).
- **T17** — §5.2, plus the four consolidation items in the table above.
- **T18** — §5.1, and the two longest generated items (`T-classify`, six parts; `T-quad-ctx`, four) at
  375 px with the keypad open. `qa/widgets.html` + `window.__t08a.report()` is the harness; it now covers
  every part type, so it is worth folding into the T18 driver rather than rebuilding.
- **Not done on purpose:** `app.js` does *not* warm the widget registry at boot the way it warms the
  graders. Screens know their parts and should call `loadFor(parts)`; warming all ten lazy modules on the
  Settings screen would spend the first paint for nothing. If T09/T16 find the placeholder ever visible,
  one line in `boot()` (`import('./widgets/index.js').then(m => m.ready)`) is the fix.
