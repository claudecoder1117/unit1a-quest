// tests/fix5-run.test.mjs — fix5 lane "run" (S9 scorecard rough edges 3 and 4), rounds 1–2.
//  3. Today's Page on a 375×667 phone: the answer control sat below the sticky dock (three stacked headers).
//     r1: one slim run-head row, compact chip row, tighter paper/figure on short viewports, card.js revealAnswer().
//     r2: the phone hides ONLY the Page's subtitle (r1 hid every run's — Upgrade lost "hints off, first try only");
//     item 1's whole first row of builder buttons shows above the dock.
//  4. The Summary's family tiles: "Quadratics, a > 1" broke before its comma, and a family tile read bronze right
//     after a "◆ GOLD" card with no word of why. r1: ladder line + legend. r2: the family is NAMED "Quadratics
//     (a > 1)" in data (Summary and Binder agree), the ladder line uses the Binder's "/ 6" fraction plus the next
//     rung and is ≤ 19 characters at every step so it never wraps in its 130 px caption.
//
// r2: the r1 CSS/JS source-string pins are gone (a reformat broke them, a real layout regression passed them).
// Layout is checked by GEOMETRY in a real browser — qa/fix5-run-measure.mjs (answer control vs dock top, stem line
// visible), qa/fix5-run-heads.mjs (run subtitles visible / untruncated on a phone), qa/fix5-run-summary.mjs --set
// A|B (one line box per family caption line at 1–9 Gold Variants). They run here when FIX5_RUN_BROWSER=1
// (Playwright under qa/; ~2 min):  FIX5_RUN_BROWSER=1 node --test tests/fix5-run.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { read, repoPath } from './_helpers.mjs';

import { familyDisplayName, familyProgressLine, FAMILY_LADDER_TEXT } from '../site/js/screens/run.js';
import { familyRarity, foilRule, FAMILY_STEPS, FAMILY_PLATINUM_GOLD, FAMILY_PLATINUM_DAYS } from '../site/js/rarity.js';
import { families, familyById } from '../site/data/modules.js';

const rec = (n, days = 1) => ({ clearsGold: n, goldDays: Array.from({ length: days }, (_, i) => `2026-09-${10 + i}`) });

test('fix5 run / summary: family names carry no comma that can start a line, in data (Summary and Binder share it)', () => {
  assert.equal(familyById['fam-quad-a2'].name, 'Quadratics (a > 1)');
  assert.equal(familyById['fam-quad-a1'].name, 'Quadratics (a = 1)');
  for (const f of families) {
    assert.doesNotMatch(f.name, /,/, `${f.id}: no comma`);
    assert.equal(familyDisplayName(f.name), f.name, `${f.id}: the Summary prints the Binder's name unchanged`);
  }
  // an old save/label with the comma form still renders without it
  assert.equal(familyDisplayName('Quadratics, a > 1'), 'Quadratics (a > 1)');
});

test('fix5 run / summary: the ladder line agrees with familyRarity and the Binder fraction at every step (S4)', () => {
  const expect = {
    0: '0/6 ◆ → Bronze at 1', 1: '1/6 ◆ → Silver at 2', 2: '2/6 ◆ → Gold at 3',
    3: '3/6 ◆ → Platinum', 4: '4/6 ◆ → Platinum', 5: '5/6 ◆ → Platinum',
  };
  for (const [n, s] of Object.entries(expect)) assert.equal(familyProgressLine(rec(+n)), s);
  assert.equal(familyProgressLine(rec(6, 1)), '6/6 ◆ · 1 of 2 days');
  assert.equal(familyProgressLine(rec(6, 2)), '6/6 ◆ · 2 of 2 days');
  assert.equal(familyProgressLine(rec(9, 3)), '6/6 ◆ · 2 of 2 days', 'capped like the Binder (have ≤ 6, days ≤ 2)');
  assert.equal(familyProgressLine(undefined), '0/6 ◆ → Bronze at 1');
  // the next rung the line names is exactly the rung familyRarity reaches at that count
  const ORDER = ['bronze', 'silver', 'gold', 'platinum'];
  for (let n = 0; n <= 9; n++) for (const d of [1, 2]) {
    const line = familyProgressLine(rec(n, d));
    const r = familyRarity(rec(n, d));
    const m = line.match(/→ (\w+)(?: at (\d+))?$/);
    if (m) {
      const next = m[1].toLowerCase();
      const at = m[2] ? +m[2] : FAMILY_PLATINUM_GOLD;
      assert.equal(ORDER.indexOf(next), ORDER.indexOf(r ?? '') + 1, `n=${n}: "${line}" names the rung after ${r}`);
      assert.notEqual(familyRarity(rec(at, 2)), r, `n=${n}: ${at} Gold Variants reaches ${next}`);
      assert.ok(n < at);
    } else {
      assert.ok(n >= FAMILY_PLATINUM_GOLD);
      assert.equal(r, d >= FAMILY_PLATINUM_DAYS ? 'platinum' : 'gold');
    }
    assert.ok([...line].length <= 19, `"${line}" ≤ 19 characters (one line in the 130 px caption at 11 px mono)`);
  }
  assert.deepEqual(FAMILY_STEPS, { bronze: 1, silver: 2, gold: 3 });
  assert.equal(FAMILY_PLATINUM_DAYS, 2);
  // the Binder popover prints the same "have / 6" fraction (capped at 6)
  assert.match(read('site/js/screens/binder.js'), /have: Math\.min\(FAMILY_PLATINUM_GOLD,/);
});

test('fix5 run / summary: the legend prints the same family rule as the Binder tooltip', () => {
  assert.equal(FAMILY_LADDER_TEXT, foilRule('fam-quad-a2'));
  assert.match(FAMILY_LADDER_TEXT, /Bronze \/ Silver \/ Gold at 1 \/ 2 \/ 3 Gold Variants; Platinum at 6 Gold Variants across 2 or more days/);
});

test('fix5 run / page: runHead marks its run kind (the phone hides only the Page subtitle)', () => {
  const js = read('site/js/screens/run.js');
  const calls = [...js.matchAll(/(?<!function )runHead\(\{/g)].map((m) => js.slice(m.index, m.index + 260));
  assert.ok(calls.length >= 3, 'runHead call sites found');
  for (const c of calls) assert.match(c.slice(0, c.indexOf('}))') + 1 || 260), /\bkind\b/, `every runHead call passes kind: ${c.slice(0, 80)}`);
});

const BROWSER = process.env.FIX5_RUN_BROWSER === '1';
const qa = (script, ...args) => spawnSync(process.execPath, [repoPath('qa', script), ...args], { cwd: repoPath(), encoding: 'utf8', timeout: 300000 });
const gate = (r) => assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`.split('\n').filter((l) => /FAIL|Error|error/.test(l)).join('\n') || r.stdout.slice(-2000));

test('fix5 run / geometry: Page items 1–6 and the three cards put the answer control above the dock (375×667, 390×844, 1280×800)', { skip: !BROWSER && 'set FIX5_RUN_BROWSER=1' }, () => {
  for (const vp of [['375', '667'], ['390', '844'], ['1280', '800']]) gate(qa('fix5-run-measure.mjs', '--w', vp[0], '--h', vp[1], '--noshots', '--out', 'qa/screenshots/fix5-run/test'));
});
/* `--kbitem 13` was a PIN ON THE COMPOSER, and the composer moved: the cut deleted
   `js/gen/asn-reason.js`, every ordinal after it shifted, and item 13 is now a widget with no
   <input> — so behind its env gate this arm stopped having a subject and reported
   "pick an item that types" instead of a geometry. `auto` asks Today's Page for its first item that
   types (notes/cut-integrate-r5.md §3).
   READ THE READING, NOT THE NAME: the harness shrinks the WINDOW, and an OS keyboard shrinks only
   the VISUAL viewport, so `data-kb` is `closed` in every arm of this file, including the one that
   passes. What is measured is "at 375×380, with the field focused before the shrink, is it still on
   screen" — and on Today's Page it is not (the field lands 174 px below the fold; focusing while
   already short scrolls it back to 198, so `widgets/base.js keepVisible` works and it is the late
   inset it does not hear). That is a study-layer reading on a Page item, outside the cut, and it is
   filed rather than papered over. */
test('fix5 run / geometry: keyboard open (375×380) keeps the input, key row and Submit in view', { skip: !BROWSER && 'set FIX5_RUN_BROWSER=1' }, () => {
  gate(qa('fix5-run-measure.mjs', '--kb', '--kbitem', 'auto', '--out', 'qa/screenshots/fix5-run/test'));
});
test('fix5 run / geometry: run subtitles (rules) stay visible and untruncated on a phone; the Page hides its own', { skip: !BROWSER && 'set FIX5_RUN_BROWSER=1' }, () => {
  gate(qa('fix5-run-heads.mjs'));
  gate(qa('fix5-run-heads.mjs', '--w', '360', '--h', '640', '--dark'));
});
test('fix5 run / geometry: every family caption line is one line box at 1–9 Gold Variants, 375 and 390, light and dark', { skip: !BROWSER && 'set FIX5_RUN_BROWSER=1' }, () => {
  for (const set of ['A', 'B']) {
    gate(qa('fix5-run-summary.mjs', '--set', set, '--out', 'qa/screenshots/fix5-run/test'));
    gate(qa('fix5-run-summary.mjs', '--set', set, '--w', '390', '--h', '844', '--dark', '--out', 'qa/screenshots/fix5-run/test'));
  }
});
