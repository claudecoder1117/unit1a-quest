// word-graders.test.mjs — T05: mathfmt (S9 #3 cases), asn (askReasonOnMiss semantics, disputed items),
// notation (ray order + kind rules), term (Damerau spelling tolerance), mc, cloze, classify, termmatch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mathfmt, stripMarkup, hasMarkup, escapeHtml } from '../site/js/mathfmt.js';
import * as asn from '../site/js/grader/asn.js';
import * as notation from '../site/js/grader/notation.js';
import * as term from '../site/js/grader/term.js';
import * as mc from '../site/js/grader/mc.js';
import * as cloze from '../site/js/grader/cloze.js';
import * as classify from '../site/js/grader/classify.js';
import * as termmatch from '../site/js/grader/termmatch.js';

// =====================================================================================
// mathfmt
// =====================================================================================

test('mathfmt: {line AB} and {ray FC} render as overline spans that carry the letters (S9 #3)', () => {
  const html = mathfmt('{line AB} and {ray FC}');
  assert.equal(html, '<span class="mf mf-line" role="img" aria-label="line AB">AB</span> and <span class="mf mf-ray" role="img" aria-label="ray FC">FC</span>');
});

test('mathfmt: every group of the S5 table', () => {
  assert.equal(mathfmt('{seg AB}'), '<span class="mf mf-seg" role="img" aria-label="segment AB">AB</span>');
  assert.equal(mathfmt('{len AB}'), '<span class="mf mf-len">AB</span>');
  assert.equal(mathfmt('{ang ABC}'), '<span class="mf mf-ang">∠ABC</span>');
  assert.equal(mathfmt('{m ABC}'), '<span class="mf mf-m">m∠ABC</span>');
  assert.equal(mathfmt('{plane P}'), '<span class="mf mf-plane">plane P</span>');
  assert.equal(mathfmt('x^2'), 'x<sup class="mf-sup">2</sup>');
  assert.equal(mathfmt('2x^2 − 4x + 3'), '2x<sup class="mf-sup">2</sup> − 4x + 3');
  assert.equal(mathfmt('x^{12} + x^-1'), 'x<sup class="mf-sup">12</sup> + x<sup class="mf-sup">−1</sup>');
  assert.equal(mathfmt('{ang ABD} ≅ {ang DBC}, 81°'), '<span class="mf mf-ang">∠ABD</span> ≅ <span class="mf mf-ang">∠DBC</span>, 81°');
  assert.equal(mathfmt('{ray F B}'), '<span class="mf mf-ray" role="img" aria-label="ray FB">FB</span>', 'spaces inside a group are dropped');
  assert.equal(mathfmt('{segment AB} {angle ABC} {length AB}'), mathfmt('{seg AB} {ang ABC} {len AB}'), 'long-form aliases');
});

test('mathfmt: escapes everything else and leaves unknown groups visible', () => {
  assert.equal(mathfmt('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(mathfmt('{ray <b>}'), '<span class="mf mf-ray" role="img" aria-label="ray &lt;b&gt;">&lt;b&gt;</span>');
  assert.equal(mathfmt('{foo bar}'), '{foo bar}');
  assert.equal(mathfmt('{ray }'), '{ray }');
  assert.equal(mathfmt('a "b" & c'), 'a &quot;b&quot; &amp; c');
  assert.equal(mathfmt('line 1\nline 2'), 'line 1<br>line 2');
  assert.equal(mathfmt(''), '');
  assert.equal(mathfmt(null), '');
  assert.equal(escapeHtml("<'>"), '&lt;&#39;&gt;');
});

test('mathfmt: the ang-10 stem from the S6 schema renders with no braces left over', () => {
  const stem = 'Point F is on {line EC} and {line AD}. {m BFC} = −x + 84, {m AFE} = 2x^2 − 4x + 3, {ang BFD} is a right angle. Find x, {m CFD}, {m DFE}.';
  const html = mathfmt(stem);
  assert.equal((html.match(/mf-line/g) ?? []).length, 2);
  assert.equal((html.match(/mf-m"/g) ?? []).length, 4);
  assert.equal((html.match(/mf-ang"/g) ?? []).length, 1);
  assert.ok(!/[{}]/.test(html));
  assert.match(html, /2x<sup class="mf-sup">2<\/sup> − 4x \+ 3/);
});

test('stripMarkup / hasMarkup: plain-text spellings for aria and copy', () => {
  assert.equal(stripMarkup('{line AB} and {ray FC}'), 'line AB and ray FC');
  assert.equal(stripMarkup('{seg AB}, {len AB}, {ang ABC}, {m ABC}, {plane ABC}'), 'segment AB, AB, ∠ABC, m∠ABC, plane ABC');
  assert.equal(stripMarkup('2x^2 − 4x + 3, x^{12}, x^-1'), '2x² − 4x + 3, x¹², x⁻¹');
  assert.equal(stripMarkup('{foo bar}'), '{foo bar}');
  assert.equal(hasMarkup('plain text'), false);
  assert.equal(hasMarkup('{ray AB}'), true);
  assert.equal(hasMarkup('x^2'), true);
});

// =====================================================================================
// asn
// =====================================================================================

const asn01 = { id: 'asn-01', type: 'asn', answer: 'S', reason: 'could be right (90°) or obtuse', distractors: ['every angle under 180° is acute', 'acute means under 90°, and 180° is over 90°'] };
const qz04 = { id: 'qz-04', type: 'asn', answer: 'S', disputed: 'Quizlet says S — and S is right (a line and a ray can be skew); an earlier draft flagged it as A', reason: "Quizlet's key; ⚑ arguably A", distractors: ['a ray can leave the plane', 'rays are never coplanar'] };
const bonus = { id: 'bonus-01', type: 'asn', answer: 'A' };

test('asn: parse every accepted verdict spelling', () => {
  for (const [raw, v] of [['A', 'A'], ['s', 'S'], ['N', 'N'], ['always', 'A'], ['Sometimes', 'S'], ['never', 'N'], ['1', 'A'], ['2', 'S'], ['3', 'N'], [' n ', 'N'], [{ verdict: 'a' }, 'A']]) {
    assert.equal(asn.parseVerdict(raw), v, JSON.stringify(raw));
  }
  assert.equal(asn.parseVerdict('x'), null);
  assert.equal(asn.grade(asn01, 'x').kind, 'malformed');
  assert.equal(asn.grade(asn01, '').kind, 'malformed');
});

test('asn: a correct verdict on a Card is one tap — reason line shown, no chips asked', () => {
  const r = asn.grade(asn01, 'S');
  assert.equal(r.ok, true);
  assert.equal(r.kind, 'correct');
  assert.equal(r.credit, 1);
  assert.equal(r.stage, 'verdict');
  assert.equal(r.showReason, true);
  assert.equal(r.reason, 'could be right (90°) or obtuse');
  assert.equal(r.askReason, false, 'chips are never asked after a correct verdict on a Card');
  assert.equal(r.withHints, false);
  assert.equal(r.msg, 'Sometimes — could be right (90°) or obtuse');
  assert.deepEqual(r.tags, []);
});

test('asn: askReasonOnMiss (default on) asks chips only after a wrong verdict; off → never on a Card', () => {
  const w = asn.grade(asn01, 'A');
  assert.equal(w.kind, 'wrong');
  assert.equal(w.ok, false);
  assert.equal(w.askReason, true);
  assert.equal(w.reason, 'could be right (90°) or obtuse', 'the reason line is still shown');
  assert.match(w.msg, /^Not Always\. Sometimes — could be right/);
  assert.deepEqual(w.tags, ['overgeneralised']);
  assert.equal(asn.grade(asn01, 'A', { askReasonOnMiss: false }).askReason, false);
  assert.equal(asn.grade(asn01, 'A', { settings: { askReasonOnMiss: false } }).askReason, false);
  assert.equal(asn.grade(asn01, 'S', { askReasonOnMiss: true }).askReason, false, 'a correct verdict never asks on a Card');
  assert.equal(asn.grade({ ...asn01, askReasonOnMiss: false }, 'N').askReason, false, 'part-level override');
});

test('asn: verdict tags — overgeneralised / undergeneralised / flipped', () => {
  assert.equal(asn.verdictTag('S', 'A'), 'overgeneralised');
  assert.equal(asn.verdictTag('S', 'N'), 'overgeneralised');
  assert.equal(asn.verdictTag('A', 'S'), 'undergeneralised');
  assert.equal(asn.verdictTag('N', 'S'), 'undergeneralised');
  assert.equal(asn.verdictTag('A', 'N'), 'flipped-verdict');
  assert.equal(asn.verdictTag('N', 'A'), 'flipped-verdict');
  assert.equal(asn.verdictTag('A', 'A'), null);
});

test('asn: Full 36 asks the chips after every verdict, right or wrong', () => {
  assert.equal(asn.grade(asn01, 'S', { full36: true }).askReason, true);
  assert.equal(asn.grade(asn01, 'N', { full36: true }).askReason, true);
  assert.equal(asn.grade(asn01, 'S', { mode: 'full36' }).askReason, true);
  assert.equal(asn.grade(asn01, 'N', { mode: 'full36', askReasonOnMiss: false }).askReason, true, 'Full 36 ignores the setting');
});

test('asn: Mock and BLITZ show no reasons and no chips', () => {
  for (const ctx of [{ mock: true }, { blitz: true }, { mode: 'mock' }, { mode: 'blitz' }]) {
    const ok = asn.grade(asn01, 'S', ctx);
    assert.equal(ok.ok, true);
    assert.equal(ok.reason, null);
    assert.equal(ok.showReason, false);
    assert.equal(ok.askReason, false);
    assert.equal(ok.msg, 'Sometimes.');
    const w = asn.grade(asn01, 'A', ctx);
    assert.equal(w.kind, 'wrong');
    assert.equal(w.reason, null);
    assert.equal(w.askReason, false);
    assert.ok(!w.msg.includes('could be right'), 'the reason never leaks into a Mock message');
  }
});

test('asn: reason stage — verdict ✓ + chip ✗ counts correct but withHints; wrong verdict + chip is free', () => {
  const good = asn.grade(asn01, { verdict: 'S', reason: 'could be right (90°) or obtuse' });
  assert.equal(good.ok, true);
  assert.equal(good.stage, 'reason');
  assert.equal(good.reasonOk, true);
  assert.equal(good.withHints, false);
  const hinted = asn.grade(asn01, { verdict: 'S', reason: 'every angle under 180° is acute' });
  assert.equal(hinted.ok, true, 'still counts as correct');
  assert.equal(hinted.kind, 'correct');
  assert.equal(hinted.credit, 1);
  assert.equal(hinted.reasonOk, false);
  assert.equal(hinted.withHints, true, 'scheduled as with hints (s = 70, bucket unchanged)');
  assert.deepEqual(hinted.tags, ['wrong-reason']);
  assert.match(hinted.msg, /^Right verdict, wrong reason\./);
  const missed = asn.grade(asn01, { verdict: 'A', reason: 'could be right (90°) or obtuse' });
  assert.equal(missed.kind, 'wrong');
  assert.equal(missed.free, true, 'the attempt was charged at the verdict stage');
  assert.equal(missed.reasonOk, true);
  assert.match(missed.msg, /^Right reason\. Sometimes —/);
  const missedBoth = asn.grade(asn01, { verdict: 'A', reason: 'rays are never coplanar' });
  assert.equal(missedBoth.kind, 'wrong');
  assert.equal(missedBoth.free, true);
  assert.equal(missedBoth.reasonOk, false);
  assert.deepEqual(missedBoth.tags, ['overgeneralised']);
});

test('asn: chips are deterministic per seed, contain exactly one correct chip, and gradeReason accepts an index', () => {
  const a = asn.chips(asn01);
  const b = asn.chips(asn01);
  assert.deepEqual(a, b);
  assert.equal(a.length, 3);
  assert.equal(a.filter((c) => c.ok).length, 1);
  assert.ok(a.some((c) => c.text === asn01.reason));
  const orders = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((s) => asn.chips(asn01, s).map((c) => c.text[0]).join('')));
  assert.ok(orders.size > 1, 'different seeds move the correct chip');
  const idx = a.findIndex((c) => c.ok);
  assert.equal(asn.gradeReason(asn01, idx).ok, true);
  assert.equal(asn.gradeReason(asn01, (idx + 1) % 3).ok, false);
  assert.equal(asn.grade(asn01, { verdict: 'S', reason: idx }).withHints, false);
  assert.deepEqual(asn.chips(bonus), []);
});

test('asn: disputed qz-04 grades the teacher letter (S) and carries the ⚑ note', () => {
  const s = asn.grade(qz04, 'S');
  assert.equal(s.ok, true);
  assert.equal(s.flag, true);
  assert.equal(s.disputed, 'Quizlet says S — and S is right (a line and a ray can be skew); an earlier draft flagged it as A');
  const a = asn.grade(qz04, 'A');
  assert.equal(a.ok, false, 'A is not accepted — the teacher answer is never changed');
  assert.equal(a.kind, 'wrong');
  assert.equal(a.flag, true);
  assert.equal(a.disputed, 'Quizlet says S — and S is right (a line and a ray can be skew); an earlier draft flagged it as A');
  assert.equal(asn.grade(asn01, 'S').flag, false);
});

test('asn: an item without a reason (bonus bank) shows no reason and never asks chips', () => {
  const ok = asn.grade(bonus, 'A');
  assert.equal(ok.ok, true);
  assert.equal(ok.reason, null);
  assert.equal(ok.askReason, false);
  assert.equal(ok.msg, 'Always.');
  const w = asn.grade(bonus, 'N');
  assert.equal(w.kind, 'wrong');
  assert.equal(w.askReason, false);
  assert.equal(w.msg, "Not Never — it's Always.");
  assert.deepEqual(w.tags, ['flipped-verdict']);
});

test('asn: the §4 key string round-trips (36 letters)', () => {
  const key = 'S S N N A S S S A A S S N A S S N A N A S S N A A S N N N S S S A A S S'.split(' ');
  assert.equal(key.length, 36);
  key.forEach((letter, i) => {
    const part = { id: `asn-${String(i + 1).padStart(2, '0')}`, type: 'asn', answer: letter, reason: 'r', distractors: ['d1', 'd2'] };
    assert.equal(asn.grade(part, letter.toLowerCase()).ok, true);
    assert.equal(asn.grade(part, letter === 'A' ? 'N' : 'A').ok, false);
  });
});

// =====================================================================================
// notation
// =====================================================================================

test('notation: ray is ordered — ray BA for ray AB is wrong with the rule and tag ray-order', () => {
  const part = { type: 'notation', kind: 'ray', pts: ['F', 'B'] };
  assert.equal(notation.grade(part, { kind: 'ray', pts: ['F', 'B'] }).ok, true);
  const w = notation.grade(part, { kind: 'ray', pts: ['B', 'F'] });
  assert.equal(w.ok, false);
  assert.equal(w.kind, 'wrong');
  assert.deepEqual(w.tags, ['ray-order']);
  assert.match(w.msg, /Endpoint first\. The endpoint is F, so it's ray FB/);
  assert.equal(w.rule, notation.RULES.ray);
  assert.equal(w.markup, '{ray BF}', 'the student build is re-rendered through mathfmt');
  for (const s of ['ray FB', 'ray F B', '{ray FB}', 'Ray fb', '→FB', '→ F B']) assert.equal(notation.grade(part, s).ok, true, s);
  assert.equal(notation.grade(part, 'ray BF').tags[0], 'ray-order');
  assert.equal(notation.grade(part, { decoration: '→', pts: ['F', 'B'] }).ok, true, 'builder decoration alias');
});

test('notation: line / segment / length are unordered; the trap items get the specific rule', () => {
  const line = { type: 'notation', kind: 'line', pts: ['A', 'B'] };
  assert.equal(notation.grade(line, { kind: 'line', pts: ['B', 'A'] }).ok, true);
  assert.equal(notation.grade(line, 'line BA').ok, true);
  assert.equal(notation.grade(line, { decoration: '↔', pts: ['A', 'B'] }).ok, true);
  const seg = { type: 'notation', kind: 'seg', pts: ['A', 'B'] };
  assert.equal(notation.grade(seg, { kind: 'seg', pts: ['B', 'A'] }).ok, true);
  assert.equal(notation.grade(seg, 'segment BA').ok, true);
  assert.equal(notation.grade(seg, { decoration: '¯', pts: ['A', 'B'] }).ok, true);
  const len = { type: 'notation', kind: 'len', pts: ['A', 'B'] };
  assert.equal(notation.grade(len, 'BA').ok, true, 'bare letters = a length');
  assert.equal(notation.grade(len, { decoration: 'none', pts: ['A', 'B'] }).ok, true);
  const barred = notation.grade(len, { kind: 'seg', pts: ['A', 'B'] });
  assert.equal(barred.kind, 'wrong');
  assert.deepEqual(barred.tags, ['bar-on-length']);
  assert.match(barred.msg, /LENGTH of AB is a number — write AB with no bar/);
  const lineForSeg = notation.grade(seg, 'line AB');
  assert.deepEqual(lineForSeg.tags, ['line-vs-segment']);
  assert.match(lineForSeg.msg, /segment has two endpoints/);
  assert.deepEqual(notation.grade(seg, 'ray AB').tags, ['segment-vs-ray']);
  assert.deepEqual(notation.grade(line, 'ray AB').tags, ['wrong-decoration']);
  assert.equal(notation.grade(line, 'line AC').kind, 'wrong');
  assert.match(notation.grade(line, 'line AC').msg, /different line/);
});

test('notation: angle keeps the vertex in the middle; m∠ vs ∠', () => {
  const ang = { type: 'notation', kind: 'ang', pts: ['A', 'B', 'C'] };
  assert.equal(notation.grade(ang, { kind: 'ang', pts: ['C', 'B', 'A'] }).ok, true);
  for (const s of ['∠ABC', '∠CBA', 'angle ABC', '<ABC', '{ang CBA}', '∠ A B C']) assert.equal(notation.grade(ang, s).ok, true, s);
  const v = notation.grade(ang, { kind: 'ang', pts: ['B', 'A', 'C'] });
  assert.equal(v.kind, 'wrong');
  assert.deepEqual(v.tags, ['vertex-not-middle']);
  assert.match(v.msg, /vertex here is B/);
  const m = notation.grade(ang, 'm∠ABC');
  assert.deepEqual(m.tags, ['m-vs-angle']);
  assert.match(m.msg, /m∠ABC is the MEASURE/);
  const meas = { type: 'notation', kind: 'm', pts: ['A', 'B', 'C'] };
  for (const s of ['m∠ABC', 'm∠CBA', 'm angle ABC', 'm<ABC', '{m ABC}']) assert.equal(notation.grade(meas, s).ok, true, s);
  assert.deepEqual(notation.grade(meas, '∠ABC').tags, ['m-vs-angle']);
  assert.match(notation.grade(ang, '∠AB').msg, /Three letters, vertex in the middle/);
  assert.match(notation.grade(ang, '∠ABD').msg, /different angle/);
});

test('notation: ≅ between angles vs = between measures; plane naming', () => {
  const cong = { type: 'notation', kind: 'cong', sides: [{ kind: 'ang', pts: ['A', 'B', 'C'] }, { kind: 'ang', pts: ['D', 'E', 'F'] }] };
  assert.equal(notation.grade(cong, '∠DEF ≅ ∠ABC').ok, true, 'sides unordered');
  assert.equal(notation.grade(cong, '{ang CBA} ≅ {ang FED}').ok, true);
  assert.equal(notation.grade(cong, { kind: '≅', sides: [{ kind: '∠', pts: 'ABC' }, { kind: '∠', pts: 'DEF' }] }).ok, true);
  const eqForCong = notation.grade(cong, 'm∠ABC = m∠DEF');
  assert.equal(eqForCong.kind, 'wrong');
  assert.deepEqual(eqForCong.tags, ['congruent-vs-equal']);
  const congWrongSide = notation.grade(cong, '∠ABC ≅ m∠DEF');
  assert.equal(congWrongSide.kind, 'wrong');
  assert.deepEqual(congWrongSide.tags, ['m-vs-angle']);
  const eq = { type: 'notation', kind: 'eq', sides: [{ kind: 'm', pts: ['A', 'B', 'C'] }, { kind: 'm', pts: ['D', 'E', 'F'] }] };
  assert.equal(notation.grade(eq, 'm∠DEF = m∠ABC').ok, true);
  assert.deepEqual(notation.grade(eq, '∠ABC ≅ ∠DEF').tags, ['congruent-vs-equal']);
  assert.deepEqual(notation.grade(eq, '∠ABC').tags, ['wrong-decoration']);
  const lengths = { type: 'notation', kind: 'eq', sides: [{ kind: 'len', pts: ['A', 'B'] }, { kind: 'len', pts: ['C', 'D'] }] };
  assert.equal(notation.grade(lengths, 'CD = BA').ok, true);
  const plane = { type: 'notation', kind: 'plane', pts: ['A', 'B', 'C'] };
  assert.equal(notation.grade(plane, 'plane CAB').ok, true);
  assert.deepEqual(notation.grade(plane, 'plane ABD').tags, ['plane-naming']);
  assert.equal(notation.grade({ type: 'notation', kind: 'plane', pts: ['P'] }, 'plane P').ok, true);
});

test('notation: malformed builds, toMarkup / describe / same', () => {
  const part = { type: 'notation', kind: 'ray', pts: ['F', 'B'] };
  assert.equal(notation.grade(part, '').kind, 'malformed');
  assert.equal(notation.grade(part, { kind: 'ray' }).kind, 'malformed');
  assert.equal(notation.grade(part, { kind: 'zig', pts: ['A'] }).kind, 'malformed');
  assert.equal(notation.grade(part, null).kind, 'malformed');
  assert.equal(notation.toMarkup({ kind: 'ray', pts: ['F', 'B'] }), '{ray FB}');
  assert.equal(notation.toMarkup({ kind: 'cong', sides: [{ kind: 'ang', pts: 'ABC' }, { kind: 'ang', pts: 'DEF' }] }), '{ang ABC} ≅ {ang DEF}');
  assert.equal(notation.describe('m∠ABC'), 'm∠ABC');
  assert.equal(notation.describe({ kind: 'seg', pts: ['A', 'B'] }), 'segment AB');
  assert.equal(notation.describe('AB'), 'AB');
  assert.equal(notation.same('ray AB', 'ray BA'), false);
  assert.equal(notation.same('line AB', 'line BA'), true);
  assert.equal(notation.same('∠ABC', '∠CBA'), true);
  assert.equal(notation.same('∠ABC', '∠BAC'), false);
});

// =====================================================================================
// term
// =====================================================================================

test('term: exact and alias matches ignore case, spacing and punctuation', () => {
  const part = { type: 'term', answers: ['linear pair', 'linear pairs'] };
  for (const s of ['linear pair', 'Linear Pair', 'linear-pair', ' linear  pair ', 'LINEAR PAIRS', 'linearpair']) {
    const r = term.grade(part, s);
    assert.equal(r.ok, true, s);
    assert.equal(r.spelling, false, s);
    assert.equal(r.note, null);
  }
  assert.equal(term.grade({ type: 'term', answer: 'vertex' }, 'Vertex').ok, true, 'single answer form');
  assert.equal(term.grade({ type: 'term', answer: 'vertex', aliases: ['vertices'] }, 'vertices').ok, true);
});

test('term: Damerau ≤ 1 for words of ≥ 6 letters passes with the spelling note; shorter words are exact', () => {
  const lp = { type: 'term', answers: ['linear pair'] };
  const typo = term.grade(lp, 'lineer pair');
  assert.equal(typo.ok, true);
  assert.equal(typo.spelling, true);
  assert.equal(typo.note, '(spelling: linear pair)');
  assert.equal(typo.msg, '(spelling: linear pair)');
  assert.equal(term.grade(lp, 'liner pair').ok, true, 'deletion');
  assert.equal(term.grade(lp, 'linear pairr').ok, true, 'insertion');
  assert.equal(term.grade(lp, 'lienar pair').ok, true, 'transposition');
  assert.equal(term.grade(lp, 'liner par').ok, false, 'distance 2');
  const seg = { type: 'term', answers: ['segment'] };
  assert.equal(term.grade(seg, 'segemnt').ok, true);
  assert.equal(term.grade(seg, 'segmant').spelling, true);
  const ray = { type: 'term', answers: ['ray'] };
  assert.equal(term.grade(ray, 'rya').ok, false, 'three letters: exact only');
  assert.equal(term.grade({ type: 'term', answers: ['acute'] }, 'accute').ok, false, 'five letters: exact only');
  assert.equal(term.grade({ type: 'term', answers: ['vertex'] }, 'vertax').ok, true, 'six letters: tolerant');
  assert.equal(term.damerau('ca', 'abc'), 3);
  assert.equal(term.damerau('abcd', 'acbd', 1), 1);
  assert.equal(term.damerau('abc', 'abc'), 0);
});

test('term: a wrong answer that is the confusable partner is named and tagged', () => {
  const comp = { type: 'term', answers: ['complementary', 'complementary angles'] };
  const r = term.grade(comp, 'supplementary');
  assert.equal(r.kind, 'wrong');
  assert.equal(r.other, 'supplementary');
  assert.deepEqual(r.tags, ['confused-comp-supp']);
  assert.match(r.msg, /That's supplementary — a different term/);
  assert.deepEqual(term.grade({ type: 'term', answers: ['ray'] }, 'segment').tags, ['confused-ray-segment']);
  assert.deepEqual(term.grade({ type: 'term', answers: ['coplanar'] }, 'collinear').tags, ['confused-collinear-coplanar']);
  assert.deepEqual(term.grade({ type: 'term', answers: ['linear pair'] }, 'adjacent').tags, ['confused-adjacent-linear']);
  assert.equal(term.confusionTag('complement', 'complementary'), null, 'same side of the pair');
  assert.equal(term.confusionTag('segment', 'line segment'), null);
  assert.equal(term.confusionTag('segment', 'ray'), 'confused-ray-segment');
  assert.equal(term.confusionTag('vertex', 'segment'), null);
  const authored = term.grade({ type: 'term', answers: ['complement'], confusables: [{ term: 'supplement', msg: 'Supplement is 180 − x; the complement is 90 − x.' }] }, 'supplement');
  assert.equal(authored.msg, 'Supplement is 180 − x; the complement is 90 − x.');
  assert.deepEqual(authored.tags, ['confused-comp-supp']);
});

test('term: with a term bank, another term is named; an unknown word is flagged as not on the list', () => {
  const ctx = { terms: ['point', 'line', 'plane', 'vertex', 'segment', 'ray'] };
  const other = term.grade({ type: 'term', answers: ['vertex'] }, 'segment', ctx);
  assert.equal(other.kind, 'wrong');
  assert.equal(other.other, 'segment');
  assert.match(other.msg, /That's segment — a different term/);
  const unknown = term.grade({ type: 'term', answers: ['vertex'] }, 'zzzz', ctx);
  assert.match(unknown.msg, /isn't a term on this unit's list/);
  const generic = term.grade({ type: 'term', answers: ['vertex'] }, 'zzzz');
  assert.match(generic.msg, /read the definition again/);
  assert.equal(term.grade({ type: 'term', answers: ['vertex'] }, '').kind, 'malformed');
  assert.equal(term.grade({ type: 'term', answers: ['vertex'] }, '  ---  ').kind, 'malformed');
});

// =====================================================================================
// mc
// =====================================================================================

const mcPart = { id: 'voc-10', type: 'mc', term: 'complementary', answer: 'two angles whose measures sum to 90°', distractors: [{ text: 'two angles whose measures sum to 180°', term: 'supplementary' }, { text: 'two angles that share a vertex and a side but no interior points', term: 'adjacent' }, 'two non-adjacent angles formed by two intersecting lines'] };

test('mc: options are deterministic per seed, contain the answer exactly once, and reorder for another seed', () => {
  const a = mc.options(mcPart);
  assert.deepEqual(a, mc.options(mcPart));
  assert.equal(a.length, 4);
  assert.equal(a.filter((o) => o.ok).length, 1);
  const positions = new Set(['s1', 's2', 's3', 's4', 's5', 's6'].map((s) => mc.options(mcPart, s).findIndex((o) => o.ok)));
  assert.ok(positions.size > 1);
  assert.equal(mc.options({ ...mcPart, shuffle: false })[0].ok, true, 'shuffle:false keeps authored order');
  assert.equal(mc.options({ id: 'x', type: 'mc', answer: 'b', options: ['a', 'b', 'c'], shuffle: false })[1].ok, true, 'explicit options list');
});

test('mc: grade by text, by index (same seed), by {index}; wrong picks get the confusable tag', () => {
  assert.equal(mc.grade(mcPart, 'two angles whose measures sum to 90°').ok, true);
  assert.equal(mc.grade(mcPart, 'Two angles whose measures sum to 90°  ').ok, true);
  const opts = mc.options(mcPart, 'seed-1');
  const i = opts.findIndex((o) => o.ok);
  assert.equal(mc.grade(mcPart, i, { seed: 'seed-1' }).ok, true);
  assert.equal(mc.grade(mcPart, { index: i }, { seed: 'seed-1' }).ok, true);
  assert.equal(mc.grade(mcPart, String(i + 1), { seed: 'seed-1' }).ok, true, 'a typed 1-based number');
  const supp = mc.grade(mcPart, 'two angles whose measures sum to 180°');
  assert.equal(supp.kind, 'wrong');
  assert.equal(supp.msg, "That's supplementary, not complementary.");
  assert.deepEqual(supp.tags, ['confused-comp-supp']);
  const adj = mc.grade(mcPart, 'two angles that share a vertex and a side but no interior points');
  assert.equal(adj.msg, "That's adjacent, not complementary.");
  assert.deepEqual(adj.tags, []);
  const plain = mc.grade(mcPart, 'two non-adjacent angles formed by two intersecting lines');
  assert.match(plain.msg, /doesn't describe complementary/);
  assert.equal(mc.grade(mcPart, 'not an option').kind, 'malformed');
  assert.equal(mc.grade(mcPart, '').kind, 'malformed');
  const authored = mc.grade({ ...mcPart, why: { 'two angles whose measures sum to 180°': 'That adds to 180 — supplementary.' } }, 'two angles whose measures sum to 180°');
  assert.equal(authored.msg, 'That adds to 180 — supplementary.');
  const tagged = mc.grade({ type: 'mc', answer: 'ray FB', distractors: [{ text: 'ray BF', tag: 'ray-order' }] }, 'ray BF');
  assert.deepEqual(tagged.tags, ['ray-order']);
});

// =====================================================================================
// cloze
// =====================================================================================

test('cloze: parse [__], ___ and inline [a/b] choices; literal brackets stay text', () => {
  const segs = cloze.parseCloze('∠ABD ≅ ∠DBC because m∠ABD = [__]° and m∠DBC = ___°, so BD [does/does not] bisect ∠ABC. [x, y]');
  assert.deepEqual(segs.filter((s) => s.type === 'blank').map((s) => s.choices), [null, null, ['does', 'does not']]);
  assert.equal(segs.filter((s) => s.type === 'text').map((s) => s.text).join('|'), '∠ABD ≅ ∠DBC because m∠ABD = |° and m∠DBC = |°, so BD | bisect ∠ABC. [x, y]');
});

test('cloze: def-10 — numeric and word blanks, spelling tolerance, partial fills are free', () => {
  const part = { type: 'cloze', text: 'Two angles whose measures sum to [__]° are [__].', blanks: [{ answer: '90' }, { answers: ['complementary', 'complementary angles'] }] };
  const ok = cloze.grade(part, ['90', 'complementary']);
  assert.equal(ok.ok, true);
  assert.equal(ok.credit, 1);
  assert.equal(cloze.grade(part, ['90°', 'Complementary Angles']).ok, true);
  const sp = cloze.grade(part, ['90', 'complimentary']);
  assert.equal(sp.ok, true);
  assert.equal(sp.fields[1].spelling, true);
  assert.equal(sp.msg, '(spelling: complementary)');
  const wrong = cloze.grade(part, ['180', 'complementary']);
  assert.equal(wrong.kind, 'wrong');
  assert.equal(wrong.credit, 0.5);
  assert.equal(wrong.fields[0].kind, 'wrong');
  assert.equal(wrong.fields[1].ok, true, 'the right blank locks');
  assert.match(wrong.msg, /Blank 1: not 180/);
  const half = cloze.grade(part, ['90', '']);
  assert.equal(half.kind, 'malformed');
  assert.match(half.msg, /1 blank left/);
  assert.equal(half.fields[0].ok, true);
  assert.equal(cloze.grade(part, ['', '']).kind, 'malformed');
  assert.equal(cloze.grade(part, []).msg, 'Fill in the blanks.');
  assert.equal(cloze.grade(part, ['ninety', 'complementary']).kind, 'malformed', 'a non-number in a numeric blank is free');
  assert.equal(cloze.grade(part, { 0: '90', 1: 'complementary' }).ok, true, 'object keyed by index');
});

test('cloze: fill-justify (Boss/Mock tier) with an inline does/does not choice', () => {
  const part = { type: 'cloze', text: '∠ABD ≅ ∠DBC because m∠ABD = [__]° and m∠DBC = [__]°, so BD [does/does not] bisect ∠ABC.', blanks: [{ key: 'abd', answer: '81' }, { key: 'dbc', answer: '81' }, { key: 'v', answer: 'does' }] };
  assert.deepEqual(cloze.choicesFor(part, 2), ['does', 'does not']);
  assert.equal(cloze.choicesFor(part, 0), null);
  assert.equal(cloze.grade(part, ['81', '81', 'does']).ok, true);
  assert.equal(cloze.grade(part, { abd: '81', dbc: '81', v: 'does' }).ok, true, 'object keyed by blank.key');
  const w = cloze.grade(part, ['81', '81', 'does not']);
  assert.equal(w.kind, 'wrong');
  assert.equal(w.credit, 2 / 3);
  assert.equal(w.fields[2].kind, 'wrong');
  const authored = cloze.grade({ ...part, blanks: [{ answer: '81', why: { 75: 'Substitute x = 13 into 5x + 16.' } }, { answer: '81' }, { answer: 'does' }] }, ['75', '81', 'does']);
  assert.equal(authored.msg, 'Substitute x = 13 into 5x + 16.');
});

// =====================================================================================
// classify
// =====================================================================================

test('classify: buckets and boundaries', () => {
  assert.equal(classify.classifyMeasure(89.5), 'acute');
  assert.equal(classify.classifyMeasure(90), 'right');
  assert.equal(classify.classifyMeasure(90.5), 'obtuse');
  assert.equal(classify.classifyMeasure(180), 'straight');
  assert.equal(classify.classifyMeasure(0), null);
  assert.equal(classify.classifyMeasure(181), null);
  const right = { type: 'classify', measure: 90 };
  assert.equal(classify.grade(right, 'right').ok, true);
  assert.equal(classify.grade(right, 'R').ok, true);
  assert.equal(classify.grade(right, 1).ok, true);
  assert.equal(classify.grade(right, { index: 1 }).ok, true);
  const ob = classify.grade(right, 'obtuse');
  assert.equal(ob.kind, 'wrong');
  assert.deepEqual(ob.tags, ['boundary-90']);
  assert.equal(ob.msg, 'Obtuse means more than 90° and less than 180° — 90° is exactly 90°.');
  assert.equal(classify.grade(right, 'acute').msg, 'Acute means less than 90° — 90° is exactly 90°.');
  const st = { type: 'classify', measure: 180 };
  assert.equal(classify.grade(st, 'straight').ok, true);
  assert.deepEqual(classify.grade(st, 'obtuse').tags, ['boundary-180']);
  assert.match(classify.grade(st, 'obtuse').msg, /whole straight line/);
  const ac = { type: 'classify', measure: 47 };
  assert.equal(classify.grade(ac, 'acute').ok, true);
  assert.deepEqual(classify.grade(ac, 'obtuse').tags, ['misclassified']);
  assert.equal(classify.grade(ac, 'obtuse').msg, 'Obtuse means more than 90° and less than 180° — 47° is less than 90°.');
  assert.equal(classify.grade(ac, 'right').msg, "Right means exactly 90° — 47° isn't.");
  assert.equal(classify.grade({ type: 'classify', answer: 'acute' }, 'acute').ok, true, 'answer without a measure');
  assert.equal(classify.grade({ type: 'classify', answer: 'acute' }, 'obtuse').msg, 'Obtuse means more than 90° and less than 180° — check the measure again.');
  assert.equal(classify.grade(ac, 'reflex').kind, 'malformed');
  assert.deepEqual(classify.validate({ type: 'classify', answer: 'acute', measure: 120 }), ['FLAG: answer acute but measure 120 is obtuse']);
  assert.deepEqual(classify.validate({ type: 'classify', measure: 120 }), []);
});

// =====================================================================================
// termmatch
// =====================================================================================

const tm = { id: 'voc-match-1', type: 'termmatch', pairs: [
  { term: 'point', def: 'a location, no size' },
  { term: 'line', def: 'straight, extends forever in both directions' },
  { term: 'plane', def: 'flat surface extending forever in all directions' },
  { term: 'collinear', def: 'points on the same line' },
  { term: 'coplanar', def: 'points or lines in the same plane' },
  { term: 'segment', def: 'part of a line with two endpoints' },
] };

test('termmatch: layout shuffles definitions deterministically and never leaves them in authored order', () => {
  const a = termmatch.layout(tm);
  assert.deepEqual(a, termmatch.layout(tm));
  assert.deepEqual(a.terms.map((t) => t.text), tm.pairs.map((p) => p.term));
  assert.deepEqual(a.defs.map((d) => d.text).sort(), tm.pairs.map((p) => p.def).sort());
  for (const s of ['a', 'b', 'c', 'd', 'e']) assert.ok(!termmatch.layout(tm, s).defs.every((d, k) => d.i === k), `seed ${s}`);
  assert.deepEqual(termmatch.layout({ ...tm, shuffle: false }).defs.map((d) => d.i), [0, 1, 2, 3, 4, 5]);
});

test('termmatch: grade an assignment object, a pairs array, and index pairs against the layout', () => {
  const all = Object.fromEntries(tm.pairs.map((p) => [p.term, p.def]));
  const ok = termmatch.grade(tm, all);
  assert.equal(ok.ok, true);
  assert.equal(ok.credit, 1);
  const swapped = { ...all, collinear: all.coplanar, coplanar: all.collinear };
  const w = termmatch.grade(tm, swapped);
  assert.equal(w.kind, 'wrong');
  assert.equal(w.credit, 4 / 6);
  assert.equal(w.msg, '2 mismatched: collinear, coplanar.');
  assert.equal(w.fields.find((f) => f.term === 'point').ok, true);
  const partial = termmatch.grade(tm, { point: all.point });
  assert.equal(partial.kind, 'malformed');
  assert.match(partial.msg, /5 terms left/);
  assert.equal(termmatch.grade(tm, {}).msg, 'Match every term to a definition.');
  const lay = termmatch.layout(tm, 'z');
  const idxPairs = tm.pairs.map((p, i) => [i, lay.defs.findIndex((d) => d.text === p.def)]);
  assert.equal(termmatch.grade(tm, idxPairs, { seed: 'z' }).ok, true, 'index pairs use the same seed as layout()');
  assert.equal(termmatch.grade(tm, tm.pairs.map((p) => [p.term, p.def])).ok, true, 'text pairs');
  const one = termmatch.grade(tm, { ...all, segment: all.point });
  assert.equal(one.msg, 'segment — not that definition.');
});
