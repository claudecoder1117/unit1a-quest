// quad.js — the quadratic family (T07c): T-quad-solve and T-quad-ctx.
// COMPOSED S2 "Generator contract": "`T-quad-solve` / `T-quad-ctx`: expand a factor template, `= 0`;
// ctx wraps roots in a length/angle/'x = 0' story with keep/reject + reason."
//
// T-quad-solve — pure algebra (quad-01..03 shaped). Roots are integers or halves (S2's "integer or
//   .5 answers" invariant), so the linear factors carry a ∈ {1, 2} with gcd(a, b) = 1.
//   parts: [{ id:'x', type:'roots', var, answer:[Rat, Rat], poly:[A,B,C] }]
//
// T-quad-ctx — the same algebra inside a story, graded as the S3 `rootcase` chain:
//   parts: [ setup (equation, optional) , x (roots) , keep (reject) , measures (multi) | cases ]
//   Three frames, each with its own reject reason from the S3 menu:
//     A 'rect'   — a rectangle (x + p) by (x + q) with a given area → 'negative-length'
//     B 'angles' — two adjacent angles filling 90° or 180°          → 'negative-angle' | 'zero-angle'
//                  | 'both-valid' (a coin flip, so rejection is never automatic — the rule S2 states
//                  for T-cs-quad; the both-valid item is ang-10 shaped and ends in a `cases` part)
//     C 'zero'   — an angle equation whose other root is x = 0      → 'zero-angle'
//
// DOM-free, no Math.random. Answers are TYPED (Rat roots, numeric field answers); `grade()`
// normalises typed and string identically (S3), which tests/gen.test.mjs pins.

import { rat, formatNumber } from '../grader/normalize.js';
import { seedTag } from '../rng.js';
import { expandFactors, factoredText, linText, targetText, gcd, VARS } from './factor.js';

const MINUS = '−';
const LETTERS = Object.freeze('ABCDEFGHJKLMNPQRSTUVWXYZ'.split('')); // no I, no O

function num(n) { return n < 0 ? `${MINUS}${Math.abs(n)}` : String(n); }

/** `n` distinct elements of `arr`, cheap in draws. */
function pickN(rng, arr, n) {
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < 120) {
    const x = rng.pick(arr);
    if (!out.includes(x)) out.push(x);
  }
  return out;
}
function numP(n) { return n < 0 ? `(${MINUS}${Math.abs(n)})` : String(n); }

/** A Rat (or integer) in student display form: −1/2, 3 → "−1/2", "3". */
export function ratText(r) {
  if (typeof r === 'number') return num(r);
  if (r && typeof r === 'object' && typeof r.n === 'number' && typeof r.d === 'number') {
    return r.d === 1 ? num(r.n) : `${r.n < 0 ? MINUS : ''}${Math.abs(r.n)}/${r.d}`;
  }
  return String(formatNumber(r, { style: 'fraction' }));
}

/** The same value with an ASCII minus — the spelling `data/cards.js` uses in answer keys. */
export function asciiRat(r) {
  return ratText(r).replace(/\u2212/g, '-');
}

/** ASCII signed term for a canonical equation string: 3 → "+ 3x", −3 → "- 3x". */
function ascii(coef, suffix = '') {
  if (coef === 0) return '';
  const a = Math.abs(coef);
  const body = suffix && a === 1 ? suffix : `${a}${suffix}`;
  return `${coef < 0 ? '- ' : '+ '}${body}`;
}

/** `x² + 3x` / `x² − 3x` / `x²` — a quadratic measure expression (display). */
function quadExpr(b, v) {
  if (b === 0) return `${v}²`;
  return `${v}² ${b < 0 ? MINUS : '+'} ${Math.abs(b) === 1 ? '' : Math.abs(b)}${v}`;
}

/** `4x + 7` / `−4x + 7` / `7` — a linear measure expression (display). */
function linExpr(c, d, v) {
  if (c === 0) return num(d);
  const head = c === 1 ? v : c === -1 ? `${MINUS}${v}` : `${num(c)}${v}`;
  if (d === 0) return head;
  return `${head} ${d < 0 ? MINUS : '+'} ${Math.abs(d)}`;
}

// ================================================================================================
// T-quad-solve
// ================================================================================================

/** Linear factors whose roots are integers or halves: a ∈ {1, 2}, gcd(a, b) = 1. */
function solveFactors(rng, mode) {
  const drawB = () => { const b = rng.int(1, 9); return rng.chance(0.5) ? b : -b; };
  const a1 = mode === 'a1' ? 1 : (rng.chance(0.5) ? 2 : 1);
  const a2 = mode === 'a1' ? 1 : (a1 === 1 ? 2 : (rng.chance(0.4) ? 2 : 1));
  const b1 = drawB();
  const b2 = drawB();
  if (gcd(a1, b1) !== 1 || gcd(a2, b2) !== 1) return null;
  if (mode === 'a2' && a1 * a2 < 2) return null;
  return { c: 1, factors: [[a1, b1], [a2, b2]] };
}

const SOLVE_EXEMPLAR = Object.freeze({ v: 'x', g: 1, factors: [[2, 1], [1, -3]] }); // 2x² − 5x − 3 = 0

export function buildSolve(rng, opts = {}) {
  const mode = opts.mode === 'a2' ? 'a2' : opts.mode === 'a1' ? 'a1' : (rng.chance(0.5) ? 'a1' : 'a2');
  while (rng.draws < 200) {
    const v = opts.var ?? rng.pick(VARS);
    const inner = solveFactors(rng, mode);
    if (!inner) continue;
    const g = mode === 'a1' && rng.chance(0.25) ? rng.pick([2, 3]) : 1;
    const item = assembleSolve(rng, v, g, inner, mode);
    if (item) return item;
  }
  return assembleSolve(rng, SOLVE_EXEMPLAR.v, SOLVE_EXEMPLAR.g,
    { c: 1, factors: SOLVE_EXEMPLAR.factors.map((f) => f.slice()) }, 'a2', true);
}

function assembleSolve(rng, v, g, inner, mode, force = false) {
  const [[a1, b1], [a2, b2]] = inner.factors;
  const pairs = [{ f: inner.factors[0], r: rat(-b1, a1) }, { f: inner.factors[1], r: rat(-b2, a2) }];
  if (!force && pairs[0].r.n * pairs[1].r.d === pairs[1].r.n * pairs[0].r.d) return null; // distinct roots
  const typed = { c: g, factors: inner.factors };
  const desc = expandFactors(typed);
  if (!force && (desc[1] === 0 || desc[2] === 0)) return null;           // a genuine trinomial
  if (!force && Math.abs(desc[2]) > 120) return null;

  pairs.sort((p, q) => (p.r.n * q.r.d) - (q.r.n * p.r.d));
  const roots = pairs.map((p) => p.r);
  const rootTexts = roots.map(ratText);                       // display (U+2212, as the stems read)
  const rootKeys = roots.map(asciiRat);                       // answer key (ASCII, as data/cards.js writes)
  const eq = `${targetText(desc, v)} = 0`;
  const factored = factoredText(typed, v);
  const [A, B, C] = desc;
  const isA1 = a1 === 1 && a2 === 1;

  // Sign-flipped roots are the classic slip (`2x + 1 = 0` read as `x = 1/2`).
  const misconceptions = [];
  for (const { f, r } of pairs) {
    const flip = rat(-r.n, r.d);
    if (flip.n === 0) continue;
    if (roots.some((o) => o.n * flip.d === flip.n * o.d)) continue;      // never shadow a real root
    misconceptions.push({
      part: 'x',
      answer: ratText(flip),
      tag: 'sign-flip',
      msg: `${ratText(flip)} is the right size with the wrong sign — ${linText(f, v).slice(1, -1)} = 0 gives ${ratText(r)}.`,
    });
  }

  return {
    id: `T-quad-solve#${seedTag(rng.seed)}`,
    template: 'T-quad-solve',
    family: mode === 'a2' ? 'fam-quad-a2' : 'fam-quad-a1',
    params: { mode, var: v, gcf: g, factors: inner.factors.map((f) => f.slice()), target: desc.slice(), roots: rootKeys },
    prompt: `Solve by factoring: ${eq}`,
    stem: `Solve by factoring: ${eq}`,
    figure: null,
    skills: ['QUAD-SOLVE'],
    tier: mode === 'a2' ? 3 : 2,
    parts: [{
      id: 'x',
      type: 'roots',
      var: v,
      label: `${v} =`,
      prompt: 'Both roots — separate them with a comma.',
      answer: roots,                      // TYPED Rat values; "3, -1/2" grades the same (tested)
      answerText: rootKeys.join(', '),
      poly: desc.slice(),                 // typed vector — feeds the "plug it back in" line
    }],
    answer: rootTexts.join(', '),
    hints: [
      `One side is already 0, so factor the other side. ${g > 1 ? `GCF first: every term is divisible by ${g}.` : 'GCF check first: the three terms share no common factor.'} ${isA1 ? `Inside, a = 1, so find two numbers that multiply to ${num(C / g)} and add to ${num(B / g)}.` : `Inside, a = ${A / g} is not 1 — use the ac-method: a · c = ${numP(A / g)} · ${numP(C / g)} = ${num((A / g) * (C / g))}.`}`,
      isA1
        ? `The two numbers are ${num(b1)} and ${num(b2)} — check: ${numP(b1)} · ${numP(b2)} = ${num(b1 * b2)} and ${num(b1)} + ${num(b2)} = ${num(b1 + b2)}. Each one goes into its own bracket.`
        : `The two numbers are ${num(a1 * b2)} and ${num(a2 * b1)}. Split the middle term with them, group the first two terms and the last two, and factor each pair.`,
      'Zero product property: a product is 0 only when one of its factors is 0. Set EACH factor equal to 0 on its own and solve those two little equations — both answers count.',
    ],
    solution: [
      { say: 'Everything is on one side and the other side is 0 — factor the left side', math: eq },
      { say: 'Factored', math: `${factored} = 0` },
      { say: 'Zero product property: a product is 0 only when one factor is 0', math: `${linText(pairs[0].f, v).slice(1, -1)} = 0   or   ${linText(pairs[1].f, v).slice(1, -1)} = 0` },
      { say: 'Solve each little equation', math: `${v} = ${rootTexts[0]}   or   ${v} = ${rootTexts[1]}` },
      { say: 'Check both roots in the original equation', math: `${v} = ${rootTexts.join(`  and  ${v} = `)} both give 0 ✓` },
    ],
    misconceptions,
  };
}

// ================================================================================================
// T-quad-ctx — the three stories
// ================================================================================================

/** Reject-menu distractors that are never the right reason for `key`. */
function rejectDistractors(key, geometry, rootTexts, negText) {
  const pool = [];
  if (key === 'both-valid') pool.push(negText);   // S3: always present on a both-valid item
  if (key !== 'both-valid') pool.push('both values work');
  if (key !== 'not-a-solution') pool.push(`${rootTexts[0]} does not satisfy the equation`);
  if (geometry === 'angle' && key !== 'angle-over-180') pool.push('one angle would be more than 180°');
  if (geometry === 'length' && key !== 'negative-angle') pool.push('the angle would be negative');
  if (key !== 'neither') pool.push('neither value works');
  return pool.slice(0, 3);
}

/** Frame A — a rectangle (x + p) by (x + q) with a fixed area; the other root gives negative sides. */
function frameRect(rng) {
  const p = rng.int(1, 9);
  const q = rng.int(1, 9);
  if (p === q) return null;                    // a rectangle, not a square
  const r1 = rng.int(1, 9);
  const r2 = -(p + q + r1);
  if (r1 === r2) return null;
  const N = (r1 + p) * (r1 + q);
  if (N > 400) return null;
  const unit = rng.pick(['cm', 'in', 'units']);
  const width = r1 + p, length = r1 + q;
  return {
    frame: 'rect',
    geometry: 'length',
    desc: [1, p + q, p * q - N],
    roots: [r1, r2].sort((a, b) => a - b),
    valid: [r1], rejected: [r2],
    reasonKey: 'negative-length', reason: 'negative side length',
    stem: `A rectangle is (x + ${p}) ${unit} wide and (x + ${q}) ${unit} long. Its area is ${N} square ${unit}. Find x, decide which value of x can be used, then give the width and the length.`,
    setup: { canonical: `(x + ${p})(x + ${q}) - ${N}`, mustMention: [N], display: `(x + ${p})(x + ${q}) = ${N}` },
    fields: [
      { key: 'w', label: `width (${unit}) =`, answer: width },
      { key: 'l', label: `length (${unit}) =`, answer: length },
    ],
    why: `x = ${num(r2)} would make the width ${num(r2 + p)} ${unit} — a side of a rectangle cannot be negative.`,
    tail: [
      { say: 'Check both roots against the picture', math: `x = ${r1}: ${r1} + ${p} = ${width} ✓    x = ${num(r2)}: ${num(r2)} + ${p} = ${num(r2 + p)} ✗` },
      { say: 'A length cannot be negative, so keep only the positive root', math: `x = ${r1}` },
      { say: 'Width and length', math: `${width} ${unit} by ${length} ${unit}   (check: ${width} · ${length} = ${N})` },
    ],
    hintTail: `Substitute each root into x + ${p} and x + ${q}. A side of a rectangle cannot be negative, so only one root survives.`,
    misc: [
      { part: 'measures', field: 'w', answer: r1, tag: 'stopped-early', msg: `That is x, not the width — the width is x + ${p}.` },
      { part: 'measures', field: 'l', answer: r1, tag: 'stopped-early', msg: `That is x, not the length — the length is x + ${q}.` },
    ],
  };
}

/** Frame B — two adjacent angles filling 90° or 180°; both-valid is a coin flip. */
function frameAngles(rng, wantBoth) {
  const S = rng.chance(0.5) ? 90 : 180;
  const r1 = rng.int(-12, 12);
  const r2 = rng.int(-12, 12);
  if (r1 === r2 || r1 === 0 || r2 === 0) return null;
  const b = rng.int(-12, 12);
  if (b === 0) return null;
  const c = -(r1 + r2) - b;
  const d = S + r1 * r2;
  if (c === 0 || Math.abs(c) > 20 || Math.abs(d) > 300) return null;
  const m1 = (x) => x * x + b * x;
  const m2 = (x) => c * x + d;
  const ok = (x) => m1(x) > 0 && m2(x) > 0;
  if (!ok(r1)) return null;
  const bothValid = ok(r2);
  if (bothValid !== !!wantBoth) return null;

  const [P, V, Q, X] = pickN(rng, LETTERS, 4);
  const zero = !bothValid && (m1(r2) === 0 || m2(r2) === 0);
  const roots = [r1, r2].sort((a, z) => a - z);
  const word = S === 90 ? 'a right angle' : 'a straight angle';
  return {
    frame: 'angles',
    geometry: 'angle',
    desc: [1, b + c, d - S],
    roots,
    valid: bothValid ? roots.slice() : [r1],
    rejected: bothValid ? [] : [r2],
    reasonKey: bothValid ? 'both-valid' : zero ? 'zero-angle' : 'negative-angle',
    reason: bothValid ? 'both give positive angle measures' : zero ? 'zero angle' : 'negative angle',
    S, b, c, d, P, V, Q, X, m1, m2, bothValid,
    stem: `{ray ${V}${X}} lies between {ray ${V}${P}} and {ray ${V}${Q}}, and {ang ${P}${V}${Q}} is ${word}. `
      + `{m ${P}${V}${X}} = (${quadExpr(b, 'x')})° and {m ${X}${V}${Q}} = (${linExpr(c, d, 'x')})°. `
      + `Find x, decide which value${bothValid ? '(s)' : ''} of x can be used, and give both angle measures.`,
    setup: {
      canonical: `(x^2 ${ascii(b, 'x')}) + (${ascii(c, 'x').replace(/^\+ /, '')} ${ascii(d)}) - ${S}`,
      mustMention: [S],
      display: `(${quadExpr(b, 'x')}) + (${linExpr(c, d, 'x')}) = ${S}`,
    },
    why: bothValid
      ? 'Both roots give positive angle measures that still add to ' + S + '°, so BOTH are kept — this is a two-case answer.'
      : `x = ${num(r2)} would make ${m1(r2) <= 0 ? `m∠${P}${V}${X}` : `m∠${X}${V}${Q}`} ${num(Math.min(m1(r2), m2(r2)))}° — an angle cannot be ${zero ? 'zero' : 'negative'}.`,
    tail: [],
    hintTail: 'Substitute each root back into BOTH measure expressions. Keep a root only if every angle it produces is positive — sometimes both roots survive.',
    misc: bothValid ? [] : [
      ...(m1(r2) > 0 ? [{ part: 'measures', field: 'a1', answer: m1(r2), tag: 'kept-invalid-root', msg: `That is the measure the REJECTED root gives. Use x = ${num(r1)}.` }] : []),
      ...(m2(r2) > 0 ? [{ part: 'measures', field: 'a2', answer: m2(r2), tag: 'kept-invalid-root', msg: `That is the measure the REJECTED root gives. Use x = ${num(r1)}.` }] : []),
      ...(m1(r1) !== r1 ? [{ part: 'measures', field: 'a1', answer: r1, tag: 'stopped-early', msg: `That is x, not an angle measure — substitute x into ${quadExpr(b, 'x')}.` }] : []),
      ...(m2(r1) !== r1 ? [{ part: 'measures', field: 'a2', answer: r1, tag: 'stopped-early', msg: `That is x, not an angle measure — substitute x into ${linExpr(c, d, 'x')}.` }] : []),
    ],
  };
}

/** Frame C — the "x = 0" story: a root of 0 collapses the figure. */
function frameZero(rng) {
  const k = rng.int(1, 9);
  const r = rng.int(2, 12);
  const m = k + r;
  if (m * r > 180) return null;
  const [P, V, Q, X] = pickN(rng, LETTERS, 4);
  return {
    frame: 'zero',
    geometry: 'angle',
    desc: [1, k - m, 0],
    roots: [0, r],
    valid: [r], rejected: [0],
    reasonKey: 'zero-angle', reason: 'zero angle',
    P, V, Q, X,
    stem: `{ray ${V}${X}} lies between {ray ${V}${P}} and {ray ${V}${Q}}, so {m ${P}${V}${X}} + {m ${X}${V}${Q}} = {m ${P}${V}${Q}}. `
      + `If {m ${P}${V}${X}} = (x²)°, {m ${X}${V}${Q}} = (${k}x)° and {m ${P}${V}${Q}} = (${m}x)°, find x and the three measures.`,
    setup: { canonical: `(x^2 + ${k}x) - ${m}x`, mustMention: null, display: `x² + ${k}x = ${m}x` },
    fields: [
      { key: 'a1', label: `m∠${P}${V}${X} =`, answer: r * r },
      { key: 'a2', label: `m∠${X}${V}${Q} =`, answer: k * r },
      { key: 'a3', label: `m∠${P}${V}${Q} =`, answer: m * r },
    ],
    why: 'x = 0 makes all three angles 0° — there is no angle left, so 0 is rejected.',
    tail: [
      { say: 'x = 0 collapses every angle to 0°, which is not an angle', math: 'x = 0 → 0°, 0°, 0°  ✗' },
      { say: 'Use the other root', math: `x = ${r} → ${r * r}°, ${k * r}°, ${m * r}°  ✓` },
    ],
    hintTail: 'One root makes every angle 0°. An angle of 0° is not an angle, so that root is rejected — but you still have to FIND it before you can reject it.',
    misc: [
      ...(r * r !== r ? [{ part: 'measures', field: 'a1', answer: r, tag: 'stopped-early', msg: `That is x, not the measure — m∠${P}${V}${X} = x².` }] : []),
      ...(k * r !== r ? [{ part: 'measures', field: 'a2', answer: r, tag: 'stopped-early', msg: `That is x, not the measure — m∠${X}${V}${Q} = ${k}x.` }] : []),
    ],
  };
}

const CTX_FALLBACK = Object.freeze({ p: 2, q: 3, r1: 4, unit: 'cm' });

export function buildCtx(rng, opts = {}) {
  const want = opts.frame ?? null;
  while (rng.draws < 200) {
    const frame = want ?? rng.weighted(['rect', 'angles', 'zero'], [3, 5, 2]);
    let f = null;
    if (frame === 'rect') f = frameRect(rng);
    else if (frame === 'zero') f = frameZero(rng);
    else f = frameAngles(rng, opts.bothValid ?? rng.chance(0.4));
    if (f) return assembleCtx(rng, f);
  }
  const e = CTX_FALLBACK;
  const N = (e.r1 + e.p) * (e.r1 + e.q);
  return assembleCtx(rng, {
    frame: 'rect', geometry: 'length',
    desc: [1, e.p + e.q, e.p * e.q - N],
    roots: [-(e.p + e.q + e.r1), e.r1],
    valid: [e.r1], rejected: [-(e.p + e.q + e.r1)],
    reasonKey: 'negative-length', reason: 'negative side length',
    stem: `A rectangle is (x + ${e.p}) cm wide and (x + ${e.q}) cm long. Its area is ${N} square cm. Find x, decide which value of x can be used, then give the width and the length.`,
    setup: { canonical: `(x + ${e.p})(x + ${e.q}) - ${N}`, mustMention: [N], display: `(x + ${e.p})(x + ${e.q}) = ${N}` },
    fields: [{ key: 'w', label: 'width (cm) =', answer: e.r1 + e.p }, { key: 'l', label: 'length (cm) =', answer: e.r1 + e.q }],
    why: 'A side of a rectangle cannot be negative.',
    tail: [], hintTail: 'A side of a rectangle cannot be negative.', misc: [],
  });
}

function assembleCtx(rng, f) {
  const v = 'x';
  const rootTexts = f.roots.map(num);        // display (U+2212)
  const rootKeys = f.roots.map(String);      // answer key (ASCII), as ang-04/09/10 write theirs
  const eq = `${targetText(f.desc, v)} = 0`;
  const negRoot = f.roots.find((r) => r < 0);
  const negText = negRoot != null
    ? `${num(negRoot)} is negative so reject it`
    : `${num(f.roots[0])} is too small so reject it`;

  const parts = [
    {
      id: 'setup', type: 'equation', optional: true, var: v,
      prompt: 'Set up the equation (skippable — graded when you try it)',
      canonical: f.setup.canonical,
      mustMention: f.setup.mustMention,
    },
    {
      id: 'x', type: 'roots', var: v, label: 'x =',
      prompt: 'Solve for x — both roots.',
      answer: f.roots.map((r) => rat(r, 1)),
      answerText: rootKeys.join(', '),
      poly: f.desc.slice(),
    },
    {
      id: 'keep', type: 'reject', of: 'x',
      prompt: 'Keep or reject each root — and say why.',
      valid: f.valid.map(String),
      rejected: f.rejected.map(String),
      reason: f.reason,
      reasonKey: f.reasonKey,
      distractors: rejectDistractors(f.reasonKey, f.geometry, rootTexts, negText),
    },
  ];

  let fields = f.fields ?? null;
  if (f.frame === 'angles' && f.bothValid) {
    parts.push({
      id: 'cases', type: 'cases', of: 'x',
      prompt: 'One tab per root — give both angle measures in each case.',
      cols: [
        { key: 'x', label: 'x' },
        { key: 'a1', label: `m∠${f.P}${f.V}${f.X}` },
        { key: 'a2', label: `m∠${f.X}${f.V}${f.Q}` },
      ],
      rows: f.roots.map((r) => ({ x: String(r), a1: String(f.m1(r)), a2: String(f.m2(r)) })),
    });
  } else {
    if (f.frame === 'angles') {
      const keep = f.valid[0];
      fields = [
        { key: 'a1', label: `m∠${f.P}${f.V}${f.X} =`, answer: f.m1(keep) },
        { key: 'a2', label: `m∠${f.X}${f.V}${f.Q} =`, answer: f.m2(keep) },
      ];
    }
    parts.push({
      id: 'measures', type: 'multi',
      prompt: f.frame === 'rect' ? 'The rectangle.' : 'The angle measures (degrees).',
      fields,
    });
  }

  const answerText = f.frame === 'angles' && f.bothValid
    ? f.roots.map((r) => `x = ${num(r)} → ${f.m1(r)}°, ${f.m2(r)}°`).join(';  ')
    : `x = ${num(f.valid[0])};  ` + (fields ?? []).map((fl) => `${fl.label} ${fl.answer}`).join('  ');

  const solution = [
    { say: 'Write every measure as an expression in x and turn the relationship into one equation', math: f.setup.display ?? `${f.setup.canonical} = 0` },
    { say: 'Standard form', math: eq },
    { say: 'Factor and use the zero product property', math: `${v} = ${rootTexts.join(`  or  ${v} = `)}` },
    { say: 'Check each root against the figure', math: f.why },
    ...f.tail,
  ];
  if (f.frame === 'angles') {
    for (const r of f.roots) {
      solution.push({
        say: `x = ${num(r)}`,
        math: `m∠${f.P}${f.V}${f.X} = ${f.m1(r)}°,  m∠${f.X}${f.V}${f.Q} = ${f.m2(r)}°  (sum ${f.S}°)  ${f.valid.includes(r) ? '✓' : '✗'}`,
      });
    }
  }
  solution.push({ say: 'Answer', math: answerText });

  return {
    id: `T-quad-ctx#${seedTag(rng.seed)}`,
    template: 'T-quad-ctx',
    family: 'fam-quad-ctx',
    params: { frame: f.frame, target: f.desc.slice(), roots: rootKeys, reasonKey: f.reasonKey, bothValid: !!f.bothValid },
    prompt: f.stem,
    stem: f.stem,
    figure: null,
    skills: ['QUAD-CTX', 'QUAD-SOLVE'],
    parts,
    answer: answerText,
    hints: [
      'Write every measure as an expression in x first, then use the relationship the problem states to make ONE equation.',
      `Get everything on one side so the other side is 0 (${eq}), factor it, and set each factor to 0. A quadratic has two roots and you need both before you can choose.`,
      f.hintTail,
    ],
    solution,
    misconceptions: f.misc ?? [],
  };
}

// ================================================================================================
// Registry
// ================================================================================================

export const templates = Object.freeze([
  Object.freeze({
    id: 'T-quad-solve', version: 1, label: 'Solve by factoring', module: 'M11', sheet: 'ALG',
    skills: ['QUAD-SOLVE'], tier: 2, par: 120, partTypes: ['roots'], modes: ['a1', 'a2'],
    gen: (rng, opts = {}) => buildSolve(rng, opts),
  }),
  Object.freeze({
    id: 'T-quad-ctx', version: 1, label: 'Quadratic in context (keep / reject)', module: 'M11', sheet: 'ALG',
    skills: ['QUAD-CTX', 'QUAD-SOLVE'], tier: 4, par: 300, family: 'fam-quad-ctx',
    partTypes: ['equation', 'roots', 'reject', 'multi', 'cases'], frames: ['rect', 'angles', 'zero'],
    gen: (rng, opts = {}) => buildCtx(rng, opts),
  }),
]);

export default templates;
