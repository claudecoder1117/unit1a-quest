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
import { markItem, finishPage, resumePage, requeueReview, composePage } from '../site/js/page.js';
import { fresh } from '../site/js/store.js';
import { todayISO, addDays, daysUntilTest } from '../site/js/days.js';
import { composeOpts } from '../site/js/plan.js';
import { checkDailyGoal, applyOutcome as applySchedule } from '../site/js/schedule.js';
import { logForecast } from '../site/js/readiness.js';
import { check as trophyCheck } from '../site/js/trophies.js';
import { byId as cardById, cards as ALL_CARDS } from '../site/data/cards.js';
import { rngFrom } from '../site/js/rng.js';
import {
  pushRun, makeRunRecord, pageResults, pageBefore, captureJobBefore, jobSummaryContext, commitJobRun,
  composedCountOf, draftedCountOf, pageSizeExtra,
} from '../site/js/screens/run.js';
import { read, stripCommentsAndStrings as strip } from './_helpers.mjs';   // verify r2: the flat terminal is DOM-bound, so it is tied by source

const NOW = new Date(2026, 8, 16, 18, 0).getTime();
const TODAY = todayISO(new Date(NOW));
const DAY_MS = 86400000;
const clone = (x) => structuredClone(x);
const num = (x, d = 0) => (Number.isFinite(+x) ? +x : d);

/**
 * The page `composePage` deals for this save with the JOB's own inputs (`job/board.js
 * composeInputsFor` → `{q, tier4, microFlashOnly}` from the plan). VERIFY r1: this is the control
 * the r2 arms never used — they played the JOB's own draft flat and called it the study route.
 */
function jobPage(save, { now = NOW, today = TODAY } = {}) {
  let o = {};
  try {
    const p = composeOpts(save, { D: daysUntilTest(save?.settings?.testDate, today) });
    o = { q: p.q, tier4: p.tier4, microFlashOnly: p.microFlashOnly };
  } catch { o = {}; }
  return composePage(save, { ...o, now, today });
}

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
function playJob(save, { resultFor = () => CLEAN, screen = true, stopAfter = null, now = NOW, shapeId = null, getaway = 'crack' } = {}) {
  let t = now;
  state.startJob(save, { today: TODAY, now: t, ...(shapeId ? { shape: shapeId } : {}) });
  const before = captureJobBefore(state.unguard(save), state.queueOf(save));
  const queue = state.queueOf(save).slice();
  let debrief = null, n = 0;
  /* VERIFY r2 — the screen re-reads its queue on every beat (`screens/job.js:430`), because
     `requeueReview` splices Rematches into it mid-job. The held slice above is the DRAFT, which is
     the same array of item objects but never grows; `queue` below is what the terminal is handed. */
  let live = state.queueOf(save).slice();
  state.beginTargets(save, { now: (t += 6000) });
  for (let i = 0; i < 400; i++) {
    const g = state.stateOf(save);
    if (!g || g.outcome != null) break;
    live = state.queueOf(save).slice();
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
    if (g.phase === 'getaway') {
      /* WALK is a real button at the getaway (G2), and it is the decision verify r2 found was worth
         a study trophy: `endJob` takes the `else delete s.inProgress.game` branch and hands the rest
         of the DRAFTED page back to `#/run/page`. */
      debrief = getaway === 'walk'
        ? state.walk(save, { now: (t += 25000) })
        : state.crack(save, { now: (t += 25000) });
      continue;
    }
    break;
  }
  const ctx = (screen && debrief)
    ? jobSummaryContext(save, debrief, { queue: live, before })   // ← screens/job.js `renderDebrief`
    : null;
  return { debrief, before, queue, live, ctx };
}

/**
 * **The rest of a page that a job left live, finished through `#/run/page`** — `screens/run.js`'s
 * own `finish()`, verbatim, including the size provenance it now reads off the page BEFORE
 * `finishPage` clears it (`pageSizeExtra`). This is the route the debrief's own **Today's Page**
 * button offers, and it is offered exactly when a walk happened (`run.js:1419`, `job.left > 0`).
 */
function finishLivePage(save, { resultFor = () => CLEAN, submittedAt = NOW + 36e5 } = {}) {
  const ip0 = resumePage(save);
  if (!ip0) return null;
  const startedAt = num(ip0.startedAt, NOW);
  const seed = ip0.seed ?? null;
  const seedTag = ip0.seedTag ?? null;
  const before = pageBefore(ip0);
  for (let i = 0, n = 0; i < 400; i++) {
    const ip = resumePage(save);
    if (!ip || ip.idx >= ip.queue.length) break;
    const idx = ip.idx;
    const it = ip.queue[idx];
    const r = { ...resultFor(++n), id: it.id, n: it.n, role: it.role, skill: it.skill ?? (it.skills || [])[0] ?? null, tier: it.tier };
    if (!r.cleared && (it.isReview || it.isRematch)) requeueReview(save, { idx, result: r });
    markItem(save, r, { idx });
  }
  const queue = resumePage(save)?.queue.slice() ?? [];
  const results = pageResults(queue);
  const size = pageSizeExtra(before, queue, results);       // ← run.js finish(), read before finishPage
  finishPage(save);
  const rec = pushRun(save, makeRunRecord({
    kind: 'page', id: null, seed, seedTag, startedAt, submittedAt, results, extra: size ?? {},
  }));
  checkDailyGoal(save, TODAY);
  logForecast(save, { today: TODAY });
  return rec;
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

/**
 * Everything about a record except the clock each arm ran on, and the seed each arm was given.
 *
 * VERIFY r1 — and except the page's SIZE PROVENANCE (`drafted` / `composed` / `partial`), which the
 * job's row now carries and the flat row does not, because the flat arm here is handed the JOB's
 * draft rather than `composePage`'s deal: the two arms are not the same page, and the record is no
 * longer allowed to imply that they are. The triple is not waived — it is asserted positively,
 * against `composePage`, in the arm below.
 */
const shape = (r) => {
  if (!r) return null;
  const { drafted, composed, partial, ...rest } = r;
  return { ...rest, startedAt: 0, submittedAt: 0, seed: null, seedTag: null };
};

/* ========================================================================================== */
describe('fix:run r2 — a job that closes Today\'s Page records Today\'s Page', () => {
  /* ── CORRECTED AT VERIFY r1 (ledger-invariance) ───────────────────────────────────────────────
     This arm used to read: play the JOB's drafted queue flat, play the same queue as a job, and
     assert both earn `flawless-page`. `playFlat(flat, queue)` is the job's own draft — so the arm
     measured the row against ITSELF and the control could not fail. Measured against the page
     `composePage` actually deals for the same save, the job's draft is 7-10 of 16-24 items (mean
     45 % over 60 corpus saves): seven clean answers were buying the trophy that twenty clean
     answers buy on `#/run/page`, and *"Finish a whole Page"* was false of what was finished.
     The invariance the r2 repair was right about — a job FILES the page record and its two
     follow-up writes — is asserted below and is unchanged. What is corrected is the size claim:
     the trophy follows the page, and the record now says how much of the page it covers. */
  test('THE BLOCKER, re-measured: the job files the page record, and the record says how much of the page it is', () => {
    const base = jobSave();
    const probe = clone(base);
    state.startJob(probe, { today: TODAY, now: NOW });
    const queue = clone(state.queueOf(probe));
    assert.ok(queue.length >= 6, `the board drafted only ${queue.length} targets`);

    /* THE CONTROL THE OLD ARM NEVER USED: the page `#/run/page` would deal for this save. */
    const deal = jobPage(clone(base)).queue.length;
    assert.equal(composedCountOf(probe.inProgress), deal,
      'the job keeps the COMPOSED page’s meta on `inProgress.meta`; its counts must sum to that page');
    assert.ok(queue.length < deal,
      `the draft must be a strict subset or this arm proves nothing (drafted ${queue.length}, composed ${deal})`);

    const job = clone(base);
    playJob(job);
    const rec = job.runs.at(-1);
    assert.equal(rec.kind, 'page', 'a job IS Today’s Page — `finishPage` already counts it as one');
    assert.equal(rec.status, 'done');
    /* VERIFY r2: `drafted` is counted in `composed`'s unit — DISTINCT items — not in answers.
       `rec.items` is one entry per answer and a requeued review adds one without adding coverage,
       so the two are only equal on an all-clean play like this one; asserting the equality was
       asserting the implementation. See `screens/run.js draftedCountOf`. */
    assert.equal(rec.drafted, new Set(rec.items.map((it) => it.id)).size,
      'the row must count the DISTINCT items it covers');
    assert.ok(rec.drafted <= rec.items.length, 'coverage can never exceed the answers that produced it');
    assert.equal(rec.composed, deal, 'the row must carry `composePage`’s own count for this page');
    assert.equal(rec.partial, true, `${rec.drafted} of ${deal} items is not a whole Page`);
    assert.equal(trophyCheck(job).includes('flawless-page'), false,
      `a job that dealt ${rec.drafted} of the page’s ${deal} items earned "Finish a whole Page"`);

    /* …and the control is not broken: the same answers over the WHOLE page still earn it flat. */
    const flat = clone(base);
    playFlat(flat, jobPage(clone(base)).queue);
    assert.ok(trophyCheck(flat).includes('flawless-page'),
      'the flat page does not award it — the control is broken');
    assert.equal(num(flat.runs.at(-1).partial, null), null,
      'a flat page row carries no `partial` key at all, so nothing about it changed');
  });

  /* -------------------------------------------------------------------------------------------
     ROUND-2 VERIFY (ledger-invariance finding 4) — THE HATCH, AND THE FACT THAT NOTHING REACHES IT.

     This arm used to be titled "…and a job that deals the WHOLE page earns it, exactly as #/run/page
     does", and its only input was `before.composed = queue.length`, written by the test itself one
     line above the branch it decides. `before.composed` is the ONLY thing `commitJobRun` reads to
     set `partial`, so the arm could not fail for the thing it claimed: it measured that the function
     honours a `composed` it is handed, and nothing about whether a board can hand it one.

     Measured on real boards instead (the arm below), the drafted queue is a STRICT SUBSET of the
     page on every shipped shape, so `partial: false` is not reachable on the job route at all, and
     `flawless-page` is never awarded through it. The title now says what the first arm measures and
     the second arm pins the reachability, so the claim `data/trophies.js:200-202` publishes — "a job
     that deals a WHOLE page is not partial and still earns this" — is either made true (count
     distinct coverage, notes/repair-tests.md Requests · E) or struck, and this file will say which.
     ------------------------------------------------------------------------------------------- */
  test('commitJobRun honours the `composed` it is HANDED: hand it the draft size and the row is whole', () => {
    const job = jobSave();
    const { debrief, queue, before } = playJob(job, { screen: false });
    assert.equal((job.runs ?? []).length, 0, 'the screen terminal was skipped, so nothing is recorded yet');
    /* the one thing that differs from the arm above — and it is HAND-SET, which is the point of the
       arm after this one: no shipped board produces this state. */
    assert.ok(before.composed > queue.length,
      `the real board handed ${before.composed} composed against ${queue.length} drafted — if these are already `
      + 'equal, the hatch is reachable and the arm below has to be rewritten as the positive claim');
    before.composed = queue.length;
    const rec = commitJobRun(job, debrief, { queue, before });
    assert.equal(rec.partial, false);
    assert.equal(rec.drafted, rec.composed);
    assert.ok(trophyCheck(job).includes('flawless-page'),
      'a job whose row says it dealt the whole page must earn what the flat page earns for the same answers');
  });

  /**
   * A save with a real history behind it, so `composePage` has due reviews to deal and the page is
   * the 16–28 items a mid-unit student's is — not the 11 a save created five days ago composes.
   * The page SIZE is the whole variable in the arm below, and it is the one the fixture used to set
   * by hand.
   */
  function loadedSave(i) {
    const s = jobSave(30);
    const rng = rngFrom('r2|reach|loaded', i);
    const pool = ALL_CARDS.map((c) => c.id);
    const n = 45 + rng.int(0, 20);
    for (let k = 0; k < n; k++) {
      const id = pool[rng.int(0, pool.length - 1)];
      const rec = applySchedule(s, id, rng.chance(0.75) ? 'clean' : 'hints', { now: NOW - (2 + rng.int(0, 25)) * DAY_MS });
      if (rec && rng.chance(0.6)) rec.due = NOW - rng.int(0, 6) * DAY_MS;
    }
    return s;
  }

  /** every shipped shape, played all-clean to the end, on a given population of saves */
  function reachCorpus(saveOf, reps = 6) {
    const rows = [];
    for (const shapeId of ['RUN', 'JOB', 'JOB12', 'VAULT']) {
      for (let k = 0; k < reps; k++) {
        const s = saveOf(k);
        const out = playJob(s, { shapeId });
        if (!out.debrief) continue;
        const rec = (s.runs ?? []).at(-1);
        if (!rec || rec.status !== 'done') continue;
        rows.push({
          shapeId, rec,
          awarded: trophyCheck(s).includes('flawless-page'),
          clean: rec.items.length > 0 && rec.items.every((it) => it && it.clean === true),
        });
      }
    }
    return rows;
  }
  const summarise = (rows) => `${rows.length} completed all-clean jobs across four shapes: `
    + `${rows.filter((r) => r.rec.partial === false).length} rows partial:false, `
    + `${rows.filter((r) => r.awarded).length} earned flawless-page, coverage `
    + `${Math.min(...rows.map((r) => r.rec.drafted / r.rec.composed * 100)).toFixed(0)}–`
    + `${Math.max(...rows.map((r) => r.rec.drafted / r.rec.composed * 100)).toFixed(0)} % of the composed page`;

  test('THE HATCH IS REAL, and it is the PAGE SIZE that decides it — on a small page a job does deal the lot', () => {
    const rows = reachCorpus((k) => jobSave(3 + k));
    assert.ok(rows.length >= 20, `only ${rows.length} of 24 jobs completed — this measurement needs a corpus`);
    assert.ok(rows.every((r) => r.clean), 'every job in the corpus must be answered flawlessly, or the trophy was never in reach anyway');
    const whole = rows.filter((r) => r.rec.partial === false);
    const msg = summarise(rows);
    if (process.env.J_PRINT) console.log(`  light population: ${msg}; whole-page rows: ${whole.map((r) => `${r.shapeId} ${r.rec.drafted}/${r.rec.composed}`).join(', ')}`);
    assert.ok(whole.length > 0,
      `${msg} — NOTHING reaches partial:false on a small page either, so data/trophies.js:200-202's "a job that deals `
      + 'a WHOLE page is not partial and still earns this" has no reachable instance at all and must be struck');
    for (const r of whole) {
      assert.equal(r.rec.drafted, r.rec.composed, `${r.shapeId}: partial:false must mean the draft IS the page`);
      assert.equal(r.awarded, true,
        `${r.shapeId}: a job that dealt the whole page all-clean did NOT earn flawless-page — that is the claim breaking`);
    }
    // …and it is the SHAPE's target count against the page's, nothing else
    const shapes = [...new Set(whole.map((r) => r.shapeId))];
    assert.ok(shapes.length >= 1 && shapes.length <= 4, `reached by ${shapes.join(', ')}`);
  });

  test('…but on a REAL page it is out of reach: 24 loaded all-clean jobs, `flawless-page` awarded 0 times', () => {
    const rows = reachCorpus((k) => loadedSave(k));
    assert.ok(rows.length >= 20, `only ${rows.length} of 24 loaded jobs completed`);
    assert.ok(rows.every((r) => r.clean), 'every job in the corpus must be answered flawlessly');
    const msg = summarise(rows);
    if (process.env.J_PRINT) console.log(`  loaded population: ${msg}`);
    const pages = rows.map((r) => r.rec.composed);
    assert.ok(Math.min(...pages) >= 14,
      `the loaded population composes pages of ${Math.min(...pages)}–${Math.max(...pages)} items — that is not the mid-unit `
      + 'page this arm needs; re-seed loadedSave()');
    assert.equal(rows.filter((r) => r.rec.partial === false).length, 0,
      `${msg} — the hatch is now reachable on a full page too: say so here and in data/trophies.js`);
    assert.equal(rows.filter((r) => r.awarded).length, 0, msg);
    for (const r of rows) {
      assert.ok(r.rec.drafted < r.rec.composed,
        `${r.shapeId}: drafted ${r.rec.drafted} of ${r.rec.composed} — on a loaded page every shape's draft is a strict subset`);
      assert.equal(r.rec.partial, true, `${r.shapeId}: a strict subset must be stamped partial`);
    }
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
      'the two records differ in something that is not a clock, a seed or the page’s size');
    // and the clocks are each arm's own, not a default
    assert.ok(jobRec.startedAt > 0 && jobRec.submittedAt >= jobRec.startedAt, 'the job record has no span');
    /* the size provenance `shape` drops is measured here rather than waived — against the page
       `composePage` deals for this save, which is the comparison the r2 arm never made */
    const deal = jobPage(clone(base)).queue.length;
    /* VERIFY r2 — `jobRec.drafted === jobRec.items.length` and `jobRec.partial === (jobRec.drafted
       < deal)` were the implementation restated, and the first of the two was the defect:
       `items.length` counts ANSWERS and `composed` counts ITEMS, so a miss-heavy job reported MORE
       coverage than a clean one on the same board. Asserted in `composed`'s own unit now. The
       corpus property that cannot be satisfied by restating the formula is in
       `tests/run-lane-v2.test.mjs` §2. */
    assert.equal(jobRec.drafted, new Set(jobRec.items.map((it) => it.id)).size);
    assert.ok(jobRec.drafted <= jobRec.items.length);
    assert.equal(jobRec.composed, deal);
    assert.ok(jobRec.drafted <= deal, 'a row may never claim more of the page than the page holds');
    assert.equal(jobRec.partial, jobRec.drafted < deal);
    assert.equal(Object.hasOwn(flatRec, 'partial'), false, 'the flat row is untouched by this');
  });

  /**
   * ── VERIFY r2, BLOCKER (ledger-invariance): A GAME DECISION CHANGED `save.trophies` ────────────
   *
   * `state.endJob` is `if (complete) finishPage(s); else delete s.inProgress.game;`, so a WALK at
   * the getaway leaves the SAME drafted queue live as a plain Today's Page, one target short — and
   * `run.js:1419` puts a **Today's Page** button on the debrief exactly when `job.left > 0`, i.e.
   * exactly when a walk happened. `commitJobRun` refuses a job that is not `complete`, so the row
   * was written by the flat terminal, which stamped no size provenance at all, and
   * `data/trophies.js:203` gates **Flawless Page** on `r.partial !== true`. Measured, same corpus
   * save, same ten drafted targets, same CLEAN answers:
   *
   *     ARM crack  row {items 10, drafted 10, composed 11, partial true}   trophies: chain-8
   *     ARM walk   row {items 10}                                          trophies: chain-8, flawless-page
   *
   * Walking one target early was worth one study trophy. COMPOSED-GAME.md:15 says Ledger A *"is
   * never staked, never lost, never multiplied by a game decision"* and :984 *"Streak, trophies,
   * XP, levels | unchanged"*. No arm in the suite played walk-then-finish-flat, which is why three
   * rounds of pins over this row could not see it.
   *
   * THE FIX is that the size provenance is the PAGE's and not the terminal's: `pageSizeExtra` reads
   * it off the before-snapshot the drafted page carries, and BOTH writers use it.
   */
  test('THE WALK: a job walked at the getaway and finished flat earns exactly what the completed job earns', () => {
    const base = jobSave();

    const crackArm = clone(base);
    const cracked = playJob(crackArm);
    assert.equal(cracked.debrief.complete, true, 'the control did not complete — it proves nothing');
    assert.equal(crackArm.inProgress, null, 'a completed job closes the page');
    const crackRec = crackArm.runs.at(-1);

    const walkArm = clone(base);
    const walked = playJob(walkArm, { getaway: 'walk' });
    assert.equal(walked.debrief.outcome, state.OUTCOMES.WALKED, 'the walk arm did not walk');
    assert.equal(walked.debrief.complete, false);
    assert.ok(num(walked.debrief.left, 0) > 0, 'the walk left nothing on the page — the route below is unreachable');
    assert.ok(resumePage(walkArm), 'the walked job did not hand the page back to #/run/page');
    assert.equal((walkArm.runs ?? []).length, 0, '`commitJobRun` wrote a row for a page it did not close');
    /* the button the debrief actually offers (run.js:1419 renders it iff `job.left > 0`) */
    const walkRec = finishLivePage(walkArm);

    /* the same page, the same items, the same answers — so the two rows must say the same thing */
    assert.equal(walkRec.kind, 'page');
    assert.equal(walkRec.composed, crackRec.composed, 'the two arms are not the same composed page');
    assert.equal(walkRec.drafted, crackRec.drafted, 'the two arms did not cover the same items');
    assert.equal(walkRec.partial, crackRec.partial,
      'the terminal that closed the page changed what the row says about the page');
    assert.equal(walkRec.flawless, crackRec.flawless);
    assert.equal(walkRec.acc, crackRec.acc);

    /* …and therefore the same trophies. This is the assertion the finding is about. */
    const crackT = trophyCheck(crackArm).sort();
    const walkT = trophyCheck(walkArm).sort();
    assert.ok(crackT.length > 0, 'the completed arm earned nothing at all — the comparison is vacuous');
    assert.deepEqual(walkT, crackT,
      `a game decision changed the trophy set: walk earned [${walkT}] and the completed job earned [${crackT}]`);
    assert.equal(walkT.includes('flawless-page'), false,
      'a 10-of-11 page is not "a whole Page" on either route');

    /* ── AND THE SHIPPED `finish()` IS THE THING THIS ARM MIRRORS ─────────────────────────────────
       `finish()` lives inside `mountCardRun` and needs a DOM, so `finishLivePage` above is a
       transcription of it — which makes it exactly the kind of arm that cannot fail for the reason
       it claims unless it is tied back to the source. It is tied here, the way `job-split.test.mjs`
       ties the debrief's own lines: the provenance must be read from the PAGE, BEFORE `finishPage`
       clears `inProgress`, and it must be what the row is stamped with. */
    const src = read('site/js/screens/run.js');
    const finishSrc = src.slice(src.indexOf('  function finish() {'), src.indexOf('  const onHide ='));
    assert.ok(finishSrc.length > 0, 'the flat terminal `finish()` is not where this arm thinks it is');
    assert.match(finishSrc, /const size = kind === 'page' \? pageSizeExtra\(before, queue, results\) : null;/,
      'the flat terminal no longer reads the page’s own size provenance');
    const finishCode = strip(finishSrc);          // the CODE, not this comment block's own prose
    assert.ok(finishCode.includes('pageSizeExtra(') && finishCode.includes('finishPage('),
      'the flat terminal no longer calls both — the ordering check below would be vacuous');
    assert.ok(finishCode.indexOf('pageSizeExtra(') < finishCode.indexOf('finishPage('),
      '`pageSizeExtra` is read after `finishPage` has already nulled `inProgress` — it can only see an empty page');
    assert.match(finishSrc, /:\s*\(size \?\? \{\}\),/,
      'the flat row is not stamped with the provenance the line above computed');

    /* the negative control: the study route is untouched for a page the game never drafted, and it
       DOES still award the trophy for a real whole page, so the arm above is not passing by
       breaking the flat route */
    const flat = clone(base);
    playFlat(flat, jobPage(clone(base)).queue);
    assert.equal(Object.hasOwn(flat.runs.at(-1), 'partial'), false,
      'a page the board never drafted grew a `partial` key');
    assert.ok(trophyCheck(flat).includes('flawless-page'),
      'the flat whole page no longer earns flawless-page — the control is broken');
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
