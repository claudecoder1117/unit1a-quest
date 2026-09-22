// tests/final-layout.test.mjs — ticket FINAL. Two things this file keeps true:
//
//   1. THE LAST MID-WORD BREAK. Two of the nineteen skill names are
//      "Always/Sometimes/Never: …" — a 23-character run with no space in it. CSS has no way to break
//      after a slash, so Home's 170 px Skills rail fell back to `overflow-wrap: anywhere` and cut the
//      word in half: "Always/Sometimes/Neve" / "r: Points, Lines, Planes", at EVERY desktop width, in
//      both engines. None of the layout auditor's detectors can see it (the text is not collapsed, not
//      clipped, not overlapping, and its box is the size it should be) — see notes/LAYOUT-PERFECT.md.
//      The fix is `softWrap()` in app.js: a real break opportunity (<wbr>) after each '/', used at
//      every place a skill name is printed. If a future lane drops the call, the mid-word break comes
//      straight back, so each call site is pinned here.
//
//   2. THE GUARD IS WIRED. `node --test` cannot see a layout defect; `npm run audit` can. This file
//      asserts the audit is reachable as an npm script, that README tells the next person to run it
//      before pushing, and that CI runs the auditor's SELF-TEST with a real browser (the in-suite
//      tests/layout-audit.test.mjs skips itself when no browser is installed, which is every fresh CI
//      runner — a guard that is green-by-skip is not a guard).
//
// Conventions: notes/LAYOUT-ROOT.md. Detectors + waivers: notes/AUDIT.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { read } from './_helpers.mjs';

test('FINAL: softWrap offers a break after every "/" and adds no characters', async (t) => {
  const { softWrap } = await import('../site/js/app.js');

  await t.test('a name with no slash is returned untouched, as one string', () => {
    assert.deepEqual(softWrap('Vocabulary'), ['Vocabulary']);
    assert.deepEqual(softWrap('Word Problems: Linear'), ['Word Problems: Linear']);
  });

  await t.test('null / undefined / numbers never throw (it renders whatever a screen hands it)', () => {
    assert.deepEqual(softWrap(undefined), ['']);
    assert.deepEqual(softWrap(null), ['']);
    assert.deepEqual(softWrap(7), ['7']);
  });

  // The slash branch is the only one that needs a DOM. Stub it just for these calls rather than
  // globally: app.js has a `typeof document !== 'undefined'` boot block, and defining document before
  // the import would run it.
  const withDoc = (fn) => {
    const had = 'document' in globalThis;
    globalThis.document = { createElement: (tag) => ({ __el: tag }) };
    try { return fn(); } finally { if (had) { /* leave the real one */ } else delete globalThis.document; }
  };

  await t.test('"Always/Sometimes/Never: Angles" breaks after the slashes, not inside "Never"', () => {
    const out = withDoc(() => softWrap('Always/Sometimes/Never: Angles'));
    assert.deepEqual(out, ['Always/', { __el: 'wbr' }, 'Sometimes/', { __el: 'wbr' }, 'Never: Angles']);
    // the slash stays on the END of the preceding chunk: a line may legitimately end on "/"
    for (const part of out) if (typeof part === 'string' && part !== out.at(-1)) assert.ok(part.endsWith('/'), `"${part}" should end on a slash`);
  });

  await t.test('the text is byte-identical — <wbr> is an element, not a character', () => {
    const name = 'Always/Sometimes/Never: Points, Lines, Planes';
    const out = withDoc(() => softWrap(name));
    assert.equal(out.filter((p) => typeof p === 'string').join(''), name);
    // a zero-width space WOULD have changed this, which is why it is not used
    assert.ok(!out.some((p) => typeof p === 'string' && /[​­]/.test(p)), 'no ZWSP / soft hyphen');
  });

  await t.test('a trailing slash gets no dangling break after it', () => {
    const out = withDoc(() => softWrap('A/B/'));
    assert.deepEqual(out, ['A/', { __el: 'wbr' }, 'B/']);
  });
});

test('FINAL: every screen that prints a skill name spreads softWrap over it', () => {
  const app = read('site/js/app.js');
  assert.match(app, /export function softWrap\(/, 'app.js no longer exports softWrap');
  assert.match(app, /createElement\('wbr'\)/, 'softWrap stopped using <wbr>');

  // One entry per place a skill NAME reaches the DOM. Grep for new ones with:
  //   grep -rn "skill-name\|weak-name\|st-skill-name\|report-sk-n" site/js/
  for (const [file, selector] of [
    ['site/js/screens/home.js', 'span.weak-name'],       // Home · Weak spots
    ['site/js/screens/home.js', 'span.skill-name'],      // Home · the 19-skill rail (where the break was)
    ['site/js/screens/stats.js', 'span.st-skill-name'],  // Stats · Skills
    ['site/js/screens/report.js', 'span.report-sk-n'],   // Mock report · per-skill table
  ]) {
    const src = read(file);
    const call = new RegExp(`h\\('${selector.replace('.', '\\.')}'[^)]*\\.\\.\\.softWrap\\(`);
    assert.match(src, call, `${file}: h('${selector}', …) must spread softWrap(name) — without it "Never" is cut in half`);
    assert.match(src, /import \{[^}]*\bsoftWrap\b[^}]*\} from '\.\.\/app\.js'/, `${file} does not import softWrap`);
  }
});

test('FINAL: the CSS last-resort break stays underneath softWrap (defence in depth)', () => {
  const polish = read('site/css/polish.css');
  // fix:home r3 put `overflow-wrap: anywhere` on both names so a name can never be wider than its
  // cell (it reduces min-content; `break-word` does not). softWrap means that break is never REACHED
  // on today's names, but a future name with a long token still needs the floor under it.
  assert.match(polish, /\.skill-name \{[^}]*overflow-wrap: anywhere/s, '.skill-name lost its overflow-wrap guard');
  assert.match(polish, /\.weak-name \{ overflow-wrap: anywhere; \}/, '.weak-name lost its overflow-wrap guard');
});

test('FINAL: the BLITZ card\'s cap is typographic, so it can never clip its own answers', () => {
  // Verify round 1 (integrator). `.blitz-card`'s `max-height` is a CLIP, and its `min-height`
  // (`min(36vh, 320px)`) replaces the grid item's automatic content-based minimum, so nothing else
  // floors the box at its content. With the cap in px, the content scales with the root font and the
  // cap does not: at 320x568 with `html{font-size:20px}` the content needed 623 px against a 560 px
  // box and `.blitz-answers` (`align-self: end`) hung 64 px below the card, over `.blitz-hint` —
  // 8 BLOCKERs from `node qa/layout-audit.mjs --only job,run,home --engine both`, both engines, both
  // themes. In `rem` the cap is measured in the same unit as the content it caps: 35rem is the same
  // 560 px below 768 px that this rule has always been, and it grows with the type.
  const screens = read('site/css/screens.css');
  // anchored: `.run-empty, .blitz-card { … }` above it paints the surface and carries no cap
  const rule = /^\.blitz-card \{([^}]*)\}/m.exec(screens);
  assert.ok(rule, '.blitz-card sizing rule is gone from screens.css');
  const cap = /max-(?:height|block-size):\s*([^;]+);/.exec(rule[1]);
  assert.ok(cap, '.blitz-card lost its height cap entirely');
  assert.match(
    cap[1].trim(), /rem$/,
    `.blitz-card's cap is "${cap[1].trim()}" — a cap in px clips the answer row onto .blitz-hint under text zoom; keep it in rem`,
  );
  // and the cap must still be the 560 px this screen was designed at, below 768 px (html is 16 px there)
  assert.equal(Number.parseFloat(cap[1]) * 16, 560, 'the cap changed size; 35rem === the shipped 560 px at a 16 px root');
});

test('FINAL: the layout auditor is wired as a guard, not just a script in a folder', async (t) => {
  const pkg = JSON.parse(read('package.json'));

  await t.test('npm run audit / audit:selftest exist and point at the auditor', () => {
    assert.match(pkg.scripts.audit || '', /qa\/layout-audit\.mjs/, 'no "audit" script');
    assert.match(pkg.scripts['audit:selftest'] || '', /qa\/layout-audit\.mjs --selftest/, 'no "audit:selftest" script');
    assert.equal(pkg.scripts.test, 'node --test tests/', 'BUILD-POLICY §3 test command changed');
  });

  await t.test('README tells the next person to run it before pushing', () => {
    const readme = read('README.md');
    assert.match(readme, /npm run audit/, 'README never mentions `npm run audit`');
    assert.match(readme, /before (every |you )?push/i, 'README does not say to run it before pushing');
    assert.match(readme, /notes\/AUDIT\.md/, 'README does not point at the detector reference');
  });

  await t.test('CI runs the SELF-TEST with a real browser, and not the full matrix', () => {
    const ci = read('.github/workflows/pages.yml');
    assert.match(ci, /audit-selftest:/, 'no audit-selftest job in CI');
    assert.match(ci, /playwright install .*chromium/, 'the CI job never installs a browser, so the self-test would skip');
    assert.match(ci, /npm run audit:selftest/, 'the CI job does not run the self-test');
    assert.match(ci, /needs: \[test, audit-selftest, artifact-policy\]/, 'a self-test that blocks nothing is a decoration');
    // The full matrix is tens of minutes: deliberately NOT in CI (README says so, notes/AUDIT.md says how).
    assert.ok(!/run: npm run audit\s*$/m.test(ci), 'the FULL matrix must not run in CI — it is a pre-push command');
  });
});
