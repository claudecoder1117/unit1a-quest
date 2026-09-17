// screens/card.js — the Card screen (COMPOSED S8 #9; S1 "Minute-to-minute" steps 1–4; S3 "Hints & solutions";
// S4 XP / rarity / combo / mastery; S5 motion + AAA). Routes `#/card/:id` and `#/variant/:template?seed=`.
//
//   mountCard(params, query, ctx)     → (el) => cleanup        route handler for /card/:id
//   mountVariant(params, query, ctx)  → (el) => cleanup        route handler for /variant/:template (allocates a
//                                                             seed from save.seedCounter when none is given)
//   createCardView(host, source, opts) → { el, destroy(), state, item }   the reusable engine (run / boss screens
//                                                             embed it: pass onContinue / onDone and mode)
//   session                           the session-scoped combo (S4), pushed to the header via setHeader
//
// One card, one view: stem via mathfmt, figure via figure/svg.js (originals from data/figures.js, Variants from
// item.figure.spec), a plain Scratch textarea saved per card (maxlength = CAPS.cardWork), the Answer Dock (T08a's
// createDock: one shared key row + Submit/Continue), HP pips by the S1 formula, the hint ladder H1→H3, the S1
// attempt timeline (wrong 1 → red line + retry · wrong 2 → misconception line + H1 auto-shown, one more attempt ·
// wrong 3 → full worked solution, 0 XP, Bronze, Rematch queued; "Show solution" offered after wrong 2), the
// result strip (rarity chip, XP with its breakdown, par-vs-you, next review), the worked solution one step per
// tap, tap / Enter / N to continue — nothing auto-advances. `almost` / `malformed` are free (Global rule 2).
// Every save write goes through store.update(); ctx.sandbox grades but never writes.
//
// Import-safe in Node (no DOM at module scope). Imports app.js for navigate/setHeader/bus only inside functions
// (the app → screens/index → card → app cycle is legal ESM: nothing here runs at evaluation time).

import { navigate, setHeader, bus } from '../app.js';
import { getState, update, flush, markStreakDay } from '../store.js';
import { todayISO, diffDays } from '../days.js';
import { getCard } from '../../data/cards.js';
import { getFigure } from '../../data/figures.js';
import { skillById } from '../../data/skills.js';
import { numbering } from '../../data/sheets.js';
import { isBonus } from '../../data/source-manifest.js';
import { TERMS } from '../../data/vocab.js';
import { mathfmt, stripMarkup } from '../mathfmt.js';
import { composeParts, loadFor, mountPart, pipsFor, pipsForCard } from '../widgets/index.js';
import { h, createDock, KEYS } from '../widgets/base.js';
import { isTextField } from '../widgets/shortcuts.js';
import { xpFor, nextCombo, isClean, levelFor, rankFor, comboTier } from '../xp.js';
import { scoreFor, applyOutcome, decayAll, allMastered, leitnerOutcome, nextBucket, dueFor, isDue } from '../mastery.js';
import { rarityOf, bestRarity, generatorOf } from '../rarity.js';
// Wave 3 integration (notes/T10.md + notes/T11.md "Requests"): the Leitner due date gets T10's test clamp, a
// missed Variant is frozen through T10's own writer, a first-try clear clears the Rematch, and the trophy
// counters T11 catalogued get their call sites here.
import { clampDue, testAtOf, freezeVariant, clearRematch } from '../schedule.js';
import { bump, resetRun } from '../trophies.js';

/* ------------------------------------------------------------------ session (S4 combo) */

/** Session-scoped counters: the combo is never saved (S4 "session-scoped"). */
export const session = { combo: 0, clears: 0, xp: 0, startedAt: Date.now() };

/** Set the combo and push it to the header pip. */
export function setCombo(n) {
  session.combo = Math.max(0, Math.floor(Number(n) || 0));
  try { setHeader({ combo: session.combo }); } catch { /* no shell (tests) */ }
  return session.combo;
}

/* ------------------------------------------------------------------ constants */

const HINT_NAMES = ['relationship', 'setup', 'one step from the end'];
const PAR_DEFAULT = { 1: 20, 2: 90, 3: 180, 4: 300 };
const MAX_WRONG = 3;
const HIT_STOP_MS = 80;
const SCRATCH_MAX = 600;                       // store.js CAPS.cardWork (T01's request: maxlength, never a silent cut)
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `T-<cardId>` (S4's own-template spelling) → the generator family + the params that keep its shape. */
const OWN_PARAMS = Object.freeze({
  'wp-01': { frame: 'supp-k-m-angle' }, 'wp-07': { frame: 'supp-k-m-angle' },
  'wp-02': { frame: 'supp-k-m-comp' }, 'ang-06': { frame: 'supp-k-m-comp' }, 'doc-06': { frame: 'supp-k-m-comp' },
  'wp-03': { frame: 'angle-plus-comp' }, 'wp-04': { frame: 'angle-k-m-comp' }, 'wp-13': { frame: 'm-diff-n-comp' },
  'wp-15': { frame: 'comp-of-shifted' }, 'wp-09': { frame: 'diff-of-supps' },
  'wp-06': { frame: 'one-of-two' }, 'ang-02': { frame: 'one-of-two' }, 'ang-03': { frame: 'one-of-two' },
  'ang-11': { frame: 'nested-difference' }, 'wp-08': { frame: 'half-difference' },
  'ang-07': { form: 'parts' }, 'wp-05': { form: 'parts' }, 'ang-08': { form: 'supp-comp' }, 'wp-11': { form: 'supp-comp' }, 'wp-10': { form: 'angle-supp' },
});

/* ------------------------------------------------------------------ lazy modules */

let modsP = null;
/** graders + templates + svg are imported on first use so the shell's first paint stays light (app.js boot). */
function mods() {
  if (!modsP) {
    modsP = Promise.all([import('../grader/index.js'), import('../../data/templates.js'), import('../figure/svg.js')])
      .then(async ([G, T, SVG]) => { await G.ready; return { G, T, SVG }; });
  }
  return modsP;
}

/* ------------------------------------------------------------------ helpers */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const reduceMotion = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)').matches : true);

/** The S6 default record for cards[id], created on demand inside an update(). */
export function cardRec(save, id) {
  const rec = save.cards[id] ?? (save.cards[id] = {});
  const d = {
    attempts: 0, cleared: false, rarity: null, foil: false, foilProgress: [], setupTried: false, bucket: 0,
    lastAt: null, due: null, hintsUsed: 0, solutionShown: false, bestMs: null, placed: false, work: '', history: [],
  };
  for (const k of Object.keys(d)) if (!(k in rec) || rec[k] === undefined) rec[k] = d[k];
  if (!Array.isArray(rec.history)) rec.history = [];
  if (!Array.isArray(rec.foilProgress)) rec.foilProgress = [];
  return rec;
}

/** m:ss for the par line. */
export function fmtClock(ms) {
  const s = Math.max(0, Math.round(num(ms) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 'today' · 'tomorrow' · 'Thu' (within a week) · 'Sep 24'. */
export function fmtDue(dueMs, now = Date.now()) {
  if (!Number.isFinite(dueMs)) return '—';
  const today = todayISO(new Date(now));
  const day = todayISO(new Date(dueMs));
  const d = diffDays(today, day);
  if (Number.isNaN(d) || d <= 0) return 'today';
  if (d === 1) return 'tomorrow';
  const dt = new Date(dueMs);
  if (d < 7) return DAY_NAMES[dt.getDay()];
  return `${MONTHS[dt.getMonth()]} ${dt.getDate()}`;
}

/** The generator family + params for a `T-…` route name (registered id, or S4's own-template `T-<cardId>`). */
export function resolveTemplate(name, T, query = null) {
  const q = (k) => (query && typeof query.get === 'function' ? query.get(k) : null);
  const params = {};
  for (const k of ['frame', 'form', 'mode', 'ask', 'kind']) if (q(k)) params[k] = q(k);
  if (T.getTemplate(name)) return { template: name, params, forCard: q('for') || T.getTemplate(name).forCard || null, own: false };
  const cardId = String(name).replace(/^T-/, '');
  if (getCard(cardId)) {
    const ids = T.templatesForCard(cardId);
    const gen = ids[0] ?? generatorOf(cardId);
    if (gen && T.getTemplate(gen)) return { template: gen, params: { ...(OWN_PARAMS[cardId] || {}), ...params }, forCard: q('for') || cardId, own: true };
  }
  return null;
}

/** Which family tile a Variant credits (S4 family tiles): the template's `family`, or fam-quad-a1/a2 by mode. */
export function familyOf(item, T) {
  const e = T?.getTemplate?.(item?.template);
  if (e && typeof e.family === 'string' && e.family) return e.family;
  if (item?.template === 'T-quad-solve') { const mode = item.params?.mode || item.meta?.mode; return mode ? `fam-quad-${mode}` : null; }
  return null;
}

/** Normalise a card / generated item into the one shape the view renders (never mutates the data). */
export function normalizeItem(raw, { kind = 'card', histLen = 0 } = {}) {
  const tier = clamp(Math.floor(num(raw.tier, 1)), 1, 4);
  let parts = Array.isArray(raw.parts) ? raw.parts.filter(Boolean) : [];
  let pickIndex = null;
  if (raw.pick === 'one' && parts.length > 1) { pickIndex = histLen % parts.length; parts = [parts[pickIndex]]; }
  const hints = (Array.isArray(raw.hints) ? raw.hints : []).map((x) => String(x ?? '')).filter(Boolean).slice(0, 3);
  const solution = (Array.isArray(raw.solution) ? raw.solution : []).filter((s) => s && (s.say || s.math)).map((s) => ({ say: s.say ?? '', math: s.math ?? '' }));
  return {
    id: raw.id, kind, tier, par: num(raw.par, PAR_DEFAULT[tier]), skills: Array.isArray(raw.skills) ? raw.skills.slice() : [],
    sheet: raw.sheet ?? null, module: raw.module ?? null, stem: String(raw.stem ?? raw.prompt ?? ''), note: raw.note ?? null,
    instruction: raw.instruction ?? null, figure: raw.figure ?? null, parts, pickIndex, hints, solution,
    misconceptions: Array.isArray(raw.misconceptions) ? raw.misconceptions : [],
    template: raw.template ?? null, seed: raw.seed ?? null, seedTag: raw.seedTag ?? null, templateVersion: raw.templateVersion ?? null,
    params: raw.params ?? null, meta: raw.meta ?? null, answer: raw.answer ?? null,
    numbering: kind === 'card' ? (raw.teacherNo || numbering(raw.id) || '') : '◆',
    bonus: kind === 'card' ? (raw.bonus === true || isBonus(raw.id)) : false,
    raw,
  };
}

/* ------------------------------------------------------------------ route handlers */

function optsFromQuery(query, kind) {
  const q = (k) => query?.get?.(k);
  const on = (k) => q(k) != null && q(k) !== '0' && q(k) !== 'false';
  return {
    kind,
    sandbox: on('sandbox'),
    review: q('review') == null ? null : on('review'),
    drill: on('drill'),
    rematch: on('rematch'),
    forCard: q('for') || null,
    back: q('back') ? '/' + String(q('back')).replace(/^#?\/?/, '') : '/binder',
  };
}

/** `screens['/card/:id']` */
export function mountCard(params, query) {
  return (el) => {
    const view = createCardView(el, { id: params.id }, optsFromQuery(query, 'card'));
    return () => view.destroy();
  };
}

/** `screens['/variant/:template']` — a Variant needs a seed; without one we allocate from save.seedCounter and
 *  replace the URL so RETRY / share / frozen replays all point at the same problem. */
export function mountVariant(params, query) {
  const seed = query?.get?.('seed');
  if (!seed) {
    return (el) => {
      let counter = 0, pid = '';
      update((s) => { counter = ++s.seedCounter; pid = String(s.profileId || '').replace(/[^a-z0-9]/gi, '').slice(0, 6); });
      const q = Object.fromEntries(query?.entries?.() ?? []);
      q.seed = `${pid || 'p'}-${counter}`;
      el.append(h('section.screen.card-screen', h('p.muted', 'Rolling a Variant…')));
      const t = setTimeout(() => navigate(`/variant/${params.template}`, { query: q, replace: true }), 0);
      return () => clearTimeout(t);
    };
  }
  return (el) => {
    const view = createCardView(el, { template: params.template, seed }, optsFromQuery(query, 'variant'));
    return () => view.destroy();
  };
}

/* ------------------------------------------------------------------ the view */

/**
 * createCardView(host, source, opts) → controller
 * @param {HTMLElement} host
 * @param {{id?:string, template?:string, seed?:string, item?:object}} source   an original id, a template + seed, or a ready item
 * @param {object} opts  { kind:'card'|'variant', sandbox, review (null = auto by due), drill, rematch, forCard, back,
 *                         mode:'card'|'boss'|'mock', hints:true, save:true, xpFactor:1, onContinue(result), onDone(result), rename }
 */
export function createCardView(host, source = {}, opts = {}) {
  const o = { kind: source.template || source.item?.template ? 'variant' : 'card', sandbox: false, review: null, drill: false, rematch: false, forCard: null, back: '/binder', mode: 'card', hints: true, save: true, xpFactor: 1, ...opts };
  const st = {
    destroyed: false, ready: false, item: null, model: null, entries: [], pipTotal: 0,
    hints: 0, hintOpen: [false, false, false], wrongs: {}, firstWrongScored: false, withHints: false,
    setupTried: false, setupDone: false, solutionOffered: false, solutionShown: false, solutionStep: 0,
    done: false, cleared: false, result: null, comboBefore: session.combo,
    startedAt: Date.now(), hiddenAt: null, hiddenMs: 0, errorTs: new Set(), lastSubmitAt: 0,
    cops: [],                                    // trophy counter ops, flushed inside the card's final update()
  };
  const cleanups = [];
  const on = (target, evt, fn, o2) => { target.addEventListener(evt, fn, o2); cleanups.push(() => target.removeEventListener(evt, fn, o2)); };

  /* ---- skeleton (paints before anything async) ---- */
  const root = h('section.screen.card-screen', { dataset: { kind: o.kind, state: 'loading' }, 'aria-busy': 'true' });
  const head = h('header.card-head');
  const backLink = h('a.card-back', { href: '#' + o.back, 'aria-label': 'Back' }, '←');
  const meta = h('div.card-meta');
  const pips = h('span.hp.card-pips', { role: 'img', 'aria-label': 'progress' });
  head.append(backLink, meta, pips);
  const stage = h('div.card-stage');
  const paper = h('article.card-paper', { 'aria-label': 'Problem' });
  const stemEl = h('div.card-stem');
  const noteEl = h('p.card-note.muted', { hidden: true });
  const instrEl = h('p.card-instruction.muted', { hidden: true });
  const figBox = h('div.card-figure', { hidden: true });
  const paperNo = h('span.card-no.mono', { 'aria-hidden': 'true' });
  paper.append(paperNo, instrEl, stemEl, noteEl, figBox);
  const side = h('div.card-side');
  const scratchId = `scratch-${String(source.id || source.template || 'v').replace(/[^a-z0-9-]/gi, '')}`;
  const scratch = h('textarea.card-scratch', { id: scratchId, maxlength: String(SCRATCH_MAX), rows: '4', placeholder: 'show work…', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off' });
  const scratchWrap = h('div.card-scratch-wrap', h('label.card-side-h', { for: scratchId }, 'Scratch ', h('span.muted.fs-1', '— show your work (S)')), scratch);
  const hintBtn = h('button.btn.card-hint-btn', { type: 'button' }, 'Hint');
  const hintList = h('ol.hint-list', { 'aria-live': 'polite' });
  const hintWrap = h('div.hint-ladder', h('div.card-side-h', 'Hints ', h('span.muted.fs-1', '(H) — cost XP quality, never an attempt')), hintList, hintBtn);
  side.append(scratchWrap, hintWrap);
  const partsHost = h('div.card-parts', h('p.muted.card-loading', 'Loading the answer box…'));
  const foot = h('div.card-foot');
  const solBtn = h('button.btn.card-showsol', { type: 'button', hidden: true }, 'Show solution ', h('span.muted.fs-1', '(0 XP · Bronze)'));
  foot.append(solBtn);
  const result = h('div.card-result', { hidden: true, role: 'status', 'aria-live': 'polite' });
  const solution = h('section.card-solution', { hidden: true, 'aria-label': 'Worked solution' });
  stage.append(paper);
  root.append(head, stage, side, partsHost, foot, result, solution);
  if (o.sandbox) root.append(h('p.card-sandbox.muted.fs-1', 'Sandbox — nothing here is saved or scored.'));
  host.append(root);

  /* ---- dock ---- */
  const dock = createDock({ keys: KEYS.num });
  const submitBtn = h('button.btn.btn-primary.card-submit', { type: 'button' }, 'Submit');
  submitBtn.addEventListener('pointerdown', (e) => e.preventDefault());   // keep focus (and the OS keyboard) in the field
  submitBtn.addEventListener('mousedown', (e) => e.preventDefault());
  const contBtn = h('button.btn.btn-primary.card-continue', { type: 'button', hidden: true }, 'Continue ', h('span.fs-1', '↵ / N'));
  dock.actions.append(submitBtn, contBtn);
  dock.keys.el.hidden = true;                      // shown while a text input inside the parts has focus
  let keysTimer = 0;
  let lastFocused = null;                          // the entry the student last touched (the dock Submit grades it)
  on(partsHost, 'focusin', (e) => {
    lastFocused = st.entries.find((en) => en.body.contains(e.target)) || lastFocused;
    if (isTextField(e.target) && e.target.tagName === 'INPUT') { clearTimeout(keysTimer); dock.keys.el.hidden = false; }
  });
  on(partsHost, 'focusout', () => { clearTimeout(keysTimer); keysTimer = setTimeout(() => { const a = document.activeElement; if (!(a && partsHost.contains(a) && isTextField(a) && a.tagName === 'INPUT')) dock.keys.el.hidden = true; }, 120); });

  /* ---- time (silent par timer, wall-clock minus time hidden) ---- */
  const elapsed = () => Date.now() - st.startedAt - st.hiddenMs - (st.hiddenAt ? Date.now() - st.hiddenAt : 0);
  if (typeof document !== 'undefined') {
    on(document, 'visibilitychange', () => {
      if (document.visibilityState === 'hidden') { if (!st.hiddenAt) st.hiddenAt = Date.now(); scratchFlush(); }
      else if (st.hiddenAt) { st.hiddenMs += Date.now() - st.hiddenAt; st.hiddenAt = null; }
    });
  }

  /* ---- scratch (saved per original card; a Variant keeps it for the visit only) ---- */
  let scratchTimer = 0, scratchDirty = false;
  function scratchFlush() {
    if (!scratchDirty || o.sandbox || o.kind !== 'card' || !st.item) return;
    scratchDirty = false;
    const value = scratch.value.slice(0, SCRATCH_MAX);
    update((s) => { cardRec(s, st.item.id).work = value; });
  }
  on(scratch, 'input', () => { scratchDirty = true; clearTimeout(scratchTimer); scratchTimer = setTimeout(scratchFlush, 400); });

  /* ---- error card ---- */
  function fail(msg) {
    root.dataset.state = 'error';
    root.setAttribute('aria-busy', 'false');
    partsHost.replaceChildren(h('div.card-error', h('h2', 'Cannot open this card'), h('p.muted.mono', String(msg)), h('p', h('a.btn', { href: '#/binder' }, 'Binder'))));
    dock.hide();
  }

  /* ---- init ---- */
  let M = null;   // { G: graders, T: templates, SVG }
  init().catch((e) => { console.error('card', e); fail(e?.message || e); });

  async function init() {
    M = await mods();
    if (st.destroyed) return;
    let raw, model = null;
    if (source.item) {
      raw = source.item;
    } else if (o.kind === 'variant') {
      const r = resolveTemplate(source.template, M.T, opts.query || null);
      if (!r) throw new Error(`unknown template: ${source.template}`);
      if (!o.forCard) o.forCard = r.forCard;
      raw = M.T.generate(r.template, source.seed, r.params);
    } else {
      raw = getCard(source.id);
      if (!raw) throw new Error(`no card "${source.id}" in the Packet`);
    }
    const save = getState();
    const rec0 = o.kind === 'card' ? save.cards[raw.id] : null;
    const histLen = rec0?.history?.length ?? 0;
    const item = normalizeItem(raw, { kind: o.kind, histLen });
    st.item = item;
    if (o.kind === 'variant') model = M.T.modelOf(raw) || null;
    st.model = model;
    if (o.review == null) o.review = o.kind === 'card' ? isDue(rec0) : false;

    renderHead(item, rec0);
    renderPaper(item);
    if (o.kind === 'card' && rec0?.work) scratch.value = String(rec0.work).slice(0, SCRATCH_MAX);
    renderHints(item);

    const groups = composeParts(item.parts).map((g) => (isSetupSlot(g) ? { ...g, optional: true } : g));
    await loadFor(groups);
    if (st.destroyed) return;
    mountGroups(item, groups, save);
    root.dataset.state = 'live';
    root.setAttribute('aria-busy', 'false');
    st.ready = true;
    st.startedAt = Date.now(); st.hiddenMs = 0; st.hiddenAt = document.visibilityState === 'hidden' ? Date.now() : null;
    drawPips();
    focusFirst();
  }

  /* ---- head + paper ---- */
  function renderHead(item, rec) {
    meta.replaceChildren();
    if (o.kind === 'card') {
      meta.append(h('span.chip.card-sheet', `${item.sheet ?? ''}${item.numbering ? ' · ' + item.numbering : ''}`.trim()));
    } else {
      meta.append(h('span.chip.card-variant', { dataset: { tone: 'accent' }, title: `Variant of ${item.template} · seed ${item.seed}` }, `◆ ${item.template}#${item.seedTag ?? ''}`));
      if (o.forCard) meta.append(h('span.chip', `for ${o.forCard}`));
    }
    meta.append(h('span.chip.card-tier', `tier ${item.tier}`));
    if (o.review) meta.append(h('span.chip', { dataset: { tone: 'accent' } }, 'review'));
    if (o.rematch) meta.append(h('span.chip', { dataset: { tone: 'warn' } }, 'rematch'));
    if (o.drill) meta.append(h('span.chip', 'drill'));
    const names = item.skills.map((id) => skillById[id]?.name ?? id);
    if (names.length) meta.append(h('span.card-skills.muted.fs-1', names.join(' · ')));
    if (rec?.rarity) meta.append(h('span.rarity.fs-1', { dataset: { r: rec.rarity } }, rec.rarity));
  }

  function renderPaper(item) {
    paperNo.textContent = item.numbering || '';
    if (item.instruction) { instrEl.textContent = String(item.instruction); instrEl.hidden = false; }
    stemEl.innerHTML = mathfmt(item.stem);
    if (item.note) { noteEl.textContent = String(item.note); noteEl.hidden = false; }
    const svg = figureFor(item);
    if (svg) {
      figBox.replaceChildren(svg);
      figBox.hidden = false;
      if (!reduceMotion()) { figBox.classList.add('is-enter'); setTimeout(() => figBox.classList.remove('is-enter'), 600); }
      st.figureEl = svg;
    }
  }

  function figureFor(item) {
    const f = item.figure;
    if (!f) return null;
    try {
      const fopts = o.rename ? { ...f, rename: { ...(f.rename || {}), ...o.rename } } : f;
      if (f.spec) return M.SVG.element(f.spec, fopts);
      const fig = getFigure(f.id);
      return fig ? M.SVG.element(fig, fopts) : null;
    } catch (e) { console.error('figure', e); return null; }
  }

  /* ---- hints (S3: H1 relationship, H2 setup, H3 one step from the end) ---- */
  function renderHints(item) {
    if (o.hints === false || o.mode === 'boss' || !item.hints.length) { hintWrap.hidden = true; return; }
    hintBtn.textContent = '';
    hintBtn.append(`Hint 1 of ${item.hints.length}`, h('span.muted.fs-1', ` · ${HINT_NAMES[0]}`));
  }
  on(hintBtn, 'click', () => revealNextHint());

  function revealNextHint({ auto = false } = {}) {
    if (st.done || !st.item || hintWrap.hidden) return false;
    const i = st.hintOpen.findIndex((x) => !x);
    if (i < 0 || i >= st.item.hints.length) return false;
    return revealHint(i, { auto });
  }

  function revealHint(i, { auto = false } = {}) {
    if (st.hintOpen[i] || !st.item || i >= st.item.hints.length) return false;
    st.hintOpen[i] = true;
    st.hints = st.hintOpen.filter(Boolean).length;
    const li = h('li.hint-row', { dataset: { n: String(i + 1) } },
      h('span.hint-tag.mono', `H${i + 1}`),
      h('span.hint-text', { html: mathfmt(st.item.hints[i]) }),
      auto ? h('span.hint-auto.muted.fs-1', ' — shown automatically after a second miss (counts as a hint)') : null);
    hintList.append(li);
    requestAnimationFrame(() => li.classList.add('is-in'));
    const next = i + 1;
    if (next < st.item.hints.length) { hintBtn.textContent = ''; hintBtn.append(`Hint ${next + 1} of ${st.item.hints.length}`, h('span.muted.fs-1', ` · ${HINT_NAMES[next]}`)); }
    else { hintBtn.disabled = true; hintBtn.textContent = 'No more hints'; }
    if (i >= 1 && !o.sandbox) setCombo(0);        // H2 / H3 reset the combo; H1 holds (S4)
    bus.emit('card:hint', { id: st.item.id, hint: i + 1, auto });
    return true;
  }

  /* ---- parts ---- */
  function mountGroups(item, groups, save) {
    partsHost.replaceChildren();
    const required = groups.filter((g) => !g.optional);
    st.pipTotal = item.raw?.pick === 'one' ? 1 : required.reduce((n, g) => n + pipsFor(g), 0);
    const seed = o.kind === 'variant' ? String(item.seed ?? item.id) : `${item.id}|${save.cards[item.id]?.history?.length ?? 0}`;
    let n = 0;
    for (const g of groups) {
      const optional = !!g.optional;
      const box = h('div.card-part', { dataset: { part: g.id || '', type: g.type, optional: String(optional), state: '' } });
      const label = optional ? 'Setup · optional (Gold needs it tried once)' : required.length > 1 ? `Part ${++n} of ${required.length}` : groups.length > 1 ? 'Answer' : '';
      if (label) box.append(h('p.card-part-h.muted.fs-1', label));
      const body = h('div.card-part-body');
      box.append(body);
      partsHost.append(box);
      const ctx = {
        card: item.raw, state: {}, keys: dock.keys, dock, figureEl: st.figureEl || null, figure: item.figure || null, model: st.model || null,
        seed, mode: o.mode === 'card' ? 'card' : o.mode, settings: save.settings, sandbox: o.sandbox, terms: TERMS,
        misconceptions: item.misconceptions, shortcuts: true, mock: o.mode === 'mock' || undefined, boss: o.mode === 'boss' || undefined,
      };
      const entry = { group: g, optional, box, body, ctx, w: null, finished: false, ok: false, revealed: false, skipped: false, wrongs: 0, lastRes: null, lastSubmitAt: 0, pendingReason: false, pairsSeen: null };
      if (optional) ctx.onSkip = (hnd) => { entry.skipped = !!(hnd?.skipped ?? true); box.dataset.state = entry.skipped ? 'skipped' : ''; };
      entry.w = mountPart(body, g, ctx);
      st.entries.push(entry);
      on(body, 'w-submit', (e) => { e.stopPropagation(); gradeEntry(entry, { fromWidget: true }); });
      if (g.type === 'pairs') on(body, 'w-input', () => pairsInput(entry));
      on(body, 'w-skip', (e) => { entry.skipped = !!e.detail?.skipped; box.dataset.state = entry.skipped ? 'skipped' : ''; });
    }
  }

  /** The S3 setup slot: skippable on Cards ("optional only on Cards"), required in a Boss / Mock (T12 / T13 pass mode). */
  function isSetupSlot(g) {
    return !!g && g.type === 'equation' && g.optional !== false && o.mode === 'card';
  }

  function requiredEntries() { return st.entries.filter((e) => !e.optional); }

  function focusFirst() {
    const e = requiredEntries().find((x) => !x.finished) || st.entries.find((x) => !x.finished && !x.skipped);
    if (e && e.w && !reduceMotion()) { try { e.w.focus(); } catch { /* not focusable */ } }
  }

  function activeEntry() {
    const live = (e) => e && !e.finished && !(e.optional && e.skipped);
    const a = document.activeElement;
    if (a) { const hit = st.entries.find((e) => live(e) && e.body.contains(a)); if (hit) return hit; }
    if (live(lastFocused) && !lastFocused.w.isEmpty()) return lastFocused;
    const req = requiredEntries().filter((e) => !e.finished);
    return req.find((e) => !e.w.isEmpty()) || req[0] || st.entries.find((e) => !e.finished && !e.skipped && !e.w.isEmpty()) || null;
  }

  /* ---- grading (S1 step 2) ---- */
  /* ---- trophy counters (data/trophies.js COUNTERS — T11's contract) ----
     Ops are buffered per card and written inside the one update() the finish path already makes, so a
     grade never costs an extra save write and a card abandoned mid-way writes no half-counters. */
  function cop(op, key) { if (!o.sandbox && o.save !== false) st.cops.push([op, key]); }
  function flushCops(sv) {
    for (const [op, key] of st.cops) { if (op === 'reset') resetRun(sv, key); else bump(sv, key); }
    st.cops.length = 0;
  }
  const isNotationItem = () => /^not-/.test(st.item?.id ?? '') || st.item?.template === 'T-notation';
  const isSignLeadItem = () => st.item?.id === 'fac-16' || st.item?.template === 'T-factor-neg';
  const isSystemsItem = () => st.item?.id === 'doc-07' || st.item?.template === 'T-sys' || st.item?.template === 'T-fig-system';

  /** Per-part counters, recorded at the moment the part is graded (S4 / T11 COUNTERS "when"). */
  function partCounters(entry, part, res) {
    if (o.sandbox || o.save === false || !res) return;
    const key = part.id || entry.group.id || String(st.entries.indexOf(entry));
    const firstSubmit = !(st.wrongs[key] > 0);
    const t = part.type;
    const right = res.kind === 'correct' && res.ok;
    if (t === 'equation' && entry.optional && right) cop('bump', 'setups');
    if (t === 'reject' && right) cop('bump', 'rejects');
    if (t === 'roots' && right && firstSubmit && st.item.id === 'ang-10') cop('bump', 'bothRoots');
    if (t === 'cases' && right && firstSubmit && st.item.id === 'ang-05') cop('bump', 'twoCases');
    if (t === 'factored') {
      if (right) cop(elapsed() <= 30000 ? 'bump' : 'reset', 'forgeFlash');
      else if (res.kind === 'wrong') cop('reset', 'forgeFlash');
    }
    // "Reasoned 36": a distinct asn statement settled with the verdict right and no wrong chip behind it.
    // In Card mode the reason line is shown, not asked (S3), so this is the verdict; in Full 36 it is the chip.
    if (t === 'asn' && right && !res.withHints && !res.askReason && o.kind === 'card' && !getState().cards?.[st.item.id]?.reasoned) {
      cop('bump', 'asnReasoned');
      st.markReasoned = true;
    }
  }

  function gradeEntry(entry, { fromWidget = false } = {}) {
    if (st.done || !st.ready || entry.finished || !entry.w) return null;
    const now = Date.now();
    if (!fromWidget && now - entry.lastSubmitAt < 200) return null;   // the dock button's own double-tap guard (T08a)
    entry.lastSubmitAt = now;
    const w = entry.w;
    const part = w.activePart ? w.activePart() : entry.group;
    const stageParts = entry.group.type === 'rootcase' ? entry.group.parts : [entry.group];
    const isLast = part === stageParts[stageParts.length - 1];
    const raw = w.raw();
    const gctx = part.type === 'reject' && w.found ? Object.assign({}, entry.ctx, { roots: w.found() }) : entry.ctx;
    const res = M.G.grade(part, raw, gctx);
    w.setFeedback(res);
    entry.lastRes = res;
    partCounters(entry, part, res);
    afterGrade(entry, part, res, { isLast, raw });
    drawPips();
    const ev = { id: st.item.id, part: part.id, kind: res.kind, ok: res.ok, free: M.G.isFree(res) };
    bus.emit('card:graded', ev);
    bus.emit('graded', ev);                       // T11's trophy engine listens on 'graded' (notes/T11.md)
    return res;
  }

  function afterGrade(entry, part, res, { isLast, raw }) {
    if (entry.optional) return afterSetup(entry, part, res, raw);
    const free = M.G.isFree(res);

    if (res.kind === 'correct') {
      // a strip's intermediate slot comes back kind:'correct' with ok:false (the strip is not complete yet)
      if (part.type === 'strip' && !res.complete) return;            // a slot locked in; the strip goes on
      if (part.type === 'strip' && !res.ok) {                          // complete, some slots revealed (each already charged)
        finishEntry(entry, { ok: false, revealed: false });
        return maybeFinish();
      }
      if (entry.group.type === 'rootcase' && !isLast) return;         // the widget advanced its own chain
      if (part.type === 'asn') {
        if (res.withHints) st.withHints = true;                       // right verdict, wrong chip: "with hints" (S3)
        if (res.askReason && res.stage !== 'reason') { entry.pendingReason = true; return; }   // Full 36: chips still to pick
      }
      if (!res.ok) return;                                             // any other partial "correct" is progress, not a clear
      finishEntry(entry, { ok: true });
      hitStop();
      bus.emit('sfx', 'correct');
      return maybeFinish();
    }

    if (free) {
      if (part.type === 'asn' && res.stage === 'reason' && entry.pendingReason) {   // the reflective chip after a wrong verdict
        entry.pendingReason = false;
        finishEntry(entry, { ok: false, revealed: true });
        return maybeFinish();
      }
      bus.emit('sfx', 'almost');
      return;
    }

    if (res.kind !== 'wrong') return;
    // a charged attempt (S1 step 2)
    chargeWrong(entry, part, res, raw);
    if (st.done) return;
    if (part.type === 'asn') {
      // the wrong line names the right letter (S3) — the verdict is settled; only the chip row can still open
      if (res.askReason) { entry.pendingReason = true; return; }
      finishEntry(entry, { ok: false, revealed: true });
      return maybeFinish();
    }
    if (part.type === 'strip' && res.complete) {                      // the last slot was the revealed one
      finishEntry(entry, { ok: false, revealed: false });
      return maybeFinish();
    }
  }

  /** The skippable equation slot: graded when tried, never an attempt against the card, never a combo event. */
  function afterSetup(entry, part, res, raw) {
    if (res.kind === 'malformed') return;
    st.setupTried = true;
    if (res.ok) {
      st.setupDone = true;
      finishEntry(entry, { ok: true });
      bus.emit('sfx', 'correct');
      focusFirst();
      return;
    }
    if (res.kind === 'wrong') {
      entry.wrongs++;
      logError(part, res, raw);
      if (entry.wrongs >= MAX_WRONG) revealSetup(entry, part);
    }
  }

  function revealSetup(entry, part) {
    const text = part.text || (Array.isArray(part.system) ? part.system.join(', ') : part.canonical ? `${part.canonical} = 0` : null);
    entry.finished = true; entry.ok = false; entry.revealed = true;
    entry.box.dataset.state = 'revealed';
    try { entry.w.lock(true); } catch { /* proxy */ }
    if (text) entry.box.append(h('p.card-part-reveal', h('span.muted', 'One setup that works: '), h('span.mono', { html: mathfmt(text) })));
  }

  function finishEntry(entry, { ok, revealed = false }) {
    entry.finished = true; entry.ok = ok; entry.revealed = revealed;
    entry.box.dataset.state = ok ? 'ok' : revealed ? 'revealed' : 'done';
    try { entry.w.lock(true); } catch { /* proxy */ }
    if (entry.w.el?.classList) entry.w.el.classList.add('is-locked');
  }

  /** A wrong pair inside the pairs widget is validated instantly (T08c) — it is a charged attempt the moment it lands. */
  function pairsInput(entry) {
    if (st.done || entry.finished || !entry.w?.result) return;
    const r = entry.w.result();
    if (!r || r === entry.pairsSeen) return;
    entry.pairsSeen = r;
    const last = Array.isArray(r.results) ? r.results[r.results.length - 1] : null;
    if (last && last.kind === 'wrong') { chargeWrong(entry, entry.group, { ...r, kind: 'wrong', tags: last.tags ?? r.tags ?? [], msg: last.msg }, entry.w.raw()); drawPips(); }
  }

  function chargeWrong(entry, part, res, raw) {
    const key = part.id || entry.group.id || String(st.entries.indexOf(entry));
    st.wrongs[key] = (st.wrongs[key] || 0) + 1;
    entry.wrongs++;
    const n = st.wrongs[key];
    nudge();
    bus.emit('sfx', 'wrong');
    if (!o.sandbox) setCombo(0);                                       // any wrong submit resets (S4)
    logError(part, res, raw);
    if (!st.firstWrongScored) {                                        // s = 0 on the FIRST wrong only (S4 mastery)
      st.firstWrongScored = true;
      if (!o.sandbox && o.save !== false) update((s) => { decayAll(s.skills); applyOutcome(s.skills, st.item.skills, scoreFor({ wrong: true }), { at: Date.now(), dueReview: false }); });
    }
    bus.emit('card:wrong', { id: st.item.id, part: part.id, n, tags: res.tags ?? [] });
    if (n === 2) revealHint(0, { auto: true });                         // second miss: misconception line + H1 auto-shown
    if (n >= 2) offerSolution();
    if (n >= MAX_WRONG) showSolution({ forced: true, part });          // third miss: the full worked solution, 0 XP, Bronze
  }

  function logError(part, res, raw) {
    if (o.sandbox || o.save !== false || !st.item) { if (o.sandbox || o.save === false) return; }
    const t = Date.now();
    st.errorTs.add(t);
    let got = '';
    try { got = typeof raw === 'string' ? raw : JSON.stringify(raw ?? ''); } catch { got = String(raw); }
    const tags = Array.isArray(res.tags) && res.tags.length ? res.tags.slice() : cardTags(part, res, raw);
    update((s) => {
      s.errors.push({ item: st.item.id, seed: st.item.seed ?? null, t, got: String(got).slice(0, 200), tags, cleared: false, part: part.id ?? null, template: st.item.template ?? null, forCard: o.forCard ?? null });
    });
  }

  /** Card-level misconceptions (part + answer) for the error log when a grader returned no tag (T06a's request). */
  function cardTags(part, res, raw) {
    const list = st.item?.misconceptions ?? [];
    const cand = [res?.normalized?.picked, res?.normalized, res?.picked, raw].filter((v) => v != null && typeof v !== 'object').map((v) => String(v).trim().toLowerCase());
    for (const m of list) {
      if (!m || (m.part && m.part !== part.id) || !m.tag) continue;
      const a = String(m.answer ?? '').trim().toLowerCase();
      if (a && cand.includes(a)) return [m.tag];
    }
    return [];
  }

  function maybeFinish() {
    const req = requiredEntries();
    if (!req.length || !req.every((e) => e.finished)) return;
    if (req.some((e) => e.revealed)) return finishRevealed('missed');
    return finishClear();
  }

  /* ---- clear (S1 step 3) ---- */
  function finishClear() {
    if (st.done) return;
    st.done = true; st.cleared = true;
    const item = st.item;
    const elapsedMs = Math.max(0, elapsed());
    const wrongMax = Math.max(0, ...Object.values(st.wrongs));
    const wrongSum = Object.values(st.wrongs).reduce((a, b) => a + b, 0);
    const firstTry = wrongMax === 0;
    const attempt = 1 + wrongMax;
    const hints = st.hints;
    const clean = isClean({ firstTry, hints });
    const save = getState();
    const rec0 = o.kind === 'card' ? save.cards[item.id] : (o.forCard ? save.cards[o.forCard] : null);
    const setupTried = st.setupTried || !!rec0?.setupTried || !st.entries.some((e) => e.optional);
    const rarity = rarityOf({ id: o.kind === 'card' ? item.id : o.forCard, firstTry, hints, attempt, solutionShown: false, setupTried });
    const mastered = allMastered(save.skills, item.skills);
    const xpInfo = xpFor({
      tier: item.tier, firstTry, hints, attempt, comboBefore: session.combo, elapsedMs,
      isReview: !!o.review, isDrill: !!o.drill, isVariant: o.kind === 'variant', isMastered: mastered, isBonusBank: item.bonus, isRematch: !!o.rematch,
      factor: o.xpFactor, partsTotal: st.pipTotal, partsCorrect: st.pipTotal,
    });
    const comboBefore = session.combo;
    const comboAfter = nextCombo(comboBefore, { firstTry, hints });
    const s = scoreFor({ firstTry, hints, attempt, withHints: st.withHints });
    const outcome = leitnerOutcome({ firstTry, hints, attempt, withHints: st.withHints });
    let levelBefore = levelFor(save.xp), levelAfter = levelBefore, due = null;

    if (!o.sandbox && o.save !== false) {
      update((sv) => {
        const now = Date.now(); const today = todayISO();
        decayAll(sv.skills, now);
        levelBefore = levelFor(sv.xp);
        sv.xp += xpInfo.xp;
        levelAfter = levelFor(sv.xp);
        const d = sv.daily[today] ?? (sv.daily[today] = { xp: 0, clears: 0, goalMet: false, mockDone: false });
        d.xp = num(d.xp) + xpInfo.xp; d.clears = num(d.clears) + 1;
        if (!d.goalMet && d.xp >= num(sv.settings?.dailyGoal, 400)) { d.goalMet = true; markStreakDay(sv, today); }
        applyOutcome(sv.skills, item.skills, s, { at: now, dueReview: !!o.review });
        const testAt = testAtOf(sv);
        if (o.kind === 'card') {
          const rec = cardRec(sv, item.id);
          const prevAt = rec.lastAt;
          rec.attempts = num(rec.attempts) + wrongSum + 1;
          rec.cleared = true;
          rec.rarity = bestRarity(rec.rarity, rarity);
          rec.setupTried = !!(rec.setupTried || st.setupTried);
          rec.bucket = nextBucket(rec.bucket, outcome);
          rec.lastAt = now;
          // T10's test clamp (S4 "if due lands after the test, pull it forward"); dueFor is the plain interval.
          rec.due = clampDue(dueFor(rec.bucket, now), { now, testAt }); due = rec.due;
          rec.hintsUsed = hints;
          rec.lastFirstTry = firstTry;                  // page.js missedOriginals reads this (notes/T10.md)
          if (st.markReasoned) rec.reasoned = true;     // "Reasoned 36" counts each statement once
          rec.bestMs = rec.bestMs == null ? elapsedMs : Math.min(rec.bestMs, elapsedMs);
          rec.history.push({ at: now, ok: true, attempt, hints, ms: elapsedMs });
          if (o.review && clean) rec.foilProgress.push({ day: today, via: 'review' });
          if (o.review && prevAt != null && now - prevAt >= 2 * 86400000) cop('bump', 'coldRecall');
        } else {
          const v = sv.variants[item.template] ?? (sv.variants[item.template] = { clearsGold: 0, goldDays: [] });
          v.clears = num(v.clears) + 1;
          if (rarity === 'gold') { v.clearsGold = num(v.clearsGold) + 1; addDay(v, today); }
          const fam = familyOf(item, M.T);
          if (fam && rarity === 'gold') { const f = sv.variants[fam] ?? (sv.variants[fam] = { clearsGold: 0, goldDays: [] }); f.clearsGold = num(f.clearsGold) + 1; addDay(f, today); }
          if (o.forCard && rarity === 'gold') cardRec(sv, o.forCard).foilProgress.push({ day: today, via: item.id });
          if (sv.frozen[item.id]) delete sv.frozen[item.id];
        }
        for (const e of sv.errors) if (e && st.errorTs.has(e.t) && e.item === item.id) e.cleared = true;
        // A first-try clear closes the Rematch this card (or this template/forCard) was queued for (T10).
        if (firstTry) clearRematch(sv, o.kind === 'card' ? item.id : (o.forCard || item.template));
        const c = sv.counters;
        c.clears = num(c.clears) + 1;
        if (clean) c.cleanClears = num(c.cleanClears) + 1;
        if (o.review) c.reviews = num(c.reviews) + 1;
        if (wrongMax >= 3) cop('bump', 'comebacks');           // T11's Comeback trophy (it also reads history)
        // T11 counters that are decided by the whole clear, not by one part.
        if (isNotationItem()) cop(clean ? 'bump' : 'reset', 'notationClean');
        if (isSignLeadItem()) cop('bump', 'signLead');
        if (isSystemsItem()) cop('bump', 'systems');
        flushCops(sv);
      });
      setCombo(comboAfter);
      session.clears++; session.xp += xpInfo.xp;
    }

    st.result = { id: item.id, kind: o.kind, cleared: true, firstTry, attempt, hints, clean, rarity, xp: o.sandbox ? 0 : xpInfo.xp, xpInfo, elapsedMs, comboBefore, comboAfter, withHints: st.withHints, setupTried, s, outcome, due, forCard: o.forCard, review: !!o.review };
    lockAll();
    showResult(st.result, { levelBefore, levelAfter });
    bus.emit('card:cleared', st.result);
    o.onDone?.(st.result);
  }

  function addDay(v, today) {
    if (!Array.isArray(v.goldDays)) v.goldDays = [];
    if (!v.goldDays.includes(today)) v.goldDays.push(today);
  }

  /* ---- solution shown / missed (S1 step 4) ---- */
  function offerSolution() {
    if (st.solutionOffered || st.done || !st.item?.solution.length) return;
    st.solutionOffered = true;
    solBtn.hidden = false;
  }
  on(solBtn, 'click', () => showSolution({ forced: false }));

  function showSolution({ forced = false, part = null } = {}) {
    if (st.done) return;
    st.solutionShown = true;
    if (!forced && !o.sandbox) setCombo(0);                            // a voluntary reveal resets (a forced one followed a wrong)
    finishRevealed(forced ? 'third-wrong' : 'revealed', { part });
  }

  function finishRevealed(reason, { part = null } = {}) {
    if (st.done) return;
    st.done = true;
    const item = st.item;
    const elapsedMs = Math.max(0, elapsed());
    const wrongMax = Math.max(0, ...Object.values(st.wrongs));
    const wrongSum = Object.values(st.wrongs).reduce((a, b) => a + b, 0);
    const attempt = 1 + wrongMax;
    const hints = st.hints;
    let due = null;
    if (!o.sandbox && o.save !== false) {
      update((sv) => {
        const now = Date.now();
        if (o.kind === 'card') {
          const rec = cardRec(sv, item.id);
          rec.attempts = num(rec.attempts) + wrongSum;
          rec.solutionShown = true;
          rec.rarity = bestRarity(rec.rarity, 'bronze');                // Bronze until re-cleared via a Variant (S1)
          rec.bucket = nextBucket(rec.bucket, 'wrong');
          rec.lastAt = now; rec.due = now; due = now;                   // it comes straight back
          rec.hintsUsed = hints;
          rec.lastFirstTry = false;                                     // page.js missedOriginals (notes/T10.md)
          rec.history.push({ at: now, ok: false, attempt, hints, ms: elapsedMs });
        } else {
          // a missed Variant is frozen by seed + templateVersion so the exact failed problem returns (S4).
          // T10's writer owns the record shape (it also carries lastAt/params and prunes at bucket ≥ 3).
          try { freezeVariant(sv, item, { forCard: o.forCard ?? null, now }); } catch { /* an item with no template cannot be re-rolled */ }
        }
        const c = sv.counters;
        c.solutions = num(c.solutions) + 1;
        c.rematchQueued = num(c.rematchQueued) + 1;
        if (isNotationItem()) cop('reset', 'notationClean');            // a miss breaks the notation run (T11)
        flushCops(sv);
      });
    }
    st.result = { id: item.id, kind: o.kind, cleared: false, solutionShown: true, reason, attempt, hints, rarity: 'bronze', xp: 0, elapsedMs, due, forCard: o.forCard, rematch: true };
    lockAll();
    showResult(st.result, {});
    openSolution({ all: true });
    bus.emit('card:solution', st.result);
    o.onDone?.(st.result);
  }

  function lockAll() {
    for (const e of st.entries) { try { e.w.lock(true); } catch { /* proxy */ } if (!e.finished) e.box.dataset.state = e.optional ? 'skipped' : 'locked'; }
    hintBtn.disabled = true;
    solBtn.hidden = true;
    submitBtn.hidden = true;
    contBtn.hidden = false;
    dock.keys.el.hidden = true;
    scratchFlush();
    if (!reduceMotion()) contBtn.focus({ preventScroll: true });
  }

  /* ---- result strip ---- */
  function showResult(r, { levelBefore = 1, levelAfter = 1 } = {}) {
    result.replaceChildren();
    const item = st.item;
    const okTick = h('span.card-tick', { 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5" pathLength="1"/></svg>' });
    if (r.cleared) {
      const rar = h('span.rarity.card-rarity', { dataset: { r: r.rarity } }, (o.kind === 'variant' ? '◆ ' : '') + String(r.rarity).toUpperCase());
      const xpN = h('span.card-xp-n.mono', o.sandbox ? '—' : `+${r.xp}`);
      const line1 = h('div.card-result-top', okTick, rar, h('span.card-xp', xpN, h('span.muted', ' XP')));
      const line2 = h('p.card-breakdown.mono.muted', o.sandbox ? 'sandbox — not scored' : r.xpInfo.breakdown);
      const bits = [`${fmtClock(r.elapsedMs)} · par ${fmtClock(item.par * 1000)}`];
      if (!o.sandbox && o.kind === 'card' && r.due) bits.push(`next review: ${fmtDue(r.due)}`);
      if (!o.sandbox && r.comboAfter !== r.comboBefore) bits.push(`combo ${r.comboAfter}`);
      else if (!o.sandbox && r.comboAfter > 0) bits.push(`combo holds at ${r.comboAfter}`);
      const line3 = h('p.card-par.mono.muted', bits.join('  ·  '));
      const note = r.rarity !== 'gold' && r.firstTry && r.hints <= 1 && !r.setupTried ? h('p.card-result-note.muted.fs-1', 'Silver, not Gold: this card wants the equation setup tried once.') : null;
      result.append(line1, line2, line3);
      if (note) result.append(note);
      if (!o.sandbox && !reduceMotion()) tween(xpN, 0, r.xp, 400, (v) => `+${v}`);
      stage.classList.add('is-ok'); setTimeout(() => stage.classList.remove('is-ok'), 400);
      if (levelAfter > levelBefore) setTimeout(() => levelUp(levelAfter), 300);
    } else {
      result.append(
        h('div.card-result-top', h('span.card-miss', { 'aria-hidden': 'true' }, '✗'), h('span.rarity.card-rarity', { dataset: { r: 'bronze' } }, 'BRONZE'), h('span.card-xp', h('span.card-xp-n.mono', '0'), h('span.muted', ' XP'))),
        h('p.card-breakdown.mono.muted', r.reason === 'third-wrong' ? 'third miss — the worked solution is below' : r.reason === 'missed' ? 'missed — read the reason, then the solution' : 'solution shown'),
        h('p.card-par.mono.muted', `${fmtClock(r.elapsedMs)} · par ${fmtClock(item.par * 1000)}${o.sandbox ? '' : ' · a Rematch is queued for your next Page'}`),
      );
    }
    const actions = h('div.card-result-actions');
    if (item.solution.length && r.cleared) actions.append(h('button.btn', { type: 'button', onclick: () => openSolution({ all: false }) }, 'Worked solution'));
    if (o.kind === 'variant') actions.append(h('button.btn', { type: 'button', onclick: () => anotherVariant() }, 'Another ◆'));
    actions.append(h('button.btn.btn-primary', { type: 'button', onclick: () => continueNow() }, 'Continue'));
    result.append(actions);
    result.hidden = false;
    requestAnimationFrame(() => { result.classList.add('is-in'); okTick.classList.add('is-draw'); });
    if (!reduceMotion()) setTimeout(() => result.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60);
  }

  function tween(el, from, to, ms, fmt = String) {
    const t0 = performance.now();
    const step = (t) => {
      if (st.destroyed) return;
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(Math.round(from + (to - from) * e));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---- worked solution: one step per tap (S1 step 3) ---- */
  let solBuilt = false;
  const solList = h('ol.sol-steps');
  const solNext = h('button.btn.sol-next', { type: 'button' }, 'Next step');
  function openSolution({ all = false } = {}) {
    const item = st.item;
    if (!item.solution.length) return;
    if (!solBuilt) {
      solBuilt = true;
      solution.append(h('div.card-side-h', 'Worked solution ', h('span.muted.fs-1', `(${item.solution.length} steps — one per tap)`)), solList, solNext);
      on(solNext, 'click', () => nextStep());
      on(solList, 'click', () => { if (!all) nextStep(); });
    }
    solution.hidden = false;
    if (all) { while (nextStep()) { /* reveal every step */ } }
    else if (st.solutionStep === 0) nextStep();
    if (!reduceMotion()) setTimeout(() => solution.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60);
  }
  function nextStep() {
    const item = st.item;
    const i = st.solutionStep;
    if (i >= item.solution.length) return false;
    const s = item.solution[i];
    const li = h('li.sol-step', h('span.sol-say', { html: mathfmt(s.say) }), s.math ? h('span.sol-math.mono', { html: mathfmt(s.math) }) : null);
    solList.append(li);
    requestAnimationFrame(() => li.classList.add('is-in'));
    st.solutionStep = i + 1;
    if (st.solutionStep >= item.solution.length) { solNext.disabled = true; solNext.textContent = 'That is the whole solution.'; }
    else solNext.textContent = `Next step (${st.solutionStep} of ${item.solution.length})`;
    return true;
  }

  /* ---- motion (S5): 80 ms hit-stop, ok pulse, 8 px nudge toward the dock, level-up radial wipe ---- */
  function hitStop() {
    if (reduceMotion()) return;
    stage.classList.add('is-hit');
    setTimeout(() => stage.classList.remove('is-hit'), HIT_STOP_MS);
  }
  function nudge() {
    if (reduceMotion()) return;
    stage.classList.remove('is-nudge'); void stage.offsetWidth; stage.classList.add('is-nudge');
    setTimeout(() => stage.classList.remove('is-nudge'), 260);
  }
  function levelUp(level) {
    const ring = document.getElementById('hdr-level');
    const r = ring?.getBoundingClientRect();
    const cx = r ? r.left + r.width / 2 : innerWidth - 40, cy = r ? r.top + r.height / 2 : 28;
    const wipe = h('div.levelup-wipe', { style: { left: `${cx}px`, top: `${cy}px` } });
    const cardEl = h('div.levelup-card', { role: 'status' }, h('span.levelup-l.mono', `Level ${level}`), h('span.levelup-rank', rankFor(level)));
    const layer = h('div.levelup', { 'aria-hidden': 'false' }, wipe, cardEl);
    document.body.append(layer);
    requestAnimationFrame(() => layer.classList.add('is-in'));
    bus.emit('sfx', 'levelup');
    bus.emit('levelup', { level, rank: rankFor(level) });
    setTimeout(() => { layer.classList.add('is-out'); setTimeout(() => layer.remove(), 400); }, 1800);
  }

  /* ---- pips (S1 formula: multi → fields, cases → rows, else 1; optional setup → 0) ---- */
  function drawPips() {
    const total = st.pipTotal;
    let filled = 0;
    for (const e of requiredEntries()) {
      if (!e.w) continue;
      if (e.finished) { filled += e.revealed ? (e.w.pips?.().filled ?? 0) : pipsFor(e.group); continue; }
      filled += e.w.pips?.().filled ?? 0;
    }
    filled = Math.min(total, filled);
    const prev = pips.children.length ? [...pips.children].filter((p) => p.classList.contains('is-full')).length : 0;
    pips.replaceChildren();
    for (let i = 0; i < total; i++) pips.append(h('span.hp-pip' + (i < filled ? '.is-full' : '') + (i >= prev && i < filled ? '.is-new' : '')));
    pips.setAttribute('aria-label', `${filled} of ${total} parts cleared`);
    if (filled > prev) setTimeout(() => { for (const p of pips.children) p.classList.remove('is-new'); }, 260);
  }

  /* ---- continue / variants ---- */
  function continueNow() {
    if (!st.done) return;
    scratchFlush();
    try { flush(); } catch { /* memory store */ }
    if (typeof o.onContinue === 'function') return o.onContinue(st.result);
    navigate(o.back);
  }
  function anotherVariant() {
    const item = st.item;
    const q = {};
    if (o.forCard) q.for = o.forCard;
    if (o.drill) q.drill = 1;
    if (o.rematch) q.rematch = 1;
    if (o.back && o.back !== '/binder') q.back = o.back.replace(/^\//, '');
    const src = typeof source.template === 'string' ? source.template : item.template;
    navigate(`/variant/${src}`, { query: q });
  }
  on(submitBtn, 'click', () => { const e = activeEntry(); if (e) gradeEntry(e); });
  on(contBtn, 'click', () => continueNow());

  /* ---- keyboard (S5 AAA: Enter submit · H hint · N next · S scratch · Esc; ignored inside text fields) ---- */
  function liveAsn() { return st.entries.some((e) => !e.finished && !e.optional && e.group.type === 'asn'); }
  on(document, 'keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || !root.isConnected) return;
    const t = e.target;
    if (isTextField(t)) { if (e.key === 'Escape') { t.blur?.(); } return; }
    const k = String(e.key).toLowerCase();
    const interactive = t && t.nodeType === 1 && (t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'SELECT' || t.getAttribute?.('role') === 'button' || t.getAttribute?.('role') === 'radio');
    if (k === 'enter') {
      if (interactive) return;                                          // the focused control handles its own Enter
      e.preventDefault();
      if (st.done) continueNow(); else { const en = activeEntry(); if (en) gradeEntry(en); }
    } else if (k === 'n') {
      if (st.done) { e.preventDefault(); continueNow(); }
    } else if (k === 'h') {
      if (!st.done) { e.preventDefault(); revealNextHint(); }
    } else if (k === 's') {
      if (!liveAsn() && !st.done) { e.preventDefault(); scratch.focus(); }
    } else if (k === 'escape') {
      if (!solution.hidden && st.cleared) { e.preventDefault(); solution.hidden = true; }
      else if (t && t.blur) t.blur();
    }
  });

  /* ---- teardown ---- */
  function destroy() {
    if (st.destroyed) return;
    st.destroyed = true;
    clearTimeout(scratchTimer); clearTimeout(keysTimer);
    scratchFlush();
    for (const fn of cleanups.splice(0)) { try { fn(); } catch { /* gone */ } }
    for (const e of st.entries) { try { e.w?.destroy?.(); } catch { /* gone */ } }
    try { dock.destroy(); } catch { /* gone */ }
    for (const l of document.querySelectorAll('.levelup')) l.remove();
    root.remove();
  }

  return { el: root, destroy, state: st, get item() { return st.item; }, get ready() { return st.ready; }, grade: () => { const e = activeEntry(); return e ? gradeEntry(e) : null; }, hint: () => revealNextHint(), continue: continueNow };
}

export default createCardView;
