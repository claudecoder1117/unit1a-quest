// mock.test.mjs — T13: the Mock blueprint, the exam machine and the report (COMPOSED S7 "Mock", S8 #13).
//
// The acceptance list in S8 #13, one test each:
//   · every Mock slot has ≥ 3 candidate sources; `quad-*` are Mock-eligible through slot E and `fact-*`
//     through slot C; the blueprint's section pools equal `source-manifest.js`'s `mock` letters exactly
//   · Mock XP is granted once per seed (and a RETRY SAME SEED pays nothing)
//   · killing the tab mid-Mock and reopening resumes with the TRUE remaining time
//   · the Baseline switches Readiness from the provisional formula to the full one
// plus the things a real student would notice if they broke: a perfect paper scores 100, a blank one 0,
// section D's `equation` slot is worth 40 % of its item, submit is idempotent, every miss lands in
// bucket 0 with an error entry, and a Mastered skill that missed drops to 69.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cards, byId } from '../site/data/cards.js';
import { manifest, manifestIds, isBonus, mockSections, MOCK_SECTIONS } from '../site/data/source-manifest.js';
import { templates, generate } from '../site/data/templates.js';
import * as BP from '../site/data/blueprint.js';
import * as M from '../site/js/screens/mock.js';
import * as R from '../site/js/screens/report.js';
import { fresh, migrate, pack, unpack, applyCaps } from '../site/js/store.js';
import { readiness, accuracyTerm, MINI_MOCK_FACTOR } from '../site/js/readiness.js';
import { isDue } from '../site/js/schedule.js';
import { isMastered, mShown } from '../site/js/mastery.js';
import { todayISO, addDays } from '../site/js/days.js';
import { correctRaw } from './_helpers.mjs';   // T17: one builder, shared with coverage.test.mjs

const MODS = await M.mods();
const nonBonus = manifestIds({ bonus: false });
const LETTERS = Object.keys(MOCK_SECTIONS);

/* ------------------------------------------------------------------ helpers */

const save0 = (over = {}) => Object.assign(fresh(Date.parse('2026-09-17T09:00:00')), over);

/** Fill an open run. `how(item, part, built) → raw | undefined` (undefined = leave blank). */
function fill(run, how) {
  for (const item of run.items) {
    const built = BP.itemFor(M.planOf(item), generate);
    if (!built) continue;
    for (const part of built.parts) {
      const raw = how(item, part, built);
      if (raw === undefined) continue;
      M.setItemAnswer(item, part.id, { raw, values: null });
    }
  }
  return run;
}

const allCorrect = (item, part, built) => correctRaw(built.raw, part);
const allBlank = () => undefined;

/** Start + fill + submit in one go; returns { save, n, run }. */
function takeRun(save, { kind = 'mock', how = allCorrect, pred = null, now = Date.parse('2026-09-17T09:00:00'), replayOf = null } = {}) {
  const { n, run } = M.startRun(save, { kind, pred, now, replayOf });
  fill(run, how);
  const done = M.submitRun(save, n, { M: MODS, now: now + 20 * 60 * 1000 });
  return { save, n, run: done };
}

/* ==================================================================== 1. the blueprint */

test('blueprint: every slot has ≥ 3 candidate sources (S8 #13 acceptance)', () => {
  for (const kind of ['mock', 'baseline']) {
    for (const slot of BP.slotsFor(kind)) {
      const n = BP.sourcesOf(slot).length;
      assert.ok(n >= 3, `${kind} slot ${slot.id} (${slot.label}) has ${n} candidate sources — want ≥ 3`);
    }
  }
});

test('blueprint: every template a slot names is registered, with the modes it forces', () => {
  for (const kind of ['mock', 'baseline']) {
    for (const slot of BP.slotsFor(kind)) {
      for (const t of slot.templates) {
        const entry = templates[t.template];
        assert.ok(entry, `${slot.id}: unknown template ${t.template}`);
        for (const mode of t.modes ?? []) {
          assert.ok((entry.modes ?? []).includes(mode), `${slot.id}: ${t.template} has no mode "${mode}"`);
        }
      }
    }
  }
});

test('blueprint: the section pools equal source-manifest.js\'s mock letters, in both directions', () => {
  for (const L of LETTERS) {
    const mine = new Set(BP.candidates(L));
    const theirs = new Set(manifest.filter(r => !r.bonus && (r.mock ?? '').includes(L)).map(r => r.id));
    assert.deepEqual([...mine].sort(), [...theirs].sort(), `section ${L} pool differs from the manifest`);
  }
  assert.equal(BP.coveredIds().length, nonBonus.length, 'every non-bonus id is drawable somewhere');
  for (const id of nonBonus) assert.ok(BP.sectionsOf(id).length >= 1, `${id}: eligible for no section`);
  for (const id of manifestIds().filter(isBonus)) assert.deepEqual(BP.sectionsOf(id), [], `${id}: a bonus card is Mock-eligible`);
});

test('blueprint: quad-* are eligible in E and fact-* in C (the S2 sentence, checked on the blueprint itself)', () => {
  for (const id of ['quad-01', 'quad-02', 'quad-03']) {
    assert.ok(BP.eligible(id, 'E'), `${id} must be drawable by section E`);
    assert.ok(mockSections(id).includes('E'), `${id} manifest letter`);
  }
  for (const id of ['fac-01', 'fac-16', 'fac-18']) assert.ok(BP.eligible(id, 'E'), `${id} in E`);
  for (const id of ['fact-01', 'fact-02', 'fact-03', 'fact-04', 'fact-05']) {
    assert.ok(BP.eligible(id, 'C'), `${id} must be drawable by section C`);
    assert.ok(!BP.eligible(id, 'E'), `${id} is not algebra review`);
  }
  for (const id of ['asn-01', 'asn-36', 'qz-01', 'qz-18']) assert.ok(BP.eligible(id, 'C'), `${id} in C`);
  // section C poses VERDICT items only — every card it can draw has an `asn` part
  for (const id of BP.candidates('C')) assert.ok(byId[id].parts.some(p => p.type === 'asn'), `${id}: section C needs an asn part`);
  // …and the slot pins the asn part even on the two-part `fact-*` cards (cloze + asn)
  const plan = BP.buildPlan(save0(), { kind: 'mock', seed: 'fact-probe' });
  for (const p of plan.items.filter(x => x.section === 'C' && /^fact-/.test(x.cardId ?? ''))) {
    assert.deepEqual(p.partIds, ['asn'], `${p.cardId}: section C must pose the verdict part, not the cloze`);
  }
});

test('blueprint: the Mock is 20 items in the doc\'s section order, the Baseline 10 across all five sections', () => {
  const mock = BP.buildPlan(save0(), { kind: 'mock', index: 1 });
  assert.equal(mock.items.length, 20);
  assert.equal(mock.limitMs, 40 * 60 * 1000);
  assert.deepEqual(mock.items.map(i => i.section), [...'AAAABBCCCCDDDDDDEEEE']);
  assert.deepEqual(BP.sectionsFor('mock').map(s => `${s.id}${s.count}`), ['A4', 'B2', 'C4', 'D6', 'E4']);

  const base = BP.buildPlan(save0(), { kind: 'baseline', index: 1 });
  assert.equal(base.items.length, 10);
  assert.equal(base.limitMs, 20 * 60 * 1000);
  assert.deepEqual([...new Set(base.items.map(i => i.section))], ['A', 'B', 'C', 'D', 'E']);
  // every Baseline pool is a subset of the Mock's section pool — one blueprint, not two
  for (const slot of BP.BASELINE_SLOTS) {
    const pool = new Set(BP.candidates(slot.section));
    for (const id of slot.cards) assert.ok(pool.has(id), `baseline ${slot.id} draws ${id}, which the Mock section ${slot.section} cannot`);
  }
});

test('blueprint: seeds are S7\'s (`mock#1`, `mock#2`, `baseline#1`) and the same seed replays the same paper', () => {
  assert.equal(BP.seedFor('mock', 1), 'mock#1');
  assert.equal(BP.seedFor('mock', 4), 'mock#4');
  assert.equal(BP.seedFor('baseline', 1), 'baseline#1');
  const s = save0();
  const a = BP.buildPlan(s, { kind: 'mock', index: 2 });
  const b = BP.buildPlan(s, { kind: 'mock', index: 2 });
  assert.deepEqual(JSON.parse(JSON.stringify(a.items)), JSON.parse(JSON.stringify(b.items)));
  const c = BP.buildPlan(s, { kind: 'mock', index: 3 });
  assert.notDeepEqual(a.items.map(i => i.id ?? i.seed), c.items.map(i => i.id ?? i.seed), 'different Mocks are different papers');
});

test('blueprint: no original appears twice on one paper', () => {
  for (let i = 1; i <= 6; i++) {
    const plan = BP.buildPlan(save0(), { kind: 'mock', index: i });
    const ids = plan.items.filter(p => p.cardId).map(p => p.cardId);
    assert.equal(new Set(ids).size, ids.length, `Mock #${i} repeats an original`);
  }
});

test('blueprint: coverage-first — unseen beats unbeaten beats generated, and Mock #1 prefers originals', () => {
  // everything in slot E1's pool cleared Gold ⇒ rank 2 ⇒ a later Mock falls through to a Variant…
  const s = save0();
  const e1 = BP.MOCK_SLOTS.find(x => x.id === 'E1');
  for (const id of [...e1.cards, ...BP.MOCK_SLOTS.find(x => x.id === 'E2').cards, 'quad-01', 'quad-02', 'quad-03']) {
    s.cards[id] = { attempts: 1, cleared: true, rarity: 'gold', lastFirstTry: true, history: [{ at: 1, ok: true }] };
  }
  const later = BP.buildPlan(s, { kind: 'mock', index: 3 });
  assert.equal(later.items.find(i => i.slotId === 'E1').source, 'variant', 'a fully beaten pool falls through to a generated Variant');
  // …but Mock #1 prefers originals (S7)
  const first = BP.buildPlan(s, { kind: 'mock', index: 1 });
  assert.equal(first.items.find(i => i.slotId === 'E1').source, 'card', 'Mock #1 prefers originals');

  // an unseen card in the pool always beats a beaten one
  const s2 = save0();
  const pool = BP.MOCK_SLOTS.find(x => x.id === 'D3').cards;
  for (const id of pool.slice(1)) s2.cards[id] = { attempts: 1, cleared: true, rarity: 'gold', lastFirstTry: true, history: [{ at: 1, ok: true }] };
  const p = BP.buildPlan(s2, { kind: 'mock', index: 2 });
  assert.equal(p.items.find(i => i.slotId === 'D3').cardId, pool[0], 'the one unseen original of the slot is drawn');
});

test('blueprint: an original appears at most once per 3 Mocks', () => {
  const s = save0();
  const { run: r1 } = M.startRun(s, { kind: 'mock', now: 1 });
  const { run: r2 } = M.startRun(s, { kind: 'mock', now: 2 });
  const used = new Set([...r1.items, ...r2.items].map(i => i.cardId).filter(Boolean));
  const third = BP.buildPlan(s, { kind: 'mock', index: 3 });
  for (const p of third.items) {
    if (!p.cardId) continue;
    assert.ok(!used.has(p.cardId), `${p.cardId} came back on the very next Mock`);
  }
  // the gap yields rather than leaving a slot empty: with only 3 candidates the pool cannot always avoid reuse
  assert.equal(third.items.length, 20);
});

/* ==================================================================== 2. building and grading items */

test('blueprint: every plan item builds, and a perfect student scores 100 on it', () => {
  const s = save0();
  for (let i = 1; i <= 4; i++) {
    const plan = BP.buildPlan(s, { kind: 'mock', index: i });
    for (const p of plan.items) {
      const built = BP.itemFor(p, generate);
      assert.ok(built && built.parts.length, `${p.slotId}: no item built`);
      for (const part of built.parts) {
        const raw = correctRaw(built.raw, part);
        assert.notEqual(raw, undefined, `${p.slotId}/${part.id}: no builder for ${part.type}`);
        const res = MODS.G.grade(part, raw, {
          card: built.raw, state: {}, mock: true, strictGCF: true, seed: String(p.seed ?? p.cardId ?? ''),
          figure: built.raw.figure ?? undefined, model: M.modelFor(built.raw, MODS),
        });
        assert.equal(res.kind, 'correct', `${p.slotId}/${part.id} (${part.type}) → ${res.kind}: ${res.msg}`);
      }
    }
  }
});

test('score: a perfect paper is 100 / 100, a blank one 0, and partial credit lands between', () => {
  const perfect = takeRun(save0(), { how: allCorrect });
  assert.equal(perfect.run.score, 100);
  assert.equal(perfect.run.points, 100);
  assert.equal(perfect.run.pointsMax, 100);
  assert.equal(perfect.run.accuracy, 1);
  assert.equal(perfect.run.acc, 1);          // trophies.js spelling
  assert.equal(perfect.run.scorePct, 100);   // trophies.js fallback
  assert.equal(perfect.run.scoreMax, 100);   // readiness.js

  const blank = takeRun(save0(), { how: allBlank });
  assert.equal(blank.run.score, 0);
  assert.equal(blank.run.items.every(i => i.credit === 0), true);
  assert.equal(blank.run.items.every(i => i.parts.every(p => p.kind === 'blank')), true);

  const half = takeRun(save0(), { how: (item, part, built) => (item.n % 2 ? correctRaw(built.raw, part) : undefined) });
  assert.ok(half.run.score > 0 && half.run.score < 100, `half a paper scored ${half.run.score}`);
});

test('score: a Baseline is 10 items scored out of 100 with the same 5-point arithmetic', () => {
  const { run } = takeRun(save0(), { kind: 'baseline', how: allCorrect });
  assert.equal(run.n, 10);
  assert.equal(run.pointsMax, 50);
  assert.equal(run.score, 100);
  assert.equal(run.scoreMax, 100);
  assert.equal(run.limitMs, 20 * 60 * 1000);
});

test('S3 / S7: section D\'s equation slot carries 40 % of its item\'s credit under ctx.mock', () => {
  const s = save0();
  const { n, run } = M.startRun(s, { kind: 'mock', now: 1 });
  // answer ONLY the setup on every item that has one
  fill(run, (item, part, built) => (part.type === 'equation' ? correctRaw(built.raw, part) : undefined));
  const done = M.submitRun(s, n, { M: MODS, now: 2 });
  const withSetup = done.items.filter(i => i.parts.some(p => p.type === 'equation'));
  assert.ok(withSetup.length >= 3, 'a Mock always carries several setups');
  for (const item of withSetup) {
    assert.ok(Math.abs(item.credit - 0.4) < 1e-9, `${item.slotId}: setup-only credit ${item.credit}, want 0.4`);
    assert.equal(item.parts.find(p => p.type === 'equation').share, 0.4);
  }
});

/* ==================================================================== 3. XP once per seed */

test('XP: a Mock pays 150 + round(300·acc²) once per seed; a second run of the same seed pays nothing', () => {
  const s = save0();
  const first = takeRun(s, { how: allCorrect });
  assert.equal(first.run.xp, M.XP_SUBMIT + 300, 'a perfect first Mock: 150 + 300 · 1²');
  assert.equal(s.xp, first.run.xp);

  // a second run on the SAME seed (forced) pays nothing — S4 "Mock/Boss XP granted once per seed"
  const { n } = M.startRun(s, { kind: 'mock', seed: first.run.seed, now: Date.now() });
  fill(s.runs[n], allCorrect);
  const again = M.submitRun(s, n, { M: MODS, now: Date.now() + 1000 });
  assert.equal(again.xp, 0);
  assert.match(again.xpInfo.reason, /already paid/i);
  assert.equal(s.xp, first.run.xp, 'the save\'s XP did not move');
});

test('XP: RETRY SAME SEED replays the exact paper, pays no XP and is never PB-eligible', () => {
  const s = save0();
  const first = takeRun(s, { how: allCorrect });
  const { n, run } = M.startRun(s, { kind: 'mock', replayOf: first.n, now: Date.now() });
  assert.equal(run.retry, true);
  assert.equal(run.seed, first.run.seed);
  assert.deepEqual(run.items.map(i => i.cardId ?? i.seed), first.run.items.map(i => i.cardId ?? i.seed), 'the same 20 questions');
  fill(run, allCorrect);
  const done = M.submitRun(s, n, { M: MODS, now: Date.now() + 1000 });
  assert.equal(done.xp, 0);
  assert.match(done.xpInfo.reason, /retry/i);
  assert.equal(done.xpInfo.pb, 0);
});

test('XP: beating a previous Mock pays the +200 personal best; the first one never does', () => {
  const s = save0();
  const weak = takeRun(s, { how: (item, part, built) => (item.n <= 4 ? correctRaw(built.raw, part) : undefined) });
  assert.equal(weak.run.xpInfo.pbBeaten, false, 'there was nothing to beat');
  const strong = takeRun(s, { how: allCorrect });
  assert.equal(strong.run.xpInfo.pbBeaten, true);
  assert.equal(strong.run.xpInfo.pb, M.XP_PB);
  assert.equal(strong.run.xp, M.XP_SUBMIT + 300 + M.XP_PB);
});

/* ==================================================================== 4. submit is idempotent */

test('submit: idempotent — a second submit returns the same run and never re-pays XP or re-schedules', () => {
  const s = save0();
  const { n } = M.startRun(s, { kind: 'mock', now: 1 });
  fill(s.runs[n], allCorrect);
  const a = M.submitRun(s, n, { M: MODS, now: 2 });
  const xpAfterFirst = s.xp;
  const errorsAfterFirst = s.errors.length;
  const b = M.submitRun(s, n, { M: MODS, now: 999 });
  assert.equal(b, a, 'the same record comes back');
  assert.equal(b.submittedAt, 2, 'the submit time did not move');
  assert.equal(s.xp, xpAfterFirst);
  assert.equal(s.errors.length, errorsAfterFirst);
  assert.equal(s.runs.filter(r => M.isMockRun(r)).length, 1);
});

test('submit: the answers are folded into `raw` and the open-run scratch pad is dropped', () => {
  const s = save0();
  const { n, run } = M.startRun(s, { kind: 'mock', now: 1 });
  fill(run, allCorrect);
  run.items[0].work = 'x = 3 …';
  assert.ok(Object.keys(run.items[0].answers).length > 0, 'an open run carries answers');
  const done = M.submitRun(s, n, { M: MODS, now: 2 });
  assert.equal(done.status, 'done');
  for (const item of done.items) {
    assert.equal(item.answers, undefined, 'the open-run answer blob is gone after grading');
    assert.ok(item.raw && typeof item.raw === 'object', 'every item keeps its raw answers');
  }
  assert.equal(done.items[0].work, 'x = 3 …', 'the scratch survives for the report');
});

test('auto-submit at 0:00 grades what is on the paper', () => {
  const s = save0();
  const t0 = Date.parse('2026-09-17T09:00:00');
  const { n, run } = M.startRun(s, { kind: 'mock', now: t0 });
  fill(run, (item, part, built) => (item.n <= 5 ? correctRaw(built.raw, part) : undefined));
  const atZero = t0 + run.limitMs;
  assert.equal(M.expired(run, atZero), true);
  assert.equal(M.expired(run, atZero - 1), false);
  const done = M.submitRun(s, n, { M: MODS, now: atZero, auto: true });
  assert.equal(done.auto, true);
  assert.equal(done.items.filter(i => i.credit >= 1).length, 5);
  assert.equal(done.score, 25);
});

/* ==================================================================== 5. resume after a tab kill */

test('resume: the timer is wall-clock, so a killed tab comes back with the TRUE remaining time', () => {
  const s = save0();
  const t0 = Date.parse('2026-09-17T09:00:00');
  const { n, run } = M.startRun(s, { kind: 'mock', now: t0 });
  assert.equal(M.remainingMs(run, t0), 40 * 60 * 1000);
  assert.equal(M.fmtClock(M.remainingMs(run, t0)), '40:00');

  // …answer five, close the tab for twelve minutes, reopen
  fill(run, (item, part, built) => (item.n <= 5 ? correctRaw(built.raw, part) : undefined));
  const back = t0 + 12 * 60 * 1000;
  assert.equal(M.remainingMs(run, back), 28 * 60 * 1000);
  assert.equal(M.fmtClock(M.remainingMs(run, back)), '28:00');

  // the save round-trips through the store's own disk path with the open run and its answers intact
  const disk = JSON.parse(JSON.stringify(pack(applyCaps(s))));
  const back2 = unpack(migrate(disk));
  const open = M.openRun(back2);
  assert.ok(open, 'the open run survives a reload');
  assert.equal(open.n, n);
  assert.equal(open.run.status, 'open');
  assert.equal(M.remainingMs(open.run, back), 28 * 60 * 1000);
  assert.equal(M.runStatus(open.run).answered, 5);
  assert.equal(M.runStatus(open.run).unanswered, 15);
  assert.equal(open.run.items[0].answers !== undefined, true, 'the typed answers came back');

  // a tab killed past 0:00 resumes EXPIRED and is graded as it stood
  assert.equal(M.expired(open.run, t0 + 41 * 60 * 1000), true);
  const done = M.submitRun(back2, n, { M: MODS, now: t0 + 41 * 60 * 1000, auto: true });
  assert.equal(done.score, 25);
});

test('resume: flags, the viewed index and the scratch all persist; runStatus counts them for the confirm dialog', () => {
  const s = save0();
  const { n, run } = M.startRun(s, { kind: 'mock', now: 1 });
  run.items[3].flagged = true;
  run.items[7].flagged = true;
  run.idx = 7;
  M.setItemAnswer(run.items[0], run.items[0].partIds?.[0] ?? 'mc', { raw: 'something' });
  const back = unpack(migrate(JSON.parse(JSON.stringify(pack(applyCaps(s))))));
  const open = M.openRun(back);
  assert.equal(open.run.idx, 7);
  const st = M.runStatus(open.run);
  assert.equal(st.flagged, 2);
  assert.equal(st.answered, 1);
  assert.equal(st.unanswered, 19);
  assert.equal(st.total, 20);
});

test('resume: only the newest OPEN Mock-like run is offered, and a finished one is never resumed', () => {
  const s = save0();
  const first = takeRun(s, { how: allCorrect });
  assert.equal(M.openRun(s), null, 'nothing open after a submit');
  const { n } = M.startRun(s, { kind: 'baseline', now: Date.now() });
  assert.equal(M.openRun(s).n, n);
  assert.equal(M.runKind(M.openRun(s).run), 'baseline');
  assert.ok(first.run.status === 'done');
});

/* ==================================================================== 6. misses */

test('every miss lands in Leitner bucket 0 with an error entry, and its due date is clamped before the test', () => {
  const s = save0();
  s.settings.testDate = addDays(todayISO(), 3);
  s.settings.testTime = '08:00';
  // pre-clear every card so the buckets have somewhere to fall from
  for (const c of cards) s.cards[c.id] = { attempts: 1, cleared: true, rarity: 'gold', bucket: 4, lastAt: Date.now(), due: Date.now() + 7 * 864e5, history: [{ at: 1, ok: true }], lastFirstTry: true };
  const { n, run } = M.startRun(s, { kind: 'mock', now: Date.now() });
  fill(run, allBlank);
  const done = M.submitRun(s, n, { M: MODS, now: Date.now() });
  const missedCards = done.items.filter(i => i.cardId);
  assert.ok(missedCards.length >= 10);
  for (const item of missedCards) {
    const rec = s.cards[item.cardId];
    assert.ok(rec.bucket <= 2, `${item.cardId}: bucket ${rec.bucket} after a Mock miss`);
    assert.ok(rec.due <= Date.parse(`${s.settings.testDate}T08:00:00`), `${item.cardId}: due after the test`);
    assert.ok(s.errors.some(e => e.item === item.cardId && e.cleared !== true), `${item.cardId}: no error entry`);
  }
});

test('a Mastered skill that misses a Mock drops straight to 69; an unmastered one takes the normal EMA to 0', () => {
  const s = save0();
  const t = Date.now();
  // CS-LIN mastered, CS-RATIO merely strong
  s.skills['CS-LIN'] = { m: 92, n: 8, lastAt: t - 20 * 3600e3, lastDueCorrectAt: t - 20 * 3600e3, placedAt: null };
  s.skills['CS-RATIO'] = { m: 80, n: 8, lastAt: t - 20 * 3600e3, lastDueCorrectAt: null, placedAt: null };
  assert.equal(isMastered(s.skills['CS-LIN']), true);
  assert.equal(isMastered(s.skills['CS-RATIO']), false);

  const { n, run } = M.startRun(s, { kind: 'mock', now: t });
  fill(run, allBlank);
  M.submitRun(s, n, { M: MODS, now: t });
  assert.equal(s.skills['CS-LIN'].m, M.MOCK_MISS_M, 'the Mock is the source of truth: Mastered → 69');
  assert.ok(s.skills['CS-RATIO'].m < 80 && s.skills['CS-RATIO'].m > 0, `EMA toward 0, got ${s.skills['CS-RATIO'].m}`);
});

test('a clean Mock touches no Leitner bucket and logs no error', () => {
  const s = save0();
  const before = JSON.stringify(s.cards);
  takeRun(s, { how: allCorrect });
  assert.equal(s.errors.length, 0);
  assert.equal(JSON.stringify(s.cards), before, 'nothing was rescheduled by a perfect paper');
});

/* ==================================================================== 7. Readiness */

test('the Baseline switches Readiness from the provisional formula to the full one (S4 / S8 #13)', () => {
  const s = save0();
  // give the student some mastery + coverage so the two formulas differ visibly
  for (const id of ['VOC', 'NOTE', 'CS-LIN', 'PAIRS', 'FAC2']) s.skills[id] = { m: 80, n: 5, lastAt: Date.now(), lastDueCorrectAt: null, placedAt: null };
  for (const c of cards.slice(0, 40)) s.cards[c.id] = { cleared: true, history: [{ at: 1, ok: true }] };

  const before = readiness(s);
  assert.equal(before.provisional, true, 'no Mock yet ⇒ provisional');
  assert.equal(before.A, null);
  assert.match(before.label, /provisional/i);
  assert.equal(accuracyTerm(s), null);

  const { run } = takeRun(s, { kind: 'baseline', how: allCorrect });
  assert.equal(run.status, 'done');

  const after = readiness(s);
  assert.equal(after.provisional, false, 'the Baseline locks the formula');
  assert.equal(after.A, MINI_MOCK_FACTOR, 'a perfect mini-mock scores A = 0.8 (S4 ×0.8)');
  assert.equal(accuracyTerm(s), MINI_MOCK_FACTOR);
  assert.equal(after.r, Math.round(100 * (0.5 * after.M + 0.3 * after.A + 0.2 * after.C)));
  assert.notEqual(after.r, before.r, 'the number moves when the formula changes — the label said it would');
});

test('a full Mock scores A at face value (no ×0.8) and is what Readiness reads next', () => {
  const s = save0();
  takeRun(s, { kind: 'baseline', how: allCorrect });
  assert.equal(accuracyTerm(s), MINI_MOCK_FACTOR);
  takeRun(s, { kind: 'mock', how: (item, part, built) => (item.n <= 10 ? correctRaw(built.raw, part) : undefined) });
  assert.equal(accuracyTerm(s), 0.5, 'the LATEST Mock is the A term, at face value');
  assert.equal(readiness(s).provisional, false);
});

test('the run record carries everything Readiness, Stats and the trophies read', () => {
  const s = save0();
  const { run } = takeRun(s, { how: allCorrect, pred: 88 });
  assert.equal(run.status, 'done');
  assert.equal(run.kind, 'mock');
  assert.equal(run.no, 1);
  assert.equal(run.pred, 88);
  assert.ok(Number.isFinite(run.startedAt) && Number.isFinite(run.submittedAt));
  assert.ok(Array.isArray(run.items) && run.items.length === 20);
  for (const item of run.items) {
    assert.ok(Number.isFinite(item.credit));
    assert.ok(Array.isArray(item.skills));
    assert.ok(Array.isArray(item.parts));
  }
  assert.equal(s.daily[todayISO()].mockDone, true, 'the S4 daily-goal flag');
});

/* ==================================================================== 8. the report */

test('report: the calibration line is S7\'s exact sentence', () => {
  assert.equal(M.calibration({ pred: 88, score: 81 }).text, 'predicted 88 → scored 81 (overconfident by 7)');
  assert.equal(M.calibration({ pred: 60, score: 72 }).text, 'predicted 60 → scored 72 (underconfident by 12)');
  assert.equal(M.calibration({ pred: 75, score: 75 }).text, 'predicted 75 → scored 75 (dead on)');
  assert.equal(M.calibration({ score: 75 }), null, 'no prediction ⇒ no line');
});

test('report: the per-skill table sums to the paper, worst skill first', () => {
  const s = save0();
  const { run } = takeRun(s, { how: (item, part, built) => (item.n % 2 ? correctRaw(built.raw, part) : undefined) });
  const rows = M.perSkill(run);
  assert.ok(rows.length >= 8, `${rows.length} skills on the table`);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].pct <= rows[i].pct, 'worst first');
  const items = rows.reduce((n, r) => n + r.items, 0);
  assert.ok(items >= run.items.length, 'every item is counted at least once (multi-skill items count twice)');
  for (const r of rows) assert.ok(r.pct >= 0 && r.pct <= 100);
});

test('report: "Drill what I missed" is sorted by w × (1 − m/100)', () => {
  const s = save0();
  s.skills['CS-LIN'] = { m: 90, n: 5, lastAt: Date.now(), lastDueCorrectAt: null, placedAt: null };  // w 9 → 0.9
  s.skills['VOC'] = { m: 10, n: 5, lastAt: Date.now(), lastDueCorrectAt: null, placedAt: null };     // w 7 → 6.3
  const { run } = takeRun(s, { how: allBlank });
  const rows = M.missRows(s, run);
  assert.ok(rows.length > 1);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].score >= rows[i].score, 'sorted by w × (1 − m/100)');
  const voc = rows.find(r => r.id === 'VOC');
  const lin = rows.find(r => r.id === 'CS-LIN');
  if (voc && lin) assert.ok(rows.indexOf(voc) < rows.indexOf(lin), 'the weaker, heavier skill is drilled first');
});

test('report: findRun accepts the runs index, the Mock ordinal and falls back to the newest', () => {
  const s = save0();
  const a = takeRun(s, { how: allCorrect });
  const b = takeRun(s, { how: allBlank });
  assert.equal(R.findRun(s, a.n).n, a.n);
  assert.equal(R.findRun(s, String(b.n)).n, b.n);
  assert.equal(R.findRun(s, 'nonsense').n, b.n, 'a bad :n falls back to the newest finished Mock');
  assert.equal(R.findRun(save0(), 0), null, 'no Mocks ⇒ no report');
  assert.equal(R.findRun(s, b.n).run.no, 2);
});

test('report: the source line names the packet card or the template it came from', () => {
  const card = R.sourceLine({ source: 'card', cardId: 'wp-11' });
  assert.match(card.text, /^This was WP/);
  assert.equal(card.href, '#/card/wp-11');
  const variant = R.sourceLine({ source: 'variant', template: 'T-cs-lin', seed: 'mock#1|D1', forCard: 'wp-07' });
  assert.equal(variant.text, 'This was WP-07 with new numbers.');
  assert.match(variant.href, /^#\/variant\/T-cs-lin\?seed=/);
  assert.equal(R.bandOf(81).label, 'Ready');
  assert.equal(R.bandOf(49).label, 'Not ready');
  assert.equal(R.bandOf(90).label, 'Locked in');
});

/* ==================================================================== 9. housekeeping */

test('the save stays inside its caps with three Mocks on it', () => {
  const s = save0();
  takeRun(s, { how: allCorrect });
  takeRun(s, { how: allBlank });
  takeRun(s, { how: allCorrect });
  applyCaps(s);
  const bytes = JSON.stringify(pack(s)).length;
  assert.ok(bytes < 250_000, `a save with three Mocks is ${bytes} bytes (cap 250 KB)`);
  assert.equal(s.runs.length, 3);
});

test('no Math.random and no DOM reached by the Mock modules (they import under node:test)', async () => {
  const { readFileSync } = await import('node:fs');
  for (const f of ['site/data/blueprint.js', 'site/js/screens/mock.js', 'site/js/screens/report.js']) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.equal(/Math\.random/.test(src), false, `${f}: Math.random`);
  }
  assert.equal(typeof M.buildPlanIsUndefined, 'undefined');
});

/* === mock r1 (visual QA fixer, round 1) === */
test('r1: the Mock clock turns amber for the last 60 s and pulses for the last 10 s (S5 Motion, S9 #6)', () => {
  // Was 5 min / 1 min — a red pulsing clock for a whole minute of a 40-minute paper contradicts
  // "nothing rushes thinking". S9 #6: "last 60 s --warn, last 10 s --bad with a 1 Hz opacity pulse".
  assert.equal(M.AMBER_MS, 60_000);
  assert.equal(M.PULSE_MS, 10_000);
  assert.ok(M.PULSE_MS < M.AMBER_MS);
});

test('r1: the Mock has no N / P letter shortcuts (N is the ASN widget\'s "Never") — arrows navigate', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../site/js/screens/mock.js', import.meta.url), 'utf8');
  const onKey = src.slice(src.indexOf('function onKey('), src.indexOf('/* ---------------- submit'));
  assert.ok(onKey.includes("'ArrowRight'") && onKey.includes("'ArrowLeft'"), 'arrow keys still navigate');
  assert.equal(/toLowerCase\(\) === '[np]'/.test(onKey), false, 'no n / p letter shortcuts in the Mock');
});

test('r1: the report never labels an answer with a raw part id', () => {
  for (const t of ['cloze', 'mc', 'build', 'pairs', 'cls', 'asn', 'equation', 'roots', 'reject', 'cases', 'explain', 'strip', 'factored', 'multi', 'num'])
    assert.equal(typeof R.PART_LABEL[t], 'string', `PART_LABEL.${t}`);
  assert.equal(typeof R.PART_LABEL.default, 'string');
  for (const [k, v] of Object.entries(R.PART_LABEL)) assert.notEqual(v.toLowerCase(), k, `label for ${k} is not the id`);
});

test('r1: an open Mock renders its own resume card first (no section table, no predict slider)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../site/js/screens/mock.js', import.meta.url), 'utf8');
  const rules = src.slice(src.indexOf('function renderRules('), src.indexOf('function predWord('));
  const resumeAt = rules.indexOf('if (stale || resumable)');
  const secsAt = rules.indexOf("h('ul.mock-secs')");
  assert.ok(resumeAt > 0 && secsAt > resumeAt, 'the resume / expired branch returns before the section table is built');
  assert.ok(rules.includes('· in progress'), 'the open run keeps ITS ordinal in the heading');
});

/* ================================================================================================
   S3 — THE RANK RATCHET, the Mock's third of it (REPAIR-DECISION §S3.1(b), §S3.4 item 4).

   `mock.applyMockCall` is one of the three writers of `save.player.rank` (`state.applyTarget` and
   `state.endJob` are the other two). All three used to hand `call.ratingDetail` no floor, so the
   rank was recomputed from the window every time — and a student who masters their makes empties
   the informative window, so improving DEMOTED them: measured 9.536 / Called 5 at q̂ 0.90 down to
   5.000 / Called 2 at q̂ 0.95. Rank gates the 95 rung and the guard multiplier, which are tools, and
   this layer never removes a tool you own. The floor is `ratingDetail`'s `{rank}` option.

   The case below is the one the shared finding's own fix (`held = !measured`) does NOT cover: the
   window is MEASURED (n = 1, one bad Mock call) and the floor still binds. Measured here:
   rating 4.376, bare `rankFor` 1, held rank 5, `held === true`.

   NEGATIVE CONTROL (run before the fix, with `mock.js:562`'s third argument removed):
     AssertionError: a Mock DEMOTED the student: 5 → 1
       actual 1, expected 5      — tests/mock.test.mjs, this test
   ================================================================================================ */

const CALL = await import('../site/js/job/call.js');
const { CAPS: JOB_CAPS_T } = await import('../site/data/job.js');

/** A rating window of `CAPS.calls` NON-informative slots — where a genuinely mastered player lives. */
function blankWindow(now) {
  return Array.from({ length: JOB_CAPS_T.calls }, (_, i) =>
    CALL.callEntry({ p: 0.85, ok: true, w: 0, skill: null, at: now - (JOB_CAPS_T.calls - i) * 60_000 }));
}

/** A paper `mockCallEligible` accepts: 20 items, all attempted, sat for 25 minutes. */
function satPaper({ pred, score, at, seed = 's3-1', of = 20 }) {
  return {
    kind: 'mock', status: 'done', n: of, seed, retry: false, pred, score,
    items: Array.from({ length: of }, (_, i) => ({ n: i + 1, credit: 0, parts: [{ id: 'a', type: 'text', credit: 0, kind: 'wrong', ok: false }] })),
    startedAt: at - 25 * 60_000, submittedAt: at,
  };
}

/**
 * The PRIOR sittings a paper's weight is read from (verify r1, `mock.mockPriorMean`). Two papers at
 * 60 and 80 put ŝ at 0.70, comfortably inside `INFORMATIVE_BAND`, so the paper under test is weighed
 * at `MOCK_CALL_W`. Without them ŝ is null, the call is unweighed and it moves no rating at all —
 * which is the point of the repair, and is pinned in tests/job-week.test.mjs.
 */
function priorSittings(at) {
  return [60, 80].map((score, i) => satPaper({ pred: score, score, at: at - (2 - i) * 86_400_000, seed: `s3-hist-${i}` }));
}

test('S3: a Mock never demotes the rank — the held rank is ratingDetail\'s FLOOR, and it binds on a MEASURED window', () => {
  const now = Date.parse('2026-09-17T09:00:00');
  const s = save0();
  s.runs = priorSittings(now);
  s.player.rating = { calls: blankWindow(now), value: 5, n: 0 };
  s.player.rank = 5;                                     // what state.endJob left on the save

  const bare = CALL.ratingDetail(s.player.rating.calls, JOB_CAPS_T.calls);
  assert.equal(bare.n, 0, 'the window starts with no measurement in it');
  assert.equal(bare.rank, 2, 'and the bare recomputation of an empty window is Called 2');

  const r = M.applyMockCall(s, satPaper({ pred: 10, score: 90, at: now }), { now });
  assert.ok(r, 'the paper was eligible and scored a call');

  // the RATING falls, and it is allowed to: it is a measurement of calibration, not a ladder
  assert.ok(s.player.rating.value < 5, `the rating fell to ${s.player.rating.value}`);
  assert.equal(s.player.rating.n, 1, 'and the window is now MEASURED — this is not the n = 0 corner');
  assert.equal(CALL.rankFor(s.player.rating.value), 1, 'the bare recomputation would print Called 1');

  // the RANK does not fall
  assert.equal(s.player.rank, 5, `a Mock DEMOTED the student: 5 → ${s.player.rank}`);
  assert.equal(r.rank, 5, 'and the record it hands back says the same');
  const held = CALL.ratingDetail(s.player.rating.calls, JOB_CAPS_T.calls, { rank: 5 });
  assert.equal(held.held, true, 'a binding floor reports `held` — measured or not (S3.3)');
  assert.equal(held.measured, true, 'which is exactly the case `held = !measured` does not reach');

  // it is a FLOOR, not a freeze: a Mock may still RAISE the rank
  const up = save0();
  up.runs = priorSittings(now);
  up.player.rating = { calls: [], value: 5, n: 0 };
  up.player.rank = 1;
  const r2 = M.applyMockCall(up, satPaper({ pred: 88, score: 88, at: now, seed: 's3-2' }), { now });
  assert.ok(r2, 'the second paper scored too');
  assert.ok(up.player.rank >= 2, `a perfect forecast could not lift rank 1 (${up.player.rank})`);
  assert.equal(up.player.rank, CALL.rankFor(up.player.rating.value), 'a non-binding floor is transparent');
});

/* ================================================================================================
   VERIFY r1 — THE WEIGHT, through the WHOLE shipped path (startRun → fill → submitRun), not through
   `applyMockCall` on a hand-built fixture. `tests/job-week.test.mjs` pins the law and the bound; this
   pins the WIRING: that `submitRun` hands the save to `mockPriorMean`, and that a history of papers
   the student threw weighs the next forecast at exactly nothing.
   ================================================================================================ */
test('verify r1: three thrown papers through submitRun move the rating by nothing, and the fourth is still unweighed', () => {
  const t0 = Date.parse('2026-09-17T09:00:00');
  const DAY = 86_400_000;
  const s = save0();
  const rank0 = s.player.rank;
  const wrong = () => 'nope';                 // every box filled, every box wrong: the effort gate PASSES

  for (let d = 0; d < 4; d++) {
    const { run } = takeRun(s, { how: wrong, pred: 0, now: t0 + d * DAY });
    assert.equal(run.status, 'done');
    assert.equal(run.score, 0, `paper ${d + 1} scored ${run.score} — this arm needs a thrown paper`);
    assert.ok(run.call, `paper ${d + 1} earned no call at all — this arm is about the WEIGHT, not the gate`);
    assert.equal(run.call.w, 0, `paper ${d + 1} was WEIGHED (w = ${run.call.w})`);
    assert.equal(run.call.credit, 10, 'the forecast was exact and the credit says so — it just bought nothing');
    assert.equal(run.call.p, null, 'so the slot it took is a blank one');
  }
  assert.equal(M.mockPriorMean(s, { submittedAt: t0 + 9 * DAY }), 0, 'ŝ after four thrown papers is 0');
  assert.equal(M.mockCallWeight(M.mockPriorMean(s, { submittedAt: t0 + 9 * DAY })), 0, 'and 0 weighs nothing');
  assert.equal(s.player.rating.n, 0, 'not one measurement in the window');
  assert.equal(s.player.rating.value, 5, 'the rating never left 5.000');
  assert.equal(s.player.rank, rank0, `and the rank never left Called ${rank0}`);
});

test('verify r1: a real history weighs the next paper at MOCK_CALL_W, through the same path', () => {
  const t0 = Date.parse('2026-09-17T09:00:00');
  const DAY = 86_400_000;
  const s = save0();
  /* every other ITEM answered correctly and the rest answered wrong — a 50 that is real work, and a
     fresh counter per paper so both sittings score the same 50 */
  const half = () => {
    const seen = new Map();
    return (item, part, built) => {
      if (!seen.has(item)) seen.set(item, seen.size);
      return seen.get(item) % 2 === 0 ? correctRaw(built.raw, part) : 'nope';
    };
  };

  const first = takeRun(s, { how: half(), pred: 50, now: t0 }).run;
  assert.equal(first.score, 50, 'half the paper right is a score inside the informative band');
  assert.equal(first.call.w, 0, 'and the FIRST paper is still unweighed — nothing came before it');
  assert.equal(s.player.rating.value, 5, 'so it moved the rating by nothing');

  const sHat = M.mockPriorMean(s, { submittedAt: t0 + DAY });
  assert.equal(sHat, 0.5, 'ŝ is now the 50 that paper scored');
  const second = takeRun(s, { how: half(), pred: 50, now: t0 + DAY }).run;
  assert.equal(second.score, 50);
  assert.equal(second.call.w, M.MOCK_CALL_W, 'and THIS one is weighed, by the paper that came before it');
  assert.equal(second.call.credit, 10, 'an exact forecast still earns the credit ceiling');
  assert.equal(s.player.rating.n, 1, 'one measurement in the window');
  assert.equal(s.player.rating.value, 5 + (2 * M.MOCK_CALL_SLOT_MAX) / 50, 'worth exactly one capped slot: 5.10');
});

test('verify r1: the top of the band is closed too — a student who always scores 100 is not forecasting', () => {
  const t0 = Date.parse('2026-09-17T09:00:00');
  const DAY = 86_400_000;
  const s = save0();
  takeRun(s, { how: allCorrect, pred: 100, now: t0 });
  const second = takeRun(s, { how: allCorrect, pred: 100, now: t0 + DAY }).run;
  assert.equal(second.score, 100);
  assert.equal(M.mockPriorMean(s, { submittedAt: t0 + 2 * DAY }), 1, 'ŝ = 1.00');
  assert.equal(second.call.w, 0, 'ŝ = 1 is outside INFORMATIVE_BAND — the same law that retires a mastered make');
  assert.equal(s.player.rating.value, 5, 'so a perfect run of papers cannot farm the rating either');
});

test('S3: every call.ratingDetail in screens/mock.js passes the rank floor (the grep pin §S3.4 item 4)', async () => {
  const { readFileSync } = await import('node:fs');
  const { stripCommentsAndStrings } = await import('./_helpers.mjs');
  const src = stripCommentsAndStrings(readFileSync(new URL('../site/js/screens/mock.js', import.meta.url), 'utf8'));
  const calls = [...src.matchAll(/ratingDetail\(((?:[^()]|\([^()]*\))*)\)/g)];
  assert.ok(calls.length >= 1, 'screens/mock.js no longer calls ratingDetail — this pin has gone stale');
  for (const c of calls) {
    assert.match(c[1], /\brank:\s*\S/, `a ratingDetail call in mock.js omits the rank floor: ratingDetail(${c[1]})`);
  }
});
