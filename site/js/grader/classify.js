// classify.js — acute / right / obtuse / straight grader (COMPOSED S2 cls-01..04, T-classify). DOM-free, pure.
//
// part: { type:'classify', answer?:'acute'|'right'|'obtuse'|'straight', measure?:number }
//       (answer is derived from measure when omitted; when both are given they must agree — validate())
// raw:  bucket name | first letter (a/r/o/s) | 0-based index into BUCKETS | {text} | {index}
// ctx:  unused
//
// A wrong pick gets the RULE of the bucket it picked, against the measure — never the answer.
// Tags: a miss at exactly 90 / 180 is 'boundary-90' / 'boundary-180', any other miss 'misclassified'.
// tags:['boundary-90', 'boundary-180', 'misclassified']
// grade(part, raw, ctx) → {ok, kind, credit, msg, tags, normalized:{bucket}, answer, picked, measure}

export const BUCKETS = ['acute', 'right', 'obtuse', 'straight'];

export const RULES = {
  acute: 'less than 90°',
  right: 'exactly 90°',
  obtuse: 'more than 90° and less than 180°',
  straight: 'exactly 180°',
};

/** Bucket of a measure in degrees, or null outside (0, 180]. */
export function classifyMeasure(m) {
  const v = Number(m);
  if (!Number.isFinite(v) || v <= 0 || v > 180) return null;
  if (v < 90) return 'acute';
  if (v === 90) return 'right';
  if (v < 180) return 'obtuse';
  return 'straight';
}

/** Parse raw → bucket or null. */
export function parseBucket(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') {
    if (Number.isInteger(raw.index)) return BUCKETS[raw.index] ?? null;
    raw = raw.text;
  }
  if (typeof raw === 'number') return Number.isInteger(raw) ? BUCKETS[raw] ?? null : null;
  const s = String(raw).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!s) return null;
  if (BUCKETS.includes(s)) return s;
  const letter = { a: 'acute', r: 'right', o: 'obtuse', s: 'straight' }[s];
  if (letter) return letter;
  if (/^[1-4]$/.test(s)) return BUCKETS[Number(s) - 1];
  return null;
}

/** Data check: returns [] when the part is consistent. */
export function validate(part) {
  const errs = [];
  const fromM = part.measure != null ? classifyMeasure(part.measure) : null;
  if (part.measure != null && !fromM) errs.push(`measure ${part.measure} is outside (0, 180]`);
  if (part.answer != null && !BUCKETS.includes(String(part.answer).toLowerCase())) errs.push(`unknown answer ${part.answer}`);
  if (part.answer != null && fromM && String(part.answer).toLowerCase() !== fromM) errs.push(`FLAG: answer ${part.answer} but measure ${part.measure} is ${fromM}`);
  if (part.answer == null && part.measure == null) errs.push('classify part needs answer or measure');
  return errs;
}

function fmtDeg(m) {
  return `${Number.isInteger(m) ? m : String(m)}°`;
}

function whyNot(picked, m) {
  if (m == null) return `${cap(picked)} means ${RULES[picked]} — check the measure again.`;
  const d = fmtDeg(m);
  switch (picked) {
    case 'acute':
      return `Acute means ${RULES.acute} — ${d} is ${m === 90 ? 'exactly' : 'more than'} 90°.`;
    case 'right':
      return `Right means ${RULES.right} — ${d} isn't.`;
    case 'obtuse':
      if (m === 180) return `Obtuse means ${RULES.obtuse} — ${d} is the whole straight line.`;
      return `Obtuse means ${RULES.obtuse} — ${d} is ${m === 90 ? 'exactly 90°' : 'less than 90°'}.`;
    case 'straight':
      return `Straight means ${RULES.straight} — ${d} isn't.`;
    default:
      return '';
  }
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function result(kind, msg, extra) {
  return { ok: kind === 'correct', kind, credit: kind === 'correct' ? 1 : 0, msg, tags: [], normalized: null, ...extra };
}

/**
 * Grade a classification.
 * @param {object} part
 * @param {string|number|{text?:string,index?:number}} raw
 * @param {object} [ctx]
 */
export function grade(part, raw, ctx = {}) { // eslint-disable-line no-unused-vars
  const measure = part.measure != null ? Number(part.measure) : null;
  const answer = part.answer != null ? String(part.answer).toLowerCase() : classifyMeasure(measure);
  const picked = parseBucket(raw);
  const base = { answer, picked, measure };
  if (!answer) return result('malformed', 'This item has no answer to compare against.', base);
  if (!picked) return result('malformed', 'Pick acute, right, obtuse or straight.', base);
  const normalized = { bucket: picked };
  if (picked === answer) return result('correct', measure != null ? `${fmtDeg(measure)} — ${RULES[answer]}.` : '', { ...base, normalized });
  const tag = measure === 90 ? 'boundary-90' : measure === 180 ? 'boundary-180' : 'misclassified';
  return result('wrong', whyNot(picked, measure), { ...base, normalized, tags: [tag] });
}

export default grade;
