// tests/fix-home-r3.test.mjs — keeps the `fix:home r3` findings from coming back.
//
// The finding: Home's "Weak spots" rows printed the skill name straight through the miss number
// ("Always/Sometimes/Ne50") at 320x568 and 375x667, in chromium AND webkit, in both themes, at the
// default text size and worse at 125 %. Root cause in two halves (notes/FIX-home.md):
//   (a) a TRACK floor is not a CONTENT floor — `overflow-wrap: break-word` does not reduce
//       min-content, so `.weak-main`'s auto column stayed as wide as "Always/Sometimes/Never:" and
//       the ink landed on the number;
//   (b) `.weak-row` had no stacked form at any width, so there was no "below the threshold it is one
//       column" for the name to fall back to (notes/LAYOUT-ROOT.md).
// Found while fixing it, same family, same screen: `.skill-name`'s 2-line clamp HID the end of
// "Always/Sometimes/Never: Points, Lines, Planes" at 320 / 375 / 1440 / 1900.
// And found by this ticket's own 200 %-text control: `min(100%, Nch)` clamps each floor against the
// whole grid, never against the grid MINUS its other tracks, so a multi-floor row can still overflow.
//
// Static assertions over the shipped CSS — no browser. The measured, cross-engine proof is
// `node qa/fix-home-r3.mjs` (chromium + webkit, 320 → 2560, both themes, 100/125/150 % text); the
// last test runs it and SKIPS when no Playwright browser is installed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(REPO, p), 'utf8');
const NAMES = ['theme', 'base', 'components', 'figure', 'motion', 'widgets', 'screens', 'polish'];
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');       // the comments quote CSS, braces and all
const FILES = NAMES.map((n) => [`css/${n}.css`, strip(read(`site/css/${n}.css`))]);

/** PURE: every style rule in cascade order with its selector, declarations and enclosing at-rules.
 *  A brace scan, so one-line at-rules nest exactly like multi-line ones. (Same shape as
 *  tests/fix-stats.test.mjs's helper; duplicated rather than imported so importing this file cannot
 *  run that file's tests.) */
export function rulesWithContext(files) {
  const out = [];
  for (const [file, src] of files) {
    const stack = [];
    let buf = '';
    for (const ch of src) {
      if (ch === '{') { stack.push({ sel: buf.trim().replace(/\s+/g, ' ') }); buf = ''; }
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
const ALL = FILES.map(([, s]) => s).join('\n');

/** The winning value of `prop` for rules whose selector is exactly `sel`, per at-rule context. */
function decls(sel, prop) {
  const out = [];
  for (const r of RULES) {
    if (r.sel !== sel) continue;
    for (const m of r.body.matchAll(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'g'))) {
      out.push({ at: r.at.join(' '), value: m[1].trim().replace(/\s+/g, ' '), file: r.file });
    }
  }
  return out;
}

/** PURE, so the lints below can be pointed at synthetic CSS and shown to fail. Returns the reasons
 *  the given sources violate this ticket's invariants; [] means clean. */
export function weakRowViolations(files) {
  const rules = rulesWithContext(files);
  const bad = [];
  const val = (sel, prop, pred) => rules.filter((r) => r.sel === sel && pred(r))
    .flatMap((r) => [...r.body.matchAll(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'g'))].map((m) => m[1].trim().replace(/\s+/g, ' ')));
  const unconditional = (r) => r.at.length === 0;

  if (!rules.some((r) => r.sel === '.home-weak' && /container-name\s*:\s*weakcard/.test(r.body))) bad.push('no weakcard container');
  const areas = val('.weak-row', 'grid-template-areas', unconditional);
  if (!areas.length) bad.push('the default .weak-row declares no areas (no stacked form)');
  else {
    const rows = areas[areas.length - 1].match(/"[^"]*"/g) || [];
    const cols = (rows[0] || '').replace(/"/g, '').trim().split(/\s+/).filter(Boolean);
    if (rows.length < 2) bad.push('the default form is a single row');
    if (!(cols.length > 1 && cols.every((c) => c === 'name'))) bad.push(`the name does not span the stacked row: ${rows[0]}`);
  }
  const cols = val('.weak-row', 'grid-template-columns', unconditional);
  if (!cols.length) bad.push('the default .weak-row declares no columns');
  else if (/ch/.test(cols[cols.length - 1].split(/\s+(?![^(]*\))/)[0])) bad.push('a ch floor on the stacked bar column');
  for (const sel of ['.weak-name', '.skill-name']) {
    const w = val(sel, 'overflow-wrap', () => true);
    if (w[w.length - 1] !== 'anywhere') bad.push(`${sel} is not overflow-wrap: anywhere`);
  }
  const clamp = val('.skill-name', '-webkit-line-clamp', () => true);
  if (clamp.length && clamp[clamp.length - 1] !== 'none') bad.push('.skill-name is still clamped');
  const media = rules.filter((r) => (/\.weak-(row|list|name|main|m)\b/.test(r.sel) || r.sel === '.home-weak')
    && r.at.some((a) => /@media[^@]*(min|max)-width/.test(a)));
  if (media.length) bad.push(`${media.length} Weak-spots rule(s) behind a width @media`);
  return bad;
}

test('fix:home r3 — the lints can fail (their own negative controls)', () => {
  const OK = [['css/x.css', `
    .home-weak { container-type: inline-size; container-name: weakcard }
    .weak-row { grid-template-columns: minmax(0, 1fr) minmax(max(32px, 2.5ch), auto) auto;
                grid-template-areas: "name name name" "bar num drill" }
    .weak-name { overflow-wrap: anywhere }
    .skill-name { overflow-wrap: anywhere; -webkit-line-clamp: none }
  `]];
  assert.deepEqual(weakRowViolations(OK), [], 'the control CSS must be clean');

  const mut = (find, repl) => [['css/x.css', OK[0][1].replace(find, repl)]];
  // each mutation is a real defect this ticket fixed
  assert.deepEqual(weakRowViolations(mut('container-name: weakcard', 'color: red')), ['no weakcard container']);
  assert.deepEqual(weakRowViolations(mut('grid-template-areas: "name name name" "bar num drill"', 'color: red')),
    ['the default .weak-row declares no areas (no stacked form)']);
  assert.deepEqual(weakRowViolations(mut('"name name name" "bar num drill"', '"name num drill"')),
    ['the default form is a single row', 'the name does not span the stacked row: "name num drill"']);
  assert.deepEqual(weakRowViolations(mut('minmax(0, 1fr) minmax(max(32px, 2.5ch), auto) auto', 'minmax(min(100%, 8ch), 1fr) minmax(max(32px, 2.5ch), auto) auto')),
    ['a ch floor on the stacked bar column']);
  assert.deepEqual(weakRowViolations(mut('.weak-name { overflow-wrap: anywhere }', '.weak-name { overflow-wrap: break-word }')),
    ['.weak-name is not overflow-wrap: anywhere']);
  assert.deepEqual(weakRowViolations(mut('-webkit-line-clamp: none', '-webkit-line-clamp: 2')),
    ['.skill-name is still clamped']);
  assert.deepEqual(weakRowViolations([['css/x.css', `@media (min-width: 720px) { .weak-row { grid-template-columns: 1fr } }` + OK[0][1]]]),
    ['1 Weak-spots rule(s) behind a width @media']);
});

test('fix:home r3 — the shipped CSS passes every one of those lints', () => {
  assert.deepEqual(weakRowViolations(FILES), []);
});

test('fix:home r3 — the CSS parse actually parsed (no lint below may pass vacuously)', () => {
  assert.ok(RULES.length > 800, `only ${RULES.length} rules parsed`);
  assert.ok(RULES.some((r) => r.sel === '.weak-row'), '.weak-row not found');
  assert.ok(RULES.some((r) => r.sel === '.skill-name'), '.skill-name not found');
});

test('fix:home r3 — the weak rows read a CONTAINER, never the viewport', () => {
  // notes/LAYOUT-ROOT.md §"@container or @media?". `.home-weak` is the direct parent of the list, so
  // its content box IS the row's width; the row can never be re-derived from the window again.
  assert.ok(RULES.some((r) => r.sel === '.home-weak' && /container-name\s*:\s*weakcard/.test(r.body)
    && /container-type\s*:\s*inline-size/.test(r.body)), '.home-weak is not the `weakcard` query container');

  const templates = decls('.weak-row', 'grid-template-columns').concat(decls('.weak-row', 'grid-template-areas'));
  assert.ok(templates.length >= 3, `only ${templates.length} .weak-row template declarations found`);
  const viewportKeyed = templates.filter((d) => /@media[^@]*(min|max)-width/.test(d.at));
  assert.deepEqual(viewportKeyed.map((d) => `${d.file} inside ${d.at}`), [],
    'a .weak-row template is keyed to the viewport — it must read the weakcard container');
  assert.ok(templates.some((d) => /@container weakcard/.test(d.at)),
    'no .weak-row template is behind @container weakcard');
});

test('fix:home r3 — the DEFAULT form is the stacked one, and the name spans it', () => {
  // The fail-safe direction: a browser that does not match the query must get the readable layout,
  // never the one that overlaps. Same rule the card itself follows (notes/LAYOUT-ROOT.md §4).
  const areas = decls('.weak-row', 'grid-template-areas').filter((d) => !d.at);
  assert.ok(areas.length >= 1, 'the unconditional .weak-row rule declares no grid-template-areas');
  const def = areas[areas.length - 1].value;
  const rows = def.match(/"[^"]*"/g) || [];
  assert.ok(rows.length >= 2, `the default form is not multi-row: ${def}`);
  const cols = rows[0].replace(/"/g, '').trim().split(/\s+/);
  assert.ok(cols.length > 1 && cols.every((c) => c === 'name'),
    `the name must span every column of the stacked form's first row, got ${rows[0]}`);
  assert.ok(/\bnum\b/.test(def) && /\bdrill\b/.test(def) && /\bbar\b/.test(def),
    `the stacked form must place the bar, the number and the action: ${def}`);
});

test('fix:home r3 — the stacked form spends no ch floor on the column that holds only a bar', () => {
  // THE 200 %-TEXT LESSON. `min(100%, Nch)` clamps each floor against the WHOLE grid, not against
  // the grid minus its other tracks, so floors ADD UP: 8ch + 2.5ch + 68px + 24px = 298px of minima
  // inside a 254px card at 320px/200% text, and the document scrolled sideways. In the stacked form
  // the name spans the row and column 1 holds `.skill-bar` alone, so the floor protected a 6px bar.
  const cols = decls('.weak-row', 'grid-template-columns').filter((d) => !d.at);
  assert.ok(cols.length >= 1, 'the unconditional .weak-row rule declares no grid-template-columns');
  const first = cols[cols.length - 1].value.split(/\s+(?![^(]*\))/)[0];
  assert.ok(!/ch/.test(first),
    `the stacked form's first track carries a ch floor (${first}) while the name spans the row — the minima can then exceed the card (notes/FIX-home.md §part 3)`);
  // and the WIDE form, where column 1 really does hold the name, must keep its floor
  const wide = decls('.weak-row', 'grid-template-columns').filter((d) => /@container weakcard \(min-width/.test(d.at));
  assert.ok(wide.length >= 1, 'no .weak-row template behind a @container weakcard min-width');
  assert.match(wide[wide.length - 1].value, /minmax\(min\(100%, \d+ch\), 1fr\)/,
    'the one-row form lost the ch floor on the name track');
});

test('fix:home r3 — the one-row threshold is derived in ch, and is reachable', () => {
  // In `ch` because the name's need scales with the text while the 68px button (an absolute --fs-2)
  // does not; `calc(<ch> + <px>)` is the honest mixed unit, and it matches in both engines.
  const at = RULES.filter((r) => r.sel === '.weak-row').flatMap((r) => r.at).find((a) => /@container weakcard \(min-width/.test(a));
  assert.ok(at, 'no min-width condition on the weakcard container');
  const m = /min-width:\s*calc\(\s*([\d.]+)ch\s*\+\s*([\d.]+)px\s*\)/.exec(at);
  assert.ok(m, `the threshold is not a ch+px calc: ${at}`);
  const ch = +m[1], px = +m[2];
  // the name's measured min-content is 20.4ch (fs 16) / 19.4ch (fs 24); the floor must clear it
  assert.ok(ch >= 21, `${ch}ch does not clear the name's 20.4ch min-content — it would break mid-word the moment the row goes to one line`);
  // and it must be reachable: `.screen { max-width: var(--col) }` caps the card, less its padding
  const col = +/--col:\s*(\d+)px/.exec(FILES.find(([f]) => f === 'css/theme.css')[1])[1];
  const cap = col - 34;                         // 16px card padding each side + 1px border each side
  const widestCh = 20;                          // 1ch measured 9.77px at fs 16 and 19.6px at fs 32
  assert.ok(ch * widestCh + px <= cap,
    `@container weakcard (min-width: calc(${ch}ch + ${px}px)) needs ${ch * widestCh + px}px but the card content box tops out at ${cap}px — a dead threshold renders the stacked form for ever (tests/fix-stats.test.mjs §dead thresholds)`);
});

test('fix:home r3 — neither skill name can be wider than its cell, and neither is hidden', () => {
  // `break-word` does not reduce min-content; `anywhere` does. And a line clamp is a promise about
  // height that the content can always break: screens.css:221 promised "never an ellipsis that hides
  // which ASN skill this is" and hid one of nineteen names at every width but the tablet one.
  for (const sel of ['.weak-name', '.skill-name']) {
    const wrap = decls(sel, 'overflow-wrap');
    assert.ok(wrap.length, `${sel} declares no overflow-wrap`);
    assert.equal(wrap[wrap.length - 1].value, 'anywhere',
      `${sel} must be \`overflow-wrap: anywhere\` — \`break-word\` leaves min-content at the width of the longest token, which is how the name came to print over the number`);
  }
  const clamp = decls('.skill-name', '-webkit-line-clamp');
  assert.ok(clamp.length >= 2, 'the .skill-name clamp override is missing (or screens.css no longer clamps)');
  assert.equal(clamp[clamp.length - 1].value, 'none',
    'the last word on .skill-name must be `-webkit-line-clamp: none` — a clamped skill name hides which skill it is');
  const ov = decls('.skill-name', 'overflow');
  assert.equal(ov[ov.length - 1].value, 'visible',
    '.skill-name must not clip: with the clamp gone, `overflow: hidden` would still cut a third line');
});

test('fix:home r3 — nothing re-introduces the retired one-host patches', () => {
  // The W4/W5 shape this whole wave exists to kill: a rule that fixes ONE host or ONE viewport.
  const offenders = RULES
    .filter((r) => /\.weak-(row|list|name|main|m)\b/.test(r.sel) || r.sel === '.home-weak')
    .filter((r) => r.at.some((a) => /@media[^@]*(min|max)-width/.test(a)))
    .map((r) => `${r.file}: ${r.sel} inside ${r.at.join(' ')}`);
  assert.deepEqual(offenders, [],
    'a Weak-spots rule is behind a width @media — the card is hosted at a width the window does not know (notes/LAYOUT-ROOT.md)');
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

test('fix:home r3 — measured: no overlap, no clipped name, no overflow on the weak rows', (t) => {
  if (!browsersAvailable()) { t.skip('no Playwright browser installed (cd qa && npx playwright install)'); return; }
  const run = spawnSync(process.execPath,
    ['qa/fix-home-r3.mjs', '--engines', 'chromium', '--zooms', '16,20', '--vps', '320x568,375x667,1440x900'],
    { cwd: REPO, timeout: 300_000, encoding: 'utf8' });
  assert.equal(run.status, 0, `qa/fix-home-r3.mjs failed:\n${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /0 failures/);
  // and the numbers, so a "pass" that measured nothing cannot slip through
  const stacked = run.stdout.split('\n').find((l) => l.includes('320x568') && l.includes('fs=16'));
  assert.ok(stacked, `no 320x568 row in the table:\n${run.stdout}`);
  assert.match(stacked, /areas="name name name" "bar num drill"/,
    `the 320px phone did not get the stacked form: ${stacked}`);
  const wide = run.stdout.split('\n').find((l) => l.includes('1440x900') && l.includes('fs=16'));
  assert.match(wide, /areas="name num drill" "bar num drill"/,
    `the laptop did not get the one-row form: ${wide}`);
});
