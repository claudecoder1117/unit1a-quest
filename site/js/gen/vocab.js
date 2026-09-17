// vocab.js — T-vocab (T07c; M1, skill VOC, sheet VOC).
// COMPOSED S2: "`T-notation` / `T-vocab`: random 4–6 point figures, relabelled, 'ray AB ≠ ray BA'
// traps; **confusable-group distractors**."  S2 §0 row: `term` (definition → type the term, Damerau
// ≤ 1), `mc` (term → definition, 3 confusable distractors from the groups), `termmatch` (6↔6).
//
// The 23 terms, their aliases, their confusable lists and the four 6↔6 match sets all come from
// `data/vocab.js` (T06a) — this generator never re-types a definition. Four modes:
//   'mc-def'   term → which definition?      distractors = the term's confusable group
//   'mc-term'  definition → which term?      distractors = the term's confusable group
//   'type'     definition → type the term    (`term` grader: aliases + Damerau ≤ 1 for ≥ 6 letters)
//   'match'    the term's 6↔6 termmatch set
// Every mc option carries its `term`, so `mc.js` names the confusable it was and tags the miss
// from its own confusable groups — the generator never invents a tag.
//
// DOM-free, no Math.random.

import { seedTag } from '../rng.js';
import { confusionTag } from '../grader/term.js';
import { vocab, vocabByKey, termmatchSets, confusables } from '../../data/vocab.js';

const MODE_WEIGHTS = Object.freeze([['mc-def', 4], ['mc-term', 3], ['type', 4], ['match', 2]]);

/** Terms with at least two confusables — every term in data/vocab.js qualifies, but check anyway. */
const POOL = Object.freeze(vocab.filter((v) => (v.confusable ?? []).length >= 2));

function entryOf(key) {
  return vocabByKey[key] ?? null;
}

/** The 6↔6 set a term belongs to (first match), as data/vocab.js defines it. */
function setFor(key) {
  return termmatchSets.find((s) => s.keys.includes(key)) ?? termmatchSets[0];
}

function pickDistractors(rng, v, n = 3) {
  const keys = confusables(v.key).filter((k) => k !== v.key && entryOf(k));
  const extra = POOL.filter((o) => o.key !== v.key && !keys.includes(o.key) && o.group === v.group).map((o) => o.key);
  const ordered = keys.concat(rng.shuffle(extra));
  const out = [];
  for (const k of ordered) {
    if (out.length >= n) break;
    if (!out.includes(k)) out.push(k);
  }
  // last resort: any other term, so an item always has its three distractors (S8 #7a acceptance)
  if (out.length < n) {
    for (const o of rng.shuffle(POOL.map((p) => p.key))) {
      if (out.length >= n) break;
      if (o !== v.key && !out.includes(o)) out.push(o);
    }
  }
  return out.map(entryOf).filter(Boolean);
}

/**
 * Confusable-group misconception entries, tagged from js/grader/term.js's own groups
 * (so every tag emitted here is one the catalogue already knows). Untagged pairs are skipped.
 */
function tagged(v, others, textOf, partId = 'mc') {
  const out = [];
  for (const o of others) {
    const t = confusionTag(v.term, o.term);
    if (!t) continue;
    out.push({ part: partId, answer: textOf(o), tag: t, msg: `That is “${o.term}”: ${o.def}. “${v.term}” means: ${v.def}.` });
  }
  return out;
}

export function build(rng, opts = {}) {
  const modes = MODE_WEIGHTS.map((m) => m[0]);
  const weights = MODE_WEIGHTS.map((m) => m[1]);
  const mode = opts.mode ?? rng.weighted(modes, weights);
  const v = opts.key ? entryOf(opts.key) : rng.pick(POOL);
  const others = pickDistractors(rng, v);

  let part;
  let stem;
  let answer;
  const misconceptions = [];

  if (mode === 'mc-def') {
    stem = `Vocabulary — which is the definition of “${v.term}”?`;
    answer = v.def;
    part = {
      id: 'mc', type: 'mc',
      prompt: `Which is the definition of “${v.term}”?`,
      answer: v.def,
      term: v.term,
      distractors: others.map((o) => ({
        text: o.def,
        why: `That is the definition of “${o.term}”, not “${v.term}”.`,
        term: o.term,
      })),
    };
    misconceptions.push(...tagged(v, others, (o) => o.def));
  } else if (mode === 'mc-term') {
    stem = `Vocabulary — which term means: “${v.def}”?`;
    answer = v.term;
    part = {
      id: 'mc', type: 'mc',
      prompt: `Which term means: “${v.def}”?`,
      answer: v.term,
      term: v.term,
      distractors: others.map((o) => ({
        text: o.term,
        why: `“${o.term}” means: ${o.def}. Read the definition again — which word fits it exactly?`,
        term: o.term,
      })),
    };
    misconceptions.push(...tagged(v, others, (o) => o.term));
  } else if (mode === 'type') {
    stem = `Which term means: “${v.def}”? Type the term.`;
    answer = v.term;
    part = {
      id: 'term', type: 'term',
      prompt: `Which term means: “${v.def}”? Type the term.`,
      answers: Array.from(new Set([v.term, ...(v.aliases ?? [])])),
      confusables: others.map((o) => ({
        term: o.term,
        msg: `“${o.term}” means: ${o.def}. Read the definition again — which word fits it exactly?`,
      })),
    };
    misconceptions.push(...tagged(v, others, (o) => o.term, 'term'));
  } else {
    const set = setFor(v.key);
    const pairs = set.keys.map(entryOf).filter(Boolean).map((e) => ({ term: e.term, def: e.def }));
    stem = `Match each term to its definition (${set.name}).`;
    answer = pairs.map((p) => `${p.term} → ${p.def}`).join('; ');
    part = {
      id: 'match', type: 'termmatch',
      prompt: `Match each term to its definition (${set.name}).`,
      set: set.id,
      pairs,
    };
  }

  const hints = mode === 'match'
    ? [
      'Start with the two you are sure of — every match you lock removes a wrong option from the others.',
      'Watch the pairs that live next to each other: complementary (90°) vs supplementary (180°), ray vs segment, adjacent vs linear pair, collinear vs coplanar.',
      'Read each definition to the END. Two definitions often start the same way and differ in the last few words.',
    ]
    : [
      v.hints?.[0] ?? `It is one of the §0 terms in the ${v.group} group.`,
      v.hints?.[1] ?? `Compare it with: ${others.map((o) => o.term).join(', ')}.`,
      v.hints?.[2] ?? `Definition: ${v.def}`,
    ];

  const solution = mode === 'match'
    ? [{ say: 'The six matches', math: '' },
      ...setFor(v.key).keys.map(entryOf).filter(Boolean).map((e) => ({ say: e.term, math: e.def }))]
    : [
      { say: `${v.term}`, math: v.def },
      v.note ? { say: 'Watch out', math: v.note } : { say: 'Where it turns up', math: v.example ?? '' },
      { say: 'Do not confuse it with', math: others.map((o) => `${o.term} (${o.def})`).join(' · ') },
    ];

  return {
    id: `T-vocab#${seedTag(rng.seed)}`,
    template: 'T-vocab',
    params: { mode, key: v.key, group: v.group, distractors: others.map((o) => o.key) },
    prompt: stem,
    stem,
    figure: null,
    skills: ['VOC'],
    tier: 1,
    par: mode === 'match' ? 90 : 25,
    parts: [part],
    answer,
    hints,
    solution,
    misconceptions,
  };
}

export const templates = Object.freeze([
  Object.freeze({
    id: 'T-vocab', version: 1, label: 'Vocabulary (§0 terms)', module: 'M1', sheet: 'VOC',
    skills: ['VOC'], tier: 1, par: 25, partTypes: ['mc', 'term', 'termmatch'],
    modes: MODE_WEIGHTS.map((m) => m[0]),
    gen: (rng, opts = {}) => build(rng, opts),
  }),
]);

export default templates;
