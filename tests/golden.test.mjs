// golden.test.mjs — T03: the exact accepted-spellings table of COMPOSED S6 through the dispatcher
// (`site/js/grader/index.js`): `9`, `9°`, `x = 3 or -1/2`, `-0.5, 3`, `(3p − 5)(p + 1)`, `-(2a+5)(3a+5)`,
// `4(b+5)(4b-5)` ok vs `(4b+20)(4b-5)` almost, `3:2`, `6:4` ok+nudge, `(-10, 45)`, `84 u`; AP-9 cancelled /
// uncancelled, `x = 17` rejected, the `6:4` nudge; `num` names every chained intermediate for wp-07; `multi`
// auto-splits `30 and 60` and diagnoses swapped fields; all 18 Kuta keys; every numeric part of the content
// round-trips its own answer; the dispatcher's wiring. T17 extends this file — do not recreate it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grade, ready, has, types, register, isFree, missing } from '../site/js/grader/index.js';
import * as factored from '../site/js/grader/factored.js';
import { rat } from '../site/js/grader/normalize.js';
import { cards, byId } from '../site/data/cards.js';
import { facCards, quadCards } from '../site/data/cards/fac.js';
import { isKnownTag } from '../site/data/misconceptions.js';

await ready;

const withCard = (id, type, idx = 0) => {
  const c = byId[id];
  assert.ok(c, `card ${id}`);
  const parts = c.parts.filter((p) => p.type === type);
  assert.ok(parts[idx], `${id} has a ${type} part`);
  return [parts[idx], { card: c, state: {} }];
};
const expect = (kind, part, raw, ctx = {}) => {
  const r = grade(part, raw, ctx);
  assert.equal(r.kind, kind, `${part.type} ${JSON.stringify(raw)} → ${r.kind}: ${r.msg}`);
  assert.notEqual(r.err, 'grader-error', r.error);
  return r;
};

// =====================================================================================
// the S6 golden table
// =====================================================================================

test('golden: 9 / 9° / 9º / 9 deg / 9 degrees are the same number', () => {
  const p = { id: 'n', type: 'num', answer: '9' };
  for (const raw of ['9', '9°', '9º', '9˚', '9 deg', '9 degrees', ' 9 ', '9.0', '9.', '= 9', 'x = 9', '18/2', '4.5*2', 9, rat(9)]) expect('correct', p, raw);
  expect('wrong', p, '-9');
  expect('malformed', p, '');
});

test('golden: `x = 3 or -1/2` and `-0.5, 3` are the roots of ang-10 / quad-02', () => {
  for (const id of ['ang-10', 'quad-02']) {
    const [p, ctx] = withCard(id, 'roots');
    for (const raw of ['x = 3 or -1/2', '-0.5, 3', 'x = 3 or x = -½', '{3, -0.5}', '3; -1/2.', 'x=3,x=-1/2']) expect('correct', p, raw, ctx);
  }
});

test('golden: the three Kuta spellings of the table — (3p − 5)(p + 1), -(2a+5)(3a+5), 4(b+5)(4b-5) ok vs (4b+20)(4b-5) almost', () => {
  const [f01] = withCard('fac-01', 'factored');
  expect('correct', f01, '(3p − 5)(p + 1)');
  const [f16] = withCard('fac-16', 'factored');
  expect('correct', f16, '-(2a+5)(3a+5)');
  const [f18] = withCard('fac-18', 'factored');
  expect('correct', f18, '4(b+5)(4b-5)');
  const almost = expect('almost', f18, '(4b+20)(4b-5)', { state: {} });
  assert.deepEqual(almost.tags, ['gcf-incomplete']);
  assert.match(almost.msg, /pull the common factor out/i);
  assert.equal(isFree(almost), true);
  const strict = expect('wrong', f18, '(4b+20)(4b-5)', { strictGCF: true });
  assert.deepEqual(strict.tags, ['missing-gcf-strict']);
  const mock = expect('wrong', f18, '(4b+20)(4b-5)', { mock: true });
  assert.deepEqual(mock.tags, ['missing-gcf-strict']);
  // the second GCF-incomplete submit on a Card is wrong
  const ctx = { state: {} };
  expect('almost', f18, '(4b+20)(4b-5)', ctx);
  const second = expect('wrong', f18, '(4b+20)(4b-5)', ctx);
  assert.deepEqual(second.tags, ['gcf-incomplete']);
});

test('golden: 3:2 ok, 6:4 ok with the nudge "simplest form is 3:2" (wp-10)', () => {
  const [p, ctx] = withCard('wp-10', 'ratio');
  const exact = expect('correct', p, '3:2', ctx);
  assert.equal(exact.nudge, false);
  assert.deepEqual(exact.tags, []);
  const nudged = expect('correct', p, '6:4', ctx);
  assert.equal(nudged.nudge, true);
  assert.match(nudged.msg, /simplest form is 3:2/);
  assert.deepEqual(nudged.tags, ['unreduced-ratio']);
  assert.equal(nudged.credit, 1);
  expect('correct', p, '54:36', ctx);
  expect('correct', p, '3 to 2', ctx);
  expect('correct', p, '3/2', ctx);
  const rev = expect('wrong', p, '2:3', ctx);
  assert.deepEqual(rev.tags, ['reversed-ratio']);
  const bare = expect('malformed', p, '1.5', ctx);
  assert.match(bare.msg, /write a ratio like 3:2/i);
  // the card's own ratio misconceptions (matched by reduced ratio): 3:7 is angle : supplement, 1:29 the raw parts
  const supp = expect('wrong', p, '3:7', ctx);
  assert.deepEqual(supp.tags, ['gave-supplement']);
  const parts = expect('wrong', p, '2:58', ctx);
  assert.deepEqual(parts.tags, ['ratio-as-measure']);
});

test('golden: (-10, 45) fills an (x, y) multi in order; on doc-07 it fills x and y and leaves the angles open', () => {
  const xy = { id: 'xy', type: 'multi', fields: [{ key: 'x', label: 'x =', answer: '-10' }, { key: 'y', label: 'y =', answer: '45' }] };
  for (const raw of ['(-10, 45)', '(−10, 45)', '-10, 45', 'x = -10, y = 45', '(-10; 45)', '-10 and 45', [-10, 45], { x: '-10', y: '45' }]) expect('correct', xy, raw);
  expect('wrong', xy, '(45, -10)');
  const [doc07, ctx] = withCard('doc-07', 'multi');
  const r = expect('almost', doc07, '(-10, 45)', ctx);
  assert.equal(r.fields[0].state, 'ok');
  assert.equal(r.fields[1].state, 'ok');
  assert.equal(r.fields[2].state, 'blank');
  assert.match(r.msg, /2 of 6 ✓/);
  expect('correct', doc07, { x: '-10', y: '45', UL: '15', UR: '165', LR: '15', LL: '165' }, ctx);
  expect('correct', doc07, ['-10', '45', '15', '165', '15', '165'], ctx);
  const sign = expect('wrong', doc07, { x: '10', y: '45', UL: '15', UR: '165', LR: '15', LL: '165' }, ctx);
  assert.deepEqual(sign.tags, ['sign-flip']);
  assert.match(sign.msg, /x = −10/);
});

test('golden: 84 u / 84 units / 84 cm / 84 are the perimeter of ang-04', () => {
  const [p, ctx] = withCard('ang-04', 'multi');
  for (const raw of ['84 u', '84 units', '84 cm', '84', '84 in', '84.0 units']) {
    const r = expect('correct', p, { n: '20', P: raw }, ctx);
    assert.equal(r.fields[1].normalized, '84');
  }
  const half = expect('wrong', p, { n: '20', P: '46' }, ctx);
  assert.deepEqual(half.tags, ['half-side-perimeter']);
  assert.match(half.msg, /half-sides/);
});

test('golden: AP-9 cancelled / uncancelled both correct, x = 17 rejected — through the dispatcher', () => {
  const [ang09, c9] = withCard('ang-09', 'equation');
  expect('correct', ang09, 'x(180-x)/(x(90-x)) = 13/4', c9);
  expect('correct', ang09, '(180-x)/(90-x) = 13/4', c9);
  expect('correct', ang09, '4x(180-x) = 13x(90-x)', c9);
  const [wp01, c1] = withCard('wp-01', 'equation');
  const r = expect('wrong', wp01, 'x = 17', c1);
  assert.deepEqual(r.tags, ['simplified-setup']);
  assert.match(r.msg, /show the 180/);
  expect('correct', wp01, '180 - x = 10 + 9x', c1);
  expect('malformed', wp01, '', c1);
});

// =====================================================================================
// num: the chained intermediates
// =====================================================================================

test('golden: num names every chained intermediate for wp-07 (supplement of the complement of 21.5)', () => {
  const [p, ctx] = withCard('wp-07', 'num');
  expect('correct', p, '111.5', ctx);
  expect('correct', p, '223/2', ctx);
  expect('correct', p, '111 1/2', ctx);
  const comp = expect('wrong', p, '68.5', ctx);
  assert.match(comp.msg, /complement/i);
  assert.match(comp.msg, /supplement of the complement/i);
  assert.match(comp.msg, /180 − 68\.5/);
  assert.ok(comp.tags.includes('stopped-early'), JSON.stringify(comp.tags));
  const angle = expect('wrong', p, '21.5', ctx);
  assert.match(angle.msg, /angle itself/i);
  assert.match(angle.msg, /keep going/i);
  assert.match(angle.msg, /complement, then its supplement/i);
  assert.ok(angle.tags.includes('gave-angle'), JSON.stringify(angle.tags));
  const supp = expect('wrong', p, '158.5', ctx);
  assert.match(supp.msg, /supplement/i);
  assert.ok(supp.tags.includes('gave-supplement'), JSON.stringify(supp.tags));
  const neg = expect('wrong', p, '-111.5', ctx);
  assert.match(neg.msg, /sign\?/i);
  assert.deepEqual(neg.tags, ['sign-flip']);
  for (const r of [comp, angle, supp, neg]) assert.ok(!/111\.5/.test(r.msg), 'never names the answer');
  expect('malformed', p, 'x', ctx);
  expect('malformed', p, '', ctx);
});

test('golden: num asks chains across the content — wp-05 (comp of the smaller), wp-12 (supp of the smaller), ang-03 (larger), ang-08 (supp)', () => {
  const [wp05, c5] = withCard('wp-05', 'num');
  expect('correct', wp05, '15', c5);
  const small = expect('wrong', wp05, '75', c5);
  assert.match(small.msg, /smaller angle/, 'the card\'s own line');
  assert.match(small.msg, /90 − 75/);
  assert.deepEqual(small.tags, ['stopped-early'], 'the card\'s own tag');
  const plain = expect('wrong', { ...wp05, misconceptions: [] }, '75');
  assert.match(plain.msg, /That's the smaller angle — the question asks for the complement of the smaller angle \(90 − 75\)/);
  assert.deepEqual(plain.tags, ['gave-smaller'], 'the grader\'s own diagnosis when the card has no line');
  const large = expect('wrong', wp05, '105', c5);
  assert.match(large.msg, /larger angle/);
  assert.ok(large.tags.includes('gave-larger'));
  const [wp12, c12] = withCard('wp-12', 'num');
  expect('correct', wp12, '176', c12);
  assert.match(expect('wrong', wp12, '4', c12).msg, /180 − 4/);
  const [ang03, c3] = withCard('ang-03', 'num');
  expect('correct', ang03, '125', c3);
  const sm = expect('wrong', ang03, '55', c3);
  assert.deepEqual(sm.tags, ['gave-smaller']);
  assert.match(sm.msg, /smaller/);
  const [ang08, c8] = withCard('ang-08', 'num');
  expect('correct', ang08, '150', c8);
  assert.deepEqual(expect('wrong', ang08, '30', c8).tags, ['gave-angle']);
  assert.deepEqual(expect('wrong', ang08, '60', c8).tags, ['gave-complement']);
  // bonus fields on ang-09 / ang-11: blank never blocks, wrong is a free almost, all right is correct
  const [ang09, c9] = withCard('ang-09', 'num');
  expect('correct', ang09, '50', c9);
  expect('correct', ang09, { value: '50', comp: '40', supp: '130' }, c9);
  const b = expect('almost', ang09, { value: '50', comp: '41' }, c9);
  assert.equal(b.main.ok, true);
  expect('wrong', ang09, { value: '40', comp: '40' }, c9);
});

// =====================================================================================
// multi: auto-split and field swap
// =====================================================================================

test('golden: multi auto-splits `30 and 60` typed into one field (free) and then grades the fill correct', () => {
  const [p, ctx] = withCard('ang-02', 'multi');
  for (const raw of [{ a: '30 and 60', b: '' }, { a: '', b: '30, 60' }, { a: '30 60', b: '' }, ['60 and 30', '']]) {
    const r = expect('almost', p, raw, ctx);
    assert.equal(r.autoSplit, true);
    assert.match(r.msg, /one number per field — filled both for you/i);
    assert.equal(isFree(r), true);
    assert.equal(Object.keys(r.fill).length, 2);
    expect('correct', p, r.fill, ctx);
  }
  // orderFree: either order
  expect('correct', p, { a: '60', b: '30' }, ctx);
  expect('correct', p, { a: '30', b: '60' }, ctx);
  expect('correct', p, '30 and 60', ctx);
  const w = expect('wrong', p, { a: '45', b: '45' }, ctx);
  assert.ok(w.tags.includes('arithmetic'), JSON.stringify(w.tags));
  const blank = expect('almost', p, { a: '30', b: '' }, ctx);
  assert.equal(blank.fields[0].state, 'ok');
  assert.equal(blank.fields[1].state, 'blank');
  expect('malformed', p, { a: '', b: '' }, ctx);
});

test('golden: multi diagnoses swapped fields (wp-01 angle/complement) with tag swapped-fields', () => {
  const [p, ctx] = withCard('wp-01', 'multi');
  expect('correct', p, { angle: '17', comp: '73' }, ctx);
  const sw = expect('wrong', p, { angle: '73', comp: '17' }, ctx);
  assert.ok(sw.tags.includes('swapped-fields'));
  assert.ok(sw.fields.every((f) => f.state === 'wrong'));
  assert.match(sw.msg, /goes in the other box/);
  // one field right, the other holding the first's answer → that field is the swap
  const one = expect('wrong', p, { angle: '17', comp: '17' }, ctx);
  assert.equal(one.fields[0].state, 'ok');
  assert.equal(one.fields[1].state, 'wrong');
  assert.equal(one.credit, 0.5);
  // the card's own field-scoped misconception beats the generic swap line
  const supp = expect('wrong', p, { angle: '163', comp: '73' }, ctx);
  assert.deepEqual(supp.tags, ['gave-supplement']);
  assert.match(supp.msg, /163 is the supplement/);
  // doc-06: angle / supplement / complement in the teacher's order, swapped supp ↔ comp
  const [d6, c6] = withCard('doc-06', 'multi');
  expect('correct', d6, { angle: '60', supp: '120', comp: '30' }, c6);
  const s6 = expect('wrong', d6, { angle: '60', supp: '30', comp: '120' }, c6);
  assert.ok(s6.tags.includes('swapped-fields') || s6.tags.includes('gave-complement'), JSON.stringify(s6.tags));
});

// =====================================================================================
// every Kuta key, every quad card, every numeric part of the content
// =====================================================================================

test('golden: all 18 Kuta keys are correct through the dispatcher, with ≥ 4 accepted rewrites each and every card misconception wrong with its tag', () => {
  for (const c of facCards) {
    const p = c.parts[0];
    const ctx = { card: c, state: {} };
    const key = p.answer;
    const ascii = key.replace(/−/g, '-');
    const m = /^(-?\d*)\(([^)]+)\)\(([^)]+)\)$/.exec(ascii.replace(/\s+/g, ''));
    assert.ok(m, `${c.id} key shape: ${key}`);
    const [, cs, f1, f2] = m;
    const rewrites = [key, `${cs}(${f2})(${f1})`, `${cs === '' ? '' : cs === '-' ? '-1*' : cs + '*'}(${f1})*(${f2})`, `${cs}(${f1})(${f2})`.toUpperCase(), `${cs}((${f1}))(${f2})`, `${cs}(${f1})(${f2}) = 0`];
    for (const raw of rewrites) {
      const r = expect('correct', p, raw, ctx);
      assert.equal(r.credit, 1);
    }
    for (const mis of c.misconceptions) {
      const r = expect('wrong', p, mis.answer, ctx);
      assert.deepEqual(r.tags, [mis.tag], `${c.id} ${mis.answer}`);
      assert.equal(r.msg, mis.msg);
    }
    expect('wrong', p, p.target.replace(/\^2/, '²'), ctx);
    const preview = factored.preview(p, key);
    assert.equal(preview.match, true, `${c.id} preview`);
  }
});

test('golden: fac-16 sign forms and the S3 form rules (typed-back, rational, reducible, wrong letter, roots) through the dispatcher', () => {
  const [f16, c16] = withCard('fac-16', 'factored');
  for (const raw of ['−(2a + 5)(3a + 5)', '(-2a-5)(3a+5)', '(2a+5)(-3a-5)', '-1(2a+5)(3a+5)', '-(3a+5)(2a+5)', '(−2a − 5)(3a + 5)']) expect('correct', f16, raw, c16);
  assert.deepEqual(expect('wrong', f16, '(2a+5)(3a+5)', c16).tags, ['sign-whole']);
  const [f01, c01] = withCard('fac-01', 'factored');
  assert.deepEqual(expect('wrong', f01, '3p^2-2p-5', c01).tags, ['not-factored']);
  assert.deepEqual(expect('wrong', f01, '(3p^2-2p-5)', c01).tags, ['not-factored']);
  assert.deepEqual(expect('almost', f01, '3(p − 5/3)(p + 1)', c01).tags, ['rational-coeff']);
  assert.match(expect('almost', f01, '3(p − 5/3)(p + 1)', c01).msg, /multiply the 3 in/);
  assert.deepEqual(expect('wrong', f01, 'p = 5/3 or p = -1', c01).tags, ['typed-roots']);
  assert.match(expect('wrong', f01, 'p = 5/3 or p = -1', c01).msg, /factored form, not the roots/);
  const wv = expect('malformed', f01, '(3x-5)(x+1)', c01);
  assert.match(wv.msg, /use the variable p/i);
  const card = expect('wrong', f01, '(3p+5)(p-1)', c01);
  assert.deepEqual(card.tags, ['middle-term'], 'the card\'s own misconception line wins');
  assert.match(card.msg, /Swap the signs/);
  const mism = expect('wrong', f01, '(3p-1)(p+5)', c01);
  assert.match(mism.msg, /expands to 3p² \+ 14p − 5, but the original is 3p² − 2p − 5/);
  assert.deepEqual(mism.tags, ['middle-term']);
  const [f02, c02] = withCard('fac-02', 'factored');
  const shown = expect('wrong', f02, '(2n−3)(n−3)', c02);
  assert.match(shown.msg, /expands to 2n² − 9n \+ 9, but the original is 2n² \+ 3n − 9/);
  assert.deepEqual(expect('almost', { id: 'q', type: 'factored', var: 'x', target: 'x^4-5x^2+4' }, '(x^2-1)(x^2-4)').tags, ['reducible-factor']);
  // typed generator vectors grade like strings
  expect('correct', { type: 'factored', var: 'n', target: [2, 3, -9] }, [[2, -3], [1, 3]]);
  expect('correct', { type: 'factored', var: 'k', target: '9k^2+66k+21' }, { c: 3, factors: [[3, 1], [1, 7]] });
});

test('golden: every numeric part of every card round-trips its own answer through the dispatcher as `correct`', () => {
  let n = 0;
  const build = (p) => {
    switch (p.type) {
      case 'num': return Array.isArray(p.bonus) && p.bonus.length ? { value: p.answer, ...Object.fromEntries(p.bonus.map((b) => [b.key, b.answer])) } : p.answer;
      case 'multi': return Object.fromEntries(p.fields.map((f) => [f.key, f.answer]));
      case 'roots': return p.answer;
      case 'reject': return { keep: p.valid ?? [], reject: p.rejected ?? [], reason: p.reason ?? p.reasonKey };
      case 'cases': return p.rows;
      case 'ratio': return p.answer;
      case 'factored': return p.answer;
      case 'equation':
        if (p.text) return p.text;
        if (p.canonical) return `${p.canonical} = 0`;
        if (Array.isArray(p.system)) return p.system.map((s) => `${s} = 0`).join(', ');
        return null;
      default: return undefined;
    }
  };
  for (const c of cards) {
    for (const p of c.parts) {
      const raw = build(p);
      if (raw === undefined) continue;
      assert.notEqual(raw, null, `${c.id}/${p.id}: no answer to round-trip`);
      const r = grade(p, raw, { card: c, state: {} });
      assert.equal(r.kind, 'correct', `${c.id}/${p.id} (${p.type}) ${JSON.stringify(raw)} → ${r.kind}: ${r.msg}`);
      assert.equal(r.ok, true);
      assert.equal(r.credit, 1);
      n++;
    }
  }
  assert.ok(n >= 60, `round-tripped ${n} parts`);
  for (const q of quadCards) expect('correct', q.parts[0], q.parts[0].answer.join(', '), { card: q });
});

test('golden: every numeric misconception in the content (num / multi / roots / cases / reject) grades wrong with its own tag and message', () => {
  const NUMERIC = new Set(['num', 'multi', 'roots', 'cases', 'reject']);
  let n = 0;
  for (const c of cards) {
    for (const m of c.misconceptions ?? []) {
      const p = c.parts.find((x) => x.id === m.part);
      if (!p || !NUMERIC.has(p.type) || !m.tag) continue;
      const ctx = { card: c, state: {} };
      let raw;
      if (p.type === 'num') raw = m.answer;
      else if (p.type === 'multi') {
        const key = m.field ?? p.fields.find((f) => String(f.answer) !== String(m.answer))?.key ?? p.fields[0].key;
        raw = { [key]: m.answer };
      } else if (p.type === 'roots') raw = m.answer;
      else if (p.type === 'cases') {
        // "3" (a found root alone) is the missing-case path; a cell value goes into the first non-x column of the first row
        const xKey = p.of ?? 'x';
        const rowFor = p.rows.find((r) => String(r[xKey]) === String(m.answer));
        if (rowFor) { raw = [rowFor]; ctx.state[`${p.id}:missingCase`] = 1; } else raw = [{ ...p.rows[0], [p.cols[1].key]: m.answer }];
      } else if (p.type === 'reject') {
        const mm = /^(keep|reject)\s+(.+)$/.exec(m.answer);
        assert.ok(mm, `${c.id} reject misconception ${m.answer}`);
        const keep = [...(p.valid ?? [])], rej = [...(p.rejected ?? [])];
        if (mm[1] === 'keep') { rej.splice(rej.indexOf(mm[2]), 1); keep.push(mm[2]); } else { keep.splice(keep.indexOf(mm[2]), 1); rej.push(mm[2]); }
        raw = { keep, reject: rej, reason: p.reason };
      }
      const r = grade(p, raw, ctx);
      assert.notEqual(r.kind, 'correct', `${c.id}/${m.part} ${m.answer} must not be correct`);
      assert.ok(r.tags.includes(m.tag), `${c.id}/${m.part} ${m.answer} → ${r.kind} tags ${JSON.stringify(r.tags)} (want ${m.tag}): ${r.msg}`);
      assert.ok(r.msg.includes(m.msg) || r.msg === m.msg, `${c.id}/${m.part} ${m.answer}: card message used`);
      n++;
    }
  }
  assert.ok(n >= 30, `checked ${n} misconceptions`);
});

// =====================================================================================
// the dispatcher
// =====================================================================================

test('dispatcher: every S3 part type is registered (T03 statically, T04/T05 lazily) and nothing failed to load', () => {
  for (const t of ['num', 'multi', 'roots', 'reject', 'cases', 'ratio', 'equation', 'factored']) assert.ok(has(t), t);
  for (const t of ['pairs', 'asn', 'mc', 'strip', 'notation', 'term', 'cloze', 'classify', 'termmatch']) assert.ok(has(t), `${t} loaded lazily`);
  assert.deepEqual(missing, []);
  assert.ok(types().length >= 17);
  assert.ok(has('type-term') && has('fill-justify'), 'S3 aliases');
});

test('dispatcher: an unknown type, a null part, or a grader that throws come back as malformed — never an exception', () => {
  const unknown = grade({ type: 'hologram' }, 'x');
  assert.equal(unknown.kind, 'malformed');
  assert.equal(unknown.err, 'no-grader');
  assert.equal(grade(null, 'x').err, 'no-grader');
  assert.equal(grade(undefined).err, 'no-grader');
  register('boom', () => { throw new Error('kaboom'); });
  const boom = grade({ type: 'boom' }, 'x');
  assert.equal(boom.kind, 'malformed');
  assert.equal(boom.err, 'grader-error');
  assert.equal(boom.error, 'kaboom');
  assert.equal(isFree(boom), true);
  // a pairs part with no figure would throw inside T04's grader — the dispatcher still returns a result
  const pairs = grade({ type: 'pairs', relation: 'vertical', count: 1 }, [['AFE', 'CFD']]);
  assert.equal(pairs.kind, 'malformed');
});

test('dispatcher: the result shape is always complete and credit is clamped', () => {
  register('half', () => ({ ok: true, credit: 7 }));
  const r = grade({ type: 'half' }, '');
  assert.equal(r.kind, 'correct');
  assert.equal(r.credit, 1);
  assert.deepEqual(r.tags, []);
  assert.equal(r.normalized, null);
  assert.equal(typeof r.msg, 'string');
  register('neg', () => ({ kind: 'wrong', credit: -2 }));
  assert.equal(grade({ type: 'neg' }, '').credit, 0);
  register('nothing', () => undefined);
  assert.equal(grade({ type: 'nothing' }, '').err, 'bad-result');
});

test('dispatcher: ctx.state is created on the ctx and shared across submits (second subset submit is wrong); sandbox never escalates', () => {
  const [p] = withCard('ang-10', 'roots');
  const ctx = {};
  assert.equal(grade(p, '3', ctx).kind, 'almost');
  assert.ok(ctx.state && typeof ctx.state === 'object');
  assert.equal(grade(p, '3', ctx).kind, 'wrong');
  const sandbox = { sandbox: true };
  for (let i = 0; i < 3; i++) assert.equal(grade(p, '3', sandbox).kind, 'almost');
  assert.equal(grade(p, '3', { mock: true }).kind, 'wrong');
  // ctx.mock implies strictGCF
  const [f18] = withCard('fac-18', 'factored');
  const mock = { mock: true };
  grade(f18, '(4b+20)(4b-5)', mock);
  assert.equal(mock.strictGCF, true);
});

test('dispatcher: a strip routes its num / multi slots through the dispatcher (T05\'s ctx.gradePart seam)', () => {
  const [strip, ctx] = withCard('doc-05', 'strip');
  const EQ = strip.slots[0].answer;
  const r = grade(strip, { eq: EQ, x: '13', halves: { ABD: '81', DBC: '81' } }, ctx);
  assert.equal(r.kind, 'correct');
  assert.equal(r.next, 'verdict');
  assert.equal(typeof ctx.gradePart, 'function');
  const swapped = grade(strip, { eq: EQ, x: '13', halves: { ABD: '81', DBC: '80' } }, { card: byId['doc-05'] });
  assert.equal(swapped.kind, 'wrong');
  const neg = grade(strip, { eq: EQ, x: '-13' }, { card: byId['doc-05'] });
  assert.equal(neg.kind, 'wrong');
  assert.ok(neg.tags.includes('sign-flip'), JSON.stringify(neg.tags));
});

test('dispatcher: hostile input to every numeric type is graded, never thrown, and never correct', () => {
  const parts = [
    { type: 'num', answer: '9' },
    { type: 'multi', fields: [{ key: 'a', answer: '1' }, { key: 'b', answer: '2' }] },
    { type: 'roots', answer: ['3', '-1/2'] },
    { type: 'reject', valid: ['3'], rejected: ['-2'], reason: 'negative length' },
    { type: 'cases', of: 'x', cols: [{ key: 'x' }, { key: 'y' }], rows: [{ x: '3', y: '9' }] },
    { type: 'ratio', answer: '3:2' },
    { type: 'equation', var: 'x', canonical: '180-x-(10+9x)', mustMention: [180] },
    { type: 'factored', var: 'p', target: '3p^2-2p-5' },
  ];
  const hostile = [null, undefined, '', '   ', 42, -0, NaN, Infinity, {}, [], [null], { ok: true }, 'NaN', 'null', '((((', '1/0', '--5', 'x^-2', '😀', 'π', '2^^3',
    '('.repeat(5000), '9'.repeat(100000), 'x'.repeat(3000), ',,,,', '= = =', 'and or and', '{', '}', '[[[]]]', '3 4', '5,5', '1e3', true, () => 1, Symbol('s'), new Date(0)];
  const t0 = Date.now();
  let calls = 0;
  for (const p of parts) {
    for (const raw of hostile) {
      let r;
      try { r = grade(p, raw, { state: {} }); } catch (e) { assert.fail(`${p.type} threw on ${String(raw)}: ${e.message}`); }
      assert.ok(r && ['correct', 'wrong', 'almost', 'malformed'].includes(r.kind), `${p.type} ${String(raw)}`);
      assert.notEqual(r.err, 'grader-error', `${p.type} ${String(raw)}: ${r.error}`);
      assert.notEqual(r.kind, 'correct', `${p.type} ${String(raw)} must not be correct`);
      calls++;
    }
  }
  assert.ok(calls > 250);
  assert.ok(Date.now() - t0 < 3000, `bounded: ${Date.now() - t0} ms for ${calls} calls`);
});

test('golden: every tag emitted across the golden run is in the misconception catalogue', () => {
  const seen = new Set();
  const collect = (r) => (r.tags ?? []).forEach((t) => seen.add(t));
  const [wp07, c7] = withCard('wp-07', 'num');
  for (const raw of ['68.5', '21.5', '158.5', '-111.5']) collect(grade(wp07, raw, c7));
  const [wp01m, c1] = withCard('wp-01', 'multi');
  collect(grade(wp01m, { angle: '73', comp: '17' }, c1));
  const [wp01e] = withCard('wp-01', 'equation');
  for (const raw of ['x = 17', '90 - x = 10 + 9x']) collect(grade(wp01e, raw, {}));
  const [wp10] = withCard('wp-10', 'ratio');
  for (const raw of ['6:4', '2:3']) collect(grade(wp10, raw));
  const [f18] = withCard('fac-18', 'factored');
  for (const raw of ['(4b+20)(4b-5)', '(b+5)(4b-5)', '4(b+5)(4b-5)(b-1)', 'b = -5 or b = 5/4', '16b^2+60b-100', '4(b − 5/4)(4b + 20)']) collect(grade(f18, raw, { state: {} }));
  collect(grade(f18, '(4b+20)(4b-5)', { strictGCF: true }));
  for (const t of seen) assert.ok(isKnownTag(t), `tag ${t} is catalogued`);
  assert.ok(seen.size >= 10, [...seen].join(','));
});
