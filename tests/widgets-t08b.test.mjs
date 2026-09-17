// widgets-t08b.test.mjs — the DOM-free parts of the T08b widgets (js/widgets/{factored,equation}.js).
//
// mount() itself needs a document and is checked in the browser (notes/T08b.md, "How to test"), but the
// decisions those widgets make BEFORE touching the DOM are pure functions over the card data, and those are
// exactly the ones a content edit can silently break: which insert keys an item offers (a `²` that never
// appears, a missing `/` on a fraction setup) and the prompt the skip button rewrites. Importing the modules
// here also asserts they stay import-safe in Node — no `document` at module scope.
import test from 'node:test';
import assert from 'node:assert/strict';

import { byId } from '../site/data/cards.js';
import { KEY_DEFS } from '../site/js/widgets/base.js';
import { keysFor as facKeys } from '../site/js/widgets/factored.js';
import { keysFor as eqKeys, promptOf } from '../site/js/widgets/equation.js';

const card = (id) => byId[id] ?? byId.get?.(id);
const part = (id, pid) => card(id).parts.find((p) => p.id === pid);
// a string key is resolved through T08a's KEY_DEFS at render time ('-' draws '−' and types ASCII '-')
const def = (k) => (typeof k === 'string' ? KEY_DEFS[k] ?? { label: k, insert: k } : k);
const labels = (keys) => keys.map((k) => def(k).label);
const inserts = (keys) => keys.map((k) => def(k).insert);

test('factored: the key row carries the item\'s own variable and a legible square key', () => {
  const k = facKeys(part('fac-16', 'a'));
  assert.deepEqual(labels(k), ['(', ')', '−', 'a', 'a²']);
  assert.ok(inserts(k).includes('-'), 'the minus key types ASCII -, never U+2212');
  assert.ok(inserts(k).includes('^2'), 'the square key types ^2, which normalize.js reads');
  assert.deepEqual(labels(facKeys(part('fac-05', 'v'))), ['(', ')', '−', 'v', 'v²']);
});

test('factored: every factored card gets a key for its own variable and no stray fraction key', () => {
  const fac = Object.values(byId).filter((c) => c && Array.isArray(c.parts) && c.parts.some((p) => p.type === 'factored'));
  assert.equal(fac.length, 18, 'the 18 Kuta factorings');
  for (const c of fac) {
    const p = c.parts.find((x) => x.type === 'factored');
    const k = labels(facKeys(p));
    assert.ok(k.includes(p.var), `${c.id}: no ${p.var} key`);
    assert.ok(k.includes(`${p.var}²`), `${c.id}: no square key`);
    assert.ok(!k.includes('/'), `${c.id}: integer target, so no fraction key`);
    assert.ok(k.length <= 7, `${c.id}: ${k.length} keys is more than one phone row plus a wrap`);
  }
});

test('equation: the key row follows what the item\'s own answer needs', () => {
  assert.deepEqual(labels(eqKeys(part('wp-07', 'setup'), 'x', null)), ['(', ')', '−', '=', 'x']);
  // ang-10's setup is quadratic → a square key; it is not a system → no y key
  assert.deepEqual(labels(eqKeys(part('ang-10', 'setup'), 'x', null)), ['(', ')', '−', '=', 'x', 'x²']);
  // wp-11 is a fraction equation, which S3 also accepts written with a colon
  assert.deepEqual(labels(eqKeys(part('wp-11', 'setup'), 'x', null)), ['(', ')', '−', '=', 'x', '/', ':']);
  // doc-07 is a system: the second variable gets a key, and its canonical has no fraction
  assert.deepEqual(labels(eqKeys(part('doc-07', 'setup'), 'x', 'y')), ['(', ')', '−', '=', 'x', 'y']);
  // ang-04's variable is m, not x
  assert.deepEqual(labels(eqKeys(part('ang-04', 'setup'), 'm', null)), ['(', ')', '−', '=', 'm', 'm²']);
});

test('equation: every setup part offers its variable, an =, and at most two phone rows of keys', () => {
  let n = 0;
  for (const c of Object.values(byId)) {
    for (const p of (c?.parts ?? [])) {
      if (p.type !== 'equation') continue;
      n++;
      const v = String(p.var ?? 'x').toLowerCase();
      const w = Array.isArray(p.system) && p.system.length === 2 ? (p.vars?.[1] ?? 'y') : null;
      const k = labels(eqKeys(p, v, w));
      assert.ok(k.includes(v), `${c.id}: no ${v} key`);
      assert.ok(k.includes('='), `${c.id}: no = key`);
      assert.ok(k.length <= 8, `${c.id}: ${k.length} keys`);
      if (w) assert.ok(k.includes(w), `${c.id}: a system with no ${w} key`);
    }
  }
  assert.equal(n, 28, 'every equation part in the deck was covered');
});

test('equation: the prompt drops the "skippable" aside the button now carries, and keeps the rest', () => {
  // ang-02: "Set up the equation (skippable — graded when tried)"
  assert.equal(promptOf(part('ang-02', 'setup'), true), 'Set up the equation (graded when tried)');
  // doc-07: "Write the two equations (vertical pair, then a linear pair — skippable)" — the guidance stays
  assert.equal(promptOf(part('doc-07', 'setup'), true), 'Write the two equations (vertical pair, then a linear pair)');
  // a part with a plain label is passed through; a part with neither gets the default
  assert.equal(promptOf(part('wp-07', 'setup'), true), 'Set up the equation');
  assert.equal(promptOf({}, true), 'Set up the equation');
  assert.equal(promptOf({}, false), 'Set up the equation');
  // with no skip button (Boss / Mock) the word still goes, because the slot is required there
  assert.ok(!/skippable/i.test(promptOf(part('ang-02', 'setup'), false)));
  assert.ok(!/skippable/i.test(promptOf(part('doc-07', 'setup'), false)));
});
