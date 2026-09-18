// tests/fix-mock-r2.test.mjs — ticket fix:mock r2. Keeps the Mock report's answer|solution split
// from going one-column again, and pins the DEAD-THRESHOLD lint that class of bug needs.
//
// The bug: LAYOUT-ROOT moved `.report-split`'s two-column form off `@media (min-width: 720px)` and
// onto `@container report (min-width: 720px)` without re-deriving the number for the new box.
// `report` is `.report-screen`, which base.css caps at the 680 px prose column — so the rule could
// never match, at any viewport, in any engine, and "Your scratch" stacked under "Worked solution"
// on the one screen a student reads after a Mock. A container query with an unreachable threshold
// is silent: nothing errors, nothing overflows, nothing collapses to 0 px. Only a lint or a
// HEAD-to-HEAD measurement sees it. So: a lint.
//
// Static assertions over the shipped CSS — no browser. The measured, cross-engine proof is
// `node qa/fixmock-r2.mjs` (chromium + webkit, ten widths, both themes, and a worst-case item with
// a real typed scratch); numbers in notes/FIX-mock.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// U1A_CSS_ROOT points the lint at a COPY of the tree, so the negative control ("un-fix it and the
// check must fail") runs without touching the file other lanes are appending to:
//   mkdir -p /tmp/nc && cp -R site /tmp/nc/ && sed -i '' '/=== fix:mock r2 ===/,$d' /tmp/nc/site/css/polish.css
//   U1A_CSS_ROOT=/tmp/nc node --test tests/fix-mock-r2.test.mjs      # must FAIL
const REPO = path.resolve(process.env.U1A_CSS_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const read = (p) => readFileSync(path.join(REPO, p), 'utf8');
const NAMES = ['theme', 'base', 'components', 'figure', 'motion', 'widgets', 'screens', 'polish'];
const CSS_FILES = NAMES.map((n) => [`site/css/${n}.css`, read(`site/css/${n}.css`)]);
const ALL_CSS = CSS_FILES.map(([, src]) => src).join('\n');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');   // comments quote the defect they fixed
const LIVE = CSS_FILES.map(([f, src]) => [f, strip(src)]);
const LIVE_ALL = LIVE.map(([, src]) => src).join('\n');

test('fix:mock r2 — .report-item-b is the `reportrow` container (the split\'s own parent)', () => {
  // `.report-screen` is four levels and 62 px of chrome above `.report-split`; `.report-item-b`'s
  // content box IS the split's width (618 = 618, measured), so it is the only honest box to query.
  assert.match(LIVE_ALL, /\.report-item-b\s*\{[^}]*container-type:\s*inline-size/,
    '.report-item-b must be an inline-size container, or every threshold is guessing at the chrome');
  assert.match(LIVE_ALL, /\.report-item-b\s*\{[^}]*container-name:\s*reportrow/,
    '.report-item-b must be named `reportrow`');
});

test('fix:mock r2 — the split\'s two-column form is behind `@container reportrow`, both directions', () => {
  const blocks = [...LIVE_ALL.matchAll(/@container\s+([\w-]+)\s*\(([^)]*)\)\s*\{([\s\S]*?)\n\}/g)]
    .map((m) => ({ name: m[1], cond: m[2], body: m[3] }));
  const two = blocks.filter((b) => /\.report-split\s*\{[^}]*grid-template-columns:[^}]*minmax[^}]*minmax/.test(b.body));
  assert.ok(two.length, 'nothing gives .report-split two columns any more');
  // The dead `@container report (min-width: 720px)` in screens.css is another lane's file and is
  // allowed to stay (the next test proves it cannot decide anything). What matters is that the rule
  // with the LAST word — CSS_FILES is in cascade order, polish.css last — queries the right box.
  const last = two[two.length - 1];
  assert.equal(last.name, 'reportrow',
    `the two-column split is decided by \`${last.name}\`, not by the box that reshapes (reportrow)`);
  assert.match(last.cond, /min-width/, 'the two-column branch must be a min-width branch');
  // the narrow branch must exist too, so this block — not the legacy screens.css rule — has the
  // last word at every width
  const one = blocks.filter((b) => b.name === 'reportrow' && /max-width/.test(b.cond)
    && /\.report-split\s*\{[^}]*grid-template-columns:/.test(b.body));
  assert.ok(one.length, 'no `@container reportrow (max-width: …)` branch — the dead 720 px rule could still decide');
});

test('fix:mock r2 — the threshold scales with the text, and both text tracks keep a guarded floor', () => {
  const m = LIVE_ALL.match(/@container\s+reportrow\s*\(min-width:\s*([\d.]+)(px|ch|em|rem)\)/);
  assert.ok(m, 'no `@container reportrow (min-width: …)` rule');
  assert.equal(m[2], 'ch',
    'the threshold must be in `ch`: the need is 2x18ch + the 16 px gap + the 20 px marker gutter, '
    + 'so a px threshold says "there is room" at 200 % text zoom when the floors no longer fit');
  assert.ok(+m[1] >= 40 && +m[1] <= 52, `threshold ${m[1]}ch is outside the derived band (need 39.5ch, headroom to ~52ch)`);

  const body = LIVE_ALL.match(/@container\s+reportrow\s*\(min-width:[^)]*\)\s*\{([\s\S]*?)\n\}/)[1];
  const cols = body.match(/\.report-split\s*\{[^}]*grid-template-columns:\s*([^;]+);/)[1];
  const tracks = cols.split(/\)\s+(?=minmax)/).map((t, i, a) => i < a.length - 1 ? t + ')' : t);
  assert.equal(tracks.length, 2, `expected two tracks, got \`${cols}\``);
  for (const t of tracks) {
    assert.match(t, /minmax\(\s*min\(100%,\s*\d+ch\s*\)/,
      `track \`${t.trim()}\` needs a `
      + '`minmax(min(100%, Nch), …)` floor — bare `minmax(18ch, 1fr)` overflows once the text is zoomed');
  }
});

test('fix:mock r2 — no @container min-width threshold on `report` can be unreachable and still decide', () => {
  // THE LINT. `.report-screen` is a `.screen`, capped at `--col` (680 px) unless the general host
  // rule lifts it (`.screen:has(.card-screen)`, which the report is not). So a `min-width` over
  // 680 px on the `report` container is DEAD. A dead rule is allowed to stay in a file this lane
  // does not own — but only if a later, live rule governs the same selectors in BOTH directions,
  // which is what the `reportrow` pair above does. Otherwise nothing decides and the screen keeps
  // whatever the unconditional base template says.
  const COL = +(ALL_CSS.match(/--col:\s*(\d+)px/) || [, 0])[1];
  assert.equal(COL, 680, 'the prose column is no longer 680 px — re-derive this lint and the reportrow threshold');

  // every @container block in the app, as {name, cond, body} — the body must be read BLOCK BY BLOCK:
  // a regex allowed to run past a closing brace will happily "find" the selector in the next block
  // and the lint goes blind (it did, until the negative control below caught it).
  const blocks = [];
  for (const [file, src] of LIVE) {
    for (const m of src.matchAll(/@container\s+([\w-]+)\s*\(([^)]*)\)\s*\{([\s\S]*?)\n\}/g)) {
      blocks.push({ file, name: m[1], cond: m[2], body: m[3], px: +(m[2].match(/min-width:\s*(\d+)px/) || [, 0])[1] });
    }
  }
  const selsOf = (body) => [...body.matchAll(/^\s*([.#][^{}\n]+?)\s*\{/gm)].map((s) => s[1].trim());
  const dead = [];
  for (const b of blocks) {
    if (b.name !== 'report' || !b.px || b.px <= COL) continue;
    for (const sel of selsOf(b.body)) {
      const live = blocks.filter((o) => o !== b && !(o.name === 'report' && o.px > COL) && selsOf(o.body).includes(sel));
      const pair = ['min-width', 'max-width'].every((dir) => live.some((o) => o.cond.includes(dir)));
      if (!pair) dead.push(`${b.file} @container report (min-width: ${b.px}px) → ${sel} (no live container pair)`);
    }
  }
  assert.deepEqual(dead, [],
    'a container query threshold larger than the box can ever be, with nothing live governing the same selector');
});
