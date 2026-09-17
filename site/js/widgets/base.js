// base.js — the widget contract plus every piece the answer widgets share:
// the key row above the OS keyboard (setRangeText, never synthetic key events), the
// visualViewport-aware dock, the labelled 48 px field, feedback states and the figure
// wedge link. DOM-only: no grading lives here (COMPOSED S3 keeps that in js/grader/*).
//
// THE CONTRACT (COMPOSED S8 #8a). Every widget module default-exports, and also names,
//   mount(el, part, ctx) → handle
// where `el` is the container to build into, `part` is the S6 part object (or, for
// rootcase, the composite group from widgets/index.js) and `ctx` is the card context.
//
//   handle.raw()                → the raw answer in the shape that part's grader documents
//                                 (notes/T03.md lists one per grader). Never throws.
//   handle.setFeedback(res)     → render a grade() result: states ok / bad / almost on the
//                                 offending field only, the one-line reason, correct fields
//                                 lock, res.fill / res.reveal are applied (widget actions).
//                                 Passing null clears the feedback.
//   handle.lock(on = true)      → disable every input (cleared card, solution shown).
//   handle.focus()              → focus the first unanswered input (no-op when locked).
//   handle.destroy()            → remove listeners, timers, the dock and the key row.
//   handle.isEmpty()            → nothing typed yet (T09: keep Submit disabled).
//   handle.pips()               → {total, filled} for the S1 HP pip formula (multi → fields,
//                                 cases → rows, everything else → 1).
//   handle.part / handle.el / handle.type
// rootcase additionally exposes activePart(), stage(), stages(), advance(), found().
//
// ctx (all optional): { card, onSubmit(), onInput(), onWedge(ref, on), figureEl, keys (a
// shared keyRow handle, e.g. the dock's), found:[roots], values:{…} (restored answer),
// locked, seed }. The widget also fires bubbling CustomEvents on its root element:
// 'w-input' (anything typed) and 'w-submit' (Enter / a done key), so a screen can listen
// instead of passing callbacks.
//
// No Math.random, no runtime deps, no import of js/app.js (importing the entry module
// would boot the app a second time); mathfmt.js is the only sibling import.

import { mathfmt, stripMarkup } from '../mathfmt.js';

/* ------------------------------------------------------------------ DOM helpers */

/** h('div.w-field', {…attrs}, …children) — 'tag.class.class#id' selector syntax. */
export function h(sel, attrs, ...kids) {
  const m = /^([a-z0-9-]+)?((?:\.[^.#]+)*)?(?:#([^.#]+))?$/i.exec(sel) || [];
  const node = document.createElement(m[1] || 'div');
  if (m[2]) for (const c of m[2].split('.').filter(Boolean)) node.classList.add(c);
  if (m[3]) node.id = m[3];
  if (attrs && (typeof attrs !== 'object' || attrs.nodeType || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
  add(node, kids);
  return node;
}

function add(node, kids) {
  for (const k of kids.flat(4)) {
    if (k == null || k === false) continue;
    node.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
}

/** Mini-markup ({m CFD}, {ray AH}, x^2) → a span; plain strings stay plain text. */
export function label(src, cls = 'w-mk') {
  const s = String(src ?? '');
  const node = h('span.' + cls);
  node.innerHTML = mathfmt(s);
  return node;
}

/** The same string with the markup removed — for aria-label, placeholders and titles. */
export function plain(src) {
  return stripMarkup(String(src ?? ''));
}

let uid = 0;
export const nextId = (p = 'w') => `${p}-${++uid}`;

/* ------------------------------------------------------------------ the key row */

// S3's row is the union `− / ( ) x y ² ° , : or`; each widget takes the subset its part
// needs so every key keeps a ≥ 44 px target at 375 px (11 keys in one row would be 31 px).
// `insert` is what lands in the field: ASCII '-' for the minus glyph, '^2' for ², a spaced
// ' or ' between roots. normalize.js reads all of them.
export const KEY_DEFS = {
  '-': { label: '−', insert: '-', aria: 'minus' },
  '/': { label: '/', insert: '/', aria: 'fraction slash' },
  '(': { label: '(', insert: '(', aria: 'open bracket' },
  ')': { label: ')', insert: ')', aria: 'close bracket' },
  x: { label: 'x', insert: 'x', aria: 'letter x' },
  y: { label: 'y', insert: 'y', aria: 'letter y' },
  '^2': { label: '²', insert: '^2', aria: 'squared' },
  '°': { label: '°', insert: '°', aria: 'degree sign' },
  ',': { label: ',', insert: ', ', aria: 'comma, next answer' },
  ':': { label: ':', insert: ':', aria: 'ratio colon' },
  or: { label: 'or', insert: ' or ', aria: 'or, next answer' },
  '.': { label: '.', insert: '.', aria: 'decimal point' },
};

export const KEYS = {
  num: ['-', '/', '(', ')', '°'],
  roots: ['-', '/', ',', 'or'],
  ratio: [':', '/', '-'],
  equation: ['-', '/', '(', ')', 'x', 'y', '^2'],
  full: ['-', '/', '(', ')', 'x', 'y', '^2', '°', ',', ':', 'or'],
};

const keyDef = (k) => (typeof k === 'string' ? KEY_DEFS[k] || { label: k, insert: k } : k);
const isTextInput = (n) => !!n && n.tagName === 'INPUT' && n.type === 'text';
const usable = (n) => isTextInput(n) && n.isConnected && !n.disabled && !n.readOnly;

/**
 * Insert `text` at the caret of `input` with setRangeText (S3: never simulated key events —
 * iOS Safari and Android Chrome both ignore synthetic keydowns in a text field).
 * Keeps focus, so the OS keyboard never closes. Returns true when something was written.
 */
export function insertAtCaret(input, text) {
  if (!usable(input) || !text) return false;
  input.focus({ preventScroll: true });
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  if (typeof input.setRangeText === 'function') {
    input.setRangeText(text, start, end, 'end');
  } else {
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    const caret = start + text.length;
    try { input.setSelectionRange(caret, caret); } catch { /* detached */ }
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

/**
 * keyRow({ keys, root, label }) → { el, watch(root), setTarget(input), target(), setKeys(keys), destroy() }
 * A row of insert keys that sits above the OS keyboard. It remembers the last focused text
 * input inside `root` (focusin), and pressing a key never steals focus (pointerdown/mousedown
 * are prevented), so the keyboard stays open and the caret stays put.
 */
export function keyRow(opts = {}) {
  const el = h('div.w-keys', { role: 'group', 'aria-label': opts.label || 'Insert keys' });
  let entries = [];           // { root, set } — a shared dock row switches to the focused widget's set
  let target = null;
  let activeRoot = null;
  const onFocusIn = (e) => {
    const entry = entries.find((x) => x.root.contains(e.target));
    if (entry) { activeRoot = entry.root; if (entry.set) setKeys(entry.set); }
    if (isTextInput(e.target)) target = e.target;
  };

  function resolve() {
    if (usable(target)) return target;
    const scope = entries.find((x) => x.root === activeRoot) || entries[0];
    for (const r of scope ? [scope.root, ...entries.map((x) => x.root)] : []) {
      const hit = r.querySelector('input[type="text"]:not([disabled]):not([readonly])');
      if (hit) return hit;
    }
    return null;
  }

  function press(def) {
    const t = resolve();
    if (!t) return;
    target = t;
    insertAtCaret(t, def.insert);
  }

  function setKeys(keys) {
    el.textContent = '';
    for (const k of (keys || KEYS.num).map(keyDef)) {
      const b = h('button.w-key', { type: 'button', tabindex: '-1', 'aria-label': k.aria || k.label, 'data-insert': k.insert }, k.label);
      b.addEventListener('pointerdown', (e) => e.preventDefault());
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', (e) => { e.preventDefault(); press(k); });
      el.append(b);
    }
    el.dataset.n = String(el.children.length);
  }
  setKeys(opts.keys);

  const api = {
    el,
    /** watch(root, keys?) — track this widget's fields; `keys` is the set to show while it has focus. */
    watch(root, set) {
      if (!root) return api;
      const found = entries.find((x) => x.root === root);
      if (found) { if (set) found.set = set; return api; }
      entries.push({ root, set: set || null });
      root.addEventListener('focusin', onFocusIn);
      if (entries.length === 1 && set) { activeRoot = root; setKeys(set); }
      return api;
    },
    /** claim(root, keys) — change a watched widget's key set (rootcase does this per stage). */
    claim(root, set) {
      const entry = entries.find((x) => x.root === root);
      if (entry) entry.set = set;
      if (!activeRoot || activeRoot === root || entries.length === 1) { activeRoot = root; setKeys(set); }
      return api;
    },
    unwatch(root) {
      const i = entries.findIndex((x) => x.root === root);
      if (i < 0) return api;
      entries.splice(i, 1);
      root.removeEventListener('focusin', onFocusIn);
      if (activeRoot === root) activeRoot = null;
      if (target && !target.isConnected) target = null;
      return api;
    },
    setTarget(input) { if (isTextInput(input)) target = input; return api; },
    target: () => resolve(),
    setKeys,
    destroy() {
      for (const x of entries.slice()) api.unwatch(x.root);
      el.remove();
      target = null;
    },
  };
  if (opts.root) api.watch(opts.root, opts.keys);
  return api;
}

/* ----------------------------------------------- visualViewport: the keyboard inset */

let insetRefs = 0;
let insetOff = null;

/**
 * keyboardInset() → detach()
 * Publishes the on-screen keyboard's height as `--kb` on <html> and sets data-kb="open|closed",
 * so the sticky dock can lift itself above the keyboard (CSS: translateY(calc(-1 * var(--kb)))).
 * iOS Safari and Android Chrome both shrink the VISUAL viewport only, so window.innerHeight −
 * (visualViewport.height + offsetTop) is the inset on both. Ref-counted: many widgets, one listener.
 */
export function keyboardInset(opts = {}) {
  const win = opts.window || (typeof window !== 'undefined' ? window : null);
  const root = win && win.document ? win.document.documentElement : null;
  if (!win || !root) return () => {};
  insetRefs++;
  if (!insetOff) {
    const vv = win.visualViewport;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const inset = vv ? Math.max(0, Math.round(win.innerHeight - vv.height - vv.offsetTop)) : 0;
      root.style.setProperty('--kb', inset + 'px');
      root.dataset.kb = inset > 80 ? 'open' : 'closed';
    };
    const schedule = () => { if (!raf) raf = win.requestAnimationFrame(apply); };
    apply();
    vv?.addEventListener('resize', schedule);
    vv?.addEventListener('scroll', schedule);
    win.addEventListener('orientationchange', schedule);
    insetOff = () => {
      if (raf) win.cancelAnimationFrame(raf);
      vv?.removeEventListener('resize', schedule);
      vv?.removeEventListener('scroll', schedule);
      win.removeEventListener('orientationchange', schedule);
      root.style.removeProperty('--kb');
      delete root.dataset.kb;
    };
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    if (--insetRefs <= 0) { insetRefs = 0; insetOff?.(); insetOff = null; }
  };
}

/** Scroll a focused field back above the keyboard + dock when the OS pushed it out of sight. */
export function keepVisible(node, opts = {}) {
  const win = opts.window || (typeof window !== 'undefined' ? window : null);
  if (!win || !node) return;
  win.setTimeout(() => {
    if (!node.isConnected) return;
    const vv = win.visualViewport;
    const bottom = vv ? vv.offsetTop + vv.height : win.innerHeight;
    const dockH = opts.dock?.el?.offsetHeight || 0;
    const r = node.getBoundingClientRect();
    if (r.bottom > bottom - dockH - 8 || r.top < 8) {
      const reduce = win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      node.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    }
  }, opts.delay ?? 220);
}

/* ------------------------------------------------------------------ the answer dock */

/**
 * createDock({ keys, host, document }) → { el, keys, actions, body, setKeys, show, hide, destroy, height() }
 * Fills T01's sticky `#dock` slot (or, when it is missing, creates one) with the key row and a
 * row for the screen's own buttons (`actions`). Keeps `--kb` current while it lives, so the dock
 * rides above the OS keyboard; `padding-bottom: env(safe-area-inset-bottom)` comes from base.css.
 */
export function createDock(opts = {}) {
  const doc = opts.document || document;
  const slot = opts.host || doc.getElementById('dock');
  const owned = !slot;
  const el = slot || h('div.dock.w-dock-own');
  const inner = slot ? (slot.querySelector('.dock-inner') || el.appendChild(h('div.dock-inner'))) : el.appendChild(h('div.dock-inner'));
  const body = h('div.w-dock-body');
  const keys = opts.keys === false ? null : keyRow({ keys: opts.keys, label: 'Insert keys' });
  const actions = h('div.w-dock-actions');
  inner.append(body);
  if (keys) inner.append(keys.el);
  inner.append(actions);
  if (owned) doc.body.append(el);
  const wasHidden = el.hidden;
  el.hidden = false;
  el.classList.add('w-dock');
  const offInset = keyboardInset({ window: opts.window });
  return {
    el, inner, body, actions, keys,
    setKeys: (k) => keys?.setKeys(k),
    watch: (root) => keys?.watch(root),
    show() { el.hidden = false; },
    hide() { el.hidden = true; },
    height: () => el.offsetHeight || 0,
    destroy() {
      offInset();
      keys?.destroy();
      body.remove();
      actions.remove();
      el.classList.remove('w-dock');
      if (owned) el.remove(); else el.hidden = wasHidden;
    },
  };
}

/* ------------------------------------------------------------------ fields + states */

/** grade() kind → the visual state. `almost` and `malformed` are free (S3), so both read amber. */
export function stateOf(res) {
  if (!res) return '';
  if (res.state) return res.state;
  const kind = res.kind || (res.ok ? 'correct' : 'wrong');
  if (kind === 'correct' || res.ok) return 'ok';
  if (kind === 'wrong') return 'bad';
  return 'almost';
}

const GLYPH = { ok: '✓', bad: '✗', almost: '!', open: '' };

/**
 * resultText(res, fallback) — the grader's line with its own ✓ / ✗ decoration removed: the state
 * glyph in front of the message already carries the verdict, so the word never shows it twice.
 */
export function resultText(res, fallback = '') {
  const t = String(res?.msg ?? '')
    .replace(/^\s*[✓✗!]\s*(—\s*)?/, '')
    .replace(/\s*[✓✗]\s*$/, '')
    .trim();
  return t || fallback;
}

/** One 120 ms / 180 ms motion cue (S5). Colour never carries the verdict alone — the glyph does. */
export function flash(node, state) {
  if (!node) return;
  const cls = state === 'ok' ? 'is-pulse' : state === 'bad' ? 'is-shake' : state === 'almost' ? 'is-amber' : null;
  if (!cls) return;
  node.classList.remove('is-pulse', 'is-shake', 'is-amber');
  void node.offsetWidth; // restart the animation
  node.classList.add(cls);
  const off = () => node.classList.remove(cls);
  node.addEventListener('animationend', off, { once: true });
  setTimeout(off, 700);
}

/**
 * field(spec) → a labelled 48 px input with its own state, mark glyph and message line.
 * spec: { key, label, value, placeholder, inputmode = 'decimal', wedge, aria, size:'sm'|'md',
 *         prefix, suffix, readOnly, onInput, onEnter, onFocus }
 */
export function field(spec = {}) {
  const id = spec.id || nextId('f');
  const input = h('input.w-input', {
    id,
    type: 'text',
    inputmode: spec.inputmode || 'decimal',
    autocomplete: 'off',
    autocorrect: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    enterkeyhint: spec.enterkeyhint || 'done',
    placeholder: spec.placeholder || '',
    'aria-label': spec.aria || plain(spec.label || spec.key || 'answer'),
    value: spec.value == null ? '' : String(spec.value),
  });
  const mark = h('span.w-mark', { 'aria-hidden': 'true' });
  const box = h('div.w-fbox', spec.prefix ? h('span.w-affix', spec.prefix) : null, input, spec.suffix ? h('span.w-affix', spec.suffix) : null, mark);
  const msg = h('p.w-fmsg');
  const wrap = h('div.w-field', { dataset: { state: '', key: spec.key || '', size: spec.size || 'md' } });
  if (spec.label != null && spec.label !== '') {
    const lab = h('label.w-flabel', { for: id });
    lab.append(label(spec.label));
    wrap.append(lab);
  }
  wrap.append(box, msg);
  if (spec.wedge) wrap.dataset.wedge = spec.wedge;
  if (spec.readOnly) input.readOnly = true;

  input.addEventListener('input', () => {
    if (wrap.dataset.state && wrap.dataset.state !== 'ok') api.setState('', '');
    spec.onInput?.(api);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); spec.onEnter?.(api); }
  });
  if (spec.onFocus) input.addEventListener('focus', () => spec.onFocus(api));

  const api = {
    key: spec.key, wrap, input, msg, spec,
    value: () => input.value,
    set(v) { input.value = v == null ? '' : String(v); return api; },
    clear() { input.value = ''; api.setState('', ''); return api; },
    isBlank: () => !input.value.trim(),
    focus() { if (!input.disabled && !input.readOnly) input.focus({ preventScroll: true }); return api; },
    setState(state, message) {
      wrap.dataset.state = state || '';
      mark.textContent = GLYPH[state] || '';
      msg.textContent = message || '';
      msg.hidden = !message;
      input.setAttribute('aria-invalid', state === 'bad' ? 'true' : 'false');
      return api;
    },
    flash(state) { flash(wrap, state); return api; },
    lock(on = true) {
      input.disabled = !!on && !spec.keepEnabled;
      wrap.classList.toggle('is-locked', !!on);
      return api;
    },
    freeze() { input.readOnly = true; wrap.classList.add('is-frozen'); return api; },
    enabled: () => !input.disabled && !input.readOnly,
  };
  return api;
}

/** The widget-level result line: glyph + one sentence, polite live region (S5 AAA checklist). */
export function msgLine(opts = {}) {
  const glyph = h('span.w-msg-glyph', { 'aria-hidden': 'true' });
  const body = h('span.w-msg-text');
  // Never hidden: the line keeps its height (CSS min-height) so the feedback panel cannot shift
  // the page when it appears (S5 "height reserved", S9 zero layout shift).
  const el = h('p.w-msg', { role: 'status', 'aria-live': 'polite', dataset: { state: '' } }, glyph, body);
  return {
    el,
    set(state, message) {
      const txt = String(message ?? '');
      el.dataset.state = state || '';
      glyph.textContent = txt ? GLYPH[state] || '' : '';
      body.innerHTML = mathfmt(txt);
      return el;
    },
    clear() { el.dataset.state = ''; glyph.textContent = ''; body.textContent = ''; },
    node: el,
    reserve: opts.reserve !== false,
  };
}

/* ------------------------------------------------------------------ figure wedge link */

let svgMod = null;
function figureApi() {
  if (!svgMod) svgMod = import('../figure/svg.js').catch(() => ({}));
  return svgMod;
}

/**
 * wedgeLink(ctx) → { on(ref), off(ref), clear() }
 * S3/S5: focusing `m∠CFD =` fills that wedge at 18 %. Uses ctx.onWedge when the screen supplies
 * one; otherwise drives ctx.figureEl directly through figure/svg.js's setWedgeState (loaded on
 * demand, so a figure-less card never fetches the figure modules).
 */
export function wedgeLink(ctx = {}) {
  let last = null;
  const set = (ref, on) => {
    if (!ref) return;
    if (typeof ctx.onWedge === 'function') { ctx.onWedge(ref, on); return; }
    const root = ctx.figureEl || ctx.figure || null;
    if (!root) return;
    figureApi().then((m) => { try { m.setWedgeState?.(root, ref, 'linked', on); } catch { /* wedge gone */ } });
  };
  return {
    on(ref) { if (ref === last) return; if (last) set(last, false); last = ref || null; if (last) set(last, true); },
    off(ref) { if (ref && ref !== last) return; if (last) set(last, false); last = null; },
    clear() { if (last) set(last, false); last = null; },
  };
}

/* ------------------------------------------------------------------ plumbing */

/**
 * Fire the bubbling events a screen can listen for, and call the ctx callbacks.
 * S3 edge case: "double-submit within 200 ms ignored" — the guard lives here, so a double-tapped
 * Enter (or a key repeat) can never spend two attempts. A screen's own Submit button should call
 * `w.raw()` through the same path (listen for 'w-submit') or guard itself.
 */
export function wire(root, ctx = {}, { guardMs = 200 } = {}) {
  let last = 0;
  return {
    input(detail) {
      ctx.onInput?.(detail);
      root.dispatchEvent(new CustomEvent('w-input', { bubbles: true, detail }));
    },
    submit(detail) {
      const now = Date.now();
      if (now - last < guardMs) return false;
      last = now;
      ctx.onSubmit?.(detail);
      root.dispatchEvent(new CustomEvent('w-submit', { bubbles: true, detail }));
      return true;
    },
  };
}

/**
 * Fill in the contract so a caller can trust every method exists.
 * [W2 integrator, notes/T08d.md request (b)] `impl` is copied by DESCRIPTOR, not by spread, so a
 * widget may expose a live getter (`get stage() {…}`) as well as a plain method; the defaults below
 * are only used for keys `impl` does not define.
 */
export function handle(impl) {
  const base = {
    raw: () => null,
    setFeedback() {},
    lock() {},
    focus() {},
    destroy() {},
    isEmpty: () => true,
    pips: () => ({ total: 1, filled: 0 }),
  };
  return Object.defineProperties(base, Object.getOwnPropertyDescriptors(Object(impl)));
}

/** The prompt / label line above a widget's fields. */
export function promptLine(part = {}) {
  const txt = part.prompt || '';
  if (!txt) return null;
  const p = h('p.w-prompt');
  p.append(label(txt));
  return p;
}

export default { h, label, plain, field, msgLine, keyRow, createDock, keyboardInset, insertAtCaret, wedgeLink, handle, stateOf, flash, wire, KEYS, KEY_DEFS };
