# FIX5 — lane "home", round 1

Two bugs from `notes/S9-SCORECARD.md` → "What a student will notice first": #1 (right answer, number goes down;
correct answers listed as weak spots) and #5 (Mock shown twice; lore module names).

## Bug 1: "I got it right and my number went down"

### Root cause
- Mastery starts every skill at `m = 0`. One clean answer gives `m = 35, n = 1`, so `m_shown = 35 × 1/5 = 7`.
- The provisional Readiness (no Mock yet) used `M` = weighted mean of `m_shown` over every skill with `n ≥ 1`
  (home r1). A new skill joined that mean at 7 and pulled it down. The aced save read 57 / 80 %. One clean vocab
  answer dropped it to 51 (worked through the old rule). The S9 `dip` run after four clean items read 53 / 73 %.
- `weakSpots` listed any skill with `n ≥ 1 ∧ m_shown < 70`, so that same 7 showed up as "Weak spots · Vocabulary 7".
- Gating a skill on "enough evidence" (e.g. `n ≥ 5`) does not fix this. The skill still joins the mean on a clean
  5th answer, and its m can be lower than the mean at that point (hinted answers before it, or a mean above 88).
  Invariant (a) says "any save", so that rule fails.

### The change (smallest rule that is monotone by construction)
1. **`misses` on each skill record** (`mastery.js`): `updateSkill` adds 1 when `s < 70` (wrong, retry on attempt ≥ 2,
   or solution shown). `mockMiss` adds 1 (a Mock miss on a Mastered skill). The placement `writeSkill` in
   `onboard.js` adds 1 for a non-clean placement item. A hinted clear is **not** a miss. `hasMiss(rec)` is exported.
   - Older records have no `misses` field. `legacyMisses` infers it: a clean-only history from 0 lands exactly on
     `cleanM(n)` (35, 57.75, 72.5 …). A clean placement starts at 80. Anything lower than that (after the record's own
     decay, with 0.5 slack) counts as 1 miss. This is the conservative side: a legacy skill with hints keeps its old
     weak-spot behaviour. `freshSkill` fills the field in, so the next update writes the inferred value explicitly.
2. **Provisional M** (`readiness.masteryTermTested`): tested skills (`n ≥ 1`) split into two groups:
   - **verdict** skills (placed, or ≥ 1 miss) always count;
   - **just-started** skills (answered, never wrong, never placed) count only where they *raise* M.

   M = the best weighted mean of the verdict skills plus any subset of the just-started ones. The best subset is always
   a prefix of the just-started skills sorted by m_shown, so M takes one pass. Why it is monotone: a clean answer raises
   one `m_shown` and never adds a miss. So every candidate mean goes up or stays, and every earlier candidate subset is
   still available. `C` only grows and `A` does not move. Result: R and the mastery % never drop on a clean answer.
   `rd.tested` is still the `n ≥ 1` count (drives "N of 19 skills tested" and the Too-early band). New: `rd.scored`.
3. **Weak spots** (`readiness.skillState`): `weak = n ≥ 1 ∧ misses ≥ 1 ∧ m_shown < 70`. New `started` state:
   answered, no miss, not placed, `m_shown < 70`. Also new: `startedSkills(save)`. Ordering, max 5 and Drill links are
   unchanged. `page.js` and `night.js` read the same `weakSpots`, so weak-skill Variants now target missed skills.
4. **Home** (`home.js`): the rail shows a grey `data-tone="started"`. The Weak spots card gets one grey line,
   "Just started, no misses yet: …". The hero term is now `mastery X %`, no longer `mastery X % of N tested`, because M is
   no longer a plain mean over the tested skills. The note line still says "N of 19 skills tested".
   `tests/home-r2.test.mjs` pinned the old wording and was updated with a comment.
5. **Settings** (`FORMULA_PROVISIONAL` tail + the M legend) prints the new rule. The number comes from the same
   `readiness()` Home uses.
6. The full formula (after a Mock) is untouched: M over all 19 skills, and misses play no part (e).

### Invariants → tests (`tests/fix5-home.test.mjs`, 19 tests)
- (a) the S9 dip sequence, plus a property test: 400 seeded random saves (provisional and locked, some legacy
  records) × 6 clean answers on 1–3 skills. R and mastery % never drop. Legacy inference is covered.
  (Checked separately: the old rule gives 57 → 51 on one clean VOC answer.)
- (b) one clean VOC answer after the ace gives no weak spots, and VOC is `started`. Property: weak ⇒ a miss is recorded.
- (c) one wrong answer on a new skill is listed. A retry is a miss, a hinted clear is not. A Mock miss on a Mastered
  skill is a miss. Non-clean placement items write misses (via `onboard.applyPlacement`). Property: among missed
  skills, the list is exactly the pre-fix rule.
- (d) a brute-force implementation of the printed rule (every subset) equals `readiness().M` and `r` on 250 random
  saves. Settings computes its number with `readiness(getState())`.
- (e) the locked R equals `round(100·(0.5·M₁₉ + 0.3·A + 0.2·C))`, and the aced tested-only M is still 0.8.
- Also updated: `tests/mastery.test.mjs` (`freshSkill()` now includes `misses: 0`, with a comment).

### Known edge (not caused by the answer)
`card.js` charges any owed decay (`decayAll`) inside the same save as an answer. A save that has not been opened
for more than 2 idle days can still drop on its first answer after that gap. The drop comes from decay, not the
answer, and Home's housekeeping on open usually charges it first. The property test uses saves with no owed decay.

## Bug 5: Mock shown twice, lore names

- `plan.fillPlanStrip(wrap, save, { hideMock })` skips the "Mock #1 · 20 items · 40 min" link. Home passes
  `hideMock: act.kind === 'mock'`. Home's secondary nav also drops its "Mock" button when the CTA is the Mock.
  With the Mock as CTA, `main` has exactly one Mock link (the 56 px button). In every other state the plan link stays
  and is now 44 px (`polish.css` `/* === fix5:home r1 === */`), and the nav keeps its Mock button.
- Module display names (`data/modules.js`): M1 Vocabulary & Notation · M2 Pairs in a Figure ·
  M3 Complement & Supplement · M7 Does It Bisect? · M9 Always / Sometimes / Never · M10 Factoring.
  M4/M5/M6/M8/M11/M12/M13 were already dry. Ids, the rooms data (never rendered) and comments keep the old names.
  Boss names stay (COMPOSED S2 keeps them).
- Edits outside the lane, each a one-line label change:
  - `site/data/templates.js`: the T-csarith `label` 'Comp/Supp Sprint' → 'Complement & Supplement'. It is
    student-visible in the Binder and JUMP labels (generator lane's file).
  - `site/data/trophies.js`: 'Forge Flash' → 'Factor Flash' and 'Forge 18' → 'Factoring 18'. The ids
    `forge-flash` / `forge-18` are kept for saves.
- Test comments de-lored: `integration-w5.test.mjs`, `plan.test.mjs`, `binder-r2.test.mjs`. Also updated:
  `data/cards/m1.js` header comment.

## Evidence (`qa/screenshots/fix5-home/`, script `qa/fix5-home.mjs <place|wrong|mock-light|mock-dark|dipsave|settings>`)
Before:
- `before-s9-p17-dip.png` (S9 original) and `before-dip-rerun.png`: 53, "mastery 73 % of 9 tested" after 4 clean items (before: 57 / 80 %).
- `before-mock-cta-light.png` (full page): Mock #1 CTA + "Mock #1 · 20 items · 40 min" link + "Mock" nav button.
- `before-s9-p07-place-summary.png`, `before-s9-v-laptop-light-home.png`, `before-s9-v-phone-dark-home.png`.
After:
- `after-dip.png` (`node qa/s9-walk.mjs dip`, also written to `s9/p-17-home-midpage-dip.png`): **60, mastery 82 %**
  (≥ 57 / 80 %). `after-dip-weak.png`: no weak spots, grey "Just started, no misses yet: Vocabulary", VOC bar grey at 7.
- `after-wrong-new-skill-weak.png`: one wrong answer on voc-01 (new skill VOC). Weak spots lists
  **Vocabulary 0 · Drill 5**, and R drops 57 → 51 (a real miss).
- `after-mock-cta-light.png` / `after-mock-cta-dark.png` (375×667, fixture `mock-cta.json`: after-ace + testDate
  D−3 + today's goal met): exactly one Mock entry in `main`. No overflow; the only small target is the header T−3 chip.
- `place-p-07-place-summary.png`: placement summary after an 8/8 ace, 0 lore hits in body text ("Placed: Word
  Problems: Linear · Factoring · Systems · Quadratic Solve · Does It Bisect?").
- `after-settings-readiness.png`: Settings reads "60 · Getting there · provisional · over 9 of 19 skills tested",
  Home ring 60 on the same save (`after-dip.json`). Match.

## Spec deviation (for the integrator: COMPOSED S10 changelog)
S4 "Readiness" provisional branch and S7 "Weak spots" now read:
- provisional `M`: "a skill with no wrong answer yet counts only where it raises M";
- Weak spots: `n ≥ 1 ∧ misses ≥ 1 ∧ m_shown < 70`;
- skill records (S6 `skills[id]`) gain `misses`.

The locked formula, `m_shown`, the placement writes, bands and caps are unchanged. COMPOSED.md was not edited
(not in this lane's files).

---

# FIX5 — lane "home", round 2 (critic r1 rejected, wow 5)

## Critic r1 findings → changes
1. **(d) The printed rule left out the placement exception** (major). The printed rule gave R 64 on `crit-home/multi.json` and 71 on
   `mockcta-own.json`; the app gave 61 and 63. The r1 brute force copied the code's own classification.
   - `readiness.FORMULA_PROVISIONAL` now reads "…M runs over the skills tested so far (n ≥ 1), not all 19; **placed skills and
     skills with a wrong or hinted answer always count**, and any other skill counts only where it raises M". The Settings M legend
     (`settings.js`) says the same in plain words.
   - The (d) test now implements the printed words. `randomSaveT` records what actually *happened* to each skill (placed / wrong /
     hinted) from the events it generates, and the brute force classifies skills from those events, never from `placedAt`,
     `misses` or `helped`. It asserts that the placement exception really comes up (a placed skill below M). It also pins the text.
   - Independent check (`scratchpad lit2.mjs`, record-based, every subset): multi 61 = 61, mockcta-own 63 = 63, after-dip 60 = 60,
     r2 placemix 54 = 54.
2. **Hinted-only skill never weak, labelled "just started" after 6–10 answers** (major).
   - `mastery.updateSkill` now keeps a `helped` counter: +1 when s = 70 (a correct answer that needed a hint). `freshSkill` fills in
     0; old saves already count hints as a miss through `legacyMisses`. New `hasHelp(rec)`.
   - `readiness.isVerdict(rec)` = placed ∨ misses ≥ 1 ∨ helped ≥ 1. Such a skill always counts in provisional M.
     `skillState.weak = n ≥ 1 ∧ (misses ≥ 1 ∨ helped ≥ 1) ∧ m_shown < 70`. `started` also requires no hints. `skillState.helped` added.
   - Home's grey line: "Just started, no misses yet: …" only when n < 3. From n ≥ 3 it reads "No misses yet, still under 70: …"
     (`home.startedPhrases`). The rail caption now reads "…weak only after a wrong answer or a hint."
   - Browser check (`qa/fix5-home-r2.mjs hinty`): 6 hinted ASN-ANG answers from after-ace → Weak spots
     "Always/Sometimes/Never: Angles 65 · Drill 5" (`r2/hinty-weak.png`).
3. **A resumed Page header showed the page-start snapshot (57) after Home showed 60** (major). `run.js` mountCardRun now sets the
   header from `readiness(getState())`. `before` is still kept for the Summary delta. The shell (`app.js syncHeaderFromState`) already
   re-derives the ring on every save, so the header climbs after each answer. **This is a one-line edit outside the lane** (`run.js` is
   owned by the run lane). Check: `r2/resume-page-header.png`, Home 60 → run/page header 60.
4. **Retried placement item recorded misses: 3** (minor). `onboard.writeSkill` sets misses = max(1, current) for a non-clean item,
   not +1. The card view has already counted the wrong attempts, and `applyPlacement` can run twice (idempotent now). Browser: the
   wrong-then-right ASN item gives `misses: 2` (the wrong attempt and the retry), not 3.
5. **Summary said "first try · the ratio item too" beside a non-clean ratio row** (minor). The line now reads "first try · needs the
   ratio item clean too". The cluster label 'Comp/supp word problem' → 'Linear word problem' (so the ratio row reads "…needs the
   linear item…").
6. **Settings promised "a right answer can never lower the number"** (minor). The new wording: "answering right first try without a
   hint never lowers the number (a hint, a wrong answer, idle-day decay and the first Mock's switch to the full formula can)". The
   Mock report's "number changed formulas" copy is for the integrator (report.js is not this lane's file).
7. **Weak spots empty state ignored the CTA** (minor). `home.weakEmptyLine(kind, { locked })`: resume → "finish the page and they
   show up here"; Mock CTA → "the Mock will find them"; Night/Morning → "No weak spots on record."; after a Mock/Baseline → "nothing
   you have missed is under 70"; otherwise unchanged.

## Why a hinted answer may lower the number (spec note)
Invariant (a) covers the *clean* first-try answer (s = 100): no miss, no hint. A hinted clear scores s = 70 under S4, and the card
already shows it as "with hints". It is now evidence (it counts in M), so the first hinted answer on a new skill can lower the
provisional R (after-ace 57 → 51 in the hinty run). The critic asked for exactly this behaviour. The old rule (r0) dropped the number
on *every* first answer.
A clean-only skill that has decayed under 70 (idle days) stays out of the weak list and out of M unless it raises M. Counting decay
as a verdict would make 3 idle days after a single clean answer read as "weak 5", which is Bug 1 again. The grey line now says "No
misses yet, still under 70" once n ≥ 3, so it no longer claims "just started".

## Tests (`tests/fix5-home.test.mjs`, 26 pass)
New or changed: helped counting; 6 and 10 hinted answers → weak and inside M; a placement wrong-then-right item → misses 2, and
applying it again is idempotent; weak ⇒ a real wrong or hinted event (tracked); one clean answer never adds a weak spot; the (d)
brute force from events (400 saves, the placement exception is exercised) plus the text regexes; startedPhrases wording; empty-state
lines; run.js header comes from live readiness; placement labels and sibling text. `tests/mastery.test.mjs` freshSkill shape gains
`helped: 0` (with a comment). Full suite: 1272 tests, 1268 pass, 0 fail, 4 skipped.

## Evidence r2 (`qa/screenshots/fix5-home/r2/`, driver `qa/fix5-home-r2.mjs <hinty|wrongnew|resume|mockcta-light|mockcta-dark|placemix|multi|settings file>`)
- `node qa/s9-walk.mjs dip` → `s9/p-17-home-midpage-dip.png`: **60 / mastery 82 %** (before 57 / 80 %). No weak verdict. Empty
  line "finish the page…". Grey "Just started, no misses yet: Vocabulary".
- `wrong-new-weak.png`: one wrong asn-01 from after-ace → Weak spots "Always/Sometimes/Never: Angles 0 · Drill 5", R 57 → 50.
- `hinty-weak.png`: see 2 above.
- `multi` (9 clean answers across new + placed skills): R 57→57→58→58→58→58→59→60→60→61, mastery 80→83, no drop. Then asn-10 wrong →
  ASN-ANG weak at 38.
- `mockcta-light-full.png` / `mockcta-dark-full.png` (375 wide, critic's save `crit-home/mockcta-own.json`): exactly one Mock entry
  (the 56 px "Mock #1" button). The plan strip has no Mock link and the nav has no Mock button. Weak card: "the Mock will find them".
- `placemix-summary.png`: ASN "second try", the rest placed. 0 lore hits. Labels "Linear word problem" / "Ratio word problem".
- `settings-readiness-mockcta-own.png`: Settings "63 · Getting there · provisional · over 10 of 19 skills tested", Home 63. The
  printed rule includes placement and hints.
- `resume-page-header.png`: run/page header 60 = Home 60.

## Spec deviation (add to the r1 list for COMPOSED S10)
- S6 `skills[id]` gains `helped`. S7 Weak spots: `n ≥ 1 ∧ (misses ≥ 1 ∨ helped ≥ 1) ∧ m_shown < 70`. S4 provisional M: placed ∨
  missed ∨ hinted skills always count.
- Open for the integrator: the first Mock's provisional → locked switch can drop the number (S4 allows it). The Mock report should
  say "Readiness now uses the full formula" instead of showing it as a plain drop.

---

# FIX5 — lane "home", round 3 (critic r2 rejected, wow 3)

## Critic r2 findings → changes
1. **Blocker: "counts only where it raises M" made M the student's best skill** (zero-placement save + one clean Page read
   "Readiness 68 · mastery 92 %"; 12 clean VOC + 1 clean on 9 skills read "Ready 71, mastery 99 %"; one wrong SYS then 71 → 48).
   - **Evidence floor** (`readiness.EVIDENCE_W0 = 30`): provisional M = max over S ⊇ verdict of Σ_S w·m_shown/100 ÷ max(Σ_S w, 30).
     A handful of skills cannot stand in for the unit's 100 weight points.
   - Still monotone for the same reason as before: a clean answer raises one numerator or adds a new candidate set, and it never
     changes a fixed set's denominator or moves a skill into the verdict set.
   - With the floor, the best S is **not always a prefix by m_shown** (the critic's note said it is). Counter-example, now a test:
     always-count 21 points at 100, QUAD-CTX (w 2) at 50 and CS-LIN (w 9) at 40. The prefix gives .80 but {CS-LIN} alone gives .82.
     So `masteryTermTested` solves it exactly: a 0/1 knapsack over the integer weights (best numerator for each total weight),
     then the best ratio. A test checks it against every subset on 300 sparse saves.
   - `FORMULA_PROVISIONAL` and the Settings M legend print the floor and "M = Σ w·m_shown/100 ÷ max(Σ w, 30)".
     `rd.weight` (the points in the best S) is new.
   - Numbers (pure recompute on the critic's saved states): zero-after-page 68 → **33**, inflate 71 → **21**, inflate-onewrong
     48 → **21** (the cliff is gone), after-ace **57 = 57**, retry-cls-01 **54 = 54**, placemix 52.
2. **Major: a 10/10 JUMP HERE lowered R/M on the finish save** (flat m = 80 over an EMA-earned 93; placed skills forced into M).
   - `mastery.placeSkill` (run.js JUMP) and `onboard.writeSkill` for a clean item / JUMP pass now write **m = max(prev m, 80)**,
     never lowering an earned m (n was already protected). A retry or wrong placement item still writes 50 / 0.
   - **A clean placement is no longer a verdict on its own.** Verdict = a miss or a hinted clear. A clean placed skill counts only
     where it raises M, like any other clean skill. The r2 "placed skills always count" exception is gone from the printed rule.
   - Browser (`qa/fix5-home-r3.mjs jump M1`, from after-ace): R 57 → 59 → 60 over the 10 items; **finish 60 / M 84.37 (before the
     finish save 60 / 83.87)**, no drop. NOTE keeps m 95. `r3/jump-M1-finish.png` "Readiness 60 (provisional)", `r3/jump-M1-home.png`.
3. **Major: placement summary crushed "Linear word problem" to a letter or two per line.** The note after " · " in the right-hand tag
   ("needs the ratio item clean too") now renders as its own line (`span.ob-result-note`) inside the label cell. The right column
   keeps only "first try". `polish.css /* === fix5:home r3 === */`: `.ob-result-note { display:block }`, a 48vw cap on the tag,
   `overflow-wrap: normal` on the name. Shot with the ratio item wrong and the linear item clean at 375 px: `r3/placemix-rows-light.png`,
   `r3/placemix-rows-dark.png` (plus `-summary-*.png` full page). 0 lore hits in the summary and Home text.
4. **Minor: a legacy clean record that decayed and was answered again was read as a miss.**
   - `mastery.legacyMisses` now counts only signatures no clean-only history can make:
     - m + the charged decay < 35. A clean last answer always lands at ≥ 35, from any starting m.
     - No placedAt, n ≥ 5 and m + decay exactly 50 (the retry placement write).
     The critic's {m 66.04, n 3, decayDays 0} → 0, so it is "just started", not weak, and R does not move.
   - New `readiness.saveEvidence(save)` reads positive evidence from the save itself: card history entries (ok false or attempt ≥ 2
     = miss, hints > 0 = hint), `solutionShown`, and errors[] naming a card (item or forCard). These map to the card's primary skill
     through the source manifest, with no extra imports. `skillState`, `weakSpots`, `startedSkills` and the provisional M use it for
     every record (a clean answer never adds evidence, so (a) holds).
   - Known limit: a legacy miss on a **Variant** of a generator-only skill (CSARITH, SYS, FAC1, QUAD-CTX) has no card id to read.
     Its m had to fall below 35 to count. This is the direction the critic asked for ("prefer not a miss").

## Tests
- `tests/fix5-home.test.mjs` (39 pass). New:
  - floor cases: the inflate save and the no-cliff check;
  - property: M ≤ Σ_tested w·v / 30, and M ≤ the tested mean under 30 points;
  - the knapsack against every subset, plus the hand non-prefix case;
  - JUMP through both `onboard.applyJump` and `run.applyJump` after 10 clean answers (R, M ≥ before, earned m kept);
  - a clean placed skill never lowers M;
  - the legacy decayed record, and positive evidence from errors[] and history.
  (d) brute force: always-count = wrong ∨ hinted (from events), plus the floor, with sparse saves so the floor binds. When the
  generator strips a record to legacy, it writes the events into errors[] or the card history, as the real app does. Summary
  source pin updated.
- Updated pins of the old behaviour (each with a comment):
  - `tests/home-r2.test.mjs`: two placed skills (15 points) read 29, not 57; four read 57;
  - `tests/page.test.mjs` and `tests/integration-w4.test.mjs`: weak fixtures {m 50, n 3} etc. gain `misses: 1`;
  - `tests/run.test.mjs`: a JUMP over an earned m 95 keeps 95.
- Full suite: 1285 tests, 1281 pass, 0 fail, 4 skipped.

## Evidence r3 (`qa/screenshots/fix5-home/r3/`; drivers `qa/fix5-home-r3.mjs <placemix [dark]|zeropage|jump M1>`, the critic r2 harness,
## and `qa/fix5-home-r3b.mjs <wrongnew|mockcta-light|mockcta-dark|settings file>`)
- `node qa/s9-walk.mjs dip` → `s9/p-17-home-midpage-dip.png`: before 57 / mastery 80 %, after 4 clean Page items
  **61 / mastery 84 %**. No weak verdict, and the grey line "Just started, no misses yet: Vocabulary".
- `wrong-new-weak.png`: one wrong asn-01 from after-ace. Weak spots "Always/Sometimes/Never: Angles 0 · Drill 5", R 57 → 50.
- `zero-page-home.png`: the critic's zero save, 14 clean Page items. R climbs 0 → 2 → 3 … → 33 with no drop. It reads
  "Not ready · mastery 44 %", no longer "68 · 92 %".
- `mockcta-light-full.png` / `mockcta-dark-full.png` (375 px): exactly one Mock entry (the 56 px "Mock #1" button).
- `settings-readiness-zero-after-page.png`: Settings "33 · Not ready · provisional · over 5 of 19 skills tested", Home 33.
  The printed rule includes the 30-point floor.

## Spec deviation (replaces the r2 note for COMPOSED S10)
- S4 provisional M: M = max over S ⊇ {missed or hinted skills} of Σ_S w·m_shown/100 ÷ max(Σ_S w, 30), over tested skills.
  Placement no longer forces a skill in.
- S1 / S7 placement and JUMP writes: m = max(earned m, 80) on a clean item or a pass (was a flat 80).
- S7 Weak spots: n ≥ 1 ∧ (misses ∨ helped ∨ evidence in card history / errors[]) ∧ m_shown < 70.
- S6 `skills[id]` keeps `misses` / `helped` (r1/r2).
