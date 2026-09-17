// ratio.js — the `ratio` widget (COMPOSED S3 "Parts · ratio").
// One field plus the `: / −` key row, because neither the iOS decimal keypad nor most Android
// keypads offer a colon. An unreduced ratio still grades correct with a nudge ("simplest form
// is 3:2"), so the nudge renders on an ok state — amber text, green mark.
//
// mount(el, part, ctx) → handle       raw() → 'a:b' (the grader also takes a/b and "a to b")

import { h, field, msgLine, keyRow, promptLine, plain, stateOf, flash, wire, handle, resultText, keepVisible, KEYS } from './base.js';

export function mount(el, part = {}, ctx = {}) {
  const root = h('div.w.w-ratio', { dataset: { part: part.id || '', state: '' } });
  const fire = wire(root, ctx);
  const prompt = promptLine(part);
  if (prompt) root.append(prompt);

  const line = msgLine();
  const submit = () => fire.submit({ part });
  const box = field({
    key: 'value',
    label: part.label ?? 'Ratio',
    placeholder: part.placeholder || '3:2',
    aria: plain(part.label || part.prompt || 'ratio'),
    value: ctx.values?.value ?? ctx.value ?? '',
    onInput: () => { root.dataset.state = ''; line.clear(); fire.input({ part }); },
    onEnter: submit,
    onFocus: (f) => keepVisible(f.wrap, { dock: ctx.dock }),
  });
  root.append(box.wrap, line.el);

  const keys = ctx.keys || keyRow({ keys: KEYS.ratio });
  keys.watch(root, KEYS.ratio);
  if (!ctx.keys) root.append(keys.el);
  el.append(root);

  return handle({
    el: root, part, type: 'ratio',
    raw: () => box.value(),
    setFeedback(res) {
      if (!res) { line.clear(); root.dataset.state = ''; box.setState('', ''); return; }
      const state = stateOf(res);
      root.dataset.state = state;
      root.classList.toggle('is-nudge', !!res.nudge);
      box.setState(state, '');
      if (state === 'ok') box.freeze();
      flash(state === 'bad' ? box.wrap : root, state);
      line.set(state, resultText(res, state === 'ok' ? 'Correct' : ''));
    },
    lock(on = true) { box.lock(on); root.classList.toggle('is-locked', !!on); },
    focus() { box.focus(); },
    isEmpty: () => box.isBlank(),
    pips: () => ({ total: 1, filled: box.wrap.dataset.state === 'ok' ? 1 : 0 }),
    values: () => ({ value: box.value() }),
    destroy() {
      keys.unwatch(root);
      if (!ctx.keys) keys.destroy();
      root.remove();
    },
  });
}

export default mount;
