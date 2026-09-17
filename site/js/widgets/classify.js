// classify.js — acute / right / obtuse / straight widget (COMPOSED S2 cls-01..04, S3 "classify", S8 #8d).
//
// Four buttons, each carrying its own rule as a caption ("less than 90°", "exactly 90°", …) so the
// boundary is read before the tap — cls-02 (exactly 90) and cls-04 (exactly 180) are the two items on
// the sheet that punish a careless one. A wrong pick gets the RULE of the bucket it picked
// (js/grader/classify.js) and never the answer, so the item stays live for attempt 2 with that bucket
// struck out.
//
// Keys: a / r / o / s and 1–4.
// The measure is NOT printed by default — the card's figure carries it. Pass part.showMeasure (or
// ctx.showMeasure) for a generated item that has no figure.
//
// mount(el, part, ctx) → handle;  raw() → 'acute' | 'right' | 'obtuse' | 'straight'.

import { h, msgLine, promptLine, stateOf, flash, wire, handle } from './base.js';
import { BUCKETS, RULES } from '../grader/classify.js';
import { bindShortcuts, isShown } from './shortcuts.js';

const cleanMsg = (res, fallback = '') => {
  const t = String(res?.msg ?? '').replace(/^\s*[✓✗!]\s*(—\s*)?/, '').trim();
  return t || fallback;
};

export function mount(el, part = {}, ctx = {}) {
  const root = h('div.w.w-cls', { dataset: { part: part.id || '', state: '' } });
  const fire = wire(root, ctx);
  const authored = (Array.isArray(part.options) ? part.options : []).map((b) => String(b).toLowerCase()).filter((b) => BUCKETS.includes(b));
  const list = authored.length ? authored : BUCKETS;
  let picked = null;
  let locked = false;
  const dead = new Set();

  const prompt = promptLine(part);
  if (prompt) root.append(prompt);

  if ((part.showMeasure ?? ctx.showMeasure ?? false) && part.measure != null) {
    root.append(h('p.w-cls-measure.num', `${part.measure}°`));
  }

  const row = h('div.w-cls-row', { role: 'radiogroup', 'aria-label': 'Classify the angle' });
  const buttons = list.map((b, i) => {
    const btn = h('button.w-cls-btn', {
      type: 'button', role: 'radio', 'aria-checked': 'false', dataset: { b, i: String(i), state: '' },
      onclick: () => choose(b),
    },
      h('span.w-cls-name', cap(b)),
      h('span.w-cls-rule', RULES[b] || ''),
      h('span.w-cls-mark', { 'aria-hidden': 'true' }),
    );
    row.append(btn);
    return btn;
  });
  root.append(row);

  const line = msgLine();
  root.append(line.el);

  function choose(b, submit = true) {
    if (locked || dead.has(b) || !list.includes(b)) return;
    picked = b;
    buttons.forEach((btn) => { btn.setAttribute('aria-checked', String(btn.dataset.b === b)); btn.dataset.on = String(btn.dataset.b === b); });
    if (!submit) return;                 // restoring a saved answer never re-submits it
    fire.input({ part, bucket: b });
    fire.submit({ part, bucket: b });
  }

  function raw() { return picked; }

  function setFeedback(res) {
    if (!res) { line.clear(); root.dataset.state = ''; buttons.forEach((b) => { b.dataset.state = ''; }); return; }
    const state = stateOf(res);
    root.dataset.state = state;
    line.set(state, cleanMsg(res, state === 'ok' ? 'Correct' : ''));
    if (res.kind === 'malformed') return;
    if (res.ok) {
      buttons.forEach((b) => { b.dataset.state = b.dataset.b === picked ? 'ok' : ''; });
      flash(root, 'ok');
      lock(true);
      return;
    }
    const b = buttons.find((x) => x.dataset.b === picked);
    if (b) {
      dead.add(picked);
      b.dataset.state = 'bad';
      b.disabled = true;
      b.setAttribute('aria-checked', 'false');
      flash(b, 'bad');
    }
    picked = null;
  }

  function lock(on = true) {
    locked = !!on;
    buttons.forEach((b) => { b.disabled = locked || dead.has(b.dataset.b); });
    root.classList.toggle('is-locked', locked);
  }

  const keys = {};
  list.forEach((b, i) => { keys[b[0]] = () => choose(b); keys[String(i + 1)] = () => choose(b); });
  const unbind = ctx.shortcuts === false ? () => {} : bindShortcuts(keys, { active: () => !locked && isShown(root) });

  if (ctx.values?.bucket) choose(String(ctx.values.bucket).toLowerCase(), false);
  el.append(root);
  if (ctx.locked) lock(true);

  return handle({
    el: root, part, type: 'classify',
    raw, setFeedback, lock,
    focus: () => { if (!locked) (buttons.find((b) => !b.disabled) ?? buttons[0])?.focus({ preventScroll: true }); },
    isEmpty: () => picked == null,
    pips: () => ({ total: 1, filled: root.dataset.state === 'ok' ? 1 : 0 }),
    values: () => ({ bucket: picked }),
    destroy() { unbind(); root.remove(); },
  });
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

export default mount;
