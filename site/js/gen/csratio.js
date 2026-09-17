// csratio.js — `T-cs-ratio` (COMPOSED S2: M4 Ratio room, skill CS-RATIO; S8 #7a).
//
// The three ratio shapes S2 names, each the teacher's own sentence with the numbers swapped:
//
//   A "parts"      Two supplementary/complementary angles are in a ratio of p:q.        ang-07 · wp-05
//                  p + q ∈ {3,4,5,6,9,10,12,15,18,20,30,36} and divides the total, so every part is whole.
//   B "supp:comp"  The ratio of the supplement of an angle to its complement is p:q.    ang-08 · wp-11
//                  x = (180q − 90p)/(q − p) must be a whole number inside (0, 90) — which forces p > 2q.
//   C "angle:supp" The ratio of an angle to its supplement is p:q; give angle : complement, reduced.  wp-10
//
// Every item carries the S3 `equation` slot. The primary canonical is the "parts" equation a student
// actually writes (`5x + 7x = 180`, x = one part) or the colon form the sentence states; the alternates
// cover the other namings (x = the larger angle, x = the complement) and are each re-solved with poly.js
// before they are emitted, so an accepted alternate is always genuinely equivalent.
//
// tags:['used-90-for-supp','used-180-for-comp','confused-comp-supp','ratio-as-measure','reversed-ratio','stopped-early','gave-larger']

import {
  makeGen, fmt, deg, comp, supp, isMeasure, isAcute, isHalf, gcdInt, reduceRatio, solveEmitted,
} from './contract.js';

export const TEMPLATE = 'T-cs-ratio';
export const VERSION = 1;

/** S2: the part totals that divide 180 (and, filtered below, 90) */
export const PART_SUMS = [3, 4, 5, 6, 9, 10, 12, 15, 18, 20, 30, 36];

const FORM_WEIGHTS = { parts: 45, 'supp-comp': 35, 'angle-supp': 20 };

/** a coefficient as a student writes it: 1 disappears ("x + 5x", not "1x + 5x") */
const cx = (n) => (n === 1 ? '' : fmt(n));
/** n times a parenthesised phrase, with 1 written as nothing */
const mul = (n, expr) => (n === 1 ? expr.replace(/^\((.*)\)$/, '$1') : `${fmt(n)}${expr}`);

// ---------------------------------------------------------------------------
// shared pieces
// ---------------------------------------------------------------------------

/** the equation part every ratio item carries */
function setupPart({ canonical, text, roots, mustMention, alternates, means }) {
  return {
    id: 'setup', type: 'equation', optional: true,
    label: 'Set up the equation',
    prompt: 'Set up the equation (skippable on a card, required in a boss)',
    // `misconceptions` is added by buildItem only when there is a trap — an empty array on a part
    // shadows the item-level list inside the graders (num.js `misconceptionsOf`).
    var: 'x', canonical, text, roots: roots.map(fmt), mustMention, alternates, means,
  };
}

/** an alternate naming of x, kept only when poly.js agrees it solves to the root we claim */
function alternate(canonical, text, root, means, mustMention) {
  if (!Number.isFinite(root)) return null;
  const got = solveEmitted(canonical, 'x');
  if (!got || got.length !== 1 || Math.abs(got[0] - root) > 1e-9) return null;
  return { canonical, text, roots: [fmt(root)], means, mustMention };
}

/** a `num` answer part with the S3 chain + every named intermediate */
function numPart({ label, value, asks, values, names }) {
  const distractors = {};
  for (const n of names) {
    const v = values[n];
    if (v === undefined || !isMeasure(v) || !isHalf(v)) continue;
    if (Math.abs(v - value) < 1e-9) continue;
    distractors[n] = fmt(v);
  }
  return { id: 'answer', type: 'num', label, answer: fmt(value), asks, distractors };
}

// ---------------------------------------------------------------------------
// A — two angles in a ratio of p : q
// ---------------------------------------------------------------------------

const PARTS_ASKS_SUPP = ['pair', 'larger', 'smaller', 'comp-of-smaller'];
const PARTS_ASKS_COMP = ['pair', 'larger', 'smaller', 'supp-of-smaller', 'supp-of-larger'];

function drawParts(rng) {
  const total = rng.chance(0.62) ? 180 : 90;
  const sums = PART_SUMS.filter((s) => total % s === 0 && s >= 3);
  const S = rng.pick(sums);
  const p = rng.int(1, S - 1);
  const q = S - p;
  if (gcdInt(p, q) !== 1 || p === q) return null;
  const hi = Math.max(p, q);
  const lo = Math.min(p, q);
  if (hi / lo > 12) return null;
  const unit = total / S;
  const first = p * unit;
  const second = q * unit;
  const smaller = Math.min(first, second);
  const larger = Math.max(first, second);
  if (!isMeasure(first) || !isMeasure(second) || !isHalf(unit)) return null;
  if (smaller < (total === 180 ? 10 : 5)) return null;

  const word = total === 180 ? 'supplementary' : 'complementary';
  const statement = rng.chance(0.5)
    ? `Two ${word} angles are in a ratio of ${p}:${q}.`
    : `Two ${word} angles are in the ratio ${p}:${q}.`;

  const canonical = `${p}x+${q}x-${total}`;
  const text = `${cx(p)}x + ${cx(q)}x = ${total}`;
  const alternates = [
    alternate(`x/(${total}-x)-${p}/${q}`, `x/(${total} − x) = ${p}/${q}`, first, 'x = the first angle of the ratio', [total]),
    alternate(`x/(${total}-x)-${q}/${p}`, `x/(${total} − x) = ${q}/${p}`, second, 'x = the second angle of the ratio', [total]),
  ].filter(Boolean);

  return {
    form: 'parts', total, p, q, unit, first, second, smaller, larger, statement,
    values: { smaller, larger },
    asks: total === 180 ? PARTS_ASKS_SUPP : PARTS_ASKS_COMP,
    setup: setupPart({
      canonical, text, roots: [unit], mustMention: [total], alternates,
      means: 'x = one part of the ratio',
    }),
    trap: {
      canonical: `${p}x+${q}x-${total === 180 ? 90 : 180}`,
      text: `${cx(p)}x + ${cx(q)}x = ${total === 180 ? 90 : 180}`,
      tag: total === 180 ? 'used-90-for-supp' : 'used-180-for-comp',
      msg: total === 180
        ? 'Supplementary angles add to 180, so the parts add to 180.'
        : 'Complementary angles add to 90, so the parts add to 90.',
    },
    hints: [
      `${total === 180 ? 'Supplementary' : 'Complementary'} angles add to ${total}. A ratio of ${p}:${q} means ${p} parts and ${q} parts — ${p + q} parts in all.`,
      `Set up: ${text}. (Or write x/(${total} − x) = ${p}/${q} with x the first angle.)`,
      `${p + q} parts make ${total}, so one part is ${total} ÷ ${p + q}. The two angles are ${p} parts and ${q} parts.`,
    ],
    steps: [
      { say: 'A ratio of parts', math: text },
      { say: 'Collect the parts', math: `${cx(p + q)}x = ${total}` },
      { say: 'One part', math: `x = ${fmt(unit)}` },
      { say: 'The two angles', math: `${p} × ${fmt(unit)} = ${fmt(first)}  and  ${q} × ${fmt(unit)} = ${fmt(second)}` },
    ],
  };
}

// ---------------------------------------------------------------------------
// B — the ratio of the supplement to the complement is p : q
// ---------------------------------------------------------------------------

const SUPP_COMP_ASKS = ['angle', 'comp', 'supp', 'supp-of-comp'];

function drawSuppComp(rng) {
  const q = rng.int(1, 6);
  const p = rng.int(2 * q + 1, Math.min(2 * q + 13, 24));
  if (gcdInt(p, q) !== 1) return null;
  const c = (90 * q) / (p - q);              // the complement
  const a = 90 - c;                          // the angle
  if (!isAcute(a) || !isHalf(a) || !isAcute(c) || !isHalf(c)) return null;
  if (a < 4 || c < 4) return null;
  const s = supp(a);
  const statement = rng.chance(0.5)
    ? `The ratio of the supplement of an angle to its complement is ${p}:${q}.`
    : `The ratio of the measure of the supplement of an angle to the measure of the complement of the angle is ${p}:${q}.`;

  const canonical = `(180-x)/(90-x)-${p}/${q}`;
  const text = `(180 − x)/(90 − x) = ${p}/${q}`;
  const alternates = [
    alternate(`${p}x-${q}x-90`, `${cx(p)}x − ${cx(q)}x = 90`, 90 / (p - q), 'x = one part (the supplement is always 90 more than the complement)', [90]),
    alternate(`(180-(90-x))/x-${p}/${q}`, `(180 − (90 − x))/x = ${p}/${q}`, c, 'x = the complement', [180, 90]),
    alternate(`${q}(180-x)-${p}(90-x)`, `${mul(q, '(180 − x)')} = ${mul(p, '(90 − x)')}`, a, 'cross-multiplied', [180, 90]),
  ].filter(Boolean);

  return {
    form: 'supp-comp', p, q, a, statement,
    values: { angle: a, comp: c, supp: s },
    asks: SUPP_COMP_ASKS,
    setup: setupPart({ canonical, text, roots: [a], mustMention: [180, 90], alternates, means: 'x = the angle' }),
    trap: {
      canonical: `(90-x)/(180-x)-${p}/${q}`, text: `(90 − x)/(180 − x) = ${p}/${q}`,
      tag: 'confused-comp-supp',
      msg: 'The supplement (180 − x) is on top — the sentence names it first.',
    },
    hints: [
      `The supplement is 180 − x and the complement is 90 − x. "The ratio of A to B is ${p}:${q}" means A/B = ${p}/${q}.`,
      `Set up: ${text}, then cross-multiply: ${mul(q, '(180 − x)')} = ${mul(p, '(90 − x)')}.`,
      `${180 * q} − ${cx(q)}x = ${90 * p} − ${cx(p)}x, so ${cx(p - q)}x = ${90 * p - 180 * q}.`,
    ],
    steps: [
      { say: 'Write the ratio as a fraction', math: text },
      { say: 'Cross-multiply', math: `${mul(q, '(180 − x)')} = ${mul(p, '(90 − x)')}` },
      { say: 'Expand', math: `${180 * q} − ${cx(q)}x = ${90 * p} − ${cx(p)}x` },
      { say: 'Collect the x terms', math: `${cx(p - q)}x = ${90 * p - 180 * q}` },
      { say: 'Solve', math: `x = ${fmt(a)}` },
    ],
  };
}

// ---------------------------------------------------------------------------
// C — the ratio of an angle to its supplement is p : q; give angle : complement
// ---------------------------------------------------------------------------

function drawAngleSupp(rng) {
  const sum = rng.pick(PART_SUMS.filter((s) => 180 % s === 0 && s >= 4));
  const p = rng.int(1, Math.ceil(sum / 2) - 1);
  const q = sum - p;
  if (gcdInt(p, q) !== 1 || p >= q) return null;
  const a = (180 * p) / sum;
  if (!isAcute(a) || !isHalf(a) || a < 6) return null;
  const c = comp(a);
  if (!isMeasure(c) || !isHalf(c)) return null;
  const [rp, rq] = reduceRatio(a * 2, c * 2);
  const answer = `${rp}:${rq}`;
  const statement = `The ratio of an angle to its supplement is ${p}:${q}.`;

  const canonical = `x/(180-x)-${p}/${q}`;
  const text = `x/(180 − x) = ${p}/${q}`;
  const alternates = [
    alternate(`${p}x+${q}x-180`, `${cx(p)}x + ${cx(q)}x = 180`, 180 / sum, `x = one part (the angle is ${p} parts, its supplement ${q})`, [180]),
    alternate(`x/(180-x)-${q}/${p}`, `x/(180 − x) = ${q}/${p}`, supp(a), 'x = the supplement', [180]),
  ].filter(Boolean);

  return {
    form: 'angle-supp', p, q, a, answer,
    statement,
    values: { angle: a, comp: c, supp: supp(a) },
    asks: ['ratio-comp'],
    setup: setupPart({ canonical, text, roots: [a], mustMention: [180], alternates, means: 'x = the angle' }),
    trap: {
      canonical: `x/(90-x)-${p}/${q}`, text: `x/(90 − x) = ${p}/${q}`,
      tag: 'used-90-for-supp',
      msg: '90 − x is the complement; the sentence gives the ratio to the SUPPLEMENT, 180 − x.',
    },
    hints: [
      `"The ratio of an angle to its supplement is ${p}:${q}" means x/(180 − x) = ${p}/${q}. Find the angle first — the ratio it asks for comes after.`,
      `Set up: ${text}, then cross-multiply: ${cx(q)}x = ${mul(p, '(180 − x)')}.`,
      `${cx(p + q)}x = ${180 * p}, so once you have x the complement is 90 − x — then write angle : complement and reduce.`,
    ],
    steps: [
      { say: 'Write the ratio as a fraction', math: text },
      { say: 'Cross-multiply', math: `${cx(q)}x = ${mul(p, '(180 − x)')}` },
      { say: 'Collect the x terms', math: `${cx(p + q)}x = ${180 * p}` },
      { say: 'The angle', math: `x = ${fmt(a)}` },
      { say: 'Its complement', math: `90 − ${fmt(a)} = ${fmt(c)}` },
      { say: 'The ratio asked for, reduced', math: `${fmt(a)}:${fmt(c)} = ${answer}` },
    ],
  };
}

// ---------------------------------------------------------------------------
// the asks
// ---------------------------------------------------------------------------

const ASKS = {
  angle: { q: 'Find the measure of the angle.', label: 'angle =', asks: ['angle'], value: (v) => v.angle, names: ['comp', 'supp'] },
  comp: { q: 'Find the complement of the angle.', label: 'complement =', asks: ['comp'], value: (v) => v.comp, names: ['angle', 'supp'] },
  supp: { q: 'Find the measure of the supplement.', label: 'supplement =', asks: ['supp'], value: (v) => v.supp, names: ['angle', 'comp'] },
  'supp-of-comp': {
    q: 'What is the supplement of the complement of the angle?', label: 'supplement of the complement =',
    asks: ['comp', 'supp'], value: (v) => supp(v.comp), names: ['angle', 'comp', 'supp'],
  },
  larger: { q: 'Find the measure of the larger angle.', label: 'larger angle =', asks: ['larger'], value: (v) => v.larger, names: ['smaller'] },
  smaller: { q: 'Find the measure of the smaller angle.', label: 'smaller angle =', asks: ['smaller'], value: (v) => v.smaller, names: ['larger'] },
  'comp-of-smaller': {
    q: 'Find the complement of the smaller angle.', label: 'complement of the smaller =',
    asks: ['smaller', 'comp'], value: (v) => comp(v.smaller), names: ['smaller', 'larger'],
  },
  'supp-of-smaller': {
    q: 'Find the supplement of the smaller angle.', label: 'supplement of the smaller =',
    asks: ['smaller', 'supp'], value: (v) => supp(v.smaller), names: ['smaller', 'larger'],
  },
  'supp-of-larger': {
    q: 'Find the supplement of the larger angle.', label: 'supplement of the larger =',
    asks: ['larger', 'supp'], value: (v) => supp(v.larger), names: ['smaller', 'larger'],
  },
  pair: { q: 'Find the measure of each angle.', pair: true },
  'ratio-comp': { q: 'Determine the ratio of the angle to its complement.', ratio: true },
};

// ---------------------------------------------------------------------------
// assembling
// ---------------------------------------------------------------------------

function buildItem(drawn, ask) {
  const spec = ASKS[ask];
  if (!spec) return null;
  const v = drawn.values;
  const prompt = `${drawn.statement} ${spec.q}`;
  const setup = drawn.setup;
  const misconceptions = [];

  // the wrong-setup trap, re-solved before it is emitted
  if (drawn.trap) {
    const got = solveEmitted(drawn.trap.canonical, 'x');
    if (got && got.length === 1 && Math.abs(got[0] - Number(setup.roots[0])) > 1e-9) {
      setup.misconceptions = [{
        part: 'setup', answer: drawn.trap.text, tag: drawn.trap.tag, msg: drawn.trap.msg,
        gives: isHalf(got[0]) ? fmt(got[0]) : String(Math.round(got[0] * 100) / 100),
      }];
    }
  }

  let answerPart;
  let answerText;
  if (spec.pair) {
    const fields = [
      { key: 'a', label: 'one angle', answer: fmt(v.smaller), asks: ['smaller'], distractors: { larger: fmt(v.larger) } },
      { key: 'b', label: 'the other angle', answer: fmt(v.larger), asks: ['larger'], distractors: { smaller: fmt(v.smaller) } },
    ];
    answerPart = { id: 'answer', type: 'multi', orderFree: true, prompt: spec.q, fields };
    answerText = `${deg(v.smaller)} and ${deg(v.larger)}`;
  } else if (spec.ratio) {
    answerPart = {
      id: 'answer', type: 'ratio', label: 'angle : complement =', answer: drawn.answer,
      distractors: { angle: fmt(v.angle), comp: fmt(v.comp), supp: fmt(v.supp) },
    };
    answerText = drawn.answer;
    // a trap that reduces to the answer would grade `correct` — drop it (angle = 45 gives 1:1, whose
    // reversal is itself, and a given ratio can coincide with the asked one)
    const sameAsAnswer = (r) => {
      const [x, y] = String(r).split(':').map(Number);
      const [ax, ay] = String(drawn.answer).split(':').map(Number);
      return Number.isFinite(x) && Number.isFinite(y) && x * ay === y * ax;
    };
    // "the ratio numbers are the degrees" (wp-10's own trap: 3 and 7 read as 3° and 87°)
    const asDegrees = drawn.p < 90 ? reduceRatio(drawn.p, 90 - drawn.p).join(':') : null;
    for (const entry of [
      { part: 'answer', answer: `${drawn.p}:${drawn.q}`, tag: 'gave-supplement', msg: `${drawn.p} : ${drawn.q} is the given ratio, angle to SUPPLEMENT. The question asks for the ratio to the complement (90 − ${fmt(v.angle)} = ${fmt(v.comp)}).` },
      { part: 'answer', answer: drawn.answer.split(':').reverse().join(':'), tag: 'reversed-ratio', msg: `Order matters: "angle to complement" puts the angle first — ${fmt(v.angle)} : ${fmt(v.comp)}.` },
      ...(asDegrees ? [{ part: 'answer', answer: asDegrees, tag: 'ratio-as-measure', msg: `${drawn.p} and ${drawn.q} are parts, not degrees. ${drawn.p + drawn.q} parts make 180, so the angle is ${drawn.p} × ${fmt(180 / (drawn.p + drawn.q))} = ${deg(v.angle)}.` }] : []),
    ]) {
      if (sameAsAnswer(entry.answer)) continue;
      if (misconceptions.some((m) => m.answer === entry.answer)) continue;
      misconceptions.push(entry);
    }
  } else {
    const value = spec.value(v);
    if (!isMeasure(value) || !isHalf(value)) return null;
    answerPart = numPart({ label: spec.label, value, asks: spec.asks, values: v, names: spec.names });
    answerText = deg(value);
    if (ask === 'supp-of-comp' && Math.abs(v.supp - value) > 1e-9) {
      misconceptions.push({
        part: 'answer', answer: fmt(v.supp), tag: 'confused-comp-supp',
        msg: `${deg(v.supp)} is the supplement of the angle itself — the question asks for the supplement of its complement.`,
      });
    }
    if (ask === 'comp-of-smaller' && isMeasure(comp(v.larger))) {
      misconceptions.push({
        part: 'answer', answer: fmt(comp(v.larger)), tag: 'gave-larger',
        msg: `That is the complement of the larger angle (${deg(v.larger)}). The smaller one is ${deg(v.smaller)}.`,
      });
    }
    if ((ask === 'supp-of-smaller' || ask === 'supp-of-larger')) {
      const other = ask === 'supp-of-smaller' ? v.larger : v.smaller;
      const wrong = supp(other);
      if (isMeasure(wrong) && Math.abs(wrong - value) > 1e-9) {
        misconceptions.push({
          part: 'answer', answer: fmt(wrong), tag: ask === 'supp-of-smaller' ? 'gave-larger' : 'gave-smaller',
          msg: `That is the supplement of the other angle — the question names the ${ask === 'supp-of-smaller' ? 'smaller' : 'larger'} one (${deg(ask === 'supp-of-smaller' ? v.smaller : v.larger)}).`,
        });
      }
    }
  }

  const solution = [...drawn.steps];
  if (!spec.pair && !spec.ratio) {
    const chain = spec.asks;
    let cur = chain[0] === 'smaller' ? v.smaller : chain[0] === 'larger' ? v.larger : v.angle;
    for (const step of chain.slice(1)) {
      const next = step === 'comp' ? comp(cur) : supp(cur);
      solution.push({ say: step === 'comp' ? 'Its complement' : 'Its supplement', math: `${step === 'comp' ? 90 : 180} − ${fmt(cur)} = ${fmt(next)}` });
      cur = next;
    }
    if (chain.length === 1 && chain[0] === 'comp') solution.push({ say: 'The complement', math: `90 − ${fmt(v.angle)} = ${fmt(v.comp)}` });
    if (chain.length === 1 && chain[0] === 'supp') solution.push({ say: 'The supplement', math: `180 − ${fmt(v.angle)} = ${fmt(v.supp)}` });
  }
  solution.push({ say: 'Which is what the question asks for', math: answerText });

  return {
    prompt,
    parts: [setup, answerPart],
    answer: answerText,
    hints: drawn.hints,
    solution,
    misconceptions,
    tier: 2,
    par: spec.pair ? 180 : 165,
    meta: { form: drawn.form, ask, p: drawn.p, q: drawn.q, values: v, total: drawn.total ?? null },
  };
}

function draw(rng, params, api) {
  const forms = params.form ? [params.form] : ['parts', 'supp-comp', 'angle-supp'];
  const form = forms.length === 1 ? forms[0] : rng.weighted(forms, forms.map((f) => FORM_WEIGHTS[f]));
  const drawn = form === 'parts' ? drawParts(rng) : form === 'supp-comp' ? drawSuppComp(rng) : drawAngleSupp(rng);
  if (!drawn) return api.reject();
  const asks = params.ask && drawn.asks.includes(params.ask) ? [params.ask] : drawn.asks;
  const ask = asks.length === 1 ? asks[0] : rng.pick(asks);
  const item = buildItem(drawn, ask);
  if (!item) return api.reject();
  return item;
}

/** the fixed exemplar (S2): ang-08's own numbers — supplement : complement = 5 : 2, supplement 150. */
function exemplar() {
  const a = 30;
  const drawn = {
    form: 'supp-comp', p: 5, q: 2, a,
    statement: 'The ratio of the supplement of an angle to its complement is 5:2.',
    values: { angle: 30, comp: 60, supp: 150 },
    asks: SUPP_COMP_ASKS,
    setup: setupPart({
      canonical: '(180-x)/(90-x)-5/2', text: '(180 − x)/(90 − x) = 5/2', roots: [30], mustMention: [180, 90],
      alternates: [alternate('2(180-x)-5(90-x)', '2(180 − x) = 5(90 − x)', 30, 'cross-multiplied', [180, 90])].filter(Boolean),
      means: 'x = the angle',
    }),
    trap: null,
    hints: [
      'The supplement is 180 − x and the complement is 90 − x. "The ratio of A to B is 5:2" means A/B = 5/2.',
      'Set up: (180 − x)/(90 − x) = 5/2, then cross-multiply: 2(180 − x) = 5(90 − x).',
      '360 − 2x = 450 − 5x, so 3x = 90.',
    ],
    steps: [
      { say: 'Write the ratio as a fraction', math: '(180 − x)/(90 − x) = 5/2' },
      { say: 'Cross-multiply', math: '2(180 − x) = 5(90 − x)' },
      { say: 'Expand', math: '360 − 2x = 450 − 5x' },
      { say: 'Collect the x terms', math: '3x = 90' },
      { say: 'Solve', math: 'x = 30' },
    ],
  };
  return buildItem(drawn, 'supp');
}

/** verify — re-solve the emitted setup, re-derive every measure, re-reduce the ratio. */
function verify(item) {
  const out = [];
  const setup = item.parts.find((p) => p.type === 'equation');
  const answer = item.parts.find((p) => p.id === 'answer');
  if (!setup || !answer) { out.push('item is missing its setup or answer part'); return out; }
  const roots = solveEmitted(setup.canonical, 'x');
  if (!roots || roots.length !== 1) { out.push(`the emitted equation ${setup.canonical} has no single root`); return out; }
  if (Math.abs(roots[0] - Number(setup.roots[0])) > 1e-9) out.push(`solver got ${fmt(roots[0])}, item claims ${setup.roots[0]}`);
  for (const alt of setup.alternates ?? []) {
    const got = solveEmitted(alt.canonical, 'x');
    if (!got || got.length !== 1 || Math.abs(got[0] - Number(alt.roots[0])) > 1e-9) out.push(`alternate ${alt.canonical} does not solve to ${alt.roots[0]}`);
  }
  const v = item.meta.values;
  for (const [name, val] of Object.entries(v)) {
    if (!isMeasure(val) || !isHalf(val)) out.push(`${name} = ${fmt(val)} is not a measure`);
  }
  if (item.meta.form === 'parts') {
    if (Math.abs(v.smaller + v.larger - item.meta.total) > 1e-9) out.push('the two angles do not add to the total');
    if (Math.abs(v.smaller * Math.max(item.meta.p, item.meta.q) - v.larger * Math.min(item.meta.p, item.meta.q)) > 1e-9) out.push('the two angles are not in the stated ratio');
  } else {
    if (Math.abs(v.comp - comp(v.angle)) > 1e-9 || Math.abs(v.supp - supp(v.angle)) > 1e-9) out.push('comp/supp disagree with the angle');
    if (item.meta.form === 'supp-comp' && Math.abs(v.supp * item.meta.q - v.comp * item.meta.p) > 1e-9) out.push('supplement : complement is not the stated ratio');
    if (item.meta.form === 'angle-supp' && Math.abs(v.angle * item.meta.q - v.supp * item.meta.p) > 1e-9) out.push('angle : supplement is not the stated ratio');
  }
  if (answer.type === 'ratio') {
    const [ra, rb] = String(answer.answer).split(':').map(Number);
    const [ea, eb] = reduceRatio(v.angle * 2, v.comp * 2);
    if (ra !== ea || rb !== eb) out.push(`ratio ${answer.answer} is not ${ea}:${eb}`);
  }
  return out;
}

export const gen = makeGen(TEMPLATE, draw, {
  version: VERSION,
  skills: ['CS-RATIO'],
  tier: 2,
  par: 165,
  module: 'M4',
  sheet: 'WP',
  exemplar,
  verify,
});

export default gen;
