// tests/fix-stats.test.mjs — keeps the two `fix:stats r2` findings from coming back.
//
// Finding V1: the six Stats section chips (`.st-jump .chip`) were 32 px tall tap targets, 12 px under
// the S5 44 px rule. r1 had tried to buy the pixels with `::before { position: absolute; inset: -6px }`,
// which base.css's `.chip { overflow: hidden }` clips away — the promise was never painted and never
// hit-tested. The fix makes the chip itself the 44 px box and paints the 32 px pill INSIDE it.
//
// Finding V3: `@container stats (min-width: 720px)` asked for more width than the container can ever
// have — `.screen` caps it at `--col` = 680 px — so the wide Stats layout was dead CSS and every
// desktop rendered the phone rows. The generic lint below (a threshold may not exceed its container's
// own cap) is the test that would have caught it, and it is written as a pure function with its own
// negative control so a green run means the lint can still fail.
//
// Static assertions over the shipped CSS — no browser. The measured, cross-engine proof is
// `node qa/fix-stats-r2.mjs` (chromium + webkit, 375 → 2560, both themes); the last test runs it and
// SKIPS when no Playwright browser is installed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(REPO, p), 'utf8');
const NAMES = ['theme', 'base', 'components', 'figure', 'motion', 'widgets', 'screens', 'polish'];
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');            // comments quote CSS, braces and all
const FILES = NAMES.map((n) => [`css/${n}.css`, strip(read(`site/css/${n}.css`))]);

/** PURE: every style rule in cascade order with its selector, its declarations and the at-rule
 *  conditions enclosing it. A brace scan, so one-line at-rules (`@media (x) { .a { … } }`, which this
 *  file is full of) nest exactly like multi-line ones. */
export function rulesWithContext(files) {
  const out = [];
  for (const [file, src] of files) {
    const stack = [];
    let buf = '';
    for (const ch of src) {
      if (ch === '{') { stack.push({ sel: buf.trim().replace(/\s+/g, ' '), body: '' }); buf = ''; }
      else if (ch === '}') {
        const top = stack.pop();
        if (top && !top.sel.startsWith('@') && top.sel) {
          out.push({ file, sel: top.sel, body: buf, at: stack.map((s) => s.sel).filter((s) => s.startsWith('@')) });
        }
        buf = '';
      } else buf += ch;
    }
  }
  return out;
}
const RULES = rulesWithContext(FILES);

/** The last value declared for `prop` by any rule whose selector text is exactly `sel`, ignoring
 *  rules that only apply to print (`@media print` re-declares `.screen`'s cap as `none !important`,
 *  which says nothing about the screen layout these lints are about). Width-keyed overrides are NOT
 *  ignored — a per-viewport re-break of a tap target is exactly what should fail here. */
function lastValue(sel, prop, skipAt = /print/) {
  let v = null;
  for (const r of RULES) {
    if (r.sel !== sel) continue;
    if (r.at.some((a) => skipAt.test(a))) continue;
    for (const m of r.body.matchAll(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'g'))) v = m[1].trim();
  }
  return v;
}

test('fix:stats r2 — the CSS parse actually parsed (no lint below may pass vacuously)', () => {
  assert.ok(RULES.length > 800, `only ${RULES.length} rules parsed`);
  assert.ok(RULES.some((r) => r.sel === '.st-jump .chip'), '.st-jump .chip not found');
  assert.ok(RULES.some((r) => r.at.some((a) => a.startsWith('@container stats'))), 'no @container stats rules found');
});

/* ------------------------------------------------------------------ V3: dead container thresholds */

/** PURE: the `@container <name> (min-width: N)` thresholds a set of CSS sources declares. */
export function containerThresholds(files) {
  const out = [];
  for (const [file, src] of files) {
    src.split('\n').forEach((ln, i) => {
      const m = /@container\s+([a-zA-Z_-][\w-]*)\s*\(\s*min-width:\s*([\d.]+)px/.exec(ln);
      if (m) out.push({ file, line: i + 1, name: m[1], px: +m[2] });
    });
  }
  return out;
}

/** PURE: thresholds that ask for more width than their container can ever have. `caps` maps a
 *  container name to the widest inline size its element can reach; names absent from `caps` are not
 *  judged (their host is uncapped, or lives on a route this lint does not model). */
export function deadThresholds(files, caps) {
  return containerThresholds(files).filter((t) => caps[t.name] !== undefined && t.px > caps[t.name]);
}

test('fix:stats r2 — the dead-threshold lint can fail (its own negative control)', () => {
  const synthetic = [['css/x.css', '@container stats (min-width: 720px) { .a { color: red } }']];
  assert.equal(deadThresholds(synthetic, { stats: 680 }).length, 1,
    'the lint must flag a 720px threshold on a 680px container');
  assert.equal(deadThresholds(synthetic, { stats: 720 }).length, 0, 'and must not flag a reachable one');
  assert.equal(deadThresholds(synthetic, {}).length, 0, 'and must not judge a container it has no cap for');
});

test('fix:stats r2 — no @container threshold exceeds its container’s own cap', () => {
  // `.screen { max-width: var(--col) }` (base.css) caps the stats container; nothing lifts it for
  // Stats (the card screen's `:has()` rule is the only lift in the app, and Stats hosts no card).
  const col = /--col:\s*(\d+)px/.exec(FILES.find(([f]) => f === 'css/theme.css')[1]);
  assert.ok(col, '--col not found in theme.css');
  const cap = +col[1];
  assert.equal(lastValue('.screen', 'max-width'), 'var(--col)',
    '.screen no longer caps at --col — re-derive the stats thresholds before changing this test');
  const lifted = RULES.filter((r) => /(^|[^-\w])\.stats\b/.test(r.sel) && /max-width\s*:/.test(r.body))
    .map((r) => `${r.file}: ${r.sel}`);
  assert.deepEqual(lifted, [],
    `a rule lifts the Stats cap (${lifted.join('; ')}) — if that is deliberate the thresholds must be re-derived, not this assertion relaxed`);

  const dead = deadThresholds(FILES, { stats: cap });
  assert.deepEqual(dead.map((d) => `${d.file}:${d.line} @container ${d.name} (min-width: ${d.px}px) > ${cap}px`), [],
    'a dead @container threshold: the rule can never match, so that layout never renders');

  // and the wide Stats layout must actually be declared — the fix is a live rule, not a deletion
  const stats = containerThresholds(FILES).filter((t) => t.name === 'stats');
  assert.ok(stats.length >= 2, 'both the screens.css and the polish.css stats branches should exist');
  for (const t of stats) assert.ok(t.px <= cap && t.px >= 520, `@container stats min-width ${t.px}px is out of range`);
});

test('fix:stats r2 — the Stats rows change shape on the CONTAINER, never on the viewport', () => {
  // The `binder r2` @media (min|max-width: 719/720px) stats rules were folded into @container stats.
  const offenders = RULES
    .filter((r) => /\.st-(skills|bars)\b/.test(r.sel) && /grid-template/.test(r.body))
    .filter((r) => r.at.some((a) => /@media[^@]*(min|max)-width/.test(a)))
    .map((r) => `${r.file}: ${r.sel} inside ${r.at.join(' ')}`);
  assert.deepEqual(offenders, [],
    'the Stats rows must read the stats container, not the viewport (notes/LAYOUT-ROOT.md §"@container or @media?")');
  // the same rules, under @container, must exist — or the lint above is satisfied by nothing at all
  const held = RULES.filter((r) => /\.st-(skills|bars)\b/.test(r.sel) && /grid-template/.test(r.body)
    && r.at.some((a) => a.startsWith('@container stats')));
  assert.ok(held.length >= 4, `only ${held.length} container-keyed Stats templates found`);
});

/* ------------------------------------------------------------------ V1: the chip is the tap target */

/** PURE: the effective per-side inset of a pseudo selector after the cascade of the rules given
 *  (`inset` / `inset-block` / `inset-inline` shorthands expanded, later declarations winning). */
export function effectiveInsets(rules, selRe) {
  const per = new Map();
  const put = (sel, side, val) => { const m = per.get(sel) || {}; m[side] = val; per.set(sel, m); };
  for (const r of rules) {
    if (!selRe.test(r.sel)) continue;
    if (!per.has(r.sel)) per.set(r.sel, {});
    for (const m of r.body.matchAll(/(?:^|;)\s*(inset|inset-block|inset-inline|top|right|bottom|left)\s*:\s*([^;]+)/g)) {
      const prop = m[1], parts = m[2].trim().split(/\s+/);
      if (prop === 'inset') {
        const [a, b = a, c = a, d = b] = parts;
        put(r.sel, 'top', a); put(r.sel, 'right', b); put(r.sel, 'bottom', c); put(r.sel, 'left', d);
      } else if (prop === 'inset-block') {
        const [a, b = a] = parts; put(r.sel, 'top', a); put(r.sel, 'bottom', b);
      } else if (prop === 'inset-inline') {
        const [a, b = a] = parts; put(r.sel, 'left', a); put(r.sel, 'right', b);
      } else put(r.sel, prop, parts[0]);
    }
  }
  return per;
}

test('fix:stats r2 — no .chip buys its hit box with a negative-inset pseudo', () => {
  // base.css clips every `.chip` (`overflow: hidden`, "truncates before it can overlap"), so a
  // negative inset on a chip pseudo is a hit area that is never painted and never hit-tested. Only
  // the cascade's WINNING value counts, which is why the insets are expanded per side.
  const per = effectiveInsets(RULES, /\.chip\b[^,{]*::(before|after)$/);
  assert.ok(per.size >= 2, `only ${per.size} chip pseudo selectors found — this lint would pass vacuously`);
  // negative control for the expansion: a later inset-block/inset-inline pair overrides `inset`
  const probe = effectiveInsets(
    [{ sel: '.x::before', body: 'inset: -6px' }, { sel: '.x::before', body: 'inset-block: 6px; inset-inline: 0' }],
    /\.x::before$/);
  assert.deepEqual(probe.get('.x::before'), { top: '6px', right: '0', bottom: '6px', left: '0' });
  assert.deepEqual(
    effectiveInsets([{ sel: '.x::before', body: 'inset: -6px' }], /\.x::before$/).get('.x::before'),
    { top: '-6px', right: '-6px', bottom: '-6px', left: '-6px' });

  for (const [sel, sides] of per) {
    for (const [side, val] of Object.entries(sides)) {
      assert.ok(!val.startsWith('-'),
        `${sel} { ${side}: ${val} } — a clipped .chip cannot grow a hit box outside itself; make the chip the box (see the fix:stats r2 / fix:B1 blocks in polish.css)`);
    }
  }
});

test('fix:stats r2 — the Stats chips and Drill 5 are 44px boxes from one token', () => {
  assert.equal(lastValue('.st-jump .chip', 'height'), 'var(--tap)',
    '.st-jump .chip must BE the 44px target (height: var(--tap)), with the pill painted inside by ::before');
  assert.equal(lastValue('.st-jump .chip', 'min-width'), 'var(--tap)',
    '.st-jump .chip needs the horizontal half of the 44x44 target too');
  assert.equal(lastValue('.st-jump .chip', 'overflow'), 'hidden',
    "base.css's clip guard must stay on: a chip truncates instead of printing over its neighbours");
  assert.equal(lastValue('.st-skill-drill', 'min-height'), 'var(--tap)',
    "Drill 5 keeps base.css .btn's min-height: var(--tap) — no 32/36px override, no pseudo hatch");
  const pill = RULES.filter((r) => r.sel === '.st-jump .chip::before').pop();
  assert.ok(pill && /border-radius\s*:\s*999px/.test(pill.body) && /background\s*:/.test(pill.body),
    '.st-jump .chip::before must paint the pill (border + radius + background) inside the 44px box');
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

test('fix:stats r2 — measured: 44px hit boxes and a live wide layout', (t) => {
  if (!browsersAvailable()) { t.skip('no Playwright browser installed (cd qa && npx playwright install)'); return; }
  const run = spawnSync(process.execPath,
    ['qa/fix-stats-r2.mjs', '--engine', 'chromium', '--theme', 'light', '--widths', '375,1440'],
    { cwd: REPO, timeout: 300_000, encoding: 'utf8' });
  assert.equal(run.status, 0, `qa/fix-stats-r2.mjs failed:\n${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /ALL PASS/);
  // and the numbers, so a "pass" that measured nothing cannot slip through
  const wide = run.stdout.split('\n').find((l) => l.startsWith('1440: '));
  assert.ok(wide, `no 1440 track row in the table:\n${run.stdout}`);
  assert.match(wide, /\.st-skills li \[190px [\d.]+px 46px 200px 64px\]/,
    `the wide Stats row did not render at 1440 (the V3 regression): ${wide}`);
});
