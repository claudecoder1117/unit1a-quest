// equation.js — the `equation` widget: the setup step on every word problem and figure-algebra card
// (COMPOSED S8 #8b, S3 "Parts · equation").
//
// SOURCE §3's "solve by setting up an algebraic equation (no guess and check)" is graded on the real test, so
// this slot exists on every `wp-*`, `ang-02..11` and `doc-06/07`. Three things make it more than a text box:
//
//   • **skip setup** — on a Card the slot is skippable (S3). The button says so plainly and says what it
//     costs: Gold on these cards needs the setup attempted at least once (`cards[id].setupTried`), so the
//     skipped state keeps a way back ("Write the setup"). raw() is `null` while skipped, which is what
//     combineCredit() drops. In a Boss or the Mock the slot is required and the button is not offered.
//   • **two-equation entry** — ang-02 and doc-07 are systems (`part.system`). doc-07 has no single-variable
//     canonical, so both boxes are shown from the start; ang-02 accepts either, so the second box is offered
//     by a "+ second equation" button and opens itself if the grader ever answers "needs two equations".
//     raw() joins the boxes with ", " — the shape js/grader/equation.js documents.
//   • **the Mock's 40 % split** — in Mock section D the setup is 2 of the item's 5 points (S3). The badge
//     shows the split before the submit and the result line shows what it earned after it.
//
// The live hint under the field is deliberately about FORM only (does it parse, is it one equation or two,
// does it still show the 180) — never about whether the equation is right. Correctness comes from grade().
//
//   mount(el, part, ctx) → handle          (the contract lives in js/widgets/base.js)
//   part  { type:'equation', id, var:'x', canonical, alternates?, mustMention?, system?, vars?, optional?,
//           label?, prompt? }
//   raw() → '180 - x - 8 = 7x' | 'x + y = 90, y = 2x' | null (skipped)
//   ctx   { mock?, boss?, points? (Mock item points, default 5), skip:false, keys?, values?, onSkip?, … }
//   handle adds: skipped, skip(on?), openSecond(), split()

import { h, label as mkLabel, field, msgLine, keyRow, stateOf, flash, wire, handle as makeHandle, plain } from './base.js';
import { parseEquation } from '../grader/equation.js';

const round1 = (n) => Math.round(n * 10) / 10;

/** the prompt above the boxes; a "(… skippable …)" aside is dropped because the button says it better */
export function promptOf(part, skippable) {
  const raw = String(part.prompt ?? part.label ?? 'Set up the equation');
  if (!skippable) return raw.replace(/\s*[—–-]?\s*\bskippable\b[^)]*/gi, '').replace(/\s*\(\s*\)/g, '').trim() || 'Set up the equation';
  return raw
    .replace(/\bskippable\b\s*[—–-]?\s*/gi, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s*[—–-]\s*\)/g, ')')
    .replace(/\s{2,}/g, ' ')
    .trim() || 'Set up the equation';
}

/** every string this item's answer could contain, for deciding which keys to offer */
function sourceText(part) {
  const alts = (part.alternates || []).map((a) => (typeof a === 'string' ? a : [a.canonical, a.text].filter(Boolean).join(' ')));
  return [part.canonical, part.text, ...(part.system || []), ...alts].filter(Boolean).join(' ');
}

/** the insert keys this item needs (S3's row, narrowed so every key keeps a 44 px target at 375 px) */
export function keysFor(part, v, w) {
  const src = sourceText(part);
  const canon = [part.canonical, ...(part.system || [])].filter(Boolean).join(' ');
  const keys = ['(', ')', '-', { label: '=', insert: ' = ', aria: 'equals' }, { label: v, insert: v, aria: `letter ${v}` }];
  if (w) keys.push({ label: w, insert: w, aria: `letter ${w}` });
  if (/\^2|²/.test(src)) keys.push({ label: `${v}²`, insert: '^2', aria: 'squared' });
  if (/\//.test(src)) keys.push('/');
  // `:` is only for the ratio setups S3 rewrites as a/b — offered when the ANSWER is a fraction
  // equation, not merely when some alternate happens to use a ½ (that would push the row to two lines).
  if (/\//.test(canon)) keys.push(':');
  return keys;
}

/** the result line draws its own ✓ / ✗, so a glyph inside the grader's message would double up */
const stripGlyph = (s) => String(s ?? '').replace(/^\s*[\u2713\u2717]\s*/, '').replace(/\s*[\u2713\u2717]\s*$/, '').trim();

/** "the 180 and the 90" */
const listOf = (nums) => nums.map((n) => `the ${n}`).join(' and ');

/** the numbers S3's structural guard wants to still see in the typed equation */
const mentions = (part) => (Array.isArray(part.mustMention) ? part.mustMention : part.mustMention == null ? [] : [part.mustMention]).map(Number).filter(Number.isFinite);

/**
 * mount — see the header.
 * @param {HTMLElement} el
 * @param {object} part
 * @param {object} [ctx]
 * @returns {object} handle
 */
export function mount(el, part = {}, ctx = {}) {
  const v = String(part.var ?? 'x').toLowerCase();
  const vars = Array.isArray(part.vars) && part.vars.length === 2 ? part.vars.map((s) => String(s).toLowerCase()) : null;
  const w = vars ? vars.find((x) => x !== v) ?? 'y' : 'y';
  const hasSystem = Array.isArray(part.system) && part.system.length === 2;
  const systemOnly = hasSystem && !part.canonical;              // doc-07: two equations, no single-variable form
  const skippable = ctx.skip !== false && !ctx.mock && !ctx.boss && part.optional !== false;
  const must = mentions(part);
  const points = Number.isFinite(Number(ctx.points)) ? Number(ctx.points) : 5;
  const slotPts = round1(points * 0.4);

  const root = h('div.w.w-equation', { dataset: { type: 'equation', system: String(hasSystem), skipped: 'false' } });
  const fire = wire(root, ctx);
  let lastSubmit = 0;
  const submit = () => {
    if (locked || skipped) return;
    const now = Date.now();
    if (now - lastSubmit < 200) return;                          // S3: double submit within 200 ms ignored
    lastSubmit = now;
    fire.submit({ raw: api.raw(), part, type: 'equation', handle: api });
  };
  const onEdit = () => { hint(); fire.input({ raw: api.raw(), part, type: 'equation', handle: api }); };

  // --- head: prompt + the Mock's 40 % badge ----------------------------------
  const prompt = h('p.w-prompt', mkLabel(promptOf(part, skippable)));
  const badge = ctx.mock
    ? h('span.w-badge.mono', { title: `In the Mock the setup is 40 % of this question (${slotPts} of ${points} points); the answer is the other 60 %.` },
      `40% · ${slotPts} of ${points} pts`)
    : null;
  const head = h('div.w-eq-head', prompt, badge);        // h() already skips a null child

  /** give a field the visible label base.js only builds at creation time */
  const labelField = (f, text) => {
    f.input.setAttribute('aria-label', text);
    if (f.wrap.querySelector('.w-flabel')) return;
    f.wrap.prepend(h('label.w-flabel', { for: f.input.id }, text));
  };

  // --- the boxes -------------------------------------------------------------
  const two = systemOnly;                                        // start with two boxes only when required
  const mkField = (n, labelText) => field({
    key: `eq${n}`,
    label: labelText,
    aria: labelText ? plain(labelText) : plain(promptOf(part, skippable)),
    inputmode: 'text',
    enterkeyhint: n === 1 && !two ? 'go' : 'next',
    placeholder: '… = …',
    onInput: onEdit,
    onEnter: () => (n === 1 && open2 ? f2.focus() : submit()),
  });
  let open2 = two;
  const f1 = mkField(1, two ? `Equation 1 (in ${v} and ${w})` : null);
  const f2 = mkField(2, `Equation 2 (in ${v} and ${w})`);
  f1.input.classList.add('mono');
  f2.input.classList.add('mono');
  f2.wrap.hidden = !open2;
  const fields = h('div.w-eq-fields', f1.wrap, f2.wrap);

  const addBtn = hasSystem && !systemOnly
    ? h('button.btn.btn-ghost.w-eq-add', { type: 'button', onclick: () => { api.openSecond(); f2.focus(); } }, '+ second equation')
    : null;

  // --- key row ---------------------------------------------------------------
  const keyList = keysFor(part, v, hasSystem ? w : null);
  const keys = ctx.keys ?? (ctx.keyRow === false ? null : keyRow({ keys: keyList, label: 'Math keys' }));
  const ownKeys = keys && !ctx.keys;
  keys?.watch?.(root);
  if (ctx.keys) ctx.keys.setKeys?.(keyList);

  // --- hint, actions, verdict ------------------------------------------------
  const hintEl = h('p.w-eq-hint', { dataset: { kind: '' } });
  const skipBtn = skippable
    ? h('button.btn.btn-ghost.w-eq-skip', { type: 'button', onclick: () => api.skip(!skipped) }, 'Skip setup')
    : null;
  const actions = (addBtn || skipBtn) ? h('div.w-eq-actions', addBtn, skipBtn) : null;
  const msg = msgLine();
  const split = h('p.w-eq-split', { hidden: true });

  // Node.append() turns a null child into the text "null" — build the list and filter it.
  root.append(...[head, fields, ownKeys ? keys.el : null, hintEl, actions, msg.el, split].filter(Boolean));
  el.append(root);

  let locked = false;
  let skipped = false;

  /** the live, form-only hint under the boxes — never a correctness signal */
  function hint() {
    if (skipped) {
      hintEl.dataset.kind = 'skipped';
      hintEl.textContent = 'Setup skipped. Gold on this card needs the setup attempted once — “Write the setup” brings it back.';
      return;
    }
    const t1 = f1.value().trim();
    const t2 = open2 ? f2.value().trim() : '';
    const shape = systemOnly || (open2 && hasSystem) ? `Two equations — one per box, in ${v} and ${w}.` : `One equation in ${v}.`;
    if (!t1 && !t2) {
      hintEl.dataset.kind = '';
      hintEl.textContent = shape + (must.length ? ` Keep ${listOf(must)} in it — write it before simplifying.` : '');
      return;
    }
    if (open2 && (!t1 || !t2)) {
      hintEl.dataset.kind = '';
      hintEl.textContent = systemOnly ? 'Both equations are needed — one per box.' : 'Fill both boxes, or clear the second one for a single equation.';
      return;
    }
    const p = parseEquation(api.raw(), { var: v });
    if (!p.ok) {
      hintEl.dataset.kind = 'err';
      hintEl.textContent = p.msg || 'Check the equation.';
      return;
    }
    // S3's structural guard, surfaced BEFORE the submit instead of after it: this says nothing about
    // whether the equation is right, only that a setup which has already been solved down (`x = 17`)
    // is not a setup. Once the numbers are there the reminder gets out of the way.
    const gone = must.filter((m) => !(p.numbers || []).some((n) => Math.abs(n - m) < 1e-9));
    if (gone.length) {
      hintEl.dataset.kind = 'note';
      hintEl.textContent = `Ready to check — but keep ${listOf(gone)} in it: write the equation before you simplify.`;
      return;
    }
    hintEl.dataset.kind = 'ready';
    hintEl.textContent = p.kind === 'system'
      ? `Ready to check — two equations in ${p.vars ? p.vars.join(' and ') : `${v} and ${w}`}.`
      : `Ready to check — one equation in ${v}.`;
  }

  const api = makeHandle({
    el: root, type: 'equation', part, fields: [f1, f2], keys: ownKeys ? keys : null, keysEl: ownKeys ? keys.el : null,
    raw() {
      if (skipped) return null;
      const parts = [f1.value().trim(), open2 ? f2.value().trim() : ''].filter(Boolean);
      return parts.length > 1 ? parts.join(', ') : (parts[0] ?? '');
    },
    setRaw(value) {
      const text = value == null ? '' : String(value);
      if (open2 || hasSystem) {
        const bits = text.split(/\s*(?:;|\n|,|\band\b)\s*/i).map((s) => s.trim()).filter(Boolean);
        if (bits.length > 1) { api.openSecond(); f1.set(bits[0]); f2.set(bits.slice(1).join(', ')); }
        else { f1.set(text); f2.set(''); }
      } else f1.set(text);
      hint();
      return api;
    },
    clear() { f1.clear(); f2.clear(); msg.clear(); split.hidden = true; root.dataset.kind = ''; hint(); return api; },
    isEmpty: () => skipped || (f1.isBlank() && (!open2 || f2.isBlank())),
    focus() { if (!locked && !skipped) (f1.isBlank() || !open2 ? f1 : f2).focus(); return api; },
    pips: () => ({ total: 1, filled: api.isEmpty() ? 0 : 1 }),
    /** open the second box (a system item, or a grader result that asked for two equations) */
    openSecond() {
      if (open2) return api;
      open2 = true;
      f2.wrap.hidden = false;
      labelField(f1, `Equation 1 (in ${v} and ${w})`);   // both boxes are labelled, or neither is
      if (addBtn) addBtn.hidden = true;
      root.dataset.system = 'true';
      hint();
      return api;
    },
    /** skip(true|false) — the S3 "skip setup" affordance; raw() is null while skipped */
    skip(on = true) {
      if (!skippable && on) return api;
      skipped = !!on;
      root.dataset.skipped = String(skipped);
      f1.lock(skipped);
      f2.lock(skipped);
      if (skipBtn) skipBtn.textContent = skipped ? 'Write the setup' : 'Skip setup';
      if (addBtn && !skipped && !open2) addBtn.hidden = false;
      else if (addBtn && skipped) addBtn.hidden = true;
      if (skipped) { msg.clear(); split.hidden = true; root.dataset.kind = ''; }
      hint();
      ctx.onSkip?.(api);
      root.dispatchEvent(new CustomEvent('w-skip', { bubbles: true, detail: { skipped, part, handle: api } }));
      fire.input({ raw: api.raw(), part, type: 'equation', handle: api, skipped });
      if (!skipped) api.focus();
      return api;
    },
    /** what this slot is worth and what it earned: { share, points, slotPts, earned } */
    split(res) {
      const share = res && typeof res.share === 'number' ? res.share : (ctx.mock ? 0.4 : 1);
      const sp = round1(points * share);
      return { share, points, slotPts: sp, earned: res ? round1(sp * (res.credit ?? 0)) : 0 };
    },
    lock(on = true) {
      locked = !!on;
      f1.lock(locked);
      f2.lock(locked);
      root.dataset.locked = String(locked);
      if (skipBtn) skipBtn.disabled = locked;
      if (addBtn) addBtn.disabled = locked;
      if (ownKeys) for (const b of keys.el.querySelectorAll('button')) b.disabled = locked;
      return api;
    },
    setFeedback(res) {
      if (!res) { msg.clear(); f1.setState('', ''); f2.setState('', ''); split.hidden = true; root.dataset.kind = ''; hint(); return api; }
      const state = stateOf(res);
      root.dataset.kind = res.kind || (res.ok ? 'correct' : 'wrong');
      const target = open2 && !f2.isBlank() ? null : f1;         // a system's verdict belongs to the pair
      (target ?? f1).setState(state, '');
      if (!target) f2.setState(state, '');
      msg.set(state, res.kind === 'correct' ? 'That’s the setup.' : stripGlyph(res.msg));
      flash(open2 ? fields : f1.wrap, state);
      // the grader asked for the second equation → open the box it wants filled
      if (res.err === 'two-vars' || (res.system && hasSystem) || /two equations/i.test(res.msg || '')) api.openSecond();
      // the live hint steps aside once there is a verdict; the next keystroke brings it back
      hintEl.dataset.kind = '';
      hintEl.textContent = '';
      if (ctx.mock) {
        const s = api.split(res);
        split.hidden = false;
        split.textContent = `Setup: ${s.earned} of ${s.slotPts} pts — 40 % of this question.`;
        split.dataset.state = state;
      }
      return api;
    },
    destroy() {
      keys?.unwatch?.(root);
      if (ownKeys) keys.destroy();
      root.remove();
    },
  });

  // `skipped` is live state, so it has to be a getter ON the handle (base.js's handle() spreads its
  // argument, and a spread would have frozen a getter defined in the literal above).
  Object.defineProperty(api, 'skipped', { get: () => skipped, enumerable: true });

  api.setRaw(ctx.values?.[part.id] ?? ctx.value ?? '');
  if (ctx.skipped) api.skip(true);
  if (ctx.locked) api.lock(true);
  if (ctx.autofocus) api.focus();
  return api;
}

export default mount;
