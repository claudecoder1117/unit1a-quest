// mc.js — multiple-choice widget (COMPOSED S3 "mc", S8 #8d). voc-01..23's definition pick, qz-* and
// anything else authored as {answer, distractors}.
//
// Option order comes from js/grader/mc.js `options(part, seed)` — a deterministic permutation, never a
// random draw (S3 "Seeding": no global random source under site/js) — so the SAME ctx.seed must be
// passed when grading, or the grader would resolve an index against a different order.
//
// A wrong pick never names the answer (the grader's line names the confusable instead), so a miss does
// not end the item: the option that was picked is struck out and disabled and everything else stays
// live for attempt 2. A correct pick locks the row.
//
// Keys 1–5 pick an option (S5 AAA "keyboard-complete"); ignored while a text field is focused.
//
// mount(el, part, ctx) → handle;  raw() → {text, index} (js/grader/mc.js reads either field).

import { h, label, plain, msgLine, promptLine, stateOf, flash, wire, handle } from './base.js';
import { options as mcOptions } from '../grader/mc.js';
import { bindShortcuts, isShown } from './shortcuts.js';

const cleanMsg = (res, fallback = '') => {
  const t = String(res?.msg ?? '').replace(/^\s*[✓✗!]\s*(—\s*)?/, '').trim();
  return t || fallback;
};

export function mount(el, part = {}, ctx = {}) {
  const root = h('div.w.w-mc', { dataset: { part: part.id || '', state: '' } });
  const fire = wire(root, ctx);
  const opts = mcOptions(part, ctx.seed);
  let picked = null;
  let locked = false;
  const dead = new Set();

  const prompt = promptLine(part);
  if (prompt) root.append(prompt);

  const list = h('div.wd-opts', { role: 'radiogroup', 'aria-label': plain(part.prompt || 'Choose one') });
  const buttons = opts.map((o, i) => {
    const b = h('button.wd-opt', {
      type: 'button', role: 'radio', 'aria-checked': 'false', dataset: { i: String(i), state: '' },
      onclick: () => choose(i),
    },
      h('span.wd-opt-n', { 'aria-hidden': 'true' }, String(i + 1)),
      label(o.text, 'wd-opt-t'),
      h('span.wd-opt-mark', { 'aria-hidden': 'true' }),
    );
    list.append(b);
    return b;
  });
  root.append(list);

  const line = msgLine();
  root.append(line.el);

  function choose(i, submit = true) {
    if (locked || dead.has(i) || !buttons[i]) return;
    picked = i;
    buttons.forEach((b, k) => { b.setAttribute('aria-checked', String(k === i)); b.dataset.on = String(k === i); });
    if (!submit) return;                 // restoring a saved answer never re-submits it
    fire.input({ part, index: i });
    fire.submit({ part, index: i });
  }

  function raw() {
    return picked == null ? null : { text: opts[picked].text, index: picked };
  }

  function setFeedback(res) {
    if (!res) { line.clear(); root.dataset.state = ''; buttons.forEach((b) => { b.dataset.state = ''; }); return; }
    const state = stateOf(res);
    root.dataset.state = state;
    line.set(state, cleanMsg(res, state === 'ok' ? 'Correct' : ''));
    if (res.kind === 'malformed') return;
    if (res.ok) {
      buttons.forEach((b, i) => { b.dataset.state = i === picked ? 'ok' : ''; });
      flash(root, 'ok');
      lock(true);
      return;
    }
    if (picked != null) {
      dead.add(picked);
      const b = buttons[picked];
      b.dataset.state = 'bad';
      b.disabled = true;
      b.setAttribute('aria-checked', 'false');
      flash(b, 'bad');
      picked = null;
    } else flash(list, 'bad');
  }

  function lock(on = true) {
    locked = !!on;
    buttons.forEach((b, i) => { b.disabled = locked || dead.has(i); });
    root.classList.toggle('is-locked', locked);
  }

  const keys = {};
  for (let i = 0; i < Math.min(opts.length, 9); i++) keys[String(i + 1)] = () => choose(i);
  const unbind = ctx.shortcuts === false ? () => {} : bindShortcuts(keys, { active: () => !locked && isShown(root) });

  if (Number.isInteger(ctx.values?.index)) choose(ctx.values.index, false);
  el.append(root);
  if (ctx.locked) lock(true);

  return handle({
    el: root, part, type: 'mc',
    raw, setFeedback, lock,
    focus: () => { if (!locked) (buttons.find((b) => !b.disabled) ?? buttons[0])?.focus({ preventScroll: true }); },
    isEmpty: () => picked == null,
    pips: () => ({ total: 1, filled: root.dataset.state === 'ok' ? 1 : 0 }),
    values: () => ({ index: picked, text: picked == null ? '' : opts[picked].text }),
    destroy() { unbind(); root.remove(); },
    /** the option list as rendered, in display order — the array the grader indexes */
    options: () => opts.slice(),
  });
}

export default mount;
