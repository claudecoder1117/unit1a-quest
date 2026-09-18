# qa/audit/TRIAGE.md — full-matrix triage (ticket TRIAGE, 2026-09-17)

Machine-side triage of `qa/audit/report.json`. Human summary: `notes/AUDIT-TRIAGE.md`.

```
node qa/layout-audit.mjs                 # 92 states x 17 viewports (+ text-zoom + animations passes)
                                         # x light/dark x chromium/webkit = 6 992 measured screens, ~17 min
```

## 1. Is the net trustworthy? (do this before believing any number below)

| check | result |
| --- | --- |
| `node qa/layout-audit.mjs --selftest` | **PASS** — 7/7 planted defects caught in chromium **and** webkit; clean control silent (0 findings, 0 console). |
| injected real regression `--inject '.card-stem{width:12px}'` on `placement-item-1`, `card-num` @1900x1200 | **CAUGHT** — 4 BLOCKER `collapsed-text` (both engines): *"text (113 chars) in a 12px content box; 86 rendered line(s)"*. The PNG is the student's own bug, one letter per line. |
| same command without `--inject` | **0 findings** — no false alarm on the fixed app. |
| `--inject '.card-paper{min-width:1400px}'` @375x667 | **CAUGHT** — BLOCKER `doc-overflow`, culprit named (`article.card-paper`, overflows by 1041px). |
| `--inject '.card-hint-btn{height:18px;width:30px}'` @375x667 | **CAUGHT** — `tap-target` 30x18, plus `overlap` and `offscreen` fallout. |
| `node --test` | 1300 pass / 0 fail / 4 skipped. |

`--inject "<css>"` was added by this ticket: it injects CSS into every page of a run (sweep, clean-load
confirm and screenshot) via `addInitScript`, so a deliberately broken rule behaves exactly like a
regression shipped in `site/css` — **nothing on disk is touched**. This is the mutation test that turns
"the detectors pass their own fixtures" into "the detectors catch a live defect".

### Two detector faults found and fixed BEFORE triage (the first run was 65 % noise)

The first full matrix returned **6 703 findings / 317 groups**. Measured, not guessed
(`qa/audit/png/binder-ap-1-list-320x568-light-chromium.png` + a DOM probe), the two biggest groups were
the auditor's fault, not the app's:

1. **Ink was measured through a clip.** `Range.getClientRects()` returns a rect for a line that
   `-webkit-line-clamp: 2` never paints. Probe on `.bnd-row-stem` at 320x568: box `545–586`, clip
   `overflow:hidden`, clamp `2`, **ink lines at 546, 566 and 587–605** — the third line is invisible and
   was landing on `p.bnd-hint` below it. That single fact produced 10 Binder "row stem covers the panel
   hint" BLOCKERs, 5 Home "skill name covers the next skill name" BLOCKERs and the Drill "title covers
   the progress counter" BLOCKER. **Fixed:** ink is intersected with the clip box of its clipping
   ancestors (`clipInk`), and an element whose every line is clipped away is not an overlap candidate.
2. **`clipped-text` did not know what a line clamp is.** It read only `text-overflow: ellipsis`, so
   every deliberate two-line clamp (Binder list rows — the state catalog literally describes them as
   *"two lines then a clamp"* — Home rail skills, the card's skill meta) was reported as an accidental
   clip. **Fixed:** `-webkit-line-clamp`/`line-clamp` count as ellipsis intent, **and** the stem rule was
   *tightened* at the same time — a clamped question now blocks on vertical overflow too, not only
   horizontal.

Both changes are guarded by **two new plants** (`#plant-clip`, `#plant-clamp-stem` in
`qa/audit/selftest.html`), because a rule loosened without a plant is a rule that can go quietly blind.
After the change the self-test still catches all seven plants in both engines and the injected
`.card-stem{width:12px}` still produces the identical four blockers.

### One blind spot found and closed

Everything inside `header.hdr` and `#dock` was excluded from the overlap pair check (correct for
chrome-vs-content, which has its own scroll-aware checks — wrong for chrome-vs-**its own bar**). The
header's own contents were therefore never checked against each other. Chrome-internal pairs are now
checked, and the very first run with the change found a **new BLOCKER the old net could not see**: at
320x568 the header chip `a#hdr-tminus` ("after the test") prints straight through `span#hdr-xp`
(`home-post-test`, `run-post-test`, both engines, both themes).

Known remaining limitation (documented, not fixed): text shorter than 2 characters is not an overlap
candidate, so the same chip running through the level ring's "1" glyph is only caught indirectly, by
`collapsed-text` noticing the chip box was squeezed. It *is* caught — but by the neighbouring rule.

## 2. Totals (final run — `qa/audit/report.json`, 1 014 s)

| | |
| --- | --- |
| states x viewports x themes x engines | 92 x 19 (17 + `@zoom20` + `@motion`) x 2 x 2 = **6 992 measured screens** |
| findings (measurements) | **2 380** — BLOCKER 452 · MAJOR 1 916 · MINOR 12 |
| waived (printed, never hidden) | **328** |
| report `groups` (type+state+theme+engine+selector) | **162** |
| distinct defects (type+state+selector) | **49** |
| **root defects (type+selector, the fix list)** | **16** |
| states with any finding | 40 of 92 |

### by type (measurements → root defects)

| type | measurements | root defects |
| --- | --- | --- |
| tap-target | 1 128 | 3 |
| contrast | 612 | 6 |
| zero-track | 380 | 1 |
| squeeze | 152 | 1 |
| clipped-text | 44 | 2 |
| collapsed-text | 44 | 1 |
| overlap | 20 | 2 |
| doc-overflow / offscreen / unreachable-answer / console / harness | **0** | 0 |

Nothing overflows the document, no control is off screen or behind the dock, no answer control is
unreachable, and **not one console error or failed request** in 6 992 screens.

### by engine / theme

Every root defect except two reproduces in **both** engines and (where colour-independent) both themes.
webkit-only: `card-termmatch` MC option graze at 844x390 (MINOR). Light-only: the six contrast defects
(dark mode passes) except `sheet-print`, which is dark-only.

### Severity: as detected vs as triaged

The detector's severity is a rule; these are the honest calls, using "does it hide or mangle something a
student must read or tap?".

| # | detected | triaged | why |
| --- | --- | --- | --- |
| 3 `.mock-sec-c` zero-track | BLOCKER | **MAJOR** | The count column resolves to 7.8 px, but today's counts are single digits and still paint. It is a no-floor track — the exact rule LAYOUT-ROOT banned — and a two-digit count breaks it. Fragile, not yet unreadable. |
| 4 `h1.run-title` clipped | BLOCKER | **MAJOR** | "Drill 5 · Word Pr…" at ≤ 414 px. The full skill name is repeated in the chip row immediately below, so nothing is lost — but a truncated title on the run header is not the bar. |
| 9 hint-ladder `squeeze` | MAJOR | **MINOR** | Verified in the PNG: "Hint 3 of 3 · one step from the end" wraps to two lines and reads fine. |
| 10 `.sum-tile` clipped | MAJOR | **MINOR** | Fires **only** in the animations-enabled pass at one viewport: it is the tile mid-flip during the mint. Confirm with `--only run-page-summary --no-extra` (clean) vs default. |
| 16 termmatch MC graze | MINOR | **MINOR** | 16 % graze, webkit, landscape phone only. |

## 3. The 16 root defects, bucketed

Buckets are **file-disjoint**. Every bucket appends its CSS to the end of `site/css/polish.css` inside
its own tag and touches no other bucket's files. No bucket rewrites `screens.css` or `widgets.css`
(BUILD-POLICY §2: new CSS goes in a tagged `polish.css` block).

### B1 — App shell header (2 BLOCKERs, the student-visible ones)

`files: site/index.html · site/js/app.js · site/css/base.css · polish.css block /* === TRIAGE:hdr === */`

| # | sev | type | where | detail |
| --- | --- | --- | --- | --- |
| 1 | BLOCKER | collapsed-text | `a#hdr-tminus` — 9 states (`home-fresh`, `home-post-test`, `onboard-1/2/3`, `placement-item-1/2`, `run-morning`, `run-post-test`), 320x568 + 360x740, both engines, both themes | text (13 chars) in a 35 px content box; **it spills out of the box**. Measured at 320: chip box `68→121`, chip **ink `77→155`**, `.hdr-right` starts at 129 → "set test date" prints through the level ring and its "1". |
| 2 | BLOCKER | overlap | `a#hdr-tminus` vs `span#hdr-xp` — `home-post-test`, `run-post-test`, 320x568, both engines, both themes | overlaps by 265–275 px² (32 %) — **text is covered**. "after the test" runs into "1840 XP". |

**Root cause (found, not guessed):** `site/css/polish.css:256`
`.hdr a.chip { position: relative; overflow: visible; text-overflow: clip; }` — an earlier round turned
off `base.css`'s own guard (`.chip { overflow:hidden; text-overflow:ellipsis }`, comment: *"truncates
before it can overlap"*) so a `::before` hit box would not be clipped. The chip can now paint outside
itself, and `.hdr-left` squeezes it to 51 px at 320 while the text keeps its natural 86 px.
**Fix direction:** get the 44 px hit target without disabling the clip (hit box on a wrapper / padding
rather than an escaping `::before`), and give the header a sane narrow-width behaviour (shorter label or
a wrap) so the chip is never squeezed below its text. PNGs:
`qa/audit/png/home-fresh-320x568-light-chromium.png`, `home-post-test-320x568-light-chromium.png`.

Re-check: `node qa/layout-audit.mjs --only home,onboard,placement,run-morning,run-post-test --vp 320x568,360x740,375x667,390x844`

### B2 — Ink tokens: every contrast defect (6 MAJORs)

`files: site/css/theme.css · polish.css block /* === TRIAGE:ink === */`  (CSS only — no JS, no markup)

| # | sev | type | where | detail |
| --- | --- | --- | --- | --- |
| 6 | MAJOR | contrast | `.card-head .card-meta span.rarity` — 9 card states, light, 19 vps | 3.70:1 (needs 4.5) — `#A66F00` on paper |
| 8 | MAJOR | contrast | `.card-result .card-result-top span.rarity.card-rarity` — 2 states, light | 3.70:1 for 15 px text |
| 11 | MAJOR | contrast | `.sum-hist .sum-hist-list li span.rarity` — `run-page-summary`, light | 3.70:1 |
| 7 | MAJOR | contrast | `.w-rootcase .w-steps .w-step-t` — 2 states, light | 4.37:1 (`#178A55` on white) |
| 12 | MAJOR | contrast | `.sum-readiness .sum-rd-line .sum-rd-delta` — `run-page-summary`, light, 11 vps | 4.46:1 (`#D92D4C` on `--bg`) |
| 13 | MAJOR | contrast | `.screen.sh p.sh-stamp` — `sheet-print`, **dark only**, 19 vps | 2.97:1 — the print sheet forces a white page but keeps the dark theme's `--muted` |

**One root cause for 6/8/11:** `.rarity` paints its text in `--gold` (`#A66F00`), the *fill* token. S5 is
explicit: `--accent`/`--gold` are for fills (≥ 3:1), and text uses the `-ink` pair. `polish.css` already
defines `--gold-ink: #8A5C00` for exactly this and applies it to `.rd-band` / `.skill-m` — `.rarity` was
missed. 7 and 12 are the `--ok`/`--bad` text pair needing the same treatment; 13 is a themed token
leaking into a forced-white print surface.

Re-check: `node qa/layout-audit.mjs --only card,run-page-summary,sheet --theme both --engine chromium`

### B3 — Figure wedges: the 44 px rule (2 MAJORs, 13 states)

`files: site/js/figure/svg.js · site/css/figure.css · polish.css block /* === TRIAGE:fig === */`

| # | sev | type | where | detail |
| --- | --- | --- | --- | --- |
| 5 | MAJOR | tap-target | `svg.fig.fig-fan g.fig-wedge path.fig-wedge-hit` — 13 states (`card-classify`, `card-multipart`, `card-notation`, `card-pairs`, `card-rootcase-*`, `card-strip`, `mock-mid`, `mock-mid-map`, `run-page-item-1`, `run-upgrade`, `variant-fig-pairs`), 16 vps, both engines, both themes | hit box **93.4 x 40.9** (< 44 x 44) |
| 14 | MAJOR | tap-target | same, `.fig-wedge.is-linked` — `card-rootcase-cases` | same 93.4 x 40.9 |

S5 says "wedge hit areas ≥ 44 px" in so many words, and S9 #9 logged this as the one unfixed caveat
(42 px at 375). It is 3 px, it is every figure card, and the fix is in the hit-path geometry, not the
drawing. Fallbacks (the side list, the typed `m∠…` field) exist, which is why it is MAJOR and not a
BLOCKER.

Re-check: `node qa/layout-audit.mjs --only card-classify,card-pairs,card-strip,card-notation,card-rootcase,card-multipart,variant-fig,mock-mid,run-page-item-1,run-upgrade --engine both`

### B4 — Run chrome: drill title and the mint (1 MAJOR, 1 MINOR)

`files: site/js/screens/run.js · polish.css block /* === TRIAGE:run === */`

| # | sev | type | where | detail |
| --- | --- | --- | --- | --- |
| 4 | MAJOR *(detected BLOCKER)* | clipped-text | `.run-head .run-titles h1.run-title` — `run-drill-cs-lin`, 320/360/375/390/414, both engines, both themes | title truncated with an ellipsis (scrollWidth 241 > clientWidth 142) — "Drill 5 · Word Pr…" |
| 10 | MINOR *(detected MAJOR)* | clipped-text | `.sum-mint .sum-tiles li span.tile.sum-tile` — `run-page-summary`, **`1900x1200@motion` only** | overflow x 128 > 58 — the tile mid-flip during the mint |

Fix direction for 4: let the title wrap to two lines below ~430 px instead of ellipsising (the progress
counter is a separate track — it does not need the room). For 10: confirm it is the animation
(`--no-extra` is clean) and either reserve the tile's width during the flip or accept it as transient —
**do not** "fix" it by removing the mint, which S5 calls the signature moment.

Re-check: `node qa/layout-audit.mjs --only run-drill,run-page-summary --vp 320x568,360x740,375x667,390x844,414x896,1900x1200`

### B5 — Mock rules and the report (1 MAJOR, 1 MAJOR)

`files: site/js/screens/mock.js · site/js/screens/report.js · polish.css block /* === TRIAGE:mock === */`

| # | sev | type | where | detail |
| --- | --- | --- | --- | --- |
| 3 | MAJOR *(detected BLOCKER)* | zero-track | `.mock-rules .mock-secs li.mock-sec span.mock-sec-c` — `mock-rules`, `run-baseline`, **all 19 vps**, both engines, both themes | grid child collapsed to 7.8 px but carries text; parent `grid-template-columns: 24px 582.219px 7.78125px` |
| 15 | MAJOR | tap-target | `li.report-item .report-item-b p.report-src a.report-src-a` — `mock-report-expanded`, 19 vps, both engines, both themes | hit box **86.3 x 16** |

3 is a text track with no floor — the exact pattern `notes/LAYOUT-ROOT.md` §"Every text track has a
floor" bans (`minmax(min(100%, Nch), auto)`), and `tests/layout-root.test.mjs` lints for it. It survives
today only because every section count is one digit.

Re-check: `node qa/layout-audit.mjs --only mock,run-baseline,report --engine both`

### B6 — Card side rail and two widgets (2 MINORs)

`files: site/js/screens/card.js · site/js/widgets/mc.js · site/js/widgets/termmatch.js · polish.css block /* === TRIAGE:card === */`

| # | sev | type | where | detail |
| --- | --- | --- | --- | --- |
| 9 | MINOR *(detected MAJOR)* | squeeze | `.card-side .hint-ladder button.card-hint-btn span.muted` — `card-wp-01-hint`, `card-wp-04-hint`, 19 vps | text block 17.1ch inside a 27.7ch container |
| 16 | MINOR | overlap | `.w-mc .wd-opts button.wd-opt span.wd-opt-t` — `card-termmatch`, **webkit only**, 844x390 | 1 183 px² (16 % of the smaller box) |

Lowest priority in the audit; neither hides nor mangles anything. 16 is landscape-phone + webkit, so
verify it in webkit before and after.

Re-check: `node qa/layout-audit.mjs --only card-wp-01-hint,card-wp-04-hint,card-termmatch --vp 844x390,375x667,1280x800 --engine both`

## 4. Waived hits — every one, with its reason

Waivers live in `qa/audit-allow.json`; waived hits are **counted and printed**, never hidden, and do not
affect the exit code.

| type | selector | hits | states | reason on file | triage verdict |
| --- | --- | --- | --- | --- | --- |
| tap-target | `#hdr-readiness, #hdr-level, #hdr-xp, #hdr-combo, #hdr-streak, #hdr-tminus, .ring, .combo, .streak` | **328** (all of them on `a#hdr-tminus`, 37.4 x 48) | 82 | "Header status read-outs. The readiness ring and the T-minus chip sit inside the 48 px-tall `#hdr-home` / `#/settings` anchors, which ARE ≥ 44 px; the inner spans are decoration reported by the DOM as their own hit boxes." | **Hold, then re-check.** The height half is true (48 px). The width half is not: `#hdr-tminus` is a *sibling* of `#hdr-home`, not inside it, and 37.4 px wide is the same squeeze that produces BLOCKERs 1 and 2. **B1 must re-measure it after the header fix and drop the `#hdr-tminus` half of this waiver if it then passes.** |
| contrast | `.sr-only, [aria-hidden="true"]` | 0 this run | — | "Visually-hidden or aria-hidden text is never read on screen; its computed colour is meaningless." | Correct, and it cost nothing this run. |

No other waiver was used. No finding was suppressed by any other means.

## 5. What a fix lane must do

1. Fix the root cause, never the viewport (`notes/LAYOUT-ROOT.md` §3 is the convention list).
2. Re-run **your bucket's command above**, in both engines.
3. Then `cd /Users/oliver/Projects/unit1a-quest && node qa/layout-audit.mjs` (full matrix) and
   `node --test` before calling it done.
4. New CSS goes at the **end** of `polish.css` in your own tagged block. Never rewrite the file.
