# FIX:B1 — App shell header (the two blockers), round 1

Ticket FIX:B1. Owned: `site/index.html` · `site/js/app.js` · `site/css/base.css` · the
`/* === fix:B1 … === */` block appended at the end of `site/css/polish.css`.

Both assigned blockers were **one element**, present on every screen in the app: the header's
T−N / "set test date" chip, `a#hdr-tminus`.

---

## 1. The findings, and the one cause behind them

| # | sev | type | where it was measured |
|---|---|---|---|
| 1 | BLOCKER | `collapsed-text` on `a#hdr-tminus` | 9 states (home-fresh, home-post-test, onboard-1-setup, onboard-2-sandbox, onboard-3-intro, placement-item-1, placement-item-2, run-morning, run-post-test) × 320×568 and 360×740 × light+dark × chromium+webkit — **44 measurements** |
| 2 | BLOCKER | `overlap`, `a#hdr-tminus` vs `span#hdr-xp` | home-post-test + run-post-test × 320×568 × light+dark × both engines — **8 measurements** |

**Root cause — `polish.css` L256 (`home r2`):**

```css
.hdr a.chip { position: relative; overflow: visible; text-overflow: clip; }
.hdr a.chip::before { content: ''; position: absolute; inset: -12px -4px; }
```

That rule exists to buy a 44 px tap target on a 24 px pill: a negative-inset `::before` grows the
hit box, and `overflow: visible` keeps it from being clipped away. But the thing it switched off is
`base.css`'s own guard on `.chip` —

```css
max-width: 100%; min-width: 0; overflow: hidden; text-overflow: ellipsis;   /* truncates before it can overlap */
```

— whose comment says exactly what it was for. **The hit box was bought by making the chip a box that
nothing is clipped to, and the chip's text walked out with it.**

The second half of the cause is the header row itself: every responsive rule in it was one
`@media (max-width: 420px)` keyed to the *viewport*, and it only shrank the gaps. The row packs a
44 px home/ring target, one item made of **words**, and then a level ring, an XP number, a combo pip,
a protractor streak and a 44 px theme button — and nothing said what gives way when they stop fitting.
At 320 px the flex row squeezed the pill to **21.5 px** while `"after the test"` needs **96.5 px**, so
~80 px of ink printed straight across the level ring and `1840 XP`.

Measured before (chromium and webkit identical), viewport 320×568:

| chip label | chip box | chip ink | `.hdr-right` starts | ink over `#hdr-xp` |
|---|---|---|---|---|
| `set test date` | 68 → 89.5 (21.5 px) | 77 → **154.8** | 97.5 | 23.3 px |
| `TEST DAY` | 68 → 89.5 | 77 → 139.6 | 97.5 | 8.1 px |
| `after the test` | 68 → 89.5 | 77 → **157.5** | 97.5 | **26.0 px** |

A quieter one the old net could not see: even at **430 px** the chip was 79.8 px wide with ink running
to 157.5 — a 10 px spill — because the `≤ 420 px` media rule *un-compacts* the right cluster at 421
(combo multiplier back, XP back to `--fs-2`), which costs 51 px while the viewport only gained 16. It
stayed under `collapsed-text`'s 60 px floor, so it was never reported. It is gone too.

---

## 2. What changed

### a. `site/css/polish.css` — `/* === fix:B1 … === */` (appended at the end; nothing rewritten)

**The hit target stops being an escape and becomes the box.**

* `.hdr a.chip` is itself `height: var(--tap)` and `min-width: var(--tap)` — a real, clippable
  **44 × 44** target — and `overflow: hidden; text-overflow: ellipsis` goes **back on**.
* the 24 px pill S5 asks for is painted *inside* it by `::before` at `inset-block: 10px;
  inset-inline: 0` (44 − 2×10 = 24), `z-index: -1`, so it sits behind the label and above `.hdr`'s
  own background. Being inside the box, the restored `overflow: hidden` has nothing to clip.
* the pill's ring uses `border-color: inherit`, and the `<a>` keeps its computed `border-color`
  (only `border-width` is zeroed), so `.chip[data-tone="warn" | "accent" | "bad"]` still colours it —
  verified on all four states (`set test date` warn, `T−5` plain, `TEST DAY` accent, `after the test`
  plain) in both themes.
* `flex: 0 1 auto` + `min-width: var(--tap)`: it may shrink as a last resort, but never past the tap
  floor, so it ellipsizes *inside* the shell instead of pushing the document into horizontal scroll —
  and a < 60 px text box is still something `collapsed-text` reports. The fix does not make the
  auditor blind; the tiers below are what keep it from ever needing to shrink.
* `:focus-visible` gets `outline-offset: -8px` + `border-radius: 999px` so the ring hugs the visible
  pill rather than the invisible 44 px box.

### b. `site/css/base.css` — the header lays itself out from its **own** width

Per `notes/LAYOUT-ROOT.md` § "@container or @media?": `.hdr-inner` is now
`container-type: inline-size; container-name: hdr`. The header's own inline size is not the viewport
(it is 2 × `--gutter` narrower on every phone and `--col + 24 + --rail` capped on a wide screen), and
every rule below is about whether *this row's* boxes still fit. A container cannot query itself, so
the gap between the two clusters moved from `.hdr-inner { gap }` (not queryable) to
`.hdr-right { margin-inline-start }` (queryable). Nothing `position: fixed` lives in the header, so
the layout containment is safe (`tests/layout-root.test.mjs` pins that rule and still passes).

**The narrow-width behaviour**: the row holds exactly one item made of words, and the words win.
The read-outs shed worst-value-first, and each one that goes still says what it said:

| `@container hdr` | what sheds | what still carries it |
|---|---|---|
| `max-width: 399.98px` | combo multiplier (`.combo-n`), XP drops to `--fs-1`, gaps 8 → 6 | the pip's colour tier + `#hdr-combo`'s `aria-label` (this is the old `@media (max-width: 420px)` rule, re-keyed) |
| `max-width: 371.98px` | streak count (`.streak-n`), gaps → 4 | the protractor arc's angle + `#hdr-streak`'s `aria-label` |
| `max-width: 341.98px` | the XP number, **visually only** (screen-reader-only, not `display: none`) | still announced; the level ring beside it shows the same progress; Home's hero and `#/stats` print it in full |

`.hdr-xp` uses the 1 px + `clip` pattern, which the auditor's own `srHidden()` recognises, so it is
never mistaken for collapsed text.

**Why those three numbers.** Demand of the *widest* state of the row — `"after the test"` (96.5 px),
`"12480 XP"` (62.6 px), a two-digit streak — plus ~7 px of headroom:

| tier | row demand | threshold | first viewport it covers |
|---|---|---|---|
| everything on | 44 + 8 + 96.5 + 8 + 247 ≈ **403** | — | ≥ 432 |
| combo/XP compact | 44 + 6 + 96.5 + 6 + 212.3 ≈ **365** | ≤ 400 | 432 … 400 |
| streak count off | 44 + 4 + 96.5 + 4 + 186.6 ≈ **335** | ≤ 372 | 400 … 374 |
| XP number off | 44 + 4 + 96.5 + 4 + 120 ≈ **268.5** | ≤ 342 | 373 … 320 (288 available at 320: 19.5 px slack) |

So a 375 or 390 px phone keeps its XP counter; only a 360 or 320 px window gives it up.

### c. `site/index.html`, `site/js/app.js` — **unchanged**

The markup and the header renderer were never the cause and did not need to move. Listing them as
owned does not oblige a change; touching them would only have added risk.

---

## 3. The measurements after

`node qa/layout-audit.mjs --only home-fresh,home-post-test,onboard-1-setup,onboard-2-sandbox,onboard-3-intro,placement-item-1,placement-item-2,run-morning,run-post-test --engine both`

```
before:  52 findings (44 defects + 12 waived)  BLOCKER×52  collapsed-text×44  overlap×8   → FAIL
after:    0 findings ( 0 defects +  0 waived)                                            → PASS
```

The 12 **waived** hits were the one tap-target waiver on `a#hdr-tminus`. They are gone too — not
waived, *absent*: the chip now measures 44 × 44 on its own, so the detector never fires. (See
Requests: the waiver can be narrowed.)

Direct probe (worst-case content: `12480 XP`, streak 18, combo 10, level 12, readiness 100), all four
chip states × 12 widths × chromium **and** webkit, numbers identical in both engines:

| vp | chip `after the test` | ink | hit box | escape beyond the box | ink over `#hdr-xp` | `scrollWidth`/`innerWidth` |
|---|---|---|---|---|---|---|
| 320 | 64 → 160.5 (96.5) | 72 → 152.5 | 98 × 44 | 0 / 0 | **0** | 320 / 320 |
| 360 | 64 → 160.5 | 72 → 152.5 | 98 × 44 | 0 / 0 | 0 | 360 / 360 |
| 373 | 64 → 160.5 | 72 → 152.5 | 98 × 44 | 0 / 0 | 0 | 373 / 373 |
| 374 | 64 → 160.5 | 72 → 152.5 | 98 × 44 | 0 / 0 | 0 | 374 / 374 |
| 375 | 64 → 160.5 | 72 → 152.5 | 98 × 44 | 0 / 0 | 0 | 375 / 375 |
| 390 / 398 / 414 / 430 | 96.5 | inside | 98 × 44 | 0 / 0 | 0 | no overflow |
| 768 / 1024 / 1900 | 96.5 | inside | 98 × 44 | 0 / 0 | 0 | no overflow |

* the chip **never shrinks below its label** at any width — `after the test` is 96.5 px everywhere,
  `set test date` 93.8, `TEST DAY` 78.6, `T−5` 44 (the tap floor);
* the ink is always **inside** the box (72 → 152.5 within 64 → 160.5): nothing spills, nothing is
  ellipsized;
* the hit box is **44 × 44 with zero escape** (the `elementFromPoint` scan stops at the element's own
  edges, ±1 px), so it is a real target rather than an invisible overhang;
* no horizontal document overflow at any width;
* the XP shed boundary lands exactly where the arithmetic says: `#hdr-xp` is 62.6 px wide at a 374 px
  viewport and 1 px (screen-reader-only) at 373.

**Screenshots read** (`qa/screenshots/fix-b1/`), phone · tablet · laptop · wide, both themes:
`320-light-post.png`, `320-dark-morning.png` (accent `TEST DAY`), `375-light-post.png`,
`375-dark-post.png`, `834-light-fresh.png` (warn `set test date`), `834-dark-tminus.png`,
`1440-light-tminus.png`, `1900-light-place.png`, `1900-dark-post.png`. In every one the pill is a
clean 24 px stadium with its full label, correctly toned, and the status cluster sits clear of it.

`node --test`: **1304 tests, 1300 pass, 0 fail, 4 skipped** — unchanged, no test edited.
`node qa/layout-root.mjs --engines chromium,webkit` (20 states × 10 widths × 2 engines): re-run after
this change, still ALL PASS.

---

## 4. Requests for other owners

1. **`qa/r2-home-pins.mjs` (home r2 owner) — `node qa/r2-home-pins.mjs chip` now reports 4 FAILED,
   and the assertion is the thing that is out of date, not the app.** Line 80 reads

   ```js
   check(r.hit[1] >= 44 && r.up9 && r.down9, `${tag}: chip "${r.text}" visual ${r.visual.join('×')} hit ${r.hit.join('×')} (±9 px: ${r.up9}/${r.down9})`);
   ```

   `up9` / `down9` assert that the hit box **escapes the element's own box by ≥ 9 px** — i.e. they pin
   the `overflow: visible` overhang that caused both of this ticket's blockers. The target is still
   44 px; it is now the box itself (`visual 44×44 hit 44×44`, `visual 93.8×44 hit 94×44`). Suggested
   replacement, which checks the same intent *and* the new invariant:

   ```js
   check(r.hit[0] >= 44 && r.hit[1] >= 44 && !r.up9 && !r.down9, `${tag}: chip "${r.text}" visual ${r.visual.join('×')} hit ${r.hit.join('×')} (no escape: ${!r.up9}/${!r.down9})`);
   ```

   I did not edit it: `qa/` is not in this ticket's owned list, and silently relaxing another lane's
   checker is worse than reporting it.

2. **`qa/audit-allow.json` (audit-harness owner) — the one live waiver is now dead and its reason was
   never right.** Entry 1 waives `tap-target` for, among others, `#hdr-tminus`, saying "the T-minus
   chip sits inside the 48px-tall `#hdr-home` / `#/settings` anchors". It does not sit inside
   `#hdr-home` — `#hdr-tminus` **is** the anchor, and it was 24 px tall. It now measures 44 × 44 and
   produced **0 waived hits** across 9 states × 17 viewports × 2 themes × 2 engines. Please drop
   `#hdr-tminus` from that selector list so the waiver stops covering a case it no longer describes.

3. **`polish.css` `home r2` owner —** L256–257 (`.hdr a.chip { overflow: visible; text-overflow: clip }`
   and the `inset: -12px -4px` `::before`) are now dead weight: the fix:B1 block later in the file
   overrides every declaration in them. Delete them when you next touch that block; leaving them
   costs nothing but they are the rule this ticket exists to undo.

4. **Anyone adding to the header —** the row is now budgeted, not improvised. Adding an item means
   re-deriving the four numbers in §2b (`notes/FIX-B1` table) and adding a shed tier for it; adding a
   second item made of words means deciding which set of words loses. `@container hdr` is the handle.
