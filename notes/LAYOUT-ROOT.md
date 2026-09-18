# LAYOUT-ROOT — "the question is going vertical"

Ticket LAYOUT-ROOT. What the student saw, why it happened everywhere, what changed, and the
conventions the rest of the app has to follow so it cannot come back.

Owned files: `site/css/{theme,base,screens,polish}.css`, `site/js/screens/card.js`,
`tests/layout-root.test.mjs`, `qa/layout-root.mjs`.

---

## 1. The report

> "dude what is this garbage? the question is going vertical and is hard to read. make sure to find
> all similar mistakes and make sure the app is perfect."

Safari, ~1900×1200, the live site, onboarding's PLACEMENT (`#/onboard?step=3`), item 1. The question
printed **one letter per line**, with the run chrome and the Scratch heading piled on each other.
Reproduced headlessly in **both** engines before touching anything
(`qa/screenshots/layout-root/before-chromium-1900-light-place-1.png`).

## 2. Root cause

Two faults, one on top of the other.

**(a) Every responsive rule was keyed to the VIEWPORT, but components are hosted at widths that have
nothing to do with the viewport.** The card engine (`createCardView`) is mounted into seven different
hosts:

| host | element | width at a 1900 px viewport (before) |
|---|---|---|
| `#/card`, `#/variant` | `#view` | 1024 |
| a run (`#/run/page`, drill, jump, baseline…) | `.run-stage` | 1024 — *only because of the W5 hack* |
| onboarding placement | `.ob-run-stage` inside `.screen.ob-run` | **680** |
| Boss | `.boss-stage` | 1024 |
| Night mini-mock | `.ob-run-stage` inside `.screen.ob-run.nb-mini` | 680 |
| onboarding step-2 sandbox | `.ob-sandbox` inside `.screen.ob-step` | 680 |
| mock report retry | `.report-inline-stage` | 1024 |

`screens.css` then said `@media (min-width: 1024px) { .card-screen { grid-template-columns:
minmax(0, var(--col)) var(--rail) } }` — 680 + 24 + 320 = **1024 px of tracks laid out inside 680 px**.
The content column got 336, the rail kept its fixed 320. `grep -rn "container-type|@container"
site/css` returned **nothing**: the app had no container queries at all.

**(b) Every text track had a 0 px floor.** With the paper at 336 px, `polish.css`'s
`@media (min-width: 1024px) { .card-paper:has(> .card-figure) { grid-template-columns: minmax(0, 1fr)
minmax(0, 280px) } }` gave the figure its 250 px min-content and the **stem track resolved to 0 px**.
A 0-wide block with `overflow-wrap: anywhere` is exactly one letter per line.

Wave 5 had already met this bug and patched **one host**
(`.run-screen:has(> .run-stage > .card-screen) { max-width: none }`), which is why `#/run/page`
looked fine and the placement did not.

### Measured, before → after (`node qa/layout-root.mjs`, chromium **and** webkit, identical)

| route | viewport | | `.card-screen` | `.card-paper` | paper tracks | stem px | stem ch |
|---|---|---|---|---|---|---|---|
| placement `#/onboard?step=3` item 1 | 1024 | **before** | 680 | 336 | `0px 250px` | **0** | **0** |
| placement `#/onboard?step=3` item 1 | 1024 | after | 992 | 648 | `282px 280px` | 282 | 26.4 |
| placement `#/onboard?step=3` item 1 | 1900 | **before** | 680 | 336 | `0px 250px` | **0** | **0** |
| placement `#/onboard?step=3` item 1 | 1900 | after | 1024 | 680 | `314px 280px` | 314 | 29.3 |
| step-2 sandbox `#/onboard?step=2` | 1900 | **before** | 680 | 336 | — (no figure) | 270 | 25.2 |
| step-2 sandbox `#/onboard?step=2` | 1900 | after | 680 | 680 | — | 614 | 57.4 |
| `#/run/page` item 1 (the one host W5 had hacked) | 1900 | before = after | 1024 | 680 | `314px 280px` | 314 | 29.3 |

The sandbox row is the one to keep: it has no figure, so the stem never hit 0 ch and no invariant
would have caught it — but the card was still laying out a desktop rail beside a 336 px paper inside
a 680 px column. `qa/layout-root.mjs` now asserts the rail only appears on a ≥ 900 px card.

The placement now measures *exactly* what `#/run/page` measures — which is the point: the same
component in two hosts should look the same.

Second defect, only visible scrolled: the card's rail is `position: sticky; top: header + 16` = 72 px,
but a run screen adds its **own** sticky band under the app header (placement head parks at 56–102 px,
Boss head at 56–109 px). The "Scratch" heading sat behind it for the whole scroll — permanently
hidden, not merely scrolled past. That is the "overlapping" half of the report.

---

## 3. The conventions (read this before adding a responsive rule)

### @container or @media?

> **A component that can be hosted at a width unrelated to the viewport queries its OWN width.
> @media is only for decisions that really are about the device.**

@media keeps: the shell's own `max-width`, `env(safe-area-inset-*)`, viewport **height**,
`orientation`, `pointer`, `prefers-reduced-motion`, `prefers-color-scheme`, `print`. Everything that
decides a component's columns, areas or track sizes is a container query.

### The containers

| name | element | what queries it |
|---|---|---|
| `cardhost` | `.card-host` — created by `card.js` around every card mount | the card's rail, Scratch's collapse, the landscape split |
| `paper` | `.card-stage` | the paper's stem \| figure split, the figure's cap |
| `answers` | `.card-parts`, `.mock-parts` | `.w-fields`, `.w-pairs-cols`, the narrow-column widget rules |
| `run` | `.run-screen` | the Page Summary (`.sum-stats`, `.sum-bar`) |
| `stats` | `.screen.stats` | `.st-bars li`, `.st-skills li`, `.st-errors li` |
| `report` | `.report-screen` | `.report-split`, `.report-actions` |
| `binder` | `.screen.binder` | reserved for the binder grid |

**A container cannot query itself.** That is the whole reason `.card-host` exists: the element whose
columns change (`.card-screen`) can never be the container, so `card.js` wraps every mount in a
`div.card-host` that carries nothing but `container-type` (and removes it in `destroy()`).

The **answer column is not the host width** — with the rail on it is `host − 344`. That is why
`.card-parts` is its own container; querying `cardhost` for `.w-fields` would have been the same bug
one level down.

### Thresholds, and why each number

| query | threshold | arithmetic |
|---|---|---|
| `cardhost` → rail | **960 px** | 616 content + 24 gap + 320 rail. At `#/card` and `#/run` a 1024 px viewport gives the host 992 px, so S5's "≥ 1024 px: right rail" is preserved exactly. |
| `paper` → stem \| figure | **600 px** | 18 ch floor (≈ 193) + 20 gap + 280 figure + 64 paper padding = 557, with headroom. |
| `paper` → pairs stem \| figure | **640 px** | the figure IS the answer surface, so it keeps 340 px: 193 + 20 + 340 + 64 = 617. |
| `answers` → two fields | **520 px** | unchanged from the old viewport rule, now measured on the right box. |
| `answers` → pairs list beside the figure | **640 px** | unchanged number, right box. |
| `stats` → wide rows | **640 px** | 190 name + 108 bar + 46 val + 200 meta + 64 drill + 4×8 gap. *(Was "720 px — unchanged number, right box", and that was the bug: `.screen` caps this container at `--col` = 680 px, so a 720 px threshold could never match and the wide Stats layout was dead. Re-derived by `fix:stats r2`; see notes/FIX-stats-r2.md. A number ported from an @media rule must be re-derived for the new box — the viewport was 40 px wider than the column it decided.)* |

### Every text track has a floor

`minmax(0, …)` and a bare `1fr` are banned on any column that holds words. The idiom is
`minmax(min(100%, N ch), 1fr)` — `min(100%, …)` can never be wider than the grid, so a floor can
never cause overflow — or a plain `minmax(18ch, 1fr)` inside a container query whose threshold
already guarantees the room. Below the threshold the grid is one column; **the figure drops below
the stem, the stem is never squeezed.** `tests/layout-root.test.mjs` lints for this.

### One token owns the sticky stack

`--stack-top` (theme.css) = the bottom edge of every sticky band above the content; default
`var(--header-h)`. Anything that sticks *inside* the content parks at `calc(var(--stack-top) + 16px)`
— the card's rail, Home's skills rail, the Mock's question map. A screen that adds its own band
raises the token (polish.css §5b). Measured heads at 375/1280/1900:

| band | height | `--stack-top` |
|---|---|---|
| `.ob-run-head[data-compact="true"]` (placement) | 44–46 | `header + 52` |
| `.ob-run-head` full (night, JUMP) | 106–108 | `header + 116` |
| `.boss-head` | 53 | `header + 60` |
| `.mock-bar` | ≈ 50 | `header + 56` (was a hard-coded `header + 72` on the rail) |
| `.run-head` | static at rail width | adds no band |

The constants carry ~6 px of headroom **and** `qa/layout-root.mjs` asserts, scrolled, that no two
`position: sticky` elements ever share pixels — so a head that grows fails the check instead of
quietly hiding text.

### Documented exceptions — where @media is still right

* **`.with-rail`** (Home, the Mock shell) and **`.mock-main`**. Both are the *screen root*, always the
  top-level child of `#view`, so `#view`'s width already is a viewport-derived width; and a container
  cannot query itself. More importantly `.mock-main` hosts `.mock-map`, which is `position: fixed`
  below 1024 px, and `.mock-screen` hosts `.mock-dialog` — `container-type: inline-size` applies
  **layout containment**, which would make them the containing block and glue those overlays to the
  column instead of the viewport. Both keep `@media` and both gained a ch floor.
* **`#view` and `body`** — same reason, plus `.bnd-pop`, `.levelup`, `.t11-toasts`, `.sw-pill`.
  (Those three are appended to `<body>`, which is why the containers that *do* exist are safe.)
* **`#dock`** is viewport chrome and sits outside every card container, so `.card-dock-hint`'s
  `@media (min-width: 1024px)` stays. Consequence, cosmetic and known: a card hosted narrow inside a
  wide viewport (only the step-2 sandbox today) shows its Hint in the ladder at the foot of the card
  rather than in the dock.
* Rules that only tighten **padding, gaps and figure heights on a short phone**
  (`@media (max-width: 1023px) and (max-height: 760px)`, the landscape block) stay on `@media`: the
  height half is genuinely about the device, and none of them can collapse a track. The landscape
  two-column split is now additionally gated on `@container cardhost (min-width: 520px)`.

### Checklist for the next responsive rule

1. Can this component be mounted anywhere but directly in `#view`? → `@container`.
2. Does the rule set `grid-template-columns` / `grid-template-areas`? → every text track needs a floor.
3. Is the box you are measuring the host, or the column inside it? (`.card-parts` ≠ `.card-host`.)
4. Adding a container? Check nothing `position: fixed` lives inside it.
5. Adding a sticky band? Raise `--stack-top` on that screen.
6. Run `node qa/layout-root.mjs` — both engines, ten widths — before you call it done.

---

## 4. What changed

**`site/js/screens/card.js`** — every mount is wrapped in `div.card-host` (the query container);
`destroy()` removes it. No other change; no grading, XP, plan or save logic touched.

**`site/css/theme.css`** — new `--stack-top` token.

**`site/css/base.css`** — `.with-rail`'s content track gained a ch floor; `.with-rail > .rail` sticks
at `--stack-top`.

**`site/css/screens.css`** —
* `.card-screen`'s **default** grid-template-areas is now the narrow-host order (head · stage · parts ·
  foot · result · solution · side), so a card that never matches a container query still puts the
  answer boxes under the paper and Scratch last.
* the rail template moved from `@media (min-width: 1024px)` to `@container cardhost (min-width: 960px)`
  and its content track gained a floor.
* `.card-figure`'s 460 px cap moved to `@container paper (min-width: 600px)`.
* Stats rows, the Summary and the Report moved to `@container stats / run / report`, all with floors.
* `.mock-main`, `.sh-fixed`, `.st-skills li`, `.home-today` gained floors.
* `.mock-main > .rail` and `.card-side` stick at `--stack-top`.

**`site/css/polish.css`** — the W4/W5 one-host hack is **deleted**; a new `/* === LAYOUT-ROOT === */`
block at the end of the file carries the containers, the general host rule
`.screen:has(.card-screen):not(.ob-step) { max-width: none }`, the card/paper/answers container rules
(including the ones that neutralise the legacy `@media (min-width: 1024px)` rules other lanes own),
the sticky-stack offsets and the remaining track floors.

### Deliberate, visible changes beyond the bug

* **Placement, Boss, night mini-mock and the mock-report retry now get the full shell width** at
  ≥ 1024 px, with the 320 px rail — i.e. they look like `#/card` and `#/run/page`, which they always
  should have.
* **The step-2 sandbox stays in the 680 px prose column** (it is a demo inside prose) and the card now
  lays *itself* out for 680 px: one column, Scratch collapsed behind its 44 px toggle.
* **Tablet (768–959 px): the paper is now two columns** (stem ≈ 314 px, figure 280 px) where it used
  to stack. The paper's own width says there is room, so it takes it; the card stays one column
  because the host is under 960. Verified at 768 and 834 in both themes.
* **The paper's two-column form uses named areas with a filler row.** Auto-placement used to drop the
  figure into the row *after* the note — stem top-left, note bottom-left, figure two rows down on the
  right, a quarter of the paper blank — and without the filler row the figure's height pushed the note
  54 px off the bottom of the stem. Now `"stem fig" / "note fig" / "pad fig"`: the note hugs the stem
  (10 px) and the slack lands in `pad`. ang-10's paper at 834: **340 px tall → 224 px.**

---

## 5. How it is verified

`node qa/layout-root.mjs [--engines chromium,webkit] [--widths …] [--routes …] [--shots dir --tag t]`

Serves `site/` itself, drives **20 states** — `#/card/ang-10`, `wp-01`, `ang-wu-1` (pairs),
`doc-05` (strip), `#/run/page` item 1, `#/onboard?step=3` placement item 1, `#/onboard?step=2`
sandbox, `#/boss/B4` mid-run, `#/mock` mid-item, plus Home, Binder, Stats, the run summary, the Mock
rules, the placement summary, Night, Settings, the cheat sheet, BLITZ and the Boss intro — at
**320 / 375 / 390 / 768 / 834 / 1024 / 1280 / 1440 / 1900 / 2560** in **chromium and webkit**, and
asserts per state:

* the stem is **≥ 18 ch** wide (measured in the stem's own font, via a `10ch` probe span);
* **no grid track resolves to 0 px** on any of 21 text-bearing grids;
* **no text is occluded** by a painting element (sticky app/screen chrome and non-painting SVG hit
  bands are excluded — they hide nothing);
* **no two in-flow siblings of a layout grid share pixels**;
* **no two `position: sticky` elements share pixels while scrolled** (the sharp version of the
  "overlapping" report: pinned content hidden for the whole scroll, not merely scrolled past);
* **no document horizontal overflow**;
* the card **only spends 320 px on a rail when its own box is ≥ 900 px** — a card showing the rail at
  680 px has a 336 px paper, narrower than a 375 px phone, which is exactly the configuration that
  collapsed the stem;
* the **paper is never narrower than a phone** while its card is wider;
* the **first answer control sits above the dock**;
* the screen actually **rendered** (each state names a selector that must exist, so a blank page can
  never pass).

It prints a measurement table and exits non-zero on any failure. `--shots` writes one screenshot per
breakpoint class (375 / 834 / 1280 / 1900) in **both themes** (304 PNGs, read during the fix).

**Final run: 20 states × 10 widths × 2 engines = 400 measurements, `ALL PASS`, 0 failures**
(`qa/screenshots/layout-root/after-full.txt`). Chromium and webkit agree to the pixel on every
layout number; only the `ch` conversion differs (webkit's `0` glyph is ~4 % wider), which is why the
floors are expressed in `ch` and the assertion is `≥ 18ch` rather than a pixel count.

**Negative controls** — a check that cannot fail its own defect is worthless. All three were run:

| what was un-fixed | what the check said |
|---|---|
| `--stack-top` override removed from `.ob-run` | `sticky bands collide (scrolled): header.ob-run-head × div.card-side by 320,30` |
| the rail put back behind `@media (min-width: 1024px)` | `#/onboard?step=2` sandbox: `rail at 680px card (needs 960): 336px 320px` — and the two static lints fail |
| the whole fix (the before-run) | `stem 0ch < 18ch \| 0px track: .card-paper [0px 250px] \| first control below dock` |

The middle one matters most: the general host rule alone makes today's hosts wide enough that the old
viewport rule *happens* to be right again. The container query is what keeps the **680 px** sandbox
host correct — and what will keep the next host correct.

`tests/layout-root.test.mjs` (10 tests, no browser except the last) pins the conventions statically —
containers exist and are queried, `card.js` still wraps and unwraps, the rail is behind `@container
cardhost`, no `min-width` `@media` has the last word on a re-hostable component's columns, the retired
hack is gone and the general host rule does not require a direct child, the floors are present, the
paper's areas span the note, `--stack-top` owns every inner sticky offset, and nothing that hosts a
`position: fixed` overlay is a container. The last test runs `qa/layout-root.mjs` at 1900 px and skips
when no Playwright browser is installed.

`node --test`: **1304 tests, 1300 pass, 0 fail, 4 skipped** (1294 before this ticket + 10).

---

## 6. Requests for other owners

* **widgets.css (T08a/T08c owner):** `@media (min-width: 640px) .w-pairs.has-fig .w-pairs-cols` (L211)
  and `@media (min-width: 520px) .w-fields` (L307) are still viewport-keyed. They are *neutralised*
  from the LAYOUT-ROOT block (`@container answers`, both directions, later in the cascade), but the
  honest fix is to move them into `@container answers` in widgets.css and delete the @media pair.
* ~~**polish.css `binder r2` owner:** `@media (min-width: 720px) .st-skills li` (L402) is likewise
  neutralised by `@container stats` at the end of the file; fold it in when you next touch that block.~~
  **DONE** by `fix:stats r2`: both of that block's viewport-keyed stats @media rules (`min-width: 720px`
  and `max-width: 719px`) are deleted and every declaration they carried now lives in §5c's
  `@container stats` branches. `tests/fix-stats.test.mjs` fails if a Stats row template ever goes back
  behind a width @media.
* **mock.js owner:** if `.mock-dialog` and `.mock-map` were appended to `<body>` (like `.bnd-pop` and
  `.levelup` already are), `.mock-screen` and `.mock-main` could become containers and the Mock would
  stop being an exception to the rule above.
* **card.js owner:** `.card-dock-hint` can only become container-driven if the dock learns the card's
  layout state — a `data-rail` attribute written from a `ResizeObserver` on `.card-host` would do it.
  Left out on purpose: it is a cosmetic duplicate of the ladder's Hint button.
