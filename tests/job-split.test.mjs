// tests/job-split.test.mjs — THE MEASURED SPLIT. The fifth ship test of designs/CUT-SPEC.md §8,
// under designs/CUT-BRIEF.md "Session shape":
//
//   "a genuine 45–55 % of wall clock spent on game decisions — and the app measures its own split
//    and prints the measured number, never a claimed one. If the honest measurement comes in under
//    45 %, the fix is to cut answering time per question, never to pad the game with waiting."
//
// So this file proves THE DEFINITION, not the tuning. A percentage is a share of something, and the
// something has to be the session:
//
//   #1  THE INVARIANT. `tGame + tAnswer` is the wall clock from `inProgress.startedAt` to the last
//       verb — the whole session, every millisecond of it, in two halves. No interval is discarded
//       from both halves and none is counted twice.
//   #2  The printed number is `gameMs / wallMs`, exactly, and it FALLS when the student lingers on a
//       worked solution. (It used to RISE: the denominator omitted every result screen.)
//   #3  The interval that closes a session — reading the last worked solution — is study time, the
//       same as the identical interval on every other question. (`endJob` used to bank it as GAME.)
//   #4  `tGame` holds only intervals the screen DECLARES a game decision, capped by wall clock that
//       actually elapsed. Undeclared time can only ever lower the share; nothing can raise it.
//   #5  The number the app prints is the number the engine measured. A session that really is half
//       game prints a number in the band; a session that is a third game prints a third — the meter
//       never lifts a low session into 45–55 %.
//   #7  AN ABSENCE IS NOT A DECISION. #4 was true of time the screen does not declare and false of
//       time it does: the face-down card is the app's own pause point, and the screen declared the
//       whole of a 90-second interruption as one game decision, which the meter booked 1:1. A
//       16 %-game session printed 65 %, and fifteen minutes away printed 95 %. `DELIBERATION_MS` is
//       the ceiling that closes it; past the ceiling nothing is credited, so a long dwell can only
//       lower the printed share. Added in round 2 (split-honesty).
//
// EVERY SESSION BELOW IS DRIVEN THROUGH THE SHIPPED VERBS (`startJob` / `call` / `answer` / `bank` /
// `endJob`) on a fabricated clock, and the split is read out of `endJob`'s own return value — the
// one the end panel prints (`data/job.js COPY.split`). Nothing here re-implements the meter.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import * as state from '../site/js/job/state.js';
import { SPLIT, COPY } from '../site/data/job.js';
import { fresh } from '../site/js/store.js';

const DAY = '2026-09-16';
const CLEAR = { cleared: true, attempt: 1, hints: 0 };
const MISS = { cleared: false, attempt: 3, hints: 2 };

const item = (n) => ({ n, id: `c-${n}`, role: 'core', tier: 1, skill: 'sk', kind: 'card', done: false, result: null });

/** A save with tonight's page live, opened at `startedAt`, and `len` questions on it. */
function rig({ len = 12, startedAt = 0, pile = 0, streak = 1 } = {}) {
  return {
    profileId: 'job-split', cards: {}, skills: {}, xp: { total: 0 }, errors: [], counters: {},
    player: { best: 0 }, game: { today: 0, day: DAY },
    inProgress: {
      kind: 'page', seed: 7, queue: Array.from({ length: len }, (_, i) => item(i + 1)), idx: 0,
      startedAt, day: DAY,
      game: { pile, streak, call: null, answered: 0, tGame: 0, tAnswer: 0, tAway: 0, away: 0, seed: '7' },
    },
  };
}

/**
 * A WHOLE SESSION on a fabricated clock, through the shipped verbs only.
 *
 * Per question the student spends `decide` ms on the face-down card (the game decision the screen
 * declares), `answer` ms between locking the call and the grade (the flip, the question, the work),
 * and `read` ms on the worked solution before tapping Continue. `bankAfter` lists the questions after
 * which they bank, which costs another `bankMs` on the face-down card. `idleAt` is the one question
 * whose face-down card the student sits on for an extra `idleMs` — the phone call, the locked screen,
 * the parent in the doorway (#7).
 *
 * Returns the session's true wall clock and the game time actually spent, so every assertion below is
 * against arithmetic done outside the machine.
 */
function play({
  n = 8, decide = 4000, answer = 20000, read = 3000, bankMs = 1500,
  bankAfter = [], clears = () => true, startedAt = 0, idleAt = -1, idleMs = 0,
  goneAt = -1, goneMs = 0, killed = false,
} = {}) {
  const save = rig({ len: n + 8, startedAt });
  const banks = new Set(bankAfter);
  let t = startedAt;              // the wall clock, absolute
  let owed = 0;                   // worked solution still unread when the next tap comes
  let gameMs = 0;                 // …and what the engine's rule says was a DECISION, counted here
  let awayMs = 0;                 // …and what the APP SAID it was not in use for (§9)
  for (let i = 0; i < n; i++) {
    /* THE STUDENT GOES AWAY on the face-down card, and the app says so: the document is hidden (or
       the page is closing), and it comes back — either to the same screen, or, if the tab died, to
       a session re-opened by `resume`. The reading they had already done is theirs and is booked
       before the stamp; only the span after it is the absence. */
    if (i === goneAt && goneMs > 0) {
      t += owed; owed = 0;
      state.presence(save, { now: t, here: false });
      state.presence(save, { now: t, here: false });     // `visibilitychange` and `pagehide` both fire
      t += goneMs;
      awayMs += goneMs;
      if (killed) state.resume(save, { now: t });        // the tab died; the session is opened again
      else state.presence(save, { now: t, here: true });
    }
    const dwell = decide + (i === idleAt ? idleMs : 0);
    t += owed + dwell; owed = 0;
    const calls = state.callsFor(save);
    state.call(save, calls[0], { now: t, ms: dwell });
    gameMs += credited(dwell);
    t += answer;
    state.answer(save, clears(i) ? CLEAR : MISS, { now: t, ms: answer });
    owed = read;
    if (banks.has(i)) {
      t += owed + bankMs; owed = 0;
      state.bank(save, { now: t, ms: bankMs, day: DAY });
      gameMs += credited(bankMs);
    }
  }
  t += owed;
  const over = state.endJob(save, { now: t, ms: owed, day: DAY });
  return { save, over, wallMs: t - startedAt, gameMs, awayMs, playedMs: t - startedAt - awayMs, lastVerbAt: t };
}

/**
 * THE RULE, restated outside the machine: an interval on the face-down card is a game decision up to
 * the deliberation cap, and the rest of it is study time with every other unattributed millisecond.
 * Only the cap itself is read out of `state.js`; the shape of the rule is this file's.
 *
 * IT WAS A CEILING — `ms > CAP ? 0 : ms` — until round 4 (number-truth, blocker). A real chromium
 * session at `#/run/job`, tab visible throughout: 78,006 of 157,087 ms were spent on the face-down
 * card and the end panel printed **6 %**, because each of the student's three 26-second decisions
 * was dropped WHOLE while the session kept it in the denominator. In the engine probe beside it,
 * 23.9 s of deciding printed 46 % and 24.1 s printed 0. See `state.js DELIBERATION_MS` for why the
 * bound is kept and the cliff is not.
 */
const credited = (ms) => Math.min(ms, state.DELIBERATION_MS);

/* ========================================================================================== */
describe('#1 the two halves are the session — the invariant that makes this a share', () => {
  const shapes = [
    { label: 'a plain session', opts: {} },
    { label: 'one with banks in it', opts: { bankAfter: [2, 5] } },
    { label: 'one with misses in it', opts: { clears: (i) => i % 3 !== 0 } },
    { label: 'a slow reader', opts: { read: 30_000 } },
    { label: 'a fast one', opts: { decide: 900, answer: 4000, read: 200 } },
    { label: 'a session that started at a real epoch', opts: { startedAt: Date.UTC(2026, 8, 16, 18, 0) } },
    { label: 'one long question', opts: { n: 1, answer: 300_000 } },
    { label: 'no reading at all', opts: { read: 0 } },
  ];

  for (const { label, opts } of shapes) {
    test(`${label}: tGame + tAnswer is exactly the wall clock`, () => {
      /* the record is read at the LAST verb before `endJob` clears `inProgress`, then again out of
         `endJob`'s own split, so both the live meter and the printed number are pinned */
      const seen = [];
      const probe = { ...opts };
      const r = play(probe);
      const g = state.stateOf(r.save);
      assert.equal(g, null, '`endJob` left the session record behind');
      seen.push(r.over.split);

      /* re-run, stopping one verb short, to read the meter itself */
      const save = rig({ len: 40, startedAt: probe.startedAt ?? 0 });
      const decide = probe.decide ?? 4000, ans = probe.answer ?? 20000, read = probe.read ?? 3000;
      const n = probe.n ?? 8;
      let t = probe.startedAt ?? 0, owed = 0;
      for (let i = 0; i < n; i++) {
        t += owed + decide; owed = 0;
        state.call(save, state.callsFor(save)[0], { now: t, ms: decide });
        t += ans;
        state.answer(save, CLEAR, { now: t, ms: ans });
        owed = read;
      }
      const live = state.stateOf(save);
      assert.equal(live.tGame + live.tAnswer, t - (probe.startedAt ?? 0),
        'the meter is not the session: an interval was dropped from both halves, or counted twice');
      assert.equal(live.tGame, n * decide, 'the game half is not the declared game decisions');
      assert.ok(seen[0] === null || (seen[0] >= 0 && seen[0] <= 100));
    });
  }

  test('and `endJob` closes the clock: the printed split is `gameMs / wallMs`', () => {
    for (const opts of [{}, { bankAfter: [1] }, { read: 12_000 }, { n: 12, answer: 9000 }]) {
      const r = play(opts);
      assert.equal(r.over.split, Math.round((r.gameMs / r.wallMs) * 100),
        `${JSON.stringify(opts)}: the printed number is not the measured share`);
    }
  });
});

/* ========================================================================================== */
describe('#2 lingering over a worked solution LOWERS the share — it used to raise it', () => {
  /* THE REGRESSION. Two identical 22-question sessions, differing only by 3 s per question spent on
     the study card's own result screen before Continue. The shipped app printed 70 % and then 71 %:
     the denominator was `tGame + tAnswer` with every result screen discarded from both, so the extra
     66 seconds of session raised the printed number while the true share fell. */
  const B = play({ n: 22, decide: 2148, answer: 981, read: 0 });
  const C = play({ n: 22, decide: 2148, answer: 981, read: 3000 });

  test('the longer session is the smaller share, and both are the true one', () => {
    assert.equal(B.over.split, Math.round((B.gameMs / B.wallMs) * 100));
    assert.equal(C.over.split, Math.round((C.gameMs / C.wallMs) * 100));
    assert.ok(C.wallMs > B.wallMs, 'the second session was not longer');
    assert.equal(C.gameMs, B.gameMs, 'the second session was not the same game time');
    assert.ok(C.over.split < B.over.split,
      `the printed share ROSE with reading time: ${B.over.split} % → ${C.over.split} %`);
  });

  test('a monotone sweep: every extra second of reading lowers the printed number, never raises it', () => {
    let last = 101;
    for (const read of [0, 500, 1000, 2000, 3000, 5000, 8000, 13_000, 21_000, 60_000]) {
      const r = play({ n: 10, decide: 4000, answer: 20_000, read });
      assert.equal(r.over.split, Math.round((r.gameMs / r.wallMs) * 100));
      assert.ok(r.over.split <= last, `reading ${read} ms raised the share to ${r.over.split} %`);
      last = r.over.split;
    }
  });
});

/* ========================================================================================== */
describe('#3 the interval that closes a session is study time', () => {
  test('one question — 3 s deciding, 20 s answering, 10 s reading the solution — prints 9 %', () => {
    /* `endJob` used to hand its `ms` to `bank`, which banked it as GAME: the app printed 39 % for
       this session. The same interval on every other question is study time, and so is this one. */
    const save = rig({ len: 4 });
    state.call(save, state.callsFor(save)[0], { now: 3000, ms: 3000 });
    state.answer(save, CLEAR, { now: 23_000, ms: 20_000 });
    const g = state.stateOf(save);
    assert.deepEqual([g.tGame, g.tAnswer], [3000, 20_000]);
    const over = state.endJob(save, { now: 33_000, ms: 10_000, day: DAY });
    assert.equal(over.split, 9, 'the closing read was booked as a game decision');
    assert.equal(over.split, Math.round((3000 / 33_000) * 100));
  });

  test('the closing read is worth the same as any other read: 22 questions, last one no different', () => {
    /* read the meter one verb before the end, then let `endJob` add the last read. The game half
       must not move by one millisecond. */
    const save = rig({ len: 30 });
    let t = 0;
    for (let i = 0; i < 6; i++) {
      t += 4000; state.call(save, state.callsFor(save)[0], { now: t, ms: 4000 });
      t += 20_000; state.answer(save, CLEAR, { now: t, ms: 20_000 });
      if (i < 5) t += 3000;
    }
    const before = state.stateOf(save).tGame;
    t += 3000;
    const over = state.endJob(save, { now: t, ms: 3000, day: DAY });
    assert.equal(over.split, Math.round((before / t) * 100));
    assert.equal(before, 6 * 4000, 'the game half is not the six declared decisions');
  });
});

/* ========================================================================================== */
describe('#4 the game half holds only declared decisions, and never more than elapsed', () => {
  test('an undeclared interval falls to the study half — the meter cannot flatter the game', () => {
    const save = rig({ len: 4 });
    /* the student took 30 s to get back to the app, then 4 s on the face-down card */
    state.call(save, state.callsFor(save)[0], { now: 34_000, ms: 4000 });
    const g = state.stateOf(save);
    assert.deepEqual([g.tGame, g.tAnswer], [4000, 30_000]);
  });

  test('a declared interval longer than the wall clock is capped by the wall clock', () => {
    const save = rig({ len: 4 });
    state.call(save, state.callsFor(save)[0], { now: 1500, ms: 999_999 });
    const g = state.stateOf(save);
    assert.deepEqual([g.tGame, g.tAnswer], [1500, 0], 'the meter booked time that never elapsed');
    assert.equal(state.splitOf(g), 100);
  });

  test('the answering half takes the whole interval under the call, flip and all', () => {
    const save = rig({ len: 4 });
    state.call(save, state.callsFor(save)[0], { now: 4000, ms: 4000 });
    /* the screen declares 6 s of answering; 420 ms of flip animation sat in front of it, and the
       flip is waiting, not a game decision (CUT-BRIEF: never pad the game with waiting) */
    state.answer(save, CLEAR, { now: 10_420, ms: 6000 });
    const g = state.stateOf(save);
    assert.deepEqual([g.tGame, g.tAnswer], [4000, 6420]);
  });

  test('the printed share is 0…100 on every shape a session can take', () => {
    for (const opts of [
      { n: 1, decide: 1, answer: 1, read: 1 }, { n: 1, decide: 0, answer: 600_000, read: 0 },
      /* at the ceiling the share still runs to 100; a minute past it, every one of those intervals
         is an absence and the same session prints 0 (#7) */
      { n: 12, decide: 24_000, answer: 1, read: 0 }, { n: 12, decide: 60_000, answer: 1, read: 0 },
      { n: 4, bankAfter: [0, 1, 2, 3] },
      { n: 3, clears: () => false }, { n: 2, read: 3_600_000 },
    ]) {
      const r = play(opts);
      const s = r.over.split;
      assert.ok(s === null || (Number.isInteger(s) && s >= 0 && s <= 100), `split ${s} for ${JSON.stringify(opts)}`);
      if (r.wallMs > 0) assert.equal(s, Math.round((r.gameMs / r.wallMs) * 100));
    }
  });

  test('a session with no clock at all measures nothing rather than inventing a number', () => {
    const save = rig({ len: 4 });
    state.call(save, state.callsFor(save)[0], {});
    state.answer(save, CLEAR, {});
    const over = state.endJob(save, { day: DAY });
    assert.equal(over.split, null, 'an unmeasured session printed a number anyway');
    assert.equal(COPY.split({ percent: 0 }), '0 % of this session was the game');
  });
});

/* ========================================================================================== */
describe('#5 the app prints the measured number, never a claimed one', () => {
  test('a session that really is half game prints a number in CUT-BRIEF\'s band', () => {
    /* 10 questions: 12 s deciding on the face-down card, 10 s answering, 2 s reading. The band is
       CUT-BRIEF's target for the DESIGN; this test only proves the meter reports it when it is true. */
    const r = play({ n: 10, decide: 12_000, answer: 10_000, read: 2000 });
    assert.equal(r.over.split, Math.round((r.gameMs / r.wallMs) * 100));
    assert.ok(r.over.split >= SPLIT.lo && r.over.split <= SPLIT.hi,
      `a genuinely half-game session measured ${r.over.split} %`);
  });

  test('…and a session that is a third game prints a third, not the band', () => {
    /* the measured session the CUT was written against: 29 % game. The honest number is the number
       that ships — CUT-BRIEF's fix for a low measurement is fewer, harder questions, never a meter
       that rounds itself up into the band. */
    const r = play({ n: 22, decide: 2148, answer: 4200, read: 1000 });
    const truth = Math.round((r.gameMs / r.wallMs) * 100);
    assert.equal(r.over.split, truth);
    assert.ok(truth < SPLIT.lo, 'this fixture is no longer the low session it was built to be');
  });

  test('the split survives the session it is measured over: the record is gone, the number is not', () => {
    const r = play({ n: 6 });
    assert.equal(state.stateOf(r.save), null);
    assert.equal(r.over.split, Math.round((r.gameMs / r.wallMs) * 100));
    assert.equal(r.over.answered, 6);
  });
});

/* ==========================================================================================
   #7 AN ABSENCE IS NOT A DECISION (round 2, split-honesty)

   #4 above says "the meter cannot flatter the game", and it was only ever true of intervals the
   screen does NOT declare. The face-down card is the app's own pause point — it is up at the start
   of the session and again after every Continue — so it is the likeliest screen in the loop to be
   open when a student stops being present, and `screens/job.js beat()` hands the whole absence over
   as one declared game decision. Booked 1:1, that is the meter lifting a low session THROUGH the
   band: 90 seconds away printed `65 % of this session was the game` over a session that was 16 %
   game, and the share had no upper bound at all — fifteen minutes away printed 95 %.

   TWO THINGS FIX IT AND THEY ARE NOT THE SAME THING (r3 and r4).

   · An absence the app can SEE is out of both halves entirely: `screens/job.js` calls `skipBeat()`
     on `visibilitychange` and `pagehide`, so a hidden span is not even inside the screen's claim,
     and `state.presence` books it to `tAway` (§9). That is the 90-second phone call, the locked
     phone and the killed tab — every shape the round-2 critic actually filed.
   · What is left is the span nobody can see: a page that stayed VISIBLE with nobody in front of it.
     Duration is the only evidence there is, and it is not evidence, so `state.DELIBERATION_MS`
     BOUNDS it instead of judging it — one deliberation per decision, and every millisecond past
     that to the study half, where it goes on lowering the printed share for as long as it lasts.

   ROUND 4 TOOK THE CLIFF OFF THAT BOUND AND THE TESTS BELOW MOVED WITH IT (number-truth, blocker).
   The bound used to credit NOTHING past the ceiling, which cost the meter every real decision over
   24 s: a chromium session that spent half its wall clock choosing calls printed 6 %, and 24.1 s of
   thinking printed 0 where 23.9 s printed 46. `tGame` is bounded by `decisions × DELIBERATION_MS`
   under either rule — the exposure to an unseen absence is identical — so what the cliff bought was
   not safety, it was a censored statistic. The tests below pin what is true of the bound: the
   printed share still falls with every second of an absence past the cap, an absence can still
   never add more than one decision to the game half, and a decision the design itself asks for is
   never thrown away.
   ========================================================================================== */
describe('#7 an absence on the face-down card is not a game decision', () => {
  /** The critic's session: 23 questions, identical answers, and one interruption in the middle. */
  const SESSION = { n: 23, decide: 600, answer: 1637, read: 600 };

  test('THE BLOCKER: an absence the app can see prints the share of the session it was there for', () => {
    /* THE ROUND-2 BLOCKER, DRIVEN THE WAY A BROWSER DRIVES IT. The absences that produced 65 % and
       95 % were a phone call and a quarter of an hour away — a hidden document and a `pagehide`
       every time — and the screen now says so (`state.presence`, §9 below). Declared, the interval
       is in neither half: the interrupted session prints what the calm one prints, at every length,
       because it IS the calm session plus a span nobody played. */
    const calm = play(SESSION);
    for (const gone of [25_000, 90_000, 300_000, 900_000, 3_600_000]) {
      const away = play({ ...SESSION, goneAt: 2, goneMs: gone });
      assert.equal(away.over.split, calm.over.split,
        `${gone / 1000} s away moved the printed share ${calm.over.split} % → ${away.over.split} %`);
      assert.equal(away.over.split, Math.round((away.gameMs / away.playedMs) * 100));
      assert.ok(away.over.split < SPLIT.lo,
        `an interruption printed ${away.over.split} %, inside or above the band the design must earn`);
    }
  });

  test('…and one it CANNOT see is bounded: at most one decision, and it is still under the band', () => {
    /* The residual, stated as the bound it actually is. A page that stays visible with nobody in
       front of it is indistinguishable from a student thinking, so the meter does not try to tell:
       the dwell is credited up to the cap and every millisecond past it lowers the share. What it
       may never do is run away with the number — `tGame` is at most one deliberation per decision,
       whatever the screen claims. */
    const calm = play(SESSION);
    for (const idle of [25_000, 90_000, 300_000, 900_000]) {
      const gone = play({ ...SESSION, idleAt: 2, idleMs: idle });
      assert.equal(gone.over.split, Math.round((gone.gameMs / gone.wallMs) * 100));
      assert.ok(gone.gameMs - calm.gameMs <= state.DELIBERATION_MS,
        `${idle / 1000} s of unseen absence bought ${gone.gameMs - calm.gameMs} ms of game time`);
      assert.ok(gone.over.split < SPLIT.lo,
        `an interruption printed ${gone.over.split} %, inside or above the band the design must earn`);
    }
  });

  test('…and the longer the absence, the smaller the number — no ceiling on the wall, none on the share', () => {
    /* THE SHAPE THAT USED TO BE THERE: monotone UP, unbounded. `split` ran 21 → 40 → 67 → 95 % as
       the student stayed away longer. Past the ceiling it is monotone DOWN, and it tends to 0. */
    let last = 101;
    for (const idle of [25_000, 30_000, 60_000, 90_000, 300_000, 900_000, 3_600_000]) {
      const r = play({ ...SESSION, idleAt: 2, idleMs: idle });
      assert.ok(r.over.split < last,
        `staying away ${idle / 1000} s did not lower the share below ${last} % (got ${r.over.split} %)`);
      last = r.over.split;
    }
    assert.ok(last <= 1, `an hour away still printed ${last} %`);
  });

  test('THE ROUND-4 BLOCKER: a real deliberation is credited, and a fifth of a second changes nothing', () => {
    /* The measurement the ceiling could not make. `number-truth` sat 26 s on each of the first three
       face-down cards of a chromium session, played the rest fast, and read `6 % of this session was
       the game` off the end panel over a session whose wall clock was 50 % face-down card. The
       engine probe beside it is reproduced here: the printed number must move CONTINUOUSLY with the
       student's thinking, not fall off a cliff between 23.9 s and 24.1 s. */
    const probe = (decide) => play({ n: 8, decide, answer: 20_000, read: 8000 }).over.split;
    const under = probe(23_900);
    const over = probe(24_100);
    assert.ok(Math.abs(under - over) <= 1,
      `0.2 s of extra thinking moved the printed share ${under} % → ${over} % (the cliff is back)`);
    assert.ok(under >= 40 && over >= 40,
      `a session that was ~46 % deliberation printed ${under} % / ${over} %`);
    /* …and the critic's own session, to the millisecond: three 26 s decisions, the rest at speed */
    const slow = play({ n: 3, decide: 26_000, answer: 20_000, read: 6000 });
    assert.equal(slow.over.split, Math.round((slow.gameMs / slow.wallMs) * 100));
    assert.ok(slow.over.split >= 40,
      `26 s of deciding against 26 s of answering printed ${slow.over.split} %`);
  });

  test('isolated: one question, sitting on the face-down card past the cap, books the cap and no more', () => {
    const save = rig({ len: 4 });
    state.call(save, state.callsFor(save)[0], { now: 25_000, ms: 25_000 });
    const g = state.stateOf(save);
    assert.deepEqual([g.tGame, g.tAnswer], [state.DELIBERATION_MS, 25_000 - state.DELIBERATION_MS],
      'a 25 s dwell did not settle as one deliberation plus a second of study time');
    /* and a dwell no clock can excuse still ends up mostly in the study half */
    const long = rig({ len: 4 });
    state.call(long, state.callsFor(long)[0], { now: 600_000, ms: 600_000 });
    const lg = state.stateOf(long);
    assert.deepEqual([lg.tGame, lg.tAnswer], [state.DELIBERATION_MS, 600_000 - state.DELIBERATION_MS]);
    assert.equal(state.splitOf(lg), 4, 'ten minutes on one face-down card printed more than 4 %');
  });

  test('…and one AT the cap is a decision in full: no deliberation the band could want is lost', () => {
    /* The cap is CUT-SPEC §8's own upper figure for what 45–55 % demands (16–24 s of choosing at
       COMPOSED's fastest card, §6 below). Inclusive, so the band's own maximum is still credited. */
    for (const ms of [1, 4000, 16_000, state.DELIBERATION_MS]) {
      const save = rig({ len: 4 });
      state.call(save, state.callsFor(save)[0], { now: ms, ms });
      assert.deepEqual([state.stateOf(save).tGame, state.stateOf(save).tAnswer], [ms, 0],
        `a ${ms} ms deliberation was not credited in full`);
    }
    /* …AND THE MILLISECOND AFTER IT IS NOT A DIFFERENT KIND OF EVENT. The rule the r4 blocker
       killed made 24,001 ms worth zero where 24,000 ms was worth all of it; the bound is the same
       bound, and what it does past the edge is stop counting rather than start punishing. */
    const over = rig({ len: 4 });
    state.call(over, state.callsFor(over)[0], { now: state.DELIBERATION_MS + 1, ms: state.DELIBERATION_MS + 1 });
    assert.deepEqual([state.stateOf(over).tGame, state.stateOf(over).tAnswer], [state.DELIBERATION_MS, 1],
      'a decision one millisecond over the cap was not settled as the cap plus a millisecond');
  });

  test('the bound: no screen, however wrong, can lift the game half past one deliberation a decision', () => {
    /* `beat()` is the screen's arithmetic and this file cannot fix it. What the engine can promise is
       that one declared interval buys at most one deliberation — so `tGame` is bounded by the number
       of DECISIONS the session actually contained, whatever the screen claims. */
    for (const opts of [
      { n: 6, decide: 999_999 }, { n: 6, decide: 30_000 }, { n: 6, decide: 23_999 },
      { n: 4, decide: 20_000, bankAfter: [0, 1, 2, 3], bankMs: 20_000 },
      { n: 9, idleAt: 4, idleMs: 600_000 },
    ]) {
      const r = play(opts);
      const decisions = (opts.n ?? 8) + (opts.bankAfter?.length ?? 0);
      const g = state.stateOf(r.save);
      assert.equal(g, null);
      assert.ok(r.gameMs <= decisions * state.DELIBERATION_MS,
        `${JSON.stringify(opts)}: the game half took ${r.gameMs} ms over ${decisions} decisions`);
      assert.equal(r.over.split, Math.round((r.gameMs / r.wallMs) * 100));
    }
  });

  test('the bound holds on the degraded path too: no clock, still no runaway in the game half', () => {
    /* `tick` falls back to "book only what was declared" when the page carries no `startedAt` or the
       screen hands it no `now`. The fallback has no wall clock to cap a claim against, so it is the
       ONE path where the bound stands alone. Found by a negative control: the first version of this
       fix left this branch uncapped and every test above stayed green. */
    /* the two ways the session clock can be missing: a page assembled without `startedAt`, and a
       verb the screen hands no `now`. Both land on the same branch. */
    for (const stamped of [false, true]) {
      const save = rig({ len: 4 });
      if (!stamped) delete save.inProgress.startedAt;
      state.call(save, state.callsFor(save)[0], { ms: 90_000 });
      const g = state.stateOf(save);
      assert.deepEqual([g.tGame, g.tAnswer], [state.DELIBERATION_MS, 0],
        'an unclocked 90 s claim bought more than one deliberation');
      state.answer(save, CLEAR, { ms: 30_000 });
      assert.deepEqual([state.stateOf(save).tGame, state.stateOf(save).tAnswer], [state.DELIBERATION_MS, 30_000],
        'the study half lost its interval, or the game half grew a second deliberation');
    }
    /* and a real deliberation on the degraded path is still credited */
    const ok = rig({ len: 4 });
    delete ok.inProgress.startedAt;
    state.call(ok, state.callsFor(ok)[0], { ms: 4000 });
    assert.deepEqual([state.stateOf(ok).tGame, state.stateOf(ok).tAnswer], [4000, 0]);
  });

  test('a declared interval is still capped by the wall clock BEFORE the ceiling is applied', () => {
    /* Order matters. A screen that claims 999_999 ms over 1500 ms of session is claiming an interval
       that never happened, not an absence: the wall clock caps it to 1500 ms, which is under the
       ceiling and is a decision. Applying the ceiling to the CLAIM instead would throw away a
       perfectly ordinary 1.5-second call. */
    const save = rig({ len: 4 });
    state.call(save, state.callsFor(save)[0], { now: 1500, ms: 999_999 });
    assert.deepEqual([state.stateOf(save).tGame, state.stateOf(save).tAnswer], [1500, 0]);
  });

  /* HONEST LIMITATION, stated and not asserted as a pass. A dwell UNDER the ceiling is still booked
     as deliberation — twenty seconds of not being there reads exactly like twenty seconds of
     choosing, and no clock can tell them apart. The ceiling bounds that to one deliberation per
     decision; closing it needs PRESENCE, which is the screen's: `screens/boss.js` already ends its
     interval on `visibilitychange` / `pagehide` and `screens/job.js` does not (notes/cut-machine.md,
     Requests). The two fixes compose and neither needs the other. */
});

/* ========================================================================================== */
describe('the clock is the study layer\'s own `inProgress.startedAt`', () => {
  test('`startJob` writes it, and the meter measures from it', () => {
    const NOW = new Date(2026, 8, 16, 18, 0).getTime();
    const save = fresh(NOW - 5 * 86_400_000);
    save.settings.testDate = '2026-09-30';
    state.startJob(save, { now: NOW });
    assert.equal(save.inProgress.startedAt, NOW, '`startPage` did not stamp the session');

    /* 9 s before the first call lands, 4 of them on the face-down card */
    state.call(save, state.callsFor(save)[0], { now: NOW + 9000, ms: 4000 });
    const g = state.stateOf(save);
    assert.deepEqual([g.tGame, g.tAnswer], [4000, 5000]);
    assert.equal(g.tGame + g.tAnswer, 9000, 'the meter is not measuring from `startedAt`');
  });

  test('a killed tab resumes the same clock: the meter is recoverable from the record alone', () => {
    const save = rig({ len: 6 });
    state.call(save, state.callsFor(save)[0], { now: 5000, ms: 4000 });
    state.answer(save, CLEAR, { now: 25_000, ms: 20_000 });

    /* the tab dies and comes back: `inProgress` is what was on the disk, nothing more */
    const reloaded = rig({ len: 6 });
    reloaded.inProgress.idx = save.inProgress.idx;
    reloaded.inProgress.game = JSON.parse(JSON.stringify(state.serialize(state.stateOf(save))));
    const back = state.resume(reloaded);
    assert.equal(back.tGame + back.tAnswer, 25_000, 'the session clock did not survive the disk');

    /* and the next verb picks the clock up where it was left, with no eighth field on disk */
    state.call(reloaded, state.callsFor(reloaded)[0], { now: 32_000, ms: 4000 });
    const g = state.stateOf(reloaded);
    assert.deepEqual([g.tGame, g.tAnswer], [8000, 24_000]);
    assert.equal(g.tGame + g.tAnswer, 32_000);
  });
});

/* ==========================================================================================
   #6 THE BAND ITSELF — what 45–55 % demands, with no student in it

   Appended by the tests lane (round 1). Everything above proves the METER: that the printed number
   is the session's true share and cannot be flattered. Nothing above, and nothing anywhere else in
   the repo, says what the BAND asks of the design — and the band is the thing the deleted layer
   failed (29 % measured against 50 %).

   It cannot be asserted by driving a fixture, because a fixture's timings are invented and a test
   that asserts its own invention is the shape of test `job-pay.test.mjs`'s header condemns. But the
   band is an identity, and an identity needs no fixture. `split ∈ [lo, hi]` is exactly
   `tAnswer / tGame ∈ [(100−hi)/hi, (100−lo)/lo]`, and at the study layer's own published per-card
   times that fixes the seconds the face-down card has to hold the student. Those numbers are
   asserted below; what they mean for the design is in notes/cut-tests.md under "The band, measured".
   ========================================================================================== */

import { read as readRepo } from './_helpers.mjs';
import { IN_PROGRESS_KEYS } from '../site/data/job.js';

const SCREEN_SRC = readRepo('site/js/screens/job.js')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const COMPOSED_MD = readRepo('COMPOSED.md');

describe('#6 the band, and the session shape it demands', () => {
  test('every verb the screen calls carries a clock reading as well as a declared interval', () => {
    /* THE METER'S ONE PRECONDITION. `tick` falls back to "book only what was declared" when `now` is
       missing — the degraded path proved harmless above — and that fallback is the one way the
       partition can be lost in the shipped app. It is unreachable only because all four call sites
       pass `now`. Nothing else in the repo checks that, so a screen edit could silently take it. */
    for (const verb of ['call', 'answer', 'bank', 'endJob']) {
      const m = SCREEN_SRC.match(new RegExp(`state\\.${verb}\\(([^;]*?)\\{([^}]*)\\}`, 's'));
      assert.ok(m, `screens/job.js never calls state.${verb}`);
      assert.match(m[2], /\bnow\b/, `state.${verb} is called without a clock — the meter degrades silently`);
      assert.match(m[2], /\bms\b/, `state.${verb} is called without its declared interval`);
    }
    // …and the screen still holds ONE interval: `beatAt`, opened by skipBeat, closed by beat
    assert.equal([...SCREEN_SRC.matchAll(/beatAt\s*=/g)].length, 3,
      'the screen has grown a second clock — the split is no longer one partition');
  });

  /**
   * PRESENCE, NOT DURATION — the residual notes/cut-machine.md §R3 leaves open and §R5.2 closes.
   *
   * `DELIBERATION_MS` bounds ONE declared interval, so an absence longer than the ceiling cannot be
   * claimed; it cannot tell twenty seconds of choosing from twenty seconds of nobody being there,
   * and a student away for twenty seconds on every card would print a share he never played. The
   * browser knows, and the screen drops its claim when the document goes away — the same shape
   * `screens/boss.js` already uses for the study layer. The body must be `skipBeat` and nothing
   * else: a handler that BOOKED the hidden span instead would inflate the one number the whole
   * brief exists to keep honest, and the listener must come off on unmount or a finished session
   * keeps editing the next screen's clock.
   */
  test('the screen stops claiming game time while nobody is looking, and says so', () => {
    assert.match(SCREEN_SRC, /addEventListener\(\s*['"]visibilitychange['"]/,
      'the screen books a hidden tab as deliberation: an absence under the ceiling prints as game time');
    assert.match(SCREEN_SRC, /addEventListener\(\s*['"]pagehide['"]/,
      'a backgrounded or closing page never drops its claim');
    const handler = SCREEN_SRC.match(/const\s+onAway\s*=\s*\(\)\s*=>\s*\{([\s\S]*?)\n  \};/);
    assert.ok(handler, 'the away handler is no longer `const onAway = () => { … }` — re-derive this lint');
    const body = handler[1];
    /* IT MUST STILL DROP THE CLAIM. The whole hidden span was declarable as one deliberation. */
    assert.match(body, /\bskipBeat\(\)/,
      'the away handler stopped dropping its claim — a hidden span can be declared as a decision');
    /* …AND IT MUST TELL THE METER (r3, number-truth). Dropping the claim was never enough: the
       engine went on booking the absence to the answering half, so a break printed a share of a
       session nobody had. The handler reports PRESENCE and nothing else — never a duration, which
       the engine would have no way to check. */
    assert.match(body, /state\.presence\(/,
      'the away handler never tells the engine the app went away — the absence lands in the denominator');
    assert.match(body, /here:\s*document\.visibilityState === 'visible'/,
      'presence is not read off the document: a constant here would mark every event the same way');
    assert.doesNotMatch(body, /\bms\s*:/,
      'the handler declares a DURATION — an absence the engine cannot check against its own clock');
    for (const verb of ['call', 'answer', 'bank', 'endJob']) {
      assert.doesNotMatch(body, new RegExp(`state\\.${verb}\\(`),
        `the away handler plays the game: \`state.${verb}\` in a visibility handler`);
    }
    for (const ev of ['visibilitychange', 'pagehide']) {
      assert.match(SCREEN_SRC, new RegExp(`removeEventListener\\(\\s*['"]${ev}['"]`),
        `the ${ev} listener outlives the session — a dead screen keeps moving beatAt`);
    }
  });

  test('the meter needs one field per part of the partition, and the stamp that survives a kill', () => {
    assert.deepEqual([...IN_PROGRESS_KEYS],
      ['pile', 'streak', 'call', 'answered', 'tGame', 'tAnswer', 'tAway', 'away', 'seed']);
  });

  test('the band restated: answering may take between 0.82× and 1.22× the game decision', () => {
    const answerPerGame = (pct) => (100 - pct) / pct;
    const tightest = answerPerGame(SPLIT.hi);
    const loosest = answerPerGame(SPLIT.lo);
    assert.deepEqual([SPLIT.lo, SPLIT.hi], [45, 55], 'the band is no longer CUT-BRIEF\'s');
    assert.equal(tightest, 45 / 55);
    assert.equal(loosest, 55 / 45);
    assert.equal(tightest.toFixed(4), '0.8182');
    assert.equal(loosest.toFixed(4), '1.2222');
    /* the meter agrees with the identity at both edges, so this is the band and not an analogy */
    assert.equal(state.splitOf({ tGame: 45_000, tAnswer: 55_000 }), SPLIT.lo);
    assert.equal(state.splitOf({ tGame: 55_000, tAnswer: 45_000 }), SPLIT.hi);
    /* READ IT AS ENGLISH: the band asks the FACE-DOWN CARD — one tap among three, plus an optional
       bank — to hold the student roughly as long as the question, the flip and the worked solution
       put together. */
  });

  test('…which, at the study layer`s own per-card times, is 16–24 s on the face-down card', () => {
    /* The card budget is COMPOSED.md's own, read out of the document so it cannot drift from the app
       it describes: "Minute-to-minute (one Card, 20 s – 5 min)". */
    const m = COMPOSED_MD.match(/one Card,\s*(\d+)\s*s\s*–\s*(\d+)\s*min/);
    assert.ok(m, 'COMPOSED.md no longer publishes a per-card budget — this arithmetic has no floor');
    const [floorMs, ceilMs] = [Number(m[1]) * 1_000, Number(m[2]) * 60_000];
    assert.deepEqual([floorMs, ceilMs], [20_000, 300_000]);

    /** The game-half budget a target share demands, given everything else the question costs. */
    const gameBudget = (restMs, pct) => (restMs * pct) / (100 - pct);
    assert.equal(Math.round(gameBudget(floorMs, SPLIT.lo)), 16_364);
    assert.equal(Math.round(gameBudget(floorMs, SPLIT.hi)), 24_444);
    assert.equal(Math.round(gameBudget(ceilMs, SPLIT.lo)), 245_455);

    /* and the identity is the shipped meter's, not this file's arithmetic */
    assert.equal(state.splitOf({ tGame: gameBudget(floorMs, SPLIT.lo), tAnswer: floorMs }), SPLIT.lo);
    assert.equal(state.splitOf({ tGame: gameBudget(floorMs, SPLIT.hi), tAnswer: floorMs }), SPLIT.hi);

    /* THE FINDING, stated once and not asserted as a verdict: on the FASTEST card the study layer
       publishes, the band needs 16–24 seconds of choosing between three buttons, and CUT-BRIEF's own
       session shape (10–14 minutes over 8–12 questions) leaves 50–105 s per question all in. The
       honest measurement will land well under 45 %, the meter above is built so it cannot be lifted,
       and CUT-BRIEF's stated remedy — "cut answering time per question" — is closed to this layer,
       because the composer owns the queue and the game "never chooses, adds, removes or reorders a
       question". That is a DESIGN finding for CUT-BRIEF's owner, written up in notes/cut-tests.md.
       No assertion here stands in for it, and none pins the failure in place: if the questions get
       shorter or the call gets richer, every line above still passes. */
  });
});

/* ==========================================================================================
   #8 THE OWNER DECISION, WITH ITS ARITHMETIC DONE (round 2, machine lane)

   §6 above found that the band asks for 16–24 s on the face-down card and left it as a design
   finding. `CUT-SPEC.md` §8 escalated the same thing to "**OWNER DECISION:** cut the session — the
   brief's own remedy, which its 'same queue, same length' forbids — or amend the target." The build
   then shipped without the decision being taken, so the app's answer to the student's own request
   ("50 % game and 50 % questions") is to print 9 % at him and say nothing.

   THE DECISION IS FORCED, AND THIS BLOCK IS WHY. Both of the remedies on the table are closed:

     · CUT-BRIEF's own remedy — "cut answering time per question (fewer, harder questions)" — cannot
       move this number in the right direction. The split is a RATIO, so FEWER questions of the same
       shape print exactly the same percentage (asserted below), and HARDER questions take LONGER to
       answer, which lowers it. The remedy is arithmetically incoherent with itself.
     · A longer game decision is the only lever that raises it, and padding the face-down card with
       waiting is what CUT-BRIEF forbids in the same sentence — and what #7's ceiling now refuses to
       credit past 24 s in any case.

   So the only move left is to amend the target, and the numbers below are what it would be amended
   to. They are not asserted as a verdict — the band lives in `site/data/job.js SPLIT` and in
   CUT-BRIEF, neither of which this lane owns. They are asserted so that the next build cannot claim
   the question is still open. The request, with the one-line change, is in notes/cut-machine.md.
   ========================================================================================== */
describe('#8 what the two-decision loop can honestly reach', () => {
  /** The best share a question can print: the ceiling of deliberation over the study it carries. */
  const bestFor = (studyMs) => state.splitOf({ tGame: state.DELIBERATION_MS, tAnswer: studyMs });

  test('fewer questions print the SAME percentage — CUT-BRIEF\'s stated remedy cannot move it', () => {
    const shape = { decide: 3000, answer: 20_000, read: 10_000 };
    const printed = [4, 8, 12, 23].map((n) => play({ ...shape, n }).over.split);
    assert.deepEqual(printed, [9, 9, 9, 9],
      'shortening the session changed the share — then this argument needs redoing');
    /* …and harder questions, which is the other half of the same phrase, move it DOWN */
    assert.ok(play({ ...shape, n: 8, answer: 45_000 }).over.split < printed[0],
      'a longer question raised the printed share');
  });

  test('the ceiling fixes the best share any question can print, and the band needs a 30 s question', () => {
    /* one declared decision per question (CUT-BRIEF: at most two taps), credited at most to the
       ceiling (#7) — so this is an upper bound on the app, not on a fixture */
    assert.deepEqual(
      [20_000, 26_000, 30_000, 44_000, 60_000, 300_000].map(bestFor),
      [55, 48, 44, 35, 29, 7],
      'the ceiling or the meter moved — the band arithmetic below is no longer this app\'s');
    /* the largest per-question study cost at which the band's FLOOR is still PRINTED — the engine's
       own rounding is part of the answer, so this is bisected against `splitOf` and not solved */
    let edge = 0;
    while (bestFor(edge + 100) >= SPLIT.lo) edge += 100;
    assert.equal(edge, 29_900, 'the reachable edge moved');
    assert.ok(bestFor(edge) >= SPLIT.lo && bestFor(edge + 100) < SPLIT.lo);
    /* COMPOSED publishes 20 s – 5 min per card, so the band is reachable on the fastest card the
       study layer has and on nothing else — and only with the student pinned at the ceiling */
    assert.ok(bestFor(20_000) >= SPLIT.lo, 'not even the fastest card can reach the band');
    assert.ok(bestFor(300_000) < 10, 'the slowest card is nowhere near it');

    /* AND THE BOUND IS THE MACHINE'S, not this file's arithmetic: a session driven AT the ceiling
       prints exactly it, and no declared interval — however long the screen claims — prints above. */
    for (const study of [20_000, 60_000]) {
      assert.equal(play({ n: 8, decide: state.DELIBERATION_MS, answer: study, read: 0 }).over.split,
        bestFor(study), 'a session held at the ceiling does not print the ceiling\'s share');
      for (const decide of [state.DELIBERATION_MS, 60_000, 600_000]) {
        const r = play({ n: 8, decide, answer: study, read: 0 });
        assert.ok(r.over.split <= bestFor(study),
          `a ${decide} ms declared decision printed ${r.over.split} %, above the bound ${bestFor(study)} %`);
      }
    }
  });

  test('CUT-BRIEF\'s own session shape tops out at 48 % — with a 24 s stare at every card', () => {
    /* "10–14 minutes, 8–12 questions" is 50–105 s per question, everything in. Against that, the
       ceiling is the whole budget the game could ever have. */
    const perQuestion = [Math.round(600_000 / 12), Math.round(840_000 / 8)];
    assert.deepEqual(perQuestion, [50_000, 105_000]);
    const best = perQuestion.map((t) => state.splitOf({ tGame: state.DELIBERATION_MS, tAnswer: t - state.DELIBERATION_MS }));
    assert.deepEqual(best, [48, 23],
      'the brief\'s own session shape no longer brackets the band the way this finding says');
    assert.ok(best[1] < SPLIT.lo,
      'at the slow end of CUT-BRIEF\'s own shape the band is unreachable even at the ceiling');
  });

  test('and what the shipped loop actually prints, driven end to end: 3–21 %', () => {
    /* A face-down card holding three buttons and a row of marks. Two to eight seconds is what
       choosing between them costs; the rest of these numbers are the study layer's own. */
    const printed = [
      play({ n: 12, decide: 2000, answer: 45_000, read: 15_000 }).over.split,
      play({ n: 12, decide: 3000, answer: 20_000, read: 10_000 }).over.split,
      play({ n: 12, decide: 5000, answer: 20_000, read: 10_000 }).over.split,
      play({ n: 12, decide: 8000, answer: 25_000, read: 5000 }).over.split,
    ];
    assert.deepEqual(printed, [3, 9, 14, 21]);
    for (const p of printed) assert.ok(p < SPLIT.lo, `${p} % is inside the band — re-read this block`);
    /* THE FINDING, stated once. The honest range of this loop is 3–21 %, its centre is about 9 %,
       and CUT-BRIEF asks for 45–55 %. Nothing in the engine is wrong: #1–#7 above prove the meter
       is a true share of the session and cannot be flattered. The gap is the design's, and the
       decision — amend the target, or accept that the app prints a number three to five times below
       the one the brief promises — belongs to CUT-BRIEF's owner. If the band is amended, the
       deliberation ceiling of #7 should come down with it: the ceiling is derived from the band
       (24 s is what 55 % demands at COMPOSED's fastest card), and a lower band buys a lower ceiling,
       which is what shrinks the one hole #7 leaves — a sub-ceiling absence read as deliberation. */
  });
});

/* ========================================================================================== */
/**
 * #9 AN ABSENCE IS NOT A SESSION — the round-3 blocker (number-truth).
 *
 * #7 closed the absence that was being counted as a game DECISION. This one closes the absence that
 * was being counted as the session: everything the screen does not declare fell to `tAnswer`, and
 * `tAnswer` was in the denominator, so a student who shut the tab and came back after lunch had his
 * lunch inside the number. The same six questions, the same decisions, the same speed:
 *
 *     break        0 min   5 min   1 h    12 h
 *     printed      16 %    5 %     1 %    0 %        ← and the session was 16 % every time
 *
 * The arithmetic was exact. The sentence under it — "% of this session was the game" — was about a
 * session nobody had, and it is the app's only self-report against CUT-BRIEF's 45–55 %.
 *
 * The rule now: a span the app DECLARED it was not in use is in neither half. Nothing else may
 * enter `tAway` — not a long interval, not a slow reader, not a screen that claims one. Duration is
 * never evidence, so the conservative direction of #4 and #7 survives intact.
 */
describe('#9 a break is not in the share — the app measures the session it was open for', () => {
  const SESSION = { n: 6, decide: 4000, answer: 20_000, read: 0 };
  const BREAKS = [5 * 60_000, 60 * 60_000, 12 * 60 * 60_000, 3 * 86_400_000];

  test('THE BLOCKER: the same decisions at the same speed print the same number, break or no break', () => {
    const calm = play(SESSION);
    assert.equal(calm.over.split, Math.round((calm.gameMs / calm.wallMs) * 100));
    for (const goneMs of BREAKS) {
      const gone = play({ ...SESSION, goneAt: 3, goneMs });
      assert.equal(gone.over.split, calm.over.split,
        `${Math.round(goneMs / 60_000)} min away printed ${gone.over.split} % over a session that was ${calm.over.split} %`);
      /* and it is the SHARE OF THE SESSION PLAYED, computed outside the machine */
      assert.equal(gone.over.split, Math.round((gone.gameMs / gone.playedMs) * 100));
    }
  });

  test('…and a tab that was CLOSED for it, re-opened by `resume`, prints the same number again', () => {
    const calm = play(SESSION);
    for (const goneMs of BREAKS) {
      const gone = play({ ...SESSION, goneAt: 3, goneMs, killed: true });
      assert.equal(gone.over.split, calm.over.split,
        `a tab closed for ${Math.round(goneMs / 60_000)} min printed ${gone.over.split} %, not ${calm.over.split} %`);
    }
  });

  test('the record survives the disk, and the absence closes when the session is opened again', () => {
    const save = rig({ len: 6 });
    state.call(save, state.callsFor(save)[0], { now: 4000, ms: 4000 });
    state.answer(save, CLEAR, { now: 24_000, ms: 20_000 });
    state.presence(save, { now: 26_000, here: false });          // pagehide: 2 s of reading booked
    assert.deepEqual([state.stateOf(save).tGame, state.stateOf(save).tAnswer], [4000, 22_000]);
    assert.equal(state.stateOf(save).away, 1, 'the bit is not on the record');

    const back = JSON.parse(JSON.stringify(save));               // the tab dies, exactly as the disk does
    const g = state.resume(back, { now: 26_000 + 9 * 3_600_000 });
    assert.equal(g.away, 0, 'the session came back still away');
    assert.equal(g.tAway, 9 * 3_600_000, 'nine hours of a shut tab were not banked as absence');
    assert.deepEqual([g.tGame, g.tAnswer], [4000, 22_000], 'the shut tab moved a half of the share');
    assert.equal(state.splitOf(g), state.splitOf({ tGame: 4000, tAnswer: 22_000 }));
  });

  test('the invariant, now in three parts: every millisecond of the wall clock is in exactly one', () => {
    for (const opts of [
      { ...SESSION }, { ...SESSION, goneAt: 0, goneMs: 90_000 }, { ...SESSION, goneAt: 5, goneMs: 3_600_000 },
      { ...SESSION, goneAt: 2, goneMs: 86_400_000, killed: true },
      { ...SESSION, read: 9000, bankAfter: [1, 4], goneAt: 3, goneMs: 600_000 },
      { ...SESSION, idleAt: 1, idleMs: 30_000, goneAt: 4, goneMs: 300_000 },
    ]) {
      const save = rig({ len: 40 });
      let t = 0, owed = 0, away = 0;
      for (let i = 0; i < opts.n; i++) {
        if (i === opts.goneAt) {
          t += owed; owed = 0;
          state.presence(save, { now: t, here: false });
          t += opts.goneMs; away += opts.goneMs;
          state.presence(save, { now: t, here: true });
        }
        const dwell = opts.decide + (i === opts.idleAt ? opts.idleMs : 0);
        t += owed + dwell; owed = 0;
        state.call(save, state.callsFor(save)[0], { now: t, ms: dwell });
        t += opts.answer;
        state.answer(save, CLEAR, { now: t, ms: opts.answer });
        owed = opts.read;
      }
      const g = state.stateOf(save);
      assert.equal(g.tGame + g.tAnswer + g.tAway, t,
        `${JSON.stringify(opts)}: the three parts are not the wall clock`);
      assert.equal(g.tAway, away, 'the absence is not the absence the app declared');
    }
  });

  test('NOTHING BUT A DECLARED ABSENCE REACHES `tAway` — the meter still cannot be flattered', () => {
    /* (a) coming back when nobody left is a strict no-op, field for field */
    const a = rig({ len: 4 });
    state.call(a, state.callsFor(a)[0], { now: 4000, ms: 4000 });
    const before = JSON.parse(JSON.stringify(state.stateOf(a)));
    state.presence(a, { now: 500_000, here: true });
    state.presence(a, { now: 900_000, here: true });
    assert.deepEqual(JSON.parse(JSON.stringify(state.stateOf(a))), before,
      'a "came back" nobody left shrank the denominator');

    /* (b) A REPEAT CANNOT MOVE A MILLISECOND BETWEEN THE HALVES. `visibilitychange` and `pagehide`
       both fire on the way out, and a browser may fire either again; whatever the run, the time the
       student was here stays in the answering half and the absence stays out of both. (This holds
       structurally — `tick` closes an open absence before it attributes anything — so the early
       return in `presence` is a cheaper path, not the thing under test. notes/cut-engine.md §R1 N5.) */
    const b = rig({ len: 4 });
    state.presence(b, { now: 10_000, here: false });
    state.presence(b, { now: 400_000, here: false });
    assert.equal(state.stateOf(b).away, 1, 'the second event restarted the absence');
    state.presence(b, { now: 900_000, here: true });
    assert.equal(state.stateOf(b).tAway, 890_000);
    assert.equal(state.stateOf(b).tAnswer, 10_000, 'the time the student WAS here was thrown away');

    /* (c) THERE IS NO DURATION TO FORGE. The record carries one bit; the length is derived from the
       meter's own unattributed span, so the worst a corrupt save (or a lying screen) can do is move
       ONE interval out of the answering half — never invent time, never break the partition, and
       never take a millisecond the clock has not reached. */
    for (const forged of [1, true, 99, -1, 'yes', Infinity, NaN, null, undefined, 0, false]) {
      const c = rig({ len: 4, startedAt: 1_000_000 });
      state.call(c, state.callsFor(c)[0], { now: 1_004_000, ms: 4000 });
      state.stateOf(c).away = forged;
      state.answer(c, CLEAR, { now: 1_024_000, ms: 20_000 });
      const g = state.stateOf(c);
      assert.equal(g.tGame + g.tAnswer + g.tAway, 24_000, `forged bit ${String(forged)} broke the partition`);
      assert.ok(g.tAway <= 20_000, `forged bit ${String(forged)} claimed ${g.tAway} ms of absence`);
      assert.equal(g.tGame, 4000, `forged bit ${String(forged)} reached the GAME half`);
    }

    /* (d) DURATION IS NOT EVIDENCE. An hour on a visible tab the app was never told about is study
       time, as it always was, and it still lowers the printed share. This is the deliberate half of
       the trade: the meter reports low when it cannot tell, and never high. */
    const silent = play({ ...SESSION, idleAt: 3, idleMs: 3_600_000 });
    assert.ok(silent.over.split < play(SESSION).over.split,
      'an undeclared hour raised the share — duration became evidence of absence');
  });

  test('the absence prices nothing and prints nothing: no number moves but the split', () => {
    const calm = play({ ...SESSION, bankAfter: [2, 5] });
    const gone = play({ ...SESSION, bankAfter: [2, 5], goneAt: 3, goneMs: 7 * 3_600_000 });
    assert.deepEqual(
      [gone.over.points, gone.over.today, gone.over.best, gone.save.player.best, gone.save.game.today],
      [calm.over.points, calm.over.today, calm.over.best, calm.save.player.best, calm.save.game.today],
      'a break moved a number the student is paid in');
    /* and the strip's own vocabulary is unchanged — `tAway` has no string and no slot */
    assert.equal('tAway' in COPY, false);
    assert.equal(state.splitOf({ tGame: 45_000, tAnswer: 55_000, tAway: 9e9 }), SPLIT.lo,
      'the printed share reads the absence: it is a share of the two halves and nothing else');
  });
});
