// tests/fix-boss-miss.test.mjs — keeps the `fix:boss-miss-dock` finding from coming back.
//
// THE FINDING: `#dock .boss-miss .btn` ("Drill 5" after a heart goes, "Skip the setup" when the
// equation box is empty) was a ~19 px link with a 44 px promise. "mock r2" collapses the dock's miss
// strip to one row while the on-screen keyboard is open or the viewport is under 520 px tall, using
// `#dock .boss-miss { max-height: 44px; overflow: hidden }`, and tried to give the link its pixels
// back with `::before { inset: -14px -8px }`. An element's overflow clips its own absolutely
// positioned pseudo, so that hatch was painted nowhere and hit-tested nowhere: 41.8 px tall at
// 375x667 with the keyboard up, and 25.8 px at 844x390, where the strip itself was only 28.8 px tall.
// That is the THIRD instance of the pattern (fix:B1's header chip, fix:stats r2's Stats chips), so the
// lint below is written generically: no control in the app may buy its tap target from a hatch that a
// clipping box can take away.
//
// Static assertions over the shipped CSS plus the two dev tools that measure it — no browser here. The
// measured, cross-engine proof is `node qa/fix-boss-miss.mjs --engine both`; the last test runs it and
// SKIPS when no Playwright browser is installed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT as REPO, read } from './_helpers.mjs';

const NAMES = ['theme', 'base', 'components', 'figure', 'motion', 'widgets', 'screens', 'polish'];
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');      // comments quote CSS, braces and all
const FILES = NAMES.map((n) => [`css/${n}.css`, strip(read(`site/css/${n}.css`))]);

/** PURE: every style rule in cascade order — selector, declarations, and the at-rules enclosing it.
 *  A brace scan, so the one-line `@media (x) { .a { … } }` rules polish.css is full of nest correctly. */
export function cssRules(files) {
  const out = [];
  for (const [file, src] of files) {
    const stack = [];
    let buf = '';
    for (const ch of src) {
      if (ch === '{') { stack.push({ sel: buf.trim().replace(/\s+/g, ' ') }); buf = ''; }
      else if (ch === '}') {
        const top = stack.pop();
        if (top && top.sel && !top.sel.startsWith('@')) {
          out.push({ file, sel: top.sel, body: buf, at: stack.map((s) => s.sel).filter((s) => s.startsWith('@')) });
        }
        buf = '';
      } else buf += ch;
    }
  }
  return out;
}
const RULES = cssRules(FILES);

/** The last value any rule with EXACTLY this selector declares for `prop` (print rules ignored). */
function lastValue(sel, prop, skipAt = /print/) {
  let v = null;
  for (const r of RULES) {
    if (r.sel !== sel || r.at.some((a) => skipAt.test(a))) continue;
    for (const m of r.body.matchAll(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'g'))) v = m[1].trim();
  }
  return v;
}
/** Every value declared for `prop` by rules whose selector ENDS in `tail`, with their context. */
function declarations(tail, prop) {
  const out = [];
  for (const r of RULES) {
    if (!r.sel.endsWith(tail) || r.at.some((a) => /print/.test(a))) continue;
    for (const m of r.body.matchAll(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'g'))) {
      out.push({ file: r.file, sel: r.sel, at: r.at.join(' '), value: m[1].trim() });
    }
  }
  return out;
}

test('fix:boss-miss-dock — the CSS parse actually parsed (no lint below may pass vacuously)', () => {
  assert.ok(RULES.length > 800, `only ${RULES.length} rules parsed`);
  assert.ok(RULES.some((r) => r.sel.endsWith('#dock .boss-miss .btn')), '#dock .boss-miss .btn not found');
  assert.ok(RULES.some((r) => r.sel === '.boss-miss'), '.boss-miss not found');
});

/* --------------------------------------------- the strip is a real row, not a clipped one */

test('fix:boss-miss-dock — nothing caps the miss strip at a height its own control cannot fit in', () => {
  // A `max-height` on a strip that holds a --tap control is the defect itself: the control cannot be
  // 44 px inside a 44 px border box that also spends padding and hairlines, and `overflow: hidden`
  // then hides the difference instead of reporting it. "mock r2" still DECLARES the cap (that block
  // belongs to another lane and is append-only), so what is pinned here is the value that survives the
  // cascade — for BOTH collapsed selectors, because `:root[data-kb="open"] #dock …` outranks
  // `#dock …` on specificity and a `none` on the plain one would never reach it.
  for (const sel of [':root[data-kb="open"] #dock .boss-miss', '#dock .boss-miss']) {
    assert.equal(lastValue(sel, 'max-height'), 'none',
      `${sel} ends up capped again — size the row from its control (the row is --tap tall because the link is), not with a clip`);
  }
  // …and the clip that the cap needed is gone with it, so a longer skill name or text zoom grows the
  // strip instead of being cut off.
  assert.equal(lastValue(':root[data-kb="open"] #dock .boss-miss', 'overflow'), 'visible',
    'the keyboard-open strip still clips its own content');
  const capped = declarations('#dock .boss-miss', 'max-height').filter((d) => d.value !== 'none');
  assert.ok(capped.length <= 2,
    `a third max-height cap appeared on the dock strip (${capped.map((d) => d.at + ' ' + d.value).join('; ')}) — check it is overridden, then update this count`);
});

test('fix:boss-miss-dock — the miss link IS the 44px box, in both collapsed contexts', () => {
  for (const sel of [':root[data-kb="open"] #dock .boss-miss .btn', '#dock .boss-miss .btn']) {
    assert.equal(lastValue(sel, 'min-height'), 'var(--tap)',
      `${sel} must end up --tap tall: the last word on its height was min-height: 0 (the hatch era)`);
    assert.equal(lastValue(sel, 'min-width'), 'var(--tap)',
      `${sel} needs the horizontal half of the 44x44 target too`);
  }
  // and the hatch is switched off rather than left to fight the box
  assert.equal(lastValue(':root[data-kb="open"] #dock .boss-miss .btn::before', 'content'), 'none',
    'the keyboard-open hatch must be turned off (content: none) once the control is the target');
  assert.equal(lastValue('#dock .boss-miss .btn::before', 'content'), 'none',
    'the short-viewport hatch must be turned off too');
  // one token owns the number
  assert.match(read('site/css/theme.css'), /--tap:\s*44px/, '--tap is no longer 44px: re-derive this ticket');
});

/* --------------------------------------------- the generic lint: no hit box bought from a clip */

/** PURE: controls whose tap target depends on a negative-inset pseudo that a clip could remove.
 *  `clippers` maps a selector tail to the rule that clips it, as the CSS declares it. */
export function hatchedControls(rules) {
  const out = [];
  for (const r of rules) {
    if (!/::(before|after)$/.test(r.sel)) continue;
    if (!/position\s*:\s*absolute/.test(r.body)) continue;
    if (/content\s*:\s*none/.test(r.body)) continue;                  // switched off
    if (!/inset[^:]*:\s*[^;]*-\d/.test(r.body)) continue;             // no negative inset: not a hatch
    out.push({ file: r.file, sel: r.sel.replace(/::(before|after)$/, ''), at: r.at.join(' ') });
  }
  return out;
}

test('fix:boss-miss-dock — the hatch lint can fail (its own negative control)', () => {
  const synthetic = cssRules([['css/x.css', '.a::before { content: ""; position: absolute; inset: -14px -8px }']]);
  assert.equal(hatchedControls(synthetic).length, 1, 'the lint must flag a live negative-inset hatch');
  const off = cssRules([['css/x.css', '.a::before { content: none; position: absolute; inset: -14px -8px }']]);
  assert.equal(hatchedControls(off).length, 0, 'and must not flag one that is switched off');
});

test('fix:boss-miss-dock — no control still buys its 44px from a hatch inside a clipping box', () => {
  // Three rounds found the same defect three times (fix:B1 header chip, fix:stats r2 Stats chips, this
  // one). Every remaining live hatch must belong to an element that is ALREADY a --tap box, so the
  // pseudo only paints decoration and losing it to a clip costs the student nothing.
  const offenders = [];
  for (const h of hatchedControls(RULES)) {
    const tall = lastValue(h.sel, 'height') === 'var(--tap)' || lastValue(h.sel, 'min-height') === 'var(--tap)';
    if (!tall) offenders.push(`${h.file}: ${h.at} ${h.sel} — hatch with no --tap box behind it`);
  }
  assert.deepEqual(offenders, [],
    'a tap target is being bought with a negative-inset pseudo again: make the control the box (notes/FIX-boss-miss-dock.md)');
});

/* --------------------------------------------- the auditor may not go blind to it again */

test('fix:boss-miss-dock — the state catalog renders the strip INSIDE the dock', () => {
  const cat = read('qa/audit-states.mjs');
  const roots = [...cat.matchAll(/add\('([\w-]+)',[\s\S]{0,400}?'(#dock \.boss-miss[^']*)'/g)].map((m) => m[1]);
  assert.ok(roots.length >= 2,
    `no audit state proves #dock .boss-miss rendered (found ${roots.length}) — without one the auditor cannot see this defect at all (notes/FIX-qa.md "Requests")`);
  assert.ok(cat.includes('data-kb'), 'no state exercises the keyboard-open copy of the collapsed strip');
});

test('fix:boss-miss-dock — the tap-target detector clips where the browser clips (the padding edge)', () => {
  const audit = read('qa/layout-audit.mjs');
  assert.match(audit, /border' \+ k \+ 'Width'|borderTopWidth/,
    'qa/layout-audit.mjs no longer subtracts the clipper\'s borders: a 1px hairline is enough to hide this whole defect');
  assert.match(audit, /plant-hairline-hit/, 'the plant for that precision is gone from the PLANTED list');
  assert.match(read('qa/audit/selftest.html'), /plant-hairline-strip/, 'the planted defect itself is gone from selftest.html');
  assert.match(read('qa/audit/selftest-clean.html'), /ctl-hairline/, 'the silent twin is gone from the clean control page');
});

/* --------------------------------------------- the measured proof */

function browsersAvailable() {
  if (!existsSync(path.join(REPO, 'qa', 'node_modules', 'playwright'))) return false;
  const probe = spawnSync(process.execPath, ['-e', `
    const { createRequire } = require('node:module');
    const req = createRequire(${JSON.stringify(path.join(REPO, 'qa', 'shot.mjs'))});
    req('playwright').chromium.launch().then(b => b.close()).then(() => process.exit(0), () => process.exit(3));
  `], { cwd: REPO, timeout: 90_000, encoding: 'utf8' });
  return probe.status === 0;
}

test('fix:boss-miss-dock — measured: 44x44 hit boxes on a real Boss miss', (t) => {
  if (!browsersAvailable()) { t.skip('no Playwright browser installed (cd qa && npx playwright install)'); return; }
  const run = spawnSync(process.execPath, ['qa/fix-boss-miss.mjs', '--engine', 'chromium'],
    { cwd: REPO, timeout: 600_000, encoding: 'utf8' });
  assert.equal(run.status, 0, `qa/fix-boss-miss.mjs failed:\n${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /ALL PASS/);
  // and the numbers, so a "pass" that measured nothing cannot slip through
  const short = run.stdout.split('\n').filter((l) => /844x390/.test(l));
  assert.ok(short.length >= 2, `no 844x390 row in the table:\n${run.stdout}`);
  for (const l of short) assert.match(l, /strip 44\b/, `the landscape-phone strip is not --tap tall: ${l}`);
  assert.match(run.stdout, /hit 45\.3x44|hit 46\.3x44/, `no measured 44px-tall Drill 5 hit box:\n${run.stdout}`);
});
