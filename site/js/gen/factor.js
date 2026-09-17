// factor.js — the factoring family (T07c): T-factor-a1 / a2 / gcf / neg.
// COMPOSED S2 "Generator contract": `(a₁v + b₁)(a₂v + b₂)`, gcd(a₁,b₁) = gcd(a₂,b₂) = 1,
// a₁a₂ ∈ 2..9, |b| ≤ 9, GCF g ∈ {2,3,4,5}, optional leading −1, variable ∈ {a,b,k,n,p,v,x};
// the answer is emitted as a TYPED coefficient vector (`target`) plus typed factors
// (`answerTyped = {c, factors:[[a,b],…]}`) — `grade()` normalises typed and string the same way (S3).
// **No prime trinomials, ever**: every target is built answer-backward from two integer linear
// factors, so it is reducible over ℤ by construction (tests/gen.test.mjs re-checks with poly.js).
//
// DOM-free, no Math.random; every draw comes from the seeded Rng (js/rng.js).
//
// gen(rng, opts) → Item   (the shared generator contract — see data/templates.js)
//   Item.parts = [{ id:'f', type:'factored', var, target:[A,B,C], answer:'…', answerTyped:{c, factors} }]
//
// Exported helpers are reused by js/gen/quad.js (same family of linear factors).

import { polyFromDescending, formatPoly } from '../grader/poly.js';
import { seedTag } from '../rng.js';

/** The variables this unit's worksheets use (Kuta §6 uses a, b, k, n, p, v, x). */
export const VARS = Object.freeze(['a', 'b', 'k', 'n', 'p', 'v', 'x']);

/** GCF values the spec allows. */
export const GCFS = Object.freeze([2, 3, 4, 5]);

const MINUS = '−'; // U+2212, the minus the content and formatPoly use

/** Greatest common divisor of |a|, |b|. */
export function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { const t = a % b; a = b; b = t; }
  return a;
}

/** `(3x + 5)`, `(x − 4)`, `(−2x + 3)` — one linear factor, display form. */
export function linText([a, b], v) {
  const lead = a === 1 ? '' : a === -1 ? MINUS : a < 0 ? `${MINUS}${Math.abs(a)}` : String(a);
  return `(${lead}${v} ${b < 0 ? MINUS : '+'} ${Math.abs(b)})`;
}

/** `{c, factors}` → `−3(2a + 5)(3a + 5)` — the display form of a factored answer. */
export function factoredText({ c = 1, factors = [] }, v) {
  const head = c === 1 ? '' : c === -1 ? MINUS : c < 0 ? `${MINUS}${Math.abs(c)}` : String(c);
  return head + factors.map((f) => linText(f, v)).join('');
}

/** `{c, factors}` → the expanded polynomial as a DESCENDING integer coefficient vector ([A, B, C]). */
export function expandFactors({ c = 1, factors = [] }) {
  let poly = [1];                               // ascending coefficients, starting at the constant 1
  for (const [a, b] of factors) {
    const next = new Array(poly.length + 1).fill(0);
    for (let i = 0; i < poly.length; i++) {
      next[i] += poly[i] * b;
      next[i + 1] += poly[i] * a;
    }
    poly = next;
  }
  return poly.map((k) => k * c).reverse();
}

/** The trinomial's display text, e.g. `−6a² − 25a − 25`. */
export function targetText(desc, v) {
  return formatPoly(polyFromDescending(desc), v);
}

/** A non-zero b with |b| ≤ 9. */
function drawB(rng) {
  const b = rng.int(1, 9);
  return rng.chance(0.5) ? b : -b;
}

/** Divisors of n, ascending. */
function divisors(n) {
  const out = [];
  for (let d = 1; d <= n; d++) if (n % d === 0) out.push(d);
  return out;
}

/**
 * Draw one primitive linear pair.
 * mode 'a1' → a₁ = a₂ = 1; mode 'a2' → a₁a₂ ∈ 2..9 (Gauss: the product is then primitive).
 * Returns null when the draw violates gcd(aᵢ, bᵢ) = 1.
 */
export function makeFactorPair(rng, mode) {
  if (mode === 'a1') {
    const f = { c: 1, factors: [[1, drawB(rng)], [1, drawB(rng)]] };
    return f;
  }
  const P = rng.int(2, 9);
  const divs = divisors(P);
  const a1 = rng.pick(divs);
  const a2 = P / a1;
  const b1 = drawB(rng);
  const b2 = drawB(rng);
  if (gcd(a1, b1) !== 1 || gcd(a2, b2) !== 1) return null;
  return { c: 1, factors: [[a1, b1], [a2, b2]] };
}

const COEFF_CAP = 120;

/** Invariants every emitted target must satisfy (also asserted by tests/gen.test.mjs). */
function targetOk(desc) {
  if (desc.length !== 3) return false;
  const [A, B, C] = desc;
  if (!Number.isInteger(A) || !Number.isInteger(B) || !Number.isInteger(C)) return false;
  if (A === 0 || B === 0 || C === 0) return false;              // a real trinomial, no zero terms
  return Math.abs(A) <= COEFF_CAP && Math.abs(B) <= COEFF_CAP && Math.abs(C) <= COEFF_CAP;
}

// ------------------------------------------------------------------------------------------------
// Hints + solution
// ------------------------------------------------------------------------------------------------

/** A signed integer in display form: 5 → "5", −5 → "−5". */
function num(n) {
  return n < 0 ? `${MINUS}${Math.abs(n)}` : String(n);
}

/** A signed integer, parenthesised when negative — for products: 2 · (−45). */
function numP(n) {
  return n < 0 ? `(${MINUS}${Math.abs(n)})` : String(n);
}

/** " + 7x" / " − 7x" — one signed term of a split middle. */
function termText(k, v) {
  return `${k < 0 ? MINUS : '+'} ${Math.abs(k)}${v}`;
}

function acHints(v, kind, g, sign, inner, innerDesc) {
  const [A, B, C] = innerDesc;
  const [[a1, b1], [a2, b2]] = inner.factors;
  const pulled = sign * g;
  const pullText = pulled === 1 ? null : pulled === -1 ? `${MINUS}1` : num(pulled);

  const h = [];
  if (pullText) {
    h.push(sign < 0
      ? `GCF first — and the lead coefficient is negative, so pull out ${pullText} before anything else: ${pullText}(${targetText(innerDesc, v)}).`
      : `GCF first: every term is divisible by ${g}. Pull it out and factor what is left: ${g}(${targetText(innerDesc, v)}).`);
  } else {
    h.push(`GCF check first: the three terms share no common factor, so go straight to the trinomial ${targetText(innerDesc, v)}.`);
  }

  if (a1 === 1 && a2 === 1) {
    h.push(`The lead coefficient inside is 1, so you need two numbers that MULTIPLY to ${num(C)} and ADD to ${num(B)}. List the factor pairs of ${Math.abs(C)} and test their sums.`);
    h.push(`The pair is ${num(b1)} and ${num(b2)} (product ${num(C)}, sum ${num(B)}). Put each one, with its sign, into its own bracket${pullText ? ` — and keep the ${pullText} out front` : ''}.`);
  } else {
    const ac = A * C;
    const m = a1 * b2, n = a2 * b1;
    h.push(`Inside, a = ${A} is not 1, so use the ac-method: a · c = ${numP(A)} · ${numP(C)} = ${num(ac)}. You need two numbers that multiply to ${num(ac)} and add to ${num(B)}.`);
    h.push(`Those numbers are ${num(m)} and ${num(n)}. Split the middle term — ${A}${v}² ${termText(m, v)} ${termText(n, v)} ${C < 0 ? MINUS : '+'} ${Math.abs(C)} — then group the first two and the last two and factor each pair.`);
  }
  return h;
}

function acSolution(v, desc, g, sign, inner, innerDesc, answer) {
  const steps = [];
  const [A, B, C] = innerDesc;
  const [[a1, b1], [a2, b2]] = inner.factors;
  const pulled = sign * g;
  const pullText = pulled === 1 ? null : pulled === -1 ? `${MINUS}1` : num(pulled);

  steps.push({ say: 'Write the trinomial and check for a common factor first', math: `${targetText(desc, v)}` });
  if (pullText) {
    steps.push({
      say: sign < 0 ? 'The lead coefficient is negative, so factor out the −1 (with the GCF) first' : 'Factor out the greatest common factor',
      math: `${targetText(desc, v)} = ${pullText}(${targetText(innerDesc, v)})`,
    });
  }
  if (a1 === 1 && a2 === 1) {
    steps.push({ say: `a = 1 inside: two numbers that multiply to ${num(C)} and add to ${num(B)}`, math: `${numP(b1)} · ${numP(b2)} = ${num(C)},  ${num(b1)} + ${num(b2)} = ${num(B)}` });
    steps.push({ say: 'Each number goes into its own bracket', math: `${targetText(innerDesc, v)} = ${linText([1, b1], v)}${linText([1, b2], v)}` });
  } else {
    steps.push({ say: 'a ≠ 1 inside: multiply a · c', math: `${numP(A)} · ${numP(C)} = ${num(A * C)}` });
    steps.push({ say: `Two numbers that multiply to ${num(A * C)} and add to ${num(B)}`, math: `${num(a1 * b2)} and ${num(a2 * b1)}` });
    steps.push({ say: 'Split the middle term and factor by grouping', math: `${targetText(innerDesc, v)} = ${linText([a1, b1], v)}${linText([a2, b2], v)}` });
  }
  steps.push({ say: 'Factored completely', math: answer });
  steps.push({ say: 'Check by multiplying back out', math: `${answer} = ${targetText(desc, v)}` });
  return steps;
}

// ------------------------------------------------------------------------------------------------
// The builder
// ------------------------------------------------------------------------------------------------

const KINDS = Object.freeze({
  'a1': { template: 'T-factor-a1', skills: ['FAC1'] },
  'a2': { template: 'T-factor-a2', skills: ['FAC2'] },
  'gcf': { template: 'T-factor-gcf', skills: ['FAC1'] },
  'neg': { template: 'T-factor-neg', skills: ['FAC2'] },
});

/** A fixed exemplar per kind — used only if 200 draws never produce a legal item (contract, S2). */
const EXEMPLARS = Object.freeze({
  'a1': { v: 'n', sign: 1, g: 1, factors: [[1, 5], [1, -3]] },
  'a2': { v: 'p', sign: 1, g: 1, factors: [[3, -5], [1, 1]] },
  'gcf': { v: 'k', sign: 1, g: 3, factors: [[3, 1], [1, 7]] },
  'neg': { v: 'a', sign: -1, g: 1, factors: [[2, 5], [3, 5]] },
});

function assemble(kind, v, sign, g, inner, rng) {
  const c = sign * g;
  const answerTyped = { c, factors: inner.factors };
  const desc = expandFactors(answerTyped);
  const innerDesc = expandFactors(inner);
  const answer = factoredText(answerTyped, v);
  const stem = `Factor completely: ${targetText(desc, v)}`;
  const [, B] = desc;
  const isA1 = inner.factors.every(([a]) => a === 1);

  // --- misconceptions (every tag is catalogued in data/misconceptions.js) -----------------------
  const misconceptions = [];
  const flipped = { c, factors: inner.factors.map(([a, b]) => [a, -b]) };
  const flippedDesc = expandFactors(flipped);
  if (flippedDesc[1] !== B) {
    misconceptions.push({
      part: 'f',
      answer: factoredText(flipped, v),
      tag: 'middle-term',
      msg: `${factoredText(flipped, v)} expands to ${targetText(flippedDesc, v)} — the middle term should be ${num(B)}${v}. Flip the signs inside the brackets.`,
    });
  }
  if (sign < 0) {
    const noSign = { c: Math.abs(c), factors: inner.factors };
    misconceptions.push({
      part: 'f',
      answer: factoredText(noSign, v),
      tag: 'sign-whole',
      msg: `${factoredText(noSign, v)} expands to ${targetText(expandFactors(noSign), v)} — every sign is flipped. The original starts with ${num(desc[0])}${v}²: factor out the ${MINUS}1 and keep it in front.`,
    });
  }
  if (g > 1) {
    const noGcf = { c: sign, factors: inner.factors };
    misconceptions.push({
      part: 'f',
      answer: factoredText(noGcf, v),
      tag: 'dropped-gcf',
      msg: `${factoredText(noGcf, v)} expands to ${targetText(expandFactors(noGcf), v)} — that is the original divided by ${g}. The ${g} you pulled out is part of the answer: write it in front.`,
    });
  }

  return {
    id: `${KINDS[kind].template}#${seedTag(rng.seed)}`,
    template: KINDS[kind].template,
    params: { kind, var: v, sign, gcf: g, factors: inner.factors.map((f) => f.slice()), target: desc.slice() },
    prompt: stem,
    stem,
    figure: null,
    skills: kind === 'gcf' ? (isA1 ? ['FAC1'] : ['FAC2']) : KINDS[kind].skills.slice(),
    parts: [{
      id: 'f',
      type: 'factored',
      var: v,
      prompt: 'Factor completely.',
      target: desc.slice(),          // TYPED coefficient vector (descending) — S3 "typed in gen"
      answer,                        // display string for the solution screen
      answerTyped,                   // { c, factors } — grades identically to `answer` (tested)
    }],
    answer,
    hints: acHints(v, kind, g, sign, inner, innerDesc),
    solution: acSolution(v, desc, g, sign, inner, innerDesc, answer),
    misconceptions,
  };
}

function fromExemplar(kind, rng) {
  const e = EXEMPLARS[kind];
  return assemble(kind, e.v, e.sign, e.g, { c: 1, factors: e.factors.map((f) => f.slice()) }, rng);
}

/** Build one item of `kind` ∈ a1 | a2 | gcf | neg. */
export function build(rng, opts = {}) {
  const kind = opts.kind ?? 'a1';
  while (rng.draws < 200) {
    const v = opts.var ?? rng.pick(VARS);
    let innerMode = 'a1';
    let g = 1;
    let sign = 1;
    if (kind === 'a1') innerMode = 'a1';
    else if (kind === 'a2') innerMode = 'a2';
    else if (kind === 'gcf') { innerMode = rng.chance(0.5) ? 'a1' : 'a2'; g = rng.pick(GCFS); }
    else { // neg
      innerMode = rng.chance(0.75) ? 'a2' : 'a1';
      sign = -1;
      g = rng.chance(0.3) ? rng.pick(GCFS) : 1;
    }
    const inner = makeFactorPair(rng, innerMode);
    if (!inner) continue;
    const innerDesc = expandFactors(inner);
    if (!targetOk(innerDesc)) continue;
    const desc = expandFactors({ c: sign * g, factors: inner.factors });
    if (!targetOk(desc)) continue;
    // a2 / neg must genuinely exercise a > 1 inside; a1 / gcf-with-a1 must not.
    const lead = Math.abs(inner.factors[0][0] * inner.factors[1][0]);
    if (innerMode === 'a2' && lead < 2) continue;
    if (innerMode === 'a1' && lead !== 1) continue;
    return assemble(kind, v, sign, g, inner, rng);
  }
  return fromExemplar(kind, rng);
}

/** The registry entries for this file (imported by data/templates.js). */
export const templates = Object.freeze([
  Object.freeze({
    id: 'T-factor-a1', version: 1, label: 'Factor, a = 1', module: 'M10', sheet: 'FAC',
    skills: ['FAC1'], tier: 2, par: 90, partTypes: ['factored'],
    gen: (rng, opts = {}) => build(rng, { ...opts, kind: 'a1' }),
  }),
  Object.freeze({
    id: 'T-factor-a2', version: 1, label: 'Factor, a > 1', module: 'M10', sheet: 'FAC',
    skills: ['FAC2'], tier: 3, par: 120, partTypes: ['factored'],
    gen: (rng, opts = {}) => build(rng, { ...opts, kind: 'a2' }),
  }),
  Object.freeze({
    id: 'T-factor-gcf', version: 1, label: 'Factor with a GCF', module: 'M10', sheet: 'FAC',
    skills: ['FAC1'], tier: 3, par: 120, partTypes: ['factored'],
    gen: (rng, opts = {}) => build(rng, { ...opts, kind: 'gcf' }),
  }),
  Object.freeze({
    id: 'T-factor-neg', version: 1, label: 'Factor, negative lead', module: 'M10', sheet: 'FAC',
    skills: ['FAC2'], tier: 3, par: 120, partTypes: ['factored'],
    gen: (rng, opts = {}) => build(rng, { ...opts, kind: 'neg' }),
  }),
]);

export default templates;
