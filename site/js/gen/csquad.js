// csquad.js — `T-cs-quad` (COMPOSED S2: M5 Word Problems: Product, skill CS-QUAD; S8 #7a).
//
// Two shapes, chosen by a COIN FLIP so that rejecting a root is never automatic (S2):
//
//   "product"  (both roots valid)   The product of an angle and its complement is P.        wp-12
//              x(90 − x) = P from a chosen root; the two roots are r and 90 − r — each other's
//              complement, so both are legal angles and the reject stage's answer is "both valid".
//   "ratio"    (one root invalid)   The ratio of the product of an angle and its supplement to the
//              product of the angle and its complement is p:q.                              ang-09
//              q·x(180 − x) = p·x(90 − x) keeps the factor x, so x = 0 falls out and must be rejected
//              ("zero angle"). The equation is emitted UNCANCELLED for exactly that reason.
//
// Every item is the S3 `rootcase` chain: equation → roots → reject → num. The reject stage is on both
// shapes (S3: the "both valid" option and its distractors are always present), which is what makes the
// coin flip matter — a student who always rejects is wrong half the time.
//
// tags:['forgot-second-root','rejected-valid-root','kept-invalid-root','gave-smaller','gave-larger','used-90-for-supp']
// (the reject stage's reason ids — both-valid / zero-angle — are reasonKeys from js/grader/reject.js, not misconception tags)

import {
  makeGen, fmt, deg, comp, supp, isMeasure, isAcute, isHalf, gcdInt, solveEmitted,
} from './contract.js';

export const TEMPLATE = 'T-cs-quad';
export const VERSION = 1;

// ---------------------------------------------------------------------------
// the asks
// ---------------------------------------------------------------------------

const ASKS = {
  smaller: { q: 'What is the measure of the smaller angle?', label: 'smaller angle =', asks: ['smaller'], value: (v) => v.smaller, names: ['smaller', 'larger'] },
  larger: { q: 'What is the measure of the larger angle?', label: 'larger angle =', asks: ['larger'], value: (v) => v.larger, names: ['smaller', 'larger'] },
  'supp-of-smaller': {
    q: 'What is the supplement of the smaller angle?', label: 'supplement of the smaller =',
    asks: ['smaller', 'supp'], value: (v) => supp(v.smaller), names: ['smaller', 'larger'],
  },
  'supp-of-larger': {
    q: 'What is the supplement of the larger angle?', label: 'supplement of the larger =',
    asks: ['larger', 'supp'], value: (v) => supp(v.larger), names: ['smaller', 'larger'],
  },
  angle: { q: 'Find the angle.', label: 'angle =', asks: ['angle'], value: (v) => v.angle, names: ['angle', 'comp', 'supp'] },
  comp: { q: 'Find the complement of the angle.', label: 'complement =', asks: ['comp'], value: (v) => v.comp, names: ['angle', 'comp', 'supp'] },
  supp: { q: 'Find the supplement of the angle.', label: 'supplement =', asks: ['supp'], value: (v) => v.supp, names: ['angle', 'comp', 'supp'] },
};

/** a coefficient as a student writes it: 1 disappears ("x(180 − x)", not "1x(180 − x)") */
const cx = (n) => (n === 1 ? '' : fmt(n));

const PRODUCT_ASKS = ['smaller', 'larger', 'supp-of-smaller', 'supp-of-larger'];
const RATIO_ASKS = ['angle', 'comp', 'supp'];

// ---------------------------------------------------------------------------
// shape 1 — x(90 − x) = P, both roots valid
// ---------------------------------------------------------------------------

function drawProduct(rng) {
  // the smaller root stays small so the factor pair of P is findable by hand (wp-12 uses 4 and 86)
  const r = rng.chance(0.55) ? rng.int(2, 12) : rng.int(2, 25);
  const other = comp(r);
  if (!isAcute(r) || !isAcute(other) || r === other) return null;
  const P = r * other;
  if (!Number.isInteger(P)) return null;
  const smaller = Math.min(r, other);
  const larger = Math.max(r, other);

  const statement = rng.chance(0.5)
    ? `The product of an angle and its complement is ${P}.`
    : `An angle and its complement have a product of ${P}.`;

  const canonical = `x(90-x)-${P}`;
  const text = `x(90 − x) = ${P}`;
  return {
    shape: 'product', bothValid: true, P,
    statement, canonical, text, mustMention: [90],
    roots: [larger, smaller],
    valid: [larger, smaller], rejected: [],
    reason: 'both valid', reasonKey: 'both-valid',
    reasonDistractors: [
      `${fmt(smaller)} is too small to be an angle`,
      `${fmt(larger)} is obtuse, so reject it`,
      'neither value satisfies the equation',
    ],
    values: { smaller, larger, angle: smaller, comp: larger, supp: supp(smaller) },
    asks: PRODUCT_ASKS,
    alternates: [],
    hints: [
      `Complement = 90 − x. "The product of" means multiply: x(90 − x) = ${P} — a quadratic, so expect two roots.`,
      `Set up: x(90 − x) = ${P} → 90x − x² = ${P} → 0 = x² − 90x + ${P}. Factor: two numbers with product ${P} and sum −90.`,
      `Two numbers multiply to ${P} and add to 90 — those are the roots. Then read the question again: an angle and its complement are BOTH legal angles here.`,
    ],
    steps: [
      { say: 'Let x be the angle; its complement is 90 − x', math: 'angle = x,  comp = 90 − x' },
      { say: `Their product IS ${P}`, math: text },
      { say: 'Distribute', math: `90x − x² = ${P}` },
      { say: 'Move everything to one side so the x² term is positive', math: `0 = x² − 90x + ${P}` },
      { say: `Factor: −${fmt(larger)} and −${fmt(smaller)} multiply to ${P} and add to −90`, math: `0 = (x − ${fmt(larger)})(x − ${fmt(smaller)})` },
      { say: 'Set each factor to 0', math: `x = ${fmt(larger)}  or  x = ${fmt(smaller)}` },
      { say: `Both work: ${fmt(larger)} and ${fmt(smaller)} are complements of each other`, math: `${fmt(larger)} × ${fmt(smaller)} = ${P}` },
    ],
  };
}

// ---------------------------------------------------------------------------
// shape 2 — q·x(180 − x) = p·x(90 − x), x = 0 rejected
// ---------------------------------------------------------------------------

function drawRatio(rng) {
  const q = rng.int(1, 6);
  const p = rng.int(2 * q + 1, Math.min(2 * q + 13, 26));
  if (gcdInt(p, q) !== 1) return null;
  const A = p - q;                              // x² coefficient once everything is on one side
  const B = 90 * p - 180 * q;                   // x coefficient (negated)
  const a = B / A;                              // the angle
  if (!isAcute(a) || !isHalf(a) || a < 5) return null;
  const g = gcdInt(A, B);
  const inner = A / g === 1 ? `x − ${fmt(B / g)}` : `${fmt(A / g)}x − ${fmt(B / g)}`;

  const statement = `The ratio of the product of an angle and its supplement to the product of the angle and its complement is ${p}:${q}.`;
  const canonical = `${q}x(180-x)-${p}x(90-x)`;
  const text = `${cx(q)}x(180 − x) = ${cx(p)}x(90 − x)`;

  const alt = `x(180-x)/(x(90-x))-${p}/${q}`;
  const alternates = [];
  const got = solveEmitted(alt, 'x');
  if (got && got.length === 1 && Math.abs(got[0] - a) < 1e-9) {
    alternates.push({
      canonical: alt, text: `x(180 − x)/(x(90 − x)) = ${p}/${q}`, roots: [fmt(a)],
      means: 'the ratio written as a fraction (cancelling the x loses the root x = 0)', mustMention: [180, 90],
    });
  }

  return {
    shape: 'ratio', bothValid: false, p, q,
    statement, canonical, text, mustMention: [180, 90],
    roots: [a, 0],
    valid: [a], rejected: [0],
    reason: 'zero angle', reasonKey: 'zero-angle',
    reasonDistractors: [
      'both values work',
      `${fmt(a)} is obtuse, so reject it`,
      '0 does not satisfy the equation',
    ],
    values: { angle: a, comp: comp(a), supp: supp(a) },
    asks: RATIO_ASKS,
    alternates,
    hints: [
      `Let the angle be x. The two products are x(180 − x) and x(90 − x); their ratio is ${p} to ${q}.`,
      `Cross-multiply: ${text}. Do NOT divide both sides by x — you would lose a root.`,
      `${180 * q}x − ${cx(q)}x² = ${90 * p}x − ${cx(p)}x² → bring everything to one side: ${cx(A)}x² − ${B}x = 0. Factor out ${g === 1 ? 'the x' : `the GCF ${g}x`} and set each factor to 0 — one of the two roots is not an angle.`,
    ],
    steps: [
      { say: 'Let x be the angle: supplement 180 − x, complement 90 − x', math: 'angle = x,  supp = 180 − x,  comp = 90 − x' },
      { say: 'The ratio of the two products', math: `x(180 − x) : x(90 − x) = ${p} : ${q}` },
      { say: 'Cross-multiply (keep the x — dividing by it loses a root)', math: text },
      { say: 'Expand both sides', math: `${180 * q}x − ${cx(q)}x² = ${90 * p}x − ${cx(p)}x²` },
      { say: 'Bring everything to one side', math: `${cx(A)}x² − ${B}x = 0` },
      { say: `Factor out ${g === 1 ? 'x' : `${g}x`}`, math: `${g === 1 ? 'x' : `${g}x`}(${inner}) = 0` },
      { say: 'Set each factor to 0', math: `x = 0  or  x = ${fmt(a)}` },
      { say: 'An angle of 0° is not an angle, so 0 is rejected', math: `x = ${fmt(a)}` },
    ],
  };
}

// ---------------------------------------------------------------------------
// assembling
// ---------------------------------------------------------------------------

function buildItem(drawn, ask) {
  const spec = ASKS[ask];
  if (!spec) return null;
  const v = drawn.values;
  const value = spec.value(v);
  if (!isMeasure(value) || !isHalf(value)) return null;

  const setup = {
    id: 'setup', type: 'equation', optional: true,
    label: 'Set up the equation',
    prompt: 'Set up the equation (skippable on a card, required in a boss)',
    var: 'x', canonical: drawn.canonical, text: drawn.text,
    roots: drawn.roots.map(fmt), mustMention: drawn.mustMention,
    alternates: drawn.alternates ?? [],
    means: 'x = the angle',
  };

  const rootsPart = {
    id: 'x', type: 'roots', var: 'x', label: 'x =',
    answer: drawn.roots.map(fmt),
    poly: drawn.canonical,
    note: drawn.bothValid
      ? 'both roots are valid — the two angles are each other’s complement'
      : 'one of these two roots is not an angle',
  };

  const rejectPart = {
    id: 'keep', type: 'reject', of: 'x',
    valid: drawn.valid.map(fmt),
    rejected: drawn.rejected.map(fmt),
    reason: drawn.reason,
    reasonKey: drawn.reasonKey,
    askReject: true,
    distractors: drawn.reasonDistractors.slice(),
  };

  const distractors = {};
  for (const n of spec.names) {
    const val = v[n];
    if (val === undefined || !isMeasure(val) || !isHalf(val)) continue;
    if (Math.abs(val - value) < 1e-9) continue;
    distractors[n] = fmt(val);
  }
  const answerPart = {
    id: 'answer', type: 'num', of: 'x', label: spec.label,
    answer: fmt(value), asks: spec.asks, distractors,
  };
  if (drawn.shape === 'ratio' && ask === 'angle') {
    answerPart.bonus = [
      { key: 'comp', label: 'complement =', answer: fmt(v.comp) },
      { key: 'supp', label: 'supplement =', answer: fmt(v.supp) },
    ];
  }

  // ---- misconceptions ----------------------------------------------------
  const misconceptions = [];
  if (drawn.bothValid) {
    misconceptions.push({
      part: 'x', answer: fmt(drawn.roots[0]), tag: 'forgot-second-root',
      msg: 'There is a second root — the quadratic factors into two brackets, and each one gives an angle.',
    });
    misconceptions.push({
      part: 'keep', answer: fmt(drawn.roots[1]), tag: 'rejected-valid-root',
      msg: `Both roots are angles between 0° and 90°: ${deg(v.smaller)} and ${deg(v.larger)} are each other's complement.`,
    });
  } else {
    misconceptions.push({
      part: 'x', answer: fmt(drawn.values.angle), tag: 'forgot-second-root',
      msg: 'Dividing both sides by x throws away a root — factor instead and set BOTH factors to 0.',
    });
  }
  if (spec.asks.length > 1) {
    const other = spec.asks[0] === 'smaller' ? v.larger : v.smaller;
    if (other !== undefined && isMeasure(supp(other)) && Math.abs(supp(other) - value) > 1e-9) {
      misconceptions.push({
        part: 'answer', answer: fmt(supp(other)), tag: spec.asks[0] === 'smaller' ? 'gave-larger' : 'gave-smaller',
        msg: `That is the supplement of the other root. The question names the ${spec.asks[0]} angle, ${deg(spec.asks[0] === 'smaller' ? v.smaller : v.larger)}.`,
      });
    }
    if (isMeasure(comp(v[spec.asks[0]] ?? v.angle))) {
      const wrong = comp(v[spec.asks[0]] ?? v.angle);
      if (Math.abs(wrong - value) > 1e-9 && !Object.values(distractors).includes(fmt(wrong))) {
        misconceptions.push({
          part: 'answer', answer: fmt(wrong), tag: 'used-90-for-supp',
          msg: 'Supplementary angles add to 180 — subtract from 180, not 90.',
        });
      }
    }
  }

  const solution = [...drawn.steps];
  let cur = spec.asks[0] === 'smaller' ? v.smaller : spec.asks[0] === 'larger' ? v.larger : v.angle;
  if (spec.asks[0] === 'smaller' || spec.asks[0] === 'larger') {
    solution.push({ say: `The ${spec.asks[0]} angle`, math: deg(cur) });
  }
  for (const step of spec.asks.slice(1)) {
    const next = step === 'comp' ? comp(cur) : supp(cur);
    solution.push({ say: step === 'comp' ? 'Its complement' : 'Its supplement', math: `${step === 'comp' ? 90 : 180} − ${fmt(cur)} = ${fmt(next)}` });
    cur = next;
  }
  if (spec.asks.length === 1 && spec.asks[0] !== 'smaller' && spec.asks[0] !== 'larger') {
    if (spec.asks[0] === 'comp') solution.push({ say: 'Its complement', math: `90 − ${fmt(v.angle)} = ${fmt(v.comp)}` });
    if (spec.asks[0] === 'supp') solution.push({ say: 'Its supplement', math: `180 − ${fmt(v.angle)} = ${fmt(v.supp)}` });
  }
  solution.push({ say: 'Which is what the question asks for', math: deg(value) });

  return {
    prompt: `${drawn.statement} ${spec.q}`,
    parts: [setup, rootsPart, rejectPart, answerPart],
    answer: deg(value),
    hints: drawn.hints,
    solution,
    misconceptions,
    tier: 3,
    par: 240,
    meta: { shape: drawn.shape, bothValid: drawn.bothValid, ask, values: v, roots: drawn.roots.slice(), p: drawn.p ?? null, q: drawn.q ?? null, P: drawn.P ?? null },
  };
}

/** S2's coin flip only stays fair if a rejected draw retries the SAME shape (the two shapes reject at
 *  different rates), so the shape is chosen once and the parameters are re-drawn inside it. */
function drawShape(rng, bothValid) {
  for (let i = 0; i < 25; i++) {
    const drawn = bothValid ? drawProduct(rng) : drawRatio(rng);
    if (drawn) return drawn;
  }
  return null;
}

function draw(rng, params, api) {
  const bothValid = params.shape ? params.shape === 'product' : rng.chance(0.5);
  const drawn = drawShape(rng, bothValid);
  if (!drawn) return api.reject();
  const asks = params.ask && drawn.asks.includes(params.ask) ? [params.ask] : drawn.asks;
  const ask = asks.length === 1 ? asks[0] : rng.pick(asks);
  const item = buildItem(drawn, ask);
  if (!item) return api.reject();
  return item;
}

/** the fixed exemplar (S2): wp-12's own numbers — x(90 − x) = 344, roots 86 and 4, supplement of the smaller. */
function exemplar() {
  const drawn = {
    shape: 'product', bothValid: true, P: 344,
    statement: 'The product of an angle and its complement is 344.',
    canonical: 'x(90-x)-344', text: 'x(90 − x) = 344', mustMention: [90],
    roots: [86, 4], valid: [86, 4], rejected: [],
    reason: 'both valid', reasonKey: 'both-valid',
    reasonDistractors: ['4 is too small to be an angle', '86 is obtuse, so reject it', 'neither value satisfies the equation'],
    values: { smaller: 4, larger: 86, angle: 4, comp: 86, supp: 176 },
    asks: PRODUCT_ASKS, alternates: [],
    hints: [
      'Complement = 90 − x. "The product of" means multiply: x(90 − x) = 344 — a quadratic, so expect two roots.',
      'Set up: x(90 − x) = 344 → 90x − x² = 344 → 0 = x² − 90x + 344. Factor: two numbers with product 344 and sum −90.',
      'Two numbers multiply to 344 and add to 90 — those are the roots. Then read the question again: an angle and its complement are BOTH legal angles here.',
    ],
    steps: [
      { say: 'Let x be the angle; its complement is 90 − x', math: 'angle = x,  comp = 90 − x' },
      { say: 'Their product IS 344', math: 'x(90 − x) = 344' },
      { say: 'Distribute', math: '90x − x² = 344' },
      { say: 'Move everything to one side so the x² term is positive', math: '0 = x² − 90x + 344' },
      { say: 'Factor: −86 and −4 multiply to 344 and add to −90', math: '0 = (x − 86)(x − 4)' },
      { say: 'Set each factor to 0', math: 'x = 86  or  x = 4' },
      { say: 'Both work: 86 and 4 are complements of each other', math: '86 × 4 = 344' },
    ],
  };
  return buildItem(drawn, 'supp-of-smaller');
}

/** verify — re-solve the emitted quadratic and re-check every root, verdict and measure. */
function verify(item) {
  const out = [];
  const setup = item.parts.find((p) => p.type === 'equation');
  const rootsPart = item.parts.find((p) => p.type === 'roots');
  const rejectPart = item.parts.find((p) => p.type === 'reject');
  const answer = item.parts.find((p) => p.id === 'answer');
  if (!setup || !rootsPart || !rejectPart || !answer) { out.push('the rootcase chain is incomplete'); return out; }

  const claimed = item.meta.roots.slice().sort((a, b) => a - b);
  const got = solveEmitted(setup.canonical, 'x');
  if (!got || got.length !== 2) { out.push(`the emitted equation ${setup.canonical} does not have two roots`); return out; }
  if (got.some((g, i) => Math.abs(g - claimed[i]) > 1e-9)) {
    out.push(`solver got [${got.map(fmt).join(', ')}] but the item claims [${claimed.map(fmt).join(', ')}]`);
  }
  if (rootsPart.answer.length !== 2) out.push('the roots part does not list two roots');
  const valid = rejectPart.valid.map(Number);
  const rejected = rejectPart.rejected.map(Number);
  if (valid.length + rejected.length !== 2) out.push('keep + reject does not cover both roots');
  for (const r of valid) if (!isAcute(r)) out.push(`${fmt(r)} is kept but is not an angle in (0, 90)`);
  for (const r of rejected) if (isAcute(r)) out.push(`${fmt(r)} is rejected but is a legal angle`);
  if (item.meta.bothValid !== (rejected.length === 0)) out.push('bothValid disagrees with the reject stage');

  const v = item.meta.values;
  for (const [name, val] of Object.entries(v)) {
    if (!isMeasure(val) || !isHalf(val)) out.push(`${name} = ${fmt(val)} is not a measure`);
  }
  if (item.meta.shape === 'product') {
    if (Math.abs(v.smaller + v.larger - 90) > 1e-9) out.push('the two roots are not complementary');
    if (Math.abs(v.smaller * v.larger - item.meta.P) > 1e-9) out.push('the two roots do not multiply to P');
  } else {
    const { p, q } = item.meta;
    const lhsProd = v.angle * supp(v.angle);
    const rhsProd = v.angle * comp(v.angle);
    if (Math.abs(lhsProd * q - rhsProd * p) > 1e-9) out.push('the two products are not in the stated ratio');
  }
  if (!isMeasure(Number(answer.answer)) || !isHalf(Number(answer.answer))) out.push('the answer is not a measure');
  return out;
}

export const gen = makeGen(TEMPLATE, draw, {
  version: VERSION,
  skills: ['CS-QUAD'],
  needs: ['QUAD-SOLVE'],       // the rootcase chain is only fair once factoring/solving is up (S6 `needs`)
  tier: 3,
  par: 240,
  module: 'M5',
  sheet: 'WP',
  exemplar,
  verify,
});

export default gen;
