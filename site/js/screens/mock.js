// mock.js — the Mock exam and the day-1 Baseline (COMPOSED S7 "Mock", S8 #13).
//
//   #/mock                  a full Mock: 20 items / 40 minutes, sections A–E in the doc's order
//   #/mock?kind=baseline    the Baseline: 10 items / 20 minutes, scored × 0.8 into Readiness `A`
//   #/mock?replay=<n>       RETRY SAME SEED: the exact paper of run `n`, never PB- or XP-eligible
//
// Exam rules (S7): a rules card first, then **no hints, no solutions, no per-item feedback**; a scratch
// textarea per item; flags (`F`); a question-map rail (a swipe-up sheet on phones); answers editable
// until SUBMIT; a confirm dialog that counts what is unanswered and flagged; a WALL-CLOCK timer that
// auto-submits at 0:00; submit is idempotent (guarded by `runs[n].status`).
//
// Everything that matters survives a tab kill: the open run lives in `save.runs[n]` with
// `status:'open'`, its answers are written on every change (debounced) and flushed every 5 s and on
// `visibilitychange`, and the timer is `startedAt + limitMs − Date.now()` — never an interval count —
// so reopening resumes with the TRUE remaining time (S6 "Timers").
//
// Import-safe in Node: nothing below touches the DOM at module scope, so `tests/mock.test.mjs` can
// import the pure half (startRun / gradeRun / submitRun / remainingMs / mockXp) directly.

import { navigate, bus } from '../app.js';
import { getState, update, flush } from '../store.js';
import { todayISO } from '../days.js';
import { h, createDock, KEYS } from '../widgets/base.js';
import { isTextField } from '../widgets/shortcuts.js';
import { composeParts, loadFor, mountPart } from '../widgets/index.js';
import { mathfmt } from '../mathfmt.js';
import { skillById } from '../../data/skills.js';
import { TERMS } from '../../data/vocab.js';
import { getFigure } from '../../data/figures.js';
import { normalizeItem } from './card.js';
import { readiness } from '../readiness.js';
import { applyOutcome as applySchedule, clampDue, testAtOf, recordRematch } from '../schedule.js';
import { freshSkill, updateSkill, isMastered, mockMiss } from '../mastery.js';
import { bump, resetRun } from '../trophies.js';
import {
  POINTS_PER_ITEM, LATE_HOUR, SECTION_NAME,
  buildPlan, itemFor, kindOf, nextIndex, scoreOf, sectionsFor,
} from '../../data/blueprint.js';

/* ------------------------------------------------------------------ lazy modules */

let modsP = null;
/** graders + templates + svg land on first use, so having the Mock in the registry costs no first paint. */
export function mods() {
  if (!modsP) {
    modsP = Promise.all([import('../grader/index.js'), import('../../data/templates.js'), import('../figure/svg.js'), import('../figure/model.js')])
      .then(async ([G, T, SVG, FM]) => { await G.ready; return { G, T, SVG, FM }; });
  }
  return modsP;
}

/* ------------------------------------------------------------------ constants */

export const AUTOSAVE_MS = 5000;          // S6: "every 5 s inside a Mock"
export const AMBER_MS = 60 * 1000;        // S5 Motion / S9 #6: the clock turns --warn for the last 60 s …
export const PULSE_MS = 10 * 1000;        // … and --bad with a 1 Hz opacity pulse for the last 10 s (r1: was 5 min / 1 min)
export const TICK_MS = 250;
export const SCRATCH_MAX = 1000;          // CAPS.workChars — the store clips at 1 KB, so never cut silently
export const XP_SUBMIT = 150;             // S4 "Mock submitted +150"
export const XP_ACC = 300;                // "accuracy bonus round(300 × acc²)"
export const XP_PB = 200;                 // "PB beaten +200"
export const MOCK_MISS_M = 69;            // S4 "a Mock miss on a Mastered skill drops m to 69"

const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const KINDS = ['mock', 'baseline'];

/** mm:ss (never negative). */
export function fmtClock(ms) {
  const t = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** "38 min" / "1 h 02" for the report head. */
export function fmtSpan(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ the run record (pure) */

export function runKind(run) {
  return String(run?.kind ?? '').split(':')[0];
}

/** Is this a Mock-like run (mock | baseline)? */
export function isMockRun(run) {
  return isObj(run) && KINDS.includes(runKind(run));
}

/** The newest still-open Mock/Baseline run, or null. */
export function openRun(save) {
  const runs = Array.isArray(save?.runs) ? save.runs : [];
  for (let i = runs.length - 1; i >= 0; i--) if (isMockRun(runs[i]) && runs[i].status === 'open') return { n: i, run: runs[i] };
  return null;
}

/** S6: `remaining = startedAt + limitMs − Date.now()` — wall clock, never an interval count. */
export function remainingMs(run, now = Date.now()) {
  if (!isObj(run)) return 0;
  const started = Number(run.startedAt) || 0;
  const limit = Number(run.limitMs) || 0;
  return started + limit - now;
}

export function elapsedMs(run, now = Date.now()) {
  if (!isObj(run)) return 0;
  const end = Number(run.submittedAt) || now;
  return Math.max(0, end - (Number(run.startedAt) || end));
}

export function expired(run, now = Date.now()) {
  return remainingMs(run, now) <= 0;
}

/** One save item from one plan item (the plan IS the record — a replay rebuilds from these fields). */
function itemRecord(plan) {
  return {
    n: plan.n, slotId: plan.slotId, section: plan.section, sectionName: plan.sectionName || SECTION_NAME[plan.section] || '',
    label: plan.label || '', source: plan.source,
    id: plan.id ?? null, cardId: plan.cardId ?? null,
    template: plan.template ?? null, seed: plan.seed ?? null, params: plan.params ?? null,
    partIds: plan.partIds ? plan.partIds.slice() : null,
    skill: plan.skill ?? null, skills: Array.isArray(plan.skills) ? plan.skills.slice() : [],
    tier: plan.tier ?? null,
    answers: {}, raw: null, parts: [], credit: 0, ms: 0, flagged: false, work: '', clean: false,
  };
}

/** The plan back out of a stored item (RETRY SAME SEED and the report both read it). */
export function planOf(item) {
  return {
    n: item.n, slotId: item.slotId, section: item.section, sectionName: item.sectionName, label: item.label,
    source: item.source, id: item.id, cardId: item.cardId, template: item.template, seed: item.seed,
    params: item.params, partIds: item.partIds, skill: item.skill, skills: item.skills, tier: item.tier,
  };
}

/**
 * startRun(save, opts) → { n, run } — appends an OPEN run. Call inside `update()`.
 * opts: { kind, index, seed, pred, plan (a buildPlan result), replayOf (run index), now }
 */
export function startRun(save, { kind = 'mock', index = null, seed = null, pred = null, plan = null, replayOf = null, now = Date.now() } = {}) {
  const spec = kindOf(kind);
  if (!Array.isArray(save.runs)) save.runs = [];
  const source = replayOf != null && isMockRun(save.runs[replayOf])
    ? { kind: runKind(save.runs[replayOf]), seed: save.runs[replayOf].seed, items: save.runs[replayOf].items.map(planOf), index: save.runs[replayOf].no }
    : null;
  const built = source || plan || buildPlan(save, { kind: spec.kind, index, seed });
  const k = source ? source.kind : spec.kind;
  const run = {
    kind: k,
    no: source ? nextIndex(save, k) : (built.index ?? nextIndex(save, k)),
    seed: built.seed,
    n: built.items.length,
    limitMs: kindOf(k).limitMs,
    startedAt: now,
    submittedAt: null,
    status: 'open',
    pred: Number.isFinite(pred) ? clamp(Math.round(pred), 0, 100) : null,
    retry: replayOf != null,
    replayOf: replayOf != null ? replayOf : null,
    tabAway: 0,
    idx: 0,
    items: built.items.map(itemRecord),
  };
  save.runs.push(run);
  return { n: save.runs.length - 1, run };
}

/** Write one part's answer onto an item (call inside `update()`); true when anything actually moved. */
export function setItemAnswer(item, partId, { raw = null, values = null } = {}) {
  if (!isObj(item) || !partId) return false;
  if (!isObj(item.answers)) item.answers = {};
  const next = { raw: clipRaw(raw), values: clipRaw(values) };
  if (JSON.stringify(item.answers[partId] ?? null) === JSON.stringify(next)) return false;
  item.answers[partId] = next;
  return true;
}

/** Write one part's answer into an open run (call inside `update()`). */
export function setAnswer(run, i, partId, answer) {
  return setItemAnswer(run?.items?.[i], partId, answer);
}

/** JSON-safe, size-bounded copy of whatever a widget's raw() / values() returned. */
export function clipRaw(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') return raw.slice(0, 400);
  if (typeof raw === 'number' || typeof raw === 'boolean') return raw;
  try {
    const s = JSON.stringify(raw);
    if (s === undefined) return null;
    return s.length > 2000 ? null : JSON.parse(s);
  } catch { return null; }
}

/** Has the student put anything into this item? */
export function answered(item) {
  if (!isObj(item)) return false;
  for (const a of Object.values(item.answers || {})) if (!isBlankRaw(a?.raw)) return true;
  return false;
}

export function isBlankRaw(raw) {
  if (raw == null) return true;
  if (typeof raw === 'string') return raw.trim() === '';
  if (Array.isArray(raw)) return raw.length === 0 || raw.every(x => isBlankRaw(x));
  if (typeof raw === 'object') return Object.values(raw).every(v => isBlankRaw(v));
  return false;
}

/** { unanswered, flagged, answered } for the confirm dialog. */
export function runStatus(run) {
  const items = Array.isArray(run?.items) ? run.items : [];
  const done = items.filter(answered).length;
  return { total: items.length, answered: done, unanswered: items.length - done, flagged: items.filter(i => i.flagged).length };
}

/* ------------------------------------------------------------------ grading (pure) */

/** Resolve the figure model an item's `pairs` grader needs (null for a text item). */
export function modelFor(raw, M) {
  const f = raw?.figure;
  if (!f) return null;
  try {
    if (f.spec) return M.T.modelOf(raw);
    const fig = getFigure(f.id);
    return fig ? M.FM.resolve(fig, f) : null;
  } catch { return null; }
}

/**
 * gradeRun(run, M, opts) → items[] with `parts`, `credit` and `raw` filled in.
 * Pure (no save writes, no DOM). The Mock's ctx is `{ mock:true }`, which makes every grader strict and
 * gives an `equation` slot 40 % of the item through `combineCredit` (S3 / S7).
 */
export function gradeRun(run, M, { settings = {} } = {}) {
  const out = [];
  for (const item of run.items) {
    const plan = planOf(item);
    let built = null;
    try { built = itemFor(plan, M.T.generate); } catch { built = null; }
    if (!built) { out.push({ ...item, parts: [], credit: 0, raw: null }); continue; }
    const model = modelFor(built.raw, M);
    const entries = [];
    const parts = [];
    const rawOut = {};
    let roots = null;
    for (const part of built.parts) {
      const a = item.answers?.[part.id];
      const raw = a ? a.raw : null;
      rawOut[part.id] = raw;
      const ctx = {
        card: built.raw, state: {}, seed: String(item.seed || item.id || item.cardId || ''),
        mode: 'mock', mock: true, strictGCF: true, settings, misconceptions: built.raw.misconceptions,
        figure: built.raw.figure || null, model, terms: TERMS, roots,
      };
      const res = isBlankRaw(raw)
        ? { ok: false, kind: 'wrong', credit: 0, msg: 'Not answered.', tags: [], normalized: null, blank: true }
        : M.G.grade(part, raw, ctx);
      if (part.type === 'roots' && Array.isArray(res.found)) roots = res.found.slice();
      entries.push({ part, result: res });
      parts.push({
        id: part.id, type: part.type, credit: Math.max(0, Math.min(1, res.credit || 0)),
        kind: res.blank ? 'blank' : res.kind, ok: !!res.ok,
        tags: (res.tags || []).slice(0, 3),
        share: part.type === 'equation' ? 0.4 : null,
      });
    }
    const credit = entries.length ? M.G.combineCredit(entries, { mock: true }) : 0;
    out.push({ ...item, raw: rawOut, parts, credit: Math.max(0, Math.min(1, credit)), clean: credit >= 1 });
  }
  return out;
}

/** S4: Mock submitted +150 · accuracy bonus round(300 × acc²) · PB beaten +200 — once per seed. */
export function mockXp(save, run, { accuracy }) {
  if (run.retry) return { xp: 0, reason: 'retry — same seed pays no XP', submit: 0, acc: 0, pb: 0, pbBeaten: false };
  const runs = Array.isArray(save.runs) ? save.runs : [];
  const paid = runs.some(r => isMockRun(r) && r !== run && r.status === 'done' && r.seed === run.seed && (r.xp || 0) > 0);
  if (paid) return { xp: 0, reason: 'this seed has already paid XP', submit: 0, acc: 0, pb: 0, pbBeaten: false };
  const best = runs
    .filter(r => isMockRun(r) && r !== run && r.status === 'done' && runKind(r) === runKind(run) && !r.retry)
    .reduce((b, r) => Math.max(b, Number(r.accuracy) || 0), 0);
  const pbBeaten = accuracy > best && runs.some(r => isMockRun(r) && r !== run && r.status === 'done' && runKind(r) === runKind(run));
  const submit = XP_SUBMIT;
  const acc = Math.round(XP_ACC * accuracy * accuracy);
  const pb = pbBeaten ? XP_PB : 0;
  return { xp: submit + acc + pb, submit, acc, pb, pbBeaten, reason: '' };
}

/* ------------------------------------------------------------------ submit (idempotent) */

/**
 * submitRun(save, n, opts) → the finished run. Idempotent: a run already `done` is returned untouched
 * (S6 "submit is idempotent, guarded by runs[n].status"). Call inside `update()`.
 */
export function submitRun(save, n, { M, now = Date.now(), auto = false, today = todayISO() } = {}) {
  const run = save.runs?.[n];
  if (!isMockRun(run)) return null;
  if (run.status === 'done') return run;          // idempotent (S6 "guarded by runs[n].status")
  if (!M || !M.G || !M.T) throw new TypeError('submitRun: pass the lazy modules — `await mods()`');

  const graded = gradeRun(run, M, { settings: save.settings || {} });
  const s = scoreOf(graded, { count: run.n });
  run.items = graded.map(it => { const { answers, ...rest } = it; return rest; });
  run.status = 'done';
  run.submittedAt = now;
  run.auto = !!auto;
  run.points = s.points; run.pointsMax = s.pointsMax;
  run.score = s.score; run.scoreMax = s.scoreMax;
  run.accuracy = s.accuracy; run.acc = s.accuracy; run.scorePct = s.score;   // readiness.js + trophies.js spellings
  run.ms = elapsedMs(run, now);

  const x = mockXp(save, run, { accuracy: s.accuracy });
  run.xp = x.xp;
  run.xpInfo = { submit: x.submit, acc: x.acc, pb: x.pb, pbBeaten: x.pbBeaten, reason: x.reason };
  if (x.xp > 0) {
    save.xp = (Number(save.xp) || 0) + x.xp;
    const d = dailyRow(save, today);
    d.xp = (Number(d.xp) || 0) + x.xp;
  }
  dailyRow(save, today).mockDone = true;

  applyMisses(save, run, { now, today });
  return run;
}

function dailyRow(save, today) {
  if (!isObj(save.daily)) save.daily = {};
  const d = save.daily[today] ?? (save.daily[today] = { xp: 0, clears: 0, goalMet: false });
  return d;
}

/**
 * S7: "Every miss → bucket 0 + error log; Mastered skills that missed drop to 69."
 * A miss is an item with credit < 1 (partial credit is still a miss — the test scores it that way).
 */
export function applyMisses(save, run, { now = Date.now(), today = todayISO() } = {}) {
  const testAt = testAtOf(save);
  if (!isObj(save.skills)) save.skills = {};

  // Mastery moves ONCE per skill per paper, judged on the state the run started in — twenty items must
  // not compound into twenty EMA hits on one skill (S4 reads "a Mock miss on a Mastered skill drops m
  // to 69", singular).
  const missedSkills = new Set();
  for (const item of run.items) if (!(item.credit >= 1)) for (const sid of item.skills || []) missedSkills.add(sid);
  for (const sid of missedSkills) {
    const rec = save.skills[sid] ?? (save.skills[sid] = freshSkill());
    save.skills[sid] = isMastered(rec) ? mockMiss(rec) : updateSkill(rec, 0, { at: now });
  }

  for (const item of run.items) {
    if (item.credit >= 1) continue;
    if (item.cardId) {
      const rec = applySchedule(save, item.cardId, 'wrong', { now, testAt });
      if (rec) rec.due = clampDue(rec.due, { now, testAt });
      recordRematch(save, {
        item: item.cardId, seed: item.seed || null, template: item.template || null, forCard: item.cardId,
        got: shortRaw(item.raw), tags: (item.parts || []).flatMap(p => p.tags || []).slice(0, 3), now,
      });
    } else if (item.template) {
      recordRematch(save, {
        item: item.id || `${item.template}#${item.seed}`, seed: item.seed, template: item.template, forCard: null,
        got: shortRaw(item.raw), tags: (item.parts || []).flatMap(p => p.tags || []).slice(0, 3), now,
      });
    }
  }
}

function shortRaw(raw) {
  if (raw == null) return '';
  const parts = isObj(raw) ? Object.values(raw) : [raw];
  return parts.map(v => (typeof v === 'string' ? v : JSON.stringify(v ?? ''))).filter(Boolean).join(' · ').slice(0, 200);
}

/** Counters the Mock owns a call site for (notes/INTEGRATION-W3 §5 item 2). */
export function bumpCounters(save, run) {
  for (const item of run.items) {
    for (const p of item.parts || []) {
      if (p.credit < 1) continue;
      if (p.type === 'equation') bump(save, 'setups');
      if (p.type === 'reject') bump(save, 'rejects');
      if (p.type === 'roots' && item.cardId === 'ang-10') bump(save, 'bothRoots');
      if (p.type === 'cases' && item.cardId === 'ang-05') bump(save, 'twoCases');
    }
    const full = item.credit >= 1;
    if ((item.skills || []).includes('SYS') && full) bump(save, 'systems');
    if ((item.cardId === 'fac-16' || item.template === 'T-factor-neg') && full) bump(save, 'signLead');
    if (/^not-/.test(item.cardId || '') || item.template === 'T-notation') {
      if (full) bump(save, 'notationClean'); else resetRun(save, 'notationClean');
    }
  }
}

/* ------------------------------------------------------------------ per-skill report table */

/** [{ id, name, items, points, max, pct }] over a finished run, worst first. */
export function perSkill(run) {
  const rows = new Map();
  for (const item of run.items || []) {
    const ids = (item.skills || []).length ? item.skills : [item.skill].filter(Boolean);
    for (const id of ids) {
      const row = rows.get(id) || { id, name: skillById[id]?.name ?? id, w: skillById[id]?.w ?? 0, items: 0, points: 0, max: 0 };
      row.items++;
      row.points += (item.credit || 0) * POINTS_PER_ITEM;
      row.max += POINTS_PER_ITEM;
      rows.set(id, row);
    }
  }
  return [...rows.values()]
    .map(r => ({ ...r, points: Math.round(r.points * 10) / 10, pct: r.max ? Math.round((r.points / r.max) * 100) : 0 }))
    .sort((a, b) => a.pct - b.pct || b.w - a.w || a.id.localeCompare(b.id));
}

/** The misses of a finished run, sorted by S7's `w × (1 − m/100)` (what "Drill what I missed" uses). */
export function missRows(save, run) {
  const rows = [];
  for (const item of run.items || []) {
    if (item.credit >= 1) continue;
    const id = (item.skills || [])[0] || item.skill;
    if (!id) continue;
    const rec = save?.skills?.[id];
    const m = Number(rec?.m) || 0;
    const w = skillById[id]?.w ?? 0;
    const row = rows.find(r => r.id === id);
    if (row) { row.count++; row.items.push(item.n); }
    else rows.push({ id, name: skillById[id]?.name ?? id, w, m, score: w * (1 - m / 100), count: 1, items: [item.n] });
  }
  return rows.sort((a, b) => b.score - a.score);
}

/** The calibration line: `predicted 88 → scored 81 (overconfident by 7)`. */
export function calibration(run) {
  if (!Number.isFinite(run?.pred)) return null;
  const delta = run.score - run.pred;
  const word = delta === 0 ? 'dead on' : delta < 0 ? `overconfident by ${-delta}` : `underconfident by ${delta}`;
  return { pred: run.pred, score: run.score, delta, word, text: `predicted ${run.pred} → scored ${run.score} (${word})` };
}

/* ------------------------------------------------------------------ the screen */

/** `screens['/mock']` — also the mount point T16's `#/run/baseline` should delegate to. */
export function mountMock(params = {}, query = null, ctx = null) {
  const q = (k) => (query && typeof query.get === 'function' ? query.get(k) : null);
  const kind = (params.kind === 'baseline' || ctx?.mode === 'baseline' || q('kind') === 'baseline') ? 'baseline' : 'mock';
  const replay = q('replay') != null ? Number(q('replay')) : null;
  return (el) => {
    const view = createMockView(el, { kind, replay: Number.isInteger(replay) ? replay : null, autostart: q('go') === '1' });
    return () => view.destroy();
  };
}

export function createMockView(host, opts = {}) {
  const o = { kind: 'mock', replay: null, autostart: false, ...opts };
  const spec = kindOf(o.kind);
  const doc = host.ownerDocument || document;

  // NOT `.screen`: that caps max-width at --col and would squash the question-map rail at ≥1024 px
  // (the same defect T10 found on Home). #view already carries the col+rail max-width from base.css.
  const root = h('section.mock-screen', { dataset: { phase: 'rules', kind: spec.kind }, 'aria-busy': 'true' });
  host.append(root);

  const st = {
    destroyed: false, phase: 'rules', n: null, run: null, idx: 0, M: null,
    mounted: null, timer: null, saver: null, lastAt: Date.now(), pred: 70, dirty: false, submitting: false,
  };

  const listeners = [];
  const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); listeners.push(() => el.removeEventListener(ev, fn, opt)); };

  let dock = null;

  /* ---------------- rules phase ---------------- */

  function renderRules() {
    st.phase = 'rules';
    root.dataset.phase = 'rules';
    root.replaceChildren();
    const save = getState();
    const resume = openRun(save);
    const resumable = resume && runKind(resume.run) === spec.kind && !expired(resume.run);
    const stale = resume && expired(resume.run);
    const idx = nextIndex(save, spec.kind);
    const late = spec.kind === 'mock' && localHour() >= LATE_HOUR;

    const card = h('article.mock-rules');

    // r1: an OPEN paper gets its own card — with ITS ordinal in the heading and Resume as the first thing
    // on screen — instead of a fresh "Mock #n+1" rules card with the resume block below the fold.
    if (stale || resumable) {
      const rk = kindOf(runKind(resume.run));
      const no = resume.run.no ?? idx;
      const sstat = runStatus(resume.run);
      const nameOf = (r) => (rk.kind === 'baseline' ? 'Baseline' : `Mock #${no}`);
      if (stale) {
        card.append(
          h('p.mock-eyebrow.muted.fs-1', 'Out of time'),
          h('h1.mock-title', `${nameOf()} · time's up`),
          h('p.mock-sub', `Your ${rk.label.toLowerCase()} ran out of time while the tab was closed — it will be graded exactly as it stood: ${sstat.answered}/${sstat.total} answered.`));
        const b = h('button.btn.btn-primary.mock-start', { type: 'button' }, 'Grade it and see the report');
        on(b, 'click', () => finishStale(resume.n));
        card.append(b);
      } else {
        const left = remainingMs(resume.run);
        const k = clamp((Number(resume.run.idx) || 0) + 1, 1, sstat.total || 1);
        card.append(
          h('p.mock-eyebrow.muted.fs-1', 'Exam conditions'),
          h('h1.mock-title', `${nameOf()} · in progress`),
          h('p.mock-resume-stats',
            h('span', h('span.mono', fmtClock(left)), ' left'),
            h('span', h('span.mono', `${sstat.answered}/${sstat.total}`), ' answered'),
            sstat.flagged ? h('span', h('span.mono', String(sstat.flagged)), ' flagged') : null,
            h('span', 'back on question ', h('span.mono', String(k)))),
          h('p.mock-sub.muted', 'The clock kept running while the tab was closed. No hints, no feedback until you submit — same paper, same seed.'));
        const b = h('button.btn.btn-primary.mock-start', { type: 'button' }, `Resume · ${fmtClock(left)} left`);
        on(b, 'click', () => enterRun(resume.n));
        card.append(b);
        const b2 = h('button.btn.btn-ghost', { type: 'button' }, 'Submit it as it stands');
        on(b2, 'click', () => doSubmit(resume.n, { auto: false, force: true }));
        card.append(b2);
      }
      card.append(h('p.mock-back', h('a.btn.btn-ghost', { href: '#/today' }, 'Not now')));
      root.append(card);
      root.setAttribute('aria-busy', 'false');
      return;
    }

    card.append(
      h('p.mock-eyebrow.muted.fs-1', spec.kind === 'baseline' ? 'Day one' : 'Exam conditions'),
      h('h1.mock-title', spec.kind === 'baseline' ? 'Baseline' : `Mock #${idx}`),
      h('p.mock-sub', spec.kind === 'baseline'
        ? `${spec.items} items · ${spec.limitMs / 60000} minutes · scored into Readiness at ×0.8 so the number stops being provisional.`
        : `${spec.items} items · ${spec.limitMs / 60000} minutes · the whole packet, in the doc's order.`),
    );

    const secs = h('ul.mock-secs');
    for (const s of sectionsFor(spec.kind)) {
      secs.append(h('li.mock-sec', h('span.mock-sec-l.mono', s.id), h('span.mock-sec-n', s.name), h('span.mock-sec-c.muted.fs-1', `${s.count}`)));
    }
    card.append(secs);

    const rules = h('ul.mock-rulelist');
    for (const line of [
      'No hints. No solutions. No feedback until you submit.',
      'Every answer stays editable until you press SUBMIT.',
      'Scratch space on every item — it is never graded, and the report shows it beside the worked solution.',
      'Flag anything you want to come back to (⚑ or the F key).',
      'The clock is wall-clock: it keeps running if you close the tab, and submits for you at 0:00.',
    ]) rules.append(h('li', line));
    card.append(rules);

    // --- predict your score (S7 "Before start: Predict your score slider") ---
    const r0 = (() => { try { return readiness(save).r; } catch { return 70; } })();
    st.pred = clamp(Math.round(r0 || 70), 5, 95);
    const out = h('output.mock-pred-n.mono', { for: 'mock-pred' }, String(st.pred));
    // `h()`'s selector grammar is tag.class…#id — an `#id` written before a class silently falls back to
    // a <div>, so the id goes through the attribute map where it cannot be mis-parsed.
    const slider = h('input.mock-pred-range', {
      id: 'mock-pred', type: 'range', min: '0', max: '100', step: '1', value: String(st.pred),
      'aria-label': 'Predict your score out of 100',
    });
    on(slider, 'input', () => { st.pred = Number(slider.value); out.textContent = String(st.pred); band.textContent = predWord(st.pred); });
    const band = h('span.mock-pred-word.muted.fs-1', predWord(st.pred));
    card.append(h('div.mock-pred',
      h('label.mock-pred-h', { for: 'mock-pred' }, 'Call your shot — what will you score?'),
      h('div.mock-pred-row', out, h('span.mock-pred-of.muted', '/ 100')),
      slider,
      h('div.mock-pred-scale.muted.fs-1', h('span', '0'), band, h('span', '100')),
      h('p.mock-pred-note.muted.fs-1', 'The report compares this with what you actually scored. Being wrong about it is the useful part.')));

    if (late) {
      card.append(h('p.mock-warn', { dataset: { tone: 'warn' } },
        `${spec.limitMs / 60000} minutes runs past 22:00 — start anyway?`));
    }

    const start = h('button.btn.btn-primary.mock-start', { type: 'button' }, late ? 'Start anyway' : `Start the ${spec.label.toLowerCase()}`);
    on(start, 'click', () => begin());
    card.append(start);
    card.append(h('p.mock-back', h('a.btn.btn-ghost', { href: '#/today' }, 'Not now')));

    root.append(card);
    root.setAttribute('aria-busy', 'false');
    if (o.autostart) begin();
  }

  function predWord(v) {
    if (v >= 85) return 'Locked in';
    if (v >= 70) return 'Ready';
    if (v >= 50) return 'Getting there';
    return 'Not ready';
  }

  function localHour(d = new Date()) { return d.getHours() + d.getMinutes() / 60; }

  /* ---------------- start / resume ---------------- */

  function begin() {
    let n = null;
    update((s) => {
      const started = startRun(s, { kind: spec.kind, pred: o.replay != null ? null : st.pred, replayOf: o.replay });
      n = started.n;
    });
    flush();
    enterRun(n);
  }

  async function finishStale(n) {
    await doSubmit(n, { auto: true, force: true });
  }

  async function enterRun(n) {
    st.n = n;
    st.phase = 'run';
    root.dataset.phase = 'run';
    root.replaceChildren(h('p.muted.mock-loading', 'Opening the paper…'));
    st.M = await mods();
    if (st.destroyed) return;
    const save = getState();
    st.run = save.runs[n];
    if (!isMockRun(st.run)) { renderRules(); return; }
    if (expired(st.run)) { doSubmit(n, { auto: true }); return; }
    st.idx = clamp(Number(st.run.idx) || 0, 0, st.run.items.length - 1);
    buildRunUI();
    await showItem(st.idx, { focus: false });
    startTimers();
  }

  /* ---------------- run UI ---------------- */

  let bar, clockEl, countEl, flagBtn, mapBtn, submitBtn, body, mapEl, mapList, sheetBackdrop, progEl;

  function buildRunUI() {
    root.replaceChildren();
    clockEl = h('span.mock-clock.mono', { role: 'timer', 'aria-live': 'off' }, '—:—');
    countEl = h('span.mock-count.mono', '1 / 1');
    progEl = h('div.mock-prog', h('i.mock-prog-fill'));
    flagBtn = h('button.mock-flag', { type: 'button', 'aria-pressed': 'false', title: 'Flag this question (F)' }, h('span.mock-flag-g', { 'aria-hidden': 'true' }, '⚑'), h('span.sr-only', 'Flag this question'));
    mapBtn = h('button.mock-mapbtn', { type: 'button', 'aria-expanded': 'false' }, 'Map');
    submitBtn = h('button.btn.btn-primary.mock-submit', { type: 'button' }, 'SUBMIT');
    bar = h('div.mock-bar',
      h('div.mock-bar-l', clockEl, countEl),
      h('div.mock-bar-r', flagBtn, mapBtn, submitBtn),
      progEl);

    body = h('div.mock-body');
    mapList = h('ol.mock-map-list', { 'aria-label': 'Question map' });
    mapEl = h('aside.mock-map', { hidden: false },
      h('div.mock-map-handle', { 'aria-hidden': 'true' }),
      h('h2.mock-map-h', 'Question map'),
      mapList,
      h('p.mock-map-legend.muted.fs-1',
        h('span.mock-legend', h('i.mock-dot', { dataset: { s: 'done' } }), 'answered'), ' ',
        h('span.mock-legend', h('i.mock-dot', { dataset: { s: 'flag' } }), 'flagged'), ' ',
        h('span.mock-legend', h('i.mock-dot', { dataset: { s: 'open' } }), 'blank')));
    sheetBackdrop = h('div.mock-sheet-backdrop', { hidden: true });

    const nav = h('nav.mock-nav',
      navBtn('prev', '← Prev', () => go(st.idx - 1)),
      h('span.mock-nav-mid.muted.fs-1', ''),
      navBtn('next', 'Next →', () => go(st.idx + 1)));

    root.append(bar, h('div.mock-main', h('div.col', body, nav), h('div.rail', mapEl)), sheetBackdrop);
    root.classList.add('with-rail');

    // The dock is the KEY ROW only, and only while a text field has focus: on a phone the exam's own
    // bottom bar (Prev / Next) is the navigation, and a second permanent bar would eat a third of the
    // screen. Submit lives in the sticky top bar, where it cannot be hit by a thumb reaching for Next.
    dock = createDock({ keys: KEYS.full });
    dock.actions.replaceChildren();
    dock.hide();

    on(submitBtn, 'click', () => confirmSubmit());
    on(flagBtn, 'click', () => toggleFlag());
    on(mapBtn, 'click', () => toggleMap());
    on(sheetBackdrop, 'click', () => toggleMap(false));
    on(mapEl, 'click', (e) => {
      const b = e.target.closest?.('.mock-map-item');
      if (!b) return;
      go(Number(b.dataset.i));
      if (isPhone()) toggleMap(false);
    });
    let touchY = null;
    on(mapEl, 'touchstart', (e) => { touchY = e.touches[0]?.clientY ?? null; }, { passive: true });
    on(mapEl, 'touchend', (e) => {
      if (touchY == null) return;
      const dy = (e.changedTouches[0]?.clientY ?? touchY) - touchY;
      if (dy > 60 && isPhone()) toggleMap(false);
      touchY = null;
    });

    on(doc, 'keydown', onKey);
    on(doc, 'visibilitychange', onVisibility);
    on(body, 'focusin', (e) => { if (isTextField(e.target) && e.target.tagName === 'INPUT') dock.show(); });
    on(body, 'focusout', () => setTimeout(() => {
      const a = doc.activeElement;
      if (!(a && body.contains(a) && isTextField(a) && a.tagName === 'INPUT')) dock.hide();
    }, 120));
    on(body, 'w-input', () => capture({ soft: true }));
    // Enter in a text field means "done with this one" → the next question. A TAP on a choice widget
    // (asn / mc / classify all fire w-submit on the tap) must NOT jump: a mis-tap would carry the
    // student off a question they were still reading.
    on(body, 'w-submit', (e) => {
      e.stopPropagation();
      capture();
      // Inside a progressive roots → keep/reject → cases item, Enter means "next STAGE": jumping to the
      // next question there would silently abandon two thirds of a four-point item.
      const hnd = st.mounted?.handles.find((x) => x.box.contains(e.target));
      if (hnd && stepStage(hnd)) return;
      if (isTextField(doc.activeElement) && itemComplete()) go(st.idx + 1);
    });

    renderMap();
  }

  const isPhone = () => (typeof matchMedia === 'function' ? matchMedia('(max-width: 1023px)').matches : true);

  function navBtn(dir, label, fn) {
    const b = h(`button.mock-nav-btn.is-${dir}`, { type: 'button' }, label);
    on(b, 'click', fn);
    return b;
  }

  function toggleMap(force = null) {
    const open = force == null ? mapEl.dataset.open !== 'true' : !!force;
    mapEl.dataset.open = String(open);
    mapBtn.setAttribute('aria-expanded', String(open));
    sheetBackdrop.hidden = !(open && isPhone());
    if (open) {
      const cur = mapList.querySelector('.mock-map-item[aria-current="true"]');
      cur?.scrollIntoView?.({ block: 'center' });      // the sheet scrolls, not the page
      cur?.focus?.({ preventScroll: true });
    }
  }

  function renderMap() {
    if (!st.run) return;
    mapList.replaceChildren();
    let sec = null;
    st.run.items.forEach((item, i) => {
      if (item.section !== sec) {
        sec = item.section;
        mapList.append(h('li.mock-map-sec', h('span.mono', sec), ' ', item.sectionName || SECTION_NAME[sec] || ''));
      }
      const state = item.flagged ? 'flag' : answered(item) ? 'done' : 'open';
      mapList.append(h('li.mock-map-li', h('button.mock-map-item', {
        type: 'button', dataset: { i: String(i), s: state }, 'aria-current': String(i === st.idx),
        'aria-label': `Question ${i + 1}, ${state === 'done' ? 'answered' : state === 'flag' ? 'flagged' : 'blank'}`,
      }, String(i + 1))));
    });
  }

  /* ---------------- one item ---------------- */

  async function showItem(i, { focus = true } = {}) {
    if (!st.run) return;
    const n = clamp(i, 0, st.run.items.length - 1);
    st.idx = n;                                     // set first: capture() writes run.idx from it
    if (st.mounted) { capture(); destroyMounted(); }
    const item = st.run.items[n];
    const plan = planOf(item);
    let built = null;
    try { built = itemFor(plan, st.M.T.generate); } catch (e) { console.error('mock item', e); }
    body.replaceChildren();
    countEl.textContent = `${n + 1} / ${st.run.items.length}`;
    progEl.firstElementChild.style.width = `${((n + 1) / st.run.items.length) * 100}%`;
    flagBtn.setAttribute('aria-pressed', String(!!item.flagged));
    flagBtn.dataset.on = String(!!item.flagged);
    root.querySelector('.mock-nav-mid').textContent = `${item.section} · ${item.sectionName}`;
    root.querySelector('.is-prev').disabled = n === 0;
    root.querySelector('.is-next').disabled = n === st.run.items.length - 1;

    if (!built) {
      body.append(h('p.mock-err', 'This question could not be built. It scores 0 and the rest of the paper is unaffected.'));
      renderMap();
      return;
    }

    const norm = normalizeItem({ ...built.raw, parts: built.parts, pick: null }, { kind: item.source === 'card' ? 'card' : 'variant' });
    const head = h('header.mock-item-head',
      h('span.chip.mono', `${item.section}${slotNo(item)}`),
      h('span.mock-item-label', item.label || item.sectionName),
      h('span.mock-item-pts.muted.fs-1', `${POINTS_PER_ITEM} pts`));
    const paper = h('div.mock-paper');
    if (norm.instruction) paper.append(h('p.mock-instr.muted.fs-1', String(norm.instruction)));
    paper.append(h('p.mock-stem', { html: mathfmt(norm.stem) }));
    if (norm.note) paper.append(h('p.mock-note.muted.fs-1', String(norm.note)));

    const fig = figureFor(norm);
    if (fig) paper.append(h('div.mock-fig', fig));

    const partsHost = h('div.mock-parts');
    const groups = composeParts(norm.parts);
    await loadFor(groups);
    if (st.destroyed || st.idx !== n) return;

    const handles = [];
    for (const g of groups) {
      const box = h('div.mock-part', { dataset: { part: g.id || '', type: g.type } });
      const inner = h('div.mock-part-body');
      box.append(inner);
      partsHost.append(box);
      const saved = item.answers?.[g.id] ?? (g.type === 'rootcase' ? item.answers?.[g.roots?.id ?? ''] : null);
      const ctx = {
        card: built.raw, state: {}, keys: dock.keys, dock, figureEl: fig || null,
        figure: norm.figure || null, model: modelFor(built.raw, st.M),
        seed: String(item.seed || item.id || item.cardId || ''), mode: 'mock', mock: true, strictGCF: true,
        settings: getState().settings, terms: TERMS, misconceptions: norm.misconceptions, shortcuts: true,
        values: saved?.values ?? undefined,
      };
      if (g.type === 'rootcase') ctx.found = savedRoots(item, g, st.M);
      const w = mountPart(inner, g, ctx);
      const hnd = { group: g, w, box, step: null };
      handles.push(hnd);
      if (g.type === 'rootcase' && g.parts.length > 1) {
        const step = h('button.btn.mock-step', { type: 'button' }, 'Next step →');
        hnd.step = step;                                  // captured, not looked up at click time
        on(step, 'click', () => stepStage(hnd));
        box.append(h('div.mock-step-row', step));
      }
    }

    const scratch = h('textarea.mock-scratch', {
      rows: '3', maxlength: String(SCRATCH_MAX), placeholder: 'Working out — never graded.',
      'aria-label': 'Scratch for this question',
    });
    scratch.value = String(item.work || '');
    on(scratch, 'input', () => { st.dirty = true; });

    body.append(head, paper, partsHost, h('div.mock-scratch-wrap', h('p.mock-scratch-h.muted.fs-1', 'Scratch'), scratch));
    st.mounted = { i: n, handles, scratch };
    restoreStages(item, handles);
    for (const hnd of handles) refreshStep(hnd);
    renderMap();
    // A new question starts at the top of the page: the sticky bar sits under the header, so scrolling
    // the body "into view" would slide the item's own head (section, label, points) underneath it.
    try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch { /* no window */ }
    // r1: on a phone the first field is NOT auto-focused — a Next tap used to raise the key-row dock (and
    // the OS keyboard) for a field that sat below the fold under the figure; the field gets focus on the
    // student's own tap. Focus moves to the item head for screen readers instead. On a laptop the first
    // field keeps focus, scrolled into view when the figure pushed it under the fold.
    if (focus && !isPhone()) {
      handles[0]?.w?.focus?.();
      const a = doc.activeElement;
      if (a && body.contains(a) && isTextField(a)) {
        const r = a.getBoundingClientRect();
        if (r.bottom > window.innerHeight - (dock?.height?.() ?? 0) - 12) a.scrollIntoView({ block: 'center' });
      }
    } else if (focus) {
      head.tabIndex = -1;
      try { head.focus({ preventScroll: true }); } catch { /* no focus */ }
    }
  }

  /**
   * Advance one stage of a progressive rootcase item, carrying the roots the student actually typed into
   * the keep/reject and cases stages (they are graded later — nothing is revealed here). Returns false
   * when the handle is not a multi-stage item or is already on its last stage.
   */
  function stepStage(hnd) {
    if (!hnd || hnd.group?.type !== 'rootcase' || (hnd.group.parts?.length ?? 0) < 2) return false;
    const stages = hnd.w.stages?.() ?? [];
    const at = hnd.w.stage?.();
    if (!stages.length || stages.indexOf(at) >= stages.length - 1) return false;
    capture();
    const item = st.run.items[st.mounted.i];
    if (at === 'roots') hnd.w.setFound?.(gradeRoots(item, hnd.group, hnd.w));
    hnd.w.advance?.();
    capture();
    refreshStep(hnd);
    return true;
  }

  function refreshStep(hnd) {
    if (!hnd?.step) return;
    const stages = hnd.w.stages?.() ?? [];
    const last = stages.length ? stages.indexOf(hnd.w.stage?.()) >= stages.length - 1 : true;
    hnd.step.disabled = last;
    hnd.step.textContent = last ? 'Last step' : 'Next step →';
  }

  function slotNo(item) {
    const same = st.run.items.filter(x => x.section === item.section);
    return same.length > 1 ? String(same.indexOf(item) + 1) : '';
  }

  function figureFor(norm) {
    const f = norm.figure;
    if (!f) return null;
    try {
      if (f.spec) return st.M.SVG.element(f.spec, f);
      const fig = getFigure(f.id);
      return fig ? st.M.SVG.element(fig, f) : null;
    } catch (e) { console.error('figure', e); return null; }
  }

  /** Silently parse the roots the student typed so the reject / cases stages can be built from them. */
  function gradeRoots(item, group, w) {
    const part = group.roots;
    if (!part) return [];
    let raw = null;
    try { raw = w.raw(); } catch { raw = null; }
    if (isBlankRaw(raw)) raw = item.answers?.[part.id]?.raw ?? null;
    if (isBlankRaw(raw)) return [];
    try {
      const res = st.M.G.grade(part, raw, { card: item, state: {}, mock: true, strictGCF: true });
      return Array.isArray(res.found) ? res.found : [];
    } catch { return []; }
  }

  function savedRoots(item, group, M) {
    const part = group.roots;
    const raw = part ? item.answers?.[part.id]?.raw : null;
    if (isBlankRaw(raw)) return [];
    try {
      const res = M.G.grade(part, raw, { card: item, state: {}, mock: true, strictGCF: true });
      return Array.isArray(res.found) ? res.found : [];
    } catch { return []; }
  }

  /** Put a resumed multi-stage item back where it was: the roots text, then the saved stage. */
  function restoreStages(item, handles) {
    for (const hnd of handles) {
      const g = hnd.group;
      if (g.type !== 'rootcase' || !g.parts || g.parts.length < 2) continue;
      const rootsPart = g.roots;
      const savedRootsRaw = rootsPart ? item.answers?.[rootsPart.id]?.raw : null;
      if (!isBlankRaw(savedRootsRaw) && typeof savedRootsRaw === 'string') {
        const inp = hnd.box.querySelector('input');
        if (inp) { inp.value = savedRootsRaw; inp.dispatchEvent(new Event('input', { bubbles: true })); }
      }
      const order = g.parts.map(p => p.id);
      let target = 0;
      order.forEach((id, i) => { if (!isBlankRaw(item.answers?.[id]?.raw)) target = Math.max(target, i); });
      for (let i = 0; i < target; i++) hnd.w.advance?.({ focus: false });
    }
  }

  function destroyMounted() {
    if (!st.mounted) return;
    for (const hnd of st.mounted.handles) { try { hnd.w.destroy(); } catch { /* gone */ } }
    st.mounted = null;
  }

  /** Read every live widget into the run record. `soft` marks dirty without an immediate flush. */
  function capture({ soft = false } = {}) {
    if (!st.mounted || !st.run || st.submitting) return;
    const i = st.mounted.i;
    let moved = false;
    update((s) => {
      const run = s.runs[st.n];
      if (!isMockRun(run) || run.status !== 'open') return;
      const item = run.items[i];
      if (!item) return;
      for (const hnd of st.mounted.handles) {
        const g = hnd.group;
        let raw = null; let values = null;
        // The widget's own isEmpty() is the authority: several widgets answer raw() with a shape
        // (`{kind:'ray', pts:[]}`, `{value:''}`) that is not blank by inspection but means "untouched",
        // and the question map, the "N unanswered" count and the blank-vs-wrong report all read this.
        let empty = false;
        try { empty = !!hnd.w.isEmpty?.(); } catch { empty = false; }
        if (!empty) {
          try { raw = hnd.w.raw(); } catch { raw = null; }
          try { values = hnd.w.values?.() ?? null; } catch { values = null; }
        }
        if (g.type === 'rootcase') {
          const stage = hnd.w.stage?.() ?? g.parts[0].type;
          const part = g.parts.find(p => p.type === stage) || g.roots || g.parts[0];
          if (part && setItemAnswer(item, part.id, { raw, values })) moved = true;
        } else if (setItemAnswer(item, g.id, { raw, values })) moved = true;
      }
      const work = String(st.mounted.scratch?.value ?? '').slice(0, SCRATCH_MAX);
      if (work !== item.work) { item.work = work; moved = true; }
      if (run.idx !== st.idx) { run.idx = st.idx; moved = true; }   // resume where the student IS
    });
    if (moved) { renderMap(); st.dirty = true; }
    if (!soft && st.dirty) { flush(); st.dirty = false; }
  }

  function itemComplete() {
    if (!st.mounted) return false;
    return st.mounted.handles.every(hnd => { try { return !hnd.w.isEmpty(); } catch { return true; } });
  }

  function go(i) {
    if (!st.run) return;
    const n = clamp(i, 0, st.run.items.length - 1);
    if (n === st.idx && st.mounted) return;
    showItem(n);
  }

  function toggleFlag() {
    if (!st.run) return;
    const i = st.idx;
    update((s) => {
      const run = s.runs[st.n];
      const item = run?.items?.[i];
      if (item) item.flagged = !item.flagged;
    });
    st.run = getState().runs[st.n];
    const on_ = !!st.run.items[i].flagged;
    flagBtn.setAttribute('aria-pressed', String(on_));
    flagBtn.dataset.on = String(on_);
    renderMap();
    flush();
  }

  /* ---------------- timer + autosave ---------------- */

  function startTimers() {
    stopTimers();
    tick();
    st.timer = setInterval(tick, TICK_MS);
    st.saver = setInterval(() => capture(), AUTOSAVE_MS);   // capture() flushes when anything moved
  }

  function stopTimers() {
    if (st.timer) clearInterval(st.timer);
    if (st.saver) clearInterval(st.saver);
    st.timer = st.saver = null;
  }

  function tick() {
    if (!st.run || st.submitting) return;
    const left = remainingMs(st.run);
    clockEl.textContent = fmtClock(left);
    clockEl.setAttribute('aria-label', `${fmtClock(left)} left`);
    if (dialogEl && dialogSub && dialogSubEl) dialogSubEl.textContent = dialogSub();   // r2: the dialog's clock ticks too
    const state = left <= 0 ? 'out' : left <= PULSE_MS ? 'pulse' : left <= AMBER_MS ? 'amber' : 'ok';
    if (clockEl.dataset.t !== state) {
      clockEl.dataset.t = state;
      if (state === 'amber') announce('1 minute left');
      if (state === 'pulse') announce('10 seconds left');
    }
    if (left <= 0) doSubmit(st.n, { auto: true });
  }

  let liveEl = null;
  function announce(text) {
    if (!liveEl) { liveEl = h('p.sr-only', { role: 'status', 'aria-live': 'polite' }); root.append(liveEl); }
    liveEl.textContent = text;
  }

  function onVisibility() {
    if (doc.visibilityState === 'hidden') {
      capture();
      update((s) => { const run = s.runs[st.n]; if (run && run.status === 'open') run.tabAway = (run.tabAway || 0) + 1; });
      flush();
    } else if (st.run && st.phase === 'run') {
      st.run = getState().runs[st.n];
      tick();
    }
  }

  function onKey(e) {
    if (st.phase !== 'run' || e.metaKey || e.ctrlKey || e.altKey) return;
    const inField = isTextField(e.target);
    if (e.key === 'Escape') { if (mapEl?.dataset.open === 'true') { toggleMap(false); e.preventDefault(); } return; }
    if (inField) return;
    if (e.key.toLowerCase() === 'f') { e.preventDefault(); toggleFlag(); }
    else if (e.key.toLowerCase() === 'm') { e.preventDefault(); toggleMap(); }
    // r1: no letter shortcuts for prev/next — `N` is the ASN widget's "Never" (S5 keyboard contract) and
    // used to jump to the next question with the item left blank. ← / → navigate.
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(st.idx + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(st.idx - 1); }
  }

  /* ---------------- submit ---------------- */

  function confirmSubmit() {
    capture();
    const s = runStatus(getState().runs[st.n]);
    const bits = [];
    if (s.unanswered) bits.push(`${s.unanswered} unanswered`);
    if (s.flagged) bits.push(`${s.flagged} flagged`);
    const line = bits.length ? `${bits.join(', ')} — submit anyway?` : 'Everything answered. Submit?';
    openDialog({
      title: 'Submit the paper?',
      body: line,
      sub: () => `${fmtClock(remainingMs(st.run))} still on the clock.`,   // r2: a function — tick() keeps it live
      ok: 'SUBMIT',
      onOk: () => doSubmit(st.n, { auto: false }),
    });
  }

  let dialogEl = null, dialogSub = null, dialogSubEl = null;
  function openDialog({ title, body: text, sub, ok, onOk }) {
    closeDialog();
    const okBtn = h('button.btn.btn-primary', { type: 'button' }, ok);
    const cancel = h('button.btn', { type: 'button' }, 'Keep working');
    // r2: `sub` may be a function — the SUBMIT dialog's "still on the clock" line then ticks with the bar
    dialogSub = typeof sub === 'function' ? sub : null;
    const subText = dialogSub ? dialogSub() : sub;
    dialogSubEl = subText ? h('p.mock-dialog-s.muted.fs-1', subText) : null;
    dialogEl = h('div.mock-dialog', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div.mock-dialog-card',
        h('h2.mock-dialog-h', title),
        h('p.mock-dialog-b', text),
        dialogSubEl,
        h('div.mock-dialog-row', cancel, okBtn)));
    on(okBtn, 'click', () => { closeDialog(); onOk(); });
    on(cancel, 'click', () => closeDialog());
    on(dialogEl, 'click', (e) => { if (e.target === dialogEl) closeDialog(); });
    root.append(dialogEl);
    okBtn.focus();
  }

  function closeDialog() { if (dialogEl) { dialogEl.remove(); dialogEl = null; } dialogSub = null; dialogSubEl = null; }

  async function doSubmit(n, { auto = false, force = false } = {}) {
    if (st.submitting) return;
    st.submitting = true;
    stopTimers();
    closeDialog();
    if (!force && st.mounted) capture();
    st.M = st.M || await mods();
    if (st.destroyed) return;
    let run = null;
    update((s) => {
      run = submitRun(s, n, { M: st.M, auto });
      if (run) bumpCounters(s, run);
    });
    flush();
    destroyMounted();
    bus.emit('graded', { kind: 'mock', run });
    bus.emit('mock:submitted', { n, run });
    navigate(`/mock/report/${n}`, { replace: true });
  }

  /* ---------------- lifecycle ---------------- */

  function destroy() {
    st.destroyed = true;
    stopTimers();
    try { if (st.phase === 'run' && st.run && st.run.status === 'open') { capture(); flush(); } } catch { /* nothing */ }
    destroyMounted();
    closeDialog();
    for (const off of listeners) off();
    try { dock?.destroy(); } catch { /* gone */ }
    root.remove();
  }

  if (o.replay != null) begin();
  else renderRules();

  return { el: root, destroy, state: st };
}

/** `#/run/baseline` — T16's run.js delegates here (notes/T16 `delegateRun` looks for this name first). */
export function mountBaseline(params = {}, query = null) {
  return mountMock({ ...params, kind: 'baseline' }, query);
}

export default mountMock;
