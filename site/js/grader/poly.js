// poly.js — univariate polynomials with exact rational coefficients over the
// shared answer-text parser (COMPOSED S3 `factored` grammar, `equation`,
// `roots`; S8 T02). Imports only normalize.js. DOM-free.
//
// Representation: Poly = { c: Rat[] } with c[i] the coefficient of x^i, no
// trailing zero coefficients (zero polynomial → c = []). Degree ≤ 6 is
// enforced by the parsing algebra; arithmetic itself is unbounded but every
// rational stays a safe integer pair or throws ParseError('toolarge').

import {
  ParseError, gcd, lcm, rat, isRat, ratAdd, ratSub, ratMul, ratDiv, ratNeg, ratAbs, ratEq,
  ratIsInt, ratIsZero, ratSign, ratToNumber, ratPow, ratToString, ratFromDecimal, ratCmp, toRat,
  normalizeText, tokenize, parseExpr, evalAst, astVars, parseNumber,
} from './normalize.js';

export { ParseError, tokenize, parseExpr, evalAst, astVars };

/** @typedef {import('./normalize.js').Rat} Rat */
/** @typedef {{c: Rat[]}} Poly */

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

function trim(c) {
  let n = c.length;
  while (n > 0 && c[n - 1].n === 0) n--;
  return { c: c.slice(0, n) };
}

function coerce(x) {
  if (isRat(x)) return rat(x.n, x.d);
  if (typeof x === 'number') {
    const r = toRat(x);
    if (r === null) throw new ParseError('toolarge', `coefficient ${x} is not an exact rational`);
    return r;
  }
  if (typeof x === 'string') {
    const p = parseNumber(x);
    if (!p.ok || p.kind !== 'rational') throw new ParseError('syntax', `coefficient "${x}" is not an exact rational`);
    return p.value;
  }
  throw new ParseError('syntax', 'bad coefficient');
}

/** ascending powers: [c0, c1, c2] = c0 + c1 x + c2 x² */
export function polyFromCoeffs(coeffs) {
  return trim(coeffs.map(coerce));
}

/** descending powers, the way people write them: [2, -5, -3] = 2x² − 5x − 3 */
export function polyFromDescending(coeffs) {
  return polyFromCoeffs(coeffs.slice().reverse());
}

export const polyZero = () => ({ c: [] });
export const polyConst = (r) => trim([coerce(r)]);
export const polyVar = () => ({ c: [rat(0), rat(1)] });

/** the monic linear factor (x − r) for a rational root r */
export function polyFromRoot(r) {
  return trim([ratNeg(coerce(r)), rat(1)]);
}

// ---------------------------------------------------------------------------
// Inspection
// ---------------------------------------------------------------------------

/** -1 for the zero polynomial */
export const polyDegree = (p) => p.c.length - 1;
export const polyIsZero = (p) => p.c.length === 0;
export const polyIsConst = (p) => p.c.length <= 1;
export const polyCoeff = (p, i) => (i >= 0 && i < p.c.length ? p.c[i] : rat(0));
export const polyLead = (p) => (p.c.length ? p.c[p.c.length - 1] : rat(0));
export const polyIsInteger = (p) => p.c.every((r) => r.d === 1);
/** ascending Rat[] copy */
export const polyCoeffs = (p) => p.c.map((r) => rat(r.n, r.d));
/** descending integer array; throws when a coefficient is not an integer */
export function polyIntCoeffsDesc(p) {
  if (!polyIsInteger(p)) throw new ParseError('syntax', 'polynomial has non-integer coefficients');
  return p.c.map((r) => r.n).reverse();
}

export function polyEquals(p, q) {
  if (p.c.length !== q.c.length) return false;
  for (let i = 0; i < p.c.length; i++) if (!ratEq(p.c[i], q.c[i])) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

export function polyAdd(p, q) {
  const n = Math.max(p.c.length, q.c.length);
  const c = [];
  for (let i = 0; i < n; i++) c.push(ratAdd(polyCoeff(p, i), polyCoeff(q, i)));
  return trim(c);
}

export const polyNeg = (p) => ({ c: p.c.map(ratNeg) });
export const polySub = (p, q) => polyAdd(p, polyNeg(q));

export function polyScale(p, r) {
  r = coerce(r);
  if (r.n === 0) return polyZero();
  return { c: p.c.map((x) => ratMul(x, r)) };
}

export function polyMul(p, q) {
  if (polyIsZero(p) || polyIsZero(q)) return polyZero();
  const c = new Array(p.c.length + q.c.length - 1).fill(null).map(() => rat(0));
  for (let i = 0; i < p.c.length; i++) {
    if (p.c[i].n === 0) continue;
    for (let j = 0; j < q.c.length; j++) {
      if (q.c[j].n === 0) continue;
      c[i + j] = ratAdd(c[i + j], ratMul(p.c[i], q.c[j]));
    }
  }
  return trim(c);
}

export function polyPow(p, k) {
  if (!Number.isInteger(k) || k < 0) throw new ParseError('exponent', 'the exponent must be a whole number');
  let out = polyConst(1);
  for (let i = 0; i < k; i++) out = polyMul(out, p);
  return out;
}

/** exact division by a nonzero constant */
export function polyDivConst(p, r) {
  r = coerce(r);
  if (r.n === 0) throw new ParseError('divzero', 'division by zero');
  return polyScale(p, ratDiv(rat(1), r));
}

/** long division over ℚ: p = q·d + r with deg r < deg d */
export function polyDivmod(p, d) {
  if (polyIsZero(d)) throw new ParseError('divzero', 'division by the zero polynomial');
  let r = { c: polyCoeffs(p) };
  const dd = polyDegree(d);
  const lead = polyLead(d);
  const q = new Array(Math.max(0, polyDegree(p) - dd + 1)).fill(null).map(() => rat(0));
  while (!polyIsZero(r) && polyDegree(r) >= dd) {
    const k = polyDegree(r) - dd;
    const coef = ratDiv(polyLead(r), lead);
    q[k] = coef;
    const sub = { c: new Array(k).fill(null).map(() => rat(0)).concat(d.c.map((x) => ratMul(x, coef))) };
    r = polySub(r, sub);
  }
  return { q: trim(q), r };
}

/** rational content (Gauss): gcd of numerators / lcm of denominators, ≥ 0; 0 for the zero poly */
export function polyContent(p) {
  if (polyIsZero(p)) return rat(0);
  let g = 0;
  let l = 1;
  for (const r of p.c) {
    if (r.n === 0) continue;
    g = gcd(g, r.n);
    l = lcm(l, r.d);
  }
  return rat(g, l);
}

/** integer content for an integer polynomial (positive int; 0 for zero) — the "content gcd" of S3 */
export function polyContentInt(p) {
  const c = polyContent(p);
  return c.d === 1 ? c.n : null;
}

/** p / content(p): an integer polynomial with the sign of the leading coefficient kept */
export function polyPrimitive(p) {
  if (polyIsZero(p)) return polyZero();
  return polyDivConst(p, polyContent(p));
}

/** primitive part with a positive leading coefficient (canonical for comparisons) */
export function polyCanonical(p) {
  const prim = polyPrimitive(p);
  return ratSign(polyLead(prim)) < 0 ? polyNeg(prim) : prim;
}

/** polynomial gcd over ℚ, returned canonical (primitive, positive lead); gcd(0,0) = 0 */
export function polyGcd(p, q) {
  let a = p;
  let b = q;
  while (!polyIsZero(b)) {
    const { r } = polyDivmod(a, b);
    a = b;
    b = r;
  }
  if (polyIsZero(a)) return polyZero();
  return polyCanonical(a);
}

/** exact evaluation at a rational point */
export function polyEvalRat(p, x) {
  x = coerce(x);
  let acc = rat(0);
  for (let i = p.c.length - 1; i >= 0; i--) acc = ratAdd(ratMul(acc, x), p.c[i]);
  return acc;
}

/** float evaluation (sample-point oracles, "plug it back in") */
export function polyEvalAt(p, x) {
  let acc = 0;
  for (let i = p.c.length - 1; i >= 0; i--) acc = acc * x + ratToNumber(p.c[i]);
  return acc;
}

/** the constant c with p = c·q, or null */
export function constantRatio(p, q) {
  if (polyIsZero(q) || polyIsZero(p)) return null;
  if (polyDegree(p) !== polyDegree(q)) return null;
  const c = ratDiv(polyLead(p), polyLead(q));
  return polyEquals(p, polyScale(q, c)) ? c : null;
}

// ---------------------------------------------------------------------------
// Roots
// ---------------------------------------------------------------------------

function isqrt(n) {
  if (n < 0) return null;
  const s = Math.round(Math.sqrt(n));
  for (const t of [s - 1, s, s + 1]) if (t >= 0 && t * t === n) return t;
  return null;
}

/** exact rational square root of r, or null when r is not a perfect square */
export function ratSqrt(r) {
  if (r.n < 0) return null;
  const a = isqrt(r.n);
  const b = isqrt(r.d);
  return a === null || b === null ? null : rat(a, b);
}

/**
 * solveLinear — root of a·x + b (degree 1). Returns a Rat, or null when the
 * polynomial is not degree 1 (`{any:true}` for the zero polynomial).
 * @param {Poly} p
 * @returns {Rat|null|{any:true}}
 */
export function solveLinear(p) {
  if (polyIsZero(p)) return { any: true };
  if (polyDegree(p) !== 1) return null;
  return ratNeg(ratDiv(p.c[0], p.c[1]));
}

/**
 * solveQuadratic — roots of a·x² + b·x + c. Exact rationals when the
 * discriminant is a perfect square, floats otherwise (sorted ascending).
 * Degree 1 falls through to solveLinear; degree 0 / > 2 → kind 'none'/'degree'.
 * @param {Poly} p
 * @returns {{kind:'two'|'double'|'complex'|'linear'|'none'|'any'|'degree', roots:(Rat|number)[], exact:boolean, disc?:Rat, double?:boolean}}
 */
export function solveQuadratic(p) {
  const deg = polyDegree(p);
  if (deg === -1) return { kind: 'any', roots: [], exact: true };
  if (deg === 0) return { kind: 'none', roots: [], exact: true };
  if (deg === 1) return { kind: 'linear', roots: [solveLinear(p)], exact: true };
  if (deg > 2) return { kind: 'degree', roots: [], exact: true };
  const [c, b, a] = p.c;
  const disc = ratSub(ratMul(b, b), ratMul(rat(4), ratMul(a, c)));
  if (disc.n < 0) return { kind: 'complex', roots: [], exact: true, disc };
  const s = ratSqrt(disc);
  const twoA = ratMul(rat(2), a);
  if (s !== null) {
    const r1 = ratDiv(ratSub(ratNeg(b), s), twoA);
    const r2 = ratDiv(ratAdd(ratNeg(b), s), twoA);
    if (ratEq(r1, r2)) return { kind: 'double', roots: [r1], exact: true, disc, double: true };
    const roots = ratCmp(r1, r2) <= 0 ? [r1, r2] : [r2, r1];
    return { kind: 'two', roots, exact: true, disc, double: false };
  }
  const sd = Math.sqrt(ratToNumber(disc));
  const fb = ratToNumber(b);
  const fa = ratToNumber(twoA);
  const roots = [(-fb - sd) / fa, (-fb + sd) / fa].sort((x, y) => x - y);
  return { kind: 'two', roots, exact: false, disc, double: false };
}

function divisors(n) {
  n = Math.abs(n);
  const out = [];
  for (let i = 1; i * i <= n; i++) {
    if (n % i === 0) { out.push(i); if (i * i !== n) out.push(n / i); }
  }
  return out.sort((a, b) => a - b);
}

/**
 * rationalRoots — every rational root (rational root theorem), unique, ascending.
 * @param {Poly} p
 * @returns {Rat[]}
 */
export function rationalRoots(p) {
  if (polyIsZero(p) || polyIsConst(p)) return [];
  let q = polyPrimitive(p);
  const roots = [];
  // strip x^k
  while (q.c.length > 1 && q.c[0].n === 0) {
    if (!roots.some((r) => r.n === 0)) roots.push(rat(0));
    q = { c: q.c.slice(1) };
  }
  if (polyIsConst(q)) return roots;
  const c0 = q.c[0].n;
  const lead = polyLead(q).n;
  const ps = divisors(c0);
  const qs = divisors(lead);
  for (const a of ps) {
    for (const b of qs) {
      for (const s of [1, -1]) {
        const cand = rat(s * a, b);
        if (roots.some((r) => ratEq(r, cand))) continue;
        if (polyEvalRat(q, cand).n === 0) roots.push(cand);
      }
    }
  }
  return roots.sort(ratCmp);
}

/**
 * isReducible — over ℚ (equivalently ℤ for a primitive integer polynomial).
 * Degree 2: perfect-square discriminant. Degree ≥ 3: a rational root exists
 * (complete for degree 3; a rootless quartic that splits into two quadratics
 * is reported as `false` — no target in this unit is above degree 2).
 * @param {Poly} p
 * @returns {boolean}
 */
export function isReducible(p) {
  const deg = polyDegree(p);
  if (deg < 2) return false;
  if (deg === 2) {
    const [c, b, a] = p.c;
    const disc = ratSub(ratMul(b, b), ratMul(rat(4), ratMul(a, c)));
    return ratSqrt(disc) !== null;
  }
  return rationalRoots(p).length > 0;
}

// ---------------------------------------------------------------------------
// Pretty printing
// ---------------------------------------------------------------------------

const SUPS = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
const sup = (n) => String(n).split('').map((d) => SUPS[+d]).join('');

/**
 * formatPoly — "2n² − 9n + 9" (unicode minus, superscripts). `ascii:true` gives
 * "2n^2 - 9n + 9" (typeable). Rational coefficients print as "(5/3)n".
 * @param {Poly} p
 * @param {string} [v='x']
 * @param {{ascii?:boolean}} [opts]
 * @returns {string}
 */
export function formatPoly(p, v = 'x', opts = {}) {
  if (polyIsZero(p)) return '0';
  const minus = opts.ascii ? '-' : '−';
  const parts = [];
  for (let i = p.c.length - 1; i >= 0; i--) {
    const c = p.c[i];
    if (c.n === 0) continue;
    const neg = c.n < 0;
    const a = ratAbs(c);
    let body;
    if (i === 0) body = ratToString(a);
    else {
      let coef = '';
      if (!(a.n === 1 && a.d === 1)) coef = a.d === 1 ? String(a.n) : `(${ratToString(a)})`;
      const power = i === 1 ? '' : (opts.ascii ? `^${i}` : sup(i));
      body = coef + v + power;
    }
    if (parts.length === 0) parts.push((neg ? minus : '') + body);
    else parts.push(` ${neg ? minus : '+'} ${body}`);
  }
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Algebras over the shared AST
// ---------------------------------------------------------------------------

/**
 * polyAlgebra — evaluate an AST to a Poly. `var` fixes the item's variable
 * (another letter → ParseError 'wrong-var' {got, want}); without it the first
 * letter seen becomes the variable and a second distinct letter → 'multi-var'.
 * `/` only by a nonzero constant ('div-nonconst'); degree > maxDegree → 'degree';
 * decimals with > 6 places → 'precision'.
 * @param {{var?:string, maxDegree?:number}} [opts]
 */
export function polyAlgebra(opts = {}) {
  const want = opts.var ? String(opts.var).toLowerCase() : null;
  const maxDegree = opts.maxDegree ?? 6;
  let seen = null;
  const guard = (p) => {
    if (polyDegree(p) > maxDegree) throw new ParseError('degree', `degree above ${maxDegree} — check the exponents`);
    return p;
  };
  return {
    num(text) {
      const r = ratFromDecimal(text, 6);
      if (r === null) throw new ParseError('precision', 'too many decimal places — use a fraction');
      return polyConst(r);
    },
    variable(name) {
      if (want !== null) {
        if (name !== want) throw new ParseError('wrong-var', `use the variable ${want}`, { got: name, want });
      } else if (seen !== null && seen !== name) {
        throw new ParseError('multi-var', `use one variable (${seen})`, { got: name, want: seen });
      } else seen = name;
      return polyVar();
    },
    neg: polyNeg,
    add: polyAdd,
    sub: polySub,
    mul: (a, b) => guard(polyMul(a, b)),
    div(a, b) {
      if (!polyIsConst(b)) throw new ParseError('div-nonconst', 'only divide by a number here');
      if (polyIsZero(b)) throw new ParseError('divzero', 'division by zero');
      return polyDivConst(a, b.c[0]);
    },
    pow(a, k) {
      if (polyIsConst(a)) return polyConst(ratPow(polyCoeff(a, 0), k));
      if (polyDegree(a) * k > maxDegree) throw new ParseError('degree', `degree above ${maxDegree} — check the exponents`);
      return polyPow(a, k);
    },
    get variableSeen() { return want ?? seen; },
  };
}

function failFrom(e, normalized) {
  if (!(e instanceof ParseError)) throw e;
  const out = { ok: false, err: e.code, msg: e.message, normalized };
  for (const k of ['pos', 'got', 'want', 'vars']) if (e[k] !== undefined) out[k] = e[k];
  return out;
}

/**
 * @typedef {object} PolyResult
 * @property {boolean} ok
 * @property {Poly} [poly]
 * @property {import('./normalize.js').Ast} [ast]
 * @property {string[]} [vars]    letters seen, first-appearance order
 * @property {string|null} [var]  the variable used (opts.var or the letter seen)
 * @property {string} normalized
 * @property {string} [err]  'empty'|'syntax'|'char'|'equals'|'exponent'|'wrong-var'|'multi-var'|'div-nonconst'|'divzero'|'degree'|'precision'|'toolarge'
 * @property {string} [msg]
 */

/**
 * parsePoly — student text → exact polynomial. Normalizes with prefix/units
 * OFF (so `p = …` and `=` are reported as err 'equals' for the caller to
 * handle), degree glyphs stripped, superscripts and unicode minus accepted.
 * Never throws.
 * @param {*} raw
 * @param {{var?:string, maxDegree?:number, normalize?:import('./normalize.js').NormalizeOptions}} [opts]
 * @returns {PolyResult}
 */
export function parsePoly(raw, opts = {}) {
  const normalized = normalizeText(raw, { prefix: false, units: false, ...(opts.normalize || {}) });
  if (!normalized) return { ok: false, err: 'empty', msg: 'type an answer', normalized };
  try {
    const ast = parseExpr(tokenize(normalized));
    const alg = polyAlgebra(opts);
    const poly = evalAst(ast, alg);
    const vars = astVars(ast);
    return { ok: true, poly, ast, vars, var: alg.variableSeen ?? null, normalized };
  } catch (e) {
    return failFrom(e, normalized);
  }
}

/**
 * expandText — the live "expands to: …" preview. `{ok:true, text}` or `{ok:false, err, msg}`.
 * @param {*} raw
 * @param {{var?:string, ascii?:boolean}} [opts]
 */
export function expandText(raw, opts = {}) {
  const r = parsePoly(raw, opts);
  if (!r.ok) return r;
  return { ok: true, text: formatPoly(r.poly, opts.var || r.var || 'x', { ascii: !!opts.ascii }), poly: r.poly };
}

// ---------------------------------------------------------------------------
// factorStructure — what the `factored` grader needs beyond expansion
// ---------------------------------------------------------------------------

/**
 * @typedef {object} FactorInfo
 * @property {Poly} poly
 * @property {number} degree
 * @property {number} mult          multiplicity (from ^k or repetition-free count)
 * @property {boolean} integer      all coefficients integers
 * @property {Rat} content          rational content (positive)
 * @property {number|null} contentInt  integer content when `integer`, else null
 * @property {Poly} primitive       poly / content (integer coefficients, lead sign kept)
 * @property {boolean} leadNeg      leading coefficient negative
 * @property {boolean} reducible    factors further over ℤ (see isReducible)
 * @property {string} text          formatted, e.g. "9k + 3"
 */

/**
 * @typedef {object} FactorStructure
 * @property {boolean} ok
 * @property {'sum'|'product'|'atom'} topLevel   shape of the outermost node (after leading signs)
 * @property {number} sign             −1 when an odd number of leading/inner unary minuses
 * @property {Rat} constant            product of every constant factor and sign, ÷ constant divisors
 * @property {FactorInfo[]} factors    the non-constant factors, left to right
 * @property {number} nonConstantCount Σ multiplicities of non-constant factors
 * @property {Poly} expanded           constant · Π factor^mult
 * @property {boolean} gcfIncomplete   some integer factor has content > 1 (`(9k+3)(k+7)`)
 * @property {boolean} hasRational     a non-integer constant or a factor with rational coefficients
 * @property {boolean} anyReducible    some factor of degree ≥ 2 still factors over ℤ
 * @property {boolean} typedBack       one non-constant factor of full degree with |constant| = 1 (the original in parentheses)
 * @property {string[]} vars
 */

/**
 * factorStructure — top-level product analysis of a factored answer.
 * Accepts an AST (from parsePoly) or raw text. Never throws; parse failures
 * come back as `{ok:false, err, msg}` (same codes as parsePoly).
 * @param {import('./normalize.js').Ast|string} astOrRaw
 * @param {{var?:string, maxDegree?:number}} [opts]
 * @returns {FactorStructure|{ok:false, err:string, msg:string}}
 */
export function factorStructure(astOrRaw, opts = {}) {
  let ast = astOrRaw;
  let normalized = '';
  if (typeof astOrRaw === 'string') {
    const r = parsePoly(astOrRaw, opts);
    if (!r.ok) return r;
    ast = r.ast;
    normalized = r.normalized;
  }
  const alg = polyAlgebra(opts);
  try {
    let sign = 1;
    let root = ast;
    while (root.t === 'neg' || root.t === 'pos') { if (root.t === 'neg') sign = -sign; root = root.a; }
    const topLevel = root.t === 'add' || root.t === 'sub' ? 'sum'
      : (root.t === 'mul' || root.t === 'div' || root.t === 'pow') ? 'product' : 'atom';

    const items = [];
    const divisors = [];
    const walk = (node, mult) => {
      switch (node.t) {
        case 'neg': sign = -sign; walk(node.a, mult); return;
        case 'pos': walk(node.a, mult); return;
        case 'mul': walk(node.a, mult); walk(node.b, mult); return;
        case 'div': walk(node.a, mult); divisors.push({ node: node.b, mult }); return;
        case 'pow': if (node.k === 0) { return; } walk(node.a, mult * node.k); return;
        default: items.push({ node, mult });
      }
    };
    walk(root, 1);

    let constant = rat(sign);
    const factors = [];
    for (const { node, mult } of items) {
      const p = evalAst(node, alg);
      if (polyIsConst(p)) {
        constant = ratMul(constant, ratPow(polyCoeff(p, 0), mult));
        continue;
      }
      const content = polyContent(p);
      const integer = polyIsInteger(p);
      factors.push({
        poly: p,
        degree: polyDegree(p),
        mult,
        integer,
        content,
        contentInt: integer ? content.n : null,
        primitive: polyPrimitive(p),
        leadNeg: ratSign(polyLead(p)) < 0,
        reducible: isReducible(p),
        text: formatPoly(p, alg.variableSeen || opts.var || 'x'),
      });
    }
    for (const { node, mult } of divisors) {
      const d = evalAst(node, alg);
      if (!polyIsConst(d)) throw new ParseError('div-nonconst', 'only divide by a number here');
      if (polyIsZero(d)) throw new ParseError('divzero', 'division by zero');
      constant = ratDiv(constant, ratPow(polyCoeff(d, 0), mult));
    }
    let expanded = polyConst(constant);
    for (const f of factors) expanded = polyMul(expanded, polyPow(f.poly, f.mult));
    const nonConstantCount = factors.reduce((s, f) => s + f.mult, 0);
    const gcfIncomplete = factors.some((f) => f.integer && f.content.n > 1);
    const hasRational = !ratIsInt(constant) || factors.some((f) => !f.integer);
    const anyReducible = factors.some((f) => f.reducible);
    const typedBack = nonConstantCount === 1 && Math.abs(constant.n) === 1 && constant.d === 1
      && factors[0].degree === polyDegree(expanded);
    return {
      ok: true, topLevel, sign, constant, factors, nonConstantCount, expanded,
      gcfIncomplete, hasRational, anyReducible, typedBack, vars: astVars(ast), normalized,
    };
  } catch (e) {
    return failFrom(e, normalized);
  }
}

/**
 * diagnoseMismatch — why `got` ≠ `target`:
 *   'sign-whole'   got = −target
 *   'dropped-gcf'  got = c·target with 0 < |c| < 1   (GCF left out)
 *   'extra-factor' got = c·target with |c| > 1
 *   'middle-term'  same degree, same leading and constant coefficients, interior differs
 *   null           anything else
 * @param {Poly} got
 * @param {Poly} target
 * @returns {{tag:string|null, ratio:Rat|null}}
 */
export function diagnoseMismatch(got, target) {
  if (polyEquals(got, target)) return { tag: null, ratio: rat(1) };
  if (polyEquals(got, polyNeg(target))) return { tag: 'sign-whole', ratio: rat(-1) };
  const c = constantRatio(got, target);
  if (c !== null) {
    const a = ratAbs(c);
    return { tag: ratCmp(a, rat(1)) < 0 ? 'dropped-gcf' : 'extra-factor', ratio: c };
  }
  if (polyDegree(got) === polyDegree(target) && polyDegree(got) >= 2
    && ratEq(polyLead(got), polyLead(target)) && ratEq(polyCoeff(got, 0), polyCoeff(target, 0))) {
    return { tag: 'middle-term', ratio: null };
  }
  return { tag: null, ratio: null };
}

/**
 * detectRootSet — does the raw text look like roots rather than a polynomial?
 * (`p = 5/3 or p = -1`, `5/3, -1`, `{3, -0.5}`, `x = 3`). Tokens are split on
 * `,` `;` `or` `and` newlines, braces stripped, a per-token `x =` prefix
 * stripped, each parsed with parseNumber. A single bare number without `=` is
 * NOT a root set (it is a constant expression).
 * @param {*} raw
 * @returns {{isRootSet:boolean, roots:(Rat|number)[], tokens:string[]}}
 */
export function detectRootSet(raw) {
  const s = String(raw ?? '').replace(/[{}]/g, ' ');
  const hadEquals = s.includes('=');
  const tokens = s.split(/[,;\n]|\b(?:or|and)\b/i).map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) return { isRootSet: false, roots: [], tokens };
  const roots = [];
  for (const t of tokens) {
    const r = parseNumber(t);
    if (!r.ok) return { isRootSet: false, roots: [], tokens };
    roots.push(r.value);
  }
  return { isRootSet: tokens.length >= 2 || hadEquals, roots, tokens };
}

// ---------------------------------------------------------------------------
// Rational functions (for the `equation` grader): {num, den} with common
// polynomial factors cancelled and a canonical (primitive, positive-lead) denominator.
// ---------------------------------------------------------------------------

/** @typedef {{num: Poly, den: Poly}} RatFun */

function rfReduce(num, den) {
  if (polyIsZero(den)) throw new ParseError('divzero', 'division by zero');
  if (polyIsZero(num)) return { num: polyZero(), den: polyConst(1) };
  const g = polyGcd(num, den);
  if (!polyIsConst(g)) {
    num = polyDivmod(num, g).q;
    den = polyDivmod(den, g).q;
  }
  const canon = polyCanonical(den);
  const f = constantRatio(den, canon); // den = f · canon
  return { num: polyDivConst(num, f), den: canon };
}

/**
 * ratFunAlgebra — evaluate an AST to a rational function. Same variable rules
 * as polyAlgebra; `/` by any nonzero expression is allowed.
 * @param {{var?:string, maxDegree?:number}} [opts]
 */
export function ratFunAlgebra(opts = {}) {
  const P = polyAlgebra({ ...opts, maxDegree: (opts.maxDegree ?? 6) * 2 });
  const mk = (num, den) => rfReduce(num, den);
  return {
    num: (t) => mk(P.num(t), polyConst(1)),
    variable: (n) => mk(P.variable(n), polyConst(1)),
    neg: (a) => ({ num: polyNeg(a.num), den: a.den }),
    add: (a, b) => mk(polyAdd(polyMul(a.num, b.den), polyMul(b.num, a.den)), polyMul(a.den, b.den)),
    sub: (a, b) => mk(polySub(polyMul(a.num, b.den), polyMul(b.num, a.den)), polyMul(a.den, b.den)),
    mul: (a, b) => mk(polyMul(a.num, b.num), polyMul(a.den, b.den)),
    div: (a, b) => {
      if (polyIsZero(b.num)) throw new ParseError('divzero', 'division by zero');
      return mk(polyMul(a.num, b.den), polyMul(a.den, b.num));
    },
    pow: (a, k) => mk(polyPow(a.num, k), polyPow(a.den, k)),
    get variableSeen() { return P.variableSeen; },
  };
}

/**
 * parseRational — student text → {num, den} rational function (cancelled).
 * @param {*} raw
 * @param {{var?:string, maxDegree?:number, normalize?:object}} [opts]
 * @returns {{ok:true, num:Poly, den:Poly, ast:object, vars:string[], var:string|null, normalized:string}|{ok:false, err:string, msg:string, normalized:string}}
 */
export function parseRational(raw, opts = {}) {
  const normalized = normalizeText(raw, { prefix: false, units: false, ...(opts.normalize || {}) });
  if (!normalized) return { ok: false, err: 'empty', msg: 'type an answer', normalized };
  try {
    const ast = parseExpr(tokenize(normalized));
    const alg = ratFunAlgebra(opts);
    const v = evalAst(ast, alg);
    return { ok: true, num: v.num, den: v.den, ast, vars: astVars(ast), var: alg.variableSeen ?? null, normalized };
  } catch (e) {
    return failFrom(e, normalized);
  }
}

/** a − b as a rational function (LHS − RHS of an equation), cancelled */
export function ratFunSub(a, b) {
  return ratFunAlgebra().sub(a, b);
}

// ---------------------------------------------------------------------------
// Linear forms in several variables (for `x + y = 90, y = 2x` systems)
// ---------------------------------------------------------------------------

/** @typedef {{k: Rat, coef: Record<string, Rat>}} LinearForm */

/**
 * linearAlgebra — evaluate an AST to k + Σ coef[v]·v. Products of two
 * non-constant forms → ParseError 'nonlinear'; a letter outside `vars` → 'wrong-var'.
 * @param {{vars?:string[]}} [opts]  default ['x','y']
 */
export function linearAlgebra(opts = {}) {
  const vars = (opts.vars || ['x', 'y']).map((v) => String(v).toLowerCase());
  const isConst = (f) => Object.keys(f.coef).length === 0;
  const scale = (f, r) => {
    const coef = {};
    for (const [v, c] of Object.entries(f.coef)) { const s = ratMul(c, r); if (s.n !== 0) coef[v] = s; }
    return { k: ratMul(f.k, r), coef };
  };
  const combine = (a, b, sgn) => {
    const coef = {};
    for (const v of new Set([...Object.keys(a.coef), ...Object.keys(b.coef)])) {
      const s = ratAdd(a.coef[v] || rat(0), ratMul(b.coef[v] || rat(0), rat(sgn)));
      if (s.n !== 0) coef[v] = s;
    }
    return { k: ratAdd(a.k, ratMul(b.k, rat(sgn))), coef };
  };
  return {
    num(text) {
      const r = ratFromDecimal(text, 6);
      if (r === null) throw new ParseError('precision', 'too many decimal places — use a fraction');
      return { k: r, coef: {} };
    },
    variable(name) {
      if (!vars.includes(name)) throw new ParseError('wrong-var', `use the variables ${vars.join(', ')}`, { got: name, want: vars.join(',') });
      return { k: rat(0), coef: { [name]: rat(1) } };
    },
    neg: (a) => scale(a, rat(-1)),
    add: (a, b) => combine(a, b, 1),
    sub: (a, b) => combine(a, b, -1),
    mul(a, b) {
      if (isConst(a)) return scale(b, a.k);
      if (isConst(b)) return scale(a, b.k);
      throw new ParseError('nonlinear', 'that is not a linear equation');
    },
    div(a, b) {
      if (!isConst(b)) throw new ParseError('div-nonconst', 'only divide by a number here');
      if (b.k.n === 0) throw new ParseError('divzero', 'division by zero');
      return scale(a, ratDiv(rat(1), b.k));
    },
    pow(a, k) {
      if (isConst(a)) return { k: ratPow(a.k, k), coef: {} };
      if (k === 1) return a;
      if (k === 0) return { k: rat(1), coef: {} };
      throw new ParseError('nonlinear', 'that is not a linear equation');
    },
  };
}

/**
 * parseLinear — student text → linear form over `vars` (default x, y).
 * @param {*} raw
 * @param {{vars?:string[], normalize?:object}} [opts]
 * @returns {{ok:true, k:Rat, coef:Record<string,Rat>, ast:object, vars:string[], normalized:string}|{ok:false, err:string, msg:string, normalized:string}}
 */
export function parseLinear(raw, opts = {}) {
  const normalized = normalizeText(raw, { prefix: false, units: false, ...(opts.normalize || {}) });
  if (!normalized) return { ok: false, err: 'empty', msg: 'type an answer', normalized };
  try {
    const ast = parseExpr(tokenize(normalized));
    const v = evalAst(ast, linearAlgebra(opts));
    return { ok: true, k: v.k, coef: v.coef, ast, vars: astVars(ast), normalized };
  } catch (e) {
    return failFrom(e, normalized);
  }
}

// ---------------------------------------------------------------------------
// Convenience re-exports of the rational helpers graders reach for most
// ---------------------------------------------------------------------------
export { rat, isRat, ratAdd, ratSub, ratMul, ratDiv, ratNeg, ratAbs, ratEq, ratCmp, ratIsInt, ratIsZero, ratSign, ratToNumber, ratToString, ratPow, toRat, gcd, lcm };
