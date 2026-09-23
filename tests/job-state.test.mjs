// tests/job-state.test.mjs — THE STATE MACHINE'S MATH. designs/CUT-BRIEF.md, designs/CUT-SPEC.md §7.
//
// The requirements this file owns are the ones that are about what the SESSION does, not about what
// the payoff table says in isolation (`job-pay.test.mjs` owns §7 #1-#3):
//
//   #4  a right answer never pays less than a wrong one, in every reachable state
//   #5  failing never pays — no program allowed to throw a question beats honest play
//   #6  improving never costs — E[points] is monotone in the student's true hit rate
//   #7  nothing about the payoff reads a clock
//   #8  losses come only from the unbanked pile, it floors at zero, and `today` never falls
//   #9  the bit the hit rate counts and the bit the game prices are the same bit
//
// EVERY TRANSITION IN THIS FILE COMES OUT OF THE SHIPPED MACHINE. Nothing below re-implements
// `answer`: `stepOf()` drives the real `state.call` / `state.answer` on a real save and reads the
// pile and the streak back out, and `RULE` — the table the dynamic programs run on — is built from
// those probes and then re-checked against a full grid of them ("the rule is the machine's"). A
// proof over a reconstruction of the payoff table would prove nothing about the app.
//
// THE DYNAMIC PROGRAM. `V(P, m, n)` is the expected points the student ends the session with, from
// pile `P`, streak `m`, `n` questions left, playing optimally: bank, or pick a call and answer it
// (right with probability `q`). `endJob` banks whatever is left, so the terminal value is `P`. Two
// versions of it run below — the honest one, whose only actions are the ones the app offers, and a
// cheating one that may also THROW a question on purpose. Requirement #5 is the statement that they
// are the same number.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import * as state from '../site/js/job/state.js';
import { qHatDetail } from '../site/js/job/call.js';

const SRC = fileURLToPath(new URL('../site/js/job/state.js', import.meta.url));

/* ==========================================================================================
   THE RIG — the smallest save `state.js` will run on, and a probe of one answer
   ========================================================================================== */

const item = (n, over = {}) => ({
  n, id: `c-${n}`, role: 'core', tier: 1, skill: 'sk', kind: 'card', done: false, result: null, ...over,
});

/** A save with a live session at (pile, streak) and `len` questions in front of it. */
function rig({ pile = 0, streak = 1, len = 2, today = 0, best = 0, items = null } = {}) {
  const queue = items ?? Array.from({ length: len }, (_, i) => item(i + 1));
  return {
    profileId: 'job-state', cards: {}, skills: {}, xp: { total: 0 }, errors: [], counters: {},
    player: { best }, game: { today, day: '2026-09-16' },
    inProgress: {
      kind: 'page', seed: 7, queue, idx: 0, startedAt: 0, day: '2026-09-16',
      game: { pile, streak, call: null, answered: 0, tGame: 0, tAnswer: 0, seed: '7' },
    },
  };
}

const CLEAR = { cleared: true, attempt: 1, hints: 0 };
const MISS = { cleared: false, attempt: 3, hints: 2 };

/** ONE ANSWER, through the shipped verbs. Returns what the machine did, not what we think it does. */
function stepOf(pile, streak, callId, ok, opts = {}) {
  const save = rig({ pile, streak, len: 2, today: opts.today ?? 0, best: opts.best ?? 0 });
  const priced = state.priceOf(save, callId);
  state.call(save, callId, { now: 1000, ms: 10 });
  const r = state.answer(save, ok ? CLEAR : MISS, { now: 2000, ms: 20 });
  const g = state.stateOf(save);
  return {
    pile: g.pile, streak: g.streak, call: g.call, answered: g.answered,
    pay: r.pay, cost: r.cost, delta: r.delta, ok: r.ok,
    today: save.game.today, best: save.player.best, priced,
  };
}

/** The calls the machine offers at this pile and streak. */
const offeredAt = (pile, streak) => state.callsFor(rig({ pile, streak }));

/* ==========================================================================================
   THE RULE, READ OUT OF THE MACHINE
   ========================================================================================== */

const MULT_MAX = (() => {
  let m = 1;
  /* climb the streak the only way the machine allows: right answers */
  const save = rig({ len: 40 });
  for (let i = 0; i < 12 && state.targetsLeft(save) > 0; i++) {
    state.call(save, state.callsFor(save)[0], { now: 1, ms: 1 });
    state.answer(save, CLEAR, { now: 2, ms: 1 });
    m = Math.max(m, state.stateOf(save).streak);
  }
  return m;
})();

const CALLS = [...new Set([...offeredAt(0, 1), ...offeredAt(400, 1)])];

/**
 * What one answer DOES, per call per streak, probed where the pile is too big to bind the cost cap.
 * Pay, cost AND both streaks come out of the machine — the dynamic programs below are only as
 * honest as this table, so nothing in it is written down from the spec.
 */
const BIG = 800;
const RULE = (() => {
  const out = new Map();
  for (let m = 1; m <= MULT_MAX; m++) {
    for (const c of CALLS) {
      const win = stepOf(BIG, m, c, true);
      const miss = stepOf(BIG, m, c, false);
      out.set(`${c}|${m}`, {
        /* WHAT THE PILE DID, never what the return value said it did. A machine that reports `pay 9`
           and adds 18 must break the proofs below, not pass them on its own paperwork. */
        pay: win.pile - BIG,
        cost: BIG - miss.pile,
        winStreak: win.streak,
        missStreak: miss.streak,
        saidPay: win.pay,
        saidCost: miss.cost,
      });
    }
  }
  return out;
})();

const payOf = (c, m) => RULE.get(`${c}|${m}`).pay;
/**
 * The bite at a pile big enough that nothing can cap it. NOT the price at every pile: the shipped
 * table charges a SHARE of the pile on top of this (`js/job/pay.js`), so a single probe at `BIG` is
 * the price at `BIG` and nowhere else. Kept because the streak ladder is still a fact about it.
 */
const bigCost = (c, m) => RULE.get(`${c}|${m}`).cost;

/**
 * WHAT A MISS ACTUALLY TAKES AT THIS EXACT PILE, probed from the machine by the change in the pile —
 * never from a price this file wrote down. The probe is per-pile because the price reads the pile.
 */
const costAt = (c, m, P) => P - stepOf(P, m, c, false).pile;
const winStreak = (c, m) => RULE.get(`${c}|${m}`).winStreak;
const missStreak = (c, m) => RULE.get(`${c}|${m}`).missStreak;
const nextStreak = (m) => Math.min(MULT_MAX, m + 1);

/* ==========================================================================================
   REACHABILITY — the states a real session can actually be in
   ========================================================================================== */

/** Every (pile, streak) reachable from (0, ×1) in at most `depth` answers. Banking returns (0, ×1). */
function reachable(depth = 14) {
  const seen = new Set(['0|1']);
  let frontier = [[0, 1]];
  for (let d = 0; d < depth; d++) {
    const next = [];
    for (const [P, m] of frontier) {
      for (const c of offeredAt(P, m)) {
        const win = [P + payOf(c, m), winStreak(c, m)];
        const miss = [P - costAt(c, m, P), missStreak(c, m)];
        for (const st of [win, miss]) {
          const k = `${st[0]}|${st[1]}`;
          if (!seen.has(k)) { seen.add(k); next.push(st); }
        }
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return [...seen].map((k) => k.split('|').map(Number));
}

const REACH = reachable(14);

/* ==========================================================================================
   THE DYNAMIC PROGRAMS
   ========================================================================================== */

const CAP = 900;
const at = (m, P) => m * (CAP + 1) + P;
const SIZE = (MULT_MAX + 1) * (CAP + 1);

const terminal = () => {
  const a = new Float64Array(SIZE);
  for (let m = 1; m <= MULT_MAX; m++) for (let P = 0; P <= CAP; P++) a[at(m, P)] = P;   // endJob banks it
  return a;
};

/**
 * Expected points at the end of a session of `T` questions, playing optimally at true hit rate `q`.
 * `cheat` adds the one action the app does not offer: answer this question wrong ON PURPOSE.
 */
function solve(q, T, { cheat = false } = {}) {
  let last = terminal();
  for (let n = 1; n <= T; n++) {
    const cur = new Float64Array(SIZE);
    const play = (P, m) => {
      let best = -Infinity;
      for (const c of offeredAt(P, m)) {
        const win = last[at(winStreak(c, m), Math.min(CAP, P + payOf(c, m)))];
        const miss = last[at(missStreak(c, m), P - costAt(c, m, P))];
        const honest = q * win + (1 - q) * miss;
        const v = cheat ? Math.max(honest, miss) : honest;
        if (v > best) best = v;
      }
      return best;
    };
    const afterBank = play(0, 1);
    for (let m = 1; m <= MULT_MAX; m++) {
      for (let P = 0; P <= CAP; P++) cur[at(m, P)] = Math.max(play(P, m), P + afterBank);
    }
    last = cur;
  }
  return last[at(1, 0)];
}

/**
 * The same program, with the study layer's own mid-page retry in it: a missed REVIEW is spliced back
 * into the queue (`page.js requeueReview`, once per item), so a wrong answer can BUY A QUESTION.
 * `r` counts the items that can still do that, and they come first — the most generous ordering a
 * cheat could ask for. This is the interaction that had to be checked, not assumed: the game does
 * not own the queue, so "failing never pays" is a claim about the game AND the schedule together.
 */
function solveRequeue(q, T, R, { cheat = false } = {}) {
  const tbl = new Map();
  const get = (n, r) => tbl.get(`${n}:${r}`);
  for (let r = 0; r <= R; r++) tbl.set(`0:${r}`, terminal());
  for (let n = 1; n <= T + R; n++) {
    for (let r = 0; r <= R; r++) {
      const cur = new Float64Array(SIZE);
      const play = (P, m) => {
        let best = -Infinity;
        for (const c of offeredAt(P, m)) {
          const P1 = Math.min(CAP, P + payOf(c, m));
          const m1 = winStreak(c, m);
          const m0 = missStreak(c, m);
          const P0 = P - costAt(c, m, P);
          const requeues = r > 0;
          const win = get(n - 1, requeues ? r - 1 : r)[at(m1, P1)];
          /* the miss keeps `n` when the item comes back: one consumed, one spliced in */
          const miss = requeues ? get(n, r - 1)[at(m0, P0)] : get(n - 1, r)[at(m0, P0)];
          const honest = q * win + (1 - q) * miss;
          const v = cheat ? Math.max(honest, miss) : honest;
          if (v > best) best = v;
        }
        return best;
      };
      const afterBank = play(0, 1);
      for (let m = 1; m <= MULT_MAX; m++) {
        for (let P = 0; P <= CAP; P++) cur[at(m, P)] = Math.max(play(P, m), P + afterBank);
      }
      tbl.set(`${n}:${r}`, cur);
    }
  }
  return get(T, R)[at(1, 0)];
}

/* ========================================================================================== */

describe('the rule the proofs run on is the machine\'s own', () => {
  test('the streak climbs 1 → 5 on right answers and caps there', () => {
    assert.equal(MULT_MAX, 5);
    const save = rig({ len: 40 });
    const seen = [];
    for (let i = 0; i < 8; i++) {
      seen.push(state.stateOf(save).streak);
      state.call(save, 'not sure', { now: 1, ms: 1 });
      state.answer(save, CLEAR, { now: 2, ms: 1 });
    }
    assert.deepEqual(seen, [1, 2, 3, 4, 5, 5, 5, 5]);
  });

  test('the three calls, and nothing else', () => {
    assert.deepEqual(CALLS, ['not sure', 'pretty sure', 'sure']);
    assert.deepEqual(offeredAt(0, 1), ['not sure']);                     // CUT-SPEC §2: always offered
  });

  test('what the machine SAYS a call pays is what the pile then does', () => {
    for (let m = 1; m <= MULT_MAX; m++) {
      for (const c of CALLS) {
        const r = RULE.get(`${c}|${m}`);
        assert.equal(r.saidPay, r.pay, `${c} ×${m} reported a pay the pile did not make`);
        assert.equal(r.saidCost, r.cost, `${c} ×${m} reported a cost the pile did not take`);
      }
    }
  });

  test('the bite scales linearly with the streak, and the pile`s share is the same for all three calls', () => {
    /* THE CLAIM THE BAND EDGES REST ON, measured rather than read out of `js/job/pay.js`. At a pile
       too big to cap, a miss takes `flat bite × streak` PLUS a share of the pile — and that share is
       identical for all three calls, so it CANCELS in every comparison between them and the edges
       stay at 2/3 and 4/5 at every pile. A share that differed by call would move the edges with the
       pile and make the three fixed lines Settings prints false. */
    for (const c of CALLS) {
      const steps = [];
      for (let m = 2; m <= MULT_MAX; m++) steps.push(bigCost(c, m) - bigCost(c, m - 1));
      assert.equal(new Set(steps).size, 1, `${c}: the bite does not scale linearly with the streak (${steps})`);
      assert.ok(steps[0] > 0, `${c}: a longer streak must cost more, not less`);
    }
    /* the flat bite per rung is the streak step; whatever is left at ×m is the pile's share */
    const flat = (c) => bigCost(c, 2) - bigCost(c, 1);
    for (let m = 1; m <= MULT_MAX; m++) {
      const shares = CALLS.map((c) => bigCost(c, m) - m * flat(c));
      assert.equal(new Set(shares).size, 1,
        `×${m}: the pile's share differs by call (${shares}) — the band edges would move with the pile`);
    }
  });

  test('pay and cost, probed at every reachable state × offered call, match the rule exactly', () => {
    let n = 0;
    for (const [P, m] of REACH) {
      for (const c of offeredAt(P, m)) {
        const win = stepOf(P, m, c, true);
        const miss = stepOf(P, m, c, false);
        assert.equal(win.pay, payOf(c, m), `pay ${c} ×${m} @${P}`);
        assert.equal(miss.cost, costAt(c, m, P), `cost ${c} ×${m} @${P}`);
        assert.equal(win.pile, P + payOf(c, m));
        assert.equal(miss.pile, P - costAt(c, m, P));
        assert.equal(win.streak, nextStreak(m));
        assert.equal(miss.streak, 1);
        n++;
      }
    }
    assert.ok(n > 2000, `only ${n} (state × call) pairs probed`);
  });

  test('the minimum pile by streak is 0, 8, 24, 48, 80 — one right answer opens the second call', () => {
    const minPile = new Map();
    for (const [P, m] of REACH) minPile.set(m, Math.min(minPile.get(m) ?? Infinity, P));
    assert.deepEqual([1, 2, 3, 4, 5].map((m) => minPile.get(m)), [0, 8, 24, 48, 80]);
    assert.deepEqual(offeredAt(8, 2), ['not sure', 'pretty sure']);
    assert.deepEqual(offeredAt(24, 3), ['not sure', 'pretty sure', 'sure']);
  });

  test('the gate: the cost cap never flattens two offered calls into one price', () => {
    /* WHAT THE CAP COSTS IF IT BINDS, and why this is the shape of the test now. The old assertion
       compared each price against a single flat bite probed at `BIG` — which stopped being the price
       when `js/job/pay.js` made the bite read the pile, and would have gone on "passing" against a
       number the machine no longer charges. What the gate is FOR is that a student never compares two
       calls at a discounted price, and that is observable without knowing the price at all: a capped
       call is clipped to the pile, so it would tie with, or undercut, the call below it. It never
       does — the dearer call is strictly dearer at every reachable pile where both are on the table. */
    let pairs = 0, flattened = 0, multi = 0;
    for (const [P, m] of REACH) {
      const list = offeredAt(P, m);
      if (list.length < 2) continue;
      multi++;
      for (let i = 1; i < list.length; i++) {
        pairs++;
        if (!(costAt(list[i], m, P) > costAt(list[i - 1], m, P))) flattened++;
      }
    }
    assert.equal(flattened, 0, `the cap flattened ${flattened} of ${pairs} comparisons`);
    assert.ok(multi > 1000, `only ${multi} of ${REACH.length} states offered a choice — the sweep collapsed`);
    // …and where only ONE call is on the table the cap may bind: no comparison is made there.
    const alone = REACH.filter(([P, m]) => offeredAt(P, m).length === 1);
    for (const [P, m] of alone) assert.ok(costAt(CALLS[0], m, P) <= P, `pile ${P} ×${m} lost more than it had`);
  });

  test('an unaffordable call is refused, never silently discounted', () => {
    let refused = 0;
    for (const [P, m] of REACH.slice(0, 400)) {
      const list = new Set(offeredAt(P, m));
      for (const c of CALLS) {
        if (list.has(c)) continue;
        assert.throws(() => state.call(rig({ pile: P, streak: m }), c, {}), /unaffordable/);
        refused++;
      }
    }
    assert.ok(refused > 0);
  });
});

/* ========================================================================================== */
describe('#8 losses come only from the unbanked pile, and it floors at zero', () => {
  test('every reachable state × offered call: 0 ≤ pile\' ≤ pile on a miss, and nothing else moves', () => {
    let worst = Infinity;
    for (const [P, m] of REACH) {
      for (const c of offeredAt(P, m)) {
        const r = stepOf(P, m, c, false, { today: 120, best: 500 });
        assert.ok(r.pile >= 0, `pile went negative at ${P} ×${m} ${c}`);
        assert.ok(r.pile <= P, `a miss grew the pile at ${P} ×${m} ${c}`);
        /* the pile lost EXACTLY what the machine reported it would lose — the report and the pile
           are the same number, which is the half of #8 a capped price could otherwise hide */
        assert.equal(r.pile, P - r.cost, `the reported cost is not what the pile lost at ${P} ×${m} ${c}`);
        assert.ok(r.cost <= P, `a miss took ${r.cost} out of a pile of ${P}`);
        assert.equal(r.today, 120, 'a miss touched banked points');
        assert.equal(r.best, 500, 'a miss touched the best day');
        worst = Math.min(worst, P - r.pile === 0 ? Infinity : P - r.pile);
      }
    }
  });

  test('a miss at an empty pile takes nothing — there is nothing to take', () => {
    const r = stepOf(0, 1, 'not sure', false, { today: 40, best: 40 });
    assert.equal(r.pile, 0);
    assert.equal(r.cost, 0);
    assert.equal(r.delta, 0);
    assert.equal(r.today, 40);
  });

  test('`today` never decreases across a whole session, banks and misses included', () => {
    const save = rig({ len: 30, today: 55, best: 300 });
    let last = save.game.today;
    let lastBest = save.player.best;
    const script = [1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1];
    for (let i = 0; i < script.length; i++) {
      state.call(save, state.callsFor(save)[0], { now: i * 10, ms: 5 });
      state.answer(save, script[i] ? CLEAR : MISS, { now: i * 10 + 5, ms: 5 });
      if (i % 4 === 3) state.bank(save, { now: i * 10 + 6, ms: 5 });
      assert.ok(save.game.today >= last, `today fell ${last} → ${save.game.today}`);
      assert.ok(save.player.best >= lastBest, `best fell ${lastBest} → ${save.player.best}`);
      last = save.game.today;
      lastBest = save.player.best;
    }
    assert.ok(save.game.today > 55, 'the session banked nothing at all');
  });

  test('a session that runs through midnight keeps banking into the day it started', () => {
    /* `bank` reads no clock for the day: the one verb that rolls the day over is `startJob`. A
       student watching the strip at 23:59 must not see `today` fall to 0 under their hand. */
    const save = rig({ pile: 24, len: 6, today: 90, best: 90 });
    /* LOCAL time, because `days.js todayISO` is local: a UTC pair can sit inside one local day and
       cross no midnight at all, which is a test that cannot fail */
    const beforeMidnight = new Date(2026, 8, 16, 23, 59, 50).getTime();
    const afterMidnight = new Date(2026, 8, 17, 0, 0, 10).getTime();
    const a = state.bank(save, { now: beforeMidnight, ms: 5 });
    assert.equal(a.today, 114);
    state.call(save, 'not sure', { now: beforeMidnight + 1, ms: 1 });
    state.answer(save, CLEAR, { now: beforeMidnight + 2, ms: 1 });
    const b = state.bank(save, { now: afterMidnight, ms: 5 });
    assert.ok(b.today >= a.today, `today fell ${a.today} → ${b.today} at midnight`);
    assert.equal(save.game.day, '2026-09-16');
  });
});

/* ========================================================================================== */
describe('#4 a right answer never pays less than a wrong one', () => {
  test('every reachable state × offered call, in points and in the streak', () => {
    let minGap = Infinity;
    let pairs = 0;
    for (const [P, m] of REACH) {
      for (const c of offeredAt(P, m)) {
        const win = stepOf(P, m, c, true, { today: 12, best: 99 });
        const miss = stepOf(P, m, c, false, { today: 12, best: 99 });
        assert.ok(win.pile > miss.pile, `right paid no better at ${P} ×${m} ${c}`);
        assert.ok(win.streak >= miss.streak, `right lost streak at ${P} ×${m} ${c}`);
        assert.ok(win.delta >= miss.delta);
        assert.equal(win.today, miss.today);
        assert.equal(win.best, miss.best);
        minGap = Math.min(minGap, win.pile - miss.pile);
        pairs++;
      }
    }
    assert.equal(minGap, 8, `the smallest gap between right and wrong is ${minGap}`);
    assert.ok(pairs > 2000);
  });
});

/* ========================================================================================== */
describe('#5 failing never pays', () => {
  const QS = [0.35, 0.5, 0.65, 0.75, 0.85, 0.95];

  test('a program allowed to throw any question gains exactly 0, at every hit rate', () => {
    for (const q of QS) {
      const honest = solve(q, 10);
      const cheat = solve(q, 10, { cheat: true });
      assert.equal(cheat - honest, 0, `throwing gained ${cheat - honest} at q=${q}`);
    }
  });

  test('…and still exactly 0 when a missed review buys the cheat another question', () => {
    /* the study layer splices a missed review back into the page. If the extra question were worth
       more than the pay and the streak the honest answer wins, the old design's disease would be
       back — a reason to answer badly. It is not: the streak reset costs more than the question. */
    for (const q of [0.5, 0.75, 0.95]) {
      const honest = solveRequeue(q, 8, 8);
      const cheat = solveRequeue(q, 8, 8, { cheat: true });
      assert.equal(cheat - honest, 0, `throwing gained ${cheat - honest} at q=${q} with retries`);
    }
  });

  test('a thrown question moves no number the app shows in the thrower\'s favour', () => {
    const before = rig({ pile: 40, streak: 3, len: 4, today: 70, best: 200 });
    state.call(before, 'sure', { now: 1, ms: 1 });
    const r = state.answer(before, MISS, { now: 2, ms: 1 });
    assert.ok(r.pile < 40);
    assert.equal(before.game.today, 70);
    assert.equal(before.player.best, 200);
    assert.equal(state.stateOf(before).streak, 1);
  });
});

/* ========================================================================================== */
describe('#6 improving never costs', () => {
  test('E[points] is monotone in the hit rate over q ∈ [0.30, 0.99]', () => {
    for (const T of [8, 12]) {
      let prev = -Infinity;
      let bad = 0;
      for (let i = 30; i <= 99; i++) {
        const q = i / 100;
        const v = solve(q, T);
        /* a session must be worth a real, positive number of points — without this line a machine
           that drives the program to NaN passes the comparison below by never comparing */
        assert.ok(Number.isFinite(v) && v > 0, `E[points] at q=${q}, T=${T} is ${v}`);
        if (v < prev - 1e-9) bad++;
        prev = v;
      }
      assert.equal(bad, 0, `${bad} non-monotone steps at T=${T}`);
      assert.ok(prev > solve(0.3, T), 'the whole range is flat');
    }
  });

  test('and the session is worth more the better you get: 36, 54, 78, 109, 155, 228, 377 at T=12', () => {
    /* Re-derived against the SHIPPED table after `js/job/pay.js` gave the bite a share of the pile
       (the curve was 37, 58, 87, 126, 186, 278, 413 on the flat one). What #6 requires is the SHAPE —
       every step up in hit rate is worth more, asserted over all 70 steps of [0.30, 0.99] by the test
       above — and these seven are the published sample of it. The numbers are the machine's own. */
    const got = [0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95].map((q) => Math.round(solve(q, 12)));
    assert.deepEqual(got, [36, 54, 78, 109, 155, 228, 377]);
    for (let i = 1; i < got.length; i++) assert.ok(got[i] > got[i - 1], 'the published sample is not monotone');
  });

  test('a right answer is never worth less at a higher streak', () => {
    for (const [P, m] of REACH) {
      if (m >= MULT_MAX) continue;
      const here = stepOf(P, m, offeredAt(P, m)[0], true);
      const up = stepOf(P, m + 1, offeredAt(P, m + 1)[0], true);
      assert.ok(up.pay >= here.pay, `×${m + 1} paid less than ×${m} at pile ${P}`);
    }
  });
});

/* ========================================================================================== */
describe('#7 answers tick; time does not', () => {
  const play = (opts) => {
    const save = rig({ len: 12 });
    const script = [1, 1, 0, 1, 1, 1, 0, 1];
    for (let i = 0; i < script.length; i++) {
      const calls = state.callsFor(save);
      state.call(save, calls[calls.length - 1], opts(i, 'call'));
      state.answer(save, script[i] ? CLEAR : MISS, opts(i, 'answer'));
      if (i === 4) state.bank(save, opts(i, 'bank'));
    }
    const g = state.stateOf(save);
    return { pile: g.pile, streak: g.streak, answered: g.answered, today: save.game.today, best: save.player.best };
  };

  test('the same answers price the same however long they took', () => {
    const fast = play(() => ({ now: 1, ms: 1 }));
    const slow = play((i) => ({ now: 1e12 + i * 6e5, ms: 6e5 }));
    const none = play(() => ({}));
    const junk = play(() => ({ now: NaN, ms: -5 }));
    assert.deepEqual(slow, fast);
    assert.deepEqual(none, fast);
    assert.deepEqual(junk, fast);
    assert.ok(fast.pile >= 0 && fast.today > 0);
  });

  test('the split meter moves and prices nothing', () => {
    /* `rig` opens the page at `startedAt: 0`, so a verb's `now` IS the wall clock of the session:
       1 s arriving, 4 s on the face-down card, 6 s on the question. The two halves PARTITION that
       — `tests/job-split.test.mjs` owns the invariant; this test owns "and it prices nothing". */
    const save = rig({ pile: 24, streak: 3, len: 6 });
    state.call(save, 'sure', { now: 5000, ms: 4000 });
    const g = state.stateOf(save);
    assert.equal(g.tGame, 4000, 'the game decision the screen declared');
    assert.equal(g.tAnswer, 1000, 'and the second before the card was up, which is not one');
    const before = state.priceOf(save, 'sure');
    const paid = state.answer(save, CLEAR, { now: 11000, ms: 6000 });
    assert.equal(paid.pay, before.pay, 'the clock moved a payout');
    assert.deepEqual([g.tGame, g.tAnswer], [4000, 7000]);
    assert.equal(g.tGame + g.tAnswer, 11000, 'the halves are the session, not two chosen intervals');
    assert.equal(state.splitOf(g), 36);

    /* a wild measurement prices nothing — and cannot make the meter invent wall clock either */
    const save2 = rig({ pile: 24, streak: 3, len: 6 });
    state.call(save2, 'sure', { now: 5000, ms: 4000 });
    const g2 = state.stateOf(save2);
    const price2 = state.priceOf(save2, 'sure');
    g2.tGame = 999999;                             // a wild measurement
    g2.tAnswer = 3;
    assert.deepEqual(state.priceOf(save2, 'sure'), price2, 'the clock moved a price');
    state.answer(save2, CLEAR, { now: 11000, ms: 6000 });
    assert.deepEqual([g2.tGame, g2.tAnswer], [999999, 3], 'the meter booked time that had not elapsed');

    assert.equal(state.splitOf({ tGame: 4000, tAnswer: 6000 }), 40);
    assert.equal(state.splitOf({ tGame: 0, tAnswer: 0 }), null);
  });

  test('no payoff term in the source reads a clock', () => {
    const src = readFileSync(SRC, 'utf8');
    const body = src.slice(src.indexOf('export function answer'), src.indexOf('export function bank'));
    const priced = body.slice(body.indexOf('const callId'), body.indexOf('LEDGER A'));
    for (const word of ['Date', 'now', 'tGame', 'tAnswer', 'performance']) {
      assert.ok(!priced.includes(word), `the pricing block reads \`${word}\``);
    }
  });
});

/* ========================================================================================== */
describe('#9 the bit the hit rate counts is the bit the game prices', () => {
  /* ROUND 4 (exploit-hunt, major — CROSS-LANE, engine: notes/cut-engine.md §R4). The bit was
     `result.cleared` alone, and `screens/card.js` sets that for a clear bought with three hints and
     two retries, on a ladder that is offered on every card and states the answer at H3. So `sure`
     was buyable at will: in the real app, three taps on Hint then submit paid `pretty sure` in full
     and moved the streak, and the marks the next bid is read off filled with bought clears. The
     game now prices a CLEAN clear — first try, no hint — which is not a new bit but the study
     layer's own Global rule 8 (`js/xp.js isClean`), the one the Leitner bucket already turns on.
     `result.cleared` has NOT moved: it is still the schedule's bit, and the record handed to the
     study layer below still carries it, byte for byte. */
  const shapes = [
    [{ cleared: true }, true], [{ cleared: false }, false], [{}, false], [null, false],
    [{ cleared: 'true' }, false], [{ cleared: 1 }, false], [{ cleared: true, skipped: true }, true],
    [{ cleared: false, reason: 'revealed' }, false],
    [{ cleared: true, attempt: 3, hints: 3 }, false],      // …bought with the ladder: not a payment
    [{ cleared: true, hints: 1 }, false], [{ cleared: true, attempt: 2 }, false],
    [{ cleared: true, clean: false }, false],              // card.js's own field wins where it is set
    [{ cleared: true, clean: true, hints: 3 }, true],
    [{ cleared: true, firstTry: true, hints: 0 }, true],
  ];

  test('`ok` is the CLEAN clear, and every shape of a bought one settles as a miss', () => {
    for (const [result, want] of shapes) {
      const save = rig({ pile: 16, streak: 2, len: 3 });
      state.call(save, 'not sure', { now: 1, ms: 1 });
      const r = state.answer(save, result, { now: 2, ms: 1 });
      assert.equal(r.ok, want, `${JSON.stringify(result)}`);
      assert.equal(r.pile > 16, want, 'the pile disagreed with the bit');
      assert.equal(state.stateOf(save).streak === 1, !want, 'the streak disagreed with the bit');
    }
  });

  test('the record handed to the study layer carries the STUDY layer\'s bit, untouched', () => {
    /* …and that is a different sentence from the one above, deliberately. Ledger A's bit is
       `result.cleared` and the game does not get a vote on it: a clear bought with three hints is a
       clear to the schedule, to XP and to the Binder, and the record this route hands `markItem` is
       byte-identical to the flat page's (`tests/job-ledger.test.mjs`). Only the PILE reads the
       clean bit. */
    for (const [result] of shapes) {
      const save = rig({ len: 3 });
      state.call(save, 'not sure', { now: 1, ms: 1 });
      state.answer(save, result, { now: 2, ms: 1 });
      const rec = save.inProgress.queue[0].result;
      assert.equal(rec.cleared === true, result?.cleared === true);
      assert.equal(rec.n, 1);
      assert.equal(rec.skill, 'sk');
    }
  });

  test('the printed hit rate counts exactly the answers the game paid for', () => {
    /* the card history is written by `screens/card.js` at grade time — `ok: true` in the block that
       builds `cleared: true`, `ok: false` in the block that builds `cleared: false` (card.js:922,
       :1001). Mirrored here once, at the same beat, so the two counters can be compared. */
    const save = rig({ len: 10 });
    /* EVERY item on the page gets a card record, and the index names them all. A queue item the save
       holds NO record for is a Variant, and `qHatDetail` counts the live page's answered Variants as
       sittings the card history cannot hold (`variantSittings`) — correctly, and so a fixture that
       records one card out of ten counts each of the other nine twice over. */
    const index = {};
    for (const it of save.inProgress.queue) {
      save.cards[it.id] = { skill: 'sk', history: [] };
      index[it.id] = { skills: ['sk'] };
    }
    const script = [true, false, true, true, false, true];
    let paid = 0;
    for (let i = 0; i < script.length; i++) {
      const answering = state.currentItem(save).id;
      state.call(save, 'not sure', { now: 100 + i * 10, ms: 1 });
      /* THE SEAL: the rate the card printed was cut here, before this answer existed */
      const detail = qHatDetail(save, 'sk', { cards: index });
      assert.equal(detail.hits, paid, `the printed rate disagreed at question ${i + 1}`);
      assert.equal(detail.of, i);
      const r = state.answer(save, script[i] ? CLEAR : MISS, { now: 105 + i * 10, ms: 1 });
      save.cards[answering].history.push({ at: 105 + i * 10, ok: r.ok, attempt: 1, hints: 0 });
      if (r.ok) paid++;
    }
    const end = qHatDetail(save, 'sk', { cards: index });
    assert.equal(end.hits, paid);
    assert.equal(end.hits, 4);
    assert.equal(end.of, 6);
  });
});

/* ========================================================================================== */
describe('two taps, and the bid stands until it is answered', () => {
  test('call, then answer — and neither one twice', () => {
    const save = rig({ len: 3 });
    assert.throws(() => state.answer(save, CLEAR, {}), /no-call/);
    state.call(save, 'not sure', { now: 1, ms: 1 });
    assert.throws(() => state.call(save, 'not sure', {}), /called/);
    state.answer(save, CLEAR, { now: 2, ms: 1 });
    assert.equal(state.stateOf(save).call, null);
    assert.throws(() => state.answer(save, CLEAR, {}), /no-call/);
  });

  test('banking is refused while a call is live: no free question, no walking out of a bid', () => {
    const save = rig({ pile: 80, streak: 5, len: 4, today: 10 });
    state.call(save, 'sure', { now: 1, ms: 1 });
    assert.throws(() => state.bank(save, { now: 2, ms: 1 }), /called/);
    /* had it been allowed: pile 0 → the cost floors to nothing and `sure` becomes a free ×5 bet */
    assert.equal(save.game.today, 10);
    assert.equal(state.stateOf(save).pile, 80);
    const r = state.answer(save, MISS, { now: 3, ms: 1 });
    /* 40 of flat bite (`sure` at ×5) plus the share of the pile the shipped table now charges on top
       — the numbers are the machine's, and the point of the test is the REFUSAL above: had the bank
       been allowed the pile would be 0 and this cost would floor to nothing. */
    assert.equal(r.cost, costAt('sure', 5, 80));
    assert.equal(r.pile, 80 - r.cost);
    assert.ok(r.cost > 0 && r.cost < 80, `a live bid cost ${r.cost} out of 80`);
  });

  test('bank is live on the face-down card, and never required', () => {
    const save = rig({ pile: 27, streak: 3, len: 4, today: 5, best: 6 });
    const b = state.bank(save, { ms: 1 });
    assert.deepEqual(b, { points: 27, today: 32, best: 32, pile: 0, streak: 1 });
    assert.equal(state.stateOf(save).streak, 1);
    assert.deepEqual(state.callsFor(save), ['not sure']);
  });

  test('the session ends by banking the pile, live bid or not', () => {
    const save = rig({ pile: 18, streak: 2, len: 3, today: 4, best: 4 });
    state.call(save, 'pretty sure', { now: 1, ms: 1 });
    const over = state.endJob(save, { now: 2, ms: 1 });
    assert.equal(over.points, 18);
    assert.equal(over.today, 22);
    assert.equal(over.best, 22);
    assert.equal(save.inProgress, null);
    assert.equal(save.counters.pages, 1);
  });

  test('a call is refused when there is no question under it', () => {
    const save = rig({ len: 1 });
    state.call(save, 'not sure', { now: 1, ms: 1 });
    state.answer(save, CLEAR, { now: 2, ms: 1 });
    assert.equal(state.targetsLeft(save), 0);
    assert.throws(() => state.call(save, 'not sure', {}), /no-target/);
  });
});

/* ========================================================================================== */
describe('the record survives a reload', () => {
  test('serialize is total, key-ordered and idempotent', () => {
    const g = { pile: 3.7, streak: 99, call: { id: 'sure', at: 5 }, answered: -2, tGame: 1.4, tAnswer: 2.6,
      tAway: 4.4, away: 7, seed: 'z', junk: 1 };
    const a = state.serialize(g);
    assert.deepEqual(Object.keys(a), [...state.STATE_KEYS]);
    assert.deepEqual(a, { pile: 3, streak: 5, call: { id: 'sure', at: 5 }, answered: 0, tGame: 1, tAnswer: 3,
      tAway: 4, away: 1, seed: 'z' });
    assert.deepEqual(state.serialize(a), a);
    assert.deepEqual(state.deserialize(a), a);
    assert.deepEqual(state.deserialize(null), state.serialize({}));
    assert.equal(state.serialize({ call: { id: 'nope', at: 1 } }).call, null);
    assert.equal(state.serialize({ call: { id: 'sure' } }).call, null);
  });

  test('deserialize is total: junk off the disk never throws (notes/cut-save.md request 1)', () => {
    const junk = [
      null, undefined, 0, 1, '', 'pile', true, [], [1, 2], NaN, Infinity,
      { pile: -50 }, { pile: '12' }, { pile: 1e9 }, { pile: NaN }, { pile: Infinity },
      { streak: 0 }, { streak: -3 }, { streak: 99 }, { streak: '4' }, { streak: null },
      { call: 'sure' }, { call: {} }, { call: { id: 'sure', at: 'x' } }, { call: [] },
      { answered: -1 }, { tGame: -5 }, { tAnswer: 'later' }, { seed: 12 }, { seed: null },
      { tAway: -1 }, { tAway: 'ages' }, { tAway: Infinity }, { away: -1 }, { away: NaN }, { away: 'soon' }, { away: 99 }, { away: true },
      { pile: 3, streak: 2, extra: { deep: [1] } },
      Object.create(null), new Date(), () => {},
    ];
    const label = (x) => { try { return JSON.stringify(x) ?? Object.prototype.toString.call(x); } catch { return Object.prototype.toString.call(x); } };
    for (const raw of junk) {
      const once = state.deserialize(raw);
      assert.deepEqual(Object.keys(once), [...state.STATE_KEYS], `keys for ${label(raw)}`);
      assert.ok(Number.isInteger(once.pile) && once.pile >= 0, `pile ${once.pile}`);
      assert.ok(Number.isInteger(once.streak) && once.streak >= 1 && once.streak <= MULT_MAX, `streak ${once.streak}`);
      assert.ok(Number.isInteger(once.answered) && once.answered >= 0);
      assert.ok(Number.isInteger(once.tGame) && once.tGame >= 0);
      assert.ok(Number.isInteger(once.tAnswer) && once.tAnswer >= 0);
      assert.ok(Number.isInteger(once.tAway) && once.tAway >= 0, `tAway ${once.tAway}`);
      assert.ok(once.away === 0 || once.away === 1, `away ${once.away}`);
      assert.ok(typeof once.seed === 'string');
      assert.ok(once.call === null || (typeof once.call.id === 'string' && Number.isFinite(once.call.at)));
      assert.deepEqual(state.deserialize(once), once, `not idempotent for ${label(raw)}`);
      assert.deepEqual(JSON.parse(JSON.stringify(once)), once, 'not JSON-safe');
    }
  });

  test('a killed tab comes back where it was', () => {
    const save = rig({ len: 6 });
    state.call(save, 'not sure', { now: 10, ms: 100 });
    state.answer(save, CLEAR, { now: 20, ms: 200 });
    state.call(save, 'not sure', { now: 30, ms: 50 });
    const disk = JSON.parse(JSON.stringify(save));
    const back = state.resume(disk);
    assert.deepEqual(back, state.serialize(state.stateOf(save)));
    assert.equal(back.pile, 8);
    assert.equal(back.streak, 2);
    assert.equal(back.call.id, 'not sure');
    state.answer(disk, CLEAR, { now: 40, ms: 10 });
    assert.equal(state.stateOf(disk).pile, 8 + 16);
  });

  test('a half-answered Today\'s Page is not overwritten by a session', () => {
    const save = rig({ len: 6 });
    delete save.inProgress.game;
    save.inProgress.idx = 2;
    assert.deepEqual(state.pageInProgress(save), { idx: 2, left: 4 });
    assert.throws(() => state.startJob(save, {}), /page-in-progress/);
  });
});

/* ==========================================================================================
   THE REPEAT'S BIDLESS SEAL — the engine says which of the three words is live (r3, player-feel)

   A missed Review is copied back onto the page by the study layer, and `sealRepeat` seals the copy
   bidless so the game prices each QUESTION once — the r1 exploit, worth 16–44 %, stays shut.

   What was NOT true is that the engine said so. `callsFor` went on listing the calls a locked seal
   makes unsellable, so a screen that asked what was live got a full list and a screen that offered
   one got a refusal. These tests hold the single voice: nothing is offered while a call stands, the
   seal is nameable (`isBidless`), it prices at nothing, and BANK — the control the student loses for
   a whole question when the beat is skipped — is reachable over it.
   ========================================================================================== */
describe('the repeat is sealed bidless, and the engine says so with one voice', () => {
  /** A page whose first question is a Review, at `pile` / `streak`. */
  const reviewRig = (pile, streak) => rig({
    pile, streak, items: [item(1, { isReview: true }), item(2), item(3)],
  });

  /** Miss the review; the study layer copies it back and `sealRepeat` seals the copy. */
  function missTheReview(save) {
    state.call(save, 'pretty sure', { now: 1000, ms: 1000 });
    return state.answer(save, MISS, { now: 2000, ms: 1000 });
  }

  test('a missed review requeues a copy, and the copy arrives already sealed', () => {
    const save = reviewRig(56, 4);
    const before = state.queueOf(save).length;
    missTheReview(save);
    assert.equal(state.queueOf(save).length, before + 1, 'the study layer did not requeue the review');
    assert.equal(state.isRepeat(state.currentItem(save)), true, 'the question up next is not the copy');
    assert.equal(state.isBidless(save), true, 'the copy is biddable — the r1 exploit is open again');
  });

  test('nothing is offered over the seal: the three calls are greyed by the ENGINE', () => {
    const save = reviewRig(56, 4);
    assert.ok(state.callsFor(save).length > 0, 'the rig offers nothing before the review');
    missTheReview(save);
    assert.deepEqual(state.callsFor(save), [],
      'the engine offers calls over a seal it will not sell — the screen would render them live');
    /* …and what it does not offer, it does not sell: the price of the seal is nothing, exactly. */
    assert.deepEqual(state.priceOf(save, null), { pay: 0, cost: 0, streak: 1, pile: 32 });
  });

  test('BANK is reachable over the seal — the control the missing beat withholds', () => {
    const save = reviewRig(56, 4);
    missTheReview(save);
    const pile = state.stateOf(save).pile;
    assert.ok(pile > 0, 'the miss left nothing to bank — this test proves nothing');
    const b = state.bank(save, { ms: 1, day: '2026-09-16' });
    assert.equal(b.points, pile, 'banking over the seal took a different pile than the one on screen');
    assert.equal(state.stateOf(save).pile, 0);
    assert.equal(save.game.today, pile);
  });

  test('and the seal still costs the exploit everything: the repeat pays nothing', () => {
    const save = reviewRig(56, 4);
    missTheReview(save);
    const g = state.stateOf(save);
    const [pile, streak] = [g.pile, g.streak];
    const r = state.answer(save, CLEAR, { now: 3000, ms: 1000 });
    assert.deepEqual([r.pay, r.cost, r.delta], [0, 0, 0], 'the repeat was priced');
    assert.equal(state.stateOf(save).pile, pile, 'the repeat paid into the pile');
    assert.equal(state.stateOf(save).streak, streak, 'the repeat moved the streak');
  });

  test('nothing is offered over a LIVE BID either — `callsFor` is what `call()` would accept', () => {
    const save = rig({ pile: 80, streak: 5, len: 4 });
    const offered = state.callsFor(save);
    assert.ok(offered.length > 0);
    state.call(save, offered[offered.length - 1], { now: 1, ms: 1 });
    assert.deepEqual(state.callsFor(save), [], 'the engine offered a call it throws `called` on');
    for (const id of offered) assert.throws(() => state.call(save, id, {}), /called/);
    assert.equal(state.isBidless(save), false, 'a real bid read as the bidless seal');
  });

  test('`isBidless` is false everywhere else', () => {
    assert.equal(state.isBidless(undefined), false);
    assert.equal(state.isBidless({}), false);
    assert.equal(state.isBidless(rig({ len: 2 })), false, 'a face-down card read as a seal');
  });
});

/* ==========================================================================================
   THE SESSION'S CLOCK IS THE SESSION'S (r3, split-honesty)

   `inProgress.startedAt` is the meter's origin, and `page.startPage` stamps it when it COMPOSES a
   page — which can be long before a game session opens over that page. Reachable two ways, both
   without anything unusual: open Today's Page, answer nothing and come back to the game; or toggle
   the game off and on in Settings, which deletes `inProgress.game` and keeps `inProgress`. Both
   leave an unanswered page at idx 0, which `pageInProgress` admits — so the session adopted the page
   AND its stamp, and `% of this session` was a share of a clock that started before the session did.

   The gap always lands in `tAnswer`, so the error was only ever downward: a 2-minute detour printed
   3 % over a session that was 44 % game, and an overnight gap printed 0 %.
   ========================================================================================== */
describe('the split is measured from the game\'s own start, not an earlier page\'s', () => {
  const DAY = '2026-09-16';
  const PAGE_AT = 1_790_139_352_803;              // the page is composed…
  const OPEN_AT = PAGE_AT + 120_000;              // …and the game opens two minutes later

  /** An unanswered page with no game record — what both reachable paths leave behind. */
  function unplayedPage(len, startedAt) {
    const save = rig({ len });
    delete save.inProgress.game;
    save.inProgress.idx = 0;
    save.inProgress.startedAt = startedAt;
    return save;
  }

  /** The same answering shape every time: 4 s on the face-down card, 6 s on the question. */
  function playOut(save, t0) {
    let t = t0;
    while (state.targetsLeft(save) > 0) {
      t += 4000;
      state.call(save, state.callsFor(save)[0], { now: t, ms: 4000 });
      t += 6000;
      state.answer(save, CLEAR, { now: t, ms: 6000 });
    }
    return state.endJob(save, { now: t, ms: 0, day: DAY });
  }

  test('`startJob` re-stamps the clock when it adopts a page nobody has answered into', () => {
    const save = unplayedPage(4, PAGE_AT);
    assert.equal(state.pageInProgress(save), null, 'this page is not the one the guard admits');
    state.startJob(save, { now: OPEN_AT, day: DAY });
    assert.equal(save.inProgress.startedAt, OPEN_AT,
      'the session is measured from a clock that started before it did');
  });

  test('…and the printed split is the same number the session without the gap prints', () => {
    const probe = unplayedPage(4, PAGE_AT);
    state.startJob(probe, { now: OPEN_AT, day: DAY });
    const withGap = playOut(probe, OPEN_AT);

    const control = unplayedPage(4, OPEN_AT);     // identical, opened the instant it was composed
    state.startJob(control, { now: OPEN_AT, day: DAY });
    const noGap = playOut(control, OPEN_AT);

    assert.equal(withGap.answered, noGap.answered, 'the two sessions are not the same session');
    assert.equal(withGap.split, noGap.split,
      `a 2-minute detour before the session moved the printed share: ${withGap.split} % vs ${noGap.split} %`);
    /* and it is the true share: 4 s of the 10 s each question takes */
    assert.equal(noGap.split, 40, `the shape is 40 % game and the meter printed ${noGap.split} %`);
  });

  test('an overnight gap does not print 0 %', () => {
    const save = unplayedPage(4, OPEN_AT - 43_200_000);
    state.startJob(save, { now: OPEN_AT, day: DAY });
    assert.equal(playOut(save, OPEN_AT).split, 40);
  });

  test('a LIVE session is never re-stamped: the clock survives a killed tab', () => {
    const save = rig({ len: 4 });
    save.inProgress.startedAt = PAGE_AT;
    state.call(save, state.callsFor(save)[0], { now: PAGE_AT + 4000, ms: 4000 });
    /* the tab dies; the screen reopens and `startJob` finds the record still there */
    const g = state.startJob(save, { now: PAGE_AT + 600_000, day: DAY });
    assert.equal(save.inProgress.startedAt, PAGE_AT, 'a resumed session was given a fresh clock');
    assert.equal(g.tGame, 4000, 'the resumed session lost what it had measured');
  });

  test('a page composed BY the session is stamped at the session, as it always was', () => {
    const save = rig({ len: 4 });
    delete save.inProgress.game;
    delete save.inProgress.startedAt;
    state.startJob(save, { now: OPEN_AT, day: DAY });
    assert.equal(save.inProgress.startedAt, OPEN_AT);
  });
});
