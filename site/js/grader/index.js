// index.js — the grader dispatcher (COMPOSED S3 "Answer engine", S8 #3).
//
//   grade(part, raw, ctx = {}) → { ok, kind:'correct'|'wrong'|'almost'|'malformed', credit:0..1, msg, tags:[], normalized, …extras }
//
// One entry point for every part type. The eight numeric graders of T03 are imported statically (they are
// this ticket's own files); the word/figure graders of T04/T05 (pairs, asn, mc, strip, notation, term, cloze,
// classify, termmatch) are loaded with dynamic `import()` so a missing or broken module never takes the
// dispatcher down — `await ready` (or `await load()`) once at boot before the first submit; an unloaded type
// grades as `malformed` with `err:'no-grader'` instead of throwing. `register(type, fn)` adds or overrides.
//
// ctx (all optional, every grader ignores what it does not use):
//   strictGCF   Boss/Mock: a GCF left inside a factor is `wrong`, never `almost` (also implied by mock/boss)
//   mock        Mock: strict everywhere; the `equation` slot reports share 0.4 (see combineCredit)
//   boss        Boss: strict everywhere
//   sandbox     onboarding play: nothing escalates (every subset / GCF-incomplete submit stays a free `almost`)
//   state       a plain object the caller keeps PER PART across submits — the counters behind "a second subset
//               submit is wrong" and "a second GCF-incomplete submit is wrong" live here; created on the ctx
//               when absent (so reuse one ctx object per part, or pass your own state)
//   card / misconceptions   the card (or its misconceptions[]) so graders can match typed misconceptions
//   roots       (reject) the roots found in the roots stage;  model / figure (pairs) the figure
//   seed, settings, askReasonOnMiss, full36, blitz …  passed through to asn / mc / termmatch (T05)
//   gradePart   set by this dispatcher to itself before a `strip` is graded, so its num/multi slots get the
//               full num/multi diagnosis (T05's seam)
//
// Idempotent in the S3 sense: grading is a pure function of (part, raw, ctx.state); the widget's 200 ms
// double-submit guard is the place a repeated identical submit is ignored, because a repeated SUBSET submit
// is meant to escalate to `wrong` (S3 roots) — the dispatcher must not memoise that away.
//
// Never throws on student input: a grader exception comes back as `malformed` with `err:'grader-error'`
// and the message on `error` (tests assert no golden case produces one).

import { grade as num } from './num.js';
import { grade as multi } from './multi.js';
import { grade as roots } from './roots.js';
import { grade as reject } from './reject.js';
import { grade as cases } from './cases.js';
import { grade as ratio } from './ratio.js';
import { grade as equation } from './equation.js';
import { grade as factored } from './factored.js';

const registry = new Map([
  ['num', num], ['number', num], ['numeric', num],
  ['multi', multi],
  ['roots', roots],
  ['reject', reject],
  ['cases', cases],
  ['ratio', ratio],
  ['equation', equation], ['setup', equation],
  ['factored', factored], ['factor', factored],
]);

/** the T04/T05 graders, loaded lazily; a missing file is logged once and skipped */
const LAZY = {
  pairs: './pairs.js',
  asn: './asn.js',
  mc: './mc.js',
  strip: './strip.js',
  notation: './notation.js',
  term: './term.js',
  cloze: './cloze.js',
  classify: './classify.js',
  termmatch: './termmatch.js',
};
const ALIASES = { 'type-term': 'term', 'fill-justify': 'cloze', 'proof-strip': 'strip', 'match': 'termmatch' };

export const missing = [];

/** register(type, fn) — add or override a grader (fn(part, raw, ctx) → result) */
export function register(type, fn) {
  if (typeof fn !== 'function') throw new TypeError('register: fn must be a function');
  registry.set(String(type).toLowerCase(), fn);
}

/** has(type) — is a grader registered for this part type? */
export function has(type) {
  return registry.has(resolveType(type));
}

/** types() — every registered part type */
export function types() {
  return [...registry.keys()];
}

function resolveType(type) {
  const t = String(type ?? '').toLowerCase();
  return ALIASES[t] ?? t;
}

/** load() — import the lazy graders (idempotent; resolves when every attempt has settled) */
let loading = null;
export function load() {
  if (loading) return loading;
  loading = Promise.all(Object.entries(LAZY).map(([type, path]) => import(path).then((mod) => {
    const fn = typeof mod.grade === 'function' ? mod.grade : (typeof mod.default === 'function' ? mod.default : null);
    if (fn && !registry.has(type)) registry.set(type, fn);
    else if (!fn) missing.push({ type, path, error: 'module has no grade() export' });
  }).catch((e) => {
    missing.push({ type, path, error: e && e.message ? e.message : String(e) });
  }))).then(() => registry);
  return loading;
}

/** ready — the same promise; `await ready` once at boot */
export const ready = load();

function normalizeResult(r, type) {
  if (!r || typeof r !== 'object') {
    return { ok: false, kind: 'malformed', credit: 0, msg: 'Could not grade that — try again.', tags: [], normalized: null, err: 'bad-result', type };
  }
  const kind = r.kind === 'correct' || r.kind === 'wrong' || r.kind === 'almost' || r.kind === 'malformed' ? r.kind : (r.ok ? 'correct' : 'wrong');
  const ok = typeof r.ok === 'boolean' ? r.ok : kind === 'correct';
  let credit = typeof r.credit === 'number' && Number.isFinite(r.credit) ? r.credit : (ok ? 1 : 0);
  credit = Math.max(0, Math.min(1, credit));
  return { ...r, ok, kind, credit, msg: r.msg ?? '', tags: Array.isArray(r.tags) ? r.tags : [], normalized: r.normalized ?? null, type };
}

/**
 * grade — see the header.
 * @param {object} part   a card / generator part ({type, …})
 * @param {*} raw         the widget's raw() value
 * @param {object} [ctx]
 */
export function grade(part, raw, ctx = {}) {
  const type = resolveType(part && part.type);
  const fn = registry.get(type);
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  if (!c.state || typeof c.state !== 'object') c.state = {};
  if (c.strictGCF === undefined && (c.mock || c.boss)) c.strictGCF = true;
  if (!fn) {
    return normalizeResult({
      ok: false, kind: 'malformed', credit: 0, msg: 'This question type is not available yet.', tags: [], normalized: null, err: 'no-grader',
    }, type);
  }
  if (type === 'strip' && typeof c.gradePart !== 'function') c.gradePart = grade;
  try {
    return normalizeResult(fn(part, raw, c), type);
  } catch (e) {
    return normalizeResult({
      ok: false, kind: 'malformed', credit: 0, msg: 'Could not grade that — try again.', tags: [], normalized: null,
      err: 'grader-error', error: e && e.message ? e.message : String(e),
    }, type);
  }
}

/** isFree(result) — never consumes an attempt (Global rule 2): malformed, almost, or a grader's free:true */
export function isFree(r) {
  return !r || r.kind === 'malformed' || r.kind === 'almost' || r.free === true;
}

/**
 * combineCredit — an item's credit from its parts' results. Under ctx.mock an `equation` part is worth 40 %
 * of the item (2 of 5 points) and the answer parts share the other 60 % (S3); elsewhere every graded part
 * counts equally and an untried optional `equation` part (result null/undefined) is left out.
 * @param {Array<{part:object, result:object|null}>} entries
 * @param {object} [ctx]
 * @returns {number} 0..1
 */
export function combineCredit(entries, ctx = {}) {
  const list = (entries || []).filter((e) => e && e.part);
  const isEq = (e) => resolveType(e.part.type) === 'equation';
  const cr = (e) => (e.result && typeof e.result.credit === 'number' ? Math.max(0, Math.min(1, e.result.credit)) : 0);
  const mean = (arr) => (arr.length ? arr.reduce((s, e) => s + cr(e), 0) / arr.length : 0);
  if (ctx.mock) {
    const eq = list.filter(isEq);
    const rest = list.filter((e) => !isEq(e));
    if (eq.length && rest.length) return 0.4 * mean(eq) + 0.6 * mean(rest);
    return mean(list);
  }
  const graded = list.filter((e) => !(isEq(e) && e.part.optional && e.result == null));
  return mean(graded.length ? graded : list);
}

/** shareOf(part, ctx) — the weight an item's credit gives this part (0.4 for an equation slot in the Mock) */
export function shareOf(part, ctx = {}) {
  return ctx.mock && resolveType(part && part.type) === 'equation' ? 0.4 : 1;
}

export default grade;
