// tests/page-r2.test.mjs — visual QA round 2, group "Today's Page run + Summary (the mint moment) + BLITZ + Drill".
//
// DOM-free halves of the round-2 fixes plus source scans for the DOM ones (each was checked in the browser —
// the fixer's report lists the PNGs): no frozen foil sheen under reduced motion, the 60 px mint grid, the
// BLITZ wrong-tap marks (✗ on the pressed option, ✓ on the right one), the page progress denominator, the
// Summary plan line without its "RUN NEXT ·" prefix, the phone hint placement, the miss verdict scroll, the
// pairs helper text naming an angle THIS figure has, and the equation prompt without the mode aside.
import test from 'node:test';
import assert from 'node:assert/strict';
import { read } from './_helpers.mjs';

import { promptOf } from '../site/js/widgets/equation.js';
import { gradePairs } from '../site/js/grader/pairs.js';
import { resolve, angles } from '../site/js/figure/model.js';
import { F1 } from '../site/data/figures.js';

const reduceBlock = (css) => {
  // the LAST prefers-reduced-motion block of the file (T16's)
  const i = css.lastIndexOf('@media (prefers-reduced-motion: reduce)');
  assert.ok(i >= 0, 'motion.css has a reduced-motion block');
  return css.slice(i, css.indexOf('}\n}', i) + 3);
};

test('page r2 / motion: reduced motion hides the foil sheen instead of parking it as a stripe', () => {
  const block = reduceBlock(read('site/css/motion.css'));
  const m = block.match(/\.sum-tile \.tile-sheen\s*\{([^}]*)\}/);
  assert.ok(m, 'the reduce block styles .sum-tile .tile-sheen');
  assert.match(m[1], /opacity:\s*0\b/, 'the sheen is invisible (opacity 0) under reduced motion');
  assert.doesNotMatch(m[1], /opacity:\s*\.5/, 'no half-opacity parked gradient');
});

test('page r2 / summary: the mint grid is a fixed 60 px grid with a two-line caption', () => {
  const css = read('site/css/screens.css');
  const tiles = css.match(/\.sum-tiles\s*\{([^}]*)\}/)[1];
  assert.match(tiles, /display:\s*grid/);
  assert.match(tiles, /repeat\(auto-fill,\s*60px\)/);
  const cap = css.match(/\.sum-tile-cap\s*\{([^}]*)\}/)[1];
  assert.match(cap, /width:\s*60px/);
  const js = read('site/js/screens/run.js');
  assert.match(js, /sum-tile-name/, 'caption line 1: the sheet + number');
  assert.match(js, /sum-tile-move/, 'caption line 2: the rarity glyph + name');
  assert.match(js, /RARITY_GLYPH\s*=\s*\{\s*platinum: '★', gold: '●', silver: '◐', bronze: '○'/);
});

test('page r2 / BLITZ: a wrong tap marks the pressed option and the right one (never colour-only)', () => {
  const js = read('site/js/screens/run.js');
  assert.match(js, /function markOptions\(pressed, ok\)/);
  assert.match(js, /dataset: \{ ok: String\(!!opt\.ok\) \}/, 'mc options carry data-ok');
  assert.match(js, /pressed\.dataset\.state = ok \? 'ok' : 'bad'/);
  assert.match(js, /span\.blitz-mark'[^\n]*ok \? '✓' : '✗'/, 'a ✗ / ✓ glyph lands on the option');
  assert.match(js, /submit\(e, opts\[i2\]\.text, answers\.querySelectorAll\('\.blitz-opt'\)\[i2\]/, 'the keyboard path names the pressed button too');
  const css = read('site/css/polish.css');
  assert.match(css, /\.blitz-opt\[data-state="bad"\][^{]*\{[^}]*animation:\s*page-r2-shake 120ms/, '120 ms shake on the offending option');
  assert.match(css, /\.blitz-answers\[data-locked="true"\] > \[data-state\]:disabled \{ opacity: 1; \}/, 'the marked pair stays legible through the lockout');
  assert.match(css, /prefers-reduced-motion: reduce\) \{ \.blitz-opt\[data-state="bad"\][^}]*animation: none/);
});

test('page r2 / summary: BLITZ hero names the seconds actually played; plan line has no RUN NEXT prefix', () => {
  const js = read('site/js/screens/run.js');
  assert.match(js, /const playedS = b\?\.reason === 'time' \? roundS : Math\.max\(1, Math\.round\(elapsedMs \/ 1000\)\)/);
  assert.match(js, /`right in \$\{playedS\} s`/);
  assert.doesNotMatch(js, /`right in \$\{roundS\} s`/);
  assert.match(js, /`Next: \$\{String\(next\.label \?\? ''\)\.replace\(\/\^RUN NEXT/);
});

test('page r2 / progress: one denominator for the whole page (retries included)', () => {
  const js = read('site/js/screens/run.js');
  assert.match(js, /const done = kind === 'page' \? queue\.filter\(\(it\) => it\.done\)\.length : results\.length/);
  assert.match(js, /right: progressBar\(done, queue\.length, \{ retries \}\)/);
  assert.match(js, /` · \$\{retries\} \$\{retries === 1 \? 'retry' : 'retries'\}`/, 'the retry suffix is "· 3 retries", not "+3"');
  assert.match(js, /\$\{retries\} retried/, 'the Summary names the retries next to Cleared');
});

test('page r2 / card: no auto-focus on a phone, hint at the top of the part box, miss verdict scrolled to the top', () => {
  const js = read('site/js/screens/card.js');
  const focusFirst = js.slice(js.indexOf('function focusFirst()'), js.indexOf('function activeEntry()'));
  assert.match(focusFirst, /matchMedia\('\(max-width: 1023px\)'\)\.matches\) return;/);
  const inline = js.slice(js.indexOf('function inlineHint('), js.indexOf('function revealNextHint('));
  assert.match(inline, /if \(phone\) e\.box\.insertBefore\(wrap, e\.body\); else e\.box\.append\(wrap\);/);
  assert.match(inline, /row\.scrollIntoView\(\{ block: 'nearest'/);
  assert.match(js, /result\.scrollIntoView\(\{ block: r\.cleared \? 'nearest' : 'start'/);
  assert.match(js, /\$\{item\.solution\.length\} steps\$\{all \? '' : ' — one per tap'\}/, 'a forced reveal is not "one per tap"');
  assert.match(js, /if \(!all && !reduceMotion\(\)\) setTimeout\(\(\) => solution\.scrollIntoView/, 'a forced reveal does not scroll past the verdict');
  const css = read('site/css/polish.css');
  assert.match(css, /\.w-dock-actions \.card-continue \{ max-width: none; \}/);
  assert.match(css, /\.card-result \{ scroll-margin-top: calc\(var\(--header-h\) \+ 8px\); \}/);
});

test('page r2 / card: the chip is sheet + number only; a Variant chip is not a raw template id', () => {
  const js = read('site/js/screens/card.js');
  assert.match(js, /const chipNo = no\.length > 4 \? \(no\.match\(\/\(\\d\+\)\\s\*\$\/\)\?\.\[1\] \?\? ''\) : no;/);
  assert.match(js, /'◆ Variant ', h\('span\.muted\.mono\.fs-1', `#\$\{item\.seedTag \?\? ''\}`\)/);
  assert.doesNotMatch(js, /`◆ \$\{item\.template\}#/);
});

test('page r2 / equation: the "(skippable on a card, required in a boss)" aside is dropped everywhere', () => {
  const p = { prompt: 'Set up the equation (skippable on a card, required in a boss)' };
  assert.equal(promptOf(p, true), 'Set up the equation');
  assert.equal(promptOf(p, false), 'Set up the equation');
  // the round-1 behaviour is untouched
  assert.equal(promptOf({ prompt: 'Set up the equation (skippable — graded when tried)' }, true), 'Set up the equation (graded when tried)');
});

test('page r2 / pairs: the helper text names an angle THIS figure has, and the placeholder is never a figure name', () => {
  const model = resolve(F1, { rename: { A: 'M', B: 'D', C: 'X', D: 'T', E: 'B', F: 'Y' } });
  const names = angles(model).map((a) => a.name);
  assert.ok(names.length && !names.includes('GFC'), 'the renamed figure has no ∠GFC');
  const res = gradePairs({ type: 'pairs', relation: 'complementary', count: 1 }, [], model);
  assert.equal(res.kind, 'malformed');
  const ex = res.msg.match(/like ∠([A-Z]{3})\)/)?.[1];
  assert.ok(ex, `the message names an example angle: ${res.msg}`);
  assert.ok(names.includes(ex), `∠${ex} is on the figure (${names.join(' ')})`);
  const widget = read('site/js/widgets/pairs.js');
  assert.match(widget, /placeholder: '∠ABC'/);
  assert.doesNotMatch(widget, /like ∠GFC/);
});
