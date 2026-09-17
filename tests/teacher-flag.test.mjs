// teacher-flag.test.mjs — T06f: recompute EVERY fixed answer with the site's own solvers and graders and print
// `FLAG: <id> teacher=… solver=…` on any disagreement (COMPOSED S6 test list, S8 #6f, Global rule 5: teacher
// answers are never changed — a disagreement is a FLAG in tests and a ⚑ chip in the UI).
//
//   · word problems (wp-01..16) from their canonical equation — poly.js solves it, the asks chain is walked,
//     every distractor / field / ratio / root is recomputed, and the finals are compared with SOURCE §3's
//     parenthesised teacher answers (parsed from content/SOURCE.md, never re-typed)
//   · diagram + algebra cards (ang-02..11, doc-05..07) from the figure expressions / setup canonicals (poly.js
//     exact rationals): roots, keep/reject by the sign of every measure, case rows, halves, verdicts, the doc-07
//     system; compared with the stored (teacher) values and with SOURCE §1/§2 re-typed as an oracle
//   · factorings (fac-01..18) by expansion: the key expands to the target, the target equals the stem and the
//     SOURCE §6 trinomial, the key text equals SOURCE's key, and the key is COMPLETELY factored
//   · named quadratics (quad-01..03): every root is an exact root of the stem equation, the root set equals
//     solveQuadratic's, and the related angle card carries the same roots
//   · ASN letters (asn-01..36, qz-01..18, bonus-01..33) vs SOURCE §4/§5 (parsed), fact-* vs the §0 facts
//   · M1: cls-* buckets via classifyMeasure, not-* symbols via the notation canon + the F1 model, voc-*/def-*
//     definitions verbatim from SOURCE §0, voc-* answers vs data/vocab.js
// Lifted from notes/check-wp.mjs (T06c) and notes/verify-t06b.mjs (T06b) — the helpers are theirs, verbatim where
// possible, so the recomputation is the one the content authors already ran.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cards, byId } from '../site/data/cards.js';
import { wpCards } from '../site/data/cards/wp.js';
import { facCards, quadCards } from '../site/data/cards/fac.js';
import { asnCards, qzCards, bonusCards } from '../site/data/cards/asn.js';
import { vocab, vocabById } from '../site/data/vocab.js';
import { getFigure } from '../site/data/figures.js';
import * as P from '../site/js/grader/poly.js';
import * as N from '../site/js/grader/normalize.js';
import * as M from '../site/js/figure/model.js';
import * as STRIP from '../site/js/grader/strip.js';
import * as PAIRS from '../site/js/grader/pairs.js';
import { canon as notationCanon, same as notationSame } from '../site/js/grader/notation.js';
import { classifyMeasure } from '../site/js/grader/classify.js';
import { stripMarkup } from '../site/js/mathfmt.js';
import { ROOT } from './_helpers.mjs';   // T17

const SOURCE = readFileSync(join(ROOT, 'content', 'SOURCE.md'), 'utf8');
const section = (from, to) => SOURCE.slice(SOURCE.indexOf(from), to ? SOURCE.indexOf(to) : undefined);

// ---------------------------------------------------------------------------------------------
// FLAG collector — every test prints its lines and fails if any were raised
const flags = [];
const FLAG = (id, what, teacher, solver) => {
  const line = `FLAG: ${id}${what ? ' ' + what : ''} teacher=${teacher} solver=${solver}`;
  flags.push(line);
  console.log(line);
};
const takeFlags = () => flags.splice(0);
const expectFlag = (cond, id, what, teacher, solver) => { if (!cond) FLAG(id, what, teacher, solver); };

// ---------------------------------------------------------------------------------------------
// solver helpers over poly.js / normalize.js (from notes/check-wp.mjs and notes/verify-t06b.mjs)
const R = P.rat;
const numOf = (s) => { const r = N.parseNumber(String(s)); if (!r.ok) throw new Error(`bad number ${s}: ${r.msg}`); return N.toNumber(r.value); };
const ratOf = (s) => N.parseNumber(String(s)).value;                    // Rat | float
const fmt = (v) => (typeof v === 'number' ? String(+v.toFixed(6)) : P.ratToString(v));
const sameNum = (a, b) => N.numEquals(a, b, 1e-9);
const eqv = (a, b) => N.numEquals(a, b, 0.01);
const str = (r) => (typeof r === 'number' ? String(r) : P.ratToString(r));
const poly = (expr, v = 'x') => { const r = P.parsePoly(expr, { var: v }); if (!r.ok) throw new Error(`parsePoly(${expr}): ${r.err} ${r.msg}`); return r.poly; };
const ratfun = (expr, v = 'x') => { const r = P.parseRational(expr, { var: v }); if (!r.ok) throw new Error(`parseRational(${expr}): ${r.err}`); return r; };
const evalAt = (expr, x, v = 'x') => P.polyEvalRat(poly(expr, v), x);
const rootsOf = (expr, v = 'x') => {
  const rf = ratfun(expr, v);
  const p = rf.num;
  const q = P.solveQuadratic(p);
  if (q.kind === 'two' || q.kind === 'double') return q.roots;
  if (q.kind === 'linear') return [P.solveLinear(p)];
  throw new Error(`no roots for ${expr}: ${q.kind}`);
};
const sameSet = (got, want) => got.length === want.length && want.every((w) => got.some((g) => eqv(g, w)));

/** roots of LHS − RHS = 0 for a canonical string (or "LHS = RHS" text) → number[] (sorted), or null if unsolvable */
function solveCanonical(text) {
  const sides = String(text).split('=');
  if (sides.length > 2) throw new Error(`too many = in ${text}`);
  const parse = (s) => { const r = P.parseRational(s, { var: 'x' }); if (!r.ok) throw new Error(`${s}: ${r.err} ${r.msg}`); return r; };
  let rf = parse(sides[0]);
  if (sides.length === 2) rf = P.ratFunSub(rf, parse(sides[1]));
  const n = rf.num;
  const deg = P.polyDegree(n);
  if (deg === 1) return [P.ratToNumber(P.solveLinear(n))];
  if (deg === 2) { const s = P.solveQuadratic(n); return s.roots.map((r) => (typeof r === 'number' ? r : P.ratToNumber(r))).sort((a, b) => a - b); }
  return null;
}
// What the two angles of the pair are, in terms of the canonical's x (for smaller / larger) — T06c's table.
const PAIR = { 'wp-04': 'comp', 'wp-05': 'supp', 'wp-06': 'comp', 'wp-08': 'supp', 'wp-09': 'comp', 'wp-12': 'roots' };
function derive(id, roots) {
  const x = roots[0];
  const q = { angle: x, comp: 90 - x, supp: 180 - x };
  const pair = PAIR[id];
  if (pair === 'comp') [q.smaller, q.larger] = [Math.min(x, 90 - x), Math.max(x, 90 - x)];
  else if (pair === 'supp') [q.smaller, q.larger] = [Math.min(x, 180 - x), Math.max(x, 180 - x)];
  else if (pair === 'roots') [q.smaller, q.larger] = [Math.min(...roots), Math.max(...roots)];
  return q;
}
function chain(q, asks) {
  let v = q[asks[0]];
  if (v === undefined) throw new Error(`asks[0] "${asks[0]}" not derivable`);
  for (const step of asks.slice(1)) {
    if (step === 'comp') v = 90 - v;
    else if (step === 'supp') v = 180 - v;
    else throw new Error(`unknown chain step ${step}`);
  }
  return v;
}
const reduceRatio = (a, b) => { const g = N.gcd(a, b); return `${a / g}:${b / g}`; };

// =====================================================================================
// §3 word problems — from the canonical equation, vs SOURCE §3's parenthesised teacher answers
// =====================================================================================

// The x the teacher's key reaches (SOURCE §3 brackets / the key pages) — check-wp.mjs' table.
const TEACHER_X = {
  'wp-01': ['17'], 'wp-02': ['52'], 'wp-03': ['12'], 'wp-04': ['62'], 'wp-05': ['75'], 'wp-06': ['26'],
  'wp-07': ['21.5'], 'wp-08': ['86.5'], 'wp-09': ['33'], 'wp-10': ['54'], 'wp-11': ['54'], 'wp-12': ['86', '4'],
  'wp-13': ['37'], 'wp-14': ['44'], 'wp-15': ['28'], 'wp-16': ['14'],
};

test('teacher-flag: wp-01..16 — every answer, field, distractor, root and ratio recomputed from the canonical equation; finals vs SOURCE §3', () => {
  const s3 = section('## 3.', '## 4.');
  const teacher = {};
  for (const m of s3.matchAll(/^(\d+)\. (.+?) \(([^()]+)\)(?:\s+\[.*\])?\s*$/gm)) teacher[`wp-${m[1].padStart(2, '0')}`] = m[3].split(/,\s*/).map((s) => s.replace(/°/g, '').trim());
  assert.equal(Object.keys(teacher).length, 16, 'SOURCE §3 parses to 16 teacher answers');
  assert.equal(wpCards.length, 16);
  for (const c of wpCards) {
    const id = c.id;
    const setup = c.parts[0];
    assert.equal(setup.type, 'equation', `${id}: parts[0] is the equation`);
    let roots;
    try { roots = solveCanonical(setup.canonical); } catch (e) { FLAG(id, 'canonical', setup.canonical, `does not parse: ${e.message}`); continue; }
    if (!roots || !roots.length) { FLAG(id, 'canonical', setup.canonical, 'unsolvable'); continue; }
    const stored = (setup.roots ?? []).map(numOf).sort((a, b) => a - b);
    expectFlag(stored.length === roots.length && stored.every((r, i) => sameNum(r, roots[i])), id, 'x (stored roots)', setup.roots, roots.map(fmt));
    const tx = TEACHER_X[id].map(numOf).sort((a, b) => a - b);
    expectFlag(tx.length === roots.length && tx.every((r, i) => sameNum(r, roots[i])), id, 'x', TEACHER_X[id], roots.map(fmt));
    for (const a of setup.alternates ?? []) {
      let ar;
      try { ar = solveCanonical(a.canonical); } catch (e) { FLAG(id, `alternate ${a.canonical}`, a.roots, `does not parse: ${e.message}`); continue; }
      const st = (a.roots ?? []).map(numOf).sort((x, y) => x - y);
      expectFlag(ar && ar.length === st.length && st.every((r, i) => sameNum(r, ar[i])), id, `alternate ${a.canonical}`, a.roots, ar?.map(fmt));
    }
    const q = derive(id, roots);
    const finals = [];
    for (const p of c.parts.slice(1)) {
      if (p.type === 'num') {
        let v;
        try { v = chain(q, p.asks); } catch (e) { FLAG(id, p.id, p.answer, e.message); continue; }
        expectFlag(sameNum(numOf(p.answer), v), id, `${p.id} via ${JSON.stringify(p.asks)}`, p.answer, fmt(v));
        finals.push(p.answer);
        for (const [k, d] of Object.entries(p.distractors ?? {})) {
          if (q[k] === undefined) { FLAG(id, `${p.id} distractor ${k}`, d, 'not a derivable quantity'); continue; }
          expectFlag(sameNum(numOf(d), q[k]), id, `${p.id} distractor ${k}`, d, fmt(q[k]));
        }
      } else if (p.type === 'multi') {
        const want = p.orderFree ? [q.smaller, q.larger] : p.fields.map((f) => q[f.key]);
        const got = p.fields.map((f) => numOf(f.answer));
        if (p.orderFree) got.sort((a, b) => a - b);
        expectFlag(want.every((w, i) => w !== undefined && sameNum(w, got[i])), id, p.id, p.fields.map((f) => f.answer), want.map((w) => (w === undefined ? '?' : fmt(w))));
        for (const f of p.fields) {
          finals.push(f.answer);
          for (const [k, d] of Object.entries(f.distractors ?? {})) expectFlag(q[k] !== undefined && sameNum(numOf(d), q[k]), id, `${p.id}/${f.key} distractor ${k}`, d, q[k] === undefined ? '?' : fmt(q[k]));
        }
      } else if (p.type === 'ratio') {
        const want = reduceRatio(q.angle, q.comp);
        expectFlag(p.answer === want, id, p.id, p.answer, want);
        finals.push(p.answer);
      } else if (p.type === 'roots') {
        const st = p.answer.map(numOf).sort((a, b) => a - b);
        expectFlag(st.length === roots.length && st.every((r, i) => sameNum(r, roots[i])), id, p.id, p.answer, roots.map(fmt));
        expectFlag(roots.every((r) => r > 0 && 90 - r > 0), id, `${p.id} (every root gives positive angles, no reject stage)`, p.answer, roots.map(fmt));
      } else FLAG(id, p.id, p.type, 'unexpected part type');
    }
    // teacher vs solver on the final answers (multiset; ratios by text, numbers by value)
    const t = teacher[id];
    assert.ok(t, `${id}: SOURCE §3 answer`);
    const eqAns = (a, b) => (a.includes(':') ? a === b : sameNum(numOf(a), numOf(b)));
    const sortedT = t.slice().sort(), sortedM = finals.slice().sort();
    expectFlag(sortedT.length === sortedM.length && sortedT.every((v, i) => eqAns(v, sortedM[i])), id, '', t.join(', '), finals.join(', '));
  }
  assert.deepEqual(takeFlags(), []);
});

// =====================================================================================
// §1 / §2 diagram and algebra cards — from the figure expressions, vs the stored (teacher) values + SOURCE oracle
// =====================================================================================

const setupOf = (c) => c.parts.find((p) => p.type === 'equation');
const partOf = (c, id) => c.parts.find((p) => p.id === id);
const fieldAns = (c, pid, key) => partOf(c, pid).fields.find((f) => f.key === key).answer;

test('teacher-flag: ang-02, 03, 06, 07, 08, 11, doc-06 — linear setups solved exactly; every field / distractor / bonus vs SOURCE §1/§2', () => {
  const ORACLE = { 'ang-02': 30, 'ang-03': 55, 'ang-06': 60, 'ang-07': 20, 'ang-08': 30, 'ang-11': 42, 'doc-06': 60 };   // the teacher's x (SOURCE)
  for (const [id, tx] of Object.entries(ORACLE)) {
    const c = byId[id];
    const x = rootsOf(setupOf(c).canonical)[0];
    expectFlag(eqv(x, R(tx)), id, 'x', tx, str(x));
    for (const a of setupOf(c).alternates ?? []) {
      const alt = typeof a === 'string' ? a : a.canonical;
      let ar; try { ar = rootsOf(alt); } catch (e) { FLAG(id, `alternate ${alt}`, '(parses)', e.message); continue; }
      expectFlag(ar.length === 1, id, `alternate ${alt}`, '1 root', ar.map(str));
    }
  }
  { const c = byId['ang-02']; const x = rootsOf(setupOf(c).canonical)[0];
    const want = [x, P.ratMul(x, R(2))];
    expectFlag(sameSet(partOf(c, 'm').fields.map((f) => ratOf(f.answer)), want), 'ang-02', 'm', partOf(c, 'm').fields.map((f) => f.answer), want.map(str));
    expectFlag(sameSet(want, [R(30), R(60)]), 'ang-02', '(SOURCE)', '30, 60', want.map(str)); }
  { const c = byId['ang-03']; const x = rootsOf(setupOf(c).canonical)[0]; const larger = P.ratAdd(x, R(70)); const p = partOf(c, 'larger');
    expectFlag(eqv(ratOf(p.answer), larger), 'ang-03', 'larger', p.answer, str(larger));
    expectFlag(eqv(larger, R(125)), 'ang-03', '(SOURCE)', 125, str(larger));
    expectFlag(eqv(ratOf(p.distractors.smaller), x), 'ang-03', 'distractor smaller', p.distractors.smaller, str(x)); }
  { const c = byId['ang-06']; const x = rootsOf(setupOf(c).canonical)[0];
    for (const [k, v] of [['angle', x], ['comp', P.ratSub(R(90), x)], ['supp', P.ratSub(R(180), x)]]) expectFlag(eqv(ratOf(fieldAns(c, 'm', k)), v), 'ang-06', k, fieldAns(c, 'm', k), str(v));
    expectFlag(partOf(c, 'm').fields.filter((f) => !f.bonus).length === 1, 'ang-06', 'required fields', 'angle only (print asks only the angle)', partOf(c, 'm').fields.filter((f) => !f.bonus).map((f) => f.key)); }
  { const c = byId['ang-07']; const x = rootsOf(setupOf(c).canonical)[0]; const want = [P.ratMul(x, R(7)), P.ratMul(x, R(2))];
    expectFlag(sameSet(partOf(c, 'm').fields.map((f) => ratOf(f.answer)), want), 'ang-07', 'm', partOf(c, 'm').fields.map((f) => f.answer), want.map(str));
    expectFlag(sameSet(want, [R(140), R(40)]), 'ang-07', '(SOURCE)', '140, 40', want.map(str)); }
  { const c = byId['ang-08']; const x = rootsOf(setupOf(c).canonical)[0]; const p = partOf(c, 'supp'); const supp = P.ratSub(R(180), x);
    expectFlag(eqv(ratOf(p.answer), supp), 'ang-08', 'supp', p.answer, str(supp));
    expectFlag(eqv(supp, R(150)), 'ang-08', '(SOURCE)', 150, str(supp));
    for (const [k, v] of [['angle', x], ['comp', P.ratSub(R(90), x)], ['supp', supp]]) expectFlag(eqv(ratOf(p.distractors[k]), v), 'ang-08', `distractor ${k}`, p.distractors[k], str(v));
    expectFlag(P.ratEq(P.ratDiv(supp, P.ratSub(R(90), x)), R(5, 2)), 'ang-08', 'ratio supp:comp', '5:2', `${str(supp)}:${str(P.ratSub(R(90), x))}`); }
  { const c = byId['ang-11']; const x = rootsOf(setupOf(c).canonical)[0]; const p = partOf(c, 'angle');
    expectFlag(eqv(ratOf(p.answer), x), 'ang-11', 'angle', p.answer, str(x));
    for (const [k, v] of [['comp', P.ratSub(R(90), x)], ['supp', P.ratSub(R(180), x)]]) {
      expectFlag(eqv(ratOf(p.distractors[k]), v), 'ang-11', `distractor ${k}`, p.distractors[k], str(v));
      const b = p.bonus.find((x) => x.key === k);
      expectFlag(b && eqv(ratOf(b.answer), v), 'ang-11', `bonus ${k}`, b?.answer, str(v));
    }
    expectFlag(eqv(P.ratSub(R(90), x), R(48)) && eqv(P.ratSub(R(180), x), R(138)), 'ang-11', '(SOURCE comp, supp)', '48, 138', `${str(P.ratSub(R(90), x))}, ${str(P.ratSub(R(180), x))}`); }
  { const c = byId['doc-06']; const x = rootsOf(setupOf(c).canonical)[0];
    for (const [k, v] of [['angle', x], ['supp', P.ratSub(R(180), x)], ['comp', P.ratSub(R(90), x)]]) expectFlag(eqv(ratOf(fieldAns(c, 'm', k)), v), 'doc-06', k, fieldAns(c, 'm', k), str(v)); }
  assert.deepEqual(takeFlags(), []);
});

test('teacher-flag: ang-04 (F2 midpoints), ang-09 (13:4 product), wp-12 — quadratic setups, keep/reject by the sign of every measure', () => {
  { // ang-04: CB = 3m + 4, BA = n − 1, DE = m² − 6, AE = 8; B, D midpoints ⇒ CB = BA = CD = DE
    const c = byId['ang-04'];
    const fig = getFigure('F2');
    const lab = Object.fromEntries(fig.labels.map((l) => [l.seg.join(''), l.text]));
    const CBexpr = lab.CB, DEexpr = lab.DE, AE = ratOf(lab.AE);
    const roots = rootsOf(`(${DEexpr})-(${CBexpr})`, 'm');
    expectFlag(sameSet(roots, partOf(c, 'm').answer.map(ratOf)), 'ang-04', 'roots', partOf(c, 'm').answer, roots.map(str));
    expectFlag(sameSet(roots, [R(5), R(-2)]), 'ang-04', 'roots (SOURCE)', '5, −2', roots.map(str));
    const keep = roots.filter((r) => P.ratSign(evalAt(CBexpr, r, 'm')) > 0 && P.ratSign(evalAt(DEexpr, r, 'm')) > 0);
    const rej = roots.filter((r) => !keep.includes(r));
    expectFlag(sameSet(keep, partOf(c, 'keep').valid.map(ratOf)), 'ang-04', 'keep', partOf(c, 'keep').valid, keep.map(str));
    expectFlag(sameSet(rej, partOf(c, 'keep').rejected.map(ratOf)), 'ang-04', 'reject', partOf(c, 'keep').rejected, rej.map(str));
    expectFlag(partOf(c, 'keep').reasonKey === 'negative-length', 'ang-04', 'reject reason', 'negative side length', partOf(c, 'keep').reasonKey);
    const CB = evalAt(CBexpr, keep[0], 'm');
    const n = P.ratAdd(CB, R(1));                                // n − 1 = CB
    const perimeter = P.ratAdd(P.ratMul(CB, R(4)), AE);          // AC = CE = 2·CB, plus AE
    expectFlag(eqv(ratOf(fieldAns(c, 'rest', 'n')), n), 'ang-04', 'n', fieldAns(c, 'rest', 'n'), str(n));
    expectFlag(eqv(ratOf(fieldAns(c, 'rest', 'P')), perimeter), 'ang-04', 'perimeter', fieldAns(c, 'rest', 'P'), str(perimeter));
    expectFlag(eqv(CB, R(19)) && eqv(n, R(20)) && eqv(perimeter, R(84)), 'ang-04', '(SOURCE CB, n, P)', '19, 20, 84', `${str(CB)}, ${str(n)}, ${str(perimeter)}`);
  }
  { // ang-09: x(180 − x) : x(90 − x) = 13 : 4
    const c = byId['ang-09'];
    const roots = rootsOf(setupOf(c).canonical);
    expectFlag(sameSet(roots, partOf(c, 'x').answer.map(ratOf)), 'ang-09', 'roots', partOf(c, 'x').answer, roots.map(str));
    expectFlag(sameSet(roots, [R(50), R(0)]), 'ang-09', 'roots (SOURCE)', '50, 0', roots.map(str));
    const keep = roots.filter((r) => P.ratSign(r) > 0 && P.ratCmp(r, R(90)) < 0);
    const rej = roots.filter((r) => !keep.includes(r));
    expectFlag(sameSet(keep, partOf(c, 'keep').valid.map(ratOf)) && sameSet(rej, partOf(c, 'keep').rejected.map(ratOf)), 'ang-09', 'keep/reject', `${partOf(c, 'keep').valid} / ${partOf(c, 'keep').rejected}`, `${keep.map(str)} / ${rej.map(str)}`);
    expectFlag(partOf(c, 'keep').reasonKey === 'zero-angle' && rej.length === 1 && P.ratIsZero(rej[0]), 'ang-09', 'reject reason', 'zero angle', partOf(c, 'keep').reasonKey);
    const x = keep[0];
    expectFlag(P.ratEq(P.ratDiv(P.ratMul(x, P.ratSub(R(180), x)), P.ratMul(x, P.ratSub(R(90), x))), R(13, 4)), 'ang-09', 'ratio', '13:4', str(P.ratDiv(P.ratMul(x, P.ratSub(R(180), x)), P.ratMul(x, P.ratSub(R(90), x)))));
    const p = partOf(c, 'angle');
    expectFlag(eqv(ratOf(p.answer), x), 'ang-09', 'angle', p.answer, str(x));
    for (const [k, v] of [['comp', P.ratSub(R(90), x)], ['supp', P.ratSub(R(180), x)]]) {
      expectFlag(eqv(ratOf(p.distractors[k]), v), 'ang-09', `distractor ${k}`, p.distractors[k], str(v));
      const b = p.bonus.find((y) => y.key === k);
      expectFlag(b && eqv(ratOf(b.answer), v), 'ang-09', `bonus ${k}`, b?.answer, str(v));
    }
  }
  { // wp-12 (product 344): both roots valid, supplement of the smaller
    const c = byId['wp-12'];
    const roots = rootsOf(setupOf(c).canonical);
    expectFlag(sameSet(roots, [R(86), R(4)]), 'wp-12', 'roots (SOURCE)', '86, 4', roots.map(str));
    expectFlag(sameSet(roots, partOf(c, 'x').answer.map(ratOf)), 'wp-12', 'roots', partOf(c, 'x').answer, roots.map(str));
    const smaller = roots.reduce((a, b) => (P.ratCmp(a, b) <= 0 ? a : b));
    expectFlag(eqv(ratOf(partOf(c, 'answer').answer), P.ratSub(R(180), smaller)), 'wp-12', 'supp of smaller', partOf(c, 'answer').answer, str(P.ratSub(R(180), smaller)));
  }
  assert.deepEqual(takeFlags(), []);
});

test('teacher-flag: ang-05 (AH bisector, two cases) and doc-05 (D5 bisector) — halves, verdicts and the strip from the figure expressions', () => {
  { // ang-05: m∠MAH = x² + 3, m∠HAC = 11 − 7x, m∠MAC = 6 − 16x
    const c = byId['ang-05'];
    const lab = Object.fromEntries((c.figure.labels ?? []).map((l) => [l.angle.join(''), l.text]));
    const MAHexpr = lab.MH ?? 'x^2+3', HACexpr = lab.HC ?? '11-7x';
    const roots = rootsOf(`(${MAHexpr})+(${HACexpr})-(6-16x)`);
    expectFlag(sameSet(roots, rootsOf(setupOf(c).canonical)), 'ang-05', 'setup canonical roots', rootsOf(setupOf(c).canonical).map(str), roots.map(str));
    expectFlag(sameSet(roots, partOf(c, 'x').answer.map(ratOf)), 'ang-05', 'roots', partOf(c, 'x').answer, roots.map(str));
    expectFlag(sameSet(roots, [R(-8), R(-1)]), 'ang-05', 'roots (SOURCE)', '−8, −1', roots.map(str));
    const rows = partOf(c, 'cases').rows;
    const ORACLE = { '-8': ['67', '67', 'YES'], '-1': ['4', '18', 'NO'] };
    for (const r of roots) {
      const MAH = evalAt(MAHexpr, r), HAC = evalAt(HACexpr, r), MAC = evalAt('6-16x', r);
      expectFlag(P.ratEq(P.ratAdd(MAH, HAC), MAC), 'ang-05', `x=${str(r)} halves add to the whole`, str(MAC), `${str(MAH)} + ${str(HAC)}`);
      expectFlag(P.ratSign(MAH) > 0 && P.ratSign(HAC) > 0, 'ang-05', `x=${str(r)} positive measures`, 'positive', `${str(MAH)}, ${str(HAC)}`);
      const row = rows.find((w) => eqv(ratOf(w.x), r));
      if (!row) { FLAG('ang-05', `row x=${str(r)}`, 'present', 'missing'); continue; }
      expectFlag(eqv(ratOf(row.MAH), MAH) && eqv(ratOf(row.HAC), HAC), 'ang-05', `row x=${str(r)}`, `${row.MAH}, ${row.HAC}`, `${str(MAH)}, ${str(HAC)}`);
      const verdict = P.ratEq(MAH, HAC) ? 'YES' : 'NO';
      expectFlag(row.verdict === verdict, 'ang-05', `verdict x=${str(r)}`, row.verdict, verdict);
      const o = ORACLE[str(r)];
      expectFlag(o && eqv(MAH, ratOf(o[0])) && eqv(HAC, ratOf(o[1])) && verdict === o[2], 'ang-05', `(SOURCE x=${str(r)})`, o?.join(', '), `${str(MAH)}, ${str(HAC)}, ${verdict}`);
    }
    const strip = partOf(c, 'explain');
    expectFlag(STRIP.validate(strip).length === 0, 'ang-05', 'strip.validate', '[]', JSON.stringify(STRIP.validate(strip)));
    expectFlag(/bisects only when x = −8 — both cases stated/.test(STRIP.prose(strip).text), 'ang-05', 'prose conclusion', 'bisects only when x = −8 — both cases stated', STRIP.prose(strip).text);
  }
  { // doc-05: ∠ABD = 5x + 16, ∠DBC = 8x − 23 (D5 labels), whole 11x + 19 (the stem)
    const c = byId['doc-05'];
    const fig = getFigure('D5');
    const lab = Object.fromEntries(fig.labels.map((l) => [l.angle.join(''), l.text]));
    const whole = /11x\s*\+\s*19/.test(stripMarkup(c.stem)) ? '11x+19' : null;
    assert.ok(whole, 'doc-05: the stem states m∠ABC = 11x + 19');
    const x = rootsOf(`(${lab.AD})+(${lab.DC})-(${whole})`)[0];
    expectFlag(eqv(x, R(13)), 'doc-05', 'x (SOURCE)', 13, str(x));
    const strip = partOf(c, 'explain');
    expectFlag(STRIP.validate(strip).length === 0, 'doc-05', 'strip.validate', '[]', JSON.stringify(STRIP.validate(strip)));
    const sx = strip.slots.find((s) => s.id === 'x'), halves = strip.slots.find((s) => s.id === 'halves'), verdict = strip.slots.find((s) => s.id === 'verdict');
    expectFlag(eqv(ratOf(sx.answer), x), 'doc-05', 'x slot', sx.answer, str(x));
    const ABD = evalAt(lab.AD, x), DBC = evalAt(lab.DC, x);
    expectFlag(eqv(ratOf(halves.fields[0].answer), ABD) && eqv(ratOf(halves.fields[1].answer), DBC), 'doc-05', 'halves', halves.fields.map((f) => f.answer), `${str(ABD)}, ${str(DBC)}`);
    expectFlag(eqv(ABD, R(81)) && eqv(DBC, R(81)), 'doc-05', 'halves (SOURCE)', '81, 81', `${str(ABD)}, ${str(DBC)}`);
    expectFlag(verdict.answer === (P.ratEq(ABD, DBC) ? 'YES' : 'NO'), 'doc-05', 'verdict', verdict.answer, P.ratEq(ABD, DBC) ? 'YES' : 'NO');
    const chips = strip.slots.find((s) => s.id === 'why').chips;
    expectFlag(chips.filter((ch) => ch.role === 'required').length === 1, 'doc-05', 'required chips', 1, chips.filter((ch) => ch.role === 'required').length);
    expectFlag(/x = 13, so m∠ABD = 81° = m∠DBC/.test(STRIP.prose(strip).text), 'doc-05', 'prose', 'x = 13, so m∠ABD = 81° = m∠DBC', STRIP.prose(strip).text);
  }
  assert.deepEqual(takeFlags(), []);
});

test('teacher-flag: ang-10 (F1 crossing lines) and doc-07 (D7 system) — from the figure labels; both ang-10 roots kept', () => {
  { // ang-10: ∠BFC = −x + 84, ∠AFE = 2x² − 4x + 3 = ∠CFD (vertical), ∠BFC + ∠CFD = 90, ∠DFE = 180 − ∠CFD
    const c = byId['ang-10'];
    const lab = Object.fromEntries(c.figure.labels.map((l) => [l.angle.join(''), l.text]));
    const BFC = lab.BC, AFE = lab.AE;
    assert.ok(BFC && AFE, 'ang-10 figure labels present');
    const roots = rootsOf(`(${BFC})+(${AFE})-90`);
    expectFlag(sameSet(roots, partOf(c, 'x').answer.map(ratOf)), 'ang-10', 'roots', partOf(c, 'x').answer, roots.map(str));
    expectFlag(sameSet(roots, [R(3), R(-1, 2)]), 'ang-10', 'roots (SOURCE)', '3, −1/2', roots.map(str));
    expectFlag(sameSet(rootsOf(setupOf(c).canonical), roots), 'ang-10', 'setup canonical roots', rootsOf(setupOf(c).canonical).map(str), roots.map(str));
    const rows = partOf(c, 'cases').rows;
    const ORACLE = { '3': ['9', '171'], '-1/2': ['5.5', '174.5'] };
    const keep = [];
    for (const r of roots) {
      const CFD = evalAt(AFE, r), DFE = P.ratSub(R(180), CFD), bfc = evalAt(BFC, r);
      if (P.ratSign(CFD) > 0 && P.ratSign(bfc) > 0 && P.ratSign(DFE) > 0) keep.push(r);
      const row = rows.find((w) => eqv(ratOf(w.x), r));
      if (!row) { FLAG('ang-10', `row x=${str(r)}`, 'present', 'missing'); continue; }
      expectFlag(eqv(ratOf(row.CFD), CFD) && eqv(ratOf(row.DFE), DFE), 'ang-10', `row x=${str(r)}`, `${row.CFD}, ${row.DFE}`, `${str(CFD)}, ${str(DFE)}`);
      const o = ORACLE[str(r)];
      expectFlag(o && eqv(CFD, ratOf(o[0])) && eqv(DFE, ratOf(o[1])), 'ang-10', `(SOURCE x=${str(r)})`, o?.join(', '), `${str(CFD)}, ${str(DFE)}`);
    }
    expectFlag(keep.length === 2, 'ang-10', 'both roots give positive measures', 'keep both', keep.map(str));
    expectFlag(sameSet(keep, partOf(c, 'keep').valid.map(ratOf)) && partOf(c, 'keep').rejected.length === 0, 'ang-10', 'keep', partOf(c, 'keep').valid, keep.map(str));
    expectFlag(partOf(c, 'keep').reasonKey === 'both-valid', 'ang-10', 'reason', 'both give positive angle measures', partOf(c, 'keep').reasonKey);
    expectFlag(partOf(c, 'keep').distractors.includes('−1/2 is negative so reject it'), 'ang-10', 'S3 distractor', '−1/2 is negative so reject it', partOf(c, 'keep').distractors);
    // the figure itself: ∠AFE and ∠CFD are vertical, ∠BFC + ∠CFD span the right angle ∠BFD
    const m = M.resolve(getFigure('F1'), c.figure);
    expectFlag(M.isPair(m, 'AFE', 'CFD', 'vertical'), 'ang-10', 'AFE/CFD vertical', 'vertical', JSON.stringify(M.relate(m, 'AFE', 'CFD')));
    expectFlag(M.isPair(m, 'BFC', 'CFD', 'complementary') && M.isPair(m, 'BFC', 'CFD', 'adjacent'), 'ang-10', 'BFC+CFD', 'adjacent complementary (∠BFD = 90°)', JSON.stringify(M.relate(m, 'BFC', 'CFD')));
  }
  { // doc-07: vertical UL = LR, linear pair UL + UR = 180, from the D7 labels
    const c = byId['doc-07'];
    const fig = getFigure('D7');
    const lab = Object.fromEntries(fig.labels.map((l) => [l.angle.join(''), l.text]));
    const UL = lab.LQ, UR = lab.QR, LR = lab.RS;
    assert.ok(UL && UR && LR, 'D7 labels');
    const Z = R(0);
    const e1 = P.parseLinear(`${UL}-(${LR})`), e2 = P.parseLinear(`(${UL})+(${UR})-180`);
    assert.ok(e1.ok && e2.ok, 'doc-07 linear parse');
    const a1 = e1.coef.x ?? Z, b1 = e1.coef.y ?? Z, k1 = P.ratNeg(e1.k), a2 = e2.coef.x ?? Z, b2 = e2.coef.y ?? Z, k2 = P.ratNeg(e2.k);
    const det = P.ratSub(P.ratMul(a1, b2), P.ratMul(a2, b1));
    expectFlag(!P.ratIsZero(det), 'doc-07', 'det', '≠ 0', str(det));
    const x = P.ratDiv(P.ratSub(P.ratMul(k1, b2), P.ratMul(k2, b1)), det);
    const y = P.ratDiv(P.ratSub(P.ratMul(a1, k2), P.ratMul(a2, k1)), det);
    expectFlag(eqv(x, R(-10)) && eqv(y, R(45)), 'doc-07', 'x, y (SOURCE)', '−10, 45', `${str(x)}, ${str(y)}`);
    const at = (expr) => { const l = P.parseLinear(expr); return P.ratAdd(P.ratAdd(P.ratMul(l.coef.x ?? Z, x), P.ratMul(l.coef.y ?? Z, y)), l.k); };
    const vUL = at(UL), vUR = at(UR), vLR = at(LR), vLL = vUR;
    expectFlag(P.ratEq(vUL, vLR) && P.ratEq(P.ratAdd(vUL, vUR), R(180)), 'doc-07', 'geometry', 'UL = LR, UL + UR = 180', `${str(vUL)}, ${str(vUR)}, ${str(vLR)}`);
    const want = { x, y, UL: vUL, UR: vUR, LR: vLR, LL: vLL };
    for (const [k, v] of Object.entries(want)) expectFlag(eqv(ratOf(fieldAns(c, 'all', k)), v), 'doc-07', k, fieldAns(c, 'all', k), str(v));
    expectFlag(eqv(vUL, R(15)) && eqv(vUR, R(165)) && eqv(vLR, R(15)) && eqv(vLL, R(165)), 'doc-07', 'angles (SOURCE)', '15, 165, 15, 165', `${str(vUL)}, ${str(vUR)}, ${str(vLR)}, ${str(vLL)}`);
    for (const s of setupOf(c).system) expectFlag(P.parseLinear(s, { vars: ['x', 'y'] }).ok, 'doc-07', `system "${s}"`, 'parses', 'does not parse');
  }
  assert.deepEqual(takeFlags(), []);
});

test('teacher-flag: ang-wu-1..5 — the teacher\'s warm-up pairs are structurally valid on the F1 model and accepted by the pairs grader', () => {
  for (const c of cards.filter((x) => /^ang-wu-/.test(x.id))) {
    const part = c.parts[0];
    const model = M.resolve(getFigure('F1'), c.figure);
    const canon = (n) => M.angleName(n[1], n[0], n[2]);   // ∠GFC ≡ ∠CFG — the model keys angles by sorted outer letters
    for (const [a, b] of c.teacherPairs) expectFlag(M.isPair(model, canon(a), canon(b), part.relation), c.id, `${a}+${b}`, part.relation, JSON.stringify(M.relate(model, canon(a), canon(b))));
    const r = PAIRS.grade(part, c.teacherPairs.map((p) => p.map((n) => '∠' + n)), { figure: c.figure });
    expectFlag(r.ok && r.kind === 'correct', c.id, 'teacherPairs through the grader', 'correct', `${r.kind}: ${r.msg}`);
    expectFlag(M.pairs(model, part.relation).length >= part.count, c.id, `${part.relation} pairs available`, `≥ ${part.count}`, M.pairs(model, part.relation).length);
  }
  assert.deepEqual(takeFlags(), []);
});

// =====================================================================================
// §6 factorings by expansion, §7 named quadratics by substitution
// =====================================================================================

test('teacher-flag: fac-01..18 — every Kuta key expands to its target, equals the stem and SOURCE §6, and is completely factored', () => {
  const s6 = section('## 6.', '## 7.');
  const oracle = {};
  for (const m of s6.matchAll(/^(\d+)\) (.+?) = (.+)$/gm)) oracle[`fac-${m[1].padStart(2, '0')}`] = { trinomial: m[2].trim(), key: m[3].trim() };
  assert.equal(Object.keys(oracle).length, 18, 'SOURCE §6 parses to 18 keys');
  assert.equal(facCards.length, 18);
  const tidy = (s) => s.replace(/\s+/g, ' ').trim();
  for (const c of facCards) {
    const p = c.parts[0];
    const v = p.var;
    const o = oracle[c.id];
    assert.ok(o, `${c.id}: SOURCE §6 line`);
    const target = poly(p.target, v);
    let expanded; try { expanded = poly(p.answer, v); } catch (e) { FLAG(c.id, 'key', p.answer, `does not parse: ${e.message}`); continue; }
    expectFlag(P.polyEquals(expanded, target), c.id, 'key expands to target', P.formatPoly(target, v), P.formatPoly(expanded, v));
    expectFlag(P.polyEquals(poly(o.trinomial, v), target), c.id, 'target vs SOURCE trinomial', o.trinomial, P.formatPoly(target, v));
    expectFlag(P.polyEquals(poly(o.key, v), target), c.id, 'SOURCE key expands to target', o.key, P.formatPoly(poly(o.key, v), v));
    expectFlag(tidy(p.answer) === tidy(o.key), c.id, 'key text', o.key, p.answer);
    const stemPoly = stripMarkup(c.stem).replace(/^Factor each completely\.\s*/, '');
    expectFlag(P.polyEquals(poly(stemPoly, v), target), c.id, 'stem polynomial', stemPoly, P.formatPoly(target, v));
    // completely factored: two primitive linear factors, an integer constant, no reducible factor
    const fs = P.factorStructure(p.answer, { var: v });
    expectFlag(fs.ok && fs.topLevel === 'product', c.id, 'key is a product', 'product', fs.ok ? fs.topLevel : fs.err);
    if (fs.ok) {
      expectFlag(fs.nonConstantCount === 2 && fs.factors.every((f) => f.degree === 1 && f.integer && f.contentInt === 1 && !f.reducible), c.id, 'completely factored', 'two primitive linear factors', fs.factors.map((f) => `${f.text} (deg ${f.degree}, content ${f.contentInt})`).join(' · '));
      expectFlag(P.ratIsInt(fs.constant), c.id, 'constant factor', 'integer', str(fs.constant));
      const content = P.polyContentInt(target);
      expectFlag(Math.abs(P.ratToNumber(fs.constant)) === content, c.id, 'constant equals the trinomial content', content, str(fs.constant));
      expectFlag(!!c.gcf === (content > 1), c.id, 'gcf flag', content > 1, !!c.gcf);
      expectFlag(!!c.negLead === (P.ratSign(P.polyLead(target)) < 0), c.id, 'negLead flag', P.ratSign(P.polyLead(target)) < 0, !!c.negLead);
    }
  }
  assert.deepEqual(takeFlags(), []);
});

test('teacher-flag: quad-01..03 — each root is an exact root of the stem equation; the root set equals solveQuadratic\'s; the related angle card agrees', () => {
  const ORACLE = { 'quad-01': ['-8', '-1'], 'quad-02': ['3', '-1/2'], 'quad-03': ['5', '-2'] };   // S2 coverage table
  const RELATED = { 'quad-01': ['ang-05', 'x'], 'quad-02': ['ang-10', 'x'], 'quad-03': ['ang-04', 'm'] };
  const s7 = section('## 7.');
  assert.equal(quadCards.length, 3);
  for (const c of quadCards) {
    const p = c.parts[0];
    const v = p.var;
    const eq = stripMarkup(c.stem).replace(/^Solve by factoring:\s*/, '');
    expectFlag(s7.includes(eq), c.id, 'equation named in SOURCE §7', eq, 'not found');
    const sides = eq.split('=');
    assert.equal(sides.length, 2, `${c.id}: equation`);
    const lhs = P.polySub(poly(sides[0], v), poly(sides[1], v));
    const solved = P.solveQuadratic(lhs);
    expectFlag(solved.kind === 'two', c.id, 'two roots', 'two', solved.kind);
    const roots = solved.roots ?? [];
    expectFlag(sameSet(roots, p.answer.map(ratOf)), c.id, 'roots', p.answer, roots.map(str));
    expectFlag(sameSet(roots, ORACLE[c.id].map(ratOf)), c.id, 'roots (S2)', ORACLE[c.id], roots.map(str));
    for (const a of p.answer) expectFlag(P.ratIsZero(P.polyEvalRat(lhs, ratOf(a))), c.id, `substitute ${a}`, '0', str(P.polyEvalRat(lhs, ratOf(a))));
    const [relId, relPart] = RELATED[c.id];
    expectFlag(c.related === relId, c.id, 'related', relId, c.related);
    const rel = byId[relId].parts.find((x) => x.id === relPart && x.type === 'roots');
    expectFlag(rel && sameSet(rel.answer.map(ratOf), roots), c.id, `${relId} roots`, rel?.answer, roots.map(str));
  }
  assert.deepEqual(takeFlags(), []);
});

// =====================================================================================
// §4 / §5 ASN letters vs SOURCE; §0 facts
// =====================================================================================

test('teacher-flag: asn-01..36, qz-01..18, bonus-01..33 letters vs content/SOURCE.md §4/§5; fact-01..05 vs the §0 facts', () => {
  const s4 = [...SOURCE.matchAll(/^(\d+)\. (.+?) — (Always|Sometimes|Never)/gm)].map((m) => m[3][0]);
  const s5 = [...SOURCE.matchAll(/^- (.+?) — ([ASN])\b/gm)].map((m) => m[2]);
  const bonusLine = SOURCE.split('\n').find((l) => l.startsWith('Out-of-scope (bonus'));
  const s5b = bonusLine.replace(/^Out-of-scope \(bonus, triangles\/parallel\/skew\): /, '').replace(/\.$/, '').split(/;\s+/)
    .map((s) => /^(.+?) — ([ASN])$/.exec(s.trim())).filter(Boolean).map((m) => m[2]);
  assert.equal(s4.length, 36); assert.equal(s5.length, 18); assert.equal(s5b.length, 33);
  asnCards.forEach((c, i) => expectFlag(c.parts[0].answer === s4[i], c.id, '', s4[i], c.parts[0].answer));
  qzCards.forEach((c, i) => expectFlag(c.parts[0].answer === s5[i], c.id, '', s5[i], c.parts[0].answer));
  bonusCards.forEach((c, i) => expectFlag(c.parts[0].answer === s5b[i], c.id, '', s5b[i], c.parts[0].answer));
  expectFlag(byId['qz-04'].parts[0].answer === 'S' && /Quizlet says S/.test(byId['qz-04'].parts[0].disputed ?? ''), 'qz-04', '⚑', 'S (disputed, graded S)', `${byId['qz-04'].parts[0].answer} ${byId['qz-04'].parts[0].disputed}`);
  // §0: "two distinct lines intersect in at most one point; two distinct planes intersect in a line; a line and a plane
  // intersect in a point, or the line lies in the plane, or they don't intersect"; "through any two points there is
  // exactly one line"; "through any three non-collinear points there is exactly one plane"
  const FACTS = { 'fact-01': 'A', 'fact-02': 'A', 'fact-03': 'N', 'fact-04': 'A', 'fact-05': 'A' };
  for (const [id, letter] of Object.entries(FACTS)) {
    const p = byId[id].parts.find((x) => x.type === 'asn');
    expectFlag(p && p.answer === letter, id, `"${p?.statement}"`, letter, p?.answer);
  }
  assert.deepEqual(takeFlags(), []);
});

// =====================================================================================
// M1: classifications, notation symbols, definitions
// =====================================================================================

const sec0 = section('## 0.', '## 1.').toLowerCase();

test('teacher-flag: cls-01..04 buckets via classifyMeasure and the F1 model; not-01..09 symbols via the notation canon and the F1 rays', () => {
  const F1 = M.resolve(getFigure('F1'), {});
  const fan = M.fanAt(F1, 'F');
  for (const id of ['cls-01', 'cls-02', 'cls-03', 'cls-04']) {
    const p = byId[id].parts[0];
    expectFlag(classifyMeasure(Number(p.measure)) === p.answer, id, `measure ${p.measure}`, p.answer, classifyMeasure(Number(p.measure)));
    const stem = stripMarkup(byId[id].stem);
    const given = /(\d+)°/.exec(stem);
    if (given) expectFlag(given[1] === String(p.measure), id, 'stem measure', given[1], p.measure);
  }
  expectFlag(M.measure(F1, 'B', 'D') === 90 && M.measure(F1, 'B', 'A') === 90, 'cls-02', '∠BFD on F1', '90', M.measure(F1, 'B', 'D'));
  expectFlag(M.opposite(fan, 'A') === 'D' && M.measure(F1, 'A', 'D') === 180, 'cls-04', 'A-F-D straight', '180', M.measure(F1, 'A', 'D'));
  const EXPECT = {
    'not-03': { kind: 'len', pts: ['F', 'D'] },
    'not-04': { kind: 'ray', pts: ['F', 'B'] },
    'not-05': { kind: 'ray', pts: ['F', M.opposite(fan, 'A')] },   // the ray opposite FA is FD on F1
    'not-06': { kind: 'ang', pts: ['B', 'F', 'C'] },
  };
  for (const [id, want] of Object.entries(EXPECT)) {
    const p = byId[id].parts[0];
    assert.equal(p.type, 'notation', id);
    const c = notationCanon({ kind: p.kind, pts: p.pts });
    expectFlag(!!c && notationSame(c, want), id, '', JSON.stringify(want), JSON.stringify({ kind: p.kind, pts: p.pts }));
    for (const pt of p.pts) expectFlag(M.rayByName(fan, pt) || pt === 'F', id, `point ${pt}`, 'on F1', 'unknown');
  }
  expectFlag(byId['not-04'].parts[0].pts[0] === 'F', 'not-04', 'endpoint first', 'F', byId['not-04'].parts[0].pts[0]);
  expectFlag(byId['not-06'].parts[0].pts[1] === 'F', 'not-06', 'vertex in the middle', 'F', byId['not-06'].parts[0].pts[1]);
  for (const id of ['not-01', 'not-02', 'not-07', 'not-08', 'not-09']) {
    const p = byId[id].parts[0];
    assert.equal(p.type, 'mc', id);
    const texts = p.distractors.map((d) => (typeof d === 'string' ? d : d.text));
    expectFlag(!texts.includes(p.answer) && new Set([p.answer, ...texts]).size === 4, id, 'mc options', '4 distinct, answer not a distractor', JSON.stringify([p.answer, ...texts]));
  }
  assert.deepEqual(takeFlags(), []);
});

test('teacher-flag: voc-01..23 answers vs data/vocab.js, every non-derived definition verbatim from SOURCE §0; def-*/fact-* cloze texts verbatim', () => {
  assert.equal(vocab.length, 23);
  for (let i = 0; i < 23; i++) {
    const id = `voc-${String(i + 1).padStart(2, '0')}`;
    const c = byId[id];
    const v = vocabById[id];
    assert.ok(v, `${id}: vocab entry`);
    const mc = c.parts.find((p) => p.type === 'mc'), term = c.parts.find((p) => p.type === 'term'), tm = c.parts.find((p) => p.type === 'termmatch');
    expectFlag(mc && (mc.answer === v.def || mc.answer === v.ask), id, 'mc answer', v.def, mc?.answer);
    expectFlag(term && term.answers.includes(v.term), id, 'term answer', v.term, term?.answers);
    expectFlag(tm && tm.pairs.some((pr) => pr.term === v.term && (pr.def === v.def || pr.def === v.ask)), id, 'termmatch pair', `${v.term} ↔ ${v.def}`, JSON.stringify(tm?.pairs.find((pr) => pr.term === v.term)));
    if (!v.derived) expectFlag(sec0.includes(v.def.toLowerCase()), id, 'definition verbatim in SOURCE §0', v.def, 'not found');
  }
  for (const c of cards.filter((x) => /^(def|fact)-/.test(x.id))) {
    const p = c.parts.find((x) => x.type === 'cloze');
    assert.ok(p, `${c.id}: cloze part`);
    let filled = p.text;
    for (const b of p.blanks) filled = filled.replace('[_]', b.answers ? b.answers[0] : b.answer);
    const needle = filled.replace(/[.;]$/, '').toLowerCase();
    expectFlag(sec0.includes(needle), c.id, 'cloze verbatim in SOURCE §0', filled, 'not found');
    for (const b of p.blanks) expectFlag(b.options.includes(b.answers ? b.answers[0] : b.answer), c.id, 'cloze answer among its chips', b.answer, JSON.stringify(b.options));
  }
  assert.deepEqual(takeFlags(), []);
});
