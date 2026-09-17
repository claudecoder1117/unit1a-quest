// schedule.js — spaced review (COMPOSED S4 "Spaced review", "Mastery" decay; S1 step 4 Rematch; S7 hooks).
//
// Pure, DOM-free, Node-importable. Everything here is a function of the save object + a clock; the
// store is never touched directly (callers wrap these in `update()`).
//
//   Leitner per Card:  bucket 0–5, intervals [0, 1, 2, 4, 7, 14] days;
//                      clean → +1 · with hints / retry → unchanged · wrong or solution shown → max(0, bucket − 2)
//                      due = lastAt + interval, then the TEST CLAMP:
//                        if due > test − 12 h  →  due = max(now + 10 min, (now + test − 8 h) / 2)
//                      so every item gets ≥ 1 review before the test. At D ≤ 2 everything with
//                      bucket ≤ 2 is due (Final Sweep).
//   Frozen Variants:   a missed generated item is frozen by seed + templateVersion (+ forCard) so the
//                      exact failed problem returns; pruned when its bucket reaches 3 (or after the test).
//   Mastery decay:     lazy on load — −2/day after 2 idle days, floor 0, applied once per idle day.
//   Rematch log:       `save.errors` (S6) — a third wrong / solution shown queues a fresh-seed Variant
//                      of that template in the next Page (page.js slots it after the first two reviews).
//   Daily goal hook:   goalMet = (mock completed ∧ misses drilled) ∨ xpToday ≥ dailyGoal ∨ Night Before done.

import { todayISO, diffDays, daysUntilTest, testMoment } from './days.js';
import { markStreakDay } from './store.js';

export const INTERVALS = Object.freeze([0, 1, 2, 4, 7, 14]);   // days, by bucket
export const MAX_BUCKET = INTERVALS.length - 1;                 // 5
export const MIN_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;
export const TEST_GUARD_MS = 12 * HOUR_MS;    // a due later than test − 12 h is clamped …
export const TEST_TARGET_MS = 8 * HOUR_MS;    // … to the midpoint of now and test − 8 h
export const CLAMP_MIN_MS = 10 * MIN_MS;      // … but never earlier than now + 10 min
export const SWEEP_DAYS = 2;                  // D ≤ 2 → Final Sweep
export const SWEEP_BUCKET = 2;                // … every item with bucket ≤ 2 is due
export const PRUNE_BUCKET = 3;                // frozen Variants leave the save at bucket ≥ 3
export const DECAY_IDLE_DAYS = 2;             // mastery decays after this many idle days …
export const DECAY_PER_DAY = 2;               // … by this much per further day, floor 0
export const NEEDS_MASTERY = 40;              // item-level `needs` is met at m ≥ 40 or when placed
export const MASTERED_M = 85, MASTERED_N = 3, MASTERED_GAP_MS = 12 * HOUR_MS;
export const OUTCOMES = Object.freeze(['clean', 'hints', 'wrong']);

const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const clampBucket = b => Math.max(0, Math.min(MAX_BUCKET, Number.isInteger(b) ? b : 0));

/* ---------------- outcomes ---------------- */
/**
 * The S4 Leitner outcome of one clear/miss record: `clean` = first try ∧ zero hints (Global rule 8);
 * `hints` = cleared but not clean (any hint incl. the auto-H1, or a retry); `wrong` = not cleared or
 * the solution was shown (attempt 3). `almost` / `malformed` are never outcomes (they cost nothing).
 */
export function outcomeOf({ ok = true, firstTry, attempt = 1, hints = 0, solutionShown = false } = {}) {
  if (!ok || solutionShown) return 'wrong';
  const first = firstTry ?? attempt <= 1;
  return first && (hints | 0) === 0 ? 'clean' : 'hints';
}

/** Leitner transition. */
export function nextBucket(bucket, outcome) {
  const b = clampBucket(bucket);
  if (outcome === 'clean') return Math.min(MAX_BUCKET, b + 1);
  if (outcome === 'wrong') return Math.max(0, b - 2);
  return b;
}

export function intervalDays(bucket) { return INTERVALS[clampBucket(bucket)]; }

/** Unclamped due timestamp for a bucket, from the time of the attempt. */
export function dueAfter(lastAt, bucket) { return lastAt + intervalDays(bucket) * DAY_MS; }

/**
 * The test clamp (S4): a review that would land later than test − 12 h is pulled to the midpoint of
 * now and test − 8 h (never earlier than now + 10 min), so every item gets ≥ 1 review before the test.
 * `testAt` null (no date) → unchanged.
 */
export function clampDue(due, { now, testAt = null } = {}) {
  if (testAt == null || !Number.isFinite(testAt)) return due;
  if (due <= testAt - TEST_GUARD_MS) return due;
  return Math.max(now + CLAMP_MIN_MS, (now + testAt - TEST_TARGET_MS) / 2);
}

/** Local ms of the test moment from the save's settings, or null. */
export function testAtOf(save) {
  const st = save?.settings ?? {};
  return st.testDate ? testMoment(st.testDate, st.testTime || '08:00') : null;
}

/* ---------------- card records ---------------- */
/** The S6 `cards[id]` record, created with defaults when missing. */
export function cardRecord(save, id) {
  if (!isObj(save.cards)) save.cards = {};
  let rec = save.cards[id];
  if (!isObj(rec)) {
    rec = save.cards[id] = {
      attempts: 0, cleared: false, rarity: null, foil: false, foilProgress: [], setupTried: false,
      bucket: 0, lastAt: null, due: null, hintsUsed: 0, solutionShown: false, bestMs: null, placed: false,
      work: '', history: [],
    };
  }
  return rec;
}

/**
 * Apply a Leitner outcome to a Card: bucket, lastAt, due (clamped). Returns the record.
 * Does not touch attempts / rarity / history — those are the Card screen's (T09).
 */
export function applyOutcome(save, id, outcome, { now = Date.now(), testAt = testAtOf(save) } = {}) {
  const rec = cardRecord(save, id);
  rec.bucket = nextBucket(rec.bucket, outcome);
  rec.lastAt = now;
  rec.due = clampDue(dueAfter(now, rec.bucket), { now, testAt });
  return rec;
}

export function isDue(rec, now = Date.now()) { return !!rec && rec.due != null && rec.due <= now; }
export function overdueDays(rec, now = Date.now()) { return rec?.due == null ? 0 : (now - rec.due) / DAY_MS; }

/* ---------------- frozen Variants ---------------- */
/**
 * Freeze a missed generated item so the exact problem returns (S4/S6). `item` is the generated item
 * (`id`, `template`, `seed`, `templateVersion`, optional `params`); `forCard` credits Foil progress to
 * that original (T06f record semantics). Returns the frozen key (= item.id).
 */
export function freezeVariant(save, item, { forCard = null, outcome = 'wrong', now = Date.now(), testAt = testAtOf(save) } = {}) {
  if (!item?.id || !item.template) throw new TypeError('freezeVariant: item needs id and template');
  if (!isObj(save.frozen)) save.frozen = {};
  const key = item.id;
  const prev = save.frozen[key];
  const bucket = nextBucket(prev?.bucket ?? 0, outcome);
  const rec = {
    seed: item.seed, templateVersion: item.templateVersion ?? null, template: item.template,
    bucket, lastAt: now, due: clampDue(dueAfter(now, bucket), { now, testAt }),
    forCard: forCard ?? prev?.forCard ?? item.forCard ?? null,
  };
  if (item.params && Object.keys(item.params).length) rec.params = item.params;
  if (rec.bucket >= PRUNE_BUCKET) { delete save.frozen[key]; return key; }
  save.frozen[key] = rec;
  return key;
}

/** A frozen Variant was answered again: advance its bucket; at bucket ≥ 3 it leaves the save. */
export function applyFrozenOutcome(save, key, outcome, { now = Date.now(), testAt = testAtOf(save) } = {}) {
  const rec = save.frozen?.[key];
  if (!isObj(rec)) return null;
  rec.bucket = nextBucket(rec.bucket, outcome);
  rec.lastAt = now;
  rec.due = clampDue(dueAfter(now, rec.bucket), { now, testAt });
  if (rec.bucket >= PRUNE_BUCKET) { delete save.frozen[key]; return null; }
  return rec;
}

/** Drop frozen Variants at bucket ≥ 3 (and everything after the test). Returns how many were removed. */
export function pruneFrozen(save, { postTest = false } = {}) {
  if (!isObj(save.frozen)) { save.frozen = {}; return 0; }
  let n = 0;
  for (const k of Object.keys(save.frozen)) {
    const f = save.frozen[k];
    if (postTest || !isObj(f) || (f.bucket ?? 0) >= PRUNE_BUCKET) { delete save.frozen[k]; n++; }
  }
  return n;
}

/* ---------------- what is due ---------------- */
/**
 * Every due review, Cards and frozen Variants, sorted by overdue days desc (S1 step 3).
 * Only Cards that were attempted at least once (`lastAt`) can be due. At D ≤ 2 (Final Sweep) every
 * item with bucket ≤ 2 is due as well (flagged `sweep`, overdue 0 unless really overdue).
 * → [{ key, id, kind:'card'|'frozen', bucket, due, overdue, sweep, template?, seed?, forCard?, templateVersion?, params? }]
 */
export function dueList(save, { now = Date.now(), today = todayISO(new Date(now)), D = daysUntilTest(save?.settings?.testDate, today) } = {}) {
  const sweep = D != null && D <= SWEEP_DAYS;
  const out = [];
  for (const [id, rec] of Object.entries(save.cards ?? {})) {
    if (!isObj(rec) || rec.lastAt == null) continue;
    const due = isDue(rec, now);
    const swept = sweep && (rec.bucket ?? 0) <= SWEEP_BUCKET;
    if (!due && !swept) continue;
    out.push({ key: id, id, kind: 'card', bucket: rec.bucket ?? 0, due: rec.due, overdue: due ? overdueDays(rec, now) : 0, sweep: !due && swept });
  }
  for (const [key, rec] of Object.entries(save.frozen ?? {})) {
    if (!isObj(rec)) continue;
    const due = isDue(rec, now);
    const swept = sweep && (rec.bucket ?? 0) <= SWEEP_BUCKET;
    if (!due && !swept) continue;
    out.push({
      key, id: key, kind: 'frozen', bucket: rec.bucket ?? 0, due: rec.due, overdue: due ? overdueDays(rec, now) : 0, sweep: !due && swept,
      template: rec.template ?? key.split('#')[0], seed: rec.seed, templateVersion: rec.templateVersion ?? null, forCard: rec.forCard ?? null,
      params: rec.params ?? null,
    });
  }
  out.sort((a, b) => (b.overdue - a.overdue) || (a.bucket - b.bucket) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return out;
}

/* ---------------- skills: decay, display, needs, mastered ---------------- */
/** `m_shown = m · min(1, n/5)` (S4) — two lucky clears never show green. */
export function mShown(rec) {
  if (!isObj(rec)) return 0;
  const m = Number.isFinite(rec.m) ? rec.m : 0, n = Number.isFinite(rec.n) ? rec.n : 0;
  return Math.max(0, Math.min(100, m * Math.min(1, n / 5)));
}

/** A skill counts as *placed* when placement / JUMP wrote `placedAt`. */
export function isPlaced(rec) { return !!rec?.placedAt; }

/** Item-level `needs` (S1): every needed skill has m ≥ 40 or is placed. Empty / missing needs → true. */
export function needsMet(needs, save) {
  if (!Array.isArray(needs) || needs.length === 0) return true;
  return needs.every(k => { const r = save?.skills?.[k]; return isPlaced(r) || (r?.m ?? 0) >= NEEDS_MASTERY; });
}

/** Mastered ⇔ m ≥ 85 ∧ n ≥ 3 ∧ ≥ 1 correct on a due review ≥ 12 h after the previous attempt (S4). */
export function isMastered(rec) {
  return !!rec && (rec.m ?? 0) >= MASTERED_M && (rec.n ?? 0) >= MASTERED_N && rec.lastDueCorrectAt != null;
}

/**
 * Record a correct answer on a DUE review for a skill: sets `lastDueCorrectAt` only when ≥ 12 h have
 * passed since the previous attempt on that skill (`prevAt` = the skill's lastAt before this attempt).
 * Returns true when the mastered-gate was satisfied by this record.
 */
export function recordDueCorrect(save, skillId, { now = Date.now(), prevAt = null } = {}) {
  if (!isObj(save.skills)) save.skills = {};
  const rec = save.skills[skillId] ?? (save.skills[skillId] = { m: 0, n: 0, lastAt: null, lastDueCorrectAt: null, placedAt: null });
  const prev = prevAt ?? rec.lastAt;
  if (prev != null && now - prev < MASTERED_GAP_MS) return false;
  rec.lastDueCorrectAt = now;
  return true;
}

/**
 * Lazy mastery decay on load (S4): −2 per day after 2 idle days, floor 0. Idempotent per calendar day —
 * the days already charged are remembered on `rec.decay = { from: lastAt, days }` and reset the moment
 * `lastAt` moves (a new attempt), so no cooperation from the writer of `lastAt` is needed.
 * Returns the number of skills whose `m` changed.
 */
export function decaySkills(save, { today = todayISO() } = {}) {
  let changed = 0;
  for (const rec of Object.values(save.skills ?? {})) {
    if (!isObj(rec) || rec.lastAt == null || !Number.isFinite(rec.m)) continue;
    const idle = diffDays(todayISO(new Date(rec.lastAt)), today);
    if (Number.isNaN(idle)) continue;
    const eligible = Math.max(0, idle - DECAY_IDLE_DAYS);
    // fix5 integrate: mastery.decaySkill (card.js / run.js, inside an answer's save) keeps its own count on
    // `decayDays` (reset whenever lastAt moves) — read both, write both, so the same idle day is never charged twice.
    const ledger = isObj(rec.decay) && rec.decay.from === rec.lastAt ? (rec.decay.days | 0) : 0;
    const prior = Math.max(ledger, Number.isFinite(rec.decayDays) ? Math.floor(rec.decayDays) : 0);
    const delta = eligible - prior;
    if (delta <= 0) continue;
    const before = rec.m;
    rec.m = Math.max(0, rec.m - DECAY_PER_DAY * delta);
    rec.decay = { from: rec.lastAt, days: eligible };
    rec.decayDays = eligible;
    if (rec.m !== before) changed++;
  }
  return changed;
}

/* ---------------- Rematch log (S1 step 4, S6 `errors`) ---------------- */
/** template id of an item id ('T-wp-07#a91f2c' → 'T-wp-07'; an original id → null). */
export function templateOfId(id) {
  return typeof id === 'string' && id.startsWith('T-') ? id.split('#')[0] : null;
}

/**
 * Log a miss that earns a Rematch: a third wrong on a part, or "Show solution". `item` is the Card id or
 * the generated item id; for a Variant pass `seed`/`template`; `forCard` credits the original.
 */
export function recordRematch(save, { item, seed = null, template = null, forCard = null, got = '', tags = [], now = Date.now() } = {}) {
  if (!item) throw new TypeError('recordRematch: item id required');
  if (!Array.isArray(save.errors)) save.errors = [];
  const e = { item, seed, t: now, got: String(got ?? '').slice(0, 200), tags: Array.isArray(tags) ? tags.slice() : [], cleared: false };
  const tpl = template ?? templateOfId(item);
  if (tpl) e.template = tpl;
  if (forCard) e.forCard = forCard;
  save.errors.push(e);
  return e;
}

/**
 * Uncleared error entries, newest first, one per (template, forCard | item): what page.js turns into
 * Rematches. `templateFor(cardId)` resolves an original id to its template (page.js passes the registry
 * lookup); entries with no resolvable template are skipped here (the Card itself is bucket 0 and due).
 */
export function pendingRematches(save, { templateFor = () => null } = {}) {
  const seen = new Set();
  const out = [];
  const errors = Array.isArray(save.errors) ? save.errors : [];
  for (let i = errors.length - 1; i >= 0; i--) {
    const e = errors[i];
    if (!isObj(e) || e.cleared || !e.item) continue;
    const template = e.template ?? templateOfId(e.item) ?? templateFor(e.item);
    if (!template) continue;
    const forCard = e.forCard ?? (templateOfId(e.item) ? null : e.item);
    const k = `${template}|${forCard ?? ''}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ template, forCard, item: e.item, seed: e.seed ?? null, t: e.t, tags: e.tags ?? [], index: i });
  }
  return out;
}

/** Mark the error entries behind a Rematch as cleared (by item id, template, or forCard). Returns the count. */
export function clearRematch(save, ref) {
  let n = 0;
  for (const e of save.errors ?? []) {
    if (!isObj(e) || e.cleared) continue;
    const template = e.template ?? templateOfId(e.item);
    if (e.item === ref || template === ref || e.forCard === ref || (templateOfId(ref) && templateOfId(ref) === template && (e.forCard ?? null) === null)) { e.cleared = true; n++; }
  }
  return n;
}

/* ---------------- daily goal (S4 Streak, S7 hooks) ---------------- */
/** The S6 `daily[today]` record, created when missing. */
export function dailyRecord(save, today = todayISO()) {
  if (!isObj(save.daily)) save.daily = {};
  const d = save.daily[today];
  if (isObj(d)) return d;
  return (save.daily[today] = { xp: 0, clears: 0, goalMet: false, mockDone: false });
}

/**
 * goal = (a Mock completed ∧ its misses drilled) ∨ xpToday ≥ dailyGoal ∨ Night Before finished.
 * When the goal is newly met, `goalMet` is written and the streak day is marked (freezes earned there).
 * Returns the daily record.
 */
export function checkDailyGoal(save, today = todayISO()) {
  const d = dailyRecord(save, today);
  const goal = save.settings?.dailyGoal ?? 400;
  const met = (d.xp ?? 0) >= goal || (!!d.mockDone && !!d.missesDrilled) || !!d.nightDone;
  if (met && !d.goalMet) { d.goalMet = true; markStreakDay(save, today); }
  return d;
}

/* ---------------- load-time housekeeping ---------------- */
/**
 * What Home runs on every visit (idempotent): mastery decay, frozen pruning (everything after the test),
 * the daily-goal check. Returns { decayed, pruned, daily }.
 */
export function housekeep(save, { now = Date.now(), today = todayISO(new Date(now)) } = {}) {
  const decayed = decaySkills(save, { today });
  const testAt = testAtOf(save);
  const postTest = testAt != null && now > testAt + 90 * MIN_MS;
  const pruned = pruneFrozen(save, { postTest });
  const daily = checkDailyGoal(save, today);
  return { decayed, pruned, daily, postTest };
}

export { daysUntilTest };
