// tests/job-call.test.mjs — J2: the Call ladder, the rating window and the rank.
//
// AUTHORITY: COMPOSED-GAME.md G3.1 (both ladders, the Brier credit, `w = 4q̂(1−q̂)`, the fixed-N
// window, the sanity table), G2 "Rank", G3.7 #9 (call-tanking), G3.8, G8 J2 (this ticket's list).
//
// THE RULE THIS SUITE FOLLOWS (inherited from J1): every published numeral is COMPUTED from
// `site/data/job.js`'s constants and then compared against `PUBLISHED`. `PUBLISHED` is never the
// input to a computation. A constant that moves moves the table.
//
// TWO PUBLISHED NUMERALS DO NOT REPRODUCE, and in both cases the FORMULA wins (BUILD-POLICY, and
// this ticket's own instruction). Both are asserted as the formula gives them and recorded in
// notes/J2.md:
//   1. `PUBLISHED.sanityRating.overcall` is labelled "95 on q̂ = .5 material" and prints a mean `w·c`
//      of −4.90. −4.90 is the **85** call at q̂ = .5; the 95 call gives −8.10. Both clamp the rating
//      to 0.00, so the rating column is right either way. (notes/J1.md §7 flagged this to J2.)
//      ROUND 4: findings 24 and 35 re-found it. The exact doc substitution is filed in
//      notes/repair-call.md §"Spec corrections" (the doc lane owns COMPOSED-GAME.md; the constant
//      `PUBLISHED.sanityRating.overcall` is the RATING column, 0.00, and does not move). The
//      assertions below are computed from the formula and are true either way.
//   2. `CALL_DISAGREEMENT_BANDS[0]` labels the band [0.775, 7/9) `money: 85, rank: 70`. The ladders
//      say the opposite there: carry EV prefers **70** and the Brier credit prefers **85**. The
//      second band's labels (`money: 95, rank: 85`) are correct. G3.1's prose generalisation ("money
//      prefers the bolder call and rank prefers the honest one") holds for band 2 only.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, listFiles, stripCommentsAndStrings } from './_helpers.mjs';

import {
  // the four buttons
  CALL_LEVELS, CALL_IDS, callLevel, carryOf, ratingPairOf, callsFor, canCall,
  // the rating ladder
  credit, creditOf, expectedCredit, dExpectedCredit,
  weightFor, isInformative, informativeBand, INFORMATIVE_BAND, INFORMATIVE_MIN,
  // the carry ladder
  evFor, evTable, argmaxCall, honestCall, carryIndifference, ratingIndifference,
  disagreementBands, evMaxBands, evidenceBands, evidenceBandOf, evidenceOf,
  // the window
  callEntry, windowPush, ratingFrom, ratingDetail, expectedRating, wTimesEcDiscrete,
  weightOf, qHatOf, reachableQHats, informativeQHats,
  WINDOW_N, QHAT_WINDOW,
  // rank
  rankFor, rankOf, rankNameFor, meanWcFor,
  // q̂
  qHatFor, qHatDetail, sealedCallOf,
  // the debrief
  regretOf,
} from '../site/js/job/call.js';

import * as JOB from '../site/data/job.js';
import * as ECON from '../site/js/job/econ.js';
import { rngFrom } from '../site/js/rng.js';
import { byId as CARDS_BY_ID, cards as ALL_CARDS } from '../site/data/cards.js';

const P = JOB.PUBLISHED;
const CALLS = [50, 70, 85, 95];
const r2 = (x) => ECON.round(x, 2);
const r3 = (x) => ECON.round(x, 3);
const near = (a, b, eps, m) => assert.ok(Math.abs(a - b) <= eps, `${m ?? ''} expected ${b} ± ${eps}, got ${a}`);

/* =========================================================================================
   0. Provenance — every constant comes from data/job.js, nothing is restated here
   ========================================================================================= */

describe('J2 provenance: call.js restates no constant', () => {
  const src = readFileSync(join(ROOT, 'site/js/job/call.js'), 'utf8');
  const bare = stripCommentsAndStrings(src);

  test('there is not one decimal literal in the file — every ladder numeral is imported', () => {
    const decimals = bare.match(/(?<![\w.])\d*\.\d+/g) ?? [];
    assert.deepEqual(decimals, [], `call.js must import its numerals, found: ${decimals.join(', ')}`);
  });

  test('the only integer literals are structural (indices, exponents, epsilons, percent)', () => {
    const ints = new Set((bare.match(/(?<![\w.])\d+(?![\w.])/g) ?? []));
    // 0-4 and 6 are indices / small algebraic coefficients (the quadratic formula, `round(w, 6)`);
    // 9, 10 and 12 are the digits of `1e-9`, `10 ** dp` and `1e-12`; 100 turns a width into points.
    const allowed = new Set(['0', '1', '2', '3', '4', '6', '9', '10', '12', '100']);
    for (const n of ints) assert.ok(allowed.has(n), `unexpected integer literal ${n} in call.js`);
  });

  test('it imports from data/job.js and from nothing else', () => {
    const imports = [...src.matchAll(/^import[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1]);
    assert.deepEqual(imports, ['../../data/job.js'], 'call.js imports exactly one module');
  });

  test("the ticket's nine exports exist, with the signatures G8 J2 names", async () => {
    const mod = await import('../site/js/job/call.js');
    for (const k of ['CALL_LEVELS', 'credit', 'weightFor', 'INFORMATIVE_MIN', 'ratingFrom', 'rankFor', 'evTable', 'argmaxCall', 'qHatFor']) {
      assert.ok(k in mod, `J2 must export ${k}`);
    }
    assert.equal(typeof mod.credit, 'function');
    assert.equal(mod.credit.length, 2, 'credit(p, ok)');
    assert.equal(mod.weightFor.length, 1, 'weightFor(qHat)');
    assert.equal(mod.rankFor.length, 1, 'rankFor(rating)');
    assert.equal(mod.evTable.length, 1, 'evTable(q)');
    assert.equal(mod.INFORMATIVE_MIN, 0.25);
    // ratingFrom(calls, N = 50): the default IS 50, and it is the divisor
    assert.equal(mod.ratingFrom.length, 1, 'ratingFrom(calls, N = 50) — N is defaulted');
    const win = [{ p: 0.85, ok: true, w: 0.51 }];
    assert.equal(mod.ratingFrom(win), mod.ratingFrom(win, 50));
    assert.notEqual(mod.ratingFrom(win), mod.ratingFrom(win, 1));
  });

  test('the exported gates ARE the data-file constants', () => {
    assert.equal(INFORMATIVE_MIN, JOB.RATING.informativeMin);
    assert.equal(INFORMATIVE_MIN, 0.25, 'G3.1: a call is informative iff w ≥ 0.25');
    assert.equal(WINDOW_N, JOB.RATING.N);
    assert.equal(WINDOW_N, 50, 'G3.1: N = 50, FIXED');
    assert.equal(QHAT_WINDOW, JOB.RATING.qHatWindow);
    assert.equal(JOB.CAPS.calls, JOB.RATING.N, 'the save cap and the window size are the same 50');
    assert.equal(CALL_LEVELS, JOB.CALL_LEVELS, 're-exported by reference, never rebuilt');
    assert.deepEqual([...CALL_IDS], CALLS);
  });
});

describe('J2 discipline: call.js is DOM-free, pure and node-importable', () => {
  const src = readFileSync(join(ROOT, 'site/js/job/call.js'), 'utf8');
  const bare = stripCommentsAndStrings(src);

  test('no DOM, no storage, no clock, no unseeded draw', () => {
    // the globals, as identifiers — `opts.window` and `{ window: size }` are a plain option name
    for (const g of ['document', 'window', 'localStorage', 'sessionStorage', 'navigator', 'requestAnimationFrame', 'CSS', 'fetch']) {
      const re = new RegExp(`(?<![.\\w$])${g}(?![\\w$:])`);
      assert.ok(!re.test(bare), `call.js must not reference the global ${g} (G7: js/job/* is DOM-free)`);
    }
    for (const needle of ['Math.random', 'Date.now', 'new Date', 'performance.now', 'setTimeout']) {
      assert.ok(!bare.includes(needle), `call.js must not use ${needle} (no unseeded draw; G3.7 #5: no payoff term reads elapsed time)`);
    }
  });

  test('it imports nothing from screens/', () => {
    assert.ok(!/from\s+'[^']*screens\//.test(src));
  });

  test('windowPush does not mutate its input', () => {
    const before = [callEntry({ call: 85, ok: true, qHat: 0.5, skill: 'VOC', at: 1 })];
    const snapshot = JSON.stringify(before);
    const after = windowPush(before, { call: 85, ok: false, qHat: 0.5, skill: 'VOC', at: 2 });
    assert.equal(JSON.stringify(before), snapshot, 'the original window is untouched');
    assert.equal(after.length, 2);
    assert.notEqual(after, before);
  });

  test('every value the suite imports is a function or a frozen object', () => {
    for (const [k, v] of Object.entries({ CALL_LEVELS, CALL_IDS, INFORMATIVE_BAND })) {
      assert.ok(Object.isFrozen(v), `${k} must be frozen`);
    }
  });
});

/* =========================================================================================
   1. The Brier credit  c(p, o) = 10 − 40(p − o)²   (G3.1)
   ========================================================================================= */

describe('G3.1 the rating ladder: c(p, o) = 10 − 40(p − o)²', () => {
  test('credit reproduces every published creditClear / creditMiss from CREDIT alone', () => {
    for (const lvl of CALL_LEVELS) {
      near(credit(lvl.p, true), lvl.creditClear, 1e-12, `clear at ${lvl.id}`);
      near(credit(lvl.p, false), lvl.creditMiss, 1e-12, `miss at ${lvl.id}`);
      near(creditOf(lvl.id, true), lvl.creditClear, 1e-12);
      near(creditOf(lvl.id, false), lvl.creditMiss, 1e-12);
      assert.deepEqual(ratingPairOf(lvl.id), { clear: lvl.creditClear, miss: lvl.creditMiss });
    }
  });

  test('the 50 call scores exactly 0 either way — which is why cowardice costs nothing and buys nothing', () => {
    assert.equal(credit(0.5, true), 0);
    assert.equal(credit(0.5, false), 0);
  });

  test('E[c] = 10 − 40[q(1−p)² + (1−q)p²] agrees with the realised-credit mixture', () => {
    for (let i = 0; i <= 20; i++) {
      const q = i / 20;
      for (const lvl of CALL_LEVELS) {
        const mix = q * credit(lvl.p, true) + (1 - q) * credit(lvl.p, false);
        near(expectedCredit(lvl.p, q), mix, 1e-12, `E[c] at q=${q} call ${lvl.id}`);
      }
    }
  });

  test('call.js and econ.js agree pointwise — the two files cannot drift (notes/J1.md §7)', () => {
    for (let i = 0; i <= 1000; i++) {
      const x = i / 1000;
      assert.equal(weightFor(x), ECON.ratingWeight(x), `weightFor(${x})`);
      assert.equal(credit(x, true), ECON.creditFor(x, true), `credit(${x}, clear)`);
      assert.equal(credit(x, false), ECON.creditFor(x, false), `credit(${x}, miss)`);
      for (let j = 0; j <= 20; j++) {
        const q = j / 20;
        assert.equal(expectedCredit(x, q), ECON.expectedCredit(x, q), `E[c](${x}, ${q})`);
      }
    }
    for (let i = 0; i <= 1000; i++) {
      const q = i / 1000;
      assert.equal(honestCall(q), ECON.honestRung(q).id, `honestCall(${q}) must equal econ.honestRung(${q}).id`);
      near(wTimesEcDiscrete(q), ECON.wTimesEcDiscrete(q), 1e-12, `w·E[c] discrete at ${q}`);
    }
  });
});

/* =========================================================================================
   2. STRICT PROPRIETY — truthful reporting is the unique maximiser  (acceptance #3)
   ========================================================================================= */

describe('G3.1 propriety: grid search over p ∈ [.5, .99] for 99 values of q', () => {
  // 99 values of q, every one of them also a point of the p grid.
  const QS = Array.from({ length: 99 }, (_, k) => ECON.round(0.5 + k * 0.005, 3));
  const PS = Array.from({ length: 491 }, (_, k) => ECON.round(0.5 + k * 0.001, 3));

  test('99 q-values, 491 p-values: the grid argmax of E[c] is q itself, every time', () => {
    assert.equal(QS.length, 99);
    assert.equal(PS[0], 0.5);
    assert.equal(PS[PS.length - 1], 0.99);
    let checked = 0;
    for (const q of QS) {
      assert.ok(PS.includes(q), `q = ${q} must lie on the p grid for the argmax to be exact`);
      let best = null; let bestV = -Infinity;
      for (const p of PS) {
        const v = expectedCredit(p, q);
        if (v > bestV) { bestV = v; best = p; }
        checked++;
      }
      assert.equal(best, q, `truthful reporting must maximise E[c] at q = ${q}; grid picked ${best}`);
      near(bestV, expectedCredit(q, q), 1e-12);
    }
    assert.equal(checked, 99 * 491, '48 609 (p, q) pairs');
  });

  test('every lie is strictly worse — no plateau, no second maximiser', () => {
    for (const q of QS) {
      const truth = expectedCredit(q, q);
      for (const p of PS) {
        if (p === q) continue;
        assert.ok(expectedCredit(p, q) < truth - 1e-12, `p = ${p} must be strictly worse than the truth at q = ${q}`);
      }
    }
  });

  test('dE/dp = 80[q(1−p) − (1−q)p] is zero only at p = q, and d²E/dp² = −80', () => {
    for (const q of QS) {
      near(dExpectedCredit(q, q), 0, 1e-12, `dE/dp at p = q = ${q}`);
      for (const p of PS) {
        const analytic = dExpectedCredit(p, q);
        const h = 1e-6;
        const numeric = (expectedCredit(p + h, q) - expectedCredit(p - h, q)) / (2 * h);
        near(analytic, numeric, 1e-6, `dE/dp at p=${p}, q=${q}`);
        if (p < q - 1e-12) assert.ok(analytic > 0, 'E[c] increases below the truth');
        if (p > q + 1e-12) assert.ok(analytic < 0, 'E[c] decreases above the truth');
      }
      // second derivative: the slope falls by exactly 80 per unit of p
      const d2 = (dExpectedCredit(0.9, q) - dExpectedCredit(0.5, q)) / 0.4;
      near(d2, -2 * JOB.CREDIT.k, 1e-9, 'd²E/dp² = −80');
    }
  });

  test('propriety survives on the DISCRETE four-rung ladder: the honest rung beats every other rung', () => {
    for (let i = 0; i <= 1000; i++) {
      const q = i / 1000;
      const best = callLevel(honestCall(q));
      for (const lvl of CALL_LEVELS) {
        if (lvl.id === best.id) continue;
        assert.ok(expectedCredit(best.p, q) >= expectedCredit(lvl.p, q) - 1e-12,
          `the honest rung ${best.id} must beat ${lvl.id} at q = ${q}`);
      }
    }
  });
});

/* =========================================================================================
   3. The carry EV table and argmaxCall  (acceptance #1)
   ========================================================================================= */

describe('G3.1 the carry ladder: EV = q·W − (1−q)·P', () => {
  test('evTable reproduces the published table at all six q, to the cent', () => {
    for (const [qs, row] of Object.entries(P.evTable)) {
      const q = Number(qs);
      const got = evTable(q);
      for (const c of CALLS) {
        assert.equal(r2(got[c]), row[c], `EV at q = ${q}, call ${c}`);
      }
    }
  });

  test('argmaxCall matches the published argmax column at q = .50 / .60 / .70 / .80 / .90 / .95', () => {
    const expectedArgmax = { 0.50: 50, 0.60: 50, 0.70: 70, 0.80: 85, 0.90: 95, 0.95: 95 };
    for (const [qs, want] of Object.entries(expectedArgmax)) {
      const q = Number(qs);
      assert.equal(argmaxCall(q), want, `argmaxCall(${q})`);
      // and it really is the argmax of the published row
      const row = P.evTable[qs];
      const top = Math.max(...CALLS.map((c) => row[c]));
      assert.equal(r2(evFor(q, want)), top, `call ${want} must attain the published maximum at q = ${q}`);
    }
  });

  test('q = 0.60 is the published tie "50 ≡ 70", and the tie goes to the LOWER rung', () => {
    near(evFor(0.6, 50), evFor(0.6, 70), 1e-12, 'the 50 and 70 rungs are indifferent at q = 0.60');
    assert.equal(argmaxCall(0.6), 50, 'ties break to the lower rung (notes/J1.md §5.4)');
  });

  test('carry EV is strictly increasing in q for every call — there is no interior optimum', () => {
    for (const c of CALLS) {
      for (let i = 0; i < 1000; i++) {
        assert.ok(evFor((i + 1) / 1000, c) > evFor(i / 1000, c), `EV must rise with q at call ${c}`);
      }
    }
  });

  test('argmaxCall is monotone in q and agrees with evMaxBands over a 10 001-point grid', () => {
    const bands = evMaxBands();
    assert.deepEqual(bands.map((b) => b.call), CALLS);
    let last = 0;
    for (let i = 0; i <= 10000; i++) {
      const q = i / 10000;
      const got = argmaxCall(q);
      assert.ok(got >= last, `argmaxCall must not fall as q rises (q = ${q})`);
      last = got;
      const band = bands.find((b) => q <= b.to + 1e-12) ?? bands[bands.length - 1];
      assert.equal(got, band.call, `the EV-max band table must agree with argmaxCall at q = ${q}`);
    }
  });

  test('opts.rank restricts the argmax to the calls that rank may actually make', () => {
    assert.equal(argmaxCall(0.95), 95);
    assert.equal(argmaxCall(0.95, { rank: 2 }), 85, 'Called 2 has no 95 rung, so its EV-max is 85');
    assert.equal(argmaxCall(0.95, { rank: 3 }), 95);
    assert.deepEqual([...callsFor(1)], [50, 70, 85]);
    assert.deepEqual([...callsFor(5)], [50, 70, 85, 95]);
    assert.equal(canCall(95, 2), false);
    assert.equal(canCall(95, 3), true);
    assert.equal(canCall(85, 1), true);
  });
});

/* =========================================================================================
   4. Indifference points  (acceptance #2)
   ========================================================================================= */

describe('G3.1 indifference: .600 / .778 / .882 (carry) and .600 / .775 / .900 (Brier)', () => {
  test('carry indifference is exactly 3/5, 7/9, 15/17, computed from W and P alone', () => {
    const got = carryIndifference();
    assert.equal(got.length, 3);
    near(got[0], 3 / 5, 1e-15, '50 ↔ 70');
    near(got[1], 7 / 9, 1e-15, '70 ↔ 85');
    near(got[2], 15 / 17, 1e-15, '85 ↔ 95');
    // and against both the data file and the document's printed 3-4 dp forms
    for (let i = 0; i < 3; i++) near(got[i], JOB.CALL_INDIFFERENCE.carry[i], 1e-15);
    near(got[0], 0.600, 5e-4);
    near(got[1], 0.778, 5e-4, 'G8 J2 prints .778');
    near(got[2], 0.882, 5e-4, 'G8 J2 prints .882');
    for (let i = 0; i < 3; i++) near(got[i], P.carryIndifference[i], 5e-5);
  });

  test('at each carry indifference point the two adjacent rungs really are equal', () => {
    const cuts = carryIndifference();
    for (let i = 0; i < cuts.length; i++) {
      near(evFor(cuts[i], CALL_LEVELS[i].id), evFor(cuts[i], CALL_LEVELS[i + 1].id), 1e-12,
        `EV(${CALL_LEVELS[i].id}) = EV(${CALL_LEVELS[i + 1].id}) at q = ${cuts[i]}`);
    }
  });

  test('Brier indifference is the MIDPOINT of the two rungs: .600 / .775 / .900', () => {
    const got = ratingIndifference();
    near(got[0], 0.600, 1e-12);
    near(got[1], 0.775, 1e-12);
    near(got[2], 0.900, 1e-12);
    for (let i = 0; i < 3; i++) {
      near(got[i], JOB.CALL_INDIFFERENCE.rating[i], 1e-12);
      near(got[i], P.ratingIndifference[i], 1e-12);
      near(got[i], (CALL_LEVELS[i].p + CALL_LEVELS[i + 1].p) / 2, 1e-15, 'the midpoint identity');
    }
  });

  test('at each Brier indifference point the two adjacent rungs really are equal, and the tie goes low', () => {
    const cuts = ratingIndifference();
    for (let i = 0; i < cuts.length; i++) {
      near(expectedCredit(CALL_LEVELS[i].p, cuts[i]), expectedCredit(CALL_LEVELS[i + 1].p, cuts[i]), 1e-12);
      assert.equal(honestCall(cuts[i]), CALL_LEVELS[i].id, `the tie at q̂ = ${cuts[i]} keeps the lower rung`);
    }
    assert.equal(honestCall(0.900), 85, 'G3.1 sanity row q̂ = .90 is computed on rung 85');
  });

  test('the two ladders disagree in exactly two bands — and band 1 is labelled backwards in data/job.js', () => {
    const bands = disagreementBands();
    assert.equal(bands.length, 2, 'exactly two disagreement bands');

    // band 1: [0.775, 7/9)
    near(bands[0].from, 0.775, 1e-12);
    near(bands[0].to, 7 / 9, 1e-12);
    // band 2: [15/17, 0.900)
    near(bands[1].from, 15 / 17, 1e-12);
    near(bands[1].to, 0.900, 1e-12);
    // the edges match the data file's bands, whatever the labels say
    for (let i = 0; i < 2; i++) {
      near(bands[i].from, JOB.CALL_DISAGREEMENT_BANDS[i].from, 1e-12);
      near(bands[i].to, JOB.CALL_DISAGREEMENT_BANDS[i].to, 1e-12);
    }

    // THE COMPUTED TRUTH, sampled inside each band (the formula is the authority):
    const inside = (b) => (b.from + b.to) / 2;
    assert.equal(argmaxCall(inside(bands[0])), 70, 'band 1: the CARRY ladder prefers 70');
    assert.equal(honestCall(inside(bands[0])), 85, 'band 1: the BRIER ladder prefers 85');
    assert.equal(argmaxCall(inside(bands[1])), 95, 'band 2: the CARRY ladder prefers 95');
    assert.equal(honestCall(inside(bands[1])), 85, 'band 2: the BRIER ladder prefers 85');
    assert.deepEqual(bands.map((b) => [b.money, b.rank]), [[70, 85], [95, 85]]);

    // …and the data file now AGREES with them. J2 recorded band 1's labels as transcribed backwards
    // (money 85 / rank 70) and asked J1 to swap them; J7 asked again; integration made the swap.
    assert.deepEqual(
      [JOB.CALL_DISAGREEMENT_BANDS[0].money, JOB.CALL_DISAGREEMENT_BANDS[0].rank], [70, 85],
      'data/job.js band 1 must label what the ladders compute: money 70, rank 85 (notes/J2.md §5.2)',
    );
    assert.deepEqual(
      [JOB.CALL_DISAGREEMENT_BANDS[1].money, JOB.CALL_DISAGREEMENT_BANDS[1].rank], [95, 85],
      'band 2 is labelled correctly',
    );

    // the two bands together are the ~2.1 percentage points G3.1 claims
    const total = bands.reduce((a, b) => a + b.widthPoints, 0);
    near(total, 2.04, 0.01, 'measured width of the two disagreement bands, in percentage points');
  });

  test('each band is half-open (from, to]: the ladders agree at its floor and disagree at its ceiling', () => {
    // Both ladders break ties to the LOWER rung, so a band opens one step ABOVE the rating cut and
    // closes ON the carry cut. At q = 0.775 both say 70; at q = 7/9 carry ties down to 70 while the
    // Brier has already moved to 85. Same shape one rung up: agree at 15/17, disagree at 0.900.
    const [b1, b2] = disagreementBands();
    assert.equal(argmaxCall(b1.from), honestCall(b1.from), 'they agree at 0.775');
    assert.notEqual(argmaxCall(b1.to), honestCall(b1.to), 'they disagree at 7/9');
    assert.equal(argmaxCall(b2.from), honestCall(b2.from), 'they agree at 15/17');
    assert.notEqual(argmaxCall(b2.to), honestCall(b2.to), 'they disagree at 0.900');
  });

  test('outside the two bands the ladders agree everywhere', () => {
    const bands = disagreementBands();
    const inBand = (q) => bands.some((b) => q > b.from + 1e-12 && q <= b.to + 1e-12);
    let disagreements = 0;
    for (let i = 0; i <= 10000; i++) {
      const q = i / 10000;
      if (argmaxCall(q) !== honestCall(q)) disagreements++;
      if (inBand(q)) continue;
      assert.equal(argmaxCall(q), honestCall(q), `money and rank must agree at q = ${q}`);
    }
    assert.ok(disagreements > 0 && disagreements < 300,
      `the disagreement is a sliver of the domain, not a feature of it: ${disagreements} of 10 001 grid points`);
  });
});

/* =========================================================================================
   5. The anti-farming weight  (acceptance #4, #5)
   ========================================================================================= */

describe('G3.1 the weight: w = 4q̂(1−q̂)', () => {
  test('weightFor(.97) ≈ .116 and weightFor(.933) ≈ .250', () => {
    near(weightFor(0.97), 0.116, 5e-4, 'weightFor(.97)');
    assert.equal(r3(weightFor(0.97)), 0.116);
    near(weightFor(0.933), 0.250, 5e-4, 'weightFor(.933)');
    assert.equal(r3(weightFor(0.933)), 0.250);
  });

  test('every published weight reproduces', () => {
    for (const [qs, want] of Object.entries(P.weights)) {
      near(weightFor(Number(qs)), want, 5e-4, `w(${qs})`);
    }
  });

  test('w peaks at q̂ = 0.5 with w = 1, and is strictly decreasing on [0.5, 1] (G3.8 domain)', () => {
    assert.equal(weightFor(0.5), 1);
    for (let i = 500; i < 1000; i++) {
      assert.ok(weightFor((i + 1) / 1000) < weightFor(i / 1000), `w must fall as q̂ rises past ${i / 1000}`);
    }
  });

  test('the informative band is the exact root pair [1 ± √(1−4·min/k)]/2, and .933 is (just) inside it', () => {
    const [lo, hi] = informativeBand();
    near(lo, (1 - Math.sqrt(0.75)) / 2, 1e-15);
    near(hi, (1 + Math.sqrt(0.75)) / 2, 1e-15);
    assert.equal(r3(lo), 0.067, 'G3.1 prints 0.067');
    assert.equal(r3(hi), 0.933, 'G3.1 prints 0.933');
    for (let i = 0; i < 2; i++) near([lo, hi][i], JOB.RATING.informativeQHatBand[i], 5e-4);
    near(weightFor(lo), INFORMATIVE_MIN, 1e-15, 'w at the band edge is exactly the gate');
    near(weightFor(hi), INFORMATIVE_MIN, 1e-15);
    assert.equal(isInformative(0.933), true, 'q̂ = .933 sits just inside the band');
    assert.equal(isInformative(0.934), false, 'one thousandth further out and the call stops counting');
    assert.equal(isInformative(0.067), true);
    assert.equal(isInformative(0.066), false);
    assert.deepEqual([...INFORMATIVE_BAND], [lo, hi]);
  });

  test('a missing / impossible q̂ weighs 0 — a make with no history cannot carry a calibration measurement', () => {
    for (const bad of [null, undefined, NaN, Infinity, -Infinity, 'x', {}]) assert.equal(weightFor(bad), 0);
    assert.equal(weightFor(0), 0);
    assert.equal(weightFor(1), 0);
    assert.equal(isInformative(null), false);
  });
});

/* =========================================================================================
   6. The rating window: N = 50, informative-only  (acceptance #6, #7)
   ========================================================================================= */

describe('G3.1 the window: only w ≥ 0.25 enters, and the divisor is N = 50', () => {
  const entry = (qHat, call, ok, i) => callEntry({ call, ok, qHat, skill: 'FAC2', at: i });

  test('a non-informative call takes its SLOT and pays exactly nothing (round 2)', () => {
    /* ROUND 2. This used to assert `win.length === 0` — a non-informative call was dropped by
       `windowPush` and never reached the array at all. That is not the window G3.1 describes
       ("an unfilled slot contributes 0"), and the difference is a blocker, not a nicety: with only
       informative calls in the array the fifty slots saturate and the FIXED divisor silently becomes
       the COUNT. A 0.99-clear farmer then converged to 9.53 (Called 5) off the 9.6 % of their makes
       that carry one miss in ten, and no later call could ever evict a stale slot.
       A blank slot is written with `p: null` and NO evidence — see `callEntry` — so it scores
       nothing here AND is invisible to every consumer that selects on a finite `p` (the
       `calibrated` trophy and the Reliability diagram, both of which mean "informative calls"). */
    let win = [];
    for (let i = 0; i < 50; i++) win = windowPush(win, entry(0.97, 95, true, i));
    assert.equal(win.length, 50, 'q̂ = .97 gives w = .116 < .25 — the calls still take their slots');
    assert.deepEqual([...new Set(win.map((e) => e.p))], [null], 'and every one of them is BLANK');
    assert.deepEqual([...new Set(win.map(weightOf))], [0]);
    assert.deepEqual([...new Set(win.map(qHatOf))], [null],
      'a slot that pays nothing must carry no evidence either — nothing can price it back up');
    const d0 = ratingDetail(win);
    assert.equal(d0.n, 0, 'not one of them is a measurement');
    assert.equal(d0.slots, 50, 'but all fifty slots are occupied');
    assert.equal(d0.value, 5, 'and fifty blanks are worth exactly 5.00');
    assert.equal(d0.measured, false);

    let win2 = [];
    for (let i = 0; i < 10; i++) win2 = windowPush(win2, entry(0.9, 85, true, i));
    assert.equal(win2.length, 10, 'q̂ = .90 gives w = .36 ≥ .25 — informative');
    assert.equal(ratingDetail(win2).n, 10);

    /* THE EVICTION THAT MAKES RANK FALL AGAIN (round-2 finding 7). Bank a full measured window,
       then clear 50 more targets on material you have mastered: the blanks push the measurements
       out and the rating walks back to the neutral. Before, `windowPush` returned the list
       unchanged and 10.00 / Called 5 was permanent. */
    let banked = [];
    for (let i = 0; i < 50; i++) banked = windowPush(banked, entry(0.8, 85, true, i), { N: 50 });
    assert.equal(rankFor(ratingFrom(banked)), 5, 'fifty honest q̂ = .80 clears bank Called 5');
    for (let i = 0; i < 50; i++) banked = windowPush(banked, entry(1, 95, true, 100 + i), { N: 50 });
    assert.equal(banked.length, 50, 'the window is still fifty slots');
    assert.equal(ratingFrom(banked), 5, 'and fifty mastered clears have emptied it back to 5.00');
    assert.equal(rankFor(ratingFrom(banked)), 2);
  });

  test('ratingFrom filters a hand-built window too, even if a non-informative entry was written', () => {
    const dirty = [
      { p: 0.85, ok: true, w: 0.51 },      // informative
      { p: 0.95, ok: true, w: 0.116 },     // NOT informative — must be ignored
      { p: 0.95, ok: true, w: 0.2499 },    // NOT informative — must be ignored
      { p: 0.85, ok: true, w: 0.25 },      // exactly the gate — must count
    ];
    const d = ratingDetail(dirty);
    assert.equal(d.n, 2, 'two of the four entries are informative');
    near(d.sum, 0.51 * 9.1 + 0.25 * 9.1, 1e-12);
  });

  test('THE DIVISOR IS N, NOT Σw: ten clear 85 calls at q̂ = .85 score 6.856, not 10.0', () => {
    const win = Array.from({ length: 10 }, (_, i) => entry(0.85, 85, true, i));
    assert.equal(win.length, 10);
    const sum = win.reduce((a, e) => a + weightOf(e) * credit(e.p, e.ok), 0);
    near(sum, 10 * 0.51 * 9.1, 1e-9);
    const byN = JOB.RATING.base + JOB.RATING.scale * (sum / JOB.RATING.N);
    const bySumW = JOB.RATING.base + JOB.RATING.scale * (sum / win.reduce((a, e) => a + weightOf(e), 0));
    near(ratingFrom(win), byN, 1e-12, 'divided by the fixed window size');
    near(ratingFrom(win), 6.8564, 1e-4);
    assert.ok(bySumW > 10, 'a Σw divisor would peg the rating at the ceiling after ten calls');
    assert.notEqual(r3(ratingFrom(win)), r3(Math.min(10, bySumW)));
    const d = ratingDetail(win);
    assert.equal(d.N, 50);
    assert.equal(d.n, 10);
    near(d.filled, 0.2, 1e-12, '10 of 50 slots filled — the other 40 contribute 0');
  });

  test('an unfilled slot contributes 0, so a thin window is pulled toward exactly 5.00', () => {
    assert.equal(ratingFrom([]), 5);
    const one = [entry(0.85, 85, true, 0)];
    near(ratingFrom(one), 5 + 2 * (0.51 * 9.1) / 50, 1e-12);
    assert.ok(ratingFrom(one) < 5.2, 'one perfect call moves the rating by less than a fifth of a point');
  });

  test('the window keeps the newest CAPS.calls entries', () => {
    let win = [];
    for (let i = 0; i < 120; i++) win = windowPush(win, entry(0.85, 85, true, i));
    assert.equal(win.length, JOB.CAPS.calls);
    assert.equal(win[0].at, 120 - JOB.CAPS.calls);
    assert.equal(win[win.length - 1].at, 119);
  });

  test('a call entry is exactly the save schema {p, ok, q, skill, at}, in that key order', () => {
    const e = callEntry({ call: 85, ok: true, qHat: 0.85, skill: 'FAC2', at: 1758000000000 });
    assert.deepEqual(Object.keys(e), ['p', 'ok', 'q', 'skill', 'at']);
    assert.deepEqual(e, { p: 0.85, ok: true, q: 0.85, skill: 'FAC2', at: 1758000000000 });
    assert.equal(weightOf(e), 0.51, 'and the weight is DERIVED from the stored q̂, not stored beside it');
    assert.ok(JSON.stringify(e).length <= 70, `G7 budgets 63 B per entry; got ${JSON.stringify(e).length}`);
    /* THE SWAP IS BYTE-NEUTRAL, which is the whole reason it could ship (round-4 verify): the
       widest q̂ on the `hits/of` grid and the widest `w` it produces are both 8 characters, so G7's
       `player` line and the 39.6 KB headline do not move. `tests/_helpers.mjs` prices `WIDEST_Q`. */
    const widest = callEntry({ call: 85, ok: true, qHat: 1 / 3, skill: 'QUAD-SOLVE', at: 1758000000000 });
    assert.equal(widest.q, 0.333333);
    assert.equal(String(widest.q).length, String(0.888889).length,
      'the stored q̂ is wider than the w it replaced — G7’s byte table would have to be restated');
    /* the explicit-`w` form is untouched: the Mock has no MAKE, so it has no q̂ to store. `w` here
       is the Mock's CEILING (`RATING.mockWeight`, which is `screens/mock.js MOCK_CALL_W`), not a
       weight any shipped caller passes unconditionally — see the driven arm below. */
    const mock = callEntry({ p: 0.7, ok: true, w: JOB.RATING.mockWeight, skill: null, at: 1 });
    assert.deepEqual(Object.keys(mock), ['p', 'ok', 'w', 'skill', 'at']);
    assert.equal(weightOf(mock), JOB.RATING.mockWeight);
    assert.equal(qHatOf(mock), null);
    /* and it is IDEMPOTENT in both forms — `windowPush` re-runs `callEntry` on what it is handed */
    assert.deepEqual(callEntry(e), e);
    assert.deepEqual(callEntry(mock), mock);
    // G3.7 #10 / J7: a shielded miss must write a BYTE-IDENTICAL entry to an unshielded one.
    const unshielded = callEntry({ call: 95, ok: false, qHat: 0.6, skill: 'SYS', at: 7 });
    const shielded = callEntry({ call: 95, ok: false, qHat: 0.6, skill: 'SYS', at: 7, shielded: true, backcheck: true });
    assert.equal(JSON.stringify(shielded), JSON.stringify(unshielded),
      'a Backcheck shields the stake and only the stake — the rating credit is always taken');
  });

  /* ────────────────────────────────────────────────────────────────────────────────────────────
     VERIFY r3 · BLOCKER (call-propriety). THIS ARM USED TO READ:

         test('the Mock enters the window at the defined weight w = 1.0 (G12 #40d)', () => {
           const e = callEntry({ p: 0.7, ok: true, w: JOB.RATING.mockWeight, skill: null, at: 1 });
           assert.equal(e.w, 1);   // …and nothing else

     It handed `callEntry` a constant NO SHIPPED CALLER PASSES, so it asserted `callEntry`'s
     pass-through and published the answer as a fact about the Mock. `grep -rn mockWeight site/`
     returned `settings.js` and `data/job.js` and nothing in `screens/mock.js`: the constant was a
     fiction with a student-facing render ("…enters the window as one call at w = 1.0: it has no
     make, so it has no q̂, and the weight is defined rather than guessed"). Both halves were false.
     The shipped law is `mockCallWeight(ŝ) = min(4ŝ(1−ŝ), MOCK_CALL_W)` on the trailing-ten MEAN
     SCORE — MEASURED, and 0 with no prior paper — so a perfect Mock forecast is worth 0.10 of
     rating and a first-ever one exactly 0.00, against the 0.40 `w = 1.0` implies: a 4× overstatement
     of the app's only calibration surface outside a job. `tests/job-week.test.mjs` asserted the
     opposite fact about the same mechanic and both suites were green, because neither drove it.
     THIS ONE DRIVES IT, end to end, and reads the entry back off `player.rating.calls`.
     ──────────────────────────────────────────────────────────────────────────────────────────── */
  test('the Mock’s weight is MEASURED off its own papers and CAPPED — driven, never restated', async () => {
    const mock = await import('../site/js/screens/mock.js');
    const DAY = 24 * 60 * 60 * 1000;
    const paper = ({ pred, score, at, seed }) => ({
      kind: 'mock', status: 'done', n: 20, seed, retry: false,
      items: Array.from({ length: 20 }, (_, i) => ({
        n: i + 1, credit: 0, parts: [{ id: 'a', type: 'text', credit: 0, kind: 'wrong', ok: false }],
      })),
      pred, score, startedAt: at - 25 * 60 * 1000, submittedAt: at,
    });
    const saveWith = (runs) => ({
      player: { rating: { calls: [], value: JOB.RATING.base, n: 0 }, rank: 1, records: {} },
      runs: [...runs], settings: {},
    });
    const now = Date.UTC(2026, 8, 22, 18, 0, 0);

    /* THE PUBLISHED CONSTANT IS THE SHIPPED CEILING, or this suite and job-week disagree again */
    assert.equal(JOB.RATING.mockWeight, mock.MOCK_CALL_W,
      'RATING.mockWeight must BE screens/mock.js MOCK_CALL_W — it is rendered to the student');
    assert.equal(JOB.RATING.mockWeight, INFORMATIVE_MIN, 'and that ceiling is the informative floor');

    /* 1 · A FIRST-EVER MOCK IS WORTH EXACTLY NOTHING — no prior paper, so ŝ is null and w is 0. */
    const first = saveWith([]);
    const p1 = paper({ pred: 70, score: 70, at: now, seed: 's1' });
    const r1 = mock.applyMockCall(first, p1, { now });
    assert.ok(r1, 'the call is eligible — this arm is about the WEIGHT, not the gate');
    assert.equal(r1.w, 0, 'no prior paper → ŝ = null → weightFor(null) = 0');
    const e1 = first.player.rating.calls.at(-1);
    assert.deepEqual(e1, { p: null, ok: true, w: 0, skill: null, at: now }, 'a BLANK slot');
    assert.equal(weightOf(e1), 0);
    assert.equal(first.player.rating.value, JOB.RATING.base,
      'a perfect first forecast moves the rating by exactly 0.00 — the panel implied 0.40');

    /* 2 · WITH A HISTORY INSIDE THE BAND the weight is the CAP, and one slot pays at most 2.50. */
    const warm = saveWith([paper({ pred: 0, score: 50, at: now - 2 * DAY, seed: 'h1' })]);
    const p2 = paper({ pred: 80, score: 80, at: now, seed: 's2' });
    const r2 = mock.applyMockCall(warm, p2, { now });
    assert.equal(mock.mockPriorMean(warm, p2), 0.5, 'ŝ is the mean score fraction of the prior papers');
    assert.equal(r2.w, JOB.RATING.mockWeight, 'min(4·0.5·0.5, 0.25) = 0.25 — the cap BINDS');
    const e2 = warm.player.rating.calls.at(-1);
    assert.deepEqual(e2, { p: 1, ok: true, w: JOB.RATING.mockWeight, skill: null, at: now });
    assert.equal(qHatOf(e2), null, 'no MAKE, so no q̂ — but the weight was still measured');
    near(r2.contribution, mock.MOCK_CALL_SLOT_MAX, 1e-12, 'a perfect forecast pays the slot maximum');
    near(warm.player.rating.value,
      JOB.RATING.base + (JOB.RATING.scale * mock.MOCK_CALL_SLOT_MAX) / JOB.RATING.N, 1e-12);
    /* the number the old constant published, and the number that ships */
    near(warm.player.rating.value - JOB.RATING.base, 0.10, 1e-12);
    near((JOB.RATING.scale * (1 * credit(1, true))) / JOB.RATING.N, 0.40, 1e-12,
      'w = 1.0 would have paid 0.40 — four times what the shipped law pays');

    /* 3 · A HISTORY OUTSIDE THE BAND weighs nothing, however exact the forecast. */
    const sharp = saveWith([paper({ pred: 0, score: 95, at: now - 2 * DAY, seed: 'h2' })]);
    const p3 = paper({ pred: 95, score: 95, at: now, seed: 's3' });
    const r3m = mock.applyMockCall(sharp, p3, { now });
    assert.equal(mock.mockPriorMean(sharp, p3), 0.95);
    assert.equal(r3m.w, 0, 'ŝ = 0.95 is outside INFORMATIVE_BAND — the same gate a job call passes');
    assert.equal(sharp.player.rating.calls.at(-1).p, null, 'and it takes its slot BLANK');

    /* 4 · NO SHIPPED CALLER EVER PASSES THE CEILING UNCONDITIONALLY. The constant is a ceiling, and
       the sentence Settings prints must say `min(4ŝ(1−ŝ), 0.25)` and "measured", never "defined". */
    const mockSrc = readFileSync(join(ROOT, 'site/js/screens/mock.js'), 'utf8');
    assert.ok(/mockCallWeight\(sHat\)/.test(mockSrc), 'the weight comes from mockCallWeight, not a constant');
    const settings = readFileSync(join(ROOT, 'site/js/screens/settings.js'), 'utf8');
    if (settings.includes('RATING.mockWeight')) {
      assert.ok(!/weight is defined rather than guessed/.test(settings),
        'Settings still tells the student the Mock’s weight is DEFINED — mockCallWeight measures it');
    }
  });
});

/* =========================================================================================
   7. The G3.1 sanity table  (acceptance #7)
   ========================================================================================= */

describe('G3.1 sanity: the rating each behaviour actually earns', () => {
  test('w·E[c] on the DISCRETE ladder reproduces 1.344 / 2.240 / 2.499 / 2.268', () => {
    for (const [qs, want] of Object.entries(P.sanityWc)) {
      const q = Number(qs);
      assert.equal(r3(wTimesEcDiscrete(q)), want, `w·E[c] at q̂ = ${q}`);
    }
    // the working the orchestrator published, rung by rung
    assert.equal(honestCall(0.80), 85);
    near(expectedCredit(0.85, 0.80), 3.5, 1e-12, 'E[c] = 3.5 at q̂ = .80 on rung 85');
    near(weightFor(0.80) * expectedCredit(0.85, 0.80), 2.240, 1e-12);
    assert.equal(honestCall(0.90), 85);
    near(expectedCredit(0.85, 0.90), 6.3, 1e-12, 'E[c] = 6.3 at q̂ = .90 on rung 85');
    near(weightFor(0.90) * expectedCredit(0.85, 0.90), 2.268, 1e-12);
    assert.equal(honestCall(0.85), 85);
    near(expectedCredit(0.85, 0.85), 4.9, 1e-12, 'E[c] = 4.9 at q̂ = .85 on rung 85');
    near(weightFor(0.85) * expectedCredit(0.85, 0.85), 2.499, 1e-12);
    // and NOT the continuous value the discrete table is sometimes "corrected" to
    near(weightFor(0.80) * expectedCredit(0.80, 0.80), 2.304, 1e-12, 'the continuous object, for contrast');
    assert.notEqual(r3(wTimesEcDiscrete(0.80)), 2.304);
  });

  test('50 truthful calls at q̂ = .70 / .80 / .85 / .90 give 7.69 / 9.48 / 9.998 / 9.54', () => {
    assert.equal(r2(expectedRating(0.70)), P.sanityRating.q70);
    assert.equal(r2(expectedRating(0.80)), P.sanityRating.q80);
    near(expectedRating(0.85), P.sanityRating.q85, 5e-4);
    assert.equal(r2(expectedRating(0.90)), P.sanityRating.q90);
    // the ticket's own tolerance
    near(expectedRating(0.85), 9.99, 0.02, '50 truthful q̂ = .85 calls yield 9.99 ± .02');
  });

  test('50 farmed q̂ = .97 calls yield EXACTLY 5.00 — not one of them is a measurement', () => {
    let win = [];
    for (let i = 0; i < 50; i++) win = windowPush(win, callEntry({ call: 95, ok: true, qHat: 0.97, skill: 'VOC', at: i }));
    assert.equal(win.length, 50, 'round 2: they take their slots…');
    assert.equal(ratingDetail(win).n, 0, '…and none of the fifty is informative');
    assert.equal(ratingFrom(win), 5, 'exactly 5.00');
    assert.equal(expectedRating(0.97), P.sanityRating.farmMastered);
    const d = ratingDetail(win);
    assert.equal(d.n, 0);
    assert.equal(d.value, 5);
    assert.equal(rankFor(d.value), 2, 'a pure mastered-tier-1 farmer is Called 2, not Called 5');
    // even if a farmer's non-informative calls were somehow written to the save, they score nothing
    const forced = Array.from({ length: 50 }, (_, i) => ({ p: 0.95, ok: true, w: weightFor(0.97), at: i }));
    assert.equal(ratingFrom(forced), 5);
  });

  test('calling 50 on everything gives exactly 5.0 — Called 2 forever (G3.7 #9)', () => {
    const rng = rngFrom('job-call', 'call50forever');
    for (const q of [0.05, 0.3, 0.5, 0.7, 0.95]) {
      const win = Array.from({ length: 50 }, (_, i) => callEntry({ call: 50, ok: rng.chance(q), qHat: 0.5, skill: 'VOC', at: i }));
      assert.equal(win.length, 50, 'q̂ = .5 is maximally informative, so the calls DO enter the window');
      assert.equal(ratingFrom(win), 5, `exactly 5.0 whatever the outcomes (q = ${q})`);
      assert.equal(rankFor(ratingFrom(win)), 2);
      assert.equal(rankNameFor(ratingFrom(win)), 'Called 2');
      assert.equal(canCall(95, rankFor(ratingFrom(win))), false, 'and the 95 rung stays locked');
    }
    assert.equal(expectedRating(0.5, { call: 50 }), 5);
    assert.equal(expectedRating(0.85, { call: 50 }), 5, 'a 50 call scores 0 at every q̂');
  });

  test('systematic over-calling clamps the rating to 0.00 — and the published −4.90 is the 85 call', () => {
    near(weightFor(0.5) * expectedCredit(0.95, 0.5), -8.10, 1e-12, 'the 95 call on q̂ = .5 material');
    near(weightFor(0.5) * expectedCredit(0.85, 0.5), -4.90, 1e-12, 'RECORDED: −4.90 is the 85 call');
    assert.equal(expectedRating(0.5, { call: 95 }), P.sanityRating.overcall);
    assert.equal(expectedRating(0.5, { call: 85 }), P.sanityRating.overcall);
    assert.equal(expectedRating(0.5, { call: 95 }), 0, 'clamped at the floor');
    const win = Array.from({ length: 50 }, (_, i) => callEntry({ call: 95, ok: false, qHat: 0.5, skill: 'VOC', at: i }));
    assert.equal(ratingFrom(win), 0);
    assert.equal(ratingDetail(win).clamped, true);
    assert.ok(ratingDetail(win).raw < 0);
    assert.equal(rankFor(0), 1);
  });

  test('a 10⁴-window Monte Carlo of truthful q̂ = .85 play lands on 9.998 ± .02 through ratingFrom itself', () => {
    let total = 0;
    const M = 10000;
    for (let s = 0; s < M; s++) {
      const rng = rngFrom('job-call', 'q85', s);
      const win = Array.from({ length: 50 }, (_, i) => callEntry({ call: 85, ok: rng.chance(0.85), qHat: 0.85, skill: 'FAC2', at: i }));
      total += ratingDetail(win).raw;      // raw, so the clamp does not bias the mean
    }
    const mean = total / M;
    near(mean, 9.998, 0.02, `mean rating over ${M} seeded 50-call windows`);
  });

  test('a run of bad calls is NOT diluted by padding the window (G3.7 #9)', () => {
    const bad = Array.from({ length: 10 }, (_, i) => callEntry({ call: 95, ok: false, qHat: 0.5, skill: 'VOC', at: i }));
    const padded = [...bad, ...Array.from({ length: 40 }, (_, i) => callEntry({ call: 50, ok: true, qHat: 0.5, skill: 'VOC', at: 10 + i }))];
    assert.equal(ratingDetail(bad).raw, ratingDetail(padded).raw,
      'forty zero-credit 50 calls change nothing: the divisor was already 50');
  });
});

/* =========================================================================================
   8. Rank  (G2 "Rank")
   ========================================================================================= */

describe('G2 rank: the rating band printed as a word', () => {
  test('rankFor lands on every published threshold and nowhere else', () => {
    const cases = [[0, 1], [4.99, 1], [4.999999, 1], [5.0, 2], [6.4, 2], [6.49, 2], [6.5, 3], [7.6, 3],
      [7.69, 3], [7.7, 4], [8.8, 4], [8.89, 4], [8.9, 5], [10, 5]];
    for (const [r, want] of cases) assert.equal(rankFor(r), want, `rankFor(${r})`);
  });

  test('rankFor agrees with RANKS[].min and is monotone over the whole range', () => {
    for (const row of JOB.RANKS) {
      assert.equal(rankFor(row.min), row.rank, `rating ${row.min} is ${row.name}`);
      assert.equal(rankOf(row.rank), row);
      assert.equal(rankNameFor(row.min), row.name);
      if (row.rank > 1) assert.equal(rankFor(row.min - 0.01), row.rank - 1, `just under ${row.min} is one rank lower`);
    }
    let last = 1;
    for (let i = 0; i <= 10000; i++) {
      const got = rankFor(i / 1000);
      assert.ok(got >= last, 'rank never falls as the rating rises');
      last = got;
    }
    assert.equal(rankFor(-5), 1, 'out of range clamps');
    assert.equal(rankFor(99), 5);
    assert.equal(rankFor(null), 2, 'a missing rating reads as the neutral 5.00');
  });

  test('RANK_MEAN_WC is the same ladder expressed as a mean w·c per window SLOT', () => {
    for (const row of JOB.RANKS) {
      const mean = meanWcFor(row.rank);
      if (row.rank === 1) { assert.equal(mean, -Infinity); continue; }
      near(mean, (row.min - JOB.RATING.base) / JOB.RATING.scale, 1e-12, `mean w·c for ${row.name}`);
      // a full window at exactly that mean buys exactly that rank
      const rating = JOB.RATING.base + JOB.RATING.scale * mean;
      assert.equal(rankFor(rating), row.rank);
    }
    assert.deepEqual([...JOB.RANK_MEAN_WC], [-Infinity, 0.0, 0.75, 1.35, 1.95]);
  });

  test('rank gates the 95 call and nothing else that matters', () => {
    for (const row of JOB.RANKS) {
      assert.equal(row.calls.includes(95), row.rank >= 3, `${row.name} and the 95 rung`);
      assert.ok(row.calls.includes(50) && row.calls.includes(70) && row.calls.includes(85),
        'the first three rungs are never taken away');
    }
    // the guard multiplier rises monotonically with rank while ε falls (G2 "Rank helps, monotonically")
    for (let i = 1; i < JOB.RANKS.length; i++) {
      assert.ok(JOB.RANKS[i].guardMult > JOB.RANKS[i - 1].guardMult);
      assert.ok(JOB.RANKS[i].eps <= JOB.RANKS[i - 1].eps);
    }
  });
});

/* =========================================================================================
   9. q̂ — the CLEAR rate on a make over the trailing 10 sittings
   ========================================================================================= */

describe('G3.1 q̂: the CLEAR rate on a make over the trailing 10 sittings', () => {
  // a tiny synthetic index, so the test does not depend on which real cards teach which skill
  const INDEX = { 'c-1': ['FAC2'], 'c-2': ['FAC2', 'SYS'], 'c-3': ['VOC'], 'c-4': { skills: ['SYS', 'FAC2'] } };
  const hist = (...rows) => rows.map(([at, ok, attempt = 1, hints = 0]) => ({ at, ok, attempt, hints, ms: 1000 }));
  const saveWith = (cards) => ({ cards });

  test('a hit is a CLEAR — neither the attempt index nor a hint disqualifies it', () => {
    const save = saveWith({
      'c-1': { history: hist([1, true, 1, 0], [2, true, 1, 2], [3, false, 3, 0], [4, true, 2, 0]) },
    });
    const d = qHatDetail(save, 'FAC2', { cards: INDEX });
    assert.equal(d.of, 4);
    assert.equal(d.hits, 3, 'the clean clear, the Gold-with-H1 clear AND the attempt-2 clear; not the miss');
    assert.equal(d.qHat, 0.75);
    assert.equal(qHatFor(save, 'FAC2', { cards: INDEX }), 0.75);
    assert.equal(d.informative, true);
    near(d.w, 0.75, 1e-12);
  });

  test('THE EVENT: q̂ counts exactly what `c(p, o)` scores — `result.cleared`, not the rung', () => {
    // the same ten sittings, read two ways. The rung index moves; the forecast target must not.
    const rows = Array.from({ length: 10 }, (_, i) => [i, i !== 0, i === 0 ? 3 : (i % 3) + 1, 0]);
    const d = qHatDetail(saveWith({ 'c-1': { history: hist(...rows) } }), 'FAC2', { cards: INDEX });
    assert.equal(d.of, 10);
    assert.equal(d.hits, 9, 'nine cleared — on attempts 1, 2 and 3 alike');
    assert.equal(d.qHat, 0.9, 'q̂ is P(clear), which is what state.applyTarget writes as `o`');

    // and the mismatch that shipped, in one line: a window that NEVER misses must weigh nothing.
    const allClear = Array.from({ length: 10 }, (_, i) => [i, true, (i % 3) + 1, 0]);
    const e = qHatDetail(saveWith({ 'c-1': { history: hist(...allClear) } }), 'FAC2', { cards: INDEX });
    assert.equal(e.qHat, 1, 'ten clears out of ten is q̂ = 1, whatever attempt they arrived on');
    assert.equal(e.w, 0);
    assert.equal(e.informative, false,
      'a student who clears everything cannot be measured — that is the anti-farming gate working');
  });

  test('it is a TRAILING window of 10 attempts, newest first by `at`, across every card of the make', () => {
    const save = saveWith({
      'c-1': { history: hist(...Array.from({ length: 8 }, (_, i) => [100 + i, false, 3])) },   // 8 old misses
      'c-2': { history: hist(...Array.from({ length: 8 }, (_, i) => [200 + i, true, 1])) },    // 8 new firsts
      'c-3': { history: hist([300, true, 1]) },                                                // VOC, not FAC2
    });
    const d = qHatDetail(save, 'FAC2', { cards: INDEX });
    assert.equal(d.attempts, 16, 'both FAC2 cards contribute');
    assert.equal(d.of, 10, 'the window is the trailing ten');
    assert.equal(d.hits, 8, 'the eight recent clears; not the two most recent misses');
    assert.equal(d.qHat, 0.8);
    near(weightFor(d.qHat), 0.64, 1e-12, 'G3.1 publishes w(.8) = .64');
    assert.equal(qHatDetail(save, 'VOC', { cards: INDEX }).qHat, 1, 'VOC saw one card, one clear');
    assert.equal(qHatDetail(save, 'SYS', { cards: INDEX }).of, 8, 'c-2 also teaches SYS');
  });

  test('evidence flows to EVERY skill on the card, the way mastery.applyOutcome already does', () => {
    const save = saveWith({ 'c-4': { history: hist([1, true, 1], [2, false, 3]) } });
    assert.equal(qHatDetail(save, 'SYS', { cards: INDEX }).of, 2, 'primary skill');
    assert.equal(qHatDetail(save, 'FAC2', { cards: INDEX }).of, 2, 'secondary skill');
    assert.equal(qHatDetail(save, 'FAC2', { cards: INDEX, primaryOnly: true }).of, 0, 'primaryOnly restricts to skills[0]');
    assert.equal(qHatDetail(save, 'SYS', { cards: INDEX, primaryOnly: true }).of, 2);
  });

  test('no history ⟹ q̂ is null, weight 0, not informative — "no data", never a fabricated rate', () => {
    for (const save of [{}, { cards: {} }, saveWith({ 'c-3': { history: [] } }), null, undefined]) {
      const d = qHatDetail(save, 'FAC2', { cards: INDEX });
      assert.equal(d.qHat, null);
      assert.equal(d.of, 0);
      assert.equal(d.hits, 0);
      assert.equal(d.w, 0);
      assert.equal(d.informative, false);
      assert.equal(d.source, 'none');
      assert.equal(qHatFor(save, 'FAC2', { cards: INDEX }), null);
    }
    assert.equal(qHatFor(saveWith({ 'c-1': { history: hist([1, true, 1]) } }), null, { cards: INDEX }), null);
  });

  test('it reads the PACKED 5-array history shape too (store.js pack/unpack)', () => {
    const packed = { cards: { 'c-1': { history: [[1, 1, 1, 0, 900], [2, 0, 3, 1, 900], [3, 1, 2, 0, 900]] } } };
    const d = qHatDetail(packed, 'FAC2', { cards: INDEX });
    assert.equal(d.of, 3);
    assert.equal(d.hits, 2, 'the attempt-1 clear and the attempt-2 clear; the middle row is the miss');
    near(d.qHat, 2 / 3, 1e-12);
  });

  test('the card index may be byId, an id→skills map, a Map, an array of cards, or a function', () => {
    const save = saveWith({ 'c-1': { history: hist([1, true, 1], [2, true, 1], [3, false, 3]) } });
    const want = qHatDetail(save, 'FAC2', { cards: INDEX }).qHat;
    near(want, 2 / 3, 1e-12);
    near(qHatFor(save, 'FAC2', { cards: new Map([['c-1', ['FAC2']]]) }), want, 1e-12);
    near(qHatFor(save, 'FAC2', { cards: [{ id: 'c-1', skills: ['FAC2'] }] }), want, 1e-12);
    near(qHatFor(save, 'FAC2', { cards: (id) => (id === 'c-1' ? ['FAC2'] : []) }), want, 1e-12);
    near(qHatFor(save, 'FAC2', { cards: { 'c-1': { skills: ['FAC2'] } } }), want, 1e-12);
    // with no index at all it falls back to a save-resident `skills` field, else reports no data
    assert.equal(qHatFor(save, 'FAC2'), null, 'no index and no save-resident skills ⟹ no data');
    assert.equal(qHatDetail(save, 'FAC2').source, 'no-index',
      'a forgotten opts.cards is diagnosable, not silently an empty history');
    const carried = saveWith({ 'c-1': { skills: ['FAC2'], history: hist([1, true, 1], [2, true, 1], [3, false, 3]) } });
    near(qHatFor(carried, 'FAC2'), want, 1e-12);
    assert.equal(qHatDetail(carried, 'FAC2').source, 'history');
  });

  test('it works on the real card set: every card-bearing make resolves and no q̂ leaves [0, 1]', () => {
    const now = 1_700_000_000_000;
    const save = { cards: {} };
    const rng = rngFrom('job-call', 'qhat-real');
    for (const c of ALL_CARDS) {
      save.cards[c.id] = { history: Array.from({ length: 3 }, (_, i) => ({ at: now + i, ok: rng.chance(0.7), attempt: 1, hints: 0, ms: 900 })) };
    }
    const withCards = new Set(ALL_CARDS.flatMap((c) => c.skills ?? []));
    const all = JOB.WINGS.flatMap((w) => w.skills);
    assert.equal(all.length, 19, 'the four wings partition the 19 makes');
    for (const id of all) {
      const d = qHatDetail(save, id, { cards: CARDS_BY_ID });
      if (!withCards.has(id)) {
        // CSARITH / FAC1 / QUAD-CTX are taught by generated Variants, which write save.variants and
        // not card history, so they honestly have no first-try rate to report from originals alone.
        assert.equal(d.qHat, null, `${id} has no original cards, so q̂ must be "no data"`);
        assert.equal(d.informative, false);
        continue;
      }
      assert.ok(d.of > 0, `${id} must have attempt history in the real card set`);
      assert.ok(d.qHat >= 0 && d.qHat <= 1, `${id} q̂ out of range: ${d.qHat}`);
      assert.ok(d.of <= QHAT_WINDOW, 'the window never exceeds 10');
      near(d.w, weightFor(d.qHat), 1e-12);
    }
    assert.equal(withCards.size, 16, 'sixteen of the nineteen makes have original cards today');
  });

  test('it never mutates the save it reads', () => {
    const save = saveWith({ 'c-1': { history: hist([1, true, 1], [2, false, 3]) } });
    const before = JSON.stringify(save);
    qHatDetail(save, 'FAC2', { cards: INDEX });
    qHatFor(save, 'FAC2', { cards: INDEX });
    assert.equal(JSON.stringify(save), before);
  });
});

/* =========================================================================================
   10. Global law 6 — no pre-call surface names the argmax  (acceptance #8)
   ========================================================================================= */

describe('G1 global law 6: the EV-max rung appears on no pre-call surface', () => {
  const NEEDLES = ['argmaxcall', 'evtable', 'ev-max', 'ev max', 'evmax'];
  /** the two templates that are, by design, DEBRIEF-only (G1: "recommendation after it") */
  const DEBRIEF_ONLY = new Set(['regret', 'regret2']);

  const hit = (s) => NEEDLES.filter((n) => String(s).toLowerCase().includes(n));

  // render a template with a proxy that answers any property, so destructuring always succeeds
  const proxy = (v) => new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? v(k) : undefined) });
  const render = (fn) => {
    const out = [];
    for (const v of [(k) => `⟪${k}⟫`, () => 1, () => 0, () => null]) {
      try { out.push(String(fn(proxy(v)))); } catch { /* a template that needs a real shape is covered by the others */ }
    }
    assert.ok(out.length > 0, 'every COPY template must render with a stub');
    return out;
  };

  test('every COPY template renders, and only the two debrief lines may name the argmax', () => {
    const keys = Object.keys(JOB.COPY);
    assert.ok(keys.length > 40, `expected the full copy table, got ${keys.length} entries`);
    let offenders = [];
    for (const k of keys) {
      const fn = JOB.COPY[k];
      assert.equal(typeof fn, 'function', `COPY.${k} must be a template function`);
      for (const s of render(fn)) {
        const found = hit(s);
        if (!found.length) continue;
        if (DEBRIEF_ONLY.has(k)) continue;
        offenders.push(`COPY.${k} → ${s} (${found.join(', ')})`);
      }
    }
    assert.deepEqual(offenders, [], 'a pre-call surface named the EV-max rung');
  });

  test('the two debrief templates are the ONLY strings in the whole of data/job.js that name it', () => {
    const named = [];
    const walk = (node, path) => {
      if (typeof node === 'string') { if (hit(node).length) named.push(path); return; }
      if (typeof node === 'function') {
        for (const s of render(node)) if (hit(s).length) { named.push(path); return; }
        return;
      }
      if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
    };
    for (const [k, v] of Object.entries(JOB)) walk(v, k);
    const ALLOWED = new Set(['COPY.regret', 'COPY.regret2']);
    assert.deepEqual(named.filter((p) => !ALLOWED.has(p)), [],
      `only the debrief may name the EV-max rung; found ${named.join(', ')}`);
    assert.deepEqual(named, ['COPY.regret2'],
      'exactly one string in the whole data file names it, and it is the debrief regret line');
    // the scanner has teeth: it finds a needle planted in a template of the same shape
    const planted = [];
    const probe = (node, path) => {
      if (typeof node === 'function') { for (const s of render(node)) if (hit(s).length) { planted.push(path); return; } }
    };
    probe(({ a }) => `envelope ${a}: EV-max is 95`, 'PLANTED');
    assert.deepEqual(planted, ['PLANTED'], 'the scanner must be able to fail');
  });

  test('COPY.regret2 is a debrief line: it prints a cost in CREDIT, about an envelope already answered', () => {
    const s = JOB.COPY.regret2({ envelope: 3, called: 85, evMax: 95, cost: 4 });
    assert.match(s, /envelope 3/);
    assert.match(s, /you called 85/, 'past tense — the call is already locked');
    assert.match(s, /cost 4 credit/, 'finding 40: `cost` is a CREDIT gap, and the word has to say so');
  });

  test('no pre-call template mentions a call rung as a recommendation at all', () => {
    // the envelope and its evidence line print EVIDENCE only (G1: "your last 10 on FAC2: 7/10")
    const env = JOB.COPY.envelope({ make: 'FAC2', name: 'Factoring a > 1', grade: 2, cold: 3, posted: 41, from: 'B', tell: 'dropped-gcf' });
    assert.ok(!/\b(50|70|85|95)\b/.test(env), `the envelope must not name a rung: ${env}`);
    const ev = JOB.COPY.evidence({ hits: 7, of: 10, make: 'FAC2' });
    assert.equal(ev, 'your last 10 on FAC2: 7/10');
    assert.ok(!/\b(50|70|85|95)\b/.test(ev.replace(/\b10\b/g, '')), 'the evidence line is a fraction, not a rung');
  });

  test('argmaxCall / evTable are referenced only by Settings, Stats and the debrief', () => {
    const ALLOWED = new Set(['js/job/call.js', 'js/screens/settings.js', 'js/screens/stats.js', 'js/screens/run.js']);
    const offenders = [];
    for (const abs of listFiles(join(ROOT, 'site/js'))) {
      const rel = relative(join(ROOT, 'site'), abs).split('\\').join('/');
      const bare = stripCommentsAndStrings(readFileSync(abs, 'utf8'));
      if (!/\bargmaxCall\b|\bevTable\b|\bevMaxBands\b/.test(bare)) continue;
      if (!ALLOWED.has(rel)) offenders.push(rel);
    }
    assert.deepEqual(offenders, [],
      'Global law 6: the EV-max rung lives in Settings and the debrief. js/screens/job.js may never import it.');
  });

  test('the debrief regret line is computed, and costs nothing when the student was right', () => {
    assert.deepEqual(regretOf({ call: 85, qHat: 0.85 }),
      { called: 85, best: 85, cost: 0, ladder: 'rating', w: weightFor(0.85), ratingCost: 0 });
    const r = regretOf({ call: 70, qHat: 0.85 });
    assert.equal(r.best, 85);
    near(r.cost, expectedCredit(0.85, 0.85) - expectedCredit(0.70, 0.85), 1e-12);
    assert.ok(r.cost > 0);
    const c = regretOf({ call: 50, q: 0.95, ladder: 'carry' });
    assert.equal(c.best, 95);
    near(c.cost, evFor(0.95, 95) - evFor(0.95, 50), 1e-12);
    assert.equal(regretOf({ call: 85 }).cost, 0, 'no q̂ ⟹ no regret claim');
    assert.deepEqual(regretOf({ call: 85 }),
      { called: 85, best: 85, cost: 0, ladder: 'rating', w: 0, ratingCost: 0 }, 'and the shape is the same one');
  });

  /* ── ROUND 3 · the unit. `cost` is CREDIT; the debrief prints it as "rating" ──────────────── */
  test('regretOf prices the same regret in BOTH units, because one of them is ~25x the other', () => {
    // player-feel round 3: the live debrief printed "cost 3.5 rating." under "Rating 4.78 · −0.22".
    // A slot contributes `scale·w·c / N` to the rating, so the conversion is `w·c / 25` — and it is
    // exactly 0 for a call the gate would have blanked. Both of the critic's measured cells:
    for (const [q, called, gap, points] of [[0.55, 70, 0.80, 0.0317], [0.80, 70, 0.30, 0.0077]]) {
      const g = regretOf({ call: called, qHat: q });
      near(g.cost, gap, 5e-3, `credit gap at q̂ = ${q}`);
      near(g.ratingCost, points, 5e-4, `RATING points at q̂ = ${q} — what the line should say`);
      near(g.ratingCost, (JOB.RATING.scale * g.w * g.cost) / JOB.RATING.N, 1e-12, 'the published conversion');
      assert.ok(g.ratingCost < g.cost / 20, 'a credit point is not a rating point, and not by a little');
    }
    // the conversion is the one `ratingDetail` actually performs, measured through it rather than
    // restated: one slot of the called rung against one slot of the honest rung, same outcome mix
    const q = 0.8; const N = JOB.RATING.N;
    const at = (id, ok) => ratingDetail([callEntry({ call: id, ok, qHat: q, skill: 'X', at: 1 })], N).value;
    const delta = q * (at(85, true) - at(70, true)) + (1 - q) * (at(85, false) - at(70, false));
    near(regretOf({ call: 70, qHat: q }).ratingCost, delta, 1e-9,
      'the rating cost IS the rating the window would have paid, through ratingDetail itself');
    // and a call below the gate costs zero rating however wrong it was — it never entered the window
    const blanked = regretOf({ call: 50, qHat: 0.97 });     // w = 0.1164, under the 0.25 gate
    assert.ok(weightFor(0.97) < INFORMATIVE_MIN, 'the premise: q̂ = .97 is not informative');
    assert.ok(blanked.cost > 0, 'the credit regret is real');
    assert.equal(blanked.w, 0);
    assert.equal(blanked.ratingCost, 0, 'but a blank slot cannot cost a rating point');
    assert.equal(regretOf({ call: 50, q: 0.95, ladder: 'carry' }).ratingCost, null,
      'and loot has no rating cost at all — the carry ladder returns null rather than a wrong number');
  });
});

/* =========================================================================================
   11. Alignment: the rating is EARNED in the stake band, not at the coin flip (G3.1 point 2)
   ========================================================================================= */

describe('G3.8 alignment: leverage at q̂ = .5, earnings at q̂ ≈ .85', () => {
  test('the weight peaks at the coin flip but the CREDIT there is exactly 0', () => {
    near(expectedCredit(0.5, 0.5), 0, 1e-12, 'E[c] = 10 − 40q(1−q) is 0 at q = 0.5');
    assert.equal(weightFor(0.5), 1, 'maximum leverage');
    assert.equal(wTimesEcDiscrete(0.5), 0, 'and zero expected gain: leverage, not gain');
    assert.equal(expectedRating(0.5), 5, 'a coin-flip specialist sits at exactly 5.00');
  });

  test('the discrete w·E[c] is single-peaked on [0.5, 1] and peaks inside the published stake band', () => {
    const [lo, hi] = ECON.stakeBand();
    assert.equal(r3(lo), P.wEcBand80[0]);
    assert.equal(r3(hi), P.wEcBand80[1]);
    let best = 0.5; let bestV = -Infinity;
    for (let i = 500; i <= 1000; i++) {
      const q = i / 1000;
      const v = wTimesEcDiscrete(q);
      if (v > bestV) { bestV = v; best = q; }
    }
    assert.ok(best >= lo && best <= hi, `the discrete peak ${best} must lie inside [${lo}, ${hi}]`);
    near(bestV, 2.4998, 5e-4, 'the discrete peak value');
    assert.ok(best > 0.5 + 0.3, 'the rating is earned on material you have just learned, not on a coin flip');
  });

  test('a truthful call on mastered material is worth less than a truthful call in the band', () => {
    assert.ok(expectedRating(0.85) > expectedRating(0.97), 'the deflation G2 promises: posted and rating both fall');
    assert.ok(expectedRating(0.85) > expectedRating(0.60));
    assert.equal(expectedRating(0.97), 5, 'and mastered material stops paying rating altogether');
  });
});

/* =========================================================================================
   12. ONE EVENT — the round-1 call-propriety findings, pinned so they cannot come back
   (notes/call-fix.md).  `q̂`, `o` in `c(p, o)` and `honestCall` must all name the SAME random
   variable: "will this target CLEAR". They did not, and every consequence below was reachable.
   ========================================================================================= */

describe('ONE EVENT: q̂, the credit and the honest call all forecast the same thing', () => {
  const INDEX = { 'c-1': ['FAC2'] };
  const qOf = (rows) => qHatDetail({ cards: { 'c-1': { history: rows } } }, 'FAC2', { cards: INDEX });
  const sit = (at, ok, attempt) => ({ at, ok, attempt, hints: 0, ms: 900 });

  test('q̂ is P(clear), so a window with no miss in it weighs nothing — whatever the rungs were', () => {
    // BEFORE: the alternating attempt-1 / attempt-2 exploit pinned q̂ to exactly 0.50 (w = 1.00,
    // the maximum weight) while `result.cleared` stayed true on every target, and walked to
    // Called 5 in 11 calls. AFTER: ten clears is q̂ = 1, w = 0, nothing enters the window.
    for (const [label, rows] of [
      ['alternating attempt 1 / attempt 2, all cleared', Array.from({ length: 10 }, (_, i) => sit(i, true, i % 2 ? 2 : 1))],
      ['nine first-try clears and one attempt-2 clear', Array.from({ length: 10 }, (_, i) => sit(i, true, i === 0 ? 2 : 1))],
      ['ten clean clears', Array.from({ length: 10 }, (_, i) => sit(i, true, 1))],
    ]) {
      const d = qOf(rows);
      assert.equal(d.qHat, 1, label);
      assert.equal(d.w, 0, label);
      assert.equal(d.informative, false, `${label}: farmed material must never enter the window`);
      let win = [];
      for (let i = 0; i < 60; i++) win = windowPush(win, { call: 95, ok: true, qHat: d.qHat, skill: 'FAC2', at: i });
      assert.equal(ratingDetail(win).n, 0, `${label}: ${ratingDetail(win).n} MEASUREMENTS entered the window`);
      assert.equal(win.length, JOB.CAPS.calls, `${label}: round 2 — the calls still take their slots`);
      assert.equal(ratingFrom(win), 5, `${label}: G3.1 says a farmer sits at exactly 5.00`);
      assert.equal(rankFor(ratingFrom(win)), 2);
    }
  });

  test('a genuine miss is the ONLY thing that makes a call informative — the gate is not a knife-edge', () => {
    // 9/10 CLEARED is q̂ = 0.90 (informative). 10/10 cleared is q̂ = 1 (not). The student crosses the
    // gate by actually failing a target, never by fumbling a first attempt they then recover.
    assert.equal(qOf(Array.from({ length: 10 }, (_, i) => sit(i, i !== 0, i === 0 ? 3 : 1))).qHat, 0.9);
    assert.equal(isInformative(0.9), true);
    assert.equal(qOf(Array.from({ length: 10 }, (_, i) => sit(i, true, i === 0 ? 3 : 1))).qHat, 1);
    assert.equal(isInformative(1), false);
  });

  test('the composer’s own RUNG_BANDS land INSIDE the informative band, mastered material outside', () => {
    // P(clear) = 1 − P(miss) for each shipped band. This is the fit the gate was designed for:
    // the two live bands are measurable, the mastered one is not.
    const clearOf = (m) => 1 - JOB.RUNG_BANDS[m][JOB.MISS_RUNG];
    const [lo, hi] = INFORMATIVE_BAND;
    for (const [m, want] of [[40, true], [60, true], [85, false]]) {
      const q = clearOf(m);
      assert.equal(isInformative(q), want,
        `m${m} clears ${q.toFixed(2)} of the time; informative should be ${want}`);
      if (want) assert.ok(q > lo && q < hi, `m${m} q̂ ${q} is outside [${lo}, ${hi}]`);
    }
    near(clearOf(85), 0.99, 1e-12);
    near(clearOf(60), 0.92, 1e-12);
    near(clearOf(40), 0.81, 1e-12);
    // and each live band earns a real per-slot value against the 1.95 Called 5 asks for
    assert.ok(weightFor(clearOf(40)) * expectedCredit(callLevel(honestCall(clearOf(40))).p, clearOf(40)) > 2,
      'a weak make must be worth staking on');
  });

  test('TRUTH-TELLING WINS: no fixed reporting policy beats honestCall(q̂) over 400 windows', () => {
    // The round-1 blocker in one assertion. With q̂ = P(first-try) and o = P(clear) the app's own
    // honest call came FOURTH here, behind `always 85`, `always 95` and `always 70`.
    const QS = [0.81, 0.92, 0.88, 0.85, 0.90];      // the clear rates the shipped bands produce
    const meanRaw = (policy) => {
      let total = 0;
      for (let s = 0; s < 400; s++) {
        const rng = rngFrom('propriety', s + 1);
        let win = [];
        for (let i = 0; i < 50; i++) {
          const q = QS[i % QS.length];
          win = windowPush(win, { call: policy(q), ok: rng.chance(q), qHat: q, skill: `M${i % 5}`, at: i });
        }
        total += ratingDetail(win).raw;
      }
      return total / 400;
    };
    const truth = meanRaw((q) => honestCall(q));
    for (const fixed of CALLS) {
      assert.ok(truth > meanRaw(() => fixed) + 1e-9,
        `calling ${fixed} on everything scored ${meanRaw(() => fixed).toFixed(4)} against truth's ${truth.toFixed(4)}`);
    }
    for (const shift of [-1, 1]) {
      const v = meanRaw((q) => CALLS[Math.min(CALLS.length - 1, Math.max(0, CALLS.indexOf(honestCall(q)) + shift))]);
      assert.ok(truth > v + 1e-9, `shifting ${shift} rung(s) off truth scored ${v.toFixed(4)} against ${truth.toFixed(4)}`);
    }
  });

  test('honestCall IS the argmax of E[c] at every q̂ the app can compute', () => {
    for (let i = 0; i <= 1000; i++) {
      const q = i / 1000;
      let best = CALLS[0]; let bestV = -Infinity;
      for (const id of CALLS) {
        const v = expectedCredit(callLevel(id).p, q);
        if (v > bestV + 1e-12) { bestV = v; best = id; }
      }
      assert.equal(honestCall(q), best, `honestCall disagreed with the argmax at q̂ ${q}`);
    }
  });

  test('regretOf teaches the rung the propriety argument actually names', () => {
    // `screens/run.js` feeds this from `qHatFor`, so it inherits the event fix. A truthful call has
    // zero regret; nothing can have negative regret.
    for (let i = 0; i <= 200; i++) {
      const q = i / 200;
      const r = regretOf({ call: honestCall(q), qHat: q });
      assert.equal(r.cost, 0, `the honest call carried regret ${r.cost} at q̂ ${q}`);
      for (const id of CALLS) assert.ok(regretOf({ call: id, qHat: q }).cost >= 0);
    }
  });
});

describe('an UNMEASURED window is not a measurement of 5.00 (round-1 finding 6, the hook)', () => {
  const filled = Array.from({ length: 50 }, (_, i) => callEntry({ call: 85, ok: true, qHat: 0.85, skill: 'X', at: i }));

  test('ratingDetail says whether the 5.00 it returns was measured at all', () => {
    const none = ratingDetail([]);
    assert.equal(none.value, 5);
    assert.equal(none.n, 0);
    assert.equal(none.measured, false, 'nothing informative entered the window');
    assert.equal(none.held, false, 'and with no rank passed in, nothing is held');

    const coward = Array.from({ length: 50 }, (_, i) => callEntry({ call: 50, ok: i % 2 === 0, qHat: 0.5, skill: 'X', at: i }));
    const shy = ratingDetail(coward);
    assert.equal(shy.value, 5, 'calling 50 fifty times also scores exactly 5.00 (G3.7 #9)');
    assert.equal(shy.measured, true, 'but THAT 5.00 is a measurement, and the two must be tellable apart');
    assert.equal(ratingDetail(filled).measured, true);
  });

  test('an unmeasured window HOLDS the rank when one is passed, and recomputes when it is not', () => {
    assert.equal(ratingDetail([]).rank, 2, 'unchanged by default: 5.00 still reads Called 2');
    assert.equal(ratingDetail([], JOB.RATING.N, { rank: 5 }).rank, 5, 'held, not demoted');
    assert.equal(ratingDetail([], JOB.RATING.N, { rank: 5 }).held, true);
    assert.equal(ratingDetail(filled, JOB.RATING.N, { rank: 1 }).held, false,
      'a NON-BINDING floor is never held — a rating you earned can still fall, and the rank it bought does not '
      + '(a BINDING floor on a measured window DOES hold: see the S3 ratchet section below)');
    assert.equal(ratingDetail(filled, JOB.RATING.N, { rank: 1 }).rank, rankFor(ratingDetail(filled).value));
  });

  test('rankFor takes an optional floor, and it never lowers a rank', () => {
    assert.equal(rankFor(5), 2);
    assert.equal(rankFor(5, {}), 2, 'default-off');
    assert.equal(rankFor(5, { floor: 4 }), 4);
    assert.equal(rankFor(9.5, { floor: 2 }), 5, 'a floor cannot pull a rank DOWN');
    assert.equal(rankFor(9.5, { floor: null }), 5);
    assert.equal(rankFor.length, 1, 'G8 J2 names rankFor(rating); the floor is optional');
  });
});

/* =========================================================================================
   S3 — MASTERING THE MATERIAL DEMOTED YOU. THE RANK IS A RATCHET.
   (designs/REPAIR-DECISION.md §S3, acceptance items 1, 2, 3 and 5. Items 4 and 6 are the
   `state` / `screen` lanes' — see notes/repair-call.md "Requests".)

   THE FAULT, measured through the shipped functions on a homogeneous 50-call window at the
   honest rung, clears proportioned to q̂:

       q̂ 0.90 → rating 9.536 · n 50 · Called 5 · calls 50,70,85,95 · guardMult 0.75
       q̂ 0.93 → rating 8.656 · n 50 · Called 4
       q̂ 0.95 → rating 5.000 · n  0 · Called 2 · calls 50,70,85    · guardMult 0.55

   Improving from q̂ 0.90 to 0.95 cost three ranks, the 95 rung and guardMult 0.75 → 0.55.

   WHY `held = !measured` WAS NOT THE FIX, and why this section is the assertion that refutes it:
   the demotion is a CONTINUOUS SLIDE in the number of informative slots `k`, not the `n === 0`
   corner. The expressible honest ceiling is `5 + 2·k·(w·E[c])/N`, so a Called-5 student walking
   their makes into mastery is demoted 5 → 4 → 3 → 2 with `measured === true` at every step but
   the last. `!measured` fires only at the last one. The floor covers the whole path, with no new
   constant: `ratingDetail(calls, N, {rank})` now returns `rankFor(value, { floor: rank })`.
   ========================================================================================= */

describe('S3 · the held rank is a FLOOR under the printed rank, not an n === 0 fallback', () => {
  /** `k` informative slots at one q̂/rung (the first `h` cleared), padded to 50 with blank slots. */
  const winOf = ({ k, h, q, call, N = JOB.RATING.N }) => {
    const win = [];
    for (let i = 0; i < k; i++) win.push(callEntry({ call, ok: i < h, qHat: q, skill: 'X', at: i }));
    /* a MASTERED make: q̂ = 1 ⟹ w = 0 ⟹ `callEntry` writes the blank slot `{p: null, w: 0}` */
    for (let i = k; i < N; i++) win.push(callEntry({ call: 85, ok: true, qHat: 1, skill: 'X', at: i }));
    return win;
  };

  test('a MEASURED window with a BINDING floor holds — rank is a ratchet (S3 item 1)', () => {
    /* half the window measured, the other half mastered out of it: 25 informative slots at
       q̂ = 0.90 on the honest rung, 22 of them cleared. Every number below is measured, not
       transcribed — the rating comes out of the shipped scorer. */
    const win = winOf({ k: 25, h: 22, q: 0.9, call: 85 });
    const bare = ratingDetail(win, JOB.RATING.N);
    assert.equal(bare.n, 25, 'the window must be genuinely measured, or this proves nothing about `measured`');
    assert.equal(bare.slots, JOB.RATING.N);
    near(bare.value, 7.066, 0.01, 'the rating this window earns');
    assert.equal(bare.measured, true);
    assert.equal(rankFor(bare.value), 3, 'and on its own it prints Called 3');
    assert.equal(bare.rank, 3, 'with no floor passed, the shipped recomputation is unchanged');
    assert.equal(bare.held, false);

    const held = ratingDetail(win, JOB.RATING.N, { rank: 5 });
    assert.equal(held.value, bare.value, 'the floor moves the RANK, never the rating');
    assert.equal(held.measured, true, 'the window is still a measurement');
    assert.equal(held.rank, 5, 'a student who earned Called 5 is not demoted to 3 for mastering their makes');
    assert.equal(held.held, true, 'and `held` says the floor is what carried it');
    assert.equal(held.n, 25, 'the informative count is untouched — the board still prints 25/50');
  });

  test('a NON-BINDING floor is transparent, and `held` means the floor BOUND (S3 item 2)', () => {
    const win = winOf({ k: 25, h: 22, q: 0.9, call: 85 });
    for (const floor of [1, 2, 3]) {
      const d = ratingDetail(win, JOB.RATING.N, { rank: floor });
      assert.equal(d.rank, rankFor(d.value), `floor ${floor} is at or below the earned rank and may not move it`);
      assert.equal(d.held, false, `floor ${floor} did not bind, so nothing was held`);
    }
    /* the invariant, stated once: `held` ⟺ the floor printed a higher rank than the window did */
    for (const floor of [null, undefined, 1, 2, 3, 4, 5]) {
      const d = ratingDetail(win, JOB.RATING.N, { rank: floor });
      assert.equal(d.held, d.rank > rankFor(d.value), `held disagrees with the floor at ${floor}`);
      assert.ok(d.rank >= rankFor(d.value), 'a floor may never LOWER the printed rank');
    }
  });

  test('the whole SLIDE, not the corner: every step of the walk into mastery holds (S3 item 3)', () => {
    /* A Called-5 student masters their makes five slots at a time. Each step carries the rank the
       previous step printed — exactly what `state.applyTarget` does with `p.rank`. */
    const step = (k) => winOf({ k, h: k, q: 0.85, call: 85 });
    const start = ratingDetail(step(JOB.RATING.N), JOB.RATING.N);
    assert.equal(start.rank, JOB.RANKS.length, 'the walk must START at Called 5 or it measures nothing');

    let rank = start.rank;
    const walk = [];
    let bareFell = 0; let heldMeasured = 0;
    for (let k = JOB.RATING.N; k >= 0; k -= 5) {
      const d = ratingDetail(step(k), JOB.RATING.N, { rank });
      assert.ok(d.rank >= rank, `k = ${k}: the rank FELL ${rank} → ${d.rank} — the ratchet is not holding`);
      if (rankFor(d.value) < start.rank) bareFell++;
      if (d.measured && d.held) heldMeasured++;
      walk.push({ k, value: +d.value.toFixed(3), bare: rankFor(d.value), rank: d.rank, measured: d.measured, held: d.held });
      rank = d.rank;
    }
    assert.equal(rank, start.rank, 'the walk finished on a rank below the one it started with');
    assert.equal(walk.at(-1).k, 0);
    assert.equal(walk.at(-1).measured, false, 'the last step is the unmeasured corner');
    assert.ok(bareFell >= 3,
      `only ${bareFell} of ${walk.length} steps would have been demoted without the floor — the slide is not being exercised`);
    assert.ok(heldMeasured > 0,
      'no step was both MEASURED and HELD, so this walk cannot tell a floor apart from `held = !measured` '
      + `— ${JSON.stringify(walk)}`);
    /* the refutation of the critics' own named fix, as a number: strictly more steps are rescued by
       the floor than `!measured` could ever rescue (which is exactly one, the k = 0 corner) */
    assert.ok(bareFell > 1, `a floor rescued ${bareFell} steps; \`held = !measured\` rescues 1`);
  });

  test('downward mobility that must survive the ratchet, and does (S3 item 5)', () => {
    /* Systematic over-calling: 95 on material that clears half the time. The RATING still goes to
       the clamp with a full fifty measurements — the brake is the CARRY ladder, not the rank. */
    const over = Array.from({ length: JOB.RATING.N }, (_, i) =>
      callEntry({ call: 95, ok: i % 2 === 0, qHat: 0.5, skill: 'X', at: i }));
    const od = ratingDetail(over, JOB.RATING.N, { rank: 5 });
    assert.equal(od.n, JOB.RATING.N, 'k = 50: every slot is a measurement');
    assert.equal(r2(od.value), 0, 'the rating still falls all the way to 0.00');
    assert.equal(od.measured, true);
    assert.equal(rankFor(od.value), 1, 'and on its own the window prints Called 1');
    assert.equal(od.rank, 5, 'the rank is HELD — the published cost of the ratchet (S3.6)');
    assert.equal(od.held, true);

    /* Cowardice: 50 on everything is a MEASUREMENT of exactly 5.00, and buys no rank from any
       floor it could honestly have arrived with. */
    const coward = Array.from({ length: JOB.RATING.N }, (_, i) =>
      callEntry({ call: 50, ok: i % 2 === 0, qHat: 0.5, skill: 'X', at: i }));
    for (const floor of [null, 1, 2]) {
      const cd = ratingDetail(coward, JOB.RATING.N, { rank: floor });
      assert.equal(cd.measured, true, 'calling 50 fifty times IS a measurement (G3.7 #9)');
      assert.equal(cd.value, JOB.RATING.base, 'and it scores exactly 5.00');
      assert.equal(cd.rank, 2, `Called 2 forever, from floor ${floor}`);
      assert.equal(cd.held, false, 'nothing was held: cowardice earns the rank it prints');
    }
  });
});

/* =========================================================================================
   S3-CAP · ROUND-4 VERIFY — A RATCHET MAY NOT BANK LUCK.

   THE BLOCKER. S3 made `player.rank` a floor that every writer persists, so the currency that
   gates the 95 rung and guardMult stopped being `E[rating]` and became `max_t rating_t`. A max
   over a NOISY statistic pays for VARIANCE: at equal mean the wider report strictly dominates.
   Measured through the shipped `windowPush → ratingDetail({rank}) → persisted rank` path, 400
   lives of 300 calls each, before the cap:

       true q 0.55   honest reached Called >= 3 in 33.0 % of lives, `always 70` in 83.0 %
       true q 0.60   honest 68.5 % / Called 5 in  3.5 %,  `always 70` 98.8 % / 35.8 %
       q̂ = 0.60 held fixed — the exact 50↔70 indifference of BOTH published ladders — the honest
                   50 prints exactly 5.000 with probability 1, so the lie was the ONLY report that
                   could ever print above it.

   THE FIX, and what these arms measure. `ratingDetail` now prices the rank off `earned =
   min(value, ceiling)`, where `ceiling` is `Σ w·E[c](p, q̂)/N` mapped through the rating formula —
   the rating the student's OWN REPORTS are worth on this material. It reads `ok` on no slot, so
   no run of luck can raise it, and because the credit is strictly proper it is maximised SLOT BY
   SLOT by the truthful rung. The published claims it restores, each an arm below:
     · G3.8 #3 "truthful self-assessment is the dominant reporting policy" — §1 (an identity over
       every q̂ the game can compute), §4 (driven, on the floored rank the game persists).
     · G3.7 #9 "the brake on systematic over-calling is the CARRY ladder, not the rating" — §3:
       at q̂ = 3/5 the rating ladder no longer hands the over-caller anything AT ALL, whatever the
       dice do, so the carry ladder is once again the only thing separating the two rungs there.
   §5 is the anti-tautology arm: the SAME draws, ratcheted the pre-fix way, reproduce the defect.
   ========================================================================================= */

describe('S3-CAP · the ratchet is priced off the calls, not off the dice', () => {
  const N = JOB.RATING.N;
  /* ────────────────────────────────────────────────────────────────────────────────────────────
     VERIFY r3 · BLOCKER (call-propriety). THIS CONSTRUCTOR USED TO READ:

         const QHATS = Array.from({length: JOB.RATING.qHatWindow + 1}, (_, k) => k / JOB.RATING.qHatWindow)
           .filter(isInformative);                       // …asserted below as exactly [0.1 … 0.9]

     — "`RATING.qHatWindow` is 10, so every reachable q̂ is `k/10`", which is FALSE. `qHatDetail`
     divides by the sittings the make HAS (`const win = seenBefore.slice(-size); const of =
     win.length; … hits / of`), so a make reports `h/of` with `of = min(10, sittings)` and every
     make is below ten sittings until its tenth. 6/7 is reachable and pays `w·E[c] = 2.4980` —
     above the 2.2680 the authority published as the reachable maximum, and essentially the
     CONTINUOUS peak 2.4998. So §1 — the slot-by-slot propriety identity the whole rank cap rests
     on — was verified on 9 of the 31 informative values the app can produce. (It holds at all 31;
     the guard was three times narrower than the space it claimed to cover, which is exactly the
     kind of gap a grid a TEST invents can have and a grid the CODE publishes cannot.)
     `call.reachableQHats` / `informativeQHats` are now that grid, and this suite imports it.
     ──────────────────────────────────────────────────────────────────────────────────────────── */
  const QHATS = informativeQHats().map((r) => r.q);
  const DECILES = Array.from({ length: JOB.RATING.qHatWindow + 1 }, (_, k) => k / JOB.RATING.qHatWindow)
    .filter((q) => isInformative(q));

  /** one slot's ceiling in `w·c` units, read back OUT of the shipped detail (never restated here) */
  const capOf = (call, qHat, ok = true) => {
    const d = ratingDetail([callEntry({ call, ok, qHat, skill: 'X', at: 1 })], N);
    return ((d.ceiling - JOB.RATING.base) * N) / JOB.RATING.scale;
  };
  const windowOf = (call, qHat, clears) =>
    Array.from({ length: N }, (_, i) => callEntry({ call, ok: i < clears, qHat, skill: 'X', at: i }));

  /* ROUND-4 VERIFY. There is no longer a readable and an unreadable branch of `w`: the slot stores
     its own q̂ (`callEntry`'s banner), so `slotCeiling` reads the material instead of guessing a root
     and the theorem below holds at EVERY q̂ the game can compute. `HALF` is kept because the two
     roots' midpoint is what the OLD guess compared against, and §1's negative control reproduces
     that guess to prove this arm measures the fix rather than restating it. */
  const HALF = (INFORMATIVE_BAND[0] + INFORMATIVE_BAND[1]) / 2;
  const LOW = QHATS.filter((q) => q < HALF);
  /** the pre-fix reading: the root that FLATTERS the report, which is all `(w, p)` can support */
  const flatteringCap = (call, qHat) => {
    const w = weightFor(qHat);
    const [lo, hi] = informativeBand(w);
    const p = callLevel(call).p;
    return w * expectedCredit(p, p >= (lo + hi) / 2 ? hi : lo);
  };

  test('§1 the cap is the TRUTHFUL rung’s own worth — no other rung can out-cap it, at ANY q̂', () => {
    assert.equal(HALF, 0.5, 'the two roots are symmetric about a half, or this split means nothing');

    /* THE GRID IS THE CODE'S, AND IT IS NOT THE DECILES. Both halves are asserted so the arm can
       never silently shrink back: the set must hold at least 31 members, and it must strictly
       CONTAIN the nine deciles it used to be. */
    assert.ok(QHATS.length >= 31,
      `the informative reachable grid came out as ${QHATS.length} values: ${QHATS.map((q) => q.toFixed(4)).join(', ')}`);
    assert.deepEqual(DECILES, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9], 'the deciles, for the record');
    for (const d of DECILES) assert.ok(QHATS.some((q) => Math.abs(q - d) < 1e-12), `the decile ${d} left the grid`);
    assert.ok(QHATS.length > DECILES.length * 3, 'the reachable grid is more than three times the decile grid');
    /* and it is EXACTLY what `qHatDetail` returns — driven, not asserted from the same generator */
    for (const { q, hits, of } of informativeQHats()) {
      const hist = Array.from({ length: of }, (_, i) => ({ at: i + 1, ok: i < hits, attempt: 1, hints: 0 }));
      const d = qHatDetail({ cards: { X: { history: hist } } }, 'S', { cards: { X: { skills: ['S'] } } });
      assert.equal(d.of, of, `a make with ${of} sittings must divide by ${of}, not by the window`);
      near(d.qHat, q, 1e-12, `${hits}/${of}`);
    }
    /* THE PUBLISHED REACHABLE MAXIMUM. G3.1 called 2.2680 at q̂ = 0.9 "the best a 10-sitting window
       can actually express"; four reachable values beat it, and the best is 6/7. */
    const best = QHATS.map((q) => ({ q, wec: wTimesEcDiscrete(q) })).sort((a, b) => b.wec - a.wec);
    near(best[0].q, 6 / 7, 1e-12, 'the reachable argmax of w·E[c]');
    near(best[0].wec, 2.4980, 5e-5, 'and what it pays');
    assert.ok(best[0].wec > wTimesEcDiscrete(0.9) + 1e-9,
      `6/7 must beat the published 9/10 maximum ${wTimesEcDiscrete(0.9).toFixed(4)}`);
    assert.equal(best.filter((b) => b.wec > wTimesEcDiscrete(0.9) + 1e-9).length, 4,
      'exactly four reachable q̂ beat the figure the document published as the maximum: 6/7, 5/6, 7/8, 8/9');

    assert.deepEqual(LOW.filter((q) => DECILES.includes(q)), [0.1, 0.2, 0.3, 0.4],
      'the branch the shipped cap used to guess wrong is not in the grid — this arm would prove nothing');
    assert.ok(LOW.length >= 4 && LOW.every((q) => q < HALF));
    let strict = 0;
    for (const q of QHATS) {
      const truth = honestCall(q);
      const best = capOf(truth, q);
      let strictHere = 0;
      for (const id of CALLS) {
        const c = capOf(id, q);
        assert.ok(c <= best + 1e-9,
          `q̂ ${q}: calling ${id} caps at ${c.toFixed(4)} against the honest ${truth}'s ${best.toFixed(4)} `
          + '— a lie out-caps the truth, and the ratchet would bank it');
        if (id !== truth && c < best - 1e-9) { strict++; strictHere++; }
      }
      assert.ok(strictHere > 0, `q̂ ${q}: no rung was STRICTLY worse than the truth`);
      /* and the cap is EXACTLY the worth of the call, which is what makes it un-spikeable.
         AGAINST THE STORED q̂, which is what `slotCeiling` reads: `callEntry` rounds the evidence to
         6 dp (its banner prices G7's byte budget on that), so 2/3 reaches the cap as 0.666667. The
         decile grid could not see this — every decile is exact at 6 dp — and over the real
         reachable grid it is a live, BOUNDED difference, asserted both ways here. */
      const slot = callEntry({ call: truth, ok: true, qHat: q, skill: 'X', at: 1 });
      const stored = qHatOf(slot);
      near(best, weightOf(slot) * expectedCredit(callLevel(truth).p, stored), 1e-12,
        `q̂ ${q}: the cap is not w·E[c] at the honest rung`);
      near(best, weightFor(q) * expectedCredit(callLevel(truth).p, q), 1e-4,
        `q̂ ${q}: 6 dp of stored evidence moved the cap further than that rounding can explain`);
      if (stored === q) {
        near(best, weightFor(q) * expectedCredit(callLevel(truth).p, q), 1e-12,
          `q̂ ${q} is exact at 6 dp, so the cap must be exact too`);
      }
    }
    assert.ok(strict >= QHATS.length * 2,
      `only ${strict} rung/q̂ pairs were STRICTLY out-capped by the truth — this arm is not measuring propriety`);

    /* THE NEGATIVE CONTROL, and the blocker it reproduces. The shipped cap used to read the root
       that flattered the report, and every CALL_LEVELS `p` is ≥ ½, so the root was ALWAYS the
       higher one. On material the student clears 1 time in 10 that priced the 85 lie at the honest
       master's own 2.268 per slot, against 0 for the honest 50. If this loop ever stops finding
       over-priced lies, the arm above has become a tautology. */
    let fooled = 0;
    for (const q of LOW) {
      const truth = honestCall(q);
      assert.equal(truth, CALLS[0], `q̂ ${q}: the honest rung on this branch is the bottom one`);
      assert.equal(capOf(truth, q), 0, 'and the honest 50 is worth exactly nothing at every q̂');
      for (const id of CALLS) {
        if (id === truth) continue;
        if (flatteringCap(id, q) > flatteringCap(truth, q) + 1e-9) fooled++;
      }
    }
    assert.ok(fooled >= LOW.length,
      `the pre-fix reading over-priced only ${fooled} lies on the low branch — the control is dead, so §1 `
      + 'is no longer measuring the round-4 blocker');
    near(flatteringCap(85, 0.1), capOf(85, 0.9), 1e-9,
      'the blocker in one line: (w, p) alone cannot tell an 85 lie at q̂ = 0.1 from an honest 85 at q̂ = 0.9');
    assert.ok(capOf(85, 0.1) < capOf(50, 0.1) - 1e-9,
      'and with the q̂ stored, that same lie is now priced BELOW the honest 50 it was beating');
  });

  test('§1b a slot with NO q̂ — the Mock — keeps the double-root reading, and its LOW arm is live', () => {
    /* `screens/mock.js mockCall` writes `callEntry({ p: 1 − err, w: mockCallWeight(ŝ) })`: it has no
       make, so it has no clear rate, and there is nothing for `slotCeiling` to read. Those slots
       (and every window written before round-4 verify) keep the flattering reading — it can only
       ever cap TOO HIGH, so it demotes nobody, and no game call reaches it any more.
       THE ARM FINDING 4 ASKED FOR. `p = 1 − err`, so a prediction wrong by more than half (predict
       95, score 20 → p = 0.25) is read at the LOWER root. That branch is live code and no test used
       to execute it: replacing the whole conditional with the constant generous root left the suite
       green. It is red now. */
    const q = 0.2;                                     // ŝ = 0.2 ⟹ w = 0.64, roots {0.2, 0.8}
    const w = weightFor(q);
    const [lo, hi] = informativeBand(w);
    near(lo, q, 1e-12); near(hi, 1 - q, 1e-12);
    const p = 0.25;                                    // predict 95, score 20 — the Mock's own shape
    assert.ok(p < 0.5, 'the premise: only a report BELOW a half takes the lower root');

    const slot = callEntry({ p, ok: true, w, skill: null, at: 1 });
    assert.equal(qHatOf(slot), null, 'a Mock slot records a DEFINED weight and no evidence');
    const ceiling = ((ratingDetail([slot], 1).ceiling - JOB.RATING.base) * 1) / JOB.RATING.scale;
    near(ceiling, w * expectedCredit(p, lo), 1e-9, 'the Mock slot is not priced at the LOWER root');
    assert.ok(ceiling > w * expectedCredit(p, hi) + 1e-9,
      `the two roots do not separate here (${(w * expectedCredit(p, lo)).toFixed(4)} vs `
      + `${(w * expectedCredit(p, hi)).toFixed(4)}) — a constant-root mutant would survive this arm`);
    near(w * expectedCredit(p, lo) - w * expectedCredit(p, hi), 7.68, 1e-9,
      'the swing the unpinned branch was worth, in w·c units');

    /* and the HIGH arm still takes the higher root, so the conditional is pinned in both directions */
    const high = callEntry({ p: 0.95, ok: true, w, skill: null, at: 2 });
    const hiCeiling = ((ratingDetail([high], 1).ceiling - JOB.RATING.base) * 1) / JOB.RATING.scale;
    near(hiCeiling, w * expectedCredit(0.95, hi), 1e-9, 'a Mock report above a half is not priced at the HIGHER root');
    assert.ok(hiCeiling > w * expectedCredit(0.95, lo) + 1e-9, 'the two roots do not separate on the high arm either');

    /* THE BOUNDARY IS AN EQUIVALENT MUTANT, AND HERE IS WHY — so the next mutation sweep does not
       re-file `>=` → `>` on that line as an untested branch. `E[c](½, q) = 10 − 40·¼ = 0` for EVERY
       q, so at `p = ½` the two roots pay the same and the comparison's tie side cannot be observed.
       It is not a gap in the arm above; it is a property of the credit at the midpoint. */
    for (const qq of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      near(expectedCredit(0.5, qq), 0, 1e-12, 'the 50 rung is worth exactly nothing at every q̂');
    }
    const tie = callEntry({ p: 0.5, ok: true, w, skill: null, at: 3 });
    assert.equal(ratingDetail([tie], 1).ceiling, JOB.RATING.base,
      'a Mock report of exactly a half caps at the neutral whichever root is taken');

    /* A LEGACY WINDOW — `{p, ok, w}` with no `q`, which is what every save written before this
       round holds — still scores and still caps exactly as it did. */
    const legacy = Array.from({ length: N }, (_, i) => ({ p: 0.85, ok: i < 40, w: weightFor(0.8), skill: 'X', at: i }));
    const dLegacy = ratingDetail(legacy, N);
    near(dLegacy.value, ratingDetail(windowOf(85, 0.8, 40), N).value, 1e-9, 'a legacy window scores differently');
    near(dLegacy.ceiling, ratingDetail(windowOf(85, 0.8, 40), N).ceiling, 1e-9, 'a legacy window caps differently');
  });

  test('§2 no outcome moves the cap: it is a function of the report and the weight, and of nothing else', () => {
    for (const q of QHATS) {
      for (const id of CALLS) {
        assert.equal(capOf(id, q, true), capOf(id, q, false),
          `q̂ ${q}, call ${id}: clearing the target changed the cap — luck can reach the rank again`);
      }
      /* a whole window: fifty outcomes, one ceiling */
      const seen = new Set([0, 1, 25, 49, 50].map((k) => ratingDetail(windowOf(85, q, k), N).ceiling));
      assert.equal(seen.size, 1, `q̂ ${q}: the ceiling moved with the clear count — ${[...seen].join(' / ')}`);
    }
    /* a blank slot is worth nothing and says so: a mastered make cannot buy rank either */
    assert.equal(ratingDetail(windowOf(95, 1, N), N).ceiling, JOB.RATING.base);
  });

  test('§3 at q̂ = 3/5 — the exact indifference of BOTH ladders — the 70 call buys nothing at all', () => {
    const q = JOB.CALL_INDIFFERENCE.rating[0];
    assert.equal(q, JOB.CALL_INDIFFERENCE.carry[0], 'the premise: the two ladders agree on this boundary');
    near(expectedCredit(0.5, q), expectedCredit(0.7, q), 1e-12, 'the rating ladder is exactly tied here');
    near(evFor(q, 50), evFor(q, 70), 1e-12, 'and so is the carry ladder — the lie is FREE on both');

    for (const id of [50, 70]) {
      for (const clears of [0, 1, 12, 25, 30, 37, 49, N]) {
        const d = ratingDetail(windowOf(id, q, clears), N, { rank: 2 });
        near(d.ceiling, JOB.RATING.base, 1e-6,
          `calling ${id} at q̂ = 3/5 was worth ${d.ceiling} — a tied rung must be worth exactly the neutral`);
        assert.equal(d.rank, 2,
          `calling ${id} with ${clears}/${N} clears banked Called ${d.rank} (rating ${d.value.toFixed(3)}) `
          + '— at the indifference point neither rung may buy a rung the other cannot');
      }
    }
    /* the pre-fix statistic, on the same windows, is what the blocker measured */
    assert.equal(rankFor(ratingDetail(windowOf(70, q, N), N).value), JOB.RANKS.length,
      'the un-capped rating of a lucky 70 window still clamps to Called 5 — the cap is what stops it being banked');
    assert.equal(rankFor(ratingDetail(windowOf(50, q, N), N).value), 2,
      'while the honest 50 prints exactly Called 2 whatever the dice do');
  });

  test('§4 honest vs ONE RUNG OVER, on the FLOORED rank the game persists', () => {
    /* Driven exactly as `state.applyTarget:1184-1187` drives it: q̂ snapshotted BEFORE the outcome,
       the entry pushed through `windowPush`, the rank read out of `ratingDetail({ rank })` and
       persisted as the next call's floor. The currency is the rank the save carries, not
       `rankFor(rating)` — which is the comparison the round-4 blocker asks for by name. */
    const shift = (n) => (qHat) => {
      const i = CALLS.indexOf(qHat == null ? CALLS[0] : honestCall(qHat));
      return CALLS[Math.min(CALLS.length - 1, Math.max(0, i + n))];
    };
    const lives = (trueQ, policy, trials = 60, calls = 200) => {
      let banked = 0; let bankedPre = 0;
      for (let s = 1; s <= trials; s++) {
        const rng = rngFrom('s3-cap', `${trueQ}:${s}`);
        let win = []; let rank = 2; let pre = 2; const hist = [];
        for (let i = 0; i < calls; i++) {
          const qHat = hist.length
            ? hist.slice(-JOB.RATING.qHatWindow).filter(Boolean).length / Math.min(hist.length, JOB.RATING.qHatWindow)
            : null;
          const ok = rng.chance(trueQ);
          win = windowPush(win, { call: policy(qHat), ok, qHat: qHat ?? undefined, skill: 'M', at: i }, { N });
          const d = ratingDetail(win, N, { rank });
          rank = d.rank;                                   // the shipped ratchet, on the capped rank
          pre = Math.max(pre, rankFor(d.value));           // the pre-fix ratchet, on rankFor(rating)
          hist.push(ok);
        }
        banked += rank; bankedPre += pre;
      }
      return { banked: banked / trials, pre: bankedPre / trials };
    };

    /* ROUND-4 VERIFY — THE FAMILY THIS ARM USED TO MISS, AND THE BLOCKER IT HID.
       The two-member family `shift(±1)` is UNIFORM: it lies at every q̂, including the ones where
       lying is obviously ruinous, so the cap closed it easily and the arm passed. The policy that
       broke the theorem is BRANCH-CONDITIONAL — tell the truth everywhere the window could read the
       material, and over-call only where it could not (`honestCall(q̂)` is the bottom rung, i.e.
       q̂ < ½, where `w` used to be ambiguous). Measured on the shipped ratchet before the q̂ was
       stored, that policy out-banked truth at FIVE of six true q. It is in the family now. */
    const branchShift = (n) => (qHat) => {
      const honest = qHat == null ? CALLS[0] : honestCall(qHat);
      if (honest !== CALLS[0]) return honest;                 // readable material: tell the truth
      return CALLS[Math.min(CALLS.length - 1, n)];            // unreadable material: over-call
    };
    const FAMILY = [
      ['+1 rung uniform', shift(1)],
      ['−1 rung uniform', shift(-1)],
      ['+1 rung on the bottom-rung branch only', branchShift(1)],
      ['+2 rungs on the bottom-rung branch only', branchShift(2)],
      ['top rung on the bottom-rung branch only', branchShift(CALLS.length - 1)],
    ];

    let preDefect = 0; let branchTested = 0;
    for (const trueQ of [0.5, 0.55, 0.6, 0.65, 0.7, 0.8]) {
      const truth = lives(trueQ, shift(0));
      for (const [name, policy] of FAMILY) {
        const lie = lives(trueQ, policy);
        assert.ok(truth.banked >= lie.banked - 1e-9,
          `true q ${trueQ}: "${name}" banked Called ${lie.banked.toFixed(3)} against truth's `
          + `${truth.banked.toFixed(3)} — that reporting policy still out-ranks the honest one`);
        if (name.startsWith('+1 rung on')) branchTested++;
        /* §5, folded in: the SAME draws, ratcheted the pre-fix way, must reproduce the defect —
           otherwise this arm would pass on a scorer that never had the problem. */
        if (lie.pre > truth.pre + 1e-9) preDefect++;
      }
    }
    assert.equal(branchTested, 6, 'the branch-conditional policy was not driven at every true q');
    assert.ok(preDefect > 0,
      'ratcheting `rankFor(rating)` never once beat the truth on these draws — the arm is a tautology, '
      + 'not a measurement of the blocker');
  });

  test('§6 the rank is the WORTH of the calls, moves with no outcome, and leaves Called 5 reachable', () => {
    for (const q of QHATS) {
      for (const id of CALLS) {
        const ranks = new Set(); const earns = new Set();
        for (const clears of [0, 17, 33, N]) {
          const d = ratingDetail(windowOf(id, q, clears), N);
          assert.equal(d.earned, d.ceiling, 'the rank is read off the ceiling and off nothing else');
          assert.equal(d.rank, rankFor(d.ceiling), 'and with no floor it is exactly that ceiling’s band');
          assert.equal(d.capped, d.value > d.ceiling);
          assert.equal(d.offBand, rankFor(d.value) !== d.rank,
            'offBand must be true exactly when the printed rank is not the printed rating’s band');
          assert.equal(ratingDetail(windowOf(id, q, clears), N, { rank: JOB.RANKS.length }).rank, JOB.RANKS.length,
            'and the floor still holds every rank the student owns');
          ranks.add(d.rank); earns.add(d.earned);
        }
        /* THE WHOLE POINT OF THE ROUND-4 REPAIR, as one assertion: fifty clears and fifty misses on
           the same reports buy the same rank, so `max_t` cannot pay for variance. */
        assert.equal(ranks.size, 1, `q̂ ${q} call ${id}: the rank moved with the clear count — ${[...ranks].join('/')}`);
        assert.equal(earns.size, 1, `q̂ ${q} call ${id}: the rank’s own rating moved with the clear count`);
      }
      /* the honest ceiling IS the published expectation — `expectedRating` computes the same number
         off `wTimesEcDiscrete`, so the cap cannot drift from the table G3.1 publishes */
      /* THE ONE GAP THE WIDER GRID OPENED, bounded rather than waved at. `callEntry` stores q̂ at
         6 dp and `weightOf` rounds `w` to 6 dp; `expectedRating` computes both exactly. A q̂ that is
         exact at 6 dp (every decile, and 3/5, 1/4, …) therefore agrees to the last bit; one that is
         not (2/3, 6/7, 1/7 …) agrees to within what those two roundings can move, which is
         `scale · 5e-7 · c_max` on the rating scale. The decile grid could not see this at all. */
      const stored = qHatOf(callEntry({ call: honestCall(q), ok: true, qHat: q, skill: 'X', at: 1 }));
      const ROUND_EPS = JOB.RATING.scale * 5e-7 * JOB.CREDIT.base;
      near(ratingDetail(windowOf(honestCall(q), q, 0), N).ceiling, expectedRating(q),
        stored === q ? 1e-12 : ROUND_EPS, `q̂ ${q}: the cap and expectedRating disagree`);
    }
    const best = Math.max(...QHATS.map((q) => ratingDetail(windowOf(honestCall(q), q, 0), N).ceiling));
    assert.ok(best >= JOB.RANK_THRESHOLDS[JOB.RANKS.length - 1],
      `the best a truthful window can be WORTH is ${best.toFixed(3)}, below the ${JOB.RANK_THRESHOLDS[4]} `
      + 'Called 5 asks for — the cap has closed the top rank to honest play');
  });

  /* -------------------------------------------------------------------------------------------
     §6b — "CALLED 5 IS REACHABLE" IS A CLAIM ABOUT PLAY, SO IT IS MEASURED BY PLAYING.
     (round-2 verify, call-propriety finding 1: "§6's Called-5 arm takes Math.max over single-q̂
     homogeneous windows, which is arithmetic about the cap rather than a measurement of honest
     play".)

     §6's last two lines take the best `ceiling` over nine homogeneous windows — fifty identical
     calls at one q̂, a window no student produces — and compare it with `RANK_THRESHOLDS[4]`. That
     is a statement about the cap's arithmetic; it stays true on a scorer no live save could ever
     reach the top of. This arm drives the SHIPPED path instead — `windowPush → ratingDetail({rank})
     → the persisted rank`, 60 lives of 200 calls, q̂ recomputed from the student's own clear history
     exactly as `state.applyTarget` recomputes it — and asks how often a TRUTHFUL student actually
     banks Called 5. Measured on this tree:

         true q   truth reaches Called 5   always-95   always-50
         0.70              15 %                0 %        0 %
         0.80              65 %                7 %        0 %
         0.85              68 %                8 %        0 %
         0.95               5 %                2 %        0 %

     The collapse at 0.95 is not a defect, it is G3.7 #3 working: material the student clears 19
     times in 20 drives q̂ towards 1, `w = 4q̂(1−q̂)` towards 0, and a window of blank slots is worth
     the neutral. The top rank is bought on material the student is genuinely uncertain about.
     ------------------------------------------------------------------------------------------- */
  test('§6b Called 5 is reachable BY PLAYING HONESTLY — and it is easy material, not lies, that closes it', () => {
    const truth = (qHat) => (qHat == null ? CALLS[0] : honestCall(qHat));
    const lives = (trueQ, policy, trials = 60, calls = 200) => {
      let reached = 0; let sum = 0;
      for (let s = 1; s <= trials; s++) {
        const rng = rngFrom('s3-cap', `${trueQ}:${s}`);
        let win = []; let rank = 2; const hist = [];
        for (let i = 0; i < calls; i++) {
          const qHat = hist.length
            ? hist.slice(-JOB.RATING.qHatWindow).filter(Boolean).length / Math.min(hist.length, JOB.RATING.qHatWindow)
            : null;
          const ok = rng.chance(trueQ);
          win = windowPush(win, { call: policy(qHat), ok, qHat: qHat ?? undefined, skill: 'M', at: i }, { N });
          rank = ratingDetail(win, N, { rank }).rank;
          hist.push(ok);
        }
        if (rank >= JOB.RANKS.length) reached++;
        sum += rank;
      }
      return { pct: Math.round((100 * reached) / trials), mean: sum / trials };
    };

    const GRID = [0.7, 0.8, 0.85, 0.95];
    const rows = GRID.map((q) => ({
      q,
      truth: lives(q, truth),
      bold: lives(q, () => 95),
      coward: lives(q, () => 50),
    }));
    const table = rows.map((r) => `q ${r.q}: truth ${r.truth.pct}% / 95 ${r.bold.pct}% / 50 ${r.coward.pct}%`).join(' · ');

    assert.ok(rows.some((r) => r.truth.pct >= 40),
      `a truthful student banked Called 5 on at most ${Math.max(...rows.map((r) => r.truth.pct))} % of lives at any `
      + `true q — the top rank is not reachable by honest play (${table})`);
    for (const r of rows) {
      assert.ok(r.truth.pct >= r.bold.pct,
        `true q ${r.q}: calling 95 on everything reached Called 5 on ${r.bold.pct} % of lives against truth's `
        + `${r.truth.pct} % — the top rank is cheaper to lie for (${table})`);
      assert.equal(r.coward.pct, 0, `true q ${r.q}: calling 50 forever reached the top rank (${table})`);
      assert.ok(r.truth.mean >= r.bold.mean - 1e-9, `true q ${r.q}: the bold policy out-banks truth on the mean rank`);
    }
    /* …and the anti-farming half: the SAME honest policy on material that is too easy cannot get
       there, because the window it writes is uninformative. */
    const best = rows.reduce((a, b) => (a.truth.pct >= b.truth.pct ? a : b));
    const easiest = rows[rows.length - 1];
    assert.equal(easiest.q, 0.95, 'the last row must be the mastered-material row');
    assert.ok(easiest.truth.pct * 2 <= best.truth.pct,
      `honest play on material cleared 19 times in 20 still banks Called 5 on ${easiest.truth.pct} % of lives against `
      + `${best.truth.pct} % at true q ${best.q} — the top rank is farmable on easy material (${table})`);
  });

  test('§7 the rank on the page is derivable FROM THE PAGE: both shipped audit lines print the worth', async () => {
    /* THE EXPLOIT-HUNT AND TEST-INTEGRITY BLOCKERS, as one arm, driven through the SHIPPED builders.
       `ratingDetail` computes `ceiling`, the rank is read off it, and for two rounds NO surface
       printed it: a student holding 10.00 over 50 of 50 informative calls was told `Called 2`
       directly above the same panel's legend saying 10.00 is `Called 5`, with nothing on the screen
       to reconcile them. The arm that should have caught it recomputed `rankFor(value)` — the
       number the panel had stopped printing — so it stayed green while the panel contradicted
       itself. This one asserts the property that actually matters: for every shipped window, the
       band containing the printed RATING is the printed RANK's band, OR the line prints the
       ceiling that explains why it is not. */
    const { ratingAuditLine } = await import('../site/js/screens/settings.js');
    const { ledgerRatingLine } = await import('../site/js/screens/stats.js');
    const { fresh } = await import('../site/js/store.js');
    const NOW = Date.UTC(2026, 8, 22);

    let offBand = 0; let onBand = 0;
    for (const q of QHATS) {
      for (const id of CALLS) {
        for (const clears of [0, 11, 25, 38, N]) {
          for (const heldRank of [null, 1, 2, 4, 5]) {
            const save = fresh(NOW);
            save.player.rating.calls = windowOf(id, q, clears);
            if (heldRank != null) save.player.rank = heldRank;
            const d = ratingDetail(save.player.rating.calls, N, { rank: save.player.rank });
            save.player.rating.value = d.value;
            save.player.rating.n = d.n;
            save.player.rank = d.rank;

            const band = rankOf(rankFor(d.value)).name;
            const printedRank = rankOf(d.rank).name;
            for (const [where, line] of [['Settings', ratingAuditLine(save)], ['Stats', ledgerRatingLine(save)]]) {
              assert.ok(line.startsWith(d.value.toFixed(2)), `${where} does not lead with the live rating: "${line}"`);
              assert.ok(line.includes(printedRank), `${where} does not print the rank the save holds: "${line}"`);
              if (band === printedRank) { onBand++; continue; }
              assert.ok(line.includes(d.ceiling.toFixed(2)),
                `${where} prints "${line}": the rating's own band is ${band} but the rank beside it is `
                + `${printedRank}, and the ${d.ceiling.toFixed(2)} the rank comes from is nowhere on the line`);
              assert.equal(d.offBand, true, 'offBand must fire on exactly these windows');
              offBand++;
            }
          }
        }
      }
    }
    assert.ok(offBand > 50,
      `only ${offBand} of the ${offBand + onBand} shipped windows printed a rank outside their rating's band — `
      + 'this arm is not measuring the contradiction it exists to close');
    assert.ok(onBand > 50, `only ${onBand} windows agreed — the arm is not measuring the quiet case either`);

    /* THE EXPLOIT-HUNT'S OWN SAVE, verbatim: q̂ ≈ 0.5 material, the top legal call, every target
       cleared. It used to print `10.00 · Called 2 · 50 of 50 informative calls` and nothing else. */
    const save = fresh(NOW);
    save.player.rating.calls = windowOf(95, 0.5, N);
    const d = ratingDetail(save.player.rating.calls, N, { rank: save.player.rank });
    save.player.rating.value = d.value; save.player.rating.n = d.n; save.player.rank = d.rank;
    assert.equal(d.value, JOB.RATING.max, 'the premise: fifty cleared 95 calls on coin-flip material read 10.00');
    assert.equal(rankOf(rankFor(d.value)).name, rankOf(JOB.RANKS.length).name, 'and 10.00 is the top band');
    assert.equal(d.rank, 2, 'while the calls themselves were worth nothing at all');
    for (const line of [ratingAuditLine(save), ledgerRatingLine(save)]) {
      assert.match(line, /your calls were worth 0\.00/, `the capping quantity is still unprinted: "${line}"`);
    }
  });

  /* ────────────────────────────────────────────────────────────────────────────────────────────
     §8 · VERIFY r3, MAJOR (call-propriety). THE CAP IS PROPER IN q̂, NOT IN BELIEF.

     `slotCeiling(w, p, q) = w·E[c](p, q)` takes its expectation against the slot's STORED q̂ — the
     trailing-10 CLEAR RATE — so `argmax_p` is the rung nearest the RECORD, never the rung nearest
     what the student believes about THIS target. Before the round-4 repair the rank was
     `rankFor(value, {floor})`, which IS proper in belief; pricing it off `ceiling` moved it onto q̂
     and the published sentences did not move with it (G2 THE CAP, G3.1, and Settings' "the only way
     to score well is to say what you actually believe", which is true of the RATING and was printed
     over the RANK). This arm measures the gap on the app's own material so the qualifier can never
     be dropped again: it is not a defect to fix in code — `ok` is the only other thing a slot
     carries and pricing the rank off an outcome is the S3 lottery the ratchet exists to refuse —
     it is a SCOPE that has to be published, and is, at three sites.
     ──────────────────────────────────────────────────────────────────────────────────────────── */
  test('§8 the rung that is honest about THIS target earns more RATING and two bands LESS RANK', () => {
    /* the app's own m60 material: `RUNG_BANDS[60]` says it clears 0.92, the record says 7 of 10 */
    const band = crew.bandFor(60);
    const trueClear = 1 - band[band.length - 1];
    near(trueClear, 0.92, 1e-12, 'RUNG_BANDS[60] — the shipped clear rate of consolidating material');
    const record = 7 / 10;
    assert.equal(honestCall(record), 70, 'honest about the RECORD');
    assert.equal(honestCall(trueClear), 95, 'honest about the TARGET');
    assert.ok(isInformative(record), 'and the record is informative, so these slots really score');

    const fifty = (call) => Array.from({ length: N },
      (_, i) => callEntry({ call, ok: true, qHat: record, skill: 'X', at: i }));
    /** what one slot is WORTH to the rank — read back out of the shipped detail, never restated */
    const rankWorth = (call) => ((ratingDetail(fifty(call), N).ceiling - JOB.RATING.base) * N) / JOB.RATING.scale / N;
    /** what one slot PAYS in expectation at the TRUE clear rate, which is what the student faces */
    const trueWorth = (call) => weightOf(fifty(call)[0]) * expectedCredit(callLevel(call).p, trueClear);

    const rows = [70, 85, 95].map((call) => ({
      call, rank: ratingDetail(fifty(call), N).rank, worth: rankWorth(call), paid: trueWorth(call),
    }));
    const by = (c) => rows.find((r) => r.call === c);

    /* THE RANK LADDER runs the wrong way for a student who knows more than their window does */
    assert.equal(by(70).rank, 3, 'the record-honest 70 buys Called 3 — the gate on the 95 button');
    assert.equal(by(85).rank, 2);
    assert.equal(by(95).rank, 1, 'and the TARGET-honest 95 buys Called 1: two bands lower');
    near(by(70).worth, 1.3440, 5e-5); near(by(85).worth, 0.5880, 5e-5); near(by(95).worth, -0.7560, 5e-5);

    /* THE RATING LADDER runs the right way, at the same time, on the same fifty slots */
    near(by(70).paid, 4.3008, 5e-5); near(by(85).paid, 5.7624, 5e-5); near(by(95).paid, 5.8968, 5e-5);
    assert.ok(by(95).paid > by(70).paid, 'the target-honest report is worth MORE rating in expectation');
    near(by(95).paid - by(70).paid, 1.5960, 5e-5, 'the published per-slot gap');
    assert.equal(Math.max(...rows.map((r) => r.paid)), by(95).paid, 'the rating’s argmax is the TRUE rate’s rung');
    assert.equal(Math.max(...rows.map((r) => r.worth)), by(70).worth, 'the rank’s argmax is the RECORD’s rung');

    /* …and the identity itself is untouched: against q̂, the record's rung is still the argmax */
    for (const { q } of informativeQHats()) {
      const truth = honestCall(q);
      const capOfAt = (call) => ratingDetail([callEntry({ call, ok: true, qHat: q, skill: 'X', at: 1 })], N).ceiling;
      for (const id of CALLS) {
        assert.ok(capOfAt(id) <= capOfAt(truth) + 1e-9,
          `q̂ ${q}: the cap is still proper in the report AGAINST q̂ — ${id} out-capped ${truth}`);
      }
    }
  });
});

/* =========================================================================================
   THE END-TO-END ARM — the outcome out of `crew.bandFor`, the q̂ out of `call.qHatFor`,
   on the SAME save, through `state.applyTarget`     (ticket fix:tests r1, finding 1)
   =========================================================================================

   WHAT WAS MISSING, and why it mattered. Every rating Monte Carlo above passes the outcome in
   BESIDE the q̂ it is supposed to be evidence for:

       callEntry({ call: 85, ok: rng.chance(0.85), qHat: 0.85, … })

   For what those tests claim — "`ratingFrom` reproduces `expectedRating` for a truthful reporter at
   q̂" — that is the correct experiment: a truthful reporter's outcome rate IS their q̂, so wiring
   the two together is the definition of the arm, not a leak. (That part of the round-1 finding is
   wrong; the tests are checking an estimator against its own closed form.)

   What no test anywhere did was draw the outcome from `crew.bandFor` and the q̂ from `call.qHatFor`
   on the SAME save — which is exactly what `state.js` does on every staked target:

       site/js/job/state.js:792   const qHat = call.qHatFor(s, t.make, { cards: opts.cards ?? cardById });
       site/js/job/state.js:793   const entry = call.callEntry({ call: callId, ok, qHat, skill: t.make, at: now });

   With those two decoupled, a harness can hand the window a q̂ of 0.55 while its rungs clear 93 % of
   the time, and the rating goes to the clamp: `tests/job-exploit.test.mjs`'s "mixed baseline" scored
   a raw 11.930 for exactly that reason and the only assertion on it was `> 5`. So this section
   closes the loop: `q̂` is READ BACK out of `save.cards[*].history`, which the arm writes as the
   grade path writes it, and the rungs come from the make's own shipped band.

   The result is the number a calibrated student actually earns, and it is NOT 9.998: the window's
   divisor is a fixed 50 while only INFORMATIVE calls fill it, so a student who knows their material
   fills 18–38 slots and lands in the low sixes. The isolated Monte Carlo's 9.998 is the ceiling of
   a full window, not a prediction about play. */

import * as state from '../site/js/job/state.js';
import * as crew from '../site/js/job/crew.js';
import { mShown } from '../site/js/mastery.js';
import { fresh } from '../site/js/store.js';
import { todayISO, addDays } from '../site/js/days.js';
import { applyOutcome as applySchedule } from '../site/js/schedule.js';
import { isBonus } from '../site/data/source-manifest.js';

const E2E_NOW = new Date(2026, 8, 16, 18, 0).getTime();
const E2E_DAY = 24 * 3600 * 1000;
const E2E_TODAY = todayISO(new Date(E2E_NOW));
const E2E_BANK = ALL_CARDS.filter((c) => !isBonus(c.id));
const E2E_SKILLS = Object.freeze(['VOC', 'NOTE', 'CLASS', 'ASN-PLP', 'ASN-ANG', 'PAIRS', 'FIG-ALG',
  'BISECT-L', 'BISECT-Q', 'SEG-ALG', 'CSARITH', 'CS-LIN', 'CS-RATIO', 'CS-QUAD', 'SYS', 'FAC1',
  'FAC2', 'QUAD-SOLVE', 'QUAD-CTX']);

/** A seeded save with real card records and empty histories — the arm fills those as it plays. */
function e2eSave(i) {
  const rng = rngFrom('j2-e2e-rating', i);
  const s = fresh(E2E_NOW - (4 + rng.int(0, 20)) * E2E_DAY);
  s.profileId = `e2e-${i}`;
  s.settings.testDate = addDays(E2E_TODAY, 6);
  for (let k = 0; k < 40 + rng.int(0, 20); k++) {
    const c = E2E_BANK[rng.int(0, E2E_BANK.length - 1)];
    let rec = null;
    for (let r = 0; r < 3; r++) rec = applySchedule(s, c.id, rng.chance(0.75) ? 'clean' : 'wrong', { now: E2E_NOW - (30 - r * 4) * E2E_DAY });
    if (!rec) continue;
    rec.cleared = true;
    rec.rarity = 'gold';
    rec.due = E2E_NOW + (rng.chance(0.65) ? -rng.float(0, 9) : rng.float(0.2, 12)) * E2E_DAY;
    rec.history = [];                       // the evidence q̂ reads is written BY THE PLAY below
  }
  for (const k of E2E_SKILLS) s.skills[k] = { m: rng.int(35, 92), n: rng.int(3, 9), lastAt: E2E_NOW - rng.int(1, 20) * E2E_DAY, lastDueCorrectAt: null };
  return s;
}

/**
 * Play `jobs` jobs on one save, truthfully.
 *   · the CALL is `honestCall(qHatFor(save, make))`, clamped to what the rank may legally call;
 *   · the OUTCOME is `drawRung(bandFor(mShown(rec)))` — the make's own shipped band;
 *   · the history entry that `qHatFor` will read next time is written by this arm at the moment the
 *     grade path writes it, BEFORE `applyTarget` is told anything (the same discipline
 *     `job-ledger.test.mjs`'s `writeLedgerA` follows: `js/job/*` may not write Ledger A, so the
 *     test stands in for `card.js`).
 */
function e2ePlay(save, { jobs = 8, seed = 1 } = {}) {
  const rng = rngFrom('j2-e2e-play', seed);
  let t = E2E_NOW;
  let answered = 0;
  const qs = [];
  const calls = [];
  /* ROUND 3 — THE INVARIANT THIS ARM USED TO WALK PAST.
     It drove the real `startJob → lockCall → applyTarget` path and then asserted only loose bands
     (`rating >= 2.5`, `<= 8.5`), which both weighting regimes satisfy — so a caller that weighed a
     call with its own outcome could not fail here. Now every staked target checks the one byte that
     separates the regimes: the `w` the shipped path STORED against the `w` the lock-time evidence
     implies. `wMismatch` must be 0; `endoWould` counts the targets on which the ENDOGENOUS reading
     would have stored something else, and must not be 0, or the check is vacuous. */
  let lockedQ = null;
  let lockedCall = null;
  let lockedMake = null;
  let staked = 0;
  let wMismatch = 0;
  let endoWould = 0;
  const firstMismatch = [];
  for (let j = 0; j < jobs; j++) {
    try {
      state.startJob(save, { today: E2E_TODAY, now: t });
      state.beginTargets(save, { now: (t += 6000) });
    } catch { break; }                       // no page left to compose: the run is over
    for (let i = 0; i < 400; i++) {
      const g = state.stateOf(save);
      if (!g || g.outcome != null) break;
      if (g.phase === 'envelope') {
        if (!g.stakes) { state.beginAnswer(save, { now: (t += 1000) }); continue; }
        const tgt = state.pricedTarget(save, {});
        const qHat = qHatFor(save, tgt.make, { cards: CARDS_BY_ID });
        const want = honestCall(qHat ?? 0.5);
        /* the rungs the GAME will accept, read where `state.lockCall` reads them (`player.rank`,
           via `guard.rankOf`). This used to derive them from `rankFor(rating.value)`, which was the
           same set only while `player.rank >= rankFor(value)` held for every save — an invariant the
           round-4 ceiling cap deliberately ends (a lucky rating no longer buys a rung the material
           cannot pay for), and the harness would then seal a 95 the shipped gate refuses. */
        const legal = callsFor(save.player?.rank);
        const callId = legal.includes(want) ? want : legal[legal.length - 1];
        qs.push(qHat);
        calls.push(callId);
        lockedQ = qHat;                          // the evidence as it stood when the call was sealed
        lockedCall = callId;
        lockedMake = tgt.make;                   // `applyTarget` prices the entry against THIS make
        state.lockCall(save, callId, { now: (t += 5000) });
        continue;
      }
      if (g.phase === 'answer') {
        const it = state.currentItem(save);
        const make = (it.skills || [])[0] ?? it.skill;
        const rung = crew.drawRung(crew.bandFor(mShown(save.skills?.[make])), rng.float(0, 1));
        const cleared = rung < 4;
        const result = {
          cleared, firstTry: rung <= 1, hints: rung === 1 ? 1 : 0,
          attempt: rung <= 1 ? 1 : Math.min(3, rung), solutionShown: !cleared,
        };
        const raw = state.unguard(save);
        const rec = raw.cards[it.id] ?? (raw.cards[it.id] = { cleared: false, attempts: 0, bucket: 0, due: t, history: [] });
        if (!Array.isArray(rec.history)) rec.history = [];
        rec.history.push({ at: t, ok: cleared, attempt: result.attempt, hints: result.hints, ms: 9000 });
        state.applyTarget(save, result, { now: (t += 40000), cards: CARDS_BY_ID });
        answered++;
        if (lockedCall != null) {
          staked++;
          const stored = save.player.rating.calls.at(-1);
          /* what the lock-time evidence implies, built through the shipped constructor */
          const want = callEntry({ call: lockedCall, ok: cleared, qHat: lockedQ, skill: lockedMake, at: 0 });
          if (weightOf(stored) !== weightOf(want) || stored.p !== want.p || stored.q !== want.q) {
            wMismatch++;
            if (firstMismatch.length < 3) {
              firstMismatch.push(`${lockedMake}: stored w=${weightOf(stored)} q=${stored.q} p=${stored.p}, `
                + `lock-time w=${weightOf(want)} q=${want.q} p=${want.p}`);
            }
          }
          /* the same entry built from the LIVE reading — the outcome inside its own window */
          const endo = callEntry({
            call: lockedCall, ok: cleared, skill: lockedMake, at: 0,
            qHat: qHatFor(save, lockedMake, { cards: CARDS_BY_ID, before: null }),
          });
          if (weightOf(endo) !== weightOf(want)) endoWould++;
          lockedCall = null;
          lockedQ = null;
          lockedMake = null;
        }
        continue;
      }
      if (g.phase === 'payout' || g.phase === 'bagpush') { state.push(save, { now: (t += 9000) }); continue; }
      if (g.phase === 'brief') { state.brief(save, {}, { now: (t += 20000) }); continue; }
      if (g.phase === 'getaway') { state.crack(save, { now: (t += 25000) }); continue; }
      break;
    }
    t += 3600000;                            // the next evening
  }
  const d = ratingDetail(save.player.rating.calls, JOB.CAPS.calls);
  const known = qs.filter((q) => q != null);
  return {
    answered, calls, window: save.player.rating.calls.length,
    rating: d.value, raw: d.raw, clamped: d.clamped, n: d.n,
    qMean: known.reduce((a, b) => a + b, 0) / Math.max(1, known.length),
    staked, wMismatch, endoWould, firstMismatch,
  };
}

describe('J2 · end to end: the rating a calibrated student actually earns, on a real save', () => {
  const ARMS = Array.from({ length: 5 }, (_, i) => e2ePlay(e2eSave(i), { jobs: 8, seed: i }));
  if (process.env.J2_PRINT) for (const [i, a] of ARMS.entries()) console.log(`e2e ${i}: answered ${a.answered} window ${a.window} rating ${a.rating.toFixed(4)} raw ${a.raw.toFixed(4)} clamped ${a.clamped} qMean ${a.qMean.toFixed(4)}`);

  test('the arm really plays: ≥ 50 targets answered per save, and the window fills from PLAY', () => {
    for (const [i, a] of ARMS.entries()) {
      assert.ok(a.answered >= 50, `save ${i} answered only ${a.answered} targets`);
      assert.ok(a.window >= 10, `save ${i} wrote only ${a.window} informative calls`);
      assert.ok(a.window <= JOB.CAPS.calls, `save ${i} overflowed the 50-slot window`);
      assert.ok(new Set(a.calls).size >= 2, `save ${i} made the same call every time — q̂ is not moving`);
    }
  });

  test('IT IS NEVER CLAMPED — the defect the old "> 5" assertion could not see', () => {
    // `tests/job-exploit.test.mjs`'s mixed baseline scored a raw 11.930 (clamped to 10.00) because
    // its q̂ was a hardcoded 0.55–0.90 while its rungs cleared 92.7 % of the time. Read the q̂ off
    // the same save the outcome came from and the raw rating cannot leave the ladder at all.
    for (const [i, a] of ARMS.entries()) {
      assert.equal(a.clamped, false, `save ${i}: the rating CLAMPED at ${a.raw.toFixed(3)} — q̂ and the outcome have come apart`);
      assert.ok(a.raw > 0 && a.raw < 9.5, `save ${i}: raw rating ${a.raw.toFixed(3)} is outside the band honest play can reach`);
    }
  });

  test('it lands in the band G3.1 publishes for this play, and NOT on the isolated MC\'s 9.998', () => {
    // The Monte Carlo above lands on 9.998 because it fills all fifty slots with MEASUREMENTS at
    // q̂ = .85. End to end the divisor is still 50 and the fifty slots are the last fifty CALLS, most
    // of which a student who knows their material makes on q̂ > 0.933 material — blanks, worth 0.
    // That gap is the anti-farming design working. The band is TWO-SIDED and neither side is 5.00:
    // a truthful reporter still loses credit on the calls they miss (`c(0.85, 0) = −18.9 · w`).
    //
    // ROUND 3 — THIS POPULATION MOVED, and it moved because the game was fixed. The numbers pinned
    // here in round 2 (3.67 · 4.27 · 4.83 · 5.81 · 6.64, mean 5.04) were measured while the stored
    // weight was read AFTER the outcome: `w_clear < w_miss` at q̂ > 0.5, so a truthful student's
    // clears were systematically discounted against their misses. `qHatDetail` now defaults its cut
    // to the sealed call (`call.js sealedCallOf`), so the same play, on the same five seeded saves,
    // with the same RNG, now measures:
    //
    //     5.085 · 5.489 · 6.317 · 6.996 · 9.188      mean 6.615   (n = 8 · 9 · 16 · 30 · 36 slots)
    //
    // The band below is those numbers, not a target. Note the top of it: seed 0 reaches Called 5 off
    // honest play, which round 2's arm asserted was impossible — see notes/tests-fix.md round 3 §1,
    // where it is raised for G3.1, because a rank ceiling is a design claim and this file only
    // measures.
    for (const [i, a] of ARMS.entries()) {
      assert.ok(a.rating >= 2.5, `save ${i}: rating ${a.rating.toFixed(3)} is below anything truthful play produces`);
      assert.ok(a.rating <= 9.5, `save ${i}: rating ${a.rating.toFixed(3)} is above what a mostly-blank window can pay`);
      assert.ok(rankFor(a.rating) >= 2 && rankFor(a.rating) <= 5, `save ${i}: rank ${rankFor(a.rating)}`);
    }
    const mean = ARMS.reduce((t2, a) => t2 + a.rating, 0) / ARMS.length;
    near(mean, 6.6, 1.0, 'the mean end-to-end rating over five seeded saves');
    assert.ok(mean < 9.0, 'and it is nowhere near the isolated Monte Carlo\'s 9.998');
    // and the MEASUREMENTS are genuinely a minority of the window — that is WHY the end-to-end
    // number is not the MC's. (Round 2: the SLOTS are now always full, so it is `n` that carries
    // this claim; asserting `calls.length` measured the old drop-on-push behaviour, not the design.)
    const measured = ARMS.reduce((t2, a) => t2 + a.n, 0) / ARMS.length;
    assert.ok(measured < JOB.CAPS.calls * 0.9,
      `${measured.toFixed(1)} of ${JOB.CAPS.calls} slots are measurements — the divisor is doing the work`);
    assert.ok(measured > 0, 'and the arm does make informative calls, or the band above proves nothing');
  });

  test('the arm is deterministic: the same seed replays to the same rating, bit for bit', () => {
    const again = e2ePlay(e2eSave(0), { jobs: 8, seed: 0 });
    assert.equal(again.raw, ARMS[0].raw);
    assert.equal(again.window, ARMS[0].window);
    assert.deepEqual(again.calls, ARMS[0].calls);
  });

  test('the control: DECOUPLE q̂ from the outcome and the same play clamps — the test can fail', () => {
    // The falsifiability control. Replay one arm's calls, but hand the window the flattering q̂ the
    // old harness used instead of the one the save's own history supports. If this did NOT clamp,
    // the assertions above would be measuring nothing.
    const rng = rngFrom('j2-e2e-control', 3);
    let win = [];
    for (let i = 0; i < JOB.CAPS.calls; i++) {
      win = windowPush(win, callEntry({ call: 85, ok: rng.chance(0.93), qHat: 0.85, skill: 'FAC2', at: i }), { N: JOB.CAPS.calls });
    }
    const d = ratingDetail(win, JOB.CAPS.calls);
    assert.equal(d.clamped, true, 'a 0.93 clear rate reported as q̂ = 0.85 must clamp');
    assert.ok(d.raw > 10, `raw ${d.raw.toFixed(3)} — this is the shape of the 11.930 finding`);
  });
});

/* =========================================================================================
   13. ROUND 2 — the window is the last fifty CALLS, and what the weight has to be for the
   rule to be proper. Every arm here is a regression the round-2 critics found and the suite
   could not see, because every propriety test above evaluates `expectedCredit(p, q)` with an
   EXOGENOUS weight handed in beside the outcome — never the quantity the game maximises.
   (notes/call-fix.md round 2.)
   ========================================================================================= */

describe('R2 · the fifty slots are the last fifty CALLS, not the last fifty measurements', () => {
  const INDEX = { 'c-1': ['FAC2'] };
  const histOf = (rows) => ({ cards: { 'c-1': { history: rows } } });
  const sit = (at, ok) => ({ at, ok, attempt: 1, hints: 0, ms: 900 });

  /**
   * A make played `targets` times at a true clear rate `q`, exactly as the app plays it: the card
   * history is written first (that is `screens/card.js`), `q̂` is read back out of it through
   * `qHatFor`, and the call goes into the window through `callEntry`/`windowPush`.
   * This is the arm round-2 finding 2 asked for — `q̂` drawn from a real ten-sitting history at the
   * shipped clear rate — instead of a q̂ pinned to a constant the ten-sitting window cannot produce.
   *
   * ROUND 3: the read is no longer hand-ordered. This loop used to call `qHatFor` BEFORE pushing the
   * sitting, which models the SPEC — a caller careful enough to read first — and so could not tell
   * whether the shipped module does the same. It now pushes the sitting first, the way the grade
   * path does, and reads with the call SEALED at the lock instant (`inProgress.game.locked.at`,
   * which is `state.lockCall`'s own record): `qHatDetail` applies its own cut, through the same door
   * `state.applyTarget` goes through. Sittings are stamped at `t·10 + 5`, locks at `t·10`, so the
   * cut has room either side and is not knife-edge on a `<`.
   */
  const sealedAt = (rows, at) => ({ ...histOf(rows), inProgress: { game: { locked: { call: 70, n: 1, at } } } });
  function play(q, { targets = 600, seed = 5, N = JOB.CAPS.calls } = {}) {
    const rng = rngFrom('r2-steady', seed);
    const rows = [];
    let win = [];
    for (let t = 0; t < targets; t++) {
      const ok = rng.chance(q);
      rows.push(sit(t * 10 + 5, ok));                                 // the grade path commits first
      const qHat = qHatFor(sealedAt(rows, t * 10), 'FAC2', { cards: INDEX });   // …and the seal cuts it out
      win = windowPush(win, callEntry({ call: honestCall(qHat ?? 0.5), ok, qHat, skill: 'FAC2', at: t }), { N });
    }
    const d = ratingDetail(win, N);
    return { rating: d.value, raw: d.raw, n: d.n, slots: d.slots, rank: d.rank, clamped: d.clamped };
  }

  /** `play` over a SWEEP of seeds — one seeded save is a sample, not a steady state. */
  function sweep(q, { seeds = 40, targets = 900 } = {}) {
    const arms = Array.from({ length: seeds }, (_, s) => play(q, { targets, seed: s + 1 }));
    return {
      arms,
      mean: arms.reduce((t, a) => t + a.rating, 0) / seeds,
      maxRating: Math.max(...arms.map((a) => a.rating)),
      maxRank: Math.max(...arms.map((a) => a.rank)),
      meanMeasured: arms.reduce((t, a) => t + a.n, 0) / seeds,
    };
  }

  test('a mastered farmer converges to the NEUTRAL, which is what G3.1 publishes', () => {
    // THE BLOCKER. `RATING.qHatWindow` is 10, so every reachable q̂ is k/10 and the only two the
    // gate excludes are 0 and 1 — w(0.9) = 0.36 is comfortably informative. At a 0.99 clear rate
    // 9.6 % of targets carry one miss in the last ten, and when the window held ONLY informative
    // calls those few WERE the whole divisor: the farmer saturated at 9.53–10.00 = Called 5 on
    // EVERY seed and could never come down. With the real window their blanks crowd the handful of
    // measurements out and the rating walks back to the neutral.
    // Swept over 40 seeds, because one save is a sample: a farmer's rating now depends on how
    // recently they actually failed something, which is the point.
    const farm = sweep(0.99);
    assert.ok(farm.mean <= 6.5, `a 0.99 farmer averaged ${farm.mean.toFixed(3)} — G3.1 says the neutral`);
    assert.ok(farm.maxRank < 5, `a 0.99 farmer reached Called ${farm.maxRank} on one of the 40 seeds`);
    assert.ok(farm.meanMeasured < JOB.CAPS.calls / 5,
      `${farm.meanMeasured.toFixed(1)} of ${JOB.CAPS.calls} slots were measurements — the blanks are not doing the work`);
    for (const a of farm.arms) assert.equal(a.slots, JOB.CAPS.calls, 'and the window is full — of blanks');

    const perfect = play(1, { targets: 300, seed: 12 });
    assert.equal(perfect.n, 0, 'a 10/10 farmer makes no measurement at all');
    assert.equal(perfect.rating, 5, 'and G3.1\'s "a pure tier-1-mastered farmer\'s rating is 5.00" is true again');
    assert.equal(rankFor(perfect.rating), 2);
  });

  test('a weak make still pays: the fix does not deflate the material the rating is FOR', () => {
    // The two-sided control. If blanks crowding the window were enough to hold everyone at 5.00 the
    // arm above would prove nothing — so the composer's own weakest shipped bands must still earn.
    const clearOf = (m) => 1 - JOB.RUNG_BANDS[m][JOB.MISS_RUNG];
    const weak = sweep(clearOf(40), { targets: 400 });
    const mid = sweep(clearOf(60), { targets: 400 });
    const farm = sweep(clearOf(85), { targets: 900 });
    assert.ok(weak.meanMeasured > JOB.CAPS.calls / 2,
      `only ${weak.meanMeasured.toFixed(1)} of ${JOB.CAPS.calls} slots measured on m40 material`);
    assert.ok(weak.mean > 7.5, `m40 material averaged ${weak.mean.toFixed(3)}`);
    assert.ok(mid.mean > 7.5, `m60 material averaged ${mid.mean.toFixed(3)}`);
    assert.ok(weak.mean > farm.mean + 2 && mid.mean > farm.mean + 2,
      `staking on what you half-know (${weak.mean.toFixed(2)} / ${mid.mean.toFixed(2)}) must beat farming what you know (${farm.mean.toFixed(2)})`);
  });

  test('the window EVICTS: a banked rating decays when the play stops being measurable', () => {
    // Round-2 finding 7. `windowPush` used to return the list unchanged for a non-informative call,
    // so a student who banked Called 5 and then cleared everything (hints and third attempts are
    // clears — see the ONE EVENT banner) could never move their rating again, in either direction.
    let win = [];
    for (let i = 0; i < JOB.CAPS.calls; i++) win = windowPush(win, callEntry({ call: 85, ok: true, qHat: 0.8, skill: 'X', at: i }));
    const banked = ratingDetail(win, JOB.CAPS.calls);
    assert.equal(banked.rank, 5, 'the bank');
    for (let i = 0; i < JOB.CAPS.calls / 2; i++) win = windowPush(win, callEntry({ call: 95, ok: true, qHat: 1, skill: 'X', at: 1000 + i }));
    const half = ratingDetail(win, JOB.CAPS.calls);
    // `value` is still clamped here (the bank's raw is 16.6), so the movement is read off `raw` —
    // which is the point: it is MOVING, where before it could not move at all.
    assert.ok(half.raw < banked.raw, 'half a window of blanks must already have moved it');
    assert.ok(half.sum < banked.sum / 2 + 1e-9, 'half the credit has been evicted');
    assert.equal(half.n, JOB.CAPS.calls / 2, 'half the slots are still measurements');
    for (let i = 0; i < JOB.CAPS.calls; i++) win = windowPush(win, callEntry({ call: 95, ok: true, qHat: 1, skill: 'X', at: 2000 + i }));
    const gone = ratingDetail(win, JOB.CAPS.calls);
    assert.equal(gone.n, 0);
    assert.equal(gone.value, 5, 'and a full window of blanks is exactly the neutral');
    assert.equal(gone.measured, false, 'which `measured` distinguishes from fifty 50-calls');
    assert.equal(ratingDetail(win, JOB.CAPS.calls, { rank: banked.rank }).rank, banked.rank,
      'an UNMEASURED window holds the rank it was passed rather than demoting to Called 2');
  });

  test('a blank slot is invisible to every surface that means "informative calls"', () => {
    // `data/trophies.js rollingBrier` and `screens/stats.js reliabilityBlock` both select on a
    // finite `p` and both document themselves as "the last 20 INFORMATIVE calls". Writing a farmed
    // p = 0.95 / ok = true row into the window would have made the `calibrated` trophy and the
    // reliability diagram farmable by exactly the material the gate exists to exclude.
    const blank = callEntry({ call: 95, ok: true, qHat: 1, skill: 'VOC', at: 7 });
    assert.equal(blank.p, null, 'a non-informative call carries no forecast');
    assert.equal(weightOf(blank), 0);
    assert.equal(blank.q, null, 'and no evidence: nothing downstream may price a slot that pays 0');
    assert.deepEqual(Object.keys(blank), ['p', 'ok', 'q', 'skill', 'at'], 'and the save key order is unchanged');
    /* the DEFINED-weight (Mock) form keeps its own blank, `{p: null, w: 0}`, byte for byte */
    const mockBlank = callEntry({ p: 0.85, ok: true, w: 0, skill: null, at: 7 });
    assert.deepEqual(Object.keys(mockBlank), ['p', 'ok', 'w', 'skill', 'at']);
    assert.equal(mockBlank.w, 0);
    assert.equal(mockBlank.p, null);
    const measured = callEntry({ call: 85, ok: true, qHat: 0.85, skill: 'VOC', at: 8 });
    assert.equal(measured.p, 0.85);
    const win = [blank, measured, blank];
    assert.equal(win.filter((c) => Number.isFinite(c.p)).length, 1, 'the trophy/diagram filter sees one call');
    assert.equal(ratingDetail(win, 3).n, 1);
    assert.equal(ratingDetail(win, 3).slots, 3, 'while the rating sees three slots');
  });
});

describe('R2 · propriety is a property of the WEIGHT, and the weight must be exogenous', () => {
  const slot = (w, p, ok) => (w >= INFORMATIVE_MIN ? w * credit(p, ok) : 0);
  const argmaxSlot = (score) => {
    let best = null; let bestV = -Infinity;
    for (const id of CALL_IDS) { const v = score(callLevel(id).p); if (v > bestV + 1e-12) { bestV = v; best = id; } }
    return best;
  };

  test('THE CONTRACT: with an exogenous w, the argmax of E[w·c] IS honestCall(q) at every q', () => {
    // This is the quantity the game maximises — `Σ(w·c)` through `ratingDetail` — not
    // `expectedCredit(p, q)`, which every propriety test in §2 above evaluates instead.
    let checked = 0;
    for (let i = 0; i <= 1000; i++) {
      const q = i / 1000;
      const w = weightFor(q);
      if (w < INFORMATIVE_MIN) continue;             // a blank slot scores 0 at every rung
      checked++;
      assert.equal(argmaxSlot((p) => q * slot(w, p, true) + (1 - q) * slot(w, p, false)), honestCall(q),
        `the w·c argmax at q = ${q} is not the honest rung`);
    }
    assert.ok(checked > 800, `only ${checked} informative grid points`);
  });

  test('AND WHY THE CALLER MUST SNAPSHOT: an outcome-dependent w bends the argmax MEEKER', () => {
    /* A permanent fact about `w = 4q̂(1−q̂)`, not a pin on today's code. If `q̂` is read out of a
       ten-sitting window that ALREADY CONTAINS the sitting being scored, the clear branch and the
       miss branch carry different weights — `w_clear < w_miss` whenever q̂ > 0.5 — so `E[w·c]` is a
       different objective from `w·E[c]` and its optimum is
       `p* = q·w_clear / (q·w_clear + (1−q)·w_miss) < q`. The student is paid to under-call.

       ROUND 3, and read this before trusting the arm: BOTH REGIMES ARE BUILT HERE, IN THE TEST.
       That makes this a theorem about `w = 4q̂(1−q̂)` and nothing else — it was green while the
       shipped caller was in the meek regime, and it is green now that the caller snapshots. It is
       kept because the mechanism is worth pinning, but the arm that can actually fail when the
       CALLER regresses is §14's, which reads `player.rating.calls[-1].w` off a save that
       `startJob → lockCall → applyTarget` wrote. */
    const W = JOB.RATING.qHatWindow;
    let strict = 0;
    for (let hPrev = Math.ceil(W / 2); hPrev <= W - 1; hPrev++) {
      const q = hPrev / (W - 1);
      const wEx = weightFor(q);
      if (wEx < INFORMATIVE_MIN) continue;
      const wClear = weightFor((hPrev + 1) / W);
      const wMiss = weightFor(hPrev / W);
      assert.ok(wClear <= wMiss, `w is meant to fall as q̂ rises: ${wClear} vs ${wMiss} at ${hPrev}/${W}`);
      const ex = argmaxSlot((p) => q * slot(wEx, p, true) + (1 - q) * slot(wEx, p, false));
      const en = argmaxSlot((p) => q * slot(wClear, p, true) + (1 - q) * slot(wMiss, p, false));
      assert.ok(CALL_IDS.indexOf(en) <= CALL_IDS.indexOf(ex),
        `an outcome-dependent weight made the optimum BOLDER at q = ${q} (${en} vs ${ex})`);
      if (en !== ex) strict++;
    }
    assert.ok(strict > 0, 'the two regimes must actually disagree somewhere, or this proves nothing');
  });

  test('the snapshot: `before` cuts the history at the lock, so a call cannot weigh its own outcome', () => {
    /* ROUND 3: this arm passed `before` explicitly, and at the time NO shipped file did — so it
       tested a parameter the game never used. The final block now drives the DEFAULT instead: with
       `state.lockCall`'s own record on the save (`inProgress.game.locked.at`), `qHatDetail` applies
       the cut whether the caller asks or not, which is the door `state.applyTarget` walks through. */
    const INDEX = { 'c-1': ['FAC2'] };
    const rows = Array.from({ length: 9 }, (_, i) => ({ at: i, ok: i !== 0, attempt: 1, hints: 0, ms: 900 }));
    const LOCK = 100;
    const atLock = qHatDetail({ cards: { 'c-1': { history: rows } } }, 'FAC2', { cards: INDEX, before: LOCK });
    for (const outcome of [true, false]) {
      const after = { cards: { 'c-1': { history: [...rows, { at: LOCK + 1, ok: outcome, attempt: 1, hints: 0, ms: 900 }] } } };
      const snap = qHatDetail(after, 'FAC2', { cards: INDEX, before: LOCK });
      const live = qHatDetail(after, 'FAC2', { cards: INDEX });
      assert.equal(snap.qHat, atLock.qHat, `the snapshot moved when the outcome was ${outcome}`);
      assert.equal(snap.w, atLock.w, 'and so did its weight');
      assert.notEqual(live.qHat, snap.qHat, 'while the un-snapshotted read DOES move — the defect, in one line');
    }
    // and the snapshot is the whole point: one number, taken once, carried on the entry
    const e = callEntry({ call: 85, ok: true, w: atLock.w, skill: 'FAC2', at: LOCK });
    assert.equal(e.w, ECON.round(atLock.w, 6), 'callEntry takes a supplied w in preference to any q̂');

    /* THE DEFAULT, which is what the game actually relies on: a save with a SEALED call gets the cut
       without asking for it, and `before: null` is the documented opt-out that does not. */
    for (const outcome of [true, false]) {
      const after = { cards: { 'c-1': { history: [...rows, { at: LOCK + 1, ok: outcome, attempt: 1, hints: 0, ms: 900 }] } } };
      const sealed = { ...after, inProgress: { game: { locked: { call: 85, n: 3, at: LOCK } } } };
      assert.equal(qHatDetail(sealed, 'FAC2', { cards: INDEX }).qHat, atLock.qHat,
        `the sealed save's DEFAULT read moved when the outcome was ${outcome} — call.js sealedCallOf`);
      assert.equal(qHatDetail(sealed, 'FAC2', { cards: INDEX }).w, atLock.w);
      assert.equal(qHatDetail(sealed, 'FAC2', { cards: INDEX, before: null }).qHat,
        qHatDetail(after, 'FAC2', { cards: INDEX }).qHat, '`before: null` must opt OUT of the cut');
    }
    // …and with no seal at all there is nothing to be endogenous to, so the full history is read
    const unsealed = { cards: { 'c-1': { history: rows } } };
    assert.equal(qHatDetail(unsealed, 'FAC2', { cards: INDEX }).qHat, qHatDetail(unsealed, 'FAC2', { cards: INDEX, before: null }).qHat);
  });
});

describe('R2 · what the scoring rule CANNOT do: a chosen outcome always beats the honest ceiling', () => {
  test('max over outcomes ≥ the truthful expectation, at every rung and every q̂ — a theorem', () => {
    /* Round-2 finding 3 reports that deliberately throwing one target in ten pins q̂ at 0.9, keeps
       every call informative and pays a mean `w·c` of 2.948 — above the 2.499 ceiling G3.1 calls
       "the peak of w·E[c]". That is not a bug that a different scorer removes. For ANY weight and
       ANY scoring rule, `max_o c(p, o) ≥ E_q̂[c(p, o)]`, with equality only where the ladder is flat:
       an expectation is an average of the two branches, so one of them is always at least as large.
       A student who CHOOSES the outcome therefore meets or beats the published ceiling by
       construction, whatever `c` is. The brake on tanking has to be the price of the thrown target
       (ρ = 0, XP 0, the Rematch queue, the loot), never the rating rule — and COMPOSED-GAME.md:500's
       "Tanking is strictly dominated" and :566's "Attendance cannot produce it" have to be re-argued
       on that ground or withdrawn. See notes/call-fix.md round 2 §5. */
    let strict = 0;
    for (let i = 0; i <= 200; i++) {
      const q = i / 200;
      const w = weightFor(q);
      if (w < INFORMATIVE_MIN) continue;
      for (const id of CALL_IDS) {
        const p = callLevel(id).p;
        const chosen = Math.max(w * credit(p, true), w * credit(p, false));
        const truthful = w * expectedCredit(p, q);
        assert.ok(chosen >= truthful - 1e-12,
          `a chosen outcome scored BELOW the expectation at q = ${q}, rung ${id}`);
        if (chosen > truthful + 1e-9) strict++;
      }
    }
    assert.ok(strict > 0, 'and the inequality is strict wherever the ladder is not flat');
    // the published ceiling itself, recomputed, so the number in the note is the code's
    let peak = 0;
    for (let i = 0; i <= 1000; i++) peak = Math.max(peak, wTimesEcDiscrete(i / 1000));
    near(peak, 2.4998, 5e-4, 'max_q w·E[c] on the discrete ladder');
    assert.ok(weightFor(0.9) * credit(callLevel(95).p, true) > peak,
      'one chosen clear at q̂ = 0.9 already exceeds it — which is the whole of finding 3');
  });
});

describe('R2 · GLOBAL LAW 6 by composition: the coarse evidence partition', () => {
  test('every band straddles a rung boundary, so no band names a rung on EITHER ladder', () => {
    /* Round-2 finding 5: `COPY.evidence` prints `your last 10 on FAC2: 8/10` before the call and
       Settings prints the q̂→rung band list, and the two compose into the advisor line this file's
       own `qHatDetail` docblock forbids. call.js holds no copy, so what it can supply is the
       partition — derived from `ratingIndifference()`, so it moves when a rung's `p` moves. */
    const bands = evidenceBands();
    assert.equal(bands.length, ratingIndifference().length, 'one band per boundary to straddle');
    assert.equal(bands[0].from, 0);
    assert.equal(bands[bands.length - 1].to, 1);
    for (let i = 1; i < bands.length; i++) assert.equal(bands[i].from, bands[i - 1].to, 'the bands partition [0, 1]');
    for (const [i, b] of bands.entries()) {
      const honest = new Set(); const evMax = new Set();
      for (let k = 0; k <= 400; k++) {
        const q = b.from + ((b.to - b.from) * k) / 400;
        honest.add(honestCall(q)); evMax.add(argmaxCall(q));
      }
      assert.ok(honest.size >= 2, `band ${i} [${b.from}, ${b.to}) resolves to the single honest rung ${[...honest]}`);
      assert.ok(evMax.size >= 2, `band ${i} [${b.from}, ${b.to}) resolves to the single EV-max rung ${[...evMax]}`);
    }
  });

  test('and no REACHABLE hits/of lands in a band that decodes to one rung', () => {
    const bands = evidenceBands();
    for (let of = 1; of <= QHAT_WINDOW; of++) {
      for (let hits = 0; hits <= of; hits++) {
        const i = evidenceBandOf(hits / of);
        assert.ok(i != null && i >= 0 && i < bands.length, `${hits}/${of} fell outside the partition`);
        const b = bands[i];
        const rungs = new Set();
        for (let k = 0; k <= 200; k++) rungs.add(honestCall(b.from + ((b.to - b.from) * k) / 200));
        assert.ok(rungs.size >= 2, `${hits}/${of} decodes to the single rung ${[...rungs]}`);
      }
    }
    assert.equal(evidenceBandOf(null), null, 'no measurement is not a band');
    assert.equal(evidenceBandOf(NaN), null);
  });

  /* ────────────────────────────────────────────────────────────────────────────────────────────
     §9 · VERIFY r3, MAJOR (player-feel). THE BAND CANNOT SAY WHETHER THE CALL WILL COUNT.

     `INFORMATIVE_MIN` cuts at q̂ = 0.9330127, which is STRICTLY INSIDE the top evidence band
     `[0.8375, 1]`. So the one sentence the sealed envelope prints — `clear rate 84 % or more` —
     covered q̂ 0.84 (w 0.5376, scores) and q̂ 1.00 (w 0, writes a BLANK slot and pays exactly 0)
     alike, and the student found out which only in the payout line, after committing. That is the
     common case, not a corner: spaced repetition drives q̂ to 1 on reviewed makes, so on this
     repo's own mid-week fixture 60 % of a 40-job arm's calls (240 of 400) are blank slots — the
     better the student, the more of their calls stop counting.

     THE FIX IS NOT A FOURTH BAND. Splitting at the cutoff makes `[0.93301, 1]` a band whose every
     q̂ has honest rung 95 AND EV-max 95 — a band that names the argmax, which is the one thing this
     whole partition exists to prevent. `evidenceOf` gives the caller a SECOND STATE instead: one
     shared by BOTH tails, printed INSTEAD of the band, which carries strictly less than the bands
     it replaces because it resolves neither end of either ladder.
     ──────────────────────────────────────────────────────────────────────────────────────────── */
  test('§9 a call that cannot score says so BEFORE the tap, and still names no rung', async () => {
    const bands = evidenceBands();
    const cut = INFORMATIVE_BAND[1];
    const top = bands[bands.length - 1];
    assert.ok(cut > top.from && cut < top.to,
      `the informative cutoff ${cut} must be INSIDE the top band [${top.from}, ${top.to}) — that is the defect`);

    // the four readings the finding measured, through the shipped functions
    for (const [q, measures] of [[0.84, true], [0.90, true], [0.95, false], [1, false]]) {
      const ev = evidenceOf(q);
      assert.equal(ev.measures, measures, `q̂ ${q} → w ${weightFor(q).toFixed(4)}`);
      assert.equal(evidenceBandOf(q), bands.length - 1, `q̂ ${q} is in the SAME printed band as the others`);
      assert.equal(ev.band, measures ? bands.length - 1 : null, 'a blank record is not given a band to print');
    }

    /* THE TWO TAILS ARE ONE STATE, and that is what makes it law-6 safe: the region it denotes is
       `[0, 0.06699) ∪ (0.93301, 1]`, whose honest rung is 50 OR 95 and whose EV-max rung is 50 OR
       95 — it resolves neither. Sampled over both tails rather than asserted from the endpoints. */
    const honest = new Set(); const evMax = new Set();
    for (let k = 0; k <= 400; k++) {
      const q = k / 400;
      if (evidenceOf(q).measures) continue;
      honest.add(honestCall(q)); evMax.add(argmaxCall(q));
    }
    assert.ok(honest.size >= 2 && evMax.size >= 2,
      `the blank state decodes to the single rung ${[...honest]} / ${[...evMax]}`);
    assert.deepEqual([...honest].sort((a, b) => a - b), [CALL_IDS[0], CALL_IDS[CALL_IDS.length - 1]],
      'it spans BOTH ends of the ladder, which is the most ambiguous a pre-call sentence can be');

    /* IT IS NOT RARE ON THE REACHABLE GRID: every make's q̂ = of/of reads 1, which is blank. */
    const reach = reachableQHats();
    const blanks = reach.filter((r) => !evidenceOf(r.q).measures);
    assert.ok(blanks.length >= 2, 'both tails are reachable');
    assert.ok(blanks.some((r) => r.q === 1) && blanks.some((r) => r.q === 0),
      'a make cleared every sitting and a make cleared none both write blank slots');
    assert.equal(reach.length - informativeQHats().length, blanks.length, 'and nothing else is blank');

    /* …and the SHIPPED pre-call surface says it. `screens/job.js` owns the words; this asserts the
       sentence exists, differs from the band sentence it replaces, and is the same for both tails. */
    const screen = await import('../site/js/screens/job.js');
    const env = { make: 'FAC2', name: 'Factoring a > 1', grade: 2, cold: 1.2, posted: 40, from: 'F', tell: null };
    const lineAt = (q) => screen.envelopeLinesOf(env, { qHat: q, hits: 0, of: 10 }).evidence;
    assert.notEqual(lineAt(1), lineAt(0.9),
      'the envelope still prints one sentence for a call that scores and one that pays exactly 0');
    assert.equal(lineAt(1), lineAt(0), 'and the two tails must print the SAME sentence, or it names a tail');
    /* the words themselves — the make's name is the caller's, the sentence is the one under test */
    const blankWords = screen.evidenceWordsOf(1);
    assert.equal(blankWords, screen.evidenceWordsOf(0));
    assert.ok(!/\d/.test(blankWords), `the blank sentence carries a numeral: "${blankWords}"`);
    for (const id of CALL_IDS) {
      assert.ok(!blankWords.includes(String(id)), `the blank sentence names the rung ${id}`);
    }
    assert.equal(screen.evidenceWordsOf(null), null, 'and no history at all is still no history');
  });
});

describe('R2 · q̂ is the CLEAR rate — the exact history the round-2 critic ran', () => {
  test('five clean clears and five attempt-3-with-hints clears are ten hits, not five', () => {
    // COMPOSED-GAME.md:334 and the `qHatWindow` comment at data/job.js:194 still say "first-try
    // rate". The CODE is right and the DOCUMENT is stale — round 1 moved q̂ onto the clear rate
    // deliberately, and moving it back re-opens every arm in §12 (notes/call-fix.md round 1 §1,
    // round 2 §6). This pins the exact command the critic ran, so the disagreement is visible here
    // until the document is corrected.
    const h = [];
    for (let i = 0; i < 5; i++) h.push({ at: i, ok: true, attempt: 1, hints: 0, ms: 1 });
    for (let i = 0; i < 5; i++) h.push({ at: 5 + i, ok: true, attempt: 3, hints: 2, ms: 1 });
    const d = qHatDetail({ cards: { X: { history: h } } }, 'VOC', { cards: { X: { skills: ['VOC'] } } });
    assert.equal(d.qHat, 1, 'a clear on attempt 3 with two hints is still a CLEAR');
    assert.equal(d.hits, 10);
    assert.equal(d.w, 0);
    assert.equal(d.informative, false, 'so ten clears of any shape are not a measurement');
    // the first-try reading, computed here so the gap is a number rather than a claim
    const firstTry = h.filter((e) => e.ok && e.attempt <= 1 && e.hints === 0).length / h.length;
    assert.equal(firstTry, 0.5);
    assert.equal(isInformative(firstTry), true, 'the document\'s statistic would call this maximally informative');
    assert.notEqual(isInformative(firstTry), d.informative, 'the two readings disagree on this history');
  });
});

/* =========================================================================================
   14. ROUND 3 — WHAT THE SHIPPED CALLER ACTUALLY STORES.
   Every propriety arm in §2 and §13 evaluates an objective built INSIDE the test: §13's
   "THE CONTRACT" computes `weightFor(q)` itself, "AND WHY THE CALLER MUST SNAPSHOT" builds both
   regimes in the test body, and "the snapshot" calls `qHatDetail(…, { before })` directly — a
   parameter no shipped file passed at the time. 96 of 96 arms were green while the shipped rule
   was improper, and none of them would have changed colour on the day it was fixed. That is what
   this section is for: it reads `player.rating.calls[-1].w` off a save that
   `state.startJob → lockCall → applyTarget` wrote, and asserts the property THERE.
   (Round-3 critic, lens call-propriety; notes/tests-fix.md §1.)
   ========================================================================================= */

describe('R3 · the weight the SHIPPED path stores, read off the save it wrote', () => {
  const DAY = 24 * 3600 * 1000;
  const cloneSave = (o) => structuredClone(o);

  /**
   * A save whose every card carries a ten-sitting history in a fixed repeating pattern, so the
   * trailing-ten window `qHatDetail` reads is a known mix rather than an accident of seeding.
   * Built the way `screens/card.js` builds one: real Leitner records, real `history` rows.
   */
  function sealSave(pattern, tag) {
    const s = fresh(E2E_NOW - 10 * E2E_DAY);
    s.profileId = `r3-seal-${tag}`;
    s.settings.testDate = addDays(E2E_TODAY, 6);
    let tick = 0;
    let i = 0;
    for (const c of E2E_BANK) {
      i++;
      let rec = null;
      for (let r = 0; r < 3; r++) {
        rec = applySchedule(s, c.id, (i + r) % 4 ? 'clean' : 'wrong', { now: E2E_NOW - (30 - r * 4) * DAY });
      }
      if (!rec) continue;
      rec.cleared = true;
      rec.rarity = 'gold';
      rec.due = E2E_NOW - (i % 9) * DAY;
      rec.history = Array.from({ length: 10 }, () => {
        const ok = pattern[tick % pattern.length];
        tick++;
        return { at: E2E_NOW - 20 * DAY + tick * 60000, ok, attempt: ok ? 1 : 3, hints: 0, ms: 9000 };
      });
    }
    for (const k of E2E_SKILLS) s.skills[k] = { m: 60, n: 6, lastAt: E2E_NOW - 3 * DAY, lastDueCorrectAt: null };
    return s;
  }

  /** Lock a call on the first target of a fresh job and hand back everything the branches need. */
  function lockOne(save) {
    let t = E2E_NOW;
    state.startJob(save, { today: E2E_TODAY, now: t });
    state.beginTargets(save, { now: (t += 6000) });
    const tgt = state.pricedTarget(save, {});
    const legal = callsFor(rankFor(save.player?.rating?.value));
    const atLock = qHatDetail(save, tgt.make, { cards: CARDS_BY_ID });
    const callId = legal.includes(honestCall(atLock.qHat ?? 0.5)) ? honestCall(atLock.qHat ?? 0.5) : legal[legal.length - 1];
    state.lockCall(save, callId, { now: (t += 5000) });
    return { make: tgt.make, callId, atLock, item: state.currentItem(save), t };
  }

  /**
   * One branch of the same locked call, through the real machine: `screens/card.js`'s history push
   * first (that is the ordering the defect lived in — the grade path commits, THEN the game is
   * told), then `state.applyTarget`.
   */
  function branch(base, lock, cleared) {
    const s = cloneSave(base);
    const rec = state.unguard(s).cards[lock.item.id];
    rec.history.push({ at: lock.t + 1, ok: cleared, attempt: cleared ? 1 : 3, hints: 0, ms: 9000 });
    state.applyTarget(s, {
      cleared, firstTry: cleared, hints: 0, attempt: cleared ? 1 : 3, solutionShown: !cleared,
    }, { now: lock.t + 2, cards: CARDS_BY_ID });
    return {
      save: s,
      entry: s.player.rating.calls.at(-1),
      live: qHatDetail(s, lock.make, { cards: CARDS_BY_ID, before: null }),
    };
  }

  test('THE INVARIANT: the same call stores the same w whether it is cleared or missed', () => {
    /* The critic's reproduction, as an assertion. Before the fix this reported w = 0.64 on the clear
       branch and 0.84 on the miss branch — `w_clear < w_miss` at q̂ > 0.5, which is exactly the
       asymmetry that makes `E[w·c]` a different objective from `w·E[c]` and pays the student to
       under-call. Nothing in the suite read those two numbers. */
    const base = sealSave([true, true, true, true, false, true, true, true, true, false], 'inv');
    const lock = lockOne(base);
    assert.ok(lock.atLock.informative,
      `the lock-time q̂ (${lock.atLock.qHat}) is not informative — this arm would prove nothing about w`);

    const C = branch(base, lock, true);
    const M = branch(base, lock, false);

    assert.equal(weightOf(C.entry), weightOf(M.entry),
      `the stored weight moved with the outcome: clear ${weightOf(C.entry)} vs miss ${weightOf(M.entry)} — `
      + 'the caller is reading q̂ after the grade path has written it (call.js `sealedCallOf`)');
    assert.equal(weightOf(C.entry), ECON.round(lock.atLock.w, 6), 'and the weight stored is the one the LOCK-time evidence implies');
    /* ROUND-4 VERIFY: the slot now stores the q̂ ITSELF, so the same invariant is asserted on the
       stored evidence — which is the number the rank cap prices the slot off. */
    assert.equal(C.entry.q, M.entry.q,
      `the stored q̂ moved with the outcome: clear ${C.entry.q} vs miss ${M.entry.q}`);
    assert.equal(C.entry.q, ECON.round(lock.atLock.qHat, 6), 'and it is the LOCK-time clear rate');
    assert.equal(C.entry.p, M.entry.p, 'the forecast differs between the branches');
    assert.equal(C.entry.skill, lock.make);
    assert.equal(C.entry.ok, true);
    assert.equal(M.entry.ok, false);

    /* THE CONTROL — the same two saves, read the way the caller used to read them. If these agreed
       too, the assertion above would be true of any implementation and would prove nothing. */
    assert.notEqual(C.live.qHat, M.live.qHat, 'the live reading does not move with the outcome — the control is dead');
    assert.notEqual(ECON.round(C.live.w, 6), ECON.round(M.live.w, 6),
      `the live weights agree (${C.live.w} vs ${M.live.w}); this save cannot tell the two regimes apart`);
    assert.ok(C.live.w < M.live.w, 'w must FALL as q̂ rises past 0.5 — the whole mechanism of the defect');
  });

  test('…and the argmax of the REALISED objective, built from the stored weights, is honestCall(q)', () => {
    /* §13's "THE CONTRACT" asserts this for a weight the test computed. This asserts it for the two
       weights the shipped path actually wrote into the save, and then measures what the same
       student would have faced under the weights the un-snapshotted read produces. */
    const base = sealSave([true, true, true, true, false, true, true, true, true, false], 'argmax');
    const lock = lockOne(base);
    const C = branch(base, lock, true);
    const M = branch(base, lock, false);
    const wClear = weightOf(C.entry);
    const wMiss = weightOf(M.entry);
    const wLiveClear = C.live.w;
    const wLiveMiss = M.live.w;

    const score = (wc, wm) => (p, q) => q * wc * credit(p, true) + (1 - q) * wm * credit(p, false);
    const argmax = (f, q) => {
      let best = null; let bestV = -Infinity;
      for (const id of CALL_IDS) { const v = f(callLevel(id).p, q); if (v > bestV + 1e-12) { bestV = v; best = id; } }
      return best;
    };
    let meeker = 0;
    let checked = 0;
    for (let i = 60; i <= 95; i++) {
      const q = i / 100;
      assert.equal(argmax(score(wClear, wMiss), q), honestCall(q),
        `the shipped weights put the argmax at ${argmax(score(wClear, wMiss), q)} instead of honestCall(${q})`);
      const endo = argmax(score(wLiveClear, wLiveMiss), q);
      if (CALL_IDS.indexOf(endo) < CALL_IDS.indexOf(honestCall(q))) meeker++;
      checked++;
    }
    assert.equal(checked, 36);
    assert.ok(meeker > 0,
      'the un-snapshotted weights never bent the optimum — this arm is not measuring the defect it names');
  });

  test('every staked target of the five end-to-end saves stored the lock-time weight', () => {
    /* The same invariant over the whole J2 population rather than one hand-built save: 311 staked
       targets across five seeded saves and eight jobs each. `endoWould` counts the targets where the
       endogenous reading would have stored a DIFFERENT weight — the number that makes `wMismatch`
       a measurement rather than a tautology. */
    const arms = Array.from({ length: 5 }, (_, i) => e2ePlay(e2eSave(i), { jobs: 8, seed: i }));
    let staked = 0; let endoWould = 0;
    for (const [i, a] of arms.entries()) {
      assert.ok(a.staked > 0, `save ${i} staked nothing`);
      assert.equal(a.wMismatch, 0,
        `save ${i}: ${a.wMismatch} of ${a.staked} staked targets stored a weight the lock-time evidence does not `
        + `imply — ${a.firstMismatch.join(' · ')}`);
      staked += a.staked;
      endoWould += a.endoWould;
    }
    assert.ok(staked > 250, `only ${staked} staked targets across the five saves`);
    assert.ok(endoWould > 50,
      `the endogenous reading would have differed on only ${endoWould} of ${staked} targets — too few to call this a test`);
  });
});

/* =========================================================================================
   15. ROUND 3 — THE SNAPSHOT IS THE DEFAULT, AND THE TOP RANK IS REACHABLE AGAIN.
   Section 14 measures what the shipped caller stores. This section pins the two things that
   made the stored number right, and the published claim that fell over while it was wrong:

     · `qHatDetail` cuts the history at the save's own sealed call unless told otherwise, so a
       caller cannot make the weight endogenous by forgetting an option (`call.sealedCallOf`).
     · with an exogenous weight the best achievable mean `w·c` is 2.4998 — ABOVE the 1.95 that
       `RANK_MEAN_WC[4]` asks for, so Called 5 is reachable by honest play. With the weight read
       after the outcome it is 1.379, BELOW it, and the top rank was unreachable by any honest
       policy at any q̂. That is round-3 finding 3, as a number, in both regimes.
     · and the fifty slots stop being selected ON THE OUTCOME: a miss can no longer enter the
       window on a target whose clear would have been blanked.
   ========================================================================================= */

describe('R3 · the cut at the seal is the DEFAULT, not a favour the caller does', () => {
  const INDEX = { 'c-1': ['FAC2'] };
  const LOCK = 100;
  const rows = Array.from({ length: 9 }, (_, i) => ({ at: i, ok: i !== 0, attempt: 1, hints: 0, ms: 900 }));
  /** a save shaped the way `state.lockCall` leaves one: `inProgress.game.locked = {call, n, at}` */
  const sealed = (history, at = LOCK) => ({
    cards: { 'c-1': { history } },
    inProgress: { game: { locked: { call: 85, n: 1, at } } },
  });

  test('sealedCallOf reads state.lockCall\'s own record, and nothing that is not one', () => {
    assert.equal(sealedCallOf(sealed(rows)).at, LOCK);
    assert.equal(sealedCallOf(sealed(rows)).call, 85);
    for (const notASeal of [null, undefined, {}, { inProgress: {} }, { inProgress: { game: {} } },
      { inProgress: { game: { locked: null } } }, { inProgress: { game: { locked: { call: 85 } } } },
      { inProgress: { game: { locked: { call: 85, at: 'soon' } } } }]) {
      assert.equal(sealedCallOf(notASeal), null, `${JSON.stringify(notASeal)} is not a sealed call`);
    }
  });

  test('THE FIX: with a call sealed, q̂ is the same number whatever the outcome turns out to be', () => {
    /* Round 3's blocker in one assertion. `state.applyTarget` calls `qHatFor(save, make, {cards})`
       with no `before:` — it did in round 2 and it still does — so before this default existed the
       clear branch and the miss branch carried different weights and the rule was not proper. */
    const atLock = qHatDetail(sealed(rows), 'FAC2', { cards: INDEX });
    assert.equal(atLock.sealed, true, 'the cut came from the save, not from the caller');
    assert.equal(atLock.before, LOCK);
    const ws = new Set();
    for (const outcome of [true, false]) {
      const after = sealed([...rows, { at: LOCK + 1, ok: outcome, attempt: 1, hints: 0, ms: 900 }]);
      const d = qHatDetail(after, 'FAC2', { cards: INDEX });
      assert.equal(d.qHat, atLock.qHat, `q̂ moved when the outcome was ${outcome}`);
      ws.add(callEntry({ call: 85, ok: outcome, qHat: qHatFor(after, 'FAC2', { cards: INDEX }), at: 1 }).w);
    }
    assert.equal(ws.size, 1, 'w_clear ≠ w_miss — the objective is not w·E[c] and the optimum drops below q');
  });

  test('…and the same read with NO seal in the save is the live rate, unchanged', () => {
    // every pre-call surface (the envelope's evidence line) and every post-job one (the debrief)
    // reads a save with no call sealed, so the default costs them nothing
    const plain = { cards: { 'c-1': { history: [...rows, { at: LOCK + 1, ok: true, attempt: 1, hints: 0, ms: 900 }] } } };
    const live = qHatDetail(plain, 'FAC2', { cards: INDEX });
    assert.equal(live.sealed, false);
    assert.equal(live.before, null);
    assert.equal(live.of, 10, 'all ten sittings, the tenth included');
    // the explicit forms still win over the default, in both directions
    const withSeal = sealed(plain.cards['c-1'].history);
    assert.equal(qHatDetail(withSeal, 'FAC2', { cards: INDEX, before: null }).qHat, live.qHat,
      '`before: null` is the opt-out a surface uses when it really wants the live rate');
    assert.equal(qHatDetail(withSeal, 'FAC2', { cards: INDEX, before: 5 }).of, 5,
      'and an explicit `before` beats the seal');
  });

  test('the window stops being selected ON THE OUTCOME: a miss cannot enter where a clear could not', () => {
    /* The round-3 critic measured P(informative | miss) = 1.000 against P(informative | clear) =
       0.380 at q = 0.95 through the shipped pipeline. A sample whose membership depends on the
       outcome is not a calibration measurement, and it is the second half of `windowPush`'s own
       banner. With the cut at the seal the gate is decided before the answer, so the two are equal
       by construction — asserted over every reachable ten-sitting history. */
    const W = JOB.RATING.qHatWindow;
    let separated = 0;
    for (let h = 0; h <= W; h++) {
      const hist = Array.from({ length: W }, (_, i) => ({ at: i, ok: i < h, attempt: 1, hints: 0, ms: 900 }));
      const seen = new Set();
      for (const outcome of [true, false]) {
        const s = sealed([...hist, { at: LOCK + 1, ok: outcome, attempt: 1, hints: 0, ms: 900 }]);
        seen.add(callEntry({ call: 85, ok: outcome, qHat: qHatFor(s, 'FAC2', { cards: INDEX }), at: 1 }).p !== null);
      }
      assert.equal(seen.size, 1, `at ${h}/${W} the outcome decided whether the call was measured at all`);
      // the endogenous reading DOES separate here, or this arm proves nothing
      const endoClear = weightFor((Math.min(W, h + 1)) / W) >= INFORMATIVE_MIN;
      const endoMiss = weightFor(h / W) >= INFORMATIVE_MIN;
      if (endoClear !== endoMiss) separated++;
    }
    assert.ok(separated > 0,
      'no ten-sitting history where the endogenous gate depended on the outcome — this arm is toothless');
  });
});

describe('R3 · Called 5 is reachable by honest play again (finding 3)', () => {
  const slot = (w, p, ok) => (w >= INFORMATIVE_MIN ? w * credit(p, ok) : 0);
  const W = JOB.RATING.qHatWindow;
  const choose = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1); return r; };
  const binom = (n, k, q) => choose(n, k) * q ** k * (1 - q) ** (n - k);

  /** the per-slot value of a FIXED rung at true clear rate `q`, weight snapshotted at the lock */
  const exogenous = (q, p) => { const w = weightFor(q); return q * slot(w, p, true) + (1 - q) * slot(w, p, false); };
  /** …and with `q̂` read back out of a ten-sitting window that already holds the sitting scored:
      the oldest sitting `d` leaves, this outcome `o` arrives, so `w` is a function of `o`. */
  const endogenous = (q, p) => {
    let t = 0;
    for (const d of [1, 0]) {
      const pd = d ? q : 1 - q;
      for (let k = 0; k <= W - 1; k++) {
        const pk = binom(W - 1, k, q);
        for (const o of [1, 0]) t += pd * pk * (o ? q : 1 - q) * slot(weightFor((k + o) / W), p, !!o);
      }
    }
    return t;
  };
  const ceilingOf = (f) => {
    let best = { v: -Infinity, q: null, call: null };
    for (let i = 0; i <= 500; i++) {
      const q = 0.5 + i / 1000;
      for (const id of CALL_IDS) { const v = f(q, callLevel(id).p); if (v > best.v) best = { v, q, call: id }; }
    }
    return best;
  };

  test('the best mean w·c an honest policy can hold is ABOVE the 1.95 the top rank asks for', () => {
    const top = ceilingOf(exogenous);
    near(top.v, wTimesEcDiscrete(top.q), 1e-12, 'the ceiling is reached by the HONEST rung, not by a bolder one');
    assert.equal(top.call, honestCall(top.q), 'and the policy that reaches it is honestCall');
    assert.ok(top.v >= JOB.RANK_MEAN_WC[JOB.RANK_MEAN_WC.length - 1],
      `the best achievable mean w·c is ${top.v.toFixed(4)}, below the ${JOB.RANK_MEAN_WC.at(-1)} `
      + 'G2 publishes for Called 5 — the top rank is unreachable by honest play');
    // and it buys the rank through the shipped scorer, not through arithmetic about it
    const win = Array.from({ length: JOB.CAPS.calls }, (_, i) =>
      ({ p: callLevel(top.call).p, ok: true, w: weightFor(top.q), at: i }));
    assert.equal(rankFor(JOB.RATING.base + JOB.RATING.scale * top.v), JOB.RANKS.length, 'Called 5');
    assert.equal(ratingDetail(win, JOB.CAPS.calls).rank, JOB.RANKS.length);
    near(top.q, 0.853, 2e-3, 'reached in the published stake band, at the peak of w·E[c]');
  });

  test('…and it was NOT, while the weight was read after the outcome — finding 3, as a number', () => {
    /* The reason this is a call.js test and not a data/job.js one: `RANK_MEAN_WC` never moved. What
       moved was the objective the student is actually maximising. Round 3 measured the shipped
       ceiling at 1.607 through 300k-draw simulations; the exact expectation over the same window
       model is 1.379. Either way it is below 1.95, so no honest policy at any q̂ could reach Called 5
       and the rank existed only for players who alternated thrown and cleared targets. */
    const broken = ceilingOf(endogenous);
    const fixed = ceilingOf(exogenous);
    assert.ok(broken.v < JOB.RANK_MEAN_WC.at(-1),
      `the endogenous ceiling ${broken.v.toFixed(4)} is not below ${JOB.RANK_MEAN_WC.at(-1)} — this arm no longer measures the defect`);
    assert.ok(fixed.v > broken.v * 1.5, `the snapshot must be worth something: ${fixed.v.toFixed(4)} vs ${broken.v.toFixed(4)}`);
    assert.ok(JOB.RATING.base + JOB.RATING.scale * broken.v < JOB.RANK_THRESHOLDS.at(-1),
      'and the rating it buys is below the Called 5 threshold');
  });
});

/* ================================================================================================
   S1 · THE OPT-OUT LINT — `before:` may never reach `qHatDetail` from a shipped caller
   (REPAIR-DECISION §S1.3 item 1)
   ================================================================================================

   The propriety theorem needs two assumptions and both are load-bearing: an outcome the student
   does not choose, and a WEIGHT FIXED AT THE SEAL. The second one is now `qHatDetail`'s DEFAULT
   (`call.js` — `const seal = opts.before === undefined ? sealedCallOf(save) : null`), so a caller
   that forgets the option still gets an exogenous weight. `before: null` is the explicit opt-out,
   and `before: <number>` an explicit cut: either one, passed by a shipped caller on a path that
   feeds `callEntry`, re-opens the hole that made lying pay.

   A CORRECTION TO THE DECISION'S OWN MEASUREMENT, with the command. §S1.3 says to "grep every file
   under `site/js/` for `before:` … and assert the result set is EMPTY", on the basis that "the only
   hits are three docblock lines inside `call.js` itself". That is stale against this tree — the run
   lane's r3 debrief snapshot added three live ones that have nothing to do with q̂:

     $ grep -rn 'before:' site/js/ | grep -v '^site/js/job/call.js'
       site/js/figure/svg.js:36:      // … Two things were wrong before:          (a comment)
       site/js/screens/run.js:857:    p.meta = { …, before: snap }                (the page's tile snapshot)
       site/js/screens/run.js:1821:   ip.meta = { …, before: snap }                (the same snapshot)
       site/js/screens/job.js:1701:   jobSummaryContext(…, { queue, before: jobBefore ?? undefined })

   An empty-set assertion over that grep would be red today and would have to be relaxed to an
   allowlist of three unrelated call sites, which is a weaker pin than the one the invariant
   actually needs. So the lint below asserts the INVARIANT rather than the string: no `before:` is
   an argument to `qHatDetail(`, `qHatFor(`, `callEntry(` or `ratingDetail(` anywhere under
   `site/js/`, comments stripped — and the default branch that makes that safe is asserted to exist.

   NEGATIVE CONTROL, run over in-memory copies of all 40 lane files (no project file edited):
   baseline → `[]`; with `state.js:1167`'s own read changed to
   `call.qHatFor(s, t.make, { cards: opts.cards ?? cardById, before: null })` →
   `['site/js/job/state.js:1167 qHatFor']`. The pin fires on the exact regression it exists for.
   ================================================================================================ */

describe('S1 · no shipped caller opts out of the seal', () => {
  /** every `.js` under `site/js`, comments and string bodies stripped (a prose mention is not a call) */
  const LANE_FILES = listFiles(join(ROOT, 'site', 'js'), /\.js$/)
    .map((abs) => ({ path: relative(ROOT, abs), code: stripCommentsAndStrings(readFileSync(abs, 'utf8')) }));

  /** the argument text of every call to `fn` in `code`, paren-balanced */
  const callArgsOf = (code, fn) => {
    const out = [];
    const re = new RegExp(`\\b${fn}\\s*\\(`, 'g');
    for (let m = re.exec(code); m; m = re.exec(code)) {
      let d = 1; let i = m.index + m[0].length; const from = i;
      while (i < code.length && d > 0) { const c = code[i]; if (c === '(') d++; else if (c === ')') d--; i++; }
      out.push({ at: code.slice(0, m.index).split('\n').length, args: code.slice(from, i - 1) });
    }
    return out;
  };

  test('the lexer finds the calls it is meant to police', () => {
    assert.ok(LANE_FILES.length > 30, `only ${LANE_FILES.length} lane files scanned`);
    const probe = 'a = qHatFor(save, make, { cards });\nb = qHatFor(s, m, { cards, before: null });';
    const found = callArgsOf(probe, 'qHatFor');
    assert.equal(found.length, 2, 'both call sites');
    assert.equal(/\bbefore:/.test(found[0].args), false);
    assert.equal(/\bbefore:/.test(found[1].args), true, 'and the opt-out is visible in the argument text');
    /* nested parens must not end the argument list early */
    assert.match(callArgsOf('qHatFor(save, make, { cards: byId(x), before: at(1) })', 'qHatFor')[0].args,
      /before: at\(1\)/);
    /* and the real tree really does call these functions, or the lint is scanning nothing */
    const live = LANE_FILES.reduce((n, f) => n + callArgsOf(f.code, 'qHatFor').length + callArgsOf(f.code, 'qHatDetail').length, 0);
    assert.ok(live >= 4, `only ${live} q̂ call sites found under site/js — the scan has lost the tree`);
  });

  test('THE PIN: no q̂ or rating call under site/js passes `before:`', () => {
    const offenders = [];
    for (const { path, code } of LANE_FILES) {
      for (const fn of ['qHatFor', 'qHatDetail', 'callEntry', 'ratingDetail']) {
        for (const { at, args } of callArgsOf(code, fn)) {
          if (/\bbefore\s*:/.test(args)) offenders.push(`${path}:${at} → ${fn}(… ${args.trim().slice(0, 80)})`);
        }
      }
    }
    assert.deepEqual(offenders, [],
      'a LIVE q̂ read may not feed `callEntry`: `before: null` (and an explicit `before`) defeats the '
      + 'seal, and with an endogenous weight the argmax is `p* = q·w_clear/(q·w_clear + (1−q)·w_miss) '
      + '< q` whenever q̂ > 0.5 — lying pays. The sealed default in `call.js qHatDetail` is what makes '
      + 'every caller safe; do not opt out of it on a path that stakes a call.');
  });

  test('…and the default that makes that safe is still in the shipped function', () => {
    const src = stripCommentsAndStrings(readFileSync(join(ROOT, 'site/js/job/call.js'), 'utf8'));
    assert.match(src, /opts\.before === undefined \? sealedCallOf\(save\) : null/,
      'the cut is no longer defaulted from the save\'s own seal — every caller is live again');
    /* behavioural, not just source: a caller that passes NOTHING gets the cut */
    const hist = Array.from({ length: 10 }, (_, i) => ({ at: i, ok: i > 0, attempt: 1, hints: 0, ms: 900 }));
    const save = { cards: { c: { history: [...hist, { at: 500, ok: true, attempt: 1, hints: 0, ms: 900 }] } },
      inProgress: { game: { locked: { call: 85, n: 1, at: 100 } } } };
    const d = qHatDetail(save, 'FAC2', { cards: { c: ['FAC2'] } });
    assert.equal(d.sealed, true, 'a caller that passes only `cards` must still get the seal');
    assert.equal(d.of, 10, 'the sitting written after the lock is not in its own q̂');
    /* the CONTROL: the opt-out really does change the answer, so the pin above is not vacuous */
    const live = qHatDetail(save, 'FAC2', { cards: { c: ['FAC2'] }, before: null });
    assert.equal(live.sealed, false);
    assert.notEqual(live.qHat, d.qHat, 'the opt-out is inert — then the lint above polices nothing');
  });
});
