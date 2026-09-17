// cloze.js — fill-in-the-blank widget (COMPOSED S2 def-01..14 "cloze with chip rows", S3 Boss/Mock
// "fill-justify", S8 #8d).
//
// The sentence renders as itself, with the blanks inline where they belong — reading "Point: a ▁▁▁, no
// ▁▁▁." with the words in place is the whole exercise; a numbered list of fields under a sentence is a
// different, worse one. Blanks that carry options (def-01..14 all do, and so do the inline
// [does/does not] choices of the Boss tier) are filled from a chip row for the ACTIVE blank only: one
// row of four chips stays legible at 375 px where three rows at once do not. Blanks without options are
// typed, with base.js's key row when the screen shares one.
//
// Segments and choices come from js/grader/cloze.js (parseCloze / choicesFor), so widget and grader can
// never disagree about how many blanks a sentence has.
//
// Correct blanks lock (S3). A wrong blank keeps what was chosen — the grader's line quotes it — and can
// be changed for the next attempt. An empty blank is free, so a half-filled cloze costs nothing.
//
// mount(el, part, ctx) → handle;  raw() → [value per blank, in text order].

import { h, label, plain, msgLine, promptLine, stateOf, flash, wire, handle, keepVisible, keyRow, KEYS } from './base.js';
import { parseCloze, choicesFor } from '../grader/cloze.js';

const cleanMsg = (res, fallback = '') => {
  const t = String(res?.msg ?? '').replace(/^\s*[✓✗!]\s*(—\s*)?/, '').trim();
  return t || fallback;
};

export function mount(el, part = {}, ctx = {}) {
  const root = h('div.w.w-cz', { dataset: { part: part.id || '', state: '' } });
  const fire = wire(root, ctx);
  const segs = parseCloze(part.text);
  const nBlanks = segs.filter((s) => s.type === 'blank').length;
  const values = new Array(nBlanks).fill('');
  const done = new Set();
  const cells = [];
  let active = null;
  let locked = false;
  let needsKeys = false;

  const prompt = promptLine(part);
  if (prompt) root.append(prompt);

  const sentence = h('p.w-cz-text');
  for (const seg of segs) {
    if (seg.type === 'text') { sentence.append(label(seg.text, 'w-cz-run')); continue; }
    const i = seg.i;
    const blank = part.blanks?.[i] ?? {};
    const choices = choicesFor(part, i);
    if (choices && choices.length) {
      const slot = h('button.w-cz-slot', {
        type: 'button', dataset: { i: String(i), state: '' }, 'aria-label': `Blank ${i + 1} of ${nBlanks}`,
        onclick: () => setActive(i),
      }, h('span.w-cz-slot-t', '  '));
      sentence.append(slot);
      cells.push({ i, slot, choices, input: null });
    } else {
      const numeric = isNumeric(blank);
      if (numeric) needsKeys = true;
      const input = h('input.w-cz-in', {
        type: 'text', inputmode: numeric ? 'decimal' : 'text',
        autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false',
        enterkeyhint: 'go', size: String(sizeFor(blank)),
        dataset: { i: String(i), state: '' },
        'aria-label': `Blank ${i + 1} of ${nBlanks}`,
        oninput: () => { values[i] = input.value; clearState(i); fire.input({ part, blank: i }); },
        onfocus: () => { setActive(i); keepVisible(sentence, { dock: ctx.dock }); },
        onkeydown: (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); fire.submit({ part }); } },
      });
      sentence.append(input);
      cells.push({ i, slot: input, choices: null, input });
    }
  }
  root.append(sentence);

  const picker = h('div.w-cz-picker', { hidden: true });
  const pickerHead = h('p.wd-sub');
  const pickerRow = h('div.wd-chiprow', { role: 'radiogroup' });
  picker.append(pickerHead, pickerRow);
  root.append(picker);

  const line = msgLine();
  root.append(line.el);

  const keys = needsKeys ? (ctx.keys || keyRow({ keys: KEYS.num })) : null;
  if (keys) { keys.watch(root, KEYS.num); if (!ctx.keys) root.append(keys.el); }

  function cell(i) { return cells.find((c) => c.i === i); }

  function setActive(i) {
    if (locked || done.has(i)) return;
    active = i;
    for (const c of cells) c.slot.dataset.on = String(c.i === i);
    const c = cell(i);
    if (!c || !c.choices) { picker.hidden = true; return; }
    pickerHead.textContent = nBlanks > 1 ? `Blank ${i + 1} of ${nBlanks}` : 'Choose';
    pickerRow.textContent = '';
    for (const text of c.choices) {
      const b = h('button.wd-chip', {
        type: 'button', role: 'radio', 'aria-checked': String(values[i] === text), dataset: { text, state: '' },
        onclick: () => choose(i, text),
      }, label(text, 'wd-chip-t'));
      pickerRow.append(b);
    }
    picker.hidden = false;
  }

  function choose(i, text) {
    if (locked || done.has(i)) return;
    values[i] = text;
    const c = cell(i);
    c.slot.querySelector('.w-cz-slot-t').replaceChildren(label(text));
    c.slot.dataset.filled = 'true';
    c.slot.setAttribute('aria-label', `Blank ${i + 1} of ${nBlanks}: ${plain(text)}`);
    clearState(i);
    fire.input({ part, blank: i });
    const next = cells.find((x) => x.i !== i && !done.has(x.i) && !values[x.i]);
    setActive(next ? next.i : i);
  }

  function clearState(i) {
    const c = cell(i);
    if (c) c.slot.dataset.state = '';
    root.dataset.state = '';
    line.clear();
  }

  function raw() { return values.slice(); }

  function setFeedback(res) {
    if (!res) {
      line.clear(); root.dataset.state = '';
      for (const c of cells) c.slot.dataset.state = '';
      return;
    }
    const state = stateOf(res);
    root.dataset.state = state;
    line.set(state, cleanMsg(res, state === 'ok' ? 'Correct' : ''));
    let anyWrong = false;
    for (const f of (res.fields ?? [])) {
      const c = cell(f.i);
      if (!c) continue;
      if (f.ok) {
        done.add(f.i);
        c.slot.dataset.state = 'ok';
        if (c.input) c.input.readOnly = true; else c.slot.disabled = true;
      } else if (f.kind === 'wrong') {
        anyWrong = true;
        c.slot.dataset.state = 'bad';
      }
    }
    if (anyWrong) flash(sentence, 'bad');
    else if (res.ok) flash(root, 'ok');
    if (res.ok) { lock(true); return; }
    const open = cells.find((c) => !done.has(c.i));
    if (open) setActive(open.i);
  }

  function lock(on = true) {
    locked = !!on;
    for (const c of cells) {
      if (c.input) { c.input.readOnly = locked || done.has(c.i); c.input.setAttribute('aria-readonly', String(c.input.readOnly)); }
      else c.slot.disabled = locked || done.has(c.i);
    }
    for (const b of pickerRow.children) b.disabled = locked;
    if (locked) picker.hidden = true;
    root.classList.toggle('is-locked', locked);
  }

  const restore = Array.isArray(ctx.values) ? ctx.values : null;
  if (restore) {
    restore.forEach((v, i) => {
      if (v == null || v === '') return;
      const c = cell(i);
      if (!c) return;
      if (c.input) { c.input.value = String(v); values[i] = String(v); }
      else choose(i, String(v));
    });
  }
  if (cells.length) setActive(cells[0].i);
  el.append(root);
  if (ctx.locked) lock(true);

  return handle({
    el: root, part, type: 'cloze',
    raw, setFeedback, lock,
    focus: () => {
      if (locked) return;
      const c = cells.find((x) => !done.has(x.i)) ?? cells[0];
      (c?.input ?? c?.slot)?.focus({ preventScroll: true });
    },
    isEmpty: () => values.every((v) => !String(v).trim()),
    pips: () => ({ total: 1, filled: root.dataset.state === 'ok' ? 1 : 0 }),
    values: () => raw(),
    destroy() { if (keys) { keys.unwatch(root); if (!ctx.keys) keys.destroy(); } root.remove(); },
    /** how many blanks the sentence has (T09 progress copy) */
    blanks: () => nBlanks,
  });
}

function firstAnswer(blank) {
  return String(blank.answer ?? (Array.isArray(blank.answers) ? blank.answers[0] : '') ?? '');
}
function isNumeric(blank) {
  if (blank.numeric === true) return true;
  if (blank.numeric === false) return false;
  const a = firstAnswer(blank);
  return a !== '' && /^[-+]?[\d.]/.test(a);
}
function sizeFor(blank) {
  return Math.max(4, Math.min(16, firstAnswer(blank).length + 2));
}

export default mount;
