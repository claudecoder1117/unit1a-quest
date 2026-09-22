// tests/run-lane-r1.test.mjs — the run lane's round-1 fixes (notes/run-fix.md).
//
// Three findings, three sections. Each one asserts the BEHAVIOUR that was missing, and then pins the
// specific expression that made the old behaviour wrong so it cannot come back:
//
//   1. BLOCKER — the debrief printed `0 ms idle` as a measured fact. `state.debriefOf` derives
//      `wall` as `tGame + tAnswer`, and `sessionSplit` subtracted `tGame + tAnswer` from it, so the
//      printed quantity was `x − x` for every session the app can produce. It is now measured
//      against `inProgress.startedAt`, a clock that never passes through `setPhase`.
//
//   2. MAJOR — the guard bars are the redraw (post-heat-fold, i.e. NEXT board) and the page headed
//      them "The guard" over "drawn this job: ALGEBRA", which reads as *these are the odds, this is
//      the one that came up*. A 25 % draw printed under a 31 % bar.
//
//   3. MAJOR — G5 ranks its retention hooks and #1, "Tomorrow's board is computable tonight, so it
//      is printed tonight", was not built at all: `grep -rn dueList site/js/screens/` found nothing.
//
// Everything here is pure: it imports `screens/run.js`, `schedule.js` and `data/*` and never touches
// `js/job/state.js`, so a broken machine cannot make these pass or fail for the wrong reason.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { read, stripCommentsAndStrings as strip } from './_helpers.mjs';

import * as run from '../site/js/screens/run.js';
import { fresh } from '../site/js/store.js';
import { applyOutcome, DAY_MS, dueList } from '../site/js/schedule.js';
import { todayISO, addDays } from '../site/js/days.js';
import { rngFrom } from '../site/js/rng.js';
import { cards as ALL_CARDS, byId as cardById } from '../site/data/cards.js';
import { isBonus } from '../site/data/source-manifest.js';
import { SKILL_IDS } from '../site/data/skills.js';
import { WING_IDS } from '../site/data/job.js';

const RUN_SRC = read('site/js/screens/run.js');
const RUN_CODE = strip(RUN_SRC);

const NOW = new Date(2026, 8, 16, 18, 0).getTime();
const TODAY = todayISO(new Date(NOW));
const BANK = ALL_CARDS.filter((c) => !isBonus(c.id));

/** A save with real Leitner records, real skills and a real job log. No `Math.random` anywhere. */
function seededSave(tag = 'r1') {
  const rng = rngFrom('run-r1', tag);
  const s = fresh(NOW - 9 * DAY_MS);
  s.profileId = `run-r1-${tag}`;
  s.settings.testDate = addDays(TODAY, 6);
  for (let k = 0; k < 60; k++) {
    const c = BANK[rng.int(0, BANK.length - 1)];
    let rec = null;
    for (let r = 0; r < 3; r++) rec = applyOutcome(s, c.id, rng.chance(0.7) ? 'clean' : 'wrong', { now: NOW - (30 - r * 4) * DAY_MS });
    if (!rec) continue;
    rec.cleared = true;
    /* half already due tonight, half due inside the next two days — so "tomorrow" is a DIFFERENT
       board from tonight's, which is the only reading under which the line is worth printing. */
    rec.due = NOW + (rng.chance(0.5) ? -rng.float(0, 6) : rng.float(0.1, 1.9)) * DAY_MS;
  }
  for (const id of SKILL_IDS) {
    if (!rng.chance(0.8)) continue;
    s.skills[id] = { m: rng.int(15, 92), n: rng.int(1, 8), lastAt: NOW - rng.int(1, 18) * DAY_MS, lastDueCorrectAt: null };
  }
  return s;
}

/** What `state.debriefOf` produces, exactly: `wall` is DERIVED as the sum of the two accumulators. */
const debriefLike = ({ tGame, tAnswer }) => Object.freeze({
  shape: 'JOB', tGame, tAnswer, wall: tGame + tAnswer,
  split: tGame / (tGame + tAnswer), decisions: 24, perItem: 2.4, calls: [], briefs: [],
});

/* ================================================================================================
   1. The idle number is a measurement
   ================================================================================================ */

describe('run r1 §1 — `N ms idle` is a difference of two clocks, not of one clock with itself', () => {
  const job = debriefLike({ tGame: 329_456, tAnswer: 421_987 });
  const banked = job.tGame + job.tAnswer;

  test('the old expression is gone: `job.wall` can no longer reach `idle`', () => {
    /* `state.debriefOf`: `const wall = tGame + tAnswer` → `idle = wall − (tGame + tAnswer) ≡ 0`.
       Nothing in the split may read `job.wall` again, under any name. */
    const body = RUN_CODE.slice(RUN_CODE.indexOf('export function sessionSplit'));
    const fn = body.slice(0, body.indexOf('\n}\n') + 2);
    assert.ok(fn.length > 100 && fn.includes('idle'), 'sessionSplit was not located in the source');
    assert.equal(/job\?\.wall|job\.wall/.test(fn), false,
      `sessionSplit still reads the derived wall clock:\n${fn}`);
  });

  test('with no independent clock the line prints the absence, never a 0 it did not take', () => {
    const split = run.sessionSplit(job, null);
    assert.equal(split.idleMeasured, false);
    assert.equal(split.idle, 0);
    assert.match(RUN_SRC, /idleMeasured \? `\$\{split\.idle\} ms idle` : 'idle not measured'/,
      'the split line must print the absence when nothing was measured');
  });

  test('a real gap is printed as a real gap — 5 minutes off-phase reads 300 000 ms, not 0', () => {
    for (const gapMs of [0, 1, 1700, 300_000]) {
      const split = run.sessionSplit(job, null, { wall: banked + gapMs });
      assert.equal(split.idleMeasured, true);
      assert.equal(split.idle, gapMs, `a ${gapMs} ms gap must print as ${gapMs}`);
    }
  });

  test('the measured and credited splits are untouched by the new argument (J8 still holds)', () => {
    const save = { game: { ledger: { phaseMeans: { debrief: 40 } } } };
    const a = run.sessionSplit(job, save);
    const b = run.sessionSplit(job, save, { wall: banked + 9_999 });
    assert.equal(a.measured, b.measured);
    assert.equal(a.split, b.split);
    assert.equal(a.credit, 40_000);
    assert.equal(a.measured, job.tGame / banked);
  });

  test('captureJobBefore snapshots `inProgress.startedAt`, and patches a snapshot taken without it', () => {
    const save = seededSave('cap');
    save.inProgress = { kind: 'page', queue: [], idx: 0, startedAt: NOW - 600_000, meta: null };
    const a = run.captureJobBefore(save);
    assert.equal(a.startedAt, NOW - 600_000);
    assert.equal(run.captureJobBefore(save), a, 'still idempotent');

    /* a save written before this landed: the stored snapshot has no stamp, `inProgress` still does */
    delete a.startedAt;
    assert.equal(run.captureJobBefore(save).startedAt, NOW - 600_000, 'an older snapshot is patched');
  });

  test('the debrief context carries the clock, and FREEZES it — a re-render is not idle time', () => {
    const save = seededSave('ctx');
    save.inProgress = { kind: 'page', queue: [], idx: 0, startedAt: Date.now() - 750_000, meta: null };
    const before = run.captureJobBefore(save);
    const first = run.jobSummaryContext(save, job, { queue: [], before });
    assert.ok(Number.isFinite(first.wallMs), 'ctx.wallMs must be a number when the stamp is there');
    assert.ok(first.wallMs >= 750_000, `the clock must span the job (${first.wallMs} ms)`);
    const again = run.jobSummaryContext(save, job, { queue: [], before });
    assert.equal(again.wallMs, first.wallMs, 'a second build must not grow the number');
    assert.equal(run.sessionSplit(job, save, { wall: again.wallMs }).idle,
      run.sessionSplit(job, save, { wall: first.wallMs }).idle);
  });

  test('a context with no stamp reports no clock rather than a fabricated zero', () => {
    const save = seededSave('nostamp');
    const ctx = run.jobSummaryContext(save, job, { queue: [], before: { skills: [], readiness: {}, tiles: {} } });
    assert.equal(ctx.wallMs, null);
    assert.equal(run.sessionSplit(job, save, { wall: ctx.wallMs }).idleMeasured, false);
  });
});

/* ================================================================================================
   2. The guard bars say which board they are
   ================================================================================================ */

describe('run r1 §2 — the guard redraw is labelled as the redraw', () => {
  test('the heading names the board the bars belong to', () => {
    assert.match(RUN_SRC, /h\('h2\.fs-3', 'The guard · next board'\)/);
    assert.equal(RUN_SRC.includes("h('h2.fs-3', 'The guard')"), false,
      'a bare "The guard" heading over post-fold bars is the finding');
  });

  test('the bare note that read as this job\'s odds is gone', () => {
    assert.equal(RUN_SRC.includes('`drawn this job: ${guardWing}`'), false);
    assert.match(RUN_CODE, /guardNote\(guardWing, o\.guard\?\.dist \?\? null\)/);
  });

  test('the note leads with the board, then the draw, and prices the draw when it can', () => {
    const withDist = run.guardNote('ALGEBRA', { ALGEBRA: 0.25, RECALL: 0.25, FIGURES: 0.25, WORDS: 0.25 });
    assert.match(withDist, /^next board’s odds, after tonight’s press · drawn this job: ALGEBRA at 25 %$/,
      withDist);
    /* the live failure: a 25 % draw printed under a 31 % bar with nothing saying they differ */
    assert.ok(withDist.includes('25 %') && withDist.includes('next board'), withDist);

    const noDist = run.guardNote('ALGEBRA');
    assert.match(noDist, /^next board’s odds, after tonight’s press · drawn this job: ALGEBRA$/, noDist);
    assert.equal(/\d+ %/.test(noDist), false, 'no percentage may be invented when none was kept');

    const none = run.guardNote(null);
    assert.match(none, /^next board’s odds, after tonight’s press · no guard drew this job$/, none);
  });
});

/* ================================================================================================
   3. Tomorrow's board (G5 #1)
   ================================================================================================ */

describe('run r1 §3 — the debrief prints tomorrow\'s board', () => {
  const save = seededSave('tomorrow');

  test('it is built from `schedule.dueList`, which no screen called before', () => {
    assert.match(RUN_CODE, /dueList\(save, \{ now: at \}\)/, 'the schedule is read, not guessed');
    assert.match(RUN_CODE, /postedFor\(/, 'the price is `econ.postedFor`, not a local formula');
    assert.match(RUN_CODE, /tellDetail\(save, skill/, 'the tags are the index\'s own');
  });

  test('the clock is this moment tomorrow, and it agrees with dueList run at that moment', () => {
    const t = run.tomorrowBoard(save, { now: NOW });
    const d = new Date(NOW); d.setDate(d.getDate() + 1);
    assert.equal(t.at, d.getTime());
    assert.equal(t.locks, dueList(save, { now: t.at }).length, 'the count IS the schedule');
    assert.ok(t.locks > dueList(save, { now: NOW }).length,
      `tomorrow must be a different board from tonight (${t.locks} vs ${dueList(save, { now: NOW }).length})`);
  });

  test('every clause is recomputable from the save', () => {
    const t = run.tomorrowBoard(save, { now: NOW });
    assert.equal(t.cold + t.swept, t.locks);
    assert.ok(t.posted > 0 && Number.isInteger(t.posted), `posted ${t.posted}`);
    assert.ok(t.makes.length >= 1 && t.makes.length <= 2, 'the two heaviest makes, at most');
    for (const m of t.makes) {
      assert.ok(SKILL_IDS.includes(m.skill), `${m.skill} is not one of the 19 makes`);
      assert.ok(m.locks > 0 && typeof m.name === 'string' && m.name.length > 0);
    }
    if (t.makes.length === 2) assert.ok(t.makes[0].locks >= t.makes[1].locks, 'heaviest first');
    for (const tag of t.tags) assert.equal(typeof tag, 'string');
  });

  test('the one tap is a real route on a named make', () => {
    const t = run.tomorrowBoard(save, { now: NOW });
    assert.ok(t.drill, 'G5 #1 promises one tap to #/run/drill on the named weak skill');
    assert.equal(t.drill.href, `#/run/drill/${t.drill.skill}`);
    assert.ok(t.makes.some((m) => m.skill === t.drill.skill), 'the drill must be on a NAMED make');
    assert.match(RUN_SRC, /h\('a\.btn\.sum-tomorrow-drill', \{ href: t\.drill\.href \}/);
  });

  test('the safe-wing run is read off `game.log`, and ignores jobs that posted nothing', () => {
    const s = seededSave('safe');
    s.game = { ...(s.game ?? {}), log: [
      { guard: 'FIGURES' }, { guard: null }, { guard: 'RECALL' }, { guard: 'ALGEBRA' }, { guard: 'WORDS' },
    ] };
    const t = run.tomorrowBoard(s, { now: NOW });
    assert.deepEqual(t.safe, { wing: 'FIGURES', jobs: 3 },
      'FIGURES drew 3 guarded jobs ago; the null-guard job is not evidence either way');
    assert.ok(WING_IDS.includes(t.safe.wing));
    assert.equal(run.tomorrowBoard({ ...s, game: { ...s.game, log: [] } }, { now: NOW }).safe, null);
  });

  test('the line is G5\'s own shape, and every clause drops on its own', () => {
    const t = run.tomorrowBoard(save, { now: NOW });
    const line = run.tomorrowLine(t);
    assert.match(line, /^Tomorrow’s board: /);
    /* r3 — the worth clause used to read `posted ${t.posted}`, the same word the take block prints
       over the DRAFTED job's posted two blocks up, with `COPY.deflation` between them. It is the
       whole backlog (no draft, no shape cap), so it now says so. */
    assert.ok(line.includes(`worth ${t.posted} if you took them all`), line);
    assert.equal(/\bposted\b/.test(line), false, `the backlog figure may not be called posted: ${line}`);
    for (const m of t.makes) assert.ok(line.includes(m.skill), `${m.skill} is not named: ${line}`);
    if (t.safe) assert.ok(line.includes(`${t.safe.wing} has been safe ${t.safe.jobs} job`), line);
    if (t.tags.length) assert.ok(line.includes(`bringing ${t.tags.join(', ')}`), line);
    assert.equal(/undefined|NaN|null/.test(line), false, line);

    const bare = { at: NOW, locks: 0, cold: 0, swept: 0, posted: 0, makes: [], safe: null, tags: [], drill: null };
    assert.equal(run.tomorrowLine(bare), 'Tomorrow’s board: nothing due — new locks only');
    assert.equal(run.tomorrowLine({ ...bare, locks: 1, cold: 1, posted: 12 }),
      'Tomorrow’s board: 1 cold lock · worth 12 if you take it', 'singular, and no make clause when none is named');
    assert.equal(run.tomorrowLine({ ...bare, locks: 3, cold: 2, swept: 1, posted: 40, makes: [{ skill: 'FAC2', locks: 2, name: 'x' }] }),
      'Tomorrow’s board: 2 cold locks on FAC2 + 1 swept · worth 40 if you took them all');
  });

  test('the tags it will bring are the index\'s own tells, not a guess', () => {
    const s = seededSave('tags');
    /* a live, unsealed fault on a make with dues — `index.tellDetail` reads `save.errors` and this
       is the same record the envelope will print as its tell tomorrow. */
    const due = dueList(s, { now: NOW + DAY_MS });
    const withMake = due.map((it) => ({ it, card: cardById[it.id] ?? (it.forCard ? cardById[it.forCard] : null) }))
      .find(({ card }) => (card?.skills || [])[0]);
    assert.ok(withMake, 'the fixture must have a due card on a real make');
    const make = withMake.card.skills[0];
    s.errors = [
      { item: withMake.card.id, tags: ['dropped-gcf'], t: NOW - DAY_MS },
      { item: withMake.card.id, tags: ['dropped-gcf'], t: NOW - 2 * DAY_MS },
    ];
    const t = run.tomorrowBoard(s, { now: NOW });
    if (t.makes.some((m) => m.skill === make)) {
      assert.deepEqual(t.tags, ['dropped-gcf'], `${make} brings its live tell`);
      assert.ok(run.tomorrowLine(t).endsWith('bringing dropped-gcf'), run.tomorrowLine(t));
    }
    /* and it prices it: a live tell is `econ.tellFor` ×1.25, so posted must move */
    const clean = run.tomorrowBoard({ ...s, errors: [] }, { now: NOW });
    assert.ok(t.posted >= clean.posted, `a live tell may not lower posted (${t.posted} vs ${clean.posted})`);
  });

  test('an empty save produces a line and no throw', () => {
    const empty = fresh(NOW);
    const t = run.tomorrowBoard(empty, { now: NOW });
    assert.equal(t.locks, 0);
    assert.equal(t.drill, null);
    assert.equal(run.tomorrowLine(t), 'Tomorrow’s board: nothing due — new locks only');
  });

  test('the block is the debrief\'s LAST block, and is empty on the flat Page Summary', () => {
    assert.match(RUN_SRC, /const jobTomorrow = job \? jobTomorrowBlock\(ctx\) : h\('div\.sum-job-tomorrow'\)/);
    assert.match(RUN_CODE, /rd, jobLedger, plan, jobTomorrow, actions\]/,
      'it must sit after the plan and before the buttons');
    /* an empty section is never appended (`if (node.childNodes.length)`), so the flat path's node
       list is byte-identical to what it was — which `job-debrief.test.mjs` measures. */
    assert.match(RUN_CODE, /if \(node\.childNodes\.length\) root\.append\(node\);/);
  });
});

/* every card the line prices must be resolvable to a make, or the "on A + B" clause is a lie */
test('run r1 — every due card resolves to a make through `cards.byId`', () => {
  const s = seededSave('resolve');
  const dues = dueList(s, { now: NOW + DAY_MS });
  assert.ok(dues.length > 5, `${dues.length} dues is too thin a corpus`);
  const unresolved = dues.filter((it) => {
    const card = cardById[it.id] ?? (it.forCard ? cardById[it.forCard] : null);
    return !card || !(card.skills || [])[0];
  });
  assert.equal(unresolved.length, 0, `unresolved: ${unresolved.map((u) => u.id).join(', ')}`);
});
