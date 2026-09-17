// notation.js — the notation BUILDER (COMPOSED S3 "notation", S8 #8d acceptance: not-04 answerable at
// phone width). not-01..09 and T-notation.
//
// Typing "ray FB" on a phone teaches nothing about notation and everything about keyboards, so the
// answer is BUILT: one row of decorations (↔ ‾ → none ∠ m∠ plane, plus ≅ / = when the item is a
// relation) and one row of letters tapped from the figure. The build is re-rendered live through
// mathfmt above the rows, which is the actual lesson — the student watches FB grow its arrow, and sees
// that ray FB and ray BF are different pictures (S3: "the built symbol is re-rendered so the student
// sees FC with its arrow").
//
// The object it produces is exactly what js/grader/notation.js compares: {kind, pts} for a single
// object, {kind:'cong'|'eq', sides:[a, b]} for a relation (tapping ≅ or = opens a second side).
//
// Letters come from part.letters (the labels of the card's figure), falling back to the answer's own
// letters so a generated item without a letter list still builds. ⌫ removes the last letter, then the
// decoration, then (on side 2) the relation. Keyboard: A–Z appends, Backspace deletes, Enter submits.
//
// mount(el, part, ctx) → handle;  raw() → {kind, pts} | {kind, sides:[…]} | null (nothing built yet).

import { h, label, msgLine, promptLine, stateOf, flash, wire, handle } from './base.js';
import { canon, toMarkup, describe } from '../grader/notation.js';
import { isTextField } from './shortcuts.js';

/** The decoration palette of S3, in teaching order. */
const DECOS = [
  { kind: 'line', glyph: '↔', name: 'line' },
  { kind: 'seg', glyph: '‾', name: 'segment' },
  { kind: 'ray', glyph: '→', name: 'ray' },
  { kind: 'len', glyph: 'AB', name: 'length' },
  { kind: 'ang', glyph: '∠', name: 'angle' },
  { kind: 'm', glyph: 'm∠', name: 'measure' },
  { kind: 'plane', glyph: '▱', name: 'plane' },
  { kind: 'cong', glyph: '≅', name: 'congruent' },
  { kind: 'eq', glyph: '=', name: 'equals' },
];
const RELS = new Set(['cong', 'eq']);
const ARITY = { line: 2, seg: 2, len: 2, ray: 2, ang: 3, m: 3, plane: 3 };
const BLANK = '?';   // a blank letter slot: visible at a glance, and it reads as "which letter?"

const cleanMsg = (res, fallback = '') => {
  const t = String(res?.msg ?? '').replace(/^\s*[✓✗!]\s*(—\s*)?/, '').trim();
  return t || fallback;
};

export function mount(el, part = {}, ctx = {}) {
  const root = h('div.w.w-nt', { dataset: { part: part.id || '', state: '' } });
  const fire = wire(root, ctx);
  const answer = canon(part.answer ?? part);
  const letters = lettersOf(part, answer);
  const allowRel = RELS.has(answer?.kind) || part.relations === true;
  const palette = DECOS.filter((d) => allowRel || !RELS.has(d.kind));

  let sides = [{ kind: null, pts: [] }];
  let rel = null;
  let active = 0;
  let locked = false;

  const prompt = promptLine(part);
  if (prompt) root.append(prompt);

  const preview = h('output.w-nt-preview', { tabindex: '0', 'aria-live': 'polite', 'aria-label': 'your answer: nothing built yet' });
  root.append(preview);

  const sideTabs = h('div.w-nt-sides', { hidden: true, role: 'tablist', 'aria-label': 'Which side to build' });
  root.append(sideTabs);

  const decoRow = h('div.w-nt-deco', { role: 'radiogroup', 'aria-label': 'Decoration' });
  const decoBtns = palette.map((d) => {
    const b = h('button.w-nt-deco-btn', {
      type: 'button', role: 'radio', 'aria-checked': 'false', dataset: { kind: d.kind },
      'aria-label': d.name, title: d.name,
      onclick: () => setKind(d.kind),
    }, h('span.w-nt-glyph', { 'aria-hidden': 'true' }, d.glyph), h('span.w-nt-deco-l', d.name));
    decoRow.append(b);
    return b;
  });
  root.append(decoRow);

  const letterRow = h('div.w-nt-letters', { role: 'group', 'aria-label': 'Letters from the figure' });
  const letterBtns = letters.map((L) => {
    const b = h('button.w-nt-letter', { type: 'button', dataset: { l: L }, onclick: () => addLetter(L) }, L);
    letterRow.append(b);
    return b;
  });
  const backBtn = h('button.w-nt-edit', { type: 'button', 'aria-label': 'delete the last letter', onclick: back }, '⌫');
  const clearBtn = h('button.w-nt-edit', { type: 'button', onclick: clear }, 'Clear');
  letterRow.append(backBtn, clearBtn);
  root.append(letterRow);

  const ruleLine = h('p.w-nt-rule', { hidden: true });
  root.append(ruleLine);

  const line = msgLine();
  root.append(line.el);

  // ---------------------------------------------------------------- state

  const side = () => sides[active];

  function setKind(kind) {
    if (locked) return;
    if (RELS.has(kind)) {
      if (rel !== kind) {
        rel = kind;
        if (sides.length === 1) sides.push({ kind: sides[0].kind, pts: [] });
        active = 1;
      }
    } else {
      side().kind = kind;
      const cap = ARITY[kind] ?? 3;
      if (side().pts.length > cap) side().pts = side().pts.slice(0, cap);
    }
    paint();
    fire.input({ part, built: raw() });
  }

  function addLetter(L) {
    if (locked) return;
    const s = side();
    const cap = ARITY[s.kind] ?? 3;
    if (s.pts.length >= cap) { flash(preview, 'almost'); return; }
    s.pts.push(L);
    paint();
    fire.input({ part, built: raw() });
  }

  function back() {
    if (locked) return;
    const s = side();
    if (s.pts.length) s.pts.pop();
    else if (rel && active === 1) { rel = null; sides = [sides[0]]; active = 0; }
    else s.kind = null;
    paint();
    fire.input({ part, built: raw() });
  }

  function clear() {
    if (locked) return;
    sides = [{ kind: null, pts: [] }];
    rel = null;
    active = 0;
    ruleLine.hidden = true;
    line.clear();
    root.dataset.state = '';
    preview.dataset.state = '';
    paint();
    fire.input({ part, built: null });
  }

  /** The object the grader compares (null while nothing complete is built). */
  function raw() {
    if (rel) {
      const built = sides.map((s) => (s.kind && s.pts.length ? { kind: s.kind, pts: s.pts.slice() } : null));
      if (built.some((b) => !b)) return null;
      return { kind: rel, sides: built };
    }
    const s = sides[0];
    if (!s.kind || !s.pts.length) return null;
    return { kind: s.kind, pts: s.pts.slice() };
  }

  // ---------------------------------------------------------------- rendering

  function markupOf(s) {
    const pts = s.pts.join('');
    if (!s.kind) return pts || BLANK.repeat(2);
    const cap = ARITY[s.kind] ?? 2;
    const shown = s.kind === 'plane' ? (pts || BLANK) : pts.padEnd(Math.max(pts.length, cap), BLANK);
    return `{${s.kind} ${shown}}`;
  }

  function paint() {
    const built = sides.map(markupOf);
    const markup = rel ? `${built[0]} ${rel === 'cong' ? '≅' : '='} ${built[1]}` : built[0];
    preview.replaceChildren(label(markup, 'w-nt-mk'));
    const obj = raw();
    preview.setAttribute('aria-label', obj ? `your answer: ${describe(obj)}` : 'your answer: not finished');
    preview.dataset.empty = String(!sides[0].kind && !sides[0].pts.length && !rel);

    for (const b of decoBtns) {
      const k = b.dataset.kind;
      const on = RELS.has(k) ? rel === k : side().kind === k;
      b.setAttribute('aria-checked', String(on));
      b.dataset.on = String(on);
      b.disabled = locked;
    }
    const cap = ARITY[side().kind] ?? 3;
    const full = side().pts.length >= cap;
    for (const b of letterBtns) b.disabled = locked || full;
    backBtn.disabled = locked || (!side().pts.length && !side().kind && !rel);
    clearBtn.disabled = locked;

    sideTabs.hidden = !rel;
    if (rel) {
      sideTabs.replaceChildren(...sides.map((s, i) => h('button.w-nt-side', {
        type: 'button', role: 'tab', 'aria-selected': String(i === active), dataset: { on: String(i === active) },
        disabled: locked, onclick: () => { active = i; paint(); },
      }, `side ${i + 1}`)));
    }
  }

  function setFeedback(res) {
    if (!res) { line.clear(); ruleLine.hidden = true; root.dataset.state = ''; preview.dataset.state = ''; return; }
    const state = stateOf(res);
    root.dataset.state = state;
    line.set(state, cleanMsg(res, state === 'ok' ? 'Correct' : ''));
    if (res.rule && state !== 'ok') { ruleLine.hidden = false; ruleLine.replaceChildren(label(res.rule)); }
    else ruleLine.hidden = true;
    if (res.kind === 'malformed') return;
    if (res.ok) { preview.dataset.state = 'ok'; flash(preview, 'ok'); lock(true); return; }
    preview.dataset.state = 'bad';
    flash(preview, 'bad');
  }

  function lock(on = true) {
    locked = !!on;
    root.classList.toggle('is-locked', locked);
    paint();
  }

  const onKey = (ev) => {
    if (locked || ev.altKey || ev.ctrlKey || ev.metaKey || isTextField(ev.target)) return;
    if (ev.key === 'Backspace') { ev.preventDefault(); back(); return; }
    if (ev.key === 'Enter') { const r = raw(); if (r) { ev.preventDefault(); fire.submit({ part, built: r }); } return; }
    const L = String(ev.key).toUpperCase();
    if (L.length === 1 && letters.includes(L)) { ev.preventDefault(); addLetter(L); }
  };
  root.addEventListener('keydown', onKey);

  const restore = canon(ctx.values?.built ?? ctx.values ?? null);
  if (restore) {
    if (restore.sides) { rel = restore.kind; sides = restore.sides.map((s) => ({ kind: s.kind, pts: s.pts.slice() })); active = 1; }
    else sides = [{ kind: restore.kind, pts: restore.pts.slice() }];
  }
  paint();
  el.append(root);
  if (ctx.locked) lock(true);

  return handle({
    el: root, part, type: 'notation',
    raw, setFeedback, lock,
    focus: () => { if (!locked) preview.focus({ preventScroll: true }); },
    isEmpty: () => raw() == null,
    pips: () => ({ total: 1, filled: root.dataset.state === 'ok' ? 1 : 0 }),
    values: () => ({ built: raw() }),
    destroy() { root.removeEventListener('keydown', onKey); root.remove(); },
    /** the mini-markup currently on screen (what T05's re-render contract asks the widget to show) */
    markup: () => { const b = raw(); return b ? toMarkup(b) : ''; },
  });
}

/** Letters offered by the builder: part.letters, else the answer's own letters, else A–F. */
function lettersOf(part, answer) {
  const split = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z]/g, '').split('');
  if (Array.isArray(part.letters) && part.letters.length) return [...new Set(part.letters.flatMap(split))];
  const pool = [];
  const walk = (o) => {
    if (!o) return;
    if (o.sides) o.sides.forEach(walk);
    else pool.push(...(o.pts ?? []));
  };
  walk(answer);
  const uniq = [...new Set(pool.map((p) => String(p).toUpperCase()))].sort();
  return uniq.length ? uniq : ['A', 'B', 'C', 'D', 'E', 'F'];
}

export default mount;
