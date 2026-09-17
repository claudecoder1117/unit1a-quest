// equation.test.mjs — T03: the `equation` grader (COMPOSED S3 "Parts · equation", S6 test list):
// equivalent setups incl. cross-multiplied ratios and AP-9 cancelled/uncancelled; colon ratios
// `(180−x):(90−x) = 5:2`; the two-equation system `x + y = 90, y = 2x` for ang-02; `x = 17` / `2x = 34` /
// `x = x` rejected; the 40 % / 60 % credit split under ctx.mock; and every setup part of the content
// (canonical, alternates, misconceptions) graded through the real grader.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as equation from '../site/js/grader/equation.js';
import { combineCredit, shareOf, grade as dispatch, ready } from '../site/js/grader/index.js';
import { cards, byId } from '../site/data/cards.js';
import { isKnownTag } from '../site/data/misconceptions.js';

await ready;

const setup = (id) => {
  const c = byId[id];
  assert.ok(c, `card ${id}`);
  const p = c.parts.find((x) => x.type === 'equation');
  assert.ok(p, `${id} has an equation part`);
  return { ...p, misconceptions: c.misconceptions };
};
const g = (id, raw, ctx) => equation.grade(setup(id), raw, ctx);
const ok = (id, raw, ctx) => {
  const r = g(id, raw, ctx);
  assert.equal(r.kind, 'correct', `${id} ${JSON.stringify(raw)} → ${r.kind}: ${r.msg}`);
  assert.equal(r.ok, true);
  assert.equal(r.credit, 1);
  return r;
};
const wrong = (id, raw, tag, ctx) => {
  const r = g(id, raw, ctx);
  assert.equal(r.kind, 'wrong', `${id} ${JSON.stringify(raw)} → ${r.kind}: ${r.msg}`);
  if (tag) assert.ok(r.tags.includes(tag), `${id} ${JSON.stringify(raw)} tags ${JSON.stringify(r.tags)} should include ${tag}`);
  return r;
};
const malformed = (id, raw, err) => {
  const r = g(id, raw);
  assert.equal(r.kind, 'malformed', `${id} ${JSON.stringify(raw)} → ${r.kind}: ${r.msg}`);
  if (err) assert.equal(r.err, err);
  return r;
};

// =====================================================================================
// equivalent setups
// =====================================================================================

test('equation: wp-01 — every equivalent spelling of 180 − x = 10 + 9x is a correct setup', () => {
  for (const raw of ['180 - x = 10 + 9x', '180 − x = 9x + 10', '10 + 9x = 180 - x', '180 = 10 + 9x + x', '180-x-10-9x = 0',
    '0 = 9x + 10 - (180 - x)', '(180 - x) = (9x + 10)', '180 - x = 10 + 9x, x = 17', '2(180 - x) = 2(10 + 9x)', '180 - X = 10 + 9X']) {
    const r = ok('wp-01', raw);
    assert.equal(r.matched, 'canonical');
  }
  const alt = ok('wp-01', '180 - (90 - x) = 10 + 9(90 - x)');
  assert.equal(alt.matched, 'alternate', 'x = the complement is an accepted naming');
});

test('equation: colon ratios — (180−x):(90−x) = 5:2, the slash form and the cross-multiplied form all match ang-08', () => {
  for (const raw of ['(180−x):(90−x) = 5:2', '(180 - x) : (90 - x) = 5 : 2', '(180-x)/(90-x) = 5/2', '2(180-x) = 5(90-x)', '5(90 - x) = 2(180 - x)', '(180-x)/(90-x) = 2.5']) ok('ang-08', raw);
  const rev = wrong('ang-08', '5(180-x)=2(90-x)', 'reversed-ratio');
  assert.match(rev.msg, /cross-multiplies/);
  wrong('ang-08', '(180-x):(90-x) = 2:5', 'reversed-ratio');
  malformed('ang-08', '180-x:90-x:5 = 2');
});

test('equation: AP-9 — the cancelled and uncancelled forms are both correct (the common x is cancelled, then cross-multiplied)', () => {
  for (const raw of ['x(180-x)/(x(90-x)) = 13/4', '(180-x)/(90-x) = 13/4', '4x(180-x) = 13x(90-x)', '4(180-x) = 13(90-x)',
    'x(180-x):x(90-x) = 13:4', '(180−x):(90−x) = 13:4']) {
    ok('ang-09', raw);
  }
  // the expanded / simplified forms are equivalent but no longer show the 180 and the 90 — the structural guard
  for (const raw of ['720x - 4x^2 = 1170x - 13x^2', '9x^2 - 450x = 0', '9x(x - 50) = 0']) {
    const r = wrong('ang-09', raw, 'simplified-setup');
    assert.equal(r.matched, 'canonical');
  }
  wrong('ang-09', '13x(180-x)=4x(90-x)', 'reversed-ratio');
  wrong('ang-09', 'x(180-x)/(x(90-x)) = 4/13', 'reversed-ratio');
});

test('equation: ratio word problems (wp-05, wp-10, wp-11, wp-14, wp-16) accept the fraction, colon and cross-multiplied setups', () => {
  ok('wp-05', 'x/(180-x) = 5/7'); ok('wp-05', 'x:(180-x) = 5:7'); ok('wp-05', '7x = 5(180 - x)'); ok('wp-05', '5x + 7x = 180');
  ok('wp-10', 'x/(180 − x) = 3/7'); ok('wp-10', '7x = 3(180-x)'); ok('wp-10', '3x + 7x = 180');
  ok('wp-11', '(180 − x)/(90 − x) = 7/2'); ok('wp-11', '2(180-x) = 7(90-x)'); ok('wp-11', '(180-x):(90-x)=7:2');
  ok('wp-14', '((90-x)/2 - 1)/x = 1/2'); ok('wp-14', '(½(90 − x) − 1) : x = 1 : 2'); ok('wp-14', '2((90-x)/2 - 1) = x');
  ok('wp-16', '(x+6)/(180-(90-x)-4) = 1/5'); ok('wp-16', '5(x+6) = 180-(90-x)-4');
});

test('equation: nested and product setups (doc-06, wp-03, wp-12, ang-10, ang-04, ang-05) in several spellings', () => {
  ok('doc-06', '180 - x = 30 + 3(90 - x)'); ok('doc-06', '180 − x = 3(90 − x) + 30');
  ok('wp-03', 'x + (90 - x) = 6 + (180 - x)/2'); ok('wp-03', '90 = 6 + ½(180 − x)'); ok('wp-03', 'x + 90 - x = 6 + 1/2(180-x)');
  ok('wp-12', 'x(90-x) = 344'); ok('wp-12', '90x - x^2 = 344'); ok('wp-12', 'x(90 - x) - 344 = 0');
  ok('ang-10', '2x^2 - 4x + 3 - x + 84 = 90'); ok('ang-10', '(−x + 84) + (2x² − 4x + 3) = 90'); ok('ang-10', '2x^2 - 5x + 87 = 90');
  ok('ang-04', 'm^2 - 6 = 3m + 4'); ok('ang-04', '3m + 4 = m² − 6');
  ok('ang-05', 'x^2 + 3 + 11 - 7x = 6 - 16x'); ok('ang-05', '(x² + 3) + (11 − 7x) = 6 − 16x');
});

// =====================================================================================
// systems
// =====================================================================================

test('equation: ang-02 — the two-equation system x + y = 90, y = 2x is accepted (and, / and / ; separators)', () => {
  for (const raw of ['x + y = 90, y = 2x', 'x + y = 90 and y = 2x', 'x + y = 90; y = 2x', 'y = 2x, x + y = 90', 'x+y=90\ny=2x', '2x = y, 90 = x + y']) {
    const r = ok('ang-02', raw);
    assert.equal(r.system, true);
    assert.equal(r.matched, 'system');
  }
  // x named as the larger angle: the alternate canonical (x + x/2 = 90) makes the swapped solution acceptable
  ok('ang-02', 'x + y = 90, x = 2y');
  ok('ang-02', 'x + x/2 = 90');
  ok('ang-02', 'x + 2x = 90');
});

test('equation: a wrong, dependent or inconsistent system is wrong; a lone two-variable equation is malformed (free)', () => {
  const r = wrong('ang-02', 'x + y = 90, y = 3x');
  assert.match(r.msg, /x = 22.5, y = 67.5/);
  wrong('ang-02', 'x + y = 180, y = 2x');
  const dep = wrong('ang-02', 'x + y = 90, 2x + 2y = 180');
  assert.match(dep.msg, /same thing/);
  const inc = wrong('ang-02', 'x + y = 90, x + y = 80');
  assert.match(inc.msg, /contradict/);
  const lone = malformed('ang-02', 'x + y = 90', 'two-vars');
  assert.match(lone.msg, /two equations/i);
  malformed('wp-01', '180 - x = 10 + 9y', 'two-vars');
  malformed('ang-02', 'x + y = 90, y = 2z');
  malformed('ang-02', 'x + y = 90, y = 2x, x = 30');
  malformed('ang-02', 'xy = 90, y = 2x');
});

test('equation: doc-07 — a canonical system (vertical pair + linear pair) in either order; traps and simplified systems are wrong', () => {
  ok('doc-07', '3x + y = 4x + y + 10, 3x + y + 4y + x - 5 = 180');
  ok('doc-07', '3x+y=4x+y+10; (3x+y)+(4y+x-5)=180');
  ok('doc-07', '(3x+y)+(4y+x-5)=180 and 3x+y=4x+y+10');
  const trap = wrong('doc-07', '3x+y+4x+y+10=180, 3x+y=4y+x-5', 'vertical-set-180');
  assert.match(trap.msg, /VERTICAL/);
  const lone = wrong('doc-07', '3x+y+4x+y+10=180', 'vertical-set-180');
  assert.match(lone.msg, /VERTICAL/);
  wrong('doc-07', '3x+y=4y+x-5, 3x + y = 4x + y + 10', 'linear-pair-set-equal');
  const simplified = wrong('doc-07', '3x = 4x + 10, 4x + 5y = 185', 'simplified-setup');
  assert.match(simplified.msg, /show the 180/);
  malformed('doc-07', '3x + y = 4x + y + 10', 'two-vars');
  const other = wrong('doc-07', '3x + y = 4x + y + 10, 4y + x - 5 = 4x + y + 10');
  assert.match(other.msg, /x = −10, y = −5/);
});

// =====================================================================================
// rejected forms and the structural guard
// =====================================================================================

test('equation: x = 17 / 2x = 34 / 170 = 10x are rejected — "write the equation before simplifying — it should still show the 180"', () => {
  for (const raw of ['x = 17', '2x = 34', '170 = 10x', '10x = 170', 'x - 17 = 0']) {
    const r = wrong('wp-01', raw, 'simplified-setup');
    assert.match(r.msg, /before simplifying/);
    assert.match(r.msg, /show the 180/);
    assert.equal(r.matched, 'canonical', 'it IS equivalent — only the guard fails it');
  }
  // an item that must mention both 180 and 90
  const r = wrong('wp-02', '4x = 208', 'simplified-setup');
  assert.match(r.msg, /180 and the 90/);
  // the ang-02 card lists "3x = 90" as its own simplified-setup trap (90 is still shown, so only the card catches it)
  const c = wrong('ang-02', '3x = 90', 'simplified-setup');
  assert.match(c.msg, /x \+ 2x = 90/);
  ok('ang-02', 'x + 2x = 90');
});

test('equation: x = x, 180 = 180, an expression without =, an empty field, the wrong letter', () => {
  const triv = wrong('wp-01', 'x = x');
  assert.match(triv.msg, /true for every x/);
  wrong('wp-01', '180 - x = 180 - x');
  malformed('wp-01', '180 = 180', 'no-var');
  malformed('wp-01', '180 - x', 'no-equals');
  malformed('wp-01', '', 'empty');
  malformed('wp-01', '   ', 'empty');
  malformed('wp-01', null, 'empty');
  const wv = malformed('wp-01', '180 - y = 10 + 9y', 'wrong-var');
  assert.match(wv.msg, /use the variable x/i);
  malformed('ang-04', 'x^2 - 6 = 3x + 4', 'wrong-var');
  malformed('wp-01', '180 - x = = 10', 'equals');
  malformed('wp-01', '180 - x = 10 + 9x = 0', 'equals');
  const cancels = wrong('wp-09', '(180 - x) - (180 - (90 - x)) = 90');
  assert.ok(cancels.msg.length > 0);
});

test('equation: wrong-equation feedback solves a degree-1 equation ("That gives x = …") and names the 90/180 mix-up', () => {
  const r = wrong('wp-01', '180 - x = 10 + 8x');
  assert.match(r.msg, /That gives x = 170\/9 — check which side is the supplement/);
  assert.equal(r.solved, '170/9');
  const r2 = wrong('wp-04', 'x = 6 + 2(90 - x) + 1');
  assert.match(r2.msg, /That gives x = /);
  assert.match(r2.msg, /complement/);
  // the 90 ↔ 180 swap is detected without a card misconception
  const plain = { id: 'setup', type: 'equation', var: 'x', canonical: '180-x-(10+9x)', mustMention: [180] };
  const s90 = equation.grade(plain, '90 - x = 10 + 9x');
  assert.equal(s90.kind, 'wrong');
  assert.deepEqual(s90.tags, ['used-90-for-supp']);
  assert.match(s90.msg, /Supplementary angles add to 180/);
  const comp = { id: 'setup', type: 'equation', var: 'x', canonical: 'x-(6+2(90-x))', mustMention: [90] };
  const s180 = equation.grade(comp, 'x = 6 + 2(180 - x)');
  assert.equal(s180.kind, 'wrong');
  assert.deepEqual(s180.tags, ['used-180-for-comp']);
  // a quadratic that is simply different
  const q = wrong('wp-12', 'x(90 + x) = 344');
  assert.equal(q.solved, null);
  assert.match(q.msg, /different/);
});

test('equation: card misconceptions match by equivalence (any spelling), and the "simplified" traps by wording only', () => {
  const r = wrong('wp-01', '90 − x = 9x + 10', 'used-90-for-supp');
  assert.match(r.msg, /90 − x is the complement/);
  wrong('wp-01', '180 - x + 10 = 9x', 'wrong-side-supp');
  wrong('doc-06', '180 - x = 3(90 - x) - 30', 'wrong-side-supp');
  wrong('ang-10', '-x + 84 = 2x^2 - 4x + 3', 'linear-pair-set-equal');
  wrong('ang-10', '−x + 84 + 2x² − 4x + 3 = 180', 'vertical-set-180');
  wrong('ang-04', 'm^2 - 6 + 3m + 4 = 0', 'midpoint-not-equal');
  wrong('ang-05', 'x^2 + 3 = 11 - 7x', 'assumed-bisects');
  wrong('wp-09', '(180 - x) - (90 - x) = 24', 'used-90-for-supp');
  // wp-01's grouping misread: it shipped as `requestedTag:'grouping'` and the Wave-1 integrator
  // added the catalogue key, so it now grades with the real tag (see notes/INTEGRATION-W1.md).
  const grouped = wrong('wp-01', '180 - x = 9(x + 10)', 'grouping');
  assert.ok(isKnownTag('grouping'), 'the grouping key must stay in the catalogue');
  assert.match(grouped.msg, /Nine times the angle/);
  // an entry with no `tag` at all still grades by message only (the shape T07 generators may emit)
  const tagless = equation.grade(
    { id: 'setup', type: 'equation', var: 'x', canonical: '180-x-(10+9x)', mustMention: [180] },
    '180 - x = 9(x + 10)',
    { misconceptions: [{ part: 'setup', answer: '180 - x = 9(x + 10)', msg: 'Nine times the angle plus ten, not nine times the sum.' }] },
  );
  assert.equal(tagless.kind, 'wrong');
  assert.deepEqual(tagless.tags, [], 'a misconception entry with no tag grades by message only');
  assert.match(tagless.msg, /Nine times the angle/);
  // the misconception "3x = 90" (ang-02) is equivalent to the answer: "x + 2x = 90" must NOT be caught by it
  ok('ang-02', 'x + 2x = 90');
  ok('ang-02', '2x + x = 90');
});

// =====================================================================================
// the Mock credit split
// =====================================================================================

test('equation: under ctx.mock the setup slot carries share 0.4 and combineCredit splits 40 % / 60 %', () => {
  const eqPart = setup('wp-01');
  const ansPart = byId['wp-01'].parts.find((p) => p.type === 'multi');
  const eqOk = equation.grade(eqPart, '180 - x = 10 + 9x', { mock: true });
  const eqBad = equation.grade(eqPart, 'x = 17', { mock: true });
  assert.equal(eqOk.share, 0.4);
  assert.equal(eqBad.share, 0.4);
  assert.equal(equation.grade(eqPart, '180 - x = 10 + 9x').share, 1);
  assert.equal(shareOf(eqPart, { mock: true }), 0.4);
  assert.equal(shareOf(ansPart, { mock: true }), 1);
  assert.equal(shareOf(eqPart, {}), 1);
  const ansOk = dispatch(ansPart, { angle: '17', comp: '73' }, { mock: true });
  const ansHalf = dispatch(ansPart, { angle: '17', comp: '70' }, { mock: true });
  const mock = { mock: true };
  assert.equal(combineCredit([{ part: eqPart, result: eqOk }, { part: ansPart, result: ansOk }], mock), 1);
  assert.equal(combineCredit([{ part: eqPart, result: eqBad }, { part: ansPart, result: ansOk }], mock), 0.6);
  assert.equal(combineCredit([{ part: eqPart, result: eqOk }, { part: ansPart, result: { credit: 0 } }], mock), 0.4);
  assert.equal(combineCredit([{ part: eqPart, result: null }, { part: ansPart, result: ansOk }], mock), 0.6, 'a blank setup in the Mock forfeits its 40 %');
  assert.ok(Math.abs(combineCredit([{ part: eqPart, result: eqOk }, { part: ansPart, result: ansHalf }], mock) - 0.7) < 1e-12);
  // on a Card the optional setup is left out when untried, and counts equally when tried
  assert.equal(combineCredit([{ part: { ...eqPart, optional: true }, result: null }, { part: ansPart, result: ansOk }], {}), 1);
  assert.equal(combineCredit([{ part: eqPart, result: eqBad }, { part: ansPart, result: ansOk }], {}), 0.5);
  assert.equal(combineCredit([], mock), 0);
});

// =====================================================================================
// every setup in the content
// =====================================================================================

test('equation: every equation part in the content — the teacher\'s setup text, its canonical and every alternate grade correct', () => {
  let n = 0;
  for (const c of cards) {
    for (const p of c.parts.filter((x) => x.type === 'equation')) {
      const part = { ...p, misconceptions: c.misconceptions };
      const forms = [];
      if (p.text) forms.push(p.text);
      if (p.canonical) forms.push(`${p.canonical} = 0`);
      for (const a of p.alternates ?? []) {
        if (typeof a === 'string') forms.push(`${a} = 0`);
        else { if (a.canonical) forms.push(`${a.canonical} = 0`); if (a.text) forms.push(a.text); }
      }
      if (Array.isArray(p.system) && p.system.length === 2) forms.push(p.system.map((s) => `${s} = 0`).join(', '));
      for (const f of forms) {
        const r = equation.grade(part, f);
        assert.equal(r.kind, 'correct', `${c.id}: ${f} → ${r.kind}: ${r.msg}`);
        n++;
      }
    }
  }
  assert.ok(n >= 50, `graded ${n} setups`);
});

test('equation: every tagged setup misconception in the content grades wrong with exactly its tag; every tag is catalogued', () => {
  let n = 0;
  for (const c of cards) {
    for (const p of c.parts.filter((x) => x.type === 'equation')) {
      const part = { ...p, misconceptions: c.misconceptions };
      for (const m of (c.misconceptions ?? []).filter((x) => x.part === p.id)) {
        const raw = String(m.answer).includes('=') ? m.answer : `${m.answer} = 0`;
        const r = equation.grade(part, raw);
        assert.equal(r.kind, 'wrong', `${c.id} misconception ${m.answer} → ${r.kind}: ${r.msg}`);
        if (m.tag) {
          assert.deepEqual(r.tags, [m.tag], `${c.id} ${m.answer}`);
          assert.ok(isKnownTag(m.tag), m.tag);
        }
        assert.ok(r.msg.startsWith(m.msg), `${c.id} ${m.answer} uses the card's message`);
        if (m.gives != null) assert.match(r.msg, new RegExp(`gives x = ${String(m.gives).replace(/^-/, '−').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
        n++;
      }
    }
  }
  assert.ok(n >= 20, `checked ${n} misconceptions`);
});

test('equation: pathological input is graded, never thrown, in bounded time', () => {
  const p = setup('wp-01');
  const t0 = Date.now();
  for (const raw of ['x'.repeat(5000), '('.repeat(3000) + 'x' + ')'.repeat(3000) + ' = 1', 'x^999999 = 1', '1/0 = x', 'x = 1/(x-x)', '180 - x = 10 + 9x = 17 = 3', ',,,', '= = =', 'and and and', 42, {}, [], true]) {
    const r = equation.grade(p, raw);
    assert.ok(r && typeof r.kind === 'string', JSON.stringify(raw));
    assert.notEqual(r.kind, 'correct');
  }
  assert.ok(Date.now() - t0 < 500, 'bounded');
});
