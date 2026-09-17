// data/sheet.js — "the cheat sheet you can't bring" (COMPOSED S7 Night Before, block 4).
//
// Two halves:
//   personalLines(save)  ≤ 12 lines compiled from THE STUDENT'S OWN LAPSES, in S7's order:
//                        the most-missed notation rule, the comp/supp set-up line, root rejection,
//                        the sign pattern, then the 4 lowest-mastery definitions.
//   FIXED                the printed sheet: definitions · the notation table · x / 90 − x / 180 − x ·
//                        linear pair ⇒ supplementary · vertical ⇒ congruent · bisector ⇒ two congruent
//                        halves · ratio p:q ⇒ parts · "check both roots" · the a > 1 factoring checklist ·
//                        solving a system. EVERY rule carries one tiny worked example.
//
// Rule of the sheet (S7): methods, never memorised answers. Nothing here is a packet answer — every
// example is a different problem worked in one line, so reading it is revision and not recall.
//
// Pure data + pure functions: no DOM, Node-importable (`stem` strings use mathfmt mini-markup, which
// js/screens/sheet.js renders). Numbers in the examples are verified against content/SOURCE.md.

import { vocab } from './vocab.js';
import { lookup, AREAS } from './misconceptions.js';

export const MAX_PERSONAL = 12;

/* ------------------------------------------------------------------ the fixed sheet */

const s = (id, rule, example) => Object.freeze({ id, rule, example });

export const FIXED = Object.freeze([
  {
    id: 'notation', title: 'Notation', blurb: 'The half of the test that is pure reading.',
    lines: [
      s('line', '{line AB} — bar with an arrow at BOTH ends. A line. Goes on forever.', 'F is on {line AD}: A, F and D are collinear.'),
      s('seg', '{seg AB} — a plain bar. A segment: two endpoints.', '{seg CB} and {seg BA} make up {seg CA}.'),
      s('len', 'AB with NO bar is a LENGTH — a number.', 'AB = 8 is a number; {seg AB} is a set of points.'),
      s('ray', '{ray AB} — one arrow, and the ENDPOINT IS THE FIRST LETTER.', '{ray AB} ≠ {ray BA}: same line, opposite directions.'),
      s('opp', 'Opposite rays share an endpoint and together make a line.', 'F between A and D: {ray FA} and {ray FD} are opposite rays.'),
      s('ang', '∠ABC — the VERTEX IS THE MIDDLE LETTER.', '∠ABC has vertex B, sides {ray BA} and {ray BC}.'),
      s('m', 'm∠ABC is the measure — a number of degrees.', 'm∠ABD = 81 is a number; ∠ABD is the angle.'),
      s('cong', '≅ compares FIGURES, = compares NUMBERS.', '∠ABD ≅ ∠DBC  ⟺  m∠ABD = m∠DBC.'),
      s('plane', 'A plane: one script capital, or three non-collinear points.', 'plane ABC — but only if A, B, C are not collinear.'),
    ],
  },
  {
    id: 'defs', title: 'Definitions', blurb: 'The ones the doc calls important.',
    lines: [
      s('plp', 'Point: a location, no size. Line: straight, forever both ways. Plane: flat, forever all ways.', 'Through any two points: exactly one line. Through three non-collinear points: exactly one plane.'),
      s('place', 'Collinear = on one line. Coplanar = in one plane.', 'Any two points are collinear; any three points are coplanar.'),
      s('pieces', 'Segment: two endpoints. Ray: one endpoint, forever the other way.', 'A segment has a length; a ray does not.'),
      s('angle', 'Angle: two rays (the SIDES) from a common endpoint (the VERTEX).', 'In ∠ABC: sides {ray BA}, {ray BC}; vertex B.'),
      s('types', 'Acute 0 < m < 90 · Right = 90 · Obtuse 90 < m < 180 · Straight = 180.', '89.5° is acute; 90° is right, never acute.'),
      s('bisect', 'Angle bisector: a ray that cuts an angle into two CONGRUENT angles.', 'If {ray BD} bisects ∠ABC then m∠ABD = m∠DBC.'),
      s('sums', 'Complementary: sum 90. Supplementary: sum 180.', 'complement of x = 90 − x · supplement of x = 180 − x.'),
      s('pairs', 'Adjacent: shared vertex AND shared side, no shared interior. Linear pair: adjacent, non-common sides opposite rays. Vertical: the two non-adjacent angles two lines make.', 'Vertical angles are congruent but NEVER adjacent.'),
      s('facts', 'Two lines meet in at most one point · two planes meet in a line · a line and a plane meet in a point, or the line lies in it, or not at all.', 'Two planes never meet "at a point".'),
    ],
  },
  {
    id: 'setup', title: 'Every word problem starts here', blurb: 'Write these three down before you read the sentence twice.',
    lines: [
      s('three', 'the angle = x · its complement = 90 − x · its supplement = 180 − x', 'Write all three at the top. Then translate the sentence literally, left to right.'),
      s('translate', '“is / equals” → = · “more than” → + · “less than” → subtract from · “times” → ×  · “of” → ×', '“the supplement is 10 more than nine times the angle” → 180 − x = 10 + 9x → x = 17.'),
      s('finish', 'Solving for x is step one. Reread what the question ASKED for.', 'It wants the complement? Write 90 − 17 = 73 and answer that.'),
      s('nested', 'Work a nested phrase from the inside out.', '“the supplement of the complement” → the complement is 90 − x, so the answer is 180 − (90 − x).'),
    ],
  },
  {
    id: 'figure', title: 'Facts you use on a figure', blurb: 'Three lines that solve most diagram problems.',
    lines: [
      s('linear', 'Linear pair ⇒ SUPPLEMENTARY: the two add to 180.', '(3x + y) + (4y + x − 5) = 180.'),
      s('vertical', 'Vertical ⇒ CONGRUENT: set the two expressions equal.', '3x + y = 4x + y + 10 → x = −10.'),
      s('bisector', 'Bisector ⇒ two congruent halves — and the two halves add to the whole.', '(5x + 16) + (8x − 23) = 11x + 19 → x = 13 → 81 and 81, so it bisects.'),
      s('right', 'A right-angle mark is a fact: that angle is 90, so the two parts of it add to 90.', '∠BFD = 90, so ∠BFC + ∠CFD = 90.'),
      s('check', 'Put your number back into every expression and check the picture is possible.', 'No angle may come out negative, zero, or more than 180.'),
    ],
  },
  {
    id: 'ratio', title: 'Ratios', blurb: 'p : q means PARTS.',
    lines: [
      s('parts', 'p : q of a whole ⇒ p + q parts; one part = whole ÷ (p + q).', '7 : 2 supplementary → 9 parts → 180 ÷ 9 = 20 → 140° and 40°.'),
      s('cross', 'A ratio of two expressions ⇒ write it as a fraction and cross-multiply.', '(180 − x)/(90 − x) = 5/2 → 360 − 2x = 450 − 5x → x = 30.'),
      s('reduce', 'A ratio ANSWER is reduced, and it keeps the order the question asked.', '54 : 36 → 3 : 2, not 2 : 3.'),
    ],
  },
  {
    id: 'roots', title: 'Two roots', blurb: 'The single most expensive habit on this test.',
    lines: [
      s('both', 'Check BOTH roots. Reject one only if it makes a length or an angle negative or zero. If both work, BOTH are answers.', '2x² − 5x − 3 = 0 → (2x + 1)(x − 3) = 0 → x = −1/2 or x = 3 — both give positive angles, so both are answers.'),
      s('reject', 'A negative x is not automatically wrong — a negative MEASURE is.', 'x = −8 gave m∠MAH = 67 and m∠HAC = 67: perfectly legal, and it is the case that bisects.'),
      s('length', 'A side length must be positive.', 'm² − 3m − 10 = 0 → m = 5 or m = −2 → reject −2: a side cannot be −2.'),
      s('say', 'Say the reason in words. “Reject x = 0 because an angle of 0° is not an angle.”', 'A rejected root with no reason costs the mark anyway.'),
    ],
  },
  {
    id: 'factor', title: 'Factoring, a > 1', blurb: 'In this order, every time.',
    lines: [
      s('gcf', '1. GCF FIRST — from all three terms, including the number in front.', '16b² + 60b − 100 → 4(4b² + 15b − 25) → 4(4b − 5)(b + 5).'),
      s('neg', '2. Negative lead ⇒ pull out the −1 (with the GCF) before anything else.', '−6a² − 25a − 25 → −(6a² + 25a + 25) → −(2a + 5)(3a + 5).'),
      s('ac', '3. ac-method: multiply a × c, find two numbers that multiply to ac and ADD to b, split the middle term, group.', '3p² − 2p − 5: ac = −15 → −5 and +3 → 3p² − 5p + 3p − 5 → p(3p − 5) + 1(3p − 5) → (3p − 5)(p + 1).'),
      s('signs', '4. Signs: c positive ⇒ both factors share b’s sign. c negative ⇒ the factors differ, and the bigger one takes b’s sign.', 'x² + 9x + 8 → (x + 8)(x + 1) · x² − 3x − 10 → (x − 5)(x + 2).'),
      s('checkfac', '5. Multiply it back out. Always. It takes four seconds.', '(3p − 5)(p + 1) = 3p² + 3p − 5p − 5 = 3p² − 2p − 5 ✓'),
      s('solve', 'To SOLVE: get “= 0”, factor, set each factor to 0.', 'x² + 9x + 8 = 0 → (x + 8)(x + 1) = 0 → x = −8 or x = −1.'),
    ],
  },
  {
    id: 'system', title: 'A system', blurb: 'Two equations, two unknowns.',
    lines: [
      s('sub', 'Substitution — when one equation already says “y = …”, put that into the other.', 'x + y = 90 and y = 2x → x + 2x = 90 → x = 30, y = 60.'),
      s('elim', 'Elimination — line the variables up, then add or subtract to kill one.', '3x + y = 4x + y + 10 → subtract (y from both) → 0 = x + 10 → x = −10.'),
      s('back', 'Put the one you found back in to get the other — then check BOTH equations.', 'x = −10 in 4x + 5y = 185 → −40 + 5y = 185 → y = 45.'),
    ],
  },
].map(sec => Object.freeze({ ...sec, lines: Object.freeze(sec.lines) })));

export const FIXED_LINE_COUNT = FIXED.reduce((n, sec) => n + sec.lines.length, 0);

/* ------------------------------------------------------------------ the personalised block */

const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);

/** Tally `save.errors[].tags` → { tag: count }. */
export function tagCounts(save) {
  const out = {};
  for (const e of Array.isArray(save?.errors) ? save.errors : []) {
    if (!isObj(e) || !Array.isArray(e.tags)) continue;
    for (const t of e.tags) if (typeof t === 'string' && t) out[t] = (out[t] ?? 0) + 1;
  }
  return out;
}

/** The most-counted tag of an area, or null. */
function topTagOfArea(counts, area) {
  let best = null;
  for (const [tag, n] of Object.entries(counts)) {
    if (lookup(tag).area !== area) continue;
    if (!best || n > best.n) best = { tag, n, ...lookup(tag) };
  }
  return best;
}

/**
 * The 4 definitions this student is weakest on: the `voc-*` tiles that are uncleared, then Bronze,
 * then Silver, then the ones they have attempted most. Deterministic — §0 order breaks every tie.
 */
export function weakestTerms(save, { max = 4 } = {}) {
  const score = (v) => {
    const rec = save?.cards?.[v.id];
    if (!isObj(rec)) return 0;                    // never seen — the top of the list
    if (rec.cleared !== true) return 1;
    return { bronze: 2, silver: 3, gold: 5, platinum: 6 }[rec.rarity] ?? 4;
  };
  return vocab
    .map((v, i) => ({ v, i, s: score(v), a: save?.cards?.[v.id]?.attempts ?? 0 }))
    .sort((x, y) => (x.s - y.s) || (y.a - x.a) || (x.i - y.i))
    .slice(0, max)
    .map(x => x.v);
}

/**
 * personalLines(save, { max }) → [{ id, title, text, why }]  (≤ 12, S7's order)
 *   1 the most-missed NOTATION rule
 *   2 the comp/supp SET-UP line
 *   3 ROOT rejection
 *   4 the SIGN pattern (factoring)
 *   5 anything else that is being missed a lot (ratio, figure pairs, vocabulary, reasoning)
 *   6 the 4 lowest-mastery definitions
 * On a fresh save (no errors yet) the first four fall back to the rules those lapses would have
 * produced, so the sheet is never empty and never lies about what went wrong.
 */
export function personalLines(save, { max = MAX_PERSONAL, terms = 4 } = {}) {
  const counts = tagCounts(save);
  const out = [];
  const seen = new Set();
  const push = (id, title, text, why) => {
    if (out.length >= max || seen.has(id)) return;
    seen.add(id);
    out.push({ id, title, text, why: why ?? '' });
  };

  const ORDER = [
    { area: 'notation', title: 'Notation', fallback: '{ray AB} starts at A. {seg AB} has two ends. AB with no bar is a number.' },
    { area: 'comp-supp', title: 'Set-up', fallback: 'Write x, 90 − x and 180 − x first, then translate the sentence literally.' },
    { area: 'setup', title: 'The equation', fallback: 'The setup is worth 40 % of the mark — write the equation even when you can see the answer.' },
    { area: 'roots', title: 'Both roots', fallback: 'Reject a root only when it makes an angle or a length negative or zero. Otherwise keep both.' },
    { area: 'factoring', title: 'Signs', fallback: 'GCF first, then ac-method; c negative means the two factors have different signs.' },
    { area: 'ratio', title: 'Ratios', fallback: 'p : q means p + q parts. Divide the whole by the number of parts.' },
    { area: 'figure', title: 'In a figure', fallback: 'Linear pair adds to 180; vertical angles are equal. Name the fact before you write the equation.' },
    { area: 'vocab', title: 'Vocabulary', fallback: '' },
    { area: 'classify', title: 'Angle types', fallback: '' },
    { area: 'reasoning', title: 'Always / Sometimes / Never', fallback: '' },
    // 'general' is deliberately absent: its catalogue fix is "open the Errors list", which is useless
    // on a sheet of paper the night before.
  ];

  const missed = [];
  for (const row of ORDER) {
    const hit = topTagOfArea(counts, row.area);
    if (hit) missed.push({ ...row, hit });
  }
  // the four S7 headline areas first, in S7's order, whether or not they were missed …
  for (const row of ORDER.slice(0, 5)) {
    const hit = missed.find(m => m.area === row.area)?.hit;
    if (hit) push(`m-${row.area}`, row.title, hit.fix, `you have missed this ${hit.n} time${hit.n === 1 ? '' : 's'}`);
    else if (row.fallback) push(`m-${row.area}`, row.title, row.fallback, '');
  }
  // … then anything else that is actually being missed, biggest first.
  for (const m of missed.filter(x => !seen.has(`m-${x.area}`)).sort((a, b) => b.hit.n - a.hit.n)) {
    push(`m-${m.area}`, m.title, m.hit.fix, `missed ${m.hit.n} time${m.hit.n === 1 ? '' : 's'}`);
  }
  // … and the four definitions with the least behind them.
  for (const v of weakestTerms(save, { max: terms })) {
    push(`v-${v.key}`, v.term.replace(/^./, c => c.toUpperCase()), v.def, 'one of your four thinnest definitions');
  }
  return out.slice(0, max);
}

/** Everything the screen renders: the personalised block, then the fixed sheet. */
export function sheetFor(save, opts = {}) {
  return { personal: personalLines(save, opts), fixed: FIXED };
}

/** Areas, re-exported so the screen can label a line without importing the catalogue. */
export { AREAS };

export default FIXED;
