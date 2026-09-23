// tests/job-save.test.mjs — the game's save: the schema, the migration, the day, the reload.
//
// AUTHORITY: designs/CUT-BRIEF.md, designs/CUT-SPEC.md §8; BUILD-POLICY overrides both.
//
// The old suite priced a 12-target job's 26 KB of save — a 50-call rating window, the crew map, a
// 68-tag Fault Index, a heat window, a 30-job log, a Backcheck purse and a 24-key `inProgress.game`.
// All of it is cut. What is left is small enough to assert exactly rather than bound:
//
//   1. the two copies of the schema — `data/job.js SAVE_DEFAULTS` and `store.js freshPlayer()` /
//      `freshGame()` — are deep-equal in BOTH directions, and hold nothing that can grow;
//   2. the v2 → v3 migration drops the cut keys and touches NOTHING else — every other key of a v2
//      save survives it byte for byte, and a half-answered page survives with them;
//   3. THE SAVE LAYER NEVER LOWERS A NUMBER THE STUDENT EARNED and never invents one: over the whole
//      state space, `normalize`, `migrate`, `applyCaps` and the disk codec are the identity on the
//      game's three integers (CUT-BRIEF math #6 and #8 at the save layer, where they are enforceable
//      once for every surface instead of once per surface);
//   4. the day rolls over, because `game.today` printed on the wrong day is a number the engine never
//      computed (CUT-BRIEF: "No number on any surface that is not exactly the number the engine
//      computes");
//   5. `inProgress.game` is exactly `IN_PROGRESS_KEYS`, survives the disk, and a killed tab restores
//      the session with its seed PINNED;
//   6. the whole game layer costs a save under a kilobyte.
//
// Coupling to `js/job/state.js` (another lane's module) is deliberately limited to the verbs
// CUT-SPEC §8 names — `startJob`, `call` — and to the save keys they write. The record's own
// repair (`deserialize` on junk) belongs to that lane's tests; what is asserted here is that the save
// layer carries whatever the record holds, unchanged, and never throws on it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SAVE_VERSION, SAVE_KEY, MIGRATIONS, KEPT_KEYS, ARCHIVED_KEYS, CAPS,
  fresh, migrate, pack, unpack, applyCaps, reconcileGameDay, deferredPile, createStore,
  freshPlayer, freshGame, normalizePlayer, normalizeGame,
} from '../site/js/store.js';
import { SAVE_DEFAULTS, IN_PROGRESS_KEYS } from '../site/data/job.js';
import * as state from '../site/js/job/state.js';
import { todayISO, addDays } from '../site/js/days.js';
import { listFiles } from './_helpers.mjs';

const NOW = new Date(2026, 8, 16, 18, 0).getTime();
const TODAY = todayISO(new Date(NOW));
const clone = (x) => structuredClone(x);
/** A round trip through the disk: in-memory → packed JSON text → parsed → in-memory. */
const throughDisk = (s) => unpack(JSON.parse(JSON.stringify(pack(s))));

/**
 * Every points value the app can hold, and a few it never will. 0…400 covers the whole reachable
 * pile (12 questions × the biggest pay 10 × the biggest streak 5 = 600, banked in any split), and the
 * tail is there because a cap or a clip would bite at a round number long before it.
 */
const POINTS = (() => {
  const out = [];
  for (let n = 0; n <= 400; n++) out.push(n);
  for (const n of [499, 500, 501, 599, 600, 601, 999, 1000, 1001, 4096, 65535, 99999, 1e6]) out.push(n);
  return out;
})();

/* ========================================================================================== */
describe('the schema is declared once, in two places that cannot drift', () => {
  test('`data/job.js SAVE_DEFAULTS` and `store.js` are deep-equal in both directions', () => {
    assert.deepEqual(freshPlayer(), SAVE_DEFAULTS.player, 'store.freshPlayer() is not data/job.js SAVE_DEFAULTS.player');
    assert.deepEqual(SAVE_DEFAULTS.player, freshPlayer(), '…and the other way round');
    assert.deepEqual(freshGame(), SAVE_DEFAULTS.game, 'store.freshGame() is not data/job.js SAVE_DEFAULTS.game');
    assert.deepEqual(SAVE_DEFAULTS.game, freshGame(), '…and the other way round');
  });

  test('the two keys are exactly what the cut design keeps, and nothing else', () => {
    assert.deepEqual(Object.keys(freshPlayer()), ['best']);
    assert.deepEqual(Object.keys(freshGame()), ['today', 'day']);
  });

  test('nothing in the game\'s save can grow — three scalars, no collection to fill', () => {
    for (const [key, obj] of [['player', freshPlayer()], ['game', freshGame()]]) {
      for (const [k, v] of Object.entries(obj)) {
        assert.ok(v === null || typeof v === 'number' || typeof v === 'string',
          `save.${key}.${k} is a ${Array.isArray(v) ? 'collection' : typeof v} — the old layer's 68 tags, 50 calls and 30-job log all began as one of these`);
      }
    }
  });

  test('`CAPS` has no game knob, and must never grow one', () => {
    assert.equal('game' in CAPS, false,
      'a cap is a tuning knob; the game\'s save is bounded by construction (notes/DEMOLISH.md §3)');
  });

  test('`player` survives a unit handoff and `game` is archived with the unit', () => {
    assert.ok(KEPT_KEYS.includes('player'), 'the best day is a statement about the STUDENT');
    assert.ok(ARCHIVED_KEYS.includes('game'), "today's points are a statement about THIS unit's sitting");
  });

  test('both normalizers are total and idempotent', () => {
    for (const junk of [null, undefined, 0, 'x', [], { best: 'nope' }, { today: -5, day: 7 }]) {
      const p = normalizePlayer(junk);
      const g = normalizeGame(junk);
      assert.deepEqual(normalizePlayer(p), p, `normalizePlayer is not idempotent on ${JSON.stringify(junk)}`);
      assert.deepEqual(normalizeGame(g), g, `normalizeGame is not idempotent on ${JSON.stringify(junk)}`);
      assert.ok(Number.isInteger(p.best) && p.best >= 0, 'best must be a non-negative integer');
      assert.ok(Number.isInteger(g.today) && g.today >= 0, 'today must be a non-negative integer');
      assert.ok(g.day === null || typeof g.day === 'string', 'day must be an ISO string or null');
    }
  });

  test('a fresh save is at the new version and carries both keys', () => {
    const s = fresh(NOW);
    assert.equal(s.v, SAVE_VERSION);
    assert.equal(SAVE_VERSION, 3);
    assert.deepEqual(s.player, freshPlayer());
    assert.deepEqual(s.game, freshGame());
  });
});

/* ========================================================================================== */
describe('the v2 → v3 migration drops the cut keys and touches nothing else', () => {
  /** A v2 save with the OLD game keys on it, plus a half-answered page. */
  const v2Save = () => ({
    v: 2,
    unitId: 'u1a',
    profileId: 'save-test',
    createdAt: NOW - 5 * 86400000,
    settings: { theme: 'dark', dailyGoal: 500, game: true, testDate: '2026-09-30' },
    xp: 1234,
    streak: { count: 4, best: 9, lastDay: TODAY, freezes: 1 },
    daily: { [TODAY]: { xp: 120, clears: 6, goalMet: false } },
    counters: { pages: 7, clears: 91 },
    trophies: { 'flawless-page': { at: NOW } },
    cards: { 'm1-01': { cleared: true, bucket: 3, history: [] } },
    variants: { 'T-cs-lin-01': { clears: 2, clearsGold: 1, goldDays: [TODAY] } },
    frozen: {},
    skills: { VOC: { m: 70, n: 5 } },
    errors: [{ item: 'm1-01', t: NOW }],
    runs: [{ kind: 'page', status: 'done', items: [] }],
    forecastLog: [{ day: TODAY, r: 61 }],
    placement: {}, jumps: {}, postTest: {}, archive: {}, seedCounter: 3,
    inProgress: {
      kind: 'page', seed: 9876, seedTag: 'abc123', idx: 2,
      queue: [{ n: 1, id: 'a' }, { n: 2, id: 'b' }, { n: 3, id: 'c' }],
      startedAt: NOW, day: TODAY, dayIndex: 0, pageIndex: 0, meta: {},
      /* the OLD machine's live record, which v3 drops */
      game: { shape: 'JOB12', loose: 118, bagged: 240, chain: 5, calls: [{ call: 85, ok: true }] },
    },
    /* the OLD keys */
    player: {
      rating: { calls: [{ p: 0.85, ok: true, w: 0.51 }], value: 7.4, n: 22 },
      rank: 3,
      elo: { player: 1180, house: 1020 },
      records: { bestBag: 419, bestChain: 8, bestRating20: 8.1, bestRating: 7.9, cleanJobs: 2, cracked: 1, walked: 3, cleanGetaway: true },
    },
    game: {
      crew: { VOC: 2, PAIRS: 1 },
      heat: { press: { RECALL: 2 }, weight: 3, jobs: 4, window: [{ press: {}, posted: 200 }] },
      tags: { 'comp-supp-1': { resolved: 3, triggered: 5, days: 2, lastDay: TODAY, cleared: true, sealed: true } },
      backchecks: { held: 2, mintedDay: TODAY },
      ledger: { jobs: 12, tGame: 90000, tAnswer: 300000, phaseMeans: { board: 18 }, debriefAt: NOW },
      log: [{ day: TODAY, bagged: 240, posted: 500 }],
      commit: { kind: 'walk', byMin: 12, honored: 1, bound: true },
    },
  });

  test('every key that is not `player`, `game` or `inProgress.game` is byte-identical after the migration', () => {
    const before = v2Save();
    const after = MIGRATIONS[2](clone(before));
    assert.equal(after.v, 3);
    for (const k of Object.keys(before)) {
      if (k === 'v' || k === 'player' || k === 'game' || k === 'inProgress') continue;
      assert.deepEqual(after[k], before[k], `the migration touched \`${k}\``);
    }
  });

  test('the cut keys are dropped to the new defaults — not carried over in a currency that no longer exists', () => {
    const after = MIGRATIONS[2](v2Save());
    assert.deepEqual(after.player, freshPlayer(), 'the old records were carried into `best`');
    assert.deepEqual(after.game, freshGame(), 'the old ledger was carried into `today`');
    assert.equal(after.player.best, 0, 'a `best` the student never earned in points would be a number the engine never computed');
  });

  test('NO old number reaches the new keys, whatever the old save was worth', () => {
    // One `bestBag: 419` proves nothing: the number the old layer would hand over differs per field,
    // and a migration that carried ANY of them would print a number the engine never computed.
    const old = v2Save();
    let checked = 0;
    for (const n of [1, 7, 8, 9, 10, 26, 186, 274, 419, 526, 9999]) {
      const cases = [
        { ...clone(old), player: { ...clone(old.player), records: { ...old.player.records, bestBag: n } } },
        { ...clone(old), player: { ...clone(old.player), rating: { calls: [], value: n, n } } },
        { ...clone(old), player: { ...clone(old.player), rank: n, elo: { player: 1000 + n, house: n } } },
        { ...clone(old), game: { ...clone(old.game), log: [{ day: TODAY, bagged: n, posted: n * 2 }] } },
        { ...clone(old), game: { ...clone(old.game), ledger: { jobs: n, tGame: n, tAnswer: n, phaseMeans: {}, debriefAt: NOW } } },
      ];
      for (const s of cases) {
        const out = migrate(s, NOW);
        assert.equal(out.player.best, 0, `an old number (${n}) reached player.best`);
        assert.equal(out.game.today, 0, `an old number (${n}) reached game.today`);
        assert.equal(out.game.day, null, 'an old day reached game.day');
        checked++;
      }
    }
    assert.equal(checked, 55);
  });

  test('a live OLD session record is dropped and the PAGE it was running is left alone', () => {
    const before = v2Save();
    const after = MIGRATIONS[2](clone(before));
    assert.equal(Object.hasOwn(after.inProgress, 'game'), false, 'the old job record survived');
    for (const k of Object.keys(before.inProgress)) {
      if (k === 'game') continue;
      assert.deepEqual(after.inProgress[k], before.inProgress[k], `the migration touched inProgress.${k}`);
    }
    assert.equal(after.inProgress.queue.length, 3, 'an unanswered question left the schedule');
    assert.equal(after.inProgress.idx, 2, 'the page pointer moved');
  });

  test('the migration does not depend on any other key being present, and `migrate` is idempotent', () => {
    const bare = MIGRATIONS[2]({ v: 2 });
    assert.deepEqual(bare.player, freshPlayer());
    assert.deepEqual(bare.game, freshGame());
    const once = migrate(v2Save(), NOW);
    const twice = migrate(clone(once), NOW);
    assert.deepEqual(twice, once, 'migrate is not idempotent at v3');
  });

  test('a v1 save still walks the whole chain, and a corrupt key falls back alone', () => {
    const v1 = { v: 1, xp: 55, settings: {}, cards: {}, skills: {} };
    const out = migrate(v1, NOW);
    assert.equal(out.v, SAVE_VERSION);
    assert.equal(out.xp, 55, 'the chain lost a v1 key');
    const corrupt = migrate({ ...v2Save(), player: 'nonsense', game: 42 }, NOW);
    assert.deepEqual(corrupt.player, freshPlayer());
    assert.deepEqual(corrupt.game, freshGame());
    assert.equal(corrupt.xp, 1234, 'a corrupt game key took a sibling down with it');
  });
});

/* ========================================================================================== */
describe('the save layer never lowers a number the student earned, and never invents one', () => {
  // CUT-BRIEF math #6 ("improving never costs") and #8 ("`save.game.today` never decreases") are
  // properties of the ENGINE, but every one of them is also a property of the layer the engine's
  // numbers pass through on the way to disk and back. A cap, a clip, a round or a rescale here would
  // lower a number the student earned without any surface being able to see it happen.

  test('`normalizePlayer` / `normalizeGame` are the identity on every value the engine can produce', () => {
    for (const n of POINTS) {
      assert.equal(normalizePlayer({ best: n }).best, n, `normalizePlayer moved best ${n}`);
      assert.equal(normalizeGame({ today: n, day: TODAY }).today, n, `normalizeGame moved today ${n}`);
      assert.equal(normalizeGame({ today: n, day: TODAY }).day, TODAY, 'normalizeGame moved the day');
    }
    assert.equal(POINTS.length, 414);
  });

  test('a full `migrate` is the identity on both numbers, over the same range', () => {
    for (const n of POINTS) {
      const s = fresh(NOW);
      s.player.best = n;
      s.game = { today: n, day: TODAY };
      const out = migrate(clone(s), NOW);
      assert.equal(out.player.best, n, `migrate moved best ${n}`);
      assert.equal(out.game.today, n, `migrate moved today ${n}`);
    }
  });

  test('the disk codec is the identity on both numbers, over the same range', () => {
    for (const n of POINTS) {
      const s = fresh(NOW);
      s.player.best = n;
      s.game = { today: n, day: TODAY };
      const back = throughDisk(clone(s));
      assert.deepEqual(back.player, { best: n }, `the disk moved best ${n}`);
      assert.deepEqual(back.game, { today: n, day: TODAY }, `the disk moved today ${n}`);
    }
  });

  test('`applyCaps` is the identity on the game keys over the WHOLE state space, not a sample', () => {
    // Every (pile, streak) the record can hold — 401 × 5 — with the two banked numbers set to the
    // pile so a trim on any of the three would show. The old layer capped four collections here.
    let checked = 0;
    for (let pile = 0; pile <= 400; pile++) {
      for (let streak = 1; streak <= 5; streak++) {
        const s = fresh(NOW);
        s.player.best = pile;
        s.game = { today: pile, day: TODAY };
        s.inProgress = {
          kind: 'page', seed: 42, idx: 0, queue: [{ n: 1, id: 'a' }],
          game: { pile, streak, call: { id: 'sure', at: NOW }, answered: 9, tGame: 41000, tAnswer: 96000, seed: '42' },
        };
        const before = clone({ player: s.player, game: s.game, record: s.inProgress.game });
        applyCaps(s);
        assert.deepEqual({ player: s.player, game: s.game, record: s.inProgress.game }, before,
          `applyCaps moved a game number at pile ${pile} streak ${streak}`);
        checked++;
      }
    }
    assert.equal(checked, 2005);
  });

  test('a junk record is carried by the save layer unchanged — it repairs nothing and throws on nothing', () => {
    // The record's repair is `job/state.js`'s (`deserialize`). The save layer's contract is narrower
    // and absolute: whatever is in the slot reaches the disk and comes back byte for byte, so a
    // reload can never be the thing that changed a number.
    for (const junk of [{}, { pile: -5, streak: 99 }, { pile: 12, streak: 3, call: { id: 'nope' } }, { extra: 'field' }]) {
      const s = fresh(NOW);
      s.inProgress = { kind: 'page', seed: 1, idx: 0, queue: [{ n: 1, id: 'a' }], game: clone(junk) };
      const back = migrate(throughDisk(clone(s)), NOW);
      assert.deepEqual(back.inProgress.game, junk, `the save layer edited the record ${JSON.stringify(junk)}`);
    }
  });
});

/* ========================================================================================== */
describe('the day rolls over, so no surface can print yesterday\'s points as today\'s', () => {
  test("today's points survive a reload, untouched", () => {
    const s = fresh(NOW);
    s.player.best = 274;
    s.game = { today: 186, day: TODAY };
    reconcileGameDay(s, TODAY);
    assert.deepEqual(s.game, { today: 186, day: TODAY }, 'a reload on the same day moved today\'s points');
    assert.equal(s.player.best, 274, 'a reload lowered the best day');
  });

  test("yesterday's points do NOT", () => {
    const yest = addDays(TODAY, -1);
    const s = fresh(NOW);
    s.player.best = 274;
    s.game = { today: 186, day: yest };
    reconcileGameDay(s, TODAY);
    assert.equal(s.game.today, 0, "yesterday's points are still being printed as today's");
    /* The roll STAMPS today rather than clearing the day. `job/state.js bank()` reads no clock and
       adds its points to whatever day this left behind, so a `null` here would make the NEXT
       reconcile roll away points that had just been banked. */
    assert.equal(s.game.day, TODAY, 'the roll left a day that is not the one the points would land on');
    assert.equal(s.player.best, 274, 'the rollover lowered the best day — the points were BANKED');
  });

  test('the day that is CLOSING is floored into `best` before the roll zeroes it', () => {
    /* The floor used to run after the roll, so it read the `0` it had just written and the closing
       day was thrown away in exactly the case the floor exists for: a save that arrives with the two
       disagreeing. 186 points were banked on a day that happened; `best` is the best single day. */
    for (const n of POINTS) {
      const s = fresh(NOW);
      s.player.best = 9;
      s.game = { today: n, day: addDays(TODAY, -1) };
      reconcileGameDay(s, TODAY);
      assert.equal(s.player.best, Math.max(9, n), `a ${n}-point day closed without reaching best`);
      assert.equal(s.game.today, 0, 'the closing day stayed on the screen as today');
      assert.equal(s.game.day, TODAY);
    }
  });

  test('every stale day rolls over, and only the current one survives', () => {
    for (const d of [addDays(TODAY, -1), addDays(TODAY, -7), addDays(TODAY, -365), addDays(TODAY, 1), null, '', 'not-a-day']) {
      const s = fresh(NOW);
      s.game = { today: 99, day: d };
      reconcileGameDay(s, TODAY);
      assert.equal(s.game.today, 0, `points dated ${JSON.stringify(d)} were kept as today's`);
    }
    const s = fresh(NOW);
    s.game = { today: 99, day: TODAY };
    reconcileGameDay(s, TODAY);
    assert.equal(s.game.today, 99, "today's own points were thrown away");
  });

  test('it is idempotent, total, and never lowers `best` at any value', () => {
    for (const n of POINTS) {
      const s = fresh(NOW);
      s.player.best = n;
      s.game = { today: Math.floor(n / 2), day: addDays(TODAY, -1) };
      reconcileGameDay(s, TODAY);
      assert.equal(s.player.best, n, `the rollover lowered best ${n}`);
      const once = clone({ player: s.player, game: s.game });
      reconcileGameDay(s, TODAY);
      assert.deepEqual({ player: s.player, game: s.game }, once, `the rollover is not idempotent at ${n}`);
    }
    for (const junk of [undefined, null, 0, 'x', []]) {
      const s = fresh(NOW);
      s.game = junk; s.player = junk;
      assert.doesNotThrow(() => reconcileGameDay(s, TODAY), `reconcileGameDay threw on ${JSON.stringify(junk)}`);
    }
  });

  test('`best` is floored by a day that has happened, and raised by nothing else', () => {
    // `job/state.js bank()` maxes the two itself, so this fires only on a save that arrived with them
    // disagreeing — an import, a hand edit, a tab killed between two writes. It can only ever RAISE
    // `best`, and only to a number the engine did compute: the points banked today.
    for (const n of POINTS) {
      const s = fresh(NOW);
      s.player.best = 0;
      s.game = { today: n, day: TODAY };
      reconcileGameDay(s, TODAY);
      assert.equal(s.player.best, n, `best stayed under today's ${n} points — the app would print "best 0" under "today ${n} points"`);
      assert.equal(s.game.today, n, 'the floor moved today');
    }
    const s = fresh(NOW);
    s.player.best = 500;
    s.game = { today: 3, day: TODAY };
    reconcileGameDay(s, TODAY);
    assert.equal(s.player.best, 500, 'a small day lowered the best day');
  });
});

/* ========================================================================================== */
/**
 * THE SESSION THAT OUTLIVES ITS OWN DAY — the shipped modules, through the shipped store.
 *
 * `store.js` used to skip the roll while `inProgress.game` existed, so that a session running through
 * local midnight did not watch `today` fall across a reload. `job/state.js bank()` reads no clock, so
 * with the roll skipped a session started before bed and finished the next afternoon banked into
 * YESTERDAY: the app printed `today 548 points` when 48 of them were banked today, and because
 * `best` is only ever raised, the two-day sum became the student's "best single day" for good.
 *
 * Both halves are asserted here — the reload (the app reopened the next day) and the tab that was
 * never reloaded (the clock simply passed midnight under a live session) — because `update()` is the
 * only thing standing between `bank()` and a stale day in the second one.
 */
describe('a session that outlives its own day banks into the day the student is looking at', () => {
  const D1 = new Date(2026, 8, 21, 23, 40).getTime();       // the night before
  const D2 = new Date(2026, 8, 22, 15, 0).getTime();        // the next afternoon
  const DAY1 = todayISO(new Date(D1));
  const DAY2 = todayISO(new Date(D2));

  const fakeStorage = (init = {}) => {
    const map = new Map(Object.entries(init));
    return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
  };

  /** Yesterday's 500-point day, with tonight's session still live and 48 points unbanked on it. */
  const lastNight = (d) => {
    d.game = { today: 500, day: DAY1 };
    d.player = { best: 100 };
    d.inProgress = {
      kind: 'page', seed: 7, idx: 0,
      queue: [{ n: 1, id: 'a', role: 'new', skill: 'sk', tier: 1 }],
      game: { pile: 48, streak: 2, call: null, answered: 3, tGame: 9000, tAnswer: 11000, seed: 'abc' },
    };
  };

  /** …the same record on its own, for the tests that drive the roll directly. */
  const rec = () => ({ pile: 48, streak: 4, call: null, answered: 3, tGame: 9000, tAnswer: 11000, seed: 'abc' });

  test('reopened the next day, `today` is the points banked TODAY and `best` is not a two-day sum', () => {
    const storage = fakeStorage();
    const night = createStore({ storage, now: () => D1 });
    night.load();
    night.update(lastNight, { immediate: true });

    const day = createStore({ storage, now: () => D2 });
    const opened = day.load();
    assert.equal(opened.game.today, 0, 'yesterday\'s 500 points were printed as today\'s');
    assert.equal(opened.game.day, DAY2, 'the save still names yesterday as the day points land on');
    /* 548, not 500: the 48-point pile was WON last night too, and banking is never required, so a
       roll that left it on the record let it bank the next afternoon into a day the student had not
       played (r3, exploit-hunt). The closing day takes its own pile home, and 548 is what that day
       was worth — one day, every point of it earned on it. */
    assert.equal(opened.player.best, 548, 'the closing day\'s own unbanked pile was left to bank on the NEXT day');
    assert.ok(opened.inProgress?.game, 'the live session was dropped — the roll must not end the session');
    assert.equal(opened.inProgress.game.pile, 0, 'the pile crossed the date line');
    assert.equal(opened.inProgress.game.streak, 1, 'the pile went home and the streak did not — that is a free bank');
    assert.equal(opened.inProgress.game.answered, 3, 'the roll edited the session beyond the pile it took home');
    assert.equal(opened.inProgress.game.seed, 'abc', 'the roll re-rolled the session');

    /* …and the session goes on. Twelve points won TODAY, banked today, are all `today` may name. */
    day.update((s) => { s.inProgress.game.pile = 12; }, { immediate: true });
    let r;
    day.update((s) => { r = state.bank(s, { now: D2, ms: 500 }); }, { immediate: true });
    assert.equal(r.points, 12, 'the bank paid something other than the pile');
    assert.equal(r.today, 12, `the app printed "today ${r.today} points" over 12 banked today`);
    assert.equal(r.best, 548, `the app printed "best ${r.best}" — a number no single day was worth`);
    assert.deepEqual(day.getState().game, { today: 12, day: DAY2 }, 'the disk disagrees with what was printed');
  });

  test('…and so does the tab that was never reloaded — the clock alone passing midnight is enough', () => {
    let CLOCK = D1;
    const store = createStore({ storage: fakeStorage(), now: () => CLOCK });
    store.load();
    store.update(lastNight, { immediate: true });

    CLOCK = D2;                                    // midnight passes; nothing reloads
    let r;
    store.update((s) => { r = state.bank(s, { now: CLOCK, ms: 500 }); }, { immediate: true });
    assert.equal(r.points, 0, 'last night\'s pile was still on the record to be banked this afternoon');
    assert.equal(r.today, 0, `the app printed "today ${r.today} points" over nothing banked today`);
    assert.equal(r.best, 548, `the app printed "best ${r.best}" — the closing day, whole and once`);
    assert.deepEqual(store.getState().game, { today: 0, day: DAY2 });
  });

  /* The banked half of this defect was fixed a round before the unbanked half, and the fix for each
     is one line of the same function. These four pin the second one at the root. */
  test('the pile never crosses the date line, at any size', () => {
    for (const n of POINTS) {
      const s = fresh(NOW);
      s.player.best = 0;
      s.game = { today: 0, day: DAY1 };
      s.inProgress = { kind: 'page', seed: 7, idx: 0, queue: [{ n: 1, id: 'a' }], game: { ...rec(), pile: n } };
      reconcileGameDay(s, DAY2);
      assert.equal(s.inProgress.game.pile, 0, `a ${n}-point pile survived the roll`);
      assert.equal(s.game.today, 0, `a ${n}-point pile was printed as TODAY's points`);
      assert.equal(s.player.best, n, `a ${n}-point day was thrown away instead of becoming the best day`);
    }
  });

  /**
   * THE DRAIN IS THE BANK THE STUDENT COULD HAVE TAPPED. `store.js` cannot import `js/job/state.js`
   * (3 modules become 58, through a cycle back into itself via `page.js` → `schedule.js`), so the
   * arithmetic is written twice — and this is what keeps the two copies from ever disagreeing:
   * the SHIPPED `bank()` and the SHIPPED roll, over the same record, must leave the same numbers.
   * `tGame` / `tAnswer` are not compared: `bank()` is a verb and books its own interval, and the
   * roll is not and books none.
   */
  test('the roll leaves exactly what the engine\'s own `bank()` leaves', () => {
    for (const n of POINTS) {
      /* THE ONE DIVERGENCE, and it is deliberate: `bankPile` resets the streak unconditionally
         because tapping bank is a decision, and an EMPTY pile is nothing to send home — resetting a
         streak there would be a cost the clock charged for nothing. The test below owns that case. */
      if (n === 0) continue;
      const seed = () => {
        const s = fresh(NOW);
        s.player = { best: 100 };
        s.game = { today: 500, day: DAY1 };
        s.inProgress = { kind: 'page', seed: 7, idx: 0, queue: [{ n: 1, id: 'a' }], game: { ...rec(), pile: n, streak: 4 } };
        return s;
      };
      const viaBank = seed();
      const paid = state.bank(viaBank, { now: D1, ms: 0 });          // the student taps bank on DAY1
      const viaRoll = seed();
      reconcileGameDay(viaRoll, DAY2);                                // …or midnight does it for him

      assert.equal(paid.today, 500 + n, `bank() did not add the ${n}-point pile to the day it was won on`);
      assert.equal(viaRoll.player.best, paid.best, `the roll and bank() disagree about what the day was worth (${n})`);
      assert.equal(viaBank.player.best, paid.best, 'bank() and its own return value disagree');
      assert.equal(viaRoll.inProgress.game.pile, viaBank.inProgress.game.pile, `the roll and bank() disagree about the pile (${n})`);
      assert.equal(viaRoll.inProgress.game.streak, viaBank.inProgress.game.streak, `the roll and bank() disagree about the streak (${n})`);
      for (const k of ['call', 'answered', 'seed']) {
        assert.deepEqual(viaRoll.inProgress.game[k], viaBank.inProgress.game[k], `the roll and bank() disagree about ${k}`);
      }
    }
  });

  /**
   * A BID IN FLIGHT HOLDS THE DAY OPEN — the same refusal `bank()` makes, for the same reason.
   * `answer()` prices a miss at `costOf(call, streak, pileBefore)`, which is capped at the pile, so
   * a roll that drained the pile out from under a locked call would floor its cost to nothing and
   * hand the student a free question at full pay. That is the exploit `bank()`'s own refusal exists
   * to prevent, and it must not be reachable by waiting for midnight.
   */
  test('a locked call is not drained out from under, and defers the whole roll', () => {
    const s = fresh(NOW);
    s.player = { best: 100 };
    s.game = { today: 500, day: DAY1 };
    s.inProgress = { kind: 'page', seed: 7, idx: 0, queue: [{ n: 1, id: 'a' }], game: { ...rec(), call: { id: 'sure', at: D1 } } };
    reconcileGameDay(s, DAY2);
    assert.equal(s.inProgress.game.pile, 48, 'the pile that backs a standing bid was banked away — the call is now free');
    assert.equal(s.inProgress.game.streak, 4, 'the streak the standing bid was priced at moved under it');
    assert.equal(s.game.day, DAY1, 'the day rolled while a bid was still on the table');
    assert.equal(s.game.today, 500, 'the closing day\'s points were zeroed with a bid still standing');
    assert.equal(s.player.best, 500, 'the floor stopped firing — it only ever raises and must always run');

    /* …and the deferral is bounded. `screens/job.js settleAbandonedBid` seals the abandoned question
       bidless on the next mount, and `answer` clears it in a tab that never reloaded; either way the
       roll completes on the very next `update()`, before any surface can print a number. */
    s.inProgress.game.call = { id: null, at: D1 };
    reconcileGameDay(s, DAY2);
    assert.equal(s.inProgress.game.pile, 0, 'a bidless seal is not a bid, and must not hold the day open');
    assert.equal(s.game.day, DAY2);
    assert.equal(s.player.best, 548, 'the deferred day did not come home whole when the bid cleared');
  });

  /**
   * …AND THE DEFERRED ROLL CREDITS THE CLOSING DAY'S OWN PILE (r5, exploit-hunt, MAJOR).
   *
   * The test above cleared the bid BY HAND (`call = { id: null }`) and never ran `answer()`, so the
   * pile it drained was still the pile the day closed on. In the app the bid is cleared by `answer`,
   * which adds this question's pay in the same breath — so the roll that ran a verb later banked
   * points won on the NEW day into the closing one, and `best` became a two-day sum again: 500
   * banked + a 94-point pile + a 50-point question answered the next morning printed `best 644` over
   * a day worth 594.
   *
   * `held` is the fix and this is its arithmetic, over the whole range on both sides of the bid.
   */
  test('the closing day banks the pile it HAD, never the one the next day made of it', () => {
    for (const n of POINTS) {
      for (const grown of [n, n + 50, n + 1, n * 2]) {
        const s = fresh(NOW);
        s.player = { best: 0 };
        s.game = { today: 500, day: DAY1 };
        s.inProgress = { kind: 'page', seed: 7, idx: 0, queue: [{ n: 1, id: 'a' }], game: { ...rec(), pile: grown } };
        reconcileGameDay(s, DAY2, { held: n });
        assert.equal(s.game.today, 0, 'the closing day stayed on screen as today');
        assert.equal(s.player.best, 500 + Math.min(n, grown), `a pile of ${grown} held at ${n} credited the wrong day`);
        assert.equal(s.inProgress.game.pile, grown - Math.min(n, grown),
          `the new day's own points (${grown - n}) went home with the closing day`);
      }
    }
  });

  test('…and a loss taken on the new day cannot credit the closing one with points that are gone', () => {
    // A MISS settles the bid downward: the pile the roll finds is SMALLER than the one it is owed.
    const s = fresh(NOW);
    s.player = { best: 0 };
    s.game = { today: 500, day: DAY1 };
    s.inProgress = { kind: 'page', seed: 7, idx: 0, queue: [{ n: 1, id: 'a' }], game: { ...rec(), pile: 40 } };
    reconcileGameDay(s, DAY2, { held: 48 });
    assert.equal(s.player.best, 540, 'the closing day was credited 48 points it no longer held');
    assert.equal(s.inProgress.game.pile, 0);
    assert.equal(s.inProgress.game.streak, 1);
  });

  test('`held` is a count of points, and anything that is not one drains the whole pile', () => {
    for (const junk of [null, undefined, -1, 1.5, NaN, '48', {}, []]) {
      const s = fresh(NOW);
      s.player = { best: 0 };
      s.game = { today: 0, day: DAY1 };
      s.inProgress = { kind: 'page', seed: 7, idx: 0, queue: [{ n: 1, id: 'a' }], game: { ...rec(), pile: 48 } };
      reconcileGameDay(s, DAY2, { held: junk });
      assert.equal(s.player.best, 48, `a \`held\` of ${JSON.stringify(junk)} stopped the pile going home`);
      assert.equal(s.inProgress.game.pile, 0);
    }
    // `held: 0` is a real count — the closing day's pile was empty, and nothing is owed to it.
    const s = fresh(NOW);
    s.player = { best: 0 };
    s.game = { today: 0, day: DAY1 };
    s.inProgress = { kind: 'page', seed: 7, idx: 0, queue: [{ n: 1, id: 'a' }], game: { ...rec(), pile: 8, streak: 2 } };
    reconcileGameDay(s, DAY2, { held: 0 });
    assert.equal(s.player.best, 0, 'a day that closed on an empty pile was credited the next day\'s');
    assert.equal(s.inProgress.game.pile, 8, 'the new day\'s own 8 points went home with the closing day');
    assert.equal(s.inProgress.game.streak, 2, 'a streak was reset for a bank that sent nothing home');

    /* …and the options bag itself repairs nothing and throws on nothing, like the rest of this file. */
    for (const opts of [undefined, null, {}, 0, 'x', [], { nope: 1 }]) {
      const t = fresh(NOW);
      t.player = { best: 0 };
      t.game = { today: 0, day: DAY1 };
      t.inProgress = { kind: 'page', seed: 7, idx: 0, queue: [{ n: 1, id: 'a' }], game: { ...rec(), pile: 48 } };
      assert.doesNotThrow(() => reconcileGameDay(t, DAY2, opts), `the roll threw on opts ${JSON.stringify(opts)}`);
      assert.equal(t.player.best, 48, `opts ${JSON.stringify(opts)} stopped the pile going home`);
    }
  });

  test('`deferredPile` names the pile a standing bid is holding open, and nothing else', () => {
    const at = (over) => {
      const s = fresh(NOW);
      s.game = { today: 500, day: DAY1 };
      s.inProgress = { kind: 'page', seed: 7, idx: 0, queue: [{ n: 1, id: 'a' }], game: { ...rec(), ...over } };
      return s;
    };
    assert.equal(deferredPile(at({ call: { id: 'sure', at: D1 } }), DAY2), 48, 'a standing bid defers a 48-point pile');
    assert.equal(deferredPile(at({ call: null }), DAY2), null, 'no bid, nothing deferred');
    assert.equal(deferredPile(at({ call: { id: null, at: D1 } }), DAY2), null, 'a bidless seal is not a bid');
    assert.equal(deferredPile(at({ call: { id: 'sure', at: D1 }, pile: 0 }), DAY2), 0, 'an empty pile is a count, not a no');
    assert.equal(deferredPile(at({ call: { id: 'sure', at: D1 } }), DAY1), null, 'the day has not turned — nothing is deferred');
    for (const junk of [null, undefined, 0, 'x', [], { game: null }, { game: {}, inProgress: null }]) {
      assert.doesNotThrow(() => deferredPile(junk, DAY2), `deferredPile threw on ${JSON.stringify(junk)}`);
    }
  });

  test('nothing goes home when there is nothing to send, and an empty pile keeps its streak', () => {
    const s = fresh(NOW);
    s.player = { best: 100 };
    s.game = { today: 500, day: DAY1 };
    s.inProgress = { kind: 'page', seed: 7, idx: 0, queue: [{ n: 1, id: 'a' }], game: { ...rec(), pile: 0, streak: 5 } };
    reconcileGameDay(s, DAY2);
    assert.equal(s.inProgress.game.streak, 5, 'a streak was reset by the clock with no pile taken home for it');
    assert.equal(s.game.today, 0);
    assert.equal(s.player.best, 500);
  });

  /* `game.day === null` is a save on which nothing has ever been banked, so there is no closing day
     to credit a pile to. Crediting one anyway would put a day in `best` that the engine never named
     — which is the defect, not the fix — so the roll stamps the day and leaves the record alone. No
     path in the app reaches it: `startJob` stamps the day, and so does every `update()`. */
  test('a save that names no day invents one for nobody', () => {
    for (const d of [null, '', 'not-a-day']) {
      const s = fresh(NOW);
      s.player = { best: 0 };
      s.game = { today: 0, day: d };
      s.inProgress = { kind: 'page', seed: 7, idx: 0, queue: [{ n: 1, id: 'a' }], game: rec() };
      reconcileGameDay(s, DAY2);
      assert.equal(s.game.day, DAY2, `a day of ${JSON.stringify(d)} stopped the roll`);
      assert.equal(s.game.today, 0);
      if (d === null || d === '') {
        assert.equal(s.player.best, 0, `a pile was credited to a day the save never named (${JSON.stringify(d)})`);
        assert.equal(s.inProgress.game.pile, 48, 'the record was drained into nothing');
        assert.equal(s.inProgress.game.streak, 4, 'the streak was reset for a bank that did not happen');
      } else {
        // a day STRING that is not today is a day: 2026-09-21 and 'not-a-day' are both "not DAY2".
        assert.equal(s.player.best, 48, 'a dated day did not take its own pile home');
      }
    }
  });

  test('it repairs nothing and throws on nothing, live record and all', () => {
    for (const junk of [null, 0, 'x', [], NaN, undefined, { pile: 'nonsense', streak: null }, { pile: -4 }, { pile: 5.5 }]) {
      const s = fresh(NOW);
      s.game = { today: 500, day: DAY1 };
      s.inProgress = { kind: 'page', seed: 7, idx: 0, queue: [{ n: 1, id: 'a' }], game: junk };
      assert.doesNotThrow(() => reconcileGameDay(s, DAY2), `the roll threw on a record of ${JSON.stringify(junk)}`);
      assert.deepEqual(s.inProgress.game, junk, `the roll edited a record it could not read: ${JSON.stringify(junk)}`);
      assert.equal(s.game.day, DAY2, 'a record it could not read stopped the day rolling');
    }
    // …and it is idempotent over a live record it CAN read.
    const s = fresh(NOW);
    s.game = { today: 500, day: DAY1 };
    s.inProgress = { kind: 'page', seed: 7, idx: 0, queue: [{ n: 1, id: 'a' }], game: rec() };
    reconcileGameDay(s, DAY2);
    const once = JSON.stringify({ p: s.player, g: s.game, r: s.inProgress.game });
    reconcileGameDay(s, DAY2);
    assert.equal(JSON.stringify({ p: s.player, g: s.game, r: s.inProgress.game }), once, 'the roll is not idempotent over a live session');
  });

  /* The half of the fix that closes the tab which is never reloaded lives in `store.update()`, so it
     only holds while the screen's mutators go THROUGH the store. This is the narrowest possible
     statement of that coupling: a verb that banks points must never be handed a bare `getState()`. */
  test('the screen banks through the store, never around it', () => {
    const job = readFileSync(new URL('../site/js/screens/job.js', import.meta.url), 'utf8');
    for (const verb of ['bank', 'endJob']) {
      assert.ok(!new RegExp(`state\\.${verb}\\(\\s*getState\\(\\)`).test(job),
        `screens/job.js calls state.${verb}() outside update() — the day would not roll in a tab that `
        + 'was never reloaded, and `today` would be the sum of two days');
    }
  });

  /* --------------------------------------------------------------------------------------------
     THE SHIPPED PATH — `store.update()`, the door every verb on `screens/job.js` reaches the save
     through. Everything above drives `reconcileGameDay` directly; r5's three defects all live in the
     ORDER `update()` runs things in, and not one of them is visible from that function alone.
     -------------------------------------------------------------------------------------------- */
  const CLEAR = { cleared: true, clean: true, attempt: 1, hints: 0 };
  const MISS = { cleared: false, clean: false, attempt: 3, hints: 2 };

  /** A store holding a REAL live session on DAY1, composed by the shipped `startJob`. */
  function nightStore({ pile = 48, streak = 4, today = 500, best = 100 } = {}) {
    const storage = fakeStorage();
    const clock = { at: D1 };
    const store = createStore({ storage, now: () => clock.at });
    store.load();
    store.update((s) => {
      s.settings.testDate = '2026-09-30';
      state.startJob(s, { now: D1 });
      s.inProgress.game.pile = pile;
      s.inProgress.game.streak = streak;
      s.game = { today, day: DAY1 };
      s.player = { best };
    }, { immediate: true });
    return { store, storage, clock, disk: () => JSON.parse(storage.getItem(SAVE_KEY)) };
  }

  /**
   * THE REFUSAL THAT LEFT THREE DIFFERENT PILES ON THREE SURFACES (r5, exploit-hunt, BLOCKER).
   *
   * `update()` rolls the day and THEN runs the verb. At 00:00:01 with a live session the roll drains
   * the pile and the streak — and the verb then threw `unaffordable`, because `sure` costs 8 at ×1
   * against a pile the clock had just emptied. The throw skipped `notify` and `save`, so memory held
   * an empty pile, localStorage held last night's 94, and the strip printed a third reading with two
   * live controls on it that the engine would refuse for as long as the student kept tapping.
   */
  test('a verb that refuses may cost the verb; it may not cost the day', () => {
    const { store, storage, clock, disk } = nightStore();
    clock.at = D2;                                 // the clock passes midnight under a live session
    const seen = [];
    store.subscribe((s, reason) => seen.push(reason));

    assert.throws(() => store.update(() => { throw new Error('unaffordable: sure'); }), /unaffordable/,
      'the refusal was swallowed — the caller can no longer tell the verb did not happen');

    const mem = store.getState();
    assert.equal(mem.inProgress.game.pile, 0, 'the roll did not run at all');
    assert.equal(mem.game.day, DAY2);
    assert.equal(mem.player.best, 548, 'the closing day did not come home');
    assert.deepEqual(
      { pile: disk().inProgress.game.pile, streak: disk().inProgress.game.streak, day: disk().game.day, best: disk().player.best },
      { pile: mem.inProgress.game.pile, streak: mem.inProgress.game.streak, day: mem.game.day, best: mem.player.best },
      'the disk holds a pile the engine does not — a reload would hand the student back a pile that is gone');
    assert.deepEqual(seen, ['update'],
      'every number on the strip moved and no surface was told: the screen goes on printing a pile '
      + 'the engine has already sent home, and prices every call against nothing');

    /* …and a refusal with nothing to roll stays a plain refusal: no write, no announcement. */
    const quiet = storage.getItem(SAVE_KEY);
    assert.throws(() => store.update(() => { throw new Error('called: sure'); }), /called/);
    assert.equal(storage.getItem(SAVE_KEY), quiet, 'a refusal on a day that had not turned wrote anyway');
    assert.deepEqual(seen, ['update'], 'a refusal that moved nothing announced something');
  });

  /**
   * POINTS WON AFTER MIDNIGHT ARE THE NEW DAY'S (r5, exploit-hunt, MAJOR) — driven through the real
   * `startJob` / `call` / `answer`, with the bid standing as the clock turns.
   */
  test('a bid settled after midnight pays the new day, and `best` is never a two-day sum', () => {
    for (const result of [CLEAR, MISS]) {
      const { store, clock } = nightStore({ pile: 48, streak: 4 });

      const offered = state.callsFor(store.getState());
      const id = offered.includes('sure') ? 'sure' : offered[offered.length - 1];
      assert.ok(typeof id === 'string' && id, 'the engine offered no call on a 48-point pile');
      let priced;
      store.update((s) => { priced = state.call(s, id, { now: D1, ms: 10 }); }, { immediate: true });

      clock.at = D2;                               // midnight, with the bid still on the table
      let r;
      store.update((s) => { r = state.answer(s, result, { now: D2, ms: 10 }); }, { immediate: true });
      /* …and then the next thing the student does, which is the update the deferred roll used to
         complete on — by which time `answer` had already added this question's pay to the pile it
         drained (`best 644` over a day worth 594, r5). Every assertion below holds at BOTH instants. */
      const mid = clone({ best: store.getState().player.best, game: store.getState().game });
      store.update(() => {}, { immediate: true });
      assert.deepEqual({ best: store.getState().player.best, game: store.getState().game }, mid,
        'the roll had not finished when the verb that settled the bid returned');

      const out = store.getState();
      const won = result === CLEAR;
      /* THE BID IS NOT REPRICED BY THE CLOCK. It was locked at ×4 over a 48-point pile and it is
         settled at ×4 over a 48-point pile — CUT-BRIEF math #7, "answers tick; time does not". */
      assert.equal(r.pay, priced.pay, `the clock changed what the bid paid (${id})`);
      assert.equal(r.cost, priced.cost, `the clock changed what the bid cost (${id})`);
      assert.equal(r.pileBefore, 48, 'the pile the bid was priced against moved under it');

      /* THE CLOSING DAY IS WORTH 500 BANKED + THE 48 IT HAD ON THE TABLE, and not one point more.
         Before the fix this was 548 + `r.pay` on a clear: a day's total plus the next day's play. */
      const closing = 500 + Math.min(48, won ? 48 + r.pay : Math.max(0, 48 - r.cost));
      assert.equal(out.player.best, closing,
        `\`best ${out.player.best}\` names no single day — the closing day was worth ${closing}`);
      assert.ok(out.player.best <= 548, 'points won on the new day were banked into the closing one');
      assert.equal(out.game.day, DAY2, 'the day did not turn once the bid was settled');
      assert.equal(out.game.today, 0, 'yesterday\'s points are still being printed as today\'s');
      /* …and what the new day won stays in the new day's pile, where the student can still lose it. */
      assert.equal(out.inProgress.game.pile, won ? r.pay : 0,
        'the question answered on the new day did not leave its points on the new day');
      assert.equal(out.inProgress.game.streak, 1, 'the pile went home and the streak did not — that is a free bank');
    }
  });

  /**
   * THE DAY TURNS ON THE SHELL'S CLOCK, NOT ON THE VERB THE STUDENT TAPS (r5, exploit-hunt, MAJOR).
   * The roll used to land inside whichever `update()` came first, so BANK reported the pile it had
   * already sent home and the receipt read `today 0 points` over a tap worth 144.
   */
  test('the roll is its own event: written, announced, and finished before anything is tapped', () => {
    const { store, clock, disk } = nightStore({ pile: 48, streak: 4 });
    clock.at = D2;
    const seen = [];
    store.subscribe((s, reason) => seen.push(reason));

    assert.equal(store.rollDay(), true, 'the clock passed midnight and the day did not turn');
    assert.deepEqual(seen, ['update'], 'the pile went home and no surface was told');
    assert.equal(disk().inProgress.game.pile, 0, 'the roll was announced but not written');
    assert.equal(disk().player.best, 548, 'the closing day did not come home on the disk');
    assert.equal(store.rollDay(), false, 'the roll ran twice on one day');
    assert.deepEqual(seen, ['update'], 'a roll that moved nothing announced something');

    /* …and the verb the student taps next reports the number that moves ON THAT TAP. */
    let r;
    store.update((s) => { r = state.bank(s, { now: D2, ms: 500 }); }, { immediate: true });
    assert.equal(r.points, 0, 'the tap banked a pile the roll had already sent home');
    assert.equal(r.today, 0, `the receipt said "today ${r.today} points" over a tap worth ${r.points}`);
    assert.equal(r.best, 548);
  });

  test('…and the document coming back is the clock too — a phone locked overnight on a face-down card', () => {
    const handlers = {};
    const doc = {
      visibilityState: 'hidden',
      addEventListener: (t, fn) => { (handlers[t] ??= []).push(fn); },
    };
    const storage = fakeStorage();
    const clock = { at: D1 };
    const store = createStore({ storage, now: () => clock.at, doc });
    store.load();
    store.update((d) => { lastNight(d); }, { immediate: true });
    const fire = () => { for (const fn of handlers.visibilitychange ?? []) fn(); };

    clock.at = D2;
    doc.visibilityState = 'hidden';
    fire();                                        // going away writes; it does not roll
    assert.equal(store.getState().inProgress.game.pile, 48, 'the roll ran on the way out, with nobody looking');

    doc.visibilityState = 'visible';
    fire();                                        // …coming back does
    assert.equal(store.getState().inProgress.game.pile, 0, 'the roll waited for the student to tap');
    assert.equal(store.getState().player.best, 548, 'the closing day did not come home');
    assert.equal(store.getState().game.day, DAY2);
  });

  test('within one day nothing rolls: the same two writes on the same day just add up', () => {
    let CLOCK = D2;
    const store = createStore({ storage: fakeStorage(), now: () => CLOCK });
    store.load();
    store.update((d) => { lastNight(d); d.game = { today: 500, day: DAY2 }; }, { immediate: true });

    CLOCK = D2 + 20 * 60 * 1000;                   // twenty minutes later, same day
    let r;
    store.update((s) => { r = state.bank(s, { now: CLOCK, ms: 500 }); }, { immediate: true });
    assert.equal(r.today, 548, 'a same-day bank did not add to today\'s points');
    assert.equal(r.best, 548, 'a 548-point day did not become the best day');
  });
});

/* ========================================================================================== */
describe('`inProgress.game` — the mid-session record', () => {
  /** A save with tonight's page live and a session on it, driven through the shipped verbs only. */
  function live() {
    const save = fresh(NOW - 5 * 86400000);
    save.settings.testDate = '2026-09-30';
    state.startJob(save, { now: NOW });
    return save;
  }

  test('it is exactly `IN_PROGRESS_KEYS`, in order', () => {
    assert.deepEqual(Object.keys(live().inProgress.game), [...IN_PROGRESS_KEYS]);
    /* `tAway` / `away` are the split meter's third part and its bit (r3, number-truth): a span
       the app declared it was not in use is in neither half of the printed share, and the stamp is
       on the DISK so a tab that is closed mid-session has already closed its own books. */
    assert.deepEqual([...IN_PROGRESS_KEYS],
      ['pile', 'streak', 'call', 'answered', 'tGame', 'tAnswer', 'tAway', 'away', 'seed']);
  });

  test('a killed tab restores the session, with the seed PINNED', () => {
    const save = live();
    state.call(save, 'not sure', { now: NOW, ms: 4000 });
    const seed = save.inProgress.seed;
    const record = clone(save.inProgress.game);

    /* the tab dies: everything goes through `pack`/`unpack`, exactly as the disk does */
    const back = migrate(throughDisk(clone(save)), NOW);
    assert.deepEqual(back.inProgress.game, record, 'the session did not come back as it went in');
    assert.equal(back.inProgress.seed, seed, 'the seed was re-rolled on the way back');
    assert.equal(back.inProgress.game.call.id, 'not sure', 'the sealed call was lost');
    assert.ok(record.seed !== '', 'the session record carries the page seed');
  });

  test('the queue the session is running survives the disk item for item', () => {
    const save = live();
    const before = clone(save.inProgress.queue);
    const back = migrate(throughDisk(clone(save)), NOW);
    assert.deepEqual(back.inProgress.queue, before, 'a question left the schedule on the way to disk');
    assert.equal(back.inProgress.idx, save.inProgress.idx, 'the page pointer moved on the way to disk');
  });
});

/* ========================================================================================== */
/**
 * THE GAME'S HALF OF THE SAVE, AND THE DOCUMENT THAT PUBLISHES IT.
 *
 * COMPOSED.md S6 outranks the game layer, and for a whole round after the cut it published the
 * DELETED layer's save figures: a 40 332-char game half (the shipped one is 213 B on the same
 * carrier), a `SAVE_BUDGET_KB.totalAdded` of 39.7 KB (a constant that exists nowhere under
 * `site/`), a 546 004-char carrier "ratcheted by `tests/job-save.test.mjs`" (this file has never
 * measured a whole save), and a 528 KB headline raised to make room for all of it. Every one of
 * those numbers was arithmetic on a layer CUT-BRIEF deleted, left standing in the one document the
 * brief says still rules — the brief's own thesis in miniature, "every repair moves a number that
 * three other surfaces quote".
 *
 * So the bound is read OUT of the document and used as this file's bound, exactly the way
 * `tests/job-split.test.mjs` already reads S1's per-card budget out of it ("read out of the
 * document so it cannot drift from the app it describes"). A document that outranks the code does
 * not get to publish a number the code cannot compute.
 */
describe('the whole game layer costs the save almost nothing', () => {
  /* EVERYTHING BELOW IS LAZY, AND THAT IS LOAD-BEARING. A throw in a `describe` body does not fail
     this suite — node:test drops the whole block and still reports `fail 0`, so a document edit that
     broke the parse would DELETE four tests instead of failing one (measured: a hand-raised budget
     took this file 41 tests -> 37, green). Every read, match and assertion is therefore inside a
     `test`, where a throw is a failure. */
  /** S6's Export/Import paragraph, through the end of its OPEN note — the block this lane owns. */
  const s6 = () => {
    const composed = readFileSync(new URL('../COMPOSED.md', import.meta.url), 'utf8');
    const from = composed.indexOf('Export/Import = JSON');
    const to = composed.indexOf('**Timers.**', from);
    assert.ok(from > 0 && to > from, 'COMPOSED.md S6 no longer has an Export/Import paragraph');
    return composed.slice(from, to);
  };
  /** `1 024` → 1024. The document writes thousands with a space; the code reads whole bytes. */
  const fig = (s) => Number(String(s).replace(/[\s  ]/g, ''));

  /**
   * THE BOUND IS THE DOCUMENT'S. The paragraph states it twice — once in the headline sum and once
   * beside this file's name — and both are checked against each other and then USED below, so a
   * hand edit to either one either moves this file's bound or fails here.
   */
  const gameBudget = (text) => {
    const headline = text.match(/plus ([\d\s  ]+?) B for the game/);
    const cited = text.match(/`tests\/job-save\.test\.mjs` holds it under \*\*([\d\s  ]+?) B\*\*/);
    assert.ok(headline, 'COMPOSED.md S6 no longer publishes a byte budget for the game half');
    assert.ok(cited, 'COMPOSED.md S6 no longer names the test that enforces the game half');
    assert.equal(fig(headline[1]), fig(cited[1]), 'S6 publishes two different budgets for one half');
    return fig(headline[1]);
  };

  test('a live session, priced — against the budget COMPOSED.md publishes, not one written here', () => {
    const GAME_BUDGET = gameBudget(s6());
    assert.equal(GAME_BUDGET, 1024, 'the published budget moved; re-measure before moving it');
    const save = fresh(NOW - 5 * 86400000);
    save.settings.testDate = '2026-09-30';
    state.startJob(save, { now: NOW });
    state.call(save, 'not sure', { now: NOW, ms: 4000 });
    save.player.best = 9999;
    save.game = { today: 9999, day: TODAY };
    const bytes = (o) => JSON.stringify(o).length;
    const cost = bytes(save.player) + bytes(save.game) + bytes(save.inProgress.game);
    assert.ok(cost < GAME_BUDGET,
      `the game layer costs ${cost} B of save — it is meant to be three scalars and a record`);
  });

  test('the constant S6 used to cite exists nowhere under `site/`', () => {
    const S6 = s6();
    const hits = listFiles('site', /\.(m?js|html|css|json)$/)
      .filter((abs) => readFileSync(abs, 'utf8').includes('SAVE_BUDGET_KB'))
      .map((abs) => abs.slice(abs.indexOf('/site/') + 1));
    assert.deepEqual(hits, [],
      'SAVE_BUDGET_KB is back under site/ — if the game half needs a published constant again, '
      + 'COMPOSED.md S6 may cite it; until then S6 must not.');
    assert.equal(/SAVE_BUDGET_KB/.test(S6), false,
      'COMPOSED.md S6 cites `SAVE_BUDGET_KB`, which the engine cannot compute');
  });

  test('no figure from the deleted layer survives in the paragraph', () => {
    const S6 = s6();
    /* Each of these was published by S6 after the cut and is false of the shipped build. They are
       listed as the strings the document printed, so this fails on a revert, not on a re-measure. */
    const gone = [
      [/539[\s  ]?932/, 'the 539 932-char total (the shipped worst case is 499 940)'],
      [/40[\s  ]?332/, 'the 40 332-char game half (the shipped one is 213 B)'],
      [/39\.7[\s  ]?KB/, 'the 39.7 KB game budget (no such constant exists)'],
      [/546[\s  ]?004/, 'the 546 004-char carrier (no test measures it)'],
      [/540[\s  ]?672/, 'the 540 672 B budget (nothing asserts it)'],
      [/505[\s  ]?671/, 'the 505 671-char live save (state.test.mjs prints 502 227)'],
    ];
    for (const [re, what] of gone) {
      assert.equal(re.test(S6), false, `COMPOSED.md S6 still publishes ${what}`);
    }
  });

  test('…and the figures it does publish are the ones the shipped tests print', () => {
    const S6 = s6();
    /* `tests/state.test.mjs` owns the measurement and prints it on every run; S6 quotes that
       printout verbatim, so the two can only disagree by a hand edit to one of them. */
    const printout = readFileSync(new URL('./state.test.mjs', import.meta.url), 'utf8');
    for (const quoted of ['worst-case save: ', 'slack: ', 'a LIVE in-progress save (label block + full before-snapshot): study ']) {
      assert.ok(S6.includes(quoted.trimEnd()),
        `S6 no longer quotes state.test.mjs's \`${quoted.trim()}\` line`);
      assert.ok(printout.includes(quoted),
        `state.test.mjs no longer prints \`${quoted.trim()}\` — S6 quotes a line that is gone`);
    }
    assert.match(S6, /499[\s  ]?940 chars = 499[\s  ]?727 study \+ 213 game/,
      'S6 does not quote the measured worst case');
    assert.match(S6, /study 502227 of 500000 — over by 2227/,
      'S6 does not quote the measured live-save overrun');
  });
});
