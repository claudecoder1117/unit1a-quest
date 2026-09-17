// widget-pairs.test.mjs — T08c. The DOM-free core of the `pairs` widget (js/widgets/pairs.js):
// the pick state machine, the side-list options, the typed-token splitter and the name resolver.
// The DOM half is checked in the browser (see notes/T08c.md); everything a test can reach without a
// document lives in the exported pure helpers, and this file is what keeps them honest.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  mount, angleOptions, applyPick, undoPick, createPickState, hasPair, pairKeyOf,
  splitTyped, resolvePick, relationPhrase, progressText, RELATION_WORDS, figureSpecOf,
} from '../site/js/widgets/pairs.js';
import { get, has, types, widgetFor, WIDGETS, pipsFor, resolveType, mountWidget } from '../site/js/widgets/index.js';
import { resolve } from '../site/js/figure/model.js';
import { getFigure } from '../site/data/figures.js';

const F1G = resolve(getFigure('F1'), { rename: { A: 'G' } });      // the warm-up figure (ang-wu-1)

test('angleOptions lists every angle of the figure, simple ones first', () => {
  const opts = angleOptions(F1G);
  assert.equal(opts.length, 8);                                     // F1: 5 atomic + 3 composite
  assert.deepEqual(opts.slice(0, 5).map(o => o.level), [0, 0, 0, 0, 0]);
  const labels = opts.map(o => o.label);
  for (const name of ['CFD', 'BFC', 'BFG', 'EFG', 'DFE', 'BFD', 'CFG', 'BFE']) {
    assert.ok(labels.includes(`∠${name}`), `${name} missing from the side list: ${labels.join(' ')}`);
  }
  assert.ok(opts.every(o => o.aria.startsWith('angle ')));          // matches the wedge aria-label
  assert.ok(opts.every(o => typeof o.key === 'string' && o.key.length === 3));
});

test('angleOptions uses the alias label when the figure names its angles (D7)', () => {
  const d7 = resolve(getFigure('D7'), {});
  const opts = angleOptions(d7);
  const ul = opts.find(o => o.alias === 'UL');
  assert.ok(ul, 'D7 has an upper-left angle');
  assert.equal(ul.label, 'upper-left angle');
  assert.equal(angleOptions(null).length, 0);
});

test('applyPick: first pick pends, second completes a pair, same pick clears', () => {
  let s = createPickState();
  assert.deepEqual(s, { picks: [], pending: null });

  s = applyPick(s, 'GFC');
  assert.equal(s.event, 'pending');
  assert.equal(s.pending, 'GFC');
  assert.equal(s.picks.length, 0);

  s = applyPick(s, 'GFC');
  assert.equal(s.event, 'cleared');
  assert.equal(s.pending, null);

  s = applyPick(s, 'GFC');
  s = applyPick(s, 'CFD');
  assert.equal(s.event, 'pair');
  assert.deepEqual(s.picks, [['GFC', 'CFD']]);
  assert.equal(s.pending, null);
});

test('applyPick refuses a repeated pair in either order, for free', () => {
  let s = applyPick(applyPick(createPickState(), 'GFC'), 'CFD');
  const before = s.picks.length;
  s = applyPick(applyPick(s, 'CFD'), 'GFC');                        // same pair, reversed
  assert.equal(s.event, 'duplicate');
  assert.equal(s.picks.length, before, 'a repeat is never committed');
  assert.ok(hasPair(s, 'CFD', 'GFC'));
  assert.equal(pairKeyOf('GFC', 'CFD'), pairKeyOf('CFD', 'GFC'));
});

test('applyPick is pure — the state handed in is never mutated', () => {
  const s0 = applyPick(applyPick(createPickState(), 'GFC'), 'CFD');
  const snapshot = JSON.stringify(s0.picks);
  const s1 = applyPick(applyPick({ picks: s0.picks, pending: null }, 'BFC'), 'BFE');
  assert.equal(JSON.stringify(s0.picks), snapshot);
  assert.equal(s1.picks.length, 2);
  assert.equal(applyPick(createPickState(), '').event, 'none');
});

test('undoPick drops the pending pick first, then the newest pair', () => {
  let s = applyPick(applyPick(createPickState(), 'GFC'), 'CFD');
  s = applyPick(s, 'BFC');                                          // pending
  let u = undoPick(s);
  assert.equal(u.event, 'cleared');
  assert.equal(u.picks.length, 1);

  u = undoPick(u);
  assert.equal(u.event, 'removed');
  assert.deepEqual(u.pair, ['GFC', 'CFD']);
  assert.equal(u.picks.length, 0);
  assert.equal(undoPick(u).event, 'none');
});

test('splitTyped accepts the separators a student actually types', () => {
  assert.deepEqual(splitTyped('∠GFC'), ['∠GFC']);
  assert.deepEqual(splitTyped('∠GFC and ∠CFD'), ['∠GFC', '∠CFD']);
  assert.deepEqual(splitTyped('GFC, CFD'), ['GFC', 'CFD']);
  assert.deepEqual(splitTyped('∠GFC + ∠CFD'), ['∠GFC', '∠CFD']);
  assert.deepEqual(splitTyped('GFC CFD'), ['GFC', 'CFD']);
  assert.deepEqual(splitTyped('angle GFC'), ['angle GFC']);         // NOT split — "angle" is a prefix
  assert.deepEqual(splitTyped('  '), []);
  assert.deepEqual(splitTyped(null), []);
});

test('resolvePick accepts all four typed spellings and keeps the student wording', () => {
  for (const raw of ['∠GFC', 'angle GFC', '<GFC', 'GFC', 'm∠GFC', ' gfc ']) {
    const r = resolvePick(F1G, raw);
    assert.ok(r.ok, `${raw} should parse: ${r.msg}`);
    assert.equal(r.key, 'CFG');                                     // canonical: outer letters sorted
  }
  assert.equal(resolvePick(F1G, 'C-D').key, 'CFD');                 // a wedge id from the SVG
});

test('resolvePick reports the S3 messages instead of guessing', () => {
  const two = resolvePick(F1G, 'GC');
  assert.equal(two.ok, false);
  assert.match(two.msg, /three letters/i);
  assert.ok(two.tags.includes('vertex-not-middle'));

  const vertexFirst = resolvePick(F1G, '∠FGC');
  assert.equal(vertexFirst.ok, false);
  assert.match(vertexFirst.msg, /vertex goes in the middle/i);

  const straight = resolvePick(F1G, '∠GFD');                        // G, F, D are collinear
  assert.equal(straight.ok, false);
  assert.equal(straight.straight, true);
  assert.match(straight.msg, /straight angle/i);

  assert.equal(resolvePick(F1G, '∠XFY').ok, false);
});

test('copy helpers read like the sheet', () => {
  assert.equal(relationPhrase('supplementary', 3), '3 pairs of supplementary angles');
  assert.equal(relationPhrase('vertical', 1), '1 pair of vertical angles');
  assert.equal(relationPhrase('linearPair', 2), '2 pairs of linear angles');
  assert.equal(progressText(0, 3), '0 of 3 pairs found');
  assert.equal(progressText(1, 1), '1 of 1 pair found');
  assert.deepEqual(Object.keys(RELATION_WORDS).sort(),
    ['adjacent', 'complementary', 'linearPair', 'nonAdjacent', 'supplementary', 'vertical']);
});

test('mount() refuses to run without a DOM, with a message that says why', () => {
  assert.throws(() => mount(null, { type: 'pairs', relation: 'supplementary', count: 3 }, {}),
    /needs a DOM|needs a host element/);
});

test('figureSpecOf finds the figure spec wherever the screen put it', () => {
  const spec = { id: 'F1', rename: { A: 'G' } };
  const part = { type: 'pairs', relation: 'supplementary', count: 3 };
  assert.equal(figureSpecOf({ ...part, figure: spec }, {}), spec);
  assert.equal(figureSpecOf(part, { figure: spec }), spec);
  assert.equal(figureSpecOf(part, { card: { figure: spec } }), spec);
  assert.equal(figureSpecOf(part, { model: F1G }), F1G);
  // base.js calls the rendered <svg> ctx.figure / ctx.figureEl — a DOM node is never a spec
  assert.equal(figureSpecOf(part, { figure: { nodeType: 1, id: 'not-a-spec' } }), null);
  assert.equal(figureSpecOf(part, {}), null);
});

test('the shared registry serves `pairs` from this module, and pips it as one', () => {
  assert.equal(resolveType('pairs'), 'pairs');
  assert.ok(has('pairs'));
  assert.equal(get('pairs'), mount, 'widgets/index.js mounts this module\'s mount()');
  assert.equal(widgetFor('pairs'), mount);
  assert.equal(WIDGETS.get('pairs'), mount);
  assert.ok(types().includes('pairs'));
  // S1 HP pips: a pairs part is ONE pip however many pairs it asks for (index.pipsFor agrees)
  assert.equal(pipsFor({ type: 'pairs', relation: 'supplementary', count: 3 }), 1);
  assert.equal(mountWidget(null, { type: 'pairs' }, {}), null, 'no host → null, never a throw');
});
