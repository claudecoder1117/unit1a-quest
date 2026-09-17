// contract.js — the shared generator contract (COMPOSED S2 "Generator contract", S8 #7a).
//
//   makeGen(template, draw, options) → gen(seed, params) → item
//   item = { id:'T-cs-lin#a91f2c', template:'T-cs-lin', templateVersion:1, seed, seedKey, params,
//            prompt, figure:null, parts:[…], answer:'17°', hints:[3], solution:[{say, math}], misconceptions:[…],
//            skills:[…], tier, par, module, sheet, meta:{…} }
//
// What this file guarantees for every template that uses it (S2):
//   · ids are `T-<template>#<seed>` (6 hex of the uint32 stream seed) and `templateVersion` rides on every item,
//     so a missed Variant frozen into the save (S6 `frozen`) comes back byte-identical;
//   · the draw is DETERMINISTIC in the seed — `gen(s)` deep-equals `gen(s)`, and a re-roll keeps drawing from
//     the SAME stream, so the n-th rejected draft is part of the seed's history, not a fresh random;
//   · re-rolls are capped (MAX_ATTEMPTS = 200 draws); after that the template's FIXED EXEMPLAR is returned
//     (stamped with the requested id/seed and `fallback:true`) — a generator never returns junk and never hangs;
//   · answer-backward + solver check: the draw picks the answer first and builds the numbers around it, then this
//     file re-derives the answer from the EMITTED problem with the site's own solver (poly.js parses the emitted
//     equation, solveQuadratic/solveLinear finds its roots, the asks chain is re-applied) and re-rolls on mismatch;
//   · structural validation: no NaN / undefined / Infinity anywhere in the item, hints[3], a solution[], every
//     `num` part carries its `distractors` (S8 #7a), part ids unique, prompt non-empty.
//
// Nothing here touches the DOM, imports anything outside `site/`, or draws from an unseeded source (js/rng.js only).
//
// The draw function:
//   draw(rng, params, api) → draft | null      (null / api.reject() = "bad draw, roll again")
//   draft = { prompt, parts, answer, hints, solution, misconceptions?, meta?, figure?, tier?, par?, skills? }
// api = { reject(), fmt, deg, comp, supp, isMeasure, isAcute, isHalf, chain helpers, word helpers, … } — see API below.

import { mulberry32, rngFrom, seedTag } from '../rng.js';
import { grade } from '../grader/index.js';
import { parseRational, solveQuadratic, polyIsZero, polyDegree, polyEvalAt, ratToNumber, isRat } from '../grader/poly.js';

/** Bumped only when the SHAPE of every generated item changes (not when one template's numbers change). */
export const CONTRACT_VERSION = 1;

/** S2: "deterministic re-roll from the same rng (max 200 draws, then a fixed exemplar)". */
export const MAX_ATTEMPTS = 200;

/** The tolerance every generated answer must be exact to; generators only ever emit integers and halves. */
export const GEN_EPS = 1e-9;

// ---------------------------------------------------------------------------
// Small numeric helpers (shared by every comp/supp template)
// ---------------------------------------------------------------------------

/** the complement of a measure */
export const comp = (v) => 90 - v;
/** the supplement of a measure */
export const supp = (v) => 180 - v;

/** S2 invariant: every measure a generated item mentions lies strictly inside (0, 180). */
export function isMeasure(v) {
  return Number.isFinite(v) && v > 0 && v < 180;
}

/** S2 invariant: x lies strictly inside (0, 90) for anything with a complement. */
export function isAcute(v) {
  return Number.isFinite(v) && v > 0 && v < 90;
}

/** S2 invariant: answers are integers or halves (nothing else is typeable on a phone). */
export function isHalf(v) {
  return Number.isFinite(v) && Number.isInteger(v * 2);
}

/** true when v is a whole number of degrees */
export function isInt(v) {
  return Number.isFinite(v) && Number.isInteger(v);
}

/** a measure a student will see: integer or half, strictly inside (0, 180) */
export function okMeasure(v) {
  return isMeasure(v) && isHalf(v);
}

/**
 * fmt — a number as the answer key writes it: `17`, `21.5`, `111.5`. Never `-0`, never exponential.
 * A string passes through untouched (a generator may hand a fixture spelling straight in).
 */
export function fmt(v) {
  if (typeof v === 'string') return v;
  if (!Number.isFinite(v)) return String(v); // 'NaN' / 'Infinity' — validateItem turns this into a rejected draw
  const r = Math.round(v * 1e6) / 1e6;
  return r === 0 ? '0' : String(r);
}

/** fmt + the degree glyph, for prompts and solution steps. */
export function deg(v) {
  return `${fmt(v)}°`;
}

/** reduce a:b by the gcd (both positive integers) */
export function reduceRatio(a, b) {
  const g = gcdInt(Math.round(a), Math.round(b));
  return g > 0 ? [Math.round(a) / g, Math.round(b) / g] : [Math.round(a), Math.round(b)];
}

/** greatest common divisor of two integers (absolute value; gcd(0, n) = |n|) */
export function gcdInt(a, b) {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) { const t = a % b; a = b; b = t; }
  return a;
}

// ---------------------------------------------------------------------------
// Words — the teacher writes multipliers as words and constants as digits
// ("10 more than nine times the angle", "12 more than twice the difference").
// ---------------------------------------------------------------------------

const MULT_WORD = {
  1: '', 2: 'twice', 3: 'three times', 4: 'four times', 5: 'five times', 6: 'six times',
  7: 'seven times', 8: 'eight times', 9: 'nine times', 10: 'ten times',
};
const NUM_WORD = {
  1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven',
  8: 'eight', 9: 'nine', 10: 'ten', 11: 'eleven', 12: 'twelve',
};
const FRACTION_WORD = { 2: 'one-half', 3: 'one-third', 4: 'one-fourth', 5: 'one-fifth', 6: 'one-sixth' };

/** 9 → "nine times", 2 → "twice", 1 → "" (the sentence supplies "the" itself); else "<n> times". */
export function timesWord(m) {
  return MULT_WORD[m] ?? `${fmt(m)} times`;
}

/** 3 → "three" (small counts inside a sentence) */
export function numWord(n) {
  return NUM_WORD[n] ?? fmt(n);
}

/** 3 → "one-third" */
export function fractionWord(d) {
  return FRACTION_WORD[d] ?? `1/${fmt(d)}`;
}

/** 2 → "double", 3 → "triple", 1 → "" , else "<n> times" (the #13 sentence family) */
export function multiplyWord(m) {
  if (m === 2) return 'double';
  if (m === 3) return 'triple';
  return timesWord(m);
}

/** collapse the double spaces a missing multiplier word leaves behind, and fix " ." */
export function squash(s) {
  return String(s).replace(/\s+/g, ' ').replace(/\s+([.,?])/g, '$1').trim();
}

/** "(180 − x)" → "180 − x"; leaves "(a) − (b)" alone (display only — canonicals keep their parens). */
export function stripOuter(s) {
  let out = String(s).trim();
  for (let guard = 0; guard < 6; guard++) {
    if (out.length < 2 || out[0] !== '(' || out[out.length - 1] !== ')') return out;
    let depth = 0;
    let matched = true;
    for (let i = 0; i < out.length; i++) {
      if (out[i] === '(') depth++;
      else if (out[i] === ')') {
        depth--;
        if (depth === 0 && i !== out.length - 1) { matched = false; break; }
      }
    }
    if (!matched) return out;
    out = out.slice(1, -1).trim();
  }
  return out;
}

// ---------------------------------------------------------------------------
// The asks chain (S3 `num`): ['comp','supp'] = "the supplement of the complement"
// ---------------------------------------------------------------------------

const STEP_NAMES = { comp: 'the complement', supp: 'the supplement', angle: 'the angle', smaller: 'the smaller angle', larger: 'the larger angle' };

/** apply one chain step to a measure ('comp' → 90 − v, 'supp' → 180 − v) */
export function stepValue(step, v) {
  if (step === 'comp') return comp(v);
  if (step === 'supp') return supp(v);
  return v;
}

/**
 * chainValue — fold a list of ops over a base measure, innermost first.
 * chainValue(21.5, ['comp','supp']) = 180 − (90 − 21.5) = 111.5
 * Returns { value, steps:[{op, from, to}] } — the steps feed solution[] and the hint ladder.
 */
export function chainValue(base, ops) {
  const steps = [];
  let v = base;
  for (const op of ops) {
    const from = v;
    v = stepValue(op, v);
    steps.push({ op, from, to: v });
  }
  return { value: v, steps };
}

/**
 * describeOps — ops innermost-first → the English of the OUTERMOST-first reading.
 * describeOps(['comp','supp']) = "the supplement of the complement"
 */
export function describeOps(ops) {
  if (!ops || !ops.length) return 'the angle';
  return ops.slice().reverse().map((o) => STEP_NAMES[o] ?? `the ${o}`).join(' of ');
}

/** "the supplement of the complement of 21.5°" — the phrase a csarith prompt is built from. */
export function describeChainOf(ops, base) {
  return `${describeOps(ops)} of ${deg(base)}`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const BAD_TEXT = /\bNaN\b|\bundefined\b|\bInfinity\b|\[object Object\]/;
const ID_RE = /^T-[a-z0-9-]+#[0-9a-f]{6}$/i;   // T07b: -L / -Q suffixes (T-fig-xlines-L) are capitalised in S2

/**
 * scanClean — deep walk of anything an item carries. Pushes a problem for every non-finite number and
 * every string that leaked a NaN / undefined / Infinity / [object Object] (S2: "no NaN/undefined in stems").
 */
export function scanClean(node, path = 'item', out = [], depth = 0) {
  if (depth > 12) return out;
  if (node == null) return out;
  const t = typeof node;
  if (t === 'number') {
    if (!Number.isFinite(node)) out.push(`${path} is ${String(node)}`);
    return out;
  }
  if (t === 'string') {
    if (BAD_TEXT.test(node)) out.push(`${path} contains a bad value: ${JSON.stringify(node.slice(0, 80))}`);
    return out;
  }
  if (t === 'function') { out.push(`${path} is a function`); return out; }
  if (Array.isArray(node)) {
    node.forEach((v, i) => scanClean(v, `${path}[${i}]`, out, depth + 1));
    return out;
  }
  if (t === 'object') {
    for (const [k, v] of Object.entries(node)) scanClean(v, `${path}.${k}`, out, depth + 1);
  }
  return out;
}

function nonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * validateItem — the structural half of the contract. Returns an array of problem strings (empty = good).
 * Everything here is a re-roll reason inside makeGen and an assertion in tests/gen.test.mjs.
 */
export function validateItem(item, opts = {}) {
  const out = [];
  if (!item || typeof item !== 'object') return ['item is not an object'];
  if (!ID_RE.test(String(item.id))) out.push(`id ${JSON.stringify(item.id)} is not T-<template>#<6 hex>`);
  if (!nonEmptyString(item.template)) out.push('template is missing');
  if (!Number.isInteger(item.templateVersion) || item.templateVersion < 1) out.push('templateVersion must be a positive integer');
  if (!Number.isInteger(item.seed) && !(typeof item.seed === 'string' && item.seed.length)) out.push('seed must be an integer or a seed string');
  if (!nonEmptyString(item.prompt)) out.push('prompt is empty');
  if (!nonEmptyString(item.stem)) out.push('stem is empty');
  if (item.stem !== item.prompt) out.push('stem and prompt disagree');
  if (!nonEmptyString(item.answer)) out.push('answer (display string) is empty');
  if (!Array.isArray(item.hints) || item.hints.length !== 3 || !item.hints.every(nonEmptyString)) out.push('hints must be 3 non-empty strings');
  if (!Array.isArray(item.solution) || item.solution.length < 2) out.push('solution must have at least 2 steps');
  else {
    item.solution.forEach((s, i) => {
      if (!s || typeof s !== 'object') out.push(`solution[${i}] is not a step object`);
      else if (!nonEmptyString(s.say)) out.push(`solution[${i}].say is empty`);
      else if (s.math != null && typeof s.math !== 'string') out.push(`solution[${i}].math is not a string`);
    });
  }
  if (!Array.isArray(item.misconceptions)) out.push('misconceptions must be an array');
  else {
    item.misconceptions.forEach((m, i) => {
      if (!m || typeof m !== 'object') { out.push(`misconceptions[${i}] is not an object`); return; }
      if (m.answer == null || m.answer === '') out.push(`misconceptions[${i}].answer is empty`);
      if (!nonEmptyString(m.msg)) out.push(`misconceptions[${i}].msg is empty`);
    });
  }
  if (!Array.isArray(item.parts) || item.parts.length === 0) out.push('parts is empty');
  else {
    const ids = new Set();
    let sawDistractors = false;
    item.parts.forEach((p, i) => {
      if (!p || typeof p !== 'object') { out.push(`parts[${i}] is not an object`); return; }
      if (!nonEmptyString(p.id)) out.push(`parts[${i}].id is empty`);
      else if (ids.has(p.id)) out.push(`parts[${i}].id ${p.id} is duplicated`);
      else ids.add(p.id);
      if (!nonEmptyString(p.type)) out.push(`parts[${i}].type is empty`);
      const hasDist = p.distractors && typeof p.distractors === 'object' && Object.keys(p.distractors).length > 0;
      if (hasDist || (Array.isArray(p.distractors) && p.distractors.length)) sawDistractors = true;
      if (p.type === 'num') {
        if (p.answer == null || p.answer === '') out.push(`parts[${i}] (num) has no answer`);
        if (opts.requireDistractors !== false && !hasDist) out.push(`parts[${i}] (num ${p.id}) carries no distractors`);
      }
      if (p.type === 'multi') {
        if (!Array.isArray(p.fields) || !p.fields.length) out.push(`parts[${i}] (multi) has no fields`);
        else p.fields.forEach((f, j) => {
          if (!nonEmptyString(f.key)) out.push(`parts[${i}].fields[${j}].key is empty`);
          if (f.answer == null || f.answer === '') out.push(`parts[${i}].fields[${j}] has no answer`);
          if (f.distractors && Object.keys(f.distractors).length) sawDistractors = true;
        });
      }
      if (p.type === 'roots' && (!Array.isArray(p.answer) || !p.answer.length)) out.push(`parts[${i}] (roots) has no answer list`);
      if (p.type === 'ratio' && !nonEmptyString(p.answer)) out.push(`parts[${i}] (ratio) has no answer`);
      if (p.type === 'equation') {
        if (!nonEmptyString(p.canonical) && !Array.isArray(p.system)) out.push(`parts[${i}] (equation) has no canonical`);   // T07b: a two-variable `system` setup (doc-07) has no single canonical
        if (!nonEmptyString(p.var)) out.push(`parts[${i}] (equation) has no var`);
      }
      if (p.type === 'reject') {
        if (!Array.isArray(p.valid)) out.push(`parts[${i}] (reject) has no valid list`);
        if (!nonEmptyString(p.reason)) out.push(`parts[${i}] (reject) has no reason`);
        if (Array.isArray(p.distractors) && p.distractors.length >= 2) sawDistractors = true;
        else out.push(`parts[${i}] (reject) needs at least 2 reason distractors`);
      }
    });
    if (opts.requireDistractors !== false && !sawDistractors) out.push('no part carries distractors (S8 #7a: every Variant carries its distractors)');
  }
  scanClean({ ...item, params: item.params ?? null }, 'item', out);
  return out;
}

/**
 * answerFor — the raw a widget would submit when the student answers this part perfectly.
 * Used by the contract's own round-trip check and by tests/gen.test.mjs.
 */
export function answerFor(part) {
  switch (part.type) {
    case 'num': {
      if (!Array.isArray(part.bonus) || !part.bonus.length) return part.answer;
      const raw = { value: part.answer };
      for (const b of part.bonus) raw[b.key] = b.answer;
      return raw;
    }
    case 'multi': {
      const raw = {};
      for (const f of part.fields) raw[f.key] = f.answer;
      return raw;
    }
    case 'roots': return part.answer.join(', ');
    case 'ratio': return part.answer;
    case 'equation': return part.text ?? `${part.canonical} = 0`;
    case 'reject': return { keep: part.valid ?? [], reject: part.rejected ?? [], reason: part.reason };
    case 'cases': return (part.rows ?? []).map((r) => ({ ...r }));
    default: return part.answer;
  }
}

/**
 * checkAnswers — round-trip every part's own answer through the site's grader dispatcher.
 * Returns problem strings; empty means "a perfect student would score 100 % on this item".
 */
export function checkAnswers(item, ctx = {}) {
  const out = [];
  for (const part of item.parts ?? []) {
    let r;
    try {
      r = grade(part, answerFor(part), { card: item, misconceptions: item.misconceptions, state: {}, ...ctx });
    } catch (e) {
      out.push(`${part.id}: grader threw ${e && e.message ? e.message : String(e)}`);
      continue;
    }
    if (!r || r.kind !== 'correct') out.push(`${part.id} (${part.type}) grades ${r ? r.kind : 'nothing'}: ${r ? r.msg : ''}`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The solver check — "run the site's own solver on the emitted problem"
// ---------------------------------------------------------------------------

/**
 * solveEmitted — parse an emitted equation part with poly.js and return its rational roots ascending.
 * The canonical is LHS − RHS; a ratio setup divides by (90 − x) etc., so the numerator is what we solve.
 * Returns null when the equation cannot be parsed or is not solvable as a linear/quadratic.
 */
export function solveEmitted(canonical, variable = 'x') {
  const parsed = parseRational(canonical, { var: variable });
  if (!parsed || !parsed.ok) return null;
  const num = parsed.num;
  if (!num || polyIsZero(num)) return null;
  const deg = polyDegree(num);
  if (deg < 1 || deg > 2) return null;
  const sol = solveQuadratic(num);
  if (!sol || !Array.isArray(sol.roots) || !sol.roots.length) return null;
  if (!sol.exact) return null;
  const roots = sol.roots.map((r) => (isRat(r) ? ratToNumber(r) : Number(r)));
  if (roots.some((r) => !Number.isFinite(r))) return null;
  // a root that makes the denominator vanish is not a solution of the original equation
  const den = parsed.den;
  const keep = den && polyDegree(den) >= 1
    ? roots.filter((r) => Math.abs(polyEvalAt(den, r)) > 1e-9)
    : roots;
  return keep.sort((a, b) => a - b);
}

/**
 * linearForm — the emitted equation, collected: `A·x = C` (the step a student writes just before
 * dividing). Returns { a, c, mul } with integer a and c after multiplying through by `mul` (1 when the
 * equation is already integral), or null when the equation is not linear in `variable`.
 */
export function linearForm(canonical, variable = 'x') {
  const parsed = parseRational(canonical, { var: variable });
  if (!parsed || !parsed.ok) return null;
  const num = parsed.num;
  if (!num || polyDegree(num) !== 1) return null;
  const a0 = ratToNumber(num.c[1]);
  const b0 = ratToNumber(num.c[0]);
  if (!Number.isFinite(a0) || !Number.isFinite(b0) || a0 === 0) return null;
  for (let mul = 1; mul <= 12; mul++) {
    const a = a0 * mul;
    const c = -b0 * mul;
    if (Number.isInteger(Math.round(a * 1e6) / 1e6) && Number.isInteger(Math.round(c * 1e6) / 1e6)) {
      const ai = Math.round(a);
      const ci = Math.round(c);
      return ai < 0 ? { a: -ai, c: -ci, mul } : { a: ai, c: ci, mul };
    }
  }
  return null;
}

/**
 * defaultVerify — the generic solver check used when a template supplies no `verify` of its own:
 * every `equation` part must solve (with poly.js) to exactly the roots it claims.
 */
export function defaultVerify(item) {
  const out = [];
  for (const part of item.parts ?? []) {
    if (part.type !== 'equation' || !part.canonical) continue;
    const claimed = (part.roots ?? []).map(Number).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
    if (!claimed.length) continue;
    const got = solveEmitted(part.canonical, part.var ?? 'x');
    if (!got) { out.push(`${part.id}: the emitted equation ${part.canonical} does not solve`); continue; }
    const same = claimed.every((c) => got.some((g) => Math.abs(g - c) < 1e-6));
    if (!same) out.push(`${part.id}: solver got [${got.map(fmt).join(', ')}] but the item claims [${claimed.map(fmt).join(', ')}]`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// makeGen
// ---------------------------------------------------------------------------

function isRng(v) {
  return !!v && typeof v === 'object' && typeof v.next === 'function' && typeof v.int === 'function';
}

/** the rng a seed means: a number is a raw uint32 stream, a string is hashed with the template name (S3). */
function rngFor(template, seed) {
  if (isRng(seed)) return seed;
  if (typeof seed === 'number' && Number.isFinite(seed)) return mulberry32(seed >>> 0);
  return rngFrom(template, String(seed ?? ''));
}

const REJECT = Symbol('reject');

/**
 * makeGen — wrap a draw function in the S2 contract.
 *
 * @param {string} template  the registry name, e.g. 'T-cs-lin' (ids read `T-cs-lin#a91f2c`)
 * @param {(rng, params, api) => object|null} draw
 * @param {object} options
 *   version   {number}  templateVersion stamped on every item (bump when the numbers a seed produces change)
 *   skills    {string[]} · needs {string[]} · tier {number} · par {number} · module {string} · sheet {string}
 *   exemplar  {(api) => draft}  the FIXED fallback item used when 200 draws all fail (required)
 *   verify    {(item, api) => string[]}  the template's own solver check (defaults to defaultVerify)
 *   gradeCheck {boolean}  also round-trip every part through grade() inside the re-roll loop (default false —
 *              tests/gen.test.mjs does this over 5 000 seeds per template; leaving it off keeps Infinite mode snappy)
 * @returns {(seed?: string|number|object, params?: object) => object} gen
 */
export function makeGen(template, draw, options = {}) {
  const version = Number.isInteger(options.version) && options.version > 0 ? options.version : 1;
  const meta = {
    needs: Array.isArray(options.needs) ? options.needs.slice() : [],
    skills: Array.isArray(options.skills) ? options.skills.slice() : [],
    tier: Number.isInteger(options.tier) ? options.tier : 2,
    par: Number.isInteger(options.par) ? options.par : 150,
    module: options.module ?? null,
    sheet: options.sheet ?? null,
  };
  const verify = typeof options.verify === 'function' ? options.verify : defaultVerify;
  const validateOpts = { requireDistractors: options.requireDistractors !== false };

  const api = {
    reject() { throw REJECT; },
    fmt, deg, comp, supp, isMeasure, isAcute, isHalf, isInt, okMeasure,
    chainValue, describeOps, describeChainOf, stepValue,
    timesWord, numWord, fractionWord, multiplyWord, reduceRatio, gcdInt,
    template, version,
  };

  function finish(draft, id, seedValue, seedKey, params, extra = {}) {
    if (!draft || typeof draft !== 'object') return null;
    const { tier, par, skills, needs, ...rest } = draft;
    // `stem` is the shared name for the student-facing question (tests/gen.test.mjs, T09's card screen);
    // `prompt` mirrors it, the way data/cards.js carries both.
    const stem = rest.stem ?? rest.prompt ?? '';
    return {
      id,
      template,
      templateVersion: version,
      seed: seedValue,
      seedKey,
      params: params && typeof params === 'object' ? { ...params } : {},
      figure: null,
      misconceptions: [],
      module: meta.module,
      sheet: meta.sheet,
      skills: Array.isArray(skills) ? skills.slice() : meta.skills.slice(),
      needs: Array.isArray(needs) ? needs.slice() : meta.needs.slice(),   // T10 schedules on `needs` (S6 card schema)
      tier: Number.isInteger(tier) ? tier : meta.tier,
      par: Number.isInteger(par) ? par : meta.par,
      ...rest,
      stem,
      prompt: stem,
      ...extra,
    };
  }

  function gen(seed = 0, params = {}) {
    const rng = rngFor(template, seed);
    const seedValue = rng.seed >>> 0;
    const seedKey = isRng(seed) ? String(seedValue) : String(seed ?? '');
    const id = `${template}#${seedTag(seedValue)}`;
    const p = params && typeof params === 'object' ? params : {};
    let lastProblems = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let draft = null;
      try {
        draft = draw(rng, p, api);
      } catch (e) {
        if (e === REJECT) continue;
        throw e;
      }
      if (!draft) continue;
      const item = finish(draft, id, seedValue, seedKey, p, { attempt });
      if (!item) continue;
      const problems = validateItem(item, validateOpts);
      if (!problems.length) problems.push(...verify(item, api));
      if (!problems.length && options.gradeCheck) problems.push(...checkAnswers(item));
      if (!problems.length) return item;
      lastProblems = problems;
    }

    // 200 draws all failed — the fixed exemplar, stamped with this request's identity (S2).
    const draft = typeof options.exemplar === 'function' ? options.exemplar(api) : null;
    const item = finish(draft, id, seedValue, seedKey, p, { fallback: true, attempt: MAX_ATTEMPTS });
    if (!item) throw new Error(`${template}: no exemplar for the fallback path`);
    item.lastProblems = lastProblems ?? [];
    return item;
  }

  gen.template = template;
  gen.version = version;
  gen.needs = meta.needs.slice();
  gen.skills = meta.skills.slice();
  gen.tier = meta.tier;
  gen.par = meta.par;
  gen.module = meta.module;
  gen.sheet = meta.sheet;
  /** the fixed exemplar as a full item (the fallback path, and a fixture for tests) */
  gen.exemplar = () => {
    const draft = typeof options.exemplar === 'function' ? options.exemplar(api) : null;
    const item = finish(draft, `${template}#000000`, 0, 'exemplar', {}, { fallback: true });
    if (!item) throw new Error(`${template}: no exemplar`);
    return item;
  };
  /** validate + solver-check + grader round-trip an item (tests and the integrator use this) */
  gen.check = (item) => {
    const problems = validateItem(item, validateOpts);
    problems.push(...verify(item, api));
    problems.push(...checkAnswers(item));
    return problems;
  };
  return gen;
}

export default makeGen;
