// strip.js — Proof Strip grader: "explain without NLP" (COMPOSED S3 "strip", doc-05 / ang-05). DOM-free, pure.
//
// part: { type:'strip', slots:[slot…], prose?:string, doneMsg?:string }
//   slot types (each = one ordered step of the explanation):
//     { id, type:'pick',    label, options:[string|{text, why?, misconception?}], answer, why?:{[text]:msg} }  equation pick 1 of 3
//     { id, type:'num',     label, answer, tol?, distractors?:{[name]:value}, wrongMsg? }                       x
//     { id, type:'multi',   label, fields:[{key, label, answer, tol?}] }                                        the halves
//     { id, type:'verdict', label, options?:['YES','NO'], answer, why?:{[text]:msg} }                           Yes / No
//     { id, type:'chips',   label, chips:[{text, role, why?, misconception?}] }                                  justify
//         chip.role ∈ required | forbidden | neutral  (exactly ONE required chip per slot; `tag` is accepted as a
//         legacy alias of `role`, but authors should write `role` — the T06g scanner treats every quoted
//         tag literal under site/data as a misconception tag).  chip.misconception / option.misconception: a catalogued
//         misconception tag emitted when that chip/option is chosen.
//   prose: template with [[slotId]] / [[slotId.fieldKey]] placeholders, in mathfmt mini-markup.
//
// raw (whole-strip submit): { [slotId]: value }  — value shapes: pick → option text | index;
//   num → string; multi → {key: string} | [values in field order]; verdict → 'YES'|'NO'|y/n|index;
//   chips → [chip text | index, …]. A slot not present in raw is unanswered.
// ctx: { gradePart?:(part, raw, ctx) => result }  — the T03 dispatcher; when present, num/multi slots are
//   routed through the real num/multi graders (asks-chain diagnosis, field-swap, auto-split). Without it the
//   slot is graded here with T02's parseNumber/numEquals (same parser, same one tolerance rule).
//
// Semantics (S3): slots grade LEFT TO RIGHT; a wrong slot reveals its answer (state 'revealed') and the
// next slot unlocks; blank/unparseable input is 'malformed' (free). Justify chips are required / forbidden /
// neutral: correct iff the required chip is selected and no forbidden one; neutrals cost nothing.
// On clear the strip renders as copyable prose (prose()).
//
// grade(part, raw, ctx) → {
//   ok            — the strip is complete AND every slot was answered correctly (never true after a reveal)
//   kind          — verdict of the NEWEST answered slot: 'correct' | 'wrong' (reveal) | 'malformed' (free)
//   credit        — slots ok / slots total
//   msg           — the newest slot's line (a wrong one ends with "Answer: …")
//   complete      — every slot answered
//   next          — id of the first unanswered slot, or null
//   reveal        — {id, answer} when the newest slot was wrong, else null
//   revealed      — ids of every revealed slot so far
//   slots         — [{id, label, type, state:'ok'|'revealed'|'pending'|'locked', ok, msg, answer, fields?, raw}]
//   prose         — {text, html} (always; the model explanation)
//   tags, normalized }
// gradeSlot(part, slot, raw, ctx) grades one slot in isolation (same per-slot result shape).
//
// Misconception tags emitted here (all catalogued in data/misconceptions.js):
// tags:['forbidden-reason', 'missing-reason', 'wrong-verdict', 'swapped-fields', 'sign-flip']

import { mathfmt, stripMarkup } from '../mathfmt.js';
import { normOption } from './mc.js';
import { parseNumber, numEquals, numIsNegOf, formatNumber } from './normalize.js';

// ---------- numbers ----------

/** Parse one number with T02's parser → Rat | number | null (null when unparseable). */
export function parseNum(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (raw != null && typeof raw === 'object' && 'n' in raw && 'd' in raw) return raw;
  const r = parseNumber(raw);
  return r.ok ? r.value : null;
}

/** numEquals with S3's one tolerance rule (part.tol ?? 0.01). */
export function numEq(a, b, tol) {
  if (a == null || b == null) return false;
  return numEquals(a, b, typeof tol === 'number' && tol >= 0 ? tol : 0.01);
}

function fmtNum(v) {
  return formatNumber(v, { style: 'decimal' });
}

// ---------- helpers ----------

function normEq(s) {
  return normOption(s).replace(/\s+/g, '').replace(/[*·×]/g, '');
}

function asOpt(o) {
  return typeof o === 'string' ? { text: o } : { ...o, text: String(o.text ?? '') };
}

function roleOf(chip) {
  return String(chip.role ?? chip.tag ?? '').toLowerCase();
}

function isBlank(v) {
  if (v == null) return true;
  if (typeof v === 'string') return !v.trim();
  if (Array.isArray(v)) return v.length === 0;
  if (v instanceof Set) return v.size === 0;
  if (typeof v === 'object') return Object.values(v).every(isBlank);
  return false;
}

function slotRes(kind, msg, extra = {}) {
  return { ok: kind === 'correct', kind, msg, tags: [], normalized: null, ...extra };
}

function pickOption(options, raw) {
  const opts = options.map(asOpt);
  if (raw == null) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    if (Number.isInteger(raw.index)) return opts[raw.index] ?? null;
    raw = raw.text;
  }
  if (typeof raw === 'number') return Number.isInteger(raw) ? opts[raw] ?? null : null;
  const n = normEq(raw);
  if (!n) return null;
  return opts.find((o) => normEq(o.text) === n) ?? null;
}

/** The required chip of a chips slot (validate() guarantees exactly one). */
export function requiredChip(slot) {
  return (slot.chips ?? []).map(asOpt).find((c) => roleOf(c) === 'required') ?? null;
}

/** Display string of a slot's answer (what a reveal shows / what prose uses). */
export function slotAnswer(slot) {
  switch (slot.type) {
    case 'pick': return String(slot.answer ?? '');
    case 'num': return String(slot.answer ?? '');
    case 'multi': return (slot.fields ?? []).map((f) => `${f.label ?? f.key} = ${f.answer}`).join(', ');
    case 'verdict': return String(slot.answer ?? '');
    case 'chips': return requiredChip(slot)?.text ?? '';
    default: return '';
  }
}

// ---------- per-slot graders ----------

function gradePick(slot, raw) {
  const picked = pickOption(slot.options ?? [], raw);
  if (!picked) return slotRes('malformed', 'Pick one of the equations.', { answer: slotAnswer(slot) });
  const ok = normEq(picked.text) === normEq(slot.answer);
  const normalized = picked.text;
  if (ok) return slotRes('correct', slot.okMsg ?? '', { normalized, answer: slotAnswer(slot) });
  const why = slot.why?.[picked.text] ?? picked.why ?? 'Not that equation.';
  return slotRes('wrong', why, { normalized, answer: slotAnswer(slot), tags: picked.misconception ? [picked.misconception] : [] });
}

function mapSub(slot, r) {
  const kind = r.kind === 'correct' || r.kind === 'wrong' || r.kind === 'malformed' || r.kind === 'almost' ? r.kind : (r.ok ? 'correct' : 'wrong');
  // an `almost` from a sub-grader is free, like malformed: the slot stays open
  const k = kind === 'almost' ? 'malformed' : kind;
  return slotRes(k, k === 'correct' ? (slot.okMsg ?? '') : (r.msg ?? ''), { normalized: r.normalized ?? null, answer: slotAnswer(slot), fields: r.fields ?? null, tags: r.tags ?? [] });
}

function gradeNum(slot, raw, ctx) {
  if (typeof ctx.gradePart === 'function') {
    const sub = { type: 'num', answer: slot.answer, tol: slot.tol, asks: slot.asks, distractors: slot.distractors, ...(slot.numPart ?? {}) };
    return mapSub(slot, ctx.gradePart(sub, raw, ctx) ?? {});
  }
  const p = parseNumber(raw);
  if (!p.ok) return slotRes('malformed', p.msg ? `${p.msg[0].toUpperCase()}${p.msg.slice(1)}.` : 'Enter a number.', { answer: slotAnswer(slot) });
  const v = p.value;
  const ans = parseNum(slot.answer);
  const tol = slot.tol;
  if (numEq(v, ans, tol)) return slotRes('correct', slot.okMsg ?? '', { normalized: v, answer: slotAnswer(slot) });
  let msg = slot.wrongMsg ?? null;
  const tags = [];
  if (!msg && numIsNegOf(v, ans, tol ?? 0.01)) { msg = 'Right size, wrong sign — check which side each term moved to.'; tags.push('sign-flip'); }
  if (!msg && slot.distractors) {
    for (const [name, val] of Object.entries(slot.distractors)) {
      if (numEq(v, parseNum(val), tol)) { msg = `${fmtNum(v)} is the ${name} — this slot asks for ${slot.label ?? 'something else'}.`; break; }
    }
  }
  return slotRes('wrong', msg ?? `${fmtNum(v)} doesn't check — solve the equation again.`, { normalized: v, answer: slotAnswer(slot), tags });
}

function gradeMulti(slot, raw, ctx) {
  const fields = slot.fields ?? [];
  const values = Array.isArray(raw) ? Object.fromEntries(fields.map((f, i) => [f.key, raw[i]])) : (raw && typeof raw === 'object' ? raw : {});
  if (typeof ctx.gradePart === 'function') {
    return mapSub(slot, ctx.gradePart({ type: 'multi', fields, orderFree: slot.orderFree }, values, ctx) ?? {});
  }
  const out = [];
  const tags = [];
  let wrong = 0;
  let open = 0;
  for (const f of fields) {
    const rawV = values[f.key];
    const row = { key: f.key, label: f.label ?? f.key, ok: false, kind: 'blank', msg: '', answer: String(f.answer), normalized: null };
    if (isBlank(rawV)) { out.push(row); open++; continue; }
    const p = parseNumber(rawV);
    if (!p.ok) { row.kind = 'malformed'; row.msg = `${row.label}: ${p.msg ?? 'enter a number'}.`; out.push(row); open++; continue; }
    const v = p.value;
    row.normalized = v;
    const tol = f.tol ?? slot.tol;
    const ok = numEq(v, parseNum(f.answer), tol);
    row.ok = ok;
    row.kind = ok ? 'correct' : 'wrong';
    if (!ok) {
      wrong++;
      const other = fields.find((g) => g.key !== f.key && !numEq(parseNum(g.answer), parseNum(f.answer), tol) && numEq(v, parseNum(g.answer), g.tol ?? slot.tol));
      if (other) { row.msg = `${fmtNum(v)} is ${other.label ?? other.key} — it goes in the other box.`; tags.push('swapped-fields'); }
      else row.msg = `${row.label} isn't ${fmtNum(v)}.`;
    }
    out.push(row);
  }
  const normalized = Object.fromEntries(out.map((f) => [f.key, f.normalized]));
  if (wrong) return slotRes('wrong', out.filter((f) => f.kind === 'wrong').map((f) => f.msg).join(' '), { normalized, answer: slotAnswer(slot), fields: out, tags });
  if (open) {
    const bad = out.find((f) => f.kind === 'malformed');
    return slotRes('malformed', bad ? bad.msg : open === fields.length ? 'Fill in the boxes.' : `${open} box${open > 1 ? 'es' : ''} left.`, { normalized, answer: slotAnswer(slot), fields: out });
  }
  return slotRes('correct', slot.okMsg ?? '', { normalized, answer: slotAnswer(slot), fields: out });
}

const YES = new Set(['yes', 'y', 'true', 't', '1']);
const NO = new Set(['no', 'n', 'false', 'f', '0']);

function gradeVerdict(slot, raw) {
  const options = (slot.options ?? ['YES', 'NO']).map(asOpt);
  let picked = pickOption(options, raw);
  if (!picked && typeof raw === 'string') {
    const s = raw.trim().toLowerCase();
    const yesOpt = options.find((o) => YES.has(o.text.toLowerCase()));
    const noOpt = options.find((o) => NO.has(o.text.toLowerCase()));
    if (YES.has(s) && yesOpt) picked = yesOpt;
    else if (NO.has(s) && noOpt) picked = noOpt;
  }
  if (!picked) return slotRes('malformed', `Pick ${options.map((o) => o.text).join(' or ')}.`, { answer: slotAnswer(slot) });
  const ok = normEq(picked.text) === normEq(slot.answer);
  if (ok) return slotRes('correct', slot.okMsg ?? '', { normalized: picked.text, answer: slotAnswer(slot) });
  const why = slot.why?.[picked.text] ?? picked.why ?? `Not ${picked.text} — look at the two halves you just found.`;
  return slotRes('wrong', why, { normalized: picked.text, answer: slotAnswer(slot), tags: ['wrong-verdict'] });
}

function gradeChips(slot, raw) {
  const chips = (slot.chips ?? []).map(asOpt);
  const list = raw instanceof Set ? [...raw] : Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  const selected = [];
  for (const r of list) {
    let c = null;
    if (typeof r === 'number' && Number.isInteger(r)) c = chips[r] ?? null;
    else if (r && typeof r === 'object' && Number.isInteger(r.index)) c = chips[r.index] ?? null;
    else c = chips.find((x) => normOption(x.text) === normOption(r && typeof r === 'object' ? r.text : r)) ?? null;
    if (c && !selected.includes(c)) selected.push(c);
  }
  const required = requiredChip(slot);
  const answer = required?.text ?? '';
  if (!selected.length) return slotRes('malformed', 'Pick the reason.', { answer });
  const normalized = selected.map((c) => c.text).sort();
  const forbidden = selected.filter((c) => roleOf(c) === 'forbidden');
  const hasRequired = selected.some((c) => roleOf(c) === 'required');
  const tags = selected.map((c) => c.misconception).filter(Boolean);
  if (hasRequired && !forbidden.length) return slotRes('correct', slot.okMsg ?? '', { normalized, answer, tags });
  if (forbidden.length) {
    const f = forbidden[0];
    return slotRes('wrong', f.why ?? `“${f.text}” isn't true here.`, { normalized, answer, tags: [...tags, 'forbidden-reason'] });
  }
  const neutral = selected.filter((c) => roleOf(c) === 'neutral');
  const msg = neutral.length ? `“${neutral[0].text}” is true, but it isn't the reason.` : 'Which line proves it?';
  return slotRes('wrong', msg, { normalized, answer, tags: [...tags, 'missing-reason'] });
}

/**
 * Grade one slot in isolation.
 * @returns {{ok, kind:'correct'|'wrong'|'malformed', msg, normalized, answer, fields?, tags}}
 */
export function gradeSlot(part, slot, raw, ctx = {}) {
  switch (slot.type) {
    case 'pick': return gradePick(slot, raw);
    case 'num': return gradeNum(slot, raw, ctx);
    case 'multi': return gradeMulti(slot, raw, ctx);
    case 'verdict': return gradeVerdict(slot, raw);
    case 'chips': return gradeChips(slot, raw);
    default: return slotRes('malformed', `Unknown slot type ${slot.type}.`, { answer: '' });
  }
}

// ---------- prose ----------

const PLACEHOLDER = /\[\[\s*([A-Za-z0-9_-]+)(?:\.([A-Za-z0-9_-]+))?\s*\]\]/g;

/** Copyable explanation from the model answers: {text (plain), html (mathfmt)}. */
export function prose(part) {
  const slots = part.slots ?? [];
  let tpl = part.prose;
  if (!tpl) {
    tpl = slots.map((s) => `${s.label ? `${s.label} ` : ''}${slotAnswer(s)}`.trim()).join('; ') + '.';
  }
  const text = tpl.replace(PLACEHOLDER, (m, id, key) => {
    const slot = slots.find((s) => s.id === id);
    if (!slot) return m;
    if (key) {
      const f = (slot.fields ?? []).find((x) => x.key === key);
      return f ? String(f.answer) : m;
    }
    return slotAnswer(slot);
  });
  return { text: stripMarkup(text), html: mathfmt(text) };
}

// ---------- validation ----------

/** Data check for a strip part: [] when sound. Used by tests and by content tickets. */
export function validate(part) {
  const errs = [];
  const slots = part?.slots;
  if (!Array.isArray(slots) || !slots.length) return ['strip needs a non-empty slots[]'];
  const ids = new Set();
  slots.forEach((s, i) => {
    const at = `slot ${i} (${s.id ?? '?'})`;
    if (!s.id) errs.push(`${at}: missing id`);
    else if (ids.has(s.id)) errs.push(`${at}: duplicate id`);
    ids.add(s.id);
    switch (s.type) {
      case 'pick': {
        const opts = (s.options ?? []).map(asOpt);
        if (opts.length < 2) errs.push(`${at}: pick needs ≥ 2 options`);
        if (!opts.some((o) => normEq(o.text) === normEq(s.answer))) errs.push(`${at}: answer is not among the options`);
        break;
      }
      case 'num':
        if (parseNum(s.answer) == null) errs.push(`${at}: num answer "${s.answer}" does not parse`);
        break;
      case 'multi':
        if (!Array.isArray(s.fields) || !s.fields.length) errs.push(`${at}: multi needs fields[]`);
        else s.fields.forEach((f) => { if (!f.key) errs.push(`${at}: field without key`); if (parseNum(f.answer) == null) errs.push(`${at}: field ${f.key} answer "${f.answer}" does not parse`); });
        break;
      case 'verdict': {
        const opts = (s.options ?? ['YES', 'NO']).map(asOpt);
        if (!opts.some((o) => normEq(o.text) === normEq(s.answer))) errs.push(`${at}: verdict answer "${s.answer}" not among ${opts.map((o) => o.text).join('/')}`);
        break;
      }
      case 'chips': {
        const chips = (s.chips ?? []).map(asOpt);
        const req = chips.filter((c) => roleOf(c) === 'required').length;
        if (req !== 1) errs.push(`${at}: chips need exactly one required chip (found ${req})`);
        chips.forEach((c) => { if (!['required', 'forbidden', 'neutral'].includes(roleOf(c))) errs.push(`${at}: chip "${c.text}" has role ${roleOf(c) || '(none)'}`); if (c.tag != null && c.role == null) errs.push(`${at}: chip "${c.text}" uses \`tag\` — write \`role\` (the misconception scanner reads tag literals)`); });
        if (new Set(chips.map((c) => normOption(c.text))).size !== chips.length) errs.push(`${at}: duplicate chip text`);
        break;
      }
      default:
        errs.push(`${at}: unknown type ${s.type}`);
    }
  });
  if (part.prose) {
    for (const m of part.prose.matchAll(PLACEHOLDER)) {
      const slot = slots.find((s) => s.id === m[1]);
      if (!slot) errs.push(`prose: unknown slot [[${m[1]}]]`);
      else if (m[2] && !(slot.fields ?? []).some((f) => f.key === m[2])) errs.push(`prose: unknown field [[${m[1]}.${m[2]}]]`);
    }
  }
  return errs;
}

// ---------- whole-strip grade ----------

/**
 * Grade the strip left to right for the answers submitted so far.
 * @param {object} part
 * @param {object} raw   {[slotId]: value}
 * @param {object} [ctx] {gradePart?}
 */
export function grade(part, raw, ctx = {}) {
  const slots = part.slots ?? [];
  const values = raw && typeof raw === 'object' ? raw : {};
  const rows = [];
  let next = null;
  let newest = null;
  let malformed = null;
  for (const slot of slots) {
    const v = values[slot.id];
    if (next || isBlank(v)) {
      rows.push({ id: slot.id, label: slot.label ?? slot.id, type: slot.type, state: next ? 'locked' : 'pending', ok: false, msg: '', answer: null, raw: v ?? null });
      if (!next) next = slot.id;
      continue;
    }
    const r = gradeSlot(part, slot, v, ctx);
    if (r.kind === 'malformed') {
      rows.push({ id: slot.id, label: slot.label ?? slot.id, type: slot.type, state: 'pending', ok: false, msg: r.msg, answer: null, fields: r.fields ?? null, raw: v });
      malformed = { slot, r };
      next = slot.id;
      continue;
    }
    rows.push({ id: slot.id, label: slot.label ?? slot.id, type: slot.type, state: r.ok ? 'ok' : 'revealed', ok: r.ok, msg: r.msg, answer: r.answer, fields: r.fields ?? null, raw: v, normalized: r.normalized });
    newest = { slot, r };
  }
  const okCount = rows.filter((x) => x.ok).length;
  const revealed = rows.filter((x) => x.state === 'revealed').map((x) => x.id);
  const complete = !next;
  const credit = slots.length ? okCount / slots.length : 0;
  const base = {
    ok: false, kind: 'malformed', credit, msg: '', tags: [], normalized: Object.fromEntries(rows.map((x) => [x.id, x.normalized ?? null])),
    complete, next, reveal: null, revealed, slots: rows, prose: prose(part),
  };
  if (malformed) return { ...base, msg: malformed.r.msg };
  if (!newest) {
    const first = slots[0];
    return { ...base, msg: first ? `Start with ${first.label ?? first.id}.` : 'Empty strip.' };
  }
  const { slot, r } = newest;
  if (!r.ok) {
    const answer = r.answer ?? slotAnswer(slot);
    return { ...base, kind: 'wrong', msg: `${r.msg} Answer: ${answer}.`.trim(), reveal: { id: slot.id, answer }, tags: r.tags ?? [] };
  }
  if (!complete) {
    const nextSlot = slots.find((s) => s.id === next);
    return { ...base, kind: 'correct', msg: r.msg || `Locked in — next: ${nextSlot?.label ?? next}.`, tags: r.tags ?? [] };
  }
  const allOk = okCount === slots.length;
  return { ...base, ok: allOk, kind: 'correct', msg: allOk ? (part.doneMsg ?? 'Complete.') : `Complete — ${revealed.length} step${revealed.length > 1 ? 's' : ''} revealed.`, tags: r.tags ?? [] };
}

export default grade;
