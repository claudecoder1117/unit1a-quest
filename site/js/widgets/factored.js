// factored.js — the `factored` widget (COMPOSED S8 #8b, S3 "Parts · factored").
//
// One text field with a live grey **"expands to: …"** line under it that turns **green** the moment what the
// student has typed expands to the item's trinomial. The line is computed by `preview(part, raw)` in
// js/grader/factored.js — the same parser and expander (js/grader/poly.js) that grades the submit — so the
// green line and the ✓ can never disagree.
//
// The preview answers exactly one question: *does this expand to the original?* It never judges FORM (a GCF
// left inside a factor, a factor that still factors, fractional coefficients) and it never says "wrong": a
// student is not told they have missed while they are still typing. Every verdict comes from grade().
//
//   mount(el, part, ctx) → handle          (the contract lives in js/widgets/base.js)
//   part  { type:'factored', id, var:'a', target:'-6a^2-25a-25' | [-6,-25,-25], label?, prompt?, answer? }
//         `answer` is never rendered — the solution is T09's reveal.
//   raw() → the typed string, e.g. '-(2a+5)(3a+5)', handed to grade(part, raw, ctx) as-is.
//
// Key row (S3 "Mobile input"): `( ) − ² <var>` — plus `/` when the target has fractional coefficients —
// inserted with setRangeText at the caret, never simulated key events. When the screen passes its dock's
// shared key row as `ctx.keys`, this widget feeds that one instead of drawing its own.

import { h, field, msgLine, keyRow, stateOf, flash, wire, handle as makeHandle, promptLine, plain } from './base.js';
import { preview, targetOf } from '../grader/factored.js';
import { formatPoly, polyIsInteger } from '../grader/poly.js';

/** the item's variable — the same rule js/grader/factored.js uses */
const varOf = (part) => String(part.var ?? (typeof part.id === 'string' && part.id.length === 1 ? part.id : 'x')).toLowerCase();

/** a parser message, capitalised for display ("use the variable a" → "Use the variable a") */
const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');

/** the result line draws its own ✓ / ✗, so a glyph inside the grader's message would double up */
const stripGlyph = (s) => String(s ?? '').replace(/^\s*[\u2713\u2717]\s*/, '').replace(/\s*[\u2713\u2717]\s*$/, '').trim();

/** the insert keys this item actually needs (fewer keys = every key keeps its 44 px target at 375 px) */
export function keysFor(part, v = varOf(part)) {
  const target = targetOf(part, v);
  // the square key is labelled `a²`, not a bare `²`: a lone superscript glyph is nearly invisible at 44 px
  const keys = ['(', ')', '-', { label: v, insert: v, aria: `letter ${v}` }, { label: `${v}²`, insert: '^2', aria: 'squared' }];
  if (target && !polyIsInteger(target)) keys.push('/');
  return keys;
}

/**
 * mount — see the header.
 * @param {HTMLElement} el   container to build into
 * @param {object} part
 * @param {object} [ctx]     { keys?, onInput?, onSubmit?, locked?, values?, autofocus? }
 * @returns {object} handle  { raw, setFeedback, lock, focus, destroy, isEmpty, pips, preview, target, … }
 */
export function mount(el, part = {}, ctx = {}) {
  const v = varOf(part);
  const target = targetOf(part, v);
  const targetText = target ? formatPoly(target, v) : '';
  const root = h('div.w.w-factored', { dataset: { type: 'factored', var: v } });

  let lastSubmit = 0;
  const fire = wire(root, ctx);
  const submit = () => {
    if (locked) return;
    const now = Date.now();
    if (now - lastSubmit < 200) return;             // S3: a double submit within 200 ms is ignored
    lastSubmit = now;
    fire.submit({ raw: api.raw(), part, type: 'factored', handle: api });
  };

  const f = field({
    key: part.id ?? 'factored',
    label: part.label ?? 'Factored form',
    aria: plain(part.label || part.prompt || `factored form in ${v}`),
    inputmode: 'text',                              // letters and brackets: the full keyboard, not the keypad
    enterkeyhint: 'go',
    placeholder: `( ${v} + _ )( ${v} + _ )`,
    value: ctx.values?.[part.id] ?? ctx.value ?? '',
    onInput: () => { update(); fire.input({ raw: api.raw(), part, type: 'factored', handle: api }); },
    onEnter: submit,
  });
  f.input.classList.add('mono');

  // --- the live preview line -------------------------------------------------
  const pvKey = h('span.w-preview-k', 'expands to ');   // the trailing space is for aria-describedby, which reads textContent
  const pvVal = h('span.w-preview-v.mono');
  const pvMark = h('span.w-preview-mark', { 'aria-hidden': 'true' });
  const pv = h('p.w-preview', { dataset: { state: 'idle' } }, pvKey, pvVal, pvMark);
  // A polite region that speaks only on the match / no-match transition: announcing every keystroke
  // would make the field unusable with a screen reader.
  const sr = h('span.w-preview-sr.sr-only', { role: 'status', 'aria-live': 'polite' });
  f.input.setAttribute('aria-describedby', (pv.id ||= `${f.input.id}-pv`));

  const msg = msgLine();

  // --- the key row -----------------------------------------------------------
  const keys = ctx.keys ?? (ctx.keyRow === false ? null : keyRow({ keys: keysFor(part, v), label: 'Math keys' }));
  const ownKeys = keys && !ctx.keys;
  keys?.watch?.(root);
  if (ctx.keys) ctx.keys.setKeys?.(keysFor(part, v));

  // Node.append() turns a null child into the text "null" — build the list and filter it.
  root.append(...[promptLine(part), f.wrap, ownKeys ? keys.el : null, pv, sr, msg.el].filter(Boolean));
  el.append(root);

  let locked = false;
  let matched = false;

  /** re-run the grader's own parser/expander and paint the preview line */
  function update(announce = true) {
    const text = f.value();
    const p = preview(part, text);
    let state;
    if (!text.trim()) {
      state = 'idle';
      pvKey.textContent = 'expands to ';
      pvVal.textContent = '· · ·';
      pvMark.textContent = '';
    } else if (!p.ok) {
      state = 'err';                                 // still typing, or a letter that is not the variable
      pvKey.textContent = '';
      pvVal.textContent = cap(p.msg || 'keep going…');
      pvMark.textContent = '';
    } else {
      state = p.match ? 'match' : 'ok';
      pvKey.textContent = 'expands to ';
      pvVal.textContent = p.text;
      pvMark.textContent = p.match ? '✓' : '';
    }
    pv.dataset.state = state;
    root.dataset.match = String(!!p.match);
    if (announce && !!p.match !== matched) {
      sr.textContent = p.match ? `expands to ${p.text}, matching the original` : '';
      if (p.match) flash(pv, 'ok');                  // one 180 ms pulse on the transition, nothing more
    }
    matched = !!p.match;
    return p;
  }

  const api = makeHandle({
    el: root, type: 'factored', part, field: f, keys: ownKeys ? keys : null, keysEl: ownKeys ? keys.el : null,
    raw: () => f.value(),
    setRaw(value) { f.set(value == null ? '' : value); update(false); return api; },
    clear() { f.clear(); msg.clear(); update(false); root.dataset.kind = ''; return api; },
    isEmpty: () => f.isBlank(),
    focus() { if (!locked) f.focus(); return api; },
    pips: () => ({ total: 1, filled: f.wrap.dataset.state === 'ok' ? 1 : 0 }),   // card r1: a pip fills on a CLEAR, not on "non-blank" (num.js pattern; S9 #5)
    /** what the answer has to expand to — for a screen that wants to echo it (never the answer itself) */
    target: targetText,
    /** the current preview: { ok, text, match, msg } */
    preview: () => preview(part, f.value()),
    /** 'idle' | 'ok' | 'match' | 'err' — the dev page and tests read this */
    previewState: () => pv.dataset.state,
    lock(on = true) {
      locked = !!on;
      f.lock(locked);
      root.dataset.locked = String(locked);
      if (ownKeys) for (const b of keys.el.querySelectorAll('button')) b.disabled = locked;
      return api;
    },
    setFeedback(res) {
      if (!res) { msg.clear(); f.setState('', ''); root.dataset.kind = ''; return api; }
      const state = stateOf(res);
      root.dataset.kind = res.kind || (res.ok ? 'correct' : 'wrong');
      f.setState(state, '');                         // the glyph sits in the field, the sentence below it
      // On a clear, the green preview line right above already shows the expansion, so the result line
      // says the thing the preview cannot: that the form is finished (no GCF, nothing still factorable).
      msg.set(state, res.kind === 'correct' ? 'Factored completely — nothing left to pull out.' : stripGlyph(res.msg));
      flash(f.wrap, state);
      if (state === 'ok') { pv.dataset.state = 'match'; pvMark.textContent = '✓'; pvVal.textContent = res.expansion || targetText; pvKey.textContent = 'expands to '; }
      return api;
    },
    destroy() {
      keys?.unwatch?.(root);
      if (ownKeys) keys.destroy();
      root.remove();
    },
  });

  update(false);
  if (ctx.locked) api.lock(true);
  if (ctx.autofocus) api.focus();
  return api;
}

export default mount;
