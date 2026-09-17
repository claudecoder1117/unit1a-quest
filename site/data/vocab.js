// data/vocab.js — the 23 §0 vocabulary terms (content/SOURCE.md §0, the content authority).
//
// Fields per term:
//   id          card id (voc-01..23, §0 order)
//   key         slug used by cards, generators (T-vocab) and the cheat sheet
//   term        display form (lowercase; the UI capitalises where needed)
//   def         the definition VERBATIM from SOURCE.md §0 ("Standard definitions" / notation bullets).
//               `derived:true` marks the two terms §0 defines only inside another bullet (side, vertex).
//   ask         the definition as shown when the student must PRODUCE the term (def → term, termmatch):
//               identical to `def` unless `def` contains the term itself (line, plane, complement, supplement).
//   aliases     every typed answer accepted by the `term` grader (lowercased, non-letters stripped by T05;
//               Damerau ≤ 1 for words ≥ 6 letters is on top of this list)
//   group       confusable group id (see `groups`); `confusable` = ≥ 3 term keys whose definitions are the
//               mc distractors for this term (S2: complement/supplement, ray/segment, adjacent/linear pair,
//               collinear/coplanar are the seed groups; the rest are filled so every term has 3)
//   example     one concrete instance, mini-markup (figure F1 / doc #5 letters)
//   hints       [H1 relationship, H2 discriminator, H3 one step from the end] — never the answer
//   note        a fact that rides with the definition (shown in solutions)
//   symbol      notation for the object, if it has one (mini-markup)

export const groups = Object.freeze({
  plp:    { id: 'plp',    label: 'point / line / plane' },
  place:  { id: 'place',  label: 'collinear / coplanar' },
  pieces: { id: 'pieces', label: 'segment / ray / opposite rays' },
  parts:  { id: 'parts',  label: 'angle / side / vertex' },
  types:  { id: 'types',  label: 'acute / right / obtuse / straight' },
  sums:   { id: 'sums',   label: 'complementary / supplementary / complement / supplement' },
  pairs:  { id: 'pairs',  label: 'adjacent / linear pair / vertical angles / angle bisector' },
});

export const vocab = Object.freeze([
  {
    id: 'voc-01', key: 'point', term: 'point',
    def: 'a location, no size',
    aliases: ['point', 'a point'],
    group: 'plp', confusable: ['line', 'plane', 'vertex'],
    example: 'F is a point — the place where {line AD} and {line EC} cross.',
    hints: [
      'The most basic object in geometry: it has a position and nothing else.',
      'It is not a line, a plane or a vertex — those are built from these, or are special cases of one.',
      'Named with a single capital letter, like F.',
    ],
    symbol: 'a capital letter: F',
  },
  {
    id: 'voc-02', key: 'line', term: 'line',
    def: 'straight, extends forever in both directions, contains infinitely many points; through any two points there is exactly one line',
    ask: 'straight, extends forever in both directions, contains infinitely many points',
    aliases: ['line', 'a line', 'straight line'],
    group: 'plp', confusable: ['segment', 'ray', 'plane'],
    example: '{line AD} passes through A, F and D and keeps going both ways.',
    hints: [
      'A straight object made of points.',
      'Unlike a segment or a ray it has no endpoint at all.',
      'Its symbol is two letters with a double arrow over them.',
    ],
    note: 'through any two points there is exactly one line',
    symbol: '{line AD}',
  },
  {
    id: 'voc-03', key: 'plane', term: 'plane',
    def: 'flat surface extending forever in all directions; through any three non-collinear points there is exactly one plane',
    ask: 'flat surface extending forever in all directions',
    aliases: ['plane', 'a plane'],
    group: 'plp', confusable: ['line', 'point', 'segment'],
    example: 'The page holding the whole figure is a plane; name it by three non-collinear points, plane ABF.',
    hints: [
      'A flat object, not a straight one.',
      'It extends forever in every direction, like an endless tabletop.',
      'Named by a capital script letter or by three non-collinear points.',
    ],
    note: 'through any three non-collinear points there is exactly one plane',
    symbol: 'plane ABF or a script letter',
  },
  {
    id: 'voc-04', key: 'collinear', term: 'collinear',
    def: 'points on the same line',
    aliases: ['collinear', 'colinear', 'collinear points'],
    group: 'place', confusable: ['coplanar', 'line', 'plane'],
    example: 'A, F and D are collinear — all three sit on {line AD}.',
    hints: [
      'An adjective describing several points at once.',
      'Same LINE — not same plane (that is the other word).',
      'co- means together; the rest of the word names the object they share.',
    ],
  },
  {
    id: 'voc-05', key: 'coplanar', term: 'coplanar',
    def: 'points/lines in the same plane',
    aliases: ['coplanar', 'coplanar points', 'co-planar'],
    group: 'place', confusable: ['collinear', 'plane', 'line'],
    example: 'A, B, C, D, E and F all lie in the plane of the page, so they are coplanar.',
    hints: [
      'An adjective describing points or lines together.',
      'Same PLANE — not same line.',
      'co- means together; the rest of the word names the flat object they share.',
    ],
  },
  {
    id: 'voc-06', key: 'segment', term: 'segment',
    def: 'part of a line with two endpoints',
    aliases: ['segment', 'line segment', 'a segment'],
    group: 'pieces', confusable: ['ray', 'line', 'opposite-rays'],
    example: '{seg FD} has two endpoints, F and D; FD with no bar is its length, a number.',
    hints: [
      'A piece of a line.',
      'It stops at BOTH ends — a ray stops at only one.',
      'Its symbol has a plain bar over the two letters.',
    ],
    symbol: '{seg FD}',
  },
  {
    id: 'voc-07', key: 'ray', term: 'ray',
    def: 'part of a line with one endpoint, extends forever one way',
    aliases: ['ray', 'a ray'],
    group: 'pieces', confusable: ['segment', 'line', 'opposite-rays'],
    example: '{ray FB} starts at F, passes through B and never ends.',
    hints: [
      'A piece of a line.',
      'One endpoint (a segment has two) and it never ends on the other side.',
      'Its symbol has an arrow over the letters, and the endpoint is written first.',
    ],
    symbol: '{ray FB}',
  },
  {
    id: 'voc-08', key: 'opposite-rays', term: 'opposite rays',
    def: 'two rays with a common endpoint that form a line',
    aliases: ['opposite rays', 'opposite ray', 'opposite'],
    group: 'pieces', confusable: ['ray', 'linear-pair', 'segment'],
    example: '{ray FA} and {ray FD} share endpoint F and together make {line AD}.',
    hints: [
      'Two rays in a special relationship.',
      'Same endpoint, pointing in exactly opposite directions.',
      'Put the two together and you get a whole line.',
    ],
    note: 'the non-common sides of a linear pair are opposite rays',
  },
  {
    id: 'voc-09', key: 'angle', term: 'angle',
    def: 'two rays (sides) with a common endpoint (vertex)',
    aliases: ['angle', 'an angle'],
    group: 'parts', confusable: ['side', 'vertex', 'ray'],
    example: '{ang BFC} is formed by {ray FB} and {ray FC}, which share endpoint F.',
    hints: [
      'A figure built from two rays.',
      'The two rays must share their endpoint.',
      'Its symbol is ∠ followed by three letters, vertex in the middle.',
    ],
    symbol: '{ang BFC}',
  },
  {
    id: 'voc-10', key: 'side', term: 'side',
    def: 'one of the two rays that form an angle',
    derived: true,
    aliases: ['side', 'sides', 'side of an angle', 'side of the angle'],
    group: 'parts', confusable: ['vertex', 'ray', 'angle'],
    example: '{ray FB} and {ray FC} are the sides of {ang BFC}.',
    hints: [
      'A part of an angle — every angle has two of them.',
      'Not the shared endpoint: the rays themselves.',
      'In {ang BFC}, {ray FB} is one of these.',
    ],
    note: '§0: "Angle: two rays (sides) with a common endpoint (vertex)"',
  },
  {
    id: 'voc-11', key: 'vertex', term: 'vertex',
    def: 'the common endpoint of the two rays (sides) of an angle',
    derived: true,
    aliases: ['vertex', 'vertices', 'the vertex'],
    group: 'parts', confusable: ['side', 'point', 'angle'],
    example: 'F is the vertex of {ang BFC} — the middle letter in its name.',
    hints: [
      'A part of an angle — every angle has exactly one.',
      'The point the two rays share, not the rays.',
      'It is always the middle letter in the angle’s name.',
    ],
    note: '§0: "Angle: two rays (sides) with a common endpoint (vertex)"; the vertex is the middle letter of ∠ABC',
  },
  {
    id: 'voc-12', key: 'acute', term: 'acute',
    def: '0° < m < 90°',
    aliases: ['acute', 'acute angle', 'an acute angle'],
    group: 'types', confusable: ['obtuse', 'right', 'straight'],
    example: '{m CFD} = 31°, so {ang CFD} is acute.',
    hints: [
      'A type of angle, classified by its measure.',
      'Smaller than a right angle, but not zero.',
      'Strictly between 0° and 90° — 31° is one.',
    ],
  },
  {
    id: 'voc-13', key: 'straight', term: 'straight',
    def: 'exactly 180°',
    aliases: ['straight', 'straight angle', 'a straight angle'],
    group: 'types', confusable: ['right', 'obtuse', 'acute'],
    example: '{ang AFD} is a straight angle: A, F, D are collinear, so {m AFD} = 180°.',
    hints: [
      'A type of angle, classified by its measure.',
      'Its two sides are opposite rays.',
      'It looks exactly like a line: half a full turn.',
    ],
  },
  {
    id: 'voc-14', key: 'right', term: 'right',
    def: 'exactly 90°',
    aliases: ['right', 'right angle', 'a right angle'],
    group: 'types', confusable: ['straight', 'acute', 'obtuse'],
    example: '{ray FB} is perpendicular to {line AD}, so {m BFD} = 90° \u2014 the small square marks it.',
    hints: [
      'A type of angle, classified by its measure.',
      'Exactly one measure qualifies, and it gets a small square mark in figures.',
      'A quarter turn — the corner of a page.',
    ],
  },
  {
    id: 'voc-15', key: 'obtuse', term: 'obtuse',
    def: '90° < m < 180°',
    aliases: ['obtuse', 'obtuse angle', 'an obtuse angle'],
    group: 'types', confusable: ['acute', 'straight', 'right'],
    example: '{m BFE} = 121°, so {ang BFE} is obtuse.',
    hints: [
      'A type of angle, classified by its measure.',
      'Bigger than a right angle but less than a straight one.',
      'Strictly between 90° and 180° — 121° is one.',
    ],
  },
  {
    id: 'voc-16', key: 'angle-bisector', term: 'angle bisector',
    def: 'a ray that divides an angle into two congruent angles',
    aliases: ['angle bisector', 'bisector', 'anglebisector', 'an angle bisector'],
    group: 'pairs', confusable: ['linear-pair', 'vertical-angles', 'adjacent'],
    example: 'In doc #5, {ray BD} bisects {ang ABC} because {m ABD} = {m DBC} = 81°.',
    hints: [
      'A ray with a job to do inside an angle.',
      'It cuts the angle, and the two pieces are congruent (equal measures).',
      'bi- means two, -sect means cut.',
    ],
  },
  {
    id: 'voc-17', key: 'complementary', term: 'complementary',
    def: 'two angles whose measures sum to 90°',
    aliases: ['complementary', 'complementary angles', 'complimentary'],
    group: 'sums', confusable: ['supplementary', 'complement', 'adjacent'],
    example: '{ang BFC} and {ang CFD}: 59° + 31° = 90°, so they are complementary.',
    hints: [
      'A relationship between TWO angles (an adjective).',
      'Their measures add to 90°, not 180°.',
      'C for Corner: two angles that together fill a right angle.',
    ],
    note: 'complement of x = 90 − x',
  },
  {
    id: 'voc-18', key: 'supplementary', term: 'supplementary',
    def: 'two angles whose measures sum to 180°',
    aliases: ['supplementary', 'supplementary angles', 'supplimentary'],
    group: 'sums', confusable: ['complementary', 'supplement', 'linear-pair'],
    example: '{ang AFC} and {ang CFD}: 149° + 31° = 180°, so they are supplementary.',
    hints: [
      'A relationship between TWO angles (an adjective).',
      'Their measures add to 180°, not 90°.',
      'S for Straight: two angles that together fill a straight angle.',
    ],
    note: 'supplement of x = 180 − x; a linear pair is always supplementary',
  },
  {
    id: 'voc-19', key: 'complement', term: 'complement',
    def: 'Complement of x = 90 − x',
    ask: 'the angle that pairs with x to make 90°; it equals 90 − x',
    aliases: ['complement', 'compliment', 'the complement'],
    group: 'sums', confusable: ['supplement', 'complementary', 'supplementary'],
    example: 'The complement of 31° is 90 − 31 = 59°.',
    hints: [
      'A noun: ONE angle measure, computed from x.',
      '90 − x, not 180 − x.',
      'Its adjective form ends in -ary and pairs with 90°.',
    ],
  },
  {
    id: 'voc-20', key: 'supplement', term: 'supplement',
    def: 'Supplement of x = 180 − x',
    ask: 'the angle that pairs with x to make 180°; it equals 180 − x',
    aliases: ['supplement', 'suppliment', 'the supplement'],
    group: 'sums', confusable: ['complement', 'supplementary', 'complementary'],
    example: 'The supplement of 31° is 180 − 31 = 149°.',
    hints: [
      'A noun: ONE angle measure, computed from x.',
      '180 − x, not 90 − x.',
      'Its adjective form ends in -ary and pairs with 180°.',
    ],
  },
  {
    id: 'voc-21', key: 'adjacent', term: 'adjacent',
    def: 'two angles that share a vertex and a side but no interior points',
    aliases: ['adjacent', 'adjacent angles', 'adjacent angle'],
    group: 'pairs', confusable: ['linear-pair', 'vertical-angles', 'complementary'],
    example: '{ang BFC} and {ang CFD} share vertex F and side {ray FC} — they are adjacent.',
    hints: [
      'A relationship between two angles that touch.',
      'Shared vertex AND shared side, but no overlap — nothing is said about their sum.',
      'In everyday English the word means "next to".',
    ],
  },
  {
    id: 'voc-22', key: 'linear-pair', term: 'linear pair',
    def: 'two adjacent angles whose non-common sides are opposite rays (they are supplementary)',
    aliases: ['linear pair', 'linear pairs', 'a linear pair', 'linearpair'],
    group: 'pairs', confusable: ['adjacent', 'vertical-angles', 'supplementary'],
    example: '{ang AFC} and {ang CFD}: adjacent, and {ray FA}, {ray FD} are opposite rays — a linear pair.',
    hints: [
      'Two adjacent angles with something extra.',
      'The non-shared sides are opposite rays, so the two angles add to 180°.',
      'Together the two angles look like a line — the name says so.',
    ],
    note: 'every linear pair is supplementary; not every supplementary pair is a linear pair',
  },
  {
    id: 'voc-23', key: 'vertical-angles', term: 'vertical angles',
    def: 'two non-adjacent angles formed by two intersecting lines (they are congruent)',
    aliases: ['vertical angles', 'vertical', 'vertical angle', 'vertical pair', 'verticle angles'],
    group: 'pairs', confusable: ['linear-pair', 'adjacent', 'angle-bisector'],
    example: '{ang AFE} and {ang CFD} are vertical angles: {line AD} and {line EC} cross at F, and both measure 31°.',
    hints: [
      'Two angles made by two crossing lines.',
      'They sit across from each other — NOT adjacent — and they are congruent.',
      'Picture the X: the top and bottom angles, or the left and right ones.',
    ],
    note: 'vertical angles are congruent',
  },
].map(v => Object.freeze({ ask: v.def, derived: false, note: null, symbol: null, ...v })));

export const vocabByKey = Object.freeze(Object.fromEntries(vocab.map(v => [v.key, v])));
export const vocabById = Object.freeze(Object.fromEntries(vocab.map(v => [v.id, v])));
export const VOCAB_KEYS = Object.freeze(vocab.map(v => v.key));

/** Every canonical term, display form — pass as `ctx.terms` to js/grader/term.js so a wrong answer that IS another term gets a specific line. */
export const TERMS = Object.freeze(vocab.map(v => v.term));

/**
 * The four 6↔6 termmatch sets (S2: `termmatch` (6↔6)). 23 terms → 24 slots, `angle-bisector` repeats.
 * A voc card's termmatch part is the set that contains its term (first match).
 */
export const termmatchSets = Object.freeze([
  { id: 'tm-1', name: 'Points, lines, planes', keys: ['point', 'line', 'plane', 'collinear', 'coplanar', 'segment'] },
  { id: 'tm-2', name: 'Rays and angles',        keys: ['ray', 'opposite-rays', 'angle', 'side', 'vertex', 'angle-bisector'] },
  { id: 'tm-3', name: 'Angle types and sums',   keys: ['acute', 'right', 'obtuse', 'straight', 'complementary', 'supplementary'] },
  { id: 'tm-4', name: 'Angle pairs',            keys: ['complement', 'supplement', 'adjacent', 'linear-pair', 'vertical-angles', 'angle-bisector'] },
].map(s => Object.freeze({ ...s, keys: Object.freeze(s.keys) })));

/** Term keys confusable with `key` (the mc distractor sources), in authored order. */
export function confusables(key) {
  return vocabByKey[key]?.confusable ?? [];
}

export default vocab;
