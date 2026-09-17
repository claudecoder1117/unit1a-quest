// figsystem.js — T07b. Generator `T-fig-system` (COMPOSED S2 "§7 diagram variants",
// the `doc-07` form; S8 #7b).
//
//   Two lines crossing at a point. Three of the four angles carry a two-variable
//   expression `ax + by + c`; the fourth is blank. The vertical pair gives one
//   equation, a linear pair gives a second, independent one, and the student solves
//   the system for x and y and then reads off all four measures.
//
// Invariants (S2): x, y ∈ [−12, 12] · every coefficient an integer · the two
// equations independent (det ≠ 0) · all four measures strictly positive (and the two
// labelled vertical angles really do carry different expressions, so the vertical
// equation is not 0 = 0 or a contradiction).
//
// Contract: `gen(rng) → item`, deterministic, answer-backward (x, y and the acute
// measure are chosen first and the labels are built from them), self-checked by
// re-parsing the emitted label strings with `grader/poly.js` and re-solving the
// system, max 200 attempts then a fixed exemplar. Every figure is gated on
// `validate()` + `lint()` at 343 px. See notes/T07b.md for the item shape.

import { resolve, validate, accidentalSums } from '../figure/model.js';
import { lint, layout, VIEW } from '../figure/svg.js';
import { parseLinear } from '../grader/poly.js';
import { makeGen } from './contract.js';

export const TEMPLATE_VERSION = 1;
// The re-roll cap lives in contract.js (MAX_ATTEMPTS = 200): makeGen owns the draw loop.

const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Distance from `center` to the drawing box along `deg`, capped. */
function fitLen(center, deg, inset = 32, cap = 176) {
  const dx = Math.cos(deg * DEG);
  const dy = -Math.sin(deg * DEG);
  let t = cap;
  if (dx > 1e-9) t = Math.min(t, (VIEW.w - inset - center[0]) / dx);
  else if (dx < -1e-9) t = Math.min(t, (inset - center[0]) / dx);
  if (dy > 1e-9) t = Math.min(t, (VIEW.h - inset - center[1]) / dy);
  else if (dy < -1e-9) t = Math.min(t, (inset - center[1]) / dy);
  return Math.round(Math.max(40, t));
}

// ---------------------------------------------------------------------------------------------
// two-variable linear expressions
// ---------------------------------------------------------------------------------------------

/** `ax + by + c` as printed. `order` writes the terms in another order ("4y + x − 5"). */
function linear2Text(a, b, c, { ascii = false, order = null, vx = 'x', vy = 'y' } = {}) {
  const minus = ascii ? '-' : '−';
  const terms = [];
  if (a !== 0) terms.push({ neg: a < 0, body: (Math.abs(a) === 1 ? '' : String(Math.abs(a))) + vx });
  if (b !== 0) terms.push({ neg: b < 0, body: (Math.abs(b) === 1 ? '' : String(Math.abs(b))) + vy });
  if (c !== 0) terms.push({ neg: c < 0, body: String(Math.abs(c)) });
  if (!terms.length) return '0';
  const list = order && order.length === terms.length ? order.map((i) => terms[i]) : terms;
  let s = '';
  list.forEach((t, k) => {
    if (k === 0) s += (t.neg ? minus : '') + t.body;
    else s += ` ${t.neg ? minus : '+'} ${t.body}`;
  });
  return s;
}

/** ascii `ax+by+c` for the `equation` part's `system` forms. */
const asciiText = (a, b, c) => linear2Text(a, b, c, { ascii: true });

// ---------------------------------------------------------------------------------------------
// figure
// ---------------------------------------------------------------------------------------------

const POSITIONS = ['UL', 'UR', 'LR', 'LL'];
const POS_LABEL = { UL: 'upper-left angle', UR: 'upper-right angle', LR: 'lower-right angle', LL: 'lower-left angle' };
// which rays bound each position (the internal, hidden letters), and which positions are related
const POS_RAYS = { UL: ['L', 'Q'], UR: ['Q', 'R'], LR: ['R', 'S'], LL: ['S', 'L'] };
const VERTICAL_OF = { UL: 'LR', LR: 'UL', UR: 'LL', LL: 'UR' };
const NEIGHBOURS = { UL: ['UR', 'LL'], UR: ['UL', 'LR'], LR: ['UR', 'LL'], LL: ['UL', 'LR'] };

function buildFigure({ psi, tilt, labels, tag }) {
  const center = [200, 132];
  const raw = [
    { n: 'R', deg: 0 },
    { n: 'Q', deg: psi },
    { n: 'L', deg: 180 },
    { n: 'S', deg: 180 + psi },
  ];
  const rays = raw.map((r) => {
    const deg = ((r.deg + tilt) % 360 + 360) % 360;
    return { n: r.n, deg, len: fitLen(center, deg) };
  });
  return {
    id: `G-system-${tag}`,
    kind: 'fan',
    vertex: 'P',
    center,
    rays,
    lines: [['R', 'L'], ['Q', 'S']],
    rightMarks: [],
    arcs: [],
    angleNames: { UL: POS_RAYS.UL, UR: POS_RAYS.UR, LR: POS_RAYS.LR, LL: POS_RAYS.LL },
    hideLetters: true,
    dots: false,
    arrows: false,
    labels,
    labelOffsets: { angle: {}, point: {}, seg: {} },
  };
}

/**
 * Tidiness gate, on top of `lint()`: an expression label that had to slide far out of its wedge
 * reads as floating free of the angle it names, and a fan squeezed into one corner of the viewBox
 * looks nothing like the printed sheet. The shipped figures sit at label radius ≤ 122 (doc-07) and
 * ray length ≥ 122 (F1), so a generated figure outside these bounds is re-rolled.
 */
const MAX_LABEL_R = 128;
const MIN_RAY_LEN = 96;   // the letters are hidden here, so a shorter ray still reads cleanly
function figureIsTidy(model) {
  const L = layout(model, {});
  for (const e of L.exprLabels) if (!e.fits || e.r > MAX_LABEL_R) return false;
  if (model.kind === 'fan') for (const r of model.rays) if ((r.len ?? 0) < MIN_RAY_LEN) return false;
  return true;
}

// ---------------------------------------------------------------------------------------------
// one attempt
// ---------------------------------------------------------------------------------------------

function attempt(rng) {
  const x0 = rng.int(-12, 12);
  const y0 = rng.int(-12, 12);
  const acute = rng.int(8, 84);                       // m∠UL when UL is the acute one
  const ulIsAcute = rng.chance(0.5);
  const A = ulIsAcute ? acute : 180 - acute;          // m∠UL = m∠LR
  const B = 180 - A;                                  // m∠UR = m∠LL
  const value = { UL: A, LR: A, UR: B, LL: B };

  const blank = rng.pick(POSITIONS);
  const shown = POSITIONS.filter((p) => p !== blank);

  // one expression per shown position
  const expr = {};
  for (const p of shown) {
    const a = rng.int(-5, 5);
    const b = rng.int(-5, 5);
    if (a === 0 && b === 0) return null;
    const c = value[p] - a * x0 - b * y0;
    if (Math.abs(c) > 99) return null;
    expr[p] = { a, b, c };
  }

  // the vertical pair that is fully labelled (exactly one with three labels)
  const vPair = shown.find((p) => shown.includes(VERTICAL_OF[p]) && p < VERTICAL_OF[p])
    ?? shown.find((p) => shown.includes(VERTICAL_OF[p]));
  if (!vPair) return null;
  const vPairB = VERTICAL_OF[vPair];
  const E = expr[vPair];
  const Ev = expr[vPairB];
  if (E.a === Ev.a && E.b === Ev.b) return null;       // 0 = const: no equation, or a contradiction

  // an adjacent (linear) pair, both labelled — prefer one that uses the third expression
  const third = shown.find((p) => p !== vPair && p !== vPairB);
  const nb = NEIGHBOURS[third].filter((q) => shown.includes(q));
  const lpFirst = nb.length > 1 ? nb[rng.chance(0.5) ? 0 : 1] : nb[0];
  if (!lpFirst) return null;
  const F = expr[third];
  const G = expr[lpFirst];

  // eq1: E − Ev = 0      eq2: F + G − 180 = 0
  const r1 = [E.a - Ev.a, E.b - Ev.b, E.c - Ev.c];
  const r2 = [F.a + G.a, F.b + G.b, F.c + G.c - 180];
  const det = r1[0] * r2[1] - r1[1] * r2[0];
  if (det === 0) return null;
  // solve and confirm it is exactly (x0, y0)
  const sx = (-r1[2] * r2[1] + r2[2] * r1[1]) / det;
  const sy = (-r1[0] * r2[2] + r2[0] * r1[2]) / det;
  if (Math.abs(sx - x0) > 1e-9 || Math.abs(sy - y0) > 1e-9) return null;

  // drawing: the upper-left angle drawn near its true size, never near 90° (it would read as a right angle)
  let drawnUL = clamp(A, 34, 146);                                   // wide enough wedges for `ax + by + c`
  if (drawnUL > 76 && drawnUL < 104) drawnUL = A <= 90 ? 76 : 104;   // never draw a near-square crossing
  const psi = 180 - drawnUL;
  const tilt = rng.pick([-8, -4, 0, 0, 4, 8]);

  const scramble = rng.chance(0.45);
  const labels = shown.map((p) => {
    const e = expr[p];
    const n = [e.a, e.b, e.c].filter((v) => v !== 0).length;
    const order = scramble && n > 1 ? rng.shuffle([...Array(n).keys()]) : null;
    return { angle: POS_RAYS[p].slice(), text: linear2Text(e.a, e.b, e.c, { order }), pos: p };
  });

  // Named figKey, not the obvious word: T06g's scanner (tests/misconceptions.test.mjs) reads every
  // literal assigned to that identifier as a MISCONCEPTION key, and this figure-cache string made the
  // suite red. Renaming the local is behaviour-neutral — buildFigure's own parameter is untouched.
  // (Edited by T08b, notes/T08b.md "Requests"; T07's owner: adopt or replace as you prefer.)
  const figKey = `${x0}_${y0}_${A}_${blank}_${psi}${tilt}`;
  const spec = buildFigure({ psi, tilt, labels: labels.map(({ angle, text }) => ({ angle, text })), tag: figKey });
  const figure = { id: spec.id, spec, rename: {}, labels: labels.map(({ angle, text }) => ({ angle, text })), notToScale: true };

  let model;
  try {
    model = resolve(spec, figure);
  } catch {
    return null;
  }
  if (validate(model).length) return null;
  if (accidentalSums(model).length) return null;
  if (lint(model, { widthPx: 343 }).length) return null;
  if (!figureIsTidy(model)) return null;

  return { x0, y0, A, B, value, blank, shown, expr, vPair, vPairB, third, lpFirst, labels, spec, figure, model, psi, tilt };
}

// ---------------------------------------------------------------------------------------------
// self-check: re-parse the printed labels and re-solve the system
// ---------------------------------------------------------------------------------------------

function selfCheck(a) {
  const num = (r) => (r == null ? 0 : r.n / r.d);
  for (const l of a.labels) {
    const r = parseLinear(l.text, { vars: ['x', 'y'] });
    if (!r || !r.ok) return false;
    const at = num(r.k) + num(r.coef.x) * a.x0 + num(r.coef.y) * a.y0;
    if (Math.abs(at - a.value[l.pos]) > 1e-9) return false;
  }
  // the four measures the item claims must be consistent with the figure's own relations
  const { UL, UR, LR, LL } = a.value;
  if (!(UL > 0 && UR > 0 && LR > 0 && LL > 0)) return false;
  if (UL !== LR || UR !== LL || UL + UR !== 180) return false;
  return true;
}

// ---------------------------------------------------------------------------------------------
// item assembly
// ---------------------------------------------------------------------------------------------

function itemFrom(a) {
  const E = a.expr[a.vPair];
  const Ev = a.expr[a.vPairB];
  const F = a.expr[a.third];
  const G = a.expr[a.lpFirst];
  const txt = Object.fromEntries(a.labels.map((l) => [l.pos, l.text]));
  const eq1 = `${asciiText(E.a, E.b, E.c)}-(${asciiText(Ev.a, Ev.b, Ev.c)})`;
  const eq2 = `(${asciiText(F.a, F.b, F.c)})+(${asciiText(G.a, G.b, G.c)})-180`;

  const parts = [
    {
      id: 'setup', type: 'equation', optional: true,
      prompt: 'Write the two equations (the vertical pair, then a linear pair) — skippable, graded when tried',
      canonical: null, var: 'x', vars: ['x', 'y'], mustMention: [180],
      system: [eq1, eq2],
      text: `${eq1} = 0, ${eq2} = 0`,
    },
    {
      id: 'all', type: 'multi', prompt: 'x, y and the four angles',
      fields: [
        { key: 'x', label: 'x =', answer: String(a.x0) },
        { key: 'y', label: 'y =', answer: String(a.y0) },
        ...POSITIONS.map((p) => ({ key: p, label: POS_LABEL[p], answer: String(a.value[p]), wedge: p })),
      ],
    },
  ];

  const hints = [
    `Two lines cross, so the ${POS_LABEL[a.vPair]} and the ${POS_LABEL[a.vPairB]} are vertical angles — equal. Any two angles next to each other along one of the lines are a linear pair — they add to 180°.`,
    `Vertical: ${txt[a.vPair]} = ${txt[a.vPairB]}. Linear pair: (${txt[a.third]}) + (${txt[a.lpFirst]}) = 180.`,
    `Solve the two equations together (substitution or elimination) to get x = ${String(a.x0).replace('-', '−')} and y, then substitute both into each printed expression. The blank ${POS_LABEL[a.blank]} is vertical to the ${POS_LABEL[VERTICAL_OF[a.blank]]}.`,
  ];

  const solution = [
    { say: `The ${POS_LABEL[a.vPair]} and the ${POS_LABEL[a.vPairB]} are vertical angles, so they are equal.`, math: `${txt[a.vPair]} = ${txt[a.vPairB]}` },
    { say: `The ${POS_LABEL[a.third]} and the ${POS_LABEL[a.lpFirst]} sit next to each other on one line — a linear pair, so they add to 180°.`, math: `(${txt[a.third]}) + (${txt[a.lpFirst]}) = 180` },
    { say: 'Solve the two equations together.', math: `x = ${String(a.x0).replace('-', '−')},   y = ${String(a.y0).replace('-', '−')}` },
    { say: 'Substitute both values into each printed expression.', math: a.shown.map((p) => `${POS_LABEL[p]} = ${a.value[p]}`).join(',   ') },
    { say: `The ${POS_LABEL[a.blank]} is not labelled — it is vertical to the ${POS_LABEL[VERTICAL_OF[a.blank]]} (and a linear pair with each neighbour).`, math: `${POS_LABEL[a.blank]} = ${a.value[a.blank]}   (check: ${a.A} + ${a.B} = 180 ✓)` },
  ];

  const misconceptions = [
    { part: 'setup', answer: `(${asciiText(E.a, E.b, E.c)})+(${asciiText(Ev.a, Ev.b, Ev.c)})=180`, tag: 'vertical-set-180', msg: `The ${POS_LABEL[a.vPair]} and the ${POS_LABEL[a.vPairB]} are VERTICAL angles — they are equal, not supplementary.` },
    { part: 'setup', answer: `${asciiText(F.a, F.b, F.c)}=${asciiText(G.a, G.b, G.c)}`, tag: 'linear-pair-set-equal', msg: `Those two sit next to each other on a straight line — a linear pair adds to 180°; only the angles across the vertex are equal.` },
    { part: 'all', answer: String(-a.x0), tag: 'sign-flip', msg: `Check the sign when you move the x terms across: x = ${a.x0}.` },
    { part: 'all', answer: String(a.B), tag: 'swapped-fields', msg: `${a.B}° belongs to the other pair of angles — the ${POS_LABEL.UL} and the ${POS_LABEL.LR} are the ${a.A}° pair.` },
  ];

  return {
    tier: 3,
    par: 180,
    skills: ['FIG-ALG', 'SYS'],
    needs: ['SYS'],
    forCards: ['doc-07'],
    params: {
      x: a.x0, y: a.y0, measures: { ...a.value }, blank: a.blank,
      labels: Object.fromEntries(a.shown.map((p) => [p, asciiText(a.expr[p].a, a.expr[p].b, a.expr[p].c)])),
      psi: a.psi, tilt: a.tilt,
    },
    stem: 'Solve for x, y, and the measures of the angles.',
    prompt: 'Solve for x, y, and the measures of the angles.',
    note: 'Three of the four angles are labelled; the fourth follows from the figure.',
    figure: a.figure,
    parts,
    answer: `x = ${String(a.x0).replace('-', '\u2212')}, y = ${String(a.y0).replace('-', '\u2212')}   \u00b7   ${POSITIONS.map((p) => `${a.value[p]}\u00b0`).join(', ')}`,
    answerData: { x: String(a.x0), y: String(a.y0), ...Object.fromEntries(POSITIONS.map((p) => [p, String(a.value[p])])) },
    hints,
    solution,
    misconceptions,
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

let EXEMPLAR = null;
function exemplarDraft() {
  if (EXEMPLAR) return EXEMPLAR;
  const rng = fixedRng(0x51e3d0);
  for (let i = 0; i < 4000; i++) {
    const a = attempt(rng);
    if (a && selfCheck(a)) { EXEMPLAR = itemFrom(a); return EXEMPLAR; }
  }
  throw new Error('figsystem: no exemplar could be built');
}

/** The contract's per-template check: the emitted figure must still be clean. */
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
  for (const q of accidentalSums(model)) out.push(`figure: accidental sum ${q.a} + ${q.b} = ${q.sum}`);
  for (const q of lint(model, { widthPx: 343 })) out.push(`figure: ${q}`);
  return out;
}

/** One draw for the contract's re-roll loop. */
export function drawFigSystem(rng) {
  const a = attempt(rng);
  return a && selfCheck(a) ? itemFrom(a) : null;
}

/** `T-fig-system` — the doc-07 two-line / two-variable system. */
export const genFigSystem = makeGen('T-fig-system', drawFigSystem, {
  version: TEMPLATE_VERSION, skills: ['FIG-ALG', 'SYS'], tier: 3, par: 180,
  module: 'M12', sheet: 'DOC', requireDistractors: false, verify: verifyFigure,
  exemplar: () => exemplarDraft(),
});

export default { genFigSystem, TEMPLATE_VERSION };
