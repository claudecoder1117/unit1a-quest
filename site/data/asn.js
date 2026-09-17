// site/data/asn.js — ASN reason bank (ticket T06d; COMPOSED S2 "ASN reason bank", S3 `asn` part).
//
// One reason per in-scope Always/Sometimes/Never statement (asn-01..36 from SOURCE §4,
// qz-01..18 from SOURCE §5) plus two distractors each: same length, same nouns, wrong logic.
// The reason is the line shown after every verdict; reason + distractors are the three chips
// asked on a wrong verdict (setting askReasonOnMiss) or in "Full 36". Distractors are never a
// valid justification of the correct letter — each one argues for a different letter or rests
// on a false fact, so the correct chip is unambiguous.
//
// Bonus statements (bonus-01..33, out of Unit 1A scope) get a one-line reason only, no chips.
//
// Pure data module: no DOM, no imports, no randomness. Cards copy from here (site/data/cards/asn.js).

export const REASONS = {
  // ---- SOURCE §4: "Points lines planes angles A, S, N" (36) --------------------------------
  'asn-01': {
    reason: 'It could be right (exactly 90°) or obtuse — acute means less than 90°, not less than 180°.',
    distractors: [
      'Every angle under 180° is acute — acute just means it is not a straight angle.',
      'Any angle under 180° is obtuse, never acute — obtuse means less than 180°.',
    ],
  },
  'asn-02': {
    reason: 'Congruent means equal measures: 100° and 100° are congruent, 100° and 120° are not.',
    distractors: [
      'All obtuse angles are between 90° and 180°, so any two of them are congruent.',
      'Two obtuse angles can never have the same measure, so they are never congruent.',
    ],
  },
  'asn-03': {
    reason: 'Two planes meet in a whole line or not at all — never in a single point.',
    distractors: [
      'Two planes meet in a single point whenever they are perpendicular to each other.',
      'Two planes meet in a single point when their edges touch at just one corner.',
    ],
  },
  'asn-04': {
    reason: 'A line meets a plane at 0 points, at 1 point, or lies in it (infinitely many) — never exactly 2.',
    distractors: [
      'A line meets a plane at exactly 2 points: once going in and once coming out.',
      'A line meets a plane at exactly 2 points whenever it is tilted, not perpendicular.',
    ],
  },
  'asn-05': {
    reason: 'Through any two points there is exactly one line (postulate) — so a line can always be drawn.',
    distractors: [
      'Two points fix a line only when they are far enough apart to draw one through.',
      'A line needs at least three points, so two points alone are not enough to draw one.',
    ],
  },
  'asn-06': {
    reason: '40° + 40° = 80° is acute, 60° + 60° = 120° is obtuse, 45° + 45° = 90° is right.',
    distractors: [
      'Two acute angles always add to more than 90°, so their sum is always obtuse.',
      'Two acute angles always add to less than 90°, so their sum is always acute.',
    ],
  },
  'asn-07': {
    reason: "Four points can be coplanar (a square's corners) or not (a tetrahedron's corners).",
    distractors: [
      'Any four points are coplanar, because any three of them already fix a plane.',
      'Four points are never coplanar, because a plane is named by exactly three points.',
    ],
  },
  'asn-08': {
    reason: 'Three lines can be concurrent (all through one point) or form a triangle (three crossings).',
    distractors: [
      'Three lines always meet at one shared point, because any two lines must cross.',
      'Three lines can never all pass through one point — at most two lines can meet there.',
    ],
  },
  'asn-09': {
    reason: 'Perpendicular lines meet (at a right angle), and two distinct lines meet in at most one point.',
    distractors: [
      'Perpendicular lines meet at one point only when both lines are horizontal or vertical.',
      'Perpendicular lines meet at two points, one on each side of the right angle.',
    ],
  },
  'asn-10': {
    reason: 'Obtuse means more than 90°, and a right angle is exactly 90°.',
    distractors: [
      'An obtuse angle beats a right angle only when the obtuse angle is more than 180°.',
      'An obtuse angle is between 0° and 90°, so it is always smaller than a right angle.',
    ],
  },
  'asn-11': {
    reason: 'Parallel planes never meet; any two planes that are not parallel meet in a line.',
    distractors: [
      'Any two planes always meet, because planes extend forever in every direction.',
      'Two planes can never meet, because each plane is perfectly flat.',
    ],
  },
  'asn-12': {
    reason: 'Vertical angles are congruent and share a vertex; two 40° angles in different places do not.',
    distractors: [
      'Congruent angles always share a vertex, because congruent means they sit in the same spot.',
      'Congruent angles never share a vertex, because two angles at one vertex must differ.',
    ],
  },
  'asn-13': {
    reason: 'Two acute angles add to less than 180°; two obtuse angles add to more than 180°.',
    distractors: [
      'Two acute angles add to more than 180° when both are close to 90°.',
      'Two obtuse angles add to less than 180° when both are close to 90°.',
    ],
  },
  'asn-14': {
    reason: 'A plane contains infinitely many points, so it certainly contains 3 of them.',
    distractors: [
      'A plane contains 3 points only when those points are not collinear.',
      'A plane contains exactly 3 points — the three points that name it.',
    ],
  },
  'asn-15': {
    reason: 'A line can pierce a plane at one point, lie inside the plane, or miss it entirely.',
    distractors: [
      'A line always pierces a plane at exactly one point, because a line extends forever.',
      'A line never meets a plane at just one point — it lies in the plane or misses it.',
    ],
  },
  'asn-16': {
    reason: 'x > 90 − x only when x > 45: 60° beats its complement 30°, but 30° loses to 60°.',
    distractors: [
      'An angle is always bigger than its complement, because the complement is the leftover part.',
      'An angle is never bigger than its complement, because the two only add up to 90°.',
    ],
  },
  'asn-17': {
    reason: 'Two distinct lines meet in at most one point — perpendicular or not.',
    distractors: [
      'Perpendicular lines meet at 2 points once they are extended far enough.',
      'Perpendicular lines meet at 2 points, one for each pair of right angles.',
    ],
  },
  'asn-18': {
    reason: 'Every right angle is exactly 90°, so any two right angles have equal measures.',
    distractors: [
      'Two right angles are congruent only when they are adjacent to each other.',
      'Two right angles are congruent only when their sides have the same length.',
    ],
  },
  'asn-19': {
    reason: 'Intersecting planes share a whole line, which holds infinitely many points.',
    distractors: [
      'Intersecting planes share exactly one point, the point where they cross.',
      'Intersecting planes share exactly one point when they are perpendicular.',
    ],
  },
  'asn-20': {
    reason: '180 − x is always 90 more than 90 − x — the supplement wins for every angle.',
    distractors: [
      'The supplement is bigger only when the angle is more than 45°.',
      'The complement is bigger, because 90° is closer to an acute angle than 180° is.',
    ],
  },
  'asn-21': {
    reason: '50° + 50° = 100° is more than 90°, but 20° + 30° = 50° is less.',
    distractors: [
      'Two acute angles always add to more than 90°, since each one is under 90°.',
      'Two acute angles always add to less than 90°, since each one is under 90°.',
    ],
  },
  'asn-22': {
    reason: 'Parallel planes share no point; intersecting planes share a whole line of points.',
    distractors: [
      'Any two planes always share at least one point, since planes extend forever.',
      'Two planes never share a point unless they are the very same plane.',
    ],
  },
  'asn-23': {
    reason: 'Same complement means 90 − a = 90 − b, so a = b — the angles would be congruent.',
    distractors: [
      'Two different angles can have the same complement as long as both are acute.',
      'Non-congruent angles have the same complement only when they are adjacent.',
    ],
  },
  'asn-24': {
    reason: 'The x, y and z axes all pass through the origin and do not lie in one plane.',
    distractors: [
      'Three lines through one point must lie in one plane, since a point and a line fix a plane.',
      'Three lines through one point leave a plane only when all three are perpendicular.',
    ],
  },
  'asn-25': {
    reason: 'Adjacent angles share a vertex and a side by definition.',
    distractors: [
      'Adjacent angles share a side but can have two different vertices.',
      'Adjacent angles share a vertex only when they form a linear pair.',
    ],
  },
  'asn-26': {
    reason: 'Vertical angles are congruent but not adjacent; the two halves of a bisected angle are both.',
    distractors: [
      'Congruent angles are always adjacent, because congruent means side by side.',
      'Congruent angles are never adjacent, because adjacent angles must have different measures.',
    ],
  },
  'asn-27': {
    reason: 'Parallel planes never meet, so there is no point in both.',
    distractors: [
      'Parallel planes share the one point where they come closest together.',
      'Parallel planes share a point only when both planes are vertical.',
    ],
  },
  'asn-28': {
    reason: 'Points on one line are collinear by definition — a line cannot hold non-collinear points.',
    distractors: [
      'A line can hold 4 non-collinear points if the line is long enough.',
      'A line holds only 2 points, so it can never contain 4 points at all.',
    ],
  },
  'asn-29': {
    reason: 'x = 180 − x forces x = 90, and 90° is right, not acute.',
    distractors: [
      'An acute angle equals its supplement when the angle is exactly 45°.',
      'An acute angle and its supplement are congruent whenever both are under 90°.',
    ],
  },
  'asn-30': {
    reason: 'x < 180 − x only when x < 90: an acute angle loses to its supplement, an obtuse angle beats it.',
    distractors: [
      'An angle is always less than its supplement, because the supplement is the bigger leftover.',
      'An angle is never less than its supplement, because the two only add up to 180°.',
    ],
  },
  'asn-31': {
    reason: 'They can be coplanar, or sit like the three long edges of a triangular prism.',
    distractors: [
      'Three parallel lines are always coplanar, since two parallel lines fix a plane.',
      'Three parallel lines are never coplanar, since a plane holds only two parallel lines.',
    ],
  },
  'asn-32': {
    reason: 'Non-parallel lines in one plane must meet; skew lines are non-parallel and never meet.',
    distractors: [
      'Non-parallel lines always cross, since they are not going the same way.',
      'Non-parallel lines never cross, since only parallel lines can share a plane.',
    ],
  },
  'asn-33': {
    reason: 'Their intersection is a line, and a line contains infinitely many points.',
    distractors: [
      'Intersecting planes share infinitely many points only when they are perpendicular.',
      'Intersecting planes share exactly one point, so the number is finite.',
    ],
  },
  'asn-34': {
    reason: 'The supplement of 90° is 180 − 90 = 90°, so both angles are right angles.',
    distractors: [
      'A right angle and its supplement are congruent only when they are adjacent.',
      'The supplement of a right angle is 0°, so the two can never be congruent.',
    ],
  },
  'asn-35': {
    reason: 'Two lines can be parallel, skew, or meet in exactly one point.',
    distractors: [
      'Two distinct lines always meet at exactly one point somewhere.',
      'Two lines never meet at just one point — they overlap completely or not at all.',
    ],
  },
  'asn-36': {
    reason: 'x = 90 − x only when x = 45 — both angles must be 45°.',
    distractors: [
      'An angle and its complement are always congruent, since they split 90° evenly.',
      'An angle and its complement are never congruent, since one must be bigger.',
    ],
  },

  // ---- SOURCE §5: Quizlet in-scope extras (18) --------------------------------------------
  'qz-01': {
    reason: 'Through any two points there is exactly one line — never more.',
    distractors: [
      'Two points can be joined by many lines when they are far enough apart.',
      'Two points can be joined by two lines, one drawn in each direction.',
    ],
  },
  'qz-02': {
    reason: 'Intersecting planes meet in a whole line, not a segment — planes have no edges.',
    distractors: [
      'Intersecting planes meet in a segment, because the intersection has two endpoints.',
      'Intersecting planes meet in a segment only when they are perpendicular.',
    ],
  },
  'qz-03': {
    reason: 'A point off a line fixes a plane with it; a point on the line lies in every plane through it.',
    distractors: [
      'A line and a point are coplanar only if the point lies on the line.',
      'A line and a point are coplanar only when the point is close to the line.',
    ],
  },
  'qz-04': {
    reason: 'A ray lies in a line; two lines are coplanar unless they are skew — so not always.',
    distractors: [
      'A line and a ray are always coplanar, because any two straight objects share a plane.',
      'A line and a ray are never coplanar, because a ray has an endpoint and a line does not.',
    ],
  },
  'qz-05': {
    reason: 'They are the same ray only if B and C lie on the same side of A.',
    distractors: [
      'They are always the same ray, because both rays start at the endpoint A.',
      'They are never the same ray, because they are named with different letters.',
    ],
  },
  'qz-06': {
    reason: 'One point, or the line lies in the plane, or they never meet at all.',
    distractors: [
      'A line always pierces a plane at exactly one point, since a line goes on forever.',
      'A line never meets a plane at just one point — it lies in it or misses it.',
    ],
  },
  'qz-07': {
    reason: 'Three points can be collinear or can form a triangle.',
    distractors: [
      'Three points are always collinear, because two of them already fix a line.',
      'Three points are never collinear, because three points fix a plane instead.',
    ],
  },
  'qz-08': {
    reason: 'Opposite rays share one endpoint; ray XY starts at X and ray YX starts at Y.',
    distractors: [
      'Ray XY and ray YX are opposite because they point in opposite directions.',
      'Ray XY and ray YX are opposite rays only when XY is drawn as a segment.',
    ],
  },
  'qz-09': {
    reason: "Infinitely many planes turn around a line, like pages around a book's spine.",
    distractors: [
      'A line lies in exactly one plane — the plane it is drawn on.',
      'A line lies in infinitely many planes only if the line is horizontal.',
    ],
  },
  'qz-10': {
    reason: 'In one plane yes, but skew lines are not parallel and never meet.',
    distractors: [
      'Non-parallel lines always intersect, because they are not going the same way.',
      'Non-parallel lines never intersect, because only coplanar lines can cross.',
    ],
  },
  'qz-11': {
    reason: 'Only if both are 45°: 30° and 60° are complementary and adjacent but not congruent.',
    distractors: [
      'Complementary adjacent angles are always congruent, since they split 90° evenly.',
      'Complementary angles are never congruent, since one of them must be larger.',
    ],
  },
  'qz-12': {
    reason: 'Every line lies in a plane, so its points are always coplanar.',
    distractors: [
      'A line can hold four non-coplanar points if the line is not drawn in a plane.',
      'A line can hold at most three points, so it can never contain four.',
    ],
  },
  'qz-13': {
    reason: '180 − (less than 90) is more than 90, so the supplement is obtuse.',
    distractors: [
      'The supplement of an acute angle is obtuse only when the angle is under 45°.',
      'The supplement of an acute angle is acute, since an angle and its supplement match.',
    ],
  },
  'qz-14': {
    reason: 'Vertical angles are congruent; they add to 180° only when both are 90°.',
    distractors: [
      'Vertical angles are always supplementary, because they lie along a straight line.',
      'Vertical angles are never supplementary, because congruent angles cannot add to 180°.',
    ],
  },
  'qz-15': {
    reason: 'Congruent supplementary angles are each 90°, and the complement of 90° is 0°, not 45°.',
    distractors: [
      'Congruent supplementary angles are each 45°, and 90 − 45 = 45.',
      'The complements are 45° only when the two angles are also adjacent.',
    ],
  },
  'qz-16': {
    reason: 'Vertical angles are congruent; they add to 90° only when both are 45°.',
    distractors: [
      'Vertical angles are always complementary, because they share a vertex.',
      'Vertical angles are never complementary, because congruent angles cannot add to 90°.',
    ],
  },
  'qz-17': {
    reason: 'Two positive measures adding to 90° must each be less than 90°.',
    distractors: [
      'Complementary angles are each acute only when they are adjacent.',
      'Complementary angles are each acute only when both measure 45°.',
    ],
  },
  'qz-18': {
    reason: '180 − (less than 90) is more than 90, so the supplement is obtuse.',
    distractors: [
      'The supplement of an acute angle is acute when the angle is more than 45°.',
      'The supplement of an acute angle is always acute, since an angle and its supplement match.',
    ],
  },
};

// Bonus bank (SOURCE §5 out-of-scope: triangles, parallel & skew lines). Reason line only —
// S2: "no reasons, no weight" for chips; the line is still shown after the verdict so a miss teaches.
export const BONUS_REASONS = {
  'bonus-01': 'Two obtuse angles would sum to more than 180°, so an obtuse triangle has exactly one.',
  'bonus-02': 'A 3-4-5 right triangle is scalene; a 45-45-90 right triangle is isosceles.',
  'bonus-03': 'Legs 5, 5 with base 8: leg shorter. Legs 5, 5 with base 2: leg longer.',
  'bonus-04': 'Two sides and the included angle is SAS — a congruence postulate.',
  'bonus-05': 'AB ≅ BC makes the angles opposite them congruent (∠C ≅ ∠A); ∠A ≅ ∠B needs an equilateral triangle.',
  'bonus-06': 'An equilateral triangle has three 60° angles — no 90° angle is possible.',
  'bonus-07': 'A 50-60-70 triangle is scalene and acute; a 30-60-90 triangle is scalene with a right angle.',
  'bonus-08': 'A 120-30-30 triangle is isosceles and obtuse; a 40-70-70 triangle is isosceles and acute.',
  'bonus-09': 'Base 2 with legs 5: base shorter. Base 8 with legs 5: base longer.',
  'bonus-10': '∠A ≅ ∠B makes the sides opposite them congruent (BC ≅ AC); AB ≅ BC needs an equilateral triangle.',
  'bonus-11': 'Only when the angle is included (SAS); SSA can produce two different triangles.',
  'bonus-12': 'Two legs give SAS with the right angle; a leg and the hypotenuse give HL — congruent either way.',
  'bonus-13': 'Congruent triangles have matching angles; 90° cannot match an angle over 90°.',
  'bonus-14': 'Three equal angles give three equal sides, and two equal sides already make it isosceles.',
  'bonus-15': 'It beats the two remote interior angles, but it is smaller than an obtuse adjacent angle.',
  'bonus-16': 'Every exterior angle is the sum of two remote interior angles, so it beats any single base angle.',
  'bonus-17': 'Skew lines are non-coplanar; parallel lines are coplanar.',
  'bonus-18': 'Parallel lines are, by definition, coplanar lines that never meet.',
  'bonus-19': 'They never meet: parallel if they run the same way, skew if they run crosswise.',
  'bonus-20': 'Both lines lie in the floor plane, so they are coplanar — skew lines never are.',
  'bonus-21': 'A plane through the line can be parallel to the given plane or tilt and cut it.',
  'bonus-22': 'Two lines parallel to the floor can be parallel, intersecting, or skew (on different walls).',
  'bonus-23': 'Parallelism of lines is transitive, in a plane or in space.',
  'bonus-24': 'Two walls parallel to a pole can be parallel or meet in an edge parallel to the pole.',
  'bonus-25': 'Skew lines do not intersect by definition.',
  'bonus-26': 'Parallelism of planes is transitive.',
  'bonus-27': 'In a plane yes; in space the x- and y-axes are both perpendicular to the z-axis yet meet.',
  'bonus-28': 'Two lines each skew to a third can be parallel, intersecting, or skew (edges of a box).',
  'bonus-29': 'Every line through the point in the parallel plane through that point works — infinitely many.',
  'bonus-30': 'In their plane a transversal cuts both; a line from outside can cross one and be skew to the other.',
  'bonus-31': 'Angles with parallel sides are congruent or supplementary, depending on the directions.',
  'bonus-32': 'Through a point of t draw the line parallel to m; it and t fix a plane parallel to m.',
  'bonus-33': 'Skew lines have a common perpendicular — the line through their closest points.',
};

/** The 54 in-scope ids in bank order (asn-01..36 then qz-01..18). */
export const REASON_IDS = Object.keys(REASONS);

/**
 * reasonFor(id) → { reason: string, distractors: [string, string] } | null
 * In-scope ids only (asn-*, qz-*). Bonus ids return null — use bonusReasonFor.
 */
export function reasonFor(id) {
  return REASONS[id] ?? null;
}

/** bonusReasonFor(id) → string | null — the one-line reason for a bonus-* statement. */
export function bonusReasonFor(id) {
  return BONUS_REASONS[id] ?? null;
}

/**
 * chipsFor(id) → [{ text, correct }] — the three chips for an in-scope id, correct chip FIRST.
 * Callers shuffle with the seeded rng (js/rng.js); this module never randomises.
 * Returns [] for ids without a chip set (bonus-*, unknown).
 */
export function chipsFor(id) {
  const r = REASONS[id];
  if (!r) return [];
  return [{ text: r.reason, correct: true }, ...r.distractors.map((text) => ({ text, correct: false }))];
}

export default REASONS;
