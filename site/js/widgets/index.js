// index.js — the widget registry: part type → widget module (COMPOSED S8 #8a).
//
// Statically registered: T08a's num / multi / ratio / rootcase (roots + reject + cases) and
// T08c's pairs. Every other widget (T08b's factored + equation, T08d's word widgets) is loaded
// ON DEMAND from LAZY below, so a type that is still being written costs nothing here and can
// never break this module's graph. Appending a widget is one line in LAZY, or a `register()`
// call from the owning module — never an edit to somebody else's block.
//
//   import { composeParts, loadFor, mountPart, ready } from '../widgets/index.js';
//   const groups = composeParts(card.parts);       // roots+reject+cases collapse into one rootcase
//   await loadFor(groups);                         // preload, so no placeholder is ever seen
//   const w = mountPart(host, groups[0], ctx);     // → the handle documented in base.js
//
// `mountPart` is synchronous even for a lazy type: it mounts a placeholder that swaps itself for
// the real widget when the module lands, and the handle it returns forwards every contract call.
//
// Names: `get/has/types/mountPart` are the T08a spelling; `widgetFor/widgetTypes/mountWidget/
// WIDGETS` are the aliases T08c's registry used (tests/widget-pairs.test.mjs imports those).
// Both are the same Map — register once, visible through both.

import numWidget from './num.js';
import multiWidget from './multi.js';
import ratioWidget from './ratio.js';
import rootcaseWidget from './rootcase.js';
import pairsWidget from './pairs.js';
import { h, handle } from './base.js';

/** type → mount(el, part, ctx). rootcase answers for all three of its stage types. */
export const WIDGETS = new Map([
  ['num', numWidget],
  ['multi', multiWidget],
  ['ratio', ratioWidget],
  ['rootcase', rootcaseWidget],
  ['roots', rootcaseWidget],
  ['reject', rootcaseWidget],
  ['cases', rootcaseWidget],
  ['pairs', pairsWidget],
]);

/** Widgets owned by later tickets; imported the first time a card needs one. */
export const LAZY = {
  factored: './factored.js',
  equation: './equation.js',
  strip: './strip.js',
  asn: './asn.js',
  mc: './mc.js',
  notation: './notation.js',
  term: './term.js',
  termmatch: './termmatch.js',
  cloze: './cloze.js',
  classify: './classify.js',
};

const ALIASES = { number: 'num', 'type-term': 'term', 'fill-justify': 'cloze', 'proof-strip': 'strip', match: 'termmatch', setup: 'equation' };

/** Modules that were asked for and failed to load (QA / T18 read this). */
export const missing = [];

export function resolveType(type) {
  const t = String(type ?? '').trim().toLowerCase();
  return ALIASES[t] ?? t;
}

/** register(type, mount) — add or override a widget (mount(el, part, ctx) → handle). */
export function register(type, mount) {
  const t = resolveType(type);
  if (!t) throw new TypeError('register: needs a non-empty type string');
  if (typeof mount !== 'function') throw new TypeError(`register: "${t}" needs a function (el, part, ctx) => handle`);
  WIDGETS.set(t, mount);
  return mount;
}

export const has = (type) => WIDGETS.has(resolveType(type));
export const get = (type) => WIDGETS.get(resolveType(type)) || null;
export const types = () => [...WIDGETS.keys()].sort();

/** T08c aliases (same registry). */
export const widgetFor = get;
export const widgetTypes = types;

const pending = new Map();

/** load(type) → Promise<mount|null> — import a lazy widget once; never throws. */
export function load(type) {
  const t = resolveType(type);
  if (WIDGETS.has(t)) return Promise.resolve(WIDGETS.get(t));
  if (pending.has(t)) return pending.get(t);
  const path = LAZY[t];
  if (!path) {
    missing.push({ type: t, path: null, error: 'no widget registered for this part type' });
    return Promise.resolve(null);
  }
  const p = import(path)
    .then((mod) => {
      const fn = typeof mod.mount === 'function' ? mod.mount : typeof mod.default === 'function' ? mod.default : null;
      if (!fn) { missing.push({ type: t, path, error: 'module has no mount() export' }); return null; }
      WIDGETS.set(t, fn);
      return fn;
    })
    .catch((e) => { missing.push({ type: t, path, error: e && e.message ? e.message : String(e) }); return null; });
  pending.set(t, p);
  return p;
}

/**
 * loadAll() → Promise<Map type→mount> — import every lazy widget. Used by `ready` below and by the
 * QA pages; a screen that knows its parts should prefer `loadFor(parts)`.
 * [W2 integrator] added for notes/T08b.md + notes/T08d.md ("await ready from js/widgets/index.js").
 */
export function loadAll() {
  const wanted = [...new Set([...WIDGETS.keys(), ...Object.keys(LAZY)])];
  return Promise.all(wanted.map(load)).then(() => new Map(wanted.map((t) => [t, WIDGETS.get(t) || null])));
}

/**
 * ready — `await ready` resolves once every widget module has landed (never rejects; a module that
 * failed is listed in `missing`). It is a **lazy thenable**, not an eager promise: nothing is
 * imported until something actually awaits it, so importing this registry still costs only the five
 * static widgets (that laziness is the point of LAZY). `await ready` reads the same as the grader
 * registry's `ready`, which is what notes/T08b.md and notes/T08d.md tell the Card screen to write.
 * [W2 integrator]
 */
export const ready = { then: (res, rej) => loadAll().then(res, rej), catch: (f) => loadAll().catch(f), finally: (f) => loadAll().finally(f) };

/** loadFor(parts) → Promise<Map type→mount> — preload every type a card (or a queue) needs. */
export function loadFor(parts = []) {
  const list = Array.isArray(parts) ? parts : [parts];
  const wanted = [...new Set(list.flatMap((p) => (p && p.type === 'rootcase' ? p.parts : [p])).map((p) => resolveType(p?.type)).filter(Boolean))];
  return Promise.all(wanted.map(load)).then(() => new Map(wanted.map((t) => [t, WIDGETS.get(t) || null])));
}

/**
 * composeParts(parts) → groups
 * S3: "roots → reject → cases render as one progressive rootcase widget on a single card", so a
 * roots part followed by its own reject / cases parts becomes one group:
 *   { id, type:'rootcase', of, roots, reject, cases, parts:[…the originals, still graded separately] }
 * Everything else passes through untouched. A lone roots part stays a roots part (the same widget
 * mounts it with one stage).
 */
export function composeParts(parts = []) {
  const list = Array.isArray(parts) ? parts : [];
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!p || p.type !== 'roots') { out.push(p); continue; }
    const group = { id: p.id, type: 'rootcase', of: p.id, roots: p, reject: null, cases: null, parts: [p] };
    while (i + 1 < list.length) {
      const n = list[i + 1];
      if (!n || (n.type !== 'reject' && n.type !== 'cases')) break;
      if (n.of && n.of !== p.id) break;
      if (group[n.type]) break;
      group[n.type] = n;
      group.parts.push(n);
      i++;
    }
    out.push(group.reject || group.cases ? group : p);
  }
  return out;
}

/** The parts a group covers (one for a plain part, up to three for a rootcase group). */
export const partsOf = (group) => (group && group.type === 'rootcase' ? group.parts.slice() : group ? [group] : []);

/**
 * pipsFor(partOrGroup) → n — the S1 HP pip formula: multi → its field count, cases → its row
 * count, everything else → 1 (so ang-10 = roots 1 + reject 1 + cases 2 = 4, doc-07 = 6).
 */
export function pipsFor(part) {
  if (!part) return 0;
  if (part.optional) return 0;                       // the skippable setup slot is not a pip (S1's counts)
  if (part.type === 'rootcase') return part.parts.reduce((n, p) => n + pipsFor(p), 0);
  if (part.type === 'multi') return Array.isArray(part.fields) ? part.fields.length || 1 : 1;
  if (part.type === 'cases') return Array.isArray(part.rows) ? part.rows.length || 1 : 1;
  return 1;
}

/** Sum of pipsFor over a card's parts (S1). Pass card.parts — grouping is applied here. */
export const pipsForCard = (parts = []) => composeParts(parts).reduce((n, p) => n + pipsFor(p), 0);

/**
 * mountPart(el, part, ctx) → handle
 * Synchronous for every registered type. For a lazy one it mounts a "loading" note, kicks the
 * import and swaps the real widget in when it lands; the returned handle proxies either way.
 */
export function mountPart(el, part, ctx = {}) {
  const type = resolveType(part?.type);
  const mount = WIDGETS.get(type);
  if (mount) return mount(el, part, ctx);

  const box = h('div.w.w-pending', { dataset: { part: part?.id || '', type } });
  box.append(h('p.w-note', LAZY[type] ? 'Loading this answer box…' : `No answer box for "${type}" yet.`));
  el.append(box);
  let live = null;
  let destroyed = false;
  let lockedTo = null;
  load(type).then((fn) => {
    if (destroyed) return;
    if (!fn) { box.textContent = ''; box.append(h('p.w-note', `No answer box for "${type}" yet.`)); return; }
    box.remove();
    live = fn(el, part, ctx);
    if (lockedTo !== null) live.lock(lockedTo);
    ctx.onReady?.(live);
  });
  const proxied = handle({
    el: box, part, type,
    raw: () => (live ? live.raw() : null),
    setFeedback: (res) => live?.setFeedback(res),
    lock: (on = true) => { lockedTo = on; live?.lock(on); },
    focus: () => live?.focus(),
    isEmpty: () => (live ? live.isEmpty() : true),
    pips: () => (live ? live.pips() : { total: pipsFor(part), filled: 0 }),
    values: () => live?.values?.() ?? null,
    activePart: () => (live?.activePart ? live.activePart() : part),
    destroy() { destroyed = true; if (live) live.destroy(); else box.remove(); },
  });
  // [W2 integrator] notes/T08b.md + notes/T08d.md: the placeholder used to forward ONLY the standard
  // contract, so a widget extra (stage(), progress(), preview(), split(), …) was silently missing on a
  // lazily mounted part. Anything not in the contract now forwards to the real widget once it lands;
  // the extras below are callable before it does (they answer `undefined`) so a screen that forgot its
  // `await loadFor(parts)` degrades instead of throwing. Unknown names stay `undefined` so feature
  // detection (`if (w.openSecond)`) still means something.
  return new Proxy(proxied, {
    get(target, key, recv) {
      if (Reflect.has(target, key)) return Reflect.get(target, key, recv);
      if (live) { const v = live[key]; return typeof v === 'function' ? v.bind(live) : v; }
      return EARLY_EXTRAS.has(key) ? () => undefined : undefined;
    },
    has: (target, key) => Reflect.has(target, key) || (live ? key in live : EARLY_EXTRAS.has(key)),
  });
}

/** Widget extras a screen may call before a lazy module has landed (see mountPart). */
const EARLY_EXTRAS = new Set([
  'setRaw', 'clear', 'skip', 'openSecond', 'preview', 'previewState', 'split',   // T08b
  'stage', 'stages', 'progress', 'options', 'layout', 'markup', 'left', 'blanks', // T08d
  'advance', 'found', 'setFound',                                                 // T08a rootcase
]);

/** mountWidget(el, part, ctx) — the T08c spelling: null for an unknown type or a missing host. */
export function mountWidget(el, part, ctx = {}) {
  const type = resolveType(part?.type);
  if (!el || (!WIDGETS.has(type) && !LAZY[type])) return null;
  return mountPart(el, part, ctx);
}

export { numWidget, multiWidget, ratioWidget, rootcaseWidget, pairsWidget };
export default { register, get, has, types, load, loadFor, loadAll, ready, mountPart, mountWidget, composeParts, partsOf, pipsFor, pipsForCard, missing, WIDGETS };
