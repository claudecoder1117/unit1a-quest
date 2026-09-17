// num.js — the `num` widget (COMPOSED S3 "Parts · num", S5 "Mobile input").
// One 48 px field, inputmode="decimal", the `− / ( ) °` key row above the OS keyboard, and the
// optional bonus fields the teacher's key also lists (ang-09 / ang-11 complement + supplement).
//
// mount(el, part, ctx) → handle          (the contract lives in base.js)
//   raw() → 'string'                     // no bonus fields
//        → { value, [bonusKey]: text }   // with bonus fields (js/grader/num.js reads both)
//   setFeedback(res) uses res.main / res.bonus[] when the part has bonus fields, so a wrong
//   bonus tints only that box while the main answer still shows its ✓ (the grader keeps the
//   item `almost` = free).

import { h, field, msgLine, keyRow, promptLine, label, plain, stateOf, flash, wire, handle, resultText, wedgeLink, keepVisible, KEYS } from './base.js';

export function mount(el, part = {}, ctx = {}) {
  const root = h('div.w.w-num', { dataset: { part: part.id || '', state: '' } });
  const fire = wire(root, ctx);
  const link = wedgeLink(ctx);
  const prompt = promptLine(part);
  if (prompt) root.append(prompt);

  const submit = () => fire.submit({ part });
  const onInput = () => { root.dataset.state = ''; line.clear(); fire.input({ part }); };

  const main = field({
    key: 'value',
    label: part.label ?? part.fieldLabel ?? 'Answer',
    placeholder: part.placeholder || '',
    aria: plain(part.label || part.prompt || 'answer'),
    wedge: part.wedge,
    value: ctx.values?.value ?? ctx.value ?? '',
    onInput,
    onEnter: submit,
    onFocus: () => { link.on(part.wedge); keepVisible(main.wrap, { dock: ctx.dock }); },
  });
  root.append(main.wrap);

  const bonus = (Array.isArray(part.bonus) ? part.bonus : []).map((b) =>
    field({
      key: b.key,
      label: b.label ?? b.key,
      size: 'sm',
      value: ctx.values?.[b.key] ?? '',
      onInput,
      onEnter: submit,
      onFocus: () => { link.on(b.wedge); keepVisible(root, { dock: ctx.dock }); },
    })
  );
  if (bonus.length) {
    const box = h('div.w-bonus', h('p.w-bonus-head', 'Bonus — the key lists these too'));
    for (const f of bonus) box.append(f.wrap);
    root.append(box);
  }

  const line = msgLine();
  root.append(line.el);

  const keys = ctx.keys || keyRow({ keys: KEYS.num });
  keys.watch(root, KEYS.num);
  if (!ctx.keys) root.append(keys.el);

  el.append(root);
  const all = [main, ...bonus];

  return handle({
    el: root, part, type: 'num',
    raw() {
      if (!bonus.length) return main.value();
      const out = { value: main.value() };
      for (const f of bonus) out[f.key] = f.value();
      return out;
    },
    setFeedback(res) {
      if (!res) { line.clear(); root.dataset.state = ''; for (const f of all) f.setState('', ''); return; }
      const state = stateOf(res);
      root.dataset.state = state;
      const mainState = res.main ? (res.main.ok ? 'ok' : stateOf(res.main)) : state;
      main.setState(mainState, '');
      if (mainState === 'ok') main.freeze();
      flash(mainState === 'bad' ? main.wrap : root, mainState);
      for (const f of bonus) {
        const b = (res.bonus || []).find((x) => x.key === f.key);
        if (!b || b.state === 'blank') { f.setState('', ''); continue; }
        f.setState(b.state === 'ok' ? 'ok' : b.state === 'wrong' ? 'bad' : 'almost', '');
        if (b.state === 'ok') f.freeze();
        else flash(f.wrap, b.state === 'wrong' ? 'bad' : 'almost');
      }
      line.set(state, resultText(res, state === 'ok' ? 'Correct' : ''));
    },
    lock(on = true) {
      for (const f of all) f.lock(on);
      root.classList.toggle('is-locked', !!on);
      link.clear();
    },
    focus() {
      const next = all.find((f) => f.enabled() && f.isBlank()) || all.find((f) => f.enabled());
      next?.focus();
    },
    isEmpty: () => all.every((f) => f.isBlank()),
    pips: () => ({ total: 1, filled: main.wrap.dataset.state === 'ok' ? 1 : 0 }),
    values: () => Object.fromEntries(all.map((f) => [f.key, f.value()])),
    destroy() {
      link.clear();
      keys.unwatch(root);
      if (!ctx.keys) keys.destroy();
      root.remove();
    },
  });
}

export default mount;
