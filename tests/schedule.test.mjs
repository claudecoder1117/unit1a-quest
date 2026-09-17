// tests/schedule.test.mjs — T10: Leitner buckets + intervals (monotone), the test clamp (always lands before
// the test), frozen Variants (byte-identical return, pruned at bucket ≥ 3), lazy mastery decay (idempotent per
// day), `needs`, the Rematch log, the daily-goal hook, dueList + Final Sweep, and daysUntilTest local-date
// arithmetic (no UTC off-by-one).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  INTERVALS, MAX_BUCKET, DAY_MS, HOUR_MS, MIN_MS, TEST_GUARD_MS, TEST_TARGET_MS, CLAMP_MIN_MS, PRUNE_BUCKET,
  outcomeOf, nextBucket, intervalDays, dueAfter, clampDue, testAtOf, cardRecord, applyOutcome, isDue, overdueDays,
  freezeVariant, applyFrozenOutcome, pruneFrozen, dueList, mShown, needsMet, isMastered, recordDueCorrect, decaySkills,
  templateOfId, recordRematch, pendingRematches, clearRematch, dailyRecord, checkDailyGoal, housekeep, daysUntilTest,
} from '../site/js/schedule.js';
import { fresh, applyCaps } from '../site/js/store.js';
import { todayISO, diffDays, addDays, testMoment } from '../site/js/days.js';
import { generate } from '../site/data/templates.js';

const NOW = new Date(2026, 8, 16, 18, 0).getTime();          // local 2026-09-16 18:00
const TODAY = todayISO(new Date(NOW));
const mk = () => { const s = fresh(NOW - 3 * DAY_MS); s.profileId = 'sched-test'; return s; };

describe('Leitner buckets and intervals (S4)', () => {
  test('intervals are [0,1,2,4,7,14] and strictly monotone', () => {
    assert.deepEqual([...INTERVALS], [0, 1, 2, 4, 7, 14]);
    for (let b = 1; b <= MAX_BUCKET; b++) assert.ok(intervalDays(b) > intervalDays(b - 1), `bucket ${b}`);
    assert.equal(MAX_BUCKET, 5);
    assert.equal(intervalDays(99), 14, 'clamped high');
    assert.equal(intervalDays(-3), 0, 'clamped low');
  });
  test('clean +1 (capped at 5), hints unchanged, wrong −2 (floored at 0)', () => {
    assert.equal(nextBucket(0, 'clean'), 1);
    assert.equal(nextBucket(5, 'clean'), 5);
    assert.equal(nextBucket(3, 'hints'), 3);
    assert.equal(nextBucket(0, 'hints'), 0);
    assert.equal(nextBucket(4, 'wrong'), 2);
    assert.equal(nextBucket(1, 'wrong'), 0);
    assert.equal(nextBucket(undefined, 'wrong'), 0);
    assert.equal(nextBucket('x', 'clean'), 1);
  });
  test('outcomeOf: clean = first try ∧ zero hints; retries and hints schedule "with hints"; solution shown / not ok = wrong', () => {
    assert.equal(outcomeOf({ ok: true, firstTry: true, hints: 0 }), 'clean');
    assert.equal(outcomeOf({ ok: true, attempt: 1, hints: 0 }), 'clean');
    assert.equal(outcomeOf({ ok: true, firstTry: true, hints: 1 }), 'hints', 'Gold-with-H1 is not clean (Global rule 8)');
    assert.equal(outcomeOf({ ok: true, attempt: 2, hints: 0 }), 'hints');
    assert.equal(outcomeOf({ ok: true, attempt: 3, hints: 1 }), 'hints');
    assert.equal(outcomeOf({ ok: true, attempt: 1, hints: 0, solutionShown: true }), 'wrong');
    assert.equal(outcomeOf({ ok: false }), 'wrong');
  });
  test('dueAfter uses whole days from the attempt', () => {
    assert.equal(dueAfter(NOW, 0), NOW);
    assert.equal(dueAfter(NOW, 3), NOW + 4 * DAY_MS);
  });
});

describe('the test clamp (S4)', () => {
  const testAt = testMoment('2026-09-22', '08:00');
  test('a due earlier than test − 12 h is untouched; a later one lands before the test, never earlier than now + 10 min', () => {
    const early = testAt - 2 * DAY_MS;
    assert.equal(clampDue(early, { now: NOW, testAt }), early);
    const late = NOW + 14 * DAY_MS;
    const c = clampDue(late, { now: NOW, testAt });
    assert.ok(c < testAt, 'before the test');
    assert.ok(c >= NOW + CLAMP_MIN_MS, 'not before now + 10 min');
    assert.equal(c, (NOW + testAt - TEST_TARGET_MS) / 2, 'the midpoint of now and test − 8 h');
  });
  test('sweep: every (now, bucket) pair lands strictly before the test while now < test', () => {
    for (let hours = 24 * 9; hours >= 1; hours--) {
      const now = testAt - hours * HOUR_MS;
      for (let b = 0; b <= MAX_BUCKET; b++) {
        const due = clampDue(dueAfter(now, b), { now, testAt });
        assert.ok(due < testAt, `now = test − ${hours} h, bucket ${b}: due ${new Date(due).toISOString()} must precede the test`);
        assert.ok(due >= now, 'never in the past');
      }
    }
  });
  test('inside the last 8 h the clamp still yields now + 10 min (before the test)', () => {
    const now = testAt - 3 * HOUR_MS;
    const due = clampDue(dueAfter(now, 5), { now, testAt });
    assert.equal(due, now + CLAMP_MIN_MS);
    assert.ok(due < testAt);
  });
  test('no test date → no clamp; testAtOf reads settings', () => {
    assert.equal(clampDue(NOW + 30 * DAY_MS, { now: NOW, testAt: null }), NOW + 30 * DAY_MS);
    const s = mk();
    assert.equal(testAtOf(s), null);
    s.settings.testDate = '2026-09-22'; s.settings.testTime = '09:15';
    assert.equal(testAtOf(s), testMoment('2026-09-22', '09:15'));
  });
  test('TEST_GUARD/TARGET constants are the S4 numbers', () => {
    assert.equal(TEST_GUARD_MS, 12 * HOUR_MS);
    assert.equal(TEST_TARGET_MS, 8 * HOUR_MS);
    assert.equal(CLAMP_MIN_MS, 10 * MIN_MS);
  });
});

describe('card records', () => {
  test('cardRecord creates the S6 shape once; applyOutcome walks the bucket and clamps', () => {
    const s = mk();
    const rec = cardRecord(s, 'wp-07');
    assert.deepEqual(Object.keys(rec).sort(), ['attempts', 'bestMs', 'bucket', 'cleared', 'due', 'foil', 'foilProgress', 'hintsUsed', 'history', 'lastAt', 'placed', 'rarity', 'setupTried', 'solutionShown', 'work'].sort());
    assert.equal(cardRecord(s, 'wp-07'), rec, 'same object on the second call');
    applyOutcome(s, 'wp-07', 'clean', { now: NOW });
    assert.equal(rec.bucket, 1); assert.equal(rec.lastAt, NOW); assert.equal(rec.due, NOW + DAY_MS);
    applyOutcome(s, 'wp-07', 'clean', { now: NOW + DAY_MS });
    assert.equal(rec.bucket, 2); assert.equal(rec.due, NOW + 3 * DAY_MS);
    applyOutcome(s, 'wp-07', 'wrong', { now: NOW + 3 * DAY_MS });
    assert.equal(rec.bucket, 0); assert.equal(rec.due, NOW + 3 * DAY_MS, 'wrong → bucket 0 → due now');
    assert.equal(isDue(rec, NOW + 3 * DAY_MS), true);
    assert.equal(overdueDays(rec, NOW + 5 * DAY_MS), 2);
    s.settings.testDate = todayISO(new Date(NOW + 5 * DAY_MS));
    applyOutcome(s, 'wp-07', 'clean', { now: NOW + 4 * DAY_MS });
    applyOutcome(s, 'wp-07', 'clean', { now: NOW + 4 * DAY_MS + HOUR_MS });
    applyOutcome(s, 'wp-07', 'clean', { now: NOW + 4 * DAY_MS + 2 * HOUR_MS });
    assert.ok(rec.due < testAtOf(s), 'clamped before the test');
  });
});

describe('frozen Variants (S4/S6)', () => {
  test('a missed Variant is frozen by seed + templateVersion + forCard and replays byte-identically', () => {
    const s = mk();
    const item = generate('T-cs-lin', 'frozen-seed');
    const key = freezeVariant(s, item, { forCard: 'wp-07', now: NOW });
    assert.equal(key, item.id);
    const f = s.frozen[key];
    assert.equal(f.seed, 'frozen-seed'); assert.equal(f.templateVersion, item.templateVersion); assert.equal(f.template, 'T-cs-lin');
    assert.equal(f.forCard, 'wp-07'); assert.equal(f.bucket, 0); assert.equal(f.due, NOW);
    assert.deepEqual(generate(f.template, f.seed), item, 'the exact failed problem returns');
  });
  test('answering the frozen item walks its bucket; at bucket 3 it leaves the save; pruneFrozen + applyCaps agree', () => {
    const s = mk();
    const item = generate('T-factor-a2', 'z');
    const key = freezeVariant(s, item, { now: NOW });
    assert.equal(applyFrozenOutcome(s, key, 'clean', { now: NOW })?.bucket, 1);
    assert.equal(applyFrozenOutcome(s, key, 'clean', { now: NOW })?.bucket, 2);
    assert.equal(applyFrozenOutcome(s, key, 'clean', { now: NOW }), null, 'bucket 3 → pruned');
    assert.equal(s.frozen[key], undefined);
    s.frozen['T-sys#000001'] = { seed: 'a', templateVersion: 1, template: 'T-sys', bucket: 3, due: NOW, forCard: null };
    s.frozen['T-sys#000002'] = { seed: 'b', templateVersion: 1, template: 'T-sys', bucket: 1, due: NOW, forCard: null };
    assert.equal(pruneFrozen(s), 1);
    assert.deepEqual(Object.keys(s.frozen), ['T-sys#000002']);
    assert.equal(pruneFrozen(s, { postTest: true }), 1, 'after the test everything goes');
    assert.equal(PRUNE_BUCKET, 3);
    s.frozen['T-sys#000003'] = { seed: 'c', templateVersion: 1, template: 'T-sys', bucket: 4, due: NOW };
    applyCaps(s);
    assert.equal(s.frozen['T-sys#000003'], undefined, 'store caps prune the same way');
  });
  test('freezeVariant needs an id and a template', () => {
    assert.throws(() => freezeVariant(mk(), { seed: 'x' }), TypeError);
  });
});

describe('dueList + Final Sweep', () => {
  test('lists due cards and frozen items sorted by overdue days desc; untouched cards are never due', () => {
    const s = mk();
    applyOutcome(s, 'a1', 'clean', { now: NOW - 5 * DAY_MS });        // due 4 days ago
    applyOutcome(s, 'b2', 'clean', { now: NOW - 2 * DAY_MS });        // due 1 day ago
    applyOutcome(s, 'c3', 'clean', { now: NOW });                     // due tomorrow
    s.cards['never'] = cardRecord(s, 'never');
    freezeVariant(s, generate('T-sys', 'q'), { now: NOW - 3 * DAY_MS });
    const list = dueList(s, { now: NOW, D: 6 });
    assert.deepEqual(list.map(d => d.id), ['a1', generate('T-sys', 'q').id, 'b2']);
    assert.equal(list[1].kind, 'frozen'); assert.equal(list[1].template, 'T-sys'); assert.equal(list[1].seed, 'q');
    assert.ok(list[0].overdue > list[1].overdue && list[1].overdue > list[2].overdue);
    assert.ok(!list.some(d => d.id === 'c3' || d.id === 'never'));
  });
  test('D ≤ 2: everything with bucket ≤ 2 is due (sweep), bucket 3+ only when really due', () => {
    const s = mk();
    applyOutcome(s, 'low', 'clean', { now: NOW });                       // bucket 1, due tomorrow
    for (let i = 0; i < 4; i++) applyOutcome(s, 'high', 'clean', { now: NOW - (10 - i) * DAY_MS }); // bucket 4
    s.cards.high.due = NOW + 3 * DAY_MS;
    assert.deepEqual(dueList(s, { now: NOW, D: 3 }).map(d => d.id), []);
    const sweep = dueList(s, { now: NOW, D: 2 });
    assert.deepEqual(sweep.map(d => d.id), ['low']);
    assert.equal(sweep[0].sweep, true);
    assert.equal(sweep[0].overdue, 0);
  });
});

describe('skills: m_shown, needs, mastered, decay', () => {
  test('m_shown = m · min(1, n/5); placement writes n = 5 so m_shown = m at once', () => {
    assert.equal(mShown({ m: 80, n: 1 }), 16);
    assert.equal(mShown({ m: 80, n: 5 }), 80);
    assert.equal(mShown({ m: 80, n: 9 }), 80);
    assert.equal(mShown(undefined), 0);
  });
  test('needsMet: every needed skill at m ≥ 40 or placed', () => {
    const s = mk();
    assert.equal(needsMet(['QUAD-SOLVE'], s), false);
    s.skills['QUAD-SOLVE'] = { m: 39, n: 5 };
    assert.equal(needsMet(['QUAD-SOLVE'], s), false);
    s.skills['QUAD-SOLVE'].m = 40;
    assert.equal(needsMet(['QUAD-SOLVE'], s), true);
    s.skills['QUAD-SOLVE'] = { m: 0, n: 5, placedAt: NOW };
    assert.equal(needsMet(['QUAD-SOLVE'], s), true, 'placed counts');
    assert.equal(needsMet([], s), true); assert.equal(needsMet(undefined, s), true);
    assert.equal(needsMet(['QUAD-SOLVE', 'SYS'], s), false, 'every needed skill');
  });
  test('mastered needs m ≥ 85 ∧ n ≥ 3 ∧ a due-review correct ≥ 12 h after the previous attempt', () => {
    const s = mk();
    s.skills.VOC = { m: 90, n: 4, lastAt: NOW - 2 * HOUR_MS, lastDueCorrectAt: null };
    assert.equal(isMastered(s.skills.VOC), false);
    assert.equal(recordDueCorrect(s, 'VOC', { now: NOW }), false, 'only 2 h since the previous attempt');
    assert.equal(isMastered(s.skills.VOC), false);
    assert.equal(recordDueCorrect(s, 'VOC', { now: NOW + 13 * HOUR_MS, prevAt: NOW - 2 * HOUR_MS }), true);
    assert.equal(isMastered(s.skills.VOC), true);
    assert.equal(isMastered({ m: 84, n: 9, lastDueCorrectAt: NOW }), false);
    assert.equal(isMastered({ m: 90, n: 2, lastDueCorrectAt: NOW }), false);
  });
  test('decay: −2/day after 2 idle days, floor 0, idempotent per day, reset by a new attempt', () => {
    const s = mk();
    s.skills.VOC = { m: 50, n: 5, lastAt: new Date(2026, 8, 10, 12).getTime() };   // 6 days before TODAY
    s.skills.NOTE = { m: 50, n: 5, lastAt: new Date(2026, 8, 15, 12).getTime() };  // 1 day
    s.skills.CLASS = { m: 3, n: 5, lastAt: new Date(2026, 8, 1, 12).getTime() };   // 15 days → floor
    assert.equal(decaySkills(s, { today: TODAY }), 2);
    assert.equal(s.skills.VOC.m, 50 - 2 * 4, 'idle 6 → 4 charged days');
    assert.equal(s.skills.NOTE.m, 50, 'not idle enough');
    assert.equal(s.skills.CLASS.m, 0, 'floor 0');
    assert.equal(decaySkills(s, { today: TODAY }), 0, 'same day again: nothing');
    assert.equal(s.skills.VOC.m, 42);
    assert.equal(decaySkills(s, { today: addDays(TODAY, 1) }), 1, 'next day: one more');
    assert.equal(s.skills.VOC.m, 40);
    s.skills.VOC.lastAt = new Date(2026, 8, 17, 12).getTime(); s.skills.VOC.m = 70;   // a fresh attempt
    assert.equal(decaySkills(s, { today: addDays(TODAY, 1) }), 0);
    assert.equal(s.skills.VOC.m, 70, 'decay memory reset with lastAt');
  });
});

describe('Rematch log (S1 step 4)', () => {
  test('recordRematch → pendingRematches (newest first, one per template+card) → clearRematch', () => {
    const s = mk();
    recordRematch(s, { item: 'wp-07', got: '68.5', tags: ['gave-complement'], now: NOW - 3000 });
    recordRematch(s, { item: 'T-cs-lin#a91f2c', seed: 'a', template: 'T-cs-lin', forCard: 'wp-01', got: '12', now: NOW - 2000 });
    recordRematch(s, { item: 'wp-07', got: '21.5', tags: ['stopped-early'], now: NOW - 1000 });
    recordRematch(s, { item: 'asn-03', got: 'A', now: NOW });                      // untemplated: not a Rematch
    assert.equal(s.errors.length, 4);
    assert.equal(templateOfId('T-cs-lin#a91f2c'), 'T-cs-lin'); assert.equal(templateOfId('wp-07'), null);
    const pend = pendingRematches(s, { templateFor: id => (id === 'wp-07' ? 'T-cs-lin' : null) });
    assert.deepEqual(pend.map(p => [p.template, p.forCard]), [['T-cs-lin', 'wp-07'], ['T-cs-lin', 'wp-01']]);
    assert.equal(clearRematch(s, 'wp-07'), 2, 'both wp-07 entries');
    assert.deepEqual(pendingRematches(s, { templateFor: id => (id === 'wp-07' ? 'T-cs-lin' : null) }).map(p => p.forCard), ['wp-01']);
    assert.equal(clearRematch(s, 'T-cs-lin#a91f2c'), 1);
    assert.equal(pendingRematches(s).length, 0);
    assert.throws(() => recordRematch(s, {}), TypeError);
  });
});

describe('daily goal + housekeeping (S4 Streak, S7)', () => {
  test('goal met by XP, by Mock + misses drilled, or by Night Before; marks the streak day once', () => {
    const s = mk();
    const d = dailyRecord(s, TODAY);
    assert.deepEqual(d, { xp: 0, clears: 0, goalMet: false, mockDone: false });
    d.xp = 399; checkDailyGoal(s, TODAY);
    assert.equal(d.goalMet, false); assert.equal(s.streak.count, 0);
    d.xp = 400; checkDailyGoal(s, TODAY);
    assert.equal(d.goalMet, true); assert.equal(s.streak.count, 1); assert.equal(s.streak.lastDay, TODAY);
    checkDailyGoal(s, TODAY);
    assert.equal(s.streak.count, 1, 'idempotent');
    const s2 = mk(); const d2 = dailyRecord(s2, TODAY); d2.mockDone = true; checkDailyGoal(s2, TODAY);
    assert.equal(d2.goalMet, false, 'a Mock alone is not the goal');
    d2.missesDrilled = true; checkDailyGoal(s2, TODAY); assert.equal(d2.goalMet, true);
    const s3 = mk(); dailyRecord(s3, TODAY).nightDone = true; checkDailyGoal(s3, TODAY); assert.equal(s3.daily[TODAY].goalMet, true);
  });
  test('housekeep runs decay, pruning and the goal check; post-test drops every frozen item', () => {
    const s = mk();
    s.skills.VOC = { m: 50, n: 5, lastAt: NOW - 10 * DAY_MS };
    freezeVariant(s, generate('T-sys', 'h'), { now: NOW });
    const r = housekeep(s, { now: NOW });
    assert.equal(r.decayed, 1); assert.equal(r.pruned, 0); assert.equal(r.postTest, false);
    s.settings.testDate = todayISO(new Date(NOW - DAY_MS));
    const r2 = housekeep(s, { now: NOW });
    assert.equal(r2.postTest, true); assert.equal(r2.pruned, 1); assert.deepEqual(s.frozen, {});
  });
});

describe('daysUntilTest — local calendar arithmetic (S7)', () => {
  test('whole local days, sign preserved, null without a date', () => {
    assert.equal(daysUntilTest('2026-09-22', '2026-09-16'), 6);
    assert.equal(daysUntilTest('2026-09-16', '2026-09-16'), 0);
    assert.equal(daysUntilTest('2026-09-15', '2026-09-16'), -1);
    assert.equal(daysUntilTest(null, '2026-09-16'), null);
    assert.equal(daysUntilTest('nope', '2026-09-16'), null);
  });
  test('no UTC off-by-one: 23:30 local the night before is still 1 day out; a DST weekend is still 7 days', () => {
    const late = new Date(2026, 8, 21, 23, 30);   // local 2026-09-21 23:30
    assert.equal(daysUntilTest('2026-09-22', todayISO(late)), 1);
    const early = new Date(2026, 8, 22, 0, 10);
    assert.equal(daysUntilTest('2026-09-22', todayISO(early)), 0);
    assert.equal(diffDays('2026-10-30', '2026-11-06'), 7, 'across the US DST end (Nov 1 2026)');
    assert.equal(diffDays('2026-03-06', '2026-03-13'), 7, 'across the US DST start (Mar 8 2026)');
    assert.equal(diffDays('2026-12-31', '2027-01-01'), 1);
    assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  });
});
