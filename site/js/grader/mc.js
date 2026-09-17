// mc.js — multiple-choice grader (COMPOSED S3 "mc"). DOM-free, pure.
//
// part: { type:'mc', answer:string, distractors:[string|{text, why?, term?, tag?}], term?:string,
//         options?:[...] (explicit option list incl. the answer; overrides answer+distractors),
//         shuffle?:boolean (default true), why?:{[optionText]: msg}, note?:string }
// raw:  option text | 0-based index into options(part, ctx.seed) | {text} | {index}
// ctx:  { seed?:string }  (the seed the widget used to order the options; default part.id)
//
// grade(part, raw, ctx) → {ok, kind, credit, msg, tags, normalized:{picked}, answer, picked}
//
// Tags: an option's own `tag` (a catalogued misconception tag) is emitted when it is picked; without one,
// a distractor whose `term` (or text) is the confusable partner of part.term / part.answer gets the
// confusable-group tag from term.js (confused-comp-supp, confused-ray-segment, …).
//
// Option order is deterministic (no random source anywhere): options(part, seed) permutes by a string hash,
// so the same card shows the same order on every render for a given seed, and a re-render with a
// different seed (a review) moves the answer. asn.js and termmatch.js import stableOrder() from here.

import { confusionTag } from './term.js';

/** cyrb53-style 53-bit string hash (same construction the spec names for js/rng.js). */
export function hash53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Deterministic Fisher–Yates order of `items` for `seed` (mulberry32 over hash53). */
export function stableOrder(items, seed) {
  let a = (hash53(seed ?? '') >>> 0) || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Text normalization for option comparison: NFKC, unicode minus → -, collapse spaces, lowercase. */
export function normOption(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .replace(/[−–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function asOption(o) {
  return typeof o === 'string' ? { text: o } : { ...o, text: String(o.text ?? '') };
}

/** The option list in authored order: [{text, ok, why?, term?, tag?}]. */
export function rawOptions(part) {
  const ans = normOption(part.answer);
  let list;
  if (Array.isArray(part.options) && part.options.length) {
    list = part.options.map(asOption);
    if (!list.some((o) => normOption(o.text) === ans) && part.answer != null) list.unshift({ text: String(part.answer) });
  } else {
    list = [{ text: String(part.answer ?? '') }, ...(part.distractors ?? []).map(asOption)];
  }
  return list.map((o) => ({ ...o, ok: normOption(o.text) === ans }));
}

/**
 * Options in display order for `seed` (default part.id). part.shuffle === false keeps authored order.
 * @returns {{text:string, ok:boolean, why?:string, term?:string, tag?:string}[]}
 */
export function options(part, seed) {
  const list = rawOptions(part);
  if (part.shuffle === false) return list;
  return stableOrder(list, `${seed ?? part.id ?? ''}|${part.answer ?? ''}`);
}

function result(kind, msg, extra = {}) {
  return { ok: kind === 'correct', kind, credit: kind === 'correct' ? 1 : 0, msg, tags: [], normalized: null, ...extra };
}

/** Resolve raw → the picked option object (or null). */
export function pick(part, raw, ctx = {}) {
  const opts = options(part, ctx.seed);
  if (raw == null) return null;
  if (typeof raw === 'object') {
    if (Number.isInteger(raw.index)) return opts[raw.index] ?? null;
    if (raw.text != null) raw = raw.text;
    else return null;
  }
  if (typeof raw === 'number') return Number.isInteger(raw) ? opts[raw] ?? null : null;
  const s = String(raw).trim();
  if (!s) return null;
  const n = normOption(s);
  const byText = opts.find((o) => normOption(o.text) === n);
  if (byText) return byText;
  // a bare digit typed as a shortcut: 1-based option number (keys 1–5)
  if (/^[1-9]$/.test(s) && opts[Number(s) - 1] && !opts.some((o) => /^[1-9]$/.test(o.text.trim()))) return opts[Number(s) - 1];
  return null;
}

/**
 * Grade a multiple-choice pick.
 * @param {object} part
 * @param {string|number|{text?:string,index?:number}} raw
 * @param {{seed?:string}} [ctx]
 */
export function grade(part, raw, ctx = {}) {
  const picked = pick(part, raw, ctx);
  const answer = String(part.answer ?? '');
  if (!picked) return result('malformed', 'Pick one of the options.', { answer, picked: null });
  const normalized = { picked: picked.text };
  if (picked.ok) {
    return result('correct', part.note ?? '', { normalized, answer, picked: picked.text });
  }
  const why = part.why?.[picked.text] ?? picked.why;
  let msg;
  if (why) msg = why;
  else if (picked.term) msg = `That's ${picked.term}${part.term ? `, not ${part.term}` : ''}.`;
  else if (part.term) msg = `“${picked.text}” doesn't describe ${part.term} — read the definition again.`;
  else msg = `“${picked.text}” — not this one.`;
  let tags = picked.tag ? [picked.tag] : [];
  if (!tags.length) {
    const mine = part.term ?? part.answer;
    const theirs = picked.term ?? picked.text;
    const t = confusionTag(mine, theirs);
    if (t) tags = [t];
  }
  return result('wrong', msg, { normalized, answer, picked: picked.text, tags });
}

export default grade;
