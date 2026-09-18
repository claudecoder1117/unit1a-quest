// tests/layout-root.test.mjs — keeps the LAYOUT-ROOT fix from rotting back (ticket LAYOUT-ROOT).
//
// The bug: every responsive rule in the app was keyed to the VIEWPORT, but the card engine is
// hosted at widths that have nothing to do with the viewport. At 1900x1200 onboarding's placement
// laid out `minmax(0, 680) 320` inside a 336 px paper, the stem's track resolved to 0 px, and the
// question printed one letter per line.
//
// These are STATIC assertions over the shipped CSS/JS — no browser, so they run everywhere and fast.
// The measured, cross-engine proof lives in `node qa/layout-root.mjs` (chromium + webkit, ten
// widths, both themes); the last test below runs it for the one route that regressed, and SKIPS
// when no Playwright browser is installed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(REPO, p), 'utf8');
const CSS_FILES = ['theme', 'base', 'components', 'figure', 'motion', 'widgets', 'screens', 'polish']
  .map((n) => [`site/css/${n}.css`, read(`site/css/${n}.css`)]);
const ALL_CSS = CSS_FILES.map(([, src]) => src).join('\n');
const CARD_JS = read('site/js/screens/card.js');

/** Every `grid-template-columns` / `grid-template-areas` declaration with the SELECTOR it belongs
 *  to and the at-rule conditions that enclose it. Brace depth is tracked per line and a block is
 *  popped only when the depth falls back below the one it opened at, so a one-line `sel { … }`
 *  inside a block neither closes that block nor loses its own selector. */
function gridDecls() {
  const out = [];
  for (const [file, src] of CSS_FILES) {
    const stack = [];            // { kind: 'at' | 'sel', cond, depth }
    let depth = 0;
    src.split('\n').forEach((line, i) => {
      const nc = line.replace(/\/\*[\s\S]*?\*\//g, '');
      const at = nc.match(/@(media|container|supports)([^{]*)\{/);
      if (at) stack.push({ kind: 'at', cond: `${at[1]}${at[2].trim()}`, depth });
      else {
        const sel = nc.match(/^\s*([^@{}][^{}]*?)\s*\{/);
        if (sel) stack.push({ kind: 'sel', cond: sel[1].trim(), depth });
      }
      if (/grid-template-(columns|areas)\s*:/.test(nc)) {
        const sels = stack.filter((s) => s.kind === 'sel');
        out.push({
          file, line: i + 1, text: line.trim(),
          sel: sels.length ? sels[sels.length - 1].cond : '',
          media: stack.filter((s) => s.kind === 'at' && s.cond.startsWith('media')).map((s) => s.cond).join(' && '),
          container: stack.filter((s) => s.kind === 'at' && s.cond.startsWith('container')).map((s) => s.cond).join(' && '),
        });
      }
      depth += (nc.match(/\{/g) || []).length - (nc.match(/\}/g) || []).length;
      while (stack.length && depth <= stack[stack.length - 1].depth) stack.pop();
    });
  }
  return out;
}

test('LAYOUT-ROOT: the app has query containers at all (it had none)', () => {
  // the regression this whole ticket exists for: `grep -rn "container-type" site/css` → nothing
  assert.match(ALL_CSS, /container-type:\s*inline-size/, 'no container queries in site/css');
  for (const name of ['cardhost', 'paper', 'answers', 'run', 'stats', 'report']) {
    assert.match(ALL_CSS, new RegExp(`container-name:\\s*${name}\\b`), `no container named "${name}"`);
    assert.match(ALL_CSS, new RegExp(`@container\\s+${name}\\s*\\(`), `nothing queries the "${name}" container`);
  }
});

test('LAYOUT-ROOT: card.js wraps every mount in the .card-host query container and removes it again', () => {
  // A CSS container cannot query itself, so the card's own columns can only be driven by a wrapper.
  assert.match(CARD_JS, /h\('div\.card-host'\)/, 'card.js no longer creates the .card-host wrapper');
  assert.match(CARD_JS, /cardHost\.append\(root\)/, '.card-host must wrap the .card-screen');
  assert.match(CARD_JS, /host\.append\(cardHost\)/, '.card-host must be what is appended to the host');
  assert.match(CARD_JS, /cardHost\.remove\(\)/, 'destroy() must take the wrapper with the card');
  assert.match(ALL_CSS, /\.card-host\s*\{[^}]*container-type:\s*inline-size/,
    '.card-host must be the inline-size container');
});

test('LAYOUT-ROOT: the card decides its rail from its HOST width, never from the viewport', () => {
  const decls = gridDecls();
  // .card-screen's two-column (rail) template must live in a @container, not an @media
  const cardScreen = decls.filter((d) => /(^|[\s,])\.card-screen$/.test(d.sel) || /"head side"/.test(d.text));
  assert.ok(cardScreen.length, 'no .card-screen grid template found at all');
  for (const d of cardScreen) {
    // the rail is the row "stage side"; "side side" is a full-width Scratch row, not a rail
    if (!/"stage side"/.test(d.text)) continue;
    assert.ok(d.container.includes('cardhost'),
      `${d.file}:${d.line} puts the card's rail behind "${d.media || 'no condition'}" instead of @container cardhost`);
  }
});

test('LAYOUT-ROOT: no min-width @media has the last word on a re-hostable component\'s columns', () => {
  // These components are mounted inside the card engine (or inside a run), so a viewport rule is
  // always a guess about their width. widgets.css and two earlier polish blocks are owned by other
  // lanes, so their legacy @media rules stay put — but a LATER @container rule must then govern the
  // same selector in BOTH directions, or the legacy rule still decides at some width.
  const REHOSTABLE = ['.card-screen', '.card-paper', '.card-parts', '.w-fields', '.w-pairs-cols',
    '.sum-bar', '.sum-stats', '.st-skills li', '.st-bars li', '.report-split'];
  const decls = gridDecls();
  const unfixed = [];
  for (const d of decls) {
    if (!/min-width/.test(d.media) || d.container) continue;
    if (/grid-template-columns:\s*none/.test(d.text)) continue;   // a reset that switches a legacy rule OFF
    for (const sel of REHOSTABLE) {
      if (!d.sel.includes(sel)) continue;
      const touching = decls.filter((o) => o.sel.includes(sel));
      const wider = touching.some((o) => /min-width/.test(o.container));
      // the narrow form may be a @container max-width rule OR the unconditional base template
      const narrower = touching.some((o) => /max-width/.test(o.container) || (!o.media && !o.container));
      if (!wider || !narrower) unfixed.push(`${d.file}:${d.line} [${d.media}] ${d.sel} (wider:${wider} narrower:${narrower})`);
    }
  }
  assert.deepEqual(unfixed, [],
    'a viewport rule still decides these components\' columns at some width — add the @container pair');
});

test('LAYOUT-ROOT: the retired one-host hack is gone and the general host rule replaced it', () => {
  const live = ALL_CSS.replace(/\/\*[\s\S]*?\*\//g, '');   // comments may name the retired hack
  assert.ok(!/\.run-screen:has\(>\s*\.run-stage\s*>\s*\.card-screen\)/.test(live),
    'the W4 one-host `max-width: none` hack is back — it fixes #/run/page and leaves every other host broken');
  assert.match(ALL_CSS, /\.screen:has\(\.card-screen\)/,
    'no general rule gives a card-hosting screen the shell width');
  // and it must match at ANY depth, so a host that nests deeper is covered too
  const rule = ALL_CSS.match(/\.screen:has\(\.card-screen\)[^{]*\{[^}]*\}/)[0];
  assert.ok(!rule.includes('>'), `the host rule must not require a direct child: ${rule}`);
  assert.match(rule, /max-width:\s*none/);
});

test('LAYOUT-ROOT: every text track has a floor — no `minmax(0, …)` on a column that holds words', () => {
  // A 0 px minimum is what let the stem collapse. The two-column forms that hold text all carry a
  // ch floor; `minmax(0, 1fr)` survives only on tracks that hold a BAR or a figure, never words.
  const bad = [];
  for (const d of gridDecls()) {
    if (!/grid-template-columns/.test(d.text)) continue;
    if (/minmax\(\s*0\s*,\s*var\(--col\)\s*\)/.test(d.text)) bad.push(`${d.file}:${d.line} ${d.text}`);
  }
  assert.deepEqual(bad, [],
    'the shell content column must never be `minmax(0, var(--col))` — it can resolve to 0 px');
  // the card's own two tracks, explicitly
  assert.match(ALL_CSS, /grid-template-columns:\s*minmax\(min\(100%,\s*30ch\),\s*var\(--col\)\)\s*var\(--rail\)/,
    'the card/shell content column lost its ch floor');
  assert.match(ALL_CSS, /grid-template-columns:\s*minmax\(18ch,\s*1fr\)\s*minmax\(0,\s*280px\)/,
    'the paper lost the 18ch floor on the stem track');
  assert.match(ALL_CSS, /grid-template-columns:\s*minmax\(18ch,\s*1fr\)\s*minmax\(0,\s*340px\)/,
    'the pairs paper lost the 18ch floor on the stem track');
});

test('LAYOUT-ROOT: the paper splits with named areas so the figure spans the stem AND the note', () => {
  // auto-placement dropped the figure into the row after the note: stem top-left, note bottom-left,
  // figure two rows down on the right, a quarter of the paper blank.
  const areas = ALL_CSS.match(/grid-template-areas:\s*"no no"[^;]*;/g) || [];
  assert.ok(areas.length >= 2, 'the paper no longer uses named areas for its two-column form');
  for (const a of areas) {
    assert.match(a, /"stem fig"/, `${a}: the figure must share the stem's row`);
    assert.match(a, /"note fig"/, `${a}: the figure must span the note's row too`);
    assert.match(a, /"pad fig"/, `${a}: without the filler row the figure's height pushes the note off the stem`);
  }
});

test('LAYOUT-ROOT: one token owns the sticky stack, so two sticky bands cannot hide each other', () => {
  // the card's rail stuck at header + 16 = 72 px while a run head parked at 56–102 px, so the
  // "Scratch" heading was behind it for the whole scroll.
  assert.match(read('site/css/theme.css'), /--stack-top:\s*56px/, 'theme.css lost the --stack-top token');
  const railOffsets = ALL_CSS.match(/position:\s*sticky;\s*top:\s*calc\([^)]*\)/g) || [];
  const viewportOnly = railOffsets.filter((r) => /var\(--header-h\)/.test(r) && !/--stack-top/.test(r));
  // the app header itself and the screen-level bands legitimately sit at header height; anything
  // that sticks INSIDE the content must use the token.
  for (const r of viewportOnly) {
    assert.ok(/\+\s*0px/.test(r) || !/\+/.test(r),
      `a sticky offset inside the content still assumes the app header is the only band: ${r}`);
  }
  assert.match(ALL_CSS, /\.card-screen\s*>\s*\.card-side\s*\{\s*position:\s*sticky;\s*top:\s*calc\(var\(--stack-top\)/,
    "the card's rail must park below --stack-top");
  for (const host of ['.ob-run', '.boss-screen', '.mock-screen']) {
    assert.ok(new RegExp(`${host.replace('.', '\\.')}[^{]*\\{[^}]*--stack-top`).test(ALL_CSS),
      `${host} adds its own sticky band but does not raise --stack-top`);
  }
});

test('LAYOUT-ROOT: no container wraps a position:fixed overlay (layout containment would trap it)', () => {
  // container-type: inline-size applies layout containment, which makes the element the containing
  // block for fixed descendants. .mock-screen / .mock-main host .mock-dialog and the fixed question
  // map, so they are deliberately NOT containers (notes/LAYOUT-ROOT.md §exceptions).
  const containerSelectors = [];
  for (const [, src] of CSS_FILES) {
    for (const m of src.matchAll(/^([^@{}\n][^{}\n]*)\{[^}]*container-type:\s*inline-size/gm)) {
      containerSelectors.push(...m[1].split(',').map((s) => s.trim()).filter(Boolean));
    }
  }
  assert.ok(containerSelectors.length, 'no container-type rules found');
  for (const forbidden of ['.mock-screen', '.mock-main', '#view', 'body', '.screen']) {
    assert.ok(!containerSelectors.includes(forbidden),
      `${forbidden} must not be an inline-size container — it hosts a position:fixed overlay`);
  }
  // the ones that must be containers
  for (const wanted of ['.card-host', '.card-stage', '.run-screen', '.report-screen']) {
    assert.ok(containerSelectors.includes(wanted), `${wanted} should be an inline-size container`);
  }
});

/* ------------------------------------------------------------------ the measured proof */
function browsersAvailable() {
  if (!existsSync(path.join(REPO, 'qa', 'node_modules', 'playwright'))) return false;
  const probe = spawnSync(process.execPath, ['-e', `
    const { createRequire } = require('node:module');
    const req = createRequire(${JSON.stringify(path.join(REPO, 'qa', 'shot.mjs'))});
    req('playwright').chromium.launch().then(b => b.close()).then(() => process.exit(0), () => process.exit(3));
  `], { cwd: REPO, timeout: 90_000, encoding: 'utf8' });
  return probe.status === 0;
}

test('LAYOUT-ROOT: measured — the placement card at 1900 px passes every invariant', (t) => {
  if (!browsersAvailable()) { t.skip('no Playwright browser installed (cd qa && npx playwright install)'); return; }
  const run = spawnSync(process.execPath,
    ['qa/layout-root.mjs', '--engines', 'chromium', '--widths', '1900', '--routes', 'place-1,run-page,card-ang10'],
    { cwd: REPO, timeout: 300_000, encoding: 'utf8' });
  assert.equal(run.status, 0,
    `qa/layout-root.mjs found layout defects:\n${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /ALL PASS/);
  // and the numbers, so a "pass" that measured nothing cannot slip through
  const place = run.stdout.split('\n').find((l) => l.includes('place-1'));
  assert.ok(place, `no place-1 row in the table:\n${run.stdout}`);
  const ch = Number(place.trim().split(/\s+/)[4]);
  assert.ok(ch >= 18, `the placement stem measured ${ch}ch at 1900 px (the bug was 0ch): ${place}`);
});
