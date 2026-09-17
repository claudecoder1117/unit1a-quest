// widgets/pairs.js — T08c. The `pairs` answer widget: figure wedges + a side list of every angle
// name + a typed-name field, all three feeding ONE pick stream. Two picks = one pair chip, validated
// instantly by js/grader/pairs.js (COMPOSED S3 "pairs", S5 "Figures" wedges + input↔wedge link,
// S8 #8c). Follows the T08a contract in base.js: mount(el, part, ctx) → handle.
//
// Three ways to answer, one state machine:
//   • tap a wedge in the figure          (pointer, and Enter/Space on the focused wedge button)
//   • tap a pill in the side list        (the fallback when the figure has no wedges or is unusable)
//   • type a name and press Enter        (∠GFC · angle GFC · <GFC · GFC — the S3 regex, via parseName)
// The first pick is "pending" (its wedge fills at 32 %, its pill reads aria-pressed); the second
// completes a pair, which is graded on the spot. Picking the pending angle again clears it.
//
// Rules the spec is explicit about, and where they live here:
//   • repeated pair is FREE — refused before it is committed ("already used, pick a different
//     pair"), so it never costs an attempt and never clutters the chips. gradePairs' own duplicate
//     branch still covers a replayed raw().
//   • malformed name is FREE — parseName's message goes under the field; nothing is committed.
//   • a straight angle is refused with its message (angles() never lists one, so only typing hits it).
//   • ∠XFY ≡ ∠YFX and pair order never matter (canonical names + an order-free pair key).
// Verdict colour on a wedge is a FLASH, not a sticky state: a wedge fill paints the whole sector
// (T04), so two or three sticky green sectors would bury the drawing. The lasting record is the
// chip list plus the green outline on each pill already used.
//
// raw() → [[angleName, angleName], …] — exactly what grader/pairs.js grades, so a screen can always
// re-grade with grade(part, handle.raw(), {figure: card.figure}).

import { renderModel, setWedgeState, clearWedgeStates, wedgeEl, WEDGE_SELECTOR } from '../figure/svg.js';
import { angles } from '../figure/model.js';
import { gradePairs, parseName, resolveModel } from '../grader/pairs.js';
import { h, label, plain, promptLine, msgLine, stateOf, flash, wire, handle, nextId } from './base.js';

// ------------------------------------------------------------------------------------------------
// DOM-free core (unit-tested in tests/widget-pairs.test.mjs)

/** Human words for a relation, for prompts and the progress line. */
export const RELATION_WORDS = Object.freeze({
  linearPair: 'linear',
  vertical: 'vertical',
  adjacent: 'adjacent',
  nonAdjacent: 'non-adjacent',
  supplementary: 'supplementary',
  complementary: 'complementary',
});

/** `pairs` of `supplementary` → "3 pairs of supplementary angles" (count 1 → "1 pair of …"). */
export function relationPhrase(relation, count = 1) {
  const w = RELATION_WORDS[relation] ?? String(relation ?? '');
  const n = Math.max(1, Number(count) || 1);
  return `${n} ${n === 1 ? 'pair' : 'pairs'} of ${w} angles`;
}

/** "2 of 3 pairs found" — the progress line under the chips. */
export function progressText(valid, count) {
  const n = Math.max(1, Number(count) || 1);
  return `${valid} of ${n} ${n === 1 ? 'pair' : 'pairs'} found`;
}

/**
 * Every angle of the figure as a side-list option, simple angles first (angles() sorts
 * level → start → span). `label` is what the pill shows, `aria` what a screen reader reads.
 * @param {object} model resolved figure model
 * @returns {{key:string,id:string,name:string,alias:string|null,label:string,aria:string,level:number}[]}
 */
export function angleOptions(model) {
  if (!model) return [];
  return angles(model).map((a) => ({
    key: a.key,
    id: a.id,
    name: a.name,
    alias: a.alias ?? null,
    label: a.alias ? a.label : `∠${a.name}`,
    aria: a.alias ? a.label : `angle ${a.name}`,
    level: a.level,
  }));
}

/** Order-free key for a pair of canonical angle names (the grader uses the same rule). */
export function pairKeyOf(a, b) {
  return [a, b].sort().join('|');
}

/** Fresh pick state. */
export function createPickState() {
  return { picks: [], pending: null };
}

/** Is this pair already committed (in either order)? */
export function hasPair(state, a, b) {
  const k = pairKeyOf(a, b);
  return (state?.picks ?? []).some((p) => pairKeyOf(p[0], p[1]) === k);
}

/**
 * Fold one pick (a canonical angle name) into the state. Pure: returns a NEW state plus the
 * `event` that describes what happened, which is all the DOM layer needs to react.
 * @returns {{picks:string[][], pending:string|null, event:'none'|'pending'|'cleared'|'pair'|'duplicate', pair:string[]|null}}
 */
export function applyPick(state, key) {
  const picks = (state?.picks ?? []).map((p) => p.slice());
  const pending = state?.pending ?? null;
  if (!key) return { picks, pending, event: 'none', pair: null };
  if (pending == null) return { picks, pending: key, event: 'pending', pair: null };
  if (pending === key) return { picks, pending: null, event: 'cleared', pair: null };
  const pair = [pending, key];
  if (hasPair({ picks }, pending, key)) return { picks, pending: null, event: 'duplicate', pair };
  picks.push(pair);
  return { picks, pending: null, event: 'pair', pair };
}

/** Undo: a pending first pick first, otherwise the newest committed pair. */
export function undoPick(state) {
  const picks = (state?.picks ?? []).map((p) => p.slice());
  if (state?.pending != null) return { picks, pending: null, event: 'cleared', pair: null };
  const pair = picks.pop() ?? null;
  return { picks, pending: null, event: pair ? 'removed' : 'none', pair };
}

const NAME_TOKEN = /^(?:∠|<|angle\s*)?[A-Za-z]{3}$/i;

/**
 * Split typed text into angle tokens: "∠GFC and ∠CFD", "GFC, CFD", "∠GFC + ∠CFD", "GFC CFD"
 * all give two tokens; "angle GFC" stays one (the whitespace split only fires when every chunk
 * looks like a name on its own).
 */
export function splitTyped(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return [];
  const parts = s.split(/\s*(?:,|;|&|\+|\band\b)\s*/i).map((t) => t.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) {
    const chunks = p.split(/\s+/);
    if (chunks.length > 1 && chunks.every((c) => NAME_TOKEN.test(c))) out.push(...chunks);
    else out.push(p);
  }
  return out;
}

/** parseName() with a widget-shaped answer: {ok, key, shown} | {ok:false, msg, tags}. */
export function resolvePick(model, ref) {
  const r = parseName(ref, model);
  return r.ok
    ? { ok: true, key: r.key, shown: r.shown, angle: r.angle }
    : { ok: false, key: null, shown: String(ref ?? ''), msg: r.msg, tags: r.tags ?? [], straight: !!r.straight };
}

const isNode = (v) => !!v && typeof v === 'object' && typeof v.nodeType === 'number';
const isSpec = (v) => !!v && typeof v === 'object' && !isNode(v)
  && (v.kind === 'fan' || v.kind === 'poly' || typeof v.id === 'string');

/**
 * The figure SPEC this part draws on, from wherever the screen put it. `ctx.figure` is an element
 * in base.js's vocabulary and a spec in the grader's, so both are handled by shape, never by name.
 */
export function figureSpecOf(part, ctx = {}) {
  for (const cand of [ctx.model, ctx.figureSpec, part?.figure, part?.model, ctx.figure, ctx.card?.figure]) {
    if (isSpec(cand)) return cand;
  }
  return null;
}

/** The live <svg> the screen already rendered, when it gave us one. */
function figureElOf(ctx = {}) {
  for (const cand of [ctx.figureEl, ctx.svg, ctx.figure]) if (isNode(cand)) return cand;
  return null;
}

// ------------------------------------------------------------------------------------------------
// DOM layer

// A wedge fill paints the WHOLE sector (T04), so a verdict colour is a flash, never sticky.
const FLASH_MS = 1000;
const CHIP_GLYPH = { ok: '✓', bad: '✗', almost: '↺' };

/**
 * Mount the pairs widget (the T08a contract: mount(el, part, ctx) → handle).
 * @param {HTMLElement} el   container to build into
 * @param {object} part      { type:'pairs', relation, count, prompt? }
 * @param {object} ctx       { card, figureEl|svg, figure|model (spec), values, locked, onInput, onSubmit }
 */
export function mount(el, part = {}, ctx = {}) {
  if (typeof document === 'undefined') throw new Error('widgets/pairs: mount() needs a DOM (the exported pure helpers run in Node)');
  if (!el) throw new Error('widgets/pairs: mount(el, part, ctx) needs a host element');

  const id = nextId('wpairs');
  const count = Math.max(1, Number(part?.count) || 1);
  const relation = String(part?.relation ?? '');
  const spec = figureSpecOf(part, ctx);
  const model = spec ? resolveModel(part, { model: spec }) : null;
  const root = h('div.w.w-pairs', { dataset: { part: part?.id || '', type: 'pairs', state: '', relation, count: String(count) } });
  el.append(root);

  if (!model) {
    // Defensive: a pairs part with no figure. Say so instead of throwing at a student.
    root.append(h('p.w-pairs-missing', 'This question needs its figure, and it did not load. Reload the page — your progress is saved.'));
    if (typeof console !== 'undefined') console.warn('widgets/pairs: no figure — pass ctx.model / ctx.figure ({id, rename, labels}) or part.figure');
    return handle({
      el: root, part, type: 'pairs',
      raw: () => [], values: () => [], result: () => null, isComplete: () => false,
      isEmpty: () => true, pips: () => ({ total: 1, filled: 0 }),
      destroy() { root.remove(); },
    });
  }

  const options = angleOptions(model);
  const fire = wire(root, ctx);
  const ac = new AbortController();
  const listen = { signal: ac.signal };
  let flashTimer = 0;

  // ---- prompt -----------------------------------------------------------------------------------
  const prompt = promptLine(part)
    ?? h('p.w-prompt', label(`Find ${relationPhrase(relation, count)} — tap two angles in the figure, pick from the list, or type a name like ∠${options[0]?.name ?? 'GFC'}.`));
  root.append(prompt);

  const cols = h('div.w-pairs-cols');
  root.append(cols);

  // ---- figure -----------------------------------------------------------------------------------
  // Either the screen's figure or our own; the widget owns wedge STATE either way.
  let svg = figureElOf(ctx);
  let ownsFigure = false;
  if (!svg) {
    const holder = h('div');
    holder.innerHTML = renderModel(model, { wedges: true });
    svg = holder.firstElementChild;
    if (svg) {
      cols.append(h('div.w-pairs-fig.paper', svg));
      root.classList.add('has-fig');
      ownsFigure = true;
    }
  }
  if (svg && !svg.querySelector?.(WEDGE_SELECTOR)) svg = null;   // drawn without wedges → list + typing
  root.classList.toggle('no-wedges', !svg);

  // ---- entry column -----------------------------------------------------------------------------
  const input = h('input.w-pairs-input.mono', {
    type: 'text', id: `${id}-in`, placeholder: `∠${options[0]?.name ?? 'GFC'}`,
    autocomplete: 'off', autocapitalize: 'characters', autocorrect: 'off', spellcheck: 'false',
    enterkeyhint: 'done', inputmode: 'text', 'aria-describedby': `${id}-hint`,
  });
  const addBtn = h('button.btn.w-pairs-add', { type: 'button' }, 'Add');
  const hint = h('p.w-pairs-hint', { id: `${id}-hint` }, 'Three letters, vertex in the middle.');
  const field = h('div.w-pairs-field',
    h('label.w-pairs-label', { for: `${id}-in` }, 'Type an angle'),
    h('div.w-pairs-row', input, addBtn),
    hint);

  const listLabel = h('p.w-pairs-listlabel', { id: `${id}-list` }, `Every angle in the figure (${options.length})`);
  const list = h('div.w-pairs-list', { role: 'group', 'aria-labelledby': `${id}-list` });
  const pillFor = new Map();
  for (const o of options) {
    const b = h('button.w-pairs-angle.mono', {
      type: 'button', dataset: { key: o.key, level: String(o.level) },
      'aria-pressed': 'false', 'aria-label': plain(o.aria),
    }, o.label);
    list.append(b);
    pillFor.set(o.key, b);
  }
  cols.append(h('div.w-pairs-side', field, h('div.w-pairs-listwrap', listLabel, list)));

  // ---- picks ------------------------------------------------------------------------------------
  const pendingLine = h('p.w-pairs-pending', { 'aria-live': 'polite' });
  pendingLine.hidden = true;
  const chips = h('ul.w-pairs-chips');
  const line = msgLine();
  const countLine = h('p.w-pairs-count.mono', progressText(0, count));
  const undoBtn = h('button.btn.btn-ghost.w-pairs-undo', { type: 'button' }, 'Undo');
  undoBtn.disabled = true;
  // the slot reserves the verdict line's height, so a message never pushes the figure (S5, zero CLS)
  root.append(h('div.w-pairs-picked', pendingLine, chips, h('div.w-pairs-msgslot', line.el), h('div.w-pairs-foot', countLine, undoBtn)));

  // ---- state ------------------------------------------------------------------------------------
  let state = createPickState();
  let last = null;                 // last gradePairs() result
  let linked = [];                 // angle keys filled at 18 % (input / pill / chip hover)
  let flashed = null;              // { keys:[a,b], state:'ok'|'bad' } — the verdict flash
  let locked = false;

  const nameOf = (key) => `∠${key}`;
  const same = (a, b) => a.length === b.length && a.every((k, i) => k === b[i]);

  function setLinked(keys) {
    const next = (Array.isArray(keys) ? keys : keys ? [keys] : []).filter(Boolean);
    if (same(next, linked)) return;
    linked = next;
    syncWedges();
  }

  function syncWedges() {
    if (svg) {
      clearWedgeStates(svg, ['selected', 'ok', 'bad', 'linked']);
      if (flashed) for (const k of flashed.keys) setWedgeState(svg, k, flashed.state);
      if (state.pending) setWedgeState(svg, state.pending, 'selected');
      for (const k of linked) setWedgeState(svg, k, 'linked');
    }
    // the pills carry the persistent memory, so the list alone is a complete answer path
    const used = new Set();
    for (const r of last?.results ?? []) if (r.ok) { used.add(r.a.key); used.add(r.b.key); }
    for (const [key, b] of pillFor) {
      b.setAttribute('aria-pressed', state.pending === key ? 'true' : 'false');
      b.classList.toggle('is-used', used.has(key));
      b.classList.toggle('is-linked', linked.includes(key));
    }
  }

  /** Flash the verdict colour on the two wedges just judged, then hand the figure back. */
  function flashPair(pair, ok) {
    if (!svg || !pair) return;
    clearTimeout(flashTimer);
    flashed = { keys: pair.slice(), state: ok ? 'ok' : 'bad' };
    syncWedges();
    flashTimer = setTimeout(() => { flashed = null; syncWedges(); }, FLASH_MS);
  }

  function renderChips() {
    chips.textContent = '';
    (last?.results ?? []).forEach((r, i) => {
      const pair = state.picks[i] ?? [];
      const st = stateOf(r);
      const chip = h('button.w-pairs-chip', {
        type: 'button', dataset: { i: String(i), state: st },
        'aria-label': `${r.ok ? 'correct' : r.kind} — ${r.pairName ?? ''}. ${plain(r.msg ?? '')}`,
      },
        h('span.w-pairs-chip-g', { 'aria-hidden': 'true' }, CHIP_GLYPH[st] ?? ''),
        h('span.w-pairs-chip-t.mono', r.pairName ?? `${nameOf(pair[0])} + ${nameOf(pair[1])}`));
      chips.append(h('li.w-pairs-chipwrap', chip));
    });
  }

  function regrade() {
    last = state.picks.length ? gradePairs(part, state.picks, model, ctx) : null;
    renderChips();
    syncWedges();
    countLine.textContent = progressText(last?.valid ?? 0, count);
    undoBtn.disabled = locked || (!state.picks.length && state.pending == null);
    root.classList.toggle('is-complete', !!last?.ok);
    root.dataset.state = last?.ok ? 'ok' : '';
  }

  function showPending() {
    pendingLine.hidden = state.pending == null;
    pendingLine.textContent = state.pending == null ? '' : `${nameOf(state.pending)} selected — now pick the angle it pairs with.`;
  }

  /** The one entry point every input path funnels into. */
  function pick(key) {
    if (locked || !key) return;
    const next = applyPick(state, key);
    state = { picks: next.picks, pending: next.pending };
    showPending();

    if (next.event === 'pending' || next.event === 'cleared') {
      syncWedges();
      line.clear();
      undoBtn.disabled = !state.picks.length && state.pending == null;
      fire.input({ part, picks: raw(), pending: state.pending });
      return;
    }
    if (next.event === 'duplicate') {
      syncWedges();
      const [a, b] = next.pair;
      line.set('almost', `${nameOf(a)} + ${nameOf(b)} — already used, pick a different pair. That one is free.`);
      const i = state.picks.findIndex((p) => pairKeyOf(p[0], p[1]) === pairKeyOf(a, b));
      flash(chips.querySelector(`.w-pairs-chip[data-i="${i}"]`), 'almost');
      return;
    }

    // a committed pair — graded on the spot
    regrade();
    const r = last?.results?.[last.results.length - 1];
    if (r) {
      const st = stateOf(r);
      line.set(st, last.ok ? `${r.msg} — ${progressText(last.valid, count)}.` : r.msg);
      flash(chips.querySelector(`.w-pairs-chip[data-i="${last.results.length - 1}"]`), st);
      flashPair(next.pair, r.ok);
    }
    fire.input({ part, picks: raw(), result: last });
    if (last?.ok) fire.submit({ part, picks: raw(), result: last });
  }

  function pickTyped(text) {
    if (locked) return;
    const tokens = splitTyped(text);
    if (!tokens.length) {
      hint.textContent = 'Type an angle name like ∠GFC, then press Enter.';
      hint.dataset.state = 'almost';
      return;
    }
    for (const t of tokens) {
      const r = resolvePick(model, t);
      if (!r.ok) {                                  // malformed is free: nothing is committed
        hint.textContent = r.msg;
        hint.dataset.state = 'almost';
        line.set('almost', r.msg);
        input.select();
        return;
      }
      pick(r.key);
    }
    input.value = '';
    hint.textContent = 'Three letters, vertex in the middle.';
    hint.dataset.state = '';
    setLinked(null);
  }

  // ---- events -----------------------------------------------------------------------------------
  const wedgeOf = (target) => (svg ? wedgeEl(svg, target) : null);
  if (svg) {
    svg.addEventListener('click', (e) => {
      const w = wedgeOf(e.target);
      if (!w) return;
      e.preventDefault();
      pick(w.dataset.name);
    }, listen);
    svg.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      const w = wedgeOf(e.target);
      if (!w) return;
      e.preventDefault();                           // Space must not scroll the page
      pick(w.dataset.name);
    }, listen);
    svg.addEventListener('focusin', (e) => {
      const w = wedgeOf(e.target);
      if (w) setLinked(w.dataset.name);
    }, listen);
    svg.addEventListener('focusout', (e) => {
      const w = wedgeOf(e.target);
      if (w && linked.includes(w.dataset.name)) setLinked(null);
    }, listen);
  }

  const pillOf = (target) => target?.closest?.('.w-pairs-angle') ?? null;
  list.addEventListener('click', (e) => { const b = pillOf(e.target); if (b) pick(b.dataset.key); }, listen);
  list.addEventListener('pointerover', (e) => { const b = pillOf(e.target); if (b) setLinked(b.dataset.key); }, listen);
  list.addEventListener('pointerout', (e) => { const b = pillOf(e.target); if (b && linked.includes(b.dataset.key)) setLinked(null); }, listen);
  list.addEventListener('focusin', (e) => { const b = pillOf(e.target); if (b) setLinked(b.dataset.key); }, listen);
  list.addEventListener('focusout', (e) => { const b = pillOf(e.target); if (b && linked.includes(b.dataset.key)) setLinked(null); }, listen);

  const chipOf = (target) => target?.closest?.('.w-pairs-chip') ?? null;
  const resultOf = (b) => (b ? last?.results?.[Number(b.dataset.i)] ?? null : null);
  chips.addEventListener('click', (e) => {
    const r = resultOf(chipOf(e.target));
    if (r) line.set(stateOf(r), r.msg);             // re-read the verdict for any pair
  }, listen);
  chips.addEventListener('pointerover', (e) => {
    const r = resultOf(chipOf(e.target));
    if (r?.a && r?.b) setLinked([r.a.key, r.b.key]);  // hovering a chip re-shows its two angles
  }, listen);
  chips.addEventListener('pointerout', (e) => { if (chipOf(e.target)) setLinked(null); }, listen);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); pickTyped(input.value); }
  }, listen);
  input.addEventListener('input', () => {
    hint.dataset.state = '';
    const tokens = splitTyped(input.value);
    const r = tokens.length ? resolvePick(model, tokens[tokens.length - 1]) : null;
    if (r?.ok) {
      hint.textContent = `${r.shown} — press Enter to pick it.`;
      setLinked(r.key);
    } else {
      hint.textContent = 'Three letters, vertex in the middle.';
      setLinked(null);
    }
  }, listen);
  input.addEventListener('blur', () => setLinked(null), listen);
  addBtn.addEventListener('click', () => { pickTyped(input.value); input.focus(); }, listen);
  undoBtn.addEventListener('click', () => api.undo(), listen);

  // ---- handle -----------------------------------------------------------------------------------
  function raw() { return state.picks.map((p) => p.slice()); }

  const api = handle({
    el: root, part, type: 'pairs',
    svg, model,
    raw,
    values: raw,
    result: () => last,
    isComplete: () => !!last?.ok,
    isEmpty: () => state.picks.length === 0 && state.pending == null,
    pips: () => ({ total: 1, filled: last?.ok ? 1 : 0 }),   // S1: a pairs part is one pip
    pick,
    setFeedback(res) {
      if (res == null) { line.clear(); root.dataset.state = last?.ok ? 'ok' : ''; return; }
      const st = stateOf(res);
      root.dataset.state = st;
      line.set(st, String(res.msg ?? ''));
      flash(root, st);
    },
    lock(on = true) {
      locked = !!on;
      root.classList.toggle('is-locked', locked);
      input.disabled = locked;
      addBtn.disabled = locked;
      undoBtn.disabled = locked || (!state.picks.length && state.pending == null);
      for (const b of pillFor.values()) b.disabled = locked;
      setLinked(null);
      if (svg) {
        svg.classList.toggle('fig-locked', locked);
        for (const b of svg.querySelectorAll('.fig-wedge-hit')) {
          b.setAttribute('tabindex', locked ? '-1' : '0');
          if (locked) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled');
        }
      }
    },
    focus() { if (!locked) input.focus({ preventScroll: true }); },
    clear() {
      state = createPickState();
      last = null;
      flashed = null;
      linked = [];
      clearTimeout(flashTimer);
      if (svg) clearWedgeStates(svg);
      input.value = '';
      hint.textContent = 'Three letters, vertex in the middle.';
      showPending();
      line.clear();
      regrade();
    },
    undo() {
      if (locked) return;
      const next = undoPick(state);
      state = { picks: next.picks, pending: next.pending };
      showPending();
      regrade();
      if (next.event === 'removed') line.set('', `${nameOf(next.pair[0])} + ${nameOf(next.pair[1])} removed.`);
      else line.clear();
      fire.input({ part, picks: raw(), pending: state.pending });
    },
    /** Replay a saved answer (store raw()): picks are re-graded, chips and pills catch up. */
    setValue(picks) {
      state = createPickState();
      for (const p of picks ?? []) {
        const a = resolvePick(model, Array.isArray(p) ? p[0] : p?.a);
        const b = resolvePick(model, Array.isArray(p) ? p[1] : p?.b);
        if (a.ok && b.ok && a.key !== b.key && !hasPair(state, a.key, b.key)) state.picks.push([a.key, b.key]);
      }
      regrade();
    },
    destroy() {
      ac.abort();
      clearTimeout(flashTimer);
      if (svg) {
        clearWedgeStates(svg);
        svg.classList.remove('fig-locked');
        for (const b of svg.querySelectorAll('.fig-wedge-hit')) { b.setAttribute('tabindex', '0'); b.removeAttribute('aria-disabled'); }
        if (ownsFigure) svg.remove();
      }
      root.remove();
      svg = null;
    },
  });

  // ---- first paint ------------------------------------------------------------------------------
  showPending();
  syncWedges();
  const restore = ctx.values ?? ctx.value;
  if (Array.isArray(restore) && restore.length) api.setValue(restore);
  if (ctx.locked) api.lock(true);
  return api;
}

export const mountPairs = mount;
export default mount;
