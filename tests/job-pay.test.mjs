// tests/job-pay.test.mjs — CUT-SPEC §7, the eight requirements and the ninth, against the SHIPPED
// payoff table (`site/js/job/pay.js`), the SHIPPED hit rate (`site/js/job/call.js`) and the SHIPPED
// copy (`site/data/job.js`).
//
// AUTHORITY: designs/CUT-BRIEF.md ("Math the design must satisfy, and prove with tests"), then
// designs/CUT-SPEC.md §7; BUILD-POLICY.md overrides both.
//
// WHY THIS FILE IS SHAPED THE WAY IT IS. The layer this replaced shipped tests that could not fail:
// they re-declared the payoff numbers at the top of the test and then proved the copy consistent
// with itself. Every number below is IMPORTED. The literal table appears exactly once — in "the
// shipped table is CUT-SPEC §2's table" — and every other assertion derives from `PAYS`, `COSTS`,
// `offered`, `payOf`, `costOf`, `honestCall` and `MULT_MAX` as the app has them. Break the module and
// this file goes red; every negative control is recorded in notes/cut-engine.md.
//
// THE STATE SPACE IS ENUMERATED, NOT SAMPLED. `reachable(T)` is a breadth-first search from
// `(pile 0, ×1)` over every legal move — each offered call, each outcome, and the bank that is always
// available — so "0 violations" below means 0 over the whole space, not 0 over a lucky draw.
//
// EXACT ARITHMETIC. Expected points are compared as INTEGERS. On the grid `q = k/2000` the expected
// value of a call is `(k·pay − (2000−k)·cost)/2000`, so the numerator is an integer and the two band
// edges (q = 2/3 and q = 4/5) are decided exactly rather than within a tolerance.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CALLS, PAYS, COSTS, MULT_MAX, BASE_PAY,
  mult, offered, canCall, decides, payOf, costOf, honestCall, BANDS, shouldPush,
} from '../site/js/job/pay.js';
import { qHatDetail, qHatFor, sealedCallOf, QHAT_WINDOW } from '../site/js/job/call.js';
import { COPY, QHAT, SPLIT, IN_PROGRESS_KEYS } from '../site/data/job.js';
/* THE SHIPPED MACHINE. #5 and "Ninth" are properties of the questions the app actually asks — a
   queue that GROWS when a review is missed, and a page that deals Variants as well as cards — so
   they are proved by driving `job/state.js` over a real page, not by a model of it written here.
   Everything else in this file still runs on the table alone. */
import * as state from '../site/js/job/state.js';

const src = (p) => readFileSync(fileURLToPath(new URL(`../site/${p}`, import.meta.url)), 'utf8');
/** …with the prose removed. A comment cannot read a clock, and it must not be able to pass for code. */
const code = (p) => src(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/* ==========================================================================================
   The state space, from the shipped table alone
   ========================================================================================== */

const [NS, PS, SURE] = CALLS;
const rawCost = (c, m) => COSTS[c] * m;              // the call's own bite, before the share
/**
 * THE SHARE the table adds to every call's price above its own biggest bite, read OFF THE SHIPPED
 * MODULE rather than re-derived: at any pile of 2 or more the cheapest call is never capped, so
 * whatever `costOf` charges beyond `COSTS['not sure']` is the share, and the tests below prove it
 * is the same number for all three calls at every reachable state.
 */
const shareAt = (P) => (P >= COSTS[NS] ? costOf(NS, 1, P) - COSTS[NS] : 0);
/** The FULL price of a call — bite + share, before the pile caps it. */
const fullCost = (c, m, P) => rawCost(c, m) + shareAt(P);
const up = (P, m, c) => [P + payOf(c, m), Math.min(MULT_MAX, m + 1)];
const down = (P, m, c) => [P - costOf(c, m, P), 1];

/** Every `(pile, streak)` a session of `T` questions can reach from (0, ×1). */
function reachable(T) {
  const seen = new Map([['0,1', [0, 1]]]);
  let cur = [[0, 1]];
  for (let t = 0; t < T; t++) {
    const next = [];
    for (const [P0, m0] of cur) {
      // bank is always available and never required, so both (P0,m0) and (0,1) are live
      for (const [P, m] of [[P0, m0], [0, 1]]) {
        for (const c of offered(P, m)) {
          for (const s of [up(P, m, c), down(P, m, c)]) {
            const k = `${s[0]},${s[1]}`;
            if (!seen.has(k)) { seen.set(k, s); next.push(s); }
          }
        }
      }
    }
    cur = next;
  }
  return [...seen.values()];
}

const T12 = reachable(12);
const CAP12 = Math.max(...T12.map(([P]) => P));

/**
 * EV numerator on the grid q = k/D: `k·pay − (D−k)·cost`, an integer. The cost is the FULL price at
 * this pile — bite plus share — because that is what a wrong answer takes, and on an offered call
 * the cap never binds (proved below), so it is also exactly `costOf`.
 */
const D = 2000;
const evNum = (c, m, P, k) => k * payOf(c, m) - (D - k) * fullCost(c, m, P);

/** argmax over the offered calls at `(P,m)` on the grid, ties to the CHEAPER call. */
function bestOffered(P, m, k) {
  const off = offered(P, m);
  let best = off[0], bestN = evNum(off[0], m, P, k), tie = false;
  for (let i = 1; i < off.length; i++) {
    const n = evNum(off[i], m, P, k);
    if (n > bestN) { best = off[i]; bestN = n; tie = false; } else if (n === bestN) tie = true;
  }
  return { best, tie, off };
}

/** The honest call, dropped to the biggest one the pile can cover. */
const honestHere = (q, P, m) => {
  const off = offered(P, m);
  const want = honestCall(q);
  const top = off[off.length - 1];
  return CALLS.indexOf(want) < CALLS.indexOf(top) ? want : top;
};

/* ==========================================================================================
   §2 — the shipped table. The ONE place a literal number appears.
   ========================================================================================== */

describe('CUT-SPEC §2 — the shipped table', () => {
  test('the three calls, their pays and their costs are CUT-SPEC §2 exactly', () => {
    assert.deepEqual([...CALLS], ['not sure', 'pretty sure', 'sure']);
    assert.deepEqual({ ...PAYS }, { 'not sure': 8, 'pretty sure': 9, sure: 10 });
    assert.deepEqual({ ...COSTS }, { 'not sure': 2, 'pretty sure': 4, sure: 8 });
    assert.equal(MULT_MAX, 5);
    assert.equal(BASE_PAY, PAYS[NS], 'the base pay is what the question after a bank pays');
  });

  test('the gate: not sure is always offered, the others only at full price', () => {
    for (let m = 1; m <= MULT_MAX; m++) {
      for (let P = 0; P <= 8 * m + 2; P++) {
        const off = offered(P, m);
        assert.equal(off[0], NS, `not sure must be offered at pile ${P} ×${m}`);
        assert.equal(off.includes(PS), P >= COSTS[PS] * m, `pretty sure at pile ${P} ×${m}`);
        assert.equal(off.includes(SURE), P >= COSTS[SURE] * m, `sure at pile ${P} ×${m}`);
        // greyed, never hidden: `canCall` is the screen's enable bit, and it agrees with `offered`
        for (const c of CALLS) assert.equal(canCall(c, P, m), off.includes(c));
      }
    }
  });

  test('one right answer opens the second call, two open the third', () => {
    const [p1, m1] = up(0, 1, NS);
    assert.deepEqual(offered(p1, m1), [NS, PS], `pile ${p1} ×${m1} after one right answer`);
    const [p2, m2] = up(p1, m1, NS);
    assert.deepEqual(offered(p2, m2), [NS, PS, SURE], `pile ${p2} ×${m2} after two`);
  });

  test('minimum pile by streak is 0, 8, 24, 48, 80', () => {
    const mins = [];
    for (let m = 1; m <= MULT_MAX; m++) mins.push(Math.min(...T12.filter(([, k]) => k === m).map(([P]) => P)));
    assert.deepEqual(mins, [0, 8, 24, 48, 80]);
  });

  test('the streak caps at ×5 and the price caps with it', () => {
    assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(mult), [1, 2, 3, 4, 5, 5, 5]);
    for (const c of CALLS) {
      assert.equal(payOf(c, MULT_MAX + 1), payOf(c, MULT_MAX), `${c} must not price above ×${MULT_MAX}`);
      assert.equal(costOf(c, MULT_MAX + 4, 400), costOf(c, MULT_MAX, 400));
    }
    assert.deepEqual(offered(10000, 99), offered(10000, MULT_MAX));
  });

  test('THE SHARE: the bite below 40, and half of every point above it', () => {
    /* ROUND 1 (player-feel, blocker). The flat table's `q* = cost/(cost + pay − 8)` held no pile
       term at all, so the bank decision at pile 8 and at pile 600 was the same decision and the
       button could be ignored for nothing. The loss now grows with the pile — and the LITERAL rule
       appears here, once, exactly as the payoff table above does. */
    const RISK_FROM = COSTS[SURE] * MULT_MAX;                       // the biggest bite the table can take
    assert.equal(RISK_FROM, 40);
    for (let P = 0; P <= 400; P++) {
      const want = P > RISK_FROM ? Math.floor((P - RISK_FROM) / 2) : 0;
      for (const c of CALLS) for (let m = 1; m <= MULT_MAX; m++) {
        assert.equal(costOf(c, m, P), Math.min(P, COSTS[c] * m + want), `${c} ×${m} at pile ${P}`);
      }
    }
    // BELOW 40 THIS IS THE FLAT TABLE, unchanged — which is why every §2 claim above still holds
    for (let P = 0; P <= RISK_FROM; P++) for (const c of CALLS) for (let m = 1; m <= MULT_MAX; m++) {
      assert.equal(costOf(c, m, P), Math.min(P, rawCost(c, m)), `${c} ×${m} at pile ${P}`);
    }
    // …and ABOVE it a wrong answer takes a share a student can feel: half of the pile over 40
    assert.equal(costOf(NS, 1, 200), 2 + 80);
    assert.equal(costOf(SURE, MULT_MAX, 200), 40 + 80);
    assert.equal(costOf(SURE, MULT_MAX, 600), 40 + 280);
  });

  test('the share is THE SAME for every call, which is what pins the bands to the pile', () => {
    /* The share cancels in every comparison between two calls, so the band edges are the cost GAPS
       and nothing else — at every pile. A share that differed by call would move the edges with the
       pile and make the three lines Settings prints false. */
    let pairs = 0;
    for (const [P, m] of T12) {
      for (const a of CALLS) for (const b of CALLS) {
        if (a === b) continue;
        if (!offered(P, m).includes(a) || !offered(P, m).includes(b)) continue;
        pairs++;
        assert.equal(costOf(b, m, P) - costOf(a, m, P), (COSTS[b] - COSTS[a]) * m,
          `the gap between ${a} and ${b} moved at pile ${P} ×${m}`);
      }
    }
    assert.ok(pairs > 3000, `the sweep must be the state space, not a sample (${pairs})`);
  });

  test('a cost with no pile is the cost at an empty pile, which is nothing', () => {
    /* The `Infinity` sentinel — "no pile to cap against" — is GONE with the flat price it named:
       the cost depends on the pile now, so there is no such number as this call's cost at an
       unknown pile, and a loss can only ever come out of the pile (CUT-BRIEF math #8). */
    for (const c of CALLS) for (let m = 1; m <= MULT_MAX; m++) {
      assert.equal(costOf(c, m), 0, 'a missing pile is an empty pile');
      assert.equal(costOf(c, m, NaN), 0, 'a missing pile is an empty pile');
      assert.equal(costOf(c, m, Infinity), 0, 'and so is a pile that is not a number of points');
      assert.equal(costOf(c, m, -5), 0, 'a pile is never negative');
      assert.equal(costOf(c, m, 1), 1, 'a pile of one point loses one point, whatever was called');
    }
  });

  test('the cap never binds on an offered call that sits beside an alternative', () => {
    const capped = T12.filter(([P, m]) => offered(P, m).some((c) => fullCost(c, m, P) > P));
    const besideAnAlternative = capped.filter(([P, m]) => offered(P, m).length > 1);
    assert.equal(besideAnAlternative.length, 0,
      `a capped price was comparable with another call at ${JSON.stringify(besideAnAlternative)}`);
    // …and the only two states where it binds at all offer one call, so no comparison is made.
    assert.deepEqual(capped.map(([P, m]) => `${P},${m}`).sort(), ['0,1', '1,1']);
    // THE GATE IS THE FLAT GATE, at every pile and every streak — which is what keeps the ladder,
    // the minimum piles and the number of calls on the table exactly where CUT-SPEC §2 puts them.
    // (A share that started below 40 would close the gate on the bigger calls and leave a student
    // tapping the only button on the table.)
    for (let P = 0; P <= 2000; P++) for (let m = 1; m <= MULT_MAX; m++) {
      assert.deepEqual(offered(P, m), CALLS.filter((c, i) => i === 0 || P >= rawCost(c, m)),
        `the offer gate moved at pile ${P} ×${m}`);
    }
    // THE SIZE OF THE STATE SPACE IS ITSELF PUBLISHED (CUT-SPEC §2), so it is pinned here. It used
    // to be quoted as `reachable(14)` — a session length the brief does not allow (8–12 questions).
    // Both counts fell when the share arrived: a loss that scales with the pile lands on fewer
    // distinct piles than a flat one, which is the same fact as "the pile is worth protecting".
    assert.equal(T12.length, 1222, 'the reachable state space, enumerated at T = 12');
    assert.equal(reachable(14).length, 1522, 'and the longer horizon, so the two cannot be confused');
  });
});

/* ==========================================================================================
   §7 #1 — honest calling wins
   ========================================================================================== */

describe('CUT-SPEC §7 #1 — honest calling wins', () => {
  test('argmax over the offered calls is the honest call, every reachable state × q', () => {
    let cells = 0, bad = 0, ties = 0;
    const examples = [];
    for (let k = 1000; k <= 1980; k++) {             // q ∈ [0.50, 0.99] step 0.0005
      const q = k / D;
      for (const [P, m] of T12) {
        cells++;
        const { best, tie } = bestOffered(P, m, k);
        const want = honestHere(q, P, m);
        if (best !== want) { bad++; if (examples.length < 4) examples.push({ q, P, m, best, want }); }
        if (k === 1600 && tie) ties++;
      }
    }
    assert.equal(bad, 0, `${bad} of ${cells} cells called something other than the honest call: ${JSON.stringify(examples)}`);
    assert.equal(cells, 981 * T12.length);
    assert.equal(cells, 1198782, 'the grid is 981 rates × 1 222 reachable states');
    assert.equal(ties, 1206, 'the only ties are at q = 0.8, where pretty sure and sure are genuinely equal');
  });

  test('…and the pile cannot change which call that is, at any rate', () => {
    /* The share is in every price, so it is in none of the comparisons. This is the assertion that
       lets Settings print three fixed bands while the LOSS grows with the pile: at a fixed streak
       and rate, the best call is the same call at every reachable pile that offers it. */
    let rows = 0;
    for (let k = 1000; k <= 1980; k += 7) for (let m = 1; m <= MULT_MAX; m++) {
      const piles = T12.filter(([, mm]) => mm === m).map(([P]) => P);
      const full = piles.filter((P) => offered(P, m).length === CALLS.length);
      if (full.length < 2) continue;
      rows++;
      const first = bestOffered(full[0], m, k).best;
      for (const P of full) {
        assert.equal(bestOffered(P, m, k).best, first,
          `at ×${m}, q = ${k / D}, the pile changed the best call (${P} vs ${full[0]})`);
      }
    }
    assert.ok(rows > 500, `the sweep must be the grid, not a sample (${rows} rate × streak rows)`);
  });

  test('the ties at q = 0.8 are real, and the edge takes the lower call', () => {
    const k = 0.8 * D;
    assert.equal(evNum(PS, 1, 0, k), evNum(SURE, 1, 0, k), 'pretty sure and sure must be equal at q = 4/5');
    assert.equal(evNum(PS, 1, 600, k), evNum(SURE, 1, 600, k), '…at a pile that is mostly share, too');
    assert.equal(honestCall(0.8), PS, 'a tie at an edge takes the LOWER call');
    assert.equal(honestCall(2 / 3), NS, 'and so does the other edge');
    assert.equal(honestCall(2 / 3 + 1e-9), PS);
    assert.equal(honestCall(0.8 + 1e-9), SURE);
    assert.equal(honestCall(null), NS, 'a rate the app has never measured is not a reason to spend');
  });
});

/* ==========================================================================================
   r4 — THE CARD THAT ASKS NOTHING (player-feel, major)

   The first idea of the design is that you bid on yourself before you see the question. On the
   first card of every session there was no bid to make and the student was made to tap anyway:
   `offered(0, ×1)` is `['not sure']` alone, bank is dead at an empty pile, and the question would
   not appear until the one live control with one possible value had been pressed. Screenshotted on
   the first card of two sessions (`0 pile · ×1 streak · new`), and it recurs after every bank and
   after any miss that empties the pile — simulated over the shipped table, 40.5 % of the cards of a
   q = 0.60 session and 11.8 % of a q = 0.95 one, so the weaker the student the more of the game was
   a control that bought nothing.

   `decides` is the table's own answer, and the fix is subtractive: where it is false the screen
   locks the only call there is and shows the question (`screens/job.js renderCall`). Nothing is
   added — no mechanic, no number, no control, no state — and one tap comes off the question.
   ========================================================================================== */

describe('r4 — a card with nothing to decide on it is not a question the game asks', () => {
  test('`decides` is false exactly where the table offers one call and the pile is empty', () => {
    for (let m = 1; m <= MULT_MAX; m++) {
      assert.equal(decides(0, m), false, `an empty pile asked something at ×${m}`);
      assert.deepEqual(offered(0, m), [NS], 'an empty pile offered more than the cheapest call');
    }
    /* …and nowhere else. Every reachable state with a pile in it DECIDES: either the table offers a
       second call, or bank does — and bank is a decision the design's own §4 gets right at ×1. */
    for (const [P, m] of T12) {
      assert.equal(decides(P, m), P > 0 || offered(P, m).length > 1);
      if (!decides(P, m)) assert.equal(P, 0, `a pile of ${P} was treated as nothing to decide`);
    }
    // a junk pile is an empty one, and the predicate never throws
    for (const junk of [null, undefined, NaN, -5, '3', Infinity]) {
      assert.equal(typeof decides(junk, 1), 'boolean');
    }
    assert.equal(decides(-5, 1), false);
    assert.equal(decides('3', 1), true);
  });

  test('the student loses no choice: where it asks nothing, the only call IS the best call', () => {
    /* The card is skipped, not decided for him. At an empty pile the offered set is a singleton, so
       the call the screen locks is the argmax over everything he could have picked — at every rate
       on the grid, and at every streak. */
    for (let m = 1; m <= MULT_MAX; m++) {
      for (let k = 0; k <= D; k += 5) {
        const { best, tie } = bestOffered(0, m, k);
        assert.equal(best, NS, `at q = ${k / D} ×${m} the locked call was not the best one`);
        assert.equal(tie, false, 'a singleton offer cannot tie with anything');
      }
    }
    // and it is the call the app would have called honest for a student it has never measured
    assert.equal(honestCall(null), offered(0, 1)[0]);
  });

  test('nothing about the gate moved: `offered`, `canCall` and the ladder are what they were', () => {
    assert.deepEqual(offered(0, 1), [NS]);
    assert.deepEqual(offered(4, 1), [NS, PS]);
    assert.deepEqual(offered(8, 1), [NS, PS, SURE]);
    assert.equal(canCall(NS, 0, 1), true, 'the only call must still be playable at an empty pile');
    assert.equal(canCall(SURE, 0, 1), false);
    for (const [P, m] of T12) {
      for (const c of CALLS) assert.equal(canCall(c, P, m), offered(P, m).includes(c));
    }
  });
});

/* ==========================================================================================
   r5 — THE EMPTY PILE IS NOT A BUILD DECISION, IT IS CUT-BRIEF'S OWN ARITHMETIC

   `notes/cut-screen.md` round 5, finding 3, filed the one thing about this loop that no round has
   been able to close: **the first surviving idea of the brief — "you bid on yourself before you see
   the question" — is absent from question 1 of every session, and from a large share of the rest.**
   Round 4 made the absence VISIBLE (where `decides` is false no card is drawn, so the dead tap went
   too); it did not make it smaller, and it could not.

   The block above proves the rule is applied consistently. This one proves WHY THE RULE EXISTS, so
   that the next round cannot mistake it for a shortfall and "fix" it with a mechanic:

     CUT-BRIEF math #8 — "losses come only from the unbanked pile and it floors at zero" — makes
     every call FREE at an empty pile. A free call is worth `q · pay`, which is maximised by the
     biggest `pay` at every hit rate above zero. So if all three calls were offered there, ONE call
     would be optimal everywhere and CUT-BRIEF math #2 ("each call uniquely optimal on a non-empty
     band") would be false. At an empty pile the brief's first idea and the brief's own math cannot
     both hold, and the build keeps the math.

   That is not an argument from the shipped numbers: it holds for ANY table whose pays differ, which
   they must, or the three calls are one call. The assertions below run it on the shipped one.

   THE SIZE OF IT IS MEASURED, NOT ASSERTED. The share of a twelve-question session that arrives at
   an empty pile is an exact forward distribution over the shipped table — no sampling — for the two
   policies the app can be played with, and it is pinned to a tenth of a point at both ends so the
   figure in `notes/cut-integrate-r5.md` (and any escalation built on it) cannot go stale quietly.
   ========================================================================================== */

describe('r5 — why there is nothing to bid on at an empty pile, and what it costs the session', () => {
  test('math #8 makes every call free at an empty pile, so the biggest pay wins at every rate', () => {
    for (let m = 1; m <= MULT_MAX; m++) {
      for (const c of CALLS) {
        assert.equal(costOf(c, m, 0), 0, `${c} at ×${m} could take something out of an empty pile`);
      }
      /* the argmax over ALL THREE calls — not just the offered ones — at every rate on the grid */
      for (let k = 1; k <= D; k += 5) {
        let best = CALLS[0];
        for (const c of CALLS) if (k * payOf(c, m) > k * payOf(best, m)) best = c;
        assert.equal(best, SURE, `at q = ${k / D}, ×${m}, the free table preferred ${best}`);
      }
    }
    /* …so a card that offered all three would break #2: one call would own the whole line. The
       gate is what keeps that off the table, and `decides` is what keeps the card off the screen. */
    for (let m = 1; m <= MULT_MAX; m++) {
      assert.deepEqual(offered(0, m), [NS]);
      assert.equal(decides(0, m), false);
    }
  });

  test('question 1 of every session is one of them, always', () => {
    assert.equal(decides(0, 1), false, 'a session opens at an empty pile, by construction');
    assert.deepEqual(offered(0, 1), [NS]);
  });

  /**
   * The exact forward distribution over `(pile, streak)` for `T` questions at true rate `q`,
   * counting the weight that ARRIVES at a state with nothing to decide. The student calls honest
   * (dropped to what the pile covers, `honestHere`) and, in the `bank` arm, banks by CUT-SPEC §4 —
   * the SHIPPED `shouldPush`, on the rate he is actually right at, priced on the call he is about
   * to make. Banking happens ON the face-down card, so the card is counted at the state the
   * question ARRIVES in, before anything is banked.
   */
  function noCardShare(q, { bank }) {
    const N = 10_000;                     // §4's `h of n` at the true rate, exactly
    let dist = new Map([['0,1', 1]]);
    let noCard = 0;
    for (let t = 0; t < 12; t++) {
      const next = new Map();
      for (const [key, w] of dist) {
        const [P0, m0] = key.split(',').map(Number);
        if (!decides(P0, m0)) noCard += w;
        let P = P0; let m = m0;
        if (bank && decides(P, m)) {
          const c0 = honestHere(q, P, m);
          const push = shouldPush({ hits: Math.round(q * N), of: N, pay: payOf(c0, m), cost: costOf(c0, m, P) });
          if (!push) { P = 0; m = 1; }
        }
        const c = honestHere(q, P, m);
        for (const [[P1, m1], p] of [[up(P, m, c), q], [down(P, m, c), 1 - q]]) {
          const k = `${P1},${m1}`;
          next.set(k, (next.get(k) || 0) + w * p);
        }
      }
      dist = next;
    }
    return (100 * noCard) / 12;
  }

  test('how much of a twelve-question session that is, exactly', () => {
    const pin = (q, bank) => noCardShare(q, { bank }).toFixed(1);
    /* never banks — the student pushes every pile he builds */
    assert.equal(pin(0.35, false), '30.8', 'q = 0.35, never banks');
    assert.equal(pin(0.99, false), '8.5', 'q = 0.99, never banks');
    /* banks by §4 — the policy the design itself calls right */
    assert.equal(pin(0.35, true), '49.4', 'q = 0.35, banks by §4');
    assert.equal(pin(0.99, true), '8.5', 'q = 0.99, banks by §4');
    /* the shape of it: it is worst for the weakest student, under either policy, and it never
       reaches zero — question 1 is always one of them */
    for (const bank of [false, true]) {
      const weak = noCardShare(0.35, { bank });
      const strong = noCardShare(0.99, { bank });
      assert.ok(weak >= strong, `banking ${bank}: the weaker student saw fewer bidless questions`);
      assert.ok(strong >= 100 / 12 - 1e-9, 'question 1 alone is a twelfth of the session');
    }
  });
});

/* ==========================================================================================
   §7 #2 — no dominant call
   ========================================================================================== */

describe('CUT-SPEC §7 #2 — no dominant call', () => {
  test('the band edges follow from the cost GAPS, exactly', () => {
    // CUT-SPEC §7 #2: "Assert Δcost = 2·Δpay then 4·Δpay, not a tolerance on the crossing."
    const dPay = (a, b) => PAYS[b] - PAYS[a];
    const dCost = (a, b) => COSTS[b] - COSTS[a];
    assert.equal(dCost(NS, PS), 2 * dPay(NS, PS), 'not sure → pretty sure crosses at q = 2/3');
    assert.equal(dCost(PS, SURE), 4 * dPay(PS, SURE), 'pretty sure → sure crosses at q = 4/5');
    assert.equal(dCost(NS, SURE), 3 * dPay(NS, SURE), 'not sure → sure crosses at q = 3/4');
    // …and 3/4 is INSIDE the middle band, which is what keeps the middle call from being dominated.
    assert.ok(2 / 3 < 3 / 4 && 3 / 4 < 4 / 5);
  });

  test('each call owns a non-empty, contiguous band, and the bands are what Settings prints', () => {
    assert.deepEqual(BANDS.map((b) => b.call), [...CALLS], 'a call that is never optimal does not ship');
    assert.deepEqual(BANDS.map((b) => [b.lo, b.hi]), [[0, 2 / 3], [2 / 3, 4 / 5], [4 / 5, 1]]);
    for (const b of BANDS) assert.ok(b.hi > b.lo, `${b.call} owns an empty band`);
    for (let i = 1; i < BANDS.length; i++) assert.equal(BANDS[i].lo, BANDS[i - 1].hi, 'the bands must be contiguous');
    // every band interior calls its own call, on the shipped table
    for (const b of BANDS) {
      for (let s = 1; s <= 9; s++) {
        const q = b.lo + ((b.hi - b.lo) * s) / 10;
        assert.equal(honestCall(q), b.call, `q = ${q} is inside ${b.call}'s band`);
        const k = Math.round(q * D);
        if (k * 1 === q * D) assert.equal(bestOffered(CAP12, 1, k).best, b.call, `argmax at q = ${q}`);
      }
    }
  });

  test('every call, and bank, is the uniquely best move somewhere a student can be', () => {
    // The optimal policy is computed by backward induction over the whole state space, so "bank is
    // sometimes right" is a fact about the game, not about a heuristic.
    const wins = { [NS]: 0, [PS]: 0, [SURE]: 0, bank: 0, tie: 0 };
    let cells = 0;
    for (let i = 0; i <= 49; i++) {
      const q = 0.5 + i * 0.01;
      const V = solveDP(q, 12, CAP12);
      for (const [P, m] of T12) {
        cells++;
        const a = bestMove(V, q, 6, P, m, CAP12);
        wins[a] += 1;
      }
    }
    /* Banking is now the best move in most CELLS — it is right whenever the pile is worth more than
       the streak on it, and most of the reachable space is big piles a student would already have
       banked. So the calls are raced against each other where a call is the right move at all, and
       bank is measured on its own. (Neither share is a policy: `always-bank` scores 0.24 of the
       optimum at q = 0.95 below, and `never-bank` 0.75 at q = 0.50.) */
    const played = wins[NS] + wins[PS] + wins[SURE];
    for (const k of [NS, PS, SURE]) {
      assert.ok(wins[k] / played > 0.05,
        `${k} is uniquely optimal in only ${(100 * wins[k] / played).toFixed(1)} % of the cells where a call is`);
    }
    assert.ok(wins.bank / cells > 0.05, `bank is uniquely optimal in only ${(100 * wins.bank / cells).toFixed(1)} % of states`);
    assert.ok(wins.tie / cells < 0.05, 'ties must be the exception, not the rule');
    // THE SHARES ARE PUBLISHED (CUT-SPEC §7 #2), so they are pinned to the digit. A `> 5 %` floor
    // alone let the spec quote four figures this loop has never produced.
    assert.equal(cells, 50 * T12.length);
    const share = Object.fromEntries(Object.entries(wins).map(([k, v]) => [k, (100 * v / cells).toFixed(1)]));
    assert.deepEqual(share, {
      [NS]: '4.7', [PS]: '5.7', [SURE]: '17.5', bank: '72.0', tie: '0.1',
    });
    assert.deepEqual(CALLS.map((c) => (100 * wins[c] / played).toFixed(1)), ['16.7', '20.5', '62.8'],
      'the shares among the cells where a call is the right move');
  });
});

/* ==========================================================================================
   §7 #3 — no dominant bank/push
   ========================================================================================== */

/** The §4 rule's indifference rate: `q* = cost / (cost + pay − 8)`. */
function qStar(c, m, P) {
  const cost = costOf(c, m, P);
  const gain = payOf(c, m) - BASE_PAY;
  return cost + gain === 0 ? 1 : cost / (cost + gain);
}

/** The lowest hit rate at which SOME call the pile can cover beats banking — the threshold a
 *  student actually faces, which is `q*` minimised over the calls on the table. */
const bestThreshold = (P, m) => Math.min(...offered(P, m).map((c) => qStar(c, m, P)));

describe('CUT-SPEC §7 #3 — no dominant bank/push', () => {
  /* ROUND 1, TWO LANES, ONE QUESTION — recorded because the file changed hands mid-round.
     The assertion that used to stand here (`q*(c, m, P+1) >= q*(c, m, P)`, counting violations)
     COULD NOT FAIL: every compared pair was exactly EQUAL, because the flat table's
     `q* = cost/(cost + pay − 8)` held no pile term at all. Two answers were possible: take the
     claim down, or make it true. The claim is CUT-BRIEF's, and CUT-BRIEF is the authority —
     math #3 says the threshold "moves with the streak and the pile", and the feel section promises
     "the bank decision getting harder. As the pile grows the tension is real". The player who
     actually sat with the flat table found the opposite: banking was right only at ×1, and never
     touching the button cost a student who is right 4 times in 5 exactly nothing (`never` scored
     1.0000 of the optimum at q ≥ 0.80).
     So the TABLE moved, not the brief: a wrong answer now takes the call's bite plus half the pile
     above 40 (`job/pay.js`). Everything the other answer was protecting survives it — the share is
     the same for all three calls, so the band edges are untouched at every pile (§7 #1 and #2
     above); the gate is the flat gate, so the ladder and the number of calls on the table are
     unchanged (§2 above); the loss is still capped at the pile, so #8 is untouched (below); and a
     student is shown no new number, asked for no new tap and taught no new word.
     The three tests below are the claim, made to fail if the pile ever stops being priced. */

  test('the push threshold falls with the streak — strictly, at every reachable pile', () => {
    const key = new Set(T12.map(([P, m]) => `${P},${m}`));
    let steps = 0, notStrict = 0;
    for (const [P, m] of T12) for (const c of offered(P, m)) {
      if (m < MULT_MAX && key.has(`${P},${m + 1}`) && offered(P, m + 1).includes(c)) {
        steps++;
        if (!(qStar(c, m + 1, P) < qStar(c, m, P))) notStrict++;
      }
    }
    assert.equal(notStrict, 0, `${notStrict} of ${steps} streak steps did not lower the threshold`);
    // the denominator is pinned, not floored: a floor cannot catch a quoted figure drifting
    assert.equal(steps, 2110, 'the streak sweep, enumerated');
    // …and it moves far enough to matter: a longer streak is worth pushing at a much lower rate
    assert.ok(qStar(SURE, 1, 8) > qStar(SURE, MULT_MAX, 80), 'the threshold must move with the streak');
  });

  test('the push threshold RISES with the pile — strictly, wherever pushing can gain anything', () => {
    /* THE FINDING, in its own words: "At pile 8 and at pile 600 the decision is byte-identical."
       It is not any more, and this is the assertion that says so. */
    assert.ok(qStar(SURE, MULT_MAX, 600) > qStar(SURE, MULT_MAX, 80),
      'a bigger pile must be harder to push');

    const key = new Set(T12.map(([P, m]) => `${P},${m}`));
    let steps = 0, fell = 0, rose = 0;
    for (const [P, m] of T12) for (const c of offered(P, m)) {
      if (!key.has(`${P + 1},${m}`) || !offered(P + 1, m).includes(c)) continue;
      steps++;
      const d = qStar(c, m, P + 1) - qStar(c, m, P);
      if (d < -1e-15) fell++; else if (d > 0) rose++;
    }
    assert.equal(fell, 0, `${fell} of ${steps} pile steps LOWERED the threshold`);
    assert.equal(steps, 3628, 'the pile sweep, enumerated');
    assert.equal(rose, 1593, 'and this many single points of pile moved it on their own');

    /* THE TEST THE OLD SWEEP WAS STANDING IN FOR: how many DISTINCT thresholds a (call, streak)
       takes across the piles a student can reach. It was 1 on all fifteen rows — one number, learnt
       once, for the whole game. A constant cannot pass this. */
    const rows = [];
    for (let m = 1; m <= MULT_MAX; m++) for (const c of CALLS) {
      const piles = [...new Set(T12.filter(([, mm]) => mm === m).map(([P]) => P)
        .filter((P) => offered(P, m).includes(c)))].sort((a, b) => a - b);
      rows.push({ c, m, piles, distinct: new Set(piles.map((P) => qStar(c, m, P))).size });
    }
    assert.equal(rows.length, CALLS.length * MULT_MAX);
    for (const r of rows) {
      if (payOf(r.c, r.m) - BASE_PAY === 0) {
        /* THE ONE FLAT ROW, and it is arithmetic, not a table: *not sure* at ×1 pays exactly what
           the question after a bank pays, so pushing it wins nothing at any price and banking is
           right at every rate. A row with nothing to gain has one threshold by definition. */
        assert.deepEqual([r.c, r.m], [NS, 1]);
        assert.equal(r.distinct, 1);
        assert.equal(qStar(r.c, r.m, 600), 1, 'nothing to gain is nothing to push for, at any price');
        continue;
      }
      assert.ok(r.distinct >= 86,
        `${r.c} at ×${r.m} takes only ${r.distinct} thresholds across ${r.piles.length} reachable piles`);
      // and it is a RANGE, not a wobble: the top of the pile is a different decision from the bottom
      assert.ok(qStar(r.c, r.m, r.piles[r.piles.length - 1]) > qStar(r.c, r.m, r.piles[0]) + 0.05,
        `${r.c} at ×${r.m} barely moves across the pile`);
    }
  });

  test('banking is the right move at every streak, not only at ×1', () => {
    /* The flat table's optimal policy banked at ×1 and nowhere else — 14.1 % of cells, every one of
       them at ×1, which is a policy a student learns in one session and then ignores. Over the
       whole reachable space, by backward induction on the SHIPPED table: */
    let cells = 0, bank = 0;
    const byStreak = new Map();
    for (let i = 0; i <= 49; i++) {
      const q = 0.5 + i * 0.01;
      const V = solveDP(q, 12, CAP12);
      for (const [P, m] of T12) {
        if (m < 2) continue;
        cells++;
        const a = bestMove(V, q, 6, P, m, CAP12);
        if (a === 'bank') { bank++; byStreak.set(m, (byStreak.get(m) ?? 0) + 1); }
      }
    }
    assert.equal(cells, 49400, 'the cells at ×2 and up, enumerated');
    assert.equal(bank, 32807, 'how many of them bank is the uniquely best move in');
    for (let m = 2; m <= MULT_MAX; m++) {
      assert.ok((byStreak.get(m) ?? 0) > 1000, `bank is never right at ×${m}`);
    }
    // THE FEEL CLAIM, as a state pair: at ×5 the same student pushes a small pile and banks a big
    // one, and nothing but the pile has changed between the two.
    const q = 0.75;
    const V = solveDP(q, 12, CAP12);
    assert.equal(bestMove(V, q, 6, 80, MULT_MAX, CAP12), honestHere(q, 80, MULT_MAX),
      'a small pile at ×5 is worth pushing, on the honest call');
    assert.equal(bestMove(V, q, 6, 400, MULT_MAX, CAP12), 'bank', 'a big one is worth keeping');
  });

  test('`shouldPush` is CUT-SPEC §4, on the worked examples', () => {
    // A — pile 24, ×3, 7 of 10, pretty sure pays 27 costs 12: 7×19 = 133 > 3×12 = 36 → push
    const payA = payOf(PS, 3), costA = costOf(PS, 3, 24);
    assert.equal(payA, 27); assert.equal(costA, 12);
    assert.equal(7 * (payA - BASE_PAY), 133); assert.equal(3 * costA, 36);
    assert.equal(shouldPush({ hits: 7, of: 10, pay: payA, cost: costA }), true);
    // B — pile 40, ×1, 6 of 10, not sure pays 8 costs 2: 6×0 = 0 > 4×2 = 8 is false → bank
    const payB = payOf(NS, 1), costB = costOf(NS, 1, 40);
    assert.equal(payB, 8); assert.equal(costB, 2);
    assert.equal(shouldPush({ hits: 6, of: 10, pay: payB, cost: costB }), false);
    assert.equal(shouldPush({ hits: 10, of: 10, pay: payB, cost: costB }), false,
      'at ×1 no affordable call beats the free question after a bank');
    assert.equal(shouldPush({ hits: 0, of: 0, pay: payOf(SURE, 5), cost: costOf(SURE, 5, 80) }), false,
      'a skill with no history never argues for a push');
  });

  test('neither never-bank nor always-bank is the right policy, and §4 beats both', () => {
    const rows = [];
    for (const q of [0.35, 0.5, 0.65, 0.8, 0.95]) {
      const opt = solveDP(q, 12, CAP12)[12][1][0];
      rows.push({
        q,
        rule: policyValue(q, 12, CAP12, 'rule') / opt,
        never: policyValue(q, 12, CAP12, 'never') / opt,
        always: policyValue(q, 12, CAP12, 'always') / opt,
      });
    }
    const at = (q) => rows.find((r) => r.q === q);
    /* THE FINDING (player-feel, r1): against the flat table `never` scored 1.0000 of the optimum at
       every q ≥ 0.80 — "ignoring the button entirely costs him nothing". Against the share it costs
       a tenth of the session at q = 0.80 and a quarter at q = 0.50, and the two straw men still
       swap places, which is the requirement. Every figure is pinned, not floored. */
    assert.deepEqual(rows.map((r) => r.never.toFixed(4)), ['0.7224', '0.7509', '0.7837', '0.8942', '0.9981']);
    assert.deepEqual(rows.map((r) => r.always.toFixed(4)), ['0.9404', '0.7346', '0.5703', '0.4126', '0.2416']);
    assert.ok(at(0.8).never < 0.95, `never-bank scores ${at(0.8).never.toFixed(4)} of optimum at q = 0.80`);
    assert.ok(at(0.95).always < 0.25, `always-bank scores ${at(0.95).always.toFixed(4)} of optimum at q = 0.95`);
    // The two straw men SWAP PLACES: a student who is usually wrong should bank every time, and a
    // student who is usually right should never bank. Neither is the policy; that is the requirement.
    assert.ok(at(0.35).always > at(0.35).never,
      `always-bank ${at(0.35).always.toFixed(4)} must beat never-bank ${at(0.35).never.toFixed(4)} at q = 0.35`);
    assert.ok(at(0.95).never > at(0.95).always,
      `never-bank ${at(0.95).never.toFixed(4)} must beat always-bank ${at(0.95).always.toFixed(4)} at q = 0.95`);
    // …and §4 beats BOTH of them at every rate, which neither of them does to the other
    for (const r of rows) {
      assert.ok(r.rule >= r.never - 1e-12 && r.rule >= r.always - 1e-12,
        `§4 (${r.rule.toFixed(4)}) lost to a straw man at q = ${r.q}`);
    }
    assert.deepEqual(rows.map((r) => r.rule.toFixed(4)), ['1.0000', '0.9978', '0.9972', '0.9818', '0.9994']);
  });

  /* WHAT §4 IS, NOW THAT THE PILE IS PRICED — and why the rule did not change with the table.
     `shouldPush` compares ONE question's extra pay against ONE question's risk, and `cost` now
     carries the share, so the rule reads the pile without being told about it: its threshold moves
     exactly as the table does. What it still cannot see is the horizon and the option value of an
     unbanked pile, and against the flat table that blindness happened to cost nothing above
     q = 1/3. Against the share it costs a little: the rule is within 4.3 % of the optimum
     everywhere on [0.50, 0.99], and the worst cell is pinned below.
     THE RULE IS NOT PRINTED, EVER (CUT-SPEC §4: "the app must never advise"), and it is not
     executed by the app either — `shouldPush` has no caller under `site/`. It exists so these
     tests can hold the design to a bank/push tension that is real. Teaching it a lookahead to buy
     back 4 % on a surface no student ever sees is exactly the re-inflation CUT-BRIEF forbids. */
  test('the §4 rule is near-optimal at every session length the brief allows, and the floor is pinned', () => {
    const ratioAt = (q, T) => {
      const cap = Math.max(...reachable(T).map(([P]) => P));
      return policyValue(q, T, cap, 'rule') / solveDP(q, T, cap)[T][1][0];
    };
    for (const T of [8, 10, 14]) {
      for (const q of [0.55, 0.75, 0.9]) {
        assert.ok(ratioAt(q, T) > 0.95, `T = ${T}, q = ${q}: §4 scored ${ratioAt(q, T).toFixed(4)}`);
      }
    }
    assert.deepEqual([8, 10, 14].map((T) => ratioAt(0.75, T).toFixed(4)), ['1.0000', '0.9942', '0.9956']);
    // the worst cell on the whole grid, and where it is
    let worst = 2, at = null;
    for (let k = 50; k <= 99; k++) {
      const r = ratioAt(k / 100, 12);
      if (r < worst) { worst = r; at = k / 100; }
    }
    assert.equal(worst.toFixed(4), '0.9574', 'the §4 rule against the optimum, at its worst');
    assert.equal(at, 0.81, 'and the rate it happens at');
    assert.ok(worst > 0.95, 'the rule must stay within 5 % of the optimum everywhere');
  });

  test('both policies are a THRESHOLD in the pile, and both thresholds climb with the streak', () => {
    /* The point of #3 is that there is a decision here at all. At one rate and one horizon, the
       pile each policy switches at — §4 (which sees one question) and the optimum (which sees the
       whole session) — is measured and pinned. Both switch; neither is constant; both push a
       longer streak further, which is the tension the strip is supposed to make you feel.
       §4 banks LATE, and that is the 4 % recorded above: it cannot see that the questions left are
       worth more than this one's extra pay. It is not printed, so it costs a student nothing. */
    const q = 0.75;
    const V = solveDP(q, 12, CAP12);
    const ruleBanks = (P, m) => !shouldPush({
      hits: Math.round(q * 1e5), of: 1e5, pay: payOf(honestHere(q, P, m), m), cost: costOf(honestHere(q, P, m), m, P),
    });
    const edges = (pick) => {
      const out = [];
      for (let m = 1; m <= MULT_MAX; m++) {
        const piles = [...new Set(T12.filter(([, mm]) => mm === m).map(([P]) => P))].sort((a, b) => a - b);
        out.push(piles.find((P) => P > 0 && pick(P, m)) ?? null);
      }
      return out;
    };
    const rule = edges(ruleBanks);
    const dp = edges((P, m) => bestMove(V, q, 6, P, m, CAP12) === 'bank');
    assert.deepEqual(rule, [1, 84, 130, 176, 222], 'the pile §4 starts banking at, by streak');
    assert.deepEqual(dp, [1, 46, 73, 112, 158], 'and the pile the optimum starts banking at');
    for (const row of [rule, dp]) {
      for (const P of row) assert.ok(Number.isFinite(P), 'a policy that never banks is a dominant policy');
      for (let i = 2; i < row.length; i++) {
        assert.ok(row[i] > row[i - 1], 'a longer streak must be worth pushing a bigger pile');
      }
    }
    // …and every one of those edges is INSIDE a session: a 12-question page reaches them
    assert.ok(Math.max(...rule) < CAP12 && Math.max(...dp) < CAP12,
      'a threshold no session can reach is not a decision');
  });

  test('the streak sweep is 2 110 comparisons and the pile sweep is 3 628', () => {
    // Denominators are pinned, not floored: a floor cannot catch a quoted figure drifting, and both
    // of these numbers are quoted — in notes/cut-engine.md and in the §7 #3 tests above.
    const key = new Set(T12.map(([P, m]) => `${P},${m}`));
    let streak = 0, pile = 0;
    for (const [P, m] of T12) for (const c of offered(P, m)) {
      if (m < MULT_MAX && key.has(`${P},${m + 1}`) && offered(P, m + 1).includes(c)) streak++;
      if (key.has(`${P + 1},${m}`) && offered(P + 1, m).includes(c)) pile++;
    }
    assert.equal(streak, 2110);
    assert.equal(pile, 3628);
  });
});

/* ==========================================================================================
   §7 #4, #5, #8 — a right answer never pays less, failing never pays, losses floor at zero
   ========================================================================================== */

describe('CUT-SPEC §7 #4 — a right answer never pays less than a wrong one', () => {
  test('over the whole state space, in points and in streak, with a minimum gap of 8', () => {
    let worst = Infinity, n = 0;
    for (const [P, m] of T12) for (const c of offered(P, m)) {
      n++;
      const right = payOf(c, m);                       // what a right answer adds
      const wrong = -costOf(c, m, P);                  // what a wrong answer takes
      assert.ok(right > 0, `a right answer paid ${right} at pile ${P} ×${m} on ${c}`);
      assert.ok(wrong <= 0, `a wrong answer paid ${wrong} at pile ${P} ×${m} on ${c}`);
      assert.ok(up(P, m, c)[1] >= down(P, m, c)[1], 'a wrong answer must never leave a longer streak');
      worst = Math.min(worst, right - wrong);
    }
    assert.equal(worst, BASE_PAY, `the minimum gap is ${worst}`);
    assert.equal(n, 3646, 'the sweep is the state space — every reachable state × every offered call');
  });
});

/* ==========================================================================================
   A PAGE, PLAYED THROUGH THE SHIPPED VERBS — for the two requirements that are about the queue
   ========================================================================================== */

const CLEAR = Object.freeze({ cleared: true, attempt: 1, hints: 0, kind: 'card' });
const MISS = Object.freeze({ cleared: false, attempt: 3, hints: 2, kind: 'card' });

/** The smallest save `job/state.js` will run a session on, with the queue handed in. */
const rig = (items) => ({
  profileId: 'job-pay', cards: {}, skills: {}, xp: { total: 0 }, errors: [], counters: {}, runs: [],
  player: { best: 0 }, game: { today: 0, day: '2026-09-22' },
  inProgress: {
    kind: 'page', seed: 7, queue: items.map((it, i) => ({ n: i + 1, done: false, result: null, ...it })),
    idx: 0, startedAt: 0, day: '2026-09-22',
    game: { pile: 0, streak: 1, call: null, answered: 0, tGame: 0, tAnswer: 0, seed: '7' },
  },
});

/**
 * Play a page to the end through `call` → `answer` → `endJob`, always bidding the biggest call the
 * pile covers, and answering every question right EXCEPT the ones `throwOn` picks. Returns the
 * points banked and one row per question answered — including the copies a miss put back on the
 * page, which is the whole point: the queue is allowed to grow under the driver's feet.
 */
function playPage(items, { throwOn = () => false } = {}) {
  const save = rig(items);
  const rows = [];
  let t = 1000;
  for (let guard = 0; guard < 60 && state.targetsLeft(save) > 0; guard++) {
    const it = state.currentItem(save);
    const bid = state.stateOf(save).call ? null : state.callsFor(save).slice(-1)[0];
    if (bid) state.call(save, bid, { now: (t += 10), ms: 10 });
    const sealed = state.stateOf(save).call;
    const ok = !throwOn(it, rows.length);
    const r = state.answer(save, ok ? CLEAR : MISS, { now: (t += 10), ms: 10 });
    rows.push({
      id: it.id, requeued: it.requeued ?? 0, sealedAs: sealed ? sealed.id : null,
      ok, pay: r.pay, cost: r.cost, delta: r.delta, pile: r.pile, streak: r.streak,
    });
  }
  const queue = state.queueOf(save).slice();        // read BEFORE `endJob` — `finishPage` clears it
  state.endJob(save, { now: (t += 10), ms: 10 });
  return { points: save.game.today, rows, queue, save };
}

describe('CUT-SPEC §7 #5 — failing never pays', () => {
  test('a thrown review buys a question, and the question it buys is worth nothing', () => {
    /* ROUND 1 (exploit-hunt, blocker). `state.answer` requeues a missed review through the study
       layer's own `page.requeueReview`, so being wrong ADDS a question — and while the copy was
       priced like any other, throwing every review beat honest play by 16–44 % through the shipped
       state machine. The §7 #5 proof above could not see it: its horizon `T` is a fixed loop bound,
       and this is a regime where the horizon grows. So it is proved here, on the real queue.

       The fix is that the copy is not a second earning slot: `job/state.js sealRepeat` seals it with
       a bidless call, so it pays nothing, costs nothing and leaves the streak where it was. */
    const items = [
      { id: 'r1', role: 'review', tier: 1, skill: 'sk', isReview: true },
      { id: 'r2', role: 'review', tier: 1, skill: 'sk', isReview: true },
      { id: 'r3', role: 'review', tier: 1, skill: 'sk', isReview: true },
      { id: 'c1', role: 'core', tier: 1, skill: 'sk' },
      { id: 'c2', role: 'core', tier: 1, skill: 'sk' },
    ];
    const honest = playPage(items);
    assert.equal(honest.rows.length, items.length, 'nobody missed anything, so nothing came back');

    /* EVERY throwing strategy there is, enumerated over the reviews — 8 of them, including the
       one the exploit-hunter ran (throw all three). */
    const reviews = items.filter((it) => it.isReview).map((it) => it.id);
    let best = null;
    for (let mask = 1; mask < 1 << reviews.length; mask++) {
      const thrown = new Set(reviews.filter((_, i) => mask & (1 << i)));
      const arm = playPage(items, { throwOn: (it) => thrown.has(it.id) && (it.requeued ?? 0) === 0 });
      // the queue really did grow — this is the regime the fixed-horizon DP cannot reach
      assert.equal(arm.queue.length, items.length + thrown.size, `mask ${mask}: the copies were not queued`);
      assert.equal(arm.rows.length, items.length + thrown.size, 'and every copy was answered');
      // …and every copy paid nothing, cost nothing, and left the streak alone
      for (let i = 0; i < arm.rows.length; i++) {
        const row = arm.rows[i];
        if (row.requeued === 0) continue;
        assert.equal(row.sealedAs, null, 'a repeat must not carry a bid');
        assert.deepEqual([row.pay, row.cost, row.delta], [0, 0, 0], 'a repeat is not an earning slot');
        assert.equal(row.pile, arm.rows[i - 1].pile, 'the pile moved on a repeat');
        assert.equal(row.streak, arm.rows[i - 1].streak, 'the streak moved on a repeat');
      }
      assert.ok(arm.points < honest.points,
        `throwing ${[...thrown].join('+')} scored ${arm.points} against honest ${honest.points}`);
      best = best === null ? arm.points : Math.max(best, arm.points);
    }
    assert.ok(best < honest.points, `the best throwing line scored ${best}, honest ${honest.points}`);
  });

  test('…and the copy cannot be bid on, banked out of, or made to pay by asking twice', () => {
    const items = [
      { id: 'r1', role: 'review', tier: 1, skill: 'sk', isReview: true },
      { id: 'c1', role: 'core', tier: 1, skill: 'sk' },
    ];
    const save = rig(items);
    state.call(save, NS, { now: 1000, ms: 10 });
    state.answer(save, MISS, { now: 1010, ms: 10 });           // the review is thrown
    // the copy is current, and it is already sealed — bidless
    assert.equal(state.currentItem(save).requeued, 1);
    assert.deepEqual(state.stateOf(save).call.id, null, 'the repeat must be sealed without a bid');
    // asking for a call anyway is answered with the price it will really settle at: nothing
    assert.deepEqual(state.call(save, SURE, { now: 1020, ms: 10 }), {
      pay: 0, cost: 0, streak: state.stateOf(save).streak, pile: state.stateOf(save).pile, call: null,
    });
    // banking is still live over a repeat — there is no bid standing on it
    const pile = state.stateOf(save).pile;
    const banked = state.bank(save, { now: 1030, ms: 10 });
    assert.equal(banked.points, pile);
    // and the repeat still pays nothing after a bank
    const r = state.answer(save, CLEAR, { now: 1040, ms: 10 });
    assert.deepEqual([r.pay, r.cost, r.pile, r.streak], [0, 0, 0, 1]);
    // the seal survives a reload: a repeat cannot come back biddable
    const reloaded = JSON.parse(JSON.stringify(save));
    assert.deepEqual(state.resume(reloaded).call, null, 'the repeat was answered, so the seal is gone');
  });

  test('a program allowed to throw any question gains exactly nothing', () => {
    for (const q of [0.5, 0.6, 0.7, 0.8, 0.9, 0.99]) {
      const honest = solveDP(q, 12, CAP12)[12][1][0];
      const cheat = solveDP(q, 12, CAP12, { allowThrow: true })[12][1][0];
      assert.ok(cheat - honest <= 1e-9, `throwing gained ${(cheat - honest).toFixed(6)} points at q = ${q}`);
      assert.equal((cheat - honest).toFixed(9), (0).toFixed(9), `at q = ${q}`);
    }
  });

  test('and it cannot raise the streak, the pay or the pile it is shown', () => {
    for (const [P, m] of T12) for (const c of offered(P, m)) {
      const [pUp, mUp] = up(P, m, c);
      const [pDn, mDn] = down(P, m, c);
      assert.ok(pDn <= P && pUp > P, 'the pile');
      assert.ok(mDn <= mUp && mDn === 1, 'the streak');
      assert.ok(payOf(c, mDn) <= payOf(c, mUp), 'the pay the next card shows');
    }
  });
});

describe('CUT-SPEC §7 #8 — losses come only from the pile, floored at zero', () => {
  test('`P − min(P, m×cost) ∈ [0, P]` over the whole state space', () => {
    let n = 0;
    for (const [P, m] of T12) for (const c of CALLS) {          // every call, offered or greyed
      const after = P - costOf(c, m, P);
      assert.ok(after >= 0 && after <= P, `pile ${P} ×${m} on ${c} became ${after}`);
      assert.ok(Number.isInteger(after), 'integers only, no division, no rounding');
      n++;
    }
    assert.equal(n, T12.length * CALLS.length);
    // a loss never reaches anything but the pile: the table has no other subtrahend
    assert.equal(Math.min(...T12.map(([P]) => P)), 0, 'the floor is zero and it is reachable');
  });
});

/* ==========================================================================================
   §7 #6 — improving never costs
   ========================================================================================== */

/* WHAT ROUND 2 FOUND HERE, and why this block is shaped the way it is.
 *
 * The sweep that used to stand here walked `q` from 0.30 to 0.99 in steps of 0.01, found 0 falls,
 * and asserted `vals.length - 1 === 69, 'the sweep is every step, not a sample'`. Seventy points of
 * a continuum is a sample, and the comment was the loudest thing in the file. At step 0.001 the
 * same curve falls 8 times, and the two worst falls sit on the band edges 2/3 and 4/5, where
 * `honestCall` steps the student up to the dearer call (COSTS 2→4→8 against PAYS 8→9→10): the 0.01
 * grid straddles both, so E(0.66) < E(0.67) and E(0.80) < E(0.81) and the sweep could not fail
 * whatever the table did in between. That is the defect this block fixes, at the root: the CLAIM was
 * false, and the assertion was built so that it could not notice.
 *
 * THE TABLE IS NOT THE BUG AND IS NOT TOUCHED. The fall is the price of the 2/3 and 4/5 edges that
 * §7 #1 and the three Settings bands are built on — moving it means moving the edges, which is
 * re-inflation and would make the copy in `BANDS` false. What was wrong was the sentence.
 *
 * SO WHAT DOES "IMPROVING NEVER COSTS" MEAN, EXACTLY? CUT-BRIEF math #6: "getting better at the
 * material can never lower any number the app SHOWS the student." The app shows `h of n`, the pile,
 * the multiplier and what the question pays. None of the three prices reads `q` at all — `payOf`,
 * `costOf` and `offered` have no such argument — so the only way a hit rate can reach a printed
 * number is through the call it suggests, and the call is chosen from the PRINTED rate, which is
 * `h/n` with `n ≤ QHAT_WINDOW`: 33 values, not a continuum. The three tests below are that
 * statement, split into the two things a student can actually do:
 *
 *   · get better while the printed rate stands (the coin improves, the call policy does not) — swept
 *     finely, monotone;
 *   · and then the printed rate itself ticks up a notch — swept over the whole printable set,
 *     monotone, every pair.
 *
 * The fall between two notches is real and RECORDED below, at a `q` no student can be shown.
 */
describe('CUT-SPEC §7 #6 — improving never costs', () => {
  test('the best a student can do never falls with the hit rate, over all of [0, 1]', () => {
    /* The strongest form, and it owes nothing to any policy: the OPTIMUM. A student who gets better
       can always do at least as well, because the right branch is worth at least the wrong branch at
       every state (that is §7 #4), so every fixed policy's value rises with `q` and so does the max
       of them. Swept, not assumed — 200 steps, and the step is stated rather than claimed to be all
       of them. */
    const STEPS = 200;
    const vals = [];
    for (let i = 0; i <= STEPS; i++) {
      const q = i / STEPS;
      vals.push([q, solveDP(q, 12, CAP12)[12][1][0]]);
    }
    const bad = firstFall(vals);
    assert.equal(bad, -1, bad < 0 ? '' : `the optimum fell at q = ${vals[bad][0]}`);
    assert.equal(vals.length - 1, STEPS, `a ${1 / STEPS} grid of [0, 1], and it is a grid`);
    assert.ok(vals[STEPS][1] > vals[0][1] * 2, 'and the range is not flat');
  });

  test('…and it never falls while the student improves under a printed rate that has not moved', () => {
    /* The call and the bank decision come from the rate on the strip. Pin that — the student's
       history has not caught up yet — and improve for real. Every printable rate, the coin swept
       over [0, 1]. This is the case the old sweep could not see, because it moved both at once.

       WHY A COARSE COIN GRID IS ENOUGH HERE and a coarse `q` grid was not enough above. With the
       policy pinned nothing steps: `E` is one polynomial in `q` across the whole range, and the only
       thing that could make it fall anywhere is a state whose WRONG branch is worth more than its
       RIGHT one — which §7 #4 has already ruled out over the entire state space. The old sweep was
       walking a curve that CHANGES SHAPE at 2/3 and at 4/5, and a grid cannot be trusted across a
       step it does not land on. This one lands on all 33 of them, in the test below. */
    let cells = 0;
    const STEPS = 10;
    for (const qHat of printableRates()) {
      const vals = [];
      for (let i = 0; i <= STEPS; i++) { const q = i / STEPS; vals.push([q, policyValue(q, 12, CAP12, 'rule', qHat)]); cells++; }
      const bad = firstFall(vals);
      assert.equal(bad, -1, bad < 0 ? '' : `printed rate ${qHat}: E fell at q = ${vals[bad][0]}`);
      assert.ok(vals[STEPS][1] > vals[0][1], `printed rate ${qHat}: the range is flat`);
    }
    assert.equal(cells, printableRates().length * (STEPS + 1), '33 printed rates × 11 true rates');
  });

  test('…and it never falls when the printed rate itself ticks up — every rate the app can print', () => {
    /* The other half: the history catches up and `h of n` moves. THIS is the sweep the old one
       should have been. `printableRates()` is the complete set of values `qHatDetail` can return
       — `h/n`, `1 ≤ n ≤ QHAT_WINDOW`, plus 0 for `new` — so this is exhaustive over the grid the
       student lives on rather than a sample of one he does not. */
    const rates = printableRates();
    assert.equal(rates.length, 33, `${QHAT_WINDOW} sittings can print ${rates.length} distinct rates`);
    assert.equal(rates[0], 0);
    assert.equal(rates[rates.length - 1], 1);
    for (const kind of ['rule', 'never', 'always']) {
      const vals = rates.map((q) => [q, policyValue(q, 12, CAP12, kind)]);
      const bad = firstFall(vals);
      assert.equal(bad, -1, bad < 0 ? '' : `${kind}: ${vals[bad - 1][0]} → ${vals[bad][0]} fell`);
    }
    // and the honest rate a student can be shown never straddles a band edge: 2/3 and 4/5 are IN the set
    assert.ok(rates.includes(2 / 3) && rates.includes(4 / 5), 'both edges are printable rates themselves');
  });

  test('RECORDED: off the printable grid the curve does fall, at both band edges', () => {
    /* THE NEGATIVE CONTROL for the claim above, and the finding that replaced the old one. These
       two falls are real. They are pinned here so that nobody re-publishes "0 non-monotone steps
       over the continuum", and so that a change to the table which moved them would go red rather
       than quietly restore the old lie. Neither `q` is a rate `qHatDetail` can return. */
    for (const [lo, hi, edge] of [[2 / 3, 0.6667, '2/3'], [0.8, 0.8001, '4/5']]) {
      const a = policyValue(lo, 12, CAP12, 'rule');
      const b = policyValue(hi, 12, CAP12, 'rule');
      assert.ok(b < a - 1e-6, `q ${lo} → ${hi} should FALL across the ${edge} edge, got ${a} → ${b}`);
      assert.ok(!printableRates().includes(hi), `${hi} must not be a rate the app can print`);
      // the fall is the call stepping up, not the table misbehaving: honestCall is what changed
      assert.notEqual(honestCall(lo), honestCall(hi), `the ${edge} edge is where the call steps up`);
    }
    // …and this is exactly why the old 0.01 grid could not fail: it steps OVER both edges and rises
    assert.ok(policyValue(0.66, 12, CAP12, 'rule') < policyValue(0.67, 12, CAP12, 'rule'));
    assert.ok(policyValue(0.80, 12, CAP12, 'rule') < policyValue(0.81, 12, CAP12, 'rule'));
    // the two figures CUT-SPEC §7 #6 publishes. The spec prints what the engine computes or neither.
    assert.equal(policyValue(0.8, 12, CAP12, 'rule').toFixed(1), '182.8');
    assert.equal(policyValue(0.8001, 12, CAP12, 'rule').toFixed(1), '176.5');
  });

  test('no printed number falls when a miss becomes a clear', () => {
    /* CUT-BRIEF #6 as it is written — about the numbers on the screen, not about a model of them.
       The prices do not read the hit rate (`payOf`, `costOf` and `offered` take no such argument),
       so the whole of the requirement on the strip is the rate itself: flip any one sitting in the
       window from a miss to a clear and `h of n` must rise, with `of` unmoved. Exhaustive over
       every outcome pattern of a full window. */
    const CARDS_M = { c1: { id: 'c1', skills: ['SK'] } };
    const hist = (bits) => ({ cards: { c1: { history: bits.map((ok, i) => ({ at: 10 + i, ok, attempt: 1, hints: 0 })) } } });
    const W = QHAT_WINDOW;
    let flips = 0;
    for (let mask = 0; mask < (1 << W); mask++) {
      const bits = [];
      for (let i = 0; i < W; i++) bits.push(!!(mask & (1 << i)));
      const before = qHatDetail(hist(bits), 'SK', { cards: CARDS_M, before: null });
      for (let i = 0; i < W; i++) {
        if (bits[i]) continue;                              // already a clear: nothing to improve
        const better = bits.slice();
        better[i] = true;
        const after = qHatDetail(hist(better), 'SK', { cards: CARDS_M, before: null });
        assert.equal(after.of, before.of, 'improving must not change how many sittings are counted');
        assert.equal(after.hits, before.hits + 1, 'a miss that becomes a clear is exactly one hit');
        assert.ok(after.qHat > before.qHat, `${COPY.hits(before)} → ${COPY.hits(after)} must rise`);
        flips++;
      }
    }
    assert.equal(flips, W * (1 << (W - 1)), 'every single-sitting improvement of a full window');
  });

  test('the printed curve is 36, 54, 78, 109, 154, 222, 377', () => {
    const got = [0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95]
      .map((q) => Math.round(policyValue(q, 12, CAP12, 'rule')));
    assert.deepEqual(got, [36, 54, 78, 109, 154, 222, 377]);
    /* Every figure is lower than the flat table's (37, 58, 87, 126, 186, 278, 413) because a wrong
       answer now takes a share of the pile. The CURVE is what this requirement is about: it climbs
       with the hit rate, and it climbs faster than the old one did — getting better is worth MORE
       against a table that prices the pile (×10.5 from q = 0.35 to 0.95, against ×11.2 flat). These
       seven are a PUBLISHED SAMPLE and nothing more; the monotonicity they illustrate is proved
       above, over the optimum and over the printable rates. A student is never shown one of these
       numbers beside another: `best` is his own, and the only thing a point buys. */
  });
});

/* ==========================================================================================
   §7 #7 — nothing about the payoff reads a clock
   ========================================================================================== */

describe('CUT-SPEC §7 #7 — nothing about the payoff reads a clock', () => {
  test('the payoff module holds no Date, no now, no performance', () => {
    for (const p of ['js/job/pay.js', 'js/job/call.js', 'data/job.js']) {
      const text = code(p);
      const hit = text.match(/\bDate\b|\bnow\b|\bperformance\b|Math\.random/);
      assert.equal(hit, null, `${p} reads a clock or a die: ${hit && hit[0]}`);
    }
  });

  test('the two clocks that exist belong to the split meter and nothing prices them', () => {
    assert.ok(IN_PROGRESS_KEYS.includes('tGame') && IN_PROGRESS_KEYS.includes('tAnswer'));
    const text = code('js/job/pay.js');
    for (const k of ['tGame', 'tAnswer', 'ms', 'elapsed']) {
      assert.ok(!new RegExp(`\\b${k}\\b`).test(text), `the payoff table reads \`${k}\``);
    }
    assert.deepEqual([SPLIT.lo, SPLIT.hi], [45, 55], 'the measured split band is CUT-BRIEF\'s');
  });

  test('the payoff table is DOM-free and imports in plain node', () => {
    const text = code('js/job/pay.js');
    for (const k of ['document', 'window', 'localStorage', 'import(']) {
      assert.ok(!text.includes(k), `the payoff table touches \`${k}\``);
    }
    assert.ok(!/^import /m.test(text), 'the payoff table depends on nothing');
  });
});

/* ==========================================================================================
   §7 "Ninth" — the bit the hit rate counts IS the bit the game prices
   ========================================================================================== */

const CARDS = { c1: { id: 'c1', skills: ['PAIRS'] }, c2: { id: 'c2', skills: ['PAIRS', 'VOC'] }, c3: { id: 'c3', skills: ['VOC'] } };
/** a save whose card history is written the way `screens/card.js` writes it: `ok` is the clear */
const saveWith = (rows, extra = {}) => ({
  cards: {
    c1: { history: rows.filter((r) => (r.id ?? 'c1') === 'c1').map((r) => ({ at: r.at, ok: r.cleared, attempt: r.attempt ?? 1, hints: r.hints ?? 0, ms: 0 })) },
    c2: { history: rows.filter((r) => r.id === 'c2').map((r) => ({ at: r.at, ok: r.cleared, attempt: r.attempt ?? 1, hints: r.hints ?? 0, ms: 0 })) },
  },
  ...extra,
});

describe('CUT-SPEC §7 "Ninth" — one bit, counted and priced the same way', () => {
  /* ROUND 4 MOVED THE BIT, IN BOTH PLACES AT ONCE (exploit-hunt, major). It was `result.cleared`,
     which `screens/card.js` sets for a clear bought with three hints and two retries — and the hint
     ladder is on every card by design, with H3 stating the answer outright on the two hardest skills
     in the bank (`quad-01`, `fac-07`). Driven in the real app: three taps on Hint, then submit, and
     the engine paid `pretty sure` in full (+18, ×2 → ×3) and filled one more mark on the row the
     next bid is read off. Exact DP over the shipped table, one 17-question page: 746.0 for a student
     who can read against 263.7 for a genuine 4-in-5 and 184.2 for a 7-in-10 — 2.8× and 4.1× — with
     no deliberate wrong answer anywhere, so §7 #5's proof could not see it, and with `q` a dial the
     student turns, `sure` became uniquely optimal everywhere it is offered (§7 #2, gone).

     The bit is now a CLEAN clear: first try, no hint. It is not a new one — it is the study layer's
     own Global rule 8 (`js/xp.js isClean`), the bit the Leitner bucket has always advanced on and
     stood still without. Both ends moved together, which is the whole of "Ninth": the marks on the
     face-down card count exactly what the pile pays for. */
  test('the hit rate counts a CLEAN clear — first try, no hint — and nothing else', () => {
    const rows = [
      { at: 10, cleared: true, attempt: 3, hints: 2 },    // a clear that took three goes and two hints
      { at: 20, cleared: false, attempt: 1, hints: 0 },   // a miss on the first go with no hints
      { at: 30, cleared: true, attempt: 1, hints: 0 },    // …and the one the game pays for
      { at: 40, cleared: false, attempt: 2, hints: 1 },
    ];
    const d = qHatDetail(saveWith(rows), 'PAIRS', { cards: CARDS });
    assert.equal(d.of, 4, 'a bought clear is still a SITTING — only the fill changes');
    assert.equal(d.hits, rows.filter((r) => r.cleared && r.attempt === 1 && r.hints === 0).length);
    assert.equal(d.hits, 1);
    assert.equal(d.qHat, 0.25);
    // ONE HINT IS ENOUGH TO EMPTY THE MARK, and one retry is too: the ladder is load-bearing now
    /* the two shapes a card history can hold — `screens/card.js` writes the attempt and the hint
       count on every row and derives nothing, so these are the only two ways to buy a clear */
    for (const bought of [{ hints: 1 }, { hints: 3 }, { attempt: 2 }, { attempt: 3, hints: 2 }]) {
      const one = qHatDetail(saveWith([{ at: 1, cleared: true, ...bought }]), 'PAIRS', { cards: CARDS });
      assert.deepEqual([one.hits, one.of], [0, 1], `${JSON.stringify(bought)} filled a mark`);
    }
    // …and the unaided clear fills it, in every shape the history is written in
    const clean = qHatDetail(saveWith([{ at: 1, cleared: true }]), 'PAIRS', { cards: CARDS });
    assert.deepEqual([clean.hits, clean.of], [1, 1]);
    const packed = { cards: { c1: { history: [[1, 1, 1, 0, 900], [2, 1, 1, 2, 900], [3, 1, 2, 0, 900]] } } };
    const p = qHatDetail(packed, 'PAIRS', { cards: CARDS });
    assert.deepEqual([p.hits, p.of], [1, 3], 'the packed 5-array carries the attempt and the hints');
    // flip one CLEAN clear and the rate moves: the bit is load-bearing
    const flipped = qHatDetail(saveWith(rows.map((r, i) => (i === 2 ? { ...r, cleared: false } : r))), 'PAIRS', { cards: CARDS });
    assert.equal(flipped.hits, 0);
  });

  test('a VARIANT moves the count by exactly one, in the same direction as the pile', () => {
    /* ROUND 1 (number-truth, blocker). A page deals cards and Variants and the game prices both,
       but only a card writes `cards[id].history` — so the third slot froze on every Variant. The
       driver trace: `4 of 5` face-down, answered WRONG, pile 26 → 2, and the next face-down card on
       the same skill still read `4 of 5`. The count and the price have to be about the same
       questions. This drives the SHIPPED verbs over a page of Variants and watches both numbers. */
    const items = [
      { id: 'T-sk#a1', role: 'variant', tier: 1, skill: 'sk', template: 'T-sk' },
      { id: 'T-sk#a2', role: 'variant', tier: 1, skill: 'sk', template: 'T-sk' },
      { id: 'T-sk#a3', role: 'variant', tier: 1, skill: 'sk', template: 'T-sk' },
    ];
    const save = rig(items);
    const CARDS_IDX = { c1: { id: 'c1', skills: ['sk'] } };          // a card index that knows no Variant
    const read = () => qHatDetail(save, 'sk', { cards: CARDS_IDX });

    assert.deepEqual([read().hits, read().of], [0, 0], 'a skill with no sittings reads `new`');
    assert.equal(read().source, 'none');

    let t = 1000;
    const seen = [];
    for (const want of [true, false, true]) {
      const before = read();
      state.call(save, state.callsFor(save).slice(-1)[0], { now: (t += 10), ms: 10 });
      const sealed = read();
      assert.deepEqual([sealed.hits, sealed.of], [before.hits, before.of],
        'the sealed call must not move the count under the student');
      const r = state.answer(save, want ? CLEAR : MISS, { now: (t += 10), ms: 10 });
      const after = read();
      assert.equal(after.of, before.of + 1, 'a Variant sitting must count exactly once');
      assert.equal(after.hits, before.hits + (want ? 1 : 0), 'and it counts the bit the game priced');
      // …in the same direction as the pile: the clear paid, the miss took
      if (want) assert.ok(r.pile > r.pileBefore, 'a clear must pay');
      else assert.ok(r.pile < r.pileBefore || r.pileBefore === 0, 'a miss must take');
      seen.push(COPY.hits({ hits: after.hits, of: after.of }));
    }
    assert.deepEqual(seen, ['1 of 1', '1 of 2', '2 of 3'], 'the line the strip printed, sitting by sitting');
  });

  test('a Variant the app has already recorded counts once — from the page it was answered on', () => {
    /* Across sessions the sittings live in `runs[]`: one row per item, `credit = cleared ? 1 : 0`
       and `clean` beside it, written by `makeRunRecord` on the flat route and by `commitJobRun` in
       the game. A CARD row in the same record is NOT counted again — its sittings are the card
       history's. The mark is filled by `clean`, the same bit the pile pays for. */
    const CARDS_IDX = { c1: { id: 'c1', skills: ['sk'] } };
    const save = {
      cards: { c1: { history: [{ at: 4000, ok: false, attempt: 1, hints: 0 }] } },
      runs: [{
        kind: 'page', startedAt: 4500, submittedAt: 5000,
        items: [
          { id: 'T-sk#a1', skill: 'sk', credit: 1, clean: true },
          { id: 'T-sk#a2', skill: 'sk', credit: 0, clean: false },
          { id: 'c1', skill: 'sk', credit: 0, clean: false },   // the card: already in the history above
          { id: 'T-other#z', skill: 'other', credit: 1, clean: true },   // another skill
        ],
      }],
    };
    const d = qHatDetail(save, 'sk', { cards: CARDS_IDX });
    assert.equal(d.of, 3, 'two Variant sittings and one card sitting, and the card counted once');
    assert.equal(d.hits, 1);
    assert.equal(COPY.hits({ hits: d.hits, of: d.of }), '1 of 3');
    /* A CLEAR THE ROW CANNOT CALL CLEAN IS A SITTING THAT FILLS NO MARK — `credit: 1, clean: false`
       is the bought clear, and a row carrying no `clean` at all (nothing in the app writes one, but
       a save off an older build could hold one) is read the same way. Every unknown in this layer
       lowers the rate and none of them raises it. */
    const bought = { ...save, runs: [{ ...save.runs[0], items: [{ id: 'T-sk#b1', skill: 'sk', credit: 1, clean: false }] }] };
    assert.deepEqual([qHatDetail(bought, 'sk', { cards: CARDS_IDX }).hits, qHatDetail(bought, 'sk', { cards: CARDS_IDX }).of], [0, 2]);
    const legacy = { ...save, runs: [{ ...save.runs[0], items: [{ id: 'T-sk#b1', skill: 'sk', credit: 1 }] }] };
    assert.deepEqual([qHatDetail(legacy, 'sk', { cards: CARDS_IDX }).hits, qHatDetail(legacy, 'sk', { cards: CARDS_IDX }).of], [0, 2]);
    // a run of another kind is a different mode with a different item shape: not this rate's business
    const mock = { ...save, runs: [{ ...save.runs[0], kind: 'mock' }] };
    assert.equal(qHatDetail(mock, 'sk', { cards: CARDS_IDX }).of, 1, 'only the card history is left');
    // a row with no verdict is not a sitting
    const junk = { ...save, runs: [{ ...save.runs[0], items: [{ id: 'T-sk#a9', skill: 'sk' }] }] };
    assert.equal(qHatDetail(junk, 'sk', { cards: CARDS_IDX }).of, 1);
    // …and the seal still cuts: a page submitted after the call was locked is not in its own rate
    const sealedSave = { ...save, inProgress: { game: { call: { id: PS, at: 4800 } } } };
    assert.equal(qHatDetail(sealedSave, 'sk', { cards: CARDS_IDX }).of, 1, 'only the sitting before the seal');
  });

  test('the game prices that same bit — the clean clear — through the shipped verbs', () => {
    /* CUT-SPEC §7 "Ninth" asserted as EQUALITY between two moving numbers rather than as a regex
       over a file: play the same question twice on identical saves, once cleared clean and once
       cleared with the ladder, and watch the pile and the mark together. A source lint said the
       machine held the string `result.cleared` — which it still does, because that is the STUDY
       layer's bit and the schedule still turns on it — while the pile was paying for a clear the
       student had bought. */
    const HINTED = Object.freeze({ cleared: true, attempt: 1, hints: 3, clean: false, kind: 'card' });
    const play = (result) => {
      const save = rig([{ id: 'c1', role: 'core', tier: 1, skill: 'sk' }, { id: 'c2', role: 'core', tier: 1, skill: 'sk' }]);
      save.cards = { c1: { history: [] }, c2: { history: [] } };
      const IDX = { c1: { id: 'c1', skills: ['sk'] }, c2: { id: 'c2', skills: ['sk'] } };
      state.call(save, NS, { now: 10, ms: 10 });
      const r = state.answer(save, result, { now: 20, ms: 10 });
      /* the study layer writes the card history; this is that write, done by hand exactly as
         `screens/card.js` does it, because `state.answer` must never write one itself */
      save.cards.c1.history.push({ at: 15, ok: result.cleared, attempt: result.attempt, hints: result.hints, ms: 900 });
      return { r, rate: qHatDetail(save, 'sk', { cards: IDX, before: null }), pile: state.stateOf(save).pile, streak: state.stateOf(save).streak };
    };
    const clean = play(CLEAR);
    const bought = play(HINTED);
    // the pile: one pays, the other settles exactly as a miss does
    assert.deepEqual([clean.r.ok, clean.r.delta, clean.pile, clean.streak], [true, 8, 8, 2]);
    assert.deepEqual([bought.r.ok, bought.r.delta, bought.pile, bought.streak], [false, 0, 0, 1]);
    // …and the mark: the same bit, so the same answer
    assert.deepEqual([clean.rate.hits, clean.rate.of], [1, 1]);
    assert.deepEqual([bought.rate.hits, bought.rate.of], [0, 1], 'a bought clear filled a mark');
    assert.equal(clean.r.ok, clean.rate.hits === 1);
    assert.equal(bought.r.ok, bought.rate.hits === 1, 'the pile and the row disagree about the bit');
  });

  test('a page of bought clears banks nothing, and an honest page banks', () => {
    /* §7 #5 restated for the ladder: the exploit was that buying the clear beat playing honestly.
       Same page, same bids, same number of clears — one student answers them, the other buys them. */
    const items = Array.from({ length: 6 }, (_, i) => ({ id: `c${i + 1}`, role: 'core', tier: 1, skill: 'sk' }));
    const HINTED = Object.freeze({ cleared: true, attempt: 1, hints: 3, clean: false, kind: 'card' });
    const run = (result) => {
      const save = rig(items);
      let t = 1000;
      while (state.targetsLeft(save) > 0) {
        if (!state.stateOf(save).call) state.call(save, state.callsFor(save).slice(-1)[0], { now: (t += 10), ms: 10 });
        state.answer(save, result, { now: (t += 10), ms: 10 });
      }
      state.endJob(save, { now: (t += 10), ms: 10 });
      return save.game.today;
    };
    assert.equal(run(HINTED), 0, 'buying every clear paid');
    assert.ok(run(CLEAR) > 0, 'the honest page must still pay');
  });

  test('a call is never weighed by its own outcome — the history is cut at the seal', () => {
    const rows = [{ at: 10, cleared: true }, { at: 20, cleared: true }, { at: 30, cleared: false }];
    const sealed = saveWith(rows, { inProgress: { game: { call: { id: PS, at: 25 } } } });
    const d = qHatDetail(sealed, 'PAIRS', { cards: CARDS });
    assert.equal(d.of, 2, 'the sitting stamped after the call must not be in its own rate');
    assert.equal(d.hits, 2);
    assert.equal(d.before, 25);
    assert.equal(d.sealed, true);
    assert.deepEqual(sealedCallOf(sealed), { id: PS, at: 25 });
    // an entry stamped AT the lock is the answer to the called question, and is excluded too
    const atLock = saveWith([{ at: 10, cleared: true }, { at: 25, cleared: false }], { inProgress: { game: { call: { id: PS, at: 25 } } } });
    assert.equal(qHatDetail(atLock, 'PAIRS', { cards: CARDS }).of, 1);
    // …and a surface that asks for the live rate opts out explicitly
    assert.equal(qHatDetail(sealed, 'PAIRS', { cards: CARDS, before: null }).of, 3);
    assert.equal(sealedCallOf({}), null);
    assert.equal(sealedCallOf({ inProgress: { game: { call: { id: PS } } } }), null, 'a seal with no instant is no seal');
  });

  test('the printed rate is a COUNT over the last ten sittings, never a percentage', () => {
    assert.equal(QHAT_WINDOW, QHAT.window);
    assert.equal(QHAT_WINDOW, 10);
    const rows = [];
    for (let i = 1; i <= 14; i++) rows.push({ at: i, cleared: i > 7 });   // 7 misses then 7 clears
    const d = qHatDetail(saveWith(rows), 'PAIRS', { cards: CARDS });
    assert.equal(d.of, 10, 'the window is the last ten sittings');
    assert.equal(d.hits, 7);
    assert.equal(d.attempts, 14);
    assert.equal(COPY.hits({ hits: d.hits, of: d.of }), '7 of 10');
    // `of` under ten is the reason it is a count: a percentage would print a number nobody computed
    const thin = qHatDetail(saveWith([{ at: 1, cleared: true }, { at: 2, cleared: false }, { at: 3, cleared: true }]), 'PAIRS', { cards: CARDS });
    assert.equal(COPY.hits({ hits: thin.hits, of: thin.of }), '2 of 3');
    assert.ok(!COPY.hits({ hits: thin.hits, of: thin.of }).includes('%'));
    // no history at all: the card reads `new`, and the honest call on `new` is the cheapest one
    const none = qHatDetail({ cards: {} }, 'PAIRS', { cards: CARDS });
    assert.equal(none.qHat, null);
    assert.equal(none.source, 'none');
    assert.equal(qHatFor({ cards: {} }, 'PAIRS', { cards: CARDS }), null);
    assert.equal(honestCall(none.qHat), NS);
  });

  test('a save with card records but no card index says so instead of printing 0 of 0', () => {
    const d = qHatDetail(saveWith([{ at: 1, cleared: true }]), 'PAIRS', {});
    assert.equal(d.source, 'no-index');
    assert.equal(d.of, 0);
  });
});

/* ==========================================================================================
   §5 / §6 — three numeric slots, and every string
   ========================================================================================== */

describe('CUT-SPEC §6 — every string, and no other', () => {
  const VOCAB = [
    'pile', 'streak', 'you got this right', 'new', 'pays', 'not sure', 'pretty sure', 'sure',
    'bank', 'Today', 'today 186 points', 'best 274', '48 % of this session was the game',
    'The game', 'on', 'off',
    'not sure — you get it right less than 2 times in 3',
    'pretty sure — between 2 in 3 and 4 in 5',
    'sure — more than 4 in 5',
    'you can only pick one your pile can pay for',
  ];

  test('the copy table prints CUT-SPEC §6 and nothing else', () => {
    const printed = [
      COPY.pile, COPY.streak, COPY.hitRate, COPY.none, COPY.bank, COPY.today,
      COPY.settings.title, COPY.settings.on, COPY.settings.off, COPY.settings.greyed,
      COPY.pays({ n: 27 }), COPY.todayPoints({ points: 186 }), COPY.best({ points: 274 }),
      COPY.split({ percent: 48 }), COPY.hits({ hits: 7, of: 10 }),
      ...CALLS, ...BANDS.map((b) => b.copy),
    ];
    for (const s of printed) {
      assert.equal(typeof s, 'string');
      const ok = VOCAB.includes(s) || /^pays \d+$/.test(s) || /^\d+ of \d+$/.test(s);
      assert.ok(ok, `"${s}" is not in CUT-SPEC §6's list`);
    }
    assert.equal(COPY.todayPoints({ points: 186 }), 'today 186 points');
    assert.equal(COPY.best({ points: 274 }), 'best 274');
    assert.equal(COPY.split({ percent: 48 }), '48 % of this session was the game');
    assert.equal(COPY.pays({ n: 27 }), 'pays 27');
  });

  test('the three band lines are the three calls, in order, in the student\'s words', () => {
    assert.deepEqual(BANDS.map((b) => b.copy), [
      'not sure — you get it right less than 2 times in 3',
      'pretty sure — between 2 in 3 and 4 in 5',
      'sure — more than 4 in 5',
    ]);
    for (const b of BANDS) assert.ok(b.copy.startsWith(b.call), 'a band line must name its own call');
  });

  test('no jargon reaches a string the app can print, and no number is baked into one', () => {
    // CUT-BRIEF: "No word a 14-year-old would have to be taught." The scan is over everything the
    // copy table can PRODUCE, not over the file, because the file also carries one named residue —
    // `SKILL_GROUPS` / `WINGS`, a skill grouping a study generator imports and no surface prints.
    const leaves = (v) => (typeof v === 'string' ? [v]
      : typeof v === 'function' ? [v({ n: 27, points: 186, percent: 48, hits: 7, of: 10 })]
        : v && typeof v === 'object' ? Object.values(v).flatMap(leaves) : []);
    const printable = [...leaves(COPY), ...CALLS, ...BANDS.map((b) => b.copy)];
    assert.ok(printable.length >= 15, 'the copy table lost entries');
    for (const s of printable) {
      for (const w of ['posted', 'loot', 'wing', 'contract', 'rating', 'elo', 'chain', 'backcheck',
        'vault', 'token', 'guard', 'crew', 'lock', 'target', 'make']) {
        assert.ok(!s.toLowerCase().includes(w), `"${s}" contains the cut word \`${w}\``);
      }
    }
    // the residue is not reachable from the copy table, and no screen imports it
    assert.ok(!printable.some((s) => /RECALL|FIGURES|WORDS|ALGEBRA/.test(s)), 'a wing name reached a printed string');
    // every printed number arrives as an argument — the strings hold no digits of their own
    for (const s of [COPY.pile, COPY.streak, COPY.hitRate, COPY.none, COPY.bank, COPY.today, COPY.settings.greyed]) {
      assert.ok(!/\d/.test(s), `"${s}" has a number baked into it`);
    }
  });

  test('the third slot is the only one that changes what it says', () => {
    // §5: `7 of 10` captioned "you got this right", becoming `pays 27` once the call is in, `new`
    // with no history. The pile and the streak captions never move.
    const price = payOf(PS, 3);
    assert.equal(price, 27);
    assert.equal(COPY.pays({ n: price }), 'pays 27', 'the slot prints the engine\'s number, not a scaled one');
    assert.equal(COPY.pays({ n: payOf(SURE, MULT_MAX) }), 'pays 50');
  });
});

/* ==========================================================================================
   The optimiser — backward induction over the whole state space, on the shipped table
   ========================================================================================== */

/**
 * `V[t][m][P]` — the most points a student with hit rate `q` can expect to BANK from `(P, ×m)` with
 * `t` questions left. The session auto-banks at the end, so `V[0][m][P] = P`.
 * @param {{allowThrow?: boolean}} [o] allowThrow: the student may also choose to be wrong on purpose
 */
function solveDP(q, T, CAP, { allowThrow = false } = {}) {
  const V = [];
  for (let t = 0; t <= T; t++) {
    V.push([]);
    for (let m = 0; m <= MULT_MAX; m++) V[t].push(new Float64Array(CAP + 1));
  }
  for (let P = 0; P <= CAP; P++) for (let m = 1; m <= MULT_MAX; m++) V[0][m][P] = P;
  for (let t = 1; t <= T; t++) for (let m = 1; m <= MULT_MAX; m++) for (let P = 0; P <= CAP; P++) {
    V[t][m][P] = Math.max(playValue(V, q, t, P, m, CAP, allowThrow), P + playValue(V, q, t, 0, 1, CAP, allowThrow));
  }
  return V;
}

/** The best a student can do by ANSWERING from `(P, ×m)` with `t` left (banking is the caller's). */
function playValue(V, q, t, P, m, CAP, allowThrow = false) {
  let best = -Infinity;
  for (const c of offered(P, m)) {
    const [pu, mu] = up(P, m, c);
    const [pd, md] = down(P, m, c);
    const right = V[t - 1][mu][Math.min(CAP, pu)];
    const wrong = V[t - 1][md][pd];
    const v = q * right + (1 - q) * wrong;
    best = Math.max(best, allowThrow ? Math.max(v, wrong) : v);
  }
  return best;
}

/** The uniquely optimal move at `(P, ×m)` with `t` left, or `'bank'`, or `'tie'`. */
function bestMove(V, q, t, P, m, CAP) {
  let best = -Infinity, pick = null, n = 0;
  for (const c of offered(P, m)) {
    const [pu, mu] = up(P, m, c);
    const [pd, md] = down(P, m, c);
    const v = q * V[t - 1][mu][Math.min(CAP, pu)] + (1 - q) * V[t - 1][md][pd];
    if (v > best + 1e-9) { best = v; pick = c; n = 1; } else if (Math.abs(v - best) <= 1e-9) n++;
  }
  const banked = P + playValue(V, q, t, 0, 1, CAP);
  if (P > 0 && banked > best + 1e-9) return 'bank';
  if (P > 0 && Math.abs(banked - best) <= 1e-9) return 'tie';
  return n > 1 ? 'tie' : pick;
}

/**
 * What a policy actually scores. `rule` is CUT-SPEC §4 (`shouldPush` on the chosen call, with the
 * student's own hit rate as `h of n`); `never` and `always` are the two straw men.
 *
 * TWO RATES, NOT ONE (round 2, #6). `q` is the coin — how often this student is actually right.
 * `qHat` is the number the STRIP PRINTED, and it is the only one the game ever reads: the call comes
 * from `honestCall(qHat)` and the §4 rule from `shouldPush` at `qHat`. They default to the same
 * value because a student's measured rate is his rate, but they are separable because the app can
 * only ever print `h/n` with `n ≤ QHAT_WINDOW` — a 33-value grid — while the coin is a continuum.
 * Collapsing the two is what let the old sweep below walk q past a band edge no student can sit on.
 */
function policyValue(q, T, CAP, kind, qHat = q) {
  const E = [];
  for (let t = 0; t <= T; t++) {
    E.push([]);
    for (let m = 0; m <= MULT_MAX; m++) E[t].push(new Float64Array(CAP + 1));
  }
  for (let P = 0; P <= CAP; P++) for (let m = 1; m <= MULT_MAX; m++) E[0][m][P] = P;
  const step = (t, P, m) => {
    const c = honestHere(qHat, P, m);
    const [pu, mu] = up(P, m, c);
    const [pd, md] = down(P, m, c);
    return q * E[t - 1][mu][Math.min(CAP, pu)] + (1 - q) * E[t - 1][md][pd];
  };
  const D2 = 100000;
  for (let t = 1; t <= T; t++) for (let m = 1; m <= MULT_MAX; m++) for (let P = 0; P <= CAP; P++) {
    const c = honestHere(qHat, P, m);
    let bank;
    if (kind === 'always') bank = true;
    else if (kind === 'never') bank = false;
    // the §4 rule, through the SHIPPED predicate: `h of n` is the student's own PRINTED rate
    else bank = !shouldPush({ hits: Math.round(qHat * D2), of: D2, pay: payOf(c, m), cost: costOf(c, m, P) });
    if (P === 0 && m === 1) bank = false;               // banking nothing is a no-op, not a move
    E[t][m][P] = bank ? P + step(t, 0, 1) : step(t, P, m);
  }
  return E[T][1][0];
}

/**
 * EVERY HIT RATE THE APP CAN PRINT, sorted. `qHatDetail` returns `hits / of` with `of` the size of
 * the window it found, `1 ≤ of ≤ QHAT_WINDOW`; `of === 0` is `new`, which `honestCall` reads as 0
 * and is already the first member. Derived from the SHIPPED window, never from a literal.
 */
const printableRates = (window = QHAT_WINDOW) => {
  const set = new Set();
  for (let n = 1; n <= window; n++) for (let h = 0; h <= n; h++) set.add(h / n);
  return [...set].sort((a, b) => a - b);
};

/** The first index at which a sequence of numbers falls, or −1. */
function firstFall(vals) {
  for (let i = 1; i < vals.length; i++) if (vals[i][1] < vals[i - 1][1] - 1e-9) return i;
  return -1;
}
