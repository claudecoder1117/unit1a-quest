// strip.test.mjs — Proof Strip grader (COMPOSED S3 "strip", S6 test list): required/forbidden/neutral
// chip semantics, left-to-right slot grading with reveal, prose render, the ctx.gradePart seam.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grade, gradeSlot, validate, prose, slotAnswer, requiredChip, parseNum, numEq } from '../site/js/grader/strip.js';

// doc-05 as the S3 text describes it (T06b authors the real card; this fixture pins the contract).
const EQ = '5x+16 + 8x−23 = 11x+19';
function doc05() {
  return {
    type: 'strip',
    slots: [
      {
        id: 'eq', type: 'pick', label: 'Set up',
        options: [EQ, '5x+16 = 8x−23', '5x+16 + 8x−23 = 180'],
        answer: EQ,
        why: {
          '5x+16 = 8x−23': 'That assumes the halves are equal — that is the thing we are testing. Start from the whole: the two parts add up to m∠ABC.',
          '5x+16 + 8x−23 = 180': 'Nothing says ∠ABC is straight — its measure is 11x + 19.',
        },
      },
      { id: 'x', type: 'num', label: 'x =', answer: '13' },
      { id: 'halves', type: 'multi', label: 'the halves', fields: [{ key: 'ABD', label: 'm∠ABD', answer: '81' }, { key: 'DBC', label: 'm∠DBC', answer: '81' }] },
      { id: 'verdict', type: 'verdict', label: 'Does BD bisect ∠ABC?', answer: 'YES', why: { NO: '81° = 81° — the halves are congruent, so it does.' } },
      {
        id: 'why', type: 'chips', label: 'because',
        chips: [
          { text: '{ang ABD} ≅ {ang DBC} (81° = 81°), so {ray BD} bisects', role: 'required' },
          { text: 'x = 13', role: 'neutral' },
          { text: EQ, role: 'neutral' },
          { text: '{ray BD} is inside {ang ABC}', role: 'neutral' },
          { text: 'the angles add to 180°', role: 'forbidden', why: '∠ABD and ∠DBC add to m∠ABC = 162°, not 180° — they are not a linear pair.' },
        ],
      },
    ],
    prose: 'Since [[eq]], x = [[x]], so {m ABD} = [[halves.ABD]]° = {m DBC}; the halves are congruent, so {ray BD} bisects {ang ABC}.',
  };
}
const REQ = '{ang ABD} ≅ {ang DBC} (81° = 81°), so {ray BD} bisects';
const ALL_OK = { eq: EQ, x: '13', halves: { ABD: '81', DBC: '81' }, verdict: 'YES', why: [REQ] };

test('doc-05 fixture validates (exactly one required chip, answers among options, prose placeholders resolve)', () => {
  assert.deepEqual(validate(doc05()), []);
});

test('validate catches the authoring mistakes that matter', () => {
  const p = doc05();
  p.slots[4].chips[1].role = 'required';
  assert.match(validate(p).join('\n'), /exactly one required chip \(found 2\)/);
  const q = doc05();
  q.slots[0].answer = '5x = 8x';
  assert.match(validate(q).join('\n'), /answer is not among the options/);
  const r = doc05();
  r.prose = 'x = [[nope]]';
  assert.match(validate(r).join('\n'), /unknown slot \[\[nope\]\]/);
  const s = doc05();
  s.slots[4].chips[0] = { text: 'req', tag: 'required' }; // `tag` is a misconception-scanner trap
  assert.match(validate(s).join('\n'), /write `role`/);
  assert.match(validate({ type: 'strip', slots: [] }).join('\n'), /non-empty slots/);
});

// ---------- chip semantics ----------

test('chips: required alone is correct; neutrals cost nothing; forbidden breaks it; missing required fails', () => {
  const p = doc05();
  const slot = p.slots[4];
  assert.equal(requiredChip(slot).text, REQ);
  assert.equal(gradeSlot(p, slot, [REQ]).ok, true);
  assert.equal(gradeSlot(p, slot, [REQ, 'x = 13', EQ, '{ray BD} is inside {ang ABC}']).ok, true, 'neutrals never hurt');
  const forb = gradeSlot(p, slot, [REQ, 'the angles add to 180°']);
  assert.equal(forb.ok, false);
  assert.equal(forb.kind, 'wrong');
  assert.match(forb.msg, /not a linear pair/);
  assert.ok(forb.tags.includes('forbidden-reason'));
  const neutralOnly = gradeSlot(p, slot, ['x = 13', EQ]);
  assert.equal(neutralOnly.kind, 'wrong');
  assert.match(neutralOnly.msg, /true, but it isn't the reason/);
  assert.ok(neutralOnly.tags.includes('missing-reason'));
  const forbOnly = gradeSlot(p, slot, ['the angles add to 180°']);
  assert.equal(forbOnly.kind, 'wrong');
  assert.equal(gradeSlot(p, slot, []).kind, 'malformed', 'nothing picked is not an attempt');
  assert.equal(gradeSlot(p, slot, [0]).ok, true, 'chips by index');
  assert.equal(gradeSlot(p, slot, new Set([REQ])).ok, true, 'chips as a Set');
  assert.equal(gradeSlot(p, slot, [REQ, REQ]).ok, true, 'duplicates collapse');
  assert.equal(neutralOnly.answer, REQ, 'the reveal is the required chip');
});

test('chips: legacy `tag` role field still grades (validate warns about it)', () => {
  const p = doc05();
  p.slots[4].chips = p.slots[4].chips.map((c) => ({ ...c, tag: c.role, role: undefined }));
  assert.equal(gradeSlot(p, p.slots[4], [REQ]).ok, true);
  assert.equal(gradeSlot(p, p.slots[4], ['the angles add to 180°']).kind, 'wrong');
});

// ---------- per-slot graders ----------

test('pick: text or index, whitespace/minus-insensitive; a wrong pick carries its authored why', () => {
  const p = doc05();
  const slot = p.slots[0];
  assert.equal(gradeSlot(p, slot, EQ).ok, true);
  assert.equal(gradeSlot(p, slot, '5x + 16 + 8x - 23 = 11x + 19').ok, true, 'spacing and ASCII minus');
  assert.equal(gradeSlot(p, slot, 0).ok, true);
  assert.equal(gradeSlot(p, slot, { index: 0 }).ok, true);
  const w = gradeSlot(p, slot, '5x+16 = 8x−23');
  assert.equal(w.kind, 'wrong');
  assert.match(w.msg, /assumes the halves are equal/);
  assert.equal(gradeSlot(p, slot, 'nonsense').kind, 'malformed');
});

test('num: every S3 spelling of 13 passes; sign flip is named; letters are malformed (free)', () => {
  const p = doc05();
  const slot = p.slots[1];
  for (const s of ['13', ' 13 ', 'x = 13', 'x=13', '13.', '= 13', '+13', '13.0000001', '26/2', '10+3', '13.00']) {
    assert.equal(gradeSlot(p, slot, s).ok, true, `13 as ${JSON.stringify(s)}`);
  }
  const neg = gradeSlot(p, slot, '-13');
  assert.equal(neg.kind, 'wrong');
  assert.ok(neg.tags.includes('sign-flip'));
  assert.match(neg.msg, /sign/i);
  assert.equal(gradeSlot(p, slot, '12').kind, 'wrong');
  assert.equal(gradeSlot(p, slot, 'abc').kind, 'malformed');
  assert.equal(gradeSlot(p, slot, '').kind, 'malformed');
  const d = { ...slot, distractors: { 'value of 13x − 7': '162' } };
  assert.match(gradeSlot(p, d, '162').msg, /is the value of 13x − 7/);
});

test('multi: both boxes graded, degree signs fine, one blank box is not an attempt, a wrong box names itself', () => {
  const p = doc05();
  const slot = p.slots[2];
  assert.equal(gradeSlot(p, slot, { ABD: '81', DBC: '81' }).ok, true);
  assert.equal(gradeSlot(p, slot, { ABD: '81°', DBC: '81 degrees' }).ok, true);
  assert.equal(gradeSlot(p, slot, ['81', '81']).ok, true, 'array in field order');
  const half = gradeSlot(p, slot, { ABD: '81', DBC: '' });
  assert.equal(half.kind, 'malformed');
  assert.match(half.msg, /1 box left/);
  assert.equal(half.fields[0].ok, true, 'the correct box is reported so the widget can lock it');
  const w = gradeSlot(p, slot, { ABD: '80', DBC: '81' });
  assert.equal(w.kind, 'wrong');
  assert.match(w.msg, /m∠ABD isn't 80/);
  assert.equal(w.fields[1].ok, true);
  assert.equal(gradeSlot(p, slot, {}).kind, 'malformed');
});

test('multi: swapped fields are diagnosed when the answers differ', () => {
  const p = { type: 'strip', slots: [{ id: 'm', type: 'multi', label: 'm', fields: [{ key: 'a', label: 'angle', answer: '60' }, { key: 'c', label: 'complement', answer: '30' }] }] };
  const r = gradeSlot(p, p.slots[0], { a: '30', c: '60' });
  assert.equal(r.kind, 'wrong');
  assert.ok(r.tags.includes('swapped-fields'));
  assert.match(r.msg, /goes in the other box/);
});

test('verdict: YES/yes/y/true/index all parse; NO is wrong with the authored why', () => {
  const p = doc05();
  const slot = p.slots[3];
  for (const v of ['YES', 'yes', 'y', 'true', 0, { index: 0 }]) assert.equal(gradeSlot(p, slot, v).ok, true, `yes as ${JSON.stringify(v)}`);
  const no = gradeSlot(p, slot, 'no');
  assert.equal(no.kind, 'wrong');
  assert.match(no.msg, /congruent/);
  assert.ok(no.tags.includes('wrong-verdict'));
  assert.equal(gradeSlot(p, slot, 'maybe').kind, 'malformed');
  const custom = { id: 'c', type: 'verdict', label: 'c', options: ['bisects', 'does not bisect'], answer: 'bisects' };
  assert.equal(gradeSlot(p, custom, 'does not bisect').kind, 'wrong');
  assert.equal(gradeSlot(p, custom, 'bisects').ok, true);
});

// ---------- left-to-right whole-strip grading ----------

test('empty submit: malformed, first slot pending, the rest locked, nothing revealed', () => {
  const r = grade(doc05(), {});
  assert.equal(r.kind, 'malformed');
  assert.equal(r.ok, false);
  assert.equal(r.next, 'eq');
  assert.deepEqual(r.slots.map((s) => s.state), ['pending', 'locked', 'locked', 'locked', 'locked']);
  assert.deepEqual(r.revealed, []);
  assert.equal(r.credit, 0);
});

test('slots grade left to right: a correct slot is kind correct but ok stays false until the strip is complete', () => {
  const r = grade(doc05(), { eq: EQ });
  assert.equal(r.kind, 'correct');
  assert.equal(r.ok, false);
  assert.equal(r.complete, false);
  assert.equal(r.next, 'x');
  assert.equal(r.credit, 0.2);
  assert.deepEqual(r.slots.map((s) => s.state), ['ok', 'pending', 'locked', 'locked', 'locked']);
  assert.match(r.msg, /next: x =/);
});

test('a wrong slot reveals its answer and unlocks the next slot', () => {
  const r = grade(doc05(), { eq: '5x+16 + 8x−23 = 180' });
  assert.equal(r.kind, 'wrong');
  assert.deepEqual(r.reveal, { id: 'eq', answer: EQ });
  assert.equal(r.slots[0].state, 'revealed');
  assert.equal(r.slots[0].answer, EQ);
  assert.equal(r.next, 'x', 'the next slot unlocks after the reveal');
  assert.equal(r.slots[1].state, 'pending');
  assert.match(r.msg, /Nothing says ∠ABC is straight/);
  assert.match(r.msg, /Answer: 5x\+16 \+ 8x−23 = 11x\+19\./);
  assert.deepEqual(r.revealed, ['eq']);
});

test('answers for locked slots are ignored until their turn (no skipping ahead)', () => {
  const r = grade(doc05(), { x: '13', halves: { ABD: '81', DBC: '81' } });
  assert.equal(r.next, 'eq');
  assert.equal(r.kind, 'malformed');
  assert.equal(r.slots[1].state, 'locked');
  const r2 = grade(doc05(), { eq: EQ, halves: { ABD: '81', DBC: '81' } });
  assert.equal(r2.next, 'x');
  assert.equal(r2.slots[2].state, 'locked');
});

test('malformed input in the current slot is free: the slot stays pending and nothing is revealed', () => {
  const r = grade(doc05(), { eq: EQ, x: 'thirteen' });
  assert.equal(r.kind, 'malformed');
  assert.equal(r.next, 'x');
  assert.equal(r.reveal, null);
  assert.equal(r.slots[1].state, 'pending');
  assert.equal(r.slots[0].state, 'ok');
});

test('a fully correct strip clears: ok, complete, credit 1, prose rendered', () => {
  const r = grade(doc05(), ALL_OK);
  assert.equal(r.ok, true);
  assert.equal(r.kind, 'correct');
  assert.equal(r.complete, true);
  assert.equal(r.next, null);
  assert.equal(r.credit, 1);
  assert.deepEqual(r.slots.map((s) => s.state), ['ok', 'ok', 'ok', 'ok', 'ok']);
  assert.equal(r.msg, 'Complete.');
  assert.equal(r.prose.text, 'Since 5x+16 + 8x−23 = 11x+19, x = 13, so m∠ABD = 81° = m∠DBC; the halves are congruent, so ray BD bisects ∠ABC.');
  assert.match(r.prose.html, /<span class="mf mf-ray" role="img" aria-label="ray BD">BD<\/span> bisects <span class="mf mf-ang">∠ABC<\/span>/);
});

test('a strip finished after a reveal is complete but never ok; credit counts the slots that were right', () => {
  const r = grade(doc05(), { ...ALL_OK, x: '12' });
  assert.equal(r.complete, true);
  assert.equal(r.ok, false);
  assert.equal(r.kind, 'correct', 'the newest slot (chips) was right');
  assert.equal(r.credit, 0.8);
  assert.deepEqual(r.revealed, ['x']);
  assert.match(r.msg, /1 step revealed/);
});

test('grading is idempotent: the same raw twice gives the same result', () => {
  const a = grade(doc05(), { eq: EQ, x: '12', halves: { ABD: '81', DBC: '81' } });
  const b = grade(doc05(), { eq: EQ, x: '12', halves: { ABD: '81', DBC: '81' } });
  assert.deepEqual(a, b);
  assert.equal(a.kind, 'correct');
  assert.deepEqual(a.revealed, ['x']);
});

test('ctx.gradePart routes num and multi slots through the dispatcher when it is present', () => {
  const calls = [];
  const gradePart = (part, raw) => {
    calls.push({ type: part.type, raw });
    return { ok: true, kind: 'correct', credit: 1, msg: 'via dispatcher', tags: [], normalized: raw };
  };
  const r = grade(doc05(), { eq: EQ, x: '13', halves: { ABD: '81', DBC: '81' } }, { gradePart });
  assert.deepEqual(calls.map((c) => c.type), ['num', 'multi']);
  assert.equal(calls[0].raw, '13');
  assert.equal(r.next, 'verdict');
  const wrongViaDispatcher = grade(doc05(), { eq: EQ, x: '5' }, { gradePart: () => ({ ok: false, kind: 'wrong', msg: "That's the complement", tags: ['gave-complement'] }) });
  assert.equal(wrongViaDispatcher.kind, 'wrong');
  assert.match(wrongViaDispatcher.msg, /That's the complement/);
  assert.deepEqual(wrongViaDispatcher.tags, ['gave-complement']);
  const almostViaDispatcher = grade(doc05(), { eq: EQ, x: '5' }, { gradePart: () => ({ ok: false, kind: 'almost', msg: 'one number per field' }) });
  assert.equal(almostViaDispatcher.kind, 'malformed', 'a sub-grader almost keeps the slot open and is free');
  assert.equal(almostViaDispatcher.reveal, null);
});

// ---------- ang-05 shape: chips per case + a conclusion pick ----------

test('ang-05 shape: two chip sets and a conclusion pick grade as one left-to-right strip', () => {
  const p = {
    type: 'strip',
    slots: [
      { id: 'c1', type: 'chips', label: 'x = −8', chips: [{ text: '67° = 67°, so AH bisects', role: 'required' }, { text: 'x = −8', role: 'neutral' }, { text: '67 + 67 = 180', role: 'forbidden' }] },
      { id: 'c2', type: 'chips', label: 'x = −1', chips: [{ text: '4° ≠ 18°, so AH does not bisect', role: 'required' }, { text: 'x = −1', role: 'neutral' }, { text: '4 + 18 = 90', role: 'forbidden' }] },
      { id: 'end', type: 'pick', label: 'Conclusion', options: ['bisects only when x = −8 — both cases stated', 'always bisects', 'never bisects'], answer: 'bisects only when x = −8 — both cases stated' },
    ],
    prose: 'Case x = −8: [[c1]]. Case x = −1: [[c2]]. So AH [[end]].',
  };
  assert.deepEqual(validate(p), []);
  const r = grade(p, { c1: ['67° = 67°, so AH bisects', 'x = −8'], c2: ['4° ≠ 18°, so AH does not bisect'], end: 0 });
  assert.equal(r.ok, true);
  assert.equal(prose(p).text, 'Case x = −8: 67° = 67°, so AH bisects. Case x = −1: 4° ≠ 18°, so AH does not bisect. So AH bisects only when x = −8 — both cases stated.');
});

test('prose without a template lists label + answer per slot', () => {
  const p = { type: 'strip', slots: [{ id: 'x', type: 'num', label: 'x =', answer: '13' }, { id: 'v', type: 'verdict', label: 'bisects?', answer: 'YES' }] };
  assert.equal(prose(p).text, 'x = 13; bisects? YES.');
  assert.equal(slotAnswer(doc05().slots[2]), 'm∠ABD = 81, m∠DBC = 81');
});

test('parseNum / numEq wrap T02 normalize (one tolerance rule)', () => {
  assert.equal(numEq(parseNum('5½'), parseNum('5.5')), true);
  assert.equal(numEq(parseNum('171.0000001'), parseNum('171')), true);
  assert.equal(numEq(parseNum('13.02'), parseNum('13')), false);
  assert.equal(numEq(13.5, 13, 0.5), true, 'floats use the tolerance');
  assert.equal(numEq(13.5, 13), false);
  assert.equal(parseNum('5,5'), null);
  assert.equal(parseNum(''), null);
});
