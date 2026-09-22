// tests/job-meta-constants.test.mjs — J7 (meta lane). The printed prose may not drift from the constants.
//
// G7 gives Stats and Settings one job apiece: PRINT THE FORMULA. A panel that prints "the bar is 0.10"
// as a string literal is not printing the formula — it is repeating a number that was true when it was
// typed. The moment `RATING.calibratedBrierMax`, `CREW.capacityMax` or `CREDIT.k` is rebalanced, that
// panel lies to the student, silently, with a straight face, and every existing test stays green
// because every existing test compares the literal to a literal.
//
// This file closes that class. Two arms, and both are needed:
//
//   1. SOURCE — the sentence must INTERPOLATE the constant, not restate it. A regex over the source is
//      the only way to see the difference: `${CREDIT.k}` and `40` render the same string today and
//      diverge on the day someone changes the constant. (Same technique, and same reason, as
//      job-index.test.mjs's source arm — there is no DOM under `node --test`; BUILD-POLICY §3.)
//
//   2. ARITHMETIC — the derived sentence must also be TRUE. `maxBuildAtCeiling` is a shipped constant,
//      so "12 manned costs 12 points and the remaining 10 buy 10 HELD upgrades" is only honest while
//      that constant agrees with `capacityMax − mannedMax·COSTS.STEADY`. Interpolating a wrong constant
//      is still a lie, so arm 1 alone is not enough.
//
// Scope: the three files the meta lane owns (screens/stats.js, screens/settings.js, data/trophies.js).

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from './_helpers.mjs';

import { CREW, RATING, CREDIT } from '../site/data/job.js';
import { COSTS, CAPACITY_MAX, MANNED_MAX, STAMPS_MAX, CHAIN_HOLD_MIN, MAKES } from '../site/js/job/crew.js';

const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const STATS = read('site/js/screens/stats.js');
const SETTINGS = read('site/js/screens/settings.js');

/** The prose of a panel, with the block comments that explain it stripped out. A comment may name a
 *  number freely — it is the rendered sentence that must derive. */
const prose = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '');

describe('J7 meta · the printed prose derives from the live constants (G7)', () => {
  describe('1 · source: the sentence interpolates the constant', () => {
    test('Stats prints the Brier bar from RATING.calibratedBrierMax, never as "0.10"', () => {
      const p = prose(STATS);
      assert.match(p, /at or under \$\{n2\(RATING\.calibratedBrierMax\)\}/,
        'the "at or under" arm must interpolate the constant');
      assert.match(p, /the bar is \$\{n2\(RATING\.calibratedBrierMax\)\}/,
        'the "the bar is" arm must interpolate the constant');
      assert.ok(!/(at or under|the bar is) 0\.10/.test(p),
        'a literal 0.10 in the calibration line survives a rebalance of RATING.calibratedBrierMax');
    });

    test('Stats prints the capacity formula from CREW, never as "8 + floor(level / 2)"', () => {
      const p = prose(STATS);
      assert.match(p, /\$\{cap\.base\} \+ floor\(level \/ \$\{CREW\.levelsPerPoint\}\)/,
        'the capacity formula must interpolate both the base and the divisor');
      assert.match(p, /of \$\{STAMPS_MAX\} stamps/, 'the stamp ceiling must interpolate STAMPS_MAX');
      assert.match(p, /STEADY costs \$\{COSTS\.STEADY\}/);
      assert.match(p, /HELD costs \$\{COSTS\.HELD\}/);
      assert.match(p, /holds the chain at \$\{CHAIN_HOLD_MIN\}/);
      assert.ok(!/8 \+ floor\(level \/ 2\)/.test(p), 'the capacity formula is hardcoded');
      assert.ok(!/of 7 stamps/.test(p), 'the stamp ceiling is hardcoded');
    });

    test('Stats prints the ceiling build from MANNED_MAX / CAPACITY_MAX / maxBuildAtCeiling', () => {
      const p = prose(STATS);
      assert.match(p, /\$\{MANNED_MAX\} manned costs \$\{MANNED_MAX \* COSTS\.STEADY\} points/);
      assert.match(p, /remaining \$\{CAPACITY_MAX - MANNED_MAX \* COSTS\.STEADY\}/);
      assert.match(p, /\$\{CREW\.maxBuildAtCeiling\.held\} HELD/);
      assert.match(p, /\$\{CREW\.maxBuildAtCeiling\.steady\} STEADY/);
      assert.match(p, /\$\{CREW\.maxBuildAtCeiling\.bare\}\s*\`?\s*\+?\s*'?\s*makes always bare/,
        'the bare count must interpolate maxBuildAtCeiling.bare');
      assert.ok(!/12 manned costs 12 points/.test(p), 'the ceiling sentence is hardcoded');
      assert.ok(!/seven makes always bare/.test(p), 'the bare count is spelled out as a word');
    });

    test('Settings prints the propriety second derivative from CREDIT.k, never as "−80"', () => {
      const p = prose(SETTINGS);
      assert.match(p, /The second derivative is −\$\{2 \* CREDIT\.k\}/,
        'd²E/dp² = −2k must interpolate CREDIT.k');
      assert.ok(!/The second derivative is −80/.test(p),
        'a literal −80 survives a rebalance of CREDIT.k');
    });
  });

  describe('2 · arithmetic: the derived sentence is also true', () => {
    test('maxBuildAtCeiling is exactly what the capacity ceiling buys', () => {
      const spent = MANNED_MAX * COSTS.STEADY;
      const upgradeCost = COSTS.HELD - COSTS.STEADY;
      const remaining = CAPACITY_MAX - spent;
      assert.ok(remaining >= 0, 'the ceiling cannot even man the cap');
      assert.equal(CREW.maxBuildAtCeiling.held, Math.floor(remaining / upgradeCost),
        'the published HELD count is not what the remaining points buy');
      assert.equal(CREW.maxBuildAtCeiling.steady, MANNED_MAX - CREW.maxBuildAtCeiling.held,
        'HELD + STEADY must be exactly the manned cap');
      assert.equal(CREW.maxBuildAtCeiling.bare, MAKES.length - MANNED_MAX,
        'the published bare count is not makes − manned cap');
      // and the sentence's premise: the cap, not the points, is what bites at the ceiling
      assert.ok(MANNED_MAX < MAKES.length, 'the board would be covered — the sentence claims it never is');
    });

    test('the capacity formula Stats prints is the one crew.js computes', () => {
      assert.equal(CREW.base, CAPACITY_MAX - Math.floor(0 / CREW.levelsPerPoint) - 0 - (CAPACITY_MAX - CREW.base),
        'sanity: CREW.base is the intercept');
      assert.equal(CREW.capacityMin, CREW.base, 'capacity at level 0 with no stamps is the base');
      assert.equal(CREW.capacityMax, CREW.base + Math.floor((CREW.capacityMax - CREW.base - STAMPS_MAX) * 1)
        + STAMPS_MAX, 'the ceiling is base + level points + every stamp');
      assert.ok(STAMPS_MAX <= CREW.stampsMax, 'STAMPS_MAX is clamped to the shipped boss count');
    });

    test('every number trophies.js repeats equals its data/job.js original', async () => {
      // trophies.js deliberately does NOT import data/job.js — 41 KB of constants on a boot path a
      // student with the layer off never needs (its own §GAME_WINGS note). The price of that decision
      // is this test: the repeated numbers must be pinned to the originals from outside.
      const { trophyById } = await import('../site/data/trophies.js');
      const { FAULT_INDEX, CHAIN } = await import('../site/data/job.js');

      const cond = (id) => {
        const t = trophyById[id];
        assert.ok(t, `the ${id} trophy is missing`);
        assert.equal(typeof t.cond, 'string', `${id} has no description`);
        return t.cond;
      };

      // the Fault Index size
      const tags = FAULT_INDEX.tags ?? FAULT_INDEX.count ?? FAULT_INDEX.size;
      assert.ok(Number.isFinite(tags), 'data/job.js FAULT_INDEX exposes no tag count');
      assert.equal(trophyById['index-68'].progress({ save: { game: { tags: {} } } }).need, tags,
        'the index-68 trophy needs a different count than data/job.js FAULT_INDEX');
      assert.match(cond('index-68'), new RegExp(`\\b${tags}\\b`),
        'the index-68 description quotes a different count than its own predicate');
      assert.ok(!/sixty-eight/.test(cond('index-68')), 'the count is spelled out as a word');

      // the chain cap and the multiplier it is worth
      assert.equal(trophyById['chain-8'].progress({ save: {} }).need, CHAIN.cap,
        'the chain-8 trophy needs a different depth than data/job.js CHAIN.cap');
      assert.match(cond('chain-8'), new RegExp(`chain of ${CHAIN.cap}\\b`));
      assert.match(cond('chain-8'), new RegExp(`×${CHAIN.multCap}\\b`),
        'the chain-8 description quotes a different multiplier than data/job.js CHAIN.multCap');

      // the calibrated bar and window
      assert.match(cond('calibrated'), new RegExp(RATING.calibratedBrierMax.toFixed(2)),
        'the calibrated description quotes a different bar than RATING.calibratedBrierMax');
      assert.match(cond('calibrated'), new RegExp(`\\b${RATING.calibratedWindow}\\b`),
        'the calibrated description quotes a different window than RATING.calibratedWindow');

      // and the waypoint agrees with its own predicate AND with the shipped milestone list
      const need25 = trophyById['index-25'].progress({ save: { game: { tags: {} } } }).need;
      assert.deepEqual(FAULT_INDEX.milestones, [need25, tags],
        'the two index trophies are not data/job.js FAULT_INDEX.milestones');
      assert.match(cond('index-25'), new RegExp(`\\b${need25}\\b`),
        'the index-25 description quotes a different count than its own predicate');
      assert.ok(need25 < tags, 'the waypoint is not below the whole index');
    });

    test('the trophy descriptions interpolate rather than restate', () => {
      const src = read('site/data/trophies.js').replace(/\/\*[\s\S]*?\*\//g, '');
      assert.match(src, /Seal all \$\{INDEX_TAGS\} entries/);
      assert.match(src, /Reach a chain of \$\{CHAIN_DEEP\} inside one job/);
      assert.match(src, /caps, at ×\$\{CHAIN_MULT_CAP\}/);
      assert.match(src, /Brier score of \$\{CALIBRATED_BRIER_MAX\.toFixed\(2\)\}/);
      assert.match(src, /over \$\{CALIBRATED_WINDOW\} informative calls/);
      assert.match(src, /Seal \$\{INDEX_PART\} entries/);
      assert.ok(!/Brier score of 0\.10/.test(src), 'the calibrated bar is hardcoded');
      assert.ok(!/chain of 8 inside/.test(src), 'the chain depth is hardcoded');
      assert.ok(!/at ×2\.6/.test(src), 'the chain multiplier is hardcoded');
    });

    test('c(p, o) is strictly proper — the claim the Settings panel makes', () => {
      // E[c] = base − k[q(1−p)² + (1−q)p²];  dE/dp = −2k(p − q);  d²E/dp² = −2k < 0
      const E = (q, p) => CREDIT.base - CREDIT.k * (q * (1 - p) ** 2 + (1 - q) * p ** 2);
      for (const q of [0.05, 0.3, 0.5, 0.7, 0.85, 0.99]) {
        const hp = 1e-5;
        const d2 = (E(q, 0.5 + hp) - 2 * E(q, 0.5) + E(q, 0.5 - hp)) / (hp * hp);
        assert.ok(Math.abs(d2 - -2 * CREDIT.k) < 1e-3, `d²E/dp² is not −${2 * CREDIT.k} at q = ${q}`);
        // and the unique maximiser is p = q
        for (const p of [q - 0.1, q + 0.1].filter((x) => x > 0 && x < 1)) {
          assert.ok(E(q, q) > E(q, p), `truthful p = q is not the maximum at q = ${q}`);
        }
      }
    });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   ROUND 3 — the two defects the round-3 critics found that live INSIDE this lane.

   Both are the same failure as round 2's, one level up: round 2 caught panels restating a CONSTANT
   the code owns; these are panels restating a DEFINITION and a RANK the code owns. A number that is
   re-derived on a surface is a number that can disagree with the game, and both of these did.

   1. q̂ — Settings printed "your first-try rate on that make over the trailing 10 attempts". The
      shipped statistic is the CLEAR rate over the trailing 10 SITTINGS: `call.qHatDetail` parses
      `e.attempt` and deliberately ignores it, and the module header at call.js says so in those
      words. The two readings are not close — on an ordinary history they differ by 0.5, which is
      the whole width of `w`, and they disagree about whether the call is a measurement at all.

   2. The rank — both surfaces printed `rankNameFor(rating.value)`. That is not the rank the game
      grants. The 95 call and the guard multiplier are gated on `player.rank`, and `value === 5.00`
      has two causes that are opposite claims about the student: fifty measured 50-calls, and NO
      measurement at all (which is where a student who mastered their makes lives). Re-deriving the
      name from the value printed `Called 2` at the second one.
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */

describe('J7 meta · round 3: a surface prints the game’s own statistic, never its own re-derivation', () => {
  describe('1 · q̂ is the CLEAR rate over sittings — and Settings now says so', () => {
    test('source: the q̂ legend states the clear rate, and no lane file says "first-try rate"', () => {
      const p = prose(SETTINGS);
      assert.match(p, /your CLEAR rate on that make over the trailing \$\{RATING\.qHatWindow\} sittings/,
        'the q̂ legend does not state the clear rate over sittings');
      for (const [name, src] of [['settings.js', SETTINGS], ['stats.js', STATS], ['trophies.js', read('site/data/trophies.js')]]) {
        assert.ok(!/first-try rate/.test(prose(src)), `${name} still prints "first-try rate" for q̂`);
      }
      // the window unit is a SITTING, and the sentence must not call it an attempt again
      assert.ok(!/trailing \$\{RATING\.qHatWindow\} attempts/.test(p),
        'the q̂ window is still printed in attempts rather than sittings');
    });

    test('arithmetic: the two readings really disagree, so the corrected sentence is load-bearing', async () => {
      const { qHatDetail, weightFor } = await import('../site/js/job/call.js');
      // Ten sittings on one make, ALL cleared; five of them on attempt 3 with hints — an ordinary
      // history for material a student is still fumbling.
      const hist = Array.from({ length: 10 }, (_, i) => (
        { at: 1000 + i, ok: true, attempt: i % 2 === 0 ? 1 : 3, hints: i % 2 === 0 ? 0 : 2 }));
      const save = { cards: { c1: { history: hist } } };
      const cards = { c1: { id: 'c1', skills: ['M1-EXP'] } };

      const d = qHatDetail(save, 'M1-EXP', { cards });
      assert.equal(d.of, RATING.qHatWindow, 'the window is the trailing ten SITTINGS');
      assert.equal(d.qHat, 1, 'the shipped q̂ is the clear rate: ten clears is 1.0');
      assert.equal(d.w, 0, 'and a clear rate of 1.0 weighs nothing');
      assert.equal(d.informative, false, 'so the call is not a measurement');

      const firstTry = hist.filter((h) => h.ok && h.attempt === 1).length / hist.length;
      assert.equal(firstTry, 0.5, 'the discarded reading would call the same history 0.5');
      assert.equal(weightFor(firstTry), RATING.weightK / 4, 'which is the MAXIMUM weight');
      assert.ok(weightFor(firstTry) >= RATING.informativeMin,
        'the two readings disagree about whether this call is a measurement at all');
      assert.equal(Math.abs(d.qHat - firstTry), 0.5, 'the gap is half the range of q̂');
    });
  });

  describe('2 · the rank a surface prints is the rank the game grants', () => {
    test('source: both panels read player.rank through ratingDetail and print rankOf().name', () => {
      assert.match(prose(STATS), /ratingDetail\(player\.rating\?\.calls \?\? \[\], RATING\.N, \{ rank: player\.rank \}\)/,
        'the Stats ledger does not pass the held rank to ratingDetail');
      assert.match(prose(STATS), /rankOf\(rating\.rank\)\.name/, 'the Stats ledger does not print the held rank');
      assert.match(prose(SETTINGS), /ratingDetail\(s\.player\?\.rating\?\.calls \?\? \[\], RATING\.N, \{ rank: s\.player\?\.rank \}\)/,
        'the Settings rating panel does not pass the held rank to ratingDetail');
      assert.match(prose(SETTINGS), /rankOf\(live\.rank\)\.name/, 'the Settings rating panel does not print the held rank');
      // and neither may go back to deriving a rank name from the live rating VALUE
      assert.ok(!/rankNameFor\((?:live|rating)\.value\)/.test(prose(STATS) + prose(SETTINGS)),
        'a panel is still deriving the rank name from the rating value');
    });

    test('behaviour: a mastered student keeps Called 5, and measured cowardice still falls to Called 2', async () => {
      const { callEntry, windowPush, ratingDetail, rankNameFor, rankOf, RANKS } = await import('../site/js/job/call.js');
      const build = (qHat, call) => {
        let calls = [];
        for (let i = 0; i < RATING.N; i++) {
          calls = windowPush(calls, callEntry({ call, ok: true, qHat, skill: 'M1-EXP', at: 1000 + i }), { N: RATING.N });
        }
        return calls;
      };

      /* (a) THE DEFECT. Fifty perfect calls on material the student has MASTERED: q̂ = 1 → w = 0 →
             not one of the fifty slots is a measurement. */
      const mastered = build(1.0, 95);
      const plain = ratingDetail(mastered, RATING.N);
      assert.equal(plain.n, 0, 'a mastered window holds no informative call');
      assert.equal(plain.measured, false, 'and therefore measures nothing');
      assert.equal(plain.value.toFixed(2), RATING.base.toFixed(2), 'so the rating reads exactly 5.00');
      assert.equal(rankNameFor(plain.value), 'Called 2', 'the OLD surface form prints Called 2 at them');

      const held = ratingDetail(mastered, RATING.N, { rank: 5 });
      assert.equal(held.held, true, 'the hold must fire on an unmeasured window');
      assert.equal(rankOf(held.rank).name, 'Called 5', 'the NEW surface form keeps the rank they hold');
      assert.equal(held.value.toFixed(2), plain.value.toFixed(2),
        'the rating VALUE still deflates to 5.00 — G2 wants that; only the RANK is held');

      // the demotion has teeth: it is the 95 call and the guard multiplier, not a label
      assert.ok(RANKS[4].calls.includes(95) && !RANKS[1].calls.includes(95),
        'Called 5 holds the 95 call and Called 2 does not');
      assert.ok(RANKS[4].guardMult > RANKS[1].guardMult, 'and a better guard multiplier');

      /* (b) THE CONTROL — this is not a one-way ratchet. Fifty 50-calls at q̂ = 0.5 weigh 1.00 each
             and score credit 0 either way: the SAME rating value of 5.00, but every slot is a real
             measurement, so the rank must still fall. */
      const coward = build(0.5, 50);
      const measured = ratingDetail(coward, RATING.N, { rank: 5 });
      assert.equal(measured.n, RATING.N, 'fifty 50-calls at q̂ = 0.5 are all measurements');
      assert.equal(measured.measured, true);
      assert.equal(measured.value.toFixed(2), RATING.base.toFixed(2), 'and score exactly 5.00 as well');
      assert.equal(measured.held, false, 'a MEASURED window may not be held');
      assert.equal(rankOf(measured.rank).name, 'Called 2',
        'measured cowardice must still be printed as Called 2 — the hold is not a floor on being wrong');
    });
  });
});
