// T06g — misconception catalogue tests.
//
// 1. Catalogue integrity: every entry is { title, fix, area } with sane, one-line, student-facing text.
// 2. Every tag COMPOSED S3 names (plus the ones the T06g ticket adds) is present.
// 3. Static scan: every `tag:'…'` / `tag:"…"` / `tag = '…'` / `tags:[…]` / `tags.push('…')` literal under site/js and site/data names a
//    catalogued tag. Directories or files that do not exist yet are simply skipped (the scan is
//    green on an empty scaffold and tightens as tickets land).
// 4. The helper API (isKnownTag / lookup / patternLine / groupByArea) degrades gracefully.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import DEFAULT_EXPORT, {
  MISCONCEPTIONS, AREAS, TAGS, isKnownTag, lookup, patternLine, groupByArea,
} from '../site/data/misconceptions.js';
import { ROOT } from './_helpers.mjs';   // T17

const SITE = join(ROOT, 'site');
const CATALOGUE = join(SITE, 'data', 'misconceptions.js');
const SCAN_DIRS = [join(SITE, 'js'), join(SITE, 'data')];

// ---------------------------------------------------------------------------------------------
// Scanner (kept in the test so it has no runtime footprint in site/).

/** Recursively list *.js / *.mjs files under `dir`; a missing dir yields []. */
export function listScripts(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) listScripts(p, out);
    else if (/\.m?js$/.test(e.name)) out.push(p);
  }
  return out.sort();
}

const TAG_RE  = /\btag\s*[:=]\s*(['"`])([^'"`\n]*)\1/g;  // tag:'x'  tag: "x"  tag:`x`  tag = 'x'
const TAGS_RE = /\btags\s*:\s*\[([^\]]*)\]/g;           // tags:['x', "y"]  (may span lines)
const PUSH_RE = /\btags\s*\.push\(([^)]*)\)/g;           // tags.push('x', "y")
const STR_RE  = /(['"`])([^'"`\n]*)\1/g;                 // quoted strings inside a tags:[…] / push(…) body

/** Extract every literal tag in `src` → [{ tag, line }]. Non-literal entries (variables) are ignored. */
export function extractTags(src) {
  const found = [];
  const lineOf = (idx) => src.slice(0, idx).split('\n').length;
  for (const m of src.matchAll(TAG_RE)) found.push({ tag: m[2], line: lineOf(m.index) });
  for (const [re, open] of [[TAGS_RE, '['], [PUSH_RE, '(']]) {
    for (const m of src.matchAll(re)) {
      const bodyStart = m.index + m[0].indexOf(open) + 1;
      for (const s of m[1].matchAll(STR_RE)) found.push({ tag: s[2], line: lineOf(bodyStart + s.index) });
    }
  }
  return found;
}

/** Levenshtein distance — only used to suggest the nearest catalogued tag in a failure message. */
function editDistance(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

function nearest(tag, n = 3) {
  return TAGS.map(t => [editDistance(tag, t), t]).sort((x, y) => x[0] - y[0] || (x[1] < y[1] ? -1 : 1))
    .slice(0, n).map(([, t]) => t);
}

// ---------------------------------------------------------------------------------------------
// 1. Catalogue integrity

const KEY_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

test('catalogue: default export is the map, TAGS lists its keys, AREAS is well-formed', () => {
  assert.equal(DEFAULT_EXPORT, MISCONCEPTIONS, 'default export must be the same object as the named MISCONCEPTIONS');
  assert.ok(TAGS.length >= 20, `expected a real catalogue, got ${TAGS.length} tags`);
  assert.deepEqual([...TAGS], Object.keys(MISCONCEPTIONS));
  assert.ok(Object.isFrozen(MISCONCEPTIONS), 'MISCONCEPTIONS must be frozen');
  assert.ok(Object.isFrozen(TAGS), 'TAGS must be frozen');
  const ids = AREAS.map(a => a.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate area id');
  for (const a of AREAS) {
    assert.match(a.id, KEY_RE, `area id ${a.id}`);
    assert.ok(typeof a.label === 'string' && a.label.trim().length > 0, `area ${a.id} needs a label`);
  }
  assert.ok(ids.includes('general'), "AREAS must include 'general' (the lookup() fallback area)");
});

test('catalogue: every entry is {title, fix, area} — one line, student-facing, bounded', () => {
  const areaIds = new Set(AREAS.map(a => a.id));
  for (const tag of TAGS) {
    const e = MISCONCEPTIONS[tag];
    assert.match(tag, KEY_RE, `tag "${tag}" is not kebab-case`);
    assert.ok(e && typeof e === 'object', `${tag}: entry missing`);
    assert.ok(Object.isFrozen(e), `${tag}: entry must be frozen`);
    assert.deepEqual(Object.keys(e).sort(), ['area', 'fix', 'title'], `${tag}: keys must be exactly title/fix/area`);
    for (const k of ['title', 'fix']) {
      const v = e[k];
      assert.equal(typeof v, 'string', `${tag}.${k} must be a string`);
      assert.equal(v, v.trim(), `${tag}.${k} has leading/trailing whitespace`);
      assert.ok(v.length > 0, `${tag}.${k} is empty`);
      assert.ok(!/[\n\r\t]/.test(v), `${tag}.${k} must be a single line`);
      assert.ok(!/\b(TODO|TBD|FIXME|lorem)\b/i.test(v), `${tag}.${k} looks like a placeholder`);
    }
    assert.ok(e.title.length <= 40, `${tag}.title is ${e.title.length} chars (max 40)`);
    assert.ok(e.fix.length >= 20, `${tag}.fix is too short to teach anything`);
    assert.ok(e.fix.length <= 140, `${tag}.fix is ${e.fix.length} chars (max 140 — one line in the Patterns panel)`);
    assert.ok(!/\b(incorrect|wrong answer)\b/i.test(e.fix), `${tag}.fix: say what to do, not "incorrect" (S9 #4)`);
    assert.ok(areaIds.has(e.area), `${tag}.area "${e.area}" is not in AREAS`);
  }
});

test('catalogue: no duplicated key literal in the source (a later duplicate would silently win)', () => {
  const src = readFileSync(CATALOGUE, 'utf8');
  const keys = [...src.matchAll(/^\s*'([a-z0-9-]+)':\s*entry\(/gm)].map(m => m[1]);
  assert.equal(keys.length, TAGS.length, 'every key literal must be a live entry');
  assert.equal(new Set(keys).size, keys.length, `duplicate key literal: ${keys.filter((k, i) => keys.indexOf(k) !== i)}`);
});

// ---------------------------------------------------------------------------------------------
// 2. The tags the spec names

const S3_TAGS = [
  'gave-complement', 'used-90-for-supp', 'stopped-early', 'forgot-second-root', 'rejected-valid-root',
  'sign-whole', 'dropped-gcf', 'extra-factor', 'middle-term', 'swapped-fields', 'ray-order',
];
const TICKET_TAGS = [
  'gave-supplement', 'gave-angle', 'wrong-side-supp', 'arithmetic', 'unreduced-ratio', 'reversed-ratio',
  'extra-root', 'missing-gcf-strict',
];

test('catalogue: every tag named in COMPOSED S3 and the T06g ticket is present', () => {
  const missing = [...S3_TAGS, ...TICKET_TAGS].filter(t => !isKnownTag(t));
  assert.deepEqual(missing, [], `missing from site/data/misconceptions.js: ${missing.join(', ')}`);
});

// ---------------------------------------------------------------------------------------------
// 3. Static scan of site/js and site/data

test('scanner: extractTags finds the literal forms and ignores non-literals', () => {
  const src = [
    "return { ok:false, tag:'gave-complement' };",          // 1
    'const m = { tag: "used-90-for-supp", msg }',            // 2
    'x = { tag:`ray-order` }',                               // 3
    "tags:['sign-whole', \"dropped-gcf\"]",                  // 4
    'tags: [',                                               // 5
    "  'middle-term',",                                      // 6
    '  someVariable,',                                       // 7
    '  "swapped-fields"',                                    // 8
    ']',                                                     // 9
    'tags:[]',                                               // 10
    'tags:[tag]',                                            // 11
    'const { tag: t } = r; subtag: "nope"; tagline: "nope"', // 12
    '// tags:["stopped-early"]  (declared in a comment)',    // 13
    "tags.push('extra-root', \"forgot-second-root\")",       // 14
    "tags.push(dyn)",                                        // 15
    "let tag = 'rejected-valid-root'; other = 'no'",         // 16
    "tag ??= 'nope'",                                        // 17 (not a plain = assignment)
  ].join('\n');
  const got = extractTags(src);
  assert.deepEqual(got.map(g => g.tag).sort(), [
    'dropped-gcf', 'extra-root', 'forgot-second-root', 'gave-complement', 'middle-term', 'ray-order',
    'rejected-valid-root', 'sign-whole', 'stopped-early', 'swapped-fields', 'used-90-for-supp',
  ]);
  const byTag = Object.fromEntries(got.map(g => [g.tag, g.line]));
  assert.equal(byTag['gave-complement'], 1);
  assert.equal(byTag['ray-order'], 3);
  assert.equal(byTag['dropped-gcf'], 4);
  assert.equal(byTag['middle-term'], 6);
  assert.equal(byTag['swapped-fields'], 8);
  assert.equal(byTag['stopped-early'], 13);
  assert.equal(byTag['extra-root'], 14);
  assert.equal(byTag['forgot-second-root'], 14);
  assert.equal(byTag['rejected-valid-root'], 16);
});

test('scanner: a directory that does not exist yet scans as empty', () => {
  assert.deepEqual(listScripts(join(SITE, 'does-not-exist-' + process.pid)), []);
});

test('scan: every misconception tag emitted under site/js and site/data is catalogued', (t) => {
  const files = SCAN_DIRS.flatMap(d => listScripts(d)).filter(f => resolve(f) !== resolve(CATALOGUE));
  const present = SCAN_DIRS.filter(existsSync).map(d => relative(ROOT, d));
  t.diagnostic(`scanned ${files.length} file(s) under ${present.length ? present.join(', ') : '(nothing yet — site/js and site/data absent)'}`);

  const unknown = [];
  let seen = 0;
  for (const f of files) {
    for (const { tag, line } of extractTags(readFileSync(f, 'utf8'))) {
      seen++;
      if (!isKnownTag(tag)) unknown.push({ file: relative(ROOT, f), line, tag });
    }
  }
  t.diagnostic(`${seen} tag literal(s) checked against ${TAGS.length} catalogued tags`);

  if (unknown.length) {
    const lines = unknown.map(u => `  ${u.file}:${u.line}  tag '${u.tag}'  (nearest: ${nearest(u.tag).join(', ')})`);
    assert.fail(
      `${unknown.length} misconception tag(s) are not in site/data/misconceptions.js:\n${lines.join('\n')}\n` +
      `Fix: use an existing tag, or request the new key from the catalogue owner (T06g) in your notes/<ticket>.md.`,
    );
  }
});

// ---------------------------------------------------------------------------------------------
// 4. Helper API

test('isKnownTag: true for catalogued tags, false (never throws) otherwise', () => {
  assert.equal(isKnownTag('gave-complement'), true);
  assert.equal(isKnownTag('no-such-tag'), false);
  assert.equal(isKnownTag(''), false);
  assert.equal(isKnownTag(undefined), false);
  assert.equal(isKnownTag(null), false);
  assert.equal(isKnownTag(42), false);
  assert.equal(isKnownTag('constructor'), false, 'prototype keys are not tags');
  assert.equal(isKnownTag('__proto__'), false, 'prototype keys are not tags');
});

test('lookup: catalogued tag returns its entry; unknown tag returns a readable fallback', () => {
  const e = lookup('ray-order');
  assert.deepEqual(e, { tag: 'ray-order', ...MISCONCEPTIONS['ray-order'], known: true });
  const u = lookup('some-old-tag');
  assert.equal(u.known, false);
  assert.equal(u.tag, 'some-old-tag');
  assert.equal(u.title, 'some old tag');
  assert.equal(u.area, 'general');
  assert.ok(u.fix.length > 20);
  assert.equal(lookup(undefined).title, 'unknown pattern');
  assert.equal(lookup(null).tag, '');
});

test('patternLine: renders the S4 Patterns-panel line', () => {
  assert.equal(patternLine('gave-complement', 4), `gave-complement ×4 — ${MISCONCEPTIONS['gave-complement'].fix}`);
  assert.equal(patternLine('gave-complement', 2.9), `gave-complement ×2 — ${MISCONCEPTIONS['gave-complement'].fix}`);
  assert.match(patternLine('gave-complement', NaN), /^gave-complement ×0 — /);
  assert.match(patternLine('gave-complement', -3), /^gave-complement ×0 — /);
  assert.match(patternLine('nope', 1), /^nope ×1 — /);
});

test('groupByArea: AREAS order, count-desc within an area, zero/invalid counts dropped, unknown → general', () => {
  const g = groupByArea({
    'ray-order': 2, 'gave-complement': 4, 'sign-whole': 4, 'middle-term': 4, 'stopped-early': 0,
    'dropped-gcf': -1, 'unreduced-ratio': NaN, 'mystery': 1,
  });
  assert.deepEqual(g.map(a => a.id), ['comp-supp', 'factoring', 'notation', 'general']);
  assert.deepEqual(g[0].tags.map(x => x.tag), ['gave-complement']);
  assert.deepEqual(g[1].tags.map(x => x.tag), ['sign-whole', 'middle-term'], 'ties keep catalogue order');
  assert.deepEqual(g[2].tags.map(x => x.tag), ['ray-order']);
  assert.deepEqual(g[3].tags, [{ tag: 'mystery', count: 1, ...(({ title, fix }) => ({ title, fix }))(lookup('mystery')) }]);
  for (const a of g) for (const x of a.tags) {
    assert.deepEqual(Object.keys(x).sort(), ['count', 'fix', 'tag', 'title']);
    assert.ok(Number.isInteger(x.count) && x.count > 0);
  }
  assert.deepEqual(groupByArea({}), []);
  assert.deepEqual(groupByArea(null), []);
  assert.deepEqual(groupByArea(undefined), []);
});
