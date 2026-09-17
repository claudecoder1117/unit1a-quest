// grader/pairs.js — T04. The `pairs` part (COMPOSED S3 "pairs"): "3 pairs of supplementary angles",
// "1 pair of vertical angles", "2 non-examples of adjacent angles" on a figure.
//
//   gradePairs(part, picks, model, ctx) → { ok, kind, credit, msg, tags, normalized, results, valid, count, relation }
//   grade(part, raw, ctx)               → the S3 dispatcher shape: raw = picks, model from ctx.model / ctx.figure
//   parseName(raw, model, v?)            → { ok, x, v, y, key, name, id, shown, angle } | { ok:false, kind:'malformed', msg }
//
// part:  { type:'pairs', relation:'supplementary'|'complementary'|'vertical'|'linearPair'|'adjacent'|'nonAdjacent', count:3 }
// picks: [[nameA, nameB], …] — every pair the student has locked so far, oldest first; each name is
//        whatever the wedge, side list or typed field produced: '∠GFC', 'angle GFC', '<GFC', 'GFC',
//        a wedge id 'C-G', an alias 'UL', or an angle object from figure/model.js.
// model: the resolved figure (figure/model.js resolve(figure, card.figure)) — rename already applied,
//        so letters are the ones the student sees.
//
// Every pair is judged structurally by model.relate(): linear pair / vertical / adjacent from ray
// sharing and opposite rays; supplementary / complementary from the generic instance. Feedback shows
// the arithmetic of the DRAWN measures ("59 + 31 = 90 — that's complementary, not supplementary").
// Malformed names, straight angles and repeats are free (never an attempt, Global rule 2):
// malformed → kind 'malformed'; a repeated pair → kind 'almost' "already used". A valid pair that
// does not yet complete the count is kind 'almost' (free, credit = valid/count). ∠XFY ≡ ∠YFX.
//
// Emitted tags (all catalogued in data/misconceptions.js):
// tags:['vertex-not-middle', 'confused-comp-supp', 'confused-vertical-linear', 'not-adjacent',
//       'adjacent-not-linear', 'adjacent-as-nonexample']

import { relate, findAngle, getAngle, normRelation, RELATIONS, fanAt, rayByName, resolve, angles } from '../figure/model.js';   // page r2: angles() for the example name
import { getFigure } from '../../data/figures.js';

/** The S3 typed-name regex, applied after trim + NFKC + uppercase + whitespace collapse. */
export const NAME_RE = /^(∠|<|ANGLE\s*)?([A-Z])([A-Z])([A-Z])$/;

const fmt = (d) => String(Math.round(d * 100) / 100);
const ang = (n) => `∠${n}`;

/** Normalise raw typed text: trim, NFKC, unify angle glyphs, drop a leading "m", uppercase, collapse spaces. */
export function normalizeName(raw) {
  if (raw == null) return '';
  let s = String(raw).normalize('NFKC').trim();
  s = s.replace(/[∠⦟⊿∡]/g, '∠');          // ∠ variants
  s = s.replace(/^m\s*(?=[∠<])/i, '');                         // m∠GFC → ∠GFC
  s = s.replace(/[°º˚]/g, '').replace(/\s+/g, ' ').toUpperCase();
  s = s.replace(/^ANGLE\s*/, 'ANGLE ');
  return s.trim();
}

/**
 * Parse one angle reference against the model. Accepts typed spellings (regex above), a wedge id
 * ('C-D' — fan vertex assumed, or 'C-D@B' for polys), an alias ('UL') or an angle object.
 * Returns { ok:true, x, v, y, key, name, id, shown, angle } or { ok:false, kind:'malformed', msg, tags }.
 */
export function parseName(raw, model, vertexHint) {
  const vertex = vertexHint ?? (model.kind === 'fan' ? model.vertex : null);
  if (raw && typeof raw === 'object') {
    const a = getAngle(model, raw);
    return a ? ok(a, ang(a.name)) : bad('pick an angle from the figure');
  }
  const s = normalizeName(raw);
  if (!s) return bad('type an angle like ∠GFC — three letters, vertex in the middle');

  // wedge ids / aliases straight from the SVG or side list
  const idm = /^([A-Z])-([A-Z])(?:@([A-Z]))?$/.exec(s);
  if (idm) {
    const a = findAngle(model, idm[1], idm[2], idm[3] ?? vertex ?? undefined);
    if (!a) return bad(`no angle ${idm[1]}${idm[3] ?? vertex ?? ''}${idm[2]} in this figure`);
    if (a.straight) return straight(a);
    return ok(a, ang(a.name));
  }
  const alias = getAngle(model, s);
  if (alias && alias.alias === s) return ok(alias, alias.label ?? alias.name);

  const m = NAME_RE.exec(s);
  if (!m) {
    const letters = s.replace(/^(∠|<|ANGLE\s*)/, '').replace(/[^A-Z]/g, '');
    if (letters.length === 2) {
      const hint = vertex && !letters.includes(vertex) ? `∠${letters[0]}${vertex}${letters[1]} names the angle at ${vertex}` : `like ∠${vertex ?? 'GFC'.charAt(1)}…`;
      return bad(`three letters, vertex in the middle — ${vertex && !letters.includes(vertex) ? hint : 'the vertex letter between the two points'}`, ['vertex-not-middle']);
    }
    if (letters.length === 1) return bad('three letters, vertex in the middle (like ∠GFC)');
    if (letters.length > 3) return bad('three letters only — the vertex in the middle, one point on each side');
    return bad('name the angle with three letters, vertex in the middle (like ∠GFC)');
  }
  const [, , X, V, Y] = m;
  const shown = `∠${X}${V}${Y}`;
  const fan = fanAt(model, V);
  if (!fan) {
    // V is not a vertex: the student put the vertex first/last, or the letter is unknown
    const isVertex = (n) => !!fanAt(model, n);
    const known = (n) => isVertex(n) || (model.kind === 'fan' ? !!rayByName(model, n) : !!model.points?.[n]);
    const vtx = [X, Y].find(isVertex);
    if (vtx) { const [p, q] = [X, V, Y].filter(n => n !== vtx); return bad(`the vertex goes in the middle — ${shown} should be ∠${p}${vtx}${q}`, ['vertex-not-middle']); }
    if (!known(V)) return bad(`there's no point ${V} in this figure`);
    return bad(`the vertex goes in the middle — ${V} is not a vertex here`, ['vertex-not-middle']);
  }
  if (X === Y) return bad(`${shown} uses the same point twice — two different points, one on each side`);
  if (X === V || Y === V) return bad(`the vertex goes in the middle — ${shown} repeats the vertex`, ['vertex-not-middle']);
  const a = findAngle(model, X, Y, V);
  if (!a) {
    const missing = [X, Y].find(n => !rayByName(fan, n));
    if (missing) return bad(`there's no point ${missing} on this figure`);
    return bad(`${shown} is not an angle of this figure`);
  }
  if (a.straight) return straight(a, shown);
  return ok(a, shown);

  function ok(angle, shownName) { return { ok: true, x: angle.x, v: angle.v, y: angle.y, key: angle.key, name: angle.name, id: angle.id, shown: shownName ?? angle.name, angle, deg: angle.deg }; }
  function bad(msg, tags = []) { return { ok: false, kind: 'malformed', msg, tags }; }
  function straight(angle, shownName) {
    const n = shownName ?? ang(angle.name);
    return { ok: false, kind: 'malformed', straight: true, msg: `${n.startsWith('∠') ? n : ang(n)} is a straight angle (180°) — ${angle.v}${angle.x} and ${angle.v}${angle.y} are opposite rays. Pick an angle smaller than 180°.`, tags: [] };
  }
}

// ------------------------------------------------------------------------------------------------
// per-relation verdict lines

function verdict(rel, r, A, B) {
  const a = A.shown, b = B.shown, da = fmt(r.a.deg), db = fmt(r.b.deg), sum = fmt(r.sum);
  const V = r.a.v;
  const sideNames = () => {
    const restA = r.a.a === r.shared ? r.a.b : r.a.a, restB = r.b.a === r.shared ? r.b.b : r.b.a;
    return { shared: `${V}${r.shared}`, restA: `${V}${restA}`, restB: `${V}${restB}`, restARaw: restA, restBRaw: restB };
  };
  const arithmetic = `${da} + ${db} = ${sum}`;
  const lpWhy = () => { const s = sideNames(); return `share ray ${s.shared}, and ${s.restA} and ${s.restB} are opposite rays`; };
  switch (rel) {
    case 'supplementary':
      if (r.supplementary) return { ok: true, msg: `${arithmetic} — supplementary ✓${r.linearPair ? ' (a linear pair)' : ''}` };
      if (r.sameAngle) return { ok: false, msg: `${a} and ${b} are the same angle — pick two different angles`, tags: [] };
      if (r.complementary) return { ok: false, msg: `${arithmetic} — that's complementary, not supplementary`, tags: ['confused-comp-supp'] };
      if (r.vertical) return { ok: false, msg: `${a} and ${b} are vertical angles (${da} = ${db}) — congruent, not supplementary`, tags: ['confused-vertical-linear'] };
      return { ok: false, msg: `${arithmetic}, not 180 — supplementary angles add to 180° (every linear pair does)`, tags: [] };
    case 'complementary':
      if (r.complementary) return { ok: true, msg: `${arithmetic} — complementary ✓${r.adjacent ? '' : ' (not adjacent, and that is fine)'}` };
      if (r.sameAngle) return { ok: false, msg: `${a} and ${b} are the same angle — pick two different angles`, tags: [] };
      if (r.supplementary) return { ok: false, msg: `${arithmetic} — that's supplementary${r.linearPair ? ' (a linear pair)' : ''}, not complementary`, tags: ['confused-comp-supp'] };
      return { ok: false, msg: `${arithmetic}, not 90 — complementary angles add to 90°`, tags: [] };
    case 'vertical':
      if (r.vertical) return { ok: true, msg: `${a} and ${b} are vertical angles — across the vertex from each other, both ${da}° ✓` };
      if (r.sameAngle) return { ok: false, msg: `${a} and ${b} are the same angle — pick two different angles`, tags: [] };
      if (r.linearPair) return { ok: false, msg: `${a} and ${b} are a linear pair (${arithmetic}), not vertical angles — vertical angles sit across the X from each other`, tags: ['confused-vertical-linear'] };
      if (r.adjacent) return { ok: false, msg: `${a} and ${b} share ray ${V}${r.shared} — vertical angles never share a side`, tags: ['confused-vertical-linear'] };
      if (r.overlap) return { ok: false, msg: `${a} and ${b} overlap — vertical angles are separate angles across the vertex`, tags: [] };
      return { ok: false, msg: `${a} and ${b} aren't formed by the same two lines (${da}° and ${db}°) — vertical angles need both sides to be opposite rays`, tags: [] };
    case 'linearPair':
      if (r.linearPair) return { ok: true, msg: `${a} and ${b} ${lpWhy()} — linear pair ✓ (${arithmetic})` };
      if (r.sameAngle) return { ok: false, msg: `${a} and ${b} are the same angle — pick two different angles`, tags: [] };
      if (r.vertical) return { ok: false, msg: `those are vertical angles (${da} = ${db}), not a linear pair — a linear pair sits side by side on a line`, tags: ['confused-vertical-linear'] };
      if (r.adjacent) { const s = sideNames(); return { ok: false, msg: `adjacent, but ${s.restA} and ${s.restB} aren't opposite rays — ${arithmetic}, not 180`, tags: ['adjacent-not-linear'] }; }
      if (r.supplementary) return { ok: false, msg: `${arithmetic}, but they don't share a side — supplementary, not a linear pair`, tags: ['not-adjacent'] };
      if (r.overlap) return { ok: false, msg: `${a} and ${b} overlap — a linear pair is two adjacent angles whose outer sides make a line`, tags: ['not-adjacent'] };
      return { ok: false, msg: `${a} and ${b} have no common side — a linear pair must be adjacent`, tags: ['not-adjacent'] };
    case 'adjacent':
      if (r.adjacent) return { ok: true, msg: `${a} and ${b} share vertex ${V} and ray ${V}${r.shared} with no overlap — adjacent ✓` };
      if (r.sameAngle) return { ok: false, msg: `${a} and ${b} are the same angle — pick two different angles`, tags: [] };
      if (r.overlap) return { ok: false, msg: `${a} and ${b} share ray ${V}${r.shared} but ${r.contains ? 'one lies inside the other' : 'their interiors overlap'} — adjacent angles share a side and nothing else`, tags: ['not-adjacent'] };
      if (r.vertical) return { ok: false, msg: `${a} and ${b} are vertical angles — across the vertex, no common side, so not adjacent`, tags: ['not-adjacent'] };
      return { ok: false, msg: `${a} and ${b} have no common side — adjacent angles share the vertex and one ray`, tags: ['not-adjacent'] };
    case 'nonAdjacent':
      if (r.sameAngle) return { ok: false, msg: `${a} and ${b} are the same angle — pick two different angles`, tags: [] };
      if (r.nonAdjacent) {
        if (r.overlap) return { ok: true, msg: `${a} and ${b} share ray ${V}${r.shared} but ${r.contains ? 'one lies inside the other' : 'overlap'} — not adjacent ✓` };
        return { ok: true, msg: `${a} and ${b} have no common side${r.vertical ? ' (vertical angles)' : r.complementary ? ` — ${arithmetic}, complementary but not adjacent` : ''} — not adjacent ✓` };
      }
      return { ok: false, msg: `${a} and ${b} share ray ${V}${r.shared} with no overlap — they ARE adjacent${r.linearPair ? ' (a linear pair, even)' : ''}`, tags: ['adjacent-as-nonexample'] };
    default:
      return { ok: false, msg: `unknown relation ${rel}`, tags: [] };
  }
}

// ------------------------------------------------------------------------------------------------

/**
 * Grade every pick. Duplicates (same two angles in any order, any spelling) are free: "already used".
 * ok ⇔ at least part.count distinct valid pairs. kind reflects the LAST pick unless the part is
 * complete: 'correct' | 'wrong' | 'almost' (valid-but-incomplete, or repeat) | 'malformed'.
 */
export function gradePairs(part, picks, model, ctx = {}) {
  const relation = normRelation(part?.relation);
  if (!relation) throw new Error(`pairs: part.relation must be one of ${RELATIONS.join(', ')} (got ${part?.relation})`);
  if (!model || (model.kind !== 'fan' && model.kind !== 'poly')) throw new Error('pairs: a resolved figure model is required');
  const count = Math.max(1, Number(part.count) || 1);
  let list = Array.isArray(picks) ? picks : [];
  if (list.length === 2 && !Array.isArray(list[0]) && !Array.isArray(list[1]) && (typeof list[0] === 'string' || (list[0] && list[0].key))) list = [list]; // a single pair
  const results = [];
  const seen = new Map();          // pairKey → result index
  const vhint = ctx.vertex ?? part.vertex;
  for (const pick of list) {
    const [pa, pb] = Array.isArray(pick) ? pick : [pick?.a, pick?.b];
    const A = parseName(pa, model, vhint), B = parseName(pb, model, vhint);
    if (!A.ok || !B.ok) {
      const first = !A.ok ? A : B;
      results.push({ ok: false, kind: 'malformed', msg: first.msg, tags: first.tags ?? [], raw: [pa, pb], straight: !!first.straight });
      continue;
    }
    if (A.key === B.key) { results.push({ ok: false, kind: 'malformed', msg: `${A.shown} and ${B.shown} are the same angle — a pair needs two different angles`, tags: [], raw: [pa, pb], a: A, b: B }); continue; }
    const key = [A.key, B.key].sort().join('|');
    const pairName = `${A.shown} + ${B.shown}`;
    if (seen.has(key)) {
      const prev = results[seen.get(key)];
      results.push({ ok: false, kind: 'almost', dup: true, msg: prev.ok ? `${pairName} — already used, pick a different pair` : `${pairName} — already tried; it wasn't a match`, tags: [], raw: [pa, pb], a: A, b: B, key, pairName });
      continue;
    }
    const r = relate(model, A.angle, B.angle);
    if (!r || !r.sameVertex) { results.push({ ok: false, kind: 'wrong', msg: `${A.shown} and ${B.shown} sit at different vertices — pick two angles at ${A.v}`, tags: [], raw: [pa, pb], a: A, b: B, key, pairName }); seen.set(key, results.length - 1); continue; }
    const v = verdict(relation, r, A, B);
    seen.set(key, results.length);
    results.push({ ok: v.ok, kind: v.ok ? 'correct' : 'wrong', msg: v.msg, tags: v.ok ? [] : (v.tags ?? []), raw: [pa, pb], a: A, b: B, key, pairName, sum: r.sum, rel: r });
  }
  const validResults = results.filter(r => r.ok);
  const valid = validResults.length;
  const ok = valid >= count;
  const credit = Math.min(1, valid / count);
  const last = results[results.length - 1];
  let kind, msg;
  if (ok) { kind = 'correct'; msg = last?.ok ? `${last.msg} — ${count} of ${count}` : `${count} of ${count} pairs found`; }
  else if (!last) { kind = 'malformed'; msg = `pick two angles from the figure (or type a name like ∠${angles(model)[0]?.name ?? 'ABC'})`; }   // page r2: a name this figure has
  else if (last.ok) { kind = 'almost'; msg = `${last.msg} — ${valid} of ${count}`; }
  else { kind = last.kind; msg = last.msg; }
  const tags = ok ? [] : [...new Set((last?.tags ?? []))];
  return { ok, kind, credit, msg, tags, normalized: validResults.map(r => r.pairName), results, valid, count, relation };
}

// ------------------------------------------------------------------------------------------------
// model resolution for the dispatcher: a resolved model, a raw figure (kind fan/poly), or the card's
// figure spec {id:'F1', rename, labels, …} (resolved against data/figures.js and memoised)

const modelCache = new Map();
/**
 * Whatever the caller has → a resolved model: ctx.model (already resolved) · ctx.figure / part.figure
 * as a resolved model, a raw figure object (has `kind`) or a card figure spec (has `id`, resolved
 * through data/figures.js with its rename/labels/rotate/mirror). Returns null when nothing usable.
 */
export function resolveModel(part, ctx = {}) {
  const cand = ctx.model ?? ctx.figure ?? part?.model ?? part?.figure ?? null;
  if (!cand || typeof cand !== 'object') return null;
  if (cand.kind === 'fan' || cand.kind === 'poly') return cand.figId ? cand : resolve(cand, {});
  if (typeof cand.id === 'string') {
    const key = JSON.stringify([cand.id, cand.rename ?? null, cand.labels ?? null, cand.rotate ?? 0, !!cand.mirror, cand.ticks ?? null]);
    if (modelCache.has(key)) return modelCache.get(key);
    const fig = getFigure(cand.id);
    if (!fig) return null;
    const m = resolve(fig, cand);
    if (modelCache.size >= 100) modelCache.delete(modelCache.keys().next().value);
    modelCache.set(key, m);
    return m;
  }
  return null;
}

/** S3 dispatcher shape: grade(part, raw, ctx) with raw = picks and the figure on ctx.model / ctx.figure / part.figure. */
export function grade(part, raw, ctx = {}) {
  const model = resolveModel(part, ctx);
  if (!model) throw new Error('pairs: no figure — pass ctx.model (resolved) or ctx.figure / part.figure ({id, rename, labels})');
  return gradePairs(part, raw, model, ctx);
}

export default grade;
