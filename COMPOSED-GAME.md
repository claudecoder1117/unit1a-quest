# THE JOB — the game layer for The Packet (AUTHORITY for the game build)

*Rev 2026-09-17c — every FATAL and MAJOR from `designs/murderboard-game.md` fixed in place. See G12.*

One game. Name: **THE JOB**. Frame: the packet is a building you are working through; a Card is a **lock**, its tier is the lock's **grade**, its skill is the lock's **make**, its Leitner bucket is how **cold** it is, a misconception tag is its **tell**, Today's Page is tonight's **board**, a Boss is a **vault job**, the Mock is **the big score**. `COMPOSED.md` (product) and `BUILD-POLICY.md` (engineering) still rule; where this file and COMPOSED disagree about *presentation*, this file wins; where they disagree about *truth* — grading, mastery, Leitner, Readiness, publication, quiet hours — COMPOSED and BUILD-POLICY win. **Every place the two files touch is enumerated in G10, with the winner named on each line. If a conflict is not in G10, COMPOSED wins by default and the G10 list is a bug.**

Composition: G1 heist · G2 defense · G3 heist · G4 defense · G5 heist · G6 heist · G7 defense, with every judge-recommended graft applied, every fatal flaw deleted, and every contradiction resolved in G10. It is one game, not a collage: **one fiction** (the building), **one economy** (no currency at all — see G2), **one adversary** (the House, which is a bar chart of your own habits), **one proper scoring rule** (the Call), **one push-your-luck decision** (BAG/PUSH), **one collection** beyond the existing Binder (the Fault Index), **two save keys** (`save.player`, `save.game` — see G7; the split exists only because the unit handoff needs it).

**Prime directive.** The study layer is untouched. `js/grader/*`, `js/gen/*` (existing files), `js/widgets/*`, `js/figure/*`, `js/xp.js`, `js/mastery.js`, `js/schedule.js`, `js/readiness.js`, `js/rarity.js` keep the exact rules in COMPOSED. The game **reads** that state and prices it; it writes only `save.player` and `save.game`. `settings.game = false` turns the whole layer off in one tap and the app is byte-for-byte the study tool it is today.

**Nouns the fiction adds — fourteen, all one word, all printed beside a number:** Board · Contract · Target · Envelope · Call · Loose · Bagged · Chain · Wing · Guard · Tell · Crew · Vault · Ledger. Readiness stays Readiness, Binder stays Binder, Card stays Card, Today's Page stays Today's Page. No crew members with names, no backstory, no dialogue, no cutscene, no mascot.

**Global laws of the layer (override anything below that seems to say otherwise):**
1. **Answers tick; time does not.** No payoff term in the layer reads elapsed time. The board moves only when you act. (incremental · defense)
2. **The Law of Two Ledgers.** Ledger A (XP, mastery, Leitner, rarity/Foil, errors, counters, trophies, Readiness) is written by the existing modules at grade time, is monotone, and is never staked, never lost, never multiplied by a game decision. Ledger B (Loose, Bagged, Chain, Rating, Rank, Crew, sealed tags) is the game. A bust costs Ledger B and nothing else. (pushluck)
3. **Luck moves stakes and which legal item is drawn; never how an answer is graded.** Every random object multiplies both branches identically, and every one of the four of them prints its real distribution before the decision it affects (G3.6). The bundle partition *does* change which legal item you face next — that is stated here rather than denied.
4. **The board is a projection of the save.** Nothing the board posts is a second source of truth; every number on it is derived from `save.cards`, `save.skills`, `schedule.js` and `plan.js` and can be recomputed. (conquest · season)
5. **No item is ever removed from the schedule by a game decision.** The job consumes `composePage`'s queue through the same `markItem`/`requeueReview`/`finishPage` calls. Targets a job does not reach stay due and lead the next board.
6. **Evidence before the decision; recommendation after it.** Every probability, distribution and price is printed before the choice it affects. No pre-choice surface ever names the argmax action — that would be scoring the student's obedience instead of their self-knowledge. The EV-max rung lives in Settings as a static formula and in the debrief's regret line, never on an envelope.

---

## G1 Core game loop and session shape

**What a job IS.** One job = one Today's Page queue, repackaged as 3 drafted contracts of 3–4 targets each, answered under stakes, with one final all-in. Nothing is added to the answering work. What is added is a decision before every target, a decision after every target, three allocations at the top, and two brief windows in the middle.

**The verbs — seven, each one key, each one an actual decision.**

| verb | key | when | what it decides |
|---|---|---|---|
| DRAFT | 1–5 | board | which 3 of 5 posted contracts you take |
| PRESS | ←/→ | board | 3 pressure tokens across the drafted wings (sealed) |
| COMMIT | C | board | optional: a **binding** walk-away minute or a "done by 21:45" |
| CALL | 1–4 | per target, **before the stem** | your confidence, which sets both payout and penalty |
| ANSWER | (existing) | per target | the mathematics, graded by the existing engine |
| BAG / PUSH | B / Enter | per target, after the payout line | bank the loose pile (fee 10 %, **chain → 0**) or keep the chain |
| CRACK / WALK | K / W | getaway | all-in on the vault, or leave with the bag |

**The two piles.** **LOOSE** (at risk, labelled "not yours until you bag it") and **BAGGED** (safe for the rest of the job). Losses come only out of LOOSE and LOOSE floors at 0. There is no state in which the game can take something you already earned — not XP, not a tile, not mastery, not a bucket.

**The sealed envelope — why the call comes first.** A target is presented face-down as an *envelope* printing only **make** (skill id **and** its student-facing name), **grade** (tier 1–4), **cold** (`schedule.overdueDays`), **posted** (its loot), its **source contract**, the **×2** mark if the day's seed put one there, and — if you have one live on this make — its **tell**. The stem is not shown until the call is locked. This is load-bearing: you are bidding on *your accuracy at this make of lock*, not on a problem you have already solved in your head. It is what makes the scoring rule non-farmable (G3.7 proof 5) and it takes four seconds.

The envelope's advisor line prints **evidence only**, never the recommended rung (Global law 6):

```
FAC2 · Factoring a > 1 · grade 2 · cold 3 d · posted 41 · from B · tell: dropped-gcf
your last 10 on FAC2: 7/10
CALL:  [50] [70] [85] [95]
```

**Answering → game action (the ladder).** The binary clear/miss is replaced by the existing attempt timeline, priced. `ρ` is the payout rung; nothing random touches it.

| your result on the target | rung | ρ | chain | Ledger A (unchanged) |
|---|---|---|---|---|
| clean (first try, 0 hints) | 0 | **1.00** | +1 | `s = 100`, bucket +1, Gold |
| first try, 1 hint (Gold-with-H1) | 1 | 0.70 | holds | `s = 70`, bucket unchanged |
| cleared on attempt 2 | 2 | 0.45 | resets | `s = 40`, bucket −2 |
| cleared on attempt 3 | 3 | 0.20 | resets | `s = 40`, bucket −2 |
| third wrong, or solution shown | 4 | — **miss** | resets | `s = 0`, bucket −2, Rematch queued |
| `almost` / `malformed` | — | free | untouched | free (Global law 2) |

`LADDER = [1.00, 0.70, 0.45, 0.20, 0]`, indexed by rung.

**Crew rank on that make forgives rungs** — that is what a crew *is* here: scaffolding, expressed as a number (G2). `ρ_eff = LADDER[max(0, rung − rank)]`. **This is the whole hint economy: hints stay free and infinite everywhere (Global law 1 — gates gate loot, not learning), and what a hint costs is 30 % of the payout.**

**The tick law.** One target answered = one tick. There is no clock on thinking (COMPOSED Global rule 3 survives untouched) and no reward for hurrying: the board only moves when *you* act.

**Minute to minute.** Envelope → CALL → stem + figure + Scratch + Answer Dock (unchanged `card.js` body) → grade (unchanged) → payout line → BAG/PUSH → next envelope. The bag/push prompt occupies the slot COMPOSED already spends on tap-to-continue, so it is *free time, not added time*. Two **brief** windows open after targets 4 and 8. The last target is the **vault**; before it, the **getaway**.

### The split, measured against the engine's own time model — two honest columns

Answer seconds are `page.js LIMITS.minutesPerTier = {1: 0.5, 2: 1.5, 3: 3, 4: 5}` — the same numbers Home already prints under RUN NEXT, not friendlier ones invented for this document. Game seconds are the decision times below, scaled by tier because 18 s of decisions wrapped around a 30 s recall card is a tax: on tier 1 the call row is the continue row and is default-focused (5 s call + 9 s payout/bag-push = **14 s**); on tier 2–4 the payout line carries the tell, the chain arithmetic and the crew note and the bag/push is a five-variable decision (**24 / 30 / 36 s**).

Fixed phases are published twice, because a student who takes every optional window and a student who taps the primary button and skips are two different sessions and the old single column was the first one pretending to be both:

A Backcheck spend is a decision but not a phase: it happens on the payout line, inside the per-target seconds already counted, so it appears in the decision table below and not here.

| fixed phase | **default path** (primary button, `Enter` through the windows) | **full-use path** |
|---|---|---|
| board read + draft | 18 | 55 |
| guard reveal + token press | 12 (4 s to accept the equilibrium mix; 12 s is the observed mean when you re-press) | 12 |
| brief windows ×2 | 40 | 100 |
| getaway | 25 | 25 |
| debrief | 65 | 65 |
| crew re-allocation | 0 (skipped) | 25 |
| **JOB total** | **160 s** | **282 s** |
| **RUN total** (one brief, lighter board: 12 · 12 · 20 · 20 · 40) | **104 s** | **130 s** |

**The BUDGET table.** Every cell below is a function of the shape's nominal `tierMix`. `targets` is binding — `composeBundles` serves exactly that many locks — but the *mix* is not: the composer prices whatever tonight's page had due. What a job actually costs is the measured table after it, and the two do not agree.

| shape | targets | nominal tier mix | answer s | per-target decision s | game s (default → full) | wall clock (default → full) | **split** (default → full) | when Home offers it |
|---|---|---|---|---|---|---|---|---|
| RUN | 6 | 6×T1 | 180 | 84 | 188 → 214 | 6:08 → 6:34 | **51.1 % → 54.3 %** | school window, or "I have 7 minutes" |
| **JOB** (default) | **10** | **8×T1 + 2×T2** | **420** | **160** | **320 → 442** | **12:20 → 14:22** | **43.2 % → 51.3 %** | evening default |
| JOB (plan-sized) | 12 | 7×T1 + 4×T2 + 1×T3 | 750 | 224 | 384 → 506 | 18:54 → 20:56 | 33.9 % → 40.3 % | when `plan.qFor` says 12 and you take it in one sitting |
| VAULT | **7** | 3×T1 + 2×T2 + 1×T3 + 1×T4 | 750 | 156 | 296 → 388 | 17:26 → 18:58 | 28.3 % → 34.1 % | when `page.bossReady(save)` fires |

Every row reproduces: `game s = fixed + per-target`, `wall clock = answer s + game s`, `split = game s / wall clock`. `job-split.test.mjs` recomputes the whole table from `data/job.js`'s constants rather than reading these numerals, so a constant that moves moves the table.

### What the board actually posts (measured, round 3)

The budget table above was published as if it described the session. It does not. Over the 50 seeded saves `tests/job-board.test.mjs` builds, taking each board's own one-tap recommendation at clock 19:30 and costing its **real drafted tiers** through the same `ANSWER_MINUTES_PER_TIER` / `DECISION_SECONDS` / `FIXED_PHASES` arithmetic, 45 boards post a JOB and 5 post a VAULT:

| shape | n | drafted tier mix (mean) | wall clock min / **median** / max | split (table basis) | **split as the app prints it** |
|---|---|---|---|---|---|
| **JOB** | 45 | T1 4.09 · T2 5.44 · T3 0.31 · T4 0.18 | 14:14 / **17:26** / 27:54 | 24.7 / **34.0** / 40.3 % | 22 / **30** / 35 % |
| VAULT | 5 | T1 3.00 · T2 3.40 · T3 0.20 · T4 0.40 | 10:58 / **12:08** / 18:36 | 27.4 / **38.2** / 40.7 % | 23 / **32** / 34 % |

**The budget row brackets 1 of those 45 boards on wall clock and 0 of 45 on split.** A JOB is not 12:20–14:22 at 43–51 % game; it is about seventeen and a half minutes at about 30 % game, because the composer drafts a T2-heavy queue and the budget assumed 8×T1 + 2×T2. Both tables are now published — `PUBLISHED.shapeTable` (budget) and `PUBLISHED.shapeTableDrafted` (measured) — and `tests/job-shape-measured.test.mjs` re-measures the second one from `postBoard` on every run, asserts the published band brackets the product's median field by field, and asserts the budget row does **not**, so the two cannot quietly merge back into one claim. The suite could not see any of this before, because `job-split.test.mjs`'s walkthrough rewrites each drafted target's tier to `SHAPES[id].tierMix` (`canon`) before it measures — a fixture that makes the walk reproduce the fixed-phase table, and therefore a fixture that cannot contradict it.

**The budget row is also on screen, and that part is still open.** Home's pass-1 board (`screens/home.js boardModel`) prints `minutes` and `split` straight off `PUBLISHED.shapeTable` when the student has no ledger, so a fresh player is shown **"JOB · ~13 min · 43 % game"** and then, one tick later when the composer resolves, the real board replaces it with **"~17 min · 31 % game"**. The measured rows and `nominalHeadlineSplit` were put in `data/job.js` (which imports nothing, so Home's static-graph rule survives) precisely so that is a data swap; the swap itself is a Request in `notes/econ-fix.md`, not a change this lane may make.

**Three different percentages, and which is which.** The budget table's `split` column puts the debrief read **inside** `game s`. The board's projection and the debrief's headline put it in **neither** term, because the debrief cannot measure the time you spend reading the debrief (statement 2 below). That is 5–6 points on every shape, before any tier-mix question: nominally **RUN 45.1 → 49.2 · JOB 37.8 → 47.3 · JOB-12 29.8 → 37.0 · VAULT 23.5 → 30.1** (`PUBLISHED.nominalHeadlineSplit`). So the brochure's 43.2 % and the screen's 30 % differ for two independent reasons — the basis and the mix — and both are now numbers in `data/job.js` rather than a discrepancy a player finds.

**A brief window is charged only where it can open.** The windows land after targets 4 and 8, and the target where one is left goes to the getaway, so a shape serves `|{n ∈ [4, 8] : n < targets}|` of them. Every shape gets its full count except the **VAULT**, which is 7 targets and therefore serves **one** — its `brief` cell is charged once (140 s / 232 s, not 160 / 282) and its mandatory decision count is **17, not 18**. The row above used to charge both windows, which put a decision in the published column that a completed VAULT does not contain: the debrief prints the measured count beside the published one, so a student who took every decision a VAULT has read `17 … 18 mandatory` and saw a beat they had skipped. `board.js projectFor` always clamped this way; `econ.landedBriefs()` is now the one place that owns the clamp and `fixedSeconds` / `decisionCount` are charged from it. (Round 2, split-honesty.)

Every shape's BUDGET row sits inside COMPOSED S1's 10–25 minute session at both ends of the range. (The VAULT was 8 targets and 25:24; it is 7 targets and ≤ 18:58. See G12 #40e.) **On the measured rows that is true of the median and of 49 of the 50 corpus boards, and false of one: a T2-heavy 11-target JOB comes to 27:54.** The composer, not the table, decides that — `composeBundles` takes `budget.targets` locks of whatever is due and the shape has no tier ceiling — so the honest statement is *the session lands inside the band on the median board and can run four minutes past it on the worst one*, and closing the tail is a supply change (a tier ceiling in the draft, or `plan.qFor` spending minutes rather than items). Filed in `notes/econ-fix.md`; `job-shape-measured.test.mjs` pins the exceedance count at 1/45 so it cannot grow unnoticed.

**Three honest statements the app makes and this document will not walk back:**

1. **The split is a function of tier mix *and* of how much of the optional decision surface you use, and the board prints your own number, not the brochure's.** `save.game.ledger` keeps a rolling mean of the student's own phase durations over the last 5 jobs; the board's per-shape projection is computed from *that*, and prints which it is: `~48 % game · your last 5 jobs` or, on job 1, `~51 % game · projected`. A recall run is more than half game; a tier-4-heavy job is honestly a third game and says so. **I will not manufacture the missing minutes out of animation, waiting or cutscene.** The plan's default `q = 12` is served as the JOB-10 shape plus a 2-target tail offered as a calm 3-minute page (`2 left on Today's Page`), *or* as one 12-target job at a printed 34–40 % — the student picks, having been told.
2. **Both numbers are measured, not claimed.** The job screen keeps two wall-clock accumulators (`tGame`, `tAnswer`, switched on phase change, the same `Date.now()` arithmetic as every other timer in COMPOSED S6) and the debrief prints `7:00 thinking · 5:29 deciding`. `tests/job-split.test.mjs` asserts the criterion that actually matters — **the split the board printed before the job matches the split the debrief HEADLINES, within 5 points, on every shape, on both the default and the full-use walkthrough, on a shape the student's ledger has never seen, and — round 2 — on a clock that is nobody's published table, in both directions of error; and — round 3, in `tests/job-board.test.mjs`, which owns the board — on a student whose last five jobs are mid-job WALKs, up to five of five, on every shape**. The two are now the same quantity: the debrief cannot measure the time you spend reading the debrief, so its headline is `tGame / (tGame + tAnswer)` with that read in neither term, and the board projects exactly that (it still *spends* the read in `ends HH:MM`, because you do sit through it). Round-1 correction, twice over: the board used to print the session basis — the one the debrief shows in its *sub*-line — and sat up to 9.3 points from the headline the eye lands on; and with any log at all it returned a raw `Σ tGame / Σ (tGame + tAnswer)` over the last five entries, shape-blind, so five VAULT jobs behind a JOB12 night printed 48 % against a debrief that headlined 35.2 %, and three zero-target *walks* printed `~100 % game · your last 3 jobs`. The projection is now per-draft — this draft's tiers, this draft's brief windows, the student's own rolling phase means — and a walk is not one of "your last N jobs". **The one number the criterion does not cover, and this document publishes rather than hides: on JOB 1, with no history at all, the projection spends the shipped default-path means, so a student who then uses every optional window is projected up to 7 points low** (measured 6.9, JOB/full; the default path measures 1.1). That is exactly what the word `projected` on the line concedes, and the very first job on record closes it. There is no constant-ratio assertion anywhere in the suite, because there is no constant ratio.

**Round-2 correction, and the thing this statement was quietly not doing.** Until round 2 the agreement above was arithmetic, not a measurement: every walkthrough advanced its clock by exactly `ANSWER_MINUTES_PER_TIER` and `DECISION_SECONDS`, and `projectFor` summed those same two tables, so both sides were the same table twice. Only the five fixed phases were ever the student's. Driven over the job screen's own call sequence with a clock that is nobody's table, the board's `~N % game · your last N jobs` missed the debrief's own headline by **17.5–18.6 points** for a slow answerer and by **33.8–35.4 points the other way** for a fast answerer who deliberates, and no amount of history closed it, because no term in it could move: 86 % of the projection's inputs were constants on a line whose label says they came from the student. Two things now close it, both in `js/job/board.js`. (a) **The two per-target terms are the tables scaled by the student's own measured rate against them** (`personalRates`): `save.game.log` keeps each job's `tGame`, `tAnswer`, `targets`, `shape` and `posted`, so the rate is `Σ measured / Σ expected` over the last five real jobs, each job's expectation built from tonight's own draft on the log's own posted basis, and each job's ratio dropped from both sums if it is outside `[1/6, 6]` (a phone left on the answer screen is not a pace). (b) **The rolling phase means are re-expressed in tonight's shape's own published `FIXED_PHASES` column** (`meansForShape`): a RUN's board read is published at 12 s against a JOB's 18 and its debrief at 40 against 65, and spending a JOB-shaped blend on a RUN night was worth 3.4 points on its own before anything else. Measured after both: every shape, both paths, same-shape history ≤ 1.8 points and a ledger of every other shape ≤ 4.2; and for the two clocks that bracket the error — a slow answerer and a deliberator whom the debrief separates by more than 30 points — the board separates them too, within 5 points of the headline in every cell.

**Round-3 correction: a job you walk out of is measured on what you ANSWERED, not on what you drafted.** `endJob` records `targets: answered(s)` beside `posted: g.posted`, and `g.posted` is the whole drafted queue's value, set once at `startJob` and never reduced when the student taps WALK at target 3 of 10 — which G1 documents, prices and wires to the screen. Round 2 closed the zero-target half of this (a walk that answered nothing is not one of "your last N jobs"); the partial half stayed open, and `personalRates` went on rating three targets of measured seconds against ten targets of expectation. A table-pace student whose debrief headlines 27.1 % had a board printing **31 % after two mid-job walks, 37 % after three and 69 % after five** — off a failure state the design names. Two terms in `board.js` close it, both from what the log already holds: each past job's expectation is taken over the **answered prefix of the 1→4 ramp** (half a JOB12's targets is a quarter of its answer seconds, because the ramp puts the cheap locks first — and the two tables disagree about how much cheaper, so the answer term and the decision term get their own fraction), and the getaway second is subtracted from `tGame` **only for a job that reached the getaway**. Measured after: the same cells read 27 / 27 / 27 / 25, and the criterion now holds **on every shape with a history of up to five mid-job walks out of five**, driven through `startJob → lockCall → applyTarget → push → walk` on a clock that is nobody's table (worst gap 2.1 points; 16 shape × save cells, worst 1.7). The estimate is an estimate: the log does not record which targets were answered, so the prefix is taken against tonight's own drafted ramp. `endJob` recording the answered value directly — as `postedAnswered` — would make it exact, and `board.js` already prefers that field wherever it appears.
3. **The claim this document defends is the range, the density and the measurement — not a number.** The recommended evening shape measures **43 % game on the tap-through path and 51 % if you use the windows**, the RUN measures over half either way, and every shape prints its own projection before you take it.

**The reframe that settles the brief.** Measured in *actions* rather than seconds, a JOB-10 is **24 mandatory decisions against 10 graded items — 2.4 per item — and 35 if you use every optional window (3.5 per item), with 0 s of waiting anywhere in the run.** The honest count, printed in the debrief and checkable:

| decision | count (mandatory) | count (full use) |
|---|---|---|
| DRAFT (one 3-of-5 choice) | 1 | 1 |
| PRESS (one 3-token allocation) | 1 | 1 |
| CALL | 10 | 10 |
| BAG / PUSH (9 beats; the vault target ends in the getaway, not a bag/push) | 9 | 9 |
| brief windows (skip, or up to 5 options each) | 2 | 10 |
| getaway CRACK/WALK | 1 | 1 |
| COMMIT | 0 | 1 |
| Backcheck spends | 0 | 2 |
| **total** | **24** | **35** |

Decision density is the mix-invariant version of the split claim and the debrief prints both, with this table reachable from it.

**What a brief window is (50 s at full use, five real options, no padding).** Re-press one token with the guard distribution redrawn · swap one undrafted contract in at its declined price (+0.15, see below) · re-rank one crew slot for the rest of the job (free, always) · take or decline the next target's tell · declare a walk-away minute. Any subset, `Enter` to skip.

**Declines are priced** (incremental). The two contracts you refuse at the board return to the brief window at **+0.15 posted** each. Drafting 3 of 5 is mandatory — no reroll, no skip — so a decline is a trade, not a free spin.

**What a contract is, exactly.** A contract is a **bundle of locks labelled by its dominant make**, not a skill-pure block. `composeBundles` partitions `composePage`'s queue into 5 bundles for *pricing and selection*, replicating every critical item into ≥ 3 of the 5 (G3.7 proof 7). A bundle's label is the make that supplies most of its locks, printed with the overflow: `A · VOC +2`. **Round 2: the five names are chosen together, as a matching, not one contract at a time.** A save whose whole due list is one sheet — 36 ASN-ANG dues, and the RECALL wing owns 5 of the 19 makes including both 35-card ASN sheets and the 37-card VOC sheet, so this is ordinary — gave every contract the same strict top-count make and printed `A ASN-ANG +2 · B ASN-ANG +3 · C ASN-ANG +3 · D ASN-ANG +2 · E ASN-ANG +2`: five rows a student reads as one row, in front of a DRAFT this document counts among the 24 mandatory decisions. The locks underneath differed and spanned three wings; the names did not, and the name is the only part of a contract that reaches the eye before the tap. So `page.js assignLabels` runs a maximum bipartite matching over (contract → the makes it actually holds), each contract preferring its most-supplied make, and `overflow` counts from the make the contract is **named** after — `B · VOC +5` reads "the VOC one, plus five other locks", exactly as `A · VOC +2` reads. The board carries as many distinct names as the posted locks can support; a contract the matching cannot name uniquely keeps its own top make. `tests/job-board.test.mjs` asserts the count of distinct names is the maximum the matching allows, on all 400 corpus boards. Because bundles overlap, **the board prints each contract's posted value gross and the drafted union's value net**: `posted 105 (−5 shared)`. And because drafting a set of contracts must not put four consecutive VOC cards on screen:

> **Draft, then interleave.** Once the 3 contracts are drafted, their **deduplicated union** is run back through the composer's own `spreadSkills` and tier ramp before the first envelope. Contracts survive as the *source label* on each envelope (`from B · VOC`), never as consecutive blocks. `LIMITS.sameSkillRun = 2` holds inside a job **absolutely**, and the 1→4 tier ramp holds wherever an order under that cap admits one; J5 asserts both on the drafted queue, over **every shape × 400 seeded saves × every legal draft (15 984 drafts)**.
>
> **Round 3 — the cap is a rule about what the board may POST, not only about how the queue is ordered, and the flat Page keeps it a different way.** The Page keeps `sameSkillRun` by **dropping** the overflow; a job may not drop (Global rule 5), so a job has to not compose the overflow in the first place. Five locks of one make in a six-target RUN admit **no** order under the cap — `m ≤ k·(targets − m + 1)` is the arrangement's own existence condition — and the school window's RUN is six targets. Measured before the rule: one break in 15 984 drafts, `VOC VOC PAIRS VOC VOC VOC` on corpus save 69, with the arranger blameless and `spreadSkills`' drop correctly refused. `page.js runCapFor(targets)` is now the posting rule — at most 4 of a RUN-6, 5 of a VAULT-7, 7 of a JOB-10, 8 of a JOB12 — enforced when the board picks its choice locks, and the claim above is what the suite measures rather than what the flat Page happens to do. It moved exactly one board of 1 600.

**The first 90 seconds (fresh Monday, D−6, 6 reviews due).**

```
0:00  Home. Readiness ring 63. Under it, the BOARD (drawn from the save, no spinner):
        TONIGHT'S BOARD                  guard: no data — uniform 1/3 (job 1)
        A  VOC    · 4 cold locks · grade 1   posted  30   ~2.0 min   RECALL
        B  NOTE   · 4 cold locks · grade 1   posted  28   ~2.0 min   RECALL
        C  FAC2   · 2 locks      · grade 2   posted  45   ~3.0 min   ALGEBRA
        D  CS-LIN · 4 locks      · grade 1–2 posted  49   ~4.0 min   WORDS   ×2 on one target
        E  PAIRS  · 4 cold locks · grade 1   posted  26   ~2.0 min   FIGURES
        [ TAKE THE POSTED JOB · A D E · 10 targets · posted 100 (−5 shared) · ~14 min · ends 20:31 · 48 % game ]
        [ draft it yourself ]
0:06  One tap on the primary button. Tokens pre-pressed at the equilibrium mix, Enter to accept.
0:10  GUARD: WORDS.  Your tokens: RECALL 2 (×1.50) · WORDS 1 (guarded, ×0.55) · FIGURES 0.
0:15  Envelope 1 of 10.  VOC · Vocabulary · grade 1 · cold 3 d · posted 11 · from A
        your last 10 on VOC: 9/10
        CALL:  [50] [70] [85] [95]
0:18  Key 4. The envelope flips (180 ms). The stem is the real not-04, verbatim.
0:40  Answer. Clean. +24 loose · chain 1 · rating +9.9 ×0.36
0:43  [B] bag 24 (fee 2 · chain 1 → 0)   [Enter] push
0:45  Push. Envelope 2 of 10.
```

The drafted union: A's 4 T1 + E's 4 T1 + D's 4 (2×T1 + 2×T2), minus 2 critical dues replicated into more than one bundle = **10 targets, 8×T1 + 2×T2, 7.0 answer-minutes, posted 100**. Draft A D E spans three wings (RECALL · FIGURES · WORDS), which is what the token press needs.

**First answer at ~0:15–0:18: COMPOSED S9 #1 ("cold open to first answer ≤ 20 s", currently a live PASS with Home painting in 32 ms) survives, and `tests/job-coldopen.test.mjs` pins the exact path** — `board 6 → primary button → guard accept 4 → call 5`. The 12 s guard figure in the fixed-phase table is the *observed mean when the student re-presses*, not the cold-open path; both numbers are true and the table says which is which. Drafting is opt-in; the primary button is always the plan's own recommendation pre-drafted and pre-pressed, so the game is never a tax on a student who just wants to work.

**Quit and resume.** One tap on WALK at any moment: a single prompt `Bag 63 first? [Bag & leave] [Leave]`, the lossless option default-focused. Under 3 seconds. **On any exit that is not a bag, LOOSE auto-banks at 50 %** — so quitting is never better than banking and never catastrophic. XP, mastery, tiles, buckets and errors from every answered target are already written (by the existing grade path, at grade time). Mid-job reload restores `inProgress.game` (queue, idx, loose, bagged, chain, calls, tokens, guard, crew, briefs) exactly as a Page restores today, **with the job seed pinned, so re-opening cannot re-roll the guard draw, the bundle partition or the ×2 placement** — which is also the anti-quit-scum device (G3.7 proof 6).

**Failure states, all named, all non-destructive.**
- **CALL IT** — LOOSE 0 and chain 0 with ≥ 3 targets left: one tap ends the stakes, the job is recorded walked at posted 0, and the remaining targets continue as a no-stakes calm page **with hints on**. *The game stops; the studying does not.*
- **Walked** (quit, 50 % auto-bag) · **Knocked** (a vault boss KO — unchanged: XP, mastery, tiles kept, stamp forfeited) · **Board closed** (after 22:00 no job posts) · **Dry board** (nothing due and nothing new in range: the board posts a Variant job at `scope 0.8` and prints `low-value board: variants only`, so grinding is visibly unprofitable rather than discovered to be) · **Thin board** (a wing's supply is short — see G4: fewer than 5 contracts post, the draft narrows, and the board says `thin board · 3 contracts · draft 2`) · **Cold crew** (a make's crew is idle on its own due-review target: the board says `4 crew idle on their own reviews · 9 dues · clear them first — 4 minutes` and offers the review contract).

---

## G2 Meta-progression and economy

**Conflict declared and resolved up front.** COMPOSED Appendix B deletes "Vertices/currency/shop/Double-XP · crowns and Legendary grind". This design honours that ruling exactly: **there is no persistent currency anywhere in the layer.** LOOSE and BAGGED evaporate at the end of every job. There is nothing to buy, no shop, no cosmetic sink, no balance, no hoard cap, no prestige. The heist design's CUT/safehouse/intel tree and every other design's LP, assists, cores, Read and Ground are deleted outright (G11).

**What persists — five things, none of them a currency.**

| name | type | what moves it | what it does | capped |
|---|---|---|---|---|
| **CREW** | 19 makes × 3 states | `8 + floor(level/2) + bossStamps` points, ≤ 12 makes manned | build capacity, freely re-allocated | 8 → 22 points, 12 makes |
| **RATING** | 0.0–10.0 | weighted proper-score **sum over a fixed 50-call window** | rank, which gates the 95 call and the guard multiplier | window, not a stock |
| **RANK** | Called 1–5 | thresholds on rating | — | — |
| **FAULT INDEX** | 68 tags | resolutions and breaches per tag | the collection | 68 |
| **LEDGER** | records | bests and counts | self-competition | fixed size |

Plus `heat` (your own stake-weighted last-10 token shares, the guard's input) and `elo` (you and the House), neither of which is earned or spent.

### Crew — capacity, not currency

`capacity = 8 + floor(xp.levelFor(save.xp) / 2) + bossStamps` (≤ 7 stamps), range **8 at L1 with no bosses → 22 at L15 with all seven**. **Crew is not earned by playing more jobs.** Thirty jobs in a week grant zero capacity on their own; only levelling (which is XP, which is answering) and beating bosses do. That is the whole anti-grind design.

Ranks are bought per make, **at most 12 of the 19 makes may be manned at once** (`manned ≤ min(capacity, 12)`), re-allocation is free and unlimited between jobs and inside every brief window — a build mistake costs you one job, never an evening.

| rank | cost (cumulative) | effect | requires |
|---|---|---|---|
| — | 0 | ladder as authored | — |
| **STEADY** r1 | 1 | forgives one rung (`ρ`: 1-hint → 1.00, att-2 → 0.70, att-3 → 0.45, miss → 0.20) | nothing |
| **HELD** r2 | **2** | forgives two rungs **and, at chain ≥ 3, any non-clean outcome on this make holds the chain instead of resetting it** | `mastery.isMastered(rec)` — `m ≥ 85 ∧ n ≥ 3 ∧ a correct due review ≥ 12 h after the previous attempt` |

**Capacity binds at every level.** At 8 points: 8 STEADY, or 4 HELD, or any mix. At the ceiling of 22 points the cap bites exactly: 12 makes manned costs 12 points, and the remaining 10 points buy 10 HELD upgrades — **10 HELD + 2 STEADY, and seven makes always bare.** There is no level at which the board is covered.

**Crew goes idle on the make's own due review, and only there.** When the target *is* the review that made the make cold, the crew stands down for that target: a review is answered bare, which is the honest part. The rest of the make's targets in that job keep their forgiveness, and HELD's chain-hold is suppressed on due-review targets only. (The previous rule idled a whole make for a whole job whenever it had any due card, which switched crew off almost exactly where a weak make earns it, and cost HELD its gate entirely. See G12 #4.) The board prints it per target, not per make: `VOC crew idle — this target is its own due review.`

**HELD's gate is `isMastered` alone.** The previous "and no due card in the make" clause meant a mastered make with no dues produced no `review` role, no `weak` Variant and no `new` card, so the composer almost never drew it — HELD paid ≈ 0 encounters. Spaced review *is* crew maintenance, and the per-target idle rule above is how that is priced without deleting the mechanic.

### The build decision, with the numbers (D2: forgive weak ground vs hold strong ground)

Rung distributions are read from `save.cards[*].history` per (make, tier); these are the shipped bands, and the `E[ρ]` columns are recomputed from `LADDER` and `ρ_eff = LADDER[max(0, rung − rank)]` (the previous r1/r2 columns did not reproduce from the ladder — G12 #5):

| `m_shown` | clean | 1-hint | att-2 | att-3 | miss | E[ρ] r0 | E[ρ] r1 | E[ρ] r2 |
|---|---|---|---|---|---|---|---|---|
| 85+ | .88 | .06 | .03 | .02 | .01 | **0.940** | 0.972 | **0.989** |
| 60 | .58 | .13 | .13 | .08 | .08 | **0.746** | 0.853 | n/a |
| 40 | .34 | .16 | .19 | .12 | .19 | **0.562** | **0.725** | n/a |

So `Δρ` for STEADY on an m40 make is **+0.163**, and for HELD on an m85 make **+0.049** — HELD's forgiveness is worth almost nothing on a make you already know, and the document says so plainly: **you buy HELD for the chain-hold, not the forgiveness.**

**The 4×2 matrix, each cell computed with that shape's own average loot `L̄`** (the previous table priced STEADY with the VAULT's `L̄ = 28` and compared it against HELD's RUN number — G12 #5):

`L̄`: RUN `(6·6)/6 = 6.0` · JOB-10 `(8·6 + 2·18)/10 = 8.4` · JOB-12 `(7·6 + 4·18 + 38)/12 = 12.7` · VAULT-7 `(3·6 + 2·18 + 38 + 70)/7 = 23.1`.

```
STEADY per point = Δρ_steady · L̄ · m̄ · e_forgiven                       (cost 1)
HELD   per point = [ Δρ_held · L̄ · m̄ · e_held + h · V_hold ] / 2        (cost 2)
  h      = e_held · P(non-clean on a mastered make = .06) · P(chain ≥ 3)
  V_hold = Σm_saved · L̄ · ρ̄ · W̄            with ρ̄·W̄ ≈ 0.94 × 1.4 = 1.316
```

| shape | `m̄` | `e_forgiven` | `e_held` | `P(chain ≥ 3)` | `Σm_saved` | **STEADY / pt** | **HELD / pt** | winner |
|---|---|---|---|---|---|---|---|---|
| RUN | 1.3 | 0.9 | 3.6 | 0.12 | 1.2 | **1.1** | 0.8 | **STEADY** |
| JOB-10 | 1.4 | 1.4 | 5.0 | 0.42 | 3.0 | 2.7 | **3.5** | **HELD** |
| JOB-12 | 1.5 | 1.7 | 5.6 | 0.50 | 3.4 | 5.3 | **7.4** | **HELD** |
| VAULT-7 | 1.6 | 1.0 | 2.8 | 0.55 | 3.4 | 6.0 | **7.3** | **HELD** |

Every parameter in that table is a *measurement*, not a guess, and J4 owns the measurement: `m̄`, `e_forgiven`, `e_held`, `P(chain ≥ 3)` and `Σm_saved` are read off `composePage` + `composeBundles` output over 1 000 seeded saves and a 10⁴-job simulation. **`m̄` reproduces within ±15 % on the RUN, JOB-10 and JOB-12 rows — three of the twenty cells.** Every other cell is asserted at its measured value with a bounded deviation and a ±2 % regression pin; `e_forgiven` is asserted ABOVE the published number on every shape (G12 #4 replaced the per-make idle rule the encounter counts were written for) and `e_held` BELOW it on every shape, because it is structurally unreachable rather than noisy. `tests/job-crew.test.mjs` asserts the *count* — `inTol.length * 5 === 15` — so a later change that makes more cells land fails the suite and this paragraph has to be re-read rather than quietly re-believed. **If a measured parameter moves the winner of a row, the row in this document is wrong and the ticket updates it — the flip structure below is the claim, not the decimals.**

**Three states, two flips, no dominant build:**
- **Flip 1 — shape.** On a RUN (6 targets, `L̄ 6`, chains that rarely reach 3) STEADY wins 1.1 to 0.8. On everything longer or richer HELD wins, because the chain-hold's value scales with `L̄` and with how often the chain is deep.
- **Flip 2 — mastery state.** For a student with no mastered make, HELD does not exist and the only decision left is *which* weak makes to STEADY — ordered by `w · (1 − m/100) · encounters`, which is **the exact sort key `readiness.weakSpots()` already uses to order the study plan**. Same function, two names. That is the fixed point of the build problem (G3.8).

**Mastery strictly dominates forgiveness** (the anti-tanking result, proved in G3.7 #8): moving a make from 40 to 85 is worth `+0.378` of `ρ`; STEADY is worth `+0.163`. You can never buy your way to the payout that knowing it gives you, and mastering it frees the slot.

### Loot, derived from the engine's own minute estimates

`L = {1: 6, 2: 18, 3: 38, 4: 70}` against `LIMITS.minutesPerTier = {1: .5, 2: 1.5, 3: 3, 4: 5}`. Both rows are published, because the student experiences the second one:

| | T1 | T2 | T3 | T4 |
|---|---|---|---|---|
| loot per **answer** minute | 12.0 | 12.0 | 12.7 | 14.0 |
| loot per minute **as experienced** (answer + that tier's decision seconds) | **8.2** | **9.5** | **10.9** | **12.5** |

Both are monotone non-decreasing in tier, so hard work is never the worse deal per minute, and the published table is the one the student actually lives (G12 #40f). This is the single most important number in the economy and it is computed from the shipped constant, not guessed.

```
clear:  Δloose = round( L · ρ_eff · m_chain · W_call · scope · wing · cold · tell )
miss:   Δloose = −min( LOOSE, round( L · m_chain · P_call · wing_pen ) ) ,  chain → 0
bag:    BAGGED += 0.9·LOOSE ;  LOOSE → 0 ;  chain → 0        // banking ends the run of luck
m_chain = 1 + 0.2·min(chain, 8)                    // cap ×2.6
scope   = xp.scopeFor() verbatim                   // review 1.25 · drill 1 · variant .8 · mastered .5 · bonus 0
wing    = 1 + 0.25·(tokens on this wing) if unguarded;  guardMult(rank) if guarded (tokens on it pay nothing)
wing_pen = 2 on the guarded wing else 1
cold    = 1 + 0.5·min(1, overdueDays / schedule.intervalDays(bucket))     // capped at 1.50
tell    = 1.25 while the make has a triggered, unresolved, unsealed tag in save.errors; else 1
fee     = 0.10 of whatever you bag mid-job; bagging at the getaway is free
completion = +10 % on BAGGED if every drafted target was answered
```

**BAG banks the pile and resets the chain to 0.** This is the fourth chain transition and it is not `xp.comboTransition()` — it is a wrapper, `chainAfterBag()`. The whole §3.2 threshold table depends on it (the `m_chain = 1` term in the BAG branch), and the bag prompt prints it: `bag 118 (fee 13 · chain 4 → 0)`. (G12 #3.)

**`cold` is capped at 1.50 and scaled by the card's own interval.** `1 + overdue/4` was uncapped, so a card 30 days overdue paid ×8.5 and *skipping study* multiplied the next board's loot — the one incentive in the design pointing away from spaced review. Now a bucket-1 card 1 day overdue and a bucket-5 card 14 days overdue are equally cold (both 1.50), and letting a card rot past its own interval buys nothing. J9 asserts total weekly loot is monotone increasing in review compliance. (G12 #13.)

**`tell` only pays while the fault is live.** The tag must be present in `save.errors` **and** unresolved (`cleared !== true`) **and** unsealed. `index.resolve()` sets `cleared = true` and the multiplier drops to 1.00 that instant; sealing a tag (3 clean resolutions across 3 days) retires it from the tell pool for good. Deliberately missing 68 tier-1 cards once no longer buys a permanent +25 % on most of the board, and J9 asserts a save with 68 deliberate misses earns **less** over a simulated week than an honest one. The debrief says it in one dry line: `dropped-gcf sealed · tell 1.00`. (G12 #14.)

The **fee** exists for one reason, proved in G3.3: without it, bagging at chain 0 would be strictly dominant and one of the two per-target decisions would be dead.

**Chain transitions are `xp.comboTransition()` verbatim** (clean increments · Gold-with-H1 holds · anything else resets), plus **two** additions, both in `chainAfterBag()`/`chainAfterTarget()` wrappers rather than in `xp.js`: a non-clean outcome on a HELD make at chain ≥ 3 holds; a BAG resets.

### Rank

| rank | name | rating | calls available | guard multiplier (guarded-wing loot) | ε (mix floor) |
|---|---|---|---|---|---|
| 1 | **Called 1** | < 5.0 | 50 / 70 / 85 | ×0.50 | 0.25 |
| 2 | **Called 2** | 5.0–6.4 | 50 / 70 / 85 | ×0.55 | 0.20 |
| 3 | **Called 3** | 6.5–7.6 | + **95** | ×0.60 | 0.15 |
| 4 | **Called 4** | 7.7–8.8 | + 95 | ×0.70 | 0.15 |
| 5 | **Called 5** | ≥ 8.9 | + 95 | ×0.75 | 0.10 |

The ladder is the rating band printed as a word — `rating 7.1 · Called 3`. (Runner / Second / Wheelman / **Boxman** / Ghost was a crime-crew hierarchy on a school tool, opaque to a fourteen-year-old and reading as costume rather than as math. Every mechanic is unchanged. G12 #33.)

**Rank helps, monotonically.** The guard multiplier is the **guarded wing's loot multiplier**: at Called 1 a target on the guarded wing pays half, at Called 5 three quarters. Climbing softens the guard's bite while `ε` falls, so the guard aims *better* at you as you climb — a real tension, both halves printed. (The old table ran ×0.75 → ×0.50, i.e. rank made the guard hurt more, and never said what the number multiplied. G12 #40a.)

Calling 50 on everything scores exactly **5.0** — Called 2 forever. Cowardice keeps its money and buys no rank. Rank never removes a tool you own and gates no card, no boss, no Mock, no hint and no solution: it gates the 95 call and the guard multiplier, which are loot (COMPOSED Global rule 1).

### The Fault Index — the one new collection

68 entries, one per tag in `data/misconceptions.js`, grouped by that file's own 11 `AREAS`. A tag is **sealed** when it has been resolved cleanly 3 times across 3 distinct days with zero re-triggers in that window. The completion certificate reads *"here are the sixty-eight mistakes I no longer make."* Live tells pay ×1.25, so **fixing your own specific error is the best-paying single thing in the game** — right up to the moment you have fixed it, which is the point.

### Backchecks — the only consumable, and it is minted by the dullest work

Max 3 held. On a miss you may spend one: **the chain holds and LOOSE is not taken. The rating credit is always taken.** A Backcheck shields the stake and only the stake — it does not change the answer, the bucket drop, the mastery hit, the error-log entry, the Rematch, **or the `calls[]` entry the rating window reads**. Without that last clause, holding 3 Backchecks would convert the first three targets of every job into downside-free 95 calls and the scoring rule would stop being proper for them (G12 #26); J7 asserts a shielded miss writes a byte-identical `calls[]` entry to an unshielded one.

Minted: **1 per day for a day on which `dues ≥ 1` and every one of them was cleared** (a day with zero dues mints nothing — G12 #38), and 1 per vault cracked with no Backcheck spent (cap 1/day). Not available on the vault itself. *The least fun, highest-value study action is the source of the game's only scarce resource.*

### Where the economy ends

There is nothing to buy, so there is no tree to finish and no rate to grind. The three progress curves are **rating** (a trailing 50-call window that stops moving when you stop improving), **crew capacity** (a function of level and boss stamps, i.e. of answering), and **the Fault Index** (68, finite). And the economy deliberately deflates: `cold` falls as buckets rise, `scope` falls to 0.5 on mastered makes, `tell` retires as tags seal, and the rating weight `4q̂(1−q̂)` collapses as you get good. The debrief says it in one line: **`posted falls as you master the material. That is the point.`** At `crew held ∧ Readiness ≥ 88` the board stops leading with a job: `Board quiet · Readiness 89 · 0 due` — with the job still one tap away. **The game has a terminus and admits it.** No prestige, no rebirth, no season, no ladder above it.

---

## G3 Game-theoretic mechanics

### 3.1 The Call — a strictly proper scoring rule, twice

Two ladders on the same four buttons. Carry pays in multipliers of `L·ρ·m·scope·wing`; rating pays a Brier credit.

| call | W (clear) | P (miss) | rating credit clear | rating credit miss |
|---|---|---|---|---|
| 50 | ×1.0 | ×0.0 | 0.0 | 0.0 |
| 70 | ×1.4 | ×0.6 | +6.4 | −9.6 |
| 85 | ×1.8 | ×2.0 | +9.1 | −18.9 |
| 95 (Called ≥ 3) | ×2.2 | ×5.0 | +9.9 | −26.1 |

**Carry EV** (`EV = q·W − (1−q)·P`, units of `L·ρ·m·scope·wing`) — **on a pile that can pay the loss (`S ≥ L·m·P`, G3.2's deep branch). The argmax column below is the DEEP-pile argmax and it is not unconditional:**

| q | 50 | 70 | 85 | 95 | argmax |
|---|---|---|---|---|---|
| 0.50 | **0.50** | 0.40 | −0.10 | −1.40 | 50 |
| 0.60 | **0.60** | **0.60** | 0.28 | −0.68 | 50 ≡ 70 |
| 0.70 | 0.70 | **0.80** | 0.66 | 0.04 | 70 |
| 0.80 | 0.80 | 1.00 | **1.04** | 0.76 | 85 |
| 0.90 | 0.90 | 1.20 | 1.42 | **1.48** | 95 |
| 0.95 | 0.95 | 1.30 | 1.61 | **1.84** | 95 |

Indifference exactly at `q = 0.600` (50↔70), `0.778` (70↔85), `0.882` (85↔95).

**The condition, stated here rather than buried in a data comment (round-3 exploit-hunt).** `EV = q·W − (1−q)·P` is not G2's miss branch. G2 caps the miss at the pile: `Δloose = −min(LOOSE, L·m·P·wing_pen)`. **At `S = 0` every rung's downside is exactly 0**, the clear branch `q·W` is strictly increasing in `W`, and the highest call the rank allows is **weakly dominant at every `q`** — `evMaxCallAt` returns 95 (or 85 at Called 1–2) whether `q` is 0.05 or 0.99. `econ.carryEVAt` on one tier-1 opener at `q = 0.40`: `50 → 2.40, 70 → 3.36, 85 → 4.32, 95 → 5.28`. At `S = 120, q = 0.50, L = 18` the published ladder returns: `50 → 9.00, 70 → 7.20, 85 → −1.80, 95 → −25.20`, argmax 50. **The state is reached on target 1 of every job, immediately after every BAG, and after any miss that emptied LOOSE**, so it is not a corner case — it is the opening beat. The table above is therefore the ladder of the *pile-deep* half of the game; `econ.evMaxCallAt(state)` is the argmax at a real state, and `job-econ.test.mjs` §3b pins both, the `S = 0` dominance included. The only published brake is the rank ladder (95 needs Called 3, and systematic over-calling drives the rating that gates it to 0), which is a *rating* brake, not an EV one. **Closing the hole itself — flooring the miss against BAGGED-this-job at `S = 0` rather than against LOOSE alone — is a G2 change and has not been taken**; see `notes/econ-fix.md`.

**Rating credit** `c(p,o) = 10 − 40(p−o)²`. `E[c] = 10 − 40[q(1−p)² + (1−q)p²]`, `dE/dp = 80[q(1−p) − (1−q)p] = 0 ⟺ p = q`, second derivative `−80 < 0`. Strictly proper: **truthful reporting is the unique maximiser**. Discrete indifference at `0.600 / 0.775 / 0.900`.

**The two ladders disagree in exactly two bands** — `q ∈ [0.775, 0.778)` and `q ∈ [0.882, 0.900)` — and they disagree in OPPOSITE directions, which is the point (corrected at integration; notes/J2.md §5.2, notes/J7.md §7). In the upper band `q ∈ [0.882, 0.900)` money prefers the bolder call (95) and rank prefers the honest one (85). In the lower band `q ∈ [0.775, 0.778)` it is the mirror: money prefers **70** (carry EV 0.9520 against 0.9488 at q = 0.776) and rank prefers **85** (Brier 2.828 against 2.816). The bands exist because the carry ladder's cut sits above the Brier's at one rung and below it at the next, so neither ladder is uniformly the bolder one. Both are printed in Settings. It is the only place in the game where the player must choose what they are playing for, and it is 2.1 percentage points wide on purpose.

**The anti-farming weight, and why the rating is a SUM over a fixed window.** `w = 4·q̂(1−q̂)`, `q̂` = your first-try rate on that make over the trailing 10 attempts. `q̂ = .5 → w = 1.00`; `.8 → .64`; `.9 → .36`; `.933 → .25`; `.97 → .116`.

> **A call is *informative* iff `w ≥ 0.25`, i.e. `q̂ ∈ [0.067, 0.933]`. Only informative calls enter the window.**
>
> ```
> rating = clamp(0, 10, 5 + 2 · Σ(w_i · c_i) / N)        N = 50, fixed
> ```
>
> **`N` is the window size, not `Σw`.** A weighted *mean* is invariant to the weights whenever every call in the window is the same kind, which made farming mastered tier-1 locks the fastest route to the top rank: at `q̂ = .97` a truthful 95 call scores `E[c] = 8.84` and the mean does not care that `w` is only 0.116. Dividing by a fixed `N` fixes it twice over: those calls are no longer informative (`w = .116 < .25`) so they never enter the window at all, and **an unfilled slot contributes 0, which pulls the rating toward exactly 5.0.** A pure tier-1-mastered farmer's rating is not 9.41. It is **5.00**, and the board says `rating 5.00 · 0/50 informative calls`. (G12 #1.)

Sanity, all pinned by J2:

| behaviour | mean `w·c` per call | rating |
|---|---|---|
| calling 50 on everything | 0.000 | **5.00** |
| farming mastered tier-1 (no informative calls at all) | 0.000 | **5.00** |
| honest calls at `q̂ = .70` | 1.344 | 7.69 |
| honest calls at `q̂ = .80` | 2.240 | 9.48 |
| honest calls at `q̂ = .85` (the peak) | **2.499** | 9.998 |
| honest calls at `q̂ = .90` | 2.268 | 9.54 |
| systematic over-calling (95 on `q̂ = .5` material) | −4.90 | **0.00** (clamped) |

**The central alignment result, restated so that it is true.** The rating is a **calibration** score, and a coin flip is not something calibration skill can be demonstrated on: `E[c] = 10 − 40q(1−q)` is exactly 0 at `q = 0.5`. So the honest two-part claim, which replaces the old one-liner:

1. **Uncertain material is where the rating is *decided*.** `w = 4q̂(1−q̂)` peaks at `q̂ = 0.5`, so calls on material you genuinely cannot predict carry the most weight — in both directions. That is leverage, not gain.
2. **Consolidating material is where the rating is *earned*.** `w · E[c] = 4q̂(1−q̂)·(10 − 40q̂(1−q̂))` is single-peaked, with its maximum at **`q̂ = 0.854`** (`u = q̂(1−q̂) = 0.125`, `f(u) = 40u − 160u²`, `f'(u) = 40 − 320u = 0`), value 2.50. The band holding ≥ 80 % of that peak is **`q̂ ∈ [0.763, 0.925]`** — material you have just learned and are still fumbling one time in six.

*The rank-maximising player is a student staking on what they have just learned and have not yet nailed.* That is the desirable-difficulty band, it is where mastery gain per minute is highest, and it is the band the app names. J1 asserts the peak of `w·E[c]` by grid search; there is no assertion anywhere that `q̂ = 0.5` maximises anything but the weight.

**And the two currencies pull in different directions, on purpose.** Carry EV is strictly increasing in `q` (you want the target you are sure of); rating is maximal at `q̂ ≈ 0.85` (you want the target you are nearly sure of). The gap is the decision the game is about, it is printed in Settings, and it is why the loot brakes in G3.7(3) have to exist at all.

### 3.2 Push or bag — push-your-luck whose bust condition is being wrong

State: `S` = LOOSE, `c` = chain, `m = 1 + 0.2·min(c,8)`, next target `L`, chosen call `(W,P)`, expected clear rung `ρ̄`, fee `φ = 0.10`.

- **BAG then answer:** `0.9S + q·L·ρ̄·1·W` — the miss term vanishes, because `LOOSE = 0` makes `min(LOOSE, ·) = 0`, and the `1` is `m_chain` after the bag's chain reset (G2). Bagging buys one target of literal invulnerability at the price of the fee **and the chain**.
- **PUSH:** `S + q·L_gain·ρ̄·m·W − (1−q)·min(S, L_loss·m·P)`

```
PUSH − BAG = 0.10·S + q·L_gain·ρ̄·W·(m − 1) − (1 − q)·min(S, L_loss·m·P)
```

**There are two `L`s, because G2 gives the two branches different multiplier sets.** The clear branch charges `L · scope · wing · cold · tell · ×2`; the miss branch charges `L · wing_pen · ×2` and nothing else — the asymmetry is deliberate and it is stated in G2. A threshold built on one `L` is the threshold of a different economy: it printed the same `q*` whether a guarded-wing miss cost 22 or 43, and on five realistic states (a cold tagged review, a guarded drill, a mastered target, a ×2 posting) the verdict it printed was the opposite of the one the payout pays. They are `econ.gainLFor` / `econ.lossLFor`, which are `carryFor`'s and `missFor`'s own factor lists, and `job-econ.test.mjs` asserts the printed threshold is the root of a `PUSH − BAG` rebuilt out of those two payout functions rather than out of a second copy of this formula. `L_loss` is **0** where the crew forgives the miss, because `missFor` charges nothing there. Below, where a formula says plain `L`, both are the bare `L` — that is what "at `ρ̄ = 1`, bare target" means. (Round 2, econ-math.)

**Deep pile** (`S ≥ L_loss·m·P`), dropping the fee term for the clean asymptotic form: `θ* = (L_loss·m·P) / (L_gain·ρ̄·W·(m−1))`, `q* = θ*/(1+θ*)` — on a bare target the two `L`s cancel to `θ* = m·P / (ρ̄·W·(m−1))`, which is the table below. At `ρ̄ = 1` (the optimistic bound; the app computes `ρ̄` per target from your own rung distribution and prints the true threshold — `econ.breakevenQ`, which keeps the fee and is *not* the table's form; see the scope note below the shallow branch):

| chain c | m | call 70 q* | call 85 q* | call 95 q* |
|---|---|---|---|---|
| 1 | 1.2 | 0.720 | 0.870 | 0.932 |
| 2 | 1.4 | 0.600 | 0.795 | 0.888 |
| 4 | 1.8 | 0.491 | 0.714 | 0.836 |
| 8 | 2.6 | 0.411 | 0.644 | 0.787 |

**Shallow pile** (`S < L_loss·m·P`, early in a job or just after a bag) the loss truncates at `S`, so only the gain branch's `L` survives and solving `0.10S + q·L_gain·ρ̄·W·(m−1) − (1−q)·S = 0` gives

```
q* = 0.9·S / ( L_gain·ρ̄·W·(m − 1) + S )
```

At `c = 0` this is exactly **0.9** regardless of `L`: with no chain, the `m − 1` term is zero and pushing buys nothing but the fee. **So the escalation runs the other way from a slot machine: early, with a shallow pile and no chain, the threshold is brutal (0.9) and the stakes are trivial; as the chain deepens the threshold *falls* — 0.900 → 0.143 on a shallow pile at call 95, 0.932 → 0.787 in the deep table above — while the amount at risk *grows*.** The curve is in the stake, not in the odds, and it comes entirely from your own miss rate. No dice, no bust die, no wheel. (The previous text claimed pushing was "nearly free at the start", which the algebra contradicts.)

**Scope, because the number on screen is not the number in the table.** That falling direction is a property of the two *closed forms* — the shallow form above and the fee-free deep table. The app prints `econ.breakevenQ`, the true root of `PUSH − BAG` **with the fee kept in both branches**, and on a pile deep enough to pay the loss it runs the other way:

| `S = 200`, `L = 18`, `ρ̄ = 1` | c = 0 | 1 | 2 | 4 | 6 | 8 |
|---|---|---|---|---|---|---|
| printed `q*`, call 70 | 0.000 | 0.000 | 0.000 | 0.000 | 0.070 | 0.118 |
| printed `q*`, call 85 | 0.444 | 0.467 | 0.480 | 0.494 | 0.501 | 0.506 |
| printed `q*`, call 95 | 0.778 | 0.759 | 0.747 | 0.733 | 0.725 | 0.683 |

The deep root is `(L·m·P − 0.10·S) / (L·ρ̄·W·(m−1) + L·m·P)`. The fee enters as a **fixed** credit toward pushing, and the loss term it is subtracted from grows with the chain, so the credit is worth proportionally less at every step; at a shallow chain it can swamp `L·m·P` entirely and clamp `q*` to 0 ("push at any `q`"). Drop the fee and the same branch falls, which is exactly why the table above falls. **So: at a fixed pile, on a shallow one the chain buys you a lower threshold; on a deep one at 70 and 85 it does not.** *At a fixed pile* is load-bearing and is not decoration — see the round-3 paragraph below. The half of the sentence that holds everywhere is *the amount at risk grows*. Both directions are pinned in `job-econ.test.mjs` §5 so neither can be restated as unconditional. (Round 2, econ-math.)

**What the app itself says, exactly, and what it does not (round 3, econ-math).** The earlier version of the sentence above ended by asserting that the app already scopes this. It does not, and `job-shape-measured.test.mjs` §3 now fails if that attribution is ever written back. The one place the app states the direction is the Settings "chain, and when to bank it" card, mid-paragraph, immediately after the shallow closed form — *"As the chain deepens the threshold falls and the amount at risk grows"* — with no scope on either side of it, and the next sentence pivots to the number the app prints (`econ.breakevenQ`). **Scoping that paragraph is a copy change in `site/js/screens/settings.js`, which this lane does not own; it is filed as a Request in `notes/econ-fix.md` and this document does not get to lean on it in the meantime.** **And the obvious defence of the copy — "but on a real play path the pile grows with the chain, so it falls anyway" — is false, which is the sharper half of this finding.** Every falling number in this section is a *comparative static*: hold `S` fixed, vary `c`. Walk a job instead — clear each target, bank nothing, let `S` accumulate — and the direction does not survive the move. Eight tier-1 clears at call 95:

| | beat 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| printed `q*` (`breakevenQ`) | 0.000 | 0.696 | 0.712 | 0.726 | **0.738** | 0.731 | 0.705 | 0.682 |
| shallow closed form | 0.000 | 0.696 | 0.712 | 0.726 | 0.738 | 0.748 | 0.756 | **0.763** |
| deep closed form (`θ*`, no `S` in it) | 1.000 | 0.932 | 0.888 | 0.858 | 0.836 | 0.820 | 0.806 | **0.796** |

**`shallowQStar` itself rises on a played path** — it is `0.9·S / (A + S)` and `S` outruns `A` once the chain is paying — so the falling direction is not even a property of "the shallow branch"; it is a property of the shallow branch *at a pile that does not move*. The only form that falls on a played path is the **deep** one, and it falls trivially, because `θ* = m·P / (ρ̄·W·(m−1))` does not mention the pile at all. The printed number is neither: on the T2-heavy job the composer actually drafts, at call 85, it prints `0.000 · 0.497 · 0.630 · 0.633 · 0.624 · 0.336 · 0.554 · 0.513 · 0.144 · 0.463` — no direction a player could act on. **The honest statement, and the one this document will not walk back: the threshold falls with the chain only in a comparison that holds the pile still; over a session it does not fall, and the half that is true everywhere is that the stake grows.** `job-econ.test.mjs` §5 pins the played path for all three forms, so this cannot be restated as a session-level claim anywhere.

Two worked rows the tests pin:
- `S = 300, c = 0 (m = 1), next T4 (L = 70), call 85, q = 0.5, ρ̄ = 1`: `L·m·P = 140 < 300` (deep) → `30 + 0 − 0.5·140 = −40` → **BAG**.
- Same with `q = 0.8, c = 6 (m = 2.2)`: `L·m·P = 308 > 300` (shallow) → `30 + 0.8·70·1·1.8·1.2 − 0.2·300 = 30 + 120.96 − 60 = +90.96` → **PUSH**.

**Where to stake, and where not to.** There is **no interior growth optimum in `q` for loot**: `E[Δloose] = q·L·ρ̄·m·W − (1−q)·L·m·P` is strictly increasing in `q`, because LOOSE is not multiplied by the pile — the gain term contains no `S`, and the loss is capped by `S` rather than proportional to it. The "growth-optimal band 0.52–0.63" was imported from an economy this one is not, and it is deleted along with its test. (G12 #6.)

What *is* single-peaked here is the rating's `w·E[c]` (§3.1), so the band the app names is the **stake band `q̂ ∈ [0.763, 0.925]`** — derived, printed with its derivation in Settings, and asserted in `job-econ.test.mjs` as the ≥ 80 %-of-peak region of `w(q̂)·E[c](q̂)` over the four call rungs. Never a card you know cold, never a card you cannot do. The optimal door is different for every student and moves every time they learn something.

### 3.3 Why bagging is not automatic (the fee's proof of work)

Without the fee, at `c = 0` we get `m − 1 = 0`, so `PUSH − BAG = −(1−q)·min(S, LP) ≤ 0` in every state: *bag immediately after every miss* would be a dominant sub-strategy and one of the two per-target decisions would be dead. With `φ = 0.10`, at `c = 0`, `L = 6`, call 70, `S = 50.76`: `min(S, L·1·P) = 3.6`, so `PUSH − BAG = 5.076 − 3.6(1−q) > 0` for all `q ≥ 0`. The decision is live at every chain value and flips on pile size, target grade, rung distribution, crew rank and call — a five-variable decision, not a habit.

### 3.4 The Guard — matching pennies on your own habits, with published odds

Four **wings** partition the 19 skills; weights from `data/skills.js` sum to 100 exactly.

| wing | skills | Σw |
|---|---|---|
| RECALL | VOC 7, NOTE 8, CLASS 3, ASN-PLP 7, ASN-ANG 7 | 32 |
| FIGURES | PAIRS 8, FIG-ALG 8, BISECT-L 4, BISECT-Q 3, SEG-ALG 3 | 26 |
| WORDS | CSARITH 5, CS-LIN 9, CS-RATIO 5, CS-QUAD 4 | 23 |
| ALGEBRA | SYS 4, FAC1 3, FAC2 6, QUAD-SOLVE 4, QUAD-CTX 2 | 19 |

You press 3 tokens across the **support** — the wings the drafted contracts actually touch — sealed. `composeBundles` guarantees the 5 posted contracts span ≥ 3 wings and that **any** legal 3-of-5 draft spans ≥ 2; the board prints the support size (`guard: 3 wings on the board`) so `n` is never a surprise. (Contracts are labelled by dominant make and can carry locks from more than one wing; VOC + NOTE + ASN are all RECALL, so a skill-pure reading of the board could have produced a one-wing draft, where `Σy = 1` forces `y = 1 > 0.75` and the whole fixed point evaporates. G12 #11.)

A token is worth `+0.25×` on that wing's loot **only if the wing is unguarded**. The House guards exactly one wing, drawn from a **published distribution** `y = project((1−ε)·x̂ + ε·uniform_n, cap)`, with `cap = 0.75` for `n = 3` and `n = 2` alike. The bars and the percentages are on screen before you press. On job 1 there is no `x̂`, so the distribution is uniform and the board prints `no data — uniform 1/3` (no fabricated rating, no cold-start lie).

**The cap projection, stated so it can be implemented** (capping alone left `Σy ≠ 1` and failed J3's own acceptance — G12 #10):

```
project(y, cap):                     // water-filling; terminates in ≤ n−1 passes
  loop:
    over = { i : y_i > cap }
    if over is empty: return y
    excess = Σ_{i∈over} (y_i − cap)
    for i in over: y_i = cap
    free = { i : i ∉ over }
    if Σ_{i∈free} y_i > 0: distribute excess over `free` in proportion to current y_i
    else:                  distribute excess over `free` uniformly
```

Worked, and pinned in J3: `n = 3`, `ε = 0.10`, `x̂ = (1,0,0)` → `(0.9333, 0.0333, 0.0333)` → one pass → **`(0.750, 0.125, 0.125)`, Σ = 1.000**. `n = 2`, `ε = 0.10`, `x̂ = (1,0)` → `(0.95, 0.05)` → **`(0.75, 0.25)`**. The pseudo-code above is what the Settings panel prints, because the panel claims to print the real formula.

**`x̂` is stake-weighted, so it cannot be farmed with throwaway jobs.** Unweighted token shares over the last 10 jobs let a player press the wing they do not care about through three 6-target RUNs (free), walk the guard onto it, then press the wing they do care about on the VAULT. So:

```
x̂_i = Σ_j ( ω_j · share_ij ) / Σ_j ω_j ,   ω_j = min( posted_j , 0.25 · Σ_k posted_k )
```

A RUN contributes about a fifth of a VAULT, and no single job may contribute more than 25 % of the window. (G12 #12.)

Marginal value of a token on wing *i* is `0.25·v_i·(1 − y_i)`, where `v_i = Σ_targets L · scope · cold` is the wing's **study value** (`cold` is now the capped, interval-scaled term of G2). Best response: dump tokens on `argmax v_i(1−y_i)`; doing that drives `y_i → 1`, the payoff decays, you switch. **Fixed point** (support size *n*): `v_i(1−y_i) = k` for all *i* in support with `Σy_i = 1` ⟹ `k = (n−1)/Σ(1/v_i)`.

- Equal values `(v,v,v)`: `k = 2v/3`, `y = (⅓,⅓,⅓)` — pure rotation.
- `v = (30,20,10)`: wing 3 leaves the support; `n = 2`, `k = 12.0`, `y = (0.60, 0.40)`.

So the unexploitable strategy is **to mix pressure across skill clusters in proportion to their study value** — interleaved practice, weighted by test weight and overdue-ness. That is a Nash statement, not a slogan. The `ε` floor guarantees no cluster becomes dead weight; the 0.75 cap guarantees the guard is never a certainty. Guarded wings pay `guardMult(rank)` instead of the token bonus and carry `wing_pen = 2` on misses, so walking into the guard with bold calls is the high-variance line — available, priced, never forced.

### 3.5 Elo — difficulty from YOUR rating, volume from the plan

`E_player = 1/(1 + 10^((R_house − R_player)/400))`, `K = 24`, outcome `1` if `BAGGED ≥ posted` else `0`, both ratings updating symmetrically. Both seed at `clamp(1000 + 4·(placementScore − 50), 800, 1400)` for `R_player` and a flat **1000** for `R_house`; **if placement is skipped (S7 allows it) both seed at 1000, and Settings says so** (G12 #40c).

| dial | driven by | range | what it changes |
|---|---|---|---|
| vault grade | **`R_player`** | `< 1000` → tier ≤ 2 · `1000–1199` → tier 3 · `≥ 1200` → tier 4 | the difficulty of the final all-in only |
| guard multiplier | rank | ×0.50 → ×0.75 | how much a guarded wing costs you |
| call ladder | rank | 3 → 4 rungs | how deep a hole a beginner can dig (answer: shallow) |

**The vault grade is driven by `R_player`, which rises when you win.** Symmetric Elo moves `R_house` *down* on a player win, so driving the vault grade from `R_house` made a strong player's final target get easier with every win, and made the flow-control adjustment indistinguishable in sign from losing. `R_house` survives only as the symmetric opponent number on the Ledger panel. J3 asserts: two simulated win streaks **raise** the vault grade; two loss streaks lower it. (G12 #8.)

**`R_player` never touches which reviews are due — that is Leitner's job alone.** A stronger student therefore faces the same number of problems at a higher vault grade, not more problems, which is what keeps every shape inside 10–25 minutes at every rating.

**Flow control, printed never silent:** after two consecutive jobs with `BAGGED < 0.5·posted`, **`R_player −40`** and the next board opens with a **FOOTHOLD** — contract 1 is three tier-1 dues, guard ×0.5, stated on the board.

### 3.6 Every random object in the layer, with its real odds

There are exactly four, all seeded from `js/rng.js` (`no-random.test.mjs` already forbids `Math.random`), all replayable, all printed *before* the decision they affect, and all of them multiply both branches identically.

| object | distribution | where it is printed |
|---|---|---|
| the guard draw | `y = project((1−ε)x̂ + ε·uniform_n, 0.75)`, ε by rank | three bars with percentages, above the token row, before you press |
| the ×2 posting | **independent `p = 1/6` per target**, drawn by `cyrb53(dateISO \| jobIndex \| targetIndex)` | a `×2` mark on the envelope **before the call**, the realised count on the board (`×2: 2 targets`) |
| the bundle partition | seeded partition of `composePage`'s queue with critical replication and draft-time dedupe | the **board sheet**: the exact remaining composition of every contract, open at all times, so the draw distribution is exactly computable by the player |
| which Variant a generated target is | the existing seeded generators, unchanged | the seed tag in the card corner (existing) |

The ×2 is seeded per **job index**, not per day, so after job 1 the placement is not already known; and it is defined as an independent 1-in-6 per target rather than "exactly one target in six", which was undefined for an 8- or 10-target shape and untestable (G12 #30). Expected count on a JOB-10 is 1.67; the realised count is computed and printed before the draft. J5 asserts the per-target rate is 1/6 ± 0.01 over 10⁴ day seeds.

That is the entire use of variable-ratio reinforcement in this design, and it is stripped of every property that makes a slot machine: no hidden odds, no post-hoc reveal, no near-miss theatre, no escalation, bounded at ×2, stake-only.

### 3.7 Anti-exploit proofs

**(1) Luck never flips an outcome.** No random term appears in any payoff function. The guard and the ×2 multiply both the clear and the miss branch identically. The bundle partition **does** change which legal item you face next — that is stated in Global law 3 rather than denied — but never how it is graded, and every item in every bundle came from `composePage` (G12 #29).

**(2) A wrong answer can never beat a right one.** For fixed `(L, m, scope, wing, call)`: a clear pays `+L·ρ_eff·m·W·… ≥ 0` with `W ≥ 1.0`; a miss pays `−min(LOOSE, L·m·P·wing_pen) ≤ 0` and sets `chain → 0`, weakly lowering every future payout. Rating: clear credit `10 − 40(1−p)² ≥ 0` for every `p ≥ 0.5`; miss credit `10 − 40p² ≤ 0`. So `clear ≥ miss` pointwise in both currencies. **The caveat that matters** (pushluck): monotonicity requires the policy to be *revisable* at every beat — under a frozen threshold policy there are orders where a miss pays more. The engine therefore (a) offers BAG/PUSH at every single target, (b) auto-bags at the getaway, (c) prints `1 target left — a chain of 4 bags at 13.1` one beat early, and (d) ships `tests/job-monotone.test.mjs`, which brute-forces all `2ⁿ` outcome vectors for `n ≤ 11` under optimal play and asserts the final score is monotone non-decreasing in the number of clears **on every shape the composer deals** — 0 violations in 46 080 miss→clear flips over RUN 6 · JOB 10 · VAULT 7 at 8 seeds each (138 240 at 24 seeds, off-suite).

> **Scope of (2), as measured — integration ruling on notes/J9.md F2.** The clause above is scoped to the dealt shapes because the unqualified claim is FALSE and the formula is the authority: `m_chain` multiplies the **miss** branch as well as the clear branch (G2), so an order in which a *cheap* clear precedes an *expensive* miss can lower the optimum — the clear is worth `+5` and it makes the next miss cost `+18`. Measured over arbitrary orders, all `2ⁿ` vectors, `n ≤ 11`: **0.234 % of flips, at most 1.9 % of the bag**, worst absolute drop **22** on a pinned four-target order (616 → 603). J9 offered three resolutions; (b) "drop `m_chain` from the miss branch" rewrites §3.2's whole threshold table and (c) "cap the miss branch's `m_chain` at the chain entering the run of clears" makes the chain history-dependent, so **(a) scope the claim** is taken. Both halves — zero violations on the dealt shapes, and the bounded exception off them — are asserted in `tests/job-monotone.test.mjs`, and the pointwise statement above (a clear pays ≥ a miss **at its own beat**) holds without qualification in 12 000 comparisons.

**(3) Easy-card farming.** Five independent brakes. (a) Loot per minute is monotone non-decreasing in tier on both published rows (12.0/12.0/12.7/14.0 answer-only, 8.2/9.5/10.9/12.5 as experienced), so tier-1 spam is the *worst* carry rate available. (b) `xp.scopeFor` pays 0.5 on mastered makes and 0 on the Bonus Bank. (c) The rating window takes **only informative calls (`w ≥ 0.25`)**, so mastered-material calls never enter it and the unfilled slots hold the rating at exactly 5.00. (d) **Decay** (conquest): a target pays `cold ≤ 1.5` only while it is due, and a clean answer advances the bucket, so the renewable loot rate from a fixed card set is `Σ_c L_c/I(b_c)` with `I = [0,1,2,4,7,14]` — **strictly decreasing as mastery rises**, and raisable only by clearing *more of the packet*, which is Readiness's own `C` term. (e) `tell` retires on resolution and on sealing, so a stockpile of deliberate errors is a depreciating asset. Test: 200 jobs of tier-1-only mastered play leave `rating == 5.00` exactly and loot/hour below the mixed-play baseline; a 400-day simulation with no new cards shows monotone non-increasing loot/day.

**(4) Re-answering knowns.** Structural, not economic: carry and rating accrue **only** on targets drawn by the job composer from the schedule (`role ∈ {review, rematch, new, weak, floor}` and `drawnBy: 'job'`). A card opened from the Binder, an Infinite Variant, a Drill 5, BLITZ and Full 36 pay **zero carry and zero rating** — they pay exactly the XP they pay today. There is no surface on which to re-farm a known card because the game's numbers do not exist outside the job queue. J5 additionally asserts **no job contains two targets of the same card** (the dedupe of G12 #17) and that a 30-run simulated week never repeats a card inside its Leitner interval.

**(5) Clock stalling.** `tick = one answered target`; no term in any payoff reads elapsed time (`job-exploit.test.mjs` greps `js/job/*.js` for `Date`, `now`, `elapsed`, `ms` outside display code and replays a full job with every `ms × 10` asserting byte-identical output). The one real stall exploit — *solve it, then call 95* — is closed by the sealed envelope: the call is locked before the stem renders. And no pre-call surface names the EV-max rung (Global law 6), so the call measures self-knowledge rather than button-following; J2 greps every pre-call template for `argmaxCall`.

**(6) Quit-scumming.** At any state, BAG-and-continue dominates BAG-and-quit: after bagging, `LOOSE = 0` and the call-50 option has payoff `q·L·ρ̄ ≥ 0` with **zero** downside, so continuing has non-negative EV in every state and quitting forfeits the +10 % completion bonus. Quitting also auto-bags at 50 %, so it is never *better* than banking. And the job seed is pinned in `inProgress.game`, so re-opening restores the same guard draw, the same bundle partition and the same ×2 placement: **no reroll exists.** That pin defeats RELOAD-scumming; the other half is WALK-scumming, and it was free until round 1 — `endJob` logs every outcome, `jobIndexFor` counted log entries and the day's seed is `job|profile|day|jobIndex`, so one keystroke at the board (W → Leave) re-rolled the guard wing, the partition, the ×2 placement and the posted value at a cost of nothing: twelve walks gave twelve distinct boards, ×2 counts 0…5 and posted 177…279, and walking until the board showed ≥ 3 ×2 marks lifted mean posted from 225 to 319. **The day's job index now counts only jobs that answered a target** (`targets > 0`), so a walk re-posts the byte-identical board — asserted over eight consecutive walks in `tests/job-board.test.mjs` ("WALK-SCUMMING IS DEAD"). The corollary matters more: because a zero-downside call always exists, **there is no state from which a student is better off closing the app than answering one more problem.**

**(7) Draft-skipping a due review.** The 5 posted contracts are built from one priority pool. Every *critical* item (`bucket ≤ 2`, or `overdue ≥ 1 day`, or test-clamped) **that the shape has room for** is replicated into **≥ 3 of the 5** bundles, and any 3-of-5 draft therefore contains every critical in that **core**. The core is `targets − draft·u` locks (7 of a JOB-10's 10, with `u = 1` choice lock per contract — see G4), most overdue first, because a 10-target job cannot hold 14 dues: **the shape is the only thing that keeps a critical out of the core, and nothing is ever dropped.** Each of the three parts is named on the board object — `critical[]` (the core, in every draft), `criticalOptional[]` (posted as a choice lock, so a 3-of-5 draft carries 3 of the 5) and `deferred[]` (not posted tonight) — and their union is exactly the set of criticals the composer put on the Page. A critical that is not answered stays due, rises on the overdue sort and **leads the next board**: measured end to end in `tests/job-board.test.mjs` ("a target a job does not reach stays due and LEADS the next board"), which answers a real drafted union through `markItem`/`finishPage` and re-composes the day. Round-1 correction: the sentence this replaces said *every* critical due, while the board capped them at `targets`; on 57 % of drafts a critical on the Page was not in the draft, and the test measured the capped list instead of the Page. Replicated items are **deduplicated at draft time** — a card appears exactly once in the answered union, never twice — and because that changes the arithmetic the board *already printed*, the board prints the drafted total net (`posted 100 (−5 shared)`) and each contract gross. Test: all `C(5,3) = 10` drafts × 50 seeded saves = 500 cases, **core** coverage 100 % (measured against the criticals on `composePage`'s own output, not against the board's list), `critical ⊎ criticalOptional ⊎ deferred = critical(Page)`, `Σ targets(drafted) == |union|`, and the printed net posted equals the post-dedupe value for all ten drafts. (G12 #17.)

**(8) Mastery tanking.** Could you keep a make weak because STEADY forgives more there? No: `E[ρ]` at m85 r0 is 0.940 against m40 r1's 0.725 — **mastering the make is worth `+0.378` of ρ against forgiveness's `+0.163`, and it frees the crew slot** (which is scarcer now that at most 12 makes may be manned). On top of that, every thrown card costs `qual = 0` XP instead of 1.5, drops a Leitner bucket, writes an error-log entry, lowers `q̂` (which moves you off the `w·E[c]` peak), and lowers Readiness. Any `(1 − m)` term in the layer reads the **start-of-day snapshot** of `m_shown`, so today's tanking cannot pay today. Tanking is strictly dominated.

**(9) Call-tanking.** Calling 50 forever scores exactly 5.0 (credit 0 both ways) → Called 2 forever, no 95 call, guard ×0.55, and the carry ladder pays `W = 1.0`. Deliberately *mis*-calling is worse: the rule is strictly proper, so every lie has negative expected credit, and the fixed-`N` divisor means a run of bad calls is not diluted by padding.

**(10) Backcheck abuse.** A Backcheck changes the stake and nothing else — no grade, no bucket, no mastery, no error-log entry, no Rematch, **and no change to the rating credit**. Max 3 held, minted only by a day with `dues ≥ 1` all cleared (1/day) or a clean vault (1/day), unavailable on the vault. Its existence is the sharpest incentive in the design: **the dullest study action is the only renewable source of the game's only consumable.**

**(11) Risk of ruin.** Per job the maximum loss is the unbanked LOOSE, and LOOSE floors at 0. **XP, mastery, Leitner buckets, rarity tiles, Foil, trophies, the error log and Readiness are written per card by `card.js` at the moment of the clear and are never staked, never rolled back, never forfeited. `P(losing study progress) = 0` by construction, not by tuning** (`tests/job-ledger.test.mjs`: the same answer sequence inside a job and through `#/run/page` produces byte-identical `cards`, `skills`, `xp`, `errors` and `counters` — **the five keys study progress actually lives in**. `forecastLog` is NOT one of them and never was: it is Readiness' forecast trace, written by `readiness.logForecast` from `screens/run.js finish()`, and a job's `finish()` calls `state.endJob` and writes no forecast point. The same test pins that divergence in the direction it really runs; a job records itself in `game.log` (Ledger B). Nothing in `forecastLog` is study progress, so proof 11 is unaffected by its absence — but the list above may not claim it.)

### 3.8 The fixed point of the meta — and the incentive-alignment proof

A player who min-maxes this game does, in order:

1. **Bags the review block first.** Reviews pay `scope 1.25`, the highest multiplier in the game, and cold locks pay up to `×1.50` on top — but only up to their own interval, so the pay-off is for being *on time*, not for being late. *Leitner compliance is the optimal opening.*
2. **Presses tokens at the mixed equilibrium** `y_i = 1 − k/v_i`. *Interleaving across clusters weighted by test weight and overdue-ness is the unexploitable strategy.*
3. **Calls honestly.** The rule is strictly proper and the boundaries are published in Settings — and the app deliberately does **not** name the EV-max rung before the call, so the honest report has to come from the student. *Truthful self-assessment is the dominant reporting policy.*
4. **Hunts `q̂ ∈ [0.76, 0.93]` material** — the peak of `w·E[c]`, the only place the rating is earned — and stakes hardest at `q̂ ≈ 0.5`, where each call carries the most weight. *Desirable difficulty is the only path to rank.*
5. **Allocates crew by `w·(1 − m/100)`** and drives makes to `isMastered`, which requires a correct answer on a *due* review ≥ 12 h after the previous attempt. *Distributed practice across days is the only route to HELD.*
6. **Cracks the vault when `q > 3/7`.** The vault is by construction the **most-overdue tier-3/4 original you have cleared** (named on the board at the start of the job — a commitment device for free). *Tier-4 coverage, which is what the test weights.*
7. **Fixes tells.** ×1.25 makes the misconception you actually have the best-paying target on the board, and sealing it is the collection — and retires the multiplier, so the game pays you to finish the job. *Error-driven remediation is the best trade.*
8. **Stops on time.** The commitment bonus pays for ending before a declared minute or before 21:45 — and the declaration **binds** (G2/§3.9), so it is a real choice rather than a free button.
9. **On D−1, does not play.** The board posts nothing and the Night Before pays the one-time **Clean Getaway** stamp. *The min-maxer's optimal move on the last night is to not play the game.*

**The proof, in numbers.** From `mastery.updateSkill` (`m ← m + 0.35(s − m)`) and `readiness.readiness` (`R = 100(0.5M + 0.3A + 0.2C)`), one clean clear on skill *i* moves Readiness by

```
dR = 0.5 · w_i · 0.35 · (100 − m_i)/100 · min(1, n/5)     ∝   w_i · (1 − m_i/100)
```

and the game's three allocation gradients are:

| game quantity | its gradient | equals |
|---|---|---|
| wing token equilibrium | `v_i = Σ L·scope·cold` | test weight × overdue-ness = the composer's own priority |
| crew marginal value | `Δρ(m_i) · encounters_i ∝ w_i(1 − m_i/100)` | `readiness.weakSpots()`'s sort key, exactly |
| rating weight | `4q̂(1−q̂)`, **strictly decreasing in `q̂` on `q̂ ∈ [0.5, 1]`** | `(1 − m/100)` restricted to that domain |

The third row carries its domain restriction rather than hiding it: `4q̂(1−q̂)` is *not* a monotone transform of `(1 − m/100)` on `[0, 1]` — it inverts below `q̂ = 0.5`. It is monotone on `q̂ ∈ [0.5, 1]`, which is where every target the composer serves as a *stake* lives (below `q̂ = 0.5` a card is not yet answerable in one try, and the composer serves it as a `new` or `weak` item with hints on). On that domain all three are positive monotone transforms of `w_i(1 − m_i/100)`, which is `dR`. **`argmax(game) = argmax(ΔReadiness)` on the domain where the game stakes anything.** `tests/job-align.test.mjs` asserts Spearman ρ = 1 between the crew-value ordering and `weakSpots()`'s ordering over 1 000 random saves, and asserts the domain restriction explicitly rather than papering over it. There is no step in the min-maxer's list that is not also the best available study action, and the proof is arithmetic rather than assertion.

### 3.9 Commitment devices, and where Kelly stops

At the board, optionally: **`WALK AT 12:00`** or **`DONE BY 21:45`**. A declaration **binds**: at the declared minute the job **auto-bags at full value and ends**, you take **+8 % on BAGGED**, and you forfeit the chain in progress and the +10 % completion bonus if targets remain. Net of the two bonuses the honoured declaration costs 2 % plus whatever you would have pushed for — a real price for a real commitment, still **no loss framing, no red, no "you failed"**. A declaration that is not reached simply never fires. Remaining targets go straight to `3 left on Today's Page`, so **no declaration can lock a student out of studying**. (A commitment device that binds no payoff is not a commitment device, and the +8 %-or-nothing version was weakly dominant, i.e. not a decision at all — G12 #25.)

Kelly, for completeness: the at-risk fraction of the pile is `x = L·m·P/S`, and the push rule in §3.2 is exactly the statement that `x` stays under the growth-optimal fraction for the published odds; the `min(LOOSE, ·)` cap makes over-betting structurally impossible. There is **no separate stake mechanic** — three risk decisions per target would be two too many (G10).

---

## G4 Difficulty, adaptivity and flow

**One board, composed once, from the save.** `postBoard` takes NO composition options from its caller: it asks `plan.composeOpts(save)` itself and ignores any `page` it is handed. Round 2's player-feel BLOCKER is why — `screens/home.js` painted the board with `{...plan.composeOpts(save), page: act.page}` and `screens/job.js` posted it with `{now, seed, tellFor}`, so the same save on the same day with the same pinned seed `job|…|0` painted `A ASN-PLP · B VOC · C FAC2 · D ASN-ANG · E NOTE` on Home and served `A ASN-PLP · B FAC2 · C ASN-ANG · D CS-RATIO · E VOC` when the student tapped it; worse, the job's queue was the UNLOWERED one, composed with the S1 tier-4 default under a Home that was printing "13 new a day is more than a day holds — the target is 12". A board a student can read and then not get is not a projection of the save, it is two guesses. `tests/job-board.test.mjs` asserts the two call sites return byte-identical contracts.

**Nothing about selection is new.** A job calls `page.composePage(save, plan.composeOpts(save))` — the existing composer with its opener-two-reviews, rematches ≤ 3, dues ≤ 12, topological new cards, weak Variants, `spreadSkills`, `LIMITS.tier4 = 2`, `needsMet` gate, `pageMax` and `minutesMax` budgets. `page.composeBundles(save, opts)` then **partitions that queue** into 5 bundles with critical replication and reshapes it against `jobBudget(shape)`. **After the draft, the deduplicated union is passed back through `spreadSkills` and the tier ramp** (G1), so `LIMITS.sameSkillRun = 2` and the 1→4 ramp hold inside a job exactly as on the flat Page.

**What the shape does to the Page, stated plainly (round 1).** A composed Page is routinely 16–24 items and a JOB-10 is ten, so the board posts a *slice* of it and the rest stays due. The slice is `core + n·u`: the **core** is `targets − draft·u` locks that every legal draft carries (the criticals first, most overdue first, then the composer's own queue order), and each of the 5 contracts carries `u = 1` **choice lock** of its own, so a 3-of-5 draft is `core + 3` — exactly the shape's target count, with three of the five choice locks the student actually picked. Two consequences the document owes the reader: (a) the board *re-prioritises* inside the composer's queue only in that a critical due outranks a non-critical item for the core — the core is the composer's own head-of-queue, item for item, on 168 of 200 corpus boards — and it never adds, invents or removes one; (b) the choice locks are drawn from the composer's own **non-critical** work first — the new cards and weak Variants that a review-heavy night would otherwise never post — and the wings it carries: one choice lock per wing on the Page that the core missed, up to three, because G3.4's guard has no fixed point on a one-wing board. Before round 1 the pool was criticals-only-then-fill: on 33 of 50 corpus boards the composer scheduled new or weak work and the board posted **none** of it, on 7 a four-wing Page posted fewer wings than it carried (one of them a single wing, where the guard's published bar reads 1.00), and every legal draft yielded the same union on 66 % of boards — the DRAFT verb, which G1 counts among the 24 mandatory decisions, was a coin flip on the posted number. Now: 3.5 % identical, 0 wing collapses, 0 boards that post none of the composer's other work, and 99.5 % of drafts land on the shape's target count exactly (was 66 %). The mix the board posts is the mix the composer composed: over 200 boards a mean Page of 19.5 items (≈ 13 dues + ≈ 6 new/weak) is posted as a mean core of 6.8 plus 5 choice locks that are overwhelmingly the new cards and weak Variants — against a proportional share of 6.7 and 3.3. The price, stated: about three more dues per night are deferred than when the board posted ten of them, and they are named in `deferred[]`, still due, at the head of the next board. The backlog does not rot, because the core is the most-overdue dues and a deferred one only rises: 14 simulated days of one job a night take the worst overdue item from 9 days to a flat 2–4 and hold it there (`notes/board-fix.md` §3). Leitner, mastery, Readiness and XP are called by the same code paths as today, at the same moments.

**Volume comes from the study plan; difficulty comes from your rating.** Item count is `plan.qFor(save)` + dues, exactly as today. `R_player` moves the vault grade, and rank moves the guard multiplier and the call ladder — nothing else (§3.5). A stronger student answers the *same* number of problems at a harder final target, which is what keeps every shape inside COMPOSED's 10–25 minute session.

### Supply: what the packet can actually feed, per wing

The bank is 164 originals. **Renewable** via generators: CSARITH, CS-LIN, CS-RATIO, CS-QUAD, SYS, FIG-ALG, BISECT-L/Q, SEG-ALG, FAC1/FAC2, QUAD-SOLVE, QUAD-CTX, PAIRS, NOTE, CLASS, VOC (`T-vocab`). **Not renewable today:** `asn-01..36` + `qz-01..18` (54) and `def-01..14` + `fact-01..05` (19) = **73 originals with no template, hence no Variant and no `weak` role**. Against 30 runs/week × 10 targets = 300 targets, with a supply of ≤ 12 dues/day (`LIMITS.dues`) plus `q` new (≈ 11 early, 0 once the bank is cleared), the RECALL wing — which carries `Σw 32`, the largest of the four, and which the guard's `v_i` invites a third of the tokens into — empties mid-week. ASN-PLP (35 items) and ASN-ANG (24) together feed roughly **8 targets/day** at their Leitner intervals. This is a real constraint and the design states it rather than discovering it in week 2.

**Three responses, all shipped (G12 #16):**

1. **The board posts what exists.** `composeBundles` posts `min(5, available)` contracts and narrows the draft: 5 posted → draft 3; 4 or 3 posted → draft 2; ≤ 2 posted → no draft, the board says `thin board · 2 contracts · no draft`, and the debrief's decision count prints the real (lower) number. Per-wing supply is printed on the board sheet: `RECALL 8 locks available today`. **And round 2: when the posted contracts cannot span the wings, the board says so and drops the press.** `GUARD.postedSpanWings = 3` is a promise about the board, and `choiceLocks` keeps it wherever the composed Page carries three wings — but on a Page that carries one (an evening whose whole due list is ASN-ANG, which the wing weights above make ordinary) every wing in the support is certain to be taken, `pressAdvice`'s own `marginal` is `GUARD.tokenBonus · v · (1 − y)` = 0 across the board, and yet G3.4 requires `pressAdvice` to spend all three tokens somewhere — so it spent them on the one wing guaranteed to be guarded. A three-token allocation that cannot change a payoff is not one of the 24 decisions. The board now prints `one wing tonight · RECALL · no press · the 3 tokens cannot change a payoff`, recommends zero (which is the correct play), and prints `one make tonight · ASN-ANG · every contract is a slice of the same block` when all five names collapse. `board.pressMatters`, `board.wingsShort` and `board.oneMake` carry it; `tests/job-board.test.mjs` asserts both the degenerate board and that the press is still a real three-token allocation on 80 %+ of multi-wing corpus boards.
2. **One new generator, on content that already exists.** `T-asn-reason` (J5b) builds a reason-chip drill family from the **54 one-line reasons already in `data/asn.js`** — no new content authoring, no `site/content/`, no PNG, no `orig`. It renews ASN-PLP and ASN-ANG at Variant `scope 0.8`.
3. **Untemplated recall repeats are blessed and visibly unprofitable.** A `def-*`/`fact-*` original re-served inside its Leitner interval pays `scope 0.5` and the envelope says `repeat · scope 0.5`. J5 asserts no job contains the same card twice and that a 30-run simulated week never repeats a card inside its interval.

**Winnable when weak.** A Called 1 player has no 95 call, a ×0.50 guarded wing, a tier ≤ 2 vault, keeps call-50's zero-downside floor, floors at `LOOSE 0`, keeps every crew rank, and receives the full free hint ladder, the worked solution, the misconception line and the Rematch on every miss. A student who answers 10 targets at 40 % accuracy with honest 50/70 calls still bags ~90, holds rating 5.0, and — the part that matters — has **10 graded attempts, 4 bucket drops, 6 mastery updates and a Rematch queue.** The study layer pays out fully at every accuracy level; only the game's multipliers scale.

**Tense when strong.** As `q̂ → 0.95` a make leaves the informative band entirely (`w < 0.25`), so calls on it stop counting and the rating decays toward 5.0 — the only way to move it is to stake on tier-3/4, on the coldest locks, and on the two makes you actually fumble. HELD crew makes deep chains reachable, which makes the deep-pile thresholds bite harder (`call 95, c = 8: q* = 0.787`). **Called 5 requires a mean `w·c ≥ 1.95` over a full 50-call informative window** — roughly 78 % of the theoretical ceiling, sustained, on material you genuinely half-know. Attendance cannot produce it.

**Mercy, never a forced continue.** CALL IT (G1) at LOOSE 0 / chain 0 with ≥ 3 targets left. And the guard cannot take the same wing more than three jobs running (`y_i ≤ 0.75` plus a hard three-in-a-row cap, printed).

**Flow shape inside a job.** The composer's tier ramp (1 → 4), preserved through the post-draft interleave, means the chain is cheap to build early and expensive to hold late, so §3.2's arithmetic produces a tension curve with no scripting. The two brief windows land after targets 4 and 8 (`BOARD.briefAfterTargets`) — fixed indices, chosen so a ten-target job gets a breath near its thirds, and that is the whole of the claim.

**Round-2 correction, because the previous sentence was false and nothing asserted it.** This paragraph used to continue: *"…which is where the composer's role transitions land (reviews → new → weak), so the game's beats and the study structure's beats coincide instead of fighting."* They do not coincide, and they cannot: `page.js draftUnion` runs the drafted union back through `arrangeJob`, which sorts by **tier** — that is the ramp the sentence before it is about — so the composer's role blocks are deliberately scrambled and do not survive into the job at all. Measured over 400 corpus boards × every legal draft (3 556 drafts of ≥ 9 targets, `notes/board-fix.md` r2 §1): a role transition sits at the 3→4 boundary in **17.7 %** of drafts, at the 7→8 boundary in **46.7 %**, at **both** in 7.6 %, and at **neither** in 43.1 %; the roles are in blocked reviews → new → weak order in **18.0 %**; a review or rematch follows a new card in **78.5 %**; and the mean index of the last review (7.03) is *after* the mean index of the first new card (4.23). The composer's one role transition sits near item 10, not two at 4 and 8. The ramp and the role order are different orderings, the ramp wins, and the windows are placed for pacing. `tests/job-board.test.mjs` now measures this, so the coincidence cannot be quietly claimed again.

**The 19 skills and the 68 tags, concretely.** Wings partition skills (§3.4); `v_i` reads `w` from `data/skills.js` and `overdueDays` from `schedule.js`. Envelopes print the make's id **and** its student-facing name. **The tell is skill-keyed, not card-keyed**: it is the make's most-triggered unsealed, unresolved tag in `save.errors`, which is knowable before the stem and therefore printable on a face-down envelope. This is what lets ASN-PLP and ASN-ANG — 14 of the 100 skill weight, and **zero `tag:` entries in `site/data/cards/asn.js`** — carry a tell at all: the `asn` grader's tags (`overgeneralised`, `undergeneralised`, `flipped-verdict`, `wrong-reason`) land in `save.errors` after grading, and the envelope reads them back on the *next* encounter with that make. No card-data migration, no authored `misconceptions[]` on 54 cards. J7 asserts every one of the 19 skill ids can produce a tell. (G12 #15.)

**tag → wing** is derived from `data/misconceptions.js`'s own `AREAS` (comp-supp/setup/ratio → WORDS · roots/factoring → ALGEBRA · figure → FIGURES · notation/vocab/classify/reasoning → RECALL · `general` resolves to the target card's own wing), so **no new taxonomy and no edit to 68 tag records is required** — one 11-entry map in `data/job.js`. The debrief's miss lines are the existing `misconceptions.patternLine` strings, verbatim.

**Mastery is never faked.** The game writes `save.player` and `save.game` and nothing else. `Mastered` still requires `m ≥ 85 ∧ n ≥ 3 ∧ a correct due review ≥ 12 h after the previous attempt`; `m_shown = m·min(1, n/5)` still discounts thin evidence; a Mock or Boss miss still drops a mastered skill to 69 — **and when it does, that make's HELD crew drops to STEADY mid-week and the debrief says so: `FAC2 crew HELD → STEADY — the Mock says it is not held.`** The Mock stays the source of truth; the game is downstream of it. Readiness still uses `0.5M + 0.3A + 0.2C` and still goes provisional until a Mock. **A player at Called 5 with Readiness 48 sees Readiness 48 on Home, in the same ring, with `Not ready` under it. The two numbers are allowed to disagree and the app never reconciles them in the game's favour.**

---

## G5 Retention architecture

**Honest hooks, in descending strength.**

1. **Tomorrow's board is computable tonight, so it is printed tonight.** The debrief's last line is real information from `schedule.dueList(save, {now: tomorrow})`: `Tomorrow's board: 7 cold locks on ASN-PLP + CS-LIN · posted 186 · FIGURES has been safe 3 jobs running · bringing dropped-gcf, middle-term`. Not a teaser — a schedule, plus the tags it will actually bring, plus one tap to `#/run/drill` on the named weak skill. **The hook is knowing, which is the opposite of a loot box.**
2. **The regret line.** Every debrief prints the solver's optimal line against yours: `you bagged at chain 4; the threshold said push (q* 0.49, your q̂ 0.62); that cost 31.` **This is also where the EV-max call finally appears** — after the decision, where it teaches instead of instructing (Global law 6): `envelope 6: you called 85, EV-max was 70; that cost 0.3 rating.` A concrete, learnable, non-random lesson computed by `job/econ.js` from the realised order. Pure information, and the strongest teaching hook in the design.
3. **Cold crew.** Overnight, Leitner dues accumulate, so makes go cold and their own review targets are answered bare. Home draws those crew slots hollow. Bringing the crew back online is a 4-minute job and it *is* the day's spaced review. No streak coercion needed to make tomorrow matter.
4. **Your rating is live.** A number that moves on metacognition rather than time spent. It can go down, which is what makes it worth something; it recovers inside 50 informative calls (≈ 5–7 jobs) and never removes a tool.
5. **The Fault Index.** 68 tags, `resolved / triggered / days` each, sealed at 3 clean resolutions across 3 days. The one collection whose completion certificate is a list of mistakes you no longer make.
6. **The daily board** (seeded `cyrb53(dateISO)`, replacing the Daily Challenge's seeding, identical on every device) with its disclosed, per-target 1-in-6 ×2 posting — the entire, bounded, pre-marked use of variable reinforcement.
7. **Self-competition.** The Ledger extends COMPOSED's leaderboard-of-self: best bag, longest chain, best rating over 20 calls, cleanest job (no hints, no misses), vaults cracked / walked, and the same-seed ghost that already exists.
8. **Mastery.** Readiness climbing is still the real reward and the game never pretends otherwise.

**Rejected outright, with the reason.**

| rejected | why |
|---|---|
| energy / lives / job cooldowns | locks a student out of studying — the one thing a study tool may never do |
| loss-framed streak copy ("don't lose your 6!") | guilt as a retention mechanic; the streak stays `0 (best 5)` with no copy |
| push notifications, badge counts, "come back" mail | nagging; there is no server and there will not be one |
| loot boxes, hidden drop tables, post-hoc reveals | violates disclosed odds; the ×2 is marked *before* the choice |
| near-miss animation ("you were SO close to ×3") | manufactured tension; a miss prints the tell and the number |
| timed windows ("bag within 4 h for ×2") | manufactured urgency; the board is open whenever the student is |
| pay-to-skip, pay-to-hint, real money, ads, cosmetics behind a currency | nothing is purchasable, ever |
| infinite prestige / rebirth / seasons | infinite grind; there is no tree and no ladder above the terminus |
| leaderboards against strangers, named rivals that taunt | single-player, offline; the adversary is a probability table |
| daily login reward escalation | pays for attendance instead of work |
| "you'll lose your rank" warnings | rank follows a live number; a falling number is information, not a threat |
| artificially slow counters, forced animation gates | padding; the budget is six cues ≤ 600 ms |
| a job that cannot be quit | 3-second walk with a default-focused `Bag & leave` |
| **naming the EV-max call before the call** | it converts a metacognition score into an obedience score (Global law 6) |

**The study week and quiet hours — the mechanic does the work, not the copy.**

- **D ≥ 3:** the board is Home's primary action when `plan.modeFor(save) === 'page'`.
- **D = 2 (Final Sweep):** the board becomes a **REVIEW BOARD** — every contract is dues, no vault, no guard, no tokens, calls optional, ladder flat, Backchecks free. *The game frame stays because it is motivating; the gambling frame leaves because the stakes are now real.*
- **D = 1:** **no board.** `plan.modeFor` returns `night`; Home prints `No board tonight · Night Before · ~30 min · ends 21:12` and links `#/run/night`. Completing it pays the one-time **Clean Getaway** ledger stamp + 1 Backcheck — the game paying the player to stop playing it.
- **D = 0:** Test Morning, no stakes, no calls. The board shows the final ledger and `Go.`
- **Any shape whose projected end time passes 22:00 is refused** with `that ends at 22:04 — take the 7-minute RUN instead?`, one tap either way, with the real end time on both options. This is computed from the shape's own projected wall clock and the current time, not from a fixed 21:30 constant — which is why the VAULT's old 21:30 refusal was mis-set (21:30 + 25:24 = 21:55, not past 22:00). (G12 #40e.)
- **After 22:00:** no new board posts; a job in progress **auto-bags at the next target boundary at full value** with `Banked at 22:00. Nothing lost.`; continued play is allowed with **stakes and calls off** (`REVIEW · no stakes`) — you may still study at 22:40, you may not gamble at 22:40; sound is already muted by `sound.js`; the closing line is COMPOSED's existing soft close with `keep going anyway`.
- **School window (Mon–Fri 07:00–14:15):** the board posts the RUN shape only, with its end time, and says why.
- **Falling behind:** the plan redistributes silently as today; the posted numbers change; no copy about it.

Every primary button prints **cards, minutes and the wall-clock time the run ends** (`JOB · 10 targets · ~14 min · ends 20:31 · 48 % game`). That number is also an input to the vault decision and the commitment bonus, so telling the truth about time is mechanically necessary, not a courtesy. The app never says "one more?" — the debrief's primary button is `Home`, and `Another board` is the secondary.

---

## G6 Fiction, look and juice

**The theme, mapped object by object, with nothing invented.** The packet is a **building**; the sheets are its floors (`VOC · AP-1..4 · WP · ASN · FAC · ALG`); a Card is a **lock**; its tier is the lock's **grade**; its skill is the lock's **make**; its Leitner bucket is how **cold** it is (cold locks pay more — literally true, `scope 1.25`); a Variant is the same lock **re-keyed**; a misconception tag is its **tell**; a Boss is a **vault job**; the Mock is **the big score**; the Binder is the **floor plan you have already opened**. That is the entire fiction. **There is no crew with names, no backstory, no dialogue, no heist-movie quote, and the Guard is a bar chart of your own habits** — the driest possible antagonist and the one no fourteen-year-old can find embarrassing, because it is just his data. The rank ladder is `Called 1–5`, which is the rating printed as a word, not a costume.

**Drawn with the primitives the app already ships** (`js/figure/svg.js`), which is why the layer adds no illustration and no new token:

| game object | drawn as | primitive reused |
|---|---|---|
| wing | a 1 px line with the wing's Σw at its end | line + `<marker>` |
| crew r1 (STEADY) | a point mark (r 3.5 dot + label) | point primitive |
| crew r2 (HELD) | a segment with congruence ticks | `tick` primitive |
| idle / bare crew | the same mark, hollow, `--muted` | CSS only |
| the envelope | the existing paper card, face-down, dimmed to `--surface2` | paper card |
| the guard bars | three horizontal bars with printed percentages | new, 2 rects |
| LOOSE / BAGGED / chain | the header's XP+combo cluster, swapped during a job | existing header |

**Four new visual objects, and only four.**
1. **The Board** on `#/today`: up to 5 rows, monospace right-aligned payouts, 1 px rules, wing label, `~N min`, the end time, the per-wing supply line and the projected split per row. Reads like a job sheet, not a menu.
2. **The Envelope**: the paper card face-down printing make id + name / grade / cold / posted / source contract / ×2 / tell and the evidence line. Flips on call-lock, 180 ms. **No rotation.** (The 0.4° tilt was the one off-grid element in the product and contradicted S5's 8 px grid and 1 px register — G12 #31.)

> **The flip is `scaleY`, not `rotateY` — ruled at integration on notes/J12.md D1.** This sentence used to say "180 ms `rotateY`" and "**No rotation**" in the same breath, which is a contradiction, not a spec: `rotateY` *is* a rotation function. G8's J12 acceptance line is the unambiguous half ("NO `transform: rotate` on the envelope"), and `tests/job-juice.test.mjs` makes the ban structural, so the implementation flips with `scaleY(.88) → scaleY(1)`: it reads as a flip, stays on the 8 px grid, and contains no rotation function. J12's objection is recorded and accepted as reasonable — a *transient* 3-D flip begins and ends on-grid and leaves nothing rotated at rest, so the ban as worded is broader than the harm G12 #31 was written to prevent — but the ban is what is asserted, and one word in a document is not worth two tests and a visual re-review.
3. **The Guard bars**: `--muted` fills, `--warn` on the drawn wing, redrawn once per job in the debrief.
4. **The header strip during a job**: `LOOSE 131 · BAG 0 · ▮▮▮▯▯▯▯▯`. Chain ticks are 2 × 10 px, amber at 5, violet at 8, reusing the existing combo tier colours.

**The header arithmetic, which the previous draft got wrong.** `site/js/app.js` already renders **six** header items: `hdr-readiness`, `hdr-tminus`, `hdr-level`, `hdr-xp`, `hdr-combo`, `hdr-streak`. Replacing two of them with three would put **seven** items in a 375 px header. So: **during a job, `hdr-level` and `hdr-streak` are hidden** (neither moves inside a job) alongside `hdr-xp` and `hdr-combo`, and the header carries exactly **five** — Readiness · T−N · LOOSE · BAG · chain. `job-juice.test.mjs` pins the element count at five during a job and six outside one. (G12 #21.)

**Phone layout (375 px), which is load-bearing.** Board sheet 264 px sticky during the decision phases; **it collapses to a single 36 px line at call-lock** — the moment the envelope flips and the stem renders — not at input focus. A tier-3/4 diagram is *read* before it is *typed*, and a 400×260 figure plus stem plus Answer Dock plus key row does not fit under a 264 px board on a 375×667 screen. The board is only needed during DRAFT / PRESS / CALL, all of which are pre-stem. Collapsed: `RECALL ⟨2⟩ · loose 131 · ×1.8 · chain 4`. **J6 asserts the board is ≤ 36 px tall whenever a stem is in the DOM.** (G12 #22.) ≥ 1024 px: the board lives in the 320 px right rail, permanently visible. Keyboard-complete: `1–5` draft, `←/→` tokens, `C` commit, `1–4` call, `Enter` push, `B` bag, `K` crack, `W` walk, `Esc` walk-confirm. `aria-live="polite"` announces each payout, guard draw and bag.

**Animation budget: six cues, all transform/opacity, all ≤ 600 ms, all 0 ms under `prefers-reduced-motion` (colour kept).** Envelope flip 180 ms · call-lock chip snap 120 ms · loose counter tween 300 ms · chain tick fill 150 ms · guard bar redraw 250 ms · **the bag drop 600 ms**. Nothing full-screen.

**The one signature moment — THE BAG DROP.** At the getaway, after the vault resolves, the LOOSE numerals fall column by column into BAGGED: a 600 ms staggered tabular-numeral cascade (each digit `translateY(-1.2em) → 0`, 40 ms stagger), the fee line struck through if it did not apply, one soft click, and the guard bars redraw underneath. Once per job, 600 ms, in the header column, and it is **the only thing *animating* while it happens** — the debrief stays interactive underneath, because a full-screen moment here would re-open the one S9 #7 spends on the tile mint and would contradict G9 #1's "0 ms of any state where the app is neither accepting input nor showing a result" (G12 #32). **The tile mint on the Page Summary remains the product's signature and nothing here competes with it** (COMPOSED S9 #7 holds; `job-juice.test.mjs` asserts no `position: fixed` element on `body` during a job).

**Sound** (off by default, muted after 22:00, WebAudio synth in the existing `sound.js`): call-lock (520 Hz click, 40 ms) · chain tick (reuses `xp.comboPitch` = `440·2^(c/12)`) · vault resolve (330→660 on a clear, the existing 110 Hz triangle on a miss) · bag drop (descending six-note arpeggio, 300 ms). Four cues. No voice, no stings, no music.

**How it stays dry.** Enforced by a lint test over the string tables: no exclamation marks; no second-person praise; no emoji; numbers first; a miss names the make, the tell and the number and stops.

```
clear     +40 loose · chain 4 · rating +6.4 ×0.96
ladder    attempt 2 · crew STEADY forgives one · ρ 0.70 · +19 loose
miss      FAC2 · tell: dropped-gcf · −19 loose · chain 0
bag       bagged 118 · fee 13 · chain 4 → 0
guard     GUARD: WORDS.  your tokens: RECALL 2 · WORDS 1 (×0.60) · FIGURES 0
vault     FIG-ALG grade 4 · your last 10: 4/10 · crack breaks even at 0.43
walk      bagged 280 · rating 7.12 (Called 3) · 7:00 thinking / 5:29 deciding · 24 decisions
regret    you bagged at chain 4; the threshold said push (q* 0.49, your q̂ 0.62). cost 31.
regret2   envelope 6: you called 85, EV-max was 70. cost 0.3 rating.
crew      VOC crew idle — this target is its own due review
sealed    dropped-gcf sealed · tell 1.00
thin      thin board · 3 contracts · draft 2 · RECALL 8 locks available today
quiet     Board quiet · Readiness 89 · 0 due
closed    Board closed · Night Before · ~30 min · ends 22:34
call-it   stakes off · 4 targets left · hints on
```

---

## G7 Integration and build plan

### Reused unchanged (zero edits)

`site/js/grader/*` · `site/js/gen/*` (**existing files**; one new file is added — see below) · `site/js/figure/*` · `site/js/widgets/*` · `site/js/mathfmt.js` · `site/js/rng.js` (`cyrb53`, `mulberry32`, `rngFrom` seed every draw) · `site/js/xp.js` (`xpFor`, `scopeFor`, `comboTransition`, `comboPitch`, `levelFor` — read, never written) · `site/js/mastery.js` · `site/js/schedule.js` (`dueList`, `overdueDays`, `intervalDays`, `applyOutcome`, `isMastered`, `mShown`, `needsMet`, `pendingRematches`, `freezeVariant`, `clampDue`) · `site/js/readiness.js` (read-only) · `site/js/rarity.js` · `site/js/days.js` (`todayISO`, `daysUntilTest`, `isQuietHours`, `testMoment`) · `site/data/cards/*`, `data/cards.js`, `data/skills.js`, `data/modules.js`, `data/sheets.js`, `data/blueprint.js`, `data/misconceptions.js` · `site/js/screens/card.js` (**the only place a grade is written** — the job mounts its answering body as-is and must not duplicate one line of it) · `screens/night.js`, `screens/sheet.js`, `screens/binder.js`, `screens/report.js`, `screens/onboard.js`.

Per BUILD-POLICY §1 there is no `teacherKey`, no `orig`, no `site/content/` and no PNG anywhere in this layer.

### Extended (small, additive, line by line)

| file | change |
|---|---|
| `site/js/page.js` | `+ composeBundles(save, opts) → {bundles[5], critical[], supply, minutes}` (partitions the existing queue with critical replication), `+ draftUnion(bundles, picks)` (dedupe → `spreadSkills` → tier ramp) and `+ jobBudget(shape)`. **`composePage` itself is untouched**, pinned byte-identical for the same seed. |
| `site/js/screens/run.js` | one `KIND_META` entry `job: { title: 'The Job', back: '/today', mode: 'card' }` and one `DELEGATES` entry `job: { mod: './job.js', fns: ['mountJob'], fallback: 'stub' }` — the same pattern `baseline`/`night` already use. **`ROUTE_PATTERNS` stays 13**; the job is `#/run/job?seed=`. Plus the **debrief** extension to the Page Summary (owned by J6b). |
| `site/js/plan.js` | `nextAction` gains one branch: when `modeFor() === 'page'` and `settings.game !== false` and `D ≥ 2`, the primary label becomes `JOB · N targets · ~M min · ends HH:MM · S % game`; at `D = 2` it becomes `REVIEW BOARD`; at `D ≤ 1` unchanged (night/morning win). |
| `site/js/screens/home.js` | the Board panel above the primary button + the cold-crew strip, **painted in two passes** (see below). |
| `site/js/screens/app.js` | during a job, hide `hdr-level`, `hdr-streak`, `hdr-xp`, `hdr-combo`; show LOOSE · BAG · chain. Five items, pinned. |
| `site/js/screens/stats.js` | three panels: Ledger (records, both Elo numbers), Fault Index (68 cells), reliability + calibration beside the existing Mock-prediction line. Plus the crew allocation grid with the `manned ≤ min(capacity, 12)` counter. No new route. |
| `site/js/screens/settings.js` | `game` toggle (default on, one switch kills the layer), and five printed-formula panels in the style of "How Readiness is computed": **How the Call is scored** (both ladders, all indifference points, the two disagreement bands, **and the EV-max table — the one place it is allowed to appear before a call, because it is not attached to a target**), **How the Guard draws** (`y = project((1−ε)x̂ + ε·uniform, 0.75)` with the water-filling pseudo-code and the stake weighting of `x̂`), **How the payout ladder works** (ρ, crew forgiveness, the HELD chain-hold at chain ≥ 3), **How posted is computed** (`L`, scope, the capped `cold`, the live-only `tell`, ×2 at 1-in-6 per target), **How the rating is computed** (`5 + 2Σ(w·c)/50`, the `w ≥ 0.25` informative gate, and why an empty slot scores neutral). |
| `site/js/screens/boss.js` | the VAULT shape's final target delegates here; hearts, CONTINUE? and KO semantics unchanged. |
| `site/js/screens/mock.js` | **no calls, no stakes, no crew, no chain — a test is a test.** Its existing prediction slider is scored by `job/call.js credit()` and enters the rating window as one informative call **with `w = 1.0`**: it has no make and therefore no `q̂`, so the weight is defined rather than undefined, and Settings says so (G12 #40d). |
| `site/js/store.js` | `SAVE_VERSION 1 → 2`, `MIGRATIONS[1]` adds `save.player` and `save.game` with defaults; `CAPS.game = { calls: 50, log: 30, tags: 68, bundles: 5 }`; `KEPT_KEYS += 'player'`, `ARCHIVED_KEYS += 'game'`. |
| `site/js/sound.js` | four cues appended to `CUES`. |
| `site/data/templates.js` | **one new entry**, `T-asn-reason`, pointing at the new generator (J5b). This is the only content-adjacent edit in the layer. |
| `site/data/trophies.js` | six pure predicates: `crew-held` (every wing has a manned, non-idle crew mark at board time), `index-25`, `index-68`, `chain-8`, `calibrated` (rolling Brier ≤ 0.10 over 20 informative calls), `clean-getaway`. |
| `site/css/screens.css` | one appended `/* === G-job === */ … /* === /G-job === */` block per BUILD-POLICY §2. |
| `site/index.html` | **one line**: `<link rel="stylesheet" href="css/job.css">`. (The file was linked from nowhere in the previous draft — G12 #28.) |
| `site/sw.js` | the new files added to the precache list (`sw.test.mjs` enforces it). |

**Home paints the board in two passes** (G12 #20). `tests/home-r2.test.mjs:147-148` asserts Home has **no static import** of `page.js` or `plan.js` — they carry 233 KB of cards and 311 KB of generators, and that test exists because S9 #1's paint budget already fails at 2.8 s. So a board that needs `composePage` cannot be painted "from save state alone":

- **Pass 1 (static, from `store` + `schedule` + `save.game.log`):** contract labels, lock counts, cold days, wing labels, `~N min`, the end time, the projected split, per-wing supply. All derivable from `save.cards` and `dueList`, which Home already imports.
- **Pass 2 (after the dynamic `page.js` import, on the same frame budget as the existing primary button):** the `posted` numerals tween in, in place.

J13 asserts **no layout shift between passes and no spinner** — the numerals occupy their final width as `--muted` placeholders in pass 1 — rather than the unimplementable "no import".

### New files — every one under `js/job/` is DOM-free and Node-testable

```
site/js/job/econ.js    LOOT, LADDER, CHAIN, FEE, TELL, COMPLETION, COLD
                       carryFor(target, call, chain, rungs, crew) · missFor(…) · bagFee(s)
                       chainAfterBag() · chainAfterTarget(rung, crewRank, chain)
                       pushMinusBag(state) · breakevenQ(state) · rhoFor(rung, rank) · regretLine(order)
site/js/job/call.js    CALL_LEVELS, credit(p, ok), weightFor(qHat), INFORMATIVE_MIN = 0.25,
                       ratingFrom(calls, N = 50), rankFor(rating), evTable(q), argmaxCall(q),
                       qHatFor(save, skillId)        // argmaxCall is Settings-and-debrief only
site/js/job/guard.js   WINGS, wingOf(skillId), wingOfTag(tag), wingValues(save, queue),
                       guardDist(save, eps, cap), project(y, cap), drawGuard(dist, seed),
                       pressAdvice(dist, values), elo(rp, rh, outcome), vaultGradeFor(rPlayer)
site/js/job/crew.js    capacityFor(save), MANNED_MAX = 12, COSTS = {STEADY: 1, HELD: 2},
                       allocate(save, make, rank), forgivenessOf(save, make),
                       isIdleFor(save, make, target), crewValue(save, make, shape)
site/js/job/board.js   SHAPES, postBoard(save, today), draftFrom(bundles, picks), declinePrice(n),
                       buildJob(save, opts) → inProgress.game, vaultFor(save)  // most-overdue tier-3/4
site/js/job/state.js   the machine: board → envelope → call → answer → payout → bag/push → brief →
                       getaway → debrief; applyTarget(), bag(), crack(), walk(), callIt(),
                       backcheck(), commitBind(); serialises to inProgress.game
site/js/job/index.js   the 68-tag Fault Index: resolve(), trigger(), sealedOf(), areaRollup(),
                       tellFor(save, skillId)        // most-triggered unsealed unresolved tag
site/js/gen/asn-reason.js   NEW generator: reason-chip drills from data/asn.js's 54 reasons (J5b)
site/js/screens/job.js the only DOM file: board sheet, envelope, call row, mounts card.js's answering
                       body, payout line, bag/push, brief sheet, getaway
site/data/job.js       SHAPES, LOOT, LADDER, CALL ladders, RANKS, WINGS, AREA→WING map, copy tables
site/css/job.css       board rows, envelope, chain ticks, guard bars   (linked from index.html, 1 line)
tests/job-econ · job-call · job-guard · job-crew · job-board · job-state · job-split · job-supply
tests/job-exploit · job-monotone · job-ledger · job-align · job-save · job-coldopen · job-copy
tests/job-debrief · job-juice · job-week
```

### Save-schema delta (v1 → v2), **two** new top-level keys

The previous draft sent `game.rating`, `game.rank`, `game.elo` and `game.ledger.records` to `KEPT_KEYS` and `game.crew`, `game.tags`, `game.heat`, `game.log` to `ARCHIVED_KEYS`. **`site/js/store.js:191-205` archives top-level keys only** (`for (const k of ARCHIVED_KEYS) entry[k] = save[k]`); there is no sub-key path support. So the split is expressed as two top-level keys, one rename, zero new machinery (G12 #19):

```js
// KEPT_KEYS — measures the student, survives the unit handoff
player: {
  rating: { calls: [ {p, ok, w, skill, at} ], value: 5.0, n: 0 },   // calls capped at 50   ≈ 3.2 KB
  rank: 2,
  elo:   { player: 1000, house: 1000 },
  records: { bestBag: 0, bestChain: 0, bestRating20: 0, cleanJobs: 0, cracked: 0, walked: 0,
             cleanGetaway: false }
}

// ARCHIVED_KEYS — measures THIS unit's skills and errors
game: {
  crew:  { 'FAC2': 1, 'NOTE': 2 },                          // make → rank, ≤ 12 manned   ≈ 0.2 KB
  heat:  { press: { RECALL: 0, FIGURES: 0, WORDS: 0, ALGEBRA: 0 }, weight: 0, jobs: 0 },
  tags:  { 'dropped-gcf': { resolved: 4, triggered: 1, days: 2, lastDay: '2026-09-17',
                            cleared: true, sealed: false } },        // ≤ 68                ≈ 6.1 KB
  backchecks: { held: 2, mintedDay: '2026-09-17' },
  ledger:{ jobs: 0, tGame: 0, tAnswer: 0, phaseMeans: { board: 18, guard: 12, brief: 20,
                                                        getaway: 25, debrief: 65 },
           debriefAt: null },                              // rolling, last 5 · + the open debrief's stamp
  log:   [ { day, shape, targets, bagged, posted, rating, guard, cracked, tGame, tAnswer } ],  // ≤ 30
  commit:{ kind: null, byMin: null, honored: 0, bound: false }
}
// and, for kind 'job':
inProgress.game  = { shape, seed, bundles, picks, tokens, guard, loose, bagged, chain,
                     calls: [], briefs: [], vault, tGame, tAnswer, phase, phaseAt,
                     stakes, outcome, locked, posted, bc, last, ph, rating0, quiet }
inProgress.bench = [ { ...queueItem, from, sources, wing, posted, basePosted, x2,
                       critical, declined } ]              // the undrafted contracts, at their declined price
inProgress.queue = [ { ...pageQueueItem, from, sources, wing, posted, x2, critical } ]
                                                           // + basePosted, declined on a swapped-in entry
trophies         = { …, 'crew-held', 'index-25', 'index-68', 'chain-8', 'calibrated', 'clean-getaway' }
```

**`ledger.debriefAt`** is the instant `endJob` opened the debrief. `closeDebrief` folds `now − debriefAt` into `phaseMeans.debrief` — the one phase mean the job that opened it cannot measure, because `g.ph.debrief` is 0 by construction at that instant (G1 statement 2: *both numbers are measured, not claimed*). It is a declared, coerced key and a priced one: it shipped for a round as an undeclared pass-through of `normalizeGame`'s merge, which is exactly the drift `tags[].days` was caught for.

**`inProgress.queue` and `save.trophies` are SHARED keys the layer ADDS FIELDS TO**, which is why they are budgeted as deltas and not as whole keys. `composePage` writes a queue item; `page.draftUnion` — the job's own composer — spreads it and adds `from, sources, wing, posted, x2, critical`, and `state.swapIn` splices in bench entries carrying `basePosted, declined` as well. A `settings.game = false` page never produces one of them, so by the same rule that moved `inProgress.bench` they are the layer's bytes. The same holds for the six trophies at `data/trophies.js:308-334` (`crew-held`, `index-25`, `index-68`, `chain-8`, `calibrated`, `clean-getaway`): every one of their predicates reads `ctx.save.player` / `ctx.save.game` and nothing else, so only a job can earn them, and `js/trophies.js` writes `save.trophies[id] = { at }` into a top-level study key.

**`inProgress.bench`** is the GAME layer's third key on `inProgress` — `page.startPage` does not write it, `job.startJob` does, so it is part of the addition this section budgets and not part of the study layer. `benchFor` spreads a whole composed queue item per undrafted target (the swap has to re-price and re-queue a real target, and a cached board would not survive the reload G3.7 proof 6 requires), so it is ~370 B an entry, not a price tag.

**`tags[].days` is a count plus a last date, not an array.** An uncapped `days: [...]` array was the single largest error in the old budget: 68 tags × up to 20 ISO dates × 13 bytes ≈ 18 KB on its own, against a claimed 4.8 KB. Sealing needs a count and a last date and nothing more. `CAPS.game = { calls: 50, log: 30, tags: 68, bundles: 5, heat: 10 }` caps the rest. (G12 #18.)

**The measured budget — every figure below is a byte count `tests/job-save.test.mjs` prints, not an estimate.** *(Restated at the round-2 save audit; the round-1 restatement it replaces is described below. Stated ceilings are the measurement rounded up to 0.1 KB, are mirrored in `data/job.js` `SAVE_BUDGET_KB`, are asserted AT OR UNDER per line, and SUM to the headline.)*

| key | measured | stated ceiling |
|---|---|---|
| `player.rating.calls` 50 × ≤ 74 B (`callEntry`'s widest: `w` at 6 dp, the longest make id) | 3.63 KB | — |
| `player` (rank, elo, records) | 0.28 KB | — |
| **`player` total** | **3.92 KB** | **4.0 KB** |
| `game.tags` 68 × 122 B (27-char ids, the longest in `data/misconceptions.js`) | 8.10 KB | — |
| `game.log` 30 × 181 B (`rating` is `ratingDetail().value`, unrounded) | 5.30 KB | — |
| `game.heat.window` 10 × 72 B (the stake-weighted press window G3.4's `x̂` reads) | 0.70 KB | — |
| `game.crew` / `heat` / `backchecks` / `ledger` (incl. `debriefAt`) / `commit` | 0.72 KB | — |
| **`game` total** | **14.84 KB** | **14.9 KB** |
| `inProgress.game`, a 12-target job live (5 bundles, **36 calls**, all 25 `STATE_KEYS`) | 6.27 KB | **6.3 KB** |
| `inProgress.bench`, the undrafted contracts at their declined price (4 × ~473 B) | 1.85 KB | **1.9 KB** |
| `inProgress.queue` `+{from, sources, wing, posted, basePosted, x2, critical, declined}` × 36 entries | 4.39 KB | **4.4 KB** |
| `trophies` — the six ids only a job can earn, 6 × ~33 B | 0.19 KB | **0.2 KB** |
| **subtotal — what the layer costs TODAY** | **31.46 KB** | **31.5 KB** |
| `runs[]` `+{bagged, posted, ratingDelta, guard, cracked, tGame, tAnswer}` × 40 — **reserved, see below** | 5.35 KB | **5.4 KB** |
| **total added, stated with margin** | **36.84 KB** | **≤ 37.1 KB** |

> **The `runs[]` line is a RESERVED ceiling, not a shipped cost.** No path in `site/` *writes* those seven fields today — `job-save.test.mjs` "THE RESERVED LINE IS STILL RESERVED" scans every module under `site/`, **comment-stripped**, for a write of `ratingDelta`, the one of the seven nothing else could produce. Until one appears, **the layer's real cost is the 31.46 KB `subtotal`**, and the suite asserts both numbers on every run so the difference can never go quiet again. Note what this does NOT depend on: whether a finished job pushes a `runs[]` record at all. A record without the seven fields is an ordinary page record and costs the STUDY layer's bytes, so the job screen starting to record itself (the fix requested in `notes/save-fix.md`, which G9 #8's byte-identity claim needs) moves nothing in this table.

> **Why the figure moved from 26 KB to 31.6 KB, and why it was wrong before.** Round 1 caught that the table had been written before `inProgress.game` existed and was measured against a `_helpers.mjs` literal missing 8 of the serialiser's keys; it pinned the fixture as a FIXED POINT of `js/job/state.js` `serialize()` and re-measured at 25.69 KB. That fixed the SHAPE. The VALUES were still hand-typed, and round 2 found four of them narrower than the shipped writers emit — `rating: 7.1234` where `call.ratingDetail()` returns `6.685919999999999`, `elo: {player: 1187.5}` where `guard.elo()` returns `1113.257822343893`, `w: 0.2549` where `callEntry` rounds to 6 dp (`0.888889`), and a skill cycle shorter than the longest make id. Rebuilt off the writers, the same carrier measured **26.33 KB against a published ≤ 26 KB that carried 313 B of margin** — false by 340 B, with every assertion green (`scratchpad/save-fix-r2/verify-critic.mjs` reproduces both numbers off the round-1 fixture, kept beside it). Three real costs were also missing: `inProgress.game.calls` was priced at the **12 drafted targets** where a call is written per **answered** target and requeues plus brief-window swaps carry it well past that; `inProgress.bench` (~1.9 KB) was never priced at all and `withoutGameKeys` charged it to the STUDY half; and `ledger.debriefAt` was written by every job end and declared nowhere.
>
> **Why it moved again at round 3, from 31.6 KB to 37.1 KB.** Three more lines, each the same mistake one level deeper than the last fix reached. **(a)** The 8 fields the layer adds to every `inProgress.queue` entry were in no fixture and no row — one carrier wrote `queue: []` and the other 24 synthetic study-only items — so `withoutGameKeys` charged 4.4 KB to the STUDY half and the addition counted none of it. **(b)** The six trophies only a job can earn (199 B) were in neither half for the same reason. **(c)** The `calls` figure was not a measurement at all: `job-save.test.mjs`'s corpus called `brief(save, { swap: o[0].id })` where `state.brief` takes `{ swap: { id } }` and ignores anything else, so "260 seeded jobs that **take every swap**" took none and the 23 it reported was the maximum of jobs whose queue could not grow. Real JOB12s reach **28**, against a line that priced 26 with 61 B of slack. The count is therefore no longer observed but DERIVED: every queue entry is answered at most twice (`page.MAX_REQUEUE = 1`, and a re-queued copy carries `requeued: 1`), the only other growth is the declined contracts `swapIn` splices in, so `queue ≤ 2 × (drafted + bench) = 36` and `calls ≤ queue`. `job-save.test.mjs` asserts each link of that chain against the corpus, and asserts that the corpus actually takes swaps.
>
> Two rules now hold instead of a number. **(1)** Every leaf a shipped writer leaves unrounded is priced at the widest JSON form a finite double can take — 24 characters, 25 signed — so no writer can exceed it. **(2)** `job-save.test.mjs` drives a seeded corpus of REAL JOB12s through `startJob → applyTarget → crack` and fails, naming the leaf, if anything the shipped code writes is wider than the fixture prices it — and it measures the `calls`, `locks` and `bench` COUNTS separately, because round 1's `inProgress.game` line passed only by over-pricing one axis (5 × 12 locks, where a real board posts 33) by about as much as it under-priced the other.

Against COMPOSED S6's **restated** arithmetic — T01's **500 000-char** bound on the saturated study layer and a **528 KB** total budget (COMPOSED.md S6, corrected at integration and restated again at the round-3 save audit; the old "≈ 210 KB worst case, 250 KB budget" priced a card at 300 B and is superseded) — the total bound is **500 000 + 37.1 KB ≈ 525 KB, closing with ≈ 3 KB to spare**. `state.test.mjs`'s worst-case builder carries the game keys **with a job in progress, its bench, its real drafted queue and its trophies**, so both halves stay machine-checked: it measures `536 191 chars = 498 463 study + 37 728 game`. J10 asserts ≤ 37.1 KB added. (The old "≤ 13 KB" was unreachable and would have shipped a red test on day one.)

> **Open, and not this layer's to close:** the study half now measures 498 463 against T01's 500 000, i.e. ≈ 1.5 KB of slack, where it used to read 480 409. Nothing about the study layer grew — its worst-case carrier stopped under-pricing `inProgress.queue`, which T01 measured as 24 synthetic items (~2.1 KB) and which a real Page answered to the end reaches 43 entries and ~14 KB on. The bound is T01's and the re-measurement is recorded for its owner in `notes/save-fix.md` round 3 §Requests.

> **Why 25 → 26, ruled at integration** (kept for the record; the ceiling is now 37.1 KB for the reasons above). `game.heat.window` is `guard.pushHeat`'s own schema (notes/J3.md §5.5 asked J10 for it) and it was not on the table when the 25 KB line was written: `guard.xHatFrom` reads the last `GUARD.xHatWindowJobs = 10` jobs' press and posted, which is what makes G3.4's `x̂` a stake-weighted estimate rather than an all-time average, so the window is load-bearing and cannot be dropped.

### Today's Page ↔ jobs

**One queue, two skins.** Today's Page remains the source of truth for *what gets answered*. A job draws its board from `composePage`'s queue, writes to the same `inProgress.queue`/`idx`, and marks items through the same `markItem` / `requeueReview` / `finishPage` calls. Bag a job at 7 of 12 items and Home says `5 left on Today's Page`, offered as the calm page — answering them there is equally valid and pays identical XP, mastery and Leitner. The Page Summary becomes the **debrief** (same screen, same tile mint, same skill bars, same Readiness delta, plus the bag drop, the rating delta, the guard redraw, the regret lines, the split and the decision count). With `settings.game = false`, `#/run/page` is exactly what it is today and Home's primary button reads `RUN NEXT · 6 reviews + 8 new`. **Every study route, every grader, every schedule rule and every number in Readiness behaves identically with the layer on or off**, and `job-ledger.test.mjs` proves it byte-for-byte.

### The existing product, in the new frame

| COMPOSED object | in THE JOB | what changed |
|---|---|---|
| **Today's Page** | the board's supply. `composePage` runs first and owns what is studied; `composeBundles` partitions it and `draftUnion` re-interleaves the draft | nothing about composition, order constraints, caps or the seed |
| **Readiness** | printed unmodified as the hero number on Home and on the board's header | nothing. No game term enters `readiness.js`, and the two numbers may disagree in public |
| **Leitner review** | **coldness.** Dues pay `scope 1.25` and `cold ≤ 1.50` scaled by the card's own interval; a make's crew stands down on its own due review; clearing every due on a day with dues mints the day's Backcheck | nothing about intervals, the test clamp, frozen Variants or re-queue |
| **The 7 Bosses** | the **VAULT** shape's final target when `page.bossReady(save)` fires; `screens/boss.js` runs it | nothing: 3 hearts, no hints, CONTINUE? with the check question, KO keeps XP/mastery/tiles, `*` flag, same-seed ghosts |
| **The Mock** | **the big score.** No calls, no stakes, no crew, no chain — a test is a test. Its existing prediction slider is scored by `call.credit` and enters the rating window as one informative call at `w = 1.0` | nothing about the blueprint, the timer, flags, the question map, autosave or the report |
| **Night Before (D−1)** | **no board.** `No board tonight · Night Before · ~30 min · ends 21:12` Completion pays the Clean Getaway stamp + 1 Backcheck | nothing about the four blocks, the elite ≥ Bronze rule, the cheat sheet or the 22:00 soft close |
| **Test Morning (D)** | the board shows the final ledger and `Go.` | nothing |
| **Rarity, Foil, Platinum, the Binder** | unchanged and still the app's collection; the Fault Index sits beside it, measuring a different thing | nothing; the tile mint stays the signature moment |
| **Streak, trophies, XP, levels** | unchanged; crew capacity is a function of `xp.levelFor` and boss stamps | nothing; six new trophy predicates are added |
| **BLITZ, Drill 5, JUMP, Full 36, Daily, Upgrade, Missed** | unchanged and pay **zero carry and zero rating** — that is what makes re-farming impossible | nothing |

---

## G8 Build plan

Ordered tickets. Each is one sitting for one agent; `node --test tests/` must be green after every one; each ends by writing `notes/<id>.md` per BUILD-POLICY §2. Later tickets import earlier ones, so the order matters. Every file under `js/job/` is DOM-free and imports nothing from `screens/`, so the whole game layer runs headless under `node --test` — the same discipline as the graders.

**15 tickets: J1–J13, plus J5b and J6b.**

| # | ticket | files owned | acceptance |
|---|---|---|---|
| **J1** | Economy core | `js/job/econ.js`, `data/job.js`, `tests/job-econ.test.mjs` | both loot/minute rows equal 12.0/12.0/12.7/14.0 and 8.2/9.5/10.9/12.5 and both are monotone non-decreasing; the ρ ladder and `rhoFor(rung, rank)` reproduce the G2 `E[ρ]` table (0.940/0.972/0.989 · 0.746/0.853 · 0.562/0.725) to 3 dp from `LADDER` alone; `chainAfterBag()` returns 0 and `pushMinusBag` uses `m = 1` in the BAG branch; the two worked rows reproduce (−40, +90.96) and the §3.2 deep table to 3 dp; the shallow-pile `q*` is 0.9 at `c = 0` for every `L`; `cold` is capped at 1.50 and equals 1.50 for both (bucket 1, overdue 1) and (bucket 5, overdue 14); `tell` is 1.00 once `cleared` or `sealed`; the ≥80 %-of-peak band of `w·E[c]` is `[0.763, 0.925]` and its peak is at `q̂ = 0.854`; **no assertion anywhere names a 0.52–0.63 growth band**; LOOSE floors at 0; `regretLine` equals the optimal-play value for the realised order |
| **J2** | Call ladder + rating | `js/job/call.js`, `tests/job-call.test.mjs` | `argmaxCall(q)` matches the EV table at q = .50/.60/.70/.80/.90/.95; indifference at .600/.778/.882 (carry) and .600/.775/.900 (Brier); propriety by grid search over `p ∈ [.5,.99]` for 99 values of q; `weightFor(.97) ≈ .116` and `weightFor(.933) ≈ .250`; only `w ≥ 0.25` calls enter the window; `ratingFrom` divides by **N = 50**, not `Σw`, so 50 farmed `q̂ = .97` calls yield **exactly 5.00** and 50 truthful `q̂ = .85` calls yield 9.99 ± .02; calling 50 forever gives exactly 5.0; **a grep over every pre-call template asserts no surface contains `argmaxCall`, `EV-max` or `evTable`** |
| **J3** | Guard + Elo | `js/job/guard.js`, `tests/job-guard.test.mjs` | the four wing weights sum to 100 and partition the 19 skills exactly; `project` returns `(0.750, 0.125, 0.125)` for `x̂ = (1,0,0), ε = .10, n = 3` and `(0.75, 0.25)` for `n = 2`, sums to 1.000 ± 1e-9 in 10⁴ random cases and terminates in ≤ n−1 passes; `drawGuard` deterministic per seed; a 500-job best-response simulation converges to `y = (.60,.40)` for `v = (30,20,10)` ±0.03 and to uniform for equal `v`; `x̂` is stake-weighted and no single job exceeds 25 % of the window (a 3-RUN + 1-VAULT farm moves `x̂` by < 0.08); `wingOfTag` covers all 68 tags via the 11 AREAS; Elo symmetric, K = 24; **two simulated win streaks raise `vaultGradeFor` and two loss streaks lower it**; flow control moves `R_player`, not `R_house`; three-in-a-row guard cap holds |
| **J4** | Crew | `js/job/crew.js`, `tests/job-crew.test.mjs`, `tests/job-align.test.mjs` | `capacityFor` = `8 + floor(level/2) + stamps`, range 8–22; `manned ≤ min(capacity, 12)` and at capacity 22 the maximal legal build is 10 HELD + 2 STEADY with 7 makes bare; **no allocation exceeding capacity or the manned cap is reachable through `allocate()`** (property test over 10⁴ random call sequences); HELD refused unless `mastery.isMastered`; crew is idle **only** on a target that is its make's own due review, and forgives normally on every other target of that make in the same job; the chain-hold fires only at chain ≥ 3 and only on non-clean outcomes; `m̄`, `e_forgiven`, `e_held`, `P(chain ≥ 3)` and `Σm_saved` measured from `composePage` + `composeBundles` over 1 000 seeded saves and a 10⁴-job simulation, of which **`m̄` on RUN / JOB-10 / JOB-12 lands within ±15 % of the G2 table — three cells of twenty, and the count itself is asserted** (every other cell carries a bounded deviation and a ±2 % regression pin), and **the argmax of the 4×2 matrix is STEADY on RUN and HELD on JOB-10 / JOB-12 / VAULT**; **Spearman ρ = 1 between `crewValue` order and `readiness.weakSpots()` order over 1 000 random saves**, with the `q̂ ≥ 0.5` domain restriction asserted explicitly |
| **J5** | Board + bundles | `js/page.js` (`composeBundles`, `draftUnion`, `jobBudget`), `js/job/board.js`, `tests/job-board.test.mjs` | all 10 drafts × 50 seeded saves contain 100 % of the critical **core** — measured against the criticals on `composePage`'s own output, with `critical ⊎ criticalOptional ⊎ deferred = critical(Page)` and every deferred due still on the next Page, ahead of every non-critical item; **`composePage` is pinned by 400 digests (saves 0…399) and is byte-identical to pre-ticket EXCEPT where J5b's own new template is drawn — one save in 400, named with its pre-ticket digest; unregister `T-asn-reason` and all 400 reproduce `git archive HEAD` exactly, which is what "the study layer is untouched" means and what the suite asserts** (round 3: the pin was fifty digests under the words "byte-identical to pre-ticket", and the first divergence J5b itself caused is at save 102, so fifty could not see it); **`draftUnion` dedupes (`Σ targets(drafted) == |union|`, no card twice in a job) and the board's printed net posted equals the post-dedupe value for all `C(5,3) = 10` drafts**; the drafted queue satisfies `LIMITS.sameSkillRun ≤ 2` **always — no make holds more of a drafted queue than `runCapFor(targets)` can spread, so an order under the cap always exists** — and a monotone 1→4 tier ramp **wherever a monotone run-safe order exists at all, over EVERY SHAPE × 400 seeded saves × every legal draft (15 984 drafts), not 400 boards of one shape** (round 3: the wide loop posted no shape argument, so `shapeFor` served only JOB and VAULT and the RUN the school window posts every weekday was unasserted — and broken, at save 69); **the primary button is G1's own: shape · the drafted letters · targets · `posted N (−M shared)` · minutes · end time · % game, and it is `COPY.primary` plus those two segments so the copy file and the board cannot drift apart**; the 5 posted contracts span ≥ 3 wings **whenever the composed Page carries 3** and every legal 3-of-5 draft spans ≥ 2; **every legal draft serves the shape's target count exactly (99.5 % of drafts; ±1 otherwise), and the five contracts differ — `everyDraftIdentical` on 3.5 % of boards, where the Page is too thin to feed a choice lock per contract**; a thin queue posts `min(5, available)` contracts and narrows the draft; `vaultFor` returns the most-overdue cleared tier-3/4 original and is seed-independent across 10 seeds; declines re-price at +0.15; **the ×2 lands independently at `p = 1/6` per target (1/6 ± 0.01 over 10⁴ day seeds), seeded per `dateISO|jobIndex|targetIndex`, and is marked before the call** |
| **J5b** | RECALL supply | `js/gen/asn-reason.js`, `data/templates.js` entry, `tests/job-supply.test.mjs` | `T-asn-reason` generates from the 54 existing one-line reasons in `data/asn.js` with no new authored content, no `orig`, no PNG; it registers through `templatesForSkill` for ASN-PLP and ASN-ANG and pays `scope 0.8`; a 30-run simulated week never repeats a card inside its Leitner interval; an untemplated `def-*`/`fact-*` repeat inside its interval pays `scope 0.5` and the envelope prints `repeat · scope 0.5`; per-wing supply is computed and printed on the board |
| **J6** | Job screen | `js/screens/job.js`, `js/screens/run.js` entry, `js/app.js` header swap, `css/job.css`, `index.html` link | a full 10-target job at 375×667 with the keyboard open, no horizontal scroll; **the board collapses to one 36 px line at call-lock, and J6 asserts the board is ≤ 36 px tall whenever a stem is in the DOM** (iOS Safari **and** Android Chrome); **the header carries exactly five items during a job and six outside one**; route count still 13; **the sealed envelope never renders the stem before call-lock, and no pre-call node contains the EV-max rung (both asserted in the DOM test)**; keyboard-complete; `aria-live` announces payout/guard/bag; focus rings visible; both themes ≥ 4.5:1 |
| **J6b** | Debrief | `js/screens/run.js` Page Summary extension, `tests/job-debrief.test.mjs` | the bag drop plays once per job and nothing else animates during it; both regret lines equal `econ.regretLine` / `call.argmaxCall` for the realised order; the split, the decision count and the two accumulators print; **the tile mint, skill bars and Readiness delta are byte-identical to the flat-path Page Summary with the layer off**; the Fault Index deltas and the guard redraw render with no layout shift; the debrief stays interactive during the bag drop |
| **J7** | Fault Index + Backchecks + meta surfaces | `js/job/index.js`, `screens/stats.js`, `screens/settings.js`, `data/trophies.js` | all 68 tags present and grouped by the 11 AREAS; sealed requires 3 clean resolutions on 3 distinct days with no trigger in the window; `tellFor` returns a tag for **every one of the 19 skill ids**, including ASN-PLP and ASN-ANG, from `save.errors` alone with no card-data change; `resolve()` sets `cleared` and drops `tell` to 1.00 the same tick; **a Backcheck changes stake only — bucket, mastery, error log, Rematch AND the `calls[]` rating entry are byte-identical to an unshielded miss**; mint requires `dues ≥ 1 ∧ all cleared`, cap 3, none on the vault; **every probability visible in the game has a Settings panel printing its formula**; Readiness on Home is byte-identical with the layer on and off for the same save |
| **J8** | Split measurement | `tests/job-split.test.mjs`, `qa/job-clock.mjs` (dev-only Playwright), the debrief line | a scripted default-path 10-target walkthrough yields 43.2 % ± 5 and a full-use walkthrough 51.3 % ± 5; **the split printed on the board before the job matches the split the debrief HEADLINES within 5 points on all four shapes, on both paths, and on a shape the ledger has never seen** (the projection reads `save.game.ledger.phaseMeans` and spends them on THIS draft's own tiers and windows; a zero-target walk is not one of "your last N jobs"; on job 1 it falls back to the shipped defaults, labels itself `projected`, and is published as up to 7 points low on a full-use path); `tGame`/`tAnswer` use wall-clock `Date.now()` deltas and survive a `visibilitychange`; the debrief prints the decision count (24 mandatory / 35 full) and `0 ms` of any state where the app is neither accepting input nor showing a result; **no assertion anywhere requires a constant 45–55 % band** |
| **J9** | Anti-exploit suite | `tests/job-exploit.test.mjs`, `tests/job-monotone.test.mjs` | the eleven proofs of §3.7 as assertions: 200 mastered-tier-1 jobs leave `rating == 5.00` exactly and loot/hour below the mixed baseline; the 400-day decay simulation is monotone non-increasing; **total weekly loot is monotone increasing in review compliance** (the capped `cold`); **a save that deliberately triggers 68 tags earns less over a simulated week than an honest one** (the live-only `tell`); no `js/job/*` write reaches `xp`/`skills`/`cards[*].bucket\|rarity\|foil`/`errors`/`forecastLog` (module-level spy); clear ≥ miss in both currencies over 10⁴ random states; **all 2ⁿ outcome vectors for n ≤ 11 under optimal play are monotone in clears on every shape the composer deals, with BAG resetting the chain** (§3.7(2)'s scope; the bounded exception off the dealt shapes is asserted too); bag-and-continue ≥ bag-and-quit in 10⁴ states; a job replayed with every `ms × 10` is byte-identical; a tanked save scores less over a simulated 5-job week |
| **J10** | Save, offline, mid-job reload | `js/store.js` migration, `tests/job-save.test.mjs`, `sw.js` list | v1 → v2 adds `player` and `game` with zero data loss and is idempotent; a corrupt `player` or `game` object is discarded to defaults without touching the rest of the save; **the worst-case save with a 12-target job in progress adds ≤ 37.1 KB (measured 36.84 KB, of which 31.46 KB is what the app writes today) and the total stays under COMPOSED S6's restated 528 KB budget (measured 536 191 chars)**; **every line of G7's budget table is asserted at or under its stated figure and the lines sum to the headline; the `inProgress.game` fixture is asserted to be a fixed point of `js/job/state.js` `serialize()` AND no narrower, leaf by leaf and count by count, than a seeded corpus of real JOB12s driven through `startJob`**; `tags[].days` is a number and `CAPS.game` holds all four caps; **killing the tab mid-job restores loose / bagged / chain / calls / guard / tokens / crew / idx exactly and the pinned seed cannot re-roll the guard, the bundles or the ×2**; airplane mode after one load runs a full job start to finish; **`KEPT_KEYS` contains `player` and `ARCHIVED_KEYS` contains `game`, both top-level, verified against a stub Unit-1B data set through the real `archiveUnit`** |
| **J11** | Week, quiet hours, Mock and boss | `plan.js` hooks, `screens/home.js`, `screens/mock.js`, `screens/boss.js`, `tests/job-week.test.mjs` | D = 2 posts the REVIEW BOARD (no vault, no guard, flat ladder); D = 1 posts nothing and links `#/run/night`, and Clean Getaway pays the stamp + 1 Backcheck; D = 0 posts no stakes; after 22:00 no board posts, a job in progress auto-bags at the next target boundary at full value, continued play has stakes and calls off; **any shape whose projected end time passes 22:00 is refused with the one-tap alternative and the real end time — computed, not a 21:30 constant**; Mon–Fri 07:00–14:15 posts RUN only; a **bound** COMMIT auto-bags at the declared minute, pays +8 %, forfeits the completion bonus, and sends the rest to Today's Page; the Mock has no call, stake, crew or chain node in the DOM and its prediction scores through `call.credit` at `w = 1.0`; a vault boss keeps 3 hearts, CONTINUE? and KO semantics |
| **J12** | Copy, juice and a11y lint | `tests/job-copy.test.mjs`, `tests/job-juice.test.mjs`, `css/screens.css` block | no string in `data/job.js` contains `!`, an emoji, a first-person pronoun, a banned praise word, **or a sentence in a parent's voice** (a banned-phrase list pins `nothing here beats sleep` and `and then you sleep`); every rival line is a number or a math object; the rank ladder strings are `Called 1..5`; exactly six new keyframes, all transform/opacity, all ≤ 600 ms; **no `transform: rotate` on the envelope**; `prefers-reduced-motion` zeroes every duration and keeps every colour; **no `position: fixed` element on `body` during a job, so the tile mint stays the product's only full-screen moment**; the bag drop plays at most once per job and is the only element animating while it runs |
| **J13** | Cold open + visual QA | `tests/job-coldopen.test.mjs`, `qa/job-walk.mjs` | **first answer from a cold visit ≤ 20 s with the board on, on the pinned path `board 6 → primary button → guard accept 4 → call 5`** (S9 #1 stays a PASS); **Home paints the board in two passes with no spinner, no static `page.js`/`plan.js` import, and zero layout shift between passes**; a fresh save → three jobs (walk early, full job, CALL IT) at 375×667 dark and 1280×800 light; the S9 ten criteria re-scored with the layer in the path; every printed probability matches `guard.js` / `call.js` on every screenshot |

---

## G9 Definition of ADDICTIVE-BUT-HONEST

Ten criteria, each checkable by a harsh critic who built none of it. All ten must pass.

1. **A large, measured, printed share of the session is decisions — and the app says which share.** The board prints a projection computed from the student's *own* last-5 phase durations before the run; the debrief prints the measurement; **the two agree within 5 points on all four shapes and on both the default and full-use paths.** The recommended evening shape measures **43 % game tapping through and 51 % using the windows**, the RUN measures over half either way, and decision density is **≥ 2 decisions per graded item on the default path and ≥ 3 with the windows**, with **0 ms of any state where the app is neither accepting input nor showing a result**. There is no constant-ratio claim, because the no-padding rule (G10 #17) wins wherever one would be needed.
2. **No item is ever removed from the schedule by a game decision, and a job answers exactly what the composer composed.** `set(job items) ⊆ set(page items)`, `Σ answered over the day == Σ answered on the flat path`, and every unreached target stays due and leads the next board (`job-board.test.mjs`). The wall-clock truth — a JOB-10 spends 12:20–14:22 on the same 10 items the flat Page answers in 7:00 — is printed on the board button, where it already is. *(The old #2 claimed the job path answers more items per wall-clock minute than the flat Page, which a ~50 % game split makes arithmetically impossible.)*
3. **Knowing the math is the only way to win.** Over 10⁴ random states, a clear pays ≥ a miss in both currencies; no mechanic exists in which a wrong answer increases LOOSE or a right answer decreases it; all 2ⁿ outcome vectors for n ≤ 11 are monotone in clears under optimal play on every shape the composer deals (§3.7(2) states the scope and the measured exception off it).
4. **Every probability is printed before the decision it affects — and no recommended action is.** Four random objects, four printed distributions, five Settings panels with the formulas. A reviewer can recompute any number on any screen from the save. The one thing deliberately withheld before a call is the argmax rung, because printing it would make the rating a measure of obedience (Global law 6); it appears in Settings as a static table and in the debrief as a regret line.
5. **A min-maxer is an optimal student, with numbers and with the domain stated.** Spearman ρ = 1 between the crew-value ordering and `weakSpots()`; the token equilibrium is interleaving weighted by `w × cold`; the rating weight `4q̂(1−q̂)` is strictly decreasing in `q̂` on `[0.5, 1]`, hence a monotone transform of `(1 − m/100)` on the domain where the game stakes anything; the rating is *earned* in the band `q̂ ∈ [0.763, 0.925]`, the peak of `w·E[c]`. All are positive monotone transforms of `dR ∝ w(1 − m/100)` on that domain, and the restriction is asserted, not hidden.
6. **Nothing can be farmed.** Mastered-tier-1 grinding produces **no informative calls at all**, so the rating sits at exactly 5.00 and the loot/hour is the worst in the game; the renewable loot rate from a fixed card set is monotone non-increasing over 400 simulated days; `cold` is capped so delay never pays; `tell` dies on resolution so stockpiled errors depreciate; carry exists only on composer-drawn targets.
7. **Quitting is free and never a strategy.** WALK in one tap under 3 s with the lossless option default-focused, 50 % auto-bag on any other exit, seed pinned so no reroll exists, and bag-and-continue ≥ bag-and-quit in 10⁴ states.
8. **Study state is never at risk.** `job-ledger.test.mjs`: the same answer sequence inside a job and through `#/run/page` produces byte-identical `cards`, `skills`, `xp`, `errors` and `counters` — the five keys study progress lives in. (`forecastLog` is Readiness' forecast trace, not study progress, and a job writes none; the same test pins that. See §3.7 proof 11.) `P(losing study progress) = 0`.
9. **The app tells the truth about time and the week.** Every primary button prints targets, minutes, the wall-clock end time and the projected split. D = 2 drops the stakes, D = 1 posts no board at all, any shape that would end after 22:00 is refused before it starts, after 22:00 the board closes and a job in progress auto-bags at full value — and **none of it locks a single study door**.
10. **It is still the study tool.** Readiness is computed by the published formula and printed unmodified even when it disagrees with rank; Today's Page, Leitner, the seven Bosses, the Mock and the Night Before all exist unchanged and are reachable in one tap; `settings.game = false` returns the product to byte-identical COMPOSED behaviour.

---

## G10 Contradiction resolutions

**Every line names the winner. Where COMPOSED-GAME wins, it wins on presentation only; where COMPOSED or BUILD-POLICY wins, this document bends.**

1. **Appendix B deletes "currency/shop/Double-XP".** → **COMPOSED wins.** There is no persistent currency: LOOSE/BAGGED evaporate every job; CREW is capacity, a function of level and boss stamps, freely re-allocatable at zero cost, unbuyable and unhoardable. Heist's CUT/safehouse/intel/cases, incremental's cores/Lattice, duel's LP/dossiers/loadout, season's assists/store, conquest's doctrine, pushluck's Read ladder and deckbuilder's Bench purchases are all **deleted** (G11). The one consumable, the Backcheck, is minted by clearing dues and is capped at 3.
2. **Heist's binary payout vs defense's damage ladder.** → **COMPOSED-GAME wins (presentation).** The ladder (1.00/0.70/0.45/0.20/miss) replaces it. It also *is* the hint economy, which lets "hints become a priced resource" land **without** making hints scarce — hints stay free and infinite (COMPOSED Global rule 1); only the loot moves.
3. **Two proper scoring rules would be one too many.** The per-target sealed **Call** is kept. Defense's per-surge Forecast, duel's shift-level Brier and season's shot-call are **rejected as duplicates**.
4. **Three risk decisions would be two too many.** The **Call** and **BAG/PUSH** are kept. Every stake slider is rejected; Kelly survives as the `min(LOOSE, ·)` cap and the printed `q*`.
5. **Four adversaries would be three too many.** The **Guard** is the adversary. The Proctor, the rival roster, the clubs, the Marker and the Fade are deleted. The House's Elo survives as one symmetric number; **the vault grade is driven by `R_player`, not `R_house`** (§3.5).
6. **Defense's standing coverage removes problems from the session.** → **COMPOSED Global rule 5 wins.** Deleted. Crew's two effects are forgiveness and chain-hold; **crew never removes a card.**
7. **Heist's "Skinned" state** is replaced by season's **CALL IT**: stakes end, the loss is recorded, the remaining targets continue as no-stakes practice with hints on.
8. **Heist dropped LOOSE on an abandoned job.** Replaced by the **50 % auto-bag** plus a **pinned seed** on resume.
9. **COMPOSED Global rule 3 (no clock on thinking).** → **COMPOSED wins.** The tick law satisfies it by construction. The only wall-clocks in the layer are the truthful *end time* printed before you press, and the two measurement accumulators, neither of which enters a payoff.
10. **COMPOSED Global rule 4 (nothing auto-advances on a correct answer).** → **COMPOSED wins.** The bag/push prompt *is* the continue tap — it occupies that slot rather than replacing it. HELD crew skips the *call* (a pre-stem decision), never the continue.
11. **COMPOSED Global rule 1 (gates gate loot, not learning).** → **COMPOSED wins.** Rank gates the 95 call and the guard multiplier — loot. It gates no card, no boss, no Mock, no hint, no solution, no Variant.
12. **COMPOSED S4's optional `callYourShot`.** The Call replaces it inside jobs and its XP factor is **not** applied — the stake lives in LOOSE and rating, never in XP. Outside jobs `callYourShot` behaves exactly as specified today.
13. **COMPOSED S5 "the tile mint is the signature moment".** → **COMPOSED wins.** The bag drop is in-place in the header column, 600 ms, never full-screen, the **only thing animating** rather than the only thing on screen, and the debrief stays interactive under it.
14. **COMPOSED S1 "every extra screen is a place to not answer a question".** → **COMPOSED wins.** Zero new routes: the job is `#/run/job`, the board is a Home panel, the Ledger / Fault Index / crew grid are `#/stats` panels, the brief is a sheet inside the run screen, the debrief is the Page Summary. `ROUTE_PATTERNS` stays 13.
15. **Defense wanted `channel`/`class`/`tier` fields on all 68 tags.** Rejected: tag → wing is derived from `AREAS` by an 11-entry map. `data/misconceptions.js` is untouched.
16. **Two collections.** The Binder's ~140 rarity tiles and the 68-tag Fault Index are both kept; a third is rejected.
17. **The 50/50 ratio vs. the no-padding rule.** → **The no-padding rule wins and the app prints the true number.** The claim this document defends is not a constant ratio; it is that each shape's projection is computed from the student's own measured phases, that printed and measured agree within 5 points, that the default evening shape sits between 43 % and 51 %, and that decision density is ≥ 2 per graded item on the tap-through path and ≥ 3 with the windows.
18. **COMPOSED S1's 10–25 minute session.** → **COMPOSED wins.** The VAULT is **7 targets, 17:26–18:58**, not 8 targets and 25:24. Every shape's full-use wall clock is inside the band.
19. **`LIMITS.sameSkillRun = 2` and the 1→4 tier ramp (COMPOSED S1).** → **COMPOSED wins.** Contracts are a pricing and selection device only; the drafted union is re-interleaved through `spreadSkills` and the ramp before the first envelope, and contracts survive as a source label.
20. **`site/js/store.js` archives top-level keys only.** → **the code wins.** The handoff split is expressed as two top-level keys, `player` (KEPT) and `game` (ARCHIVED).
21. **`tests/home-r2.test.mjs` forbids a static `page.js`/`plan.js` import in Home.** → **the test wins.** The board paints in two passes; J13 asserts no layout shift and no spinner instead of no import.
22. **`site/js/app.js` already renders six header items.** → **the code wins.** During a job four are hidden and three added: five items, pinned.
23. **COMPOSED S9 #1 (cold open to first answer ≤ 20 s).** → **COMPOSED wins.** The pinned cold-open path is `board 6 → primary button → guard accept 4 → call 5` = ~15 s. The 12 s guard figure in the phase table is the observed re-press mean and is labelled as such.
24. **COMPOSED S6's save budget.** → **COMPOSED wins.** The layer adds ≤ 37.1 KB (measured 36.84 KB; restated at the round-2 save audit, which found the published 26 KB false by 340 B, and again at round 3, which found the job's own `inProgress.queue` fields, its six trophies and its true call count unpriced — see the budget table) from real JSON with a job in progress, and `state.test.mjs`'s worst-case builder is extended to prove it. The budget it is measured against is COMPOSED.md S6's **restated** one — T01's 500 000-char bound on the study layer and **< 528 KB** total, corrected at integration when the saturated study layer was first measured and restated at round 3. The "250 KB" this entry used to name was the superseded estimate; citing it here made J10 read as passing a criterion the shipped code does not meet.
25. **COMPOSED's 22:00 soft close and the Mock's 21:30 rule.** → **COMPOSED wins.** The layer adds no new clock constant: a shape is refused when *its own projected end time* passes 22:00.
26. **`site/data/cards/asn.js` contains zero `tag:` entries.** → **the data wins.** The tell is skill-keyed and read from `save.errors`, so it degrades gracefully and needs no card-data migration.
27. **`js/gen/*` and `data/templates.js` were listed as zero-edit.** → **this document bends.** One new generator file is added and `data/templates.js` gains exactly one entry (J5b); the existing generator files are still untouched, and G7's tables say so.

---

## G11 Rejected outright (do not resurrect)

**Manipulative mechanics, refused on principle:** energy · lives · hearts outside a Boss · any cooldown between runs · "next job unlocks in 4 h" · real money · in-app purchase · ads · purchasable hints, streak freezes, cosmetics or continues · loot boxes · hidden drop tables · unrevealed odds · post-hoc reveals · pity timers presented as luck · near-miss animation ("so close!") · a fabricated rival rating on day 1 · notification nagging · badge counts · "your rival is waiting" mail · daily-login reward escalation · appointment mechanics · FOMO windows and "today only" events · streak-loss guilt copy · "you'll lose your rank" warnings · rating or progress decay for absence · a quit penalty, forfeit or "abandoned" flag · a run that cannot be quit · auto-starting the next run · an infinite prestige/rebirth/season ladder · leaderboards against other students · a rival that taunts, speaks or has a face · artificially slow counters and forced animation gates · variable-ratio *rewards* beyond the single disclosed, pre-marked, ×2-capped posting · any mechanic where a die decides a turn · double-or-nothing on XP, mastery, Readiness or a Leitner bucket.

**Mechanics from the eight designs, deleted with their reasons:** CUT, the safehouse tree, intel prices and cases (heist) — currency and a shop, Appendix B · the 99 call (heist) — it was purchasable · Skinned (heist) — replaced by CALL IT · standing coverage / auto-intercept (defense) — removes problems from the session · per-surge Forecast (defense), shift-level Brier (duel), the shot call (season) — duplicate proper scoring rules · the Kelly stake slider (defense, deckbuilder, conquest, season) — a third risk decision per target · the Proctor, the 9-rung rival roster and dossiers (duel), the 7 clubs and the standings (season), the Marker (incremental, deckbuilder), the Fade (conquest) — four adversaries too many · LP, Read, assists, cores, Ground, ATT, doctrine, the Lattice, tactics, tools, relics, modifiers and banners — currency or a second collection · Reforge and plates (incremental) — prestige treadmill · exhibition-decay and daily rating caps as the *only* anti-grind (pushluck, season) — replaced by structural decay (`cold`, `scope`, `tell` retirement, the `w ≥ 0.25` informative gate) that needs no cap · fatigue (season) — a timer on which skills you may practise · the Scout Pack (duel) — a loot box with a pity counter is still a loot box · the 3×3 stance×tactic matrix (duel, deckbuilder) — a second non-transitive game on top of the guard · the Split sealed-bid auction (deckbuilder) — a fourth decision type for one moment a run · Overtime after the Cut (deckbuilder) — "one more" as a default rather than a choice · tag metadata migration on all 68 misconceptions (defense) — derivable from `AREAS` · packet-order or game-chosen item selection — the composer owns what is studied, always · any claim of a 50/50 split that the app does not measure and print.

**Newly rejected in this revision, with their reasons:**
- **A weighted-mean rating** — invariant to its own weights on a homogeneous window, which made farming mastered tier-1 locks the fastest route to the top rank.
- **A pre-call advisor line naming the EV-max rung** — turns a metacognition score into an obedience score. Judges killed it as heist's paid Spotter; free and permanent is strictly worse.
- **An uncapped `cold = 1 + overdue/4`** — the one incentive in the design that pointed away from spaced review.
- **A permanent `tell` keyed on the mere presence of a tag** — buys +25 % on most of the board with 68 deliberate misses.
- **A crew that idles for a whole make for a whole job** — switched forgiveness off exactly where the design prices it.
- **A "growth-optimal band q ∈ [0.52, 0.63]"** — imported from a multiplicative economy; here `E[Δloose]` is strictly increasing in `q` with no interior optimum.
- **A free-and-non-binding COMMIT** — weakly dominant, therefore not a decision.
- **A rank ladder of crime-crew job titles** — costume on a school tool; the ladder now prints the number.
- **A 0.4° envelope tilt** — the one off-grid element in a product built on an 8 px grid.

---

## G12 Changelog — every murder-board item, what changed, and why

**Murder board of 2026-09-17, `designs/murderboard-game.md`: FATAL 9 · MAJOR 19 · MINOR 12 (40 items). All 9 FATAL, all 19 MAJOR and all 12 MINOR are addressed below.**

### FATAL

1. **Rating was a weighted mean → now a weighted sum over a fixed window of 50, with an informative gate at `w ≥ 0.25`.** A mean is invariant to its weights on a homogeneous window, so farming mastered tier-1 locks scored 9.41 (Ghost) while the doc asserted ≤ 5.05. New: `rating = clamp(0, 10, 5 + 2·Σ(w·c)/50)`, only `w ≥ 0.25` (`q̂ ∈ [0.067, 0.933]`) calls enter, and an unfilled slot contributes 0 — so a pure farmer generates **no** informative calls and sits at exactly **5.00**. RANK thresholds re-derived against the new scale (Called 3 at 6.5, Called 4 at 7.7, Called 5 at 8.9, from the achievable mean-`w·c` curve; sustained peak play is 2.499/call → 9.998). The "central alignment result" is restated in two honest halves: `w` peaks at `q̂ = 0.5` (leverage) and `w·E[c]` peaks at `q̂ = 0.854` (gain), because a Brier credit at a coin flip is exactly 0 and no formula can make `q̂ = 0.5` the rating maximum. §3.1, §3.8, G2 Rank, G9 #5, J2, J9 all updated.
2. **The free advisor line sold the answer → Global law 6 added; the envelope prints evidence only.** `FAC2 · Factoring a > 1 · grade 2 · cold 3 d · posted 41 · from B · tell · your last 10: 7/10`. The EV-max rung and the indifference boundaries move to a Settings formula panel and to the debrief's regret line (`envelope 6: you called 85, EV-max was 70`). J2 greps every pre-call template for `argmaxCall`/`EV-max`/`evTable`; J6 asserts the same on the DOM.
3. **BAG's effect on the chain was never stated → `chainAfterBag()` added as the fourth transition: BAG banks the pile and resets the chain to 0.** The `1` in §3.2's BAG branch is now grounded; every `q*` in the threshold table and both pinned rows (−40, +90.96) reproduce. Printed on the bag prompt (`bag 118 · fee 13 · chain 4 → 0`), pinned in J1 and J9's monotonicity brute force, and explicitly *not* `xp.comboTransition()`.
4. **Crew forgiveness was switched off where it was priced → idle is now per-target, not per-make.** Crew stands down only on the target that *is* its make's own due review; every other target of that make in the same job keeps its forgiveness. HELD's gate becomes `isMastered` alone (the "no due card in the make" clause made HELD undrawable), with the chain-hold suppressed on due-review targets. G2's encounter counts are re-derived per shape and J4 owns the measurement against `composePage` output over 1 000 saves.
5. **The build table mixed shapes' loot → a full 4×2 matrix, each cell with its own `L̄`.** `L̄` = RUN 6.0 · JOB-10 8.4 · JOB-12 12.7 · VAULT-7 23.1. The `E[ρ]` r1/r2 columns were also wrong (they did not reproduce from `LADDER`) and are recomputed: m85 0.940/0.972/0.989, m60 0.746/0.853, m40 0.562/0.725 — so `Δρ_steady` is **+0.163** and `Δρ_held` **+0.049**. HELD's forgiveness is therefore near-worthless and the document says so; the chain-hold is what you buy, and it now fires on **any non-clean outcome at chain ≥ 3** (a miss alone fires at 1 % on a mastered make — a dead mechanic). HELD's cumulative cost drops 3 → 2. Result: STEADY 1.1 vs HELD 0.8 on a RUN; HELD 3.5/7.4/7.3 vs STEADY 2.7/5.3/6.0 on JOB-10/JOB-12/VAULT. **Two flips survive** (shape, and the mastery state where HELD does not exist), and the parameters are measured by J4 against a ±15 % tolerance that **three of the twenty cells actually meet** (`m̄` on RUN / JOB-10 / JOB-12; the rest are pinned at their measured values with bounded deviations), under a rule that a moved winner means the doc is wrong.
6. **The "growth-optimal band 0.52–0.63" was imported from a multiplicative economy → deleted, with its test.** `E[Δloose] = q·L·ρ̄·m·W − (1−q)·L·m·P` is strictly increasing in `q`; there is no interior optimum. Replaced by the **stake band `q̂ ∈ [0.763, 0.925]`**, derived as the ≥ 80 %-of-peak region of `w(q̂)·E[c](q̂)` (peak 2.50 at `q̂ = 0.854`, from `f(u) = 40u − 160u²`). J1 asserts the peak and the band; nothing asserts 0.52–0.63. §3.2, §3.8 #4, G9 #5 and J1 updated. The loot-vs-rating divergence is now stated as a feature: money prefers certainty, rank prefers consolidation.
7. **G9 #2 was arithmetically impossible → restated as the promise the brief actually makes.** A 51 % game split answers roughly half as many problems per wall-clock minute by construction. New #2: `set(job items) ⊆ set(page items)`, `Σ answered over the day == Σ answered on the flat path`, no item removed by a game decision — asserted in `job-board.test.mjs` — with the wall-clock truth printed on the board button where it already was.
8. **The Elo dial ran backwards → the vault grade is driven by `R_player`.** Symmetric Elo moves `R_house` down on a win, so a strong player's vault got easier with every win and flow control was sign-indistinguishable from losing. `vaultGradeFor(R_player)`: `< 1000` tier ≤ 2 · `1000–1199` tier 3 · `≥ 1200` tier 4. Flow control is `R_player −40`. `R_house` survives as the displayed symmetric opponent. J3 asserts win streaks raise the grade and loss streaks lower it.
9. **Skill-pure contracts broke `sameSkillRun = 2` → draft, then interleave.** `composeBundles` partitions for pricing and selection; `draftUnion(bundles, picks)` dedupes and runs the union back through `spreadSkills` and the 1→4 tier ramp before the first envelope. Contracts survive as the *source label* on each envelope (`from B · VOC`) and are labelled by dominant make, not skill-pure. J5 asserts `sameSkillRun ≤ 2` and a monotone ramp on the drafted queue.

### MAJOR

10. **`guardDist` could not satisfy its own test → the water-filling projection is specified.** Cap, redistribute the excess proportionally over the uncapped entries, repeat (≤ n−1 passes). Worked: `(1,0,0), ε=.10 → (0.750, 0.125, 0.125)`, Σ = 1.000. The pseudo-code is what the Settings panel prints. J3 asserts Σ = 1 within 1e-9 over 10⁴ random cases.
11. **A job's wings were not guaranteed to be three → support is guaranteed and printed.** `composeBundles` guarantees the 5 posted contracts span ≥ 3 wings and any legal 3-of-5 draft spans ≥ 2; `guardDist` handles `n = 2` explicitly (cap 0.75 → floor 0.25); the board prints `guard: 3 wings on the board`. Contracts being dominant-make-labelled rather than skill-pure is what makes this achievable.
12. **The guard's `x̂` was farmable with throwaway jobs → `x̂` is stake-weighted and per-job capped.** `ω_j = min(posted_j, 0.25·Σ posted)`. A RUN contributes ~⅕ of a VAULT and no job exceeds 25 % of the window. J3 asserts a 3-RUN + 1-VAULT farm moves `x̂` by < 0.08.
13. **`cold = 1 + overdue/4` was uncapped → `cold = 1 + 0.5·min(1, overdue / intervalDays(bucket))`, capped at 1.50.** Proportional to the card's own interval, so a 1-day-overdue bucket-1 card is as cold as a 14-day-overdue bucket-5 card, and skipping study buys nothing. `v_i` and §3.8 #1 updated. J9 asserts weekly loot is monotone increasing in review compliance.
14. **`tell = 1.25` keyed on a permanent tag → it pays only while triggered, unresolved and unsealed.** `resolve()` sets `errors[].cleared = true` and drops the multiplier the same tick; sealing retires the tag from the tell pool. J9 asserts a save with 68 deliberate misses earns less over a simulated week than an honest one.
15. **54 of 164 originals could never carry a tell → the tell is skill-keyed, from `save.errors`.** `site/data/cards/asn.js` has **zero** `tag:` entries (verified), and the `asn` grader's tags are decided after grading, so a card-keyed tell was unreachable for ASN-PLP + ASN-ANG — 14 of the 100 skill weight. `index.tellFor(save, skillId)` returns the make's most-triggered unsealed, unresolved tag, which is knowable before the stem. No card-data migration. J7 asserts every one of the 19 skill ids can produce a tell.
16. **RECALL content starvation → stated, measured and answered three ways.** 73 originals have no generator; ASN-PLP + ASN-ANG feed ~8 targets/day against a wing carrying `Σw 32`. Fixes: (a) `composeBundles` posts `min(5, available)` contracts and narrows the draft, with per-wing supply printed on the board and a `thin board` state; (b) new ticket **J5b** adds `js/gen/asn-reason.js` built from the 54 one-line reasons already in `data/asn.js` (one `data/templates.js` entry, no new authored content); (c) untemplated recall repeats inside their interval are blessed at `scope 0.5` and labelled. J5 asserts no card twice in a job and no repeat inside its interval over a 30-run week.
17. **Critical replication had no dedupe rule → dedupe at draft, print gross and net.** Contracts print posted gross; the drafted union prints net with the shared amount (`posted 100 (−5 shared)`). J5 asserts `Σ targets(drafted) == |union|` and that the printed net equals the post-dedupe value for all `C(5,3) = 10` drafts.
18. **The save-size bound was wrong and `days` was uncapped → `days` is a count, `CAPS.game` has five caps, the budget is ≤ 37.1 KB.** `tags[].days: 2, lastDay: '2026-09-17'` replaces an unbounded date array (68 × 20 × 13 B ≈ 18 KB on its own). Budget measured from the shipped serialiser AND from real jobs driven through it (restated three times — the figures first written here were estimates; the round-1 fixture was 8 keys short of the record `serialize()` emits; the round-2 audit found its VALUES narrower than the writers emit and two real costs unpriced; the round-3 audit found the job's own queue fields and trophies in neither half of the split and the call count measured on a corpus that never took a swap): `player` 3.92 KB · `game.tags` 8.10 KB · `game.log` 5.30 KB · `game.heat.window` 0.70 KB · `inProgress.game` 6.27 KB · `inProgress.bench` 1.85 KB · `inProgress.queue` +8 fields 4.39 KB · `trophies` 0.19 KB · rest 0.72 KB = 31.46 KB, plus 5.35 KB reserved across the existing 40-run cap → **36.84 KB added, stated ≤ 37.1 KB**, ≈ 536 K chars total against COMPOSED S6's restated 528 KB. `state.test.mjs`'s worst case gains a job in progress, its bench, its real drafted queue and its trophies.
19. **The handoff split was unimplementable → two top-level keys.** `site/js/store.js:191-205` archives top-level keys only (verified). `save.player = { rating, rank, elo, records }` → `KEPT_KEYS`; `save.game = { crew, tags, heat, log, backchecks, commit, ledger }` → `ARCHIVED_KEYS`. One rename, zero new machinery, one `MIGRATIONS[1]` step. The "one save key" line in the preamble is corrected to two, with the reason.
20. **Home could not paint the board from save state → two passes.** `tests/home-r2.test.mjs:147-148` forbids a static `page.js`/`plan.js` import (verified). Pass 1 static from `store` + `schedule` + `save.game.log` (labels, lock counts, cold days, minutes, end time, split, supply); pass 2 tweens the `posted` numerals in after the dynamic import. J13 asserts no layout shift and no spinner instead of "no import".
21. **The header would carry seven items at 375 px → five during a job.** `site/js/app.js` already renders six (verified: readiness, tminus, level, xp, combo, streak). During a job `hdr-level`, `hdr-streak`, `hdr-xp` and `hdr-combo` are hidden and LOOSE · BAG · chain are added. `job-juice.test.mjs` pins five in a job, six outside.
22. **The board collapsed on input focus → it collapses at call-lock.** A tier-3/4 diagram is read before it is typed, and stem + 400×260 figure + Answer Dock + key row do not fit under a 264 px board on 375×667. The board is needed only during DRAFT / PRESS / CALL, all pre-stem. J6 asserts the board is ≤ 36 px whenever a stem is in the DOM.
23. **The 51.3/48.7 split assumed every optional window was used → two published columns and a projection from observed behaviour.** Default path (primary button, `Enter` through the windows) fixed phases total **160 s** for a JOB and **104 s** for a RUN; full-use **282 s** and **130 s**. JOB-10 measures **43.2 % → 51.3 %**; RUN **51.1 % → 54.3 %**; JOB-12 **33.9 % → 40.3 %**; VAULT-7 **28.3 % → 34.1 %**. `save.game.ledger.phaseMeans` keeps a rolling mean of the student's own last-5 phase durations and the board prints *that* (`~48 % game · your last 5 jobs`), falling back to the shipped defaults labelled `projected` on job 1. G9 #1 restated; the constant 45–55 % band and its assertion are gone (G10 #17 already said the no-padding rule wins). The PRESS is no longer auto-completed silently — the primary button pre-presses the equilibrium mix and `Enter` accepts it, which keeps the cold open at ~15 s while making the press a real, countable beat.
24. **The 90-second trace and the phase budget disagreed → both numbers survive, labelled.** Guard reveal is **4 s to accept** on the cold-open path (`board 6 → primary button → guard 4 → call 5` = ~15 s, pinned by J13) and **12 s observed mean** when the student re-presses, which is the number in the phase table. The whole fixed-phase budget was rebuilt around the two columns of #23.
25. **COMMIT was a free button → it binds.** A declared walk-away minute auto-bags at full value and ends the job at that minute; you take +8 % on BAGGED and forfeit the chain in progress and the +10 % completion bonus if targets remain (net −2 % plus the forgone upside). No loss framing, nothing lost from Ledger A, and the remaining targets go straight to `3 left on Today's Page`, so no declaration can lock a study door.
26. **A Backcheck's effect on the rating was unspecified → the rating credit is always taken.** A Backcheck shields LOOSE and the chain only. Without this, three held Backchecks would make the first three targets of every job downside-free 95 calls and the scoring rule improper for them. J7 asserts a shielded miss writes a byte-identical `calls[]` entry.
27. **The first-90-seconds board did not add up → recut.** Old: `A B D = 3+4+2 = 9` printed as 10 targets, 7×T1 + 2×T2 against the JOB shape's 8×T1 + 2×T2, and envelope 1's make (`NOTE`) belonged to none of the drafted contracts. New: `A VOC 4 · D CS-LIN 4 · E PAIRS 4` = 12 raw, 2 shared → **10 targets, 8×T1 + 2×T2, 7.0 answer-minutes, posted 100 (−5 shared)**, three wings in support, and envelope 1 is `VOC` — from contract A. Contract labels are now skill ids (makes) rather than sheet names, which is what `composeBundles` and the wing map actually key on.
28. **No ticket owned the debrief → ticket J6b added.** `js/screens/run.js` Page Summary extension + `tests/job-debrief.test.mjs` (bag drop once per job and the only thing animating, both regret lines equal the solver's value for the realised order, tile mint / skill bars / Readiness delta byte-identical with the layer off, no layout shift). `site/index.html` is added to G7's Extended table for the one-line `css/job.css` link, which was previously listed nowhere.

### MINOR

29. **"Luck moves stakes, never outcomes" was overstated.** Global law 3 now reads: *luck moves stakes and which legal item is drawn; never how an answer is graded.* §3.7(1) matches.
30. **The ×2 was the same placement every job that day and undefined for non-multiples of six.** Now seeded `cyrb53(dateISO | jobIndex | targetIndex)` and defined as an **independent `p = 1/6` per target**; the realised count is printed on the board before the draft. J5 asserts 1/6 ± 0.01 over 10⁴ day seeds.
31. **The envelope's 0.4° rotation deleted.** It was the one off-grid element in a product built on an 8 px grid with a 1 px register. The face-down dim stays; J12 asserts no `transform: rotate` on the envelope.
32. **"The only thing on screen while it happens" → "the only thing *animating*".** The bag drop stays in the header column, the debrief stays interactive underneath, and S9 #7's full-screen moment stays the tile mint's alone.
33. **The rank ladder renamed.** Runner / Second / Wheelman / Boxman / Ghost → **Called 1 … Called 5**, printed beside the number (`rating 7.1 · Called 3`). Every mechanic is unchanged; the ladder now reads as the math it is.
34. **The envelope hid the two words needed to price the call.** It now prints the make id **and** its student-facing name, and the grade: `FAC2 · Factoring a > 1 · grade 2 · cold 3 d`.
35. **Two lines were written in a parent's voice.** "Nothing here beats sleep." → `Board quiet · Readiness 89 · 0 due`. "Night Before is 30 minutes and then you sleep." → `No board tonight · Night Before · ~30 min · ends 21:12`. `[ take a board anyway ]` stays. J12's lint pins both banned phrases.
36. **"CREW | 19 ranks" → "19 makes × 3 states"**, and J4's tautological acceptance ("`capacityFor` is provably ≥ the cost of any allocation it permits" — capacity *defines* which allocations are permitted) is replaced by **"no allocation exceeding capacity or the manned cap is reachable through `allocate()`"**, as a property test over 10⁴ random call sequences.
37. **Capacity stopped binding before the top of the ladder → a manned cap plus a cheaper HELD.** `manned ≤ min(capacity, 12)`, `COSTS = {STEADY: 1, HELD: 2}`. At the 22-point ceiling the maximal legal build is exactly 12 makes: 10 HELD + 2 STEADY, with **seven makes always bare**. At 8 points it is 8 STEADY or 4 HELD. Capacity binds at every level, and "19 makes, so you can never cover the board" is now true rather than aspirational.
38. **Backcheck minting was vacuous on a dry day.** Mint requires `dues ≥ 1 ∧ all cleared`.
39. **The decision count was 33 by generous counting → 24 mandatory / 35 full use, with the arithmetic printed.** DRAFT is one 3-of-5 choice (1, not 5); PRESS is one allocation (1); there are 9 bag/push beats, not 10, because the vault target ends in the getaway. The debrief prints both numbers and links the breakdown table.
40. **Small loose ends, all closed.** (a) The guard multiplier is defined as **the guarded wing's loot multiplier** and the ladder is inverted so rank rewards: Called 1 ×0.50 → Called 5 ×0.75. (b) §3.5's table is retitled "the three disclosed dials" with a driver column; `R_player` drives exactly one of them and rank drives the other two. (c) If placement is skipped, both Elo numbers seed at **1000**, and Settings says so. (d) The Mock's prediction enters the window at **`w = 1.0`** — it has no make and therefore no `q̂` — stated in G7 and Settings. (e) The VAULT is trimmed to **7 targets, 17:26–18:58**, inside COMPOSED S1's 10–25 minute session; the 21:30 refusal constant is replaced by the general rule **"any shape whose projected end time passes 22:00 is refused"**. (f) Loot per minute is published as **two rows** — answer-only 12.0/12.0/12.7/14.0 and as-experienced 8.2/9.5/10.9/12.5 — both monotone non-decreasing, so the conclusion survives and the published table is the one the student lives.

### What the board confirmed and this revision left alone

The carry EV table and both indifference sets (.600/.778/.882 carry, .600/.775/.900 Brier) · the propriety proof of `c(p,o) = 10 − 40(p−o)²` · every `q*` in the §3.2 deep-pile table from `θ* = mP/(ρ̄W(m−1))` and both worked rows (−40, +90.96) · the guard fixed point `k = (n−1)/Σ(1/v_i)` with `(⅓,⅓,⅓)` and `(0.60, 0.40)` · the wing partition (4 wings, 19 skills, Σw = 32 + 26 + 23 + 19 = 100, no skill in two wings) · the internal arithmetic of the split table · `minutesPerTier` read from the shipped constant · `patternLine`, the 11 `AREAS` and the 68-tag catalogue · Ledger A / Ledger B separation, the `min(LOOSE, ·)` floor, CALL IT, the 50 % auto-bag, the pinned job seed, the 22:00 auto-bag at full value, D−1 posting no board, and `settings.game = false`. **The honesty architecture is the strongest part of the document and none of it broke under audit.**
