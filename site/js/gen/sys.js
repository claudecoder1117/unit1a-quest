// sys.js — T-sys, the systems family (T07c; M12, skill SYS, family tile `fam-sys`).
// COMPOSED S2: "`T-sys`: x, y ∈ [−9, 9], coefficients ∈ [−6, 6]\{0}, det ≠ 0;
// substitution-friendly / elimination-friendly / general."  S2 coverage row: input `multi` (x, y).
//
// Generated answer-backward: the solution (x, y) is drawn first and the constants follow
// (c = a·x + b·y), so the system is always consistent and its solution is the integer pair
// the item asks for. det = a₁b₂ − a₂b₁ is checked ≠ 0 on every emitted item (tests/gen.test.mjs
// re-checks it over 5 000 seeds per template).
//
// Modes
//   'sub'   — one equation is already solved for a variable (`y = 3x − 4`) or has a ±1 coefficient
//   'elim'  — one variable's coefficients are equal or opposite, so adding/subtracting kills it
//   'general' — neither; the student scales one equation first
//
// parts: [{ id:'xy', type:'multi', fields:[{key:'x',…},{key:'y',…}] }]
// The `multi` grader also accepts the whole answer typed as one string, `(-10, 45)` (S3), so the
// "(x, y)" form of the S2 coverage row works with no extra part.
//
// DOM-free, no Math.random.

import { seedTag } from '../rng.js';

const MINUS = '−';

function num(n) { return n < 0 ? `${MINUS}${Math.abs(n)}` : String(n); }

/** `3x`, `−x`, `x` — one term of a standard-form equation (leading term, no sign spacing). */
function lead(a, v) {
  if (a === 1) return v;
  if (a === -1) return `${MINUS}${v}`;
  return `${num(a)}${v}`;
}

/** ` + 4y` / ` − 4y` / ` + y` — a following term. */
function follow(a, v) {
  return ` ${a < 0 ? MINUS : '+'} ${Math.abs(a) === 1 ? '' : Math.abs(a)}${v}`;
}

/** `3x − 4y = 11` — display form of a standard-form equation. */
function stdText(a, b, c) {
  return `${lead(a, 'x')}${follow(b, 'y')} = ${num(c)}`;
}

/** ASCII form for the `equation` grader / solution steps: `3x - 4y = 11`. */
function stdAscii(a, b, c) {
  const t1 = a === 1 ? 'x' : a === -1 ? '-x' : `${a}x`;
  const t2 = `${b < 0 ? ' - ' : ' + '}${Math.abs(b) === 1 ? '' : Math.abs(b)}y`;
  return `${t1}${t2} = ${c}`;
}

/** `y = 3x − 4` — the substitution-ready form (m ≠ 0). */
function solvedText(varName, other, m, k) {
  const head = m === 1 ? other : m === -1 ? `${MINUS}${other}` : `${num(m)}${other}`;
  if (k === 0) return `${varName} = ${head}`;
  return `${varName} = ${head} ${k < 0 ? MINUS : '+'} ${Math.abs(k)}`;
}

const NONZERO = Object.freeze([-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6]);

const EXEMPLAR = Object.freeze({ mode: 'elim', x: 3, y: -2, a1: 2, b1: 3, a2: 2, b2: -1 });

/**
 * Build one T-sys item.
 * opts: { mode?:'sub'|'elim'|'general', solvedFor?:'x'|'y' }
 */
export function build(rng, opts = {}) {
  const mode = opts.mode ?? rng.weighted(['sub', 'elim', 'general'], [4, 4, 3]);
  while (rng.draws < 200) {
    const x = rng.int(-9, 9);
    const y = rng.int(-9, 9);
    const a1 = rng.pick(NONZERO);
    const b1 = rng.pick(NONZERO);
    let a2 = rng.pick(NONZERO);
    let b2 = rng.pick(NONZERO);

    if (mode === 'elim') {
      // make one column match or oppose, exactly
      if (rng.chance(0.5)) a2 = rng.chance(0.5) ? a1 : -a1;
      else b2 = rng.chance(0.5) ? b1 : -b1;
    }

    const det = a1 * b2 - a2 * b1;
    if (det === 0) continue;                                 // S2 invariant: det ≠ 0

    const c1 = a1 * x + b1 * y;
    const c2 = a2 * x + b2 * y;
    if (Math.abs(c1) > 99 || Math.abs(c2) > 99) continue;

    const hasUnit = [a1, b1, a2, b2].some((k) => Math.abs(k) === 1);
    const elimReady = Math.abs(a1) === Math.abs(a2) || Math.abs(b1) === Math.abs(b2);
    if (mode === 'sub' && !hasUnit) continue;
    if (mode === 'elim' && !elimReady) continue;
    if (mode === 'general' && (hasUnit || elimReady)) continue;

    // a substitution item shows the SOLVED equation first — swap if only the second one qualifies
    if (mode === 'sub' && Math.abs(a1) !== 1 && Math.abs(b1) !== 1) {
      return assemble(rng, { mode, x, y, a1: a2, b1: b2, c1: c2, a2: a1, b2: b1, c2: c1, det: -det }, opts);
    }
    return assemble(rng, { mode, x, y, a1, b1, c1, a2, b2, c2, det }, opts);
  }
  const e = EXEMPLAR;
  const det = e.a1 * e.b2 - e.a2 * e.b1;
  return assemble(rng, {
    mode: e.mode, x: e.x, y: e.y,
    a1: e.a1, b1: e.b1, c1: e.a1 * e.x + e.b1 * e.y,
    a2: e.a2, b2: e.b2, c2: e.a2 * e.x + e.b2 * e.y, det,
  }, opts);
}

function assemble(rng, p, opts) {
  const { mode, x, y, a1, b1, c1, a2, b2, c2, det } = p;

  // --- presentation: substitution items may show one equation already solved ------------------
  let eq1 = stdText(a1, b1, c1);
  let eq1Ascii = stdAscii(a1, b1, c1);
  let solvedNote = null;
  if (mode === 'sub' && (Math.abs(b1) === 1 || Math.abs(a1) === 1) && (opts.solvedFor !== 'none')) {
    if (Math.abs(b1) === 1) {
      // b1·y = c1 − a1·x  →  y = (c1 − a1 x)/b1 with b1 = ±1, so integers throughout
      const m = -a1 / b1, k = c1 / b1;
      eq1 = solvedText('y', 'x', m, k);
      eq1Ascii = `y = ${m === 1 ? 'x' : m === -1 ? '-x' : `${m}x`}${k === 0 ? '' : k < 0 ? ` - ${Math.abs(k)}` : ` + ${k}`}`;
      solvedNote = 'y';
    } else {
      const m = -b1 / a1, k = c1 / a1;
      eq1 = solvedText('x', 'y', m, k);
      eq1Ascii = `x = ${m === 1 ? 'y' : m === -1 ? '-y' : `${m}y`}${k === 0 ? '' : k < 0 ? ` - ${Math.abs(k)}` : ` + ${k}`}`;
      solvedNote = 'x';
    }
  }
  const eq2 = stdText(a2, b2, c2);
  const eq2Ascii = stdAscii(a2, b2, c2);

  const stem = `Solve the system:\n${eq1}\n${eq2}`;

  // --- the method the hints walk through ------------------------------------------------------
  let hints;
  const sameA = a1 === a2, oppA = a1 === -a2, sameB = b1 === b2, oppB = b1 === -b2;
  if (solvedNote) {
    const other = solvedNote === 'y' ? 'x' : 'y';
    hints = [
      `The first equation is already solved for ${solvedNote}, so use SUBSTITUTION: put that whole expression in place of ${solvedNote} in the second equation.`,
      `Substituting gives one equation in ${other} alone — expand the brackets carefully (the coefficient multiplies EVERY term) and collect like terms.`,
      `Solve that for ${other}, then put the value back into ${eq1} to get ${solvedNote}. Write the answer as a pair, and check it in BOTH equations.`,
    ];
  } else if (sameB || oppB || sameA || oppA) {
    const col = (sameB || oppB) ? 'y' : 'x';
    const op = (oppB || oppA) ? 'ADD' : 'SUBTRACT';
    hints = [
      `The ${col}-coefficients are ${(oppB || oppA) ? 'opposites' : 'the same'}, so use ELIMINATION: ${op} the two equations and ${col} disappears.`,
      `${op === 'ADD' ? 'Adding' : 'Subtracting'} them leaves one equation in ${col === 'y' ? 'x' : 'y'} alone. Line the equations up in columns first so nothing gets lost.`,
      `Solve that single equation, then substitute the value back into ${eq1} to get the other variable. Check the pair in BOTH equations.`,
    ];
  } else {
    hints = [
      `Nothing cancels yet, so make it cancel: multiply one (or both) equations so that one variable's coefficients become opposites.`,
      `Multiplying the first equation by ${Math.abs(a2)} and the second by ${Math.abs(a1)} makes the x-coefficients ${Math.abs(a1 * a2)} and ${Math.abs(a1 * a2)} — then add or subtract to eliminate x.`,
      `That leaves one equation in y alone. Solve it, substitute back into ${eq1}, and check the pair in BOTH equations.`,
    ];
  }

  /** `5(−1) − 6(−6) = 31` — the substitution check, with real signs. */
  const checkText = (a, b, c) =>
    `${num(a)}(${num(x)}) ${b < 0 ? MINUS : '+'} ${Math.abs(b)}(${num(y)}) = ${num(c)}`;
  // equation 1 may be displayed in its SOLVED form — check it the way the student sees it
  const check1 = solvedNote === 'y'
    ? `${num(y)} = ${eq1.slice(4)} with x = ${num(x)}`
    : solvedNote === 'x'
      ? `${num(x)} = ${eq1.slice(4)} with y = ${num(y)}`
      : checkText(a1, b1, c1);

  const solution = [
    { say: 'The system', math: `${eq1}\n${eq2}` },
    solvedNote
      ? { say: `The first equation gives ${solvedNote} directly — substitute it into the other equation`, math: `${eq1}  into  ${eq2}` }
      : { say: 'Line the equations up and eliminate one variable', math: `${eq1}\n${eq2}` },
    { say: 'Solve the resulting one-variable equation', math: `x = ${num(x)}` },
    { say: 'Substitute that back into the first equation', math: `${eq1}  →  y = ${num(y)}` },
    { say: 'Check the pair in BOTH equations', math: `${check1} ✓   ${checkText(a2, b2, c2)} ✓` },
    { say: 'Solution', math: `(${num(x)}, ${num(y)})` },
  ];

  // Swapping x and y is the classic slip; `multi` also diagnoses it structurally (swapped-fields).
  const misconceptions = [];
  if (x !== y) {
    misconceptions.push({ part: 'xy', field: 'x', answer: y, tag: 'swapped-fields', msg: 'That is the y-value — it goes in the other box.' });
    misconceptions.push({ part: 'xy', field: 'y', answer: x, tag: 'swapped-fields', msg: 'That is the x-value — it goes in the other box.' });
  }
  if (x !== 0 && -x !== y) {
    misconceptions.push({ part: 'xy', field: 'x', answer: -x, tag: 'sign-flip', msg: `Right size, wrong sign — check the sign when you ${solvedNote ? 'substituted' : 'combined the equations'}.` });
  }

  return {
    id: `T-sys#${seedTag(rng.seed)}`,
    template: 'T-sys',
    family: 'fam-sys',
    params: { mode, x, y, a1, b1, c1, a2, b2, c2, det, solvedFor: solvedNote },
    prompt: stem,
    stem,
    figure: null,
    skills: ['SYS'],
    equations: [eq1Ascii, eq2Ascii],
    parts: [{
      id: 'xy',
      type: 'multi',
      prompt: 'Give both values.',
      fields: [
        { key: 'x', label: 'x =', answer: x },
        { key: 'y', label: 'y =', answer: y },
      ],
    }],
    answer: `(${num(x)}, ${num(y)})`,
    hints,
    solution,
    misconceptions,
  };
}

export const templates = Object.freeze([
  Object.freeze({
    id: 'T-sys', version: 1, label: 'Solve a system', module: 'M12', sheet: 'ALG',
    skills: ['SYS'], tier: 3, par: 150, family: 'fam-sys', partTypes: ['multi'],
    modes: ['sub', 'elim', 'general'],
    gen: (rng, opts = {}) => build(rng, opts),
  }),
]);

export default templates;
