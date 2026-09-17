// reject.js — the `reject` grader (COMPOSED S3 "Parts · reject"): after `roots`, each found root gets
// Keep / Reject plus ONE reason from the menu {negative length, negative angle, angle > 180, zero angle,
// doesn't satisfy the equation, both valid, neither}. DOM-free; never throws on student input.
//
// grade(part, raw, ctx) → { ok, kind, credit, msg, tags, normalized:{keep:[texts], reject:[texts], reason},
//                           verdictsOk, reasonOk, roots:[{value, text, keep:boolean|null, valid:boolean}], reasonKey }
//   part { type:'reject', of:'x', valid:['3','-1/2'], rejected?:['-2'] (or invalid), reason:'negative side length',
//          reasonKey?:'negative-length' (menu id; derived from `reason` when absent), distractors:[texts], tol? }
//   raw  { keep:[…], reject:[…], reason }                       — lists of root texts / values
//        | { verdicts:{ '3':'keep', '-1/2':'reject' }, reason }  — keyed by root text
//        | { decisions:[{root, keep:boolean}] | [{root, verdict}], reason }
//        | [{ root, verdict|keep, reason? }, …]                  — one object per root (reason on any of them)
//        reason: menu id | menu text | the item's reason text | a distractor text | {id|text} | index into menu(part)
//   ctx  { roots?:[values found in the roots stage] (defaults to valid ∪ rejected), misconceptions?, card? }
//
// Verdicts are compared as sets (matched by tolerance): a valid root rejected → wrong (tag rejected-valid-root),
// an invalid root kept → wrong (kept-invalid-root). Right verdicts + wrong reason → wrong (wrong-reject-reason),
// credit 0.5. Nothing decided → malformed; verdicts right but no reason → malformed "pick a reason" (free).
// The reject reason is never revealed in a message.
//
// tags:['rejected-valid-root','kept-invalid-root','wrong-reject-reason']

import { numEquals } from './normalize.js';
import { rngFrom } from '../rng.js';
import { result, isBlank, toVal, show, tolOf, misconceptionsOf, inScope } from './num.js';

/** The S3 reason menu (ids are the content tickets' `reasonKey` values). */
export const REASONS = Object.freeze([
  Object.freeze({ id: 'negative-length', text: 'negative length' }),
  Object.freeze({ id: 'negative-angle', text: 'negative angle' }),
  Object.freeze({ id: 'angle-over-180', text: 'angle > 180' }),
  Object.freeze({ id: 'zero-angle', text: 'zero angle' }),
  Object.freeze({ id: 'not-a-solution', text: "doesn't satisfy the equation" }),
  Object.freeze({ id: 'both-valid', text: 'both valid' }),
  Object.freeze({ id: 'neither', text: 'neither' }),
]);

const ALIASES = {
  'negative-length': /negative\s+(side\s+)?length|negative\s+side|length\s+(is\s+|would\s+be\s+)?negative|neg-?length/,
  'negative-angle': /negative\s+(angle|measure)|angle\s+(is\s+|would\s+be\s+)?negative|neg-?angle/,
  'angle-over-180': /(>|over|more\s+than|greater\s+than|exceeds?|above)\s*180|180\s*<|over-?180/,
  'zero-angle': /zero\s+angle|angle\s+(of\s+)?(zero|0)\b|=\s*0°?$|zero-?angle/,
  'not-a-solution': /(does\s*n['’o]?t|doesn'?t|not)\s+(a\s+)?(satisf|solution|work|solve)|not-?(a-)?solution/,
  'both-valid': /\bboth\b|\ball\s+(roots\s+)?(valid|work)|both-?valid|^valid\b|(measures?|values?)\s+(come|comes|stay|stays)\s+positive/,
  'neither': /\bneither\b|\bnone\b|reject\s+both/,
};

function normText(s) {
  return String(s ?? '').normalize('NFKC').toLowerCase().replace(/[−–—]/g, '-').replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
}

/** A reason (id, text, index, or {id|text}) → { id: menu id | null, text } */
export function reasonId(reason, part = {}) {
  if (reason == null) return { id: null, text: '' };
  if (typeof reason === 'object' && !Array.isArray(reason)) {
    if (reason.id != null) return reasonId(reason.id, part);
    if (reason.key != null) return reasonId(reason.key, part);
    return reasonId(reason.text, part);
  }
  if (typeof reason === 'number' && Number.isInteger(reason)) {
    const m = menu(part);
    return reason >= 0 && reason < m.length ? reasonId(m[reason].text, part) : { id: null, text: String(reason) };
  }
  const text = String(reason).trim();
  const n = normText(text);
  if (!n) return { id: null, text };
  const byId = REASONS.find((r) => r.id === n);
  if (byId) return { id: byId.id, text };
  const byText = REASONS.find((r) => normText(r.text) === n);
  if (byText) return { id: byText.id, text };
  for (const [id, re] of Object.entries(ALIASES)) if (re.test(n)) return { id, text };
  return { id: null, text };
}

/** The expected reason id for a part: `reasonKey`, else derived from `reason`, else from the root lists. */
export function expectedReason(part = {}) {
  if (part.reasonKey) return String(part.reasonKey);
  const fromText = part.reason != null ? reasonId(part.reason, part).id : null;
  if (fromText) return fromText;
  const valid = listOf(part.valid), rejected = listOf(part.rejected ?? part.invalid);
  if (valid.length && !rejected.length) return 'both-valid';
  if (!valid.length && rejected.length) return 'neither';
  return null;
}

/**
 * menu — the reason chips for the widget: the item's own reason text, its distractors, then the standard
 * seven (deduplicated by meaning), in a deterministic order seeded by the part id. Both-valid items always
 * carry the "−1/2 is negative so reject it"-style distractor the content provides.
 */
export function menu(part = {}, opts = {}) {
  const items = [];
  const seen = new Set();
  // card r1: when the roots stage ended with ONE root found (a second-subset miss), a chip that names a
  // root the student has not seen would leak it, and "both …" / "neither" are nonsense for a single root.
  // `opts.roots` (the found roots as text) drops those and offers a singular "valid" wording instead.
  const found = Array.isArray(opts.roots) ? opts.roots.map((r) => toVal(r)).filter((v) => v !== null) : null;
  const known = [...listOf(part.valid), ...listOf(part.rejected ?? part.invalid)];
  const unseen = found ? known.filter((k) => !found.some((f) => numEquals(f, k.value, 1e-9))) : [];
  const single = !!found && found.length === 1 && known.length > 1;
  const leaks = (t) => {
    const n = normText(t);
    if (unseen.some((k) => { const txt = normText(typeof k.raw === 'string' ? k.raw : show(k.raw)); return txt && new RegExp(`(^|[^0-9./])${txt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![0-9./])`).test(n); })) return true;
    return single && /\bboth\b|\bneither\b|\ball\s+(roots|of them)\b/.test(n);
  };
  const add = (text, force = false) => {
    const t = String(text ?? '').trim();
    if (!t) return;
    if (!force && leaks(t)) return;
    const key = normText(t);
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ text: t });
  };
  const expected = expectedReason(part);
  if (part.reason) add(part.reason);
  if (single && expected === 'both-valid' && !items.length) add('valid — every measure comes out positive', true);
  for (const d of (Array.isArray(part.distractors) ? part.distractors : [])) add(typeof d === 'string' ? d : d && d.text);
  for (const r of REASONS) {
    if (r.id === expected && part.reason) continue; // the item's own wording already stands for this one
    add(r.text);
  }
  const order = rngFrom('reject-menu', part.id ?? 'reject', part.of ?? '').shuffle(items);
  return order;
}

function listOf(x) {
  if (x == null) return [];
  return (Array.isArray(x) ? x : [x]).map((r) => ({ raw: r, value: toVal(r) })).filter((r) => r.value !== null);
}

/** Every root the stage decides on: ctx.roots (found in the roots stage) else valid ∪ rejected. */
function rootsOf(part, raw, ctx) {
  const valid = listOf(part.valid);
  const rejected = listOf(part.rejected ?? part.invalid);
  const listed = [...valid.map((r) => ({ ...r, valid: true })), ...rejected.map((r) => ({ ...r, valid: false }))];
  const tol = tolOf(part, ctx);
  const src = (ctx && ctx.roots) ?? (raw && raw.roots) ?? null;
  if (!src) return listed;
  const found = listOf(src);
  const out = [];
  for (const f of found) {
    const hit = listed.find((l) => numEquals(l.value, f.value, tol));
    out.push(hit ? { ...hit, raw: f.raw } : { raw: f.raw, value: f.value, valid: false, unknown: true });
  }
  return out;
}

/** raw → { verdicts:[{value, text, keep:boolean}], reason } */
export function parseRaw(raw, part = {}) {
  const verdicts = [];
  let reason = null;
  const push = (root, keep) => {
    const value = toVal(root);
    if (value === null) return;
    verdicts.push({ value, text: typeof root === 'string' ? root : show(root), keep });
  };
  const verdictOf = (v) => {
    if (typeof v === 'boolean') return v;
    const n = normText(v);
    if (/^(keep|k|valid|yes|y|true|1|✓)$/.test(n)) return true;
    if (/^(reject|r|invalid|no|n|false|0|✗|x)$/.test(n)) return false;
    return null;
  };
  const entry = (e) => {
    if (!e || typeof e !== 'object') return;
    const root = e.root ?? e.x ?? e.value;
    const keep = e.keep != null ? verdictOf(e.keep) : verdictOf(e.verdict ?? e.decision);
    if (root != null && keep !== null) push(root, keep);
    if (e.reason != null && reason == null) reason = e.reason;
  };
  if (Array.isArray(raw)) raw.forEach(entry);
  else if (raw && typeof raw === 'object') {
    for (const r of (Array.isArray(raw.keep) ? raw.keep : raw.keep != null ? [raw.keep] : [])) push(r, true);
    for (const r of (Array.isArray(raw.reject) ? raw.reject : raw.reject != null ? [raw.reject] : [])) push(r, false);
    if (raw.verdicts && typeof raw.verdicts === 'object') {
      for (const [root, v] of Object.entries(raw.verdicts)) { const k = verdictOf(v); if (k !== null) push(root, k); }
    }
    if (Array.isArray(raw.decisions)) raw.decisions.forEach(entry);
    if (raw.reason != null) reason = raw.reason;
  }
  return { verdicts, reason };
}

/**
 * grade — see the header.
 */
export function grade(part = {}, raw, ctx = {}) {
  const tol = tolOf(part, ctx);
  const roots = rootsOf(part, raw, ctx);
  if (!roots.length) return result('malformed', 'This item lists no roots to decide on.', { err: 'bad-part', roots: [] });
  const { verdicts, reason } = parseRaw(raw, part);
  const rows = roots.map((r) => {
    const v = verdicts.find((d) => numEquals(d.value, r.value, tol));
    return { value: r.value, text: show(r.raw), keep: v ? v.keep : null, valid: !!r.valid };
  });
  const undecided = rows.filter((r) => r.keep === null);
  const label = `${part.of ?? 'x'} = `;
  const normalized = {
    keep: rows.filter((r) => r.keep === true).map((r) => r.text),
    reject: rows.filter((r) => r.keep === false).map((r) => r.text),
    reason: reason == null ? null : (typeof reason === 'object' ? (reason.text ?? reason.id ?? null) : String(reason)),
  };
  const base = { roots: rows, normalized, reasonKey: expectedReason(part) };
  if (undecided.length === rows.length) {
    return result('malformed', `Decide Keep or Reject for ${rows.map((r) => label + r.text).join(' and ')}.`, { ...base, err: 'empty', verdictsOk: false, reasonOk: false });
  }
  if (undecided.length) {
    return result('malformed', `Decide Keep or Reject for ${undecided.map((r) => label + r.text).join(' and ')} too.`, { ...base, err: 'incomplete', verdictsOk: false, reasonOk: false });
  }

  // card misconceptions written as "keep -2" / "reject 5"
  const misc = misconceptionsOf(part, ctx).filter((m) => m && inScope(m, { part: part.id ?? null }));
  const tags = [];
  let msg = null;
  const rejectedValid = rows.filter((r) => r.valid && r.keep === false);
  const keptInvalid = rows.filter((r) => !r.valid && r.keep === true);
  for (const r of [...rejectedValid, ...keptInvalid]) {
    const want = r.keep ? 'keep' : 'reject';
    const m = misc.find((e) => {
      const mm = /^(keep|reject)\s+(.+)$/i.exec(String(e.answer ?? ''));
      if (!mm || mm[1].toLowerCase() !== want) return false;
      const val = toVal(mm[2]);
      return val !== null && numEquals(val, r.value, tol);
    });
    if (m) { msg = m.msg || null; if (m.tag) tags.push(m.tag); break; }
  }
  if (rejectedValid.length || keptInvalid.length) {
    if (msg === null) {
      if (rejectedValid.length) {
        const r = rejectedValid[0];
        msg = `${label}${r.text} is a valid root — a negative or small value is not automatically wrong. Substitute it: every measure stays positive.`;
        tags.push('rejected-valid-root');
      } else {
        const r = keptInvalid[0];
        msg = `${label}${r.text} can't be kept — substitute it into every expression and look at what comes out.`;
        tags.push('kept-invalid-root');
      }
    } else if (!tags.length) {
      tags.push(rejectedValid.length ? 'rejected-valid-root' : 'kept-invalid-root');
    }
    return result('wrong', msg, { ...base, tags: [...new Set(tags)], verdictsOk: false, reasonOk: false, credit: 0 });
  }

  // verdicts right — now the reason
  const expected = expectedReason(part);
  if (reason == null || (typeof reason === 'string' && !reason.trim())) {
    return result('malformed', 'Verdicts ✓ — now pick the reason.', { ...base, err: 'no-reason', verdictsOk: true, reasonOk: false, credit: 0.5 });
  }
  const picked = reasonId(reason, part);
  const pickedNorm = normText(picked.text);
  const distractors = (Array.isArray(part.distractors) ? part.distractors : []).map((d) => normText(typeof d === 'string' ? d : d && d.text));
  let reasonOk = false;
  if (part.reason != null && pickedNorm && pickedNorm === normText(part.reason)) reasonOk = true;
  else if (distractors.includes(pickedNorm)) reasonOk = false;
  else if (expected && picked.id === expected) reasonOk = true;
  else if (!expected && part.reason == null) reasonOk = true; // an item with no reason on file: any pick
  if (reasonOk) {
    const keepN = rows.filter((r) => r.keep).length;
    const summary = keepN === rows.length ? 'Keep both ✓' : keepN === 0 ? 'Reject both ✓' : `Keep ${rows.filter((r) => r.keep).map((r) => r.text).join(', ')}, reject ${rows.filter((r) => !r.keep).map((r) => r.text).join(', ')} ✓`;
    return result('correct', summary, { ...base, verdictsOk: true, reasonOk: true, credit: 1 });
  }
  return result('wrong', 'Right verdict, wrong reason — say what actually goes wrong (or right) when you substitute each root.', {
    ...base, tags: ['wrong-reject-reason'], verdictsOk: true, reasonOk: false, credit: 0.5,
  });
}

export default grade;
