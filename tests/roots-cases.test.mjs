// roots-cases.test.mjs — T03: the rootcase chain (roots → reject → cases), COMPOSED S3 + S6 test list:
// set semantics, -1/2 ≡ -0.5, subset / extra, both-order rows for ang-10, ang-05 verdict rows, the reject
// stage incl. both / neither, every token form, the second subset submit is `wrong`, and the "+ another
// case" tab path reveals only on its second miss.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as roots from '../site/js/grader/roots.js';
import * as reject from '../site/js/grader/reject.js';
import * as cases from '../site/js/grader/cases.js';
import { rat } from '../site/js/grader/normalize.js';
import { byId } from '../site/data/cards.js';
import { isKnownTag } from '../site/data/misconceptions.js';

const part = (id, type) => {
  const c = byId[id];
  assert.ok(c, `card ${id} exists`);
  const p = c.parts.find((x) => x.type === type);
  assert.ok(p, `${id} has a ${type} part`);
  return { ...p, misconceptions: c.misconceptions };
};
const ANG10 = () => part('ang-10', 'roots');
const NO_REVEAL = (msg) => {
  assert.ok(!/−1\/2|-1\/2|-0\.5|−0\.5/.test(msg), `must not reveal the missing root: ${msg}`);
};

// =====================================================================================
// roots
// =====================================================================================

test('roots: every S3/S6 token form for ang-10 {3, -1/2} is correct (set semantics, -1/2 ≡ -0.5)', () => {
  const forms = [
    'x=3,x=-1/2', 'x = 3 or x = -½', '{3, -0.5}', '3; -1/2.', '3 -1/2', '3 and -1/2', '(3, -0.5)', '-(1/2), 3',
    'x = 3 or -1/2', '-0.5, 3', '3, −1/2', 'x = −½, x = 3', '3\n-1/2', '[3, -0.5]', '3, -0.50', 'x = 3 x = -1/2', '  3 ,  -1/2  ',
  ];
  for (const f of forms) {
    const r = roots.grade(ANG10(), f);
    assert.equal(r.kind, 'correct', `${JSON.stringify(f)} → ${r.kind}: ${r.msg}`);
    assert.equal(r.ok, true);
    assert.equal(r.credit, 1);
    assert.equal(r.missing, 0);
    assert.deepEqual(r.extras, []);
  }
  // "5 1/2" is ONE mixed number (5.5), never the two roots 5 and 1/2
  const mixed = roots.grade(ANG10(), '5 1/2');
  assert.equal(mixed.values.length, 1);
  assert.deepEqual(mixed.values[0], rat(11, 2));
});

test('roots: duplicates collapse — `x = 3, x = 3` is one root (a subset), not two', () => {
  const r = roots.grade(ANG10(), 'x = 3, x = 3', { state: {} });
  assert.equal(r.values.length, 1);
  assert.equal(r.kind, 'almost');
  assert.equal(r.missing, 1);
});

test('roots: a proper subset is `almost` (free) on the first submit and `wrong` on the second — never naming the missing root', () => {
  const ctx = { state: {} };
  const first = roots.grade(ANG10(), '3', ctx);
  assert.equal(first.kind, 'almost');
  assert.equal(first.ok, false);
  assert.match(first.msg, /second root|another/i);
  assert.deepEqual(first.tags, ['forgot-second-root']);
  NO_REVEAL(first.msg);
  const second = roots.grade(ANG10(), '3', ctx);
  assert.equal(second.kind, 'wrong', 'the second subset submit consumes the attempt');
  assert.equal(second.msg, first.msg, 'same message both times');
  NO_REVEAL(second.msg);
  assert.equal(ctx.state['x:subset'], 2);
  // a different subset still counts as the second submit
  const third = roots.grade(ANG10(), '-1/2', ctx);
  assert.equal(third.kind, 'wrong');
  NO_REVEAL(third.msg);
});

test('roots: strict modes (mock / boss / strict) make a subset `wrong` at once; sandbox never escalates', () => {
  for (const ctx of [{ mock: true, state: {} }, { boss: true, state: {} }, { strict: true, state: {} }]) {
    assert.equal(roots.grade(ANG10(), '3', ctx).kind, 'wrong');
  }
  const sandbox = { sandbox: true, state: {} };
  for (let i = 0; i < 4; i++) assert.equal(roots.grade(ANG10(), '3', sandbox).kind, 'almost');
  // without a state object every submit is a first submit
  assert.equal(roots.grade(ANG10(), '3').kind, 'almost');
  assert.equal(roots.grade(ANG10(), '3').kind, 'almost');
});

test('roots: the card misconception message wins for a subset (ang-10 "3" → forgot-second-root)', () => {
  const r = roots.grade(ANG10(), '3', { state: {} });
  assert.deepEqual(r.tags, ['forgot-second-root']);
  assert.match(r.msg, /second root|another/i);
});

test('roots: an extra value is wrong with the substitution shown ("plug it back in")', () => {
  const r = roots.grade(ANG10(), '3, -1/2, 4');
  assert.equal(r.kind, 'wrong');
  assert.deepEqual(r.tags, ['extra-root']);
  assert.match(r.msg, /4 isn't a solution/);
  assert.match(r.msg, /2\(4\)² − 5\(4\) − 3 = 9, not 0/);
  assert.equal(r.extras.length, 1);
  // quad-01 x² + 9x + 8 — the polynomial is derived from the roots when the part carries none
  const q1 = roots.grade(part('quad-01', 'roots'), '8, -1');
  assert.equal(q1.kind, 'wrong');
  assert.match(q1.msg, /\(8\)² \+ 9\(8\) \+ 8 = 144, not 0/);
  // an explicit polynomial on the part is used verbatim
  const r2 = roots.grade({ id: 'x', var: 'x', answer: ['3', '-1/2'], poly: '2x^2-5x-3' }, '1');
  assert.match(r2.msg, /2\(1\)² − 5\(1\) − 3 = −6, not 0/);
});

test('roots: a card misconception matches an extra value (ang-10 "1/2" → sign-flip with the card line)', () => {
  const r = roots.grade(ANG10(), '3, 1/2');
  assert.equal(r.kind, 'wrong');
  assert.deepEqual(r.tags, ['sign-flip']);
  assert.match(r.msg, /2x \+ 1 = 0/);
});

test('roots: a polynomial typed here → "enter the roots, not the polynomial" (malformed, free, typed-polynomial)', () => {
  for (const raw of ['3p^2-2p-5', '2x^2 - 5x - 3 = 0', '(2x+1)(x-3)', 'x']) {
    const r = roots.grade(ANG10(), raw);
    assert.equal(r.kind, 'malformed', raw);
    assert.match(r.msg, /enter the roots, not the polynomial/i);
    assert.deepEqual(r.tags, ['typed-polynomial']);
  }
});

test('roots: empty / unreadable input is malformed (free) with a specific line', () => {
  for (const raw of ['', '   ', null, undefined, [], '{}']) {
    const r = roots.grade(ANG10(), raw);
    assert.equal(r.kind, 'malformed', JSON.stringify(raw));
    assert.equal(r.err, 'empty');
  }
  const bad = roots.grade(ANG10(), '3, 1e3');
  assert.equal(bad.kind, 'malformed');
  assert.match(bad.msg, /scientific/i);
  assert.equal(roots.grade(ANG10(), '3, 1,5').kind, 'wrong', 'commas separate roots: three values, two of them extras');
});

test('roots: typed generator values (numbers, Rats, arrays) grade identically to strings', () => {
  const typed = { id: 'x', var: 'x', answer: [3, rat(-1, 2)] };
  assert.equal(roots.grade(typed, [3, -0.5]).kind, 'correct');
  assert.equal(roots.grade(typed, [rat(3), rat(-1, 2)]).kind, 'correct');
  assert.equal(roots.grade(typed, ['3', '-1/2']).kind, 'correct');
  assert.equal(roots.grade(typed, '3, -1/2').kind, 'correct');
  assert.equal(roots.grade(typed, [3]).kind, 'almost');
  assert.equal(roots.grade(typed, [3, -0.5, 7]).kind, 'wrong');
});

test('roots: the other quadratics of the unit round-trip in every spelling', () => {
  assert.equal(roots.grade(part('quad-01', 'roots'), '-8 -1').kind, 'correct');
  assert.equal(roots.grade(part('quad-01', 'roots'), 'x = -1 or x = -8').kind, 'correct');
  assert.equal(roots.grade(part('quad-02', 'roots'), 'x = 3, x = -1/2').kind, 'correct');
  assert.equal(roots.grade(part('quad-03', 'roots'), 'm = 5 or m = -2').kind, 'correct');
  assert.equal(roots.grade(part('quad-03', 'roots'), '-2, 5').kind, 'correct');
  assert.equal(roots.grade(part('ang-04', 'roots'), 'm = -2, 5').kind, 'correct');
  assert.equal(roots.grade(part('ang-05', 'roots'), '{-8, -1}').kind, 'correct');
  assert.equal(roots.grade(part('ang-09', 'roots'), '50, 0').kind, 'correct');
  assert.equal(roots.grade(part('ang-09', 'roots'), '0 and 50').kind, 'correct');
  assert.equal(roots.grade(part('wp-12', 'roots'), '4, 86').kind, 'correct');
  const only50 = roots.grade(part('ang-09', 'roots'), '50', { state: {} });
  assert.equal(only50.kind, 'almost');
  assert.deepEqual(only50.tags, ['forgot-second-root']);
});

test('roots: splitList keeps mixed numbers and constant expressions whole, splits on every separator', () => {
  assert.deepEqual(roots.splitList('x = 3 or x = -½'), ['x = 3', 'x = -½']);
  assert.deepEqual(roots.splitList('{3, -0.5}'), ['3', '-0.5']);
  assert.deepEqual(roots.splitList('3 -1/2'), ['3', '-1/2']);
  assert.deepEqual(roots.splitList('5 1/2'), ['5 1/2']);
  assert.deepEqual(roots.splitList('3 - 1/2'), ['3 - 1/2'], 'spaces around the sign: one constant expression');
  assert.deepEqual(roots.splitList('30 60'), ['30', '60']);
  assert.deepEqual(roots.splitList('3 1/2'), ['3 1/2'], 'a mixed number');
  assert.deepEqual(roots.splitList('3 4.5'), ['3', '4.5']);
  assert.deepEqual(roots.splitList('(3, -0.5)'), ['3', '-0.5']);
  assert.deepEqual(roots.splitList('-(1/2)'), ['-(1/2)']);
  assert.deepEqual(roots.splitList('3 x=-1/2'), ['3', 'x=-1/2']);
  assert.deepEqual(roots.splitList(['3', '-1/2, 4']), ['3', '-1/2', '4']);
});

// =====================================================================================
// reject
// =====================================================================================

test('reject: ang-10 — keep both with "both give positive angle measures" (or the menu\'s both-valid) is correct', () => {
  const p = part('ang-10', 'reject');
  for (const reason of ['both give positive angle measures', 'both valid', 'both-valid', 'Both Valid', { id: 'both-valid' }, { text: 'both give positive angle measures' }]) {
    const r = reject.grade(p, { keep: ['3', '-1/2'], reason });
    assert.equal(r.kind, 'correct', JSON.stringify(reason));
    assert.equal(r.credit, 1);
    assert.equal(r.verdictsOk, true);
    assert.equal(r.reasonOk, true);
  }
  // -1/2 typed as -0.5, the verdicts shape, the per-root array shape
  assert.equal(reject.grade(p, { keep: ['3', '-0.5'], reason: 'both valid' }).kind, 'correct');
  assert.equal(reject.grade(p, { verdicts: { 3: 'keep', '-1/2': 'keep' }, reason: 'both valid' }).kind, 'correct');
  assert.equal(reject.grade(p, [{ root: '3', verdict: 'keep' }, { root: '-1/2', verdict: 'keep', reason: 'both valid' }]).kind, 'correct');
  assert.equal(reject.grade(p, [{ root: 3, keep: true }, { root: -0.5, keep: true }, { reason: 'both-valid' }]).kind, 'correct');
});

test('reject: ang-10 — the distractor "−1/2 is negative so reject it" is a wrong reason; rejecting −1/2 is rejected-valid-root', () => {
  const p = part('ang-10', 'reject');
  const wrongReason = reject.grade(p, { keep: ['3', '-1/2'], reason: '−1/2 is negative so reject it' });
  assert.equal(wrongReason.kind, 'wrong');
  assert.deepEqual(wrongReason.tags, ['wrong-reject-reason']);
  assert.equal(wrongReason.verdictsOk, true);
  assert.equal(wrongReason.credit, 0.5);
  const rejected = reject.grade(p, { keep: ['3'], reject: ['-1/2'], reason: 'negative angle' });
  assert.equal(rejected.kind, 'wrong');
  assert.deepEqual(rejected.tags, ['rejected-valid-root']);
  assert.match(rejected.msg, /not automatically wrong/i, 'the card misconception line');
  assert.equal(rejected.credit, 0);
});

test('reject: ang-04 — keep 5, reject −2 "negative side length"; keeping −2 is kept-invalid-root', () => {
  const p = part('ang-04', 'reject');
  for (const reason of ['negative side length', 'negative length', 'negative-length', 'the length would be negative']) {
    const r = reject.grade(p, { keep: ['5'], reject: ['-2'], reason });
    assert.equal(r.kind, 'correct', reason);
  }
  const kept = reject.grade(p, { keep: ['5', '-2'], reason: 'both values work' });
  assert.equal(kept.kind, 'wrong');
  assert.deepEqual(kept.tags, ['kept-invalid-root']);
  assert.match(kept.msg, /CB = 3\(−2\) \+ 4 = −2/, 'the card misconception line');
  const swapped = reject.grade(p, { keep: ['-2'], reject: ['5'], reason: 'negative length' });
  assert.equal(swapped.kind, 'wrong');
  assert.deepEqual(swapped.tags, ['rejected-valid-root']);
  const wrongReason = reject.grade(p, { keep: ['5'], reject: ['-2'], reason: '−2 does not satisfy the equation' });
  assert.equal(wrongReason.kind, 'wrong');
  assert.deepEqual(wrongReason.tags, ['wrong-reject-reason']);
  const menuReasonWrong = reject.grade(p, { keep: ['5'], reject: ['-2'], reason: 'zero angle' });
  assert.equal(menuReasonWrong.kind, 'wrong');
  assert.deepEqual(menuReasonWrong.tags, ['wrong-reject-reason']);
});

test('reject: ang-09 — reject 0 "zero angle"; "neither" rejects a valid root', () => {
  const p = part('ang-09', 'reject');
  assert.equal(reject.grade(p, { keep: ['50'], reject: ['0'], reason: 'zero angle' }).kind, 'correct');
  assert.equal(reject.grade(p, { keep: ['50'], reject: ['0'], reason: 'zero-angle' }).kind, 'correct');
  const neither = reject.grade(p, { reject: ['50', '0'], reason: 'neither' });
  assert.equal(neither.kind, 'wrong');
  assert.deepEqual(neither.tags, ['rejected-valid-root']);
  const both = reject.grade(p, { keep: ['50', '0'], reason: 'both valid' });
  assert.equal(both.kind, 'wrong');
  assert.deepEqual(both.tags, ['kept-invalid-root']);
  assert.match(both.msg, /0° is not an angle/, 'the card misconception line for "keep 0"');
});

test('reject: both / neither items with no explicit reasonKey derive it from the root lists', () => {
  const bothValid = { id: 'keep', of: 'x', valid: ['2', '7'], rejected: [] };
  assert.equal(reject.expectedReason(bothValid), 'both-valid');
  assert.equal(reject.grade(bothValid, { keep: ['2', '7'], reason: 'both valid' }).kind, 'correct');
  const none = { id: 'keep', of: 'x', valid: [], rejected: ['-3', '-9'] };
  assert.equal(reject.expectedReason(none), 'neither');
  assert.equal(reject.grade(none, { reject: ['-3', '-9'], reason: 'neither' }).kind, 'correct');
  assert.equal(reject.grade(none, { reject: ['-3', '-9'], reason: 'none of them' }).kind, 'correct');
  assert.equal(reject.grade(none, { keep: ['-3'], reject: ['-9'], reason: 'neither' }).kind, 'wrong');
});

test('reject: nothing decided / a root undecided / no reason are malformed (free); ctx.roots limits the stage to the roots found', () => {
  const p = part('ang-10', 'reject');
  assert.equal(reject.grade(p, {}).kind, 'malformed');
  assert.equal(reject.grade(p, null).kind, 'malformed');
  const half = reject.grade(p, { keep: ['3'], reason: 'both valid' });
  assert.equal(half.kind, 'malformed');
  assert.match(half.msg, /x = −1\/2/);
  const noReason = reject.grade(p, { keep: ['3', '-1/2'] });
  assert.equal(noReason.kind, 'malformed');
  assert.equal(noReason.err, 'no-reason');
  assert.match(noReason.msg, /pick the reason/i);
  // the chain advanced with one root found: only that root is decided on
  const found = reject.grade(p, { keep: ['3'], reason: 'both valid' }, { roots: ['3'] });
  assert.equal(found.kind, 'correct');
});

test('reject: menu() lists the item reason, its distractors and the standard seven, deterministically', () => {
  const p = part('ang-10', 'reject');
  const m1 = reject.menu(p).map((x) => x.text);
  const m2 = reject.menu(p).map((x) => x.text);
  assert.deepEqual(m1, m2);
  assert.ok(m1.includes('both give positive angle measures'));
  assert.ok(m1.includes('−1/2 is negative so reject it'), 'the always-present distractor on both-valid items');
  for (const t of ['negative length', 'negative angle', 'angle > 180', 'zero angle', "doesn't satisfy the equation", 'neither']) assert.ok(m1.includes(t), t);
  assert.ok(!m1.includes('both valid'), 'the item wording stands in for the both-valid entry');
  assert.equal(new Set(m1).size, m1.length);
  for (const r of ['negative length', 'Negative Angle', 'angle > 180', 'zero angle', "doesn't satisfy the equation", 'both valid', 'neither']) {
    assert.ok(reject.reasonId(r).id, `menu text "${r}" maps to an id`);
  }
});

// =====================================================================================
// cases
// =====================================================================================

const ANG10C = () => part('ang-10', 'cases');
const ROW3 = { x: '3', CFD: '9', DFE: '171' };
const ROWH = { x: '-1/2', CFD: '5.5', DFE: '174.5' };

test('cases: ang-10 — both rows in either order, any spelling of x, matched by tolerance not by key', () => {
  for (const raw of [[ROW3, ROWH], [ROWH, ROW3], [{ ...ROWH, x: '-0.5' }, ROW3], [{ x: 'x = 3', CFD: '9°', DFE: '171 degrees' }, { x: '−½', CFD: '11/2', DFE: '174.50' }],
    { rows: [ROW3, ROWH] }, { 3: { CFD: '9', DFE: '171' }, '-0.5': { CFD: '5.5', DFE: '174.5' } }]) {
    const r = cases.grade(ANG10C(), raw);
    assert.equal(r.kind, 'correct', JSON.stringify(raw));
    assert.equal(r.credit, 1);
    assert.equal(r.missing, 0);
    assert.equal(r.reveal, null);
  }
});

test('cases: the "+ another case" path — first miss hints without the root, second miss reveals it and counts', () => {
  const ctx = { state: {} };
  const first = cases.grade(ANG10C(), [ROW3], ctx);
  assert.equal(first.kind, 'almost');
  assert.equal(first.ok, false);
  assert.match(first.msg, /another case/i);
  assert.match(first.msg, /second root/i);
  NO_REVEAL(first.msg);
  assert.equal(first.reveal, null);
  assert.equal(first.missing, 1);
  assert.deepEqual(first.tags, ['missing-case']);
  const second = cases.grade(ANG10C(), [ROW3], ctx);
  assert.equal(second.kind, 'wrong', 'the second miss consumes the attempt');
  assert.match(second.msg, /what if x = −1\/2\?/i);
  assert.deepEqual(second.reveal, { x: '−1/2' });
  assert.deepEqual(second.tags, ['missing-case']);
  assert.equal(second.credit, 0.5, 'the found row\'s cells still count');
  // strict: reveal at once; sandbox: never escalates
  const strict = cases.grade(ANG10C(), [ROW3], { mock: true, state: {} });
  assert.equal(strict.kind, 'wrong');
  assert.ok(strict.reveal);
  const sandbox = { sandbox: true, state: {} };
  for (let i = 0; i < 3; i++) assert.equal(cases.grade(ANG10C(), [ROW3], sandbox).kind, 'almost');
});

test('cases: a tab whose x is known but whose cells are blank is open (free) — "fill in the x = −1/2 case"', () => {
  const r = cases.grade(ANG10C(), [ROW3, { x: '-1/2', CFD: '', DFE: '' }], { state: {} });
  assert.equal(r.kind, 'almost');
  assert.match(r.msg, /x = 3 ✓/);
  assert.match(r.msg, /fill in the x = −1\/2 case/);
  assert.equal(r.missing, 0, 'the tab exists — nothing is missing');
  assert.equal(r.credit, 0.5);
  const partial = cases.grade(ANG10C(), [{ x: '3', CFD: '9', DFE: '' }, { x: '-1/2', CFD: '', DFE: '' }]);
  assert.equal(partial.kind, 'almost');
  assert.equal(partial.credit, 0.25);
});

test('cases: wrong cells — swapped columns, sign, a plain miss, an x that is not a root; the wrong message never names the answer', () => {
  const swapped = cases.grade(ANG10C(), [{ x: '3', CFD: '171', DFE: '9' }, ROWH]);
  assert.equal(swapped.kind, 'wrong');
  assert.deepEqual(swapped.tags, ['swapped-fields']);
  assert.match(swapped.msg, /goes in the other column/);
  const sign = cases.grade(ANG10C(), [{ x: '3', CFD: '-9', DFE: '171' }, ROWH]);
  assert.equal(sign.kind, 'wrong');
  assert.deepEqual(sign.tags, ['sign-flip']);
  assert.equal(sign.credit, 0.75);
  const miss = cases.grade(ANG10C(), [{ x: '3', CFD: '10', DFE: '171' }, ROWH]);
  assert.equal(miss.kind, 'wrong');
  assert.deepEqual(miss.tags, []);
  assert.ok(!/\b9\b/.test(miss.msg), miss.msg);
  assert.equal(miss.rows[0].cells.CFD.state, 'wrong');
  assert.equal(miss.rows[0].cells.DFE.state, 'ok');
  const extra = cases.grade(ANG10C(), [ROW3, { x: '4', CFD: '8', DFE: '172' }]);
  assert.equal(extra.kind, 'wrong');
  assert.deepEqual(extra.tags, ['extra-root']);
  assert.match(extra.msg, /x = 4 isn't a root/);
  // the card misconception for a cell value (ang-10: 81 is m∠BFC)
  const m = cases.grade(ANG10C(), [{ x: '3', CFD: '81', DFE: '171' }, ROWH]);
  assert.equal(m.kind, 'wrong');
  assert.deepEqual(m.tags, ['swapped-fields']);
  assert.match(m.msg, /81 is m∠BFC/);
});

test('cases: ang-05 verdict rows (−8, 67, 67, YES) and (−1, 4, 18, NO) in any order and any yes/no spelling', () => {
  const p = part('ang-05', 'cases');
  const ok = cases.grade(p, [{ x: '-1', MAH: '4', HAC: '18', verdict: 'no' }, { x: '-8', MAH: '67', HAC: '67', verdict: 'Yes' }]);
  assert.equal(ok.kind, 'correct');
  assert.equal(cases.grade(p, [{ x: '-8', MAH: '67', HAC: '67', verdict: true }, { x: '-1', MAH: '4', HAC: '18', verdict: 'N' }]).kind, 'correct');
  assert.equal(cases.grade(p, [{ x: '-8', MAH: '67', HAC: '67', verdict: 'YES' }, { x: '-1', MAH: '4', HAC: '18', verdict: "doesn't bisect" }]).kind, 'correct');
  const wrongV = cases.grade(p, [{ x: '-1', MAH: '4', HAC: '18', verdict: 'yes' }, { x: '-8', MAH: '67', HAC: '67', verdict: 'yes' }]);
  assert.equal(wrongV.kind, 'wrong');
  assert.deepEqual(wrongV.tags, ['wrong-verdict']);
  assert.match(wrongV.msg, /x = −1/);
  const badV = cases.grade(p, [{ x: '-1', MAH: '4', HAC: '18', verdict: 'maybe' }, { x: '-8', MAH: '67', HAC: '67', verdict: 'yes' }]);
  assert.equal(badV.kind, 'malformed');
  assert.match(badV.msg, /YES or NO/);
  // one case only: the another-case path, with the ang-05 card line on the reveal
  const ctx = { state: {} };
  assert.equal(cases.grade(p, [{ x: '-8', MAH: '67', HAC: '67', verdict: 'yes' }], ctx).kind, 'almost');
  const reveal = cases.grade(p, [{ x: '-8', MAH: '67', HAC: '67', verdict: 'yes' }], ctx);
  assert.equal(reveal.kind, 'wrong');
  assert.deepEqual(reveal.reveal, { x: '−1' });
  assert.match(reveal.msg, /what if x = −1\?/i);
});

test('cases: empty / unreadable input is malformed (free); a wrong row beats a missing row in the verdict', () => {
  assert.equal(cases.grade(ANG10C(), []).kind, 'malformed');
  assert.equal(cases.grade(ANG10C(), null).kind, 'malformed');
  assert.equal(cases.grade(ANG10C(), [{ x: '', CFD: '', DFE: '' }]).kind, 'malformed');
  const bad = cases.grade(ANG10C(), [{ x: '3', CFD: 'abc', DFE: '' }]);
  assert.equal(bad.kind, 'malformed');
  assert.match(bad.msg, /m∠CFD/);
  const wrongFirst = cases.grade(ANG10C(), [{ x: '3', CFD: '10', DFE: '171' }], { state: {} });
  assert.equal(wrongFirst.kind, 'wrong');
  assert.deepEqual(wrongFirst.tags, []);
  assert.equal(wrongFirst.reveal, null, 'a wrong cell does not trigger the reveal path');
});

test('rootcase chain: every tag the three graders emit is in the catalogue', () => {
  const seen = new Set();
  const collect = (r) => (r.tags ?? []).forEach((t) => seen.add(t));
  collect(roots.grade(ANG10(), '3', { state: {} }));
  collect(roots.grade(ANG10(), '3, 4'));
  collect(roots.grade(ANG10(), 'x'));
  collect(reject.grade(part('ang-10', 'reject'), { keep: ['3'], reject: ['-1/2'], reason: 'negative angle' }));
  collect(reject.grade(part('ang-04', 'reject'), { keep: ['5', '-2'], reason: 'both' }));
  collect(reject.grade(part('ang-04', 'reject'), { keep: ['5'], reject: ['-2'], reason: 'zero angle' }));
  collect(cases.grade(ANG10C(), [ROW3], { state: { 'cases:missingCase': 1 } }));
  collect(cases.grade(ANG10C(), [{ x: '3', CFD: '171', DFE: '9' }]));
  collect(cases.grade(ANG10C(), [{ x: '3', CFD: '-9', DFE: '171' }]));
  collect(cases.grade(ANG10C(), [{ x: '4', CFD: '9', DFE: '171' }]));
  collect(cases.grade(part('ang-05', 'cases'), [{ x: '-1', MAH: '4', HAC: '18', verdict: 'yes' }]));
  assert.ok(seen.size >= 8, [...seen].join(','));
  for (const t of seen) assert.ok(isKnownTag(t), `tag ${t} is catalogued`);
});
