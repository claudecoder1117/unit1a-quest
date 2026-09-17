// notation.js — T-notation (T07c; M1, skill NOTE, sheet VOC).
// COMPOSED S2: "`T-notation` / `T-vocab`: random 4–6 point figures, relabelled,
// **'ray AB ≠ ray BA' traps**; confusable-group distractors."  S2 not-01..09 row: read `mc` of
// rendered symbols, write with the `notation` builder, and the trap items ("length of AB" expects
// no bar, "ray with endpoint F through B" expects `ray F B`).
//
// Each item draws a fresh 4–6 letter point set (no I, no O — they read as 1 and 0) and asks ONE
// notation question. Kinds:
//   build-ray   → the ray-order trap (B1's elite is `not-04`); `ray BA` for `ray AB` is graded wrong
//                 with tag `ray-order` by js/grader/notation.js, and the item also carries the trap
//                 as a `misconceptions[]` entry for the error log / Patterns panel.
//   build-line | build-seg | build-len | build-ang | build-m | build-plane | build-cong | build-eq
//   read        → `mc`: a rendered symbol, four descriptions, confusable-notation distractors.
//
// Every build item's answer is a canonical `{kind, pts}` object — the SAME typed shape the builder
// widget submits and the same one `notation.grade()` compares, so a Variant and a fixture are
// graded by identical code (S3).
//
// DOM-free, no Math.random.

import { seedTag } from '../rng.js';

/** Letters a figure may use: no I (reads as 1), no O (reads as 0). */
export const LETTERS = Object.freeze('ABCDEFGHJKLMNPQRSTUVWXYZ'.split(''));

/** `n` distinct elements of `arr`, cheap in draws (rng.shuffle costs one draw per element). */
function pickN(rng, arr, n) {
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < 120) {
    const x = rng.pick(arr);
    if (!out.includes(x)) out.push(x);
  }
  return out;
}

/** Plane names are single script capitals in the study guide. */
const PLANE_NAMES = Object.freeze(['P', 'Q', 'R', 'M', 'N']);

const KIND_WEIGHTS = Object.freeze([
  ['ray', 4], ['len', 2], ['ang', 2], ['line', 2], ['seg', 2],
  ['m', 1], ['plane', 1], ['cong', 1], ['eq', 1], ['read', 3],
]);

/** Mini-markup for a canonical notation object (rendered by js/mathfmt.js). */
export function markupOf(obj) {
  if (!obj) return '';
  if (obj.kind === 'cong') return `${markupOf(obj.sides[0])} ≅ ${markupOf(obj.sides[1])}`;
  if (obj.kind === 'eq') return `${markupOf(obj.sides[0])} = ${markupOf(obj.sides[1])}`;
  const p = obj.pts.join('');
  switch (obj.kind) {
    case 'line': return `{line ${p}}`;
    case 'seg': return `{seg ${p}}`;
    case 'len': return `{len ${p}}`;
    case 'ray': return `{ray ${p}}`;
    case 'ang': return `{ang ${p}}`;
    case 'm': return `{m ${p}}`;
    case 'plane': return `{plane ${p}}`;
    default: return p;
  }
}

/** Plain-English description of a canonical object (mc options, solutions). */
export function describeOf(obj) {
  const [a, b, c] = obj.pts ?? [];
  switch (obj.kind) {
    case 'line': return `the line through ${a} and ${b} — no endpoints, it goes on forever both ways`;
    case 'seg': return `the segment with endpoints ${a} and ${b}`;
    case 'len': return `the distance from ${a} to ${b} — a number, not a figure`;
    case 'ray': return `the ray that starts at ${a} and passes through ${b}`;
    case 'ang': return `the angle with vertex ${b}, formed by the rays through ${a} and ${c}`;
    case 'm': return `the measure of the angle with vertex ${b} — a number of degrees`;
    case 'plane': return obj.pts.length === 1 ? `the plane named ${a}` : `the plane through ${a}, ${b} and ${c}`;
    default: return '';
  }
}

const RULE = Object.freeze({
  ray: 'A ray is named ENDPOINT FIRST, then a point it passes through — ray AB and ray BA are different rays.',
  line: 'A line has no endpoints, so its two letters can be written in either order, under a double arrow.',
  seg: 'A segment has two endpoints, so its two letters can be written in either order, under a plain bar.',
  len: 'A LENGTH is a number: write the two letters with NO mark over them.',
  ang: 'An angle is ∠ABC with the VERTEX as the middle letter; the outer two letters may swap.',
  m: 'm∠ABC is the MEASURE — a number of degrees — so it needs the m in front.',
  plane: 'A plane is named by one capital letter, or by three points of the plane that are not on one line.',
  cong: '≅ joins two FIGURES (angles, segments). = joins two NUMBERS (measures, lengths).',
  eq: '= joins two NUMBERS (measures, lengths). ≅ joins two figures.',
});

// ------------------------------------------------------------------------------------------------

function askFor(kind, obj) {
  const [a, b, c] = obj.pts ?? [];
  switch (kind) {
    case 'ray': return `Write the name of the ray with endpoint ${a} that passes through ${b}.`;
    case 'line': return `Write the name of the line through ${a} and ${b}.`;
    case 'seg': return `Write the name of the segment with endpoints ${a} and ${b}.`;
    case 'len': return `Write the LENGTH of the segment from ${a} to ${b} (the distance — a number, not a figure).`;
    case 'ang': return `Write the name of the angle with vertex ${b}, whose sides pass through ${a} and ${c}.`;
    case 'm': return `Write the symbol for the MEASURE, in degrees, of the angle with vertex ${b} and sides through ${a} and ${c}.`;
    case 'plane': return obj.pts.length === 1
      ? `Write the name of the plane called ${a}.`
      : `Write the name of the plane containing the non-collinear points ${a}, ${b} and ${c}.`;
    default: return '';
  }
}

/** The mini-figure caption: the point set the item is drawn from. */
function figureLine(points) {
  return `Points ${points.slice(0, -1).join(', ')} and ${points[points.length - 1]} are labelled in the figure.`;
}

function trapsFor(kind, obj) {
  const [a, b, c] = obj.pts ?? [];
  switch (kind) {
    case 'ray': return [{
      part: 'build', answer: `ray ${b}${a}`, tag: 'ray-order',
      msg: `Ray ${b}${a} starts at ${b} — a different ray. The ENDPOINT is written first, so this one is ray ${a}${b}.`,
    }];
    case 'len': return [{
      part: 'build', answer: `segment ${a}${b}`, tag: 'bar-on-length',
      msg: `With a bar that is the segment — a set of points. The LENGTH is the two letters with no mark: ${a}${b}.`,
    }];
    case 'ang': return [{
      part: 'build', answer: `angle ${b}${a}${c}`, tag: 'vertex-not-middle',
      msg: `The vertex goes in the MIDDLE: the vertex here is ${b}, so it is ∠${a}${b}${c}.`,
    }];
    case 'm': return [{
      part: 'build', answer: `angle ${a}${b}${c}`, tag: 'm-vs-angle',
      msg: `∠${a}${b}${c} is the angle itself. A number of degrees needs the m: m∠${a}${b}${c}.`,
    }];
    case 'line': return [{
      part: 'build', answer: `segment ${a}${b}`, tag: 'line-vs-segment',
      msg: 'A plain bar means a segment (two endpoints). A line has no endpoints — it takes the double arrow.',
    }];
    case 'seg': return [{
      part: 'build', answer: `ray ${a}${b}`, tag: 'segment-vs-ray',
      msg: 'One arrowhead makes it a ray. A segment stops at both ends, so it takes a plain bar.',
    }];
    default: return [];
  }
}

// ------------------------------------------------------------------------------------------------

function buildBuilder(rng, kind, points) {
  let obj;
  if (kind === 'plane') {
    obj = rng.chance(0.5)
      ? { kind: 'plane', pts: [rng.pick(PLANE_NAMES)] }
      : { kind: 'plane', pts: pickN(rng, points, 3) };
  } else if (kind === 'ang' || kind === 'm') {
    obj = { kind, pts: pickN(rng, points, 3) };
  } else {
    obj = { kind, pts: pickN(rng, points, 2) };
  }
  const ask = askFor(kind, obj);
  const traps = trapsFor(kind, obj);
  return {
    kind,
    part: {
      id: 'build', type: 'notation',
      prompt: 'Build the symbol.',
      kind: obj.kind, pts: obj.pts.slice(),
      letters: points.slice(),
    },
    answerObj: obj,
    ask,
    traps,
  };
}

function buildRelation(rng, kind, points) {
  // ≅ between two angles, or = between their measures — the ≅ / = confusion (not-08).
  const [a, b, c, d, e, f] = pickN(rng, points, 6);
  const inner = kind === 'cong' ? 'ang' : 'm';
  const obj = {
    kind,
    sides: [
      { kind: inner, pts: [a, b, c] },
      { kind: inner, pts: [d, e, f] },
    ],
  };
  const ask = kind === 'cong'
    ? `∠${a}${b}${c} and ∠${d}${e}${f} are congruent figures. Write that as a symbol statement.`
    : `The angle with vertex ${b} and the angle with vertex ${e} have the SAME MEASURE in degrees. Write that as a symbol statement about the two measures.`;
  return {
    kind,
    part: {
      id: 'build', type: 'notation',
      prompt: 'Build the statement.',
      kind, sides: obj.sides.map((s) => ({ kind: s.kind, pts: s.pts.slice() })),
      letters: points.slice(),
    },
    answerObj: obj,
    ask,
    traps: [{
      part: 'build',
      answer: kind === 'cong' ? `m∠${a}${b}${c} = m∠${d}${e}${f}` : `∠${a}${b}${c} ≅ ∠${d}${e}${f}`,
      tag: 'congruent-vs-equal',
      msg: kind === 'cong'
        ? 'That statement is about two NUMBERS. Two figures that match are congruent: use ≅ between the angles themselves.'
        : 'That statement is about two FIGURES. Two numbers that match are equal: use = between the two measures.',
    }],
  };
}

function buildRead(rng, points) {
  const readable = ['line', 'seg', 'ray', 'len', 'ang', 'm'];
  const kind = rng.pick(readable);
  const pts = pickN(rng, points, kind === 'ang' || kind === 'm' ? 3 : 2);
  const obj = { kind, pts };
  const others = readable.filter((k) => k !== kind);
  const wrongKinds = pickN(rng, others, 2);
  const distractors = wrongKinds.map((k) => {
    const o = { kind: k, pts: (k === 'ang' || k === 'm') ? (pts.length === 3 ? pts : [pts[0], pts[1], rng.pick(points.filter((p) => !pts.includes(p)))]) : pts.slice(0, 2) };
    return {
      text: describeOf(o),
      why: RULE[k] ?? RULE[kind],
      tag: k === 'len' ? 'bar-on-length' : k === 'ray' ? 'segment-vs-ray' : k === 'seg' ? 'line-vs-segment' : k === 'm' ? 'm-vs-angle' : 'wrong-decoration',
    };
  });
  if (kind === 'ray') {
    distractors.push({
      text: `the ray that starts at ${pts[1]} and passes through ${pts[0]}`,
      why: RULE.ray, tag: 'ray-order',
    });
  } else {
    distractors.push({ text: `none of these — the symbol names nothing`, why: RULE[kind], tag: 'wrong-decoration' });
  }
  return {
    kind: 'read',
    part: {
      id: 'mc', type: 'mc',
      prompt: `What does ${markupOf(obj)} name?`,
      answer: describeOf(obj),
      distractors: distractors.slice(0, 3),
    },
    answerObj: obj,
    ask: `Read the symbol ${markupOf(obj)}.`,
    traps: kind === 'ray' ? [{
      part: 'mc', answer: `the ray that starts at ${pts[1]} and passes through ${pts[0]}`, tag: 'ray-order',
      msg: `That is ray ${pts[1]}${pts[0]}. The ENDPOINT is the first letter, so ${markupOf(obj)} starts at ${pts[0]}.`,
    }] : [],
  };
}

const EXEMPLAR_POINTS = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F']);

/** Build one T-notation item. opts: { kind?: one of KIND_WEIGHTS[0], points?:string[] } */
export function build(rng, opts = {}) {
  const kinds = KIND_WEIGHTS.map((k) => k[0]);
  const weights = KIND_WEIGHTS.map((k) => k[1]);
  let spec = null;
  let points = null;
  while (rng.draws < 200 && !spec) {
    points = opts.points ? opts.points.slice() : pickN(rng, LETTERS, rng.int(4, 6));
    const kind = opts.kind ?? rng.weighted(kinds, weights);
    if (kind === 'read') spec = buildRead(rng, points);
    else if (kind === 'cong' || kind === 'eq') {
      if (points.length < 6) { points = pickN(rng, LETTERS, 6); }
      spec = buildRelation(rng, kind, points);
    } else spec = buildBuilder(rng, kind, points);
  }
  if (!spec) {
    points = EXEMPLAR_POINTS.slice();
    spec = buildBuilder(rng, 'ray', points);
  }
  return assemble(rng, spec, points);
}

function assemble(rng, spec, points) {
  const obj = spec.answerObj;
  const answerMarkup = markupOf(obj);
  const stem = `${figureLine(points)} ${spec.ask}`;
  const ruleKind = obj.kind;
  const rule = RULE[ruleKind] ?? RULE.line;

  const hints = spec.kind === 'read'
    ? [
      'The mark over the letters tells you what KIND of object the symbol names.',
      'Double arrow = line (no endpoints) · plain bar = segment (two endpoints) · one arrow = ray (one endpoint, written first) · no mark at all = a length, which is a number.',
      rule,
    ]
    : [
      'Decide the KIND of object first (line, segment, ray, length, angle, measure, plane), then the letters.',
      'Pick the decoration that matches: ↔ line · ¯ segment · → ray · nothing = a length · ∠ angle · m∠ its measure.',
      rule,
    ];

  return {
    id: `T-notation#${seedTag(rng.seed)}`,
    template: 'T-notation',
    params: { kind: spec.kind, points: points.slice(), answer: { kind: obj.kind, pts: obj.pts ? obj.pts.slice() : null } },
    prompt: stem,
    stem,
    figure: null,
    letters: points.slice(),
    skills: ['NOTE'],
    parts: [spec.part],
    answer: spec.kind === 'read' ? describeOf(obj) : answerMarkup,
    answerMarkup,
    hints,
    solution: [
      { say: 'What kind of object is being named?', math: '' },
      { say: rule, math: answerMarkup },
      { say: 'Compare the four two-letter symbols so the difference stays visible', math: '{line AB} line · {seg AB} segment · {ray AB} ray from A · {len AB} the length (a number)' },
    ],
    misconceptions: spec.traps,
  };
}

export const templates = Object.freeze([
  Object.freeze({
    id: 'T-notation', version: 1, label: 'Notation: read and write', module: 'M1', sheet: 'VOC',
    skills: ['NOTE'], tier: 2, par: 45, partTypes: ['notation', 'mc'],
    kinds: KIND_WEIGHTS.map((k) => k[0]),
    gen: (rng, opts = {}) => build(rng, opts),
  }),
]);

export default templates;
