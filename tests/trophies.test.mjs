// tests/trophies.test.mjs — T11. One fixture per trophy predicate (S8 #11 acceptance: "every trophy
// predicate has a fixture test"), plus the counters contract, the coverage identity that makes the
// Binder fill % equal Readiness C, and the tooltip reachability the Binder tiles depend on.
import test from 'node:test';
import assert from 'node:assert/strict';

import { fresh } from '../site/js/store.js';
import {
  trophies, trophyById, TROPHY_IDS, COUNTERS, TROPHY_SHEETS, sheetOriginals,
  ORIGINAL_IDS, FAMILY_IDS,
} from '../site/data/trophies.js';
import {
  check, evaluate, earnedIds, earnedAt, progressOf, summary, makeCtx,
  bump, setBest, resetRun, counterValue, coverage, rarityHistogram, clearedOriginals,
  kindOf, bossOf, sheetOfRun, accuracyOf, correctCount, wonRun, flawlessRun, isCleanItem,
  install, toast, toastTrophy, TOAST_MS,
} from '../site/js/trophies.js';
import { coverageCount } from '../site/js/readiness.js';
import { foilClass, foilRule } from '../site/js/rarity.js';
import { sheets } from '../site/data/sheets.js';
import { bosses } from '../site/data/modules.js';

/* ------------------------------------------------------------------ fixture helpers */

const AT = new Date(2026, 8, 16, 10, 0, 0).getTime();   // local, mid-morning

const save = () => fresh(AT);

function clear(s, id, { rarity = 'gold', hints = 0, attempt = 1, ms = 30_000, at = AT } = {}) {
  s.cards[id] = {
    attempts: attempt, cleared: true, rarity, foil: rarity === 'platinum', foilProgress: [],
    bucket: 1, lastAt: at, due: at + 86_400_000, hintsUsed: hints, solutionShown: false,
    bestMs: ms, placed: false, work: '',
    history: [{ at, ok: true, attempt, hints, ms }],
  };
  return s;
}
const clearAll = (s, ids, opts) => { for (const id of ids) clear(s, id, opts); return s; };

function platFamily(s, id, days = ['2026-09-15', '2026-09-16']) {
  s.variants[id] = { clearsGold: 6, goldDays: days };
  return s;
}

function addRun(s, run) {
  s.runs.push({ n: s.runs.length + 1, seed: 'seed', startedAt: AT - 600_000, submittedAt: AT, status: 'done', items: [], ...run });
  return s;
}
const items = (n, { credit = 1, clean = true } = {}) =>
  Array.from({ length: n }, (_, i) => ({ id: `i${i}`, skill: 'VOC', tier: 1, raw: '', credit, ms: 5000, clean, flagged: false }));

const counterFix = (key, value) => (s) => { s.counters[key] = value; if (COUNTERS[key]?.best) s.counters[key + 'Best'] = value; return s; };

/* ------------------------------------------------------------------ one fixture per trophy */

/** id → (save) => save, mutated so that exactly this trophy's predicate is satisfied. */
const FIXTURES = {
  'first-blood': (s) => clear(s, 'voc-01'),
  'full-coverage': (s) => clearAll(s, ORIGINAL_IDS, { rarity: 'bronze' }),
  'platinum-packet': (s) => { clearAll(s, ORIGINAL_IDS, { rarity: 'platinum' }); for (const f of FAMILY_IDS) platFamily(s, f); return s; },

  'both-roots': counterFix('bothRoots', 1),
  'two-cases': counterFix('twoCases', 1),
  'reject-x5': counterFix('rejects', 5),
  'setup-artist': counterFix('setups', 20),
  'notation-20': counterFix('notationClean', 20),
  'sign-master': counterFix('signLead', 10),
  'forge-flash': counterFix('forgeFlash', 5),
  'systems-10': counterFix('systems', 10),
  'cold-recall': counterFix('coldRecall', 10),
  'reasoned-36': counterFix('asnReasoned', 36),

  comeback: (s) => {
    s.cards['wp-07'] = {
      attempts: 4, cleared: true, rarity: 'bronze', history: [
        { at: AT - 400, ok: false, attempt: 1, hints: 0, ms: 9000 },
        { at: AT - 300, ok: false, attempt: 2, hints: 1, ms: 9000 },
        { at: AT - 200, ok: false, attempt: 3, hints: 2, ms: 9000 },
        { at: AT - 100, ok: true, attempt: 4, hints: 2, ms: 9000 },
      ],
    };
    return s;
  },

  'asn-36': (s) => clearAll(s, sheetOriginals('ASN'), { rarity: 'bronze' }),
  sixteen: (s) => clearAll(s, sheetOriginals('WP'), { rarity: 'gold' }),
  'forge-18': (s) => clearAll(s, sheetOriginals('FAC'), { rarity: 'bronze' }),

  oracle: (s) => addRun(s, { kind: 'full36', items: items(36) }),
  'flawless-page': (s) => addRun(s, { kind: 'page', items: items(10), xp: 540 }),
  'mock-90': (s) => addRun(s, { kind: 'mock', acc: 0.95, items: items(20) }),
  'predicted-it': (s) => addRun(s, { kind: 'mock', acc: 0.8, pred: 78, items: items(20) }),
  'night-owl-no': (s) => addRun(s, { kind: 'night', answered: 8, submittedAt: new Date(2026, 8, 16, 20, 30, 0).getTime() }),   // binder r1: a night counts only past the work floor

  'streak-3': (s) => { s.streak.best = 3; return s; },
  'streak-7': (s) => { s.streak.count = 7; return s; },

  // The six game trophies — crew-held, index-25, index-68, chain-8, calibrated and clean-getaway —
  // were cut with the mechanics they counted (notes/DEMOLISH.md), and their fixtures with them.
};

for (const sh of TROPHY_SHEETS) {
  FIXTURES[`sheet-clear:${sh.id}`] = (s) => clearAll(s, sh.ids, { rarity: 'bronze' });
  FIXTURES[`sheet-gold:${sh.id}`] = (s) => clearAll(s, sh.ids, { rarity: 'gold' });
}
for (const b of bosses) {
  FIXTURES[`boss:${b.id}`] = (s) => addRun(s, { kind: `boss:${b.id}`, won: true, hearts: 1, flagged: true });
  FIXTURES[`boss-flawless:${b.id}`] = (s) => addRun(s, { kind: `boss:${b.id}`, won: true, hearts: 3 });
}

/* ------------------------------------------------------------------ the catalogue itself */

test('trophies: the catalogue is the S4 list, ids are unique and every entry is well formed', () => {
  assert.equal(new Set(TROPHY_IDS).size, TROPHY_IDS.length, 'duplicate trophy id');
  for (const t of trophies) {
    assert.match(t.id, /^[a-z0-9-]+(:[A-Za-z0-9-]+)?$/, `${t.id}: id shape`);
    assert.ok(t.name && t.name.length <= 40, `${t.id}: name`);
    assert.ok(t.cond && t.cond.length >= 10, `${t.id}: unearned tiles print their condition`);
    assert.equal(typeof t.test, 'function', `${t.id}: predicate`);
    assert.ok(['firsts', 'sheets', 'craft', 'runs', 'bosses', 'habit'].includes(t.group), `${t.id}: group`);
  }
  // every S4 name is present
  for (const id of ['first-blood', 'platinum-packet', 'both-roots', 'two-cases', 'reject-x5', 'setup-artist',
    'notation-20', 'asn-36', 'reasoned-36', 'oracle', 'sixteen', 'forge-18', 'forge-flash', 'sign-master',
    'systems-10', 'cold-recall', 'predicted-it', 'comeback', 'flawless-page', 'streak-3', 'streak-7',
    'mock-90', 'night-owl-no', 'full-coverage']) {
    assert.ok(trophyById[id], `S4 names ${id}`);
  }
  for (const b of bosses) { assert.ok(trophyById[`boss:${b.id}`]); assert.ok(trophyById[`boss-flawless:${b.id}`]); }
  for (const sh of sheets) {
    const want = !sh.bonus;
    assert.equal(!!trophyById[`sheet-clear:${sh.id}`], want, `sheet-clear:${sh.id}`);
    assert.equal(!!trophyById[`sheet-gold:${sh.id}`], want, `sheet-gold:${sh.id}`);
  }
});

test('trophies: a fresh save earns nothing at all', () => {
  assert.deepEqual(check(save()), []);
  assert.deepEqual(evaluate(save()), []);
  assert.deepEqual(earnedIds(save()), []);
});

test('trophies: every predicate has a fixture, and that fixture earns it', () => {
  const missing = TROPHY_IDS.filter(id => typeof FIXTURES[id] !== 'function');
  assert.deepEqual(missing, [], 'trophies without a fixture');
  const extra = Object.keys(FIXTURES).filter(id => !trophyById[id]);
  assert.deepEqual(extra, [], 'fixtures for trophies that do not exist');

  for (const id of TROPHY_IDS) {
    const s = FIXTURES[id](save());
    assert.ok(check(s).includes(id), `${id}: fixture does not satisfy the predicate`);
  }
});

test('trophies: predicates are exact — a fixture does not earn its neighbour', () => {
  // bronze clears a sheet but never golds it
  const bronzeVOC = FIXTURES['sheet-clear:VOC'](save());
  assert.ok(check(bronzeVOC).includes('sheet-clear:VOC'));
  assert.ok(!check(bronzeVOC).includes('sheet-gold:VOC'));
  // gold clears it too (Gold+ implies cleared)
  const goldVOC = FIXTURES['sheet-gold:VOC'](save());
  assert.ok(check(goldVOC).includes('sheet-clear:VOC'));
  assert.ok(check(goldVOC).includes('sheet-gold:VOC'));
  // one short of the counter is not the trophy
  const s19 = counterFix('setups', 19)(save());
  assert.ok(!check(s19).includes('setup-artist'));
  assert.deepEqual(progressOf(s19, 'setup-artist'), { have: 19, need: 20, pct: 19 / 20 });
  // a won boss is not a flawless boss
  const hurt = FIXTURES['boss:B4'](save());
  assert.ok(check(hurt).includes('boss:B4'));
  assert.ok(!check(hurt).includes('boss-flawless:B4'));
  // a lost boss is neither
  const lost = addRun(save(), { kind: 'boss:B4', won: false, hearts: 0, ko: true });
  assert.ok(!check(lost).includes('boss:B4'));
  // 89 % is not Mock 90
  const m89 = addRun(save(), { kind: 'mock', acc: 0.895, items: items(20) });
  assert.ok(!check(m89).includes('mock-90'));
  // a prediction 6 points out misses
  const off = addRun(save(), { kind: 'mock', acc: 0.8, pred: 74, items: items(20) });
  assert.ok(!check(off).includes('predicted-it'));
  // Night Before finished at 22:10 is not "not a night owl"
  const late = addRun(save(), { kind: 'night', answered: 8, submittedAt: new Date(2026, 8, 16, 22, 10, 0).getTime() });
  assert.ok(!check(late).includes('night-owl-no'));
  // a page with one non-clean item is not flawless
  const scrappy = addRun(save(), { kind: 'page', items: [...items(9), { credit: 1, attempt: 2, clean: false }] });
  assert.ok(!check(scrappy).includes('flawless-page'));
});

test('trophies: platinum-packet needs the four family tiles as well as every original', () => {
  const originalsOnly = clearAll(save(), ORIGINAL_IDS, { rarity: 'platinum' });
  assert.ok(check(originalsOnly).includes('full-coverage'));
  assert.ok(!check(originalsOnly).includes('platinum-packet'), 'family tiles must count');
  const s = FIXTURES['platinum-packet'](save());
  assert.ok(check(s).includes('platinum-packet'));
  // 6 Gold Variants on ONE day is Gold, not Platinum (S4: across >= 2 days)
  const oneDay = clearAll(save(), ORIGINAL_IDS, { rarity: 'platinum' });
  for (const f of FAMILY_IDS) platFamily(oneDay, f, ['2026-09-16']);
  assert.ok(!check(oneDay).includes('platinum-packet'));
});

test('trophies: comeback is read off the card history when no counter was bumped', () => {
  const s = FIXTURES.comeback(save());
  assert.equal(s.counters.comebacks, undefined);
  assert.ok(check(s).includes('comeback'));
  // two wrongs then a clear is not a comeback
  const two = save();
  two.cards['wp-07'] = { cleared: true, rarity: 'silver', history: [
    { at: AT - 300, ok: false, attempt: 1, hints: 0, ms: 1 },
    { at: AT - 200, ok: false, attempt: 2, hints: 0, ms: 1 },
    { at: AT - 100, ok: true, attempt: 3, hints: 1, ms: 1 },
  ] };
  assert.ok(!check(two).includes('comeback'));
  // and the counter alone is enough
  assert.ok(check(counterFix('comebacks', 1)(save())).includes('comeback'));
});

/* ------------------------------------------------------------------ evaluate / record */

test('trophies: evaluate records once, is idempotent, and stamps the time', () => {
  const s = FIXTURES['first-blood'](save());
  const first = evaluate(s, { now: 1234 });
  assert.deepEqual(first, ['first-blood']);
  assert.deepEqual(s.trophies['first-blood'], { at: 1234 });
  assert.deepEqual(evaluate(s, { now: 9999 }), [], 'a second pass earns nothing');
  assert.equal(earnedAt(s, 'first-blood'), 1234, 'the original timestamp survives');
  assert.deepEqual(earnedIds(s), ['first-blood']);
  assert.equal(earnedAt(s, 'sixteen'), null);
});

test('trophies: evaluate returns catalogue order when several land at once', () => {
  const s = FIXTURES['platinum-packet'](save());
  const got = evaluate(s);
  assert.deepEqual(got, got.slice().sort((a, b) => TROPHY_IDS.indexOf(a) - TROPHY_IDS.indexOf(b)));
  assert.ok(got.includes('first-blood') && got.includes('full-coverage') && got.includes('platinum-packet'));
});

test('trophies: summary gives every tile its condition, earned state and meter', () => {
  const s = counterFix('setups', 8)(save());
  const rows = summary(s);
  assert.equal(rows.length, TROPHY_IDS.length);
  const artist = rows.find(r => r.id === 'setup-artist');
  assert.equal(artist.earned, false);
  assert.equal(artist.cond, trophyById['setup-artist'].cond);
  assert.deepEqual(artist.progress, { have: 8, need: 20, pct: 0.4 });
  const oracle = rows.find(r => r.id === 'oracle');
  assert.equal(oracle.progress, null, 'a run trophy has no meter');
  assert.ok(rows.every(r => typeof r.cond === 'string' && r.cond.length > 0), 'no mystery boxes');
});

test('trophies: progressOf tracks the set trophies too', () => {
  const s = save();
  clearAll(s, sheetOriginals('AP-2'), { rarity: 'gold' });
  const p = progressOf(s, 'sheet-gold:AP-2');
  assert.deepEqual(p, { have: 2, need: 2, pct: 1 });
  assert.equal(progressOf(save(), 'sheet-gold:AP-2').have, 0);
  assert.equal(progressOf(save(), 'oracle'), null);
  assert.equal(progressOf(save(), 'not-a-trophy'), null);
});

/* ------------------------------------------------------------------ counters */

test('counters: bump / setBest / resetRun keep the current run and the high-water mark', () => {
  const s = save();
  assert.equal(bump(s, 'setups'), 1);
  assert.equal(bump(s, 'setups', 4), 5);
  assert.equal(counterValue(s, 'setups'), 5);

  // a `best: true` counter keeps <key>Best automatically
  for (let i = 0; i < 7; i++) bump(s, 'notationClean');
  assert.equal(s.counters.notationClean, 7);
  assert.equal(s.counters.notationCleanBest, 7);
  resetRun(s, 'notationClean');
  assert.equal(s.counters.notationClean, 0);
  assert.equal(counterValue(s, 'notationClean'), 7, 'the streak trophy reads the best, not the current run');
  setBest(s, 'notationClean', 3);
  assert.equal(s.counters.notationCleanBest, 7, 'setBest never lowers');
  setBest(s, 'notationClean', 21);
  assert.ok(check(s).includes('notation-20'));

  // a plain counter is NOT read through <key>Best
  const t = save();
  t.counters.setupsBest = 99;
  assert.equal(counterValue(t, 'setups'), 0);
  assert.ok(!check(t).includes('setup-artist'));
});

test('counters: every key a predicate reads is declared in COUNTERS with an owner', () => {
  const declared = new Set(Object.keys(COUNTERS));
  const src = trophies.map(t => `${t.counter ?? ''}`).filter(Boolean);
  for (const key of src) assert.ok(declared.has(key), `${key} is read by a trophy but not declared`);
  for (const [key, meta] of Object.entries(COUNTERS)) {
    assert.ok(meta.label && meta.owner && meta.when, `${key}: COUNTERS entry is the contract for its owner`);
  }
  // the ones S4 names by hand
  for (const k of ['setups', 'notationClean']) assert.ok(declared.has(k));
});

/* ------------------------------------------------------------------ run accessors */

test('run accessors: kind, boss, sheet, accuracy, won and flawless read a run record', () => {
  assert.equal(kindOf({ kind: 'boss:B4' }), 'boss');
  assert.equal(kindOf({ kind: 'page' }), 'page');
  assert.equal(kindOf(null), '');
  assert.equal(bossOf({ kind: 'boss:B6' }), 'B6');
  assert.equal(bossOf({ kind: 'boss', id: 'B2' }), 'B2');
  assert.equal(bossOf({ kind: 'page' }), null);
  assert.equal(sheetOfRun({ kind: 'upgrade:AP-1' }), 'AP-1');
  assert.equal(sheetOfRun({ kind: 'upgrade', sheet: 'WP' }), 'WP');
  assert.equal(sheetOfRun({ kind: 'page' }), null);

  assert.equal(accuracyOf({ acc: 0.5 }), 0.5);
  assert.equal(accuracyOf({ scorePct: 80 }), 0.8);
  assert.equal(accuracyOf({ items: [{ credit: 1 }, { credit: 0.4 }] }), 0.7);
  assert.equal(accuracyOf({}), null);
  assert.equal(correctCount({ items: [{ credit: 1 }, { credit: 0.4 }, { ok: true }] }), 2);

  assert.equal(wonRun({ kind: 'boss:B1', won: true }), true);
  assert.equal(wonRun({ kind: 'boss:B1', status: 'done', hearts: 2 }), true);
  assert.equal(wonRun({ kind: 'boss:B1', status: 'done', hearts: 0 }), false);
  assert.equal(flawlessRun({ won: true, hearts: 3 }), true);
  assert.equal(flawlessRun({ won: true, hearts: 3, flagged: true }), false, 'a CONTINUE? run is flagged *');
  assert.equal(isCleanItem({ credit: 1, attempt: 1, hints: 0 }), true);
  assert.equal(isCleanItem({ credit: 1, attempt: 1, hints: 1 }), false);
  assert.equal(isCleanItem({ credit: 0.4, attempt: 1 }), false);
});

/* ------------------------------------------------------------------ coverage / histogram */

test('coverage: the Binder fill is Readiness C, counted by readiness.js itself', () => {
  const s = save();
  clearAll(s, ['voc-01', 'voc-02', 'asn-01'], { rarity: 'silver' });
  const cov = coverage(s);
  const ready = coverageCount(s);
  assert.deepEqual({ cleared: cov.cleared, total: cov.total }, ready);
  assert.equal(cov.frac, ready.cleared / ready.total);
  assert.equal(cov.cleared, 3);
  assert.equal(cov.total, ORIGINAL_IDS.length);
  assert.deepEqual(clearedOriginals(s), ['voc-01', 'voc-02', 'asn-01'].filter(id => ORIGINAL_IDS.includes(id)));

  // a BLITZ / "Full 36" clear is only in the history — it still counts (S4)
  const h = save();
  h.cards['asn-05'] = { attempts: 1, history: [{ at: AT, ok: true, attempt: 1, hints: 0, ms: 1200 }] };
  assert.equal(coverage(h).cleared, 1);
});

test('rarityHistogram: every tile lands in exactly one bucket', () => {
  const s = save();
  clear(s, 'voc-01', { rarity: 'gold' });
  clear(s, 'voc-02', { rarity: 'platinum' });
  clear(s, 'voc-03', { rarity: 'silver' });
  clear(s, 'voc-04', { rarity: 'bronze' });
  platFamily(s, 'fam-sys');
  const hist = rarityHistogram(s);
  const total = Object.values(hist).reduce((a, b) => a + b, 0);
  assert.equal(total, ORIGINAL_IDS.length + FAMILY_IDS.length);
  assert.equal(hist.gold, 1);
  assert.equal(hist.platinum, 2, 'the family tile at 6 Gold across 2 days is Platinum');
  assert.equal(hist.silver, 1);
  assert.equal(hist.bronze, 1);
  assert.equal(rarityHistogram(s, { families: false }).platinum, 1);
});

/* ------------------------------------------------------------------ the Binder's tooltips */

test('binder tiles: every tile the Binder draws has a Foil rule to print', () => {
  const drawn = sheets.flatMap(s => s.ids);
  assert.ok(drawn.length > 190);
  for (const id of drawn) {
    const rule = foilRule(id);
    assert.equal(typeof rule, 'string');
    assert.ok(rule.length > 20, `${id}: tooltip`);
    if (id.startsWith('bonus-')) {
      assert.match(rule, /Bonus bank/, `${id}: the Bonus bank says it has no path`);
    } else {
      assert.ok(foilClass(id), `${id}: no Foil class — the tile would have no reachable path`);
      assert.match(rule, /Platinum|Gold/, `${id}: the rule names the path`);
    }
  }
});

test('binder tiles: the sheet tabs cover every trophy-bearing original exactly once', () => {
  const seen = new Set();
  for (const sh of TROPHY_SHEETS) for (const id of sh.ids) {
    assert.ok(!seen.has(id), `${id} appears on two tabs`);
    seen.add(id);
  }
  for (const id of ORIGINAL_IDS) assert.ok(seen.has(id), `${id} is on no Binder tab`);
  assert.equal(seen.size, ORIGINAL_IDS.length);
});

/* ------------------------------------------------------------------ ctx */

test('makeCtx: tolerates a save with missing sections and never throws', () => {
  for (const bad of [null, undefined, {}, { cards: null, runs: 'nope', counters: 7 }]) {
    const ctx = makeCtx(bad);
    assert.equal(ctx.n('setups'), 0);
    assert.equal(ctx.cleared('voc-01'), false);
    assert.equal(ctx.tile('voc-01'), null);
    assert.equal(ctx.streakBest, 0);
    assert.doesNotThrow(() => check(bad));
  }
  assert.deepEqual(check(null), []);
});

/* ------------------------------------------------------------------ install */

test('install: evaluates on bus events, writes through update, and is re-entrancy safe', () => {
  const listeners = new Map();
  const bus = {
    on(evt, fn) { (listeners.get(evt) ?? listeners.set(evt, new Set()).get(evt)).add(fn); return () => listeners.get(evt).delete(fn); },
    emit(evt, ...a) { for (const fn of [...(listeners.get(evt) ?? [])]) fn(...a); },
  };
  const state = save();
  let updates = 0;
  const getState = () => state;
  const update = (fn) => { updates++; fn(state); bus.emit('state', state, 'update'); return state; };

  const handle = install({ bus, getState, update, silent: true });
  try {
    assert.equal(updates, 0, 'a fresh save earns nothing at boot');

    clear(state, 'voc-01');
    bus.emit('graded', { id: 'voc-01' });
    assert.equal(updates, 1);
    assert.ok(state.trophies['first-blood'], 'the grade earned it');

    // the write re-emits 'state'; the guard must stop it re-entering and must not double-record
    const at = state.trophies['first-blood'].at;
    bus.emit('state', state, 'update');
    assert.equal(updates, 1, 'nothing new, so nothing written');
    assert.equal(state.trophies['first-blood'].at, at);

    // install is idempotent
    assert.equal(install({ bus, getState, update, silent: true }), handle);
  } finally {
    handle.uninstall();
  }
  clear(state, 'voc-02');
  bus.emit('graded', {});
  assert.equal(updates, 1, 'uninstall detaches the listeners');
});

test('install: requires its injected shell (it never reaches for app.js or localStorage)', () => {
  assert.throws(() => install({}), TypeError);
  assert.throws(() => install({ bus: { on() {} } }), TypeError);
});

/* ------------------------------------------------------------------ toast */

test('toast: is a no-op without a DOM and keeps the S4 duration', () => {
  assert.equal(TOAST_MS, 1500);
  assert.equal(toast('hello', { doc: null }), null);
  assert.equal(toastTrophy('first-blood', { doc: null }), null);
  assert.equal(toastTrophy('not-a-trophy', { doc: null }), null);
});

/* binder r1: three taps and "Hand it in" with nothing answered is neither a streak day nor a trophy (S9 #10) */
test('trophies: night-owl-no needs a night that counted — an empty run earns nothing', () => {
  const at = new Date(2026, 8, 16, 20, 30, 0).getTime();
  const empty = addRun(save(), { kind: 'night', answered: 0, items: [], startedAt: at - 20_000, submittedAt: at });
  assert.ok(!check(empty).includes('night-owl-no'), 'nothing answered');
  const thin = addRun(save(), { kind: 'night', answered: 3, startedAt: at - 4 * 60_000, submittedAt: at });
  assert.ok(!check(thin).includes('night-owl-no'), 'three items in four minutes is under the floor');
  const long = addRun(save(), { kind: 'night', answered: 3, startedAt: at - 12 * 60_000, submittedAt: at });
  assert.ok(check(long).includes('night-owl-no'), 'some answered and ten minutes of work counts');
  const full = addRun(save(), { kind: 'night', answered: 8, startedAt: at - 60_000, submittedAt: at });
  assert.ok(check(full).includes('night-owl-no'), 'eight answered counts');
  // an older record without `answered` falls back to its item list
  const legacy = addRun(save(), { kind: 'night', items: items(8), submittedAt: at });
  assert.ok(check(legacy).includes('night-owl-no'));
});
