// tests/job-crew.test.mjs — J4: crew, capacity, the idle rule and the build decision.
//
// AUTHORITY: COMPOSED-GAME.md G2 ("Crew — capacity, not currency", "The build decision, with the
// numbers"), G1 (the ρ ladder), G3.7 #8 (mastery strictly dominates forgiveness), G4 ("Mastery is
// never faked"), G8 J4 (the acceptance list). BUILD-POLICY overrides all of it.
//
// THE RULE THIS SUITE FOLLOWS (inherited from J1/J2/J3): every published numeral is COMPUTED from
// `site/data/job.js` + `site/js/job/econ.js` and compared against the published table; the published
// table is NEVER an input to a computation.
//
// TWO PUBLISHED CLAIMS ARE MEASUREMENTS AND ARE REPORTED RATHER THAN BENT — see §9 and notes/J4.md
// §5. G2 says so itself: *"Every parameter in that table is a measurement, not a guess, and J4 owns
// the measurement … If a measured parameter moves the winner of a row, the row in this document is
// wrong and the ticket updates it — the flip structure below is the claim, not the decimals."*
// `e_held` in particular is NOT reachable from a flat `composePage` queue (§9.3 measures the ceiling
// a single make can reach on one); it needs J5's `composeBundles`, which did not exist when this
// ticket ran. Every such number is asserted at its MEASURED value so the suite is never vacuous, and
// the deviation from G2 is printed by the test that measures it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripCommentsAndStrings } from './_helpers.mjs';

/** The repo root, for the source reads in §4 (G4's open half) — resolved, never guessed from cwd. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

import {
  // constants
  MANNED_MAX, COSTS, BARE, STEADY, HELD, RANK_NAMES, MAKES, CAPACITY_MIN, CAPACITY_MAX,
  STAMPS_MAX, BOSS_STAMP_KEYS, CHAIN_HOLD_MIN, DEFAULT_SHAPE, REFUSALS,
  // capacity
  capacityFor, capacityDetail, mannedMaxFor, bossStampsOf, levelOf,
  // the crew map
  crewOf, rankOf, mannedCount, spentOf, mannedMakes, budgetFor, canHold, lapsedMakes,
  isMake, rankNumber, costOf, withCrew,
  // allocation
  canAllocate, allocate, legalize, crewDemotions,
  // one target
  makeOf, isDueReview, isIdleFor, effectiveRankOf, forgivenessOf, crewFor, holdsChain, chainAfterFor,
  keyOf, overdueOf, makeOfCard, ownDueReviewKey, ownDueReviewIndices, isHoldSuppressed,
  // the gradient
  dRhoOf, dRhoSteady, dRhoHeld, dRhoMastery, DRHO_SLOPE, dRhoModel, W_MEAN, weightOf, mOf,
  dRhoTrue, dRhoModelError, steadyValueTrue, heldValue, buildOptions, bestBuy, alignmentFor,
  readinessGradient, nOf, evidenceDepth, tankingCheck, shapeConstant,
  encountersFor, crewValue, crewValueDetail, crewOrder,
  // r2 — the same two prices against REAL supply, and the band floor
  steadyValueOn, heldValueOn, crewOrderOn, supplyGapFor, BAND_FLOOR, isBandFloored,
  // verify-2 — the OTHER clamp, and the two-ended band predicate (finding 6)
  BAND_CEIL, isBandCeiled, isBandClamped,
  // r3 — the band ordering the shipped bands actually pay
  crewOrderTrue,
  // the matrix
  matrixParamsFor, steadyPerPoint, heldPerPoint, buildRowFor, buildMatrix, bestRankFor,
  MATRIX_TOLERANCE, MEASURED_KEYS, relErr,
  // S4 — the parameter-free build decision that replaces the matrix
  marginalDRho, deepThresholdOf, deepThresholdAt, DEEP_THRESHOLDS, buildDecisionOn,
  // verify-1 — the board-measured parameters and the board-priced option list
  measuredParamsOn, boardOptionsOn, MEASURE_SAMPLES, reallocatable,
  // the measurement harness
  bandFor, drawRung, encountersIn, simulateJob, mean,
} from '../site/js/job/crew.js';

import { CREW, CREW_RANKS, CREW_MATRIX, RUNG_BANDS, CHAIN, SHAPES } from '../site/data/job.js';
import { SKILL_IDS, skillById, TOTAL_WEIGHT } from '../site/data/skills.js';
import { bosses } from '../site/data/modules.js';
import { expectedRho, lootMean, chainMult, chainAfterTarget, rhoFor } from '../site/js/job/econ.js';
import { isMastered, mShown } from '../site/js/mastery.js';
import { xpForLevel, levelFor } from '../site/js/xp.js';
import { fresh } from '../site/js/store.js';
import { composePage, composeBundles, draftUnion } from '../site/js/page.js';
import { applyOutcome, DAY_MS } from '../site/js/schedule.js';
import { mulberry32, cyrb53 } from '../site/js/rng.js';
import { cards } from '../site/data/cards.js';
import { isBonus } from '../site/data/source-manifest.js';

const NOW = new Date(2026, 8, 16, 18, 0).getTime();
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} — ${a} vs ${b} (tol ${tol})`);
const within = (measured, published, frac, msg) =>
  assert.ok(relErr(measured, published) <= frac,
    `${msg ?? ''} — measured ${measured.toFixed(4)} vs published ${published} (${(relErr(measured, published) * 100).toFixed(1)} % > ${(frac * 100).toFixed(0)} %)`);

/* ------------------------------------------------------------------ save builders */

/** A save at a given level with a given number of boss stamps. */
function saveAt(level, stamps = 0) {
  const s = fresh(NOW - 10 * DAY_MS);
  s.xp = xpForLevel(level);
  for (let i = 0; i < stamps; i++) s.trophies[`boss:${bosses[i].id}`] = NOW;
  return s;
}

/** Give a make a mastery record. `mastered` sets the third clause of `mastery.isMastered`. */
function withSkill(s, make, { m = 50, n = 4, mastered = false, misses = 1, helped = 0 } = {}) {
  s.skills[make] = {
    m, n, misses, helped, lastAt: NOW - DAY_MS,
    ...(mastered ? { lastDueCorrectAt: NOW - 2 * DAY_MS } : {}),
  };
  return s;
}

/** A save with every make mastered — the only save that can buy HELD everywhere. */
function allMastered(level = 15, stamps = 7) {
  const s = saveAt(level, stamps);
  for (const id of MAKES) withSkill(s, id, { m: 90, n: 5, mastered: true });
  return s;
}

const bank = cards.filter((c) => !isBonus(c.id));

/**
 * The seeded population §9 measures against. `u` is how far through the unit the student is; every
 * draw comes from `rng.mulberry32` (BUILD-POLICY: no `Math.random` anywhere under `site/` or here).
 */
function randomSave(i) {
  const R = mulberry32(cyrb53(`j4|save|${i}`) >>> 0);
  const rng = () => R.next();
  const s = fresh(NOW - (10 + Math.floor(rng() * 40)) * DAY_MS);
  s.profileId = `j4-${i}`;
  s.settings.testDate = '2026-09-30';
  const u = 0.3 + 0.7 * rng();
  s.xp = Math.floor(u * u * 12000);
  for (const id of SKILL_IDS) {
    if (rng() < 0.10) continue;
    const m = Math.max(0, Math.min(100, Math.round(100 * u * (0.55 + 0.6 * rng()))));
    const n = 2 + Math.floor(rng() * 7);
    const rec = {
      m, n, lastAt: NOW - Math.floor(rng() * 10) * DAY_MS,
      misses: rng() < 0.5 ? 1 + Math.floor(rng() * 2) : 0,
      helped: rng() < 0.4 ? 1 : 0,
    };
    if (m >= 85 && n >= 3 && rng() < 0.8) rec.lastDueCorrectAt = NOW - Math.floor(1 + rng() * 6) * DAY_MS;
    s.skills[id] = rec;
  }
  const nCards = Math.floor(bank.length * u * (0.4 + 0.6 * rng()));
  for (let k = 0; k < nCards; k++) {
    const c = bank[Math.floor(rng() * bank.length)];
    const out = rng() < 0.75 ? 'clean' : (rng() < 0.6 ? 'hints' : 'retry');
    const rec = applyOutcome(s, c.id, out, { now: NOW - (1 + Math.floor(rng() * 25)) * DAY_MS });
    rec.cleared = true; rec.attempts = 1; rec.rarity = 'gold';
    if (rng() < 0.45) rec.due = NOW - Math.floor(rng() * 6) * DAY_MS;
  }
  for (const b of bosses) if (rng() < u * 0.6) s.trophies[`boss:${b.id}`] = NOW;
  return s;
}

/**
 * The CONTROL population for §9.4: a student who KEEPS UP. Identical to `randomSave` except that a
 * cleared card's `due` mostly sits in the future, so the board is not dominated by overdue reviews.
 * It exists to answer the one question the bundle measurement raises — *is the crew idled by the
 * design, or by this test's unusually overdue population?* (Answer: by the design. See notes/J4.md §5.3.)
 */
function keepsUpSave(i) {
  const R = mulberry32(cyrb53(`j4|keepsup|${i}`) >>> 0);
  const rng = () => R.next();
  const s = randomSave(i);
  for (const id of Object.keys(s.cards ?? {})) {
    const rec = s.cards[id];
    if (!rec?.cleared) continue;
    rec.due = rng() < 0.22 ? NOW - Math.floor(rng() * 5) * DAY_MS : NOW + (1 + Math.floor(rng() * 12)) * DAY_MS;
  }
  return s;
}

/** A shape-sized target list out of a composed page, tiers reassigned to the shape's own mix. */
function shapeQueue(shape, queue) {
  const n = shape.targets;
  const out = [];
  for (let i = 0; i < n; i++) out.push({ ...queue[Math.floor((i * queue.length) / n)] });
  const tiers = [];
  for (const t of [1, 2, 3, 4]) for (let k = 0; k < (shape.tierMix[t] ?? 0); k++) tiers.push(t);
  out.forEach((t, i) => { t.tier = tiers[i]; });
  return out;
}

/* =========================================================================================
   1. The constants ARE G2's constants — nothing spelled twice
   ========================================================================================= */

describe('J4 · 1 · the constants come from data/job.js, never from a second copy', () => {
  test('MANNED_MAX = 12 and COSTS = { STEADY: 1, HELD: 2 }', () => {
    assert.equal(MANNED_MAX, 12);
    assert.equal(MANNED_MAX, CREW.mannedMax);
    assert.deepEqual({ ...COSTS }, { STEADY: 1, HELD: 2 });
    assert.deepEqual({ ...COSTS }, { ...CREW.COSTS });
    assert.equal(costOf(STEADY), 1);
    assert.equal(costOf(HELD), 2);
    assert.equal(costOf(BARE), 0);
  });

  test('the three states, their names and the cumulative costs are CREW_RANKS verbatim', () => {
    assert.deepEqual([BARE, STEADY, HELD], [0, 1, 2]);
    assert.deepEqual([...RANK_NAMES], ['', 'STEADY', 'HELD']);
    CREW_RANKS.forEach((r, i) => {
      assert.equal(r.rank, i);
      assert.equal(costOf(i), r.cost);
      assert.equal(RANK_NAMES[i], r.name);
    });
    // G2's table: STEADY forgives one rung, HELD two; only HELD holds the chain; only HELD is gated
    assert.deepEqual(CREW_RANKS.map((r) => r.forgives), [0, 1, 2]);
    assert.deepEqual(CREW_RANKS.map((r) => !!r.chainHold), [false, false, true]);
    assert.equal(CREW_RANKS[2].requires, 'mastery.isMastered');
  });

  test('19 makes, 7 stamps, chain-hold at 3 — all read from the data, not retyped', () => {
    assert.equal(MAKES.length, 19);
    assert.deepEqual([...MAKES], [...SKILL_IDS]);
    assert.equal(CREW.makes, 19);
    assert.equal(STAMPS_MAX, 7);
    assert.equal(bosses.length, 7);
    assert.deepEqual([...BOSS_STAMP_KEYS], bosses.map((b) => `boss:${b.id}`));
    assert.equal(CHAIN_HOLD_MIN, 3);
    assert.equal(CHAIN_HOLD_MIN, CHAIN.holdMinChain);
    assert.equal(DEFAULT_SHAPE, 'JOB');
  });

  test('rankNumber accepts the three spellings and REFUSES everything else', () => {
    assert.equal(rankNumber(0), 0); assert.equal(rankNumber(1), 1); assert.equal(rankNumber(2), 2);
    assert.equal(rankNumber('STEADY'), 1); assert.equal(rankNumber('held'), 2);
    assert.equal(rankNumber(''), 0); assert.equal(rankNumber(null), 0); assert.equal(rankNumber(undefined), 0);
    for (const bad of [3, -1, 1.5, 'BOXMAN', {}, [], NaN]) assert.equal(rankNumber(bad), null, String(bad));
  });

  test('isMake accepts exactly the 19 skill ids', () => {
    for (const id of SKILL_IDS) assert.equal(isMake(id), true, id);
    for (const bad of ['', 'VOC ', 'nope', null, 0, {}]) assert.equal(isMake(bad), false, String(bad));
  });
});

/* =========================================================================================
   2. capacityFor — 8 + floor(level/2) + stamps, range 8..22   (ACCEPTANCE)
   ========================================================================================= */

describe('J4 · 2 · capacity = 8 + floor(level/2) + bossStamps, range 8 → 22 (G2)', () => {
  test('the formula reproduces at every level from 1 to 30, for every stamp count 0..7', () => {
    for (let level = 1; level <= 30; level++) {
      for (let stamps = 0; stamps <= 7; stamps++) {
        const s = saveAt(level, stamps);
        assert.equal(levelOf(s), level, `level ${level}`);
        assert.equal(bossStampsOf(s), stamps);
        const raw = CREW.base + Math.floor(level / CREW.levelsPerPoint) + stamps;
        const expected = Math.min(CAPACITY_MAX, Math.max(CAPACITY_MIN, raw));
        assert.equal(capacityFor(s), expected, `L${level} + ${stamps} stamps`);
        const d = capacityDetail(s);
        assert.equal(d.base + d.fromLevel + d.stamps, d.raw);
        assert.equal(d.capacity, expected);
      }
    }
  });

  test('the two published endpoints: 8 at L1 with no bosses, 22 at L15 with all seven', () => {
    assert.equal(capacityFor(saveAt(1, 0)), 8);
    assert.equal(capacityFor(saveAt(1, 0)), CAPACITY_MIN);
    assert.equal(capacityFor(saveAt(15, 7)), 22);
    assert.equal(capacityFor(saveAt(15, 7)), CAPACITY_MAX);
    // and the raw sum at L15 + 7 is exactly 22 — the ceiling is reached, not clamped into
    assert.equal(capacityDetail(saveAt(15, 7)).raw, 22);
    assert.equal(capacityDetail(saveAt(15, 7)).clamped, false);
  });

  test('the range NEVER leaves 8..22, at any xp and any trophy set', () => {
    for (const xp of [0, 1, 50, 10500, 1e6, 1e12, -5, NaN, undefined]) {
      const s = fresh(NOW); s.xp = xp;
      for (const b of bosses) s.trophies[`boss:${b.id}`] = NOW;
      const c = capacityFor(s);
      assert.ok(c >= CAPACITY_MIN && c <= CAPACITY_MAX, `xp ${xp} → ${c}`);
    }
    // a save with a hundred boss trophies still stamps at 7
    const s = saveAt(20, 7);
    for (let i = 0; i < 100; i++) s.trophies[`boss:X${i}`] = NOW;
    assert.equal(bossStampsOf(s), 7);
    assert.equal(capacityFor(s), 22);
  });

  test('crew is NOT earned by playing: 30 more jobs in the log move capacity by zero (G2)', () => {
    const s = saveAt(9, 2);
    const before = capacityFor(s);
    s.game = { ...(s.game ?? {}), log: Array.from({ length: 30 }, (_, i) => ({ day: `d${i}`, shape: 'JOB', bagged: 400 })) };
    s.game.ledger = { jobs: 30, tGame: 99999, tAnswer: 99999 };
    assert.equal(capacityFor(s), before, 'thirty jobs grant zero capacity — the whole anti-grind design');
    s.xp = xpForLevel(11);
    assert.equal(capacityFor(s), before + 1, 'levelling does move it');
  });

  test('`boss-flawless:` trophies are not stamps (only the win trophy is)', () => {
    const s = saveAt(10, 0);
    for (const b of bosses) s.trophies[`boss-flawless:${b.id}`] = NOW;
    assert.equal(bossStampsOf(s), 0);
  });
});

/* =========================================================================================
   3. The manned cap, and the maximal legal build at the ceiling   (ACCEPTANCE)
   ========================================================================================= */

describe('J4 · 3 · manned ≤ min(capacity, 12); at capacity 22 the max build is 10 HELD + 2 STEADY', () => {
  test('mannedMaxFor is min(capacity, 12) at every level', () => {
    for (let level = 1; level <= 30; level++) {
      const s = saveAt(level, 7);
      assert.equal(mannedMaxFor(s), Math.min(capacityFor(s), MANNED_MAX));
    }
    assert.equal(mannedMaxFor(saveAt(1, 0)), 8, 'capacity 8 binds before the 12-make cap');
    assert.equal(mannedMaxFor(saveAt(15, 7)), 12, 'at the ceiling the 12-make cap binds');
  });

  /** The MAXIMAL build: man as many makes as the cap allows, then spend what is left on HELD. */
  function maximalBuild(save) {
    let s = save;
    for (const make of MAKES) { const r = allocate(s, make, STEADY); if (r.ok && r.changed) s = r.save; }
    for (const make of MAKES) { const r = allocate(s, make, HELD); if (r.ok && r.changed) s = r.save; }
    return s;
  }

  test('the ceiling build IS 10 HELD + 2 STEADY, 12 manned, 7 bare, 22 points — built through allocate()', () => {
    let s = allMastered(15, 7);
    assert.equal(capacityFor(s), 22);
    s = maximalBuild(s);

    const crew = crewOf(s);
    const held = Object.values(crew).filter((r) => r === HELD).length;
    const steady = Object.values(crew).filter((r) => r === STEADY).length;
    assert.equal(held, CREW.maxBuildAtCeiling.held, '10 HELD');
    assert.equal(steady, CREW.maxBuildAtCeiling.steady, '2 STEADY');
    assert.equal(held + steady, MANNED_MAX, '12 manned');
    assert.equal(MAKES.length - (held + steady), CREW.maxBuildAtCeiling.bare, 'seven makes always bare');
    assert.equal(spentOf(crew), 22, 'every one of the 22 points is spent');
    assert.equal(budgetFor(s, crew).legal, true);
    // the arithmetic G2 states: 12 manned costs 12, the remaining 10 buy 10 HELD upgrades
    assert.equal(MANNED_MAX * COSTS.STEADY + held * (COSTS.HELD - COSTS.STEADY), 22);
  });

  test('no legal build at the ceiling beats 10 HELD + 2 STEADY — brute-forced over all (held, steady)', () => {
    const cap = 22;
    const legal = [];
    for (let h = 0; h <= 19; h++) {
      for (let st = 0; st + h <= 19; st++) {
        if (h * COSTS.HELD + st * COSTS.STEADY > cap) continue;
        if (h + st > MANNED_MAX) continue;
        legal.push({ h, st, manned: h + st, spent: h * COSTS.HELD + st * COSTS.STEADY });
      }
    }
    const best = legal.sort((a, b) => (b.manned - a.manned) || (b.h - a.h))[0];
    assert.deepEqual({ held: best.h, steady: best.st }, { held: CREW.maxBuildAtCeiling.held, steady: CREW.maxBuildAtCeiling.steady });
    assert.equal(best.manned, MANNED_MAX);
    assert.equal(best.spent, 22);
    assert.ok(!legal.some((b) => b.manned > MANNED_MAX), 'nothing manns more than 12');
    assert.ok(!legal.some((b) => b.manned === MANNED_MAX && b.h > CREW.maxBuildAtCeiling.held), 'nothing at 12 manned holds more than 10');
    // 11 HELD is legal too, and manns FEWER makes — which is why the maximal build is the other one
    assert.ok(legal.some((b) => b.h === 11 && b.st === 0 && b.manned === 11));
  });

  test('there is no level at which the board is covered: 7 makes are bare at the ceiling', () => {
    const s = maximalBuild(allMastered(30, 7));    // beyond L15 — capacity is clamped, not raised
    assert.equal(capacityFor(s), 22);
    assert.equal(mannedCount(crewOf(s)), 12);
    assert.equal(MAKES.filter((m) => rankOf(s, m) === BARE).length, 7);
  });

  test('the 13th man is refused for the manned cap, the 11th HELD for capacity', () => {
    const s = maximalBuild(allMastered(15, 7));
    const bare = MAKES.filter((m) => rankOf(s, m) === BARE);
    assert.equal(bare.length, 7);
    const thirteenth = allocate(s, bare[0], STEADY);
    assert.equal(thirteenth.ok, false);
    assert.equal(thirteenth.reason, REFUSALS.MANNED_MAX);
    const steadyMake = MAKES.find((m) => rankOf(s, m) === STEADY);
    const eleventh = allocate(s, steadyMake, HELD);
    assert.equal(eleventh.ok, false);
    assert.equal(eleventh.reason, REFUSALS.CAPACITY);
  });

  test('at capacity 8 the cap is capacity, not 12: 8 STEADY, or 4 HELD, or any mix (G2)', () => {
    const s = allMastered(1, 0);
    assert.equal(capacityFor(s), 8);
    // 8 STEADY
    let a = s; let n = 0;
    for (const make of MAKES) { const r = allocate(a, make, STEADY); if (r.ok && r.changed) { a = r.save; n++; } }
    assert.equal(n, 8);
    assert.equal(spentOf(crewOf(a)), 8);
    // 4 HELD
    let b = s; let k = 0;
    for (const make of MAKES) { const r = allocate(b, make, HELD); if (r.ok && r.changed) { b = r.save; k++; } }
    assert.equal(k, 4);
    assert.equal(spentOf(crewOf(b)), 8);
    // a mix: 2 HELD + 4 STEADY
    let c = s;
    c = allocate(c, MAKES[0], HELD).save;
    c = allocate(c, MAKES[1], HELD).save;
    for (const make of MAKES.slice(2, 6)) c = allocate(c, make, STEADY).save;
    assert.equal(spentOf(crewOf(c)), 8);
    assert.equal(mannedCount(crewOf(c)), 6);
    assert.equal(allocate(c, MAKES[6], STEADY).ok, false, 'the 9th point does not exist');
  });
});

/* =========================================================================================
   4. allocate() — the invariant, proved by property test   (ACCEPTANCE)
   ========================================================================================= */

describe('J4 · 4 · NO illegal allocation is reachable through allocate() (10⁴ random call sequences)', () => {
  test('10 000 random calls across 200 random saves never produce spent > capacity or manned > cap', () => {
    const R = mulberry32(cyrb53('j4|property') >>> 0);
    let calls = 0; let accepted = 0; const seenReasons = new Set();
    const bad = ['', 'NOPE', 3, -1, 1.5, null, undefined, 'STEADY', 'HELD', 0, 1, 2];

    for (let i = 0; i < 200; i++) {
      // a save with a RANDOM capacity and a random set of mastered makes
      let s = saveAt(1 + Math.floor(R.next() * 20), Math.floor(R.next() * 8));
      for (const id of MAKES) {
        const mastered = R.next() < 0.5;
        withSkill(s, id, { m: mastered ? 88 : Math.floor(R.next() * 88), n: 3 + Math.floor(R.next() * 4), mastered });
      }
      const capacity = capacityFor(s);
      const mannedMax = mannedMaxFor(s);
      // one save in four starts already at the manned cap, so the `manned-max` branch is reached
      // by the random sequence rather than only in theory
      if (i % 4 === 0) for (const make of MAKES) { const r = allocate(s, make, STEADY); if (r.ok && r.changed) s = r.save; }

      for (let k = 0; k < 50; k++) {
        const make = R.next() < 0.05 ? 'NOT-A-MAKE' : MAKES[Math.floor(R.next() * MAKES.length)];
        const rank = bad[Math.floor(R.next() * bad.length)];
        const before = crewOf(s);
        const r = allocate(s, make, rank);
        calls++;
        if (r.reason) seenReasons.add(r.reason);

        if (r.ok) {
          accepted++;
          s = r.save;
        } else {
          assert.deepEqual(r.crew, before, 'a refusal changes nothing');
          assert.deepEqual(crewOf(r.save), before, 'a refusal returns the save unchanged');
        }

        const crew = crewOf(s);
        assert.ok(spentOf(crew) <= capacity, `spent ${spentOf(crew)} > capacity ${capacity} after ${JSON.stringify([make, rank])}`);
        assert.ok(mannedCount(crew) <= mannedMax, `manned ${mannedCount(crew)} > ${mannedMax}`);
        assert.ok(mannedCount(crew) <= MANNED_MAX, 'the 12-make cap is absolute');
        for (const [m, rk] of Object.entries(crew)) {
          assert.ok(isMake(m), `${m} is not a make`);
          assert.ok(rk === STEADY || rk === HELD, `${m} at rank ${rk}`);
          if (rk === HELD) assert.ok(isMastered(s.skills[m]), `${m} is HELD without isMastered`);
        }
      }
    }

    assert.equal(calls, 10000, 'the property test really ran 10⁴ calls');
    assert.ok(accepted > 2000, `the test is not vacuous — ${accepted} calls were accepted`);
    // every refusal branch is exercised by the random sequence
    for (const r of Object.values(REFUSALS)) assert.ok(seenReasons.has(r), `refusal '${r}' never fired`);
  });

  test('allocate is PURE — neither the save nor the crew map it was given is touched', () => {
    const s = allMastered(15, 7);
    s.game = { crew: { VOC: STEADY } };
    const snapshot = JSON.stringify(s);
    const r = allocate(s, 'NOTE', HELD);
    assert.equal(r.ok, true);
    assert.equal(JSON.stringify(s), snapshot, 'the input save is unchanged');
    assert.notEqual(r.save, s);
    assert.notEqual(r.save.game, s.game);
    assert.deepEqual(crewOf(r.save), { VOC: STEADY, NOTE: HELD });
    assert.deepEqual(crewOf(s), { VOC: STEADY });
  });

  test('HELD is refused unless mastery.isMastered — and each clause of the gate is load-bearing', () => {
    const base = () => saveAt(15, 7);
    const cases = [
      ['m below 85', { m: 84, n: 5, mastered: true }, false],
      ['n below 3', { m: 90, n: 2, mastered: true }, false],
      ['no due-review clear', { m: 90, n: 5, mastered: false }, false],
      ['all three', { m: 85, n: 3, mastered: true }, true],
    ];
    for (const [name, rec, ok] of cases) {
      const s = withSkill(base(), 'FAC2', rec);
      assert.equal(canHold(s, 'FAC2'), ok, name);
      assert.equal(isMastered(s.skills.FAC2), ok, `${name} — agrees with mastery.isMastered`);
      const r = allocate(s, 'FAC2', HELD);
      assert.equal(r.ok, ok, name);
      if (!ok) assert.equal(r.reason, REFUSALS.NOT_MASTERED, name);
      // STEADY needs nothing
      assert.equal(allocate(s, 'FAC2', STEADY).ok, true, `${name} — STEADY requires nothing`);
    }
  });

  test('HELD\'s gate is isMastered ALONE — a mastered make WITH a due card may still be HELD (G12 #4)', () => {
    const s = withSkill(saveAt(15, 7), 'VOC', { m: 92, n: 6, mastered: true });
    s.cards['def-01'] = { cleared: true, bucket: 2, due: NOW - 3 * DAY_MS, attempts: 1 };
    assert.equal(allocate(s, 'VOC', HELD).ok, true, 'no "and no due card" clause survives');
  });

  test('standing down is always legal, even from an illegal save — it is the repair path', () => {
    const s = allMastered(1, 0);                      // capacity 8
    s.game = { crew: Object.fromEntries(MAKES.map((m) => [m, HELD])) };   // 19 HELD: wildly illegal
    assert.equal(budgetFor(s, crewOf(s)).legal, false);
    const down = allocate(s, MAKES[0], BARE);
    assert.equal(down.ok, true, 'a reduction is never refused');
    assert.equal(down.spent, spentOf(crewOf(s)) - COSTS.HELD);
    const up = allocate(s, MAKES[0], HELD);
    assert.equal(up.ok, true, 'no-change is idempotent, not a refusal');
    assert.equal(up.changed, false);
    const other = allocate(s, MAKES[0], STEADY);
    assert.equal(other.ok, true);
    assert.equal(other.rank, STEADY);
  });

  test('canAllocate and allocate agree on every (make, rank) pair of a random save', () => {
    const R = mulberry32(cyrb53('j4|agree') >>> 0);
    let s = saveAt(8, 3);
    for (const id of MAKES) withSkill(s, id, { m: R.next() < 0.5 ? 90 : 40, n: 4, mastered: R.next() < 0.5 });
    for (let k = 0; k < 6; k++) s = allocate(s, MAKES[k], STEADY).save;
    for (const make of [...MAKES, 'NOT-A-MAKE']) {
      for (const rank of [BARE, STEADY, HELD, 3, 'HELD']) {
        const c = canAllocate(s, make, rank);
        const a = allocate(s, make, rank);
        assert.equal(c.ok, a.ok, `${make}/${rank}`);
        assert.equal(c.reason, a.reason, `${make}/${rank}`);
      }
    }
  });
});

/* =========================================================================================
   5. legalize() — the repair path a Mock miss needs (G4)
   ========================================================================================= */

describe('J4 · 5 · legalize() — a Mock miss drops that make\'s HELD to STEADY (G4)', () => {
  test('a lapsed HELD becomes STEADY and says so, and nothing else moves', () => {
    let s = allMastered(15, 7);
    s = allocate(s, 'FAC2', HELD).save;
    s = allocate(s, 'VOC', HELD).save;
    s.skills.FAC2.m = 69;                            // mastery.mockMiss — the Mock says it is not held
    assert.equal(canHold(s, 'FAC2'), false);
    const out = legalize(s);
    assert.equal(out.crew.FAC2, STEADY);
    assert.equal(out.crew.VOC, HELD, 'the other make is untouched');
    assert.deepEqual(out.changes, [{ make: 'FAC2', from: HELD, to: STEADY, reason: REFUSALS.NOT_MASTERED }]);
    assert.equal(out.legal, true);
  });

  test('the ladder never PAYS a lapsed HELD, even before legalize has rewritten the save', () => {
    let s = allMastered(15, 7);
    s = allocate(s, 'FAC2', HELD).save;
    assert.equal(forgivenessOf(s, 'FAC2'), HELD);
    s.skills.FAC2.m = 69;
    assert.equal(rankOf(s, 'FAC2'), HELD, 'the save still says HELD');
    assert.equal(effectiveRankOf(s, 'FAC2'), STEADY, 'but the ladder pays STEADY');
    assert.equal(forgivenessOf(s, 'FAC2'), STEADY);
    assert.equal(holdsChain(s, 'FAC2', { chain: 5, rung: 2 }), false, 'and the chain-hold is gone');
  });

  test('an over-capacity save is trimmed weakest-first and lands legal', () => {
    const s = allMastered(1, 0);                                  // capacity 8, manned cap 8
    s.game = { crew: Object.fromEntries(MAKES.map((m) => [m, HELD])) };
    const out = legalize(s);
    assert.equal(out.legal, true);
    assert.ok(out.spent <= out.capacity, `${out.spent} ≤ ${out.capacity}`);
    assert.ok(out.manned <= out.mannedMax);
    assert.ok(out.changes.length > 0);
    // deterministic: the same save legalises the same way every time
    assert.deepEqual(legalize(s).crew, out.crew);
    // and the makes it KEEPS are the highest-value ones
    const kept = mannedMakes(out.crew);
    const dropped = MAKES.filter((m) => !kept.includes(m));
    const worstKept = Math.min(...kept.map((m) => crewValue(s, m)));
    const bestDropped = Math.max(...dropped.map((m) => crewValue(s, m)));
    assert.ok(worstKept >= bestDropped - 1e-9, 'nothing dropped is worth more than something kept');
  });

  test('legalize is idempotent and a no-op on a legal save', () => {
    let s = allMastered(15, 7);
    s = allocate(s, 'VOC', HELD).save;
    s = allocate(s, 'NOTE', STEADY).save;
    const a = legalize(s);
    assert.deepEqual(a.changes, []);
    assert.deepEqual(a.crew, crewOf(s));
    const b = legalize(a.save);
    assert.deepEqual(b.crew, a.crew);
    assert.deepEqual(b.changes, []);
  });

  test('crewOf drops a stranger make a stale unit left behind', () => {
    const s = saveAt(10, 0);
    s.game = { crew: { VOC: STEADY, 'U1B-THING': HELD, NOTE: 5, PAIRS: HELD } };
    assert.deepEqual(crewOf(s), { VOC: STEADY, PAIRS: HELD });
    assert.equal(spentOf(crewOf(s)), 3, "a stale unit's crew cannot eat this unit's capacity");
  });
});

/* =========================================================================================
   6. The idle rule — ONLY on the make's own due review   (ACCEPTANCE)
   ========================================================================================= */

describe('J4 · 6 · crew is idle ONLY on a target that is its make\'s own due review (G2, G12 #4)', () => {
  const t = (skill, role, extra = {}) => ({
    id: `${skill}-${role}`, skill, skills: [skill], role, tier: 1,
    isReview: role === 'review', isRematch: role === 'rematch', ...extra,
  });

  test('the four other roles of the SAME make all keep their forgiveness', () => {
    let s = allMastered(15, 7);
    s = allocate(s, 'VOC', HELD).save;
    assert.equal(isIdleFor(s, 'VOC', t('VOC', 'review')), true, 'its own due review: idle');
    for (const role of ['rematch', 'new', 'weak', 'floor']) {
      assert.equal(isIdleFor(s, 'VOC', t('VOC', role)), false, `${role}: not idle`);
      assert.equal(forgivenessOf(s, 'VOC', t('VOC', role)), HELD, `${role}: forgives normally`);
    }
    assert.equal(forgivenessOf(s, 'VOC', t('VOC', 'review')), BARE, 'the review is answered bare');
  });

  test('another make\'s due review does not idle this crew', () => {
    let s = allMastered(15, 7);
    s = allocate(s, 'VOC', HELD).save;
    s = allocate(s, 'NOTE', STEADY).save;
    assert.equal(isIdleFor(s, 'VOC', t('NOTE', 'review')), false);
    assert.equal(forgivenessOf(s, 'VOC', t('NOTE', 'review')), HELD);
    assert.equal(forgivenessOf(s, 'NOTE', t('NOTE', 'review')), BARE, "NOTE's own review, though");
  });

  /** A save whose VOC has two real due cards, `voc-01` the colder of the two. */
  const twoDueVoc = () => {
    const s = allMastered(15, 7);
    s.cards = {
      'voc-01': { lastAt: NOW - 9 * DAY_MS, due: NOW - 3 * DAY_MS, bucket: 2, cleared: true, history: [] },
      'voc-02': { lastAt: NOW - 9 * DAY_MS, due: NOW - 1 * DAY_MS, bucket: 2, cleared: true, history: [] },
      'not-01': { lastAt: NOW - 9 * DAY_MS, due: NOW - 5 * DAY_MS, bucket: 2, cleared: true, history: [] },
    };
    return allocate(s, 'VOC', HELD).save;
  };
  /** the review target the composer emits for a card id */
  const rev = (id, skill) => ({ id, skill, skills: [skill], role: 'review', tier: 1, isReview: true });

  test('THE RULE, ON A REAL SAVE: exactly ONE target of a make is idle — its COLDEST due review', () => {
    // r1 BLOCKER fix. The old rule returned `isDueReview(target)`, so every review of the make was
    // idle; G2 says "the review that made the make cold", singular, and then says the rest of the
    // make's targets keep their forgiveness. `voc-01` is 3 days overdue, `voc-02` one day.
    const s = twoDueVoc();
    assert.equal(ownDueReviewKey(s, 'VOC', { now: NOW }), 'voc-01', "VOC's own due review is the coldest one");
    assert.equal(makeOfCard('voc-01'), 'VOC', 'the manifest resolves a card to its make');
    const job = [rev('voc-01', 'VOC'), t('VOC', 'new'), t('VOC', 'weak'), rev('voc-02', 'VOC')];
    const forgiven = job.map((x) => forgivenessOf(s, 'VOC', x, { now: NOW }));
    assert.deepEqual(forgiven, [BARE, HELD, HELD, HELD]);
    assert.equal(forgiven.filter((f) => f > 0).length, 3, 'three of the four targets pay the crew');
    assert.equal(isIdleFor(s, 'VOC', rev('voc-02', 'VOC'), { now: NOW }), false, 'the warmer due review is NOT idle');
  });

  test('THE BLOCKER, DIRECTLY: a job made ENTIRELY of a make\'s due reviews still pays the crew', () => {
    // The defect this replaces: `composeBundles` fills a job criticals-first and every critical is a
    // due review, so 100 % of a drafted job was `role: 'review'` and the old rule stood the crew
    // down on all of it — `e_forgiven = 0.000`, `e_held = 0.000`, both ranks paying literally
    // nothing on the shape the app defaults to. One target is idle now, not ten.
    const s = twoDueVoc();
    const job = ['voc-01', 'voc-02', 'voc-03', 'voc-04'].map((id) => rev(id, 'VOC'));
    const forgiven = job.map((x) => forgivenessOf(s, 'VOC', x, { now: NOW }));
    assert.equal(forgiven.filter((f) => f === BARE).length, 1, 'exactly one target is answered bare');
    assert.equal(forgiven.filter((f) => f === HELD).length, 3, 'the rest keep their forgiveness');
    const e = encountersIn(job, 'VOC');
    assert.deepEqual({ total: e.total, idle: e.idle, active: e.active }, { total: 4, idle: 1, active: 3 });
    assert.ok(e.active > 0, 'the crew is not inert on an all-review board');
  });

  test('the queue form and the save form of the rule agree, and a queue scopes it to the job', () => {
    const s = twoDueVoc();
    const job = [rev('voc-02', 'VOC'), rev('voc-01', 'VOC')];
    // the save form: voc-01 is the coldest VOC due card anywhere in the save
    assert.equal(ownDueReviewKey(s, 'VOC', { now: NOW }), 'voc-01');
    // the queue form: the coldest VOC review INSIDE this job — same answer when it is drafted…
    assert.equal(ownDueReviewKey(s, 'VOC', { queue: job }), 'voc-01');
    // …and the warmer one when the coldest was not drafted
    assert.equal(ownDueReviewKey(s, 'VOC', { queue: [rev('voc-02', 'VOC')] }), 'voc-02');
    assert.equal(ownDueReviewIndices(job).get('VOC'), 1, 'the index form the harness uses');
    assert.equal(ownDueReviewKey(s, 'NOTE', { now: NOW }), 'not-01');
    assert.equal(ownDueReviewKey(s, 'PAIRS', { now: NOW }), null, 'a make with no due card has nothing to idle');
  });

  test('G2\'s SECOND scope: the chain-hold is suppressed on EVERY due review, forgiveness on one', () => {
    // "The rest of the make's targets in that job keep their forgiveness, AND HELD's chain-hold is
    // suppressed on due-review targets only" — two different scopes in one sentence, and the second
    // clause only carries information if the first is the singular it is written as.
    const s = twoDueVoc();
    const warm = rev('voc-02', 'VOC');
    assert.equal(forgivenessOf(s, 'VOC', warm, { now: NOW }), HELD, 'forgiveness survives');
    assert.equal(isHoldSuppressed(s, 'VOC', warm), true, 'the chain-hold does not');
    assert.equal(crewFor(s, 'VOC', warm, { now: NOW }).chainHold, false);
    assert.equal(crewFor(s, 'VOC', warm, { now: NOW }).holdIdle, true);
    assert.equal(holdsChain(s, 'VOC', { chain: 5, rung: 3, target: warm, now: NOW }), false, 'no hold on a due review');
    assert.equal(holdsChain(s, 'VOC', { chain: 5, rung: 3, target: t('VOC', 'new') }), true, 'but a hold on a new one');
    assert.equal(isHoldSuppressed(s, 'VOC', t('VOC', 'new')), false);
  });

  test('isIdleFor reads the target\'s OWN label; skills[0] and `make` are accepted fallbacks', () => {
    let s = allMastered(15, 7);
    s = allocate(s, 'PAIRS', STEADY).save;
    assert.equal(makeOf({ skill: 'PAIRS' }), 'PAIRS');
    assert.equal(makeOf({ skills: ['PAIRS', 'NOTE'] }), 'PAIRS');
    assert.equal(makeOf({ make: 'PAIRS' }), 'PAIRS');
    assert.equal(makeOf({}), null);
    // a card that TEACHES the make but is labelled with another one does not idle it
    assert.equal(isIdleFor(s, 'PAIRS', { skill: 'NOTE', skills: ['NOTE', 'PAIRS'], role: 'review' }), false);
  });

  test('isDueReview accepts role, isReview and an explicit flag — and nothing else', () => {
    assert.equal(isDueReview({ role: 'review' }), true);
    assert.equal(isDueReview({ isReview: true }), true);
    assert.equal(isDueReview({ dueReview: true }), true);
    for (const role of ['rematch', 'new', 'weak', 'floor', undefined]) assert.equal(isDueReview({ role }), false, String(role));
    assert.equal(isDueReview({ role: 'rematch', isRematch: true }), false, 'a Rematch is not a review');
  });

  test('a bare make is never "idle" — there is nothing to stand down', () => {
    // r1 MAJOR fix. This test asserted the OPPOSITE of its own title, and the screen believed it:
    // `env.idle ? COPY.crewIdle(...)` printed `VOC crew idle — this target is its own due review`
    // on 9 of 11 envelopes for a student with `save.game.crew = {}` — zero manned makes, several
    // targets before the brief first showed them a crew grid at all. `simulateJob` had guarded on
    // the rank all along (`isDueReview(t) && rank > 0`); the two implementations now agree.
    const s = saveAt(10, 0);
    assert.equal(rankOf(s, 'VOC'), BARE);
    assert.equal(isIdleFor(s, 'VOC', t('VOC', 'review')), false, 'no crew, nothing to stand down');
    assert.equal(crewFor(s, 'VOC', t('VOC', 'review')).idle, false, 'and the screen reads this field');
    assert.equal(forgivenessOf(s, 'VOC', t('VOC', 'review')), BARE, 'a bare make still forgives nothing');
    assert.equal(crewFor(s, 'VOC', t('VOC', 'review')).forgives, BARE);
  });

  test('THE ZERO-CREW SAVE the critic played: not one of eleven targets reports an idle crew', () => {
    // The live repro: `save.game.crew = {}`, 11 targets, 9 of them `role: 'review'`.
    const s = saveAt(10, 0);
    s.cards = { 'voc-01': { lastAt: NOW - 9 * DAY_MS, due: NOW - 3 * DAY_MS, bucket: 2, cleared: true } };
    const job = [
      rev('voc-01', 'VOC'), rev('fact-03', 'ASN-PLP'), t('FAC2', 'new'),
      t('CS-LIN', 'weak'), rev('ang-wu-1', 'PAIRS'), t('NOTE', 'rematch'),
    ];
    for (const target of job) {
      const make = makeOf(target);
      assert.equal(isIdleFor(s, make, target, { now: NOW }), false, `${make}: no crew is manned`);
      assert.equal(crewFor(s, make, target, { now: NOW }).idle, false, `${make}: the copy line is not printed`);
    }
    // and the moment one IS manned, the rule comes back on — for exactly one target
    const manned = allocate(s, 'VOC', STEADY).save;
    assert.equal(isIdleFor(manned, 'VOC', rev('voc-01', 'VOC'), { now: NOW }), true);
  });

  test('crewFor prints every term the board needs, per target', () => {
    let s = allMastered(15, 7);
    s = allocate(s, 'VOC', HELD).save;
    const onReview = crewFor(s, 'VOC', t('VOC', 'review'));
    assert.deepEqual(
      { rank: onReview.rank, effective: onReview.effective, forgives: onReview.forgives, idle: onReview.idle, chainHold: onReview.chainHold },
      { rank: HELD, effective: HELD, forgives: BARE, idle: true, chainHold: false },
    );
    const onNew = crewFor(s, 'VOC', t('VOC', 'new'));
    assert.deepEqual(
      { forgives: onNew.forgives, idle: onNew.idle, chainHold: onNew.chainHold, name: onNew.name },
      { forgives: HELD, idle: false, chainHold: true, name: 'HELD' },
    );
  });
});

/* =========================================================================================
   7. Forgiveness on the ladder, and the chain-hold   (ACCEPTANCE)
   ========================================================================================= */

describe('J4 · 7 · forgiveness IS ρ_eff = LADDER[max(0, rung − rank)], and the chain-hold fires only at chain ≥ 3 on a non-clean', () => {
  test('forgivenessOf is exactly the rank argument econ.rhoFor takes', () => {
    let s = allMastered(15, 7);
    s = allocate(s, 'FAC2', HELD).save;
    s = allocate(s, 'NOTE', STEADY).save;
    const target = { skill: 'FAC2', role: 'new', tier: 2 };
    for (let rung = 0; rung <= 4; rung++) {
      assert.equal(rhoFor(rung, forgivenessOf(s, 'FAC2', target)), rhoFor(rung, HELD), `rung ${rung}`);
      assert.equal(rhoFor(rung, forgivenessOf(s, 'NOTE', { skill: 'NOTE', role: 'new' })), rhoFor(rung, STEADY));
      assert.equal(rhoFor(rung, forgivenessOf(s, 'SYS', { skill: 'SYS', role: 'new' })), rhoFor(rung, BARE));
    }
    // G2's own sentence: STEADY turns a miss into 0.20, HELD turns a miss into 0.45
    assert.equal(rhoFor(4, STEADY), 0.20);
    assert.equal(rhoFor(4, HELD), 0.45);
    assert.equal(rhoFor(1, STEADY), 1.00, 'a 1-hint clear pays full under STEADY');
  });

  test('the chain-hold fires at chain ≥ 3 and NOT at chain 2 — on rungs 2, 3 and 4', () => {
    let s = allMastered(15, 7);
    s = allocate(s, 'FAC2', HELD).save;
    const target = { skill: 'FAC2', role: 'new' };
    for (const rung of [2, 3, 4]) {
      for (let chain = 0; chain <= 6; chain++) {
        const fires = holdsChain(s, 'FAC2', { chain, rung, target });
        assert.equal(fires, chain >= CHAIN_HOLD_MIN, `rung ${rung} chain ${chain}`);
        assert.equal(chainAfterFor(s, 'FAC2', rung, chain, target), chain >= CHAIN_HOLD_MIN ? chain : 0, `chain after rung ${rung} at ${chain}`);
      }
    }
  });

  test('the chain-hold NEVER fires on a clean or on a Gold-with-H1 (there is nothing to hold)', () => {
    let s = allMastered(15, 7);
    s = allocate(s, 'FAC2', HELD).save;
    const target = { skill: 'FAC2', role: 'new' };
    for (let chain = 0; chain <= 8; chain++) {
      assert.equal(holdsChain(s, 'FAC2', { chain, rung: 0, target }), false, `clean at ${chain}`);
      assert.equal(chainAfterFor(s, 'FAC2', 0, chain, target), chain + 1, 'a clean still increments');
      assert.equal(holdsChain(s, 'FAC2', { chain, rung: 1, target }), false, `1-hint at ${chain}`);
      assert.equal(chainAfterFor(s, 'FAC2', 1, chain, target), chain, 'a 1-hint already holds, by xp.comboTransition');
    }
  });

  test('STEADY never holds the chain, at any chain depth', () => {
    let s = allMastered(15, 7);
    s = allocate(s, 'NOTE', STEADY).save;
    for (let chain = 0; chain <= 8; chain++) {
      for (const rung of [2, 3, 4]) {
        assert.equal(holdsChain(s, 'NOTE', { chain, rung, target: { skill: 'NOTE', role: 'new' } }), false);
        assert.equal(chainAfterFor(s, 'NOTE', rung, chain, { skill: 'NOTE', role: 'new' }), 0);
      }
    }
  });

  test('HELD\'s chain-hold is suppressed on a due-review target, and only there', () => {
    let s = allMastered(15, 7);
    s = allocate(s, 'FAC2', HELD).save;
    const review = { skill: 'FAC2', role: 'review' };
    const other = { skill: 'FAC2', role: 'weak' };
    assert.equal(holdsChain(s, 'FAC2', { chain: 5, rung: 3, target: review }), false);
    assert.equal(chainAfterFor(s, 'FAC2', 3, 5, review), 0, 'the review resets it');
    assert.equal(holdsChain(s, 'FAC2', { chain: 5, rung: 3, target: other }), true);
    assert.equal(chainAfterFor(s, 'FAC2', 3, 5, other), 5, 'the next target of the make holds it');
  });

  test('chainAfterFor agrees with econ.chainAfterTarget for every (rung, rank, chain, idle)', () => {
    let s = allMastered(15, 7);
    s = allocate(s, 'FAC2', HELD).save;
    s = allocate(s, 'NOTE', STEADY).save;
    for (const [make, rank] of [['FAC2', HELD], ['NOTE', STEADY], ['SYS', BARE]]) {
      for (const role of ['review', 'new']) {
        for (let rung = 0; rung <= 4; rung++) {
          for (let chain = 0; chain <= 9; chain++) {
            const target = { skill: make, role };
            const idle = role === 'review';
            assert.equal(
              chainAfterFor(s, make, rung, chain, target),
              chainAfterTarget(rung, rank, chain, { idle }),
              `${make} ${role} rung ${rung} chain ${chain}`,
            );
          }
        }
      }
    }
  });
});

/* =========================================================================================
   THE MEASURED MATRIX — hoisted to module scope (r2)
   =========================================================================================

   This measurement used to live inside §13. It is hoisted because §8 needs it: §8's ARGMAX test
   asserted `bestRankFor('JOB') === 'HELD'` and then `row.winner === row.params.published.winner`
   for every row, and BOTH sides of that read `matrixParamsFor(id)` → `CREW_MATRIX.rows`. It was a
   constant asserted against itself: the document read back through its own numbers, incapable of
   failing, standing where the suite's guard on G2's flip structure was supposed to be (r2 BLOCKER,
   "the test that is supposed to guard the flip structure is a constant asserted against itself").

   `M13` / `rowFor` price the same two shipped formulas with the five parameters MEASURED off
   `composeBundles` → `draftUnion`, the queue a job is actually played on. §8 now asserts the argmax
   against those, and the separate "the document reproduces its own arithmetic" check is labelled as
   exactly that and nothing more. Nothing about the measurement itself changed in the move. */

const NOW13 = NOW;
const SAVES13 = [];
const PAGES13 = [];
for (let i = 0; SAVES13.length < 150 && i < 400; i++) {
  const s = randomSave(i);
  const p = composePage(s, { now: NOW13 });
  if (!p.queue.length) continue;
  SAVES13.push(s); PAGES13.push(p);
}
const LIVE13 = SAVES13.map((_, i) => i).filter((i) => capacityFor(SAVES13[i]) >= 10);
const HOLDERS = LIVE13.filter((i) => MAKES.filter((m) => canHold(SAVES13[i], m)).length >= 3);

/** The queue a job is actually played on: the drafted union of the contracts the board posts. */
function draftedQueue(k, shapeId) {
  const b = composeBundles(SAVES13[k], { now: NOW13, page: PAGES13[k], shape: shapeId, seed: `j4|r13|${shapeId}|${k}` });
  if (!b.bundles?.length) return null;
  const picks = b.bundles.slice(0, Math.max(1, b.draft)).map((x) => x.id);
  const q = draftUnion(b.bundles, picks).queue;
  return q?.length ? q : null;
}

/**
 * Active encounters under the SHIPPED idle rule: every target of the make EXCEPT the one that is
 * its own due review. `encountersIn` answers a different (broader) question — see the header.
 */
function activeFor(queue, make) {
  const own = ownDueReviewIndices(queue).get(make);
  let n = 0;
  for (let i = 0; i < queue.length; i++) if (makeOf(queue[i]) === make && i !== own) n++;
  return n;
}

/** One job on the shipped ladder and the shipped idle rule: m̄, P(chain ≥ 3) and Σm_saved. */
function playOne(queue, save, rankOf, seed) {
  const rng = mulberry32(cyrb53(seed) >>> 0);
  const own = ownDueReviewIndices(queue);
  const rungs = queue.map((t) => drawRung(bandFor(mShown(save.skills?.[makeOf(t)])), rng.next()));
  const effOf = (i) => {
    const rank = rankOf(queue[i]);
    return (rank > 0 && own.get(makeOf(queue[i])) === i) ? BARE : rank;
  };
  const run = (from, chain0) => {
    let chain = chain0;
    const rows = [];
    for (let i = from; i < queue.length; i++) {
      rows.push({ i, chain, mult: chainMult(chain), rung: rungs[i] });
      chain = chainAfterTarget(rungs[i], effOf(i), chain, { idle: own.get(makeOf(queue[i])) === i });
    }
    return rows;
  };
  const rows = run(0, 0);
  let mSaved = 0; let holds = 0;
  for (let i = 0; i < queue.length; i++) {
    if (effOf(i) < HELD || rows[i].chain < CHAIN_HOLD_MIN) continue;
    if (chainAfterTarget(rungs[i], BARE, rows[i].chain) !== 0) continue;
    holds++;
    const shadow = run(i + 1, 0);
    for (let k = i + 1; k < queue.length; k++) mSaved += rows[k].mult - (shadow[k - (i + 1)]?.mult ?? 1);
  }
  const mults = rows.map((r) => r.mult);
  return {
    mBar: mean(mults),
    pChain3: rows.filter((r) => r.chain >= CHAIN_HOLD_MIN).length / rows.length,
    mSaved, holds,
  };
}

/** All five parameters of one row, measured on the drafted union. */
function measure13(shapeId) {
  const pool = HOLDERS.length ? HOLDERS : LIVE13;
  const eF = []; const eH = []; const mB = []; const p3 = []; const mS = [];
  let holds = 0; let boards = 0; const lens = [];
  for (const k of pool) {
    const q = draftedQueue(k, shapeId);
    if (!q) continue;
    boards++; lens.push(q.length);
    const s = SAVES13[k];
    const rows = MAKES.map((m) => ({ m, a: activeFor(q, m) }));
    const sm = rows.slice().sort((a, b) => b.a - a.a)[0];
    const hm = rows.filter((r) => canHold(s, r.m)).sort((a, b) => b.a - a.a)[0];
    eF.push(sm.a);
    if (hm) eH.push(hm.a);
    const r = playOne(q, s, (t) => (hm && makeOf(t) === hm.m ? HELD : (makeOf(t) === sm.m ? STEADY : BARE)), `j4|r13|sim|${shapeId}|${k}`);
    mB.push(r.mBar); p3.push(r.pChain3);
    if (r.holds) { mS.push(r.mSaved / r.holds); holds += r.holds; }
  }
  return {
    shape: shapeId, boards, len: mean(lens), holds,
    mBar: mean(mB), eForgiven: mean(eF), eHeld: mean(eH), pChain3: mean(p3), mSaved: mean(mS),
    published: CREW_MATRIX.rows.find((r) => r.shape === shapeId),
  };
}

const SHAPE_ROWS = ['RUN', 'JOB', 'JOB12', 'VAULT'];
const M13 = {};
for (const id of SHAPE_ROWS) M13[id] = measure13(id);
const rowFor = (id) => buildRowFor(id, {
  mBar: M13[id].mBar, eForgiven: M13[id].eForgiven, eHeld: M13[id].eHeld,
  pChain3: M13[id].pChain3, mSaved: M13[id].mSaved,
});

if (process.env.J4_PRINT) {
  for (const id of SHAPE_ROWS) {
    const m = M13[id]; const r = rowFor(id);
    console.log(`r13 ${id.padEnd(6)} boards ${m.boards} len ${m.len.toFixed(1)}  mBar ${m.mBar.toFixed(4)} eF ${m.eForgiven.toFixed(4)} eH ${m.eHeld.toFixed(4)} P3 ${m.pChain3.toFixed(4)} mSaved ${m.mSaved.toFixed(4)} | S ${r.steady.toFixed(2)} H ${r.held.toFixed(2)} → ${r.winner} (published ${m.published.winner})`);
  }
}


/* =========================================================================================
   8. G2's 4×2 matrix reproduces, and its argmax flips   (ACCEPTANCE)
   ========================================================================================= */

describe('J4 · 8 · the 4×2 build matrix reproduces from LADDER + LOOT, and STEADY wins the RUN', () => {
  test('Δρ for the two columns is computed from LADDER, not retyped (G2, G3.7 #8)', () => {
    // G2's E[ρ] table is printed to 3 dp; the underlying values carry a fourth (0.5615, 0.7255),
    // which is why Δρ_steady computes to 0.1640 where G2's rounded subtraction prints +0.163.
    close(expectedRho(RUNG_BANDS[40], 0), 0.562, 0.001, 'E[ρ] m40 r0');
    close(expectedRho(RUNG_BANDS[40], 1), 0.725, 0.001, 'E[ρ] m40 r1');
    close(expectedRho(RUNG_BANDS[85], 0), 0.940, 0.001, 'E[ρ] m85 r0');
    close(expectedRho(RUNG_BANDS[85], 2), 0.989, 0.001, 'E[ρ] m85 r2');
    close(dRhoSteady(), 0.163, 0.0015, 'Δρ STEADY on m40 = +0.163');
    close(dRhoHeld(), 0.049, 0.0015, 'Δρ HELD on m85 = +0.049');
    // G3.7 #8, the anti-tanking result: mastery is worth more than twice what forgiveness is
    close(dRhoMastery(), 0.378, 0.0015, 'mastering m40 → m85 = +0.378');
    assert.ok(dRhoMastery() > 2 * dRhoSteady(), 'mastery strictly dominates forgiveness');
    assert.ok(dRhoHeld() < 0.06, 'HELD\'s forgiveness on a make you know is worth almost nothing');
  });

  test('L̄ is computed from the shape\'s tier mix and LOOT: 6.0 / 8.4 / 12.7 / 23.1', () => {
    close(lootMean('RUN'), 6.0, 0.05, 'RUN');
    close(lootMean('JOB'), 8.4, 0.05, 'JOB-10');
    close(lootMean('JOB12'), 12.7, 0.05, 'JOB-12');
    close(lootMean('VAULT'), 23.1, 0.05, 'VAULT-7');
    for (const id of ['RUN', 'JOB', 'JOB12', 'VAULT']) {
      assert.equal(matrixParamsFor(id).lootMean, lootMean(id), `${id} uses the computed L̄`);
    }
  });

  test('all eight published cells reproduce from the two formulas to one decimal', () => {
    for (const row of buildMatrix()) {
      const p = row.params.published;
      close(row.steady, p.steady, 0.06, `${row.shape} STEADY per point`);
      close(row.held, p.held, 0.06, `${row.shape} HELD per point`);
    }
  });

  test('THE ARGMAX, priced from MEASURED parameters: STEADY wins every shape, by over 4×', () => {
    /* r2 BLOCKER FIX. What stood here was `bestRankFor('JOB') === 'HELD'` plus
       `row.winner === row.params.published.winner` for every row — and BOTH sides of both read
       `matrixParamsFor(id)` → `CREW_MATRIX.rows`. It was a constant asserted against itself: the
       document read back through its own numbers, structurally incapable of failing, standing in
       the place where the suite's guard on G2's flip structure was supposed to be.

       The guard is now an argmax over parameters that were MEASURED — `M13`, off `composeBundles`
       → `draftUnion`, the queue a job is actually played on (hoisted above this section). Nothing
       here can be satisfied by the document. */
    for (const id of SHAPE_ROWS) {
      const r = rowFor(id);
      assert.equal(r.source, 'measured', `${id}: the row must be priced from measurements, not constants`);
      assert.equal(r.winner, 'STEADY',
        `${id}: measured STEADY ${r.steady.toFixed(2)} vs HELD ${r.held.toFixed(2)}`);
      assert.ok(r.steady > r.held * 4,
        `${id}: STEADY ${r.steady.toFixed(2)} is only ${(r.steady / r.held).toFixed(1)}× HELD ${r.held.toFixed(2)}`);
    }
    // and the flip structure G2 publishes is gone, not merely dented: three of four winners moved
    const moved = SHAPE_ROWS.filter((id) => rowFor(id).agreesWithPublished === false);
    assert.deepEqual(moved, ['JOB', 'JOB12', 'VAULT'],
      'G2:229 — "if a measured parameter moves the winner of a row, the row in this document is wrong '
      + `and the ticket updates it". It moved on: ${moved.join(', ')} (notes/crew-fix.md R7, unapplied)`);
  });

  test('the published table reproduces its OWN arithmetic — and that is the whole of what it shows', () => {
    /* This check is legitimate and narrow: it catches a formula that stops reproducing G2's own
       published cells. It is NOT evidence about the game, and `buildRowFor().source` now says so on
       every row it returns, so no caller can read a winner without seeing which matrix it came from. */
    for (const row of buildMatrix()) {
      assert.equal(row.source, 'published', `${row.shape}: no measured parameter was supplied`);
      assert.equal(row.winner, row.publishedWinner, `${row.shape}: G2's own constants reproduce G2's own winner`);
    }
    assert.equal(bestRankFor('RUN'), 'STEADY');
    for (const id of ['JOB', 'JOB12', 'VAULT']) assert.equal(bestRankFor(id), 'HELD', `${id} as PUBLISHED`);
    // and the margin is real, not a rounding artefact
    assert.ok(buildRowFor('RUN').margin < -0.25, 'STEADY wins the RUN by a clear margin');
    for (const id of ['JOB', 'JOB12', 'VAULT']) assert.ok(buildRowFor(id).margin > 0.5, `${id} margin`);
    // the two matrices disagree, and the disagreement is the finding — not a tolerance
    assert.notEqual(bestRankFor('JOB'), rowFor('JOB').winner,
      'if the published and the measured argmax now AGREE, `data/job.js` CREW_MATRIX has been repriced '
      + 'and COMPOSED-GAME.md G2 must be rewritten with it — see notes/crew-fix.md R7');
  });

  test('you buy HELD for the chain-hold, not the forgiveness (G2 says it; the arithmetic shows it)', () => {
    for (const id of ['JOB', 'JOB12', 'VAULT']) {
      const r = buildRowFor(id);
      assert.ok(r.heldChainHold > r.heldForgiveness, `${id}: chain-hold ${r.heldChainHold.toFixed(2)} > forgiveness ${r.heldForgiveness.toFixed(2)}`);
    }
    // on a RUN the chains rarely reach 3, so the chain-hold term collapses and STEADY wins
    const run = buildRowFor('RUN');
    assert.ok(run.heldChainHold < run.heldForgiveness, 'on a RUN the chain-hold is the smaller half');
  });

  test('the two per-point formulas divide by the rank\'s own COST, which is what "per point" means', () => {
    const p = matrixParamsFor('JOB');
    close(steadyPerPoint(p) * COSTS.STEADY, p.dRhoSteady * p.lootMean * p.mBar * p.eForgiven, 1e-12, 'STEADY');
    const h = p.eHeld * p.pNonCleanMastered * p.pChain3;
    const vHold = p.mSaved * p.lootMean * p.rhoBarTimesWBar;
    close(heldPerPoint(p) * COSTS.HELD, p.dRhoHeld * p.lootMean * p.mBar * p.eHeld + h * vHold, 1e-12, 'HELD');
    close(p.rhoBarTimesWBar, 1.316, 1e-9, 'ρ̄·W̄');
    close(p.pNonCleanMastered, 0.06, 1e-9, 'P(non-clean on a mastered make)');
  });

  test('the matrix is monotone in the shape\'s richness: both columns rise with L̄ except where e falls', () => {
    const byShape = Object.fromEntries(buildMatrix().map((r) => [r.shape, r]));
    assert.ok(byShape.JOB.steady > byShape.RUN.steady);
    assert.ok(byShape.JOB12.steady > byShape.JOB.steady);
    assert.ok(byShape.JOB.held > byShape.RUN.held);
    assert.ok(byShape.JOB12.held > byShape.JOB.held);
  });
});

/* =========================================================================================
   9. The measurement — the five parameters, off composePage + a 10⁴-job simulation
   ========================================================================================= */

describe('J4 · 9 · the five parameters of the matrix, MEASURED (G2: "J4 owns the measurement")', () => {
  // ---- the population, built once and reused by every measurement below
  const SAVES = [];
  const PAGES = [];
  const PAGE_OBJS = [];
  for (let i = 0; i < 1000; i++) {
    const s = randomSave(i);
    const page = composePage(s, { now: NOW });
    if (!page.queue.length) continue;
    SAVES.push(s); PAGES.push(page.queue); PAGE_OBJS.push(page);
  }

  /**
   * The population each ROW prices: a student for whom that row's build decision is live.
   * `capacity ≥ 10` (there is something to spend) and, for the HELD column, ≥ 3 mastered makes —
   * the HELD row prices a decision a student with no mastered make cannot make at all (G2 flip 2).
   */
  const LIVE = SAVES.map((_, i) => i).filter((i) => capacityFor(SAVES[i]) >= 10);
  const LIVE_HELD = LIVE.filter((i) => MAKES.filter((m) => canHold(SAVES[i], m)).length >= 3);

  /**
   * One shape's five measured parameters. The crew FOLLOWS SUPPLY — the marginal point is bought on
   * the make with the most active (non-idle) targets on this board, which is what a rational
   * allocator does and what "per point" prices. Rungs are drawn from the make's own interpolated
   * band; the chain runs under J1's `chainAfterTarget` and J1's `pushOrBag` threshold.
   */
  function measure(shapeId, jobs = 2500) {
    const shape = SHAPES[shapeId];
    const pool = LIVE_HELD.length ? LIVE_HELD : LIVE;
    const eF = []; const eH = []; const mB = []; const p3 = []; const mS = [];
    let holds = 0;
    for (let j = 0; j < jobs; j++) {
      const k = pool[j % pool.length];
      const s = SAVES[k];
      const q = shapeQueue(shape, PAGES[k]);
      const rows = MAKES.map((m) => ({ m, e: encountersIn(q, m) }));
      const sm = rows.slice().sort((a, b) => b.e.active - a.e.active)[0];
      // r1: `e_held` is what HELD's CHAIN-HOLD is served — G2 suppresses the hold on every due
      // review of the make, so it is `holdActive`, not `active` (which is what a STEADY forgives).
      const hm = rows.filter((r) => canHold(s, r.m)).sort((a, b) => b.e.holdActive - a.e.holdActive)[0];
      eF.push(sm.e.active);
      if (hm) eH.push(hm.e.holdActive);
      const r = simulateJob(q, {
        rng: mulberry32(cyrb53(`j4|sim|${shapeId}|${j}`) >>> 0),
        m: (t) => SAVES[k].skills?.[t.skill]?.m ?? 50,
        crewRank: (t) => (hm && t.skill === hm.m ? HELD : (t.skill === sm.m ? STEADY : BARE)),
      });
      mB.push(r.mBar); p3.push(r.pChain3);
      if (r.holds) { mS.push(r.mSaved / r.holds); holds += r.holds; }
    }
    return {
      shape: shapeId, jobs, holds,
      mBar: mean(mB), eForgiven: mean(eF), eHeld: mean(eH), pChain3: mean(p3), mSaved: mean(mS),
      published: CREW_MATRIX.rows.find((r) => r.shape === shapeId),
    };
  }

  const MEASURED = {};
  for (const id of ['RUN', 'JOB', 'JOB12', 'VAULT']) MEASURED[id] = measure(id, 2500);

  if (process.env.J4_PRINT) {
    for (const id of ['RUN', 'JOB', 'JOB12', 'VAULT']) {
      const m = MEASURED[id]; const p = m.published;
      const f = (a, b) => `${a.toFixed(4)} (pub ${b}, ${((a - b) / b * 100).toFixed(1)}%)`;
      console.log(`${id.padEnd(6)} mBar ${f(m.mBar, p.mBar)}  eF ${f(m.eForgiven, p.eForgiven)}  eH ${f(m.eHeld, p.eHeld)}  P3 ${f(m.pChain3, p.pChain3)}  mSaved ${f(m.mSaved, p.mSaved)}  holds ${m.holds}`);
    }
  }

  test('the population is real: 1 000 seeded saves, all composed by composePage, 10⁴ simulated jobs', () => {
    assert.equal(SAVES.length, 1000, 'every seeded save composes a non-empty page');
    assert.ok(LIVE.length >= 200, `${LIVE.length} saves have capacity ≥ 10`);
    assert.ok(LIVE_HELD.length >= 20, `${LIVE_HELD.length} saves can buy HELD at all`);
    assert.equal(Object.values(MEASURED).reduce((t, m) => t + m.jobs, 0), 10000, '10⁴ simulated jobs');
    assert.ok(mean(PAGES.map((q) => q.length)) > 10, 'the pages are real pages');
  });

  test('WITHIN ±15 % — m̄ on RUN / JOB-10 / JOB-12. THREE cells of twenty, and the count is asserted', () => {
    // r1 BLOCKER fix (the authority document claims "the test asserts each within ±15 %" in three
    // places; it asserted five of twenty before this pass and asserts three now). The count itself
    // is the assertion, so the false claim cannot come back by drift: if a later change makes more
    // cells land, this test fails and the document has to be re-read, not quietly re-believed.
    for (const id of ['RUN', 'JOB', 'JOB12']) {
      within(MEASURED[id].mBar, MEASURED[id].published.mBar, MATRIX_TOLERANCE, `${id} m̄`);
    }
    const KEYS = ['mBar', 'eForgiven', 'eHeld', 'pChain3', 'mSaved'];
    const inTol = [];
    for (const id of ['RUN', 'JOB', 'JOB12', 'VAULT']) {
      for (const k of KEYS) if (relErr(MEASURED[id][k], MEASURED[id].published[k]) <= MATRIX_TOLERANCE) inTol.push(`${id}.${k}`);
    }
    assert.deepEqual(inTol, ['RUN.mBar', 'JOB.mBar', 'JOB12.mBar'],
      `EXACTLY these cells of G2's 4×5 table reproduce within ±15 %: ${inTol.join(', ')}`);
    assert.equal(inTol.length * 5, 15, '3 of 20 cells — not 20 of 20, which is what G2 §"the numbers" claims');
  });

  test('REPORTED — every parameter that misses ±15 %, with its deviation BOUNDED (notes/J4.md §5)', () => {
    // A bound in the direction the measurement actually went. It is a real assertion: it fails if a
    // later change makes any of these worse, and it fails if one of them silently becomes correct
    // without this table being updated.
    within(MEASURED.VAULT.mBar, MEASURED.VAULT.published.mBar, 0.20, 'VAULT m̄ (measured −17 %)');
    for (const id of ['RUN', 'JOB', 'JOB12', 'VAULT']) {
      // r1: e_forgiven now measures ABOVE G2 on every shape, because the idle rule was fixed. G2's
      // encounter counts were written for the per-MAKE idle rule G12 #4 replaced and were never
      // re-derived; `data/job.js`'s CREW_MATRIX is the file that has to change (notes/crew-fix.md).
      within(MEASURED[id].eForgiven, MEASURED[id].published.eForgiven, 0.60, `${id} e_forgiven`);
      assert.ok(MEASURED[id].eForgiven > MEASURED[id].published.eForgiven,
        `${id}: with the idle rule fixed, a STEADY is served MORE targets than G2 assumes, not fewer`);
      within(MEASURED[id].pChain3, MEASURED[id].published.pChain3, 0.90, `${id} P(chain ≥ 3)`);
      within(MEASURED[id].mSaved, MEASURED[id].published.mSaved, 0.85, `${id} Σm_saved`);
      within(MEASURED[id].eHeld, MEASURED[id].published.eHeld, 0.95, `${id} e_held`);
      assert.ok(MEASURED[id].eHeld < MEASURED[id].published.eHeld,
        `${id}: e_held is measured BELOW the published value on every shape — the finding of §9.3`);
    }
    // the shape of the P(chain ≥ 3) miss: the RUN over-chains against G2, the three longer shapes under-chain
    assert.ok(MEASURED.RUN.pChain3 > MEASURED.RUN.published.pChain3, 'RUN chains reach 3 MORE often than G2 assumes');
    for (const id of ['JOB', 'JOB12', 'VAULT']) {
      assert.ok(MEASURED[id].pChain3 < MEASURED[id].published.pChain3, `${id} chains reach 3 LESS often than G2 assumes`);
    }
    for (const id of ['RUN', 'JOB', 'JOB12', 'VAULT']) {
      assert.ok(MEASURED[id].pChain3 > 0.05 && MEASURED[id].pChain3 < 0.60, `${id} P(chain ≥ 3) = ${MEASURED[id].pChain3.toFixed(3)}`);
    }
  });

  test('REGRESSION PINS — every measured parameter, at the value this ticket measured', () => {
    // A pin, not a claim. It exists so that a change to composePage, the ladder, the bag threshold
    // or the population shows up as a failing test rather than as a quietly different economy.
    // r1: only `e_forgiven` moved — the idle-rule fix is supposed to change exactly that parameter,
    // and the pins prove it did. `m̄`, `e_held`, `P(chain ≥ 3)` and `Σm_saved` reproduce J4's
    // original measurement to four decimals, so nothing else in the economy drifted with it.
    const PIN = {
      RUN: { mBar: 1.2774, eForgiven: 1.3132, eHeld: 0.3036, pChain3: 0.2203, mSaved: 0.2160 },
      JOB: { mBar: 1.4171, eForgiven: 2.1772, eHeld: 0.4532, pChain3: 0.3401, mSaved: 1.5545 },
      JOB12: { mBar: 1.4478, eForgiven: 2.4232, eHeld: 0.5380, pChain3: 0.3583, mSaved: 1.3730 },
      VAULT: { mBar: 1.3235, eForgiven: 1.5028, eHeld: 0.2856, pChain3: 0.2696, mSaved: 0.7647 },
    };
    const PRE_FIX_EF = { RUN: 1.0392, JOB: 1.6036, JOB12: 1.3156, VAULT: 1.0756 };
    for (const id of ['RUN', 'JOB', 'JOB12', 'VAULT']) {
      assert.ok(MEASURED[id].eForgiven > PRE_FIX_EF[id] * 1.2,
        `${id}: the idle-rule fix bought the crew at least 20 % more served targets (${PRE_FIX_EF[id]} → ${MEASURED[id].eForgiven.toFixed(4)})`);
    }
    for (const [id, row] of Object.entries(PIN)) {
      for (const [k, v] of Object.entries(row)) {
        within(MEASURED[id][k], v, 0.02, `${id} ${k} drifted from the J4 measurement`);
      }
    }
  });

  test('e_held is NOT reachable from a flat composePage queue — the ceiling ONE make can reach', () => {
    // The structural finding behind the e_held deviation (notes/J4.md §5.2): on a 10-target queue
    // drawn flat from composePage, the BEST-supplied make of all 19 tops out near 3 targets in
    // total and near 1.6 once its own due reviews (where crew is idle) are removed. G2's e_held of
    // 5.0 needs `composeBundles`'s make-labelled contracts — J5, which did not exist at J4's time.
    const shape = SHAPES.JOB;
    const best = []; const bestTotal = [];
    for (let i = 0; i < SAVES.length; i++) {
      const q = shapeQueue(shape, PAGES[i]);
      const rows = MAKES.map((m) => encountersIn(q, m));
      best.push(Math.max(...rows.map((r) => r.holdActive)));
      bestTotal.push(Math.max(...rows.map((r) => r.total)));
    }
    const ceilingActive = mean(best);
    const ceilingTotal = mean(bestTotal);
    assert.ok(ceilingTotal < CREW_MATRIX.rows.find((r) => r.shape === 'JOB').eHeld * 0.85,
      `even counting idle dues, the best make reaches ${ceilingTotal.toFixed(2)} of 10 targets — G2's e_held is 5.0`);
    assert.ok(ceilingActive > 0.5 && ceilingActive < 2.5, `hold-active ceiling ${ceilingActive.toFixed(2)}`);
    assert.ok(ceilingActive <= ceilingTotal);
  });

  test('THE BUNDLE PATH — measured against J5\'s composeBundles + draftUnion (G8 J4 names both)', () => {
    // J5 landed `composeBundles` / `draftUnion` while this ticket was running, so the acceptance's
    // "composePage + composeBundles" is measurable after all. The bundle path reshapes the page to
    // the shape's budget and puts the CRITICALS first — which on this population means a drafted job
    // is overwhelmingly the student's own due reviews, where the idle rule stands the crew down on
    // every target of its own make. That is not a bug in J5: it is G1's own "Cold crew" failure
    // state (`4 crew idle on their own reviews · 9 dues · clear them first`) showing up as a number.
    // The consequence for the matrix is recorded in notes/J4.md §5.3.
    // the flat-page comparison point, measured on the same saves
    const flatIdle = [];
    for (let i = 0; i < 250; i++) {
      const q = shapeQueue(SHAPES.JOB, PAGES[i]);
      flatIdle.push(q.filter(isDueReview).length / q.length);
    }

    const out = {};
    for (const id of ['RUN', 'JOB', 'JOB12', 'VAULT']) {
      const lens = []; const idleShare = []; const eF = []; const eH = [];
      for (let i = 0; i < 250; i++) {
        const s = SAVES[i];
        const b = composeBundles(s, { now: NOW, page: PAGE_OBJS[i], shape: id, seed: `j4|bundle|${id}|${i}` });
        if (!b.bundles.length) continue;
        const picks = b.bundles.slice(0, Math.max(1, b.draft)).map((x) => x.id);
        const q = draftUnion(b.bundles, picks).queue;
        if (!q.length) continue;
        lens.push(q.length);
        idleShare.push(q.filter(isDueReview).length / q.length);
        const rows = MAKES.map((m) => ({ m, e: encountersIn(q, m) }));
        eF.push(Math.max(...rows.map((r) => r.e.active)));
        const hm = rows.filter((r) => canHold(s, r.m)).sort((a, b2) => b2.e.holdActive - a.e.holdActive)[0];
        if (hm) eH.push(hm.e.holdActive);
      }
      out[id] = { n: lens.length, len: mean(lens), idle: mean(idleShare), eF: mean(eF), eH: mean(eH) };
    }

    for (const id of ['RUN', 'JOB', 'JOB12', 'VAULT']) {
      const o = out[id];
      assert.ok(o.n >= 200, `${id}: ${o.n} of 250 saves post a board`);
      // J5's own contract, cross-checked from here: the drafted union is the shape's target count
      close(o.len, SHAPES[id].targets, 1.5, `${id}: the drafted union is ~${SHAPES[id].targets} targets`);
      // THE FINDING, unchanged: most of a drafted job is the student's own due reviews
      assert.ok(o.idle > 0.5, `${id}: ${(o.idle * 100).toFixed(0)} % of a drafted job is a due review`);
      // THE BLOCKER, FIXED (r1). This used to read e_forgiven 0.000 / e_held 0.000 on exactly this
      // path: a drafted job that is 100 % due reviews, the old idle rule standing the crew down on
      // every one of them, and both crew ranks therefore paying literally nothing on the shape the
      // app defaults to. A STEADY is now served real targets on every shape.
      assert.ok(o.eF >= 1.0, `${id}: a STEADY is served ${o.eF.toFixed(3)} targets on a DRAFTED job — it was 0.000`);
      // and HELD's chain-hold is still the parameter that does not reproduce: the hold is suppressed
      // on every due review (G2's second scope), and a drafted job is mostly due reviews.
      assert.ok(o.eH < CREW_MATRIX.rows.find((r) => r.shape === id).eHeld * 0.5,
        `${id} bundle e_held ${o.eH.toFixed(3)} — still far under G2's published number`);
    }

    // THE CONTROL: the same measurement on a student who keeps up, so the finding cannot be waved
    // away as an artefact of an overdue-heavy population.
    const keep = { lens: [], idle: [], eF: [], eH: [] };
    for (let i = 0; i < 250; i++) {
      const s = keepsUpSave(i);
      const page = composePage(s, { now: NOW });
      if (!page.queue.length) continue;
      const b = composeBundles(s, { now: NOW, page, shape: 'JOB', seed: `j4|keep|${i}` });
      if (!b.bundles.length) continue;
      const q = draftUnion(b.bundles, b.bundles.slice(0, Math.max(1, b.draft)).map((x) => x.id)).queue;
      if (!q.length) continue;
      keep.lens.push(q.length);
      keep.idle.push(q.filter(isDueReview).length / q.length);
      const rows = MAKES.map((m) => ({ m, e: encountersIn(q, m) }));
      keep.eF.push(Math.max(...rows.map((r) => r.e.active)));
      const hm = rows.filter((r) => canHold(s, r.m)).sort((a, b2) => b2.e.holdActive - a.e.holdActive)[0];
      if (hm) keep.eH.push(hm.e.holdActive);
    }
    assert.ok(keep.lens.length >= 200, `${keep.lens.length} keeps-up saves post a JOB-10 board`);
    assert.ok(mean(keep.idle) > 0.4, `even keeping up, ${(mean(keep.idle) * 100).toFixed(0)} % of a drafted JOB-10 is a due review`);
    assert.ok(mean(keep.eF) > out.JOB.eF, 'keeping up DOES buy the crew more active targets — the mechanism is the idle rule');
    // r1: the control's job is to show the finding is structural, not a population artefact. Under
    // the fixed idle rule BOTH populations pay the crew; what the control still shows is that the
    // overdue-heavy one pays it less, and that G2's published e_forgiven is under BOTH of them.
    assert.ok(mean(keep.eH) < CREW_MATRIX.rows.find((r) => r.shape === 'JOB').eHeld * 0.5,
      `keeps-up bundle e_held ${mean(keep.eH).toFixed(3)} is still far below G2's 5.0`);
    assert.ok(mean(flatIdle) < out.JOB.idle,
      `the flat page is less review-heavy (${(mean(flatIdle) * 100).toFixed(0)} %) than a drafted job (${(out.JOB.idle * 100).toFixed(0)} %)`);
    if (process.env.J4_PRINT) {
      console.log(`flat   JOB-10 idle ${(mean(flatIdle) * 100).toFixed(0)}%`);
      console.log(`bundle KEEP   n ${keep.lens.length} len ${mean(keep.lens).toFixed(2)} idle ${(mean(keep.idle) * 100).toFixed(0)}%  eF ${mean(keep.eF).toFixed(3)}  eH ${mean(keep.eH).toFixed(3)}`);
    }
    if (process.env.J4_PRINT) {
      for (const id of ['RUN', 'JOB', 'JOB12', 'VAULT']) {
        const o = out[id];
        console.log(`bundle ${id.padEnd(6)} n ${o.n} len ${o.len.toFixed(2)} idle ${(o.idle * 100).toFixed(0)}%  eF ${o.eF.toFixed(3)}  eH ${o.eH.toFixed(3)}`);
      }
    }
  });

  test('the flip structure is what the measurement CAN and CANNOT confirm, stated numerically', () => {
    // Priced with the published parameters, the flip holds (§8). Priced with the measured ones —
    // where e_held is 20× smaller than published because a flat queue cannot concentrate a make —
    // HELD loses everywhere. That is the ticket's objection, machine-checked rather than asserted.
    const measuredRow = (id) => buildRowFor(id, {
      mBar: MEASURED[id].mBar, eForgiven: MEASURED[id].eForgiven, eHeld: MEASURED[id].eHeld,
      pChain3: MEASURED[id].pChain3, mSaved: MEASURED[id].mSaved,
    });
    assert.equal(measuredRow('RUN').winner, 'STEADY', 'the RUN row survives the measurement');
    for (const id of ['JOB', 'JOB12', 'VAULT']) {
      assert.equal(measuredRow(id).winner, 'STEADY',
        `${id} flips to STEADY under the measured e_held — see notes/J4.md §5.2`);
    }
    // and the sensitivity: how much e_held a JOB-10 needs for HELD to win, everything else measured
    let need = 0;
    for (let e = 0.1; e < 20; e += 0.05) {
      if (buildRowFor('JOB', { mBar: MEASURED.JOB.mBar, eForgiven: MEASURED.JOB.eForgiven, eHeld: e, pChain3: MEASURED.JOB.pChain3, mSaved: MEASURED.JOB.mSaved }).winner === 'HELD') { need = e; break; }
    }
    assert.ok(need > MEASURED.JOB.eHeld, `HELD needs e_held ≥ ${need.toFixed(2)} on a JOB-10; the flat queue supplies ${MEASURED.JOB.eHeld.toFixed(2)}`);
    assert.ok(need < SHAPES.JOB.targets, `and ${need.toFixed(2)} is inside a 10-target job, so composeBundles CAN deliver it`);
  });
});

/* =========================================================================================
   10. The measurement harness itself
   ========================================================================================= */

describe('J4 · 10 · the measurement harness is deterministic and honest', () => {
  test('bandFor interpolates between the three shipped bands and always sums to 1', () => {
    for (const key of [40, 60, 85]) assert.deepEqual(bandFor(key).map((x) => +x.toFixed(12)), RUNG_BANDS[key].map((x) => +x.toFixed(12)), `band ${key}`);
    assert.deepEqual(bandFor(0), RUNG_BANDS[40], 'below 40 uses the m40 band flat');
    assert.deepEqual(bandFor(100), RUNG_BANDS[85], 'above 85 uses the m85 band flat');
    for (let m = 0; m <= 100; m += 1) {
      const b = bandFor(m);
      close(b.reduce((a, x) => a + x, 0), 1, 1e-12, `band(${m}) sums to 1`);
      assert.ok(b.every((x) => x >= 0), `band(${m}) is non-negative`);
    }
    // the clean rate is monotone non-decreasing in m, and the miss rate non-increasing
    let lastClean = -1; let lastMiss = 2;
    for (let m = 0; m <= 100; m += 5) {
      const b = bandFor(m);
      assert.ok(b[0] >= lastClean - 1e-12, `clean rate at m${m}`);
      assert.ok(b[4] <= lastMiss + 1e-12, `miss rate at m${m}`);
      lastClean = b[0]; lastMiss = b[4];
    }
  });

  test('drawRung is a proper inverse CDF and never leaves 0..4', () => {
    const b = bandFor(60);
    assert.equal(drawRung(b, 0), 0);
    assert.equal(drawRung(b, 0.999999), 4);
    const counts = [0, 0, 0, 0, 0];
    const R = mulberry32(cyrb53('j4|draw') >>> 0);
    for (let i = 0; i < 200000; i++) counts[drawRung(b, R.next())]++;
    counts.forEach((c, i) => close(c / 200000, b[i], 0.01, `rung ${i}`));
  });

  test('simulateJob is deterministic in its seed and never calls Math.random', () => {
    const q = Array.from({ length: 10 }, (_, i) => ({ skill: MAKES[i % MAKES.length], role: i % 4 === 0 ? 'review' : 'new', tier: i < 8 ? 1 : 2 }));
    const a = simulateJob(q, { rng: mulberry32(7), m: () => 70 });
    const b = simulateJob(q, { rng: mulberry32(7), m: () => 70 });
    assert.deepEqual(a.rungs, b.rungs);
    close(a.mBar, b.mBar, 0, 'same seed, same m̄');
    const c = simulateJob(q, { rng: mulberry32(8), m: () => 70 });
    assert.notDeepEqual(a.rungs, c.rungs, 'a different seed is a different job');
  });

  test('simulateJob\'s m̄ is the mean of chainMult over the chain ENTERING each target', () => {
    const q = Array.from({ length: 12 }, () => ({ skill: 'VOC', role: 'new', tier: 1 }));
    const r = simulateJob(q, { rng: mulberry32(3), m: () => 90 });
    close(r.mBar, mean(r.rows.map((x) => x.mult)), 1e-12);
    r.rows.forEach((x) => close(x.mult, chainMult(x.chain), 1e-12, `row ${x.i}`));
    assert.equal(r.rows[0].chain, 0, 'every job starts at chain 0');
    close(r.rows[0].mult, 1, 1e-12, 'and therefore at m_chain 1.0');
    assert.ok(r.pChain3 === r.chain3 / q.length);
  });

  test('encountersIn splits a make\'s targets into idle (its own due reviews) and active', () => {
    const q = [
      { skill: 'VOC', role: 'review' }, { skill: 'VOC', role: 'new' }, { skill: 'VOC', role: 'weak' },
      { skill: 'NOTE', role: 'review' }, { skill: 'PAIRS', role: 'rematch' },
    ];
    assert.deepEqual({ ...encountersIn(q, 'VOC'), byRole: undefined },
      { total: 3, idle: 1, active: 2, holdActive: 2, reviews: 1, byRole: undefined });
    assert.deepEqual(encountersIn(q, 'VOC').byRole, { review: 1, new: 1, weak: 1 });
    assert.equal(encountersIn(q, 'PAIRS').active, 1, 'a Rematch is active — it is not a due review');
    assert.equal(encountersIn(q, 'SYS').total, 0);
    assert.equal(encountersIn(null, 'VOC').total, 0);
  });

  test('encountersIn\'s TWO scopes: `active` drops one review, `holdActive` drops them all (r1)', () => {
    const q = [
      { id: 'voc-01', skill: 'VOC', role: 'review', overdue: 3 },
      { id: 'voc-02', skill: 'VOC', role: 'review', overdue: 1 },
      { id: 'voc-03', skill: 'VOC', role: 'review', overdue: 0.2 },
      { id: 'voc-x', skill: 'VOC', role: 'new' },
    ];
    const e = encountersIn(q, 'VOC');
    assert.equal(e.idle, 1, 'one idle — the coldest');
    assert.equal(e.active, 3, 'e_forgiven: three targets still pay a STEADY');
    assert.equal(e.holdActive, 1, "e_held: only the non-review target can fire HELD's chain-hold");
    assert.equal(e.reviews, 3);
    // …and the idle one is the COLDEST, not the first
    assert.equal(ownDueReviewIndices(q).get('VOC'), 0);
    const shuffled = [q[2], q[1], q[0], q[3]];
    assert.equal(ownDueReviewIndices(shuffled).get('VOC'), 2, 'order in the queue does not decide it');
  });

  test('Σm_saved is the chain multiplier a hold is worth against a shadow continuation', () => {
    // twelve targets of one HELD make, all non-clean at rung 2 after a run of cleans: the hold at
    // chain ≥ 3 keeps the chain, the shadow resets it, and the difference is 0.2 per remaining target
    const q = Array.from({ length: 12 }, () => ({ skill: 'VOC', role: 'new', tier: 1 }));
    const r = simulateJob(q, { rng: mulberry32(11), m: () => 90, crewRank: () => HELD, bag: false });
    if (r.holds > 0) {
      assert.ok(r.mSaved > 0, 'a hold is worth something');
      assert.ok(r.mSaved <= r.holds * (q.length - 1) * (chainMult(8) - chainMult(0)), 'and is bounded by the cap');
    }
    // a bare crew can never hold, so it can never save anything
    const bare = simulateJob(q, { rng: mulberry32(11), m: () => 90, crewRank: () => BARE, bag: false });
    assert.equal(bare.holds, 0);
    assert.equal(bare.mSaved, 0);
  });
});

/* =========================================================================================
   11. crewValue — the shape of it (the alignment theorem is tests/job-align.test.mjs)
   ========================================================================================= */

describe('J4 · 11 · crewValue is a positive multiple of w·(1 − m/100), per shape', () => {
  test('DRHO_SLOPE is fitted from the shipped bands, not typed in', () => {
    let sxy = 0; let sxx = 0;
    for (const key of Object.keys(RUNG_BANDS)) {
      const x = 1 - Number(key) / 100;
      sxy += x * dRhoOf(key, STEADY); sxx += x * x;
    }
    close(DRHO_SLOPE, sxy / sxx, 1e-12, 'the fit reproduces');
    close(DRHO_SLOPE, 0.269, 0.002, 'and lands near 0.27 per unit of weakness');
    close(dRhoModel(40), DRHO_SLOPE * 0.60, 1e-12);
    close(dRhoModel(100), 0, 1e-12, 'a perfect make gets nothing from forgiveness');
    assert.ok(dRhoModel(0) > dRhoModel(50) && dRhoModel(50) > dRhoModel(85), 'strictly decreasing in m');
  });

  test('W_MEAN is Σw/19 and weightOf is data/skills.js verbatim', () => {
    close(W_MEAN, TOTAL_WEIGHT / 19, 1e-12);
    close(W_MEAN, 100 / 19, 1e-12);
    for (const id of MAKES) assert.equal(weightOf(id), skillById[id].w, id);
    assert.equal(weightOf('NOT-A-MAKE'), 0);
  });

  test('crewValue factorises exactly into (a constant of the shape) × w × (1 − m/100)', () => {
    const s = saveAt(12, 3);
    for (const id of MAKES) withSkill(s, id, { m: (SKILL_IDS.indexOf(id) * 5) % 100 });
    for (const shape of ['RUN', 'JOB', 'JOB12', 'VAULT']) {
      const p = matrixParamsFor(shape);
      const k = (p.lootMean * p.mBar * p.eForgiven * DRHO_SLOPE) / W_MEAN;
      for (const id of MAKES) {
        const d = crewValueDetail(s, id, shape);
        close(d.value, k * weightOf(id) * (1 - mOf(s, id) / 100), 1e-12, `${shape}/${id}`);
        close(d.value, k * d.score, 1e-12, `${shape}/${id} — score is the weakSpots key`);
        close(d.constant, k, 1e-12);
      }
    }
  });

  test('crewValue reads `rec.m`, the SAME field readiness.skillState puts in its score', () => {
    const s = saveAt(10, 0);
    withSkill(s, 'FAC2', { m: 40, n: 1 });               // n = 1: m_shown is 8, m is 40
    close(mOf(s, 'FAC2'), 40, 1e-12);
    close(mShown(s.skills.FAC2), 8, 1e-12);
    close(crewValueDetail(s, 'FAC2').score, skillById.FAC2.w * 0.6, 1e-12);
    assert.notEqual(mOf(s, 'FAC2'), mShownOfLocal(s, 'FAC2'), 'the two are genuinely different here');
    function mShownOfLocal(save, make) { return mShown(save?.skills?.[make]); }
  });

  test('an unknown make and an untested make both price at their honest value', () => {
    const s = saveAt(10, 0);
    assert.equal(crewValue(s, 'NOT-A-MAKE'), 0, 'a stranger is worth nothing');
    close(crewValue(s, 'VOC'), crewValueDetail(s, 'VOC').constant * skillById.VOC.w, 1e-12,
      'an untested make prices at m = 0 — maximum weakness, which is what it is');
    assert.ok(crewValue(s, 'CS-LIN') > crewValue(s, 'QUAD-CTX'), 'w 9 beats w 2 at equal m');
  });

  test('encountersFor WITHOUT a queue is the MODEL: e_forgiven(shape) × w / W̄, exactly', () => {
    // The model path, asserted at the bit. It is a model of a population and the test says so in its
    // title — r2 finding: on a real board this term is the step in `crewValue` that does not survive
    // `composePage`, and §14 measures how far off it is.
    const s = saveAt(10, 0);
    for (const shape of ['RUN', 'JOB', 'JOB12', 'VAULT']) {
      const e = matrixParamsFor(shape).eForgiven;
      for (const id of MAKES) close(encountersFor(s, id, shape), e * (weightOf(id) / W_MEAN), 1e-12, `${shape}/${id}`);
      close(mean(MAKES.map((id) => encountersFor(s, id, shape))), e, 1e-12, `${shape}: the mean make gets ē`);
    }
  });

  test('encountersFor WITH a queue is the MEASUREMENT: encountersIn(queue, make).active', () => {
    // r2 fix. The queue path is the supply the board actually deals, and it is an integer — it can
    // be 0, which the model can never be for a make with weight.
    const s = SAVES13[0];
    const q = PAGES13[0].queue;
    let sawZero = false; let sawPositive = false;
    for (const id of MAKES) {
      const measured = encountersFor(s, id, 'JOB', { queue: q });
      assert.equal(measured, encountersIn(q, id).active, `${id}: the queue path IS encountersIn().active`);
      assert.ok(Number.isInteger(measured), `${id}: a count of targets is an integer, not a rate`);
      if (measured === 0) sawZero = true; else sawPositive = true;
      if (measured === 0) {
        assert.ok(encountersFor(s, id, 'JOB') > 0,
          `${id}: the MODEL pays this make ${encountersFor(s, id, 'JOB').toFixed(2)} encounters while the board serves it none`);
      }
    }
    assert.ok(sawZero && sawPositive, 'a real page serves some makes and not others — that is the whole finding');
    // an unknown make is still 0 on both paths, and a missing queue still falls back to the model
    assert.equal(encountersFor(s, 'NOT-A-MAKE', 'JOB', { queue: q }), 0);
    close(encountersFor(s, 'VOC', 'JOB', { queue: null }), encountersFor(s, 'VOC', 'JOB'), 1e-12);
  });

  test('crewOrder is descending by value with the data/skills.js table order as the tie-break', () => {
    const s = saveAt(10, 0);
    for (const id of MAKES) withSkill(s, id, { m: 50 });     // every make equally weak
    const order = crewOrder(s);
    assert.equal(order.length, 19);
    // ties → table order; within equal m the order is by w desc, then table order
    for (let i = 1; i < order.length; i++) {
      const a = crewValue(s, order[i - 1]); const b = crewValue(s, order[i]);
      assert.ok(a >= b - 1e-12, `${order[i - 1]} ≥ ${order[i]}`);
      if (Math.abs(a - b) < 1e-12) assert.ok(MAKES.indexOf(order[i - 1]) < MAKES.indexOf(order[i]), 'tie → table order');
    }
    assert.equal(order[0], 'CS-LIN', 'w 9 leads a board of equally weak makes');
  });
});

/* =========================================================================================
   12. DOM-free, and the study layer untouched
   ========================================================================================= */

describe('J4 · 12 · crew.js is DOM-free, pure, and writes nothing outside save.game.crew', () => {
  test('the module imports cleanly in plain node with no DOM shim (this file IS the proof)', () => {
    assert.equal(typeof capacityFor, 'function');
    assert.equal(typeof globalThis.document, 'undefined');
    assert.equal(typeof globalThis.window, 'undefined');
  });

  test('no function in the module writes to xp, skills, cards, errors or counters', () => {
    const s = allMastered(15, 7);
    s.cards['def-01'] = { cleared: true, bucket: 3, due: NOW, attempts: 1 };
    s.errors = { 'dropped-gcf': { n: 2 } };
    s.counters = { pages: 4 };
    const before = JSON.stringify({ xp: s.xp, skills: s.skills, cards: s.cards, errors: s.errors, counters: s.counters, trophies: s.trophies });

    const target = { skill: 'FAC2', role: 'review' };
    capacityFor(s); mannedMaxFor(s); crewOf(s); budgetFor(s); canHold(s, 'FAC2');
    canAllocate(s, 'FAC2', HELD); forgivenessOf(s, 'FAC2', target); isIdleFor(s, 'FAC2', target);
    crewFor(s, 'FAC2', target); holdsChain(s, 'FAC2', { chain: 4, rung: 2, target });
    chainAfterFor(s, 'FAC2', 2, 4, target); crewValue(s, 'FAC2'); crewValueDetail(s, 'FAC2');
    crewOrder(s); legalize(s); encountersFor(s, 'FAC2');
    const r = allocate(s, 'FAC2', HELD);

    assert.equal(JSON.stringify({ xp: s.xp, skills: s.skills, cards: s.cards, errors: s.errors, counters: s.counters, trophies: s.trophies }), before);
    // and the ONE thing allocate writes is game.crew, on a NEW object
    assert.deepEqual(Object.keys(r.save.game).filter((k) => k !== 'crew'), Object.keys(s.game ?? {}).filter((k) => k !== 'crew'));
  });

  test('withCrew keeps every other game key a later ticket put there', () => {
    const s = saveAt(10, 0);
    s.game = { crew: {}, tags: { 'dropped-gcf': { resolved: 1 } }, backchecks: { held: 2 }, log: [1, 2] };
    const out = withCrew(s, { VOC: STEADY });
    assert.deepEqual(out.game.tags, s.game.tags);
    assert.deepEqual(out.game.backchecks, s.game.backchecks);
    assert.deepEqual(out.game.log, s.game.log);
    assert.deepEqual(out.game.crew, { VOC: STEADY });
    assert.notEqual(out.game, s.game);
  });

  test('a save with no `game` key at all is read and written without throwing', () => {
    const s = saveAt(10, 0);
    delete s.game;
    assert.deepEqual(crewOf(s), {});
    assert.equal(rankOf(s, 'VOC'), BARE);
    assert.equal(forgivenessOf(s, 'VOC'), BARE);
    const r = allocate(s, 'VOC', STEADY);
    assert.equal(r.ok, true);
    assert.deepEqual(crewOf(r.save), { VOC: STEADY });
    assert.equal(crewOf(null) && Object.keys(crewOf(null)).length, 0);
    assert.equal(capacityFor(null), 8, 'a null save is a level-1 save');
    assert.equal(capacityFor(undefined), 8);
  });
});

/* =========================================================================================
   13. THE ROUND-1 FIX PASS — the three claims this file used to make and could not keep
   ========================================================================================= */

describe('J4 · 13 · r1: the true band payoff, anti-tanking, and the lapsed HELD', () => {
  /* ---- MAJOR: "the linearised Δρ̂ reorders makes against the real shipped-band payoff" ---- */

  test('Δρ is FLAT below m = 40 — the whole weak-spot range — and the model is not', () => {
    // `bandFor` clamps at the lowest shipped band, so the game's real forgiveness payoff stops
    // depending on m at all below 40. `crewValue` keeps rising to m = 0. That is the disagreement.
    for (const m of [0, 5, 17, 25, 39, 40]) close(dRhoTrue(m), dRhoOf(40, STEADY), 1e-12, `Δρ_true(${m})`);
    close(dRhoTrue(40), 0.1635, 1e-9, 'the m40 band');
    assert.ok(dRhoModel(0) / dRhoTrue(0) > 1.6, `the model reads ${dRhoModel(0).toFixed(4)} where the game pays ${dRhoTrue(0).toFixed(4)}`);
    close(dRhoModelError(0), 0.646, 0.01, '+65 % at m = 0');
    close(dRhoModelError(85), 0.242, 0.01, '+24 % at m = 85 — exactly where HELD\'s gate sits');
    // and where it IS right: the two bands the fit passes closest to
    assert.ok(Math.abs(dRhoModelError(60)) < 0.01 && Math.abs(dRhoModelError(40)) < 0.02);
  });

  test('the fit is CONVEX on the shipped range, not "mildly concave" — the docstring was backwards', () => {
    // chord slope y/x at the three shipped bands, x = 1 − m/100. A concave function through the
    // origin has y/x DECREASING in x; these RISE with x, so the curve is convex there (and flat
    // below m = 40, which makes the whole domain S-shaped).
    const chord = (band) => dRhoOf(band, STEADY) / (1 - band / 100);
    close(chord(40), 0.2725, 1e-9); close(chord(60), 0.26875, 1e-9); close(chord(85), 0.2166667, 1e-6);
    assert.ok(chord(40) > chord(60) && chord(60) > chord(85), 'y/x rises with x: convex, not concave');
    close(DRHO_SLOPE, 0.269078341, 1e-9, 'the least-squares fit through the origin');
  });

  test('steadyValueTrue is the payoff the game pays, and it orders makes differently', () => {
    // below m = 40 the true payoff is w × a constant, so it orders by TEST WEIGHT alone
    const s = saveAt(12, 0);
    for (const id of MAKES) withSkill(s, id, { m: 20, n: 5 });
    const byTrue = MAKES.slice().sort((a, b) => steadyValueTrue(s, b) - steadyValueTrue(s, a));
    const byWeight = MAKES.slice().sort((a, b) => weightOf(b) - weightOf(a));
    assert.equal(weightOf(byTrue[0]), weightOf(byWeight[0]), 'the heaviest make wins the true payoff');
    // a worked inversion: a light very-weak make outranks a heavy weak one in crewValue but not in truth
    const light = MAKES.find((id) => weightOf(id) <= 5) ?? MAKES[0];
    const heavy = MAKES.slice().sort((a, b) => weightOf(b) - weightOf(a))[0];
    const s2 = saveAt(12, 0);
    withSkill(s2, light, { m: 5, n: 5 });
    withSkill(s2, heavy, { m: 35, n: 5 });
    if (weightOf(light) * 0.95 > weightOf(heavy) * 0.65) {
      assert.ok(crewValue(s2, light) > crewValue(s2, heavy), 'the model prefers the weaker, lighter make');
      assert.ok(steadyValueTrue(s2, heavy) > steadyValueTrue(s2, light), 'the game pays the heavier one more');
    }
    for (const id of MAKES) assert.ok(steadyValueTrue(s, id) >= 0, `${id}: never negative`);
  });

  /* ---- MAJOR: G3.7 #8's start-of-day snapshot, which does not exist ---- */

  test('ANTI-TANKING without a snapshot: no `(1 − m)` term in this layer reaches a payout', () => {
    // G3.7 #8 promises "any (1 − m) term in the layer reads the start-of-day snapshot of m_shown, so
    // today's tanking cannot pay today". There is no mastery snapshot anywhere under site/js/job —
    // and the guarantee does not need one. The ladder's only crew input is `forgivenessOf`, which
    // reads the RANK; the rank's only m-dependence is `canHold`, which can only ever REMOVE HELD.
    const target = { id: 'voc-05', skill: 'VOC', skills: ['VOC'], role: 'new', tier: 1 };
    for (const rank of [BARE, STEADY, HELD]) {
      let s = allMastered(15, 7);
      if (rank > BARE) s = allocate(s, 'VOC', rank).save;
      for (const drop of [10, 20, 40, 90]) {
        const t = tankingCheck(s, 'VOC', { drop, target });
        assert.equal(t.payoutRose, false, `rank ${rank}, −${drop} m: tanking never raises the payout`);
        assert.ok(t.forgivenessAfter <= t.forgivenessBefore, 'it can only take forgiveness away');
      }
    }
    // a HELD make tanked out of its gate loses two rungs of forgiveness the same day
    let held = allocate(allMastered(15, 7), 'VOC', HELD).save;
    const tanked = tankingCheck(held, 'VOC', { drop: 40, target });
    assert.equal(tanked.forgivenessBefore, HELD);
    assert.equal(tanked.forgivenessAfter, STEADY, 'the gate drops it to STEADY immediately — G4');
    // the ONE thing that does rise is the advisory ORDERING, which pays nothing
    assert.equal(tanked.orderRose, true, 'crewValue rises — and crewValue is a recommendation, not a payout');
  });

  test('the ONLY m-dependent crew term that touches a payout is canHold, and it is one-directional', () => {
    let s = allMastered(15, 7);
    s = allocate(s, 'FAC2', HELD).save;
    const target = { id: 'fac-05', skill: 'FAC2', skills: ['FAC2'], role: 'new', tier: 1 };
    assert.equal(forgivenessOf(s, 'FAC2', target), HELD);
    // raise m: nothing changes (already mastered) — so there is nothing to farm by raising it either
    const up = { ...s, skills: { ...s.skills, FAC2: { ...s.skills.FAC2, m: 100 } } };
    assert.equal(forgivenessOf(up, 'FAC2', target), HELD, 'the payout is flat in m above the gate');
    // and below the gate it is flat again, one rung lower
    const down = { ...s, skills: { ...s.skills, FAC2: { ...s.skills.FAC2, m: 40 } } };
    const down2 = { ...s, skills: { ...s.skills, FAC2: { ...s.skills.FAC2, m: 5 } } };
    assert.equal(forgivenessOf(down, 'FAC2', target), STEADY);
    assert.equal(forgivenessOf(down2, 'FAC2', target), STEADY, 'flat below the gate too: no gradient to farm');
  });

  /* ---- MAJOR: legalize() had no caller, so a lapsed HELD spent 2 points for 1 point of value ---- */

  test('a lapsed HELD is VISIBLE in the budget: `lapsed`, `wasted`, `effectiveSpent`', () => {
    let s = allMastered(15, 7);
    s = allocate(s, 'FAC2', HELD).save;
    s = allocate(s, 'VOC', HELD).save;
    s = allocate(s, 'NOTE', STEADY).save;
    assert.deepEqual(budgetFor(s).lapsed, [], 'nothing lapsed yet');
    assert.equal(budgetFor(s).wasted, 0);
    assert.equal(budgetFor(s).spent, 5);
    // the Mock knocks FAC2 down to 69 (mastery.mockMiss) — G4
    const missed = { ...s, skills: { ...s.skills, FAC2: { ...s.skills.FAC2, m: 69 } } };
    const b = budgetFor(missed);
    assert.deepEqual(b.lapsed, ['FAC2']);
    assert.equal(b.wasted, 1, 'two points bought, one point of value delivered');
    assert.equal(b.spent, 5, 'the save still COSTS five');
    assert.equal(b.effectiveSpent, 4, '…and pays for four');
    assert.equal(effectiveRankOf(missed, 'FAC2'), STEADY, 'the ladder already refuses to pay it');
  });

  test('crewDemotions is G4\'s debrief line as data, and legalize agrees with it exactly', () => {
    let s = allMastered(15, 7);
    s = allocate(s, 'FAC2', HELD).save;
    s = allocate(s, 'CS-LIN', HELD).save;
    const missed = {
      ...s,
      skills: { ...s.skills, FAC2: { ...s.skills.FAC2, m: 69 }, 'CS-LIN': { ...s.skills['CS-LIN'], m: 69 } },
    };
    const d = crewDemotions(missed);
    assert.deepEqual(d.map((x) => x.make), ['CS-LIN', 'FAC2'].sort((a, b) => MAKES.indexOf(a) - MAKES.indexOf(b)));
    for (const x of d) {
      assert.deepEqual(
        { from: x.from, to: x.to, reason: x.reason, fromName: x.fromName, toName: x.toName },
        { from: HELD, to: STEADY, reason: REFUSALS.NOT_MASTERED, fromName: 'HELD', toName: 'STEADY' },
      );
    }
    // and the repair path reports the same set, with the same reason
    const fixed = legalize(missed);
    const demoted = fixed.changes.filter((c) => c.reason === REFUSALS.NOT_MASTERED);
    assert.deepEqual(demoted.map((c) => c.make).sort(), d.map((x) => x.make).sort());
    assert.deepEqual(lapsedMakes(fixed.save), [], 'after legalize nothing is lapsed');
    assert.equal(budgetFor(fixed.save).wasted, 0, 'and the two points are back in the budget');
    assert.deepEqual(crewDemotions(fixed.save), [], 'idempotent');
    // a save with nothing wrong produces nothing to print
    assert.deepEqual(crewDemotions(s), []);
  });
});

/* =========================================================================================
   13. THE ARGMAX, MEASURED ON THE PATH THE GAME ACTUALLY USES
        (ticket fix:tests r1, finding 11 — the ρ = 1 / argmax objection)
   =========================================================================================

   THE OBJECTION, and what is and is not true about it.

   §8's `THE ARGMAX` test asserts `bestRankFor('JOB') === 'HELD'` and then
   `row.winner === row.params.published.winner` for every row. Both sides of that read
   `matrixParamsFor(id)`, which returns `CREW_MATRIX.rows` — the published constants. It is the
   DOCUMENT read back through its own numbers, and on its own it could not fail. That much of the
   round-1 finding is right.

   What the finding gets wrong is "the acceptance test that should catch it computes the matrix from
   the published constants": §9 already runs the same two formulas over the MEASURED parameters, and
   already asserts that HELD loses on all four shapes —

       $ node --test tests/job-crew.test.mjs 2>&1 | grep 'flip structure'
         ✔ the flip structure is what the measurement CAN and CANNOT confirm, stated numerically

   — so the suite was not claiming the flip survives measurement. What was missing is the path: §9
   measures off `shapeQueue(shape, PAGES[k])`, a stride sample of the FLAT `composePage` queue,
   while a job is played on `composeBundles` → `draftUnion`. This section closes that, and adds the
   one correction that materially changes the numbers:

   It also forecloses the obvious objection to the measurement. `crew.js`'s own r1 fix says the idle
   rule is `isIdleFor` — the make's OWN due review, one target — and not `isDueReview`, every review
   of the make; but `simulateJob` and `encountersIn` were not moved with it and still read the broad
   term. §13 therefore measures under `ownDueReviewIndices` (what `isIdleFor` ships) AND compares the
   two rules pair by pair on the same queues. Measured: they give the SAME active count on 2 280 of
   2 280 (make, board) pairs across all four shapes, because `spreadSkills` and the criticals-first
   partition never put two due reviews of one make in one job. So the harness's broader term is
   harmless HERE — the low `e_held` is not an artefact of it — while remaining wrong in principle,
   which is a note for the crew lane rather than a number that changes below.

   The conclusion: measured on the real path under the real idle rule, e_held is 3–6× below G2's
   published figure and **STEADY wins every shape**. G2's "two flips, no dominant build" is false as
   measured, and by G2's own rule ("If a measured parameter moves the winner of a row, the row in
   this document is wrong and the ticket updates it") the table — or the mechanic — is what has to
   change. This suite's job is to say so in a number that cannot be read back off the document. */

describe('J4 · 13 · the 4×2 matrix measured off composeBundles → draftUnion, under G2\'s real idle rule', () => {
  test('the measurement really is on the drafted path: every row is a composeBundles → draftUnion queue', () => {
    for (const id of SHAPE_ROWS) {
      assert.ok(M13[id].boards >= 25, `${id}: only ${M13[id].boards} boards posted a draftable contract set`);
      close(M13[id].len, SHAPES[id].targets, 1.5, `${id}: the drafted union is ~${SHAPES[id].targets} targets`);
    }
  });

  test('the two idle rules COINCIDE on a drafted union — the low e_held is not a harness artefact', () => {
    // `encountersIn` counts every due review as idle (`isDueReview`); G2's rule, which `isIdleFor`
    // ships, idles only the make's OWN due review. The broad term can only ever count FEWER active
    // targets, so if the two ever disagreed the measurement below would be pessimistic. They do not:
    // `spreadSkills` and the criticals-first partition never put two due reviews of one make in one
    // job, so on the drafted union the rules agree pair for pair. The objection is closed by
    // measurement rather than by argument — and `idleShare` proves the queues really are review-heavy,
    // which is what makes the agreement a finding rather than an empty comparison.
    let diverged = 0; let pairs = 0; let broadTotal = 0; let shippedTotal = 0; const idleShare = [];
    for (const shape of SHAPE_ROWS) {
      for (const k of (HOLDERS.length ? HOLDERS : LIVE13)) {
        const q = draftedQueue(k, shape);
        if (!q) continue;
        idleShare.push(q.filter(isDueReview).length / q.length);
        for (const m of MAKES) {
          const a = encountersIn(q, m).active;     // isDueReview: every review is idle
          const b = activeFor(q, m);               // isIdleFor: only the make's own due review
          assert.ok(b >= a, `${m}: the shipped rule cannot count FEWER active targets than the broad one`);
          if (b > a) diverged++;
          pairs++; broadTotal += a; shippedTotal += b;
        }
      }
    }
    assert.ok(pairs > 1500, `${pairs} (make, board) pairs compared`);
    assert.ok(mean(idleShare) > 0.5,
      `only ${(mean(idleShare) * 100).toFixed(0)} % of a drafted job is a due review — the comparison has nothing to bite on`);
    assert.equal(diverged, 0,
      `${diverged} of ${pairs} pairs diverge: a make now carries two due reviews in one job, so \`encountersIn\`'s `
      + '`isDueReview` term (crew.js:706, :734) has started to matter and the crew lane must move it to `isIdleFor`');
    assert.equal(shippedTotal, broadTotal, 'and therefore the two totals are the same number');
  });

  test('THE ARGMAX, MEASURED: STEADY wins every shape — G2\'s flip structure does not survive', () => {
    // NOT `bestRankFor(id)`, which reads CREW_MATRIX back to itself. `rowFor` prices the same two
    // formulas with the parameters measured above, on the queue the game is played on.
    for (const id of SHAPE_ROWS) {
      assert.equal(rowFor(id).winner, 'STEADY',
        `${id}: measured S ${rowFor(id).steady.toFixed(2)} / H ${rowFor(id).held.toFixed(2)}`);
    }
    // RUN agrees with the document; the other three do not, and that is the finding
    assert.equal(CREW_MATRIX.rows.find((r) => r.shape === 'RUN').winner, 'STEADY', 'the RUN row survives');
    for (const id of ['JOB', 'JOB12', 'VAULT']) {
      assert.equal(CREW_MATRIX.rows.find((r) => r.shape === id).winner, 'HELD',
        `${id} is published as a HELD row`);
      assert.notEqual(rowFor(id).winner, CREW_MATRIX.rows.find((r) => r.shape === id).winner,
        `${id}: the measured winner and the published winner AGREE — if that is now true, G2's table has been `
        + 'repriced and this test should be replaced by a plain argmax assertion');
    }
    // and HELD is not close: it is dominated by an order of magnitude on every shape
    for (const id of SHAPE_ROWS) {
      const r = rowFor(id);
      assert.ok(r.steady > r.held * 4,
        `${id}: STEADY ${r.steady.toFixed(2)} is only ${(r.steady / r.held).toFixed(1)}× HELD ${r.held.toFixed(2)}`);
    }
  });

  test('WHY: `e_held` is unreachable — HELD is gated on mastery, and mastered makes are under-served', () => {
    for (const id of SHAPE_ROWS) {
      const m = M13[id];
      assert.ok(m.eHeld < m.published.eHeld * 0.5,
        `${id}: measured e_held ${m.eHeld.toFixed(3)} against a published ${m.published.eHeld}`);
      assert.ok(m.eHeld < m.eForgiven,
        `${id}: the best HELD-eligible make is served LESS than the best make overall (${m.eHeld.toFixed(3)} < ${m.eForgiven.toFixed(3)})`);
    }
    // the sensitivity, on the shape the game leads with: how much supply HELD would need
    let need = 0;
    for (let e = 0.1; e < 20; e += 0.05) {
      if (buildRowFor('JOB', { mBar: M13.JOB.mBar, eForgiven: M13.JOB.eForgiven, eHeld: e, pChain3: M13.JOB.pChain3, mSaved: M13.JOB.mSaved }).winner === 'HELD') { need = e; break; }
    }
    assert.ok(need > M13.JOB.eHeld,
      `HELD needs e_held ≥ ${need.toFixed(2)} on a JOB-10; the drafted union supplies ${M13.JOB.eHeld.toFixed(2)}`);
    assert.ok(need > 0, 'and there IS a supply at which HELD wins — the mechanic is repriceable, not dead');
  });

  test('the measurement is deterministic and seeded: no Math.random anywhere in it', () => {
    const again = measure13('JOB');
    assert.equal(again.eForgiven, M13.JOB.eForgiven);
    assert.equal(again.eHeld, M13.JOB.eHeld);
    assert.equal(again.mBar, M13.JOB.mBar);
    assert.equal(again.pChain3, M13.JOB.pChain3);
  });
});

/* =========================================================================================
   14. THE ROUND-2 FIX PASS — supply, the band floor, and the theorem's real domain
   =========================================================================================

   Three r2 findings, all of them about the same thing: `crewValue` is an ORDERING and the layer was
   quoting it as a PRICE.

   · **Supply.** `crewValue`'s middle factor models `encounters_i ∝ w_i`. On a drafted queue supply
     is lumpy and mostly zero, so the make the study plan puts first is frequently served no
     forgivable target at all and a point on it pays exactly nothing. Measured below, on the real
     `composeBundles` → `draftUnion` path, with the shipped idle rule.
   · **The band floor.** `bandFor` clamps at the lowest published band (m 40), so the TRUE `Δρ` is
     one number across the entire weak-spot range and the true payoff there orders makes by test
     weight alone. `BAND_FLOOR` / `isBandFloored` name the clamp; the repair is a fourth band in
     `data/job.js` (notes/crew-fix.md R5) and this lane does not own that file.
   · **The domain.** `alignmentFor().holds` has always been ONE of the theorem's conditions.
     `domain` carries the rest — evidence, supply, and (r3) the band floor — so the sentence
     COMPOSED-GAME.md publishes unrestricted can be checked rather than believed
     (notes/crew-fix.md R2, still unapplied after three rounds). §15 adds the fourth condition and
     the hand-built counterexample that lives inside the only restriction the paragraph carries. */

describe('J4 · 14 · r2: a crew point priced against the supply the board actually deals', () => {
  /** Every seeded save that posts a draftable board, drafted as a JOB-10 — the path a job is
   *  played on. The whole §13 population, not §13's HELD-capable subset: supply is a property of
   *  the composer, not of whether the student happens to have three mastered makes. */
  const BOARDS = [];
  for (let k = 0; k < SAVES13.length; k++) {
    const q = draftedQueue(k, 'JOB');
    if (q) BOARDS.push({ save: SAVES13[k], queue: q });
  }

  test('the population is real drafted jobs, not a synthetic queue', () => {
    assert.ok(BOARDS.length >= 100, `${BOARDS.length} drafted JOB boards`);
    for (const b of BOARDS) assert.ok(b.queue.length >= 8, 'a JOB-10 union is ~10 targets');
  });

  test('steadyValueOn is steadyValueTrue with the ONE modelled term replaced by the measurement', () => {
    const { save, queue } = BOARDS[0];
    for (const id of MAKES) {
      const p = matrixParamsFor('JOB');
      const e = encountersIn(queue, id).active;
      close(steadyValueOn(save, id, queue),
        dRhoTrue(mOf(save, id), STEADY) * p.lootMean * p.mBar * e / COSTS.STEADY, 1e-12, id);
      // and with no queue it degenerates to the population model, exactly
      close(steadyValueOn(save, id, null), steadyValueTrue(save, id), 1e-12, `${id} (no queue)`);
    }
  });

  test('a gap against supply is only defined against a queue — no queue is the EMPTY board', () => {
    // `steadyValueOn(save, make, null)` deliberately falls back to the population model, so the two
    // supply-aware aggregates must NOT: a `studyPays` above zero beside a `studySupply` of zero is
    // the exact confusion this whole section exists to remove.
    const { save } = BOARDS[0];
    for (const q of [null, undefined, 'not-a-queue', 42]) {
      const gap = supplyGapFor(save, q);
      assert.equal(gap.studySupply, 0, 'no board serves nothing');
      assert.equal(gap.studyPays, 0, 'and therefore pays nothing');
      assert.equal(gap.zeroPay, true);
      assert.equal(gap.gameValue, 0, 'no make pays on an empty board');
      assert.equal(crewOrderOn(save, q).length, MAKES.length, 'the ordering is still total');
    }
  });

  test('THE FINDING: the study plan\'s first make is served NOTHING on a large share of boards', () => {
    // r2 BLOCKER, measured here rather than argued. `crewOrder` IS `readiness.weakSpots()`'s order
    // (ρ = 1, an identity — tests/job-align.test.mjs §1), so `supplyGapFor().studyTop` is the make
    // Home prints first under Weak spots.
    let zero = 0; let agrees = 0; const hist = {};
    for (const { save, queue } of BOARDS) {
      const gap = supplyGapFor(save, queue);
      assert.equal(gap.studyTop, crewOrder(save)[0], 'studyTop IS the study ordering\'s first make');
      assert.equal(gap.zeroPay, gap.studyPays === 0);
      if (gap.studySupply === 0) assert.equal(gap.studyPays, 0, 'no forgivable target → the point pays nothing');
      if (gap.zeroPay) zero++;
      if (gap.agrees) agrees++;
      hist[gap.studySupply] = (hist[gap.studySupply] ?? 0) + 1;
    }
    const zeroShare = zero / BOARDS.length;
    const agreeShare = agrees / BOARDS.length;
    if (process.env.J4_PRINT) {
      console.log(`r2 supply | boards ${BOARDS.length} | study #1 pays ZERO ${zero} (${(zeroShare * 100).toFixed(0)} %)`
        + ` | study #1 == best-paying make ${agrees} (${(agreeShare * 100).toFixed(0)} %)`
        + ` | forgivable-target histogram ${JSON.stringify(hist)}`);
    }
    // A bound in the direction the measurement went, not a tolerance around a wish. It fails if the
    // supply is ever repaired (notes/crew-fix.md R4) — at which point G3.8 row 2 can drop its caveat.
    assert.ok(zeroShare >= 0.40,
      `only ${(zeroShare * 100).toFixed(0)} % of boards pay the study plan's first make nothing — if that is now `
      + 'small, composeBundles has been repaired and COMPOSED-GAME.md G3.8 row 2 should be re-read');
    assert.ok(agreeShare <= 0.35,
      `the game's best-paying make is the study plan's first on ${(agreeShare * 100).toFixed(0)} % of boards`);
    assert.ok(agreeShare > 0, 'and it is not zero either — the two orderings are related, just not equal');
  });

  test('crewOrderOn and crewOrder are DIFFERENT orderings on a real board', () => {
    let differ = 0;
    for (const { save, queue } of BOARDS) {
      const onBoard = [...new Set(queue.map(makeOf).filter(Boolean))];
      const study = crewOrder(save, { of: onBoard });
      const paid = crewOrderOn(save, queue, { of: onBoard });
      assert.deepEqual([...paid].sort(), [...study].sort(), 'same makes, different order');
      if (study[0] !== paid[0]) differ++;
    }
    assert.ok(differ > 0,
      'if the study ordering and the paid ordering now lead with the same make on every board, the supply '
      + 'model has become true and `crewValue` may be quoted as a price again');
  });

  test('heldValueOn prices the chain-hold off holdActive, and is 0 without the gate', () => {
    for (const { save, queue } of BOARDS.slice(0, 8)) {
      for (const id of MAKES) {
        const v = heldValueOn(save, id, queue);
        if (!canHold(save, id)) { assert.equal(v, 0, `${id}: no gate, no price`); continue; }
        const p = matrixParamsFor('JOB');
        close(v, heldPerPoint({ ...p, eHeld: encountersIn(queue, id).holdActive }), 1e-12, id);
      }
    }
  });
});

describe('J4 · 14 · r2: the band floor — Δρ is ONE number across the whole weak-spot range', () => {
  test('BAND_FLOOR is the lowest published band, and dRhoTrue is flat at or below it', () => {
    assert.equal(BAND_FLOOR, Math.min(...Object.keys(RUNG_BANDS).map(Number)));
    assert.equal(BAND_FLOOR, 40, 'data/job.js publishes bands at 85 / 60 / 40 and nothing under 40');
    const floor = dRhoTrue(BAND_FLOOR, STEADY);
    for (let m = 0; m <= BAND_FLOOR; m++) {
      assert.equal(dRhoTrue(m, STEADY), floor, `dRhoTrue(${m}) is the m40 value`);
      assert.equal(isBandFloored(m), true);
      assert.deepEqual(bandFor(m), RUNG_BANDS[BAND_FLOOR], `band(${m})`);
    }
    assert.equal(isBandFloored(BAND_FLOOR + 1), false);
    assert.ok(dRhoTrue(BAND_FLOOR + 1, STEADY) < floor, 'and it falls immediately above the floor');
    // the model does NOT flatten there — that is the whole of the disagreement
    assert.ok(dRhoModel(0) > dRhoModel(BAND_FLOOR) * 1.5, 'Δρ̂ keeps rising below the floor');
  });

  test('below the floor the TRUE payoff orders makes by test weight alone', () => {
    // Two makes both inside the flat tail: the true payoff cannot tell them apart by m, so the one
    // with more test weight wins even when it is the stronger make. That is the counterexample to
    // G3.8 row 2's proportionality `Δρ(m) ∝ (1 − m/100)` across the range the tool is for.
    const s = saveAt(12, 3);
    for (const id of MAKES) withSkill(s, id, { m: 60 });
    const byW = [...MAKES].sort((a, b) => weightOf(b) - weightOf(a));
    const heavy = byW[0]; const light = byW.find((id) => weightOf(id) < weightOf(heavy));
    withSkill(s, heavy, { m: BAND_FLOOR });        // the stronger make, still in the tail
    withSkill(s, light, { m: 0 });                 // the weaker make, maximum weakness
    assert.ok(crewValue(s, light) > crewValue(s, heavy) || weightOf(light) * 1 < weightOf(heavy) * 0.6,
      'the study key prefers the weaker make unless the weight gap swamps it');
    assert.equal(dRhoTrue(mOf(s, heavy), STEADY), dRhoTrue(mOf(s, light), STEADY),
      'but the TRUE Δρ is identical on both — both clamp to the m40 band');
    assert.ok(steadyValueTrue(s, heavy) > steadyValueTrue(s, light),
      `so the true payoff picks ${heavy} (w ${weightOf(heavy)}, m ${BAND_FLOOR}) over ${light} (w ${weightOf(light)}, m 0)`);
  });

  test('MEASURED: the two orderings pick a different top make on a large share of seeded saves', () => {
    let differ = 0; const N = 300;
    for (let i = 0; i < N; i++) {
      const s = randomSave(i);
      const model = [...MAKES].sort((a, b) => crewValue(s, b) - crewValue(s, a))[0];
      const truth = [...MAKES].sort((a, b) => steadyValueTrue(s, b) - steadyValueTrue(s, a))[0];
      if (model !== truth) differ++;
    }
    const share = differ / N;
    if (process.env.J4_PRINT) console.log(`r2 band floor | model-top != true-top on ${differ}/${N} = ${(share * 100).toFixed(1)} %`);
    assert.ok(share > 0.20,
      `${(share * 100).toFixed(1)} % — if this has become small, data/job.js has grown a band below 40 `
      + '(notes/crew-fix.md R5) and COMPOSED-GAME.md G2\'s distribution table needs the fourth row');
  });
});

describe('J4 · 14 · r2: alignmentFor carries the theorem\'s conditions, not one', () => {
  test('domain.rank is `holds`, and the r1 shape of the return value is unchanged', () => {
    const s = allMastered(15, 7);
    const a = alignmentFor(s);
    assert.equal(a.domain.rank, a.holds);
    assert.ok(a.steady && a.held, 'a fully mastered save can buy both rungs');
    assert.equal(typeof a.threshold, 'number');
    assert.equal(typeof a.margin, 'number');
  });

  test('domain.evidence is false while any candidate is under mastery.N_FULL evidence', () => {
    const s = saveAt(12, 2);
    for (const id of MAKES) withSkill(s, id, { m: 50, n: 5 });
    assert.equal(alignmentFor(s).domain.evidence, true, 'every make at n = 5');
    assert.deepEqual(alignmentFor(s).thinEvidence, []);
    withSkill(s, 'VOC', { m: 50, n: 1 });
    const a = alignmentFor(s);
    assert.equal(a.domain.evidence, false, 'one thin-evidence make is enough to leave the domain');
    assert.deepEqual(a.thinEvidence, ['VOC']);
    assert.equal(a.evidenceFloor, 5, 'the floor is mastery.N_FULL, not a second copy of the number');
    // and restricting the candidate set puts the save back inside it
    assert.equal(alignmentFor(s, { of: MAKES.filter((m) => m !== 'VOC') }).domain.evidence, true);
  });

  test('domain.supply is null without a queue and the board\'s own answer with one', () => {
    const { save, queue } = { save: SAVES13[HOLDERS[0] ?? LIVE13[0]], queue: draftedQueue(HOLDERS[0] ?? LIVE13[0], 'JOB') };
    assert.equal(alignmentFor(save).domain.supply, null, 'supply is not knowable from the save alone');
    assert.equal(alignmentFor(save).gap, null);
    const a = alignmentFor(save, { queue });
    assert.equal(a.domain.supply, a.gap.agrees);
    assert.equal(a.gap.studyTop, crewOrder(save)[0]);
  });

  test('MEASURED: off the evidence domain the two argmaxes disagree on most saves, not a few', () => {
    // The r1 docstring estimated "≈ 50 %"; measured over this suite's own 1 000-save population it
    // is far worse, and the number is pinned here so the estimate cannot drift back into prose.
    let disagree = 0; const N = 300;
    for (let i = 0; i < N; i++) {
      const s = randomSave(i);
      const game = [...MAKES].sort((a, b) => crewValue(s, b) - crewValue(s, a))[0];
      const study = [...MAKES].sort((a, b) => readinessGradient(s, b) - readinessGradient(s, a))[0];
      if (game !== study) disagree++;
    }
    const rate = disagree / N;
    if (process.env.J4_PRINT) console.log(`r2 evidence | crewValue vs readinessGradient argmax disagree ${disagree}/${N} = ${(rate * 100).toFixed(1)} %`);
    assert.ok(rate > 0.50,
      `${(rate * 100).toFixed(1)} % — COMPOSED-GAME.md still publishes "there is no step in the min-maxer's `
      + 'list that is not also the best available study action" with no evidence-depth domain at all');
  });

  test('domain.all is the conjunction, and an unknown supply is not counted as a failure', () => {
    const s = saveAt(12, 2);
    for (const id of MAKES) withSkill(s, id, { m: 50, n: 5 });
    const a = alignmentFor(s);
    assert.equal(a.domain.supply, null);
    assert.equal(a.domain.all, a.domain.evidence && a.domain.rank && a.domain.band, 'unknown ≠ false');
    withSkill(s, 'VOC', { m: 50, n: 2 });
    assert.equal(alignmentFor(s).domain.all, false, 'thin evidence alone takes the save out of the domain');
    // and on the boards, all three conditions together are met on strictly fewer saves than `holds`
    let holdsOnly = 0; let allThree = 0;
    for (const k of (HOLDERS.length ? HOLDERS : LIVE13)) {
      const q = draftedQueue(k, 'JOB');
      if (!q) continue;
      const r = alignmentFor(SAVES13[k], { queue: q });
      if (r.holds) holdsOnly++;
      if (r.domain.all) allThree++;
    }
    assert.ok(allThree <= holdsOnly, 'the restricted domain cannot be larger than the rank condition alone');
    assert.ok(allThree < holdsOnly,
      `the unrestricted theorem holds on ${holdsOnly} boards by the rank test and on ${allThree} once evidence `
      + 'and supply are included — COMPOSED-GAME.md:552 still publishes it with no domain at all '
      + '(notes/crew-fix.md R2, unapplied)');
  });
});

/* =========================================================================================
   15. THE ROUND-3 FIX PASS — the counterexample, the fourth domain condition, and G4's write
   =========================================================================================

   Two r3 findings, pinned here so neither can come back as prose.

   · **The counterexample.** An r3 critic hand-built a save that satisfies BOTH restrictions
     COMPOSED-GAME.md:552 carries for its alignment theorem — `q̂ ∈ [0.5, 1]` (every make at m = 70,
     so q̂ = 0.70) and full evidence depth (`n = 6 ≥ mastery.N_FULL`) — and on which the game's best
     crew point is HELD on the make the study plan ranks LAST of 19. The paragraph is therefore not
     merely imprecise: it is false INSIDE the only domain it restricts itself to. The save is pinned
     below, byte for byte, with the two argmaxes it produces.
   · **The band floor is a DOMAIN condition, not only a measured error.** r2 exported `BAND_FLOOR`,
     `dRhoTrue` and `isBandFloored` as quantities and left `alignmentFor().domain` with three
     conditions. `domain.band` is the fourth, `crewOrderTrue` is the ordering the shipped bands
     actually pay, and `bandAgrees` is the argmax comparison between them.
   · **G4's demotion, on the write.** `legalize()` still has no caller under `site/js` — that is the
     out-of-lane half (notes/crew-fix.md R8) — but `allocate()` is the ONLY legal way `save.game.crew`
     changes, so the repair now rides on it: the lapsed point is spendable before the write
     (`canAllocate` prices `effectiveSpent`) and recovered by it, and the caller is handed the rows
     `data/job.js COPY.crewDemoted` prints. */

describe('J4 · 15 · r3: the hand-built counterexample to G3.8\'s alignment theorem', () => {
  /** The critic's save, rebuilt from its description: 19 makes at m 70 / n 6, CS-LIN at m 52,
   *  ASN-PLP mastered at m 92. Every make is at q̂ = 0.70 ≥ 0.5 and at n ≥ N_FULL = 5. */
  function counterexample() {
    const s = saveAt(20, 7);
    for (const id of MAKES) withSkill(s, id, { m: 70, n: 6 });
    withSkill(s, 'CS-LIN', { m: 52, n: 6 });
    withSkill(s, 'ASN-PLP', { m: 92, n: 6, mastered: true });
    return s;
  }

  test('the save really is inside BOTH restrictions the published paragraph carries', () => {
    const s = counterexample();
    for (const id of MAKES) {
      assert.ok(nOf(s, id) >= 5, `${id}: n ${nOf(s, id)} ≥ mastery.N_FULL`);
      // G3.8 row 3's link is q̂ = m/100; the restriction the paragraph names is q̂ ∈ [0.5, 1]
      assert.ok(mOf(s, id) / 100 >= 0.5, `${id}: q̂ ${(mOf(s, id) / 100).toFixed(2)} ≥ 0.5`);
    }
    const a = alignmentFor(s, { shape: 'JOB' });
    assert.equal(a.domain.evidence, true, 'the evidence-depth condition is SATISFIED here');
    assert.deepEqual(a.bandFloored, [], 'and nothing at all is in the FLAT TAIL below m 40');
    /* VERIFY-2 (finding 6): `domain.band` now reads BOTH clamps, and the one make that makes this
       save a counterexample — the mastered ASN-PLP at m 92 — is in the TOP one. That is the same
       make and the same defect, counted twice: `crewValue` prices it below every weak make while
       the shipped bands pay a flat 0.0325 for a rung on it. It does not soften the finding, which
       is about the RANK condition and is asserted on its own below; the two quantities that used to
       contradict each other on saves like this now agree. */
    assert.deepEqual(a.bandCeiled, ['ASN-PLP'], 'the mastered make is in the TOP flat range');
    assert.equal(a.domain.band, false, 'so the two-ended band condition fails — on the mastered make');
    assert.equal(alignmentFor(s, { of: MAKES.filter((m) => m !== 'ASN-PLP') }).domain.band, true,
      'and on nothing else: drop it and every remaining candidate is strictly between the clamps');
  });

  test('THE FINDING: the game\'s best crew point is the study plan\'s LAST make, 19 of 19', () => {
    const s = counterexample();
    const a = alignmentFor(s, { shape: 'JOB' });
    const order = crewOrder(s, { shape: 'JOB' });

    assert.equal(a.best.rank, HELD, 'the best buy is a HELD');
    assert.equal(a.best.make, 'ASN-PLP');
    assert.equal(a.steady.make, 'CS-LIN', 'the study argmax is the coldest weak make');
    assert.equal(order[0], 'CS-LIN', 'and crewOrder IS readiness.weakSpots()\'s order');
    assert.equal(order.indexOf('ASN-PLP') + 1, order.length,
      'the make the GAME prices highest is ranked LAST by the study plan');
    assert.ok(a.best.value > a.steady.value,
      `HELD ${a.best.value.toFixed(3)} outbids the best STEADY ${a.steady.value.toFixed(3)}`);

    // the rank condition is the one that carries the finding, and `domain` says so without being
    // asked twice (`band` is false on the same mastered make — verify-2 finding 6, above)
    assert.equal(a.holds, false);
    assert.deepEqual(a.domain, { evidence: true, rank: false, supply: null, band: false, all: false },
      'COMPOSED-GAME.md G3.8 published this sentence with NO domain at all, and q̂ ≥ 0.5 is row 3\'s '
      + 'restriction, not this one (notes/crew-fix.md R2 — filed round 1, re-filed rounds 2 and 3)');
    // the RANK condition fails on its own, with the band condition satisfied on every other make
    const noHold = alignmentFor(s, { of: MAKES.filter((m) => m !== 'ASN-PLP') });
    assert.equal(noHold.domain.band, true, 'every other candidate is strictly inside the bands…');
    assert.equal(a.holds, false, '…and it is still the rank condition that this save breaks');
  });

  test('and the make the game points at has nothing left to study — it is already mastered', () => {
    const s = counterexample();
    const best = alignmentFor(s, { shape: 'JOB' }).best;
    assert.equal(canHold(s, best.make), true, 'HELD is gated on isMastered');
    assert.ok(mOf(s, best.make) >= 85, 'a mastered make is at the top band');
    // readiness.weakSpots() would not even list it: that is the whole force of the counterexample
    assert.ok(crewValue(s, best.make) < crewValue(s, 'CS-LIN'),
      'its study value is below the make the plan puts first');
  });
});

describe('J4 · 15 · r3: domain.band — the flat tail below BAND_FLOOR is the FOURTH condition', () => {
  test('crewOrderTrue is crewOrder with dRhoModel replaced by the shipped band, and nothing else', () => {
    const s = randomSave(7);
    for (const id of MAKES) {
      const p = matrixParamsFor('JOB');
      close(steadyValueTrue(s, id),
        dRhoTrue(mOf(s, id), STEADY) * p.lootMean * p.mBar * encountersFor(s, id, 'JOB') / COSTS.STEADY,
        1e-12, id);
    }
    assert.equal(crewOrderTrue(s).length, MAKES.length, 'the ordering is total');
    assert.deepEqual([...crewOrderTrue(s)].sort(), [...MAKES].sort(), 'and it is a permutation');
  });

  test('domain.band is false while any candidate sits at or below BAND_FLOOR = 40', () => {
    const s = saveAt(12, 2);
    for (const id of MAKES) withSkill(s, id, { m: 55, n: 6 });
    const clean = alignmentFor(s);
    assert.equal(clean.domain.band, true, 'every make above the floor');
    assert.deepEqual(clean.bandFloored, []);
    assert.equal(clean.bandFloor, BAND_FLOOR);
    assert.equal(BAND_FLOOR, 40, 'RUNG_BANDS publishes 40/60/85 and bandFor clamps at the lowest');

    withSkill(s, 'VOC', { m: 12, n: 6 });
    const a = alignmentFor(s);
    assert.equal(a.domain.band, false, 'one make in the flat tail is enough to leave the domain');
    assert.deepEqual(a.bandFloored, ['VOC']);
    // …and restricting the candidate set puts the save back inside it, exactly as for evidence
    assert.equal(alignmentFor(s, { of: MAKES.filter((m) => m !== 'VOC') }).domain.band, true);
    // the boundary is inclusive: m = 40 IS floored, because dRhoTrue(40) === dRhoTrue(0)
    withSkill(s, 'VOC', { m: 40, n: 6 });
    assert.equal(alignmentFor(s).domain.band, false, 'm = 40 is the clamp, not the first live point');
    assert.equal(dRhoTrue(40), dRhoTrue(0), 'and that is why');
  });

  test('WHY it is a domain condition: below the floor the key and the payoff rank makes differently', () => {
    // two makes deep in the flat tail: the crew grid's key separates them, the shipped band does not
    const s = saveAt(12, 2);
    for (const id of MAKES) withSkill(s, id, { m: 95, n: 6 });     // everything else out of the way
    const [a, b] = ['VOC', 'NOTE'];
    withSkill(s, a, { m: 2, n: 6 });
    withSkill(s, b, { m: 38, n: 6 });
    assert.ok(crewValue(s, a) !== crewValue(s, b), 'the crew grid orders m 2 above m 38…');
    close(dRhoTrue(2), dRhoTrue(38), 1e-12, '…while the game pays them at the SAME rate');
    assert.equal(alignmentFor(s).domain.band, false,
      'notes/crew-fix.md R5: the repair is a fourth RUNG_BANDS row at m ≈ 15-20 in data/job.js, '
      + 'which DRHO_SLOPE re-fits itself around at module load — this lane does not own that file');
  });

  test('bandAgrees is the measured consequence, and it is false on a large share of saves', () => {
    let differ = 0; const N = 300;
    for (let i = 0; i < N; i++) {
      const s = randomSave(i);
      if (!alignmentFor(s).bandAgrees) differ++;
      assert.equal(alignmentFor(s).bandAgrees, crewOrder(s)[0] === crewOrderTrue(s)[0],
        'bandAgrees IS the argmax comparison, not a second opinion about it');
    }
    const share = differ / N;
    if (process.env.J4_PRINT) console.log(`r3 band domain | crewOrder top != crewOrderTrue top on ${differ}/${N} = ${(share * 100).toFixed(1)} %`);
    assert.ok(share > 0.20,
      `${(share * 100).toFixed(1)} % — G3.8's domain needs this condition stated with the other three`);
  });

  test('domain.all is the conjunction of all FOUR conditions', () => {
    const s = saveAt(12, 2);
    for (const id of MAKES) withSkill(s, id, { m: 50, n: 5 });
    const a = alignmentFor(s);
    assert.equal(a.domain.supply, null, 'no queue: supply is unknown, not failed');
    assert.equal(a.domain.all, a.domain.evidence && a.domain.rank && a.domain.band);
    // each condition alone is sufficient to leave the domain
    for (const [patch, key] of [[{ m: 50, n: 2 }, 'evidence'], [{ m: 20, n: 5 }, 'band']]) {
      const t = saveAt(12, 2);
      for (const id of MAKES) withSkill(t, id, { m: 50, n: 5 });
      withSkill(t, 'VOC', patch);
      assert.equal(alignmentFor(t).domain[key], false, `${key} fails`);
      assert.equal(alignmentFor(t).domain.all, false, `and ${key} alone takes the save out of domain.all`);
    }
  });
});

describe('J4 · 15 · r3: G4\'s lapsed HELD is repaired on the write, and its point comes back', () => {
  /** The critic's save: FAC2 mastered and manned HELD, then a Mock miss drops it to 69. */
  function afterMockMiss() {
    const s = saveAt(1, 0);                                    // capacity 8 — the L1 budget
    for (const id of MAKES) withSkill(s, id, { m: 30, n: 6 });
    withSkill(s, 'FAC2', { m: 88, n: 8, mastered: true });
    withSkill(s, 'VOC', { m: 88, n: 8, mastered: true });
    let out = allocate(s, 'FAC2', HELD).save;
    out = allocate(out, 'NOTE', STEADY).save;
    out.skills.FAC2 = { ...out.skills.FAC2, m: 69 };           // mastery.mockMiss
    return out;
  }

  test('the starting state is the one the critic measured — a point spent that cannot pay', () => {
    const s = afterMockMiss();
    assert.equal(canHold(s, 'FAC2'), false);
    assert.equal(rankOf(s, 'FAC2'), HELD, 'the save still stores HELD');
    assert.equal(effectiveRankOf(s, 'FAC2'), STEADY, 'the ladder already pays only STEADY');
    const b = budgetFor(s);
    assert.equal(b.spent, 3);
    assert.equal(b.effectiveSpent, 2, 'one of the three points buys nothing');
    assert.equal(b.wasted, 1);
    assert.deepEqual(b.lapsed, ['FAC2']);
  });

  test('the wasted point is SPENDABLE before the repair — effectiveFree, not free, is the budget', () => {
    const s = afterMockMiss();
    const b = budgetFor(s);
    assert.equal(b.free, 5, 'what the STORED build leaves');
    assert.equal(b.effectiveFree, 6, 'what the student can actually spend');
    // fill the build to the brim: the lapsed point must not lock a rank out of an 8-point budget
    let full = s;
    for (const id of MAKES) { const r = allocate(full, id, STEADY); if (r.ok && r.changed) full = r.save; }
    const after = budgetFor(full);
    assert.equal(after.spent, after.capacity, `all ${after.capacity} points are reachable`);
    assert.equal(after.wasted, 0, 'and none of them is a rank that cannot pay');
    assert.equal(after.legal, true);
  });

  test('THE FIX: a successful allocation applies G4\'s demotion and hands back the debrief rows', () => {
    const s = afterMockMiss();
    const r = allocate(s, 'PAIRS', STEADY);
    assert.equal(r.ok, true);
    assert.deepEqual(r.demotions, [{
      make: 'FAC2', from: HELD, to: STEADY, reason: REFUSALS.NOT_MASTERED,
      fromName: RANK_NAMES[HELD], toName: RANK_NAMES[STEADY],
    }], 'the {make, from, to} rows data/job.js COPY.crewDemoted prints');
    assert.equal(r.crew.FAC2, STEADY, 'the stored rank is the one the gate allows');
    assert.equal(r.crew.NOTE, STEADY, 'and nothing else moved');
    assert.equal(r.crew.PAIRS, STEADY, 'the allocation itself still happened');
    assert.equal(r.wasted, 0, 'the point is no longer spent on a rank that cannot pay');
    assert.equal(r.spent, r.effectiveSpent);
    assert.equal(r.legal, true);
    // and it agrees with legalize() exactly — one rule, two entry points
    assert.equal(legalize(s).crew.FAC2, STEADY);
    assert.deepEqual(crewDemotions(s), r.demotions);
  });

  test('a REFUSAL still changes nothing — demotions are reported as data, not applied', () => {
    const s = afterMockMiss();
    const before = crewOf(s);
    const r = allocate(s, 'CS-LIN', HELD);                     // CS-LIN is at m 30: not mastered
    assert.equal(r.ok, false);
    assert.equal(r.reason, REFUSALS.NOT_MASTERED);
    assert.deepEqual(r.crew, before, 'a refusal changes nothing');
    assert.deepEqual(crewOf(r.save), before, 'and returns the save unchanged');
    assert.equal(r.demotions.length, 1, 'but it still reports what a write would repair');
    assert.equal(budgetFor(r.save).wasted, 1, 'the point is still stored against a lapsed rank');
  });

  test('re-pressing the lapsed make itself is priced at the rank it PAYS, not the one it stores', () => {
    const s = afterMockMiss();
    // HELD on a lapsed make is refused by the gate, and costs nothing to ask for
    assert.equal(allocate(s, 'FAC2', HELD).ok, false, 'G4: it cannot be re-confirmed at HELD');
    // STEADY on it is a no-op on the rank and a repair on the budget
    const r = allocate(s, 'FAC2', STEADY);
    assert.equal(r.ok, true);
    assert.equal(r.from, STEADY, 'canAllocate reads the EFFECTIVE rank');
    assert.equal(r.crew.FAC2, STEADY);
    assert.equal(r.wasted, 0);
    // and standing it down entirely frees both points
    const down = allocate(s, 'FAC2', BARE);
    assert.equal(down.ok, true);
    assert.equal(down.crew.FAC2, undefined);
    assert.equal(down.spent, 1, 'only NOTE is left');
  });

  test('the repair is idempotent, and allocate never produces an illegal or lapsed build', () => {
    let s = afterMockMiss();
    const first = allocate(s, 'PAIRS', STEADY);
    s = first.save;
    const second = allocate(s, 'FIG-ALG', STEADY);
    assert.deepEqual(second.demotions, [], 'nothing left to repair');
    assert.equal(second.changed, true);
    // property: across a long random sequence started from the lapsed save, no call leaves a
    // stored rank the gate refuses, and capacity is never exceeded
    const R = mulberry32(cyrb53('j4|r3|lapse') >>> 0);
    let t = afterMockMiss();
    const capacity = capacityFor(t);
    for (let k = 0; k < 400; k++) {
      const make = MAKES[Math.floor(R.next() * MAKES.length)];
      const rank = [BARE, STEADY, HELD][Math.floor(R.next() * 3)];
      const r = allocate(t, make, rank);
      if (r.ok) t = r.save;
      const crew = crewOf(t);
      assert.ok(spentOf(crew) <= capacity, `spent ${spentOf(crew)} > ${capacity}`);
      for (const [m, rk] of Object.entries(crew)) {
        if (rk === HELD) assert.ok(canHold(t, m), `${m} stored HELD without the gate`);
      }
    }
    assert.deepEqual(budgetFor(t).lapsed, [], 'no lapsed rank survives a single successful write');
  });

  test('WHAT IS STILL OUT OF LANE: legalize() and COPY.crewDemoted have no caller under site/js', () => {
    // This is the half of G4 that no file in this lane can close, asserted so it cannot be
    // forgotten a fourth round. `allocate` covers every crew change the student makes; G4 also
    // names two moments with NO allocation (after mock.submitRun, and after a boss KO/miss writes
    // mastery) and a debrief LINE. See notes/crew-fix.md R8, notes/repair-crew.md → Requests.
    //
    // r4 fix: this test used to assert only `typeof legalize === 'function'` and the demotion count
    // — it made the claim in its own title and then did not check it. It now READS `site/js` and
    // asserts G4's rule is closed by exactly one of the two routes, and that whichever route is
    // live is COMPLETE. It therefore cannot pass on a half-fix (a wired `legalize()` whose line is
    // never printed), and it does not break when the screen lane lands the wiring correctly.
    assert.equal(typeof legalize, 'function', 'the repair exists and is exported');
    assert.equal(typeof crewDemotions, 'function', 'and so does the copy\'s data source');

    const SITE = path.join(ROOT, 'site');
    const jsFiles = [];
    (function walk(dir) {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.js')) jsFiles.push(p);
      }
    }(SITE));
    assert.ok(jsFiles.length > 40, `${jsFiles.length} js files scanned under site/`);
    const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const callers = [];
    const printers = [];
    for (const f of jsFiles) {
      const rel = path.relative(ROOT, f);
      if (rel === 'site/js/job/crew.js') continue;                 // the definition site is not a caller
      const src = strip(readFileSync(f, 'utf8'));
      if (/\blegalize\s*\(/.test(src)) callers.push(rel);
      if (/crewDemoted/.test(src) && rel !== 'site/data/job.js') printers.push(rel);
    }

    const s = afterMockMiss();
    assert.equal(crewDemotions(s).length, 1, 'the demotion G4 names is real on this save');
    // the in-lane compensation, which is what makes the gap survivable while it is open
    assert.equal(budgetFor(s).wasted, 1, 'the STORED build still over-spends until something rewrites it');
    assert.equal(budgetFor(s).effectiveFree, budgetFor(s).capacity - budgetFor(s).effectiveSpent,
      'but the point is priced as spendable: canAllocate reads effectiveSpent (r3)');
    // THE POINT IS NOT BURNED — asserted on a save where it is the LAST point, so the assertion
    // distinguishes the two pricings. (On a half-empty budget both pricings say yes, which is how
    // this assertion was blind before r4: it passed with `spent` substituted for `effectiveSpent`.)
    // built with `withCrew`, not `allocate`: a successful allocation would repair the lapse first
    const bare = MAKES.filter((m) => (crewOf(s)[m] ?? 0) === BARE);
    const tightCrew = { ...crewOf(s) };
    for (const m of bare.slice(0, 5)) tightCrew[m] = STEADY;       // 5 + FAC2(2) + NOTE(1) = 8 spent
    const tight = withCrew(s, tightCrew);
    const bt = budgetFor(tight);
    assert.equal(bt.capacity, 8, 'the L1 budget');
    assert.equal(bt.spent, 8, 'the STORED build spends every point');
    assert.equal(bt.effectiveSpent, 7, 'one of them buys nothing, so one is really free');
    assert.equal(bt.wasted, 1);
    assert.equal(bt.manned, 7);
    const last = bare[5];
    assert.ok(canAllocate(tight, last, STEADY).ok,
      `${last} must still be mannable: the lapsed point is priced at what it PAYS (r3), not at what `
      + 'the save stores — otherwise a Mock miss burns a capacity point until someone calls legalize()');
    assert.equal(canAllocate(tight, last, STEADY).spent, 8,
      'and the build it would write spends the freed point, exactly to capacity');
    // the control that makes the assertion above mean something: price the STORED build instead and
    // the same call is refused for CAPACITY. That is the pre-r3 behaviour the critic measured.
    const storedPricing = canAllocate(tight, last, STEADY, { budget: { ...bt, effectiveSpent: undefined } });
    assert.equal(storedPricing.ok, false, 'priced at the STORED rank the same move is refused');
    assert.equal(storedPricing.reason, REFUSALS.CAPACITY,
      'so effectiveSpent is load-bearing, not decoration — this is the burn the critic reported');
    assert.deepEqual(budgetFor(allocate(s, 'VOC', BARE).save).lapsed, [],
      'one successful allocation clears the lapse (allocate applies G4 on the write)');

    if (callers.length === 0) {
      // ROUTE A is not wired. Then the row the debrief needs must at least exist, exactly shaped.
      const row = crewDemotions(s)[0];
      assert.deepEqual(Object.keys(row).sort(),
        ['from', 'fromName', 'make', 'reason', 'to', 'toName'],
        'G4\'s row shape, ready for COPY.crewDemoted');
      assert.equal(row.reason, REFUSALS.NOT_MASTERED);
      assert.equal(CREW_RANKS[row.from].name, row.fromName);
      assert.equal(CREW_RANKS[row.to].name, row.toName);
      assert.equal(printers.length, 0,
        `COPY.crewDemoted is rendered by ${printers.join(', ')} while legalize() has no caller — `
        + 'half of G4 is wired; see notes/repair-crew.md → Requests');
    } else {
      // ROUTE A is wired — then the LINE G4 quotes must print, or the fix is half-done.
      assert.ok(printers.length > 0,
        `legalize() is now called from ${callers.join(', ')} but COPY.crewDemoted is still rendered nowhere: `
        + 'G4 requires the debrief line as well as the repair');
    }
  });
});

/* ==========================================================================================
   S4 · THE BUILD DECISION THAT REPLACES THE 4×2 MATRIX
   designs/REPAIR-DECISION.md §S4.2 (the mechanic) and §S4.4 items 1-3 (this section).

   WHY THIS SECTION EXISTS. §13 measures G2's five parameters off the drafted path and finds the
   published winner column wrong on three of four rows: STEADY wins every shape by 12×-17×, because
   three of the five parameters (`mBar`, `eForgiven`, `eHeld`) are population means no board
   reproduces. A decision built on a population mean is not a decision a student can make from the
   board in front of them. S4 replaces it with one inequality whose two economy scalars cancel:

       DEEP on A beats STEADY on A + STEADY on B   iff   (Δρ₂(m_A) − Δρ₁(m_A))·e_A > Δρ₁(m_B)·e_B

   Every number below is COMPUTED from `RUNG_BANDS` and from `composePage → composeBundles →
   draftUnion`, the queue a job is actually played on. Nothing here reads `CREW_MATRIX`: that is the
   point of the repair, and the last test in the section asserts it numerically rather than by grep.

   VERIFY-1 NOTE ON THE FIRST PARAGRAPH ABOVE. "A decision built on a population mean is not a
   decision a student can make from the board in front of them" was true of `buildMatrix` AND of the
   build price the brief window printed, which ran `heldValue` → `CREW_MATRIX` at the one surface
   that can spend a point. That half is fixed at the root: `measuredParamsOn` measures `m̄`,
   `P(chain ≥ 3)` and `Σm_saved` on the board and `boardOptionsOn` prices both rungs there
   (tests/job-align.test.mjs §7-§8). `buildMatrix` itself is unchanged and still answers for the
   document — that is what `source: 'published'` is for.

   NOT YET DONE, AND NAMED SO IT CANNOT BE FORGOTTEN: §S4.4 item 4 ("the mechanic is gone, not
   hidden") requires the chain-hold apparatus to be DELETED, which needs matching edits in
   `site/data/job.js`, `site/js/job/econ.js`, `site/js/screens/{job,stats}.js`,
   `tests/job-meta-constants.test.mjs` and `tests/job-econ.test.mjs` — five files this lane does not
   own. See notes/repair-crew.md → "Requests". Until they land, the replacement decision ships
   BESIDE the apparatus and this section is the proof that it works.

   ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
   │ READ THIS BEFORE READING §1-§3.                                                               │
   │                                                                                               │
   │   · WIRED AT VERIFY-1 (was: "NO CALLER anywhere under site/", round-1 crew-alignment).        │
   │     `buildDecisionOn` is reached from the shipped brief as `alignmentFor(...).decision` —     │
   │     `screens/job.js crewBlock` calls `alignmentFor(s, {shape, of: onBoard, queue})` on every  │
   │     render of the crew grid. §2(c) asserts that identity on a drafted board. What the screen  │
   │     does NOT yet do is PRINT the decision; that is one line in a file this lane does not own  │
   │     (notes/repair-crew.md → Requests), so §1-§3 still measure more than the student sees.     │
   │   · Its DEEP branch means "buy r2 (HELD) on make A". The shipped allocator gates HELD on      │
   │     `mastery.isMastered` (`crew.canHold`), and REPAIR-DECISION R-D1 — which would have        │
   │     removed that gate — did not land (designs/SPEC-CORRECTIONS.md §N). So on the corpus below │
   │     the DEEP recommendation is legally buyable on 0.3 % of the decisions it is made on;       │
   │     `canAllocate` refuses the other 99.7 % with `reason: 'not-mastered'`. §2(c) measures it.  │
   │   · §2(c2) is the arm the r3 finding asked for: what the shipped grid ACTUALLY prices with,   │
   │     asserted as an identity against `steadyValueOn` / `heldValueOn` at board parameters.      │
   │                                                                                               │
   │ CONSEQUENCE FOR WHAT §2(b) IS. Twelve green tests certifying the two-sidedness of an          │
   │ unshipped inequality are not a guard against a dominant crew build, and `deepPct < 75` was    │
   │ standing where that guard should be. It is still asserted — the inequality's two-sidedness is │
   │ a real property of `RUNG_BANDS` and worth pinning for the day R-D1 lands — but it is labelled │
   │ for what it is, and the anti-dominance guard now sits in §2(d), on `buildOptions`, which is   │
   │ the STEADY-vs-HELD decision the shipped save really makes.                                    │
   └──────────────────────────────────────────────────────────────────────────────────────────────┘
   ========================================================================================== */

/** The census corpus: >= 200 drafted boards per shape (§S4.4 item 2 asks for more than §13's 34). */
const S4_SAVES = [];
const S4_PAGES = [];
for (let i = 0; S4_SAVES.length < 600 && i < 2000; i++) {
  const s = randomSave(i);
  const p = composePage(s, { now: NOW });
  if (!p.queue.length) continue;
  S4_SAVES.push(s); S4_PAGES.push(p);
}

/** One drafted board, through the shipped composer. `null` when the save posts nothing. */
function s4Board(k, shapeId) {
  const b = composeBundles(S4_SAVES[k], { now: NOW, page: S4_PAGES[k], shape: shapeId, seed: `s4|census|${shapeId}|${k}` });
  if (!b.bundles?.length) return null;
  const picks = b.bundles.slice(0, Math.max(1, b.draft)).map((x) => x.id);
  const q = draftUnion(b.bundles, picks).queue;
  return q?.length ? q : null;
}

/** The census: the shipped decision evaluated on every board of every shape. */
function s4Census(limit = 260) {
  const byShape = {};
  const ratios = [];
  const legalEx = []; const illegalEx = [];
  let deep = 0; let spread = 0; let deepLegal = 0;
  for (const shapeId of Object.keys(SHAPES)) {
    const row = { boards: 0, deep: 0, spread: 0, deepLegal: 0 };
    for (let k = 0; k < S4_SAVES.length && row.boards < limit; k++) {
      if (capacityFor(S4_SAVES[k]) < 10) continue;          // a save with no spare point buys nothing
      const q = s4Board(k, shapeId);
      if (!q) continue;
      const d = buildDecisionOn(S4_SAVES[k], q, { shape: shapeId });
      if (!d) continue;                                     // fewer than two served makes: no decision
      row.boards++; ratios.push(d.ratio);
      if (d.deep) {
        row.deep++; deep++;
        /* THE LEGALITY COLUMN (round-1 verification). "DEEP on A" is a HELD point on A, and the
           shipped allocator gates HELD on `isMastered`. Counting the recommendations the student
           could actually act on is the difference between a census of a mechanic and a census of a
           wish; §2(c) reads these two fields. */
        if (canHold(S4_SAVES[k], d.A)) { row.deepLegal++; deepLegal++; if (legalEx.length < 4) legalEx.push({ shape: shapeId, k, A: d.A, mA: d.mA }); }
        else if (illegalEx.length < 4) illegalEx.push({ shape: shapeId, k, A: d.A, mA: d.mA });
      } else { row.spread++; spread++; }
    }
    row.deepPct = 100 * row.deep / row.boards;
    row.deepLegalPct = 100 * row.deepLegal / row.boards;
    byShape[shapeId] = row;
  }
  ratios.sort((a, b) => a - b);
  const boards = deep + spread;
  return {
    byShape, deep, spread, boards, deepPct: 100 * deep / boards, ratios,
    deepLegal, deepLegalPct: 100 * deepLegal / boards, legalEx, illegalEx,
  };
}

const S4_CENSUS = s4Census();

describe('J4 · S4 · 1 · the DEEP threshold is derived from RUNG_BANDS, band by band', () => {
  test('Δρ₁ / (Δρ₂ − Δρ₁) is 1.2156 (m40) · 1.3608 (m60) · 1.9697 (m85), each computed, each named', () => {
    /* The published thresholds, to 4 dp, from the shipped bands alone. If RUNG_BANDS moves, these
       move with it and the three decimals published beside the derivation are wrong — which is the
       intended failure.
       CORRECTED (verify-1, test-integrity): this comment used to name COMPOSED-GAME.md as the
       document that publishes them. It does not — `grep -n '1\.2156\|1\.3608\|1\.9697'
       COMPOSED-GAME.md` returns nothing. They are published in `designs/REPAIR-DECISION.md` §S4.2
       (the table at :664-666, and again at :709 and :744), which is the spec this whole section
       implements. */
    const expected = { 40: 1.2156, 60: 1.3608, 85: 1.9697 };
    for (const band of Object.keys(RUNG_BANDS).map(Number).sort((a, b) => a - b)) {
      const d1 = dRhoOf(band, STEADY);
      const d2 = dRhoOf(band, HELD);
      assert.ok(d2 > d1 && d1 > 0, `m${band}: both rungs pay and the second pays more (${d1} / ${d2})`);
      const thr = d1 / (d2 - d1);
      assert.equal(Number(thr.toFixed(4)), expected[band],
        `m${band}: the break-even encounter ratio is ${thr.toFixed(4)}, published ${expected[band]}`);
      assert.equal(Number(deepThresholdOf(band).toFixed(4)), expected[band], `m${band}: deepThresholdOf agrees`);
      assert.equal(Number(DEEP_THRESHOLDS[band].toFixed(4)), expected[band], `m${band}: DEEP_THRESHOLDS agrees`);
    }
  });

  test('A SINGLE BAND-FREE CONSTANT IS REFUSED: the three thresholds are pairwise distinct', () => {
    const vals = Object.values(DEEP_THRESHOLDS);
    assert.equal(vals.length, 3, 'three published bands, three thresholds');
    for (let i = 0; i < vals.length; i++) {
      for (let j = i + 1; j < vals.length; j++) {
        assert.ok(Math.abs(vals[i] - vals[j]) > 0.05,
          `thresholds ${vals[i].toFixed(4)} and ${vals[j].toFixed(4)} differ — one constant cannot stand for both`);
      }
    }
    assert.ok(Math.max(...vals) / Math.min(...vals) > 1.5,
      `end to end the threshold moves by ${((Math.max(...vals) / Math.min(...vals) - 1) * 100).toFixed(0)} %`);
  });

  test('the second rung always buys LESS than the first on the same band (the ladder is concave in rank)', () => {
    for (const band of Object.keys(RUNG_BANDS).map(Number)) {
      const d1 = dRhoOf(band, STEADY);
      assert.ok(marginalDRho(band) < d1,
        `m${band}: marginal ${marginalDRho(band).toFixed(4)} < first ${d1.toFixed(4)} — so DEEP needs concentration`);
      assert.ok(marginalDRho(band) > 0, `m${band}: and it is still worth something`);
    }
    // which is exactly why every threshold is > 1: a make must be served MORE than the next one
    for (const v of Object.values(DEEP_THRESHOLDS)) assert.ok(v > 1, `threshold ${v.toFixed(4)} > 1`);
  });

  test('deepThresholdAt(m) agrees with deepThresholdOf at every published key, and is flat in the tails', () => {
    for (const band of Object.keys(RUNG_BANDS).map(Number)) {
      // the claim the decision rests on: the interpolated band `dRhoTrue` reads IS the published
      // band at every key, so a threshold derived from `dRhoOf` prices what `buildDecisionOn` uses
      close(dRhoTrue(band, STEADY), dRhoOf(band, STEADY), 1e-12, `m${band}: Δρ₁ agrees`);
      close(dRhoTrue(band, HELD), dRhoOf(band, HELD), 1e-12, `m${band}: Δρ₂ agrees`);
      close(deepThresholdAt(band), deepThresholdOf(band), 1e-12, `m${band}`);
    }
    // BAND_FLOOR's flat tail, as a threshold rather than as a sentence (r3 finding 8)
    close(deepThresholdAt(0), deepThresholdAt(BAND_FLOOR), 1e-12, 'below the floor the threshold is flat');
    close(deepThresholdAt(100), deepThresholdAt(85), 1e-12, 'above the top band it is flat too');
  });

  /**
   * THE BOUNDARY ITSELF (verify-1, test-integrity). A critic mutated `deep: A.marginal > B.first`
   * to `>=` and the whole suite stayed green, because an exact tie never occurs on a drawn census —
   * so the one comparison the decision IS was unpinned. A tie is constructed here instead of hoped
   * for: at `m_A = 85` and `e_A = 4` the marginal side is `marginalDRho(85) · 4`, and `m_B` is the
   * mastery score at which `dRhoTrue(m_B, STEADY) · 1` equals it to the last bit of a double.
   *
   * The tie must read SPREAD: a second rung that exactly ties a first rung on another make buys the
   * same Δρ for the same point and loses the option of a second make (G2 "at most 12 of the 19 makes
   * may be manned"). `>=` would call that DEEP, and this test is the only thing that says so.
   */
  test('an EXACT tie reads SPREAD, not DEEP — the inequality is strict (the surviving `>=` mutation)', () => {
    const M_A = 85;
    const M_B = 73.83333333333343;      // solved, not guessed: see the assertion below
    const A = 'NOTE'; const B = 'VOC';
    assert.equal(marginalDRho(M_A) * 4, dRhoTrue(M_B, STEADY) * 1,
      'the two sides of the inequality are the same double — if RUNG_BANDS moves, re-solve m_B');
    const s = saveAt(15, 7);
    for (const id of MAKES) withSkill(s, id, { m: 50, n: 5 });
    withSkill(s, A, { m: M_A, n: 5, mastered: true });
    withSkill(s, B, { m: M_B, n: 5 });
    const q = [
      { skill: A, role: 'new', tier: 1, key: 'a1' }, { skill: A, role: 'new', tier: 1, key: 'a2' },
      { skill: A, role: 'new', tier: 1, key: 'a3' }, { skill: A, role: 'new', tier: 1, key: 'a4' },
      { skill: B, role: 'new', tier: 1, key: 'b1' },
    ];
    const d = buildDecisionOn(s, q, { shape: 'JOB', of: [A, B] });
    assert.equal(d.A, A, 'A is the make a first rung pays most on tonight');
    assert.equal(d.B, B);
    assert.deepEqual([d.eA, d.eB], [4, 1], 'and the encounter counts are the board\'s own');
    assert.equal(d.lhs, d.rhs, 'the decision is sitting exactly on its boundary');
    assert.equal(d.deep, false,
      'a tie is SPREAD: the same Δρ for the same point, minus the second make — `>=` here would be a '
      + 'forced rung, which is what G11 and REPAIR-DECISION §S4.3 refuse');
  });
});

describe('J4 · S4 · 2 · the per-board flip census, on the drafted path', () => {
  test('the corpus really is >= 200 drafted boards per shape, composed by the shipped composer', () => {
    for (const [shape, row] of Object.entries(S4_CENSUS.byShape)) {
      assert.ok(row.boards >= 200, `${shape}: ${row.boards} boards (>= 200)`);
      assert.equal(row.deep + row.spread, row.boards, `${shape}: every board got a decision`);
    }
    assert.ok(S4_CENSUS.boards >= 800, `${S4_CENSUS.boards} boards in all`);
  });

  test('(a) BOTH OUTCOMES OCCUR ON EVERY SHAPE — the inequality is a decision, not a label', () => {
    for (const [shape, row] of Object.entries(S4_CENSUS.byShape)) {
      assert.ok(row.deep > 0, `${shape}: DEEP never wins — ${row.deep}/${row.boards}`);
      assert.ok(row.spread > 0, `${shape}: SPREAD never wins — ${row.spread}/${row.boards}`);
    }
  });

  /**
   * (b) THE INEQUALITY IS TWO-SIDED — and that is ALL this arm says (round-1 verification).
   *
   * It used to fail with "a dominant build", which claimed it was the suite's guard against one. It
   * is not, and it never could have been: `buildDecisionOn` is unshipped (§2(c)) and its DEEP branch
   * names a purchase the allocator refuses on 99.7 % of the boards it is recommended on. What is
   * measured here is a property of `RUNG_BANDS` and `draftUnion` — that the S4 inequality, if it
   * ever ships, would flip on the boards the composer actually deals rather than reduce to a label.
   * Worth pinning; not a guard. The guard is §2(d).
   */
  test('(b) the S4 inequality flips both ways on every shape — 25 %…75 % (S4.3 refusal condition c)', () => {
    for (const [shape, row] of Object.entries(S4_CENSUS.byShape)) {
      console.log(`  s4 census ${shape.padEnd(6)} boards ${row.boards}  DEEP ${row.deep} (${row.deepPct.toFixed(1)} %)`
        + `  SPREAD ${row.spread} (${(100 - row.deepPct).toFixed(1)} %)`
        + `  legally buyable DEEP ${row.deepLegal} (${row.deepLegalPct.toFixed(2)} %)`);
    }
    console.log(`  s4 census OVERALL boards ${S4_CENSUS.boards}  DEEP ${S4_CENSUS.deepPct.toFixed(1)} %`
      + `  ratio min ${S4_CENSUS.ratios[0].toFixed(4)}`
      + ` med ${S4_CENSUS.ratios[Math.floor(S4_CENSUS.ratios.length / 2)].toFixed(4)}`
      + ` max ${S4_CENSUS.ratios[S4_CENSUS.ratios.length - 1].toFixed(4)}`);
    for (const [shape, row] of Object.entries(S4_CENSUS.byShape)) {
      assert.ok(row.deepPct < 75, `${shape}: the inequality reads DEEP on ${row.deepPct.toFixed(1)} % of boards — it has stopped being a decision`);
      assert.ok(row.deepPct > 25, `${shape}: the inequality reads SPREAD on ${(100 - row.deepPct).toFixed(1)} % of boards — it has stopped being a decision`);
    }
    assert.ok(S4_CENSUS.deepPct < 75 && S4_CENSUS.deepPct > 25,
      `overall DEEP ${S4_CENSUS.deepPct.toFixed(1)} % — neither side may exceed 75 %`);
  });

  /**
   * (c) THE LEGALITY CENSUS — the decision §1-§3 measure is one the student cannot make
   * (round-1 verification, crew-alignment).
   *
   * Two measurements and one grep, so that the label on §1-§3 is machine-checked rather than a
   * comment. Measured on the 1 040-board corpus above:
   *
   *     DEEP recommendations                         595 / 1040 = 57.2 %
   *     …whose make A the save may legally HOLD        3 / 1040 =  0.29 %   (0.50 % of the DEEP)
   *     `canAllocate(save, A, HELD)` on the rest      refused, reason 'not-mastered'
   *     callers of `buildDecisionOn` under site/       none
   *
   * The three legal ones are makes at m ≥ 85 with a due-review clear behind them (NOTE at m 86-100),
   * which is `isMastered`'s own definition — so the census is not measuring a bug in `canHold`, it
   * is measuring that the S4 inequality picks its A by `Δρ₁·e` and takes no notice of the gate.
   */
  test('(c) the DEEP recommendation is LEGAL on ~0 % of boards, and nothing in site/ calls the decision', () => {
    const c = S4_CENSUS;
    assert.ok(c.deep > 0, 'the census recommends DEEP somewhere, or there is nothing to price');
    assert.ok(c.deepLegalPct < 1,
      `DEEP is legally buyable on ${c.deepLegalPct.toFixed(2)} % of decisions — if R-D1 has landed, `
      + 'this arm and the §1-§3 banner are both out of date and must be rewritten, not relaxed');
    assert.ok(c.illegalEx.length > 0, 'the census found no illegal DEEP example to check against the allocator');

    /* THE SHIPPED ALLOCATOR, on the census's own examples: the refusal, by name. */
    for (const ex of c.illegalEx) {
      const save = S4_SAVES[ex.k];
      assert.equal(canHold(save, ex.A), false, `${ex.shape}/${ex.k}: ${ex.A} at m ${ex.mA} is holdable after all`);
      const why = canAllocate(save, ex.A, HELD);
      assert.equal(why.ok, false, `${ex.shape}/${ex.k}: canAllocate allowed HELD on ${ex.A}`);
      assert.equal(why.reason, 'not-mastered', `${ex.shape}/${ex.k}: refused for ${why.reason}, not the gate`);
      assert.deepEqual(allocate(structuredClone(save), ex.A, HELD).crew, {}, 'and the allocation writes nothing');
    }
    /* …and the three legal ones really are legal, so the 0.29 % is a measurement and not a bug. */
    for (const ex of c.legalEx) {
      assert.equal(canHold(S4_SAVES[ex.k], ex.A), true, `${ex.shape}/${ex.k}: ${ex.A} at m ${ex.mA}`);
      assert.equal(canAllocate(S4_SAVES[ex.k], ex.A, HELD).ok, true, `${ex.shape}/${ex.k}: ${ex.A} refused after all`);
    }

    /* WHO CALLS IT — rewritten at verify-1 (test-integrity).
       The r3 arm asserted `callers === []` over a walk of `site/` that SKIPS `crew.js`, and then
       read that empty list as "the decision is unshipped". Both halves were wrong to lean on: the
       walk cannot see a call made from inside `crew.js`, which is the only place the wiring could
       ever live (the screens hold `state.crew` and call `alignmentFor`, not the pricing functions),
       and `supplyGapFor` was ALREADY reached from the shipped brief through `alignmentFor().gap`
       while this arm reported it unwired.
       What is asserted now is reachability from the shipped call, plus the grep as the weaker,
       separate claim it always was: no SCREEN reaches past `alignmentFor` into the pricing.

       VERIFY-2: the grep read RAW source, so a comment naming one of these functions counted as a
       call — `screens/job.js` acquired a comment citing `measuredParamsOn(board)` and this arm went
       red over a sentence. The claim was always about CALL SITES, so the source is stripped of
       comments and strings first (`tests/_helpers.mjs stripCommentsAndStrings`, the same routine
       `tests/job-meta-constants.test.mjs` uses for exactly this). That is narrower AND truer: a
       real call still trips it, prose no longer can. */
    const NAMES = ['buildDecisionOn', 'deepThresholdAt', 'DEEP_THRESHOLDS', 'marginalDRho', 'heldValueOn',
      'crewOrderOn', 'supplyGapFor', 'crewOrderTrue', 'steadyValueOn', 'boardOptionsOn', 'measuredParamsOn'];
    const callers = [];
    const walk = (dir) => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) { walk(full); continue; }
        if (!ent.name.endsWith('.js')) continue;
        if (full.endsWith(path.join('js', 'job', 'crew.js'))) continue;      // the definitions themselves
        const src = stripCommentsAndStrings(readFileSync(full, 'utf8'));
        for (const n of NAMES) if (new RegExp(`\\b${n}\\b`).test(src)) callers.push(`${path.relative(ROOT, full)}:${n}`);
      }
    };
    walk(path.join(ROOT, 'site', 'js'));
    walk(path.join(ROOT, 'site', 'data'));
    assert.deepEqual(callers, [],
      `a screen now reaches past alignmentFor into the pricing (${callers.join(', ')}) — the crew `
      + 'grid is supposed to have ONE entry point, so this arm must be rewritten rather than relaxed');

    /* THE WIRING, which the grep above cannot see. `screens/job.js crewBlock` calls
       `alignmentFor(s, {shape, of: onBoard, queue})` on every render of the brief's crew grid
       (pinned in `tests/job-screen.test.mjs`), and that call runs the S4 decision. */
    const k = (HOLDERS.length ? HOLDERS : LIVE13)[0];
    const q = draftedQueue(k, 'JOB');
    assert.ok(q, 'the corpus drafted a board to check the wiring on');
    const onBoard = [...new Set(q.map((t) => makeOf(t)).filter(Boolean))];
    const a = alignmentFor(SAVES13[k], { shape: 'JOB', of: onBoard, queue: q });
    assert.deepEqual(a.decision, buildDecisionOn(SAVES13[k], q, { shape: 'JOB', of: onBoard }),
      'alignmentFor().decision IS buildDecisionOn on the same board — §1-§3 measure a function the '
      + 'shipped brief now runs, which is what the r3 finding asked for');
    assert.equal(alignmentFor(SAVES13[k], { shape: 'JOB', of: onBoard }).decision, null,
      'and without a board there is no decision to report');
  });

  /**
   * (c2) WHAT THE SHIPPED CREW GRID PRICES WITH (verify-1, test-integrity).
   *
   * The r3 finding: "no test in the suite asserts that the decision the game DOES make has changed."
   * This is that test. The brief's grid renders `crewOrder` for its ROWS (the study ordering) and
   * `alignmentFor(...).threshold` for its PRICE, and the price is now `heldValueOn` / `steadyValueOn`
   * at `measuredParamsOn` — not `heldValue` / `crewValue` at `data/job.js CREW_MATRIX`. Asserted as
   * an identity on a real board so it cannot be satisfied by a coincidence.
   */
  test('(c2) the shipped grid prices with the BOARD functions, and the sort column is still the study key', () => {
    const k = (HOLDERS.length ? HOLDERS : LIVE13)[0];
    const q = draftedQueue(k, 'JOB');
    const save = SAVES13[k];
    const onBoard = [...new Set(q.map((t) => makeOf(t)).filter(Boolean))];
    const a = alignmentFor(save, { shape: 'JOB', of: onBoard, queue: q });

    assert.equal(a.pricedOn, 'board');
    assert.equal(a.params.source, 'board');
    for (const o of boardOptionsOn(save, q, { shape: 'JOB', of: onBoard, params: a.params })) {
      const own = o.rank === HELD
        ? heldValueOn(save, o.make, q, { shape: a.params })
        : steadyValueOn(save, o.make, q, { shape: a.params });
      close(o.value, own, 1e-12, `${o.make}/${RANK_NAMES[o.rank]}: priced by the …On function`);
      // …and NOT by the population one, wherever the two differ at all
      const pop = o.rank === HELD ? heldValue(save, o.make, 'JOB') : crewValue(save, o.make, 'JOB');
      if (Math.abs(pop - own) > 1e-9) assert.notEqual(o.value, pop, `${o.make}: still the CREW_MATRIX price`);
    }
    // the ROWS are unchanged: `crewOrder` is the study ordering and prices nothing (G3.8 §1)
    assert.deepEqual(crewOrder(save, { shape: 'JOB', of: onBoard }),
      crewOrder(save, { shape: matrixParamsFor('JOB'), of: onBoard }),
      'the grid\'s sort key is scale-free — measuring the board does not reorder the rows');
  });

  /**
   * (d) THE GUARD THAT WAS MISSING — the build decision the shipped save really makes
   * (round-1 verification, crew-alignment).
   *
   * `buildOptions` prices STEADY on all 19 makes and HELD on the mastered ones and sorts them; its
   * head is `bestBuy`. **CORRECTED AT VERIFY-1:** this used to read "that STEADY-vs-HELD choice is
   * the one the game implements", and since the board-pricing fix it is not — the brief's grid
   * prices through `boardOptionsOn` at `measuredParamsOn` (§2(c2)). What `buildOptions` answers is
   * the choice the SAVE alone implies, with no board in it, which is still worth pinning because it
   * is the dominance question G2 publishes a claim about. `(e)` below measures the same question on
   * the board. Measured over the same 1 040 drafted boards:
   *
   *     top pick STEADY   940 / 1040 = 90.4 %        HELD  100 / 1040 =  9.6 %      (9.4 : 1)
   *     boards offering no HELD at all   724 / 1040 = 69.6 %
   *     …restricted to the 316 boards where a HELD IS on offer:  STEADY 216 (68.4 %) · HELD 100 (31.6 %)
   *
   * Both numbers are pinned, because they say different things and only one of them is a defect.
   * Unconditionally the build is DOMINANT by exactly the 75 % test §2(b) applies to the unshipped
   * inequality — 90.4 % is far outside it, and COMPOSED-GAME G2's "two flips, no dominant build" is
   * false as shipped (this is the crew lane's own round-3 BLOCKER, recorded in
   * notes/repair-tests.md and owned there, not here). Conditionally — on the boards where the
   * student has a mastered make to hold at all — it is two-sided and inside the band, which is why
   * the defect is about WHO CAN REACH the decision rather than about the prices.
   */
  test('(d) the SAVE-ONLY build decision: STEADY dominates 9.4 : 1 unconditionally, 2.2 : 1 where HELD is offered', () => {
    let steady = 0; let held = 0; let offered = 0; let steadyWhenOffered = 0; let heldWhenOffered = 0;
    const byShape = {};
    for (const shapeId of Object.keys(SHAPES)) {
      const row = { boards: 0, steady: 0, held: 0, offered: 0 };
      for (let k = 0; k < S4_SAVES.length && row.boards < 260; k++) {
        if (capacityFor(S4_SAVES[k]) < 10) continue;
        const q = s4Board(k, shapeId);
        if (!q) continue;
        const options = buildOptions(S4_SAVES[k], { shape: shapeId });
        if (!options.length) continue;
        row.boards++;
        const top = options[0];
        const hasHeld = options.some((o) => o.rank === HELD);
        if (hasHeld) { row.offered++; offered++; if (top.rank === HELD) heldWhenOffered++; else steadyWhenOffered++; }
        if (top.rank === HELD) { row.held++; held++; } else { row.steady++; steady++; }
        assert.equal(top.value, Math.max(...options.map((o) => o.value)), `${shapeId}/${k}: buildOptions is not sorted`);
        if (top.rank === HELD) assert.equal(canHold(S4_SAVES[k], top.make), true,
          `${shapeId}/${k}: the top buy is a HELD the allocator would refuse on ${top.make}`);
      }
      byShape[shapeId] = row;
    }
    const boards = steady + held;
    const steadyPct = 100 * steady / boards;
    console.log(`  shipped build decision: boards ${boards}  STEADY ${steady} (${steadyPct.toFixed(1)} %)  HELD ${held} (${(100 - steadyPct).toFixed(1)} %)`);
    console.log(`    HELD on offer at all: ${offered} (${(100 * offered / boards).toFixed(1)} %) — of those STEADY ${steadyWhenOffered}, HELD ${heldWhenOffered}`);
    for (const [shape, row] of Object.entries(byShape)) console.log(`    ${shape.padEnd(6)} ${JSON.stringify(row)}`);

    assert.ok(boards >= 800, `${boards} boards in the shipped-decision census`);
    /* THE DOMINANCE, pinned at its measured value. This is the number §2(b) was standing in front
       of, and it fails the same 75 % test by 15 points. Both sides of the pin are deliberate: a
       repair that brings it inside the band must come back here and restate it. */
    assert.ok(Math.abs(steadyPct - 90.4) <= 2,
      `STEADY is the top buy on ${steadyPct.toFixed(1)} % of boards, pinned at 90.4 % (±2). `
      + 'Above 75 % this is a DOMINANT BUILD and G2\'s "two flips, no dominant build" is false as shipped.');
    assert.ok(steadyPct > 75,
      `STEADY is now the top buy on only ${steadyPct.toFixed(1)} % of boards — the dominance this arm `
      + 'was written to pin has been repaired; restate the number and the G2 note with it');
    /* …and the conditional decision, which IS two-sided — the distinction the guard has to keep. */
    const condPct = 100 * steadyWhenOffered / offered;
    assert.ok(Math.abs(condPct - 68.4) <= 3,
      `where a HELD is on offer STEADY wins ${condPct.toFixed(1)} % of the time, pinned at 68.4 % (±3)`);
    assert.ok(condPct < 75 && condPct > 25,
      `where a HELD is on offer the decision reads ${condPct.toFixed(1)} % STEADY — even the conditional build is now dominant`);
  });

  /**
   * (f) THE SAME QUESTION, ON THE BOARD — the decision the brief's crew grid actually prices
   * (verify-1). `(d)` prices from the save alone; this prices from `boardOptionsOn` at
   * `measuredParamsOn`, which is what `alignmentFor(save, {queue})` runs and what the grid prints.
   * It is the arm that can see the repair: priced from `CREW_MATRIX` the HELD rung took the top of
   * the list on a large minority of the boards that offered one, and priced on the board it almost
   * never does — which is what COMPOSED-GAME.md G2 publishes ("a point spent as STEADY beats a HELD
   * upgrade on every shape the composer deals, by more than 4× on each") and what the app now says.
   */
  test('(f) the BOARD-priced build decision: on the board a HELD point almost never tops the list', () => {
    let boards = 0; let offered = 0; let heldTop = 0; let oldOffered = 0; let oldHeldTop = 0;
    for (let k = 0; k < S4_SAVES.length && boards < 150; k++) {
      if (capacityFor(S4_SAVES[k]) < 10) continue;
      const q = s4Board(k, 'JOB');
      if (!q) continue;
      const save = S4_SAVES[k];
      const onBoard = [...new Set(q.map((t) => makeOf(t)).filter(Boolean))];
      if (!onBoard.length) continue;
      boards++;
      const opts = boardOptionsOn(save, q, { shape: 'JOB', of: onBoard });
      if (opts.some((o) => o.rank === HELD)) {
        offered++;
        if (opts[0].rank === HELD && opts[0].value > 0) heldTop++;
      }
      const old = buildOptions(save, { shape: 'JOB', of: onBoard });
      if (old.some((o) => o.rank === HELD)) { oldOffered++; if (old[0].rank === HELD) oldHeldTop++; }
    }
    if (process.env.J4_PRINT) {
      console.log(`  verify-1 board decision: boards ${boards} | HELD offered ${offered}, tops the list ${heldTop}`
        + ` | priced from CREW_MATRIX: offered ${oldOffered}, tops the list ${oldHeldTop}`);
    }
    assert.ok(boards >= 100, `${boards} drafted JOB boards`);
    assert.ok(offered >= 20, `only ${offered} boards offered a HELD point at all`);
    // the control: from the document's constants the HELD rung wins the list on a real fraction
    assert.ok(oldHeldTop / oldOffered > 0.30,
      `priced from CREW_MATRIX a HELD point topped the list on ${oldHeldTop}/${oldOffered} boards — `
      + 'if that is no longer true the data file has been repriced and this control is stale');
    // the measurement: on the board it is rare, as the authority document says it should be
    assert.ok(heldTop / offered < 0.15,
      `on the board a HELD point still tops the list on ${heldTop}/${offered} boards`);
    assert.ok(heldTop / offered < oldHeldTop / oldOffered / 2,
      'and the board price has to have MOVED the answer, not trimmed it');
  });

  test('(e) the census is DETERMINISTIC under the seeded corpus, and pinned at the measured split ±2 %', () => {
    const again = s4Census();
    assert.deepEqual(
      Object.fromEntries(Object.entries(again.byShape).map(([k, v]) => [k, [v.boards, v.deep, v.spread]])),
      Object.fromEntries(Object.entries(S4_CENSUS.byShape).map(([k, v]) => [k, [v.boards, v.deep, v.spread]])),
      'two runs of the same seeded corpus give the same census',
    );
    // The measured split on THIS corpus (600 seeded saves, 260 boards a shape). A pin, not a claim:
    // it moves if the composer, the bands or the idle rule move, and then it is re-measured.
    const measured = { RUN: 45.4, JOB: 63.1, JOB12: 67.3, VAULT: 53.1 };
    for (const [shape, pct] of Object.entries(measured)) {
      assert.ok(Math.abs(S4_CENSUS.byShape[shape].deepPct - pct) <= 2,
        `${shape}: DEEP ${S4_CENSUS.byShape[shape].deepPct.toFixed(1)} % against the pinned ${pct} % (±2)`);
    }
    assert.ok(Math.abs(S4_CENSUS.deepPct - 57.2) <= 2, `overall DEEP ${S4_CENSUS.deepPct.toFixed(1)} % against 57.2 % (±2)`);
  });
});

describe('J4 · S4 · 3 · the decision\'s input really is two-sided, and carries no measured parameter', () => {
  test('e_A / e_B crosses its own threshold: min < 1 and max > 2 on the dealt population', () => {
    const r = S4_CENSUS.ratios;
    assert.ok(r[0] < 1, `min e_A/e_B is ${r[0].toFixed(4)} — below 1, so the ratio genuinely goes the other way`);
    assert.ok(r[r.length - 1] > 2, `max e_A/e_B is ${r[r.length - 1].toFixed(4)} — above every band threshold`);
    assert.ok(r[r.length - 1] > Math.max(...Object.values(DEEP_THRESHOLDS)),
      'the ratio reaches past even the m85 threshold, so no band is decided in advance');
  });

  test('at equal bands the inequality IS the ratio test — and it is checked on real boards', () => {
    let checked = 0;
    for (const shapeId of Object.keys(SHAPES)) {
      for (let k = 0; k < S4_SAVES.length && checked < 400; k++) {
        if (capacityFor(S4_SAVES[k]) < 10) continue;
        const q = s4Board(k, shapeId);
        if (!q) continue;
        const d = buildDecisionOn(S4_SAVES[k], q, { shape: shapeId });
        if (!d || !d.sameBand) continue;
        checked++;
        assert.equal(d.deep, d.ratio > d.threshold,
          `${shapeId}/${k}: same band, so DEEP ⇔ e_A/e_B (${d.ratio.toFixed(3)}) > ${d.threshold.toFixed(4)}`);
      }
    }
    assert.ok(checked >= 100, `${checked} same-band boards checked — the reduction is not vacuous`);
  });

  test('L̄ and m̄ CANCEL: the decision is invariant under any positive scaling of both sides', () => {
    // The matrix's economy parameters multiply Δρ·e on BOTH sides of the inequality, so scaling them
    // cannot move the answer. Asserted numerically over the census, across nine decades — not by a
    // grep over the source, which would pass on a function that read them and then ignored them.
    let seen = 0;
    for (const shapeId of Object.keys(SHAPES)) {
      for (let k = 0; k < S4_SAVES.length && seen < 200; k++) {
        if (capacityFor(S4_SAVES[k]) < 10) continue;
        const q = s4Board(k, shapeId);
        if (!q) continue;
        const d = buildDecisionOn(S4_SAVES[k], q, { shape: shapeId });
        if (!d) continue;
        seen++;
        for (const K of [1e-9, 1e-3, 1, 7.25, 1e3, 1e9]) {
          assert.equal(d.lhs * K > d.rhs * K, d.deep, `${shapeId}/${k}: scaling by ${K} moved the decision`);
        }
      }
    }
    assert.ok(seen >= 200, `${seen} boards`);
    // and nothing measured is even reported: no key of the decision is one of the matrix's five
    const d = buildDecisionOn(S4_SAVES[0], s4Board(0, 'JOB') ?? [], { shape: 'JOB' });
    if (d) for (const k of MEASURED_KEYS) assert.ok(!(k in d), `the decision does not carry \`${k}\``);
  });

  test('the shape is a label, not a parameter: the same board decides the same way under every shape name', () => {
    // `buildDecisionOn` takes `shape` only to report it. A board is a board: if the shape name moved
    // the answer, a measured per-shape constant would have crept back in.
    let seen = 0;
    for (let k = 0; k < S4_SAVES.length && seen < 120; k++) {
      if (capacityFor(S4_SAVES[k]) < 10) continue;
      const q = s4Board(k, 'JOB');
      if (!q) continue;
      const base = buildDecisionOn(S4_SAVES[k], q, { shape: 'JOB' });
      if (!base) continue;
      seen++;
      for (const other of Object.keys(SHAPES)) {
        const d = buildDecisionOn(S4_SAVES[k], q, { shape: other });
        assert.equal(d.deep, base.deep, `save ${k}: the shape name changed the decision`);
        assert.equal(d.A, base.A); assert.equal(d.B, base.B);
        assert.equal(d.shape, other, 'and the shape is reported back');
      }
    }
    assert.ok(seen >= 100, `${seen} boards`);
  });

  test('a board with fewer than two served makes returns NULL — a forced rung is not a decision (G11)', () => {
    assert.equal(buildDecisionOn(randomSave(0), []), null, 'an empty board offers no decision');
    const q = s4Board(0, 'JOB') ?? [];
    const one = buildDecisionOn(randomSave(0), q, { of: [MAKES[0]] });
    assert.equal(one, null, 'one candidate make is one use for the point, so there is nothing to decide');
  });
});

/* ==========================================================================================
   S4 · 4 — the supply-gap pair is a CORPUS STATISTIC, not a fact (r3 MINOR, crew-alignment)
   §14 prints `study #1 pays ZERO 62 % · study #1 == best-paying make 15 %` on its own 150-board
   corpus and already bounds them rather than pinning them. A round-3 critic re-measured the same
   two quantities through the same shipped functions on their own seeds and got 36 % / 32 %;
   `crew.js`'s own docstring records a third run at 48 % / 21 %. Three corpora, three pairs. Pasting
   any ONE pair into COMPOSED-GAME.md as a fact would reinstate the defect align §6.3 removed for
   ρ(served). This section measures the pair over 24 RE-SEEDED corpora and asserts the RANGE, so the
   spread itself is the thing the suite guards and no single pair can be quoted as the measurement.
   ========================================================================================== */
describe('J4 · S4 · 4 · the supply gap over 24 re-seeded corpora: a range, never one pair', () => {
  const RESEEDS = 24;
  const PER = 80;
  const zero = []; const agree = [];
  /* VERIFY-3 finding 4 — THE POOL IS PART OF THE MEASUREMENT. The loop below calls
     `supplyGapFor(save, q)` with the DEFAULT `of`, all nineteen makes; the shipped surface calls it
     with `of: onBoard`, because that is the pool `screens/job.js crewBlock` hands `alignmentFor` and
     `alignmentFor` passes straight through. The published range was this arm's and the screen's
     numbers are not in it: on the same saves and the same queues the board pool reads 35.7 % / 27.0 %
     where the 19-make pool reads 62.3 % / 16.3 %. Both are measured now, on the same 24 re-seeds, so
     a document can no longer print one pair under the other's description. */
  const zeroOn = []; const agreeOn = [];
  for (let t = 0; t < RESEEDS; t++) {
    let z = 0; let a = 0; let n = 0; let zOn = 0; let aOn = 0;
    for (let k = 0; k < S4_SAVES.length && n < PER; k++) {
      const b = composeBundles(S4_SAVES[k], { now: NOW, page: S4_PAGES[k], shape: 'JOB', seed: `s4|reseed|${t}|${k}` });
      if (!b.bundles?.length) continue;
      const picks = b.bundles.slice(0, Math.max(1, b.draft)).map((x) => x.id);
      const q = draftUnion(b.bundles, picks).queue;
      if (!q?.length) continue;
      n++;
      const g = supplyGapFor(S4_SAVES[k], q);
      if (g.zeroPay) z++;
      if (g.agrees) a++;
      const onBoard = [...new Set(q.map((it) => makeOf(it)).filter(Boolean))];
      const gOn = supplyGapFor(S4_SAVES[k], q, { of: onBoard });
      if (gOn.zeroPay) zOn++;
      if (gOn.agrees) aOn++;
    }
    zero.push(z / n); agree.push(a / n);
    zeroOn.push(zOn / n); agreeOn.push(aOn / n);
  }
  const sorted = (xs) => [...xs].sort((a, b) => a - b);
  const Z = sorted(zero); const A = sorted(agree);
  const ZON = sorted(zeroOn); const AON = sorted(agreeOn);
  const pct = (v) => (v * 100).toFixed(1);

  test('every re-seeded corpus is a full corpus, and the measurement is deterministic', () => {
    assert.equal(zero.length, RESEEDS);
    assert.equal(agree.length, RESEEDS);
    for (const v of zero) assert.ok(v >= 0 && v <= 1);
    if (process.env.J4_PRINT) {
      console.log(`s4 reseed | ${RESEEDS} corpora x ${PER} JOB boards`
        + ` | zeroPay ${pct(Z[0])}-${pct(Z[RESEEDS - 1])} % (med ${pct(Z[RESEEDS >> 1])})`
        + ` | agrees ${pct(A[0])}-${pct(A[RESEEDS - 1])} % (med ${pct(A[RESEEDS >> 1])})`);
    }
  });

  test('THE MECHANISM REPRODUCES on every corpus: the study plan\'s first make often pays nothing', () => {
    // the direction is the finding, and it holds on all 24 draws
    for (let t = 0; t < RESEEDS; t++) {
      assert.ok(zero[t] > 0.30, `corpus ${t}: study #1 pays zero on only ${pct(zero[t])} % of boards`);
      assert.ok(agree[t] < 0.50, `corpus ${t}: the game's best make IS study #1 on ${pct(agree[t])} % of boards`);
    }
  });

  test('THE MAGNITUDE DOES NOT: the spread across corpora is too wide for any single pair to be a fact', () => {
    const zSpread = Z[RESEEDS - 1] - Z[0];
    const aSpread = A[RESEEDS - 1] - A[0];
    assert.ok(zSpread > 0.05,
      `zeroPay ranges ${pct(Z[0])}-${pct(Z[RESEEDS - 1])} % across corpora (${pct(zSpread)} points): publish the range`);
    assert.ok(aSpread > 0.05,
      `agrees ranges ${pct(A[0])}-${pct(A[RESEEDS - 1])} % across corpora (${pct(aSpread)} points): publish the range`);
    // Three pairs are on the record: 62/15 (§14's corpus), 48/21 (crew.js's docstring), 36/32 (the
    // r3 critic's own draw). All three obey the mechanism, and none of them is THE number.
    for (const [z, a, who] of [[0.62, 0.15, '§14'], [0.48, 0.21, 'crew.js docstring'], [0.36, 0.32, 'the r3 critic']]) {
      assert.ok(z > 0.30 && a < 0.50, `${who}'s pair (${(z * 100).toFixed(0)}/${(a * 100).toFixed(0)}) obeys the mechanism`);
    }
    // And the sharp half of the finding: re-seeding the BOARD does not reach the critic's 36/32, so
    // the disagreement between the three pairs is a SAVE-POPULATION difference, not a board draw.
    // If a future corpus change makes 36 % reachable by re-seeding alone, this fails and the note's
    // explanation of the three pairs has to be re-written.
    assert.ok(Z[0] > 0.36 || A[RESEEDS - 1] < 0.32,
      `24 board re-seeds span zeroPay ${pct(Z[0])}-${pct(Z[RESEEDS - 1])} % and agrees ${pct(A[0])}-${pct(A[RESEEDS - 1])} %:`
      + ' the critic\'s 36/32 is not a board-seed effect');
  });

  /* VERIFY-3 finding 4 — the SHIPPED call's own range. `screens/job.js` prints these two numbers off
     `alignmentFor(s, {shape, of: onBoard, queue}).gap`, i.e. `supplyGapFor(save, q, {of: onBoard})`,
     and no arm measured that pool. The document published the 19-make range under a sentence about
     "drafted JOB-10 boards", which is the board the student plays on and the pool they do NOT see. */
  test('THE POOL THE SCREEN USES is measured too, and it is a different pair', () => {
    if (process.env.J4_PRINT) {
      console.log(`s4 reseed | of:onBoard (the shipped call) | zeroPay ${pct(ZON[0])}-${pct(ZON[RESEEDS - 1])} % (med ${pct(ZON[RESEEDS >> 1])})`
        + ` | agrees ${pct(AON[0])}-${pct(AON[RESEEDS - 1])} % (med ${pct(AON[RESEEDS >> 1])})`);
    }
    assert.equal(zeroOn.length, RESEEDS);
    // the mechanism survives the pool change — the study plan's first make often pays nothing
    for (let t = 0; t < RESEEDS; t++) {
      assert.ok(zeroOn[t] > 0.15, `corpus ${t}: study #1 pays zero on ${pct(zeroOn[t])} % of boards under of:onBoard`);
      assert.ok(agreeOn[t] < 0.50, `corpus ${t}: the game's best make IS study #1 on ${pct(agreeOn[t])} % of boards`);
    }
    /* …and the MAGNITUDE does not: restricting the pool to the board's own makes moves both numbers
       in opposite directions, far outside the 19-make range this section's other arms assert. This
       is the assertion that stops the two ranges being quoted for one another. */
    assert.ok(ZON[RESEEDS - 1] < Z[0],
      `every of:onBoard corpus (max ${pct(ZON[RESEEDS - 1])} %) sits below every 19-make corpus (min ${pct(Z[0])} %) `
      + 'on zeroPay — if these have converged, the two pools are no longer distinguishable and the '
      + 'document may publish one range for both');
    const med = (xs) => xs[RESEEDS >> 1];
    assert.ok(med(AON) - med(A) > 0.05,
      `and agrees runs the other way by more than 5 points at the median: ${pct(med(AON))} % under of:onBoard `
      + `against ${pct(med(A))} % over the 19 makes (the two ranges do overlap, which is exactly why the `
      + 'pool has to be named beside every published pair rather than inferred from the sentence)');
  });
});

/* ==========================================================================================
   S4 · 5 — WHICH mastery field the decision reads, measured rather than assumed.
   Every pricing function in this file reads `rec.m` (`mOf`) — that is the field
   `readiness.weakSpots()` sorts by, and `tests/job-align.test.mjs:212` pins the choice ("a mismatch
   here would break ρ silently"). The LADDER, however, draws its rungs from `bandFor(mShown(rec))`
   (`simulateJob`, and §13's own harness). The two fields differ on a make with misses or hints, so
   the decision and the payout can sit in different bands. `buildDecisionOn` keeps the file's
   convention — but the size of the disagreement is a measurement, not a preference, so it is
   measured here and recorded in notes/repair-crew.md instead of being left to a future reader.
   ========================================================================================== */
describe('J4 · S4 · 5 · rec.m vs m_shown: the decision\'s band choice, measured', () => {
  /** The same inequality, read off `m_shown` — the field the rung draw actually uses. */
  function decideOnShown(save, queue, of = MAKES) {
    const rows = of.filter(isMake)
      .map((make, i) => {
        const e = encountersIn(queue, make).active;
        const m = mShown(save?.skills?.[make]);
        return { make, i, e, first: dRhoTrue(m, STEADY) * e, marginal: (dRhoTrue(m, HELD) - dRhoTrue(m, STEADY)) * e };
      })
      .filter((r) => r.e > 0)
      .sort((a, b) => (b.first - a.first) || (a.i - b.i));
    if (rows.length < 2) return null;
    return { deep: rows[0].marginal > rows[1].first, A: rows[0].make };
  }

  test('the two fields are genuinely different on this population (otherwise this test is vacuous)', () => {
    let differ = 0; let total = 0;
    for (const s of S4_SAVES.slice(0, 200)) {
      for (const id of MAKES) {
        if (!s.skills?.[id]) continue;
        total++;
        if (Math.abs(mOf(s, id) - mShown(s.skills[id])) > 1e-9) differ++;
      }
    }
    assert.ok(differ > total * 0.2, `${differ} of ${total} (make, save) pairs have m != m_shown`);
  });

  test('THE MEASUREMENT: how often the band choice moves the DEEP/SPREAD answer', () => {
    let moved = 0; let movedTop = 0; let boards = 0;
    for (const shapeId of Object.keys(SHAPES)) {
      for (let k = 0; k < S4_SAVES.length && boards < 600; k++) {
        if (capacityFor(S4_SAVES[k]) < 10) continue;
        const q = s4Board(k, shapeId);
        if (!q) continue;
        const a = buildDecisionOn(S4_SAVES[k], q, { shape: shapeId });
        const b = decideOnShown(S4_SAVES[k], q);
        if (!a || !b) continue;
        boards++;
        if (a.deep !== b.deep) moved++;
        if (a.A !== b.A) movedTop++;
      }
    }
    const share = moved / boards;
    if (process.env.J4_PRINT) {
      console.log(`s4 field | boards ${boards} | rec.m vs m_shown: DEEP/SPREAD differs on ${moved}`
        + ` (${(share * 100).toFixed(1)} %), the top make differs on ${movedTop} (${(100 * movedTop / boards).toFixed(1)} %)`);
    }
    assert.ok(boards >= 500, `${boards} boards`);
    // A measurement with a bound in the direction it went, so a change to either field is visible.
    // It is NOT a claim that the two are interchangeable: they are not, and the note says so.
    assert.ok(share < 0.5, `the band choice moves the answer on ${(share * 100).toFixed(1)} % of boards`);
    assert.ok(movedTop > 0,
      'if the two fields now pick the same top make on every board, mastery.mShown has changed and '
      + 'crew.js\'s `rec.m` convention (job-align.test.mjs:212) should be re-read');
  });
});

/* ==========================================================================================
   16. VERIFY ROUND 2 — the four-condition "domain" is the claim, and the clamp has two ends
   ==========================================================================================

   Three findings from the verify-2 crew critic, each pinned here so none of them can come back as
   prose. All three are about the SAME habit: publishing a measurement as a theorem.

   · **finding 1 (BLOCKER).** G3.8 published *"the strong claim holds only on
     `alignmentFor(save, {shape, queue}).domain.all`, … a conjunction of FOUR conditions"*. Two of
     the four (`rank`, `supply`) are the conclusion restated — both are argmax comparisons over the
     same `steadyValueOn` with the same `of`-index tie-break — and the other two (`evidence`,
     `band`) never enter the board path, because board prices read `encountersIn(...).active` and
     `dRhoTrue`, not `n` and not `dRhoModel`. So the conjunction certifies nothing AND it is false
     in the other direction too: the claim is true on a quarter of drafted boards, `domain.all` on
     none of them. `alignmentFor().claim` computes the conclusion; the arms below measure the
     equivalence and the inertness rather than asserting them.
   · **finding 4 (MAJOR).** Condition 3 was published as a supply COUNT ("the board serves the
     study plan's first make more than once") while the code computes an argmax comparison. The two
     predicates disagree on about one board in six, and the count wording is what made the
     conjunction look like a set of hypotheses.
   · **finding 6 (MAJOR).** `bandFor` clamps at BOTH ends; `domain.band` only saw the floor. The
     hand-built save below has every make strictly above `BAND_FLOOR`, so the floor-only condition
     read TRUE, while the grid priced a fully mastered w-9 make at exactly 0.0000 against the
     0.9150 the shipped bands pay for a first rung on it — `domain.band` and `bandAgrees`, the
     module's own two band quantities, contradicting each other on one save.
   · **finding 7 (MAJOR).** 87.3 % / 38.3 % were published as bolded facts. They are one save
     population's numbers; §16.4 measures both over sixteen independently seeded corpora from two
     generator families and asserts the BOUNDS and the SPREAD instead. */

/** The drafted JOB-10 corpus these arms measure on: the shipped composer, the shipped draft. */
const V2_BOARDS = (() => {
  const out = [];
  for (let k = 0; k < S4_SAVES.length && out.length < 300; k++) {
    const q = s4Board(k, 'JOB');
    if (!q) continue;
    const onBoard = [...new Set(q.map((t) => makeOf(t)).filter(Boolean))];
    if (!onBoard.length) continue;
    out.push({ k, save: S4_SAVES[k], queue: q, onBoard });
  }
  return out;
})();

/* `alignmentFor` with a queue runs `measuredParamsOn` — 1 024 lattice points, ~6 ms a board — so the
   corpus is aligned ONCE and every arm below reads the same list. (Five arms × 300 boards of
   re-alignment cost this file 20 s before the cache.) */
const V2_ALIGN = V2_BOARDS.map((b) => alignmentFor(b.save, { shape: 'JOB', of: b.onBoard, queue: b.queue }));

describe('J4 · 16 · verify-2: `domain.rank && domain.supply` IS the claim, not a domain for it', () => {
  test('the corpus is the drafted path, and both conditions are live on it', () => {
    assert.ok(V2_BOARDS.length >= 250, `${V2_BOARDS.length} drafted JOB-10 boards`);
    const n = { rank: 0, supply: 0 };
    for (const a of V2_ALIGN) {
      if (a.domain.rank) n.rank++;
      if (a.domain.supply) n.supply++;
    }
    assert.ok(n.supply > 0 && n.supply < V2_BOARDS.length, `supply is two-sided: ${n.supply}/${V2_BOARDS.length}`);
    assert.ok(n.rank > 0, `rank holds somewhere: ${n.rank}/${V2_BOARDS.length}`);
  });

  test('THE EQUIVALENCE: the conclusion and `rank && supply` are the same set, board for board', () => {
    let claim = 0; let both = 0; let same = 0;
    for (const [i, b] of V2_BOARDS.entries()) {
      const a = V2_ALIGN[i];
      // the conclusion, read off the shipped option list rather than off `domain`
      const top = crewOrder(b.save, { shape: 'JOB', of: b.onBoard })[0];
      const conclusion = !!a.best && a.best.rank === STEADY && a.best.make === top;
      const conditions = a.domain.rank && a.domain.supply === true;
      assert.equal(a.claim, conclusion, `board ${b.k}: alignmentFor().claim is not the conclusion`);
      assert.equal(a.claimIsConditions, conclusion === conditions, `board ${b.k}: claimIsConditions`);
      if (conclusion) claim++;
      if (conditions) both++;
      if (conclusion === conditions) same++;
    }
    assert.equal(same, V2_BOARDS.length,
      `the conclusion and conditions 2 ∧ 3 disagree on ${V2_BOARDS.length - same} boards — if this ever `
      + 'becomes non-zero the two are no longer the same statement and the finding needs re-deriving');
    assert.equal(claim, both, 'the two sets have the same size because they are the same set');
    assert.ok(claim > 0, 'and the claim is true somewhere, or the arm above is vacuous');
    if (process.env.J4_PRINT) {
      console.log(`v2 claim | ${V2_BOARDS.length} boards | claim ${(100 * claim / V2_BOARDS.length).toFixed(1)} %`
        + ` | rank ∧ supply ${(100 * both / V2_BOARDS.length).toFixed(1)} % | identical on ${same}`);
    }
  });

  test('THE FALSE DIRECTION: the claim holds on boards where `domain.all` is FALSE — "only on" is wrong', () => {
    let claim = 0; let all = 0; let claimOffDomain = 0;
    for (const a of V2_ALIGN) {
      if (a.claim) claim++;
      if (a.domain.all) all++;
      if (a.claim && !a.domain.all) claimOffDomain++;
    }
    assert.ok(claim / V2_BOARDS.length > 0.15,
      `the claim is true on ${claim}/${V2_BOARDS.length} drafted boards — it is not a limit case`);
    assert.ok(claimOffDomain > 0.9 * claim,
      `${claimOffDomain} of the ${claim} boards where the claim holds are OUTSIDE domain.all, so `
      + '"holds only on domain.all" is false as published (COMPOSED-GAME.md G3.8)');
    assert.ok(claimOffDomain > 0.15 * V2_BOARDS.length,
      'and it is false on a quarter of the corpus, not on a handful of boards');
    assert.ok(all / V2_BOARDS.length < 0.02,
      `domain.all is reached on ${all}/${V2_BOARDS.length} boards: the conjunction is nearly empty on drafted play`);
  });

  /* VERIFY-3 finding 2. The direction above ("the claim holds off the domain") was asserted; the
     OTHER direction was only ever stated, in this module's docstring and in COMPOSED-GAME.md G3.8,
     as *"on every one of which `domain.all` is false"* — and it is refuted by this corpus. It could
     not have been true: `domain.all` is `evidence ∧ rank ∧ band ∧ supply`, and `rank ∧ supply` IS
     the claim (the arm above measures that equivalence at 300/300), so `domain.all ⟹ claim` is
     arithmetic. A non-zero `domain.all` rate therefore FORCES a non-empty intersection, and the
     sentence contradicted the 1.0 % printed two lines below it in the same paragraph. Asserted here
     in the strong form — no board is certified where the claim is false — plus the two rates, so a
     "shrinks the certified set to none" can never be written back. */
  test('THE OTHER DIRECTION, and it is arithmetic: every board `domain.all` certifies is one the claim holds on', () => {
    let all = 0; let claim = 0; let both = 0; let certifiedAndFalse = 0;
    for (const [i, a] of V2_ALIGN.entries()) {
      if (a.claim) claim++;
      if (a.domain.all) all++;
      if (a.domain.all && a.claim) both++;
      if (a.domain.all && !a.claim) {
        certifiedAndFalse++;
        assert.fail(`board ${V2_BOARDS[i].k}: domain.all certified a board the claim is FALSE on — `
          + 'the conjunction contains `rank ∧ supply`, which IS the claim, so this cannot happen');
      }
    }
    assert.equal(certifiedAndFalse, 0);
    assert.equal(both, all,
      `${all} boards reach domain.all and ${both} of them are boards the claim holds on — these must be equal`);
    assert.ok(all > 0,
      `domain.all is reached on ${all}/${V2_BOARDS.length} boards — if it is now truly empty this arm proves `
      + 'nothing, and the published rate has to be re-measured rather than rounded to zero');
    assert.ok(all < 0.02 * V2_BOARDS.length && claim > 0.15 * V2_BOARDS.length,
      `the four-condition form shrinks the certified set from ${claim}/${V2_BOARDS.length} to ${all}/${V2_BOARDS.length} `
      + '— to under one percent, NOT to none, and without changing the answer on any board in it');
    if (process.env.J4_PRINT) {
      console.log(`v3 certify | ${V2_BOARDS.length} boards | claim ${claim} (${(100 * claim / V2_BOARDS.length).toFixed(1)} %)`
        + ` | domain.all ${all} (${(100 * all / V2_BOARDS.length).toFixed(1)} %) | claim ∧ domain.all ${both}`);
    }
  });

  test('THE INERT HALF: conditions 1 and 4 cannot move the claim, because the board path never reads them', () => {
    /* Condition 1 is about `n`. Board prices run through `encountersIn(queue, make).active` and
       `dRhoTrue(rec.m)`; neither reads `n`. So lifting every make to full evidence depth must flip
       `domain.evidence` and leave `claim` exactly where it was — on every board. */
    let flipped = 0; let moved = 0; let seen = 0;
    // 120 of the 300 — the mutated half cannot be cached, and one re-alignment is ~6 ms a board
    for (const [i, b] of V2_BOARDS.slice(0, 120).entries()) {
      const before = V2_ALIGN[i];
      const deep = { ...b.save, skills: { ...b.save.skills } };
      for (const mk of MAKES) deep.skills[mk] = { ...(deep.skills[mk] ?? { m: 0 }), n: 9 };
      const after = alignmentFor(deep, { shape: 'JOB', of: b.onBoard, queue: b.queue });
      assert.equal(after.domain.evidence, true, `board ${b.k}: every make is at n = 9`);
      seen++;
      if (before.domain.evidence === false) flipped++;
      if (before.claim !== after.claim) moved++;
    }
    assert.ok(flipped > seen * 0.5,
      `condition 1 was false on only ${flipped} of ${seen} boards — the mutation has to flip it to prove anything`);
    assert.equal(moved, 0,
      `flipping condition 1 changed the claim on ${moved} boards; it must change it on none, because `
      + 'the board path prices from supply and the shipped bands and reads `n` nowhere');
  });

  test('…and the same for condition 4: the claim is true on boards where the band condition fails', () => {
    let claimClamped = 0; let claim = 0;
    for (const a of V2_ALIGN) {
      if (a.claim) claim++;
      if (a.claim && a.domain.band === false) claimClamped++;
    }
    assert.ok(claimClamped > 0.5 * claim,
      `the claim holds with condition 4 FAILING on ${claimClamped} of the ${claim} boards it holds on`);
  });

  test('the model path reports the claim as UNKNOWN rather than guessing it', () => {
    const a = alignmentFor(randomSave(3), { shape: 'JOB' });
    assert.equal(a.claim, null, 'without a queue there is no "pays most on this board" to compare');
    assert.equal(a.claimIsConditions, null);
    assert.equal(a.domain.supply, null, 'and supply is unknown, exactly as before');
  });
});

describe('J4 · 16 · verify-2 finding 4: condition 3 is an ARGMAX, and the count is a different predicate', () => {
  test('`gap.agrees` and "served more than once" disagree on a real fraction of boards', () => {
    let doc = 0; let code = 0; let differ = 0;
    for (const b of V2_BOARDS) {
      const g = supplyGapFor(b.save, b.queue, { shape: 'JOB', of: b.onBoard });
      const asPublished = g.studySupply > 1;        // "the board serves the study plan's first make more than once"
      const asComputed = g.agrees;                  // what crew.js actually evaluates
      if (asPublished) doc++;
      if (asComputed) code++;
      if (asPublished !== asComputed) differ++;
    }
    assert.ok(differ > 0.05 * V2_BOARDS.length,
      `the published description and the computed condition differ on ${differ}/${V2_BOARDS.length} boards`);
    assert.notEqual(doc, code, 'and they do not even have the same rate');
    if (process.env.J4_PRINT) {
      const pc = (x) => `${(100 * x / V2_BOARDS.length).toFixed(1)} %`;
      console.log(`v2 cond3 | served>1 ${pc(doc)} | agrees ${pc(code)} | differ ${pc(differ)}`);
    }
  });

  test('and the argmax reading is the one the code computes, by construction', () => {
    for (const b of V2_BOARDS.slice(0, 60)) {
      const g = supplyGapFor(b.save, b.queue, { shape: 'JOB', of: b.onBoard });
      const best = crewOrderOn(b.save, b.queue, { shape: 'JOB', of: b.onBoard })[0];
      assert.equal(g.agrees, g.studyTop === best,
        `board ${b.k}: agrees is "the board's best-paying first rung is the study plan's first make"`);
    }
  });
});

describe('J4 · 16 · verify-2 finding 6: `bandFor` clamps at BOTH ends and the condition now says so', () => {
  test('BAND_CEIL is the highest published band, and dRhoTrue is flat at or above it', () => {
    assert.equal(BAND_CEIL, Math.max(...Object.keys(RUNG_BANDS).map(Number)));
    assert.equal(BAND_CEIL, 85, 'data/job.js publishes bands at 85 / 60 / 40 and nothing over 85');
    const ceil = dRhoTrue(BAND_CEIL, STEADY);
    for (let m = BAND_CEIL; m <= 100; m++) {
      close(dRhoTrue(m, STEADY), ceil, 1e-12, `dRhoTrue(${m}) is the m85 band, flat`);
      assert.equal(isBandCeiled(m), true);
      assert.deepEqual(bandFor(m), RUNG_BANDS[BAND_CEIL], `band(${m})`);
    }
    assert.equal(isBandCeiled(BAND_CEIL - 1), false, 'and m 84 is a live point, not the clamp');
    assert.ok(dRhoTrue(BAND_CEIL - 1, STEADY) > ceil, 'the true value falls INTO the clamp from below');
  });

  test('the model error above the floor is not small, and at m = 100 it is total', () => {
    // the linear model keeps falling where the shipped band is flat: −58.6 % at m 95, −100 % at m 100
    assert.ok(dRhoModel(100) === 0, 'crewValue prices a fully mastered make at exactly 0…');
    assert.ok(dRhoTrue(100, STEADY) > 0.03, '…while the shipped bands still pay 0.0325 for a first rung on it');
    assert.ok(dRhoModelError(95) < -0.5, `the model is ${(100 * dRhoModelError(95)).toFixed(1)} % low at m 95`);
    assert.ok(dRhoModelError(85) > 0.2, `and ${(100 * dRhoModelError(85)).toFixed(1)} % HIGH at m 85 — it crosses`);
    assert.equal(isBandClamped(100), true);
    assert.equal(isBandClamped(40), true);
    assert.equal(isBandClamped(60), false, 'and a make in the live middle is clamped at neither end');
  });

  /** The verify-2 critic's save: every make strictly above BAND_FLOOR, one of them fully mastered. */
  function topClampCounterexample() {
    const s = saveAt(14, 4);
    for (const id of MAKES) withSkill(s, id, { m: 95, n: 6 });
    withSkill(s, 'CS-LIN', { m: 100, n: 6 });      // the heaviest make in the table, w 9, fully mastered
    withSkill(s, 'QUAD-CTX', { m: 60, n: 6 });     // w 2, the only make in the live middle
    return s;
  }

  test('THE COUNTEREXAMPLE: every make above the FLOOR, and the grid still prices the payoff backwards', () => {
    const s = topClampCounterexample();
    for (const id of MAKES) assert.ok(mOf(s, id) > BAND_FLOOR, `${id} is strictly above the floor`);
    const a = alignmentFor(s, { shape: 'JOB' });
    assert.deepEqual(a.bandFloored, [], 'so a FLOOR-ONLY condition sees nothing wrong…');
    assert.equal(a.domain.evidence, true, 'evidence passes');
    assert.equal(a.domain.rank, true, 'and so does rank');

    // …and here is what it cannot see
    assert.equal(crewValue(s, 'CS-LIN', 'JOB'), 0, 'the grid prices the heaviest make at exactly 0.0000');
    assert.ok(steadyValueTrue(s, 'CS-LIN', 'JOB') > steadyValueTrue(s, 'QUAD-CTX', 'JOB'),
      'while the shipped bands pay MORE for a point there than on the make the grid puts first');
    assert.equal(crewOrder(s, { shape: 'JOB' })[0], 'QUAD-CTX', 'the grid\'s first row…');
    assert.equal(crewOrderTrue(s, { shape: 'JOB' })[0], 'CS-LIN', '…is not what the bands pay for');
    assert.equal(a.bandAgrees, false);

    // THE FIX: the two-ended condition sees it, so the module's two band quantities agree again
    assert.deepEqual(a.bandCeiled.includes('CS-LIN'), true, 'the mastered make is in the top clamp');
    assert.equal(a.domain.band, false, 'and the band condition now fails on this save…');
    assert.equal(a.domain.all, false, '…so domain.all no longer certifies a save the bands contradict');
  });

  test('the two-ended condition is strictly narrower than the floor-only one, on the drafted corpus', () => {
    let floorOnly = 0; let both = 0;
    for (const [i, b] of V2_BOARDS.entries()) {
      const a = V2_ALIGN[i];
      if (a.bandFloored.length === 0) floorOnly++;
      if (a.domain.band) both++;
      assert.ok(a.bandClamped.length >= a.bandFloored.length, `board ${b.k}: clamped ⊇ floored`);
      for (const mk of a.bandCeiled) assert.ok(mOf(b.save, mk) >= BAND_CEIL, `${mk} really is at the ceiling`);
    }
    assert.ok(both < floorOnly,
      `the floor-only condition passed on ${floorOnly} boards and the two-ended one on ${both}: `
      + 'if these are ever equal the corpus has stopped containing mastered makes');
  });
});

describe('J4 · 16 · verify-2 finding 7: 87.3 % / 38.3 % are a POPULATION\'s numbers, so publish the range', () => {
  const PER = 150;
  const CORPORA = 12;
  /** The r7-family generator this file ships, re-seeded. */
  const familySave = (tag) => (i) => {
    const R = mulberry32(cyrb53(`${tag}|${i}`) >>> 0);
    const rng = () => R.next();
    const s = fresh(NOW - (10 + Math.floor(rng() * 40)) * DAY_MS);
    const u = 0.3 + 0.7 * rng();
    for (const id of SKILL_IDS) {
      if (rng() < 0.10) continue;
      const m = Math.max(0, Math.min(100, Math.round(100 * u * (0.55 + 0.6 * rng()))));
      const n = 2 + Math.floor(rng() * 7);
      s.skills[id] = { m, n, lastAt: NOW - Math.floor(rng() * 10) * DAY_MS, misses: 0, helped: 0 };
      if (m >= 85 && n >= 3 && rng() < 0.8) s.skills[id].lastDueCorrectAt = NOW - DAY_MS;
    }
    return s;
  };
  /** A DIFFERENT family: `m` drawn uniformly on [0, 100] — job-align.test.mjs §1's population. */
  const uniformSave = (tag) => (i) => {
    const R = mulberry32(cyrb53(`${tag}|${i}`) >>> 0);
    const s = fresh(NOW - 20 * DAY_MS);
    for (const id of SKILL_IDS) {
      if (R.next() < 0.08) continue;
      const m = Math.round(R.next() * 100);
      const n = 1 + Math.floor(R.next() * 8);
      s.skills[id] = { m, n, lastAt: NOW - Math.floor(R.next() * 10) * DAY_MS, misses: 0, helped: 0 };
      if (m >= 85 && n >= 3 && R.next() < 0.8) s.skills[id].lastDueCorrectAt = NOW - DAY_MS;
    }
    return s;
  };
  const argmaxOf = (xs) => xs.reduce((best, v, i) => (v > xs[best] ? i : best), 0);
  function ratesOf(make) {
    let dis = 0; let top = 0;
    for (let i = 0; i < PER; i++) {
      const s = make(i);
      const g = SKILL_IDS.map((id) => crewValue(s, id, 'JOB'));
      const r = SKILL_IDS.map((id) => readinessGradient(s, id, 'JOB'));
      if (argmaxOf(g) !== argmaxOf(r)) dis++;
      if (crewOrder(s, { shape: 'JOB' })[0] !== crewOrderTrue(s, { shape: 'JOB' })[0]) top++;
    }
    return [dis / PER, top / PER];
  }
  const RUNS = [];
  for (let t = 0; t < CORPORA; t++) RUNS.push(['r7-family', ...ratesOf(familySave(`v2|fam|${t}`))]);
  for (let t = 0; t < CORPORA; t++) RUNS.push(['uniform-m', ...ratesOf(uniformSave(`v2|unif|${t}`))]);
  const EV = RUNS.map((r) => r[1]);
  const TOP = RUNS.map((r) => r[2]);
  const pct = (v) => `${(100 * v).toFixed(1)} %`;

  test('THE MECHANISM REPRODUCES: both disagreements clear the bounds the suite asserts, on every corpus', () => {
    assert.equal(RUNS.length, 2 * CORPORA);
    for (const [fam, ev, top] of RUNS) {
      assert.ok(ev > 0.50, `${fam}: the evidence-term argmax disagreement is ${pct(ev)}, under the asserted 50 %`);
      assert.ok(top > 0.20, `${fam}: the band top-make disagreement is ${pct(top)}, under the asserted 20 %`);
    }
    if (process.env.J4_PRINT) {
      console.log(`v2 rates | ${RUNS.length} corpora x ${PER} saves`
        + ` | evidence ${pct(Math.min(...EV))}-${pct(Math.max(...EV))}`
        + ` | band-top ${pct(Math.min(...TOP))}-${pct(Math.max(...TOP))}`);
    }
  });

  test('THE MAGNITUDE DOES NOT: the spread is far too wide for 87.3 / 38.3 to be published as facts', () => {
    const evSpread = Math.max(...EV) - Math.min(...EV);
    const topSpread = Math.max(...TOP) - Math.min(...TOP);
    assert.ok(evSpread > 0.15,
      `the evidence rate ranges ${pct(Math.min(...EV))}-${pct(Math.max(...EV))} across corpora `
      + `(${(100 * evSpread).toFixed(1)} points) — publish the bound and the range, never the point estimate`);
    assert.ok(topSpread > 0.05,
      `the band rate ranges ${pct(Math.min(...TOP))}-${pct(Math.max(...TOP))} (${(100 * topSpread).toFixed(1)} points)`);
    // the two pairs on the record — this suite's 87.3/38.3 and the verify-2 critic's 63.3/46.0 —
    // both obey the bounds, and neither is inside the other's corpus range on both coordinates
    for (const [ev, top, who] of [[0.873, 0.383, 'the suite'], [0.633, 0.460, 'the verify-2 critic']]) {
      assert.ok(ev > 0.5 && top > 0.2, `${who}'s pair obeys both asserted bounds`);
    }
    assert.ok(Math.min(...EV) < 0.70 && Math.max(...EV) > 0.80,
      'both published pairs are inside the measured range, which is why the range is what gets published');
  });
});

/* ==========================================================================================
   J4 · 17 — VERIFY ROUND 3. Two defects at the one surface a crew point can be spent on.

   · **finding 3 (MAJOR).** `alignmentFor().best` / `.steady` / `.steadyThreshold` / `.claim` were
     read off a list that prices a STEADY on EVERY make in the pool, with no reference to
     `save.game.crew`. `game.crew` persists across jobs, so from evening two onward the brief's one
     sentence benchmarked the night against a purchase the student could not make: over 200 drafted
     JOB-10 boards with the top k makes of the study order manned, `best` was a rung already owned
     on 70.5 % of boards at k = 3 and 97.5 % at k = 6, and `claim` read 25.5 % at EVERY k — the
     decision surface was byte-identically blind to the build. `nextOnly` (default) reads every
     decision field off `buyable`, the rungs above `effectiveRankOf`.
   · **finding 6 (MAJOR).** The supply line and the price column under it were two regimes with one
     word. `gap` came from `supplyGapFor(save, q, {shape})` — `matrixParamsFor('JOB')`, the published
     row — while the rows were priced at `measuredParamsOn`, so a rendered brief printed "a point on
     NOTE pays 1.92" above a row reading "· pays 1.42" for that same make. `gap` is priced at
     `params` now; because `lootMean · m̄` is a positive constant common to every make, that moves
     the magnitudes and nothing else.

   THE CONTROL THESE ARMS NEED. Every corpus in this file is built from `randomSave`, which never
   writes `game.crew`, so `buyable === options` on all of it and NO published rate moves. That is
   asserted below as well — it is the reason §6.2, §16 and G3.8's 27 % survive the change, and the
   reason each of them is now published as a statistic about a student who has spent nothing.
   ========================================================================================== */
describe('J4 · 17 · verify-3 finding 3: the decision prices the NEXT point, not the one you own', () => {
  /** The same board, with the top `k` makes of the study order manned at STEADY. */
  function withBuild(b, k) {
    if (!k) return b.save;
    const order = crewOrder(b.save, { shape: 'JOB', of: b.onBoard }).slice(0, k);
    return withCrew(b.save, Object.fromEntries(order.map((m) => [m, STEADY])));
  }

  test('on an EMPTY build nothing moves: `buyable` is `options` and every field is the old one', () => {
    let checked = 0;
    for (const [i, b] of V2_BOARDS.slice(0, 60).entries()) {
      const a = V2_ALIGN[i];
      assert.equal(mannedCount(crewOf(b.save)), 0, `board ${b.k}: the corpus is supposed to carry no build`);
      assert.deepEqual(a.buyable, a.options, `board ${b.k}: the two lists differ on an empty build`);
      assert.equal(a.claim, a.boardClaim, `board ${b.k}: the decision claim and the board claim differ on an empty build`);
      assert.equal(a.nothingToBuy, false);
      assert.equal(a.noFirstRung, false);
      // and the explicit ownership-blind call returns the same decision, field for field
      const blind = alignmentFor(b.save, { shape: 'JOB', of: b.onBoard, queue: b.queue, nextOnly: false });
      assert.deepEqual(blind.best, a.best, `board ${b.k}: nextOnly changed \`best\` on a save that owns nothing`);
      assert.equal(blind.claim, a.claim);
      assert.equal(blind.steadyThreshold, a.steadyThreshold);
      assert.equal(blind.threshold, a.threshold);
      assert.deepEqual(blind.domain, a.domain);
      checked++;
    }
    assert.ok(checked >= 50, `only ${checked} boards checked`);
  });

  test('a rung this save already holds is never the recommendation, at any build size', () => {
    const owned = {};
    for (const k of [0, 3, 6]) {
      let ownedBest = 0; let seen = 0; let noneLeft = 0;
      for (const b of V2_BOARDS.slice(0, 80)) {
        const sv = withBuild(b, k);
        const a = alignmentFor(sv, { shape: 'JOB', of: b.onBoard, queue: b.queue });
        seen++;
        if (a.nothingToBuy) { noneLeft++; assert.equal(a.best, null, `board ${b.k}: nothingToBuy with a best point`); continue; }
        assert.ok(a.best, `board ${b.k}: a buyable board with no best point`);
        assert.ok(a.best.rank > effectiveRankOf(sv, a.best.make),
          `board ${b.k} at k=${k}: the recommendation is ${a.best.make} ${a.best.name}, which this save already holds`);
        if (a.steady) {
          assert.ok(a.steady.rank > effectiveRankOf(sv, a.steady.make),
            `board ${b.k} at k=${k}: the printed "best STEADY point" is already owned`);
        }
        for (const o of a.buyable) {
          assert.ok(o.rank > effectiveRankOf(sv, o.make), `board ${b.k}: an owned rung survived the filter`);
        }
        if (a.best.rank <= effectiveRankOf(sv, a.best.make)) ownedBest++;
      }
      owned[k] = { seen, ownedBest, noneLeft };
      assert.equal(ownedBest, 0, `k=${k}: ${ownedBest} boards recommended a rung the save already holds`);
    }
    /* …and the CONTROL: on the unfixed list the same builds made `best` an owned rung on most
       boards. Without this the arm above passes on a corpus where no build was ever applied. */
    let blindOwned = 0; let blindSeen = 0;
    for (const b of V2_BOARDS.slice(0, 80)) {
      const sv = withBuild(b, 3);
      const blind = alignmentFor(sv, { shape: 'JOB', of: b.onBoard, queue: b.queue, nextOnly: false });
      blindSeen++;
      if (blind.best && blind.best.rank <= effectiveRankOf(sv, blind.best.make)) blindOwned++;
    }
    assert.ok(blindOwned > 0.4 * blindSeen,
      `the ownership-blind list recommended an owned rung on only ${blindOwned}/${blindSeen} boards at k = 3 — `
      + 'the build this arm applies is not big enough to prove anything');
    if (process.env.J4_PRINT) {
      console.log(`v3 nextpoint | ${blindSeen} boards | blind best-already-owned at k=3: ${blindOwned}`
        + ` | nextOnly: 0 at k=0/3/6 | nothing left to buy: ${owned[0].noneLeft}/${owned[3].noneLeft}/${owned[6].noneLeft}`);
    }
  });

  test('the claim is a LIVE statement about tonight: it moves with the build, and the board claim does not', () => {
    const claims = [];
    const boardClaims = [];
    for (const k of [0, 3, 6]) {
      let c = 0; let bc = 0; let n = 0;
      for (const b of V2_BOARDS.slice(0, 80)) {
        const sv = withBuild(b, k);
        const a = alignmentFor(sv, { shape: 'JOB', of: b.onBoard, queue: b.queue });
        n++;
        if (a.claim) c++;
        if (a.boardClaim) bc++;
      }
      claims.push(c / n); boardClaims.push(bc / n);
    }
    assert.ok(Math.max(...claims) - Math.min(...claims) > 0.05,
      `the claim read ${claims.map((v) => (100 * v).toFixed(1)).join(' / ')} % at k = 0/3/6 — if it does not move `
      + 'with the build it is still being computed off a list that cannot see one');
    // the ownership-blind statement is about the BOARD, so a build must not move it at all
    assert.equal(new Set(boardClaims).size, 1,
      `boardClaim read ${boardClaims.map((v) => (100 * v).toFixed(1)).join(' / ')} % — it is ownership-blind by construction`);
  });

  /* The half of finding 3 that is NOT in this file, reported from it. `canAllocate` must keep
     saying YES to `to <= from` — a downgrade frees points and is the repair path out of an illegal
     save, and `to === from` is the press that applies a pending G4 demotion — so the no-op cannot be
     closed by refusing it here. What this file can do is stop the caller having to re-derive it:
     `raises` and `same` are now reported before the write, beside the `changed` `allocate` has
     always reported after it. notes/repair-crew.md → Requests R11 is the caller's half. */
  test('a no-op press is legal and SAYS SO: `same` before the write, `changed` after it', () => {
    const b = V2_BOARDS[0];
    const make = crewOrder(b.save, { shape: 'JOB', of: b.onBoard })[0];
    const sv = withCrew(b.save, { [make]: STEADY });
    const again = canAllocate(sv, make, STEADY);
    assert.equal(again.ok, true, 'a non-raising move stays legal — a downgrade must never be refused');
    assert.equal(again.same, true, 'and it is reported as the no-op it is');
    assert.equal(again.raises, false);
    assert.equal(allocate(sv, make, STEADY).changed, false, 'the write agrees: nothing was bought');
    // …while a real purchase reports the other way, on the same save
    const bare = b.onBoard.find((mk) => effectiveRankOf(sv, mk) === BARE);
    if (bare) {
      const buy = canAllocate(sv, bare, STEADY);
      assert.equal(buy.same, false);
      assert.equal(buy.raises, buy.ok, 'a legal raise is a raise; an illegal one is refused, not silently a no-op');
    }
    // and a downgrade is a change, which is why `same` and not `ok` is the field a window should gate on
    const down = canAllocate(sv, make, BARE);
    assert.equal(down.ok, true);
    assert.equal(down.same, false);
    assert.equal(allocate(sv, make, BARE).changed, true);
  });

  test('`claim ⇔ rank ∧ supply` survives the split, because the gap is computed over the same pool', () => {
    let seen = 0; let mismatch = 0;
    for (const k of [0, 3, 6]) {
      for (const b of V2_BOARDS.slice(0, 80)) {
        const sv = withBuild(b, k);
        const a = alignmentFor(sv, { shape: 'JOB', of: b.onBoard, queue: b.queue });
        seen++;
        if (!a.claimIsConditions) mismatch++;
        for (const mk of a.steadyPool) {
          assert.ok(effectiveRankOf(sv, mk) < STEADY,
            `board ${b.k}: ${mk} is in steadyPool with a first rung already bought`);
        }
      }
    }
    assert.ok(seen >= 200, `${seen} board/build pairs`);
    /* A tie can separate the two (`boardOptionsOn` breaks ties by `of`-index, `supplyGapFor` by
       first-wins), and on a board where nothing is served every price is 0 — so this is bounded,
       not asserted as an identity, exactly as §16 bounds it on the empty-build corpus. */
    assert.ok(mismatch < 0.05 * seen,
      `the conclusion and conditions 2 ∧ 3 disagree on ${mismatch}/${seen} board/build pairs — the split moved `
      + 'the two argmaxes onto different pools');
  });
});

describe('J4 · 17 · verify-3 finding 6: the supply line and the price column are ONE regime', () => {
  test('every make in both is priced identically — the sentence and the row cannot disagree', () => {
    let spoke = 0;
    for (const [i, b] of V2_BOARDS.entries()) {
      const a = V2_ALIGN[i];
      const rows = new Map();
      for (const o of a.options) if (o.rank === STEADY && !rows.has(o.make)) rows.set(o.make, o.value);
      if (a.gap.studyTop) {
        assert.ok(rows.has(a.gap.studyTop), `board ${b.k}: the supply line names a make with no priced row`);
        assert.equal(a.gap.studyPays, rows.get(a.gap.studyTop),
          `board ${b.k}: the line prices ${a.gap.studyTop} at ${a.gap.studyPays} and its row at ${rows.get(a.gap.studyTop)}`);
        spoke++;
      }
      if (a.gap.gameTop) {
        assert.equal(a.gap.gameValue, rows.get(a.gap.gameTop),
          `board ${b.k}: the line prices ${a.gap.gameTop} at ${a.gap.gameValue} and its row at ${rows.get(a.gap.gameTop)}`);
      }
    }
    assert.ok(spoke > 0.8 * V2_BOARDS.length, `only ${spoke}/${V2_BOARDS.length} boards printed a supply line`);
  });

  test('the two regimes really did disagree, and re-pricing moves ONLY the magnitudes', () => {
    let differ = 0; let seen = 0; let maxRel = 0;
    for (const [i, b] of V2_BOARDS.entries()) {
      const a = V2_ALIGN[i];
      const published = supplyGapFor(b.save, b.queue, { shape: 'JOB', of: a.steadyPool });
      seen++;
      // the argmaxes, the counts and both booleans are invariant under a positive rescale
      for (const key of ['shape', 'studyTop', 'studySupply', 'gameTop', 'agrees', 'zeroPay']) {
        assert.deepEqual(a.gap[key], published[key],
          `board ${b.k}: re-pricing the gap moved \`${key}\`, which a common positive factor cannot do`);
      }
      if (published.studyPays !== a.gap.studyPays) {
        differ++;
        if (published.studyPays > 0) {
          maxRel = Math.max(maxRel, Math.abs(a.gap.studyPays - published.studyPays) / published.studyPays);
        }
      }
    }
    assert.ok(differ > 0.5 * seen,
      `the published-parameter gap and the board-parameter gap agreed to the digit on ${seen - differ}/${seen} boards — `
      + 'if the two regimes have converged this arm proves nothing and the finding has to be re-measured');
    assert.ok(maxRel > 0.10,
      `the largest disagreement between the two regimes was ${(100 * maxRel).toFixed(1)} % — the rendered brief `
      + 'showed 35 % and 24 %, so a corpus that cannot reach 10 % is not measuring the same thing');
    if (process.env.J4_PRINT) {
      console.log(`v3 oneregime | ${seen} boards | gap re-priced on ${differ} | worst published-vs-board gap ${(100 * maxRel).toFixed(1)} %`);
    }
  });
});
