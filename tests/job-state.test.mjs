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
import { drawGuard, flowControl } from '../site/js/job/guard.js';
import { bagBank, autoBank, chainAfterTarget, round as eRound } from '../site/js/job/econ.js';
import { comboTransition, nextCombo } from '../site/js/xp.js';
import { fresh } from '../site/js/store.js';
import { applyOutcome, DAY_MS, HOUR_MS } from '../site/js/schedule.js';
import { rngFrom } from '../site/js/rng.js';
import { ratingDetail, rankFor } from '../site/js/job/call.js';
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
      /* r3 (ledger-invariance, finding 64): G7 publishes "Streak, trophies, XP, levels | unchanged",
         and `streak` and `jumps` were in no list at all until this ticket */
      () => { s.streak.count = 999; },
      () => { s.streak = { count: 9, best: 9, lastDay: null, freezes: 0 }; },
      () => { s.jumps.M1 = true; },
    ];
    for (const fn of denied) assert.throws(fn, LedgerError, `${fn}`);
    /* Ledger B is writable — that is the whole point of the split */
    assert.doesNotThrow(() => { s.player = { rank: 3 }; });
    assert.doesNotThrow(() => { s.game = { crew: {} }; });
    assert.doesNotThrow(() => { s.inProgress = null; });
    /* `counters` is the ONE shared key with a write on this route, and r3 narrowed it to that write.
       It used to be wide open — this line asserted `s.counters = { pages: 1 }` does not throw, which
       is the hole finding 64 measured: `s.counters.clears = 999` from `js/job/*` landed silently.
       The write that must keep working is `finishPage`'s increment, and ONLY that one. */
    assert.doesNotThrow(() => { s.counters.pages = (s.counters.pages ?? 0) + 1; },
      'finishPage\'s own counter is blocked — `state.endJob` cannot close the page');
    assert.throws(() => { s.counters.clears = 999; }, LedgerError, 'counters is writable from js/job/*');
    assert.throws(() => { s.counters = { pages: 1 }; }, LedgerError, 'the whole counters object is replaceable');
    assert.throws(() => { delete s.counters.pages; }, LedgerError, 'the page count is deletable');
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

  /**
   * ROUND-4 VERIFY — **the mercy button records the job it played, not 0.**
   *
   * `callIt` wrote `g.posted = 0` and `endJob` re-zeroed it (`g.stakes === false ? 0 : …`), so a
   * called job logged `{targets: n, posted: 0}`. A posted-0 row is INVISIBLE to `guard.flowControl`:
   * `under(r)` requires `posted > 0`, so the row could not be a bad job AND it reset the two-job
   * streak — `[bad, CALL IT, bad]` fired nothing where `[bad, bad]` fires `−40` and the FOOTHOLD
   * board. The student who took the button the design offers them was the one student the design's
   * own help could not reach (exploit-hunt, verify round 4).
   *
   * The recorded value is `state.postedAnswered(save)`: the same `it.posted` figures, off the same
   * queue, that `startJob` summed into `g.posted` — restricted to the answered prefix. So it is
   * exact rather than an estimate, and it is on the bar's own basis, which is what lets
   * `bagged < 0.5 · posted` mean anything at all.
   */
  test('one call ends the stakes, records the ANSWERED prefix, and the rest continues WITH HINTS ON', () => {
    const save = clone(CORPUS[1]);
    let t = wipeTo(save, 5);
    const left = targetsLeft(save);
    const answeredBefore = answered(save);
    const prefix = state.postedAnswered(save);
    /* non-vacuity: the prefix must be a real, non-empty, PROPER part of the board */
    assert.ok(answeredBefore > 0 && left > 0, 'the arm did not answer a proper prefix');
    assert.ok(prefix > 0, 'the answered prefix is worth 0 — the arm cannot see the repair');
    /* a PROPER prefix of the queue as it now stands. (It is measured against the live queue, not
       against `g.posted`: `requeueReview` puts a missed review back AFTER the pointer, so a job full
       of misses answers more targets than the board drafted and the answered prefix may be worth
       more than the drafted total. That is real work, and it is counted as such.) */
    const whole = eRound(queueOf(save).reduce((a, it) => a + it.posted, 0));
    assert.ok(prefix < whole, `the prefix (${prefix}) is not smaller than the whole queue (${whole})`);
    /* and it is the queue's own arithmetic, not a second definition of it */
    assert.equal(prefix, eRound(queueOf(save).slice(0, answeredBefore)
      .reduce((a, it) => a + it.posted, 0)));
    const r = callIt(save, { now: t += 1000 });
    assert.equal(r.stakes, false);
    assert.equal(r.hints, true);
    assert.equal(hintsOn(), true);
    assert.equal(r.posted, prefix, 'CALL IT still records the job at posted 0');
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
    assert.equal(entry.posted, prefix, 'the job was not recorded at the answered prefix');
    /* the STAKES-OFF half is still excluded: the tail ran, and it added nothing to the bar */
    assert.equal(entry.targets, answeredBefore + left, 'the tail was not answered');
    assert.equal(typeof entry.guard, 'string', 'a job with a posted prefix records the wing it ran under');
    assert.equal(save.player.records.walked, 1, 'the job was not recorded walked');
    assert.equal(save.inProgress, null, 'the page did not close: every item was answered');
    assert.equal(save.counters.pages, 1);
    /* and the Elo is STILL not rated: `CALLED` is a mid-job abandonment, the same shape as `QUIT`,
       and `eloOutcome` scores a WIN at `bagged >= posted` — rating the prefix would pay the mercy
       button an Elo win for bagging and then calling. The flow-control half is the half that reads
       the struggle, and the next test is the half that proves it moved. */
    assert.deepEqual(save.player.elo, { player: 1000, house: 1000 },
      'a called job moved the Elo pair — `CALLED` is not a getaway word');
  });

  /**
   * ROUND-4 VERIFY — and here is the consequence, on the real machine: **two called jobs are a
   * pattern, and the pattern opens the FOOTHOLD board.** Before the repair both rows logged
   * `posted 0`, `flowControl` counted `streak 0` on them and `fire` was false forever.
   */
  test('CALL IT after a bad prefix is a BAD JOB: two of them fire the penalty and the FOOTHOLD', () => {
    const save = clone(CORPUS[1]);
    const play = () => {
      let t = wipeTo(save, 5);                       // five targets MISSED at call 50 → bagged 0
      callIt(save, { now: t += 1000 });
      for (let i = 0; i < 60; i++) {
        const g = state.stateOf(save);
        if (!g || g.outcome != null) break;
        if (g.phase === 'envelope') { beginAnswer(save, { now: t += 1000 }); continue; }
        if (g.phase === 'answer') { applyTarget(save, MISS, { now: t += 1000 }); continue; }
        if (g.phase === 'payout' || g.phase === 'bagpush') { push(save, { now: t += 1000 }); continue; }
        break;
      }
      save.inProgress = null;                        // the page closed itself; clear for the next board
      return save.game.log.at(-1);
    };
    const first = play();
    assert.ok(first.posted > 0, 'the first called job still logs posted 0');
    assert.ok(first.bagged < 0.5 * first.posted, 'the arm did not produce a BAD job');
    const afterOne = flowControl(save.game.log);
    assert.equal(afterOne.streak, 1, 'one called job is not one bad job');
    assert.equal(afterOne.fire, false, 'one bad job fired the penalty');

    const second = play();
    assert.ok(second.bagged < 0.5 * second.posted);
    const afterTwo = flowControl(save.game.log);
    assert.equal(afterTwo.streak, 2, 'two called jobs are not a pattern');
    assert.equal(afterTwo.fire, true, 'the pattern did not fire — the mercy button is still invisible');
    assert.equal(afterTwo.deltaPlayer, -40);
    assert.ok(afterTwo.foothold && afterTwo.foothold.targets === 3 && afterTwo.foothold.tier === 1,
      'the FOOTHOLD board the design owes a struggling student is still not opened');
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

/* ==========================================================================================
   S3 — THE RANK IS A RATCHET (designs/REPAIR-DECISION.md S3.1(b), S3.4 item 4)
   ------------------------------------------------------------------------------------------
   `call.ratingDetail(calls, N, {rank})` floors the computed rank on the rank already held, so
   mastering the material can no longer DEMOTE a student Called 5 → Called 2 and take the 95 rung
   and guardMult 0.75 back with it. The hook has shipped in `call.js` since round 2 and was
   default-off; the two writers in THIS file are two of the three that have to pass it. Before this
   ticket both wrote `p.rank = 2` on the very window a mastered player lives in — every call blank,
   `n === 0`, rating 5.00 — which is the state this block drives.
   ========================================================================================== */
describe('S3 — mastering the material must not demote: state.js passes the held rank', () => {
  /**
   * A save whose every card is MASTERED: ten clears in the trailing window, so `q̂ = 1`,
   * `w = 4·1·(1−1) = 0`, and every call the job writes is a BLANK slot. That is the regime the
   * demotion lives in, built out of the shipped `qHatFor` rather than by hand.
   */
  function masteredSave(i, rank = 5) {
    const s = clone(CORPUS[i]);
    for (const rec of Object.values(s.cards)) {
      rec.history = Array.from({ length: 10 }, (_, h) => ({
        at: NOW - (20 - h) * DAY_MS, ok: true, attempt: 1, hints: 0, ms: 9000,
      }));
    }
    s.player = { ...(s.player ?? {}), rank, rating: { calls: [], value: 5.0, n: 0 } };
    return s;
  }

  test('applyTarget HOLDS the rank across a window with no measurement in it', () => {
    const save = masteredSave(3);
    let t = NOW;
    startJob(save, { today: TODAY, now: t });
    beginTargets(save, { now: (t += 6000) });
    lockCall(save, 85, { now: (t += 5000) });
    applyTarget(save, CLEAN, { now: (t += 40000) });

    const p = save.player;
    assert.equal(p.rating.calls.length, 1, 'the target did not write the rating window at all');
    assert.equal(p.rating.n, 0, 'the window carries a measurement — the mastered regime is not built');
    assert.equal(p.rating.value, 5, 'a window of blanks must read exactly 5.00');
    assert.equal(p.rank, 5,
      'applyTarget DEMOTED a student for mastering the material: rank is a ratchet (S3), and this '
      + 'writer must pass `{ rank: p.rank }` to call.ratingDetail');
  });

  test('endJob HOLDS the rank too — the whole job, played to the getaway', () => {
    const save = masteredSave(4);
    runJob(save, { call: () => 85 });
    assert.equal(state.stateOf(save), null, 'the job did not end');
    const p = save.player;
    assert.ok(p.rating.calls.length >= 3, 'too few targets to be a job');
    assert.equal(p.rating.n, 0, 'the window carries a measurement — the mastered regime is not built');
    assert.equal(p.rank, 5, 'endJob DEMOTED a student for mastering the material (S3)');
  });

  test('a rank the student never held is NOT invented: a Called 2 save stays Called 2', () => {
    const save = masteredSave(5, 2);
    runJob(save, { call: () => 85 });
    assert.equal(save.player.rank, 2, 'the floor is the rank HELD, not a promotion');
  });

  test('source: no call.ratingDetail( in state.js omits its rank: floor (S3)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../site/js/job/state.js', import.meta.url), 'utf8');
    const lines = src.split('\n')
      .map((l, i) => [i + 1, l])
      .filter(([, l]) => l.includes('call.ratingDetail('))
      .filter(([, l]) => !/^\s*(\*|\/\/)/.test(l));
    assert.equal(lines.length, 2, 'state.js no longer has exactly the two rating writers S3 names');
    for (const [n, l] of lines) {
      assert.match(l, /call\.ratingDetail\([^)]*\brank:/,
        `state.js:${n} computes a rank with no floor — the ratchet leaks (S3.4 item 4)`);
    }
  });
});

/* ==========================================================================================
   S3.1(c) — THE RATCHET'S AUDIT RECORD: `player.records.bestRating`
   ------------------------------------------------------------------------------------------
   Under the rank FLOOR above, a held rank is no longer recomputable from the window, so
   REPAIR-DECISION §S3.1(c) keeps the HIGH-WATER RATING that bought it beside it — which is the
   whole of what keeps G9 #4 ("a reviewer can recompute any number on any screen from the save")
   true while the floor binds, and what Settings and Stats print next to the rank.

   Until this block nothing DROVE it. Every reference to the field in `tests/` was a regex over a
   PRINTER's source (job-meta-constants.test.mjs:730-743), a normalize/coercion test
   (job-save.test.mjs:327-346) or a byte-budget fixture (_helpers.mjs:332), so the writers could be
   deleted — or inverted to `Math.min`, which turns the record into a LOW-water mark — with a green
   suite. Verify round 1 (test-integrity) mutated them in a scratch copy and all four SURVIVED:
   `state.js:1191 → void 0`, `state.js:1916 → void 0`, `state.js:1191 Math.max → Math.min`,
   `screens/mock.js:578` deleted — fail 0 every time.

   Every arm below drives the SHIPPED path (a real job through `runJob` / the real `applyMockCall`)
   and reads the record back off the save; none of them builds a rating window by hand. The two
   state.js writers are isolated from one another so that neither can be deleted and covered by the
   other: `applyTarget` by the per-target running maximum, `endJob` by a job where CALL IT has
   turned the stakes off and `applyTarget` therefore writes no rating at all. The seven negative
   controls that kill these arms are in notes/repair-state.md § "VERIFY ROUND 1 — the `state` lane".
   ========================================================================================== */
describe('S3.1(c) — `player.records.bestRating` is the high-water rating, and every writer writes it', () => {
  /**
   * The record as `state.js` reads it: `num(p.records.bestRating, 0)`. Written this way so the arms
   * hold under BOTH schema regimes — declared (0 on a fresh save) and not yet declared (absent).
   */
  const bestOf = (s) => (Number.isFinite(+s.player?.records?.bestRating) ? +s.player.records.bestRating : 0);

  /* What the WINDOW is worth, recomputed off the save the writers just wrote. THE CAP prices the
     rank off `earned = min(value, ceiling)`, so `earned` — not `value` — is the number `rankFor`
     consumed and therefore the number S3.1(c)'s record owes: a max over `value` is a rating the dice
     paid that bought no rung at all, and on a capped window the two diverge by rating POINTS.
     `earned` depends on the WINDOW alone and not on the floor, so recomputing it after the write is
     exact. (COMPOSED-GAME G2 "Rank" / G9 #4, restated at verify round 2.) */
  const earnedOf = (s) => {
    const d = ratingDetail(s.player.rating.calls, CAPS.calls);
    return { earned: d.earned, ceiling: d.ceiling, capped: d.capped };
  };

  /** One job, plus what the rating and the record read after EVERY target it staked. */
  function traceJob(save, opts = {}) {
    const seen = [];
    const out = runJob(save, {
      ...opts,
      onBeat: () => seen.push({ value: save.player.rating.value, best: bestOf(save), ...earnedOf(save) }),
    });
    return { seen, at: out.at };
  }

  test('applyTarget writes it at EVERY staked target, as a running MAXIMUM — the rating rises, then falls', () => {
    const save = clone(CORPUS[3]);
    assert.equal(bestOf(save), 0, 'this save already carries a record — the arm does not start from zero');

    /* four honest calls on clean work lift the rating; from target 5 the same 85 call keeps missing */
    const { seen } = traceJob(save, { plan: (n) => (n >= 5 ? MISS : CLEAN), call: () => 85 });
    const values = seen.map((x) => x.value);
    assert.ok(seen.length >= 8, `only ${seen.length} staked targets — too short to rise AND fall`);
    assert.equal(save.player.rating.n, seen.length, 'the window is not measured — these are not real ratings');

    const peak = Math.max(...values);
    const peakAt = values.indexOf(peak);
    assert.ok(peakAt > 0, `the rating never rose: ${JSON.stringify(values)}`);
    assert.ok(values.at(-1) < peak,
      `the rating never fell back from its peak (${JSON.stringify(values)}) — Math.max is not under test here`);

    /* The record is the high-water EARNED rating, not the high-water PRINTED one. This window is
       CAPPED on its early targets — asserted, because on an uncapped window the two series are the
       same number and the arm could not tell `detail.value` from `detail.earned`. */
    assert.ok(seen.some((x) => x.capped),
      `no target in this arm ran ahead of its ceiling (${JSON.stringify(seen.map((x) => [x.value, x.ceiling]))}) — `
      + 'the arm cannot tell detail.value from detail.earned and is vacuous');
    const peakEarned = Math.max(...seen.map((x) => x.earned));
    assert.ok(peakEarned < peak,
      `the earned series never fell short of the printed one (${peakEarned} vs ${peak}) — see the capped assertion above`);

    let running = 0;
    for (const [i, x] of seen.entries()) {
      running = Math.max(running, x.earned);
      assert.equal(x.best, running,
        `target ${i + 1}: the audit record reads ${x.best} where the high-water EARNED rating is ${running} `
        + `(the window printed ${x.value} against a ceiling of ${x.ceiling}) — applyTarget either did not write `
        + 'records.bestRating, wrote the LATEST value instead of the MAXIMUM, or wrote detail.value, which is '
        + 'the rating the dice paid and not the one rankFor consumed');
    }
    assert.equal(bestOf(save), peakEarned, 'the record that survived the job is not the job\'s high-water EARNED rating');
    assert.ok(save.player.rating.value < bestOf(save),
      `the job ended at its own peak (${save.player.rating.value}) — a save that cannot tell a maximum from an assignment`);
    /* What the record is FOR (G9 #4's one exception): the held rank recomputes from it. `rankFor` is
       monotone and `p.rank` is a ratchet over `rankFor(earned)`, so the held rank is exactly
       `max(the rank this save started at, rankFor(record))` — which a record written off `value`
       cannot satisfy, because it reports a rating that bought a HIGHER rung than the one held. */
    assert.equal(save.player.rank, Math.max(2, rankFor(bestOf(save))),
      `Called ${save.player.rank} beside a best rating of ${bestOf(save)}, which buys Called ${rankFor(bestOf(save))} — `
      + 'the audit record no longer recomputes the rank it is published to explain');
  });

  test('endJob writes it too — on a job where applyTarget cannot, because CALL IT turned the stakes off', () => {
    /* A save whose window was filled by a REAL job, then the record cleared: the save of a student
       who played before S3.1(c) shipped (`store.js` loads the absent field as 0). Only `endJob` can
       put the record back, and only if it writes one. */
    const save = clone(CORPUS[7]);
    runJob(save, { plan: () => CLEAN, call: () => 85 });
    const earned = save.player.rating.value;
    assert.ok(earned > 5, `the first job did not lift the rating off the 5.00 blank window (${earned})`);
    save.player.records.bestRating = 0;

    let t = NOW + DAY_MS;
    const step = (ms) => (t += ms);
    startJob(save, { today: addDays(TODAY, 1), now: t });
    beginTargets(save, { now: step(6000) });
    assert.equal(canCallIt(save), true, 'CALL IT is not available at the first envelope — the arm cannot be built');
    callIt(save, { now: step(1000) });
    assert.equal(state.stateOf(save).stakes, false, 'CALL IT did not end the stakes');

    let targets = 0;
    for (let k = 0; k < 400; k++) {
      const g = state.stateOf(save);
      if (!g || g.outcome != null) break;
      if (g.phase === 'envelope') { beginAnswer(save, { now: step(1000) }); continue; }
      if (g.phase === 'answer') {
        applyTarget(save, CLEAN, { now: step(40000) });
        targets++;
        assert.equal(bestOf(save), 0,
          `a target with the stakes OFF wrote the audit record (${bestOf(save)}) — it must write no rating at all`);
        continue;
      }
      if (g.phase === 'payout' || g.phase === 'bagpush') { push(save, { now: step(9000) }); continue; }
      if (g.phase === 'brief') { brief(save, {}, { now: step(20000) }); continue; }
      if (g.phase === 'getaway') { crack(save, { now: step(25000) }); continue; }
      break;
    }
    assert.ok(targets >= 3, `only ${targets} stakes-off targets were played`);
    assert.equal(state.stateOf(save), null, 'the job did not end, so endJob never ran');
    assert.equal(save.player.rating.n > 0, true, 'the window carries no measurement — the rating below is not a real one');
    const w = earnedOf(save);
    assert.equal(save.player.rating.value, earned, 'endJob recomputed a different rating than the window holds');
    assert.ok(w.capped,
      `this window prints ${save.player.rating.value} against a ceiling of ${w.ceiling} and is not capped — `
      + 'the arm cannot tell detail.value from detail.earned and is vacuous');
    assert.equal(bestOf(save), w.earned,
      `endJob left the audit record at ${bestOf(save)} while the window it wrote EARNS ${w.earned} `
      + `(it printed ${save.player.rating.value} against a ceiling of ${w.ceiling}) — S3.1(c) requires the `
      + 'record at EVERY writer of p.rating.value, and this job had no other writer');
    assert.equal(bestOf(save), Math.min(save.player.rating.value, w.ceiling),
      'the record endJob wrote is not min(value, ceiling) — it is not the number rankFor consumed');
  });

  test('a later job whose rating COLLAPSES cannot move the record down — it is a high-water mark, not a mirror', () => {
    const save = clone(CORPUS[4]);
    const first = traceJob(save, { plan: () => CLEAN, call: () => 85 });          // job A: the rating climbs
    const high = bestOf(save);
    assert.ok(first.seen.length >= 5, `job A staked only ${first.seen.length} targets`);
    assert.ok(high > 5, `job A did not lift the rating above the 5.00 blank-window value (${high})`);

    /* job B, the next day: the same 85 call, every target missed */
    const { seen } = traceJob(save, {
      plan: () => MISS, call: () => 85, now: first.at + DAY_MS, today: addDays(TODAY, 1),
    });
    assert.ok(seen.length >= 5, `job B staked only ${seen.length} targets`);

    let running = high;
    for (const [i, x] of seen.entries()) {
      running = Math.max(running, x.earned);
      assert.equal(x.best, running,
        `target ${i + 1}: a FALLING earned rating (${x.earned}, printed ${x.value}) moved the record to ${x.best} — `
        + 'Math.max became Math.min and the audit record is now a LOW-water mark');
    }
    /* The vacuity guard, on the series the record tracks. Job B's FIRST miss re-weights the window
       and lifts its CEILING with it, so the high-water earned rating moves by a hundredth before the
       collapse starts; every beat after that is a real test of the fall. Both halves are asserted —
       that the record is not being re-set every beat, and that job B did not RISE through it. */
    assert.ok(seen.filter((x) => x.earned < running).length >= seen.length - 1,
      `job B set a new high-water at ${seen.filter((x) => x.earned >= running).length} of its ${seen.length} beats, `
      + 'so nothing here tested a FALL — the arm is vacuous');
    assert.ok(running - high <= 0.01,
      `job B lifted the record from ${high} to ${running} — that is a RISE, and this arm exists to test a FALL`);
    assert.ok(save.player.rating.value < high - 1,
      `job B did not collapse the rating (${save.player.rating.value} against a record of ${high})`);
    assert.ok(bestOf(save) >= high, `endJob lowered the record from ${high} to ${bestOf(save)}`);
    assert.equal(bestOf(save), running, `endJob left the record at ${bestOf(save)}, not at the run's high-water ${running}`);
  });

  test('the Mock is the third writer of the same record: it writes one, and it cannot lower one', async () => {
    /* `screens/mock.js` is another lane's file, but the record is state.js's contract — S3.1(c)
       names all three writers of `p.rating.value`, and the Mock is the one that can RAISE the rank,
       which is exactly when a floored rank has to keep the rating that bought it. Driven through
       the shipped `applyMockCall`; no rating window is built by hand.

       Deliberately says NOTHING about how far a Mock moves the rating: the Mock's WEIGHT is the
       week lane's (`MOCK_CALL_W`, ŝ, the informative gate) and is being re-derived. What is pinned
       here is only the record's own invariant, which holds at `w = 0` as well as at `w = 0.25`:
       whatever rating `applyMockCall` writes, the record beside it is the MAXIMUM of the record it
       found and the rating it wrote. */
    const M = await import('../site/js/screens/mock.js');
    const satPaper = ({ pred, score, at, seed, of = 20 }) => ({
      kind: 'mock', status: 'done', n: of, seed, retry: false, pred, score,
      items: Array.from({ length: of }, (_, i) => ({
        n: i + 1, credit: 0, parts: [{ id: 'a', type: 'text', credit: 0, kind: 'wrong', ok: false }],
      })),
      startedAt: at - 25 * 60_000, submittedAt: at,
    });

    /* (i) a save with no record yet: the Mock writes a rating, so it owes a record beside it */
    const first = fresh(NOW);
    assert.equal(bestOf(first), 0, 'a fresh save already carries a record — (i) does not start from zero');
    const one = M.applyMockCall(first, satPaper({ pred: 88, score: 88, at: NOW, seed: 'bestrating-a' }), { now: NOW });
    assert.ok(one, 'the paper was not eligible — the arm never reached the writer');
    const wrote = first.player.rating.value;
    assert.ok(wrote > 0, `applyMockCall wrote no rating at all (${wrote}) — (i) is vacuous`);
    assert.equal(bestOf(first), wrote,
      `applyMockCall wrote rating ${wrote} and left the audit record at ${bestOf(first)} (S3.1(c): every writer of `
      + 'p.rating.value writes the record)');

    /* (ii) a save whose record is a HIGH-WATER a real job left above its own final rating: a Mock
       recomputes the rating over the same window and must not drag the record down with it */
    const played = clone(CORPUS[3]);
    runJob(played, { plan: (n) => (n >= 5 ? MISS : CLEAN), call: () => 85 });
    const high = bestOf(played);
    assert.ok(high > played.player.rating.value,
      `the job ended at its own high-water mark (${high}) — (ii) cannot tell a maximum from an assignment`);

    const later = NOW + DAY_MS;
    const two = M.applyMockCall(played, satPaper({ pred: 50, score: 50, at: later, seed: 'bestrating-b' }), { now: later });
    assert.ok(two, 'the second paper was not eligible — the Mock never wrote this save');
    assert.ok(played.player.rating.value < high,
      `the Mock lifted the rating to ${played.player.rating.value}, at or above the record ${high} — (ii) is vacuous`);
    assert.equal(bestOf(played), high,
      `a Mock written under a higher record moved it to ${bestOf(played)} — the record is a MAXIMUM, not the last write`);
  });

  test('source: every writer of p.rating.value in state.js keeps the record beside it (a FIFTH writer cannot slip in)', async () => {
    /* Structural, and deliberately the LAST word here rather than the first: the four arms above are
       the behavioural half, and this one only covers what behaviour cannot reach — a writer that does
       not exist yet. S3.1(c) is a per-writer obligation, so a new `p.rating.value = …` added without
       the record beside it is the one way the audit record silently stops being a high-water mark. */
    const { readFileSync } = await import('node:fs');
    const lines = readFileSync(new URL('../site/js/job/state.js', import.meta.url), 'utf8').split('\n');
    const code = (l) => !/^\s*(\*|\/\/)/.test(l);
    const writers = lines
      .map((l, i) => [i + 1, l])
      .filter(([, l]) => /\brating\.value\s*=[^=]/.test(l) && code(l));
    assert.equal(writers.length, 2,
      `state.js has ${writers.length} writers of p.rating.value, not the two S3.1(c) names — the new one needs its own arm above`);
    for (const [n] of writers) {
      const after = lines.slice(n, n + 12).filter(code).join('\n');
      assert.match(after, /\bbestRating = Math\.max\(/,
        `state.js:${n} writes p.rating.value and does not write records.bestRating within 12 lines — `
        + 'S3.1(c): the high-water rating is kept at EVERY writer, or the floored rank stops being recomputable');
    }
  });
});

/* ==========================================================================================
   S5 — the brief window's PUBLISHED refusal codes are the mechanic's contract
   ------------------------------------------------------------------------------------------
   `tests/job-state-r3.test.mjs` pins three of the four (`repress-spent` :203, `repress-lift-first`
   :212, `repress-step` :223) and `press-closed` (:317). `repress-unavailable` — the code that says
   *"you cannot re-press a token you never spent"* — had no pin at all, so the one published refusal
   with no test was also the only one a refactor could delete silently. S5.5 item 4.

   The two residual leaks this file's `pressRefusal` deliberately does NOT close (the informed
   lift-then-place, and the bare redraw) are named in its docblock and closed in `screens/job.js`;
   see designs/REPAIR-DECISION.md S5.2, which forbids closing them here.
   ========================================================================================== */
describe('S5 — `repress-unavailable`: the window cannot re-press a token you never spent', () => {
  test('a brief reached with fewer than GUARD.tokens down refuses the lift, by code', () => {
    const save = clone(CORPUS[8]);
    let t = NOW;
    const step = (ms) => (t += ms);
    startJob(save, { today: TODAY, now: t, shape: 'JOB' });
    /* one token on the board instead of three — legal there ("the board press is free and sealed") */
    press(save, { [WING_IDS[0]]: 1 });
    assert.equal(WING_IDS.reduce((n, w) => n + (state.stateOf(save).tokens[w] ?? 0), 0), 1);
    beginTargets(save, { now: step(6000) });
    for (let i = 0; i < 400; i++) {
      const g = state.stateOf(save);
      if (!g || g.outcome != null || g.phase === 'brief' || g.phase === 'getaway') break;
      if (g.phase === 'envelope') { lockCall(save, 70, { now: step(5000) }); continue; }
      if (g.phase === 'answer') { applyTarget(save, CLEAN, { now: step(40000) }); continue; }
      if (g.phase === 'payout' || g.phase === 'bagpush') { push(save, { now: step(9000) }); continue; }
      break;
    }
    const g = state.stateOf(save);
    assert.equal(g.phase, 'brief', 'the job never reached a brief window — the assertion below is vacuous');
    const down = { ...g.tokens };
    const from = WING_IDS.find((w) => (down[w] ?? 0) > 0);
    assert.ok(from, 'no token is down at all');
    const lift = { ...down, [from]: down[from] - 1 };
    assert.throws(() => press(save, lift),
      (e) => e instanceof JobStateError && e.code === 'repress-unavailable',
      'lifting one of a part-press is not "re-press one token" — it is pressing a token never spent');
    assert.equal(state.canPress(save, lift), false, 'canPress disagrees with the machine it mirrors');
    assert.deepEqual(state.stateOf(save).tokens, down, 'the refused press wrote anyway');
    assert.equal(state.stateOf(save).guard.drawnAt > state.stateOf(save).phaseAt, false,
      'a REFUSED press still redrew the guard — the refusal has to come before the draw');
  });
});
