// csarith.js — `T-csarith` (COMPOSED S2: M3 Comp/Supp Sprint, skill CSARITH; S8 #7a).
//
//   "Find the supplement of the complement of 21.5°."   → one `num` part, answer 111.5
//
// S2's rules for this template, implemented literally:
//   · chains of depth 1–3;
//   · every intermediate strictly inside (0, 180);
//   · **the complement is only ever taken of a value < 90** — and, stronger, `comp` never follows `supp`
//     in a chain, so "the complement of the supplement" can never be generated (S8 #7a acceptance);
//   · integers and halves only (the answer is typeable on a phone keypad).
//
// Why depth 3 always contains a repeat: with comp∘comp = supp∘supp = identity and `supp → comp` banned,
// the only legal three-step chains are comp-comp-supp and comp-supp-supp. Both collapse — that IS the
// item ("the complement of the complement brings you back to the angle you started with", the insight
// behind asn-23). The solution says so out loud, and depth 3 is drawn ~1 time in 6.
//
// Diagnosis: depth 1–2 lean on S3's own chain machinery (`asks` + `distractors` in num.js — "That's the
// complement — the question asks for the supplement of the complement (180 − 68.5)"). Depth 3 chains have
// two `comp` stages, which a name→value distractor map cannot tell apart, so every intermediate of a
// depth-3 chain is also written out as an explicit `misconceptions[]` entry — those are matched before the
// chain machinery, so no student ever sees a message about the wrong stage.
//
// tags:['used-90-for-supp','used-180-for-comp','confused-comp-supp','stopped-early']

import { makeGen, fmt, deg, comp, supp, chainValue, describeOps, isMeasure, isAcute, isHalf } from './contract.js';

export const TEMPLATE = 'T-csarith';
export const VERSION = 1;

/** depth → how often it is drawn (S2: "chains depth 1–3") */
const DEPTH_WEIGHTS = [30, 52, 18];
const DEPTH3_OPS = [['comp', 'comp', 'supp'], ['comp', 'supp', 'supp']];

/** "the supplement of the complement" → "supplement of the complement" (field labels drop the article) */
function labelOf(ops) {
  return describeOps(ops).replace(/^the /, '');
}

/** A base measure: integers, plus halves about a third of the time. */
function drawBase(rng, { min, max }) {
  const half = rng.chance(0.3);
  if (half) {
    const lo = Math.ceil(min - 0.5);
    const hi = Math.floor(max - 0.5);
    if (hi < lo) return null;
    return rng.int(lo, hi) + 0.5;
  }
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  if (hi < lo) return null;
  return rng.int(lo, hi);
}

/** The chain is legal iff every intermediate is a measure and every `comp` acts on something < 90. */
function chainIsLegal(base, ops) {
  if (!isMeasure(base) || !isHalf(base)) return false;
  let v = base;
  for (const op of ops) {
    if (op === 'comp' && !isAcute(v)) return false;
    v = op === 'comp' ? comp(v) : supp(v);
    if (!isMeasure(v) || !isHalf(v)) return false;
  }
  return true;
}

function build(base, ops, phrasing) {
  const { value, steps } = chainValue(base, ops);
  const phrase = describeOps(ops);
  const label = labelOf(ops);
  const depth = ops.length;

  // ---- prompt -------------------------------------------------------------
  let prompt;
  if (phrasing === 'imperative') prompt = `Find ${phrase} of ${deg(base)}.`;
  else if (phrasing === 'question') prompt = `What is ${phrase} of ${deg(base)}?`;
  else prompt = `An angle measures ${deg(base)}. Find ${phrase} of it.`;

  // ---- distractors: every named stage the chain passes through ------------
  const firstComp = steps.find((s) => s.op === 'comp');
  const distractors = { angle: fmt(base) };
  const compStage = firstComp ? firstComp.to : (isAcute(base) ? comp(base) : null);
  if (compStage !== null && compStage !== value && isMeasure(compStage)) distractors.comp = fmt(compStage);
  if (supp(base) !== value && isMeasure(supp(base))) distractors.supp = fmt(supp(base));

  // ---- misconceptions ----------------------------------------------------
  const misconceptions = [];
  const seen = new Set([fmt(value)]);
  const add = (v, tag, msg) => {
    if (!isMeasure(v) || !isHalf(v)) return;
    const key = fmt(v);
    if (seen.has(key)) return;
    seen.add(key);
    misconceptions.push({ part: 'answer', answer: key, tag, msg });
  };

  if (depth === 1) {
    if (ops[0] === 'comp') {
      add(supp(base), 'used-180-for-comp',
        `Complementary angles add to 90°, so the complement of ${deg(base)} is 90 − ${fmt(base)}. Subtracting from 180 gives the supplement.`);
    } else {
      add(isAcute(base) ? comp(base) : base - 90, 'used-90-for-supp',
        `Supplementary angles add to 180°, so the supplement of ${deg(base)} is 180 − ${fmt(base)}. The 90 belongs to complements.`);
    }
  } else if (depth === 2) {
    add(supp(base), 'confused-comp-supp',
      `That is the supplement of the angle itself. This one starts inside: take 90 − ${fmt(base)} first, then subtract that from 180.`);
  } else {
    // depth 3 — spell out every stage, because two `comp` stages share one distractor name
    const c1 = steps[0].to;
    add(c1, 'stopped-early',
      `${deg(c1)} is only the first complement. Taking its complement brings you straight back to ${deg(base)} — then you still owe the last step.`);
    if (ops[1] === 'comp') {
      add(base, 'stopped-early',
        `The complement of the complement is the angle you started with, so you are back at ${deg(base)} with one step left: its supplement.`);
      add(supp(c1), 'confused-comp-supp',
        `That is 180 − ${fmt(c1)}. The second step is another complement (90 − ${fmt(c1)}), and only the third step is a supplement.`);
    } else {
      add(steps[1].to, 'stopped-early',
        `${deg(steps[1].to)} is the supplement of the complement — there is one more supplement to take after it.`);
      add(supp(base), 'confused-comp-supp',
        `That is the supplement of the angle itself. The chain starts with the complement of ${deg(base)}.`);
    }
  }

  // ---- hints (H1 relationship, H2 setup, H3 one step from the end) --------
  const insideOut = steps.map((s) => (s.op === 'comp' ? `90 − ${fmt(s.from)}` : `180 − ${fmt(s.from)}`));
  const lastStep = steps[steps.length - 1];
  const hints = [
    'Complementary angles add to 90°; supplementary angles add to 180°. Nothing here needs algebra — just the two sums.',
    depth === 1
      ? `Write the subtraction before you do it: ${insideOut[0]}.`
      : `Work from the inside out: ${insideOut[0]} first, and only then ${describeOps(ops.slice(1))} of that.`,
    depth === 1
      ? `${insideOut[0]} — one subtraction and you are done.`
      : `You are one step away: ${lastStep.op === 'comp' ? 'the complement' : 'the supplement'} of ${deg(lastStep.from)}.`,
  ];

  // ---- solution ----------------------------------------------------------
  const solution = [{ say: 'Read the chain from the inside out', math: `${phrase} of ${deg(base)}` }];
  steps.forEach((s, i) => {
    const sum = s.op === 'comp' ? 90 : 180;
    solution.push({
      say: i === 0
        ? `The ${s.op === 'comp' ? 'complement' : 'supplement'} of ${deg(s.from)} (they add to ${sum})`
        : `Now the ${s.op === 'comp' ? 'complement' : 'supplement'} of ${deg(s.from)}`,
      math: `${sum} − ${fmt(s.from)} = ${fmt(s.to)}`,
    });
  });
  if (depth === 3) {
    solution.push({
      say: ops[1] === 'comp'
        ? 'Notice the shortcut: the complement of the complement is the angle you started with'
        : 'Notice the shortcut: the supplement of the supplement is the angle you started with',
      math: ops[1] === 'comp' ? `90 − (90 − ${fmt(base)}) = ${fmt(base)}` : `180 − (180 − ${fmt(steps[0].to)}) = ${fmt(steps[0].to)}`,
    });
  }
  solution.push({ say: `So ${phrase} of ${deg(base)} is`, math: deg(value) });

  return {
    prompt,
    parts: [{
      id: 'answer',
      type: 'num',
      label: `${label} =`,
      answer: fmt(value),
      asks: ops,
      distractors,
    }],
    answer: deg(value),
    hints,
    solution,
    misconceptions,
    tier: depth === 1 ? 1 : 2,
    par: depth === 1 ? 30 : depth === 2 ? 45 : 60,
    meta: { base, ops, depth, value, phrasing },
  };
}

/** The S2 draw: pick the shape, pick the base, reject anything that breaks an invariant. */
function draw(rng, params, api) {
  const depth = params.depth && [1, 2, 3].includes(params.depth)
    ? params.depth
    : rng.weighted([1, 2, 3], DEPTH_WEIGHTS);
  let ops;
  if (depth === 1) ops = [rng.chance(0.5) ? 'comp' : 'supp'];
  else if (depth === 2) ops = ['comp', 'supp'];
  else ops = rng.pick(DEPTH3_OPS);

  // a chain that opens with a complement needs an acute base; a lone supplement may take any measure
  const bounds = ops[0] === 'comp' ? { min: 4, max: 86 } : { min: 8, max: 172 };
  const base = drawBase(rng, bounds);
  if (base === null) return api.reject();
  if (base === 45 || base === 90) return api.reject();       // comp(45) = 45, supp(90) = 90 — no question at all
  if (!chainIsLegal(base, ops)) return api.reject();
  const { value } = chainValue(base, ops);
  if (value === base && depth < 3) return api.reject();       // nothing to compute
  const phrasing = depth === 1 ? rng.pick(['imperative', 'question', 'measures']) : rng.pick(['imperative', 'question']);
  return build(base, ops, phrasing);
}

/** The fixed exemplar (S2): the spec's own example, 180 − (90 − 21.5) = 111.5. */
function exemplar() {
  return build(21.5, ['comp', 'supp'], 'imperative');
}

/**
 * verify — re-derive the answer from the EMITTED prompt rather than from the draw's own arithmetic:
 * re-read the chain out of the num part (`asks`) and the base out of the distractors, recompute, compare.
 */
function verify(item) {
  const out = [];
  const part = item.parts[0];
  const ops = part.asks;
  const base = Number(part.distractors.angle);
  if (!Number.isFinite(base)) { out.push('the emitted item has no base measure in its distractors'); return out; }
  if (!Array.isArray(ops) || !ops.length || ops.length > 3) { out.push('asks is not a chain of 1–3 steps'); return out; }
  let v = base;
  for (const op of ops) {
    if (op !== 'comp' && op !== 'supp') { out.push(`unknown chain step ${op}`); return out; }
    if (op === 'comp' && !isAcute(v)) out.push(`the complement is taken of ${fmt(v)}, which is not below 90`);
    v = op === 'comp' ? comp(v) : supp(v);
    if (!isMeasure(v)) out.push(`intermediate ${fmt(v)} is outside (0, 180)`);
    if (!isHalf(v)) out.push(`intermediate ${fmt(v)} is not an integer or a half`);
  }
  for (let i = 1; i < ops.length; i++) {
    if (ops[i] === 'comp' && ops[i - 1] === 'supp') out.push('a complement was taken of a supplement');
  }
  if (fmt(v) !== String(part.answer)) out.push(`solver got ${fmt(v)} but the item answers ${part.answer}`);
  if (!item.prompt.includes(deg(base))) out.push('the prompt does not mention the base measure');
  return out;
}

export const gen = makeGen(TEMPLATE, draw, {
  version: VERSION,
  skills: ['CSARITH'],
  tier: 2,
  par: 45,
  module: 'M3',
  sheet: null,
  exemplar,
  verify,
});

export default gen;
