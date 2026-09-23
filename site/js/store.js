// store.js — the save (COMPOSED S6 "Save schema"). localStorage["u1a.save"], JSON, `v` + a migration
// chain, debounced writes, visibilitychange flush, try/catch around every storage access with an
// in-memory fallback + banner flags, corrupt JSON copied to "u1a.save.bak", and the S6 caps.
// Pure pieces (fresh, migrate, applyCaps, reconcileStreak, markStreakDay, reconcileGameDay) are exported for tests and for
// later tickets; `createStore` builds an instance around any Storage-like object; the default instance
// is bound to window.localStorage (memory-only under Node or when storage throws).
import { todayISO, diffDays, addDays } from './days.js';
// The ONLY content dependency of the save layer: the id list of the unit this build teaches, so a
// data swap resets `skills` for real without app.js having to remember to wire it (S8 #19).
import { SKILL_IDS } from '../data/skills.js';

export const SAVE_KEY = 'u1a.save';
export const BAK_KEY = 'u1a.save.bak';
/**
 * v1 = COMPOSED S6's schema. v2 added the game layer's two top-level keys, `player` (KEPT_KEYS — it
 * measures the student) and `game` (ARCHIVED_KEYS — it measures THIS unit). v3 CUTS both of them
 * down to the two numbers the game still keeps (designs/CUT-BRIEF.md): `player.best` and
 * `game.today` / `game.day`. The split is two TOP-LEVEL keys because `archiveUnit` copies top-level
 * keys only.
 */
export const SAVE_VERSION = 3;

/**
 * The unit this build of the app teaches. It is stamped on every save (`unitId`) so that swapping the
 * `site/data/*` folder for the next unit is detectable: `migrate(raw, now, { unit })` sees the mismatch
 * and files the finished unit under `save.archive[unitId]` instead of letting two units' card records
 * collide. Bump this in the SAME commit that swaps the data (docs/next-unit.md).
 */
export const UNIT_ID = 'u1a';

/**
 * The unit a save with no `unitId` came from. Saves written before this field existed are Unit-1A
 * saves by definition, so this literal is FROZEN FOREVER — never retarget it at UNIT_ID, or a
 * pre-swap save opened under the next unit's build would look like it already belonged there and
 * would be merged into it instead of archived.
 */
export const LEGACY_UNIT_ID = 'u1a';

/**
 * COMPOSED S8 #19. `archived` moves into `save.archive[unitId]` and is cleared from the live save;
 * `kept` survives the swap untouched. Nothing is ever deleted — the archive entry is part of the
 * exported JSON, so "zero data loss" is literal.
 *
 * The spec names five archived keys (cards, variants, frozen, runs, errors). Six more are archived
 * here because they are unit-scoped and would otherwise be silently wrong under the next unit's data:
 *   skills      — S8 #19 resets it unless the next unit's skills.js reuses the id; archiving first is
 *                 what makes that reset lossless (an old mastery number is still readable/exportable)
 *   forecastLog — Readiness history against the OLD blueprint; a sparkline mixing units lies
 *   placement   — "placed" is a statement about the old unit's modules
 *   jumps       — JUMP-HERE marks on old module ids
 *   postTest    — the old unit's test score
 *   inProgress  — a half-finished run whose item ids no longer resolve
 *   game        — the points banked today, on THIS unit's questions, on a day of THIS unit's week
 */
export const ARCHIVED_KEYS = Object.freeze(['cards', 'variants', 'frozen', 'runs', 'errors', 'skills', 'forecastLog', 'placement', 'jumps', 'postTest', 'inProgress', 'game']);
/**
 * Kept live across a unit swap (S8 #19: xp, streak, trophies, settings — plus the identity/ledger keys).
 * `player` joins them: the best day measures the STUDENT, and the best day he has had does not stop
 * being true when the packet changes.
 */
export const KEPT_KEYS = Object.freeze(['v', 'unitId', 'profileId', 'createdAt', 'settings', 'xp', 'streak', 'daily', 'counters', 'trophies', 'seedCounter', 'archive', 'player']);

/** S6 caps (+ two bounds the spec leaves implicit, so COMPOSED S6's restated < 528 KB budget is provable). */
export const CAPS = Object.freeze({
  history: 20,        // per card, newest kept (stored packed on disk — see pack/unpack)
  errors: 300,        // oldest CLEARED entries dropped first, then oldest of the rest
  runs: 40,           // newest kept
  workChars: 1024,    // `work` ≤ 1 KB per run item …
  workRuns: 3,        // … and kept only on the 3 most recent Mock-like runs (mock, baseline, night)
  rawChars: 200,      // a typed answer stored on a run item / error entry (`raw`, `got`)
  cardWork: 600,      // Scratch textarea per card (T09 sets maxlength to this — never truncated silently in UI)
  foilProgress: 6,    // 3 entries earn Foil; a few extra kept for the tooltip history
  frozen: 100,        // soonest-due kept; entries with bucket ≥ 3 are pruned (S6)
  daily: 90,          // one entry per local day
  forecastLog: 90,    // one point per day (7-day sparkline needs 7)
  /* THE GAME HAS NO CAP HERE, and must never grow one. Its whole save is three integers and a
     seven-field record (`data/job.js IN_PROGRESS_KEYS`), all bounded by construction. The five caps
     that used to sit on this line trimmed a 50-call rating window, a 30-job log, a 68-tag Fault
     Index, five bundles and a ten-job heat window — every one of them cut with the mechanic it
     priced (designs/CUT-BRIEF.md "What is DELETED"). A cap is a tuning knob; a knob is how the old
     layer got to fourteen numbers. */
});

const WORK_KINDS = new Set(['mock', 'baseline', 'night']);

const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);

function newProfileId(now) {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'p-' + now.toString(36);
}

/* ---------------- the game's two keys (designs/CUT-SPEC.md §8) ----------------
   These literals are the SAME OBJECTS as `data/job.js`'s `SAVE_DEFAULTS`, and
   `tests/job-save.test.mjs` asserts them deep-equal in both directions so the two can never drift.
   They are repeated here rather than imported because `store.js` is on the cold-open boot path of
   every screen and a student with `settings.game = false` never needs the game's data file.

   DEMOLITION (notes/DEMOLISH.md): the 50-call rating window, the rank, the Elo pair, the eight
   records, the crew map, the press heat window, the 68-tag Fault Index, the Backcheck purse, the
   phase-mean ledger, the 30-job log and the COMMIT declaration are all gone — with the mechanics
   they measured. What is left is a best day and today's points.                                   */

/** Measures the STUDENT, survives the unit handoff: the best single day, in points. */
export function freshPlayer() {
  return { best: 0 };
}

/** Measures THIS unit's sitting: the points banked today, and the day they were banked on. */
export function freshGame() {
  return { today: 0, day: null };
}

const nat = (x, d) => (Number.isFinite(x) && x >= 0 ? Math.floor(x) : d);
const bool = (x, d) => (typeof x === 'boolean' ? x : d);
const isoOrNull = x => (typeof x === 'string' && x ? x : null);
/** `{...defaults, ...raw}` when raw is an object — unknown keys a later ticket adds always survive. */
const over = (d, raw) => (isObj(raw) ? { ...d, ...raw } : { ...d });

/**
 * normalizePlayer(raw) → a well-formed `save.player`. A non-object (or a missing key) becomes the
 * defaults; unknown keys pass through. Idempotent.
 */
export function normalizePlayer(raw) {
  const d = freshPlayer();
  const p = over(d, raw);
  p.best = nat(p.best, 0);
  return p;
}

/**
 * normalizeGame(raw) → a well-formed `save.game`. A non-object (or a missing key) becomes the
 * defaults; unknown keys pass through. Idempotent.
 *
 * `today` is a count of points and can only ever have been banked, so it is coerced to a
 * non-negative integer; `day` is the ISO day those points belong to, or null.
 */
export function normalizeGame(raw) {
  const d = freshGame();
  const g = over(d, raw);
  g.today = nat(g.today, 0);
  g.day = isoOrNull(g.day);
  return g;
}

/** A brand-new save at schema version SAVE_VERSION. */
export function fresh(now = Date.now()) {
  return {
    v: SAVE_VERSION,
    unitId: UNIT_ID,
    profileId: newProfileId(now),
    createdAt: now,
    settings: {
      theme: 'auto', sound: false, dailyGoal: 400,
      testDate: null, testTime: '08:00',
      askReasonOnMiss: true, callYourShot: false,
      /* The game's master switch (CUT-BRIEF: "`settings.game = false` returns the app to
         byte-identical COMPOSED behaviour"). Settings writes it and the game's modules read it, and
         for a whole round it was declared NOWHERE — it reached disk only because `fillDefaults`'s
         `{...d.settings, ...s.settings}` is not a whitelist. Declared here, coerced in
         `fillDefaults`, 13 B. */
      game: true,
    },
    xp: 0,
    streak: { count: 0, best: 0, lastDay: null, freezes: 0 },
    daily: {},
    cards: {},
    variants: {},
    frozen: {},
    skills: {},
    errors: [],
    counters: {},
    trophies: {},
    runs: [],
    inProgress: null,
    forecastLog: [],
    seedCounter: 0,
    placement: { done: false, at: null },
    jumps: {},
    postTest: { score: null },
    // `player` is kept across a unit swap; `game` is archived with the unit.
    player: freshPlayer(),
    game: freshGame(),
    archive: {},
  };
}

/* ---------------- migrations ---------------- */
// MIGRATIONS[n] upgrades a save at version n to n + 1. Add one entry per bump; never edit an old one.
export const MIGRATIONS = {
  // 0 = unversioned / pre-release shapes → v1. Everything missing gets its default.
  0: (s) => ({ ...s, v: 1 }),
  /**
   * 1 → 2 (COMPOSED-GAME G7). Adds the game layer's two top-level keys and NOTHING else: every v1
   * key is spread through untouched, so a v1 save loses nothing and gains exactly `player` + `game`.
   * The defaults are written first and `...s` second, so a save that somehow already carries them
   * (a v2 save hand-edited down to v1, an import) keeps its own — `fillDefaults` repairs it after.
   */
  1: (s) => ({ player: freshPlayer(), game: freshGame(), ...s, v: 2 }),
  /**
   * 2 → 3 (designs/CUT-BRIEF.md). DROPS the cut game keys and touches nothing else: every v2 key is
   * spread through untouched and exactly two are replaced — `player` and `game` — by the two the cut
   * design keeps. `fillDefaults` coerces them after.
   *
   * The old numbers are NOT carried over. `records.bestBag`, the rating, the rank and the Elo pair
   * were denominated in a currency that no longer exists (loot, bagged, rating points); re-printing
   * one of them as `best 419` would put a number on screen that the engine never computed — the one
   * thing CUT-BRIEF's hard limits forbid outright. `best` starts at 0 and is earned again in points.
   *
   * A live OLD session record is dropped with them, and the PAGE it was running is left exactly as
   * it is: `inProgress.queue`/`idx` survive untouched, so the student's half-answered page is still
   * there as a plain Today's Page and not one item of it leaves the schedule.
   */
  2: (s) => {
    const out = { ...s, player: freshPlayer(), game: freshGame(), v: 3 };
    if (isObj(out.inProgress) && 'game' in out.inProgress) {
      out.inProgress = { ...out.inProgress };
      delete out.inProgress.game;
    }
    return out;
  },
};

/** Fill every missing top-level key and sub-key with its default; coerce wrong types. Idempotent. */
function fillDefaults(s, now) {
  const d = fresh(now);
  const out = { ...d, ...s };
  for (const k of ['settings', 'streak', 'placement', 'postTest']) out[k] = { ...d[k], ...(isObj(s[k]) ? s[k] : {}) };
  for (const k of ['daily', 'cards', 'variants', 'frozen', 'skills', 'counters', 'trophies', 'jumps', 'archive']) if (!isObj(out[k])) out[k] = {};
  for (const k of ['errors', 'runs', 'forecastLog']) if (!Array.isArray(out[k])) out[k] = [];
  if (typeof out.xp !== 'number' || !Number.isFinite(out.xp)) out.xp = 0;
  if (!Number.isInteger(out.seedCounter) || out.seedCounter < 0) out.seedCounter = 0;
  if (typeof out.profileId !== 'string' || !out.profileId) out.profileId = d.profileId;
  if (typeof out.unitId !== 'string' || !out.unitId) out.unitId = LEGACY_UNIT_ID;
  if (typeof out.createdAt !== 'number' || !Number.isFinite(out.createdAt)) out.createdAt = now;
  if (out.inProgress !== null && !isObj(out.inProgress)) out.inProgress = null;
  // The game's two keys. A corrupt `player` or `game` is discarded to its defaults here and nowhere
  // else, so it can never take a sibling key down with it. Both normalizers are idempotent.
  out.player = normalizePlayer(s.player);
  out.game = normalizeGame(s.game);
  const t = out.settings.theme; if (t !== 'light' && t !== 'dark') out.settings.theme = 'auto';
  const g = out.settings.dailyGoal; out.settings.dailyGoal = Number.isFinite(g) ? Math.min(800, Math.max(100, Math.round(g))) : 400;
  /* The game's master switch, coerced in the SAME DIRECTION every reader reads it. Every read is
     `settings.game !== false`, so this FAILS OPEN by construction: only a literal `false` switches the
     layer off, and a hand-edited `"false"`, an imported `{}` or a `0` becomes `true` on the way in
     instead of surviving as an undeclared, uncoerced pass-through. Nothing about the layer's
     on/off decision changes — what changes is that the stored value is now a declared boolean. */
  out.settings.game = bool(out.settings.game, true);
  return out;
}

/**
 * migrate(raw, now, opts) → a save at SAVE_VERSION. Walks MIGRATIONS from raw.v (0 when absent) upward,
 * then fills defaults. Throws on a non-object or a broken chain; a save from a NEWER app version is kept
 * as-is (defaults filled) rather than destroyed — the caller may flag it.
 *
 * The SECOND migration axis (COMPOSED S8 #19) is the unit: pass `opts.unit = { id, skills }` — the unit
 * this build teaches and the id list from ITS `data/skills.js`. When the save was written under a
 * different unit, the finished unit is filed under `save.archive[<old unitId>]` and the live save is
 * reset for the new one. Omit `opts.unit` (every existing caller does) and nothing about units happens.
 */
export function migrate(raw, now = Date.now(), { unit = null } = {}) {
  if (!isObj(raw)) throw new TypeError('save is not an object');
  let s = raw;
  let v = Number.isInteger(s.v) && s.v >= 0 ? s.v : 0;
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (typeof step !== 'function') throw new Error(`no migration from save v${v}`);
    s = step(s);
    if (s.v !== v + 1) throw new Error(`migration ${v} → ${v + 1} produced v${s.v}`);
    v = s.v;
  }
  /* The unit hand-off no longer needs a special pass: `save.game` is two scalars, so there is no
     crew map to filter and nothing a filter could delete before `archiveUnit` copies it out
     (notes/DEMOLISH.md). */
  const out = fillDefaults(s, now);
  return unit ? archiveUnit(out, unit, now) : out;
}

/* ---------------- unit hand-off (COMPOSED S8 #19) ---------------- */

/** The first unused key for `unitId` in `archive` — `u1a`, then `u1a~2`, `u1a~3`… An archive entry is never overwritten. */
function archiveSlot(archive, unitId) {
  if (!(unitId in archive)) return unitId;
  for (let n = 2; ; n++) { const k = `${unitId}~${n}`; if (!(k in archive)) return k; }
}

/**
 * archiveUnit(save, unit, now) → save. Idempotent: when `save.unitId === unit.id` it is a no-op, so it is
 * safe to call on every load. Otherwise, in one pass:
 *   1. every ARCHIVED_KEYS value is copied into `save.archive[<old unitId>]` (never overwritten — a second
 *      archive of the same unit lands in `<id>~2`), together with the version and a small `stats` block;
 *   2. the live copies are reset to a fresh unit's defaults;
 *   3. `skills` is re-seeded from the archived record for every id the NEW unit's `skills.js` REUSES
 *      (S8 #19: "resets `skills` unless the next unit's skills.js reuses an id"). `unit.skills` may be an
 *      array of ids, a Set, or `{ SKILL_IDS }`-ish; omit it and every skill record is kept (the caller did
 *      not say what the new unit teaches, so dropping mastery would be a guess);
 *   4. KEPT_KEYS (xp, streak, trophies, settings, daily, counters, the ledger) are not touched.
 *
 * @param {object} save   a migrated save (post-fillDefaults)
 * @param {{id: string, skills?: string[]|Set<string>}} unit  the unit this build now teaches
 * @param {number} now
 */
export function archiveUnit(save, unit, now = Date.now()) {
  const id = String(unit?.id ?? '');
  if (!id) throw new TypeError('archiveUnit: unit.id is required');
  const from = typeof save.unitId === 'string' && save.unitId ? save.unitId : LEGACY_UNIT_ID;
  save.unitId = from;
  if (from === id) return save;                       // same unit — nothing to hand off
  if (!isObj(save.archive)) save.archive = {};

  const entry = { unitId: from, archivedAt: now, v: save.v ?? SAVE_VERSION };
  for (const k of ARCHIVED_KEYS) entry[k] = save[k];
  entry.stats = {
    cards: Object.keys(entry.cards ?? {}).length,
    variants: Object.keys(entry.variants ?? {}).length,
    frozen: Object.keys(entry.frozen ?? {}).length,
    skills: Object.keys(entry.skills ?? {}).length,
    runs: (entry.runs ?? []).length,
    errors: (entry.errors ?? []).length,
    xpAtArchive: save.xp ?? 0,
  };
  save.archive[archiveSlot(save.archive, from)] = entry;

  const blank = fresh(now);
  for (const k of ARCHIVED_KEYS) save[k] = blank[k];

  // Reused skill ids keep their mastery record; everything else starts at zero for the new unit.
  const reuse = unit.skills instanceof Set ? unit.skills : Array.isArray(unit.skills) ? new Set(unit.skills) : null;
  const old = entry.skills;
  if (isObj(old)) {
    if (reuse === null) save.skills = { ...old };
    else for (const k of Object.keys(old)) if (reuse.has(k)) save.skills[k] = old[k];
  }

  save.unitId = id;
  return save;
}

/** Every archive entry, newest first — what Settings lists under "Past units". */
export function archivedUnits(save) {
  const a = isObj(save?.archive) ? save.archive : {};
  return Object.keys(a)
    .map(key => ({ key, ...a[key] }))
    .sort((x, y) => (y.archivedAt ?? 0) - (x.archivedAt ?? 0));
}

/* ---------------- caps ---------------- */
const clipStr = (x, n) => (typeof x === 'string' && x.length > n ? x.slice(0, n) : x);

/** Enforce every cap in place. Pure w.r.t. everything else; returns the same object. */
export function applyCaps(s) {
  for (const id of Object.keys(s.cards)) {
    const c = s.cards[id];
    if (!isObj(c)) { delete s.cards[id]; continue; }
    if (Array.isArray(c.history) && c.history.length > CAPS.history) c.history = c.history.slice(-CAPS.history);
    if (Array.isArray(c.foilProgress) && c.foilProgress.length > CAPS.foilProgress) c.foilProgress = c.foilProgress.slice(-CAPS.foilProgress);
    if (typeof c.work === 'string' && c.work.length > CAPS.cardWork) c.work = c.work.slice(0, CAPS.cardWork);
  }

  if (s.errors.length > CAPS.errors) {
    let drop = s.errors.length - CAPS.errors;
    const keep = new Array(s.errors.length).fill(true);
    for (let i = 0; i < s.errors.length && drop > 0; i++) if (s.errors[i]?.cleared) { keep[i] = false; drop--; }
    for (let i = 0; i < s.errors.length && drop > 0; i++) if (keep[i]) { keep[i] = false; drop--; }
    s.errors = s.errors.filter((_, i) => keep[i]);
  }
  for (const e of s.errors) if (isObj(e) && typeof e.got === 'string') e.got = clipStr(e.got, CAPS.rawChars);

  if (s.runs.length > CAPS.runs) s.runs = s.runs.slice(-CAPS.runs);
  let workLeft = CAPS.workRuns;
  for (let i = s.runs.length - 1; i >= 0; i--) {
    const r = s.runs[i];
    if (!isObj(r) || !Array.isArray(r.items)) continue;
    const keepWork = WORK_KINDS.has(String(r.kind).split(':')[0]) && workLeft > 0;
    if (keepWork) workLeft--;
    for (const it of r.items) {
      if (!isObj(it)) continue;
      if (typeof it.raw === 'string') it.raw = clipStr(it.raw, CAPS.rawChars);
      if (!('work' in it)) continue;
      if (keepWork) it.work = clipStr(it.work, CAPS.workChars); else delete it.work;
    }
  }

  for (const k of Object.keys(s.frozen)) { const f = s.frozen[k]; if (!isObj(f) || (f.bucket ?? 0) >= 3) delete s.frozen[k]; }
  const fk = Object.keys(s.frozen);
  if (fk.length > CAPS.frozen) {
    fk.sort((a, b) => (s.frozen[a].due ?? 0) - (s.frozen[b].due ?? 0));
    for (const k of fk.slice(CAPS.frozen)) delete s.frozen[k];
  }

  const dk = Object.keys(s.daily);
  if (dk.length > CAPS.daily) { dk.sort(); for (const k of dk.slice(0, dk.length - CAPS.daily)) delete s.daily[k]; }
  if (s.forecastLog.length > CAPS.forecastLog) s.forecastLog = s.forecastLog.slice(-CAPS.forecastLog);

  /* THE GAME'S TWO KEYS ARE BOUNDED BY CONSTRUCTION and need no cap here: `player.best` and
     `game.today` are single integers, and `inProgress.game` is seven scalar fields
     (`data/job.js IN_PROGRESS_KEYS`). The rating window, the job log, the press heat window and the
     68-tag Fault Index — the four collections this block used to trim — are cut (notes/DEMOLISH.md). */
  return s;
}

/* ---------------- streak (S4) ---------------- */
/**
 * Lazy freeze reconciliation on open: walk every missed day between streak.lastDay and today, consume
 * freezes in order, reset at the first uncovered gap. Today itself is never a gap (its goal is still open).
 */
export function reconcileStreak(s, today = todayISO()) {
  const st = s.streak;
  if (!st.lastDay) return s;
  const gap = diffDays(st.lastDay, today);
  if (Number.isNaN(gap)) { st.lastDay = null; st.count = 0; return s; }
  if (gap <= 1) return s;                       // counted yesterday or today: intact
  let missed = gap - 1;                         // whole days strictly between
  while (missed > 0 && st.freezes > 0) { st.freezes--; missed--; }
  if (missed > 0) { st.best = Math.max(st.best, st.count); st.count = 0; st.lastDay = null; }
  else st.lastDay = addDays(today, -1);         // bridged: the chain is intact through yesterday
  return s;
}

/** Call when the daily goal is met on `today`. Idempotent per day. Earns a freeze per 5-day streak (max 2). */
export function markStreakDay(s, today = todayISO()) {
  const st = s.streak;
  if (st.lastDay === today) return s;
  reconcileStreak(s, today);
  st.count = st.lastDay && diffDays(st.lastDay, today) === 1 ? st.count + 1 : 1;
  st.best = Math.max(st.best, st.count);
  st.lastDay = today;
  if (st.count % 5 === 0) st.freezes = Math.min(2, st.freezes + 1);
  return s;
}

/* ---------------- the game's day (designs/CUT-SPEC.md §6 `today 186 points`) ---------------- */
/**
 * `game.today` is the points banked ON `game.day`. Opened on any other day those points are
 * yesterday's, and printing them as today's would put a number on screen that the engine never
 * computed — the one thing CUT-BRIEF's hard limits forbid outright. So the day rolls over HERE, and
 * here only: on load, on import, and before every `update()`. No surface has to remember to check the
 * date, and there is no second rollover to disagree with this one.
 *
 * THE ORDER OF THE TWO LINES IS THE WHOLE FUNCTION. `player.best` is floored from `game.today`
 * BEFORE the roll zeroes it, so the day that is closing is still counted: a save that arrives with a
 * 186-point day dated yesterday and `best 9` leaves with `best 186`. (Flooring after the roll read
 * the `0` it had just written, so the floor was dead in exactly the case it was written for — an
 * import or a hand edit that arrives with the two disagreeing.) The floor only ever RAISES `best`
 * (CUT-BRIEF math #6: improving never costs), and only to a number the engine did compute: the points
 * banked on a day that happened.
 *
 * A LIVE SESSION DOES NOT OWN THE CALENDAR. The roll used to be skipped while `inProgress.game`
 * existed (notes/cut-machine.md R4, notes/cut-integrate.md §2.2), so that a session running through
 * local midnight did not watch `today` fall across a reload. That exemption is what let a session
 * started before bed and finished the next afternoon print `today 548 points` when 48 of them were
 * banked today — and because `best` is only ever raised, the two-day sum became the student's "best
 * single day" permanently. A number that falls to 0 at midnight is exact; a number that is the sum
 * of two days is not, and `today` must only ever name the calendar day the student is looking at.
 * Nothing is lost by rolling: the floor above has already taken the closing day into `best`, and the
 * unbanked pile goes home with it — see the next paragraph, which is the other half of the same
 * sentence and used to say this function never touched the live record.
 *
 * The roll STAMPS the new day rather than clearing it. `job/state.js bank()` takes no clock and rolls
 * nothing of its own — it adds its points to whatever day `game.day` names — so leaving `null` behind
 * would make the NEXT reconcile roll away the points that had just been banked.
 *
 * AND THE UNBANKED PILE COMES HOME TO THE DAY IT WAS WON ON (r3, exploit-hunt). Flooring `best` and
 * zeroing `today` fixed the BANKED half and left the other one: banking is never required, so the
 * pile survived the roll intact and banked the next afternoon, and `today 946 points` / `best 946`
 * then named a day on which the student had answered nothing. That is the same defect in the same
 * sentence — `today` must only ever name the calendar day the student is looking at, and `best` is
 * "the best single day, in points", not one day's pile plus another day's play. So the closing day
 * takes its own pile with it, in the one order that works: DRAIN, then floor, then roll. The pile is
 * added to the closing day's `today`, the floor (already here, already only ever raising) carries
 * that true total into `best`, and the roll then zeroes `today` for the day the student is looking
 * at. Nothing is destroyed and no number is invented — `best` is a day that happened, and the
 * session, its queue, its index, its seed and its answered count carry on into the new day exactly
 * as they did. The pile goes to 0 and the streak to ×1 because that is what taking a pile home IS
 * (`job/state.js bankPile`): the drain is the bank the student could have tapped, not a new verb.
 *
 * A BID IN FLIGHT HOLDS THE DAY OPEN. `bank()` refuses while a call is locked — the bid is backed by
 * the pile and the question is already on screen — and this function obeys the same refusal, because
 * draining a pile out from under a standing bid floors its cost to nothing and hands the student a
 * free question at full pay, which is the exploit that refusal exists to prevent. So a real bid
 * defers the WHOLE roll (the floor still runs; it only ever raises), and that deferral is invisible
 * and bounded: no surface reads `game.today` during play, `bank()` cannot be reached over a bid, and
 * the bid is cleared by the next thing that happens to it either way — `screens/job.js
 * settleAbandonedBid` on the next mount, or `answer` in a tab that never reloaded. The roll then
 * completes on the very next `update()`, before anything can print a number. A bidless seal
 * (`{ id: null }` — a requeued review, an abandoned question) is not a bid and does not defer it,
 * exactly as `bank()` already treats it.
 *
 * …AND THE DEFERRED ROLL BANKS THE PILE THE CLOSING DAY HAD, NOT THE ONE THE NEXT DAY MADE OF IT
 * (r5, exploit-hunt, MAJOR). The deferral above is right about the bid and was wrong about the
 * arithmetic: the bid is settled by `answer()`, which ADDS this question's pay to the pile, and the
 * roll then ran against the grown pile and credited the closing day with points won after midnight —
 * a 500-point day with a 94-point pile on the table became `best 644`, which is 594 plus a 50-point
 * question answered on the NEXT day. That is the two-day sum this whole function exists to prevent,
 * one verb further down.
 *
 * `opts.held` is the closing day's own pile — the pile as it stood at the instant the day turned —
 * and the drain credits `min(pile, held)` and leaves the rest where it is, on the new day, in the
 * pile that won it. It needs no field on the save and no memory between sessions, because WHILE A
 * REAL BID STANDS THE PILE CANNOT MOVE: the only two writers are `job/state.js answer()`, which
 * clears the bid in the same breath, and `bankPile`, which `bank()` refuses to reach over one. So
 * the pile this function reads on any deferred pass IS the closing pile, however many updates or
 * reloads the bid is held across, and `store.update()` reads it once before the verb runs and hands
 * it back here after (see `update`). Omit `held` — every other caller does — and the whole pile goes
 * home exactly as it always did.
 *
 * THE DRAIN IS WRITTEN HERE RATHER THAN CALLED FROM THE ENGINE, and that is a dependency fact, not a
 * preference: `store.js` reaches 3 modules today and would reach 58 through `js/job/state.js`, which
 * imports `page.js` → `schedule.js` → back into this file. A save layer that pulls the whole card
 * bank onto the cold-open boot path is also a save layer that loads the game for a student who has
 * switched it off. What keeps the two copies honest is a test, not a comment: `tests/job-save.test.mjs`
 * drives the SHIPPED `job/state.js bank()` and this roll over the same pile and asserts they leave
 * the same `today` / `best` / `pile` / `streak`.
 *
 * Idempotent, and total: a save whose `game` or `player` is not an object is left to `fillDefaults`,
 * and a record whose `pile` or `today` is not a non-negative integer is carried unchanged — this
 * function repairs nothing and throws on nothing.
 */
export function reconcileGameDay(s, today = todayISO(), opts = {}) {
  const held = isObj(opts) ? opts.held : null;
  const g = s.game;
  if (!isObj(g)) return s;
  const p = s.player;
  const floorBest = () => {
    if (isObj(p) && Number.isFinite(+p.best) && Number.isFinite(+g.today) && +g.today > +p.best) p.best = +g.today;
  };
  const live = isObj(s.inProgress) && isObj(s.inProgress.game) ? s.inProgress.game : null;
  // …a bid is on the table: the day is not closable yet. Floor, and leave everything else standing.
  if (live && isObj(live.call) && typeof live.call.id === 'string') { floorBest(); return s; }
  // The day that is CLOSING takes its own pile home first. `g.day === null` names no day to credit.
  if (g.day !== today && typeof g.day === 'string' && g.day && live
      && Number.isInteger(+g.today) && +g.today >= 0
      && Number.isInteger(+live.pile) && +live.pile > 0) {
    const pile = +live.pile;
    /* The closing day's OWN pile, and no more of it than that: what the next day's play has since
       added stays in the pile it was won in (see `held` above). `held` is a count of points, so a
       non-integer, a negative or a `null` is not one and the whole pile goes home as it always did. */
    const owed = typeof held === 'number' && Number.isInteger(held) && held >= 0 ? Math.min(pile, held) : pile;
    if (owed > 0) {
      g.today = +g.today + owed;
      live.pile = pile - owed;
      live.streak = 1;
    }
  }
  floorBest();
  if (g.day !== today) { g.today = 0; g.day = today; }
  return s;
}

/**
 * The pile a standing bid is holding the roll open over — the closing day's own — or `null` when
 * nothing is deferred. Read by `update()` BEFORE the verb runs, so it is the pile as the day turned
 * and not the pile the verb is about to make of it; see `reconcileGameDay`'s `held` for why that is
 * the same number on every deferred pass. Pure, DOM-free, and it repairs nothing.
 */
export function deferredPile(s, today = todayISO()) {
  const g = isObj(s) ? s.game : null;
  if (!isObj(g) || g.day === today || typeof g.day !== 'string' || !g.day) return null;
  const live = isObj(s.inProgress) && isObj(s.inProgress.game) ? s.inProgress.game : null;
  if (!live || !isObj(live.call) || typeof live.call.id !== 'string') return null;
  return Number.isInteger(+live.pile) && +live.pile > 0 ? +live.pile : 0;
}

/**
 * Everything the roll can move, as one comparable string: `game.today` / `game.day`, `player.best`
 * and the live record's pile and streak. `update()` and `rollDay()` use it to answer one question —
 * "did the clock just move a number?" — because a roll that moved one and was neither written nor
 * announced leaves memory, the disk and the screen holding three different piles (r5, exploit-hunt,
 * BLOCKER). Cheap: five scalars, off the hot path of nothing.
 */
function gameReading(s) {
  const g = isObj(s) ? s.game : null;
  const p = isObj(s) ? s.player : null;
  const live = isObj(s?.inProgress) && isObj(s.inProgress.game) ? s.inProgress.game : null;
  return JSON.stringify([
    isObj(g) ? [g.today ?? null, g.day ?? null] : null,
    isObj(p) ? (p.best ?? null) : null,
    live ? [live.pile ?? null, live.streak ?? null] : null,
  ]);
}

/* ---------------- disk format (packed) ----------------
   In memory every record is the S6 object shape. On disk, two hot arrays are stored as tuples so a
   full save stays small: card history {at,ok,attempt,hints,ms} → [at, ok?1:0, attempt, hints, ms] and
   foilProgress {day,via} → [day, via]. Entries with any other key set pass through untouched, so a
   later ticket adding a field never breaks the codec. unpack() accepts both forms (imports, .bak). */
const HIST_KEYS = ['at', 'ok', 'attempt', 'hints', 'ms'];
const sameKeys = (o, keys) => { const k = Object.keys(o); return k.length === keys.length && keys.every(x => x in o); };

function packCard(c) {
  if (!isObj(c)) return c;
  const out = { ...c };
  if (Array.isArray(c.history)) out.history = c.history.map(h => (isObj(h) && sameKeys(h, HIST_KEYS) ? [h.at, h.ok ? 1 : 0, h.attempt, h.hints, h.ms] : h));
  if (Array.isArray(c.foilProgress)) out.foilProgress = c.foilProgress.map(f => (isObj(f) && sameKeys(f, ['day', 'via']) ? [f.day, f.via] : f));
  return out;
}
function unpackCard(c) {
  if (!isObj(c)) return c;
  const out = { ...c };
  if (Array.isArray(c.history)) out.history = c.history.map(h => (Array.isArray(h) && h.length === 5 ? { at: h[0], ok: !!h[1], attempt: h[2], hints: h[3], ms: h[4] } : h));
  if (Array.isArray(c.foilProgress)) out.foilProgress = c.foilProgress.map(f => (Array.isArray(f) && f.length === 2 ? { day: f[0], via: f[1] } : f));
  return out;
}
const mapCards = (m, fn) => { const out = {}; for (const id of Object.keys(m)) out[id] = fn(m[id]); return out; };

/** In-memory state → the JSON-ready disk object (a shallow copy; the state is never mutated). */
export function pack(s) {
  const out = { ...s, cards: mapCards(s.cards, packCard) };
  if (isObj(s.archive)) {
    out.archive = {};
    for (const k of Object.keys(s.archive)) {
      const e = s.archive[k];
      out.archive[k] = isObj(e) && isObj(e.cards) ? { ...e, cards: mapCards(e.cards, packCard) } : e;
    }
  }
  return out;
}
/** Disk object (packed or plain) → in-memory shape. Mutates and returns `s`. */
export function unpack(s) {
  if (isObj(s.cards)) for (const id of Object.keys(s.cards)) s.cards[id] = unpackCard(s.cards[id]);
  if (isObj(s.archive)) for (const k of Object.keys(s.archive)) {
    const e = s.archive[k];
    if (isObj(e) && isObj(e.cards)) for (const id of Object.keys(e.cards)) e.cards[id] = unpackCard(e.cards[id]);
  }
  return s;
}

/* ---------------- storage ---------------- */
function memoryStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
  };
}

function browserStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const ls = window.localStorage;
      const probe = '__u1a_probe__';
      ls.setItem(probe, '1'); ls.removeItem(probe);   // Safari private mode used to throw here
      return ls;
    }
  } catch { /* fall through */ }
  return null;
}

/**
 * createStore({ storage, now, debounceMs, doc, unit }) — an isolated store instance.
 *   storage: Storage-like {getItem,setItem,removeItem}; null → in-memory (flags.memoryOnly = true)
 *   now: clock (ms); doc: Document for visibilitychange/pagehide flushes (omit under Node)
 *   unit: { id, skills } — the unit this build teaches; a save from another unit is archived on load
 *         (S8 #19). Defaults to this build's own UNIT_ID + SKILL_IDS; pass `null` to disable.
 * All methods are closures — safe to destructure.
 */
export function createStore({ storage = undefined, now = Date.now, debounceMs = 250, doc = undefined, unit = { id: UNIT_ID, skills: SKILL_IDS } } = {}) {
  const flags = { memoryOnly: false, corruptRecovered: false, newerSave: false, lastError: null, lastSavedAt: null, loaded: false, archivedUnit: null };
  let store = storage === undefined ? browserStorage() : storage;
  if (!store) { store = memoryStorage(); flags.memoryOnly = true; }

  let state = null;
  let dirty = false;
  let timer = null;
  let dayTimer = null;   // the local-midnight tick (browser only — see `armDayTick`)
  let blocked = false;   // a save we could not READ is never overwritten this session (reset/import lift it)
  const subs = new Set();

  const notify = (reason) => { for (const fn of subs) { try { fn(state, reason); } catch (e) { console.error(e); } } };

  function backup(raw) {
    if (typeof raw !== 'string') return false;
    try { store.setItem(BAK_KEY, raw); return true; } catch (e) { flags.lastError = String(e); return false; }
  }

  function writeNow() {
    if (!state || blocked) return false;
    try {
      store.setItem(SAVE_KEY, JSON.stringify(pack(state)));
      dirty = false; flags.lastSavedAt = now();
      if (flags.memoryOnly === 'error') flags.memoryOnly = false;
      return true;
    } catch (e) {
      flags.lastError = String(e); flags.memoryOnly = flags.memoryOnly || 'error';
      return false;
    }
  }

  function load() {
    const today = todayISO(new Date(now()));
    let raw = null;
    try { raw = store.getItem(SAVE_KEY); } catch (e) { flags.lastError = String(e); flags.memoryOnly = flags.memoryOnly || 'error'; blocked = true; }
    if (raw == null) {
      state = fresh(now());
      dirty = true;
    } else {
      try {
        const parsed = JSON.parse(raw);
        if (!isObj(parsed)) throw new TypeError('save is not an object');
        if (Number.isInteger(parsed.v) && parsed.v > SAVE_VERSION) flags.newerSave = true;
        const wasUnit = typeof parsed.unitId === 'string' && parsed.unitId ? parsed.unitId : LEGACY_UNIT_ID;
        const migrated = unpack(migrate(parsed, now(), { unit }));
        if (migrated.unitId !== wasUnit) flags.archivedUnit = wasUnit;   // Settings can say "Unit 1A filed away"
        dirty = migrated.v !== parsed.v || flags.archivedUnit !== null;
        state = migrated;
      } catch (e) {
        flags.corruptRecovered = backup(raw) ? BAK_KEY : true;
        flags.lastError = String(e);
        state = fresh(now());
        dirty = true;
      }
    }
    applyCaps(state);
    reconcileStreak(state, today);
    reconcileGameDay(state, today);
    flags.loaded = true;
    if (dirty) writeNow();
    notify('load');
    return state;
  }

  const getState = () => state ?? load();

  function schedule() {
    dirty = true;
    if (timer) return;
    timer = setTimeout(() => { timer = null; writeNow(); }, debounceMs);
    if (typeof timer?.unref === 'function') timer.unref();
  }

  /** Write the pending save now (visibilitychange, before unload, before an export). */
  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    return dirty ? writeNow() : true;
  }

  /** save({immediate}) — mark dirty and schedule the debounced write (or write now). */
  function save({ immediate = false } = {}) {
    if (!state) load();
    if (!immediate) { schedule(); return true; }
    // T17: mark dirty FIRST. `flush()` is dirty-gated, so `save({immediate:true})` (and therefore
    // `update(fn, {immediate:true})`) used to write nothing at all whenever the state happened to be
    // clean — e.g. the very first change after load(). "Write now" must write.
    dirty = true;
    return flush();
  }

  /**
   * THE ROLL, AS ITS OWN TRANSACTION — reconcile, and if the clock moved a number, cap it, announce
   * it and write it THEN, before anything else happens. Returns whether it moved anything.
   *
   * Every path into the roll goes through here, and that is the whole of r5's fix: the day is an
   * event of its own on the shell's clock (`rollDay`), on the document coming back, on load — and
   * even inside `update()`, where it is committed before the verb runs rather than folded into it.
   * A roll that is not its own transaction is a roll a throw can strand (memory, the disk and the
   * strip each holding a different pile) and a roll that empties the pile the verb it preceded is
   * about to report on.
   */
  function rollAt(day, held = null) {
    const s = getState();
    const before = gameReading(s);
    reconcileGameDay(s, day, { held });
    if (gameReading(s) === before) return false;
    applyCaps(s);
    notify('update');
    save({ immediate: true });
    return true;
  }

  /**
   * update(fn, {immediate}) — fn(state) mutates in place (or returns a replacement object); caps are
   * re-applied, subscribers notified, the write scheduled. Returns the state.
   */
  function update(fn, { immediate = false } = {}) {
    getState();                                   // the state is loaded before the clock is read
    const day = todayISO(new Date(now()));
    /* THE DAY ROLLS BEFORE THE MUTATION, never after it. `js/job/state.js bank()` reads no clock by
       design — it adds its points to whatever day `game.day` already names — so the save layer owes it
       a `game` that names the current one. A reconcile placed after `fn` would zero points banked a
       moment earlier; placed here, a session that outlives local midnight banks into the new day and
       `game.today` is the points banked today even in the tab that was never reloaded. Idempotent, and
       inert on the study path: it reads the clock and touches `player`, `game` and — only to send a
       closing day's unbanked pile home with it — `inProgress.game`. Ledger A is never in reach.

       THIS IS THE BACKSTOP, NOT THE CLOCK. `rollDay()` below is armed on local midnight and on the
       document coming back, so in a browser the roll has almost always already happened by the time a
       verb runs and the student taps against the reading he is looking at (r5, exploit-hunt). What is
       left here is the tab that saw neither event — and a save layer that trusted a timer would be a
       save layer with a day that sometimes does not turn.

       AND IT IS COMMITTED BEFORE THE VERB, NOT WITH IT. `rollAt` announces and writes whatever the
       clock moved on its own; a throw out of `fn` can then cost the verb and nothing else. The roll
       used to ride inside this call, so `call()` throwing `unaffordable` against a pile the same call
       had just emptied left memory at 0, localStorage at 94 and the strip printing a third reading
       with two dead controls on it (r5, exploit-hunt, BLOCKER). */
    rollAt(day);
    /* The pile a standing bid is deferring, read BEFORE `fn` — the closing day's own. */
    const held = deferredPile(state, day);
    let r; let failure = null;
    try { r = fn(state); } catch (e) { failure = e; }
    if (!failure && isObj(r) && r !== state) state = r;
    /* …and the deferral ends the moment the bid does. `answer()` settles the bid and adds this
       question's pay in one breath, so the roll has to finish AFTER it or the closing day is credited
       with points won on the next one — and it has to be told what the closing pile was, or it credits
       them anyway. A bid still standing leaves this a no-op, exactly as the pass above was. */
    if (held !== null) rollAt(day, held);
    if (failure) throw failure;
    applyCaps(state);
    notify('update');
    save({ immediate });
    return state;
  }

  /**
   * ROLL THE DAY, ON ITS OWN, AT THE MOMENT IT TURNS — and announce it.
   *
   * The roll used to happen only inside `update()`, which made the verb the student tapped the verb
   * that silently emptied his pile: a session left open across local midnight drained on whichever
   * verb came first, so BANK reported the pile it had already sent home and the receipt said
   * `today 0 points` over a tap the student had watched grow to 144 (r5, exploit-hunt, MAJOR).
   *
   * The day is the shell's event, not the student's. This is armed on local midnight and on the
   * document coming back from hidden — a phone locked overnight on a face-down card is the common
   * case, and `visibilitychange` is the browser telling us the clock may have moved. It writes
   * immediately and notifies, so the pile that went home did so at an instant every surface can see,
   * before anything is tapped against it. No-op when nothing moved. Returns whether it moved.
   */
  function rollDay() { return rollAt(todayISO(new Date(now()))); }

  /** The next local midnight, one second past it, as a delay in ms — clamped so it can never spin. */
  function armDayTick() {
    if (typeof setTimeout !== 'function') return;
    if (dayTimer) clearTimeout(dayTimer);
    const t = new Date(now());
    const next = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1, 0, 0, 1).getTime();
    const ms = Math.min(Math.max(next - now(), 1000), 86400000);
    dayTimer = setTimeout(() => { dayTimer = null; try { rollDay(); } catch (e) { console.error(e); } armDayTick(); }, ms);
    if (typeof dayTimer?.unref === 'function') dayTimer.unref();
  }

  /** The save as disk-format JSON (packed, compact) — what Settings shows in the textarea / download link. */
  function exportJSON() {
    flush();
    return JSON.stringify(pack(getState()));
  }

  /** importJSON(text) — validate, migrate, cap, back up the current save to .bak, replace, write now. Throws with a readable message. */
  function importJSON(text) {
    let parsed;
    try { parsed = JSON.parse(String(text)); } catch { throw new Error('That is not valid JSON.'); }
    if (!isObj(parsed)) throw new Error('That JSON is not a save object.');
    const looksLikeSave = ['cards', 'settings', 'xp', 'skills', 'runs'].some(k => k in parsed);
    if (!looksLikeSave) throw new Error('That JSON has none of the save fields (cards, settings, xp …).');
    if (Number.isInteger(parsed.v) && parsed.v > SAVE_VERSION) throw new Error(`Save is v${parsed.v}; this app reads up to v${SAVE_VERSION}.`);
    let next;
    try { next = unpack(migrate(parsed, now(), { unit })); } catch (e) { throw new Error('Could not migrate that save: ' + e.message); }
    applyCaps(next);
    const todayIn = todayISO(new Date(now()));
    reconcileStreak(next, todayIn);
    reconcileGameDay(next, todayIn);
    if (state && !blocked) { try { backup(JSON.stringify(pack(state))); } catch { /* ignore */ } }
    blocked = false;
    state = next; dirty = true; flags.loaded = true;
    writeNow();
    notify('import');
    return state;
  }

  /** reset() — back up the current save to .bak, start fresh, write now. */
  function reset() {
    if (state && !blocked) { try { backup(JSON.stringify(pack(state))); } catch { /* ignore */ } }
    blocked = false;
    state = fresh(now()); dirty = true; flags.loaded = true;
    writeNow();
    notify('reset');
    return state;
  }

  function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }

  /** The raw .bak text, if any (Settings can offer "restore backup"). */
  function readBackup() { try { return store.getItem(BAK_KEY); } catch { return null; } }

  /**
   * Hand this save over to another unit NOW (Settings → "Start the next unit", or a data swap that the
   * student's browser has not re-opened yet). `next` defaults to this build's unit. Returns the state.
   */
  function migrateUnit(next = unit ?? { id: UNIT_ID, skills: SKILL_IDS }) {
    const s = getState();
    const from = s.unitId;
    archiveUnit(s, next, now());
    if (s.unitId !== from) flags.archivedUnit = from;
    applyCaps(s);
    notify('unit');
    save({ immediate: true });
    return s;
  }

  if (doc && typeof doc.addEventListener === 'function') {
    /* Going away: write. Coming back: the clock may have passed midnight while nobody was looking,
       and the reading on screen is about to be tapped against. Roll first, print after. */
    doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'hidden') flush(); else { try { rollDay(); } catch (e) { console.error(e); } } });
    if (doc.defaultView) doc.defaultView.addEventListener('pagehide', flush);
    armDayTick();
  }

  return { load, getState, update, save, flush, rollDay, exportJSON, importJSON, reset, subscribe, readBackup, migrateUnit, unit, flags, get dirty() { return dirty; }, get blocked() { return blocked; } };
}

/* ---------------- default instance (the app's save) ---------------- */
export const store = createStore({ doc: typeof document !== 'undefined' ? document : undefined });
export const { load, getState, update, save, flush, rollDay, exportJSON, importJSON, reset, subscribe, readBackup, migrateUnit, flags } = store;
