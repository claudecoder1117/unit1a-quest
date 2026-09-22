// site/data/job.js — THE JOB: every constant of the game layer, in ONE place (J1).
//
// AUTHORITY: COMPOSED-GAME.md G1 (loop, shapes, ladder, phases), G2 (economy, crew, rank, loot),
// G3 (call ladders, push/bag, guard, elo, odds), G4 (supply), G5 (week/quiet hours), G6 (copy, juice).
// BUILD-POLICY.md overrides both.
//
// WHY THIS FILE IS BIG: every later ticket (J2–J13) imports from here and NONE of them may edit it.
// A constant that is missing here is a constant that gets hardcoded in three screens. So everything
// G1–G6 publishes is transcribed, with the section that published it named on the line.
//
// RULES FOR THIS FILE
//   · data only. No DOM, no unseeded random draw (js/rng.js seeds every draw in the layer), no
//     imports at all — every later ticket depends on this file being importable on its own.
//   · every export is deeply frozen; nothing here is mutated at runtime.
//   · `PUBLISHED` at the bottom holds the NUMERALS G1–G3 print. Tests compare COMPUTED values
//     (from LADDER, LOOT, SHAPES, …) against `PUBLISHED` — never the other way round. If a computed
//     value and a published numeral disagree, the FORMULA wins and the disagreement is recorded in
//     notes/J1.md. The one disagreement J1 recorded (PUBLISHED.deepQ c=2/call 85) was resolved at
//     integration by correcting the document to the formula's 0.795; `deepQAsPrinted` keeps the
//     numeral it used to print.
//   · `scope` is NOT defined here. `xp.scopeFor()` is the authority (G7 "reused unchanged");
//     `SCOPE_MIRROR` exists for display/documentation only.
//
// The loot/minute rows, the E[ρ] table, the deep/shallow push thresholds, the `w·E[c]` peak and band
// and the shape/split table are all DERIVED in `site/js/job/econ.js` from the constants below.

const freeze = (o) => Object.freeze(o);
/** deep-freeze a plain object/array tree (data only — no class instances here) */
function deep(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    for (const v of Object.values(o)) deep(v);
    Object.freeze(o);
  }
  return o;
}

/* ==========================================================================================
   G1 — the payout ladder
   ========================================================================================== */

/** G1 "Answering → game action": `LADDER = [1.00, 0.70, 0.45, 0.20, 0]`, indexed by rung. */
export const LADDER = freeze([1.00, 0.70, 0.45, 0.20, 0]);

/** Rung ids — the index into LADDER. G1's result table, top to bottom. */
export const RUNGS = freeze({ CLEAN: 0, HINT1: 1, ATT2: 2, ATT3: 3, MISS: 4 });

/** The miss rung. `LADDER[MISS_RUNG] === 0` is what makes a bare miss a LOSS rather than a payout. */
export const MISS_RUNG = 4;

/** G1's result table, one row per rung, with the Ledger-A effects it does NOT change (for display). */
export const RUNG_ROWS = deep([
  { rung: 0, id: 'CLEAN', label: 'clean (first try, 0 hints)', rho: 1.00, chain: 'increment', ledgerA: 's = 100, bucket +1, Gold' },
  { rung: 1, id: 'HINT1', label: 'first try, 1 hint', rho: 0.70, chain: 'hold', ledgerA: 's = 70, bucket unchanged' },
  { rung: 2, id: 'ATT2', label: 'cleared on attempt 2', rho: 0.45, chain: 'reset', ledgerA: 's = 40, bucket −2' },
  { rung: 3, id: 'ATT3', label: 'cleared on attempt 3', rho: 0.20, chain: 'reset', ledgerA: 's = 40, bucket −2' },
  { rung: 4, id: 'MISS', label: 'third wrong, or solution shown', rho: 0, chain: 'reset', ledgerA: 's = 0, bucket −2, Rematch queued' },
]);

/**
 * G2 "The build decision" — the SHIPPED rung bands per `m_shown`, in LADDER order
 * [clean, 1-hint, att-2, att-3, miss]. Each row sums to exactly 1. `econ.expectedRho(band, rank)`
 * reproduces the published E[ρ] table from these and LADDER alone.
 */
export const RUNG_BANDS = deep({
  85: [0.88, 0.06, 0.03, 0.02, 0.01],
  60: [0.58, 0.13, 0.13, 0.08, 0.08],
  40: [0.34, 0.16, 0.19, 0.12, 0.19],
});

/** `almost` / `malformed` are FREE — no rung, no payout, no chain change (G1, Global law 2). */
export const FREE_OUTCOMES = freeze(['almost', 'malformed']);

/* ==========================================================================================
   G2 — loot, multipliers, fee
   ========================================================================================== */

/** G2 "Loot": `L = {1: 6, 2: 18, 3: 38, 4: 70}`, against page.js LIMITS.minutesPerTier. */
export const LOOT = deep({ 1: 6, 2: 18, 3: 38, 4: 70 });

/** page.js `LIMITS.minutesPerTier`, mirrored so the loot/minute rows are computable from this file. */
export const ANSWER_MINUTES_PER_TIER = deep({ 1: 0.5, 2: 1.5, 3: 3, 4: 5 });

/**
 * G1 "The split" — per-target decision seconds by tier. Tier 1's call row IS the continue row
 * (5 s call + 9 s payout/bag-push); tiers 2–4 carry the tell, the chain arithmetic and the crew note.
 */
export const DECISION_SECONDS = deep({ 1: 14, 2: 24, 3: 30, 4: 36 });

/** The tier-1 breakdown G1 publishes, so a screen never re-guesses it. */
export const DECISION_PARTS_T1 = freeze({ call: 5, payoutAndBagPush: 9 });

/** G2 `m_chain = 1 + 0.2·min(chain, 8)` — cap ×2.6. Ticks go amber at 5, violet at 8 (G6). */
export const CHAIN = freeze({
  step: 0.2, cap: 8, multCap: 2.6,
  /** HELD's chain-hold fires only at chain ≥ 3 (G2). */
  holdMinChain: 3,
  tickAmber: 5, tickViolet: 8, ticks: 8,
});

/** G2 `fee = 0.10 of whatever you bag mid-job; bagging at the getaway is free`. */
export const FEE = 0.10;
export const GETAWAY_FEE = 0;

/** G1/G5 — the non-bag exits. WALK and any other non-bag exit auto-bank half; 22:00 banks in full. */
export const AUTO_BAG = freeze({ walk: 0.50, quiet22: 1.00, commit: 1.00 });

/** G2 `completion = +10 % on BAGGED if every drafted target was answered`. */
export const COMPLETION = 0.10;

/** G3.9 — an honoured binding declaration pays +8 % on BAGGED and forfeits COMPLETION. */
export const COMMIT_BONUS = 0.08;

/** G2 `tell = 1.25 while the make has a triggered, unresolved, unsealed tag; else 1`. */
export const TELL = 1.25;
export const TELL_BASE = 1;

/** G2 `cold = 1 + 0.5·min(1, overdueDays / schedule.intervalDays(bucket))`, CAPPED at 1.50. */
export const COLD = freeze({ base: 1, slope: 0.5, cap: 1.50 });

/**
 * `xp.scopeFor()` is the authority (G7). This mirror exists only so a panel can PRINT the ladder
 * without importing xp.js, and so `job-econ.test.mjs` can prove the mirror still matches xp.js.
 */
export const SCOPE_MIRROR = freeze({ review: 1.25, drill: 1, variant: 0.8, mastered: 0.5, bonus: 0, repeat: 0.5, dryBoard: 0.8 });

/** G3.6 — the ×2 posting: independent `p = 1/6` PER TARGET, seeded `dateISO|jobIndex|targetIndex`. */
export const X2 = freeze({ p: 1 / 6, mult: 2, seedParts: freeze(['dateISO', 'jobIndex', 'targetIndex']) });

/** G1 "Declines are priced" — the two refused contracts return in a brief window at +0.15 posted. */
export const DECLINE_PRICE = 0.15;

/* ==========================================================================================
   G3.1 — the two call ladders
   ========================================================================================== */

/** `c(p, o) = 10 − 40(p − o)²` — the Brier credit (G3.1). */
export const CREDIT = freeze({ base: 10, k: 40 });

/**
 * G3.1 "Two ladders on the same four buttons."
 *   W / P  — the CARRY ladder (multipliers of `L·ρ·m·scope·wing`)
 *   creditClear / creditMiss — the RATING ladder, and each is exactly `c(p, o)` from CREDIT.
 * `minRank` is the rank that unlocks the rung: 95 needs Called ≥ 3 (G2 "Rank").
 */
export const CALL_LEVELS = deep([
  { id: 50, label: '50', p: 0.50, W: 1.0, P: 0.0, creditClear: 0.0, creditMiss: 0.0, minRank: 1, key: '1' },
  { id: 70, label: '70', p: 0.70, W: 1.4, P: 0.6, creditClear: 6.4, creditMiss: -9.6, minRank: 1, key: '2' },
  { id: 85, label: '85', p: 0.85, W: 1.8, P: 2.0, creditClear: 9.1, creditMiss: -18.9, minRank: 1, key: '3' },
  { id: 95, label: '95', p: 0.95, W: 2.2, P: 5.0, creditClear: 9.9, creditMiss: -26.1, minRank: 3, key: '4' },
]);

/**
 * The bottom rung: the call every rank may make, and the rung a stakes-off target is priced at.
 * `job/state.js` used to carry its own `CALL_DEFAULT = 50` while `job/call.js` and `job/econ.js`
 * both derived the same rung from `CALL_LEVELS[0]` — three expressions of one constant, one of them
 * a literal that would not have moved with the ladder. Single-sourced here at integration;
 * `state.js` re-exports it so its own importers are unaffected.
 */
export const CALL_DEFAULT = CALL_LEVELS[0].id;

/** The same ladders keyed by call id, for O(1) lookup. */
export const CARRY_LADDER = deep(Object.fromEntries(CALL_LEVELS.map((c) => [c.id, { W: c.W, P: c.P }])));
export const RATING_LADDER = deep(Object.fromEntries(CALL_LEVELS.map((c) => [c.id, { clear: c.creditClear, miss: c.creditMiss }])));

/**
 * Exact indifference points, as fractions, NOT decimals — the tests reproduce these from W/P.
 *   carry : 50↔70 at 3/5, 70↔85 at 7/9, 85↔95 at 15/17
 *   rating: 50↔70 at 0.600, 70↔85 at 0.775, 85↔95 at 0.900
 */
export const CALL_INDIFFERENCE = deep({
  carry: [3 / 5, 7 / 9, 15 / 17],
  rating: [0.600, 0.775, 0.900],
});

/**
 * G3.1 "The two ladders disagree in exactly two bands" — money prefers the bolder call, rank the
 * honest one. Printed in Settings (J7), never on an envelope.
 */
export const CALL_DISAGREEMENT_BANDS = deep([
  /* Band 1's labels were transcribed backwards from G3.1 and are CORRECTED here (notes/J2.md §5.2,
     asked again in notes/J7.md §7): at q = 0.776 the carry EV prefers 70 (0.9520 vs 0.9488) and the
     Brier prefers 85 (2.828 vs 2.816), so the money wants the HONEST call and the rank wants the
     bolder one — the mirror of band 2. `call.disagreementBands()` always computed both labels rather
     than reading them, so nothing downstream ever inherited the error; this makes the constant agree
     with the code that had been quietly correcting it. G3.1's prose is scoped to match. */
  { from: 0.775, to: 7 / 9, money: 70, rank: 85 },
  { from: 15 / 17, to: 0.900, money: 95, rank: 85 },
]);

/* ==========================================================================================
   G3.1 / G2 — the rating window and the rank ladder
   ========================================================================================== */

/**
 * `rating = clamp(0, 10, 5 + 2·Σ(w_i·c_i) / N)` with **N = 50 FIXED** (not Σw — G12 #1).
 * `w = 4·q̂(1−q̂)`; a call is INFORMATIVE iff `w ≥ 0.25`, i.e. `q̂ ∈ [0.067, 0.933]`.
 * An unfilled slot contributes 0, which pulls the rating toward exactly 5.00.
 */
export const RATING = freeze({
  N: 50, base: 5, scale: 2, min: 0, max: 10,
  weightK: 4, informativeMin: 0.25,
  informativeQHatBand: freeze([0.067, 0.933]),
  /**
   * q̂ is the CLEAR rate on that make over the trailing 10 sittings (G3.1); the attempt a clear
   * arrived on decides ρ, never the forecast.
   *
   * This line used to name the **first-attempt** rate over the trailing 10 *attempts*, which was the
   * **document** being stale, not the code: `call.js:686` counts a CLEAR over trailing SITTINGS, and
   * it does so deliberately, because `econ.settle` settles `W`/`P` on the clear event (it reads
   * `rung`). Re-pointing q̂ at the first-attempt rate would make one button forecast two different
   * events — a student would honestly call 50 on m60 material they clear 92 % of the time.
   * Corrected per `designs/REPAIR-DECISION.md` §S1.1 item 1 and §S1.5 (finding 15); this file is the
   * `econ` lane's, so the S1 ticket's own edit to it lands here. The matching authority line is
   * COMPOSED-GAME.md G3.1, and `job-meta-constants.test.mjs`'s phrase lint is extended to both by
   * §S1.3 item 2 so the stale reading cannot return to either. (The phrase the old line used is not
   * quoted here on purpose: `job-copy.test.mjs` lints this file's comments too, and that lint is
   * exactly what should refuse to carry the wording it is meant to keep out.)
   */
  // q̂ = the CLEAR rate over the trailing 10 SITTINGS (the line above, outside the block comment the
  // J7 phrase lint strips, so the file states it on either reading of the lint).
  qHatWindow: 10,
  /**
   * The Mock's weight CEILING — the same number as `informativeMin`, and it IS
   * `screens/mock.js MOCK_CALL_W`: the smallest weight the rating window will count, so one Mock
   * slot can never pay more than `0.25 × 10 = 2.50` of `Σ(w·c)`.
   *
   * IT IS A CEILING, NOT A DEFINED WEIGHT, and this line said otherwise for four rounds. The Mock
   * has no MAKE, so it has no `q̂` — but its weight is MEASURED all the same:
   * `mockCallWeight(ŝ) = min(4ŝ(1−ŝ), mockWeight)` over ŝ, the mean score fraction of the trailing
   * `qHatWindow` papers, and **0** with no prior paper or with ŝ outside the informative band. So a
   * first-ever Mock is worth exactly 0.00 of rating and a perfect forecast 0.10, not the 0.40 that
   * `1.0` implied — a 4× overstatement, rendered verbatim by `screens/settings.js`. Nothing in
   * `screens/mock.js` ever read this constant (`grep -rn mockWeight site/`), which is how it drifted.
   * `tests/job-call.test.mjs` now drives `applyMockCall` and asserts this constant IS `MOCK_CALL_W`.
   * (Verify r3, call-propriety BLOCKER; the same correction as notes/repair-week.md Request (a).)
   */
  mockWeight: 0.25,
  /** the `calibrated` trophy's window (G7 data/trophies.js) */
  calibratedWindow: 20, calibratedBrierMax: 0.10,
});

/**
 * G2 "Rank". `rating` bands, the calls each rank may make, the GUARDED-WING loot multiplier and the
 * guard's mix floor ε. Rank helps monotonically on loot and aims better at you on ε (both printed).
 * The printed band tops (6.4 / 7.6 / 8.8) are the display rounding of "< the next threshold";
 * `RANK_THRESHOLDS` is the machine form.
 */
export const RANKS = deep([
  { rank: 1, name: 'Called 1', min: 0, bandTop: 4.9, calls: [50, 70, 85], guardMult: 0.50, eps: 0.25 },
  { rank: 2, name: 'Called 2', min: 5.0, bandTop: 6.4, calls: [50, 70, 85], guardMult: 0.55, eps: 0.20 },
  { rank: 3, name: 'Called 3', min: 6.5, bandTop: 7.6, calls: [50, 70, 85, 95], guardMult: 0.60, eps: 0.15 },
  { rank: 4, name: 'Called 4', min: 7.7, bandTop: 8.8, calls: [50, 70, 85, 95], guardMult: 0.70, eps: 0.15 },
  { rank: 5, name: 'Called 5', min: 8.9, bandTop: 10.0, calls: [50, 70, 85, 95], guardMult: 0.75, eps: 0.10 },
]);

/** Lower bounds, ascending: rank = the last threshold the rating reaches (G2 "Rank"). */
export const RANK_THRESHOLDS = freeze([0, 5.0, 6.5, 7.7, 8.9]);

/**
 * The same thresholds expressed as the MEAN `w·c` per window slot they require, because that is the
 * quantity G4 "Tense when strong" quotes: `Called 5 requires a mean w·c ≥ 1.95`.
 * rating = 5 + 2·mean ⟹ mean = (rating − 5)/2.
 */
export const RANK_MEAN_WC = freeze([-Infinity, 0.0, 0.75, 1.35, 1.95]);

/* ==========================================================================================
   G3.4 — wings, the guard, and the tag→wing map
   ========================================================================================== */

/** G3.4 — four wings partition the 19 skills; the weights come from data/skills.js and sum to 100. */
export const WINGS = deep([
  { id: 'RECALL', label: 'RECALL', skills: ['VOC', 'NOTE', 'CLASS', 'ASN-PLP', 'ASN-ANG'], w: 32 },
  { id: 'FIGURES', label: 'FIGURES', skills: ['PAIRS', 'FIG-ALG', 'BISECT-L', 'BISECT-Q', 'SEG-ALG'], w: 26 },
  { id: 'WORDS', label: 'WORDS', skills: ['CSARITH', 'CS-LIN', 'CS-RATIO', 'CS-QUAD'], w: 23 },
  { id: 'ALGEBRA', label: 'ALGEBRA', skills: ['SYS', 'FAC1', 'FAC2', 'QUAD-SOLVE', 'QUAD-CTX'], w: 19 },
]);

export const WING_IDS = freeze(WINGS.map((w) => w.id));

/** skill id → wing id, built from WINGS so the two can never drift. */
export const WING_OF_SKILL = deep(Object.fromEntries(WINGS.flatMap((w) => w.skills.map((s) => [s, w.id]))));

/**
 * G4 "tag → wing" — derived from data/misconceptions.js's own 11 AREAS. `general` is `null`:
 * it resolves to the TARGET CARD's own wing, so no tag record is edited (G10 #15).
 */
export const AREA_WING = freeze({
  'comp-supp': 'WORDS',
  setup: 'WORDS',
  ratio: 'WORDS',
  roots: 'ALGEBRA',
  factoring: 'ALGEBRA',
  figure: 'FIGURES',
  notation: 'RECALL',
  vocab: 'RECALL',
  classify: 'RECALL',
  reasoning: 'RECALL',
  general: null,
});

/**
 * G3.4 — the guard. `y = project((1−ε)·x̂ + ε·uniform_n, cap)` with `cap = 0.75` for n = 3 and n = 2.
 * `x̂` is STAKE-weighted over the last 10 jobs, `ω_j = min(posted_j, 0.25·Σ_k posted_k)` (G12 #12).
 */
export const GUARD = freeze({
  cap: 0.75,
  tokens: 3,
  /** a token is worth +0.25× on that wing's loot ONLY if the wing is unguarded */
  tokenBonus: 0.25,
  /** `wing_pen` on a miss: 2 on the guarded wing, else 1 */
  wingPenGuarded: 2, wingPenUnguarded: 1,
  /** the 5 posted contracts span ≥ 3 wings; any legal 3-of-5 draft spans ≥ 2 */
  postedSpanWings: 3, draftSpanWings: 2,
  /** x̂ window */
  xHatWindowJobs: 10, jobWeightCap: 0.25,
  /** G4 "Mercy" — the guard cannot take the same wing more than three jobs running */
  sameWingMaxRuns: 3,
  /** job 1 has no x̂: the distribution is uniform and the board says so */
  coldStartUniform: true,
});

/* ==========================================================================================
   G3.5 — Elo
   ========================================================================================== */

/** G3.5 — `E = 1/(1 + 10^((R_house − R_player)/400))`, K = 24, both ratings update symmetrically. */
export const ELO = freeze({
  k: 24, divisor: 400,
  /** seeds: player `clamp(1000 + 4·(placementScore − 50), 800, 1400)`, house flat 1000 */
  seedBase: 1000, seedPerPlacementPoint: 4, seedMin: 800, seedMax: 1400,
  houseSeed: 1000,
  /** if placement is skipped BOTH seed at 1000, and Settings says so (G12 #40c) */
  skippedPlacementSeed: 1000,
  /** outcome: 1 if BAGGED ≥ posted else 0 */
  winIfBaggedAtLeastPosted: true,
  /** flow control: after 2 consecutive jobs with BAGGED < 0.5·posted, R_player −40 + a FOOTHOLD */
  flowJobs: 2, flowThreshold: 0.5, flowPenalty: -40,
  footholdContract: freeze({ targets: 3, tier: 1, role: 'review', guardMult: 0.5 }),
});

/** G3.5 — the vault grade is driven by `R_player`, NEVER `R_house` (G12 #8). */
export const VAULT_GRADE = deep([
  { below: 1000, tierMax: 2 },
  { from: 1000, to: 1199, tier: 3 },
  { from: 1200, tier: 4 },
]);

/* ==========================================================================================
   G2 — crew
   ========================================================================================== */

/**
 * G2 "Crew — capacity, not currency". `capacity = 8 + floor(xp.levelFor(save.xp)/2) + bossStamps`,
 * range 8 (L1, no bosses) → 22 (L15, all seven stamps). `manned ≤ min(capacity, 12)`.
 * Re-allocation is free and unlimited between jobs and inside every brief window.
 */
export const CREW = freeze({
  base: 8, levelsPerPoint: 2, stampsMax: 7,
  capacityMin: 8, capacityMax: 22, mannedMax: 12,
  /** 19 makes exist; at most 12 may be manned, so seven are ALWAYS bare (G2). */
  makes: 19,
  COSTS: freeze({ STEADY: 1, HELD: 2 }),
  /** the maximal legal build at the 22-point ceiling (G2 "Capacity binds at every level") */
  maxBuildAtCeiling: freeze({ held: 10, steady: 2, bare: 7 }),
  /** HELD's gate is `mastery.isMastered(rec)` ALONE (G12 #4) */
  heldGate: 'mastery.isMastered',
  /** HELD holds the chain on a non-clean outcome only at chain ≥ 3, and never on a due-review target */
  chainHoldMinChain: 3,
  idleOnOwnDueReviewOnly: true,
});

/** G2's crew ranks — `cost` is CUMULATIVE, as the G2 table publishes it. */
export const CREW_RANKS = deep([
  { rank: 0, name: '', cost: 0, forgives: 0, chainHold: false },
  { rank: 1, name: 'STEADY', cost: 1, forgives: 1, chainHold: false, requires: null },
  { rank: 2, name: 'HELD', cost: 2, forgives: 2, chainHold: true, requires: 'mastery.isMastered' },
]);

/**
 * G2's 4×2 build matrix — every parameter is a MEASUREMENT J4 owns, not a guess. J4 reads `m̄`,
 * `e_forgiven`, `e_held`, `P(chain ≥ 3)` and `Σm_saved` off composePage + composeBundles and asserts
 * each within ±15 % of these rows. If a measured parameter moves a row's WINNER, the row is wrong and
 * J4 updates it — the flip structure (STEADY on RUN, HELD on everything longer) is the claim.
 */
export const CREW_MATRIX = deep({
  tolerance: 0.15,
  rhoBarTimesWBar: 1.316,          // ρ̄·W̄ ≈ 0.94 × 1.4 (G2)
  pNonCleanMastered: 0.06,          // P(non-clean on a mastered make)
  rows: [
    { shape: 'RUN', mBar: 1.3, eForgiven: 0.9, eHeld: 3.6, pChain3: 0.12, mSaved: 1.2, steadyPerPoint: 1.1, heldPerPoint: 0.8, winner: 'STEADY' },
    { shape: 'JOB', mBar: 1.4, eForgiven: 1.4, eHeld: 5.0, pChain3: 0.42, mSaved: 3.0, steadyPerPoint: 2.7, heldPerPoint: 3.5, winner: 'HELD' },
    { shape: 'JOB12', mBar: 1.5, eForgiven: 1.7, eHeld: 5.6, pChain3: 0.50, mSaved: 3.4, steadyPerPoint: 5.3, heldPerPoint: 7.4, winner: 'HELD' },
    { shape: 'VAULT', mBar: 1.6, eForgiven: 1.0, eHeld: 2.8, pChain3: 0.55, mSaved: 3.4, steadyPerPoint: 6.0, heldPerPoint: 7.3, winner: 'HELD' },
  ],
});

/* ==========================================================================================
   G1 — session shapes and the fixed-phase table
   ========================================================================================== */

/**
 * G1's fixed-phase table, published TWICE because a student who takes every optional window and a
 * student who taps the primary button are two different sessions.
 *   `brief` is PER WINDOW; multiply by `econ.landedBriefs(shape)` — the windows the shape can really
 *   open — NOT by `shape.briefs`. The two differ for VAULT alone; see SHAPES.
 * JOB / JOB12 / VAULT all use the `JOB` column. `total` (160 default / 257 full) is the TWO-window
 * sum, which is what JOB and JOB12 reproduce; a 7-target VAULT lands one window and sums to 140/207.
 * RUN is lighter.
 *
 * **Every key of `phases` is a phase the state machine can actually enter, and until verify round 2
 * one of them was not.** The full column carried a sixth cell, `crew: 25`, and `PHASE_ORDER` carried
 * a `'crew'` phase to hold it — both survivors of a *between-jobs* crew screen this layer never
 * shipped. Two independent things are wrong with that cell and the repair is the same for both:
 *
 *   1. **No code path could ever enter it.** `grep -rn "setPhase(.*crew" site/js` → 0; `phase =
 *      'crew'` appears nowhere in `js/job/state.js`. The crew move is an ACTION inside the brief
 *      window (`screens/job.js setCrewRank → takeBrief → state.brief` → `crew.allocate`, the only
 *      caller chain there is), so its seconds have always banked into `ph.brief`. G2 says so in
 *      words — "re-allocation is free and unlimited inside every brief window … there is no
 *      between-jobs crew control anywhere in `site/js`" (G12 #54 is the correction that moved it).
 *   2. **It was a DOUBLE charge.** G1 publishes the brief window as "50 s at full use, five real
 *      options, no padding", and the third of those five options is *re-rank one crew slot*. G1's
 *      own decision table charges the same way — "brief windows (skip, or up to 5 options each) |
 *      2 | 10", no crew row — so `DECISIONS.briefOptionsMax = 5` already counts the crew re-rank
 *      inside the window. Only the SECONDS table billed it twice.
 *
 * Measured, the cell cost exactly what it claimed: driving the canon walkthrough through the shipped
 * machine, the published full column came out 1.2–1.7 points high on the three shapes whose `crew`
 * cell was 25 (JOB 49.8 against 51.3, JOB12 39.1/40.3, VAULT 32.6/34.1) and Δ 0.0 on RUN, whose cell
 * was 0 — and `tests/job-split.test.mjs` §2 recorded the deficit as a tolerance ("the crew phase is
 * not creditable") instead of closing it. **Nothing about the running game changes here**: a real
 * full-use student always spent those seconds inside a brief window and the ledger always banked
 * them there. What changes is that the published column is now the one the app can produce, so
 * `PUBLISHED.shapeTable`'s and `PUBLISHED.nominalHeadlineSplit`'s full cells are the MEASUREMENT
 * (49.8 / 39.1 / 32.6 and 45.6 / 35.7 / 28.4), reproduced exactly rather than within a band.
 * `'crew'` is dropped from `PHASE_ORDER`/`GAME_PHASES` below for reason 1.
 *
 * KNOWN GAP, recorded rather than invented: G1 publishes RUN's full-use FIXED TOTAL (130 s) but not
 * its per-phase split. `full.total` is therefore the constant, and `full.phases` is null. J8 owns the
 * measurement that fills it in. See notes/J1.md "Open issues".
 */
export const FIXED_PHASES = deep({
  JOB: {
    default: { phases: { board: 18, guard: 12, brief: 20, getaway: 25, debrief: 65 }, total: 160 },
    full: { phases: { board: 55, guard: 12, brief: 50, getaway: 25, debrief: 65 }, total: 257 },
  },
  RUN: {
    default: { phases: { board: 12, guard: 12, brief: 20, getaway: 20, debrief: 40 }, total: 104 },
    /* G1 publishes this cell as a TOTAL only (130 s). The allocation was derived in
       `tests/job-split.test.mjs` (notes/J1.md open issue 1 → notes/J8.md Request 3) and is moved
       here so the data file is the single source: the growth over the default column, +26 s, goes to
       the two optional surfaces a RUN actually has — the board draft and its one brief window — in
       the 37:30 ratio the JOB column grows them in (board 18→55, brief 20→50). Its total is still
       G1's 130, which `tests/job-split.test.mjs` §1.4 asserts. */
    full: { phases: { board: 26, guard: 12, brief: 32, getaway: 20, debrief: 40 }, total: 130 },
  },
});

/**
 * G7's save default — `save.game.ledger.phaseMeans`. The JOB default column, per window for `brief`.
 * The board's projection reads the student's OWN rolling means and falls back to these on job 1,
 * labelling itself `projected` (G1 statement 1).
 */
export const PHASE_MEANS_DEFAULT = freeze({ board: 18, guard: 12, brief: 20, getaway: 25, debrief: 65 });

/**
 * The order the phases run in, for the two wall-clock accumulators (G1 statement 2).
 *
 * `'crew'` was the eleventh entry until verify round 2 and nothing in `site/js` ever set it — the
 * crew move is an ACTION inside the `brief` phase (`state.brief` → `crew.allocate`), so its seconds
 * always banked into `ph.brief`. It is gone from both lists, and with it the only cell of
 * `FIXED_PHASES` that charged seconds to a phase the machine cannot enter. `state.tick` validates
 * against this list, so `tick(save, 'crew')` is now the error it always should have been.
 */
export const PHASE_ORDER = freeze(['board', 'guard', 'envelope', 'call', 'answer', 'payout', 'bagpush', 'brief', 'getaway', 'debrief']);

/** The phases that count as GAME time; `answer` is the only one that counts as ANSWER time. */
export const GAME_PHASES = freeze(['board', 'guard', 'envelope', 'call', 'payout', 'bagpush', 'brief', 'getaway', 'debrief']);
export const ANSWER_PHASES = freeze(['answer']);

/**
 * G1's four shapes. Only PRIMITIVES live here — `targets`, `tierMix`, which fixed-phase column the
 * shape uses, and how many brief windows it gets. Answer seconds, decision seconds, game seconds,
 * wall clock, the split and `L̄` are all DERIVED in `econ.shapeTable()`.
 *
 * **`tierMix` IS A BUDGET, NOT A DRAFT (round 3).** `targets` is binding — `composeBundles` serves
 * exactly `budget.targets` locks — but `tierMix` is not: the composer prices whatever `composePage`
 * had due that night, and a posted JOB's real mix runs T1 ≈ 4 / T2 ≈ 5.4 against the `{1: 8, 2: 2}`
 * below. Everything `tierMix` feeds is therefore nominal too: `econ.answerSeconds`,
 * `decisionSeconds`, `lootMean`, `shapeTable`, and `page.jobBudget().minutes`. The measured
 * counterpart is `PUBLISHED.shapeTableDrafted`, and `job-shape-measured.test.mjs` keeps the two
 * honest about each other. Do not "correct" one into the other: the budget is what the shape is
 * designed to cost and the measurement is what tonight's page makes it cost.
 *
 * NOTE on VAULT: it takes the JOB fixed column, which credits TWO brief windows, but the windows land
 * after targets 4 and 8 and a VAULT has 7 targets. `briefs: 2` is the CEILING the shape is allowed,
 * not a promise the shape can keep — `econ.landedBriefs()` clamps it to the windows that can
 * actually open (`{n ∈ BOARD.briefAfterTargets : n < targets}`), exactly as `board.js projectFor`
 * already did, and `econ.fixedSeconds` / `econ.decisionCount` are charged from the clamp.
 *
 * That clamp used to be missing from the published side only, which is how the table and the board
 * came to disagree by construction: `decisionCount('VAULT')` said 18 mandatory while a VAULT played
 * to a crack produces 17, and the debrief prints both in one line. VAULT's published row is now
 * 296/388 game-seconds (one `brief` cell, not two) and 17/24 decisions. Round 2, split-honesty.
 * The alternative fix — moving the second window to a target a VAULT has — is a G1 change, not a
 * data one; if it is ever taken, `landedBriefs` returns 2 on its own and nothing else moves.
 */
export const SHAPES = deep({
  RUN: {
    id: 'RUN', name: 'RUN', targets: 6, tierMix: { 1: 6 },
    fixed: 'RUN', briefs: 1, vault: false,
    when: 'school window, or a short sitting',
  },
  JOB: {
    id: 'JOB', name: 'JOB', targets: 10, tierMix: { 1: 8, 2: 2 },
    fixed: 'JOB', briefs: 2, vault: false, isDefault: true,
    when: 'evening default',
  },
  JOB12: {
    id: 'JOB12', name: 'JOB', targets: 12, tierMix: { 1: 7, 2: 4, 3: 1 },
    fixed: 'JOB', briefs: 2, vault: false,
    when: 'when plan.qFor says 12 and you take it in one sitting',
  },
  VAULT: {
    id: 'VAULT', name: 'VAULT', targets: 7, tierMix: { 1: 3, 2: 2, 3: 1, 4: 1 },
    fixed: 'JOB', briefs: 2, vault: true,
    when: 'when page.bossReady(save) fires',
  },
});

export const SHAPE_IDS = freeze(Object.keys(SHAPES));

/** G1 "the reframe" — the decision count, per shape, computed by `econ.decisionCount()`. */
export const DECISIONS = freeze({
  draft: 1, press: 1, getaway: 1,
  /** CALL is one per target; BAG/PUSH is one per target except the vault target (getaway instead) */
  callPerTarget: 1, bagPushPerTarget: 1, bagPushExcludesLast: 1,
  /** a brief window is 1 decision skipped, up to 5 used */
  briefOptionsMax: 5,
  /** the two optional extras on the full-use path */
  commitFull: 1, backchecksFull: 2,
});

/** G9 #1 / G10 #17 — what the split claim actually is. No constant-ratio assertion anywhere. */
export const SPLIT = freeze({
  agreeWithinPoints: 5,
  densityMinDefault: 2, densityMinFull: 3,
  deadMs: 0,
  projectionWindowJobs: 5,
});

/* ==========================================================================================
   G1 / G4 — the board
   ========================================================================================== */

export const BOARD = freeze({
  /** `composeBundles` posts `min(5, available)` contracts (G4 response 1) */
  postedMax: 5,
  /**
   * What *available* means in that `min(5, available)`: a contract is at least this many locks, so
   * `posted = clamp(floor(queue / minLocks), 1, postedMax)` and a thin queue makes a thin board.
   * Not published in COMPOSED-GAME; requested here by notes/J5.md §7 and moved at integration, so
   * `js/page.js JOB_MIN_LOCKS` re-exports this rather than declaring a second copy of it.
   */
  minLocks: 2,
  /** posted → how many you draft: 5 → 3 · 4 or 3 → 2 · ≤ 2 → no draft */
  draftFor: freeze({ 0: 0, 1: 0, 2: 0, 3: 2, 4: 2, 5: 3 }),
  /** every critical item is replicated into ≥ 3 of the 5 bundles (G3.7 proof 7) */
  criticalReplicationMin: 3,
  /** critical = bucket ≤ 2, or overdue ≥ 1 day, or test-clamped */
  criticalBucketMax: 2, criticalOverdueDays: 1,
  /** the brief windows land after these target indices (1-based) */
  briefAfterTargets: freeze([4, 8]),
  /** the Dry board posts a Variant job at scope 0.8 */
  dryBoardScope: 0.8,
  /** the board reads `ends HH:MM` off the shape's own projected wall clock */
  printsEndTime: true,
});

/** G2 — Backchecks: the only consumable, minted by the dullest work. */
export const BACKCHECK = freeze({
  max: 3,
  mintPerDay: 1,
  /** a day with ZERO dues mints nothing (G12 #38) */
  requiresDuesAtLeast: 1, requiresAllDuesCleared: true,
  /** 1 per vault cracked with no Backcheck spent, cap 1/day */
  mintPerCleanVault: 1,
  /** not available ON the vault itself */
  allowedOnVault: false,
  /** shields the STAKE and only the stake — the calls[] rating entry is written regardless (G12 #26) */
  shieldsStakeOnly: true,
});

/** G2 — the Fault Index: the one new collection. */
export const FAULT_INDEX = freeze({
  tags: 68, areas: 11,
  sealResolutions: 3, sealDistinctDays: 3, sealRequiresNoRetrigger: true,
  /** milestones the trophy predicates read (G7 data/trophies.js) */
  milestones: freeze([25, 68]),
});

/* ==========================================================================================
   G5 — the week and quiet hours
   ========================================================================================== */

export const WEEK = freeze({
  /** D ≥ 3: the board is Home's primary action when plan.modeFor(save) === 'page' */
  boardFromD: 3,
  /** D = 2: the REVIEW BOARD — every contract is dues, no vault, no guard, no tokens, flat ladder */
  reviewBoardD: 2,
  /** D = 1: no board at all; Home links #/run/night */
  nightD: 1,
  /** D = 0: Test Morning — the final ledger and `Go.` */
  morningD: 0,
  /** after 22:00 no new board posts; a job in progress auto-bags at the next target boundary */
  quietHour: 22,
  /** any shape whose PROJECTED end time passes 22:00 is refused (computed, not a 21:30 constant) */
  refuseIfEndsAfterHour: 22,
  /** Mon–Fri 07:00–14:15 posts the RUN shape only */
  schoolWindow: freeze({ days: freeze([1, 2, 3, 4, 5]), fromMin: 7 * 60, toMin: 14 * 60 + 15 }),
  /** G3.9 — the two commitment declarations the board offers */
  commitDefaults: freeze({ walkAtMinutes: 12, doneByMin: 21 * 60 + 45 }),
});

/** G5 — the REVIEW BOARD's overrides at D = 2. */
export const REVIEW_BOARD = freeze({ vault: false, guard: false, tokens: false, callsOptional: true, flatLadder: true, backchecksFree: true });

/* ==========================================================================================
   G7 — save schema
   ========================================================================================== */

/** G7 — `CAPS.game`. Four caps, all of them. */
export const CAPS = freeze({ calls: 50, log: 30, tags: 68, bundles: 5, heat: 10 });   // heat === GUARD.xHatWindowJobs (notes/J3.md §5.5)

/**
 * G7 — the measured budget for the game layer's keys, with a job in progress. J10 asserts
 * ≤ `totalAdded`. Every line is the byte count `job-save.test.mjs` prints, rounded UP to 0.1 KB — a
 * ceiling, not an estimate, and asserted per line. The five lines sum to exactly `totalAdded`.
 *
 * RESTATED THREE TIMES, and each time the previous fix had stopped one level short.
 *
 * Round 1 found that the per-line figures were estimates written before the record existed and that
 * `tests/_helpers.mjs`'s `inProgress.game` fixture was 8 keys short of what `serialize()` emits, and
 * re-measured: 25.69 KB. That fixture was a fixed point of the SERIALISER, so its SHAPE could not
 * drift again — but its VALUES were still hand-typed, and four of them were narrower than the shipped
 * writers emit (`rating: 7.1234` where `call.ratingDetail()` returns `6.685919999999999`). Rebuilt
 * off the writers, the same carrier measured **26.33 KB** — the published bound was false by 340 B
 * while every assertion stayed green, because 313 B was all the margin it had.
 *
 * Round 2 re-measured with (a) every unrounded double priced at the widest JSON form a double can
 * take, (b) `inProgress.game.calls` at the 23 a real JOB12 reaches rather than the 12 it drafts —
 * requeues and brief-window swaps write calls too — and (c) `inProgress.bench`, a game-layer-only key
 * worth ~1.9 KB that round 1 never priced and `withoutGameKeys` charged to the STUDY half.
 * Measured: player 3.92 · game 14.84 · inProgress.game 5.34 · bench 1.85 · runs[] delta 5.39
 * → **31.32 KB** added, of which 25.97 KB was said to be what the app writes TODAY.
 *
 * Round 3 found three more lines, all of them the round-2 mistake one level deeper. (a) The EIGHT
 * fields the layer adds to every `inProgress.queue` entry (`page.draftUnion` adds `from, sources,
 * wing, posted, x2, critical`; `state.swapIn` splices in bench entries carrying `basePosted,
 * declined`) — `withoutGameKeys` stopped at the `inProgress` KEY LIST, so 4.4 KB was charged to the
 * STUDY half and counted in no row; both carriers dodged it, one with `queue: []` and the other with
 * synthetic study-only items. (b) The six trophies only a job can earn, 199 B, in neither half.
 * (c) `inProgress.game.calls` was priced at 26 against a "measured 23" that was measured on a corpus
 * which never took a swap: the driver passed `brief(save, { swap: id })` where `state.brief` wants
 * `{ swap: { id } }` and silently ignores anything else. Real JOB12s reach 28. The count is now
 * DERIVED — `queue ≤ 2 × (drafted + bench) = 36`, `calls ≤ queue` — not observed.
 * Measured: player 3.92 · game 14.83 · inProgress.game 6.27 · bench 1.85 · queue delta 4.39 ·
 * trophies 0.19 · runs[] delta 5.35 → **36.84 KB** added, of which 31.46 KB is what the app writes
 * TODAY (`subtotal`: the `runs[]` line is reserved — no shipped path writes a run record from a job
 * yet). See notes/save-fix.md.
 *
 * Round 4 found the SAME defect one level further out again: `inProgress.meta.before`, the
 * before-snapshot. `screens/run.js:856` writes the flat Page's five keys into it; `captureJobBefore`
 * writes those five PLUS seven of its own (`tags, index, rating, startedAt, seed, seedTag,
 * composed`) and `screens/job.js` calls it inside `update()` on every job, so they reach disk.
 * `withoutGameKeys` had stripped `inProgress`'s key list and the queue ENTRIES and stopped there, so
 * 2.4 KB was charged to the STUDY half and counted in no row — and neither carrier wrote an
 * `inProgress.meta` at all, so it was measured in NEITHER half, exactly as the bench, the queue
 * fields and the trophies had been. The list is no longer hand-maintained: `job-save.test.mjs`
 * derives it by diffing run.js's own flat-Page literal against what `captureJobBefore` returns over
 * a corpus of real jobs (that diff is what found `composed`, added in the same round).
 * Measured (round 5, with `params` and `tellOff` priced): player 3.95 · game 14.83 ·
 * inProgress.game 6.29 · bench 1.94 · queue delta 4.39 · meta delta 2.40 · trophies 0.19 ·
 * runs[] delta 5.35 → **39.39 KB** added, of which 34.04 KB is what the app writes TODAY.
 * See notes/repair-save.md.
 */
/* Every figure is the MEASURED byte count rounded up to 0.1 KB — `tests/job-save.test.mjs` asserts
   each line at or under its figure, the lines summing to `totalAdded`, and `subtotal` between the
   measurement and `totalAdded − runsDelta`. `subtotal` moved 31.5 → 31.6 at integration: S3.1(c)'s
   `player.records.bestRating` shipped, which costs the saturated carrier 34 B (`player` 3.92 →
   3.95 KB, subtotal 31.46 → 31.53 KB, totalAdded 36.84 → 36.88 KB). No per-line ceiling moved —
   only the subtotal's rounding step was exhausted. Restating a row means restating G7's table row
   with it; the spec correction is filed in designs/SPEC-CORRECTIONS.md.
   ROUND 4 (verify) adds the `metaDelta` row — `inProgress.meta.before`'s seven game fields, 2 459 B
   measured on the saturated carrier — and restates the two summary rows with it: subtotal
   31.6 → 34.0, totalAdded 37.1 → 39.6 (the line ceilings still sum to the headline, which
   `job-save.test.mjs` asserts). COMPOSED S6's restated arithmetic then closes at
   500 000 + 39.6 KB = 540 550 B of 528 KB = 540 672 B — 122 B to spare, so the NEXT line that moves
   restates COMPOSED.md S6 too. Spec correction filed in designs/SPEC-CORRECTIONS.md.
   ROUND 5 (verify) — AND THAT NEXT LINE MOVED. `bench` 1.9 → 2.0 and, with it, subtotal 34.0 → 34.1
   and totalAdded 39.6 → 39.7. Two keys the fixtures did not price were found on the SHIPPED
   writers: `params` (the S7 algebra floor's, `site/js/page.js:392`, persisted by `freezeVariant`
   and re-emitted on every later due of that frozen Variant, so a worst-case queue carries it on
   every entry — 92 B of it lands on `inProgress.bench`, which is wholly the layer's) and `tellOff`
   (`js/job/state.js` EXTRA_KEYS' tenth, 17 B on `inProgress.game`). Both were charged to no row and
   priced in no fixture. COMPOSED S6's two-bound arithmetic now closes at
   500 000 + 39.7 KB = 540 652.8 B of 540 672 B — **19 B**, and the closure is arithmetic on two
   BOUNDS, not a measurement: the saturated carriers are 1 KB (state.test.mjs) and 5.3 KB
   (job-save.test.mjs) past it in the STUDY half, which is T01's bound to move, not this layer's.
   The margin is now thinner than a single unpriced key, so the next line that moves cannot be
   absorbed here at all — it restates COMPOSED.md S6. Spec correction filed in
   designs/SPEC-CORRECTIONS.md; see notes/repair-save.md round 5. */
export const SAVE_BUDGET_KB = freeze({ player: 4.0, game: 14.9, inProgress: 6.3, bench: 2.0, queueDelta: 4.4, metaDelta: 2.5, trophies: 0.2, runsDelta: 5.4, subtotal: 34.1, totalAdded: 39.7 });

/**
 * G7's save-schema delta, v1 → v2. TWO top-level keys, because store.js archives top-level keys only
 * (G10 #20): `player` goes to KEPT_KEYS, `game` to ARCHIVED_KEYS.
 * These are the DEFAULTS J10's migration writes; every field G7 names is present.
 */
export const SAVE_DEFAULTS = deep({
  player: {
    rating: { calls: [], value: 5.0, n: 0 },
    rank: 2,
    elo: { player: 1000, house: 1000 },
    /* `bestRating` — REPAIR-DECISION S3.1(c), the rank ratchet's audit record. Under a rank FLOOR
       `player.rank` stops being recomputable from the 50-call window, so the high-water RATING that
       bought the rank is stored beside it and printed on Settings/Stats (`· best rating 9.90`).
       Declared HERE and in `store.js freshPlayer()` in the same change — `tests/job-save.test.mjs`
       deep-equals the two copies of this schema in both directions (notes/repair-save.md Request A,
       notes/repair-meta.md Request 1, notes/repair-state.md Request 4, all landed at integration). */
    records: { bestBag: 0, bestChain: 0, bestRating20: 0, bestRating: 0, cleanJobs: 0, cracked: 0, walked: 0, cleanGetaway: false },
  },
  game: {
    crew: {},
    /* `window` is `guard.pushHeat`'s own schema addition (notes/J3.md §5.5 → J10): the last
       `GUARD.xHatWindowJobs` jobs that pressed tokens, `[{press: {wing: n}, posted}]`. Declared here
       so the migration writes it rather than letting it appear as an unvalidated pass-through key on
       the first job end. Capped by `CAPS.game.heat`. */
    heat: { press: { RECALL: 0, FIGURES: 0, WORDS: 0, ALGEBRA: 0 }, weight: 0, jobs: 0, window: [] },
    tags: {},
    backchecks: { held: 0, mintedDay: null },
    /* `debriefAt` — stamped by `state.endJob` on EVERY job end and read back by `closeDebrief`
       (`now − debriefAt` is the only way the debrief's own phase mean can be measured). It was
       shipped for a whole round without appearing in ANY of the three places that are supposed to be
       the schema — here, `store.freshGame()` and G7 — and survived reloads only because
       `normalizeGame`'s `over()` is not a whitelist. Declared, priced and coerced at the round-2
       save audit; see notes/save-fix.md round 2 §4. */
    ledger: { jobs: 0, tGame: 0, tAnswer: 0, phaseMeans: { board: 18, guard: 12, brief: 20, getaway: 25, debrief: 65 }, debriefAt: null },
    log: [],
    commit: { kind: null, byMin: null, honored: 0, bound: false },
  },
});

/** G7 — one tag record's shape. `days` is a COUNT plus a last date, never an array (G12 #18). */
export const TAG_RECORD_DEFAULT = freeze({ resolved: 0, triggered: 0, days: 0, lastDay: null, cleared: false, sealed: false });

/** G7 — `inProgress.game`, the mid-job resume record. The SEED IS PINNED (G3.7 proof 6). */
export const IN_PROGRESS_KEYS = freeze([
  'shape', 'seed', 'bundles', 'picks', 'tokens', 'guard', 'loose', 'bagged', 'chain',
  'calls', 'briefs', 'vault', 'tGame', 'tAnswer', 'phase', 'phaseAt',
]);

/* ==========================================================================================
   G6 — fiction, copy, glyphs, juice
   ========================================================================================== */

/** G1 — the fourteen nouns the fiction adds. All one word, all printed beside a number. */
export const NOUNS = freeze(['Board', 'Contract', 'Target', 'Envelope', 'Call', 'Loose', 'Bagged', 'Chain', 'Wing', 'Guard', 'Tell', 'Crew', 'Vault', 'Ledger']);

/** G1 — the seven verbs, each one key, each one an actual decision. */
export const VERBS = deep([
  { id: 'DRAFT', keys: ['1', '2', '3', '4', '5'], when: 'board', decides: 'which 3 of 5 posted contracts you take' },
  { id: 'PRESS', keys: ['ArrowLeft', 'ArrowRight'], when: 'board', decides: '3 pressure tokens across the drafted wings' },
  { id: 'COMMIT', keys: ['c'], when: 'board', decides: 'a binding walk-away minute or a done-by time' },
  { id: 'CALL', keys: ['1', '2', '3', '4'], when: 'per target, before the stem', decides: 'confidence, which sets payout and penalty' },
  { id: 'ANSWER', keys: [], when: 'per target', decides: 'the mathematics, graded by the existing engine' },
  { id: 'BAG', keys: ['b'], when: 'per target, after the payout line', decides: 'bank the loose pile' },
  { id: 'PUSH', keys: ['Enter'], when: 'per target, after the payout line', decides: 'keep the chain' },
  { id: 'CRACK', keys: ['k'], when: 'getaway', decides: 'all-in on the vault' },
  { id: 'WALK', keys: ['w'], when: 'getaway', decides: 'leave with the bag' },
]);

/** G6 "Keyboard-complete" — the full key map, one place. */
export const KEYS = freeze({
  draft: freeze(['1', '2', '3', '4', '5']),
  tokens: freeze(['ArrowLeft', 'ArrowRight']),
  commit: 'c', call: freeze(['1', '2', '3', '4']),
  push: 'Enter', bag: 'b', crack: 'k', walk: 'w', walkConfirm: 'Escape',
});

/** G1 — the failure states, all named, all non-destructive. */
export const STATES = deep({
  CALL_IT: { id: 'CALL_IT', label: 'CALL IT', when: 'LOOSE 0 and chain 0 with ≥ 3 targets left', minTargetsLeft: 3, hintsOn: true, postedRecorded: 0 },
  WALKED: { id: 'WALKED', label: 'Walked', when: 'quit', autoBag: 0.50 },
  KNOCKED: { id: 'KNOCKED', label: 'Knocked', when: 'a vault boss KO', keeps: 'XP, mastery, tiles', forfeits: 'the stamp' },
  BOARD_CLOSED: { id: 'BOARD_CLOSED', label: 'Board closed', when: 'after 22:00 no job posts' },
  DRY_BOARD: { id: 'DRY_BOARD', label: 'Dry board', when: 'nothing due and nothing new in range', scope: 0.8 },
  THIN_BOARD: { id: 'THIN_BOARD', label: 'Thin board', when: 'a wing supply is short and fewer than 5 contracts post' },
  COLD_CREW: { id: 'COLD_CREW', label: 'Cold crew', when: 'a make crew is idle on its own due-review target' },
});

/**
 * G6 — the copy table, verbatim, as template functions. The voice rule is enforced by J12's lint over
 * this object: no exclamation mark, no second-person praise, no emoji, numbers first; a miss names the
 * make, the tell and the number and stops.
 */
export const COPY = deep({
  /* `· weight ${w}`, NOT `×${w}` (round 3 verification, player-feel, MAJOR — filed from this table's
     one caller, `screens/job.js payoutLineOf`, as Request 3 in notes/repair-screen.md in two
     consecutive rounds). `credit` is fed the MEASURED move of `player.rating.value` over the target,
     and `Δrating = 2·w·c/N` — the move ALREADY contains `w`. So the `×` claimed a product that is
     not any quantity in the system: `rating +0.23 ×0.89` invites 0.205, which is nothing. The two
     facts stay, side by side, with no operator asserting a relation between them. */
  clear: ({ loose, chain, credit, w }) => `+${loose} loose · chain ${chain} · rating ${credit >= 0 ? '+' : '−'}${Math.abs(credit)} · weight ${w}`,
  ladder: ({ attempt, crew, rho, loose }) => `attempt ${attempt} · crew ${crew} forgives one · ρ ${rho} · +${loose} loose`,
  miss: ({ make, tell, loose, chain }) => `${make} · tell: ${tell} · −${loose} loose · chain ${chain}`,
  bag: ({ bagged, fee, chainBefore }) => `bagged ${bagged} · fee ${fee} · chain ${chainBefore} → 0`,
  bagPrompt: ({ amount, fee, chainBefore }) => `bag ${amount} (fee ${fee} · chain ${chainBefore} → 0)`,
  /** `tokens` is the pre-composed list built from `COPY.guardToken` (G6's line puts the ×mult inline). */
  guard: ({ wing, tokens }) => `GUARD: ${wing}.  your tokens: ${tokens}`,
  guardToken: ({ wing, n, mult, guarded }) => (mult == null ? `${wing} ${n}` : `${wing} ${n} (${guarded ? 'guarded, ' : ''}×${mult})`),
  vault: ({ make, grade, hits, of, q }) => `${make} grade ${grade} · your last ${of}: ${hits}/${of} · crack breaks even at ${q}`,
  walk: ({ bagged, rating, rank, thinking, deciding, decisions }) => `bagged ${bagged} · rating ${rating} (${rank}) · ${thinking} thinking / ${deciding} deciding · ${decisions} decisions`,
  /** `did` is the past tense of what the student actually did: 'bagged' | 'pushed'. */
  /* VERIFY r2 (player-feel), the other half of finding 40's block: this `cost` had NO UNIT while
     `regret2` directly under it printed `cost 3.5 credit.`, so the debrief read
     `… cost 35.` / `… envelope 2: … cost 3.5 credit.` as two consecutive paragraphs under one
     heading, and a reader compares 35 with 3.5. They are not comparable: this one is
     `econ.regretLine`'s `optimal − actual`, both terms out of `playOrder`, whose docstring is
     "replay a realised order … and return the final BAGGED" — the unit of the `BAGGED 455` hero
     four inches above it. The remedy is the word, exactly as it was for `regret2`. */
  regret: ({ did, chain, said, qStar, qHat, cost }) => `you ${did} at chain ${chain}; the threshold said ${said} (q* ${qStar}, your q̂ ${qHat}). cost ${cost} bagged.`,
  /* FINDING 40 (BLOCKER), landed at integration: `cost` is a CREDIT gap — the `c` of `c(p, o)` —
     and the word was `rating`. One credit point is not one rating point: a slot contributes
     `RATING.scale·w·c / RATING.N = w·c/25` to the rating, so the sentence overstated the rating cost
     by 25–64× on the four cases notes/repair-run.md Request 1 measured (`cost 1.4 rating` for 0.0216
     rating points). The remedy is the WORD, not the number: converting to rating points puts every
     real case under `jobRegret`'s own `Math.round(cost*10)/10 > 0` gate, which would delete G5 #2's
     teaching line entirely. `call.regretOf().ratingCost` is the converted figure for any surface
     that wants it. G5 #2's worked line moves with this — designs/SPEC-CORRECTIONS.md. */
  regret2: ({ envelope, called, evMax, cost }) => `envelope ${envelope}: you called ${called}, EV-max was ${evMax}. cost ${cost} credit.`,
  /* VERIFY r3 (call-propriety), and the reason there are now TWO call-regret lines: ONE WORD CANNOT
     NAME BOTH RUNGS. `regret2`'s `EV-max` is the rung `screens/settings.js` publishes under that
     same word (`evMaxBands()`, the CARRY argmax) everywhere the two ladders agree — which is
     everywhere outside G3.1's two disagreement bands, so the sentence above is true as published
     (G5 #2's worked line is at q̂ = .75, where `honestCall === argmaxCall === 70`). INSIDE the two
     bands they are different rungs, and the debrief prices the honest one because that is the
     currency it prints (`screens/run.js DEBRIEF_CALL_LADDER`): printing it under Settings' word
     told a student who had followed Settings' table that their own call was the mistake — at
     q̂ = 8/9 the table says 95 and the debrief said "EV-max was 85. cost 0.1 credit". In the bands
     the line names BOTH rungs in Settings' own words (*"the money says call 95, the rating says
     call 85"*) and does not use the word EV-max at all, because G3.1 calls the bands "the only
     place in the game where the player must choose what they are playing for" and the debrief is
     where that choice is finally teachable (Global law 6: evidence after the decision). */
  regret2Split: ({ envelope, called, money, rank, cost }) => `envelope ${envelope}: you called ${called}. the money said ${money}, the rating said ${rank}. cost ${cost} credit against ${rank}.`,
  /* Home's resume link when a JOB is live. `startJob` writes `inProgress.kind = 'page'`, so without
     this the student is sent back to the flat page with the stakes still on the disk (notes/J5c.md
     §7, notes/J6.md §7 — both flagged it, neither owned `plan.js`). */
  resumeJob: ({ n, of }) => `Continue the job · ${n} of ${of}`,
  crewIdle: ({ make }) => `${make} crew idle — this target is its own due review`,
  /* The brief's crew re-rank (G1's fifth brief option; added at integration, notes/J13.md Request 4).
     Both carry a digit, as every ledger-shaped line in this table must. */
  crewBudget: ({ manned, mannedMax, spent, capacity }) => `crew ${manned}/${mannedMax} manned · ${spent}/${capacity} points`,
  crewRefused: ({ make, why }) => `${make} stays as it is — ${why}`,
  crewDemoted: ({ make }) => `${make} crew HELD → STEADY — the Mock says it is not held.`,
  sealed: ({ tag }) => `${tag} sealed · tell 1.00`,
  thin: ({ contracts, draft, wing, locks }) => `thin board · ${contracts} contracts · draft ${draft} · ${wing} ${locks} locks available today`,
  quiet: ({ readiness, due }) => `Board quiet · Readiness ${readiness} · ${due} due`,
  closed: ({ minutes, ends }) => `Board closed · Night Before · ~${minutes} min · ends ${ends}`,
  callIt: ({ left }) => `stakes off · ${left} targets left · hints on`,
  /* --- G1 / G5 --- */
  envelope: ({ make, name, grade, cold, posted, from, tell }) =>
    `${make} · ${name} · grade ${grade} · cold ${cold} d · posted ${posted} · from ${from}${tell ? ` · tell: ${tell}` : ''}`,
  evidence: ({ hits, of, make }) => `your last ${of} on ${make}: ${hits}/${of}`,
  primary: ({ shape, targets, minutes, ends, split }) => `${shape} · ${targets} targets · ~${minutes} min · ends ${ends} · ${split} % game`,
  postedNet: ({ gross, shared }) => `posted ${gross} (−${shared} shared)`,
  /** the drafted union when no lock is shared — the flat half of `postedNet` (J5 §6.1, §7). */
  postedFlat: ({ posted }) => `posted ${posted}`,
  /**
   * G1 "TONIGHT'S BOARD" — one posted contract, verbatim as `job/board.js` composes it today
   * (J5 §7 asked for the home; `board.js` switches to this call and the string stops being local).
   * `locks` is a count, `cold` is truthy when the bundle's locks are cold, `wing` may be null.
   */
  contractRow: ({ id, label, locks, cold, gradeLabel, posted, minutes, wing }) =>
    `${id}  ${String(label).padEnd(8)} · ${locks} ${cold ? 'cold ' : ''}locks · ${gradeLabel} · posted ${posted} · ~${minutes} min · ${wing ?? '—'}`,
  /** G6 — the board panel's own heading, which is the only word that changes at D = 2. */
  boardTitle: ({ review }) => (review ? 'REVIEW BOARD' : "Tonight's Board"),
  /** G5 "D = 2" — the REVIEW BOARD's line (J11 composes it in `home.js` today; §7). */
  reviewBoard: () => 'REVIEW BOARD · every contract is dues · no vault · no guard · flat ladder',
  /** G5 "School window" — Mon–Fri 07:00–14:15 posts the RUN shape only, and says why. */
  schoolWindow: () => 'School window · RUN only · Mon–Fri 07:00–14:15',
  /* `jobs === 1` is the ordinary state after a student's first real job — the board and Home both
     count only jobs that answered a target, so a walk no longer pads the number up past it. */
  projection: ({ split, jobs }) => (jobs > 0
    ? `~${split} % game · your last ${jobs} job${jobs === 1 ? '' : 's'}`
    : `~${split} % game · projected`),
  guardColdStart: ({ n }) => `no data — uniform 1/${n}`,
  guardSupport: ({ n }) => `guard: ${n} wings on the board`,
  /* The brief's ONE ATOMIC SUBMIT label (S5.3 item 4, notes/repair-screen.md Request 1). It was a
     screen literal in `screens/job.js` with a `typeof COPY.repressMove === 'function'` guard around
     it; the words live here now, beside every other printed line the layer owns. */
  repressMove: () => 'Move one token · the guard redraws',
  supply: ({ wing, locks }) => `${wing} ${locks} locks available today`,
  leftOnPage: ({ left }) => `${left} left on Today's Page`,
  /* `0.5` was typed here while `SCOPE_MIRROR.repeat` is the single source of the same number —
     interpolated at integration so the copy cannot outlive a change to the scope table. (This entry
     still has no call site: `tests/job-copy.test.mjs` §10 pins the dead list by name and count, and
     G3.7(3)'s anti-grind story wants it on the second board of an evening — notes/repair-tests.md
     Request 2, notes/repair-meta.md Request 6. Routing it or deleting it is a product decision and
     is recorded as still-open in the integration note.) */
  repeat: () => `repeat · scope ${SCOPE_MIRROR.repeat}`,
  dryBoard: () => 'low-value board: variants only',
  coldCrew: ({ idle, dues, minutes }) => `${idle} crew idle on their own reviews · ${dues} dues · clear them first — ${minutes} minutes`,
  walkConfirm: ({ amount }) => `Bag ${amount} first?`,
  walkBagLabel: () => 'Bag & leave',
  walkLeaveLabel: () => 'Leave',
  quietBanked: () => 'Banked at 22:00. Nothing lost.',
  quietReview: () => 'REVIEW · no stakes',
  keepGoing: () => 'keep going anyway',
  refuse: ({ ends, minutes }) => `that ends at ${ends} — take the ${minutes}-minute RUN instead?`,
  night: ({ minutes, ends }) => `No board tonight · Night Before · ~${minutes} min · ends ${ends}`,
  morning: () => 'Go.',
  /* REPAIR-DECISION S3.1(d), landed at integration (notes/repair-week.md Request 4: Home's board
     line no longer prints a rating at all, so this is the whole of the fix). TWO changes, both copy:
     the line LEADS WITH THE HELD RANK — after the S3 ratchet `player.rank` is a floor and is no
     longer recomputable from the window, so it is the number the student actually holds — and where
     `n === 0` it prints the words instead of a bare `5.00`. `rating 5.00 · 0/50 informative calls`
     beside `Called 5` was the app reporting measured cowardice at a student playing the best they
     ever have: 5.00 has two causes and an empty window is the other one. The wording is shipped
     copy, promoted here from `screens/job.js payoutLineOf`'s blank-slot branch. */
  ratingLine: ({ rank, rating, n, N }) => (Number(n) > 0
    ? `${rank} · rating ${rating} · ${n}/${N} informative calls`
    : `${rank} · rating unchanged · no measurement · ${n}/${N} informative calls`),
  deflation: () => 'posted falls as you master the material. That is the point.',
  collapsedBoard: ({ wing, tokens, loose, mult, chain }) => `${wing} ⟨${tokens}⟩ · loose ${loose} · ×${mult} · chain ${chain}`,
  commitWalk: ({ minutes }) => `WALK AT ${minutes}`,
  commitDoneBy: ({ at }) => `DONE BY ${at}`,
  foothold: () => 'FOOTHOLD',
  cleanGetaway: () => 'Clean Getaway',
});

/** G6 — the chain ticks. Geometric-shape glyphs, not emoji; kept out of the copy strings. */
export const GLYPHS = freeze({ chainFilled: '▮', chainEmpty: '▯', tokenOpen: '⟨', tokenClose: '⟩' });

/** G6 — the animation budget. SIX cues, all transform/opacity, all ≤ 600 ms, all 0 ms reduced-motion. */
export const ANIMATION = deep({
  cues: [
    { id: 'envelope-flip', ms: 180, prop: 'transform' },
    { id: 'call-lock-snap', ms: 120, prop: 'transform' },
    { id: 'loose-tween', ms: 300, prop: 'opacity' },
    { id: 'chain-tick', ms: 150, prop: 'transform' },
    { id: 'guard-bars', ms: 250, prop: 'transform' },
    { id: 'bag-drop', ms: 600, prop: 'transform' },
  ],
  maxMs: 600,
  bagDrop: { ms: 600, staggerMs: 40, translate: '-1.2em', oncePerJob: true, fullScreen: false },
  reducedMotionMs: 0,
  noRotateOnEnvelope: true,
});

/** G6 — four sound cues, off by default, muted after 22:00. */
export const SOUND_CUES = deep([
  { id: 'job-call-lock', hz: 520, ms: 40 },
  { id: 'job-chain-tick', hz: null, ms: 40, pitch: 'xp.comboPitch' },
  { id: 'job-vault', hz: 330, toHz: 660, ms: 200, missHz: 110 },
  { id: 'job-bag-drop', hz: null, ms: 300, shape: 'descending six-note arpeggio' },
]);

/** G6 — the header and the phone layout, both load-bearing and both asserted by J6. */
export const HEADER = freeze({
  itemsDuringJob: 5, itemsOutsideJob: 6,
  hiddenDuringJob: freeze(['hdr-level', 'hdr-streak', 'hdr-xp', 'hdr-combo']),
  keptDuringJob: freeze(['hdr-readiness', 'hdr-tminus']),
  addedDuringJob: freeze(['hdr-loose', 'hdr-bag', 'hdr-chain']),
});

export const LAYOUT = freeze({
  boardSheetPx: 264, boardCollapsedPx: 36,
  railPx: 320, railMinWidthPx: 1024, phoneWidthPx: 375,
  collapseAt: 'call-lock',
});

/** G9 #1 / G13 — the cold-open path S9 #1 is pinned to (J13). */
export const COLD_OPEN = freeze({ budgetS: 20, path: freeze([{ step: 'board', s: 6 }, { step: 'primary', s: 0 }, { step: 'guard-accept', s: 4 }, { step: 'call', s: 5 }]) });

/* ==========================================================================================
   PUBLISHED — the numerals G1–G3 print.
   Tests compare COMPUTED values against these. Never the reverse.
   ========================================================================================== */

export const PUBLISHED = deep({
  /** G2 "Loot" — both rows, T1..T4 */
  lootPerAnswerMinute: [12.0, 12.0, 12.7, 14.0],
  lootPerExperiencedMinute: [8.2, 9.5, 10.9, 12.5],

  /** G2 "The build decision" — E[ρ] by band and crew rank. `null` = n/a (HELD needs isMastered). */
  rhoTable: {
    85: { r0: 0.940, r1: 0.972, r2: 0.989 },
    60: { r0: 0.746, r1: 0.853, r2: null },
    40: { r0: 0.562, r1: 0.725, r2: null },
  },
  /** G2 / G3.7 #8 — differences of the ROUNDED table values */
  deltaRhoSteadyM40: 0.163,
  deltaRhoHeldM85: 0.049,
  deltaRhoMasteryM40toM85: 0.378,

  /** G2 — average loot per target, per shape */
  lootMean: { RUN: 6.0, JOB: 8.4, JOB12: 12.7, VAULT: 23.1 },

  /**
   * G3.1 — carry EV by q and call, from `EV = q·W − (1−q)·P` in units of `L·ρ·m·scope·wing`.
   *
   * **CONDITIONAL, and the condition is not in the formula: the pile must be able to pay the loss.**
   * G2's miss branch is `−min(LOOSE, L·m·P·wing_pen)`, so this table is the ladder a player faces
   * only on a DEEP pile (`S ≥ L·m·P`, G3.2). At `S = 0` — which is where a BAG leaves you — every
   * rung's miss term is 0, so a clear branch that paid the full `W` would make the highest call the
   * rank allows **weakly dominant** at every `q`. That was the shipped economy until verify round 1,
   * and bag-every-beat collected it: +95.6 % over honest play at q = 0.50, on 16/16 seeds.
   *
   * **The COVER closes it** (`econ.coverFor`): the `min(LOOSE, ·)` that truncates the price truncates
   * the premium with it — `W_eff = W(50) + (W_call − W(50))·min(1, LOOSE/|nominal miss|)`. On a deep
   * pile the cover is 1 and **this table is exactly the ladder the player faces**; at `S = 0` it is 0,
   * every rung pays `W = 1.0`, no rung is preferred, and the call is settled by the strictly proper
   * rating instead. The argmax column below is still the deep-pile argmax, because that is the only
   * state in which the rungs differ at all; `econ.evMaxCallAt(state)` is the argmax at a real state,
   * and `job-econ.test.mjs §3b` pins both ends. (Round-1 critic finding 4, closed at verify round 1 —
   * see `notes/repair-econ.md`.)
   */
  evTable: {
    0.50: { 50: 0.50, 70: 0.40, 85: -0.10, 95: -1.40 },
    0.60: { 50: 0.60, 70: 0.60, 85: 0.28, 95: -0.68 },
    0.70: { 50: 0.70, 70: 0.80, 85: 0.66, 95: 0.04 },
    0.80: { 50: 0.80, 70: 1.00, 85: 1.04, 95: 0.76 },
    0.90: { 50: 0.90, 70: 1.20, 85: 1.42, 95: 1.48 },
    0.95: { 50: 0.95, 70: 1.30, 85: 1.61, 95: 1.84 },
  },
  carryIndifference: [0.600, 0.7778, 0.88235],
  ratingIndifference: [0.600, 0.775, 0.900],
  /**
   * **The carry ladder's cuts on the GUARDED wing** — `q/(1−q) = wing_pen·ΔP/ΔW` at `wing_pen = 2`.
   *
   * `carryIndifference` above is the `wing_pen = 1`, `ρ̄ = 1` case, and since verify round 2 it is
   * EXACT there at every scope, wing, cold, tell, ×2, chain and pile depth: G2's clear branch pays
   * the call's premium on the STAKE (`L · ×2`) rather than on the gain set, so dressing a target no
   * longer buys upside without downside. The guard is the one multiplier left out of that stake, on
   * purpose — putting it in would double a bold call's PRIZE inside the guard as well as its price
   * and invert the guard outright (a guarded tier-1 at rank 1, chain 3, call 85 would out-earn the
   * safe wing at any `q > 0.870`). So the guarded wing runs the stricter ladder below instead.
   *
   * It is published because a deviation from `carryIndifference` is exactly what the round-2 critic
   * found unpublished, and because the DIRECTION is the safety property: these cuts are ABOVE the
   * rating ladder's at every rung, so inside the guard money asks for more certainty than rank does
   * and a lie is never the best-paid report. `job-econ.test.mjs` §3c sweeps both wings.
   */
  carryIndifferenceGuarded: [0.750, 0.875, 0.9375],

  /**
   * G1 "CRACK / WALK" — **the getaway's two exits, measured** (econ lane, verify round 3).
   *
   * `before` is the shipped machine as it stood: the getaway's call row contains the stake-free 50
   * rung (`CALL_LEVELS[0].P === 0`, so `econ.missFor` returns 0 on it), and answering the vault —
   * even by missing it — made `targetsLeft === 0` and paid `COMPLETION` on the whole bagged pile,
   * which WALK was refused. `CRACK@50 → deliberate miss` therefore banked `×1.10` of WALK **on 200
   * of 200 getaways**, worst branch ×1.0976, and the min-maxer cracked at `q = 0` on every shape.
   * `after` is the same sweep against `econ.exitBonusRate`, which prices the getaway WALK at
   * parity: the miss branch is EXACTLY equal, and CRACK is ahead only on a clear.
   *
   * 50 seeds × 4 shapes, both branches driven to a terminal debrief, the BEFORE column read off the
   * walk debrief's own `baseBagged` (the pre-bonus pile — which is what the old rule banked, to the
   * integer) and the AFTER column off its `finalBagged`. Reproduced in `tests/job-econ.test.mjs` §8.
   */
  getawayParity: {
    seedsPerShape: 50, getaways: 200,
    before: { RUN: 1.1001, JOB: 1.1000, JOB12: 1.1002, VAULT: 1.1004, all: 1.1002, ahead: 200, worst: 1.0976 },
    after: { all: 1.0000, ahead: 0, worst: 1.0000 },
    /** the same 200 getaways, every branch, AFTER — `mean` is Σcrack / Σwalk, `ahead`/`behind` are counts */
    branches: {
      '50-miss': { mean: 1.0000, ahead: 0, behind: 0 },
      '50-clear': { mean: 1.3244, ahead: 200, behind: 0 },
      '70-miss': { mean: 0.7987, ahead: 0, behind: 200 },
      '70-clear': { mean: 1.4054, ahead: 200, behind: 0 },
      '85-miss': { mean: 0.4912, ahead: 0, behind: 200 },
      '85-clear': { mean: 1.4716, ahead: 200, behind: 0 },
    },
    /**
     * The rung's own break-even against walking, `q* = |miss| / (clear + |miss|)` = `P/(W + P)` on a
     * bare vault: **0** at the free rung, which is exactly why CRACK weakly dominates WALK and why
     * the getaway's live decision is the CALL. As FRACTIONS, not decimals, for the same reason
     * `CALL_INDIFFERENCE` is — 3/10, 10/19, 25/36 are 0.300, 0.5263, 0.6944 at 4 dp, and the middle
     * one written as a decimal would trip the G11 rejected-band lint on its own leading digits.
     * Recomputed from `carryFor`/`missFor` on an uncovered pile in `job-econ.test.mjs` §8.
     */
    crackQStarBare: { 50: 0, 70: 3 / 10, 85: 10 / 19, 95: 25 / 36 },
    /**
     * The same threshold on a pile too shallow to back the top rung's premium: the cover lowers it
     * (a premium the pile cannot pay is a premium not charged), so a shallow pile makes the bold
     * call CHEAPER to attempt, never dearer. Only the 95 rung moves at a 300 pile on a tier-4 vault.
     */
    crackQStarCovered300: { 95: 0.6787 },
  },

  /** G3.1 — `w = 4q̂(1−q̂)` */
  weights: { 0.5: 1.00, 0.8: 0.64, 0.9: 0.36, 0.933: 0.25, 0.97: 0.116 },

  /**
   * G3.1 "Sanity" — mean `w·c` per call, computed on the DISCRETE four-rung ladder (the honest rung
   * from `ratingIndifference`), NOT on the continuous optimum. At q̂ = 0.80 the honest rung is 85, so
   * E[c] = 3.5 and w·E[c] = 2.240 — do not "correct" it to the continuous 2.304.
   */
  sanityWc: { 0.70: 1.344, 0.80: 2.240, 0.85: 2.499, 0.90: 2.268 },
  sanityRating: { call50: 5.00, farmMastered: 5.00, q70: 7.69, q80: 9.48, q85: 9.998, q90: 9.54, overcall: 0.00 },

  /** G3.1 point 2 — the CONTINUOUS truthful object `4q̂(1−q̂)·(10 − 40q̂(1−q̂))`, on q̂ ∈ [0.5, 1] */
  wEcPeakQHat: 0.854,
  wEcPeakValue: 2.50,
  wEcBand80: [0.763, 0.925],

  /**
   * G3.2 — deep-pile `q* = θ* / (1+θ*)`, `θ* = m·P/(ρ̄·W·(m−1))` at ρ̄ = 1.
   * DISCREPANCY (recorded in notes/J1.md §5.1; RESOLVED at integration): G3.2 used to print 0.796
   * for (c = 2, call 85); the formula gives 0.7954545… → 0.795 at 3 dp, the published numeral having
   * come from rounding θ* to 3 s.f. first (3.89/4.89 = 0.7955). The FORMULA is the authority, so the
   * value below is 0.795 — and COMPOSED-GAME.md G3.2's table cell now reads 0.795 too, so the two
   * agree. `deepQAsPrinted` is kept as the HISTORY of the numeral the document used to carry.
   */
  deepQ: {
    1: { m: 1.2, 70: 0.720, 85: 0.870, 95: 0.932 },
    2: { m: 1.4, 70: 0.600, 85: 0.795, 95: 0.888 },
    4: { m: 1.8, 70: 0.491, 85: 0.714, 95: 0.836 },
    8: { m: 2.6, 70: 0.411, 85: 0.644, 95: 0.787 },
  },
  /** the numeral G3.2 printed before integration corrected it — history, never truth */
  deepQAsPrinted: { 2: { 85: 0.796 } },

  /** G3.2 — the two worked push/bag rows */
  /**
   * G3.2's two worked rows. **Recomputed for the COVER** (econ lane, verify round 1): the gain term
   * is `m·W_push − W_bag`, not `W·(m − 1)`, because a bag empties the pile that backs the next call
   * and `W_bag` falls to `W(50) = 1.0`. Row 1 was `−40` and row 2 `+90.96` while both branches paid
   * the same `W`; the decisions (BAG, PUSH) are unchanged, which is the point — the cover re-prices
   * the margin, not the verdict.
   */
  workedRows: [
    { S: 300, chain: 0, L: 70, call: 85, q: 0.5, rhoBar: 1, pushMinusBag: -12, decision: 'BAG' },
    { S: 300, chain: 6, L: 70, call: 85, q: 0.8, rhoBar: 1, pushMinusBag: 133.2, decision: 'PUSH' },
  ],
  /** G3.2 — the shallow pile at c = 0 is exactly 0.9 for every L */
  shallowQAtChain0: 0.9,
  /**
   * G3.2's shallow-pile walk, **with the two parameters the numeral needs**. `0.900 → 0.143` is
   * `econ.shallowQStar` over chains 0…8 at `S = 12`, `L = 18`, call 95 — and the c = 8 endpoint is a
   * function of both: 0.042 at `L = 70`, 0.683 at `S = 200`. That is a **16× spread**, so the pair
   * "0.900 → 0.143" is not reproducible from a document that names neither. `econ.js shallowQStar`'s
   * docblock names them; G3.2 prints the numeral bare, which is the finding.
   * Recomputed from `shallowQStar` cell by cell in `job-econ.test.mjs` §5 — including the spread, so
   * the numeral cannot be re-published as parameter-free. (Round 3, econ-math MINOR.)
   */
  shallowQWalk: {
    call: 95, S: 12, L: 18,
    chains: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    q: [0.900, 0.542, 0.388, 0.302, 0.247, 0.209, 0.181, 0.160, 0.143],
    /** the c = 8 endpoint over the realistic states the same one-line claim covers */
    endAtChain8: [
      { S: 12, L: 18, q: 0.143 }, { S: 50, L: 18, q: 0.397 }, { S: 100, L: 18, q: 0.551 },
      { S: 200, L: 18, q: 0.683 }, { S: 12, L: 6, q: 0.326 }, { S: 12, L: 70, q: 0.042 },
    ],
  },
  /**
   * G3.2's **printed `q*`** table — `econ.breakevenQ` on a bare target at `S = 200`, `L = 18`,
   * `ρ̄ = 1`. Seventeen of the eighteen cells are the deep root G3.2 prints under the table,
   * `(L·m·P − 0.10·S) / (L_gain·ρ̄·(m·W − 1) + L·m·P)`. **The eighteenth is not, and that is why this
   * object exists**: at call 95, c = 8, `L_loss·m·P = 234 > S = 200`, so the pile is SHALLOW and the
   * cell is `0.9·S/(A + S) = 0.650`. The deep root reads **0.671** there, so a reader recomputing the
   * last cell from the stated formula misses by 0.021 with nothing in the document to tell them why.
   *
   * **Every cell moved at verify round 1** (the COVER, `econ.coverFor`): the gain term is
   * `m·W_push − W_bag` rather than `W·(m − 1)`, because a bag empties the pile that backs the next
   * call, so `W_bag = W(50) = 1.0`. Pushing therefore keeps a premium bagging forfeits, and every
   * printed threshold falls. The branch census is unchanged — `isDeepPile` is the cover's own ratio.
   * The published value is right; the formula caption is the thing that owes a footnote.
   * `job-econ.test.mjs` §5 recomputes all 18 cells from `breakevenQ`, proves each cell's branch from
   * `econ.isDeepPile`, and pins the census at exactly one shallow cell. (Round 3, econ-math MINOR.)
   */
  printedQ: {
    S: 200, L: 18, rhoBar: 1,
    chains: [0, 1, 2, 4, 6, 8],
    rows: {
      70: [0.000, 0.000, 0.000, 0.000, 0.061, 0.107],
      85: [0.317, 0.362, 0.391, 0.426, 0.447, 0.460],
      95: [0.627, 0.640, 0.649, 0.660, 0.666, 0.650],
    },
    /** every cell `breakevenQ` takes the SHALLOW branch on, with the deep root it is NOT */
    shallowCells: [{ call: 95, chain: 8, lossLmP: 234, deepRootWouldBe: 0.671 }],
  },
  /** G3.3 — the fee's proof of work */
  feeProof: { S: 50.76, L: 6, call: 70, chain: 0, feeTerm: 5.076, lossTerm: 3.6 },

  /** G3.4 — the guard's water-filling projection */
  projectWorked: [
    { n: 3, eps: 0.10, xHat: [1, 0, 0], mixed: [0.9333, 0.0333, 0.0333], out: [0.750, 0.125, 0.125] },
    { n: 2, eps: 0.10, xHat: [1, 0], mixed: [0.95, 0.05], out: [0.75, 0.25] },
  ],
  /** G3.4 — the mixed equilibrium */
  guardFixedPoints: [
    { v: [30, 20, 10], k: 12.0, y: [0.60, 0.40] },
  ],

  /** G1 — the fixed-phase totals and the whole shape table */
  fixedTotals: { JOB: { default: 160, full: 257 }, RUN: { default: 104, full: 130 } },
  /**
   * G1's shape table — **NOMINAL. It is a function of `SHAPES[id].tierMix`, and `tierMix` is a
   * design-time budget, not a description of a draft.** `composeBundles` does not build a queue out
   * of it: it prices whatever `composePage` had due that night and takes `budget.targets` of them
   * (`js/job/board.js` says the same thing at `projectFor`: *"the obvious estimate, the shape's
   * published `tierMix`, is biased"*). Over the 50-save corpus `tests/job-board.test.mjs` builds, the
   * JOB rows the board actually posts carry a median **T1 4.09 / T2 5.44 / T3 0.31 / T4 0.18**
   * against this file's `{1: 8, 2: 2}`, and the row below brackets **1 of 45** of them.
   *
   * So this object is what a JOB is *budgeted* at, and `shapeTableDrafted` below is what a JOB
   * *costs*. Both are published; `job-shape-measured.test.mjs` measures the second one from
   * `postBoard` rather than asserting it, and fails if either drifts from the product.
   * (Round 3, player-feel BLOCKER.)
   *
   * `split` here is `gameS / wallS` with the debrief read **inside** `gameS`. That is a THIRD basis:
   * the debrief headline and the board's projection both put the debrief read in neither term
   * (G1 statement 2), which is 5–6 points lower on every shape — see `nominalHeadlineSplit`.
   *
   * **The FULL cells moved by 25 s in verify round 2 and the DEFAULT cells did not.** The full
   * column used to bill a `crew` phase the state machine cannot enter, for seconds G1 had already
   * sold inside the brief window's five options — see `FIXED_PHASES`. The three shapes on the JOB
   * column each drop 25 s of `gameS` and `wallS`, and their full split falls to what the shipped
   * machine has always measured (JOB 51.3 → 49.8, JOB12 40.3 → 39.1, VAULT 34.1 → 32.6). RUN's
   * `crew` cell was 0, so its row is untouched — which is exactly the pattern the deficit had.
   */
  shapeTable: {
    RUN: { targets: 6, answerS: 180, decisionS: 84, gameS: [188, 214], wallS: [368, 394], split: [51.1, 54.3] },
    JOB: { targets: 10, answerS: 420, decisionS: 160, gameS: [320, 417], wallS: [740, 837], split: [43.2, 49.8] },
    JOB12: { targets: 12, answerS: 750, decisionS: 224, gameS: [384, 481], wallS: [1134, 1231], split: [33.9, 39.1] },
    /* VAULT takes the JOB fixed column, but only ONE of its two brief windows can land (the second
       falls after target 8 of a 7-target shape — see SHAPES.VAULT and `econ.landedBriefs`), so its
       `brief` cell is charged once, not twice: 140 s default / 207 s full rather than 160 / 257.
       Round 2 (split-honesty) — the published row used to claim a surface the shape cannot serve. */
    VAULT: { targets: 7, answerS: 750, decisionS: 156, gameS: [296, 363], wallS: [1046, 1113], split: [28.3, 32.6] },
  },
  /**
   * The same four rows on the basis the APP prints — the debrief read in neither term of the split
   * (`board.js projectFor`, `screens/run.js`'s debrief headline, G1 statement 2). Published so the
   * gap between the brochure column above and the percentage on screen is a number in this file and
   * not a surprise: a nominal JOB is 43.2 % game by the table's definition and **37.8 %** by the
   * one the board prints. Recomputed in `job-shape-measured.test.mjs` from `FIXED_PHASES`.
   */
  nominalHeadlineSplit: { RUN: [45.1, 49.2], JOB: [37.8, 45.6], JOB12: [29.8, 35.7], VAULT: [23.5, 28.4] },
  /**
   * **What the board ACTUALLY posts — measured, not derived.** `[min, median, max]` over the 50
   * seeded saves `tests/job-board.test.mjs` builds, at clock 19:30, taking each board's own
   * one-tap recommendation and costing its real tiers through `ANSWER_MINUTES_PER_TIER`,
   * `DECISION_SECONDS` and `FIXED_PHASES` — the identical arithmetic `shapeTable` uses, applied to
   * the drafted queue instead of to `tierMix`. 45 of the 50 boards post a JOB and 5 post a VAULT;
   * RUN and JOB12 are not one-tap recommendations and have no measured row.
   *
   * `split` is the table's basis (debrief inside `gameS`); `headline` is the app's (debrief in
   * neither term) and reproduces `board.split` to the rounding: JOB `[21.7, 29.8, 35.4]` against
   * the board's printed `[22, 30, 35]`.
   *
   * WHAT THIS ROW SAYS, and G1 now says it too: a JOB is **14.2 / 17.4 / 27.9 minutes** and
   * **22 / 30 / 35 % game**, not 12:20–14:22 at 43–51 %. One board of the 45 runs past COMPOSED
   * S1's 25-minute ceiling (27.9 min); that is a supply/composer fact, not a table fact, and it is
   * recorded as a Request in `notes/econ-fix.md` rather than rounded away here.
   * (Round 3, player-feel BLOCKER — the published row matched 1 of 45 boards on wall clock and
   * 0 of 45 on split.)
   */
  shapeTableDrafted: {
    /* The `full` bands each fell by the same 25 s in verify round 2, for the reason the nominal
       row's did: the fixed column billed a `crew` phase the machine cannot enter. The `default`
       bands are untouched — that column's `crew` cell was 0 — which is the signature of the defect
       rather than a coincidence. Re-measured, not adjusted. */
    JOB: {
      n: 45, targets: [10, 10, 11], answerS: [510, 690, 1260], decisionS: [176, 200, 254],
      wallS: { default: [854, 1046, 1674], full: [951, 1143, 1771] },
      split: { default: [24.7, 34.0, 40.3], full: [28.9, 39.6, 46.4] },
      headline: { default: [21.7, 29.8, 35.4], full: [26.1, 36.0, 42.4] },
      overSessionCeiling: 1,
    },
    VAULT: {
      n: 5, targets: [7, 7, 7], answerS: [390, 450, 810], decisionS: [128, 138, 166],
      wallS: { default: [658, 728, 1116], full: [725, 795, 1183] },
      split: { default: [27.4, 38.2, 40.7], full: [31.5, 43.4, 46.2] },
      headline: { default: [22.9, 32.1, 34.2], full: [27.5, 38.4, 40.9] },
      overSessionCeiling: 0,
    },
  },
  /** COMPOSED S1's session band, in seconds — the claim G1's table is measured against. */
  sessionBandS: [600, 1500],
  /**
   * G1 — the decision counts. JOB-10 is the numeral G1 prints; VAULT is here because it is the one
   * shape whose nominal brief count and its REACHABLE brief count differ, and the debrief prints the
   * published number beside the measured one (`screens/run.js jobTakeBlock`).
   */
  decisionCount: { JOB: { mandatory: 24, full: 35 }, VAULT: { mandatory: 17, full: 24 } },

  /** G2 — the wing weights */
  wingWeights: { RECALL: 32, FIGURES: 26, WORDS: 23, ALGEBRA: 19 },
  skillWeightTotal: 100,
  skillCount: 19,

  /** G2 — crew capacity at the two ends */
  capacity: { min: 8, max: 22, atL1NoStamps: 8, atL15AllStamps: 22 },
});
