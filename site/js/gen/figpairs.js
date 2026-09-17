// figpairs.js — T07b. Generator `T-fig-pairs` (COMPOSED S2 "§7 diagram variants" +
// S8 #4/#7b: the `ang-wu-1..5` warm-up form).
//
//   Two lines through one point, plus 0 or 1 extra ray (sometimes marked
//   perpendicular). The student names pairs of angles with a given relation by
//   tapping wedges, picking from the side list, or typing `∠GFC` — everything the
//   T04 `pairs` grader accepts.
//
// S2 invariants: the generic angles come from {23, 29, 41, 47, 71, 79} (+ 90 for the
// perpendicular ray) — no two of them sum to 90 or 180, so the only complementary /
// supplementary pairs in a generated fan are the structural ones. Every candidate is
// put through `accidentalSums()` (the enumeration gate) and rejected if the drawing
// produces a 90° or 180° sum that the structure does not justify; letters are shuffled
// with I and O never used; the fan is rotated in 15° steps and optionally mirrored.
//
// Contract: `gen(rng) → item`, deterministic, self-checked (the emitted answer pairs
// are re-derived from the model with `pairs()` and every one is re-verified with
// `isPair()`), max 200 attempts then a fixed exemplar; figures gated on `validate()` +
// `lint()` at 343 px so every wedge stays a 44 px touch target. See notes/T07b.md.

import {
  angleName, resolve, validate, angles, pairs as validPairs, isPair,
  accidentalSums, accidentalSumsInSet, GENERIC_ANGLE_SET,
} from '../figure/model.js';
import { lint, layout, VIEW } from '../figure/svg.js';
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

function fitLen(center, deg, inset = 30, cap = 176) {
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
    Math.round(clamp(200 - (sx / n) * 60, 124, 276)),
    Math.round(clamp(150 - (sy / n) * 50, 78, 210)),
  ];
}

/** Point letters off their own ray (svg.js's default would put them on the stroke). */
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
// what can be asked
// ---------------------------------------------------------------------------------------------

/** the S2 angle set; `GENERIC_ANGLE_SET` from T04 is the same list (kept in sync by a test). */
const SET = GENERIC_ANGLE_SET.slice();

const ASKS = [
  { relation: 'supplementary', count: 3, phrase: '3 pairs of supplementary angles', needsRight: false },
  { relation: 'supplementary', count: 2, phrase: '2 pairs of supplementary angles', needsRight: false },
  { relation: 'linearPair', count: 2, phrase: '2 linear pairs', needsRight: false },
  { relation: 'vertical', count: 1, phrase: '1 pair of vertical angles', needsRight: false },
  { relation: 'vertical', count: 2, phrase: '2 pairs of vertical angles', needsRight: false },
  { relation: 'adjacent', count: 3, phrase: '3 pairs of adjacent angles', needsRight: false },
  { relation: 'nonAdjacent', count: 2, phrase: '2 non-examples of adjacent angles', needsRight: false },
  { relation: 'complementary', count: 1, phrase: '1 pair of complementary angles', needsRight: true },
];

const RELATION_WORD = {
  supplementary: 'supplementary',
  linearPair: 'a linear pair',
  vertical: 'vertical',
  adjacent: 'adjacent',
  nonAdjacent: 'not adjacent',
  complementary: 'complementary',
};

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
// one attempt
// ---------------------------------------------------------------------------------------------

function attempt(rng) {
  const ask = rng.pick(ASKS);
  // 'perp' is the F1 shape (two lines + a perpendicular ray) — the only one with complementary pairs
  const shape = ask.needsRight ? 'perp' : rng.pick(['lines', 'perp', 'ray', 'ray']);
  const rot = rng.int(0, 23) * 15;
  const mirror = rng.chance(0.5);

  /** @type {{n:string, deg:number, free?:boolean}[]} */
  let base;
  let rightPair = null;
  let letters;
  if (shape === 'lines') {
    // one independent measure; its 180° partner is structural, so only g itself is pre-checked
    const g = rng.pick(SET);
    if (accidentalSumsInSet([g]).length) return null;
    letters = pickLetters(rng, 5);                       // [v, d, c, a, e]
    const [, d, c, a, e] = letters;
    base = [{ n: d, deg: 0 }, { n: c, deg: g, free: true }, { n: a, deg: 180 }, { n: e, deg: 180 + g }];
  } else if (shape === 'perp') {
    const g = rng.pick(SET.filter((x) => x < 90 && 90 - x >= 22));
    if (g === undefined) return null;
    letters = pickLetters(rng, 6);                       // [v, d, c, a, e, b]
    const [, d, c, a, e, b] = letters;
    base = [
      { n: d, deg: 0 }, { n: c, deg: g, free: true }, { n: b, deg: 90 },
      { n: a, deg: 180 }, { n: e, deg: 180 + g },
    ];
    rightPair = rng.chance(0.5) ? [b, a] : [b, d];
  } else {
    // three independent atomic pieces around the extra ray; their 180° partners are structural
    const g1 = rng.pick(SET);
    const g2 = rng.pick(SET);
    const g3 = 180 - g1 - g2;
    if (g3 < 22 || g2 < 22) return null;
    if (accidentalSumsInSet([g1, g2, g3]).length) return null;
    letters = pickLetters(rng, 6);                       // [v, d, c, a, e, b]
    const [, d, c, a, e, b] = letters;
    base = [
      { n: d, deg: 0 }, { n: c, deg: g1, free: true }, { n: b, deg: g1 + g2 },
      { n: a, deg: 180 }, { n: e, deg: 180 + g1 },
    ];
  }

  const v = letters[0];
  const [, d, c, a, e] = letters;
  const place = (deg) => {
    let x = mirror ? 180 - deg : deg;
    x = ((x + rot) % 360 + 360) % 360;
    return x;
  };
  const degs = base.map((r) => place(r.deg));
  const center = centerFor(degs);
  const rays = base.map((r, i) => ({
    n: r.n, deg: degs[i], len: fitLen(center, degs[i]), ...(r.free ? { free: true } : {}),
  }));

  const spec = {
    id: `G-pairs-${shape}${rot}${mirror ? 'm' : ''}${letters.join('')}`,
    kind: 'fan',
    vertex: v,
    center,
    rays,
    lines: [[a, d], [e, c]],
    rightMarks: rightPair ? [rightPair] : [],
    arcs: [],
    dots: true,
    arrows: true,
    labels: [],
    labelOffsets: { point: letterOffsets(rays), angle: {}, seg: {} },
  };
  const figure = { id: spec.id, spec, rename: {}, labels: [], notToScale: false };

  let model;
  try {
    model = resolve(spec, figure);
  } catch {
    return null;
  }
  if (validate(model).length) return null;
  // the enumeration gate: no 90°/180° sum that the structure does not justify
  if (accidentalSums(model).length) return null;
  if (lint(model, { widthPx: 343 }).length) return null;
  if (!figureIsTidy(model)) return null;

  const all = validPairs(model, ask.relation);
  if (all.length < ask.count) return null;
  // every emitted pair is re-verified through the grader's own predicate
  for (const [x, y] of all) if (!isPair(model, x, y, ask.relation)) return null;

  const extraRay = shape === 'lines' ? null : base.find((r) => ![a, d, e, c].includes(r.n)).n;
  return { ask, shape, rot, mirror, letters, v, d, c, a, e, extraRay, rightPair, spec, figure, model, all };
}

// ---------------------------------------------------------------------------------------------
// item assembly
// ---------------------------------------------------------------------------------------------

function itemFrom(g) {
  const { model, ask, v, a, d, e, c } = g;
  const list = angles(model);
  const byKey = new Map(list.map((x) => [x.key, x]));
  const answer = g.all.slice(0, ask.count).map(([x, y]) => [x, y]);
  const degOf = (k) => byKey.get(k)?.deg ?? null;

  const lineText = `{line ${e}${c}} and {line ${a}${d}}`;
  const rayText = g.extraRay ? `, ray ${v}${g.extraRay}` : '';
  const rightText = g.rightPair ? ` (the square marks {ang ${angleName(v, g.rightPair[0], g.rightPair[1])}} as a right angle)` : '';
  const stem = `Given the following diagram, where Point ${v} is on ${lineText}${rayText}${rightText}, identify: ${ask.phrase}`;

  const example = answer[0];
  const exDeg = example.map((k) => degOf(k));
  const rel = ask.relation;

  const hintBank = {
    supplementary: [
      'Supplementary means the two measures add to 180°. In a figure that happens when two adjacent angles together make a straight line.',
      `Two lines cross at ${v}, so ${v} is on line ${a}${d} and on line ${e}${c}. Any two angles that share a ray and together fill one of those lines are a linear pair — and every linear pair is supplementary.`,
      `Start from one ray: on one side of it is one angle, on the other side another, and the two outer sides make a straight line. There are ${g.all.length} such pairs here — you need ${ask.count}.`,
    ],
    linearPair: [
      'A linear pair is two ADJACENT angles whose outer sides are opposite rays — together they make a straight line.',
      `Pick any ray from ${v} and any line through ${v} that the ray is not part of: the ray splits that straight angle into a linear pair.`,
      `There are ${g.all.length} linear pairs in this figure — ${ask.count} are enough. (Every one of them is also a supplementary pair.)`,
    ],
    vertical: [
      'Vertical angles are the two angles directly across the vertex from each other — both of their rays are opposite rays.',
      `Lines ${a}${d} and ${e}${c} cross at ${v}, so each angle in one "corner" has a twin in the opposite corner.`,
      `Follow both rays of an angle straight through ${v} — the angle you land on is its vertical partner (${g.all.length} such pairs here).`,
    ],
    adjacent: [
      'Adjacent angles share the vertex and exactly one ray, and their interiors do not overlap.',
      'Two angles that just happen to share the vertex are NOT adjacent unless they also share a side.',
      `Take two angles that sit side by side against the same ray — there are ${g.all.length} adjacent pairs here.`,
    ],
    nonAdjacent: [
      'A non-example of adjacent angles is two angles that do NOT share a side (or whose interiors overlap), even though they share the vertex.',
      'Vertical angles are the classic non-example: same vertex, no shared ray.',
      `Any two angles across the vertex from each other will do — ${g.all.length} pairs in this figure are not adjacent.`,
    ],
    complementary: [
      'Complementary means the two measures add to 90°.',
      `The square at ${v} marks a right angle. A ray through the inside of that right angle cuts it into two pieces.`,
      'Those two pieces add to 90°, so they are complementary — and so is any pair congruent to them across the vertex.',
    ],
  };

  const solution = [
    { say: `The relation asked for is ${RELATION_WORD[rel]}.`, math: `${ask.phrase}` },
    {
      say: rel === 'complementary'
        ? `The right angle at ${v} is split by a ray, so the two pieces add to 90°.`
        : rel === 'vertical' || rel === 'nonAdjacent'
          ? `Each pair below sits across the vertex ${v}; both rays of one are the opposite rays of the other.`
          : `Each pair below shares a ray, and the other two rays are opposite — a straight line.`,
      math: answer.map(([x, y]) => `{ang ${x}} + {ang ${y}}`).join('   ·   '),
    },
    {
      say: exDeg.every((n) => n != null)
        ? `Check with the drawn measures: ${exDeg[0]}° and ${exDeg[1]}°${rel === 'supplementary' || rel === 'linearPair' ? ` add to ${exDeg[0] + exDeg[1]}°` : rel === 'complementary' ? ` add to ${exDeg[0] + exDeg[1]}°` : ' are congruent'}.`
        : 'Check each pair against the figure.',
      math: `{m ${example[0]}} = ${exDeg[0]}°,   {m ${example[1]}} = ${exDeg[1]}°`,
    },
    { say: `Any ${ask.count} of the ${g.all.length} valid pairs answer the question.`, math: `${g.all.length} valid · ${ask.count} needed` },
  ];

  // one plausible wrong pair, named with its own relation, for the misconception bank
  const misconceptions = [];
  const wrongFor = (bad, tag, msg) => { if (bad) misconceptions.push({ part: 'pairs', answer: `${bad[0]} + ${bad[1]}`, tag, msg }); };
  if (rel === 'supplementary' || rel === 'linearPair') {
    const vert = validPairs(model, 'vertical')[0];
    wrongFor(vert, 'confused-vertical-linear', 'Those two are vertical angles — congruent, not supplementary. A supplementary pair fills a straight line.');
  } else if (rel === 'vertical') {
    const lp = validPairs(model, 'linearPair')[0];
    wrongFor(lp, 'confused-vertical-linear', 'Those two are a linear pair — side by side on a line, not across the vertex from each other.');
  } else if (rel === 'complementary') {
    const lp = validPairs(model, 'linearPair')[0];
    wrongFor(lp, 'confused-comp-supp', 'That pair adds to 180°, not 90° — supplementary, not complementary.');
  } else if (rel === 'adjacent') {
    const na = validPairs(model, 'nonAdjacent')[0];
    wrongFor(na, 'not-adjacent', 'Those two share the vertex but no side — adjacent angles must share a ray.');
  } else {
    const adj = validPairs(model, 'adjacent')[0];
    wrongFor(adj, 'adjacent-as-nonexample', 'Those two DO share a ray with no overlap — they are adjacent, so they are not a non-example.');
  }

  return {
    tier: 2,
    par: 90,
    skills: ['PAIRS'],
    needs: [],
    forCards: ['ang-wu-1', 'ang-wu-2', 'ang-wu-3', 'ang-wu-4', 'ang-wu-5'],
    params: {
      relation: ask.relation, count: ask.count, shape: g.shape, rotate: g.rot, mirror: g.mirror,
      letters: g.letters, measures: Object.fromEntries(list.map((x) => [x.key, x.deg])),
      valid: g.all.length,
    },
    stem,
    prompt: stem,
    figure: g.figure,
    parts: [{
      id: 'pairs', type: 'pairs', relation: ask.relation, count: ask.count,
      // the grader finds the figure on ctx.model / ctx.figure / part.figure — carrying the spec
      // here means a Variant grades with no extra wiring from the widget or a test harness
      figure: g.spec,
      prompt: `Pick ${ask.count} ${ask.count === 1 ? 'pair' : 'pairs'} — tap two angles in the figure, choose from the list, or type a name like ∠${answer[0][0]}.`,
      answer,
      allValid: g.all,
    }],
    answer: answer.map(([x, y]) => `\u2220${x} + \u2220${y}`).join('   \u00b7   '),
    answerData: answer,
    hints: hintBank[rel],
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
  const rng = fixedRng(0x9a12c3);
  for (let i = 0; i < 6000; i++) {
    const g = attempt(rng);
    if (g) { EXEMPLAR = itemFrom(g); return EXEMPLAR; }
  }
  throw new Error('figpairs: no exemplar could be built');
}

/** The contract's per-template check: the fan must still pass the enumeration gate. */
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
  const part = (item.parts ?? [])[0];
  if (part && part.type === 'pairs') {
    for (const [x, y] of part.answer ?? []) {
      if (!isPair(model, x, y, part.relation)) out.push(`pairs: ${x} + ${y} is not ${part.relation}`);
    }
  }
  return out;
}

/** One draw for the contract's re-roll loop. */
export function drawFigPairs(rng) {
  const g = attempt(rng);
  return g ? itemFrom(g) : null;
}

/** `T-fig-pairs` — the ang-wu-* "identify N pairs of …" warm-up, on a generated fan. */
export const genFigPairs = makeGen('T-fig-pairs', drawFigPairs, {
  version: TEMPLATE_VERSION, skills: ['PAIRS'], tier: 2, par: 90,
  module: 'M2', sheet: 'AP-1', requireDistractors: false, verify: verifyFigure,
  exemplar: () => exemplarDraft(),
});

export default { genFigPairs, TEMPLATE_VERSION };
