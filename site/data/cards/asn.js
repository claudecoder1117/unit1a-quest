// site/data/cards/asn.js — Always/Sometimes/Never cards (ticket T06d).
//
// asn-01..36  SOURCE §4  Google Doc "Points lines planes angles A, S, N"   module M9  sheet ASN
// qz-01..18   SOURCE §5  Quizlet 254286132, in-scope extras               module M9  sheet QZ
// bonus-01..33 SOURCE §5  Quizlet out-of-scope (triangles, parallel/skew)   module M13 sheet BONUS
//
// Stems are verbatim from content/SOURCE.md §4/§5 (the content authority). SOURCE abbreviated six
// bonus statements ("2 triangles congruent if 2 sides and included angle...", "If AB≅BC in △ABC then
// ∠BAC≅∠ABC", ...); those are written out as full sentences with the §0 notation markup
// ({seg AB}, {ang ABC}) rendered by js/mathfmt.js — see notes/T06d.md.
//
// Card schema follows COMPOSED S6. Every card: one `asn` part {id:'verdict', type:'asn', answer,
// reason, distractors[2] (bonus: []), disputed?}, hints[3] (H1 fact → H2 example hunt → H3 one step
// from the end, never the letter), solution[] one {say, math?} step. Tier 1, par 20 s (S4).
// Skill split per S2: ASN-PLP / ASN-ANG; bonus cards carry no skill (M13 has none).
//
// Pure data. No DOM, no randomness, no runtime dependencies.

import { REASONS, BONUS_REASONS } from '../asn.js';

const PLP_ASN = new Set([3, 4, 5, 7, 8, 9, 11, 14, 15, 17, 19, 22, 24, 27, 28, 31, 32, 33, 35]);
const PLP_QZ = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12]);

const LETTER = { A: 'Always', S: 'Sometimes', N: 'Never' };

// SOURCE §4 — [n, answer, stem, [H1, H2, H3], solution.say, solution.math?]
const ASN = [
  [1, 'S', 'An angle measuring less than 180 degrees is acute.',
    ['Acute is defined by 90°, not 180°.', 'Test 30°, 90° and 120° — all three are under 180°.', 'Two of those three are not acute; one is.'],
    'Acute means 0° < m < 90°. Angles under 180° include acute ones (30°), the right angle (90°) and obtuse ones (120°), so the statement holds only sometimes.'],
  [2, 'S', 'Two obtuse angles are congruent.',
    ['Congruent means equal measures.', 'Pick two obtuse angles: 100° and 100°, then 100° and 120°.', 'One of those pairs is congruent, one is not.'],
    'Congruent angles have equal measures. 100° and 100° are congruent obtuse angles; 100° and 120° are both obtuse but not congruent — sometimes.'],
  [3, 'N', 'Two planes intersect at only one point.',
    ['Two distinct planes are either parallel or they intersect.', 'Picture two walls meeting at a corner — what shape is the meeting?', 'The meeting is a line, so it cannot be a single point.'],
    'Two distinct planes are parallel (no points in common) or intersect in a line (infinitely many points). A single shared point is impossible — never.'],
  [4, 'N', 'A line and a plane intersect at exactly 2 points.',
    ['Think about how a straight line can relate to a flat surface.', 'Cases: pierce it, lie in it, or miss it.', 'Count the shared points in each case: 1, infinitely many, 0.'],
    'A line and a plane share 0 points (parallel), 1 point (the line pierces the plane) or infinitely many (the line lies in the plane). Exactly 2 is impossible — never.'],
  [5, 'A', 'A line can be drawn through 2 points.',
    ['This is a postulate about points and lines.', 'Through any two points there is exactly one ___.', 'If there is always exactly one, can drawing it ever fail?'],
    'Through any two points there is exactly one line (postulate), so a line can always be drawn — always.'],
  [6, 'S', 'Two adjacent acute angles form an obtuse angle.',
    ['Adjacent angles combine: the new angle is the sum.', 'Try 40° + 40°, then 60° + 60°.', 'One sum is acute, one is obtuse (and 45° + 45° is right).'],
    'Adjacent angles combine into one angle whose measure is the sum. 40° + 40° = 80° (acute), 60° + 60° = 120° (obtuse), 45° + 45° = 90° (right) — sometimes.',
    '40 + 40 = 80, 60 + 60 = 120, 45 + 45 = 90'],
  [7, 'S', 'Four points lie on the same plane.',
    ['Three non-collinear points fix a plane; where can a fourth point go?', "Picture a square's corners, then a pyramid's four corners.", 'One set is coplanar, one is not.'],
    "Three non-collinear points determine a plane; a fourth point may lie in it (a square's corners) or not (a tetrahedron's corners) — sometimes."],
  [8, 'S', 'Three lines intersect at one point.',
    ['Two lines meet in at most one point; a third line may or may not pass through it.', 'Draw three lines through one point, then draw a triangle.', 'Both drawings are three lines — only one has a common point.'],
    'Three lines can be concurrent (all through one point, like spokes), can cross pairwise in three different points (a triangle), or can be parallel — sometimes.'],
  [9, 'A', 'Two perpendicular lines intersect at exactly one point.',
    ['Perpendicular lines intersect by definition (at right angles).', 'How many points can two distinct lines share?', 'They meet, and they cannot meet twice.'],
    'Perpendicular lines intersect (forming right angles), and two distinct lines share at most one point — so exactly one, always.'],
  [10, 'A', 'The measure of an obtuse angle is greater than the measure of a right angle.',
    ['Write the ranges: right = 90°, obtuse = ?', 'Obtuse: 90° < m < 180°.', 'Every number in that range is bigger than 90.'],
    'A right angle is exactly 90°; an obtuse angle is between 90° and 180°. Every obtuse measure exceeds 90 — always.',
    '90 < m < 180'],
  [11, 'S', 'Two planes intersect.',
    ['Two distinct planes: parallel or intersecting.', 'Floor and ceiling vs. floor and wall.', 'One pair never meets, one pair meets in a line.'],
    'Two distinct planes are either parallel (floor and ceiling — no intersection) or intersect in a line (floor and wall) — sometimes.'],
  [12, 'S', 'Two angles that are congruent share the same vertex.',
    ['Congruent is about measure, not position.', 'Vertical angles: congruent and share a vertex. Two 40° angles in different triangles?', 'One example shares a vertex, the other does not.'],
    'Congruent means equal measure, nothing about location. Vertical angles are congruent and share a vertex; two 40° angles on different pages are congruent and do not — sometimes.'],
  [13, 'N', 'The sum of the measures of 2 acute angles is greater than the sum of the measures of 2 obtuse angles.',
    ['Bound each sum: acute < 90°, obtuse > 90°.', 'acute + acute < 90 + 90; obtuse + obtuse > 90 + 90.', 'So the acute sum is below 180 and the obtuse sum is above 180.'],
    'Two acute angles sum to less than 180°; two obtuse angles sum to more than 180°. The acute sum can never exceed the obtuse sum — never.',
    'a₁ + a₂ < 180 < o₁ + o₂'],
  [14, 'A', 'A plane contains 3 points.',
    ['How many points does a plane contain?', 'A plane extends forever — infinitely many points.', 'Infinitely many certainly includes 3.'],
    'A plane contains infinitely many points, so it always contains (at least) 3 — always.'],
  [15, 'S', 'A line and a plane intersect at exactly one point.',
    ['List every way a line can relate to a plane.', 'Pierce it (1 point), lie in it (infinitely many), or parallel (0).', '"Exactly one" is only one of the three cases.'],
    'A line meets a plane in exactly one point when it pierces the plane; but the line can also lie in the plane or be parallel to it — sometimes.'],
  [16, 'S', 'The measure of an angle is greater than the measure of its complement.',
    ['The complement of x is 90 − x.', 'Compare x with 90 − x: try x = 60, x = 30, x = 45.', 'The inequality x > 90 − x holds exactly when x > 45.'],
    'x > 90 − x ⟺ 2x > 90 ⟺ x > 45. 60° beats 30°, 30° loses to 60°, 45° ties — sometimes.',
    'x > 90 − x ⟺ x > 45'],
  [17, 'N', 'Two lines that are perpendicular intersect at exactly 2 points.',
    ['How many points can two distinct lines share?', 'Two distinct lines meet in at most one point.', 'Perpendicular changes the angle, not the count.'],
    'Two distinct lines intersect in at most one point; perpendicular lines intersect in exactly one. Two points is impossible — never.'],
  [18, 'A', 'Two right angles are congruent.',
    ['What is the measure of every right angle?', 'Right angle = exactly 90°, no range.', 'Equal measures means congruent.'],
    'Every right angle measures exactly 90°, so any two right angles have equal measures and are congruent — always.'],
  [19, 'N', 'Two planes that intersect share exactly one point.',
    ['What is the intersection of two planes?', 'Two intersecting planes meet in a line.', 'How many points are on a line?'],
    'Two intersecting planes meet in a line, and a line contains infinitely many points — not one. Never.'],
  [20, 'A', 'The supplement of an acute angle is greater than the complement of the same angle.',
    ['Supplement 180 − x, complement 90 − x.', 'Subtract: (180 − x) − (90 − x) = ?', 'The difference is a constant 90, positive for every x.'],
    '(180 − x) − (90 − x) = 90 > 0 for every acute x, so the supplement is always 90° bigger than the complement — always.',
    '(180 − x) − (90 − x) = 90'],
  [21, 'S', 'The sum of the measures of 2 acute angles is greater than 90 degrees.',
    ['Acute means under 90° — each angle can be tiny or nearly 90°.', 'Try 50° + 50°, then 20° + 30°.', 'One sum is over 90, one is under.'],
    '50° + 50° = 100° > 90°, but 20° + 30° = 50° < 90°. It depends on the angles — sometimes.',
    '50 + 50 = 100, 20 + 30 = 50'],
  [22, 'S', 'Two planes contain the same point.',
    ['Parallel planes vs. intersecting planes.', 'Floor and ceiling share no point; floor and wall share a line.', 'One case shares points, one does not.'],
    'Parallel planes (floor and ceiling) share no point; intersecting planes (floor and wall) share every point of a line — sometimes.'],
  [23, 'N', 'Two angles that are not congruent have the same complement.',
    ['The complement of a is 90 − a; of b is 90 − b.', 'Set the complements equal: 90 − a = 90 − b.', 'Solve it — what does it force about a and b?'],
    'If 90 − a = 90 − b then a = b, so the angles would be congruent. Non-congruent angles cannot share a complement — never.',
    '90 − a = 90 − b ⟹ a = b'],
  [24, 'A', 'Three lines that do not all lie on the same plane can be drawn through one point.',
    ['Think in 3D, not on paper.', 'The x, y and z axes all pass through the origin.', 'Are the three axes in one plane?'],
    'The x, y and z axes are three lines through the origin that do not all lie in one plane, so such a triple can always be drawn — always.'],
  [25, 'A', 'Two angles that are adjacent share the same vertex.',
    ['Recite the definition of adjacent angles.', 'Adjacent: common vertex, common side, no common interior points.', 'The common vertex is part of the definition itself.'],
    'Adjacent angles share a common vertex and a common side (and no interior points) by definition — always.'],
  [26, 'S', 'Two angles that are congruent are adjacent.',
    ['Congruent = equal measure; adjacent = share a vertex and a side.', 'Vertical angles are congruent — are they adjacent? Bisected halves?', 'One congruent pair is adjacent, the other is not.'],
    'Vertical angles are congruent but not adjacent; the two halves made by an angle bisector are congruent and adjacent — sometimes.'],
  [27, 'N', 'Two planes that are parallel contain the same point.',
    ['What does parallel mean for planes?', 'Parallel planes never intersect.', 'No intersection means no shared point at all.'],
    'Parallel planes have no points in common, so they can never contain the same point — never.'],
  [28, 'N', 'A line contains 4 non-collinear points.',
    ['Define collinear.', 'Collinear = lying on the same line.', 'Any points on one line are collinear — "non-collinear points on a line" is a contradiction.'],
    'Points on a line are collinear by definition, so a line cannot contain non-collinear points, four or otherwise — never.'],
  [29, 'N', 'An acute angle and its supplement are congruent.',
    ['The supplement of x is 180 − x.', 'Congruent means x = 180 − x. Solve it.', 'x = 90 — is that acute?'],
    'x = 180 − x gives 2x = 180, x = 90. A 90° angle is right, not acute, so an acute angle never equals its supplement — never.',
    'x = 180 − x ⟹ x = 90'],
  [30, 'S', 'The measure of an angle is less than the measure of its supplement.',
    ['The supplement of x is 180 − x.', 'Compare x with 180 − x: try 30°, 120°, 90°.', 'x < 180 − x exactly when x < 90.'],
    'x < 180 − x ⟺ x < 90. An acute angle is less than its supplement, an obtuse one is greater, 90° ties — sometimes.',
    'x < 180 − x ⟺ x < 90'],
  [31, 'S', 'Three lines that are all parallel lie on the same plane.',
    ['Two parallel lines always share a plane; where can the third go?', 'Draw three parallel lines on paper; now picture the three long edges of a triangular prism.', 'One picture is flat, one is not.'],
    'Three parallel lines can lie in one plane (ruled paper) or not (the three parallel edges of a triangular prism) — sometimes.'],
  [32, 'S', 'Two lines that are not parallel do not share any points.',
    ['Non-parallel lines: coplanar ones vs. skew ones.', 'In a plane, non-parallel lines must cross. In space?', 'Skew lines are not parallel and share no point.'],
    'Two non-parallel lines in the same plane must intersect (share a point); skew lines are non-parallel and share none — sometimes.'],
  [33, 'A', 'Two planes that intersect share an infinite number of points.',
    ['What is the intersection of two planes?', 'Two intersecting planes meet in a line.', 'A line has infinitely many points.'],
    'Two intersecting planes meet in a line, and a line contains infinitely many points — always.'],
  [34, 'A', 'A right angle and its supplement are congruent.',
    ['The supplement of x is 180 − x.', '180 − 90 = ?', 'Compare that with 90.'],
    'The supplement of a right angle is 180 − 90 = 90°, another right angle — congruent, always.',
    '180 − 90 = 90'],
  [35, 'S', 'Two lines intersect at one point.',
    ['List every way two lines can relate.', 'Parallel, intersecting, or skew.', 'Only one of those three gives exactly one point.'],
    'Two lines can be parallel (no shared points), skew (no shared points, not coplanar), or intersecting (exactly one point) — sometimes.'],
  [36, 'S', 'An angle and its complement are congruent.',
    ['The complement of x is 90 − x.', 'Congruent means x = 90 − x. Solve it.', 'It works for exactly one value of x.'],
    'x = 90 − x gives x = 45: an angle equals its complement only when both are 45° — sometimes.',
    'x = 90 − x ⟹ x = 45'],
];

// SOURCE §5 in-scope — [n, answer, stem, hints, say, math?]
const QZ = [
  [1, 'N', 'Any two points can be connected by more than one unique line.',
    ['Postulate: through two points there is exactly one line.', '"More than one unique line" contradicts "exactly one".', 'If exactly one, "more than one" can never happen.'],
    'Through any two points there is exactly one line, so two points are never joined by more than one line — never.'],
  [2, 'N', 'Two intersecting planes will intersect in a segment.',
    ['What do two intersecting planes share?', 'They share a line. Does a line have endpoints?', 'Planes extend forever, so the shared part has no ends.'],
    'Two intersecting planes meet in a line, which has no endpoints — never a segment. Never.'],
  [3, 'A', 'A line and a point are coplanar.',
    ['Coplanar = lying in one plane.', 'A line and a point not on it determine a plane; a point on it lies in every plane through the line.', 'Either way there is a plane holding both.'],
    'A line and a point not on it determine exactly one plane; a point on the line lies in any plane through the line. Some plane always contains both — always.'],
  [4, 'S', 'A line and a ray are coplanar.',
    ['A ray is part of a line — compare the ray’s line with the given line.', 'Two lines are coplanar unless they are skew.', 'Can the ray’s line be skew to the given line?'],
    'A ray lies on a line; two lines share a plane unless they are skew. A ray can be skew to a line, so they are coplanar sometimes (Quizlet’s key: S).'],
  [5, 'S', 'Ray AB and ray AC are the same ray.',
    ['A ray is named endpoint first; both rays start at A.', 'Where can B and C sit relative to A?', 'Same side of A: one ray. Opposite sides: two different rays.'],
    'Both rays start at A. If B and C are on the same side of A the rays coincide; if they are on opposite sides the rays are opposite rays — sometimes.'],
  [6, 'S', 'A plane and a line will intersect in one point.',
    ['How can a line relate to a plane?', 'Pierce it (1 point), lie in it (infinitely many), miss it (0).', '"One point" is only one of three cases.'],
    'A line meets a plane in one point (piercing), infinitely many (lying in it) or none (parallel) — sometimes.'],
  [7, 'S', 'Three distinct points will lie on the same line.',
    ['Collinear = on one line.', 'Three points in a row vs. the three corners of a triangle.', 'One set is collinear, one is not.'],
    'Three distinct points can be collinear or can form a triangle — sometimes.'],
  [8, 'N', 'Ray XY and ray YX are opposite rays.',
    ['Ray notation: the endpoint is the first letter.', 'Ray XY starts at X; ray YX starts at Y. Opposite rays share their endpoint.', 'Different endpoints — so they cannot be opposite rays.'],
    'Opposite rays share one endpoint and go opposite ways. Ray XY starts at X and ray YX starts at Y — different endpoints, so never opposite rays.'],
  [9, 'A', 'A single line exists within an infinite number of planes.',
    ['How many planes can contain one line?', 'Spin a sheet of paper around a pencil lying on it.', 'Every position of the sheet is another plane through the line.'],
    'Infinitely many planes contain a given line (rotate a plane about the line like pages around a spine) — always.'],
  [10, 'S', 'If two lines are not parallel then they intersect.',
    ['Non-parallel lines: think coplanar vs. skew.', 'In a plane they must cross; in space they may be skew.', 'Skew lines are not parallel yet never meet.'],
    'Coplanar non-parallel lines intersect, but skew lines are non-parallel and never intersect — sometimes.'],
  [11, 'S', 'If 2 angles are complementary and adjacent they are congruent.',
    ['Complementary: sum 90°. Congruent: equal.', 'Adjacent 45° + 45°, then adjacent 30° + 60°.', 'Only one of those pairs is congruent.'],
    'Adjacent complementary angles are congruent only when both are 45°; 30° and 60° are adjacent and complementary but not congruent — sometimes.',
    '45 + 45 = 90, 30 + 60 = 90'],
  [12, 'N', 'A line contains four non-coplanar points.',
    ['Coplanar = in one plane. Does every line lie in some plane?', 'Any line lies in (infinitely many) planes.', 'So any points on a line are automatically coplanar.'],
    'Every line lies in a plane, so all its points are coplanar; a line cannot contain non-coplanar points — never.'],
  [13, 'A', 'The supplement of an acute angle is obtuse.',
    ['The supplement of x is 180 − x.', 'If x < 90, then 180 − x > ?', 'Over 90 means obtuse.'],
    'For an acute angle x < 90, the supplement 180 − x > 90, so it is obtuse — always.',
    'x < 90 ⟹ 180 − x > 90'],
  [14, 'S', 'Vertical angles are supplementary.',
    ['Vertical angles are congruent.', 'Congruent and supplementary: x + x = 180.', 'That forces one specific measure.'],
    'Vertical angles are congruent; they are supplementary only if x + x = 180, i.e. both are 90° (perpendicular lines) — sometimes.',
    'x + x = 180 ⟹ x = 90'],
  [15, 'N', 'If 2 supplementary angles are congruent their complements are 45°.',
    ['Congruent supplementary angles: x + x = 180.', 'Solve for x, then find its complement 90 − x.', 'The complement comes out 0, not 45.'],
    'x + x = 180 gives x = 90; the complement of 90° is 90 − 90 = 0°, never 45°. Never.',
    'x = 90 ⟹ 90 − x = 0'],
  [16, 'S', 'Vertical angles are complementary.',
    ['Vertical angles are congruent.', 'Congruent and complementary: x + x = 90.', 'That forces one specific measure.'],
    'Vertical angles are congruent; they are complementary only if x + x = 90, i.e. both are 45° — sometimes.',
    'x + x = 90 ⟹ x = 45'],
  [17, 'A', 'If 2 angles are complementary they are each acute.',
    ['Complementary: sum 90°, both measures positive.', 'If one were 90° or more, what would the other be?', 'Both must be strictly under 90°.'],
    'Two positive measures adding to 90° are each less than 90°, so both are acute — always.'],
  [18, 'N', 'The supplement of an acute angle is acute.',
    ['The supplement of x is 180 − x.', 'If x < 90, then 180 − x > 90.', 'Over 90 is obtuse, not acute.'],
    'For an acute angle x < 90, the supplement 180 − x > 90 — obtuse, never acute. Never.',
    'x < 90 ⟹ 180 − x > 90'],
];

// SOURCE §5 out-of-scope (bonus) — [n, answer, stem, hints, say]
// Stems marked with `exp:` in notes/T06d.md were expanded from SOURCE.md's abbreviations.
const BONUS = [
  [1, 'A', 'An obtuse triangle has exactly 1 obtuse angle.',
    ['Triangle angles sum to 180°.', 'Two obtuse angles would already exceed 180°.', 'So at most one — and "obtuse triangle" means at least one.'],
    'Two obtuse angles would sum to more than 180°, so an obtuse triangle has exactly one — always.'],
  [2, 'S', 'A right triangle is scalene.',
    ['Scalene = no two sides equal.', '3-4-5 vs. 45-45-90.', 'One is scalene, one is isosceles.'],
    'A 3-4-5 right triangle is scalene; a 45-45-90 right triangle is isosceles — sometimes.'],
  [3, 'S', 'The leg of an isosceles triangle is shorter than the base.',
    ['Legs are the two equal sides.', 'Legs 5, 5 with base 8; legs 5, 5 with base 2.', 'Both are valid isosceles triangles.'],
    'Legs 5, 5 and base 8: the leg is shorter. Legs 5, 5 and base 2: the leg is longer — sometimes.'],
  [4, 'A', 'Two triangles are congruent if two sides and the included angle of one are congruent to the corresponding parts of the other.',
    ['Which congruence shortcut uses two sides and the angle between them?', 'Side-Angle-Side.', 'SAS is a postulate — it always works.'],
    'Two sides and the included angle is SAS, a congruence postulate — always.'],
  [5, 'S', 'If {seg AB} ≅ {seg BC} in △ABC, then {ang BAC} ≅ {ang ABC}.',
    ['Equal sides give equal angles opposite them.', 'AB ≅ BC: which angles are opposite AB and BC?', '∠C and ∠A — not ∠A and ∠B.'],
    'AB ≅ BC makes the angles opposite them congruent: ∠BCA ≅ ∠BAC. ∠BAC ≅ ∠ABC happens only if the triangle is equilateral — sometimes.'],
  [6, 'N', 'A right triangle is equilateral.',
    ['Equilateral triangles have three equal angles.', 'Each is 180 ÷ 3 = 60°.', 'No 90° angle is possible.'],
    'An equilateral triangle has three 60° angles, so it cannot have a right angle — never.'],
  [7, 'S', 'A scalene triangle has 3 acute angles.',
    ['Scalene is about sides; acute is about angles.', '50-60-70 triangle vs. 30-60-90 triangle.', 'Both are scalene; only one has three acute angles.'],
    'A 50-60-70 triangle is scalene and acute; a 30-60-90 triangle is scalene with a right angle — sometimes.'],
  [8, 'S', 'An isosceles triangle is obtuse.',
    ['Isosceles is about sides; obtuse is about angles.', '120-30-30 vs. 40-70-70.', 'Both are isosceles; only one is obtuse.'],
    'A 120-30-30 triangle is isosceles and obtuse; a 40-70-70 triangle is isosceles and acute — sometimes.'],
  [9, 'S', 'The base of an isosceles triangle is shorter than either leg.',
    ['The base is the unequal side (if any).', 'Base 2 with legs 5; base 8 with legs 5.', 'Both triangles exist.'],
    'Base 2, legs 5: the base is shorter. Base 8, legs 5: the base is longer — sometimes.'],
  [10, 'S', 'If {ang BAC} ≅ {ang ABC}, then {seg AB} ≅ {seg BC}.',
    ['Equal angles give equal sides opposite them.', '∠A ≅ ∠B: which sides are opposite them?', 'BC and AC — not AB and BC.'],
    '∠BAC ≅ ∠ABC makes the sides opposite them congruent: BC ≅ AC. AB ≅ BC needs the triangle to be equilateral — sometimes.'],
  [11, 'S', 'Two triangles are congruent if two sides and an angle of one are congruent to the corresponding parts of the other.',
    ['Is the angle between the two sides, or not?', 'SAS works; SSA (angle not included) does not in general.', 'The statement does not say the angle is included.'],
    'Two sides and an angle prove congruence only when the angle is included (SAS); SSA can produce two different triangles — sometimes.'],
  [12, 'A', 'If two sides of a right triangle are congruent to the corresponding parts of another right triangle, the triangles are congruent.',
    ['Both triangles already have a matching right angle.', 'Two legs: leg–right angle–leg. Leg and hypotenuse: HL.', 'Either pair of sides gives a congruence rule.'],
    'Two legs give SAS with the right angle; a leg and the hypotenuse give HL — either way the right triangles are congruent, always.'],
  [13, 'N', 'A right triangle is congruent to an obtuse triangle.',
    ['Congruent triangles have congruent corresponding angles.', 'One triangle has a 90° angle; the other has an angle over 90°.', 'The angle lists cannot match.'],
    'Congruent triangles have matching angles; a right triangle has 90° where an obtuse triangle has more than 90° — never.'],
  [14, 'A', 'An equiangular triangle is isosceles.',
    ['Equiangular: three equal angles.', 'Equal angles give equal opposite sides.', 'Three equal sides certainly includes two equal sides.'],
    'An equiangular triangle has three equal sides (equilateral), and any triangle with at least two equal sides is isosceles — always.'],
  [15, 'S', 'An exterior angle of a triangle is larger than any angle of the triangle.',
    ['Exterior angle = sum of the two remote interior angles.', 'It beats those two — but compare it with the adjacent interior angle.', 'If the adjacent angle is obtuse, the exterior angle is acute.'],
    'An exterior angle equals the sum of the two remote interior angles, so it exceeds those; but it is 180° minus the adjacent angle, so it is smaller than an obtuse adjacent angle — sometimes.'],
  [16, 'N', 'One base angle of an isosceles triangle is greater than one of the exterior angles.',
    ['Exterior angle = sum of the two remote interior angles.', 'In an isosceles triangle every exterior angle has at least one base angle in its sum.', 'A sum of two positive angles beats either one of them.'],
    'Each exterior angle equals the sum of two remote interior angles, at least one of which is a base angle, so it is bigger than any base angle — never.'],
  [17, 'N', 'Two skew lines are parallel.',
    ['Define skew: not coplanar, do not intersect.', 'Define parallel: coplanar, do not intersect.', 'Coplanar and non-coplanar cannot both hold.'],
    'Skew lines are non-coplanar; parallel lines are coplanar — never both.'],
  [18, 'A', 'Two parallel lines are coplanar.',
    ['Recite the definition of parallel lines.', 'Parallel lines lie in the same plane and never meet.', 'Coplanar is in the definition.'],
    'Parallel lines are, by definition, coplanar lines that do not intersect — always.'],
  [19, 'S', 'A line in the ceiling plane and a line in the floor plane are parallel.',
    ['Ceiling and floor are parallel planes.', 'Lines in parallel planes never meet — parallel or skew?', 'Run one north–south and one east–west.'],
    'A ceiling line and a floor line never meet; they are parallel if they run the same way, skew if not — sometimes.'],
  [20, 'N', 'Two lines in the plane of the floor are skew.',
    ['Skew lines are not coplanar.', 'Two lines in the floor share the floor plane.', 'Coplanar lines cannot be skew.'],
    'Both lines lie in the plane of the floor, so they are coplanar and cannot be skew — never.'],
  [21, 'S', 'If a line is parallel to a plane, a plane containing that line is parallel to the given plane.',
    ['Many planes contain the given line.', 'One of them is parallel to the given plane; others tilt and cut it.', 'It depends which containing plane you pick.'],
    'A plane through the line can be parallel to the given plane or can tilt and intersect it in another line — sometimes.'],
  [22, 'S', 'Two lines parallel to the same plane are parallel to each other.',
    ['Think of the floor as the plane.', 'Two lines on the ceiling: parallel, crossing, or one on the ceiling and one on a wall (skew).', 'All of those are parallel to the floor.'],
    'Lines parallel to the floor can be parallel to each other, intersect, or be skew (e.g. on different walls) — sometimes.'],
  [23, 'A', 'Two lines parallel to a third line are parallel.',
    ['Parallel lines have the same direction.', 'If a ∥ c and b ∥ c, compare the directions of a and b.', 'Same direction, and they lie in a common plane.'],
    'Two lines parallel to the same line are parallel to each other (parallelism of lines is transitive, in a plane or in space) — always.'],
  [24, 'S', 'Two planes parallel to the same line are parallel.',
    ['Take the line as a vertical pole.', 'Two walls parallel to the pole: could be parallel, or meet in an edge parallel to the pole.', 'Both cases exist.'],
    'Two planes parallel to one line may be parallel to each other or intersect in a line parallel to the given line — sometimes.'],
  [25, 'N', 'Skew lines intersect.',
    ['Recite the definition of skew lines.', 'Skew: not coplanar and not intersecting.', '"Not intersecting" is in the definition.'],
    'Skew lines do not intersect by definition — never.'],
  [26, 'A', 'Two planes parallel to the same plane are parallel.',
    ['Parallel planes: same orientation, no shared points.', 'If P ∥ R and Q ∥ R, compare P and Q.', 'Neither can meet R, and both are parallel copies of it.'],
    'Two planes parallel to the same plane are parallel to each other (plane parallelism is transitive) — always.'],
  [27, 'S', 'Two lines perpendicular to a third line are parallel.',
    ['In a plane vs. in space.', 'The x- and y-axes are both perpendicular to the z-axis.', 'They meet — so not parallel; but in a plane the answer would be yes.'],
    'In one plane, two lines perpendicular to a third are parallel; in space the x- and y-axes are both perpendicular to the z-axis yet intersect — sometimes.'],
  [28, 'S', 'Two lines skew to a third line are skew to each other.',
    ['Skew to a third line says little about each other.', 'Two edges of a box both skew to a third edge: parallel, intersecting, or skew?', 'All three happen on a box.'],
    'Two lines each skew to a third can be parallel, intersecting or skew to each other (check the edges of a box) — sometimes.'],
  [29, 'A', 'Through a point outside a plane there is more than one line parallel to the plane.',
    ['Through the point there is a plane parallel to the given plane.', 'Every line in that plane through the point is parallel to the given plane.', 'There are infinitely many such lines.'],
    'Through a point off a plane passes a plane parallel to it, and every line through the point in that plane is parallel to the given plane — infinitely many, always.'],
  [30, 'S', 'If a line intersects one of two parallel lines, it intersects the other.',
    ['Coplanar case vs. a line leaving the plane.', 'In their plane a transversal cuts both. In space, a line can pierce one and be skew to the other.', 'Both happen.'],
    'In the plane of the parallel lines a transversal meets both, but a line from outside the plane can cross one and be skew to the other — sometimes.'],
  [31, 'S', 'If the sides of two angles lie in parallel lines, the angles are congruent.',
    ['Picture a transversal across two parallel lines.', 'Angles with parallel sides are congruent or supplementary.', 'It depends on which way the sides point.'],
    'Angles whose sides lie in parallel lines are either congruent or supplementary, depending on the directions of the sides — sometimes.'],
  [32, 'A', 'If line t is skew to line m, there is a plane containing t that is parallel to m.',
    ['Pick a point on t and draw the line through it parallel to m.', 't and that new line intersect, so they fix a plane.', 'm is parallel to a line in that plane and not in it.'],
    'Through a point of t draw the line parallel to m; it and t determine a plane that contains t and is parallel to m — always.'],
  [33, 'A', 'If line m is skew to line k, there is a line perpendicular to both.',
    ['Skew lines have a shortest connecting segment.', 'The segment joining the closest points is perpendicular to both lines.', "That segment's line is the common perpendicular."],
    'Any two skew lines have a common perpendicular (the line through their closest points) — always.'],
];

const pad = (n) => String(n).padStart(2, '0');

function step(say, math) {
  return math ? { say, math } : { say };
}

function mk({ prefix, n, answer, stem, hints, say, math, module, sheet, src, srcFile, skills, reason, distractors, disputed }) {
  const id = `${prefix}-${pad(n)}`;
  const part = { id: 'verdict', type: 'asn', answer, reason, distractors: [...distractors] };
  if (disputed) part.disputed = disputed;
  return {
    id,
    module,
    sheet,
    num: n,
    src,
    srcFile,
    tier: 1,
    par: 20,
    skills: [...skills],
    needs: [],
    stem,
    parts: [part],
    hints: [...hints],
    solution: [step(say, math)],
    misconceptions: [],
    bonus: prefix === 'bonus',
    verified: true,
  };
}

/** asn-01..36 — SOURCE §4, module M9, sheet ASN. */
export const asnCards = ASN.map(([n, answer, stem, hints, say, math]) => {
  const id = `asn-${pad(n)}`;
  const bank = REASONS[id];
  return mk({
    prefix: 'asn', n, answer, stem, hints, say, math,
    module: 'M9', sheet: 'ASN',
    src: `§4 #${n}`,
    srcFile: `source/asn.html #${n}`,
    skills: [PLP_ASN.has(n) ? 'ASN-PLP' : 'ASN-ANG'],
    reason: bank.reason, distractors: bank.distractors,
  });
});

/** qz-01..18 — SOURCE §5 in-scope, module M9, sheet QZ. qz-04 is disputed (Global rule 5). */
export const qzCards = QZ.map(([n, answer, stem, hints, say, math]) => {
  const id = `qz-${pad(n)}`;
  const bank = REASONS[id];
  return mk({
    prefix: 'qz', n, answer, stem, hints, say, math,
    module: 'M9', sheet: 'QZ',
    src: `§5 #${n}`,
    srcFile: `content/SOURCE.md §5 (Quizlet 254286132) #${n}`,
    skills: [PLP_QZ.has(n) ? 'ASN-PLP' : 'ASN-ANG'],
    reason: bank.reason, distractors: bank.distractors,
    disputed: n === 4 ? 'Quizlet says S; arguably A' : undefined,
  });
});

/** bonus-01..33 — SOURCE §5 out-of-scope, module M13, sheet BONUS, no skills, no chips. */
export const bonusCards = BONUS.map(([n, answer, stem, hints, say]) => {
  const id = `bonus-${pad(n)}`;
  return mk({
    prefix: 'bonus', n, answer, stem, hints, say,
    module: 'M13', sheet: 'BONUS',
    src: `§5 bonus #${n}`,
    srcFile: `content/SOURCE.md §5 (Quizlet 254286132) bonus #${n}`,
    skills: [],
    reason: BONUS_REASONS[id], distractors: [],
  });
});

/** All 87 cards in sheet order: asn-01..36, qz-01..18, bonus-01..33. */
export const cards = [...asnCards, ...qzCards, ...bonusCards];

/** id → card. */
export const byId = Object.fromEntries(cards.map((c) => [c.id, c]));

/** Student-facing word for a verdict letter: A → "Always", S → "Sometimes", N → "Never". */
export function verdictWord(letter) {
  return LETTER[letter] ?? null;
}

export default cards;
