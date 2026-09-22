// site/js/job/crew.js — THE JOB: crew, capacity, the idle rule and the build decision (J4).
//
// AUTHORITY: COMPOSED-GAME.md G2 ("Crew — capacity, not currency", "The build decision, with the
// numbers"), G1 (the ρ ladder and `ρ_eff = LADDER[max(0, rung − rank)]`), G3.7 #8 (mastery strictly
// dominates forgiveness), G3.8 (the alignment theorem — the crew gradient IS `weakSpots()`'s sort
// key), G4 ("Mastery is never faked" — a Mock miss drops a mastered make's HELD to STEADY),
// G8 J4 (this ticket's acceptance list). BUILD-POLICY overrides all of it.
//
// THIS FILE IS DOM-FREE (BUILD-POLICY / G8): no `document`, no `window`, no CSS, no import from
// `js/screens/*`, no `Math.random`. It imports cleanly in plain node.
//
// WHAT LIVES HERE:
//   · `capacityFor`                 8 + floor(level/2) + bossStamps, clamped to 8..22
//   · `allocate`                    the ONLY legal way to change `save.game.crew` — it can never
//                                   produce a build over capacity or over the 12-make manned cap
//   · `forgivenessOf` / `isIdleFor` what a crew rank is worth on one target, and where it stands down
//   · `crewValue` / `heldValue`     the two rungs of the build, priced per make
//   · `alignmentFor` / `bestBuy`    the real build argmax, and the domain on which it IS the study argmax
//   · `buildMatrix`                 G2's 4×2 STEADY-vs-HELD matrix, recomputed from its parameters
//   · `measure*` / `simulateJob`    the measurement harness J4's suite (and J8/J9) run the five
//                                   parameters of that matrix through
//
// ROUND-1 FIX PASS (notes/crew-fix.md). Five defects this file owned are fixed at the root here:
//   1. the idle rule stood the crew down on EVERY due review, so on the ordinary evening board —
//      which `composeBundles` fills criticals-first — both ranks paid exactly zero. It is now the
//      singular G2 writes: the make's OWN (coldest) due review, one target (`ownDueReviewKey`);
//   2. `isIdleFor` ignored the crew rank, so the screen told a student with no crew that it was idle;
//   3. the build had no per-make HELD price, so the build argmax was unrepresentable (`heldValue`);
//   4. the alignment theorem was stated unrestricted; its domain is now computed (`alignmentFor`),
//      and the two terms the published derivation drops are exported (`readinessGradient`, `dRhoTrue`);
//   5. the ±15 % claim about the 20 matrix parameters, and the "mildly concave" Δρ, were false.
//
// ROUND-2 FIX PASS (notes/crew-fix.md → "round 2"). The r2 critics found one more defect this file
// owns, and it is the one that makes the crew grid an advisory rather than a price:
//   6. **`crewValue` was sold as a payoff gradient and is priced against supply that does not
//      exist.** `encountersFor` modelled `encounters_i ∝ w_i`, which gives every make a strictly
//      positive, weight-proportional encounter count. Measured on 300 drafted 10-target JOB queues
//      (`composeBundles` → `draftUnion`), real supply is lumpy and mostly ZERO: the make the study
//      plan puts FIRST is served no forgivable target at all on 93 of 150 boards (62 %), so a crew
//      point on it returns exactly nothing, and the make whose point pays most on the board is the
//      study plan's #1 on only 22 of 150 (15 %). `encountersFor` now reads the real queue when it is given one,
//      `steadyValueOn` / `heldValueOn` / `crewOrderOn` price a point against the board in front of
//      the student, `supplyGapFor` returns the gap as data, and `alignmentFor().domain` carries the
//      three conditions the theorem actually needs (evidence depth · rank · supply) instead of one.
//      `crewValue` itself is UNCHANGED — it is an exact positive multiple of `weakSpots()`'s sort
//      key (ρ = 1, an identity, `tests/job-align.test.mjs` §1) and is documented as the ADVISORY
//      ORDERING it is, not as the payoff.
// ROUND-3 FIX PASS (notes/crew-fix.md → "round 3"). Two more defects this file owned:
//   7. **G4's crew demotion was a read-time downgrade and nothing else.** `effectiveRankOf` stopped
//      the ladder over-forgiving a lapsed HELD, so the rule was never BROKEN — but the save went on
//      storing a rank the gate had taken away, and the capacity point it cost was locked out of an
//      8-point L1 budget until something called `legalize()`, which nothing under `site/js` does.
//      `canAllocate` now prices the budget at `effectiveSpent` (the point is spendable immediately)
//      and `allocate` applies G4's lapsed-HELD demotion on every successful write and returns it as
//      `demotions` (the point is recovered, and the caller is handed the rows `COPY.crewDemoted`
//      prints). The two moments G4 names that carry no allocation, and the debrief line itself, are
//      still out of lane — notes/crew-fix.md R8.
//   8. **The band floor was measured but was not a DOMAIN condition.** `BAND_FLOOR` / `dRhoTrue` /
//      `isBandFloored` shipped in r2 as quantities; the alignment theorem's domain still had three
//      conditions while the flat tail below m = 40 breaks it on a third of saves. `alignmentFor`
//      now carries `domain.band`, `bandFloored`, `bandFloor` and `bandAgrees`, and `crewOrderTrue`
//      is the ordering the shipped bands actually pay, so the fourth condition is an argmax
//      comparison rather than a sentence.
// What this lane does NOT own — COMPOSED-GAME.md, `data/job.js`, `js/screens/*.js` — is written up
// as exact, quotable requests in notes/crew-fix.md rather than edited from here. Five BLOCKERS are
// of exactly that kind and have now been re-filed three rounds running: COMPOSED-GAME.md G2's 4×2
// winner column, its "two flips, no dominant build", its "±15 %" sentence, its unrestricted
// alignment theorem at :552 and G9 #5's copy of it are all still published and are all contradicted
// by this file's own suite. Requests R1/R2/R5/R7/R8 in notes/crew-fix.md carry paste-ready prose.
// **COMPOSED-GAME.md has no owning lane** — every lane's note declines it as another lane's file —
// which is why three rounds of correct, paste-ready requests have gone unapplied.
//
// Ledger law (G1 Global law 2): nothing in this file writes anything. `allocate` returns a NEW crew
// map and a NEW save; it mutates neither argument. The game writes `save.player` and `save.game`
// only, and only through the screen that owns the store.

import { levelFor } from '../xp.js';
import { isMastered, mShown, updateSkill, N_FULL } from '../mastery.js';
import { dueList } from '../schedule.js';
import { CREW, CREW_RANKS, CREW_MATRIX, RUNG_BANDS, CHAIN, SHAPES } from '../../data/job.js';
import { skillById, SKILL_IDS, TOTAL_WEIGHT } from '../../data/skills.js';
import { manifestById } from '../../data/source-manifest.js';
import { bosses } from '../../data/modules.js';
import {
  expectedRho, rhoFor, lootMean, chainMult, chainAfterTarget, chainAfterBag,
  carryFor, missFor, pushOrBag,
} from './econ.js';

/* ------------------------------------------------------------------ small numeric helpers */

const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

/* ==========================================================================================
   G2 — the constants of the crew
   ========================================================================================== */

/** G2 "at most 12 of the 19 makes may be manned at once" (`manned ≤ min(capacity, 12)`). */
export const MANNED_MAX = CREW.mannedMax;

/** G2's rank table — CUMULATIVE cost per manned make. STEADY 1 point, HELD 2 points. */
export const COSTS = Object.freeze({ STEADY: CREW.COSTS.STEADY, HELD: CREW.COSTS.HELD });

/** The three crew states, as numbers — the same numbers `save.game.crew` stores. */
export const BARE = 0;
export const STEADY = 1;
export const HELD = 2;

/** `RANK_NAMES[rank]` — `''` for bare, so a printed name is never `undefined`. */
export const RANK_NAMES = Object.freeze(CREW_RANKS.map((r) => r.name));

/** The 19 makes, in `data/skills.js` table order — the tie-break every ordering in the layer uses. */
export const MAKES = SKILL_IDS;

/** G2 "8 at L1 with no bosses → 22 at L15 with all seven". */
export const CAPACITY_MIN = CREW.capacityMin;
export const CAPACITY_MAX = CREW.capacityMax;

/** G2 "(≤ 7 stamps)" — there are exactly seven bosses, so the cap is the bank, not a magic number. */
export const STAMPS_MAX = Math.min(CREW.stampsMax, bosses.length);

/** The trophy keys a boss stamp is stored under (`data/trophies.js` mints `boss:<id>` on a win). */
export const BOSS_STAMP_KEYS = Object.freeze(bosses.map((b) => `boss:${b.id}`));

/** G2 "the chain-hold fires at chain ≥ 3" — J1's constant, not a second copy of the number. */
export const CHAIN_HOLD_MIN = CHAIN.holdMinChain;

/** The shape `crewValue` prices against when the caller does not name one (G1's evening default). */
export const DEFAULT_SHAPE = 'JOB';

/** Is this a make at all? (`allocate` refuses anything else — the crew map holds only real skills.) */
export const isMake = (make) => typeof make === 'string' && Object.hasOwn(skillById, make);

/** A rank as a number: accepts 0/1/2, `'STEADY'`/`'HELD'`, `''`/`null` (bare). `null` when invalid. */
export function rankNumber(rank) {
  if (rank === 0 || rank === 1 || rank === 2) return rank;
  if (rank == null || rank === '' || rank === false) return BARE;
  if (typeof rank === 'string') {
    const i = RANK_NAMES.indexOf(rank.toUpperCase());
    return i > 0 ? i : null;
  }
  if (Number.isInteger(rank)) return null;          // 3, −1 … are refusals, not silent clamps
  return null;
}

/** The CUMULATIVE point cost of holding a make at this rank (0 · 1 · 2). */
export function costOf(rank) {
  const r = rankNumber(rank);
  return r == null ? 0 : (CREW_RANKS[r]?.cost ?? 0);
}

/* ==========================================================================================
   G2 — capacity
   ========================================================================================== */

/** How many boss stamps the save carries, capped at seven (`trophies['boss:B1'…'boss:B7']`). */
export function bossStampsOf(save) {
  let n = 0;
  const t = save?.trophies;
  if (isObj(t)) for (const k of BOSS_STAMP_KEYS) if (t[k]) n++;
  return Math.min(n, STAMPS_MAX);
}

/** The student's level, `xp.levelFor(save.xp)` verbatim (read, never written — G1 Global law 2). */
export const levelOf = (save) => levelFor(Math.max(0, num(save?.xp, 0)));

/**
 * G2: `capacity = 8 + floor(xp.levelFor(save.xp) / 2) + bossStamps`, range **8 → 22**.
 *
 * Crew is NOT earned by playing more jobs: thirty jobs in a week grant zero capacity on their own.
 * Only levelling (which is XP, which is answering) and beating bosses move it. That is the whole
 * anti-grind design, and it is why this function reads `save.xp` and `save.trophies` and nothing
 * the game itself writes.
 *
 * @param {object} save
 * @returns {number} 8 … 22
 */
export function capacityFor(save) {
  return capacityDetail(save).capacity;
}

/** Every term of `capacityFor`, for the Settings panel and the crew grid. */
export function capacityDetail(save) {
  const level = levelOf(save);
  const fromLevel = Math.floor(level / CREW.levelsPerPoint);
  const stamps = bossStampsOf(save);
  const raw = CREW.base + fromLevel + stamps;
  const capacity = clamp(raw, CAPACITY_MIN, CAPACITY_MAX);
  return {
    capacity, base: CREW.base, level, fromLevel, stamps, raw,
    clamped: raw !== capacity, min: CAPACITY_MIN, max: CAPACITY_MAX,
    mannedMax: Math.min(capacity, MANNED_MAX),
  };
}

/** `manned ≤ min(capacity, 12)` — the cap that actually binds at this capacity. */
export const mannedMaxFor = (save) => Math.min(capacityFor(save), MANNED_MAX);

/* ==========================================================================================
   G2 — the crew map
   ========================================================================================== */

/**
 * The save's crew as a clean `{make: 1|2}` map. Stricter than `store.normalizeGame`, which keeps the
 * rank type honest but not the key: a make that is not one of the 19 skills is dropped here, so a
 * stale unit's crew can never eat this unit's capacity.
 */
export function crewOf(save) {
  const raw = save?.game?.crew;
  const out = {};
  if (!isObj(raw)) return out;
  for (const id of MAKES) { const r = raw[id]; if (r === STEADY || r === HELD) out[id] = r; }
  return out;
}

/** The STORED rank of one make (0 when bare). See `effectiveRankOf` for the rank that actually pays. */
export function rankOf(save, make) {
  if (!isMake(make)) return BARE;
  const r = save?.game?.crew?.[make];
  return r === STEADY || r === HELD ? r : BARE;
}

/** How many makes are manned in a crew map. */
export const mannedCount = (crew) => Object.values(crew ?? {}).filter((r) => r >= STEADY).length;

/** How many capacity points a crew map spends. */
export const spentOf = (crew) => Object.values(crew ?? {}).reduce((t, r) => t + costOf(r), 0);

/** The manned makes, in `data/skills.js` table order. */
export const mannedMakes = (crew) => MAKES.filter((id) => (crew?.[id] ?? 0) >= STEADY);

/** The manned makes whose stored HELD no longer passes its gate — G4's Mock/Boss miss, unrepaired. */
export function lapsedMakes(save, crew = crewOf(save)) {
  return mannedMakes(crew).filter((make) => crew[make] === HELD && !canHold(save, make));
}

/**
 * Capacity, the manned cap, and what a crew map spends against them.
 * `legal` is the invariant `allocate()` guarantees: `spent ≤ capacity ∧ manned ≤ min(capacity, 12)`.
 *
 * **`lapsed` / `wasted` (r1 fix).** `spent` prices the STORED rank, which is what the save costs;
 * `effectiveSpent` prices the rank that actually PAYS (`effectiveRankOf`). A HELD whose mastery a
 * Mock knocked down to 69 still costs `COSTS.HELD = 2` while delivering one point of STEADY value,
 * and those points stay locked out of the student's budget until something calls `legalize()`.
 * `wasted = spent − effectiveSpent` is that gap, so the crew grid can show it and G4's
 * `FAC2 crew HELD → STEADY — the Mock says it is not held.` has a trigger that does not require
 * anyone to notice by hand. See `crewDemotions` and notes/crew-fix.md → Requests.
 *
 * **`effectiveFree` (r3 fix — "a lapsed HELD burns a capacity point forever").** `free` is what the
 * STORED build leaves, and it under-reports by `wasted` for exactly as long as the save carries a
 * rank the gate no longer justifies. `effectiveFree = capacity − effectiveSpent` is what the student
 * can actually spend, and it is the number `canAllocate` prices against (r3), so a Mock miss can no
 * longer lock a point out of the budget while nobody calls `legalize()`. The two are equal on every
 * legal save, and `allocate()` makes them equal again on its first successful call.
 */
export function budgetFor(save, crew = crewOf(save)) {
  const { capacity, mannedMax } = capacityDetail(save);
  const manned = mannedCount(crew);
  const spent = spentOf(crew);
  const lapsed = lapsedMakes(save, crew);
  const wasted = lapsed.reduce((t, make) => t + (costOf(crew[make]) - costOf(effectiveRankOf(save, make))), 0);
  return {
    capacity, mannedMax, manned, spent,
    free: capacity - spent, slots: mannedMax - manned,
    legal: spent <= capacity && manned <= mannedMax,
    lapsed, wasted, effectiveSpent: spent - wasted,
    effectiveFree: capacity - (spent - wasted),
  };
}

/** G2: HELD's gate is `mastery.isMastered(rec)` ALONE (G12 #4) — no "and no due card" clause. */
export function canHold(save, make) {
  return isMake(make) && isMastered(save?.skills?.[make]);
}

/* ==========================================================================================
   G2 — allocation. The ONLY way a rank changes.
   ========================================================================================== */

/** Why an allocation was refused. `null` when it was not. */
export const REFUSALS = Object.freeze({
  UNKNOWN_MAKE: 'unknown-make',
  BAD_RANK: 'bad-rank',
  NOT_MASTERED: 'not-mastered',
  MANNED_MAX: 'manned-max',
  CAPACITY: 'capacity',
});

/**
 * May `make` be moved to `rank`? Pure, and the single source of truth `allocate()` asks.
 *
 * The order of the tests is load-bearing:
 *   1. a make that is not one of the 19, or a rank that is not 0/1/2, is a refusal, never a clamp;
 *   2. **HELD is refused unless `mastery.isMastered`** — checked before the shortcut below, so a
 *      make whose mastery has lapsed (a Mock miss — G4) cannot be "re-confirmed" at HELD;
 *   3. a move that does not RAISE the rank is always legal — it can only free points, so it is the
 *      repair path out of an illegal save and must never be refused;
 *   4. only then: the manned cap, then capacity.
 *
 * **What the capacity test prices, and why (r3 fix — G4's half that never ran).** The budget this
 * asks against is `effectiveSpent`, not `spent`: a HELD whose mastery a Mock knocked down to 69 is
 * priced at the STEADY it actually pays (`effectiveRankOf`, `budgetFor().wasted`). Before r3 it was
 * priced at the HELD the save still stores, so a lapsed rank locked a capacity point out of an
 * 8-point L1 budget for as long as nobody called `legalize()` — which is forever, because
 * `legalize()` has no caller anywhere under `site/js` (it is still the two call sites G4 names,
 * filed in notes/crew-fix.md → Requests). Pricing the EFFECTIVE build cannot make an illegal build
 * reachable: `allocate()` demotes those same lapsed ranks on the write, so the build it stores
 * spends exactly what this priced. `from` is likewise read off the effective rank, so the student
 * is never charged HELD for a rank the gate has already taken away.
 *
 * @returns {{ok: boolean, reason: string|null, from: number, to: number,
 *            manned: number, spent: number, capacity: number, mannedMax: number}}
 */
export function canAllocate(save, make, rank, opts = {}) {
  const crew = opts.crew ?? crewOf(save);
  const b = opts.budget ?? budgetFor(save, crew);
  const stored = crew[make] ?? BARE;
  const from = stored === HELD && !canHold(save, make) ? STEADY : stored;   // r3: price what it PAYS
  const to = rankNumber(rank);
  const base = {
    from, to: to ?? from, manned: b.manned,
    spent: b.effectiveSpent ?? b.spent, capacity: b.capacity, mannedMax: b.mannedMax,
  };

  if (!isMake(make)) return { ok: false, reason: REFUSALS.UNKNOWN_MAKE, ...base, to: stored };
  if (to == null) return { ok: false, reason: REFUSALS.BAD_RANK, ...base, to: stored };
  if (to === HELD && !canHold(save, make)) return { ok: false, reason: REFUSALS.NOT_MASTERED, ...base };
  if (to <= from) return { ok: true, reason: null, ...base };

  const manned = b.manned + (from === BARE ? 1 : 0);
  const spent = base.spent - costOf(from) + costOf(to);
  if (manned > b.mannedMax) return { ok: false, reason: REFUSALS.MANNED_MAX, ...base };
  if (spent > b.capacity) return { ok: false, reason: REFUSALS.CAPACITY, ...base };
  return { ok: true, reason: null, ...base, manned, spent };
}

/**
 * Move one make to one rank. PURE: returns a NEW crew map and a NEW save; neither argument is
 * touched. Re-allocation is free and unlimited (G2), so there is no cost, no cooldown and no
 * confirmation here — only legality.
 *
 * **The invariant this function exists for:** no call sequence, in any order, from any legal start,
 * can reach a build with `spent > capacity` or `manned > min(capacity, 12)`. A refusal returns the
 * save unchanged with `ok: false` and a `reason`; it never throws and never silently clamps.
 * (A save that arrives already illegal — hand-edited, or over capacity after a unit handoff — can
 * only be moved DOWN by `allocate`; `legalize()` is the full repair path.)
 *
 * **G4's lapsed HELD, repaired on the write (r3 fix).** *"a Mock or Boss miss still drops a mastered
 * skill to 69 — and when it does, that make's HELD crew drops to STEADY mid-week and the debrief
 * says so."* The mechanical half of that rule worked at READ time only (`effectiveRankOf`), so the
 * ladder never over-forgave — but the save went on storing a HELD it could not pay for, and the
 * point it cost stayed locked out of the budget, because the function that repairs it (`legalize`)
 * has no caller anywhere under `site/js`. Every SUCCESSFUL allocation now applies that one rule to
 * the build it writes, so the point comes back the first time the student touches the crew grid, and
 * the demotions are returned alongside it as `demotions` — the `{make, from, to, reason, fromName, toName}`
 * rows `data/job.js COPY.crewDemoted` prints, handed to the caller instead of waiting for one.
 *
 * `demotions` is reported on a REFUSAL too, as data, but not applied: a refusal still returns the
 * save and the crew byte-unchanged, which is the invariant above and the one the property test in
 * `tests/job-crew.test.mjs` §4 asserts on every one of its 10 000 calls. The lapsed point is not
 * lost while that is true — `canAllocate` prices the budget at `effectiveSpent`, so it is spendable
 * before the repair as well as after it.
 *
 * This is the write half only. G4 also names two moments the repair must run WITHOUT an allocation
 * (after `mock.submitRun`, and after a boss KO/miss writes mastery) and a line the debrief must
 * print; both live in files this lane does not own and are filed in notes/crew-fix.md → Requests.
 *
 * @param {object} save   the whole save (reads `xp`, `trophies`, `skills`, `game.crew`)
 * @param {string} make   one of the 19 skill ids
 * @param {number|string} rank  0/1/2, or `'STEADY'`/`'HELD'`/`''`
 * @returns {{ok, reason, make, from, rank, changed, demotions, crew, save,
 *            capacity, mannedMax, manned, spent, free, slots, legal}}
 */
export function allocate(save, make, rank, opts = {}) {
  const crew = opts.crew ?? crewOf(save);
  const budget = budgetFor(save, crew);
  const check = canAllocate(save, make, rank, { crew, budget });
  const demotions = crewDemotions(save, crew);           // G4 — what this write is about to repair
  const from = check.from;                               // the rank that PAYS, not the stored one

  if (!check.ok) {
    return {
      ok: false, reason: check.reason, make, from, rank: crew[make] ?? BARE, changed: false,
      demotions, crew, save, ...budget,
    };
  }

  const to = rankNumber(rank);
  const next = { ...crew };
  for (const d of demotions) next[d.make] = d.to;        // G4, applied — the point comes back here
  if (to === BARE) delete next[make]; else next[make] = to;
  const after = budgetFor(save, next);
  return {
    ok: true, reason: null, make, from, rank: to, changed: to !== from || demotions.length > 0,
    demotions, crew: next, save: withCrew(save, next), ...after,
  };
}

/** A NEW save carrying `crew` at `game.crew`. The save and its `game` are shallow-copied. */
export function withCrew(save, crew) {
  const base = isObj(save) ? save : {};
  const game = isObj(base.game) ? base.game : {};
  return { ...base, game: { ...game, crew: { ...crew } } };
}

/**
 * Repair a crew that the rest of the app made illegal, deterministically and in the student's
 * favour. Three things can do that, none of them a bug:
 *   · a Mock or Boss miss drops a mastered skill to 69, so its HELD lapses (G4 — the debrief prints
 *     `FAC2 crew HELD → STEADY — the Mock says it is not held.`);
 *   · a unit handoff carries `player` but archives `game`, so capacity can arrive smaller;
 *   · an imported or hand-edited save.
 *
 * Order: lapsed HELD → STEADY first (it frees points and is the rule G4 names), then stand down the
 * LOWEST-value manned makes until the manned cap holds, then demote and stand down until capacity
 * holds. Value order is `crewValue` for `shape`, ties by reverse table order, so the repair is a
 * pure function of the save and is the same on every device.
 *
 * @returns {{crew, save, changes: Array<{make, from, to, reason}>, ...budget}}
 */
export function legalize(save, { shape = DEFAULT_SHAPE } = {}) {
  const crew = crewOf(save);
  const changes = [];
  const set = (make, to, reason) => {
    const from = crew[make] ?? BARE;
    if (from === to) return;
    if (to === BARE) delete crew[make]; else crew[make] = to;
    changes.push({ make, from, to, reason });
  };

  for (const make of mannedMakes(crew)) {
    if (crew[make] === HELD && !canHold(save, make)) set(make, STEADY, REFUSALS.NOT_MASTERED);
  }

  // weakest first: ascending crewValue, ties broken by REVERSE table order (the last make goes first)
  const weakestFirst = () => mannedMakes(crew)
    .map((make, i) => ({ make, i, v: crewValue(save, make, shape) }))
    .sort((a, b) => (a.v - b.v) || (b.i - a.i))
    .map((x) => x.make);

  const { capacity, mannedMax } = capacityDetail(save);
  for (const make of weakestFirst()) { if (mannedCount(crew) <= mannedMax) break; set(make, BARE, REFUSALS.MANNED_MAX); }
  for (const make of weakestFirst()) { if (spentOf(crew) <= capacity) break; if (crew[make] === HELD) set(make, STEADY, REFUSALS.CAPACITY); }
  for (const make of weakestFirst()) { if (spentOf(crew) <= capacity) break; set(make, BARE, REFUSALS.CAPACITY); }

  return { crew, save: withCrew(save, crew), changes, ...budgetFor(save, crew) };
}

/**
 * **The debrief line G4 requires, as data** (r1 fix: `legalize()` had no caller anywhere under
 * `site/js`, so a Mock miss left a lapsed HELD spending 2 points for STEADY value and the line
 * `FAC2 crew HELD → STEADY — the Mock says it is not held.` never printed).
 *
 * `crewDemotions(save)` is the `NOT_MASTERED` half of `legalize` on its own: the makes whose stored
 * HELD the gate no longer justifies, in table order, in the `{make, from, to, reason}` shape the
 * debrief and Home's cold-crew strip need. It is pure and writes nothing.
 *
 * **r3:** `allocate()` now applies exactly these rows on every successful write and returns them as
 * `demotions`, so the repair no longer depends on anyone remembering to call `legalize()` before the
 * student next touches the crew grid. The two moments G4 names that carry NO allocation — after
 * `mock.submitRun`, and after a boss KO/miss writes mastery — still need `legalize(save)` called
 * from the file that owns them, and the debrief still needs to print these rows through
 * `data/job.js COPY.crewDemoted`. Both are in files this lane does not own; see
 * notes/crew-fix.md → Requests.
 *
 * @param {object} save
 * @param {object} [crew]  the crew map to read (defaults to the save's own)
 */
export function crewDemotions(save, crew = crewOf(save)) {
  return lapsedMakes(save, crew).map((make) => ({
    make, from: HELD, to: STEADY, reason: REFUSALS.NOT_MASTERED,
    fromName: RANK_NAMES[HELD], toName: RANK_NAMES[STEADY],
  }));
}

/* ==========================================================================================
   G2 — what a rank is worth on ONE target: forgiveness, the idle rule, the chain-hold
   ========================================================================================== */

/** The make a target is labelled with — `skill` is what the composer prints on the envelope. */
export const makeOf = (target) => (
  typeof target?.skill === 'string' ? target.skill
    : typeof target?.make === 'string' ? target.make
      : Array.isArray(target?.skills) && typeof target.skills[0] === 'string' ? target.skills[0]
        : null
);

/**
 * Is this target a review at all? Every `role: 'review'` item `composePage` emits came out of
 * `schedule.dueList`, so the role IS the dueness. A `rematch` is not a review (it is a fresh-seed
 * Variant of a missed template) and a `weak`/`new`/`floor` item is not either — crew forgives
 * normally on all three.
 *
 * NOTE (r1 fix, critic "crew forgiveness is exactly ZERO on the ordinary evening board"): being a
 * due review is NOT the idle rule. G2 idles the crew on **the** review that made the make cold —
 * one target — not on every review of that make. `isIdleFor` is the rule; this is one of its terms.
 */
export const isDueReview = (target) => (
  target?.role === 'review' || target?.isReview === true || target?.dueReview === true
);

/** The key a target or a `schedule.dueList` entry is identified by (a frozen Variant carries `key`). */
export const keyOf = (t) => (typeof t?.key === 'string' ? t.key : typeof t?.id === 'string' ? t.id : null);

/** How overdue an item is, in days. `composePage` prints `overdue`; `jobTargetOf` renames it `overdueDays`. */
export const overdueOf = (t) => num(t?.overdue ?? t?.overdueDays, 0);

/** The Leitner bucket of an item, `9` when it carries none (so a missing bucket never wins a tie-break). */
const bucketOf = (t) => (Number.isFinite(+t?.bucket) ? +t.bucket : 9);

/**
 * The make a CARD belongs to — the source manifest's primary skill, exactly the map `readiness.js`
 * builds for the same purpose. A frozen Variant is keyed `template#seed` and carries `forCard`.
 * Verified against the real composer: on 5 580 review targets over 400 seeded saves this reproduces
 * `composePage`'s own `skill` label on every one (§6 of the suite asserts it).
 */
export function makeOfCard(id, forCard = null) {
  const row = manifestById[id] ?? (forCard ? manifestById[forCard] : null);
  const skill = row?.skill ?? null;
  return isMake(skill) ? skill : null;
}

/** `dueList` order: coldest first — overdue desc, then bucket asc, then key asc (schedule.js). */
const colderThan = (a, b) => {
  const ao = overdueOf(a); const bo = overdueOf(b);
  if (ao !== bo) return ao > bo;
  const ab = bucketOf(a); const bb = bucketOf(b);
  if (ab !== bb) return ab < bb;
  return String(keyOf(a) ?? '') < String(keyOf(b) ?? '');
};

/**
 * `schedule.dueList(save)`, defended. **This file reads no clock** (G3.7's grep, asserted by
 * `tests/job-exploit.test.mjs`): when the caller names a `now` it is passed through, and when it
 * does not, `schedule.js` supplies its own default. Dueness lives in `schedule.js`; the crew layer
 * only asks it a question.
 */
function dueOf(save, now) {
  if (!isObj(save)) return [];
  try { return dueList(save, Number.isFinite(now) ? { now } : {}); } catch { return []; }
}

/**
 * **The ONE target that IS the make's own due review** — G2's *"the review that made the make cold"*,
 * in code. It is the make's COLDEST due review: `schedule.dueList`'s own order (overdue desc, then
 * bucket asc, then key asc), restricted to that make.
 *
 * Two sources, one rule:
 *   · `queue` given (the measurement harness, and any caller that has the drafted job) — the coldest
 *     due review of that make **inside the job**;
 *   · otherwise — the head of `schedule.dueList(save)` for that make, which is what the composer
 *     drafted from, so the two agree whenever the make's coldest due card is on the board.
 *
 * `null` when the make has no due review at all: then nothing of that make can be idle.
 */
export function ownDueReviewKey(save, make, { now = null, queue = null } = {}) {
  if (!isMake(make)) return null;
  if (Array.isArray(queue)) {
    let best = null;
    for (const t of queue) {
      if (!isObj(t) || makeOf(t) !== make || !isDueReview(t)) continue;
      if (best == null || colderThan(t, best)) best = t;
    }
    return best ? keyOf(best) : null;
  }
  for (const e of dueOf(save, now)) {
    if (makeOfCard(e.id, e.forCard) === make) return keyOf(e);
  }
  return null;
}

/** `make → index` of every make's own due review inside one queue (the harness's form of the rule). */
export function ownDueReviewIndices(queue) {
  const out = new Map();
  const bestOf = new Map();
  for (let i = 0; i < (queue?.length ?? 0); i++) {
    const t = queue[i];
    if (!isObj(t) || !isDueReview(t)) continue;
    const make = makeOf(t);
    if (!isMake(make)) continue;
    const cur = bestOf.get(make);
    if (cur == null || colderThan(t, cur)) { bestOf.set(make, t); out.set(make, i); }
  }
  return out;
}

/**
 * G2 (G12 #4): **crew goes idle on the make's own due review, and only there.**
 *
 * G2, verbatim: *"When the target **is** the review that made the make cold, the crew stands down for
 * that target: a review is answered bare, which is the honest part. **The rest of the make's targets
 * in that job keep their forgiveness**, and HELD's chain-hold is suppressed on due-review targets
 * only."* Two scopes, deliberately different — and the second clause only carries information if the
 * first is the singular it is written as.
 *
 * **r1 fix (BLOCKER, "crew forgiveness is exactly ZERO on the ordinary evening board").** This
 * function used to return `isDueReview(target)` — every review of the make, not the make's own. On a
 * board `composeBundles` fills criticals-first, 100 % of the drafted targets are due reviews, so the
 * old rule stood the crew down on all of them: `e_forgiven = 0.000`, `e_held = 0.000`, both ranks
 * paying literally nothing, and the whole crew meta inert in exactly the state §3.8 #1 drives the
 * student into. The rule is now the singular the document writes: at most ONE target of a make is
 * idle in a job, and it is the coldest (`ownDueReviewKey`). Measured on the flat `composePage`
 * population the best-supplied make's active encounters go 1.63 → 2.26 on a JOB-10 (§9).
 *
 * **r1 fix (MAJOR, "`isIdleFor` ignores the crew rank").** A make with no crew has no crew to stand
 * down: the screen printed `VOC crew idle — this target is its own due review` on 9 of 11 targets
 * for a student with zero manned makes, several envelopes before the word "crew" was introduced.
 * `simulateJob` already guarded on the rank (`isDueReview(t) && rank > 0`); the two now agree.
 *
 * @param {object} save
 * @param {string} make    the crew's make
 * @param {object} target  a queue item from `composePage` / `draftUnion`
 * @param {{now?: number, queue?: object[]}} [opts]  `queue` scopes the rule to one job
 */
export function isIdleFor(save, make, target, opts = {}) {
  if (!isMake(make) || !isObj(target)) return false;
  if (makeOf(target) !== make) return false;
  if (!isDueReview(target)) return false;
  if (effectiveRankOf(save, make) === BARE) return false;         // no crew → nothing to stand down
  const own = ownDueReviewKey(save, make, opts);
  const key = keyOf(target);
  if (own == null || key == null) return true;                    // no due-list evidence: the target is the evidence
  return key === own;
}

/**
 * The rank that actually pays. A stored HELD whose mastery has lapsed pays STEADY (G4: *"when it
 * does, that make's HELD crew drops to STEADY mid-week"*), so the ladder can never pay a
 * forgiveness the gate no longer justifies — even before `legalize()` has rewritten the save.
 */
export function effectiveRankOf(save, make) {
  const r = rankOf(save, make);
  return r === HELD && !canHold(save, make) ? STEADY : r;
}

/**
 * **How many rungs the crew forgives on this make** — the `rank` argument of `econ.rhoFor(rung,
 * rank)`, and the whole of G1's hint economy: `ρ_eff = LADDER[max(0, rung − rank)]`.
 *
 * `0` when bare, when the HELD gate has lapsed down to nothing, or — when a `target` is given — when
 * the crew is idle on it. Pass the target wherever one exists; the two-argument form is the make's
 * standing forgiveness, which is what the crew grid prints.
 *
 * @param {object} save
 * @param {string} make
 * @param {object|null} [target]  apply the idle rule against this target
 * @returns {0|1|2}
 */
export function forgivenessOf(save, make, target = null, opts = {}) {
  if (target && isIdleFor(save, make, target, opts)) return BARE;
  return effectiveRankOf(save, make);
}

/** Every term of `forgivenessOf`, for the envelope line and the crew grid. */
export function crewFor(save, make, target = null, opts = {}) {
  const stored = rankOf(save, make);
  const effective = effectiveRankOf(save, make);
  const idle = !!target && isIdleFor(save, make, target, opts);
  const holdIdle = !!target && isHoldSuppressed(save, make, target);
  const forgives = idle ? BARE : effective;
  return {
    make, rank: stored, effective, forgives,
    name: RANK_NAMES[forgives] ?? '',
    storedName: RANK_NAMES[stored] ?? '',
    idle,
    // G2's second scope — the chain-hold is off on EVERY due review of the make, forgiveness only on
    // the make's own. `econ.settle` takes one boolean today, so the payout needs BOTH: pass
    // `idle: c.idle` for the ladder and `idle: c.idle || c.holdIdle` to `econ.chainAfterTarget`.
    // See notes/crew-fix.md → Requests (J6 / `js/job/state.js`).
    holdIdle,
    lapsed: stored === HELD && effective !== HELD,
    mastered: canHold(save, make),
    chainHold: forgives === HELD && !holdIdle,
    minChain: CHAIN_HOLD_MIN,
  };
}

/**
 * G2: HELD *"forgives two rungs **and, at chain ≥ 3, any non-clean outcome on this make holds the
 * chain instead of resetting it**"*. Both halves of that sentence are conditions:
 *   · `chain ≥ CHAIN.holdMinChain` (3), and
 *   · the outcome is NON-CLEAN (a clean answer increments the chain; there is nothing to hold), and
 *   · the crew is HELD and not idle on this target.
 *
 * A Gold-with-H1 (rung 1) already HOLDS on the authored ladder (`xp.comboTransition`), so the hold
 * only ever changes the outcome of rungs 2, 3 and 4 — which is exactly what makes it worth buying.
 */
export function holdsChain(save, make, { chain = 0, rung = 0, target = null, ...opts } = {}) {
  if (forgivenessOf(save, make, target, opts) < HELD) return false;
  if (isHoldSuppressed(save, make, target)) return false;    // G2: suppressed on EVERY due review
  if (Math.max(0, Math.trunc(num(chain))) < CHAIN_HOLD_MIN) return false;
  const r = Math.trunc(num(rung));
  if (r <= 0) return false;                                  // clean: increments, never "held"
  return chainAfterTarget(r, BARE, chain) === 0;             // it would otherwise have RESET
}

/**
 * G2's SECOND scope: *"HELD's chain-hold is suppressed on due-review targets **only**."* Forgiveness
 * stands down on the make's own due review alone (`isIdleFor`); the chain-hold stands down on every
 * due review of the make. Before the r1 fix the two scopes were collapsed into one, which is why the
 * sentence read as a redundancy — a crew that has stood down obviously holds no chain.
 */
export function isHoldSuppressed(save, make, target) {
  if (!isMake(make) || !isObj(target)) return false;
  if (makeOf(target) !== make) return false;
  return isDueReview(target);
}

/** The chain after one target of this make, with this save's crew — `econ.chainAfterTarget`, wired. */
export function chainAfterFor(save, make, rung, chain, target = null, opts = {}) {
  const idle = !!target && (isIdleFor(save, make, target, opts) || isHoldSuppressed(save, make, target));
  return chainAfterTarget(rung, effectiveRankOf(save, make), chain, { idle });
}

/* ==========================================================================================
   G3.8 — the allocation gradient, and why it IS the study plan
   ========================================================================================== */

/**
 * `Δρ` for one rank on one shipped band, computed from `LADDER` alone (J1's `expectedRho`).
 * `dRhoOf(40, 1)` is G2's `+0.163`; `dRhoOf(85, 2)` is its `+0.049`.
 */
export const dRhoOf = (band, rank) => expectedRho(RUNG_BANDS[band], rank) - expectedRho(RUNG_BANDS[band], 0);

/** G2's STEADY column: `Δρ` on an m40 make — `0.725 − 0.562 = +0.163`. */
export const dRhoSteady = () => dRhoOf(40, STEADY);
/** G2's HELD column: `Δρ` on an m85 make — `0.989 − 0.940 = +0.049`. */
export const dRhoHeld = () => dRhoOf(85, HELD);
/** G3.7 #8, the anti-tanking result: mastering a make is `+0.378` of ρ against forgiveness's `+0.163`. */
export const dRhoMastery = () => expectedRho(RUNG_BANDS[85], 0) - expectedRho(RUNG_BANDS[40], 0);

/**
 * **The lowest `m_shown` `data/job.js` publishes a rung band for — `bandFor` clamps here, so every
 * `Δρ` below it is the SAME number** (r2 finding 6, and r1's Request R5 restated as a constant
 * rather than a sentence). `RUNG_BANDS` has the keys 85 / 60 / 40 and nothing under 40, and
 * `bandFor(x <= 40)` returns the m40 band flat — so `dRhoTrue(0) === dRhoTrue(39) === dRhoTrue(40)`
 * across the WHOLE weak-spot range, which is the only range the crew grid is for.
 *
 * Read off, not asserted: `dRhoTrue` is 0.1635 at m = 0, 10, 20, 30 and 40 alike, while `dRhoModel`
 * falls 0.2691 → 0.1614 over the same span. The consequence is an ordering, not a rounding: the
 * TRUE payoff below the floor is `Δρ(40) · L̄ · m̄ · encounters`, and since `encountersFor`'s model is
 * itself `∝ w`, the true payoff there orders makes by **test weight alone** while `crewValue` orders
 * by `w · (1 − m/100)`. Measured over 1 000 seeded saves the two pick a different top make on
 * **390 of them (39 %)**, and on the saves where every make is inside the weak range, 46 of 80.
 * The suite re-measures it on every run over its own 300-save population and gets 115/300 = 38.3 %
 * (`J4_PRINT=1 node --test tests/job-crew.test.mjs | grep 'r2 band floor'`).
 *
 * This is a `data/job.js` repair (a fourth band at m 15 or m 20, which `DRHO_SLOPE` would re-fit
 * itself around at module load) and this lane does not own that file — see notes/crew-fix.md R5.
 * What is fixed HERE is that the floor is a named, exported, tested quantity instead of an implicit
 * clamp: `BAND_FLOOR`, `isBandFloored`, `dRhoTrue`, `dRhoModelError`, `steadyValueTrue`.
 */
export const BAND_FLOOR = Math.min(...Object.keys(RUNG_BANDS).map(Number));

/** Is this mastery score below the lowest published band, i.e. in the flat tail? (`m ≤ 40`.) */
export const isBandFloored = (m) => clamp(num(m, 0), 0, 100) <= BAND_FLOOR;

/**
 * **The linear model of forgiveness that G3.8's alignment theorem is stated in**: `Δρ(m) ∝ (1 −
 * m/100)`. `DRHO_SLOPE` is a least-squares fit THROUGH THE ORIGIN of the three shipped bands'
 * measured `Δρ` for STEADY, so a band that moves moves the slope and nothing here is a magic number:
 *
 *     x = 1 − m/100 = [0.60, 0.40, 0.15]      y = Δρ_steady = [0.163, 0.107, 0.032]
 *     slope = Σxy / Σx² ≈ 0.269
 *
 * **What this model is NOT (r1 fix — the docstring used to say "mildly concave", which is backwards).**
 * The chord slopes `y/x` at the three shipped bands are 0.2725 · 0.2688 · 0.2167 as `x` falls from
 * 0.60 to 0.15, i.e. `y/x` RISES with `x`: convex on the shipped range, not concave. And `bandFor`
 * clamps below m = 40, so the true `Δρ` is exactly **FLAT** for every m ≤ 40 (`dRhoTrue(0) ===
 * dRhoTrue(39) === dRhoTrue(40) = 0.1635`). Over the whole domain it is S-shaped. Two consequences,
 * both measured by the suite rather than asserted away:
 *   · at m = 85 — where HELD's gate sits — the model reads 0.0404 against a true 0.0325 (+24 %);
 *   · below m = 40 — the whole weak-spot range — the TRUE payoff orders makes by test weight ALONE,
 *     while `crewValue` orders by `w · (1 − m/100)`. Re-measured in r2 over 1 000 seeded saves they
 *     disagree on the top make in **39.0 %** of them (390/1000; the r1 docstring said ≈ 28 %, which
 *     was measured over a narrower population and is corrected here). `dRhoTrue` / `steadyValueTrue`
 *     publish the true payoff; `crewValue` stays the study-aligned ordering, and `alignmentFor`
 *     reports the gap instead of hiding it.
 * The fix for the flat tail is a band below 40 in `data/job.js` (see notes/crew-fix.md → Requests,
 * and `BAND_FLOOR` above, which names the clamp the repair has to move).
 */
export const DRHO_SLOPE = (() => {
  let sxy = 0; let sxx = 0;
  for (const key of Object.keys(RUNG_BANDS)) {
    const x = 1 - Number(key) / 100;
    const y = dRhoOf(key, STEADY);
    sxy += x * y; sxx += x * x;
  }
  return sxy / sxx;
})();

/** `Δρ̂(m)` — the model above, evaluated. `m` is the raw mastery score, 0…100. */
export const dRhoModel = (m) => DRHO_SLOPE * (1 - clamp(num(m, 0), 0, 100) / 100);

/**
 * **`Δρ(m)` as the game actually pays it** — off `bandFor(m)`, the interpolated shipped band, which
 * is what `simulateJob` draws rungs from and what the ladder settles against. This is the honest
 * counterpart to `dRhoModel`, and the two are NOT the same function: see `DRHO_SLOPE` above.
 * @param {number} m      raw mastery, 0…100
 * @param {0|1|2} [rank]  the crew rank being priced (STEADY by default)
 */
export const dRhoTrue = (m, rank = STEADY) => {
  const band = bandFor(m);
  return expectedRho(band, rank) - expectedRho(band, 0);
};

/** `|Δρ̂ − Δρ| / Δρ` at one mastery score — how wrong the linear model is where it is being used. */
export const dRhoModelError = (m) => {
  const t = dRhoTrue(m, STEADY);
  return t === 0 ? 0 : (dRhoModel(m) - t) / t;
};

/** The mean test weight of a make, `Σw / 19` — the unit `encountersFor` is expressed in. */
export const W_MEAN = TOTAL_WEIGHT / MAKES.length;

/** The make's test weight from `data/skills.js`, or 0 for a stranger. */
export const weightOf = (make) => num(skillById[make]?.w, 0);

/**
 * The raw mastery score the allocation gradient reads — **`rec.m`, exactly what
 * `readiness.skillState` puts in its `score`**, not `m_shown`. The two orderings must agree to the
 * bit, so they must read the same field (G3.8). `m_shown` is available as `mShownOf` for printing.
 */
export const mOf = (save, make) => num(save?.skills?.[make]?.m, 0);
/** `mastery.mShown(rec)` — the thin-evidence discount, for display and for the band model. */
export const mShownOf = (save, make) => mShown(save?.skills?.[make]);

/**
 * **How many targets of this make a crew point is actually awake for.** G2 flip 2 / G3.8 row 2's
 * `encounters_i`. There are TWO readings and they are not the same number:
 *
 *  · **with a `queue`** — the REAL supply. `encountersIn(queue, make).active`: every target of the
 *    make in that job except the one that is its own due review (G2's idle rule, `isIdleFor`'s own
 *    scope). This is what a point buys tonight, and it is what `steadyValueOn` prices against.
 *  · **without one** — the MODEL: `e_forgiven(shape) · w / W̄`. The shape's measured mean encounter
 *    count sets the scale and the weight ratio sets the spread.
 *
 * **The model is the step in `crewValue` that does not survive `composePage`** (r2 BLOCKER). It
 * hands every make a strictly positive, weight-proportional encounter count, so it cannot express
 * either of the two things a drafted queue does. Measured by this repo's own suite over **150
 * drafted 10-target JOB queues** (`composeBundles` → `draftUnion`, the path a job is actually played
 * on) — reproduce with `J4_PRINT=1 node --test tests/job-crew.test.mjs | grep 'r2 supply'`:
 *
 *     forgivable targets for the make the study plan puts FIRST   { 0: 93, 1: 47, 2: 10 }
 *     the make the study plan puts FIRST pays EXACTLY ZERO        93/150 = 62 %
 *     the make whose point pays most on the board IS that one     22/150 = 15 %
 *
 * (An independent run over 300 boards with a different seed tag: 48 % and 21 %. The magnitudes move
 * with the population; the mechanism does not.)
 *
 * So supply, not test weight, decides what a point is worth on a board, and `w` is only a prior on
 * it. `supplyGapFor` returns that gap as data; `tests/job-crew.test.mjs` §14 measures and bounds it.
 * The other half of the repair is not in this lane: `composeBundles` serves most makes exactly one
 * target and that target is legitimately the make's own due review — notes/crew-fix.md R4.
 *
 * @param {object} save
 * @param {string} make
 * @param {string|object} [shape='JOB']
 * @param {{queue?: object[]}} [opts]  a drafted queue → the measured count instead of the model
 */
export function encountersFor(save, make, shape = DEFAULT_SHAPE, { queue = null } = {}) {
  const w = weightOf(make);
  if (!(w > 0)) return 0;
  if (Array.isArray(queue)) return encountersIn(queue, make).active;
  return matrixParamsFor(shape).eForgiven * (w / W_MEAN);
}

/**
 * **`crewValue` — the crew grid's ADVISORY ORDERING, and the alignment theorem in code (G3.8).**
 *
 * Read the first word: this is an ORDERING, not a price. It is an exact positive multiple of
 * `readiness.weakSpots()`'s sort key and nothing else, so it says which make to look at first and
 * says nothing reliable about what a point on it pays. **The payoff against the board in front of
 * the student is `steadyValueOn(save, make, queue)`** (r2 BLOCKER — see `encountersFor`: on 93 of
 * 150 drafted JOB queues a point on the make this function ranks first pays EXACTLY ZERO, because
 * the board serves that make no forgivable target at all).
 *
 *     crewValue = L̄(shape) · m̄(shape) · Δρ̂(m) · encounters(make)
 *               = [ L̄ · m̄ · ē · DRHO_SLOPE / W_MEAN ] · w · (1 − m/100)
 *                 └──────── a positive constant of the shape ────────┘   └─ weakSpots' sort key ─┘
 *
 * Everything to the left of `w · (1 − m/100)` is a positive constant once the shape is fixed, so the
 * ORDER this function induces over makes is identical to `readiness.weakSpots()`'s order — the sort
 * key the app already prints under Weak spots. `tests/job-align.test.mjs` asserts Spearman ρ = 1
 * over 1 000 random saves.
 *
 * **WHAT THE THEOREM DOES AND DOES NOT SAY (r1 fix — three findings, one root; r2 added the
 * fourth).** The claim that survives measurement is the one against `weakSpots()`. The unrestricted
 * form — *"argmax(game) = argmax(ΔReadiness)"*, *"there is no step in the min-maxer's list that is
 * not also the best available study action"* — is FALSE as written, in FOUR separate ways (the
 * r1 docstring said "three" and then listed four; corrected in r3), and each is a computed,
 * exported, tested quantity instead of a sentence:
 *
 *  1. **ΔReadiness carries an evidence-depth term this gradient does not.** `readiness.masteryTerm`
 *     reads `m_shown = m · min(1, n/5)`, so `dR ∝ w · (1 − m/100) · min(1, n/5)`; the published
 *     derivation drops `min(1, n/5)` across a "∝". Re-measured in r2 over 1 000 seeded saves of each
 *     suite's own population, the two argmaxes disagree on **601/1000 (60 %)** of the align
 *     population and **870/1000 (87 %)** of this suite's — not the "≈ 50 %" the r1 docstring
 *     estimated. `tests/job-align.test.mjs` §4 asserts only that it is over 25 %, which is the
 *     claim that survives both populations. The equality holds **on a set of
 *     makes of equal evidence depth** (all `n ≥ 5`, where `m_shown = m`) — and that is exactly the
 *     restriction `weakSpots()`'s own sort key already embodies, because it too ignores `n`.
 *     `readinessGradient()` below prices the n-term so the gap is measurable, not arguable.
 *  2. **The build has two rungs and this function prices one.** `crewValue` is STEADY's price.
 *     HELD's price is `heldValue()`, its gate is `isMastered`, and on the evening default a mastered
 *     make can outbid every weak one — so the BUILD argmax can be a make `crewOrder` ranks last.
 *     `bestBuy()` is the real argmax; `alignmentFor()` reports whether it coincides with the study
 *     argmax on this save, and prints the threshold it stops coinciding at.
 *  3. **The true payoff is not this linear model.** See `DRHO_SLOPE` / `dRhoTrue` / `BAND_FLOOR`:
 *     below m = 40 the shipped bands clamp, so the game's real forgiveness value orders makes by
 *     `w` alone, and the two orderings pick a different top make on 39 % of seeded saves.
 *  4. **The encounter term is a model of a population, not of a board** (r2). `Δρ(m_i)·encounters_i`
 *     is only `weakSpots()`'s key because `encountersFor` assumes `encounters_i ∝ w_i`. On a real
 *     drafted queue supply is lumpy and mostly zero (`encountersFor`'s docstring carries the
 *     histogram), so the ordering this function induces and the ordering the board pays are the
 *     same ordering only when the board happens to serve the makes in weight proportion. G3.8's
 *     row 2 needs that supply condition stated with it; `supplyGapFor(save, queue)` measures it per
 *     board and `alignmentFor(save, {queue}).domain.supply` reports it per save.
 *
 * So: a min-maxer who allocates crew by this number is doing the best available study action **while
 * `alignmentFor(save, {shape, queue}).domain.all`** — every candidate at full evidence depth, the
 * best STEADY outbidding the best HELD, the board serving the make more than once, and no candidate
 * in the flat band below `BAND_FLOOR` (r3 — `domain.band`; finding 3 above is a DOMAIN condition,
 * not just a measured error, and `alignmentFor` now carries it as one). Outside that domain the game
 * points at a mastered make, at a make the board never deals, or at the wrong end of a range the
 * shipped bands price identically — and the honest thing is to say so rather than to assert a fixed
 * point.
 *
 * @param {object} save
 * @param {string} make   one of the 19 skill ids
 * @param {string|object} [shape='JOB']  a SHAPES id, or a row of overriding parameters
 * @returns {number} ≥ 0
 */
export function crewValue(save, make, shape = DEFAULT_SHAPE) {
  const w = weightOf(make);
  if (!(w > 0)) return 0;
  // `w * (1 - m/100)` is evaluated as ONE expression, byte-identical to `readiness.skillState`'s
  // `def.w * (1 - (rec?.m ?? 0) / 100)`, and only then scaled by the shape's constant. Multiplying a
  // tied pair by the same constant leaves it tied in IEEE-754 as well as in algebra — reordering the
  // factors would split near-ties by a last-bit rounding and Spearman ρ would come apart at exactly
  // the places the theorem is most interesting (equal `w · (1 − m/100)`, different `w`).
  return shapeConstant(shape) * (w * (1 - mOf(save, make) / 100));
}

/** The positive constant of the shape that `crewValue` scales `weakSpots()`'s sort key by. */
export function shapeConstant(shape = DEFAULT_SHAPE) {
  const p = matrixParamsFor(shape);
  return (p.lootMean * p.mBar * p.eForgiven * DRHO_SLOPE) / W_MEAN;
}

/** Every term of `crewValue`, plus the `weakSpots()` sort key it is a positive multiple of. */
export function crewValueDetail(save, make, shape = DEFAULT_SHAPE) {
  const p = matrixParamsFor(shape);
  const w = weightOf(make);
  const m = mOf(save, make);
  const score = w * (1 - m / 100);                 // === readiness.skillState().score
  return {
    make, shape: p.shape, w, m,
    weakness: 1 - m / 100,
    score,
    dRho: dRhoModel(m), encounters: encountersFor(save, make, shape),
    lootMean: p.lootMean, mBar: p.mBar, eForgiven: p.eForgiven,
    constant: shapeConstant(shape),
    value: crewValue(save, make, shape),
    rank: rankOf(save, make), mastered: canHold(save, make),
  };
}

/**
 * The 19 makes ordered by `crewValue`, descending, ties by `data/skills.js` table order — the same
 * sort key, and the same tie-break, `readiness.weakSpots()` uses. `opts.of` restricts the list.
 *
 * This is the crew grid's recommended order. It is NOT an argmax over an ACTION under a stake
 * (G1 Global law 6 governs the CALL); G2 publishes this ordering in prose — *"ordered by
 * `w · (1 − m/100) · encounters`, which is the exact sort key `readiness.weakSpots()` already
 * uses"* — and the app already prints it on Home under Weak spots.
 */
export function crewOrder(save, { shape = DEFAULT_SHAPE, of = MAKES } = {}) {
  return of
    .filter(isMake)
    .map((make, i) => ({ make, i, value: crewValue(save, make, shape) }))
    .sort((a, b) => (b.value - a.value) || (a.i - b.i))
    .map((x) => x.make);
}

/* ------------------------------------------------------------------ the three honest counterparts */

/** Evidence depth — `rec.n`, the term `m_shown` discounts by and the gradient's derivation drops. */
export const nOf = (save, make) => Math.max(0, num(save?.skills?.[make]?.n, 0));

/** `min(1, n/5)` — `mastery.mShown`'s discount factor, the term missing from G3.8's `∝`. */
export const evidenceDepth = (save, make) => {
  const rec = save?.skills?.[make];
  const m = num(rec?.m, 0);
  return m === 0 ? Math.min(1, nOf(save, make) / 5) : mShown(rec) / m;
};

/**
 * **`ΔReadiness` for one clean clear on this make, exactly** — not the linearised `∝`. Computed by
 * running the shipped `mastery.updateSkill(rec, 100)` and differencing the shipped `m_shown`, so it
 * carries the EMA step, the `n + 1`, and the `min(1, n/5)` discount that the published derivation
 * drops across its proportionality. `× 0.5 / TOTAL_WEIGHT` is `readiness.masteryTerm`'s own scaling;
 * it is a positive constant and is left out, exactly as `weakSpots()` leaves it out.
 *
 * This exists so finding 3 is arithmetic instead of argument: `argmax(crewValue)` and
 * `argmax(readinessGradient)` are different orderings on a population with mixed evidence depth, and
 * `tests/job-align.test.mjs` measures how different rather than filtering the disagreement away.
 */
export function readinessGradient(save, make) {
  if (!isMake(make)) return 0;
  const rec = save?.skills?.[make] ?? null;
  const after = updateSkill(rec, 100, { at: num(rec?.lastAt, 0) + 1 });
  return weightOf(make) * (mShown(after) - mShown(rec)) / 100;
}

/**
 * **The TRUE per-point STEADY payoff** — `Δρ` off the shipped band (`dRhoTrue`), not the linear
 * model. `crewValue` is the study-aligned gradient; this is what the game actually pays for the
 * point. They induce different orderings below m = 40, where `bandFor` clamps and the true payoff
 * stops depending on `m` at all (see `DRHO_SLOPE`).
 */
export function steadyValueTrue(save, make, shape = DEFAULT_SHAPE) {
  const w = weightOf(make);
  if (!(w > 0)) return 0;
  const p = matrixParamsFor(shape);
  return dRhoTrue(mOf(save, make), STEADY) * p.lootMean * p.mBar * encountersFor(save, make, shape) / COSTS.STEADY;
}

/**
 * **`crewOrder`'s honest counterpart: the makes ordered by what the SHIPPED BANDS pay** (r3 — the
 * band-floor half of G3.8's domain). Same population model of supply as `crewOrder`, same tie-break;
 * the one difference is `dRhoTrue` in place of `dRhoModel`, which is the difference between what the
 * game pays and what the crew grid's sort key says it pays.
 *
 * It exists so the fourth domain condition is an argmax comparison rather than a sentence:
 * `crewOrderTrue(s)[0] === crewOrder(s)[0]` is `alignmentFor().bandAgrees`, and it is false on
 * 38.3 % of the suite's own 300-save population because `bandFor` clamps at `BAND_FLOOR = 40` and
 * `Δρ` is one flat number across the whole weak-spot range (`DRHO_SLOPE`).
 */
export function crewOrderTrue(save, { shape = DEFAULT_SHAPE, of = MAKES } = {}) {
  return of
    .filter(isMake)
    .map((make, i) => ({ make, i, value: steadyValueTrue(save, make, shape) }))
    .sort((a, b) => (b.value - a.value) || (a.i - b.i))
    .map((x) => x.make);
}

/* ---------------------------------------------------- r2: the same two prices, against REAL supply */

/**
 * **What a STEADY point on this make buys on THIS BOARD** (r2 BLOCKER fix — the supply half).
 *
 * Identical arithmetic to `steadyValueTrue`, with the one term that was a model replaced by the
 * measurement: `encountersIn(queue, make).active`, the targets of the make in this job that a crew
 * would be awake for. It returns **exactly 0** when the board serves the make nothing, or serves it
 * only its own due review — which is the state `crewValue` cannot represent and which holds on 93
 * of 150 drafted JOB queues for the make the study plan ranks first.
 *
 * `queue` is the drafted job (`draftUnion(...).queue`, or `state.queueOf(save).slice(idx)` for what
 * is LEFT of it). Without one this is `steadyValueTrue` — the population model — and the caller
 * should say which of the two it is quoting.
 */
export function steadyValueOn(save, make, queue, { shape = DEFAULT_SHAPE } = {}) {
  const w = weightOf(make);
  if (!(w > 0)) return 0;
  const p = matrixParamsFor(shape);
  const e = encountersFor(save, make, shape, { queue });
  return dRhoTrue(mOf(save, make), STEADY) * p.lootMean * p.mBar * e / COSTS.STEADY;
}

/**
 * **What a HELD point on this make buys on THIS BOARD.** `heldValue` scales `e_held` by the make's
 * weight share `w / W̄`; this scales it by the make's measured `holdActive` count — the targets of
 * the make in this job that are not due reviews at all, which is the only place G2 lets the
 * chain-hold fire (`isHoldSuppressed`). `0` unless `canHold`, exactly as `heldValue`.
 */
export function heldValueOn(save, make, queue, { shape = DEFAULT_SHAPE } = {}) {
  const w = weightOf(make);
  if (!(w > 0) || !canHold(save, make)) return 0;
  const p = matrixParamsFor(shape);
  const eHeld = Array.isArray(queue) ? encountersIn(queue, make).holdActive : p.eHeld * (w / W_MEAN);
  return heldPerPoint({ ...p, eHeld });
}

/**
 * The makes ordered by what a STEADY point on them pays **on this board**, best first, ties by
 * `data/skills.js` table order. The honest counterpart to `crewOrder`, which orders by the study
 * key and is blind to supply. `of` restricts the list (pass the makes still on the board).
 */
export function crewOrderOn(save, queue, { shape = DEFAULT_SHAPE, of = MAKES } = {}) {
  const q = Array.isArray(queue) ? queue : [];    // no queue is the EMPTY board, not the model
  return of
    .filter(isMake)
    .map((make, i) => ({ make, i, value: steadyValueOn(save, make, q, { shape }) }))
    .sort((a, b) => (b.value - a.value) || (a.i - b.i))
    .map((x) => x.make);
}

/**
 * **G3.8 row 2's supply condition, computed for one board** (r2). The row claims
 * *"crew marginal value `Δρ(m_i)·encounters_i` = `readiness.weakSpots()`'s sort key, exactly"*. It is
 * exactly that only while the board serves the makes in weight proportion. This function reports,
 * for the board it is handed:
 *
 *   · `studyTop`     the make the study ordering puts first (`crewOrder`, which IS `weakSpots`'s)
 *   · `studySupply`  how many forgivable targets of it this board actually serves
 *   · `studyPays`    what a point on it pays here — **0 when `studySupply` is 0**
 *   · `gameTop` / `gameValue`  the make whose point pays most on this board, and what it pays
 *   · `agrees`       whether the two are the same make
 *   · `zeroPay`      whether the study plan's first make pays literally nothing tonight
 *
 * `agrees` is a comparison of two argmaxes and is read with `gameValue`: on a board where NO make is
 * served a forgivable target every point pays 0, the argmax degenerates to `of`'s tie-break order,
 * and `gameValue === 0` is what says so.
 *
 * Measured over the suite's 150 drafted JOB queues: `agrees` on 15 %, `zeroPay` on 62 %. Those two
 * numbers are the finding, and `tests/job-crew.test.mjs` §14 re-measures and bounds them on every run.
 */
export function supplyGapFor(save, queue, { shape = DEFAULT_SHAPE, of = MAKES } = {}) {
  // A gap against supply is only defined against a queue. Anything else is the EMPTY board — never
  // the population model, which would report a positive `studyPays` beside a zero `studySupply`.
  const q = Array.isArray(queue) ? queue : [];
  const pool = of.filter(isMake);
  const studyTop = crewOrder(save, { shape, of: pool })[0] ?? null;
  const studySupply = studyTop ? encountersIn(q, studyTop).active : 0;
  const studyPays = studyTop ? steadyValueOn(save, studyTop, q, { shape }) : 0;
  let best = null;
  for (const make of pool) {
    const value = steadyValueOn(save, make, q, { shape });
    if (best == null || value > best.value) best = { make, value };
  }
  return {
    shape: matrixParamsFor(shape).shape,
    studyTop, studySupply, studyPays,
    gameTop: best?.make ?? null,
    gameValue: best?.value ?? 0,
    agrees: !!studyTop && best?.make === studyTop,
    zeroPay: studyPays === 0,
  };
}

/**
 * **`heldValue` — HELD's price on ONE make** (r1 fix: the function the build decision was missing).
 *
 * `heldPerPoint` prices a ROW of G2's matrix: it is make-agnostic, so before this existed the layer
 * had no way to say which mastered make a HELD point should go on, and `crewOrder` — which prices
 * STEADY only — ranked every HELD-eligible make LAST, because `crewValue ∝ (1 − m/100)` and HELD's
 * gate is `m ≥ 85`. The build's best point could therefore sit at the bottom of the study plan's
 * list with nothing in the layer saying so.
 *
 * Both of HELD's terms scale with how often the make is served — the forgiveness term directly in
 * `e_held`, and the chain-hold term through `h = e_held · P(non-clean) · P(chain ≥ 3)` — so the
 * per-make price is the row's price with `e_held` scaled by the make's encounter share `w / W̄`,
 * the same ratio `encountersFor` uses. `0` unless `canHold` (G2's gate, G4's lapse included).
 */
export function heldValue(save, make, shape = DEFAULT_SHAPE) {
  const w = weightOf(make);
  if (!(w > 0) || !canHold(save, make)) return 0;
  const p = matrixParamsFor(shape);
  return heldPerPoint({ ...p, eHeld: p.eHeld * (w / W_MEAN) });
}

/**
 * Every crew point this save could buy, priced per point, best first: `{make, rank, value}` for
 * STEADY on all 19 makes and HELD on the mastered ones. Ties by `data/skills.js` table order, then
 * by the cheaper rank — so the list is a pure function of the save and the shape.
 */
export function buildOptions(save, { shape = DEFAULT_SHAPE, of = MAKES } = {}) {
  const out = [];
  of.filter(isMake).forEach((make, i) => {
    out.push({ make, i, rank: STEADY, name: RANK_NAMES[STEADY], value: crewValue(save, make, shape) });
    const held = heldValue(save, make, shape);
    if (held > 0) out.push({ make, i, rank: HELD, name: RANK_NAMES[HELD], value: held });
  });
  return out.sort((a, b) => (b.value - a.value) || (a.i - b.i) || (a.rank - b.rank));
}

/** The real build argmax — what a min-maxer's next point actually buys. `null` on an empty board. */
export const bestBuy = (save, opts = {}) => buildOptions(save, opts)[0] ?? null;

/**
 * **The alignment theorem's domain, computed.** G3.8 claims the game's build argmax is also the best
 * available study action. That is true exactly while the best STEADY outbids the best HELD, because
 * a HELD point goes on a MASTERED make — a make with nothing left to study. This function returns
 * both argmaxes, whether the claim holds on this save, and the threshold it fails at:
 *
 *     holds  ⇔  max_i crewValue(i)  ≥  max_{j mastered} heldValue(j)
 *            ⇔  max_i w_i(1 − m_i/100)  ≥  heldValue(best) / k(shape)          ( = `threshold` )
 *
 * `threshold` is printed in `w · (1 − m/100)` units, the units Home's Weak spots are sorted in, so
 * it can be read against the student's own weak spots: on a JOB-10 the study argmax stops winning
 * once no unmastered make scores above it.
 *
 * **`holds` is ONE of the theorem's FOUR conditions.** `holds` has always been the RANK condition
 * and only that. The sentence COMPOSED-GAME.md:552 still publishes unrestricted — *"there is no step
 * in the min-maxer's list that is not also the best available study action"* — needs all four, and
 * the only restriction that paragraph carries (`q̂ ∈ [0.5, 1]`) is row 3's and is not one of the
 * four that fail. So `domain` carries all four, computed:
 *
 *   · `domain.evidence` — every candidate make is at full evidence depth (`n ≥ N_FULL = 5`), where
 *     `m_shown = m` and the published derivation's dropped `min(1, n/5)` is 1. Off it the two
 *     argmaxes disagree on a real fraction of saves and the game prefers the THINNER-evidence make.
 *   · `domain.rank` — `holds`: the best STEADY outbids the best HELD. Off it the best point goes on
 *     a MASTERED make, which has nothing left to study. **This is the condition the r3 critic's
 *     hand-built counterexample fails** (19 makes at m 70 / n 6, one at m 52, one mastered at m 92:
 *     the game's best point is HELD on the make the study plan ranks 19 of 19), and it fails INSIDE
 *     the `q̂ ≥ 0.5` restriction — which is why the published paragraph is false on its own domain
 *     and not merely imprecise. `tests/job-crew.test.mjs` §15 pins that exact save.
 *   · `domain.supply` — the board actually pays for the study plan's first make: `supplyGapFor`'s
 *     `agrees`. `null` when no `queue` was given, because supply is not knowable from the save.
 *   · `domain.band` (r3) — **no candidate make sits in the flat tail below `BAND_FLOOR = 40`.**
 *     `RUNG_BANDS` publishes 40 / 60 / 85 and `bandFor` clamps, so `Δρ` is one constant 0.1635 for
 *     every `m ≤ 40` — the entire weak-spot range — while `crewValue`'s `dRhoModel` keeps climbing
 *     to 0.2691 at m = 0 (a 64.6 % model error). Below the floor the true payoff orders makes by
 *     test weight ALONE and the crew grid's key keeps ranking m 2 above m 38 for makes the game pays
 *     identically. `bandFloored` lists the offenders, `bandFloor` is the constant, and `bandAgrees`
 *     is the measured consequence: whether `crewOrder` and `crewOrderTrue` pick the same top make
 *     (they do not on 38.3 % of the suite's population). The repair that would remove this condition
 *     is a fourth `RUNG_BANDS` row at m ≈ 15–20 in `data/job.js` — `DRHO_SLOPE` re-fits itself at
 *     module load, so no constant is retyped — and this lane does not own that file
 *     (notes/crew-fix.md R5).
 *   · `domain.all` — all four (an unknown supply is not counted as a failure, only as unknown).
 *
 * Pass `queue` (the drafted job) to get `domain.supply` and `gap`; without one this returns exactly
 * what it returned in r1, plus the evidence, rank and band conditions.
 */
export function alignmentFor(save, { shape = DEFAULT_SHAPE, of = MAKES, queue = null } = {}) {
  const options = buildOptions(save, { shape, of });
  const steady = options.find((o) => o.rank === STEADY) ?? null;
  const held = options.find((o) => o.rank === HELD) ?? null;
  const k = shapeConstant(shape);
  const holds = !held || (steady != null && steady.value >= held.value);
  const pool = of.filter(isMake);
  const thin = pool.filter((make) => nOf(save, make) < N_FULL);
  const floored = pool.filter((make) => isBandFloored(mOf(save, make)));
  const gap = Array.isArray(queue) ? supplyGapFor(save, queue, { shape, of: pool }) : null;
  const bandAgrees = crewOrder(save, { shape, of: pool })[0] === crewOrderTrue(save, { shape, of: pool })[0];
  const domain = {
    evidence: thin.length === 0,
    rank: holds,
    supply: gap ? gap.agrees : null,
    band: floored.length === 0,
    all: thin.length === 0 && holds && floored.length === 0 && (gap ? gap.agrees : true),
  };
  return {
    shape: matrixParamsFor(shape).shape,
    steady, held, holds,
    best: options[0] ?? null,
    threshold: held && k > 0 ? held.value / k : 0,
    margin: (steady?.value ?? 0) - (held?.value ?? 0),
    domain, thinEvidence: thin, evidenceFloor: N_FULL,
    bandFloored: floored, bandFloor: BAND_FLOOR, bandAgrees, gap,
  };
}

/**
 * **G3.7 #8 — tanking cannot pay, and there is no start-of-day snapshot** (r1 fix: the spec named a
 * `m_shown` snapshot that does not exist anywhere in the layer; `grep -rn "snapshot" site/js/job/`
 * finds a RATING snapshot and a cap projection, no mastery one).
 *
 * The guarantee holds by a different and stronger mechanism, and this function is its proof: the
 * ladder's only input from the crew is `forgivenessOf`, which reads the **rank**, and the rank's
 * only `m`-dependence is `canHold` — so dropping `m` can only ever REMOVE HELD. Missing on purpose
 * therefore cannot raise a single payout today or any other day. The one `(1 − m)` term in the layer
 * is `crewValue`, which is an advisory ORDERING for the crew grid and pays nothing.
 *
 * @returns {{forgivenessBefore, forgivenessAfter, payoutRose: boolean, orderRose: boolean}}
 */
export function tankingCheck(save, make, { drop = 40, target = null, shape = DEFAULT_SHAPE } = {}) {
  const rec = save?.skills?.[make];
  const tanked = {
    ...save,
    skills: { ...(save?.skills ?? {}), [make]: { ...(rec ?? {}), m: Math.max(0, num(rec?.m, 0) - drop) } },
  };
  const before = forgivenessOf(save, make, target);
  const after = forgivenessOf(tanked, make, target);
  return {
    forgivenessBefore: before, forgivenessAfter: after,
    payoutRose: after > before,
    orderRose: crewValue(tanked, make, shape) > crewValue(save, make, shape),
  };
}

/* ==========================================================================================
   G2 — the 4×2 build matrix
   ========================================================================================== */

/**
 * The parameters of one row of G2's matrix. `lootMean` is COMPUTED (`econ.lootMean(shape)` from the
 * shape's tier mix and `LOOT`); the five measured parameters come from `data/job.js`'s `CREW_MATRIX`.
 * `over` replaces any of them — that is how the suite prices the matrix with its own measurements.
 *
 * **WHAT IS ACTUALLY ASSERTED ABOUT THESE 20 NUMBERS (r1 fix).** The published claim — *"the test
 * asserts each within ±15 %"* — is false and was false when it was written; `notes/J4.md` §5.1
 * records the truth and the authority document did not. The suite asserts:
 *   · **±15 % on exactly THREE of the twenty cells** — `m̄` on RUN, JOB-10 and JOB-12, and nothing
 *     else. The suite asserts the SET, not just the three
 *     (`assert.deepEqual(inTol, ['RUN.mBar', 'JOB.mBar', 'JOB12.mBar'])`), so the false claim cannot
 *     return by drift. (r2 correction: this line used to add `e_forgiven` on JOB-10 / VAULT-7. It
 *     does not land — since the r1 idle-rule fix `e_forgiven` measures +42 % to +56 % ABOVE the
 *     published value on every shape, which is a finding, not a tolerance.)
 *   · every other cell at its MEASURED value, with a bounded deviation in the direction it went,
 *     plus a ±2 % regression pin — neither assertion vacuous, neither number bent;
 *   · `e_held` BELOW the published value on every shape: it is structurally unreachable, not noisy.
 * And the winner: priced with the repo's own measured parameters, `buildRowFor` returns **STEADY on
 * all four rows**, not G2's `STEADY · HELD · HELD · HELD`. G2's own update rule ("if a measured
 * parameter moves the winner of a row, the row in this document is wrong and the ticket updates it")
 * therefore fired on three rows. `data/job.js`'s `CREW_MATRIX` rows and COMPOSED-GAME.md G2 are the
 * two places that have to change; this lane owns neither. See notes/crew-fix.md → Requests.
 */
export function matrixParamsFor(shape, over = {}) {
  if (isObj(shape) && shape.mBar !== undefined) return { ...shape, ...over };
  const id = typeof shape === 'string' ? shape : DEFAULT_SHAPE;
  const row = CREW_MATRIX.rows.find((r) => r.shape === id) ?? CREW_MATRIX.rows.find((r) => r.shape === DEFAULT_SHAPE);
  return {
    shape: row.shape,
    lootMean: lootMean(row.shape),
    mBar: row.mBar, eForgiven: row.eForgiven, eHeld: row.eHeld,
    pChain3: row.pChain3, mSaved: row.mSaved,
    rhoBarTimesWBar: CREW_MATRIX.rhoBarTimesWBar,
    pNonCleanMastered: CREW_MATRIX.pNonCleanMastered,
    dRhoSteady: dRhoSteady(), dRhoHeld: dRhoHeld(),
    published: { steady: row.steadyPerPoint, held: row.heldPerPoint, winner: row.winner },
    ...over,
  };
}

/**
 * G2: `STEADY per point = Δρ_steady · L̄ · m̄ · e_forgiven` — cost 1 point, so "per point" is the
 * whole of it. Priced with the m40 band, because a STEADY is bought for a make you do NOT know.
 */
export function steadyPerPoint(p) {
  return (p.dRhoSteady ?? dRhoSteady()) * p.lootMean * p.mBar * p.eForgiven / COSTS.STEADY;
}

/**
 * G2: `HELD per point = [ Δρ_held · L̄ · m̄ · e_held + h · V_hold ] / 2`, with
 * `h = e_held · P(non-clean on a mastered make) · P(chain ≥ 3)` and
 * `V_hold = Σm_saved · L̄ · ρ̄·W̄`.
 *
 * Priced with the m85 band, because HELD's gate is `isMastered`. G2 says the quiet part out loud:
 * `Δρ_held` on a make you already know is worth almost nothing (+0.049) — **you buy HELD for the
 * chain-hold, not the forgiveness**, and on every shape but the RUN the `h · V_hold` term is the
 * larger half of this expression.
 */
export function heldPerPoint(p) {
  const forgiveness = (p.dRhoHeld ?? dRhoHeld()) * p.lootMean * p.mBar * p.eHeld;
  const h = p.eHeld * p.pNonCleanMastered * p.pChain3;
  const vHold = p.mSaved * p.lootMean * p.rhoBarTimesWBar;
  return (forgiveness + h * vHold) / COSTS.HELD;
}

/** The five parameters of a row that are MEASUREMENTS — the ones `over` has to replace to price
 *  the matrix against the game instead of against the document. */
export const MEASURED_KEYS = Object.freeze(['mBar', 'eForgiven', 'eHeld', 'pChain3', 'mSaved']);

/**
 * One row of the matrix: both cells, both halves of the HELD cell, and the winner.
 *
 * **`source` says which matrix this row is** (r2). `'published'` — every measured parameter came
 * from `data/job.js`'s `CREW_MATRIX`, so the row is G2's own table reproduced through the two
 * shipped formulas and its `winner` is the DOCUMENT's claim. `'measured'` — at least one of the five
 * was supplied by the caller, so the row is priced against something that was actually observed.
 * `publishedWinner` and `agreesWithPublished` are carried on every row so a caller can never read a
 * winner without being able to see which of the two it is holding.
 */
export function buildRowFor(shape, over = {}) {
  const p = matrixParamsFor(shape, over);
  const steady = steadyPerPoint(p);
  const held = heldPerPoint(p);
  const forgiveness = (p.dRhoHeld ?? dRhoHeld()) * p.lootMean * p.mBar * p.eHeld;
  const h = p.eHeld * p.pNonCleanMastered * p.pChain3;
  const vHold = p.mSaved * p.lootMean * p.rhoBarTimesWBar;
  const winner = held > steady ? 'HELD' : 'STEADY';
  const publishedWinner = p.published?.winner ?? null;
  return {
    shape: p.shape, params: p,
    steady, held, h, vHold,
    heldForgiveness: forgiveness / COSTS.HELD,
    heldChainHold: (h * vHold) / COSTS.HELD,
    winner, margin: held - steady,
    source: MEASURED_KEYS.some((k) => over[k] !== undefined) ? 'measured' : 'published',
    publishedWinner,
    agreesWithPublished: publishedWinner == null ? null : winner === publishedWinner,
  };
}

/** G2's whole 4×2 matrix, recomputed. `over` prices it with measured parameters instead. */
export function buildMatrix(over = {}) {
  return CREW_MATRIX.rows.map((r) => buildRowFor(r.shape, isObj(over[r.shape]) ? over[r.shape] : over));
}

/**
 * The argmax of one row — **the arithmetic, never the claim**.
 *
 * **Called with no `over` it answers for the DOCUMENT, and the document is wrong on three of its
 * four rows** (r2 BLOCKER). With the shipped `CREW_MATRIX` constants this returns `'STEADY'` on a
 * RUN and `'HELD'` on JOB-10 / JOB-12 / VAULT-7, which is G2's published flip; priced with the
 * parameters this repo measures off `composeBundles` → `draftUnion` it is `'STEADY'` on all four,
 * and not narrowly — STEADY is over 4× HELD on every shape (`tests/job-crew.test.mjs` §13). The
 * published `e_held` is the reason: 5.0 on a JOB-10 against a measured 0.45, because HELD is gated
 * on mastery and the composer under-serves mastered makes.
 *
 * So: **pass measured parameters whenever you want the game's answer.** `buildRowFor(...).source`
 * tells you which of the two you are holding, and `agreesWithPublished` whether they differ. This
 * export cannot be made to answer for the game on its own, because the five measured parameters live
 * in `data/job.js` and are stale there — repricing them is notes/crew-fix.md R7, which this lane
 * does not own.
 */
export const bestRankFor = (shape, over = {}) => buildRowFor(shape, over).winner;

/* ==========================================================================================
   The measurement harness — the five parameters of the matrix, off the real composer
   ========================================================================================== */

/**
 * The rung distribution for one target, interpolated between G2's three shipped bands by the make's
 * own `m_shown` (G2: *"Rung distributions are read from `save.cards[*].history` per (make, tier)"*
 * — the bands ARE that reading, published). Below 40 and above 85 the end bands are used flat.
 * @returns {number[]} five probabilities summing to 1
 */
export function bandFor(m) {
  const keys = Object.keys(RUNG_BANDS).map(Number).sort((a, b) => a - b);
  const x = clamp(num(m, 0), 0, 100);
  if (x <= keys[0]) return RUNG_BANDS[keys[0]].slice();
  if (x >= keys[keys.length - 1]) return RUNG_BANDS[keys[keys.length - 1]].slice();
  let lo = keys[0];
  let hi = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) if (x >= keys[i] && x <= keys[i + 1]) { lo = keys[i]; hi = keys[i + 1]; break; }
  const t = (x - lo) / (hi - lo);
  const a = RUNG_BANDS[lo]; const b = RUNG_BANDS[hi];
  const out = a.map((v, i) => v * (1 - t) + b[i] * t);
  const s = out.reduce((p, v) => p + v, 0);
  return out.map((v) => v / s);
}

/** Draw a rung from a band with a seeded `rng()` in [0,1). Never `Math.random` (BUILD-POLICY). */
export function drawRung(band, u) {
  let acc = 0;
  for (let i = 0; i < band.length; i++) { acc += band[i]; if (u < acc) return i; }
  return band.length - 1;
}

/**
 * `e_forgiven` / `e_held` — how many targets of `make` a composed queue actually serves, split by the
 * idle rule's TWO scopes (r1 fix):
 *   · `active`     — what a STEADY buys: every target but the make's own (coldest) due review;
 *   · `holdActive` — what HELD's chain-hold buys: every target that is NOT a due review at all;
 *   · `idle`       — 0 or 1, the make's own due review.
 * Before the fix `active` excluded every review, which is why `e_forgiven` measured 0.000 on a board
 * `composeBundles` fills criticals-first and the crew paid nothing at all (notes/J4.md §5.3).
 */
export function encountersIn(queue, make) {
  const out = { total: 0, idle: 0, active: 0, holdActive: 0, reviews: 0, byRole: {} };
  const own = ownDueReviewIndices(queue).get(make);
  for (let i = 0; i < (queue?.length ?? 0); i++) {
    const t = queue[i];
    if (makeOf(t) !== make) continue;
    out.total++;
    out.byRole[t?.role ?? 'unknown'] = (out.byRole[t?.role ?? 'unknown'] ?? 0) + 1;
    if (isDueReview(t)) out.reviews++; else out.holdActive++;  // e_held: where the chain-hold can fire
    if (i === own) out.idle++; else out.active++;              // e_forgiven: ONE idle per make, the coldest
  }
  return out;
}

/**
 * One simulated job, under the engine's own rules: J1's ladder, J1's `chainAfterTarget`, J1's
 * `pushOrBag` threshold as the bag policy. Deterministic in `rng` — no `Math.random` anywhere.
 *
 * What it measures, per target: the chain ENTERING the target (which is the chain `m_chain`
 * multiplies), whether that chain was ≥ 3, and — when a HELD crew holds a chain that would have
 * reset — the `Σm_saved` that hold is worth, computed against a shadow continuation that replays
 * the SAME rungs and the SAME bag decisions from a reset chain.
 *
 * @param {object[]} queue  targets, in order (composePage / draftUnion output)
 * @param {object} opts
 * @param {(() => number)|{next: () => number}} opts.rng   a seeded [0,1) source — `rng.mulberry32`'s
 *        Rng object or a bare function. NEVER `Math.random` (BUILD-POLICY §2).
 * @param {(t) => number} [opts.crewRank]  the crew rank on a target's make (default 0 — a bare board)
 * @param {(t) => number} [opts.m]         the make's mastery score, for the band (default 60)
 * @param {boolean} [opts.bag=true]        run the BAG/PUSH policy (false: never bag)
 */
export function simulateJob(queue, opts = {}) {
  const src = opts.rng;
  const rng = typeof src === 'function' ? src : (typeof src?.next === 'function' ? () => src.next() : () => 0.5);
  const rankOfTarget = opts.crewRank ?? (() => BARE);
  const mOfTarget = opts.m ?? (() => 60);
  const useBag = opts.bag !== false;

  const rungs = [];
  const bands = [];
  for (const t of queue) {
    const band = bandFor(mOfTarget(t));
    bands.push(band);
    rungs.push(drawRung(band, rng()));
  }

  // r1: the two scopes of the idle rule, exactly as `isIdleFor` / `isHoldSuppressed` ship them —
  // forgiveness stands down on the make's OWN due review (one target); the chain-hold stands down on
  // every due review of the make.
  const OWN = ownDueReviewIndices(queue);

  const run = (from, chain0, loose0) => {
    let chain = chain0; let loose = loose0;
    const rows = [];
    for (let i = from; i < queue.length; i++) {
      const t = queue[i];
      const rank = rankOfTarget(t);
      const idle = rank > 0 && OWN.get(makeOf(t)) === i;
      const holdIdle = rank > 0 && isDueReview(t);
      const eff = idle ? BARE : rank;
      rows.push({ i, chain, mult: chainMult(chain), rung: rungs[i] });
      const rho = rhoFor(rungs[i], eff);
      if (rho > 0) loose += carryFor({ ...t, tier: t.tier ?? 1 }, 50, chain, rungs[i], eff);
      else loose += missFor({ ...t, tier: t.tier ?? 1 }, 50, chain, loose, eff);
      chain = chainAfterTarget(rungs[i], eff, chain, { idle: idle || holdIdle });
      if (useBag && i < queue.length - 1) {
        const next = queue[i + 1];
        const q = 1 - bands[i + 1][bands[i + 1].length - 1];
        if (pushOrBag({ loose, chain, q, tier: next.tier ?? 1, call: 50 }) === 'bag') { loose = 0; chain = chainAfterBag(); }
      }
    }
    return rows;
  };

  const rows = run(0, 0, 0);

  // Σm_saved: for every target where a HELD crew HELD a chain that would otherwise have reset,
  // the shadow continuation from the reset chain, same rungs, same policy.
  let mSaved = 0; let holds = 0;
  for (let i = 0; i < queue.length; i++) {
    const t = queue[i];
    const rank = rankOfTarget(t);
    const idle = rank > 0 && OWN.get(makeOf(t)) === i;
    const holdIdle = rank > 0 && isDueReview(t);
    const eff = idle || holdIdle ? BARE : rank;            // a hold cannot fire where it is suppressed
    const chain = rows[i].chain;
    if (eff < HELD || chain < CHAIN_HOLD_MIN) continue;
    if (chainAfterTarget(rungs[i], BARE, chain) !== 0) continue;   // would not have reset
    holds++;
    const shadow = run(i + 1, 0, 0);
    for (let k = i + 1; k < queue.length; k++) {
      const s = shadow[k - (i + 1)];
      mSaved += rows[k].mult - (s ? s.mult : 1);
    }
  }

  const mults = rows.map((r) => r.mult);
  return {
    rows, rungs, holds, mSaved,
    mBar: mults.length ? mults.reduce((a, b) => a + b, 0) / mults.length : 1,
    chain3: rows.filter((r) => r.chain >= CHAIN_HOLD_MIN).length,
    pChain3: rows.length ? rows.filter((r) => r.chain >= CHAIN_HOLD_MIN).length / rows.length : 0,
  };
}

/** Mean of a list, 0 for an empty one. */
export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** `|measured − published| / published` — the deviation each measured parameter is reported at. */
export const relErr = (measured, published) => (published === 0 ? (measured === 0 ? 0 : Infinity) : Math.abs(measured - published) / Math.abs(published));

/**
 * The tolerance G2 publishes for its own parameters (`CREW_MATRIX.tolerance` — 0.15). It is the
 * tolerance **three** of the twenty cells are asserted at, not twenty — `RUN.m̄`, `JOB.m̄`, `JOB12.m̄`,
 * and the suite asserts that exact set. (r2 correction: this said "five", which was the r1 count and
 * was already stale when it was written — see `matrixParamsFor`.)
 */
export const MATRIX_TOLERANCE = CREW_MATRIX.tolerance;

/* ------------------------------------------------------------------ re-exports for the screens */

export { CREW, CREW_RANKS, CREW_MATRIX, SHAPES };
export default crewValue;
