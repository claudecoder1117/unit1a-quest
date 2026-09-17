// roots.js — the `roots` grader (COMPOSED S3 "Parts · roots"): one field, a multiset of roots.
// DOM-free; never throws on student input.
//
// grade(part, raw, ctx) → { ok, kind, credit, msg, tags, normalized:[token texts], values:[Rat|number] (deduped),
//                           found:[values that are roots], extras:[values that are not], missing:number (count only),
//                           total:number, code:'ok'|'subset'|'extra'|'empty'|'polynomial'|'parse' }
//   part { type:'roots', answer:['3','-1/2'] | typed (Rat|number)[], var?:'x', tol?, poly?|target?|equation?:string
//          (the polynomial for "plug it back in"; derived from the roots when absent), misconceptions? }
//   raw  string | string[] | (Rat|number)[]   — `x = 3 or x = -½`, `{3, -0.5}`, `3; -1/2.`, `x=3,x=-1/2`, `3 -1/2`
//   ctx  { state?:{}, sandbox?, strict?|mock?|boss?, misconceptions?, card? }
//
// Tokens: braces stripped, split on `,` `;` `or` `and` newlines and on "whitespace + signed number"
// (`3 -1/2` and `30 60` are two roots; `5 1/2` stays one mixed number), a per-token `x =` prefix stripped, each token
// through the full num parser (constant expressions and unicode fractions are legal). `x = 3, x = 3`
// collapses. A proper subset → first submit `almost` "That's one root — there's another. Set each factor
// to 0." (free); the SECOND subset submit (ctx.state counter) or any subset in strict mode → `wrong`,
// same message. The missing root is never named. An extra value → wrong "`v` isn't a solution — plug it
// back in: …" with the substitution shown. A polynomial typed here → malformed "enter the roots, not the
// polynomial" (free).
//
// tags:['forgot-second-root','extra-root','typed-polynomial']

import { parseNumber, numEquals, isRat, ratToNumber, isTooLong } from './normalize.js';
import {
  parsePoly, polyFromRoot, polyMul, polyConst, polyPrimitive, polyEvalRat, polyEvalAt, polyIsZero, polyIsConst,
  polyFromDescending, formatPoly,
} from './poly.js';
import {
  result, isBlank, parseValue, toVal, show, tolOf, isStrict, escalate, misconceptionsOf, matchMisconception, cap,
} from './num.js';

// ---------------------------------------------------------------------------
// Tokenizing a list of numbers
// ---------------------------------------------------------------------------

const RE_SEP = /[,;\n]|\b(?:or|and)\b/i;
// "3 -1/2" → two tokens (a digit, ), or fraction glyph, then space(s), then a signed number).
// No lookbehind (older iOS Safari): the preceding character is captured and put back.
const RE_SPACE_SIGN = /([\d)½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅐⅛⅜⅝⅞⅑⅒.°º˚])[ \t]+([-+−–—][\d.(½⅓⅔¼¾])/g;
// "3 x=-1/2" → the second `x =` starts a new token
const RE_SPACE_PREFIX = /([\d)½⅓⅔¼¾.°º˚])[ \t]+([a-z]\s*=)/gi;
// "30 60" → two numbers (an unsigned number after a space that is NOT the fraction part of a mixed number)
const RE_SPACE_NUM = /([\d)°º˚])[ \t]+(\d+(?:\.\d+)?)(?![\d./])/g;

/** `{`/`[`/outer `(` stripping — only when the wrapper encloses the whole string and a separator sits inside. */
export function stripWrappers(s) {
  let t = String(s ?? '').trim();
  t = t.replace(/[{}[\]]/g, ' ').trim();
  if (t.startsWith('(') && t.endsWith(')')) {
    // does the first "(" close at the very end?
    let depth = 0;
    let closesAtEnd = true;
    for (let i = 0; i < t.length; i++) {
      if (t[i] === '(') depth++;
      else if (t[i] === ')') { depth--; if (depth === 0 && i < t.length - 1) { closesAtEnd = false; break; } }
    }
    if (closesAtEnd && RE_SEP.test(t.slice(1, -1))) t = t.slice(1, -1).trim();
  }
  return t;
}

/**
 * splitList — a typed list → its tokens (strings). `x = 3 or x = -½` → ['x = 3', 'x = -½'];
 * `{3, -0.5}` → ['3', '-0.5']; `3 -1/2` → ['3', '-1/2']; `5 1/2` → ['5 1/2'].
 */
export function splitList(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.flatMap((x) => (typeof x === 'string' ? splitList(x) : [x]));
  if (typeof raw !== 'string') return [raw];
  if (isTooLong(raw)) return [raw];
  let s = stripWrappers(raw);
  s = s.replace(RE_SPACE_SIGN, '$1,$2').replace(RE_SPACE_PREFIX, '$1,$2').replace(RE_SPACE_NUM, '$1,$2');
  return s.split(RE_SEP).map((t) => t.trim()).filter(Boolean);
}

/**
 * parseRoots — tokens → values. { ok:true, values, texts } | { ok:false, err, msg, token, texts }.
 * `values` are deduped by tolerance; `texts` keep every token as typed.
 */
export function parseRoots(raw, tol = 0.01) {
  if (isBlank(raw)) return { ok: false, err: 'empty', msg: 'Type the roots.', texts: [] };
  const tokens = splitList(raw);
  if (!tokens.length) return { ok: false, err: 'empty', msg: 'Type the roots.', texts: [] };
  const values = [];
  const texts = [];
  for (const t of tokens) {
    const p = typeof t === 'string' ? parseNumber(t) : parseValue(t);
    const text = typeof t === 'string' ? t : show(t);
    texts.push(text);
    if (!p.ok) {
      if (p.err === 'variable') return { ok: false, err: 'polynomial', msg: 'Enter the roots, not the polynomial.', token: text, texts };
      if (p.err === 'empty') continue;
      return { ok: false, err: p.err, msg: `${text}: ${p.msg ?? 'could not read that'}.`, token: text, texts };
    }
    if (!values.some((v) => numEquals(v, p.value, tol))) values.push(p.value);
  }
  if (!values.length) return { ok: false, err: 'empty', msg: 'Type the roots.', texts };
  return { ok: true, values, texts };
}

// ---------------------------------------------------------------------------
// "Plug it back in"
// ---------------------------------------------------------------------------

function varOf(part) {
  const v = part.var ?? (typeof part.id === 'string' && part.id.length === 1 ? part.id : null) ?? 'x';
  return String(v).toLowerCase();
}

/** The polynomial whose roots are the answers: part.poly / target / equation, else Π (x − r) made integral. */
export function polynomialOf(part, answers) {
  const v = varOf(part);
  const src = part.poly ?? part.target ?? part.equation ?? part.expr ?? null;
  if (src != null) {
    if (typeof src === 'object' && Array.isArray(src.c)) return src;
    if (Array.isArray(src)) { try { return polyFromDescending(src); } catch { return null; } }
    let text = String(src);
    if (text.includes('=')) {
      const [l, r] = text.split('=');
      text = `(${l})-(${r})`;
    }
    const p = parsePoly(text, { var: v });
    if (p.ok) return p.poly;
  }
  if (!answers.length || !answers.every(isRat)) return null;
  try {
    let p = polyConst(1);
    for (const r of answers) p = polyMul(p, polyFromRoot(r));
    return polyPrimitive(p);
  } catch {
    return null;
  }
}

/** "2(4)² − 5(4) − 3 = 9, not 0" for a value that is not a root (null when no polynomial is known). */
export function substitution(poly, v, value) {
  if (!poly || polyIsZero(poly) || polyIsConst(poly)) return null;
  const text = formatPoly(poly, v).split(v).join(`(${show(value)})`);
  let out;
  if (isRat(value)) {
    try { out = show(polyEvalRat(poly, value)); } catch { out = null; }
  }
  if (out == null) out = show(polyEvalAt(poly, isRat(value) ? ratToNumber(value) : value));
  return `${text} = ${out}, not 0`;
}

// ---------------------------------------------------------------------------
// The grader
// ---------------------------------------------------------------------------

function answersOf(part) {
  const a = part.answer ?? part.answers ?? part.roots ?? [];
  const list = Array.isArray(a) ? a : (typeof a === 'string' ? splitList(a) : [a]);
  return list.map((x) => ({ raw: x, value: toVal(x) })).filter((x) => x.value !== null);
}

/**
 * grade — see the header.
 */
export function grade(part = {}, raw, ctx = {}) {
  const tol = tolOf(part, ctx);
  const v = varOf(part);
  const answers = answersOf(part);
  if (!answers.length) return result('malformed', 'This item has no answer key yet.', { err: 'bad-part', code: 'bad-part', normalized: [] });
  const total = answers.length;

  const p = parseRoots(raw, tol);
  if (!p.ok) {
    if (p.err === 'polynomial') {
      return result('malformed', p.msg, { err: 'polynomial', code: 'polynomial', tags: ['typed-polynomial'], normalized: p.texts, values: [], found: [], extras: [], missing: total, total });
    }
    return result('malformed', p.err === 'empty' ? 'Type the roots.' : cap(p.msg), { err: p.err, code: p.err === 'empty' ? 'empty' : 'parse', normalized: p.texts, values: [], found: [], extras: [], missing: total, total });
  }

  const used = new Set();
  const found = [];
  const extras = [];
  for (const val of p.values) {
    const i = answers.findIndex((a, idx) => !used.has(idx) && numEquals(val, a.value, tol));
    if (i >= 0) { used.add(i); found.push(val); } else extras.push(val);
  }
  const missing = total - found.length;
  const base = { normalized: p.texts, values: p.values, found, extras, missing, total, answer: answers.map((a) => show(a.raw)) };
  const misc = misconceptionsOf(part, ctx);
  const scope = { part: part.id ?? null };
  const misMatch = (val) => matchMisconception(misc, val, tol, scope);

  if (extras.length) {
    const e = extras[0];
    const m = misMatch(e);
    if (m) return result('wrong', m.msg, { ...base, code: 'extra', tags: m.tag ? [m.tag] : ['extra-root'], credit: 0 });
    const sub = substitution(polynomialOf(part, answers.map((a) => a.value)), v, e);
    const msg = `${show(e)} isn't a solution — plug it back in${sub ? `: ${sub}` : ''}.`;
    return result('wrong', msg, { ...base, code: 'extra', tags: ['extra-root'], credit: 0 });
  }

  if (missing === 0) {
    return result('correct', total === 2 ? 'Both roots ✓' : total === 1 ? '✓' : `All ${total} roots ✓`, { ...base, code: 'ok', credit: 1 });
  }

  // proper subset
  const n = escalate(ctx, `${part.id ?? 'roots'}:subset`);
  const strict = isStrict(ctx);
  const kind = strict || n >= 2 ? 'wrong' : 'almost';
  let msg;
  const m = found.length === 1 ? misMatch(found[0]) : null;
  if (m && m.msg) msg = m.msg;
  else if (found.length === 1 && missing === 1) msg = "That's one root — there's another. Set each factor to 0.";
  else if (missing === 1) msg = `That's ${found.length} of ${total} — there's another. Set each factor to 0.`;
  else msg = `That's ${found.length} of ${total} — there are ${missing} more. Set each factor to 0.`;
  const tags = m && m.tag ? [m.tag] : ['forgot-second-root'];
  return result(kind, msg, { ...base, code: 'subset', tags, credit: found.length / total, submits: n });
}

export default grade;
