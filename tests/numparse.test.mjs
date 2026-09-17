// numparse.test.mjs — every accepted / rejected numeric form in COMPOSED S3
// ("Normalization", "Edge cases") plus the exact-vs-tolerance compare rule.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeText, stripPrefix, parseNumber, numEquals, numIsNegOf, tolFor, DEFAULT_TOL,
  rat, ratAdd, ratMul, ratDiv, ratEq, ratToString, ratFromDecimal, toRat, toNumber, formatNumber,
  tokenize, parseExpr, evalAst, NUM, astVars, ParseError,
} from '../site/js/grader/normalize.js';

const R = (n, d = 1) => rat(n, d);

/** parse and return the rational as "n/d" text (or the float) for table assertions */
function val(raw, opts) {
  const r = parseNumber(raw, opts);
  assert.equal(r.ok, true, `expected "${raw}" to parse, got ${r.err}: ${r.msg}`);
  return r.kind === 'rational' ? ratToString(r.value) : r.value;
}

describe('accepted forms (S3 Edge cases)', () => {
  const accepted = [
    ['-0', '0'],
    ['0', '0'],
    ['5.50', '11/2'],
    ['11/2', '11/2'],
    ['5½', '11/2'],            // 5½ mixed number
    ['5 1/2', '11/2'],
    ['5 ½', '11/2'],           // 5 ½ with a space
    ['-5½', '-11/2'],
    ['-5 1/2', '-11/2'],
    ['−5½', '-11/2'],     // unicode minus
    ['-½', '-1/2'],
    ['−½', '-1/2'],
    ['½', '1/2'],
    ['¼', '1/4'], ['¾', '3/4'], ['⅓', '1/3'], ['⅔', '2/3'],
    ['2⅓', '7/3'],
    ['-.5', '-1/2'],
    ['.5', '1/2'],
    ['+30', '30'],
    ['+ 30', '30'],
    ['30.', '30'],
    ['= 30', '30'],
    ['=30', '30'],
    ['=30.', '30'],
    ['x = 3', '3'],
    ['x=3', '3'],
    ['X = 3', '3'],
    ['m = 5', '5'],
    ['n = 20', '20'],
    ['perimeter = 84', '84'],
    ['m∠ABC = 30', '30'],
    ['m∠CFD = 5.5', '11/2'],
    ['m<ABC = 30', '30'],
    ['angle ABC = 30', '30'],
    ['x = -½', '-1/2'],
    ['x = 5 1/2', '11/2'],
    ['9°', '9'],               // °
    ['9º', '9'],               // º (NFKC would turn this into "o")
    ['9˚', '9'],               // ˚ (NFKC would turn this into a combining ring)
    ['9 deg', '9'],
    ['9deg', '9'],
    ['9 degs', '9'],
    ['9 degrees', '9'],
    ['9 degree', '9'],
    ['174.5°', '349/2'],
    ['84 u', '84'],
    ['84u', '84'],
    ['84 units', '84'],
    ['84 unit', '84'],
    ['84units', '84'],
    ['84 cm', '84'],
    ['84 mm', '84'],
    ['8 in', '8'],
    ['84 u.', '84'],
    ['180-55', '125'],
    ['180 - 55', '125'],
    ['180−55', '125'],
    ['(180-55)/2', '125/2'],
    ['2*30', '60'],
    ['2×30', '60'],
    ['2·30', '60'],
    ['90/4', '45/2'],
    ['-(1/2)', '-1/2'],
    ['-(1 / 2)', '-1/2'],
    ['-1/2.', '-1/2'],
    ['2^3', '8'],
    ['2³', '8'],
    ['3(2)', '6'],
    ['(2)(3)', '6'],
    ['--3', '3'],
    ['1/3', '1/3'],
    ['0.333333', '333333/1000000'],
    ['５．５', '11/2'], // fullwidth ５．５
    ['ｘ＝１２', '12'], // fullwidth ｘ＝１２
    ['  42  ', '42'],
    ['42 ', '42'],             // nbsp
    ['1000', '1000'],
    ['86.5', '173/2'],
    ['111.5', '223/2'],
    ['3.14159', '314159/100000'],
  ];
  for (const [raw, want] of accepted) {
    test(`${JSON.stringify(raw)} → ${want}`, () => {
      assert.equal(val(raw), want);
    });
  }

  test('decimals with more than 6 places become floats, ≤ 6 stay rational', () => {
    const f = parseNumber('171.0000001');
    assert.equal(f.ok, true);
    assert.equal(f.kind, 'float');
    assert.ok(Math.abs(f.value - 171.0000001) < 1e-12);
    const r = parseNumber('171.000001');
    assert.equal(r.kind, 'rational');
    assert.deepEqual(r.value, R(171000001, 1000000));
    assert.equal(parseNumber('0.5000000').kind, 'float');
  });

  test('-0 normalises to 0 (never negative zero)', () => {
    const r = parseNumber('-0');
    assert.deepEqual(r.value, { n: 0, d: 1 });
    assert.ok(!Object.is(r.value.n, -0));
    const f = parseNumber('-0.00000001');
    assert.equal(f.kind, 'float');
    const z = parseNumber('-0.0000000');
    assert.equal(z.kind, 'float');
    assert.ok(Object.is(z.value, 0), 'float -0 is normalised to +0');
  });

  test('5½ is a mixed number (5.5) and never 5(1/2) = 2.5', () => {
    assert.equal(normalizeText('5½'), '(5+(1/2))');
    assert.equal(val('5½'), '11/2');
    assert.equal(val('5(1/2)'), '5/2');
    assert.equal(numEquals('5½', '5(1/2)'), false);
    assert.equal(numEquals('5½', '5 1/2'), true);
    assert.equal(numEquals('5½', 5.5), true);
    assert.equal(numEquals('-5½', -5.5), true);
  });

  test('84 units never leaves "nits" behind', () => {
    assert.equal(normalizeText('84 units'), '84');
    assert.equal(normalizeText('84units'), '84');
    assert.equal(normalizeText('84 u'), '84');
  });

  test('a leading + is allowed, a trailing . is dropped, a leading = is dropped', () => {
    assert.equal(val('+30'), '30');
    assert.equal(val('30.'), '30');
    assert.equal(val('= 30'), '30');
  });
});

describe('rejected forms', () => {
  const rejected = [
    ['5,5', 'comma'],
    ['1,000', 'comma'],
    ['1e3', 'sci'],
    ['1E3', 'sci'],
    ['2.5e-1', 'sci'],
    ['', 'empty'],
    ['   ', 'empty'],
    ['x =', 'empty'],
    ['.', 'empty'],
    ['abc', 'variable'],
    ['thirty', 'variable'],
    ['2n', 'variable'],
    ['3p^2-2p-5', 'variable'],
    ['x', 'variable'],
    ['1/0', 'divzero'],
    ['(3', 'syntax'],
    ['3)', 'syntax'],
    ['3 4', 'syntax'],
    ['1 000', 'syntax'],
    ['3 +', 'syntax'],
    ['*3', 'syntax'],
    ['2^-1', 'exponent'],
    ['2^(1/2)', 'exponent'],
    ['2^0.5', 'exponent'],
    ['3; -1/2', 'char'],
    ['{3}', 'char'],
    ['3:2', 'char'],
    ['3 = 3', 'equals'],
    ['12345678901234567890', 'toolarge'],
    ['..5', 'char'],
  ];
  for (const [raw, code] of rejected) {
    test(`${JSON.stringify(raw)} → err ${code}`, () => {
      const r = parseNumber(raw);
      assert.equal(r.ok, false, `expected "${raw}" to be rejected but got ${r.kind} ${r.text}`);
      assert.equal(r.err, code);
      assert.equal(typeof r.msg, 'string');
      assert.ok(r.msg.length > 0);
    });
  }

  test('a variable reject reports the letters seen (roots grader: "enter the roots, not the polynomial")', () => {
    const r = parseNumber('3p^2-2p-5');
    assert.equal(r.err, 'variable');
    assert.deepEqual(r.vars, ['p']);
  });

  test('parseNumber never throws', () => {
    for (const raw of [null, undefined, 42, 5.5, {}, [], '(', ')', '^', '∠', '😀', 'x = = 3']) {
      assert.doesNotThrow(() => parseNumber(raw));
    }
    assert.equal(parseNumber(42).text, '42');
    assert.equal(parseNumber(5.5).text, '11/2');
  });
});

describe('normalizeText details', () => {
  test('glyph rules run before NFKC (º, ˚, ², ½ are all mangled by NFKC)', () => {
    assert.equal(normalizeText('9º'), '9');
    assert.equal(normalizeText('9˚'), '9');
    assert.equal(normalizeText('n²'), 'n^2');
    assert.equal(normalizeText('n³'), 'n^3');
    assert.equal(normalizeText('n¹⁰'), 'n^10');
    assert.equal(normalizeText('½'), '(1/2)');
  });
  test('dashes and multiplication glyphs', () => {
    assert.equal(normalizeText('3−5'), '3-5');
    assert.equal(normalizeText('3–5'), '3-5');
    assert.equal(normalizeText('3—5'), '3-5');
    assert.equal(normalizeText('3ｰ5'), '3-5');
    assert.equal(normalizeText('3×5'), '3*5');
    assert.equal(normalizeText('3·5'), '3*5');
    assert.equal(normalizeText('3⋅5'), '3*5');
    assert.equal(normalizeText('2**3'), '2^3');
    assert.equal(normalizeText('1⁄2'), '1/2');
  });
  test('variable letters are case-insensitive (lowercased)', () => {
    assert.equal(normalizeText('(3P − 5)(P + 1)', { prefix: false }), '(3p - 5)(p + 1)');
    assert.equal(normalizeText('ABC', { lower: false }), 'ABC');
  });
  test('prefix stripping is opt-out (equation / factored graders keep the =)', () => {
    assert.equal(normalizeText('x = 17'), '17');
    assert.equal(normalizeText('x = 17', { prefix: false }), 'x = 17');
    assert.equal(normalizeText('3p^2-2p-5 = (3p-5)(p+1)', { prefix: false }), '3p^2-2p-5 = (3p-5)(p+1)');
    // a multi-letter LHS is never a "prefix"
    assert.equal(normalizeText('2x = 34'), '2x = 34');
    assert.equal(normalizeText('x + y = 90'), 'x + y = 90');
  });
  test('stripPrefix per token (roots grader)', () => {
    assert.equal(stripPrefix('x = 3'), '3');
    assert.equal(stripPrefix('x=-1/2'), '-1/2');
    assert.equal(stripPrefix('X = 3'), '3');
    assert.equal(stripPrefix('3'), '3');
    assert.equal(stripPrefix(' = 3'), '3');
  });
  test('units are stripped only after a number (opt-out for polynomial contexts)', () => {
    assert.equal(normalizeText('84 units'), '84');
    assert.equal(normalizeText('units'), 'units');
    assert.equal(normalizeText('84 in'), '84');
    assert.equal(normalizeText('2 in', { units: false }), '2 in');
    assert.equal(normalizeText('(180-55) units'), '(180-55)');
  });
  test('degree words never eat letters inside other words', () => {
    assert.equal(normalizeText('9 degrees'), '9');
    assert.equal(normalizeText('degx', { degrees: true }), 'degx');
  });
  test('whitespace is collapsed, never removed (so "1 000" stays a syntax error)', () => {
    assert.equal(normalizeText('  180   -  55  '), '180 - 55');
    assert.equal(normalizeText('1\n000'), '1 000');
  });
  test('the roots-token forms from S3 all parse per token', () => {
    for (const [tok, want] of [['x=3', '3'], ['x = -½', '-1/2'], ['-1/2.', '-1/2'], ['-(1/2)', '-1/2'], ['3', '3'], ['-0.5', '-1/2'], [' x = 3 ', '3']]) {
      assert.equal(val(tok), want, tok);
    }
  });
  test('never throws on junk', () => {
    assert.equal(normalizeText(null), '');
    assert.equal(normalizeText(undefined), '');
    assert.equal(normalizeText(7), '7');
  });
});

describe('numEquals — one tolerance rule', () => {
  test('the same exact rational is equal with no float noise, even at tol = 0', () => {
    assert.equal(numEquals('5.5', '11/2'), true);
    assert.equal(numEquals('5.5', '11/2', 0), true);
    assert.equal(numEquals('5.50', '5 1/2', 0), true);
    assert.equal(numEquals(R(11, 2), R(11, 2)), true);
    assert.equal(numEquals('0.5', '1/2'), true);
    assert.equal(numEquals('-0.5', '-1/2'), true);
    assert.equal(numEquals('-½', '-.5'), true);
    assert.equal(numEquals('1/3', '0.333333', 0), false, 'tol 0 means exactly equal');
    assert.equal(numEquals('1/3', '0.333333'), true, 'the default tol still applies to rationals');
    assert.equal(numEquals('1/3', '0.3'), false);
  });
  test('|a − b| ≤ tol with tol = part.tol ?? 0.01 — no integer special case', () => {
    assert.equal(numEquals('171.0000001', 171), true);
    assert.equal(numEquals('171.0000001', R(171)), true);
    assert.equal(numEquals('171.004', 171), true, 'a rational within tol passes too');
    assert.equal(numEquals('13.004', '13'), true);
    assert.equal(numEquals('13.02', '13'), false);
    assert.equal(numEquals('13.5', '13', 0.5), true);
    assert.equal(numEquals(171.005, 171), true);
    assert.equal(numEquals(171.02, 171), false);
    assert.equal(numEquals(171.02, 171, 0.05), true);
    assert.equal(numEquals(5.5, R(11, 2)), true);
    assert.equal(numEquals(0.1 + 0.2, 0.3), true);
    assert.equal(numEquals(3, 3.005, 0), false);
    assert.equal(numEquals(3, 3, 0), true);
    assert.equal(DEFAULT_TOL, 0.01);
    assert.equal(tolFor({ tol: 0.5 }), 0.5);
    assert.equal(tolFor({}), 0.01);
    assert.equal(tolFor(null), 0.01);
    assert.equal(tolFor({ tol: 0 }), 0);
  });
  test('unparseable input compares false, never throws', () => {
    assert.equal(numEquals('abc', 3), false);
    assert.equal(numEquals(null, 3), false);
    assert.equal(numEquals('', ''), false);
    assert.equal(numEquals(NaN, NaN), false);
    assert.equal(numEquals(parseNumber('abc'), 3), false);
  });
  test('accepts parseNumber results and numbers directly', () => {
    assert.equal(numEquals(parseNumber('5½'), 5.5), true);
    assert.equal(numEquals(parseNumber('9°'), parseNumber('9')), true);
    assert.equal(numEquals(3, '3'), true);
  });
  test('numIsNegOf (the "sign?" diagnosis)', () => {
    assert.equal(numIsNegOf('-17', 17), true);
    assert.equal(numIsNegOf('17', 17), false);
    assert.equal(numIsNegOf('-1/2', '0.5'), true);
    assert.equal(numIsNegOf('-171.0000001', 171), true);
    assert.equal(numIsNegOf('0', 0), true);
  });
});

describe('rationals', () => {
  test('rat reduces and keeps d > 0', () => {
    assert.deepEqual(R(6, 4), { n: 3, d: 2 });
    assert.deepEqual(R(6, -4), { n: -3, d: 2 });
    assert.deepEqual(R(0, -4), { n: 0, d: 1 });
    assert.throws(() => R(1, 0), ParseError);
  });
  test('arithmetic', () => {
    assert.ok(ratEq(ratAdd(R(1, 2), R(1, 3)), R(5, 6)));
    assert.ok(ratEq(ratMul(R(2, 3), R(3, 4)), R(1, 2)));
    assert.ok(ratEq(ratDiv(R(1, 2), R(1, 4)), R(2)));
    assert.throws(() => ratDiv(R(1), R(0)), ParseError);
  });
  test('ratFromDecimal / toRat / toNumber / formatNumber', () => {
    assert.deepEqual(ratFromDecimal('5.50'), R(11, 2));
    assert.equal(ratFromDecimal('0.1234567'), null);
    assert.deepEqual(toRat(5.5), R(11, 2));
    assert.deepEqual(toRat('11/2'), R(11, 2));
    assert.equal(toRat(1 / 3), null);
    assert.equal(toNumber(R(11, 2)), 5.5);
    assert.equal(toNumber('5½'), 5.5);
    assert.equal(formatNumber(R(11, 2)), '11/2');
    assert.equal(formatNumber(R(11, 2), { style: 'decimal' }), '5.5');
    assert.equal(formatNumber(R(1, 3), { style: 'decimal' }), '1/3');
    assert.equal(formatNumber(-0), '0');
  });
  test('safe-integer guard throws toolarge instead of going inexact', () => {
    assert.throws(() => ratMul(R(2 ** 40), R(2 ** 40)), (e) => e.code === 'toolarge');
  });
});

describe('shared tokenizer / parser / AST', () => {
  test('tokenize', () => {
    assert.deepEqual(tokenize('2n^2').map((t) => t.t + (t.v ? ':' + t.v : '')), ['num:2', 'var:n', 'op:^', 'num:2', 'end']);
    assert.deepEqual(tokenize('(1/2)').map((t) => t.t), ['lp', 'num', 'op', 'num', 'rp', 'end']);
    assert.throws(() => tokenize('3;'), (e) => e.code === 'char' && e.pos === 1);
  });
  test('parseExpr builds the S3 grammar (unary minus binds tighter than ^ does not apply: -n^2 = -(n^2))', () => {
    const ast = parseExpr('-n^2');
    assert.equal(ast.t, 'neg');
    assert.equal(ast.a.t, 'pow');
    const mul = parseExpr('2n');
    assert.equal(mul.t, 'mul');
    assert.equal(mul.implicit, true);
    assert.deepEqual(astVars(parseExpr('3p^2-2p-5')), ['p']);
    assert.deepEqual(astVars(parseExpr('x+y-90')), ['x', 'y']);
  });
  test('evalAst with the NUM algebra evaluates constant expressions exactly', () => {
    assert.deepEqual(evalAst(parseExpr('(180-55)/2'), NUM), R(125, 2));
    assert.deepEqual(evalAst(parseExpr('2^10'), NUM), R(1024));
    assert.equal(evalAst(parseExpr('171.0000001+1'), NUM), 172.0000001);
    assert.throws(() => evalAst(parseExpr('x'), NUM), (e) => e.code === 'variable');
  });
  test('an algebra can substitute a variable (sample-point oracles)', () => {
    const at = (x) => ({ ...NUM, variable: () => R(x) });
    assert.deepEqual(evalAst(parseExpr('(3p-5)(p+1)'), at(7)), R(16 * 8));
    assert.deepEqual(evalAst(parseExpr('3(p - 5/3)(p + 1)'), at(7)), R(16 * 8));
  });
});
