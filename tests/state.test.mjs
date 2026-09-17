// tests/state.test.mjs — T01: save schema, migration chain, corrupt → .bak, storage failure fallback,
// the S6 caps, packed disk format, export/import/reset, streak reconciliation, visibilitychange flush,
// the worst-case size bound, and days.js local-date arithmetic.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SAVE_KEY, BAK_KEY, SAVE_VERSION, CAPS, MIGRATIONS,
  fresh, migrate, applyCaps, pack, unpack, reconcileStreak, markStreakDay, createStore,
  UNIT_ID, LEGACY_UNIT_ID, ARCHIVED_KEYS, KEPT_KEYS, archiveUnit, archivedUnits,
} from '../site/js/store.js';
import { todayISO, parseISO, diffDays, addDays, daysUntilTest, dayIndex, nextSchoolDay, weekday, testMoment } from '../site/js/days.js';

const T0 = Date.UTC(2026, 8, 16, 12);   // 2026-09-16 noon UTC — a fixed clock for every store
const SCHEMA_KEYS = ['v', 'unitId', 'profileId', 'createdAt', 'settings', 'xp', 'streak', 'daily', 'cards', 'variants', 'frozen', 'skills',
  'errors', 'counters', 'trophies', 'runs', 'inProgress', 'forecastLog', 'seedCounter', 'placement', 'jumps', 'postTest', 'archive'];

/** In-memory Storage double. `failSet` / `failGet` make the next accesses throw (Safari private mode, quota). */
function fakeStorage(init = {}) {
  const map = new Map(Object.entries(init));
  const st = {
    map, failSet: false, failGet: false,
    getItem: k => { if (st.failGet) throw new Error('SecurityError: getItem'); return map.has(k) ? map.get(k) : null; },
    setItem: (k, v) => { if (st.failSet) throw new Error('QuotaExceededError'); map.set(k, String(v)); },
    removeItem: k => { map.delete(k); },
  };
  return st;
}
const mk = (init, opts = {}) => createStore({ storage: fakeStorage(init), now: () => T0, ...opts });
const disk = store => JSON.parse(store.storageForTest?.map.get(SAVE_KEY));

/* ---------------- worst case (the S6 caps, every field at its cap) ---------------- */
const SHEETS = ['ang', 'wp', 'asn', 'qz', 'fac', 'voc', 'not', 'def', 'fact', 'cls', 'doc', 'quad', 'bonus'];
const SKILLS = ['VOC', 'NOTE', 'CLASS', 'CSARITH', 'PAIRS', 'ASN-PLP', 'ASN-ANG', 'CS-LIN', 'CS-RATIO', 'CS-QUAD', 'SYS', 'FIG-ALG', 'BISECT-L', 'BISECT-Q', 'SEG-ALG', 'FAC1', 'FAC2', 'QUAD-SOLVE', 'QUAD-CTX'];
export function worstCaseSave() {
  const s = fresh(T0);
  for (let i = 0; i < 140; i++) {
    s.cards[`${SHEETS[i % SHEETS.length]}-${String(i).padStart(2, '0')}`] = {
      attempts: 12, cleared: true, rarity: 'silver', foil: false,
      foilProgress: Array.from({ length: CAPS.foilProgress + 4 }, (_, k) => ({ day: `2026-09-${String(10 + k).padStart(2, '0')}`, via: 'T-wp-07#a91f2c' })),
      setupTried: true, bucket: 3, lastAt: T0 + i, due: T0 + i * 1000, hintsUsed: 3, solutionShown: false, bestMs: 123456, placed: false,
      work: 'w'.repeat(CAPS.cardWork + 500),
      history: Array.from({ length: CAPS.history + 5 }, (_, k) => ({ at: T0 + k * 100000, ok: k % 2 === 0, attempt: 2, hints: 1, ms: 123456 })),
    };
  }
  for (let i = 0; i < CAPS.runs + 5; i++) {
    s.runs.push({
      kind: 'mock', n: i, seed: 'mock#' + i, startedAt: T0, submittedAt: T0 + 2400000, limitMs: 2400000, tabAway: 3, status: 'done',
      items: Array.from({ length: 20 }, () => ({ id: 'T-wp-07#a91f2c1', skill: 'CS-RATIO', tier: 3, raw: 'x = 3 or x = -1/2 and 174.5', credit: 0.4, ms: 123456, flagged: true, work: 'k'.repeat(CAPS.workChars + 1000) })),
      score: 81, pred: 88, splits: Array.from({ length: 20 }, (_, k) => 12345 + k), flagged: false,
    });
  }
  for (let i = 0; i < CAPS.errors + 50; i++) s.errors.push({ item: 'T-wp-07#a91f2c1', seed: 'a91f2c1', t: T0 + i, got: 'x = 3 or x = -1/2', tags: ['gave-complement', 'stopped-early'], cleared: i % 3 === 0 });
  for (const k of SKILLS) s.skills[k] = { m: 72.123456789, n: 19, lastAt: T0, lastDueCorrectAt: T0, placedAt: T0 };
  for (let i = 0; i < CAPS.frozen + 100; i++) s.frozen['T-wp-07#' + i.toString(16).padStart(6, '0')] = { seed: 'a91f2c' + i, templateVersion: 3, bucket: i % 3, due: T0 + i * 3600000, forCard: 'wp-07' };
  for (let i = 0; i < 60; i++) s.variants['T-tpl-' + i] = { clearsGold: 12, goldDays: ['2026-09-17', '2026-09-18', '2026-09-19'] };
  for (let i = 0; i < CAPS.daily + 60; i++) s.daily[addDays('2026-01-01', i)] = { xp: 612, clears: 14, goalMet: true, mockDone: true };
  for (let i = 0; i < CAPS.forecastLog + 60; i++) s.forecastLog.push({ day: addDays('2026-01-01', i), r: 73 });
  for (let i = 0; i < 40; i++) s.trophies['sheet-gold:AP-' + i] = { at: T0 };
  for (let i = 0; i < 30; i++) s.counters['counter-name-' + i] = 1234;
  s.inProgress = { kind: 'page', seed: 123456789, queue: Array.from({ length: 24 }, (_, k) => ({ id: 'T-wp-07#a91f2c1', kind: 'variant', seed: 'a91f2c' + k, forCard: 'wp-07', isRematch: false })), idx: 5, hearts: 3, xp: 120, startedAt: T0 };
  s.settings.testDate = '2026-09-22'; s.placement = { done: true, at: T0 }; s.jumps = { M10: true, M9: true };
  return s;
}

/* ================================================================ */
describe('fresh()', () => {
  test('is at SAVE_VERSION with every S6 key and the documented defaults', () => {
    const s = fresh(T0);
    assert.equal(s.v, SAVE_VERSION);
    assert.deepEqual(Object.keys(s).sort(), [...SCHEMA_KEYS].sort());
    assert.deepEqual(s.settings, { theme: 'auto', sound: false, dailyGoal: 400, testDate: null, testTime: '08:00', askReasonOnMiss: true, callYourShot: false });
    assert.deepEqual(s.streak, { count: 0, best: 0, lastDay: null, freezes: 0 });
    assert.equal(s.createdAt, T0);
    assert.ok(typeof s.profileId === 'string' && s.profileId.length >= 8);
    assert.notEqual(fresh(T0).profileId, s.profileId, 'profile ids are unique');
  });
});

describe('migration chain', () => {
  test('every step from 0 to SAVE_VERSION exists and bumps v by exactly one', () => {
    for (let v = 0; v < SAVE_VERSION; v++) {
      assert.equal(typeof MIGRATIONS[v], 'function', `MIGRATIONS[${v}]`);
      assert.equal(MIGRATIONS[v]({ v }).v, v + 1);
    }
  });
  test('an unversioned save migrates to SAVE_VERSION, keeps its data, fills every default', () => {
    const raw = { xp: 320, cards: { 'ang-10': { attempts: 2, cleared: true } }, settings: { theme: 'dark', testDate: '2026-09-22' } };
    const s = migrate(raw, T0);
    assert.equal(s.v, SAVE_VERSION);
    assert.equal(s.xp, 320);
    assert.deepEqual(s.cards['ang-10'], { attempts: 2, cleared: true });
    assert.equal(s.settings.theme, 'dark');
    assert.equal(s.settings.testDate, '2026-09-22');
    assert.equal(s.settings.dailyGoal, 400, 'missing sub-key defaulted');
    assert.deepEqual(Object.keys(s).sort(), [...SCHEMA_KEYS].sort());
    assert.deepEqual(s.streak, { count: 0, best: 0, lastDay: null, freezes: 0 });
  });
  test('is idempotent and coerces bad types', () => {
    const once = migrate({ v: SAVE_VERSION, xp: 'lots', errors: 'nope', settings: { theme: 'blue', dailyGoal: 5000 }, inProgress: 'x' }, T0);
    assert.equal(once.xp, 0); assert.deepEqual(once.errors, []); assert.equal(once.settings.theme, 'auto'); assert.equal(once.settings.dailyGoal, 800); assert.equal(once.inProgress, null);
    assert.deepEqual(migrate(structuredClone(once), T0), once);
  });
  test('rejects non-objects and a broken chain', () => {
    assert.throws(() => migrate(null), TypeError);
    assert.throws(() => migrate([1, 2]), TypeError);
    const step = MIGRATIONS[0]; delete MIGRATIONS[0];
    try { assert.throws(() => migrate({ xp: 1 }), /no migration from save v0/); } finally { MIGRATIONS[0] = step; }
  });
});

/* ================================================================================================
   UNIT HAND-OFF — COMPOSED S8 #19 / T19.
   "`store.migrate` archives the old unit's cards, variants, frozen, runs, errors under
    save.archive[unitId] (never deleted, exportable), keeps xp, streak, trophies, settings, and resets
    skills unless the next unit's skills.js reuses an id."
   Acceptance: a v1 Unit-1A save migrates against a STUB UNIT-1B DATA SET with zero data loss.
   The stub is deliberately a literal here, not an import: the point is that store.js needs nothing
   from the next unit but its id and its skill-id list. See docs/next-unit.md.
   ================================================================================================ */
describe('unit hand-off (S8 #19)', () => {
  /** The stub Unit-1B "data set": its id, and the ids its `data/skills.js` would export.
   *  VOC / NOTE / CLASS / FAC1 / FAC2 are REUSED (Unit 1B still teaches vocabulary, notation, angle
   *  types and factoring); everything else is new, so the 1A mastery for those ids must reset. */
  const U1B = Object.freeze({ id: 'u1b', skills: ['VOC', 'NOTE', 'CLASS', 'FAC1', 'FAC2', 'TRI-CONG', 'PROOF'] });
  const NOW1 = T0 + 30 * 86400000;   // a month of Unit 1A later

  /** A lived-in v1 Unit-1A save: every archived key non-empty, every kept key non-default. */
  function unit1aSave() {
    const s = fresh(T0);
    s.xp = 4820;
    s.streak = { count: 11, best: 14, lastDay: '2026-09-16', freezes: 2 };
    s.daily = { '2026-09-15': { xp: 480, clears: 12, goalMet: true }, '2026-09-16': { xp: 512, clears: 13, goalMet: true } };
    s.trophies = { 'sheet-gold:AP': { at: T0 }, 'first-platinum': { at: T0 + 1000 } };
    s.counters = { cleanInARow: 9, mocksTaken: 3 };
    s.settings = { ...s.settings, theme: 'dark', dailyGoal: 600, testDate: '2026-09-22', sound: true };
    s.seedCounter = 77;
    s.cards = {
      'ang-10': { attempts: 4, cleared: true, rarity: 'gold', setupTried: true, bucket: 3, due: T0 + 4e8,
        history: [{ at: T0, ok: false, attempt: 1, hints: 1, ms: 61000 }, { at: T0 + 500, ok: true, attempt: 2, hints: 1, ms: 44000 }],
        foilProgress: [{ day: '2026-09-15', via: 'T-fig-alg#a1' }], work: 'let x be the angle' },
      'wp-07': { attempts: 1, cleared: true, rarity: 'silver', bucket: 1, due: T0 + 1e8, history: [{ at: T0, ok: true, attempt: 1, hints: 0, ms: 30000 }] },
      'fac-16': { attempts: 2, cleared: false, rarity: null, bucket: 0, due: T0 },
    };
    s.variants = { 'T-cs-lin': { clearsGold: 6, goldDays: ['2026-09-14', '2026-09-15'] } };
    s.frozen = { 'T-cs-lin#a91f2c': { seed: 'a91f2c', templateVersion: 2, bucket: 1, due: T0 + 2e8, forCard: 'wp-07' } };
    s.runs = [
      { kind: 'page', n: 1, seed: 'page#1', startedAt: T0, submittedAt: T0 + 9e5, status: 'done', items: [{ id: 'ang-10', credit: 1, ms: 44000 }] },
      { kind: 'mock', n: 2, seed: 'mock#2', startedAt: T0 + 1e6, submittedAt: T0 + 3.4e6, status: 'done', score: 81, pred: 88,
        items: [{ id: 'wp-07', credit: 0.4, ms: 61000, raw: '68.5', work: 'x + (90 - x)' }] },
    ];
    s.errors = [
      { item: 'wp-07', seed: null, t: T0 + 2e6, got: '68.5', tags: ['gave-complement'], cleared: false },
      { item: 'ang-10', seed: null, t: T0 + 2.1e6, got: '1/2', tags: ['forgot-second-root'], cleared: true },
    ];
    s.skills = {
      VOC: { m: 92.5, n: 14, lastAt: T0, lastDueCorrectAt: T0 },       // reused by 1B → survives
      NOTE: { m: 88, n: 11, lastAt: T0 },                              // reused by 1B → survives
      CLASS: { m: 70, n: 6, lastAt: T0 },                              // reused by 1B → survives
      FAC2: { m: 61, n: 9, lastAt: T0 },                               // reused by 1B → survives
      PAIRS: { m: 74, n: 8, lastAt: T0 },                              // 1A only → archived + reset
      'CS-RATIO': { m: 55, n: 4, lastAt: T0 },                         // 1A only → archived + reset
      'BISECT-Q': { m: 40, n: 2, lastAt: T0, placedAt: T0 },           // 1A only → archived + reset
    };
    s.forecastLog = [{ day: '2026-09-15', r: 68 }, { day: '2026-09-16', r: 73 }];
    s.placement = { done: true, at: T0 };
    s.jumps = { M9: true, M10: true };
    s.postTest = { score: 88 };
    s.inProgress = { kind: 'page', seed: 12345, idx: 3, hearts: 3, xp: 120, startedAt: T0, queue: [{ id: 'ang-10', kind: 'original' }] };
    return s;
  }

  test('the two key sets partition the schema — nothing can fall between archived and kept', () => {
    assert.deepEqual([...ARCHIVED_KEYS, ...KEPT_KEYS].sort(), [...SCHEMA_KEYS].sort(),
      'every save key is either archived with the old unit or kept across the swap');
    assert.equal(new Set([...ARCHIVED_KEYS, ...KEPT_KEYS]).size, SCHEMA_KEYS.length, 'no key in both sets');
    assert.equal(UNIT_ID, 'u1a', 'this build teaches Unit 1A');
    assert.equal(LEGACY_UNIT_ID, 'u1a', 'the pre-unitId default is frozen forever (docs/next-unit.md)');
  });

  test('ZERO DATA LOSS: every archived key lands in archive[u1a] byte-identical, every kept key is untouched', () => {
    const before = unit1aSave();
    const snapshot = structuredClone(before);
    const after = migrate(before, NOW1, { unit: U1B });

    assert.equal(after.unitId, 'u1b', 'the live save now belongs to the next unit');
    const entry = after.archive['u1a'];
    assert.ok(entry, 'archive is filed under the OLD unit id');
    assert.equal(entry.unitId, 'u1a');
    assert.equal(entry.archivedAt, NOW1);
    assert.equal(entry.v, SAVE_VERSION);

    for (const k of ARCHIVED_KEYS) assert.deepEqual(entry[k], snapshot[k], `archive[u1a].${k} === the old ${k}`);
    for (const k of KEPT_KEYS) {
      if (k === 'archive' || k === 'unitId') continue;
      assert.deepEqual(after[k], snapshot[k], `${k} survives the swap untouched`);
    }
    assert.equal(after.xp, 4820); assert.equal(after.streak.count, 11); assert.equal(after.settings.testDate, '2026-09-22');
    assert.deepEqual(after.trophies, snapshot.trophies); assert.deepEqual(after.daily, snapshot.daily);
    assert.deepEqual(after.counters, snapshot.counters); assert.equal(after.seedCounter, 77);
    assert.equal(after.profileId, snapshot.profileId); assert.equal(after.createdAt, snapshot.createdAt);

    assert.deepEqual(entry.stats, { cards: 3, variants: 1, frozen: 1, skills: 7, runs: 2, errors: 2, xpAtArchive: 4820 });
  });

  test('the live save is reset for the new unit — and `skills` keeps exactly the reused ids', () => {
    const after = migrate(unit1aSave(), NOW1, { unit: U1B });
    const blank = fresh(NOW1);
    for (const k of ARCHIVED_KEYS) {
      if (k === 'skills') continue;
      assert.deepEqual(after[k], blank[k], `${k} starts empty under the new unit`);
    }
    assert.deepEqual(Object.keys(after.skills).sort(), ['CLASS', 'FAC2', 'NOTE', 'VOC'],
      'only the skill ids the next unit reuses keep their mastery');
    assert.deepEqual(after.skills.VOC, { m: 92.5, n: 14, lastAt: T0, lastDueCorrectAt: T0 }, 'a reused record is carried over whole');
    for (const id of ['PAIRS', 'CS-RATIO', 'BISECT-Q']) {
      assert.equal(after.skills[id], undefined, `${id} is not in Unit 1B — reset`);
      assert.ok(after.archive['u1a'].skills[id], `${id} is still readable in the archive`);
    }
    assert.equal(after.inProgress, null, 'a half-finished 1A run cannot resume under 1B');
    assert.deepEqual(after.placement, { done: false, at: null }, 'the new unit needs its own placement');
  });

  test('omitting `skills` keeps every mastery record (the caller did not say what the new unit teaches)', () => {
    const after = migrate(unit1aSave(), NOW1, { unit: { id: 'u1b' } });
    assert.deepEqual(Object.keys(after.skills).sort(), Object.keys(unit1aSave().skills).sort());
    assert.deepEqual(after.archive['u1a'].skills, unit1aSave().skills, 'archived all the same');
  });

  test('a save with no `unitId` at all is Unit 1A, not "whatever this build is"', () => {
    const raw = { xp: 40, cards: { 'ang-10': { attempts: 1 } }, skills: { VOC: { m: 50 } } };
    const after = migrate(raw, NOW1, { unit: U1B });
    assert.equal(after.unitId, 'u1b');
    assert.ok(after.archive['u1a'], 'filed under the legacy id, not skipped');
    assert.deepEqual(after.archive['u1a'].cards, { 'ang-10': { attempts: 1 } });
    assert.equal(after.xp, 40);
  });

  test('no unit option, or the same unit: migrate() does nothing about units (every existing caller)', () => {
    const plain = migrate(unit1aSave(), NOW1);
    assert.deepEqual(plain.archive, {}, 'no unit passed → no hand-off');
    assert.equal(plain.unitId, 'u1a');
    assert.equal(Object.keys(plain.cards).length, 3);

    const same = migrate(unit1aSave(), NOW1, { unit: { id: 'u1a', skills: ['VOC'] } });
    assert.deepEqual(same.archive, {}, 'same unit → not an archive event');
    assert.deepEqual(Object.keys(same.skills).sort(), Object.keys(unit1aSave().skills).sort(), 'and no skill reset');
  });

  test('archiveUnit is idempotent and chains — 1A → 1B → 1C keeps all three units', () => {
    const s = migrate(unit1aSave(), NOW1, { unit: U1B });
    const once = structuredClone(s);
    archiveUnit(s, U1B, NOW1 + 1);
    assert.deepEqual(s, once, 'archiving into the unit you are already in is a no-op');

    s.cards['tri-04'] = { attempts: 2, cleared: true };
    s.skills.PROOF = { m: 66, n: 5 };
    archiveUnit(s, { id: 'u1c', skills: ['VOC'] }, NOW1 + 2);
    assert.deepEqual(Object.keys(s.archive).sort(), ['u1a', 'u1b']);
    assert.deepEqual(s.archive['u1b'].cards, { 'tri-04': { attempts: 2, cleared: true } });
    assert.deepEqual(s.archive['u1a'].cards, unit1aSave().cards, 'the first archive is never touched again');
    assert.deepEqual(Object.keys(s.skills), ['VOC'], 'VOC is reused by 1C as well');
    assert.equal(s.unitId, 'u1c');
    assert.deepEqual(archivedUnits(s).map(u => u.key), ['u1b', 'u1a'], 'newest first');
  });

  test('archiving the same unit twice never overwrites — the second lands in u1a~2', () => {
    const s = migrate(unit1aSave(), NOW1, { unit: U1B });
    s.unitId = 'u1a';                                  // e.g. a second 1A save imported into a 1B build
    s.cards = { 'doc-07': { attempts: 1 } };
    archiveUnit(s, U1B, NOW1 + 5);
    assert.deepEqual(Object.keys(s.archive).sort(), ['u1a', 'u1a~2']);
    assert.deepEqual(s.archive['u1a'].cards, unit1aSave().cards);
    assert.deepEqual(s.archive['u1a~2'].cards, { 'doc-07': { attempts: 1 } });
  });

  test('the archive survives pack/unpack, export and import — it is part of the exported JSON', () => {
    const after = migrate(unit1aSave(), NOW1, { unit: U1B });
    const text = JSON.stringify(pack(after));
    assert.ok(text.includes('"archive"'));
    assert.ok(Array.isArray(JSON.parse(text).archive['u1a'].cards['ang-10'].history[0]), 'archived history is packed too');
    const back = unpack(JSON.parse(text));
    assert.deepEqual(back.archive['u1a'].cards['ang-10'].history, unit1aSave().cards['ang-10'].history, 'and unpacks to the object form');
    assert.deepEqual(back, after, 'full round-trip');

    const st = fakeStorage();
    const store = createStore({ storage: st, now: () => NOW1, unit: U1B });
    store.load();
    store.importJSON(text);
    assert.deepEqual(store.getState().archive['u1a'].errors, unit1aSave().errors, 'imported with the archive intact');
    assert.equal(store.getState().unitId, 'u1b');
  });

  test('applyCaps leaves the archive alone (it is history, not working state)', () => {
    const after = migrate(unit1aSave(), NOW1, { unit: U1B });
    const before = structuredClone(after.archive);
    for (let i = 0; i < CAPS.errors + 20; i++) after.errors.push({ item: 'tri-01', t: NOW1 + i, got: 'x', tags: [], cleared: false });
    applyCaps(after);
    assert.equal(after.errors.length, CAPS.errors, 'live errors are capped');
    assert.deepEqual(after.archive, before, 'archived errors are not');
  });

  test('a stored Unit-1A save is handed off on the next open, written back, and flagged for Settings', () => {
    const st = fakeStorage({ [SAVE_KEY]: JSON.stringify(pack(unit1aSave())) });
    const store = createStore({ storage: st, now: () => NOW1, unit: U1B });
    const s = store.load();
    assert.equal(s.unitId, 'u1b');
    assert.equal(store.flags.archivedUnit, 'u1a', 'Settings can say which unit was filed away');
    const onDisk = JSON.parse(st.map.get(SAVE_KEY));
    assert.equal(onDisk.unitId, 'u1b', 'the hand-off is written immediately, not left in memory');
    assert.deepEqual(onDisk.archive['u1a'].runs, unit1aSave().runs);
    assert.equal(onDisk.xp, 4820);
  });

  test('store.migrateUnit() hands over on demand (Settings → "Start the next unit") and persists', () => {
    const st = fakeStorage({ [SAVE_KEY]: JSON.stringify(pack(unit1aSave())) });
    const store = createStore({ storage: st, now: () => NOW1, unit: null });
    assert.equal(store.load().unitId, 'u1a', 'unit: null → the store never hands over by itself');
    const seen = [];
    store.subscribe((_s, why) => seen.push(why));
    const s = store.migrateUnit(U1B);
    assert.equal(s.unitId, 'u1b');
    assert.equal(store.flags.archivedUnit, 'u1a');
    assert.ok(seen.includes('unit'), 'subscribers are told');
    assert.equal(JSON.parse(st.map.get(SAVE_KEY)).unitId, 'u1b', 'flushed');
    assert.deepEqual(JSON.parse(st.map.get(SAVE_KEY)).archive['u1a'].variants, unit1aSave().variants);
  });

  test('this build is a no-op for its own saves: a Unit-1A save never grows an archive under Unit 1A', () => {
    const st = fakeStorage({ [SAVE_KEY]: JSON.stringify(pack(unit1aSave())) });
    const store = createStore({ storage: st, now: () => NOW1 });   // default unit = this build
    const s = store.load();
    assert.equal(s.unitId, 'u1a');
    assert.deepEqual(s.archive, {});
    assert.equal(store.flags.archivedUnit, null);
    assert.equal(Object.keys(s.cards).length, 3, 'nothing was reset');
    assert.equal(Object.keys(s.skills).length, 7, 'no skill was dropped');
  });
});

describe('load()', () => {
  test('empty storage → fresh save written once', () => {
    const st = fakeStorage(); const store = createStore({ storage: st, now: () => T0 });
    const s = store.load();
    assert.equal(s.v, SAVE_VERSION);
    assert.equal(JSON.parse(st.map.get(SAVE_KEY)).profileId, s.profileId);
    assert.equal(store.flags.memoryOnly, false); assert.equal(store.flags.corruptRecovered, false);
    assert.equal(store.dirty, false);
  });
  test('a valid current save loads as-is; an unversioned one is migrated and written back', () => {
    const good = fresh(T0); good.xp = 999;
    const st = fakeStorage({ [SAVE_KEY]: JSON.stringify(good) });
    const store = createStore({ storage: st, now: () => T0 });
    assert.equal(store.load().xp, 999);
    assert.equal(store.load().profileId, good.profileId);
    const st2 = fakeStorage({ [SAVE_KEY]: JSON.stringify({ xp: 5, cards: {} }) });
    const s2 = createStore({ storage: st2, now: () => T0 }).load();
    assert.equal(s2.v, SAVE_VERSION); assert.equal(s2.xp, 5);
    assert.equal(JSON.parse(st2.map.get(SAVE_KEY)).v, SAVE_VERSION, 'migrated save persisted');
  });
  test('getState() before load() loads lazily', () => {
    const store = mk();
    assert.equal(store.getState().v, SAVE_VERSION);
  });
});

describe('corrupt save → .bak', () => {
  for (const [label, raw] of [['truncated JSON', '{"v":1,"xp":12,"cards":{"ang-10":{"att'], ['a JSON array', '[1,2,3]'], ['a JSON number', '42'], ['null', 'null']]) {
    test(`${label} is copied byte-for-byte to ${BAK_KEY} and a fresh save starts`, () => {
      const st = fakeStorage({ [SAVE_KEY]: raw });
      const store = createStore({ storage: st, now: () => T0 });
      const s = store.load();
      assert.equal(st.map.get(BAK_KEY), raw);
      assert.equal(s.v, SAVE_VERSION); assert.equal(s.xp, 0);
      assert.equal(store.flags.corruptRecovered, BAK_KEY);
      assert.ok(store.flags.lastError);
      assert.equal(JSON.parse(st.map.get(SAVE_KEY)).xp, 0, 'fresh save written over the corrupt one');
      assert.equal(store.readBackup(), raw);
    });
  }
});

describe('storage failures fall back to memory + flag', () => {
  test('setItem throwing → memoryOnly flag, state still usable, no throw', () => {
    const st = fakeStorage(); st.failSet = true;
    const store = createStore({ storage: st, now: () => T0 });
    const s = store.load();
    assert.equal(s.v, SAVE_VERSION);
    assert.equal(store.flags.memoryOnly, 'error');
    store.update(x => { x.xp = 10; }, { immediate: true });
    assert.equal(store.getState().xp, 10);
    assert.equal(st.map.has(SAVE_KEY), false);
    st.failSet = false;
    assert.equal(store.save({ immediate: true }), true, 'recovers once storage works again');
    assert.equal(JSON.parse(st.map.get(SAVE_KEY)).xp, 10);
    assert.equal(store.flags.memoryOnly, false);
  });
  test('getItem throwing → fresh in-memory state, flag set, and the unreadable save is NEVER overwritten (reset/import lift the block)', () => {
    const st = fakeStorage({ [SAVE_KEY]: '{"v":1,"xp":4242}' }); st.failGet = true;
    const store = createStore({ storage: st, now: () => T0 });
    assert.equal(store.load().v, SAVE_VERSION);
    assert.equal(store.flags.memoryOnly, 'error');
    assert.equal(store.blocked, true);
    st.failGet = false;
    store.update(s => { s.xp = 1; }, { immediate: true });
    assert.equal(st.map.get(SAVE_KEY), '{"v":1,"xp":4242}', 'a working setItem still does not clobber the save we could not read');
    assert.equal(store.getState().xp, 1, 'the session state still works');
    store.reset();
    assert.equal(store.blocked, false);
    assert.equal(JSON.parse(st.map.get(SAVE_KEY)).xp, 0, 'an explicit reset writes again');
    assert.equal(st.map.has(BAK_KEY), false, 'nothing readable existed to back up');
  });
  test('no storage at all (Node) → memory store, memoryOnly = true', () => {
    const store = createStore({ storage: null, now: () => T0 });
    assert.equal(store.load().v, SAVE_VERSION);
    assert.equal(store.flags.memoryOnly, true);
    store.update(x => { x.xp = 3; }, { immediate: true });
    assert.equal(store.getState().xp, 3);
  });
});

describe('caps (S6)', () => {
  const capped = applyCaps(worstCaseSave());
  test('card history keeps the newest CAPS.history entries', () => {
    for (const c of Object.values(capped.cards)) {
      assert.equal(c.history.length, CAPS.history);
      assert.equal(c.history.at(-1).at, T0 + (CAPS.history + 4) * 100000, 'newest kept');
      assert.equal(c.foilProgress.length, CAPS.foilProgress);
      assert.equal(c.work.length, CAPS.cardWork);
    }
  });
  test('errors: capped at CAPS.errors, oldest CLEARED dropped first, order preserved', () => {
    const before = worstCaseSave().errors;
    const clearedBefore = before.filter(e => e.cleared).length;
    assert.equal(capped.errors.length, CAPS.errors);
    const dropped = before.length - CAPS.errors;
    assert.equal(capped.errors.filter(e => e.cleared).length, clearedBefore - dropped, 'every dropped entry was a cleared one');
    assert.equal(capped.errors.filter(e => !e.cleared).length, before.filter(e => !e.cleared).length, 'no uncleared entry dropped while cleared ones remained');
    for (let i = 1; i < capped.errors.length; i++) assert.ok(capped.errors[i].t > capped.errors[i - 1].t, 'chronological order kept');
    // when nothing is cleared, the oldest go
    const s = fresh(T0); s.errors = Array.from({ length: CAPS.errors + 10 }, (_, i) => ({ item: 'x', t: i, cleared: false }));
    applyCaps(s); assert.equal(s.errors.length, CAPS.errors); assert.equal(s.errors[0].t, 10);
  });
  test('runs: newest CAPS.runs kept; work ≤ CAPS.workChars and only on the CAPS.workRuns most recent Mock-like runs; raw bounded', () => {
    assert.equal(capped.runs.length, CAPS.runs);
    assert.equal(capped.runs[0].n, 5); assert.equal(capped.runs.at(-1).n, CAPS.runs + 4);
    const withWork = capped.runs.filter(r => r.items.some(it => 'work' in it));
    assert.equal(withWork.length, CAPS.workRuns);
    assert.deepEqual(withWork.map(r => r.n), capped.runs.slice(-CAPS.workRuns).map(r => r.n), 'the most recent ones');
    for (const r of withWork) for (const it of r.items) assert.equal(it.work.length, CAPS.workChars);
    for (const r of capped.runs.slice(0, -CAPS.workRuns)) for (const it of r.items) { assert.equal('work' in it, false); assert.equal(it.raw, 'x = 3 or x = -1/2 and 174.5'); assert.equal(it.credit, 0.4); }
    // a page run between mocks never keeps work, and does not use up a work slot
    const s = fresh(T0);
    const item = () => ({ id: 'a', raw: 'r'.repeat(CAPS.rawChars + 50), credit: 1, work: 'w' });
    s.runs = [{ kind: 'mock', n: 0, items: [item()] }, { kind: 'boss:B4', n: 1, items: [item()] }, { kind: 'mock', n: 2, items: [item()] }, { kind: 'page', n: 3, items: [item()] }, { kind: 'baseline', n: 4, items: [item()] }, { kind: 'page', n: 5, items: [item()] }];
    applyCaps(s);
    assert.deepEqual(s.runs.map(r => 'work' in r.items[0]), [true, false, true, false, true, false]);
    assert.equal(s.runs[3].items[0].raw.length, CAPS.rawChars);
  });
  test('frozen: bucket ≥ 3 pruned, then the CAPS.frozen soonest-due kept', () => {
    const keys = Object.keys(capped.frozen);
    assert.equal(keys.length, CAPS.frozen);
    for (const k of keys) assert.ok(capped.frozen[k].bucket < 3);
    const dues = keys.map(k => capped.frozen[k].due);
    const all = Object.values(worstCaseSave().frozen).filter(f => f.bucket < 3).map(f => f.due).sort((a, b) => a - b);
    assert.equal(Math.max(...dues), all[CAPS.frozen - 1]);
  });
  test('daily and forecastLog keep the newest entries', () => {
    const days = Object.keys(capped.daily).sort();
    assert.equal(days.length, CAPS.daily);
    assert.equal(days.at(-1), addDays('2026-01-01', CAPS.daily + 59));
    assert.equal(capped.forecastLog.length, CAPS.forecastLog);
    assert.equal(capped.forecastLog.at(-1).day, addDays('2026-01-01', CAPS.forecastLog + 59));
  });
  test('applyCaps leaves an already-capped save untouched and tolerates junk records', () => {
    const again = applyCaps(structuredClone(capped));
    assert.deepEqual(again, capped);
    const s = fresh(T0); s.cards.bad = 'nope'; s.frozen.bad = 7; s.runs.push('x', { kind: 'mock' });
    assert.doesNotThrow(() => applyCaps(s));
    assert.equal('bad' in s.cards, false); assert.equal('bad' in s.frozen, false);
  });
});

describe('packed disk format', () => {
  test('history and foilProgress are tuples on disk, objects in memory; unknown shapes pass through', () => {
    const s = fresh(T0);
    s.cards['wp-01'] = { history: [{ at: 1, ok: true, attempt: 1, hints: 0, ms: 5 }, { at: 2, ok: false, attempt: 2, hints: 1, ms: 6, extra: 'kept' }], foilProgress: [{ day: '2026-09-17', via: 'review' }], work: 'w' };
    const p = pack(s);
    assert.deepEqual(p.cards['wp-01'].history[0], [1, 1, 1, 0, 5]);
    assert.deepEqual(p.cards['wp-01'].history[1], { at: 2, ok: false, attempt: 2, hints: 1, ms: 6, extra: 'kept' });
    assert.deepEqual(p.cards['wp-01'].foilProgress[0], ['2026-09-17', 'review']);
    assert.deepEqual(s.cards['wp-01'].history[0], { at: 1, ok: true, attempt: 1, hints: 0, ms: 5 }, 'pack never mutates the state');
    const u = unpack(JSON.parse(JSON.stringify(p)));
    assert.deepEqual(u, s);
    assert.deepEqual(unpack(structuredClone(s)), s, 'unpack accepts the plain form too');
  });
  test('load() returns the object form from a packed disk save', () => {
    const s = fresh(T0); s.cards['ang-10'] = { history: [{ at: 1, ok: true, attempt: 1, hints: 0, ms: 5 }] };
    const st = fakeStorage({ [SAVE_KEY]: JSON.stringify(pack(s)) });
    const loaded = createStore({ storage: st, now: () => T0 }).load();
    assert.deepEqual(loaded.cards['ang-10'].history[0], { at: 1, ok: true, attempt: 1, hints: 0, ms: 5 });
  });
});

describe('size bound', () => {
  test('a save with EVERY cap saturated stays under the budget (see notes/T01.md for the arithmetic)', () => {
    const BUDGET = 500_000;   // chars of JSON ≈ 1 MB of the 5 MB localStorage quota (UTF-16)
    const s = applyCaps(worstCaseSave());
    const text = JSON.stringify(pack(s));
    const parts = Object.fromEntries(Object.keys(s).map(k => [k, JSON.stringify(pack(s)[k]).length]));
    console.log(`  worst-case save: ${text.length} chars (cards ${parts.cards}, runs ${parts.runs}, errors ${parts.errors}, frozen ${parts.frozen})`);
    assert.ok(text.length < BUDGET, `worst case ${text.length} ≥ ${BUDGET}`);
    assert.deepEqual(applyCaps(unpack(JSON.parse(text))), s, 'round-trips through disk unchanged');
  });
});

describe('update / save / flush', () => {
  test('update mutates, notifies subscribers, debounces the write; flush writes now', async () => {
    const st = fakeStorage(); const store = createStore({ storage: st, now: () => T0, debounceMs: 20 });
    store.load();
    const seen = []; const off = store.subscribe((s, why) => seen.push([why, s.xp]));
    store.update(s => { s.xp += 40; });
    assert.equal(store.dirty, true);
    assert.equal(JSON.parse(st.map.get(SAVE_KEY)).xp, 0, 'not written synchronously');
    await new Promise(r => setTimeout(r, 40));
    assert.equal(JSON.parse(st.map.get(SAVE_KEY)).xp, 40, 'written after the debounce');
    assert.equal(store.dirty, false);
    store.update(s => { s.xp += 2; });
    assert.equal(store.flush(), true);
    assert.equal(JSON.parse(st.map.get(SAVE_KEY)).xp, 42);
    assert.deepEqual(seen, [['update', 40], ['update', 42]]);
    off();
    store.update(s => { s.xp = 0; });
    assert.equal(seen.length, 2, 'unsubscribed');
  });
  test('update may return a replacement object; caps are re-applied on every update', () => {
    const store = mk(); store.load();
    store.update(s => ({ ...s, xp: 7 }), { immediate: true });
    assert.equal(store.getState().xp, 7);
    store.update(s => { s.errors = Array.from({ length: CAPS.errors + 1 }, (_, i) => ({ item: 'x', t: i, cleared: false })); });
    assert.equal(store.getState().errors.length, CAPS.errors);
  });
  test('visibilitychange (hidden) and pagehide flush the pending write', () => {
    const listeners = {};
    const win = { addEventListener: (e, fn) => { listeners['w:' + e] = fn; } };
    const doc = { visibilityState: 'visible', addEventListener: (e, fn) => { listeners[e] = fn; }, defaultView: win };
    const st = fakeStorage(); const store = createStore({ storage: st, now: () => T0, doc, debounceMs: 60_000 });
    store.load(); store.update(s => { s.xp = 11; });
    assert.equal(JSON.parse(st.map.get(SAVE_KEY)).xp, 0);
    doc.visibilityState = 'hidden'; listeners.visibilitychange();
    assert.equal(JSON.parse(st.map.get(SAVE_KEY)).xp, 11);
    store.update(s => { s.xp = 12; }); listeners['w:pagehide']();
    assert.equal(JSON.parse(st.map.get(SAVE_KEY)).xp, 12);
  });
});

describe('export / import / reset', () => {
  test('export → import round-trips the whole state into another store', () => {
    const a = mk(); a.load(); a.update(s => { s.xp = 500; s.cards['wp-01'] = { cleared: true, history: [{ at: 1, ok: true, attempt: 1, hints: 0, ms: 5 }] }; }, { immediate: true });
    const text = a.exportJSON();
    assert.equal(JSON.parse(text).cards['wp-01'].history[0].length, 5, 'export is the packed disk format');
    const st = fakeStorage(); const b = createStore({ storage: st, now: () => T0 }); b.load();
    b.update(s => { s.xp = 1; }, { immediate: true });
    const imported = b.importJSON(text);
    assert.deepEqual(imported, a.getState());
    assert.equal(JSON.parse(st.map.get(SAVE_KEY)).xp, 500, 'written immediately');
    assert.equal(JSON.parse(st.map.get(BAK_KEY)).xp, 1, 'the previous save was backed up first');
  });
  test('import rejects garbage with a readable message and leaves the state alone', () => {
    const store = mk(); store.load(); store.update(s => { s.xp = 9; }, { immediate: true });
    assert.throws(() => store.importJSON('{oops'), /not valid JSON/);
    assert.throws(() => store.importJSON('[1,2]'), /not a save object/);
    assert.throws(() => store.importJSON('{"hello":"world"}'), /none of the save fields/);
    assert.throws(() => store.importJSON(JSON.stringify({ v: SAVE_VERSION + 1, xp: 1 })), new RegExp(`v${SAVE_VERSION + 1}`));
    assert.equal(store.getState().xp, 9);
  });
  test('import migrates an unversioned export and applies caps', () => {
    const store = mk(); store.load();
    const s = store.importJSON(JSON.stringify({ xp: 3, errors: Array.from({ length: CAPS.errors + 5 }, (_, i) => ({ t: i, cleared: false })) }));
    assert.equal(s.v, SAVE_VERSION); assert.equal(s.xp, 3); assert.equal(s.errors.length, CAPS.errors);
  });
  test('reset backs up, starts fresh, writes now, keeps a new profileId', () => {
    const st = fakeStorage(); const store = createStore({ storage: st, now: () => T0 }); store.load();
    const oldId = store.getState().profileId;
    store.update(s => { s.xp = 77; }, { immediate: true });
    const s = store.reset();
    assert.equal(s.xp, 0); assert.notEqual(s.profileId, oldId);
    assert.equal(JSON.parse(st.map.get(SAVE_KEY)).xp, 0);
    assert.equal(JSON.parse(st.map.get(BAK_KEY)).xp, 77);
  });
});

describe('streak (S4): lazy freeze reconciliation + daily goal', () => {
  const streak = (count, lastDay, freezes, best = count) => { const s = fresh(T0); s.streak = { count, best, lastDay, freezes }; return s; };
  test('counted yesterday or today → untouched', () => {
    assert.deepEqual(reconcileStreak(streak(4, '2026-09-15', 1), '2026-09-16').streak, { count: 4, best: 4, lastDay: '2026-09-15', freezes: 1 });
    assert.deepEqual(reconcileStreak(streak(4, '2026-09-16', 1), '2026-09-16').streak, { count: 4, best: 4, lastDay: '2026-09-16', freezes: 1 });
    assert.deepEqual(reconcileStreak(streak(0, null, 0), '2026-09-16').streak, { count: 0, best: 0, lastDay: null, freezes: 0 });
  });
  test('one missed day with a freeze → freeze consumed, chain intact through yesterday', () => {
    assert.deepEqual(reconcileStreak(streak(5, '2026-09-13', 1), '2026-09-15').streak, { count: 5, best: 5, lastDay: '2026-09-14', freezes: 0 });
  });
  test('two missed days, two freezes → both consumed; with one → reset at the uncovered gap, best kept', () => {
    assert.deepEqual(reconcileStreak(streak(10, '2026-09-10', 2), '2026-09-13').streak, { count: 10, best: 10, lastDay: '2026-09-12', freezes: 0 });
    assert.deepEqual(reconcileStreak(streak(10, '2026-09-10', 1), '2026-09-13').streak, { count: 0, best: 10, lastDay: null, freezes: 0 });
  });
  test('load() reconciles across a month boundary with no freezes', () => {
    const s = streak(3, '2026-08-30', 0);
    const st = fakeStorage({ [SAVE_KEY]: JSON.stringify(s) });
    const loaded = createStore({ storage: st, now: () => Date.UTC(2026, 8, 2, 12) }).load();
    assert.equal(loaded.streak.count, 0); assert.equal(loaded.streak.best, 3);
  });
  test('markStreakDay counts consecutive days, is idempotent per day, earns a freeze per 5 (max 2), resets after a gap', () => {
    const s = fresh(T0);
    let d = '2026-09-01';
    for (let i = 1; i <= 12; i++) { markStreakDay(s, d); markStreakDay(s, d); d = addDays(d, 1); }
    assert.deepEqual(s.streak, { count: 12, best: 12, lastDay: '2026-09-12', freezes: 2 });
    markStreakDay(s, '2026-09-20');    // 7 missed days, 2 freezes → gap → new streak of 1
    assert.deepEqual(s.streak, { count: 1, best: 12, lastDay: '2026-09-20', freezes: 0 });
  });
});

describe('days.js — local calendar arithmetic', () => {
  test('todayISO uses local y/m/d, never UTC', () => {
    const d = new Date(2026, 8, 16, 23, 59); assert.equal(todayISO(d), '2026-09-16');
    const e = new Date(2026, 0, 1, 0, 0); assert.equal(todayISO(e), '2026-01-01');
  });
  test('parseISO validates real dates', () => {
    assert.deepEqual(parseISO('2026-02-28'), { y: 2026, m: 2, d: 28 });
    assert.equal(parseISO('2026-02-30'), null); assert.equal(parseISO('2026-13-01'), null); assert.equal(parseISO('9/16/2026'), null); assert.equal(parseISO(null), null);
  });
  test('diffDays / addDays across month, year and DST boundaries', () => {
    assert.equal(diffDays('2026-09-16', '2026-09-22'), 6);
    assert.equal(diffDays('2026-09-22', '2026-09-16'), -6);
    assert.equal(diffDays('2026-03-07', '2026-03-09'), 2, 'US DST start weekend');
    assert.equal(diffDays('2026-10-31', '2026-11-02'), 2, 'EU DST end weekend');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01'); assert.equal(addDays('2026-03-01', -1), '2026-02-28'); assert.equal(addDays('2028-02-28', 1), '2028-02-29');
    assert.ok(Number.isNaN(diffDays('x', '2026-01-01')));
  });
  test('daysUntilTest: whole local days, 0 on the day, negative after, null when unset', () => {
    assert.equal(daysUntilTest('2026-09-22', '2026-09-16'), 6);
    assert.equal(daysUntilTest('2026-09-22', '2026-09-22'), 0);
    assert.equal(daysUntilTest('2026-09-22', '2026-09-23'), -1);
    assert.equal(daysUntilTest(null, '2026-09-16'), null); assert.equal(daysUntilTest('bogus', '2026-09-16'), null);
    for (let h = 0; h < 24; h++) assert.equal(daysUntilTest('2026-09-22', todayISO(new Date(2026, 8, 16, h))), 6, `hour ${h}`);
  });
  test('dayIndex: days since the creation day, from ms / Date / ISO, never negative', () => {
    assert.equal(dayIndex(new Date(2026, 8, 14, 22, 30).getTime(), '2026-09-16'), 2);
    assert.equal(dayIndex(new Date(2026, 8, 16, 0, 1), '2026-09-16'), 0);
    assert.equal(dayIndex('2026-09-10', '2026-09-16'), 6);
    assert.equal(dayIndex('2026-09-20', '2026-09-16'), 0);
  });
  test('weekday / nextSchoolDay / testMoment', () => {
    assert.equal(weekday('2026-09-16'), 3);
    assert.equal(nextSchoolDay('2026-09-16'), '2026-09-18');
    assert.equal(nextSchoolDay('2026-09-17'), '2026-09-21', 'skips the weekend');
    assert.equal(nextSchoolDay('2026-09-18', 1), '2026-09-21');
    assert.equal(testMoment('2026-09-22', '08:00'), new Date(2026, 8, 22, 8, 0).getTime());
    assert.equal(testMoment('2026-09-22'), new Date(2026, 8, 22, 8, 0).getTime());
    assert.equal(testMoment(null), null);
  });
});
