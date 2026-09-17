// readiness.js — the hero number (COMPOSED S4 "Readiness", S7 "Weak spots"). Pure, DOM-free.
//
//   R = round(100 × (0.5·M + 0.3·A + 0.2·C))
//     M = Σ w · m_shown / 100 over the 19 skills (weights sum to 100)          → 0..1
//     A = accuracy of the most recent Mock (× 0.8 for a mini-mock: Baseline, Night Before)  → 0..1
//     C = fraction of non-bonus bank items cleared at least once (the Binder fill)          → 0..1
//   Until a Mock or Baseline exists the A term is NOT scored as zero:
//     R = round(100 × (0.5·M + 0.2·C) / 0.7)   labelled "provisional — take a Mock to lock it", ring dashed,
//     and in THAT branch M runs over the skills tested so far (n ≥ 1) — `masteryTermTested` — because on
//     day 0 the 11 untested skills are unknowns, not zeros (S4 "untested is not weak"; home r1 fix of S9 #1:
//     an 8/8 aced placement read 27 under the all-19 M, it reads 57 under the tested-only M).
//   fix5:home r1 (S9 scorecard #1, "I got it right and my number went down"): inside that tested set a skill with
//     NO miss yet and no placement is "just started" — its low m_shown is the m = 0 starting point, not
//     evidence — so it counts toward the provisional M only where it RAISES it (M = the best weighted mean of
//     the verdict skills plus any subset of the just-started ones; the best subset is a prefix of them sorted
//     by m_shown). A clean answer can then never lower the provisional number, and Weak spots need a miss.
//   fix5:home r2: a correct answer that needed a HINT (mastery `helped`) is evidence too — such a skill always
//     counts, and can be a Weak spot, exactly like one with a miss (critic r1: 10 hinted answers read "just started").
//   fix5:home r3 (critic r2): "counts only where it raises M" alone let M become the single best skill (12 clean VOC
//     answers + 1 clean answer on 9 skills read 'Ready 71, mastery 99 %'). The provisional M now divides by an
//     EVIDENCE FLOOR: M = max over S ⊇ verdict of Σ_S w·m_shown/100 ÷ max(Σ_S w, W0), W0 = 30 of the 100 weight
//     points — a few lucky skills cannot stand in for the unit. Still monotone (a clean answer never changes a
//     candidate's denominator, only raises its numerator or adds candidates); the best S is found exactly (0/1
//     knapsack over integer weights — with the floor the best S is no longer always a prefix by m_shown).
//     A clean placement / JUMP is no longer a verdict on its own (only a miss or a hint is), and placement never
//     lowers an earned m — so passing JUMP HERE on 10/10 cannot lower the number.
//     Misses and hints also come from positive evidence in the save (card history, errors[]) — see saveEvidence.
//   Bands: < 50 Not ready · 50–69 Getting there · 70–84 Ready · ≥ 85 Locked in — except while provisional with
//   fewer than EARLY_MIN_TESTED (4) skills tested, which reads 'Too early to say' (home r2; `early: true`).
//   Logged daily to forecastLog[] (7-day sparkline); the Page Summary shows the delta.
//
// Both formulas are printed in Settings (T15 reads FORMULA_FULL / FORMULA_PROVISIONAL below).

import { skills, TOTAL_WEIGHT } from '../data/skills.js';
import { manifest, manifestIds } from '../data/source-manifest.js';
import { todayISO } from './days.js';
import { mShown, isMastered } from './schedule.js';
import { hasMiss, hasHelp } from './mastery.js';

export const WEIGHTS = Object.freeze({ M: 0.5, A: 0.3, C: 0.2 });
export const MINI_MOCK_FACTOR = 0.8;
export const MINI_KINDS = Object.freeze(['baseline', 'night']);     // run kinds scored × 0.8
export const MOCK_KINDS = Object.freeze(['mock', 'baseline', 'night']);
export const NIGHT_MIN_SCORED = 4;                                    // = night.MINI_MIN_SCORED (ceil(8 / 2)); night.js imports this module, so the number lives here
export const BANDS = Object.freeze([
  { min: 85, label: 'Locked in', key: 'locked' },
  { min: 70, label: 'Ready', key: 'ready' },
  { min: 50, label: 'Getting there', key: 'getting' },
  { min: 0, label: 'Not ready', key: 'not' },
]);
export const WEAK_THRESHOLD = 70;   // m_shown < 70 ∧ n ≥ 1 ∧ (misses ≥ 1 ∨ helped ≥ 1) (fix5:home r1/r2)
// home r2: while provisional AND fewer than this many skills carry n ≥ 1, the band is 'Too early to say' (key
// 'not', so the tone is unchanged) — two clean placement answers must not read as "Getting there".
export const EARLY_MIN_TESTED = 4;
export const EARLY_BAND = Object.freeze({ min: 0, label: 'Too early to say', key: 'not', early: true });
export const WEAK_MAX = 5;
// fix5:home r3 — the provisional M never divides by fewer than this many of the 100 skill-weight points.
export const EVIDENCE_W0 = 30;
export const FORMULA_FULL = 'R = round(100 × (0.5·M + 0.3·A + 0.2·C))';
export const FORMULA_PROVISIONAL = 'R = round(100 × (0.5·M + 0.2·C) / 0.7)   — provisional, until a Mock or Baseline exists; M runs over the skills tested so far (n ≥ 1), not all 19; skills with a wrong or hinted answer always count, any other skill counts only where it raises M, and M divides by at least 30 of the 100 weight points: M = Σ w·m_shown/100 ÷ max(Σ w, 30)';
export const PROVISIONAL_LABEL = 'provisional — take a Mock to lock\u00a0it';   // nbsp: no one-word orphan at 375 px

const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const BANK_IDS = manifestIds({ bonus: false });   // the 164 non-bonus ids: what C counts

/* ---------------- the three terms ---------------- */
/** M = Σ w · m_shown / 100 / Σ w  → 0..1 (weights sum to 100). */
export function masteryTerm(save) {
  let acc = 0;
  for (const s of skills) acc += s.w * mShown(save?.skills?.[s.id]) / 100;
  return acc / TOTAL_WEIGHT;
}

const PRIMARY_SKILL = new Map(manifest.filter(r => r.skill).map(r => [r.id, r.skill]));
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/**
 * fix5:home r3 — positive evidence of a miss or a hinted clear that lives in the save itself, not on the skill record:
 * a card history entry with ok === false or attempt ≥ 2 (miss) or hints > 0 (hint), a shown solution, or an errors[]
 * entry naming the card (item or forCard). Mapped to the card's primary skill (source manifest). It covers saves
 * written before `misses` / `helped` existed — whose record-only inference now prefers "not a miss" (critic r2: a
 * clean record that decayed and was answered again read as a miss). A clean answer never adds evidence.
 * Returns { miss: Set<skillId>, help: Set<skillId> }.
 */
export function saveEvidence(save) {
  const miss = new Set(), help = new Set();
  const cards = isObj(save?.cards) ? save.cards : {};
  for (const id of Object.keys(cards)) {
    const sk = PRIMARY_SKILL.get(id), rec = cards[id];
    if (!sk || !isObj(rec)) continue;
    if (rec.solutionShown === true) miss.add(sk);
    for (const raw of Array.isArray(rec.history) ? rec.history : []) {
      // fix5 integrate: also read the PACKED on-disk form [at, ok?1:0, attempt, hints, ms] (store.js pack), so a
      // raw-localStorage read agrees with getState()'s unpacked one
      const e = Array.isArray(raw) && raw.length === 5 ? { ok: !!raw[1], attempt: raw[2], hints: raw[3] } : raw;
      if (!isObj(e)) continue;
      if (e.ok === false || num(e.attempt, 1) >= 2) miss.add(sk);
      else if (num(e.hints) > 0) help.add(sk);
    }
  }
  for (const e of Array.isArray(save?.errors) ? save.errors : []) {
    if (!isObj(e)) continue;
    // fix5 integrate (critic home r3 blocker): an errors[] row from the SETUP slot is not a miss on the card. On a
    // Card the setup is optional and a wrong one is never charged (card.js afterSetup logs it, firstTry stays true);
    // in a Boss / Mock it is charged through updateSkill, which already counts it on the record. Counting it here
    // turned a GOLD first-try clear after a wrong optional setup into a verdict: Readiness 57 → 50 and a weak spot.
    if (e.part === 'setup') continue;
    const sk = PRIMARY_SKILL.get(e.item) ?? PRIMARY_SKILL.get(e.forCard);
    if (sk) miss.add(sk);
  }
  return { miss, help };
}

const missedOf = (rec, id, ev) => hasMiss(rec) || !!ev?.miss?.has(id);
const helpedOf = (rec, id, ev) => hasHelp(rec) || !!ev?.help?.has(id);

/** fix5:home r1/r2/r3 — a tested skill whose m_shown is a verdict, not the m = 0 starting point: a miss or a hinted clear. */
export function isVerdict(rec, id = null, ev = null) {
  return missedOf(rec, id, ev) || helpedOf(rec, id, ev);
}

/**
 * M over the skills TESTED so far (n ≥ 1). Used ONLY by the provisional branch of `readiness()` — a skill
 * nobody has asked about yet is an unknown, not a zero (S4/S7 "untested is never weak"), the same way the
 * missing Mock does not score A as zero.
 *
 * fix5:home r1–r3: the tested skills split in two. VERDICT skills (a miss or a hinted clear) always count.
 * JUST-STARTED skills (answered, never wrong, never hinted — a clean placement included) count only where they raise
 * M, and the mean never divides by fewer than EVIDENCE_W0 weight points:
 *   M = max over S = verdict ∪ (any subset of just-started) of Σ_S w · m_shown / 100 ÷ max(Σ_S w, W0).
 * Solved exactly: for every total weight W of the just-started part, the best numerator (0/1 knapsack, integer
 * weights ≤ 100), then the best ratio. 0 when nothing counts.
 * Monotone by construction: a clean answer raises one skill's m_shown (or adds a new tested skill) and never adds a
 * miss or a hint, so every candidate's numerator only rises, no candidate's denominator changes, and every earlier
 * candidate stays available.
 * Returns { M, tested (n ≥ 1), scored (skills inside the best S), started (just-started skills left out), weight (Σ_S w), total }.
 */
export function masteryTermTested(save, { ev = saveEvidence(save) } = {}) {
  let accV = 0, wV = 0, tested = 0, nV = 0;
  const started = [];
  for (const s of skills) {
    const rec = save?.skills?.[s.id];
    if (!((rec?.n ?? 0) >= 1)) continue;
    tested++;
    const v = mShown(rec) / 100;
    if (isVerdict(rec, s.id, ev)) { accV += s.w * v; wV += s.w; nV++; }
    else started.push({ w: Math.max(1, Math.round(s.w)), v });
  }
  const Wmax = started.reduce((t, x) => t + x.w, 0);
  const best = new Array(Wmax + 1).fill(-Infinity), cnt = new Array(Wmax + 1).fill(0);
  best[0] = 0;
  for (const x of started) {
    for (let W = Wmax; W >= x.w; W--) {
      const cand = best[W - x.w] + x.w * x.v;
      if (cand > best[W]) { best[W] = cand; cnt[W] = cnt[W - x.w] + 1; }
    }
  }
  let M = 0, k = 0, weight = 0;
  for (let W = 0; W <= Wmax; W++) {
    if (best[W] === -Infinity || wV + W === 0) continue;
    const mean = (accV + best[W]) / Math.max(wV + W, EVIDENCE_W0);
    if (mean >= M) { M = mean; k = cnt[W]; weight = wV + W; }
  }
  return { M, tested, scored: nV + k, started: started.length - k, weight, total: skills.length };
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
    if (kind === 'night' && (Number.isFinite(r.scored) ? r.scored : (Array.isArray(r.items) ? r.items.length : 0)) < NIGHT_MIN_SCORED) continue;   // binder r2: a 1-item night sample never replaces a Baseline
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
 * readiness(save) → { r, provisional, M, A, C, band, label, mock, tested, skillsTotal }
 * `r` is the published integer; `A` is null while provisional; `label` is the provisional note or '';
 * `tested` is how many of the 19 skills M rests on (all 19 once locked).
 */
export function readiness(save, { ids = BANK_IDS } = {}) {
  const C = coverageTerm(save, ids);
  const A = accuracyTerm(save);
  const provisional = A == null;
  // provisional: M over the skills tested so far (see masteryTermTested); locked: over all 19 (S4)
  const mt = provisional ? masteryTermTested(save) : null;
  const M = provisional ? mt.M : masteryTerm(save);
  const raw = provisional
    ? 100 * (WEIGHTS.M * M + WEIGHTS.C * C) / (WEIGHTS.M + WEIGHTS.C)
    : 100 * (WEIGHTS.M * M + WEIGHTS.A * A + WEIGHTS.C * C);
  const r = Math.max(0, Math.min(100, Math.round(raw)));
  const early = provisional && mt.tested < EARLY_MIN_TESTED;   // home r2
  const band = early ? EARLY_BAND : bandOf(r);
  return { r, provisional, early, M, A, C, band, label: provisional ? PROVISIONAL_LABEL : '', mock: latestMock(save), tested: mt ? mt.tested : skills.length, scored: mt ? mt.scored : skills.length, skillsTotal: skills.length };
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
/**
 * One skill's state for a bar: { id, name, w, m, n, mShown, untested, placed, mastered, missed, weak, started }.
 * fix5:home r1/r2: `weak` needs a miss or a hinted clear (n ≥ 1 ∧ (misses ≥ 1 ∨ helped ≥ 1) ∧ m_shown < 70);
 * `started` is the grey state — answered, never wrong, never hinted, never placed, m_shown < 70 — never a warning.
 */
export function skillState(save, id, ev = saveEvidence(save)) {
  const def = skills.find(s => s.id === id);
  if (!def) return null;
  const rec = save?.skills?.[id];
  const n = rec?.n ?? 0;
  const shown = mShown(rec);
  const missed = n >= 1 && missedOf(rec, id, ev);   // fix5:home r3: the record's count or evidence in the save
  const helped = n >= 1 && helpedOf(rec, id, ev);   // fix5:home r2: cleared with a hint at least once
  return {
    id, name: def.name, w: def.w, m: rec?.m ?? 0, n, mShown: shown,
    untested: n === 0, placed: !!rec?.placedAt, mastered: isMastered(rec),
    missed, helped,
    weak: n >= 1 && (missed || helped) && shown < WEAK_THRESHOLD,
    started: n >= 1 && !missed && !helped && !rec?.placedAt && shown < WEAK_THRESHOLD,
    score: def.w * (1 - (rec?.m ?? 0) / 100),
  };
}

/** All 19 skills, in table order. */
export function skillStates(save) { const ev = saveEvidence(save); return skills.map(s => skillState(save, s.id, ev)); }

/**
 * Weak spots (S7): n ≥ 1 ∧ m_shown < 70 ∧ (misses ≥ 1 ∨ helped ≥ 1) (fix5:home r1/r2) — an untested or just-started skill is
 * never weak — at most 5, sorted by
 * w × (1 − m/100) desc (ties by table order). Each entry carries `drill: '#/run/drill/<id>'`.
 */
export function weakSpots(save, { max = WEAK_MAX } = {}) {
  return skillStates(save)
    .filter(s => s.weak)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(s => ({ ...s, drill: `#/run/drill/${s.id}` }));
}

/** fix5:home r1 — the just-started skills (answered, no miss, no hint, not placed, m_shown < 70), table order. */
export function startedSkills(save) {
  return skillStates(save).filter(s => s.started);
}
