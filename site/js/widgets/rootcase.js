// rootcase.js — the progressive `roots → reject → cases` widget (COMPOSED S3 "Parts",
// S9 #5: "the roots → keep/reject → cases stages appear progressively on one card").
//
// One widget, one card, three stages. Each stage is still graded by its OWN part through
// js/grader/index.js, so the screen asks the widget which part is live:
//
//   const part = w.activePart();  const res = grade(part, w.raw(), ctx);  w.setFeedback(res);
//
// Stage flow (S3): a correct `roots` submit advances; a proper-subset submit is `almost` and
// FREE the first time (the student gets another go at the second root) and `wrong` the second
// time — and then the chain advances with the roots actually found, which is what puts the
// "+ another case" tab on the cases stage. `roots` never reveals the missing root; only the
// cases stage's second missing-case miss does (res.reveal), and the widget builds that tab.
//
// mount(el, group, ctx) → handle + { activePart(), stage(), stages(), advance(), found(), setFound() }
//   raw() → 'x = 3 or -1/2'                              (roots stage)
//        → { keep:[…], reject:[…], reason }              (reject stage)
//        → [{ x:'3', CFD:'9', DFE:'171' }, …]            (cases stage; one object per tab)
// The group comes from widgets/index.js composeParts(): { type:'rootcase', roots, reject, cases }.

import { h, field, msgLine, keyRow, label, plain, stateOf, flash, wire, handle, resultText, wedgeLink, keepVisible, KEYS } from './base.js';
import { show } from '../grader/num.js';
import { menu as reasonMenu } from '../grader/reject.js';

const STAGE_NAME = { roots: 'Solve', reject: 'Keep or reject', cases: 'Cases' };

/** A 44 px two-or-more button segmented control (Keep/Reject, YES/NO). */
function seg(opts = {}) {
  const wrap = h('div.w-seg', { role: 'radiogroup', 'aria-label': opts.aria || opts.label || 'choice', dataset: { state: '' } });
  let value = opts.value ?? null;
  const buttons = (opts.options || []).map((o) => {
    const b = h('button.w-segbtn', { type: 'button', role: 'radio', 'aria-checked': String(value === o.value), dataset: { value: o.value } }, o.label);
    b.addEventListener('click', () => api.set(o.value, true));
    wrap.append(b);
    return b;
  });
  const api = {
    wrap, key: opts.key,
    value: () => value,
    set(v, notify) {
      value = v;
      for (const b of buttons) b.setAttribute('aria-checked', String(b.dataset.value === v));
      wrap.dataset.picked = v == null ? '' : String(v);
      if (notify) opts.onChange?.(api);
      return api;
    },
    setState(state) { wrap.dataset.state = state || ''; return api; },
    lock(on = true) { for (const b of buttons) b.disabled = !!on; wrap.classList.toggle('is-locked', !!on); return api; },
    isBlank: () => value == null,
    focus() { (buttons.find((b) => !b.disabled) || null)?.focus(); return api; },
    enabled: () => buttons.some((b) => !b.disabled),
  };
  return api.set(value, false);
}

export function mount(el, group = {}, ctx = {}) {
  const parts = {
    roots: group.roots || (group.type === 'roots' ? group : null),
    reject: group.reject || null,
    cases: group.cases || null,
  };
  const order = ['roots', 'reject', 'cases'].filter((k) => parts[k]);
  const root = h('div.w.w-rootcase', { dataset: { part: group.id || '', stage: order[0] || '', state: '' } });
  const fire = wire(root, ctx);
  const link = wedgeLink(ctx);
  const line = msgLine();
  let found = Array.isArray(ctx.found) ? ctx.found.slice() : [];
  let active = 0;
  let locked = false;

  const keys = ctx.keys || keyRow({ keys: KEYS.roots });
  keys.watch(root, KEYS.roots);

  /* ---- the stage rail (progress, never a clock) ---- */
  const rail = h('ol.w-steps', { 'aria-label': 'Stages' });
  const railItems = order.map((k, i) =>
    h('li.w-step', { dataset: { stage: k, state: i === 0 ? 'active' : '' } }, h('span.w-step-n', String(i + 1)), h('span.w-step-t', STAGE_NAME[k] || k))
  );
  for (const li of railItems) rail.append(li);
  if (order.length > 1) root.append(rail);
  else root.classList.add('is-single');

  /* ---- stage shells ---- */
  const stages = order.map((key) => {
    const body = h('div.w-stage-body');
    const summary = h('button.w-stage-sum', { type: 'button', hidden: true, 'aria-expanded': 'false' });
    const sec = h('section.w-stage', { dataset: { stage: key, state: '' }, hidden: key !== order[0] });
    const head = h('h3.w-stage-h', STAGE_NAME[key] || key);
    sec.append(head, summary, body);
    summary.addEventListener('click', () => {
      const open = sec.classList.toggle('is-open');
      summary.setAttribute('aria-expanded', String(open));
      body.hidden = !open;
    });
    root.append(sec);
    return { key, part: parts[key], sec, body, summary, built: false, ui: null };
  });
  root.append(line.el);
  if (!ctx.keys) root.append(keys.el);
  el.append(root);

  const at = (k) => stages.find((s) => s.key === k);
  const current = () => stages[Math.min(active, stages.length - 1)];

  function setStage(i, { focus = true } = {}) {
    active = Math.max(0, Math.min(i, stages.length - 1));
    stages.forEach((s, n) => {
      s.sec.hidden = n > active;
      s.sec.classList.toggle('is-done', n < active);
      s.sec.classList.toggle('is-active', n === active);
      if (n < active) { s.body.hidden = !s.sec.classList.contains('is-open'); s.summary.hidden = false; }
      else { s.body.hidden = false; s.summary.hidden = true; s.sec.classList.remove('is-open'); }
      railItems[n].dataset.state = n < active ? 'done' : n === active ? 'active' : '';
    });
    const s = current();
    root.dataset.stage = s.key;
    build(s);
    keys.claim(root, s.key === 'roots' ? KEYS.roots : KEYS.num);
    if (focus && !locked) s.ui?.focus?.();
    fire.input({ part: s.part, stage: s.key });
  }

  function summarize(s, text) {
    const mark = s.sec.dataset.state === 'ok' ? '✓' : '·';
    s.summary.textContent = '';
    s.summary.append(h('span.w-sum-mark', { 'aria-hidden': 'true' }, mark), h('span.w-sum-t', text), h('span.w-sum-more', 'show'));
    s.summary.setAttribute('aria-label', `${STAGE_NAME[s.key] || s.key}: ${text} — show`);
  }

  /* ------------------------------------------------------------------ stage: roots */
  function buildRoots(s) {
    const part = s.part;
    const box = field({
      key: 'roots',
      label: part.label ?? `${part.var || 'x'} =`,
      inputmode: 'decimal',
      aria: 'the solutions',
      onInput: () => { line.clear(); root.dataset.state = ''; fire.input({ part, stage: 'roots' }); },
      onEnter: () => fire.submit({ part, stage: 'roots' }),
      onFocus: (f) => keepVisible(f.wrap, { dock: ctx.dock }),
    });
    s.body.append(box.wrap, h('p.w-note', 'More than one answer? Separate them with a comma.'));
    s.ui = {
      raw: () => box.value(),
      focus: () => box.focus(),
      lock: (on) => box.lock(on),
      isEmpty: () => box.isBlank(),
      values: () => ({ roots: box.value() }),
      // W4 integration (notes/T13.md Requests → T08a): restore what `values()` snapshotted, so a
      // resumed Mock comes back with the stage AND its answers on screen, not just in the save.
      setValues(v) { if (v && typeof v.roots === 'string') box.set(v.roots); },
      feedback(res) {
        const state = stateOf(res);
        box.setState(state, '');
        if (state === 'ok') box.freeze();
        flash(state === 'bad' ? box.wrap : s.sec, state);
      },
      text: () => box.value().trim(),
    };
  }

  /* ----------------------------------------------------------------- stage: reject */
  function buildReject(s) {
    const part = s.part;
    const roots = foundList();
    const rows = roots.map((r) =>
      seg({
        key: r.text,
        aria: `x = ${r.text}`,
        options: [{ value: 'keep', label: 'Keep' }, { value: 'reject', label: 'Reject' }],
        onChange: () => { line.clear(); fire.input({ part, stage: 'reject' }); },
      })
    );
    const list = h('div.w-rej-rows');
    roots.forEach((r, i) => {
      list.append(h('div.w-rej-row', h('span.w-rej-x', `${parts.roots?.var || 'x'} = ${r.text}`), rows[i].wrap));
    });

    const chips = reasonMenu(part, { roots: roots.map((r) => r.text) });   // card r1: chips that name an unfound root, or say "both" of one, are dropped
    const chipBox = h('div.w-chips', { role: 'radiogroup', 'aria-label': 'Reason' });
    let reason = null;
    const chipEls = chips.map((c) => {
      const b = h('button.w-chip', { type: 'button', role: 'radio', 'aria-checked': 'false' }, c.text);
      b.addEventListener('click', () => {
        reason = c.text;
        for (const o of chipEls) o.setAttribute('aria-checked', String(o === b));
        line.clear();
        fire.input({ part, stage: 'reject' });
      });
      chipBox.append(b);
      return b;
    });

    s.body.append(h('p.w-note', 'Does each solution make sense in the figure?'), list, h('p.w-sublabel', 'Because…'), chipBox);
    s.ui = {
      raw: () => ({
        keep: roots.filter((r, i) => rows[i].value() === 'keep').map((r) => r.value),
        reject: roots.filter((r, i) => rows[i].value() === 'reject').map((r) => r.value),
        reason,
      }),
      focus: () => rows[0]?.focus(),
      lock: (on) => { for (const r of rows) r.lock(on); for (const b of chipEls) b.disabled = !!on; },
      isEmpty: () => rows.every((r) => r.isBlank()) && !reason,
      values: () => ({ keep: rows.map((r) => r.value()), reason }),
      setValues(v) {                                                    // W4 integration — see buildRoots
        if (!v || typeof v !== 'object') return;
        if (Array.isArray(v.keep)) v.keep.forEach((val, i) => { if (val && rows[i]) rows[i].set(val, false); });
        if (v.reason) {
          reason = v.reason;
          for (const b of chipEls) b.setAttribute('aria-checked', String(b.textContent === v.reason));
        }
      },
      feedback(res) {
        const state = stateOf(res);
        (res.roots || []).forEach((r, i) => {
          if (!rows[i]) return;
          const decided = rows[i].value();
          if (!decided) return rows[i].setState('');
          rows[i].setState(r.keep === r.valid ? 'ok' : 'bad');
        });
        chipBox.dataset.state = res.reasonOk ? 'ok' : reason ? (state === 'ok' ? '' : 'bad') : '';
        flash(s.sec, state);
      },
      text: () => {
        const keep = roots.filter((r, i) => rows[i].value() === 'keep').map((r) => r.text);
        const drop = roots.filter((r, i) => rows[i].value() === 'reject').map((r) => r.text);
        return [keep.length ? `keep ${keep.join(' and ')}` : '', drop.length ? `reject ${drop.join(' and ')}` : ''].filter(Boolean).join(', ');
      },
    };
  }

  /* ------------------------------------------------------------------ stage: cases */
  function buildCases(s) {
    const part = s.part;
    const cols = Array.isArray(part.cols) ? part.cols : [];
    const xKey = part.of ?? (cols.find((c) => c.type === 'root') || cols[0] || { key: 'x' }).key;
    const xLabel = (cols.find((c) => c.key === xKey) || {}).label || xKey;
    const valueCols = cols.filter((c) => c.key !== xKey);
    const expected = Array.isArray(part.rows) ? part.rows.length : 0;

    const tabsEl = h('div.w-tabs', { role: 'tablist', 'aria-label': 'Cases' });
    const panels = h('div.w-panels');
    s.body.append(tabsEl, panels);
    const tabs = [];
    let addTab = null;

    function select(t, { focus = true } = {}) {
      for (const o of tabs) {
        const on = o === t;
        o.btn.setAttribute('aria-selected', String(on));
        o.btn.tabIndex = on ? 0 : -1;
        o.panel.hidden = !on;
      }
      link.clear();
      if (focus) t.first?.focus?.();
    }

    function makeTab({ value, text, isAdd }) {
      const btn = h('button.w-tab', { type: 'button', role: 'tab', 'aria-selected': 'false', tabindex: '-1', dataset: { state: '' } },
        isAdd ? '+ another case' : `${xLabel} = ${text}`);
      const panel = h('div.w-panel', { role: 'tabpanel', hidden: true });
      const t = { btn, panel, value, text: text ?? null, isAdd: !!isAdd, cells: {}, xField: null, first: null };
      if (isAdd) {
        t.xField = field({
          key: xKey,
          label: `${xLabel} =`,
          aria: 'the other solution',
          onInput: () => { line.clear(); fire.input({ part, stage: 'cases' }); },
          onEnter: () => fire.submit({ part, stage: 'cases' }),
          onFocus: (f) => keepVisible(f.wrap, { dock: ctx.dock }),
        });
        panel.append(h('p.w-note', 'Work out the other case here — type its value, then its measures.'), t.xField.wrap);
        t.first = t.xField;
      }
      // two short numeric measures sit side by side on a phone; a verdict control needs its own row
      const twoUp = valueCols.length === 2 && valueCols.every((c) => (c.type || 'num') === 'num' && !/^(verdict|bisects|yes|yn)$/i.test(c.key));
      const grid = h('div.w-fields', { dataset: { cols: twoUp ? '2' : '1' } });
      for (const c of valueCols) {
        if ((c.type || '') === 'verdict' || /^(verdict|bisects|yes|yn)$/i.test(c.key)) {
          const control = seg({
            key: c.key,
            aria: plain(c.label || c.key),
            options: [{ value: 'YES', label: 'YES' }, { value: 'NO', label: 'NO' }],
            onChange: () => { line.clear(); fire.input({ part, stage: 'cases' }); },
          });
          const wrap = h('div.w-field.w-field-seg', { dataset: { state: '', key: c.key } });
          const lab = h('span.w-flabel');
          lab.append(label(c.label || c.key));
          wrap.append(lab, control.wrap);
          control.wrap.classList.add('w-seg-inline');
          grid.append(wrap);
          t.cells[c.key] = { kind: 'seg', control, wrap, setState: (st) => { wrap.dataset.state = st || ''; control.setState(st); } };
          t.first ||= control;
        } else {
          const f = field({
            key: c.key,
            label: c.label || c.key,
            wedge: c.wedge,
            size: valueCols.length > 2 ? 'sm' : 'md',
            onInput: () => { line.clear(); fire.input({ part, stage: 'cases' }); },
            onEnter: () => fire.submit({ part, stage: 'cases' }),
            onFocus: (fd) => { link.on(c.wedge); keepVisible(fd.wrap, { dock: ctx.dock }); },
          });
          grid.append(f.wrap);
          t.cells[c.key] = { kind: 'field', control: f, wrap: f.wrap, setState: (st, m) => f.setState(st, m) };
          t.first ||= f;
        }
      }
      panel.append(grid);
      btn.addEventListener('click', () => select(t));
      btn.addEventListener('keydown', (e) => {
        const i = tabs.indexOf(t);
        if (e.key === 'ArrowRight' && tabs[i + 1]) { e.preventDefault(); tabs[i + 1].btn.focus(); select(tabs[i + 1]); }
        if (e.key === 'ArrowLeft' && tabs[i - 1]) { e.preventDefault(); tabs[i - 1].btn.focus(); select(tabs[i - 1]); }
      });
      tabsEl.append(btn);
      panels.append(panel);
      tabs.push(t);
      return t;
    }

    for (const r of foundList()) makeTab({ value: r.value, text: r.text });
    if (tabs.length < expected) addTab = makeTab({ isAdd: true });
    if (!tabs.length) addTab = addTab || makeTab({ isAdd: true });
    select(tabs[0], { focus: false });

    const rowOf = (t) => {
      const out = {};
      const x = t.isAdd ? (t.xField ? t.xField.value() : '') : t.text;
      if (t.isAdd && !String(x).trim()) return null; // no tab = the "+ another case" path (S3)
      out[xKey] = t.isAdd ? x : (t.value ?? x);
      for (const [k, cell] of Object.entries(t.cells)) out[k] = cell.kind === 'seg' ? (cell.control.value() || '') : cell.control.value();
      return out;
    };

    s.ui = {
      raw: () => tabs.map(rowOf).filter(Boolean),
      focus: () => (tabs.find((t) => t.btn.dataset.state !== 'ok') || tabs[0])?.first?.focus?.(),
      lock: (on) => { for (const t of tabs) { for (const c of Object.values(t.cells)) c.control.lock(on); t.xField?.lock(on); } },
      isEmpty: () => tabs.every((t) => Object.values(t.cells).every((c) => c.control.isBlank()) && (!t.xField || t.xField.isBlank())),
      values: () => tabs.map(rowOf).filter(Boolean),
      setValues(v) {                                                    // W4 integration — see buildRoots
        if (!Array.isArray(v)) return;
        for (const row of v) {
          if (!row || typeof row !== 'object') continue;
          const x = row[xKey];
          let t = tabs.find((o) => !o.isAdd && String(o.value ?? o.text) === String(x));
          if (!t && addTab && String(x ?? '').trim()) { t = addTab; t.xField?.set(x); }
          if (!t) continue;
          for (const [k, cell] of Object.entries(t.cells)) {
            const val = row[k];
            if (val == null || val === '') continue;
            if (cell.kind === 'seg') cell.control.set(String(val), false);
            else cell.control.set(val);
          }
        }
      },
      pips: () => ({ total: expected || tabs.length || 1, filled: tabs.filter((t) => t.btn.dataset.state === 'ok').length }),
      feedback(res) {
        const submitted = tabs.map((t) => [t, rowOf(t)]).filter(([, r]) => r);
        (res.rows || []).forEach((r, i) => {
          const entry = submitted[i];
          if (!entry) return;
          const [t] = entry;
          let bad = 0; let ok = 0;
          for (const [k, cell] of Object.entries(t.cells)) {
            const c = (r.cells || {})[k];
            if (!c || c.state === 'open') { cell.setState('', ''); continue; }
            const st = c.state === 'ok' ? 'ok' : c.state === 'wrong' ? 'bad' : 'almost';
            cell.setState(st, '');
            if (st === 'ok') ok++; else { bad++; flash(cell.wrap, st); }
          }
          if (r.extra) { t.btn.dataset.state = 'bad'; if (t.xField) t.xField.setState('bad', ''); return; }
          t.btn.dataset.state = r.ok ? 'ok' : bad ? 'bad' : ok ? 'almost' : '';
        });
        // second missing-case miss: the grader names the root, the widget makes its tab (S3)
        const rev = res.reveal && (res.reveal[xKey] ?? res.reveal.x);
        if (rev != null && addTab) {
          addTab.isAdd = false;
          addTab.text = String(rev);
          addTab.value = String(rev);
          addTab.btn.textContent = `${xLabel} = ${rev}`;
          addTab.btn.classList.add('is-revealed');
          if (addTab.xField) { addTab.xField.set(rev).freeze(); addTab.first = Object.values(addTab.cells)[0]?.control || addTab.xField; }
          select(addTab);
          addTab = null;
        }
        const firstBad = tabs.find((t) => t.btn.dataset.state === 'bad' || t.btn.dataset.state === 'almost');
        if (firstBad && !res.ok) select(firstBad, { focus: false });
        flash(s.sec, stateOf(res));
      },
    };
  }

  function build(s) {
    if (s.built) return;
    s.built = true;
    if (s.key === 'roots') buildRoots(s);
    else if (s.key === 'reject') buildReject(s);
    else buildCases(s);
  }

  function foundList() {
    const src = found.length ? found : [];
    return src.map((v) => ({ value: v, text: show(v) }));
  }

  function advance({ focus = true } = {}) {
    const s = current();
    if (s.ui?.text) summarize(s, s.ui.text() || '✓');
    if (active >= stages.length - 1) { setStage(active, { focus: false }); return false; }
    setStage(active + 1, { focus });
    return true;
  }

  /**
   * W4 integration (notes/T13.md Requests → T08a). Put back the snapshot `values()` returns:
   * `{ stage, found, roots:{roots}, reject:{keep, reason}, cases:[rows] }`. `found` is restored FIRST
   * because the reject rows and the case tabs are built from it. Every other widget restores from
   * `ctx.values`; this was the last one that did not, so a resumed Mock showed empty later stages.
   */
  function restoreValues(v) {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v.found) && v.found.length) found = v.found.slice();
    const want = order.indexOf(v.stage);
    const upto = want < 0 ? 0 : want;
    for (let i = 0; i <= upto; i++) {
      const s = stages[i];
      if (!s) continue;
      build(s);
      s.ui?.setValues?.(v[s.key]);
    }
    if (upto > 0) {
      for (let i = 0; i < upto; i++) { const s = stages[i]; if (s.ui?.text) summarize(s, s.ui.text() || '✓'); }
      setStage(upto, { focus: false });
    }
  }

  build(stages[0]);
  setStage(0, { focus: false });
  restoreValues(ctx.values);

  return handle({
    el: root, part: group, type: 'rootcase',
    stage: () => current().key,
    stages: () => order.slice(),
    activePart: () => current().part,
    found: () => found.slice(),
    setFound(values) { found = Array.isArray(values) ? values.slice() : []; return found; },
    advance,
    raw: () => current().ui?.raw?.() ?? null,
    setFeedback(res) {
      const s = current();
      if (!res) { line.clear(); root.dataset.state = ''; return; }
      const state = stateOf(res);
      root.dataset.state = state;
      s.sec.dataset.state = state;
      s.ui?.feedback?.(res);
      line.set(state, resultText(res, state === 'ok' ? 'Correct' : ''));
      if (s.key === 'roots') {
        if (Array.isArray(res.found) && res.found.length) found = res.found.slice();
        // correct → next stage; a SECOND subset (kind 'wrong') → advance with what was found (S3)
        if (res.ok || (res.code === 'subset' && res.kind === 'wrong')) { advance(); line.clear(); root.dataset.state = ''; }   // card r1: the stage-1 line never sits under stage 2
      } else if (s.key === 'reject' && res.ok) {
        advance(); line.clear(); root.dataset.state = '';
      }
    },
    lock(on = true) {
      locked = !!on;
      for (const s of stages) { build(s); s.ui?.lock?.(on); }
      root.classList.toggle('is-locked', !!on);
      link.clear();
    },
    focus() { if (!locked) current().ui?.focus?.(); },
    isEmpty: () => !!current().ui?.isEmpty?.(),
    pips() {
      // S1: multi → fields, cases → rows, everything else → 1. A cleared case tab is one pip.
      let total = 0;
      let filled = 0;
      stages.forEach((s, i) => {
        if (s.key === 'cases') {
          total += Array.isArray(s.part.rows) ? s.part.rows.length || 1 : 1;
          filled += s.ui?.pips?.().filled || 0;
        } else {
          total += 1;
          filled += i < active ? 1 : 0;
        }
      });
      return { total, filled };
    },
    values: () => ({ stage: current().key, found: found.slice(), ...Object.fromEntries(stages.filter((s) => s.built).map((s) => [s.key, s.ui?.values?.()])) }),
    destroy() {
      link.clear();
      keys.unwatch(root);
      if (!ctx.keys) keys.destroy();
      root.remove();
    },
  });
}

export default mount;
