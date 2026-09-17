// segmid.js — T07b. Generator `T-seg-mid` (COMPOSED S2 "§7 diagram variants": the
// `ang-04` form — "triangle with midpoints, `am + b = m² + c`, exactly one positive
// root"; S8 #7b).
//
//   An isosceles triangle whose two legs are congruent, with the midpoint of each leg
//   joined by a segment. Those two givens make all four half-legs equal, so two
//   labelled halves can be set equal to each other: a quadratic in m with one root
//   that works and one that would make a length negative. The surviving root gives the
//   half-leg, then n from the third label and the perimeter from the whole sides.
//
// Invariants (S2): integer coefficients · exactly one positive root · the rejected
// root really does make a printed length negative (reason `negative-length`) · every
// length positive · the perimeter consistent with the four halves and the base.
//
// Contract: `gen(rng) → item`, deterministic, answer-backward, self-checked by
// re-parsing the printed labels with `grader/poly.js` and re-deriving every number,
// max 200 attempts then a fixed exemplar; the figure is gated on `validate()` +
// `lint()` at 343 px. See notes/T07b.md for the item shape.

import { resolve, validate } from '../figure/model.js';
import { lint } from '../figure/svg.js';
import { parsePoly, polyEvalAt } from '../grader/poly.js';
import { makeGen } from './contract.js';

export const TEMPLATE_VERSION = 1;
// The re-roll cap lives in contract.js (MAX_ATTEMPTS = 200): makeGen owns the draw loop.

const LETTERS = [...'ABCDEFGHJKLMNPQRSTUVWXYZ'];

function pickLetters(rng, n) {
  const pool = LETTERS.slice();
  const out = [];
  for (let i = 0; i < n; i++) out.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  return out;
}

/** `am + b` as printed (a ≥ 1). */
function linText(a, b, { ascii = false, v = 'm' } = {}) {
  const minus = ascii ? '-' : '−';
  const head = (a === 1 ? '' : String(a)) + v;
  if (b === 0) return head;
  return `${head} ${b < 0 ? minus : '+'} ${Math.abs(b)}`;
}

/** `m² + c` as printed. */
function sqText(c, { ascii = false, v = 'm' } = {}) {
  const minus = ascii ? '-' : '−';
  const head = ascii ? `${v}^2` : `${v}²`;
  if (c === 0) return head;
  return `${head} ${c < 0 ? minus : '+'} ${Math.abs(c)}`;
}

/** `n + k` / `n − k` as printed. */
function nText(k, { ascii = false, v = 'n' } = {}) {
  const minus = ascii ? '-' : '−';
  return `${v} ${k < 0 ? minus : '+'} ${Math.abs(k)}`;
}

const showNum = (n) => String(n).replace('-', '−');

// ---------------------------------------------------------------------------------------------
// figure: an isosceles triangle, the midpoint of each leg, and the segment joining them
// ---------------------------------------------------------------------------------------------

function buildFigure({ letters, apexX, apexY, halfW, baseY, mirror, labels, tag }) {
  const [P, Q, R, M1, M2] = letters;                    // apex, base-left, base-right, mid(PQ), mid(PR)
  const lx = mirror ? 200 + halfW : 200 - halfW;
  const rx = mirror ? 200 - halfW : 200 + halfW;
  const points = {
    [P]: [apexX, apexY],
    [Q]: [lx, baseY],
    [R]: [rx, baseY],
  };
  points[M1] = [(points[P][0] + points[Q][0]) / 2, (points[P][1] + points[Q][1]) / 2];
  points[M2] = [(points[P][0] + points[R][0]) / 2, (points[P][1] + points[R][1]) / 2];
  return {
    id: `G-segmid-${tag}`,
    kind: 'poly',
    points,
    segments: [[Q, M1, P], [P, M2, R], [Q, R], [M1, M2]],
    ticks: [],
    dots: [M1, M2],
    labels,
    labelOffsets: { point: {}, seg: {}, angle: {} },
  };
}

// ---------------------------------------------------------------------------------------------
// one attempt
// ---------------------------------------------------------------------------------------------

function attempt(rng) {
  const r1 = rng.int(3, 12);                            // the root that survives
  const r2 = -rng.int(1, 9);                            // the root that makes a length negative
  const a = r1 + r2;                                    // coefficient of m in `am + b`
  if (a < 1 || a > 12) return null;
  const bMax = a * -r2 - 1;                             // b < a·|r2|  ⇒  a·r2 + b < 0
  if (bMax < 1) return null;
  const b = rng.int(1, Math.min(bMax, 60));
  const c = b + r1 * r2;                                // `m² + c`; c − b = r1·r2
  if (Math.abs(c) > 80) return null;

  const half = a * r1 + b;                              // every half-leg
  if (half < 7 || half > 90) return null;
  if (a * r2 + b >= 0) return null;                     // the rejection has to be real

  let k = rng.int(-9, 9);
  if (k === 0) k = 3;
  const n = half - k;                                   // the third label is `n + k`
  if (n < 2 || n > 140) return null;

  const base = rng.int(5, 44);                          // the printed base length
  const perimeter = 4 * half + base;

  // which half carries which label (one m-label per leg, as on the sheet)
  const legA = rng.chance(0.5) ? 0 : 1;                 // 0 = upper half of the left leg, 1 = lower
  const legB = rng.chance(0.5) ? 0 : 1;
  const swapSides = rng.chance(0.5);                    // which leg carries `am + b`

  return { r1, r2, a, b, c, half, k, n, base, perimeter, legA, legB, swapSides };
}

function dress(rng, core) {
  const letters = pickLetters(rng, 5);                  // [apex, base-left, base-right, mid1, mid2]
  const [P, Q, R, M1, M2] = letters;
  const apexX = 200 + rng.int(-22, 22);
  const apexY = 26 + rng.int(0, 14);
  const halfW = 94 + rng.int(0, 14);
  const baseY = 218 + rng.int(0, 8);
  const mirror = rng.chance(0.5);

  // the four half-legs, as [from, to] pairs
  const leftHalves = [[P, M1], [M1, Q]];
  const rightHalves = [[P, M2], [M2, R]];
  const sideLin = core.swapSides ? rightHalves : leftHalves;
  const sideSq = core.swapSides ? leftHalves : rightHalves;
  const segLin = sideLin[core.legA];
  const segN = sideLin[1 - core.legA];
  const segSq = sideSq[core.legB];

  const textLin = linText(core.a, core.b);
  const textSq = sqText(core.c);
  const textN = nText(core.k);
  const labels = [
    { seg: segLin.slice(), text: textLin },
    { seg: segN.slice(), text: textN },
    { seg: segSq.slice(), text: textSq },
    { seg: [Q, R], text: String(core.base) },
  ];

  const tag = `${letters.join('')}${core.r1}_${core.a}_${core.b}${mirror ? 'm' : ''}`;
  const spec = buildFigure({ letters, apexX, apexY, halfW, baseY, mirror, labels, tag });
  const figure = { id: spec.id, spec, rename: {}, labels, notToScale: true };

  let model;
  try {
    model = resolve(spec, figure);
  } catch {
    return null;
  }
  if (validate(model).length) return null;
  if (lint(model, { widthPx: 343 }).length) return null;

  // self-check: re-read the printed strings and re-derive every number
  const A = parsePoly(textLin, { var: 'm' });
  const B = parsePoly(textSq, { var: 'm' });
  if (!A.ok || !B.ok) return null;
  for (const r of [core.r1, core.r2]) {
    if (Math.abs(polyEvalAt(A.poly, r) - polyEvalAt(B.poly, r)) > 1e-9) return null;
  }
  if (Math.abs(polyEvalAt(A.poly, core.r1) - core.half) > 1e-9) return null;
  if (!(polyEvalAt(A.poly, core.r2) < 0)) return null;
  if (core.n + core.k !== core.half) return null;
  if (core.perimeter !== 2 * (2 * core.half) + core.base) return null;

  return { core, letters, P, Q, R, M1, M2, segLin, segN, segSq, textLin, textSq, textN, spec, figure, model };
}

// ---------------------------------------------------------------------------------------------
// item assembly
// ---------------------------------------------------------------------------------------------

const segName = ([x, y]) => `${x}${y}`;

function itemFrom(d) {
  const c = d.core;
  const { P, Q, R, M1, M2 } = d;
  const asciiLin = linText(c.a, c.b, { ascii: true });
  const asciiSq = sqText(c.c, { ascii: true });
  const linName = segName(d.segLin);
  const sqName = segName(d.segSq);
  const nName = segName(d.segN);
  const whole1 = `${Q}${P}`;
  const whole2 = `${P}${R}`;

  const parts = [
    {
      id: 'setup', type: 'equation', optional: true,
      prompt: `Set up the equation for m (skippable — graded when tried)`,
      canonical: `(${asciiSq})-(${asciiLin})`, var: 'm', mustMention: [],
    },
    { id: 'm', type: 'roots', var: 'm', label: 'm =', answer: [String(c.r1), String(c.r2)], mustMention: null },
    {
      id: 'keep', type: 'reject', of: 'm',
      valid: [String(c.r1)], rejected: [String(c.r2)],
      reason: 'negative side length', reasonKey: 'negative-length',
      distractors: ['both values work', `${c.r1} is too big for a side`, `${showNum(c.r2)} does not satisfy the equation`],
    },
    {
      id: 'rest', type: 'multi', prompt: 'Now n and the perimeter',
      fields: [
        { key: 'n', label: 'n =', answer: String(c.n) },
        { key: 'P', label: 'perimeter =', answer: String(c.perimeter) },
      ],
    },
  ];

  return {
    tier: 4,
    par: 300,
    skills: ['SEG-ALG', 'QUAD-SOLVE'],
    needs: ['QUAD-SOLVE'],
    forCards: ['ang-04'],
    params: {
      roots: [c.r1, c.r2], a: c.a, b: c.b, c: c.c, half: c.half, n: c.n, k: c.k,
      base: c.base, perimeter: c.perimeter, letters: d.letters,
    },
    stem: `In the following diagram, {seg ${whole1}} ≅ {seg ${whole2}} and {seg ${M1}${M2}} bisects {seg ${whole1}} and {seg ${whole2}}. Find m, n, and the perimeter of triangle ${Q}${P}${R}.`,
    prompt: `In the following diagram, {seg ${whole1}} ≅ {seg ${whole2}} and {seg ${M1}${M2}} bisects {seg ${whole1}} and {seg ${whole2}}. Find m, n, and the perimeter of triangle ${Q}${P}${R}.`,
    note: `One half-leg carries no label and there are no tick marks — what the two givens tell you about the four halves is the first step.`,
    figure: d.figure,
    parts,
    answer: `m = ${c.r1}   \u00b7   n = ${c.n}   \u00b7   perimeter = ${c.perimeter}`,
    answerData: { m: String(c.r1), n: String(c.n), perimeter: String(c.perimeter), half: String(c.half) },
    hints: [
      `{seg ${M1}${M2}} bisects both legs, so ${M1} is the midpoint of {seg ${whole1}} and ${M2} is the midpoint of {seg ${whole2}}: ${P}${M1} = ${M1}${Q} and ${P}${M2} = ${M2}${R}. And {seg ${whole1}} ≅ {seg ${whole2}} makes all four halves equal.`,
      `${sqName} and ${linName} are two of those equal halves: ${d.textSq} = ${d.textLin}. Bring everything to one side and factor.`,
      `Two roots come out; one of them makes a length negative, so it is rejected. Use the other to find every half, then n from ${nName} = ${d.textN}, and the perimeter from the WHOLE sides.`,
    ],
    solution: [
      { say: `{seg ${M1}${M2}} bisects both legs, so ${M1} and ${M2} are midpoints: ${P}${M1} = ${M1}${Q} and ${P}${M2} = ${M2}${R}. With {seg ${whole1}} ≅ {seg ${whole2}}, all four halves are equal.`, math: `${P}${M1} = ${M1}${Q} = ${P}${M2} = ${M2}${R}` },
      { say: 'Two of the halves carry labels. Set them equal.', math: `${d.textSq} = ${d.textLin}` },
      { say: 'Bring everything to one side and factor.', math: `m² − ${c.a}m ${c.c - c.b < 0 ? '−' : '+'} ${Math.abs(c.c - c.b)} = 0  →  (m − ${c.r1})(m ${c.r2 < 0 ? '+' : '−'} ${Math.abs(c.r2)}) = 0` },
      { say: `Two roots. m = ${showNum(c.r2)} makes ${linName} = ${c.a}(${showNum(c.r2)}) ${c.b < 0 ? '−' : '+'} ${Math.abs(c.b)} = ${showNum(c.a * c.r2 + c.b)}, a negative length — reject it.`, math: `m = ${c.r1}   (m = ${showNum(c.r2)} rejected: negative side length)` },
      { say: `Now every half is ${c.a}(${c.r1}) ${c.b < 0 ? '−' : '+'} ${Math.abs(c.b)} = ${c.half}. ${nName} is also ${c.half}, and ${nName} = ${d.textN}.`, math: `${d.textN} = ${c.half}  →  n = ${c.n}` },
      { say: `Whole sides: ${whole1} = ${c.half} + ${c.half} = ${2 * c.half}, ${whole2} = ${2 * c.half}, ${Q}${R} = ${c.base}.`, math: `P = ${2 * c.half} + ${2 * c.half} + ${c.base} = ${c.perimeter}` },
    ],
    misconceptions: [
      { part: 'm', answer: String(c.r1), tag: 'forgot-second-root', msg: 'The quadratic has two roots — list both, then decide which one to keep.' },
      { part: 'keep', answer: `keep ${c.r2}`, tag: 'kept-invalid-root', msg: `m = ${showNum(c.r2)} makes ${linName} = ${showNum(c.a * c.r2 + c.b)} — a side cannot have negative length.` },
      { part: 'keep', answer: `reject ${c.r1}`, tag: 'rejected-valid-root', msg: `m = ${c.r1} gives ${c.half} for both labelled halves — positive lengths, so ${c.r1} is the one to keep.` },
      { part: 'rest', answer: String(c.half), tag: 'arithmetic', msg: `${c.half} is the half-leg. ${nName} = ${d.textN} equals ${c.half}, so n is ${c.k < 0 ? `${Math.abs(c.k)} more than` : `${c.k} less than`} that.` },
      { part: 'rest', answer: String(c.half + c.k), tag: 'sign-flip', msg: `${d.textN} = ${c.half} — move the ${Math.abs(c.k)} the other way.` },
      { part: 'rest', answer: String(2 * c.half + c.base), tag: 'half-side-perimeter', msg: `That perimeter used the HALF legs. Each whole leg is ${2 * c.half}.` },
      { part: 'setup', answer: `(${asciiSq})+(${asciiLin})`, tag: 'midpoint-not-equal', msg: `A midpoint makes the halves EQUAL — set ${d.textSq} equal to ${d.textLin}; do not add them.` },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// exemplar + entry point
// ---------------------------------------------------------------------------------------------

function fixedRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(lo, hi) { if (hi === undefined) { hi = lo; lo = 0; } return lo + Math.floor(next() * (hi - lo + 1)); },
    chance(p) { return next() < p; },
    pick(arr) { return arr[Math.floor(next() * arr.length)]; },
    shuffle(arr) { const out = Array.from(arr); for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); const t = out[i]; out[i] = out[j]; out[j] = t; } return out; },
  };
}

function build(rng) {
  const core = attempt(rng);
  if (!core) return null;
  const d = dress(rng, core);
  if (!d) return null;
  return itemFrom(d);
}

let EXEMPLAR = null;
function exemplarDraft() {
  if (EXEMPLAR) return EXEMPLAR;
  const rng = fixedRng(0x5e6a11d);
  for (let i = 0; i < 6000; i++) {
    const draft = build(rng);
    if (draft) { EXEMPLAR = draft; return draft; }
  }
  throw new Error('segmid: no exemplar could be built');
}

/** The contract's per-template check: the emitted polygon must still be clean. */
export function verifyFigure(item) {
  const out = [];
  const f = item && item.figure;
  if (!f || !f.spec) return ['figure: no spec'];
  let model;
  try {
    model = resolve(f.spec, f);
  } catch (e) {
    return [`figure: does not resolve (${e && e.message ? e.message : String(e)})`];
  }
  for (const q of validate(model)) out.push(`figure: ${q}`);
  for (const q of lint(model, { widthPx: 343 })) out.push(`figure: ${q}`);
  return out;
}

/** One draw for the contract's re-roll loop. */
export function drawSegMid(rng) { return build(rng); }

/** `T-seg-mid` — the ang-04 triangle-with-midpoints quadratic. */
export const genSegMid = makeGen('T-seg-mid', drawSegMid, {
  version: TEMPLATE_VERSION, skills: ['SEG-ALG', 'QUAD-SOLVE'], tier: 4, par: 300,
  module: 'M8', sheet: 'AP-2', verify: verifyFigure,
  exemplar: () => exemplarDraft(),
});

export default { genSegMid, TEMPLATE_VERSION };
