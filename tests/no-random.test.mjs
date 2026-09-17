// no-random.test.mjs — BUILD-POLICY §2 / COMPOSED S3 "Seeding": nothing under
// site/js may use the global random source; every draw comes from a seeded
// stream (js/rng.js) so "RETRY SAME SEED" is byte-identical. The second block
// pins the seeded RNG's contract (determinism, ranges, purity) — the other half
// of the same policy.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cyrb53, seed32, seedTag, mulberry32, rngFrom } from '../site/js/rng.js';
import { ROOT, listFiles, stripCommentsAndStrings } from './_helpers.mjs';   // T17: one scanner for every suite
// Re-exported for the suites that used to import it from here (tests/run.test.mjs now takes it from _helpers).
export { stripCommentsAndStrings };

const JS_DIR = join(ROOT, 'site', 'js');
// The policy names site/js, but everything the browser runs is held to it:
// site/data/*.js and the root-level site/*.js (version.js, a future sw.js)
// ship in the same artifact, and one unseeded draw there breaks RETRY SAME SEED
// just as badly. qa/ is dev-only tooling and is not served, so it is not scanned.
const SITE_DIR = join(ROOT, 'site');
const FORBIDDEN = ['Math', 'random'].join('.'); // spelled indirectly so this file never contains the literal

const walk = (dir) => listFiles(dir);

describe('no global random source in anything site/ serves', () => {
  const files = walk(SITE_DIR);
  test('site/ contains modules to scan, site/js among them', () => {
    assert.ok(files.length >= 3, `expected site/ to hold modules, found ${files.length}`);
    assert.ok(files.some((f) => f.endsWith('rng.js')), 'site/js/rng.js exists');
    assert.ok(walk(JS_DIR).length >= 3, 'site/js is scanned');
    assert.ok(files.some((f) => f.includes(join('site', 'data'))), 'site/data is scanned too');
  });
  for (const f of files) {
    test(`${relative(ROOT, f)} does not call ${FORBIDDEN}`, () => {
      const src = stripCommentsAndStrings(readFileSync(f, 'utf8'));
      const idx = src.indexOf(FORBIDDEN);
      assert.equal(idx, -1, `${relative(ROOT, f)} uses ${FORBIDDEN} at offset ${idx} — seed from js/rng.js instead`);
    });
  }
});

describe('scanner', () => {
  test('stripCommentsAndStrings keeps code and drops comments/strings', () => {
    const code = `const a = 1; // ${FORBIDDEN} in a comment\n/* ${FORBIDDEN} block */ const s = '${FORBIDDEN}'; const t = \`${FORBIDDEN}\`;\nconst u = "x // not a comment"; const v = a / 2 / 3;`;
    const out = stripCommentsAndStrings(code);
    assert.equal(out.includes(FORBIDDEN), false);
    assert.ok(out.includes('const a = 1;'));
    assert.ok(out.includes('const v = a / 2 / 3;'));
    assert.ok(out.includes('const u = "";'));
    assert.equal(stripCommentsAndStrings(`x = ${FORBIDDEN}();`).includes(FORBIDDEN), true, 'a real call survives');
    assert.equal(stripCommentsAndStrings(`const s = 'it\\'s'; ${FORBIDDEN}()`).includes(FORBIDDEN), true, 'escaped quotes do not swallow code');
  });
});

describe('seeded RNG contract (js/rng.js)', () => {
  test('cyrb53 is the standard hash and never changes (seeds are persisted in saves)', () => {
    assert.equal(cyrb53('hello'), 4625896200565286);
    assert.equal(cyrb53('hello') >>> 0, 1674408486);
    assert.equal(seed32('hello'), 1674408486);
    assert.equal(cyrb53(''), cyrb53(''));
    assert.notEqual(cyrb53('a'), cyrb53('b'));
    assert.notEqual(cyrb53('hello', 1), cyrb53('hello', 2));
    assert.ok(Number.isInteger(cyrb53('x')) && cyrb53('x') >= 0 && cyrb53('x') < 2 ** 53);
    assert.equal(seed32(2 ** 32 + 5), 5);
    assert.match(seedTag('T-wp-07|abc'), /^[0-9a-f]{6}$/);
    assert.equal(seedTag('T-wp-07|abc'), seedTag('T-wp-07|abc'));
  });

  test('same seed → identical stream; different seed → different stream', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const sa = Array.from({ length: 50 }, () => a.next());
    const sb = Array.from({ length: 50 }, () => b.next());
    const sc = Array.from({ length: 50 }, () => c.next());
    assert.deepEqual(sa, sb);
    assert.notDeepEqual(sa, sc);
    assert.ok(sa.every((x) => x >= 0 && x < 1));
    assert.equal(a.seed, 42);
    assert.equal(a.draws, 50);
  });

  test('rngFrom joins parts with | and hashes (page / variant / boss / mock / daily seeds)', () => {
    const r1 = rngFrom('profile', 3, 1);
    const r2 = mulberry32(cyrb53('profile|3|1') >>> 0);
    assert.equal(r1.seed, r2.seed);
    assert.equal(r1.next(), r2.next());
    assert.notEqual(rngFrom('T-wp-07', 'a').seed, rngFrom('T-wp-07', 'b').seed);
    assert.equal(rngFrom('2026-09-16').seed, rngFrom('2026-09-16').seed);
  });

  test('int is inclusive on both ends and covers every value', () => {
    const r = mulberry32('ints');
    const seen = new Set();
    for (let i = 0; i < 2000; i++) {
      const v = r.int(1, 6);
      assert.ok(Number.isInteger(v) && v >= 1 && v <= 6, String(v));
      seen.add(v);
    }
    assert.equal(seen.size, 6);
    for (let i = 0; i < 200; i++) {
      const v = r.int(-3, 3);
      assert.ok(v >= -3 && v <= 3);
    }
    assert.equal(r.int(5, 5), 5);
    const one = r.int(4);
    assert.ok(one >= 0 && one <= 4, 'int(hi) means [0, hi]');
    const swapped = r.int(6, 1);
    assert.ok(swapped >= 1 && swapped <= 6, 'arguments in either order');
  });

  test('int is roughly uniform (no face off by more than 15 %)', () => {
    const r = mulberry32(7);
    const counts = [0, 0, 0, 0, 0, 0];
    const N = 60000;
    for (let i = 0; i < N; i++) counts[r.int(1, 6) - 1]++;
    for (const c of counts) assert.ok(Math.abs(c - N / 6) < N / 6 * 0.15, JSON.stringify(counts));
  });

  test('pick / weighted / shuffle / sample / chance / float', () => {
    const r = mulberry32('pick');
    const arr = [1, 2, 3, 4, 5];
    for (let i = 0; i < 100; i++) assert.ok(arr.includes(r.pick(arr)));
    assert.equal(r.pick([]), undefined);
    assert.equal(r.pick(null), undefined);
    const w = { a: 0, b: 0 };
    for (let i = 0; i < 1000; i++) w[r.weighted(['a', 'b'], [3, 1])]++;
    assert.ok(w.a > w.b * 2, JSON.stringify(w));
    assert.equal(r.weighted(['only'], [0]), 'only', 'zero weights fall back to pick');

    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const frozen = src.slice();
    const sh = r.shuffle(src);
    assert.deepEqual(src, frozen, 'shuffle never mutates its input');
    assert.deepEqual(sh.slice().sort((x, y) => x - y), src, 'shuffle is a permutation');
    assert.notDeepEqual(mulberry32(1).shuffle(src), mulberry32(2).shuffle(src));
    assert.deepEqual(mulberry32(9).shuffle(src), mulberry32(9).shuffle(src));
    const smp = r.sample(src, 3);
    assert.equal(smp.length, 3);
    assert.equal(new Set(smp).size, 3);
    assert.equal(r.sample(src, 99).length, 8);

    assert.equal(r.chance(0), false);
    assert.equal(r.chance(1), true);
    assert.equal(r.chance(-1), false);
    assert.equal(r.chance(NaN), false);
    let hits = 0;
    for (let i = 0; i < 4000; i++) if (r.chance(0.25)) hits++;
    assert.ok(hits > 800 && hits < 1200, String(hits));
    for (let i = 0; i < 100; i++) { const f = r.float(2, 3); assert.ok(f >= 2 && f < 3); }
  });

  test('fork gives an independent, order-free child stream', () => {
    const p = mulberry32('parent');
    const f1 = p.fork('child');
    p.next(); p.next();
    const f2 = p.fork('child');
    assert.equal(f1.seed, f2.seed, 'a fork depends on the parent seed and label, not on how many draws were made');
    assert.equal(f1.next(), f2.next());
    assert.notEqual(p.fork('a').seed, p.fork('b').seed);
  });
});
