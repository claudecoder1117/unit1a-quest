# HANDOFF — 2026-09-18 ~05:40 (layout pass closed out, build 2026-09-17e)

## State
- Live: https://claudecoder1117.github.io/unit1a-quest/ (Pages via Actions deploys `site/` on every push to main).
- Local commit "Container-driven layout: fix collapsed question text at desktop width, add a full-matrix layout auditor"
  on main. **NOT pushed.** Push when ready and the site deploys **v2026-09-17e**.
- `node --test` → **1350 tests, 1346 pass, 0 fail, 4 skipped** (108 s).
- `npm run audit` (the new full layout matrix) → **0 findings, 0 waived**; 95 states × 17 viewports × light/dark ×
  chromium+webkit, plus a text-zoom and an animations pass ≈ **7 220 measured screens**, 1331 s. Re-run with the
  allow-list emptied: also 0.
- Precache list current (116 files), `node qa/gen-precache.mjs --check` clean.

## What this run of tickets did — read `notes/LAYOUT-PERFECT.md` first
The student opened the live site in Safari at 1900×1200 and the PLACEMENT question rendered **one letter per line**,
with the run header, chips and Scratch heading piled on each other.

1. **LAYOUT-ROOT** — the root cause and the fix. Every responsive rule was keyed to the **viewport**, but the card
   engine is mounted in seven hosts whose widths have nothing to do with the viewport (`#/card`, a run, onboarding's
   placement, a boss, the night mini-mock, the step-2 sandbox, the report retry). At 1900 px the placement's
   680 px host was laying out `minmax(0, 680px) + 320px` = 1024 px of tracks, the paper got 336 px, and the stem
   track resolved to **0 px**. The app had **no container queries at all**; Wave 5 had patched exactly one host,
   which is why `#/run/page` looked fine. Now: `.card-host` and six more query containers, every text track has a
   `ch` floor (`minmax(0, …)` and bare `1fr` are banned on a column that holds words), and one `--stack-top` token
   owns the sticky stack. Conventions + the checklist for the next responsive rule: `notes/LAYOUT-ROOT.md`.
2. **AUDIT-HARNESS / AUDIT-STATES / TRIAGE** — the safety net, because `node --test` cannot see a layout defect.
   `qa/layout-audit.mjs` + `qa/audit-states.mjs`: 11 detectors, 95 states, both engines. The first sweep returned
   6 703 findings, **~85 % of them the auditor's own two bugs** (ink measured through a clip; every deliberate
   line-clamp read as an accident). Fixed, it left **16 real defects**. `notes/AUDIT.md` is the detector reference.
3. **Six B-lanes** (`notes/FIX-B1…B6`, `FIX-home`, `FIX-mock`, `FIX-stats-r2`, `FIX-boss-miss-dock`, `FIX-qa`) —
   cleared all 16, header blockers first.
4. **FINAL** (this note's ticket) — re-ran both gates, re-measured the student's case by hand, read one full
   desktop session, found and fixed the **last mid-word break**, and wired the audit up as a guard.

## The FINAL ticket's own change
`Always/Sometimes/Never: …` (2 of the 19 skill names) is a 23-character run with no space in it. Home's Skills rail
gives the name a definite 170 px column, and **CSS cannot break after a slash**, so `overflow-wrap: anywhere`'s
last-resort break landed mid-word: **"Always/Sometimes/Neve" / "r: Points, Lines, Planes"**, every desktop width,
both engines. No detector can see a bad *break* (the box is the size it should be), so the measurement was added
(`qa/final-names.mjs`, character-by-character line reconstruction) and the fix is a real break opportunity:
`softWrap()` in `app.js` puts a **`<wbr>`** after each `/`. `<wbr>` adds no character, so `textContent`, ARIA names
and copy-paste are byte-identical. Call sites: `home.js` (`.skill-name`, `.weak-name`), `stats.js`
(`.st-skill-name`), `report.js` (`.report-sk-n`). The CSS `overflow-wrap: anywhere` stays underneath as the floor.

## The guard (do this before you push)
```sh
node --test tests/     # fast, and it cannot see layout
npm run audit          # ~22 min, both engines — READ what it prints
```
`npm run audit:fast` / `npm run audit:selftest` are the loop-sized versions. README has the section; CI runs the
auditor's **self-test** with a real browser and blocks the deploy if the detectors have rotted (the full matrix is
deliberately not in CI). Waivers live in `qa/audit-allow.json`, every entry needs a reason, and both current
entries are **dormant** — proven by re-running the matrix with the file emptied.

## Still open (nothing layout, nothing a student meets as breakage)
- `qa/r2-home-pins.mjs cold` misses its own budgets (3G paint 2.8 s vs 2.5; returning-visit CTA 1.08 s vs 1 s) — T10 §r2.
- Lighthouse mobile ≥ 95/95 never run. Sound never heard (quiet hours).
- `widgets.css`'s two viewport-keyed rules are neutralised by `@container answers`, not yet folded in — LAYOUT-ROOT §6.
- `.mock-dialog` / `.mock-map` must move to `<body>` before the Mock can be a query container — LAYOUT-ROOT §6.
- An answer that crosses local midnight inside one open screen can still charge that day's decay in the answer's save.
- A legacy miss on a Variant of a generator-only skill has no card id, so `saveEvidence` cannot see it (FIX5-home r3).
- The first Mock's switch from provisional to locked Readiness can lower the number (S4 allows it); the report should
  say "Readiness now uses the full formula".
- Judgement calls deliberately left as they are (desktop column alignment, the Summary's table gap, the Binder's
  scrolling tab strip, `.card-dock-hint`) are each written up with their reason in `notes/LAYOUT-PERFECT.md` §5.
