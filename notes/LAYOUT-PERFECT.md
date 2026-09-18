# LAYOUT-PERFECT — the final gate (ticket FINAL, 2026-09-18, build 2026-09-17e)

> "dude what is this garbage? the question is going vertical and is hard to read. make sure to find all
> similar mistakes and make sure the app is perfect."

This is the close-out of that report: the last full run of both gates, the student's own case re-measured
by hand, one full desktop session read screen by screen, the one defect that pass still found, and an
honest list of everything left — **with every waiver and the reason for it**.

Ticket-owned files: `notes/LAYOUT-PERFECT.md`, `notes/HANDOFF.md`, `notes/S9-SCORECARD.md`,
`site/js/app.js` (+`softWrap`), `site/js/screens/{home,stats,report}.js` (the call sites),
`tests/final-layout.test.mjs`, `package.json`, `README.md`, `.github/workflows/pages.yml`,
`site/version.js`, `qa/final-verify.mjs`, `qa/final-names.mjs`.

Read first: `notes/LAYOUT-ROOT.md` (why the bug happened and the conventions that replaced it),
`notes/AUDIT.md` (the detectors), `notes/AUDIT-TRIAGE.md` (what the first sweep found).

---

## 1. The two gates, final run

### `node --test`

```
tests 1350 · pass 1346 · fail 0 · skipped 4 · 108 s
```

(1338 before this ticket; +12 from `tests/final-layout.test.mjs`. The 4 skips are the pre-existing
browser-dependent ones.)

### `npm run audit` — the full matrix

```
node qa/layout-audit.mjs --workers 3
LAYOUT AUDIT — 0 findings (0 waived) in 1331s
verdict: 0 blockers, 0 majors → PASS
```

| | |
|---|---|
| states | **95** (every screen state in `qa/audit-states.mjs`; 95/95 reached their own root selector) |
| viewports | **17**, 320×568 → 2560×1440, including `844×390` landscape phone and the student's **1900×1200** |
| plus | a `1900x1200@zoom20` text-zoom pass and a `1900x1200@motion` animations-enabled pass per state |
| themes | light **and** dark |
| engines | **chromium and webkit** (webkit is Safari — the student's browser) |
| ≈ measured screens | **7 220** |
| findings | **0** — 0 blockers, 0 majors, 0 minors, 0 unconfirmed, 0 waived |
| detector self-test | **9 planted defects caught, 0 missed, 0 findings on the clean control**, in *both* engines, run as the preamble (the matrix refuses to sweep on broken detectors) |
| report | `qa/audit/final-matrix.json` (git-ignored), generated 2026-09-18T05:16:49Z |

For scale: the first sweep of this matrix (ticket TRIAGE) returned **6 703** findings, of which ~85 % were
the auditor's own two bugs; after those were fixed it stood at 2 380 findings / **16 real defects**, which
the six B-lanes then cleared. This run is the same matrix, stricter detectors, **zero**.

### The strictest configuration: the same matrix with NO waivers

A pass that leans on its allow-list is not a pass, so the **whole matrix was run a second time** with
`qa/audit-allow.json` emptied to `{"version":1,"entries":[]}` — same 95 states, 17 viewports, both
themes, both engines:

```
LAYOUT AUDIT — 0 findings (0 waived) in 1331s
verdict: 0 blockers, 0 majors → PASS          (qa/audit/nowaiver-full.json)
```

**Nothing in the app is being carried by a waiver.** See §5 for what that means for each entry.
`qa/audit-allow.json` was restored from a copy and is byte-identical to its two documented entries in
this commit (`git diff qa/audit-allow.json` → empty).

---

## 2. The student's own case, measured by hand

`node qa/final-verify.mjs place` — **webkit** (= Safari), a cleared save, `#/onboard?step=3` → Start →
**PLACEMENT item 1**, at the window he used and two more. PNGs in `qa/screenshots/final/` (git-ignored),
all three **read by eye**, not just measured.

| | 1900×1200 | 2560×1440 | 1280×800 |
|---|---|---|---|
| `.card-host` | 1024 px, `container-type: inline-size` | 1024 px, inline-size | 1024 px, inline-size |
| `.card-screen` tracks | `680px 320px` | `680px 320px` | `680px 320px` |
| `.card-paper` tracks | `314px 280px` | `314px 280px` | `314px 280px` |
| **`.card-stem` content box** | **314 px = 30.6 ch** | **314 px = 30.6 ch** | **314 px = 30.6 ch** |
| the question renders on | **3 lines** (113–119 chars) | **3 lines** | **3 lines** |
| document h-overflow | 0 px | 0 px | 0 px |
| console errors | 0 | 0 | 0 |

**On the live site that stem measured 0 px and the paper's tracks were `0px 250px`** — one letter per
line. The three windows now measure *identically*, which is the point of the fix: the card reads its own
host, so the viewport no longer changes the answer.

Read by eye at 1900×1200 (`place-item1-1900x1200-webkit.png`): the question is three lines of prose in
the left half of the paper, the figure (U/W/T/F with its rays) sits in the right half, "Scratch — show
your work (S)" is in its own 320 px rail with nothing overlapping it, the notation builder and the
letter row are below, Submit is in the dock. The run header ("Placement · Notation", 1/8) is clear of
the card. Nothing is piled on anything.

`node qa/final-verify.mjs place` exits non-zero if any of it regresses (stem < 60 px or < 18 ch, a 0 px
paper track, a question on more lines than `chars / 12`, any h-overflow, any console error).

---

## 3. One full session at desktop width, read screen by screen

`node qa/final-verify.mjs walk --w 1900 --h 1200` — webkit, 1900×1200, 13 screens, **0 console/page
errors, 0 flags** (`qa/screenshots/final/walk-*.png`, every one read):

placement item 1 → items 2–4 → Home (midweek fixture) → Today's Page items → Binder → Mock rules →
Settings. Two honest notes about the driver, not the app:

* The walker cannot *advance* a pairs card or a notation builder (it types a well-formed wrong answer;
  those widgets need a build or a pick), so walk 03/04 are re-renders of the placement card and 08/09/10
  re-renders of the Page's pairs card. **The app is right and the driver is dumb** — "0 of 1 pair found"
  is the widget correctly refusing `999999`.
* Genuine item-to-item traversal is covered instead by the state catalog, which prepares each step
  properly. All **95 states were shot at 1900×1200 in webkit** (`node qa/audit-selftest.mjs --browser
  webkit --w 1900 --h 1200 --shots …`, 95/95 reached, 0 misses) and the ticket's screens were read there:
  `placement-item-2` (a real item 2, with the ✗ tick on segment 1), `home-midweek`, `run-page-item-1`,
  `run-page-mid`, `run-page-summary`, `binder-*-list` / `-tiles`, `mock-rules`, `mock-report-expanded`,
  `stats`, `settings`.

Everything read clean except one thing, which is in §4.

---

## 4. The defect this pass found and fixed: the last mid-word break

**Home's Skills rail printed `Always/Sometimes/Neve` / `r: Points, Lines, Planes`** — the word "Never"
cut in half — at *every* desktop width, in *both* engines, in both themes. Same for
`…/Neve` / `r: Angles`. It is the student's complaint in miniature: text broken where no reader would
break it.

**Why no detector saw it.** The text is not collapsed (the box is 170 px, as designed), not clipped, not
overlapping, not overflowing, and its line count is reasonable. Every detector in `notes/AUDIT.md` was
right to stay quiet. **A detector that measures boxes cannot see a bad break** — so the measurement was
added: `qa/final-names.mjs` reconstructs each rendered line character by character (`Range` per
character, grouped by line top) and fails when a line ends inside a word:

```
before:  webkit 1900px  home rail  [.skill-name]  box 170px
             line 1: "Always/Sometimes/Neve"   <-- BREAKS MID-WORD
             line 2: "r: Points, Lines, Planes"
         → 4 names break mid-word  (2 skills × 2 engines)

after:   no name breaks mid-word at 320 / 375 / 834 / 1280 / 1900 / 2560 px, webkit + chromium
```

**Root cause.** Two of the nineteen skill names are `Always/Sometimes/Never: …` — a **23-character run
with no space in it**. `.skill-row`'s name column is a definite 170 px inside the 320 px rail, and
**CSS has no way to break after a slash** (`word-break`/`line-break` can only make things worse, and
`hyphens` does not apply). `fix:home r3` had correctly put `overflow-wrap: anywhere` on the name so it
could never be wider than its cell — and `anywhere`'s last-resort break lands wherever the line runs
out, which is mid-"Never". Its own note recorded that `break-word` and `anywhere` "both give a 170×55
box on three lines": true, and the box was never the problem.

**The fix is a break opportunity, not a bigger box.** `softWrap()` in `site/js/app.js` returns the name
split after each `/` with a **`<wbr>`** between the pieces, so the break is taken at
`Always/Sometimes/` and the word survives. `<wbr>` and not a zero-width space on purpose: it adds **no
character**, so `textContent`, ARIA names, copy-paste and every test that compares a skill name are
byte-identical. Used at all four places a skill name reaches the DOM:

| file | element | screen |
|---|---|---|
| `site/js/screens/home.js` | `span.skill-name` | Home · the 19-skill rail (where the break was) |
| `site/js/screens/home.js` | `span.weak-name` | Home · Weak spots |
| `site/js/screens/stats.js` | `span.st-skill-name` | Stats · Skills |
| `site/js/screens/report.js` | `span.report-sk-n` | Mock report · per-skill table |

The CSS `overflow-wrap: anywhere` **stays** underneath as defence in depth: `softWrap` means that break
is never *reached* on today's names, but a future name with a long token still needs the floor under it.

**Pinned** by `tests/final-layout.test.mjs` (12 tests): `softWrap`'s behaviour (including that it adds no
character and leaves a trailing slash alone), and each of the four call sites by name. **Negative
control run:** removing `...softWrap` from the rail's `h('span.skill-name', …)` fails
`FINAL: every screen that prints a skill name spreads softWrap over it`; the file was restored from a
copy (never `git stash` — other lanes have work in this tree).

`softWrap` is exported from `app.js` beside `h()` rather than copied into three screens; that is a new
export in a file this ticket does not otherwise own, and it is recorded here and in §7 as a Request.

---

## 5. Every waiver, and its reason

`qa/audit-allow.json` has exactly **two** entries. Both carry a reason (the auditor ignores an entry
without one and says so on stderr), and a waived hit is **counted and printed**, never deleted.

| type | selector | states | reason | status in this run |
|---|---|---|---|---|
| `tap-target` | `#hdr-readiness, #hdr-level, #hdr-xp, #hdr-combo, #hdr-streak, #hdr-tminus, .ring, .combo, .streak` | `*` | Header status read-outs. The readiness ring and the T−N chip sit inside the 48 px-tall `#hdr-home` / `#/settings` anchors, which ARE ≥ 44 px; the inner spans are decoration the DOM reports as their own hit boxes. | **dormant — 0 hits** |
| `contrast` | `.sr-only, [aria-hidden="true"]` | `*` | Visually-hidden or aria-hidden text is never read on screen; its computed colour is meaningless. | **dormant — 0 hits** |

**Both are dormant, and that is proven, not assumed.** `AUDIT-TRIAGE.md` left one open question: the
T−N chip's waiver claimed the chip "sits inside" the 48 px home anchor when it is actually a sibling,
and asked lane B1 to re-measure and delete that half if it passed. It passes:

1. The full matrix reports `0 findings (0 waived)` — neither waiver matched anything.
2. The full matrix was re-run **with the allow-list emptied** (§1): still `0 findings` across all 95
   states × 17 viewports × 2 themes × 2 engines. An earlier targeted run of the header-heavy states
   (`--only home,onboard,placement,settings,stats --vp phone`, i.e. the 320/360 px widths where the chip
   blocker lived) with no waivers was also clean, in both engines and themes.

They are **kept, not deleted**, for one reason: emptying the file makes the auditor *stricter*, never
blinder, and the two entries document intent for the next person who touches the header or adds
`aria-hidden` text. Anyone who deletes them should expect the header read-outs to start reporting again
if the header's hit boxes ever shrink — which is the point.

### Judgement calls — things looked at and deliberately NOT changed

These are waivers of a different kind: no detector fired, I read them, and I decided they are right.
Each one is a decision, so each one is written down.

1. **The Mock rules screen is centred in the shell; every other screen hugs the left.** Measured at
   1900×1200: `#view` is 1024 px (centred), `.screen` is capped at `--col` = 680 px with
   `margin-inline: 0` on Stats / Settings / Binder / Sheet — a 344 px void on the right — while
   `.mock-screen[data-phase="rules"]` and `.run-screen.blitz` carry `margin-inline: auto`. **Not a
   defect, and not made consistent:** the rules screen is a bordered *card* (an exam gate, read as a
   dialog) and centring a card is right; the others are *content columns*, and their left edge lines up
   with the header's own left edge, so nothing jumps horizontally when you move between screens.
   Centring them would break that alignment. COMPOSED S5 fixes the content column at max 680 px, so the
   void is a consequence of a spec choice, not a bug.
2. **A tall desktop window leaves empty space under the card.** At 1900×1200 and 2560×1440 the placement
   card ends around 60 % of the height with the dock at the bottom. Content is top-aligned by design;
   vertically centring it would make the card jump as parts reveal. At 1280×800 the same screen fills
   the window (read: `place-item1-1280x800-webkit.png`).
3. **The Binder's sheet-tab strip scrolls horizontally at 1900 px**, its last tab ("Bonus") clipped at
   the 680 px column edge, with free space beside it. It is a deliberate `overflow-x` scroller (it has to
   scroll on a phone), the clip is the standard "more this way" affordance, and widening it past 680 px
   would contradict COMPOSED S5. Left to the Binder owner as taste, not a defect.
4. **The Page Summary's skill rows put ~250 px between a name and its bar** (`@container run
   (min-width: 560px)`: `minmax(14ch, 1fr) minmax(0, 180px) 34px 36px`, so the name track takes the slack
   inside the 680 px column). It reads as an ordinary data table with aligned numbers, the name keeps its
   14 ch floor and its ellipsis guard, and the threshold arithmetic was derived by T16. Re-deriving
   another lane's template on taste at the last commit is exactly the churn
   `notes/FIX-stats-r2.md` warns about, so: **left alone, on purpose.**
5. **`.card-dock-hint`'s `@media (min-width: 1024px)`** stays viewport-keyed (a card hosted narrow in a
   wide viewport shows its Hint in the ladder instead of the dock). Known, cosmetic, documented in
   `notes/LAYOUT-ROOT.md` §"Documented exceptions"; it needs a `ResizeObserver` on `.card-host` to fix
   properly and duplicates a working control.

### Still open from before this ticket (not layout, not regressions)

* `qa/r2-home-pins.mjs cold` misses its own budgets (3G paint 2.8 s vs 2.5; returning-visit CTA 1.08 s
  vs 1 s) — T10 §r2.
* Lighthouse mobile ≥ 95/95 never run. Sound never heard (quiet hours).
* `widgets.css` still has two viewport-keyed rules (`@media (min-width: 640px) .w-pairs.has-fig
  .w-pairs-cols`, `@media (min-width: 520px) .w-fields`). They are **neutralised** by `@container
  answers` later in the cascade and the matrix is clean, but the honest fix is to move them into
  `@container answers` in `widgets.css` — `notes/LAYOUT-ROOT.md` §6.
* `.mock-dialog` / `.mock-map` would have to be appended to `<body>` before `.mock-screen` and
  `.mock-main` could become query containers — `notes/LAYOUT-ROOT.md` §6.

---

## 6. The audit is wired as a guard

`node --test` shipped the original bug: 1293 green tests while the placement printed one letter per line.
So the layout gate is now reachable, documented and enforced where it is cheap to enforce.

| where | what |
|---|---|
| `package.json` | `npm run audit` (full matrix), `npm run audit:selftest` (detectors only, ~2 s), `npm run audit:fast` (chromium + light + desktop widths, for a fix loop) |
| `README.md` | a **"Layout audit — run this before you push"** section: the command, what it does, the fast loops, and pointers to `notes/AUDIT.md` + `notes/LAYOUT-ROOT.md` |
| `tests/layout-audit.test.mjs` | runs the auditor's self-test inside `node --test` (pre-existing; skips when no browser binary) |
| `tests/final-layout.test.mjs` | asserts the guard itself is wired: the npm scripts exist, README says to run it before pushing, and CI has the self-test job and *not* the full matrix |
| `.github/workflows/pages.yml` | new **`audit-selftest`** job: installs the `qa/` Playwright island + chromium, runs `npm run audit:selftest`, then runs `tests/layout-audit.test.mjs` and **fails if it skipped itself** (a guard that is green-by-skip is not a guard). It is in `deploy`'s `needs`, so a blind auditor blocks the deploy. |

**The full matrix is deliberately NOT in CI** (22 minutes in two engines). It is a pre-push command a
human runs and reads — that is what the README line is for, and `tests/final-layout.test.mjs` asserts CI
does not try to run it.

---

## 7. How to re-run all of it

```sh
cd /Users/oliver/Projects/unit1a-quest
node --test tests/                      # 1350 tests
npm run audit                           # 95 states x 17 viewports x 2 themes x 2 engines (~22 min)
npm run audit:selftest                  # the detectors only (~2 s)
node qa/final-verify.mjs place          # the student's case: webkit at 1900x1200, 2560x1440, 1280x800
node qa/final-verify.mjs walk --w 1900 --h 1200     # one session at desktop width, a PNG per screen
node qa/final-names.mjs --w 1900        # no skill name may break inside a word (both engines)
node qa/layout-root.mjs                 # the LAYOUT-ROOT invariants (20 states x 10 widths x 2 engines)
node qa/gen-precache.mjs --check        # the SW list matches site/ (116 files)
```

### Requests for other owners

* **`app.js` owner:** `softWrap()` is a new export beside `h()` (≈ 10 lines + comment). It is shared by
  three screens, which is why it is there and not copied; move it to a `site/js/text.js` if `app.js`
  should stay navigation + shell only.
* **`widgets.css` / `mock.js` owners:** the two items carried over in §5, unchanged from
  `notes/LAYOUT-ROOT.md` §6.
* **Whoever adds a new screen state:** add it to `qa/audit-states.mjs` (with a root selector, so a blank
  page can never pass) — the matrix only measures what the catalog knows about.
* **Whoever adds a detector:** plant a defect for it in `qa/audit/selftest.html` and add it to `PLANTED`
  in `qa/layout-audit.mjs`, or `tests/layout-audit.test.mjs` will not be able to tell that it works.
