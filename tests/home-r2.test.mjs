// tests/home-r2.test.mjs — visual QA round 2, group "Home + Onboarding + Placement + Settings".
//
// Pins the round's decisions (the browser-side geometry — chip hit box, compact placement head, cold-boot
// bytes — is pinned by `node qa/r2-home-pins.mjs chip|place|cold`, which the DOM-free suite cannot run):
//   1. Readiness while provisional says over how many skills it rests: `readiness()` returns `early`
//      (tested < EARLY_MIN_TESTED) with the band 'Too early to say', and the Home hero prints
//      "N of 19 skills tested" — a 2-answer quit no longer reads "Getting there · 57".
//   2. The placement's in-run "Start from zero" is gone (it applied every answer so far — the opposite of
//      its label): the exits are the dock's "Skip the rest (n)" and the card's ← to the intro.
//   3. The Home CTA sub-line no longer prints "plan wants 12 new a day — holding at 12": composePage's
//      meta.q IS the held target, so the line could only ever print 12 vs 12 while the strip said 18.
//   4. Home's static graph no longer carries page.js / plan.js (233 KB cards + 311 KB generators): both
//      are dynamic imports, Home paints from readiness.js alone, and the grader / run / card warm-ups
//      wait for the load event / the composed CTA instead of racing Home's critical path.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ROOT } from './_helpers.mjs';
import { fresh } from '../site/js/store.js';
import { readiness, EARLY_MIN_TESTED, EARLY_BAND, bandOf } from '../site/js/readiness.js';
import { composePage, LIMITS } from '../site/js/page.js';

const src = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const NOW = Date.parse('2026-09-17T14:00:00');

/** `count` clean placement items applied the way onboard.js's onFinish does. */
async function placedSave(count) {
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
  return s;
}

test('home r2 / hero honesty: provisional Readiness says over how many skills, and < 4 tested is "Too early to say"', async (t) => {
  await t.test('a fresh save is early: band "Too early to say", tone unchanged (key "not")', () => {
    const rd = readiness(fresh(NOW));
    assert.equal(rd.provisional, true);
    assert.equal(rd.tested, 0);
    assert.equal(rd.early, true);
    assert.equal(rd.band.label, 'Too early to say');
    assert.equal(rd.band.key, 'not', 'the CSS tone is the Not-ready one');
    assert.equal(EARLY_BAND.label, 'Too early to say');
    assert.equal(EARLY_MIN_TESTED, 4);
  });

  await t.test('two clean answers: early — never "Getting there"', async () => {
    const rd = readiness(await placedSave(2));
    assert.equal(rd.tested, 2);
    // fix5:home r3 (critic r2): the provisional M now divides by at least 30 of the 100 weight points
    // (readiness.EVIDENCE_W0), so two placed skills (NOTE 8 + ASN-PLP 7 = 15 points at 80) read 12 / 30 → R 29, no
    // longer 57. Four placed skills (30 points) still read 57 — see the next case.
    assert.equal(rd.r, 29, 'two skills cannot stand in for the unit (evidence floor)');
    assert.equal(rd.early, true);
    assert.equal(rd.band.label, 'Too early to say');
  });

  await t.test('four clean answers: the real band applies', async () => {
    const rd = readiness(await placedSave(4));
    assert.equal(rd.tested, 4);
    assert.equal(rd.early, false);
    assert.equal(rd.band.label, bandOf(rd.r).label);
    assert.equal(rd.band.label, 'Getting there');
    assert.equal(rd.r, 57, 'fix5:home r3: 30 points tested — the floor no longer binds');
  });

  await t.test('a locked Readiness is never early', () => {
    const s = fresh(NOW);
    s.runs = [{ kind: 'mock', status: 'done', accuracy: 0.5, submittedAt: NOW }];
    const rd = readiness(s);
    assert.equal(rd.provisional, false);
    assert.equal(rd.early, false);
    assert.equal(rd.band.label, bandOf(rd.r).label);
  });

  await t.test('the Home hero prints "N of 19 skills tested" while provisional and drops the T−N', () => {
    const home = src('site/js/screens/home.js');
    assert.match(home, /provisional · \$\{rd\.tested\} of \$\{rd\.skillsTotal\} skills tested — take a Mock to lock\\u00a0it/);
    // fix5:home r1: the provisional M no longer averages EVERY tested skill (a just-started, never-missed skill
    // counts only where it raises M — notes/FIX5-home.md), so "mastery X % of N tested" would misstate it. The
    // note line above keeps "N of 19 skills tested"; the term reads just "mastery X %".
    assert.match(home, /`mastery \$\{pct\(rd\.M\)\}`/);
    assert.ok(!/mastery \$\{pct\(rd\.M\)\} of \$\{rd\.tested\} tested/.test(home));
    assert.match(home, /h\('span\.rd-term'/, 'each term is a nowrap span (polish.css home r2)');
    assert.ok(!/· T−\$\{D\}/.test(home), 'the hero no longer repeats the header chip');
  });
});

test('home r2 / the placement exits are honest', async (t) => {
  const ob = src('site/js/screens/onboard.js');
  const run = ob.slice(ob.indexOf('function runPlacement('), ob.indexOf('show(startStep);'));

  await t.test('no in-run "Start from zero" (it applied the answers so far)', () => {
    assert.ok(!/quitLabel: 'Start from zero'/.test(run), 'the quit that lied is gone');
    assert.ok(!/quitLabel/.test(run), 'the placement has no head quit at all — the card ← is the way out');
  });

  await t.test('compact sticky head, skip in the dock, ← to the intro', () => {
    assert.match(run, /compact: true, skipInDock: true/);
    assert.match(run, /back: '\/onboard\?step=3&intro=1'/, 'a hash that differs from the run\'s own #/onboard?step=3, so the anchor fires');
    assert.match(ob, /if \(cfg\.skipInDock\) drawProgress\(\);/, 'the dock skip is drawn after the card view has built its dock');
    assert.match(ob, /document\.getElementById\('dock'\)\?\.querySelector\('\.w-dock-actions'\)/);
  });

  await t.test('the up-front "I’ll start from zero" still writes an empty placement', () => {
    assert.match(ob, /onZero: \(\) => \{\s*update\(s => \{ s\.placement = \{ done: true, at: Date\.now\(\), answered: 0, total: placementSize\(D\), skipped: placementSize\(D\), placed: \[\], results: \{\} \}; \}\);/);
  });

  await t.test('night.js blocks keep the classic head (sub-line + quit) — compact is opt-in', () => {
    const night = src('site/js/screens/night.js');
    assert.ok(!/compact: true/.test(night));
    assert.match(night, /quitLabel: 'Hand it in'/);
  });
});

test('home r2 / the CTA sub-line does not print 12 vs 12', async (t) => {
  await t.test('composePage: meta.q is the HELD target on a warn day, so the line had nothing true to say', () => {
    const s = fresh(NOW);
    s.settings.testDate = '2026-09-21';   // D = 4 at NOW
    const page = composePage(s, { now: NOW, today: '2026-09-17' });
    assert.equal(page.meta.D, 4);
    assert.equal(page.meta.warn, true, 'a fresh packet at D = 4 wants more than a day holds');
    assert.equal(page.meta.q, LIMITS.q, 'meta.q is already lowered to 12');
  });

  await t.test('home.js no longer prints it (the plan strip\'s warn line is the one statement)', () => {
    const home = src('site/js/screens/home.js');
    assert.ok(!/sub\.push\(`plan wants/.test(home));
  });
});

test('home r2 / cold boot: Home paints without page.js, plan.js, the grader or the next screens', async (t) => {
  await t.test('home.js imports page.js and plan.js dynamically, keeps the W4 planOpts contract, and starts the fetch at evaluation', () => {
    const home = src('site/js/screens/home.js');
    assert.ok(!/from '\.\.\/page\.js'/.test(home), 'no static page.js import');
    assert.ok(!/from '\.\.\/plan\.js'/.test(home), 'no static plan.js import');
    assert.match(home, /import\('\.\.\/page\.js'\), import\('\.\.\/plan\.js'\)/);
    assert.match(home, /const planOpts = \(save, D\) => \{ const \{ q, \.\.\.rest \} = composeOpts\(save, \{ D \}\); return rest; \};/, 'tests/integration-w4 still holds');
    assert.match(home, /function renderLight\(/, 'a first paint with a CTA placeholder');
    assert.match(home, /dataset: \{ kind: 'loading' \}/);
    assert.match(home, /if \(typeof window !== 'undefined'\) heavy\(\);/);
  });

  await t.test('the run.js / card.js warm-up waits for the composed CTA (home.js), not requestIdleCallback at 290 ms (index.js)', () => {
    const index = src('site/js/screens/index.js');
    assert.ok(!/requestIdleCallback\(warm/.test(index));
    const home = src('site/js/screens/home.js');
    assert.match(home, /const warmNext = \(\) => \{ if \(warmed\) return; warmed = true; setTimeout\(\(\) => \{ import\('\.\/run\.js'\)/);
    assert.match(home, /if \(ok\) warmNext\(\);/);
  });

  await t.test('app.js: packet.graders is a getter — the first reader or load + 2 s starts the import', () => {
    const app = src('site/js/app.js');
    assert.match(app, /get graders\(\) \{ return warmGraders\(\); \}/);
    assert.match(app, /window\.addEventListener\('load', afterLoad, \{ once: true \}\)/);
    assert.ok(!/const graders = import\('\.\/grader\/index\.js'\)/.test(app), 'no eager import at boot');
  });

  await t.test('readiness.js (Home\'s only data path) stays off cards.js and templates.js', () => {
    const rd = src('site/js/readiness.js');
    assert.ok(!/data\/cards\.js|data\/templates\.js|page\.js/.test(rd));
  });
});

test('home r2 / polish.css block', () => {
  const css = src('site/css/polish.css');
  const block = css.slice(css.indexOf('/* === home r2 ==='), css.indexOf('/* === /home r2 === */'));
  assert.ok(block.length > 0, 'the block exists and is closed');
  assert.match(block, /\.hdr a\.chip \{ position: relative; overflow: visible; text-overflow: clip; \}/, 'base.css\'s overflow:hidden no longer clips the hit box');
  assert.match(block, /\.hdr a\.chip::before \{ content: ''; position: absolute; inset: -12px -4px; \}/, '48 px hit box on the 24 px chip');
  assert.match(block, /\.rd-terms \.rd-term \{ white-space: nowrap; \}/);
  assert.match(block, /\.w-eq-actions \.w-msg \{ flex: 1 1 100%; margin-inline-end: 0; \}/);
  assert.match(block, /\.w-eq-actions \.w-msg\[data-state=""\] \{ display: none; \}/, 'an empty message is out of the flow: both buttons share one row');
  assert.match(block, /\.ob-run-head\[data-compact="true"\] \.ob-run-meta \{ display: none; \}/);
  assert.match(block, /#dock \.ob-dock-skip/);
  assert.match(block, /\.home-primary\[data-kind="loading"\]/);
  const base = src('site/css/base.css');
  assert.match(base, /\.chip \{[\s\S]*?overflow: hidden; text-overflow: ellipsis;/, 'every other chip keeps its truncation');
});
