// tests/mastery.test.mjs — T09: the S4 mastery update m ← m + 0.35·(s − m), the 100/70/40/0 scores, m_shown =
// m·min(1, n/5), the Mastered rule (m ≥ 85 ∧ n ≥ 3 ∧ a correct DUE review ≥ 12 h after the previous attempt),
// placement n = 5, the Mock-miss drop to 69, idempotent lazy decay, and the Leitner primitives
// (COMPOSED S4 "Mastery per skill", "Spaced review").
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALPHA, N_FULL, MASTER_M, MASTER_N, DUE_GAP_MS, DECAY_IDLE_DAYS, DECAY_PER_DAY, MOCK_MISS_M, DAY_MS, S, PLACEMENT_M, INTERVALS, MAX_BUCKET,
  freshSkill, scoreFor, updateSkill, mShown, isMastered, bandOf, decaySkill, decayAll, placeSkill, mockMiss, applyOutcome, allMastered, weakness,
  leitnerOutcome, nextBucket, dueFor, isDue,
} from '../site/js/mastery.js';

const T0 = Date.UTC(2026, 8, 16, 12);
const H = 3600 * 1000;
const near = (a, b, msg = '', eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}${msg ? ' — ' + msg : ''}`);

describe('mastery: scores (S4)', () => {
  test('s = 100 clean / 70 with hints / 40 on attempt ≥ 2 / 0 wrong', () => {
    assert.deepEqual(S, { clean: 100, hints: 70, retry: 40, wrong: 0 });
    assert.equal(scoreFor({ firstTry: true, hints: 0 }), 100);
    assert.equal(scoreFor({ firstTry: true, hints: 1 }), 70, 'any hint, including the auto-H1');
    assert.equal(scoreFor({ firstTry: true, hints: 3 }), 70);
    assert.equal(scoreFor({ firstTry: true, hints: 0, withHints: true }), 70, 'a correct verdict with a wrong reason chip');
    assert.equal(scoreFor({ firstTry: false, attempt: 2 }), 40);
    assert.equal(scoreFor({ firstTry: false, attempt: 3, hints: 1 }), 40, 'attempt ≥ 2 beats hints');
    assert.equal(scoreFor({ firstTry: false }), 40);
    assert.equal(scoreFor({ wrong: true }), 0);
    assert.equal(scoreFor({ solutionShown: true, firstTry: true }), 0);
    assert.equal(scoreFor({}), 100, 'defaults read as a clean first try');
  });
});

describe('mastery: the EMA update and m_shown', () => {
  test('m ← m + 0.35·(s − m), n + 1, lastAt; the input record is never mutated', () => {
    assert.equal(ALPHA, 0.35);
    const r0 = freshSkill();
    // fix5:home r1: records now carry `misses` (wrong answers on the skill) — Weak spots and the provisional
    // Readiness tell a weak skill from a just-started one by it (notes/FIX5-home.md).
    // fix5:home r2: … and `helped` (correct answers that needed a hint), which counts like a miss for those two.
    assert.deepEqual(r0, { m: 0, n: 0, lastAt: null, lastDueCorrectAt: null, placedAt: null, decayDays: 0, misses: 0, helped: 0 });
    const r1 = updateSkill(r0, 100, { at: T0 });
    near(r1.m, 35); assert.equal(r1.n, 1); assert.equal(r1.lastAt, T0);
    assert.deepEqual(r0, freshSkill(), 'pure');
    const r2 = updateSkill(r1, 100, { at: T0 + H });
    near(r2.m, 35 + 0.35 * 65);
    const r3 = updateSkill(r2, 0, { at: T0 + 2 * H });
    near(r3.m, r2.m * 0.65);
    assert.equal(r3.n, 3);
    const r4 = updateSkill({ m: 200, n: -2 }, 500);
    assert.ok(r4.m <= 100 && r4.n === 1, 'clamped inputs');
  });

  test('m_shown = m·min(1, n/5): two lucky clears never show green', () => {
    assert.equal(N_FULL, 5);
    let r = freshSkill();
    r = updateSkill(r, 100, { at: T0 }); r = updateSkill(r, 100, { at: T0 + H });
    near(r.m, 57.75);
    near(mShown(r), 57.75 * (2 / 5));
    assert.ok(mShown(r) < 40, 'shown as weak-ish after two clears');
    for (let i = 2; i < 5; i++) r = updateSkill(r, 100, { at: T0 + i * H });
    near(mShown(r), r.m, 'n = 5 shows the full m');
    r = updateSkill(r, 100, { at: T0 + 9 * H });
    near(mShown(r), r.m, 'n > 5 still the full m');
    assert.equal(mShown(null), 0);
  });

  test('placement / JUMP write m with n = 5 (80 shows as 80, never 16) and placedAt; an earned n is never lowered', () => {
    assert.deepEqual(PLACEMENT_M, { wrong: 0, retry: 50, clean: 80 });
    const p = placeSkill(freshSkill(), 80, T0);
    assert.equal(p.m, 80); assert.equal(p.n, 5); assert.equal(p.placedAt, T0); assert.equal(p.lastAt, T0);
    assert.equal(mShown(p), 80);
    const played = { m: 60, n: 9, lastAt: T0 };
    assert.equal(placeSkill(played, 80, T0 + H).n, 9);
    assert.equal(placeSkill(freshSkill(), 0, T0).n, 5, 'a wrong placement is still n = 5');
    assert.equal(bandOf(freshSkill()), 'untested');
  });
});

describe('mastery: the Mastered rule', () => {
  test('m ≥ 85 ∧ n ≥ 3 ∧ a correct due review ≥ 12 h after the previous attempt', () => {
    assert.equal(MASTER_M, 85); assert.equal(MASTER_N, 3); assert.equal(DUE_GAP_MS, 12 * H);
    // blocked practice: ten clean clears in one sitting never show Mastered
    let r = freshSkill();
    for (let i = 0; i < 10; i++) r = updateSkill(r, 100, { at: T0 + i * 60000, dueReview: false });
    assert.ok(r.m > 95 && r.n === 10);
    assert.equal(isMastered(r), false, 'blocked practice alone cannot show Mastered');
    // a due review 5 minutes later does not count (gap < 12 h)
    const soon = updateSkill(r, 100, { at: T0 + 10 * 60000 + 5 * 60000, dueReview: true });
    assert.equal(soon.lastDueCorrectAt, null);
    assert.equal(isMastered(soon), false);
    // a due review the next day counts
    const next = updateSkill(r, 100, { at: T0 + DAY_MS, dueReview: true });
    assert.equal(next.lastDueCorrectAt, T0 + DAY_MS);
    assert.equal(isMastered(next), true);
    assert.equal(bandOf(next), 'mastered');
    // a WRONG due review does not (s = 0)
    const wrong = updateSkill(r, 0, { at: T0 + DAY_MS, dueReview: true });
    assert.equal(wrong.lastDueCorrectAt, null);
    // m too low or n too low → not Mastered even with the flag
    assert.equal(isMastered({ m: 84.9, n: 5, lastDueCorrectAt: T0 }), false);
    assert.equal(isMastered({ m: 90, n: 2, lastDueCorrectAt: T0 }), false);
    assert.equal(isMastered({ m: 90, n: 3, lastDueCorrectAt: T0 }), true);
    assert.equal(isMastered(null), false);
  });

  test('a Mock / Boss miss on a Mastered skill drops m to 69 at once; a non-Mastered skill is untouched', () => {
    assert.equal(MOCK_MISS_M, 69);
    const m = { m: 92, n: 6, lastAt: T0, lastDueCorrectAt: T0 };
    assert.equal(mockMiss(m).m, 69);
    assert.equal(m.m, 92, 'pure');
    assert.equal(mockMiss({ m: 92, n: 6, lastAt: T0 }).m, 92);
  });

  test('allMastered / weakness helpers', () => {
    const skills = { A: { m: 90, n: 4, lastDueCorrectAt: T0, lastAt: T0 }, B: { m: 90, n: 4, lastAt: T0 }, C: { m: 30, n: 2, lastAt: T0 }, Z: freshSkill() };
    assert.equal(allMastered(skills, ['A']), true);
    assert.equal(allMastered(skills, ['A', 'B']), false);
    assert.equal(allMastered(skills, []), false);
    assert.equal(allMastered(skills, ['nope']), false);
    assert.equal(weakness(skills.Z, 9), 0, 'an untested skill is never listed as weak');
    near(weakness(skills.C, 10), 10 * (1 - (30 * 0.4) / 100));
  });
});

describe('mastery: lazy decay (−2/day after 2 idle days, floor 0, idempotent)', () => {
  test('nothing for the first two idle days, then −2 per day, never below 0', () => {
    assert.equal(DECAY_IDLE_DAYS, 2); assert.equal(DECAY_PER_DAY, 2);
    const r = { m: 50, n: 5, lastAt: T0 };
    assert.equal(decaySkill(r, T0 + 2 * DAY_MS).m, 50);
    assert.equal(decaySkill(r, T0 + 3 * DAY_MS - 1).m, 50, 'idle days are whole days');
    assert.equal(decaySkill(r, T0 + 3 * DAY_MS).m, 48);
    assert.equal(decaySkill(r, T0 + 7 * DAY_MS).m, 40);
    assert.equal(decaySkill(r, T0 + 60 * DAY_MS).m, 0, 'floor 0');
    assert.equal(decaySkill(freshSkill(), T0 + 60 * DAY_MS).m, 0, 'an untested skill is left alone');
    assert.equal(decaySkill({ m: 50, n: 0, lastAt: T0 }, T0 + 60 * DAY_MS).m, 50, 'n = 0 never decays');
  });
  test('opening the app five times on one day decays once; a new update resets the ledger', () => {
    let r = { m: 50, n: 5, lastAt: T0 };
    for (let i = 0; i < 5; i++) r = decaySkill(r, T0 + 5 * DAY_MS + i * H);
    assert.equal(r.m, 44);
    assert.equal(r.decayDays, 3);
    r = decaySkill(r, T0 + 6 * DAY_MS);
    assert.equal(r.m, 42);
    const after = updateSkill(r, 100, { at: T0 + 6 * DAY_MS });
    assert.equal(after.decayDays, 0);
    assert.equal(decaySkill(after, T0 + 6 * DAY_MS + DAY_MS).m, after.m, 'fresh lastAt, no decay yet');
  });
  test('decayAll walks a save map in place', () => {
    const skills = { A: { m: 50, n: 5, lastAt: T0 }, B: { m: 10, n: 1, lastAt: T0 } };
    const same = decayAll(skills, T0 + 10 * DAY_MS);
    assert.equal(same, skills);
    assert.equal(skills.A.m, 34); assert.equal(skills.B.m, 0);
    assert.equal(decayAll(null), null);
  });
});

describe('mastery: applyOutcome writes every skill of a card', () => {
  test('one EMA step per skill id; unknown ids ignored', () => {
    const skills = {};
    applyOutcome(skills, ['FIG-ALG', 'QUAD-SOLVE', '', null], 100, { at: T0 });
    assert.deepEqual(Object.keys(skills).sort(), ['FIG-ALG', 'QUAD-SOLVE']);
    near(skills['FIG-ALG'].m, 35); assert.equal(skills['QUAD-SOLVE'].n, 1);
    applyOutcome(skills, ['FIG-ALG'], 0, { at: T0 + H });
    near(skills['FIG-ALG'].m, 35 * 0.65); assert.equal(skills['FIG-ALG'].n, 2);
    assert.equal(skills['QUAD-SOLVE'].n, 1);
  });
  test('the S1 timeline written through the API: first wrong → 0, then a clear on attempt 2 → 40', () => {
    const skills = {};
    applyOutcome(skills, ['CS-LIN'], scoreFor({ wrong: true }), { at: T0 });
    applyOutcome(skills, ['CS-LIN'], scoreFor({ firstTry: false, attempt: 2 }), { at: T0 + 60000 });
    near(skills['CS-LIN'].m, 0.35 * 40);
    assert.equal(skills['CS-LIN'].n, 2);
  });
});

describe('mastery: Leitner primitives (S4 spaced review)', () => {
  test('intervals [0,1,2,4,7,14] days; clean +1 (max 5), hints unchanged, wrong max(0, b − 2)', () => {
    assert.deepEqual(INTERVALS, [0, 1, 2, 4, 7, 14]); assert.equal(MAX_BUCKET, 5);
    assert.equal(nextBucket(0, 'clean'), 1); assert.equal(nextBucket(5, 'clean'), 5);
    assert.equal(nextBucket(3, 'hints'), 3);
    assert.equal(nextBucket(3, 'wrong'), 1); assert.equal(nextBucket(1, 'wrong'), 0); assert.equal(nextBucket(0, 'wrong'), 0);
    assert.equal(nextBucket(9, 'hints'), 5, 'clamped');
    assert.equal(dueFor(0, T0), T0);
    assert.equal(dueFor(1, T0), T0 + DAY_MS);
    assert.equal(dueFor(5, T0), T0 + 14 * DAY_MS);
  });
  test('leitnerOutcome mirrors the mastery classes', () => {
    assert.equal(leitnerOutcome({ firstTry: true, hints: 0 }), 'clean');
    assert.equal(leitnerOutcome({ firstTry: true, hints: 1 }), 'hints');
    assert.equal(leitnerOutcome({ firstTry: true, withHints: true }), 'hints');
    assert.equal(leitnerOutcome({ firstTry: false, attempt: 2 }), 'wrong');
    assert.equal(leitnerOutcome({ solutionShown: true }), 'wrong');
  });
  test('isDue: cleared and due ≤ now; never for an uncleared card', () => {
    assert.equal(isDue({ cleared: true, due: T0 }, T0), true);
    assert.equal(isDue({ cleared: true, due: T0 + 1 }, T0), false);
    assert.equal(isDue({ cleared: true }, T0), true);
    assert.equal(isDue({ cleared: false, due: 0 }, T0), false);
    assert.equal(isDue(undefined, T0), false);
  });
});
