// figbisect.js — T07b. Generators `T-fig-bisect-L` and `T-fig-bisect-Q`
// (COMPOSED S2 "§7 diagram variants": the `doc-05` and `ang-05` forms; S8 #7b).
//
//   Three rays from one vertex: the middle ray splits the whole angle into two
//   labelled parts. Angle addition gives the equation; whether the ray *bisects* is
//   a second, separate question answered by comparing the two halves.
//   `-L` : linear labels, one value of x, one verdict → the doc-05 Proof Strip.
//   `-Q` : a quadratic label, two integer roots, one case per root → the ang-05
//          shape (setup · roots · cases with a YES/NO column · a two-case strip).
//
// S2 invariants: the verdict is chosen FIRST and the expressions are built to match;
// a NO case has halves differing by at least 4°; the Q variant has two integer roots
// and every combination of case verdicts (yes/yes, yes/no, no/no) is reachable; every
// measure is a positive integer and the whole angle stays under 180°.
//
// Contract: `gen(rng) → item`, deterministic, answer-backward, self-checked by
// re-parsing the emitted label strings with `grader/poly.js` and re-solving, max 200
// attempts then a fixed exemplar; figures gated on `validate()` + `lint()` at 343 px
// and strips gated on the strip grader's own `validate()`. See notes/T07b.md.

import { angleId, angleName, resolve, validate, accidentalSums } from '../figure/model.js';
import { lint, layout, VIEW } from '../figure/svg.js';
import { validate as validateStrip } from '../grader/strip.js';
import { parsePoly, polyEvalAt } from '../grader/poly.js';
import { makeGen } from './contract.js';

export const TEMPLATE_VERSION = 1;
// The re-roll cap lives in contract.js (MAX_ATTEMPTS = 200): makeGen owns the draw loop.

const LETTERS = [...'ABCDEFGHJKLMNPQRSTUVWXYZ'];
const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function pickLetters(rng, n) {
  const pool = LETTERS.slice();
  const out = [];
  for (let i = 0; i < n; i++) out.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  return out;
}

function fitLen(center, deg, inset = 30, cap = 178) {
  const dx = Math.cos(deg * DEG);
  const dy = -Math.sin(deg * DEG);
  let t = cap;
  if (dx > 1e-9) t = Math.min(t, (VIEW.w - inset - center[0]) / dx);
  else if (dx < -1e-9) t = Math.min(t, (inset - center[0]) / dx);
  if (dy > 1e-9) t = Math.min(t, (VIEW.h - inset - center[1]) / dy);
  else if (dy < -1e-9) t = Math.min(t, (inset - center[1]) / dy);
  return Math.round(Math.max(40, t));
}

function centerFor(degs) {
  let sx = 0;
  let sy = 0;
  for (const d of degs) { sx += Math.cos(d * DEG); sy += -Math.sin(d * DEG); }
  const n = degs.length || 1;
  return [
    Math.round(clamp(200 - (sx / n) * 78, 108, 292)),
    Math.round(clamp(150 - (sy / n) * 62, 66, 220)),
  ];
}

/** Point letters off their own ray (svg.js's default would sit on the stroke). */
function letterOffsets(rays) {
  const out = {};
  for (const r of rays) {
    const ux = Math.cos(r.deg * DEG);
    const uy = -Math.sin(r.deg * DEG);
    let sx = 0;
    let sy = 0;
    for (const q of rays) { if (q === r) continue; sx += Math.cos(q.deg * DEG); sy += -Math.sin(q.deg * DEG); }
    const px = -uy;
    const py = ux;
    const sign = px * sx + py * sy > 0 ? -1 : 1;
    out[r.n] = [Math.round(ux * 5 + sign * px * 15), Math.round(uy * 5 + sign * py * 15)];
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// expression text
// ---------------------------------------------------------------------------------------------

/** `ax + b` (a ≠ 0) as printed; `order` may put the constant first ("84 − x"). */
function linText(a, b, { ascii = false, order = null, v = 'x' } = {}) {
  const minus = ascii ? '-' : '−';
  const terms = [];
  if (a !== 0) terms.push({ neg: a < 0, body: (Math.abs(a) === 1 ? '' : String(Math.abs(a))) + v });
  if (b !== 0 || !terms.length) terms.push({ neg: b < 0, body: String(Math.abs(b)) });
  const list = order && order.length === terms.length ? order.map((i) => terms[i]) : terms;
  let s = '';
  list.forEach((t, k) => { s += k === 0 ? (t.neg ? minus : '') + t.body : ` ${t.neg ? minus : '+'} ${t.body}`; });
  return s;
}

/** monic `x² + px + q` as printed. */
function quadText(p, q, { ascii = false, order = null, v = 'x' } = {}) {
  const minus = ascii ? '-' : '−';
  const sq = ascii ? `${v}^2` : `${v}²`;
  const terms = [{ neg: false, body: sq }];
  if (p !== 0) terms.push({ neg: p < 0, body: (Math.abs(p) === 1 ? '' : String(Math.abs(p))) + v });
  if (q !== 0) terms.push({ neg: q < 0, body: String(Math.abs(q)) });
  const list = order && order.length === terms.length ? order.map((i) => terms[i]) : terms;
  let s = '';
  list.forEach((t, k) => { s += k === 0 ? (t.neg ? minus : '') + t.body : ` ${t.neg ? minus : '+'} ${t.body}`; });
  return s;
}

/** general `a2x² + a1x + a0` as printed (a2 may be 0 or negative). */
function poly2Text(a2, a1, a0, { ascii = false, order = null, v = 'x' } = {}) {
  const minus = ascii ? '-' : '−';
  const sq = ascii ? `${v}^2` : `${v}²`;
  const terms = [];
  if (a2 !== 0) terms.push({ neg: a2 < 0, body: (Math.abs(a2) === 1 ? '' : String(Math.abs(a2))) + sq });
  if (a1 !== 0) terms.push({ neg: a1 < 0, body: (Math.abs(a1) === 1 ? '' : String(Math.abs(a1))) + v });
  if (a0 !== 0 || !terms.length) terms.push({ neg: a0 < 0, body: String(Math.abs(a0)) });
  const list = order && order.length === terms.length ? order.map((i) => terms[i]) : terms;
  let s = '';
  list.forEach((t, k) => { s += k === 0 ? (t.neg ? minus : '') + t.body : ` ${t.neg ? minus : '+'} ${t.body}`; });
  return s;
}

const showNum = (n) => String(n).replace('-', '−');

// ---------------------------------------------------------------------------------------------
// the figure: three rays, the middle one splitting the whole angle
// ---------------------------------------------------------------------------------------------

function buildFigure({ letters, base, total, split, labels, tag }) {
  const [v, p1, mid, p2] = letters;                     // p1 — mid — p2 in increasing angle
  const raw = [
    { n: p2, deg: base },
    { n: mid, deg: base + Math.round(total * split) },
    { n: p1, deg: base + total },
  ];
  const degs = raw.map((r) => ((r.deg % 360) + 360) % 360);
  const center = centerFor(degs);
  const rays = raw.map((r, i) => ({ n: r.n, deg: degs[i], len: fitLen(center, degs[i]) }));
  return {
    id: `G-bisect-${tag}`,
    kind: 'fan',
    vertex: v,
    center,
    rays,
    lines: [],
    rightMarks: [],
    arcs: [],
    dots: false,
    arrows: true,
    labels,
    labelOffsets: { point: letterOffsets(rays), angle: {}, seg: {} },
  };
}

/**
 * Tidiness gate, on top of `lint()`: an expression label that had to slide far out of its wedge
 * reads as floating free of the angle it names, and a fan squeezed into one corner of the viewBox
 * looks nothing like the printed sheet. The shipped figures sit at label radius ≤ 122 (doc-07) and
 * ray length ≥ 122 (F1), so a generated figure outside these bounds is re-rolled.
 */
const MAX_LABEL_R = 124;
const MIN_RAY_LEN = 108;
function figureIsTidy(model) {
  const L = layout(model, {});
  for (const e of L.exprLabels) if (!e.fits || e.r > MAX_LABEL_R) return false;
  if (model.kind === 'fan') for (const r of model.rays) if ((r.len ?? 0) < MIN_RAY_LEN) return false;
  return true;
}

// ---------------------------------------------------------------------------------------------
// attempts
// ---------------------------------------------------------------------------------------------

/** Linear variant: one value of x, one verdict. */
function attemptL(rng) {
  const wantYes = rng.chance(0.5);
  const x0 = rng.int(3, 24);
  const h1 = rng.int(9, 88);
  const gap = wantYes ? 0 : (rng.chance(0.5) ? 1 : -1) * rng.int(4, 34);
  const h2 = h1 + gap;
  if (h2 < 6 || h2 > 120) return null;
  const W = h1 + h2;
  if (W < 24 || W > 176) return null;

  const a1 = rng.int(2, 12);
  const a2 = rng.int(2, 12);
  let a3 = rng.int(2, 14);
  if (a1 + a2 === a3) a3 += 1;                          // the x terms must not cancel
  const b1 = h1 - a1 * x0;
  const b2 = h2 - a2 * x0;
  const b3 = W - a3 * x0;
  if ([b1, b2, b3].some((b) => Math.abs(b) > 70)) return null;

  return { kind: 'L', wantYes, x0, h1, h2, W, a1, b1, a2, b2, a3, b3 };
}

/** Quadratic variant: two integer roots, one case per root, verdicts decided by construction. */
function attemptQ(rng) {
  let r1 = rng.int(-9, 9);
  let r2 = rng.int(-9, 9);
  if (r1 === r2) return null;
  if (r1 < r2) { const t = r1; r1 = r2; r2 = t; }        // r1 > r2 (stable order)
  const combo = rng.pick(['YY', 'YN', 'NY', 'NN']);
  const m = rng.pick([-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6]);

  // D(x) = t(x) − s(x) = x² + (p − m)x + K  decides each case: D(r) = 0 ⇔ that case bisects
  let pm;                                               // p − m
  let K;
  // `lead` is the leading coefficient of the equation h1 + h2 − W = lead·(x − r1)(x − r2).
  // h1 − h2 is always MONIC, so with a linear W (lead = 1) the two polynomials would coincide
  // whenever both cases bisect — i.e. W ≡ 2·h2 and the answer would be "yes for every x".
  // The yes/yes case therefore gives W its own x² term (lead ≠ 1) and stays a real question.
  let lead = 1;
  if (combo === 'YY') { pm = -(r1 + r2); K = r1 * r2; lead = rng.pick([-2, -1, 2, 3, 4]); }
  else if (combo === 'NN') { pm = rng.int(-14, 14); K = rng.int(-90, 90); }
  else {
    pm = rng.int(-14, 14);
    const y = combo === 'YN' ? r1 : r2;
    K = -(y * y) - pm * y;
  }
  const D = (r) => r * r + pm * r + K;
  const want = { [r1]: combo[0] === 'Y' ? 'YES' : 'NO', [r2]: combo[1] === 'Y' ? 'YES' : 'NO' };
  for (const r of [r1, r2]) {
    const d = D(r);
    if (want[r] === 'YES' && d !== 0) return null;
    if (want[r] === 'NO' && Math.abs(d) < 4) return null;
  }

  const p = pm + m;
  if (Math.abs(p) > 20) return null;
  // q so that both t(r) = r² + p·r + q land in a sensible band
  const base = Math.min(r1 * r1 + p * r1, r2 * r2 + p * r2);
  const q = 8 - base + rng.int(0, 40);
  if (Math.abs(q) > 99) return null;
  const n = q - K;
  if (Math.abs(n) > 99) return null;

  const t = { [r1]: r1 * r1 + p * r1 + q, [r2]: r2 * r2 + p * r2 + q };
  const s = { [r1]: m * r1 + n, [r2]: m * r2 + n };
  for (const r of [r1, r2]) {
    if (!(t[r] >= 5 && t[r] <= 150)) return null;
    if (!(s[r] >= 5 && s[r] <= 150)) return null;
    if (t[r] + s[r] > 176) return null;
  }
  // the whole-angle expression W(x) = h1 + h2 − lead·(x − r1)(x − r2)
  const w2 = 1 - lead;
  const wa = p + m + lead * (r1 + r2);
  const wb = q + n - lead * r1 * r2;
  if (Math.abs(w2) > 5 || Math.abs(wa) > 40 || Math.abs(wb) > 199) return null;
  for (const r of [r1, r2]) if (w2 * r * r + wa * r + wb !== t[r] + s[r]) return null;

  return { kind: 'Q', roots: [r1, r2], combo, lead, p, q, m, n, w2, wa, wb, t, s, want };
}

// ---------------------------------------------------------------------------------------------
// figure + self-check wrapper
// ---------------------------------------------------------------------------------------------

function dress(rng, core) {
  const letters = pickLetters(rng, 4);                  // [vertex, outer1, middle, outer2]
  const [v, p1, mid, p2] = letters;
  const base = rng.int(0, 23) * 15;
  const total = rng.int(84, 164);
  // the drawn split never encodes the answer: it is always a little off centre
  const split = 0.5 + (rng.chance(0.5) ? 1 : -1) * (rng.int(6, 16) / 100);
  const scramble = rng.chance(0.35);
  const ord = (n) => (scramble && n > 1 ? rng.shuffle([...Array(n).keys()]) : null);

  let text1;
  let text2;
  let whole;
  let ascii1;
  let ascii2;
  let asciiW;
  if (core.kind === 'L') {
    text1 = linText(core.a1, core.b1, { order: ord(core.b1 ? 2 : 1) });
    text2 = linText(core.a2, core.b2, { order: ord(core.b2 ? 2 : 1) });
    whole = linText(core.a3, core.b3, { order: ord(core.b3 ? 2 : 1) });
    ascii1 = linText(core.a1, core.b1, { ascii: true });
    ascii2 = linText(core.a2, core.b2, { ascii: true });
    asciiW = linText(core.a3, core.b3, { ascii: true });
  } else {
    text1 = quadText(core.p, core.q, { order: ord((core.p ? 1 : 0) + (core.q ? 1 : 0) + 1) });
    text2 = linText(core.m, core.n, { order: ord(core.n ? 2 : 1) });
    const wn = (core.w2 ? 1 : 0) + (core.wa ? 1 : 0) + (core.wb ? 1 : 0);
    whole = poly2Text(core.w2, core.wa, core.wb, { order: ord(wn) });
    ascii1 = quadText(core.p, core.q, { ascii: true });
    ascii2 = linText(core.m, core.n, { ascii: true });
    asciiW = poly2Text(core.w2, core.wa, core.wb, { ascii: true });
  }

  const labels = [
    { angle: [p1, mid], text: text1 },
    { angle: [mid, p2], text: text2 },
  ];
  const tag = `${core.kind}${letters.join('')}${base}${total}${Math.round(split * 100)}`;
  const spec = buildFigure({ letters, base, total, split, labels, tag });
  const figure = { id: spec.id, spec, rename: {}, labels, notToScale: true };

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

  // self-check: re-read the printed strings and confirm the arithmetic the item claims
  const P1 = parsePoly(text1, { var: 'x' });
  const P2 = parsePoly(text2, { var: 'x' });
  const PW = parsePoly(whole, { var: 'x' });
  if (!P1.ok || !P2.ok || !PW.ok) return null;
  const at = (P, r) => polyEvalAt(P.poly, r);
  const roots = core.kind === 'L' ? [core.x0] : core.roots;
  for (const r of roots) {
    const A = at(P1, r);
    const B = at(P2, r);
    const C = at(PW, r);
    if (Math.abs(A + B - C) > 1e-9) return null;
    const half1 = core.kind === 'L' ? core.h1 : core.t[r];
    const half2 = core.kind === 'L' ? core.h2 : core.s[r];
    if (Math.abs(A - half1) > 1e-9 || Math.abs(B - half2) > 1e-9) return null;
    if (!(A > 0 && B > 0 && C > 0 && C < 180)) return null;
    const yes = core.kind === 'L' ? core.wantYes : core.want[r] === 'YES';
    if (yes !== (Math.abs(A - B) < 1e-9)) return null;
    if (!yes && Math.abs(A - B) < 4) return null;
  }

  return { core, letters, v, p1, mid, p2, base, total, split, text1, text2, whole, ascii1, ascii2, asciiW, spec, figure, model };
}

// ---------------------------------------------------------------------------------------------
// item assembly
// ---------------------------------------------------------------------------------------------

const nm = (v, x, y) => angleName(v, x, y);

/** The whole-strip submit a perfect student makes: `{ slotId: value }` (S3 `strip` raw). */
function stripAnswer(slots) {
  const out = {};
  for (const s of slots) {
    if (s.type === 'multi') out[s.id] = Object.fromEntries(s.fields.map((f) => [f.key, f.answer]));
    else if (s.type === 'chips') out[s.id] = s.chips.filter((c) => c.role === 'required').map((c) => c.text);
    else out[s.id] = s.answer;
  }
  return out;
}

function commonFigureBits(d) {
  const { v, p1, mid, p2 } = d;
  return {
    whole: nm(v, p1, p2),
    halfA: nm(v, p1, mid),
    halfB: nm(v, mid, p2),
    idA: angleId(p1, mid),
    idB: angleId(mid, p2),
    ray: `${v}${mid}`,
  };
}

function itemL(d) {
  const c = d.core;
  const { v } = d;
  const F = commonFigureBits(d);
  const correct = `${d.text1} + ${d.text2} = ${d.whole}`;
  const wrongEqual = `${d.text1} = ${d.text2}`;
  const wrong180 = `${d.text1} + ${d.text2} = 180`;
  const yes = c.wantYes;

  const chips = [
    yes
      ? { text: `{ang ${F.halfA}} ≅ {ang ${F.halfB}} (${c.h1}° = ${c.h2}°), so {ray ${F.ray}} bisects {ang ${F.whole}}`, role: 'required' }
      : { text: `{m ${F.halfA}} = ${c.h1}° ≠ ${c.h2}° = {m ${F.halfB}}, so {ray ${F.ray}} does not bisect {ang ${F.whole}}`, role: 'required' },
    { text: `x = ${c.x0}`, role: 'neutral' },
    { text: correct, role: 'neutral' },
    { text: `{ray ${F.ray}} is inside {ang ${F.whole}}`, role: 'neutral' },
    { text: 'the angles add to 180°', role: 'forbidden', why: `{ang ${F.halfA}} and {ang ${F.halfB}} add to {m ${F.whole}} = ${c.W}°, not 180° — and a sum is never what makes a bisector.` },
    { text: `the drawing shows {ray ${F.ray}} in the middle`, role: 'forbidden', why: 'The figure is not to scale — only the measures decide.' },
  ];

  const slotsL = [
      {
        id: 'eq', type: 'pick', label: 'Set up',
        options: [correct, wrongEqual, wrong180],
        answer: correct,
        why: {
          [wrongEqual]: 'That assumes the halves are equal — which is exactly what the question asks you to test. Start from the whole: the two parts add up to its measure.',
          [wrong180]: `Nothing says {ang ${F.whole}} is a straight angle — its measure is given as ${d.whole}, so the two parts add up to that.`,
        },
      },
      { id: 'x', type: 'num', label: 'x =', answer: String(c.x0) },
      {
        id: 'halves', type: 'multi', label: 'the halves',
        fields: [
          { key: F.halfA, label: `m∠${F.halfA}`, answer: String(c.h1), wedge: F.idA },
          { key: F.halfB, label: `m∠${F.halfB}`, answer: String(c.h2), wedge: F.idB },
        ],
      },
      {
        id: 'verdict', type: 'verdict', label: `Does ${F.ray} bisect ∠${F.whole}?`, answer: yes ? 'YES' : 'NO',
        why: yes
          ? { NO: `${c.h1}° = ${c.h2}° — the halves are congruent, so it does.` }
          : { YES: `${c.h1}° and ${c.h2}° are not equal, so it does not.` },
      },
      { id: 'why', type: 'chips', label: 'because', chips },
  ];
  const parts = [{
    id: 'explain', type: 'strip', prompt: 'Work it through, then explain',
    slots: slotsL,
    answer: stripAnswer(slotsL),
    prose: yes
      ? `Since [[eq]], x = [[x]], so {m ${F.halfA}} = [[halves.${F.halfA}]]° = {m ${F.halfB}}; the halves are congruent, so {ray ${F.ray}} bisects {ang ${F.whole}}.`
      : `Since [[eq]], x = [[x]], so {m ${F.halfA}} = [[halves.${F.halfA}]]° and {m ${F.halfB}} = [[halves.${F.halfB}]]°; the halves are not congruent, so {ray ${F.ray}} does not bisect {ang ${F.whole}}.`,
  }];

  return {
    tier: 4,
    par: 300,
    skills: ['BISECT-L'],
    needs: [],
    forCards: ['doc-05'],
    params: { verdict: yes ? 'YES' : 'NO', x: c.x0, halves: [c.h1, c.h2], whole: c.W, letters: d.letters, labels: [d.ascii1, d.ascii2, d.asciiW] },
    stem: `If {m ${F.whole}} = ${d.whole}, does {ray ${F.ray}} bisect {ang ${F.whole}}? Show work and explain why or why not.`,
    prompt: `If {m ${F.whole}} = ${d.whole}, does {ray ${F.ray}} bisect {ang ${F.whole}}? Show work and explain why or why not.`,
    figure: d.figure,
    parts,
    answer: `x = ${c.x0}   \u00b7   ${c.h1}\u00b0 ${yes ? '=' : '\u2260'} ${c.h2}\u00b0   \u00b7   ${yes ? 'YES, it bisects' : 'NO, it does not bisect'}`,
    answerData: { x: String(c.x0), halves: [String(c.h1), String(c.h2)], verdict: yes ? 'YES' : 'NO' },
    hints: [
      `Ray ${F.ray} is inside {ang ${F.whole}}, so the two small angles add up to the whole one (angle addition). Whether it bisects is a separate question: the two halves have to come out EQUAL.`,
      `Add the two parts and set the sum equal to the whole: (${d.text1}) + (${d.text2}) = ${d.whole}.`,
      `Solve for x, then substitute it into ${d.text1} and into ${d.text2} and compare the two numbers — equal means it bisects, unequal means it does not.`,
    ],
    solution: [
      { say: `${F.ray} lies inside {ang ${F.whole}}, so the parts add to the whole (angle addition).`, math: `(${d.text1}) + (${d.text2}) = ${d.whole}` },
      { say: 'Combine like terms and solve for x.', math: `x = ${c.x0}` },
      { say: 'Substitute into both halves.', math: `{m ${F.halfA}} = ${c.h1},   {m ${F.halfB}} = ${c.h2}` },
      yes
        ? { say: `The halves are equal, so {ang ${F.halfA}} ≅ {ang ${F.halfB}} — that is the definition of a bisector. (Check the whole: ${c.h1} + ${c.h2} = ${c.W} ✓)`, math: `{ray ${F.ray}} bisects {ang ${F.whole}}:  YES` }
        : { say: `The halves are not equal (${c.h1} ≠ ${c.h2}), so the ray is not a bisector — even though the parts still add to the whole (${c.h1} + ${c.h2} = ${c.W} ✓).`, math: `{ray ${F.ray}} does not bisect {ang ${F.whole}}:  NO` },
    ],
    misconceptions: [
      { part: 'explain', answer: wrongEqual, tag: 'assumed-bisects', msg: 'Setting the halves equal assumes the answer. Find x from the whole angle first, then check whether the halves come out equal.' },
      { part: 'explain', answer: wrong180, tag: 'linear-pair-set-equal', msg: `Those two angles are not a linear pair — nothing says {ang ${F.whole}} is straight. Their sum is its measure, ${d.whole}.` },
      { part: 'explain', answer: String(-c.x0), tag: 'sign-flip', msg: `Check the sign when the x terms move across: x = ${c.x0}.` },
      { part: 'explain', answer: 'the angles add to 180°', tag: 'forbidden-reason', msg: `A sum of 180° is about linear pairs, not bisectors. What decides it here is ${c.h1}° ${yes ? '=' : '≠'} ${c.h2}°.` },
    ],
  };
}

function itemQ(d) {
  const c = d.core;
  const { v } = d;
  const F = commonFigureBits(d);
  const [r1, r2] = c.roots;
  const caseOf = (r) => ({ r, t: c.t[r], s: c.s[r], yes: c.want[r] === 'YES', whole: c.t[r] + c.s[r] });
  const cs = [caseOf(r1), caseOf(r2)];

  const chipsFor = (cc, id) => ({
    id, type: 'chips', label: `Case x = ${showNum(cc.r)}`,
    chips: [
      cc.yes
        ? { text: `{m ${F.halfA}} = ${cc.t}° = {m ${F.halfB}}, so {ray ${F.ray}} bisects {ang ${F.whole}}`, role: 'required' }
        : { text: `{m ${F.halfA}} = ${cc.t}° ≠ ${cc.s}° = {m ${F.halfB}}, so {ray ${F.ray}} does not bisect {ang ${F.whole}}`, role: 'required' },
      { text: `x = ${showNum(cc.r)}`, role: 'neutral' },
      { text: `{m ${F.whole}} = ${cc.whole}°`, role: 'neutral' },
      cc.yes
        ? { text: `${cc.t} + ${cc.s} = 180, so {ray ${F.ray}} bisects`, role: 'forbidden', why: `${cc.t} + ${cc.s} = ${cc.whole} = {m ${F.whole}}, not 180 — and a sum is never the test. Bisecting means the two halves are EQUAL.` }
        : { text: `${cc.t} + ${cc.s} = ${cc.whole} = {m ${F.whole}}, so {ray ${F.ray}} bisects`, role: 'forbidden', why: `Adding up to the whole angle is true of ANY ray inside it — that is how the equation was set up. Bisecting needs ${cc.t} = ${cc.s}, which is false.` },
      cc.r < 0
        ? { text: 'x is negative, so this case is impossible', role: 'forbidden', why: `A negative x is fine as long as the measures come out positive: here they are ${cc.t}° and ${cc.s}°. Substitute before you reject.` }
        : { text: `the drawing shows {ray ${F.ray}} in the middle`, role: 'forbidden', why: 'The figure is not to scale — only the substituted measures decide.' },
    ],
  });

  const yesRoots = cs.filter((k) => k.yes).map((k) => k.r);
  const conclusion = yesRoots.length === 2
    ? `{ray ${F.ray}} bisects {ang ${F.whole}} for both values of x`
    : yesRoots.length === 0
      ? `{ray ${F.ray}} never bisects {ang ${F.whole}} — neither root gives equal halves`
      : `bisects only when x = ${showNum(yesRoots[0])} — both cases stated`;
  const options = [
    `{ray ${F.ray}} bisects {ang ${F.whole}} for both values of x`,
    `{ray ${F.ray}} never bisects {ang ${F.whole}} — neither root gives equal halves`,
    `bisects only when x = ${showNum(r1)} — both cases stated`,
    `bisects only when x = ${showNum(r2)} — both cases stated`,
  ];
  const why = {};
  for (const o of options) {
    if (o === conclusion) continue;
    why[o] = `Substitute each root: x = ${showNum(r1)} gives ${cs[0].t}° and ${cs[0].s}° (${cs[0].yes ? 'equal' : 'not equal'}), x = ${showNum(r2)} gives ${cs[1].t}° and ${cs[1].s}° (${cs[1].yes ? 'equal' : 'not equal'}).`;
  }

  const mustNum = Math.abs(c.wb) || Math.abs(c.q) || Math.abs(c.n);
  const parts = [
    {
      id: 'setup', type: 'equation', optional: true,
      prompt: 'Write the angle-addition equation (skippable — graded when tried)',
      canonical: `(${d.ascii1})+(${d.ascii2})-(${d.asciiW})`, var: 'x',
      mustMention: mustNum ? [mustNum] : [],
    },
    { id: 'x', type: 'roots', var: 'x', label: 'x =', answer: c.roots.map(String), mustMention: null },
    {
      id: 'cases', type: 'cases', of: 'x', prompt: 'One case per root',
      cols: [
        { key: 'x', label: 'x' },
        { key: F.halfA, label: `m∠${F.halfA}`, wedge: F.idA },
        { key: F.halfB, label: `m∠${F.halfB}`, wedge: F.idB },
        { key: 'verdict', label: 'bisects?', type: 'verdict' },
      ],
      rows: cs.map((k) => ({ x: String(k.r), [F.halfA]: String(k.t), [F.halfB]: String(k.s), verdict: k.yes ? 'YES' : 'NO' })),
    },
    (() => {
      const slots = [
        chipsFor(cs[0], 'c1'),
        chipsFor(cs[1], 'c2'),
        { id: 'end', type: 'pick', label: 'Conclusion', options, answer: conclusion, why },
      ];
      return {
        id: 'explain', type: 'strip', prompt: 'Explain both cases',
        slots,
        answer: stripAnswer(slots),
        prose: `Case x = ${showNum(r1)}: [[c1]]. Case x = ${showNum(r2)}: [[c2]]. So [[end]].`,
      };
    })(),
  ];

  return {
    tier: 4,
    par: 300,
    skills: ['BISECT-Q', 'QUAD-SOLVE'],
    needs: ['QUAD-SOLVE'],
    forCards: ['ang-05'],
    params: {
      roots: c.roots, combo: c.combo, letters: d.letters,
      halves: cs.map((k) => [k.t, k.s]), labels: [d.ascii1, d.ascii2, d.asciiW],
    },
    stem: `{m ${F.whole}} = ${d.whole}. Does {ray ${F.ray}} bisect {ang ${F.whole}}? Explain why or why not.`,
    prompt: `{m ${F.whole}} = ${d.whole}. Does {ray ${F.ray}} bisect {ang ${F.whole}}? Explain why or why not.`,
    figure: d.figure,
    parts,
    answer: cs.map((k) => `x = ${showNum(k.r)}: ${k.t}\u00b0 ${k.yes ? '=' : '\u2260'} ${k.s}\u00b0 \u2192 ${k.yes ? 'YES' : 'NO'}`).join('   \u00b7   '),
    answerData: { x: c.roots.map(String), cases: cs.map((k) => ({ x: String(k.r), [F.halfA]: String(k.t), [F.halfB]: String(k.s), verdict: k.yes ? 'YES' : 'NO' })) },
    hints: [
      `Ray ${F.ray} lies inside {ang ${F.whole}}, so the two small angles add up to the whole one: {m ${F.halfA}} + {m ${F.halfB}} = {m ${F.whole}}. Bisecting is a separate question — it needs the two halves to be EQUAL, and you check that after finding x.`,
      `(${d.text1}) + (${d.text2}) = ${d.whole}. Move everything to one side and factor the quadratic.`,
      `The two roots are two separate cases. Substitute EACH one into ${d.text1} and ${d.text2} and compare the halves — the answer has to state both cases.`,
    ],
    solution: [
      { say: `${F.ray} is inside {ang ${F.whole}}, so the parts add to the whole (angle addition).`, math: `(${d.text1}) + (${d.text2}) = ${d.whole}` },
      { say: 'Collect every term on one side and factor.', math: `x = ${showNum(r1)}  or  x = ${showNum(r2)}` },
      { say: `Case x = ${showNum(r1)}: substitute into both halves.`, math: `{m ${F.halfA}} = ${cs[0].t},   {m ${F.halfB}} = ${cs[0].s}` },
      { say: cs[0].yes ? 'Equal halves — in this case the ray does bisect.' : 'Unequal halves — in this case the ray does not bisect.', math: `x = ${showNum(r1)}: ${cs[0].yes ? 'YES' : 'NO'}   (whole: ${cs[0].whole} ✓)` },
      { say: `Case x = ${showNum(r2)}: substitute again.`, math: `{m ${F.halfA}} = ${cs[1].t},   {m ${F.halfB}} = ${cs[1].s}` },
      { say: cs[1].yes ? 'Equal halves — this case bisects.' : 'Unequal halves — this case does not bisect.', math: `x = ${showNum(r2)}: ${cs[1].yes ? 'YES' : 'NO'}   (whole: ${cs[1].whole} ✓)` },
      { say: 'Both roots give positive measures, so both cases are real and both have to be stated.', math: conclusion.replace(/\{ray ([^}]+)\}/g, '$1').replace(/\{ang ([^}]+)\}/g, '∠$1') },
    ],
    misconceptions: [
      { part: 'x', answer: String(r1), tag: 'forgot-second-root', msg: 'The quadratic has two roots — set each factor to 0.' },
      { part: 'x', answer: String(r2), tag: 'forgot-second-root', msg: 'The quadratic has two roots — set each factor to 0.' },
      { part: 'cases', answer: String(r1), tag: 'missing-case', msg: 'Two roots means two cases — the other root has to be worked and stated too, whatever its answer turns out to be.' },
      ...(c.combo === 'YY' ? [] : [{ part: 'setup', answer: `(${d.ascii1})-(${d.ascii2})`, tag: 'assumed-bisects', msg: 'Setting the halves equal assumes the answer. Start from angle addition, then compare the halves for each root.' }]),
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// exemplar + entry points
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

function build(rng, quadratic) {
  const core = quadratic ? attemptQ(rng) : attemptL(rng);
  if (!core) return null;
  const d = dress(rng, core);
  if (!d) return null;
  const item = quadratic ? itemQ(d) : itemL(d);
  for (const p of item.parts) {
    if (p.type === 'strip' && validateStrip(p).length) return null;
  }
  return item;
}

const EXEMPLAR = {};
function exemplarDraft(quadratic) {
  const key = quadratic ? 'Q' : 'L';
  if (EXEMPLAR[key]) return EXEMPLAR[key];
  const rng = fixedRng(quadratic ? 0x0b15ec7 : 0x0b15ec1);
  for (let i = 0; i < 6000; i++) {
    const draft = build(rng, quadratic);
    if (draft) { EXEMPLAR[key] = draft; return draft; }
  }
  throw new Error('figbisect: no exemplar could be built');
}

/** The contract's per-template check: the emitted figure and strip must still be clean. */
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
  for (const p of item.parts ?? []) if (p.type === 'strip') for (const q of validateStrip(p)) out.push(`strip: ${q}`);
  return out;
}

/** One draw for the contract's re-roll loop. */
export function drawBisectL(rng) { return build(rng, false); }
export function drawBisectQ(rng) { return build(rng, true); }

const SHARED = { version: TEMPLATE_VERSION, module: 'M7', requireDistractors: false, verify: verifyFigure };

/** `T-fig-bisect-L` — linear halves, one value of x, the doc-05 Proof Strip. */
export const genBisectL = makeGen('T-fig-bisect-L', drawBisectL, {
  ...SHARED, skills: ['BISECT-L'], tier: 4, par: 300, sheet: 'DOC', exemplar: () => exemplarDraft(false),
});

/** `T-fig-bisect-Q` — a quadratic half, two integer roots, one case per root (ang-05). */
export const genBisectQ = makeGen('T-fig-bisect-Q', drawBisectQ, {
  ...SHARED, skills: ['BISECT-Q', 'QUAD-SOLVE'], tier: 4, par: 300, sheet: 'AP-2', exemplar: () => exemplarDraft(true),
});

export default { genBisectL, genBisectQ, TEMPLATE_VERSION };
