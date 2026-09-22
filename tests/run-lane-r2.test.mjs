// tests/run-lane-r2.test.mjs — fix:run round 2. THE JOB'S RUN RECORD.
//
// THE FINDING (ledger-invariance, r2, BLOCKER): the same flawless answers earn `flawless-page` on
// `#/run/page` and earned NOTHING in a job. `state.endJob` closes the page with `finishPage(s)` and
// nothing else; `screens/run.js`'s own `finish()` makes three more writes at that moment —
// `pushRun(makeRunRecord({kind:'page', …}))`, `checkDailyGoal`, `logForecast` — and `screens/job.js`
// made none of them. `data/trophies.js:194` is `someRun(r => kindOf(r) === 'page' && r.status ===
// 'done' && items.every(isClean))`, which is unreachable without a `runs[]` entry. `runs`,
// `forecastLog` and `trophies` are all in `js/job/state.js`'s own `LEDGER_A_KEYS`, and
// COMPOSED-GAME.md G7 publishes "Streak, trophies, XP, levels | unchanged".
//
// THE FIX is `screens/run.js`'s `commitJobRun`, called from `jobSummaryContext` — the one function
// `screens/job.js` calls at the terminal, on every path a job can end through. It is in the SCREEN
// layer because `js/job/*` runs against `guardSave`, which makes a Ledger A write throw (correctly —
// that is the whole proof of `job-ledger.test.mjs`).
//
// WHAT THIS FILE PINS: the record, the two follow-up writes, the trophy, the day they are filed
// under, and that a re-render is not a second page. It does NOT re-prove Ledger A — `cards`,
// `skills`, `xp` and `errors` are `job-ledger.test.mjs`'s, and the grade path is deliberately NOT
// mirrored here, so the two arms answer with the SAME literal result objects and any difference in
// the record can only come from the code under test.
//
// It touches `screens/run.js`, `js/job/state.js`, `js/page.js`, `js/trophies.js`, `js/schedule.js`
// and `js/readiness.js` and imports no other lane's screen.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import * as state from '../site/js/job/state.js';
import { markItem, finishPage, resumePage } from '../site/js/page.js';
import { fresh } from '../site/js/store.js';
import { todayISO, addDays } from '../site/js/days.js';
import { checkDailyGoal } from '../site/js/schedule.js';
import { logForecast } from '../site/js/readiness.js';
import { check as trophyCheck } from '../site/js/trophies.js';
import { byId as cardById } from '../site/data/cards.js';
import {
  pushRun, makeRunRecord, pageResults, captureJobBefore, jobSummaryContext, commitJobRun,
} from '../site/js/screens/run.js';

const NOW = new Date(2026, 8, 16, 18, 0).getTime();
const TODAY = todayISO(new Date(NOW));
const DAY_MS = 86400000;
const clone = (x) => structuredClone(x);
const num = (x, d = 0) => (Number.isFinite(+x) ? +x : d);

/** A save that composes a full board: the defaults plus a test date, which is all `startJob` needs. */
function jobSave(seedDays = 5) {
  const s = fresh(NOW - seedDays * DAY_MS);
  s.settings.testDate = addDays(TODAY, 8);
  return s;
}

const CLEAN = Object.freeze({ cleared: true, firstTry: true, hints: 0, attempt: 1, elapsedMs: 9000, xp: 40 });
const ATT2 = Object.freeze({ cleared: true, firstTry: false, hints: 0, attempt: 2, elapsedMs: 21000, xp: 25 });

/**
 * Play a whole job the way `screens/job.js` plays one: hold the before-snapshot and the queue at
 * job start (l.294 / l.367), drive the phase machine, and call `endJob` on the LAST beat rather
 * than `push()` (`continueBeat`: `beatAfter(s) === 'finish'` → `finish()`).
 *
 * `renderDebrief` is the single call the screen makes at the terminal, and `screen: false` is the
 * same job with that call left out — i.e. the app exactly as it stood before this fix.
 */
function playJob(save, { resultFor = () => CLEAN, screen = true, stopAfter = null, now = NOW } = {}) {
  let t = now;
  state.startJob(save, { today: TODAY, now: t });
  const before = captureJobBefore(state.unguard(save), state.queueOf(save));
  const queue = state.queueOf(save).slice();
  let debrief = null, n = 0;
  state.beginTargets(save, { now: (t += 6000) });
  for (let i = 0; i < 400; i++) {
    const g = state.stateOf(save);
    if (!g || g.outcome != null) break;
    if (stopAfter != null && state.answered(save) >= stopAfter) {
      debrief = state.walk(save, { now: (t += 1000) });    // the quit prompt's "Leave"
      break;
    }
    if (g.phase === 'envelope') { state.lockCall(save, 70, { now: (t += 5000) }); continue; }
    if (g.phase === 'answer') {
      const it = state.currentItem(save);
      state.applyTarget(save, { ...resultFor(++n), id: it.id }, { now: (t += 40000), cards: cardById });
      continue;
    }
    if (g.phase === 'payout' || g.phase === 'bagpush') {
      if (state.targetsLeft(save) === 0) {
        debrief = state.endJob(save, state.OUTCOMES.COMPLETED, { now: (t += 1000), day: TODAY });
        break;
      }
      state.push(save, { now: (t += 9000) });
      continue;
    }
    if (g.phase === 'brief') { state.brief(save, {}, { now: (t += 20000) }); continue; }
    if (g.phase === 'getaway') { state.crack(save, { now: (t += 25000) }); continue; }
    break;
  }
  const ctx = (screen && debrief)
    ? jobSummaryContext(save, debrief, { queue, before })   // ← screens/job.js `renderDebrief`
    : null;
  return { debrief, before, queue, ctx };
}

/**
 * The SAME queue answered flat, ending in the four writes `screens/run.js`'s `finish()` makes:
 * `finishPage`, `pushRun(makeRunRecord(…))`, `checkDailyGoal`, `logForecast`. The grade path is not
 * mirrored (see the header) — `markItem` stores the same literal result the job arm hands
 * `applyTarget`, so the two records are built from identical inputs.
 */
function playFlat(save, queue, { resultFor = () => CLEAN, startedAt = NOW, submittedAt = NOW + 36e5 } = {}) {
  save.inProgress = {
    kind: 'page', seed: 'page-seed', seedTag: 'abc123', queue: clone(queue), idx: 0, hearts: null,
    xp: 0, startedAt, day: TODAY, dayIndex: 0, pageIndex: 0, meta: null,
  };
  const results = [];
  for (let i = 0, n = 0; i < 400; i++) {
    const ip = resumePage(save);
    if (!ip || ip.idx >= ip.queue.length) break;
    const idx = ip.idx;
    const it = ip.queue[idx];
    const r = { ...resultFor(++n), id: it.id, n: it.n, role: it.role, skill: it.skill ?? (it.skills || [])[0] ?? null, tier: it.tier };
    results.push(r);
    markItem(save, r, { idx });
  }
  finishPage(save);
  const rec = pushRun(save, makeRunRecord({
    kind: 'page', id: null, seed: 'page-seed', seedTag: 'abc123', startedAt, submittedAt, results,
  }));
  checkDailyGoal(save, TODAY);
  logForecast(save, { today: TODAY });
  return rec;
}

/** Everything about a record except the clock each arm ran on, and the seed each arm was given. */
const shape = (r) => (r ? { ...r, startedAt: 0, submittedAt: 0, seed: null, seedTag: null } : null);

/* ========================================================================================== */
describe('fix:run r2 — a job that closes Today\'s Page records Today\'s Page', () => {
  test('THE BLOCKER: flawless answers earn `flawless-page` in a job, as they do on #/run/page', () => {
    const base = jobSave();
    const probe = clone(base);
    state.startJob(probe, { today: TODAY, now: NOW });
    const queue = clone(state.queueOf(probe));
    assert.ok(queue.length >= 6, `the board drafted only ${queue.length} targets`);

    const flat = clone(base);
    playFlat(flat, queue);
    const job = clone(base);
    playJob(job);

    const tFlat = trophyCheck(flat);
    const tJob = trophyCheck(job);
    assert.ok(tFlat.includes('flawless-page'), 'the flat page does not award it — the control is broken');
    assert.ok(tJob.includes('flawless-page'),
      'the SAME flawless answers earn Flawless Page on #/run/page and nothing in a job: '
      + 'the game decision still forfeits a Ledger A trophy');
  });

  test('…and it was the missing record, not the missing answers: the same job without the debrief earns nothing', () => {
    // `screen: false` is the app before this fix — `endJob` and not one write after it.
    const job = clone(jobSave());
    playJob(job, { screen: false });
    assert.equal((job.runs ?? []).length, 0);
    assert.ok(!trophyCheck(job).includes('flawless-page'),
      'the arm with the debrief call removed still earns it — this test is not measuring the fix');
  });

  test('the record a job writes IS the record the flat page writes', () => {
    const base = jobSave();
    const probe = clone(base);
    state.startJob(probe, { today: TODAY, now: NOW });
    const queue = clone(state.queueOf(probe));

    const flat = clone(base);
    const flatRec = playFlat(flat, queue);
    const job = clone(base);
    playJob(job);
    const jobRec = job.runs.at(-1);

    assert.equal(jobRec.kind, 'page', 'a job IS Today\'s Page — `finishPage` already counts it as one');
    assert.equal(jobRec.status, 'done');
    assert.deepEqual(shape(jobRec), shape(flatRec),
      'the two records differ in something that is not a clock or a seed');
    // and the clocks are each arm's own, not a default
    assert.ok(jobRec.startedAt > 0 && jobRec.submittedAt >= jobRec.startedAt, 'the job record has no span');
  });

  test('the record carries the PAGE\'s seed, which `finishPage` destroys', () => {
    // `endJob` → `finishPage` nulls `inProgress`, so `seed`/`seedTag` are unrecoverable at the
    // debrief unless `captureJobBefore` snapshotted them at job start.
    const base = jobSave();
    const probe = clone(base);
    state.startJob(probe, { today: TODAY, now: NOW });
    const seed = probe.inProgress.seed;
    const seedTag = probe.inProgress.seedTag;
    assert.ok(seed && seedTag, 'the composed page has no seed to carry');

    const job = clone(base);
    playJob(job);
    assert.equal(job.inProgress, null, 'the page was not closed — this test proves nothing');
    assert.equal(job.runs.at(-1).seed, seed);
    assert.equal(job.runs.at(-1).seedTag, seedTag);
  });

  test('the other two writes land too: the daily goal is checked and the forecast is logged', () => {
    const job = clone(jobSave());
    assert.equal((job.forecastLog ?? []).length, 0);
    playJob(job);
    assert.equal(job.forecastLog.length, 1, 'no forecast point — G3.7 proof 11 names `forecastLog`');
    assert.equal(job.forecastLog.at(-1).day, TODAY);
    assert.ok(Object.hasOwn(job.daily?.[TODAY] ?? {}, 'goalMet'), 'checkDailyGoal never ran for this day');
  });

  test('they are filed under the JOB\'s day, not the day the debrief happens to be rendered on', () => {
    // `endJob` stamps `game.ledger.debriefAt` and `game.log`'s entry carries the screen's own `day`;
    // `Date.now()` here is years after TODAY, so a record keyed on the render clock lands on the
    // wrong day — which would put the forecast point and the streak on a day nothing was studied.
    const job = clone(jobSave());
    playJob(job);
    assert.equal(job.game.log.at(-1).day, TODAY, 'the job did not record its own day');
    assert.equal(job.forecastLog.at(-1).day, TODAY);
    assert.ok(Object.hasOwn(job.daily ?? {}, TODAY));
    assert.equal(Object.keys(job.daily ?? {}).length, 1, `the goal was checked on ${Object.keys(job.daily)}`);
    assert.ok(job.runs.at(-1).submittedAt <= NOW + 60 * 60000,
      'the record\'s submittedAt is the render clock, not the job\'s terminal stamp');
  });

  test('a re-render of the debrief is not a second page', () => {
    const job = clone(jobSave());
    const { debrief, before, queue } = playJob(job);
    assert.equal(job.runs.length, 1);
    for (let i = 0; i < 4; i++) jobSummaryContext(job, debrief, { queue, before });
    assert.equal(job.runs.length, 1, 'a resize, a theme flip or a back button wrote another page');
    assert.equal(job.forecastLog.length, 1);
  });

  test('…and so is re-entering the debrief with a fresh snapshot (the save is the guard)', () => {
    const job = clone(jobSave());
    const { debrief, queue } = playJob(job);
    const startedAt = job.runs.at(-1).startedAt;
    // a remount holds no `before` object: the only guard left is `runs[]` itself
    jobSummaryContext(job, debrief, { queue, before: { skills: [], readiness: {}, tiles: {}, startedAt } });
    assert.equal(job.runs.length, 1, 'a remounted debrief wrote a second record for the same page');
  });

  test('a job that did NOT finish the page writes nothing — exactly as quitting a flat page writes nothing', () => {
    const job = clone(jobSave());
    const { debrief } = playJob(job, { stopAfter: 3 });
    assert.equal(debrief.complete, false, 'the walk left no targets — this arm is not testing a walk');
    assert.ok(job.inProgress, 'the rest of the page was not handed back');
    assert.equal((job.runs ?? []).length, 0,
      'a walked job recorded a page it did not finish; the rest of it is still live on #/run/page '
      + 'and would be recorded a second time when the flat screen closes it');
    assert.equal((job.forecastLog ?? []).length, 0);
  });

  test('…and the page the walk handed back is recorded ONCE, by whichever screen closes it', () => {
    const job = clone(jobSave());
    playJob(job, { stopAfter: 3 });
    const left = job.inProgress.queue.filter((it) => !it.done).length;
    assert.ok(left > 0);
    // the student finishes it on #/run/page: `finish()` records the WHOLE queue, job half included
    const rec = pushRun(job, makeRunRecord({
      kind: 'page', startedAt: NOW, submittedAt: NOW + 36e5, results: pageResults(job.inProgress.queue),
    }));
    assert.equal(job.runs.length, 1, 'two records for one page');
    assert.equal(rec.items.length, 3, 'the flat record lost the targets the job answered');
  });

  test('a mixed job is recorded as mixed: `flawless-page` is earned by clean answers and by nothing else', () => {
    const job = clone(jobSave());
    playJob(job, { resultFor: (n) => (n === 2 ? ATT2 : CLEAN) });
    const rec = job.runs.at(-1);
    assert.equal(rec.items.filter((i) => i.clean).length, rec.items.length - 1);
    assert.ok(!trophyCheck(job).includes('flawless-page'), 'a second-attempt item still counted as flawless');
  });

  test('commitJobRun refuses what it cannot record, and says so by returning null', () => {
    const job = clone(jobSave());
    const { debrief, before, queue } = playJob(job, { screen: false });
    assert.equal(commitJobRun(null, debrief, { queue, before }), null);
    assert.equal(commitJobRun(job, null, { queue, before }), null);
    assert.equal(commitJobRun(job, { ...debrief, complete: false }, { queue, before }), null, 'an open page');
    assert.equal(commitJobRun(job, debrief, { queue: [], results: [] }), null, 'nothing was answered');
    assert.equal((job.runs ?? []).length, 0, 'one of the refusals wrote anyway');
    assert.ok(commitJobRun(job, debrief, { queue, before }), 'and the legitimate call still records');
    assert.equal(job.runs.length, 1);
  });

  test('the summary the student reads is built from the save the write left behind', () => {
    // `finish()` on the flat page reads `after` off the save `update()` returned, so the Readiness,
    // the XP and the streak it prints are post-write. The job's context must do the same or the
    // debrief prints a save that existed one statement ago.
    const job = clone(jobSave());
    const { ctx } = playJob(job);
    assert.ok(ctx, 'the debrief context was not built');
    assert.equal(job.runs.length, 1);
    assert.equal(ctx.save, job);
    assert.ok(Number.isFinite(num(ctx.after.readiness.r, NaN)), 'the summary printed no Readiness');
    assert.equal(ctx.kind, 'job', 'the debrief is still the job\'s Page Summary, not a flat one');
    assert.equal(ctx.results.length, job.runs.at(-1).items.length,
      'the record and the printed summary disagree about how many items the page had');
  });
});
