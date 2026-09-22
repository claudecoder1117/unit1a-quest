# HANDOFF — 2026-09-22, ship pass on build **2026-09-21a** (THE JOB layer, post-repair)

## State

- Live: https://claudecoder1117.github.io/unit1a-quest/ (Pages Action deploys `site/` on every push
  to main). **Nothing in this tree is committed or pushed — the human does that.** Last commit is
  `ca53259 "THE JOB game layer: 11 tickets built, 2 critic rounds applied (pre-repair baseline)"`;
  the whole repair round (15 J-tickets answered, 20 BLOCKERs / 28 MAJORs / 27 MINORs from twelve
  critics over three rounds) is **uncommitted working tree**. Other lanes have work here too:
  do not `git stash`, `git checkout` or `git reset` anything.
- `site/version.js` → `self.APP_VERSION = "2026-09-21a"` (was `2026-09-17e`). Push deploys that string.
- `node --test tests/` → **3073 tests · 3069 pass · 0 fail · 4 skipped · 411 s.**
  (Baseline for this round was 2725 / 2721 / 0 / 4: the repair added **348** tests and removed none.)
  Re-run **after** the full matrix overwrote `qa/audit/report.json` — identical, still green (410 s),
  because `tests/job-audit-allow.test.mjs` refuses a report from a wider matrix *by name* instead of
  reconciling it. That is the one test whose result the audit can change; it was checked on purpose.
- `node qa/gen-precache.mjs` → **127 files**, list already current; `--check` clean.
- `node qa/job-walk.mjs` → **ALL PASS**: first answer from a cold visit at **15 016 ms** (budget
  20 000), board on screen at **33 ms** with 0 spinner nodes, 25 printed probabilities re-derived from
  the shipped modules with **0 mismatches**, 59 screenshots, 8 warnings (below).
- `node qa/s9-walk.mjs` → runs to the end **after the repair described below**, 13/13 flawless Page,
  519 XP, 12 tiles minted, Readiness 57 → 65, Mock kill/resume on the true clock, 0 console errors.
- `node qa/s9-walk.mjs timer` → Mock clock amber at 0:54 (`rgb(154,82,8)`, 17 px / 40 px, no
  animation) and pulse at 0:07 (`rgb(196,32,61)`, **still 17 px / 40 px**, `mock-pulse`).
- `node qa/s9-walk.mjs offline` → SW active and controlling, one cache **`packet-2026-09-21a`** with
  **127 files**; `#/today`, `#/binder`, `#/card/ang-10`, `#/mock`, `#/settings`, `#/stats`,
  `#/run/page` all render offline, `offline errors []`.
- `node qa/layout-audit.mjs` (FULL matrix) → **NOT CLEAN.** See the next section — this is the one
  gate this build does not pass, and the findings belong to the study layer, not to THE JOB.

## The gate that fails: the keyboard-open states in the full layout matrix

```
node qa/layout-audit.mjs        # 108 states x 17 viewports x 2 themes x 2 engines, 1 615 s
verdict: 356 blockers, 106 majors → FAIL   (exit 1)
total 462 findings · 94 grouped defects · 130 waived
byType  overlap 268 · offscreen 88 · unreachable-answer 72 · contrast 34
```

**104 of the 108 states are clean** in both engines, both themes, every viewport. All 462 findings
land on **four** states, and deduped they are **24 distinct signatures**, each reported identically in
light+dark × chromium+webkit — so this is neither an engine quirk nor a theme quirk. Every one is the
same family: **a card or a boss with the on-screen keyboard open.**

**Do not push expecting a green matrix.** The defects are real, student-facing and **outside the
ship agent's writ** (`site/js/widgets/*` and the study layer are off-limits to this lane):

1. **`boss-b4-miss-dock-kb` / `boss-b4-miss-setup-kb` — the answer box is behind the keyboard in a
   Boss, after a heart is lost.** `unreachable-answer input#f-1`: *"the first answer control starts at
   y 292 px, at or below the dock top (63 px) — it is behind the dock"*, on 6 viewports × 2 themes ×
   2 engines. The miss banner is clipped on top of it — *"Heart lost. Word problems, linear: write the
   sentence as one equation before you solv…"* / *"The setup box is empty — type the equation, or skip
   it and answer th…"* — and `p.w-msg > span.w-msg-text`, `p.card-part-h` and `label.w-flabel > span.w-mk`
   are all reported `overlap … covered by the fixed dock with the page scrolled to its end`.
   Look at `qa/audit/png/boss-b4-miss-dock-kb-375x667-light-chromium.png`.
2. **`card-pairs-kb` — the same thing on an ordinary card.** `#/card/ang-wu-1` at 375×667 with the
   keyboard up **and no job in the page**: `unreachable-answer input#wpairs-1-in` (*"starts at y
   342 px, at or below the dock top (214 px)"*), plus `offscreen` on `.card-hint-btn` and
   `.card-scratch-toggle` (*"still below the fold with the page scrolled to its end"*) and `overlap`
   on `.w-pairs-undo` / `.w-pairs-count`. `widgets/base.js keepVisible()` cannot scroll the field
   clear because the picker is taller than the band the keyboard leaves.
   Owner: `site/js/widgets/pairs.js` + `site/css/{components,widgets}.css`.
   Look at `qa/audit/png/card-pairs-kb-375x667@motion-light-chromium.png`.
3. `card-pairs-locked` — the pairs widget's wrong-state red on its own pink ground measures
   **4.21 : 1** (`rgb(217,45,76)` on `srgb(0.988,0.934,0.944)`) against the 4.5 : 1 the detector needs
   at 15 px (`contrast`, MAJOR).

**Where the root cause looks to be, for whoever takes it** (not changed here — the study layer is
off-limits to this lane, and the repair round filed it deliberately). `widgets/base.js keepVisible()`
(`:274`) reacts correctly — it measures `visualViewport.offsetTop + visualViewport.height` minus the
dock and calls `scrollIntoView({block:'center'})` — but **scrolling cannot help if the document has
nowhere left to scroll**: the card's scroll container has no bottom padding for `var(--kb)` + the dock,
so the last band of content can never rise into the visible strip. `css/job.css` already does exactly
this for the job's own sticky beats (`bottom: calc(var(--job-dock-h, 0px) + var(--kb, 0px))`, `:625`,
`:680`, `:714`); the card/boss scroller has no equivalent. Start there, then re-run
`node qa/layout-audit.mjs --only boss-b4-miss-dock-kb,boss-b4-miss-setup-kb,card-pairs-kb,card-pairs-locked`
(minutes, not an hour) before the full matrix.

Why this is the first matrix to see them: the last clean full run (2026-09-18, build 2026-09-17e,
"0 findings, 0 waived") audited **95** states and had **no keyboard-open card state at all**. This
one audits **108** — three added today (`card-pairs-kb`, `card-pairs-locked`, `job-payout-kb`) as
unwaived *controls* for the attributed waivers, and `boss-b4-miss-{dock,setup}-kb` arriving with the
game-layer commit, i.e. after the last clean full run. Same product, better net. The detector
self-test passed 9/9 in both engines on this run, so the net itself is sound.

### `qa/audit-allow.json` grew from 2 entries to 6 — read this before trusting a waiver

Four ATTRIBUTED waivers were added 2026-09-22. Each waives a hit **only on the two job states that
host the study layer's card** (`job-answer-kb`, `job-payout-kb`) and each names a **control state
outside the host that reproduces the hit and is left UNWAIVED** — which is exactly why the matrix
still fails above. `tests/job-audit-allow.test.mjs` gates every entry on each `node --test` run: the
control must exist in `qa/audit-states.mjs`, be waived by nothing, and the counts must be the ones the
command recorded in the entry's `attribution` block. Nothing is muted; hits are moved to the state
that owns them. The two original waivers (header status read-outs, `sr-only` contrast) are unchanged.

## What this ship pass changed

| file | change |
|---|---|
| `site/version.js` | `APP_VERSION` → `"2026-09-21a"` |
| `qa/s9-walk.mjs` | three repairs, below — the driver had been silently aborting since the layer landed |
| `notes/G9-SCORECARD.md` | **new** — G9's ten and S9's ten re-scored with the test or measurement behind each |
| `notes/HANDOFF.md` | this file |

Nothing under `site/js/`, `site/css/`, `site/data/` or `tests/` was touched by this pass.
`site/js/version.js` aside, the product is exactly what the repair lanes left.

### `qa/s9-walk.mjs` — why it needed repairing

`settings.game` ships **true** (`site/js/store.js:301`), so Home's primary button is the JOB board on
any save that posts one. The driver predates the layer: it waited on
`.home-primary[data-kind="page"]`, timed out after 20 s, aborted at Home — **and exited 0**. Today's
Page, the Summary, the Binder, the Mock and Settings had been unmeasured since the layer landed, with
a green-looking exit code over the hole.

1. `tapTodaysPage()` takes the primary when it is the Page and Home's own `a[href="#/run/page"]`
   ("Run a page", `screens/home.js:761`) when it is not — COMPOSED-GAME G10 #14's "one tap".
2. The keyboard is now modelled the way `qa/job-screen.mjs` models it since the round-3 finding: the
   **layout** viewport stays 375×667 and only `visualViewport` shrinks, with "in view" measured
   against `visualViewport.offsetTop + visualViewport.height`. The old code called
   `setViewportSize(375, 380)`, which shrinks the *layout* viewport — no keyboard does that; it moves
   the sticky chrome up with the fold and can hide nothing, so every "keyboard open" claim passed on
   a keyboard that does not exist.
3. A walk that throws now sets `process.exitCode = 1`.

**Still not measured by it:** this build's Page item 1 was an `asn:verdict` card and item 2 a
`notation:build` card, so neither the keyboard branch (needs a text input) nor the deliberate-wrong
branch (S9 #4) fired. Both branches are correct now; they need a save whose first items carry inputs.

## Scorecards

`notes/G9-SCORECARD.md`, in full. Headline: **G9 9/10, S9 9/10.**

- **G9 #6 FAILS**, exactly as `COMPOSED-GAME.md` publishes it: the RANK is farmable. `w = 4q̂(1−q̂)`
  is built from `save.cards[*].history` (`site/js/job/call.js:1065`), which `screens/card.js` writes
  on every graded original — inside a job or not — so free study is evidence the game does not price.
  Measured at **Called 2 vs Called 4 on 8/8 seeds, +6.91 % post-climb loot, byte-identical study
  ledger** (`node notes/repair-meta-evidence.mjs`). The close is a one-line `call.js` change (build
  `q̂` only from staked job targets), filed in `notes/repair-meta.md`, **not taken in this build**.
- **S9 #9 FAILS** on its keyboard-open clause, for the pairs-widget defect above. Everything else in
  #9 passes: 0 horizontal overflow on every walked screen, 0 tap targets under 44 px in the job.
- **G9 #1** passes *inside the condition its own text now carries*: printed vs measured agree ≤ 1.19
  points same-shape and ≤ 4.39 within a fixed-phase column, but the cross-column band is **6.35 with
  21 of 1 196 cells outside 5 points** — published, not closed.
- **S9 #1**'s "no plan warning" clause was not exercised: today is D = 2 and Home correctly warns
  "40 new a day is more than a day holds — the target is 12". The clause is specified for a D = 7 open.

## Open, in the order a student meets it

The full list with evidence is `notes/G9-SCORECARD.md` §"What a student would still notice". The six
worth fixing first:

1. **Type an answer on a phone and the box can be behind the keyboard** — Boss B4 after a lost heart
   and the pairs card, both BLOCKER, both study layer (details above).
2. **Boss B4's miss banner is clipped mid-sentence** with the keyboard up, on top of that.
3. **The hint price truncates on a phone**: `hints are free · this one costs 16 of 53 l…`.
4. **"Vault cracked" over "0 XP this run"** for ~1.1 s — the debrief hero is held at `0` for
   `bagDropMs()` = 600 ms, then counts up over 500 ms (`screens/run.js:1295,1454`), while the header
   already reads `bag 424`. A transient, not a stuck zero (the walked job's shot caught the landed
   `23`), but it is the biggest number on the screen.
5. **The chain pips read as empty boxes** at phone size — `GLYPHS.chainFilled '▮' / chainEmpty '▯'`
   (`data/job.js:943`).
6. **The board's first paint is punctuation.** G7 says pass 1 carries labels, lock counts, cold days,
   wing labels and per-wing supply from the save alone; measured, every one of them is a placeholder
   (`····· · ······· · ·········`) for **740 ms**. No spinner, no shift inside the board — but Home
   reflows around it (`.home-today` +50 px, CTA −24 px, CLS 0.00114).

## Carried over from the 2026-09-18 handoff, still open

- `qa/r2-home-pins.mjs cold` missed its own budgets (3G paint 2.8 s vs 2.5; returning-visit CTA
  1.08 s vs 1 s) — **not re-run this pass.**
- Lighthouse mobile ≥ 95/95 never run. Sound never heard.
- `widgets.css`'s two viewport-keyed rules are neutralised by `@container answers`, not yet folded in
  (LAYOUT-ROOT §6). `.mock-dialog` / `.mock-map` must move to `<body>` before the Mock can be a query
  container.
- An answer that crosses local midnight inside one open screen can still charge that day's decay in
  the answer's save.
- A legacy miss on a Variant of a generator-only skill has no card id, so `saveEvidence` cannot see it.
- The first Mock's switch from provisional to locked Readiness can lower the number (S4 allows it);
  the report should say "Readiness now uses the full formula".
- The judgement calls in `notes/LAYOUT-PERFECT.md` §5 stand as written.

## The guard, before you push

```sh
node --test tests/                 # ~7 min, and it cannot see a layout defect
node qa/gen-precache.mjs --check   # instant
node qa/job-walk.mjs               # ~6 min, real browser, reads every printed probability back
node qa/s9-walk.mjs                # ~3 min, now fails loudly instead of exiting 0
node qa/layout-audit.mjs           # ~50 min, both engines — READ what it prints
```
CI runs the auditor's **self-test** with a real browser (9 of 9 detectors caught their planted defect
in both engines on this run) and blocks the deploy if the detectors have rotted; the full matrix is
deliberately not in CI.
