// multi.js — the `multi` grader (COMPOSED S3 "Parts · multi"): labelled fields in the teacher's
// order, each graded independently through num.js; item ok iff every required field is ok.
// DOM-free; never throws on student input.
//
// grade(part, raw, ctx) → { ok, kind, credit: fields ok / fields total, msg, tags, normalized:{key:text},
//                           fields:[{key, label, state:'ok'|'wrong'|'blank'|'malformed'|'filled', ok, kind, msg, tags,
//                                    normalized, value, wedge, bonus}], fill?:{key:text}, autoSplit?:true }
//   part { type:'multi', fields:[{key, label, answer, tol?, wedge?, bonus?, asks?, distractors?}], orderFree?, tol?,
//          misconceptions?:[{answer, tag, msg, field?}] }
//   raw  { [key]: value }            — one value per field (the widget's normal submit)
//        | [v0, v1, …]               — values in field order
//        | "(-10, 45)" / "30 and 60" — ONE string for the whole part: split on , ; and/or/newlines and assigned in order
//                                      (a deliberate full answer — graded as an attempt)
//   ctx  { misconceptions?, card?, tol?, state? }
//
// Rules (S3): correct fields lock (the widget re-submits them unchanged); blank fields stay open and are
// never an attempt (`kind:'almost'` while something is right and the rest blank, `malformed` when nothing
// parses); `orderFree:true` grades as a multiset (ang-02, ang-07, wp-09); a `bonus` field left blank never
// blocks `ok`. Field-swap: a wrong field whose value equals a sibling's answer → "that's the {label} — it goes
// in the other box" (tag swapped-fields). Two answers in one field with a blank sibling → auto-split: the
// result carries `fill` (what to put where) and is `almost` "one number per field — filled both for you"
// (not an attempt, nothing graded yet).
//
// tags:['swapped-fields']

import { numEquals } from './normalize.js';
import {
  grade as gradeNum, result, isBlank, parseValue, toVal, show, tolOf, misconceptionsOf, cap,
} from './num.js';
import { splitList } from './roots.js';

function labelOf(f) {
  return String(f.label ?? f.key ?? '').replace(/\s*[=:]\s*$/, '').trim() || String(f.key);
}

/** "complement" → "the complement"; "x", "m∠ABD", "the other angle" stay as they are. */
function named(label) {
  if (/^(the|a|an|one|its)\b/i.test(label) || /^[a-z]$/i.test(label) || /^m?∠/i.test(label)) return label;
  return `the ${label}`;
}

/** raw → { [key]: value }, plus whether raw was one string for the whole part. */
export function valuesOf(part, raw) {
  const fields = part.fields ?? [];
  if (raw == null) return { values: {}, whole: false };
  if (typeof raw === 'string' || typeof raw === 'number' || (typeof raw === 'object' && 'n' in raw && 'd' in raw)) {
    if (fields.length === 1) return { values: { [fields[0].key]: raw }, whole: true };
    const toks = typeof raw === 'string' ? splitList(raw) : [raw];
    const values = {};
    fields.forEach((f, i) => { if (i < toks.length) values[f.key] = toks[i]; });
    return { values, whole: true };
  }
  if (Array.isArray(raw)) {
    const values = {};
    fields.forEach((f, i) => { values[f.key] = raw[i]; });
    return { values, whole: false };
  }
  if (typeof raw === 'object') {
    if ('ok' in raw && 'value' in raw && fields.length === 1) return { values: { [fields[0].key]: raw }, whole: true };
    const values = {};
    for (const f of fields) {
      if (f.key in raw) values[f.key] = raw[f.key];
      else if (f.label != null && f.label in raw) values[f.key] = raw[f.label];
      else if (f.id != null && f.id in raw) values[f.key] = raw[f.id];
    }
    return { values, whole: false };
  }
  return { values: {}, whole: false };
}

/** The auto-split of S3: a field holding exactly two numbers while a sibling is blank. */
function autoSplit(fields, values) {
  for (const f of fields) {
    const v = values[f.key];
    if (typeof v !== 'string' || isBlank(v)) continue;
    const toks = splitList(v);
    if (toks.length !== 2) continue;
    if (!toks.every((t) => parseValue(t).ok)) continue;
    const sibling = fields.find((g) => g.key !== f.key && isBlank(values[g.key]));
    if (!sibling) continue;
    return { [f.key]: toks[0], [sibling.key]: toks[1] };
  }
  return null;
}

/**
 * grade — see the header.
 */
export function grade(part = {}, raw, ctx = {}) {
  const fields = Array.isArray(part.fields) ? part.fields : [];
  if (!fields.length) return result('malformed', 'This item has no fields yet.', { err: 'bad-part', fields: [] });
  const { values, whole } = valuesOf(part, raw);
  const tol = tolOf(part, ctx);
  const misc = misconceptionsOf(part, ctx);

  // auto-split (only for per-field submits: a whole-part string is already split in order)
  if (!whole) {
    const fill = autoSplit(fields, values);
    if (fill) {
      const out = fields.map((f) => ({
        key: f.key, label: labelOf(f), state: f.key in fill ? 'filled' : (isBlank(values[f.key]) ? 'blank' : 'open'),
        ok: false, kind: 'almost', msg: '', tags: [], normalized: fill[f.key] ?? null, value: null, wedge: f.wedge ?? null, bonus: !!f.bonus,
      }));
      return result('almost', 'One number per field — filled both for you.', {
        fields: out, fill, autoSplit: true, normalized: Object.fromEntries(out.map((f) => [f.key, f.normalized])),
      });
    }
  }

  const out = [];
  const tags = [];
  const parsed = new Map();
  for (const f of fields) {
    const v = values[f.key];
    const row = {
      key: f.key, label: labelOf(f), state: 'blank', ok: false, kind: 'malformed', msg: '', tags: [],
      normalized: null, value: null, wedge: f.wedge ?? null, bonus: !!f.bonus,
    };
    if (isBlank(v)) { out.push(row); continue; }
    const p = parseValue(v);
    if (!p.ok) {
      row.state = 'malformed';
      const sub = gradeNum({ ...f, answer: f.answer ?? '0' }, v, ctx);
      row.msg = sub.msg;
      row.normalized = p.normalized ?? null;
      out.push(row);
      continue;
    }
    parsed.set(f.key, p);
    row.normalized = p.text ?? p.normalized;
    row.value = p.value;
    row.state = 'open';
    out.push(row);
  }

  const answerOf = (f) => toVal(f.answer);
  const fieldTol = (f) => (typeof f.tol === 'number' && f.tol >= 0 ? f.tol : tol);

  if (part.orderFree) {
    // multiset: each parsed value claims the first unused answer it equals
    const used = new Set();
    for (const row of out) {
      if (row.state !== 'open') continue;
      const f = fields.find((g) => g.key === row.key);
      const hit = fields.find((g) => !used.has(g.key) && answerOf(g) !== null && numEquals(row.value, answerOf(g), fieldTol(g)));
      if (hit) { used.add(hit.key); row.ok = true; row.kind = 'correct'; row.state = 'ok'; row.msg = '✓'; continue; }
      // wrong: run the num diagnosis against this field's own answer (chain / misconceptions / sign)
      const sub = gradeNum({ ...f, id: part.id, misconceptions: misc }, parsed.get(row.key), ctx);
      row.ok = false; row.kind = 'wrong'; row.state = 'wrong'; row.msg = sub.msg; row.tags = sub.tags ?? [];
      tags.push(...row.tags);
    }
  } else {
    const via = new Map();
    for (const row of out) {
      if (row.state !== 'open') continue;
      const f = fields.find((g) => g.key === row.key);
      const sub = gradeNum({ ...f, id: part.id, misconceptions: misc }, parsed.get(row.key), ctx);
      if (sub.ok) { row.ok = true; row.kind = 'correct'; row.state = 'ok'; row.msg = '✓'; continue; }
      row.ok = false; row.kind = 'wrong'; row.state = 'wrong'; row.msg = sub.msg; row.tags = sub.tags ?? [];
      via.set(row.key, sub.via ?? 'generic');
    }
    // field swap (S3): a wrong field whose value is another field's answer. A true mutual swap always gets the
    // swap line on both fields; a one-sided one gets it unless the card wrote its own misconception line for it.
    const holds = (row, g) => row.state === 'wrong' && answerOf(g) !== null && numEquals(row.value, answerOf(g), fieldTol(g));
    const differ = (f, g) => !(answerOf(f) !== null && answerOf(g) !== null && numEquals(answerOf(f), answerOf(g), fieldTol(g)));
    const swapLine = (row, other) => { row.msg = `That's ${named(labelOf(other))} — it goes in the other box.`; row.tags = ['swapped-fields']; };
    for (const row of out) {
      if (row.state !== 'wrong') continue;
      const f = fields.find((g) => g.key === row.key);
      const other = fields.find((g) => g.key !== f.key && differ(f, g) && holds(row, g));
      if (!other) continue;
      const otherRow = out.find((r) => r.key === other.key);
      const mutual = otherRow && holds(otherRow, f);
      if (mutual || via.get(row.key) !== 'misconception') swapLine(row, other);
    }
    for (const row of out) if (row.state === 'wrong') tags.push(...row.tags);
  }

  const required = out.filter((r) => !r.bonus);
  const okCount = out.filter((r) => r.ok).length;
  const total = fields.length;
  const wrongRows = out.filter((r) => r.state === 'wrong');
  const badRows = out.filter((r) => r.state === 'malformed');
  const blankRequired = required.filter((r) => r.state === 'blank');
  const normalized = Object.fromEntries(out.map((r) => [r.key, r.normalized]));
  const credit = total ? okCount / total : 0;
  const many = fields.length > 1;
  const line = (r) => (many ? `${cap(r.label)}: ${r.msg}` : r.msg);

  if (wrongRows.length) {
    return result('wrong', wrongRows.map(line).join(' '), { fields: out, normalized, tags: [...new Set(tags)], credit });
  }
  if (badRows.length) {
    return result('malformed', badRows.map(line).join(' '), { fields: out, normalized, credit, err: 'parse' });
  }
  if (!out.some((r) => r.state === 'ok')) {
    return result('malformed', 'Type an answer.', { fields: out, normalized, credit: 0, err: 'empty' });
  }
  if (blankRequired.length) {
    const names = blankRequired.map((r) => r.label).join(', ');
    return result('almost', `${okCount} of ${total} ✓ — fill in ${names}.`, { fields: out, normalized, credit });
  }
  const bonusBlank = out.filter((r) => r.bonus && r.state === 'blank').length;
  return result('correct', bonusBlank ? `✓ (${bonusBlank} bonus field${bonusBlank > 1 ? 's' : ''} left blank)` : '✓', {
    fields: out, normalized, credit: 1,
    answer: Object.fromEntries(fields.map((f) => [f.key, show(f.answer)])),
  });
}

export default grade;
