// figxlines.js — T07b. Generators `T-fig-xlines-L` and `T-fig-xlines-Q`
// (COMPOSED S2 "§7 diagram variants" + the generator contract, S8 #7b).
//
//   Two lines crossing at one point, optionally a third ray marked perpendicular.
//   Two of the angles carry algebraic expressions; the relation between them
//   (right angle · linear pair · vertical pair) gives the equation, and the student
//   finds x and two measures. `-L` keeps both expressions linear (one root, one
//   case); `-Q` puts a quadratic on one of them (two roots → roots / reject / cases,
//   the `ang-10` shape).
//
// Contract (S2 "Generator contract"): `gen(rng) → item`, deterministic for a given
// rng, answer-backward (the roots and the measures are chosen first, the labels are
// built to produce them), self-checked by re-solving the emitted label strings with
// the site's own parser/solver (`grader/poly.js`) and re-rolled on any mismatch,
// max 200 attempts then a fixed exemplar. Every emitted figure is resolved through
// `figure/model.js` and gated on `validate()` + `lint()` so no Variant can ship a
// clipped label or an under-sized wedge. See notes/T07b.md for the item shape.
//
// Imports: figure/model.js, figure/svg.js, grader/poly.js, grader/normalize.js.
// No DOM, no Math.random (draws come from the seeded rng only), no card data.

import { angleId, angleName, resolve, validate, accidentalSums } from '../figure/model.js';
import { makeGen } from './contract.js';
import { lint, layout, VIEW } from '../figure/svg.js';
import { rat, ratToString, ratToNumber } from '../grader/normalize.js';
import {
  polyFromDescending, polyFromRoot, polyMul, polyScale, polyAdd, polySub, polyConst,
  polyEvalRat, polyDegree, formatPoly, parsePoly, solveLinear, solveQuadratic,
} from '../grader/poly.js';

export const TEMPLATE_VERSION = 1;
// The re-roll cap lives in contract.js (MAX_ATTEMPTS = 200): makeGen owns the draw loop.

// ---------------------------------------------------------------------------------------------
// small shared helpers (each gen module is self-contained — BUILD-POLICY §2 file ownership)
// ---------------------------------------------------------------------------------------------

/** Capital letters used for points; I and O are never used (they read as 1 and 0). */
export const LETTERS = [...'ABCDEFGHJKLMNPQRSTUVWXYZ'];

/** n distinct letters, in draw order (n draws from the stream). */
function pickLetters(rng, n) {
  const pool = LETTERS.slice();
  const out = [];
  for (let i = 0; i < n; i++) out.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  return out;
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const DEG = Math.PI / 180;

/** Distance from `center` to the drawing box along `deg`, capped — keeps every ray inside the viewBox. */
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

/**
 * Point-letter offsets for a generated fan. svg.js's default puts the letter straight past the
 * arrow tip, i.e. ON the ray — the hand-modeled figures dodge that with `labelOffsets.point`.
 * Generated fans get the same treatment automatically: a small nudge along the ray plus a
 * perpendicular step to the emptier side (away from the mean direction of the other rays).
 */
function letterOffsets(rays) {
  const out = {};
  for (const r of rays) {
    const ux = Math.cos(r.deg * DEG);
    const uy = -Math.sin(r.deg * DEG);
    let sx = 0;
    let sy = 0;
    for (const q of rays) {
      if (q === r) continue;
      sx += Math.cos(q.deg * DEG);
      sy += -Math.sin(q.deg * DEG);
    }
    const px = -uy;
    const py = ux;
    const sign = px * sx + py * sy > 0 ? -1 : 1;
    out[r.n] = [Math.round(ux * 5 + sign * px * 15), Math.round(uy * 5 + sign * py * 15)];
  }
  return out;
}

/** A vertex position that pushes the fan away from the mean ray direction (so lopsided fans fit). */
function centerFor(degs) {
  let sx = 0;
  let sy = 0;
  for (const d of degs) { sx += Math.cos(d * DEG); sy += -Math.sin(d * DEG); }
  const n = degs.length || 1;
  return [
    Math.round(clamp(200 - (sx / n) * 62, 118, 282)),
    Math.round(clamp(150 - (sy / n) * 54, 72, 214)),
  ];
}

/** 26 → "26", 11/2 → "5.5" (angle measures are integer or .5 — S2 invariant). */
function fmtMeasure(r) {
  const v = ratToNumber(r);
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 2) / 2);
}

/** 3 → "3", −1/2 → "-1/2" (roots keep the teacher's fraction spelling; ASCII, for answers). */
const fmtRoot = (r) => ratToString(r);

/** The same root with a typographic minus, for hint / solution prose. */
const showRoot = (r) => ratToString(r).replace(/-/g, '−');

/** The terms of a polynomial, highest power first: [{ i, body, neg }]. */
function polyTerms(p, v, ascii) {
  const out = [];
  for (let i = p.c.length - 1; i >= 0; i--) {
    const c = p.c[i];
    if (c.n === 0) continue;
    const neg = c.n < 0;
    const a = Math.abs(c.n) / c.d;
    let body;
    if (i === 0) body = String(a);
    else {
      const coef = a === 1 ? '' : String(a);
      const power = i === 1 ? '' : (ascii ? '^2' : '²');
      body = coef + v + power;
    }
    out.push({ i, body, neg });
  }
  return out;
}

/** Join terms in the given order; `−x + 84` and (scrambled) `84 − x` are both produced here. */
function joinTerms(terms, ascii) {
  const minus = ascii ? '-' : '−';
  let s = '';
  terms.forEach((t, k) => {
    if (k === 0) s += (t.neg ? minus : '') + t.body;
    else s += ` ${t.neg ? minus : '+'} ${t.body}`;
  });
  return s || '0';
}

/**
 * Polynomial → label text. `order` (a permutation of the term indices) writes the sum
 * unsimplified — S2: "sometimes presented unsimplified (`2x² − 4x + 3 − x + 84 = 90`)".
 */
function polyText(p, v, { ascii = false, order = null } = {}) {
  const terms = polyTerms(p, v, ascii);
  if (!terms.length) return '0';
  const list = order && order.length === terms.length ? order.map((i) => terms[i]) : terms;
  // a scrambled order must not open with a term that would read as a different sign pattern
  return joinTerms(list, ascii);
}

/** ascii text of a polynomial for `equation.canonical` (always canonical order). */
const canonText = (p, v) => formatPoly(p, v, { ascii: true });

// ---------------------------------------------------------------------------------------------
// the three frames
// ---------------------------------------------------------------------------------------------
//
// Rays, counter-clockwise from 0°, before rotation:
//   right       : d 0° · c γ° · b 90° · a 180° · e (180+γ)°     lines a–d, e–c   right mark on b
//   linearpair  : d 0° · c γ° ·        a 180° · e (180+γ)°      lines a–d, e–c
//   vertical    : d 0° · c γ° ·        a 180° · e (180+γ)°      lines a–d, e–c
//
// `E1` is the label built from the linear expression, `E2` the other one (quadratic in -Q).
//   right      : E1 on ∠b_c, E2 on ∠a_e   ⇒  E1 + E2 = 90   (∠c_d is vertical to ∠a_e)
//   linearpair : E1 on ∠a_c, E2 on ∠c_d   ⇒  E1 + E2 = 180
//   vertical   : E1 on ∠c_d, E2 on ∠a_e   ⇒  E1 = E2

const FRAMES = ['right', 'linearpair', 'vertical'];

/** Roots allowed for the quadratic variant (S2: no −1/3 — half-integer measures only). */
const Q_ROOTS = [rat(-1, 2), rat(-2), rat(1, 2), rat(2), rat(3), rat(4), rat(5), rat(6), rat(7), rat(8), rat(9)];

function frameGeometry(frame, L, gamma) {
  const [v, d, c, a, e, b] = L;
  const rays = frame === 'right'
    ? [{ n: d, deg: 0 }, { n: c, deg: gamma, free: true }, { n: b, deg: 90 }, { n: a, deg: 180 }, { n: e, deg: 180 + gamma }]
    : [{ n: d, deg: 0 }, { n: c, deg: gamma, free: true }, { n: a, deg: 180 }, { n: e, deg: 180 + gamma }];
  return { v, d, c, a, e, b, rays };
}

/** The two labelled angles and the two asked angles, per frame. */
function frameAngles(frame, g) {
  const { v, d, c, a, e, b } = g;
  if (frame === 'right') {
    return {
      k: 90,
      lin: [b, c], quad: [a, e],
      ask: [[c, d], [d, e]],                      // m∠cvd = E2 (vertical), m∠dve = 180 − E2 (linear pair)
      askFrom: ['quad', 'suppQuad'],
      relation: 'vertical',
    };
  }
  if (frame === 'linearpair') {
    return {
      k: 180,
      lin: [a, c], quad: [c, d],
      ask: [[c, d], [d, e]],                      // m∠cvd = E2, m∠dve = E1 (vertical to ∠avc)
      askFrom: ['quad', 'lin'],
      relation: 'linearPair',
    };
  }
  return {
    k: null,
    lin: [c, d], quad: [a, e],
    ask: [[c, d], [a, c]],                        // m∠cvd = E1 = E2, m∠avc = 180 − it (linear pair)
    askFrom: ['lin', 'suppLin'],
    relation: 'vertical',
  };
}

// ---------------------------------------------------------------------------------------------
// figure assembly
// ---------------------------------------------------------------------------------------------

function buildFigure({ frame, L, gamma, rot, mirror, markFar, tag }) {
  const g = frameGeometry(frame, L, gamma);
  const place = (deg) => {
    let x = mirror ? 180 - deg : deg;
    x = ((x + rot) % 360 + 360) % 360;
    return x;
  };
  const degs = g.rays.map((r) => place(r.deg));
  const center = centerFor(degs);
  const rays = g.rays.map((r, i) => ({
    n: r.n,
    deg: degs[i],
    len: fitLen(center, degs[i], r.n === g.b ? 44 : 30, r.n === g.b ? 132 : 178),
    ...(r.free ? { free: true } : {}),
  }));
  const spec = {
    id: `G-xlines-${tag}`,
    kind: 'fan',
    vertex: g.v,
    center,
    rays,
    lines: [[g.a, g.d], [g.e, g.c]],
    rightMarks: frame === 'right' ? [[g.b, markFar ? g.a : g.d]] : [],
    arcs: [],
    dots: true,
    arrows: true,
    labels: [],
    labelOffsets: { point: letterOffsets(rays), angle: {}, seg: {} },
  };
  return { spec, g };
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
// one attempt
// ---------------------------------------------------------------------------------------------

function attempt(rng, { quadratic }) {
  const frame = rng.pick(FRAMES);
  const L = pickLetters(rng, 6);                         // [v, d, c, a, e, b]
  const gamma = frame === 'right' ? rng.int(11, 20) * 2 : rng.int(12, 36) * 2;   // 22..40 / 24..72
  const rot = rng.int(0, 23) * 15;
  const mirror = rng.chance(0.5);
  const markFar = rng.chance(0.6);
  const bothValid = rng.chance(0.5);

  const g0 = frameGeometry(frame, L, gamma);
  const fa = frameAngles(frame, g0);

  // ---- the algebra, answer-backward -------------------------------------------------------
  let roots;
  let kPoly;                                            // (E1 + E2 − K) or (E1 − E2): its roots are the answer
  if (quadratic) {
    const i1 = rng.int(0, Q_ROOTS.length - 1);
    let i2 = rng.int(0, Q_ROOTS.length - 2);
    if (i2 >= i1) i2 += 1;
    const r1 = Q_ROOTS[i1];
    const r2 = Q_ROOTS[i2];
    if (r1.d === 2 && r2.d === 2) return null;           // one half-root at most (integer coefficients)
    const lead = r1.d === 2 || r2.d === 2 ? 2 : 1;
    roots = [r1, r2];
    kPoly = polyScale(polyMul(polyFromRoot(r1), polyFromRoot(r2)), rat(lead));
  } else {
    let r = rng.int(-12, 25);
    if (r === 0) r = 7;
    const lead = rng.pick([1, 1, 1, 2, 3]);
    roots = [rat(r)];
    kPoly = polyScale(polyFromRoot(rat(r)), rat(lead));
  }
  const primary = roots[0];

  // E1 = m·x + n, integer coefficients. m·primary must be an integer so n stays whole.
  let m = rng.pick([-4, -3, -2, -1, 1, 2, 3, 4]);
  if (primary.d === 2 && m % 2 !== 0) m = m > 0 ? m + 1 : m - 1;
  if (m === 0) return null;
  const K = fa.k;
  const hi = K === null ? 170 : K - 2;
  const u = rng.int(2, hi);                              // intended value of E1 at the primary root
  const nRat = rat(u).n - m * ratToNumber(primary);      // integer by construction
  if (!Number.isInteger(nRat)) return null;
  const e1 = polyFromDescending([m, nRat]);
  const e2 = K === null ? polyAdd(e1, kPoly) : polySub(polyAdd(polyConst(rat(K)), kPoly), e1);

  if (polyDegree(e2) !== (quadratic ? 2 : 1)) return null;
  if (!e1.c.every((r) => r.d === 1) || !e2.c.every((r) => r.d === 1)) return null;
  if (e1.c.some((r) => Math.abs(r.n) > 220) || e2.c.some((r) => Math.abs(r.n) > 220)) return null;

  // ---- per-root measures ------------------------------------------------------------------
  const cases = roots.map((r) => {
    const v1 = polyEvalRat(e1, r);                       // the linear label's measure
    const v2 = polyEvalRat(e2, r);                       // the other label's measure
    const n1 = ratToNumber(v1);
    const n2 = ratToNumber(v2);
    const half = (x) => Math.abs(x * 2 - Math.round(x * 2)) < 1e-9;
    const ok = n1 > 0 && n1 < 180 && n2 > 0 && n2 < 180 && half(n1) && half(n2);
    return { root: r, v1, v2, n1, n2, ok };
  });
  const valid = cases.filter((c) => c.ok);
  const invalid = cases.filter((c) => !c.ok);
  if (!valid.length) return null;
  if (quadratic && bothValid !== (invalid.length === 0)) return null;
  if (quadratic && invalid.length > 1) return null;
  if (!quadratic && invalid.length) return null;
  // a rejected root must fail on a measure that is clearly impossible, not on a stray half
  for (const c of invalid) if (!(c.n1 <= 0 || c.n2 <= 0 || c.n1 >= 180 || c.n2 >= 180)) return null;

  // the asked measures per valid case
  const askValue = (c, from) => {
    if (from === 'lin') return c.v1;
    if (from === 'quad') return c.v2;
    if (from === 'suppLin') return rat(180 * c.v1.d - c.v1.n, c.v1.d);
    return rat(180 * c.v2.d - c.v2.n, c.v2.d);
  };
  for (const c of valid) {
    for (const from of fa.askFrom) {
      const x = ratToNumber(askValue(c, from));
      if (!(x > 0 && x < 180)) return null;
    }
  }

  // ---- the figure ---------------------------------------------------------------------------
  const tag = `${frame[0]}${quadratic ? 'q' : 'l'}${gamma}${rot}${mirror ? 'm' : ''}${L.join('')}`;
  const scramble = rng.chance(0.3);
  const orderOf = (p) => {
    const n = polyTerms(p, 'x', false).length;
    if (!scramble || n < 2) return null;
    const idx = [...Array(n).keys()];
    return rng.shuffle(idx);
  };
  const linText = polyText(e1, 'x', { order: orderOf(e1) });
  const quadTextStr = polyText(e2, 'x', { order: orderOf(e2) });
  const { spec, g } = buildFigure({ frame, L, gamma, rot, mirror, markFar, tag });
  const labels = [
    { angle: fa.lin.slice(), text: linText },
    { angle: fa.quad.slice(), text: quadTextStr },
  ];
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

  return {
    frame, L, g, fa, gamma, rot, mirror, markFar, quadratic,
    e1, e2, kPoly, roots, cases, valid, invalid, K,
    linText, quadText: quadTextStr, spec, figure, model, askValue,
  };
}

// ---------------------------------------------------------------------------------------------
// self-check: re-solve the emitted label strings with the site's own parser + solver
// ---------------------------------------------------------------------------------------------

function selfCheck(a) {
  const p1 = parsePoly(a.linText, { var: 'x' });
  const p2 = parsePoly(a.quadText, { var: 'x' });
  if (!p1.ok || !p2.ok) return false;
  const lhs = a.K === null ? polySub(p1.poly, p2.poly) : polySub(polyAdd(p1.poly, p2.poly), polyConst(rat(a.K)));
  let list;
  if (a.quadratic) {
    const q = solveQuadratic(lhs);
    if (!q || q.kind !== 'two' || !q.exact) return false;
    list = q.roots;
  } else {
    const r = solveLinear(lhs);
    if (r === null || r === undefined) return false;
    list = [r];
  }
  const want = a.roots.map((r) => ratToNumber(r)).sort((x, y) => x - y);
  const have = list.map((r) => (typeof r === 'number' ? r : ratToNumber(r))).sort((x, y) => x - y);
  if (have.length !== want.length) return false;
  return want.every((w, i) => Math.abs(w - have[i]) < 1e-9);
}

// ---------------------------------------------------------------------------------------------
// item assembly
// ---------------------------------------------------------------------------------------------

const nm = (v, x, y) => angleName(v, x, y);
const mm = (v, x, y) => `{m ${angleName(v, x, y)}}`;
const an = (v, x, y) => `{ang ${angleName(v, x, y)}}`;

function relationLine(a) {
  const { g, fa, frame } = a;
  const v = g.v;
  if (frame === 'right') {
    const marked = a.markFar ? an(v, g.b, g.a) : an(v, g.b, g.d);
    const other = a.markFar ? an(v, g.b, g.d) : an(v, g.b, g.a);
    return { marked, other };
  }
  return { marked: null, other: null };
}

function buildStem(a) {
  const { g, fa, frame, linText, quadText } = a;
  const v = g.v;
  const lines = `{line ${g.e}${g.c}} and {line ${g.a}${g.d}}`;
  const l1 = `${mm(v, fa.lin[0], fa.lin[1])} = ${linText}`;
  const l2 = `${mm(v, fa.quad[0], fa.quad[1])} = ${quadText}`;
  const asks = fa.ask.map(([x, y]) => mm(v, x, y)).join(', ');
  if (frame === 'right') {
    const r = relationLine(a);
    return `Point ${v} is on ${lines}. ${l1}, ${l2}, and ${r.marked} is a right angle. Find x, ${asks}.`;
  }
  return `Point ${v} is on ${lines}. ${l1} and ${l2}. Find x, ${asks}.`;
}

function equationPart(a) {
  const { e1, e2, K, frame, g, fa } = a;
  const canonical = K === null
    ? `(${canonText(e1, 'x')})-(${canonText(e2, 'x')})`
    : `(${canonText(e1, 'x')})+(${canonText(e2, 'x')})-${K}`;
  const c1 = e1.c[0] ? Math.abs(e1.c[0].n) : 0;
  const c2 = e2.c[0] ? Math.abs(e2.c[0].n) : 0;
  const mustMention = K === null ? [c1 || c2].filter((n) => n > 0) : [K];
  const v = g.v;
  const why = frame === 'right'
    ? `ray ${v}${g.c} splits the right angle ${nm(v, g.b, g.d)}`
    : frame === 'linearpair'
      ? `${nm(v, fa.lin[0], fa.lin[1])} and ${nm(v, fa.quad[0], fa.quad[1])} are a linear pair`
      : `${nm(v, fa.lin[0], fa.lin[1])} and ${nm(v, fa.quad[0], fa.quad[1])} are vertical angles`;
  return {
    id: 'setup', type: 'equation', optional: true,
    prompt: `Write the equation (${why}) — skippable, graded when tried`,
    canonical, var: 'x', mustMention,
  };
}

function misconceptionsFor(a) {
  const { g, fa, frame, e1, e2, K } = a;
  const v = g.v;
  const out = [];
  const sum = `(${canonText(e1, 'x')})+(${canonText(e2, 'x')})`;
  if (frame === 'right') {
    out.push({
      part: 'setup', answer: `${sum}=180`, tag: 'vertical-set-180',
      msg: `${nm(v, fa.lin[0], fa.lin[1])} and ${nm(v, g.c, g.d)} fill the RIGHT angle ${nm(v, g.b, g.d)}, so the sum is 90, not 180.`,
    });
    out.push({
      part: 'setup', answer: `${canonText(e1, 'x')}=${canonText(e2, 'x')}`, tag: 'linear-pair-set-equal',
      msg: 'Those two angles are not equal — together they fill the right angle, so add them and set the sum to 90.',
    });
  } else if (frame === 'linearpair') {
    out.push({
      part: 'setup', answer: `${canonText(e1, 'x')}=${canonText(e2, 'x')}`, tag: 'linear-pair-set-equal',
      msg: `${nm(v, fa.lin[0], fa.lin[1])} and ${nm(v, fa.quad[0], fa.quad[1])} sit next to each other on a straight line — a linear pair adds to 180; only vertical angles are equal.`,
    });
    out.push({ part: 'setup', answer: `${sum}=90`, tag: 'vertical-set-180', msg: 'A linear pair adds to 180, not 90 — nothing here is marked as a right angle.' });
  } else {
    out.push({ part: 'setup', answer: `${sum}=180`, tag: 'vertical-set-180', msg: `${nm(v, fa.lin[0], fa.lin[1])} and ${nm(v, fa.quad[0], fa.quad[1])} are VERTICAL angles — they are equal, not supplementary.` });
  }
  return out;
}

function hintsFor(a) {
  const { g, fa, frame, linText, quadText, K, e1, e2, quadratic, kPoly } = a;
  const v = g.v;
  const eqLine = K === null
    ? `${linText} = ${quadText}`
    : `(${linText}) + (${quadText}) = ${K}`;
  const zero = `${polyText(kPoly, 'x')} = 0`;
  const marked = a.markFar ? an(v, g.b, g.a) : an(v, g.b, g.d);
  const rightLine = a.markFar
    ? `The square marks ${marked} as a right angle, and ${g.a}-${v}-${g.d} is a straight line, so ${an(v, g.b, g.d)} is a right angle too.`
    : `The square marks ${marked} as a right angle.`;
  const h1 = frame === 'right'
    ? `${an(v, g.a, g.e)} and ${an(v, g.c, g.d)} are vertical angles (the two lines cross at ${v}), so they have the same measure. ${rightLine}`
    : frame === 'linearpair'
      ? `${an(v, fa.lin[0], fa.lin[1])} and ${an(v, fa.quad[0], fa.quad[1])} share a ray and their outer sides are opposite rays — a linear pair, so their measures add to 180°.`
      : `${an(v, fa.lin[0], fa.lin[1])} and ${an(v, fa.quad[0], fa.quad[1])} are across the vertex from each other — vertical angles, so their measures are equal.`;
  const h2 = frame === 'right'
    ? `Ray ${v}${g.c} splits the right angle ${an(v, g.b, g.d)}, so the two labelled pieces add to 90: ${eqLine}`
    : `Write the relation with the two expressions: ${eqLine}`;
  const h3 = quadratic
    ? `Collect everything on one side: ${zero}. Factor, set each factor to 0, then substitute EACH root back into the expressions — a root only survives if every measure it gives is positive.`
    : `Collect everything on one side: ${zero}. Solve for x, then substitute it back into the expressions.`;
  return [h1, h2, h3];
}

function solutionFor(a) {
  const { g, fa, frame, linText, quadText, K, kPoly, valid, invalid, quadratic, e2, e1 } = a;
  const v = g.v;
  const steps = [];
  if (frame === 'right') {
    steps.push({ say: 'Vertical angles are congruent — the two lines cross at ' + v + '.', math: `${mm(v, g.c, g.d)} = ${quadText}` });
    const markedName = a.markFar ? `∠${nm(v, g.b, g.a)}` : `∠${nm(v, g.b, g.d)}`;
    const transfer = a.markFar
      ? `The square marks ${markedName} = 90°, and ${g.a}-${v}-${g.d} is a straight line, so ∠${nm(v, g.b, g.d)} is 90° too. Ray ${v}${g.c} splits it.`
      : `The square marks ${markedName} = 90°, and ray ${v}${g.c} splits it.`;
    steps.push({ say: transfer, math: `${mm(v, fa.lin[0], fa.lin[1])} + ${mm(v, g.c, g.d)} = 90` });
  } else if (frame === 'linearpair') {
    steps.push({ say: 'The two labelled angles are a linear pair (their outer sides are opposite rays), so they are supplementary.', math: `${mm(v, fa.lin[0], fa.lin[1])} + ${mm(v, fa.quad[0], fa.quad[1])} = 180` });
  } else {
    steps.push({ say: 'The two labelled angles are vertical angles, so they are congruent.', math: `${mm(v, fa.lin[0], fa.lin[1])} = ${mm(v, fa.quad[0], fa.quad[1])}` });
  }
  steps.push({ say: 'Substitute the expressions from the figure.', math: K === null ? `${linText} = ${quadText}` : `(${linText}) + (${quadText}) = ${K}` });
  steps.push({ say: 'Collect every term on one side.', math: `${polyText(kPoly, 'x')} = 0` });
  if (quadratic) {
    const rs = a.roots.map(showRoot).join('  or  x = ');
    steps.push({ say: 'Factor and use the zero product property.', math: `x = ${rs}` });
  } else {
    steps.push({ say: 'Solve for x.', math: `x = ${showRoot(a.roots[0])}` });
  }
  for (const c of a.cases) {
    const v1 = fmtMeasure(c.v1);
    const v2 = fmtMeasure(c.v2);
    if (!c.ok) {
      steps.push({
        say: `Case x = ${showRoot(c.root)}: substitute it into both expressions — one of them comes out impossible, so this root is rejected.`,
        math: `${mm(v, fa.lin[0], fa.lin[1])} = ${v1},   ${mm(v, fa.quad[0], fa.quad[1])} = ${v2}`,
      });
      continue;
    }
    const asks = fa.ask.map(([x, y], i) => `${mm(v, x, y)} = ${fmtMeasure(a.askValue(c, fa.askFrom[i]))}`).join(',   ');
    steps.push({
      say: `Case x = ${showRoot(c.root)}: substitute, then read the asked measures off the relations.`,
      math: `${mm(v, fa.lin[0], fa.lin[1])} = ${v1},   ${mm(v, fa.quad[0], fa.quad[1])} = ${v2}`,
    });
    steps.push({ say: 'The two measures the question asks for.', math: asks });
  }
  if (quadratic && valid.length === 2) {
    steps.push({ say: 'Both roots give positive angle measures, so both cases are kept — the answer is two cases, not one.', math: a.roots.map((r) => `x = ${showRoot(r)}`).join('   ·   ') });
  } else if (quadratic && invalid.length) {
    steps.push({ say: `x = ${showRoot(invalid[0].root)} is rejected (it makes an angle measure impossible), so only one case survives.`, math: `x = ${showRoot(valid[0].root)}` });
  }
  return steps;
}

function partsFor(a) {
  const { g, fa, quadratic, valid, invalid, roots } = a;
  const v = g.v;
  const parts = [equationPart(a)];
  const askField = (c, i) => {
    const [x, y] = fa.ask[i];
    return {
      key: angleName(v, x, y),
      label: `m∠${angleName(v, x, y)}`,
      answer: fmtMeasure(a.askValue(c, fa.askFrom[i])),
      wedge: angleId(x, y),
    };
  };

  if (!quadratic) {
    const c = valid[0];
    parts.push({
      id: 'all', type: 'multi', prompt: 'x and the two angle measures',
      fields: [{ key: 'x', label: 'x =', answer: fmtRoot(c.root) }, askField(c, 0), askField(c, 1)],
    });
    return parts;
  }

  parts.push({ id: 'x', type: 'roots', var: 'x', label: 'x =', answer: roots.map(fmtRoot), mustMention: null });

  const badRoot = invalid[0];
  if (badRoot) {
    const which = badRoot.n1 <= 0 || badRoot.n2 <= 0 ? 'negative-angle' : 'angle-over-180';
    const zero = badRoot.n1 === 0 || badRoot.n2 === 0;
    const key = zero ? 'zero-angle' : which;
    const text = zero ? 'zero angle' : which === 'negative-angle' ? 'negative angle measure' : 'angle measure over 180';
    parts.push({
      id: 'keep', type: 'reject', of: 'x',
      valid: valid.map((c) => fmtRoot(c.root)), rejected: [fmtRoot(badRoot.root)],
      reason: text, reasonKey: key,
      distractors: ['both values work', `x = ${fmtRoot(valid[0].root)} is the one that fails`, `x = ${fmtRoot(badRoot.root)} does not satisfy the equation`],
    });
  } else {
    const neg = roots.find((r) => ratToNumber(r) < 0);
    parts.push({
      id: 'keep', type: 'reject', of: 'x', askReject: true,
      valid: roots.map(fmtRoot), rejected: [],
      reason: 'both give positive angle measures', reasonKey: 'both-valid',
      distractors: [
        neg ? `${fmtRoot(neg)} is negative so reject it` : 'the larger root is too big, so reject it',
        'only integers are allowed',
        `x = ${fmtRoot(roots[0])} makes m\u2220${nm(v, fa.lin[0], fa.lin[1])} too big`,
      ],
    });
  }

  if (valid.length >= 2) {
    parts.push({
      id: 'cases', type: 'cases', of: 'x', prompt: 'One case per root',
      cols: [{ key: 'x', label: 'x' }, ...fa.ask.map(([x, y]) => ({ key: angleName(v, x, y), label: `m∠${angleName(v, x, y)}`, wedge: angleId(x, y) }))],
      rows: valid.map((c) => {
        const row = { x: fmtRoot(c.root) };
        fa.ask.forEach(([x, y], i) => { row[angleName(v, x, y)] = fmtMeasure(a.askValue(c, fa.askFrom[i])); });
        return row;
      }),
    });
  } else {
    const c = valid[0];
    parts.push({ id: 'measures', type: 'multi', prompt: 'The two measures for the surviving root', fields: [askField(c, 0), askField(c, 1)] });
  }
  return parts;
}

function assemble(a) {
  const { g, fa, quadratic } = a;
  const v = g.v;
  const parts = partsFor(a);
  const misc = misconceptionsFor(a);
  if (quadratic) {
    misc.unshift({ part: 'x', answer: fmtRoot(a.roots[0]), tag: 'forgot-second-root', msg: 'There is a second root — set each factor to 0.' });
    misc.push({ part: 'cases', answer: fmtMeasure(a.valid[0].v1), tag: 'swapped-fields', msg: `That is ${nm(v, fa.lin[0], fa.lin[1])}, the other labelled angle — read the column headings.` });
    if (a.valid.length === 2) misc.push({ part: 'cases', answer: fmtRoot(a.roots[0]), tag: 'missing-case', msg: 'Two roots, two cases — work the other root out as well.' });
    if (a.invalid.length) misc.push({ part: 'keep', answer: `keep ${fmtRoot(a.invalid[0].root)}`, tag: 'kept-invalid-root', msg: `x = ${fmtRoot(a.invalid[0].root)} makes an angle measure impossible — it cannot be kept.` });
    else misc.push({ part: 'keep', answer: `reject ${fmtRoot(a.roots[1])}`, tag: 'rejected-valid-root', msg: 'A negative x is not automatically wrong — substitute it and check the measures before rejecting.' });
  }
  const rows = a.valid.map((c) => {
    const row = { x: fmtRoot(c.root) };
    fa.ask.forEach(([x, y], i) => { row[angleName(v, x, y)] = fmtMeasure(a.askValue(c, fa.askFrom[i])); });
    return row;
  });
  const answerData = { x: a.valid.map((c) => fmtRoot(c.root)), cases: rows };
  const answer = rows
    .map((row) => Object.entries(row).map(([k, val]) => (k === 'x' ? `x = ${val.replace('-', '\u2212')}` : `m\u2220${k} = ${val}\u00b0`)).join(', '))
    .join('   \u00b7   ');
  return {
    tier: quadratic ? 4 : 3,
    par: quadratic ? 300 : 180,
    skills: quadratic ? ['FIG-ALG', 'QUAD-SOLVE'] : ['FIG-ALG'],
    needs: quadratic ? ['QUAD-SOLVE'] : [],
    forCards: quadratic ? ['ang-10'] : ['doc-07'],
    params: {
      frame: a.frame, letters: a.L, gamma: a.gamma, rotate: a.rot, mirror: a.mirror,
      markFar: a.markFar, K: a.K,
      lin: canonText(a.e1, 'x'), quad: canonText(a.e2, 'x'),
      roots: a.roots.map(fmtRoot), valid: a.valid.map((c) => fmtRoot(c.root)),
    },
    stem: buildStem(a),
    prompt: buildStem(a),
    figure: a.figure,
    parts,
    answer,
    answerData,
    hints: hintsFor(a),
    solution: solutionFor(a),
    misconceptions: misc,
  };
}

/** The contract's per-template solver check: the emitted figure must still be clean. */
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
  for (const p of validate(model)) out.push(`figure: ${p}`);
  for (const p of accidentalSums(model)) out.push(`figure: accidental sum ${p.a} + ${p.b} = ${p.sum}`);
  for (const p of lint(model, { widthPx: 343 })) out.push(`figure: ${p}`);
  return out;
}

// ---------------------------------------------------------------------------------------------
// the fixed exemplars (used when 200 attempts all fail — never in practice; tested)
// ---------------------------------------------------------------------------------------------

let EXEMPLAR = { true: null, false: null };
function exemplarDraft(quadratic) {
  const memo = EXEMPLAR[String(quadratic)];
  if (memo) return memo;
  // A deterministic fallback built through the same pipeline from a fixed private stream.
  const rng = fixedRng(quadratic ? 0x5eed1a3b : 0x1a3b5eed);
  for (let i = 0; i < 4000; i++) {
    const a = attempt(rng, { quadratic });
    if (a && selfCheck(a)) {
      const draft = assemble(a);
      EXEMPLAR = { ...EXEMPLAR, [String(quadratic)]: draft };
      return draft;
    }
  }
  throw new Error('figxlines: no exemplar could be built');
}

/** A tiny self-contained mulberry32 so the exemplar never depends on the caller's stream. */
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

// ---------------------------------------------------------------------------------------------
// public generators
// ---------------------------------------------------------------------------------------------

/** One draw for the contract's re-roll loop: a draft, or null to roll again on the same stream. */
export function drawXlinesL(rng) {
  const a = attempt(rng, { quadratic: false });
  return a && selfCheck(a) ? assemble(a) : null;
}
export function drawXlinesQ(rng) {
  const a = attempt(rng, { quadratic: true });
  return a && selfCheck(a) ? assemble(a) : null;
}

const SHARED = { version: TEMPLATE_VERSION, module: 'M6', requireDistractors: false, verify: verifyFigure };

/** `T-fig-xlines-L` — two lines (+ an optional perpendicular ray), linear labels, one case. */
export const genXlinesL = makeGen('T-fig-xlines-L', drawXlinesL, {
  ...SHARED, skills: ['FIG-ALG'], tier: 3, par: 180, sheet: 'DOC',
  exemplar: () => exemplarDraft(false),
});

/** `T-fig-xlines-Q` — the same figures with a quadratic label: roots, reject, cases (`ang-10`). */
export const genXlinesQ = makeGen('T-fig-xlines-Q', drawXlinesQ, {
  ...SHARED, skills: ['FIG-ALG', 'QUAD-SOLVE'], tier: 4, par: 300, sheet: 'AP-4',
  exemplar: () => exemplarDraft(true),
});

export default { genXlinesL, genXlinesQ, TEMPLATE_VERSION };
