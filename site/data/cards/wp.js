// site/data/cards/wp.js — T06c content: the WP sheet ("4a. comp supp word problems"), wp-01..16.
// Content authority: content/SOURCE.md §3 (answers, setups) and the teacher's handwritten key pages
// (local only under content/, never served — BUILD-POLICY §1); wording authority:
// content/transcript.md (T00) — `stem`, `srcFile` and the sheet instruction are copied byte-for-byte.
// Every canonical equation was solved with site/js/grader/poly.js and matched against the teacher's
// answers before this file was written (notes/T06c.md → "How to test"; notes/check-wp.mjs).
//
// Card fields follow COMPOSED S6 (scan fields dropped per BUILD-POLICY §1). Extra, documented fields:
//   room          'grotto' | 'nested' | 'ratio' — the M4 room of COMPOSED S2 (mirrors data/modules.js M4_ROOMS); null on wp-12 (M5)
//   instruction   the sheet's printed instruction (shared string WP_INSTRUCTION), shown once above the stem
//   setupKey      the teacher's key header (WP_SETUP_KEY): "angle = x · comp of angle = 90 − x · supp of angle = 180 − x"
//   parts[].text  on the `equation` part: the setup as the teacher wrote it, for display (unicode), never graded
//   parts[].roots on the `equation` part: the intended root(s) of `canonical` (strings), so the S3 fallback
//                 "LHS − RHS = 0 at every intended root" needs no solving at runtime
//   parts[].alternates  on the `equation` part: other correct setups where x names a different quantity
//                 ({canonical, mustMention, roots, means, text}); accept any of them as a correct setup
//   parts[].of    on wp-12's final `num`: the `roots` part it follows (the S2 "rootcase roots → num" chain)
//   misconceptions[].part / .field   which part the wrong `answer` belongs to; `field` only on the orderFree multi (wp-09) —
//                 on wp-01/02/03 the entries are part-level (the value is wrong in either box); field swaps are the grader's own line
//   misconceptions[].gives           for `equation` misconceptions: the x their wrong equation yields (string)
//   (the 11 grouping-misread entries carried `requestedTag: 'grouping'` at hand-off; the integrator added the
//    catalogue key in site/data/misconceptions.js and swapped them to `tag: 'grouping'` — see notes/INTEGRATION-W1.md)
//
// Grader contract (COMPOSED S3): `equation.canonical` is LHS − RHS in the site's expression grammar with `var`;
// `num.asks` is the chain from the solved angle to the asked quantity; `num.distractors` names every
// intermediate a student might stop at (strings); `multi.fields` are graded independently (orderFree = multiset);
// `ratio.answer` is ordered and reduced. Distractor vocabulary: angle (the sentence's angle x), comp (90 − angle),
// supp (180 − angle), smaller / larger (the two angles of the pair the problem describes).
// Display strings use − ½ ⅓ ² ° (mathfmt passes them through; normalize.js maps − → -, ² → ^2, ½ → (1/2)).

export const WP_INSTRUCTION =
  'Solve each problem by setting up an algebraic equation. (No guess ‘n’ check).\n'
  + 'Then answer the question.  Do your work on a separate paper. Number the problems. Show all work';

export const WP_SETUP_KEY = 'angle = x · comp of angle = 90 − x · supp of angle = 180 − x';

const ROOM_SKILL = { grotto: 'CS-LIN', nested: 'CS-LIN', ratio: 'CS-RATIO' };

/** Boilerplate shared by every WP card; everything content-bearing is spelled out per card below. */
function wp(n, room, fields) {
  const id = `wp-${String(n).padStart(2, '0')}`;
  return {
    id, module: room ? 'M4' : 'M5', room, sheet: 'WP', src: `§3 #${n}`,
    srcFile: `source/wordprobs.html #${n}`,
    tier: 2, par: 150, skills: [room ? ROOM_SKILL[room] : 'CS-QUAD'], needs: [],
    instruction: WP_INSTRUCTION, setupKey: WP_SETUP_KEY, figure: null,
    ...fields,
    verified: true,
  };
}

export const wpCards = [
  // ---------------------------------------------------------------------------------------------
  wp(1, 'grotto', {
    stem: 'The supplement of an angle is 10 more than nine times the angle. What is the measure of the angle and its complement?',
    parts: [
      { id: 'setup', type: 'equation', label: 'Set up the equation', var: 'x',
        canonical: '180-x-(10+9x)', mustMention: [180], roots: ['17'], text: '180 − x = 10 + 9x',
        alternates: [
          { canonical: '(180-(90-x))-(10+9(90-x))', mustMention: [180, 90], roots: ['73'],
            means: 'x = the complement (the angle is 90 − x, its supplement 180 − (90 − x))', text: '180 − (90 − x) = 10 + 9(90 − x)' },
        ] },
      { id: 'answer', type: 'multi', fields: [
        { key: 'angle', label: 'angle =', answer: '17', asks: ['angle'], distractors: { comp: '73', supp: '163' } },
        { key: 'comp', label: 'complement =', answer: '73', asks: ['comp'], distractors: { angle: '17', supp: '163' } },
      ] },
    ],
    hints: [
      'Supplement means 180 − x. "Is" is the equals sign, and "10 more than nine times the angle" is 9x + 10.',
      'Set up: 180 − x = 10 + 9x — the supplement alone on the left, the rest of the sentence on the right.',
      'Collect the x terms: 180 − 10 = 9x + x → 170 = 10x. Solve for x; the complement is then 90 − x.',
    ],
    solution: [
      { say: 'Let x be the angle; its supplement is 180 − x', math: 'angle = x,  supp of angle = 180 − x' },
      { say: 'Translate the sentence: the supplement IS 10 more than nine times the angle', math: '180 − x = 10 + 9x' },
      { say: 'Add x to both sides, subtract 10', math: '170 = 10x' },
      { say: 'Divide by 10', math: '17 = x' },
      { say: 'The angle', math: 'angle = 17°' },
      { say: 'Its complement is 90 − x', math: 'comp of angle = 90 − 17 = 73°' },
    ],
    misconceptions: [
      { part: 'setup', answer: '90 - x = 10 + 9x', gives: '8', tag: 'used-90-for-supp',
        msg: '90 − x is the complement. The sentence says supplement, so the left side is 180 − x.' },
      { part: 'setup', answer: '180 - x + 10 = 9x', gives: '19', tag: 'wrong-side-supp',
        msg: '"10 more than nine times the angle" is 9x + 10 — the 10 belongs with the 9x, not with the supplement.' },
      { part: 'setup', answer: '180 - x = 9(x + 10)', gives: '9', tag: 'grouping',
        msg: 'Nine times the angle, then 10 more: 9x + 10. Multiplying 9(x + 10) makes it "nine times ten more than the angle".' },
      { part: 'answer', answer: '163', tag: 'gave-supplement',
        msg: '163 is the supplement (180 − x). The question asks for the angle and its complement (90 − x).' },
      { part: 'answer', answer: '8', tag: 'used-90-for-supp',
        msg: 'x = 8 comes from 90 − x on the left. The supplement is 180 − x, so 180 − x = 10 + 9x.' },
      { part: 'answer', answer: '19', tag: 'wrong-side-supp',
        msg: 'x = 19 comes from 180 − x + 10 = 9x. "10 more than nine times the angle" is 9x + 10, on the right.' },
    ],
  }),

  // ---------------------------------------------------------------------------------------------
  wp(2, 'nested', {
    stem: 'The supplement of an angle less 14 is three times the complement of the angle. What is the angle and its supplement?',
    parts: [
      { id: 'setup', type: 'equation', label: 'Set up the equation', var: 'x',
        canonical: '180-x-14-3(90-x)', mustMention: [180, 90], roots: ['52'], text: '180 − x − 14 = 3(90 − x)',
        alternates: [
          { canonical: 'x-14-3(x-90)', mustMention: [90], roots: ['128'],
            means: 'x = the supplement (the complement is then x − 90)', text: 'x − 14 = 3(x − 90)' },
        ] },
      { id: 'answer', type: 'multi', fields: [
        { key: 'angle', label: 'angle =', answer: '52', asks: ['angle'], distractors: { comp: '38', supp: '128' } },
        { key: 'supp', label: 'supplement =', answer: '128', asks: ['supp'], distractors: { angle: '52', comp: '38' } },
      ] },
    ],
    hints: [
      'Supplement = 180 − x, complement = 90 − x. "The supplement … less 14" takes 14 off the supplement: (180 − x) − 14.',
      'Set up: 180 − x − 14 = 3(90 − x). Distribute the 3 on the right.',
      '180 − x − 14 = 270 − 3x → bring the x terms together: 2x − 14 = 90 → 2x = 104. Then the supplement is 180 − x.',
    ],
    solution: [
      { say: 'Let x be the angle: supplement 180 − x, complement 90 − x', math: 'angle = x,  supp = 180 − x,  comp = 90 − x' },
      { say: 'The supplement less 14 IS three times the complement', math: '180 − x − 14 = 3(90 − x)' },
      { say: 'Distribute the 3', math: '180 − x − 14 = 270 − 3x' },
      { say: 'Add 3x to both sides and subtract 180', math: '2x − 14 = 90' },
      { say: 'Add 14', math: '2x = 104' },
      { say: 'Divide by 2', math: 'x = 52' },
      { say: 'The angle and its supplement', math: 'angle = 52°,  supp = 180 − 52 = 128°' },
    ],
    misconceptions: [
      { part: 'setup', answer: '180 - x - 14 = 3(180 - x)', gives: '187', tag: 'used-180-for-comp',
        msg: '180 − x is the supplement. The right side says complement, which is 90 − x: 3(90 − x).' },
      { part: 'setup', answer: '90 - x - 14 = 3(90 - x)', gives: '97', tag: 'used-90-for-supp',
        msg: 'The left side is the supplement, 180 − x. Only the complement on the right uses 90 − x.' },
      { part: 'setup', answer: '180 - (x - 14) = 3(90 - x)', gives: '38', tag: 'grouping',
        msg: '"The supplement of an angle, less 14" subtracts 14 from the supplement: (180 − x) − 14, not 180 − (x − 14).' },
      { part: 'answer', answer: '38', tag: 'gave-complement',
        msg: '38 is the complement (90 − x). The question asks for the angle and its supplement (180 − x).' },
      { part: 'answer', answer: '187', tag: 'used-180-for-comp',
        msg: 'x = 187 comes from 3(180 − x) on the right — an angle over 180. Three times the complement is 3(90 − x).' },
      { part: 'answer', answer: '97', tag: 'used-90-for-supp',
        msg: 'x = 97 comes from 90 − x − 14 on the left. The supplement is 180 − x.' },
    ],
  }),

  // ---------------------------------------------------------------------------------------------
  wp(3, 'nested', {
    stem: 'An angle plus its complement is 6 more than half of the supplement of the angle. What is the measure of the angle and its complement?',
    parts: [
      { id: 'setup', type: 'equation', label: 'Set up the equation', var: 'x',
        canonical: 'x+(90-x)-(6+(180-x)/2)', mustMention: [90, 180], roots: ['12'], text: 'x + (90 − x) = 6 + ½(180 − x)',
        alternates: [
          { canonical: '(90-x)+x-(6+(180-(90-x))/2)', mustMention: [90, 180], roots: ['78'],
            means: 'x = the complement (the angle is 90 − x)', text: '(90 − x) + x = 6 + ½(180 − (90 − x))' },
        ] },
      { id: 'answer', type: 'multi', fields: [
        { key: 'angle', label: 'angle =', answer: '12', asks: ['angle'], distractors: { comp: '78', supp: '168' } },
        { key: 'comp', label: 'complement =', answer: '78', asks: ['comp'], distractors: { angle: '12', supp: '168' } },
      ] },
    ],
    hints: [
      'An angle plus its complement is x + (90 − x). Half of the supplement is ½(180 − x).',
      'Set up: x + (90 − x) = 6 + ½(180 − x). The left side collapses: x + 90 − x = 90.',
      '90 = 6 + ½(180 − x) → 84 = ½(180 − x) → 168 = 180 − x. One more step for x; the complement is 90 − x.',
    ],
    solution: [
      { say: 'Let x be the angle: complement 90 − x, supplement 180 − x', math: 'angle = x,  comp = 90 − x,  supp = 180 − x' },
      { say: 'Angle plus complement IS 6 more than half the supplement', math: 'x + 90 − x = 6 + ½(180 − x)' },
      { say: 'The x terms on the left cancel (x + 90 − x = 90); subtract 6', math: '84 = ½(180 − x)' },
      { say: 'Multiply by 2', math: '168 = 180 − x' },
      { say: 'Subtract 180', math: '−12 = −x' },
      { say: 'The angle and its complement', math: 'x = 12°,  comp = 90 − 12 = 78°' },
    ],
    misconceptions: [
      { part: 'setup', answer: 'x + (90 - x) = 6 + (90 - x)/2', gives: '-78', tag: 'used-90-for-supp',
        msg: 'Half of the supplement is ½(180 − x). The 90 − x on the left is the complement; the supplement is 180 − x.' },
      { part: 'setup', answer: 'x + (180 - x) = 6 + (180 - x)/2', gives: '-168', tag: 'used-180-for-comp',
        msg: '"An angle plus its complement" is x + (90 − x). Only the supplement on the right is 180 − x.' },
      { part: 'answer', answer: '168', tag: 'gave-supplement',
        msg: '168 is the supplement (180 − x). The question asks for the angle and its complement (90 − x).' },
      { part: 'answer', answer: '84', tag: 'stopped-early',
        msg: '84 is the right side after subtracting 6: 84 = ½(180 − x). Keep solving — double it, then find x.' },
    ],
  }),

  // ---------------------------------------------------------------------------------------------
  wp(4, 'grotto', {
    stem: 'The measure of an angle is 6 more than twice the measure of its complement. Find the measure of the larger of these two angles.',
    parts: [
      { id: 'setup', type: 'equation', label: 'Set up the equation', var: 'x',
        canonical: 'x-(6+2(90-x))', mustMention: [90], roots: ['62'], text: 'x = 6 + 2(90 − x)',
        alternates: [
          { canonical: '90-x-(6+2x)', mustMention: [90], roots: ['28'],
            means: 'x = the complement (the angle is 90 − x)', text: '90 − x = 6 + 2x' },
        ] },
      { id: 'answer', type: 'num', label: 'larger angle =', answer: '62', asks: ['larger'],
        distractors: { comp: '28', smaller: '28', supp: '118' } },
    ],
    hints: [
      'Complement = 90 − x. "The angle is 6 more than twice its complement" puts the angle alone on the left.',
      'Set up: x = 6 + 2(90 − x). Distribute the 2.',
      'x = 6 + 180 − 2x → 3x = 186. Solve for x, then compare x with 90 − x: the question wants the larger of the two.',
    ],
    solution: [
      { say: 'Let x be the angle; its complement is 90 − x', math: 'angle = x,  comp = 90 − x' },
      { say: 'The angle IS 6 more than twice the complement', math: 'x = 6 + 2(90 − x)' },
      { say: 'Distribute the 2', math: 'x = 6 + 180 − 2x' },
      { say: 'Add 2x to both sides', math: '3x = 186' },
      { say: 'Divide by 3', math: 'x = 62' },
      { say: 'The two angles are 62° and 90 − 62 = 28°; the larger is the angle itself', math: 'larger is 62°' },
    ],
    misconceptions: [
      { part: 'setup', answer: 'x = 6 + 2(180 - x)', gives: '122', tag: 'used-180-for-comp',
        msg: 'The sentence says complement: 90 − x. 180 − x would be the supplement.' },
      { part: 'setup', answer: 'x + 6 = 2(90 - x)', gives: '58', tag: 'wrong-side-supp',
        msg: '"6 more than twice the complement" is 2(90 − x) + 6 — the 6 goes with the complement side, and the angle stands alone.' },
      { part: 'answer', answer: '28', tag: 'gave-smaller',
        msg: '28 is the complement, the smaller of the two. The question asks for the larger — the angle, x.' },
      { part: 'answer', answer: '118', tag: 'gave-supplement',
        msg: '118 is the supplement of the angle. These two angles are complementary (they add to 90); the larger is the angle x itself.' },
      { part: 'answer', answer: '122', tag: 'used-180-for-comp',
        msg: 'x = 122 comes from 2(180 − x). Twice the complement is 2(90 − x).' },
    ],
  }),

  // ---------------------------------------------------------------------------------------------
  wp(5, 'ratio', {
    par: 180,
    stem: 'Two supplementary angles are in a ratio of 5:7. Find the complement of the smaller angle.',
    parts: [
      { id: 'setup', type: 'equation', label: 'Set up the equation', var: 'x',
        canonical: 'x/(180-x)-5/7', mustMention: [180], roots: ['75'], text: 'x/(180 − x) = 5/7',
        alternates: [
          { canonical: '5x+7x-180', mustMention: [180], roots: ['15'],
            means: 'x = one part (the angles are 5x and 7x)', text: '5x + 7x = 180' },
          { canonical: 'x/(180-x)-7/5', mustMention: [180], roots: ['105'],
            means: 'x = the larger angle', text: 'x/(180 − x) = 7/5' },
        ] },
      { id: 'answer', type: 'num', label: 'complement of the smaller angle =', answer: '15', asks: ['smaller', 'comp'],
        distractors: { smaller: '75', larger: '105' } },
    ],
    hints: [
      'A ratio of 5:7 means smaller : larger = 5/7. Supplementary angles add to 180, so if the smaller is x the other is 180 − x.',
      'Set up: x/(180 − x) = 5/7, then cross-multiply: 7x = 5(180 − x).',
      '7x = 900 − 5x → 12x = 900. That x is the smaller angle — the question wants its complement, 90 − x.',
    ],
    solution: [
      { say: 'Let x be the smaller angle; its supplement (the other angle) is 180 − x', math: 'smaller = x,  other = 180 − x' },
      { say: 'The ratio of smaller to larger is 5 to 7', math: 'x/(180 − x) = 5/7' },
      { say: 'Cross-multiply', math: '7x = 5(180 − x)' },
      { say: 'Distribute', math: '7x = 900 − 5x' },
      { say: 'Add 5x', math: '12x = 900' },
      { say: 'Divide by 12', math: 'x = 75' },
      { say: 'The question asks for the complement of the smaller angle', math: 'comp of 75° is 15°' },
    ],
    misconceptions: [
      { part: 'setup', answer: 'x/(90 - x) = 5/7', gives: '37.5', tag: 'used-90-for-supp',
        msg: 'The two angles are supplementary — they add to 180, so the other angle is 180 − x.' },
      { part: 'setup', answer: '5x + 7x = 90', gives: '7.5', tag: 'used-90-for-supp',
        msg: 'Supplementary angles add to 180, not 90: 5x + 7x = 180.' },
      { part: 'answer', answer: '75', tag: 'stopped-early',
        msg: "75 is the smaller angle — keep going: the question wants its complement, 90 − 75." },
      { part: 'answer', answer: '105', tag: 'gave-larger',
        msg: '105 is the larger angle. The question wants the complement of the smaller angle (75).' },
      { part: 'answer', answer: '85', tag: 'ratio-as-measure',
        msg: '5 and 7 are parts, not degrees. 5 + 7 = 12 parts make 180°, so find one part first; the smaller angle is 5 of them (75°).' },
      { part: 'answer', answer: '5', tag: 'ratio-as-measure',
        msg: '5 is a ratio part, not an angle. 5 + 7 = 12 parts make 180°; the smaller angle is 5 parts of that (75°), and the question wants its complement.' },
    ],
  }),

  // ---------------------------------------------------------------------------------------------
  wp(6, 'grotto', {
    par: 180,
    stem: 'The measure of one of two complementary angles is 6 less than one-half the measure of the other. Find the measure of the supplement of the smaller of the two complementary angles.',
    parts: [
      { id: 'setup', type: 'equation', label: 'Set up the equation', var: 'x',
        canonical: 'x-((90-x)/2-6)', mustMention: [90], roots: ['26'], text: 'x = ½(90 − x) − 6',
        alternates: [
          { canonical: '90-x-(x/2-6)', mustMention: [90], roots: ['64'],
            means: 'x = the other (larger) angle; the first angle is 90 − x', text: '90 − x = ½x − 6' },
        ] },
      { id: 'answer', type: 'num', label: 'supplement of the smaller angle =', answer: '154', asks: ['smaller', 'supp'],
        distractors: { smaller: '26', larger: '64' } },
    ],
    hints: [
      'The two angles are complementary: if one is x, the other is 90 − x. "One-half the other" is ½(90 − x); "6 less than" that subtracts 6.',
      'Set up: x = ½(90 − x) − 6. Multiply every term by 2 to clear the fraction.',
      '2x = 90 − x − 12 → 3x = 78. That x is the smaller angle — the question wants its supplement, 180 − x.',
    ],
    solution: [
      { say: 'Let x be the first angle; the other complementary angle is 90 − x', math: 'first = x,  other = 90 − x' },
      { say: 'The first IS 6 less than half of the other', math: 'x = ½(90 − x) − 6' },
      { say: 'Multiply both sides by 2', math: '2x = 90 − x − 12' },
      { say: 'Add x to both sides', math: '3x = 78' },
      { say: 'Divide by 3', math: 'x = 26°' },
      { say: 'The angles are 26° and 64°; the smaller is 26°. Its supplement:', math: 'supp of 26° = 154°' },
    ],
    misconceptions: [
      { part: 'setup', answer: 'x = (180 - x)/2 - 6', gives: '56', tag: 'used-180-for-comp',
        msg: 'The two angles are complementary — the other one is 90 − x, not 180 − x.' },
      { part: 'setup', answer: 'x = (90 - x - 6)/2', gives: '28', tag: 'grouping',
        msg: '"6 less than one-half the other" halves first, then subtracts 6: ½(90 − x) − 6.' },
      { part: 'answer', answer: '26', tag: 'stopped-early',
        msg: '26 is the smaller angle — keep going: the question wants its supplement, 180 − 26.' },
      { part: 'answer', answer: '64', tag: 'gave-larger',
        msg: '64 is the larger of the two angles. Find the smaller (26), then its supplement.' },
      { part: 'answer', answer: '116', tag: 'gave-larger',
        msg: '116 is the supplement of the larger angle (64). The question wants the supplement of the smaller one.' },
      { part: 'answer', answer: '56', tag: 'used-180-for-comp',
        msg: 'x = 56 comes from ½(180 − x). Complementary angles add to 90, so the other angle is 90 − x.' },
    ],
  }),

  // ---------------------------------------------------------------------------------------------
  wp(7, 'nested', {
    par: 180,
    stem: 'The supplement of an angle less 8 is seven times the angle. What is the measure of the supplement of the complement of the angle?',
    parts: [
      { id: 'setup', type: 'equation', label: 'Set up the equation', var: 'x',
        canonical: '180-x-8-7x', mustMention: [180], roots: ['21.5'], text: '180 − x − 8 = 7x',
        alternates: [
          { canonical: '(180-(90-x))-8-7(90-x)', mustMention: [180, 90], roots: ['68.5'],
            means: 'x = the complement (the angle is 90 − x, its supplement 180 − (90 − x))', text: '180 − (90 − x) − 8 = 7(90 − x)' },
        ] },
      { id: 'answer', type: 'num', label: 'supplement of the complement =', answer: '111.5', asks: ['comp', 'supp'],
        distractors: { angle: '21.5', comp: '68.5', supp: '158.5' } },
    ],
    hints: [
      'Supplement = 180 − x. "The supplement … less 8" is (180 − x) − 8, and that equals seven times the angle.',
      'Set up: 180 − x − 8 = 7x → 172 = 8x.',
      'x = 21.5, so its complement is 90 − 21.5 = 68.5. The question asks for the supplement of that complement: 180 − 68.5.',
    ],
    solution: [
      { say: 'Let x be the angle; its supplement is 180 − x', math: 'angle = x,  supp = 180 − x' },
      { say: 'The supplement less 8 IS seven times the angle', math: '180 − x − 8 = 7x' },
      { say: 'Add x to both sides', math: '172 = 8x' },
      { say: 'Divide by 8', math: '21.5 = x' },
      { say: 'First link of the chain: the complement of the angle', math: 'comp of 21.5° = 68.5°' },
      { say: 'Second link: the supplement of that complement', math: 'supp of 68.5° = 111.5°' },
    ],
    misconceptions: [
      { part: 'setup', answer: '90 - x - 8 = 7x', gives: '10.25', tag: 'used-90-for-supp',
        msg: '90 − x is the complement. The sentence says supplement: 180 − x.' },
      { part: 'setup', answer: '180 - (x - 8) = 7x', gives: '23.5', tag: 'grouping',
        msg: '"The supplement of an angle, less 8" takes 8 off the supplement: (180 − x) − 8.' },
      { part: 'answer', answer: '68.5', tag: 'stopped-early',
        msg: "That's the complement — the question asks for the supplement of the complement (180 − 68.5)." },
      { part: 'answer', answer: '21.5', tag: 'gave-angle',
        msg: "That's the angle itself — keep going: complement, then its supplement." },
      { part: 'answer', answer: '158.5', tag: 'gave-supplement',
        msg: "158.5 is the supplement of the angle. The question wants the supplement of the complement: 180 − (90 − 21.5)." },
    ],
  }),

  // ---------------------------------------------------------------------------------------------
  wp(8, 'grotto', {
    stem: 'Half of the difference between two supplementary angles is 3.5. What is the measure of the larger of the two angles?',
    parts: [
      { id: 'setup', type: 'equation', label: 'Set up the equation', var: 'x',
        canonical: '(180-x-x)/2-3.5', mustMention: [180], roots: ['86.5'], text: '½(180 − x − x) = 3.5',
        alternates: [
          { canonical: '(x-(180-x))/2-3.5', mustMention: [180], roots: ['93.5'],
            means: 'x = the larger angle (the smaller is 180 − x)', text: '½(x − (180 − x)) = 3.5' },
        ] },
      { id: 'answer', type: 'num', label: 'larger angle =', answer: '93.5', asks: ['larger'],
        distractors: { smaller: '86.5' } },
    ],
    hints: [
      'If the smaller angle is x, the other is 180 − x. "The difference between" them is (180 − x) − x, and "half of" that is ½(…).',
      'Set up: ½(180 − x − x) = 3.5 → 180 − 2x = 7.',
      '−2x = −173 → x = 86.5 is the smaller angle. The question wants the larger: 180 − 86.5.',
    ],
    solution: [
      { say: 'Let x be the smaller angle; the other supplementary angle is 180 − x', math: 'smaller = x,  larger = 180 − x' },
      { say: 'Half of the difference between them IS 3.5', math: '½(180 − x − x) = 3.5' },
      { say: 'Multiply by 2 and combine', math: '180 − 2x = 7' },
      { say: 'Subtract 180', math: '−2x = −173' },
      { say: 'Divide by −2', math: 'x = 86.5°' },
      { say: 'The larger angle is the supplement of the smaller', math: 'supp of 86.5 is 93.5°' },
    ],
    misconceptions: [
      { part: 'setup', answer: '(90 - x - x)/2 = 3.5', gives: '41.5', tag: 'used-90-for-supp',
        msg: 'Supplementary angles add to 180 — the other angle is 180 − x.' },
      { part: 'setup', answer: '(180 - x)/2 = 3.5', gives: '173', tag: 'grouping',
        msg: '"The difference between two angles" is one minus the other: (180 − x) − x. 180 − x alone is just the second angle.' },
      { part: 'answer', answer: '86.5', tag: 'gave-smaller',
        msg: '86.5 is the smaller angle. The question wants the larger one: 180 − 86.5.' },
      { part: 'answer', answer: '7', tag: 'stopped-early',
        msg: '7 is the difference between the angles, not an angle. Solve 180 − 2x = 7 for x, then take 180 − x.' },
      { part: 'answer', answer: '3.5', tag: 'gave-angle',
        msg: '3.5 is half the difference, given in the problem — it is not one of the angles.' },
    ],
  }),

  // ---------------------------------------------------------------------------------------------
  wp(9, 'nested', {
    par: 180,
    stem: 'The difference between the supplements of two complementary angles is 24. What are the two complementary angles?',
    parts: [
      { id: 'setup', type: 'equation', label: 'Set up the equation', var: 'x',
        canonical: '(180-x)-(180-(90-x))-24', mustMention: [180, 90], roots: ['33'], text: '180 − x − (180 − (90 − x)) = 24',
        alternates: [
          { canonical: '(180-(90-x))-(180-x)-24', mustMention: [180, 90], roots: ['57'],
            means: 'x = the larger angle (the other is 90 − x)', text: '(180 − (90 − x)) − (180 − x) = 24' },
        ] },
      { id: 'answer', type: 'multi', orderFree: true, fields: [
        { key: 'a', label: 'first angle =', answer: '33' },
        { key: 'b', label: 'second angle =', answer: '57' },
      ] },
    ],
    hints: [
      'Two complementary angles: x and 90 − x. Their supplements are 180 − x and 180 − (90 − x). "The difference between" is the first minus the second.',
      'Set up: 180 − x − (180 − (90 − x)) = 24. Clear the nested parentheses: −(180 − (90 − x)) = −180 + (90 − x).',
      '−x + 90 − x = 24 → −2x = −66. Solve for x; the other angle is 90 − x. Enter both.',
    ],
    solution: [
      { say: 'Let x be one angle; the other complementary angle is 90 − x', math: 'angle = x,  other = 90 − x' },
      { say: 'Supplement of the angle minus supplement of the other angle IS 24', math: '180 − x − (180 − (90 − x)) = 24' },
      { say: 'Clear the inner parentheses', math: '180 − x − 180 + (90 − x) = 24' },
      { say: 'Combine', math: '−x + 90 − x = 24' },
      { say: 'Subtract 90', math: '−2x = −66' },
      { say: 'Divide by −2', math: 'x = 33' },
      { say: 'The other angle is the complement', math: 'comp of 33 is 57°' },
    ],
    misconceptions: [
      { part: 'setup', answer: '(180 - x) - (180 - x) = 24', gives: null, tag: 'grouping',
        msg: 'The two angles are different: x and 90 − x. Their supplements are 180 − x and 180 − (90 − x).' },
      { part: 'setup', answer: '(180 - x) - (90 - x) = 24', gives: null, tag: 'used-90-for-supp',
        msg: 'Both angles need a supplement (180 − …). The second angle is 90 − x, so its supplement is 180 − (90 − x).' },
      // orderFree multi: the same three lines for either box (multi.js scopes entries by field key)
      { part: 'answer', field: 'a', answer: '147', tag: 'gave-supplement',
        msg: '147 is the supplement of one angle (180 − x). The question asks for the two complementary angles themselves.' },
      { part: 'answer', field: 'b', answer: '147', tag: 'gave-supplement',
        msg: '147 is the supplement of one angle (180 − x). The question asks for the two complementary angles themselves.' },
      { part: 'answer', field: 'a', answer: '123', tag: 'gave-supplement',
        msg: '123 is the supplement of one angle (180 − (90 − x)). The question asks for the two complementary angles themselves.' },
      { part: 'answer', field: 'b', answer: '123', tag: 'gave-supplement',
        msg: '123 is the supplement of one angle (180 − (90 − x)). The question asks for the two complementary angles themselves.' },
      { part: 'answer', field: 'a', answer: '24', tag: 'gave-angle',
        msg: '24 is the given difference of the supplements, not one of the angles. Solve −2x = −66.' },
      { part: 'answer', field: 'b', answer: '24', tag: 'gave-angle',
        msg: '24 is the given difference of the supplements, not one of the angles. Solve −2x = −66.' },
    ],
  }),

  // ---------------------------------------------------------------------------------------------
  wp(10, 'ratio', {
    par: 180,
    stem: 'The ratio of an angle to its supplement is 3:7. Determine the ratio of the angle to its complement.',
    parts: [
      { id: 'setup', type: 'equation', label: 'Set up the equation', var: 'x',
        canonical: 'x/(180-x)-3/7', mustMention: [180], roots: ['54'], text: 'x/(180 − x) = 3/7',
        alternates: [
          { canonical: '3x+7x-180', mustMention: [180], roots: ['18'],
            means: 'x = one part (the angle is 3x, the supplement 7x)', text: '3x + 7x = 180' },
          { canonical: 'x/(180-x)-7/3', mustMention: [180], roots: ['126'],
            means: 'x = the supplement (the angle is 180 − x)', text: 'x/(180 − x) = 7/3' },
        ] },
      { id: 'answer', type: 'ratio', label: 'angle : complement =', answer: '3:2' },
    ],
    hints: [
      'Angle : supplement = 3 : 7 means x/(180 − x) = 3/7. Find x first — the ratio to the complement needs the actual angle.',
      'Set up: x/(180 − x) = 3/7 → cross-multiply: 7x = 3(180 − x) → 10x = 540.',
      'x = 54 and its complement is 90 − 54 = 36. Write angle : complement = 54 : 36 and reduce by the GCF.',
    ],
    solution: [
      { say: 'Let x be the angle; its supplement is 180 − x', math: 'angle = x,  supp = 180 − x' },
      { say: 'Angle to supplement is 3 to 7', math: 'x/(180 − x) = 3/7' },
      { say: 'Cross-multiply', math: '7x = 3(180 − x)' },
      { say: 'Distribute', math: '7x = 540 − 3x' },
      { say: 'Add 3x', math: '10x = 540' },
      { say: 'Divide by 10', math: 'x = 54' },
      { say: 'The complement', math: 'comp of 54 = 36' },
      { say: 'Angle to complement, reduced', math: '54/36 = 3/2  →  3:2' },
    ],
    misconceptions: [
      { part: 'setup', answer: 'x/(90 - x) = 3/7', gives: '27', tag: 'used-90-for-supp',
        msg: 'The given ratio is angle to supplement: 180 − x. The complement (90 − x) only appears in the final ratio.' },
      { part: 'answer', answer: '2:3', tag: 'reversed-ratio',
        msg: 'Order matters: "angle to complement" is angle first — 54 : 36 = 3 : 2, not 2 : 3.' },
      { part: 'answer', answer: '1:29', tag: 'ratio-as-measure',
        msg: '3 and 7 are parts, not degrees. 10 parts make 180, so the angle is 3 × 18 = 54° and its complement 36°.' },
      { part: 'answer', answer: '3:7', tag: 'gave-supplement',
        msg: '3 : 7 is the given ratio to the supplement. The question wants the ratio to the complement (90 − 54 = 36).' },
    ],
  }),

  // ---------------------------------------------------------------------------------------------
  wp(11, 'ratio', {
    par: 180,
    stem: 'The ratio of the supplement of an angle to its complement is 7:2. What is the supplement of the complement of the angle?',
    parts: [
      { id: 'setup', type: 'equation', label: 'Set up the equation', var: 'x',
        canonical: '(180-x)/(90-x)-7/2', mustMention: [180, 90], roots: ['54'], text: '(180 − x)/(90 − x) = 7/2',
        alternates: [
          { canonical: '7x-2x-90', mustMention: [90], roots: ['18'],
            means: 'x = one part (supplement 7x, complement 2x; a supplement is always 90 more than the complement)', text: '7x − 2x = 90' },
          { canonical: '(180-(90-x))/x-7/2', mustMention: [180, 90], roots: ['36'],
            means: 'x = the complement (the supplement is 180 − (90 − x))', text: '(180 − (90 − x))/x = 7/2' },
        ] },
      { id: 'answer', type: 'num', label: 'supplement of the complement =', answer: '144', asks: ['comp', 'supp'],
        distractors: { angle: '54', comp: '36', supp: '126' } },
    ],
    hints: [
      'Supplement : complement = 7 : 2 means (180 − x)/(90 − x) = 7/2. Cross-multiply.',
      'Set up: 2(180 − x) = 7(90 − x) → 360 − 2x = 630 − 7x.',
      '5x = 270 → x = 54. Two-step chain: the complement is 90 − 54 = 36, then the supplement of 36 is 180 − 36.',
    ],
    solution: [
      { say: 'Let x be the angle: supplement 180 − x, complement 90 − x', math: 'angle = x,  supp = 180 − x,  comp = 90 − x' },
      { say: 'Supplement to complement is 7 to 2', math: '(180 − x)/(90 − x) = 7/2' },
      { say: 'Cross-multiply', math: '2(180 − x) = 7(90 − x)' },
      { say: 'Distribute', math: '360 − 2x = 630 − 7x' },
      { say: 'Add 7x, subtract 360', math: '5x = 270' },
      { say: 'Divide by 5', math: 'x = 54' },
      { say: 'First link: the complement', math: 'comp of 54 = 36' },
      { say: 'Second link: the supplement of that complement', math: 'supp of 36 = 144°' },
    ],
    misconceptions: [
      { part: 'setup', answer: '(180 - x)/(90 - x) = 2/7', gives: '216', tag: 'reversed-ratio',
        msg: 'Supplement : complement = 7 : 2 puts the supplement first: (180 − x)/(90 − x) = 7/2. Your x came out above 180.' },
      { part: 'setup', answer: '(180 - x)/(180 - x) = 7/2', gives: null, tag: 'used-180-for-comp',
        msg: 'The complement is 90 − x. Only the supplement is 180 − x.' },
      { part: 'answer', answer: '36', tag: 'stopped-early',
        msg: "That's the complement — the question asks for the supplement of the complement (180 − 36)." },
      { part: 'answer', answer: '54', tag: 'gave-angle',
        msg: "That's the angle itself — keep going: complement, then its supplement." },
      { part: 'answer', answer: '126', tag: 'gave-supplement',
        msg: '126 is the supplement of the angle. The question wants the supplement of the complement: 180 − (90 − 54).' },
    ],
  }),

  // ---------------------------------------------------------------------------------------------
  wp(12, null, {
    tier: 3, par: 240, needs: ['QUAD-SOLVE'],
    stem: 'The product of an angle and its complement is 344. What is the supplement of the smaller angle?',
    parts: [
      { id: 'setup', type: 'equation', label: 'Set up the equation', var: 'x',
        canonical: 'x(90-x)-344', mustMention: [90], roots: ['86', '4'], text: 'x(90 − x) = 344',
        alternates: [] },
      { id: 'x', type: 'roots', var: 'x', label: 'x =', answer: ['86', '4'], mustMention: null,
        note: 'both roots are valid — 4 and 86 are each other’s complement, so they are the same pair of angles' },
      { id: 'answer', type: 'num', of: 'x', label: 'supplement of the smaller angle =', answer: '176', asks: ['smaller', 'supp'],
        distractors: { smaller: '4', larger: '86' } },
    ],
    hints: [
      'Complement = 90 − x. "The product of" means multiply: x(90 − x) = 344 — a quadratic, so expect two roots.',
      'Set up: x(90 − x) = 344 → 90x − x² = 344 → 0 = x² − 90x + 344. Factor: two numbers with product 344 and sum −90.',
      'Set each factor to 0 — both roots are valid angles (each is the other’s complement). Take the smaller root and find its supplement, 180 − it.',
    ],
    solution: [
      { say: 'Let x be the angle; its complement is 90 − x', math: 'angle = x,  comp = 90 − x' },
      { say: 'Their product IS 344', math: 'x(90 − x) = 344' },
      { say: 'Distribute', math: '90x − x² = 344' },
      { say: 'Move everything to one side so the x² term is positive', math: '0 = x² − 90x + 344' },
      { say: 'Factor: −86 and −4 multiply to 344 and add to −90', math: '0 = (x − 86)(x − 4)' },
      { say: 'Set each factor to 0', math: 'x = 86  or  x = 4' },
      { say: 'Both work: 86 and 4 are complements of each other (86 · 4 = 344). The smaller angle is 4', math: 'smaller angle = 4°' },
      { say: 'Its supplement', math: 'supp of 4 = 176°' },
    ],
    misconceptions: [
      { part: 'setup', answer: 'x(180 - x) = 344', gives: null, tag: 'used-180-for-comp',
        msg: 'The sentence says complement: 90 − x. With 180 − x the quadratic does not even factor.' },
      { part: 'setup', answer: 'x + (90 - x) = 344', gives: null, tag: 'grouping',
        msg: '"The product of" means multiply, not add: x(90 − x) = 344.' },
      { part: 'answer', answer: '4', tag: 'stopped-early',
        msg: '4 is the smaller angle — keep going: the question wants its supplement, 180 − 4.' },
      { part: 'answer', answer: '86', tag: 'gave-larger',
        msg: '86 is the larger angle. The question wants the supplement of the smaller one (4).' },
      { part: 'answer', answer: '94', tag: 'gave-larger',
        msg: '94 is the supplement of the larger angle (86). The question wants the supplement of the smaller one (4).' },
      { part: 'answer', answer: '344', tag: 'gave-angle',
        msg: '344 is the given product, not an angle. Solve x(90 − x) = 344 for x first.' },
    ],
  }),

  // ---------------------------------------------------------------------------------------------
  wp(13, 'nested', {
    stem: 'Three times the difference between an angle and 5 is ten less than double the complement of the angle. What is the supplement of the angle?',
    parts: [
      { id: 'setup', type: 'equation', label: 'Set up the equation', var: 'x',
        canonical: '3(x-5)-(2(90-x)-10)', mustMention: [90], roots: ['37'], text: '3(x − 5) = 2(90 − x) − 10',
        alternates: [
          { canonical: '3((90-x)-5)-(2x-10)', mustMention: [90], roots: ['53'],
            means: 'x = the complement (the angle is 90 − x)', text: '3((90 − x) − 5) = 2x − 10' },
        ] },
      { id: 'answer', type: 'num', label: 'supplement =', answer: '143', asks: ['supp'],
        distractors: { angle: '37', comp: '53' } },
    ],
    hints: [
      '"The difference between an angle and 5" is (x − 5), and "three times" it is 3(x − 5). "Ten less than double the complement" is 2(90 − x) − 10.',
      'Set up: 3(x − 5) = 2(90 − x) − 10. Distribute on both sides.',
      '3x − 15 = 180 − 2x − 10 → 5x = 185. Solve for x, then the supplement is 180 − x.',
    ],
    solution: [
      { say: 'Let x be the angle; its complement is 90 − x', math: 'angle = x,  comp = 90 − x' },
      { say: 'Three times (angle − 5) IS ten less than double the complement', math: '3(x − 5) = 2(90 − x) − 10' },
      { say: 'Distribute both sides', math: '3x − 15 = 180 − 2x − 10' },
      { say: 'Add 2x and 15 to both sides', math: '5x = 185' },
      { say: 'Divide by 5', math: 'x = 37' },
      { say: 'The question asks for the supplement', math: 'supp of 37 = 143°' },
    ],
    misconceptions: [
      { part: 'setup', answer: '3(x - 5) = 2(180 - x) - 10', gives: '73', tag: 'used-180-for-comp',
        msg: 'The sentence says complement: 90 − x. Double the complement is 2(90 − x).' },
      { part: 'setup', answer: '3x - 5 = 2(90 - x) - 10', gives: '35', tag: 'grouping',
        msg: '"Three times the difference between an angle and 5" multiplies the whole difference: 3(x − 5), not 3x − 5.' },
      { part: 'setup', answer: '3(x - 5) = 2(90 - x) + 10', gives: '41', tag: 'grouping',
        msg: '"Ten less than double the complement" subtracts 10 after doubling: 2(90 − x) − 10.' },
      { part: 'answer', answer: '37', tag: 'gave-angle',
        msg: "That's the angle — the question asks for its supplement, 180 − 37." },
      { part: 'answer', answer: '53', tag: 'gave-complement',
        msg: '53 is the complement (90 − 37). The question asks for the supplement, 180 − x.' },
      { part: 'answer', answer: '107', tag: 'used-180-for-comp',
        msg: '107 = 180 − 73, where x = 73 comes from 2(180 − x). Double the complement is 2(90 − x), giving x = 37.' },
    ],
  }),

  // ---------------------------------------------------------------------------------------------
  wp(14, 'ratio', {
    par: 180,
    stem: 'The ratio of one less than half of the complement of an angle to the angle itself is 1:2. What is the supplement of the complement of the angle?',
    parts: [
      { id: 'setup', type: 'equation', label: 'Set up the equation', var: 'x',
        canonical: '((90-x)/2-1)/x-1/2', mustMention: [90], roots: ['44'], text: '(½(90 − x) − 1)/x = 1/2',
        alternates: [
          { canonical: '(x/2-1)/(90-x)-1/2', mustMention: [90], roots: ['46'],
            means: 'x = the complement (the angle is 90 − x)', text: '(½x − 1)/(90 − x) = 1/2' },
        ] },
      { id: 'answer', type: 'num', label: 'supplement of the complement =', answer: '134', asks: ['comp', 'supp'],
        distractors: { angle: '44', comp: '46', supp: '136' } },
    ],
    hints: [
      '"One less than half of the complement" is ½(90 − x) − 1. Its ratio to the angle being 1:2 means (½(90 − x) − 1)/x = 1/2.',
      'Set up: (½(90 − x) − 1)/x = ½ → cross-multiply: x = 2(½(90 − x) − 1).',
      'x = 90 − x − 2 → 2x = 88 → x = 44. Chain: the complement is 90 − 44 = 46, then its supplement is 180 − 46.',
    ],
    solution: [
      { say: 'Let x be the angle; its complement is 90 − x', math: 'angle = x,  comp = 90 − x' },
      { say: '(one less than half the complement) to (the angle) is 1 to 2', math: '(½(90 − x) − 1)/x = 1/2' },
      { say: 'Cross-multiply', math: 'x = 2(½(90 − x) − 1)' },
      { say: 'Distribute the 2', math: 'x = 90 − x − 2' },
      { say: 'Add x to both sides', math: '2x = 88' },
      { say: 'Divide by 2', math: 'x = 44' },
      { say: 'First link: the complement', math: 'comp of 44 = 46' },
      { say: 'Second link: the supplement of that complement', math: 'supp of 46 = 134°' },
    ],
    misconceptions: [
      { part: 'setup', answer: '((180 - x)/2 - 1)/x = 1/2', gives: '89', tag: 'used-180-for-comp',
        msg: 'The sentence says complement: 90 − x. Half of it is ½(90 − x).' },
      { part: 'setup', answer: 'x/((90 - x)/2 - 1) = 1/2', gives: '17.6', tag: 'reversed-ratio',
        msg: 'The ratio is "(one less than half the complement) to (the angle)" — that expression goes on top, x underneath.' },
      { part: 'setup', answer: '((90 - x) - 1)/(2x) = 1/2', gives: '44.5', tag: 'grouping',
        msg: '"One less than half of the complement" halves the complement first: ½(90 − x) − 1. The "to the angle" part is ÷ x.' },
      { part: 'answer', answer: '46', tag: 'stopped-early',
        msg: "That's the complement — the question asks for the supplement of the complement (180 − 46)." },
      { part: 'answer', answer: '44', tag: 'gave-angle',
        msg: "That's the angle itself — keep going: complement, then its supplement." },
      { part: 'answer', answer: '136', tag: 'gave-supplement',
        msg: '136 is the supplement of the angle. The question wants the supplement of the complement: 180 − (90 − 44).' },
    ],
  }),

  // ---------------------------------------------------------------------------------------------
  wp(15, 'nested', {
    stem: 'The complement of two more than an angle is one-third of the sum of the angle and its supplement. What is the complement of the original angle?',
    parts: [
      { id: 'setup', type: 'equation', label: 'Set up the equation', var: 'x',
        canonical: '90-(x+2)-(x+(180-x))/3', mustMention: [90, 180], roots: ['28'], text: '90 − (x + 2) = ⅓(x + (180 − x))',
        alternates: [
          { canonical: '90-((90-x)+2)-((90-x)+(180-(90-x)))/3', mustMention: [90, 180], roots: ['62'],
            means: 'x = the complement of the original angle (the angle is 90 − x)', text: '90 − ((90 − x) + 2) = ⅓((90 − x) + (180 − (90 − x)))' },
        ] },
      { id: 'answer', type: 'num', label: 'complement of the original angle =', answer: '62', asks: ['comp'],
        distractors: { angle: '28', supp: '152' } },
    ],
    hints: [
      '"Two more than an angle" is x + 2, and its complement is 90 − (x + 2). "The sum of the angle and its supplement" is x + (180 − x), which is always 180.',
      'Set up: 90 − (x + 2) = ⅓(x + (180 − x)) = ⅓(180) = 60.',
      '90 − x − 2 = 60 → 88 − x = 60 → x = 28. The question wants the complement of the original angle: 90 − 28.',
    ],
    solution: [
      { say: 'Let x be the angle. "Two more than the angle" is x + 2, and its supplement is 180 − x', math: 'angle = x,  x + 2,  supp = 180 − x' },
      { say: 'The complement of (x + 2) IS one-third of (angle + supplement); the sum in brackets is always 180', math: '90 − (x + 2) = ⅓(180)' },
      { say: 'Simplify both sides', math: '90 − x − 2 = 60' },
      { say: 'Combine', math: '88 − x = 60' },
      { say: 'Subtract 88', math: '−x = −28' },
      { say: 'The angle', math: 'x = 28' },
      { say: 'The question asks for the complement of the original angle', math: 'comp of 28 = 62°' },
    ],
    misconceptions: [
      { part: 'setup', answer: '180 - (x + 2) = (x + (180 - x))/3', gives: '118', tag: 'used-180-for-comp',
        msg: '"The complement of two more than an angle" is 90 − (x + 2). 180 − … would be a supplement.' },
      { part: 'setup', answer: '90 - (x + 2) = (x + (90 - x))/3', gives: '58', tag: 'used-90-for-supp',
        msg: '"The angle and its supplement" is x + (180 − x) = 180, so the right side is ⅓(180) = 60.' },
      { part: 'setup', answer: '90 - x + 2 = (x + (180 - x))/3', gives: '32', tag: 'grouping',
        msg: 'The complement of (x + 2) subtracts the whole x + 2: 90 − (x + 2) = 90 − x − 2.' },
      { part: 'answer', answer: '28', tag: 'gave-angle',
        msg: "That's the angle — the question asks for its complement, 90 − 28." },
      { part: 'answer', answer: '152', tag: 'gave-supplement',
        msg: '152 is the supplement (180 − 28). The question asks for the complement, 90 − x.' },
      { part: 'answer', answer: '60', tag: 'gave-complement',
        msg: '60 is the complement of x + 2 (that is, 90 − 30) — the right side of the equation. The question wants the complement of the original angle, 90 − 28.' },
      { part: 'answer', answer: '30', tag: 'gave-angle',
        msg: '30 is x + 2, "two more than the angle". The original angle is 28 and its complement is 90 − 28.' },
    ],
  }),

  // ---------------------------------------------------------------------------------------------
  wp(16, 'ratio', {
    par: 180,
    stem: 'The ratio of 6 more than an angle to 4 less than the supplement of the complement of the angle is 1:5. What is the complement of the angle?',
    parts: [
      { id: 'setup', type: 'equation', label: 'Set up the equation', var: 'x',
        canonical: '(x+6)/(180-(90-x)-4)-1/5', mustMention: [180, 90], roots: ['14'], text: '(x + 6)/(180 − (90 − x) − 4) = 1/5',
        alternates: [
          { canonical: '((90-x)+6)/((180-x)-4)-1/5', mustMention: [90, 180], roots: ['76'],
            means: 'x = the complement (the angle is 90 − x; the supplement of the complement is 180 − x)', text: '((90 − x) + 6)/((180 − x) − 4) = 1/5' },
        ] },
      { id: 'answer', type: 'num', label: 'complement =', answer: '76', asks: ['comp'],
        distractors: { angle: '14', supp: '166' } },
    ],
    hints: [
      '"6 more than an angle" is x + 6. "The supplement of the complement" is 180 − (90 − x) = 90 + x, and "4 less than" that is 90 + x − 4 = 86 + x.',
      'Set up: (x + 6)/(180 − (90 − x) − 4) = 1/5 → (x + 6)/(86 + x) = 1/5 → cross-multiply: 5(x + 6) = 86 + x.',
      '5x + 30 = 86 + x → 4x = 56 → x = 14. The question wants the complement: 90 − 14.',
    ],
    solution: [
      { say: 'Let x be the angle. Its complement is 90 − x, and the supplement of that is 180 − (90 − x)', math: 'angle = x,  comp = 90 − x,  supp of comp = 180 − (90 − x)' },
      { say: '(6 more than the angle) to (4 less than the supplement of the complement) is 1 to 5', math: '(x + 6)/(180 − (90 − x) − 4) = 1/5' },
      { say: 'Clear the inner parentheses in the denominator', math: '(x + 6)/(180 − 90 + x − 4) = 1/5' },
      { say: 'Combine the numbers', math: '(x + 6)/(86 + x) = 1/5' },
      { say: 'Cross-multiply', math: '5(x + 6) = 86 + x' },
      { say: 'Distribute', math: '5x + 30 = 86 + x' },
      { say: 'Subtract x and 30', math: '4x = 56' },
      { say: 'Divide by 4', math: 'x = 14' },
      { say: 'The question asks for the complement', math: 'comp of 14 = 76°' },
    ],
    misconceptions: [
      { part: 'setup', answer: '(180 - (90 - x) - 4)/(x + 6) = 1/5', gives: '-106', tag: 'reversed-ratio',
        msg: 'The ratio is "(6 more than the angle) to (…)": x + 6 goes on top. Reversed, x comes out negative.' },
      { part: 'setup', answer: '(x + 6)/(180 - x - 4) = 1/5', gives: '73/3', tag: 'stopped-early',
        msg: '"The supplement of the complement" is two steps: complement 90 − x, then its supplement 180 − (90 − x).' },
      { part: 'setup', answer: '(x + 6)/(90 - (90 - x) - 4) = 1/5', gives: '-8.5', tag: 'used-90-for-supp',
        msg: 'A supplement is 180 − (…): the supplement of the complement is 180 − (90 − x).' },
      { part: 'answer', answer: '14', tag: 'gave-angle',
        msg: "That's the angle — the question asks for its complement, 90 − 14." },
      { part: 'answer', answer: '166', tag: 'gave-supplement',
        msg: '166 is the supplement of the angle. The question asks for the complement, 90 − x.' },
      { part: 'answer', answer: '104', tag: 'gave-supplement',
        msg: '104 is the supplement of the complement — one step too far. The question wants the complement itself, 90 − 14.' },
      { part: 'answer', answer: '20', tag: 'gave-angle',
        msg: '20 is x + 6, "6 more than the angle". The angle is 14 and its complement is 90 − 14.' },
    ],
  }),
];

/** Card[16] wp-01 … wp-16 in sheet order — what site/data/cards.js imports (`import { cards as wp }`). */
export const cards = wpCards;
export default cards;
