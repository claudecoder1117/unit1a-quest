# FIX-home (round 3) — Home's "Weak spots" rows, and the two faults found next to them

Ticket `fix:home r3`. One assigned finding, worked to zero; two more of the same family found by
looking for them, both on the same screen, both measured before and after.

Owned/changed files:
* `site/css/polish.css` — three appended blocks, all tagged `/* === fix:home r3 === */` (the file is
  append-only and other lanes appended between mine, hence three).
* `qa/fix-home-r3.mjs` — new; the measured check (chromium + webkit, 320 → 2560, both themes,
  100 / 125 / 150 / 200 % text), with `--inject` for mutation tests.
* `tests/fix-home-r3.test.mjs` — new; 10 tests, static lints with their own negative controls plus
  one browser test that skips without Playwright.

Nothing under `site/js` was touched. No test was changed or deleted.
`node --test`: **1338 tests, 1334 pass, 0 fail, 4 skipped** (1328 before this ticket + 10).

---

## 1. The assigned finding

> major · overlap · `home-midweek`, `home-mock-cta`, `home-post-test` ·
> `.weak-list > .weak-row > .weak-main > .weak-name` over `.weak-row > .weak-m.mono` ·
> 320x568 and 375x667 at 125 % text zoom · chromium AND webkit ·
> "Always/Sometimes/Ne50", 157 px² / 27 % in chromium, 371 px² / 66 % in webkit.

Reproduced first, in both engines, before touching anything — and it is **worse than the finding
says**: it fires at the **default** text size too. `node qa/fix-home-r3.mjs --engines chromium
--zooms 16,20`, before:

| state | viewport | text | overlap: name × number | name × "Drill 5" |
|---|---|---|---|---|
| all three home states | 320x568 | 100 % | **742 px² (101 % of the number)** | 461 px² (15 %) |
| all three home states | 320x568 | 125 % | **928 px² (100 %)** | **1480 px² (49 %)** |
| all three home states | 375x667 | 100 % | 34 px² (5 %) | — |
| all three home states | 375x667 | 125 % | **928 px² (100 %)** | — |

24 of 24 measurements failed (3 states × 2 viewports × 2 themes × 2 text sizes), identically in
light and dark.

### Root cause — two faults, and the second is the one the round's own rule names

**(a) A TRACK floor is not a CONTENT floor.** The LAYOUT-ROOT block already gave `.weak-row` the
prescribed idiom (`polish.css` §6: `minmax(min(100%, 12ch), 1fr) 32px auto`). That stops the track
collapsing; it says nothing about what the *words* do when the track is narrower than a word.
`.weak-main` is itself a grid whose implicit column is `auto`, i.e. min-content sized, and
`.weak-name`'s `overflow-wrap: **break-word**` does not participate in intrinsic sizing (only
`anywhere` does). So min-content stayed the width of the longest unbreakable run —
"Always/Sometimes/Never:", measured **199 px (20.4ch) at fs 16, 241 px at fs 20, 286 px at fs 24** —
`.weak-main`'s box stayed 199 px inside a 134 px cell, and `min-width: 0` (there so the name cannot
push the TRACK wider) is what turned that overflow into an **overlap** instead of a page-wide
stretch. Same class as the student's original report, one level down: a floor on the box, nothing on
the words.

**(b) The row had no stacked form at any width.** `.st-skills li` drops to
`"name val" / "bar bar" / "meta drill"` under its container. `.weak-row` was three columns from
320 px to 2560 px. Once the 12ch floor can no longer hold the name there is nowhere for it to go —
and LAYOUT-ROOT's rule is *"below the threshold the grid is ONE column, the text is never
squeezed"*. This row never had a below.

### What changed (polish.css, part 1)

1. **`.home-weak` is the query container** (`weakcard`). It is the direct parent of `.weak-list`, so
   its content box **is** the row's width — 254 px at 320, 309 px at 375, 646 px at every viewport
   ≥ 768, 622 px at 1024. The row can never be sized off the window again. It hosts no
   `position: fixed`/`absolute` descendant, so `container-type`'s layout containment captures nothing
   (LAYOUT-ROOT §checklist #4).
2. **`overflow-wrap: anywhere`** on `.weak-name`. Same rendering — a break is only taken where the
   line would otherwise overflow — but min-content drops to one character, so the name can never be
   wider than its cell. `text-overflow`/`line-clamp` would be wrong here: the row exists to say
   *which* skill is weak, so the name may wrap but must never be hidden (see §3).
3. **`.weak-main { display: contents }`**, in both forms, so name / bar / number / button are all
   grid items of `.weak-row` and one set of `grid-template-areas` describes both layouts — no change
   to `home.js`'s DOM. `.weak-main` is a bare presentational div with no role, so removing its box is
   safe.
4. **The default is the STACKED form; the one-row form is what the container query switches on.**
   That direction is the fail-safe one: a browser that fails to match the query gets the readable
   layout, never the overlapping one (the same choice LAYOUT-ROOT made for `.card-screen`).
5. **`.weak-m`'s track** was a bare `32px`, sized for today's two digits at today's font. Now
   `minmax(max(32px, 2.5ch), auto)`: identical at fs 16, 36.8 px at fs 24 — the number can no longer
   clip or spill leftwards over the name as the text grows. Same shape as `.mock-sec`'s count column
   (`fix:B5`).

### The stacked form: two rejected designs, and the arithmetic that rejected them

A grid column costs its width in **every** row, which is what decided this:

| form | measured | verdict |
|---|---|---|
| `"name num"` / `"bar bar"` / `"drill drill"` | **1060 px of card at 375x667** | rejected — five full-bleed buttons, the tallest thing on Home, no longer a list |
| `"name num"` / `"bar drill"` | column 2 = max(32, 68) = 68 px, so the name track is 229 px at 375 and **174 px at 320** vs the name's 199 px min-content | rejected — mid-word break on the narrowest phone at the **default** text size (seen in the screenshot, not reasoned about) |
| **`"name name name"` / `"bar num drill"`** | the name's line is the whole container: **254 px at 320, 309 px at 375**; row 2 is bar (130 / 185 px) · number · "Drill 5"; ~70 px per skill | shipped |

Column 1 of the stacked form is `minmax(0, 1fr)` and carries **no** ch floor on purpose: the only
thing in it is the 6 px `.skill-bar`, because the name spans all three columns. (See §4 — a floor
there is not merely useless, it overflows.)

### The one-row threshold: `calc(22ch + 124px)`

Mixed units because half the row does not scale with the text: **124 px** = 12 px gap + the number's
32 px + 12 px gap + the 68 px "Drill 5" button, and the button is 68 px at every zoom because
`--fs-2` is an absolute 15 px. **22ch** is the name's own measured min-content (20.4ch) plus ~8 %
headroom, so the moment the row goes to one line the name track is 22ch and the longest name in the
app still fits **without a mid-word break**. In `ch` and not px for the reason `fix:mock r2` gives
for `reportrow`: at 150 % text the need grows and a px threshold keeps promising room that is gone.
`calc()` in a container condition was verified live in **both** engines before it was relied on.

Never dead (the `tests/fix-stats.test.mjs` §dead-threshold rule): the container tops out at 646 px
and the threshold is 339 px at fs 16, 448 px at fs 24, 555 px at fs 32. Where it switches:

| viewport | container | fs 16 | fs 20 | fs 24 |
|---|---|---|---|---|
| 320 | 254 | stacked | stacked | stacked |
| 375 | 309 | stacked | stacked | stacked |
| 430 | 364 | **one row** | stacked | stacked |
| 768 / 834 / 1440 / 1900 / 2560 | 646 | one row | one row | one row |
| 1024 | 622 | one row | one row | one row |

### Measured after

`node qa/fix-home-r3.mjs --engines chromium,webkit --zooms 16,20,24 --vps 320x568,375x667,430x932,768x1024,834x1112,1024x768,1440x900,1900x1200,2560x1440`
→ **324 measurements, 0 failures.** Per measurement it asserts: no two cells of a `.weak-row` or
`.skill-row` share pixels (the name measured as the *ink*, `.weak-name`, not the wrapper that hid the
overlap from the matrix), no grid track under 8 px, no clipped name, no document horizontal overflow,
and "Drill 5" ≥ 44 px tall. Representative rows:

| viewport | text | tracks | areas | name box | number | Drill 5 |
|---|---|---|---|---|---|---|
| 320x568 | 100 % | `254 / 32 / 68` | stacked | 254×20 | 32×23 | 44 |
| 320x568 | 150 % | `205 / 37 / 68` | stacked | 254×60 | 37×35 | 44 |
| 375x667 | 125 % | `185 / 32 / 68` | stacked | 309×25 | 32×29 | 44 |
| 1440x900 | 100 % | `522 / 32 / 68` | one row | 522×20 | 32×23 | 44 |
| 1440x900 | 150 % | `517 / 37 / 68` | one row | 517×30 | 37×35 | 44 |

**The app's own auditor**, which is the acceptance gate: `node qa/layout-audit.mjs --only home
--engine both` → **0 findings, 0 blockers, 0 majors, PASS** (92-state matrix restricted to the five
home states × 17 viewports × 2 themes × 2 engines + the text-zoom and reduced-motion passes).
The finding's own repro command, scoped to these states, also reports **0**.

### Negative controls — a check that cannot fail its own defect is worthless

| what was un-fixed (via `--inject`, nothing on disk touched) | what the check said |
|---|---|
| the pre-fix row (`12ch/32px/auto`, no areas, `break-word`) | 16/16 fail: `overlap weak-name × weak-m 928px² 100%` at 375/fs 20 — the finding's own numbers |
| the same, through **`qa/layout-audit.mjs --only home --inject …`** | **27 blockers**, and the report reads `.weak-name overlaps .weak-m.mono by 157px² (27 % of the smaller box) — text is covered` — *the finding, verbatim* |
| `.weak-name{overflow-wrap:break-word}` alone, at 200 % text | 4/4 fail: document h-overflow 36 px (chromium) / 42 px (webkit) |
| the 8ch floor put back on the stacked bar column | 4/4 fail: h-overflow 9 px / 13 px (see §4) |
| the `.skill-name` clamp put back | 8/8 fail: `clipped skill-name shows 36 of 54px "Always/Sometimes/Never: Points, Lines, P"` (see §3) |

The middle row is the important one: the **app's own auditor** goes from 27 blockers to 0, so this
fix is not passing only my own harness.

---

## 2. Screenshots read (not just taken)

`.home-weak` and the full page, chromium **and** webkit, light **and** dark, at 320 / 375 / 834 /
1440 / 1900, at 100 / 125 / 150 % text — read during the fix, which is how the two rejected stacked
forms were rejected. The phone (375), tablet (834), laptop (1440) and wide (1900) classes were read
in both themes. Scratch dir (git-ignored, not committed):
`/private/tmp/.../scratchpad/homr3/{after,after2,after3,final}`.

---

## 3. Found next to it, same family: the Skills rail was HIDING a skill name

`screens.css:221` is `display: -webkit-box; -webkit-line-clamp: 2; overflow: hidden`, with the
comment *"two lines, never an ellipsis that hides which ASN skill this is"* — and it did exactly
that. Measured on `home-midweek`, both engines, both themes (the row's font-size is the absolute
`--fs-2`, so text zoom does not move these numbers):

| viewport | `.skill-name` box | needs | shown | hidden |
|---|---|---|---|---|
| 320 | 138 × 36 | 73 px | 36 px | 1 of 3 lines |
| 375 | 193 × 37 | 55 px | 37 px | 1 of 3 lines |
| 1440 / 1900 | 170 × 37 | 55 px | 37 px | 1 of 3 lines |
| 834 | rail full width | — | — | nothing hidden |

"Always/Sometimes/Never: Points, Lines, Planes" is one of nineteen skill names **and one of the two
the student is being told to drill**. Same root cause as §1 — a text cell that cannot hold its
content — resolved the other way: it *hides* ink instead of printing it over a neighbour.

**Root fix, not a bigger clamp:** a line clamp is a promise about height that the content can always
break, so the clamp goes (`display: block`, `-webkit-line-clamp: none`, `overflow: visible`). The
name wraps to as many lines as it needs — three, for one skill, 37 → 55 px, i.e. 18 px of extra
rail. After: **0 clipped names** at 320 / 375 / 834 / 1440 / 1900, both engines, both themes, at
100 / 125 / 150 % text.

`overflow-wrap: anywhere` rides along on `.skill-name` as defence in depth, and the honest note is
that **today it changes nothing here**: with the clamp gone, `break-word` and `anywhere` both give a
170 × 55 box on three lines (that mutation test *passes*). It cannot differ, because `.skill-row`'s
width is definite, so column 1 is 170 px whatever min-content says. The distinction only bites where
a track **is** sized from min-content — exactly what §1 measured — and both names now carry the same
declaration rather than two a future lane has to reason about separately.

---

## 4. Found by this ticket's own 200 %-text control: the limit of the `min(100%, Nch)` idiom

Worth writing down because part 1 walked straight into it.

LAYOUT-ROOT says a floor "can never cause overflow" because `min(100%, …)` can never be wider than
the grid. True — **for one floored track**. It says nothing about the **sum**: `100%` clamps each
floor against the whole grid, never against the grid *minus its other tracks*. Part 1's first
stacked template was

```
minmax(min(100%, 8ch), 1fr)   minmax(max(32px, 2.5ch), auto)   auto
```

and at 320 px with 200 % text those minima add up to **8ch (157) + 2.5ch (49) + 68 (button) + 24
(gaps) = 298 px of tracks inside a 254 px card**: the cells spilled past the card and the **document
scrolled sideways, 9 px in chromium and 13 px in webkit**. Every floor obeyed the idiom; the row
still overflowed. Isolated by forcing `.home-today` to one column so only this card could be the
cause, and confirmed in a 40-line standalone repro.

> **Convention to add to LAYOUT-ROOT §"Every text track has a floor":** when a grid has more than
> one floor, check the **sum of the minima against the container**, not each floor against 100 %.

The fix is not a cleverer floor, it is not needing one: in the stacked form column 1 holds only
`.skill-bar`, because the name spans the row — the floor was protecting a 6 px progress bar. Column 1
is `minmax(0, 1fr)` now, the row's minima come to `2.5ch + 68 + 24`, and that fits 254 px at every
text size the app can be read at. The wide form keeps its 12ch floor, where column 1 really does hold
the name and its own threshold guarantees the fit. `min-width: 0` on the row is the belt.
After: **0 horizontal overflow at 320x568 and 375x667, both engines, at 100 / 125 / 150 / 200 % text.**

---

## 5. How to re-run

```
node qa/fix-home-r3.mjs                       # 3 states x 2 vps x 2 themes x 2 engines x 3 zooms
node qa/fix-home-r3.mjs --engines chromium,webkit --zooms 16,20,24,32 \
     --vps 320x568,375x667,430x932,768x1024,834x1112,1024x768,1440x900,1900x1200,2560x1440
node qa/fix-home-r3.mjs --inject '<css>'      # mutation test: put a defect back, prove it fails
node qa/fix-home-r3.mjs --shots <dir> --tag t # one .home-weak PNG per failing/125 % measurement
node qa/layout-audit.mjs --only home --engine both
node --test tests/fix-home-r3.test.mjs
```

`tests/fix-home-r3.test.mjs` pins, statically: `.home-weak` is the `weakcard` container; no
`.weak-*` template is behind a width `@media`; the **default** form is the stacked one and the name
spans its first row; the stacked form spends no ch floor on the bar column while the wide form keeps
its 12ch floor; the threshold is a `ch + px` calc that clears 20.4ch and is reachable inside the
card's cap; and neither name clamps or uses `break-word`. Every one of those lints is also run
against **synthetic mutated CSS** in the same file, so a green suite means they can still fail.

---

## 6. Requests for other owners

* **The `.home-today` owner (the LAYOUT-ROOT block in `polish.css`, ~L836).** The §4 sum mistake,
  one card up on the same screen: `@media (max-width: 480px) { .home-today { grid-template-columns:
  repeat(2, minmax(min(100%, 8ch), 1fr)) } }` gives **two** columns a floor that may each reach
  100 % of the grid. At 320 px / 200 % text `.stat-goal` measures **323 px in a 288 px card** — 36 px
  of document overflow in chromium, 42 px in webkit, and the largest single source of it on Home. The
  honest fix is a per-column share (`min(50% - <half the gap>, 8ch)`) or an `auto-fit` re-derivation
  of that card's tile count. **Not patched from here**: a third copy of that template in a later
  block is how the rot in `notes/FIX-stats-r2.md` started. (Below 200 % text there is no overflow, so
  this is not in the audit's current range either.)
* **The `qa/layout-audit.mjs` owner.** Two gaps this finding exposes, both about the net rather than
  the app:
  1. **The text-zoom pass runs at 1900x1200 only** (`--extra`, L1029-1035). Every one of the 15
     blocker measurements behind my finding needed `--vp 320x568,375x667` **plus** a hand-written
     `--inject 'html{font-size:20px}'` — i.e. the matrix cannot reach its own worst case, because
     text zoom and a phone width are exactly the combination that breaks a row. Suggest the extra
     pass run at the narrowest viewport in the list as well as the widest.
  2. **Two defects on these five states are invisible to the matrix at the default text size.**
     Measured, not guessed — with the *whole* defect injected back (the pre-fix row template **and**
     the `.skill-name` clamp) and no zoom:
     `node qa/layout-audit.mjs --vp 320x568,375x667 --engine both --theme both --no-extra
     --no-selftest --only home --inject '<the pre-fix CSS>'` → **0 findings, PASS**, while
     `qa/fix-home-r3.mjs` reports 24/24 overlap failures (742 px², 101 % of the number) and 8/8
     clipped-name failures on the same states. So:
     * **overlap**: the detector compares in-flow siblings, and the overlapping ink here is
       `.weak-name` *inside* `.weak-main`, whose own box stayed in its cell — the wrapper hid the
       defect. Suggest descending to text-bearing leaves, or comparing any two text leaves whose
       nearest common grid ancestor places them in different cells. (Under 125 % zoom it *does* fire,
       which is why the finding reached me at all.)
     * **clipped-text**: a 2-line `-webkit-line-clamp` that hides a third line of a **skill name** is
       not caught, though the self-test proves the detector catches a line-clamped *stem*. Suggest
       widening what counts as protected text beyond the question stem — an identifier the student is
       told to act on ("Drill 5" next to it) is not decoration.
* **The `.skill-row` / T10 rail owner — cosmetic, measured, not fixed.** With the §3 clamp gone, the
  1440/1900 rail breaks the longest name **mid-word**: "Always/Sometimes/Neve" / "r: Points, Lines,
  Planes". The name track is **170 px** and "Always/Sometimes/Never:" needs **~175 px** — five pixels.
  Either would fix it: a 64 px `.skill-bar` track instead of 72 px, or a `U+200B` after each "/" in
  the name `home.js` renders (a DOM change, which is why it is a request and not a patch). It is
  strictly better than the clamp it replaced — nothing is hidden — and it does not appear in the
  Weak-spots card, which shows the same name on one line from 430 px up.
* **The `screens.css` owner.** `.skill-name`'s clamp (L221) and `.weak-name`'s `break-word` (L210)
  are *neutralised* from the blocks at the end of `polish.css`, both directions. The honest fix is to
  change the two declarations in place and delete my overrides.
