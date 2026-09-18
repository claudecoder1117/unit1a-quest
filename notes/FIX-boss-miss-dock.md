# FIX — the Boss's miss strip in the dock (round 3)

Ticket `fix:boss-miss-dock` (the harness spelled it "fix:boss miss strip in the dock (boss r3"; this
note is the clean-named file it asked for). One finding carried from round 2, and it turned out to be
three defects wearing one coat.

Owned / touched files:

| file | change |
|---|---|
| `site/css/polish.css` | new `/* === fix:boss miss strip in the dock (boss r3 === */` block at the END (appended; nothing else in the file was edited) |
| `qa/audit-states.mjs` | **+3 states** — `boss-b4-miss-dock`, `boss-b4-miss-dock-kb`, `boss-b4-miss-setup-kb` (the states notes/FIX-qa.md asked for: "it needs a state") |
| `qa/layout-audit.mjs` | the clip box is the **padding** box, not the border box (4 lines) + the new plant in `PLANTED` + it in the off-screen guard |
| `qa/audit/selftest.html`, `qa/audit/selftest-clean.html` | the plant `#plant-hairline-hit` and its silent twin `#ctl-hairline` |
| `qa/fix-boss-miss.mjs` | new dev tool: real hit boxes by hit-test, both strip shapes, both engines |
| `tests/fix-boss-miss.test.mjs` | 8 tests (7 static + 1 measured, skips with no browser) |

No `site/js` file was touched: no grading, XP, heart, plan or save logic is involved.

---

## 1. The finding, and what was actually wrong

> MAJOR tap-target · `#dock .boss-miss .btn` ("Drill 5") · 375×667 with the keyboard open and
> 844×390 landscape · chromium AND webkit · hit box 52.3×41.8 / 52.3×25.8, S5 floor is 44×44.

`showMiss()` (boss.js) re-homes the miss strip into the dock while a card is mounted — "Heart lost.
<skill in words>" plus a **Drill 5** link — because that is where the student is looking when a heart
goes. `polish.css` "mock r2" then collapses that strip to ONE row while the on-screen keyboard is up
(`:root[data-kb="open"]`) or the viewport is under 520 px tall (`@media (max-height: 520px)`), so the
answer box keeps its room:

```css
#dock .boss-miss { max-height: 44px; overflow: hidden; … }          /* polish.css:349 / 356 */
#dock .boss-miss .btn { min-height: 0; padding: 0; … }              /* a ~19px underlined link */
#dock .boss-miss .btn::before { content: ''; position: absolute; inset: -14px -8px; }
```

**Root cause — the same one, three times now.** An element's `overflow` clips its own absolutely
positioned pseudo-element whenever the element is that pseudo's containing block, so the 14 px of hit
area above and below the link was **painted nowhere and hit-tested nowhere**. This is the third
instance of the pattern `fix:B1` found on the header's T-minus chip and `fix:stats r2` found on the six
Stats section chips, and (per notes/FIX-qa.md) the last place in the app where a hit area depended on a
clip. The lint in `tests/fix-boss-miss.test.mjs` is written for the *class*, not for this selector.

**And a second, worse fault underneath it:** at 844×390 the strip itself measured only **28.8 px**
tall (one line of text + 8 px padding + 2 px of hairline), so **no pseudo of any size could have
reached 44** — the hatch was not merely clipped, it was impossible. The strip needed its own height.

**Two things the finding did not know** (both found by driving the real screen, both fixed):

1. The `is-setup` shape of the same strip — submit a B4 item with the equation box empty and the
   strip carries a **"Skip the setup"** button instead of the Drill link. Identical defect:
   106.9×28.8.
2. `@media (max-height: 520px)` is not only the landscape phone. A **short desktop window**
   (measured at 1280×500 — a Safari window two thirds up the screen) collapses the strip too, and
   that configuration had never been measured by any round.

### Measured before → after (`node qa/fix-boss-miss.mjs --engine both`, hit-tested with `elementFromPoint`)

| state | viewport | strip height | "Drill 5" hit box (chromium / webkit) |
|---|---|---|---|
| heart lost, keyboard open | 375×667 | 43.8 → **44** | 52.3×**41.8** / 53.3×**41.8** → 45.3×**44** / 46.3×**44** |
| heart lost, keyboard open | 375×380 | 43.8 → **44** | 52.3×**41.8** / 53.3×**41.8** → 45.3×**44** / 46.3×**44** |
| heart lost, landscape phone | 844×390 | 28.8 → **44** | 52.3×**25.8** / 53.3×**26.8** → 45.3×**44** / 46.3×**44** |
| heart lost, short desktop | 1280×500 | 28.8 → **44** | 52.3×**25.8** / 53.3×**26.8** → 45.3×**44** / 46.3×**44** |
| heart lost, un-collapsed | 768×1024 | 62 (unchanged) | 214.4×44 (unchanged) |
| empty setup ("Skip the setup") | 375×667 kb | 43.8 → **44** | 105.9×**41.8** / 106.9×**41.8** → 98.9×**44** / 99.9×**44** |
| empty setup | 844×390 | 28.8 → **44** | 105.9×**25.8** / 106.9×**26.8** → 98.9×**44** / 99.9×**44** |
| empty setup | 1280×500 | 28.8 → **44** | 105.9×**25.8** / 106.9×**26.8** → 98.9×**44** / 99.9×**44** |

(The link's box gets *narrower* because the 8 px hatch either side is replaced by a real `min-width:
var(--tap)` + 4 px padding: 45.3 px of actual button instead of 37.3 px of text with a 15 px rumour
around it. "Skip the setup" shrinks from 105.9 to 98.9 for the same reason and stays far over 44.)

---

## 2. The fix

Same shape as B1 and stats r2, one step further: **the hit target stops being an escape from the box
and becomes the box** — and the row it lives in is sized by that box.

```css
:root[data-kb="open"] #dock .boss-miss { max-height: none; overflow: visible; padding-block: 0; border-block-width: 0; }
:root[data-kb="open"] #dock .boss-miss .btn { min-height: var(--tap); min-width: var(--tap); padding: 0 4px;
                                              display: inline-flex; align-items: center; justify-content: center; }
:root[data-kb="open"] #dock .boss-miss .btn::before { content: none; }
/* …and the identical three rules inside @media (max-height: 520px) */
```

Why each line:

* **`min-height: var(--tap)` on the link** — the flex row's cross size is the tallest item, so the row
  is now 44 px *because the control is*. One token owns the number (theme.css `--tap: 44px`), as it
  does on the header chip and the Stats chips.
* **`padding-block: 0; border-block-width: 0` on the strip** — so 44 px of control still makes a 44 px
  row. The collapsed strip is therefore **exactly `var(--tap)` tall — 44 px against "mock r2"'s
  43.8 px**, i.e. the fix costs the answer box 0.2 px at the keyboard-open size the collapse was
  designed for. The 3 px accent edge, the tint and the corner radius that say "you missed this" are
  untouched; only the two hairlines the tinted background already implied are gone.
* **`max-height: none; overflow: visible`** — there is nothing left to clip, and a clip that a hit area
  depends on is the defect itself. It also means a longer skill name or the audit's 20 px text-zoom pass
  now *grows* the strip instead of cutting the sentence off.
* **`content: none` on the pseudo** — the hatch is switched off rather than left to fight the box, so
  the next reader cannot mistake it for load-bearing.
* Both copies are spelled out because the collapse is (keyboard open) **OR** (short viewport) and CSS
  cannot put a media query and a selector in one condition. `@container` is not an option here:
  `#dock` is viewport chrome outside every card container (notes/LAYOUT-ROOT.md §"Documented
  exceptions"), and the trigger genuinely *is* about the device — an OS keyboard and the viewport's
  **height**, which §"@container or @media?" lists as @media's proper business. No per-viewport
  geometry was added: the row's height comes from its own content at every size.

**Answer room** (app header bottom → dock top), the thing the collapse exists to protect:
375×667 kb-open 442.2 → **442**; 375×380 kb-open 155.2 → **155**; 1280×500 290.2 → 275;
844×390 180.2 → **165** — the landscape phone pays 15 px because its strip was 28.8 px tall and a
tappable control cannot be. At 844×390 the answer field is still fully visible above the dock
(read: `qa/screenshots/fix-boss-miss/after-chromium-844x390-kbfalse-heart.png`), and the audit's
`unreachable-answer` / first-control-above-the-dock checks pass at every viewport.

---

## 3. The auditor was blind twice over. Both holes are closed.

### (a) No state rendered the strip — now three do

`boss-b4-heart-lost` walks the boss until the hearts are gone, so it settles on `.boss-continue` and
the probe never saw `#dock .boss-miss` at all. The new states stop at the **first** miss with the card
(and therefore the dock) still mounted:

| state | what it renders |
|---|---|
| `boss-b4-miss-dock` | heart lost, the strip re-homed into the dock ("Drill 5") |
| `boss-b4-miss-dock-kb` | the same with the on-screen keyboard open (the collapsed one-row form) |
| `boss-b4-miss-setup-kb` | submitted with the equation setup empty: the amber strip and "Skip the setup" |

The `-kb` states pin `data-kb="open"` the way an OS keyboard would: **only while the viewport is
phone-sized, and re-applied after every resize** — the app's own `keyboardInset()` watcher rewrites
that attribute on every visualViewport resize and would otherwise wipe it the moment the auditor
changed size, and pinning it at every width would invent a configuration (a 2560 px desktop with an
on-screen keyboard) no student can reach. Verified: `kb=open` at 320/375, `closed` at 844×390 and
1900×1200, and it survives the sweep.

### (b) The detector credited 1 px of border it shouldn't have — fixed at the source

With the states added but the CSS still un-fixed, the auditor fired at 844×390 (`hit box 53.3x28.8`,
10 majors across both engines and themes: `qa/audit/bossmiss-before.json`) — but stayed **silent at
375×667 with the keyboard open**, where the real hit box is 41.8. The reason:

> `clipBoxOf()` used `getBoundingClientRect()`, which is the **border** box. Overflow clips at the
> **padding** edge. The strip's border box is 43.8 px, the detector's floor is 43.5 px, so a **single
> 1 px hairline** was the whole difference between "43.8, fine" and the 41.8 px target a thumb
> actually gets.

`clipBoxOf()` now subtracts the clipper's own border widths. It is strictly more accurate — it is where
the browser really clips — and it is pinned by a plant of its own, `#plant-hairline-hit`: a 19 px link
inside an `overflow: hidden` strip whose border box is **exactly** 44 px (a plant one pixel less
honest than the bug it stands for would pass the detector it is meant to calibrate). Its silent twin
`#ctl-hairline` on the clean page is the **fixed** form of the same strip, so neither "credit the
border box" nor "assume every clipper steals 44 px" can pass the self-test.

Negative control, run both ways:

| what was un-fixed | what the self-test said |
|---|---|
| the padding-edge subtraction neutralised (`0*bw(...)`) | `FAIL MISSED tap-target (a 19px link whose hit area is clipped by a 44px strip's PADDING edge)` |
| the CSS fix un-done by `--inject` (old geometry, both copies) | 3 majors at 844×390 across the 3 new states |
| the CSS fix un-done, states present, **before** the detector fix | 10 majors — all at 844×390, **none** at the keyboard-open size (that is the hole this closed) |

`node qa/layout-audit.mjs --selftest --engine both` → **PASS**, 9 plants caught (8 + the new one),
clean control silent, in chromium and webkit.

This was a change to a file this ticket does not own (see BUILD-POLICY §2). Blast radius was measured,
not assumed: **the whole 95-state catalog × 375×667 / 844×390 / 1440×900 × light+dark × chromium+webkit
→ 0 findings** (`qa/audit/fix-boss-miss-blastradius.json`, 278 s). It cannot manufacture findings
elsewhere either: the only other live negative-inset hatches in the app belong to controls that are
already `var(--tap)` boxes, so a tighter clip box can never push them under the floor (that is what the
lint in the test file checks), and the other consumer (`clipInk`, the overlap detector) only ever
*loses* a 1 px sliver of ink that a border was painting over anyway.

---

## 4. How it is verified

```
cd /Users/oliver/Projects/unit1a-quest
node qa/fix-boss-miss.mjs --engine both                                  # 20 combinations, ALL PASS
node qa/layout-audit.mjs --selftest --engine both                        # 9 plants, both engines
node qa/layout-audit.mjs --only boss-b4 --engine both                    # my slice: 0 findings
node --test tests/fix-boss-miss.test.mjs                                 # 8 tests
```

* **`node qa/fix-boss-miss.mjs --engine both` → ALL PASS (20 combinations)**: both strip shapes × 5
  viewports × chromium + webkit, every hit box ≥ 44×44, no document overflow, strip 44 px in every
  collapsed configuration and 62–96 px un-collapsed.
* **`node qa/layout-audit.mjs --only boss-b4-miss,boss-b4-heart-lost,boss-b4-mid-run --engine both`
  (17 viewports × light+dark × chromium+webkit, + the text-zoom and reduced-motion passes) → 0
  findings, 0 blockers, 0 majors** (`qa/audit/bossmiss-after.json`). Before: 10 majors.
* **`node --test` → 1336 tests, 1332 pass, 0 fail, 4 skipped** (1320 + this ticket's 8, plus whatever
  the lanes running beside this one appended in the same hour — the number that matters is **0 fail**).
* **PNGs read** (chromium, both themes, at `qa/screenshots/fix-boss-miss/` and the scratchpad set):
  phone 375×667 (keyboard open **and** closed), tablet 834×1112, laptop 1440×900, wide 1900×1200 and
  the landscape phone 844×390, in light **and** dark, for all three states — plus zoomed crops of the
  strip itself. The collapsed row reads as one tidy 44 px band: two clamped lines of the miss sentence,
  the accent edge, and the link as an underlined 44 px box on the right. Nothing else on any of those
  screens moved.

## 5. Requests for other owners

* **`polish.css` "mock r2" owner:** your block still *declares* `max-height: 44px; overflow: hidden`
  and `min-height: 0; padding: 0` on `#dock .boss-miss[ .btn]`, plus the two dead
  `::before { inset: -14px -8px }` hatches. They are all overridden from the end of the file (both
  copies, later in the cascade), but the honest fix is to delete those five declarations and the two
  pseudo rules from your block. `tests/fix-boss-miss.test.mjs` pins the *effective* values, so folding
  them in will not break it.
* **`qa/layout-audit.mjs` owner (fix:qa lane):** the padding-edge clip box and the
  `#plant-hairline-hit` plant are yours now — §3(b) above is the whole rationale, and the note in the
  code points back here. The **remaining** documented boundary is untouched and still real: the
  detector measures an element's own border box unclipped by its **ancestors**, so a 44 px control
  inside an `overflow: hidden` box shorter than itself still reports 44. It no longer hides anything in
  this app (nothing is clipped that way any more), but it is still the detector that class of defect
  deserves.
* **`boss.js` owner:** nothing required. If the collapsed row ever needs to shed the link entirely,
  do it by not rendering it, not by shrinking it — the strip's height comes from the control now.
