// tests/xp.test.mjs — T09: the S4 XP formula table, all three combo transitions, `scope` for
// review / drill / variant / mastered / bonus, attempt-3 qual = 0.3, solution-shown = 0, the level ladder
// and rank names (COMPOSED S4 "XP per clear", "Levels", "Combo"; S6 test list).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_XP, SPEED_PAR_S, SPEED_BONUS, REMATCH_BONUS, QUAL_RETRY,
  isClean, tierOf, baseFor, qualFor, comboMult, speedParMs, speedBonus, scopeFor, scopeLabel, qualLabel, xpFor,
  comboTransition, nextCombo, eventResetsCombo, comboTier, comboLabel, comboPitch,
  xpForLevel, levelFor, rankFor, levelProgress, RANKS,
} from '../site/js/xp.js';

describe('xp: the S4 formula pieces', () => {
  test('base by tier: 10 / 20 / 30 / 50, anything else reads as tier 1', () => {
    assert.deepEqual(BASE_XP, { 1: 10, 2: 20, 3: 30, 4: 50 });
    assert.equal(baseFor(1), 10); assert.equal(baseFor(2), 20); assert.equal(baseFor(3), 30); assert.equal(baseFor(4), 50);
    for (const bad of [0, 5, -1, NaN, undefined, null, '4', 2.7]) assert.equal(tierOf(bad), bad === 2.7 ? 2 : 1, String(bad));
  });

  test('clean = firstTry ∧ hints === 0 (Global rule 8)', () => {
    assert.equal(isClean({ firstTry: true, hints: 0 }), true);
    assert.equal(isClean({ firstTry: true }), true);
    assert.equal(isClean({ firstTry: true, hints: 1 }), false);
    assert.equal(isClean({ firstTry: false, hints: 0 }), false);
    assert.equal(isClean(null), false);
  });

  test('qual: 1.5 clean · 0.75 / 0.5 / 0.25 by hints · 0.6 attempt 2 · 0.3 attempt 3 · 0 beyond · 0 solution shown', () => {
    assert.equal(qualFor({ firstTry: true, hints: 0 }), 1.5);
    assert.equal(qualFor({ firstTry: true, hints: 1 }), 0.75);
    assert.equal(qualFor({ firstTry: true, hints: 2 }), 0.5);
    assert.equal(qualFor({ firstTry: true, hints: 3 }), 0.25);
    assert.equal(qualFor({ firstTry: true, hints: 9 }), 0.25, 'floor 0.25');
    assert.equal(qualFor({ firstTry: false, attempt: 2 }), 0.6);
    assert.equal(qualFor({ firstTry: false, attempt: 3 }), 0.3, 'attempt 3 exists (H1 auto-shown after the 2nd wrong)');
    assert.equal(qualFor({ firstTry: false, attempt: 4 }), 0);
    assert.equal(qualFor({ firstTry: false }), 0.6, 'attempt defaults to 2 when not first try');
    assert.equal(qualFor({ firstTry: true, hints: 0, solutionShown: true }), 0);
    assert.deepEqual(QUAL_RETRY, { 2: 0.6, 3: 0.3 });
    assert.equal(qualFor({ firstTry: false, attempt: 2, hints: 3 }), 0.6, 'hints do not stack on a retry');
  });

  test('combo multiplier: 1 + 0.1·min(combo, 10)', () => {
    assert.equal(comboMult(0), 1);
    assert.equal(comboMult(1), 1.1);
    assert.equal(comboMult(2), 1.2);
    assert.equal(comboMult(5), 1.5);
    assert.equal(comboMult(10), 2);
    assert.equal(comboMult(11), 2, 'capped at 10');
    assert.equal(comboMult(999), 2);
    assert.equal(comboMult(-3), 1);
    assert.equal(comboMult(undefined), 1);
  });

  test('speed: +5 only on a clean tier ≤ 2 clear inside par (20 s / 90 s); never on tier 3–4', () => {
    assert.deepEqual(SPEED_PAR_S, { 1: 20, 2: 90 });
    assert.equal(speedParMs(1), 20000); assert.equal(speedParMs(2), 90000); assert.equal(speedParMs(3), null); assert.equal(speedParMs(4), null);
    assert.equal(speedBonus({ clean: true, tier: 1, elapsedMs: 19999 }), SPEED_BONUS);
    assert.equal(speedBonus({ clean: true, tier: 1, elapsedMs: 20000 }), 5, 'at par counts');
    assert.equal(speedBonus({ clean: true, tier: 1, elapsedMs: 20001 }), 0);
    assert.equal(speedBonus({ clean: true, tier: 2, elapsedMs: 60000 }), 5);
    assert.equal(speedBonus({ clean: false, tier: 1, elapsedMs: 5000 }), 0, 'not clean');
    assert.equal(speedBonus({ clean: true, tier: 3, elapsedMs: 5000 }), 0, 'tier 3');
    assert.equal(speedBonus({ clean: true, tier: 4, elapsedMs: 5000 }), 0, 'tier 4');
    assert.equal(speedBonus({ clean: true, tier: 1 }), 0, 'no timing → no bonus');
  });

  test('scope: bonus 0 · review 1.25 · drill 1 · variant 0.8 · mastered 0.5 · else 1, first flag wins in that order', () => {
    assert.equal(scopeFor({}), 1);
    assert.equal(scopeFor({ isReview: true }), 1.25);
    assert.equal(scopeFor({ isDrill: true }), 1);
    assert.equal(scopeFor({ isVariant: true }), 0.8);
    assert.equal(scopeFor({ isMastered: true }), 0.5);
    assert.equal(scopeFor({ isBonusBank: true }), 0);
    assert.equal(scopeFor({ isBonusBank: true, isReview: true }), 0, 'bonus beats review');
    assert.equal(scopeFor({ isReview: true, isVariant: true }), 1.25, 'a due review of a frozen Variant pays as a review');
    assert.equal(scopeFor({ isDrill: true, isVariant: true }), 1, 'Drill 5 pays full (no Variant discount)');
    assert.equal(scopeFor({ isVariant: true, isMastered: true }), 0.8);
    assert.equal(scopeLabel({ isReview: true }), 'review');
    assert.equal(scopeLabel({}), '');
  });
});

describe('xp: the S4 table', () => {
  const T = [
    // [label, clear, expected xp, breakdown contains]
    ['tier 3 clean, combo 2 (the S1 example: 30 × 1.5 × 1.2 = 54)', { tier: 3, firstTry: true, hints: 0, comboBefore: 2 }, 54, '30 × 1.5 clean × 1.2 combo = 54'],
    ['tier 1 clean, combo 0, slow', { tier: 1, firstTry: true, hints: 0, comboBefore: 0, elapsedMs: 30000 }, 15, '10 × 1.5 clean = 15'],
    ['tier 1 clean, combo 0, inside par → +5 speed', { tier: 1, firstTry: true, hints: 0, comboBefore: 0, elapsedMs: 12000 }, 20, '= 15 + 5 speed = 20'],
    ['tier 2 clean inside 90 s, combo 10', { tier: 2, firstTry: true, hints: 0, comboBefore: 10, elapsedMs: 89000 }, 65, '20 × 1.5 clean × 2 combo = 60 + 5 speed = 65'],
    ['tier 2 clean inside 90 s, combo 14 (cap)', { tier: 2, firstTry: true, hints: 0, comboBefore: 14, elapsedMs: 89000 }, 65, '× 2 combo'],
    ['tier 4 with one hint (Gold-with-H1)', { tier: 4, firstTry: true, hints: 1, comboBefore: 3 }, 49, '50 × 0.75 1 hint × 1.3 combo = 49'],
    ['tier 4 with two hints', { tier: 4, firstTry: true, hints: 2, comboBefore: 0 }, 25, '× 0.5 2 hints'],
    ['tier 4 with three hints', { tier: 4, firstTry: true, hints: 3, comboBefore: 0 }, 13, '× 0.25 3 hints'],
    ['tier 3 attempt 2 (combo already reset by the wrong)', { tier: 3, firstTry: false, attempt: 2, comboBefore: 0 }, 18, '30 × 0.6 2nd try = 18'],
    ['tier 3 attempt 3 pays 0.3', { tier: 3, firstTry: false, attempt: 3, comboBefore: 0 }, 9, '30 × 0.3 3rd try = 9'],
    ['tier 4 attempt 3', { tier: 4, firstTry: false, attempt: 3, comboBefore: 0 }, 15, '× 0.3'],
    ['review pays 1.25', { tier: 3, firstTry: true, hints: 0, comboBefore: 0, isReview: true }, 56, '× 1.25 review'],
    ['variant pays 0.8', { tier: 3, firstTry: true, hints: 0, comboBefore: 0, isVariant: true }, 36, '× 0.8 variant'],
    ['drill pays full even though it is a Variant', { tier: 3, firstTry: true, hints: 0, comboBefore: 0, isDrill: true, isVariant: true }, 45, '30 × 1.5 clean = 45'],
    ['mastered pays half', { tier: 3, firstTry: true, hints: 0, comboBefore: 0, isMastered: true }, 23, '× 0.5 mastered'],
    ['bonus bank pays 0 (and no speed)', { tier: 1, firstTry: true, hints: 0, comboBefore: 0, elapsedMs: 1000, isBonusBank: true }, 5, '× 0 bonus bank'],
    ['rematch +5', { tier: 2, firstTry: true, hints: 0, comboBefore: 0, elapsedMs: 200000, isRematch: true }, 35, '= 30 + 5 rematch = 35'],
    ['rematch + speed both add', { tier: 2, firstTry: true, hints: 0, comboBefore: 0, elapsedMs: 20000, isRematch: true }, 40, '+ 5 speed + 5 rematch = 40'],
    ['solution shown → 0, whatever else', { tier: 4, firstTry: true, hints: 0, comboBefore: 10, elapsedMs: 1, isRematch: true, solutionShown: true }, 0, 'solution shown = 0'],
    ['abandoned multi-part card pays × correct/total', { tier: 4, firstTry: true, hints: 0, comboBefore: 0, partsCorrect: 2, partsTotal: 4 }, 38, '× 2/4 parts'],
    ['Sure-miss halves the next item (factor 0.5)', { tier: 3, firstTry: true, hints: 0, comboBefore: 0, factor: 0.5 }, 23, '× 0.5'],
  ];
  for (const [label, clear, xp, contains] of T) {
    test(label, () => {
      const r = xpFor(clear);
      assert.equal(r.xp, xp, r.breakdown);
      assert.ok(r.breakdown.includes(contains), `breakdown "${r.breakdown}" should contain "${contains}"`);
    });
  }

  test('xpFor exposes every factor and is frozen', () => {
    const r = xpFor({ tier: 3, firstTry: true, hints: 0, comboBefore: 2 });
    assert.deepEqual({ base: r.base, qual: r.qual, combo: r.combo, scope: r.scope, speed: r.speed, rematch: r.rematch, clean: r.clean, comboBefore: r.comboBefore }, { base: 30, qual: 1.5, combo: 1.2, scope: 1, speed: 0, rematch: 0, clean: true, comboBefore: 2 });
    assert.ok(Object.isFrozen(r));
    assert.equal(REMATCH_BONUS, 5);
  });

  test('a 12-card Page lands in the S4 band: all-clean with a growing combo ≈ 730, a realistic mix (2 × H1, 2 retries) ≈ 410', () => {
    const tiers = [2, 2, 3, 2, 3, 3, 2, 3, 3, 2, 3, 3];
    let combo = 0, allClean = 0;
    for (const tier of tiers) { allClean += xpFor({ tier, firstTry: true, hints: 0, comboBefore: combo, elapsedMs: 120000 }).xp; combo = nextCombo(combo, { firstTry: true, hints: 0 }); }
    assert.equal(allClean, 730);
    const outcomes = ['clean', 'clean', 'h1', 'clean', 'retry', 'clean', 'clean', 'h1', 'clean', 'retry', 'clean', 'clean'];
    combo = 0; let mixed = 0;
    tiers.forEach((tier, i) => {
      const o = outcomes[i];
      if (o === 'retry') combo = 0;                                                   // the wrong submit reset it on the spot
      const clear = o === 'clean' ? { firstTry: true, hints: 0 } : o === 'h1' ? { firstTry: true, hints: 1 } : { firstTry: false, attempt: 2 };
      mixed += xpFor({ tier, ...clear, comboBefore: combo, elapsedMs: 120000 }).xp;
      combo = nextCombo(combo, clear);
    });
    assert.equal(mixed, 410);
    assert.ok(mixed >= 400 && allClean <= 800, 'the order of magnitude S4 budgets for one Page');
  });

  test('never negative, never NaN on hostile input', () => {
    for (const c of [{}, { tier: 'x' }, { tier: 4, hints: -5, firstTry: true }, { tier: 2, attempt: NaN }, { comboBefore: -9 }, { factor: -1 }, { partsTotal: 0, partsCorrect: 3 }]) {
      const r = xpFor(c);
      assert.ok(Number.isFinite(r.xp) && r.xp >= 0, JSON.stringify(c));
      assert.equal(typeof r.breakdown, 'string');
    }
  });
});

describe('xp: the three combo transitions (S4 "Combo")', () => {
  test('a clean clear INCREMENTS', () => {
    assert.equal(comboTransition({ firstTry: true, hints: 0 }), 'increment');
    assert.equal(nextCombo(0, { firstTry: true, hints: 0 }), 1);
    assert.equal(nextCombo(4, { firstTry: true, hints: 0 }), 5);
    assert.equal(nextCombo(10, { firstTry: true, hints: 0 }), 11, 'the count keeps growing past the ×2.0 cap');
  });
  test('a Gold-with-H1 clear HOLDS (no growth, no break) and the multiplier still applies to that card', () => {
    assert.equal(comboTransition({ firstTry: true, hints: 1 }), 'hold');
    assert.equal(nextCombo(4, { firstTry: true, hints: 1 }), 4);
    assert.equal(xpFor({ tier: 3, firstTry: true, hints: 1, comboBefore: 4 }).combo, 1.4);
  });
  test('H2/H3, any wrong submit, or a reveal RESETS to 0; retry-then-correct is a reset then a clear at combo 0', () => {
    assert.equal(comboTransition({ firstTry: true, hints: 2 }), 'reset');
    assert.equal(comboTransition({ firstTry: true, hints: 3 }), 'reset');
    assert.equal(comboTransition({ firstTry: false, attempt: 2, hints: 0 }), 'reset');
    assert.equal(comboTransition({ firstTry: false, attempt: 3, hints: 1 }), 'reset');
    assert.equal(comboTransition({ firstTry: true, hints: 1, solutionShown: true }), 'reset');
    assert.equal(nextCombo(7, { firstTry: true, hints: 2 }), 0);
    assert.equal(nextCombo(7, { firstTry: false, attempt: 2 }), 0);
    // the event side: the wrong submit resets on the spot, H1 does not, H2 does
    assert.equal(eventResetsCombo({ wrong: true }), true);
    assert.equal(eventResetsCombo({ reveal: true }), true);
    assert.equal(eventResetsCombo({ hint: 1 }), false);
    assert.equal(eventResetsCombo({ hint: 2 }), true);
    assert.equal(eventResetsCombo({ hint: 3 }), true);
    assert.equal(eventResetsCombo({}), false);
    // retry-then-correct: the clear after a reset is paid at combo 0 and leaves it at 0
    const after = nextCombo(0, { firstTry: false, attempt: 2 });
    assert.equal(after, 0);
    assert.equal(xpFor({ tier: 3, firstTry: false, attempt: 2, comboBefore: after }).combo, 1);
  });
  test('tabulated: every transition from combos 0, 4, 9, 10', () => {
    const rows = [];
    for (const before of [0, 4, 9, 10]) {
      rows.push([before, 'clean', nextCombo(before, { firstTry: true, hints: 0 })]);
      rows.push([before, 'H1', nextCombo(before, { firstTry: true, hints: 1 })]);
      rows.push([before, 'H2', nextCombo(before, { firstTry: true, hints: 2 })]);
      rows.push([before, 'retry', nextCombo(before, { firstTry: false, attempt: 2 })]);
    }
    assert.deepEqual(rows, [
      [0, 'clean', 1], [0, 'H1', 0], [0, 'H2', 0], [0, 'retry', 0],
      [4, 'clean', 5], [4, 'H1', 4], [4, 'H2', 0], [4, 'retry', 0],
      [9, 'clean', 10], [9, 'H1', 9], [9, 'H2', 0], [9, 'retry', 0],
      [10, 'clean', 11], [10, 'H1', 10], [10, 'H2', 0], [10, 'retry', 0],
    ]);
  });
  test('tiers, labels, pitch: ≥ 5 amber ×1.5, ≥ 10 violet ×2.0, 440·2^(combo/12) Hz', () => {
    assert.deepEqual([0, 1, 4, 5, 9, 10, 20].map(comboTier), [0, 1, 1, 2, 2, 3, 3]);
    assert.equal(comboLabel(0), ''); assert.equal(comboLabel(1), '×1.1'); assert.equal(comboLabel(5), '×1.5'); assert.equal(comboLabel(10), '×2.0'); assert.equal(comboLabel(15), '×2.0');
    assert.equal(comboPitch(0), 440);
    assert.ok(Math.abs(comboPitch(12) - 880) < 1e-9);
  });
});

describe('xp: levels and ranks (S4)', () => {
  test('xp ≥ 50·L·(L−1): L2 100 … L12 6600, L15 10500', () => {
    assert.equal(xpForLevel(1), 0); assert.equal(xpForLevel(2), 100); assert.equal(xpForLevel(3), 300); assert.equal(xpForLevel(12), 6600); assert.equal(xpForLevel(15), 10500);
    assert.equal(levelFor(0), 1); assert.equal(levelFor(99), 1); assert.equal(levelFor(100), 2); assert.equal(levelFor(299), 2); assert.equal(levelFor(300), 3);
    assert.equal(levelFor(6599), 11); assert.equal(levelFor(6600), 12); assert.equal(levelFor(10500), 15); assert.equal(levelFor(-5), 1); assert.equal(levelFor(NaN), 1);
    for (let L = 1; L <= 20; L++) { assert.equal(levelFor(xpForLevel(L)), L); assert.equal(levelFor(xpForLevel(L + 1) - 1), L); }
  });
  test('a full week (≈ 5 500–6 500 XP) lands L11–12 on purpose', () => {
    assert.equal(levelFor(5500), 11);
    assert.equal(levelFor(6500), 11);
    assert.equal(levelFor(6600), 12);
  });
  test('ranks at odd levels: Point → Segment → Ray → Line → Angle → Linear Pair → Plane → Space', () => {
    assert.equal(RANKS.length, 8);
    assert.deepEqual([1, 2, 3, 4, 5, 7, 9, 11, 13, 15, 40].map(rankFor), ['Point', 'Point', 'Segment', 'Segment', 'Ray', 'Line', 'Angle', 'Linear Pair', 'Plane', 'Space', 'Space']);
    assert.equal(rankFor(0), 'Point');
  });
  test('levelProgress gives the ring its fill', () => {
    const p = levelProgress(150);
    assert.equal(p.level, 2); assert.equal(p.rank, 'Point'); assert.equal(p.lo, 100); assert.equal(p.hi, 300); assert.equal(p.pct, 0.25); assert.equal(p.toNext, 150);
    assert.equal(levelProgress(0).pct, 0);
  });
});

describe('xp: agrees with rarity.js on the one word "clean" (Global rule 8)', () => {
  test('rarity.js isClean ≡ xp.js isClean', async () => {
    const { isClean: rc } = await import('../site/js/rarity.js');
    for (const c of [{ firstTry: true, hints: 0 }, { firstTry: true, hints: 1 }, { firstTry: false, hints: 0 }, { firstTry: true }, null]) assert.equal(rc(c), isClean(c), JSON.stringify(c));
  });
  test('the ladder matches the numbers S4 prints (the shell copies the same three functions — see notes/T09.md Requests)', () => {
    assert.deepEqual([2, 3, 5, 12, 15].map(xpForLevel), [100, 300, 1000, 6600, 10500]);
  });
});
