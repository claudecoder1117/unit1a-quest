// run.test.mjs — T16, the generic run screen (#/run/:kind/:id?seed=) and its modes.
//
// Everything the screen decides is a pure export of js/screens/run.js, so this file drives the rules
// without a DOM: the BLITZ round machine (−3 s, 1.2 s lockout, three-in-a-row end), the JUMP placement
// write (m = 80 with n = 5, placedAt, jumps[M] — and Readiness C untouched), each kind's queue, and the
// Page Summary's arithmetic against js/xp.js itself.
//
// COMPOSED S1 "Optional modes" + "Screens" (13 routes), S4 (rarity, mastery, Readiness), S7 (runs), S8 #16.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import * as R from '../site/js/screens/run.js';
import { fresh } from '../site/js/store.js';
import { installation } from '../site/js/trophies.js';
import { cyrb53, mulberry32 } from '../site/js/rng.js';
import { byId as cardById, cards as ALL_CARDS } from '../site/data/cards.js';
import { moduleById } from '../site/data/modules.js';
import { xpFor, nextCombo, isClean } from '../site/js/xp.js';
import { mShown, isMastered } from '../site/js/mastery.js';
import { isCleared, coverageCount, readiness, skillStates } from '../site/js/readiness.js';
import { tileRarity } from '../site/js/rarity.js';
import { ROOT, read, stripCommentsAndStrings as stripComments } from './_helpers.mjs';   // T17

// app.js is imported dynamically and its side effect undone: importing it evaluates screens/index.js,
// which installs the trophy engine (a module singleton) on a microtask. Left installed, this file would
// change the world for tests/trophies.test.mjs, which runs after it. Nothing else here touches globals.
const { ROUTE_PATTERNS, ALIASES } = await import('../site/js/app.js');
await Promise.resolve();
installation()?.uninstall();

const NOW = Date.parse('2026-09-17T14:00:00');
const save0 = () => fresh(NOW);

/* ================================================================= routes */

test('T16: one mount point per run kind, and the route count is still 13', async (t) => {
  await t.test('the 13 routes of S1 are unchanged', () => {
    assert.equal(ROUTE_PATTERNS.length, 13, ROUTE_PATTERNS.join(' '));
    assert.ok(ROUTE_PATTERNS.includes('/run/:kind/:id?'));
    // #/night and #/morning are ALIASES of #/run/night / #/run/morning, not routes of their own.
    assert.deepEqual(Object.keys(ALIASES).sort(), ['/morning', '/night']);
    assert.equal(ALIASES['/night'], '/run/night');
    assert.equal(ALIASES['/morning'], '/run/morning');
  });

  await t.test('every run kind named in S1/S7 mounts on #/run/:kind', () => {
    assert.deepEqual([...R.RUN_KINDS].sort(), [
      'baseline', 'blitz', 'daily', 'drill', 'full36', 'jump', 'missed', 'morning', 'night', 'page', 'upgrade',
    ].sort());
    for (const k of R.RUN_KINDS) assert.ok(R.isRunKind(k), k);
    assert.equal(R.isRunKind('nope'), false);
  });

  await t.test('the screen registry wires run.js exactly once, on that one pattern', () => {
    const idx = stripComments(read('site/js/screens/index.js'));
    const code = read('site/js/screens/index.js');
    assert.match(code, /screens\['\/run\/:kind\/:id\?'\]\s*=\s*mountRun/);
    assert.equal(idx.match(/mountRun/g)?.length, 2, 'imported once, registered once');
    // No second screen may claim a run kind as its own route.
    for (const k of R.RUN_KINDS) assert.ok(!ROUTE_PATTERNS.includes(`/${k}`), `${k} must not be a route`);
  });

  await t.test('run.js is in the service worker precache list (T15b sw.test.mjs)', () => {
    assert.match(read('site/sw.js'), /'js\/screens\/run\.js'/);
  });
});

/* ================================================================= BLITZ */

test('T16 BLITZ: wrong-answer spam ends the round', async (t) => {
  await t.test('three wrongs in a row end it — and the third answer is the last one taken', () => {
    const t0 = NOW;
    const round = R.createBlitzRound({ limitMs: 60_000, startedAt: t0 });
    let s = round.answer(false, { now: t0 + 1000 });
    assert.equal(s.ended, false);
    assert.equal(s.strikes, 1);
    assert.equal(s.remaining, 60_000 - 1000 - 3000, 'a wrong answer subtracts 3 s');

    // the 1.2 s lockout swallows a spammed answer entirely (it is not even counted)
    const spam = round.answer(false, { now: t0 + 1100 });
    assert.equal(spam.answered, 1, 'an answer inside the lockout is ignored');
    assert.equal(spam.strikes, 1);

    s = round.answer(false, { now: t0 + 3000 });
    assert.equal(s.strikes, 2);
    assert.equal(s.ended, false);
    s = round.answer(false, { now: t0 + 6000 });
    assert.equal(s.ended, true);
    assert.equal(s.reason, 'strikes');
    assert.equal(s.score, 0);

    // nothing lands after the end
    const after = round.answer(true, { now: t0 + 7000 });
    assert.equal(after.score, 0);
    assert.equal(after.ended, true);
  });

  await t.test('a correct answer resets the strike run (only three IN A ROW end it)', () => {
    const t0 = NOW;
    const round = R.createBlitzRound({ startedAt: t0 });
    round.answer(false, { now: t0 + 1000 });
    round.answer(false, { now: t0 + 3000 });
    const ok = round.answer(true, { now: t0 + 5000 });
    assert.equal(ok.strikes, 0);
    assert.equal(ok.score, 1);
    const s = round.answer(false, { now: t0 + 6000 });
    assert.equal(s.ended, false, 'two more wrongs are needed after the correct');
    assert.equal(s.strikes, 1);
  });

  await t.test('spamming is never positive-EV: penalties strictly shorten the round', () => {
    const t0 = NOW;
    const clean = R.createBlitzRound({ startedAt: t0 });
    const spammer = R.createBlitzRound({ startedAt: t0 });
    spammer.answer(false, { now: t0 + 500 });
    spammer.answer(true, { now: t0 + 2000 });   // clears the strike, keeps the −3 s
    assert.ok(spammer.remaining(t0 + 2000) < clean.remaining(t0 + 2000));
    assert.equal(clean.remaining(t0 + 2000) - spammer.remaining(t0 + 2000), R.BLITZ.penaltyMs);
  });

  await t.test('the clock is wall-clock and the round ends at 0:00', () => {
    const t0 = NOW;
    const round = R.createBlitzRound({ limitMs: 60_000, startedAt: t0 });
    assert.equal(round.tick(t0 + 59_999).ended, false);
    const s = round.tick(t0 + 60_000);
    assert.equal(s.ended, true);
    assert.equal(s.reason, 'time');
    assert.equal(s.remaining, 0);
  });

  await t.test('90 s for M9, 60 s for M1/M3 (S1), tier ≤ 2 everywhere', () => {
    assert.equal(moduleById.M1.blitz, 60);
    assert.equal(moduleById.M3.blitz, 60);
    assert.equal(moduleById.M9.blitz, 90);
    const s = save0();
    assert.equal(R.buildRun('blitz', s, { id: 'M9' }).limitMs, 90_000);
    assert.equal(R.buildRun('blitz', s, { id: 'M1' }).limitMs, 60_000);
    assert.equal(R.buildRun('blitz', s, { id: 'M6' }).meta.module, 'M1', 'a non-BLITZ module falls back to M1');
  });
});

test('T16 BLITZ pools: M1 / M3 / M9 only, recall parts only', async (t) => {
  const rng = () => mulberry32(cyrb53('fixed'));

  await t.test('M1 draws mc / term parts and never a blitz:false part', () => {
    const pool = R.blitzPool('M1', { rng: rng() });
    assert.ok(pool.length >= 20, `M1 pool ${pool.length}`);
    for (const e of pool) {
      assert.ok(['mc', 'term'].includes(e.type), `${e.key} is ${e.type}`);
      assert.notEqual(e.part.blitz, false);
      assert.ok(e.tier <= R.BLITZ.maxTier);
      assert.equal(cardById[e.cardId].module, 'M1');
      assert.ok(e.stem.length > 0, `${e.key} has no prompt`);
    }
  });

  await t.test('M9 is verdict-only and covers the whole ASN + Quizlet set', () => {
    const pool = R.blitzPool('M9', { rng: rng() });
    assert.equal(pool.length, moduleById.M9.originals.length);
    for (const e of pool) assert.equal(e.type, 'asn');
  });

  await t.test('M3 is generated T-csarith at tier ≤ 2', () => {
    const pool = R.blitzPool('M3', { rng: rng(), count: 12 });
    assert.equal(pool.length, 12);
    for (const e of pool) {
      assert.equal(e.template, 'T-csarith');
      assert.equal(e.type, 'num');
      assert.ok(e.tier <= R.BLITZ.maxTier);
      assert.equal(e.cardId, null);
    }
  });

  await t.test('a pool is deterministic for one seed', () => {
    const a = R.blitzPool('M1', { rng: rng() }).map((e) => e.key);
    const b = R.blitzPool('M1', { rng: rng() }).map((e) => e.key);
    assert.deepEqual(a, b);
  });
});

test('T16 BLITZ writes a clear, not XP (S1 "score-only", S4 C / S7 R "a BLITZ clear counts")', async (t) => {
  await t.test('a correct answer clears the card and moves Readiness C', () => {
    const s = save0();
    const e = R.blitzPool('M9', { rng: mulberry32(1) })[0];
    const before = coverageCount(s);
    R.recordBlitzAnswer(s, e, { ok: true, ms: 1400, now: NOW });
    const rec = s.cards[e.cardId];
    assert.equal(rec.cleared, true);
    assert.ok(isCleared(rec));
    assert.equal(rec.lastFirstTry, true);
    assert.equal(rec.history.length, 1);
    assert.equal(rec.history[0].ok, true);
    assert.ok(rec.due > NOW, 'the Leitner interval was applied');
    assert.ok(tileRarity(e.cardId, rec), 'the Binder tile is no longer blank');
    assert.equal(coverageCount(s).cleared, before.cleared + 1);
    assert.equal(s.xp, 0, 'BLITZ pays no XP');
    for (const id of e.skills) assert.ok(s.skills[id].n >= 1, `${id} mastery was updated`);
  });

  await t.test('a wrong answer marks the card missed and pays nothing', () => {
    const s = save0();
    const e = R.blitzPool('M9', { rng: mulberry32(1) })[1];
    R.recordBlitzAnswer(s, e, { ok: false, ms: 900, now: NOW });
    const rec = s.cards[e.cardId];
    assert.equal(rec.cleared, false);
    assert.equal(rec.lastFirstTry, false);
    assert.equal(rec.rarity, null);
    assert.equal(s.xp, 0);
  });

  await t.test('a generated M3 chain has no tile to mint but still moves mastery', () => {
    const s = save0();
    const e = R.blitzPool('M3', { rng: mulberry32(1), count: 3 })[0];
    const rec = R.recordBlitzAnswer(s, e, { ok: true, now: NOW });
    assert.equal(rec, null);
    assert.equal(Object.keys(s.cards).length, 0);
    assert.ok(s.skills.CSARITH.n >= 1);
  });
});

/* ================================================================= JUMP */

test('T16 JUMP: 8 of 10 marks the module placed with m = 80 and n = 5', async (t) => {
  await t.test('the pass line is ≥ 8 of 10 (S1)', () => {
    assert.equal(R.JUMP.items, 10);
    assert.equal(R.JUMP.pass, 8);
    assert.equal(R.jumpPassed(7), false);
    assert.equal(R.jumpPassed(8), true);
    assert.equal(R.jumpPassed(10), true);
  });

  await t.test('a pass writes m = 80 with n = 5, placedAt and jumps[M] — and m_shown is 80 at once', () => {
    const s = save0();
    const out = R.applyJump(s, 'M10', { correct: 8, total: 10, at: NOW });
    assert.equal(out.passed, true);
    assert.deepEqual(out.skills, moduleById.M10.skills);
    for (const id of moduleById.M10.skills) {
      const rec = s.skills[id];
      assert.equal(rec.m, 80);
      assert.equal(rec.n, 5, 'n = 5 so m_shown = m from the first minute');
      assert.equal(rec.placedAt, NOW);
      assert.equal(mShown(rec), 80);
      assert.equal(isMastered(rec), false, 'placement is not mastery');
    }
    assert.equal(s.jumps.M10, true, "the Binder's placed outline reads save.jumps");
  });

  await t.test('Readiness C is unchanged — it counts Cards actually cleared (S1)', () => {
    const s = save0();
    const before = coverageCount(s);
    const rBefore = readiness(s);
    R.applyJump(s, 'M10', { correct: 10, total: 10, at: NOW });
    assert.deepEqual(coverageCount(s), before, 'no card was cleared by placing the module');
    const rAfter = readiness(s);
    assert.equal(rAfter.C, rBefore.C);
    assert.ok(rAfter.M > rBefore.M, 'the mastery term did move');
  });

  await t.test('a fail writes nothing', () => {
    const s = save0();
    const out = R.applyJump(s, 'M10', { correct: 7, total: 10, at: NOW });
    assert.equal(out.passed, false);
    assert.deepEqual(s.skills, {});
    assert.deepEqual(s.jumps, {});
  });

  await t.test('an existing higher n is never lowered', () => {
    const s = save0();
    s.skills.FAC1 = { m: 95, n: 9, lastAt: NOW - 1000, lastDueCorrectAt: null, placedAt: null, decayDays: 0 };
    R.applyJump(s, 'M10', { correct: 9, total: 10, at: NOW });
    assert.equal(s.skills.FAC1.n, 9);
    assert.equal(s.skills.FAC1.m, 80);
  });

  await t.test('the JUMP queue is 10 items for every module that offers one', () => {
    const s = save0();
    for (const m of Object.values(moduleById)) {
      if (m.jump !== true) continue;
      const run = R.buildRun('jump', s, { id: m.id });
      assert.equal(run.empty, null, `${m.id}: ${run.empty}`);
      assert.equal(run.items.length, R.JUMP.items, m.id);
      assert.equal(run.hints, false, `${m.id} JUMP must run without hints`);
    }
  });
});

/* ================================================================= the Page Summary */

test('T16 Page Summary: the numbers are xp.js\'s own', async (t) => {
  // A realistic page: the combo chain, a hinted clear, a retry and a revealed miss.
  const page = [
    { tier: 2, firstTry: true, hints: 0 },
    { tier: 1, firstTry: true, hints: 0 },
    { tier: 3, firstTry: true, hints: 1 },
    { tier: 2, firstTry: false, hints: 0, attempt: 2 },
    { tier: 3, firstTry: true, hints: 0 },
    { tier: 4, firstTry: true, hints: 0, isReview: true },
  ];

  const results = [];
  let combo = 0, expected = 0, expectedClean = 0;
  for (const c of page) {
    const info = xpFor({ ...c, comboBefore: combo, elapsedMs: 40_000 });
    const clean = isClean(c);
    combo = nextCombo(combo, c);
    expected += info.xp;
    if (clean) expectedClean++;
    results.push({
      id: `x${results.length}`, cleared: true, firstTry: !!c.firstTry, hints: c.hints ?? 0, clean,
      rarity: clean ? 'gold' : 'silver', xp: info.xp, xpInfo: info, elapsedMs: 40_000, tier: c.tier, skill: 'CS-LIN',
    });
  }

  await t.test('XP is the sum of xpFor() — no second formula anywhere', () => {
    const sum = R.summarizeRun(results);
    assert.equal(sum.xp, expected);
    assert.equal(sum.xp, results.reduce((a, r) => a + r.xpInfo.xp, 0));
    assert.ok(sum.xp > 0);
  });

  await t.test('flawless count is isClean(), not "cleared"', () => {
    const sum = R.summarizeRun(results);
    assert.equal(sum.clean, expectedClean);
    assert.equal(sum.cleared, results.length);
    assert.equal(sum.count, results.length);
    assert.notEqual(sum.clean, sum.cleared, 'a hinted clear is cleared but not flawless');
  });

  await t.test('the rarity histogram counts every item once, cleared or revealed', () => {
    const missed = { id: 'x9', cleared: false, rarity: 'bronze', xp: 0, hints: 0, firstTry: false, elapsedMs: 9000 };
    const sum = R.summarizeRun([...results, missed]);
    const total = Object.values(sum.rarities).reduce((a, b) => a + b, 0);
    assert.equal(total, results.length + 1);
    assert.equal(sum.missed, 1);
    assert.equal(sum.cleared, results.length);
    assert.equal(sum.accuracy, results.length / (results.length + 1));
    assert.equal(sum.xp, expected, 'a revealed item pays 0 (S4 solution-shown → 0 XP)');
  });

  await t.test('an empty run summarises to zeroes, not NaN', () => {
    const sum = R.summarizeRun([]);
    assert.deepEqual(
      { count: sum.count, xp: sum.xp, clean: sum.clean, accuracy: sum.accuracy },
      { count: 0, xp: 0, clean: 0, accuracy: 0 },
    );
  });

  await t.test('xpOfResult reads either the number or the breakdown', () => {
    assert.equal(R.xpOfResult({ xp: 54 }), 54);
    assert.equal(R.xpOfResult({ xpInfo: { xp: 30 } }), 30);
    assert.equal(R.xpOfResult(null), 0);
  });
});

test('T16 Summary: minted tiles and skill bars are before/after diffs', async (t) => {
  await t.test('tileIdsOf collects originals, a Variant\'s card and its family tile', () => {
    const ids = R.tileIdsOf([
      R.cardItem(cardById['ang-10'], 'new'),
      R.variantItem('T-sys', 's1', 'weak'),
      R.variantItem('T-cs-lin', 's2', 'weak', { forCard: 'wp-07' }),
    ]);
    assert.ok(ids.includes('ang-10'));
    assert.ok(ids.includes('wp-07'));
    assert.ok(ids.includes('fam-sys'), 'the family tile a Variant credits is watched too');
  });

  await t.test('mintedTiles reports only tiles that improved', () => {
    const before = { 'ang-10': null, 'wp-07': 'silver', 'fam-sys': 'bronze' };
    const after = { 'ang-10': 'gold', 'wp-07': 'silver', 'fam-sys': 'silver' };
    const minted = R.mintedTiles(before, after);
    assert.deepEqual(minted.map((m) => m.id).sort(), ['ang-10', 'fam-sys']);
    assert.deepEqual(minted.find((m) => m.id === 'ang-10'), { id: 'ang-10', from: null, to: 'gold', fam: false });
    assert.equal(minted.find((m) => m.id === 'fam-sys').fam, true);
  });

  await t.test('a real BLITZ clear shows up as a minted tile', () => {
    const s = save0();
    const e = R.blitzPool('M9', { rng: mulberry32(7) })[0];
    const ids = [e.cardId];
    const before = R.tileSnapshot(s, ids);
    R.recordBlitzAnswer(s, e, { ok: true, now: NOW });
    const minted = R.mintedTiles(before, R.tileSnapshot(s, ids));
    assert.equal(minted.length, 1);
    assert.equal(minted[0].id, e.cardId);
    assert.equal(minted[0].from, null);
  });

  await t.test('skillDeltas animates old → new for the skills the run touched', () => {
    const s = save0();
    const before = skillStates(s);
    R.applyJump(s, 'M12', { correct: 9, total: 10, at: NOW });
    const bars = R.skillDeltas(before, skillStates(s), ['SYS']);
    assert.equal(bars.length, 1);
    assert.equal(bars[0].id, 'SYS');
    assert.equal(bars[0].from, 0);
    assert.equal(bars[0].to, 80);
  });
});

/* ================================================================= the other kinds */

test('T16 queues: every kind builds the set S1/S7 describes', async (t) => {
  await t.test('drill = 5 Variants of one skill, and the run pays scope 1 (no Variant discount)', () => {
    const run = R.buildRun('drill', save0(), { id: 'CS-LIN' });
    assert.equal(run.items.length, R.DRILL_ITEMS);
    assert.equal(run.drill, true);
    for (const it of run.items) assert.equal(it.kind, 'variant');
    // xp.js is the authority on what `isDrill` pays; this pins the contract the screen relies on.
    const drill = xpFor({ tier: 2, firstTry: true, hints: 0, isDrill: true, isVariant: true });
    const variant = xpFor({ tier: 2, firstTry: true, hints: 0, isVariant: true });
    assert.ok(drill.xp > variant.xp, 'a Drill Variant is not discounted');
  });

  await t.test('drill falls back to originals for a skill with no generator (ASN)', () => {
    const run = R.buildRun('drill', save0(), { id: 'ASN-PLP' });
    assert.equal(run.items.length, R.DRILL_ITEMS);
    for (const it of run.items) assert.equal(it.kind, 'card');
  });

  await t.test('an unknown skill is an honest empty state, never a crash', () => {
    const run = R.buildRun('drill', save0(), { id: 'NOPE' });
    assert.equal(run.items.length, 0);
    assert.match(run.empty, /weak spot/i);
  });

  await t.test('full36 = all 36 ASN statements, untimed, reason chips on every item', () => {
    const run = R.buildRun('full36', save0(), {});
    assert.equal(run.items.length, 36);
    assert.deepEqual(run.items.map((i) => i.id), [...R.FULL36_IDS]);
    assert.equal(run.limitMs, null, 'Full 36 is untimed (S1)');
    assert.equal(run.mode, 'full36', 'the asn grader asks the chips in this mode');
  });

  await t.test('daily is cyrb53(dateISO) — same day, same set; different day, different set', () => {
    const s = save0();
    const a = R.buildRun('daily', s, { now: NOW, today: '2026-09-17' });
    const b = R.buildRun('daily', s, { now: NOW, today: '2026-09-17' });
    const c = R.buildRun('daily', s, { now: NOW, today: '2026-09-18' });
    assert.equal(a.seed, String(cyrb53('2026-09-17') >>> 0));
    assert.deepEqual(a.items.map((i) => i.id), b.items.map((i) => i.id));
    assert.notDeepEqual(a.items.map((i) => i.id), c.items.map((i) => i.id));
    assert.equal(a.items.length, R.DAILY_ITEMS);
    assert.equal(new Set(a.items.map((i) => i.module)).size, a.items.length, 'one module each — never five vocab cards');
  });

  await t.test('missed cycles the missed originals 5 at a time (S7)', () => {
    const s = save0();
    assert.match(R.buildRun('missed', s, {}).empty, /Nothing missed/);
    for (const id of ['wp-01', 'wp-02', 'wp-03', 'asn-05', 'asn-06', 'fac-02']) {
      s.cards[id] = { ...R.cardRecordOf(s, id), attempts: 2, cleared: true, rarity: 'silver', lastAt: NOW, lastFirstTry: false };
    }
    const run = R.buildRun('missed', s, {});
    assert.equal(run.items.length, R.MISSED_PAGE);
    assert.equal(run.meta.remaining, 6);
    for (const it of run.items) assert.equal(it.isReview, true);
  });

  await t.test('upgrade = every Bronze/Silver original, Bronze first, hints off', () => {
    const s = save0();
    s.cards['wp-01'] = { ...R.cardRecordOf(s, 'wp-01'), cleared: true, rarity: 'silver', lastAt: NOW };
    s.cards['wp-02'] = { ...R.cardRecordOf(s, 'wp-02'), cleared: true, rarity: 'bronze', lastAt: NOW };
    s.cards['wp-03'] = { ...R.cardRecordOf(s, 'wp-03'), cleared: true, rarity: 'gold', lastAt: NOW };
    const run = R.buildRun('upgrade', s, {});
    assert.deepEqual(run.items.map((i) => i.id), ['wp-02', 'wp-01']);
    assert.equal(run.hints, false, 'S7: "Upgrade run = all Bronze/Silver originals, hints off"');
    const sheetRun = R.buildRun('upgrade', s, { id: cardById['wp-01'].sheet });
    assert.ok(sheetRun.items.every((i) => cardById[i.id].sheet === cardById['wp-01'].sheet));
    assert.match(R.buildRun('upgrade', s, { id: 'VOC' }).empty, /Gold/);
  });

  await t.test('no queue ever serves a Bonus-bank card', () => {
    const s = save0();
    for (const kind of ['full36', 'daily']) {
      for (const it of R.buildRun(kind, s, {}).items) {
        assert.notEqual(cardById[it.id]?.module, 'M13', `${kind} served ${it.id}`);
      }
    }
    for (const it of R.buildRun('drill', s, { id: 'ASN-PLP' }).items) assert.notEqual(cardById[it.id]?.module, 'M13');
  });

  await t.test('the kinds another ticket already owns are delegated, never re-implemented', () => {
    assert.equal(R.delegateOf('baseline').mod, './mock.js');
    assert.equal(R.delegateOf('night').mod, './night.js');
    assert.equal(R.delegateOf('morning').mod, './night.js');
    assert.equal(R.delegateOf('jump').mod, './onboard.js', 'one JUMP screen, the one the Binder links to');
    assert.equal(R.delegateOf('jump').fallback, 'self', "run.js's own JUMP runner is the fallback");
    assert.equal(R.delegateOf('page'), null);
    assert.equal(R.delegateOf('blitz'), null);
    // The delegate targets really export what run.js asks for (a rename here must not be silent).
    for (const kind of ['baseline', 'night', 'morning', 'jump']) {
      const d = R.delegateOf(kind);
      const src = read(path.join('site/js/screens', d.mod.replace('./', '')));
      assert.ok(d.fns.some((fn) => src.includes(`export function ${fn}`)), `${d.mod} exports none of ${d.fns.join('/')}`);
    }
  });
});

/* ================================================================= run records */

test('T16 run records carry what #/stats and the trophies read', async (t) => {
  const results = [
    { id: 'a', skill: 'VOC', tier: 1, cleared: true, firstTry: true, hints: 0, clean: true, xp: 10, elapsedMs: 8000 },
    { id: 'b', skill: 'VOC', tier: 1, cleared: false, firstTry: false, hints: 2, clean: false, xp: 0, elapsedMs: 30000 },
  ];

  await t.test('kind is "kind" or "kind:id", status done, xp / acc / items[] present', () => {
    const rec = R.makeRunRecord({ kind: 'drill', id: 'CS-LIN', seed: 's', seedTag: 'abc123', startedAt: NOW, submittedAt: NOW + 60_000, results });
    assert.equal(rec.kind, 'drill:CS-LIN');
    assert.equal(rec.status, 'done');
    assert.equal(rec.xp, 10);
    assert.equal(rec.acc, 0.5);
    assert.equal(rec.flawless, 1);
    assert.equal(rec.items.length, 2);
    assert.deepEqual(rec.items[0], { id: 'a', skill: 'VOC', tier: 1, credit: 1, clean: true, ms: 8000, flagged: false });
    assert.equal(rec.items[1].credit, 0);
    assert.equal(R.makeRunRecord({ kind: 'page', startedAt: NOW, results: [] }).kind, 'page');
  });

  await t.test('pushRun numbers the run and leaves the rest of the save alone', () => {
    const s = save0();
    const a = R.pushRun(s, R.makeRunRecord({ kind: 'page', startedAt: NOW, results }));
    const b = R.pushRun(s, R.makeRunRecord({ kind: 'blitz', id: 'M1', startedAt: NOW, results: [] }));
    assert.equal(a.n, 1);
    assert.equal(b.n, 2);
    assert.equal(s.runs.length, 2);
    assert.equal(s.runs[1].kind, 'blitz:M1');
  });
});

/* ================================================================= determinism */

test('T16: no Math.random, and every seed is reproducible', async (t) => {
  await t.test('run.js contains no Math.random (tests/no-random.test.mjs greps js/ too)', () => {
    assert.ok(!/Math\.random/.test(stripComments(read('site/js/screens/run.js'))));
  });

  await t.test('?seed= wins over the derived seed (RETRY SAME SEED)', () => {
    const s = save0();
    const run = R.buildRun('drill', s, { id: 'CS-LIN', seed: 'pinned' });
    assert.equal(run.seed, 'pinned');
    const again = R.buildRun('drill', s, { id: 'CS-LIN', seed: 'pinned' });
    assert.deepEqual(run.items.map((i) => i.id), again.items.map((i) => i.id));
  });

  await t.test('the derived seed never uses a random source', () => {
    const s = save0();
    const a = R.runSeed('drill', { id: 'CS-LIN', save: s, today: '2026-09-17' });
    const b = R.runSeed('drill', { id: 'CS-LIN', save: s, today: '2026-09-17' });
    assert.equal(a, b);
    assert.notEqual(a, R.runSeed('drill', { id: 'CS-LIN', save: s, today: '2026-09-18' }));
    assert.equal(R.seedTagOf(a).length, 6);
  });

  await t.test('shuffled() is a permutation, never a loss', () => {
    const src = ALL_CARDS.slice(0, 40).map((c) => c.id);
    const out = R.shuffled(src, mulberry32(cyrb53('k')));
    assert.equal(out.length, src.length);
    assert.deepEqual([...out].sort(), [...src].sort());
  });
});
