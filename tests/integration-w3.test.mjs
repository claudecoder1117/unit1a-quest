// integration-w3.test.mjs — the Wave 3 seams. Owned by the integrator, not by a ticket.
//
// Wave 3 landed two modules that both implement the S4 spaced-review primitives: js/mastery.js (T09,
// the card screen's mastery maths) and js/schedule.js (T10, the planner's Leitner + test clamp). The
// Card screen now uses mastery.js for the interval and schedule.js for the clamp, so the two MUST agree
// bucket-for-bucket. These tests pin that agreement and the wiring that makes the screens reachable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import * as mastery from '../site/js/mastery.js';
import * as schedule from '../site/js/schedule.js';
import { xpForLevel, levelFor, rankFor } from '../site/js/xp.js';
import { COUNTERS } from '../site/data/trophies.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

test('W3: mastery.js and schedule.js are the same Leitner ladder', async (t) => {
  await t.test('intervals and the mastered thresholds are identical', () => {
    assert.deepEqual([...mastery.INTERVALS], [...schedule.INTERVALS]);
    assert.equal(mastery.MAX_BUCKET, schedule.MAX_BUCKET);
    assert.equal(mastery.MASTER_M, schedule.MASTERED_M);
    assert.equal(mastery.MASTER_N, schedule.MASTERED_N);
    assert.equal(mastery.DECAY_IDLE_DAYS, schedule.DECAY_IDLE_DAYS);
    assert.equal(mastery.DECAY_PER_DAY, schedule.DECAY_PER_DAY);
  });

  await t.test('nextBucket agrees for every (bucket, outcome)', () => {
    for (let b = 0; b <= schedule.MAX_BUCKET; b++) {
      for (const o of schedule.OUTCOMES) {
        assert.equal(mastery.nextBucket(b, o), schedule.nextBucket(b, o), `bucket ${b} / ${o}`);
      }
    }
  });

  await t.test('the plain interval agrees (the card screen takes it from mastery.js, then clamps with schedule.js)', () => {
    const at = Date.UTC(2026, 8, 16, 12, 0, 0);
    for (let b = 0; b <= schedule.MAX_BUCKET; b++) assert.equal(mastery.dueFor(b, at), schedule.dueAfter(at, b), `bucket ${b}`);
  });

  await t.test('isMastered and m_shown agree on the same record', () => {
    const recs = [
      { m: 90, n: 4, lastDueCorrectAt: 1 }, { m: 90, n: 4, lastDueCorrectAt: null },
      { m: 84, n: 9, lastDueCorrectAt: 1 }, { m: 100, n: 2, lastDueCorrectAt: 1 },
      { m: 60, n: 1 }, { m: 0, n: 0 },
    ];
    for (const r of recs) {
      assert.equal(mastery.isMastered(r), schedule.isMastered(r), JSON.stringify(r));
      assert.equal(mastery.mShown(r), schedule.mShown(r), JSON.stringify(r));
    }
  });

  await t.test('a clear the day before the test is pulled in front of it (the clamp the card screen applies)', () => {
    const now = Date.UTC(2026, 8, 21, 20, 0, 0);
    const testAt = Date.UTC(2026, 8, 22, 8, 0, 0);          // 12 h away
    const plain = mastery.dueFor(1, now);                    // +1 day → after the test
    assert.ok(plain > testAt, 'the unclamped interval really does land after the test');
    const clamped = schedule.clampDue(plain, { now, testAt });
    assert.ok(clamped < testAt, 'clamped before the test');
    assert.ok(clamped >= now + schedule.CLAMP_MIN_MS, 'never in the past');
  });
});

test('W3: the S4 level ladder has exactly one implementation', async (t) => {
  await t.test('app.js re-exports the ladder from xp.js instead of keeping its own copy', () => {
    const src = read('site/js/app.js');
    assert.match(src, /export \{[^}]*xpForLevel[^}]*\} from '\.\/xp\.js'/, 'app.js must re-export xp.js');
    assert.doesNotMatch(src, /export const xpForLevel\s*=/, 'app.js must not redeclare xpForLevel');
    assert.doesNotMatch(src, /export function levelFor\s*\(/, 'app.js must not redeclare levelFor');
    assert.doesNotMatch(src, /export function rankFor\s*\(/, 'app.js must not redeclare rankFor');
  });
  await t.test('the numbers S4 prints', () => {
    assert.equal(xpForLevel(2), 100);
    assert.equal(xpForLevel(12), 6600);
    assert.equal(levelFor(6600), 12);
    assert.equal(rankFor(1), 'Point');
    assert.equal(rankFor(15), 'Space');
  });
});

test('W3: every screen that exists is registered on a route', () => {
  const idx = read('site/js/screens/index.js');
  const body = idx.split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');
  // Screens that have landed. A new screen file must add its import + registration here (BUILD-POLICY §2).
  const expected = {
    'home.js': "screens['/today']",
    'card.js': "screens['/card/:id']",
    'binder.js': "screens['/binder']",
    'stats.js': "screens['/stats']",
    'settings.js': "screens['/settings']",
  };
  for (const [file, reg] of Object.entries(expected)) {
    assert.match(body, new RegExp(`from '\\./${file.replace('.', '\\.')}'`), `${file} imported`);
    assert.ok(body.includes(reg), `${file} registered as ${reg}`);
  }
  assert.ok(body.includes("screens['/variant/:template']"), 'the Variant route is registered');
});

test('W3: the cross-ticket call sites the wave asked for are wired', async (t) => {
  const card = read('site/js/screens/card.js');
  await t.test('the card screen writes the T10 schedule state', () => {
    assert.match(card, /from '\.\.\/schedule\.js'/, 'card.js imports schedule.js');
    assert.match(card, /clampDue\(/, 'the due date is clamped against the test (notes/T10.md Requests)');
    assert.match(card, /freezeVariant\(/, 'a missed Variant is frozen through T10 writer');
    assert.match(card, /clearRematch\(/, 'a first-try clear closes the Rematch');
    assert.match(card, /lastFirstTry/, 'page.js missedOriginals needs lastFirstTry');
  });
  await t.test('the card screen bumps the T11 trophy counters', () => {
    assert.match(card, /from '\.\.\/trophies\.js'/, 'card.js imports the counter API');
    const owned = Object.entries(COUNTERS).filter(([, v]) => v.owner === 'T09').map(([k]) => k);
    for (const key of owned) assert.ok(card.includes(`'${key}'`), `counter ${key} has a call site in card.js`);
  });
  await t.test("the trophy engine's 'graded' event is emitted", () => {
    assert.match(card, /bus\.emit\('graded'/, "card.js emits 'graded' (notes/T11.md Requests)");
  });
  await t.test('T15 sound is subscribed to the bus', () => {
    const idx = read('site/js/screens/index.js');
    assert.match(idx, /from '\.\.\/sound\.js'/, 'sound.js is imported by the wiring module');
    assert.match(idx, /bus\.on\('sfx'/, "something listens on the 'sfx' cue the screens emit");
  });
});
