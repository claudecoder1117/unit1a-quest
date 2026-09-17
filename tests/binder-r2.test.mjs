// tests/binder-r2.test.mjs — visual QA round 2, group "Binder + Stats + Sheet + Night" (fixer).
//
//   1. Mini-mock accuracy floor: fewer than MINI_MIN_SCORED (4 of 8) answered items never writes an
//      accuracy, and readiness.latestMock skips such a night run — a 1-item sample cannot replace a
//      20-item Baseline the night before the test.
//   2. Mock silence in the strip widget and the mini-mock runner (source-pinned: the suite has no DOM):
//      under ctx.mock a strip never renders a `revealed` slot or an ANSWER line; the runner mounts the
//      Card view with save:false / xpFactor:0 and its ticks are `done`, never `clean` / `wrong`.
//   3. JUMP is defined over originals: a module with none (M3, M12) is neither jumpable nor "cleared".
import test from 'node:test';
import assert from 'node:assert/strict';
import { read } from './_helpers.mjs';
import { fresh } from '../site/js/store.js';
import { readiness, latestMock, NIGHT_MIN_SCORED } from '../site/js/readiness.js';
import * as night from '../site/js/screens/night.js';
import { moduleJumpable } from '../site/js/screens/binder.js';
import { moduleById } from '../site/data/modules.js';

const T0 = Date.parse('2026-09-17T20:00:00');

function withBaseline() {
  const s = fresh();
  s.runs = [{ kind: 'baseline', n: 1, status: 'done', startedAt: T0 - 3 * 864e5, submittedAt: T0 - 3 * 864e5 + 6e5, accuracy: 0.7, score: 70, scoreMax: 100, items: new Array(20).fill({ credit: 1 }), answered: 20 }];
  return s;
}
const nightRun = (scored, right, extra = {}) => ({
  kind: 'night', n: 1, status: 'done', startedAt: T0, submittedAt: T0 + 6e4, limitMs: night.MINI_LIMIT_MS,
  items: new Array(scored).fill(0).map((_, i) => ({ id: `x${i}`, credit: i < right ? 1 : 0 })),
  answered: scored, scored, ...extra,
});

test('binder r2 · miniAccuracy: null below the floor, right / answered at or above it', () => {
  assert.equal(night.MINI_MIN_SCORED, Math.ceil(night.MINI_COUNT / 2));
  assert.equal(night.MINI_MIN_SCORED, NIGHT_MIN_SCORED);
  assert.equal(night.miniAccuracy({ answered: 0, right: 0 }), null);
  assert.equal(night.miniAccuracy({ answered: 1, right: 0 }), null);
  assert.equal(night.miniAccuracy({ answered: 3, right: 3 }), null);
  assert.equal(night.miniAccuracy({ answered: 4, right: 3 }), 0.75);
  assert.equal(night.miniAccuracy({ answered: 8, right: 8 }), 1);
});

test('binder r2 · a 1-item night run leaves Readiness exactly where the Baseline put it', () => {
  const s = withBaseline();
  const before = readiness(s);
  assert.equal(latestMock(s).kind, 'baseline');
  // the runner's own floor: no accuracy on the record …
  s.runs.push(nightRun(1, 0, { accuracy: night.miniAccuracy({ answered: 1, right: 0 }) ?? undefined }));
  assert.equal(latestMock(s).kind, 'baseline');
  assert.equal(readiness(s).r, before.r);
  // … and belt-and-braces: even a record that carries one (an older save) is skipped below the floor
  s.runs.push(nightRun(2, 0, { accuracy: 0, score: 0, scoreMax: 100 }));
  assert.equal(latestMock(s).kind, 'baseline');
  assert.equal(readiness(s).r, before.r);
  // an older record without `scored` falls back to its item list
  const old = nightRun(1, 0, { accuracy: 0, score: 0, scoreMax: 100 }); delete old.scored;
  s.runs.push(old);
  assert.equal(latestMock(s).kind, 'baseline');
  // 4 of 8 answered moves it
  s.runs.push(nightRun(4, 2, { accuracy: 0.5, score: 50, scoreMax: 100 }));
  assert.equal(latestMock(s).kind, 'night');
  assert.equal(latestMock(s).accuracy, 0.5);
  assert.notEqual(readiness(s).r, before.r);
});

test('binder r2 · strip under ctx.mock never reveals; the mini-mock runner writes nothing mid-mock', () => {
  const strip = read('site/js/widgets/strip.js');
  const fb = strip.slice(strip.indexOf('function setFeedback'), strip.indexOf('function showProse'));
  const mockBranch = fb.slice(fb.indexOf('if (ctx.mock)'), fb.indexOf('root.dataset.state = state;'));
  assert.ok(mockBranch.length > 50, 'setFeedback has a ctx.mock branch before the normal path');
  assert.ok(/settled \? 'answered' : row\.state/.test(mockBranch), 'a settled slot is `answered`, never `revealed` / `ok`');
  assert.ok(!/Answer/.test(mockBranch) && !/w-strip-ans/.test(mockBranch), 'no ANSWER line in the mock branch');
  assert.ok(/proseBox\.hidden = true;\s*return;/.test(mockBranch), 'no prose (the full explanation) in the mock branch');

  const n = read('site/js/screens/night.js');
  const mini = n.slice(n.indexOf('function createMiniMock'), n.indexOf('export function mountNight'));
  assert.ok(/save: false, xpFactor: 0/.test(mini), 'the Card view is mounted with save:false / xpFactor:0');
  const tick = mini.slice(mini.indexOf('const tickState'), mini.indexOf('function draw'));
  assert.ok(/'done'/.test(tick) && !/'clean'/.test(tick) && !/'wrong'/.test(tick), 'ticks are done / skip / now / todo until the report');
  assert.ok(/type === 'strip'/.test(mini) && /lastRes\?\.complete/.test(mini), 'a strip\'s intermediate wrong slot never books the item');

  const css = read('site/css/polish.css');
  const blk = css.slice(css.indexOf('/* === binder r2 === '), css.indexOf('/* === /binder r2 === */'));
  for (const sel of ['.nb-mini .w-field .w-fmsg', '.nb-mini .w-strip-msg', '.nb-mini .w-eq-split', '.nb-mini .card-pips', '.w-strip-slot[data-state="answered"]', '.nb-mini .w-msg[data-state="almost"]']) {
    assert.ok(blk.includes(sel), `polish.css binder r2 block carries ${sel}`);
  }
});

test('binder r2 · JUMP is defined over originals: modules without any are neither jumpable nor "cleared"', () => {
  for (const id of Object.keys(moduleById)) {
    const m = moduleById[id];
    assert.equal(moduleJumpable(id), !!(m.jump && m.originals.length), id);
  }
  assert.equal(moduleJumpable('M12'), false);   // Systems — families only
  assert.equal(moduleJumpable('M3'), false);    // M3 Complement & Supplement — chains only
  assert.equal(moduleJumpable('M4'), true);
  assert.equal(moduleJumpable('nope'), false);
});
