// data/cards/m1.js — Module M1 "Vocabulary & Notation" (S2 working title: Lexicon): the 55 §0 cards (COMPOSED S2 row 1, S6 card schema).
//   voc-01..23  VOC     vocabulary — three presentations of one term (mc · term · termmatch), `pick:'one'`
//   not-01..09  NOTE    notation — read (`mc` of rendered symbols) and write (`notation` builder), trap items
//   def-01..14  VOC     standard definitions as `cloze` with chip rows (text verbatim from SOURCE.md §0)
//   fact-01..05 ASN-PLP intersection facts + the two "exactly one" postulates — `cloze` in M1, plus an `asn`
//                       verdict form (flag `mock:true`) for the Mock's section C and M9's reason pool, `pick:'one'`
//   cls-01..04  CLASS   acute / right / obtuse / straight — `classify`
//
// `pick:'one'` (card-level): exactly ONE part is asked per sitting — the card is a ~15 s micro-card
// (S4 tier 1, S7 "Notation flash — 12 M1 cards, ~3 min"). Rotation rule for the Card screen:
// parts[history.length % parts.length] (first sitting → parts[0]); HP pips = 1. Parts flagged
// `blitz:false` are never drawn by BLITZ. Cards without `pick` ask every part in order (S1 pips formula).
//
// Every wrong option carries its own one-line teaching message in BOTH places the engine can read it:
//   • on the part, in the grader's own hook — mc `distractors:[{text, why, term?, tag?}]` (js/grader/mc.js),
//     term `confusables:[{term, msg}]` (js/grader/term.js), cloze `blanks[].why:{[chip]: msg}` (js/grader/cloze.js);
//   • on the card, in `misconceptions:[{part, answer, tag?, msg}]` (S6) for the error log / Patterns panel.
//   Both are generated from one table per card, so they cannot drift. `tag` is present only when the
//   T06g catalogue (data/misconceptions.js) has a matching pattern; a missing `tag` means "no pattern yet".
//   For `notation` parts `answer` is a string js/grader/notation.js `parse()` accepts ("ray BF", "segment FD",
//   "∠FBC", "m∠BFC", "FD" = a length) — compare with `same(parse(m.answer), result.normalized)`.
//
// Mini-markup in stems / options / solutions is rendered by js/mathfmt.js ({line AB}, {seg AB}, {ray AB},
// {len AB}, {ang ABC}, {m ABC}). Figure F1 is the fan in data/figures.js (vertex F; rays D 0°, C 26°,
// B 90°, A 180°, E 206°; lines A–D and E–C; right mark between B and A) — T04 modelled it from the scan,
// where ray C measures ≈ 26°, not the 31° this file first assumed. The structure every card here depends on
// is exact (∠BFD = 90°, ∠AFD = 180°, A–F–D and E–F–C collinear, ∠AFE vertical to ∠CFD); the *given* measures
// 31° / 59° / 121° / 149° are data on a drawing that is a few degrees off, so the F1() helper below leaves
// `notToScale` to the model's auto-detection: a numeric label that disagrees with the drawing by > 0.5°
// (cls-01's 31°, cls-03's 121°) shows the "Not to scale" chip; cards with no numeric label show no chip.
// Drawn measures, if a solution ever needs one: ∠CFD 26°, ∠BFC 64°, ∠BFE 116°, ∠AFC 154°, ∠DFE 154°.

import { vocab, vocabByKey, termmatchSets } from '../vocab.js';

const SRC_FILE = 'source/study-guide.html (§0 vocabulary)';
const LETTERS = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F']);
const CLASSES = Object.freeze(['acute', 'right', 'obtuse', 'straight']);

// `notToScale` omitted on purpose: resolve() decides (letters in a label, or a numeric label that
// disagrees with the drawn measure by > 0.5° → chip). See the header note above.
const F1 = (labels = []) => ({ id: 'F1', rename: {}, labels });

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const withTag = (tag) => (tag ? { tag } : {});

/** Card factory: fills the S6 defaults so every M1 card has the same shape. */
function card(o) {
  return {
    module: 'M1', sheet: 'VOC', srcFile: SRC_FILE, needs: [], figure: null, pick: null,
    misconceptions: [], verified: true,
    ...o,
  };
}

/* ---------- part builders: one wrong-option table → grader hook + card-level misconceptions ---------- */

/** wrongs: [{text, why, tag?, term?}] */
function mcPart(id, prompt, answer, wrongs, extra = {}) {
  return {
    id, type: 'mc', prompt, answer,
    distractors: wrongs.map(w => ({ text: w.text, why: w.why, ...(w.term ? { term: w.term } : {}), ...withTag(w.tag) })),
    ...extra,
  };
}
const mcMis = (wrongs, part = 'mc') => wrongs.map(w => ({ part, answer: w.text, ...withTag(w.tag), msg: w.why }));

/** blanks: [{answer, options, why?:{[chip]: {msg, tag?}}}] */
function clozePart(text, blanks) {
  return {
    id: 'cloze', type: 'cloze', text,
    blanks: blanks.map(b => ({
      answer: b.answer, options: b.options,
      ...(b.why ? { why: Object.fromEntries(Object.entries(b.why).map(([chip, w]) => [chip, w.msg])) } : {}),
    })),
  };
}
const clozeMis = (blanks) => blanks.flatMap(b => Object.entries(b.why ?? {}).map(([chip, w]) => ({ part: 'cloze', answer: chip, ...withTag(w.tag), msg: w.msg })));

/** wrongs: [{answer (parseable notation string), msg, tag?}] */
const notMis = (wrongs) => wrongs.map(w => ({ part: 'build', answer: w.answer, ...withTag(w.tag), msg: w.msg }));

/* ───────────────────────────── voc-01..23 (from data/vocab.js) ───────────────────────────── */

const PIECES = ['segment', 'ray', 'line', 'opposite-rays'];
const SUMS = ['complementary', 'supplementary', 'complement', 'supplement'];
const PLACE = ['collinear', 'coplanar'];
const TYPES = ['acute', 'right', 'obtuse', 'straight'];
const both = (list, a, b) => list.includes(a) && list.includes(b);

/** Catalogued pattern for mixing up term `a` with term `b` (keys), or null. */
function vocTag(a, b) {
  if (both(PIECES, a, b)) return 'confused-ray-segment';
  if (both(SUMS, a, b)) return 'confused-comp-supp';
  if (both(PLACE, a, b)) return 'confused-collinear-coplanar';
  if (both(TYPES, a, b)) return 'misclassified';
  const s = new Set([a, b]);
  if (s.has('adjacent') && s.has('linear-pair')) return 'confused-adjacent-linear';
  if (s.has('vertical-angles') && (s.has('linear-pair') || s.has('adjacent'))) return 'confused-vertical-linear';
  return null;
}

function vocCard(v, n) {
  const confusables = v.confusable.slice(0, 3).map(k => vocabByKey[k]);
  const set = termmatchSets.find(s => s.keys.includes(v.key));
  const mcWrongs = confusables.map(c => ({
    text: c.ask, term: c.term, tag: vocTag(v.key, c.key),
    why: `That is the definition of “${c.term}”, not “${v.term}”.`,
  }));
  const termWrongs = confusables.map(c => ({
    term: c.term, tag: vocTag(v.key, c.key),
    msg: `“${c.term}” means: ${c.ask}. Read the definition again — which word fits it exactly?`,
  }));
  return card({
    id: v.id,
    src: `§0 term ${n} of 23: ${v.term}`,
    tier: 1, par: 20, skills: ['VOC'],
    pick: 'one',
    stem: `Vocabulary — §0 term ${n} of 23.`,
    parts: [
      mcPart('mc', `Which is the definition of “${v.term}”?`, v.ask, mcWrongs, { term: v.term }),
      {
        id: 'term', type: 'term',
        prompt: `Which term means: “${v.ask}”? Type the term.`,
        answers: [...v.aliases],
        confusables: termWrongs.map(w => ({ term: w.term, msg: w.msg })),
      },
      {
        id: 'match', type: 'termmatch', blitz: false,
        prompt: `Match each term to its definition (${set.name}).`,
        set: set.id,
        pairs: set.keys.map(k => ({ term: vocabByKey[k].term, def: vocabByKey[k].ask })),
      },
    ],
    hints: [...v.hints],
    solution: [
      { say: `${cap(v.term)}: ${v.def}.`, math: v.symbol ? `symbol: ${v.symbol}` : '' },
      { say: 'Example.', math: v.example },
      { say: 'Not to be confused with:', math: confusables.map(c => `${c.term} — ${c.ask}`).join(' · ') },
      ...(v.note ? [{ say: 'Remember.', math: v.note }] : []),
    ],
    misconceptions: [
      ...termWrongs.map(w => ({ part: 'term', answer: w.term, ...withTag(w.tag), msg: w.msg })),
      ...mcMis(mcWrongs),
    ],
  });
}

const VOC = vocab.map((v, i) => vocCard(v, i + 1));

/* ───────────────────────────── not-01..09 (notation) ───────────────────────────── */

const NOT_01_WRONG = [
  { text: 'the segment with endpoints A and B', tag: 'line-vs-segment', why: 'A segment has a plain bar. The double arrow means no endpoints at all.' },
  { text: 'the ray that starts at A and passes through B', tag: 'wrong-decoration', why: 'A ray has a single arrow. Two arrowheads mean it goes on forever both ways.' },
  { text: 'the distance from A to B (a number)', tag: 'bar-on-length', why: 'A length has NO mark over the letters. This symbol names a set of points, not a number.' },
];
const NOT_02_WRONG = [
  { text: 'the line through A and B', tag: 'line-vs-segment', why: 'A line gets a double arrow. A plain bar means two endpoints.' },
  { text: 'the ray that starts at A and passes through B', tag: 'segment-vs-ray', why: 'A ray gets a single arrow. A plain bar means two endpoints.' },
  { text: 'the length of the segment from A to B (a number)', tag: 'bar-on-length', why: 'The length is written with NO bar. With a bar it is the segment itself.' },
];
const NOT_03_WRONG = [
  { answer: 'segment FD', tag: 'bar-on-length', msg: 'A bar over FD names the segment (a set of points). Its LENGTH is written with no bar at all.' },
  { answer: 'line FD', tag: 'bar-on-length', msg: 'A double arrow names the whole line. A length is a number: two letters, no mark.' },
  { answer: 'ray FD', tag: 'bar-on-length', msg: 'An arrow names a ray. A length is a number: two letters, no mark.' },
  { answer: 'ray DF', tag: 'bar-on-length', msg: 'An arrow names a ray. A length is a number: two letters, no mark.' },
];
const NOT_04_WRONG = [
  { answer: 'ray BF', tag: 'ray-order', msg: 'The endpoint is written FIRST. This ray starts at F, so F comes first: ray FB ≠ ray BF.' },
  { answer: 'segment FB', tag: 'segment-vs-ray', msg: 'A plain bar names a segment, which stops at both ends. A ray needs an arrow.' },
  { answer: 'line FB', tag: 'wrong-decoration', msg: 'A double arrow names the whole line. A ray has one endpoint: single arrow, endpoint first.' },
];
const NOT_05_WRONG = [
  { answer: 'ray DF', tag: 'ray-order', msg: 'Opposite rays share the SAME endpoint F, so F is written first.' },
  { answer: 'ray AF', tag: 'ray-order', msg: '{ray AF} starts at A. The opposite ray must share endpoint F and point the other way.' },
  { answer: 'line AD', tag: 'wrong-decoration', msg: 'The two opposite rays together make {line AD}, but the question asks for one ray.' },
  { answer: 'segment FD', tag: 'segment-vs-ray', msg: 'A segment stops at D. A ray keeps going: single arrow, endpoint first.' },
];
const NOT_06_WRONG = [
  { answer: '∠FBC', tag: 'vertex-not-middle', msg: 'The vertex goes in the MIDDLE. ∠FBC would have its vertex at B.' },
  { answer: '∠FCB', tag: 'vertex-not-middle', msg: 'The vertex goes in the MIDDLE. ∠FCB would have its vertex at C.' },
  { answer: 'm∠BFC', tag: 'm-vs-angle', msg: 'm∠BFC is the MEASURE (a number). The question asks for the angle itself: ∠BFC.' },
];
const NOT_07_WRONG = [
  { text: '{ang BFC}', tag: 'm-vs-angle', why: '∠BFC is the angle itself — two rays. Only the version with m in front is a number.' },
  { text: '{ray FB}', tag: 'wrong-decoration', why: 'A ray is a set of points. A number of degrees needs the "measure of" prefix.' },
  { text: '{seg BC}', tag: 'wrong-decoration', why: 'With the bar this is the segment. BC with no bar would be a number (a length) — but the question asks for degrees.' },
];
const NOT_08_WRONG = [
  { text: '{ang ABC} = {ang DEF}', tag: 'congruent-vs-equal', why: 'Angles are figures, so they are congruent (≅), not equal. Only their measures are equal: m∠ABC = m∠DEF.' },
  { text: '{m ABC} ≅ {m DEF}', tag: 'congruent-vs-equal', why: 'Measures are numbers, and numbers are equal (=), never congruent.' },
  { text: '{ang ABC} ≅ 40°', tag: 'congruent-vs-equal', why: 'An angle cannot be congruent to a number. Say m∠ABC = 40° instead.' },
];
const NOT_09_WRONG = [
  { text: 'plane AFD', tag: 'plane-naming', why: 'A, F and D are collinear — they lie on one line, so they cannot name a plane. Pick three points NOT on one line.' },
  { text: 'plane EFC', tag: 'plane-naming', why: 'E, F and C are collinear — they lie on one line, so they cannot name a plane. Pick three points NOT on one line.' },
  { text: 'plane F', tag: 'plane-naming', why: 'One point does not fix a plane. Use a script letter or three non-collinear points.' },
];

const NOT = [
  card({
    id: 'not-01', src: '§0 notation: line', tier: 1, par: 20, skills: ['NOTE'],
    stem: 'Read the symbol {line AB}.',
    parts: [mcPart('mc', 'What does {line AB} name?', 'the line through A and B — it extends forever in both directions', NOT_01_WRONG)],
    hints: [
      'The mark over the letters tells you what kind of object it is.',
      'A double arrow means it keeps going at BOTH ends.',
      'A single bar would be a segment; a single arrow a ray; no mark at all a length.',
    ],
    solution: [
      { say: 'A double arrow over two letters names a line.', math: '{line AB}' },
      { say: 'A line has no endpoints: it extends forever in both directions and contains infinitely many points.', math: '' },
      { say: 'Compare the four symbols.', math: '{line AB} line · {seg AB} segment · {ray AB} ray from A · {len AB} the length (a number)' },
    ],
    misconceptions: mcMis(NOT_01_WRONG),
  }),
  card({
    id: 'not-02', src: '§0 notation: segment', tier: 1, par: 20, skills: ['NOTE'],
    stem: 'Read the symbol {seg AB}.',
    parts: [mcPart('mc', 'What does {seg AB} name?', 'the segment with endpoints A and B', NOT_02_WRONG)],
    hints: [
      'The mark over the letters tells you what kind of object it is.',
      'A plain bar with no arrowheads means it stops at both ends.',
      'A bar names the set of points; the same two letters with NO bar would be its length.',
    ],
    solution: [
      { say: 'A plain bar over two letters names a segment: part of a line with two endpoints.', math: '{seg AB}' },
      { say: 'The letters without any bar mean the length of that segment — a number.', math: '{len AB} = 8 means the segment is 8 units long' },
    ],
    misconceptions: mcMis(NOT_02_WRONG),
  }),
  card({
    id: 'not-03', src: '§0 notation: length (no bar) — trap', tier: 2, par: 45, skills: ['NOTE'],
    stem: 'In the figure, F is between A and D. Write the symbol for the LENGTH of the segment from F to D — the number of units between F and D.',
    figure: F1(),
    parts: [{ id: 'build', type: 'notation', prompt: 'Build the symbol for the length FD.', kind: 'len', pts: ['F', 'D'], letters: LETTERS }],
    hints: [
      'A length is a number, not a set of points.',
      'Segments, rays and lines all get a mark over their letters. A number does not.',
      'Two letters, and nothing on top.',
    ],
    solution: [
      { say: 'The segment is written with a bar; its length is the same two letters with no bar.', math: '{seg FD} is the segment · {len FD} is its length' },
      { say: 'So the length of the segment from F to D is written plainly.', math: '{len FD}' },
    ],
    misconceptions: notMis(NOT_03_WRONG),
  }),
  card({
    id: 'not-04', src: '§0 notation: ray, endpoint first — trap (Boss B1 elite)', tier: 2, par: 45, skills: ['NOTE'],
    stem: 'Write the name of the ray with endpoint F that passes through B.',
    figure: F1(),
    parts: [{ id: 'build', type: 'notation', prompt: 'Build the symbol for this ray.', kind: 'ray', pts: ['F', 'B'], letters: LETTERS }],
    hints: [
      'A ray has one endpoint and goes on forever through the other point.',
      'The symbol is two letters with a single arrow over them.',
      'The FIRST letter names the endpoint — where does this ray start?',
    ],
    solution: [
      { say: 'A ray is named endpoint first, then any other point on it.', math: '{ray FB}: starts at F, passes through B' },
      { say: 'The reversed name is a different ray.', math: '{ray BF} would start at B and pass through F — not this one' },
    ],
    misconceptions: notMis(NOT_04_WRONG),
  }),
  card({
    id: 'not-05', src: '§0 notation: opposite rays', tier: 2, par: 45, skills: ['NOTE'],
    stem: 'In the figure, A, F and D are collinear with F between A and D. Name the ray opposite to {ray FA}.',
    figure: F1(),
    parts: [{ id: 'build', type: 'notation', prompt: 'Build the symbol for the ray opposite {ray FA}.', kind: 'ray', pts: ['F', 'D'], letters: LETTERS }],
    hints: [
      'Opposite rays share one endpoint and point in exactly opposite directions.',
      '{ray FA} starts at F and goes left through A. The opposite ray starts at the same point.',
      'Same endpoint first, then the point on the other side of F along the line.',
    ],
    solution: [
      { say: 'Opposite rays have a common endpoint and together form a line.', math: '{ray FA} and {ray FD} share F and make {line AD}' },
      { say: 'So the ray opposite {ray FA} starts at F and passes through D.', math: '{ray FD}' },
    ],
    misconceptions: notMis(NOT_05_WRONG),
  }),
  card({
    id: 'not-06', src: '§0 notation: ∠ABC, vertex in the middle', tier: 2, par: 45, skills: ['NOTE'],
    stem: 'Name the angle whose vertex is F and whose sides pass through B and C.',
    figure: F1(),
    parts: [{ id: 'build', type: 'notation', prompt: 'Build the symbol for this angle.', kind: 'ang', pts: ['B', 'F', 'C'], letters: LETTERS }],
    hints: [
      'An angle is named with ∠ and three letters, one from each side and the vertex.',
      'The vertex is the point the two sides share.',
      'The vertex letter goes in the MIDDLE; the two outer letters can be in either order.',
    ],
    solution: [
      { say: 'The vertex is the middle letter; the outer letters name a point on each side.', math: '{ang BFC} = {ang CFB}' },
      { say: 'The measure of that angle is written with m in front — a number, not the angle.', math: '{m BFC} = 59°' },
    ],
    misconceptions: notMis(NOT_06_WRONG),
  }),
  card({
    id: 'not-07', src: '§0 notation: m∠ vs ∠', tier: 1, par: 20, skills: ['NOTE'],
    stem: 'Exactly one of these is a NUMBER (a measure in degrees). Which one?',
    parts: [mcPart('mc', 'Which one is a number?', '{m BFC}', NOT_07_WRONG)],
    hints: [
      'An angle, a ray and a segment are figures made of points.',
      'A measure is how big something is — a number of degrees.',
      'Symbols that name objects have no "measure of" prefix.',
    ],
    solution: [
      { say: 'm∠BFC is read "the measure of angle BFC" — a number of degrees.', math: '{m BFC} = 59°' },
      { say: '∠BFC is the angle itself: two rays with a common endpoint. You can bisect it, but you cannot say it equals 59.', math: '{ang BFC} ≠ 59° · {m BFC} = 59°' },
    ],
    misconceptions: mcMis(NOT_07_WRONG),
  }),
  card({
    id: 'not-08', src: '§0 notation: ≅ vs =', tier: 1, par: 20, skills: ['NOTE'],
    stem: '{ang ABC} and {ang DEF} both measure 40°. Which statement is written correctly?',
    parts: [mcPart('mc', 'Pick the correctly written statement.', '{ang ABC} ≅ {ang DEF}', NOT_08_WRONG)],
    hints: [
      'Figures are congruent; numbers are equal.',
      '≅ goes between two angles; = goes between two measures.',
      'Which option puts ≅ between two angle symbols, with no numbers and no m?',
    ],
    solution: [
      { say: 'Angles are figures, so equal-sized angles are congruent.', math: '{ang ABC} ≅ {ang DEF}' },
      { say: 'Their measures are numbers, so the measures are equal. Both lines say the same thing.', math: '{m ABC} = {m DEF} = 40°' },
      { say: 'Never mix them: no = between angles, no ≅ between numbers.', math: '' },
    ],
    misconceptions: mcMis(NOT_08_WRONG),
  }),
  card({
    id: 'not-09', src: '§0 notation: naming a plane', tier: 1, par: 20, skills: ['NOTE'],
    stem: 'All six points of the figure lie in one plane. Which of these names that plane correctly?',
    figure: F1(),
    parts: [mcPart('mc', 'Pick the correct name for the plane.', 'plane ABF', NOT_09_WRONG)],
    hints: [
      'A plane is named by a capital script letter or by three points in it.',
      'The three points must NOT all lie on one line.',
      'Check each option: are its three points collinear?',
    ],
    solution: [
      { say: 'Three non-collinear points determine exactly one plane, so three such points can name it.', math: 'plane ABF: A, B, F are not on one line' },
      { say: 'A, F, D lie on {line AD} and E, F, C lie on {line EC}, so those triples name lines, not planes; one point names nothing.', math: '' },
    ],
    misconceptions: mcMis(NOT_09_WRONG),
  }),
];

/* ───────────────────────────── def-01..14 (cloze, verbatim §0) ───────────────────────────── */

const W = (msg, tag) => ({ msg, ...withTag(tag) });

const DEF_BLANKS = {
  'def-01': [
    { answer: 'location', options: ['location', 'line', 'measure', 'shape'],
      why: { measure: W('A point has no measure — that word belongs to angles (m∠) and lengths.') } },
    { answer: 'size', options: ['plane', 'size', 'endpoint', 'vertex'],
      why: { endpoint: W('Endpoints belong to segments and rays. A point is just a location.') } },
  ],
  'def-02': [
    { answer: 'both', options: ['one', 'both', 'all', 'no'],
      why: { one: W('One direction is a ray. A line keeps going at BOTH ends.', 'confused-ray-segment') } },
    { answer: 'infinitely many', options: ['two', 'exactly three', 'infinitely many', 'a finite number of'],
      why: { two: W('Two points DETERMINE a line, but a line CONTAINS infinitely many points.') } },
  ],
  'def-03': [
    { answer: 'flat', options: ['curved', 'flat', 'straight', 'solid'],
      why: { straight: W('"Straight" describes a line. A plane is flat.') } },
    { answer: 'all', options: ['both', 'two', 'all', 'four'],
      why: { both: W('"Both directions" describes a line. A plane spreads out in EVERY direction.') } },
  ],
  'def-04': [
    { answer: 'line', options: ['plane', 'line', 'ray', 'segment'],
      why: { plane: W('Same plane is COPLANAR. Collinear points share a line.', 'confused-collinear-coplanar') } },
  ],
  'def-05': [
    { answer: 'plane', options: ['line', 'angle', 'plane', 'space'],
      why: { line: W('Same line is COLLINEAR. Coplanar points share a plane.', 'confused-collinear-coplanar') } },
  ],
  'def-06': [
    { answer: 'line', options: ['plane', 'ray', 'line', 'angle'],
      why: { ray: W('A segment is part of a LINE (and so is a ray).', 'confused-ray-segment') } },
    { answer: 'two', options: ['two', 'one', 'no', 'three'],
      why: { one: W('One endpoint makes a ray. A segment stops at both ends.', 'confused-ray-segment') } },
  ],
  'def-07': [
    { answer: 'one', options: ['two', 'no', 'one', 'three'],
      why: { two: W('Two endpoints make a segment. A ray has exactly one.', 'confused-ray-segment') } },
    { answer: 'one', options: ['both', 'one', 'every', 'no'],
      why: { both: W('Both ways is a line. A ray extends forever in ONE direction.', 'confused-ray-segment') } },
  ],
  'def-08': [
    { answer: 'rays', options: ['lines', 'rays', 'segments', 'planes'],
      why: { lines: W('Lines have no endpoint to share. The sides of an angle are rays.') } },
    { answer: 'vertex', options: ['side', 'midpoint', 'vertex', 'ray'],
      why: { side: W('The sides are the rays. Their shared endpoint has its own name.') } },
  ],
  'def-09': [
    { answer: 'ray', options: ['line', 'point', 'ray', 'plane'],
      why: { line: W('A bisector starts at the vertex and goes one way — a ray, not a line.') } },
    { answer: 'congruent', options: ['obtuse', 'congruent', 'complementary', 'vertical'],
      why: { complementary: W('Complementary means the two add to 90°. A bisector makes two EQUAL halves, whatever the total.') } },
  ],
  'def-10': [
    { answer: '90°', options: ['180°', '90°', '360°', '45°'],
      why: { '180°': W('180° is SUPPLEMENTARY. C for corner: complementary angles fill a right angle.', 'used-180-for-comp') } },
    { answer: '90', options: ['180', '90', '45', '360'],
      why: { '180': W('180 − x is the supplement. The complement of x is 90 − x.', 'used-180-for-comp') } },
  ],
  'def-11': [
    { answer: '180°', options: ['90°', '360°', '180°', '270°'],
      why: { '90°': W('90° is COMPLEMENTARY. S for straight: supplementary angles fill a straight angle.', 'used-90-for-supp') } },
    { answer: '180', options: ['90', '180', '270', '360'],
      why: { '90': W('90 − x is the complement. The supplement of x is 180 − x.', 'used-90-for-supp') } },
  ],
  'def-12': [
    { answer: 'vertex', options: ['measure', 'vertex', 'plane', 'line'],
      why: { measure: W('Adjacent says nothing about measures — it is about position: same vertex, same side, no overlap.') } },
    { answer: 'side', options: ['side', 'angle', 'vertex', 'name'] },
    { answer: 'interior points', options: ['sides', 'interior points', 'vertex', 'measure'],
      why: { sides: W('They DO share one side. What they must not share is the inside.') } },
  ],
  'def-13': [
    { answer: 'adjacent', options: ['vertical', 'adjacent', 'congruent', 'right'],
      why: { vertical: W('Vertical angles are NOT adjacent — they sit across from each other. A linear pair is two ADJACENT angles.', 'confused-vertical-linear') } },
    { answer: 'opposite rays', options: ['perpendicular', 'collinear', 'opposite rays', 'congruent'] },
    { answer: 'supplementary', options: ['complementary', 'congruent', 'supplementary', 'acute'],
      why: {
        complementary: W('The outer sides make a straight line, so the pair adds to 180° — supplementary, not complementary.', 'confused-comp-supp'),
        congruent: W('A linear pair is congruent only when both angles are 90°. In general they are supplementary.', 'confused-vertical-linear'),
      } },
  ],
  'def-14': [
    { answer: 'non-adjacent', options: ['adjacent', 'non-adjacent', 'right', 'obtuse'],
      why: { adjacent: W('Vertical angles share only the vertex, not a side — they are NOT adjacent.', 'confused-vertical-linear') } },
    { answer: 'intersecting', options: ['parallel', 'perpendicular', 'intersecting', 'collinear'],
      why: { perpendicular: W('Any two intersecting lines make vertical angles — they need not be perpendicular.') } },
    { answer: 'congruent', options: ['supplementary', 'complementary', 'congruent', 'adjacent'],
      why: { supplementary: W('Supplementary is the linear pair (side by side). Vertical angles are across from each other and congruent.', 'confused-vertical-linear') } },
  ],
};

const defCard = (id, src, text, par, hints, solution) => card({
  id, src, tier: 1, par, skills: ['VOC'],
  stem: 'Complete the definition.',
  parts: [clozePart(text, DEF_BLANKS[id])],
  hints, solution,
  misconceptions: clozeMis(DEF_BLANKS[id]),
});

const DEF = [
  defCard('def-01', '§0 definition: point', 'Point: a [_], no [_].', 30,
    [
      'A point is the simplest object: it tells you WHERE, and nothing else.',
      'First blank: what a point is. Second blank: what it does not have.',
      'It has no length, no width, no height — one word covers all three.',
    ],
    [
      { say: 'Point: a location, no size.', math: '' },
      { say: 'It is named by a capital letter (F) and drawn as a dot only so you can see it.', math: '' },
    ]),
  defCard('def-02', '§0 definition: line', 'Line: straight, extends forever in [_] directions, contains [_] points.', 30,
    [
      'Think of the double-arrow symbol: each arrowhead is a direction.',
      'A ray goes one way; a line goes further than that.',
      'How many points fit on something that never ends?',
    ],
    [
      { say: 'Line: straight, extends forever in both directions, contains infinitely many points.', math: '{line AD}' },
      { say: 'And the postulate that goes with it: through any two points there is exactly one line.', math: '' },
    ]),
  defCard('def-03', '§0 definition: plane', 'Plane: [_] surface extending forever in [_] directions.', 30,
    [
      'A plane is like an endless tabletop.',
      'A line is straight; a plane is described with a different word.',
      'A line has two directions; a plane has more than that.',
    ],
    [
      { say: 'Plane: flat surface extending forever in all directions.', math: 'named plane ABF, or by a script letter' },
      { say: 'And the postulate that goes with it: through any three non-collinear points there is exactly one plane.', math: '' },
    ]),
  defCard('def-04', '§0 definition: collinear', 'Collinear: points on the same [_].', 20,
    [
      'co- means together.',
      'The rest of the word names the object the points share.',
      'col-LINE-ar.',
    ],
    [
      { say: 'Collinear: points on the same line.', math: 'A, F, D are collinear — all on {line AD}' },
      { say: 'Same plane instead of same line is the other word: coplanar.', math: '' },
    ]),
  defCard('def-05', '§0 definition: coplanar', 'Coplanar: points/lines in the same [_].', 20,
    [
      'co- means together.',
      'The rest of the word names the object they share.',
      'co-PLANE-ar.',
    ],
    [
      { say: 'Coplanar: points/lines in the same plane.', math: 'A, B, C, D, E, F all lie in the plane of the page' },
      { say: 'Same line instead of same plane is the other word: collinear.', math: '' },
    ]),
  defCard('def-06', '§0 definition: segment', 'Segment: part of a [_] with [_] endpoints.', 30,
    [
      'A segment is a piece cut out of something straight.',
      'It stops at BOTH ends.',
      'Count the endpoints of {seg FD}.',
    ],
    [
      { say: 'Segment: part of a line with two endpoints.', math: '{seg FD} — endpoints F and D' },
      { say: 'One endpoint instead of two would make it a ray.', math: '' },
    ]),
  defCard('def-07', '§0 definition: ray', 'Ray: part of a line with [_] endpoint, extends forever [_] way.', 30,
    [
      'A ray is like a beam of light from a torch: it starts somewhere and keeps going.',
      'A segment has two endpoints; a ray has fewer.',
      'Look at the arrow in {ray FB}: how many directions does it point?',
    ],
    [
      { say: 'Ray: part of a line with one endpoint, extends forever one way.', math: '{ray FB} — endpoint F, through B, never ends' },
      { say: 'Two endpoints would make it a segment; no endpoint, a line.', math: '' },
    ]),
  defCard('def-08', '§0 definition: angle (sides, vertex)', 'Angle: two [_] (sides) with a common endpoint ([_]).', 30,
    [
      'The two sides of an angle each start at the same point and go on forever.',
      'Which object has exactly one endpoint?',
      'The shared endpoint is the middle letter of ∠BFC.',
    ],
    [
      { say: 'Angle: two rays (sides) with a common endpoint (vertex).', math: '{ang BFC}: sides {ray FB} and {ray FC}, vertex F' },
      { say: 'The vertex is the middle letter in the name of the angle.', math: '' },
    ]),
  defCard('def-09', '§0 definition: angle bisector', 'Angle bisector: a [_] that divides an angle into two [_] angles.', 30,
    [
      'bi- means two, -sect means cut.',
      'The cutter starts at the vertex and goes out through the angle: what kind of object is that?',
      'The two pieces have the same measure — which word says that?',
    ],
    [
      { say: 'Angle bisector: a ray that divides an angle into two congruent angles.', math: 'doc #5: {ray BD} bisects {ang ABC} because {m ABD} = {m DBC} = 81°' },
      { say: 'To decide whether a ray bisects, compare the two halves: equal measures means yes.', math: '' },
    ]),
  defCard('def-10', '§0 definition: complementary', 'Complementary: two angles whose measures sum to [_]. Complement of x = [_] − x.', 30,
    [
      'C for Corner: two complementary angles fill a right angle.',
      'The two measures add to that total, so the complement is the total minus x.',
      'The same number appears in both blanks.',
    ],
    [
      { say: 'Complementary: two angles whose measures sum to 90°.', math: '{ang BFC} and {ang CFD}: 59 + 31 = 90' },
      { say: 'Complement of x = 90 − x.', math: 'complement of 31° = 90 − 31 = 59°' },
    ]),
  defCard('def-11', '§0 definition: supplementary', 'Supplementary: two angles whose measures sum to [_]. Supplement of x = [_] − x.', 30,
    [
      'S for Straight: two supplementary angles fill a straight angle.',
      'The two measures add to that total, so the supplement is the total minus x.',
      'The same number appears in both blanks.',
    ],
    [
      { say: 'Supplementary: two angles whose measures sum to 180°.', math: '{ang AFC} and {ang CFD}: 149 + 31 = 180' },
      { say: 'Supplement of x = 180 − x.', math: 'supplement of 31° = 180 − 31 = 149°' },
    ]),
  defCard('def-12', '§0 definition: adjacent angles', 'Adjacent angles: two angles that share a [_] and a [_] but no [_].', 40,
    [
      'Adjacent means next to each other — it is about position, not size.',
      'Two angles next to each other share their corner point and one ray.',
      'They touch along that ray but do not overlap: nothing inside one is inside the other.',
    ],
    [
      { say: 'Adjacent angles: two angles that share a vertex and a side but no interior points.', math: '{ang BFC} and {ang CFD}: vertex F, side {ray FC}, no overlap' },
      { say: 'Nothing is said about their measures — adjacent angles can add to anything.', math: '' },
    ]),
  defCard('def-13', '§0 definition: linear pair', 'Linear pair: two [_] angles whose non-common sides are [_] (they are [_]).', 40,
    [
      'A linear pair is two angles side by side whose outer sides make a straight line.',
      'Side by side means they share a vertex and a side; the outer sides point in opposite directions from that vertex.',
      'A straight line is 180°, so the two measures add to 180°.',
    ],
    [
      { say: 'Linear pair: two adjacent angles whose non-common sides are opposite rays (they are supplementary).', math: '{ang AFC} and {ang CFD}: {ray FA} and {ray FD} are opposite rays' },
      { say: 'Every linear pair is supplementary, but supplementary angles need not be a linear pair (they need not even touch).', math: '149 + 31 = 180' },
    ]),
  defCard('def-14', '§0 definition: vertical angles', 'Vertical angles: two [_] angles formed by two [_] lines (they are [_]).', 40,
    [
      'Picture an X: vertical angles are the two angles across from each other.',
      'Across from each other means they share only the vertex, never a side.',
      'The two angles across an X always have the same measure.',
    ],
    [
      { say: 'Vertical angles: two non-adjacent angles formed by two intersecting lines (they are congruent).', math: '{ang AFE} and {ang CFD} where {line AD} crosses {line EC}' },
      { say: 'Congruent means equal measures — that is what lets you set the two expressions equal in a figure.', math: '{m AFE} = {m CFD} = 31°' },
    ]),
];

/* ───────────────────────────── fact-01..05 (intersection facts + postulates) ───────────────────────────── */

const FACT_BLANKS = {
  'fact-01': [
    { answer: 'one', options: ['two', 'one', 'three', 'no'],
      why: { two: W('Two shared points would make them the same line. Distinct lines share at most one.') } },
  ],
  'fact-02': [
    { answer: 'line', options: ['point', 'line', 'segment', 'ray'],
      why: {
        point: W('Two planes cannot touch at just one point — they are flat and endless, so they share a whole line.'),
        segment: W('Planes never end, so their shared part never ends either: a line, not a segment.'),
      } },
  ],
  'fact-03': [
    { answer: 'point', options: ['segment', 'point', 'ray', 'line'],
      why: { segment: W('If a line shares two points with a plane it shares all of itself — the whole line, not a segment.') } },
    { answer: 'lies in', options: ['is parallel to', 'bisects', 'lies in', 'is perpendicular to'],
      why: { 'is parallel to': W('Parallel is the "do not intersect" case. The middle case is the line sitting inside the plane.') } },
  ],
  'fact-04': [
    { answer: 'two', options: ['three', 'two', 'four', 'collinear'],
      why: { three: W('Three non-collinear points determine a PLANE. A line needs only two.') } },
    { answer: 'one', options: ['one', 'two', 'no', 'more than one'],
      why: { 'more than one': W('A second straight line through the same two points would coincide with the first.') } },
  ],
  'fact-05': [
    { answer: 'non-collinear', options: ['collinear', 'non-collinear', 'coplanar', 'distinct'],
      why: { collinear: W('Collinear points lie on one line, and a line lies in infinitely many planes. The postulate needs NON-collinear points.') } },
    { answer: 'one', options: ['no', 'one', 'two', 'infinitely many'],
      why: { 'infinitely many': W('Infinitely many planes contain a LINE. Three non-collinear points fix exactly one plane.') } },
  ],
};

const asnPart = (statement, answer, reason, distractors) => ({ id: 'asn', type: 'asn', mock: true, statement, answer, reason, distractors });

const factCard = (id, src, stem, text, par, asn, hints, solution) => card({
  id, src, tier: 1, par, skills: ['ASN-PLP'],
  pick: 'one',
  stem,
  parts: [clozePart(text, FACT_BLANKS[id]), asn],
  hints, solution,
  misconceptions: clozeMis(FACT_BLANKS[id]),
});

const FACT = [
  factCard('fact-01', '§0 intersection fact: two distinct lines', 'Intersection fact.',
    'Two distinct lines intersect in at most [_] point.', 30,
    asnPart('Two distinct lines intersect in at most one point.', 'A',
      'if two lines shared two points, exactly one line would pass through both — they would be the same line',
      ['two lines always cross somewhere, so they share exactly one point', 'two lines that are long enough can share two points']),
    [
      'Two straight lines can cross, or run parallel and never meet.',
      'Suppose they shared two points — through any two points there is exactly one line.',
      'So they can share zero points or one point, never more.',
    ],
    [
      { say: 'Two distinct lines intersect in at most one point.', math: '{line AD} and {line EC} meet only at F' },
      { say: 'Why: two shared points would force one line through both, so the lines would not be distinct.', math: '' },
    ]),
  factCard('fact-02', '§0 intersection fact: two distinct planes', 'Intersection fact.',
    'Two distinct planes intersect in a [_].', 30,
    asnPart('If two distinct planes intersect, their intersection is a line.', 'A',
      'two flat surfaces that cross share every point along a whole line, never just one point',
      ['two planes cross at a single corner point', 'two planes overlap in a flat region, not a line']),
    [
      'Picture a wall meeting the floor.',
      'The wall and the floor share more than a single point.',
      'What they share runs the whole length of the wall and never ends.',
    ],
    [
      { say: 'Two distinct planes intersect in a line.', math: 'wall ∩ floor = the line along the bottom of the wall' },
      { say: 'Two distinct planes either intersect in a line or are parallel and never meet — never a single point, never a segment.', math: '' },
    ]),
  factCard('fact-03', '§0 intersection fact: a line and a plane', 'Intersection fact.',
    "A line and a plane intersect in a [_], or the line [_] the plane, or they don't intersect.", 40,
    asnPart('A line and a plane can intersect in exactly two points.', 'N',
      'two shared points would put the whole line in the plane — the choices are one point, the whole line, or nothing',
      ['a line can poke through a plane in two places', 'a line and a plane never share more than one point']),
    [
      'Picture a pencil and a tabletop: three things can happen.',
      'The pencil can poke through the table, lie flat on it, or float above it.',
      'Poking through touches at one place; lying flat shares every point of the pencil.',
    ],
    [
      { say: "A line and a plane intersect in a point, or the line lies in the plane, or they don't intersect.", math: '' },
      { say: 'Exactly two shared points is impossible: two points fix the line, and both are in the plane, so the whole line is.', math: '' },
    ]),
  factCard('fact-04', '§0 postulate: two points, exactly one line', 'Postulate.',
    'Through any [_] points there is exactly [_] line.', 30,
    asnPart('Through any two points there is exactly one line.', 'A',
      'two points determine a line — the postulate; no second line can pass through both',
      ['many different lines can be drawn through two points', 'a line needs three points to be determined']),
    [
      'This is the postulate that lets you name a line by two of its points.',
      'Put two dots on paper and draw a straight line through both.',
      'Try to draw a second, different straight line through the same two dots.',
    ],
    [
      { say: 'Through any two points there is exactly one line.', math: '{line AD}: the only line through A and D' },
      { say: 'This is why "two distinct lines meet in at most one point" is true (fact-01).', math: '' },
    ]),
  factCard('fact-05', '§0 postulate: three non-collinear points, exactly one plane', 'Postulate.',
    'Through any three [_] points there is exactly [_] plane.', 30,
    asnPart('Through any three non-collinear points there is exactly one plane.', 'A',
      'three points not on one line pin down a single plane; collinear points would lie in infinitely many',
      ['any three points, collinear or not, fix exactly one plane', 'three points always lie in more than one plane']),
    [
      'This is the postulate that lets you name a plane by three of its points.',
      'A three-legged stool never wobbles — unless its feet are in a row.',
      'Three points in a row lie in infinitely many planes; the postulate needs the other kind.',
    ],
    [
      { say: 'Through any three non-collinear points there is exactly one plane.', math: 'plane ABF — A, B, F are not on one line' },
      { say: 'Three collinear points sit on a line, and a line lies in infinitely many planes, so they fix nothing.', math: '' },
    ]),
];

/* ───────────────────────────── cls-01..04 (classify) ───────────────────────────── */

const classify = (measure, answer) => ({
  id: 'cls', type: 'classify', prompt: 'Classify the angle.', measure, answer, options: CLASSES,
});
const clsMis = (wrongs) => wrongs.map(w => ({ part: 'cls', answer: w.pick, ...withTag(w.tag), msg: w.msg }));

const CLS = [
  card({
    id: 'cls-01', src: '§0 classification: acute', tier: 1, par: 20, skills: ['CLASS'],
    stem: 'In the figure, {m CFD} = 31°. Classify {ang CFD}.',
    figure: F1([{ angle: ['C', 'D'], text: '31°' }]),
    parts: [classify('31', 'acute')],
    hints: [
      'Compare the measure with 90° and 180°.',
      'Less than 90° is one type; exactly 90° another; between 90° and 180° a third; exactly 180° the last.',
      '31° is less than 90°.',
    ],
    solution: [
      { say: 'Acute: 0° < m < 90°.', math: '0 < 31 < 90' },
      { say: 'So ∠CFD is acute.', math: '{ang CFD} is acute' },
    ],
    misconceptions: clsMis([
      { pick: 'obtuse', tag: 'misclassified', msg: 'Obtuse is MORE than 90°. 31° is less than 90°.' },
      { pick: 'right', tag: 'misclassified', msg: 'Right is exactly 90°. 31° is less than that.' },
    ]),
  }),
  card({
    id: 'cls-02', src: '§0 classification: right', tier: 1, par: 20, skills: ['CLASS'],
    stem: 'In the figure, {ray FB} is perpendicular to {line AD} \u2014 the small square marks a right angle. Classify {ang BFD}.',
    figure: F1(),
    parts: [classify('90', 'right')],
    hints: [
      'The small square at F is a symbol with one meaning.',
      'Perpendicular means the measure is fixed exactly, without a number.',
      'A quarter turn — the corner of a page.',
    ],
    solution: [
      { say: 'Right: exactly 90°. Perpendicular lines (the square mark) make right angles.', math: '{m BFD} = 90°' },
      { say: 'So ∠BFD is a right angle — and ∠BFC + ∠CFD = 90 makes that pair complementary.', math: '59 + 31 = 90' },
    ],
    misconceptions: clsMis([
      { pick: 'acute', tag: 'boundary-90', msg: 'Acute is strictly LESS than 90°. The square mark means exactly 90°.' },
      { pick: 'obtuse', tag: 'boundary-90', msg: 'Obtuse is strictly MORE than 90°. The square mark means exactly 90°.' },
      { pick: 'straight', tag: 'misclassified', msg: 'Straight is 180° — a line. The square mark means 90°.' },
    ]),
  }),
  card({
    id: 'cls-03', src: '§0 classification: obtuse', tier: 1, par: 20, skills: ['CLASS'],
    stem: 'In the figure, {m BFE} = 121°. Classify {ang BFE}.',
    figure: F1([{ angle: ['B', 'E'], text: '121°' }]),
    parts: [classify('121', 'obtuse')],
    hints: [
      'Compare the measure with 90° and 180°.',
      'It is bigger than a right angle.',
      'But smaller than a straight angle.',
    ],
    solution: [
      { say: 'Obtuse: 90° < m < 180°.', math: '90 < 121 < 180' },
      { say: 'So ∠BFE is obtuse.', math: '{ang BFE} is obtuse' },
    ],
    misconceptions: clsMis([
      { pick: 'straight', tag: 'misclassified', msg: 'Straight is exactly 180°. 121° is between 90° and 180°.' },
      { pick: 'acute', tag: 'misclassified', msg: 'Acute is LESS than 90°. 121° is more than 90°.' },
    ]),
  }),
  card({
    id: 'cls-04', src: '§0 classification: straight', tier: 1, par: 20, skills: ['CLASS'],
    stem: 'In the figure, A, F and D are collinear with F between A and D. Classify {ang AFD}.',
    figure: F1(),
    parts: [classify('180', 'straight')],
    hints: [
      'The two sides of this angle are {ray FA} and {ray FD}.',
      'Those two rays are opposite rays — together they make a line.',
      'A line is a half turn.',
    ],
    solution: [
      { say: 'Straight: exactly 180°. Opposite rays form a straight angle.', math: '{m AFD} = 180°' },
      { say: 'So ∠AFD is straight — and any two adjacent angles that fill it form a linear pair.', math: '{m AFC} + {m CFD} = 149 + 31 = 180' },
    ],
    misconceptions: clsMis([
      { pick: 'obtuse', tag: 'boundary-180', msg: 'Obtuse is strictly LESS than 180°. Opposite rays make exactly 180°.' },
      { pick: 'right', tag: 'misclassified', msg: 'Right is 90° — a quarter turn. A line is a half turn: 180°.' },
    ]),
  }),
];

/* ───────────────────────────── export ───────────────────────────── */

/** All 55 M1 cards in sheet order (matches data/sheets.js VOC tab). */
export const cards = Object.freeze([...VOC, ...NOT, ...DEF, ...FACT, ...CLS].map(Object.freeze));

export const M1_IDS = Object.freeze(cards.map(c => c.id));

export default cards;
