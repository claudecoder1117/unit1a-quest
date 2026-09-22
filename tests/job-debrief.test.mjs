// tests/job-debrief.test.mjs — J6b: THE DEBRIEF.
//
// COMPOSED-GAME G7 "Today's Page ↔ jobs": *"The Page Summary becomes the debrief (same screen, same
// tile mint, same skill bars, same Readiness delta, plus the bag drop, the rating delta, the guard
// redraw, the regret lines, the split and the decision count)."*  G8's J6b row is the acceptance list
// below, in order.
//
// Two halves, for the same reason J6 has two:
//
//   1. PURE (always runs, no browser, milliseconds) — the realised order, both regret lines against
//      `econ.regretLine` / `call.regretOf`, the decision count and the accumulators, the once-per-job
//      signature, and the structural laws in the source (the mint/bars/Readiness expressions are not
//      reachable from the `ctx.job` branch; the hold is a timing change, never a DOM one).
//
//   2. MEASURED (chromium; SKIPS, never fails, when Playwright or its browsers are absent, the way
//      tests/job-screen.test.mjs does) — the same context rendered twice, once with `ctx.job` and once
//      without, with `.sum-mint` / `.sum-skills` / `.sum-readiness` compared BYTE FOR BYTE; the bag
//      drop measured as the only running animation in the document for its 600 ms; the debrief clicked
//      and focused WHILE it runs; and a `layout-shift` observer over the guard redraw and the Fault
//      Index deltas.
//
// Nothing here re-asserts the mechanics: every number the debrief prints belongs to `js/job/*` and is
// owned by job-econ / job-call / job-guard / job-state.
import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { read, repoPath, stripCommentsAndStrings as strip } from './_helpers.mjs';

import * as run from '../site/js/screens/run.js';
import { finalWordOf } from '../site/js/screens/job.js';
import * as state from '../site/js/job/state.js';
import * as econ from '../site/js/job/econ.js';
import * as call from '../site/js/job/call.js';
import * as guard from '../site/js/job/guard.js';
import * as faultIndex from '../site/js/job/index.js';
import { COPY, ANIMATION, AUTO_BAG } from '../site/data/job.js';
import { fresh } from '../site/js/store.js';
import { applyOutcome, DAY_MS } from '../site/js/schedule.js';
import { todayISO, addDays } from '../site/js/days.js';
import { rngFrom } from '../site/js/rng.js';
import { rarityOf, bestRarity } from '../site/js/rarity.js';
import { cards as ALL_CARDS, byId as cardById } from '../site/data/cards.js';
import { isBonus } from '../site/data/source-manifest.js';

const RUN_SRC = read('site/js/screens/run.js');
const RUN_CODE = strip(RUN_SRC);

const NOW = new Date(2026, 8, 16, 18, 0).getTime();
const TODAY = todayISO(new Date(NOW));
const BANK = ALL_CARDS.filter((c) => !isBonus(c.id));
const clone = (x) => structuredClone(x);

/* ================================================================================================
   A seeded save with real Leitner records, real `history` (so `qHatFor` has something to read) and
   real skills — the same corpus shape tests/job-state.test.mjs uses. No Math.random anywhere.
   ================================================================================================ */

function seededSave(tag) {
  const rng = rngFrom('j6b', tag);
  const s = fresh(NOW - (6 + rng.int(0, 14)) * DAY_MS);
  s.profileId = `j6b-${tag}`;
  s.settings.testDate = addDays(TODAY, 5 + rng.int(0, 8));
  for (let k = 0; k < 44; k++) {
    const c = BANK[rng.int(0, BANK.length - 1)];
    let rec = null;
    for (let r = 0; r < 3; r++) rec = applyOutcome(s, c.id, rng.chance(0.7) ? 'clean' : 'wrong', { now: NOW - (30 - r * 4) * DAY_MS });
    if (!rec) continue;
    rec.cleared = true;
    // bronze/silver, never gold: a clean clear must have somewhere to go, or the mint is vacuous
    rec.rarity = rng.chance(0.5) ? 'bronze' : 'silver';
    rec.due = NOW + (rng.chance(0.7) ? -rng.float(0, 9) : rng.float(0.2, 10)) * DAY_MS;
    rec.history = Array.from({ length: 10 }, (_, h) => ({
      at: NOW - (20 - h) * DAY_MS, ok: rng.chance(0.72), attempt: rng.chance(0.72) ? 1 : 2, hints: 0, ms: 9000,
    }));
  }
  const SKILLS = ['VOC', 'NOTE', 'CLASS', 'ASN-PLP', 'ASN-ANG', 'PAIRS', 'FIG-ALG', 'BISECT-L', 'BISECT-Q',
    'SEG-ALG', 'CSARITH', 'CS-LIN', 'CS-RATIO', 'CS-QUAD', 'SYS', 'FAC1', 'FAC2', 'QUAD-SOLVE', 'QUAD-CTX'];
  for (const k of SKILLS) {
    if (!rng.chance(0.8)) continue;
    s.skills[k] = { m: rng.int(15, 92), n: rng.int(1, 8), lastAt: NOW - rng.int(1, 18) * DAY_MS, lastDueCorrectAt: rng.chance(0.4) ? NOW - DAY_MS : null };
  }
  s.game = { ...(s.game ?? {}), tags: { 'dropped-gcf': { resolved: 1, triggered: 2, days: 1, lastDay: TODAY, cleared: false, sealed: false } } };
  return s;
}

const CLEAN = { cleared: true, firstTry: true, hints: 0, attempt: 1, clean: true };
const HINT1 = { cleared: true, firstTry: true, hints: 1, attempt: 1, clean: false };
const ATT2 = { cleared: true, firstTry: false, hints: 0, attempt: 2, clean: false };
const MISS = { cleared: false, solutionShown: true, reason: 'third-wrong', attempt: 3, hints: 0 };

/**
 * The ONE line of Ledger A a tile mint is: `card.js`'s `rec.rarity = bestRarity(rec.rarity, rarity)`
 * on a clear, and `bestRarity(rec.rarity, 'bronze')` on a reveal. `js/job/state.js` deliberately
 * writes none of Ledger A (G7 prime directive: the game reads that state and prices it), so a
 * headless job moves no tile — and "the mint is byte-identical with the layer off" would be measured
 * on an empty mint, which is no measurement at all.
 *
 * This is NOT a re-implementation of the grade path: `tests/job-ledger.test.mjs` owns that, byte for
 * byte, through the real `card.js` expressions. It is the rarity half alone, so the debrief has a
 * tile to render. Everything else on the save is left exactly as the job left it.
 */
function mintRarity(save, item, result) {
  if (!item || item.kind === 'variant' || !item.id) return;
  const rec = save.cards?.[item.id];
  if (!rec) return;
  const got = result.cleared
    ? (rarityOf({ id: item.id, firstTry: !!result.firstTry, hints: num0(result.hints), attempt: num0(result.attempt) || 1, setupTried: true }) ?? 'bronze')
    : 'bronze';
  rec.rarity = bestRarity(rec.rarity, got);
}
const num0 = (x) => (Number.isFinite(x) ? x : 0);

/**
 * One scripted job, played straight through `js/job/state.js`. Returns everything the debrief needs
 * and everything a caller of `jobSummaryContext` must hold on to across `endJob` (which closes the
 * page and clears `inProgress`): the queue, the before-snapshot and the BAG/PUSH vector.
 */
function playJob(save, {
  plan = () => CLEAN, bagAt = () => false, callOf = () => 70, crackIt = true, walkAt = null,
  shape = 'JOB',
} = {}) {
  let t = NOW;
  const step = (ms) => (t += ms);
  /* `shape` is pinned: `shapeFor` would post a VAULT whenever the seeded save happens to be
     boss-ready, and G1's published decision count (24 mandatory / 35 full use) is the JOB-10 row. */
  state.startJob(save, { today: TODAY, now: t, shape });
  const before = run.captureJobBefore(save);
  const queue = state.queueOf(save).slice();
  state.beginTargets(save, { now: step(6000) });
  const decisions = [];
  let debrief = null;
  for (let i = 0; i < 400 && !debrief; i++) {
    const g = state.stateOf(save);
    if (!g || g.outcome != null) break;
    if (g.phase === 'envelope') {
      if (g.stakes) state.lockCall(save, callOf(state.answered(save) + 1), { now: step(5000) });
      else state.beginAnswer(save, { now: step(1200) });
      continue;
    }
    if (g.phase === 'answer') {
      const n = state.answered(save) + 1;
      if (walkAt != null && n > walkAt) { debrief = state.walk(save, { now: step(3000) }); break; }
      const result = plan(n);
      const item = state.currentItem(save);
      state.applyTarget(save, result, { now: step(40000) });
      mintRarity(save, item, result);           // the study layer's half — see mintRarity's note
      continue;
    }
    if (g.phase === 'payout' || g.phase === 'bagpush') {
      /* The LAST target has no BAG/PUSH beat (G1: "the vault target ends in the getaway, not a
         bag/push"), and `push()` would end the job through `advance()` → `endJob()` → `finishPage`,
         which nulls `inProgress` and takes the debrief with it (notes/J6.md §5.3). So the last beat
         is closed the way `screens/job.js finish()` closes it — through `endJob` directly, keeping
         its return value. This is the real screen's own path, not a test-only shortcut. */
      if (state.targetsLeft(save) === 0) {
        debrief = state.endJob(save, finalWordOf(save), { now: step(9000), day: TODAY });
        break;
      }
      const n = state.answered(save);
      const doBag = g.stakes && bagAt(n, save);
      decisions.push(doBag ? 'bag' : 'push');
      if (doBag) state.bag(save, { now: step(9000) });
      else state.push(save, { now: step(9000) });
      continue;
    }
    if (g.phase === 'brief') { state.brief(save, {}, { now: step(20000) }); continue; }
    if (g.phase === 'getaway') {
      if (crackIt) { state.crack(save, { now: step(25000) }); continue; }
      debrief = state.walk(save, { now: step(25000) });
      break;
    }
    break;
  }
  // a completed job ends inside `push`/`crack`; its debrief is the state's own terminal record
  if (!debrief) debrief = state.debriefOf(save, { outcome: state.stateOf(save)?.outcome ?? null });
  return { debrief, queue, before, decisions, guardWing: debrief?.entry?.guard ?? null };
}

/**
 * The one job every assertion below is measured on: 10 targets, a real mix of rungs, one mid-job bag
 * and a miss deep in the chain — so both regret lines have something to say.
 */
function fixtureJob(tag = 'main') {
  const save = seededSave(tag);
  const played = playJob(save, {
    plan: (n) => (n === 4 ? MISS : n === 6 ? ATT2 : n === 8 ? HINT1 : CLEAN),
    bagAt: (n) => n === 5,
    callOf: (n) => (n % 3 === 0 ? 85 : n % 3 === 1 ? 70 : 50),
  });
  // `endJob` already ran inside `crack()`; re-derive the terminal debrief the screen is handed.
  return { save, ...played };
}

let FIX = null;
before(() => { FIX = fixtureJob('main'); });

/* ================================================================================================
   1. The realised order — the thing both regret lines are computed FROM
   ================================================================================================ */

describe('J6b — the realised order reconstructs the job the student actually played', () => {
  test('every target replays to the realised Δloose at the realised chain', () => {
    const { debrief, queue, decisions, guardWing } = FIX;
    const order = run.realisedOrderOf(debrief, { items: queue, decisions, guardWing });
    assert.equal(order.targets.length, debrief.calls.length, 'one order target per call');

    let chain = 0; let loose = 0;
    order.targets.forEach((t, i) => {
      const s = econ.settle(t, chain, loose);
      const want = debrief.calls[i].d;
      assert.equal(s.delta, want, `target ${i + 1}: replayed Δ ${s.delta} ≠ realised Δ ${want}`);
      loose = s.loose; chain = s.chain;
      if (i < order.targets.length - 1 && decisions[i] === 'bag') { loose = 0; chain = econ.chainAfterBag(); }
    });
  });

  test('playOrder on the realised vector reproduces the job’s own BAGGED', () => {
    const { debrief, queue, decisions, guardWing } = FIX;
    const order = run.realisedOrderOf(debrief, { items: queue, decisions, guardWing });
    const bare = econ.playOrder({ ...order, completion: false, commit: false }, decisions);
    assert.ok(Math.abs(bare - debrief.baseBagged) <= 1, `replay ${bare} vs baseBagged ${debrief.baseBagged}`);
    const withBonus = econ.playOrder(order, decisions);
    assert.ok(Math.abs(withBonus - debrief.finalBagged) <= 2, `replay ${withBonus} vs finalBagged ${debrief.finalBagged}`);
  });

  test('inferDecisions recovers the BAG/PUSH vector nobody recorded', () => {
    const { debrief, queue, guardWing, decisions } = FIX;
    const got = run.inferDecisions(debrief, { items: queue, guardWing });
    assert.equal(got.decisions.length, decisions.length);
    assert.ok(got.candidates >= 1, 'no vector reproduces the realised BAGGED');
    const bare = econ.playOrder({ ...run.realisedOrderOf(debrief, { items: queue, decisions: got.decisions, guardWing }), completion: false, commit: false }, got.decisions);
    assert.ok(Math.abs(bare - got.target) <= 1, `recovered vector replays to ${bare}, not ${got.target}`);
  });

  test('a job played with no bags at all infers all-push', () => {
    const save = seededSave('nobag');
    const { debrief, queue, guardWing } = playJob(save, { plan: () => CLEAN, bagAt: () => false, callOf: () => 70 });
    const got = run.inferDecisions(debrief, { items: queue, guardWing });
    assert.deepEqual(got.decisions, got.decisions.map(() => 'push'));
  });
});

/* ================================================================================================
   2. Both regret lines — `econ.regretLine` and `call.regretOf`, for the REALISED order
   ================================================================================================ */

describe('J6b — both regret lines equal the solver’s value for the realised order (G5 #2)', () => {
  test('the BAG/PUSH line is econ.regretLine(order).line, verbatim', () => {
    const { debrief, queue, decisions, guardWing, save } = FIX;
    const qHatOf = (c) => (c?.skill ? call.qHatFor(save, c.skill, { cards: cardById }) : null);
    const order = run.realisedOrderOf(debrief, { items: queue, decisions, guardWing, qHatOf });
    const expect = econ.regretLine(order);
    const got = run.jobRegret(debrief, { items: queue, decisions, guardWing, qHatOf });
    assert.equal(got.bagpush.line, expect.line);
    assert.equal(got.bagpush.cost, expect.cost);
    assert.equal(got.bagpush.at, expect.at);
    if (expect.line) assert.match(got.bagpush.line, /^you (bagged|pushed) at chain \d+; the threshold said (bag|push) \(q\* [\d.]+, your q̂ [\d.—]+\)\. cost \d+\.$/);
  });

  /* r3 — this test used to pin `{best:'carry', cost:'rating'}` and `evMax === argmaxCall`: the rung
     from one ladder, the price from the other. Inside G3.1's published disagreement bands that pair
     prints a rung that LOSES the credit it is charging for (q̂ = 0.885 → named 95, E[c] 5.760, against
     85's 5.880). The line now runs on ONE ladder, through `call.regretOf`, and the assertion is the
     invariant that was missing rather than the constant that was wrong: the rung named must be the
     argmax of the ladder the printed cost is denominated in. Walked across both bands in
     tests/run-lane-r3.test.mjs. */
  test('the CALL line names the maximiser of the ladder it prices, and prices it in rating credit', () => {
    const { debrief, queue, decisions, guardWing, save } = FIX;
    const qHatOf = (c) => (c?.skill ? call.qHatFor(save, c.skill, { cards: cardById }) : null);
    const got = run.jobRegret(debrief, { items: queue, decisions, guardWing, qHatOf });
    assert.deepEqual(run.DEBRIEF_CALL_LADDER, { best: 'rating', cost: 'rating' });
    if (!got.call.line) { assert.equal(got.call.cost, 0); return; }
    const q = got.call.q;
    assert.equal(got.call.evMax, call.honestCall(q), 'the rung named is not the maximiser of the printed currency');
    const want = call.expectedCredit(got.call.evMax / 100, q) - call.expectedCredit(got.call.called / 100, q);
    assert.ok(Math.abs(got.call.cost - want) < 1e-12);
    assert.deepEqual(
      { best: got.call.evMax, cost: got.call.cost },
      { best: call.regretOf({ call: got.call.called, qHat: q, ladder: 'rating' }).best,
        cost: call.regretOf({ call: got.call.called, qHat: q, ladder: 'rating' }).cost },
      'the screen must not hand-roll what call.regretOf already computes',
    );
    assert.equal(got.call.line, COPY.regret2({
      envelope: got.call.envelope, called: got.call.called, evMax: got.call.evMax,
      cost: (Math.round(got.call.cost * 10) / 10).toFixed(1),
    }));
  });

  test('G5 #2’s own worked line reproduces: called 85 at q̂ .75 → EV-max 70, cost 0.3 rating', () => {
    const q = 0.75;
    assert.equal(call.argmaxCall(q), 70);
    const cost = call.expectedCredit(0.70, q) - call.expectedCredit(0.85, q);
    assert.equal(Math.round(cost * 10) / 10, 0.3);
    /* r3 — and it reproduces through the ladder the screen SHIPS, which is the half J6b's note got
       wrong: the two ladders agree at q̂ = .75, so the rating-consistent pair prints the same rung
       AND the 0.3 the sentence denominates in rating. The carry pair prints 0.05 loot for it. */
    assert.equal(call.honestCall(q), 70, 'the rating ladder names the same rung at the worked q̂');
    const shipped = call.regretOf({ call: 85, qHat: q, ladder: run.DEBRIEF_CALL_LADDER.best });
    assert.equal(shipped.best, 70);
    assert.equal(Math.round(shipped.cost * 10) / 10, 0.3);
    assert.equal(COPY.regret2({ envelope: 6, called: 85, evMax: shipped.best, cost: (Math.round(shipped.cost * 10) / 10).toFixed(1) }),
      'envelope 6: you called 85, EV-max was 70. cost 0.3 rating.');
  });

  test('played optimally there is no BAG/PUSH regret line at all', () => {
    const { debrief, queue, guardWing } = FIX;
    const order = run.realisedOrderOf(debrief, { items: queue, guardWing, decisions: [] });
    const best = econ.optimalOrder(order).decisions;
    const perfect = run.jobRegret(debrief, { order: { ...run.realisedOrderOf(debrief, { items: queue, guardWing, decisions: best }), decisions: best } });
    assert.equal(perfect.bagpush.cost <= 1e-9, true, `optimal play still shows cost ${perfect.bagpush.cost}`);
    assert.equal(perfect.bagpush.line, '');
  });
});

/* ================================================================================================
   3. The split, the decision count, the two accumulators — G1's "reframe"
   ================================================================================================ */

describe('J6b — the split, the decision count and both accumulators are the job’s own numbers', () => {
  test('the debrief object carries both accumulators and their split', () => {
    const { debrief } = FIX;
    assert.ok(debrief.tGame > 0 && debrief.tAnswer > 0, 'both accumulators must have run');
    assert.equal(debrief.wall, debrief.tGame + debrief.tAnswer);
    assert.ok(Math.abs(debrief.split - debrief.tGame / debrief.wall) < 1e-12);
  });

  test('the published decision count for the JOB shape is 24 mandatory / 35 full use', () => {
    const d = econ.decisionCount('JOB');
    assert.equal(d.mandatory, 24);
    assert.equal(d.full, 35);
  });

  test('the measured decision count is G1’s own arithmetic on the realised job', () => {
    const { debrief } = FIX;
    const calls = debrief.calls.length;
    const want = 1 + 1 + calls + Math.max(0, calls - 1) + debrief.briefs.length + 1 + debrief.backchecks;
    assert.equal(debrief.decisions, want);
    assert.ok(Math.abs(debrief.perItem - debrief.decisions / calls) < 1e-12);
    assert.ok(debrief.perItem >= 2, `decision density ${debrief.perItem} < 2 per graded item`);
  });

  /* G5 #4: "your rating is live … it can go down, which is what makes it worth something." It cannot
     say anything if the delta is structurally zero, which `endJob`'s own `ratingBefore` USED to be:
     `applyTarget` rewrites `player.rating.value` on every staked target, so `endJob` read the value
     the job had already produced and the delta was always +0.00. J6b shipped this as a tripwire and
     a Request (R2); integration took it — `startJob` snapshots the pre-first-call rating into
     `inProgress.game.rating0` (it survives a reload) and `endJob` reports that. The debrief's own
     before-snapshot is now a SECOND reading of the same number, and this test holds the two equal. */
  /* notes/J6.md §5.3 and notes/J6b.md R3, taken at integration: the screen READS the debrief off
     `push()`/`bag()` instead of re-deriving `advance()`'s terminal word. The behaviour itself is
     asserted in `tests/job-state.test.mjs`; this is the caller half. */
  test('the screen reads the debrief off push()/bag() rather than re-deriving the terminal word', () => {
    const job = read('site/js/screens/job.js');
    assert.match(job, /if \(r\?\.debrief\) debrief = r\.debrief;/, 'continueBeat must read push()\'s debrief');
    assert.match(job, /if \(r\.debrief\) debrief = r\.debrief;/, 'doBag must read bag()\'s debrief');
  });

  test('the rating delta is the real one — endJob’s ratingBefore is the pre-first-call rating', () => {
    const { debrief, before } = FIX;
    assert.ok(Number.isFinite(before.rating), 'captureJobBefore must snapshot the pre-first-call rating');
    assert.ok(Math.abs(num(debrief.ratingAfter) - before.rating) > 1e-9,
      `the fixture must move the rating, or the assertion is vacuous (before ${before.rating}, after ${debrief.ratingAfter})`);
    assert.ok(Math.abs(num(debrief.ratingBefore) - before.rating) < 1e-9,
      `endJob reported ratingBefore ${debrief.ratingBefore}, the snapshot says ${before.rating}`);
    assert.ok(Math.abs(num(debrief.ratingAfter) - num(debrief.ratingBefore)) > 1e-9,
      'the delta is structurally zero again — endJob is reading the live rating, not game.rating0');
  });
});

const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);

/* ================================================================================================
   4. The context builder and the once-per-job guard
   ================================================================================================ */

describe('J6b — jobSummaryContext is a Page Summary context with `job` on it', () => {
  test('it carries exactly the keys renderSummary destructures, plus job/jobOpts', () => {
    const { save, debrief, queue, before, decisions } = FIX;
    const ctx = run.jobSummaryContext(save, debrief, { queue, before, decisions });
    for (const k of ['kind', 'run', 'results', 'sum', 'before', 'after', 'tilesBefore', 'tilesAfter', 'outcome', 'save', 'elapsedMs', 'job', 'jobOpts']) {
      assert.ok(k in ctx, `missing ${k}`);
    }
    assert.equal(ctx.kind, 'job');
    assert.equal(ctx.job, debrief);
    assert.equal(ctx.before, before);
    assert.ok(Array.isArray(ctx.results));
    assert.ok(ctx.sum.count >= 1, 'the job’s graded results must reach the Summary');
  });

  test('captureJobBefore is idempotent and lands where pageBefore reads it', () => {
    const save = seededSave('before');
    state.startJob(save, { today: TODAY, now: NOW });
    const a = run.captureJobBefore(save);
    const b = run.captureJobBefore(save);
    assert.equal(a, b, 'a second capture must not overwrite the first');
    assert.deepEqual(run.pageBefore(save.inProgress), a);
    assert.ok(Array.isArray(a.skills) && a.readiness && a.tiles, 'pageBefore’s own three validators');
    assert.ok(Array.isArray(a.tags) && a.index, 'the game’s two extra keys');
  });

  test('the once-per-job signature changes with the job and not with a re-render', () => {
    const { debrief } = FIX;
    assert.equal(run.jobSignature(debrief), run.jobSignature(debrief));
    assert.notEqual(run.jobSignature(debrief), run.jobSignature({ ...debrief, finalBagged: debrief.finalBagged + 1 }));
    assert.notEqual(run.jobSignature(debrief), run.jobSignature({ ...debrief, outcome: 'walked' }));
  });

  test('bagDropMs is data/job.js’s own 600 ms budget', () => {
    assert.equal(run.bagDropMs(), ANIMATION.bagDrop.ms);
    assert.equal(ANIMATION.bagDrop.ms, 600);
    assert.equal(ANIMATION.bagDrop.fullScreen, false);
    assert.equal(ANIMATION.bagDrop.oncePerJob, true);
    assert.equal(ANIMATION.reducedMotionMs, 0);
  });
});

/* ================================================================================================
   5. The structural laws, in the source
   ================================================================================================ */

describe('J6b — the laws that must stay structural', () => {
  test('there is exactly ONE renderSummary, and renderJobSummary delegates to it', () => {
    assert.equal((RUN_CODE.match(/function renderSummary\s*\(/g) ?? []).length, 1, 'a second summary renderer would be a second source of truth');
    assert.match(RUN_CODE, /export function renderJobSummary\s*\(host,\s*ctx\)\s*\{\s*return renderSummary\(host,\s*ctx\);/);
  });

  test('the mint, the skill bars and the Readiness block are built outside every `job` branch', () => {
    // The three expressions must not read `job` at all: that is what makes byte-identity structural.
    // The section delimiters are COMMENTS, so the slice is taken on the raw source and stripped
    // afterwards — a prose "job" in a comment must not fail a law about code.
    const grab = (start, end) => {
      const i = RUN_SRC.indexOf(start);
      const j = RUN_SRC.indexOf(end, i);
      assert.ok(i > 0 && j > i, `cannot find ${start} … ${end}`);
      return strip(RUN_SRC.slice(i, j));
    };
    const mint = grab('const mintWrap =', '/* skill bars');
    const bars = grab('const skillWrap =', '/* Readiness */');
    const rd = grab('const rd = h(', '/* mode-specific verdict');
    for (const [name, src] of [['mint', mint], ['skill bars', bars], ['Readiness', rd]]) {
      assert.ok(!/\bjob\b/.test(src), `the ${name} block reads \`job\` — byte-identity is no longer structural`);
      /* `hold` may appear ONLY as the delay argument of `afterHold(hold, …)`. That is the whole
         permitted reach of the hold: acceptance #1 ("the bag drop is the only element animating while
         it runs") requires these cues to START later, and byte-identity is about the markup they
         build, which `afterHold` does not touch. A `hold` anywhere else would be a branch — a second
         shape for the same block — and that is what this law forbids. */
      const holds = (src.match(/\bhold\b/g) ?? []).length;
      const delays = (src.match(/afterHold\(hold,/g) ?? []).length;
      assert.equal(holds, delays,
        `the ${name} block reads \`hold\` outside \`afterHold(hold, …)\` — the hold must be a timing change only`);
      assert.ok(!/\bhold\b\s*(\?|&&|\|\||===|!==|>|<)/.test(src),
        `the ${name} block BRANCHES on \`hold\` — the hold may delay a cue, never change what is built`);
    }
  });

  test('the bag drop is transform/opacity only, ≤ 600 ms, and never full-screen', () => {
    const i = RUN_CODE.indexOf('export function startBagDrop');
    const src = RUN_CODE.slice(i, RUN_CODE.indexOf('function holdEverythingElse', i));
    assert.ok(/transform:\s*`translateY/.test(RUN_SRC.slice(RUN_SRC.indexOf('export function startBagDrop'))), 'the keyframe must be a translate');
    assert.ok(!/position:\s*['"]?fixed/.test(src), 'nothing on this screen may be position: fixed (G12 #32)');
    assert.ok(/JOB_ANIMATION\.bagDrop\.staggerMs/.test(src) && /JOB_ANIMATION\.bagDrop\.translate/.test(src),
      'the stagger and the translate must be read from data/job.js, not re-typed');
    assert.ok(/Math\.max\(120,\s*ms\s*-\s*stagger/.test(src), 'the last digit must land ON the budget, not after it');
  });

  test('the hold pauses everything else and exempts only the header’s half of the same cue', () => {
    const i = RUN_CODE.indexOf('function holdEverythingElse');
    const j = RUN_CODE.indexOf('export default mountRun', i);
    assert.ok(i > 0 && j > i, 'holdEverythingElse must sit between the debrief block and the mount');
    const src = RUN_CODE.slice(i, j);
    assert.match(src, /getAnimations\(\{\s*subtree:\s*true\s*\}\)/);
    assert.match(src, /a\.pause\(\)/);
    assert.match(src, /setTimeout\(resume, ms\)/);
    // the exemption selector is a string literal, so it is read off the raw source
    const rawI = RUN_SRC.indexOf('function holdEverythingElse');
    const raw = RUN_SRC.slice(rawI, RUN_SRC.indexOf('export default mountRun', rawI));
    assert.match(raw, /closest\?\.\('\[data-drop\]'\)/, 'only the header’s half of the same cue may be exempt');
  });

  test('the debrief is the one surface allowed to name a maximiser rung — and job.js still is not', () => {
    /* r3 — Global law 6 is a restriction on PRE-call surfaces plus a permission for this one; it does
       not require the debrief to name the CARRY argmax specifically, and naming it while pricing the
       other ladder is what made the line teach a loss (see DEBRIEF_CALL_LADDER). What the law needs
       from this file is that the rung it prints is computed after the decision, by the call module,
       on the ladder it prices — which is `call.regretOf`, and it is reached from `jobRegret`. */
    assert.ok(/regretOf\(\{/.test(RUN_CODE), 'the debrief must name a maximiser (evidence AFTER the decision)');
    assert.ok(/ladder: DEBRIEF_CALL_LADDER\.best/.test(RUN_CODE), 'and it must be the declared ladder’s');
    assert.ok(!/argmaxCall|expectedCredit/.test(RUN_CODE.slice(RUN_CODE.indexOf('export function jobRegret'), RUN_CODE.indexOf('export function captureJobBefore'))),
      'jobRegret must not hand-roll the pair call.regretOf owns');
    const jobJs = strip(read('site/js/screens/job.js'));
    for (const needle of ['argmaxCall', 'evTable', 'evMaxBands', 'EV-max']) {
      assert.ok(!jobJs.includes(needle), `screens/job.js must not reference ${needle}`);
    }
  });

  test('every printed sentence of the debrief is a data/job.js COPY template', () => {
    // `=== J6b ===` is a comment banner, so the block is anchored on the first CODE the ticket added.
    const i = RUN_CODE.indexOf('export const DEBRIEF_CALL_LADDER');
    assert.ok(i > 0, 'the J6b block must start at DEBRIEF_CALL_LADDER');
    const block = RUN_CODE.slice(i);
    for (const k of ['walk', 'regret2', 'ratingLine', 'leftOnPage', 'deflation', 'sealed']) {
      assert.ok(block.includes(`JOB_COPY.${k}`), `COPY.${k} is not printed`);
    }
    assert.equal(econ.regretLine({ targets: [] }).line, '', 'COPY.regret is econ’s to render');
  });

  test('no Math.random anywhere in run.js (the layer’s standing rule)', () => {
    assert.ok(!/Math\.random/.test(RUN_CODE));
  });

  test('the auto-bank rate the fee line names is data/job.js’s, not a literal', () => {
    // the rate is interpolated INTO the sentence, and `strip()` does not re-enter `${}` — so the
    // needle is read off the raw source, where the template literal still has its expression.
    const i = RUN_SRC.indexOf('const feeNode =');
    assert.ok(i > 0, 'the take block must build its fee line in one place');
    const src = RUN_SRC.slice(i, i + 400);
    assert.match(src, /JOB_AUTO_BAG\.walk/);
    assert.ok(!/\b0\.5\b|\b50\s*%/.test(src), 'the auto-bank rate must not be re-typed as a literal');
    assert.equal(AUTO_BAG.walk, 0.5);
  });
});

/* ================================================================================================
   6. MEASURED — chromium. Skips (never fails) without Playwright or its browsers.
   ================================================================================================ */

const require = createRequire(import.meta.url);
let playwright = null;
try { playwright = require(repoPath('qa', 'node_modules', 'playwright')); } catch { playwright = null; }
const BROWSER_OK = !!playwright && (() => {
  try { return !!playwright.chromium.executablePath() && existsSync(playwright.chromium.executablePath()); } catch { return false; }
})();
const SKIP = BROWSER_OK ? false : 'no Playwright browser installed — run `npx playwright install chromium` under qa/';

const SITE = repoPath('site');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

/* The probe is the REAL shell — `site/index.html` with three extra hosts — so the debrief is measured
   inside the document it actually ships in (theme applied, header present, the same stylesheets in the
   same order) rather than in a stripped page where "nothing else animates" would be free. */
const PROBE_HTML = read('site/index.html').replace(
  '</body>',
  '  <main id="host"></main>\n  <main id="host2"></main>\n  <main id="host3"></main>\n</body>',
);

let server = null; let browser = null; let page = null; let BASE = '';

describe('J6b — MEASURED (chromium)', { skip: SKIP }, () => {
  before(async () => {
    server = createServer(async (req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p === '/' || p === '/__j6b') { res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }); res.end(PROBE_HTML); return; }
      const f = path.join(SITE, p);
      try {
        const st = await stat(f); if (!st.isFile()) throw new Error('dir');
        res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(await readFile(f));
      } catch { res.writeHead(404); res.end('nf ' + p); }
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    BASE = `http://127.0.0.1:${server.address().port}/`;
    browser = await playwright.chromium.launch();
    page = await browser.newPage({ viewport: { width: 900, height: 1200 }, reducedMotion: 'no-preference' });
    await page.goto(`${BASE}__j6b#/settings`, { waitUntil: 'load' });
    await page.waitForTimeout(400);                 // let the shell's own mount cue finish
    await page.evaluate(async ({ save, debrief, queue, before, decisions }) => {
      const run = await import('/js/screens/run.js');
      window.__run = run;
      window.__fix = { save, debrief, queue, before, decisions };
      window.__ctx = run.jobSummaryContext(save, debrief, { queue, before, decisions });
    }, { save: FIX.save, debrief: FIX.debrief, queue: FIX.queue, before: FIX.before, decisions: FIX.decisions });
  }, { timeout: 180000 });

  after(async () => {
    try { await browser?.close(); } catch { /* gone */ }
    try { server?.close(); } catch { /* gone */ }
  });

  test('the tile mint, the skill bars and the Readiness delta are BYTE-IDENTICAL with the layer off', async () => {
    const got = await page.evaluate(() => {
      const run = window.__run; const ctx = window.__ctx;
      const host = document.getElementById('host');
      const host2 = document.getElementById('host2');
      const host3 = document.getElementById('host3');
      run.renderJobSummary(host, ctx);                                   // the debrief
      run.renderJobSummary(host2, { ...ctx, job: null });                // the flat Page Summary, same ctx
      run.renderJobSummary(host3, { ...ctx, job: null, kind: 'page' });  // …and as a real Page
      const pick = (root, sel) => root.querySelector(sel)?.outerHTML ?? null;
      const three = ['.sum-mint', '.sum-skills', '.sum-readiness'];
      return {
        a: three.map((s) => pick(host, s)),
        b: three.map((s) => pick(host2, s)),
        c: three.map((s) => pick(host3, s)),
        mintCount: host.querySelectorAll('.sum-tile').length,
        barCount: host.querySelectorAll('.sum-bar').length,
        rdText: host.querySelector('.sum-rd-line')?.textContent ?? '',
      };
    });
    assert.ok(got.a[2], 'the Readiness block must render on the debrief');
    assert.ok(got.mintCount >= 1, 'the fixture must mint at least one tile, or this assertion is vacuous');
    assert.ok(got.barCount >= 1, 'the fixture must move at least one skill bar, or this assertion is vacuous');
    for (let i = 0; i < 3; i++) {
      assert.equal(got.a[i], got.b[i], `${['mint', 'skills', 'readiness'][i]} differs from the flat path`);
      assert.equal(got.a[i], got.c[i], `${['mint', 'skills', 'readiness'][i]} differs from a kind:'page' Summary`);
    }
    assert.match(got.rdText, /\d+→\d+/, 'the Readiness delta must print from → to');
  });

  test('the bag drop plays ONCE per job and is the only element animating while it runs', async () => {
    const got = await page.evaluate(async () => {
      const run = window.__run; const ctx = window.__ctx;
      const host = document.getElementById('host');
      delete host.dataset.bagDrop;
      host.replaceChildren();
      run.renderJobSummary(host, ctx);
      const root = host.querySelector('.run-summary');
      const box = root.querySelector('.sum-bag-digits');
      const digits = box ? box.querySelectorAll('.sum-bag-digit').length : 0;
      await new Promise((r) => setTimeout(r, 250));
      const running = document.getAnimations().filter((a) => a.playState === 'running');
      const outside = running.filter((a) => !(a.effect?.target?.closest?.('.sum-bag-digits')));
      const paused = document.getAnimations().filter((a) => a.playState === 'paused').length;
      const again = run.startBagDrop(root, ctx.job);               // a second call must be a no-op
      await new Promise((r) => setTimeout(r, 700));
      const later = document.getAnimations().filter((a) => a.playState === 'running' && !(a.effect?.target?.closest?.('.sum-bag-digits'))).length;
      const stillPaused = document.getAnimations().filter((a) => a.playState === 'paused').length;
      return {
        digits, runningInDrop: running.length - outside.length,
        outside: outside.map((a) => a.effect?.target?.className ?? '?'),
        paused, again: again.animations.length, later, stillPaused,
        /* Scoped to the rendered debrief. The body-wide law ("no `position: fixed` element on body
           during a job") is J12's, in `job-juice.test.mjs`; here the probe's own shell route owns a
           zero-size `.set-msg` status element, which is the app's, not this ticket's. What J6b must
           prove is that the DEBRIEF adds none — the bag drop is a transform in the take block, never
           an overlay (G10 #13, G12 #32). */
        fixedInDebrief: [...host.querySelectorAll('*')].filter((el) => getComputedStyle(el).position === 'fixed').length,
      };
    });
    assert.ok(got.digits > 0, 'the BAGGED numerals must be split into per-column glyphs');
    assert.equal(got.runningInDrop, got.digits, `all ${got.digits} digit animations must be running at t=250 ms`);
    assert.deepEqual(got.outside, [], `something else animated during the bag drop: ${got.outside.join(', ')}`);
    assert.ok(got.paused >= 1, 'the summary’s own cues must actually be held (the tile flip at minimum)');
    assert.equal(got.again, 0, 'the bag drop played twice for one job');
    assert.equal(got.stillPaused, 0, 'the held animations were never resumed');
    assert.equal(got.fixedInDebrief, 0, 'no position: fixed element in the debrief — the tile mint stays the only full-screen moment');
  });

  test('the debrief stays interactive during the bag drop', async () => {
    const got = await page.evaluate(async () => {
      const run = window.__run; const ctx = window.__ctx;
      const host = document.getElementById('host');
      delete host.dataset.bagDrop;
      host.replaceChildren();
      run.renderJobSummary(host, ctx);
      const root = host.querySelector('.run-summary');
      let hit = null;
      root.addEventListener('click', (e) => { hit = e.target.closest('a,button')?.textContent ?? null; e.preventDefault(); }, true);
      await new Promise((r) => setTimeout(r, 180));              // mid-drop
      const btn = root.querySelector('.run-actions .btn-primary');
      /* `elementFromPoint` reads the VISUAL viewport, and a summary with nine minted tiles is taller
         than it — off-screen would read as "covered" and the test would pass for the wrong reason.
         Scrolling is synchronous and does not touch the running drop. */
      btn.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = btn.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      btn.focus();
      const focused = document.activeElement === btn;
      btn.click();
      const dropStillRunning = document.getAnimations().some((a) => a.playState === 'running' && a.effect?.target?.closest?.('.sum-bag-digits'));
      return { hit, focused, covered: !btn.contains(top) && top !== btn, dropStillRunning, label: btn.textContent };
    });
    assert.equal(got.covered, false, 'the primary button is covered by something during the drop');
    assert.equal(got.focused, true, 'focus could not be moved during the drop');
    assert.equal(got.hit, got.label, 'the click did not reach the control during the drop');
    assert.equal(got.dropStillRunning, true, 'the drop had already finished — the measurement was vacuous');
    assert.equal(got.label, 'Home', 'G6: the debrief’s primary button is Home');
  });

  test('the Fault Index deltas and the guard redraw render with NO layout shift', async () => {
    const got = await page.evaluate(async () => {
      const run = window.__run; const ctx = window.__ctx;
      const host = document.getElementById('host');
      delete host.dataset.bagDrop;
      host.replaceChildren();
      const shifts = [];
      const po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) shifts.push(e);
      });
      po.observe({ type: 'layout-shift', buffered: false });
      run.renderJobSummary(host, ctx);
      const root = host.querySelector('.run-summary');
      await new Promise((r) => setTimeout(r, 1600));             // the drop, the release, the redraw
      po.disconnect();
      const inLedger = shifts.filter((e) => (e.sources ?? []).some((s) => s.node && root.querySelector('.sum-job-ledger')?.contains(s.node)));
      const scoreLedger = inLedger.reduce((t, e) => t + e.value, 0);
      const total = shifts.reduce((t, e) => t + e.value, 0);
      const bars = [...root.querySelectorAll('.sum-guard-bar')];
      const heights = bars.map((b) => Math.round(b.getBoundingClientRect().height));
      return {
        scoreLedger, total, bars: bars.length, heights,
        drawn: root.querySelector('.sum-guard-bar[data-drawn="true"]')?.dataset.wing ?? null,
        pcts: [...root.querySelectorAll('.sum-guard-pct')].map((n) => n.textContent),
        indexFacts: [...root.querySelectorAll('.sum-index-facts .sum-fact')].map((n) => n.textContent),
      };
    });
    assert.equal(got.scoreLedger, 0, `the guard/Fault Index block shifted (CLS ${got.scoreLedger})`);
    assert.ok(got.bars >= 2, 'the guard must redraw its bars');
    assert.equal(new Set(got.heights).size, 1, 'the guard bars must all be laid out at the same height');
    assert.equal(got.pcts.length, got.bars);
    assert.ok(got.pcts.every((s) => /^\d+ %$/.test(s)), `printed percentages: ${got.pcts.join(' ')}`);
    assert.equal(got.indexFacts.length, 3, 'Sealed / Live / Resolutions');
    // `deltaText` renders a fall with an ASCII hyphen (`-3`) and a flat delta as `±0`, so all three
    // signs are accepted — a save whose Fault Index went DOWN must not make this test flake.
    assert.ok(got.indexFacts.every((s) => /(?:[+\-−]\d+|±0)/.test(s)), `the Fault Index deltas must print: ${got.indexFacts.join(' | ')}`);
  });

  test('the split, the decision count and both accumulators print', async () => {
    const got = await page.evaluate(() => {
      const run = window.__run; const ctx = window.__ctx;
      const host = document.getElementById('host');
      delete host.dataset.bagDrop;
      host.replaceChildren();
      run.renderJobSummary(host, ctx);
      const root = host.querySelector('.run-summary');
      const facts = [...root.querySelectorAll('.sum-job-facts .sum-fact')].map((n) => n.textContent);
      return {
        facts,
        walk: root.querySelector('.sum-job-walk')?.textContent ?? '',
        rating: root.querySelector('.sum-job-rating')?.textContent ?? '',
        deflation: root.querySelector('.sum-job-deflation')?.textContent ?? '',
        regret: [...root.querySelectorAll('.sum-regret-line')].map((n) => ({ kind: n.dataset.kind, text: n.textContent })),
        bagged: root.querySelector('.sum-bag-n')?.textContent ?? '',
        fee: root.querySelector('.sum-bag-fee')?.outerHTML ?? '',
        title: root.querySelector('.sum-head h1')?.textContent ?? '',
      };
    });
    const d = FIX.debrief;
    const split = `${Math.round(d.split * 100)} %`;
    assert.ok(got.facts.some((s) => s.includes(split)), `the split ${split} is not printed: ${got.facts.join(' | ')}`);
    assert.ok(got.facts.some((s) => s.includes('24 mandatory / 35 full use')), `the published decision count is not printed: ${got.facts.join(' | ')}`);
    assert.ok(got.facts.some((s) => s.includes(String(d.decisions))), 'the measured decision count is not printed');
    const mmss = (ms) => `${Math.floor(Math.round(ms / 1000) / 60)}:${String(Math.round(ms / 1000) % 60).padStart(2, '0')}`;
    assert.ok(got.walk.includes(`${mmss(d.tAnswer)} thinking`), `tAnswer not printed: ${got.walk}`);
    assert.ok(got.walk.includes(`${mmss(d.tGame)} deciding`), `tGame not printed: ${got.walk}`);
    assert.ok(got.facts.some((s) => s.includes(mmss(d.tGame)) && s.includes(mmss(d.tAnswer))), 'both accumulators must print together');
    assert.match(got.rating, /^rating \d+\.\d\d · \d+\/50 informative calls$/);
    /* the rating delta is the MEASURED move from the pre-first-call snapshot — which `endJob`'s own
       `ratingAfter − ratingBefore` now equals too, since `game.rating0` landed (see the pure test) */
    const moved = Number(d.ratingAfter) - Number(FIX.before.rating);
    const sign = moved >= 0 ? '+' : '−';
    const printed = `${sign}${Math.abs(moved).toFixed(2)}`;
    assert.ok(got.facts.some((s) => s.includes(printed)), `the rating delta ${printed} is not printed: ${got.facts.join(' | ')}`);
    assert.ok(!got.facts.some((s) => s.includes('+0.00')), 'a rating delta that is always +0.00 is not information (G5 #4)');
    assert.equal(got.deflation, COPY.deflation());
    assert.equal(got.bagged, String(econ.round(d.finalBagged)));
    assert.match(got.fee, /^<s /, 'the getaway bag is free, so the fee line is struck through');
    assert.equal(got.title, 'Vault cracked');

    const expected = run.jobRegret(d, {
      items: FIX.queue, decisions: FIX.decisions, guardWing: FIX.guardWing,
      qHatOf: (c) => (c?.skill ? call.qHatFor(FIX.save, c.skill, { cards: cardById }) : null),
    });
    const byKind = Object.fromEntries(got.regret.map((r) => [r.kind, r.text]));
    if (expected.bagpush.line) assert.equal(byKind.bagpush, expected.bagpush.line);
    if (expected.call.line) assert.equal(byKind.call, expected.call.line);
    assert.ok(got.regret.length >= 1, 'at least one regret line must print for this fixture');
  });

  /**
   * The control is the FLAT Page Summary rendered from the same context with `job: null`. That is the
   * only honest reading of "the layer adds no motion": `css/base.css` zeroes every duration under
   * `prefers-reduced-motion` but does not remove the animation objects, and T11's `.tile-sheen` cue on
   * a minted tile still reports `running` for a frame or two — on the flat path just as much as on the
   * debrief. Asserting `getAnimations().length === 0` over the whole document would therefore be a
   * test of T11's tiles, which J6b must leave byte-identical (acceptance #4), not of this ticket.
   */
  test('prefers-reduced-motion: the layer adds no motion, and every number is already final', async () => {
    const p2 = await browser.newPage({ viewport: { width: 420, height: 900 }, reducedMotion: 'reduce' });
    try {
      await p2.goto(`${BASE}__j6b`, { waitUntil: 'load' });
      const got = await p2.evaluate(async (fix) => {
        const run = await import('/js/screens/run.js');
        const ctx = run.jobSummaryContext(fix.save, fix.debrief, { queue: fix.queue, before: fix.before, decisions: fix.decisions });
        const host = document.getElementById('host');
        const host2 = document.getElementById('host2');
        run.renderJobSummary(host, ctx);                                    // the debrief
        run.renderJobSummary(host2, { ...ctx, job: null, kind: 'page' });   // the control
        await new Promise((r) => setTimeout(r, 60));
        const root = host.querySelector('.run-summary');
        const names = (el) => document.getAnimations()
          .filter((a) => a.playState === 'running' && el.contains(a.effect?.target))
          .map((a) => a.animationName || a.transitionProperty || '?').sort();
        return {
          hold: run.bagDropMs(),
          debrief: names(host), flat: names(host2),
          drop: document.getAnimations().filter((a) => a.effect?.target?.closest?.('.sum-bag-digits')).length,
          bagged: root.querySelector('.sum-bag-n')?.textContent ?? '',
          digits: root.querySelector('.sum-bag-digits')?.textContent ?? '',
          scrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      }, { save: FIX.save, debrief: FIX.debrief, queue: FIX.queue, before: FIX.before, decisions: FIX.decisions });
      assert.equal(got.hold, 0, 'reduced motion must zero the bag drop');
      assert.equal(got.drop, 0, 'the bag drop must not play at all under prefers-reduced-motion');
      assert.deepEqual(got.debrief, got.flat,
        `the layer added motion the flat Page Summary does not have: ${got.debrief.join(', ')} vs ${got.flat.join(', ')}`);
      assert.equal(got.digits, got.bagged, 'the numerals are already in place');
      assert.ok(got.scrollX <= 0, `the debrief scrolls horizontally at 420 px (${got.scrollX} px)`);
    } finally { await p2.close(); }
  });
});
