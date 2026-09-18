# FIX:B5 — Mock rules and the report (round 1)

Lane B5 of the TRIAGE split. Two findings, both the student's own bug one level down: a grid track
sized by whatever today's content happens to be, and a control that is only text-sized.

Owned: `site/js/screens/mock.js` · `site/js/screens/report.js` · the `/* === fix:B5 … === */` block
appended at the end of `site/css/polish.css`. Nothing else was touched.

Re-check command:

```
node qa/layout-audit.mjs --only mock,run-baseline,report --engine both --no-selftest --no-confirm
```

---

## Finding 3 — the Mock rules section table (MAJOR, detected BLOCKER)

`article.mock-rules > ul.mock-secs > li.mock-sec > span.mock-sec-c` — `mock-rules` and
`run-baseline`, **all 19 viewports, both engines, both themes** (380 measurements).

### Root cause

`.mock-sec` was `grid-template-columns: 24px minmax(min(100%, 12ch), 1fr) auto`. LAYOUT-ROOT gave the
**name** track a `ch` floor and left the other two sized by content:

* the third track holds the item COUNT and was `auto` — "whatever the digits happen to need". Every
  section in the packet is a single digit today, so it resolved to **7.78 px**, under the auditor's
  8 px zero-track floor, on every viewport in both engines.
* the first track holds the section LETTER and was a bare `24px` — a px constant that does not move
  when the reader's text does.

Neither is a "the count is invisible" bug today. Both are the pattern
`notes/LAYOUT-ROOT.md` §"Every text track has a floor" bans, for the reason the section gives: the
track's size is an accident of the current content, so the first longer content re-negotiates the row
at the moment it is most crowded — a section of ten Vocab items would have taken its second digit's
width out of the section NAME, which is the only part of the row that has to fit words.

### What changed (`polish.css`, block `fix:B5`)

```css
.mock-sec { grid-template-columns: max(24px, 2ch) minmax(min(100%, 12ch), 1fr) minmax(2ch, auto); }
.mock-sec-c { text-align: end; font-variant-numeric: tabular-nums; }
```

* the count column can never be narrower than two digits, and `auto` still lets a three-digit count
  grow;
* the letter column keeps its 24 px look but can never be narrower than its own letter, at any text
  zoom (`max(24px, 2ch)`);
* `text-align: end` keeps the digits flush with the row's right edge — exactly where they paint
  today, so the fix is invisible at one digit — and `tabular-nums` lines `4` up with `11`.

No JS change: the row is markup + CSS, and the defect was entirely in the track sizing.

### Measured

`.mock-sec` computed `grid-template-columns`, first row of the Mock rules card. The **before** row is
what `qa/layout-audit.mjs` reported on every one of the 19 viewports in both engines; the **after**
rows are measured per breakpoint class (the card is capped at `--col`, so 834 / 1440 / 1900 agree):

| | chromium | webkit |
| --- | --- | --- |
| before (all viewports, as the audit printed it) | `24px 582.219px 7.78125px` | `24px 582.21875px 7.78125px` |
| after · 375×667 | `24px 232.84px 20.16px` — count 2.46 ch | `24px 233.47px 19.53px` — count 2.41 ch |
| after · 834 / 1440 / 1900 | `24px 568.59px 21.41px` — count 2.61 ch | `24px 569.45px 20.55px` — count 2.53 ch |

**The two-digit stress is the point.** Every count rewritten to `12` in the live page, all
viewport × theme × engine combinations:

| rule | 1 digit | 2 digits | what moved |
| --- | --- | --- | --- |
| old (`… 1fr auto`, re-injected over the live page, `!important`) | `24px 244.88px 8.13px` | `24px 236.77px 16.23px` | the section NAME loses **8.1 px** to the count |
| new (`… 1fr minmax(2ch, auto)`) | `24px 232.84px 20.16px` | `24px 232.84px 20.16px` | **nothing** — the count was already reserved |

(The re-injected "old" count reads 8.13 px rather than the audit's 7.78 px because the injection
cannot take back `font-variant-numeric: tabular-nums`; the track behaviour is what the experiment is
for.) With the new rule, at every size and in both engines: count `clipped: false`, every section name
`clipped: false`, document horizontal overflow `false`.
Screenshots: `qa/screenshots/fix-b5/mock-rules-*.png` and `mock-rules-2digit-*.png`.

---

## Finding 15 — the report's source link (MAJOR)

`li.report-item > div.report-item-b > p.report-src > a.report-src-a` — `mock-report-expanded`,
19 viewports, both engines, both themes. Hit box **86.3 × 16** (webkit 86.3 × 15.3).

### Root cause

"Open the card" / "Play it again" is the route from a missed question back to the card that teaches
it — a navigation ACTION — but it was rendered as an inline `<a>` inside the sentence, so its hit box
was a line of 12 px text. The report is the screen a student reads on a phone, with a thumb, right
after a Mock. Every other action in the report (`← Today`, `RUN THE MISSES`, `RETRY SAME SEED`,
`← Report`) is a `.btn`, i.e. `min-height: var(--tap)`; this one just never got the class.

### What changed

`report.js` — the source line is a row, and the action is a chip:

```js
const line = h('p.report-src.muted.fs-1', src.text);
box.append(src.href
  ? h('div.report-srcrow', line, h('a.btn.report-src-a', { href: src.href }, src.label))
  : line);
```

`polish.css` (block `fix:B5`):

```css
.report-srcrow { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 12px; }
.report-srcrow > .report-src { flex: 1 1 min(100%, 22ch); min-width: 0; margin: 0; }
.report-srcrow > .report-src-a { flex: 0 0 auto; min-height: var(--tap); padding-inline: 12px; font-size: var(--fs-1); }
```

The height comes from `--tap` via `.btn` — one token owns the 44, so it cannot drift from the rest of
the app. `flex: 1 1 min(100%, 22ch)` is the same rule the grids follow: the sentence has a floor, and
below the threshold the row becomes one column with the TEXT full width and the chip on its own line,
never a squeezed sentence.

**Outlined `.btn`, not `.btn-ghost`, on purpose.** A ghost chip paints only its label, so its 12 px of
padding reads as a 12 px indent the moment the row wraps to the phone layout; a bordered box aligns on
its own edge, which is where the sentence above it starts. Confirmed by reading both.

### Measured, after

`a.report-src-a` hit box, expanded item 10 of the Mock #1 report, chromium **and** webkit:

| viewport | hit box | row |
| --- | --- | --- |
| 375×667 | **115.4 × 44** | wrapped — chip on its own line under the sentence |
| 834×1112 | **115.4 × 44** | one line, sentence 490.6 px, chip at the right edge |
| 1440×900 | **115.4 × 44** | one line |
| 1900×1200 | **115.4 × 44** | one line |

Both themes identical, no document overflow anywhere.
Screenshots: `qa/screenshots/fix-b5/report-src-*.png`.

---

## One extra, found by reading the screenshots

The source sentence printed **"This was ASN 18. from the packet."** — `numbering()` returns the
teacher's own punctuation (`18.` on the ASN/DOC/WP sheets, `10)` on the angle sheets), which is right
on the card's numbering chip and wrong inside a sentence: it reads as a full stop mid-line. The prose
form now strips that trailing punctuation only where it is inlined (`report.js`, `sourceLine`):

```js
const no = numbering(item.cardId).replace(/[.)]+$/, '');
```

→ "This was ASN 18 from the packet." The card's own chip, the Binder and everything else still show
the teacher's numbering exactly as the packet prints it. `tests/mock.test.mjs` still passes
(`/^This was WP/` and the Variant line are unchanged).

---

## Verification

* `node qa/layout-audit.mjs --only mock,run-baseline,report --engine both` (6 states × 17 viewports ×
  2 themes × 2 engines + the text-zoom and reduced-motion passes):
  * **before: 472 findings — 380 BLOCKER zero-track (the count column) + 92 MAJOR tap-target
    (76 the source link, 16 the figure wedge).** `verdict: 380 blockers, 92 majors → FAIL`
  * **after: 16 findings — 0 BLOCKER, 16 MAJOR, all 16 the ONE defect that is not this lane's**
    (see below). Reports: `qa/audit/b5-before.json`, `qa/audit/b5-after.json`.
* `node --test`: **1304 tests, 1300 pass, 0 fail, 4 skipped** (the same numbers as before the ticket).
* Screenshots read at phone 375×667, tablet 834×1112, laptop 1440×900 and wide 1900×1200 in **both
  themes**, chromium and webkit, for both screens plus the two-digit stress:
  `qa/screenshots/fix-b5/` (48 PNGs). The driver that produced them and the track measurements is a
  scratch script, not committed — everything it asserts is reproducible from the audit command above.

### What is still MAJOR in these states, and why it is not mine

`svg.fig.fig-fan g.fig-wedge path.fig-wedge-hit` — hit box **86 × 37.7** at 320×568 on `mock-mid` and
`mock-mid-map`, both engines, both themes (16 measurements, 1 defect). That is TRIAGE defect **#3, the
41 px figure wedge**, assigned to lane **B3** (`site/js/figure/svg.js`, `site/css/figure.css`) — it
shows up here only because the Mock hosts a card that draws a fan figure. Not touched: those files are
not in this ticket's ownership, and patching the wedge from `polish.css` would be exactly the
per-symptom patch the ticket forbids.

## Requests for other owners

* **`tests/layout-root.test.mjs` owner:** the static lint reads `grid-template-columns` declarations
  and only checks the shell column and the paper's two tracks by hand. Two cheap additions would pin
  this lane: (a) no `grid-template-columns` may end in a bare `auto`/`1fr` track whose grid child
  carries text — at minimum assert `.mock-sec`'s third track is a `minmax(Nch, …)`; (b) every `<a>`
  the app renders as an action carries `.btn` (a grep of `site/js/screens/*.js` for `h('a.` with no
  `.btn` and an `href` that is not a plain body link). I did not add them: `tests/` is not in this
  ticket's file list.
* **LAYOUT-ROOT block owner (`polish.css`):** `.report-answers` is `minmax(0, max-content) minmax(min(100%,
  12ch), 1fr)`. The key track has a 0 floor, so by the letter of the convention it wants one. It is
  NOT flagged by the audit on any of the 19 viewports, including the 200 % text-zoom pass, because the
  second track's `min(100%, 12ch)` leaves it real room; and giving it a floor too would make the sum of
  the two floors + the 12 px gap a candidate for overflowing a 320 px row. Left alone deliberately —
  it wants a decision, not a reflex.
