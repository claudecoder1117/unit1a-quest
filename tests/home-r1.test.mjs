// tests/home-r1.test.mjs — visual QA round 1, group "Home + Onboarding + Placement + Settings".
//
// Pins the two product decisions of the round (COMPOSED S10 2026-09-17b, notes/OPEN-ISSUES.md §B0/§B1):
//   1. S9 #1 — an aced placement reads Readiness ≥ 55 provisional: the provisional formula's M runs over
//      the skills TESTED so far (`masteryTermTested`), not all 19 with the untested eleven scored as zero.
//      The locked formula (a Mock / Baseline exists) is unchanged and still runs over all 19.
//   2. S1 budget — a Page is held to `LIMITS.minutesMax` (25 min) as well as `pageMax` items: the review
//      block stops `minutesReserve` short so qMin new cards still land, and weak/floor Variants never push
//      the page past the budget. Reviews that did not fit stay due for the day's next Page.
// Plus the registry: every screen but Home is a lazy loader (a cold #/today no longer pulls run.js/mock.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { fresh } from '../site/js/store.js';
import { readiness, masteryTerm, masteryTermTested, FORMULA_PROVISIONAL } from '../site/js/readiness.js';
import { composePage, estimateMinutes, LIMITS } from '../site/js/page.js';
import { composeOpts } from '../site/js/plan.js';
import { read } from './_helpers.mjs';

const NOW = Date.parse('2026-09-17T14:00:00');

/** Ace every placement item (all 8 clean) the way onboard.js's onFinish does, through applyPlacement(). */
async function acedSave({ count = 8 } = {}) {
  const ob = await import('../site/js/screens/onboard.js');
  await ob.loadData();
  const T = await import('../site/data/templates.js');
  const C = await import('../site/data/cards.js');
  const s = fresh(NOW);
  s.settings.testDate = '2026-09-24';
  const items = ob.placementItems(s, { D: 7 }).slice(0, count);
  const results = {};
  for (const it of items) {
    const skills = it.source.id ? C.byId[it.source.id].skills : T.getTemplate(it.source.template).skills;
    results[it.key] = { outcome: 'clean', skills: skills.slice(), module: it.module };
  }
  ob.applyPlacement(s, results, { now: NOW, total: 8, skipped: 8 - count });
  return { s, results, items };
}

test('home r1 / S9 #1: an 8/8 aced placement reads Readiness ≥ 55, provisional, over the 8 skills tested', async (t) => {
  const { s, results } = await acedSave();
  const rd = readiness(s);

  await t.test('the number is the one earned', () => {
    assert.equal(Object.keys(results).length, 8);
    assert.equal(rd.provisional, true);
    assert.equal(rd.A, null);
    assert.equal(rd.tested, 8, 'eight skills carry n = 5 after the placement');
    assert.equal(rd.skillsTotal, 19);
    assert.ok(Math.abs(rd.M - 0.8) < 1e-9, `M over the tested skills is 0.8 (m = 80 each), got ${rd.M}`);
    assert.equal(rd.r, Math.round(100 * (0.5 * rd.M + 0.2 * rd.C) / 0.7), 'r is the printed provisional formula');
    assert.ok(rd.r >= 55, `S9 #1: Readiness ≥ 55 after an aced placement, got ${rd.r}`);
    assert.equal(rd.r, 57, 'the worked number in COMPOSED S9 #1');
  });

  await t.test('the all-19 M is NOT what the provisional branch uses (it was the 27)', () => {
    const all = masteryTerm(s);
    assert.ok(all < 0.5, `all-19 M is ${all}`);
    assert.equal(Math.round(100 * (0.5 * all + 0.2 * rd.C) / 0.7), 27, 'the old formula would have printed 27');
    assert.equal(masteryTermTested(s).tested, 8);
  });

  await t.test('a 4-item ace + skip reads the same 57 over 4 skills', async () => {
    const { s: s4 } = await acedSave({ count: 4 });
    const r4 = readiness(s4);
    assert.equal(r4.tested, 4);
    assert.equal(r4.r, 57);
  });

  await t.test('a fresh save is still 0 (no tested skill ⇒ M = 0), and Settings prints the tested-only rule', () => {
    const r0 = readiness(fresh(NOW));
    assert.equal(r0.r, 0);
    assert.equal(r0.tested, 0);
    assert.match(FORMULA_PROVISIONAL, /tested so far/);
  });

  await t.test('once a Baseline exists the LOCKED formula runs over all 19 skills (unchanged)', () => {
    s.runs.push({ kind: 'baseline', status: 'done', accuracy: 1, submittedAt: NOW, startedAt: NOW - 600000, items: [] });
    const locked = readiness(s);
    assert.equal(locked.provisional, false);
    assert.equal(locked.tested, 19);
    assert.ok(Math.abs(locked.M - masteryTerm(s)) < 1e-12);
    assert.equal(locked.r, Math.round(100 * (0.5 * locked.M + 0.3 * 0.8 + 0.2 * locked.C)));
  });
});

test('home r1 / S1 budget: the midweek fixture composes ≤ 25 minutes and keeps qMin new cards', () => {
  const save = JSON.parse(readFileSync(new URL('../qa/fixtures/midweek.json', import.meta.url), 'utf8'));
  const { q, ...opts } = composeOpts(save, {});           // Home drops q (W4 §1.2)
  const p = composePage(save, opts);
  const est = estimateMinutes(p.queue);
  assert.ok(est <= LIMITS.minutesMax, `~${est} min > ${LIMITS.minutesMax} (was ~34 before the minute budget)`);
  assert.equal(p.meta.minutes, Math.round(est));
  assert.ok(p.meta.counts.new >= LIMITS.qMin, `new ${p.meta.counts.new} ≥ qMin ${LIMITS.qMin}: progress continues on a heavy day`);
  assert.ok(p.meta.counts.review >= 10, 'the review block still leads (reviews are never dropped, only deferred)');
  // an explicit `minutes` widens or narrows the budget
  const wide = composePage(save, { ...opts, minutes: 60 });
  assert.ok(wide.queue.length >= p.queue.length);
  assert.ok(estimateMinutes(wide.queue) > est, 'a wider budget composes more');
});

test('home r1 / S9 #1 cold open: every screen but Home is a lazy loader in the registry', () => {
  const idx = read('site/js/screens/index.js').split('\n').filter(l => !l.trimStart().startsWith('//')).join('\n');
  assert.match(idx, /^import \{ mountHome \} from '\.\/home\.js';/m, 'Home is static');
  for (const f of ['run', 'mock', 'card', 'boss', 'binder', 'stats', 'report', 'settings', 'onboard', 'sheet']) {
    assert.doesNotMatch(idx, new RegExp(`^import .* from '\\./${f}\\.js';`, 'm'), `${f}.js is not imported statically`);
    assert.match(idx, new RegExp(`import\\('\\./${f}\\.js'\\)`), `${f}.js is loaded lazily`);
  }
  const app = read('site/js/app.js');
  assert.match(app, /typeof r\.then === 'function'/, 'the router awaits a Promise-returning handler');
});
