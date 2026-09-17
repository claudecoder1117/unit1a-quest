// js/trophies.js — the trophy engine (COMPOSED S4 "Trophies", S8 #11).
//
// Pure evaluation + one thin DOM layer:
//   makeCtx(save)            → the read-only view every predicate in data/trophies.js sees
//   check(save)              → ids currently satisfied (pure — nothing is written)
//   evaluate(save, {now})    → ids newly earned; WRITES save.trophies[id] = {at}
//   progressOf(save, id)     → {have, need, pct} | null   (unearned tiles show this bar)
//   earnedIds/earnedAt       → what the save already holds
//   bump/setBest/resetRun    → the counters contract (data/trophies.js COUNTERS)
//   toast(text, opts)        → the 1.5 s pill under the header (never modal, S4)
//   install({bus,…})         → evaluate after every grade and toast what was earned
//
// The module imports NOTHING from app.js or from a screen, so tests (and any later ticket) can import
// it under Node. `install` is the only function that touches the DOM, and it is injected with the bus,
// getState and update rather than reaching for them — which is also what keeps app.js ↔ screens out of
// an import cycle. Wiring lives in js/screens/index.js (BUILD-POLICY §2).

import { trophies, trophyById, TROPHY_IDS, COUNTERS, ORIGINAL_IDS, FAMILY_IDS } from '../data/trophies.js';
import { tileRarity, familyRarity } from './rarity.js';
// "Cleared at least once" has exactly one definition, and Readiness `C` owns it (T10). Importing it
// here is what makes the S8 #11 acceptance — Binder fill % == Readiness C — true by construction
// rather than by coincidence.
import { isCleared, coverageCount } from './readiness.js';

export { trophies, trophyById, TROPHY_IDS, COUNTERS } from '../data/trophies.js';
export { GROUPS, trophiesOfGroup, sheetOriginals, TROPHY_SHEETS } from '../data/trophies.js';

/** How long a trophy toast stays up (S4: "toast 1.5 s under the header, never modal"). */
export const TOAST_MS = 1500;

const EMPTY = Object.freeze({});
const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const num = (x) => (Number.isFinite(x) ? x : 0);

/* ------------------------------------------------------------------ counters */

/**
 * bump(save, key, n = 1) — move a counter (data/trophies.js COUNTERS is the list and the contract).
 * A counter declared `best: true` also keeps its high-water mark in `<key>Best`, which is what the
 * "in a row" trophies read — so a caller never has to remember two keys.
 * @returns {number} the counter's new value
 */
export function bump(save, key, n = 1) {
  if (!isObj(save)) return 0;
  if (!isObj(save.counters)) save.counters = {};
  const step = Number.isFinite(n) ? n : 1;
  const next = num(save.counters[key]) + step;
  save.counters[key] = next;
  if (COUNTERS[key]?.best) save.counters[key + 'Best'] = Math.max(num(save.counters[key + 'Best']), next);
  return next;
}

/** setBest(save, key, value) — raise a high-water mark directly (never lowers it). */
export function setBest(save, key, value) {
  if (!isObj(save)) return 0;
  if (!isObj(save.counters)) save.counters = {};
  const v = Math.max(num(save.counters[key + 'Best']), num(value));
  save.counters[key + 'Best'] = v;
  return v;
}

/** resetRun(save, key) — a "consecutive" counter broke: zero the current run, keep `<key>Best`. */
export function resetRun(save, key) {
  if (!isObj(save)) return;
  if (!isObj(save.counters)) save.counters = {};
  save.counters[key + 'Best'] = Math.max(num(save.counters[key + 'Best']), num(save.counters[key]));
  save.counters[key] = 0;
}

/** counterValue(save, key) — the value a predicate sees (`best` counters report the high-water mark). */
export function counterValue(save, key) {
  const c = isObj(save) && isObj(save.counters) ? save.counters : EMPTY;
  const cur = num(c[key]);
  return COUNTERS[key]?.best ? Math.max(cur, num(c[key + 'Best'])) : cur;
}

/* ------------------------------------------------------------------ run helpers */

/** 'boss:B4' → 'boss'; 'upgrade:AP-1' → 'upgrade'; 'page' → 'page'. */
export function kindOf(run) {
  return isObj(run) && typeof run.kind === 'string' ? run.kind.split(':')[0] : '';
}

/** The boss a run belongs to: 'boss:B4' → 'B4' (or run.id when the kind is a bare 'boss'). */
export function bossOf(run) {
  if (!isObj(run) || typeof run.kind !== 'string') return null;
  if (run.kind.startsWith('boss:')) return run.kind.slice(5) || null;
  return run.kind === 'boss' ? (run.id ?? null) : null;
}

/** The sheet an Upgrade run covered: 'upgrade:AP-1' → 'AP-1' (or run.sheet / run.id). */
export function sheetOfRun(run) {
  if (!isObj(run)) return null;
  if (typeof run.kind === 'string' && run.kind.startsWith('upgrade:')) return run.kind.slice(8) || null;
  if (kindOf(run) !== 'upgrade') return null;
  return run.sheet ?? run.id ?? null;
}

/** An item was clean: first try, no hints, full credit (S4 Global rule 8). */
export function isCleanItem(it) {
  if (!isObj(it)) return false;
  if (it.clean === true) return true;
  if (it.clean === false) return false;
  const credit = Number.isFinite(it.credit) ? it.credit : (it.ok === true ? 1 : 0);
  const attempt = Number.isFinite(it.attempt) ? it.attempt : 1;
  return credit >= 1 && attempt <= 1 && num(it.hints) === 0;
}

/**
 * Accuracy of a graded run as a 0–1 fraction, or null when it cannot be known.
 * Prefers an explicit `acc`, then `scorePct`, then the mean credit over the items (the S3 40 %/60 %
 * equation split is a fractional credit, so the mean is the honest number).
 */
export function accuracyOf(run) {
  if (!isObj(run)) return null;
  if (Number.isFinite(run.acc) && run.acc >= 0 && run.acc <= 1) return run.acc;
  if (Number.isFinite(run.scorePct)) return Math.max(0, Math.min(1, run.scorePct / 100));
  if (Array.isArray(run.items) && run.items.length) {
    let sum = 0;
    for (const it of run.items) {
      const c = isObj(it) ? (Number.isFinite(it.credit) ? it.credit : (it.ok === true ? 1 : 0)) : 0;
      sum += Math.max(0, Math.min(1, c));
    }
    return sum / run.items.length;
  }
  return null;
}

/** How many items of a run were fully correct. */
export function correctCount(run) {
  if (!isObj(run)) return 0;
  if (Array.isArray(run.items) && run.items.length) {
    return run.items.filter(it => isObj(it) && (Number.isFinite(it.credit) ? it.credit >= 1 : it.ok === true)).length;
  }
  return Number.isFinite(run.score) ? run.score : 0;
}

/** A boss run was won (T12 writes `won: true`; the heart/KO fallbacks keep old runs readable). */
export function wonRun(run) {
  if (!isObj(run)) return false;
  if (run.won === true || run.outcome === 'win') return true;
  if (run.won === false || run.ko === true || run.outcome === 'ko') return false;
  return run.status === 'done' && Number.isFinite(run.hearts) && run.hearts > 0;
}

/** A boss run was flawless: won, three hearts left, no `*` continue flag (S4 Hearts). */
export function flawlessRun(run) {
  if (!isObj(run)) return false;
  if (run.flawless === true) return true;
  if (run.flawless === false) return false;
  return wonRun(run) && run.hearts === 3 && run.flagged !== true;
}

/** Local clock hour of a timestamp, or null. */
export function localHour(ms) {
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.getHours();
}

/**
 * The Night Before counts (daily goal, `night-owl-no`) only when it was WORK (S9 #10 "Honest"): at least
 * `NIGHT_FLOOR.items` answered across its blocks, or some answered and `NIGHT_FLOOR.ms` on the clock.
 * `run.answered` is the cross-block total night.js writes; older records fall back to their item list.
 * Three taps and "Hand it in" on an empty mini-mock is neither a streak day nor a trophy.
 */
export const NIGHT_FLOOR = Object.freeze({ items: 8, ms: 10 * 60 * 1000 });
export function nightCounted(run) {
  if (!isObj(run)) return false;
  const answered = Number.isFinite(run.answered) ? run.answered : (Array.isArray(run.items) ? run.items.length : 0);
  if (answered >= NIGHT_FLOOR.items) return true;
  const ms = num(run.submittedAt) - num(run.startedAt);
  return answered > 0 && ms >= NIGHT_FLOOR.ms;
}

/* ------------------------------------------------------------------ ctx */

/**
 * makeCtx(save) — the memoised read-only view a predicate sees. Nothing here mutates the save.
 * See data/trophies.js for the documented field list.
 */
export function makeCtx(save) {
  const s = isObj(save) ? save : {};
  const cards = isObj(s.cards) ? s.cards : EMPTY;
  const variants = isObj(s.variants) ? s.variants : EMPTY;
  const runs = Array.isArray(s.runs) ? s.runs : [];

  const rarityCache = new Map();
  const tile = (id) => {
    if (rarityCache.has(id)) return rarityCache.get(id);
    const r = typeof id === 'string' && id.startsWith('fam-')
      ? familyRarity(variants[id])
      : tileRarity(id, cards[id]);
    rarityCache.set(id, r);
    return r;
  };

  // One definition, shared with Readiness C (js/readiness.js): `cleared === true`, or any ok history
  // entry — so a "Full 36" or BLITZ clear of a recall card counts (S4).
  const cleared = (id) => isCleared(cards[id]);

  let clearedSet = null;
  const clearedIds = {
    get size() { return this._set().size; },
    has(id) { return this._set().has(id); },
    _set() {
      if (!clearedSet) { clearedSet = new Set(); for (const id of ORIGINAL_IDS) if (cleared(id)) clearedSet.add(id); }
      return clearedSet;
    },
  };

  let comeback = null;
  const comebackInHistory = () => {
    if (comeback !== null) return comeback;
    comeback = false;
    for (const id of Object.keys(cards)) {
      const h = cards[id]?.history;
      if (!Array.isArray(h)) continue;
      let wrong = 0;
      for (const e of h) {
        if (!isObj(e)) continue;
        if (e.ok) { if (wrong >= 3) { comeback = true; break; } wrong = 0; }
        else wrong++;
      }
      if (comeback) break;
    }
    return comeback;
  };

  const gold = (id) => { const r = tile(id); return r === 'gold' || r === 'platinum'; };
  const plat = (id) => tile(id) === 'platinum';

  const ctx = {
    save: s,
    n: (key) => num((isObj(s.counters) ? s.counters : EMPTY)[key]),
    best: (key) => counterValue(s, key),
    rec: (id) => (isObj(cards[id]) ? cards[id] : EMPTY),
    cleared,
    tile,
    gold,
    plat,
    allCleared: (ids) => ids.every(cleared),
    allGold: (ids) => ids.every(gold),
    allPlat: (ids) => ids.every(plat),
    clearedIds,
    ORIGINALS: ORIGINAL_IDS,
    FAMILIES: FAMILY_IDS,
    runs,
    someRun: (fn) => runs.some(r => { try { return !!fn(r, ctx); } catch { return false; } }),
    streakBest: Math.max(num(s.streak?.count), num(s.streak?.best)),
    comebackInHistory,
    kindOf,
    bossOf,
    sheetOfRun,
    isClean: isCleanItem,
    accuracy: accuracyOf,
    correctCount,
    won: wonRun,
    flawless: flawlessRun,
    localHour,
    nightCounted,
  };
  return ctx;
}

/* ------------------------------------------------------------------ evaluation */

/** check(save) → the ids of every trophy whose predicate is satisfied right now. Pure. */
export function check(save) {
  const ctx = makeCtx(save);
  const out = [];
  for (const t of trophies) {
    let ok = false;
    try { ok = !!t.test(ctx); } catch (e) { console.error(`trophy ${t.id}`, e); }
    if (ok) out.push(t.id);
  }
  return out;
}

/**
 * evaluate(save, {now}) — record every satisfied trophy that is not already in the save.
 * @returns {string[]} the ids earned by THIS call (in catalogue order) — what the caller toasts.
 */
export function evaluate(save, { now = Date.now() } = {}) {
  if (!isObj(save)) return [];
  if (!isObj(save.trophies)) save.trophies = {};
  const fresh = [];
  for (const id of check(save)) {
    if (isObj(save.trophies[id]) || save.trophies[id] === true) continue;
    save.trophies[id] = { at: now };
    fresh.push(id);
  }
  return fresh;
}

/** Ids the save already holds, in catalogue order. */
export function earnedIds(save) {
  const t = isObj(save) && isObj(save.trophies) ? save.trophies : EMPTY;
  return TROPHY_IDS.filter(id => id in t);
}

/** When a trophy was earned (ms), or null. */
export function earnedAt(save, id) {
  const rec = isObj(save) && isObj(save.trophies) ? save.trophies[id] : null;
  if (rec === true) return 0;
  return isObj(rec) && Number.isFinite(rec.at) ? rec.at : (rec ? 0 : null);
}

/** progressOf(save, id) → {have, need, pct} for the tile bar, or null when the trophy has no meter. */
export function progressOf(save, id) {
  const t = trophyById[id];
  if (!t || typeof t.progress !== 'function') return null;
  let p;
  try { p = t.progress(makeCtx(save)); } catch { return null; }
  if (!isObj(p) || !Number.isFinite(p.need) || p.need <= 0) return null;
  const have = Math.max(0, Math.min(p.need, Number.isFinite(p.have) ? p.have : 0));
  return { have, need: p.need, pct: have / p.need };
}

/** Every trophy with its earned state and meter — what #/stats renders. */
export function summary(save) {
  const ctx = makeCtx(save);
  const held = isObj(save) && isObj(save.trophies) ? save.trophies : EMPTY;
  return trophies.map(t => {
    let ok = false;
    try { ok = !!t.test(ctx); } catch { ok = false; }
    let prog = null;
    if (typeof t.progress === 'function') {
      try {
        const p = t.progress(ctx);
        if (isObj(p) && Number.isFinite(p.need) && p.need > 0) {
          const have = Math.max(0, Math.min(p.need, Number.isFinite(p.have) ? p.have : 0));
          prog = { have, need: p.need, pct: have / p.need };
        }
      } catch { prog = null; }
    }
    return { id: t.id, name: t.name, cond: t.cond, group: t.group, earned: (id => id in held)(t.id) || ok, at: earnedAt(save, t.id), progress: prog };
  });
}

/* ------------------------------------------------------------------ coverage (Binder fill == Readiness C) */

/** Every non-bonus manifest id cleared at least once. */
export function clearedOriginals(save) {
  return ORIGINAL_IDS.filter(id => isCleared(save?.cards?.[id]));
}

/**
 * coverage(save) → { cleared, total, frac } over the non-bonus bank — the Binder fill %, which is
 * Readiness `C` (S4) counted by readiness.js itself, so the two screens can never print different
 * numbers (S8 #11 acceptance).
 */
export function coverage(save) {
  const { cleared, total } = coverageCount(save);
  return { cleared, total, frac: total ? cleared / total : 0 };
}

/** The rarity histogram of the Binder: how many tiles sit at each step (`none` = not cleared). */
export function rarityHistogram(save, { families = true } = {}) {
  const ctx = makeCtx(save);
  const out = { none: 0, bronze: 0, silver: 0, gold: 0, platinum: 0 };
  const ids = families ? [...ORIGINAL_IDS, ...FAMILY_IDS] : ORIGINAL_IDS;
  for (const id of ids) out[ctx.tile(id) ?? 'none']++;
  return out;
}

/* ------------------------------------------------------------------ toast (the only DOM in here) */

const HOST_ID = 't11-toasts';

function toastHost(doc) {
  if (!doc || !doc.body) return null;
  let host = doc.getElementById(HOST_ID);
  if (!host) {
    host = doc.createElement('div');
    host.id = HOST_ID;
    host.className = 't11-toasts';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    doc.body.append(host);
  }
  return host;
}

/**
 * toast(text, {ms, sub, doc}) — the 1.5 s pill under the header. Returns the element (or null with no DOM).
 * Never modal, never focus-stealing; at most four are stacked before the oldest is dropped.
 */
export function toast(text, { ms = TOAST_MS, sub = null, doc = (typeof document !== 'undefined' ? document : null) } = {}) {
  const host = toastHost(doc);
  if (!host) return null;
  while (host.children.length >= 4) host.firstElementChild.remove();
  const el = doc.createElement('div');
  el.className = 't11-toast';
  const line = doc.createElement('span');
  line.className = 't11-toast-main';
  line.textContent = text;
  el.append(line);
  if (sub) {
    const s = doc.createElement('span');
    s.className = 't11-toast-sub';
    s.textContent = sub;
    el.append(s);
  }
  host.append(el);
  const kill = () => { el.classList.add('is-out'); setTimeout(() => el.remove(), 220); };
  const timer = setTimeout(kill, Math.max(300, ms));
  el.addEventListener('click', () => { clearTimeout(timer); kill(); });
  return el;
}

/** The trophy toast: "🏆 Sixteen" + the trophy's own name of what it took. */
export function toastTrophy(id, opts = {}) {
  const t = trophyById[id];
  if (!t) return null;
  return toast(`🏆 ${t.name}`, { sub: 'Trophy earned', ...opts });
}

/* ------------------------------------------------------------------ install */

let installed = null;

/**
 * install({bus, getState, update, doc, silent}) — evaluate after every grade and toast what was earned.
 *
 * Listens to `bus` events 'graded' (emitted by the Card/Run/Boss/Mock screens after each grade — the
 * S4 trigger) and 'state' (every store write, so a trophy is never missed if a screen forgets). The
 * evaluation is re-entrancy guarded: the `update` it performs re-emits 'state' and is ignored.
 * Idempotent — calling it twice returns the same handle.
 * @returns {{ run: () => string[], uninstall: () => void }}
 */
export function install({ bus, getState, update, doc = (typeof document !== 'undefined' ? document : null), silent = false } = {}) {
  if (installed) return installed;
  if (!bus || typeof bus.on !== 'function' || typeof getState !== 'function' || typeof update !== 'function') {
    throw new TypeError('trophies.install: { bus, getState, update } are required');
  }
  let busy = false;
  let first = true;

  const run = () => {
    if (busy) return [];
    busy = true;
    let fresh = [];
    try {
      const s = getState();
      if (!isObj(s)) return [];
      const pending = check(s).filter(id => !(isObj(s.trophies) && id in s.trophies));
      if (pending.length) {
        const now = Date.now();
        update(st => {
          if (!isObj(st.trophies)) st.trophies = {};
          for (const id of pending) if (!(id in st.trophies)) st.trophies[id] = { at: now };
        });
        fresh = pending;
      }
    } catch (e) {
      console.error('trophies.install', e);
    } finally {
      busy = false;
    }
    // A save that already holds trophies (import, reload) must not fire a wall of toasts.
    if (fresh.length && !silent && !first) for (const id of fresh) toastTrophy(id, { doc });
    first = false;
    return fresh;
  };

  const offs = [bus.on('graded', run), bus.on('state', run)];
  run();                                  // seed: records what an imported save already deserves, silently

  installed = {
    run,
    uninstall() { for (const off of offs) { try { off(); } catch { /* ignore */ } } installed = null; },
  };
  return installed;
}

/** The handle install() returned, or null. */
export const installation = () => installed;

export default trophies;
