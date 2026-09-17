// equation.js — the `equation` grader (COMPOSED S3 "Parts · equation"): the setup step on every word
// problem and figure-algebra card. Both sides are parsed as rational functions; `a:b` is rewritten to
// `(a)/(b)` (this part only); a comma/`and`-separated pair of linear equations in two variables is a
// system; common factors cancel; cross-multiply; divide by content; positive lead; compare to the
// canonical (and every alternate). Fallback: LHS − RHS = 0 at every intended root and ≠ 0 at r+1, r+2.
// Structural guard: the typed equation must still show every number in `mustMention`. DOM-free; never
// throws on student input.
//
// grade(part, raw, ctx) → { ok, kind, credit, share (0.4 under ctx.mock, else 1), msg, tags, normalized,
//                           poly:'x − 17' (the reduced LHS − RHS), system:boolean, matched:'canonical'|'alternate'|'system'|'roots'|null,
//                           solved?:string (a degree-1 wrong equation's x), code }
//   part { type:'equation', var:'x', canonical:string|null, alternates?:[string | {canonical, mustMention?, roots?}],
//          mustMention?:[180], roots?:['17'], system?:['x+y-90','y-2x'] (LHS − RHS forms, = 0), vars?:['x','y'],
//          symmetric?|orderFree?, optional?, misconceptions?:[{answer:'90 - x = 10 + 9x', tag, msg}] }
//   raw  string — `180 - x = 10 + 9x`, `(180−x):(90−x) = 5:2`, `x + y = 90, y = 2x`
//   ctx  { mock?, misconceptions?, card? }
//
// tags:['simplified-setup','used-90-for-supp','used-180-for-comp','wrong-side-supp']

import { normalizeText, tokenize, ParseError, numEquals, isRat, rat, ratSub, ratMul, ratDiv, ratNeg, ratIsZero, ratToNumber, ratEq, isTooLong } from './normalize.js';
import {
  parseRational, parsePoly, parseLinear, ratFunSub, polyCanonical, polyEquals, polyIsZero, polyDegree, polyEvalRat, polyEvalAt,
  solveLinear, rationalRoots, solveQuadratic, formatPoly, polyFromDescending,
} from './poly.js';
import { result, isBlank, toVal, show, tolOf, misconceptionsOf, inScope, cap } from './num.js';

// ---------------------------------------------------------------------------
// Parsing an equation (or a system)
// ---------------------------------------------------------------------------

const RE_EQ_SPLIT = /\s*(?:;|\n|,|\band\b)\s*/i;

function colonToDiv(side) {
  const n = (side.match(/:/g) || []).length;
  if (n === 0) return side;
  if (n > 1) throw new ParseError('syntax', 'one : per side of a ratio');
  const i = side.indexOf(':');
  return `(${side.slice(0, i)})/(${side.slice(i + 1)})`;
}

/** letters used and every standalone number typed, from the normalized text of one side */
function scan(side) {
  const norm = normalizeText(side, { prefix: false, units: false });
  const toks = tokenize(norm);
  const letters = new Set();
  const numbers = [];
  for (const t of toks) {
    if (t.t === 'var') letters.add(t.v);
    if (t.t === 'num') numbers.push(Number(t.v));
  }
  return { letters, numbers, norm };
}

function stripX(p) {
  let k = 0;
  while (k < p.c.length && p.c[k].n === 0) k++;
  return { c: p.c.slice(k) };
}

/** canonical forms equal, or equal after cancelling a common power of x (the uncancelled AP-9 form);
 *  a constant (the variable cancelled out) only equals the same constant */
export function equivPoly(P, C) {
  if (!P || !C || polyIsZero(P) || polyIsZero(C)) return false;
  if (polyDegree(P) < 1 || polyDegree(C) < 1) return polyEquals(P, C);
  if (polyEquals(polyCanonical(P), polyCanonical(C))) return true;
  return polyEquals(polyCanonical(stripX(P)), polyCanonical(stripX(C)));
}

/** "expr" → "expr = 0"; an equation stays as it is (for canonicals and misconception answers) */
function asEquation(text) {
  const t = String(text ?? '').trim();
  return t.includes('=') ? t : `(${t}) = 0`;
}

/** exact / float roots of a canonical polynomial (rational roots first; float quadratics otherwise) */
function rootsOfPoly(C) {
  if (!C || polyIsZero(C) || polyDegree(C) < 1) return [];
  const rr = rationalRoots(C);
  if (rr.length) return rr;
  const q = solveQuadratic(C);
  return q.roots.filter((r) => r != null && typeof r !== 'object' ? Number.isFinite(r) : true);
}

function evalAt(P, r) {
  if (isRat(r)) return ratToNumber(polyEvalRat(P, r));
  return polyEvalAt(P, r);
}

/** the S3 fallback: P(r) = 0 for every intended root, P(r + 1) ≠ 0 and P(r + 2) ≠ 0 */
export function rootsAgree(P, roots) {
  if (!P || polyIsZero(P) || polyDegree(P) < 1 || !roots.length) return false;
  const scale = Math.max(1, ...P.c.map((c) => Math.abs(ratToNumber(c))));
  const zero = (v) => Math.abs(v) <= 1e-9 * scale;
  for (const r of roots) {
    if (!zero(evalAt(P, r))) return false;
    const f = isRat(r) ? ratToNumber(r) : r;
    if (zero(polyEvalAt(P, f + 1)) || zero(polyEvalAt(P, f + 2))) return false;
  }
  return true;
}

/**
 * parseEquation — student text → { ok:true, kind:'single', poly, letters, numbers, eqs:[{L, R}] }
 *   | { ok:true, kind:'system', forms:[form, form], letters, numbers, vars:[v, w], eqs }
 *   | { ok:false, err, msg }
 * A `single` result's `poly` is the numerator of LHS − RHS (cancelled). A `system` carries the two linear
 * forms (LHS − RHS) in [v, w] for the caller to solve or eliminate.
 */
export function parseEquation(raw, opts = {}) {
  const v = String(opts.var ?? 'x').toLowerCase();
  if (isBlank(raw)) return { ok: false, err: 'empty', msg: 'Type the equation.' };
  const text = String(raw);
  if (isTooLong(text)) return { ok: false, err: 'toolong', msg: 'That answer is too long to read.' };
  const eqTexts = text.split(RE_EQ_SPLIT).map((s) => s.trim()).filter(Boolean);
  if (!eqTexts.length) return { ok: false, err: 'empty', msg: 'Type the equation.' };
  if (eqTexts.length > 2) return { ok: false, err: 'too-many', msg: 'One equation — or a system of two.' };
  const eqs = [];
  const letters = new Set();
  const numbers = [];
  try {
    for (const t of eqTexts) {
      const sides = t.split('=').map((s) => s.trim());
      if (sides.length === 1) return { ok: false, err: 'no-equals', msg: 'Write an equation — it needs an = sign.' };
      if (sides.length > 2) return { ok: false, err: 'equals', msg: 'One = sign per equation.' };
      if (sides.some((s) => !s)) return { ok: false, err: 'equals', msg: 'Something is missing on one side of the =.' };
      const [L, R] = sides.map(colonToDiv);
      for (const s of [L, R]) {
        const sc = scan(s);
        sc.letters.forEach((l) => letters.add(l));
        numbers.push(...sc.numbers);
      }
      eqs.push({ L, R, text: t });
    }
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, err: e.code, msg: e.message };
    throw e;
  }
  if (letters.size === 0) return { ok: false, err: 'no-var', msg: `The equation needs the variable ${v}.` };
  const others = [...letters].filter((l) => l !== v);

  if (eqs.length === 1) {
    if (letters.size >= 2) return { ok: false, err: 'two-vars', msg: 'One variable, or two equations.', letters: [...letters] };
    if (!letters.has(v)) return { ok: false, err: 'wrong-var', msg: `Use the variable ${v}.`, got: others[0], want: v };
    const [eq] = eqs;
    const L = parseRational(eq.L, { var: v });
    if (!L.ok) return { ok: false, err: L.err, msg: L.msg };
    const R = parseRational(eq.R, { var: v });
    if (!R.ok) return { ok: false, err: R.err, msg: R.msg };
    let d;
    try { d = ratFunSub({ num: L.num, den: L.den }, { num: R.num, den: R.den }); } catch (e) {
      if (e instanceof ParseError) return { ok: false, err: e.code, msg: e.message };
      throw e;
    }
    return { ok: true, kind: 'single', poly: d.num, den: d.den, letters: [...letters], numbers, eqs, var: v };
  }

  // two equations
  if (letters.size === 1) {
    // "180 - x = 9x + 10, x = 17": the first is the setup, the rest is solving
    const first = parseEquation(eqs[0].text, opts);
    return first.ok ? { ...first, numbers, eqs, trailing: eqs.slice(1) } : first;
  }
  if (letters.size > 2 || !letters.has(v)) {
    return { ok: false, err: 'two-vars', msg: letters.has(v) ? 'A system uses exactly two variables.' : `Use the variable ${v}.`, letters: [...letters] };
  }
  const w = others[0];
  const vars = [v, w];
  const forms = [];
  for (const eq of eqs) {
    const L = parseLinear(eq.L, { vars });
    if (!L.ok) return { ok: false, err: L.err === 'nonlinear' ? 'nonlinear' : L.err, msg: L.err === 'nonlinear' ? 'A system here is two linear equations.' : L.msg };
    const R = parseLinear(eq.R, { vars });
    if (!R.ok) return { ok: false, err: R.err === 'nonlinear' ? 'nonlinear' : R.err, msg: R.err === 'nonlinear' ? 'A system here is two linear equations.' : R.msg };
    const coef = {};
    for (const x of vars) {
      const c = ratSub(L.coef[x] ?? rat(0), R.coef[x] ?? rat(0));
      if (c.n !== 0) coef[x] = c;
    }
    forms.push({ k: ratSub(L.k, R.k), coef });
  }
  return { ok: true, kind: 'system', forms, letters: [...letters], numbers, eqs, var: v, vars };
}

/** "3x + y = 4x + y + 10" → linear form (LHS − RHS) in `vars`, or null */
function linearFormOf(text, vars) {
  const t = String(text ?? '').trim();
  if (!t) return null;
  const sides = t.split('=').map((s) => s.trim());
  if (sides.length !== 2 || sides.some((s) => !s)) return null;
  const L = parseLinear(sides[0], { vars }), R = parseLinear(sides[1], { vars });
  if (!L.ok || !R.ok) return null;
  const coef = {};
  for (const x of vars) { const c = ratSub(L.coef[x] ?? rat(0), R.coef[x] ?? rat(0)); if (c.n !== 0) coef[x] = c; }
  return { k: ratSub(L.k, R.k), coef };
}

/** two linear forms describe the same equation (proportional, constant included) */
function sameForm(f, g) {
  const keys = new Set([...Object.keys(f.coef), ...Object.keys(g.coef)]);
  let ratio = null;
  const pairs = [[f.k, g.k], ...[...keys].map((k) => [f.coef[k] ?? rat(0), g.coef[k] ?? rat(0)])];
  for (const [a, b] of pairs) {
    if (ratIsZero(a) !== ratIsZero(b)) return false;
    if (ratIsZero(a)) continue;
    const r = ratDiv(a, b);
    if (ratio === null) ratio = r; else if (!ratEq(ratio, r)) return false;
  }
  return ratio !== null;
}

/** solve a 2×2 linear system of forms (k + Σ coef·var = 0) → {x, y} | {dependent:true} | {inconsistent:true} */
export function solveSystem(forms, vars) {
  const [v, w] = vars;
  const a1 = forms[0].coef[v] ?? rat(0), b1 = forms[0].coef[w] ?? rat(0), k1 = forms[0].k;
  const a2 = forms[1].coef[v] ?? rat(0), b2 = forms[1].coef[w] ?? rat(0), k2 = forms[1].k;
  const det = ratSub(ratMul(a1, b2), ratMul(a2, b1));
  if (ratIsZero(det)) {
    // dependent when one row is a multiple of the other (including the constant)
    const dep = ratIsZero(ratSub(ratMul(a1, k2), ratMul(a2, k1))) && ratIsZero(ratSub(ratMul(b1, k2), ratMul(b2, k1)));
    return dep ? { dependent: true } : { inconsistent: true };
  }
  // a1 x + b1 y = -k1 ; a2 x + b2 y = -k2  (Cramer)
  const x = ratDiv(ratSub(ratMul(ratNeg(k1), b2), ratMul(ratNeg(k2), b1)), det);
  const y = ratDiv(ratSub(ratMul(a1, ratNeg(k2)), ratMul(a2, ratNeg(k1))), det);
  return { [v]: x, [w]: y, x, y };
}

/** eliminate w from two linear forms → polynomial in v (a·v + k), or null when v is not pinned down */
function eliminate(forms, vars) {
  const [v, w] = vars;
  const a1 = forms[0].coef[v] ?? rat(0), b1 = forms[0].coef[w] ?? rat(0), k1 = forms[0].k;
  const a2 = forms[1].coef[v] ?? rat(0), b2 = forms[1].coef[w] ?? rat(0), k2 = forms[1].k;
  const A = ratSub(ratMul(a1, b2), ratMul(a2, b1));
  const K = ratSub(ratMul(k1, b2), ratMul(k2, b1));
  if (ratIsZero(A)) return null;
  return polyFromDescending([A, K]);
}

// ---------------------------------------------------------------------------
// Canonicals
// ---------------------------------------------------------------------------

function canonPoly(src, v) {
  if (src == null) return null;
  if (typeof src === 'object' && Array.isArray(src.c)) return src;
  if (Array.isArray(src)) { try { return polyFromDescending(src); } catch { return null; } }
  const r = parseEquation(asEquation(src), { var: v });
  return r.ok && r.kind === 'single' ? r.poly : null;
}

/** [{ poly, mustMention, roots, kind:'canonical'|'alternate' }] */
function canonicals(part, v) {
  const out = [];
  const list = Array.isArray(part.canonical) ? part.canonical : [part.canonical];
  for (const c of list) {
    const poly = canonPoly(c, v);
    if (poly) out.push({ poly, mustMention: part.mustMention ?? [], roots: part.roots ?? null, kind: 'canonical' });
  }
  for (const a of (Array.isArray(part.alternates) ? part.alternates : [])) {
    const src = typeof a === 'string' || Array.isArray(a) ? a : (a && a.canonical);
    const poly = canonPoly(src, v);
    if (poly) out.push({ poly, mustMention: (a && a.mustMention) ?? part.mustMention ?? [], roots: (a && a.roots) ?? null, kind: 'alternate' });
  }
  return out;
}

function intendedRoots(entry) {
  if (Array.isArray(entry.roots) && entry.roots.length) {
    const list = entry.roots.map(toVal).filter((r) => r !== null);
    if (list.length) return list;
  }
  return rootsOfPoly(entry.poly);
}

function systemForms(part, v) {
  if (!Array.isArray(part.system) || part.system.length !== 2) return null;
  const vars = (part.vars ?? [v, 'y']).map((s) => String(s).toLowerCase());
  const forms = [];
  for (const s of part.system) {
    const text = String(s);
    let L = text, R = '0';
    if (text.includes('=')) [L, R] = text.split('=');
    const pl = parseLinear(L, { vars }), pr = parseLinear(R, { vars });
    if (!pl.ok || !pr.ok) return null;
    const coef = {};
    for (const x of vars) { const c = ratSub(pl.coef[x] ?? rat(0), pr.coef[x] ?? rat(0)); if (c.n !== 0) coef[x] = c; }
    forms.push({ k: ratSub(pl.k, pr.k), coef });
  }
  return { forms, vars };
}

// ---------------------------------------------------------------------------
// Feedback helpers
// ---------------------------------------------------------------------------

function mentionsMissing(numbers, mustMention) {
  const list = Array.isArray(mustMention) ? mustMention : (mustMention == null ? [] : [mustMention]);
  return list.filter((m) => !numbers.some((n) => Math.abs(n - Number(m)) < 1e-9));
}

function swapConstants(text, from, to) {
  const re = new RegExp(`(^|[^\\d.])${from}(?![\\d.])`, 'g');
  return text.replace(re, `$1${to}`);
}

function hintFor(mustMention) {
  const m = (Array.isArray(mustMention) ? mustMention : []).map(Number);
  if (m.includes(180) && m.includes(90)) return 'check which expression is the complement and which the supplement';
  if (m.includes(180)) return 'check which side is the supplement';
  if (m.includes(90)) return 'check which side is the complement';
  return 'check the setup against the sentence';
}

// ---------------------------------------------------------------------------
// The grader
// ---------------------------------------------------------------------------

/**
 * grade — see the header.
 */
export function grade(part = {}, raw, ctx = {}) {
  const v = String(part.var ?? 'x').toLowerCase();
  const share = ctx.mock ? 0.4 : 1;
  const done = (kind, msg, extra = {}) => result(kind, msg, { share, system: false, matched: null, code: kind, ...extra });
  if (isBlank(raw)) return done('malformed', part.optional ? 'Type the equation — or skip the setup.' : 'Type the equation.', { err: 'empty', code: 'empty' });
  const text = typeof raw === 'string' ? raw : String(raw ?? '');
  const P = parseEquation(text, { var: v });
  const misc = misconceptionsOf(part, ctx).filter((m) => m && inScope(m, { part: part.id ?? null }));
  if (!P.ok) {
    if (P.err === 'two-vars' && systemForms(part, v) && P.letters && P.letters.length === 2) {
      // one two-variable equation on a system item: a known trap (vertical angles summed to 180 …) is graded as
      // that trap; otherwise it is simply incomplete (free)
      const vars = [v, P.letters.find((l) => l !== v)];
      const mine = text.split(RE_EQ_SPLIT).map((t) => linearFormOf(t, vars)).filter(Boolean);
      for (const m of misc) {
        const mforms = String(m.answer ?? '').split(RE_EQ_SPLIT).map((t) => linearFormOf(t, vars)).filter(Boolean);
        if (mforms.some((mf) => mine.some((pf) => sameForm(pf, mf)))) {
          return done('wrong', m.msg || 'Not that relationship.', { tags: m.tag ? [m.tag] : [], normalized: text.trim(), system: true, code: 'wrong' });
        }
      }
      return done('malformed', 'This one needs two equations — one for each relationship.', { err: P.err, normalized: text.trim(), code: 'parse' });
    }
    return done('malformed', cap(P.msg), { err: P.err, normalized: text.trim(), code: 'parse' });
  }
  const normalized = P.eqs.map((e) => e.text).join(', ');
  const mustMention = part.mustMention ?? [];
  const sys = systemForms(part, v);
  const canon = canonicals(part, v);

  // ---- a system of two equations ----
  if (P.kind === 'system') {
    const missing = mentionsMissing(P.numbers, mustMention);
    // per-equation misconceptions: a misconception equation (in x and y) proportional to one the student wrote
    for (const m of misc) {
      const mforms = String(m.answer ?? '').split(RE_EQ_SPLIT).map((t) => linearFormOf(t, P.vars)).filter(Boolean);
      if (mforms.some((mf) => P.forms.some((pf) => sameForm(pf, mf)))) {
        return done('wrong', m.msg || 'Not that relationship.', { tags: m.tag ? [m.tag] : [], normalized, system: true, code: 'wrong' });
      }
    }
    if (sys) {
      const want = solveSystem(sys.forms, sys.vars);
      const got = solveSystem(P.forms, P.vars);
      if (got.dependent) return done('wrong', 'Those two equations say the same thing — the problem gives two different relationships.', { normalized, system: true, code: 'wrong' });
      if (got.inconsistent) return done('wrong', 'Those two equations contradict each other — check each one against the figure.', { normalized, system: true, code: 'wrong' });
      if (want.dependent || want.inconsistent) return done('malformed', 'This item has no solvable canonical system.', { err: 'bad-part', normalized, system: true, code: 'bad-part' });
      const [wv, ww] = sys.vars;
      const same = ratEq(got.x, want[wv]) && ratEq(got.y, want[ww]);
      const swapped = ratEq(got.x, want[ww]) && ratEq(got.y, want[wv]);
      const altRoots = canon.filter((c) => c.kind === 'alternate').flatMap((c) => intendedRoots(c));
      const symmetric = !!(part.symmetric || part.orderFree || altRoots.some((r) => numEquals(r, got.x, 0)));
      if (same || (swapped && symmetric)) {
        if (missing.length) return done('wrong', `Write the equations before simplifying — they should still show the ${missing.join(' and the ')}.`, { tags: ['simplified-setup'], normalized, system: true, code: 'simplified' });
        return done('correct', 'Setup ✓', { normalized, system: true, matched: 'system', poly: null, code: 'ok' });
      }
      return done('wrong', `That system gives ${v} = ${show(got.x)}, ${P.vars[1]} = ${show(got.y)} — check each relationship against the figure (vertical angles are equal; a linear pair adds to 180).`, {
        normalized, system: true, solved: `${v} = ${show(got.x)}, ${P.vars[1]} = ${show(got.y)}`, code: 'wrong',
      });
    }
    // no canonical system: eliminate the second variable and compare with the single-variable canonical
    const elim = eliminate(P.forms, P.vars);
    if (!elim) return done('wrong', `Those two equations don't pin ${v} down — check each relationship.`, { normalized, system: true, code: 'wrong' });
    return finish(elim, { ...P, poly: elim }, true);
  }

  if (sys && !canon.length) {
    // a system-only item (doc-07) answered with one single-variable equation: incomplete, not wrong
    return done('malformed', 'This one needs two equations — one for each relationship.', { err: 'two-vars', normalized, code: 'parse' });
  }
  return finish(P.poly, P, false);

  function finish(poly, parsed, system) {
    const missing = mentionsMissing(parsed.numbers, mustMention);
    const polyText = formatPoly(poly, v);
    const base = { normalized, poly: polyText, system };
    if (polyIsZero(poly)) {
      return done('wrong', `That's true for every ${v} — write an equation that pins ${v} down.`, { ...base, code: 'trivial' });
    }
    // 1. card / generator misconceptions on the setup
    for (const m of misc) {
      const src = asEquation(m.answer);
      const mp = parseEquation(src, { var: v });
      if (!mp.ok || mp.kind !== 'single') continue;
      const equivalentTrap = canon.some((c) => equivPoly(mp.poly, c.poly));
      let hit;
      if (equivalentTrap) {
        // a "simplified setup" trap is equivalent to the answer — match it by wording only
        const norm = (s) => normalizeText(s, { prefix: false, units: false }).replace(/\s+/g, '');
        hit = parsed.eqs.some((e) => norm(e.text) === norm(src));
      } else hit = equivPoly(poly, mp.poly);
      if (hit) {
        // content may record what the wrong setup yields (`gives`); show it when it is there
        const gives = m.gives != null && String(m.gives).trim() ? ` (That setup gives ${v} = ${show(String(m.gives))}.)` : '';
        return done('wrong', `${m.msg || 'Not that equation.'}${gives}`, { ...base, tags: m.tag ? [m.tag] : [], code: 'wrong', solved: m.gives != null ? show(String(m.gives)) : null });
      }
    }
    // 2. equivalence
    let matched = null;
    let via = null;
    for (const c of canon) {
      if (equivPoly(poly, c.poly)) { matched = c; via = c.kind; break; }
    }
    if (!matched) {
      for (const c of canon) {
        if (rootsAgree(poly, intendedRoots(c))) { matched = c; via = 'roots'; break; }
      }
    }
    if (!matched && polyDegree(poly) < 1) {
      return done('wrong', `The ${v} cancels out of that equation — it is never true. Check which two quantities are different.`, { ...base, code: 'constant' });
    }
    if (matched) {
      const miss = mentionsMissing(parsed.numbers, matched.mustMention ?? mustMention);
      if (miss.length) {
        return done('wrong', `Write the equation before simplifying — it should still show the ${miss.join(' and the ')}.`, { ...base, tags: ['simplified-setup'], matched: via, code: 'simplified' });
      }
      return done('correct', 'Setup ✓', { ...base, matched: via, code: 'ok' });
    }
    // 3. wrong equation — the 90/180 mix-up, then solve it when it is linear
    const tags = [];
    let msg = null;
    if (!system) {
      const as180 = parseEquation(swapConstants(text, '90', '180'), { var: v });
      const as90 = parseEquation(swapConstants(text, '180', '90'), { var: v });
      if (as180.ok && as180.kind === 'single' && canon.some((c) => equivPoly(as180.poly, c.poly))) {
        msg = `Supplementary angles add to 180 — the supplement of ${v} is 180 − ${v}; 90 − ${v} is the complement.`;
        tags.push('used-90-for-supp');
      } else if (as90.ok && as90.kind === 'single' && canon.some((c) => equivPoly(as90.poly, c.poly))) {
        msg = `Complementary angles add to 90 — the complement of ${v} is 90 − ${v}; 180 − ${v} is the supplement.`;
        tags.push('used-180-for-comp');
      }
    }
    let solved = null;
    if (polyDegree(poly) === 1) {
      const r = solveLinear(poly);
      if (r && !r.any) solved = show(r);
    }
    if (msg === null) {
      if (solved !== null) msg = `That gives ${v} = ${solved} — ${hintFor(mustMention)}.`;
      else if (polyDegree(poly) >= 2) msg = 'That equation says something different from the sentence — translate it clause by clause.';
      else msg = `That's a different equation — ${hintFor(mustMention)}.`;
    } else if (solved !== null) msg = `That gives ${v} = ${solved}. ${msg}`;
    if (missing.length && !tags.length) tags.push('simplified-setup');
    return done('wrong', msg, { ...base, tags, solved, code: 'wrong' });
  }
}

export default grade;
