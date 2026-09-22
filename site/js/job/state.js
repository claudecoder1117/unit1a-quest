/**
 * state.js — THE JOB: the job state machine (COMPOSED-GAME.md G1 "Core game loop", G2, G3, G7).
 *
 *     board → guard → envelope → call → answer → payout → bag/push → brief → getaway → debrief
 *
 * This file is the SPINE. `screens/job.js` (J6) is a thin renderer over it: every decision the game
 * offers is a function here, every number it prints is derived here, and the screen owns only the DOM.
 *
 * DOM-FREE (BUILD-POLICY §2): no `document`, no `window`, no CSS, no import from `screens/`. It takes
 * a `save` object and mutates it; `store.update()` is the screen's business, not this file's.
 *
 * ------------------------------------------------------------------------------------------------
 * THE LAWS THIS FILE ENFORCES STRUCTURALLY — each one is a mechanism, not a convention, and
 * `tests/job-state.test.mjs` shows each is unreachable rather than merely unused.
 *
 *  1. **The Law of Two Ledgers** (G1 global law 2). Every exported mutator runs against
 *     `guardSave(save)`, a Proxy that THROWS `LedgerError` on any write that would reach `xp`,
 *     `skills`, `cards[*]` (bucket, rarity, foil, …), `errors` or `forecastLog` — at any depth.
 *     Ledger A is written by the EXISTING grade path in `screens/card.js`, at grade time, and this
 *     module does not duplicate one line of it: it receives card.js's own `result` object and prices
 *     it. A bust costs LOOSE and nothing else.
 *  2. **Answers tick; time does not** (G1 global law 1, G3.7 proof 5). The only clock reads are the
 *     two measurement accumulators (`tGame`/`tAnswer`, switched in `setPhase`), the `at` stamps, and
 *     the job's own PINNED start date (`guard.drawnAt`) that `cold` is priced against. No payoff term
 *     reads elapsed session time: a whole job replayed with every `now` delta ×10 settles identically.
 *  3. **LOOSE floors at 0** (G1 "The two piles"). Every loss goes through `econ.missFor`, which caps
 *     at LOOSE, and `econ.applyDelta`, which floors at 0. There is no state in which the game takes
 *     something already bagged: BAGGED is only ever added to.
 *  4. **The sealed envelope** (G1, G3.7 proof 5). `envelopeFor()` returns the make, grade, cold,
 *     posted, source and tell — and NO card id, template, seed or params. `stemRefFor()` returns
 *     `null` until the call is locked. The screen cannot render a stem it cannot address.
 *  5. **CALL IT** (G1 "Failure states", G10 #7). Legal only at LOOSE 0 ∧ chain 0 ∧ ≥ 3 targets left;
 *     one call ends the stakes, records the job walked at posted 0, and the remaining targets run as
 *     a no-stakes page with hints on (hints are always on — `hintsOn()` is the constant `true`).
 *  6. **Quitting is never better than banking and never catastrophic** (G1 "Quit and resume"). Any
 *     exit that is not a bag auto-banks LOOSE at 50 %.
 *  7. **Mid-job reload** (G3.7 proof 6). `serialize`/`deserialize` round-trip `inProgress.game`
 *     exactly as J10 defined it, seed PINNED, so re-opening cannot re-roll the guard draw, the bundle
 *     partition or the ×2 placement.
 *  8. **COMPOSED global rule 4** (G10 #10). Nothing auto-advances on a correct answer: `applyTarget`
 *     stops at the payout beat and `bag()`/`push()` OCCUPY the continue tap.
 *  9. **COMPOSED global rule 5** (G9 #2). Items are marked through the EXISTING `markItem` /
 *     `requeueReview` / `finishPage`. The job never invents a second path to the schedule, never
 *     removes an item, and a job abandoned with targets left leaves `inProgress` as a plain page.
 */

import {
  CAPS, SHAPES, BOARD, BACKCHECK, COMPLETION, COMMIT_BONUS, FREE_OUTCOMES,
  RUNGS, MISS_RUNG, IN_PROGRESS_KEYS, PHASE_ORDER, GAME_PHASES, ANSWER_PHASES,
  PHASE_MEANS_DEFAULT, SAVE_DEFAULTS, STATES, WING_IDS, GUARD, SPLIT, DECLINE_PRICE, CALL_DEFAULT,
} from '../../data/job.js';
import { todayISO, isQuietHours } from '../days.js';
import { dueList } from '../schedule.js';
import { byId as cardById } from '../../data/cards.js';
import { markItem, requeueReview, finishPage, resumePage, jobTargetOf } from '../page.js';
import { buildJob, jobQueueOf, jobBoardOf } from './board.js';
import * as econ from './econ.js';
import * as call from './call.js';
import * as crew from './crew.js';
import * as guard from './guard.js';
import * as index from './index.js';   // the Fault Index — see `writeIndex` (notes/J9.md F1, notes/J7.md §7)

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const num = (x, d = 0) => (Number.isFinite(+x) ? +x : d);
const int = (x, d = 0) => Math.trunc(num(x, d));
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const str = (x, d = null) => (typeof x === 'string' && x ? x : d);

/* ==========================================================================================
   The Law of Two Ledgers — a structural guard, not a convention
   ========================================================================================== */

/**
 * The keys of LEDGER A. Written by `screens/card.js` at grade time and by nothing in `js/job/*`.
 * The first five are the ones G3.7 proof 11 and `tests/job-ledger.test.mjs` name; the rest are the
 * remainder of the study layer's save, which this module equally has no business writing.
 *
 * ROUND 3 (ledger-invariance, finding 64). `streak` and `jumps` were in NEITHER list: the guard did
 * not cover them and the corpus comparison did not include them, so G7's published *"Streak,
 * trophies, XP, levels | unchanged"* (COMPOSED-GAME.md:901) rested on nothing but the absence of a
 * caller. Nothing in `js/job/*` writes either one — `markStreakDay` is `store.js`'s and its only
 * callers are `schedule.checkDailyGoal`, `screens/card.js` and `screens/boss.js`, none of them
 * reachable from here — so naming them costs nothing and makes the claim structural.
 */
export const LEDGER_A_KEYS = Object.freeze([
  'cards', 'skills', 'xp', 'errors', 'forecastLog', 'variants', 'frozen', 'daily', 'runs', 'trophies',
  'streak', 'jumps',
]);

/** The keys of LEDGER B — the game, and the only top-level keys this module writes. */
export const LEDGER_B_KEYS = Object.freeze(['player', 'game']);

/**
 * Written ONLY through the study layer's own functions (`markItem` / `requeueReview` / `finishPage`),
 * never by a line of arithmetic in this file. `counters.pages` is `finishPage`'s, exactly as on the
 * flat path — which is why `tests/job-ledger.test.mjs` can compare `counters` byte-for-byte.
 *
 * ROUND 3 (ledger-invariance, finding 64), AND THE ONE EXCEPTION THE PROOF OWES A NAME.
 * `counters` is LEDGER A by G3.7 proof 11's own list — it is one of the five keys the proof says a
 * job leaves byte-identical — and SHARED by construction, because `finishPage` increments
 * `counters.pages` on the job route exactly as it does on the flat page. Listing it in
 * `LEDGER_A_KEYS` would make `endJob`'s own `finishPage(s)` throw; leaving it out made the guard
 * silent on it, and `s.counters.clears = 999` from `js/job/*` landed without a sound.
 * So it is neither: it is a NARROW proxy (`narrowCounters` below) that admits `pages` and refuses
 * every other key at any depth. The invariance of `counters.pages` itself is byte-identity between
 * the two arms, not the guard — the flat page counts the same page — and `tests/job-ledger.test.mjs`
 * is where that half lives.
 */
export const SHARED_KEYS = Object.freeze(['inProgress', 'counters']);

/**
 * The keys of `save.counters` that the study layer's own functions write on the JOB route, and the
 * only ones this module's proxy lets through. `finishPage` writes exactly one (`page.js`: `pages`);
 * every other counter belongs to a screen the job never runs.
 */
export const COUNTERS_WRITABLE = Object.freeze(['pages']);

/** Thrown when a write from this module would have reached Ledger A. */
export class LedgerError extends Error {
  constructor(path) {
    super(`ledger A is not writable from js/job/*: ${path}`);
    this.name = 'LedgerError';
    this.path = path;
  }
}

/** Thrown when a transition is not legal from the current phase. Every one has a `can*` predicate. */
export class JobStateError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'JobStateError';
    this.code = code;
  }
}

const PROTECTED = new Set(LEDGER_A_KEYS);
/** Is this top-level save key part of Ledger A? */
export const isProtectedKey = (k) => PROTECTED.has(k);

const RO_CACHE = new WeakMap();
const GUARD_CACHE = new WeakMap();
const GUARDED = new WeakSet();          // the proxies this module hands out
const RAW = new WeakMap();              // guarded save → the raw object behind it
const RO_TARGET = Symbol('ledgerA.target');

/** A deep read-only view: reads pass through, every write throws. */
function readOnly(value, path) {
  if (!value || typeof value !== 'object') return value;
  const hit = RO_CACHE.get(value);
  if (hit) return hit;
  const deny = () => { throw new LedgerError(path); };
  const p = new Proxy(value, {
    get(t, k, r) {
      if (k === RO_TARGET) return t;
      const v = Reflect.get(t, k, r);
      return typeof v === 'object' && v !== null && typeof k !== 'symbol'
        ? readOnly(v, `${path}.${String(k)}`)
        : v;
    },
    set: deny,
    defineProperty: deny,
    deleteProperty: deny,
    setPrototypeOf: deny,
  });
  RO_CACHE.set(value, p);
  return p;
}

const NARROW_CACHE = new WeakMap();

/**
 * `save.counters`, wrapped so that only `COUNTERS_WRITABLE` may be written — see `SHARED_KEYS`.
 * Reads pass through untouched (the layer prices `counters.pages` into nothing, but `readiness`
 * and the debrief read the object). Every other key throws `LedgerError('counters.<key>')`, at any
 * depth: a nested object comes back through this same wrapper, so `counters.foo.bar = 1` is
 * refused at `foo`, before it can reach `bar`.
 */
function narrowCounters(value) {
  if (!value || typeof value !== 'object') return value;
  const hit = NARROW_CACHE.get(value);
  if (hit) return hit;
  const allowed = new Set(COUNTERS_WRITABLE);
  const check = (k) => {
    if (typeof k === 'symbol' || allowed.has(k)) return;
    throw new LedgerError(`counters.${String(k)}`);
  };
  const p = new Proxy(value, {
    get(t, k, r) {
      const v = Reflect.get(t, k, r);
      return typeof v === 'object' && v !== null && typeof k !== 'symbol' ? readOnly(v, `counters.${String(k)}`) : v;
    },
    set(t, k, v) { check(k); return Reflect.set(t, k, v); },
    defineProperty(t, k, d) { check(k); return Reflect.defineProperty(t, k, d); },
    /* nothing on this route DELETES a counter — `finishPage` only ever increments — so a delete is
       refused for `pages` too: losing the page count is losing study progress. */
    deleteProperty(t, k) { throw new LedgerError(`counters.${String(k)}`); },
    setPrototypeOf() { throw new LedgerError('counters'); },
  });
  NARROW_CACHE.set(value, p);
  return p;
}

/**
 * The save, wrapped so that Ledger A is READ-ONLY at any depth. Every exported mutator in this file
 * runs against this; a write to `xp`, `skills`, `cards[*].bucket`, `cards[*].rarity`,
 * `cards[*].foil`, `errors`, `forecastLog`, `streak` or `jumps` throws `LedgerError` instead of
 * landing, and `counters` admits only `pages` (`narrowCounters`, and `SHARED_KEYS` for why).
 *
 * Idempotent (guarding a guarded save returns it) and cached per save object, so identity is stable.
 * @param {object} save
 * @returns {object} the guarded save
 */
export function guardSave(save) {
  if (!isObj(save)) throw new JobStateError('no-save');
  if (GUARDED.has(save)) return save;                        // already guarded
  const hit = GUARD_CACHE.get(save);
  if (hit) return hit;
  /* `finishPage` creates `counters` when a save has none (`page.js`: `if (!isObj(save.counters))
     save.counters = {}`), and that is the ONLY assignment to the key itself on this route. It is
     admitted in exactly that shape — a fresh empty object over a key that is not an object — so
     `s.counters = { clears: 999 }`, and any replacement of a `counters` that already exists, is
     still refused. */
  const isCountersCreate = (t, v) => !isObj(t.counters) && isObj(v) && Object.keys(v).length === 0;
  const p = new Proxy(save, {
    get(t, k, r) {
      if (typeof k === 'string' && PROTECTED.has(k)) return readOnly(Reflect.get(t, k, r), k);
      if (k === 'counters') return narrowCounters(Reflect.get(t, k, r));
      return Reflect.get(t, k, r);
    },
    set(t, k, v) {
      if (typeof k === 'string' && PROTECTED.has(k)) throw new LedgerError(k);
      if (k === 'counters' && !isCountersCreate(t, v)) throw new LedgerError('counters');
      return Reflect.set(t, k, v);
    },
    defineProperty(t, k, d) {
      if (typeof k === 'string' && PROTECTED.has(k)) throw new LedgerError(k);
      if (k === 'counters' && !isCountersCreate(t, d?.value)) throw new LedgerError('counters');
      return Reflect.defineProperty(t, k, d);
    },
    deleteProperty(t, k) {
      if (typeof k === 'string' && PROTECTED.has(k)) throw new LedgerError(k);
      if (k === 'counters') throw new LedgerError('counters');
      return Reflect.deleteProperty(t, k);
    },
  });
  GUARD_CACHE.set(save, p);
  GUARDED.add(p);
  RAW.set(p, save);
  return p;
}

/** The raw save behind a guarded one (the screen's `update()` writes the raw object). */
export const unguard = (save) => (isObj(save) && RAW.get(save)) || save;

/* ==========================================================================================
   G7 — the record, and its serialiser (J10's `inProgress.game`)
   ========================================================================================== */

/**
 * The seven keys this machine adds to J10's sixteen. All are tiny; together they cost ≈ 130 B on a
 * live 12-target job (notes/J5c.md §Deviations). `inProgress` is pass-through in `store.js`, so they
 * survive the disk untouched.
 *   stakes  — false after CALL IT / the 22:00 close: the job keeps studying with no loot
 *   outcome — null while live; the terminal word once the job is over
 *   locked  — the call locked for the CURRENT target (the seal), cleared at the payout
 *   posted  — the job's posted total, needed by the log, the Elo outcome and the heat window
 *   bc      — Backchecks spent this job (the clean-vault mint reads it)
 *   last    — the payout beat's undo record, which is what a Backcheck actually operates on
 *   ph      — per-phase wall-clock accumulators, for `game.ledger.phaseMeans` (J8 owns the criterion)
 *   quiet   — the 22:00 close has already banked this job, so the terminal word is QUIET22 and not
 *             CALLED. Both end the stakes; only one of them was the student's decision, and a debrief
 *             that cannot tell them apart prints `Called it` over a night the student never called.
 *   tellOff — a brief window DECLINED the next target's tell (G1's fourth option). One target wide:
 *             `pricedTarget` withholds the tag and its ×1.25, `applyTarget` consumes the flag. It is
 *             a boolean and it is false on all but one beat of a job, so it costs 15 B on the disk
 *             and buys the difference between an option and a string pushed into `briefs[].took`.
 */
export const EXTRA_KEYS = Object.freeze(['stakes', 'outcome', 'locked', 'posted', 'bc', 'last', 'ph', 'rating0', 'quiet', 'tellOff']);

/** Every key of `inProgress.game`, in serialisation order: J10's sixteen, then this file's eight. */
export const STATE_KEYS = Object.freeze([...IN_PROGRESS_KEYS, ...EXTRA_KEYS]);

/** The phases of G1's loop, in order. `PHASE_ORDER` is `data/job.js`'s; `debrief` is terminal. */
export const PHASES = PHASE_ORDER;
export const TERMINAL_PHASE = 'debrief';

/** The phases that count as GAME seconds / ANSWER seconds (G1 statement 2). */
const GAME_PHASE_SET = new Set(GAME_PHASES);
const ANSWER_PHASE_SET = new Set(ANSWER_PHASES);
/** The five phases `game.ledger.phaseMeans` keeps a rolling mean of (G7). */
const MEAN_PHASES = Object.freeze(Object.keys(PHASE_MEANS_DEFAULT));

/** Every terminal word a job can end on. */
export const OUTCOMES = Object.freeze({
  COMPLETED: 'completed',   // every drafted target answered, no getaway crack (a shape with no vault beat)
  CRACKED: 'cracked',       // the vault was CRACKED — the last target was answered and CLEARED
  KNOCKED: 'knocked',       // G1 "Knocked": the vault was cracked and MISSED. Ledger A unchanged; the crack is not recorded
  WALKED: 'walked',         // WALK at the getaway — leave with the bag, banked free
  QUIT: 'quit',             // WALK mid-job — 50 % auto-bag unless the student bagged first
  CALLED: 'called',         // CALL IT: stakes ended, recorded at posted 0
  COMMIT: 'commit',         // a bound declaration fired: banked in full, +8 %, completion forfeited
  QUIET22: 'quiet22',       // the 22:00 close banked in full (J11 owns the trigger)
});
/* The words that reached the getaway and are therefore a RESULT the Elo pair may rate. KNOCKED is one
   of them: a crack that missed is a loss, and a loss the ladder never sees is a ladder that only ever
   goes up (G3.7 proof 6 — quitting must not pay, but losing must count). */
const GETAWAY_OUTCOMES = new Set([OUTCOMES.COMPLETED, OUTCOMES.CRACKED, OUTCOMES.KNOCKED, OUTCOMES.WALKED]);

/**
 * The call every rank may make, and the rung a stakes-off target is priced at — re-exported from
 * `data/job.js`, where it is `CALL_LEVELS[0].id`. It was a literal `50` here while `job/call.js` and
 * `job/econ.js` both derived the same rung from the ladder, so a ladder change would have moved two
 * of the three (single-sourced at integration; the re-export keeps this module's importers working).
 */
export { CALL_DEFAULT };

/** G2 "calling 50 on everything scores exactly 5.0" — the rating an empty window holds. */
const RATING_DEFAULT = SAVE_DEFAULTS.player.rating.value;

const freshTokens = () => Object.fromEntries(WING_IDS.map((w) => [w, 0]));
const freshPh = () => Object.fromEntries(MEAN_PHASES.map((p) => [p, 0]));

/** A blank job record — every key of `STATE_KEYS`, in order, with G7's defaults. */
export function freshState(over = {}) {
  const base = {
    shape: 'JOB', seed: '', bundles: [], picks: [], tokens: freshTokens(),
    guard: { wing: null, dist: {}, eps: 0, mult: 1, drawnAt: 0 },
    loose: 0, bagged: 0, chain: 0, calls: [], briefs: [], vault: null,
    tGame: 0, tAnswer: 0, phase: 'board', phaseAt: 0,
    stakes: true, outcome: null, locked: null, posted: 0, bc: 0, last: null, ph: freshPh(),
    /* The rating as it stood BEFORE the first call of this job. `applyTarget` rewrites
       `player.rating.value` on every staked target, so by the time `endJob` runs, the live value IS
       the after value and `ratingAfter − ratingBefore` was structurally +0.00 — a delta that can
       never be anything else is not information, and G5 #4 ("your rating is live … it can go down,
       which is what makes it worth something") needs the real one. Snapshotted in `startJob`, read
       back by `endJob`. notes/J6b.md R2. */
    rating0: RATING_DEFAULT,
    /** set by `quietClose` — the 22:00 close banked this job, whatever word it ends on. */
    quiet: false,
    /** set by `brief({tell:false})`, consumed by the next `applyTarget` — see EXTRA_KEYS. */
    tellOff: false,
  };
  return { ...base, ...(isObj(over) ? over : null) };
}

const cleanCall = (c) => ({
  call: int(c?.call, CALL_DEFAULT),
  ok: c?.ok === true,
  w: num(c?.w, 0),
  skill: str(c?.skill),
  rung: clamp(int(c?.rung, MISS_RUNG), 0, MISS_RUNG),
  d: econ.round(num(c?.d, 0)),          // Δloose is an integer by construction — never a float in the save
  at: Number.isFinite(c?.at) ? +c.at : null,
});

const cleanBundle = (b) => ({
  id: str(b?.id, '?'), label: str(b?.label, ''), overflow: int(b?.overflow, 0), wing: str(b?.wing),
  posted: num(b?.posted, 0), minutes: num(b?.minutes, 0), grade: int(b?.grade, 1), cold: num(b?.cold, 0),
  locks: Array.isArray(b?.locks) ? b.locks.filter((x) => typeof x === 'string') : [],
});

/**
 * `inProgress.game` → a plain, JSON-safe, key-ordered record. Byte-identical for the same state, so a
 * reload round-trip can be asserted with `deepStrictEqual` and `JSON.stringify` alike.
 * @param {object} game
 * @returns {object}
 */
export function serialize(game) {
  const g = isObj(game) ? game : {};
  const out = {};
  for (const k of STATE_KEYS) {
    switch (k) {
      case 'bundles': out.bundles = (Array.isArray(g.bundles) ? g.bundles : []).slice(0, CAPS.bundles).map(cleanBundle); break;
      case 'picks': out.picks = (Array.isArray(g.picks) ? g.picks : []).filter((x) => typeof x === 'string'); break;
      case 'tokens': out.tokens = Object.fromEntries(WING_IDS.map((w) => [w, Math.max(0, int(g.tokens?.[w], 0))])); break;
      case 'guard': out.guard = {
        wing: str(g.guard?.wing),
        dist: Object.fromEntries(WING_IDS.filter((w) => Number.isFinite(g.guard?.dist?.[w])).map((w) => [w, +g.guard.dist[w]])),
        eps: num(g.guard?.eps, 0), mult: num(g.guard?.mult, 1), drawnAt: num(g.guard?.drawnAt, 0),
      }; break;
      case 'calls': out.calls = (Array.isArray(g.calls) ? g.calls : []).map(cleanCall); break;
      case 'briefs': out.briefs = (Array.isArray(g.briefs) ? g.briefs : []).map((b) => ({
        at: num(b?.at, 0), took: Array.isArray(b?.took) ? b.took.filter((x) => typeof x === 'string') : [],
      })); break;
      case 'shape': out.shape = SHAPES[g.shape] ? g.shape : 'JOB'; break;
      case 'seed': out.seed = str(g.seed, ''); break;
      case 'vault': out.vault = str(g.vault); break;
      case 'phase': out.phase = PHASES.includes(g.phase) ? g.phase : 'board'; break;
      case 'outcome': out.outcome = Object.values(OUTCOMES).includes(g.outcome) ? g.outcome : null; break;
      case 'stakes': out.stakes = g.stakes !== false; break;
      case 'quiet': out.quiet = g.quiet === true; break;
      case 'tellOff': out.tellOff = g.tellOff === true; break;
      case 'locked': out.locked = isObj(g.locked) && Number.isFinite(+g.locked.call)
        ? { call: int(g.locked.call, CALL_DEFAULT), n: int(g.locked.n, 0), at: num(g.locked.at, 0) } : null; break;
      case 'last': out.last = isObj(g.last) ? {
        n: int(g.last.n, 0), d: econ.round(num(g.last.d, 0)), rung: clamp(int(g.last.rung, MISS_RUNG), 0, MISS_RUNG),
        ok: g.last.ok === true, chainBefore: Math.max(0, int(g.last.chainBefore, 0)),
        looseBefore: Math.max(0, econ.round(num(g.last.looseBefore, 0))), shielded: g.last.shielded === true,
      } : null; break;
      case 'ph': out.ph = Object.fromEntries(MEAN_PHASES.map((p) => [p, Math.max(0, Math.round(num(g.ph?.[p], 0)))])); break;
      case 'loose': case 'bagged': out[k] = Math.max(0, econ.round(num(g[k], 0))); break;
      case 'chain': case 'bc': out[k] = Math.max(0, int(g[k], 0)); break;
      case 'posted': out.posted = Math.max(0, num(g.posted, 0)); break;
      case 'rating0': out.rating0 = clamp(num(g.rating0, RATING_DEFAULT), 0, 10); break;
      default: out[k] = Math.max(0, num(g[k], 0)); break;                       // tGame · tAnswer · phaseAt
    }
  }
  return out;
}

/**
 * A record off the disk → a well-formed one. TOTAL: accepts anything (J10 open issue #4 — a corrupt
 * `inProgress.game` reaches the resume path unrepaired, and this is where it is defended), never
 * throws, and is idempotent. `deserialize(serialize(g))` is `deepStrictEqual` to `serialize(g)`.
 */
export function deserialize(raw) {
  return serialize(freshState(isObj(raw) ? raw : null));
}

/** The live job record on a save, or `null`. Does not repair — use `resume()` for that. */
export function stateOf(save) {
  const g = save?.inProgress?.game;
  return isObj(g) ? g : null;
}

/** The live job record, or a throw. Every mutator starts here. */
function mustState(save) {
  const g = stateOf(save);
  if (!g) throw new JobStateError('no-job');
  if (g.outcome != null) throw new JobStateError('job-over', g.outcome);
  return g;
}

/** Read the job record back from the disk, repaired (J10 open issue #4). Writes the repair through. */
export function resume(save) {
  const s = guardSave(save);
  const ip = resumePage(s);
  if (!ip || !isObj(ip.game)) return null;
  const g = deserialize(ip.game);
  ip.game = g;
  return g;
}

/** Write a record to `inProgress.game`, serialised. */
export function writeGame(save, game) {
  const s = guardSave(save);
  if (!isObj(s.inProgress)) throw new JobStateError('no-page');
  s.inProgress.game = serialize(game);
  return s.inProgress.game;
}

/* ==========================================================================================
   Ledger B on the save — created lazily, never from `store.js` (which the job layer must not import)
   ========================================================================================== */

const cloneDefault = (k) => JSON.parse(JSON.stringify(SAVE_DEFAULTS[k]));

function playerOf(save) {
  if (!isObj(save.player)) save.player = cloneDefault('player');
  const p = save.player;
  if (!isObj(p.rating)) p.rating = { calls: [], value: 5.0, n: 0 };
  if (!Array.isArray(p.rating.calls)) p.rating.calls = [];
  if (!isObj(p.elo)) p.elo = { player: 1000, house: 1000 };
  if (!isObj(p.records)) p.records = cloneDefault('player').records;
  if (!Number.isFinite(+p.rank)) p.rank = 2;
  return p;
}

function gameOf(save) {
  if (!isObj(save.game)) save.game = cloneDefault('game');
  const g = save.game;
  if (!isObj(g.crew)) g.crew = {};
  if (!isObj(g.heat)) g.heat = cloneDefault('game').heat;
  if (!isObj(g.backchecks)) g.backchecks = { held: 0, mintedDay: null };
  if (!isObj(g.ledger)) g.ledger = cloneDefault('game').ledger;
  if (!isObj(g.ledger.phaseMeans)) g.ledger.phaseMeans = { ...PHASE_MEANS_DEFAULT };
  if (!Array.isArray(g.log)) g.log = [];
  if (!isObj(g.commit)) g.commit = { kind: null, byMin: null, honored: 0, bound: false };
  return g;
}

/* ==========================================================================================
   G1 statement 2 — the two measurement accumulators. The ONLY clock in the layer.
   ========================================================================================== */

/**
 * Switch phase and bank the elapsed wall clock into `tGame` or `tAnswer`.
 *
 * This is the whole of "both numbers are measured, not claimed" — and the whole of the clock's reach:
 * nothing downstream of `tGame`/`tAnswer`/`ph` enters a payoff. G3.7 proof 5 holds because the only
 * other clock read in this file is the `at` stamp on a call record.
 * @param {object} save
 * @param {string} phase  one of `PHASES`
 * @param {number} [now]
 */
export function tick(save, phase, now = Date.now()) {
  const s = guardSave(save);
  const g = stateOf(s);
  if (!g) throw new JobStateError('no-job');
  if (!PHASES.includes(phase)) throw new JobStateError('bad-phase', String(phase));
  setPhase(g, phase, now);
  return g.phase;
}

function setPhase(g, phase, now) {
  const from = g.phase;
  const at = num(g.phaseAt, 0);
  const t = num(now, 0);
  const dt = at > 0 && t > at ? t - at : 0;
  if (dt > 0) {
    if (ANSWER_PHASE_SET.has(from)) g.tAnswer = num(g.tAnswer, 0) + dt;
    else if (GAME_PHASE_SET.has(from)) g.tGame = num(g.tGame, 0) + dt;
    if (MEAN_PHASES.includes(from)) g.ph[from] = num(g.ph?.[from], 0) + dt;
  }
  g.phase = phase;
  g.phaseAt = t;
  return g;
}

/* ------------------------------------------------------------------ the rolling phase means (G7) */

/**
 * How many times the shipped default may be exceeded by ONE observation before it is treated as a
 * phone left on the board rather than a student reading it. `g.ph` is raw wall clock with no idle
 * subtraction, so without this a single locked phone replaces the whole projection: one interrupted
 * job put `board` at 167 s against a shipped 18 s and made the next board advertise "~91 % game".
 */
const PHASE_OBSERVED_CAP_X = 4;

/** The phase whose read has not happened yet when the fold runs — see `closeDebrief`. */
const DEFERRED_MEAN_PHASE = 'debrief';

/**
 * One phase's rolling mean, over the last `SPLIT.projectionWindowJobs` jobs.
 *
 * Two corrections over the shipped fold, both of them honesty and not taste:
 *   · `k = min(window, jobs + 1)`, so job 1 BLENDS with the shipped prior instead of replacing it.
 *     At `k = min(5, jobs)` the first job had `k = 1` and `mean = observed` — the shipped defaults
 *     were discarded outright by one sample, and a single walked job poisoned the published split
 *     for the next five.
 *   · the observation is CLAMPED at `PHASE_OBSERVED_CAP_X ×` the shipped default, because `observed`
 *     is wall clock with no idle subtraction and a locked phone is not a measurement.
 */
function foldMean(prev, observedS, ph, jobs) {
  const dflt = num(PHASE_MEANS_DEFAULT[ph], 0);
  const mean = num(prev, dflt);
  const raw = num(observedS, 0);
  if (!(raw > 0)) return mean;
  const observed = dflt > 0 ? Math.min(raw, dflt * PHASE_OBSERVED_CAP_X) : raw;
  const k = Math.min(Math.max(1, int(SPLIT.projectionWindowJobs, 5)), Math.max(0, int(jobs, 0)) + 1);
  return ((mean * (k - 1)) + observed) / k;
}

/**
 * Bank the debrief READ and fold it into `phaseMeans.debrief` (G1 statement 2).
 *
 * `endJob` stamps `game.ledger.debriefAt` at the instant the debrief appears; this closes it. TOTAL
 * and idempotent: no stamp ⇒ no-op, so a screen may call it on every unmount and `startJob` may call
 * it again as the backstop without double-folding. The same `PHASE_OBSERVED_CAP_X` clamp applies,
 * which is what makes the backstop honest: a student who reads the debrief, sleeps, and drafts the
 * next board tomorrow contributes 4 × 65 s and not a night.
 *
 * @param {object} save
 * @param {{now?: number}} [opts]
 * @returns {{folded: boolean, observed: number, mean: number}}
 */
export function closeDebrief(save, opts = {}) {
  const s = guardSave(save);
  const gm = gameOf(s);
  const L = gm.ledger;
  const at = num(L?.debriefAt, 0);
  const mean = num(L?.phaseMeans?.[DEFERRED_MEAN_PHASE], PHASE_MEANS_DEFAULT[DEFERRED_MEAN_PHASE]);
  if (!(at > 0)) return { folded: false, observed: 0, mean };
  const now = num(opts.now, 0) || Date.now();
  const observed = Math.max(0, (now - at) / 1000);
  /* `L.jobs` already counts the job that opened this debrief, which is exactly the count `endJob`
     folded the other four phases at — so the window is the same one, one job later. */
  const next = foldMean(mean, observed, DEFERRED_MEAN_PHASE, Math.max(1, int(L.jobs, 1)));
  gm.ledger = { ...L, phaseMeans: { ...L.phaseMeans, [DEFERRED_MEAN_PHASE]: next }, debriefAt: 0 };
  return { folded: observed > 0, observed, mean: next };
}

/* ==========================================================================================
   G1 — the shape of a job in flight
   ========================================================================================== */

/** The drafted queue (the study layer's own `inProgress.queue`). */
export const queueOf = (save) => (Array.isArray(save?.inProgress?.queue) ? save.inProgress.queue : []);
/** The pointer into it (the study layer's own `inProgress.idx`). */
export const idxOf = (save) => Math.max(0, int(save?.inProgress?.idx, 0));
/** The item at the pointer, or `null`. */
export const currentItem = (save) => queueOf(save)[idxOf(save)] ?? null;
/** How many targets are still unanswered. */
export const targetsLeft = (save) => Math.max(0, queueOf(save).length - idxOf(save));
/** How many have been answered (the pointer, which `markItem` moves). */
export const answered = (save) => Math.min(idxOf(save), queueOf(save).length);

/**
 * **The ANSWERED PREFIX's posted value, on the bar's own basis.**
 *
 * `g.posted` is `startJob`'s `queue.reduce(… it.posted)` over the WHOLE drafted queue (plus whatever
 * `swapIn` added). This is the same sum over the targets actually answered, taken from the same
 * `it.posted` the bar was built from — so the two are comparable by construction and neither is an
 * estimate. It needs no key of its own: the queue is persisted and the pointer is persisted, so it
 * re-derives exactly across a reload (G3.7 proof 6).
 *
 * `callIt` is its caller: a mercy walk is recorded against what the student actually played, not
 * against the queue they never saw (verify round 4, exploit-hunt) and not against 0.
 */
export const postedAnswered = (save) => econ.round(
  queueOf(save).slice(0, answered(save)).reduce((t, it) => t + Math.max(0, num(it?.posted, 0)), 0),
);
/** Is the pointer on the LAST target — the one the getaway gates (G1 "The last target is the vault")? */
export const isVaultTarget = (save) => queueOf(save).length > 0 && idxOf(save) === queueOf(save).length - 1;

/**
 * Was the target the PAYOUT BEAT describes the vault — the queue's last target?
 *
 * `isVaultTarget` reads the POINTER, and by the time any payout-beat predicate can ask, `applyTarget`
 * has already run `markItem`, which moved the pointer on. So the pointer describes the target that is
 * NEXT, never the one that was just answered, and asking `isVaultTarget` at the payout inverted G2's
 * own rule exactly: the Backcheck was refused on target n−1 and ALLOWED on the vault itself — the
 * one beat the rule exists to leave unshielded, because the vault is what the getaway stakes
 * everything on (round 2, ledger-invariance).
 *
 * The answered target is always `queue[idx − 1]`: `markItem` advances by exactly one, and
 * `requeueReview` (which runs first, on a missed review) splices its copy at `last + 1 > i`, never
 * before `i`. A copy spliced in behind the vault does not un-vault the target that was just answered,
 * which is why a trailing run of re-queued copies still reads as the vault.
 */
export function lastWasVault(save) {
  const q = queueOf(save);
  const i = idxOf(save) - 1;
  if (i < 0 || i >= q.length) return false;
  for (let k = i + 1; k < q.length; k++) if (!(int(q[k]?.requeued, 0) > 0)) return false;
  return true;
}

/**
 * A live **plain** Today's Page that has been ANSWERED INTO — `inProgress` with no `.game`,
 * `idx > 0` and targets still unanswered. The one thing `startJob` must never write over.
 *
 * Why the pointer and not merely "a page exists": at `idx === 0` a page is losslessly re-derivable.
 * `composePage` is pure in `pageSeed(profileId, dayIndex, pageIndex)`, `pageIndexFor` counts
 * FINISHED pages, and nothing has been answered — so re-posting reproduces the identical queue,
 * seeded Variant instances included. That is the state a job leaves behind when it is walked at the
 * board (`tests/job-board.test.mjs` "WALK-SCUMMING IS DEAD" re-posts over exactly this), and
 * refusing it would close an affordance the design wants open.
 * The moment the pointer moves, the page stops being re-derivable: the unanswered remainder is a
 * particular queue, and a seeded Variant target that was never missed is in no `save.frozen`. THAT
 * is COMPOSED global rule 5's "no item is ever removed from the schedule by a game decision", and it
 * is what this predicate names.
 *
 * Exported so a screen can redirect on the same predicate the refusal uses, rather than guess at it.
 * @returns {{queue: object[], idx: number, left: number}|null}
 */
export function pageInProgress(save) {
  const ip = resumePage(save);
  if (!isObj(ip) || isObj(ip.game)) return null;
  const idx = Math.max(0, int(ip.idx, 0));
  const left = Math.max(0, ip.queue.length - idx);
  return idx > 0 && left > 0 ? { queue: ip.queue, idx, left } : null;
}

/**
 * THE RE-QUOTE — what the job has LEFT, priced off its own two accumulators.
 *
 * The board quotes `JOB · 11 targets · ~15 min · ends 19:54` once, at the draft. Then a missed review
 * is re-queued (`page.requeueReview`) and the same job silently becomes 12, 13, 16 targets while the
 * header keeps printing the draft's minutes and the draft's end time: a 15-minute job that is now a
 * 25-minute job and never says so. G1 makes the quote mechanical, not decorative — *"every primary
 * button prints cards, minutes and the wall-clock time the run ends … that number is also an input to
 * the vault decision and the commitment bonus, so telling the truth about time is mechanically
 * necessary, not a courtesy"* — and the truth is a subtraction, because `tGame` and `tAnswer` are
 * already measured per job (round 2, player-feel).
 *
 * MEASURED, never claimed: the per-target rate is this job's own wall clock with the one-off beats
 * (board, guard, brief, getaway) taken out, and it falls back to the shape's shipped row only before
 * the first target is answered. `ahead` re-adds the one-off beats that have NOT happened yet.
 * A screen prints it: `16 targets · ~9 min left · ends 20:03`.
 * @param {object} save
 * @param {{now?: number}} [opts]
 */
export function etaOf(save, opts = {}) {
  const g = stateOf(save);
  const now = num(opts.now, 0) || Date.now();
  const of = queueOf(save).length;
  const left = targetsLeft(save);
  const shape = SHAPES[g?.shape] ?? SHAPES.JOB;
  const table = econ.shapeTable(shape);
  const shipped = (num(table.answerS, 0) + num(table.decisionS, 0)) / Math.max(1, int(shape.targets, 1));

  const done = g ? answered(save) : 0;
  const ph = isObj(g?.ph) ? g.ph : null;
  const oneOffDone = (num(ph?.board, 0) + num(ph?.guard, 0) + num(ph?.brief, 0) + num(ph?.getaway, 0)) / 1000;
  const spent = g ? Math.max(0, (num(g.tGame, 0) + num(g.tAnswer, 0)) / 1000) : 0;
  const perTarget = done > 0 ? Math.max(1, (spent - oneOffDone) / done) : shipped;

  /* the one-off beats still ahead, at the ledger's own measured means (the board projects the same way) */
  const means = { ...PHASE_MEANS_DEFAULT, ...(isObj(save?.game?.ledger?.phaseMeans) ? save.game.ledger.phaseMeans : null) };
  const briefsLeft = g ? Math.max(0, Math.min(int(shape.briefs, 0), BOARD.briefAfterTargets.filter((n) => n < of).length) - (g.briefs?.length ?? 0)) : 0;
  const getawayLeft = g && g.stakes !== false && left > 1 ? 1 : 0;
  const ahead = briefsLeft * num(means.brief, 0) + getawayLeft * num(means.getaway, 0);

  /* What the board actually quoted. NOT `shape.targets`: a legal draft serves the shape's count
     exactly on 99.5 % of boards and ±1 otherwise (J5), so the shape would mis-call `grew` by one on
     the rest. `requeueReview` is the ONLY thing that adds to a live queue and it stamps `requeued`
     on every copy it splices, so this is exact. */
  const copies = queueOf(save).filter((it) => int(it?.requeued, 0) > 0).length;
  const drafted = Math.max(0, of - copies);

  const secondsLeft = Math.max(0, Math.round(perTarget * left + ahead));
  return {
    of, left, answered: done, drafted,
    /** the queue has GROWN past what the board quoted — the re-quote's whole reason to exist */
    grew: of > drafted,
    perTarget: Math.round(perTarget), spent: Math.round(spent), ahead: Math.round(ahead),
    secondsLeft, minutesLeft: Math.max(left > 0 ? 1 : 0, Math.round(secondsLeft / 60)),
    endsAt: now + secondsLeft * 1000,
    source: done > 0 ? 'measured' : 'shipped',
  };
}

/**
 * **Hints are always on** (COMPOSED global rule 1, G1 "hints stay free and infinite everywhere —
 * what a hint costs is 30 % of the payout"). CALL IT's "with hints on" is not a state change: it is
 * this constant restated. Exported as a function so a screen cannot accidentally gate on a variable.
 * @returns {true}
 */
export const hintsOn = () => true;

/** The calls this save's rank may make (G2 "Rank": the 95 rung needs Called ≥ 3). */
export const callsAvailable = (save) => call.callsFor(guard.rankOf(save));

/**
 * The current target, PRICED — the `econ.Target` every payoff term reads.
 *
 * `now` is PINNED to the job's own start (`guard.drawnAt`), not the live clock: `cold` is a function
 * of the card's overdue DAYS at the moment the board was posted, and pinning it is what makes the
 * envelope's `posted` equal the board's `posted` and what makes a reload re-price identically.
 * @param {object} save
 * @param {{idx?: number, item?: object, now?: number, tellFor?: Function}} [opts]
 */
export function pricedTarget(save, opts = {}) {
  const g = stateOf(save);
  if (!g) throw new JobStateError('no-job');
  const idx = Number.isInteger(opts.idx) ? opts.idx : idxOf(save);
  const item = opts.item ?? queueOf(save)[idx];
  if (!isObj(item)) throw new JobStateError('no-target');
  const now = num(opts.now, 0) || num(g.guard?.drawnAt, 0) || 0;
  const t = jobTargetOf(item, save, { now: now || Date.now(), order: idx, tellFor: opts.tellFor ?? null });
  const wing = t.wing;
  const guarded = !!wing && g.guard?.wing === wing;
  const tokens = guarded ? 0 : Math.max(0, int(g.tokens?.[wing], 0));
  const make = crew.makeOf(item);
  const cr = crew.crewFor(save, make, item);
  /* THE DECLINED PRICE, ON THE PAYOUT AND NOT ONLY ON THE BAR (verify round 4, exploit-hunt).
     `benchFor` stored the +15 % on `item.posted` and `swapIn` added that inflated figure to
     `g.posted` — the Elo bar — but nothing priced it: this function rebuilds the target from
     `jobTargetOf`, which knows `{tier, scopeFlags, bucket, overdueDays, tell}` and nothing about a
     decline, so the shipped ratio of the priced posted to the bench item's `basePosted` took every
     value the wing/token/guard/rank terms produce and **1.15 exactly 0 times in 470 swap rows**.
     G1 publishes the swap as a PRICE ("swap one undrafted contract in at its declined price"), so it
     has to reach a payout term: `declineMult` is folded into `econ`'s own `num(target.mult, 1)`,
     which `postedFor`, `carryFor`, `missFor` and `stakeOf` all already end on. A declined target is
     therefore worth 15 % more on a clear and costs 15 % more on a miss — a trade, not a free spin.
     It is derived from `item.declined`, which `benchFor` already writes and `swapIn` already carries
     into the queue, so the save grows by NOT ONE BYTE. */
  const declineMult = str(item.declined) ? 1 + DECLINE_PRICE : 1;
  const mult = num(item.mult, 1) * declineMult;
  /* THE DECLINED TELL (verify round 4, exploit-hunt). `brief({tell:false})` was a string pushed into
     `briefs[].took` and nothing else — the next envelope was byte-identical on 40/40 windows and
     `econ.tellFor` went on paying ×1.25 on the very tell the student had just refused. `g.tellOff`
     is that refusal, and it is read HERE, which is the one place every priced surface goes through:
     the envelope does not name the tag, `econ.tellFor` prices the target at 1.00, and `applyTarget`
     finds no live tell to RESOLVE — so the fault stays live and keeps paying on the later targets of
     that make. That is the trade the option buys: this target's quarter against the tag's own life.
     `applyTarget` consumes the flag, so it governs exactly the ONE target G1 names ("the NEXT
     target's tell"). */
  const declinedTell = g.tellOff === true && t.tell != null;
  const tell = declinedTell ? null : t.tell;
  return {
    ...t,
    tell,
    /**
     * Was this target's tell WITHHELD by a `brief({tell:false})`? A BOOLEAN, deliberately — not the
     * tag. `screens/job.js` calls `pricedTarget` directly (`:1579`, `:1743`), so a field carrying
     * the refused tag would hand the screen the very disclosure the student declined, and the
     * refusal would be a refusal of the payout only. This says *that* a tell was declined, which is
     * all a panel needs to explain what the window bought.
     */
    tellDeclined: declinedTell,
    item,
    idx,
    make,
    tokens,
    guarded,
    mult,
    declined: str(item.declined) ?? null,
    rank: guard.rankOf(save),
    x2: item.x2 === true,
    crew: cr.effective,
    idle: cr.idle,
    crewInfo: cr,
    posted: econ.postedFor({ ...t, tell, mult, tokens, guarded, rank: guard.rankOf(save), x2: item.x2 === true }),
  };
}

/**
 * **The sealed envelope** (G1 "why the call comes first", G3.7 proof 5).
 *
 * Everything the student bids on, and nothing they could answer from: no card id, no template, no
 * seed, no params, no stem, no figure. That is the seal — the screen cannot render a stem it cannot
 * address, so the property is structural rather than a rule the renderer is asked to keep.
 * @returns {{n, of, make, name, grade, cold, posted, from, sources, wing, tell, x2, critical,
 *            guarded, tokens, crew, idle, calls, stakes, role}}
 */
export function envelopeFor(save, opts = {}) {
  const g = stateOf(save);
  if (!g) throw new JobStateError('no-job');
  const t = pricedTarget(save, opts);
  const it = t.item;
  return Object.freeze({
    n: int(it.n, t.idx + 1),
    of: queueOf(save).length,
    make: t.make,
    name: str(opts.makeName) ?? t.make,
    grade: int(it.tier, 1),
    cold: num(t.overdueDays, 0),
    posted: t.posted,
    from: str(it.from),
    sources: Array.isArray(it.sources) ? it.sources.slice() : [],
    wing: t.wing,
    tell: t.tell ?? null,
    x2: t.x2,
    critical: it.critical === true,
    guarded: t.guarded,
    tokens: t.tokens,
    crew: t.crew,
    idle: t.idle,
    role: str(it.role),
    calls: callsAvailable(save),
    stakes: g.stakes !== false,
    hints: hintsOn(),
  });
}

/**
 * The address of the stem — `null` until the call is locked. This is the other half of the seal:
 * `screens/job.js` mounts `card.js`'s answering body from THIS object, so before the call there is
 * nothing to mount.
 * @returns {{id, kind, template, seed, params, item}|null}
 */
export function stemRefFor(save) {
  const g = stateOf(save);
  if (!g) return null;
  if (g.stakes !== false && !isObj(g.locked)) return null;          // sealed: no call, no stem
  if (g.phase === 'envelope' || g.phase === 'call' || g.phase === 'board' || g.phase === 'guard') return null;
  const it = currentItem(save);
  if (!isObj(it)) return null;
  return {
    id: it.id ?? null, kind: it.kind ?? 'card', template: it.template ?? null,
    seed: it.seed ?? null, params: it.params ?? null, item: it,
  };
}

/* ==========================================================================================
   G1 — board → guard → envelope
   ========================================================================================== */

/**
 * Start a job: `board.buildJob` draws it (bundles, picks, tokens, guard, ×2 — all from the PINNED
 * seed), the drafted queue becomes the study layer's own `inProgress.queue`, and the record becomes
 * `inProgress.game`.
 *
 * `inProgress.kind` stays `'page'`: the job IS Today's Page, re-skinned, and that is what lets
 * `markItem` / `requeueReview` / `finishPage` work unchanged (G7 "One queue, two skins").
 * @param {object} save
 * @param {{picks?, tokens?, now?, today?, board?, shape?, seed?, jobIndex?, force?}} [opts]
 * @returns {object} the job record (`inProgress.game`)
 */
export function startJob(save, opts = {}) {
  const s = guardSave(save);
  if (stateOf(s) && !opts.force) return stateOf(s);
  /* A HALF-ANSWERED PLAIN PAGE IS NOT A BLANK SLATE (COMPOSED global rule 5: "No item is ever
     removed from the schedule by a game decision"). The only guard here used to be `stateOf(s)` — an
     existing `inProgress.game` — so a Today's Page in progress, which has no `.game`, fell straight
     through to the `s.inProgress = {…}` below and was overwritten: its unanswered items were gone,
     its `finishPage()` never ran (`counters.pages` never moved), and a seeded Variant target that
     was never missed is not in `save.frozen`, so that exact instance is unrecoverable. `#/run/job`
     is a public hash route — a back-button, a bookmark or a reload of a URL left in history reaches
     it — and `plan.js`'s "a resume always wins" only governs Home's button, not the route (round 2,
     ledger-invariance).
     `pageInProgress` is deliberately the ANSWERED-INTO page and not merely a live one: a page at
     `idx === 0` re-derives byte-identically from its own pinned seed, which is what lets a board
     walked at the board be re-posted. See its own note.
     The refusal is the whole fix HERE, where the queue is written; a screen may then redirect to
     `#/run/page` the way it already redirects on a closed board. `opts.force` is the deliberate
     override (the same flag that already lets a caller restart over a live JOB). */
  if (!opts.force) {
    const live = pageInProgress(s);
    if (live) throw new JobStateError('page-in-progress', `${live.left} left on Today's Page`);
  }
  const now = num(opts.now, 0) || Date.now();
  /* the backstop for the PREVIOUS job's debrief read — a no-op when there is no open stamp */
  closeDebrief(s, { now });
  const built = buildJob(s, { ...opts, now });
  const queue = jobQueueOf(built) ?? [];
  const board = jobBoardOf(built);
  if (!queue.length) throw new JobStateError('empty-board');

  playerOf(s); gameOf(s);
  const g = serialize(freshState({
    ...built,
    posted: econ.round(queue.reduce((t, it) => t + num(it.posted, 0), 0)),
    phase: 'board',
    phaseAt: now,
    rating0: num(playerOf(s).rating?.value, RATING_DEFAULT),   // the debrief's real delta (J6b R2)
  }));
  s.inProgress = {
    kind: 'page', seed: built.seed, seedTag: board?.page?.seedTag ?? null,
    queue, idx: 0, hearts: null, xp: 0, bench: benchFor(board, g.picks, queue),
    startedAt: now, day: board?.day ?? todayISO(new Date(now)),
    dayIndex: board?.page?.meta?.dayIndex ?? 0, pageIndex: board?.page?.meta?.pageIndex ?? 0,
    meta: board?.page?.meta ?? null,
    game: g,
  };
  return g;
}

/** The tokens standing on the wings, as a count. */
const totalTokens = (t) => WING_IDS.reduce((n, w) => n + Math.max(0, int(t?.[w], 0)), 0);

/** The seed the brief window's redraw is PINNED to — this job, this window, and nothing else. */
const repressSeed = (g) => `${g.seed}|brief${g.briefs.length}`;

/**
 * **Has the guard already drawn AGAIN inside the brief window that is open?** The whole re-press
 * ledger, with no key of its own on `inProgress.game`: `setPhase` stamps `phaseAt` when the window
 * opens and `press()` stamps `guard.drawnAt` when it redraws, so `drawnAt > phaseAt` IS "this
 * window's one token has been lifted". It survives a reload because both halves are in the save,
 * and it clears itself when the window closes and `phaseAt` moves past it.
 */
const repressed = (g) => num(g?.guard?.drawnAt, 0) > num(g?.phaseAt, 0);

/**
 * Why a press would be refused right now, or `null`. Pure — `canPress` and `press` share it so a
 * screen can grey a +/− button out with exactly the rule the state machine will enforce.
 *
 * ── S5, THE RESIDUAL THIS FUNCTION DOES NOT CLOSE, NAMED RATHER THAN CLOSED ──────────────────
 * Two brief-window leaks survive here ON PURPOSE, because closing them at this level would break
 * the sixteen tests written to pin this repair (`tests/job-state-r3.test.mjs`), and a repair that
 * weakens a test is refused outright (designs/REPAIR-DECISION.md S5.2):
 *
 *   1. **lift-then-place is two calls, and the second one is informed.** `press()` redraws on the
 *      LIFT, so the new wing is published through `envelopeFor` before the freed token is placed —
 *      and because the redraw seed is pinned to `${seed}|brief${n}`, the place cannot re-roll it,
 *      which is exactly what makes the second half a fully informed free move. Measured, on a fresh
 *      window: lift off the guarded wing → ACCEPTED, wing WORDS → RECALL; place on another wing →
 *      ACCEPTED against the now-known RECALL, no second draw.
 *      `job-state-r3.test.mjs:242-256` asserts `canPress(place-after-lift) === true` at module
 *      level, so the law CANNOT live here. **It lives in `screens/job.js`**, which stages the +/−
 *      into a screen-local pending allocation and submits ONE atomic press (`added = 1,
 *      removed = 1`, `lifted` false) through `brief({ repress })`.
 *   2. **The bare press** (`added === 0 && removed === 0`) stays legal below, and `press()` then
 *      redraws anyway — a free re-roll of the guarded wing. It must stay legal here: the priced
 *      button (`job-state-r3.test.mjs:181`), `job-split.test.mjs:194` and the fixture in
 *      `tests/_helpers.mjs` all exercise the unchanged allocation. The screen is what must not
 *      OFFER it — the submit button is disabled while the staged allocation equals the live one.
 *
 * The structural alternative, recorded for whoever revisits it: redraw unconditionally on ENTERING
 * the brief window, so the redraw stops being the student's option at all and a bare press becomes
 * a genuine no-op that stays legal and worthless.
 *
 * What is NOT a residual, because this function already refuses it: a wholesale re-allocation.
 * Three tokens moved off the known guarded wing in one call is `repress-step`, and `canPress`
 * agrees (`job-state-r3.test.mjs:216-225`; re-measured for r3 finding 56, whose headline — "the
 * brief window re-presses all 3 tokens for free" — is the round-2 shape of this code, not this one).
 * @returns {JobStateError|null}
 */
function pressRefusal(g, t) {
  if (!(g.phase === 'board' || g.phase === 'guard' || g.phase === 'brief')) return new JobStateError('press-closed', g.phase);
  const total = totalTokens(t);
  if (total > GUARD.tokens) return new JobStateError('too-many-tokens', String(total));
  if (g.phase !== 'brief') return null;                     // the board press is free and sealed

  /* THE BRIEF WINDOW. COMPOSED-GAME §"What a brief window is": *"Re-press ONE token with the guard
     distribution redrawn"*. The guard's wing is public by now — `envelopeFor` has printed `guarded`
     on every target served — so a press here is made against a KNOWN wing, and the redraw is the
     price that makes it a trade instead of a free +15.2 %. Two rules, both read off the save:
       · at most one token is lifted per window (`repressed`), and
       · a token may only be PLACED after one has been lifted in this window,
     so a window is either one atomic move or lift-then-place, and never more. The option itself
     only exists on a full press: with fewer than `GUARD.tokens` down, "re-press one token" has no
     meaning that is not "press a token you never spent". */
  const cur = g.tokens;
  let added = 0; let removed = 0;
  for (const w of WING_IDS) {
    const d = Math.max(0, int(t?.[w], 0)) - Math.max(0, int(cur?.[w], 0));
    if (d > 0) added += d; else removed -= d;
  }
  if (added === 0 && removed === 0) return null;            // a bare "redraw the guard" — always legal
  if (added > 1 || removed > 1) return new JobStateError('repress-step', `-${removed}/+${added}`);
  const lifted = repressed(g);
  if (removed > 0 && lifted) return new JobStateError('repress-spent', String(g.guard?.wing ?? ''));
  if (added > 0 && removed === 0 && !lifted) return new JobStateError('repress-lift-first', String(added));
  if (!lifted && totalTokens(cur) !== GUARD.tokens) return new JobStateError('repress-unavailable', String(totalTokens(cur)));
  return null;
}

/** May the press panel take this allocation right now? (`screens/job.js` gates its +/− with it.) */
export function canPress(save, tokens) {
  const g = stateOf(save);
  return !!g && g.outcome == null && pressRefusal(g, tokens) === null;
}

/**
 * PRESS — the 3 pressure tokens across the drafted wings, sealed (G1). Legal at the board, where it
 * is free and blind, and ONCE inside a brief window, where it is not: there the guard has already
 * shown its wing through the envelopes, so a re-press moves one token AND REDRAWS THE GUARD from
 * the same published distribution. That redraw is this function's job and not `brief()`'s, because
 * the screen's +/− handler commits through here directly — round 3: it used to write the new
 * allocation against the guard the student could already see, so `brief({repress})`'s priced button
 * was strictly dominated by tapping ± and then Skip, worth +15.2 % posted over 8 seeds.
 * The redraw is PINNED to `${seed}|brief${n}`: pressing twice in one window cannot re-roll it, and
 * neither can a reload.
 * @param {object} save
 * @param {Record<string, number>} tokens
 */
export function press(save, tokens, opts = {}) {
  const s = guardSave(save);
  const g = mustState(s);
  const t = freshTokens();
  for (const w of WING_IDS) t[w] = Math.max(0, int(tokens?.[w], 0));
  const no = pressRefusal(g, t);
  if (no) throw no;
  g.tokens = t;
  if (g.phase === 'brief') {
    const wing = guard.drawGuard(g.guard.dist, repressSeed(g));
    /* `drawnAt` is stamped past `phaseAt` whatever the clock did, so the one-token ledger above is
       never a hostage to a caller that forgot to pass `now` — and the fallback is the window's own
       instant and NOT `Date.now()`, because `envelopeFor` prices `cold` against this field: a
       screen that presses without a clock must not move the job's pinned basis by a wall-clock
       hour. `screens/job.js bump()` is exactly that caller. */
    g.guard = { ...g.guard, ...(wing ? { wing } : null), drawnAt: Math.max(num(opts.now, 0), num(g.phaseAt, 0) + 1) };
  }
  return g.tokens;
}

/** Leave the board for the first envelope (the guard is already drawn and printed). */
export function beginTargets(save, opts = {}) {
  const s = guardSave(save);
  const g = mustState(s);
  if (g.phase !== 'board' && g.phase !== 'guard') throw new JobStateError('not-at-board', g.phase);
  setPhase(g, 'envelope', num(opts.now, 0) || Date.now());
  return g;
}

/* ==========================================================================================
   G1 — CALL (before the stem)
   ========================================================================================== */

/** May this call be locked right now? */
export function canLockCall(save, callId) {
  const g = stateOf(save);
  if (!g || g.outcome != null) return false;
  if (g.stakes === false) return false;
  if (!(g.phase === 'envelope' || g.phase === 'call')) return false;
  if (!currentItem(save)) return false;
  return call.canCall(callId, guard.rankOf(save));
}

/**
 * CALL — lock the confidence, THEN unseal the stem (G1 "The sealed envelope"). The rung the call
 * buys is fixed here and never revised by the answer.
 * @param {object} save
 * @param {number} callId  50 · 70 · 85 · 95
 */
export function lockCall(save, callId, opts = {}) {
  const s = guardSave(save);
  const g = mustState(s);
  if (g.stakes === false) throw new JobStateError('stakes-off');
  if (!(g.phase === 'envelope' || g.phase === 'call')) throw new JobStateError('not-at-envelope', g.phase);
  const it = currentItem(s);
  if (!isObj(it)) throw new JobStateError('no-target');
  if (!call.canCall(callId, guard.rankOf(s))) throw new JobStateError('call-not-available', String(callId));
  const now = num(opts.now, 0) || Date.now();
  g.locked = { call: int(callId, CALL_DEFAULT), n: int(it.n, idxOf(s) + 1), at: now };
  setPhase(g, 'answer', now);
  return g.locked;
}

/**
 * Open the stem on a NO-STAKES target (after CALL IT, or after the 22:00 close). There is no call to
 * lock, so this is the beat that replaces `lockCall` — and it is the only other door to the stem.
 */
export function beginAnswer(save, opts = {}) {
  const s = guardSave(save);
  const g = mustState(s);
  if (g.stakes !== false) throw new JobStateError('stakes-on');
  if (g.phase !== 'envelope') throw new JobStateError('not-at-envelope', g.phase);
  if (!currentItem(s)) throw new JobStateError('no-target');
  setPhase(g, 'answer', num(opts.now, 0) || Date.now());
  return g.phase;
}

/* ==========================================================================================
   G1 — ANSWER → payout
   ========================================================================================== */

/** `almost` / `malformed` are FREE: no rung, no payout, no chain change (G1, global law 2). */
export const isFreeResult = (result) => result?.free === true || FREE_OUTCOMES.includes(result?.reason);

/**
 * G1's ladder, read off `screens/card.js`'s own result object and off nothing else.
 *
 * The four clear rungs are exactly `xp.comboTransition`'s three shapes plus the attempt split, so
 * `econ.chainAfterTarget(rungOf(r), 0, c)` and `xp.nextCombo(c, r)` agree on every result — which is
 * G2's "chain transitions are `xp.comboTransition()` verbatim", proved rather than asserted.
 * @returns {0|1|2|3|4|null}  null for a free outcome
 */
export function rungOf(result) {
  if (!isObj(result)) return null;
  if (isFreeResult(result)) return null;
  if (result.cleared !== true) return MISS_RUNG;
  const hints = Math.max(0, int(result.hints, 0));
  if (result.firstTry === true) return hints === 0 ? RUNGS.CLEAN : RUNGS.HINT1;
  return Math.max(2, int(result.attempt, 2)) >= 3 ? RUNGS.ATT3 : RUNGS.ATT2;
}

/**
 * The record `run.js` builds before `markItem` — built here identically so the schedule sees exactly
 * what the flat path writes (`tests/job-ledger.test.mjs`).
 */
const resultRecord = (it, result) => ({
  ...result, n: it.n, role: it.role, skill: it.skill ?? (it.skills || [])[0] ?? null, tier: it.tier,
});

/* ==========================================================================================
   THE FAULT INDEX — the caller J7 wrote `trigger` / `resolve` for (notes/J9.md F1)
   ==========================================================================================
   Until this landed, `save.game.tags` was never written by anything: a tell that had triggered
   paid `econ.tellFor`'s ×1.25 for ever, no tag could ever clear, and nothing could seal. J7's
   module was correct; the gap was entirely the missing call site, and it is here because this is
   the only place that knows BOTH the graded outcome and the priced target's tell.

   Both functions are pure and return a whole new save. This module mutates a draft, so what is
   written back is the `tags` MAP they return — the same object, reached the way everything else in
   `applyTarget` is reached. `game` is Ledger B, so `guardSave` allows the write; `errors` is Ledger
   A and is only ever READ. */

/**
 * The tags of the miss that has just been graded: `screens/card.js` logs the error (with the
 * grader's tags) at grade time, BEFORE `applyTarget` is reached, so the newest error entry for this
 * item is this beat's. One trigger per missed target, however many attempts it took — `trigger()`
 * is "one miss carrying it", not one keystroke carrying it.
 */
function missTagsOf(save, item) {
  const errors = Array.isArray(save?.errors) ? save.errors : [];
  for (let i = errors.length - 1; i >= 0; i--) {
    const e = errors[i];
    if (!isObj(e) || e.item !== item.id) continue;
    const tags = Array.isArray(e.tags) ? e.tags : [];
    return [...new Set(tags.filter((t) => typeof t === 'string' && t))];
  }
  return [];
}

/**
 * Write one Fault Index transition onto the draft. Returns the result so the caller can read
 * `justSealed` (G2's one dry line, `index.sealedLine`). An unknown tag is refused by `index.js`
 * itself, reports `changed: false`, and writes nothing.
 */
function keepTags(save, res) {
  if (res.changed) gameOf(save).tags = res.tags;
  return res;
}

/**
 * **The beat.** One graded target: price it into LEDGER B, write the rating call, and mark the item
 * through the study layer's OWN `requeueReview` / `markItem`.
 *
 * `result` is `screens/card.js`'s result object, unchanged. Ledger A has ALREADY been written by
 * card.js at grade time, before this function is reached: nothing here touches it, and the guard
 * makes that structural rather than a promise.
 *
 * Stops at the payout beat. Nothing auto-advances (COMPOSED global rule 4): `bag()` or `push()`
 * occupies the continue tap.
 *
 * @param {object} save
 * @param {object} result  card.js's `st.result`
 * @param {{now?: number, cards?: object, tellFor?: Function}} [opts]
 * @returns {{kind, rung, rho, delta, loose, bagged, chain, chainBefore, posted, call, ok, credit,
 *            w, free, target, backcheckable, next}}
 */
export function applyTarget(save, result, opts = {}) {
  const s = guardSave(save);
  const g = mustState(s);
  if (!(g.phase === 'answer' || g.phase === 'payout')) throw new JobStateError('not-answering', g.phase);
  const it = currentItem(s);
  if (!isObj(it)) throw new JobStateError('no-target');
  const now = num(opts.now, 0) || Date.now();

  /* free outcomes never reach the schedule or the ledger; the target is still live */
  if (isFreeResult(result)) {
    return {
      kind: 'free', rung: null, rho: null, delta: 0, free: true,
      loose: g.loose, bagged: g.bagged, chain: g.chain, chainBefore: g.chain,
      posted: 0, call: g.locked?.call ?? null, ok: null, credit: 0, w: 0,
      target: null, backcheckable: false, next: 'answer',
    };
  }

  const stakes = g.stakes !== false;
  const t = stakes ? pricedTarget(s, { item: it, idx: idxOf(s), tellFor: opts.tellFor }) : null;
  /* G1's fourth brief option is ONE TARGET WIDE — "take or decline the NEXT target's tell". The flag
     is read by `pricedTarget` one line above (which withheld the tag and its ×1.25) and is spent
     HERE, so the window after this one starts from take again. Spent on a stakes-off target too:
     nothing can set it with the stakes off (a stakes-off beat never reaches `brief`), and a flag that
     could outlive the job it was set on is the `commit.bound` bug over again. */
  const declinedTell = g.tellOff === true;
  g.tellOff = false;
  const rung = rungOf(result);
  const ok = result?.cleared === true;
  const callId = stakes ? int(g.locked?.call, CALL_DEFAULT) : null;
  const chainBefore = Math.max(0, int(g.chain, 0));
  const looseBefore = Math.max(0, num(g.loose, 0));

  /* ---- LEDGER B: the stake ------------------------------------------------------------- */
  let settled = { kind: 'free', delta: 0, loose: looseBefore, chain: chainBefore, rho: null };
  let entryW = 0, credit = 0;
  if (stakes) {
    settled = econ.settle({ ...t, call: callId, rung, crew: t.crew, idle: t.idle }, chainBefore, looseBefore);
    g.loose = settled.loose;
    g.chain = settled.chain;

    /* the rating window — written on EVERY staked target, shielded or not (G3.7 #10, G12 #26) */
    const qHat = call.qHatFor(s, t.make, { cards: opts.cards ?? cardById });
    const entry = call.callEntry({ call: callId, ok, qHat, skill: t.make, at: now });
    /* `call.weightOf`, not `entry.w`: since round-4 verify a q̂-derived slot stores the q̂ and the
       weight is derived from it (`call.callEntry`'s banner says why — the rank cap needs the
       evidence, not just the weight). `weightOf` reads BOTH forms. */
    entryW = call.weightOf(entry);
    credit = call.creditOf(callId, ok);
    const p = playerOf(s);
    p.rating.calls = call.windowPush(p.rating.calls, entry, { N: CAPS.calls });
    /* THE RANK IS A RATCHET (S3). `{ rank: p.rank }` floors the computed rank on the rank already
       held: the RATING falls as the student masters their makes — that is the deflation G2 wants —
       but the rank it bought does not, because rank gates the 95 rung and guardMult (tools), and
       this layer never removes a tool you own. Read BEFORE the write on the next line, which is
       why this writer was the reason the two displays that already passed `{rank}` were dead on
       arrival: they floored on a `p.rank` this line had already overwritten with 2.

       AND THE AUDIT RECORD BELOW IS `detail.earned`, NOT `detail.value` (verify round 2). THE CAP
       prices the rank off `earned = ceiling`: `value` is what the dice paid, `earned`
       is what the student's own reports were WORTH, and only the second buys a rung. `rankFor` is
       monotone, so a high-water over `earned` is exactly the number the held rank recomputes from —
       `p.rank === max(the rank the save started at, rankFor(p.records.bestRating))`, which is the
       whole of G9 #4's one exception. Storing `value` published a record that bought nothing: on a
       capped window it printed `Called 3 · best rating 10.00`, a pair no reviewer can reconcile.
       `bestRating20` is the separate, honestly-labelled high-water of the PRINTED rating and stays
       on `value`. (COMPOSED-GAME G2 "Rank", G9 #4, G12 #78.) */
    const detail = call.ratingDetail(p.rating.calls, CAPS.calls, { rank: p.rank });
    p.rating.value = detail.value;
    p.rating.n = detail.n;
    p.rank = detail.rank;
    /* the ratchet's audit record (S3.1(c)): a floored `p.rank` is no longer recomputable from the
       window, so the high-water rating that bought it is kept beside it. Written at EVERY writer of
       `p.rating.value` — here, `endJob`, and `screens/mock.js applyMockCall`. */
    p.records.bestRating = Math.max(num(p.records.bestRating, 0), detail.earned);
    p.records.bestChain = Math.max(num(p.records.bestChain, 0), g.chain);

    g.calls.push(cleanCall({ call: callId, ok, w: entryW, skill: t.make, rung, d: settled.delta, at: now }));
    g.last = {
      n: int(it.n, idxOf(s) + 1), d: settled.delta, rung, ok,
      chainBefore, looseBefore, shielded: false,
    };
  } else {
    g.last = { n: int(it.n, idxOf(s) + 1), d: 0, rung, ok, chainBefore, looseBefore, shielded: false };
  }
  g.locked = null;

  /* ---- THE FAULT INDEX (G2, G5 #5) -------------------------------------------------------
     A miss triggers every tag the grader returned; a clean clear of a target whose make carried a
     LIVE tell resolves it, which drops `econ.tellFor` to 1.00 on this same tick and advances the
     seal. `tellFor` never offers a SEALED tag; it may offer a cleared-but-unsealed one, ranked
     behind every live tag, which is how resolutions #2 and #3 reach the seal (`job/index.js`
     header, and `tests/job-index.test.mjs` §2b proves it through this machine). It is priced at
     1.00 by `econ.tellFor`, so resolving it again moves no payout. The old second clause here —
     "a returned record is live by construction" — was false against the shipped `index.js`
     (notes/repair-index.md Request 1; `index.tellFor(save,'FAC2',…).live === false` for a resolved
     tag). The day is required or the seal cannot count a third distinct day. */
  /* A DECLINED tell is not resolved either (verify round 4): `pricedTarget` already nulled `t.tell`,
     and the stakes-off fallback is gated on the same flag so the two paths cannot disagree. Refusing
     the disclosure leaves the fault LIVE — it goes on paying ×1.25 on the later targets of this make
     and it does not advance toward the seal. That is the whole price of the option, and it is the
     study half, not the loot half, which is why the option is a decision rather than a discount. */
  const tell = declinedTell ? null
    : (t ? t.tell : (typeof opts.tellFor === 'function' ? (opts.tellFor(it.skill, it) ?? null) : null));
  let sealedTag = null;
  if (ok) {
    const tag = isObj(tell) ? tell.tag : null;
    if (tag) {
      const res = keepTags(s, index.resolve(s, tag, { day: todayISO(new Date(now)) }));
      if (res.justSealed) sealedTag = res.tag;
    }
  } else {
    for (const tag of missTagsOf(s, it)) keepTags(s, index.trigger(s, tag));
  }

  /* ---- LEDGER A: the SCHEDULE, through the study layer's own two calls -------------------- */
  const r = resultRecord(it, result);
  if (!ok && (it.isReview || it.isRematch)) requeueReview(s, { idx: idxOf(s), result: r });
  markItem(s, r, { idx: idxOf(s) });

  setPhase(g, 'payout', now);
  return {
    kind: settled.kind, rung, rho: settled.rho, delta: settled.delta, free: false,
    loose: g.loose, bagged: g.bagged, chain: g.chain, chainBefore,
    posted: t ? t.posted : 0, call: callId, ok, credit, w: entryW,
    target: t, backcheckable: canBackcheck(s), next: nextBeat(s),
    /** the tag that sealed on THIS tick, or null — `index.sealedLine(tag)` is its one dry line */
    sealedTag,
  };
}

/** Which beat follows the payout: `bagpush` · `brief` · `getaway` · `debrief`. */
function nextBeat(save) {
  const g = stateOf(save);
  if (!g) return TERMINAL_PHASE;
  if (targetsLeft(save) === 0) return TERMINAL_PHASE;
  return g.stakes === false ? 'envelope' : 'bagpush';
}

/* ==========================================================================================
   G1 — BAG / PUSH (the continue tap, occupied)
   ========================================================================================== */

/** The bag prompt's numbers: `bag 118 (fee 13 · chain 4 → 0)` (G2, G12 #3). */
export function bagPrompt(save) {
  const g = stateOf(save);
  if (!g) throw new JobStateError('no-job');
  const s = Math.max(0, num(g.loose, 0));
  const amount = econ.round(s);
  const fee = econ.bagFee(s);
  return { amount, fee, banked: amount - fee, chainBefore: Math.max(0, int(g.chain, 0)), chainAfter: econ.chainAfterBag(), free: false };
}

/**
 * BAG — bank the loose pile. Mid-job: fee 10 %, **chain → 0** (`econ.chainAfterBag`, the fourth
 * transition — G2, G12 #3). LOOSE → 0. BAGGED is only ever added to: there is no state in which the
 * game takes something already bagged.
 */
export function bag(save, opts = {}) {
  const s = guardSave(save);
  const g = mustState(s);
  if (!(g.phase === 'payout' || g.phase === 'bagpush')) throw new JobStateError('not-at-bagpush', g.phase);
  if (g.stakes === false) throw new JobStateError('stakes-off');
  const p = bagPrompt(s);
  g.bagged = econ.round(num(g.bagged, 0) + p.banked);
  g.loose = 0;
  g.chain = econ.chainAfterBag();
  const pl = playerOf(s);
  pl.records.bestBag = Math.max(num(pl.records.bestBag, 0), g.bagged);
  const debrief = advance(s, g, num(opts.now, 0) || Date.now());
  return { ...p, bagged: g.bagged, loose: g.loose, chain: g.chain, debrief };
}

/** PUSH — keep the chain and the pile, and move to the next beat. */
export function push(save, opts = {}) {
  const s = guardSave(save);
  const g = mustState(s);
  if (!(g.phase === 'payout' || g.phase === 'bagpush')) throw new JobStateError('not-at-bagpush', g.phase);
  const debrief = advance(s, g, num(opts.now, 0) || Date.now());
  return { loose: g.loose, bagged: g.bagged, chain: g.chain, phase: g.phase, outcome: g.outcome, debrief };
}

/**
 * The one place the pointer's consequences are read. `markItem` has already moved `inProgress.idx`;
 * this decides which of G1's beats the student lands on.
 */
/**
 * Move to the next beat, and END THE JOB when the pointer runs out.
 *
 * Returns the DEBRIEF when it ended one, `null` otherwise. `bag()` and `push()` pass it back on
 * their own return value: without it the last target's `push()` ends the job through `endJob()` →
 * `finishPage()`, which nulls `inProgress`, and the caller is left with a status object and no way
 * to ask for the debrief — so `screens/job.js` and `tests/job-debrief.test.mjs` both had to call
 * `endJob(save, finalWordOf(save))` themselves and duplicate the word choice below. One return value
 * removes both duplications (notes/J6.md §5.3 → J5c, notes/J6b.md R3 — the same request, twice).
 */
function advance(save, g, now) {
  const left = targetsLeft(save);

  /* ---- the BOUND DECLARATION (G3.9), as a structural backstop --------------------------------
     "A declaration BINDS: at the declared minute the job auto-bags at full value and ends." G3.9's
     trigger is a CLOCK, so `screens/job.js` owns the 15-second watch that makes it land ON the
     minute — but a transition whose only caller is a screen is a transition that can be forgotten,
     which is exactly how `quietClose` below spent a whole ticket unreachable. This is the same
     boundary, and it costs one predicate: whatever else happens, a job cannot walk PAST its own
     declared minute. It never fires before the screen's clock (a boundary is never earlier than a
     15 s poll), so in the app it is dead code that guarantees the rule off-screen.
     Like the 22:00 close below, it is skipped once the last target is answered: a job that is already
     ending has nothing left for a declaration to bind, and firing here would swap G1's +10 %
     completion for G3.9's +8 % on a job that completed. */
  if (left > 0 && g.outcome == null && commitDue(save, num(now, 0) || Date.now())) {
    return commitFire(save, { now });
  }

  /* ---- the 22:00 close (G1 "After 22:00", G5 / G11's BOARD_CLOSED) -----------------------------
     "a job in progress **auto-bags at the next target boundary at full value** with `Banked at 22:00.
     Nothing lost.`; continued play is allowed with **stakes and calls off**".
     THE NEXT TARGET BOUNDARY IS HERE. `quietClose` was written for J11 to poll from `screens/job.js`
     and J11 never called it, which left the whole close unreachable: `AUTO_BAG.quiet22`,
     `COPY.quietBanked` and the `quiet22` outcome were all dead. A poll is also the wrong mechanism —
     it can be forgotten, and it was. This is the one place the pointer's consequences are read, so
     the close is structural here and cannot be skipped by any screen.
     With the declaration above, these are the layer's ONLY two live-clock branches, and neither is a
     payoff term: both bank at 100 % and take nothing, and G1's own law ("answers tick; time does
     not") is about what the arithmetic reads.
     A job whose LAST target has just been answered is not "in progress": it is already banking at the
     getaway's free 100 %, which is the same rate the close would give it, so closing it there would
     take nothing but its own name (a vault cracked at 22:01 would be recorded `quiet22` at posted 0).
     The close therefore fires only while there is a target left to protect. */
  if (left > 0 && g.stakes !== false && g.outcome == null && isQuietHours(new Date(num(now, 0) || Date.now()))) {
    quietClose(save, { now, end: false });
    return null;
  }

  if (left === 0) {
    /* CRACKED is the vault CRACKED — the last target cleared. A crack that missed is G1's **Knocked**,
       and calling it `cracked` made `records.cracked`, the debrief and Stats' "Vaults cracked" count a
       failure as a success. `g.last` is written by `applyTarget` for every non-free target. */
    const lastOk = g.last?.ok === true;
    const word = g.stakes === false ? (g.quiet === true ? OUTCOMES.QUIET22 : OUTCOMES.CALLED)
      : queueOf(save).length > 1 ? (lastOk ? OUTCOMES.CRACKED : OUTCOMES.KNOCKED)   // only reachable through CRACK
        : OUTCOMES.COMPLETED;                              // a one-target job has no getaway beat
    return endJob(save, word, { now });
  }
  const done = answered(save);
  const shape = SHAPES[g.shape] ?? SHAPES.JOB;
  const wantsBrief = g.stakes !== false
    && BOARD.briefAfterTargets.includes(done)
    && g.briefs.length < num(shape.briefs, 0);
  if (wantsBrief) { setPhase(g, 'brief', now); return null; }
  if (g.stakes !== false && left === 1) { setPhase(g, 'getaway', now); return null; }
  setPhase(g, 'envelope', now);
  return null;
}

/* ==========================================================================================
   G2 — Backchecks: the stake, and ONLY the stake
   ========================================================================================== */

/** May a Backcheck be spent on the beat that is on screen? */
export function canBackcheck(save) {
  const g = stateOf(save);
  if (!g || g.outcome != null || g.stakes === false) return false;
  if (!(g.phase === 'payout' || g.phase === 'bagpush')) return false;
  const last = g.last;
  if (!isObj(last) || last.shielded === true) return false;
  if (!(num(last.d, 0) < 0)) return false;                                  // only a miss that COST something
  /* NOT `isVaultTarget`, which reads the pointer `markItem` has already moved — see `lastWasVault`. */
  if (!BACKCHECK.allowedOnVault && lastWasVault(save)) return false;         // not on the vault itself
  return Math.max(0, int(save?.game?.backchecks?.held, 0)) > 0;
}

/**
 * Spend a Backcheck (G2 "Backchecks", G3.7 #10). **The chain holds and LOOSE is not taken.** It
 * changes the stake and NOTHING else — not the grade, the bucket, the mastery, the error log, the
 * Rematch, or the `calls[]` entry the rating window reads. The entry was pushed by `applyTarget`
 * before this function can run, which is what makes that byte-identity structural.
 */
export function backcheck(save, opts = {}) {
  const s = guardSave(save);
  const g = mustState(s);
  if (!canBackcheck(s)) throw new JobStateError('no-backcheck');
  const last = g.last;
  g.loose = Math.max(0, num(last.looseBefore, 0));
  g.chain = Math.max(0, int(last.chainBefore, 0));
  last.shielded = true;
  g.bc = Math.max(0, int(g.bc, 0)) + 1;
  const gm = gameOf(s);
  gm.backchecks.held = Math.max(0, int(gm.backchecks.held, 0) - 1);
  return { loose: g.loose, chain: g.chain, held: gm.backchecks.held, spent: g.bc };
}

/**
 * G2's mint: **1 per day for a day on which `dues ≥ 1` and every one of them was cleared** (a day
 * with zero dues mints nothing — G12 #38), capped at 3 held. This is the arithmetic, so there is
 * exactly one of it; `mintForJob` below is the call site that takes both of G2's sources.
 * @param {object} save
 * @param {{dues?: number, cleared?: number, day?: string, reason?: 'dues'|'vault'}} o
 */
const FREE_MINT_REASONS = new Set(['vault', 'night']);

export function mintBackcheck(save, o = {}) {
  const s = guardSave(save);
  const gm = gameOf(s);
  const day = str(o.day) ?? todayISO();
  if (gm.backchecks.mintedDay === day) return { minted: 0, held: int(gm.backchecks.held, 0), why: 'already-today' };
  /* The FREE reasons — a mint that is paid by an act, not by the day's review compliance. G5 pays a
     Backcheck for a cracked vault and for a completed Night Before; every other mint has to clear the
     day's dues. Widened from a bare `!== 'vault'` at integration (notes/J11.md §6 → J5c) so
     `plan.payCleanGetaway` can name what it actually did instead of passing `reason: 'vault'` for a
     Night Before. An UNNAMED reason still takes the dues path — the default is the strict one. */
  if (!FREE_MINT_REASONS.has(o.reason)) {
    const dues = Math.max(0, int(o.dues, 0));
    const cleared = Math.max(0, int(o.cleared, 0));
    if (dues < BACKCHECK.requiresDuesAtLeast) return { minted: 0, held: int(gm.backchecks.held, 0), why: 'no-dues' };
    if (BACKCHECK.requiresAllDuesCleared && cleared < dues) return { minted: 0, held: int(gm.backchecks.held, 0), why: 'dues-open' };
  }
  const held = Math.min(BACKCHECK.max, Math.max(0, int(gm.backchecks.held, 0)) + BACKCHECK.mintPerDay);
  const minted = held - Math.max(0, int(gm.backchecks.held, 0));
  gm.backchecks.held = held;
  /* NOTE: the day is stamped even at the cap. `job/index.js canMint` refuses BEFORE stamping and so
     does not burn the day, and `plan.payCleanGetaway`'s inline fallback does — `tests/job-week.test.mjs`
     pins this function to that fallback byte-for-byte, so the two cannot be reconciled from this file.
     See notes/state-fix.md "Requests" (plan.js). `mintForJob` below does not attempt a mint that
     cannot succeed, which is what the divergence would otherwise show up as. */
  gm.backchecks.mintedDay = day;
  return { minted, held, why: minted ? 'minted' : 'at-cap' };
}

/**
 * Does this job's SHAPE carry a real vault — a boss card `board.vaultFor` named on the board at the
 * start of the job (G3.7 #6)? `SHAPES.*.vault` is *"is the final target a boss"*, not *"is there a
 * getaway"*: the getaway beat runs on every shape (notes/J5c.md §5.3), which is why the LAST TARGET
 * of an ordinary JOB is still G1's vault for the Backcheck gate and the terminal word, while the
 * clean-**vault** mint — G2's scarce, free source — needs the boss the board actually named.
 */
const shapeHasVault = (g) => (SHAPES[g?.shape] ?? SHAPES.JOB).vault === true && str(g?.vault) != null;

/**
 * Is this queue item one of the day's DUES — a review or a rematch, the dull work G2 pays for?
 */
const isDueTarget = (it) => it?.isReview === true || it?.isRematch === true
  || it?.role === 'review' || it?.role === 'rematch';

/**
 * G2's two mints, taken at the one moment that knows both halves: the end of a job.
 *
 * **This is the call site that did not exist.** `mintBackcheck` and `index.mint` were both correct and
 * both unreachable — the only writer of `backchecks.held` in the whole app was `plan.payCleanGetaway`,
 * gated on a ONE-TIME Night Before stamp — so the game's only consumable had a lifetime supply of one.
 *
 *   · **vault** — a vault CRACKED (not knocked) with no Backcheck spent this job (`g.bc === 0`).
 *   · **dues**  — the day's dues are ≥ 1 and every one of them was cleared. Measured, not claimed:
 *     `cleared` is the distinct due cards this job answered OK, and `open` is `schedule.dueList` right
 *     now. A due still open ⇒ `cleared < dues` ⇒ no mint. Sweep pseudo-dues (D ≤ 2 flags every bucket
 *     ≤ 2 card as due whether or not it is overdue) are excluded, or the mint would be unreachable in
 *     the Final Sweep week — the one week it matters most.
 *
 * One mint per day whichever source, which is `job/index.js canMint`'s own rule.
 * @returns {{minted: number, held: number, why: string, source: 'vault'|'dues'|null}}
 */
function mintForJob(save, g, { day, now, cracked }) {
  const bc = save?.game?.backchecks ?? null;
  /* do not ATTEMPT a mint that cannot land: a refusal stamps the day (see `mintBackcheck`), which
     would make the dues attempt behind it report `already-today` instead of the real reason. */
  const room = Math.max(0, int(bc?.held, 0)) < BACKCHECK.max && str(bc?.mintedDay) !== day;
  /* THE FREE MINT NEEDS A REAL VAULT. `cracked` alone is "the last target of any job cleared" — G1's
     getaway beat runs on every shape (notes/J5c.md §5.3) — so a RUN and an ordinary JOB were both
     paying the clean-VAULT Backcheck, on a `reason: 'vault'` that skips the dues gate entirely.
     That made the game's only consumable a reward for finishing any evening cleanly, including a day
     with zero dues, and G2's whole thesis is the opposite sentence: *"the least fun, highest-value
     study action is the source of the game's only scarce resource"* (G3.7 #6 names what the vault is:
     "the most-overdue tier-3/4 original you have cleared — named on the board at the start of the
     job", i.e. `board.vaultFor`, drawn only when the SHAPE carries one). Measured before the fix:
     `shape=RUN SHAPES[shape].vault=false g.vault=null → minted source: 'vault'` (round 2,
     exploit-hunt). The dues path below is untouched and still carries the day on its own. */
  if (room && cracked === true && shapeHasVault(g) && Math.max(0, int(g.bc, 0)) === 0) {
    const r = mintBackcheck(save, { day, reason: 'vault' });
    if (r.minted > 0) return { ...r, source: 'vault' };
  }
  const raw = unguard(save);
  const open = dueList(raw, { now, today: day }).filter((d) => d.sweep !== true).length;
  const seen = new Set();
  for (const it of queueOf(save)) {
    if (!isObj(it) || !isDueTarget(it) || it.done !== true) continue;
    if (it.result?.cleared !== true) continue;
    seen.add(str(it.id) ?? `#${it.n}`);
  }
  const cleared = seen.size;
  const r = mintBackcheck(save, { day, dues: cleared + open, cleared, reason: 'dues' });
  return { ...r, source: r.minted > 0 ? 'dues' : null, open, cleared };
}

/* ==========================================================================================
   G1 — the brief window
   ========================================================================================== */

/* -------------------------------------------------- G1's FIFTH brief option: the priced contract swap */

/**
 * The bench: the targets of the contracts you DECLINED at the board, priced at their declined price.
 *
 * G1: "swap one undrafted contract in at its **declined price** (+0.15, see below)" and "Declines are
 * priced (incremental). The two contracts you refuse at the board return to the brief window at
 * **+0.15 posted** each. Drafting 3 of 5 is mandatory — no reroll, no skip — so a decline is a trade,
 * not a free spin." Without this the option did not exist and `board.declinePrice` was computed onto
 * every posted row with NO consumer anywhere in `site/js`.
 *
 * The board's bundles carry their target objects only as a non-enumerable property of `buildJob`'s
 * result, which `startJob` serialises away — so the bench is taken HERE, at the one moment the board
 * is still addressable, and persisted on `inProgress` (beside the queue, not inside the budgeted
 * `inProgress.game`). That is also what makes the swap survive a reload, which a cached board would
 * not: G3.7 proof 6 says re-opening must re-price identically, and a decision that disappears when
 * the tab is killed is not a decision.
 */
function benchFor(board, picks, queue) {
  const bundles = Array.isArray(board?.bundles) ? board.bundles : [];
  if (!bundles.length) return [];
  const drafted = new Set((Array.isArray(picks) ? picks : []).filter((x) => typeof x === 'string'));
  const have = new Set((Array.isArray(queue) ? queue : []).map((it) => it?.id).filter(Boolean));
  const out = [];
  for (const b of bundles) {
    if (!isObj(b) || drafted.has(b.id)) continue;
    for (const t of (Array.isArray(b.targets) ? b.targets : [])) {
      if (!isObj(t) || !isObj(t.item) || !t.id || have.has(t.id)) continue;
      have.add(t.id);                                            // the union dedupes across declines too
      out.push({
        ...t.item, n: 0, from: b.id, sources: [b.id], wing: t.wing ?? null,
        posted: Math.round(num(t.posted, 0) * (1 + DECLINE_PRICE)),      // the DECLINED price
        basePosted: num(t.posted, 0), x2: false, critical: t.critical === true, declined: b.id,
      });
    }
  }
  return out;
}

/**
 * The undrafted contracts a brief window may swap in, each with the price it comes back at.
 * `[{ id, label, wing, grade, minutes, posted, decline, targets }]` — empty once they are taken, and
 * empty for a board that posted no declines at all.
 */
export function swapOptions(save) {
  const g = stateOf(save);
  if (!g || g.outcome != null) return [];
  const drafted = new Set((Array.isArray(g.picks) ? g.picks : []));
  const bench = Array.isArray(save?.inProgress?.bench) ? save.inProgress.bench : [];
  const out = [];
  for (const b of (Array.isArray(g.bundles) ? g.bundles : [])) {
    if (!isObj(b) || drafted.has(b.id)) continue;
    const n = bench.filter((it) => it?.declined === b.id).length;
    if (!n) continue;
    out.push({
      id: b.id, label: str(b.label, ''), wing: str(b.wing), grade: int(b.grade, 1),
      minutes: num(b.minutes, 0), posted: num(b.posted, 0),
      decline: Math.round(num(b.posted, 0) * (1 + DECLINE_PRICE)), targets: n,
    });
  }
  return out;
}

/** May a brief window swap this contract in right now? */
export function canSwap(save, id) {
  return swapOptions(save).some((o) => o.id === str(id));
}

/**
 * Take the swap: the declined contract's targets join the REMAINING queue at their declined price,
 * in front of the vault (the last target stays the last target, G1 "The last target is the vault").
 * The job gets longer and pays more — that is the trade a decline buys back.
 */
function swapIn(save, id) {
  const g = stateOf(save);
  const cid = str(id);
  if (!g || !cid || !canSwap(save, cid)) return null;
  const ip = save.inProgress;
  const bench = Array.isArray(ip.bench) ? ip.bench : [];
  const have = new Set(queueOf(save).map((it) => it?.id).filter(Boolean));
  const add = bench.filter((it) => it?.declined === cid && !have.has(it.id));
  if (!add.length) return null;
  const q = ip.queue;
  const at = Math.min(q.length, Math.max(idxOf(save) + 1, q.length - 1));
  q.splice(at, 0, ...add.map((it) => ({ ...it })));
  q.forEach((it, i) => { it.n = i + 1; });                      // `requeueReview`'s own renumbering
  ip.bench = bench.filter((it) => it?.declined !== cid);
  g.picks = [...(Array.isArray(g.picks) ? g.picks : []), cid];
  const posted = add.reduce((t, it) => t + num(it.posted, 0), 0);
  g.posted = econ.round(num(g.posted, 0) + posted);
  return { id: cid, targets: add.length, posted: econ.round(posted), left: targetsLeft(save), of: q.length };
}

/**
 * A brief window (G1, 50 s at full use, **five** real options). Any subset, `Enter` to skip:
 * re-press one token with the guard redrawn · swap one undrafted contract in at its declined price ·
 * re-rank one crew slot · take or decline the next target's tell · declare a walk-away minute.
 *
 * The swap was the one G1 option the layer never shipped, which made `DECISIONS.briefOptionsMax = 5`
 * — and the "35 full use" the debrief prints — an overcount of 2. It is built here; `screens/job.js`
 * still owns the button (see notes/state-fix.md "Requests").
 * @param {object} save
 * @param {{repress?: object, swap?: {id: string}, crew?: {make, rank}, commit?: {kind, byMin},
 *          tell?: boolean}} [actions]
 */
export function brief(save, actions = {}, opts = {}) {
  const s = guardSave(save);
  const g = mustState(s);
  if (g.phase !== 'brief') throw new JobStateError('not-at-brief', g.phase);
  const now = num(opts.now, 0) || Date.now();
  const took = [];

  /* "re-press one token with the guard distribution redrawn" — `press()` does BOTH halves now,
     redrawing from the SAME published distribution and the PINNED seed, indexed by which window
     this is, so a reload cannot re-roll it. Round 3: the `else if` is the half that was missing.
     The screen's +/− handler calls `press()` straight through (`screens/job.js bump`), so a window
     can have taken the re-press without this call ever seeing a `repress` action — and it was that
     path, ending in `Skip`, that got the option for free. It is one decision either way and the
     debrief's count says so. */
  if (isObj(actions.repress)) {
    press(s, actions.repress, opts);
    took.push('repress');
  } else if (repressed(g)) {
    took.push('repress');
  }
  let swapped = null;
  if (isObj(actions.swap) && str(actions.swap.id)) {
    swapped = swapIn(s, actions.swap.id);
    if (swapped) took.push('swap');
  }
  if (isObj(actions.crew) && str(actions.crew.make)) {
    /* `allocate` is pure and returns a NEW save; it is handed the RAW object so the copy it builds
       is not a half-proxied one. Only its `crew` map is kept. */
    const res = crew.allocate(unguard(s), actions.crew.make, actions.crew.rank);
    if (res && res.ok === true) { gameOf(s).crew = { ...res.crew }; took.push('crew'); }
  }
  if (isObj(actions.commit)) { commitBind(s, actions.commit, opts); took.push('commit'); }
  /* G1's fourth option, IMPLEMENTED (verify round 4, exploit-hunt). This used to be the whole of it:
     `took.push(actions.tell ? 'tell' : 'no-tell')` — a string, and nothing else. Forked three ways on
     40 windows, `brief({tell:true})`, `brief({tell:false})` and `brief({})` left the next envelope
     identical in `{posted, tell, make}` on 40/40 and the entire `inProgress.game` record byte-
     identical with `took` stripped, so "Decline the tell" spent the window and bought nothing while
     `econ.tellFor` went on paying ×1.25 on the refused tag.
     Now: `tell: false` sets `g.tellOff`, which `pricedTarget` reads (no tag on the envelope, ×1.00 on
     the payout) and `applyTarget` spends (no RESOLVE, so the fault stays live and keeps paying on the
     rest of this make). `tell: true` is the affirmative and CLEARS a refusal staged earlier in the
     same window, so the last button pressed is the one that stands. */
  if (actions.tell === true || actions.tell === false) {
    g.tellOff = actions.tell === false;
    took.push(actions.tell ? 'tell' : 'no-tell');
  }

  g.briefs.push({ at: now, took });
  setPhase(g, targetsLeft(s) === 1 ? 'getaway' : 'envelope', now);
  return { took, briefs: g.briefs.length, phase: g.phase, swap: swapped };
}

/* ==========================================================================================
   G3.9 — COMMIT: a declaration that BINDS
   ========================================================================================== */

/**
 * COMMIT — `WALK AT 12:00` or `DONE BY 21:45`. A declaration BINDS: at the declared minute the job
 * auto-bags at FULL value and ends, you take +8 % on BAGGED, and you forfeit the completion bonus if
 * targets remain (G3.9, G12 #25). A declaration that is never reached simply never fires.
 * @param {object} save
 * @param {{kind: 'walk'|'doneBy', byMin: number}} decl
 */
export function commitBind(save, decl = {}, opts = {}) {
  const s = guardSave(save);
  const g = mustState(s);
  const kind = decl.kind === 'doneBy' ? 'doneBy' : decl.kind === 'walk' ? 'walk' : null;
  if (!kind) throw new JobStateError('bad-commit');
  const byMin = num(decl.byMin, NaN);
  if (!Number.isFinite(byMin) || byMin <= 0) throw new JobStateError('bad-commit-minute');
  const gm = gameOf(s);
  gm.commit = { kind, byMin, honored: Math.max(0, int(gm.commit?.honored, 0)), bound: true };
  return { ...gm.commit, job: g.seed };
}

/**
 * Has a bound declaration come due? `walk` counts minutes from the job's start; `doneBy` is a
 * minute-of-day. Pure — the caller supplies the clock.
 */
export function commitDue(save, now = Date.now()) {
  const g = stateOf(save);
  const c = save?.game?.commit;
  if (!g || g.outcome != null || !isObj(c) || c.bound !== true) return false;
  const byMin = num(c.byMin, NaN);
  if (!Number.isFinite(byMin)) return false;
  if (c.kind === 'walk') {
    const started = num(save?.inProgress?.startedAt, 0) || num(g.guard?.drawnAt, 0);
    return started > 0 && (num(now, 0) - started) >= byMin * 60000;
  }
  const d = new Date(num(now, 0));
  return (d.getHours() * 60 + d.getMinutes()) >= byMin;
}

/** Fire the bound declaration: bank in full, +8 %, completion forfeited, the rest to Today's Page. */
export function commitFire(save, opts = {}) {
  const s = guardSave(save);
  mustState(s);
  const gm = gameOf(s);
  gm.commit = { ...gm.commit, honored: Math.max(0, int(gm.commit?.honored, 0)) + 1, bound: false };
  return endJob(s, OUTCOMES.COMMIT, opts);
}

/* ==========================================================================================
   G1 — the getaway, CALL IT, WALK, and the 22:00 close
   ========================================================================================== */

/** The getaway's numbers: what a WALK banks now, and what the vault is worth if you CRACK it. */
export function getawayOf(save, opts = {}) {
  const g = stateOf(save);
  if (!g) throw new JobStateError('no-job');
  const t = targetsLeft(save) ? pricedTarget(save, opts) : null;
  return {
    loose: Math.max(0, num(g.loose, 0)),
    bagged: Math.max(0, num(g.bagged, 0)),
    chain: Math.max(0, int(g.chain, 0)),
    walkBanks: econ.getawayBank(g.loose),
    vault: str(g.vault),
    target: t,
    posted: t ? t.posted : 0,
    left: targetsLeft(save),
  };
}

/** CRACK — all-in on the vault: the pile rides into the last target. */
export function crack(save, opts = {}) {
  const s = guardSave(save);
  const g = mustState(s);
  if (g.phase !== 'getaway') throw new JobStateError('not-at-getaway', g.phase);
  if (targetsLeft(s) === 0) throw new JobStateError('no-target');
  setPhase(g, 'envelope', num(opts.now, 0) || Date.now());
  return { loose: g.loose, bagged: g.bagged, chain: g.chain, phase: g.phase };
}

/**
 * WALK.
 *   · **at the getaway** — leave with the bag: LOOSE banks at FULL value (bagging at the getaway is
 *     free, G2) and the job ends. The last target stays due and leads the next board.
 *   · **mid-job** — the quit prompt. `bagFirst: true` bags at the ordinary 10 % fee; anything else
 *     auto-banks at 50 % (G1 "On any exit that is not a bag, LOOSE auto-banks at 50 %"), so quitting
 *     is never better than banking and never catastrophic.
 * @param {object} save
 * @param {{bagFirst?: boolean, now?: number}} [opts]
 */
export function walk(save, opts = {}) {
  const s = guardSave(save);
  const g = mustState(s);
  if (g.phase === 'getaway') return endJob(s, OUTCOMES.WALKED, opts);
  return endJob(s, OUTCOMES.QUIT, opts);
}

/** The quit prompt's numbers: `Bag 63 first? [Bag & leave] [Leave]` (G1), lossless option first. */
export function walkPrompt(save) {
  const g = stateOf(save);
  if (!g) throw new JobStateError('no-job');
  const loose = Math.max(0, num(g.loose, 0));
  return {
    loose: econ.round(loose),
    bagAndLeave: econ.bagBank(loose),          // the 10 % fee
    leave: econ.autoBank(loose, 'walk'),        // the 50 % auto-bag
    bagged: econ.round(num(g.bagged, 0)),
  };
}

/** CALL IT is legal at LOOSE 0 ∧ chain 0 ∧ ≥ 3 targets left, and nowhere else (G1, G10 #7). */
export function canCallIt(save) {
  const g = stateOf(save);
  if (!g || g.outcome != null || g.stakes === false) return false;
  if (g.phase === 'debrief' || g.phase === 'board') return false;
  if (Math.max(0, num(g.loose, 0)) !== 0) return false;
  if (Math.max(0, int(g.chain, 0)) !== 0) return false;
  return targetsLeft(save) >= num(STATES.CALL_IT.minTargetsLeft, 3);
}

/**
 * CALL IT — one tap ends the stakes, the job is recorded **walked at the posted value of the part
 * that was played**, and the remaining targets continue as a no-stakes calm page **with hints on**.
 * *The game stops; the studying does not.* (G1 "Failure states", G10 #7.)
 *
 * **Round 4: the mercy button erased the job instead of recording it.** It wrote `posted 0`, and a
 * posted-0 row is invisible to both of the systems that adapt to a student who is struggling:
 * `guard.flowControl`'s `under(r)` requires `posted > 0`, so the row could not be a bad job and it
 * RESET the two-job streak — `[bad, CALL IT, bad]` fired nothing where `[bad, bad]` fires
 * `deltaPlayer −40` and the FOOTHOLD board (3 tier-1 dues at guard ×0.5). The student who took the
 * button the design offers them was the one student denied the help the design owes them.
 *
 * `postedAnswered` is the fix and it is exact, not an estimate: the same `it.posted` values, from the
 * same queue, that `startJob` summed to build `g.posted` in the first place — restricted to the
 * targets the student actually answered. So a job bagged at target 5 and then called records
 * `bagged ≈ posted` and is NOT a bad job (that student was not struggling), while a job that missed
 * its way to target 5 records `bagged < 0.5 · posted` and is (they were).
 *
 * What it deliberately does NOT change: `CALLED` stays out of `GETAWAY_OUTCOMES`, so a called job
 * still rates no Elo. It is a mid-job abandonment, the same shape as `QUIT`, and `eloOutcome` scores
 * a WIN at `bagged >= posted` — rating the prefix would hand the mercy button an Elo win for bagging
 * and calling, which is worse than the hole it closes. The flow-control half is the half that reads
 * the struggle, and it is the half that is fixed.
 */
export function callIt(save, opts = {}) {
  const s = guardSave(save);
  const g = mustState(s);
  if (!canCallIt(s)) throw new JobStateError('call-it-illegal');
  const now = num(opts.now, 0) || Date.now();
  g.stakes = false;
  g.locked = null;
  g.tellOff = false;
  /* the answered prefix, not the whole queue and not `STATES.CALL_IT.postedRecorded` (0) */
  g.posted = postedAnswered(s);
  setPhase(g, 'envelope', now);
  return { stakes: false, hints: hintsOn(), left: targetsLeft(s), posted: g.posted, phase: g.phase };
}

/**
 * The 22:00 close (G5 / G11's `BOARD_CLOSED`): a job in progress auto-bags at the next target
 * boundary **at full value**, and continued play runs with stakes and calls off.
 *
 * The TRIGGER is `advance()` — the next target boundary — not a screen poll. J11 owned the trigger on
 * paper and never wrote it, so every line of this close was unreachable; a transition whose only
 * caller is a screen that may forget it is a transition that does not exist.
 * @param {{end?: boolean, now?: number}} [opts]  `end: false` keeps the page going with stakes off
 */
export function quietClose(save, opts = {}) {
  const s = guardSave(save);
  const g = mustState(s);
  const now = num(opts.now, 0) || Date.now();
  g.bagged = econ.round(num(g.bagged, 0) + econ.autoBank(g.loose, 'quiet22'));
  g.loose = 0;
  g.chain = econ.chainAfterBag();
  g.stakes = false;
  g.quiet = true;                       // so the terminal word is QUIET22 and not CALLED (EXTRA_KEYS)
  g.posted = 0;
  if (opts.end === false && targetsLeft(s) > 0) { setPhase(g, 'envelope', now); return { banked: g.bagged, stakes: false, quiet: true, phase: g.phase }; }
  return endJob(s, OUTCOMES.QUIET22, { ...opts, now, preBanked: true });
}

/* ==========================================================================================
   G1 — the debrief, and the end of the job
   ========================================================================================== */

/** What the exit banks, per outcome. Every one of them ADDS to BAGGED; none of them takes from it. */
function bankOnExit(g, outcome, opts) {
  const loose = Math.max(0, num(g.loose, 0));
  if (opts.preBanked === true || loose === 0) return 0;
  switch (outcome) {
    case OUTCOMES.COMPLETED:
    case OUTCOMES.CRACKED:
    case OUTCOMES.KNOCKED:            // a crack that missed still LEFT through the getaway (G1 "nothing lost")
    case OUTCOMES.WALKED:
      return econ.getawayBank(loose);                                    // the getaway banks free
    case OUTCOMES.QUIT:
      return opts.bagFirst === true ? econ.bagBank(loose) : econ.autoBank(loose, 'walk');
    case OUTCOMES.COMMIT:
      return econ.autoBank(loose, 'commit');                             // a bound declaration banks in full
    case OUTCOMES.QUIET22:
      return econ.autoBank(loose, 'quiet22');
    default:
      return econ.autoBank(loose, 'walk');                               // CALL IT: LOOSE is 0 by its own gate
  }
}

/**
 * End the job and write the debrief. This is where — and the ONLY where — the job touches
 * `save.player` and `save.game` beyond the live record: the rating, the rank, the Elo pair, the heat
 * window, the records, the ledger and the ≤ 30-entry log.
 *
 * Targets left ⇒ `inProgress.game` is deleted and `inProgress` stays a PLAIN PAGE, so the rest of
 * Today's Page is one tap away and no item has been removed from the schedule (COMPOSED global
 * rule 5, G7 "Bag a job at 7 of 12 items and Home says `5 left on Today's Page`").
 * Every target answered ⇒ the existing `finishPage` closes the page, exactly as `run.js` does.
 *
 * @param {object} save
 * @param {string} outcome  one of `OUTCOMES`
 * @param {{now?, bagFirst?, preBanked?, day?}} [opts]
 * @returns {object} the debrief
 */
export function endJob(save, outcome, opts = {}) {
  const s = guardSave(save);
  const g = stateOf(s);
  if (!g) throw new JobStateError('no-job');
  if (g.outcome != null) throw new JobStateError('job-over', g.outcome);
  const now = num(opts.now, 0) || Date.now();
  const day = str(opts.day) ?? todayISO(new Date(now));
  const word = Object.values(OUTCOMES).includes(outcome) ? outcome : OUTCOMES.QUIT;

  /* bank whatever is loose, then the two bonuses */
  const banked = bankOnExit(g, word, opts);
  g.bagged = econ.round(num(g.bagged, 0) + banked);
  g.loose = 0;
  g.chain = econ.chainAfterBag();

  const complete = targetsLeft(s) === 0;
  const honoured = word === OUTCOMES.COMMIT;
  /* === econ lane, verify round 3 (one-line change in a file this lane does not own; BUILD-POLICY
     §2, recorded in notes/repair-econ.md). The rule itself — including the getaway-walk PARITY
     clause that kills the CRACK@50-then-miss arbitrage — now lives in `econ.exitBonusRate`, with
     the measurement in its docblock and `PUBLISHED.getawayParity`. `COMPLETION`/`COMMIT_BONUS` stay
     imported here because the debrief still prints them. === */
  const bonusRate = econ.exitBonusRate({
    honoured, complete, stakes: g.stakes !== false, getawayWalk: word === OUTCOMES.WALKED,
  });
  const baseBagged = g.bagged;
  const finalBagged = econ.round(baseBagged * (1 + bonusRate));
  g.bagged = finalBagged;

  /* CRACKED is the WORD, and the word is now chosen from the last target's own result (`advance`), so
     a missed vault lands on KNOCKED and this stays false for it — which is the whole of
     `records.cracked`, the debrief's `cracked` and Stats' "Vaults cracked".
     The COMPLETION bonus is NOT gated on it: G1 line 259 is "completion = +10 % on BAGGED **if every
     drafted target was answered**", and a knocked vault answered every one of them. What G1's Knocked
     forfeits is the stamp, not the completion. Verify round 3 added the other half of that sentence
     rather than taking this one back: a WALK at the getaway — whose ONE unanswered target is the
     vault, and which banks the same pile at the same full rate — is paid the same bonus, because the
     difference between the two exits was a free option (`econ.exitBonusRate`). */
  const cracked = word === OUTCOMES.CRACKED && complete && g.stakes !== false;
  /* `g.posted` IS the recorded value, for every word (verify round 4). The old `g.stakes === false ?
     0 :` in front of it was a SECOND zeroing on top of the two transitions that already zero the
     field themselves, and it is what made `callIt`'s repair unreachable: the two stakes-off paths are
     `callIt`, which now writes the answered prefix's posted, and `quietClose`, which writes 0 on its
     own line (the 22:00 close banks the job in full and is not a result). Reading the field the
     transitions wrote is what lets them differ — and they SHOULD differ: one is a student calling it,
     the other is a clock. */
  const postedRecorded = Math.max(0, num(g.posted, 0));
  /* A declaration is scoped to THE JOB IT WAS MADE ON — `commitBind` even stamps `job: g.seed` on its
     own return value. `commitFire` cleared `bound`, and nothing else did, so a declaration that was
     never reached ("a declaration that is never reached simply never fires", G3.9) stayed bound for
     the life of the save: `committed` read true on every LATER job's debrief, which added a COMMIT
     decision that job never had to its decision count, forever, off one tap (round 2, exploit-hunt:
     jobs 2, 3 and 4 all reported `committed=true decisions=25` for 10 calls). Read here, cleared
     below, for every outcome. */
  const committed = word === OUTCOMES.COMMIT || save?.game?.commit?.bound === true;

  setPhase(g, TERMINAL_PHASE, now);
  g.outcome = word;
  g.locked = null;

  /* ---- Ledger B: the durable half ------------------------------------------------------- */
  const p = playerOf(s);
  const gm = gameOf(s);
  /* the declaration dies with the job it was made on — see `committed` above (`honored` is kept: it
     is the lifetime count of declarations that actually fired, and `commitFire` has already added
     this one when the word is COMMIT) */
  if (isObj(gm.commit)) gm.commit = { ...gm.commit, bound: false };
  /* NOT `p.rating.value`: that is already the AFTER value by the time this runs (notes/J6b.md R2).
     `startJob` snapshotted the real one into `g.rating0`, and it survives a reload. */
  const ratingBefore = num(g.rating0, num(p.rating.value, RATING_DEFAULT));
  /* the rank is a ratchet — see `applyTarget`'s note on the same call (S3) */
  const detail = call.ratingDetail(p.rating.calls, CAPS.calls, { rank: p.rank });
  p.rating.value = detail.value;
  p.rating.n = detail.n;
  p.rank = detail.rank;

  const rec = p.records;
  rec.bestBag = Math.max(num(rec.bestBag, 0), finalBagged);        // bestChain is kept per target, in applyTarget
  rec.bestRating20 = Math.max(num(rec.bestRating20, 0), call.ratingFrom(p.rating.calls.slice(-20), 20));
  // the ratchet's audit record (S3.1(c)) — `detail.earned`, the number that BOUGHT the rank, not
  // `detail.value`, which is what the dice paid; see `applyTarget`'s note on the same line
  rec.bestRating = Math.max(num(rec.bestRating, 0), detail.earned);
  if (cracked) rec.cracked = num(rec.cracked, 0) + 1;
  if (word === OUTCOMES.WALKED || word === OUTCOMES.QUIT || word === OUTCOMES.CALLED) rec.walked = num(rec.walked, 0) + 1;
  if (complete && g.stakes !== false && g.calls.length > 0 && g.calls.every((c) => c.ok)) rec.cleanJobs = num(rec.cleanJobs, 0) + 1;

  /* THE LOG (G7, ≤ 30) — AND THE TWO FIELDS THAT STOP IT DESCRIBING TWO DIFFERENT JOBS.
     `targets` is the ANSWERED count and `posted` is the WHOLE drafted queue's value, so a job walked
     at target 3 of 10 logged `{targets: 3, posted: 200}` against an answered prefix worth 33 — the
     entry priced 6.06× what happened, and on a 1-of-10 walk 26×. `posted` still means exactly what it
     meant (`eloOutcome`, `pushHeat` and the debrief headline all read `postedRecorded` and all want
     the full-queue value, and notes/repair-board.md Requests 1 asks in terms for a field to be ADDED
     rather than for this one to be redefined), and the two ADDED fields make the row self-describing:

       · `queueTargets` — the drafted queue's own length. `board.js queuedTargetsOf` prefers it and
         retires its stand-in the moment it appears; that stand-in is `min(the shape's published row,
         tonight's drafted length)`, measured wrong by up to 3 of 12 on a JOB12.
       · `calls` — how many calls the student locked. notes/repair-board.md Requests 1: with it a
         walked job's decision expectation is exact instead of a one-cycle interval, and the board's
         projection can stop abstaining. `debriefOf` reads `g.calls.length` on the next line, so
         nothing new is computed here.

     What is deliberately NOT added is `postedAnswered`. The board lane MEASURED it (notes/repair-
     board.md "REFUTED"): `fix/t7plus.mjs base half → 25 failures of 600 cells`, `posted half → 51`.
     A posted value carries the day's realised ×2 marks, which cost no answer seconds, so on a short
     prefix it is a factor of two on the denominator — the exact field makes the projection twice as
     wrong as the estimate it replaces. `postedAnswered(save)` is exported for the callers that want
     the quantity (it is what `callIt` records), and it stays off the row.

     `calls: g.calls.length` is the other field notes/repair-board.md Requests 1 asks for, and it is
     the one thing on that list that did NOT fit. The row is byte-locked, and not by a constant this
     lane may restate: `tests/job-save.test.mjs` closes on `T01_STUDY_BOUND + SAVE_BUDGET_KB
     .totalAdded x 1024 < S6_BUDGET` — `500 000 + 39.7 x 1024 = 540 652.8` against COMPOSED.md S6's
     `528 x 1024 = 540 672`, i.e. **19 chars**, which pins `totalAdded` at its current 39.7 and caps
     the WHOLE game layer's growth at `39.7 x 1024 - 40 332 = 320 B`. Measured, `calls` is 11 B a row
     and **330 B over the thirty-row log**: ten bytes short. It lands the day COMPOSED.md S6 or T01's
     study bound moves, and notes/repair-state.md Requests 1 carries the arithmetic.

     (The finding prices the pair at "+29 B a row, +290 B over the window". +29 B a row is right;
     +290 B is the wrong array — that is notes/repair-guard.md's price for the TEN-row
     `game.heat.window`, and over this THIRTY-row log the pair is +870 B against 320 B of headroom.)

     `queueTargets` fits because the row PAID for it — see `rating` below. */
  const entry = {
    day, shape: g.shape, targets: answered(s), queueTargets: queueOf(s).length,
    bagged: finalBagged, posted: postedRecorded,
    /* ROUNDED, and that is what buys `queueTargets` its 18 B a row (verify round 4). This field is
       the HISTORY of a number every surface prints at two decimals (`stats.js n2`, the debrief's own
       line); storing `detail.value` raw put up to 24 characters of a 0-10 score on the disk, thirty
       times over, of which no reader has ever used more than two. Four decimals is two orders of
       magnitude more precision than anything displays, and its widest JSON form is 6 characters, so
       the row is byte-neutral: 18 B saved here, 18 B spent on `queueTargets`.
       `player.rating.value` — the LIVE rating, which `call.ratingDetail` clamps rather than rounds
       and which every later window is computed from — is deliberately NOT rounded. This is the
       log's copy, and only the log's. */
    rating: econ.round(detail.value, 4),
    guard: postedRecorded > 0 ? (str(g.guard?.wing) ?? null) : null,
    cracked, tGame: Math.round(num(g.tGame, 0)), tAnswer: Math.round(num(g.tAnswer, 0)),
  };
  gm.log = [...gm.log, entry].slice(-CAPS.log);

  /* Elo — only a job that reached the getaway is a result (G3.7 proof 6: quitting must not pay) */
  const ratesElo = GETAWAY_OUTCOMES.has(word) && postedRecorded > 0;
  let eloAfter = { player: num(p.elo?.player, 1000), house: num(p.elo?.house, 1000) };
  if (ratesElo) {
    const o = guard.eloOutcome({ bagged: finalBagged, posted: postedRecorded });
    const moved = guard.elo(eloAfter.player, eloAfter.house, o);
    eloAfter = { player: moved.player, house: moved.house };
  }
  const flow = guard.applyFlowControl(eloAfter, gm.log);            // moves R_player only (G12 #8)
  p.elo = { player: flow.player, house: flow.house };

  /* THE GUARD'S OWN INPUT — the stake-weighted press window (G3.4, notes/J3.md Requests).
     `{targets, shape}` are deliberately still NOT handed over, and this is the second half of
     finding 4, MEASURED AND REFUSED HERE rather than left unexamined (notes/repair-state.md §4).
     Passing them was implemented and measured: it puts every row in `withLogEvidence`'s tier 1, and
     it costs (i) +290 B on `game.heat.window`, (ii) `guard.workedPosted`'s PRO-RATING, which turns
     `heat.weight` and `heat.press[*]` from `econ.round`ed integers into 18-character doubles — a
     leaf `tests/_helpers.mjs` prices at 7 — and (iii) with the two log fields, `game` at 15.97 KB
     against `SAVE_BUDGET_KB.game = 14.9`. The guard lane priced exactly this trade in its own
     docblock and deferred it ("closing this needs `SAVE_BUDGET_KB` in `site/data/job.js` and G7's
     save-schema table moved together with the fixture, which is the save lane's call and not this
     file's"), and it changes x̂ numerics the guard lane pins. It is a THREE-LANE change, not a
     one-line one; notes/repair-state.md Requests 1 carries the measurement to the two owners. */
  gm.heat = guard.pushHeat(gm.heat, { press: g.tokens, posted: postedRecorded });

  /* the measured ledger (G1 statement 1: the board's projection reads THIS) */
  const L = gm.ledger;
  const jobs = Math.max(0, int(L.jobs, 0)) + 1;
  const means = { ...PHASE_MEANS_DEFAULT, ...(isObj(L.phaseMeans) ? L.phaseMeans : null) };
  for (const ph of MEAN_PHASES) {
    if (ph === DEFERRED_MEAN_PHASE) continue;                 // folded by `closeDebrief`, not here — see below
    const secs = num(g.ph?.[ph], 0) / 1000;
    const perWindow = ph === 'brief' ? Math.max(1, g.briefs.length) : 1;
    means[ph] = foldMean(means[ph], secs / perWindow, ph, jobs);
  }
  gm.ledger = {
    ...L,
    jobs, tGame: num(L.tGame, 0) + num(g.tGame, 0), tAnswer: num(L.tAnswer, 0) + num(g.tAnswer, 0),
    phaseMeans: means,
    /* THE DEBRIEF IS NOW MEASURABLE (G1 statement 2, "both numbers are measured, not claimed").
       `setPhase(g, 'debrief', now)` two lines above starts the debrief; `g.ph.debrief` is therefore 0
       at this instant BY CONSTRUCTION, and the fold above could never move it off the shipped 65 s —
       14–21 % of every projected game-second was an unmeasurable constant. The read cannot be folded
       by the job that opened it, so it is folded by whatever comes next: this stamp is the debrief's
       start, and `closeDebrief()` banks it (the screen on unmount, or `startJob` as the backstop). */
    debriefAt: now,
  };

  /* ---- G2's mint: the dullest study action, wired to an actual call site -----------------------
     `mintBackcheck` had ZERO call sites in `site/js`, so "1 per day", "1 per vault cracked", "max 3
     held" and "renewable" were all false: the only consumable in the game had no reachable source and
     a save could hold at most the one Night-Before stamp, once, in its lifetime. Both of G2's sources
     are taken here, in the one function every job ends through. */
  const minted = mintForJob(s, g, { day, now, cracked });

  const out = debriefOf(s, {
    outcome: word, banked, bonusRate, baseBagged, finalBagged, complete, cracked,
    posted: postedRecorded, ratingBefore, ratingAfter: detail.value, rank: detail.rank,
    elo: p.elo, flow: flow.flow, entry, committed, ratesElo, minted,
  });

  /* ---- the schedule: close the page, or hand the rest back to Today's Page ---------------- */
  if (complete) finishPage(s);
  else delete s.inProgress.game;
  return out;
}

/**
 * The debrief object — G1's honest numbers, all of them derived: the two accumulators, the split,
 * the decision count, and the bag drop.
 */
export function debriefOf(save, over = {}) {
  const g = stateOf(save) ?? freshState();
  const tGame = Math.round(num(g.tGame, 0));
  const tAnswer = Math.round(num(g.tAnswer, 0));
  const wall = tGame + tAnswer;
  const shape = SHAPES[g.shape] ?? SHAPES.JOB;
  const calls = g.calls.length;
  const bagpush = Math.max(0, calls - 1);
  const decisions = 1 /* DRAFT */ + 1 /* PRESS */ + calls + bagpush + g.briefs.length
    + (over.outcome != null ? 1 : 0) /* getaway */
    + (over.committed === true ? 1 : 0) /* COMMIT */
    + Math.max(0, int(g.bc, 0));       /* Backcheck spends */
  return Object.freeze({
    shape: g.shape, targets: answered(save), of: queueOf(save).length,
    loose: 0, bagged: num(g.bagged, 0), chain: 0,
    posted: num(g.posted, 0), calls: g.calls.slice(), briefs: g.briefs.slice(),
    tGame, tAnswer, wall,
    split: wall > 0 ? tGame / wall : 0,
    decisions, perItem: calls > 0 ? decisions / calls : 0,
    backchecks: Math.max(0, int(g.bc, 0)),
    briefsOf: shape.briefs,
    left: targetsLeft(save),
    ...over,
  });
}

/* ==========================================================================================
   Re-exports a screen needs so it never reaches past this file for a number
   ========================================================================================== */

export { econ, call, crew, guard };
export { IN_PROGRESS_KEYS, OUTCOMES as JOB_OUTCOMES };
export default startJob;
