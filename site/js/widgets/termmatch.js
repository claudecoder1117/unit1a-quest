// termmatch.js — 6 ↔ 6 term/definition matching widget (COMPOSED S2 §0 "termmatch (6↔6)", S8 #8d).
//
// Tap a term, then tap its definition. No dragging: a 6 × 6 drag surface is unusable on a 375 px phone
// and impossible with a keyboard, while tap-to-pair is both (every cell is a real <button>, reachable by
// Tab, activated by Enter or Space). After each pairing the next unpaired term activates itself, so six
// matches are twelve taps with no aiming.
//
// Definition order comes from js/grader/termmatch.js `layout(part, seed)` — deterministic, never random,
// and never the identity permutation (that would hand out the answers). Pass the SAME ctx.seed when
// grading, because an index-form answer is resolved against that order.
//
// A definition can be spoken for only once: assigning one that is taken moves it (the previous term goes
// back to empty), which is what the gesture means. Tapping a paired term takes it apart again.
//
// mount(el, part, ctx) → handle;  raw() → { [termText]: definitionText }.

import { h, label, msgLine, promptLine, stateOf, flash, wire, handle } from './base.js';
import { layout as tmLayout } from '../grader/termmatch.js';

const cleanMsg = (res, fallback = '') => {
  const t = String(res?.msg ?? '').replace(/^\s*[✓✗!]\s*(—\s*)?/, '').trim();
  return t || fallback;
};

export function mount(el, part = {}, ctx = {}) {
  const root = h('div.w.w-tm', { dataset: { part: part.id || '', state: '' } });
  const fire = wire(root, ctx);
  const lay = tmLayout(part, ctx.seed);
  const pairs = new Map();      // term index → def index (indices into lay.terms / lay.defs)
  const solved = new Set();     // term indices graded correct — locked
  let active = null;
  let locked = false;

  const prompt = promptLine(part);
  if (prompt) root.append(prompt);

  const termRow = h('div.w-tm-terms', { role: 'listbox', 'aria-label': 'Terms' });
  const termBtns = lay.terms.map((t, i) => {
    const b = h('button.w-tm-term', {
      type: 'button', role: 'option', 'aria-selected': 'false', dataset: { i: String(i), state: '' },
      onclick: () => tapTerm(i),
    }, h('span.w-tm-term-t', t.text), h('span.w-tm-badge', { 'aria-hidden': 'true' }));
    termRow.append(b);
    return b;
  });
  root.append(termRow);

  const defList = h('div.w-tm-defs', { role: 'listbox', 'aria-label': 'Definitions' });
  const defBtns = lay.defs.map((d, j) => {
    const b = h('button.w-tm-def', {
      type: 'button', role: 'option', 'aria-selected': 'false', dataset: { j: String(j), state: '' },
      onclick: () => tapDef(j),
    }, h('span.w-tm-def-n', { 'aria-hidden': 'true' }, String(j + 1)), label(d.text, 'w-tm-def-t'));
    defList.append(b);
    return b;
  });
  root.append(defList);

  const line = msgLine();
  root.append(line.el);

  function tapTerm(i) {
    if (locked || solved.has(i)) return;
    if (pairs.has(i)) { unpair(i); return; }
    active = active === i ? null : i;
    paint();
  }

  function tapDef(j) {
    if (locked) return;
    const owner = [...pairs.entries()].find(([, dj]) => dj === j)?.[0];
    if (owner != null && solved.has(owner)) return;               // already locked in
    if (owner != null && active == null) { unpair(owner); return; }
    if (active == null) active = firstOpenTerm();
    if (active == null) return;
    if (owner != null) pairs.delete(owner);                        // one definition, one term
    pairs.set(active, j);
    active = firstOpenTerm();
    paint();
    fire.input({ part, pairs: raw() });
  }

  function unpair(i) {
    pairs.delete(i);
    active = i;
    paint();
    fire.input({ part, pairs: raw() });
  }

  function firstOpenTerm() {
    for (let i = 0; i < termBtns.length; i++) if (!pairs.has(i) && !solved.has(i)) return i;
    return null;
  }

  function paint() {
    const taken = new Map([...pairs.entries()].map(([i, j]) => [j, i]));
    termBtns.forEach((b, i) => {
      const j = pairs.get(i);
      b.dataset.paired = String(j != null);
      b.dataset.on = String(active === i);
      b.setAttribute('aria-selected', String(active === i));
      b.querySelector('.w-tm-badge').textContent = j == null ? '' : String(j + 1);
    });
    defBtns.forEach((b, j) => {
      const i = taken.get(j);
      b.dataset.paired = String(i != null);
      const term = i == null ? '' : lay.terms[i].text;
      b.dataset.term = term;
      b.setAttribute('aria-label', term ? `${term}: ${lay.defs[j].text}` : lay.defs[j].text);
    });
    root.dataset.left = String(termBtns.length - pairs.size - solved.size);
  }

  function raw() {
    const out = {};
    for (const [i, j] of pairs) out[lay.terms[i].text] = lay.defs[j].text;
    return out;
  }

  function setFeedback(res) {
    if (!res) {
      line.clear(); root.dataset.state = '';
      termBtns.forEach((b) => { b.dataset.state = ''; });
      defBtns.forEach((b) => { b.dataset.state = ''; });
      return;
    }
    const state = stateOf(res);
    root.dataset.state = state;
    line.set(state, cleanMsg(res, state === 'ok' ? 'All six matched' : ''));
    let anyWrong = false;
    for (const f of (res.fields ?? [])) {
      const i = lay.terms.findIndex((t) => t.text === f.term);
      if (i < 0) continue;
      const b = termBtns[i];
      const j = pairs.get(i);
      if (f.ok) {
        solved.add(i);
        b.dataset.state = 'ok';
        b.disabled = true;
        if (j != null) { defBtns[j].dataset.state = 'ok'; defBtns[j].disabled = true; }
      } else if (f.kind === 'wrong') {
        anyWrong = true;
        b.dataset.state = 'bad';
        if (j != null) defBtns[j].dataset.state = '';
        pairs.delete(i);                    // clear the miss for the retry; the right ones stay
      }
    }
    if (anyWrong) flash(root, 'bad');
    else if (res.ok) flash(root, 'ok');
    active = firstOpenTerm();
    paint();
    if (res.ok) lock(true);
  }

  function lock(on = true) {
    locked = !!on;
    termBtns.forEach((b, i) => { b.disabled = locked || solved.has(i); });
    defBtns.forEach((b) => { b.disabled = locked || b.dataset.state === 'ok'; });
    root.classList.toggle('is-locked', locked);
  }

  paint();
  el.append(root);
  if (ctx.locked) lock(true);

  return handle({
    el: root, part, type: 'termmatch',
    raw, setFeedback, lock,
    focus: () => { if (!locked) (termBtns.find((b) => !b.disabled) ?? termBtns[0])?.focus({ preventScroll: true }); },
    isEmpty: () => pairs.size === 0,
    pips: () => ({ total: 1, filled: root.dataset.state === 'ok' ? 1 : 0 }),
    values: () => raw(),
    destroy() { root.remove(); },
    /** {terms, defs} exactly as rendered — the order the grader must be told about */
    layout: () => lay,
    /** how many of the six are still unmatched */
    left: () => termBtns.length - pairs.size - solved.size,
  });
}

export default mount;
