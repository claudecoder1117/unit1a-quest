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
import * as call from '../site/js/job/call.js';
import * as guard from '../site/js/job/guard.js';
import * as econ from '../site/js/job/econ.js';
import { postedCountFor, nextAction } from '../site/js/page.js';
import { WEEK, SHAPES, REVIEW_BOARD, BACKCHECK, COMMIT_BONUS, COMPLETION, AUTO_BAG, CAPS, COPY, PUBLISHED, WING_IDS } from '../site/data/job.js';

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
    assert.match(read('site/js/screens/home.js'), /'REVIEW BOARD' : "Tonight's Board"/);
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

  test('w is EXACTLY 1.0 — the Mock has no make, so the weight is defined rather than undefined', () => {
    assert.equal(mock.MOCK_CALL_W, 1.0);
    const mc = mock.mockCall({ pred: 88, score: 81, submittedAt: 5 });
    assert.equal(mc.w, 1.0);
    assert.equal(mc.entry.w, 1.0);
    assert.ok(mc.entry.w >= call.INFORMATIVE_MIN, 'and it is therefore informative');
    assert.equal(mc.entry.skill, null, 'no make');
  });

  test('the credit comes out of call.credit and IS c(p, o) = 10 − 40(p − o)²', () => {
    for (const pred of [0, 12, 50, 70, 88, 95, 100]) {
      for (const score of [0, 31, 50, 81, 100]) {
        const mc = mock.mockCall({ pred, score });
        const p = pred / 100, o = score / 100;
        assert.ok(Math.abs(mc.credit - (10 - 40 * (p - o) ** 2)) < 1e-9, `pred ${pred} score ${score}`);
        assert.ok(Math.abs(mc.credit - call.credit(mc.entry.p, mc.entry.ok)) < 1e-12, 'routed through call.credit');
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

    // 2. ONE SLOT A DAY. The window is 50 and the Mock pays at most one entry per day per seed, so
    //    the tank cannot fill the window: it buys 1/50 of the rating for a whole evening's work.
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
    const before = s.player.rating.calls.length;
    const run = satRun({ pred: 70, score: 72, at: now });
    const r = mock.applyMockCall(s, run, { now });
    assert.ok(r);
    assert.equal(s.player.rating.calls.length, before + 1);
    assert.equal(s.player.rating.n, 1);
    assert.equal(s.player.rating.value, call.ratingFrom(s.player.rating.calls, CAPS.calls));
    assert.equal(s.player.rank, call.rankFor(s.player.rating.value));
    assert.equal(mock.applyMockCall(s, run, { now }), null, 'idempotent per run');
    assert.equal(s.player.rating.calls.length, before + 1);
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
      const honest = satRun({ pred: 20, score: 20, at: now, done: 14, ms: 31 * 60 * 1000 });
      const r = mock.applyMockCall(s, honest, { now });
      assert.ok(r, 'a genuinely sat paper scores');
      assert.equal(Math.round(r.credit * 100) / 100, 10, 'and truth-telling still pays the maximum');
      assert.equal(r.w, 1.0, 'at the weight G12 #40d defines');
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

    test('`mockCall` itself is untouched: the credit, the propriety and w = 1.0 are the same function', () => {
      for (const [pred, score] of [[0, 0], [88, 81], [50, 50], [100, 0]]) {
        const mc = mock.mockCall({ pred, score });
        assert.equal(mc.w, 1.0);
        assert.ok(Math.abs(mc.credit - (10 - 40 * (pred / 100 - score / 100) ** 2)) < 1e-9);
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
    for (const p of ['site/js/plan.js', 'site/js/screens/home.js', 'site/js/screens/mock.js', 'site/js/screens/boss.js']) {
      const src = read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      assert.ok(!/\brankOf\b/.test(src), `${p} calls guard.rankOf`);
      // the ONLY legal mention is the Mock WRITING the rank back after its one call — never a gate
      for (const m of src.matchAll(/(?:player|game)\.rank\b(.{0,3})/g)) {
        assert.match(m[1], /^\s*=[^=]/, `${p} READS the game rank: ${m[0]}`);
      }
    }
    assert.equal(state.hintsOn(), true, 'hints are free and infinite, at every rank');
  });

  test('the Mock, the boss and the Night Before are reachable at rank 1 with an empty rating window', () => {
    const { save, now, today } = saveAtD(4);
    const s = clone(save);
    s.player.rating = { calls: [], value: 5.0, n: 0 };
    s.player.rank = call.rankFor(5.0);
    assert.equal(call.rankFor(0), 1, 'rank 1 exists and is the floor');
    assert.equal(call.callsFor(1).includes(95), false, 'and it is the rank without the 95 call');
    assert.equal(mock.mockCall({ pred: 50, score: 50 }).w, 1.0, 'the Mock still scores');
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

  test('pass 1 paints a real board: rows, wings, minutes, the end time and the projection', () => {
    const { save, now, today } = saveAtD(7);
    const m = home.boardModel(save, { now, today });
    assert.equal(m.gate.post, true);
    assert.ok(m.rows.length >= 1 && m.rows.length <= 5);
    assert.deepEqual(m.supply.map((s) => s.wing), ['RECALL', 'FIGURES', 'WORDS', 'ALGEBRA']);
    assert.equal(m.ends, timeHM(new Date(now + PUBLISHED.shapeTable.JOB.wallS[0] * 1000)));
    assert.equal(m.minutes, Math.ceil(PUBLISHED.shapeTable.JOB.wallS[0] / 60));
    assert.equal(m.projection, `~${m.split} % game · projected`);
    assert.equal(m.projectionSource, 'projected');
    for (const r of m.rows) assert.equal(r.posted, null, 'the posted numerals are pass 2\'s');
  });

  test('the projection reads the student\'s OWN last five jobs when the ledger has them (G1 statement 1)', () => {
    const { save, now, today } = saveAtD(7);
    const s = clone(save);
    s.game.log = Array.from({ length: 5 }, (_, i) => ({ day: today, shape: 'JOB', targets: 10, bagged: 100, posted: 120, rating: 6, guard: 'WORDS', cracked: false, tGame: 300000, tAnswer: 200000 }));
    const m = home.boardModel(s, { now, today });
    assert.equal(m.projectionSource, 'ledger');
    assert.equal(m.split, 60, '300 s game / 500 s wall');
    assert.equal(m.projection, '~60 % game · your last 5 jobs');
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
    assert.match(read('site/js/screens/home.js'), /crew idle on their own reviews · /);
    assert.equal(typeof COPY.coldCrew({ idle: 4, dues: 9, minutes: 4 }), 'string');
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
