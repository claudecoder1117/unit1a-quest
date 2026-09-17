// termmatch.js — 6 ↔ 6 term/definition matching grader (COMPOSED S2 §0 "termmatch (6↔6)"). DOM-free, pure.
//
// part: { type:'termmatch', pairs:[{term, def}, …] }
// raw:  { [termText]: defText }            (the widget's assignment)
//       | [[term, def], …]                 texts, or indices: term index into part.pairs, def index into
//                                          layout(part, ctx.seed).defs
// ctx:  { seed?:string }  (the seed the widget used for layout(); default part.id)
//
// Each term grades independently; ok iff every term is matched to its own definition; credit = matched/total.
// Unassigned terms are not attempts (kind 'malformed', free) unless another term is wrong.
//
// layout(part, seed) → {terms:[{i, text}], defs:[{i, text}]} — defs in a deterministic shuffled order.
// grade(part, raw, ctx) → {ok, kind, credit, msg, tags, normalized:{term: def}, fields:[{term, def, ok, kind, picked}]}

import { stableOrder, normOption } from './mc.js';

function pairsOf(part) {
  if (Array.isArray(part.pairs)) return part.pairs.map((p) => ({ term: String(p.term), def: String(p.def ?? p.definition ?? '') }));
  if (Array.isArray(part.terms) && Array.isArray(part.defs)) return part.terms.map((t, i) => ({ term: String(t), def: String(part.defs[i] ?? '') }));
  return [];
}

/** Terms in authored order, definitions deterministically shuffled for `seed` (default part.id). */
export function layout(part, seed) {
  const pairs = pairsOf(part);
  const terms = pairs.map((p, i) => ({ i, text: p.term }));
  let defs = pairs.map((p, i) => ({ i, text: p.def }));
  if (part.shuffle !== false) {
    defs = stableOrder(defs, `${seed ?? part.id ?? ''}|termmatch|${pairs.length}`);
    // never leave every definition in authored order (a fixed-point shuffle would hand out the answer)
    if (defs.length > 1 && defs.every((d, k) => d.i === k)) defs = [...defs.slice(1), defs[0]];
  }
  return { terms, defs };
}

function result(kind, msg, extra) {
  return { ok: kind === 'correct', kind, credit: 0, msg, tags: [], normalized: null, ...extra };
}

/** Normalize raw into {termText: defText}. */
export function assignments(part, raw, ctx = {}) {
  const pairs = pairsOf(part);
  const lay = layout(part, ctx.seed);
  const out = {};
  const put = (t, d) => {
    let term = t;
    let def = d;
    if (typeof t === 'number' && Number.isInteger(t)) term = pairs[t]?.term;
    if (typeof d === 'number' && Number.isInteger(d)) def = lay.defs[d]?.text;
    if (term == null || def == null) return;
    const key = pairs.find((p) => normOption(p.term) === normOption(term))?.term;
    if (key != null && String(def).trim()) out[key] = String(def);
  };
  if (Array.isArray(raw)) {
    for (const pr of raw) if (Array.isArray(pr) && pr.length >= 2) put(pr[0], pr[1]);
  } else if (raw && typeof raw === 'object') {
    for (const [t, d] of Object.entries(raw)) put(t, d);
  }
  return out;
}

/**
 * Grade a matching.
 * @param {object} part
 * @param {object|Array} raw
 * @param {{seed?:string}} [ctx]
 */
export function grade(part, raw, ctx = {}) {
  const pairs = pairsOf(part);
  if (!pairs.length) return result('malformed', 'This item has no pairs.', { fields: [] });
  const got = assignments(part, raw, ctx);
  const fields = pairs.map((p) => {
    const picked = got[p.term];
    if (picked == null) return { term: p.term, def: p.def, picked: null, ok: false, kind: 'blank' };
    const ok = normOption(picked) === normOption(p.def);
    return { term: p.term, def: p.def, picked, ok, kind: ok ? 'correct' : 'wrong' };
  });
  const okCount = fields.filter((f) => f.ok).length;
  const credit = okCount / pairs.length;
  const normalized = Object.fromEntries(fields.map((f) => [f.term, f.picked]));
  const wrong = fields.filter((f) => f.kind === 'wrong');
  if (wrong.length) {
    const names = wrong.map((f) => f.term);
    const msg = wrong.length === 1 ? `${names[0]} — not that definition.` : `${wrong.length} mismatched: ${names.join(', ')}.`;
    return result('wrong', msg, { credit, normalized, fields });
  }
  const blank = fields.filter((f) => f.kind === 'blank');
  if (blank.length) {
    return result('malformed', okCount ? `${blank.length} term${blank.length > 1 ? 's' : ''} left: ${blank.map((f) => f.term).join(', ')}.` : 'Match every term to a definition.', { credit, normalized, fields });
  }
  return result('correct', '', { credit: 1, normalized, fields });
}

export default grade;
