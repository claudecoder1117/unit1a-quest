// card-r2.test.mjs — Card screen + widgets, visual QA fix round 2: the reject menu dedupes by reason id and
// caps at six; the cases second-miss line is one line; a one-sided field swap keeps the num diagnosis (S9 #4);
// a multi field label carries its wedge's expression; and source pins for the DOM-only fixes (the pairs
// verdict strip under the figure, the equation hint leaving the flow, "next Page", the card r2 CSS block).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { menu, reasonId, REASONS, MENU_MAX } from '../site/js/grader/reject.js';
import { grade as gradeCases } from '../site/js/grader/cases.js';
import { grade as gradeMulti } from '../site/js/grader/multi.js';
import { wedgeExpr } from '../site/js/widgets/multi.js';
import { getCard } from '../site/data/cards.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const partOf = (id, type) => getCard(id).parts.find((p) => p.type === type || p.id === type);

test('card r2 / reject menu: ang-04 — six chips, no two with the same meaning, the item wording wins', () => {
  const p = partOf('ang-04', 'reject');
  const m = menu(p).map((c) => c.text);
  assert.ok(m.length <= MENU_MAX && m.length >= 4, `menu of ${m.length}: ${m.join(' | ')}`);
  const ids = m.map((t) => reasonId(t).id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length, `two chips share a reason id: ${m.join(' | ')}`);
  assert.ok(m.includes('negative side length') && !m.includes('negative length'), 'the item\'s wording stands for negative-length');
  assert.ok(m.includes('both values work') && !m.includes('both valid'), 'the item\'s distractor stands for both-valid');
  assert.ok(m.includes('−2 does not satisfy the equation') && !m.includes("doesn't satisfy the equation"));
  assert.ok(m.includes('5 is too big for a side'), 'an id-less distractor stays');
});

test('card r2 / reject menu: every shipped reject part — ≤ 6 chips, unique meanings, the expected reason present', () => {
  let n = 0;
  for (const id of ['ang-04', 'ang-05', 'ang-09', 'ang-10', 'wp-12', 'wp-16']) {
    const c = getCard(id);
    const p = c?.parts.find((x) => x.type === 'reject');
    if (!p) continue;
    n++;
    const m = menu(p).map((x) => x.text);
    assert.ok(m.length <= MENU_MAX, `${id}: ${m.length} chips`);
    const ids = m.map((t) => reasonId(t).id).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length, `${id}: duplicate meaning in ${m.join(' | ')}`);
    if (p.reason) assert.ok(m.includes(String(p.reason)), `${id}: the item reason is a chip`);
    assert.ok(REASONS.some((r) => m.includes(r.text)), `${id}: at least one generic entry`);
  }
  assert.ok(n >= 3, 'the sweep covered the reject cards');
});

test('card r2 / cases: the second missing-case miss prints the item line OR the widget line, never both', () => {
  const p = partOf('ang-10', 'cases');
  const c = getCard('ang-10');
  const row = { x: '3', CFD: '9', DFE: '171' };
  const withItem = { state: {}, misconceptions: c.misconceptions, card: c };
  gradeCases(p, [row], withItem);
  const second = gradeCases(p, [row], withItem);
  assert.equal(second.kind, 'wrong');
  assert.equal(second.msg, 'Two roots, two cases — work out m∠CFD and m∠DFE for x = −1/2 as well.');
  assert.ok(!/what if/i.test(second.msg), 'the widget line is not prefixed when the item names the case itself');
  const plain = { state: {} };
  gradeCases(p, [row], plain);
  const second2 = gradeCases(p, [row], plain);
  assert.match(second2.msg, /^What if x = −1\/2\? Work out that case too\.$/);
});

test('card r2 / multi (S9 #4): 73 in wp-01\'s angle box teaches "the question asks for the angle", not the box line', () => {
  const c = getCard('wp-01');
  const p = c.parts.find((x) => x.type === 'multi');
  const ctx = { card: c, misconceptions: c.misconceptions };
  const one = gradeMulti(p, { angle: '73', comp: '' }, ctx);
  assert.equal(one.kind, 'wrong');
  assert.deepEqual(one.tags, ['gave-complement']);
  assert.match(one.msg, /That's the complement — the question asks for the angle/);
  assert.ok(!/other box/.test(one.msg), one.msg);
  // a TRUE mutual swap is still the swap line on both boxes
  const both = gradeMulti(p, { angle: '73', comp: '17' }, ctx);
  assert.deepEqual(both.tags, ['swapped-fields']);
  assert.match(both.msg, /goes in the other box/);
});

test('card r2 / multi widget: a wedge field label carries the wedge\'s printed expression (doc-07)', () => {
  const c = getCard('doc-07');
  const ctx = { card: c, figure: c.figure };
  assert.equal(wedgeExpr(ctx, 'UL'), '3x + y');
  assert.equal(wedgeExpr(ctx, 'UR'), '4y + x − 5');
  assert.equal(wedgeExpr(ctx, 'LR'), '4x + y + 10');
  assert.equal(wedgeExpr(ctx, 'LL'), null, 'the blank lower-left wedge adds nothing');
  assert.equal(wedgeExpr({}, 'UL'), null, 'a figure-less card adds nothing');
  assert.equal(wedgeExpr(ctx, undefined), null);
  assert.equal(wedgeExpr({ figure: getCard('doc-05').figure }, 'A-D'), '5x + 16', 'an angle-id ref resolves too');
});

test('card r2 / source pins: pairs strip under the figure, equation hint leaves the flow, "next Page", CSS block', () => {
  const pairs = read('site/js/widgets/pairs.js');
  assert.match(pairs, /function figNote\(state, text\)/, 'pairs mirrors the verdict under the figure');
  assert.match(pairs, /svg\.closest\?\.\('\.card-figure'\)/, 'anchored to the screen\'s figure box');
  assert.match(pairs, /figNote\(st, text\)/, 'every committed pair updates the strip');
  assert.match(pairs, /w\.dataset\.state = st;/, 'wedge groups carry data-state');
  const eq = read('site/js/widgets/equation.js');
  assert.match(eq, /hintEl\.hidden = true;/, 'the emptied hint leaves the flow after a verdict');
  assert.match(eq, /hintEl\.hidden = false;/, 'and comes back on the next keystroke');
  const card = read('site/js/screens/card.js');
  assert.match(card, /r\.due <= Date\.now\(\) \? 'next Page' : fmtDue\(r\.due\)/, 'a due-now clear never prints "today"');
  assert.match(card, /'Setup · optional'/, 'the compact setup label');
  assert.match(card, /box\.dataset\.prompt = 'default'/, 'the generic setup prompt is dropped from the compact row');
  const asn = read('site/js/widgets/asn.js');
  assert.match(asn, /const lineState = res\.stage === 'reason' && !res\.verdictOk && res\.reasonOk \? 'ok' : state;/, 'a right chip after a wrong verdict reads ✓ on its line');
  const css = read('site/css/polish.css');
  assert.match(css, /\/\* === card r2 === /, 'the card r2 block exists');
  assert.match(css, /\.w-pairs-figmsg \{/, 'pairs strip styled');
  assert.match(css, /\.w-field\[data-state="ok"\] \.w-mark \{ color: var\(--ok-ink/, 'field ✓ at text grade');
  assert.match(css, /--silver-ink: #5E6978/, 'silver text token');
  assert.match(css, /\.w-dock-actions \.card-continue \{ flex: 1 1 100%; max-width: none; \}/, 'Continue fills the dock row');
  assert.match(css, /\.card-part\[data-optional="true"\] \.w-equation \{\s*display: grid;/, 'compact setup grid');
  assert.match(css, /\.card-figure, \.card-figure \.fig \{ max-height: 300px; \}/, '≥ 1024 figure cap');
});
