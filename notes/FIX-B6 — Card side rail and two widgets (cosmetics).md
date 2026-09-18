# FIX:B6 — Card side rail and two widgets (cosmetics), round 1

Triage lane B6. Two findings were handed to me as "lowest priority, neither hides nor mangles anything
a student must read or tap". One of them is that. **The other one is not** — measured on the auditor's
own resize path it prints the answer options straight through each other, and it has a twin in a second
widget that the net cannot see at all. Both are fixed at the cause.

**Owned files:** `site/js/screens/card.js` · `site/js/widgets/mc.js` · `site/js/widgets/termmatch.js` ·
the `/* === fix:B6 … === */` block appended at the end of `site/css/polish.css`.
New dev-only files (nobody else's): `qa/fixb6-probe.mjs`, `qa/fixb6-sweep.mjs`, `tests/fix-b6.test.mjs`.
`mc.js` and `termmatch.js` needed no change in the end — see §2.

---

## 1. Finding 9 — the hint ladder's button

`MAJOR squeeze · div.card-side > div.hint-ladder > button.btn.card-hint-btn > span.muted.fs-1`
`card-wp-01-hint` + `card-wp-04-hint`, **all 19 viewports, both themes, both engines** — 152 measurements.
*"text block is only 17.1ch wide while its container offers 27.7ch."*

### Root cause

The button's label is two different things: the **count** ("Hint 3 of 3") and **what the hint is**
("one step from the end"). It was built as

```js
hintBtn.append(`Hint ${n} of ${m}`, h('span.muted.fs-1', ` · ${HINT_NAMES[next]}`));
```

inside `.btn { display: inline-flex }`. A bare text node in a flex container becomes an **anonymous flex
item**, and an anonymous item is unreachable by CSS: it cannot be told `white-space: nowrap` and cannot
be given a basis. The qualifier, a real `<span>`, could. On top of that `screens.css` sized the button
`align-self: flex-start` — shrink-to-fit — so it never used the width the ladder already had
(measured: button **271.5 px max-content inside a 294 px ladder**, and at 375 the ladder gives 317 px
and the button took **267.6 px**, 4 px *under* its max-content).

The consequence is the ordering defect, not the ch number: when the row is short of space, the half that
breaks is the **count** — "Hint 3 of" / "3" — while the optional qualifier keeps its own full line. The
important text loses its room to the decoration. That is the same family as LAYOUT-ROOT's "every text
track has a floor", one level down: in a flex row the floor is a **flex-basis**, and below the floor the
item takes its own line instead of being squeezed.

### What changed

* **`card.js`** — one helper, `setHintLabel(count, name)`, writes the label in all three places
  (`renderHints`, the next-hint branch, the spent branch). Each label is now its own element:
  `span.card-hint-n` (the count) and `span.card-hint-q.muted.fs-1` (the qualifier, same classes, same
  look). Nothing else in card.js moved — no grading, XP, hint-counting or save logic.
* **`polish.css` (fix:B6 §1)** — `.card-hint-btn` is `align-self: stretch` (it fills the ladder, which
  also makes the whole row the tap target), `justify-content: flex-start`, `flex-wrap: wrap`;
  `.card-hint-n` is `flex: 0 0 auto; white-space: nowrap` (the count can never break);
  `.card-hint-q` is `flex: 1 1 18ch; min-width: min(100%, 18ch)` — 18ch is LAYOUT-ROOT's floor, and
  `min(100%, …)` can never be wider than the button, so the floor can never cause overflow. Below the
  floor the qualifier wraps to its own full-width line.

### Measured, before → after (`node qa/fixb6-probe.mjs --engine both`; chromium and webkit agree to the pixel)

| viewport | ladder | button | count | qualifier |
|---|---|---|---|---|
| 375x667 | 317 px (32.5ch) | **before** 267.6 px, shrink-to-fit | bare text node, breaks | 146.5 px = **17.1ch** |
| 375x667 | 317 px | after **317 px** (fills the ladder) | 79.1 px, `nowrap` | 195.9 px = **22.8ch** |
| 834x1112 | 654 px (63.6ch) | before 271.5 → after **654 px** | 83 px | 146.5 → **529 px (61.6ch)** |
| 1440x900 | 294 px (28.6ch) | before 271.5 → after **294 px** | 83 px | 146.5 → **169 px (19.7ch)** |
| 1900x1200 | 294 px | before 271.5 → after **294 px** | 83 px | 146.5 → **169 px (19.7ch)** |
| 844x390 | 308 px (30ch) | before 271.5 → after **308 px** | 83 px | 146.5 → **183 px (21.3ch)** |

The label reads on one line at every one of those widths: *"Hint 3 of 3 · one step from the end"*
(PNGs: `qa/screenshots/fixb6/after-1440-light.png`, `after-375-dark.png`, `after-834-light.png`,
`after-1900-dark.png`, `after-mc-375-light.png`).

---

## 2. Finding 16 — the mc options, and the twin the net could not see

`overlap · div.w.w-mc > div.wd-opts > button.wd-opt > span.wd-opt-t`, `card-termmatch`, **844x390,
webkit, both themes**. Reported as MINOR with `"unconfirmed": true — seen on the resize sweep only; a
clean load at 844x390 did not reproduce it`, and triaged as a 16 % graze.

### It is not a graze

The auditor prepares a state at 1280x800 and then **resizes** through its viewport list. On the step into
the landscape phone the card's landscape rule takes the answer column to 45 % of the card in one move.
`qa/fixb6-sweep.mjs` walks exactly that path and measures the option buttons:

| | box | text ink | spill | ink landing on another option |
|---|---|---|---|---|
| `.w-mc .wd-opt` (before) | 276.4 x **46.6** | **69.3 px** (3 lines) | **36 px** | **6363.7 px²** |
| `.w-mc .wd-opt` (after) | 276.4 x 95.9 | 69.3 px | 0 | **0** |

36 px of the option's own sentence prints **through the next option**, which paints over it —
`qa/screenshots/fixb6/before-tm-844x390-webkit.png` shows "part of a line with one endpoint, extends"
sliced in half by the box below it. That is the student's own complaint, not a cosmetic graze; the audit
under-graded it only because a clean load at that size does not reproduce it (rotate the phone, or drag
a window narrower, and you get it).

### Root cause

`.wd-opts` is a **one-column grid of `<button>`s** (`widgets.css:530 .wd-opts { display: grid; gap: 8px }`).
WebKit does not re-run intrinsic row sizing for that grid when the container's inline size changes: the
rows keep the heights they had at the wide size. Proof it is the ROWS and not the buttons: with only
`.wd-opts > .wd-opt { align-self: start }` injected, each button takes its right height (95.9 px) and the
buttons then overlap **each other** (18 335 px²) because the rows are still 54.6 px apart. A one-column
list of buttons has no reason to be a grid; as a flex column both engines re-flow it.

### The twin

`.w-tm-defs` — termmatch's definition list — is the same construction (`widgets.css:743`), and has the
same defect on the same path: **8.5 px spill, 340.1 px² of ink on the next definition**, webkit, both
themes. The auditor has never seen it, because a vocab card is `pick:'one'` and its `card-termmatch`
state happens to draw the **mc** part of voc-09, not the termmatch part. Reproduce with
`node qa/fixb6-sweep.mjs --engine webkit --hist 2` (the flag plants history rows on the card so a
different part is picked).

### What changed

`polish.css` (fix:B6 §2 and §3) — no JS:

* `.wd-opts, .w-tm-defs { display: flex; flex-direction: column; }` — same `gap: 8px`, same full-width
  items, same painting, heights re-taken on resize.
* Floors on the two answer text boxes, per LAYOUT-ROOT: `.wd-opt > .wd-opt-t` was `flex: 1 1 auto;
  min-width: 0` → `flex: 1 1 12ch; min-width: min(100%, 12ch)`, and `.w-tm-def` was
  `grid-template-columns: 24px minmax(0, 1fr)` → `24px minmax(min(100%, 12ch), 1fr)`.
  **The basis matters as much as the min-width:** flex decides where to break a line from each item's
  *hypothetical* size, so `flex: 1 1 auto` (basis = the sentence's max-content width) is not a floor at
  all — with `flex-wrap: wrap` it sends every option's text to its own line under the number the moment
  the sentence is longer than the row. I shipped that for one round and the 844x390 shot caught it; with
  a 12ch basis the text shares the row and grows into it, and only drops below the number when 12ch will
  not fit.

`mc.js` and `termmatch.js` are unchanged: the markup was never the problem, the box model was.

### After (`node qa/fixb6-sweep.mjs --engine both --hist 2` / `--hist 3`)

**0 px² of graze, 0 px of spill** on the full resize path — 17 viewports x 2 themes x chromium and
webkit, for the mc options *and* the termmatch definitions.
PNGs: `qa/screenshots/fixb6/after-mc-844x390-webkit.png`, `after-tm-844x390-webkit.png`,
`after-widgets-mc-375.png` (both lists at 375, unchanged in look).

---

## 3. The audit slice

```
node qa/layout-audit.mjs --only card-wp-01-hint,card-wp-04-hint,card-termmatch --engine both --theme both
```

| | findings | severity |
|---|---|---|
| before (`qa/audit/b6-before.json`) | **164** (12 waived) | MAJOR 152 · MINOR 12 |
| after (`qa/audit/b6-after.json`) | **0** | — |

Widened to every state that mounts a widget I touched — `card-mc, card-strip, card-term, card-termmatch,
card-cloze, card-wp-01-hint, card-wp-04-hint, mock-mid, mock-mid-map`, both engines, both themes
(`qa/audit/b6-after2.json`): **101 findings, every single one `tap-target` on
`svg.fig.fig-fan … path.fig-wedge-hit`** — lane B3's 44 px wedge rule, untouched by me. Nothing on
`.wd-opt`, `.w-tm-def`, `.card-hint-*`, and no new overlap, squeeze or zero-track anywhere.

`node --test`: **1309 tests, 1305 pass, 0 fail, 4 skipped** (1304 before this ticket + 5).

### Negative controls — a check that cannot fail its own defect is worthless

| what was un-fixed | what the net said |
|---|---|
| the whole fix (the before-run) | 152 MAJOR squeeze + 12 MINOR overlap, both engines, both themes |
| `.wd-opts` / `.w-tm-defs` put back to `display: grid` (`--css`) | 6363.7 px² / 340.1 px² of ink on the next option, 36 px / 8.5 px spill, webkit |
| only `align-self: start` on the option (the tempting one-liner) | buttons right height, **rows still stale — 18 335 px² of button-on-button** |
| `.card-hint-btn { max-width: 90px }` injected into the fixed app | `BLOCKER collapsed-text … span.card-hint-q … text (23 chars) in a 56px content box; 4 rendered line(s)` |

The last row is the one that matters. Giving the count its own element **stops the `squeeze` detector
from firing on that span** — not because the net went blind, but because the detector deliberately skips
a cell of a genuine multi-track parent, and it can only see the parent as multi-track now that both
labels are elements (`p.children` never contained the anonymous text item). So I checked that the net
still catches a REAL squeeze of that exact element, and it does, as a BLOCKER. `tests/fix-b6.test.mjs`
pins the shape statically on top of that.

---

## 4. Observations for other owners (not changed by me — no finding, and not my files)

* **A hint is printed twice on a card wide enough for the rail.** `card.js`'s `inlineHint()` copies every
  revealed hint into the part box "so the auto-H1 after a second miss is where the eyes are, not 400 px
  above the field on a phone" (card r1 / page r2). Only the *insert position* is phone-dependent — the
  copy itself is made at every width, so at ≥ 960 px the card shows H1 and H2 in the ladder **and** again
  inside the Answer box (`qa/screenshots/fixb6/after-1440-light.png`, `after-1900-dark.png`). It reads as
  duplication rather than help when both are on screen at once. Deliberate behaviour from another lane
  and no auditor finding, so I left it: gating the echo on the card not showing the ladder
  (`@container cardhost` state, or the `data-rail` attribute LAYOUT-ROOT §6 asks card.js for) would be a
  product call, not a layout fix.
* **widgets.css owner:** `.wd-opts` (L530) and `.w-tm-defs` (L743) are still `display: grid` in your
  file; my block overrides them at the end of the cascade. Fold the flex column in when you next touch
  those rules, and please take `.wd-opt-t`'s `min-width: 0` (L559) and `.w-tm-def`'s
  `minmax(0, 1fr)` (L745) with them — those are the 0 px floors. The `.wd-opts` change also covers
  **strip.js**'s option list, which is built from the same class and had the same latent bug.
* **auditor owner:** a state named for a widget can quietly render a different one. `card-termmatch` is
  `#/card/voc-09`, a `pick:'one'` card, and it draws the **mc** part; the termmatch definition list is
  audited nowhere. A catalog entry that names a widget should assert that widget's root is on screen
  (the `root` selector for that state is `.card-screen`, which any part satisfies).

## 5. How to re-check this ticket

```
node qa/layout-audit.mjs --only card-wp-01-hint,card-wp-04-hint,card-termmatch --engine both --theme both
node qa/fixb6-probe.mjs --engine both        # the hint button, 5 viewports x 2 themes x 2 engines
node qa/fixb6-sweep.mjs --engine both --hist 3   # mc options on the resize path  (--hist 2 = termmatch)
node --test tests/fix-b6.test.mjs
```
