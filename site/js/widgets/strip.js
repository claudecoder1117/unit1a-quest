// strip.js — the Proof Strip widget: "explain without NLP" (COMPOSED S3 "strip", S8 #8d acceptance:
// doc-05 answerable at phone width). doc-05 and ang-05.
//
// The strip is a numbered ladder of slots — pick the equation → find x → the two halves → YES/NO → the
// reason chips — and it grades LEFT TO RIGHT: one slot open at a time, the ones above it settled, the
// ones below visible but locked, so the student always sees the shape of the whole explanation without
// being able to jump to the verdict. A wrong slot reveals its answer (it cannot be retried) and unlocks
// the next one; that is what makes the strip an explanation rather than a quiz. When every slot is
// settled the strip renders itself as the copyable prose sentence of S3.
//
// js/grader/strip.js owns every one of those rules. This widget submits the WHOLE {slotId: value} object
// on each check and renders `result.slots[].state` — it never decides for itself which slot is next.
//
// Auto-advance: a `pick` or `verdict` tap submits immediately (one tap, like turning a page). `num`,
// `multi` and `chips` need a deliberate check, so the open slot carries a Check button; Enter in a field
// does the same. The card's dock Submit grades handle.raw() at any time and is always equivalent.
//
// mount(el, part, ctx) → handle;  raw() → { [slotId]: value }
//   values: pick/verdict → option text · num → string · multi → {fieldKey: string} · chips → [text, …]

import { h, label, plain, field, msgLine, promptLine, stateOf, flash, wire, handle, keyRow, keepVisible, KEYS } from './base.js';

const cleanMsg = (res, fallback = '') => {
  const t = String(res?.msg ?? '').replace(/^\s*[✓✗!]\s*(—\s*)?/, '').trim();
  return t || fallback;
};

export function mount(el, part = {}, ctx = {}) {
  const root = h('div.w.w-strip', { dataset: { part: part.id || '', state: '' } });
  const fire = wire(root, ctx);
  const slots = Array.isArray(part.slots) ? part.slots : [];
  const values = Object.create(null);
  const rows = new Map();
  let locked = false;
  let complete = false;
  let okCount = 0;
  let needsKeys = false;

  const prompt = promptLine(part);
  if (prompt) root.append(prompt);

  const list = h('ol.w-strip-list');
  slots.forEach((slot, i) => list.append(buildRow(slot, i)));
  root.append(list);

  const line = msgLine();
  root.append(line.el);

  const proseBox = h('div.w-strip-prose', { hidden: true });
  root.append(proseBox);

  const keys = needsKeys ? (ctx.keys || keyRow({ keys: KEYS.num })) : null;
  if (keys) { keys.watch(root, KEYS.num); if (!ctx.keys) root.append(keys.el); }

  // ---------------------------------------------------------------- rows

  function buildRow(slot, i) {
    const li = h('li.w-strip-slot', { dataset: { state: i === 0 ? 'pending' : 'locked', type: slot.type, id: slot.id } });
    const head = h('div.w-strip-head',
      h('span.w-strip-n', { 'aria-hidden': 'true' }, String(i + 1)),
      label(slot.label ?? slot.id, 'w-strip-label'),
      h('span.w-strip-mark', { 'aria-hidden': 'true' }),
    );
    const body = h('div.w-strip-body');
    const msg = h('p.w-strip-msg', { hidden: true });
    li.append(head, body, msg);
    const entry = { slot, li, body, msg, controls: null };
    rows.set(slot.id, entry);
    entry.controls = controlsFor(slot, entry);
    body.append(entry.controls.node);
    entry.controls.lock(i !== 0);
    return li;
  }

  const stateOfSlot = (id) => rows.get(id)?.li.dataset.state;
  const isOpen = (id) => stateOfSlot(id) === 'pending';

  function commit(id, value, submit) {
    if (locked || !isOpen(id)) return;
    values[id] = value;
    fire.input({ part, slot: id });
    if (submit) fire.submit({ part, slot: id });
  }

  function check(id) {
    if (locked || !isOpen(id)) return;
    fire.submit({ part, slot: id });
  }

  function checkBtn(id, text = 'Check') {
    return h('button.btn.w-strip-check', { type: 'button', onclick: () => check(id) }, text);
  }

  // ---------------------------------------------------------------- one control set per slot type

  function controlsFor(slot, entry) {
    switch (slot.type) {
      case 'pick': return pickControls(slot, false);
      case 'verdict': return pickControls(slot, true);
      case 'num': return numControls(slot);
      case 'multi': return multiControls(slot);
      case 'chips': return chipControls(slot);
      default: return { node: h('p.muted', `Unsupported slot type “${slot.type}”.`), lock() {}, mark() {}, focus() {}, clear() {} };
    }
  }

  function pickControls(slot, isVerdict) {
    const opts = (slot.options ?? (isVerdict ? ['YES', 'NO'] : [])).map((o) => (typeof o === 'string' ? { text: o } : { ...o, text: String(o.text ?? '') }));
    const wrap = h(isVerdict ? 'div.w-strip-verdicts' : 'div.wd-opts', { role: 'radiogroup', 'aria-label': plain(slot.label ?? slot.id) });
    const btns = opts.map((o) => {
      const b = h(isVerdict ? 'button.w-strip-verdict' : 'button.wd-opt', {
        type: 'button', role: 'radio', 'aria-checked': 'false', dataset: { text: o.text, state: '' },
        onclick: () => { select(o.text); commit(slot.id, o.text, true); },
      }, label(o.text, 'wd-opt-t'), h('span.wd-opt-mark', { 'aria-hidden': 'true' }));
      wrap.append(b);
      return b;
    });
    const select = (text) => btns.forEach((b) => { const on = b.dataset.text === text; b.setAttribute('aria-checked', String(on)); b.dataset.on = String(on); });
    return {
      node: wrap,
      lock: (on) => btns.forEach((b) => { b.disabled = !!on; }),
      mark: (row) => {
        const ans = row?.answer ?? slot.answer;
        for (const b of btns) {
          const picked = same(b.dataset.text, values[slot.id]);
          const right = same(b.dataset.text, ans);
          b.dataset.state = row?.state === 'ok' && picked ? 'ok'
            : row?.state === 'revealed' && right ? 'ans'
            : row?.state === 'revealed' && picked ? 'bad' : '';
        }
      },
      focus: () => btns[0]?.focus({ preventScroll: true }),
      clear: () => { select(null); btns.forEach((b) => { b.dataset.state = ''; }); },
      set: (v) => select(typeof v === 'string' ? v : ''),
    };
  }

  function numControls(slot) {
    needsKeys = true;
    const box = field({
      key: slot.id,
      label: '',
      aria: plain(slot.label ?? slot.id),
      placeholder: slot.placeholder || '',
      size: 'sm',
      onInput: () => commit(slot.id, box.value(), false),
      onEnter: () => check(slot.id),
      onFocus: () => keepVisible(box.wrap, { dock: ctx.dock }),
    });
    const wrap = h('div.w-strip-entry', box.wrap, checkBtn(slot.id));
    return {
      node: wrap,
      lock: (on) => { box.lock(on); wrap.querySelector('.w-strip-check').disabled = !!on; },
      mark: (row) => box.setState(row?.state === 'ok' ? 'ok' : row?.state === 'revealed' ? 'bad' : '', ''),
      focus: () => box.focus(),
      clear: () => box.clear(),
      set: (v) => box.set(v == null ? '' : String(v)),
    };
  }

  function multiControls(slot) {
    needsKeys = true;
    const boxes = (slot.fields ?? []).map((f) => field({
      key: f.key,
      label: f.label ?? f.key,
      size: 'sm',
      wedge: f.wedge,
      onInput: () => commit(slot.id, read(), false),
      onEnter: () => check(slot.id),
      onFocus: () => { ctx.onWedge?.(f.wedge, true); keepVisible(box0(), { dock: ctx.dock }); },
    }));
    const box0 = () => boxes[0]?.wrap ?? root;
    const read = () => Object.fromEntries(boxes.map((b) => [b.key, b.value()]));
    const grid = h('div.w-strip-fields', ...boxes.map((b) => b.wrap));
    const wrap = h('div.w-strip-entry.is-multi', grid, checkBtn(slot.id));
    return {
      node: wrap,
      lock: (on) => { boxes.forEach((b) => b.lock(on)); wrap.querySelector('.w-strip-check').disabled = !!on; },
      mark: (row) => {
        const byKey = new Map((row?.fields ?? []).map((x) => [x.key, x]));
        for (const b of boxes) {
          const r = byKey.get(b.key);
          b.setState(r?.ok ? 'ok' : r?.kind === 'wrong' ? 'bad' : '', '');
        }
      },
      focus: () => (boxes.find((b) => b.isBlank()) ?? boxes[0])?.focus(),
      clear: () => boxes.forEach((b) => b.clear()),
      set: (v) => boxes.forEach((b) => b.set(v && typeof v === 'object' ? (v[b.key] ?? '') : '')),
    };
  }

  function chipControls(slot) {
    const chips = (slot.chips ?? []).map((c) => (typeof c === 'string' ? { text: c } : { ...c, text: String(c.text ?? '') }));
    const picked = new Set();
    const row = h('div.wd-chiprow.is-multi', { role: 'group', 'aria-label': plain(slot.label ?? 'because') });
    const btns = chips.map((c) => {
      const b = h('button.wd-chip', {
        type: 'button', 'aria-pressed': 'false', dataset: { text: c.text, state: '' },
        onclick: () => {
          if (picked.has(c.text)) picked.delete(c.text); else picked.add(c.text);
          const on = picked.has(c.text);
          b.setAttribute('aria-pressed', String(on));
          b.dataset.on = String(on);
          commit(slot.id, [...picked], false);
        },
      }, label(c.text, 'wd-chip-t'));
      row.append(b);
      return b;
    });
    const wrap = h('div.w-strip-entry.is-chips', row, checkBtn(slot.id, 'Use this reason'));
    return {
      node: wrap,
      lock: (on) => { btns.forEach((b) => { b.disabled = !!on; }); wrap.querySelector('.w-strip-check').disabled = !!on; },
      mark: (r) => {
        const ans = r?.answer ?? '';
        for (const b of btns) {
          const chosen = picked.has(b.dataset.text);
          const right = same(b.dataset.text, ans);
          b.dataset.state = r?.state === 'ok' && chosen ? 'ok'
            : r?.state === 'revealed' && right ? 'ans'
            : r?.state === 'revealed' && chosen ? 'bad' : '';
        }
      },
      focus: () => btns[0]?.focus({ preventScroll: true }),
      clear: () => { picked.clear(); btns.forEach((b) => { b.dataset.on = 'false'; b.dataset.state = ''; b.setAttribute('aria-pressed', 'false'); }); },
      set: (v) => {
        picked.clear();
        for (const t of (Array.isArray(v) ? v : [])) picked.add(String(t));
        btns.forEach((b) => { const on = picked.has(b.dataset.text); b.dataset.on = String(on); b.setAttribute('aria-pressed', String(on)); });
      },
    };
  }

  // ---------------------------------------------------------------- contract

  function raw() {
    return { ...values };
  }

  function setFeedback(res) {
    if (!res) {
      line.clear();
      root.dataset.state = '';
      proseBox.hidden = true;
      for (const e of rows.values()) { e.msg.hidden = true; e.controls.mark(null); }
      return;
    }
    const state = stateOf(res);
    root.dataset.state = state;
    line.set(state, cleanMsg(res, state === 'ok' ? 'Complete' : ''));
    okCount = 0;
    for (const row of (res.slots ?? [])) {
      const entry = rows.get(row.id);
      if (!entry) continue;
      entry.li.dataset.state = row.state;
      entry.controls.mark(row);
      entry.controls.lock(locked || row.state !== 'pending');
      if (row.state === 'ok') okCount++;
      if (row.state === 'revealed') {
        entry.msg.hidden = false;
        entry.msg.dataset.state = 'bad';
        entry.msg.replaceChildren(h('span.w-strip-ans-l', 'Answer'), label(String(row.answer ?? ''), 'w-strip-ans'));
      } else if (row.state === 'ok' && row.msg) {
        entry.msg.hidden = false;
        entry.msg.dataset.state = 'ok';
        entry.msg.replaceChildren(label(row.msg));
      } else {
        entry.msg.hidden = true;
      }
    }
    if (res.kind === 'wrong' && res.reveal) flash(rows.get(res.reveal.id)?.li ?? root, 'bad');
    else if (res.kind === 'correct') flash(rows.get(res.next)?.li ?? root, 'ok');
    complete = !!res.complete;
    if (res.next && !locked) {
      const entry = rows.get(res.next);
      entry?.controls.focus();
      entry?.li.scrollIntoView?.({ block: 'nearest' });
    }
    showProse(res);
  }

  function showProse(res) {
    if (!res?.complete || !res.prose || ctx.prose === false) { proseBox.hidden = true; return; }
    proseBox.hidden = false;
    const text = h('p.w-strip-prose-t');
    text.innerHTML = res.prose.html;
    proseBox.replaceChildren(h('p.wd-sub', res.ok ? 'Your explanation' : 'The explanation'), text);
    if (ctx.copy !== false && typeof navigator !== 'undefined' && navigator.clipboard) {
      const btn = h('button.btn.btn-ghost.w-strip-copy', {
        type: 'button',
        onclick: () => {
          navigator.clipboard.writeText(res.prose.text)
            .then(() => { btn.textContent = 'Copied'; })
            .catch(() => { btn.textContent = 'Select it to copy'; })
            .finally(() => setTimeout(() => { btn.textContent = 'Copy'; }, 1600));
        },
      }, 'Copy');
      proseBox.append(btn);
    }
  }

  function lock(on = true) {
    locked = !!on;
    for (const e of rows.values()) e.controls.lock(locked || e.li.dataset.state !== 'pending');
    root.classList.toggle('is-locked', locked);
  }

  // restore: put the saved answers back INTO the controls, not just into values{} — a strip whose
  // fields look empty but grade as filled is worse than one that does not restore at all
  if (ctx.values && typeof ctx.values === 'object') {
    for (const [id, v] of Object.entries(ctx.values)) {
      const entry = rows.get(id);
      if (!entry || v == null || v === '') continue;
      values[id] = v;
      entry.controls.set?.(v);
    }
  }
  el.append(root);
  if (ctx.locked) lock(true);

  return handle({
    el: root, part, type: 'strip',
    raw, setFeedback, lock,
    focus: () => { if (locked) return; for (const e of rows.values()) if (e.li.dataset.state === 'pending') { e.controls.focus(); return; } },
    isEmpty: () => Object.keys(values).length === 0,
    pips: () => ({ total: 1, filled: complete && okCount === slots.length ? 1 : 0 }),
    values: () => raw(),
    destroy() { if (keys) { keys.unwatch(root); if (!ctx.keys) keys.destroy(); } root.remove(); },
    /** how far down the ladder the student is: {done, total} */
    progress: () => ({ done: okCount, total: slots.length }),
  });
}

/** loose text equality for option/chip marking (the grader owns real normalization) */
function same(a, b) {
  const n = (v) => String(v ?? '').normalize('NFKC').replace(/[−–—]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
  return n(a) === n(b);
}

export default mount;
