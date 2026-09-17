// store.js — the save (COMPOSED S6 "Save schema"). localStorage["u1a.save"], JSON, `v` + a migration
// chain, debounced writes, visibilitychange flush, try/catch around every storage access with an
// in-memory fallback + banner flags, corrupt JSON copied to "u1a.save.bak", and the S6 caps.
// Pure pieces (fresh, migrate, applyCaps, reconcileStreak, markStreakDay) are exported for tests and for
// later tickets; `createStore` builds an instance around any Storage-like object; the default instance
// is bound to window.localStorage (memory-only under Node or when storage throws).
import { todayISO, diffDays, addDays } from './days.js';
// The ONLY content dependency of the save layer: the id list of the unit this build teaches, so a
// data swap resets `skills` for real without app.js having to remember to wire it (S8 #19).
import { SKILL_IDS } from '../data/skills.js';

export const SAVE_KEY = 'u1a.save';
export const BAK_KEY = 'u1a.save.bak';
export const SAVE_VERSION = 1;

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
 */
export const ARCHIVED_KEYS = Object.freeze(['cards', 'variants', 'frozen', 'runs', 'errors', 'skills', 'forecastLog', 'placement', 'jumps', 'postTest', 'inProgress']);
/** Kept live across a unit swap (S8 #19: xp, streak, trophies, settings — plus the identity/ledger keys). */
export const KEPT_KEYS = Object.freeze(['v', 'unitId', 'profileId', 'createdAt', 'settings', 'xp', 'streak', 'daily', 'counters', 'trophies', 'seedCounter', 'archive']);

/** S6 caps (+ two bounds the spec leaves implicit, so the < 250 KB budget is provable). */
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
});

const WORK_KINDS = new Set(['mock', 'baseline', 'night']);

const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);

function newProfileId(now) {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'p-' + now.toString(36);
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
    archive: {},
  };
}

/* ---------------- migrations ---------------- */
// MIGRATIONS[n] upgrades a save at version n to n + 1. Add one entry per bump; never edit an old one.
export const MIGRATIONS = {
  // 0 = unversioned / pre-release shapes → v1. Everything missing gets its default.
  0: (s) => ({ ...s, v: 1 }),
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
  const t = out.settings.theme; if (t !== 'light' && t !== 'dark') out.settings.theme = 'auto';
  const g = out.settings.dailyGoal; out.settings.dailyGoal = Number.isFinite(g) ? Math.min(800, Math.max(100, Math.round(g))) : 400;
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
   * update(fn, {immediate}) — fn(state) mutates in place (or returns a replacement object); caps are
   * re-applied, subscribers notified, the write scheduled. Returns the state.
   */
  function update(fn, { immediate = false } = {}) {
    const s = getState();
    const r = fn(s);
    if (isObj(r) && r !== s) state = r;
    applyCaps(state);
    notify('update');
    save({ immediate });
    return state;
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
    reconcileStreak(next, todayISO(new Date(now())));
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
    doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'hidden') flush(); });
    if (doc.defaultView) doc.defaultView.addEventListener('pagehide', flush);
  }

  return { load, getState, update, save, flush, exportJSON, importJSON, reset, subscribe, readBackup, migrateUnit, unit, flags, get dirty() { return dirty; }, get blocked() { return blocked; } };
}

/* ---------------- default instance (the app's save) ---------------- */
export const store = createStore({ doc: typeof document !== 'undefined' ? document : undefined });
export const { load, getState, update, save, flush, exportJSON, importJSON, reset, subscribe, readBackup, migrateUnit, flags } = store;
