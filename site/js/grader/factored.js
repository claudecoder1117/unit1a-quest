// factored.js — the `factored` grader (COMPOSED S3 "Parts · factored"): correctness first (expand and
// compare), then form (product of integer, irreducible, GCF-free factors). DOM-free; never throws on
// student input. The rule order is T02's (notes/T02.md → "How the factored grader maps onto this"),
// verified against every Kuta fixture by tests/poly.test.mjs and tests/golden.test.mjs.
//
// grade(part, raw, ctx) → { ok, kind, credit, msg, tags, normalized, expansion:'2n² − 9n + 9', target:'2n² + 3n − 9',
//                           factors:[texts], code:'ok'|'roots'|'equals'|'parse'|'mismatch'|'original'|'gcf'|'reducible'|'rational' }
//   part { type:'factored', var:'p', target:'3p^2-2p-5' | [3,-2,-5] (descending) | Poly, answer?, misconceptions? }
//   raw  string — `(3p − 5)(p + 1)`, `-(2a+5)(3a+5)`, `4(b+5)(4b-5)`, `(3p-5)(p+1) = 0`
//        | [[3,-5],[1,1]] / {c:3, factors:[[3,1],[1,7]]}  — a generator's typed factor vectors (rendered to text first)
//   ctx  { strictGCF? (also implied by mock / boss), state?, sandbox?, misconceptions?, card? }
//
// (1) root set typed → wrong "this asks for the factored form, not the roots"; (2) `=`: drop sides equal to 0
// or to the target AS TYPED, exactly one side must remain; parse failure → malformed (wrong letter → "use the
// variable n"); (3) expansion ≠ target → wrong with the expansion shown, tag from diagnoseMismatch
// (sign-whole / dropped-gcf / extra-factor / middle-term) or wrong-factors; card misconceptions are matched by
// expansion equality; (4) not a product / typed back → wrong "that's the original — factor it"; a factor with
// content > 1 → almost "pull the common factor out" (second submit, or ctx.strictGCF → wrong); a reducible
// factor → almost "one factor still factors"; rational coefficients → almost "use integer coefficients";
// (5) else correct.
//
// tags:['typed-roots','wrong-variable','sign-whole','dropped-gcf','extra-factor','middle-term','wrong-factors','not-factored','gcf-incomplete','missing-gcf-strict','reducible-factor','rational-coeff']

import {
  parsePoly, polyEquals, polyDegree, polyLead, polyCoeff, factorStructure, diagnoseMismatch, detectRootSet, formatPoly,
  polyFromDescending, ratEq, ratAbs, ratIsInt, ratToString,
} from './poly.js';
import { result, isBlank, show, isStrict, escalate, misconceptionsOf, inScope, cap } from './num.js';

function varOf(part) {
  return String(part.var ?? (typeof part.id === 'string' && part.id.length === 1 ? part.id : 'x')).toLowerCase();
}

/** part.target (string | descending coefficients | Poly) → Poly | null */
export function targetOf(part, v = varOf(part)) {
  const t = part.target ?? part.poly ?? part.trinomial ?? null;
  if (t == null) return null;
  if (typeof t === 'object' && Array.isArray(t.c)) return t;
  if (Array.isArray(t)) { try { return polyFromDescending(t); } catch { return null; } }
  const p = parsePoly(String(t), { var: v });
  return p.ok ? p.poly : null;
}

/** a generator's typed factor vectors → text in the grammar: {c, factors:[[a,b],…]} / [[a,b],[c,d]] → "3(3k+1)(k+7)" */
export function factorsToText(obj, v) {
  const lin = ([a, b]) => {
    const A = a === 1 ? '' : a === -1 ? '-' : String(a);
    return `(${A}${v}${b < 0 ? '-' : '+'}${Math.abs(b)})`;
  };
  if (Array.isArray(obj)) return obj.map(lin).join('');
  if (obj && typeof obj === 'object' && Array.isArray(obj.factors)) {
    const c = obj.c ?? obj.constant ?? 1;
    const cs = c === 1 ? '' : c === -1 ? '-' : String(c);
    return cs + obj.factors.map(lin).join('');
  }
  return null;
}

/** the `=` rule: drop sides that are 0 or the target as typed; exactly one side must remain */
function pickSide(raw, target, v) {
  if (!raw.includes('=')) return { ok: true, text: raw };
  const sides = raw.split('=').map((s) => s.trim());
  const keep = sides.filter((s) => {
    if (!s) return true;
    const r = parsePoly(s, { var: v });
    if (!r.ok) return true;
    if (polyDegree(r.poly) === -1) return false;
    if (!polyEquals(r.poly, target)) return true;
    const fs = factorStructure(r.ast, { var: v });
    return !(fs.ok && (fs.topLevel === 'sum' || fs.typedBack));
  });
  if (keep.length !== 1) return { ok: false, msg: keep.length === 0 ? 'That just restates the original — enter the factored form.' : 'One side of the = should be 0 or the original trinomial — enter just the factored form.' };
  return { ok: true, text: keep[0] };
}

/** the live "expands to: …" preview for the widget: { ok, text, match, msg? } */
export function preview(part = {}, raw) {
  const v = varOf(part);
  const target = targetOf(part, v);
  if (isBlank(raw)) return { ok: false, text: '', match: false };
  let text = typeof raw === 'string' ? raw : factorsToText(raw, v) ?? String(raw);
  if (target && text.includes('=')) {
    const side = pickSide(text, target, v);
    if (!side.ok) return { ok: false, text: '', match: false, msg: side.msg };
    text = side.text;
  }
  const r = parsePoly(text, { var: v });
  if (!r.ok) return { ok: false, text: '', match: false, msg: r.msg };
  return { ok: true, text: formatPoly(r.poly, v), match: !!target && polyEquals(r.poly, target) };
}

/**
 * grade — see the header.
 */
export function grade(part = {}, raw, ctx = {}) {
  const v = varOf(part);
  const target = targetOf(part, v);
  if (!target) return result('malformed', 'This item has no target polynomial yet.', { err: 'bad-part', code: 'bad-part' });
  const targetText = formatPoly(target, v);
  const strict = !!(ctx.strictGCF || isStrict(ctx));
  const base = { target: targetText, expansion: null, factors: [] };
  if (isBlank(raw)) return result('malformed', 'Type the factored form.', { ...base, err: 'empty', code: 'empty' });
  const text = typeof raw === 'string' ? raw : (factorsToText(raw, v) ?? String(raw));
  const normalized = text.trim();
  base.normalized = normalized;

  // (1) roots typed here
  if (detectRootSet(text).isRootSet) {
    return result('wrong', 'This asks for the factored form, not the roots.', { ...base, tags: ['typed-roots'], code: 'roots' });
  }
  // (2) `=` and parsing
  const side = pickSide(text, target, v);
  if (!side.ok) return result('malformed', side.msg, { ...base, err: 'equals', code: 'equals' });
  const r = parsePoly(side.text, { var: v });
  if (!r.ok) {
    const tags = r.err === 'wrong-var' ? ['wrong-variable'] : [];
    const msg = r.err === 'wrong-var' ? `Use the variable ${v}.` : r.err === 'div-nonconst' ? 'Only divide by a number here — a factored form is a product.' : cap(r.msg);
    return result('malformed', msg, { ...base, err: r.err, tags, code: 'parse', got: r.got });
  }
  const expansion = formatPoly(r.poly, v);
  base.expansion = expansion;

  // (3) correctness first
  if (!polyEquals(r.poly, target)) {
    const misc = misconceptionsOf(part, ctx).filter((m) => m && inScope(m, { part: part.id ?? null }));
    for (const m of misc) {
      const mp = parsePoly(String(m.answer ?? ''), { var: v });
      if (mp.ok && polyEquals(mp.poly, r.poly)) {
        return result('wrong', m.msg || `${show(normalized)} expands to ${expansion}, but the original is ${targetText}.`, { ...base, tags: m.tag ? [m.tag] : [], code: 'mismatch' });
      }
    }
    let { tag } = diagnoseMismatch(r.poly, target);
    if (tag === null && polyDegree(r.poly) === polyDegree(target) && polyDegree(target) >= 2
      && ratEq(polyLead(r.poly), polyLead(target)) && ratEq(ratAbs(polyCoeff(r.poly, 0)), ratAbs(polyCoeff(target, 0)))) {
      tag = 'middle-term';
    }
    const why = tag === 'sign-whole' ? ' Every sign is flipped — pull out −1 first.'
      : tag === 'dropped-gcf' ? ' A common factor is missing in front.'
        : tag === 'extra-factor' ? ' There is an extra constant factor.'
          : tag === 'middle-term' ? ' Check the middle term when you expand.'
            : '';
    return result('wrong', `${show(normalized)} expands to ${expansion}, but the original is ${targetText}.${why}`, { ...base, tags: [tag ?? 'wrong-factors'], code: 'mismatch' });
  }

  // (4) form
  const fs = factorStructure(r.ast, { var: v });
  if (!fs.ok) return result('malformed', cap(fs.msg), { ...base, err: fs.err, code: 'parse' });
  base.factors = fs.factors.map((f) => f.text);
  if (fs.topLevel === 'sum' || fs.typedBack) {
    return result('wrong', "That's the original — factor it.", { ...base, tags: ['not-factored'], code: 'original' });
  }
  if (fs.gcfIncomplete) {
    const f = fs.factors.find((x) => x.integer && x.content.n > 1);
    const n = escalate(ctx, `${part.id ?? 'factored'}:gcf`);
    const inner = formatPoly(f.primitive, v);
    const msg = `Pull the common factor out of (${f.text}): ${f.contentInt}(${inner}).`;
    if (strict) return result('wrong', msg, { ...base, tags: ['missing-gcf-strict'], code: 'gcf', submits: n });
    if (n >= 2) return result('wrong', msg, { ...base, tags: ['gcf-incomplete'], code: 'gcf', submits: n });
    return result('almost', msg, { ...base, tags: ['gcf-incomplete'], code: 'gcf', submits: n });
  }
  if (fs.anyReducible) {
    const f = fs.factors.find((x) => x.reducible);
    return result('almost', `One factor still factors: (${f.text}).`, { ...base, tags: ['reducible-factor'], code: 'reducible' });
  }
  if (fs.hasRational) {
    const c = fs.constant;
    const k = ratIsInt(c) && Math.abs(c.n) > 1 ? String(Math.abs(c.n)) : null;
    const msg = k ? `Use integer coefficients — multiply the ${k} in.` : `Use integer coefficients — clear the fraction${c.d > 1 ? ` (the constant is ${ratToString(c)})` : ''}.`;
    return result('almost', msg, { ...base, tags: ['rational-coeff'], code: 'rational' });
  }
  return result('correct', `✓ ${expansion}`, { ...base, code: 'ok', answer: part.answer != null ? String(part.answer) : null });
}

export default grade;
