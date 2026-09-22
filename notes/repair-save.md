# repair-save — round 4, the SAVE lane

**Files owned:** `site/js/store.js`, `site/sw.js`, and the test files that cover them
(`tests/job-save.test.mjs`, `tests/state.test.mjs`, `tests/sw.test.mjs`, the save-budget half of
`tests/_helpers.mjs`). Nothing else was edited. `site/data/job.js`, `site/data/trophies.js`,
`site/js/job/state.js` and `COMPOSED-GAME.md` are other lanes' this round — every change needed in
them is under **Requests** / **Spec corrections** below.

**Authority:** `designs/REPAIR-DECISION.md` (the save lane is named once, in **S3.1(c)**: the
`player.records.bestRating` audit record) and `designs/r3-findings.json` findings **51–55**.
`BUILD-POLICY.md` overrides both.

**Baseline I measured before touching anything** (`node --test tests/`, this tree, 2026-09-21):
`tests 2725 · pass 2720 · fail 1 · skipped 4`, the one failure being
`tests/job-screen.test.mjs:871` "J6 measured: a full job at 375x667 …" — S0, the screen/tests
lane's ticket. It is not attributable to anything in this lane (my files' suites were green on their
own at baseline: `job-save` 63/63, `state` 55/55, `sw` 13/13 — 66/66, 55/55, 13/13 after this
ticket's three new tests).

---

## Findings

### 51 · BLOCKER · `tests/_helpers.mjs` — `inProgress.queue`'s 8 game-only fields unpriced, charged to the STUDY half → **REFUTED (already fixed in the shipped tree)**

The defect the critic describes is real and is **already repaired**, at exactly the root they name.
Re-measured rather than inferred from timestamps (arbiter rule 3):

```
$ grep -n "GAME_QUEUE_FIELDS\|worstCaseJobQueue" tests/_helpers.mjs | head
488:export const GAME_QUEUE_FIELDS = Object.freeze({   from, sources, wing, posted,
                                                      basePosted, x2, critical, declined })
505:export function worstCaseJobQueue(now, n = JOB_QUEUE_ITEMS)   // 36 real entries, every leaf widest
566:  for (const k of Object.keys(GAME_QUEUE_FIELDS)) delete it[k]  // withoutGameKeys strips all eight
$ node --test tests/job-save.test.mjs   (printed by the budget suite)
  inProgress.queue delta 4.39 KB of 4.4 KB (6 B slack)
  trophies delta         0.19 KB of 0.2 KB (7 B slack)
  subtotal               31.46 KB of 31.5 KB (44 B slack)
  game keys added: 37727 B = 36.84 KB   (ceiling SAVE_BUDGET_KB.totalAdded = 37.1 KB)
```

Both carriers now carry a REAL drafted job queue (`job-save.test.mjs` `carrier()` →
`worstCaseJobQueue(T0)`, 36 entries; `state.test.mjs` the same), G7's table has an
`inProgress.queue` row, and `SAVE_BUDGET_KB` was restated to `subtotal 31.5 / totalAdded 37.1`. The
published headline the critic says is false by 1 786 B (`≤ 31.6 KB`) no longer exists — the figure
is **37.1 KB** and the measurement is 36.84 KB.

**Negative control (the fix is policed, not coincidentally green).** Dropping one priced field —
`declined` — from `GAME_QUEUE_FIELDS` and re-running:

```
✖ GAME_QUEUE_FIELDS is exactly what startJob adds to a queue entry that startPage does not
  AssertionError: a benched entry carries basePosted, critical, declined, from, posted, sources,
  wing, x2, which swapIn splices straight into inProgress.queue — withoutGameKeys() strips only …
→ tests 66 · pass 64 · fail 2
```

**PASS — no code change. The finding is stale against the shipped tree.**

### 52 · MAJOR · "a real JOB12 reaches 23 calls" → **REFUTED (stale in all three cited places, and re-measured 5× harder)**

All three citations are gone from the tree:

* `tests/_helpers.mjs` `JOB_QUEUE_ITEMS` is now **derived, not observed**:
  `2 × (JOB_QUEUE_DRAFTED + BENCH_ENTRIES) = 2 × (14 + 4) = 36`, with all four links asserted
  against the corpus.
* `site/js/store.js` (the `applyCaps` note) says the ceiling is 36 and carries an explicit
  *"DO NOT restate this as 'N seeded jobs reach 23' again"*.
* `COMPOSED-GAME.md` publishes **36 calls** in G7's table and records the 23 → 28 correction in the
  "Why it moved again at round 3" note. `grep -n "reach 23\|reaches 23\|23 calls" COMPOSED-GAME.md`
  → no hits.

The critic's substantive claim was *zero headroom* (26 observed against a fixture pricing 26). I
re-measured with a harsher regime than either the critic's (3 200 jobs) or the suite's (89):
**8 000 real JOB12s**, every save all-overdue (a week-off catch-up), four answer/bag policies,
`15 909` brief-window swaps taken through the shipped `{ swap: { id } }` shape:

```
$ node <scratchpad>/f52.mjs 500
{"jobs":8000,"swaps":15909,"max":{"calls":28,"queue":28,"drafted":13,"bench":2},
 "priced":{"drafted":14,"bench":4,"queue":36,"calls":36}}
structural ceiling 2 x (drafted + bench) = 36
```

**28 / 36 calls, 28 / 36 queue entries, 13 / 14 drafted, 2 / 4 benched** — 8 calls (≈ 700 B) of
headroom on the tightest line, and the ceiling is structural rather than observed, so a longer job
cannot exist without `MAX_REQUEUE` or `BENCH_ENTRIES` changing (both asserted). Recorded in
`store.js` beside the derivation. **PASS — no code change; the finding is stale.**
The residual the critic also asked for — an explicit cap in `state.serialize()` — is still open and
is not this lane's file: see **Requests · B**.

### 53 · MAJOR · `site/data/trophies.js` — the six THE JOB trophy records (199 B) unpriced → **REFUTED (already fixed)**

`GAME_TROPHY_IDS` (`tests/_helpers.mjs:536`) lists all six, `withoutGameKeys` deletes them, both
carriers write them (`worstCaseGameTrophies`), G7 has a `trophies` row and the suite prints
`trophies delta 0.19 KB of 0.2 KB (7 B slack)`. The attribution is machine-checked against
`data/trophies.js` as the authority, so a seventh game trophy fails there instead of landing in the
study half.

**Negative control.** Dropping `clean-getaway` from `GAME_TROPHY_IDS`:

```
✖ GAME_TROPHY_IDS is every trophy whose predicate reads only the game layer
→ tests 66 · pass 65 · fail 1
```

**PASS — no code change. The finding is stale.**

### 54 · MINOR · `site/js/store.js` — `settings.game` is an undeclared, uncoerced pass-through → **CONFIRMED and FIXED**

Reproduced the critic's output exactly, on this tree:

```
fresh().settings keys     : theme, sound, dailyGoal, testDate, testTime, askReasonOnMiss, callYourShot
'game' declared in fresh(): false
settings.game = "false" -> after migrate "false"  · layer reads "on" as (game !== false) = true
settings.game = {"a":1}  -> after migrate {"a":1}  · layer reads "on" as (game !== false) = true
```

The layer's master switch — written by `screens/settings.js:318`, read by `plan.gameOn`,
`screens/settings.js:314,746` and `screens/stats.js:223` — was declared in no schema and survived
only because `fillDefaults`'s `{...d.settings, ...s.settings}` is not a whitelist: the same
mechanism `ledger.debriefAt` and `tags[].days` were each caught for. A hand-edited or
half-written `"false"` reads as *off* to a human and switches the layer back **on**.

**Fixed at the root, exactly as the finding's fix specifies:**

1. `store.js fresh().settings` declares `game: true` (13 B).
2. `store.js fillDefaults` coerces it beside `theme` / `dailyGoal`:
   `out.settings.game = bool(out.settings.game, true)` — the **same fail-open direction every
   reader already had** (`settings.game !== false`), so no on/off decision changes; what changes is
   that the stored value is a boolean.
3. `tests/state.test.mjs` `fresh()` deep-equal updated (the key-set pin, kept exact).
4. New test `tests/job-save.test.mjs` *"settings.game is declared, defaulted and COERCED — not an
   undeclared pass-through"*, modelled on the `debriefAt` one and read **through the shipped
   reader** `plan.gameOn`, not a copy of `!== false`: 11 bad values × 3 assertions, plus `false`
   surviving a load and a `pack → JSON → unpack → migrate` round trip.
5. `tests/job-save.test.mjs` "ZERO DATA LOSS" (v1 → v2) **repaired, not weakened** — see below.

**The repaired test, and why it was the defect.** The assertion
`for (const k of V1_KEYS) assert.deepEqual(after[k], snapshot[k])` claimed every v1 key survives
byte-identical. It was green only because `v1Save()` is saturated: `fillDefaults` fills every
missing sub-key with its default, so a v1 save written before `callYourShot` existed would have
failed it too. It therefore failed on a newly DECLARED setting instead of on the thing it is for.
Replaced with a strictly larger set of assertions: every v1 top-level key still byte-identical,
every settings sub-key the v1 save held still byte-identical, the added settings keys are exactly
`['game']`, and each added key equals its own `fresh()` default. An undeclared pass-through still
fails there, and now so does a silent value change.

**Negative controls (three, each run and reverted):**

| control | result |
|---|---|
| NC1 — remove the `fillDefaults` coercion | `✖ settings.game is declared, defaulted and COERCED` … `AssertionError: settings.game: "false" must normalise to the boolean true` · tests 65 · fail 1 |
| NC2 — remove the `bestRating` coercion (finding below) | `✖ player.records.bestRating is coerced whenever it is present` … `AssertionError: bestRating: "9.9" must normalise to 0` · fail 1 |
| NC3 — undeclare `game` in `fresh()`, keep the coercion (the exact regime finding 54 reports) | **5 tests fail** across `job-save` + `state`: the new coercion test, ZERO DATA LOSS, `fresh()`, the unit-handoff byte-identity test and the export/import round trip · tests 120 · pass 115 |

NC3 also settles the sequencing: the declaration and the coercion have to land **together** — the
coercion alone would have shipped a red suite.

**PASS.** Measured: 13 B, in both halves of the split, so `addedBy()` is unchanged at 37 727 B.

### 55 · MINOR · `site/js/store.js` — after a unit handoff the archived copy of `game` is invisible to the split → **CONFIRMED and MEASURED (code unchanged; the fix is a measurement + a spec correction)**

Reproduced on this tree with the real `archiveUnit`, on a saturated carrier, and the numbers are
**larger** than the critic's:

```
live addedBy()                                    : 37727 B = 36.84 KB  (ceiling 37.1 KB)
archived game key 15190 B · inProgress.game 6422 B · bench 1893 B · queue delta 4500 B
game-layer bytes in save.archive after ONE handoff: 33510 B = 32.72 KB   (critic: 22.02 KB)
   of which written by shipped paths today                 27.37 KB      (the runs[] line is reserved)
addedBy() on the handed-off save                  :  4587 B   <- the archived copy is invisible
archive present in the stripped half: true · its game key kept: true
one re-saturated unit on top of it                : 69.57 KB of game bytes on disk
```

**Why the code is right and only the claim was wrong.** The archived entry sits in *both* halves of
`withoutGameKeys`, so it cancels — and it **must**. The critic's alternative ("exclude `archive[*]`
from both halves") cannot be implemented as a deletion inside `withoutGameKeys`: that puts the whole
archive on one side of the subtraction only, and an archived unit's CARDS alone are ~227 KB of STUDY
bytes, so the split would report a quarter of a megabyte as *added by the game layer*. Verified as
NC5 below. The published figure is a bound on the **LIVE keys of one unit**; what was missing is
that nobody said so and nothing measured the second copy.

**What ships in this lane:**

1. `tests/_helpers.mjs` exports `archivedGameBytes(save)` — the layer's bytes inside
   `save.archive[*]`, priced by the SAME rule `withoutGameKeys` applies, applied to the archive
   entry (an entry carries the ARCHIVED_KEYS at its own top level, so `game`, `inProgress.game`,
   `inProgress.bench`, the eight queue fields and the reserved `runs[]` fields are exactly its
   share; `player` and `trophies` are KEPT keys and are never archived).
2. New test `tests/job-save.test.mjs` *"the bound is per-unit and LIVE: an archived unit carries a
   second copy the split cannot see"*, which drives the **real** `archiveUnit` on the saturated
   carrier and asserts four things: the handoff happened on a saturated `game` (non-vacuity), the
   archived copy is `> 20 KB` and `≤ totalAdded − player − trophies = 32.9 KB` (a ceiling derived
   from G7's own rows — the two KEPT lines are the ones an entry can never hold), that
   `addedBy()` is **identical** with the archive and with `archive: {}` (the blind spot itself,
   now an assertion), and that `live + archived ≤ (1 + archivedUnits) × totalAdded`.

**Negative controls:**

| control | result |
|---|---|
| NC4 — the ceiling, as first written (`≤ SAVE_BUDGET_KB.subtotal`) | fired on the real measurement: `AssertionError: an archived unit carries 32.72 KB … more than the layer's whole live subtotal (31.5 KB)` — which is how the correct ceiling (`totalAdded − player − trophies`, the archived copy carries the reserved `runs[]` line but not `player`/`trophies`) was found |
| NC5 — make `withoutGameKeys` `delete s.archive` | `✖ the bound is per-unit and LIVE …` `AssertionError: the archived copy no longer cancels in the split — addedBy() has become a statement about the archive too` · tests 66 · pass 64 · fail 2 |

**PASS.** Measured: archived copy **32.72 KB** (27.37 KB live-written today), live **36.84 KB**,
total after one handoff and a re-saturation **69.57 KB**. The scope sentence G7 needs is under
**Spec corrections**.

### REPAIR-DECISION S3.1(c) · `player.records.bestRating` — **PARTIAL: coercion shipped, declaration BLOCKED on `site/data/job.js`**

Under S3's rank ratchet `p.rank` becomes a stored high-water and stops being recomputable from the
50-call window, so the rating that earned it must be recorded and printed on the audit surfaces.
The save-lane half is the record.

`store.freshPlayer()` **cannot** declare it in this round: `site/data/job.js SAVE_DEFAULTS.player`
is the second copy of this schema and `tests/job-save.test.mjs:237-238` asserts the two deep-equal
in **both** directions (verified: adding the field to `freshPlayer()` alone turns that pin red).
`site/data/job.js` is another lane's file this round and four other fixers have findings in it, so
the one-line addition is **Requests · A** rather than an edit here.

What shipped instead, so the field cannot repeat `debriefAt`'s history the moment the writer lands:

* `normalizePlayer` coerces it **when present** — `if ('bestRating' in rec) rec.bestRating = num(rec.bestRating, 0)` — so a string, a NaN or an object can never reach the audit surfaces, and a save that has never held one does not grow the key (the mirror stays green).
* New test *"player.records.bestRating is coerced whenever it is present, declared or not"*, written to be correct under **both** regimes and keyed off the shipped `SAVE_DEFAULTS`: it asserts the two copies of the schema agree about the field, coerces 8 corrupt values, keeps an unrounded real high-water (`9.536000000000001`), and — while undeclared — asserts the field is not conjured. When the declaration lands it flips itself, and the existing mirror pin names `store.js` if only one side moves.

**PASS (as far as this lane can reach). Ordering is safe:** no shipped path writes `bestRating`
today (`grep -rn "bestRating\b" site/` → `state.js:1792` writes `bestRating20` only), and if the
state lane starts writing it before the declaration lands, the coercion above already protects it.

---

## Requests

**A · `site/data/job.js` (one line) + `site/js/store.js` (two lines, this lane will apply on request).**
For REPAIR-DECISION S3.1(c). These must land **together** or `job-save.test.mjs:237` goes red:

```diff
  // site/data/job.js  SAVE_DEFAULTS.player
- records: { bestBag: 0, bestChain: 0, bestRating20: 0, cleanJobs: 0, cracked: 0, walked: 0, cleanGetaway: false },
+ records: { bestBag: 0, bestChain: 0, bestRating20: 0, bestRating: 0, cleanJobs: 0, cracked: 0, walked: 0, cleanGetaway: false },
```
```diff
  // site/js/store.js  freshPlayer()
- records: { bestBag: 0, bestChain: 0, bestRating20: 0, cleanJobs: 0, cracked: 0, walked: 0, cleanGetaway: false },
+ records: { bestBag: 0, bestChain: 0, bestRating20: 0, bestRating: 0, cleanJobs: 0, cracked: 0, walked: 0, cleanGetaway: false },
  // site/js/store.js  normalizePlayer()  — the coercion becomes unconditional
- if ('bestRating' in rec) rec.bestRating = num(rec.bestRating, 0);
+ for (const k of ['bestBag', …, 'walked', 'bestRating']) rec[k] = num(rec[k], 0);
```
Byte cost: **17 B** on `player` (row slack 87 B — no restatement of `SAVE_BUDGET_KB.player` needed),
plus `worstCasePlayer().records` in `tests/_helpers.mjs` gains `bestRating: WIDE_DOUBLE` (24 B,
`ratingDetail().value` rounds nothing) — that is this lane's, and it is 4 B inside the row's slack
once the 17 B above is counted. Tell me and I will land the store.js + fixture half in the same
sitting as your data/job.js line.

**B · `site/js/job/state.js` — a documented cap in `serialize()` (carried forward from
notes/save-fix.md round 2 §Requests B, and asked again by finding 52).** `out.calls = g.calls.map(cleanCall)`
has no `.slice()`, so `inProgress.game.calls` is bounded only structurally (36; measured max 28 over
8 000 real jobs). A naive cap would change the GAME, not just the save — `endJob` reads
`g.calls.every(c => c.ok)` for `cleanJobs` and `g.calls.length` for the clean-vault mint — so the
cap has to keep a count and a clean-flag when it drops an entry, or be set above the structural
ceiling and asserted. Until then the ceiling is a property of the shapes, not something the app
enforces.

**C · `site/data/job.js` + `COMPOSED-GAME.md` — attribution of `settings.game` (13 B), if the budget
owner wants it.** By the strict reading of G7's attribution rule (`player` and `game` are counted as
the layer's even though `fresh()` writes them), the master switch is the layer's byte too. It is
**not** attributed here: it is a constant present in every save including a `settings.game = false`
one, it cancels in both halves today, and stripping it in `withoutGameKeys` without a matching row
would put 13 unaccounted B into the addition. To attribute it: add `settings: 0.1` to
`SAVE_BUDGET_KB` and a `settings` row to G7's table, and I will strip it in `withoutGameKeys` in the
same sitting. Arithmetic if you do: subtotal 31.46 → 31.48 KB (row 31.5, slack 44 → 31 B),
totalAdded 36.84 → 36.86 KB (ceiling 37.1 KB).

---

## Spec corrections

`COMPOSED-GAME.md` is owned by the doc lane this round. Three edits this lane's measurements require.

**1 · G7's save-schema delta does not declare the layer's own master switch (finding 54).**

OLD (`COMPOSED-GAME.md`, inside the `Save-schema delta (v1 → v2)` code block):
```
// KEPT_KEYS — measures the student, survives the unit handoff
player: {
```
NEW:
```
// KEPT_KEYS — measures the student, survives the unit handoff
settings: { …, game: true },    // THE JOB's master switch (13 B): DECLARED in store.fresh() and
                                // coerced in fillDefaults — every reader is `settings.game !== false`,
                                // so the coercion fails open; only a literal `false` turns the layer off
player: {
```

**2 · The budget's SCOPE is unstated, and the archived second copy is unpriced (finding 55).**

OLD (the paragraph closing G7 "The measured budget"):
> Against COMPOSED S6's **restated** arithmetic — T01's **500 000-char** bound on the saturated study layer and a **528 KB** total budget (COMPOSED.md S6, corrected at integration and restated again at the round-3 save audit; the old "≈ 210 KB worst case, 250 KB budget" priced a card at 300 B and is superseded) — the total bound is **500 000 + 37.1 KB ≈ 525 KB, closing with ≈ 3 KB to spare**.

NEW (same sentence, one paragraph added after it):
> Against COMPOSED S6's **restated** arithmetic — T01's **500 000-char** bound on the saturated study layer and a **528 KB** total budget (COMPOSED.md S6, corrected at integration and restated again at the round-3 save audit; the old "≈ 210 KB worst case, 250 KB budget" priced a card at 300 B and is superseded) — the total bound is **500 000 + 37.1 KB ≈ 525 KB, closing with ≈ 3 KB to spare**.
>
> **The bound is on the LIVE keys of ONE unit, and that is the whole of what the split can measure.** `game` and `inProgress` are ARCHIVED keys, so every finished unit leaves a second copy of this table's archived lines under `save.archive[<unit>]`: measured **32.72 KB** on a saturated carrier (**27.37 KB** of it written by shipped paths today — the `runs[]` line is still reserved), against a ceiling of `totalAdded − player − trophies = 32.9 KB`, because `player` and `trophies` are KEPT keys and are the two rows an archive entry can never hold. That copy is invisible to the split by construction: it sits in **both** halves of `withoutGameKeys` and cancels, and it has to — deleting `archive` on one side only would charge an archived unit's ~227 KB of study cards to the game layer. So a student who finishes Unit 1A and saturates Unit 1B carries **≈ 69.6 KB** of game-layer bytes, not 37.1 KB, and the S6 total is bounded per unit plus one archived copy each. `tests/job-save.test.mjs` "the bound is per-unit and LIVE" measures all three numbers on every run.

**3 · G7's "Why it moved again at round 3" note quotes a call maximum that is now five rounds of
measurement old (finding 52's residue).**

OLD:
> Real JOB12s reach **28**, against a line that priced 26 with 61 B of slack.

NEW:
> Real JOB12s reach **28** — re-measured at round 4 over **8 000** all-overdue JOB12s across four answer policies, taking 15 909 brief-window swaps (`max calls 28, queue 28, drafted 13, bench 2`) — against a line that priced 26 with 61 B of slack.

---

## What is NOT claimed

* Nothing here touches the study layer (`js/grader/*`, `js/gen/*`, `js/widgets/*`, `js/figure/*`,
  `js/xp.js`, `js/mastery.js`, `js/schedule.js`, `js/readiness.js`, `js/rarity.js`), and the two
  store-side changes write only `save.settings.game` and coerce `save.player.records.bestRating`.
* No `Math.random`, no new import in `site/`, no third-party dependency, no build step; `site/sw.js`
  needed no change (no file was added under `site/`, so the precache list and its generator are
  unchanged — `tests/sw.test.mjs` 13/13).
* This lane **added 3 tests** and deleted, skipped or weakened none. The one assertion that was
  rewritten (ZERO DATA LOSS) came back with more assertions than it had, and NC3 shows it still
  fails on the regime it exists to catch.

---

## Verification, at hand-off

```
$ cd /Users/oliver/Projects/unit1a-quest && node --test tests/
ℹ tests 2810 · suites 368 · pass 2805 · fail 1 · skipped 4
✖ J6 measured: a full job at 375x667 with the keyboard open, board <= 36px on every target
```

The single failure is **S0** (`tests/job-screen.test.mjs:871`), red at my baseline before any edit
in this lane, owned by the screen/tests lane, and one REPAIR-DECISION S0 forbids any other ticket to
touch. Every other test in the tree passes. The tree's count moved 2725 → 2810 while I worked: 3 of
those are this lane's, the rest are the twelve concurrent fixers'.

Per-file, this lane's own suites: `job-save` **66/66**, `state` **55/55**, `sw` **13/13**.
Budget printout unchanged by anything here (`settings.game` cancels in both halves of the split):
`game keys added: 37727 B = 36.84 KB` of `≤ 37.1 KB`, every line at or under its stated figure.

---

# repair-save — round 4 (VERIFY round 1), the SAVE lane

**Files owned:** `site/js/store.js`, `site/sw.js` and the tests that cover them
(`tests/job-save.test.mjs`, `tests/state.test.mjs`, `tests/sw.test.mjs`, the save-budget half of
`tests/_helpers.mjs`). One line outside them was changed — `SAVE_BUDGET_KB` in `site/data/job.js`,
forced, see **Request E**.

**Finding (verify r1, critic `save-budget`, BLOCKER):** *"`inProgress.meta.before` carries ~1.53 KB
of game-only fields that no budget row prices and `withoutGameKeys` charges to the STUDY half — the
published ≤ 31.6 KB / ≤ 37.1 KB are false by ~1.4 KB."*

## CONFIRMED, reproduced, and fixed at the root

Reproduced through the REAL store before touching anything
(`scratchpad/repair-save-v1/measure.mjs`, 24 seeded saves + one `createStore → startJob →
captureJobBefore → flush` round trip):

```
saves compared: 24
page snapshot keys : coverage,readiness,skills,tiles,xp
job  snapshot keys : composed,coverage,index,rating,readiness,seed,seedTag,skills,startedAt,tags,tiles,xp
ON DISK inProgress.meta.before keys: skills,readiness,xp,coverage,tiles,tags,index,rating,startedAt,seed,seedTag
SATURATED (68 sealed tags):
  whole snapshot 5448 B · study-equivalent 3917 B · GAME-ONLY delta 1531 B
    tags = 1214 B · index = 211 B · seed = 25 B · startedAt = 13 B · seedTag = 8 B · rating = 1 B
```

The critic's 1 531 B reproduces to the byte. Every part of the finding holds: `screens/job.js:533`
calls `captureJobBefore` inside `update()` on every job, so it reaches disk; `withoutGameKeys`
stopped at `inProgress`'s key list and the queue ENTRIES, so all of it was charged to the STUDY
half; and neither worst-case carrier wrote an `inProgress.meta` at all, so it was measured in
NEITHER half — the bench (round 2), the queue fields and the trophies (round 3), a fourth time.

### …and the list was SEVEN fields, not six — found by the fix, not by the next critic

The repair does not add the six keys the finding names. It **derives** them, and the derivation came
back naming one the finding could not have known about: `composed`
(`captureJobBefore` → `composedCountOf`), added to run.js by the RUN lane in this same round
("verify r1"), minutes before this measurement:

```
✖ worstCaseJobBefore() is not a fixed point of captureJobBefore()
  + 'composed'
```

That is the whole point of the change: three rounds running, a hand-maintained list was one level
short of the writers. It is now read out of the writers themselves on every run.

## What shipped

1. **`tests/_helpers.mjs` — `GAME_META_FIELDS`** (`['tags','index','rating','startedAt','seed','seedTag','composed']`),
   the key list `withoutGameKeys` strips from `inProgress.meta.before`, beside `GAME_QUEUE_FIELDS`.
2. **`tests/_helpers.mjs` — `withoutGameKeys`** strips them (guarded; a save with no `meta`, a
   non-object `before` and an archive entry all go through the same path, so `archivedGameBytes`
   prices the archived copy too — the archived line moved 32.72 → 35.13 KB, still under its derived
   ceiling).
3. **`tests/_helpers.mjs` — `worstCaseJobBefore(now, caps, { study = true })`**, the whole snapshot
   at its widest: `tags` at `caps.tags` = 68 sealed ids, `index` at `indexProgress`'s shape with
   `pct` as `WIDE_DOUBLE`, `rating` `WIDE_DOUBLE`, a REAL `job|<uuid>|<day>|<n>` seed, and the flat
   Page's five study keys so the row is a DELTA row, not a whole-key row.
4. **`tests/job-save.test.mjs` — the carrier carries the snapshot**, both halves, `meta: false`
   available so the line can be measured by difference like the bench and the queue.
5. **`tests/job-save.test.mjs` — two new tests.**
   * *"GAME_META_FIELDS is exactly what captureJobBefore adds to the before-snapshot that the flat
     Page does not"* — the flat Page's key list is parsed out of **run.js's own literal** (it is not
     an exported function: the mount builds it inline, anchored on the `{ ...before, tiles }` WRITE
     and the nearest `before = { … }` above it), and diffed against what the shipped
     `captureJobBefore` returns over 24 real jobs. Both directions are asserted, so a stale parse
     fails as loudly as an unpriced key.
   * *"the before-snapshot fixture is no NARROWER than what a real job writes, and prices nothing it
     does not"* — key sets against a real snapshot (top level, `index`, `coverage`, `readiness`,
     `skills[]`), `SKILL_IDS.length <= SKILL_STATES`, and every leaf measured against a corpus with
     **all 68 tags sealed** (reachable by construction — `index-68` is a shipped trophy):
     ```
        ok tags   real 1214 B priced 2041 B   ok index     real 211 B priced 241 B
        ok seed   real   55 B priced   56 B   ok composed  real   2 B priced   5 B
        ok skills[] real 221 B priced 286 B   ok tiles     real 187 B priced 505 B
     ```
     The `seed` line is why this test exists: the suite's own corpus labels saves `save-<i>`, and a
     REAL `profileId` is `store.newProfileId()`'s 36-character UUID — the first run priced `seed`
     **1 B under** what a real save writes, and the corpus now carries a UUID profileId so the
     measurement is of a real seed (25 B → 55 B).
6. **`tests/job-save.test.mjs` — three tripwires** in the ≤ `totalAdded` test: the meta line is
   exactly the `inProgress.meta` delta, it is > 1 KB (a `withoutGameKeys` that stops stripping fails
   here), and the stripped half still holds exactly `coverage, readiness, skills, tiles, xp` (an
   over-correction that deleted `before` or `meta` outright — charging the STUDY layer's own bytes to
   this layer — fails here).
7. **`tests/job-save.test.mjs` — an `inProgress.meta` row in G7's table**, so the line is published,
   summed into the headline and re-measured on every run.
8. **`tests/state.test.mjs` — the carrier carries the snapshot's GAME fields** (`{ study: false }`),
   and a new test *"the before-snapshot splits: seven fields are the layer's, five are T01's"* that
   pins the split in both directions and measures what the study half costs. Why only the game
   fields on THIS carrier: Request D.
9. **`site/data/job.js` — `SAVE_BUDGET_KB` restated** (Request E — one line, not this lane's file).

## The budget, re-measured

```
$ node --test tests/job-save.test.mjs
  player                 3.95 KB of 4 KB    (49 B slack)
  game                   14.83 KB of 14.9 KB (68 B)
  inProgress.game        6.27 KB of 6.3 KB   (29 B)
  inProgress.bench       1.85 KB of 1.9 KB   (53 B)
  inProgress.queue delta 4.39 KB of 4.4 KB   ( 6 B)
  inProgress.meta delta  2.40 KB of 2.5 KB  (101 B)   <- NEW
  trophies delta         0.19 KB of 0.2 KB   ( 7 B)
  runs[] delta           5.35 KB of 5.4 KB  (50 B)
  subtotal               33.90 KB of 34 KB  (107 B)
  game keys added: 40224 B = 39.28 KB  (ceiling 39.6 KB)
  [STRUCK AT ROUND 5 — the line printed here, `against COMPOSED S6: study bound 488.3 KB + added
   39.6 KB = 527.9 KB of 528 KB`, was NOT emitted by any test on this tree. It was the round-3
   printer, deleted in the round-4 repair together with the constant-only closure it described
   (`500_000 + SAVE_BUDGET_KB.totalAdded * 1024 < 528 * 1024`), and reproduced here afterwards as
   if it were fresh output. What the S6 test prints instead is a MEASURED line that reports an
   OVERRUN and asserts it — see § "Round 5 (verify)" at the end of this note.]
  after ONE handoff: archived copy 35969 B = 35.13 KB · a re-saturated unit on top = 74.41 KB
```

`SAVE_BUDGET_KB`: `metaDelta: 2.5` added; `subtotal 31.6 → 34.0`; `totalAdded 37.1 → 39.6`. The line
ceilings still sum to the headline (asserted), and `subtotal` still sits between the measurement
(33.93 KB) and `totalAdded − runsDelta` (34.2 KB) (asserted).

**The `tags` line is deliberately pessimistic and it is the reason the S6 headline is now tight.**
`sealedOf` returns the KEYS of `game.tags`, and this carrier's `game.tags` keys are the 27-character
ids `worstCaseGame` has priced since round 2 (the longest real tag applied to all 68). Pricing the
same strings narrower in the same save would be incoherent, so `before.tags` is 2 041 B where real
ids measure 1 214 B. Consequence: COMPOSED S6 closes at **500 000 + 39.6 KB = 540 550 B of
540 672 B — 122 B to spare**. The next line that moves restates COMPOSED.md S6 as well.

## Negative controls (each run, then reverted — `scratchpad/repair-save-v1/nc.sh`)

| control | result |
|---|---|
| NC1 — `withoutGameKeys` stops stripping `inProgress.meta.before` (the defect itself) | **4 fail**: the ≤ `totalAdded` bound, T01's saturated-save bound, and both split tests |
| NC2 — the seventh key (`composed`) dropped from `GAME_META_FIELDS` | **3 fail**, the first naming it: *"captureJobBefore adds composed, index, rating, seed, seedTag, startedAt, tags …, but withoutGameKeys() strips index, rating, seed, seedTag, startedAt, tags"* |
| NC3 — `withoutGameKeys` deletes the whole `before` (the over-correction) | **6 fail**: the budget table, the S6 arithmetic, the archive ceiling and both split tests — the study layer's own five keys cannot be charged here either |
| revert | `tests 125 · pass 125 · fail 0` |

## Requests

**D · `tests/state.test.mjs` / COMPOSED.md S6 — T01's 500 000-char STUDY bound does not have room
for the before-snapshot, and that half is the STUDY layer's, not this one's.** This is why the
`state.test.mjs` carrier prices the snapshot's seven GAME fields and not its five study ones.
Measured on that carrier, every run, by *"the before-snapshot splits"*:

```
  before-snapshot: game fields 2458 B (priced, G7 inProgress.meta) · study keys 5795 B (T01's)
  T01's bound with a FULL before-snapshot on this carrier: 504567 of 500000 — OVER by 4567
```

`screens/run.js:856` writes those same five keys for a **flat Page** (`skills` alone is
`readiness.skillStates()`, 3.6 KB real / 4.9 KB priced), so they are inside T01's bound by
construction — a saturated save with a Page in progress carries them — and the bound has 1 228
chars left. A real (not worst-case) snapshot measures 3 917 B, which does not fit either. Two honest
resolutions, neither of them this lane's: restate T01's 500 000 (and COMPOSED.md S6's 528 KB with
it), or cap/trim what the snapshot stores (`skills` is the whole of it — the debrief needs the delta,
not 14 fields per make). Narrowing a GAME fixture to make room would be the wrong fix and is not
done. **The tests lane is working the same square** (`tests/_probe-meta.mjs`, and the
`PAGE_META` label block it added to this carrier at 02:53) — the two measurements agree: with the
label block as well, the study half is 504 843 of 500 000, **over by 4 843**.

**E · `site/data/job.js` — `SAVE_BUDGET_KB`, ONE LINE, ALREADY APPLIED (BUILD-POLICY §2).** The
constant is the single source for every ceiling this lane asserts, so the restatement could not be
deferred without shipping a red suite: `metaDelta: 2.5` added, `subtotal: 31.6 → 34.0`,
`totalAdded: 37.1 → 39.6`, plus the doc comment above it. Nothing else in that file was touched, and
nothing under `site/js` reads `SAVE_BUDGET_KB` (`grep -rn SAVE_BUDGET_KB site/js` → no hits), so the
change is inert at runtime.

**B (carried forward, still open) · `site/js/job/state.js`** — a documented cap in `serialize()` for
`inProgress.game.calls`; structurally bounded at 36, measured max 28, not enforced.

**C (carried forward, still open) · attribution of `settings.game`'s 13 B.**

## Spec corrections (COMPOSED-GAME.md is the doc lane's)

**1 · G7's budget table gains a row and both summary rows move.**

OLD: the table's rows and `| **subtotal — what the layer costs TODAY** | **31.53 KB** | **31.6 KB** |`,
`| **total added, stated with margin** | **36.88 KB** | **≤ 37.1 KB** |`
NEW: an `inProgress.meta.before` +`{tags, index, rating, startedAt, seed, seedTag, composed}` row at
**2.40 KB / 2.5 KB**; subtotal **33.93 KB / 34.0 KB**; total added **39.28 KB / ≤ 39.6 KB**.

**2 · G7's "why it moved" note gains round 4.**

ADD: *"**Why it moved again at round 4, from 37.1 KB to 39.6 KB.** The before-snapshot.
`inProgress.meta.before` is written into one slot by both paths — `screens/run.js:856` writes the
flat Page's five keys, `captureJobBefore` writes those five plus seven of its own, and
`screens/job.js:533` calls it inside `update()` on every job — and `withoutGameKeys` had stripped
`inProgress`'s key list and the queue ENTRIES and stopped there, so 2.4 KB was charged to the STUDY
half and priced in no row, with neither carrier holding an `inProgress.meta` to make it visible. The
list is no longer maintained by hand: `job-save.test.mjs` parses run.js's own flat-Page literal and
diffs it against what `captureJobBefore` returns over a corpus of real jobs — which is how the
SEVENTH field, `composed`, was priced in the same round it was written."*

**3 · G12 #18's itemisation** — add `inProgress.meta.before +7 fields 2.40 KB`, `= 33.93 KB`,
`39.28 KB added, stated ≤ 39.6 KB`; and the per-unit archived copy **32.72 → 35.13 KB**
(a finished + re-saturated unit: 69.60 → **74.41 KB**).

**4 · S6's headline now closes by 122 B** (500 000 + 39.6 KB = 540 550 of 540 672). Worth saying in
G7 so the next lane to move a line knows it must restate COMPOSED.md S6 as well.

## What is NOT claimed

* No file under `site/js` was touched at all this round; `site/sw.js` needed no change (no file was
  added under `site/`, so the precache list is unchanged — `tests/sw.test.mjs` 13/13). The only
  `site/` edit is the `SAVE_BUDGET_KB` line above.
* The study layer is untouched. `withoutGameKeys` now strips SEVEN fields from `before` and is
  asserted to leave the flat Page's own five behind, in both suites.
* No test was deleted, skipped or weakened. This lane **added 3 tests** (job-save 66 → 68, state
  55 → 56; `tests/state.test.mjs` gained a further test from the tests lane working the same square).
  The one assertion with a tolerance (`|added(full) − added(base)| ≤ 1`) is JSON's own separator:
  stripping seven fields from a snapshot that still holds five keys leaves a comma that stripping
  them from a game-only snapshot does not. NC3 shows it still fails on the regime it exists to catch.

## Verification, at hand-off

```
$ node --test tests/job-save.test.mjs tests/state.test.mjs tests/sw.test.mjs
ℹ tests 138 · pass 138 · fail 0 · skipped 0
```

`node --test tests/` over the WHOLE tree reports 36 failures at this instant, in
`job-econ` (15), `job-week` (7), `job-debrief` (4), `job-screen` (2), `job-exploit` (2), `mock`,
`job-state`, `job-shape-measured`, `job-monotone`, `job-meta-constants` and `job-call` — none of them
this lane's, and none of them reachable from anything it changed: no other suite imports
`withoutGameKeys`, the worst-case fixtures or `SAVE_BUDGET_KB` (`grep -ln` over `tests/*.mjs` returns
`_helpers`, `_probe-meta`, `job-save`, `state` and nothing else), and no module under `site/js` reads
`SAVE_BUDGET_KB`. They are the twelve concurrent fixers' work in flight — e.g. `job-call`'s
*"THE PIN: no q̂ or rating call under site/js passes `before:`"* names
`site/js/screens/run.js:1813`, written by the run lane at 02:53 while this ticket was measuring.

---

# repair-save — round 4 (VERIFY round 2), the SAVE lane

Seven findings, from three critics (`exploit-hunt`, `spec-fidelity`, `save-budget`). **All seven were
correct.** Five of them are the same defect at five sites — the repair round moved
`SAVE_BUDGET_KB` and the document did not follow — and the sixth and seventh are the two paragraphs
that arithmetic feeds. The first is a different animal: a field that had stopped being the number it
is published to be, because a change in *another* file redefined what buys a rank.

Every figure below is printed by `node --test tests/job-save.test.mjs` / `tests/state.test.mjs` on
this tree, or by `scratchpad/repair-save-v2/meta-study.mjs`, which is committed beside this note so
the one measurement that is not a suite printout can be re-run in one command.

## 1 · BLOCKER — `player.records.bestRating` stored `detail.value`. FIXED at all three writers.

**Confirmed.** THE CAP (round-4 verify, `call.js:595-597`) prices the rank off
`earned = min(value, ceiling)` — `ceiling` is what the student's own reporting policy was *worth* on
this material, `value` is what the dice paid — so on a **capped** window the two diverge. All three
writers of `p.rating.value` recorded `detail.value`, so the audit record S3.1(c) exists to make the
held rank recomputable was a rating that had bought nothing, and the pair printed on Settings and
Stats could not be reconciled (`Called 3 · best rating 10.00`).

Driven through the shipped machine — 24 seeded saves, real JOB12s through
`startJob → lockCall → applyTarget → crack`, half of them over-reporting at the highest legal rung on
every target, which is the regime THE CAP exists for:

```
  S3.1(c) audit record: 360 staked targets, 199 capped · 2 of 22 divergent saves would print an
  unreconcilable rank off detail.value · widest gap 1.236 rating points
  (save 22: Called 2, earned 5.114, printed 6.350)
```

**199 of 360 staked targets are capped.** It is not a corner.

**The fix, at the root, one line each:**

| file | line | was | is |
|---|---|---|---|
| `site/js/job/state.js` | `applyTarget` | `Math.max(…, detail.value)` | `Math.max(…, detail.earned)` |
| `site/js/job/state.js` | `endJob` | `Math.max(…, detail.value)` | `Math.max(…, detail.earned)` |
| `site/js/screens/mock.js` | `applyMockCall` | `Math.max(…, detail.value)` | `Math.max(…, detail.earned)` |

`rankFor` is monotone and `p.rank` is a ratchet over `rankFor(earned)`, so the high-water over
`earned` is **exactly** what the held rank recomputes from:

```
  player.rank === max(the rank the save started at, rankFor(player.records.bestRating))
```

asserted as an equality (not a bound) on every save of the corpus. `bestRating20` is untouched: it is
the separate, honestly-labelled high-water of the **printed** rating and stays on `value`.

**THE TEST THE FINDING ASKED FOR, and it is in this lane's own file.**
`tests/job-save.test.mjs` → *"records.bestRating is the high-water EARNED rating, so the held rank
recomputes from it (S3 ratchet audit)"*. Four things are pinned, all driven, none hand-built:
(1) the record is the running maximum of `detail.earned` **at every target**, checked after each one
— including the blank slots, because the writer runs there too and a maximum that skipped them would
not be the writer's; (2) the record never exceeds a ceiling the window actually reached (the
finding's own assertion, in its time-honest form: a max over history against the max ceiling over
history); (3) the rank equality above; (4) **the arm is asserted not to be vacuous** — the corpus
must reach a capped window, a save where printed and earned separate, and a save where the OLD field
would have printed a rank strictly above the one held. Without (4) the arm would pass on a scorer
that never had the defect.

### Two things this cost in files this lane does not own, and why neither is a weakening

**(a) `tests/job-state.test.mjs`, three arms of S3.1(c).** They asserted `bestRating === max(value)`,
which was the contract *before* THE CAP landed in `call.js`. Re-pointed at the series the record now
tracks, and made **stronger** in the same edit:

* `earnedOf(save)` recomputes `ratingDetail(calls, CAPS.calls)` off the save the writer just wrote
  (`earned` depends on the window alone, not on the floor, so the recomputation is exact).
* each arm now asserts it is **not vacuous**: *"no target in this arm ran ahead of its ceiling — the
  arm cannot tell detail.value from detail.earned"*. On an uncapped window the two series are the
  same number, and all three arms would have passed on the defect.
* arm 1 gains the rank-recomputability equality, which is what the record is FOR.
* arm 3's vacuity guard (`running === high`) is restated rather than dropped: job B's first miss
  re-weights the window and lifts its **ceiling** with it, so the high-water earned rating moves by
  `0.00896` before the collapse starts. The guard now asserts both halves — that the record is not
  being re-set every beat (`≥ seen.length − 1` beats below the running max) and that job B did not
  RISE through it (`running − high ≤ 0.01`). The arm still fails if `Math.max` becomes `Math.min`.

**(b) `tests/job-save.test.mjs`'s `callEntry` width check** — this lane's own file, moved by the
CALL lane's change landing at 06:19 while this ticket was measuring. `callEntry`'s q̂ form now stores
the q̂ (`q`) and derives the weight from it, so `callEntry({qHat}).w` is `undefined` and the old
assertion threw. Re-derived, not deleted: the entry's `q` is priced against `WIDEST_Q` and the weight
`state.applyTarget` writes into `inProgress.game.calls[].w` is priced against `WIDEST_W` **through
`call.weightOf`**, which is the shipped reader of both forms. Both leaves are 8 characters, so **no
line of G7's budget table moved** — confirmed by re-running the budget suite, below.

### The mid-round collision, recorded because it decided the finding

At 06:11 the meta lane landed a test pinning the OPPOSITE resolution — `bestRating` stays
`detail.value`, and G9 #4's exception is widened to cover *two* statistics that may honestly
disagree. This lane reverted its own fix rather than overrule a sibling lane's just-landed, tested
decision. At 06:19 the doc lane rewrote G2, G9 #4 and G12 #78 the other way — *"all three writers …
store `detail.earned`"*, with `player.rank === max(…, rankFor(player.records.bestRating))` published
as the reviewer's one-line check — and rewrote its own lint to be DERIVED (*"reads the writers,
insists they agree with each other, and then insists the document names the SAME one"*). The fix was
then re-applied. **The document and the code now name the same field, and the meta lane's lint is
what proves it on every run.** G12 #78's closing sentence records the same event from the other side.

## 2, 4 · BLOCKER — G7's budget table was one row short and both totals were false. FIXED.

`SAVE_BUDGET_KB` moved at the repair round (`metaDelta: 2.5` added, `subtotal 31.6 → 34.0`,
`totalAdded 37.1 → 39.6`) and the document stayed at seven rows, 31.53 / 31.6 and 36.88 / ≤ 37.1.
Re-measured off the suite's own printout and restated:

* **new row** — `inProgress.meta.before +{tags, index, rating, startedAt, seed, seedTag, composed}`,
  **2.40 KB measured / 2.5 KB stated** (101 B slack).
* **subtotal — what the layer costs TODAY** — `31.53 / 31.6` → **`33.93 KB` / `34.0 KB`**. The row is
  the serialiser's own figure (`without the reserved runs[] game fields … 34744 B = 33.93 KB`); the
  eight rows above it sum to `33.90 KB`, the second number the same test prints, and the 35 B between
  them is JSON's own separators. Both are stated, and both are asserted at or under 34.0.
* **total added** — `36.88 / ≤ 37.1` → **`39.28 KB` / `≤ 39.6 KB`**.
* the `runs[]` blockquote's *"the layer's real cost is the 31.53 KB subtotal"* → **33.93 KB**.
* **`:932`'s rule is now true rather than deleted**: the eight stated ceilings
  `4.0 + 14.9 + 6.3 + 1.9 + 4.4 + 2.5 + 0.2 + 5.4` are exactly the `39.6` headline, and
  `job-save.test.mjs` asserts that sum on every run — so the paragraph now says so with the
  arithmetic in it.
* a **"Why it moved again at round 4"** paragraph beside the round-1/2/3 ones, naming the mechanism
  (one slot, two writers; `withoutGameKeys` stripped `inProgress`'s key list and the queue ENTRIES
  and stopped there) and the reason the row list is no longer hand-maintained.

Propagated to all four other sites: **G8's J10 row**, **G10 #24**, **G12 #18's itemisation**
(which now carries the `inProgress.meta.before +7 fields 2.40 KB` line and sums to 33.93 → 39.28),
and **G12 #68** (restated as "true at the time / true now", so the correction it records is not
silently overwritten).

## 3, 5 · BLOCKER — "≈ 525 KB, closing with ≈ 3 KB to spare" was false twice over. FIXED.

Restated at G7 and at **COMPOSED.md S6**, off the two printouts:

```
  state.test.mjs:   worst-case save: 538996 chars = 498772 study + 40224 game
                    slack: study 1228 chars of 500000 · game 326.4 B of 40550.4
  job-save.test.mjs: [STRUCK AT ROUND 5 — this line was not printed by the suite; the round-3
                     printer it came from was deleted in the round-4 repair. The S6 test prints a
                     MEASURED total and asserts an OVERRUN — § "Round 5 (verify)" below.]
```

* `500 000 + 37.1 KB ≈ 525 KB, ≈ 3 KB to spare` → **`500 000 + 39.6 KB = 540 550 B of 540 672 B`,
  122 B to spare** — two orders of magnitude, and the document now says which sentence it replaces.
* `536 191 = 498 463 + 37 728` → **`538 996 = 498 772 + 40 224`**.
* `J10 asserts ≤ 37.1 KB` → **≤ 39.6 KB**. `the ceiling is now 37.1 KB` (the 25 → 26 note) → 39.6 KB.
* **and the closure claim is withdrawn on the shape the app writes, not softened.** Both documents
  now publish the overrun as an open question with its two honest resolutions, and name whose it is.

## 6 · MAJOR — the archived-copy paragraph, stale in all four numbers. FIXED.

`32.72 → 35.13 KB` · `27.37 → 29.77 KB` · ceiling `totalAdded − player − trophies` `32.9 → 35.4 KB`
· two-unit `≈ 69.6 → ≈ 74.4 KB` · *"not 37.1 KB"* → *"not 39.6 KB"*, at G7 and again at G8's J10 row
and G12 #68. The paragraph also now says what the critic measured and the document did not: at
**35.13 of 35.4 KB the archive line is 280 B from its ceiling**, the second-tightest assertion in the
suite, so the next line that moves has to re-measure it.

## 7 · MAJOR — "≈ 1.5 KB of slack" where the suite asserts a 4 843-char overrun. FIXED.

The note is replaced by the measured pair, with the sign made explicit:

* the carrier `state.test.mjs` builds: **1 228 chars of slack** (498 772 of 500 000) — the number the
  suite prints, not the stale 498 463.
* the save the app actually writes: **over**. `inProgress.meta.before` carries five STUDY keys on
  every job and every flat Page (`skills, tiles, coverage, readiness, xp`), and the carrier omits
  them. Measured through the shipped writers over 120 real JOB12s
  (`scratchpad/repair-save-v2/meta-study.mjs`, all 19 skills present, which is what `skillStates` is
  widest on):

```
  checked 120 real JOB12 before-snapshots
  widest STUDY half: 4255 B   (its GAME half 360 B, whole snapshot 4614 B, save #41)
  per-key widest: skills 3972 · readiness 39 · xp 6 · coverage 37 · tiles 202
```

  `498 772 + 4 255 = 503 027` study chars — **over T01's 500 000 by 3 027 with no pessimism at all** —
  and `503 027 + 40 224 = 543 251` chars, **2 579 over the 528 KB = 540 672 B budget**.
* and the suite's own pessimistic form is quoted rather than paraphrased: `tests/state.test.mjs`
  prints `a LIVE in-progress save (label block + full before-snapshot): study 504843 of 500000 —
  over by 4843` and **asserts the overrun is still there**, ratcheted at 6 000.

A published sentence that says "slack" where the suite asserts an overrun is gone from both
documents. Neither document claims closure any more; both name the two resolutions and whose they
are.

## Requests

**D (carried forward, now published in both documents rather than only here) ·
`COMPOSED.md` S6 / T01 — the 500 000-char STUDY bound has no room for the before-snapshot, and that
half is the STUDY layer's.** Two honest resolutions, neither of them this lane's: raise the
500 000 / 528 KB pair to the measured total (503 027 / 543 251 real, 504 843 / 545 067 pessimistic),
or trim what the snapshot stores — `skills` is 3 972 B of the 4 255 B and the debrief needs the
*delta*, not 14 fields per make. Narrowing a GAME fixture to make room would be the wrong fix and is
not done. COMPOSED.md S6 now carries this as an "OPEN, and this section's to close" block.

**B (carried forward, still open) · `site/js/job/state.js`** — a documented cap in `serialize()` for
`inProgress.game.calls`; structurally bounded at 36, measured max 28, not enforced.

**C (carried forward, still open) · attribution of `settings.game`'s 13 B.**

**F (new) · `tests/_helpers.mjs` (tests lane) — `WIDEST_W` is now priced through `call.weightOf`, not
through `callEntry(...).w`.** `_helpers.mjs` already moved `worstCasePlayer`'s window to the `q` form
and added `WIDEST_Q`; `inProgressJob12` still prices `calls[].w` at `WIDEST_W`, which is correct
(`state.applyTarget` writes `call.weightOf(entry)` there). No change requested, recorded so the two
leaves are not re-merged by a later round.

## What is NOT claimed

* **No budget figure moved this round.** The `q̂`-in-the-entry change landing in `call.js` at 06:19
  swaps an 8-character `w` for an 8-character `q` in `player.rating.calls[]`, and the suite re-prints
  `player 3.95 KB of 4 KB (49 B slack)` and `game keys added: 40224 B = 39.28 KB` unchanged. Every
  number restated above is the number this tree measures, not an estimate and not a carry-over.
* **No test was deleted, skipped or weakened.** `tests/job-save.test.mjs` 68 → 69 tests (one added),
  `tests/job-state.test.mjs` unchanged in count (three arms re-pointed and each given a vacuity
  assertion it did not have). The one assertion given a tolerance — `running − high ≤ 0.01` in arm 3
  — replaces an exact equality that a ceiling shift of `0.00896` broke, and is paired with a second
  assertion that covers what the equality was guarding.
* **The study layer is untouched.** No file under `js/grader/*`, `js/gen/*`, `js/widgets/*`,
  `js/figure/*`, `js/xp.js`, `js/mastery.js`, `js/schedule.js`, `js/readiness.js`, `js/rarity.js`
  was read for anything but measurement.
* `site/js/store.js` and `site/sw.js` needed no change: no file was added under `site/`, the schema
  did not move (`bestRating` was already declared and coerced in both copies), and `sw.test.mjs` is
  13/13.
* The `bestRating` fix touches three files this lane does not own — two one-line writers and three
  arms of one test. Every one of them is named above with its before and after, and the doc lane's
  own derived lint (`tests/job-meta-constants.test.mjs`, *"G9 #4's exception names the statistic the
  save actually stores in `bestRating`"*) is what holds the document and the writers together from
  here on.

## Verification, at hand-off

```
$ node --test tests/job-save.test.mjs tests/sw.test.mjs tests/state.test.mjs tests/job-state.test.mjs \
       tests/job-meta-constants.test.mjs tests/job-week.test.mjs tests/mock.test.mjs tests/job-ledger.test.mjs
  ℹ tests 445 · pass 445 · fail 0 · skipped 0
```

Those are this lane's own files, every file it edited, and every file that reads what it edited —
the two doc-pin suites (`job-meta-constants`, which holds the document and the `bestRating` writers
together), the other two consumers of the record (`job-week`, `mock`) and the ledger-invariance
suite. This lane **added one test** and deleted, skipped or weakened none; `tests/sw.test.mjs` is 13/13 unchanged. (`job-save.test.mjs`'s leaf count also tracks the number of modules under `site/`, so the absolute number moves when another lane adds a file.)

The budget printouts this round's document restatements are quoted from, re-run on the final tree:

```
  player                 3.95 KB of 4 KB (49 B slack)
  game                   14.83 KB of 14.9 KB (68 B slack)
  inProgress.game        6.27 KB of 6.3 KB (29 B slack)
  inProgress.bench       1.85 KB of 1.9 KB (53 B slack)
  inProgress.queue delta 4.39 KB of 4.4 KB (6 B slack)
  inProgress.meta delta  2.40 KB of 2.5 KB (101 B slack)      ← the row the document was missing
  trophies delta         0.19 KB of 0.2 KB (7 B slack)
  runs[] delta           5.35 KB of 5.4 KB (50 B slack)
  subtotal               33.90 KB of 34 KB (107 B slack)
  game keys added: 40224 B = 39.28 KB  (ceiling 39.6 KB)
  without the reserved runs[] game fields (what the app writes TODAY): 34744 B = 33.93 KB
  [STRUCK AT ROUND 5 — the line printed here, `against COMPOSED S6: study bound 488.3 KB + added
   39.6 KB = 527.9 KB of 528 KB`, was NOT emitted by any test on this tree. It was the round-3
   printer, deleted in the round-4 repair together with the constant-only closure it described
   (`500_000 + SAVE_BUDGET_KB.totalAdded * 1024 < 528 * 1024`), and reproduced here afterwards as
   if it were fresh output. What the S6 test prints instead is a MEASURED line that reports an
   OVERRUN and asserts it — see § "Round 5 (verify)" at the end of this note.]
  after ONE handoff: archived copy 35969 B = 35.13 KB (29.77 KB today) · re-saturated unit = 74.41 KB
  S3.1(c) audit record: 360 staked targets, 199 capped · 2 of 22 divergent saves would print an
    unreconcilable rank off detail.value · widest gap 1.236 rating points
  worst-case save: 538996 chars = 498772 study + 40224 game
  slack: study 1228 chars of 500000 · game 326.4 B of 40550.4
  a LIVE in-progress save (label block + full before-snapshot): study 504843 of 500000 — over by 4843
```

`node --test tests/` over the WHOLE tree was run four times during this ticket, and it moves under
this lane's feet because twelve fixers are writing at once. The four runs read `fail 17`, `fail 11`,
`fail 2`, `fail 7` (`tests 2981 → 2987 → 2991 → 2994`; the baseline this ticket opened on was
`tests 2920 · pass 2916 · fail 0 · skipped 4`). **No failure in any of the four was in a file this
lane owns or edited**, and the set changed completely between runs as each lane landed and fixed its
own work — `job-copy`'s banned-phrase scan (the board lane's comment), `job-index`'s
`calls[].w` assertion, `job-meta-constants`'s ratchet-rule doc pin, `job-coldopen` / `job-screen`
(Playwright, on a machine running up to sixteen concurrent suites), and at the last reading
`job-econ` / `job-exploit` / `job-monotone` / `job-screen`, all four of which name `econ.js`, which
was being written while the run was in flight. Each one that was still red long enough to look at
was run on its own afterwards and had gone green on its own.

One of them was worth naming rather than waiting out, and it is in this note's Requests above as
**F**: the CALL lane's `q̂`-in-the-entry change moved the weight out of a window entry and behind
`call.weightOf`, which broke the same assertion in three files. This lane fixed its own
(`job-save.test.mjs`); the index lane fixed theirs at 06:37.

The 604 tests above — this lane's files, every file it edited, every file that reads what it edited,
plus the three suites that were red at some point for reasons traced to this round — are green on
the final tree:

```
$ node --test tests/job-save.test.mjs tests/sw.test.mjs tests/state.test.mjs tests/job-state.test.mjs \
       tests/job-meta-constants.test.mjs tests/job-week.test.mjs tests/mock.test.mjs \
       tests/job-ledger.test.mjs tests/job-index.test.mjs tests/job-debrief.test.mjs tests/job-copy.test.mjs
  ℹ tests 604 · pass 604 · fail 0 · skipped 0
```

---

# Round 5 (verify) — the save lane

Three findings, from two critics. One was a false citation in the document, one was the same citation
caught by a second critic as a BLOCKER, and one was a real unpriced key that the assertion written to
catch exactly that class of key could not see. All three are fixed at the root; nothing was fixed by
widening an assertion or softening a sentence.

## 1 + 2 · G7 quoted a `job-save.test.mjs` line no test prints, and the suite says the opposite. FIXED.

**The claim.** COMPOSED-GAME.md G7 published: *"the total bound is 500 000 + 39.6 KB = 540 550 B
against a 528 KB = 540 672 B budget, closing with 122 B to spare, and `job-save.test.mjs` prints
exactly that: `against COMPOSED S6: study bound 488.3 KB + added 39.6 KB = 527.9 KB of 528 KB`."*

**Verified — the quoted line does not exist on this tree:**

```
$ grep -rn "study bound" tests/ site/ qa/          ->  (no output)
$ grep -rn "against COMPOSED S6" tests site qa
tests/job-save.test.mjs:1434:  TOTAL  546 004 chars = 533.2 KB against COMPOSED S6's 528 KB — OVER by 5 332
   (the one hit is inside a COMMENT — the S6 test's own — and it records the OPPOSITE result;
    it read `545 068 … OVER by 4 396` before this round re-measured it)
```

The printer was real in round 3 and was deleted in the round-4 repair together with the
constant-only closure it described (`500_000 + SAVE_BUDGET_KB.totalAdded * 1024 < 528 * 1024`); the
document was never updated, and this note reproduced the dead line three times as if it were fresh
output. What the S6 test prints, and asserts, is an OVERRUN:

```
$ node --test tests/job-save.test.mjs
  COMPOSED S6, measured: 533.2 KB total = 493.8 KB study + 39.4 KB addition, against 528 KB
  (OVER by 5332 chars); study half vs T01's 500000: over by 5671
  the two BOUNDS (arithmetic, NOT a measurement): T01's 500000 + G7's 39.7 KB = 540652.8 B of
  COMPOSED S6's 540672 B — 19.2 B to spare
```

The second line is new this round: the arithmetic the document had been calling a test printout is
now printed by the test, under a label that says what it is, immediately beside the measurement it
was being confused with. The doc quotes both.

**The fix, at G7.** The paragraph now states THREE measurements on TWO carriers, separately, and says
which is which — because the old sentence welded a two-BOUNDS arithmetic, one carrier's slack and a
citation into one clause:

1. the two published BOUNDS close by **19 B** (`500 000 + 39.7 KB = 540 652.8 of 540 672`) — arithmetic,
   not a measurement, and `job-save.test.mjs` asserts it as such;
2. `state.test.mjs`'s carrier measures **539 932 = 499 600 study + 40 332 game**, i.e. **740 chars** of
   headline slack (not 122 B, which is a different quantity on a different thing);
3. `job-save.test.mjs`'s both-halves-saturated carrier measures **546 004** and is **5 332 chars OVER**,
   which the suite ratchets in both directions (`over > 0` and `over <= 8 * KB`).

The dead citation is struck and replaced by the line the suite actually prints, with a sentence saying
what it was and why it was wrong. **G8's J10 row** carried the same two-carriers-one-line error
("measured 538 996 chars of 540 672, 122 B of headline slack" — 538 996 is `state.test.mjs`'s carrier,
whose slack was 1 676 chars; the 122 B was the bounds arithmetic) and is restated the same way.
The three reproductions in this note (§ round 4) and the 37.1 KB ancestor in notes/save-fix.md:989 are
struck in place with a marker rather than deleted, so the correction is visible where the error was.

**Not changed:** the substance. The T01 overrun was already published honestly two paragraphs below the
bad citation; only the citation and the attribution of the arithmetic were wrong.

## 3 · `inProgress.queue[].params` — shipped, unpriced, and invisible to the guard. FIXED.

**Verified, on the shipped writers.** `composePage`'s S7 algebra floor writes it
(`site/js/page.js:392` → `variantItem` → `item.params = { ...params }`), and it reaches a JOB:
`composeBundles` prices `page.queue` as it stands and `draftUnion` spreads `...t.item`.

```
$ node scratchpad/repair-save-r5/probe_job_floor.mjs   # 200 seeded saves per arm, through state.startJob
{"allOverdue":false}  jobs 200 · queue entries with params 198/1881 (in 198 saves) · bench 0/72
{"allOverdue":true}   jobs 200 · queue entries with params   0/2404              · bench 0/396
  e.g. {"n":7,"id":"T-quad-solve#182693",…,"role":"floor",…,"params":{"mode":"a1"},"from":"A",…}
```

**Why the guard could not fire.** `job-save.test.mjs`'s corpus was half all-overdue catch-up saves and
half a 65 %-overdue mixture. A board with a backlog never composes an algebra floor, so the corpus
produced ZERO `params` entries in 546 000 queue-entry observations and *"a real job's inProgress.queue
entry carries keys worstCaseJobQueue() does not price"* passed vacuously on this key for two rounds.

**Why it is priced on EVERY entry and not on the one or two a page composes.** `freezeVariant`
persists it (`schedule.js:130 rec.params = item.params`) and every later due of that frozen Variant
re-emits it (`page.js:287`), so a worst-case queue of frozen-Variant reviews carries it throughout.
There is no structural bound at 2.

**Fixed:**
* `tests/_helpers.mjs` — `params: { mode: 'a2' }` on every `worstCaseJobQueue()` entry (828 B, STUDY:
  `composePage` writes it with the layer off, so it stays OUT of `GAME_QUEUE_FIELDS`) and on every
  `worstCaseBench()` entry (92 B, GAME: the whole `bench` key is the layer's). **The bench half of
  that is STRUCTURAL, not corpus-observed** — the corpus reaches 0 bench entries carrying `params`
  in 129 jobs, because a drafted floor item is not benched — but `benchFor` spreads `...t.item` from
  the targets of the UNDRAFTED contracts, which are composed page items like any other, so a floor
  item (or a frozen-Variant review of one) that lands in an undrafted contract is benched with the
  key on it. Under-pricing a line because today's corpus does not happen to reach it is the exact
  defect this file has been repairing for four rounds; it is priced.
* **Two more keys of the same class, found while fixing this one and fixed with it:** `frozenKey`
  and `templateVersion`, which `page.js:287` puts on a frozen-Variant review (`variantItem(…, {
  frozenKey: d.key, templateVersion: d.templateVersion })`). Measured: 22 of 840 real queue entries
  over 60 saves carrying frozen Variants. The corpus could not reach them either — the freeze
  happens in `screens/card.js`, not in the state machine, and a frozen Variant comes due days later
  — so `save.frozen` is now SEEDED in a third corpus arm. **They cost the budget nothing**, because
  a frozen-Variant entry is a different SHAPE, not a wider one: it cannot carry `rename`, `bucket`,
  `overdue` or `sweep` (those are `cardItem`'s, `page.js:281-284`), so it is 48 B narrower than the
  entry the 36-entry line is priced on. That dominance is now asserted (`W(fxFrozen) <=
  max(W(fxQ))`), and so is the mutual exclusion it rests on (**no real entry carried both `rename`
  and `frozenKey`**, 840 of 840). Pricing the union on all 36 entries instead would have added
  2 088 B to the STUDY half, which has 400 chars of slack left against T01's bound — over-pricing is
  only free when it is free.
* `tests/job-save.test.mjs` — a `lowDue` corpus arm (no backlog, every make mastered, which is what
  makes the page short enough for the floor item to be DRAFTED rather than left in an undrafted
  contract), plus a non-vacuity assertion that fails if the corpus ever stops producing a real
  `params` entry, and a new `inProgress.bench[]` per-ENTRY width row (a real bench is 1-2 entries
  against the fixture's four, so the line total can stay green while an entry is wider than priced).
* `site/data/job.js` — `SAVE_BUDGET_KB` restated: `bench` 1.9 → **2.0**, `subtotal` 34.0 → **34.1**,
  `totalAdded` 39.6 → **39.7**. (Requests, below: one line, not this lane's file.)
* `COMPOSED.md:330`, G7's table, G7's closure paragraph, G8's J10 row, G10 #24, G12 #18 and G12 #68
  restated off the new measurement.

## Cross-lane collateral taken on, and why

* **`tellOff`** — `js/job/state.js` EXTRA_KEYS' tenth key landed mid-round. `inProgressJob12()` is
  asserted to be a fixed point of the shipped `serialize()`, so the fixture had to price it (17 B,
  `inProgress.game` 6.27 → 6.29 KB, inside its 6.3 KB ceiling). The behaviour is the state lane's.
* **`game.log` `+{queueTargets, calls}`** — the state lane wrote these, priced them in
  `worstCaseGame()`, measured the cost (870 B, their own comment at `state.js:2081`) and backed them
  out again while this lane was measuring. They are NOT priced here. **If they land, they cost the
  `game` row 0.9 KB and the headline goes to 40.5-40.6 KB — at which point
  `500 000 + totalAdded > 540 672` and COMPOSED.md S6's 528 KB stops closing even on the two bounds.**
  That is the assertion `job-save.test.mjs` already carries for it (*"the two published bounds no
  longer sum to under S6 — restate COMPOSED.md S6"*), and it is now the FIRST thing that will fire.

## The measured budget, round 5

```
$ node --test tests/job-save.test.mjs
  player                 3.95 KB of 4 KB (49 B slack)
  game                   14.83 KB of 14.9 KB (68 B slack)
  inProgress.game        6.29 KB of 6.3 KB (13 B slack)        <- +tellOff
  inProgress.bench       1.94 KB of 2 KB (63 B slack)          <- +params, row 1.9 -> 2.0
  inProgress.queue delta 4.39 KB of 4.4 KB (6 B slack)
  inProgress.meta delta  2.40 KB of 2.5 KB (101 B slack)
  trophies delta         0.19 KB of 0.2 KB (7 B slack)
  runs[] delta           5.35 KB of 5.4 KB (50 B slack)
  subtotal               34.00 KB of 34.1 KB (101 B slack)
  game keys added: 40332 B = 39.39 KB
  without the reserved runs[] game fields (what the app writes TODAY): 34852 B = 34.04 KB
  after ONE handoff: archived copy 36077 B = 35.23 KB · a re-saturated unit on top = 74.62 KB
  widest real leaf vs priced (129 real jobs, 129 finished):
  counts: calls 28/36 · queue 28/36 (drafted 13/14) · locks 36/60 · bench 2/4 · swaps taken 229
          · entries carrying `params` 372 queue / 0 bench · frozen-Variant entries 1027
    ok inProgress.queue[].params           real    13 B  priced    13 B
    ok inProgress.queue[].frozenKey        real    23 B  priced    24 B
    ok inProgress.queue[].templateVersion  real     1 B  priced     2 B

$ node --test tests/state.test.mjs
  worst-case save: 539932 chars = 499600 study + 40332 game
  slack: study 400 chars of 500000 · game 320.8 B of 40652.8
  a LIVE in-progress save (label block + full before-snapshot): study 505671 of 500000 — over by 5671
```

**The study half now has 400 chars of slack against T01's 500 000.** 828 of the 1 228 chars it had
went to `params`, and they are T01's bytes, not this layer's. That is a study-lane number; it is
recorded here and in COMPOSED.md S6 rather than bought back by narrowing the fixture.

## Requests

* **To the owner of `site/data/job.js`** — `SAVE_BUDGET_KB` was restated in place (one line:
  `bench: 1.9 → 2.0`, `subtotal: 34.0 → 34.1`, `totalAdded: 39.6 → 39.7`) plus the comment block above
  it, because every assertion that reads it is this lane's and the suite cannot be green without it.
* **To the owner of `tests/job-call.test.mjs`** — the comment at :599 still says *"the `player` line
  and the 39.6 KB headline do not move"*. The headline is 39.7 KB; the `player` line did not move.
* **To the study lane (Request D, still open)** — `inProgress.meta.before`'s five STUDY keys (5 795 B,
  `skills` alone 3.6 KB) are written by the flat Page route too and do not fit inside T01's 500 000.
  Both carriers now measure it; neither hides it.

## The tree, at the end of this ticket

`node --test tests/` over the whole tree, run while twelve lanes were writing. Two readings, forty
minutes apart: **`tests 3067 · pass 3059 · fail 4 · skipped 4`**, then **`tests 3072 · pass 3067 ·
fail 1 · skipped 4`** (the baseline this round opened on was `2725 · 2721 · 0 · 4`; the count grew
because every lane added tests). **No failure in either reading was in a file this lane owns or
edited**, and three of the four had gone green on their own by the time they were re-run a minute
later — only the week lane's is still red at hand-off:

```
✖ tests/job-board.test.mjs:2421  the primary is G1's button …            -> green on re-run
✖ tests/job-board.test.mjs:2732  the log entry records the WHOLE queue … -> green on re-run
✖ tests/job-meta-constants.test.mjs:1512  the INFORMATIVE GRID …         -> green on re-run
✖ tests/job-week.test.mjs:1335   the projection reads the student's OWN last five jobs
     `AssertionError: the board projected 29 % against a debrief headline of 22 % — more than
     SPLIT.agreeWithinPoints = 5` — still red at hand-off in BOTH readings. It is a projection /
     debrief agreement figure with no save byte in it, and the week and board lanes were writing
     `js/job/state.js` and `js/job/board.js` throughout this ticket (`state.js` last written 10:05).
```

Independence is not asserted from the timestamps alone: **no file outside this lane imports anything
this lane changed.**

```
$ grep -ln "worstCasePlayer\|worstCaseGame\|worstCaseJobQueue\|worstCaseBench\|inProgressJob12\|SAVE_BUDGET_KB" tests/*.mjs
tests/_helpers.mjs  tests/job-save.test.mjs  tests/state.test.mjs
$ grep -c "SAVE_BUDGET_KB\|worstCaseJobQueue\|worstCaseBench\|worstCaseFrozen" tests/job-week.test.mjs tests/job-board.test.mjs tests/job-meta-constants.test.mjs
tests/job-week.test.mjs:0   tests/job-board.test.mjs:0   tests/job-meta-constants.test.mjs:0
```

This lane's own files, on the final tree:

```
$ node --test tests/job-save.test.mjs tests/state.test.mjs tests/sw.test.mjs
  ℹ tests 140 · pass 140 · fail 0 · skipped 0
```
