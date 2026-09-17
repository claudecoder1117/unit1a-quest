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
// fix5:gen (templateVersion 2) — every item whose stem says "labelled in the figure" now CARRIES that
// figure: a small poly drawn from the item's own letters (see "mini-figure" below). The two kinds whose
// question needs no picture (`read`, and a plane named by one letter) no longer mention a figure.
//
// DOM-free, no Math.random.

import { seedTag } from '../rng.js';
import { resolve, validate, accidentalSums } from '../figure/model.js';
import { lint, layout, VIEW } from '../figure/svg.js';

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

/** The mini-figure caption: the point set the item is drawn from (only ever used when the figure exists). */
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
      // fix5:gen: a plane named by one letter (P, Q, R, M, N) may not be one of the points — offer it anyway
      letters: obj.pts.every((L) => points.includes(L)) ? points.slice() : [...points, ...obj.pts.filter((L) => !points.includes(L))],
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


// ------------------------------------------------------------------------------------------------
// mini-figure (fix5:gen)
//
// The item's named object is drawn exactly as the question describes it — ray AB as a ray from A
// through B (arrowhead past B; it points left as often as right, so reading order never gives the
// answer), line AB with two arrowheads, segment AB plain, ∠ABC as two rays from B — and every other
// letter of the point set is drawn OFF that object, as a second line / ray / segment or a lone point.
// So no extra letter can give the named object a second name (ray AX for ray AB), and every letter the
// stem lists is on the page. `plane` with three points draws an unlettered plane outline around them
// (the other letters stay outside it); `cong` / `eq` draw both angles, equal in measure.
// Built on a forked rng stream, so the question text for a seed is unchanged by the drawing.
// Gate: validate() = [], lint() = [] at 343 px, no accidental sums, every stroke inside the viewBox,
// points ≥ 34 apart, no point on another object's stroke, no two objects' strokes crossing.

const RUN_ON = 34;              // svg.js draws an arrowed chain this far past its end point
const LETTER = 21;              // letter size (viewBox units): 21 × 150/260 ≈ 12 px even on a short phone's capped figure
const MARGIN = 16;              // letter half-size + a little air, around every drawn point
const EDGE = 8;                 // strokes (with arrowheads) stay this far inside the viewBox

const u = (deg) => [Math.cos((deg * Math.PI) / 180), -Math.sin((deg * Math.PI) / 180)];
const add = (p, v, k = 1) => [p[0] + k * v[0], p[1] + k * v[1]];
const normDeg = (d) => ((d % 360) + 360) % 360;

/** A 2-point object in local coordinates: `kind` line | ray | seg, P→Q along `deg`, `d` apart. */
function twoPoint(kind, P, Q, deg, d, side) {
  const v = u(deg);
  const p = [(-d / 2) * v[0], (-d / 2) * v[1]];
  const q = [(d / 2) * v[0], (d / 2) * v[1]];
  const ext = [p, q];
  if (kind === 'ray' || kind === 'line') ext.push(add(q, v, RUN_ON));
  if (kind === 'line') ext.push(add(p, v, -RUN_ON));
  const off = normDeg(deg + side);
  return {
    kind, pts: { [P]: p, [Q]: q }, chains: [[P, Q]],
    arrows: [kind === 'line' ? 'both' : kind === 'ray' ? 'end' : 'none'],
    labelDirs: { [P]: off, [Q]: off }, ext,
  };
}

/** ∠XVY in local coordinates: rays from V at `base` and `base + span`, named points `len` out. */
function angleObj(X, V, Y, base, span, len) {
  const a = u(base), b = u(base + span);
  const x = add([0, 0], a, len), y = add([0, 0], b, len);
  return {
    kind: 'angle', pts: { [V]: [0, 0], [X]: x, [Y]: y }, chains: [[V, X], [V, Y]], arrows: ['end', 'end'],
    labelDirs: { [V]: normDeg(base + span / 2 + 180), [X]: normDeg(base - 90), [Y]: normDeg(base + span + 90) },
    ext: [[0, 0], x, y, add(x, a, RUN_ON), add(y, b, RUN_ON)],
  };
}

function dotObj(P) {
  return { kind: 'dot', pts: { [P]: [0, 0] }, chains: [], arrows: [], labelDirs: { [P]: 90 }, ext: [[0, 0]] };
}

/** Move an object so its extent (plus MARGIN) sits inside rect [x0,y0,x1,y1]; null when it cannot. */
function placeIn(rng, obj, rect) {
  const xs = obj.ext.map((p) => p[0]), ys = obj.ext.map((p) => p[1]);
  const bx0 = Math.min(...xs) - MARGIN, bx1 = Math.max(...xs) + MARGIN;
  const by0 = Math.min(...ys) - MARGIN, by1 = Math.max(...ys) + MARGIN;
  const slackX = (rect[2] - rect[0]) - (bx1 - bx0), slackY = (rect[3] - rect[1]) - (by1 - by0);
  if (slackX < 0 || slackY < 0) return null;
  const dx = rect[0] - bx0 + rng.float(0, slackX), dy = rect[1] - by0 + rng.float(0, slackY);
  const mv = (p) => [Math.round((p[0] + dx) * 10) / 10, Math.round((p[1] + dy) * 10) / 10];
  return {
    ...obj,
    pts: Object.fromEntries(Object.entries(obj.pts).map(([k, p]) => [k, mv(p)])),
    ext: obj.ext.map(mv),
    ...(obj.outline ? { outline: obj.outline.map(mv) } : {}),
  };
}

/** A random 2-point object of `kind` fitted into `rect` (direction band `dirs`), or null. */
function fitTwo(rng, kind, P, Q, rect, { dirs = [-25, 25], maxD = 220, minD = 64 } = {}) {
  for (let t = 0; t < 8; t++) {
    let deg = rng.float(dirs[0], dirs[1]);
    if (rng.chance(0.5)) deg += 180;                   // rays point left as often as right
    const side = rng.chance(0.5) ? 90 : -90;
    for (let d = maxD; d >= minD; d -= 12) {
      const placed = placeIn(rng, twoPoint(kind, P, Q, deg, d, side), rect);
      if (placed) return placed;
    }
  }
  return null;
}

function fitAngle(rng, X, V, Y, rect, { span = null, maxL = 120, minL = 62 } = {}) {
  for (let t = 0; t < 10; t++) {
    let sp = span ?? rng.int(38, 142);
    if (span == null && sp > 80 && sp < 100) sp = rng.chance(0.5) ? 72 : 112;   // never a near-right angle
    const base = rng.int(0, 359);
    for (let L = maxL; L >= minL; L -= 10) {
      const placed = placeIn(rng, angleObj(X, V, Y, base, sp, L), rect);
      if (placed) return placed;
    }
  }
  return null;
}

/** An unlettered plane outline in `rect` with the three named points inside it, not collinear. */
function fitPlane(rng, [A, B, C], rect) {
  const [x0, y0, x1, y1] = rect;
  const w = x1 - x0, h = y1 - y0, k = Math.round(w * rng.float(0.16, 0.24));
  const outline = [[x0 + k, y0], [x1, y0], [x1 - k, y1], [x0, y1]];
  const spots = rng.shuffle([[0.3, 0.3], [0.68, 0.34], [0.46, 0.74]]);
  const pts = {};
  [A, B, C].forEach((n, i) => {
    const [fx, fy] = spots[i];
    pts[n] = [Math.round((x0 + w * (fx + rng.float(-0.05, 0.05))) * 10) / 10, Math.round((y0 + h * (fy + rng.float(-0.06, 0.06))) * 10) / 10];
  });
  return { kind: 'plane', pts, chains: [], arrows: [], labelDirs: { [A]: 90, [B]: 90, [C]: 90 }, ext: Object.values(pts), outline };
}

const distPtSeg = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const segsCross = (p1, p2, q1, q2) => cross(p1, p2, q1) * cross(p1, p2, q2) < 0 && cross(q1, q2, p1) * cross(q1, q2, p2) < 0;

/** The drawn strokes of an object (arrow run-ons included), as [from, to] pairs. */
function strokesOf(obj) {
  return obj.chains.map((ch, i) => {
    const P = obj.pts[ch[0]], Q = obj.pts[ch[ch.length - 1]];
    const v = [Q[0] - P[0], Q[1] - P[1]], L = Math.hypot(v[0], v[1]) || 1, n = [v[0] / L, v[1] / L];
    const a = obj.arrows[i];
    return [a === 'both' ? add(P, n, -RUN_ON) : P, a === 'end' || a === 'both' ? add(Q, n, RUN_ON) : Q];
  });
}

/** Objects clear of each other: points apart, no point on a foreign stroke, no crossing strokes. */
function objectsClear(objs) {
  const pts = objs.flatMap((o, i) => Object.values(o.pts).map((p) => ({ p, i })));
  for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) {
    if (Math.hypot(pts[a].p[0] - pts[b].p[0], pts[a].p[1] - pts[b].p[1]) < 34) return false;
  }
  const strokes = objs.map(strokesOf);
  for (const { p, i } of pts) {
    for (let j = 0; j < objs.length; j++) if (j !== i && strokes[j].some(([a, b]) => distPtSeg(p, a, b) < 22)) return false;
  }
  for (let i = 0; i < objs.length; i++) for (let j = i + 1; j < objs.length; j++) {
    for (const [a, b] of strokes[i]) for (const [c, d] of strokes[j]) {
      if (segsCross(a, b, c, d) || distPtSeg(a, c, d) < 10 || distPtSeg(b, c, d) < 10) return false;
    }
    if (objs[j].outline || objs[i].outline) {   // letters outside a plane stay well outside its edges
      const plane = objs[i].outline ? objs[i] : objs[j], other = plane === objs[i] ? objs[j] : objs[i];
      const edges = plane.outline.map((p, k) => [p, plane.outline[(k + 1) % plane.outline.length]]);
      if (Object.values(other.pts).some((p) => edges.some(([a, b]) => distPtSeg(p, a, b) < 26))) return false;
    }
  }
  return true;
}

const OTHER_KINDS = Object.freeze(['line', 'ray', 'seg']);

/** Region plan + objects for one attempt, or null. */
function composeScene(rng, spec, points) {
  const obj = spec.answerObj;
  const W = VIEW.w, H = VIEW.h;
  const flipX = rng.chance(0.5), flipY = rng.chance(0.5);
  const R = (x0, y0, x1, y1) => {                       // mirror the region plan for variety
    let r = [x0, y0, x1, y1];
    if (flipX) r = [W - r[2], r[1], W - r[0], r[3]];
    if (flipY) r = [r[0], H - r[3], r[2], H - r[1]];
    return r;
  };
  const objs = [];
  const used = new Set();
  const push = (o) => { if (!o) return false; objs.push(o); Object.keys(o.pts).forEach((k) => used.add(k)); return true; };
  const restOf = () => points.filter((p) => !used.has(p));
  const second = (P, Q, rect, opt) => fitTwo(rng, rng.pick(OTHER_KINDS), P, Q, rect, opt);

  if (obj.kind === 'cong' || obj.kind === 'eq') {
    const [s1, s2] = obj.sides;
    let sp = rng.int(38, 142);
    if (sp > 80 && sp < 100) sp = 118;
    if (!push(fitAngle(rng, s1.pts[0], s1.pts[1], s1.pts[2], R(8, 10, 196, 250), { span: sp, maxL: 100, minL: 60 }))) return null;
    if (!push(fitAngle(rng, s2.pts[0], s2.pts[1], s2.pts[2], R(204, 10, 392, 250), { span: sp, maxL: 100, minL: 60 }))) return null;
    for (const p of restOf()) if (!push(placeIn(rng, dotObj(p), R(150, 110, 250, 150)))) return null;
    return objs;
  }
  if (obj.kind === 'ang' || obj.kind === 'm') {
    const [a, b, c] = obj.pts;
    if (!push(fitAngle(rng, a, b, c, R(10, 10, 238, 250)))) return null;
    const rest = restOf();
    if (rest.length === 1) { if (!push(placeIn(rng, dotObj(rest[0]), R(262, 40, 390, 220)))) return null; }
    else if (rest.length === 2) { if (!push(second(rest[0], rest[1], R(246, 10, 392, 250), { dirs: [55, 125], maxD: 150, minD: 70 }))) return null; }
    else if (rest.length >= 3) {
      if (!push(second(rest[0], rest[1], R(246, 10, 392, 158), { dirs: [40, 140], maxD: 110, minD: 64 }))) return null;
      for (const p of rest.slice(2)) if (!push(placeIn(rng, dotObj(p), R(262, 170, 390, 250)))) return null;
    }
    return objs;
  }
  if (obj.kind === 'plane') {
    if (!push(fitPlane(rng, obj.pts, R(14, 60, 292, 246)))) return null;
    const rest = restOf();
    const slots = [R(300, 20, 390, 90), R(300, 110, 390, 170), R(300, 190, 390, 250), R(20, 8, 290, 44)];
    rest.forEach((p, i) => push(placeIn(rng, dotObj(p), slots[i])));
    return restOf().length ? null : objs;
  }
  // line / ray / seg / len — the named object across one band, the rest below it
  const [P, Q] = obj.pts;
  const kind = obj.kind === 'len' ? 'seg' : obj.kind;
  if (!push(fitTwo(rng, kind, P, Q, R(10, 10, 390, 118), { dirs: [-18, 18], maxD: 220, minD: 110 }))) return null;
  const rest = restOf();
  if (rest.length === 2) { if (!push(second(rest[0], rest[1], R(10, 140, 390, 250), { dirs: [-20, 20], maxD: 200, minD: 90 }))) return null; }
  else if (rest.length === 3) {
    if (!push(second(rest[0], rest[1], R(8, 136, 262, 252), { dirs: [-25, 25], maxD: 150, minD: 70 }))) return null;
    if (!push(placeIn(rng, dotObj(rest[2]), R(280, 150, 390, 250)))) return null;
  } else if (rest.length === 4) {
    if (!push(second(rest[0], rest[1], R(6, 132, 200, 254), { dirs: [-35, 35], maxD: 110, minD: 64 }))) return null;
    if (!push(second(rest[2], rest[3], R(200, 132, 394, 254), { dirs: [-35, 35], maxD: 110, minD: 64 }))) return null;
  } else if (rest.length === 1) {
    if (!push(placeIn(rng, dotObj(rest[0]), R(120, 150, 280, 250)))) return null;
  }
  return objs;
}

/** Objects → the poly figure spec (the card's `figure` object). */
function specOf(objs, id) {
  const points = {}, segments = [], arrows = [], labelDirs = {};
  let outline = null;
  for (const o of objs) {
    Object.assign(points, o.pts);
    for (const [k, d] of Object.entries(o.labelDirs)) labelDirs[k] = Math.round(d);
    o.chains.forEach((ch, i) => { segments.push(ch.slice()); arrows.push(o.arrows[i]); });
    if (o.outline) outline = o.outline;
  }
  return { id, kind: 'poly', points, segments, arrows, labelDirs, ...(outline ? { outline } : {}), dots: true, letterSize: LETTER };
}

/** true when the model draws cleanly: validate + lint at phone width + strokes in view. */
function figureClean(model) {
  if (validate(model).length || accidentalSums(model).length) return false;
  if (lint(model, { widthPx: 343 }).length) return false;
  const L = layout(model);
  const inside = (p) => p[0] >= EDGE && p[0] <= VIEW.w - EDGE && p[1] >= EDGE && p[1] <= VIEW.h - EDGE;
  return L.strokes.every((s) => inside(s.from) && inside(s.to)) && Object.values(model.points).every(inside);
}

/** Letter flips that often clear a lint hit: each letter tries the other side of its stroke / the far end. */
function relabel(spec, rng) {
  const out = structuredClone(spec);
  for (const k of rng.shuffle(Object.keys(out.labelDirs))) {
    if (rng.chance(0.5)) out.labelDirs[k] = normDeg(out.labelDirs[k] + 180);
  }
  return out;
}

/**
 * The item's mini-figure: `{ id, spec, rename:{}, labels:[], notToScale:false }`, or null when the item
 * needs none (`read`; a plane named by one letter). Never null for any other kind (tests sweep 2000 seeds).
 */
export function figureFor(rng, spec, points) {
  const obj = spec.answerObj;
  if (spec.kind === 'read' || (obj.kind === 'plane' && obj.pts.length === 1)) return null;
  const frng = rng.fork(`notation-figure|${spec.kind}|${points.join('')}`);
  const id = `G-not-${seedTag(rng.seed)}-${spec.kind}-${points.join('')}`;
  for (let attempt = 0; attempt < 60; attempt++) {
    const objs = composeScene(frng, spec, points);
    if (!objs || !objectsClear(objs) || points.some((p) => !objs.some((o) => p in o.pts))) continue;
    let fig = specOf(objs, id);
    for (let t = 0; t < 4; t++) {
      if (figureClean(resolve(fig))) return { id, spec: fig, rename: {}, labels: [], notToScale: false };
      fig = relabel(specOf(objs, id), frng);
    }
  }
  return null;
}

function assemble(rng, spec, points) {
  const obj = spec.answerObj;
  const answerMarkup = markupOf(obj);
  // fix5:gen: the stem names a figure only when the item carries one
  const figure = figureFor(rng, spec, points);
  const stem = figure ? `${figureLine(points)} ${spec.ask}` : spec.ask;
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
    figure,
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
    id: 'T-notation', version: 2, label: 'Notation: read and write', module: 'M1', sheet: 'VOC',
    skills: ['NOTE'], tier: 2, par: 45, partTypes: ['notation', 'mc'],
    kinds: KIND_WEIGHTS.map((k) => k[0]),
    gen: (rng, opts = {}) => build(rng, opts),
  }),
]);

export default templates;
