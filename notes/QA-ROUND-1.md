# QA ROUND 1 — integration (2026-09-17)

Visual-QA fix round 1: six fixer groups edited in parallel; this note is the integrator's pass over the
merged tree. Version bumped to `APP_VERSION = "2026-09-17b"`. Suite: **`node --test` → 1189 pass, 0 fail**
(1156 before the round; the fixers added 33 tests, two in new files `tests/card-r1.test.mjs` and
`tests/home-r1.test.mjs`). `qa/gen-precache.mjs` → list up to date (116 files, `css/polish.css` included);
`tests/sw.test.mjs` 13/13.

## 1. What the fixers reported (fixed / not fixed)

| group | fixed | not | tests on hand-off | where documented |
|---|---|---|---|---|
| Card + widgets | 10 | 3 | green | no note section — `// card r1` comments in `card.js`, `figure/svg.js`, `grader/strip.js`, `grader/reject.js`; `tests/card-r1.test.mjs` |
| Today's Page run + Summary + BLITZ + Drill | 11 | 3 | green | `notes/T16.md` §"r1 fixes" |
| Home · Onboarding · Placement · Settings | 10 | 3 | **red** | no note section — `// home r1` comments in `home.js`, `onboard.js`, `readiness.js`, `app.js`, `screens/index.js`; `tests/home-r1.test.mjs`; `notes/OPEN-ISSUES.md` B0; COMPOSED S10 2026-09-17b |
| Binder + Stats + Sheet + Night | 11 | 4 | green | no note section — `polish.css` "binder r1" block comments; diffs in `binder.js`, `stats.js`, `night.js` |
| Mock + Report + Boss | 10 | 4 | **red** | `notes/T12.md` §r1, `notes/T13.md` §r1 |
| Content audit | 6 | 2 | green | `notes/QUIZLET.md`, `notes/T06d.md` §"Resolved after hand-off", `notes/OPEN-ISSUES.md` (three DONE lines), COMPOSED Global rule 5 |

The two "red" hand-offs were transient: the merged tree is green with nothing deleted or skipped. Three of
six groups wrote no note section — their "not fixed" items are therefore **not on record**; round 2's critic
must re-derive them from the screens rather than trust the tallies above.

### Fixes, by group (the load-bearing ones)

**Card.** Submit is idempotent (the same wrong answer is charged once — `wrongKey` fingerprint); phone
order head · stage · parts · foot · result · solution · side (Scratch collapsed behind a 44 px toggle, `S`
key); a thumb-zone Hint in the dock that mirrors the ladder; the hint also lands inline in the part box;
wedge hit areas ≥ 44 px at 375 via `WEDGE_MAX / BAND / MIN_CHORD` in `figure/svg.js` (a transparent stroke
was tried and rejected — composite bands stole atomic taps); one Continue (the dock's); landscape phone
two-column layout; the equation slot's message shares the row with "Skip setup"; a rotated `pick:'one'`
voc card puts the question on the paper once; reject-menu wording when only one root is found.

**Page run.** One renamed card per item (`renameCard` in `run.js`) so figure, stem, hints, solution, pairs
and grader share a model; a review is re-queued at most once and never after a voluntary reveal; the
Page's before-snapshot survives quit/reload (`inProgress.meta.before`); Summary tiles flip in depth
(`perspective: 600px`) with per-tile sheen delays; `±0` deltas; text greens use `--ok-ink` (≥ 4.5:1);
BLITZ fills the viewport so the answer row is in the thumb zone at 390×844 (INTEGRATION-W4 #3 closed);
HP pips are 8 px dots + a CSS-counter `n/N`.

**Home.** Provisional Readiness runs `M` over the skills tested so far (an aced 8/8 placement reads 57, not
27) — S9 #1 amended to ≥ 55 (OPEN-ISSUES B0, COMPOSED S10); every screen but Home is a lazy loader (cold
open); header tap targets ≥ 44 px (T10 #3 closed: invisible hit box on the `T−N` chip, 44 px home button);
`--warn-ink` / `--gold-ink` for text-grade contrast in light mode; the readiness sparkline has a baseline,
end dot and caption; placement / JUMP / Night blocks scroll to the top per item (`overflow-anchor: none`).

**Binder / Stats / Night.** Light-mode bronze is a copper (`#9A4B1F`, 6.1:1) not a second ochre; tile
bodies tinted by rarity, not only the 4 px foot; list rows show two lines of stem with real notation and a
rarity glyph on phones; view toggle ≥ 44 px; the tile sheet clamps beside its tile and never covers the
header; Stats sparkline reads as a chart (baseline, ticks, value pill) and falls back to a text list under
four logged days; Night mini-mock runs under Mock rules (no per-item feedback, `.nb-mini` hides result /
solution / ladder), report with real notation and a skip state.

**Mock / Report / Boss.** SUBMIT dialog and map backdrop cover the viewport (`.view-enter` fill-mode
`backwards` — base.css's `both` left a transform on `<main>`, making it the containing block for every
`position:fixed` overlay); amber at 60 s / pulse at 10 s (S5 Motion); no `N`/`P` shortcuts (`N` is ASN's
"Never"); an open or expired paper renders its own resume card; phone navigation does not auto-focus the
first field; Report labels parts by type not id. Boss: heart shatter paints (`drawHearts()` before
`shatter()`); parts before Scratch on phones, sticky title + hearts, miss line in the dock, one-row key set
at 375; blank required setup offers "Skip the setup (no heart · flawless gone)" (OPEN-ISSUES item closed).

**Content.** All 87 Quizlet stems diffed letter-for-letter (87/87 letters agree); 17 stems brought back to
the Quizlet wording in `asn.js`, `content/SOURCE.md`, `content/transcript.md`; `qz-04` ⚑ text no longer
suggests A; `coverage.test.mjs` EXPANDED set shrunk to the two notation-markup stems; the 79 untagged M1
misconceptions re-checked and left untagged on purpose (none fits an existing catalogue key).

## 2. Integrator pass (merged tree)

Shot at 375×667, light and dark, `qa/fixtures/midweek.json`: `#/today`, `#/card/ang-10`, `#/run/page`,
`#/binder`, `#/mock` — plus `#/today` and `#/mock` full-page, the Mock after "Start the mock", the Binder
List view and `#/stats`. **All 15 shots: zero console errors, zero horizontal overflow, no missing CSS,
no layout regression** from a concurrent edit. Specific checks:

* Card `ang-10`: figure labels, right-angle mark, "Not to scale", setup slot, Hint 1/3 + Submit dock — the
  `.card-screen` phone grid (card r1) and the `.boss-screen .card-screen` grid (mock r1) coexist: both
  sit in the same `max-width: 1023px` query and differ on purpose (Boss puts Scratch straight after the
  parts; Card puts it last); the Boss rule wins by specificity. Not a fight — left as two blocks.
* Mock item 1: header dock (clock · 1/20 · ⚑ · Map · SUBMIT), cloze blanks, chip bank — the fill-mode
  change did not break the view-enter slide.
* Binder tiles are body-tinted in both themes; List view rows show the copper bronze bar and the glyph
  chip at 375.
* Stats with three logged days shows the text fallback ("the line draws at four") — correct per the
  fixer's rule; the sparkline itself is unverified on this fixture.

### polish.css duplicate / contradiction audit

Every selector polish.css shares with `screens.css` / `widgets.css` / `base.css` (`.card-pips`,
`.rd-spark`, `.st-spark-dot/-head`, `.view-enter`, `.w-eq-actions`, `.bnd-row-stem`, `.tile[data-rarity]`)
is a deliberate later-wins override, documented in its block. Inside polish.css nothing sets the same
property on the same selector twice with different values. Only change: the stray
`.nb-mini-next { scroll-margin-bottom }` line that had been appended after `/* === /page r1 === */` now
sits inside the binder r1 block with its siblings. Nothing consolidated.

### Housekeeping

* `scratchpad/` (a fixer's QA PNGs at the repo root) added to `.gitignore` next to the existing
  `qa/screenshots/` and `/*.png` rules — never part of the artifact.
* `site/version.js` → `2026-09-17b`; SW precache regenerated (already listed `css/polish.css`).

## 3. Remaining findings (for round 2)

Minor, seen on the integrator shots — none blocks the student:

1. **Home hero meta line wraps to an orphan** at 375: `mastery 33 % · binder 40/164` / `· T−5` (the third
   line is one token). Drop the `T−N` (the header chip already shows it) or let the line wrap at the `·`.
2. **Card head subtitle truncates** — "Diagram Algebra · Solve by Facto…" at 375 (pre-existing; `text-
   overflow: ellipsis`). Two lines, or skill name only on phones.
3. **Run/page shows the item name twice** — chip `AP-1 · Warm up! — item 2` and the paper's own
   `Warm up! — item 2` label directly beneath it. One of them should be the number alone.
4. **Undocumented "not fixed" items** — Card (3), Home (3), Binder (4) left no note; their deferrals
   need re-discovery.
5. **Stats sparkline** (binder r1) not exercised: the midweek fixture has three logged days, so only the
   fallback list rendered. Round 2 needs a ≥ 4-day fixture to score it.
6. S9 systematic sweep (OPEN-ISSUES A1) still open beyond 375×667: 390×844, 768×1024, 1280×800, keyboard
   open, `prefers-reduced-motion`, measured contrast, Lighthouse.

## 4. Scores

The integrator has no critic scores for this round — only the fixers' tallies (58 fixed / 19 not, of
which 10 are on record). Merged-tree verdict: **0 regressions, 0 console errors, 0 overflow** across the
15 shots; suite green. S9 remains unscored by an independent reviewer (A1).
