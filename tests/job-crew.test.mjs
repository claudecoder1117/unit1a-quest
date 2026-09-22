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
  // r3 — the band ordering the shipped bands actually pay
  crewOrderTrue,
  // the matrix
  matrixParamsFor, steadyPerPoint, heldPerPoint, buildRowFor, buildMatrix, bestRankFor,
  MATRIX_TOLERANCE, MEASURED_KEYS, relErr,
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
    assert.equal(a.domain.band, true, 'and so is the band condition — nothing is in the flat tail');
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

    // the rank condition is the one that fails, and `domain` says so without being asked twice
    assert.equal(a.holds, false);
    assert.deepEqual(a.domain, { evidence: true, rank: false, supply: null, band: true, all: false },
      'COMPOSED-GAME.md:552 publishes this sentence with NO domain at all, and q̂ ≥ 0.5 is row 3\'s '
      + 'restriction, not this one (notes/crew-fix.md R2 — filed round 1, re-filed rounds 2 and 3)');
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
    // mastery) and a debrief LINE. See notes/crew-fix.md R8.
    assert.equal(typeof legalize, 'function', 'the repair exists and is exported');
    assert.equal(typeof crewDemotions, 'function', 'and so does the copy\'s data source');
    const s = afterMockMiss();
    // the demotion is real and un-printed until a screen prints it
    assert.equal(crewDemotions(s).length, 1);
    assert.equal(budgetFor(s).wasted, 1,
      'a save that is never re-allocated still carries the wasted point: that is R8, not this file');
  });
});
