// cards/doc.js — T06b. The study-guide doc problems doc-05, doc-06, doc-07 (sheet DOC). COMPOSED S2 rows
// for §2, S3 (strip / multi / equation), S6 card schema. Stems and srcFile byte-for-byte from
// content/transcript.md (T00); answers are the teacher's strings from content/SOURCE.md §2.
// BUILD-POLICY §1: no scan fields of any kind — the doc figure images are never served or referenced as assets;
// D5 and D7 are the redrawn SVG figures in data/figures.js. ES module, imports nothing.
// Part shapes are documented at the top of cards/angles.js (same conventions; strip chips use `role`).

const EQ5 = '5x+16 + 8x−23 = 11x+19';   // the S2 wording of the correct setup (spacing/minus-insensitive in the pick grader)

const doc05 = {
  id: 'doc-05', module: 'M7', sheet: 'DOC', src: '§2 doc #5', teacherNo: '5.',
  srcFile: 'source/study-guide.html #5 (stem printed inside the embedded image = content/doc-fig-5-bisect.png)',
  tier: 4, par: 300, skills: ['BISECT-L'], needs: [],
  stem: 'If {m ABC} = 11x + 19, does {ray BD} bisect {ang ABC}? Show work and explain why or why not.',
  // D5 carries its own printed labels: "5x + 16" inside ∠ABD, "8x − 23" inside ∠DBC. Not to scale (expressions).
  figure: { id: 'D5', rename: {}, notToScale: true },
  parts: [
    { id: 'explain', type: 'strip', prompt: 'Work it through, then explain',
      slots: [
        { id: 'eq', type: 'pick', label: 'Set up',
          options: [EQ5, '5x+16 = 8x−23', '5x+16 + 8x−23 = 180'],
          answer: EQ5,
          why: {
            '5x+16 = 8x−23': 'That assumes the halves are equal — that is the thing we are testing. Start from the whole: the two parts add up to m∠ABC.',
            '5x+16 + 8x−23 = 180': 'Nothing says ∠ABC is straight — its measure is given as 11x + 19, so the two parts add up to that.',
          } },
        { id: 'x', type: 'num', label: 'x =', answer: '13' },
        { id: 'halves', type: 'multi', label: 'the halves', fields: [
          { key: 'ABD', label: 'm∠ABD', answer: '81', wedge: 'A-D' },
          { key: 'DBC', label: 'm∠DBC', answer: '81', wedge: 'C-D' },
        ] },
        { id: 'verdict', type: 'verdict', label: 'Does BD bisect ∠ABC?', answer: 'YES',
          why: { NO: '81° = 81° — the halves are congruent, so it does.' } },
        { id: 'why', type: 'chips', label: 'because',
          chips: [
            { text: '{ang ABD} ≅ {ang DBC} (81° = 81°), so {ray BD} bisects', role: 'required' },
            { text: 'x = 13', role: 'neutral' },
            { text: EQ5, role: 'neutral' },
            { text: '{ray BD} is inside {ang ABC}', role: 'neutral' },
            { text: 'the angles add to 180°', role: 'forbidden', why: '∠ABD and ∠DBC add to m∠ABC = 162°, not 180° — they are not a linear pair, and a sum is never what makes a bisector.' },
            { text: 'the drawing shows {ray BD} in the middle', role: 'forbidden', why: 'The figure is not to scale — only the measures decide. 5(13) + 16 = 81 and 8(13) − 23 = 81 is the reason.' },
          ] },
      ],
      prose: 'Since [[eq]], x = [[x]], so {m ABD} = [[halves.ABD]]° = {m DBC}; the halves are congruent, so {ray BD} bisects {ang ABC}.' },
  ],
  hints: [
    'Ray BD is inside ∠ABC, so the two small angles add up to the whole one (angle addition). Whether it bisects is a separate question: the two halves must be EQUAL.',
    'Add the two parts and set the sum equal to the whole: (5x + 16) + (8x − 23) = 11x + 19.',
    '13x − 7 = 11x + 19 gives x. Substitute it into 5x + 16 and into 8x − 23 and compare the two numbers — equal means bisects.',
  ],
  solution: [
    { say: 'BD lies inside ∠ABC, so the parts add to the whole (angle addition).', math: '(5x + 16) + (8x − 23) = 11x + 19' },
    { say: 'Combine like terms.', math: '13x − 7 = 11x + 19' },
    { say: 'Solve for x.', math: '2x = 26  →  x = 13' },
    { say: 'Substitute into both halves.', math: '{m ABD} = 5(13) + 16 = 81,   {m DBC} = 8(13) − 23 = 81' },
    { say: 'The halves are equal, so ∠ABD ≅ ∠DBC — that is the definition of a bisector. (Check the whole: 11(13) + 19 = 162 = 81 + 81 ✓)', math: '{ang ABD} ≅ {ang DBC}  ⇒  {ray BD} bisects {ang ABC}:  YES' },
  ],
  misconceptions: [
    { part: 'explain', answer: '5x+16 = 8x−23', tag: 'assumed-bisects', msg: 'Setting the halves equal assumes the answer. Find x from the whole angle first, then check whether the halves come out equal.' },
    { part: 'explain', answer: '5x+16 + 8x−23 = 180', tag: 'linear-pair-set-equal', msg: '∠ABD and ∠DBC are not a linear pair — nothing says ∠ABC is straight. Their sum is m∠ABC = 11x + 19.' },
    { part: 'explain', answer: '-13', tag: 'sign-flip', msg: '13x − 7 = 11x + 19 → 2x = 26 → x = +13.' },
    { part: 'explain', answer: 'the angles add to 180°', tag: 'forbidden-reason', msg: 'A sum of 180 is about linear pairs, not bisectors. BD bisects because the two halves are congruent (81° = 81°).' },
  ],
  verified: true,
};

const doc06 = {
  id: 'doc-06', module: 'M4', sheet: 'DOC', src: '§2 doc #6', teacherNo: '6.',
  srcFile: 'source/study-guide.html #6',
  tier: 2, par: 90, skills: ['CS-LIN'], needs: [],
  stem: 'The measure of the supplement of an angle is 30 more than three times the complement. Determine the measures of the angles.',
  figure: null,
  parts: [
    { id: 'setup', type: 'equation', optional: true, prompt: 'Set up the equation (skippable — graded when tried)',
      canonical: '180-x-(30+3(90-x))', var: 'x', mustMention: [180, 90] },
    // the teacher's key answers in this order: angle, supplement, complement
    { id: 'm', type: 'multi', prompt: 'The angle, its supplement and its complement', fields: [
      { key: 'angle', label: 'angle =', answer: '60' },
      { key: 'supp', label: 'supplement =', answer: '120' },
      { key: 'comp', label: 'complement =', answer: '30' },
    ] },
  ],
  hints: [
    'Let the angle be x. Its supplement is 180 − x and its complement is 90 − x.',
    '"The supplement is 30 more than three times the complement": 180 − x = 30 + 3(90 − x).',
    'Distribute the 3, then collect the x terms: 2x = 120.',
  ],
  solution: [
    { say: 'Name the three quantities.', math: 'angle = x,   supplement = 180 − x,   complement = 90 − x' },
    { say: 'Translate the sentence.', math: '180 − x = 30 + 3(90 − x)' },
    { say: 'Distribute and simplify the right side.', math: '180 − x = 30 + 270 − 3x = 300 − 3x' },
    { say: 'Collect x on one side.', math: '180 + 2x = 300  →  2x = 120  →  x = 60' },
    { say: 'Then the other two.', math: 'supplement = 180 − 60 = 120,   complement = 90 − 60 = 30' },
    { say: 'Check: 30 + 3(30) = 120 ✓', math: 'angle 60°, supplement 120°, complement 30°' },
  ],
  misconceptions: [
    { part: 'm', answer: '30', tag: 'gave-complement', msg: '30 is the complement — the angle itself is x = 60.' },
    { part: 'm', answer: '120', tag: 'gave-supplement', msg: '120 is the supplement — the angle itself is x = 60.' },
    { part: 'm', answer: '90', tag: 'grouping', msg: '90 comes from 3(90 − x + 30). "30 more than three times the complement" adds the 30 AFTER tripling: 30 + 3(90 − x).' },
    { part: 'setup', answer: '180-x=3(90-x)-30', tag: 'wrong-side-supp', msg: '"30 more than" means add 30 to the three-times piece: 180 − x = 30 + 3(90 − x).' },
  ],
  verified: true,
};

const doc07 = {
  id: 'doc-07', module: 'M6', sheet: 'DOC', src: '§2 doc #7', teacherNo: '7.',
  srcFile: 'source/study-guide.html #7 (figure = content/doc-fig-7-lines.png)',
  tier: 3, par: 180, skills: ['FIG-ALG', 'SYS'], needs: ['SYS'],
  stem: 'Solve for x, y, and the measures of the angles.',
  // D7 carries its own printed labels: "3x + y" upper-left, "4y + x − 5" upper-right, "4x + y + 10" lower-right; lower-left blank.
  figure: { id: 'D7', rename: {}, notToScale: true },
  parts: [
    // A two-variable system (S3 `equation` accepts "x + y = 90, y = 2x"-style pairs): both equations are LHS − RHS
    // linear forms in x, y (parseLinear); `canonical` is null because there is no single-variable setup to compare.
    { id: 'setup', type: 'equation', optional: true, prompt: 'Write the two equations (vertical pair, then a linear pair — skippable)',
      canonical: null, var: 'x', vars: ['x', 'y'], mustMention: [180],
      system: ['3x+y-(4x+y+10)', '(3x+y)+(4y+x-5)-180'] },
    { id: 'all', type: 'multi', prompt: 'x, y and the four angles', fields: [
      { key: 'x', label: 'x =', answer: '-10' },
      { key: 'y', label: 'y =', answer: '45' },
      { key: 'UL', label: 'upper-left angle', answer: '15', wedge: 'UL' },
      { key: 'UR', label: 'upper-right angle', answer: '165', wedge: 'UR' },
      { key: 'LR', label: 'lower-right angle', answer: '15', wedge: 'LR' },
      { key: 'LL', label: 'lower-left angle', answer: '165', wedge: 'LL' },
    ] },
  ],
  hints: [
    'Two lines cross: the angles across from each other (upper-left and lower-right) are vertical, so they are equal; the angles next to each other along a line (upper-left and upper-right) are a linear pair, so they add to 180.',
    'Vertical: 3x + y = 4x + y + 10 — the y cancels, which gives x at once. Linear pair: (3x + y) + (4y + x − 5) = 180.',
    'x = −10. Put it into 4x + 5y = 185 to get y, then substitute both into each expression; the unlabeled lower-left angle equals the upper-right one.',
  ],
  solution: [
    { say: 'Upper-left and lower-right are vertical angles, so they are equal.', math: '3x + y = 4x + y + 10' },
    { say: 'The y terms cancel; solve for x.', math: '3x = 4x + 10  →  x = −10' },
    { say: 'Upper-left and upper-right form a linear pair, so they add to 180.', math: '(3x + y) + (4y + x − 5) = 180  →  4x + 5y = 185' },
    { say: 'Substitute x = −10 and solve for y.', math: '−40 + 5y = 185  →  5y = 225  →  y = 45' },
    { say: 'Evaluate the labelled angles.', math: 'UL = 3(−10) + 45 = 15,   UR = 4(45) + (−10) − 5 = 165,   LR = 4(−10) + 45 + 10 = 15' },
    { say: 'The lower-left angle is vertical to the upper-right one (and a linear pair with the 15° angles).', math: 'LL = 165   (check: 15 + 165 = 180 ✓, 15 = 15 ✓)' },
  ],
  misconceptions: [
    { part: 'all', answer: '10', tag: 'sign-flip', msg: '3x = 4x + 10 gives −x = 10, so x = −10 — the sign matters for every angle after it.' },
    { part: 'all', answer: '-45', tag: 'sign-flip', msg: '5y = 225 gives y = +45.' },
    { part: 'setup', answer: '3x+y+4x+y+10=180', tag: 'vertical-set-180', msg: 'Upper-left and lower-right are VERTICAL angles — they are equal, not supplementary: 3x + y = 4x + y + 10.' },
    { part: 'setup', answer: '3x+y=4y+x-5', tag: 'linear-pair-set-equal', msg: 'Upper-left and upper-right sit next to each other on a straight line — a linear pair adds to 180; only the vertical pair is equal.' },
    { part: 'all', answer: '165', tag: 'swapped-fields', msg: '165 belongs to the obtuse angles (upper-right and lower-left); the upper-left and lower-right are the 15° pair.' },
  ],
  verified: true,
};

/** The three doc cards in sheet order — what site/data/cards.js imports. */
export const cards = Object.freeze([doc05, doc06, doc07]);
export const byId = Object.freeze(Object.fromEntries(cards.map((c) => [c.id, c])));
export const DOC_IDS = Object.freeze(cards.map((c) => c.id));
export default cards;
