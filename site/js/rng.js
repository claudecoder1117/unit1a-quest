// rng.js — deterministic seeding for The Packet (COMPOSED S3 "Seeding").
// cyrb53(str) >>> 0 feeds mulberry32; every generated card, page, boss,
// mock and daily challenge derives from a string seed so "RETRY SAME SEED"
// reproduces byte-identical runs. Nothing in site/js may use the global
// random source (tests/no-random.test.mjs greps for it).

/**
 * cyrb53 — fast 53-bit string hash (public-domain algorithm by bryc).
 * Returns an integer in [0, 2^53). Use `>>> 0` (or seed32) for a 32-bit seed.
 * @param {string} str
 * @param {number} [seed=0]
 * @returns {number}
 */
export function cyrb53(str, seed = 0) {
  str = String(str);
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * seed32 — the 32-bit seed the spec feeds to mulberry32: `cyrb53(str) >>> 0`.
 * Accepts a string (hashed) or a number (truncated to uint32).
 * @param {string|number} key
 * @returns {number} uint32
 */
export function seed32(key) {
  if (typeof key === 'number') return key >>> 0;
  return cyrb53(String(key)) >>> 0;
}

/**
 * seedTag — six lowercase hex chars for display (`T-wp-07#a91f2c`).
 * @param {string|number} key  a seed string or a uint32 seed
 * @returns {string}
 */
export function seedTag(key) {
  return seed32(key).toString(16).padStart(8, '0').slice(-6);
}

/**
 * mulberry32 — small, fast 32-bit PRNG wrapped in a draw-counting object.
 * @param {number|string} seed  uint32 seed (a string is hashed with seed32)
 * @returns {Rng}
 */
export function mulberry32(seed) {
  let a = seed32(seed);
  const seedValue = a;
  /** @type {Rng} */
  const rng = {
    /** the uint32 this stream started from (store it on run records) */
    seed: seedValue,
    /** number of raw draws so far (generators cap re-rolls at 200 draws) */
    draws: 0,
    /** uniform float in [0, 1) */
    next() {
      rng.draws++;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    /** integer in [lo, hi] inclusive (arguments in either order) */
    int(lo, hi) {
      if (hi === undefined) { hi = lo; lo = 0; }
      lo = Math.ceil(lo); hi = Math.floor(hi);
      if (hi < lo) { const t = lo; lo = hi; hi = t; }
      return lo + Math.floor(rng.next() * (hi - lo + 1));
    },
    /** float in [lo, hi) */
    float(lo = 0, hi = 1) {
      return lo + rng.next() * (hi - lo);
    },
    /** true with probability p (clamped to [0, 1]) */
    chance(p) {
      if (!(p > 0)) return false;
      if (p >= 1) return true;
      return rng.next() < p;
    },
    /** one element of a non-empty array (undefined for an empty one) */
    pick(arr) {
      if (!arr || arr.length === 0) return undefined;
      return arr[Math.floor(rng.next() * arr.length)];
    },
    /** one element, weighted by weights[i] (>= 0); falls back to pick */
    weighted(arr, weights) {
      if (!arr || arr.length === 0) return undefined;
      let total = 0;
      for (let i = 0; i < arr.length; i++) total += Math.max(0, weights[i] || 0);
      if (!(total > 0)) return rng.pick(arr);
      let r = rng.next() * total;
      for (let i = 0; i < arr.length; i++) {
        r -= Math.max(0, weights[i] || 0);
        if (r < 0) return arr[i];
      }
      return arr[arr.length - 1];
    },
    /** a NEW shuffled copy (Fisher–Yates); the input is never mutated */
    shuffle(arr) {
      const out = Array.from(arr);
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1));
        const t = out[i]; out[i] = out[j]; out[j] = t;
      }
      return out;
    },
    /** k distinct elements in draw order (k clamped to arr.length) */
    sample(arr, k) {
      return rng.shuffle(arr).slice(0, Math.max(0, Math.min(k, arr.length)));
    },
    /** an independent child stream keyed by a label (order-independent of other forks) */
    fork(label) {
      return mulberry32(cyrb53(String(label), seedValue) >>> 0);
    },
  };
  return rng;
}

/**
 * rngFrom — the spec's one-liner: `mulberry32(cyrb53(parts.join('|')) >>> 0)`.
 * rngFrom('page', profileId, dayIndex, pageIndex) / rngFrom('T-wp-07', seedString) …
 * @param {...(string|number)} parts
 * @returns {Rng}
 */
export function rngFrom(...parts) {
  return mulberry32(cyrb53(parts.map(String).join('|')) >>> 0);
}

/**
 * @typedef {object} Rng
 * @property {number} seed
 * @property {number} draws
 * @property {() => number} next
 * @property {(lo: number, hi?: number) => number} int
 * @property {(lo?: number, hi?: number) => number} float
 * @property {(p: number) => boolean} chance
 * @property {<T>(arr: T[]) => T|undefined} pick
 * @property {<T>(arr: T[], weights: number[]) => T|undefined} weighted
 * @property {<T>(arr: T[]) => T[]} shuffle
 * @property {<T>(arr: T[], k: number) => T[]} sample
 * @property {(label: string) => Rng} fork
 */
