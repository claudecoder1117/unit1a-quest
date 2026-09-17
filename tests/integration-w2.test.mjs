// integration-w2.test.mjs — the Wave-2 seams, written by the integrator.
//
// Every ticket in Wave 2 tested its own half; nothing tested the joins. These are the joins:
//   1. the widget registry actually loads all eighteen widget modules (T08a·b·c·d) — a module that
//      loses its `mount` export, or throws at import, is recorded in `missing` instead of thrown, so
//      only a test like this one notices;
//   2. every part type the CONTENT uses (T06*) and every part type the GENERATORS emit (T07a·b·c)
//      has a widget — the two halves of S3 were built by six different tickets and only meet here;
//   3. the contract helpers the integrator changed for notes/T08b.md and notes/T08d.md keep working
//      (`handle()` copies descriptors, so a widget may expose a getter; `ready` stays lazy).
// Nothing here touches the DOM: the widget modules are import-safe in Node by design (notes/T08b.md).
import test from 'node:test';
import assert from 'node:assert/strict';

import * as registry from '../site/js/widgets/index.js';
import { WIDGETS, LAZY, ready, loadAll, loadFor, composeParts, resolveType, pipsForCard } from '../site/js/widgets/index.js';
import { handle } from '../site/js/widgets/base.js';
import { cards, byId } from '../site/data/cards.js';
import { templateIds, getTemplate } from '../site/data/templates.js';

// captured at module evaluation, BEFORE any test awaits `ready` — see "ready stays lazy" below
const STATIC_TYPES = [...WIDGETS.keys()];

test('widgets: the registry is lazy until something asks for it', () => {
  // T08a's design: importing the registry costs the five static widget modules and nothing else.
  assert.deepEqual(STATIC_TYPES.sort(), ['cases', 'multi', 'num', 'pairs', 'ratio', 'reject', 'rootcase', 'roots']);
  for (const t of Object.keys(LAZY)) assert.ok(!STATIC_TYPES.includes(t), `${t} should be lazy, not static`);
  assert.equal(typeof ready.then, 'function', '`await ready` must work (notes/T08b.md, notes/T08d.md)');
  assert.equal(typeof loadAll, 'function');
});

test('widgets: every module imports and exposes mount() — await ready leaves nothing missing', async () => {
  await ready;
  assert.deepEqual(registry.missing, [], 'a widget module failed to load — see {type, path, error}');
  for (const t of Object.keys(LAZY)) assert.equal(typeof WIDGETS.get(t), 'function', `${t}: no mount()`);
  assert.equal(WIDGETS.size, STATIC_TYPES.length + Object.keys(LAZY).length);
});

test('widgets: every part type in the card bank has a widget', async () => {
  await ready;
  const used = new Map();
  for (const c of cards) for (const p of c.parts ?? []) if (!used.has(p.type)) used.set(p.type, c.id);
  assert.ok(used.size >= 15, `only ${used.size} part types found — the bank did not load`);
  for (const [type, where] of used) {
    assert.ok(WIDGETS.has(resolveType(type)), `${where}: part type "${type}" has no widget`);
  }
});

test('widgets: every part type the generators emit has a widget', async () => {
  await ready;
  for (const id of templateIds()) {
    for (const type of getTemplate(id).partTypes ?? []) {
      assert.ok(WIDGETS.has(resolveType(type)), `${id}: emits "${type}", which has no widget`);
    }
  }
});

test('widgets: loadFor resolves a real card, groups included', async () => {
  const groups = composeParts(byId['ang-10'].parts);          // equation + roots/reject/cases
  const got = await loadFor(groups);
  for (const [type, mount] of got) assert.equal(typeof mount, 'function', `loadFor: ${type} unresolved`);
  assert.ok(got.has('equation'), 'loadFor must reach into a rootcase group and the setup slot');
  assert.equal(pipsForCard(byId['ang-10'].parts), 4);          // S1: roots 1 + reject 1 + cases 2
});

test('base.handle(): fills the contract, keeps the widget\'s own methods, and allows a getter', () => {
  // The default shape — a caller may call any contract method on any handle.
  const bare = handle({ el: null, part: null, type: 'x' });
  for (const k of ['raw', 'setFeedback', 'lock', 'focus', 'destroy', 'isEmpty', 'pips']) {
    assert.equal(typeof bare[k], 'function', `handle(): ${k} missing`);
  }
  assert.equal(bare.raw(), null);
  assert.deepEqual(bare.pips(), { total: 1, filled: 0 });

  // The widget's own implementation wins.
  assert.equal(handle({ raw: () => 42 }).raw(), 42);

  // notes/T08d.md request (b): a live getter survives (the old spread froze its value).
  let n = 0;
  const h = handle({ get stage() { return ++n; } });
  assert.equal(h.stage, 1);
  assert.equal(h.stage, 2, 'handle() must copy descriptors, not spread values');
});
