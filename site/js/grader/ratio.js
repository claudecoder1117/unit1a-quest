// ratio.js — the `ratio` grader (COMPOSED S3 "Parts · ratio"): `a:b`, `a/b`, `a to b`; reduced by gcd;
// ORDERED (3:2 ≠ 2:3); unreduced → correct with the nudge "simplest form is 3:2"; a bare number →
// malformed "write a ratio like 3:2". DOM-free; never throws on student input.
//
// grade(part, raw, ctx) → { ok, kind, credit, msg, tags, normalized:'54:36', reduced:'3:2', nudge:boolean, values:[a, b] }
//   part { type:'ratio', answer:'3:2' | [3, 2] | {a, b}, tol?, misconceptions?:[{answer:'3:7', tag, msg}] }
//   raw  string | [a, b] | {a, b}
//   ctx  { misconceptions?, card? }   — card misconceptions are matched by reduced-ratio equality (wp-10: 1:29, 3:7)
//
// tags:['unreduced-ratio','reversed-ratio']

import { parseNumber, isRat, ratIsInt, gcd } from './normalize.js';
import { result, isBlank, toVal, show, tolOf, misconceptionsOf, inScope } from './num.js';

const MALFORMED = 'Write a ratio like 3:2.';

/** "54 : 36" / "54/36" / "54 to 36" / [54, 36] / {a, b} → { ok, a, b, texts } */
export function parseRatio(raw) {
  if (isBlank(raw)) return { ok: false, err: 'empty', msg: 'Type the ratio.' };
  let a, b, texts;
  if (Array.isArray(raw)) {
    if (raw.length !== 2) return { ok: false, err: 'shape', msg: MALFORMED };
    [a, b] = raw.map(toVal); texts = raw.map(show);
  } else if (raw && typeof raw === 'object' && !isRat(raw)) {
    a = toVal(raw.a ?? raw[0]); b = toVal(raw.b ?? raw[1]); texts = [show(raw.a ?? raw[0]), show(raw.b ?? raw[1])];
  } else {
    let s = String(raw).normalize('NFKC').trim().toLowerCase()
      .replace(/[−–—]/g, '-').replace(/[∶：]/g, ':').replace(/÷/g, ':')
      .replace(/^\s*(ratio|angle\s*:\s*complement|answer)?\s*[=:]\s*(?=[-\d(])/, '')
      .replace(/\s+to\s+/g, ':');
    if (s.includes(':')) {
      const parts = s.split(':').map((t) => t.trim());
      if (parts.length !== 2 || parts.some((t) => !t)) return { ok: false, err: 'shape', msg: MALFORMED };
      const [pa, pb] = parts.map((t) => parseNumber(t));
      if (!pa.ok || !pb.ok) return { ok: false, err: 'parse', msg: MALFORMED };
      a = pa.value; b = pb.value; texts = parts;
    } else if (/^[^/]+\/[^/]+$/.test(s) && !/[a-z]/.test(s)) {
      const [pa, pb] = s.split('/').map((t) => t.trim());
      const ra = parseNumber(pa), rb = parseNumber(pb);
      if (!ra.ok || !rb.ok) return { ok: false, err: 'parse', msg: MALFORMED };
      a = ra.value; b = rb.value; texts = [pa, pb];
    } else {
      const p = parseNumber(s);
      if (p.ok) return { ok: false, err: 'bare', msg: MALFORMED };
      return { ok: false, err: 'parse', msg: MALFORMED };
    }
  }
  if (a == null || b == null) return { ok: false, err: 'parse', msg: MALFORMED };
  return { ok: true, a, b, texts };
}

/** a:b → [p, q] reduced positive integers when both are rationals, else null */
export function reduce(a, b) {
  if (!isRat(a) || !isRat(b)) return null;
  // a:b = (a.n·b.d) : (b.n·a.d)
  let p = a.n * b.d;
  let q = b.n * a.d;
  if (p === 0 || q === 0) return null;
  const g = gcd(p, q) || 1;
  p /= g; q /= g;
  if (q < 0) { p = -p; q = -q; }
  return [p, q];
}

const fmtRatio = (pq) => `${pq[0]}:${pq[1]}`;

function answerOf(part) {
  const a = part.answer ?? part.ratio;
  const r = parseRatio(a);
  return r.ok ? r : null;
}

function sameRatio(a, b, A, B, tol) {
  const ra = reduce(a, b), rA = reduce(A, B);
  if (ra && rA) return ra[0] === rA[0] && ra[1] === rA[1];
  const fa = (isRat(a) ? a.n / a.d : a) / (isRat(b) ? b.n / b.d : b);
  const fA = (isRat(A) ? A.n / A.d : A) / (isRat(B) ? B.n / B.d : B);
  return Number.isFinite(fa) && Number.isFinite(fA) && Math.abs(fa - fA) <= tol;
}

/**
 * grade — see the header.
 */
export function grade(part = {}, raw, ctx = {}) {
  const tol = tolOf(part, ctx);
  const ans = answerOf(part);
  if (!ans) return result('malformed', 'This item has no answer key yet.', { err: 'bad-part' });
  const p = parseRatio(raw);
  if (!p.ok) return result('malformed', p.err === 'empty' ? 'Type the ratio.' : p.msg, { err: p.err, normalized: typeof raw === 'string' ? raw.trim() : null });
  const { a, b } = p;
  const normalized = `${p.texts[0].trim()}:${p.texts[1].trim()}`;
  const red = reduce(a, b);
  const ansRed = reduce(ans.a, ans.b);
  const reducedText = red ? fmtRatio(red) : null;
  const base = { normalized, reduced: reducedText, values: [a, b], nudge: false, answer: ansRed ? fmtRatio(ansRed) : `${show(ans.a)}:${show(ans.b)}` };
  const positive = (v) => (isRat(v) ? v.n > 0 : v > 0);
  if (!positive(a) || !positive(b)) return result('malformed', 'Both parts of the ratio must be positive numbers — write a ratio like 3:2.', { ...base, err: 'nonpositive' });

  if (sameRatio(a, b, ans.a, ans.b, tol)) {
    const typedReduced = isRat(a) && isRat(b) && ratIsInt(a) && ratIsInt(b) && gcd(a.n, b.n) === 1;
    if (typedReduced) return result('correct', '✓', base);
    const simplest = ansRed ? fmtRatio(ansRed) : base.answer;
    return result('correct', `✓ — simplest form is ${simplest}.`, { ...base, nudge: true, tags: ['unreduced-ratio'] });
  }
  // card / generator misconceptions, by reduced-ratio equality
  for (const m of misconceptionsOf(part, ctx)) {
    if (!m || !inScope(m, { part: part.id ?? null })) continue;
    const mr = parseRatio(m.answer);
    if (mr.ok && sameRatio(a, b, mr.a, mr.b, tol)) return result('wrong', m.msg || 'Not that ratio.', { ...base, tags: m.tag ? [m.tag] : [] });
  }
  if (sameRatio(b, a, ans.a, ans.b, tol)) {
    return result('wrong', "That's the ratio the other way round — order matters: put the first-named quantity first.", { ...base, tags: ['reversed-ratio'] });
  }
  return result('wrong', `${normalized} doesn't match — recompute both quantities, then divide by their GCF.`, base);
}

export default grade;
