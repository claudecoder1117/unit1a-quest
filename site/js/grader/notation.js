// notation.js — notation builder grader (COMPOSED S3 "notation", S2 not-01..09). DOM-free, pure.
//
// Canonical object: { kind, pts }           kind ∈ line | seg | len | ray | ang | m | plane
//                   { kind, sides:[o, o] }   kind ∈ cong | eq   (a relation between two objects)
//
// part: { type:'notation', kind, pts?:[...letters], sides?:[obj,obj] }
// raw:  a canonical object from the builder (decoration + letters tapped from the figure), or a string:
//       "{ray FB}", "ray FB", "ray F B", "segment AB", "line AB", "AB" (bare = length), "length AB",
//       "∠ABC", "angle ABC", "m∠ABC", "m angle ABC", "plane ABC", "plane P",
//       "∠ABC ≅ ∠DEF", "m∠ABC = m∠DEF", "AB = CD", "{seg AB} ≅ {seg CD}".
// ctx:  unused (kept for the dispatcher signature)
//
// Compare rules (S3): line / segment / length unordered; ray ORDERED (endpoint first); angle: middle
// letter fixed, outer two unordered; plane unordered; ≅ / = : unordered pair of sides, each by its rule.
// A wrong build gets the RULE shown (never a bare "wrong"): `ray BA` for `ray AB` → wrong, tag ray-order,
// "endpoint first". Kind mismatches name the two notations that were confused.
//
// grade(part, raw, ctx) → {ok, kind, credit, msg, tags, normalized:<canonical>, answer:<canonical>,
//                          markup:<mini-markup of the student's build>, rule:<string|null>}
//
// Misconception tags emitted (catalogued in data/misconceptions.js):
// tags:['ray-order', 'vertex-not-middle', 'bar-on-length', 'line-vs-segment', 'segment-vs-ray',
//       'm-vs-angle', 'congruent-vs-equal', 'plane-naming', 'wrong-decoration']

const KIND_ALIAS = {
  line: 'line', '↔': 'line', '<->': 'line', doublearrow: 'line', arrowline: 'line',
  seg: 'seg', segment: 'seg', bar: 'seg', overline: 'seg', '¯': 'seg', '‾': 'seg', '—': 'seg',
  len: 'len', length: 'len', none: 'len', plain: 'len', distance: 'len', number: 'len',
  ray: 'ray', '→': 'ray', '->': 'ray', arrow: 'ray',
  ang: 'ang', angle: 'ang', '∠': 'ang', '<': 'ang',
  m: 'm', 'm∠': 'm', measure: 'm', mangle: 'm', 'm<': 'm',
  cong: 'cong', '≅': 'cong', congruent: 'cong', '=~': 'cong', '~=': 'cong',
  eq: 'eq', '=': 'eq', equal: 'eq', equals: 'eq',
  plane: 'plane',
};

/** Human names used in rule messages. */
export const NAMES = {
  line: 'line', seg: 'segment', len: 'length', ray: 'ray', ang: 'angle', m: 'angle measure',
  cong: 'congruence (≅)', eq: 'equality (=)', plane: 'plane',
};

/** One-line rules (also feed the cheat sheet). */
export const RULES = {
  line: 'A line extends forever both ways: a double arrow ↔ over the two letters, in either order.',
  seg: 'A segment has two endpoints: a plain bar over the two letters, in either order.',
  len: 'The LENGTH of a segment is a number: the two letters with no bar.',
  ray: 'A ray is named endpoint first: the endpoint letter, then a point it passes through, with an arrow over both. Ray AB ≠ ray BA.',
  ang: 'An angle is ∠ABC with the vertex as the MIDDLE letter; the outer letters can swap.',
  m: 'm∠ABC is the measure of the angle — a number of degrees — so it takes the m.',
  cong: '≅ (congruent) goes between two figures — angles or segments — not between numbers.',
  eq: '= goes between two numbers: measures (m∠ABC = m∠DEF) or lengths (AB = CD).',
  plane: 'A plane is named by a single capital (script) letter or by three non-collinear points.',
};

const ARITY = { line: 2, seg: 2, len: 2, ray: 2, ang: 3, m: 3 };

/** Normalize a kind word/glyph → canonical kind id, or null. */
export function normalizeKind(k) {
  if (k == null) return null;
  const s = String(k).trim().toLowerCase().replace(/\s+/g, '');
  return KIND_ALIAS[s] ?? null;
}

function normPts(pts) {
  if (pts == null) return [];
  const arr = Array.isArray(pts) ? pts.map((p) => String(p)) : [String(pts)];
  return arr.join('').replace(/\s+/g, '').toUpperCase().split('').filter((c) => /[A-Z0-9]/.test(c));
}

/** Canonicalize an object (kind aliases, letter arrays). Returns null when it is not a notation object. */
export function canon(obj) {
  if (obj == null) return null;
  if (typeof obj === 'string') return parse(obj);
  const kind = normalizeKind(obj.kind ?? obj.decoration ?? obj.deco);
  if (!kind) return null;
  if (kind === 'cong' || kind === 'eq') {
    const sides = (obj.sides ?? []).map(canon);
    if (sides.length !== 2 || sides.some((s) => !s || s.kind === 'cong' || s.kind === 'eq')) return null;
    return { kind, sides };
  }
  const pts = normPts(obj.pts ?? obj.letters ?? obj.points);
  if (!pts.length) return null;
  return { kind, pts };
}

const SIDE_RE = /^(?:\{\s*([a-z]+)\s+([^{}]*?)\s*\}|(m\s*∠|m\s*<|m\s*angle|<->|->|↔|→|∠|<|angle|ray|line|segment|seg|length|len|plane)\s*([A-Za-z0-9 ]+?)|([A-Za-z0-9]{1,3}))\s*$/i;

function parseSide(s) {
  const t = String(s).trim();
  const m = SIDE_RE.exec(t);
  if (!m) return null;
  let kind;
  let body;
  if (m[1] !== undefined) {
    kind = normalizeKind(m[1]);
    body = m[2];
  } else if (m[3] !== undefined) {
    const w = m[3].toLowerCase().replace(/\s+/g, '');
    kind = w === 'm∠' || w === 'm<' || w === 'mangle' ? 'm' : normalizeKind(w);
    body = m[4];
  } else {
    kind = 'len';
    body = m[5];
  }
  if (!kind) return null;
  const pts = normPts(body);
  if (!pts.length) return null;
  return { kind, pts };
}

/**
 * Parse a typed/serialized notation string into a canonical object (null when unparseable).
 */
export function parse(str) {
  const s = String(str ?? '').normalize('NFKC').trim();
  if (!s) return null;
  const rel = s.split(/(≅|=~|~=|=)/);
  if (rel.length === 3) {
    const kind = normalizeKind(rel[1]);
    const a = parseSide(rel[0]);
    const b = parseSide(rel[2]);
    if (!kind || !a || !b) return null;
    return { kind, sides: [a, b] };
  }
  if (rel.length !== 1) return null;
  return parseSide(s);
}

/** Mini-markup for mathfmt.js: {ray FB}, {ang ABC} ≅ {ang DEF}, m∠ABC = m∠DEF … */
export function toMarkup(obj) {
  const c = canon(obj);
  if (!c) return '';
  if (c.kind === 'cong' || c.kind === 'eq') return `${toMarkup(c.sides[0])} ${c.kind === 'cong' ? '≅' : '='} ${toMarkup(c.sides[1])}`;
  return `{${c.kind} ${c.pts.join('')}}`;
}

/** Plain description: "ray FB", "∠ABC", "m∠ABC", "AB" (length), "plane ABC". */
export function describe(obj) {
  const c = canon(obj);
  if (!c) return '';
  if (c.kind === 'cong' || c.kind === 'eq') return `${describe(c.sides[0])} ${c.kind === 'cong' ? '≅' : '='} ${describe(c.sides[1])}`;
  const p = c.pts.join('');
  switch (c.kind) {
    case 'line': return `line ${p}`;
    case 'seg': return `segment ${p}`;
    case 'ray': return `ray ${p}`;
    case 'ang': return `∠${p}`;
    case 'm': return `m∠${p}`;
    case 'plane': return `plane ${p}`;
    default: return p;
  }
}

function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const sa = a.slice().sort().join('');
  const sb = b.slice().sort().join('');
  return sa === sb;
}

/** Structural equality under the S3 rules. Both arguments canonical (or canonicalizable). */
export function same(a, b) {
  a = canon(a);
  b = canon(b);
  if (!a || !b || a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'cong':
    case 'eq':
      return (same(a.sides[0], b.sides[0]) && same(a.sides[1], b.sides[1])) || (same(a.sides[0], b.sides[1]) && same(a.sides[1], b.sides[0]));
    case 'ray':
      return a.pts.length === 2 && b.pts.length === 2 && a.pts[0] === b.pts[0] && a.pts[1] === b.pts[1];
    case 'ang':
    case 'm':
      return a.pts.length === 3 && b.pts.length === 3 && a.pts[1] === b.pts[1] && sameSet([a.pts[0], a.pts[2]], [b.pts[0], b.pts[2]]);
    default:
      return sameSet(a.pts, b.pts);
  }
}

function result(kind, msg, extra) {
  return { ok: kind === 'correct', kind, credit: kind === 'correct' ? 1 : 0, msg, tags: [], normalized: null, ...extra };
}

// kind-confusion tags: expected → given (anything else → wrong-decoration)
const CONFUSION_TAG = {
  'len>seg': 'bar-on-length', 'len>line': 'bar-on-length', 'len>ray': 'bar-on-length',
  'line>seg': 'line-vs-segment', 'seg>line': 'line-vs-segment',
  'seg>ray': 'segment-vs-ray', 'ray>seg': 'segment-vs-ray',
  'ang>m': 'm-vs-angle', 'm>ang': 'm-vs-angle',
  'cong>eq': 'congruent-vs-equal', 'eq>cong': 'congruent-vs-equal',
};
function confusionTag(expected, given) {
  if (expected === 'plane' || given === 'plane') return 'plane-naming';
  return CONFUSION_TAG[`${expected}>${given}`] ?? 'wrong-decoration';
}

// kind-confusion lines: expected → given
function confusionMsg(expected, given) {
  const key = `${expected}>${given}`;
  const table = {
    'line>seg': 'That bar means a segment (two endpoints). A line extends forever both ways — it takes the double arrow ↔.',
    'seg>line': 'The double arrow ↔ means a line, which goes on forever. A segment has two endpoints — a plain bar.',
    'line>ray': 'A single arrow → is a ray (one endpoint). A line has no endpoints — double arrow ↔.',
    'ray>line': 'The double arrow ↔ is a line. A ray starts at an endpoint and goes one way — single arrow →.',
    'seg>ray': 'A single arrow → is a ray. A segment stops at both ends — a plain bar.',
    'ray>seg': 'A plain bar is a segment. A ray goes on forever from its endpoint — single arrow →, endpoint first.',
    'len>seg': 'AB with a bar is the segment itself. The LENGTH of AB is a number — write AB with no bar.',
    'seg>len': 'AB with no bar is a number (the length). The segment itself takes a plain bar.',
    'len>line': 'AB with the double arrow is the line. A length is a number — AB with no bar.',
    'line>len': 'AB with no bar is a length (a number). A line takes the double arrow ↔.',
    'len>ray': 'That arrow names a ray. A length is a number — AB with no bar.',
    'ray>len': 'AB with no decoration is a length. A ray takes a single arrow →, endpoint first.',
    'ang>m': 'm∠ABC is the MEASURE (a number of degrees). The angle itself is ∠ABC — no m.',
    'm>ang': '∠ABC names the angle. Its measure is a number, so it takes the m: m∠ABC.',
    'cong>eq': '= is for numbers. Two angles (or segments) are congruent: ≅.',
    'eq>cong': '≅ is for figures. Two measures or lengths are numbers — they are equal: =.',
  };
  return table[key] ?? `${RULES[expected]}`;
}

/**
 * Grade a built or typed notation.
 * @param {object} part   {kind, pts} | {kind, sides}
 * @param {object|string} raw
 * @param {object} [ctx]
 */
export function grade(part, raw, ctx = {}) { // eslint-disable-line no-unused-vars
  const answer = canon(part.answer ?? part);
  const got = canon(raw);
  const base = { answer, normalized: got, markup: got ? toMarkup(got) : '', rule: null };
  if (!answer) return result('malformed', 'This item has no answer to compare against.', base);
  if (!got) return result('malformed', 'Pick a decoration and tap the letters (endpoint first for a ray).', base);
  if (same(answer, got)) return result('correct', '', base);

  // ---- diagnostics ----
  if (answer.kind !== got.kind) {
    const isSide = (k) => k === 'cong' || k === 'eq';
    if (isSide(answer.kind) !== isSide(got.kind)) {
      return result('wrong', answer.kind === 'cong' || answer.kind === 'eq' ? 'This one relates two objects — pick ≅ or = between them.' : 'This one names a single object — no ≅ or = needed.', { ...base, rule: RULES[answer.kind], tags: ['wrong-decoration'] });
    }
    return result('wrong', confusionMsg(answer.kind, got.kind), { ...base, rule: RULES[answer.kind], tags: [confusionTag(answer.kind, got.kind)] });
  }
  if (answer.kind === 'ray') {
    if (got.pts.length === 2 && sameSet(answer.pts, got.pts)) {
      return result('wrong', `Endpoint first. The endpoint is ${answer.pts[0]}, so it's ray ${answer.pts.join('')} — ${answer.pts[0]} then ${answer.pts[1]}. Ray ${got.pts.join('')} would start at ${got.pts[0]}.`, { ...base, rule: RULES.ray, tags: ['ray-order'] });
    }
    if (got.pts.length !== 2) return result('wrong', 'A ray is named by exactly two letters: the endpoint, then a point on the ray.', { ...base, rule: RULES.ray });
    return result('wrong', 'Those letters name a different ray — the endpoint comes first, then a point the ray passes through.', { ...base, rule: RULES.ray });
  }
  if (answer.kind === 'ang' || answer.kind === 'm') {
    if (got.pts.length !== 3) return result('wrong', 'Three letters, vertex in the middle.', { ...base, rule: RULES[answer.kind] });
    if (sameSet(answer.pts, got.pts) && got.pts[1] !== answer.pts[1]) {
      return result('wrong', `The vertex goes in the middle — the vertex here is ${answer.pts[1]}, so it must be the middle letter.`, { ...base, rule: RULES.ang, tags: ['vertex-not-middle'] });
    }
    return result('wrong', `Those letters name a different angle — check which point is the vertex and which points lie on the two sides.`, { ...base, rule: RULES[answer.kind] });
  }
  if (answer.kind === 'cong' || answer.kind === 'eq') {
    // right relation symbol; find the side that disagrees and reuse its diagnostic
    const order = same(answer.sides[0], got.sides[0]) || same(answer.sides[0], got.sides[1]) ? answer.sides : [answer.sides[1], answer.sides[0]];
    for (let i = 0; i < 2; i++) {
      const g = got.sides[i];
      const a = same(order[0], g) ? null : (same(order[1], g) ? null : order[i]);
      if (a) {
        const sub = grade({ kind: a.kind, pts: a.pts }, g, ctx);
        return result('wrong', sub.msg, { ...base, rule: sub.rule ?? RULES[answer.kind], tags: sub.tags });
      }
    }
    return result('wrong', RULES[answer.kind], { ...base, rule: RULES[answer.kind] });
  }
  if (got.pts.length !== answer.pts.length && ARITY[answer.kind]) {
    return result('wrong', `A ${NAMES[answer.kind]} is named by ${ARITY[answer.kind]} letters.`, { ...base, rule: RULES[answer.kind] });
  }
  if (answer.kind === 'plane') {
    return result('wrong', 'Name the plane by one script capital or by three non-collinear points that lie in it.', { ...base, rule: RULES.plane, tags: ['plane-naming'] });
  }
  return result('wrong', `Those letters name a different ${NAMES[answer.kind]} — look at the figure again.`, { ...base, rule: RULES[answer.kind] });
}

export default grade;
