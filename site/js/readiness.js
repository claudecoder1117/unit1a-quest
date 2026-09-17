// readiness.js — the hero number (COMPOSED S4 "Readiness", S7 "Weak spots"). Pure, DOM-free.
//
//   R = round(100 × (0.5·M + 0.3·A + 0.2·C))
//     M = Σ w · m_shown / 100 over the 19 skills (weights sum to 100)          → 0..1
//     A = accuracy of the most recent Mock (× 0.8 for a mini-mock: Baseline, Night Before)  → 0..1
//     C = fraction of non-bonus bank items cleared at least once (the Binder fill)          → 0..1
//   Until a Mock or Baseline exists the A term is NOT scored as zero:
//     R = round(100 × (0.5·M + 0.2·C) / 0.7)   labelled "provisional — take a Mock to lock it", ring dashed.
//   Bands: < 50 Not ready · 50–69 Getting there · 70–84 Ready · ≥ 85 Locked in.
//   Logged daily to forecastLog[] (7-day sparkline); the Page Summary shows the delta.
//
// Both formulas are printed in Settings (T15 reads FORMULA_FULL / FORMULA_PROVISIONAL below).

import { skills, TOTAL_WEIGHT } from '../data/skills.js';
import { manifestIds } from '../data/source-manifest.js';
import { todayISO } from './days.js';
import { mShown, isMastered } from './schedule.js';

export const WEIGHTS = Object.freeze({ M: 0.5, A: 0.3, C: 0.2 });
export const MINI_MOCK_FACTOR = 0.8;
export const MINI_KINDS = Object.freeze(['baseline', 'night']);     // run kinds scored × 0.8
export const MOCK_KINDS = Object.freeze(['mock', 'baseline', 'night']);
export const BANDS = Object.freeze([
  { min: 85, label: 'Locked in', key: 'locked' },
  { min: 70, label: 'Ready', key: 'ready' },
  { min: 50, label: 'Getting there', key: 'getting' },
  { min: 0, label: 'Not ready', key: 'not' },
]);
export const WEAK_THRESHOLD = 70;   // m_shown < 70 ∧ n ≥ 1
export const WEAK_MAX = 5;
export const FORMULA_FULL = 'R = round(100 × (0.5·M + 0.3·A + 0.2·C))';
export const FORMULA_PROVISIONAL = 'R = round(100 × (0.5·M + 0.2·C) / 0.7)   — provisional, until a Mock or Baseline exists';
export const PROVISIONAL_LABEL = 'provisional — take a Mock to lock it';

const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const BANK_IDS = manifestIds({ bonus: false });   // the 164 non-bonus ids: what C counts

/* ---------------- the three terms ---------------- */
/** M = Σ w · m_shown / 100 / Σ w  → 0..1 (weights sum to 100). */
export function masteryTerm(save) {
  let acc = 0;
  for (const s of skills) acc += s.w * mShown(save?.skills?.[s.id]) / 100;
  return acc / TOTAL_WEIGHT;
}

/**
 * The most recent completed Mock-like run (kind `mock`, `baseline` or `night`, status `done`) — the
 * one whose accuracy scores A. A run's accuracy is `accuracy` (0..1) when the record carries it, else
 * `score / scoreMax` (scoreMax default 100). Returns null when none exists (→ provisional).
 */
export function latestMock(save) {
  const runs = Array.isArray(save?.runs) ? save.runs : [];
  for (let i = runs.length - 1; i >= 0; i--) {
    const r = runs[i];
    if (!isObj(r) || r.status !== 'done') continue;
    const kind = String(r.kind ?? '').split(':')[0];
    if (!MOCK_KINDS.includes(kind)) continue;
    const acc = accuracyOf(r);
    if (acc == null) continue;
    return { run: r, kind, accuracy: acc, mini: MINI_KINDS.includes(kind), at: r.submittedAt ?? r.startedAt ?? null };
  }
  return null;
}

/** 0..1 accuracy of a run record, or null when it carries no usable score. */
export function accuracyOf(run) {
  if (!isObj(run)) return null;
  if (Number.isFinite(run.accuracy)) return Math.max(0, Math.min(1, run.accuracy));
  if (Number.isFinite(run.score)) {
    const max = Number.isFinite(run.scoreMax) && run.scoreMax > 0 ? run.scoreMax : 100;
    return Math.max(0, Math.min(1, run.score / max));
  }
  return null;
}

/** A = accuracy of the latest Mock (× 0.8 for a mini-mock), or null when none exists. */
export function accuracyTerm(save) {
  const m = latestMock(save);
  if (!m) return null;
  return m.accuracy * (m.mini ? MINI_MOCK_FACTOR : 1);
}

/** Cleared-at-least-once for C: `cleared`, or any ok history entry (a Full 36 / BLITZ clear counts). */
export function isCleared(rec) {
  if (!isObj(rec)) return false;
  if (rec.cleared === true) return true;
  return Array.isArray(rec.history) && rec.history.some(h => h && h.ok === true);
}

/** C = fraction of the non-bonus bank cleared at least once. `ids` overrides the bank (tests). */
export function coverageTerm(save, ids = BANK_IDS) {
  if (!ids.length) return 0;
  let n = 0;
  for (const id of ids) if (isCleared(save?.cards?.[id])) n++;
  return n / ids.length;
}

export function coverageCount(save, ids = BANK_IDS) {
  let n = 0;
  for (const id of ids) if (isCleared(save?.cards?.[id])) n++;
  return { cleared: n, total: ids.length };
}

/* ---------------- the number ---------------- */
export function bandOf(r) {
  const v = Number.isFinite(r) ? r : 0;
  return BANDS.find(b => v >= b.min) ?? BANDS[BANDS.length - 1];
}

/**
 * readiness(save) → { r, provisional, M, A, C, band, label, mock }
 * `r` is the published integer; `A` is null while provisional; `label` is the provisional note or ''.
 */
export function readiness(save, { ids = BANK_IDS } = {}) {
  const M = masteryTerm(save);
  const C = coverageTerm(save, ids);
  const A = accuracyTerm(save);
  const provisional = A == null;
  const raw = provisional
    ? 100 * (WEIGHTS.M * M + WEIGHTS.C * C) / (WEIGHTS.M + WEIGHTS.C)
    : 100 * (WEIGHTS.M * M + WEIGHTS.A * A + WEIGHTS.C * C);
  const r = Math.max(0, Math.min(100, Math.round(raw)));
  const band = bandOf(r);
  return { r, provisional, M, A, C, band, label: provisional ? PROVISIONAL_LABEL : '', mock: latestMock(save) };
}

/* ---------------- forecast log ---------------- */
/**
 * Write today's Readiness into `forecastLog[]` (one point per day; today's point is replaced when it
 * changes). Returns { r, changed }. Call inside `update()` — it is a no-op write when nothing moved.
 */
export function logForecast(save, { today = todayISO(), r = readiness(save).r } = {}) {
  if (!Array.isArray(save.forecastLog)) save.forecastLog = [];
  const log = save.forecastLog;
  const last = log[log.length - 1];
  if (isObj(last) && last.day === today) {
    if (last.r === r) return { r, changed: false };
    last.r = r;
    return { r, changed: true };
  }
  const i = log.findIndex(e => isObj(e) && e.day === today);
  if (i >= 0) { const changed = log[i].r !== r; log[i].r = r; return { r, changed }; }
  log.push({ day: today, r });
  log.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  return { r, changed: true };
}

/** The last `days` points of the log (ascending), for the sparkline. */
export function sparkline(save, days = 7) {
  const log = Array.isArray(save?.forecastLog) ? save.forecastLog.filter(isObj) : [];
  return log.slice(-days);
}

/** Readiness delta vs the last logged day before today (for the Page Summary); null when unknown. */
export function readinessDelta(save, { today = todayISO(), r = readiness(save).r } = {}) {
  const log = Array.isArray(save?.forecastLog) ? save.forecastLog.filter(e => isObj(e) && e.day < today) : [];
  if (!log.length) return null;
  return r - log[log.length - 1].r;
}

/* ---------------- skills view + weak spots ---------------- */
/** One skill's state for a bar: { id, name, w, m, n, mShown, untested, placed, mastered, weak }. */
export function skillState(save, id) {
  const def = skills.find(s => s.id === id);
  if (!def) return null;
  const rec = save?.skills?.[id];
  const n = rec?.n ?? 0;
  const shown = mShown(rec);
  return {
    id, name: def.name, w: def.w, m: rec?.m ?? 0, n, mShown: shown,
    untested: n === 0, placed: !!rec?.placedAt, mastered: isMastered(rec),
    weak: n >= 1 && shown < WEAK_THRESHOLD,
    score: def.w * (1 - (rec?.m ?? 0) / 100),
  };
}

/** All 19 skills, in table order. */
export function skillStates(save) { return skills.map(s => skillState(save, s.id)); }

/**
 * Weak spots (S7): n ≥ 1 ∧ m_shown < 70 — an untested skill is never weak — at most 5, sorted by
 * w × (1 − m/100) desc (ties by table order). Each entry carries `drill: '#/run/drill/<id>'`.
 */
export function weakSpots(save, { max = WEAK_MAX } = {}) {
  return skillStates(save)
    .filter(s => s.weak)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(s => ({ ...s, drill: `#/run/drill/${s.id}` }));
}
