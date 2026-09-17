// poly.test.mjs — the 18 Kuta factoring answers (SOURCE §6) × ≥ 4 accepted
// rewrites × ≥ 3 rejects with the S3 kinds/tags, computed by a local classify
// helper that mirrors the `factored` grader's rule order (the real grader is
// T03; poly.js must expose everything it needs). An exact sample-point oracle
// evaluates every student string's UNEXPANDED AST at x ∈ {−3…3, 7} through the
// NUM algebra and compares with the target — independent of polynomial code.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePoly, expandText, factorStructure, diagnoseMismatch, detectRootSet, formatPoly,
  polyFromCoeffs, polyFromDescending, polyFromRoot, polyEquals, polyDegree, polyMul, polyAdd, polySub, polyScale, polyPow,
  polyContent, polyContentInt, polyPrimitive, polyCanonical, polyGcd, polyDivmod, polyEvalRat, polyEvalAt,
  polyIntCoeffsDesc, constantRatio, solveLinear, solveQuadratic, rationalRoots, isReducible, ratSqrt,
  parseRational, ratFunSub, parseLinear, evalAst, parseExpr, rat, ratEq, ratToString,
} from '../site/js/grader/poly.js';
import { NUM } from '../site/js/grader/normalize.js';

const R = (n, d = 1) => rat(n, d);
const M = '−'; // unicode minus, as the teacher's key and the UI print it

// ---------------------------------------------------------------------------
// Fixtures — SOURCE §6, verbatim key strings. c·(a1 v + b1)(a2 v + b2).
// ---------------------------------------------------------------------------
const KUTA = [
  { id: 'fac-01', v: 'p', target: `3p² ${M} 2p ${M} 5`, key: `(3p ${M} 5)(p + 1)`, c: 1, f1: [3, -5], f2: [1, 1] },
  { id: 'fac-02', v: 'n', target: `2n² + 3n ${M} 9`, key: `(2n ${M} 3)(n + 3)`, c: 1, f1: [2, -3], f2: [1, 3] },
  { id: 'fac-03', v: 'n', target: `3n² ${M} 8n + 4`, key: `(3n ${M} 2)(n ${M} 2)`, c: 1, f1: [3, -2], f2: [1, -2] },
  { id: 'fac-04', v: 'n', target: '5n² + 19n + 12', key: '(5n + 4)(n + 3)', c: 1, f1: [5, 4], f2: [1, 3] },
  { id: 'fac-05', v: 'v', target: '2v² + 11v + 5', key: '(2v + 1)(v + 5)', c: 1, f1: [2, 1], f2: [1, 5] },
  { id: 'fac-06', v: 'n', target: '2n² + 5n + 2', key: '(2n + 1)(n + 2)', c: 1, f1: [2, 1], f2: [1, 2] },
  { id: 'fac-07', v: 'a', target: '7a² + 53a + 28', key: '(7a + 4)(a + 7)', c: 1, f1: [7, 4], f2: [1, 7] },
  { id: 'fac-08', v: 'k', target: '9k² + 66k + 21', key: '3(3k + 1)(k + 7)', c: 3, f1: [3, 1], f2: [1, 7] },
  { id: 'fac-09', v: 'n', target: `15n² ${M} 27n ${M} 6`, key: `3(5n + 1)(n ${M} 2)`, c: 3, f1: [5, 1], f2: [1, -2] },
  { id: 'fac-10', v: 'x', target: `5x² ${M} 18x + 9`, key: `(5x ${M} 3)(x ${M} 3)`, c: 1, f1: [5, -3], f2: [1, -3] },
  { id: 'fac-11', v: 'n', target: `4n² ${M} 15n ${M} 25`, key: `(n ${M} 5)(4n + 5)`, c: 1, f1: [1, -5], f2: [4, 5] },
  { id: 'fac-12', v: 'x', target: `4x² ${M} 35x + 49`, key: `(x ${M} 7)(4x ${M} 7)`, c: 1, f1: [1, -7], f2: [4, -7] },
  { id: 'fac-13', v: 'n', target: `4n² ${M} 17n + 4`, key: `(n ${M} 4)(4n ${M} 1)`, c: 1, f1: [1, -4], f2: [4, -1] },
  { id: 'fac-14', v: 'x', target: `6x² + 7x ${M} 49`, key: `(3x ${M} 7)(2x + 7)`, c: 1, f1: [3, -7], f2: [2, 7] },
  { id: 'fac-15', v: 'x', target: '6x² + 37x + 6', key: '(x + 6)(6x + 1)', c: 1, f1: [1, 6], f2: [6, 1] },
  { id: 'fac-16', v: 'a', target: `${M}6a² ${M} 25a ${M} 25`, key: `${M}(2a + 5)(3a + 5)`, c: -1, f1: [2, 5], f2: [3, 5] },
  { id: 'fac-17', v: 'n', target: `6n² + 5n ${M} 6`, key: `(2n + 3)(3n ${M} 2)`, c: 1, f1: [2, 3], f2: [3, -2] },
  { id: 'fac-18', v: 'b', target: `16b² + 60b ${M} 100`, key: `4(b + 5)(4b ${M} 5)`, c: 4, f1: [1, 5], f2: [4, -5] },
];
assert.equal(KUTA.length, 18);

// ---------------------------------------------------------------------------
// Local classify helper — mirrors S3 `factored` rule order (T03 owns the real one)
// ---------------------------------------------------------------------------
function classify(raw, item, ctx = {}) {
  const v = item.v;
  const target = parsePoly(item.target, { var: v }).poly;
  if (detectRootSet(raw).isRootSet) return { kind: 'wrong', tag: 'roots' };

  // `=`: drop sides equal to 0 or to the target AS TYPED (the trinomial typed
  // back — a correct factoring also *expands* to the target, so equality alone
  // would drop the answer); exactly one side must remain
  let text = raw;
  if (raw.includes('=')) {
    const sides = raw.split('=').map((s) => s.trim()).filter((s) => {
      const r = parsePoly(s, { var: v });
      if (!r.ok) return true;
      if (polyDegree(r.poly) === -1) return false;
      if (!polyEquals(r.poly, target)) return true;
      const fs = factorStructure(r.ast, { var: v });
      return !(fs.topLevel === 'sum' || fs.typedBack);
    });
    if (sides.length !== 1) return { kind: 'malformed', tag: 'equals' };
    text = sides[0];
  }

  const r = parsePoly(text, { var: v });
  if (!r.ok) return { kind: 'malformed', tag: r.err, msg: r.msg };
  if (!polyEquals(r.poly, target)) {
    return { kind: 'wrong', tag: diagnoseMismatch(r.poly, target).tag ?? 'mismatch', expansion: formatPoly(r.poly, v) };
  }
  const fs = factorStructure(r.ast, { var: v });
  assert.equal(fs.ok, true);
  assert.ok(polyEquals(fs.expanded, r.poly), 'factorStructure.expanded agrees with the parsed polynomial');
  if (fs.topLevel === 'sum' || fs.typedBack) return { kind: 'wrong', tag: 'original' };
  if (fs.gcfIncomplete) return { kind: ctx.strictGCF ? 'wrong' : 'almost', tag: 'gcf' };
  if (fs.anyReducible) return { kind: 'almost', tag: 'reducible' };
  if (fs.hasRational) return { kind: 'almost', tag: 'rational' };
  return { kind: 'correct', tag: null };
}

// ---------------------------------------------------------------------------
// Rewrite / reject generators (expected kinds computed from the integers, not from poly.js)
// ---------------------------------------------------------------------------
const lin = (v, [a, b], { minus = '-', spaces = true } = {}) => {
  const coef = a === 1 ? '' : a === -1 ? '-' : String(a);
  const sign = b < 0 ? minus : '+';
  return spaces ? `${coef}${v} ${sign} ${Math.abs(b)}` : `${coef}${v}${sign}${Math.abs(b)}`;
};
const par = (s) => `(${s})`;

function accepted(item) {
  const { v, c, f1, f2, key } = item;
  const F1 = par(lin(v, f1));
  const F2 = par(lin(v, f2));
  const cs = c === 1 ? '' : c === -1 ? '-' : String(c);
  const out = [
    key,                                                        // verbatim key
    `${cs}${F2}${F1}`,                                          // factor order
    `${cs}${par(lin(v, f1, { minus: M, spaces: false }))}${par(lin(v, f2, { minus: M, spaces: false }))}`, // unicode minus, no spaces
    `${c === 1 ? '' : c === -1 ? '-1*' : c + '*'}${F1}*${F2}`,  // explicit *
    `${cs}(${F1})${F2}`,                                        // double parens
    `${cs}${F1}${F2}`.toUpperCase(),                            // case-insensitive variable
    `${cs}${F1}${F2} = 0`,                                      // "= 0" side dropped
    `${item.target} = ${cs}${F1}${F2}`,                         // "target = answer"
  ];
  if (c === 1) out.push(`1${F1}${F2}`, `${F1}${F2}*1`);
  if (c === -1) {
    out.push(`-1${F1}${F2}`, `${par(lin(v, [-f1[0], -f1[1]]))}${F2}`, `${F1}${par(lin(v, [-f2[0], -f2[1]]))}`, `-${F2}${F1}`, `-1*${F1}*${F2}`);
  }
  if (c > 1) out.push(`${F1}${F2}*${c}`, `${F1}*${c}${F2}`, `(${c})${F1}${F2}`);
  if (c === 4) out.push(`2*2${F1}${F2}`, `2${F1}*2${F2}`, `${F1}*2*2${F2}`);
  if (c === 3) out.push(`${F1}(3)${F2}`);
  return out;
}

function rejects(item) {
  const { v, c, f1, f2 } = item;
  const [a1, b1] = f1;
  const [a2, b2] = f2;
  const cs = c === 1 ? '' : c === -1 ? '-' : String(c);
  const F1 = par(lin(v, f1));
  const F2 = par(lin(v, f2));
  const out = [];
  // constants swapped between factors: lead & constant coefficients match, middle differs iff (a1−a2)(b1−b2) ≠ 0
  if ((a1 - a2) * (b1 - b2) !== 0) out.push([`${cs}${par(lin(v, [a1, b2]))}${par(lin(v, [a2, b1]))}`, 'wrong', 'middle-term']);
  // one sign flipped: constant coefficient flips → plain mismatch
  out.push([`${cs}${par(lin(v, [a1, -b1]))}${F2}`, 'wrong', 'mismatch']);
  // whole sign flipped
  out.push([c === -1 ? `${F1}${F2}` : `-${cs}${F1}${F2}`, 'wrong', 'sign-whole']);
  // the trinomial typed back, in three spellings
  out.push([item.target, 'wrong', 'original']);
  out.push([par(item.target), 'wrong', 'original']);
  out.push([`1*(${item.target})`, 'wrong', 'original']);
  // an extra constant factor
  out.push([c === -1 ? `-2${F1}${F2}` : `2${cs}${F1}${F2}`, 'wrong', 'extra-factor']);
  // roots instead of factors
  out.push([`${v} = ${ratToString(R(-b1, a1))} or ${v} = ${ratToString(R(-b2, a2))}`, 'wrong', 'roots']);
  out.push([`{${ratToString(R(-b1, a1))}, ${ratToString(R(-b2, a2))}}`, 'wrong', 'roots']);
  out.push([`${v} = ${ratToString(R(-b1, a1))}, ${ratToString(R(-b2, a2))}`, 'wrong', 'roots']);
  // rational coefficients: pull a factor's leading coefficient out as a number
  const [ra, rb] = a1 !== 1 ? f1 : f2;
  const other = a1 !== 1 ? F2 : F1;
  const k = c * ra;
  const kk = k === 1 ? '' : k === -1 ? '-' : String(k);
  out.push([`${kk}(${v} ${rb < 0 ? '-' : '+'} ${ratToString(R(Math.abs(rb), ra))})${other}`, 'almost', 'rational']);
  // GCF cases
  if (Math.abs(c) > 1) {
    out.push([`${par(lin(v, [c * a1, c * b1]))}${F2}`, 'almost', 'gcf']);
    out.push([`${F1}${par(lin(v, [c * a2, c * b2]))}`, 'almost', 'gcf']);
    out.push([`${F1}${F2}`, 'wrong', 'dropped-gcf']);
    // the GCF pulled but the quadratic left unfactored
    out.push([`${c}(${lin(v, [a1 * a2, 0]).replace(` + 0`, '')}^2 ${a1 * b2 + a2 * b1 < 0 ? '-' : '+'} ${Math.abs(a1 * b2 + a2 * b1)}${v} ${b1 * b2 < 0 ? '-' : '+'} ${Math.abs(b1 * b2)})`, 'almost', 'reducible']);
  }
  if (c === 4) out.push([`2${par(lin(v, [2 * a1, 2 * b1]))}${F2}`, 'almost', 'gcf']);
  // malformed
  out.push([`${cs}${F1}${F2.slice(0, -1)}`, 'malformed', 'syntax']);
  out.push([`${cs}${F1}${F2}`.replace(new RegExp(v, 'g'), v === 'q' ? 'z' : 'q'), 'malformed', 'wrong-var']);
  out.push([`${cs}${F1}${F2} = ${cs}${F2}${F1}`, 'malformed', 'equals']); // two sides remain
  return out;
}

// exact oracle: evaluate the raw text's AST at x through the NUM algebra (no polynomial code)
const SAMPLE_POINTS = [-3, -2, -1, 0, 1, 2, 3, 7];
function evalRawAt(raw, x) {
  return evalAst(parseExpr(parsePoly(raw).normalized), { ...NUM, variable: () => R(x) });
}

describe('Kuta fixtures (SOURCE §6): transcription and the teacher key', () => {
  for (const item of KUTA) {
    test(`${item.id}: target coefficients and key expansion agree with the integers`, () => {
      const { c, f1: [a1, b1], f2: [a2, b2], v } = item;
      const want = polyFromDescending([c * a1 * a2, c * (a1 * b2 + a2 * b1), c * b1 * b2]);
      const t = parsePoly(item.target, { var: v });
      assert.equal(t.ok, true, t.msg);
      assert.ok(polyEquals(t.poly, want), `${item.id} target ${item.target} ≠ ${formatPoly(want, v)}`);
      const k = parsePoly(item.key, { var: v });
      assert.equal(k.ok, true, k.msg);
      assert.ok(polyEquals(k.poly, want), `${item.id} key expands to ${formatPoly(k.poly, v)}`);
      assert.deepEqual(classify(item.key, item), { kind: 'correct', tag: null });
      assert.deepEqual(classify(item.key, item, { strictGCF: true }), { kind: 'correct', tag: null });
      // pretty-printer reproduces the target spelling exactly
      assert.equal(formatPoly(want, v), item.target);
    });
  }
});

describe('Kuta fixtures: ≥ 4 accepted rewrites each', () => {
  for (const item of KUTA) {
    const forms = accepted(item);
    test(`${item.id}: ${forms.length} rewrites accepted`, () => {
      assert.ok(forms.length >= 4);
      for (const raw of forms) {
        const got = classify(raw, item);
        assert.deepEqual(got, { kind: 'correct', tag: null }, `${item.id} rewrite ${JSON.stringify(raw)} → ${JSON.stringify(got)}`);
        assert.deepEqual(classify(raw, item, { strictGCF: true }), { kind: 'correct', tag: null });
      }
    });
    test(`${item.id}: sample-point oracle agrees at x ∈ {−3…3, 7}`, () => {
      const target = parsePoly(item.target, { var: item.v }).poly;
      for (const raw of forms) {
        if (raw.includes('=')) continue;
        for (const x of SAMPLE_POINTS) {
          const direct = evalRawAt(raw, x);
          assert.ok(ratEq(direct, polyEvalRat(target, R(x))), `${item.id} ${JSON.stringify(raw)} at ${x}: ${ratToString(direct)} vs ${ratToString(polyEvalRat(target, R(x)))}`);
          assert.ok(Math.abs(polyEvalAt(target, x) - direct.n / direct.d) < 1e-9);
        }
      }
    });
  }
});

describe('Kuta fixtures: ≥ 3 rejects each with the S3 kind/tag', () => {
  for (const item of KUTA) {
    const forms = rejects(item);
    test(`${item.id}: ${forms.length} rejects classified`, () => {
      assert.ok(forms.length >= 3);
      for (const [raw, kind, tag] of forms) {
        const got = classify(raw, item);
        assert.equal(got.kind, kind, `${item.id} reject ${JSON.stringify(raw)} → ${JSON.stringify(got)}, wanted ${kind}/${tag}`);
        assert.equal(got.tag, tag, `${item.id} reject ${JSON.stringify(raw)} → ${JSON.stringify(got)}, wanted ${kind}/${tag}`);
        if (tag === 'gcf') {
          assert.equal(classify(raw, item, { strictGCF: true }).kind, 'wrong', 'strictGCF turns the almost into a wrong');
        }
      }
    });
    test(`${item.id}: mismatched rejects differ from the target at a sample point`, () => {
      const target = parsePoly(item.target, { var: item.v }).poly;
      for (const [raw, kind, tag] of forms) {
        if (kind === 'malformed' || tag === 'roots' || raw.includes('=')) continue;
        const parsed = parsePoly(raw, { var: item.v });
        assert.equal(parsed.ok, true, raw);
        const differs = SAMPLE_POINTS.some((x) => !ratEq(evalRawAt(raw, x), polyEvalRat(target, R(x))));
        const mismatch = !polyEquals(parsed.poly, target);
        assert.equal(differs, mismatch, `${item.id} ${JSON.stringify(raw)}: oracle says differs=${differs}, expansion says mismatch=${mismatch}`);
        // and the expansion agrees with the direct evaluation everywhere
        for (const x of SAMPLE_POINTS) assert.ok(ratEq(evalRawAt(raw, x), polyEvalRat(parsed.poly, R(x))));
      }
    });
  }
});

describe('S3 named cases', () => {
  const fac01 = KUTA[0];
  const fac02 = KUTA[1];
  const fac08 = KUTA[7];
  const fac16 = KUTA[15];
  const fac18 = KUTA[17];

  test('3(p − 5/3)(p + 1) → almost (use integer coefficients)', () => {
    assert.deepEqual(classify(`3(p ${M} 5/3)(p + 1)`, fac01), { kind: 'almost', tag: 'rational' });
    const fs = factorStructure(`3(p ${M} 5/3)(p + 1)`, { var: 'p' });
    assert.equal(fs.hasRational, true);
    assert.equal(fs.gcfIncomplete, false);
    assert.deepEqual(fs.constant, R(3));
    assert.deepEqual(fs.factors[0].content, R(1, 3));
  });
  test('p = 5/3 or p = -1 → wrong (roots typed into factored), never a parser error', () => {
    assert.deepEqual(classify('p = 5/3 or p = -1', fac01), { kind: 'wrong', tag: 'roots' });
    assert.deepEqual(classify('5/3, -1', fac01), { kind: 'wrong', tag: 'roots' });
    assert.deepEqual(classify('p=5/3; p=-1', fac01), { kind: 'wrong', tag: 'roots' });
    assert.deepEqual(classify('{5/3, -1}', fac01), { kind: 'wrong', tag: 'roots' });
    assert.deepEqual(classify(`p = 5/3 and p = ${M}1`, fac01), { kind: 'wrong', tag: 'roots' });
    const rs = detectRootSet('p = 5/3 or p = -1');
    assert.equal(rs.isRootSet, true);
    assert.deepEqual(rs.roots, [R(5, 3), R(-1)]);
    assert.equal(detectRootSet('(3p-5)(p+1)').isRootSet, false);
    assert.equal(detectRootSet('-1').isRootSet, false, 'a single constant is an expression, not a root set');
    assert.equal(detectRootSet('x = 3').isRootSet, true);
    assert.equal(detectRootSet('').isRootSet, false);
  });
  test('GCF-incomplete → almost on Cards, wrong under ctx.strictGCF', () => {
    assert.deepEqual(classify('(9k+3)(k+7)', fac08), { kind: 'almost', tag: 'gcf' });
    assert.deepEqual(classify('(9k+3)(k+7)', fac08, { strictGCF: true }), { kind: 'wrong', tag: 'gcf' });
    assert.deepEqual(classify(`(4b + 20)(4b ${M} 5)`, fac18), { kind: 'almost', tag: 'gcf' });
    assert.deepEqual(classify(`2(2b + 10)(4b ${M} 5)`, fac18), { kind: 'almost', tag: 'gcf' });
    assert.deepEqual(classify(`(b + 5)(16b ${M} 20)`, fac18), { kind: 'almost', tag: 'gcf' });
    assert.deepEqual(classify(`(2b + 10)(8b ${M} 10)`, fac18), { kind: 'almost', tag: 'gcf' });
    const fs = factorStructure('(9k+3)(k+7)', { var: 'k' });
    assert.equal(fs.gcfIncomplete, true);
    assert.equal(fs.factors[0].contentInt, 3);
    assert.equal(formatPoly(fs.factors[0].primitive, 'k'), '3k + 1');
  });
  test('dropped GCF → wrong dropped-gcf; extra factor → wrong extra-factor', () => {
    assert.equal(classify('(3k+1)(k+7)', fac08).tag, 'dropped-gcf');
    assert.equal(classify(`(b + 5)(4b ${M} 5)`, fac18).tag, 'dropped-gcf');
    assert.equal(classify(`8(b + 5)(4b ${M} 5)`, fac18).tag, 'extra-factor');
    assert.equal(classify(`2(3p ${M} 5)(p + 1)`, fac01).tag, 'extra-factor');
  });
  test('the trinomial typed back / not a product → wrong "original"', () => {
    assert.deepEqual(classify('3p^2-2p-5', fac01), { kind: 'wrong', tag: 'original' });
    assert.deepEqual(classify('(3p^2-2p-5)', fac01), { kind: 'wrong', tag: 'original' });
    assert.deepEqual(classify('-(-3p^2+2p+5)', fac01), { kind: 'wrong', tag: 'original' });
    assert.deepEqual(classify('3p^2 - 2p - 5 = 0', fac01), { kind: 'malformed', tag: 'equals' }, 'both sides drop → nothing remains');
    assert.deepEqual(classify(`3p(p ${M} 2/3) ${M} 5`, fac01), { kind: 'wrong', tag: 'original' }, 'a sum at the top level is not factored');
  });
  test('the GCF pulled but the quadratic left → almost "one factor still factors"', () => {
    assert.deepEqual(classify('3(3k^2+22k+7)', fac08), { kind: 'almost', tag: 'reducible' });
    assert.deepEqual(classify(`4(4b² + 15b ${M} 25)`, fac18), { kind: 'almost', tag: 'reducible' });
    const fs = factorStructure('3(3k^2+22k+7)', { var: 'k' });
    assert.equal(fs.anyReducible, true);
    assert.equal(fs.typedBack, false);
  });
  test('wrong factoring shows the student expansion: (2n−3)(n−3) → "2n² − 9n + 9"', () => {
    const got = classify(`(2n ${M} 3)(n ${M} 3)`, fac02);
    assert.equal(got.kind, 'wrong');
    assert.equal(got.expansion, `2n² ${M} 9n + 9`);
    assert.equal(expandText(`(2n ${M} 3)(n ${M} 3)`, { var: 'n' }).text, `2n² ${M} 9n + 9`);
    assert.equal(expandText('(2n-3)(n+3)', { var: 'n' }).text, `2n² + 3n ${M} 9`);
    assert.equal(expandText('(2n-3)(n+3)', { var: 'n', ascii: true }).text, '2n^2 + 3n - 9');
  });
  test('tags: sign-whole and middle-term', () => {
    assert.equal(classify(`-(3p ${M} 5)(p + 1)`, fac01).tag, 'sign-whole');
    assert.equal(classify('(2a + 5)(3a + 5)', fac16).tag, 'sign-whole');
    assert.equal(classify('(3p + 5)(p - 1)', fac01).tag, 'middle-term');
    assert.equal(classify('(3p - 1)(p + 5)', fac01).tag, 'middle-term');
  });
  test('fac-16 sign distribution forms all pass', () => {
    for (const raw of [`${M}(2a + 5)(3a + 5)`, `(${M}2a ${M} 5)(3a + 5)`, `(2a + 5)(${M}3a ${M} 5)`, '-1(2a+5)(3a+5)', '-(3a+5)(2a+5)', '-1*(2a+5)*(3a+5)', '(-2a-5)*(3a+5)', '-(-2a-5)(-3a-5)']) {
      assert.deepEqual(classify(raw, fac16), { kind: 'correct', tag: null }, raw);
    }
  });
  test('only the item variable: another letter → malformed wrong-var with the wanted letter', () => {
    const got = classify('(3x-5)(x+1)', fac01);
    assert.equal(got.kind, 'malformed');
    assert.equal(got.tag, 'wrong-var');
    const r = parsePoly('(3x-5)(x+1)', { var: 'p' });
    assert.equal(r.err, 'wrong-var');
    assert.equal(r.got, 'x');
    assert.equal(r.want, 'p');
    assert.equal(r.msg, 'use the variable p');
  });
  test('unicode minus, double parens, superscripts, spaces all pass', () => {
    assert.deepEqual(classify(`(3p${M}5)(p+1)`, fac01), { kind: 'correct', tag: null });
    assert.deepEqual(classify('((3p-5))(p+1)', fac01), { kind: 'correct', tag: null });
    assert.deepEqual(classify(' ( 3p - 5 ) ( p + 1 ) ', fac01), { kind: 'correct', tag: null });
    assert.deepEqual(classify('（3p－5）（p＋1）', fac01), { kind: 'correct', tag: null }, 'fullwidth punctuation');
  });
});

describe('parser grammar', () => {
  const P = (s, v) => parsePoly(s, { var: v });
  test('implicit multiplication: NUM→VAR, NUM→(, )→(, )→VAR, VAR→( only', () => {
    assert.ok(P('2n', 'n').ok);
    assert.ok(P('2(n+1)', 'n').ok);
    assert.ok(P('(n+1)(n+2)', 'n').ok);
    assert.ok(P('(n+1)n', 'n').ok);
    assert.ok(P('n(n+1)', 'n').ok);
    assert.ok(P('2 n', 'n').ok, 'whitespace between NUM and VAR');
    assert.equal(P('nn', 'n').err, 'syntax');
    assert.equal(P('n2', 'n').err, 'syntax');
    assert.equal(P('(n+1)2', 'n').err, 'syntax');
    assert.equal(P('2 3', 'n').err, 'syntax');
    assert.equal(P('ab', 'a').err, 'syntax');
  });
  test('precedence: 2n^2 = 2(n²), -n^2 = -(n²), (n+1)^2 expands, ^ needs an INT', () => {
    assert.equal(formatPoly(P('2n^2', 'n').poly, 'n'), '2n²');
    assert.equal(formatPoly(P('-n^2', 'n').poly, 'n'), `${M}n²`);
    assert.equal(formatPoly(P('(n+1)^2', 'n').poly, 'n'), 'n² + 2n + 1');
    assert.equal(formatPoly(P('(n+1)^2(n-1)', 'n').poly, 'n'), `n³ + n² ${M} n ${M} 1`);
    assert.equal(P('n^-1', 'n').err, 'exponent');
    assert.equal(P('n^(2)', 'n').err, 'exponent');
    assert.equal(P('n^2^2', 'n').err, 'syntax');
    assert.equal(P('2^3n', 'n').ok, true);
    assert.equal(formatPoly(P('2^3n', 'n').poly, 'n'), '8n');
  });
  test('division only by a nonzero constant; degree ≤ 6', () => {
    assert.ok(P('(2n+6)/2', 'n').ok);
    assert.equal(formatPoly(P('(2n+6)/2', 'n').poly, 'n'), 'n + 3');
    assert.equal(P('(n+1)/(n+2)', 'n').err, 'div-nonconst');
    assert.equal(P('(n+1)/0', 'n').err, 'divzero');
    assert.equal(P('1/(n)', 'n').err, 'div-nonconst');
    assert.ok(P('(n+1)^6', 'n').ok);
    assert.equal(P('(n+1)^7', 'n').err, 'degree');
    assert.equal(P('n^3 * n^4', 'n').err, 'degree');
    assert.equal(P('(n^2+1)(n^2+1)(n^2+1)(n+1)', 'n').err, 'degree');
  });
  test('= inside the expression is err equals; empty is err empty; junk is err char', () => {
    assert.equal(P('n = 3', 'n').err, 'equals');
    assert.equal(P('', 'n').err, 'empty');
    assert.equal(P('n;', 'n').err, 'char');
    assert.equal(P('n,1', 'n').err, 'syntax');
  });
  test('without opts.var the first letter is the variable and a second letter is multi-var', () => {
    const r = P('(3x-5)(x+1)');
    assert.equal(r.ok, true);
    assert.equal(r.var, 'x');
    assert.deepEqual(r.vars, ['x']);
    assert.equal(P('x+y').err, 'multi-var');
  });
  test('decimal coefficients become exact rationals (≤ 6 places)', () => {
    assert.equal(formatPoly(P('0.5n + 1.25', 'n').poly, 'n'), '(1/2)n + 5/4');
    assert.equal(P('0.1234567n', 'n').err, 'precision');
  });
  test('degree glyphs are tolerated in polynomial context, units are not stripped', () => {
    assert.equal(formatPoly(P('180° - x', 'x').poly, 'x'), `${M}x + 180`);
    assert.equal(P('2 in', 'n').err, 'syntax', '"in" is not a unit here: i·n are two letters');
  });
  test('typed coefficient vectors (generator output) parse identically to strings', () => {
    const fromVec = polyFromDescending([2, -5, -3]);
    const fromStr = P('2x^2-5x-3', 'x').poly;
    assert.ok(polyEquals(fromVec, fromStr));
    assert.deepEqual(polyIntCoeffsDesc(fromStr), [2, -5, -3]);
    assert.ok(polyEquals(polyFromCoeffs([R(-3), R(-5), R(2)]), fromStr));
    assert.ok(polyEquals(polyFromCoeffs(['-3', '-5', '2']), fromStr));
    assert.ok(polyEquals(polyFromCoeffs([-3, -5, 2, 0, 0]), fromStr), 'trailing zeros trimmed');
  });
});

describe('polynomial algebra', () => {
  const P = (s) => parsePoly(s).poly;
  test('add/sub/mul/scale/pow/equals', () => {
    assert.ok(polyEquals(polyAdd(P('x+1'), P('x-1')), P('2x')));
    assert.ok(polyEquals(polySub(P('x+1'), P('x+1')), polyFromCoeffs([])));
    assert.equal(polyDegree(polySub(P('x+1'), P('x+1'))), -1);
    assert.ok(polyEquals(polyMul(P('x+1'), P('x-1')), P('x^2-1')));
    assert.ok(polyEquals(polyScale(P('x+1'), R(1, 2)), P('x/2+1/2')));
    assert.ok(polyEquals(polyPow(P('x+1'), 3), P('x^3+3x^2+3x+1')));
    assert.ok(polyEquals(polyFromRoot(R(-1, 2)), P('x+1/2')));
  });
  test('content, primitive, canonical', () => {
    assert.deepEqual(polyContent(P('9k+3')), R(3));
    assert.equal(polyContentInt(P('9k+3')), 3);
    assert.equal(polyContentInt(P('k/2+3')), null);
    assert.deepEqual(polyContent(P('x/2 + 3/4')), R(1, 4));
    assert.equal(formatPoly(polyPrimitive(P('-6a^2-25a-25')), 'a'), `${M}6a² ${M} 25a ${M} 25`);
    assert.equal(formatPoly(polyCanonical(P('-6a^2-25a-25')), 'a'), '6a² + 25a + 25');
    assert.equal(formatPoly(polyPrimitive(P('x/2 + 3/4'))), '2x + 3');
    assert.deepEqual(polyContent(polyFromCoeffs([])), R(0));
  });
  test('divmod and gcd over ℚ', () => {
    const { q, r } = polyDivmod(P('x^3-1'), P('x-1'));
    assert.equal(formatPoly(q), 'x² + x + 1');
    assert.equal(polyDegree(r), -1);
    const d2 = polyDivmod(P('2x^2+3x+5'), P('x+1'));
    assert.equal(formatPoly(d2.q), '2x + 1');
    assert.equal(formatPoly(d2.r), '4');
    assert.equal(formatPoly(polyGcd(P('x^2-1'), P('x^2+2x+1'))), 'x + 1');
    assert.equal(formatPoly(polyGcd(P('x(180-x)'), P('x(90-x)'))), 'x');
    assert.equal(formatPoly(polyGcd(P('x+1'), P('x+2'))), '1');
    assert.equal(formatPoly(polyGcd(P('2x+2'), P('4x+4'))), 'x + 1');
    assert.equal(formatPoly(polyGcd(P('x+1'), polyFromCoeffs([]))), 'x + 1');
    assert.throws(() => polyDivmod(P('x'), polyFromCoeffs([])), (e) => e.code === 'divzero');
  });
  test('constantRatio', () => {
    assert.deepEqual(constantRatio(P('6x+3'), P('2x+1')), R(3));
    assert.deepEqual(constantRatio(P('x+1/2'), P('2x+1')), R(1, 2));
    assert.equal(constantRatio(P('x+1'), P('x+2')), null);
    assert.equal(constantRatio(P('x+1'), P('x^2+1')), null);
  });
  test('evaluation', () => {
    assert.deepEqual(polyEvalRat(P('2x^2-5x-3'), R(3)), R(0));
    assert.deepEqual(polyEvalRat(P('2x^2-5x-3'), R(-1, 2)), R(0));
    assert.equal(polyEvalAt(P('2x^2-5x-3'), 7), 60);
    assert.deepEqual(polyEvalRat(P('x^2+9x+8'), R(-8)), R(0));
  });
});

describe('solvers', () => {
  const P = (s) => parsePoly(s).poly;
  test('solveLinear: doc-05 setup 5x+16 + 8x−23 = 11x+19 → x = 13', () => {
    assert.deepEqual(solveLinear(polySub(P('5x+16+8x-23'), P('11x+19'))), R(13));
    assert.deepEqual(solveLinear(P('4x-240')), R(60));
    assert.deepEqual(solveLinear(P('2x-43')), R(43, 2));
    assert.equal(solveLinear(P('x^2-1')), null);
    assert.equal(solveLinear(P('5')), null);
    assert.deepEqual(solveLinear(polyFromCoeffs([])), { any: true });
  });
  test('solveQuadratic: the three named quadratics of SOURCE §7 have exact roots', () => {
    assert.deepEqual(solveQuadratic(P('x^2+9x+8')).roots, [R(-8), R(-1)]);
    assert.deepEqual(solveQuadratic(P('2x^2-5x-3')).roots, [R(-1, 2), R(3)]);
    assert.deepEqual(solveQuadratic(P('m^2-3m-10')).roots, [R(-2), R(5)]);
    assert.deepEqual(solveQuadratic(P('9x^2-450x')).roots, [R(0), R(50)]);       // AP-9
    assert.deepEqual(solveQuadratic(P('x^2-90x+344')).roots, [R(4), R(86)]);     // wp-12
    assert.equal(solveQuadratic(P('2x^2-5x-3')).exact, true);
    assert.equal(solveQuadratic(P('2x^2-5x-3')).kind, 'two');
  });
  test('solveQuadratic: irrational → floats, complex → none, double root once, linear passthrough', () => {
    const s = solveQuadratic(P('x^2-2'));
    assert.equal(s.exact, false);
    assert.ok(Math.abs(s.roots[0] + Math.SQRT2) < 1e-12 && Math.abs(s.roots[1] - Math.SQRT2) < 1e-12);
    assert.equal(solveQuadratic(P('x^2+1')).kind, 'complex');
    assert.deepEqual(solveQuadratic(P('x^2+1')).roots, []);
    const d = solveQuadratic(P('(x-3)^2'));
    assert.equal(d.kind, 'double');
    assert.deepEqual(d.roots, [R(3)]);
    assert.equal(solveQuadratic(P('2x-6')).kind, 'linear');
    assert.deepEqual(solveQuadratic(P('2x-6')).roots, [R(3)]);
    assert.equal(solveQuadratic(P('x^3')).kind, 'degree');
    assert.equal(solveQuadratic(P('7')).kind, 'none');
    // rational (non-integer) coefficients still solve exactly
    assert.deepEqual(solveQuadratic(P('x^2/2 - 5x/4 - 3/4')).roots, [R(-1, 2), R(3)]);
  });
  test('rationalRoots, isReducible, ratSqrt', () => {
    assert.deepEqual(rationalRoots(P('2x^2-5x-3')), [R(-1, 2), R(3)]);
    assert.deepEqual(rationalRoots(P('x^3-x')), [R(-1), R(0), R(1)]);
    assert.deepEqual(rationalRoots(P('x^2+1')), []);
    assert.equal(isReducible(P('2x^2-5x-3')), true);
    assert.equal(isReducible(P('x^2-2')), false);
    assert.equal(isReducible(P('x^2+1')), false);
    assert.equal(isReducible(P('x+1')), false);
    assert.equal(isReducible(P('x^3+1')), true);
    assert.equal(isReducible(P('x^3-2')), false);
    assert.deepEqual(ratSqrt(R(49)), R(7));
    assert.deepEqual(ratSqrt(R(9, 4)), R(3, 2));
    assert.equal(ratSqrt(R(8)), null);
    assert.equal(ratSqrt(R(-4)), null);
  });
});

describe('pretty-printer', () => {
  const P = (s) => parsePoly(s).poly;
  test('formatPoly', () => {
    assert.equal(formatPoly(P('2n^2-9n+9'), 'n'), `2n² ${M} 9n + 9`);
    assert.equal(formatPoly(P('-x^2+x-1/2')), `${M}x² + x ${M} 1/2`);
    assert.equal(formatPoly(P('x')), 'x');
    assert.equal(formatPoly(P('-x')), `${M}x`);
    assert.equal(formatPoly(P('x^6')), 'x⁶');
    assert.equal(formatPoly(P('0*x')), '0');
    assert.equal(formatPoly(P('7')), '7');
    assert.equal(formatPoly(P('-7')), `${M}7`);
    assert.equal(formatPoly(P('x^2 + 0x + 4')), 'x² + 4');
    assert.equal(formatPoly(P('2n^2-9n+9'), 'n', { ascii: true }), '2n^2 - 9n + 9');
    assert.equal(formatPoly(P('n/3'), 'n'), '(1/3)n');
    // round trip: the ascii spelling re-parses to the same polynomial
    for (const s of ['2n^2-9n+9', '-x^2+x-1/2', 'x^6', '-7', 'n/3']) {
      assert.ok(polyEquals(parsePoly(formatPoly(P(s), 'x', { ascii: true }), { var: 'x' }).poly, P(s)), s);
    }
  });
});

describe('rational functions (equation grader support)', () => {
  test('AP-9: x(180−x)/(x(90−x)) cancels the x', () => {
    const r = parseRational(`x(180 ${M} x)/(x(90 ${M} x))`, { var: 'x' });
    assert.equal(r.ok, true, r.msg);
    // canonical form: the denominator is primitive with a positive lead, the numerator scaled to match
    assert.equal(formatPoly(r.num), `x ${M} 180`);
    assert.equal(formatPoly(r.den), `x ${M} 90`);
    const u = parseRational(`(180 ${M} x)/(90 ${M} x)`, { var: 'x' });
    assert.ok(polyEquals(r.num, u.num) && polyEquals(r.den, u.den), 'cancelled and uncancelled agree');
  });
  test('LHS − RHS as one rational function; roots of the numerator are the solutions', () => {
    const lhs = parseRational(`(180 ${M} x)/(90 ${M} x)`, { var: 'x' });
    const rhs = parseRational('5/2', { var: 'x' });
    const diff = ratFunSub(lhs, rhs);
    assert.deepEqual(solveLinear(diff.num), R(30), 'AP-8: x = 30');
    const l2 = parseRational(`x(180 ${M} x)/(x(90 ${M} x))`, { var: 'x' });
    const d2 = ratFunSub(l2, parseRational('13/4', { var: 'x' }));
    assert.deepEqual(solveLinear(d2.num), R(50), 'AP-9 after cancellation: x = 50');
    const l3 = parseRational(`x(180 ${M} x)`, { var: 'x' });
    const r3 = parseRational(`13/4 * x(90 ${M} x)`, { var: 'x' });
    const d3 = ratFunSub(l3, r3);
    assert.deepEqual(solveQuadratic(d3.num).roots, [R(0), R(50)], 'cross-multiplied AP-9 keeps x = 0');
  });
  test('denominator zero and polynomial inputs', () => {
    assert.equal(parseRational('1/(x-x)', { var: 'x' }).err, 'divzero');
    const p = parseRational('180 - x - (10 + 9x)', { var: 'x' });
    assert.equal(formatPoly(p.den), '1');
    assert.deepEqual(solveLinear(p.num), R(17), 'wp-01: x = 17');
  });
});

describe('linear forms (two-equation systems)', () => {
  test('ang-02: x + y = 90, y = 2x', () => {
    const e1 = parseLinear('x + y - 90');
    assert.equal(e1.ok, true);
    assert.deepEqual(e1.k, R(-90));
    assert.deepEqual(e1.coef, { x: R(1), y: R(1) });
    const e2 = parseLinear('y - 2x');
    assert.deepEqual(e2.coef, { y: R(1), x: R(-2) });
    assert.deepEqual(parseLinear('2(x+y) - x/2').coef, { x: R(3, 2), y: R(2) });
  });
  test('nonlinear and foreign variables are rejected', () => {
    assert.equal(parseLinear('x*y').err, 'nonlinear');
    assert.equal(parseLinear('x^2').err, 'nonlinear');
    assert.equal(parseLinear('x + z').err, 'wrong-var');
    assert.equal(parseLinear('x/y').err, 'div-nonconst');
    assert.equal(parseLinear('a + b', { vars: ['a', 'b'] }).ok, true);
  });
});

describe('integration with site/data/cards/fac.js (T06e)', () => {
  test('every fac-* card agrees with the fixture table; its misconception answers classify with their own tag', async (t) => {
    let mod;
    try {
      mod = await import('../site/data/cards/fac.js');
    } catch {
      t.skip('site/data/cards/fac.js not present yet');
      return;
    }
    const cards = (mod.facCards ?? mod.default ?? []).filter((c) => /^fac-\d\d$/.test(c.id));
    assert.equal(cards.length, 18);
    for (const card of cards) {
      const fx = KUTA.find((k) => k.id === card.id);
      assert.ok(fx, card.id);
      const part = card.parts.find((p) => p.type === 'factored');
      assert.equal(part.var, fx.v, `${card.id} variable`);
      const item = { v: part.var, target: part.target };
      const t1 = parsePoly(part.target, { var: part.var });
      assert.equal(t1.ok, true, `${card.id} target: ${t1.msg}`);
      assert.ok(polyEquals(t1.poly, parsePoly(fx.target, { var: fx.v }).poly), `${card.id} target differs from SOURCE §6`);
      assert.deepEqual(classify(part.answer, item), { kind: 'correct', tag: null }, `${card.id} key ${part.answer}`);
      assert.deepEqual(classify(part.answer, item, { strictGCF: true }), { kind: 'correct', tag: null });
      assert.equal(expandText(part.answer, { var: part.var }).text, fx.target, `${card.id} preview text`);
      for (const m of card.misconceptions || []) {
        const got = classify(m.answer, item);
        assert.equal(got.kind, 'wrong', `${card.id} misconception ${m.answer} → ${JSON.stringify(got)}`);
        assert.equal(got.tag, m.tag, `${card.id} misconception ${m.answer}: tag ${got.tag} ≠ ${m.tag}`);
      }
    }
  });
});

describe('factorStructure edge cases', () => {
  test('constants, powers, divisors and signs are folded into `constant`', () => {
    const fs = factorStructure('-2(n+1)^2 * 3 / 4', { var: 'n' });
    assert.equal(fs.ok, true);
    assert.deepEqual(fs.constant, R(-3, 2));
    assert.equal(fs.nonConstantCount, 2);
    assert.equal(fs.factors.length, 1);
    assert.equal(fs.factors[0].mult, 2);
    assert.equal(fs.hasRational, true);
    assert.equal(formatPoly(fs.expanded, 'n'), `${M}(3/2)n² ${M} 3n ${M} 3/2`);
  });
  test('a pure constant / a bare variable', () => {
    const c = factorStructure('4', { var: 'b' });
    assert.equal(c.topLevel, 'atom');
    assert.equal(c.nonConstantCount, 0);
    assert.equal(c.typedBack, false);
    const v = factorStructure('n', { var: 'n' });
    assert.equal(v.nonConstantCount, 1);
    assert.equal(v.factors[0].degree, 1);
  });
  test('parse failures come back as {ok:false}', () => {
    assert.equal(factorStructure('(n+1', { var: 'n' }).ok, false);
    assert.equal(factorStructure('(n+1)/(n+2)', { var: 'n' }).err, 'div-nonconst');
  });
  test('reducible detection on a cubic factor', () => {
    const fs = factorStructure('(n^3+1)(n+2)', { var: 'n' });
    assert.equal(fs.anyReducible, true);
    const irr = factorStructure('(n^2+1)(n+2)', { var: 'n' });
    assert.equal(irr.anyReducible, false);
  });
  test('diagnoseMismatch', () => {
    const P = (s) => parsePoly(s).poly;
    assert.equal(diagnoseMismatch(P('x+1'), P('x+1')).tag, null);
    assert.equal(diagnoseMismatch(P('-x-1'), P('x+1')).tag, 'sign-whole');
    assert.equal(diagnoseMismatch(P('x/2+1/2'), P('x+1')).tag, 'dropped-gcf');
    assert.equal(diagnoseMismatch(P('3x+3'), P('x+1')).tag, 'extra-factor');
    assert.equal(diagnoseMismatch(P('2x^2+3x+1'), P('2x^2+5x+1')).tag, 'middle-term');
    assert.equal(diagnoseMismatch(P('2x^2+3x+2'), P('2x^2+5x+1')).tag, null);
    assert.equal(diagnoseMismatch(P('x^3'), P('x^2')).tag, null);
  });
});

// ---------------------------------------------------------------------------
// Bounded work: no student string may spin a grader. (Found by fuzzing the T02
// verification pass: `parseRational('x^1000000')` — reachable from the
// `equation` field, which parses both sides as rational functions — sat inside
// polyPow multiplying a degree-1 000 000 polynomial and never returned.)
// ---------------------------------------------------------------------------
describe('every parser returns in bounded time and never throws', () => {
  const ms = (fn) => { const t0 = Date.now(); const out = fn(); return { out, dt: Date.now() - t0 }; };

  test('a huge exponent is a degree/size refusal, not a hang, in every algebra', () => {
    for (const raw of ['x^1000000', '(x+1)^99999', 'x^13', '2^200']) {
      for (const [name, fn] of [
        ['parsePoly', () => parsePoly(raw, { var: 'x' })],
        ['parseRational', () => parseRational(raw, { var: 'x' })],
        ['parseLinear', () => parseLinear(raw)],
        ['factorStructure', () => factorStructure(raw, { var: 'x' })],
        ['expandText', () => expandText(raw, { var: 'x' })],
      ]) {
        const { out, dt } = ms(fn);
        assert.equal(out.ok, false, `${name}(${raw}) must refuse`);
        assert.ok(['degree', 'toolarge', 'nonlinear', 'precision', 'exponent'].includes(out.err),
          `${name}(${raw}) err was ${out.err}`);
        assert.ok(dt < 500, `${name}(${raw}) took ${dt} ms`);
      }
    }
  });

  test('rational functions the equation grader really needs still parse', () => {
    const lhs = parseRational('(180-x)/(90-x)', { var: 'x' });
    const rhs = parseRational('5/2', { var: 'x' });
    assert.equal(lhs.ok && rhs.ok, true);
    const d = ratFunSub(lhs, rhs);
    assert.equal(formatPoly(polyCanonical(d.num), 'x'), `x ${M} 30`);
    assert.equal(parseRational('x^6', { var: 'x' }).ok, true, 'degree 6 is inside the cap');
    assert.equal(parseRational('(x+1)(x+2)(x+3)(x+4)', { var: 'x' }).ok, true);
  });

  test('a pasted document is refused by every entry point before normalizing', () => {
    const huge = '3'.repeat(100000);
    for (const [name, fn] of [
      ['parsePoly', () => parsePoly(huge, { var: 'x' })],
      ['parseRational', () => parseRational(huge, { var: 'x' })],
      ['parseLinear', () => parseLinear(huge)],
      ['factorStructure', () => factorStructure(huge, { var: 'x' })],
    ]) {
      const { out, dt } = ms(fn);
      assert.equal(out.ok, false, name);
      assert.equal(out.err, 'toolong', name);
      assert.ok(dt < 100, `${name} took ${dt} ms`);
    }
    const { out, dt } = ms(() => detectRootSet(huge));
    assert.equal(out.isRootSet, false);
    assert.ok(dt < 100, `detectRootSet took ${dt} ms`);
  });

  test('factorStructure treats an empty widget value as an empty answer, not a crash', () => {
    for (const v of [null, undefined, '', '   ', 42, {}, { t: 'nope' }]) {
      const r = factorStructure(v, { var: 'x' });
      assert.equal(r.ok, false, JSON.stringify(v));
      assert.ok(['empty', 'syntax', 'char'].includes(r.err), `${JSON.stringify(v)} → ${r.err}`);
    }
  });

  test('hostile strings return result objects from every entry point', () => {
    const evil = ['((((', '))))', '1/0', '0/0', '3--2', 'x^', 'x^-2', 'x^2.5', '(x+1)'.repeat(12),
      'x'.repeat(50), '\u00bd\u00bd', 'x = = 3', '\ud83d\ude00', '2^^3', '1(2)3', '('.repeat(5000) + 'x',
      '-'.repeat(5000) + 'x', '1+'.repeat(5000) + '1', null, undefined, 42];
    for (const raw of evil) {
      for (const [name, fn] of [
        ['parsePoly', () => parsePoly(raw, { var: 'x' })],
        ['parseRational', () => parseRational(raw, { var: 'x' })],
        ['parseLinear', () => parseLinear(raw)],
        ['factorStructure', () => factorStructure(raw, { var: 'x' })],
        ['expandText', () => expandText(raw, { var: 'x' })],
        ['detectRootSet', () => detectRootSet(raw)],
      ]) {
        const { out, dt } = ms(fn);
        assert.equal(typeof out, 'object', `${name}(${JSON.stringify(String(raw))})`);
        assert.ok(dt < 200, `${name}(${JSON.stringify(String(raw))}) took ${dt} ms`);
      }
    }
  });
});
