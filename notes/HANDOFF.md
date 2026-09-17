# HANDOFF — 2026-09-17 ~14:15 (fix5 pass integrated, half day)

## State
- Live: https://claudecoder1117.github.io/unit1a-quest/ (Pages via Actions deploys `site/` on every push to main; CI runs `node --test` first).
- Local commit "Fix the five S9 rough edges…" on main. **NOT pushed.** Push when ready, and the site deploys v2026-09-17d.
- `node --test` → 1293 tests, 1289 pass, 0 fail, 4 skipped. Precache list is current (116 files) and `tests/sw.test.mjs` passes.
- `notes/S9-SCORECARD.md` "What a student will notice first": all five marked FIXED, each with an evidence path.

## What the fix5 pass did (lane notes: notes/FIX5-home.md, FIX5-gen.md, FIX5-run.md)
1. Readiness dip (home lane, 3 rounds, plus integrator). Clean first-try answers never lower provisional R or M%, and "just started"
   skills are grey, never weak. Skill records gain `misses` / `helped`. Provisional M counts missed or hinted skills, plus any
   other skill only where it raises M, with a 30-weight-point floor.
2. Placement item 1 figure (gen lane). T-notation v2 draws a mini figure. The figure engine gained optional `poly` fields; none of
   the shipped figures change.
3. Page fold on 375×667 (run lane). One-row run head, compact card chrome on short phones, and a `revealAnswer` lift.
4. Summary family tiles (run lane). Two-column family tile, the ladder line, and a legend.
5. Home Mock shown twice, and lore module names (home lane).

## Integrator fixes (critic home r3 failures, fixed at merge)
- BLOCKER: a wrong optional setup followed by a GOLD clear dropped R 57 → 50 and listed FIG-ALG as weak. Now
  `readiness.saveEvidence` skips errors[] rows with `part === 'setup'`. The critic's second suggestion was to apply
  saveEvidence only to legacy records. That was NOT done: Home's `decayAll`/`freshSkill` stamps `misses` on every record the
  first time the app opens, so the change would silently drop evidence from older saves.
- Double decay (pre-existing, found while fixing the idle critique). `schedule.decaySkills` (`decay` ledger) and
  `mastery.decaySkill` (`decayDays`) each charged the same idle days (80 → 74 on Home → 68 on the next answer). Both now read
  and write both fields, and `onboard.writeSkill` resets `decayDays`.
- Idle decay was charged inside a clean answer. `app.js chargeOwedDecay()` now runs schedule housekeeping at boot, and once per
  calendar day on route, before the screen mounts.
- M6 module renamed "Diagram Algebra" (it was "Figure Algebra") to match the skill name.
- saveEvidence also reads the packed history form, so raw-localStorage QA reads match getState.
- polish.css `fix5:integrate r1`: on short portrait phones only notation-builder cards keep the 150 px figure cap
  (ang-10's labels were ≈ 7.5 px).
- card.js `revealAnswer` now measures below any sticky head, not only the app bar. Before, placement item 1's chip row was cut
  in half under the Placement head.
- `qa/s9-walk.mjs walk` crashed at Mock item 1 (armCard waited for `.card-parts`). It now also accepts `.mock-parts`, and the
  full walk runs clean: 0 console errors, 0 overflow.
- Tests: `tests/fix5-integrate.test.mjs` (8). The (a) property in `tests/fix5-home.test.mjs` now adds optional-setup error noise.

## Spec deviations for COMPOSED S10 changelog (not yet written into COMPOSED.md)
- S4 provisional M: M = max over S ⊇ {missed or hinted skills} of Σ_S w·m_shown/100 ÷ max(Σ_S w, 30). S7 Weak spots needs a miss or
  hint. S6 `skills[id]` gains `misses`, `helped`, and a shared decay ledger (`decayDays` and `decay`). Placement/JUMP writes use
  m = max(earned m, 80).

## Still open
- Page item 1 (notation, shipped figure) carries hidden `fig-wedge-hit` rects that are 34 px tall under the 150 px cap. They are
  not tap targets on a notation card, but the probe flags them.
- An answer that crosses local midnight inside one open screen can still charge that day's decay in the answer's save. Boot and
  route housekeeping cover every other path.
- A legacy miss on a Variant of a generator-only skill has no card id, so saveEvidence cannot see it (FIX5-home r3 known limit).
- The first Mock's switch from provisional to locked can lower the number (S4 allows this). The Mock report should say
  "Readiness now uses the full formula".
- Also open from before: cold-boot budgets (3G paint 2.8 s vs 2.5), Lighthouse not run, sound never heard.
