# notes/AUDIT.md — the layout safety net (ticket AUDIT-HARNESS)

`qa/layout-audit.mjs` measures every screen state of the app at every viewport, in both themes, in
**both engines** (the student uses Safari, so webkit findings are first-class), and fails when a
blocker survives. It exists because of this bug:

> The student opened the live site in Safari at 1900x1200. The PLACEMENT question rendered **one letter
> per line**, with the run header, the card chips and the Scratch heading piled on top of each other.

That was not a placement bug. `.card-stem` was **0 px wide** because `.card-paper`'s computed columns
were `0px 250px`: at >= 1024 px viewport `.card-screen` lays out `minmax(0, var(--col)) var(--rail)`,
so inside onboarding's `.ob-run-stage` its content column got 336 px, the figure track kept its 250 px
and the text track collapsed to nothing. Every responsive rule in the app is keyed to the **viewport**,
but a card is hosted at widths that have nothing to do with the viewport — `#/card`, a run, the
placement, a boss, a mock, the night screen. Wave 5 patched exactly one host, which is why
`#/run/page` looked fine and the placement did not. Eyeballing one screen at one width cannot find
that class of defect. Measuring all of them can.

## Run it

```
cd /Users/oliver/Projects/unit1a-quest && node qa/layout-audit.mjs
```

That is the command to run after every fix round. It self-tests its own detectors first, then sweeps
the matrix, writes `qa/audit/report.json`, drops a PNG for every state that has findings, prints a
summary, and **exits 1 if any BLOCKER or MAJOR remains**.

Fast loops while fixing one screen:

```
node qa/layout-audit.mjs --only placement,run-page --vp desktop --engine chromium --theme light
node qa/layout-audit.mjs --only placement-item-1 --vp 1900x1200        # the student's own window
node qa/layout-audit.mjs --selftest                                    # detectors only, ~2 s
```

| flag | meaning |
| --- | --- |
| `--only a,b` | state-id **prefixes** (`--only card` runs every `card-*`). Ids come from `qa/audit-states.mjs`. |
| `--vp all\|phone\|tablet\|desktop\|WxH,…` | default `all` (17 sizes, incl. `844x390` landscape phone and `1900x1200`). |
| `--engine chromium\|webkit\|both` | default `both`. webkit is Safari; do not skip it. |
| `--theme light\|dark\|both` | default `both`. |
| `--workers N` | parallel contexts per engine, default 3. |
| `--no-confirm` | skip the clean-load re-check (faster, noisier — see "How a finding is confirmed"). |
| `--no-extra` | skip the text-zoom and animations-enabled passes. |
| `--no-selftest` | skip the detector calibration preamble. Only for tight loops. |
| `--max-findings N`, `--json path`, `--quiet` | report size / location / silence. |
| `--inject "<css>"` | **mutation test.** Injects the CSS into every page the run opens — sweep, clean-load confirm and screenshot alike — so a deliberately broken rule behaves exactly like a regression shipped in `site/css`. Nothing on disk is touched. See "Trusting the net". |

Beyond the plain viewport sweep, every state also gets a pass at `1900x1200` with
`html{font-size:20px}` injected (label `1900x1200@zoom20`, text-zoom robustness) and one at
`1900x1200` with animations **enabled** (label `1900x1200@motion`; the main sweep runs with
`prefers-reduced-motion: reduce` so geometry is stable).

The auditor serves `site/` **at the origin root**, exactly as `qa/shot.mjs` does, so the app's absolute
paths resolve the way they do on Pages (a state catalog doing `import('/data/cards.js')` must work).
The auditor's own dev pages are served under the reserved prefix `/__qa/`, which the deployed artifact
never contains.

## How a finding is confirmed

Navigating 92 states x 17 viewports x 2 themes x 2 engines would take an hour, so each task prepares
its state **once** and then sweeps the viewport list by resizing. Resizing can leave a layout artefact
that a real reader would never see, so every viewport that produces findings is **re-navigated from
scratch at that exact size** and measured again:

* seen on both the resize sweep and the clean load → a real finding, in the report, with a PNG;
* seen only on the resize sweep → kept as `MINOR` with `unconfirmed: true` and a note. Never dropped;
* seen only on the clean load → also a real finding (that is the load the student gets).

Findings are identified by type + selector + counterpart, deliberately **not** by rendered text: a
generated card draws a different question on every fresh save.

## The detectors

| id | severity | what it measures |
| --- | --- | --- |
| `collapsed-text` | BLOCKER | An element whose own text is >= 8 chars and whose content box is narrower than `max(60px, 6ch)` **and** whose text actually stacks (> 1 rendered line) or spills out; or text whose rendered line count exceeds `chars / 3`. This is the one-letter-per-line bug. Line counts come from `Range.getClientRects()` on the real text nodes. |
| `zero-track` | BLOCKER | A grid container with a computed track under 8 px holding a child that shows **visible** text or a rendered control. Reports the parent's `grid-template-columns` verbatim, so the fix is obvious. |
| `overlap` | BLOCKER when text is covered (two texts sharing >= 15 % of the smaller ink area, or a text >= 25 % covered), else MAJOR ("the two texts graze each other") | Two elements, neither an ancestor of the other, both visible, at least one carrying text or interactive, whose **text ink** — a `Range` over each element's own text nodes, line by line, not the element box, which is mostly empty space — intersects by more than 4 px across and 6 px down (a `Range` rect is the line box, leading included, so consecutive lines can share a few pixels without a glyph touching). `.sr-only` text is excluded: its 1 px box clips the paint, not the layout, so its ink is full width. Bounding boxes are not used: a wrapped inline span's union box "contains" every sibling on its lines. **Ink is clipped to what is painted**: every line rect is intersected with the clip box of its clipping ancestors (`overflow: hidden/clip/auto/scroll`), so the invisible third line of a two-line clamp cannot "cover" the paragraph below it, and an element whose every line is clipped away is not a candidate. Absolutely/fixed/sticky elements legitimately overlay, so for those the overlap must cover >= 40 % of a text element — and a pair sitting on two different **opaque positioned surfaces** (a modal sheet over the page, a popover over a list) is stacked by design and skipped. SVG figure internals are skipped: hand-drawn figures overlap on purpose. Separately, the app header is checked against content at `scrollY 0` (content under a sticky header there can never be scrolled clear) and the fixed dock at the **end** of the scroll (what it covers there is genuinely unreachable) — those two never consult the surface rule, because being hidden behind them *is* the defect. |
| `doc-overflow` | BLOCKER | `document.scrollWidth > innerWidth + 1`. Names the widest offender whose parent is *not* also overflowing — the actual culprit, not its ancestors. |
| `clipped-text` | MAJOR, or BLOCKER on a question | `scrollWidth > clientWidth + 2` on an element with `overflow: hidden/clip` and no ellipsis intent. **Ellipsis intent is `text-overflow: ellipsis` OR `-webkit-line-clamp`/`line-clamp`** — a clamp paints a "…" exactly as `text-overflow` does, and reading only `text-overflow` called every deliberate two-line clamp an accident. Ellipsis **on a stem / title / question** is a BLOCKER either way, now on vertical overflow as well as horizontal: truncating the actual question is not a style choice. Screen-reader-only text (1 px box + `clip`/`clip-path: inset(50%)`, e.g. `.sr-only`, `.run-quit-label`) is exempt — it is clipped on purpose. |
| `offscreen` | BLOCKER | A visible interactive control whose rect leaves `[0, vw]` horizontally (unless an ancestor scrolls horizontally, in which case it is reachable), or which is still below the fold with the page scrolled to its end. |
| `unreachable-answer` | BLOCKER | On `card`-tagged states: the first interactive answer control is **scrolled into view** and then checked against the dock and the header. A dock covering the bottom of a long page is normal; a control that stays behind it is not. |
| `tap-target` | MAJOR | A visible interactive element with a hit box under 44x44 (0.5 px tolerance, because a 44 px target measures 43.99 and does so differently in webkit than in chromium), including padding, borders and negative-inset `::before`/`::after` hit extensions — but only **where the pseudo is actually painted**: the grown rect is intersected with the clip box that applies to the pseudo (from its containing block up), and an extension whose insets are measured from some other element's padding box is not credited at all. `.chip::before { inset: -6px }` under base.css's `.chip { overflow: hidden }` buys nothing, and saying otherwise made the whole matrix report zero tap-target findings (fix:qa r2). A control wrapped in a bigger `label`/`a`/`button`, or driven by a big enough `label[for=…]` anywhere in the DOM (that is how a styled file input works), is measured through that. |
| `contrast` | MAJOR (MINOR for large text between 3:1 and 4.5:1) | Rendered text colour against its first **opaque** ancestor background, WCAG thresholds 4.5:1 / 3:1 for large text. Transparent-fill (gradient) text and screen-reader-only text are skipped. |
| `console` | MAJOR | Any console error, `pageerror` or failed request while reaching or measuring the state. Service-worker noise is ignored. Deduplicated per state/theme/engine. |
| `squeeze` | MAJOR | A text block under 18ch wide whose container offers >= 24ch — the near-miss of `collapsed-text` that still reads terribly. A cell in a genuine multi-track grid/flex row is not counted: its track width *is* its available width, and counting it would fire on every two-column layout and drown the real findings. |
| `harness` | BLOCKER | The state could not be reached or measured at all. A screen that will not render is worse than a screen that renders badly. |

## Trusting the net (ticket TRIAGE, 2026-09-17)

A detector that has never been shown to fire on a *real* regression is a decoration. Three things are
asserted before any triage is believed, and they are cheap enough to repeat after any detector change:

1. **The plants.** `node qa/layout-audit.mjs --selftest` — eight planted defects caught in chromium
   **and** webkit, zero findings and zero console noise on the clean control.
2. **A real regression, injected.** `--inject` puts a bad rule into the live app without touching a
   file:

   ```
   node qa/layout-audit.mjs --only placement-item-1,card-num --vp 1900x1200 --no-extra --no-selftest \
        --inject '.card-stem{width:12px}'
   ```

   reproduces the student's own bug (`BLOCKER collapsed-text … 113 chars in a 12px content box; 86
   rendered lines`, both engines, with the PNG showing one letter per line) and the same command
   without `--inject` reports **zero**. `--inject '.card-paper{min-width:1400px}'` fires `doc-overflow`
   naming the right culprit; `--inject '.card-hint-btn{height:18px;width:30px}'` fires `tap-target`,
   `overlap` and `offscreen`.
3. **The control.** The same states, unmodified, must be silent — otherwise a "finding" is just the
   detector talking to itself.

### What the first full run taught us (and what changed)

The first full matrix returned 6 703 findings, and **~85 % of them were the same detector fault twice
over**: ink was being measured through a clip.

* `Range.getClientRects()` returns a rect for a line that `-webkit-line-clamp` or `overflow: hidden`
  never paints. Those ghost lines sat on whatever was drawn below them, which is how ten Binder list
  screens reported "row stem covers the panel hint" (BLOCKER), five Home screens reported "skill name
  covers the next skill name", and the Drill head reported "title covers the progress counter".
  **Fix:** ink is now intersected with the clip box of its clipping ancestors (`clipInk`), and an
  element whose every line is clipped away is not an overlap candidate at all. This cannot hide a real
  collision: a line a student can read is inside its own clip.
* `clipped-text` read only `text-overflow: ellipsis` for "intent", so every deliberate two-line clamp
  (Binder rows, Home rail skills, the card's skill meta) was reported as an accidental clip.
  **Fix:** `-webkit-line-clamp` / `line-clamp` count as ellipsis intent — **and** the stem rule was
  *tightened* at the same time: a clamped question now blocks on vertical overflow too, not only on x.

Both changes are guarded by new plants (`#plant-clip`, `#plant-clamp-stem`) because a rule that is
loosened without a plant is a rule that can go quietly blind. After the change the self-test still
catches all seven plants in both engines and `--inject '.card-stem{width:12px}'` still produces the
identical four blockers.

## Waiving a finding

Waivers live in `qa/audit-allow.json`. Every entry needs a **reason**; an entry without one is ignored
with a message on stderr.

```json
{ "type": "tap-target", "selector": "#hdr-combo, .streak", "states": ["*"],
  "reason": "Header status read-outs; the 48px #hdr-home anchor is the real hit target." }
```

* `type` — the detector id from the table above.
* `selector` — CSS the offending element must match.
* `states` — state-id prefixes, or `["*"]` for all.

A waived hit is **not deleted**. It is counted and printed under `waived` in both the summary and
`report.json`, and it does not affect the exit code. A waiver is a promise that the hit is intentional
*and* that the content is reachable some other way — it is not a mute button. If you find yourself
waiving a shape rather than an element, the detector is wrong: tighten the detector and keep the
planted defect caught.

## The self-test (do not "fix" it)

* `qa/audit/selftest.html` — eight deliberate defects: a 12 px-wide div holding a paragraph, a 0 px grid
  track holding a stem, two in-flow labels dragged on top of each other, a 1200 px table in a 320 px
  body, a 30x20 button, a 30x20 control whose 44 px `::before` hit area is clipped away by its own
  `overflow: hidden`, a box that hides the end of its line with no ellipsis, and a line-clamped
  question stem (two added by ticket TRIAGE when `clipped-text` learned about line clamps, one by
  fix:qa r2 when `tap-target` was found crediting hit area to unpainted pseudo-elements). Each carries
  `data-plant="<detector>"`. **Order matters:** the overlap and
  tap-target plants must stay above the fold at 320x568, and the self-test fails if they drift below
  it. A rule that only passes on off-screen geometry is not calibrated — an early version of the
  overlap rule passed this page for exactly that reason while being blind to every real collision.
* `qa/audit/selftest-clean.html` — the control. It must produce **zero** findings. It also carries
  NEGATIVE controls — `#ctl-pill`, a 32 px pill whose 44 px `::before` hit area really is painted — so a
  detector cannot pass by ignoring the feature altogether; the self-test fails if one drifts off screen.

`node qa/layout-audit.mjs --selftest` asserts both, in each engine, and the default run does it as a
preamble and **refuses to run the matrix on broken detectors**. `tests/layout-audit.test.mjs` runs it
under `node --test` (skipping gracefully when no browser binary is installed), so the net cannot rot
unnoticed. When you add a detector, plant a defect for it in `selftest.html` and add it to `PLANTED`
in `qa/layout-audit.mjs`.

## Output

* `qa/audit/report.json` — config, state list, self-test results, counts by severity and type,
  `groups` (one row per distinct defect: type + state + theme + engine + selector, with the list of
  viewports it was seen at — **this is the list to work from**), every individual finding with
  `state / viewport / theme / engine / selector / detail / png`, and the `waived` list.
* `qa/audit/png/<state>-<viewport>-<theme>-<engine>.png` — only for states that have findings. PNGs
  for the states in a given run are cleared first, so the folder never claims a defect that is fixed.
* stdout — counts by severity, counts by type, waived counts, the worst states, and the top 30
  findings one line each.

Neither the report nor the PNGs are part of the deployed artifact (`site/` only).
