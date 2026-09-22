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
  disagreementBands, evMaxBands, evidenceBands, evidenceBandOf,
  // the window
  callEntry, windowPush, ratingFrom, ratingDetail, expectedRating, wTimesEcDiscrete,
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
       A blank slot is written as `p: null, w: 0` — see `callEntry` — so it scores nothing here AND
       is invisible to every consumer that selects on a finite `p` (the `calibrated` trophy and the
       Reliability diagram, both of which mean "informative calls"). */
    let win = [];
    for (let i = 0; i < 50; i++) win = windowPush(win, entry(0.97, 95, true, i));
    assert.equal(win.length, 50, 'q̂ = .97 gives w = .116 < .25 — the calls still take their slots');
    assert.deepEqual([...new Set(win.map((e) => e.p))], [null], 'and every one of them is BLANK');
    assert.deepEqual([...new Set(win.map((e) => e.w))], [0]);
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
    const sum = win.reduce((a, e) => a + e.w * credit(e.p, e.ok), 0);
    near(sum, 10 * 0.51 * 9.1, 1e-9);
    const byN = JOB.RATING.base + JOB.RATING.scale * (sum / JOB.RATING.N);
    const bySumW = JOB.RATING.base + JOB.RATING.scale * (sum / win.reduce((a, e) => a + e.w, 0));
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

  test('a call entry is exactly the save schema {p, ok, w, skill, at}, in that key order', () => {
    const e = callEntry({ call: 85, ok: true, qHat: 0.85, skill: 'FAC2', at: 1758000000000 });
    assert.deepEqual(Object.keys(e), ['p', 'ok', 'w', 'skill', 'at']);
    assert.deepEqual(e, { p: 0.85, ok: true, w: 0.51, skill: 'FAC2', at: 1758000000000 });
    assert.ok(JSON.stringify(e).length <= 70, `G7 budgets 63 B per entry; got ${JSON.stringify(e).length}`);
    // G3.7 #10 / J7: a shielded miss must write a BYTE-IDENTICAL entry to an unshielded one.
    const unshielded = callEntry({ call: 95, ok: false, qHat: 0.6, skill: 'SYS', at: 7 });
    const shielded = callEntry({ call: 95, ok: false, qHat: 0.6, skill: 'SYS', at: 7, shielded: true, backcheck: true });
    assert.equal(JSON.stringify(shielded), JSON.stringify(unshielded),
      'a Backcheck shields the stake and only the stake — the rating credit is always taken');
  });

  test('the Mock enters the window at the defined weight w = 1.0 (G12 #40d)', () => {
    const e = callEntry({ p: 0.7, ok: true, w: JOB.RATING.mockWeight, skill: null, at: 1 });
    assert.equal(e.w, 1);
    assert.equal(e.skill, null, 'the Mock has no make, so it has no q̂ — the weight is DEFINED, not derived');
    const win = windowPush([], e);
    assert.equal(win.length, 1);
    near(ratingFrom(win), 5 + 2 * (1 * 6.4) / 50, 1e-12);
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

  test('COPY.regret2 is a debrief line: it prints a cost in rating, about an envelope already answered', () => {
    const s = JOB.COPY.regret2({ envelope: 3, called: 85, evMax: 95, cost: 4 });
    assert.match(s, /envelope 3/);
    assert.match(s, /you called 85/, 'past tense — the call is already locked');
    assert.match(s, /cost 4 rating/);
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
      'a measured window is never held — a rating you earned can still fall');
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
        const legal = callsFor(rankFor(save.player?.rating?.value));
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
          if (stored.w !== want.w || stored.p !== want.p) {
            wMismatch++;
            if (firstMismatch.length < 3) {
              firstMismatch.push(`${lockedMake}: stored w=${stored.w} p=${stored.p}, lock-time w=${want.w} p=${want.p}`);
            }
          }
          /* the same entry built from the LIVE reading — the outcome inside its own window */
          const endo = callEntry({
            call: lockedCall, ok: cleared, skill: lockedMake, at: 0,
            qHat: qHatFor(save, lockedMake, { cards: CARDS_BY_ID, before: null }),
          });
          if (endo.w !== want.w) endoWould++;
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
    assert.equal(blank.w, 0);
    assert.deepEqual(Object.keys(blank), ['p', 'ok', 'w', 'skill', 'at'], 'and the save key order is unchanged');
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

    assert.equal(C.entry.w, M.entry.w,
      `the stored weight moved with the outcome: clear ${C.entry.w} vs miss ${M.entry.w} — `
      + 'the caller is reading q̂ after the grade path has written it (call.js `sealedCallOf`)');
    assert.equal(C.entry.w, ECON.round(lock.atLock.w, 6), 'and the weight stored is the one the LOCK-time evidence implies');
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
    const wClear = C.entry.w;
    const wMiss = M.entry.w;
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
