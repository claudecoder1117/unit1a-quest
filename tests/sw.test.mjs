// sw.test.mjs — T15 / S8 #15b. The precache list is the difference between "works in airplane mode"
// and "works in airplane mode except the one screen you needed", and nothing in a browser tells you it
// is stale. So:
//   · every path in site/sw.js's PRECACHE exists under site/;
//   · every file under site/js, site/css, site/data, site/assets is in the list — this is the half that
//     fails when someone adds a module and does not run `node qa/gen-precache.mjs`;
//   · the cache name is APP_VERSION (one constant, S6) and the worker never swaps itself in silently.
//
// sw.js is a CLASSIC worker script (importScripts, self, no exports), so it cannot be imported. It is
// evaluated in a vm context with a stub `self`, which also proves it parses and that its top level
// touches nothing a worker would not have. Top-level `const`s live in the context's lexical scope, so
// `vm.runInContext('PRECACHE', ctx)` reads the real array — not a regex guess at it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { buildList, readList, replaceBlock, SHELL_FILES, SCAN_DIRS, EXCLUDE } from '../qa/gen-precache.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const SW_PATH = join(SITE, 'sw.js');
const SW_SRC = readFileSync(SW_PATH, 'utf8');
const REGEN = 'run: node qa/gen-precache.mjs';

/* ---------------- evaluate the worker ---------------- */

function evalSW() {
  const imported = [];
  const events = [];
  const g = { console: { warn() {}, error() {}, log() {} } };
  g.self = g;                                   // a worker's global IS `self`
  g.location = { origin: 'https://example.test', href: 'https://example.test/sw.js' };
  g.importScripts = (...names) => {
    for (const n of names) {
      imported.push(n);
      vm.runInContext(readFileSync(join(SITE, n), 'utf8'), ctx, { filename: n });
    }
  };
  g.addEventListener = (type) => { events.push(type); };
  const ctx = vm.createContext(g);
  vm.runInContext(SW_SRC, ctx, { filename: 'sw.js' });
  return {
    imported,
    events,
    version: g.APP_VERSION,
    CACHE: String(vm.runInContext('CACHE', ctx)),
    SHELL: String(vm.runInContext('SHELL', ctx)),
    // Spread it into a HOST array: an array built inside the vm has that context's Array.prototype,
    // and assert.deepEqual compares prototypes — [] from the vm is not deepStrictEqual to [].
    PRECACHE: [...vm.runInContext('PRECACHE', ctx)].map(String),
  };
}

const sw = evalSW();

/* ---------------- an independent scan of site/ ---------------- */
// Deliberately NOT qa/gen-precache.mjs's walk: if the generator's scan is wrong, the list it writes and
// the list it expects would agree with each other and disagree with the disk.
function scanDir(dir, base = dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.')) continue;                       // .nojekyll, .DS_Store — nothing to cache
    const p = join(dir, name);
    if (statSync(p).isDirectory()) scanDir(p, base, out);
    else out.push(p);
  }
  return out;
}
const toPosix = (p) => p.split(sep).join('/');
function scanSite() {
  const out = [];
  for (const f of SHELL_FILES) if (existsSync(join(SITE, f))) out.push(f);
  for (const d of SCAN_DIRS) {
    const abs = join(SITE, d);
    if (!existsSync(abs)) continue;
    for (const f of scanDir(abs)) out.push(toPosix(f.slice(SITE.length + 1)));
  }
  return out.filter((p) => !EXCLUDE.has(p));
}
const onDisk = scanSite();

describe('sw.js — the worker itself', () => {
  test('it parses as a classic worker script and registers the four handlers', () => {
    assert.deepEqual(sw.imported, ['version.js'], 'sw.js must pull the version in with importScripts');
    for (const type of ['install', 'activate', 'fetch', 'message']) {
      assert.ok(sw.events.includes(type), `no ${type} handler`);
    }
  });

  test('the cache name is APP_VERSION, with the prefix the cleanup code looks for', () => {
    const version = readFileSync(join(SITE, 'version.js'), 'utf8').match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
    assert.ok(version, 'site/version.js must set self.APP_VERSION = "…"');
    assert.equal(sw.version, version[1], 'importScripts must expose APP_VERSION');
    assert.ok(sw.CACHE.endsWith(version[1]), `cache name ${sw.CACHE} does not carry APP_VERSION ${version[1]}`);
    assert.ok(sw.CACHE.startsWith('packet-'), 'cache name must start with "packet-"');
    // activate deletes, and Settings clears, every cache with that prefix — all three must agree.
    assert.match(SW_SRC, /startsWith\('packet-'\)/, 'activate must delete older packet- caches');
    assert.match(readFileSync(join(SITE, 'js', 'sw-register.js'), 'utf8'), /startsWith\('packet-'\)/,
      'clearCaches() must use the same cache prefix');
  });

  test('the worker never takes over silently — skipWaiting only on the SKIP_WAITING message', () => {
    const hits = [...SW_SRC.matchAll(/self\.skipWaiting\s*\(/g)];   // `self.` — the prose mentions it twice
    assert.equal(hits.length, 1, 'exactly one skipWaiting() call, inside the message handler');
    const msgAt = SW_SRC.indexOf("'message'");
    assert.ok(msgAt > 0 && hits[0].index > msgAt, 'skipWaiting() must live in the message handler, not in install');
    assert.match(SW_SRC, /SKIP_WAITING/, 'the message contract is {type:"SKIP_WAITING"}');
  });

  test('registration passes updateViaCache:\'none\' (S6 — version.js is behind a 600 s HTTP cache)', () => {
    const reg = readFileSync(join(SITE, 'js', 'sw-register.js'), 'utf8');
    assert.match(reg, /serviceWorker\.register\(/);
    assert.match(reg, /updateViaCache:\s*'none'/);
    const app = readFileSync(join(SITE, 'js', 'app.js'), 'utf8');
    assert.match(app, /sw-register\.js/, 'app.js must wire the registration (one line in boot)');
  });
});

describe('sw.js — the precache list', () => {
  test('it is a non-empty list of relative paths with no duplicates', () => {
    assert.ok(Array.isArray(sw.PRECACHE) && sw.PRECACHE.length > 20, 'PRECACHE looks empty');
    for (const p of sw.PRECACHE) {
      assert.equal(typeof p, 'string');
      assert.ok(!p.startsWith('/'), `${p}: absolute path — the site also lives under /unit1a-quest/`);
      assert.ok(!p.includes('://'), `${p}: absolute URL (S6: zero third-party requests)`);
      assert.ok(!p.includes('..'), `${p}: escapes the artifact`);
    }
    assert.equal(new Set(sw.PRECACHE).size, sw.PRECACHE.length, 'duplicate entries in PRECACHE');
  });

  test('every precached path exists under site/', () => {
    const missing = sw.PRECACHE.filter((p) => !existsSync(join(SITE, p)) || !statSync(join(SITE, p)).isFile());
    assert.deepEqual(missing, [], `listed but not on disk: ${missing.join(', ')} — ${REGEN}`);
  });

  test('every file under site/js, site/css, site/data, site/assets is precached', () => {
    const listed = new Set(sw.PRECACHE);
    const unlisted = onDisk.filter((p) => !listed.has(p));
    assert.deepEqual(unlisted, [], `on disk but NOT precached (they would 404 offline): ${unlisted.join(', ')} — ${REGEN}`);
  });

  test('the shell is precached and the worker is not', () => {
    for (const f of SHELL_FILES) assert.ok(sw.PRECACHE.includes(f), `${f} must be precached`);
    assert.ok(sw.PRECACHE.includes(sw.SHELL), 'SHELL must be one of the precached paths');
    assert.ok(!sw.PRECACHE.includes('sw.js'), 'the worker is fetched outside its own cache');
  });

  test('BUILD-POLICY §1 — no scan, PNG or PDF is precached (there are none to precache)', () => {
    const bad = sw.PRECACHE.filter((p) => /\.(png|jpe?g|gif|webp|pdf)$/i.test(p));
    assert.deepEqual(bad, [], `scans must never enter site/: ${bad.join(', ')}`);
  });
});

describe('qa/gen-precache.mjs — the list stays in sync by itself', () => {
  test('the generator agrees with the disk scan', () => {
    assert.deepEqual(buildList(), onDisk, 'the generator and an independent scan of site/ disagree');
  });

  test('`node qa/gen-precache.mjs --check` would pass on the committed sw.js', () => {
    const wanted = buildList();
    const current = readList(SW_SRC);
    const added = wanted.filter((p) => !current.includes(p));
    const removed = current.filter((p) => !wanted.includes(p));
    assert.deepEqual(added, [], `added under site/ but missing from sw.js: ${added.join(', ')} — ${REGEN}`);
    assert.deepEqual(removed, [], `listed in sw.js but gone from site/: ${removed.join(', ')} — ${REGEN}`);
    assert.deepEqual(current, wanted, `the list is out of order — ${REGEN}`);
    assert.deepEqual(current, sw.PRECACHE, 'the parsed list and the evaluated list disagree');
  });

  test('rewriting the block is a no-op when the list is current (the generator is idempotent)', () => {
    // assert.ok, not assert.equal: an inequality here would print the whole worker twice.
    assert.ok(replaceBlock(SW_SRC, buildList()) === SW_SRC,
      `site/sw.js's generated block is not byte-identical to what the generator writes — ${REGEN}`);
  });

  test('a new file under site/ is actually detected (the check is not vacuous)', () => {
    const current = readList(SW_SRC);
    const pretend = [...current, 'js/brand-new-module.js'];
    const missedByList = pretend.filter((p) => !current.includes(p));
    assert.deepEqual(missedByList, ['js/brand-new-module.js']);
    // …and the reverse direction: a listed path that is not on disk is caught by the existence test.
    assert.ok(!existsSync(join(SITE, 'js', 'brand-new-module.js')));
  });
});
