// term.js — "type the term" widget (COMPOSED S3 "term" / `type-term`, S8 #8d). voc-01..23, second part.
//
// One 48 px field. Recall is the point, so there is no option list and no datalist — a browser's own
// autofill dropdown would hand the answer over, which is why autocomplete/autocorrect/spellcheck are all
// off (base.js's field() sets them). js/grader/term.js forgives spelling (Damerau ≤ 1 for words of ≥ 6
// letters) and returns the canonical spelling as a note, shown next to the ✓ so the student sees how the
// word is written.
//
// A wrong answer does not reveal the term, so the field stays live for attempt 2 with the text selected.
// Enter submits. No single-key shortcut binds here: a text field owns its keys (S3 edge cases).
//
// mount(el, part, ctx) → handle;  raw() → string.

import { h, plain, field, msgLine, promptLine, stateOf, flash, wire, handle, keepVisible } from './base.js';

const cleanMsg = (res, fallback = '') => {
  const t = String(res?.msg ?? '').replace(/^\s*[✓✗!]\s*(—\s*)?/, '').trim();
  return t || fallback;
};

export function mount(el, part = {}, ctx = {}) {
  const root = h('div.w.w-term', { dataset: { part: part.id || '', state: '' } });
  const fire = wire(root, ctx);
  let locked = false;

  const prompt = promptLine(part);
  if (prompt) root.append(prompt);

  const box = field({
    key: 'term',
    label: part.label ?? '',
    inputmode: 'text',
    enterkeyhint: 'go',
    placeholder: part.placeholder || 'type the term',
    aria: plain(part.label || part.prompt || 'type the term'),
    value: ctx.values?.term ?? '',
    onInput: () => { root.dataset.state = ''; line.clear(); fire.input({ part }); },
    onEnter: () => { if (!box.isBlank()) fire.submit({ part }); },
    onFocus: () => keepVisible(box.wrap, { dock: ctx.dock }),
  });
  box.input.setAttribute('maxlength', '40');
  box.input.classList.add('w-term-input');
  root.append(box.wrap);

  const line = msgLine();
  root.append(line.el);

  function setFeedback(res) {
    if (!res) { line.clear(); root.dataset.state = ''; box.setState('', ''); return; }
    const state = stateOf(res);
    root.dataset.state = state;
    box.setState(state, '');
    // a correct-but-misspelt answer carries the canonical spelling as res.note
    const fallback = state === 'ok' ? 'Correct' : '';
    line.set(state, res.ok && res.note ? `Yes — spelling: ${res.answer}` : cleanMsg(res, fallback));
    if (res.kind === 'malformed') { box.focus(); return; }
    if (res.ok) { box.freeze(); flash(root, 'ok'); lock(true); return; }
    flash(box.wrap, 'bad');
    box.input.select();
    box.focus();
  }

  function lock(on = true) {
    locked = !!on;
    box.lock(locked);
    root.classList.toggle('is-locked', locked);
  }

  el.append(root);
  if (ctx.locked) lock(true);

  return handle({
    el: root, part, type: 'term',
    raw: () => box.value(),
    setFeedback, lock,
    focus: () => { if (!locked) box.focus(); },
    isEmpty: () => box.isBlank(),
    pips: () => ({ total: 1, filled: root.dataset.state === 'ok' ? 1 : 0 }),
    values: () => ({ term: box.value() }),
    destroy() { root.remove(); },
  });
}

export default mount;
