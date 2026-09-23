// tests/job-ledger.test.mjs — THE LOAD-BEARING TEST OF THE WHOLE GAME LAYER (THE LAW OF TWO LEDGERS).
//
// REWRITTEN BY THE DEMOLITION (notes/DEMOLISH.md) onto the cut design's three verbs — call → answer →
// bank — with every byte-identity assertion kept verbatim. The old arm drove `beginTargets`,
// `lockCall`, `applyTarget`, `bag`, `push`, `brief`, `crack`, `walk` and `callIt`; seven of those
// nine mechanics are deleted by designs/CUT-BRIEF.md. What the file PROVES is unchanged, and that is
// the point of keeping it: the same answers inside the game and through `#/run/page` leave
// byte-identical study state.
//
// COMPOSED-GAME G3.7 proof 11 and G9 #8: *"the same answer sequence inside a job and through
// `#/run/page` produces byte-identical `cards`, `skills`, `xp`, `errors`, `counters`,
// `forecastLog`. `P(losing study progress) = 0` by construction, not by tuning."*
//
// HOW THE TWO ARMS ARE BUILT, and why this is the honest form of that claim under `node --test`:
//
//   • `#/run/page` is `screens/run.js` + `screens/card.js`, both of which are DOM. What they DO to
//     the save is three things, and only three: (1) card.js's grade block writes LEDGER A at grade
//     time; (2) run.js's `record()` calls `requeueReview` then `markItem`; (3) run.js's `finish()`
//     calls `finishPage`. (2) and (3) are `page.js` functions and run headless. (1) is reproduced
//     here, once, as `writeLedgerA` — mirroring `card.js:895-945` (the clear) and `:995-1012` +
//     `:824` + `:844` (the miss), through the REAL `mastery.js` / `schedule.js` / `xp.js` /
//     `rarity.js` / `trophies.js`.
//
//   • **Both arms call the SAME `writeLedgerA`, with the same arguments, in the same order.** That
//     is the point of the test: the job arm adds `state.js` on top and nothing else. If `state.js`
//     wrote one byte of Ledger A — a bucket, a rarity, a foil, an XP point, an error record — the
//     two arms would diverge and this file would go red.
//
//   • Both arms answer the SAME queue, in the same order, with the same results. The flat arm gets
//     the job's own drafted queue as a plain `inProgress` page, so the only variable left between
//     the two is the game layer.
//
// The second half of the proof is structural rather than statistical, and lives here too: the
// guarded save `state.js` runs against makes a Ledger A write from `js/job/*` THROW.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import * as state from '../site/js/job/state.js';
import {
  startJob, call as lockCall, answer as answerTarget, bank, endJob,
  queueOf, targetsLeft, answered, guardSave, LedgerError, LEDGER_A_KEYS,
} from '../site/js/job/state.js';
import { markItem, requeueReview, finishPage, resumePage, composePage } from '../site/js/page.js';
import { xpFor, nextCombo, levelFor } from '../site/js/xp.js';
import { scoreFor, applyOutcome as applyMastery, decayAll, leitnerOutcome, nextBucket, dueFor } from '../site/js/mastery.js';
import { rarityOf, bestRarity } from '../site/js/rarity.js';
import {
  clampDue, testAtOf, clearRematch, cardRecord, applyOutcome as applySchedule, DAY_MS,
  freezeVariant, checkDailyGoal,
} from '../site/js/schedule.js';
import { readiness, logForecast } from '../site/js/readiness.js';
import { check as trophyCheck, evaluate as trophyEvaluate } from '../site/js/trophies.js';
import { trophyById } from '../site/data/trophies.js';
import { fresh, markStreakDay } from '../site/js/store.js';
import {
  pushRun, makeRunRecord, captureJobBefore, commitJobRun, pageResults, composedCountOf,
} from '../site/js/screens/run.js';
import { rngFrom } from '../site/js/rng.js';
import { todayISO, addDays } from '../site/js/days.js';
import { cards as ALL_CARDS, byId as cardById } from '../site/data/cards.js';
import { isBonus } from '../site/data/source-manifest.js';

const NOW = new Date(2026, 8, 16, 18, 0).getTime();
const TODAY = todayISO(new Date(NOW));
const BANK = ALL_CARDS.filter((c) => !isBonus(c.id));
const clone = (x) => structuredClone(x);
const num = (x, d = 0) => (Number.isFinite(+x) ? +x : d);

/**
 * The six keys G3.7 proof 11 names, plus the rest of Ledger A for good measure.
 *
 * ROUND 3 (ledger-invariance). `runs`, `forecastLog` and `trophies` stopped being compared between
 * two untouched objects when the job arm started running the terminal every real job goes through
 * (see `runInJob`'s last statement). `forecastLog` is in this list and is byte-identical; `runs` is
 * compared through `runShape`, which drops only `seed` / `seedTag` / `submittedAt` — the identity of
 * the SITTING, not of the study it recorded (`startedAt` IS compared, and is the same instant on
 * both routes). `trophies` is compared as the awarded set. See `THE RUN RECORD` and `THE TROPHIES`.
 */
const COMPARED = Object.freeze(['cards', 'skills', 'xp', 'errors', 'counters', 'forecastLog']);
const ALL_LEDGER_A = Object.freeze([...new Set([...COMPARED, ...LEDGER_A_KEYS])]);

/* ------------------------------------------------------------------ the corpus */

function seededSave(i) {
  const rng = rngFrom('job-ledger-corpus', i);
  const s = fresh(NOW - (4 + rng.int(0, 20)) * DAY_MS);
  s.profileId = `ledger-${i}`;
  s.settings.testDate = addDays(TODAY, 4 + rng.int(0, 12));
  for (let k = 0; k < 26 + rng.int(0, 20); k++) {
    const c = BANK[rng.int(0, BANK.length - 1)];
    let rec = null;
    for (let r = 0; r < 3; r++) rec = applySchedule(s, c.id, rng.chance(0.75) ? 'clean' : 'wrong', { now: NOW - (30 - r * 4) * DAY_MS });
    if (!rec) continue;
    rec.cleared = true;
    rec.rarity = 'gold';
    rec.due = NOW + (rng.chance(0.65) ? -rng.float(0, 9) : rng.float(0.2, 12)) * DAY_MS;
    rec.history = Array.from({ length: 8 }, (_, h) => ({
      at: NOW - (20 - h) * DAY_MS, ok: rng.chance(0.75), attempt: 1, hints: 0, ms: 9000,
    }));
  }
  const SKILLS = ['VOC', 'NOTE', 'CLASS', 'ASN-PLP', 'ASN-ANG', 'PAIRS', 'FIG-ALG', 'BISECT-L', 'BISECT-Q',
    'SEG-ALG', 'CSARITH', 'CS-LIN', 'CS-RATIO', 'CS-QUAD', 'SYS', 'FAC1', 'FAC2', 'QUAD-SOLVE', 'QUAD-CTX'];
  for (const k of SKILLS) {
    if (!rng.chance(0.75)) continue;
    s.skills[k] = { m: rng.int(10, 95), n: rng.int(1, 9), lastAt: NOW - rng.int(1, 20) * DAY_MS, lastDueCorrectAt: null };
  }
  return s;
}

const CORPUS = Array.from({ length: 10 }, (_, i) => seededSave(i));

/**
 * The GRADE clock, shared by both arms. A grade's timestamp is card.js's `Date.now()` at the moment
 * of the clear, and the two paths reach the same item at different wall-clock moments — the job
 * spends seconds on calls, bags and briefs that the flat page does not. Pinning the grade clock per
 * ANSWER, identically in both arms, is what makes the comparison about the game layer rather than
 * about how long each path takes; the job's own clock (`t` below) runs independently, which is the
 * other half of "answers tick, time does not".
 */
const gradeAt = (n) => NOW + n * 60000;

/* ------------------------------------------------------------------ the ONE Ledger A writer */

/**
 * `screens/card.js`'s grade block, headless. This is the study layer's write, and the ONLY write of
 * Ledger A in either arm of this test — exactly as it is the only one in the shipped app.
 *
 * @param {object} sv      the save (RAW: this stands in for card.js, which is not `js/job/*`)
 * @param {object} item    the queue item
 * @param {object} result  the outcome card.js would have produced
 * @param {{now:number, today:string, combo:number}} ctx
 * @returns {object} card.js's `st.result`
 */
function writeLedgerA(sv, item, result, ctx) {
  const { now, today } = ctx;
  const card = cardById[item.id] ?? null;
  const isCard = item.kind !== 'variant';
  const cleared = result.cleared === true;
  const firstTry = result.firstTry === true;
  const hints = Math.max(0, num(result.hints, 0));
  const attempt = Math.max(1, num(result.attempt, 1));
  const review = !!item.isReview;
  const clean = firstTry && hints === 0;

  if (!cleared) {
    /* card.js:844 — every wrong submit logs an error record */
    sv.errors.push({
      item: item.id, seed: item.seed ?? null, t: now, got: 'x', tags: ['ledger-test'],
      cleared: false, part: 'a', template: item.template ?? null, forCard: item.forCard ?? null,
    });
    /* card.js:824 — s = 0 on the FIRST wrong only */
    decayAll(sv.skills, now);
    applyMastery(sv.skills, item.skills, scoreFor({ wrong: true }), { at: now, dueReview: false });
    /* card.js:995-1012 — the reveal */
    if (!isCard) {
      /* card.js:1005 — a missed Variant is FROZEN by seed so the exact failed problem returns.
         Until ticket fix:tests r1 this branch did not exist here, so `save.frozen` was compared
         between two objects nothing had ever written (round-1 ledger-invariance finding, item 2). */
      try { freezeVariant(sv, item, { forCard: item.forCard ?? null, now }); } catch { /* no template */ }
    }
    if (isCard) {
      const rec = cardRecord(sv, item.id);
      rec.attempts = num(rec.attempts) + attempt - 1;
      rec.solutionShown = true;
      rec.rarity = bestRarity(rec.rarity, 'bronze');
      rec.bucket = nextBucket(rec.bucket, 'wrong');
      rec.lastAt = now; rec.due = now;
      rec.hintsUsed = hints;
      rec.lastFirstTry = false;
      rec.history.push({ at: now, ok: false, attempt, hints, ms: 9000 });
    }
    sv.counters.solutions = num(sv.counters.solutions) + 1;
    sv.counters.rematchQueued = num(sv.counters.rematchQueued) + 1;
    return { ...result, id: item.id, kind: item.kind ?? 'card', cleared: false, rematch: true };
  }

  /* card.js:895-945 — the clear */
  const rarity = rarityOf({ id: item.id, firstTry, hints, attempt, setupTried: true }) ?? 'bronze';
  const xpInfo = xpFor({
    tier: item.tier, firstTry, hints, attempt, comboBefore: ctx.combo, elapsedMs: 9000,
    isReview: review, isDrill: false, isVariant: !isCard, isMastered: false, isBonusBank: !!item.bonus,
    isRematch: !!item.isRematch, partsTotal: 1, partsCorrect: 1,
  });
  const s = scoreFor({ firstTry, hints, attempt, withHints: false });
  const outcome = leitnerOutcome({ firstTry, hints, attempt, withHints: false });
  decayAll(sv.skills, now);
  sv.xp += xpInfo.xp;
  const d = sv.daily[today] ?? (sv.daily[today] = { xp: 0, clears: 0, goalMet: false, mockDone: false });
  d.xp = num(d.xp) + xpInfo.xp; d.clears = num(d.clears) + 1;
  /* card.js:903 — the daily goal and the streak, inline in the clear. Added by ticket fix:tests r1:
     without it `daily` never reached `goalMet` and `streak` was never written, so both were compared
     vacuously (round-1 ledger-invariance finding, item 2). */
  if (!d.goalMet && d.xp >= num(sv.settings?.dailyGoal, 400)) { d.goalMet = true; markStreakDay(sv, today); }
  applyMastery(sv.skills, item.skills, s, { at: now, dueReview: review });
  const testAt = testAtOf(sv);
  if (!isCard) {
    /* card.js:934-940 — a cleared Variant writes `save.variants`, never a card record, and it
       THAWS the frozen copy. Added by ticket fix:tests r1: `variants` and `frozen` are both in
       ALL_LEDGER_A and both were being compared as two untouched objects. */
    const v = sv.variants[item.template] ?? (sv.variants[item.template] = { clearsGold: 0, goldDays: [] });
    v.clears = num(v.clears) + 1;
    if (rarity === 'gold') {
      v.clearsGold = num(v.clearsGold) + 1;
      if (!Array.isArray(v.goldDays)) v.goldDays = [];
      if (!v.goldDays.includes(today)) v.goldDays.push(today);
    }
    if (item.forCard && rarity === 'gold') cardRecord(sv, item.forCard).foilProgress.push({ day: today, via: item.id });
    if (sv.frozen[item.id]) delete sv.frozen[item.id];
  }
  if (isCard) {
    const rec = cardRecord(sv, item.id);
    rec.attempts = num(rec.attempts) + attempt;
    rec.cleared = true;
    rec.rarity = bestRarity(rec.rarity, rarity);
    rec.bucket = nextBucket(rec.bucket, outcome);
    rec.lastAt = now;
    rec.due = clampDue(dueFor(rec.bucket, now), { now, testAt });
    rec.hintsUsed = hints;
    rec.lastFirstTry = firstTry;
    rec.bestMs = rec.bestMs == null ? 9000 : Math.min(rec.bestMs, 9000);
    rec.history.push({ at: now, ok: true, attempt, hints, ms: 9000 });
    if (review && clean) rec.foilProgress.push({ day: today, via: 'review' });
  }
  for (const e of sv.errors) if (e && e.item === item.id) e.cleared = true;
  if (firstTry) clearRematch(sv, item.id);
  sv.counters.clears = num(sv.counters.clears) + 1;
  if (clean) sv.counters.cleanClears = num(sv.counters.cleanClears) + 1;
  if (review) sv.counters.reviews = num(sv.counters.reviews) + 1;
  return {
    ...result, id: item.id, kind: item.kind ?? 'card', cleared: true, firstTry, attempt, hints,
    clean, rarity, xp: xpInfo.xp, review,
  };
}

/* ------------------------------------------------------------------ the two arms */

const CLEAN = { cleared: true, firstTry: true, hints: 0, attempt: 1 };
const HINT1 = { cleared: true, firstTry: true, hints: 1, attempt: 1 };
const ATT2 = { cleared: true, firstTry: false, hints: 0, attempt: 2 };
const MISS = { cleared: false, solutionShown: true, reason: 'third-wrong', attempt: 3, hints: 0 };

/** A deterministic answer script, by position in the queue. */
const scriptFor = (seed) => {
  const rng = rngFrom('job-ledger-script', seed);
  const draw = () => { const u = rng.next(); return u < 0.55 ? CLEAN : u < 0.7 ? HINT1 : u < 0.85 ? ATT2 : MISS; };
  const memo = new Map();
  return (n) => { if (!memo.has(n)) memo.set(n, draw()); return memo.get(n); };
};

/**
 * ARM A — the flat path. `run.js:record()` verbatim: write Ledger A, then `requeueReview`, then
 * `markItem`; `run.js:finish()` at the end: `finishPage`.
 */
function runFlat(save, queue, script, { now = NOW, today = TODAY, hold = null, stopAt = Infinity } = {}) {
  save.inProgress = {
    kind: 'page', seed: 1, seedTag: null, queue: clone(queue), idx: 0, hearts: null, xp: 0,
    startedAt: now, day: today, dayIndex: 0, pageIndex: 0, meta: null,
  };
  let combo = 0;
  let n = 0;
  const answers = [];
  for (let i = 0; i < 400; i++) {
    if (n >= stopAt) break;
    const ip = resumePage(save);
    if (!ip || ip.idx >= ip.queue.length) break;
    const idx = ip.idx;
    const it = ip.queue[idx];
    const raw = script(++n);
    const result = writeLedgerA(save, it, raw, { now: gradeAt(n), today, combo });
    combo = nextCombo(combo, result);
    const r = { ...result, n: it.n, role: it.role, skill: it.skill ?? (it.skills || [])[0] ?? null, tier: it.tier };
    if (!result.cleared && (it.isReview || it.isRematch)) requeueReview(save, { idx, result: r });
    markItem(save, r, { idx });
    /* `screens/index.js` installs `trophies.install({bus,getState,update})`, which awards every
       satisfied trophy after EVERY grade, on both routes. Mirrored here (and in `runInJob`) at the
       same pinned clock, so `save.trophies` is a key the two arms actually write. */
    trophyEvaluate(save, { now: gradeAt(n) });
    answers.push({ id: it.id, raw });
  }
  /* The page's FINAL queue — requeued Rematches and all — held before `finishPage` nulls
     `inProgress`, because `run.js:finish()` records the results off the queue it just answered. */
  if (hold && save.inProgress) hold.queue = save.inProgress.queue.slice();
  if (n < stopAt) finishPage(save);
  return answers;
}

/**
 * ARM A′ — THE WHOLE flat path, including the three writes `run.js:finish()` makes AFTER
 * `finishPage`:
 *
 *     site/js/screens/run.js finish()
 *       if (kind === 'page') finishPage(s);
 *       pushRun(s, makeRunRecord({ … }));
 *       checkDailyGoal(s, todayISO(new Date(submittedAt)));
 *       logForecast(s, { today: todayISO(new Date(submittedAt)) });
 */
function runFlatScreen(save, queue, script, { now = NOW, today = TODAY } = {}) {
  const startedAt = now;
  const hold = {};
  const answers = runFlat(save, queue, script, { now, today, hold });
  const submittedAt = now + 60 * 60000;
  pushRun(save, makeRunRecord({
    kind: 'page', id: null, seed: 1, seedTag: null, startedAt, submittedAt,
    results: pageResults(hold.queue ?? []),
  }));
  checkDailyGoal(save, today);
  logForecast(save, { today });
  trophyEvaluate(save, { now: submittedAt });     // the installer fires on the finish() update too
  return answers;
}

/**
 * A run record MINUS the identity of the sitting that produced it. The two arms are genuinely two
 * different pages closed at two different instants — the flat page gets the harness's own
 * `seed: 1`, the game gets `composePage`'s real seed, and each stamps its own `submittedAt` — so
 * those three are dropped and EVERYTHING the record says about the study is compared exactly:
 * `kind`, `status`, `startedAt`, `limitMs`, `tabAway`, `xp`, `acc`, `flawless` and every item.
 */
const runShape = (rec) => {
  if (!rec) return null;
  const { seed, seedTag, submittedAt, ...rest } = rec;
  return rest;
};

/**
 * ARM B — the game. The SAME `writeLedgerA`, at the same beat, with `state.js` wrapped around it —
 * AND the screen terminal every real session goes through (`screens/job.js finish()` →
 * `run.js commitJobRun`), which is where `runs[]`, the forecast point and the daily goal are filed.
 *
 * `terminal: false` plays the state machine ALONE, for the arms that are about `js/job/*` and must
 * not have a screen write in them.
 */
function runInJob(save, script, {
  now = NOW, today = TODAY, bankAt = () => false, callOf = null, terminal = true, stopAt = Infinity,
} = {}) {
  let t = now;
  startJob(save, { today, now: t });
  /* The screen's snapshot, taken where `screens/job.js` takes it: right after the session starts,
     off the RAW save (`captureJobBefore` reads Ledger A, so `js/job/*` cannot take it). */
  let jobQueue = queueOf(save).slice();            // SHALLOW, exactly as screens/job.js holds it:
  const jobBefore = captureJobBefore(state.unguard(save), jobQueue);   // markItem writes each item's result
  let combo = 0;
  let n = 0;
  const answers = [];
  for (let i = 0; i < 400; i++) {
    if (!state.stateOf(save) || targetsLeft(save) === 0 || n >= stopAt) break;
    /* re-read while the session is live, exactly as `render()` does: a missed review requeues a
       Rematch onto the page, and the record must carry it */
    if (queueOf(save).length) jobQueue = queueOf(save).slice();
    const offered = state.callsFor(save);
    const id = typeof callOf === 'function' ? callOf(answered(save) + 1, offered) : offered[offered.length - 1];
    lockCall(save, id, { now: (t += 5000), ms: 5000 });
    const it = state.currentItem(save);
    const raw = script(++n);
    t += 40000;
    /* Ledger A is written by the grade path, BEFORE the game is told anything */
    const result = writeLedgerA(state.unguard(save), it, raw, { now: gradeAt(n), today, combo });
    combo = nextCombo(combo, result);
    answerTarget(save, result, { now: t, ms: 40000 });
    trophyEvaluate(state.unguard(save), { now: gradeAt(n) });   // the same installer, same beat
    answers.push({ id: it.id, raw });
    if (bankAt(answered(save))) bank(save, { now: (t += 9000), ms: 9000 });
  }
  if (n < stopAt) {
    endJob(save, { now: (t += 1000), ms: 1000 });
    /* THE TERMINAL — `screens/job.js finish()`, the one beat that writes Ledger A, and it writes it
       through the SCREEN, never through `js/job/*`. */
    if (terminal) {
      commitJobRun(state.unguard(save), { queue: jobQueue, before: jobBefore, now: t });
      trophyEvaluate(state.unguard(save), { now: t });
    }
  }
  return answers;
}

const ledgerOf = (save, keys = COMPARED) => Object.fromEntries(keys.map((k) => [k, clone(save[k])]));

/* ========================================================================================== */
describe('byte-identical Ledger A: in the game, and through #/run/page', () => {
  for (let i = 0; i < 6; i++) {
    test(`corpus save ${i}: cards · skills · xp · errors · counters · forecastLog all agree`, () => {
      const base = CORPUS[i];
      const script = scriptFor(i);

      /* build the session first, so the flat arm can answer the SAME queue in the SAME order */
      const job = clone(base);
      const flat = clone(base);
      const bankAt = (n) => n % 3 === 0;

      const probe = clone(base);
      startJob(probe, { today: TODAY, now: NOW });
      const queue = clone(queueOf(probe));
      assert.ok(queue.length >= 6, `corpus ${i} composed only ${queue.length} questions`);

      const flatAnswers = runFlatScreen(flat, queue, scriptFor(i));
      const jobAnswers = runInJob(job, script, { bankAt });

      assert.deepEqual(jobAnswers.map((a) => a.id), flatAnswers.map((a) => a.id), 'the two arms answered different items');
      for (const k of COMPARED) {
        assert.deepEqual(job[k], flat[k], `${k} differs between the game and the flat page`);
      }
      assert.equal(JSON.stringify(ledgerOf(job)), JSON.stringify(ledgerOf(flat)), 'Ledger A is not byte-identical');
    });
  }

  test('every Ledger A key agrees, not only the six the proof names', () => {
    const base = CORPUS[6];
    const queueProbe = clone(base);
    startJob(queueProbe, { today: TODAY, now: NOW });
    const queue = clone(queueOf(queueProbe));
    const job = clone(base);
    const flat = clone(base);
    runFlatScreen(flat, queue, scriptFor(6));
    runInJob(job, scriptFor(6), { bankAt: (n) => n % 2 === 0 });
    for (const k of ALL_LEDGER_A) {
      if (k === 'runs') continue;                  // compared through `runShape` — see THE RUN RECORD
      assert.deepEqual(job[k], flat[k], `${k} differs`);
    }
    assert.deepEqual((job.runs ?? []).map(runShape), (flat.runs ?? []).map(runShape),
      'the two arms recorded different pages');
  });

  test('the answer sequence really did move Ledger A — the comparison is not vacuous', () => {
    const base = CORPUS[0];
    const before = ledgerOf(base);
    const job = clone(base);
    runInJob(job, scriptFor(0), { bankAt: () => false });
    assert.notDeepEqual(ledgerOf(job), before, 'nothing was studied');
    assert.ok(job.xp > num(base.xp, 0), 'no XP was earned');
    assert.ok(job.counters.clears > 0);
    assert.ok(job.counters.pages === 1, 'finishPage did not run');
  });

  test('Readiness is computed from the same inputs, so it lands on the same number', () => {
    const base = CORPUS[3];
    const probe = clone(base);
    startJob(probe, { today: TODAY, now: NOW });
    const queue = clone(queueOf(probe));
    const job = clone(base);
    const flat = clone(base);
    runFlatScreen(flat, queue, scriptFor(3));
    runInJob(job, scriptFor(3), { bankAt: (n) => n % 3 === 0 });
    assert.deepEqual(readiness(job), readiness(flat));
  });

  test('a session ABANDONED halfway leaves exactly the Ledger A of the same half-page', () => {
    const base = CORPUS[4];
    const probe = clone(base);
    startJob(probe, { today: TODAY, now: NOW });
    const queue = clone(queueOf(probe));
    const half = Math.max(1, Math.floor(queue.length / 2));

    const job = clone(base);
    runInJob(job, scriptFor(4), { stopAt: half });          // walked away mid-session: no endJob

    const flat = clone(base);
    runFlat(flat, queue, scriptFor(4), { stopAt: half });   // and run.js calls no finishPage either

    for (const k of COMPARED) assert.deepEqual(job[k], flat[k], `${k} differs after an abandoned session`);
    assert.equal(job.counters.pages ?? 0, flat.counters.pages ?? 0);
    assert.ok(job.inProgress, 'the game took the rest of Today\'s Page away');
    assert.equal(job.inProgress.idx, flat.inProgress.idx, 'the pointer differs');
    /* and the page is still there to be finished — on EITHER route (CUT-BRIEF: every unanswered
       question stays due) */
    assert.ok(job.inProgress.queue.length - job.inProgress.idx > 0, 'nothing is left to answer');
  });
});

/* ========================================================================================== */
describe('and it is structural: Ledger A is not reachable from js/job/*', () => {
  test('the save state.js runs against THROWS on every Ledger A write', () => {
    const save = clone(CORPUS[0]);
    const id = Object.keys(save.cards)[0];
    const s = guardSave(save);
    assert.throws(() => { s.xp += 1; }, LedgerError);
    assert.throws(() => { s.skills.VOC = { m: 100, n: 9 }; }, LedgerError);
    assert.throws(() => { s.cards[id].bucket = 5; }, LedgerError);
    assert.throws(() => { s.cards[id].rarity = 'platinum'; }, LedgerError);
    assert.throws(() => { s.cards[id].foil = true; }, LedgerError);
    assert.throws(() => { s.errors.push({}); }, LedgerError);
    assert.throws(() => { s.forecastLog.push({}); }, LedgerError);
    assert.throws(() => { s.cards[id].history.push({}); }, LedgerError);
    /* `counters` is SHARED by construction (`finishPage` writes `counters.pages`), so it is a NARROW
       proxy: `pages` — the single key `finishPage` writes — and nothing else. */
    assert.throws(() => { s.counters.clears = 999; }, LedgerError, 'counters is writable from js/job/*');
    assert.throws(() => { s.counters.mocks = 1; }, LedgerError);
    assert.throws(() => { delete s.counters.pages; }, LedgerError);
    assert.throws(() => { s.counters = { clears: 999 }; }, LedgerError, 'the whole counters object was replaceable');
    /* …and `streak` / `jumps`, which are published as "unchanged" */
    assert.throws(() => { s.streak.count = 999; }, LedgerError, 'streak is writable from js/job/*');
    assert.throws(() => { s.streak = { count: 9, best: 9, lastDay: null, freezes: 0 }; }, LedgerError);
    assert.throws(() => { s.jumps.M1 = true; }, LedgerError, 'jumps is writable from js/job/*');
    assert.deepEqual(save.counters, clone(CORPUS[0]).counters, 'a refused write still landed');
    assert.deepEqual(save.streak, clone(CORPUS[0]).streak, 'a refused write still landed');
  });

  test('the ONE key `counters` lets through is `pages`, and finishPage still writes it', () => {
    // The narrow proxy is only honest if the write it exists for still works through it — the same
    // `finishPage(s)` call `state.endJob` makes, on the guarded save.
    const save = clone(CORPUS[0]);
    const before = num(save.counters?.pages, 0);
    const s = guardSave(save);
    s.inProgress = {
      kind: 'page', seed: 1, seedTag: null, queue: [{ n: 1, id: 'x', role: 'weak', tier: 1 }],
      idx: 1, hearts: null, xp: 0, startedAt: NOW, day: TODAY, dayIndex: 0, pageIndex: 0, meta: null,
    };
    assert.ok(finishPage(s), 'finishPage refused to close the page through the guard');
    assert.equal(save.counters.pages, before + 1, '`finishPage`\'s own counter is blocked by the guard');
    // and it works on a save that has no `counters` at all — finishPage's own defensive branch
    const bare = clone(CORPUS[1]);
    delete bare.counters;
    const b = guardSave(bare);
    b.inProgress = {
      kind: 'page', seed: 1, seedTag: null, queue: [{ n: 1, id: 'x', role: 'weak', tier: 1 }],
      idx: 1, hearts: null, xp: 0, startedAt: NOW, day: TODAY, dayIndex: 0, pageIndex: 0, meta: null,
    };
    assert.ok(finishPage(b));
    assert.deepEqual(bare.counters, { pages: 1 });
    // …but that branch is not a hole: once `counters` exists it may not be replaced
    assert.throws(() => { b.counters = {}; }, LedgerError);
  });

  test('P(losing study progress) = 0: an all-miss session at the dearest call leaves Ledger A intact', () => {
    const base = CORPUS[2];
    const job = clone(base);
    const before = ledgerOf(job, ALL_LEDGER_A);
    /* no grade path runs at all — the game alone drives every beat */
    let t = NOW;
    startJob(job, { today: TODAY, now: t });
    for (let i = 0; i < 400; i++) {
      if (!state.stateOf(job) || targetsLeft(job) === 0) break;
      const offered = state.callsFor(job);
      lockCall(job, offered[offered.length - 1], { now: (t += 1000), ms: 1000 });
      answerTarget(job, MISS, { now: (t += 1000), ms: 1000 });
    }
    const over = endJob(job, { now: (t += 1000) });
    for (const k of ALL_LEDGER_A) {
      if (k === 'counters') continue;                      // finishPage's `pages` counter is the flat path's
      assert.deepEqual(job[k], before[k], `${k} was staked`);
    }
    assert.equal(over.points, 0, 'a wipeout paid something');
    assert.equal(job.game.today, 0, 'a wipeout banked points');
    assert.equal(job.player.best, num(base.player?.best, 0), 'a wipeout moved the best day');
  });
});

/* ==========================================================================================
   THE VACUITY AUDIT, and the gap the honest flat path exposes
   ========================================================================================== */

describe('the comparison is not vacuous, and where it still is, it says so', () => {
  /** Did this key actually MOVE during the play? A key that never moves proves nothing. */
  function moved(base, after, key) {
    return JSON.stringify(base[key] ?? null) !== JSON.stringify(after[key] ?? null);
  }

  test('every key the byte-identity test compares is actually WRITTEN by the play', () => {
    // Two arms comparing two untouched objects pass for free. This test names, per key, whether the
    // corpus exercises it — and fails when a key that used to be exercised stops being.
    const exercised = new Set();
    const empty = [];
    for (let i = 0; i < 6; i++) {
      const base = CORPUS[i];
      const probe = clone(base);
      startJob(probe, { today: TODAY, now: NOW });
      const queue = clone(queueOf(probe));
      const flat = clone(base);
      runFlatScreen(flat, queue, scriptFor(i));   // the WHOLE flat path, terminal included
      for (const k of ALL_LEDGER_A) if (moved(base, flat, k)) exercised.add(k);
    }
    for (const k of ALL_LEDGER_A) if (!exercised.has(k)) empty.push(k);
    for (const k of ['cards', 'skills', 'xp', 'errors', 'counters', 'forecastLog', 'runs', 'trophies']) {
      assert.ok(exercised.has(k), `${k} is compared but never written — the assertion on it is vacuous`);
    }
    /* and the one the arms genuinely cannot reach, NAMED rather than left to pass for free:
         jumps — JUMP-HERE marks on module ids: written by the placement screen, which neither arm
                 runs. Compared so a future write cannot land here unnoticed; the guard is what
                 actually holds it.
       THE LIST SHRANK AT THE DEMOLITION (notes/DEMOLISH.md), and that is recorded here because the
       assertion demands it: `variants`, `frozen` and `streak` used to be unreachable because the
       board DRAFTED 3 of 5 contracts and the arms answered ~45 % of the page. The game now runs the
       WHOLE composed page, so the corpus reaches Variant items (and their freeze/thaw) and the
       daily goal, and all three are written by the play that compares them. */
    assert.deepEqual(empty.sort(), ['jumps'],
      `these Ledger A keys are compared without ever being written: ${empty.join(', ')}. `
      + 'If the list has grown, the arm has stopped exercising something it used to; if it has shrunk, '
      + 'delete the name from this list so the shrinking is recorded.');
  });

  test('the variant, daily-goal and streak branches fire — they are not dead code in the writer', () => {
    const sv = clone(CORPUS[1]);
    const variantItem = {
      kind: 'variant', id: 'T-cs-lin-01#deadbeef', template: 'T-cs-lin-01', forCard: Object.keys(sv.cards)[0],
      skills: ['CS-LIN'], tier: 2, role: 'weak', n: 1, isReview: false,
    };
    const beforeVariants = Object.keys(sv.variants ?? {}).length;
    writeLedgerA(sv, variantItem, CLEAN, { now: NOW, today: TODAY, combo: 0 });
    assert.ok(Object.keys(sv.variants).length > beforeVariants, 'a cleared Variant wrote nothing to save.variants');
    assert.ok(sv.variants['T-cs-lin-01'].clears >= 1);
    assert.ok(sv.variants['T-cs-lin-01'].clearsGold >= 1, 'a clean first try is Gold');
    assert.deepEqual(sv.variants['T-cs-lin-01'].goldDays, [TODAY]);

    const sv2 = clone(CORPUS[1]);
    const beforeFrozen = Object.keys(sv2.frozen ?? {}).length;
    writeLedgerA(sv2, variantItem, MISS, { now: NOW, today: TODAY, combo: 0 });
    assert.ok(Object.keys(sv2.frozen ?? {}).length > beforeFrozen,
      'a missed Variant was not frozen — card.js is not being mirrored');

    // a cleared Variant THAWS the frozen copy, which is the other half of the pair
    writeLedgerA(sv2, variantItem, CLEAN, { now: NOW + 60000, today: TODAY, combo: 0 });
    assert.equal(Object.keys(sv2.frozen ?? {}).length, beforeFrozen, 'clearing it did not thaw the frozen copy');

    // the daily goal and the streak, driven through the composed queue where they DO fire
    let goalMet = 0; let streakDays = 0; let compared = 0;
    for (let i = 0; i < 10; i++) {
      const base = CORPUS[i];
      const probe = clone(base);
      startJob(probe, { today: TODAY, now: NOW });
      const queue = clone(queueOf(probe));
      const flat = clone(base);
      runFlat(flat, queue, () => CLEAN);           // always clean: 400 XP is reachable
      if (flat.daily?.[TODAY]?.goalMet) goalMet++;
      if (flat.streak?.lastDay === TODAY && base.streak?.lastDay !== TODAY) streakDays++;
      if (flat.streak?.lastDay !== TODAY) continue;
      const job = clone(base);
      runInJob(job, () => CLEAN);
      assert.deepEqual(job.streak, flat.streak,
        `save ${i}: the game and the flat page disagree about the STREAK — it is published unchanged`);
      assert.equal(job.streak.lastDay, TODAY, `save ${i}: the game route did not stamp the streak day`);
      compared++;
    }
    assert.ok(goalMet > 0, 'no corpus save reached the daily goal — `daily.goalMet` is still vacuous');
    assert.ok(streakDays > 0, 'the goal was met but `store.markStreakDay` never stamped today');
    assert.ok(compared > 0, 'the streak comparison above never ran — it proves nothing');
  });

  test('THE RUN RECORD: the game files the page record, the forecast point and the daily goal the flat page files', () => {
    const base = CORPUS[7];
    const probe = clone(base);
    startJob(probe, { today: TODAY, now: NOW });
    const queue = clone(queueOf(probe));

    const flat = clone(base);
    const flatAnswers = runFlatScreen(flat, queue, scriptFor(7));
    const job = clone(base);
    const jobAnswers = runInJob(job, scriptFor(7), { bankAt: (n) => n % 3 === 0 });
    assert.deepEqual(jobAnswers.map((a) => a.id), flatAnswers.map((a) => a.id), 'the two arms answered different items');

    // both routes write exactly one record for the page they closed
    assert.equal((flat.runs ?? []).length, (base.runs ?? []).length + 1, 'the flat path wrote no run record');
    assert.equal((job.runs ?? []).length, (base.runs ?? []).length + 1,
      'the game wrote no runs[] record — screens/job.js → run.js commitJobRun is the writer');
    assert.equal(job.runs.at(-1).kind, 'page', 'a session IS Today\'s Page, and its record says so');
    assert.equal(job.runs.at(-1).status, 'done');

    // …and the two records describe the same study, item for item
    assert.deepEqual(runShape(job.runs.at(-1)), runShape(flat.runs.at(-1)),
      'the game and the flat page recorded different study for the same answers');
    /* every ANSWER is in the record, not only the questions the page was composed with: a missed
       review requeues a Rematch onto the queue mid-page, which is why `jobQueue` is re-read on every
       beat instead of being held from the start. */
    assert.equal(job.runs.at(-1).items.length, jobAnswers.length,
      'the record dropped questions — jobQueue must be the queue as it stood at the END');
    assert.ok(jobAnswers.length >= queue.length, 'the play answered fewer questions than the page held');
    assert.ok(job.runs.at(-1).xp > 0 && job.runs.at(-1).items.length > 0,
      'the record is empty, so comparing it proves nothing');

    /* The three fields `runShape` drops are the identity of the SITTING, and they are checked here
       rather than waived: the game's record carries `composePage`'s own seed for the page it closed
       (`commitJobRun` reads it off the before-snapshot, because `finishPage` has already cleared
       `inProgress` by then), while the flat arm's page is the harness's own `seed: 1`. */
    assert.equal(job.runs.at(-1).seed, probe.inProgress.seed, 'the game\'s record lost the page seed');
    assert.equal(job.runs.at(-1).seedTag, probe.inProgress.seedTag, 'the game\'s record lost the page seedTag');
    assert.equal(job.runs.at(-1).startedAt, flat.runs.at(-1).startedAt, 'both pages started at NOW');

    /* THE WHOLE PAGE, and no subset of it. The board that drafted 3 of 5 contracts is cut
       (notes/DEMOLISH.md): the game runs `composePage`'s queue, so the row it writes covers the same
       page the flat row covers, and the `drafted` / `composed` / `partial` provenance the draft
       needed is gone with it. */
    const deal = composedCountOf(probe.inProgress);
    const rec = job.runs.at(-1);
    const distinctAnswered = new Set(rec.items.map((it) => it.id)).size;
    assert.equal(distinctAnswered, deal,
      `the game must answer the whole composed page (${distinctAnswered} of ${deal})`);
    assert.equal(Object.hasOwn(rec, 'partial'), false,
      'a row carries no size provenance any more — there is no draft to be partial of');
    assert.equal(Object.hasOwn(flat.runs.at(-1), 'partial'), false,
      'a flat page row carries no size provenance — the study route is untouched');

    // the forecast point and the daily goal, the other two writes of the same terminal
    assert.ok((job.forecastLog ?? []).length > (base.forecastLog ?? []).length, 'the game logged no forecast point');
    assert.deepEqual(job.forecastLog, flat.forecastLog, 'the two routes logged different forecasts');
    assert.deepEqual(job.daily, flat.daily, '`checkDailyGoal` ran on one route and not the other');

    /* THE CONTROL: `js/job/*` writes none of this. Play the same session with the screen terminal
       switched off and the record is not there — which is what keeps "Ledger A is not reachable from
       js/job/*" a claim about the game layer rather than an accident of where this harness stops. */
    const bare = clone(base);
    runInJob(bare, scriptFor(7), { bankAt: (n) => n % 3 === 0, terminal: false });
    assert.equal((bare.runs ?? []).length, (base.runs ?? []).length,
      'js/job/* wrote a runs[] record — Ledger A must come from the screen, through guardSave');
    assert.equal((bare.forecastLog ?? []).length, (base.forecastLog ?? []).length,
      'js/job/* logged a forecast point');

    // and the study keys agree, which is the rest of the proof
    for (const k of COMPARED) {
      assert.deepEqual(job[k], flat[k], `${k} differs between the game and the full flat path`);
    }
  });

  /**
   * THE TROPHIES. Trophies are driven by the run summary, so a route that writes no run record
   * cannot earn a run trophy the identical flat play earns. **A session loses nothing** — and since
   * the draft is cut, it runs the whole page, so `flawless-page` follows the page on both routes.
   */
  test('THE TROPHIES: an all-clean session earns everything the identical flat play earns, and loses nothing', () => {
    const allClean = () => CLEAN;
    let checked = 0;
    for (let i = 0; i < 4; i++) {
      const base = CORPUS[i];
      const probe = clone(base);
      startJob(probe, { today: TODAY, now: NOW });
      const queue = clone(queueOf(probe));
      if (!queue.length) continue;

      const flat = clone(base);
      runFlatScreen(flat, queue, allClean);
      const job = clone(base);
      runInJob(job, allClean, { bankAt: () => false });

      const flatT = trophyCheck(flat).sort();
      const jobT = trophyCheck(job).sort();
      const lost = flatT.filter((id) => !jobT.includes(id));
      const gained = jobT.filter((id) => !flatT.includes(id));

      assert.ok(flatT.includes('flawless-page'),
        `save ${i}: the all-clean FLAT page did not earn flawless-page — the control is broken, not the game`);
      assert.ok(jobT.includes('flawless-page'),
        `save ${i}: the all-clean session did not earn flawless-page — it answered the same whole page`);
      assert.deepEqual(lost, [],
        `save ${i}: a session LOST ${lost.map((id) => `${id} (${trophyById[id]?.group})`).join(', ')} — `
        + 'trophies are published unchanged');

      /* `save.trophies` is the AWARDED set — written by `trophies.install`'s listener in the app and
         by `trophyEvaluate` at the same beats in both arms here. */
      const flatAwarded = Object.keys(flat.trophies ?? {}).sort();
      const jobAwarded = Object.keys(job.trophies ?? {}).sort();
      assert.ok(flatAwarded.length > 0, `save ${i}: nothing was awarded at all — the comparison is vacuous`);
      const missing = flatAwarded.filter((id) => !jobAwarded.includes(id));
      assert.deepEqual(missing, [],
        `save ${i}: the session's save is missing an awarded trophy the flat save holds`);

      /* Anything the session earned and the flat page did not is proved to come from LEDGER B by
         transplant — give the flat arm the session's `game` + `player` and the trophy must appear.
         Neither key is in `LEDGER_A_KEYS`, which is what makes the transplant legitimate. */
      for (const k of ['game', 'player']) {
        assert.equal(LEDGER_A_KEYS.includes(k), false, `${k} is Ledger A — this transplant would beg the question`);
      }
      const flatWithLedgerB = trophyCheck({ ...flat, game: job.game, player: job.player });
      for (const id of gained) {
        assert.ok(flatWithLedgerB.includes(id),
          `save ${i}: the session earned ${id} (${trophyById[id]?.group}) and Ledger B does NOT explain it`);
      }
      checked++;
    }
    assert.equal(checked, 4, 'four corpus saves, each played twice');
  });
});

/* ==========================================================================================
   THE SWITCH IS A DOOR — `settings.game = false` is byte-identical COMPOSED

   CUT-BRIEF puts this sentence inside "The Law of Two Ledgers", two lines under the one this file is
   named for, so it is proved here.

   ROUND 1 (study-untouched). The test that carried this claim — `cut-integrate.test.mjs`'s
   `'settings.game = false is byte-identical COMPOSED'` — called `composePage` zero times, `buildRun`
   zero times and touched no routing: it checked a migration, `plan.nextActionFor`, and a source grep.
   Three surfaces decide what a student is actually asked, and it checked none of them. A test whose
   NAME is a promise has to fail when the promise is broken, so the three surfaces are driven below,
   differentially: the same save, the flag on and the flag off, output compared byte for byte.

   Differential rather than a pinned snapshot on purpose. A committed snapshot of one commit's output
   asserts the composer never changes — which it may, legitimately, for reasons that have nothing to
   do with the game — and it rots the day it does. What CUT-BRIEF actually promises is narrower and
   permanent: THE FLAG CHANGES NOTHING. That is what is asserted.
   ========================================================================================== */

import { buildRun, RUN_KINDS } from '../site/js/screens/run.js';
import { ROUTE_PATTERNS } from '../site/js/app.js';
import { startPage, composePage as compose } from '../site/js/page.js';
import { listFiles, read as readRepo, stripCommentsAndStrings } from './_helpers.mjs';

/** The same save, twice, differing only in the one flag. */
const bothWays = (save) => [
  { ...clone(save), settings: { ...clone(save.settings), game: true } },
  { ...clone(save), settings: { ...clone(save.settings), game: false } },
];

describe('the switch is a door: settings.game = false is byte-identical COMPOSED', () => {
  test('the COMPOSER: the same page, item for item, with the game on and off', () => {
    let checked = 0;
    for (const [i, base] of CORPUS.entries()) {
      const [on, off] = bothWays(base);
      const a = compose(on, { now: NOW, today: TODAY });
      const b = compose(off, { now: NOW, today: TODAY });
      assert.equal(JSON.stringify(b), JSON.stringify(a), `save ${i}: the flag changed what is studied`);
      /* …and composing left the two saves identical too, the flag itself aside: no flag-shaped side
         effect on Ledger A, on `inProgress`, or on the page counters the composer reads next time. */
      const bare = (s) => JSON.stringify({ ...s, settings: { ...s.settings, game: null } });
      assert.equal(bare(off), bare(on), `save ${i}: composing diverged the two saves`);
      assert.ok(a.queue.length > 0, `save ${i}: an empty page proves nothing`);
      checked++;
    }
    assert.equal(checked, CORPUS.length);
  });

  test('the QUEUE ON DISK: `startPage` writes the same `inProgress` either way', () => {
    for (const [i, base] of CORPUS.entries()) {
      const [on, off] = bothWays(base);
      startPage(on, { now: NOW, today: TODAY });
      startPage(off, { now: NOW, today: TODAY });
      assert.equal(JSON.stringify(off.inProgress), JSON.stringify(on.inProgress),
        `save ${i}: the flag changed the queue that was written to the disk`);
    }
  });

  test('the DRILL, and every other run the app can build', () => {
    /* `buildRun` is the other place items are chosen — Drill 5, the Daily, the Missed loop, the
       Upgrade run. `RUN_KINDS` is run.js's own list, so a new kind is covered the day it is added. */
    assert.ok(RUN_KINDS.includes('drill') && RUN_KINDS.includes('page'), `RUN_KINDS is ${RUN_KINDS}`);
    let built = 0;
    for (const [i, base] of CORPUS.entries()) {
      const [on, off] = bothWays(base);
      for (const kind of RUN_KINDS) {
        const a = buildRun(kind, on, { now: NOW, today: TODAY });
        const b = buildRun(kind, off, { now: NOW, today: TODAY });
        assert.equal(JSON.stringify(b), JSON.stringify(a), `save ${i}: \`${kind}\` differs with the flag`);
        if (a && a.items && a.items.length) built++;
      }
    }
    assert.ok(built > 0, 'every run built empty — this test would pass on a broken builder');
  });

  test('the ROUTER: thirteen patterns, and the game is not a fourteenth', () => {
    assert.equal(ROUTE_PATTERNS.length, 13, 'the game layer added a route');
    assert.equal(ROUTE_PATTERNS.filter((p) => String(p).includes('job')).length, 0,
      '`job` is a route pattern — the game is supposed to be the run screen with a different top strip');
  });

  test('and only the door itself reads the flag — no study module does', () => {
    /* The door is the switch, the plan that offers the session, Home's button and the mount that
       refuses. NOTHING that decides what is asked may read it, and this is the assertion that keeps
       the two differential tests above from quietly becoming true for the wrong reason. */
    const DOORS = ['js/store.js', 'js/plan.js', 'js/screens/job.js', 'js/screens/home.js', 'js/screens/settings.js'];
    const readers = [];
    for (const abs of listFiles('site/js')) {
      const rel = abs.slice(abs.indexOf('site/js/') + 'site/'.length);
      const code = stripCommentsAndStrings(readRepo(`site/${rel}`));
      if (/settings\s*\.\s*game\b|\bgameOn\b|\bgameIsOn\b/.test(code)) readers.push(rel);
    }
    assert.deepEqual(readers.sort(), [...DOORS].sort(),
      'a module outside the door now reads settings.game');
    for (const quiet of ['js/page.js', 'js/screens/run.js', 'js/screens/card.js', 'js/xp.js',
      'js/mastery.js', 'js/schedule.js', 'js/readiness.js', 'js/rarity.js']) {
      assert.equal(readers.includes(quiet), false, `${quiet} reads the game flag`);
    }
  });
});
