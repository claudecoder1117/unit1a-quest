// term.js — "type the term" grader (COMPOSED S3 "term"). DOM-free, pure.
//
// part: { type:'term', answers:[canonical, ...aliases] | answer:string, aliases?:[...],
//         confusables?:[{term, msg?}] }
// raw:  string typed by the student
// ctx:  { terms?:string[] }  — every canonical term in the bank (data/vocab.js); lets a wrong answer
//                              that IS another term get a specific line instead of a generic one.
//
// Rules (S3): lowercase, strip non-letters, alias list, Damerau–Levenshtein ≤ 1 for words of
// ≥ 6 letters → ok with the note "(spelling: linear pair)". Shorter words must be exact.
//
// grade(part, raw, ctx) → {ok, kind, credit, msg, tags, normalized, answer, matched, spelling, note, other}
//
// Confusable groups (S2): complement/supplement · ray/segment · adjacent/linear pair · collinear/coplanar.
// A wrong answer that is the partner term gets its catalogued tag:
// tags:['confused-comp-supp', 'confused-ray-segment', 'confused-adjacent-linear', 'confused-collinear-coplanar']

/** Normalize a term for comparison: NFKD, drop diacritics, lowercase, letters only. */
export function normalizeTerm(s) {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

/**
 * Damerau–Levenshtein (optimal string alignment) distance with early exit above `max`.
 * Returns max + 1 when the distance exceeds max.
 */
export function damerau(a, b, max = 2) {
  a = String(a);
  b = String(b);
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const la = a.length;
  const lb = b.length;
  if (!la) return lb;
  if (!lb) return la;
  let prev2 = null;
  let prev = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    const cur = new Array(lb + 1);
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[lb] > max ? max + 1 : prev[lb];
}

/** Confusable groups: normalized term → group id; a group maps to its misconception tag. */
const GROUP_OF = {
  complement: 'comp-supp', complementary: 'comp-supp', complementaryangles: 'comp-supp',
  supplement: 'comp-supp', supplementary: 'comp-supp', supplementaryangles: 'comp-supp',
  ray: 'ray-seg', rays: 'ray-seg', segment: 'ray-seg', segments: 'ray-seg', linesegment: 'ray-seg',
  adjacent: 'adj-lin', adjacentangles: 'adj-lin', linearpair: 'adj-lin', linearpairs: 'adj-lin',
  collinear: 'col-cop', coplanar: 'col-cop',
};
const GROUP_TAG = { 'comp-supp': 'confused-comp-supp', 'ray-seg': 'confused-ray-segment', 'adj-lin': 'confused-adjacent-linear', 'col-cop': 'confused-collinear-coplanar' };
export const CONFUSABLE_GROUPS = Object.freeze({
  'comp-supp': ['complement', 'supplement', 'complementary', 'supplementary'],
  'ray-seg': ['ray', 'segment'],
  'adj-lin': ['adjacent', 'linear pair'],
  'col-cop': ['collinear', 'coplanar'],
});

/**
 * Misconception tag when `got` is the confusable partner of `expected` (both terms, any spelling), else null.
 * "complementary" typed for "supplementary" → 'confused-comp-supp'; the same word twice → null.
 */
export function confusionTag(expected, got) {
  const a = normalizeTerm(expected);
  const b = normalizeTerm(got);
  if (!a || !b || a === b) return null;
  const ga = GROUP_OF[a];
  const gb = GROUP_OF[b];
  if (!ga || ga !== gb) return null;
  // same group but not merely a plural/adjective form of the same word (complement vs complementary is the SAME side)
  const stem = (t) => t.replace(/^linesegment$/, 'segment').replace(/(aryangles|angles|ary|s)$/, '');
  if (stem(a) === stem(b)) return null;
  return GROUP_TAG[ga];
}

/** The accepted spellings of a part in display form: answers[] | [answer, ...aliases]. */
export function answersOf(part) {
  const list = [];
  if (Array.isArray(part.answers)) list.push(...part.answers);
  if (part.answer != null) list.push(part.answer);
  if (Array.isArray(part.aliases)) list.push(...part.aliases);
  return list.map((s) => String(s)).filter((s) => s.trim().length);
}

/**
 * Match a typed string against a list of accepted spellings.
 * @returns {{ok:boolean, exact:boolean, spelling:boolean, matched:string|null, distance:number|null}}
 */
export function matchTerm(raw, answers) {
  const typed = normalizeTerm(raw);
  if (!typed) return { ok: false, exact: false, spelling: false, matched: null, distance: null };
  const list = (answers ?? []).map((s) => String(s));
  for (const a of list) if (normalizeTerm(a) === typed) return { ok: true, exact: true, spelling: false, matched: a, distance: 0 };
  let best = null;
  for (const a of list) {
    const na = normalizeTerm(a);
    if (na.length < 6) continue; // short words: exact only (ray, line, plane, point, angle, acute, side)
    const d = damerau(typed, na, 1);
    if (d <= 1 && (!best || d < best.distance)) best = { ok: true, exact: false, spelling: true, matched: a, distance: d };
  }
  return best ?? { ok: false, exact: false, spelling: false, matched: null, distance: null };
}

function result(kind, msg, extra = {}) {
  return { ok: kind === 'correct', kind, credit: kind === 'correct' ? 1 : 0, msg, tags: [], normalized: null, ...extra };
}

/**
 * Grade a typed term.
 * @param {object} part
 * @param {string} raw
 * @param {{terms?:string[]}} [ctx]
 */
export function grade(part, raw, ctx = {}) {
  const answers = answersOf(part);
  const canonical = answers[0] ?? '';
  const typed = String(raw ?? '').trim();
  if (!normalizeTerm(typed)) return result('malformed', 'Type the term.', { answer: canonical, matched: null, spelling: false, note: null });
  const normalized = normalizeTerm(typed);
  const m = matchTerm(typed, answers);
  if (m.ok) {
    const note = m.spelling ? `(spelling: ${canonical})` : null;
    return result('correct', note ?? '', { normalized, answer: canonical, matched: m.matched, spelling: m.spelling, note });
  }
  // Wrong. Is it another term we know? (part.confusables first, then the bank, then the built-in confusable groups)
  const tagFor = (other) => { const t = confusionTag(canonical, other); return t ? [t] : []; };
  const confusables = (part.confusables ?? []).map((c) => (typeof c === 'string' ? { term: c } : c));
  for (const c of confusables) {
    if (matchTerm(typed, [c.term]).ok) {
      return result('wrong', c.msg ?? `That's ${c.term} — a different term. Read the definition again.`, {
        normalized, answer: canonical, matched: null, spelling: false, note: null, other: c.term, tags: c.tag ? [c.tag] : tagFor(c.term),
      });
    }
  }
  const bank = (ctx.terms ?? []).filter((t) => !answers.some((a) => normalizeTerm(a) === normalizeTerm(t)));
  for (const t of bank) {
    if (matchTerm(typed, [t]).ok) {
      return result('wrong', `That's ${t} — a different term. Read the definition again.`, {
        normalized, answer: canonical, matched: null, spelling: false, note: null, other: t, tags: tagFor(t),
      });
    }
  }
  const builtin = Object.values(CONFUSABLE_GROUPS).flat().find((t) => matchTerm(typed, [t]).ok && confusionTag(canonical, t));
  if (builtin) {
    return result('wrong', `That's ${builtin} — a different term. Read the definition again.`, {
      normalized, answer: canonical, matched: null, spelling: false, note: null, other: builtin, tags: tagFor(builtin),
    });
  }
  const msg = bank.length ? `“${typed}” isn't a term on this unit's list — check the spelling and the definition.` : `Not “${typed}” — read the definition again.`;
  return result('wrong', msg, { normalized, answer: canonical, matched: null, spelling: false, note: null, other: null });
}

export default grade;
