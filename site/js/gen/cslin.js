// cslin.js — `T-cs-lin` (COMPOSED S2: M4 Word Problems: Linear, skills CS-LIN; S8 #7a).
//
// The nine sentence frames S2 lists, each one the teacher's own sentence with the numbers swapped
// (content/SOURCE.md §1 and §3 are the wording authority — the frame comments name the original):
//
//   F1  supp = k + m·angle                       wp-01 · wp-07 ("The supplement of an angle less 8 is …")
//   F2  supp − k = m·comp                        wp-02
//   F3  angle + comp = k + ½·supp                wp-03   (the left side is always 90 — that IS the item)
//   F4  angle = k + m·comp                       wp-04
//   F5  m(angle − k) = n·comp − j                wp-13
//   F6  comp(angle + k) = ⅓(angle + supp)        wp-15   (the right side is always 60 — the second insight)
//   F7  difference of the supplements of two complementary angles     wp-09
//   F8  "one of two … angles is k less than ½ the other"              wp-06 · ang-02 · ang-03
//   F9  m·comp = k + n·(supp − comp)             ang-11  (supp − comp is always 90 — the third insight)
//   F10 ½(other − angle) = k                     wp-08   (the tenth teacher sentence: half a difference)
//
// (S2 names nine frames; F10 is wp-08's sentence, which none of the nine reproduces — it is drawn like
// any other frame and tested by the same harness.)
//
// Every item carries the S3 `equation` slot (required on CS-* Variants — S2 B4) plus the answer part.
// ask ∈ {angle, comp, supp, larger, supp-of-comp} (S2) and, because the teacher asks them too,
// {angle+comp, angle+supp, pair, smaller, supp-of-smaller, comp-of-smaller, supp-of-larger}.
//
// Answer-backward: the frame picks the angle FIRST and solves for the constant that makes the sentence
// true, so the answer is always an integer or a half. The emitted equation is then handed to poly.js
// (contract.js `solveEmitted`) and re-solved; a mismatch re-rolls the seed.
//
// Alternates: a student may name x differently ("let x be the complement"). Every frame builds its
// canonical from a function of the angle-expression, so the alternates are the SAME function applied to
// (90 − x) / (180 − x) — genuinely equivalent setups with their own roots and `mustMention`.
//
// tags:['used-90-for-supp','used-180-for-comp','confused-comp-supp','grouping','gave-larger','stopped-early']

import {
  makeGen, fmt, deg, comp, supp, isMeasure, isAcute, isHalf,
  timesWord, numWord, fractionWord, multiplyWord, squash, stripOuter, solveEmitted, linearForm,
} from './contract.js';

export const TEMPLATE = 'T-cs-lin';
export const VERSION = 1;

// ---------------------------------------------------------------------------
// text helpers
// ---------------------------------------------------------------------------

/** ASCII expression → the pretty form a student reads ("180-x-(10+9x)" → "180 − x − (10 + 9x)"). */
export function pretty(s) {
  return String(s)
    .replace(/\s+/g, '')
    .replace(/([0-9a-zA-Z)])-/g, '$1 − ')
    .replace(/([0-9a-zA-Z)])\+/g, '$1 + ')
    .replace(/-/g, '−')
    .replace(/\*/g, '·');
}

const capFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** one side of an equation, as a student reads it */
const side = (s) => pretty(stripOuter(s));
/** a sentence with the gaps a missing multiplier leaves, tidied */
const say = (s) => capFirst(squash(s));
/** a root as a wrong-setup note prints it ("that setup gives x = …") */
const givesText = (r) => (isHalf(r) ? fmt(r) : String(Math.round(r * 100) / 100));

/** a multiplier in front of a parenthesised phrase: 1 → "", 3 → "3" */
const coef = (m) => (m === 1 ? '' : fmt(m));

/** the two building blocks every frame writes its sentence with */
const REAL = { C: (X) => `(90-${X})`, S: (X) => `(180-${X})` };
/** the comp/supp mix-up: the same sentence with the two swapped (the equation trap) */
const SWAP = { C: (X) => `(180-${X})`, S: (X) => `(90-${X})` };

// ---------------------------------------------------------------------------
// the asks (S3 `num` chains / `multi` fields)
// ---------------------------------------------------------------------------

const ASKS = {
  angle: { kind: 'num', asks: ['angle'], label: 'angle =', q: 'What is the measure of the angle?', value: (v) => v.angle },
  comp: { kind: 'num', asks: ['comp'], label: 'complement =', q: 'What is the complement of the angle?', value: (v) => v.comp },
  supp: { kind: 'num', asks: ['supp'], label: 'supplement =', q: 'What is the supplement of the angle?', value: (v) => v.supp },
  'supp-of-comp': {
    kind: 'num', asks: ['comp', 'supp'], label: 'supplement of the complement =',
    q: 'What is the measure of the supplement of the complement of the angle?', value: (v) => supp(v.comp),
  },
  'angle+comp': {
    kind: 'multi', q: 'What is the measure of the angle and its complement?',
    fields: (v) => [
      { key: 'angle', label: 'angle =', answer: v.angle, asks: ['angle'], dist: ['comp', 'supp'] },
      { key: 'comp', label: 'complement =', answer: v.comp, asks: ['comp'], dist: ['angle', 'supp'] },
    ],
  },
  'angle+supp': {
    kind: 'multi', q: 'What is the measure of the angle and its supplement?',
    fields: (v) => [
      { key: 'angle', label: 'angle =', answer: v.angle, asks: ['angle'], dist: ['comp', 'supp'] },
      { key: 'supp', label: 'supplement =', answer: v.supp, asks: ['supp'], dist: ['angle', 'comp'] },
    ],
  },
  pair: {
    kind: 'multi', orderFree: true, needsPair: true, q: 'Find the measures of the two angles.',
    fields: (v) => [
      { key: 'a', label: 'one angle', answer: v.smaller, asks: ['smaller'], dist: ['larger'] },
      { key: 'b', label: 'the other angle', answer: v.larger, asks: ['larger'], dist: ['smaller'] },
    ],
  },
  larger: { kind: 'num', needsPair: true, asks: ['larger'], label: 'larger angle =', q: 'Find the measure of the larger angle.', value: (v) => v.larger },
  smaller: { kind: 'num', needsPair: true, asks: ['smaller'], label: 'smaller angle =', q: 'Find the measure of the smaller angle.', value: (v) => v.smaller },
  'supp-of-smaller': {
    kind: 'num', needsPair: true, asks: ['smaller', 'supp'], label: 'supplement of the smaller =',
    q: 'Find the supplement of the smaller angle.', value: (v) => supp(v.smaller),
  },
  'comp-of-smaller': {
    kind: 'num', needsPair: true, asks: ['smaller', 'comp'], label: 'complement of the smaller =',
    q: 'Find the complement of the smaller angle.', value: (v) => comp(v.smaller),
  },
  'supp-of-larger': {
    kind: 'num', needsPair: true, asks: ['larger', 'supp'], label: 'supplement of the larger =',
    q: 'Find the supplement of the larger angle.', value: (v) => supp(v.larger),
  },
};

const SINGLE_ASKS = ['angle', 'comp', 'supp', 'supp-of-comp', 'angle+comp', 'angle+supp'];

// ---------------------------------------------------------------------------
// the nine frames
// ---------------------------------------------------------------------------

/** draw an angle: integers, with halves about a quarter of the time */
function drawAngle(rng, min, max, { halves = true } = {}) {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  if (hi < lo) return null;
  const a = rng.int(lo, hi);
  if (halves && rng.chance(0.22) && a + 0.5 < max) return a + 0.5;
  return a;
}

const FRAMES = [
  {
    // F1 — wp-01 "The supplement of an angle is 10 more than nine times the angle." (and wp-07's "less" form)
    id: 'supp-k-m-angle', weight: 16, asks: SINGLE_ASKS,
    draw(rng) {
      const m = rng.int(1, 9);
      const a = drawAngle(rng, 4, 88);
      if (a === null) return null;
      const k = 180 - a * (m + 1);
      if (!Number.isInteger(k) || Math.abs(k) < 2 || Math.abs(k) > 140) return null;
      if (m === 1 && k <= 0) return null;
      const form = k > 0 ? rng.pick(['more', 'less-lhs']) : 'less';
      const kAbs = Math.abs(k);
      let statement;
      if (form === 'more') statement = `The supplement of an angle is ${fmt(kAbs)} more than ${timesWord(m)} the angle.`;
      else if (form === 'less') statement = `The supplement of an angle is ${fmt(kAbs)} less than ${timesWord(m)} the angle.`;
      else statement = `The supplement of an angle less ${fmt(kAbs)} is ${timesWord(m)} the angle.`;
      const lhs = (X, H) => (form === 'less-lhs' ? `${H.S(X)}-${kAbs}` : H.S(X));
      const rhs = (X) => {
        const mx = `${coef(m)}${X}`;
        if (form === 'more') return `${kAbs}+${mx}`;
        if (form === 'less') return `${mx}-${kAbs}`;
        return mx;
      };
      return {
        a, statement, lhs, rhs, uses: { comp: false, supp: true }, altSubs: ['comp', 'supp'],
        insight: 'The supplement of an angle is 180 − x. "Is" is the equals sign.',
        params: { m, k, form },
      };
    },
  },
  {
    // F2 — wp-02 "The supplement of an angle less 14 is three times the complement of the angle."
    id: 'supp-k-m-comp', weight: 12, asks: SINGLE_ASKS,
    draw(rng) {
      const m = rng.int(2, 6);
      const a = drawAngle(rng, 4, 88);
      if (a === null) return null;
      const k = (180 - a) - m * (90 - a);
      if (!Number.isInteger(k) || Math.abs(k) < 2 || Math.abs(k) > 140) return null;
      const more = k < 0;                       // supp + |k| = m·comp
      const kAbs = Math.abs(k);
      const statement = more
        ? `The supplement of an angle plus ${fmt(kAbs)} is ${timesWord(m)} the complement of the angle.`
        : `The supplement of an angle less ${fmt(kAbs)} is ${timesWord(m)} the complement of the angle.`;
      const lhs = (X, H) => `${H.S(X)}${more ? '+' : '-'}${kAbs}`;
      const rhs = (X, H) => `${coef(m)}${H.C(X)}`;
      return {
        a, statement, lhs, rhs, uses: { comp: true, supp: true }, altSubs: ['comp', 'supp'],
        insight: 'Write both first: the complement is 90 − x and the supplement is 180 − x.',
        params: { m, k },
      };
    },
  },
  {
    // F3 — wp-03 "An angle plus its complement is 6 more than half of the supplement of the angle."
    id: 'angle-plus-comp', weight: 10, asks: SINGLE_ASKS,
    draw(rng) {
      const d = rng.pick([2, 2, 3]);
      const a = drawAngle(rng, 4, 88, { halves: false });
      if (a === null) return null;
      if (d === 3 && a % 3 !== 0) return null;
      const k = 90 - (180 - a) / d;
      if (!isHalf(k) || k < 2 || k > 80) return null;
      const statement = `An angle plus its complement is ${fmt(k)} more than ${fractionWord(d)} of the supplement of the angle.`;
      const lhs = (X, H) => `${X}+${H.C(X)}`;
      const rhs = (X, H) => `${fmt(k)}+${H.S(X)}/${d}`;
      return {
        a, statement, lhs, rhs, uses: { comp: true, supp: true }, altSubs: ['comp', 'supp'],
        insight: 'An angle plus its complement is always 90 — the whole left side collapses to a number.',
        params: { d, k },
      };
    },
  },
  {
    // F4 — wp-04 "The measure of an angle is 6 more than twice the measure of its complement."
    id: 'angle-k-m-comp', weight: 12,
    asks: [...SINGLE_ASKS, 'larger', 'smaller'],
    askText: { larger: 'Find the larger of these two angles.', smaller: 'Find the smaller of these two angles.' },
    draw(rng) {
      const m = rng.int(1, 5);
      const a = drawAngle(rng, 4, 88);
      if (a === null) return null;
      if (a === 45) return null;                          // the angle and its complement would tie
      const k = a * (1 + m) - 90 * m;
      if (!Number.isInteger(k) || Math.abs(k) < 2 || Math.abs(k) > 140) return null;
      const kAbs = Math.abs(k);
      const statement = `The measure of an angle is ${fmt(kAbs)} ${k > 0 ? 'more' : 'less'} than ${timesWord(m)} the measure of its complement.`;
      const lhs = (X) => X;
      const rhs = (X, H) => {
        const mc = `${coef(m)}${H.C(X)}`;
        return k > 0 ? `${kAbs}+${mc}` : `${mc}-${kAbs}`;
      };
      return {
        a, statement, lhs, rhs, uses: { comp: true, supp: false }, altSubs: ['comp', 'supp'],
        pair: { kind: 'angle-comp', of: (v) => [v.angle, v.comp] },
        insight: 'The two angles in this sentence are the angle (x) and its complement (90 − x).',
        params: { m, k },
      };
    },
  },
  {
    // F5 — wp-13 "Three times the difference between an angle and 5 is ten less than double the complement."
    id: 'm-diff-n-comp', weight: 12, asks: SINGLE_ASKS,
    draw(rng) {
      const m = rng.int(2, 5);
      const n = rng.int(2, 4);
      const k = rng.int(2, 25);
      const a = drawAngle(rng, k + 3, 88, { halves: false });
      if (a === null) return null;
      const j = n * (90 - a) - m * (a - k);
      if (!Number.isInteger(j) || Math.abs(j) < 2 || Math.abs(j) > 140) return null;
      const jAbs = Math.abs(j);
      const jWord = jAbs <= 12 ? numWord(jAbs) : fmt(jAbs);
      const statement = `${capFirst(timesWord(m))} the difference between an angle and ${fmt(k)} is ${jWord} ${j > 0 ? 'less' : 'more'} than ${multiplyWord(n)} the complement of the angle.`;
      const lhs = (X) => `${coef(m)}(${X}-${k})`;
      const rhs = (X, H) => {
        const nc = `${coef(n)}${H.C(X)}`;
        return j > 0 ? `${nc}-${jAbs}` : `${nc}+${jAbs}`;
      };
      return {
        a, statement, lhs, rhs, uses: { comp: true, supp: false }, altSubs: ['comp', 'supp'],
        insight: '"The difference between an angle and 5" is (x − 5) — the whole phrase gets multiplied.',
        trap: {
          lhs: (X) => `${coef(m)}${X}-${k}`, rhs, tag: 'grouping',
          msg: `${capFirst(timesWord(m))} the DIFFERENCE means ${coef(m) || ''}(x − ${fmt(k)}) — the ${fmt(k)} is inside the parentheses.`,
        },
        params: { m, n, k, j },
      };
    },
  },
  {
    // F6 — wp-15 "The complement of two more than an angle is one-third of the sum of the angle and its supplement."
    id: 'comp-of-shifted', weight: 10, asks: SINGLE_ASKS,
    draw(rng) {
      const d = rng.pick([3, 3, 4]);
      const a = drawAngle(rng, 4, 88);
      if (a === null) return null;
      const k = 90 - a - 180 / d;
      if (!isHalf(k) || Math.abs(k) < 1 || Math.abs(k) > 70) return null;
      if (a + k <= 0 || a + k >= 90) return null;          // the shifted angle must still have a complement
      const kAbs = Math.abs(k);
      const statement = k > 0
        ? `The complement of ${fmt(kAbs)} more than an angle is ${fractionWord(d)} of the sum of the angle and its supplement.`
        : `The complement of an angle less ${fmt(kAbs)} is ${fractionWord(d)} of the sum of the angle and its supplement.`;
      const lhs = (X, H) => H.C(`(${X}${k > 0 ? '+' : '-'}${kAbs})`);
      const rhs = (X, H) => `(${X}+${H.S(X)})/${d}`;
      return {
        a, statement, lhs, rhs, uses: { comp: true, supp: true }, altSubs: ['comp', 'supp'],
        insight: 'An angle plus its supplement is always 180, so the right-hand side is just a number.',
        params: { d, k },
      };
    },
  },
  {
    // F7 — wp-09 "The difference between the supplements of two complementary angles is 24."
    id: 'diff-of-supps', weight: 8, asks: ['pair', 'larger', 'smaller'],
    draw(rng) {
      const D = rng.int(3, 86);
      const a = (90 - D) / 2;                              // x = the smaller angle, as in the teacher's key
      if (!isAcute(a) || !isHalf(a) || a >= 45) return null;
      const statement = `The difference between the supplements of two complementary angles is ${fmt(D)}.`;
      const lhs = (X, H) => `${H.S(X)}-${H.S(H.C(X))}`;
      const rhs = () => `${D}`;
      return {
        a, statement, lhs, rhs, uses: { comp: true, supp: true }, altSubs: ['other-comp'],
        pair: { kind: 'comp', of: (v) => [v.angle, comp(v.angle)] },
        insight: 'Call the angles x and 90 − x; their supplements are 180 − x and 180 − (90 − x).',
        params: { D },
      };
    },
  },
  {
    // F8 — wp-06 / ang-02 / ang-03 "One of two complementary angles is 6 less than one-half the other."
    id: 'one-of-two', weight: 12,
    asks: ['pair', 'larger', 'smaller', 'supp-of-smaller', 'comp-of-smaller', 'supp-of-larger'],
    draw(rng) {
      const relation = rng.chance(0.5) ? 'comp' : 'supp';
      const T = relation === 'comp' ? 90 : 180;
      const [p, q] = rng.pick([[1, 2], [1, 2], [1, 1], [2, 1], [3, 1], [1, 3]]);
      const a = drawAngle(rng, 3, 88, { halves: false });
      if (a === null) return null;
      const other = T - a;
      if (!isMeasure(other)) return null;
      const raw = a - (p * other) / q;                     // + → "more than", − → "less than"
      if (!isHalf(raw)) return null;
      const kAbs = Math.abs(raw);
      if (kAbs > 120) return null;
      if (kAbs === 0 && p === q) return null;              // "one is the other" is not a problem
      if (kAbs !== 0 && kAbs < 2) return null;
      if (a === other) return null;                        // no smaller / larger
      const share = p === q ? '' : (p === 1 ? `${fractionWord(q)} ` : `${timesWord(p)} `);
      const phrase = kAbs === 0
        ? `${share}the other`
        : `${fmt(kAbs)} ${raw > 0 ? 'more' : 'less'} than ${share}the other`;
      const statement = `One of two ${relation === 'comp' ? 'complementary' : 'supplementary'} angles is ${phrase}.`;
      const lhs = (X) => X;
      const rhs = (X, H) => {
        const otherX = relation === 'comp' ? H.C(X) : H.S(X);
        const scaled = q === 1 ? `${coef(p)}${otherX}` : `${coef(p)}${otherX}/${q}`;
        if (kAbs === 0) return scaled;
        return raw > 0 ? `${scaled}+${fmt(kAbs)}` : `${scaled}-${fmt(kAbs)}`;
      };
      return {
        a, statement, lhs, rhs,
        // the supplement of one of two SUPPLEMENTARY angles is just the other one — never ask that
        asks: relation === 'comp'
          ? ['pair', 'larger', 'smaller', 'supp-of-smaller', 'supp-of-larger']
          : ['pair', 'larger', 'smaller', 'comp-of-smaller'],
        uses: { comp: relation === 'comp', supp: relation === 'supp' },
        altSubs: [relation === 'comp' ? 'other-comp' : 'other-supp'],
        pair: { kind: relation, of: (v) => [v.angle, T - v.angle] },
        insight: relation === 'comp'
          ? 'Complementary angles add to 90, so call them x and 90 − x.'
          : 'Supplementary angles add to 180, so call them x and 180 − x.',
        params: { relation, p, q, k: raw },
      };
    },
  },
  {
    // F9 — ang-11 "Four times the complement of an angle is 12 more than twice the difference
    //      between the supplement and the complement."
    id: 'nested-difference', weight: 8, asks: SINGLE_ASKS,
    draw(rng) {
      const m = rng.int(2, 6);
      const n = rng.int(1, 3);
      const a = drawAngle(rng, 4, 88);
      if (a === null) return null;
      const k = m * (90 - a) - 90 * n;
      if (!Number.isInteger(k) || Math.abs(k) < 2 || Math.abs(k) > 150) return null;
      const kAbs = Math.abs(k);
      const statement = `${capFirst(timesWord(m))} the complement of an angle is ${fmt(kAbs)} ${k > 0 ? 'more' : 'less'} than ${multiplyWord(n)} the difference between the supplement of the angle and its complement.`;
      const lhs = (X, H) => `${coef(m)}${H.C(X)}`;
      const rhs = (X, H) => {
        const diff = `${coef(n)}(${H.S(X)}-${H.C(X)})`;
        return k > 0 ? `${kAbs}+${diff}` : `${diff}-${kAbs}`;
      };
      return {
        a, statement, lhs, rhs, uses: { comp: true, supp: true }, altSubs: ['comp', 'supp'],
        insight: 'The supplement minus the complement is (180 − x) − (90 − x) = 90 for every angle.',
        params: { m, n, k },
      };
    },
  },
  {
    // F10 — wp-08 "Half of the difference between two supplementary angles is 3.5."
    id: 'half-difference', weight: 8,
    asks: ['pair', 'larger', 'smaller', 'comp-of-smaller', 'supp-of-smaller', 'supp-of-larger'],
    draw(rng) {
      const relation = rng.chance(0.6) ? 'supp' : 'comp';
      const T = relation === 'comp' ? 90 : 180;
      const a = drawAngle(rng, 3, relation === 'comp' ? 43 : 87);   // x = the smaller of the two
      if (a === null) return null;
      const other = T - a;
      if (!isMeasure(other) || a >= other) return null;
      const k = (other - a) / 2;
      if (!isHalf(k) || k < 1) return null;
      const statement = `Half of the difference between two ${relation === 'comp' ? 'complementary' : 'supplementary'} angles is ${fmt(k)}.`;
      const lhs = (X, H) => `(${relation === 'comp' ? H.C(X) : H.S(X)}-${X})/2`;
      const rhs = () => fmt(k);
      return {
        a, statement, lhs, rhs,
        asks: relation === 'comp'
          ? ['pair', 'larger', 'smaller', 'supp-of-smaller', 'supp-of-larger']
          : ['pair', 'larger', 'smaller', 'comp-of-smaller'],
        uses: { comp: relation === 'comp', supp: relation === 'supp' },
        altSubs: [relation === 'comp' ? 'other-comp' : 'other-supp'],
        pair: { kind: relation, of: (v) => [v.angle, T - v.angle] },
        insight: relation === 'comp'
          ? 'Complementary angles add to 90, so call them x and 90 − x — their difference is 90 − 2x.'
          : 'Supplementary angles add to 180, so call them x and 180 − x — their difference is 180 − 2x.',
        params: { relation, k },
      };
    },
  },
];

const FRAME_BY_ID = new Map(FRAMES.map((f) => [f.id, f]));

// ---------------------------------------------------------------------------
// assembling an item
// ---------------------------------------------------------------------------

const SUB_TEXT = {
  comp: { X: '(90-x)', root: (a) => comp(a), means: 'x = the complement (the angle is then 90 − x)' },
  supp: { X: '(180-x)', root: (a) => supp(a), means: 'x = the supplement (the angle is then 180 − x)' },
  'other-comp': { X: '(90-x)', root: (a) => comp(a), means: 'x = the other angle of the pair' },
  'other-supp': { X: '(180-x)', root: (a) => supp(a), means: 'x = the other angle of the pair' },
};

/** which of 180 / 90 a setup must still show (S3 `mustMention`) */
function mustMention(uses) {
  const out = [];
  if (uses.supp) out.push(180);
  if (uses.comp) out.push(90);
  return out.length ? out : [90];
}

/** the numbers a substituted canonical shows (its own mustMention) */
function mentionedIn(canonical) {
  const out = [];
  if (/(^|[^0-9])180([^0-9]|$)/.test(canonical)) out.push(180);
  if (/(^|[^0-9])90([^0-9]|$)/.test(canonical)) out.push(90);
  return out.length ? out : [90];
}

function buildItem(frame, drawn, ask) {
  const a = drawn.a;
  const v = { angle: a, comp: comp(a), supp: supp(a) };
  if (drawn.pair) {
    const [p1, p2] = drawn.pair.of(v);
    v.smaller = Math.min(p1, p2);
    v.larger = Math.max(p1, p2);
  }
  const spec = ASKS[ask];
  if (!spec) return null;
  if (spec.needsPair && (v.smaller === undefined || v.smaller === v.larger)) return null;

  const canonical = `(${drawn.lhs('x', REAL)})-(${drawn.rhs('x', REAL)})`;
  const text = `${side(drawn.lhs('x', REAL))} = ${side(drawn.rhs('x', REAL))}`;
  const question = (frame.askText && frame.askText[ask]) || spec.q;
  const prompt = squash(`${say(drawn.statement)} ${question}`);

  // ---- the equation part (required on every CS-* Variant — S2 B4) ---------
  const alternates = [];
  for (const sub of drawn.altSubs ?? []) {
    const s = SUB_TEXT[sub];
    if (!s) continue;
    const altCanon = `(${drawn.lhs(s.X, REAL)})-(${drawn.rhs(s.X, REAL)})`;
    const root = s.root(a);
    if (!isMeasure(root) || !isHalf(root)) continue;
    const got = solveEmitted(altCanon, 'x');
    if (!got || got.length !== 1 || Math.abs(got[0] - root) > 1e-9) continue;
    alternates.push({
      canonical: altCanon, mustMention: mentionedIn(altCanon), roots: [fmt(root)],
      means: s.means, text: `${side(drawn.lhs(s.X, REAL))} = ${side(drawn.rhs(s.X, REAL))}`,
    });
  }

  const setup = {
    id: 'setup', type: 'equation', optional: true,
    label: 'Set up the equation',
    prompt: 'Set up the equation (skippable on a card, required in a boss)',
    var: 'x', canonical, mustMention: mustMention(drawn.uses), roots: [fmt(a)], text,
    alternates,
    means: 'x = the angle the sentence is about',
    // NOTE: `misconceptions` is only set below when there is at least one trap — an empty array on a
    // part shadows the item-level list inside the graders (num.js `misconceptionsOf`).
  };

  // ---- equation traps ----------------------------------------------------
  const traps = [];
  const addTrap = (lhs, rhs, tag, msg) => {
    const canon = `(${lhs})-(${rhs})`;
    const got = solveEmitted(canon, 'x');
    if (!got || got.length !== 1) return;
    const root = got[0];
    if (Math.abs(root - a) < 1e-9) return;
    if (!Number.isFinite(root) || Math.abs(root) > 1e4) return;
    traps.push({ canonical: canon, text: `${side(lhs)} = ${side(rhs)}`, root, tag, msg });
  };
  {
    const swapLhs = drawn.lhs('x', SWAP);
    const swapRhs = drawn.rhs('x', SWAP);
    if (`(${swapLhs})-(${swapRhs})` !== canonical) {
      const tag = drawn.uses.supp && !drawn.uses.comp ? 'used-90-for-supp'
        : (drawn.uses.comp && !drawn.uses.supp ? 'used-180-for-comp' : 'confused-comp-supp');
      const msg = drawn.uses.supp && !drawn.uses.comp
        ? '90 − x is the complement. The sentence says supplement, so that side is 180 − x.'
        : (drawn.uses.comp && !drawn.uses.supp
          ? '180 − x is the supplement. The sentence says complement, so that side is 90 − x.'
          : 'The complement is 90 − x and the supplement is 180 − x — this setup has them the other way round.');
      addTrap(swapLhs, swapRhs, tag, msg);
    }
  }
  if (drawn.trap) {
    addTrap(drawn.trap.lhs('x', REAL), drawn.trap.rhs('x', REAL), drawn.trap.tag, drawn.trap.msg);
  }
  if (traps.length) {
    setup.misconceptions = traps.map((t) => ({ part: 'setup', answer: t.text, tag: t.tag, msg: t.msg, gives: givesText(t.root) }));
  }

  // ---- the answer part ----------------------------------------------------
  const distNames = ['angle', 'comp', 'supp', 'smaller', 'larger'];
  const distractorsFor = (answerValue, names) => {
    const out = {};
    for (const n of names) {
      const val = v[n];
      if (val === undefined || !isMeasure(val) || !isHalf(val)) continue;
      if (Math.abs(val - answerValue) < 1e-9) continue;
      out[n] = fmt(val);
    }
    return out;
  };

  let answerPart;
  let answerText;
  const misconceptions = [];
  if (spec.kind === 'multi') {
    const fields = spec.fields(v).map((f) => ({
      key: f.key, label: f.label, answer: fmt(f.answer), asks: f.asks,
      distractors: distractorsFor(f.answer, f.dist),
    }));
    if (fields.some((f) => !isMeasure(Number(f.answer)) || !isHalf(Number(f.answer)))) return null;
    answerPart = { id: 'answer', type: 'multi', ...(spec.orderFree ? { orderFree: true } : {}), prompt: question, fields };
    answerText = fields.map((f) => deg(Number(f.answer))).join(' and ');
  } else {
    const value = spec.value(v);
    if (!isMeasure(value) || !isHalf(value)) return null;
    const names = spec.needsPair ? ['smaller', 'larger'] : distNames;
    answerPart = {
      id: 'answer', type: 'num', label: spec.label, answer: fmt(value),
      asks: spec.asks, distractors: distractorsFor(value, names),
    };
    answerText = deg(value);
    // the miss the chain machinery cannot name on its own
    if (ask === 'supp-of-comp' && Math.abs(v.supp - value) > 1e-9) {
      misconceptions.push({
        part: 'answer', answer: fmt(v.supp), tag: 'confused-comp-supp',
        msg: `${deg(v.supp)} is the supplement of the angle itself. Start from the complement (90 − ${fmt(a)}) and take 180 minus that.`,
      });
    }
    if (ask === 'supp-of-smaller' && isMeasure(supp(v.larger)) && Math.abs(supp(v.larger) - value) > 1e-9) {
      misconceptions.push({
        part: 'answer', answer: fmt(supp(v.larger)), tag: 'gave-larger',
        msg: `That is the supplement of the larger angle. The smaller of the two is ${deg(v.smaller)}.`,
      });
    }
    if (ask === 'comp-of-smaller' && isMeasure(comp(v.larger)) && Math.abs(comp(v.larger) - value) > 1e-9) {
      misconceptions.push({
        part: 'answer', answer: fmt(comp(v.larger)), tag: 'gave-larger',
        msg: `That is the complement of the larger angle — the question asks about the smaller one.`,
      });
    }
  }

  // what a student reports after solving a trap equation — per field for a multi
  const valuesFrom = (root) => {
    const w = { angle: root, comp: comp(root), supp: supp(root) };
    if (drawn.pair) {
      const [q1, q2] = drawn.pair.of(w);
      w.smaller = Math.min(q1, q2);
      w.larger = Math.max(q1, q2);
    }
    return w;
  };
  const taken = new Set([answerPart.type === 'num' ? answerPart.answer : null, ...Object.values(answerPart.distractors ?? {})]);
  for (const f of answerPart.fields ?? []) {
    taken.add(f.answer);
    for (const d of Object.values(f.distractors ?? {})) taken.add(d);
  }
  for (const t of traps) {
    const w = valuesFrom(t.root);
    const line = `x = ${givesText(t.root)} comes from ${t.text}. ${t.msg}`;
    let got;
    try { got = spec.kind === 'multi' ? spec.fields(w) : [{ key: null, answer: spec.value(w) }]; } catch { continue; }
    for (const g of got) {
      if (!isMeasure(g.answer) || !isHalf(g.answer)) continue;
      const key = fmt(g.answer);
      if (taken.has(key)) continue;
      taken.add(key);
      misconceptions.push({ part: 'answer', ...(g.key ? { field: g.key } : {}), answer: key, tag: t.tag, msg: line });
    }
  }

  // ---- hints (H1 relationship · H2 setup · H3 one step from the end) ------
  // what is still left to do once x is known — never the value itself (S3: H3 is one step from the end)
  const otherText = `${drawn.uses.comp ? '90' : '180'} − x`;
  const fieldTail = (f) => (f.asks[0] === 'comp' ? 'its complement is 90 − x'
    : f.asks[0] === 'supp' ? 'its supplement is 180 − x'
      : f.asks[0] === 'smaller' || f.asks[0] === 'larger' ? `the two angles are x and ${otherText}`
        : 'x itself goes in the first box');
  let tail;
  if (spec.kind === 'multi') {
    tail = [...new Set(answerPart.fields.map(fieldTail))].join(', and ');
  } else {
    const steps = [];
    const base = spec.asks[0];
    if (base === 'smaller' || base === 'larger') steps.push(`take the ${base} of x and ${otherText}`);
    else if (base === 'comp') steps.push('the complement is 90 − x');
    else if (base === 'supp') steps.push('the supplement is 180 − x');
    else steps.push('x itself is what the question asks for');
    for (const st of spec.asks.slice(1)) steps.push(st === 'comp' ? 'then its complement (90 − that)' : 'then its supplement (180 − that)');
    tail = steps.join(', ');
  }
  // the collected form (`10x = 170`) is read off the EMITTED equation with poly.js, so H3 is always
  // exactly one step from x — the teacher's own hint shape (wp-01 H3)
  const collected = linearForm(canonical, 'x');
  const collectedText = collected && collected.a !== 1
    ? `${collected.mul > 1 ? `multiply both sides by ${collected.mul}, then collect: ` : 'collect the x terms: '}${collected.a}x = ${fmt(collected.c)}`
    : 'collect the x terms on one side and the numbers on the other';
  const hints = [
    `${drawn.insight} ${drawn.pair ? '' : 'Let x be the angle the sentence is about.'}`.trim(),
    `Set up: ${text}`,
    `Solve it — ${collectedText}. Then ${tail}.`,
  ];

  // ---- solution ----------------------------------------------------------
  const solution = [
    { say: 'Name the parts', math: drawn.pair ? `x = one angle, the other = ${drawn.uses.comp ? '90' : '180'} − x` : 'angle = x,  comp = 90 − x,  supp = 180 − x' },
    { say: 'Translate the sentence', math: text },
    ...(collected && collected.a !== 1 ? [{
      say: collected.mul > 1 ? `Multiply both sides by ${collected.mul} and collect the x terms` : 'Expand and collect the x terms',
      math: `${collected.a}x = ${fmt(collected.c)}`,
    }] : []),
    { say: collected && collected.a !== 1 ? `Divide by ${collected.a}` : 'Solve for x', math: `x = ${fmt(a)}` },
  ];
  if (spec.kind === 'multi') {
    for (const f of answerPart.fields) solution.push({ say: `Read off ${String(f.label).replace(/\s*=\s*$/, '')}`, math: deg(Number(f.answer)) });
  } else {
    let cur = spec.asks[0] === 'smaller' ? v.smaller : spec.asks[0] === 'larger' ? v.larger : a;
    if (spec.asks[0] === 'smaller' || spec.asks[0] === 'larger') {
      solution.push({ say: `The ${spec.asks[0]} angle`, math: deg(cur) });
    }
    for (const step of spec.asks.slice(1)) {
      const next = step === 'comp' ? comp(cur) : supp(cur);
      solution.push({ say: step === 'comp' ? 'Its complement' : 'Its supplement', math: `${step === 'comp' ? 90 : 180} − ${fmt(cur)} = ${fmt(next)}` });
      cur = next;
    }
    if (spec.asks.length === 1 && spec.asks[0] === 'angle') solution.push({ say: 'Which is what the question asks for', math: deg(a) });
    if (spec.asks.length === 1 && (spec.asks[0] === 'comp' || spec.asks[0] === 'supp')) {
      const target = spec.asks[0] === 'comp' ? v.comp : v.supp;
      solution.push({ say: spec.asks[0] === 'comp' ? 'Its complement' : 'Its supplement', math: `${spec.asks[0] === 'comp' ? 90 : 180} − ${fmt(a)} = ${fmt(target)}` });
    }
  }

  return {
    prompt,
    parts: [setup, answerPart],
    answer: answerText,
    hints,
    solution,
    misconceptions,
    tier: 2,
    par: spec.kind === 'multi' ? 180 : 150,
    meta: { frame: frame.id, ask, a, values: v, params: drawn.params ?? {}, traps: traps.length },
  };
}

function draw(rng, params, api) {
  const frames = params.frame && FRAME_BY_ID.has(params.frame) ? [FRAME_BY_ID.get(params.frame)] : FRAMES;
  const frame = frames.length === 1 ? frames[0] : rng.weighted(frames, frames.map((f) => f.weight));
  const drawn = frame.draw(rng);
  if (!drawn) return api.reject();
  if (!isAcute(drawn.a) || !isHalf(drawn.a)) return api.reject();
  const offered = drawn.asks ?? frame.asks;        // a frame may narrow its asks per draw (see F8/F10)
  const asks = params.ask && offered.includes(params.ask) ? [params.ask] : offered;
  const ask = asks.length === 1 ? asks[0] : rng.pick(asks);
  const item = buildItem(frame, drawn, ask);
  if (!item) return api.reject();
  return item;
}

/** the fixed exemplar (S2): wp-01's own numbers. */
function exemplar() {
  const frame = FRAME_BY_ID.get('supp-k-m-angle');
  const drawn = {
    a: 17,
    statement: 'The supplement of an angle is 10 more than nine times the angle.',
    lhs: (X, H) => H.S(X),
    rhs: (X) => `10+9${X}`,
    uses: { comp: false, supp: true },
    altSubs: ['comp'],
    insight: 'The supplement of an angle is 180 − x. "Is" is the equals sign.',
    params: { m: 9, k: 10, form: 'more' },
  };
  return buildItem(frame, drawn, 'angle+comp', null);
}

/** verify — re-solve the emitted equation with poly.js and re-derive every number the item claims. */
function verify(item) {
  const out = [];
  const setup = item.parts.find((p) => p.type === 'equation');
  const answer = item.parts.find((p) => p.id === 'answer');
  const a = item.meta.a;
  if (!setup || !answer) { out.push('item is missing its setup or answer part'); return out; }
  if (!isAcute(a) || !isHalf(a)) out.push(`the angle ${fmt(a)} is not an integer or half inside (0, 90)`);
  const roots = solveEmitted(setup.canonical, 'x');
  if (!roots || roots.length !== 1) { out.push(`the emitted equation ${setup.canonical} has no single root`); return out; }
  if (Math.abs(roots[0] - a) > 1e-9) out.push(`solver got x = ${fmt(roots[0])} but the item claims ${fmt(a)}`);
  for (const alt of setup.alternates ?? []) {
    const got = solveEmitted(alt.canonical, 'x');
    if (!got || got.length !== 1 || Math.abs(got[0] - Number(alt.roots[0])) > 1e-9) {
      out.push(`alternate ${alt.canonical} does not solve to ${alt.roots[0]}`);
    }
  }
  const values = item.meta.values;
  for (const [name, val] of Object.entries(values)) {
    if (!isMeasure(val)) out.push(`${name} = ${fmt(val)} is outside (0, 180)`);
    if (!isHalf(val)) out.push(`${name} = ${fmt(val)} is not an integer or a half`);
  }
  if (Math.abs(values.comp - comp(a)) > 1e-9 || Math.abs(values.supp - supp(a)) > 1e-9) out.push('comp/supp disagree with the angle');
  const expected = answer.type === 'num' ? [Number(answer.answer)] : answer.fields.map((f) => Number(f.answer));
  for (const e of expected) {
    if (!isMeasure(e) || !isHalf(e)) out.push(`answer ${fmt(e)} is not a measure`);
  }
  if (!/[?.]$/.test(item.prompt.trim()) || item.prompt.trim().split(' ').length < 8) out.push('the prompt is not a sentence plus a question');
  return out;
}

export const gen = makeGen(TEMPLATE, draw, {
  version: VERSION,
  skills: ['CS-LIN'],
  tier: 2,
  par: 150,
  module: 'M4',
  sheet: 'WP',
  exemplar,
  verify,
});

export const frames = FRAMES.map((f) => f.id);
export default gen;
