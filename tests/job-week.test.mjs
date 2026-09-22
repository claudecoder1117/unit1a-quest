// tests/job-week.test.mjs — J11: the week, quiet hours, the Mock and the boss.
//
// The ticket's acceptance list, in order:
//   1  D = 2 posts the REVIEW BOARD (no vault, no guard, flat ladder)
//   2  D = 1 posts nothing and links #/run/night; Clean Getaway pays the stamp + 1 Backcheck
//   3  D = 0 posts no stakes
//   4  after 22:00 no board posts; a job in progress auto-bags at the next target boundary at FULL
//      value; continued play has stakes and calls off
//   5  any shape whose PROJECTED end time passes 22:00 is refused with the one-tap alternative and the
//      real end time — COMPUTED, never a 21:30 constant
//   6  Mon–Fri 07:00–14:15 posts RUN only
//   7  a BOUND commit auto-bags at the declared minute, pays +8 %, forfeits the completion bonus, and
//      sends the rest to Today's Page
//   8  the Mock has no call / stake / crew / chain node in the DOM; its prediction scores through
//      call.credit at w = 1.0
//   9  a vault boss keeps 3 hearts, CONTINUE? and KO semantics
//  10  COMPOSED Global rule 1 — rank gates the 95 call and the guard multiplier and NOTHING ELSE
//
// Plus the four PINS the two-pass board needs, because Home may not import plan.js (home-r2.test.mjs,
// G10 #21) and therefore carries a static copy of the week gate:
//   home.weekGate ≡ plan.boardPolicy · home.postedCountEstimate ≡ page.postedCountFor ·
//   home's NIGHT_MIN ≡ night.NIGHT_MINUTES ≡ plan.NIGHT_BEFORE_MINUTES · home's shapeTable ≡ econ's
//
// No browser: the DOM claims are made against the shipped source the way every other screen ticket in
// this tree makes them, and every number is computed from the modules themselves.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { read, stripCommentsAndStrings as strip } from './_helpers.mjs';
import { fresh } from '../site/js/store.js';
import { todayISO, addDays, timeHM } from '../site/js/days.js';
import { applyOutcome, DAY_MS } from '../site/js/schedule.js';
import { rngFrom } from '../site/js/rng.js';
import { cards as ALL_CARDS } from '../site/data/cards.js';
import { isBonus } from '../site/data/source-manifest.js';
import { BANK_IDS } from '../site/data/blueprint.js';
import { skills as ALL_SKILLS } from '../site/data/skills.js';
import { readiness } from '../site/js/readiness.js';
import { updateSkill } from '../site/js/mastery.js';

import * as plan from '../site/js/plan.js';
import * as home from '../site/js/screens/home.js';
import * as mock from '../site/js/screens/mock.js';
import * as boss from '../site/js/screens/boss.js';
import * as night from '../site/js/screens/night.js';

import * as state from '../site/js/job/state.js';
import { postBoard } from '../site/js/job/board.js';
import { finalWordOf } from '../site/js/screens/job.js';
import { sessionSplit } from '../site/js/screens/run.js';
import * as call from '../site/js/job/call.js';
import * as guard from '../site/js/job/guard.js';
import * as econ from '../site/js/job/econ.js';
import { postedCountFor, nextAction } from '../site/js/page.js';
import { WEEK, SHAPES, REVIEW_BOARD, BACKCHECK, COMMIT_BONUS, COMPLETION, AUTO_BAG, CAPS, COPY, PUBLISHED, SPLIT, WING_IDS } from '../site/data/job.js';

const BANK = ALL_CARDS.filter((c) => !isBonus(c.id));
const clone = (x) => structuredClone(x);
const at = (y, m, d, hh, mm) => new Date(y, m - 1, d, hh, mm, 0, 0).getTime();

/** 2026-09-17 is a Thursday; 2026-09-19 a Saturday. Every clock below is LOCAL, as the app's are. */
const THU = { y: 2026, m: 9, d: 17 };
const SAT = { y: 2026, m: 9, d: 19 };

/* `screens/job.js` is the ROUTE's own file and no lane here owns it, but the week's two decisions —
   the entry gate and the bound declaration — are only decisions if something CALLS them. Round 2
   found both exported, tested and dead. These read the shipped source with comments and strings
   stripped, so a prose mention can never satisfy them: only a real call site can. */
const jobScreenCode = () => strip(read('site/js/screens/job.js'));
/** The body of `mountJob` — the door itself, between its `export function` and `function mount(`. */
function mountJobBody() {
  const src = jobScreenCode();
  const a = src.indexOf('export function mountJob');
  const b = src.indexOf('function mount(host');
  assert.ok(a >= 0 && b > a, 'screens/job.js must still define mountJob and mount');
  return src.slice(a, b);
}

/** A save whose test date puts it at `D` days out, at local time `hh:mm` on `day`. */
function saveAtD(D, { day = THU, hh = 19, mm = 0, seed = 1 } = {}) {
  const now = at(day.y, day.m, day.d, hh, mm);
  const today = todayISO(new Date(now));
  const s = fresh(now - 20 * DAY_MS);
  s.profileId = `week-${D}-${seed}`;
  s.settings.testDate = D == null ? null : addDays(today, D);
  const rng = rngFrom('job-week', D ?? -99, seed);
  for (let k = 0; k < 30; k++) {
    const c = BANK[rng.int(0, BANK.length - 1)];
    let rec = null;
    for (let r = 0; r < 3; r++) rec = applyOutcome(s, c.id, rng.chance(0.75) ? 'clean' : 'wrong', { now: now - (30 - r * 4) * DAY_MS });
    if (!rec) continue;
    rec.cleared = true;
    rec.rarity = 'gold';
    rec.due = now + (rng.chance(0.7) ? -rng.float(0, 9) : rng.float(0.2, 12)) * DAY_MS;
    rec.history = Array.from({ length: 10 }, (_, h) => ({ at: now - (20 - h) * DAY_MS, ok: rng.chance(0.75), attempt: 1, hints: 0, ms: 9000 }));
  }
  return { save: s, now, today };
}

/* ------------------------------------------------------------------------------------------------
   A REAL job, driven through the state machine on a clock that is nobody's published table.
   (REPAIR, r3 split-honesty MINOR: the projection arm below used to hand-write
   `tGame: 300000, tAnswer: 200000` and then assert `split === 60` — 300/(300+200) by construction,
   i.e. it verified that `boardModel` can divide. `playJob` gives the assertion a second clock:
   `state.endJob` writes the log entry this file then reads, and the pace is a student's, not a
   table's — a slow answerer who decides fast, so neither term is a constant this file owns.)
   ------------------------------------------------------------------------------------------------ */
const PACE = Object.freeze({ answerS: 47, decideS: 6, callS: 4, phaseS: 11 });

/** Play one job to its terminal and return the `game.log` entry `endJob` wrote. */
function playJob(save, { now, today, shape = 'JOB', pace = PACE, board = null } = {}) {
  let t = now;
  const step = (secs) => (t += Math.round(secs * 1000));
  state.startJob(save, { today, now: t, board: board ?? postBoard(save, today, { now: t, shape }) });
  state.tick(save, 'guard', step(pace.phaseS));
  state.beginTargets(save, { now: step(pace.phaseS) });
  for (let stop = 0; stop < 900; stop++) {
    const g = state.stateOf(save);
    if (!g || g.outcome != null) break;
    if (g.phase === 'envelope') { state.lockCall(save, 70, { now: step(pace.callS) }); continue; }
    if (g.phase === 'answer') { state.applyTarget(save, { ok: true, attempt: 1, hints: 0 }, { now: step(pace.answerS) }); continue; }
    if (g.phase === 'payout' || g.phase === 'bagpush') {
      const when = step(pace.decideS);
      if (state.targetsLeft(save) === 0) state.endJob(save, finalWordOf(save), { now: when, day: today });
      else state.push(save, { now: when });
      continue;
    }
    if (g.phase === 'brief') { state.brief(save, {}, { now: step(pace.phaseS) }); continue; }
    if (g.phase === 'getaway') { state.crack(save, { now: step(pace.phaseS) }); continue; }
    break;
  }
  const log = save.game?.log ?? [];
  return log[log.length - 1] ?? null;
}

/* ========================================================================================== */
describe('J11 #1 — D = 2 posts the REVIEW BOARD', () => {
  test('the policy is REVIEW_BOARD verbatim: no vault, no guard, no tokens, flat ladder, calls optional, Backchecks free', () => {
    const { save, now, today } = saveAtD(2);
    const p = plan.boardPolicy(save, { now, today });
    assert.equal(p.kind, 'review');
    assert.equal(p.post, true, 'D = 2 still posts a board — only the gambling frame leaves');
    assert.equal(p.vault, REVIEW_BOARD.vault, 'no vault');
    assert.equal(p.vault, false);
    assert.equal(p.guard, REVIEW_BOARD.guard);
    assert.equal(p.guard, false, 'no guard');
    assert.equal(p.tokens, false, 'no tokens');
    assert.equal(p.flatLadder, true, 'flat ladder');
    assert.equal(p.backchecksFree, true);
    assert.equal(p.calls, 'optional');
    assert.equal(p.stakes, true);
  });

  test('a READY boss cannot turn D = 2 into a VAULT — the shape is named, and it is never VAULT', () => {
    for (let seed = 0; seed < 6; seed++) {
      const { save, now, today } = saveAtD(2, { seed });
      const p = plan.boardPolicy(save, { now, today });
      assert.ok(p.shape != null, 'D = 2 names its own shape rather than deferring to job/board.js');
      assert.notEqual(p.shape, 'VAULT');
      assert.equal(SHAPES[p.shape].vault, false);
    }
  });

  test('the primary button says REVIEW BOARD, with targets, minutes, the end time and the split', () => {
    const { save, now, today } = saveAtD(2);
    const a = plan.jobAction(save, { now, today });
    assert.equal(a.kind, 'job');
    assert.match(a.label, /^REVIEW BOARD · \d+ targets · ~\d+ min · ends \d\d:\d\d · \d+ % game$/);
  });

  test('Home\'s static gate agrees, and its panel heading is the REVIEW BOARD', () => {
    const { save, now, today } = saveAtD(2);
    const g = home.weekGate(save, { now, today });
    assert.equal(g.kind, 'review');
    assert.equal(g.post, true);
    assert.equal(home.boardModel(save, { now, today }).gate.kind, 'review');
    /* r3: this arm used to assert the ternary `'REVIEW BOARD' : "Tonight's Board"` as a REGEX over
       home.js's source, which is green for a screen that prints the words and green for a screen
       that prints them twice — and home.js did print them twice: `COPY.boardTitle`,
       `COPY.reviewBoard` and `COPY.schoolWindow` all had zero call sites while this file re-typed
       their text (r3 finding on the copy lint's scope). The heading and the two week lines are now
       the table's, and this asserts the VALUES the screen prints, not the shape of its source. */
    assert.equal(COPY.boardTitle({ review: true }), 'REVIEW BOARD');
    assert.equal(COPY.boardTitle({ review: false }), "Tonight's Board");
    assert.match(strip(read('site/js/screens/home.js')), /COPY\.boardTitle\(\{ review:/,
      'the panel heading is COPY.boardTitle, not a literal');
    assert.equal(home.lineFor({ kind: 'review' }), COPY.reviewBoard());
    assert.equal(home.lineFor({ kind: 'school' }), COPY.schoolWindow());
    for (const s of ['REVIEW BOARD ·', 'School window ·', "Tonight's Board"]) {
      assert.ok(!read('site/js/screens/home.js').includes(`'${s}`) && !read('site/js/screens/home.js').includes(`"${s}`),
        `home.js re-types a string the table owns: ${s}`);
    }
  });
});

/* ========================================================================================== */
describe('J11 #2 — D = 1 posts nothing, links #/run/night, and pays the Clean Getaway', () => {
  test('no board posts and the href is #/run/night', () => {
    const { save, now, today } = saveAtD(1);
    const p = plan.boardPolicy(save, { now, today });
    assert.equal(p.kind, 'night');
    assert.equal(p.post, false, 'D = 1 posts nothing');
    assert.equal(p.href, '#/run/night');
    assert.equal(plan.jobAction(save, { now, today }), null, 'there is no job action at D = 1');
    assert.match(p.line, /^No board tonight · Night Before · ~30 min · ends \d\d:\d\d$/);
  });

  test('night wins: nextActionFor returns whatever page.nextAction said, untouched but for `.board`', () => {
    const { save, now, today } = saveAtD(1);
    const act = { kind: 'night', label: 'Night Before', href: '#/run/night' };
    const out = plan.nextActionFor(save, act, { now, today });
    assert.equal(out.kind, 'night');
    assert.equal(out.label, 'Night Before');
    assert.equal(out.href, '#/run/night');
    assert.equal(out.board.kind, 'night');
  });

  test('Clean Getaway: the stamp plus ONE Backcheck, once, and only after the Night Before is finished', () => {
    const { save, now, today } = saveAtD(1);
    assert.equal(save.player.records.cleanGetaway, false);
    assert.equal(plan.payCleanGetaway(clone(save), { now, today }).why, 'night-unfinished');

    const s = clone(save);
    s.runs.push({ kind: 'night', n: 1, seed: 'night#1', status: 'done', startedAt: now - 1800000, submittedAt: now });
    const held0 = s.game.backchecks.held;
    const r = plan.payCleanGetaway(s, { now, today });
    assert.equal(r.stamped, true);
    assert.equal(r.minted, 1, 'exactly one Backcheck');
    assert.equal(s.player.records.cleanGetaway, true);
    assert.equal(s.game.backchecks.held, held0 + 1);

    const again = plan.payCleanGetaway(s, { now, today });
    assert.equal(again.stamped, false);
    assert.equal(again.why, 'already-stamped');
    assert.equal(s.game.backchecks.held, held0 + 1, 'idempotent — the stamp is one-time');
  });

  test('the mint is capped at 3 and matches job/state.js mintBackcheck exactly', () => {
    const { save, now, today } = saveAtD(1);
    const s = clone(save);
    s.runs.push({ kind: 'night', n: 1, status: 'done' });
    s.game.backchecks.held = BACKCHECK.max;
    const r = plan.payCleanGetaway(s, { now, today });
    assert.equal(r.stamped, true, 'the stamp is paid even at the cap');
    assert.equal(r.minted, 0);
    assert.equal(s.game.backchecks.held, BACKCHECK.max);

    // the injected form runs job/state.js's own arithmetic: same held, same mintedDay
    for (const held of [0, 1, 2, 3]) {
      const a = clone(save); a.runs.push({ kind: 'night', status: 'done' }); a.game.backchecks.held = held;
      const b = clone(a);
      plan.payCleanGetaway(a, { now, today });
      plan.payCleanGetaway(b, { now, today, mint: state.mintBackcheck });
      assert.deepEqual(a.game.backchecks, b.game.backchecks, `held ${held}: the local mint is state.mintBackcheck`);
    }
  });

  test('`daily[iso].nightDone` is proof too (night.js writes both marks)', () => {
    const { save, now, today } = saveAtD(1);
    const s = clone(save);
    s.daily[today] = { xp: 0, clears: 0, goalMet: false, nightDone: true };
    assert.equal(plan.nightBeforeDone(s), true);
    assert.equal(plan.payCleanGetaway(s, { now, today }).stamped, true);
  });

  test('the layer off pays nothing', () => {
    const { save, now, today } = saveAtD(1);
    const s = clone(save);
    s.settings.game = false;
    s.runs.push({ kind: 'night', status: 'done' });
    assert.equal(plan.payCleanGetaway(s, { now, today }).why, 'layer-off');
    assert.equal(s.player.records.cleanGetaway, false);
  });
});

/* ========================================================================================== */
describe('J11 #3 — D = 0 posts no stakes', () => {
  test('Test Morning: a board, no stakes, no calls, and `Go.`', () => {
    const { save, now, today } = saveAtD(0, { hh: 6, mm: 30 });
    const p = plan.boardPolicy(save, { now, today });
    assert.equal(p.kind, 'morning');
    assert.equal(p.stakes, false, 'D = 0 posts NO stakes');
    assert.equal(p.calls, false);
    assert.equal(p.vault, false);
    assert.equal(p.guard, false);
    assert.equal(p.line, 'Go.');
    assert.equal(plan.jobAction(save, { now, today }), null, 'no job action on test morning');
    assert.equal(home.weekGate(save, { now, today }).kind, 'morning');
  });
});

/* ========================================================================================== */
describe('J11 #4 — after 22:00 the board closes; a live job auto-bags at FULL value', () => {
  test('no new board posts at or after 22:00, on every D the week has', () => {
    for (const D of [0, 1, 2, 3, 7, 12]) {
      for (const [hh, mm] of [[22, 0], [22, 1], [23, 59]]) {
        const { save, now, today } = saveAtD(D, { hh, mm });
        const p = plan.boardPolicy(save, { now, today });
        assert.equal(p.post, false, `D ${D} at ${hh}:${mm} must post no board`);
        assert.equal(p.kind, 'closed');
        assert.equal(home.weekGate(save, { now, today }).post, false);
      }
      const { save, now, today } = saveAtD(D, { hh: 21, mm: 59 });
      assert.notEqual(plan.boardPolicy(save, { now, today }).kind, 'closed', `D ${D} at 21:59 is not closed`);
    }
  });

  test('the closed line is COMPOSED\'s soft close, with `keep going anyway` beside it', () => {
    const { save, now, today } = saveAtD(5, { hh: 22, mm: 34 });
    const p = plan.boardPolicy(save, { now, today });
    assert.match(p.line, /^Board closed · Night Before · ~30 min · ends \d\d:\d\d$/);
    assert.equal(p.keepGoing, 'keep going anyway');
    assert.equal(p.href, '#/today', 'no study door is locked');
  });

  test('jobBoundary closes a live job at 22:00, at FULL value, and job/state.js banks 100 %', () => {
    const { save, now, today } = saveAtD(6, { hh: 21, mm: 40 });
    const s = clone(save);
    state.startJob(s, { today, now });
    state.beginTargets(s, { now: now + 6000 });
    const g = state.stateOf(s);
    g.loose = 140;
    g.bagged = 60;
    g.chain = 4;

    const late = at(THU.y, THU.m, THU.d, 22, 3);
    const b = plan.jobBoundary(s, { now: late });
    assert.equal(b.close, true);
    assert.equal(b.kind, 'quiet22');
    assert.equal(b.full, true);
    assert.equal(b.line, 'Banked at 22:00. Nothing lost.');
    assert.equal(AUTO_BAG.quiet22, 1.00, 'the quiet-hours auto-bag is FULL value');

    const out = state.quietClose(s, { now: late, end: false });
    assert.equal(out.banked, 200, '60 bagged + 140 loose, no fee');
    assert.equal(state.stateOf(s).loose, 0);
    assert.equal(state.stateOf(s).chain, 0);
  });

  test('continued play has stakes and calls off, and the studying is untouched', () => {
    const { save, now, today } = saveAtD(6, { hh: 21, mm: 40 });
    const s = clone(save);
    state.startJob(s, { today, now });
    state.beginTargets(s, { now: now + 6000 });
    const left = state.targetsLeft(s);
    state.quietClose(s, { now: at(THU.y, THU.m, THU.d, 22, 3), end: false });
    const g = state.stateOf(s);
    assert.equal(g.stakes, false, 'stakes off');
    assert.equal(g.phase, 'envelope', 'the page goes on');
    assert.equal(state.targetsLeft(s), left, 'no item was removed from the schedule');
    assert.equal(state.canLockCall(s, 85), false, 'calls off');
    assert.throws(() => state.lockCall(s, 85, { now: at(THU.y, THU.m, THU.d, 22, 4) }), /stakes-off/, 'and locking one is refused');
    assert.equal(state.hintsOn(), true, 'hints stay on — gates gate loot, not learning');
    assert.equal(COPY.quietReview(), 'REVIEW · no stakes');
  });

  test('before 22:00 a boundary closes nothing', () => {
    const { save, now, today } = saveAtD(6, { hh: 20, mm: 0 });
    const s = clone(save);
    state.startJob(s, { today, now });
    const b = plan.jobBoundary(s, { now });
    assert.equal(b.close, false);
    assert.equal(b.kind, null);
    assert.equal(b.stakes, true);
  });
});

/* ========================================================================================== */
describe('J11 #5 — a shape that would end after 22:00 is refused, computed from its own wall clock', () => {
  test('the refusal is the shape\'s OWN projected end time against 22:00, with the real times on both options', () => {
    const now = at(THU.y, THU.m, THU.d, 21, 50);
    const r = plan.refuseFor('JOB', { now });
    assert.ok(r, 'a JOB started at 21:50 ends after 22:00');
    const wall = PUBLISHED.shapeTable.JOB.wallS[0];
    assert.equal(r.ends, timeHM(new Date(now + wall * 1000)), 'the printed end time is the computed one');
    assert.equal(r.alt.shape, 'RUN');
    assert.equal(r.alt.ends, timeHM(new Date(now + PUBLISHED.shapeTable.RUN.wallS[0] * 1000)));
    assert.equal(r.alt.fits, true, 'the alternative really does fit');
    assert.equal(r.line, `that ends at ${r.ends} — take the ${r.alt.minutes}-minute RUN instead?`);
  });

  test('G12 #40e: the VAULT at 21:30 is NOT refused — the old 21:30 constant was mis-set', () => {
    const now = at(THU.y, THU.m, THU.d, 21, 30);
    const vault = plan.endsFor('VAULT', { now });
    assert.ok(vault.wallS <= 19 * 60 + 48, 'the VAULT is 7 targets, ≤ 19:48 (G10 #18)');
    assert.equal(plan.refuseFor('VAULT', { now }), null, '21:30 + 17:46 = 21:47, which is before 22:00');
    assert.equal(plan.refuseFor('JOB', { now }), null, '21:30 + 12:20 = 21:42');
    assert.equal(plan.refuseFor('RUN', { now }), null);
  });

  test('the wall is 22:00 exactly, and each shape flips at its own minute', () => {
    for (const shape of ['RUN', 'JOB', 'JOB12', 'VAULT']) {
      const wall = PUBLISHED.shapeTable[shape].wallS[0] * 1000;
      const limit = at(THU.y, THU.m, THU.d, 22, 0);
      const justFits = limit - wall;                       // ends at exactly 22:00
      const justMisses = justFits + 60000;
      assert.equal(plan.refuseFor(shape, { now: justFits }), null, `${shape} ending at 22:00 is allowed`);
      assert.ok(plan.refuseFor(shape, { now: justMisses }), `${shape} ending after 22:00 is refused`);
      assert.equal(plan.quietLimit(justFits), limit);
    }
  });

  test('the four shapes flip at four DIFFERENT clock times — so no single constant can be behind it', () => {
    const flips = new Set();
    for (const shape of ['RUN', 'JOB', 'JOB12', 'VAULT']) {
      let t = at(THU.y, THU.m, THU.d, 20, 0);
      for (; t < at(THU.y, THU.m, THU.d, 22, 0); t += 60000) if (plan.refuseFor(shape, { now: t })) break;
      flips.add(timeHM(new Date(t)));
    }
    assert.equal(flips.size, 4, `four shapes, four refusal times: ${[...flips].join(' ')}`);
  });

  test('no 21:30 constant exists anywhere in plan.js or home.js', () => {
    for (const p of ['site/js/plan.js', 'site/js/screens/home.js']) {
      const src = read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      assert.ok(!/21\s*[:*]\s*30/.test(src), `${p} names 21:30`);
      assert.ok(!/\b1290\b/.test(src), `${p} names 21:30 as a minute-of-day`);
    }
    assert.equal(WEEK.refuseIfEndsAfterHour, 22, 'the layer adds no new clock constant (G10 #25)');
  });

  test('the refused shape is still one tap away — Home offers both, and neither is removed', () => {
    const src = read('site/js/screens/home.js');
    assert.match(src, /refusal\.alt\.shape/);
    assert.match(src, /home-cta-alt/, 'the refused shape keeps a button of its own');
    assert.match(src, /\$\{refusal\.shape\} anyway · ends \$\{refusal\.ends\}/);
  });
});

/* ========================================================================================== */
describe('J11 #6 — Mon–Fri 07:00–14:15 posts the RUN shape only', () => {
  test('the window is exactly [07:00, 14:15) on Monday to Friday', () => {
    const cases = [
      [THU, 6, 59, false], [THU, 7, 0, true], [THU, 12, 0, true], [THU, 14, 14, true], [THU, 14, 15, false],
      [SAT, 9, 0, false], [SAT, 12, 0, false],
    ];
    for (const [day, hh, mm, want] of cases) {
      assert.equal(plan.inSchoolWindow(at(day.y, day.m, day.d, hh, mm)), want, `${day.d} ${hh}:${mm}`);
    }
    const sun = at(2026, 9, 20, 9, 0);
    assert.equal(plan.inSchoolWindow(sun), false, 'Sunday');
  });

  test('inside the window the posted shape is RUN, and only RUN', () => {
    for (const D of [3, 5, 9, 14]) {
      const { save, now, today } = saveAtD(D, { hh: 9, mm: 30 });
      const p = plan.boardPolicy(save, { now, today });
      assert.equal(p.kind, 'school');
      assert.equal(p.post, true);
      assert.equal(p.shape, 'RUN');
      assert.equal(p.shapeOpts.shape, 'RUN');
      assert.equal(plan.jobAction(save, { now, today }).shape, 'RUN');
      assert.match(plan.jobAction(save, { now, today }).label, /^RUN · 6 targets/);
      assert.match(p.why, /school window/);
    }
  });

  test('outside the window the evening board is free to be anything', () => {
    const { save, now, today } = saveAtD(7, { hh: 19, mm: 0 });
    const p = plan.boardPolicy(save, { now, today });
    assert.equal(p.kind, 'job');
    assert.equal(p.shape, null, 'the shape is job/board.js shapeFor\'s, not the week\'s');
  });

  test('the school window still narrows D = 2\'s REVIEW BOARD to RUN', () => {
    const { save, now, today } = saveAtD(2, { hh: 8, mm: 0 });
    const p = plan.boardPolicy(save, { now, today });
    assert.equal(p.kind, 'review');
    assert.equal(p.shape, 'RUN');
    assert.equal(p.guard, false, 'and it is still the review board');
  });

  test('Home\'s static gate agrees at every minute of the window', () => {
    for (const [hh, mm] of [[6, 59], [7, 0], [11, 11], [14, 14], [14, 15], [19, 0]]) {
      const { save, now, today } = saveAtD(6, { hh, mm });
      const a = plan.boardPolicy(save, { now, today });
      const b = home.weekGate(save, { now, today });
      assert.equal(b.kind, a.kind, `${hh}:${mm}`);
      assert.equal(b.school, a.school);
      assert.equal(b.shape, a.shape);
    }
  });
});

/* ========================================================================================== */
describe('J11 #7 — a BOUND commit auto-bags at the declared minute', () => {
  /** A live job whose targets are part-answered, so a commit has something to forfeit. */
  function liveJob({ hh = 20, mm = 0 } = {}) {
    const { save, now, today } = saveAtD(6, { hh, mm });
    const s = clone(save);
    state.startJob(s, { today, now });
    state.beginTargets(s, { now: now + 6000 });
    const g = state.stateOf(s);
    g.loose = 90;
    g.bagged = 100;
    g.chain = 3;
    return { save: s, now, today, g };
  }

  test('a declaration BINDS, and plan.commitIsDue matches job/state.js commitDue exactly', () => {
    const { save, now } = liveJob();
    state.commitBind(save, { kind: 'doneBy', byMin: 21 * 60 + 45 });
    assert.equal(save.game.commit.bound, true);
    for (const [hh, mm] of [[20, 0], [21, 44], [21, 45], [21, 46], [22, 30]]) {
      const t = at(THU.y, THU.m, THU.d, hh, mm);
      assert.equal(plan.commitIsDue(save, t), state.commitDue(save, t), `doneBy at ${hh}:${mm}`);
    }
    const walkSave = clone(save);
    walkSave.game.commit = { kind: 'walk', byMin: 12, honored: 0, bound: true };
    for (const dMin of [0, 5, 11, 12, 13, 40]) {
      const t = now + dMin * 60000;
      assert.equal(plan.commitIsDue(walkSave, t), state.commitDue(walkSave, t), `walk at +${dMin} min`);
    }
  });

  test('jobBoundary fires at the declared minute and not before', () => {
    const { save } = liveJob();
    state.commitBind(save, { kind: 'doneBy', byMin: 21 * 60 + 45 });
    assert.equal(plan.jobBoundary(save, { now: at(THU.y, THU.m, THU.d, 21, 44) }).close, false);
    const b = plan.jobBoundary(save, { now: at(THU.y, THU.m, THU.d, 21, 45) });
    assert.equal(b.close, true);
    assert.equal(b.kind, 'commit');
    assert.equal(b.full, true);
    assert.equal(b.bonusRate, COMMIT_BONUS);
    assert.equal(COMMIT_BONUS, 0.08, '+8 %');
  });

  test('firing it banks in FULL, pays +8 %, and forfeits the completion bonus', () => {
    const { save } = liveJob();
    state.commitBind(save, { kind: 'doneBy', byMin: 21 * 60 + 45 });
    const g = state.stateOf(save);
    const loose = g.loose, bagged = g.bagged;
    const out = state.commitFire(save, { now: at(THU.y, THU.m, THU.d, 21, 45) });
    assert.equal(out.bonusRate, COMMIT_BONUS, 'the commit bonus, not the completion bonus');
    assert.notEqual(out.bonusRate, COMPLETION);
    assert.equal(out.complete, false, 'targets remained');
    assert.equal(out.banked, econ.autoBank(loose, 'commit'));
    assert.equal(out.banked, loose, 'FULL value — a bound declaration pays no fee');
    assert.equal(out.finalBagged, econ.round((bagged + loose) * (1 + COMMIT_BONUS)));
    assert.equal(save.game.commit.honored, 1);
    assert.equal(save.game.commit.bound, false);
  });

  test('the rest goes to Today\'s Page — the queue stays, `inProgress.game` does not', () => {
    const { save } = liveJob();
    const total = state.queueOf(save).length;
    const done = state.answered(save);
    state.commitBind(save, { kind: 'doneBy', byMin: 21 * 60 + 45 });
    state.commitFire(save, { now: at(THU.y, THU.m, THU.d, 21, 45) });
    assert.equal(save.inProgress.game, undefined, 'the job record is gone');
    assert.equal(save.inProgress.kind, 'page', 'what is left is a plain page');
    assert.equal(save.inProgress.queue.length, total, 'no item was removed from the schedule');
    assert.equal(total - done > 0, true);
    assert.equal(COPY.leftOnPage({ left: total - done }), `${total - done} left on Today's Page`);
  });

  test('a declaration that is never reached simply never fires', () => {
    const { save } = liveJob();
    state.commitBind(save, { kind: 'doneBy', byMin: 23 * 60 + 30 });
    assert.equal(plan.jobBoundary(save, { now: at(THU.y, THU.m, THU.d, 21, 0) }).close, false);
    assert.ok(state.stateOf(save), 'the job is still live');
  });
});

/* ========================================================================================== */
describe('J11 #8 — the Mock is a test: no call, no stake, no crew, no chain', () => {
  const SRC = read('site/js/screens/mock.js');

  test('mock.js imports no stake, crew, chain, guard or board module', () => {
    for (const bad of ['job/crew.js', 'job/econ.js', 'job/guard.js', 'job/state.js', 'job/board.js', 'job/index.js']) {
      assert.ok(!SRC.includes(`'../${bad}'`), `the Mock must not import ${bad}`);
    }
    assert.ok(SRC.includes("'../job/call.js'"), 'the one thing it does use is the scoring rule');
  });

  test('no call / stake / crew / chain NODE is built anywhere in the screen', () => {
    // every element this screen builds, as h() writes them: h('tag.class…', …)
    const nodes = [...SRC.matchAll(/\bh\(\s*'([^']+)'/g)].map((m) => m[1]);
    assert.ok(nodes.length > 40, `the scan found only ${nodes.length} nodes — it is not looking at the screen`);
    for (const sel of nodes) {
      assert.ok(!/\b(call-row|call-chip|stake|crew|chain|loose|bagged|guard|envelope|vault)\b/i.test(sel),
        `the Mock built a game node: ${sel}`);
    }
    for (const word of ['LOOSE', 'BAGGED', 'CALL:', 'chain ', 'GUARD:']) {
      assert.ok(!SRC.includes(`'${word}`) && !SRC.includes(`\`${word}`), `the Mock prints "${word}"`);
    }
  });

  test('the prediction slider is the existing one, and it is the only thing that scores', () => {
    assert.match(SRC, /Call your shot — what will you score\?/);
    assert.match(SRC, /mock-pred-range/);
    assert.match(SRC, /applyMockCall\(save, run, \{ now \}\)/, 'submitRun wires it');
  });

  /* verify r1 — the weight was `MOCK_CALL_W = 1.0`, a CONSTANT: "no make, so no q̂, so the weight is
     defined rather than undefined" (G12 #40d). A defined weight is not a measured one, and at 1.0 it
     made one Mock slot worth `w·c = 10.00` for a forecast the student could make come true. It is now
     the same `4q̂(1−q̂)` law every other call obeys, read off the sittings that came BEFORE this
     paper, and capped at the smallest weight the window will count. */
  test('THE WEIGHT is measured, not defined: `min(4ŝ(1−ŝ), MOCK_CALL_W)` over the PRIOR sittings', () => {
    assert.equal(mock.MOCK_CALL_W, call.INFORMATIVE_MIN, 'the cap IS the smallest weight the window counts');
    assert.equal(mock.MOCK_CALL_W, 0.25);
    assert.equal(mock.MOCK_CALL_WINDOW, call.QHAT_WINDOW, 'ŝ uses the trailing-10 window q̂ uses');
    assert.equal(mock.MOCK_CALL_SLOT_MAX, 2.5, 'so one Mock slot can never pay more than 2.50');
    assert.equal(mock.MOCK_CALL_SLOT_MAX, mock.MOCK_CALL_W * call.credit(1, true));

    // the law, sampled. 0 outside the informative band — and "no prior sitting at all" is outside it.
    assert.equal(mock.mockCallWeight(null), 0, 'no history weighs nothing');
    assert.equal(mock.mockCallWeight(0), 0, 'and a history of blank papers weighs nothing');
    for (const sHat of [0.05, 0.066, 0.94, 1]) {
      assert.equal(mock.mockCallWeight(sHat), 0, `ŝ = ${sHat} is outside INFORMATIVE_BAND`);
    }
    for (const sHat of [call.INFORMATIVE_BAND[0], 0.1, 0.5, 0.9, call.INFORMATIVE_BAND[1]]) {
      assert.equal(mock.mockCallWeight(sHat), mock.MOCK_CALL_W, `ŝ = ${sHat} is inside it`);
      assert.ok(mock.mockCallWeight(sHat) <= call.weightFor(sHat), 'the cap only ever LOWERS 4ŝ(1−ŝ)');
    }

    const mc = mock.mockCall({ pred: 88, score: 81, submittedAt: 5 }, { sHat: 0.5 });
    assert.equal(mc.w, mock.MOCK_CALL_W);
    assert.equal(mc.entry.w, mock.MOCK_CALL_W);
    assert.ok(mc.entry.w >= call.INFORMATIVE_MIN, 'and it is therefore informative');
    assert.equal(mc.entry.skill, null, 'no make');

    const unweighed = mock.mockCall({ pred: 88, score: 81, submittedAt: 5 });
    assert.equal(unweighed.w, 0, 'with no measurement behind it the same paper weighs 0');
    assert.equal(unweighed.entry.w, 0);
    assert.equal(unweighed.entry.p, null, 'and it takes its slot as a BLANK one');
    assert.equal(unweighed.contribution, 0, 'paying exactly nothing');
  });

  test('ŝ is EXOGENOUS — `mockPriorMean` cannot see the paper it is weighing', () => {
    const { save, now } = saveAtD(4);
    const s = clone(save);
    const paper = satRun({ pred: 50, score: 50, at: now, seed: 'today' });
    s.runs = [
      satRun({ pred: 0, score: 40, at: now - 3 * DAY_MS, seed: 'p1' }),
      satRun({ pred: 0, score: 60, at: now - 2 * DAY_MS, seed: 'p2' }),
      satRun({ pred: 0, score: 0, at: now - DAY_MS, seed: 'replay', retry: true }),
      paper,
      satRun({ pred: 0, score: 100, at: now + DAY_MS, seed: 'later' }),
    ];
    assert.deepEqual(mock.mockPriorRuns(s, paper).map((r) => r.seed), ['p1', 'p2'],
      'this paper, a later paper and a replayed seed are all excluded');
    assert.equal(mock.mockPriorMean(s, paper), 0.5, 'ŝ is the mean of what came first — 40 and 60');
    assert.equal(mock.mockPriorMean(s, paper), (0.4 + 0.6) / 2);

    // the window is MOCK_CALL_WINDOW sittings long, newest kept
    const many = { runs: Array.from({ length: 15 }, (_, i) =>
      satRun({ pred: 0, score: i < 5 ? 100 : 20, at: now - (15 - i) * DAY_MS, seed: `m${i}` })) };
    assert.equal(mock.mockPriorRuns(many, paper).length, mock.MOCK_CALL_WINDOW);
    assert.ok(Math.abs(mock.mockPriorMean(many, paper) - 0.2) < 1e-12, 'the oldest five have aged out');

    // and a paper's own score never reaches its weight: same paper, same prediction, two histories
    const cold = mock.mockCall(paper, { sHat: mock.mockPriorMean({ runs: [] }, paper) });
    const warm = mock.mockCall(paper, { sHat: mock.mockPriorMean(s, paper) });
    assert.equal(cold.credit, warm.credit, 'the CREDIT is the same proper quadratic either way');
    assert.equal(cold.w, 0);
    assert.equal(warm.w, mock.MOCK_CALL_W);
  });

  test('the credit comes out of call.credit and IS c(p, o) = 10 − 40(p − o)²', () => {
    for (const pred of [0, 12, 50, 70, 88, 95, 100]) {
      for (const score of [0, 31, 50, 81, 100]) {
        const mc = mock.mockCall({ pred, score }, { sHat: 0.5 });
        const p = pred / 100, o = score / 100;
        assert.ok(Math.abs(mc.credit - (10 - 40 * (p - o) ** 2)) < 1e-9, `pred ${pred} score ${score}`);
        assert.ok(Math.abs(mc.credit - call.credit(mc.entry.p, mc.entry.ok)) < 1e-12, 'routed through call.credit');
        assert.ok(Math.abs(mc.contribution - mc.w * mc.credit) < 1e-12, 'and Σ(w·c) adds up the product');
        // the weight moves what the slot PAYS; it never touches the credit itself
        const unweighed = mock.mockCall({ pred, score });
        assert.ok(Math.abs(unweighed.credit - mc.credit) < 1e-12, 'the calibration credit is weight-blind');
        assert.equal(unweighed.contribution, 0);
      }
    }
  });

  test('it is still strictly proper: the prediction that maximises the credit is the true score', () => {
    // STRICT PROPRIETY is a statement about `pred` AT A FIXED `score`: given what you will score,
    // the report that maximises the credit is the truth. That is what this sweep measures, and it is
    // the right experiment for the claim. It is NOT a claim that (0, 0) is excluded — the student
    // picks the score too, and the test below sweeps that axis.
    for (const score of [10, 33, 50, 67, 88, 96]) {
      let best = -Infinity, bestP = null;
      for (let pred = 0; pred <= 100; pred++) {
        const c = mock.mockCall({ pred, score }).credit;
        if (c > best) { best = c; bestP = pred; }
      }
      assert.equal(bestP, score, `truth-telling maximises at score ${score}`);
    }
  });

  test('THE OTHER AXIS — the student picks the SCORE as well, and (0, 0) pays the same 10 as (100, 100)', () => {
    // Ticket fix:tests r1, finding 1c. Sweeping `pred` at a fixed `score` proves propriety and
    // hides the tank: over the whole grid the credit has TWO maxima, and one of them is free.
    let best = -Infinity;
    let argmax = [];
    for (let pred = 0; pred <= 100; pred += 2) {
      for (let score = 0; score <= 100; score += 2) {
        const c = mock.mockCall({ pred, score }).credit;
        if (c > best + 1e-9) { best = c; argmax = []; }
        if (c > best - 1e-9) argmax.push(`${pred}/${score}`);
      }
    }
    assert.ok(Math.abs(best - 10) < 1e-9, `the grid maximum is ${best}`);
    // THE WHOLE DIAGONAL is the argmax — `c = 10 − 40(p − o)²` is a calibration score, and it is
    // indifferent to the LEVEL of the score. Predicting 0 and scoring 0 pays exactly what predicting
    // 100 and scoring 100 pays.
    assert.equal(argmax.length, 51, `${argmax.length} maxima — the argmax is the whole pred = score diagonal`);
    for (const cell of argmax) {
      const [p, o] = cell.split('/').map(Number);
      assert.equal(p, o, `${cell} is on the diagonal`);
    }
    assert.ok(argmax.includes('0/0') && argmax.includes('100/100'),
      'the scoring rule alone does not prefer knowing the material to predicting that you do not');
    assert.ok(Math.abs(mock.mockCall({ pred: 0, score: 0 }).credit - mock.mockCall({ pred: 100, score: 100 }).credit) < 1e-9);

    /* SO THE BRAKE IS NOT IN THE SCORING RULE — it is in the gate and in the ledger, and both are
       asserted here rather than assumed, because a brake nobody measures is a brake nobody has. */

    // 1. THE GATE: a tank still has to sit the paper. `mockCallEligible` needs half the items
    //    attempted and 20 s per item, refuses a retry, refuses a second call the same day, and
    //    refuses a seed that has already been called.
    const { save, now } = saveAtD(4);
    const of = 20;
    const paper = (answered, ms, extra = {}) => ({
      kind: 'mock', seed: 'tank-1', status: 'done', pred: 0, score: 0, n: of,
      // `itemAttempted` reads `item.answers` — a wrong answer IS an attempt, which is the whole
      // point of the gate: the tank has to sit the paper, it just does not have to get anything right
      items: Array.from({ length: of }, (_, i) => (i < answered
        ? { credit: 0, ms: 30000, answers: { a: { raw: '999' } } }
        : { credit: 0, ms: 0, answers: {} })),
      startedAt: now - ms, submittedAt: now, ...extra,
    });
    assert.equal(mock.mockCallEligible(save, paper(0, of * 60000), { now }).why, 'blank',
      'a blank paper earns no call, whatever it predicted');
    assert.equal(mock.mockCallEligible(save, paper(of, 1000), { now }).why, 'too-fast',
      'and neither does a paper clicked through in a second');
    assert.equal(mock.mockCallEligible(save, paper(of, of * 60000, { retry: true }), { now }).why, 'retry');
    assert.equal(mock.mockCallEligible(save, paper(of, of * 60000), { now }).ok, true,
      'a paper genuinely sat for 20 minutes IS eligible — the gate is a cost, not a ban');
    assert.equal(mock.MOCK_CALL_MIN_ANSWERED, 0.5);
    assert.equal(mock.MOCK_CALL_MIN_MS_PER_ITEM, 20000);

    // 2. ONE SLOT A DAY — true, and NOT the bound that matters. See the arm below it.
    const s2 = clone(save);
    const first = { ...paper(of, of * 60000), submittedAt: now };
    const r1 = mock.applyMockCall(s2, first, { now });
    assert.ok(r1, 'the first tank call lands');
    assert.equal(s2.player.rating.calls.length, 1);
    s2.runs = [...(s2.runs ?? []), first];                    // the run record `run.js` pushes
    const second = { ...paper(of, of * 60000), seed: 'tank-2', submittedAt: now + 60000 };
    assert.equal(mock.applyMockCall(s2, second, { now: now + 60000 }), null,
      'and the second one, the same day, does not — even on a fresh seed');
    assert.equal(mock.mockCallEligible(s2, second, { now: now + 60000 }).why, 'already-today');
    /* ROUND-1 VERIFICATION (exploit-hunt). This assertion is TRUE and the inference that used to sit
       on top of it was not: the comment said "the tank cannot fill the window: it buys 1/50 of the
       rating for a whole evening's work". The rating is `5 + 2·Σ(w·c)/N` with N = 50 FIXED
       (`call.js ratingDetail`), not a mean over the filled slots, so one slot is not one fiftieth of
       anything — it is a fixed `2·(w·c)/50` of RATING POINTS. What the channel can reach is measured
       in the arm below, which is the comparison this file never made. */
    assert.equal(s2.player.rating.calls.length, 1, `one slot of ${CAPS.calls}`);

    // 3. THE LEDGER: scoring 0 is paid for where it hurts. The same paper drives mastery DOWN on
    //    every skill it touched, which is the currency Readiness is built out of.
    const before = clone(save);
    for (const sk of ALL_SKILLS) before.skills[sk.id] = { m: 80, n: 6, lastAt: now - 3 * DAY_MS, misses: 0, helped: 0 };
    const mBefore = ALL_SKILLS.map((sk) => before.skills[sk.id].m).reduce((a, b) => a + b, 0);
    const after = clone(before);
    const sids = ALL_SKILLS.slice(0, 6).map((sk) => sk.id);
    for (const sid of sids) after.skills[sid] = updateSkill(after.skills[sid], 0, { at: now });
    const mAfter = ALL_SKILLS.map((sk) => after.skills?.[sk.id]?.m ?? 0).reduce((a, b) => a + b, 0);
    assert.ok(mAfter < mBefore, `a 0-score paper moves mastery DOWN (${mBefore.toFixed(1)} → ${mAfter.toFixed(1)})`);
    assert.ok(readiness(after).r < readiness(before).r,
      'and Readiness with it — the number the whole product is pointed at');
  });

  /**
   * WHAT THE MOCK CHANNEL ALONE CAN REACH — the comparison this file never made
   * (round-1 verification, exploit-hunt).
   *
   * The arm above proves the scoring rule cannot tell a tank from a scholar (`0/0` and `100/100` are
   * both in the argmax) and then hands the whole brake to the gate and the ledger. The gate is a
   * COST — 20 items × 20 s = 6 min 40 s an evening — and a cost is not a bound. Nothing in `tests/`
   * bounded the RANK the channel can buy:
   *
   *     $ grep -rn 'MOCK_CALL_W|mockCallEligible|applyMockCall' tests/*.mjs
   *       → job-week.test.mjs only: the wiring, `MOCK_CALL_W === 1.0`, and the three gate refusals.
   *
   * The quantity that decides whether a channel is a farm is its per-slot `w·c` against the best
   * per-slot `w·c` honest play can reach, because the rating is `5 + 2·Σ(w·c)/50` with a FIXED
   * divisor: every slot is worth `2·(w·c)/50` rating points no matter how many slots are filled.
   * Both sides are computed here from the shipped constants, and the answer is then driven through
   * the shipped writers on a real save.
   *
   * THE VERDICT THIS TEST PINNED BEFORE THE REPAIR, and it was a defect of `screens/mock.js`, not of
   * this file: a Mock slot paid the CREDIT CEILING (10.000) because a self-fulfilling forecast is
   * exact, while an honest job slot cannot exceed 2.268 — so ten tanked evenings bought Called 5,
   * against the forty-three honest calls the same rank costs. "Repricing `MOCK_CALL_W` … is the fix;
   * the numbers below are pinned so that whoever makes it has to come back here and restate them."
   *
   * RESTATED (verify r1, notes/repair-week.md). `MOCK_CALL_W` is no longer a constant 1.0: the weight
   * is `min(4ŝ(1−ŝ), MOCK_CALL_W)` on ŝ = the mean score of the PRIOR sittings, capped at
   * `INFORMATIVE_MIN` = 0.25, the smallest weight the window counts. Two numbers move:
   *
   *   · THE TANK'S SLOT IS NOW 0.000, not 10.000. A paper of nonsense scores 0, ten of them make
   *     ŝ = 0, ŝ = 0 is outside `INFORMATIVE_BAND`, and a call outside the band is a BLANK slot.
   *     Sixty consecutive tanked evenings leave the rating at 5.000 and the rank where it started.
   *   · THE MOCK'S BEST SLOT IS 2.500 against the honest 2.268 (reachable) / 2.4998 (theoretical) —
   *     a ratio of 1.102, where it was 4.409. 2.500 is `INFORMATIVE_MIN × c_max`, i.e. the FLOOR of
   *     what any counting slot can pay: no cap below it exists that does not also clip `c` and give
   *     up strict propriety.
   *
   * The channel is bounded, not banned, and the bound is the last arm of this test: a PERFECT daily
   * forecast on in-band papers needs 15 / 27 / 39 weighed slots for Called 3 / 4 / 5.
   */
  test('THE BOUND THE GATE IS NOT — a Mock slot against the best honest slot, and the rank each buys', () => {
    const { RATING, RANK_THRESHOLDS } = call;

    /* (a) THE MOCK SLOT. `mockCall` stores `p = 1 − |pred − score|` with `ok = true`, so a paper
           that predicts its own score exactly stores `p = 1` and the window recomputes
           `credit(1, true)` — the ceiling of `c = 10 − 40(p − o)²`. What the repair changed is the
           WEIGHT that ceiling is multiplied by: the tank's own history weighs 0, and the most any
           history can weigh is `MOCK_CALL_W`. */
    assert.equal(mock.MOCK_CALL_W, 0.25, 'the weight is the informative floor, not the old 1.0');
    assert.equal(call.credit(1, true), 10);
    const mockSlot = mock.MOCK_CALL_SLOT_MAX;
    assert.equal(mockSlot, 2.5);

    const tanked = mock.mockCall({ pred: 0, score: 0, submittedAt: 0 }, { sHat: 0 });
    assert.equal(tanked.credit, 10, 'the self-fulfilling forecast still EARNS the credit ceiling');
    assert.equal(tanked.w, 0, 'and a history of zeroes weighs it at exactly 0');
    assert.equal(tanked.entry.p, null, 'so it takes its slot as a blank one');
    assert.equal(tanked.contribution, 0, 'and pays the rating nothing at all');

    const best = mock.mockCall({ pred: 50, score: 50, submittedAt: 0 }, { sHat: 0.5 });
    assert.equal(best.entry.p, 1, 'predicting 50 and scoring 50 stores the PERFECT call');
    assert.equal(best.contribution, mockSlot, 'and the most it can pay is MOCK_CALL_SLOT_MAX');

    /* (b) THE HONEST SLOT. `wTimesEcDiscrete(q̂)` is what one truthful call at `q̂` is worth in
           expectation on the shipped four-rung ladder. `q̂` is a clear rate over a window of
           `RATING.qHatWindow` targets, so the values a save can actually hold are `k/10`. Both the
           reachable grid and a fine sweep are computed, because the grid is the real constraint and
           the sweep is the theoretical one — neither is anywhere near 10. */
    const grid = Array.from({ length: RATING.qHatWindow + 1 }, (_, k) => k / RATING.qHatWindow);
    const honestOn = (qs) => qs.reduce((best, q) => Math.max(best, call.wTimesEcDiscrete(q)), 0);
    const honestGrid = honestOn(grid);
    const honestFine = honestOn(Array.from({ length: 10001 }, (_, k) => k / 10000));
    assert.ok(Math.abs(honestGrid - 2.268) < 5e-4, `reachable honest ceiling ${honestGrid.toFixed(4)}`);
    assert.ok(Math.abs(honestFine - 2.4998) < 5e-4, `theoretical honest ceiling ${honestFine.toFixed(4)}`);
    assert.ok(honestGrid <= honestFine, 'the reachable ceiling cannot beat the theoretical one');

    /* (c) THE RATIO. This was the finding, in one number; it is now the parity, in the same number. */
    const ratio = mockSlot / honestGrid;
    assert.ok(Math.abs(ratio - 1.1023) < 1e-3,
      `a Mock slot is worth ${ratio.toFixed(4)} of the best slot honest play can reach `
      + `(${mockSlot.toFixed(3)} against ${honestGrid.toFixed(4)}) — repriced? restate this number`);
    assert.ok(Math.abs((1.0 * call.credit(1, true)) / honestGrid - 4.4092) < 1e-3,
      'the pre-repair ratio, kept so the size of the defect stays legible: w = 1.0 was 4.409 honest slots');
    assert.ok(mockSlot / honestFine - 1 < 1e-3,
      `one Mock slot (${mockSlot}) is the theoretical honest ceiling (${honestFine.toFixed(4)}) to within a tenth of a per cent `
      + '— it is NOT below it, and the arm below says why no cap below it exists');
    assert.ok(mockSlot >= call.INFORMATIVE_MIN * call.credit(1, true) - 1e-12,
      'and it cannot be capped lower without clipping c: 2.50 is INFORMATIVE_MIN × c_max, the floor of any counting slot');

    /* (d) WHAT EACH BUYS. Slots to reach a rating, from the shipped divisor: `Σ(w·c) ≥ (T − 5)·N/2`. */
    // `− 1e-9`: `(8.9 − 5) × 50 / (2 × 2.5)` is 39.000000000000004 in binary, and `rankFor` itself
    // compares against `RANK_THRESHOLDS[i] − 1e-9` for exactly this reason. 39 slots IS rating 8.900.
    const slotsFor = (T, per) => (per > 0 ? Math.max(0, Math.ceil(((T - RATING.base) * RATING.N) / (RATING.scale * per) - 1e-9)) : Infinity);
    const mockSlots = RANK_THRESHOLDS.map((T) => slotsFor(T, mockSlot));
    const honestSlots = RANK_THRESHOLDS.map((T) => slotsFor(T, honestGrid));
    assert.deepEqual(mockSlots, [0, 0, 15, 27, 39],
      `PERFECTLY forecast in-band Mock slots per rank: ${JSON.stringify(mockSlots)}`);
    assert.deepEqual(honestSlots, [0, 0, 17, 30, 43],
      `honest calls per rank at the reachable ceiling: ${JSON.stringify(honestSlots)}`);
    assert.deepEqual(RANK_THRESHOLDS.map((T) => slotsFor(T, 1.0 * call.credit(1, true))), [0, 0, 4, 7, 10],
      'against the four / seven / TEN evenings the same ranks cost before the repair');

    /* (e) END TO END, through the shipped writers. Ten evenings, one tanked paper each, `now`
           advanced a day at a time so the `already-today` gate is satisfied honestly and every seed
           is fresh. Nothing synthetic: `applyMockCall` writes the window, the rating and the rank. */
    const { save: s0, now: t0 } = saveAtD(4);
    const tank = clone(s0);
    const OF = 20;
    const sat = (day) => ({
      kind: 'mock', seed: `tank-day-${day}`, status: 'done', pred: 0, score: 0, n: OF,
      items: Array.from({ length: OF }, () => ({ credit: 0, ms: 30000, answers: { a: { raw: '999' } } })),
      startedAt: t0 + day * DAY_MS - OF * 60000, submittedAt: t0 + day * DAY_MS,
    });
    const rank0 = tank.player.rank;
    const ladder = [];
    for (let day = 0; day < 60; day++) {
      const run = sat(day);
      const res = mock.applyMockCall(tank, run, { now: t0 + day * DAY_MS });
      assert.ok(res, `evening ${day + 1} earned no call — the gate refused a paper it should accept`);
      assert.equal(res.w, 0, `evening ${day + 1} was WEIGHED — a tank's history is outside the band`);
      tank.runs = [...(tank.runs ?? []), run];
      ladder.push([day + 1, +res.rating.toFixed(3), res.rank]);
    }
    assert.equal(tank.player.rating.calls.length, RATING.N, 'sixty evenings, and the window is full of them');
    assert.equal(tank.player.rating.n, 0, 'not one of which is a measurement');
    assert.equal(tank.player.rating.value, 5, 'the rating never left 5.000');
    assert.equal(tank.player.rank, rank0, `the rank never left Called ${rank0} — it was Called 5 by evening ten`);
    assert.equal(ladder[9][1], 5, 'ten tanked slots is rating 5.000, where it used to be 9.000');
    assert.ok(ladder.every((r) => r[1] === 5 && r[2] === rank0), 'and no evening in sixty moved either number');

    /* (f) THE CHANNEL'S OWN CEILING, through the same writers. Papers that score INSIDE the band and
           are predicted exactly are the most this channel can ever pay: `MOCK_CALL_SLOT_MAX` a slot,
           and the first paper of all is unweighed because it has no history to be weighed against.
           (d) is therefore a LOWER BOUND on the sittings each rank costs, and it is asserted as one:
           `ratingDetail`'s own honest-expectation cap (`earned`, round-4 verify, call.js) prices the
           rank BELOW the raw rating for a window of Mock slots, so the real ladder is slower still —
           measured at the time of writing: Called 3 on sitting 22, Called 4 on 38, and Called 5 not
           reached at all inside the 50-slot window. The assertions below hold under either pricing;
           the console line prints what it actually was. */
    const ace = clone(s0);
    const acePaper = (day) => ({ ...sat(day), seed: `ace-day-${day}`, pred: 50, score: 50 });
    const aceLadder = [];
    for (let day = 0; day < RATING.N; day++) {
      const run = acePaper(day);
      const res = mock.applyMockCall(ace, run, { now: t0 + day * DAY_MS });
      assert.ok(res, `sitting ${day + 1} earned no call`);
      ace.runs = [...(ace.runs ?? []), run];
      aceLadder.push([day + 1, +res.rating.toFixed(3), res.rank, res.w]);
    }
    assert.equal(aceLadder[0][3], 0, 'the first sitting has no prior measurement, so it is unweighed');
    assert.ok(aceLadder.slice(1).every((r) => r[3] === mock.MOCK_CALL_W), 'every later one is weighed at the cap');
    assert.ok(aceLadder.every((r) => r[1] <= 5 + (RATING.scale * mockSlot * (r[0] - 1)) / RATING.N + 1e-9),
      'no sitting ever paid more than MOCK_CALL_SLOT_MAX');
    const aceReached = (rank) => aceLadder.find((r) => r[2] >= rank)?.[0] ?? null;
    for (const rank of [3, 4, 5]) {
      const floorSittings = mockSlots[rank - 1] + 1;          // weighed slots + the unweighed first paper
      const got = aceReached(rank);
      assert.ok(got === null || got >= floorSittings,
        `Called ${rank} arrived on sitting ${got}, and ${mockSlots[rank - 1]} weighed slots at ${mockSlot} apiece is the most that can be paid by then`);
      assert.ok(aceLadder.slice(0, floorSittings - 1).every((r) => r[2] < rank),
        `Called ${rank} was reached inside the first ${floorSittings - 1} sittings`);
    }
    console.log(`  mock tank ladder, 60 evenings: rating ${tank.player.rating.value.toFixed(3)} · Called ${tank.player.rank} · ${tank.player.rating.n} measurements`);
    console.log(`  per-slot w·c: mock ${mockSlot.toFixed(3)} · honest ceiling ${honestGrid.toFixed(4)} (reachable) / ${honestFine.toFixed(4)} (theoretical) — ratio ${ratio.toFixed(3)}`);
    console.log(`  sittings to Called 3/4/5 on a PERFECT daily forecast: ${aceReached(3)}/${aceReached(4)}/${aceReached(5)}`
      + ` (floor from MOCK_CALL_SLOT_MAX alone: ${mockSlots.slice(2).map((k) => k + 1).join('/')})`);
  });

  /* J13 r1 — a run the way `submitRun` leaves it: graded items whose parts carry `kind`, a real
     `startedAt → submittedAt` span, a seed. `mockCallEligible` reads exactly these fields, so a
     fixture that omits them is a blank paper and (correctly) earns no call. */
  function satRun({ pred, score, at: t = 0, n = 20, done = n, ms = 25 * 60 * 1000, seed = 'sat-1', kind = 'mock', retry = false } = {}) {
    const items = Array.from({ length: n }, (_, i) => ({
      n: i + 1, credit: 0,
      parts: [{ id: 'a', type: 'text', credit: 0, kind: i < done ? 'wrong' : 'blank', ok: false }],
    }));
    return { kind, status: 'done', n, seed, retry, items, pred, score, startedAt: t - ms, submittedAt: t };
  }

  test('applyMockCall pushes exactly one call, moves the rating, and never runs twice', () => {
    const { save, now } = saveAtD(4);
    const s = clone(save);
    /* the sittings that price this one. Without them ŝ is null, the call is unweighed and the rating
       does not move — which is the arm below, and the reason this one seeds a history first. */
    s.runs = [satRun({ pred: 60, score: 64, at: now - 2 * DAY_MS, seed: 'hist-1' })];
    const before = s.player.rating.calls.length;
    const run = satRun({ pred: 70, score: 72, at: now });
    const r = mock.applyMockCall(s, run, { now });
    assert.ok(r);
    assert.equal(r.w, mock.MOCK_CALL_W, 'weighed, because a prior sitting scored 64');
    assert.equal(s.player.rating.calls.length, before + 1);
    assert.equal(s.player.rating.n, 1);
    assert.equal(s.player.rating.value, call.ratingFrom(s.player.rating.calls, CAPS.calls));
    assert.ok(s.player.rating.value > 5, `a good forecast moved the rating to ${s.player.rating.value}`);
    assert.equal(s.player.rank, call.ratingDetail(s.player.rating.calls, CAPS.calls, { rank: save.player.rank }).rank);
    assert.equal(mock.applyMockCall(s, run, { now }), null, 'idempotent per run');
    assert.equal(s.player.rating.calls.length, before + 1);
  });

  test('the FIRST paper of all is unweighed — it takes its slot, pays 0, and moves no rank', () => {
    const { save, now } = saveAtD(4);
    const s = clone(save);
    s.runs = [];
    const rank0 = s.player.rank;
    const r = mock.applyMockCall(s, satRun({ pred: 70, score: 70, at: now, seed: 'first' }), { now });
    assert.ok(r, 'the call is still recorded — it is the one-a-day gate\'s ledger');
    assert.equal(r.sHat, null, 'there was nothing to measure it against');
    assert.equal(r.w, 0);
    assert.equal(r.credit, 10, 'the forecast was perfect and the credit says so');
    assert.equal(r.contribution, 0, 'and it bought nothing');
    assert.equal(s.player.rating.calls.length, 1, 'a slot is still a call (round-2 windowPush)');
    assert.equal(s.player.rating.n, 0, 'but not a measurement');
    assert.equal(s.player.rating.value, 5);
    assert.equal(s.player.rank, rank0);
  });

  test('a retry (same seed) earns no call, exactly as it earns no XP and no PB', () => {
    assert.equal(mock.mockCall({ pred: 70, score: 70, retry: true }), null);
    const { save, now } = saveAtD(4);
    const s = clone(save);
    assert.equal(mock.applyMockCall(s, satRun({ pred: 70, score: 70, at: now, retry: true }), { now }), null);
    assert.equal(s.player.rating.calls.length, 0);
  });

  test('the layer off writes nothing to the rating window', () => {
    const { save, now } = saveAtD(4);
    const s = clone(save);
    s.settings.game = false;
    assert.equal(mock.applyMockCall(s, satRun({ pred: 70, score: 40, at: now }), { now }), null);
    assert.equal(s.player.rating.calls.length, 0);
  });

  test('it writes save.player and nothing else — the Mock\'s own Ledger-A writes are untouched', () => {
    const { save, now } = saveAtD(4);
    const s = clone(save);
    const before = JSON.stringify({ cards: s.cards, skills: s.skills, xp: s.xp, errors: s.errors, counters: s.counters, game: s.game });
    mock.applyMockCall(s, satRun({ pred: 60, score: 90, at: now }), { now });
    assert.equal(JSON.stringify({ cards: s.cards, skills: s.skills, xp: s.xp, errors: s.errors, counters: s.counters, game: s.game }), before);
  });

  /* ------------------------------------------------------------------ J13 r1: the propriety gate */
  describe('J13 r1 — the prediction is scored only when the OUTCOME was not the student\'s to hand themselves', () => {
    test('a blank Mock predicted at 0 earns NO call — the exploit, exactly as it was reported', () => {
      const { save, now } = saveAtD(4);
      const s = clone(save);
      const before = s.player.rating.value;
      for (let k = 0; k < 10; k++) {
        const run = satRun({ pred: 0, score: 0, at: now + k * 60000, done: 0, ms: 9000, seed: `blank-${k}` });
        assert.equal(mock.applyMockCall(s, run, { now }), null, `blank mock ${k + 1}`);
        s.runs.push(run);
      }
      assert.equal(s.player.rating.calls.length, 0, 'ten blank Mocks put nothing in the window');
      assert.equal(s.player.rating.value, before, 'and moved the rating by nothing');
      assert.equal(mock.mockCallEligible(s, satRun({ pred: 0, score: 0, at: now, done: 0 })).why, 'blank');
    });

    test('a paper submitted seconds after Start earns no call, however well it was predicted', () => {
      const { save, now } = saveAtD(4);
      const s = clone(save);
      const rushed = satRun({ pred: 55, score: 55, at: now, ms: 4000 });
      assert.equal(mock.mockCallEligible(s, rushed).why, 'too-fast');
      assert.equal(mock.applyMockCall(s, rushed, { now }), null);
      assert.equal(s.player.rating.calls.length, 0);
    });

    test('at most ONE scoring Mock a day — the hard gate the `mockDone` row never was', () => {
      const { save, now } = saveAtD(4);
      const s = clone(save);
      const first = satRun({ pred: 70, score: 71, at: now, seed: 'a' });
      assert.ok(mock.applyMockCall(s, first, { now }), 'the first one scores');
      s.runs.push(first);
      const second = satRun({ pred: 70, score: 70, at: now + 90 * 60 * 1000, seed: 'b' });
      assert.equal(mock.mockCallEligible(s, second).why, 'already-today');
      assert.equal(mock.applyMockCall(s, second, { now }), null);
      assert.equal(s.player.rating.calls.length, 1);
      // tomorrow's sitting is allowed again
      const tomorrow = now + 26 * 60 * 60 * 1000;
      const third = satRun({ pred: 70, score: 70, at: tomorrow, seed: 'c' });
      assert.ok(mock.applyMockCall(s, third, { now: tomorrow }));
      assert.equal(s.player.rating.calls.length, 2);
    });

    test('a seed scores a call once, ever — re-sitting the same paper on another day pays nothing', () => {
      const { save, now } = saveAtD(4);
      const s = clone(save);
      const first = satRun({ pred: 70, score: 71, at: now, seed: 'same' });
      assert.ok(mock.applyMockCall(s, first, { now }));
      s.runs.push(first);
      const later = now + 3 * 24 * 60 * 60 * 1000;
      const again = satRun({ pred: 71, score: 71, at: later, seed: 'same' });
      assert.equal(mock.mockCallEligible(s, again).why, 'seed-called');
      assert.equal(mock.applyMockCall(s, again, { now: later }), null);
      assert.equal(s.player.rating.calls.length, 1);
    });

    test('a real sitting still pays the full 10.00 — a weak student who calls 20 and scores 20 is CORRECT', () => {
      const { save, now } = saveAtD(4);
      const s = clone(save);
      s.runs = [satRun({ pred: 30, score: 22, at: now - 2 * DAY_MS, seed: 'hist' })];   // ŝ = 0.22, in band
      const honest = satRun({ pred: 20, score: 20, at: now, done: 14, ms: 31 * 60 * 1000 });
      const r = mock.applyMockCall(s, honest, { now });
      assert.ok(r, 'a genuinely sat paper scores');
      assert.equal(Math.round(r.credit * 100) / 100, 10, 'and truth-telling still pays the maximum credit');
      assert.equal(r.w, mock.MOCK_CALL_W, 'weighed like everybody else — knowing little is not a disqualification');
      assert.equal(r.contribution, mock.MOCK_CALL_SLOT_MAX, 'so the weak student earns the best slot this channel has');
    });

    /* verify r1, the exploit as the round-1 critics ran it: NOT a blank paper. Every box carries a
       wrong answer, so `itemAttempted` counts all twenty, the sitting takes its 20 s an item, and the
       three effort conditions are all satisfied — which is the whole point of the finding. What stops
       it now is the weight: a history of zeroes is outside `INFORMATIVE_BAND`. */
    test('TEN DELIBERATELY-FAILED papers, every gate satisfied, buy nothing at all', () => {
      const { save, now } = saveAtD(4);
      const s = clone(save);
      s.runs = [];
      const rank0 = s.player.rank;
      for (let k = 0; k < 10; k++) {
        const day = now + k * DAY_MS;
        const run = satRun({ pred: 0, score: 0, at: day, done: 20, ms: 20 * 20000, seed: `wrong-${k}` });
        assert.equal(mock.mockCallEligible(s, run, { now: day }).ok, true, `the effort gate accepts paper ${k + 1}`);
        const r = mock.applyMockCall(s, run, { now: day });
        assert.ok(r, `paper ${k + 1} was refused outright — this arm is about the WEIGHT, not the gate`);
        assert.equal(r.credit, 10, 'predicting the score you handed yourself is still exact…');
        assert.equal(r.w, 0, '…and weighs nothing');
        assert.equal(r.contribution, 0);
        s.runs.push(run);
      }
      assert.equal(s.player.rating.calls.length, 10, 'ten slots');
      assert.equal(s.player.rating.n, 0, 'and not one measurement among them');
      assert.equal(s.player.rating.value, 5, 'the rating is where it started — it used to be 9.00 here');
      assert.equal(s.player.rank, rank0, `and the rank is Called ${rank0} — it used to be Called 5`);
      assert.equal(s.player.records.bestRating ?? 5, 5, 'the audit line has nothing to brag about either');
    });

    test('the gate is about EFFORT, never about the score — the thresholds are half the paper and 20 s an item', () => {
      const { save, now } = saveAtD(4);
      const s = clone(save);
      assert.equal(mock.MOCK_CALL_MIN_ANSWERED, 0.5);
      assert.equal(mock.MOCK_CALL_MIN_MS_PER_ITEM, 20000);
      const e = mock.mockCallEligible(s, satRun({ pred: 0, score: 0, at: now, done: 10, ms: 20 * 20000 }));
      assert.equal(e.ok, true, 'exactly half the paper, exactly 20 s an item, and a score of zero: eligible');
      assert.equal(mock.mockCallEligible(s, satRun({ pred: 0, score: 0, at: now, done: 9, ms: 20 * 20000 })).why, 'blank');
      assert.equal(mock.mockCallEligible(s, satRun({ pred: 0, score: 0, at: now, done: 10, ms: 20 * 20000 - 1 })).why, 'too-fast');
    });

    test('`mockCall`\'s CREDIT is untouched — only the weight moved, and it moved off the outcome', () => {
      for (const [pred, score] of [[0, 0], [88, 81], [50, 50], [100, 0]]) {
        const want = 10 - 40 * (pred / 100 - score / 100) ** 2;
        for (const sHat of [null, 0, 0.1, 0.5, 0.9, 1]) {
          const mc = mock.mockCall({ pred, score }, { sHat });
          assert.ok(Math.abs(mc.credit - want) < 1e-9, `credit at ŝ ${sHat}`);
          assert.equal(mc.w, mock.mockCallWeight(sHat), 'the weight is the law on ŝ, and nothing else');
          // the weight is the SAME for every paper at this ŝ — it does not read pred or score
          assert.equal(mc.w, mock.mockCall({ pred: 100, score: 0 }, { sHat }).w, 'the weight is outcome-blind');
        }
      }
    });
  });
});

/* ========================================================================================== */
describe('J11 #9 — a vault boss keeps 3 hearts, CONTINUE? and KO', () => {
  const SRC = read('site/js/screens/boss.js');

  test('the constants are untouched', () => {
    assert.equal(boss.HEARTS, 3);
    assert.equal(boss.CONTINUE_HEARTS, 1);
    assert.equal(boss.BOSS_XP, 150);
    assert.equal(boss.FLAWLESS_XP, 300);
  });

  test('the vault frame is a query flag, a root marker and a back link — and nothing else', () => {
    assert.equal(boss.VAULT_QUERY, 'job');
    assert.equal(boss.VAULT_BACK, '#/run/job');
    const q = (v) => ({ get: (k) => (k === 'job' ? v : null) });
    assert.equal(boss.isVaultRun(q('1')), true);
    assert.equal(boss.isVaultRun(q('0')), false);
    assert.equal(boss.isVaultRun(q(null)), false);
    assert.equal(boss.isVaultRun(null), false);

    // `vault` reaches exactly three LINES of the run: the local flag, the root dataset, the back link.
    const body = SRC.slice(SRC.indexOf('export function createBossRun'));
    const lines = body.split('\n').filter((l) => /\bvault\b/.test(l) && !/^\s*(\*|\/\/)/.test(l));
    assert.equal(lines.length, 3, `the vault flag is on ${lines.length} lines, not 3:\n${lines.join('\n')}`);
    assert.match(lines[0], /const vault = opts\.vault === true;/);
    assert.match(lines[1], /dataset: \{ boss: bossId, phase: 'loading'/);
    assert.match(lines[2], /const back = h\('a\.boss-back'/);
  });

  test('no heart, CONTINUE? or KO line reads the flag', () => {
    for (const fn of ['function finish(', 'export function recordBossRun', 'export function checkQuestion', 'function loseHeart', 'function drawHearts']) {
      const i = SRC.indexOf(fn);
      if (i < 0) continue;
      const block = SRC.slice(i, i + 1800);
      assert.ok(!/\bvault\b/.test(block), `${fn} reads the vault flag`);
    }
  });

  test('the KO record still keeps XP, mastery and tiles and forfeits only the stamp', () => {
    assert.match(SRC, /You keep every point of XP, every skill update and every tile you earned on the way — only the stamp is gone\./);
    assert.match(SRC, /CONTINUE/);
  });

  test('the record is handed back through the hook that already existed', () => {
    assert.match(SRC, /opts\.onFinish\?\.\(out\?\.record \?\? null\)/);
  });
});

/* ========================================================================================== */
describe('J11 #10 — COMPOSED Global rule 1: gates gate loot, not learning', () => {
  test('rank changes the 95 call and the guarded-wing multiplier, and those two only', () => {
    const ladders = [1, 2, 3, 4, 5].map((r) => call.callsFor(r).join('/'));
    assert.deepEqual(ladders, ['50/70/85', '50/70/85', '50/70/85/95', '50/70/85/95', '50/70/85/95']);
    const mults = [1, 2, 3, 4, 5].map((r) => guard.guardMultFor(r));
    assert.deepEqual(mults, [0.50, 0.55, 0.60, 0.70, 0.75]);
    for (let r = 2; r <= 5; r++) assert.ok(mults[r - 1] > mults[r - 2], 'rank helps, monotonically');
  });

  test('nothing in J11\'s four files gates a card, a boss, the Mock, a hint, a solution or a Variant on rank', () => {
    /* Two legal mentions, and they are the only two. (1) the Mock WRITING the rank back after its one
       call. (2) the Mock passing the rank it already holds to `call.ratingDetail` as the RATCHET's
       floor (S3, REPAIR-DECISION §S3.1(b)): rank gates the 95 rung and guardMult — loot — and this
       layer never removes a tool you own, so the recomputation is floored on the rank held. A floor
       argument cannot gate anything: it is an input to a number, not a branch. Everything else is
       still a gate and still fails, including a comparison, a conditional or a ternary on the rank. */
    const RATCHET_FLOOR = /ratingDetail\(\s*[^;]*?\{\s*rank:\s*save\.player\.rank\s*\}\s*\)/g;
    let ratchetSites = 0;
    for (const p of ['site/js/plan.js', 'site/js/screens/home.js', 'site/js/screens/mock.js', 'site/js/screens/boss.js']) {
      const bare = read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      assert.ok(!/\brankOf\b/.test(bare), `${p} calls guard.rankOf`);
      const floors = bare.match(RATCHET_FLOOR) ?? [];
      ratchetSites += floors.length;
      /* blank the allowed form OUT, then run the original lint over what is left: any other read of
         the rank in any of these four files still fails, exactly as before */
      const src = bare.replace(RATCHET_FLOOR, (m) => ' '.repeat(m.length));
      for (const m of src.matchAll(/(?:player|game)\.rank\b(.{0,3})/g)) {
        assert.match(m[1], /^\s*=[^=]/, `${p} READS the game rank: ${m[0]}`);
      }
      /* and the ratchet's floor may never become a branch */
      for (const m of bare.matchAll(/(?:player|game)\.rank\b\s*(?:[<>]=?|===?|!==?|\?)/g)) {
        assert.fail(`${p} BRANCHES on the game rank: ${m[0]}`);
      }
    }
    assert.equal(ratchetSites, 1,
      `the rank floor should be passed at exactly one site in these four files (found ${ratchetSites}) — `
      + 'screens/mock.js applyMockCall, the third writer of player.rank (REPAIR-DECISION §S3.1(b))');
    assert.equal(state.hintsOn(), true, 'hints are free and infinite, at every rank');
  });

  test('the Mock, the boss and the Night Before are reachable at rank 1 with an empty rating window', () => {
    const { save, now, today } = saveAtD(4);
    const s = clone(save);
    s.player.rating = { calls: [], value: 5.0, n: 0 };
    s.player.rank = call.rankFor(5.0);
    assert.equal(call.rankFor(0), 1, 'rank 1 exists and is the floor');
    assert.equal(call.callsFor(1).includes(95), false, 'and it is the rank without the 95 call');
    assert.equal(mock.mockCall({ pred: 50, score: 50 }, { sHat: 0.5 }).w, mock.MOCK_CALL_W,
      'the Mock still scores — the weight gates on the HISTORY, never on the rank');
    assert.equal(plan.boardPolicy(s, { now, today }).on, true);
    assert.equal(plan.boardPolicy(s, { now, today }).post, true, 'rank gates no board');
  });
});

/* ========================================================================================== */
describe('J11 — the two-pass board: Home\'s static half is PINNED to plan.js', () => {
  test('home.js still has no static import of page.js, plan.js or js/job/* (home-r2 and job-index both win)', () => {
    const src = read('site/js/screens/home.js');
    assert.ok(!/from '\.\.\/page\.js'/.test(src), 'no static page.js import');
    assert.ok(!/from '\.\.\/plan\.js'/.test(src), 'no static plan.js import');
    assert.ok(!/from '\.\.\/job\//.test(src), 'no static js/job/* import');
    assert.match(src, /import\('\.\.\/page\.js'\), import\('\.\.\/plan\.js'\)/, 'they are still dynamic');
    assert.match(src, /import\('\.\.\/job\/board\.js'\), import\('\.\.\/job\/crew\.js'\), import\('\.\.\/plan\.js'\)/, 'pass 2 is dynamic too');
  });

  test('weekGate ≡ boardPolicy over every (D × day × minute) the week contains', () => {
    let n = 0;
    for (const D of [null, -1, 0, 1, 2, 3, 6, 12]) {
      for (const day of [THU, SAT]) {
        for (const [hh, mm] of [[6, 0], [6, 59], [7, 0], [9, 30], [14, 14], [14, 15], [18, 0], [21, 59], [22, 0], [23, 30]]) {
          const { save, now, today } = saveAtD(D, { day, hh, mm });
          const a = plan.boardPolicy(save, { now, today });
          const b = home.weekGate(save, { now, today });
          assert.equal(b.kind, a.kind, `D ${D} ${day.d} ${hh}:${mm} kind`);
          assert.equal(b.post, a.post, `D ${D} ${day.d} ${hh}:${mm} post`);
          assert.equal(b.quiet, a.quiet);
          assert.equal(b.school, a.school);
          assert.equal(b.mode, a.mode, 'modeStatic ≡ plan.modeFor');
          if (a.shape !== null || b.shape !== null) assert.equal(b.shape, a.shape, 'shape');
          n++;
        }
      }
    }
    assert.equal(n, 160, 'the grid really ran');
  });

  test('the layer off hides the board on both sides', () => {
    const { save, now, today } = saveAtD(7);
    const s = clone(save);
    s.settings.game = false;
    assert.equal(plan.boardPolicy(s, { now, today }).on, false);
    assert.equal(home.weekGate(s, { now, today }).on, false);
    assert.equal(home.weekGate(s, { now, today }).post, false);
  });

  test('home.postedCountEstimate ≡ page.postedCountFor', () => {
    for (let n = 0; n <= 40; n++) assert.equal(home.postedCountEstimate(n), postedCountFor(n), `n = ${n}`);
  });

  test('home\'s NIGHT_MIN ≡ plan.NIGHT_BEFORE_MINUTES ≡ night.NIGHT_MINUTES', () => {
    assert.equal(plan.NIGHT_BEFORE_MINUTES, night.NIGHT_MINUTES);
    assert.equal(night.NIGHT_MINUTES, 30);
    assert.match(read('site/js/screens/home.js'), /const NIGHT_MIN = 30;/);
    const { save, now, today } = saveAtD(1);
    assert.equal(home.boardModel(save, { now, today }).line, plan.boardPolicy(save, { now, today }).line);
  });

  test('home\'s shapeTable shim ≡ econ.shapeTable for every shape', () => {
    for (const id of Object.keys(SHAPES)) {
      const e = econ.shapeTable(id), p = PUBLISHED.shapeTable[id];
      assert.equal(p.wallS[0], e.wallS.default, `${id} wall (default)`);
      assert.equal(p.wallS[1], e.wallS.full, `${id} wall (full)`);
      assert.equal(p.split[0], e.split.default, `${id} split`);
      assert.equal(p.targets, e.targets);
      assert.equal(plan.endsFor(id, { now: 0 }).wallS, e.wallS.default, 'plan.endsFor reads the same table');
    }
  });

  test('pass 1 paints a real board: rows, wings, and NOT ONE per-draft numeral', () => {
    /* REPAIR (r3 split-honesty). This arm used to assert `m.ends`, `m.minutes`, `m.projection` and
       `m.projectionSource === 'projected'` against `PUBLISHED.shapeTable` — the brochure row. The
       home lane has since removed pass 1's shape-table shim outright (`screens/home.js:20`,
       `:286-289`: every per-draft number "is ALWAYS null here, and that is the contract"), because
       pass 1 has neither tonight's draft nor `job/board.js`. That is the root fix for this finding:
       there is now exactly ONE projection in the product, `job/board.js`'s, so there is no second
       number for Home's to disagree with. This arm pins the new contract from both sides. */
    const { save, now, today } = saveAtD(7);
    const m = home.boardModel(save, { now, today });
    assert.equal(m.gate.post, true);
    assert.ok(m.rows.length >= 1 && m.rows.length <= 5);
    assert.deepEqual(m.supply.map((s) => s.wing), ['RECALL', 'FIGURES', 'WORDS', 'ALGEBRA']);
    for (const k of ['minutes', 'wallS', 'endsAt', 'ends', 'split', 'projection', 'projectionSource']) {
      assert.equal(m[k], null, `pass 1 printed a per-draft \`${k}\` it cannot know (${m[k]})`);
    }
    for (const r of m.rows) assert.equal(r.posted, null, 'the posted numerals are pass 2\'s');
    /* and the shim really is gone from the module, not merely unused by this save */
    const src = strip(read('site/js/screens/home.js'));
    assert.equal(/PUBLISHED\.shapeTable|shapeTable\(/.test(src), false,
      'pass 1 carries a shape table again — it would print the brochure under the board\'s own label');
    assert.equal(/COPY\.projection\(/.test(src), false,
      'pass 1 builds a projection sentence again; `job/board.js` is the only producer of that string');
    /* the sizing shape stays, is never printed, and `shapeName` is null unless the WEEK named it */
    assert.equal(typeof m.sizingShape, 'string');
    assert.equal(m.shapeName, null, 'the ordinary evening board does not name its shape in pass 1');
    const rb = saveAtD(2);
    assert.equal(home.boardModel(rb.save, { now: rb.now, today: rb.today }).shapeName,
      SHAPES[home.REVIEW_SHAPE].name,
      'the REVIEW BOARD does name it, because `weekGate` settled the shape itself');
  });

  test('the projection reads the student\'s OWN last five jobs when the ledger has them (G1 statement 1)', () => {
    /* REPAIR (r3 split-honesty, MINOR). This arm used to live on `home.boardModel`, build
       `tGame: 300000, tAnswer: 200000` by hand, and assert `m.split === 60`: 300/(300+200) is 60 by
       construction, so the only thing it established was that a division works on two numbers the
       test handed in. Two things changed it.

       (a) THE PLACE. G1 statement 1 is a claim about the board, and after r3 there is exactly ONE
           projection in the product: pass 1 prints `null` for every per-draft number
           (`screens/home.js:286-289`) and pass 2 writes `postBoard(...).projection` into the node it
           reserved (`screens/home.js:477`). So the claim is asserted where it is implemented, which
           also closes the other half of the finding — `grep -rn 'boardModel' tests/ | grep -c
           'postBoard'` was 0, and there was no second number to compare because Home no longer has
           one. The two-source-of-truth pin is (2) below.
       (b) THE CLOCK. `playJob` drives five REAL jobs through the state machine at a pace no
           published table owns (47 s to answer, 6 s to decide, 11 s per fixed phase), and
           `state.endJob` writes the log entries this arm reads back — so no term in the assertion is
           a constant this file owns.

       NEGATIVE CONTROLS, all three run against the shipped code before this arm was accepted:
         A. replacing the `playJob` ledger with five ZERO-TARGET walk entries drops
            `projectionSource` to `projected` (measured: `~31 % game · projected`), so assertion (1)
            FAILS — the arm can tell a measurement from a fallback.
         B. re-running the whole arm at the published tables' pace
            (`{ answerS: 36, decideS: 12, callS: 5, phaseS: 18 }`) moves the measured quantity from
            **22 % to 38 %** while the board follows it to the point (gap 0 both times, brochure
            43.2 both times) — so the number in (3) is the clock's, not a constant's.
         C. four slow-answer jobs followed by one deliberator's job makes the board's five-job mean
            and the last job's headline **9 % against 90 %, gap 81** — the ±5 band in (3) is an
            assertion that can fail, not a tautology. */
    const { save, now, today } = saveAtD(7);
    const s = clone(save);
    s.game.log = [];
    let last = null;
    for (let j = 0; j < 5; j++) {
      last = playJob(s, { now: now - (5 - j) * 3600000, today, shape: 'JOB' });
      assert.ok(last, `job ${j} wrote no log entry`);
    }
    const log = s.game.log.slice(-5);
    assert.equal(log.length, 5, 'five real jobs on record');
    for (const e of log) {
      assert.ok(e.tGame > 0 && e.tAnswer > 0, 'each entry carries both accumulators');
      assert.ok(e.targets > 0, 'and real targets, so it is one of "your last N jobs"');
      assert.notEqual(e.tGame, 300000, 'the clock is the machine\'s, not this file\'s old constant');
      assert.notEqual(e.tAnswer, 200000, 'the clock is the machine\'s, not this file\'s old constant');
    }

    /* (1) the BOARD reads them, says so, and prints the sentence G1 publishes */
    const pb = postBoard(s, today, { now });
    assert.equal(pb.projectionSource, 'ledger', 'five real jobs on record and the board still says `projected`');
    assert.equal(pb.projection, COPY.projection({ split: pb.split, jobs: 5 }));
    assert.match(pb.projection, /your last 5 jobs$/);

    /* (2) and pass 1 prints NO second number for it to disagree with — the finding's other half */
    const m = home.boardModel(s, { now, today });
    assert.equal(m.split, null, 'pass 1 is printing a projection again; there must be exactly one');
    assert.equal(m.projectionSource, null);
    /* the RAW source, not the stripped one: the selector IS a string, and `strip` empties strings */
    assert.match(read('site/js/screens/home.js'),
      /setNumeral\(meta\.querySelector\('\.b-split'\), board\.projection\)/,
      'pass 2 must write the BOARD\'s projection into the node pass 1 reserved');

    /* (3) THE SECOND CLOCK: the number the student was HEADLINED at the debrief of the last of those
       jobs, computed by `run.js sessionSplit` off the entry `endJob` wrote, on the debrief basis (the
       read in neither term — COMPOSED-GAME.md:122). The board's projection of the same quantity must
       land inside the published band. This is the criterion `tests/job-split.test.mjs` asserts on a
       scripted walkthrough; here it is asserted on the state machine's own clock through Home's own
       door, which is the pair the finding said nothing covered. */
    const headline = Math.round(100 * sessionSplit({ tGame: last.tGame, tAnswer: last.tAnswer }, s).measured);
    assert.ok(Math.abs(pb.split - headline) <= SPLIT.agreeWithinPoints,
      `the board projected ${pb.split} % against a debrief headline of ${headline} % — more than `
      + `SPLIT.agreeWithinPoints = ${SPLIT.agreeWithinPoints}`);
    /* and the pace really is the student's, not a table: the brochure row is a different number */
    assert.notEqual(headline, PUBLISHED.shapeTable.JOB.split[0],
      'the clock driving this arm is the published table after all — the arm has gone circular');
  });

  test('THE AGREEMENT: one projection, and the numeral Home shows is the BOARD\'s', () => {
    /* REPAIR (r3 split-honesty, MINOR). The finding: "nothing anywhere pins Home's printed split to
       the board's". It cannot be pinned as an agreement of two numbers any more, because the home
       lane removed the second number at the root (pass 1's shape-table shim is gone, r3). What is
       pinnable — and what the finding was really about — is that there is exactly ONE producer of the
       projection in the product, and that the numeral Home ends up showing is that one. Asserted
       three ways, over the week states Home actually paints.

       Measured while writing this, on 12 saves × both branches, against the estimator home.js USED
       to carry: the ledger branch disagreed with the board by 2–7 points (median 5) and the
       projected branch by 7–21 (median 13). Those are the numbers the removal bought, and they are
       recorded here because nothing else in the tree records them. */
    let posted = 0;
    for (let seed = 0; seed < 12; seed++) {
      for (const D of [7, 4, 2]) {
        const { save, now, today } = saveAtD(D, { seed });
        const s = clone(save);
        if (seed % 2 === 0) for (let j = 0; j < 5; j++) playJob(s, { now: now - (5 - j) * 3600000, today });
        const hm = home.boardModel(s, { now, today });
        if (!hm.gate.post) continue;
        posted++;
        /* (1) pass 1 never prints one, on any week state that posts a board */
        for (const k of ['minutes', 'wallS', 'endsAt', 'ends', 'split', 'projection', 'projectionSource']) {
          assert.equal(hm[k], null, `D=${D} seed=${seed}: pass 1 printed \`${k}\` = ${hm[k]}`);
        }
        /* (2) the board does, on the same save and the same shape Home sized for the same week */
        const pb = postBoard(s, today, { now, ...(hm.gate.shape ? { shape: hm.gate.shape } : {}) });
        assert.equal(typeof pb.split, 'number', `D=${D} seed=${seed}: the board printed no split`);
        assert.ok(pb.split >= 0 && pb.split <= 100);
        assert.match(pb.projection,
          pb.projectionSource === 'ledger' ? /^~\d+ % game · your last [1-5] jobs$/ : /^~\d+ % game · projected$/,
          `D=${D} seed=${seed}: "${pb.projection}" is not COPY.projection's sentence for a ${pb.projectionSource} read`);
        assert.ok(pb.projection.startsWith(`~${pb.split} % game`),
          `D=${D} seed=${seed}: the sentence and the number disagree (${pb.split} vs "${pb.projection}")`);
        /* (3) and where the WEEK settled the shape, Home's sizing shape is the board's own shape —
               the one thing pass 1 may still say about tonight */
        if (hm.gate.shape) assert.equal(pb.shape, hm.gate.shape, `D=${D} seed=${seed}: shape drift between the passes`);
      }
    }
    assert.ok(posted >= 24, `only ${posted} posting week states were reached`);
    /* both branches of the board's own estimator were exercised by the loop above */
    const { save, now, today } = saveAtD(7, { seed: 0 });
    const cold = clone(save); cold.game.log = [];
    assert.equal(postBoard(cold, today, { now }).projectionSource, 'projected', 'job 1 must label itself');
    const warm = clone(save); warm.game.log = [];
    for (let j = 0; j < 5; j++) playJob(warm, { now: now - (5 - j) * 3600000, today });
    assert.equal(postBoard(warm, today, { now }).projectionSource, 'ledger', 'five real jobs must be read');
  });

  test('pass 1 has NO spinner and every pass-2 numeral is a --muted placeholder of its final width', () => {
    const src = read('site/js/screens/home.js');
    const fn = src.slice(src.indexOf('function numeral('), src.indexOf('function setNumeral('));
    assert.match(fn, /minWidth: `\$\{chars\}ch`/, 'the placeholder occupies its final width');
    assert.match(fn, /dataset\.pending = '1'/);
    assert.match(fn, /classList\.add\('muted'\)/);
    const panel = src.slice(src.indexOf('function boardPanel('), src.indexOf('export function fillBoard('));
    assert.ok(!/aria-busy|Loading|spinner|skeleton/i.test(panel), 'the board never shows a loading state');
    assert.match(panel, /minHeight: `\$\{model\.reserve \* BOARD_ROW_PX\}px`/, 'the row list reserves its height');
    const fill = src.slice(src.indexOf('export function fillBoard('));
    assert.ok(!/replaceChildren|innerHTML/.test(fill.slice(0, fill.indexOf('export function coldCrewOf'))), 'pass 2 rewrites ink, never structure');
  });

  test('the cold-crew strip prints the dues in pass 1 and the idle count in pass 2', () => {
    const { save, now, today } = saveAtD(7);
    const m = home.boardModel(save, { now, today });
    assert.equal(m.coldCrew.idle, null, 'the idle count needs the composed pool — pass 2');
    assert.equal(typeof m.coldCrew.dues, 'number');
    assert.equal(m.coldCrew.dues, m.dues);
    /* r3: this arm used to assert the phrase `crew idle on their own reviews · ` as a regex over
       home.js's source and the mere TYPE of `COPY.coldCrew` — both green while the screen carried
       its own copy of the sentence and `COPY.coldCrew` had no caller at all. The strip is now built
       from the table's own line, split at the two numerals pass 1 has to reserve; this asserts the
       fragments REASSEMBLE the table's sentence, which is a claim about the words the student
       reads. `home.copyParts` is the shipped splitter, not a second implementation. */
    const cc = home.copyParts(COPY.coldCrew, ['idle', 'dues', 'minutes']);
    assert.equal(cc.length, 4, 'COPY.coldCrew no longer has three numerals — the strip would drop a phrase');
    assert.equal(cc[0] + 4 + cc[1] + 9 + cc[2] + 4 + cc[3], COPY.coldCrew({ idle: 4, dues: 9, minutes: 4 }),
      'the strip\'s fragments do not reassemble the table\'s own sentence');
    assert.ok(!read('site/js/screens/home.js').includes("' crew idle on their own reviews · '"),
      'home.js re-types the cold-crew sentence the table owns');
    const sup = home.copyParts(COPY.supply, ['wing', 'locks']);
    assert.equal(sup.length, 3);
    assert.equal(sup[0] + 'WORDS' + sup[1] + 7 + sup[2], COPY.supply({ wing: 'WORDS', locks: 7 }),
      'the supply row\'s fragments do not reassemble COPY.supply');
  });

  test('the board panel sits ABOVE the primary button (G7)', () => {
    const src = read('site/js/screens/home.js');
    const col = src.slice(src.indexOf("const panel = model ? boardPanel(model) : null;"));
    assert.ok(col.indexOf('panel,') < col.indexOf("h('div.home-cta'"), 'the Board is above the CTA');
  });
});

/* ========================================================================================== */
describe('J11 — nothing the week does locks a study door (G9 #9)', () => {
  test('every no-board state still names a study route', () => {
    for (const [D, hh, want] of [[1, 19, '#/run/night'], [0, 6, '#/run/morning'], [5, 22, '#/today'], [null, 19, '#/today']]) {
      const { save, now, today } = saveAtD(D, { hh });
      const p = plan.boardPolicy(save, { now, today });
      assert.equal(p.href, want, `D ${D} at ${hh}:00`);
    }
  });

  test('nextActionFor never replaces a resume — an unfinished page outranks a new board', () => {
    const { save, now, today } = saveAtD(7);
    const act = { kind: 'resume', label: 'Continue page · 4 of 12', href: '#/run/page' };
    const out = plan.nextActionFor(save, act, { now, today });
    assert.equal(out.kind, 'resume');
    assert.equal(out.href, '#/run/page');
  });

  /* ---- r1 INTEGRATION: the board is a skin over the PAGE, so it replaces the page and nothing else.
     The guard used to name only `resume` and `warmup`, so the three study actions `page.nextAction`
     ranks between them and the page — `boss`, `mock`, `missed` — were all swallowed by the board.
     Measured on qa/fixtures/audit/mock-cta.json: nextAction → `mock`, nextActionFor → `job`, so
     `.home-primary[data-kind="mock"]` never entered the DOM on the one evening the Mock must lead.
     G7 "One queue, two skins"; G9 #9 "none of it locks a single study door"; G10 #11 "it gates no
     card, no boss, no Mock". Caught by qa/audit-states.mjs `home-mock-cta` (notes/tests-fix.md #5). */

  test('the board replaces the PAGE action and no other — boss, mock and missed all still lead', () => {
    const { save, now, today } = saveAtD(3);
    // Every kind `page.nextAction` can rank ABOVE the page. Each is a distinct study action, so each
    // must survive the decorator with its own kind and its own href.
    const above = [
      { kind: 'boss', label: 'Boss: Angle Pairs', href: '#/boss/ap' },
      { kind: 'mock', label: 'Mock #1', href: '#/mock' },
      { kind: 'missed', label: 'Drill what you missed', href: '#/run/missed' },
      { kind: 'warmup', label: 'Warm-up', href: '#/onboard' },
      { kind: 'resume', label: 'Continue page · 4 of 12', href: '#/run/page' },
    ];
    for (const act of above) {
      const out = plan.nextActionFor(save, act, { now, today });
      assert.equal(out.kind, act.kind, `${act.kind} must not become the board`);
      assert.equal(out.href, act.href, `${act.kind} must keep its own route`);
      assert.ok(out.board, `${act.kind} still carries .board for the panel`);
    }
    // …and the page, the one it IS a skin over, still becomes the board.
    const page = { kind: 'page', label: 'RUN NEXT · 6 reviews + 8 new', href: '#/run/page', page: { queue: [] } };
    const out = plan.nextActionFor(save, page, { now, today });
    assert.equal(out.kind, 'job', 'the page is still replaced — that is G7\'s branch');
    assert.equal(out.href, '#/run/job');
    assert.equal(out.from, page, 'and the action it replaced is still reachable');
  });

  test('END TO END: at T−3 with the goal met the Mock leads, with the board on and posting', () => {
    const { save, now, today } = saveAtD(3);
    const s = clone(save);
    s.daily = { ...(s.daily ?? {}), [today]: { ...(s.daily?.[today] ?? {}), goalMet: true, mockDone: false } };
    s.runs = (s.runs ?? []).filter((r) => r?.kind !== 'mock');   // no Mock taken yet
    delete s.inProgress;                                         // nothing to resume

    // The board really is on and really would post tonight — otherwise this test passes vacuously.
    const policy = plan.boardPolicy(s, { now, today });
    assert.equal(policy.on, true, 'the layer is on');
    assert.equal(policy.post, true, 'and a board would post tonight');

    const act = nextAction(s, { now, today });
    // A boss can legitimately outrank the Mock on a generated save; it is the OTHER kind this fix
    // protects, so either is a valid lead here — what must never happen is the board eating it.
    assert.ok(act.kind === 'mock' || act.kind === 'boss', `the week's own lead, got ${act.kind}`);

    const out = plan.nextActionFor(s, act, { now, today });
    assert.equal(out.kind, act.kind, 'the board must not displace the week\'s lead');
    assert.equal(out.href, act.href);
    assert.notEqual(out.kind, 'job');
  });

  /* ---- INTEGRATION: the two doors J5c and J6 both flagged and neither owned ---- */

  test('a LIVE job resumes to #/run/job, not to the flat page with the stakes still on the disk', () => {
    const { save, now, today } = saveAtD(7);
    const s = clone(save);
    s.inProgress = { kind: 'page', seed: 'x', queue: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], idx: 1, startedAt: now, meta: {} };
    const act = { kind: 'resume', label: 'Continue page · 2 of 3', href: '#/run/page' };
    assert.equal(plan.nextActionFor(s, act, { now, today }).href, '#/run/page', 'a plain page still resumes to the page');
    s.inProgress.game = { outcome: null, shape: 'JOB' };
    const out = plan.nextActionFor(s, act, { now, today });
    assert.equal(out.kind, 'resume', 'a resume is still a resume — a live job is never replaced by a new board');
    assert.equal(out.href, '#/run/job', 'notes/J5c.md §7 / notes/J6.md §7: inProgress.kind is "page" for a job too');
    assert.equal(out.label, COPY.resumeJob({ n: 2, of: 3 }));
    /* a FINISHED record is not a live job */
    s.inProgress.game.outcome = 'completed';
    assert.equal(plan.nextActionFor(s, act, { now, today }).href, '#/run/page');
  });

  test('the layer OFF closes the job door: a live job resumes to the flat page and #/run/job does not mount', () => {
    const { save, now, today } = saveAtD(7);
    const s = clone(save);
    s.settings.game = false;
    s.inProgress = { kind: 'page', seed: 'x', queue: [{ id: 'a' }], idx: 0, startedAt: now, meta: {}, game: { outcome: null } };
    const act = { kind: 'resume', label: 'Continue page · 1 of 1', href: '#/run/page' };
    assert.equal(plan.nextActionFor(s, act, { now, today }).href, '#/run/page',
      'with the layer off the student is the study tool\'s, not the job\'s');
    /* and the route itself is a door, not a decoration — `mountJob` runs the WEEK GATE before it
       mounts anything, and the gate's `off` branch IS the layer switch (G10 #22). r2: the old form
       of this assertion pinned a bare `settings.game === false` line, which is why the door was shut
       on the switch and wide open on the week. */
    const body = mountJobBody();
    assert.match(body, /jobEntryGate\(\s*getState\(\)/, '`mountJob` must ASK plan.jobEntryGate');
    assert.match(body, /if\s*\(!gate\.allow\)\s*\{[^}]*navigate\(/, '…and navigate on a refusal');
    assert.ok(body.indexOf('jobEntryGate') < body.indexOf('mount(host'),
      'the gate is asked BEFORE the screen mounts');
    const off = plan.jobEntryGate(s, { now, today });
    assert.equal(off.allow, false, 'and with the layer off the gate refuses');
    assert.equal(off.redirect, '#/today');
  });

  test('with the layer off, nextActionFor returns the study action it was handed', () => {
    const { save, now, today } = saveAtD(7);
    const s = clone(save);
    s.settings.game = false;
    const act = { kind: 'page', label: 'RUN NEXT · 6 reviews + 8 new', href: '#/run/page' };
    const out = plan.nextActionFor(s, act, { now, today });
    assert.equal(out.kind, 'page');
    assert.equal(out.label, act.label);
  });

  test('G7\'s branch, positively: at D >= 3 with the layer on, the primary button becomes the board\'s', () => {
    const { save, now, today } = saveAtD(7);
    const act = { kind: 'page', label: 'RUN NEXT · 6 reviews + 8 new', href: '#/run/page', page: { queue: [] } };
    const out = plan.nextActionFor(save, act, { now, today });
    assert.equal(out.kind, 'job');
    assert.equal(out.href, '#/run/job');
    assert.match(out.label, /^JOB · 10 targets · ~\d+ min · ends \d\d:\d\d · \d+ % game$/);
    assert.equal(out.from, act, 'the study action it replaced is still reachable');
    assert.equal(out.page, act.page, 'and so is the composed page');
  });

  test('D = 0 and D = 1 are returned UNCHANGED — night and morning win (G7)', () => {
    for (const [D, kind, href] of [[1, 'night', '#/run/night'], [0, 'morning', '#/run/morning']]) {
      const { save, now, today } = saveAtD(D, { hh: 6, mm: 30 });
      const act = { kind, label: kind === 'night' ? 'Night Before' : 'Test Morning', href };
      const out = plan.nextActionFor(save, act, { now, today });
      assert.equal(out.kind, kind);
      assert.equal(out.href, href);
      assert.notEqual(out.kind, 'job');
    }
  });

  test('J13 r1 — the terminus branch reads no clock either, and the entry gate is pure', () => {
    const src = read('site/js/plan.js');
    const block = src.slice(src.indexOf('boardPolicy(save, opts) → what the WEEK'), src.indexOf("G7's one branch, as a decorator"));
    assert.ok(!/Math\.random/.test(block));
    assert.ok(!/localStorage|sessionStorage/.test(block));
  });

  test('plan.js reads no clock in a payoff term: the only clocks are the end time, the gate and the window', () => {
    const src = read('site/js/plan.js');
    const block = src.slice(src.indexOf('J11 — THE WEEK'), src.indexOf('the strip (the only DOM in this file)'));
    assert.ok(!/Math\.random/.test(block), 'no Math.random');
    assert.ok(!/document|window\.|localStorage/.test(block), 'the week gate is DOM-free');
  });
});

/* ==========================================================================================
   J13 round 1 — the three week-lane findings, each with the repro that found it.
   ========================================================================================== */

/** 2026-09-21 is a MONDAY — the day the school-window repro was taken on. */
const MON = { y: 2026, m: 9, d: 21 };

describe('J13 r1 — `#/run/job` obeys boardPolicy on ENTRY (the deep link AND the debrief\'s `Another board`)', () => {
  test('the school window narrows the ROUTE, not only Home\'s button', () => {
    // the live repro: Mon 2026-09-21 13:53, inside Mon–Fri 07:00–14:15. Home said "RUN only"; the
    // route handed out a full stakes JOB with guard, tokens and a vault.
    const { save, now, today } = saveAtD(6, { day: MON, hh: 13, mm: 53 });
    const policy = plan.boardPolicy(save, { now, today });
    assert.equal(policy.kind, 'school', 'the window really is the school window');
    const g = plan.jobEntryGate(save, { now, today });
    assert.equal(g.allow, true, 'the school window posts a board — a narrowed one, not none');
    assert.equal(g.shape, 'RUN', 'and the ROUTE is handed RUN, not a free choice of shape');
    assert.equal(g.vault, false, 'no vault inside the school window');
    assert.equal(g.policy.kind, 'school');
  });

  test('after 22:00 the route refuses, names the study road and carries the closed line', () => {
    const { save, now, today } = saveAtD(6, { hh: 22, mm: 30 });
    const g = plan.jobEntryGate(save, { now, today });
    assert.equal(g.allow, false, 'COMPOSED wins on quiet hours (G1): no new board after 22:00');
    assert.equal(g.redirect, '#/today', 'and the study road is named, never closed (G9 #9)');
    assert.match(g.line, /^Board closed · Night Before/);
  });

  test('every no-board state refuses to the route the week already named', () => {
    for (const [D, hh, href] of [[1, 19, '#/run/night'], [0, 6, '#/run/morning'], [-1, 19, '#/today'], [null, 19, '#/today']]) {
      const { save, now, today } = saveAtD(D, { hh, mm: 0 });
      const g = plan.jobEntryGate(save, { now, today });
      assert.equal(g.allow, false, `D ${D} must not mount the job screen`);
      assert.equal(g.redirect, href, `D ${D} redirect`);
    }
  });

  test('the layer off still closes the door, and says nothing about a board', () => {
    const { save, now, today } = saveAtD(6);
    const s = clone(save);
    s.settings.game = false;
    const g = plan.jobEntryGate(s, { now, today });
    assert.equal(g.allow, false);
    assert.equal(g.redirect, '#/today');
    assert.equal(g.line, '');
  });

  test('a LIVE job is never stranded — it finishes at every hour the board is closed', () => {
    for (const [D, hh, mm] of [[6, 22, 30], [6, 13, 53], [2, 20, 0], [1, 20, 0], [0, 6, 0]]) {
      const { save, now, today } = saveAtD(D, { day: MON, hh, mm });
      const s = clone(save);
      s.inProgress = { kind: 'page', startedAt: now - 6e5, idx: 2, queue: [{}, {}, {}, {}], game: { outcome: null, loose: 41 } };
      const g = plan.jobEntryGate(s, { now, today });
      assert.equal(g.allow, true, `a live job at D ${D} ${hh}:${mm} must not be thrown away`);
      assert.equal(g.resume, true);
    }
  });

  test('G2\'s terminus does NOT close the route — the board is still one tap away', () => {
    const { save, now, today } = terminal();
    assert.equal(plan.boardPolicy(save, { now, today }).kind, 'quiet');
    const g = plan.jobEntryGate(save, { now, today });
    assert.equal(g.allow, true, 'the terminus stops the board LEADING; it does not lock it');
    assert.equal(g.vault, true, 'and the board it hands over is the real evening one');
  });

  test('the REVIEW BOARD\'s constraints reach the route as well as the button', () => {
    const { save, now, today } = saveAtD(2, { hh: 19, mm: 0 });
    const g = plan.jobEntryGate(save, { now, today });
    assert.equal(g.allow, true);
    assert.equal(g.shape, plan.REVIEW_SHAPE);
    assert.equal(g.vault, false);
    assert.equal(g.guard, false);
    assert.equal(g.tokens, false);
    assert.equal(g.flatLadder, true);
  });

  test('`jobEntryGate` is the one decision: it agrees with `boardPolicy` at every (D × day × minute)', () => {
    for (const D of [null, -1, 0, 1, 2, 3, 6]) {
      for (const day of [THU, SAT, MON]) {
        for (const [hh, mm] of [[6, 59], [7, 0], [13, 53], [14, 15], [21, 59], [22, 0]]) {
          const { save, now, today } = saveAtD(D, { day, hh, mm });
          const p = plan.boardPolicy(save, { now, today });
          const g = plan.jobEntryGate(save, { now, today });
          const expected = p.on && (p.post ? p.kind !== 'morning' : p.kind === 'quiet');
          assert.equal(g.allow, expected, `D ${D} ${day.d} ${hh}:${mm} (${p.kind})`);
          if (!g.allow) assert.ok(g.redirect && g.redirect.startsWith('#/'), 'a refusal always names a route');
        }
      }
    }
  });
});

/* ==========================================================================================
   J13 round 2 — THE CALL SITES. Round 1 landed both week decisions as tested, exported,
   documented functions that NOTHING CALLED: `grep -rn "jobEntryGate" site/` returned the
   definition twice and `grep -rn "commitFire\|commitDue" site/` returned two comments and two
   definitions. A gate with no call site is a gate the route does not have, and a declaration
   nothing fires is exactly the "free-and-non-binding COMMIT" G11 rejects by name. These tests
   fail if either one goes dead again.
   ========================================================================================== */
describe('J13 r2 — the week gate is AT the door of `#/run/job`, not beside it', () => {
  test('`mountJob` imports the gate, asks it with the live save, and refuses before it mounts', () => {
    const raw = read('site/js/screens/job.js');
    assert.match(raw, /jobEntryGate\s*\}\s*from\s*'\.\.\/plan\.js'/, 'the screen imports the decision');
    const body = mountJobBody();
    assert.match(body, /jobEntryGate\(\s*getState\(\)/, 'it asks the gate about the SAVE, not about a guess');
    assert.match(body, /if\s*\(!gate\.allow\)/, 'and branches on the answer');
    assert.match(body, /navigate\([^)]*gate\.redirect/, 'a refusal navigates to the route the WEEK named');
    assert.ok(body.indexOf('jobEntryGate') < body.indexOf('mount(host'),
      'the gate is asked BEFORE the screen mounts — a door, not a banner');
    assert.equal((jobScreenCode().match(/jobEntryGate\(/g) ?? []).length, 1,
      'exactly one door: the gate is asked once, at the route');
  });

  test('the ROUTE refuses in every state the week refuses, and to the same road', () => {
    const cases = [
      ['after 22:00', saveAtD(6, { hh: 22, mm: 30 }), '#/today'],
      ['D = 1, the Night Before', saveAtD(1, { hh: 19, mm: 0 }), '#/run/night'],
      ['D = 0, Test Morning', saveAtD(0, { hh: 6, mm: 30 }), '#/run/morning'],
      ['the test is done', saveAtD(-1, { hh: 19, mm: 0 }), '#/today'],
    ];
    for (const [why, { save, now, today }, road] of cases) {
      const g = plan.jobEntryGate(save, { now, today });
      assert.equal(g.allow, false, `${why}: the board does not post`);
      assert.equal(g.redirect, road, `${why}: and the study road is named`);
      assert.ok(String(g.redirect).startsWith('#/'), 'the screen strips the leading # for navigate()');
    }
    /* the one that must NOT be refused: a live job on the disk, at every closed hour */
    const { save, now, today } = saveAtD(1, { hh: 22, mm: 30 });
    const s = clone(save);
    s.inProgress = { kind: 'page', startedAt: now - 6e5, idx: 1, queue: [{}, {}], game: { outcome: null, loose: 12 } };
    assert.equal(plan.jobEntryGate(s, { now, today }).allow, true, 'nothing on the disk is ever stranded');
  });

  test('the week\'s SHAPE reaches `postBoard`, so the school window really posts RUN', async () => {
    const code = jobScreenCode();
    const i = code.indexOf('postBoard(getState()');
    assert.ok(i > 0, 'the screen still posts the board itself');
    const callSite = code.slice(i, code.indexOf('});', i) + 3);
    assert.match(callSite, /gate\?\.shape/, 'the gate\'s shape is handed to the board');
    assert.match(callSite, /shapeOpts/, 'with boardPolicy\'s own shapeOpts');
    /* and `postBoard` really honours it — `job/board.js shapeFor`: "opts.shape always wins" */
    const { postBoard } = await import('../site/js/job/board.js');
    const { save, now, today } = saveAtD(6, { day: MON, hh: 13, mm: 53 });
    const gate = plan.jobEntryGate(save, { now, today });
    assert.equal(gate.shape, 'RUN', 'the school window names RUN');
    assert.equal(postBoard(save, today, { now, shape: gate.shape }).shape, 'RUN',
      'and a board posted with it IS a RUN');
    assert.notEqual(postBoard(save, today, { now }).shape, 'RUN',
      'which is a real change: without the shape the same save posts the evening board');
  });
});

describe('J13 r2 — the declaration BINDS because the screen fires it (G3.9, G11 #25)', () => {
  const code = () => jobScreenCode();

  /** A live job with a pile on it, started at the given clock (the r1 fixture, re-declared here). */
  function liveJobAt({ hh = 21, mm = 30 } = {}) {
    const { save, now, today } = saveAtD(6, { hh, mm });
    const s = clone(save);
    state.startJob(s, { today, now });
    state.beginTargets(s, { now: now + 6000 });
    const g = state.stateOf(s);
    g.loose = 90;
    g.bagged = 100;
    g.chain = 3;
    return { save: s, now, today, g };
  }

  test('`commitDue` and `commitFire` have real call sites, inside an `update()`', () => {
    const src = code();
    assert.ok(/state\.commitDue\(/.test(src), 'the screen reads the declaration\'s clock');
    assert.ok(/state\.commitFire\(/.test(src), 'and fires it — the ONLY producer of OUTCOMES.COMMIT');
    const fire = src.indexOf('state.commitFire(');
    const open = src.lastIndexOf('update(', fire);
    assert.ok(open > 0 && fire - open < 200, 'the fire is applied through store.update(), like every other mutator');
    assert.ok(src.indexOf('state.commitDue(') < fire, 'and it is guarded by the due test, never fired blind');
  });

  test('the watch is a clock: it polls within the declared MINUTE and is torn down', () => {
    const src = code();
    const ms = Number((src.match(/COMMIT_POLL_MS\s*=\s*(\d+)/) ?? [])[1]);
    assert.ok(Number.isFinite(ms) && ms > 0 && ms <= 60000,
      `the poll must land inside the declared minute (got ${ms})`);
    assert.match(src, /setInterval\(\s*checkCommit/, 'the watch runs while the job does');
    assert.ok(/clearInterval\(/.test(src), 'and is cleared');
    const teardown = src.slice(src.lastIndexOf('return () => {'));
    assert.match(teardown, /stopCommitWatch\(\)/, 'the screen\'s teardown stops it — no timer outlives the mount');
    /* a background tab throttles `setInterval` and a sleeping phone stops it: the watch is re-read
       when the tab comes back, or a declaration made at 21:45 fires whenever the timer next wakes. */
    assert.match(read('site/js/screens/job.js'), /addEventListener\('visibilitychange'/,
      'the screen still listens for the tab coming back');
    const onHide = src.slice(src.indexOf('const onHide ='), src.indexOf('addEventListener(', src.indexOf('const onHide =')));
    assert.match(onHide, /checkCommit\(\)/, 'and re-checks the declaration when it does');
  });

  test('end to end: at the declared minute the job is over, +8 % paid, the rest on Today\'s Page', () => {
    const { save } = liveJobAt({ hh: 21, mm: 30 });
    state.commitBind(save, { kind: 'doneBy', byMin: 21 * 60 + 45 });
    const total = state.queueOf(save).length;
    const done = state.answered(save);
    const g = state.stateOf(save);
    const loose = g.loose, bagged = g.bagged;
    const early = at(THU.y, THU.m, THU.d, 21, 44);
    assert.equal(state.commitDue(save, early), false, 'not before the minute');
    const due = at(THU.y, THU.m, THU.d, 21, 45);
    assert.equal(state.commitDue(save, due), true, 'and at it');
    const out = state.commitFire(save, { now: due, day: todayISO(new Date(due)) });
    assert.equal(out.banked, loose, 'FULL value');
    assert.equal(out.finalBagged, econ.round((bagged + loose) * (1 + COMMIT_BONUS)));
    assert.ok(!state.stateOf(save), 'the job is over');
    assert.equal(save.inProgress.queue.length, total, 'and no item left the schedule');
    assert.ok(total - done > 0, 'the rest is still due on Today\'s Page');
  });
});

describe('J13 r1 — the 22:00 refusal is decided against the BOARD\'s projection, not the shape table', () => {
  test('`refuseFor` and `jobAction` take the board\'s own wallS', () => {
    const now = at(THU.y, THU.m, THU.d, 21, 45);
    const table = PUBLISHED.shapeTable.JOB.wallS[0];
    assert.ok(now + table * 1000 <= at(THU.y, THU.m, THU.d, 22, 0), 'the TABLE says a JOB at 21:45 fits');
    assert.equal(plan.refuseFor('JOB', { now }), null, '…so the brochure gate let it through');

    const real = 20 * 60;                                   // the drafted queue's own 20 minutes
    const r = plan.refuseFor('JOB', { now, wallS: real });
    assert.ok(r, 'the board\'s OWN projection ends at 22:05 and IS refused');
    assert.equal(r.ends, timeHM(new Date(now + real * 1000)));
    assert.equal(r.alt.shape, 'RUN');

    const { save, today } = saveAtD(6, { hh: 21, mm: 45 });
    const withBoard = plan.jobAction(save, { now, today, wallS: real });
    assert.ok(withBoard.refusal, 'jobAction refuses on the board\'s wall clock');
    assert.equal(withBoard.ends, r.ends, 'and the button\'s `ends` is the board\'s, not the table\'s');
    assert.equal(plan.jobAction(save, { now, today }).refusal, null, 'with no board it is the table\'s, as before');
  });

  test('the gate is a FUNCTION of the projection it is handed — every shape, every minute of the hour', () => {
    let disagreements = 0;
    for (const shape of ['RUN', 'JOB', 'JOB12', 'VAULT']) {
      const table = PUBLISHED.shapeTable[shape].wallS[0];
      for (const wallS of [table, table * 0.6, table * 1.4, table + 600]) {
        for (let mm = 0; mm < 60; mm += 3) {
          const now = at(THU.y, THU.m, THU.d, 21, mm);
          const refused = !!plan.refuseFor(shape, { now, wallS });
          assert.equal(refused, now + Math.round(wallS * 1000) > plan.quietLimit(now),
            `${shape} wall ${Math.round(wallS)} s at 21:${String(mm).padStart(2, '0')}`);
          if (refused !== !!plan.refuseFor(shape, { now })) disagreements++;
        }
      }
    }
    assert.ok(disagreements > 0,
      'the board\'s clock and the table\'s clock never disagreed — the test cannot have measured anything');
  });

  test('Home pass 2 re-decides it against `board.endsAt`, and may RAISE a refusal as well as clear one', () => {
    const src = read('site/js/screens/home.js');
    assert.match(src, /refuseFor/, 'pass 2 binds plan.refuseFor');
    assert.match(src, /const wallS = Math\.max\(0, \(board\.endsAt - board\.now\) \/ 1000\)/);
    assert.match(src, /refuseFor\(board\.shape \?\? act\.shape, \{ now, wallS \}\)/);
    assert.ok(!/act\.kind === 'job' && !refusal/.test(src),
      'pass 2 may no longer be SKIPPED because pass 1 already refused — that is how the wrong number shipped');
  });
});

/** A genuinely terminal save: every lock cleared and cold, every make mastered, a 95 % Mock, crew HELD in all four wings. */
function terminal({ day = THU, hh = 19, mm = 0, D = 7 } = {}) {
  const now = at(day.y, day.m, day.d, hh, mm);
  const today = todayISO(new Date(now));
  const s = fresh(now - 40 * DAY_MS);
  s.profileId = 'week-terminal';
  s.settings.testDate = addDays(today, D);
  for (const id of BANK_IDS) {
    s.cards[id] = { cleared: true, bucket: 5, lastAt: now - 3 * DAY_MS, due: now + 20 * DAY_MS, rarity: 'gold', history: [{ at: now - 3 * DAY_MS, ok: true, attempt: 1, hints: 0, ms: 5000 }] };
  }
  s.skills = {};
  for (const sk of ALL_SKILLS) s.skills[sk.id] = { m: 100, n: 12, shown: 12, streak: 6, lastAt: now - 3 * DAY_MS };
  s.runs = [{ kind: 'mock', status: 'done', n: 20, accuracy: 0.95, score: 95, submittedAt: now - 2 * DAY_MS, startedAt: now - 2 * DAY_MS - 18e5, items: [] }];
  s.game = s.game ?? {};
  s.game.crew = { VOC: 2, PAIRS: 2, 'CS-LIN': 2, FAC2: 2 };
  return { save: s, now, today };
}

describe('J13 r1 — G2\'s terminus is IMPLEMENTED, not only promised in Settings', () => {
  test('the terminal save really is terminal: Readiness ≥ 88, nothing due, a HELD crew in all four wings', () => {
    const { save, now, today } = terminal();
    const t = plan.terminusFor(save, { now, today });
    assert.ok(t.readiness >= plan.QUIET_READINESS, `Readiness ${t.readiness}`);
    assert.equal(t.due, 0);
    assert.equal(t.crew, true);
    assert.equal(t.quiet, true);
    assert.deepEqual(plan.crewHeldEverywhere(save).wings.sort(), [...WING_IDS].sort());
  });

  test('`boardPolicy` stops LEADING with a job and prints `Board quiet · Readiness N · 0 due`', () => {
    const { save, now, today } = terminal();
    const p = plan.boardPolicy(save, { now, today });
    assert.equal(p.kind, 'quiet');
    assert.equal(p.post, false, 'the board stops leading');
    assert.equal(p.line, COPY.quiet({ readiness: p.readiness, due: 0 }), 'and the string is the G6 copy table\'s');
    assert.match(p.line, /^Board quiet · Readiness \d+ · 0 due$/);
    assert.equal(p.takeBoard, '#/run/job', 'with the job still one tap away (G2)');
    assert.equal(plan.jobAction(save, { now, today }), null, 'no primary button is the board\'s any more');
  });

  test('Home says it too — the static gate, the line and the one-tap link all exist', () => {
    const { save, now, today } = terminal();
    const g = home.weekGate(save, { now, today });
    assert.equal(g.kind, 'quiet');
    assert.equal(g.post, false);
    assert.equal(home.lineFor(g, { now }), plan.boardPolicy(save, { now, today }).line, 'weekGate ≡ boardPolicy on the terminal save too');
    assert.equal(home.boardModel(save, { now, today }).line, plan.boardPolicy(save, { now, today }).line);
    assert.equal(home.QUIET_READINESS, plan.QUIET_READINESS);
    assert.equal(home.CREW_HELD, plan.CREW_HELD);
    assert.deepEqual(home.terminusStatic(save, { now, today }), plan.terminusFor(save, { now, today }));
    const src = read('site/js/screens/home.js');
    assert.match(src, /kind === 'quiet'/, 'the panel has a quiet case');
    assert.match(src, /Take a board anyway/, 'and G12 #35\'s one tap is on it');
  });

  test('the string is REACHABLE — `Board quiet` now exists outside a test that spells it twice', () => {
    const { save, now, today } = terminal();
    assert.match(plan.boardPolicy(save, { now, today }).line, /^Board quiet/);
    // the old assertions rendered COPY.quiet and compared it to the string COPY.quiet spells; this
    // one drives boardPolicy on a save and reads what the student would read.
    assert.ok(read('site/js/plan.js').includes("kind: 'quiet'"), 'boardPolicy has the branch');
  });

  test('one condition short of terminal and the ordinary evening board is back', () => {
    for (const break_ of ['crew', 'due', 'readiness']) {
      const { save, now, today } = terminal();
      if (break_ === 'crew') save.game.crew = { VOC: 2, PAIRS: 2, 'CS-LIN': 1, FAC2: 2 };   // one wing STEADY, not HELD
      if (break_ === 'due') save.cards[BANK_IDS[0]].due = now - DAY_MS;
      if (break_ === 'readiness') { for (const sk of ALL_SKILLS) save.skills[sk.id].m = 40; save.runs = []; }
      const p = plan.boardPolicy(save, { now, today });
      assert.equal(p.kind, 'job', `breaking ${break_} puts the board back`);
      assert.equal(p.post, true);
      assert.equal(home.weekGate(save, { now, today }).kind, 'job', `${break_} — and Home agrees`);
    }
  });

  test('the terminus never outranks the week: 22:00, the Night Before and Test Morning still win', () => {
    for (const [D, hh, kind] of [[7, 22, 'closed'], [1, 19, 'night'], [0, 6, 'morning'], [2, 19, 'review']]) {
      const { save, now, today } = terminal({ D, hh });
      assert.equal(plan.boardPolicy(save, { now, today }).kind, kind, `D ${D} at ${hh}:00`);
    }
  });
});
