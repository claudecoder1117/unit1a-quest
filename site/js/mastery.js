// mastery.js — per-skill mastery (COMPOSED S4 "Mastery per skill") plus the per-card Leitner primitives the
// Card screen needs today (S4 "Spaced review"). Pure, DOM-free, imports nothing.
//
//   m ← m + 0.35·(s − m),  s = 100 clean / 70 with hints / 40 on attempt ≥ 2 / 0 wrong (first wrong only)
//   m_shown = m · min(1, n/5)      — two lucky clears never show green; placement / JUMP write n = 5 with m
//   Mastered ⇔ m ≥ 85 ∧ n ≥ 3 ∧ ≥ 1 correct on a DUE review ≥ 12 h after the previous attempt on that skill
//   A Mock or Boss miss on a Mastered skill drops m to 69 at once. Lazy decay: −2/day after 2 idle days, floor 0.
//
// Record shape (S6 `skills[id]`): { m, n, lastAt, lastDueCorrectAt, placedAt } — `decayDays` is added here so
// decay is idempotent across repeated loads (it is reset by any update).
// fix5:home r1 — `misses` counts the answers on this skill that were NOT correct (s < 70: a wrong, a retry on
// attempt ≥ 2, a shown solution, a Mock/Boss miss, a non-clean placement item). It is what separates a
// genuinely weak skill from one that has merely JUST STARTED (m climbs from 0, so one clean answer shows
// m_shown = 7): Weak spots require misses ≥ 1, and the provisional Readiness counts a never-missed skill
// only where it raises M (readiness.js). Records written before the field existed are inferred once
// (`legacyMisses`, r3: positive evidence only) and stamped explicitly by their next update.
// fix5:home r2 — `helped` counts the CORRECT answers that needed a hint (s = 70). A hint is not a wrong answer,
// but a skill that can only be done with one is not "just started" either: `helped ≥ 1` makes a skill count in
// the provisional M and lets it be a Weak spot, exactly like a miss. A clean answer never touches either count.
//
// Leitner (S4): bucket 0–5, intervals [0,1,2,4,7,14] days; clean → +1; with hints → unchanged;
// wrong → max(0, bucket − 2); due = lastAt + interval. The TEST CLAMP belongs to T10's schedule.js —
// `dueFor()` here is the plain interval; T10 should wrap or supersede it.

export const ALPHA = 0.35;
export const N_FULL = 5;
export const MASTER_M = 85;
export const MASTER_N = 3;
export const DUE_GAP_MS = 12 * 3600 * 1000;
export const DECAY_IDLE_DAYS = 2;
export const DECAY_PER_DAY = 2;
export const MOCK_MISS_M = 69;
export const DAY_MS = 24 * 3600 * 1000;

export const S = Object.freeze({ clean: 100, hints: 70, retry: 40, wrong: 0 });
export const PLACEMENT_M = Object.freeze({ wrong: 0, retry: 50, clean: 80 });

export const INTERVALS = Object.freeze([0, 1, 2, 4, 7, 14]);
export const MAX_BUCKET = INTERVALS.length - 1;

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** The m an all-clean history of n answers from m = 0 reaches: 35, 57.75, 72.5, 82.1, 88.4 … */
export function cleanM(n) {
  let m = 0;
  for (let i = 0; i < Math.min(Math.max(0, n), 60); i++) m += ALPHA * (S.clean - m);
  return m;
}

/**
 * fix5:home r1/r3 — a pre-`misses` record: is there POSITIVE evidence, in the record alone, that an answer on it was
 * not clean? r3 (critic r2): the r1 rule ("m below the all-clean curve cleanM(n) ⇒ a miss") misread a clean-only record
 * that had decayed and was answered again (updateSkill resets decayDays, so old decay looks like a deficit). Only
 * signatures that NO clean-only history can produce count now:
 *   · m + the decay still charged < 35 (− 0.5 slack): a clean LAST answer always lands at ≥ 35 whatever came before
 *     (m + 0.35·(100 − m) ≥ 35 from any m ≥ 0), and only the decay since that answer is unrecorded-proof. Below it the
 *     last answer was wrong, a retry or hinted — counted as a miss, as r1 did (a hint and a miss weigh the same in
 *     Readiness and Weak spots);
 *   · no placedAt, n ≥ 5 and m + the charged decay exactly 50 — the retry placement item's write.
 * Everything else reads 0; the save's own card history / errors[] add the rest (readiness.saveEvidence).
 * Returns 0 or 1.
 */
export function legacyMisses(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const n = Math.max(0, Math.floor(num(r.n)));
  if (n === 0) return 0;
  const m = clamp(num(r.m), 0, 100);
  const undecayed = m + DECAY_PER_DAY * Math.max(num(r.decayDays), num(r.decay?.days));
  if (undecayed < ALPHA * S.clean - 0.5) return 1;
  if (!Number.isFinite(r.placedAt) && n >= N_FULL && Math.abs(undecayed - PLACEMENT_M.retry) < 1e-9) return 1;
  return 0;
}

/** A skill record with defaults filled in (never mutates the input). */
export function freshSkill(rec = null) {
  const r = rec && typeof rec === 'object' ? rec : {};
  return {
    m: clamp(num(r.m), 0, 100),
    n: Math.max(0, Math.floor(num(r.n))),
    lastAt: Number.isFinite(r.lastAt) ? r.lastAt : null,
    lastDueCorrectAt: Number.isFinite(r.lastDueCorrectAt) ? r.lastDueCorrectAt : null,
    placedAt: Number.isFinite(r.placedAt) ? r.placedAt : null,
    // fix5 integrate: one decay ledger. schedule.js housekeeping (Home, app boot) records charged days on
    // `decay = { from: lastAt, days }`; this record used only `decayDays`, so an answer after a Home visit charged the
    // same idle days a SECOND time inside the answer's save (after-ace, 5 idle days: 80 → 74 on Home → 68 on answer).
    decayDays: Math.max(0, Math.floor(num(r.decayDays)), r.decay && typeof r.decay === 'object' && r.decay.from != null && r.decay.from === r.lastAt ? Math.floor(num(r.decay.days)) : 0),
    misses: Number.isFinite(r.misses) ? Math.max(0, Math.floor(r.misses)) : legacyMisses(r),   // fix5:home r1
    helped: Number.isFinite(r.helped) ? Math.max(0, Math.floor(r.helped)) : 0,                 // fix5:home r2 (legacy hints: readiness.saveEvidence reads the card history)
  };
}

/** fix5:home r1 — has any answer on this skill ever been wrong (s < 70)? */
export function hasMiss(rec) { return freshSkill(rec).misses > 0; }

/** fix5:home r2 — has any correct answer on this skill needed a hint (s = 70)? */
export function hasHelp(rec) { return freshSkill(rec).helped > 0; }

/**
 * The S4 score of an outcome.
 * @param {{wrong?:boolean, firstTry?:boolean, hints?:number, attempt?:number, withHints?:boolean, solutionShown?:boolean}} o
 *   wrong / solutionShown → 0 · attempt ≥ 2 (or firstTry false) → 40 · any hint (incl. the auto-H1 and a
 *   correct verdict with a wrong reason chip: withHints) → 70 · else 100.
 */
export function scoreFor(o = {}) {
  if (o.wrong === true || o.solutionShown === true) return S.wrong;
  const attempt = Number.isInteger(o.attempt) ? o.attempt : (o.firstTry === false ? 2 : 1);
  if (attempt >= 2 || o.firstTry === false) return S.retry;
  if (Math.max(0, num(o.hints)) > 0 || o.withHints === true) return S.hints;
  return S.clean;
}

/**
 * updateSkill(rec, s, { at, dueReview }) → a NEW record: the EMA step, n + 1, lastAt, and — when the clear
 * was correct on a DUE review ≥ 12 h after the previous attempt — lastDueCorrectAt.
 */
export function updateSkill(rec, s, { at = Date.now(), dueReview = false } = {}) {
  const r = freshSkill(rec);
  const score = clamp(num(s), 0, 100);
  const prevAt = r.lastAt;
  const gapOk = prevAt == null || at - prevAt >= DUE_GAP_MS;
  const out = {
    ...r,
    m: clamp(r.m + ALPHA * (score - r.m), 0, 100),
    n: r.n + 1,
    lastAt: at,
    decayDays: 0,
    misses: r.misses + (score < S.hints ? 1 : 0),   // fix5:home r1: wrong / retry / solution shown
    helped: r.helped + (score >= S.hints && score < S.clean ? 1 : 0),   // fix5:home r2: cleared with a hint
  };
  if (score > 0 && dueReview && gapOk) out.lastDueCorrectAt = at;
  return out;
}

/** Displayed mastery: m · min(1, n/5). */
export function mShown(rec) {
  const r = freshSkill(rec);
  return r.m * Math.min(1, r.n / N_FULL);
}

/** m ≥ 85 ∧ n ≥ 3 ∧ a correct due-review clear ≥ 12 h after the previous attempt has been recorded. */
export function isMastered(rec) {
  const r = freshSkill(rec);
  return r.m >= MASTER_M && r.n >= MASTER_N && r.lastDueCorrectAt != null;
}

/** 'untested' (n = 0) · 'weak' (< 40) · 'building' (< 70) · 'strong' (< 85 or not yet Mastered) · 'mastered'. */
export function bandOf(rec) {
  const r = freshSkill(rec);
  if (r.n === 0) return 'untested';
  if (isMastered(r)) return 'mastered';
  const shown = mShown(r);
  return shown < 40 ? 'weak' : shown < 70 ? 'building' : 'strong';
}

/**
 * Lazy decay: −2 per idle day after 2 idle days, floor 0. Idempotent — the days already charged are kept in
 * `decayDays` so opening the app five times in one day decays once. Returns a NEW record.
 */
export function decaySkill(rec, now = Date.now()) {
  const r = freshSkill(rec);
  if (r.lastAt == null || r.n === 0) return r;
  const idle = Math.floor((now - r.lastAt) / DAY_MS);
  const owed = Math.max(0, idle - DECAY_IDLE_DAYS) - r.decayDays;
  if (owed <= 0) return r;
  return { ...r, m: Math.max(0, r.m - DECAY_PER_DAY * owed), decayDays: r.decayDays + owed };
}

/** Decay every skill in a save's `skills` map IN PLACE (the store's update() hands us the live object). */
export function decayAll(skills, now = Date.now()) {
  if (!skills || typeof skills !== 'object') return skills;
  for (const id of Object.keys(skills)) skills[id] = decaySkill(skills[id], now);
  return skills;
}

/**
 * Placement / JUMP pass: write m with n = 5 and placedAt — never lowering an earned m or n (fix5:home r3, critic r2:
 * a 10/10 JUMP HERE overwrote an EMA-earned 93 with a flat 80 and the finish save lowered Readiness).
 * Returns a NEW record.
 */
export function placeSkill(rec, m, at = Date.now()) {
  const r = freshSkill(rec);
  return { ...r, m: Math.max(r.m, clamp(num(m), 0, 100)), n: Math.max(r.n, N_FULL), lastAt: at, placedAt: at, decayDays: 0 };
}

/** A Mock / Boss miss on a Mastered skill: m → 69 at once (the Mock is the source of truth). Returns a NEW record. */
export function mockMiss(rec) {
  const r = freshSkill(rec);
  return isMastered(r) ? { ...r, m: MOCK_MISS_M, misses: r.misses + 1 } : r;   // fix5:home r1: a Mock miss is a miss
}

/**
 * applyOutcome(skills, ids, s, opts) — one update for every skill of a card, IN PLACE on the save's map.
 * @returns {object} the map
 */
export function applyOutcome(skills, ids, s, opts = {}) {
  if (!skills || typeof skills !== 'object') return skills;
  for (const id of ids || []) if (typeof id === 'string' && id) skills[id] = updateSkill(skills[id], s, opts);
  return skills;
}

/** Are ALL the given skills Mastered (the S4 "mastered-skill farming pays half" test)? Empty → false. */
export function allMastered(skills, ids) {
  const list = (ids || []).filter((id) => typeof id === 'string' && id);
  if (!list.length || !skills) return false;
  return list.every((id) => isMastered(skills[id]));
}

/** Weakness weight for a skill (Page composer ordering: w × (1 − m/100), untested skills never listed). */
export function weakness(rec, w) {
  const r = freshSkill(rec);
  if (r.n === 0) return 0;
  return num(w) * (1 - mShown(r) / 100);
}

/* ---------------------------------------------------------------- Leitner primitives (S4) */

/** 'clean' | 'hints' | 'wrong' — the three Leitner outcomes of a clear. */
export function leitnerOutcome(o = {}) {
  if (o.wrong === true || o.solutionShown === true) return 'wrong';
  const attempt = Number.isInteger(o.attempt) ? o.attempt : (o.firstTry === false ? 2 : 1);
  if (attempt >= 2 || o.firstTry === false) return 'wrong';
  if (Math.max(0, num(o.hints)) > 0 || o.withHints === true) return 'hints';
  return 'clean';
}

/** clean → +1 (max 5) · hints → unchanged · wrong → max(0, bucket − 2). */
export function nextBucket(bucket, outcome) {
  const b = clamp(Math.floor(num(bucket)), 0, MAX_BUCKET);
  if (outcome === 'clean') return Math.min(MAX_BUCKET, b + 1);
  if (outcome === 'hints') return b;
  return Math.max(0, b - 2);
}

/** due = lastAt + interval[bucket] days (no test clamp — T10's schedule.js). */
export function dueFor(bucket, lastAt = Date.now()) {
  const b = clamp(Math.floor(num(bucket)), 0, MAX_BUCKET);
  return lastAt + INTERVALS[b] * DAY_MS;
}

/** Is a card record due now? (never cleared → not due; due missing → due) */
export function isDue(cardRec, now = Date.now()) {
  if (!cardRec || typeof cardRec !== 'object' || !cardRec.cleared) return false;
  return cardRec.due == null || cardRec.due <= now;
}

export default updateSkill;
