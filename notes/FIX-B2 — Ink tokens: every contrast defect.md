# FIX:B2 — Ink tokens: every contrast defect (round 1)

Owned files: `site/css/theme.css`, `site/css/polish.css` block `/* === fix:B2 — Ink tokens: every
contrast defect r1 === */`. CSS only — no JS, no markup, no test changes.

---

## 1. The one root cause behind all six findings

Six MAJOR contrast findings were assigned to this lane. Three of them are literally the same class on
three screens (`.rarity`), and none of them is a layout or per-viewport bug: **every one is a FILL
token used as a `color:`.**

S5 splits the palette in two, and `theme.css` now says so out loud:

> `--gold` / `--ok` / `--bad` / `--warn` / `--almost` / `--plat` / `--silver` / `--bronze` /
> `--accent` are **FILL** colours — bars, rings, strokes, borders, tints. They owe 3:1.
> Text owes 4.5:1 and must use the **-ink** partner.

Measured on `--surface2` (#EEF2F9, the worst light ground the app actually paints), **not one fill
token is text-grade**: gold 3.82, ok 3.89, bad 4.22, warn 4.03, plat 3.61, silver 3.12, bronze 4.10,
accent 3.33. On the 12 % gold rarity tint they are worse still (gold 3.71, plat 3.50).

Waves 1–5 had already met this bug and patched it **one selector at a time** — `--warn-ink` /
`--gold-ink` for `.weak-m` and `.rd-band`, `--ok-ink` for `.w-msg`, `--plat-ink` / `--silver-ink` for
`.tile-chip` and `.rarity[data-r="silver"]`. That is why the auditor kept finding a seventh, an
eighth, a ninth: the *convention* was right and the *coverage* was a list of whatever had been
reported so far. `.rarity[data-r="gold"]` was simply never on the list.

### Worse: most of the class is invisible to the auditor

`qa/layout-audit.mjs`'s contrast detector skips text shorter than 2 characters and never reads
`::before` / `::after` content. So every `content: "✓" / "✗" / "←"` mark on every widget —
`.wd-opt`, `.wd-chip`, `.w-asn-btn`, `.w-cls-btn`, `.w-tm-term`, `.w-cz-slot`, `.w-strip-slot`,
`.w-tab` — was painting `var(--ok)` at 3.89:1 and being reported clean. Fixing only the six
measurable misses would have left ~60 identical defects in the app and the auditor still green.

So this ticket converts **every `color:` use of a fill token in the whole app**, grouped by ink, in
one pass — not the six that happened to be measurable.

## 2. What changed

### `site/css/theme.css`
The complete `-ink` family now lives with the tokens it partners, with the FILL-vs-INK rule written
above it. `--gold-ink` / `--ok-ink` / `--warn-ink` / `--plat-ink` / `--silver-ink` already existed,
scattered across four separate `polish.css` blocks with the same values; the four that were missing
are new:

| token | light | dark | why |
|---|---|---|---|
| `--bad-ink` | `#C4203D` | `#FF5C7A` (= fill) | `--bad` is 4.22–4.46:1 on `--bg` / `--surface2` |
| `--almost-ink` | `#9A5208` | `#FFB454` (= fill) | alias of warn; `--almost` had no ink at all |
| `--bronze-ink` | `#8A4F1C` | **`#CE8C4A`** | the one DARK fill that misses: `#B87333` = 4.20:1 on `--surface2` |
| `--violet-ink` | `#5B3FC4` | `#B39DFF` (= fill) | completes the vocabulary (`--violet` passes at 5.01, kept for uniformity) |

Every light `-ink` is ≥ 4.9:1 on all four light grounds (`--surface`, `--bg`, `--paper`,
`--surface2`) **and** on the 12 % / 14 % gold and platinum rarity tints. In dark mode the fills
already measure 4.2–12:1 on the dark grounds, so ink aliases fill — except bronze.

### `site/css/polish.css` — `/* === fix:B2 … === */`
1. **Text → ink, app-wide.** Selector lists grouped by ink (gold / plat / silver / bronze / ok / bad
   / warn+almost / accent) covering every `color: var(--fill)` in `base.css`, `widgets.css`,
   `screens.css` and the earlier `polish.css` blocks — including the `::before` / `::after` marks
   the auditor cannot see. Each rule reuses the original selector verbatim, so specificity matches
   and `polish.css`'s position as the last sheet decides it.
   **No fill changed**: borders, backgrounds, bar fills, rings, strokes and `color-mix` tints all
   keep the fill token, so the rarity metals still read gold / silver / bronze / platinum.
2. **`@media print` gets the paper palette.** (Finding 13's root cause — see §4.)
3. **Opacity de-emphasis.** (A second root cause found while sweeping — see §5.)

`--violet` (5.01:1 at worst) and the `#banner` amber fill are deliberately untouched: darkening
`--warn` at the token level would have *broken* `#banner`, which paints `#0F1728` text ON the warn
fill. That is exactly why the ink pair exists instead of a darker fill.

## 3. Findings, measured after

| # | state | selector | before | after |
|---|---|---|---|---|
| 6 | 9 card states + `run-full36` | `.card-meta > .rarity` (gold) | 3.70:1 | **5.02:1** |
| 8 | `card-wp-01/04-cleared` | `.card-result-top > .rarity` (gold) | 3.70:1 | **5.02:1** |
| 11 | `run-page-summary` | `.sum-hist-list > li > .rarity` (gold) | 3.70:1 | **5.02:1** |
| 7 | `card-rootcase-cases/-reject` | `.w-step[data-state="done"] .w-step-t` | 4.37:1 | **5.80:1** |
| 12 | `run-page-summary` | `.sum-rd-delta[data-tone="bad"]` | 4.46:1 | **5.45:1** |
| 13 | `sheet-print` (dark) | `.sh-stamp` | 2.97:1 | **8.86:1** |

Same-class defects fixed that were never reported (auditor-blind or simply unvisited):
`.rarity[data-r="platinum"]` 3.43 → 5.26 · `.rarity[data-r="bronze"]` 4.61 → 6.53 ·
`.tile-state` silver 3.12 → 4.96 · `.mock-rulelist li::marker` 3.74 → 6.15 ·
dark `.tile-state` bronze 4.20 → 5.67 · plus ~60 `✓ / ✗ / ←` pseudo-element marks at 3.89 → 5.80.

## 4. Finding 13 in detail — print is a paper medium

`screens.css`'s `@media print` forces `html, body { background: #fff; color: #000 }` and then
hard-codes `#000` / `#333` on three `.sh-*` selectors. Every **other** element keeps whatever palette
the THEME chose. Print the cheat sheet with the app in dark mode and the dark tokens land on white
paper: `--muted` `#8A96B0` = **2.97:1** on the date/readiness stamp, plus `--line` rules that barely
mark, `--accent-alpha` on `.sh-personal`, `--surface` boxes.

Patching `.sh-stamp` alone would leave the next printable screen broken the same way, so the fix is
at the palette: under `print`, the root variables become an ink-on-paper set **regardless of theme**.
The selector list is `:root, :root:not([data-theme="light"]), :root[data-theme="dark"]` so it matches
the specificity of all three theme rules in `theme.css`; `polish.css` is the last sheet, so equal
specificity wins.

Verified with a print-media emulation probe (`emulateMedia({media:'print'})`, chromium, `#/sheet`,
both themes): **0 contrast misses in dark, 0 in light** — before the fix, dark had the `.sh-stamp`
miss. The dark print render now reads as black ink on white paper with a legible stamp line.

## 5. The second root cause: opacity de-emphasis (NOT in the report — and that is the point)

The contrast detector reads an element's computed `color`. `opacity` on an **ancestor** composites
*after* that, so the auditor is structurally blind to it. Composited ratios, computed by hand:

| rule | α | composited |
|---|---|---|
| `.st-errors li[data-cleared="true"]` | .62 | `--muted` **2.60:1**, `--bad-ink` **3.05:1** |
| `.boss-check-opt[data-state="bad"]` | .70 | `--muted` **3.02** light / **3.58** dark |
| `.wd-opt` / `.wd-chip` / `.w-cls-btn[data-state="bad"]` | .72–.80 | `--muted` **3.14** |
| `.card-part[data-state="skipped"]` | .80 | `--muted` **3.69** |
| `.w-equation[data-skipped="true"] .w-eq-fields` | .50 | `--text` **3.42** |

Every one of those is content the student still has to READ: the answer they got wrong, the part they
skipped, the error they have since cleared. Rule set by this block:

> **Opacity may dim a container's chrome, never its prose.** "Receded" is a colour decision, and the
> palette already grades it — `--muted` is 5.86:1 light and 5.97:1 dark.

`--muted` needs α ≥ .90 (light) / ≥ .84 (dark) to survive compositing, so **.9 is the floor** for the
state dims that keep a second cue (a `--bad` border, a dashed edge, a line-through). The one with no
second cue — the cleared-error row — drops opacity entirely and recedes with a `--surface2` ground
and `--muted` ink instead. **Disabled controls are untouched**: WCAG 1.4.3 exempts inactive controls
and they are not read for content.

## 6. How it was tested

- **Reproduced first.** `node qa/layout-audit.mjs --only <my 15 states> --vp 375x667,1440x900,1900x1200
  --engine both --theme both` → 32 contrast MAJORs (16 groups × 2 engines), all six findings present,
  identical in chromium and webkit.
- **After.** Same command → **0 contrast findings**. Remaining majors in those states are
  `tap-target` (another lane).
- **Whole app.** `node qa/layout-audit.mjs --vp 375x667,834x1112,1440x900,1900x1200 --engine both
  --theme both` — all 43 states, 4 viewport classes, 2 engines, 2 themes → **0 contrast findings
  anywhere**. (Remaining: 4 `clipped-text` BLOCKERs on `run-drill-cs-lin`, 8 `squeeze`, 36
  `tap-target` — none of them this lane's.)
- **Composited sweep** (a probe the audit does not have: multiplies the whole ancestor `opacity`
  chain into the text colour before measuring). 11 routes × 2 themes × **chromium and webkit**,
  including a card driven to a wrong answer so `[data-state="bad"]` options materialise → **1 hit in
  all four passes, the same one: a `:disabled` `.btn-ghost` ("Play a cue") at α .5.** Left alone on
  purpose — see §7.
- **Screenshots read** (phone 375×667, tablet 834×1112, laptop 1440×900, wide 1900×1200, both
  themes): binder light/dark (rarity metals — the biggest visual risk), card wide light + phone
  light/dark, Page Summary laptop light/dark, mock report wide light, stats error list light/dark,
  the print sheet dark **and** light. The metals still read as metals; only the ink moved.
- `node --test` → **1304 tests, 0 fail, 4 skipped** (unchanged; no test needed updating).

## 7. Open issues / requests for other owners

1. **`.btn:disabled { opacity: .5 }` (`base.css:189`)** — "Play a cue" in `#/settings` composites to
   2.26:1 light / 3.72:1 dark. WCAG 1.4.3 exempts inactive controls, so this is *not* a violation and
   I did not touch it. If the S5 bar is "everything readable", the owner of `base.css` should raise
   it to α .9 and carry "disabled" on the border instead. Noted, not changed.
2. **`site/css/screens.css` and `site/css/widgets.css` still contain the original
   `color: var(--fill)` declarations** that this block overrides from `polish.css`. That is correct
   per BUILD-POLICY (I own neither file), but it means a future edit to those lines will look like it
   has no effect. Request to their owners: when you next touch one of those rules, change the
   declaration in place to the `-ink` token and delete the matching line from the `fix:B2` block.
3. **The auditor's two blind spots should be closed** so this class cannot silently return — ideally
   by the AUDIT-HARNESS owner: (a) measure `::before` / `::after` `color` when the pseudo-element has
   `content`, and (b) multiply the ancestor `opacity` chain into the colour before computing the
   ratio. My composited probe is small enough to port; the logic is in §5. Until then the net is
   green on a class it cannot see.
4. `--violet` (5.01:1 at worst) and the `#banner` warn fill are intentionally left on the fill token;
   see §2. Do not "finish the job" by darkening `--warn` in `theme.css` — `#banner` paints dark text
   ON it and would drop to 2.6:1.
