// classify.js — T-classify (T07c; M1, skill CLASS, sheet VOC).
// COMPOSED S2 §0 row: "acute/right/obtuse/straight (skill CLASS) | cls-01..04 + `T-classify`
// (**6 measures incl. exactly one 90 and one 180**) | M1 | `classify` | bucket".
//
// One item = one six-measure set, six `classify` parts (one tap each, BLITZ-sized). The set always
// contains EXACTLY one 90° (right) and EXACTLY one 180° (straight); the other four split between
// acute and obtuse with at least one of each, and at least one of them sits near a boundary
// (89 / 91 / 179 / 1) so "less than 90" versus "90" is actually tested. All six measures are
// distinct and every one lies in (0, 180].
//
// Each part carries `measure` AND `answer`; js/grader/classify.js's `validate()` checks they agree,
// and a wrong pick is answered with the RULE of the bucket the student picked (never the answer).
//
// DOM-free, no Math.random.

import { seedTag } from '../rng.js';

export const BUCKETS = Object.freeze(['acute', 'right', 'obtuse', 'straight']);

const LETTERS = Object.freeze('ABCDEFGHJKLMNPQRSTUVWXYZ'.split('')); // no I, no O

const RULES = Object.freeze({
  acute: 'less than 90°',
  right: 'exactly 90°',
  obtuse: 'more than 90° but less than 180°',
  straight: 'exactly 180°',
});

/** Measures that make the 90 / 180 boundaries bite. */
const NEAR_ACUTE = Object.freeze([88, 89, 85, 45, 1, 2]);
const NEAR_OBTUSE = Object.freeze([91, 92, 95, 135, 178, 179]);

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

function bucketOf(m) {
  if (m < 90) return 'acute';
  if (m === 90) return 'right';
  if (m < 180) return 'obtuse';
  return 'straight';
}

/** A fresh angle name ∠XVY with a distinct vertex per part. */
function angleNames(rng, n) {
  const out = [];
  const used = new Set();
  let guard = 0;
  while (out.length < n && guard++ < 200) {
    const [a, v, b] = pickN(rng, LETTERS, 3);
    const key = `${a}${v}${b}`;
    if (used.has(key) || used.has(`${b}${v}${a}`)) continue;
    used.add(key);
    out.push([a, v, b]);
  }
  while (out.length < n) out.push(['A', 'B', 'C']);   // unreachable in practice; keeps the shape
  return out;
}

const FALLBACK = Object.freeze([31, 90, 121, 180, 89, 134]);

/** Draw the six measures: exactly one 90, exactly one 180, ≥ 1 acute, ≥ 1 obtuse, all distinct. */
function drawMeasures(rng) {
  const acuteCount = rng.int(1, 3);          // 1..3 acute, the rest obtuse (4 slots to share)
  const obtuseCount = 4 - acuteCount;
  const set = new Set([90, 180]);
  const acutes = [];
  const obtuses = [];

  // at least one near-boundary measure so 89 vs 90 and 179 vs 180 are actually tested
  const nearAcute = rng.chance(0.6);
  if (nearAcute && acuteCount > 0) acutes.push(rng.pick(NEAR_ACUTE));
  else if (obtuseCount > 0) obtuses.push(rng.pick(NEAR_OBTUSE));

  let guard = 0;
  while ((acutes.length < acuteCount || obtuses.length < obtuseCount) && guard++ < 300) {
    if (acutes.length < acuteCount) {
      const m = rng.int(1, 89);
      if (!set.has(m) && !acutes.includes(m)) { acutes.push(m); set.add(m); }
    }
    if (obtuses.length < obtuseCount) {
      const m = rng.int(91, 179);
      if (!set.has(m) && !obtuses.includes(m)) { obtuses.push(m); set.add(m); }
    }
  }
  const all = [90, 180, ...acutes.slice(0, acuteCount), ...obtuses.slice(0, obtuseCount)];
  if (new Set(all).size !== 6) return null;
  if (!all.every((m) => m > 0 && m <= 180)) return null;
  if (all.filter((m) => m === 90).length !== 1) return null;
  if (all.filter((m) => m === 180).length !== 1) return null;
  if (!all.some((m) => m < 90) || !all.some((m) => m > 90 && m < 180)) return null;
  return rng.shuffle(all);
}

export function build(rng, opts = {}) {
  let measures = null;
  while (rng.draws < 200 && !measures) measures = drawMeasures(rng);
  if (!measures) measures = FALLBACK.slice();
  return assemble(rng, measures, opts);
}

function assemble(rng, measures, opts) {
  const names = angleNames(rng, measures.length);
  const parts = measures.map((m, i) => {
    const [a, v, b] = names[i];
    return {
      id: `c${i + 1}`,
      type: 'classify',
      prompt: `{m ${a}${v}${b}} = ${m}° — classify {ang ${a}${v}${b}}.`,
      measure: m,
      answer: bucketOf(m),
      options: BUCKETS.slice(),
    };
  });

  const stem = 'Classify each angle: acute, right, obtuse or straight.';
  const right = parts.find((p) => p.answer === 'right');
  const straight = parts.find((p) => p.answer === 'straight');

  // The boundary slips, tagged with the catalogue's own boundary tags.
  const misconceptions = [
    { part: right.id, answer: 'acute', tag: 'boundary-90', msg: 'Exactly 90° is a RIGHT angle — acute means strictly less than 90°.' },
    { part: right.id, answer: 'obtuse', tag: 'boundary-90', msg: 'Exactly 90° is a RIGHT angle — obtuse means strictly more than 90°.' },
    { part: straight.id, answer: 'obtuse', tag: 'boundary-180', msg: 'Exactly 180° is a STRAIGHT angle — obtuse stops just short of 180°.' },
  ];
  for (const p of parts) {
    if (p.answer === 'acute' && p.measure >= 85) {
      misconceptions.push({ part: p.id, answer: 'right', tag: 'boundary-90', msg: `${p.measure}° is close to a right angle but not equal to it — under 90° is acute.` });
    }
    if (p.answer === 'obtuse' && p.measure >= 175) {
      misconceptions.push({ part: p.id, answer: 'straight', tag: 'boundary-180', msg: `${p.measure}° is close to a straight angle but not equal to it — under 180° is obtuse.` });
    }
  }

  return {
    id: `T-classify#${seedTag(rng.seed)}`,
    template: 'T-classify',
    params: { measures: measures.slice(), buckets: parts.map((p) => p.answer) },
    prompt: stem,
    stem,
    figure: null,
    skills: ['CLASS'],
    tier: 1,
    par: 60,
    parts,
    answer: parts.map((p) => `${p.measure}° ${p.answer}`).join(' · '),
    hints: [
      'Every angle is compared with just two numbers: 90° and 180°.',
      `${RULES.acute} → acute · ${RULES.right} → right · ${RULES.obtuse} → obtuse · ${RULES.straight} → straight.`,
      'The two traps are the exact ones: 90° is right (not acute, not obtuse) and 180° is straight (not obtuse). Check those two first.',
    ],
    solution: [
      { say: 'The four buckets', math: `acute ${RULES.acute} · right ${RULES.right} · obtuse ${RULES.obtuse} · straight ${RULES.straight}` },
      ...parts.map((p) => ({ say: `${p.measure}°`, math: `${p.answer} — ${RULES[p.answer]}` })),
    ],
    misconceptions,
  };
}

export const templates = Object.freeze([
  Object.freeze({
    id: 'T-classify', version: 1, label: 'Classify six angles', module: 'M1', sheet: 'VOC',
    skills: ['CLASS'], tier: 1, par: 60, partTypes: ['classify'],
    gen: (rng, opts = {}) => build(rng, opts),
  }),
]);

export default templates;
