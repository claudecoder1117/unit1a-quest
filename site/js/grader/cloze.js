// cloze.js — fill-in-the-blank grader (COMPOSED S2 def-01..14 "cloze with chip rows", S3 Boss/Mock
// tier "fill-justify"). DOM-free, pure.
//
// part: { type:'cloze', text, blanks:[blank…] }
//   text:   "Two angles whose measures sum to [__]° are [__]."           [__] / ___  = blank (typed or chips)
//           "…, so BD [does/does not] bisect ∠ABC."                      [a/b/c]     = inline choice blank
//   blank:  { answer | answers:[…], key?, options?:[…], numeric?:boolean, tol?, why?:{[typed]:msg}, wrongMsg? }
//           blanks[i] pairs with the i-th placeholder in text; inline [a/b] choices override blank.options.
// raw:   [value per blank] | {i: value} | {key: value}
// ctx:   unused (kept for the dispatcher signature)
//
// Each blank grades independently: numeric blanks by |Δ| ≤ tol (0.01), word blanks by term rules
// (letters only, aliases, Damerau ≤ 1 for ≥ 6 letters — the spelling note is carried per blank).
// Correct blanks lock; empty blanks are not attempts (kind 'malformed', free); any wrong blank → 'wrong'.
//
// grade(part, raw, ctx) → {ok, kind, credit, msg, tags, normalized:[…],
//                          fields:[{i, key, ok, kind:'correct'|'wrong'|'malformed'|'blank', msg, raw, answer, spelling}]}
// parseCloze(text) → [{type:'text', text} | {type:'blank', i, choices:[…]|null}]

import { matchTerm, answersOf, normalizeTerm } from './term.js';
import { parseNum, numEq } from './strip.js';

const PLACEHOLDER = /\[([^\[\]]*)\]|_{3,}/g;

/** Split cloze text into text/blank segments. Bracketed text that is neither a blank nor a choice stays literal. */
export function parseCloze(text) {
  const s = String(text ?? '');
  const out = [];
  let last = 0;
  let i = 0;
  PLACEHOLDER.lastIndex = 0;
  let m;
  while ((m = PLACEHOLDER.exec(s))) {
    const inner = m[1];
    let seg = null;
    if (inner === undefined || /^_*\s*$/.test(inner)) seg = { type: 'blank', i: i++, choices: null };
    else if (inner.includes('/')) seg = { type: 'blank', i: i++, choices: inner.split('/').map((x) => x.trim()).filter(Boolean) };
    if (!seg) continue; // literal brackets, e.g. [x, y]
    if (m.index > last) out.push({ type: 'text', text: s.slice(last, m.index) });
    out.push(seg);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ type: 'text', text: s.slice(last) });
  return out;
}

/** Effective choices for blank i (inline [a/b] first, then blank.options), or null for free typing. */
export function choicesFor(part, i) {
  const seg = parseCloze(part.text).filter((x) => x.type === 'blank')[i];
  if (seg?.choices?.length) return seg.choices;
  const b = part.blanks?.[i];
  return Array.isArray(b?.options) && b.options.length ? b.options.map(String) : null;
}

function valueFor(raw, i, key) {
  if (raw == null) return undefined;
  if (Array.isArray(raw)) return raw[i];
  if (typeof raw === 'object') {
    if (key != null && raw[key] !== undefined) return raw[key];
    if (raw[i] !== undefined) return raw[i];
    if (raw[String(i)] !== undefined) return raw[String(i)];
    return undefined;
  }
  return i === 0 ? raw : undefined;
}

function isNumericBlank(blank, answers) {
  if (blank.numeric === true) return true;
  if (blank.numeric === false) return false;
  return answers.length > 0 && answers.every((a) => parseNum(a) != null && /\d/.test(String(a)));
}

function result(kind, msg, extra) {
  return { ok: kind === 'correct', kind, credit: 0, msg, tags: [], normalized: null, ...extra };
}

/**
 * Grade every blank.
 * @param {object} part
 * @param {Array|object} raw
 * @param {object} [ctx]
 */
export function grade(part, raw, ctx = {}) { // eslint-disable-line no-unused-vars
  const blanks = part.blanks ?? [];
  const nBlanks = parseCloze(part.text).filter((x) => x.type === 'blank').length || blanks.length;
  const fields = [];
  for (let i = 0; i < nBlanks; i++) {
    const blank = blanks[i] ?? {};
    const answers = answersOf(blank);
    const canonical = answers[0] ?? '';
    const v = valueFor(raw, i, blank.key);
    const typed = v == null ? '' : String(typeof v === 'object' && v !== null && 'text' in v ? v.text : v).trim();
    const f = { i, key: blank.key ?? null, ok: false, kind: 'blank', msg: '', raw: typed, answer: canonical, spelling: false, normalized: null };
    if (!typed) { fields.push(f); continue; }
    if (isNumericBlank(blank, answers)) {
      const n = parseNum(typed);
      if (n == null) { f.kind = 'malformed'; f.msg = `Blank ${i + 1}: enter a number.`; fields.push(f); continue; }
      f.normalized = n;
      const ok = answers.some((a) => numEq(n, parseNum(a), blank.tol));
      f.ok = ok;
      f.kind = ok ? 'correct' : 'wrong';
      if (!ok) f.msg = blank.why?.[typed] ?? blank.wrongMsg ?? `Blank ${i + 1}: not ${typed}.`;
      fields.push(f);
      continue;
    }
    const choices = choicesFor(part, i);
    f.normalized = normalizeTerm(typed);
    const m = matchTerm(typed, answers);
    if (m.ok) {
      f.ok = true;
      f.kind = 'correct';
      f.spelling = m.spelling;
      if (m.spelling) f.msg = `(spelling: ${canonical})`;
      fields.push(f);
      continue;
    }
    f.kind = 'wrong';
    const picked = choices?.find((c) => normalizeTerm(c) === normalizeTerm(typed)) ?? typed;
    f.msg = blank.why?.[picked] ?? blank.why?.[typed] ?? blank.wrongMsg ?? (choices ? `Blank ${i + 1}: not “${picked}”.` : `Blank ${i + 1}: “${typed}” isn't it.`);
    fields.push(f);
  }
  const okCount = fields.filter((f) => f.ok).length;
  const credit = nBlanks ? okCount / nBlanks : 0;
  const normalized = fields.map((f) => f.normalized);
  const wrong = fields.filter((f) => f.kind === 'wrong');
  const spellingNotes = fields.filter((f) => f.spelling).map((f) => f.msg);
  if (wrong.length) {
    const msg = wrong.length === 1 ? wrong[0].msg : `${wrong.length} blanks wrong. ${wrong.map((f) => f.msg).join(' ')}`;
    return result('wrong', msg, { credit, normalized, fields });
  }
  const open = fields.filter((f) => f.kind === 'blank' || f.kind === 'malformed');
  if (open.length) {
    const bad = open.find((f) => f.kind === 'malformed');
    const msg = bad ? bad.msg : okCount ? `${open.length} blank${open.length > 1 ? 's' : ''} left.` : 'Fill in the blanks.';
    return result('malformed', msg, { credit, normalized, fields });
  }
  return result('correct', spellingNotes.join(' '), { credit: 1, normalized, fields });
}

export default grade;
