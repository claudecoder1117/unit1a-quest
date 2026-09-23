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
import { ROOT } from './_helpers.mjs';   // T17

const SITE = join(ROOT, 'site');
const SW_PATH = join(SITE, 'sw.js');
const SW_SRC = readFileSync(SW_PATH, 'utf8');
const REGEN = 'run: node qa/gen-precache.mjs';

/* ---------------- evaluate the worker ---------------- */
// The context carries a small but HONEST service-worker runtime — CacheStorage, Request, Response and
// fetch — so the three handlers can be RUN rather than read. Cache-first, the origin guard and the
// offline fallbacks are the whole point of this file and none of them is visible in a regex.

const ORIGIN = 'https://example.test';

/**
 * A fake worker runtime.
 *   cached  paths already in the version's cache
 *   server  paths the network would serve (everything else 404s)
 *   offline every fetch throws, as it does in airplane mode
 */
function runtime({ cached = [], server = null, offline = false } = {}) {
  /** A cache key: a same-origin path, query INCLUDED — only `{ignoreSearch:true}` may drop it. */
  const norm = (k) => {
    const u = new URL(typeof k === 'string' ? k : String(k.url), ORIGIN + '/');
    return u.origin === ORIGIN ? (u.pathname + u.search).replace(/^\//, '') : u.href;
  };
  const bare = (k) => k.split('?')[0];
  class Res {
    constructor(body = '', init = {}) {
      this.body = body;
      this.status = init.status ?? 200;
      this.ok = this.status >= 200 && this.status < 300;
      this.type = init.type ?? 'basic';
      this.headers = init.headers ?? {};
    }
    clone() { return new Res(this.body, { status: this.status, type: this.type, headers: this.headers }); }
  }
  class Req {
    constructor(url, init = {}) {
      this.url = new URL(typeof url === 'string' ? url : url.url, ORIGIN + '/').href;
      this.method = init.method ?? 'GET';
      this.mode = init.mode ?? 'cors';
      this.destination = init.destination ?? '';
      this.cache = init.cache;                  // install must ask for 'reload' (S6: 600 s HTTP cache)
    }
  }
  const store = new Map();                       // cacheName → Map(path → Res)
  const fetched = [];
  const net = server === null ? new Set(cached) : new Set(server);
  const g = {
    console: { warn() { }, error() { }, log() { } },
    URL, Request: Req, Response: Res,
    location: { origin: ORIGIN, href: ORIGIN + '/sw.js' },
    clients: { claimed: 0, claim() { this.claimed++; } },
    skipWaiting() { g.skipped++; },
    skipped: 0,
    async fetch(request) {
      fetched.push(norm(request));
      if (offline) throw new TypeError('offline');
      return net.has(norm(request)) ? new Res('bytes:' + norm(request)) : new Res('', { status: 404 });
    },
    caches: {
      async open(name) {
        if (!store.has(name)) store.set(name, new Map());
        const m = store.get(name);
        return {
          async add(request) {
            const res = await g.fetch(request);
            if (!res.ok) throw new TypeError('cache.add: not ok');   // real CacheStorage rejects here
            m.set(norm(request), res);
          },
          async match(key, opts) {
            const k = norm(key);
            if (m.has(k)) return m.get(k);
            if (opts?.ignoreSearch) for (const [kk, v] of m) if (bare(kk) === bare(k)) return v;
            return undefined;
          },
          async put(request, res) { m.set(norm(request), res); return undefined; },
        };
      },
      async keys() { return [...store.keys()]; },
      async delete(name) { return store.delete(name); },
    },
  };
  return { g, store, fetched, norm, Res, Req };
}

function evalSW(opts = {}) {
  const imported = [];
  const events = [];
  const rt = runtime(opts);
  const g = rt.g;
  const handlers = {};
  g.self = g;                                   // a worker's global IS `self`
  g.importScripts = (...names) => {
    for (const n of names) {
      imported.push(n);
      vm.runInContext(readFileSync(join(SITE, n), 'utf8'), ctx, { filename: n });
    }
  };
  g.addEventListener = (type, fn) => { events.push(type); handlers[type] = fn; };
  const ctx = vm.createContext(g);
  vm.runInContext(SW_SRC, ctx, { filename: 'sw.js' });
  return {
    imported,
    events,
    handlers,
    ...rt,
    version: g.APP_VERSION,
    CACHE: String(vm.runInContext('CACHE', ctx)),
    SHELL: String(vm.runInContext('SHELL', ctx)),
    // Spread it into a HOST array: an array built inside the vm has that context's Array.prototype,
    // and assert.deepEqual compares prototypes — [] from the vm is not deepStrictEqual to [].
    PRECACHE: [...vm.runInContext('PRECACHE', ctx)].map(String),
  };
}

const sw = evalSW();

/** Run one lifecycle handler and wait for whatever it passed to waitUntil/respondWith. */
async function fire(w, type, event) {
  let held = null;
  const ev = { ...event, waitUntil: (p) => { held = p; }, respondWith: (p) => { held = p; } };
  const fn = w.handlers[type];
  assert.ok(typeof fn === 'function', `no ${type} handler`);
  fn(ev);
  return { responded: held !== null, value: await held };
}

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

  test('BUILD-POLICY §1 — and none is anywhere under site/, listed or not', () => {
    // The test above only sees what the list names. A scan dropped in site/ would be SERVED whether or
    // not it were precached, and the artifact is site/ entire.
    const all = scanDir(SITE).map((p) => toPosix(p.slice(SITE.length + 1)));
    const bad = all.filter((p) => /\.(png|jpe?g|gif|webp|pdf|tiff?|heic)$/i.test(p));
    assert.deepEqual(bad, [], `nothing owned by the school or by Kuta is ever served: ${bad.join(', ')}`);
  });
});

/* ---------------- the worker, RUN ---------------- */
// Cache-first, the origin guard and the offline fallbacks are what this file is for, and not one of
// them is visible in a regex over the source. Each of these drives the shipped handler.

describe('sw.js — install and activate', () => {
  test('install precaches every path, asking the network for fresh bytes', async () => {
    const w = evalSW({ server: null, cached: [] });
    const net = new Set(w.PRECACHE);
    w.g.fetch = async (request) => {
      const k = w.norm(request);
      assert.equal(request.cache, 'reload', `${k} was fetched from the HTTP cache, not the network`);
      return net.has(k) ? new w.Res('bytes:' + k) : new w.Res('', { status: 404 });
    };
    await fire(w, 'install', {});
    const cache = w.store.get(w.CACHE);
    assert.ok(cache, 'install opened no cache');
    assert.equal(cache.size, w.PRECACHE.length, 'install did not store the whole list');
  });

  test('ONE renamed file does not cost the student the offline app', async () => {
    // cache.addAll() is all-or-nothing: a single 404 would abort the install and leave nothing cached.
    const w = evalSW();
    const gone = w.PRECACHE[5];
    const net = new Set(w.PRECACHE.filter((p) => p !== gone));
    w.g.fetch = async (request) => (net.has(w.norm(request)) ? new w.Res('b') : new w.Res('', { status: 404 }));
    await fire(w, 'install', {});
    const cache = w.store.get(w.CACHE);
    assert.equal(cache.size, w.PRECACHE.length - 1, `one missing file (${gone}) aborted the whole install`);
    assert.equal(cache.has(gone), false);
  });

  test('install never swaps itself in — the reload pill does that', async () => {
    const w = evalSW();
    w.g.fetch = async () => new w.Res('b');
    await fire(w, 'install', {});
    assert.equal(w.g.skipped, 0, 'a new worker took over under a half-finished session');
  });

  test('activate deletes every OLDER version cache, keeps this one and anything not ours', async () => {
    const w = evalSW();
    w.store.set(w.CACHE, new Map([['index.html', new w.Res('b')]]));
    w.store.set('packet-0.0.1', new Map());
    w.store.set('packet-0.0.2', new Map());
    w.store.set('some-other-app', new Map());
    await fire(w, 'activate', {});
    assert.deepEqual([...w.store.keys()].sort(), [w.CACHE, 'some-other-app'].sort());
    assert.equal(w.g.clients.claimed, 1, 'the new worker did not claim its clients');
  });
});

describe('sw.js — fetch', () => {
  const asset = (w, path, init) => new w.Req(path, init);

  test('a cached asset comes from the cache, with the network never touched', async () => {
    const w = evalSW({ cached: ['js/app.js'], offline: true });   // offline: a fetch would THROW
    w.store.set(w.CACHE, new Map([['js/app.js', new w.Res('cached')]]));
    const r = await fire(w, 'fetch', { request: asset(w, 'js/app.js') });
    assert.ok(r.responded, 'the worker did not answer a same-origin GET');
    assert.equal(r.value.body, 'cached', 'the worker went to the network for a cached file');
    assert.deepEqual(w.fetched, [], 'cache-first means no request at all');
  });

  test('a query string does not miss the cache', async () => {
    const w = evalSW({ offline: true });
    w.store.set(w.CACHE, new Map([['js/app.js', new w.Res('cached')]]));
    const r = await fire(w, 'fetch', { request: asset(w, 'js/app.js?v=2') });
    assert.equal(r.value.body, 'cached', 'ignoreSearch is not being passed to match()');
  });

  test('every navigation resolves to the cached shell — hash routing has no other document', async () => {
    const w = evalSW({ offline: true });
    w.store.set(w.CACHE, new Map([['index.html', new w.Res('shell')]]));
    for (const href of ['/', '/#/today', '/#/run/job', '/#/settings']) {
      const r = await fire(w, 'fetch', { request: asset(w, href, { mode: 'navigate', destination: 'document' }) });
      assert.equal(r.value.body, 'shell', `${href} did not resolve to the shell`);
    }
  });

  test('a navigation with nothing cached yet is told so, offline, instead of failing', async () => {
    const w = evalSW({ offline: true });
    const r = await fire(w, 'fetch', { request: asset(w, '/#/today', { mode: 'navigate', destination: 'document' }) });
    assert.equal(r.value.status, 503);
    assert.match(String(r.value.body), /not cached on this device yet/);
  });

  test('an uncached asset is fetched once and kept; offline it is a 504, never a throw', async () => {
    const w = evalSW({ server: ['data/cards.js'] });
    const r = await fire(w, 'fetch', { request: asset(w, 'data/cards.js') });
    assert.equal(r.value.body, 'bytes:data/cards.js');
    assert.equal(w.store.get(w.CACHE)?.get('data/cards.js')?.body, 'bytes:data/cards.js', 'the runtime fetch was not cached');

    const off = evalSW({ offline: true });
    const r2 = await fire(off, 'fetch', { request: asset(off, 'data/cards.js') });
    assert.equal(r2.value.status, 504, 'an uncached asset offline must resolve, not reject');
  });

  test('a 404 is never cached — a deleted module must not become permanent', async () => {
    const w = evalSW({ server: [] });
    await fire(w, 'fetch', { request: asset(w, 'js/gone.js') });
    assert.equal(w.store.get(w.CACHE)?.size ?? 0, 0, 'a 404 entered the version cache');
  });

  test('S6 — a cross-origin request is not intercepted at all (zero third-party requests)', async () => {
    const w = evalSW();
    const req = new w.Req('https://fonts.example.com/x.woff2');
    req.url = 'https://fonts.example.com/x.woff2';
    const r = await fire(w, 'fetch', { request: req });
    assert.equal(r.responded, false, 'the worker answered for another origin');
  });

  test('a non-GET is not intercepted (nothing here ever POSTs)', async () => {
    const w = evalSW();
    const r = await fire(w, 'fetch', { request: asset(w, 'index.html', { method: 'POST' }) });
    assert.equal(r.responded, false);
  });
});

describe('sw.js — the message channel', () => {
  test('SKIP_WAITING is the only thing that swaps the worker in', async () => {
    const w = evalSW();
    w.handlers.message({ data: { type: 'VERSION' }, ports: [], source: null });
    assert.equal(w.g.skipped, 0);
    w.handlers.message({ data: { type: 'SKIP_WAITING' } });
    assert.equal(w.g.skipped, 1, 'the reload pill could not take the update');
  });

  test('VERSION answers with the version, the cache and the size of the list', async () => {
    const w = evalSW();
    const seen = [];
    w.handlers.message({ data: { type: 'VERSION' }, ports: [{ postMessage: (m) => seen.push(m) }] });
    assert.equal(seen.length, 1);
    // …spread into a HOST object: the reply is built inside the vm and carries its Object.prototype.
    assert.deepEqual({ ...seen[0] }, { type: 'VERSION', version: w.version, cache: w.CACHE, files: w.PRECACHE.length });
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
