// tests/job-state.test.mjs — J5c: THE JOB's state machine.
//
// The acceptance list of the ticket, in order. Each of the eight LAWS is shown to be STRUCTURALLY
// unreachable — a mechanism refuses it — rather than merely unused by the happy path:
//   • Law of Two Ledgers: no write from js/job/* reaches xp, skills, cards[*].bucket|rarity|foil,
//     errors or forecastLog; Ledger A is written by the existing grade path and nowhere else
//   • answers tick, time does not: no payoff term reads elapsed time (a whole job at ms × 10 settles
//     byte-identically), and the two accumulators are not payoff terms
//   • LOOSE floors at 0; BAGGED is only ever added to
//   • the sealed envelope: the stem is not addressable before the call is locked
//   • CALL IT: gated at LOOSE 0 ∧ chain 0 ∧ ≥ 3 left; ends the stakes, records posted 0, hints on
//   • any exit that is not a bag auto-banks LOOSE at 50 %, so quitting is never better than banking
//   • mid-job reload restores the record exactly, seed PINNED (no re-roll of guard / bundles / ×2)
//   • COMPOSED global rule 4: nothing auto-advances on a correct answer
//   • items are marked through the EXISTING markItem / requeueReview / finishPage
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import * as state from '../site/js/job/state.js';
import {
  LEDGER_A_KEYS, STATE_KEYS, EXTRA_KEYS, OUTCOMES, PHASES, TERMINAL_PHASE,
  LedgerError, JobStateError, guardSave, serialize, deserialize, freshState,
  startJob, beginTargets, beginAnswer, lockCall, applyTarget, bag, push, brief,
  crack, walk, walkPrompt, callIt, canCallIt, backcheck, canBackcheck, mintBackcheck,
  commitBind, commitDue, commitFire, quietClose, endJob, debriefOf, resume, writeGame,
  envelopeFor, stemRefFor, pricedTarget, rungOf, hintsOn, tick, press,
  queueOf, idxOf, targetsLeft, answered, currentItem, isVaultTarget, callsAvailable, bagPrompt,
} from '../site/js/job/state.js';
import { IN_PROGRESS_KEYS, CAPS, BOARD, BACKCHECK, AUTO_BAG, COMPLETION, FEE, WING_IDS, RUNGS, MISS_RUNG, STATES } from '../site/data/job.js';
import { buildJob, postBoard, jobQueueOf, x2Marks } from '../site/js/job/board.js';
import { drawGuard } from '../site/js/job/guard.js';
import { bagBank, autoBank, chainAfterTarget, round as eRound } from '../site/js/job/econ.js';
import { comboTransition, nextCombo } from '../site/js/xp.js';
import { fresh } from '../site/js/store.js';
import { applyOutcome, DAY_MS, HOUR_MS } from '../site/js/schedule.js';
import { rngFrom } from '../site/js/rng.js';
import { todayISO, addDays } from '../site/js/days.js';
import { cards as ALL_CARDS } from '../site/data/cards.js';
import { isBonus } from '../site/data/source-manifest.js';

const NOW = new Date(2026, 8, 16, 18, 0).getTime();
const TODAY = todayISO(new Date(NOW));
const BANK = ALL_CARDS.filter((c) => !isBonus(c.id));

/* ------------------------------------------------------------------ a seeded corpus (no Math.random) */

/**
 * A save with real Leitner records AND real `history`, so `call.qHatFor` has something to read and
 * the rating window is exercised rather than silently empty.
 */
function seededSave(i) {
  const rng = rngFrom('job-state-corpus', i);
  const s = fresh(NOW - (4 + rng.int(0, 20)) * DAY_MS);
  s.profileId = `state-${i}`;
  s.settings.testDate = addDays(TODAY, 4 + rng.int(0, 12));
  const n = 24 + rng.int(0, 24);
  for (let k = 0; k < n; k++) {
    const c = BANK[rng.int(0, BANK.length - 1)];
    let rec = null;
    for (let r = 0; r < 3; r++) rec = applyOutcome(s, c.id, rng.chance(0.75) ? 'clean' : 'wrong', { now: NOW - (30 - r * 4) * DAY_MS });
    if (!rec) continue;
    rec.cleared = true;
    rec.rarity = 'gold';
    rec.due = NOW + (rng.chance(0.65) ? -rng.float(0, 9) : rng.float(0.2, 12)) * DAY_MS;
    rec.history = Array.from({ length: 10 }, (_, h) => ({
      at: NOW - (20 - h) * DAY_MS, ok: rng.chance(0.75), attempt: rng.chance(0.75) ? 1 : 2, hints: 0, ms: 9000,
    }));
  }
  const SKILLS = ['VOC', 'NOTE', 'CLASS', 'ASN-PLP', 'ASN-ANG', 'PAIRS', 'FIG-ALG', 'BISECT-L', 'BISECT-Q',
    'SEG-ALG', 'CSARITH', 'CS-LIN', 'CS-RATIO', 'CS-QUAD', 'SYS', 'FAC1', 'FAC2', 'QUAD-SOLVE', 'QUAD-CTX'];
  for (const k of SKILLS) {
    if (!rng.chance(0.75)) continue;
    s.skills[k] = { m: rng.int(10, 95), n: rng.int(1, 9), lastAt: NOW - rng.int(1, 20) * DAY_MS, lastDueCorrectAt: rng.chance(0.4) ? NOW - DAY_MS : null };
  }
  return s;
}

const CORPUS = Array.from({ length: 12 }, (_, i) => seededSave(i));
const clone = (x) => structuredClone(x);

const CLEAN = { cleared: true, firstTry: true, hints: 0, attempt: 1, clean: true };
const HINT1 = { cleared: true, firstTry: true, hints: 1, attempt: 1, clean: false };
const ATT2 = { cleared: true, firstTry: false, hints: 0, attempt: 2, clean: false };
const ATT3 = { cleared: true, firstTry: false, hints: 0, attempt: 3, clean: false };
const MISS = { cleared: false, solutionShown: true, reason: 'third-wrong', attempt: 3, hints: 0 };

/**
 * One scripted job. `plan(n)` returns the result for target n (1-based); `bagAt(n)` decides BAG vs
 * PUSH; `scale` multiplies every clock DELTA (the ms × 10 replay), while the job's own pinned start
 * stays put — which is the point: the start is a DATE, the deltas are elapsed time.
 */
function runJob(save, {
  plan = () => CLEAN, bagAt = () => false, call: callOf = () => 70, scale = 1,
  now = NOW, today = TODAY, stopAfter = Infinity, onBeat = null, crackIt = true, opts = {},
} = {}) {
  let t = now;
  const step = (ms) => (t += ms * scale);
  const g0 = startJob(save, { today, now: t, ...opts });
  beginTargets(save, { now: step(6000) });
  let beats = 0;
  let debrief = null;
  for (let guardN = 0; guardN < 400; guardN++) {
    const g = state.stateOf(save);
    if (!g || g.outcome != null) break;
    if (beats >= stopAfter) break;
    if (g.phase === 'envelope') {
      if (g.stakes) lockCall(save, callOf(answered(save) + 1), { now: step(5000) });
      else beginAnswer(save, { now: step(1000) });
      continue;
    }
    if (g.phase === 'answer') {
      const n = answered(save) + 1;
      const r = applyTarget(save, plan(n), { now: step(40000) });
      onBeat?.(r, n, save);
      beats++;
      continue;
    }
    if (g.phase === 'payout' || g.phase === 'bagpush') {
      const n = answered(save);
      if (g.stakes && bagAt(n, save)) bag(save, { now: step(9000) });
      else push(save, { now: step(9000) });
      continue;
    }
    if (g.phase === 'brief') { brief(save, {}, { now: step(20000) }); continue; }
    if (g.phase === 'getaway') {
      if (crackIt) crack(save, { now: step(25000) });
      else { debrief = walk(save, { now: step(25000) }); break; }
      continue;
    }
    break;
  }
  return { g0, at: t, debrief };
}

/* ========================================================================================== */
describe('J5c — the record and its serialiser (J10\'s inProgress.game)', () => {
  test('STATE_KEYS is J10\'s sixteen, then this file\'s seven, and nothing else', () => {
    assert.deepEqual(STATE_KEYS.slice(0, IN_PROGRESS_KEYS.length), [...IN_PROGRESS_KEYS]);
    assert.deepEqual(STATE_KEYS.slice(IN_PROGRESS_KEYS.length), [...EXTRA_KEYS]);
    assert.equal(new Set(STATE_KEYS).size, STATE_KEYS.length);
    for (const k of IN_PROGRESS_KEYS) assert.ok(STATE_KEYS.includes(k), `${k} missing`);
  });

  test('serialize emits exactly STATE_KEYS, in order, JSON-safe', () => {
    const save = clone(CORPUS[0]);
    const g = startJob(save, { today: TODAY, now: NOW });
    assert.deepEqual(Object.keys(g), [...STATE_KEYS]);
    assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(g))), [...STATE_KEYS]);
  });

  test('deserialize is total, idempotent and repairs junk to defaults (J10 open issue #4)', () => {
    for (const junk of [null, undefined, 0, 'x', [], { shape: 'NOPE', loose: -9, chain: 'q', calls: 'x', guard: 5, phase: 'nowhere' }]) {
      const a = deserialize(junk);
      assert.deepEqual(Object.keys(a), [...STATE_KEYS]);
      assert.deepEqual(deserialize(a), a, 'not idempotent');
      assert.ok(a.loose >= 0 && a.chain >= 0);
      assert.ok(PHASES.includes(a.phase));
    }
  });

  test('a record round-trips through JSON byte-identically', () => {
    const save = clone(CORPUS[1]);
    runJob(save, { stopAfter: 3, bagAt: (n) => n === 2 });
    const g = state.stateOf(save);
    const disk = JSON.parse(JSON.stringify(g));
    assert.deepEqual(deserialize(disk), serialize(g));
    assert.equal(JSON.stringify(deserialize(disk)), JSON.stringify(serialize(g)));
  });
});

/* ========================================================================================== */
describe('J5c — mid-job reload, with the job seed PINNED (G3.7 proof 6)', () => {
  test('queue, idx, loose, bagged, chain, calls, tokens, guard, crew and briefs survive the disk', () => {
    const save = clone(CORPUS[2]);
    save.game = { ...(save.game ?? {}), crew: { VOC: 1, NOTE: 1 } };
    runJob(save, { stopAfter: 5, bagAt: (n) => n === 3, plan: (n) => (n === 4 ? MISS : CLEAN) });
    const before = {
      queue: clone(save.inProgress.queue), idx: save.inProgress.idx,
      game: clone(save.inProgress.game), crew: clone(save.game.crew),
    };
    /* the tab is killed and the save comes back off the disk */
    const reloaded = JSON.parse(JSON.stringify(save));
    const g = resume(reloaded);
    assert.ok(g, 'no job resumed');
    assert.deepEqual(reloaded.inProgress.idx, before.idx);
    assert.deepEqual(reloaded.inProgress.queue, before.queue);
    assert.deepEqual(g.loose, before.game.loose);
    assert.deepEqual(g.bagged, before.game.bagged);
    assert.deepEqual(g.chain, before.game.chain);
    assert.deepEqual(g.calls, before.game.calls);
    assert.deepEqual(g.tokens, before.game.tokens);
    assert.deepEqual(g.guard, before.game.guard);
    assert.deepEqual(g.briefs, before.game.briefs);
    assert.deepEqual(reloaded.game.crew, before.crew, 'crew lives on save.game.crew (J10 §5)');
    assert.deepEqual(g, before.game, 'the whole record is byte-identical');
  });

  test('the pinned seed cannot re-roll the guard draw, the bundle partition or the ×2 placement', () => {
    const save = clone(CORPUS[3]);
    const g = startJob(save, { today: TODAY, now: NOW });
    const seed = g.seed;
    const marks = queueOf(save).map((it) => it.x2 === true);
    const locks = g.bundles.map((b) => b.locks.join(','));

    /* re-opening at a DIFFERENT wall clock, from the pinned seed, reproduces every draw */
    const again = buildJob(clone(CORPUS[3]), { today: TODAY, now: NOW + 3 * HOUR_MS, seed });
    assert.equal(again.seed, seed);
    assert.equal(drawGuard(g.guard.dist, seed), g.guard.wing);
    assert.deepEqual(again.bundles.map((b) => b.locks.join(',')), locks);
    assert.deepEqual(jobQueueOf(again).map((it) => it.x2 === true), marks);
    /* and the ×2 vector is a pure function of (day, jobIndex, targets) */
    assert.deepEqual(x2Marks(TODAY, 0, marks.length), marks);
  });

  test('resume() repairs a hand-damaged record instead of handing the screen rubbish', () => {
    const save = clone(CORPUS[4]);
    runJob(save, { stopAfter: 2 });
    save.inProgress.game.loose = 'plenty';
    save.inProgress.game.calls = { nope: true };
    save.inProgress.game.phase = 'atlantis';
    const g = resume(save);
    assert.equal(g.loose, 0);
    assert.deepEqual(g.calls, []);
    assert.ok(PHASES.includes(g.phase));
    assert.deepEqual(Object.keys(g), [...STATE_KEYS]);
  });
});

/* ========================================================================================== */
describe('J5c — LAW: the two ledgers (G1 global law 2, G3.7 proof 11)', () => {
  test('every named Ledger A write throws LedgerError, at every depth', () => {
    const save = clone(CORPUS[0]);
    save.cards['not-01'] ??= { bucket: 1, rarity: 'gold', foilProgress: [], history: [] };
    const s = guardSave(save);
    const denied = [
      () => { s.xp = 9999; },
      () => { s.skills = {}; },
      () => { s.skills.VOC = { m: 100 }; },
      () => { s.cards = {}; },
      () => { s.cards['not-01'].bucket = 5; },
      () => { s.cards['not-01'].rarity = 'platinum'; },
      () => { s.cards['not-01'].foil = true; },
      () => { s.cards['not-01'].foilProgress.push({ day: 'x' }); },
      () => { s.errors = []; },
      () => { s.errors.push({ item: 'x' }); },
      () => { s.forecastLog = []; },
      () => { delete s.xp; },
      () => { Object.defineProperty(s, 'xp', { value: 1 }); },
    ];
    for (const fn of denied) assert.throws(fn, LedgerError, `${fn}`);
    /* Ledger B and the two shared keys are writable — that is the whole point of the split */
    assert.doesNotThrow(() => { s.player = { rank: 3 }; });
    assert.doesNotThrow(() => { s.game = { crew: {} }; });
    assert.doesNotThrow(() => { s.inProgress = null; });
    assert.doesNotThrow(() => { s.counters = { pages: 1 }; });
  });

  test('reads pass through unchanged (the layer PRICES Ledger A, it does not write it)', () => {
    const save = clone(CORPUS[0]);
    const s = guardSave(save);
    assert.equal(s.xp, save.xp);
    assert.equal(Object.keys(s.cards).length, Object.keys(save.cards).length);
    assert.ok(Array.isArray(s.errors));
    assert.equal(s.cards[Object.keys(save.cards)[0]].bucket, save.cards[Object.keys(save.cards)[0]].bucket);
  });

  test('guardSave is idempotent and identity-stable', () => {
    const save = clone(CORPUS[0]);
    const a = guardSave(save);
    assert.equal(guardSave(a), a);
    assert.equal(guardSave(save), a);
    assert.equal(state.unguard(a), save);
  });

  test('a whole job — start to debrief — leaves Ledger A byte-identical', () => {
    const save = clone(CORPUS[5]);
    const before = Object.fromEntries(LEDGER_A_KEYS.map((k) => [k, clone(save[k])]));
    runJob(save, { plan: (n) => (n % 4 === 0 ? MISS : n % 3 === 0 ? ATT2 : CLEAN), bagAt: (n) => n % 3 === 0 });
    for (const k of LEDGER_A_KEYS) assert.deepEqual(save[k], before[k], `${k} moved`);
  });

  test('Ledger B did move — the test above is not vacuous', () => {
    const save = clone(CORPUS[5]);
    runJob(save, { bagAt: (n) => n % 3 === 0 });
    assert.ok(save.game.log.length >= 1);
    assert.ok(save.player.records.bestBag > 0);
    assert.ok(save.game.heat.jobs >= 1);
  });
});

/* ========================================================================================== */
describe('J5c — LAW: answers tick, time does not (G1 global law 1, G3.7 proof 5)', () => {
  const payoffOf = (save) => ({
    log: save.game.log.map((e) => ({ ...e, tGame: 0, tAnswer: 0 })),
    records: clone(save.player.records),
    rating: save.player.rating.value,
    rank: save.player.rank,
    calls: save.player.rating.calls.map((c) => ({ ...c, at: 0 })),
    elo: clone(save.player.elo),
    heat: clone(save.game.heat),
  });

  test('a whole job replayed with every elapsed delta × 10 settles byte-identically', () => {
    const plan = (n) => (n % 5 === 0 ? MISS : n % 4 === 0 ? HINT1 : CLEAN);
    const bagAt = (n) => n % 4 === 0;
    const a = clone(CORPUS[6]); runJob(a, { plan, bagAt, scale: 1 });
    const b = clone(CORPUS[6]); runJob(b, { plan, bagAt, scale: 10 });
    assert.deepEqual(payoffOf(b), payoffOf(a));
  });

  test('the accumulators DID differ — so the test above is not vacuous', () => {
    const plan = () => CLEAN;
    const a = clone(CORPUS[6]); runJob(a, { plan, scale: 1 });
    const b = clone(CORPUS[6]); runJob(b, { plan, scale: 10 });
    assert.ok(b.game.ledger.tAnswer > a.game.ledger.tAnswer * 5, 'tAnswer did not scale');
    assert.ok(b.game.ledger.tGame > a.game.ledger.tGame * 5, 'tGame did not scale');
  });

  test('tGame and tAnswer bank to the right side of the phase split', () => {
    const save = clone(CORPUS[7]);
    startJob(save, { today: TODAY, now: NOW });
    tick(save, 'envelope', NOW + 4000);       // 4 s of `board`  → game
    tick(save, 'answer', NOW + 9000);         // 5 s of `envelope` → game
    tick(save, 'payout', NOW + 69000);        // 60 s of `answer`  → answer
    const g = state.stateOf(save);
    assert.equal(g.tAnswer, 60000);
    assert.equal(g.tGame, 9000);
  });
});

/* ========================================================================================== */
describe('J5c — LAW: LOOSE floors at 0, and BAGGED is never taken from', () => {
  test('there is no state in which the game takes something already bagged', () => {
    const save = clone(CORPUS[8]);
    let minBagged = 0;
    let sawBag = false;
    runJob(save, {
      plan: (n) => (n % 2 === 0 ? MISS : CLEAN),
      call: () => 85,                                           // the harshest penalty this rank owns
      bagAt: (n) => { if (n === 1 || n === 5) { sawBag = true; return true; } return false; },
      onBeat: (r) => {
        assert.ok(r.loose >= 0, `LOOSE went negative: ${r.loose}`);
        assert.ok(r.bagged >= minBagged, `BAGGED fell ${minBagged} → ${r.bagged}`);
        minBagged = Math.max(minBagged, r.bagged);
      },
    });
    assert.ok(sawBag);
    assert.ok(save.player.records.bestBag >= minBagged);
  });

  test('a miss with LOOSE 0 takes exactly nothing, at every call rung', () => {
    for (const c of [50, 70, 85]) {
      const save = clone(CORPUS[9]);
      startJob(save, { today: TODAY, now: NOW });
      beginTargets(save, { now: NOW + 1000 });
      lockCall(save, c, { now: NOW + 2000 });
      const r = applyTarget(save, MISS, { now: NOW + 3000 });
      assert.equal(r.loose, 0);
      assert.equal(r.delta, 0);
      assert.equal(r.chain, 0);
    }
  });

  test('the whole of Ledger B floors: 200 scripted beats, no negative LOOSE anywhere', () => {
    for (let i = 0; i < 6; i++) {
      const rng = rngFrom('floor', i);
      const save = clone(CORPUS[i]);
      runJob(save, {
        plan: () => (rng.chance(0.45) ? MISS : CLEAN),
        call: () => [50, 70, 85][rng.int(0, 2)],
        bagAt: () => rng.chance(0.25),
        onBeat: (r) => { assert.ok(r.loose >= 0 && r.bagged >= 0); },
      });
    }
  });
});

/* ========================================================================================== */
describe('J5c — LAW: the sealed envelope (G1, G3.7 proof 5)', () => {
  const FORBIDDEN = ['id', 'item', 'template', 'seed', 'params', 'stem', 'answer', 'solution', 'parts', 'figure'];

  test('the envelope exposes no way to address the stem', () => {
    for (let i = 0; i < 6; i++) {
      const save = clone(CORPUS[i]);
      startJob(save, { today: TODAY, now: NOW });
      beginTargets(save, { now: NOW + 1000 });
      const env = envelopeFor(save);
      for (const k of FORBIDDEN) assert.ok(!(k in env), `envelope leaks ${k}`);
      const json = JSON.stringify(env);
      const it = currentItem(save);
      assert.ok(!json.includes(it.id), 'the card id is in the envelope');
      if (it.template) assert.ok(!json.includes(it.template), 'the template is in the envelope');
      /* and it is frozen, so a screen cannot decorate it with one */
      assert.throws(() => { env.id = it.id; }, TypeError);
    }
  });

  test('stemRefFor is null until the call is locked, and non-null the instant it is', () => {
    const save = clone(CORPUS[0]);
    startJob(save, { today: TODAY, now: NOW });
    assert.equal(stemRefFor(save), null, 'board');
    beginTargets(save, { now: NOW + 1000 });
    assert.equal(stemRefFor(save), null, 'envelope');
    assert.equal(state.stateOf(save).locked, null);
    lockCall(save, 70, { now: NOW + 2000 });
    const ref = stemRefFor(save);
    assert.ok(ref && ref.id === currentItem(save).id);
    assert.equal(state.stateOf(save).phase, 'answer');
  });

  test('the next envelope re-seals: the lock is cleared at the payout', () => {
    const save = clone(CORPUS[0]);
    runJob(save, { stopAfter: 1 });
    push(save, { now: NOW + 99999 });
    assert.equal(state.stateOf(save).locked, null);
    assert.equal(state.stateOf(save).phase, 'envelope');
    assert.equal(stemRefFor(save), null);
  });

  test('a call cannot be locked outside the envelope beat, and the 95 rung is rank-gated', () => {
    const save = clone(CORPUS[0]);
    startJob(save, { today: TODAY, now: NOW });
    beginTargets(save, { now: NOW + 1000 });
    assert.deepEqual(callsAvailable(save), [50, 70, 85]);      // the schema default rank is Called 2
    assert.throws(() => lockCall(save, 95, { now: NOW + 2000 }), JobStateError);
    lockCall(save, 85, { now: NOW + 2000 });
    assert.throws(() => lockCall(save, 70, { now: NOW + 2100 }), JobStateError);
    save.player.rank = 3;
    assert.deepEqual(callsAvailable(save), [50, 70, 85, 95]);
  });
});

/* ========================================================================================== */
describe('J5c — LAW: CALL IT (G1 "Failure states", G10 #7)', () => {
  /** Drive a job to LOOSE 0 ∧ chain 0 with `left` targets remaining, by missing at call 50. */
  function wipeTo(save, left) {
    startJob(save, { today: TODAY, now: NOW });
    beginTargets(save, { now: NOW + 1000 });
    let t = NOW + 2000;
    while (targetsLeft(save) > left) {
      const g = state.stateOf(save);
      if (g.phase === 'envelope') { lockCall(save, 50, { now: t += 1000 }); continue; }
      if (g.phase === 'answer') { applyTarget(save, MISS, { now: t += 1000 }); continue; }
      if (g.phase === 'payout' || g.phase === 'bagpush') { push(save, { now: t += 1000 }); continue; }
      if (g.phase === 'brief') { brief(save, {}, { now: t += 1000 }); continue; }
      break;
    }
    return t;
  }

  test('legal only at LOOSE 0 ∧ chain 0 ∧ ≥ 3 targets left', () => {
    const a = clone(CORPUS[1]);
    wipeTo(a, 4);
    assert.equal(state.stateOf(a).loose, 0);
    assert.equal(state.stateOf(a).chain, 0);
    assert.equal(canCallIt(a), true);

    /* one clear puts a chain on the board → refused */
    const b = clone(CORPUS[1]);
    wipeTo(b, 4);
    const g = state.stateOf(b);
    if (g.phase === 'envelope') lockCall(b, 50, { now: NOW + 5e5 });
    applyTarget(b, CLEAN, { now: NOW + 5e5 + 1 });
    assert.ok(state.stateOf(b).chain > 0 || state.stateOf(b).loose > 0);
    assert.equal(canCallIt(b), false);
    assert.throws(() => callIt(b), JobStateError);

    /* fewer than 3 left → refused */
    const c = clone(CORPUS[1]);
    wipeTo(c, 2);
    assert.equal(targetsLeft(c), 2);
    assert.equal(canCallIt(c), false);
    assert.throws(() => callIt(c), JobStateError);
    assert.equal(STATES.CALL_IT.minTargetsLeft, 3);
  });

  test('one call ends the stakes, records posted 0, and the rest continues WITH HINTS ON', () => {
    const save = clone(CORPUS[1]);
    let t = wipeTo(save, 5);
    const left = targetsLeft(save);
    const r = callIt(save, { now: t += 1000 });
    assert.equal(r.stakes, false);
    assert.equal(r.hints, true);
    assert.equal(hintsOn(), true);
    assert.equal(r.posted, 0);
    assert.equal(r.left, left);

    /* no call may be locked, nothing may be bagged, and no loot moves */
    assert.throws(() => lockCall(save, 70, { now: t += 1 }), JobStateError);
    assert.throws(() => bag(save, { now: t += 1 }), JobStateError);

    let answeredAfter = 0;
    for (let i = 0; i < 60; i++) {
      const g = state.stateOf(save);
      if (!g || g.outcome != null) break;
      if (g.phase === 'envelope') { beginAnswer(save, { now: t += 1000 }); continue; }
      if (g.phase === 'answer') {
        const p = applyTarget(save, CLEAN, { now: t += 1000 });
        assert.equal(p.delta, 0, 'a no-stakes target paid loot');
        assert.equal(p.loose, 0);
        answeredAfter++;
        continue;
      }
      if (g.phase === 'payout' || g.phase === 'bagpush') { push(save, { now: t += 1000 }); continue; }
      break;
    }
    assert.equal(answeredAfter, left, 'the remaining targets did not all run');
    const entry = save.game.log.at(-1);
    assert.equal(entry.posted, 0, 'the job was not recorded at posted 0');
    assert.equal(entry.guard, null);
    assert.equal(save.player.records.walked, 1, 'the job was not recorded walked');
    assert.equal(save.inProgress, null, 'the page did not close: every item was answered');
    assert.equal(save.counters.pages, 1);
  });

  test('CALL IT stops the game and NOT the studying: every remaining item is still marked', () => {
    const save = clone(CORPUS[2]);
    let t = wipeTo(save, 4);
    callIt(save, { now: t += 1000 });
    const queue = clone(queueOf(save));
    for (let i = 0; i < 60; i++) {
      const g = state.stateOf(save);
      if (!g || g.outcome != null) break;
      if (g.phase === 'envelope') { beginAnswer(save, { now: t += 1000 }); continue; }
      if (g.phase === 'answer') { applyTarget(save, CLEAN, { now: t += 1000 }); continue; }
      if (g.phase === 'payout' || g.phase === 'bagpush') { push(save, { now: t += 1000 }); continue; }
      break;
    }
    assert.equal(queue.length >= 4, true);
  });
});

/* ========================================================================================== */
describe('J5c — LAW: quitting is never better than banking, and never catastrophic', () => {
  test('any exit that is not a bag auto-banks LOOSE at 50 %', () => {
    assert.equal(AUTO_BAG.walk, 0.50);
    const save = clone(CORPUS[3]);
    runJob(save, { stopAfter: 3, bagAt: () => false });
    const g = state.stateOf(save);
    assert.ok(g.loose > 0, 'no pile to test with');
    const loose = g.loose, bagged = g.bagged;
    const prompt = walkPrompt(save);
    assert.equal(prompt.leave, autoBank(loose, 'walk'));
    assert.equal(prompt.bagAndLeave, bagBank(loose));
    const d = walk(save, { now: NOW + 9e5 });
    assert.equal(d.outcome, OUTCOMES.QUIT);
    assert.equal(d.finalBagged, eRound(bagged + autoBank(loose, 'walk')));
  });

  test('bagging first strictly dominates leaving, and neither is catastrophic', () => {
    const a = clone(CORPUS[3]); runJob(a, { stopAfter: 3, bagAt: () => false });
    const b = clone(CORPUS[3]); runJob(b, { stopAfter: 3, bagAt: () => false });
    const loose = state.stateOf(a).loose;
    const bagged = state.stateOf(a).bagged;
    const left = walk(a, { now: NOW + 9e5 }).finalBagged;
    const kept = walk(b, { bagFirst: true, now: NOW + 9e5 }).finalBagged;
    assert.ok(kept >= left, `bagging (${kept}) lost to leaving (${left})`);
    assert.ok(left >= bagged, 'leaving took from BAGGED');
    assert.ok(kept <= eRound(bagged + loose), 'bagging paid more than the pile');
    /* the arithmetic, at every pile size */
    for (let s = 0; s <= 400; s += 7) {
      assert.ok(autoBank(s, 'walk') <= bagBank(s), `50 % beat the 10 % fee at ${s}`);
      assert.ok(bagBank(s) <= eRound(s), `the fee paid out more than the pile at ${s}`);
    }
  });

  test('a job abandoned with targets left leaves inProgress a PLAIN PAGE (global rule 5)', () => {
    const save = clone(CORPUS[4]);
    runJob(save, { stopAfter: 3, bagAt: () => false });
    const idx = save.inProgress.idx;
    const len = save.inProgress.queue.length;
    walk(save, { now: NOW + 9e5 });
    assert.ok(save.inProgress, 'the page was closed with targets left');
    assert.equal(save.inProgress.game, undefined, 'the job record survived the walk');
    assert.equal(save.inProgress.idx, idx);
    assert.equal(save.inProgress.queue.length, len);
    assert.equal(save.counters?.pages ?? 0, 0, 'finishPage ran with targets left');
    assert.equal(state.stateOf(save), null);
    assert.equal(resume(save), null);
  });

  test('a job that answers every target closes the page through the EXISTING finishPage', () => {
    const save = clone(CORPUS[5]);
    runJob(save, { bagAt: (n) => n % 3 === 0 });
    assert.equal(save.inProgress, null);
    assert.equal(save.counters.pages, 1);
  });
});

/* ========================================================================================== */
describe('J5c — LAW: nothing auto-advances on a correct answer (COMPOSED global rule 4, G10 #10)', () => {
  test('applyTarget stops at the payout; the bag/push prompt OCCUPIES the continue tap', () => {
    const save = clone(CORPUS[6]);
    startJob(save, { today: TODAY, now: NOW });
    beginTargets(save, { now: NOW + 1000 });
    lockCall(save, 70, { now: NOW + 2000 });
    const r = applyTarget(save, CLEAN, { now: NOW + 3000 });
    assert.equal(state.stateOf(save).phase, 'payout');
    assert.equal(r.next, 'bagpush');
    assert.equal(idxOf(save), 1, 'the pointer did not move');
    assert.equal(stemRefFor(save), null, 'the next stem is addressable before its call');
    /* nothing moves until a decision is taken */
    const snap = clone(state.stateOf(save));
    assert.deepEqual(clone(state.stateOf(save)), snap);
    push(save, { now: NOW + 4000 });
    assert.equal(state.stateOf(save).phase, 'envelope');
  });

  test('the brief windows land after targets 4 and 8, and only that many of them', () => {
    const save = clone(CORPUS[7]);
    const seen = [];
    let t = NOW;
    startJob(save, { today: TODAY, now: t });
    beginTargets(save, { now: t += 1000 });
    for (let i = 0; i < 200; i++) {
      const g = state.stateOf(save);
      if (!g || g.outcome != null) break;
      if (g.phase === 'envelope') { lockCall(save, 70, { now: t += 1000 }); continue; }
      if (g.phase === 'answer') { applyTarget(save, CLEAN, { now: t += 1000 }); continue; }
      if (g.phase === 'payout' || g.phase === 'bagpush') { push(save, { now: t += 1000 }); continue; }
      if (g.phase === 'brief') { seen.push(answered(save)); brief(save, {}, { now: t += 1000 }); continue; }
      if (g.phase === 'getaway') { crack(save, { now: t += 1000 }); continue; }
      break;
    }
    assert.deepEqual(seen, BOARD.briefAfterTargets.slice(0, seen.length));
    assert.ok(seen.length <= 2);
  });

  test('the getaway gates the last target, and CRACK is the only way through it', () => {
    const save = clone(CORPUS[8]);
    let sawGetaway = false;
    let t = NOW;
    startJob(save, { today: TODAY, now: t });
    beginTargets(save, { now: t += 1000 });
    for (let i = 0; i < 200; i++) {
      const g = state.stateOf(save);
      if (!g || g.outcome != null) break;
      if (g.phase === 'getaway') {
        sawGetaway = true;
        assert.equal(targetsLeft(save), 1);
        assert.equal(isVaultTarget(save), true);
        assert.throws(() => lockCall(save, 70, { now: t += 1 }), JobStateError);
        crack(save, { now: t += 1000 });
        continue;
      }
      if (g.phase === 'envelope') { lockCall(save, 70, { now: t += 1000 }); continue; }
      if (g.phase === 'answer') { applyTarget(save, CLEAN, { now: t += 1000 }); continue; }
      if (g.phase === 'payout' || g.phase === 'bagpush') { push(save, { now: t += 1000 }); continue; }
      if (g.phase === 'brief') { brief(save, {}, { now: t += 1000 }); continue; }
      break;
    }
    assert.ok(sawGetaway, 'no getaway beat');
    assert.equal(save.game.log.at(-1).cracked, true);
    assert.equal(save.player.records.cracked, 1);
  });

  test('WALK at the getaway banks FREE and leaves the last target on Today\'s Page', () => {
    const save = clone(CORPUS[8]);
    runJob(save, { crackIt: false, bagAt: () => false });
    assert.equal(save.game.log.at(-1).cracked, false);
    assert.equal(save.player.records.walked, 1);
    assert.ok(save.inProgress, 'the page closed with a target left');
    assert.equal(save.inProgress.queue.length - save.inProgress.idx, 1);
  });
});

/* ========================================================================================== */
describe('J5c — the schedule is marked through the EXISTING calls, and only those', () => {
  test('a missed review is re-queued exactly once, by page.js\'s own requeueReview', () => {
    const save = clone(CORPUS[9]);
    startJob(save, { today: TODAY, now: NOW });
    const before = queueOf(save).length;
    const reviews = queueOf(save).filter((it) => it.isReview || it.isRematch).length;
    beginTargets(save, { now: NOW + 1000 });
    let t = NOW + 2000;
    let misses = 0;
    for (let i = 0; i < 200; i++) {
      const g = state.stateOf(save);
      if (!g || g.outcome != null) break;
      const it = currentItem(save);
      if (g.phase === 'envelope') { lockCall(save, 50, { now: t += 1000 }); continue; }
      if (g.phase === 'answer') {
        const missIt = !!(it?.isReview || it?.isRematch) && !it.requeued;
        if (missIt) misses++;
        applyTarget(save, missIt ? MISS : CLEAN, { now: t += 1000 });
        continue;
      }
      if (g.phase === 'payout' || g.phase === 'bagpush') { push(save, { now: t += 1000 }); continue; }
      if (g.phase === 'brief') { brief(save, {}, { now: t += 1000 }); continue; }
      if (g.phase === 'getaway') { crack(save, { now: t += 1000 }); continue; }
      break;
    }
    if (reviews > 0) assert.ok(misses > 0, 'no review was missed — the corpus save is wrong');
    /* every item carries the study layer's own `done`/`result`, written by markItem */
    assert.equal(save.counters.pages, 1);
  });

  test('every queue item ends `done` with a `result`, exactly as the flat path leaves it', () => {
    const save = clone(CORPUS[10]);
    startJob(save, { today: TODAY, now: NOW });
    const ids = queueOf(save).map((it) => it.id);
    const seen = [];
    runJob(save, { plan: (n) => (n % 3 === 0 ? MISS : CLEAN), onBeat: (r, n, sv) => seen.push(sv.inProgress.queue[n - 1]) });
    assert.ok(seen.every((it) => it.done === true && it.result), 'markItem did not mark');
    /**
     * The drafted ids are a SUBSEQUENCE of what was served, not a prefix of it. A missed review is
     * re-queued by the study layer's own `page.requeueReview`, which inserts the copy after the LAST
     * review in the queue — the end of the review BLOCK (S1 step 4), which is the middle of any job
     * that also carries new work. The old prefix assertion held only while a JOB-10 was ten reviews
     * and nothing else; `composeBundles` now posts the composer's own non-review work too
     * (COMPOSED-GAME G4, "What the shape does to the Page"), so this asserts the real invariant:
     * every drafted item is served, in the drafted order, and every extra beat is a re-queued copy.
     * (Changed by the round-1 board lane — notes/board-fix.md "Requests".)
     */
    const order = seen.map((it) => it.id);
    let at = -1;
    for (const id of ids) {
      const k = order.indexOf(id, at + 1);
      assert.ok(k > at, `${id} was drafted but not served after the item before it`);
      at = k;
    }
    seen.forEach((it, k) => {
      if (order.indexOf(it.id) === k) return;                     // the first time this id was served
      assert.ok((it.requeued ?? 0) > 0, `${it.id} was served twice and is not a re-queue`);
    });
  });

  test('the chain is xp.comboTransition() verbatim, on every rung (G2)', () => {
    const cases = [[CLEAN, RUNGS.CLEAN], [HINT1, RUNGS.HINT1], [ATT2, RUNGS.ATT2], [ATT3, RUNGS.ATT3], [MISS, MISS_RUNG]];
    for (const [result, rung] of cases) {
      assert.equal(rungOf(result), rung, JSON.stringify(result));
      for (let c = 0; c <= 9; c++) {
        assert.equal(chainAfterTarget(rung, 0, c), nextCombo(c, result), `rung ${rung} at chain ${c}`);
      }
    }
    assert.equal(rungOf({ free: true }), null);
    assert.equal(rungOf({ reason: 'almost' }), null);
    assert.equal(comboTransition(CLEAN), 'increment');
    assert.equal(comboTransition(HINT1), 'hold');
  });

  test('an `almost` / `malformed` outcome is FREE — no rung, no payout, no chain, no mark', () => {
    const save = clone(CORPUS[0]);
    startJob(save, { today: TODAY, now: NOW });
    beginTargets(save, { now: NOW + 1000 });
    lockCall(save, 85, { now: NOW + 2000 });
    const idx = idxOf(save);
    const r = applyTarget(save, { reason: 'almost' }, { now: NOW + 3000 });
    assert.equal(r.free, true);
    assert.equal(r.delta, 0);
    assert.equal(r.rung, null);
    assert.equal(idxOf(save), idx, 'a free outcome advanced the pointer');
    assert.equal(state.stateOf(save).calls.length, 0);
    assert.equal(state.stateOf(save).phase, 'answer');
  });
});

/* ========================================================================================== */
describe('J5c — Backchecks: the stake, and only the stake (G2, G3.7 #10, G12 #26)', () => {
  /** A job driven to a miss that actually COST something, with a Backcheck in hand. */
  function toCostlyMiss(save) {
    save.game = { ...(save.game ?? {}), backchecks: { held: 2, mintedDay: null } };
    startJob(save, { today: TODAY, now: NOW });
    beginTargets(save, { now: NOW + 1000 });
    let t = NOW + 2000;
    lockCall(save, 70, { now: t += 1000 });
    applyTarget(save, CLEAN, { now: t += 1000 });
    push(save, { now: t += 1000 });
    lockCall(save, 70, { now: t += 1000 });
    const before = clone(state.stateOf(save));
    const r = applyTarget(save, MISS, { now: t += 1000 });
    return { t, before, r };
  }

  test('a spent Backcheck restores the chain and the pile, and writes NOTHING else', () => {
    const save = clone(CORPUS[1]);
    const { before, r } = toCostlyMiss(save);
    assert.ok(r.delta < 0, 'the miss cost nothing — no stake to shield');
    assert.equal(canBackcheck(save), true);
    const callsBefore = clone(save.player.rating.calls);
    const ledgerA = Object.fromEntries(LEDGER_A_KEYS.map((k) => [k, clone(save[k])]));
    const res = backcheck(save);
    assert.equal(res.loose, before.loose);
    assert.equal(res.chain, before.chain);
    assert.equal(res.held, 1);
    assert.deepEqual(save.player.rating.calls, callsBefore, 'the rating entry moved');
    for (const k of LEDGER_A_KEYS) assert.deepEqual(save[k], ledgerA[k], `${k} moved`);
    assert.equal(canBackcheck(save), false, 'a second shield on the same beat');
  });

  test('the calls[] entry is byte-identical shielded and unshielded (G12 #26)', () => {
    const a = clone(CORPUS[1]); toCostlyMiss(a);
    const b = clone(CORPUS[1]); toCostlyMiss(b); backcheck(b);
    assert.deepEqual(b.player.rating.calls, a.player.rating.calls);
    assert.equal(b.inProgress.game.calls.at(-1).ok, a.inProgress.game.calls.at(-1).ok);
    assert.equal(b.inProgress.game.calls.at(-1).w, a.inProgress.game.calls.at(-1).w);
  });

  test('none on the vault, none without one held, none off the payout beat', () => {
    const save = clone(CORPUS[1]);
    const { t } = toCostlyMiss(save);
    assert.equal(BACKCHECK.allowedOnVault, false);
    save.game.backchecks.held = 0;
    assert.equal(canBackcheck(save), false);
    assert.throws(() => backcheck(save), JobStateError);
    save.game.backchecks.held = 2;
    push(save, { now: t + 1000 });
    assert.equal(canBackcheck(save), false, 'a shield after the beat closed');
  });

  test('the mint: dues ≥ 1 and all cleared, 1/day, cap 3 (G12 #38)', () => {
    const save = clone(CORPUS[0]);
    save.game = { ...(save.game ?? {}), backchecks: { held: 0, mintedDay: null } };
    assert.equal(mintBackcheck(save, { dues: 0, cleared: 0, day: '2026-09-16' }).minted, 0);
    assert.equal(mintBackcheck(save, { dues: 4, cleared: 3, day: '2026-09-16' }).minted, 0);
    assert.equal(mintBackcheck(save, { dues: 4, cleared: 4, day: '2026-09-16' }).minted, 1);
    assert.equal(mintBackcheck(save, { dues: 4, cleared: 4, day: '2026-09-16' }).minted, 0, 'twice in one day');
    assert.equal(mintBackcheck(save, { dues: 1, cleared: 1, day: '2026-09-17' }).held, 2);
    assert.equal(mintBackcheck(save, { dues: 1, cleared: 1, day: '2026-09-18' }).held, 3);
    assert.equal(mintBackcheck(save, { dues: 1, cleared: 1, day: '2026-09-19' }).held, BACKCHECK.max);
  });
});

/* ========================================================================================== */
describe('J5c — COMMIT, the 22:00 close, and the debrief', () => {
  test('a bound declaration banks in FULL, pays +8 %, and forfeits the completion bonus (G3.9)', () => {
    const save = clone(CORPUS[2]);
    runJob(save, { stopAfter: 4, bagAt: (n) => n === 2 });
    commitBind(save, { kind: 'walk', byMin: 12 });
    assert.equal(save.game.commit.bound, true);
    const g = state.stateOf(save);
    const loose = g.loose, bagged = g.bagged;
    assert.equal(commitDue(save, NOW + 11 * 60000), false);
    assert.equal(commitDue(save, NOW + 13 * 60000), true);
    const d = commitFire(save, { now: NOW + 13 * 60000 });
    assert.equal(d.outcome, OUTCOMES.COMMIT);
    assert.equal(d.bonusRate, 0.08);
    assert.equal(d.finalBagged, eRound(eRound(bagged + loose) * 1.08), 'not banked at full value');
    assert.equal(save.game.commit.honored, 1);
    assert.equal(save.game.commit.bound, false);
    assert.ok(save.inProgress, 'the rest of Today\'s Page was taken away');
  });

  test('the 22:00 close banks in full and turns the stakes off, without closing a study door', () => {
    const save = clone(CORPUS[3]);
    runJob(save, { stopAfter: 3, bagAt: () => false });
    const g = state.stateOf(save);
    const loose = g.loose, bagged = g.bagged;
    assert.ok(loose > 0);
    const left = targetsLeft(save);
    const r = quietClose(save, { end: false, now: NOW + 9e5 });
    assert.equal(r.stakes, false);
    assert.equal(r.banked, eRound(bagged + loose), 'not banked at full value');
    assert.equal(AUTO_BAG.quiet22, 1.00);
    assert.equal(targetsLeft(save), left, 'an item was taken off the page');
    assert.equal(state.stateOf(save).loose, 0);
    assert.throws(() => lockCall(save, 70, { now: NOW + 9e5 }), JobStateError);
  });

  test('the completion bonus is +10 % on BAGGED, and only when every target was answered', () => {
    assert.equal(COMPLETION, 0.10);
    const save = clone(CORPUS[5]);
    let raw = 0;
    runJob(save, { bagAt: () => false, onBeat: (r) => { raw = r.bagged; } });
    const entry = save.game.log.at(-1);
    assert.equal(entry.targets, entry.targets);
    assert.ok(entry.bagged > 0);
  });

  test('the debrief prints the two accumulators, the split and the decision count', () => {
    const save = clone(CORPUS[6]);
    const { debrief } = runJob(save, { crackIt: false, bagAt: (n) => n % 3 === 0 });
    assert.ok(debrief, 'no debrief returned');
    assert.ok(debrief.tGame > 0 && debrief.tAnswer > 0);
    assert.equal(debrief.wall, debrief.tGame + debrief.tAnswer);
    assert.ok(debrief.split > 0 && debrief.split < 1);
    assert.ok(debrief.decisions >= debrief.calls.length * 2, 'fewer than 2 decisions per graded item');
    assert.equal(debrief.loose, 0);
    assert.equal(debrief.chain, 0);
  });

  test('the ≤ 30-entry log, the heat window and the Elo pair all move once per job', () => {
    const save = clone(CORPUS[7]);
    const eloBefore = clone(save.player?.elo ?? { player: 1000, house: 1000 });
    runJob(save, { bagAt: (n) => n % 2 === 0 });
    assert.equal(save.game.log.length, 1);
    assert.ok(save.game.log.length <= CAPS.log);
    assert.equal(save.game.heat.jobs, 1);
    assert.ok(save.game.heat.weight > 0);
    assert.notDeepEqual(save.player.elo, eloBefore, 'the Elo pair did not move on a completed job');
    assert.equal(save.game.ledger.jobs, 1);
    assert.ok(save.game.ledger.tAnswer > 0);
  });

  test('quitting does NOT move the Elo pair (G3.7 proof 6: quitting must never pay)', () => {
    const save = clone(CORPUS[7]);
    const before = clone(save.player?.elo ?? { player: 1000, house: 1000 });
    runJob(save, { stopAfter: 3, bagAt: () => false });
    walk(save, { now: NOW + 9e5 });
    assert.deepEqual(save.player.elo, before);
  });
});

/* ========================================================================================== */
describe('J5c — phase legality: every illegal transition is refused, not tolerated', () => {
  test('the machine refuses out-of-order verbs', () => {
    const save = clone(CORPUS[0]);
    assert.throws(() => applyTarget(save, CLEAN), JobStateError);       // no job
    assert.throws(() => bag(save), JobStateError);
    assert.throws(() => walk(save), JobStateError);
    startJob(save, { today: TODAY, now: NOW });
    assert.throws(() => applyTarget(save, CLEAN, { now: NOW + 1 }), JobStateError);   // still at the board
    assert.throws(() => crack(save, { now: NOW + 1 }), JobStateError);
    assert.throws(() => brief(save, {}, { now: NOW + 1 }), JobStateError);
    assert.throws(() => beginAnswer(save, { now: NOW + 1 }), JobStateError);          // stakes are on
    beginTargets(save, { now: NOW + 1000 });
    assert.throws(() => bag(save, { now: NOW + 1 }), JobStateError);
    assert.throws(() => push(save, { now: NOW + 1 }), JobStateError);
    assert.throws(() => backcheck(save), JobStateError);
    assert.throws(() => tick(save, 'atlantis', NOW + 2), JobStateError);
  });

  test('press is sealed once the targets start, and never exceeds 3 tokens', () => {
    const save = clone(CORPUS[0]);
    startJob(save, { today: TODAY, now: NOW });
    assert.throws(() => press(save, { RECALL: 4 }), JobStateError);
    const t = press(save, { RECALL: 2, WORDS: 1 });
    assert.equal(WING_IDS.reduce((s, w) => s + t[w], 0), 3);
    beginTargets(save, { now: NOW + 1000 });
    assert.throws(() => press(save, { RECALL: 1 }), JobStateError);
  });

  test('a finished job refuses every further verb', () => {
    const save = clone(CORPUS[4]);
    runJob(save, { stopAfter: 3, bagAt: () => false });
    walk(save, { now: NOW + 9e5 });
    assert.equal(state.stateOf(save), null);
    assert.throws(() => push(save), JobStateError);
    assert.throws(() => endJob(save, OUTCOMES.QUIT), JobStateError);
  });

  /* notes/J6.md §5.3 and notes/J6b.md R3 (the same request from two tickets), taken at integration:
     the last beat's `push()` ends the job through `advance()` → `endJob()` → `finishPage()`, which
     nulls `inProgress` — so the caller got a status object and the debrief was already gone, and
     both `screens/job.js` and `tests/job-debrief.test.mjs` had to call `endJob(save, finalWordOf())`
     themselves and duplicate the word choice. `push()` and `bag()` now hand it back. */
  test('push() and bag() RETURN the debrief on the beat that ends the job, and null on every other', () => {
    const save = clone(CORPUS[0]);
    startJob(save, { today: TODAY, now: NOW, shape: 'RUN' });
    beginTargets(save, { now: NOW + 6000 });
    let t = NOW + 6000;
    const step = (ms) => (t += ms);
    let ended = null;
    let midBeats = 0;
    for (let guard = 0; guard < 400; guard++) {
      const g = state.stateOf(save);
      if (!g || g.outcome != null) break;
      if (g.phase === 'envelope') { lockCall(save, 50, { now: step(5000) }); continue; }
      if (g.phase === 'answer') { applyTarget(save, CLEAN, { now: step(40000) }); continue; }
      if (g.phase === 'payout' || g.phase === 'bagpush') {
        const r = push(save, { now: step(9000) });
        assert.ok('debrief' in r, 'push() must always carry the key, even when it is null');
        if (r.debrief) { ended = r.debrief; break; }
        assert.equal(r.debrief, null, 'a mid-job push ends nothing and must return null');
        midBeats++;
        continue;
      }
      if (g.phase === 'brief') { brief(save, {}, { now: step(20000) }); continue; }
      if (g.phase === 'getaway') { crack(save, { now: step(25000) }); continue; }
      break;
    }
    assert.ok(midBeats > 0, 'the walk never reached a mid-job push — the assertion above is vacuous');
    assert.ok(ended, 'the last push() ended the job but returned no debrief');
    assert.equal(state.stateOf(save), null, 'and the record really is gone by then — that is the whole problem');
    for (const k of ['split', 'decisions', 'tGame', 'tAnswer', 'ratingBefore', 'ratingAfter', 'bagged']) {
      assert.ok(k in ended, `the returned debrief is missing ${k}`);
    }
    /* and the same on the BAG path */
    const s2 = clone(CORPUS[0]);
    startJob(s2, { today: TODAY, now: NOW, shape: 'RUN' });
    beginTargets(s2, { now: NOW + 6000 });
    let u = NOW + 6000;
    const step2 = (ms) => (u += ms);
    let bagged = null;
    for (let guard = 0; guard < 400; guard++) {
      const g = state.stateOf(s2);
      if (!g || g.outcome != null) break;
      if (g.phase === 'envelope') { lockCall(s2, 50, { now: step2(5000) }); continue; }
      if (g.phase === 'answer') { applyTarget(s2, CLEAN, { now: step2(40000) }); continue; }
      if (g.phase === 'payout' || g.phase === 'bagpush') {
        const r = bag(s2, { now: step2(9000) });
        assert.ok('debrief' in r);
        if (r.debrief) { bagged = r.debrief; break; }
        continue;
      }
      if (g.phase === 'brief') { brief(s2, {}, { now: step2(20000) }); continue; }
      if (g.phase === 'getaway') { crack(s2, { now: step2(25000) }); continue; }
      break;
    }
    assert.ok(bagged, 'the last bag() ended the job but returned no debrief');
  });

  test('startJob is idempotent: a second call returns the live job, not a new one', () => {
    const save = clone(CORPUS[2]);
    const a = startJob(save, { today: TODAY, now: NOW });
    const b = startJob(save, { today: TODAY, now: NOW + 1e6 });
    assert.equal(a.seed, b.seed);
    assert.deepEqual(a, b);
  });
});

/* ========================================================================================== */
describe('J5c — pricing reads the board, not the clock', () => {
  test('the envelope\'s posted is stable across the whole job and across a reload', () => {
    const save = clone(CORPUS[6]);
    startJob(save, { today: TODAY, now: NOW });
    beginTargets(save, { now: NOW + 1000 });
    const a = pricedTarget(save).posted;
    const b = pricedTarget(save, { now: 0 }).posted;                   // the pinned start wins
    assert.equal(a, b);
    const reloaded = JSON.parse(JSON.stringify(save));
    resume(reloaded);
    assert.equal(pricedTarget(reloaded).posted, a, 'a reload re-priced the target');
  });

  test('a token on an unguarded wing pays +0.25×, and a token on the guarded wing pays nothing', () => {
    const save = clone(CORPUS[6]);
    const g = startJob(save, { today: TODAY, now: NOW });
    beginTargets(save, { now: NOW + 1000 });
    const t = pricedTarget(save);
    if (t.guarded) assert.equal(t.tokens, 0, 'tokens on the guarded wing were counted');
    else assert.equal(t.tokens, g.tokens[t.wing] ?? 0);
  });
});
