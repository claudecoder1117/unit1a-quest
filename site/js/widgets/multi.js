// multi.js — the `multi` widget (COMPOSED S3 "Parts · multi").
// Labelled fields in the teacher's order, each graded independently: correct fields lock, blank
// fields stay open (never an attempt), a wrong field carries its own one-line reason (the
// field-swap diagnosis included), and `res.fill` (one field holding two numbers) writes both
// boxes for free. Focusing a field with `wedge:"UL"` highlights that wedge in the SVG.
//
// mount(el, part, ctx) → handle       raw() → { [fieldKey]: text }

import { h, field, msgLine, keyRow, promptLine, plain, stateOf, flash, wire, handle, resultText, wedgeLink, keepVisible, KEYS } from './base.js';

export function mount(el, part = {}, ctx = {}) {
  const specs = Array.isArray(part.fields) ? part.fields : [];
  const root = h('div.w.w-multi', { dataset: { part: part.id || '', state: '' } });
  const fire = wire(root, ctx);
  const link = wedgeLink(ctx);

  const prompt = promptLine(part);
  if (prompt) root.append(prompt);
  if (part.orderFree) root.append(h('p.w-note', 'Either order — the boxes are graded as a set.'));

  const line = msgLine();
  const submit = () => fire.submit({ part });
  const onInput = () => { root.dataset.state = ''; line.clear(); fire.input({ part }); };

  const box = h('div.w-fields', { dataset: { cols: specs.length > 3 ? '2' : '1' } });
  const fields = specs.map((spec, i) =>
    field({
      key: spec.key,
      label: spec.label ?? spec.key,
      aria: plain(spec.label || spec.key),
      wedge: spec.wedge,
      size: specs.length > 3 ? 'sm' : 'md',
      value: ctx.values?.[spec.key] ?? '',
      enterkeyhint: i === specs.length - 1 ? 'done' : 'next',
      onInput,
      onEnter: () => {
        const next = fields.slice(i + 1).find((f) => f.enabled() && f.isBlank());
        if (next) next.focus(); else submit();
      },
      onFocus: (f) => { link.on(spec.wedge); keepVisible(f.wrap, { dock: ctx.dock }); },
    })
  );
  for (const f of fields) box.append(f.wrap);
  root.append(box, line.el);

  const keys = ctx.keys || keyRow({ keys: KEYS.num });
  keys.watch(root, KEYS.num);
  if (!ctx.keys) root.append(keys.el);
  el.append(root);

  const byKey = (k) => fields.find((f) => f.key === k);

  return handle({
    el: root, part, type: 'multi',
    raw: () => Object.fromEntries(fields.map((f) => [f.key, f.value()])),
    setFeedback(res) {
      if (!res) { line.clear(); root.dataset.state = ''; for (const f of fields) f.setState('', ''); return; }
      const state = stateOf(res);
      root.dataset.state = state;
      const rows = Array.isArray(res.fields) ? res.fields : [];
      const wrong = rows.filter((r) => r.state === 'wrong');
      const single = wrong.length === 1;

      // one field holding two numbers: fill both boxes, free, keep going (S3)
      if (res.fill && typeof res.fill === 'object') {
        for (const [k, v] of Object.entries(res.fill)) byKey(k)?.set(v).setState('', '');
        const open = fields.find((f) => f.enabled() && f.isBlank()) || fields.find((f) => f.enabled());
        open?.focus();
        line.set('almost', resultText(res, 'One number per field — filled both for you.'));
        flash(root, 'almost');
        return;
      }

      for (const f of fields) {
        const r = rows.find((x) => x.key === f.key);
        if (!r || r.state === 'blank' || r.state === 'open' || r.state === 'filled') { f.setState('', ''); continue; }
        if (r.state === 'ok') { f.setState('ok', '').freeze(); continue; }
        const st = r.state === 'wrong' ? 'bad' : 'almost';
        f.setState(st, single ? '' : r.msg || '');
        flash(f.wrap, st);
      }
      if (state === 'ok' || !wrong.length) flash(root, state);
      // Each reason is printed once: one wrong box → the line carries it; several → each box carries
      // its own and the line only says how many are open (the ✗ marks say which, not colour alone).
      if (wrong.length > 1) line.set('bad', `${wrong.length} boxes to fix — reasons below each.`);
      else line.set(state, resultText(res, state === 'ok' ? 'Correct' : ''));
    },
    lock(on = true) {
      for (const f of fields) f.lock(on);
      root.classList.toggle('is-locked', !!on);
      link.clear();
    },
    focus() {
      const next = fields.find((f) => f.enabled() && f.isBlank()) || fields.find((f) => f.enabled());
      next?.focus();
    },
    isEmpty: () => fields.every((f) => f.isBlank()),
    pips: () => ({ total: fields.length || 1, filled: fields.filter((f) => f.wrap.dataset.state === 'ok').length }),
    values: () => Object.fromEntries(fields.map((f) => [f.key, f.value()])),
    destroy() {
      link.clear();
      keys.unwatch(root);
      if (!ctx.keys) keys.destroy();
      root.remove();
    },
  });
}

export default mount;
