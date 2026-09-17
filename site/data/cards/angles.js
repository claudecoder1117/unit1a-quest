// cards/angles.js — T06b. The "Angles Practice" sheet: ang-wu-1..5 (warm-up, figure F1 with G),
// ang-02..11 (sheets AP-1..AP-4). COMPOSED S2 rows for §1, S3 parts, S6 card schema (the ang-10 example),
// S1 HP-pip rule. Stems and srcFile are byte-for-byte from content/transcript.md (T00); answers are the
// teacher's strings from content/SOURCE.md §1 (never altered — a disagreement is a FLAG in tests).
// BUILD-POLICY §1: no scan fields of any kind (nothing here points at a key page or an original drawing) —
// figures are the redrawn SVG (data/figures.js), solutions are our own typed steps. ES module, imports nothing.
//
// Part shapes (S6 "Other parts") used here — every S6 field present, extras are additive:
//   pairs     { id, type:'pairs', relation, count }                                 (T04 grader; figure from card.figure)
//   equation  { id:'setup', type:'equation', optional:true, canonical, var, mustMention:[…], alternates?:[…], prompt }
//             optional = "skip setup" on Cards (S3); NOT counted in HP pips (S1: ang-10 = 4 pips); alternates are
//             other correct setups with a different choice of unknown (their roots differ from canonical's).
//   num       { id, type:'num', label, answer, asks:[…], distractors:{name: value}, bonus?:[{key,label,answer}] }
//             bonus = extra optional fields the teacher's key also lists (comp/supp); blank never blocks `ok`.
//   multi     { id, type:'multi', fields:[{key,label,answer,wedge?,bonus?}], orderFree? }  bonus fields as above
//   roots     { id, type:'roots', var, label, answer:[…], mustMention:null }
//   reject    { id:'keep', type:'reject', of, valid:[…], rejected:[…], reason, reasonKey, distractors:[…] }
//             reasonKey ∈ negative-length | negative-angle | angle-over-180 | zero-angle | not-a-solution | both-valid | neither
//             (the S3 reason menu); `reason` is the display text the S2 table quotes.
//   cases     { id, type:'cases', of, cols:[{key,label?,wedge?,type?}], rows:[{…}] }  rows order-free, matched on x
//   strip     { id, type:'strip', slots:[…], prose }                                 (T05 grader; validate() is clean)
// misconceptions[] = { part, answer, tag, msg } — every tag exists in data/misconceptions.js (T06g scan).

const AP = (page) => `source/angles.pdf p.${page}`;

// ---------------------------------------------------------------------------------------------
// Warm-up: figure F1 with the printed G on the left (rename A → G). The teacher's key writes A.
// Drawn measures (T04, after rename): CFD 26 · BFC 64 · GFB 90 · GFE 26 · DFE 154 · BFD 90 · CFG 154 · BFE 116.
// ---------------------------------------------------------------------------------------------
const WU_STEM = 'Given the following diagram, where Point F is on {line EC} and {line AD}, identify: ';
const F1G = () => ({ id: 'F1', rename: { A: 'G' }, labels: [] });

function warmup(n, item, relation, count, teacherPairs, hints, solution, misconceptions) {
  return {
    id: `ang-wu-${n}`, module: 'M2', sheet: 'AP-1', src: `§1 warm-up ${n}`, srcFile: AP(1),
    teacherNo: `Warm up! — item ${n}`,
    tier: 2, par: 90, skills: ['PAIRS'], needs: [],
    stem: WU_STEM + item,
    note: 'The printed figure labels the left point G while the sentence says line AD — same point, same line. The teacher\'s key writes A; either letter names it.',
    figure: F1G(),
    parts: [{ id: 'pairs', type: 'pairs', relation, count, prompt: `Pick ${count} ${count === 1 ? 'pair' : 'pairs'} — tap two angles in the figure, choose from the list, or type a name like ∠GFC.` }],
    // the handwritten key, in the printed letters (teacher wrote A for the printed G) — tests assert each is accepted
    teacherPairs,
    hints, solution, misconceptions, verified: true,
  };
}

const WU = [
  warmup(1, '3 pairs of supplementary angles', 'supplementary', 3,
    [['EFG', 'GFC'], ['GFC', 'CFD'], ['GFE', 'EFD']],
    [
      'Supplementary means the two measures add to 180°. In a figure, that happens when two adjacent angles together make a straight line.',
      'Two lines cross at F, so F is on line GD and on line EC. Any two angles that share a ray and together fill one of those lines are a linear pair — and every linear pair is supplementary.',
      'Start from ray FC: on one side of it is ∠GFC, on the other side ∠CFD, and FG with FD is a straight line. That is one pair; there are six such pairs in the figure.',
    ],
    [
      { say: 'Supplementary angles add to 180°. Adjacent angles whose outer sides are opposite rays (a linear pair) always do.', math: '{m GFC} + {m CFD} = 180°   (FG and FD are opposite rays)' },
      { say: 'Walk around F: each ray of a line splits the straight angle on the other line into two supplementary pieces.', math: '{ang EFG} + {ang GFC} = 180°,   {ang GFC} + {ang CFD} = 180°,   {ang GFE} + {ang EFD} = 180°' },
      { say: 'Any three of the six linear pairs answer the question (also ∠GFB + ∠BFD, ∠BFC + ∠BFE, ∠CFD + ∠DFE).', math: 'six linear pairs · three needed' },
    ],
    [
      { part: 'pairs', answer: '∠BFC + ∠CFD', tag: 'confused-comp-supp', msg: '∠BFC + ∠CFD fill the right angle ∠BFD: 64 + 26 = 90 — complementary, not supplementary.' },
      { part: 'pairs', answer: '∠GFE + ∠CFD', tag: 'confused-vertical-linear', msg: '∠GFE and ∠CFD are vertical angles — congruent (26° = 26°), not supplementary. A linear pair shares a ray.' },
    ]),
  warmup(2, '1 pair of complementary angles', 'complementary', 1,
    [['BFC', 'CFD']],
    [
      'Complementary means the two measures add to 90°. Look for a right angle that is split into two pieces.',
      'The small square at F marks ∠BFG as a right angle, so ∠BFD (the other side of ray FB) is 90° too, because G-F-D is a straight line.',
      'Ray FC lies inside ∠BFD, cutting the 90° into two adjacent angles.',
    ],
    [
      { say: 'The square at F marks ∠BFG = 90°; since FG and FD are opposite rays, ∠BFD = 180° − 90° = 90° as well.', math: '{m BFD} = 90°' },
      { say: 'Ray FC splits ∠BFD into ∠BFC and ∠CFD, so those two add to 90°: complementary.', math: '{m BFC} + {m CFD} = {m BFD} = 90°' },
      { say: 'A non-adjacent pair also works: ∠GFE is vertical to ∠CFD, so ∠BFC + ∠GFE = 90° too.', math: '{ang GFE} ≅ {ang CFD}  ⇒  {m BFC} + {m GFE} = 90°' },
    ],
    [
      { part: 'pairs', answer: '∠GFC + ∠CFD', tag: 'confused-comp-supp', msg: '∠GFC + ∠CFD make the straight line GD: 154 + 26 = 180 — supplementary, not complementary.' },
      { part: 'pairs', answer: '∠GFB + ∠BFD', tag: 'confused-comp-supp', msg: '∠GFB and ∠BFD are both right angles: 90 + 90 = 180 — a linear pair, not a complementary pair.' },
    ]),
  warmup(3, '1 pair of vertical angles', 'vertical', 1,
    [['GFE', 'CFD']],
    [
      'Vertical angles are the two non-adjacent angles made by two intersecting lines — they sit across the vertex from each other and are congruent.',
      'The two lines here are GD and EC. Take one angle between them, then look straight across F for the angle formed by the opposite rays.',
      '∠CFD sits between ray FC and ray FD. The opposite rays are FE and FG.',
    ],
    [
      { say: 'Vertical angles are formed by two intersecting lines: each side of one angle is opposite to a side of the other.', math: 'lines GD and EC cross at F' },
      { say: 'The rays opposite FC and FD are FE and FG, so ∠GFE is vertical to ∠CFD (and ∠GFC is vertical to ∠DFE).', math: '{ang GFE} ≅ {ang CFD},   {ang GFC} ≅ {ang DFE}' },
      { say: 'Ray FB is not part of a line, so no angle with side FB has a vertical partner.', math: 'two pairs of vertical angles in the figure' },
    ],
    [
      { part: 'pairs', answer: '∠GFC + ∠CFD', tag: 'confused-vertical-linear', msg: '∠GFC and ∠CFD share ray FC and together make the line GD — that is a linear pair, not vertical angles.' },
      { part: 'pairs', answer: '∠GFB + ∠BFD', tag: 'confused-vertical-linear', msg: '∠GFB and ∠BFD are adjacent (they share FB) — vertical angles never share a side; they sit across F from each other.' },
    ]),
  warmup(4, '2 linear pairs', 'linearPair', 2,
    [['GFC', 'CFD'], ['GFE', 'EFD']],
    [
      'A linear pair is two adjacent angles whose non-common sides are opposite rays — together they form a straight line.',
      'Pick a ray that is NOT a whole line by itself, such as FC or FB, and look at the two angles on either side of it along one of the lines.',
      'On either side of ray FC along line GD you get ∠GFC and ∠CFD; the same idea works for ray FE, and for ray FB.',
    ],
    [
      { say: 'Two adjacent angles form a linear pair when their outer sides are opposite rays (a straight line).', math: 'G-F-D and E-F-C are straight' },
      { say: 'Ray FC splits line GD: ∠GFC and ∠CFD. Ray FE splits it too: ∠GFE and ∠EFD.', math: '({ang GFC}, {ang CFD}),   ({ang GFE}, {ang EFD})' },
      { say: 'Six linear pairs exist in all: the two above, ∠EFG + ∠GFC, ∠CFD + ∠DFE, ∠GFB + ∠BFD, ∠BFC + ∠BFE. Any two answer the question.', math: 'every linear pair is supplementary' },
    ],
    [
      { part: 'pairs', answer: '∠BFC + ∠CFD', tag: 'adjacent-not-linear', msg: '∠BFC and ∠CFD are adjacent, but FB and FD are not opposite rays (they make a right angle) — adjacent is not enough for a linear pair.' },
      { part: 'pairs', answer: '∠GFE + ∠CFD', tag: 'confused-vertical-linear', msg: '∠GFE and ∠CFD are vertical angles — they do not share a side, so they cannot be a linear pair.' },
    ]),
  warmup(5, '2 non-examples of adjacent angles', 'nonAdjacent', 2,
    [['BFG', 'CFD'], ['BFC', 'GFE']],
    [
      'Adjacent angles share a vertex AND a side, with no interior points in common. A non-example fails one of those.',
      'Every angle here has vertex F, so look for two angles that do not share a ray — or that overlap.',
      '∠BFG uses rays FB and FG. Find an angle that uses neither of those rays.',
    ],
    [
      { say: 'Adjacent angles share the vertex and exactly one side and do not overlap. A pair that shares no side is a non-example.', math: '{ang BFG} (sides FB, FG) and {ang CFD} (sides FC, FD): no common side' },
      { say: 'Vertical angles are never adjacent either — ∠BFC and ∠GFE share no side (they even add to 90°, a "non-adjacent complementary" pair, as the key says).', math: '{ang BFC} (FB, FC) and {ang GFE} (FG, FE): no common side' },
      { say: 'Overlapping angles are non-examples too: ∠GFC and ∠GFB share side FG but ∠GFB lies inside ∠GFC.', math: 'shared side + overlap ⇒ not adjacent' },
    ],
    [
      { part: 'pairs', answer: '∠GFC + ∠CFD', tag: 'adjacent-as-nonexample', msg: '∠GFC and ∠CFD share ray FC with no overlap — they ARE adjacent (a linear pair, even). A non-example must fail the definition.' },
      { part: 'pairs', answer: '∠BFC + ∠CFD', tag: 'adjacent-as-nonexample', msg: '∠BFC and ∠CFD share ray FC and do not overlap — adjacent. Look for two angles with no common side.' },
    ]),
];

// ---------------------------------------------------------------------------------------------
// Word-problem style cards (§1 #2, 3, 6, 7, 8, 9, 11) and the three figure cards (#4, #5, #10).
// ---------------------------------------------------------------------------------------------
const setup = (canonical, mustMention, extra = {}) => ({
  id: 'setup', type: 'equation', optional: true, prompt: 'Set up the equation (skippable — graded when tried)',
  canonical, var: extra.var ?? 'x', mustMention, ...extra,
});

const ang02 = {
  id: 'ang-02', module: 'M4', sheet: 'AP-1', src: '§1 #2', srcFile: AP(1), teacherNo: '2)',
  tier: 2, par: 90, skills: ['CS-LIN'], needs: [],
  stem: 'One of two complementary angles is twice the other.  Find the measures of the angles.',
  figure: null,
  parts: [
    setup('x+2x-90', [90], { alternates: ['x+x/2-90'], system: ['x+y-90', 'y-2x'] }),
    { id: 'm', type: 'multi', orderFree: true, prompt: 'The two angles', fields: [
      { key: 'a', label: 'one angle', answer: '30' },
      { key: 'b', label: 'the other angle', answer: '60' },
    ] },
  ],
  hints: [
    'Complementary angles add to 90°. Call the smaller angle x; "twice the other" makes the larger one 2x.',
    'Add the two expressions and set the sum equal to 90: x + 2x = 90.',
    '3x = 90 — divide by 3 for the smaller angle, then double it for the larger.',
  ],
  solution: [
    { say: 'Let the smaller angle be x. The other is twice it.', math: 'smaller = x,   larger = 2x' },
    { say: 'Complementary angles add to 90°.', math: 'x + 2x = 90' },
    { say: 'Combine and solve.', math: '3x = 90  →  x = 30' },
    { say: 'The larger angle is twice the smaller.', math: '2x = 60' },
    { say: 'Check: 30 + 60 = 90 ✓', math: 'the angles are 30° and 60°' },
  ],
  misconceptions: [
    { part: 'm', answer: '120', tag: 'used-180-for-comp', msg: 'Complementary angles add to 90°, not 180 — x + 2x = 90.' },
    { part: 'm', answer: '45', tag: 'arithmetic', msg: '45 + 45 = 90 splits it in half — but one angle must be TWICE the other: x + 2x = 90.' },
    { part: 'setup', answer: '3x = 90', tag: 'simplified-setup', msg: 'Write the equation as the sentence says it — x + 2x = 90 — and simplify on the next line.' },
  ],
  verified: true,
};

const ang03 = {
  id: 'ang-03', module: 'M4', sheet: 'AP-1', src: '§1 #3', srcFile: AP(1), teacherNo: '3)',
  tier: 2, par: 90, skills: ['CS-LIN'], needs: [],
  stem: 'One of two supplementary angles is 70° greater than the second.  Find the measure of the larger angle.',
  figure: null,
  parts: [
    setup('x+(x+70)-180', [180], { alternates: ['x+(x-70)-180'] }),
    { id: 'larger', type: 'num', label: 'larger angle =', answer: '125', asks: ['larger'],
      distractors: { smaller: '55', larger: '125' } },
  ],
  hints: [
    'Supplementary angles add to 180°. Call the second angle x; the first is 70 more: x + 70.',
    'Add them and set the sum equal to 180: x + (x + 70) = 180.',
    '2x + 70 = 180 gives x. The question asks for the LARGER angle — that is x + 70, not x.',
  ],
  solution: [
    { say: 'Let the second angle be x; the first is 70° greater.', math: '∠1 = x + 70,   ∠2 = x' },
    { say: 'Supplementary angles add to 180°.', math: 'x + (x + 70) = 180' },
    { say: 'Combine and solve.', math: '2x + 70 = 180  →  2x = 110  →  x = 55' },
    { say: 'The larger angle is x + 70.', math: '55 + 70 = 125' },
    { say: 'Check: 55 + 125 = 180 ✓', math: 'larger angle = 125°' },
  ],
  misconceptions: [
    { part: 'larger', answer: '55', tag: 'gave-smaller', msg: 'x = 55 is the smaller angle — the question asks for the larger one, x + 70.' },
    { part: 'larger', answer: '80', tag: 'used-90-for-supp', msg: 'Supplementary angles add to 180°, not 90 — x + (x + 70) = 180.' },
    { part: 'larger', answer: '70', tag: 'arithmetic', msg: '70 is how much bigger one angle is, not an angle — set up x + (x + 70) = 180 and solve.' },
  ],
  verified: true,
};

const ang04 = {
  id: 'ang-04', module: 'M8', sheet: 'AP-2', src: '§1 #4', srcFile: AP(1), teacherNo: '4)',
  tier: 4, par: 300, skills: ['SEG-ALG', 'QUAD-SOLVE'], needs: ['QUAD-SOLVE'],
  stem: 'In the following diagram, {seg AC} ≅ {seg CE} and {seg BD} bisects {seg AC} and {seg CE}. Find m, n, and the perimeter of triangle ACE.',
  note: 'No length is printed on CD and there are no tick marks — what the two givens tell you about the four half-sides is the first step.',
  // F2 carries its own printed labels (CB "3m + 4", BA "n − 1", DE "m² − 6", AE "8"); NO label on CD and no ticks are printed —
  // the solver must reason CB = BA = CD = DE from the two givens. `notToScale` because the labels are expressions.
  figure: { id: 'F2', rename: {}, notToScale: true },
  parts: [
    setup('m^2-6-(3m+4)', [], { var: 'm', prompt: 'Set up the equation for m (skippable — graded when tried)' }),
    { id: 'm', type: 'roots', var: 'm', label: 'm =', answer: ['5', '-2'], mustMention: null },
    { id: 'keep', type: 'reject', of: 'm', valid: ['5'], rejected: ['-2'], reason: 'negative side length', reasonKey: 'negative-length',
      distractors: ['both values work', '5 is too big for a side', '−2 does not satisfy the equation'] },
    { id: 'rest', type: 'multi', prompt: 'Now n and the perimeter', fields: [
      { key: 'n', label: 'n =', answer: '20' },
      { key: 'P', label: 'perimeter =', answer: '84' },
    ] },
  ],
  hints: [
    'BD bisects AC and CE, so B is the midpoint of AC and D is the midpoint of CE: CB = BA and CD = DE. And AC ≅ CE makes all four halves equal.',
    'DE and CB are two of those equal halves: m² − 6 = 3m + 4. Bring everything to one side and factor.',
    'm² − 3m − 10 = (m − 5)(m + 2). One root gives a negative side length. Use the good one to find CB, then n from n − 1 = CB, and the perimeter from the whole sides.',
  ],
  solution: [
    { say: 'BD bisects AC and CE, so B and D are midpoints: CB = BA and CD = DE. With AC ≅ CE, all four halves are equal.', math: 'CB = BA = CD = DE' },
    { say: 'Two of the halves have labels: DE = m² − 6 and CB = 3m + 4. Set them equal.', math: 'm² − 6 = 3m + 4' },
    { say: 'Bring everything to one side and factor.', math: 'm² − 3m − 10 = 0  →  (m − 5)(m + 2) = 0' },
    { say: 'Two roots. m = −2 makes CB = 3(−2) + 4 = −2, a negative side length — reject it.', math: 'm = 5   (m = −2 rejected: negative side length)' },
    { say: 'Now every half is CB = 3(5) + 4 = 19. BA is also 19, and BA = n − 1.', math: 'n − 1 = 19  →  n = 20' },
    { say: 'Whole sides: AC = 19 + 19 = 38, CE = 38, AE = 8.', math: 'P = 38 + 38 + 8 = 84' },
  ],
  misconceptions: [
    { part: 'm', answer: '5', tag: 'forgot-second-root', msg: 'That\'s one root — a quadratic has two. Set the other factor to 0, list both, then decide which one to keep.' },
    { part: 'keep', answer: 'keep -2', tag: 'kept-invalid-root', msg: 'm = −2 makes CB = 3(−2) + 4 = −2 — a side cannot have negative length.' },
    { part: 'keep', answer: 'reject 5', tag: 'rejected-valid-root', msg: 'm = 5 gives CB = 19 and DE = 19 — positive lengths, so 5 is the one to keep.' },
    { part: 'rest', answer: '19', tag: 'arithmetic', msg: '19 is the half-side CB. BA = n − 1 equals 19, so n is one more than that.' },
    { part: 'rest', answer: '18', tag: 'sign-flip', msg: 'n − 1 = 19 — add 1 to both sides, do not subtract.' },
    { part: 'rest', answer: '46', tag: 'half-side-perimeter', msg: '19 + 19 + 8 uses the half-sides CB and CD. The triangle\'s sides are AC = 38 and CE = 38.' },
    { part: 'rest', answer: '65', tag: 'half-side-perimeter', msg: 'One side was doubled and one was not — AC and CE are both 38 (two halves of 19 each).' },
    { part: 'setup', answer: 'm^2-6+3m+4', tag: 'midpoint-not-equal', msg: 'A midpoint makes the halves EQUAL — set m² − 6 equal to 3m + 4; do not add them.' },
  ],
  verified: true,
};

const ang05 = {
  id: 'ang-05', module: 'M7', sheet: 'AP-2', src: '§1 #5', srcFile: AP(1), teacherNo: '5)',
  tier: 4, par: 300, skills: ['BISECT-Q', 'QUAD-SOLVE'], needs: ['QUAD-SOLVE'],
  stem: '{m MAH} = x² + 3, {m HAC} = 11 - 7x, and {m MAC} = 6 -16x Does {ray AH} bisect {ang MAC}? Explain why or why not.',
  figure: { id: 'AH', rename: {}, labels: [{ angle: ['M', 'H'], text: 'x² + 3' }, { angle: ['H', 'C'], text: '11 − 7x' }], notToScale: true },
  parts: [
    setup('x^2+3+11-7x-(6-16x)', []),
    { id: 'x', type: 'roots', var: 'x', label: 'x =', answer: ['-8', '-1'], mustMention: null },
    { id: 'cases', type: 'cases', of: 'x', prompt: 'One case per root',
      cols: [
        { key: 'x', label: 'x' },
        { key: 'MAH', label: 'm∠MAH', wedge: 'H-M' },
        { key: 'HAC', label: 'm∠HAC', wedge: 'C-H' },
        { key: 'verdict', label: 'bisects?', type: 'verdict' },
      ],
      rows: [
        { x: '-8', MAH: '67', HAC: '67', verdict: 'YES' },
        { x: '-1', MAH: '4', HAC: '18', verdict: 'NO' },
      ] },
    { id: 'explain', type: 'strip', prompt: 'Explain both cases',
      slots: [
        { id: 'c1', type: 'chips', label: 'Case x = −8', chips: [
          { text: '{m MAH} = 67° = {m HAC}, so {ray AH} bisects {ang MAC}', role: 'required' },
          { text: 'x = −8', role: 'neutral' },
          { text: '{m MAC} = 6 − 16(−8) = 134°', role: 'neutral' },
          { text: '67 + 67 = 180, so {ray AH} bisects', role: 'forbidden', why: '67 + 67 = 134 = m∠MAC, not 180 — and a sum is never the test. Bisecting means the two halves are EQUAL.' },
          { text: 'x is negative, so this case is impossible', role: 'forbidden', why: 'A negative x is fine as long as the measures come out positive: x² + 3 = 67 and 11 − 7x = 67. Substitute before you reject.' },
        ] },
        { id: 'c2', type: 'chips', label: 'Case x = −1', chips: [
          { text: '{m MAH} = 4° ≠ 18° = {m HAC}, so {ray AH} does not bisect {ang MAC}', role: 'required' },
          { text: 'x = −1', role: 'neutral' },
          { text: '{m MAC} = 6 − 16(−1) = 22°', role: 'neutral' },
          { text: '4 + 18 = 22 = {m MAC}, so {ray AH} bisects', role: 'forbidden', why: 'Adding up to the whole angle is true of ANY ray inside it — that is how the equation was set up. Bisecting needs 4° = 18°, which is false.' },
        ] },
        { id: 'end', type: 'pick', label: 'Conclusion',
          options: [
            'bisects only when x = −8 — both cases stated',
            '{ray AH} always bisects {ang MAC}',
            '{ray AH} never bisects {ang MAC}',
            'bisects only when x = −1',
          ],
          answer: 'bisects only when x = −8 — both cases stated',
          why: {
            '{ray AH} always bisects {ang MAC}': 'When x = −1 the halves are 4° and 18° — not equal. The answer depends on which root you take.',
            '{ray AH} never bisects {ang MAC}': 'When x = −8 both halves are 67° — congruent, so it does bisect in that case.',
            'bisects only when x = −1': 'x = −1 gives 4° and 18°, which are NOT equal. It is x = −8 that gives equal halves (67° = 67°).',
          } },
      ],
      prose: 'Case x = −8: [[c1]]. Case x = −1: [[c2]]. So {ray AH} [[end]].' },
  ],
  hints: [
    'Ray AH lies inside ∠MAC, so the two small angles add up to the whole one: m∠MAH + m∠HAC = m∠MAC. Bisecting is a separate question — it needs the two halves to be EQUAL, and you check that after finding x.',
    '(x² + 3) + (11 − 7x) = 6 − 16x. Move everything to one side: x² + 9x + 8 = 0, then factor.',
    'x² + 9x + 8 = (x + 8)(x + 1). Substitute EACH root into x² + 3 and 11 − 7x and compare the two halves — one root gives equal halves, the other does not, and the answer must state both.',
  ],
  solution: [
    { say: 'AH is inside ∠MAC, so the two parts add to the whole (angle addition).', math: '(x² + 3) + (11 − 7x) = 6 − 16x' },
    { say: 'Collect terms on one side.', math: 'x² − 7x + 14 = 6 − 16x  →  x² + 9x + 8 = 0' },
    { say: 'Factor and use the zero product property.', math: '(x + 8)(x + 1) = 0  →  x = −8  or  x = −1' },
    { say: 'Case x = −8: substitute into both halves.', math: '{m MAH} = (−8)² + 3 = 67,   {m HAC} = 11 − 7(−8) = 67' },
    { say: 'Equal halves → ∠MAH ≅ ∠HAC → AH bisects ∠MAC. (Check the whole: 6 − 16(−8) = 134 = 67 + 67 ✓)', math: 'x = −8: YES, {ang MAH} ≅ {ang HAC}' },
    { say: 'Case x = −1: substitute again.', math: '{m MAH} = (−1)² + 3 = 4,   {m HAC} = 11 − 7(−1) = 18' },
    { say: 'Unequal halves → AH does not bisect. (Whole: 6 − 16(−1) = 22 = 4 + 18 ✓, but 4 ≠ 18.)', math: 'x = −1: NO, {ang MAH} ≇ {ang HAC}' },
    { say: 'Both roots give positive measures, so both cases are real and both must be stated.', math: 'AH bisects ∠MAC only when x = −8' },
  ],
  misconceptions: [
    { part: 'x', answer: '-8', tag: 'forgot-second-root', msg: 'That\'s one root — there\'s another. Set the other factor to 0 as well.' },
    { part: 'x', answer: '-1', tag: 'forgot-second-root', msg: 'That\'s one root — there\'s another. Set the other factor to 0 as well.' },
    { part: 'x', answer: '8', tag: 'sign-flip', msg: 'x + 8 = 0 gives x = −8, not 8. Check the sign when you move the 8 across.' },
    { part: 'x', answer: '1', tag: 'sign-flip', msg: 'x + 1 = 0 gives x = −1, not 1.' },
    { part: 'cases', answer: '-8', tag: 'missing-case', msg: 'Two roots means two cases — the x = −1 case (4° and 18°) has to be worked and stated too, even though the answer there is no.' },
    { part: 'setup', answer: 'x^2+3-(11-7x)', tag: 'assumed-bisects', msg: 'Setting the halves equal assumes the answer. Start from angle addition: (x² + 3) + (11 − 7x) = 6 − 16x, then compare the halves.' },
  ],
  verified: true,
};

const ang06 = {
  id: 'ang-06', module: 'M4', sheet: 'AP-3', src: '§1 #6', srcFile: AP(2), teacherNo: '6)',
  tier: 2, par: 90, skills: ['CS-LIN'], needs: [],
  stem: 'The measure of the supplement of an angle is 30° less than five times the measure of the complement.  Find the measure of the angle.',
  note: 'The printed question asks only for the angle; the teacher\'s key also lists the complement and the supplement — those are the two bonus boxes.',
  figure: null,
  parts: [
    setup('180-x-(5(90-x)-30)', [180, 90]),
    // The printed question asks only for the angle; the teacher's key adds ", the complement and the supplement." by hand —
    // those two are optional bonus fields (blank never blocks the clear; graded when filled).
    { id: 'm', type: 'multi', prompt: 'The angle (complement and supplement are bonus)', fields: [
      { key: 'angle', label: 'angle =', answer: '60' },
      { key: 'comp', label: 'complement =', answer: '30', bonus: true },
      { key: 'supp', label: 'supplement =', answer: '120', bonus: true },
    ] },
  ],
  hints: [
    'Let the angle be x. Its complement is 90 − x and its supplement is 180 − x.',
    '"The supplement is 30 less than five times the complement": 180 − x = 5(90 − x) − 30.',
    'Distribute the 5 and collect the x terms on one side: 4x = 240.',
  ],
  solution: [
    { say: 'Name the three quantities.', math: 'angle = x,   complement = 90 − x,   supplement = 180 − x' },
    { say: 'Translate the sentence: supplement = five times the complement, minus 30.', math: '180 − x = 5(90 − x) − 30' },
    { say: 'Distribute and simplify the right side.', math: '180 − x = 450 − 5x − 30 = 420 − 5x' },
    { say: 'Collect x on one side.', math: '4x = 240  →  x = 60' },
    { say: 'Then the complement and supplement.', math: 'complement = 90 − 60 = 30,   supplement = 180 − 60 = 120' },
    { say: 'Check: 5(30) − 30 = 120 ✓', math: 'angle 60°, complement 30°, supplement 120°' },
  ],
  misconceptions: [
    { part: 'm', answer: '30', tag: 'gave-complement', msg: '30 is the complement — the angle itself is x = 60.' },
    { part: 'm', answer: '120', tag: 'gave-supplement', msg: '120 is the supplement — the angle itself is x = 60.' },
    { part: 'm', answer: '75', tag: 'wrong-side-supp', msg: '75 comes from 180 − x = 5(90 − x) + 30. "30 less than" means subtract: 180 − x = 5(90 − x) − 30.' },
    { part: 'setup', answer: '180-x=5(90-x)+30', tag: 'wrong-side-supp', msg: '"30 less than" means subtract 30 from the five-times piece: 180 − x = 5(90 − x) − 30.' },
  ],
  verified: true,
};

const ang07 = {
  id: 'ang-07', module: 'M4', sheet: 'AP-3', src: '§1 #7', srcFile: AP(2), teacherNo: '7)',
  tier: 2, par: 90, skills: ['CS-RATIO'], needs: [],
  stem: 'Two supplementary angles are in the ratio 7:2.  Find the measure of each.',
  figure: null,
  parts: [
    setup('7x+2x-180', [180]),
    { id: 'm', type: 'multi', orderFree: true, prompt: 'The two angles', fields: [
      { key: 'a', label: 'one angle', answer: '140' },
      { key: 'b', label: 'the other angle', answer: '40' },
    ] },
  ],
  hints: [
    'A ratio of 7:2 means the angles are 7 parts and 2 parts of the same size: 7x and 2x.',
    'Supplementary angles add to 180: 7x + 2x = 180.',
    '9x = 180 gives one part. Multiply it by 7 and by 2.',
  ],
  solution: [
    { say: 'Write the two angles as multiples of one part x.', math: '7x  and  2x' },
    { say: 'Supplementary: they add to 180.', math: '7x + 2x = 180' },
    { say: 'Solve for one part.', math: '9x = 180  →  x = 20' },
    { say: 'Scale up each part.', math: '7(20) = 140,   2(20) = 40' },
    { say: 'Check: 140 + 40 = 180 ✓ and 140:40 = 7:2 ✓', math: 'the angles are 140° and 40°' },
  ],
  misconceptions: [
    { part: 'm', answer: '70', tag: 'used-90-for-supp', msg: 'Supplementary angles add to 180, not 90 — 9x = 180, so one part is 20.' },
    { part: 'm', answer: '7', tag: 'ratio-as-measure', msg: '7 and 2 are parts, not degrees. Nine parts make 180°, so one part is 20° — then 7 parts and 2 parts.' },
    { part: 'm', answer: '20', tag: 'stopped-early', msg: '20 is one part (x). The angles are 7x and 2x.' },
  ],
  verified: true,
};

const ang08 = {
  id: 'ang-08', module: 'M4', sheet: 'AP-3', src: '§1 #8', srcFile: AP(2), teacherNo: '8)',
  tier: 2, par: 90, skills: ['CS-RATIO'], needs: [],
  stem: 'The ratio of the measure of the supplement of an angle to the measure of the complement of the angle is 5:2.  Find the measure of the supplement.',
  figure: null,
  parts: [
    setup('2(180-x)-5(90-x)', [180, 90]),
    { id: 'supp', type: 'num', label: 'supplement =', answer: '150', asks: ['supp'],
      distractors: { angle: '30', comp: '60', supp: '150' } },
  ],
  hints: [
    'Let the angle be x: supplement 180 − x, complement 90 − x. Their ratio is 5 to 2.',
    'Write the ratio as a fraction and cross-multiply: (180 − x)/(90 − x) = 5/2 → 2(180 − x) = 5(90 − x).',
    '360 − 2x = 450 − 5x gives 3x = 90. Then the question wants the SUPPLEMENT, 180 − x — not x.',
  ],
  solution: [
    { say: 'Name the pieces.', math: 'angle = x,   supplement = 180 − x,   complement = 90 − x' },
    { say: 'Supplement : complement = 5 : 2.', math: '(180 − x) : (90 − x) = 5 : 2' },
    { say: 'Cross-multiply.', math: '2(180 − x) = 5(90 − x)  →  360 − 2x = 450 − 5x' },
    { say: 'Solve for x.', math: '3x = 90  →  x = 30' },
    { say: 'The question asks for the supplement.', math: '180 − 30 = 150   (complement = 60; check 150:60 = 5:2 ✓)' },
  ],
  misconceptions: [
    { part: 'supp', answer: '30', tag: 'gave-angle', msg: 'x = 30 is the angle — the question asks for its supplement, 180 − x.' },
    { part: 'supp', answer: '60', tag: 'gave-complement', msg: '60 is the complement — the question asks for the supplement, 180 − 30.' },
    { part: 'supp', answer: '120', tag: 'gave-complement', msg: '120 is the supplement of the complement (180 − 60). The question wants the supplement of the ANGLE: 180 − 30 = 150.' },
    { part: 'setup', answer: '5(180-x)=2(90-x)', tag: 'reversed-ratio', msg: 'Supplement : complement = 5 : 2 cross-multiplies to 2(180 − x) = 5(90 − x) — the 5 pairs with the complement side.' },
  ],
  verified: true,
};

const ang09 = {
  id: 'ang-09', module: 'M5', sheet: 'AP-3', src: '§1 #9', srcFile: AP(2), teacherNo: '9)',
  tier: 3, par: 180, skills: ['CS-QUAD', 'QUAD-SOLVE'], needs: ['QUAD-SOLVE'],
  stem: 'The ratio of the product of an angle and its supplement to the product of the angle and its complement is 13:4. Find the angle',
  figure: null,
  parts: [
    setup('4x(180-x)-13x(90-x)', [180, 90]),
    { id: 'x', type: 'roots', var: 'x', label: 'x =', answer: ['50', '0'], mustMention: null },
    { id: 'keep', type: 'reject', of: 'x', valid: ['50'], rejected: ['0'], reason: 'zero angle', reasonKey: 'zero-angle',
      distractors: ['both values work', '50 is obtuse so reject it', '0 does not satisfy the equation'] },
    { id: 'angle', type: 'num', label: 'angle =', answer: '50', asks: ['angle'],
      distractors: { angle: '50', comp: '40', supp: '130' },
      bonus: [{ key: 'comp', label: 'complement =', answer: '40' }, { key: 'supp', label: 'supplement =', answer: '130' }] },
  ],
  hints: [
    'Let the angle be x. The two products are x(180 − x) and x(90 − x); their ratio is 13 to 4.',
    'Cross-multiply: 4x(180 − x) = 13x(90 − x). Do NOT divide both sides by x — you would lose a root.',
    '720x − 4x² = 1170x − 13x² → bring everything to one side: 9x² − 450x = 0. Factor out the GCF 9x and set each factor to 0 — one of the two roots is not an angle.',
  ],
  solution: [
    { say: 'Name the pieces and write the ratio of the two products.', math: 'x(180 − x) : x(90 − x) = 13 : 4' },
    { say: 'Cross-multiply.', math: '4x(180 − x) = 13x(90 − x)' },
    { say: 'Expand both sides.', math: '720x − 4x² = 1170x − 13x²' },
    { say: 'Bring everything to one side.', math: '9x² − 450x = 0' },
    { say: 'Factor out the GCF 9x and use the zero product property.', math: '9x(x − 50) = 0  →  x = 0  or  x = 50' },
    { say: 'x = 0 is a zero angle (and makes both products 0) — reject it.', math: 'angle = 50°   (complement 40°, supplement 130°)' },
  ],
  misconceptions: [
    { part: 'x', answer: '50', tag: 'forgot-second-root', msg: 'Dividing both sides by x throws away a root. Factor instead and set BOTH factors to 0 — list both roots, then reject the one that is not an angle.' },
    { part: 'keep', answer: 'keep 0', tag: 'kept-invalid-root', msg: 'An angle of 0° is not an angle — and it makes both products 0, so the ratio is meaningless. Reject it.' },
    { part: 'keep', answer: 'reject 50', tag: 'rejected-valid-root', msg: '50° has a complement of 40° and a supplement of 130°, all positive — keep it.' },
    { part: 'angle', answer: '40', tag: 'gave-complement', msg: '40 is the complement — the question asks for the angle, x = 50.' },
    { part: 'angle', answer: '130', tag: 'gave-supplement', msg: '130 is the supplement — the question asks for the angle, x = 50.' },
    { part: 'setup', answer: '13x(180-x)=4x(90-x)', tag: 'reversed-ratio', msg: '(supplement product) : (complement product) = 13 : 4 cross-multiplies to 4·x(180 − x) = 13·x(90 − x).' },
  ],
  verified: true,
};

const ang10 = {
  id: 'ang-10', module: 'M6', sheet: 'AP-4', src: '§1 #10', srcFile: AP(2), teacherNo: '10)',
  tier: 4, par: 300, skills: ['FIG-ALG', 'QUAD-SOLVE'], needs: ['QUAD-SOLVE'],
  stem: 'Given the following diagram, where Point F is on {line EC} and {line AD}, identify: x, m< CFD, m<DFE',
  note: 'The sheet types "m<" for m∠ — find x, then m∠CFD and m∠DFE. Both roots count: the key gives both sets of measures.',
  // F1 with the printed A on the left; "-x + 84" inside ∠BFC, "2x²- 4x + 3" inside ∠AFE; the red square between FB and FA.
  figure: { id: 'F1', rename: {}, labels: [{ angle: ['B', 'C'], text: '−x + 84' }, { angle: ['A', 'E'], text: '2x² − 4x + 3' }], notToScale: true },
  parts: [
    setup('(-x+84)+(2x^2-4x+3)-90', [90]),
    { id: 'x', type: 'roots', var: 'x', label: 'x =', answer: ['3', '-1/2'], mustMention: null },
    { id: 'keep', type: 'reject', of: 'x', valid: ['3', '-1/2'], rejected: [], reason: 'both give positive angle measures', reasonKey: 'both-valid',
      distractors: ['−1/2 is negative so reject it', 'only integers are allowed', '3 makes m∠BFC = 81 which is too big'] },
    { id: 'cases', type: 'cases', of: 'x', prompt: 'One case per root',
      cols: [
        { key: 'x', label: 'x' },
        { key: 'CFD', label: 'm∠CFD', wedge: 'C-D' },
        { key: 'DFE', label: 'm∠DFE', wedge: 'D-E' },
      ],
      rows: [
        { x: '3', CFD: '9', DFE: '171' },
        { x: '-1/2', CFD: '5.5', DFE: '174.5' },
      ] },
  ],
  hints: [
    '∠AFE and ∠CFD are vertical angles (lines AD and EC cross at F), so m∠CFD = 2x² − 4x + 3 as well. And the square at F makes ∠BFD a right angle.',
    'Ray FC splits the right angle ∠BFD: (−x + 84) + (2x² − 4x + 3) = 90.',
    '2x² − 5x − 3 = 0 → (2x + 1)(x − 3) = 0. Substitute EACH root into 2x² − 4x + 3 for m∠CFD — both come out positive, so both stay — and since C-F-E is a straight line, m∠DFE = 180 − m∠CFD.',
  ],
  solution: [
    { say: 'Vertical angles are congruent: ∠AFE and ∠CFD are across F from each other.', math: '{m CFD} = 2x² − 4x + 3' },
    { say: 'The square marks ∠BFA = 90°, and A-F-D is a line, so ∠BFD = 90° too. Ray FC splits it.', math: '{m BFC} + {m CFD} = 90' },
    { say: 'Substitute the expressions.', math: '(−x + 84) + (2x² − 4x + 3) = 90' },
    { say: 'Collect terms on one side.', math: '2x² − 5x + 87 = 90  →  2x² − 5x − 3 = 0' },
    { say: 'Factor (ac-method: 2·(−3) = −6; 1 and −6) and use the zero product property.', math: '(2x + 1)(x − 3) = 0  →  x = 3  or  x = −1/2' },
    { say: 'Case x = 3: ∠CFD from the expression, then ∠DFE from the straight angle CFE (C-F-E is a line).', math: '{m CFD} = 2(9) − 12 + 3 = 9,   {m DFE} = 180 − 9 = 171' },
    { say: 'Case x = −1/2: the same two steps.', math: '{m CFD} = 2(1/4) + 2 + 3 = 5.5,   {m DFE} = 180 − 5.5 = 174.5' },
    { say: 'Both roots give positive angle measures (m∠BFC = 81 and 84.5), so both are kept — the teacher\'s key lists both.', math: 'x = 3: 9°, 171°   ·   x = −1/2: 5.5°, 174.5°' },
  ],
  misconceptions: [
    { part: 'x', answer: '3', tag: 'forgot-second-root', msg: 'That\'s one root — there\'s another. Set each factor to 0.' },
    { part: 'x', answer: '-1/2', tag: 'forgot-second-root', msg: 'That\'s one root — there\'s another. Set each factor to 0.' },
    { part: 'x', answer: '1/2', tag: 'sign-flip', msg: '2x + 1 = 0 gives x = −1/2, not +1/2.' },
    { part: 'keep', answer: 'reject -1/2', tag: 'rejected-valid-root', msg: 'A negative x is not automatically wrong — at x = −1/2, m∠CFD = 5.5 and m∠BFC = 84.5, both positive. Keep it.' },
    { part: 'cases', answer: '3', tag: 'missing-case', msg: 'Two roots, two cases — work out m∠CFD and m∠DFE for x = −1/2 as well.' },
    { part: 'cases', answer: '81', tag: 'swapped-fields', msg: '81 is m∠BFC (−3 + 84). m∠CFD is the vertical partner of ∠AFE: 2x² − 4x + 3.' },
    { part: 'setup', answer: '-x+84=2x^2-4x+3', tag: 'linear-pair-set-equal', msg: '∠BFC and ∠CFD are not equal — together they fill the right angle: (−x + 84) + (2x² − 4x + 3) = 90.' },
    { part: 'setup', answer: '-x+84+2x^2-4x+3=180', tag: 'vertical-set-180', msg: '∠BFC + ∠CFD make the RIGHT angle ∠BFD, so the sum is 90, not 180.' },
  ],
  verified: true,
};

const ang11 = {
  id: 'ang-11', module: 'M4', sheet: 'AP-4', src: '§1 #11', srcFile: AP(2), teacherNo: '11)',
  tier: 2, par: 90, skills: ['CS-LIN'], needs: [],
  stem: 'Four times the measure of complement of an angle is 12 degrees more than twice the difference between the measures of the complement and its supplement',
  figure: null,
  parts: [
    setup('4(90-x)-(12+2((180-x)-(90-x)))', [90, 180]),
    { id: 'angle', type: 'num', label: 'angle =', answer: '42', asks: ['angle'],
      distractors: { angle: '42', comp: '48', supp: '138' },
      bonus: [{ key: 'comp', label: 'complement =', answer: '48' }, { key: 'supp', label: 'supplement =', answer: '138' }] },
  ],
  hints: [
    'Let the angle be x: complement 90 − x, supplement 180 − x. "The difference between the complement and its supplement" is (180 − x) − (90 − x) — and the x cancels.',
    '4(90 − x) = 12 + 2[(180 − x) − (90 − x)]. Simplify the bracket first: it is just 90.',
    '360 − 4x = 12 + 180 = 192. Solve for x.',
  ],
  solution: [
    { say: 'Name the pieces.', math: 'angle = x,   complement = 90 − x,   supplement = 180 − x' },
    { say: 'Translate: four times the complement = 12 more than twice (supplement − complement).', math: '4(90 − x) = 12 + 2[(180 − x) − (90 − x)]' },
    { say: 'The difference between a supplement and a complement is always 90 — the x cancels.', math: '(180 − x) − (90 − x) = 90' },
    { say: 'So the right side is a number.', math: '360 − 4x = 12 + 2(90) = 192' },
    { say: 'Solve.', math: '−4x = −168  →  x = 42' },
    { say: 'Then the complement and supplement (the key lists them).', math: 'angle 42°,   complement 48°,   supplement 138°' },
  ],
  misconceptions: [
    { part: 'angle', answer: '48', tag: 'gave-complement', msg: '48 is the complement — the angle itself is x = 42.' },
    { part: 'angle', answer: '138', tag: 'gave-supplement', msg: '138 is the supplement — the angle itself is x = 42.' },
    { part: 'angle', answer: '-42', tag: 'sign-flip', msg: '−4x = −168 gives x = +42 — dividing two negatives gives a positive.' },
    { part: 'angle', answer: '87', tag: 'arithmetic', msg: 'Twice the difference is 2·90 = 180, and 12 more is 192: 360 − 4x = 192.' },
    { part: 'setup', answer: '4(90-x)=12+2((90-x)-(180-x))', tag: 'wrong-side-supp', msg: '"The difference between the complement and its supplement" is supplement − complement = 90 (positive); reversed it gives −90 and a negative angle.' },
  ],
  verified: true,
};

export const warmupCards = Object.freeze(WU);
export const practiceCards = Object.freeze([ang02, ang03, ang04, ang05, ang06, ang07, ang08, ang09, ang10, ang11]);
/** All 15 Angles-sheet cards in sheet order — what site/data/cards.js imports. */
export const cards = Object.freeze([...warmupCards, ...practiceCards]);
export const byId = Object.freeze(Object.fromEntries(cards.map((c) => [c.id, c])));
export const ANGLES_IDS = Object.freeze(cards.map((c) => c.id));
export default cards;
