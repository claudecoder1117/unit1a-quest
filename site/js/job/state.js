/**
 * state.js — THE GAME: the session state machine (designs/CUT-BRIEF.md, designs/CUT-SPEC.md).
 *
 *     face-down card → call → flip → answer → (bank)
 *
 * Two decisions and nothing else: you bid on yourself before you see the question, and the pile you
 * have won is not yours until you bank it. `screens/job.js` is a thin renderer over this file.
 *
 * DOM-FREE (BUILD-POLICY §2): no `document`, no `window`, no import from `screens/`. It takes a
 * `save` object and mutates it; `store.update()` is the screen's business.
 *
 * ------------------------------------------------------------------------------------------------
 * THE LAWS THIS FILE ENFORCES STRUCTURALLY
 *
 *  1. **The Law of Two Ledgers.** Every exported mutator runs against `guardSave(save)`, a Proxy that
 *     THROWS `LedgerError` on any write that would reach `xp`, `skills`, `cards[*]`, `errors`,
 *     `forecastLog`, `streak` or `jumps` — at any depth. Ledger A is written by the EXISTING grade
 *     path in `screens/card.js`, at grade time, and this module does not duplicate one line of it: it
 *     receives card.js's own `result` object and prices it. `tests/job-ledger.test.mjs` proves the
 *     two routes leave byte-identical study state.
 *  2. **Answers tick; time does not.** `tGame` / `tAnswer` / `tAway` are a measurement, fed by the
 *     screen and read by nothing that prices anything. No payoff term reads a clock (CUT-BRIEF math
 *     #7). They are also a PARTITION of the wall clock since `inProgress.startedAt` — every
 *     millisecond of it lands in exactly one of the three — so `splitOf` is a share of the session
 *     and not a ratio of two chosen intervals, and no question can put more than one deliberation
 *     into the game half: an interval the screen never declares falls to `tAnswer`, and the part of
 *     a declared one past `DELIBERATION_MS` falls there too. `tAway` is the third: a span the APP
 *     DECLARED IT WAS NOT IN USE, which is in neither half of the printed share because it is not
 *     session the student played. See "The split meter".
 *  3. **The pile floors at zero.** A wrong answer takes `min(pile, cost)` and nothing else. There is
 *     no state in which the game takes something already banked (CUT-BRIEF math #8).
 *  4. **The seal.** `g.call` is written before the question is shown and cleared when it is answered,
 *     and `job/call.js qHatDetail` cuts the printed hit rate at `g.call.at` — so a call is never
 *     weighed by its own outcome.
 *  5. **The study layer chooses the questions.** The queue is `page.startPage`'s, unchanged: the game
 *     never adds, removes or reorders a question, and every unanswered question stays due.
 *  6. **Items are marked through the study layer's own functions** (`markItem` / `requeueReview` /
 *     `finishPage`). The game never invents a second path to the schedule.
 *
 * DEMOLITION (notes/DEMOLISH.md): 2,216 lines → this. The board, the draft, the guard, the tokens,
 * the press, the crew, the chain, the Fault Index, the tells, the Backchecks, the brief windows, the
 * getaway, CALL IT, COMMIT, the vault, the rating window, the rank ratchet, the Elo pair, the job log
 * and the debrief went with the mechanics they served (CUT-BRIEF "What is DELETED").
 */

import { SAVE_DEFAULTS, IN_PROGRESS_KEYS } from '../../data/job.js';
import { todayISO } from '../days.js';
import { markItem, requeueReview, finishPage, resumePage, startPage } from '../page.js';
import * as econ from './pay.js';

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
 * `counters` is neither Ledger A nor Ledger B: it is a NARROW proxy (`narrowCounters`) that admits
 * `pages` and refuses every other key at any depth.
 */
export const SHARED_KEYS = Object.freeze(['inProgress', 'counters']);

/** The only key of `save.counters` the study layer writes on this route (`page.js finishPage`). */
export const COUNTERS_WRITABLE = Object.freeze(['pages']);

/** Thrown when a write from this module would have reached Ledger A. */
export class LedgerError extends Error {
  constructor(path) {
    super(`ledger A is not writable from js/job/*: ${path}`);
    this.name = 'LedgerError';
    this.path = path;
  }
}

/** Thrown when a transition is not legal from the current state. Every one has a `can*` predicate. */
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

/** `save.counters`, wrapped so that only `COUNTERS_WRITABLE` may be written — see `SHARED_KEYS`. */
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
    /* nothing on this route DELETES a counter — `finishPage` only ever increments */
    deleteProperty(t, k) { throw new LedgerError(`counters.${String(k)}`); },
    setPrototypeOf() { throw new LedgerError('counters'); },
  });
  NARROW_CACHE.set(value, p);
  return p;
}

/**
 * The save, wrapped so that Ledger A is READ-ONLY at any depth. Every exported mutator in this file
 * runs against this; a write to `xp`, `skills`, `cards[*]`, `errors`, `forecastLog`, `streak` or
 * `jumps` throws `LedgerError` instead of landing, and `counters` admits only `pages`.
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
  /* `finishPage` creates `counters` when a save has none, and that is the ONLY assignment to the key
     itself on this route. It is admitted in exactly that shape — a fresh empty object over a key that
     is not an object — so `s.counters = { clears: 999 }` is still refused. */
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
   The record — `inProgress.game`, and its serialiser
   ========================================================================================== */

/** Every key of `inProgress.game`, in serialisation order. */
export const STATE_KEYS = IN_PROGRESS_KEYS;

/** A blank session record. */
export function freshState(over = {}) {
  const base = {
    pile: 0,
    streak: 1,
    call: null,
    answered: 0,
    tGame: 0,
    tAnswer: 0,
    tAway: 0,
    away: 0,
    seed: '',
  };
  return { ...base, ...(isObj(over) ? over : null) };
}

/**
 * `inProgress.game` → a plain, JSON-safe, key-ordered record. Byte-identical for the same state, so a
 * reload round-trip can be asserted with `deepStrictEqual` and `JSON.stringify` alike.
 */
export function serialize(game) {
  const g = isObj(game) ? game : {};
  const out = {};
  for (const k of STATE_KEYS) {
    switch (k) {
      case 'pile': out.pile = Math.max(0, int(g.pile, 0)); break;
      case 'streak': out.streak = clamp(int(g.streak, 1), 1, econ.MULT_MAX); break;
      /* `id: null` is the REPEAT's bidless seal (`sealRepeat`) and it survives the round trip: drop
         it and a question the game has already priced once comes back biddable after a reload. Any
         other id that is not one of the three calls is junk and is dropped, as it always was. */
      case 'call': out.call = isObj(g.call) && Number.isFinite(+g.call.at)
        && (g.call.id === null || econ.PAYS[g.call.id] != null)
        ? { id: g.call.id === null ? null : g.call.id, at: num(g.call.at, 0) } : null; break;
      case 'answered': out.answered = Math.max(0, int(g.answered, 0)); break;
      /* ONE BIT, and it round-trips as one: the absence's length is derived from the meter, never
         read off the disk, so nothing a corrupt save can hold here is worth more than `true`. */
      case 'away': out.away = num(g.away, 0) ? 1 : 0; break;
      case 'seed': out.seed = str(g.seed, ''); break;
      default: out[k] = Math.max(0, Math.round(num(g[k], 0))); break;      // tGame · tAnswer · tAway
    }
  }
  return out;
}

/**
 * A record off the disk → a well-formed one. TOTAL: accepts anything, never throws, idempotent.
 * `deserialize(serialize(g))` is `deepStrictEqual` to `serialize(g)`.
 */
export function deserialize(raw) {
  return serialize(freshState(isObj(raw) ? raw : null));
}

/** The live session record on a save, or `null`. Does not repair — use `resume()` for that. */
export function stateOf(save) {
  const g = save?.inProgress?.game;
  return isObj(g) ? g : null;
}

/** The live record, or a throw. Every mutator starts here. */
function mustState(save) {
  const g = stateOf(save);
  if (!g) throw new JobStateError('no-job');
  return g;
}

/**
 * Read the record back from the disk, repaired. Writes the repair through.
 *
 * A session that was open when the app went away comes back with its absence still open (see
 * `presence`); it is closed HERE, at the instant the session is re-opened, so the span nobody was
 * present for never reaches either half of the printed share — and so that the student's first
 * decision after coming back is not itself swallowed by the absence.
 * @param {object} save
 * @param {{now?: number}} [opts]
 */
export function resume(save, opts = {}) {
  const s = guardSave(save);
  const ip = resumePage(s);
  if (!ip || !isObj(ip.game)) return null;
  const g = deserialize(ip.game);
  ip.game = g;
  closeAbsence(s, g, num(opts?.now, 0) || Date.now());
  /* A session reopened on a repeat (a save written by a build that did not have `sealRepeat`, a
     reload between the two) gets its bidless seal here, so there is no route by which a repeat can
     be bid on and paid for twice. */
  sealRepeat(g, currentItem(s));
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
   The queue — the study layer's, read-only from here
   ========================================================================================== */

export const queueOf = (save) => (Array.isArray(save?.inProgress?.queue) ? save.inProgress.queue : []);
export const idxOf = (save) => Math.max(0, int(save?.inProgress?.idx, 0));
export const currentItem = (save) => queueOf(save)[idxOf(save)] ?? null;
export const targetsLeft = (save) => Math.max(0, queueOf(save).length - idxOf(save));
export const answered = (save) => Math.min(idxOf(save), queueOf(save).length);

/**
 * A page that has been ANSWERED INTO but has no game record — a plain Today's Page in progress.
 * Starting a session over one would delete unanswered items from the schedule, so `startJob` refuses.
 */
export function pageInProgress(save) {
  const ip = save?.inProgress;
  if (!isObj(ip) || isObj(ip.game)) return null;
  if (!Array.isArray(ip.queue) || !ip.queue.length) return null;
  const idx = Math.max(0, int(ip.idx, 0));
  if (idx <= 0) return null;
  return { idx, left: Math.max(0, ip.queue.length - idx) };
}

/* ==========================================================================================
   Ledger B on the save — created lazily, never from `store.js` (which this layer must not import)
   ========================================================================================== */

const cloneDefault = (k) => JSON.parse(JSON.stringify(SAVE_DEFAULTS[k]));

function playerOf(save) {
  if (!isObj(save.player)) save.player = cloneDefault('player');
  const p = save.player;
  if (!Number.isFinite(+p.best)) p.best = 0;
  return p;
}

function gameOf(save, day = null) {
  if (!isObj(save.game)) save.game = cloneDefault('game');
  const g = save.game;
  if (!Number.isFinite(+g.today)) g.today = 0;
  if (typeof g.day !== 'string') g.day = null;
  /* THE DAY ROLLS OVER, and that is the ONE time `today` may go back to 0 (CUT-SPEC §7 #8 is about
     a session: within one day the number never decreases). */
  if (day && g.day !== day) { g.day = day; g.today = 0; }
  return g;
}

/* ==========================================================================================
   The split meter — ONE session clock, and nothing prices it

   CUT-BRIEF "Session shape" asks for "a genuine 45–55 % of WALL CLOCK spent on game decisions —
   and the app measures its own split and prints the measured number, never a claimed one."

   So the denominator is the session, not a pair of hand-picked intervals. The meter holds one
   clock in two halves, and the halves PARTITION the session:

       tGame    the intervals the screen declares a game decision — the face-down card is up and
                the student is choosing a call, or choosing to bank. Nothing else, ever.
       tAnswer  THE REST OF THE SESSION. Answering, yes — and also the flip, and the seconds spent
                reading the worked solution of a question already graded. Study time, all of it.
       tAway    the spans the APP DECLARED IT WAS NOT IN USE — hidden, backgrounded, closed. Not
                session at all, so in neither half of the share. See "An absence is not a session".

   THE INVARIANT, maintained by `tick` and asserted by `tests/job-split.test.mjs`:

       tGame + tAnswer + tAway === (the instant of the last verb) − inProgress.startedAt

   which is what makes `splitOf` a share of the session rather than a ratio of two intervals. It
   also means the last verb's instant is recoverable from the record alone, so the meter survives a
   killed tab.

   Two consequences, both deliberate:

     · An interval the screen does not declare falls to `tAnswer`. Unattributed time can therefore
       only ever LOWER the printed share — the meter has no way to flatter the game.
     · The flip is `tAnswer`. It is an animation the student waits through, and CUT-BRIEF is explicit
       that a low measurement is fixed by cutting answering time, "never to pad the game with
       waiting". Counting waiting as a game decision is that padding, done in the meter.

   AND THE THIRD, WHICH THE FIRST TWO DID NOT BUY (r2, split-honesty).

   "Unattributed time can only ever lower the printed share" was true of time the screen does not
   declare, and false of time it does. A face-down card is the app's own pause point — it is up at
   the start of the session and after every Continue — so it is the likeliest screen to be open when
   a student stops being present, and the screen's `beat()` hands the whole absence over as one
   declared game decision. Booked 1:1, a 90-second phone call printed `65 % of this session was the
   game` over a session that was 16 % game, and fifteen minutes away printed 95 %. The share the
   student read was unbounded in the time he spent not playing.

   Nobody can tell thinking from absence by duration alone, so the meter does not try. It BOUNDS
   what one question can put into the game half instead — see `DELIBERATION_MS` — and closes the
   absence itself where it can actually be seen, at `presence`.
   ========================================================================================== */

/**
 * THE DELIBERATION CAP — the most one question may put into the game half, and the bound that keeps
 * a student who is not there from running away with the meter.
 *
 * 24 s is not a taste. It is the design's own upper figure: at COMPOSED's fastest published card
 * (20 s) CUT-BRIEF's 45–55 % band needs 16–24 s of choosing per question (`tests/job-split.test.mjs`
 * §6 derives both ends from the documents). So 24 s is the longest deliberation the DESIGN could
 * ever ask for, and the cap never throws away a decision the band wanted.
 *
 * IT WAS A CEILING — CREDIT NOTHING PAST 24 s — AND ROUND 4 PROVED THAT WRONG (number-truth,
 * blocker). A real session at `#/run/job`, chromium, tab visible throughout, no `visibilitychange`:
 * the student sat 26 s on the face-down card for each of the first three questions and played the
 * rest fast. Half the session's wall clock — 78,006 of 157,087 ms — was spent choosing calls, and
 * the end panel printed **6 %**. Every one of those three intervals was dropped WHOLE, while the
 * session kept them in the denominator, so the numerator lost them twice over. In the engine probe
 * beside it, 23.9 s of deciding printed 46 % and **24.1 s printed 0** — a fifth of a second in one
 * student's thinking flipping the app's only self-report from honest to nothing.
 *
 * That is not the safe direction, it is a different lie: CUT-BRIEF asks the app to "measure its own
 * split and print the measured number", and it answers a low number by cutting answering time —
 * precisely the wrong repair to drive with a censored statistic.
 *
 * WHY THE CEILING IS NOT NEEDED TO HOLD THE r2 LINE. It was written against an absence arriving as
 * one enormous declared interval. That is now closed where it can actually be seen: `screens/job.js`
 * calls `skipBeat()` on `visibilitychange` AND `pagehide`, so a hidden span cannot be inside the
 * screen's claim at all, and `presence()` books it to `tAway`, out of both halves. What the cap
 * still has to hold is the one span nobody can see — a page that stayed visible with nobody in
 * front of it — and for that a bound is enough and a cliff buys nothing: `tGame` is at most one
 * deliberation per decision under either rule, so the exposure is identical, and past the cap the
 * printed share FALLS with every further second away, exactly as it did before. What the cap adds
 * is continuity: 24.1 s of real thinking is now 24 s of credit, not zero.
 *
 * What neither rule can close is a dwell UNDER the cap: twenty seconds of not being there reads
 * exactly like twenty seconds of choosing. Duration cannot see that; presence can, and `presence()`
 * below is where it is seen — the two are independent, and neither needs the other.
 */
export const DELIBERATION_MS = 24_000;

/**
 * An interval on the face-down card → the part of it that is a game decision: all of it up to the
 * cap, and the rest to the study half with every other unattributed millisecond.
 */
const deliberation = (ms) => Math.min(DELIBERATION_MS, Math.max(0, ms));

/** Bank `ms` of wall clock against one half of the session. */
function addMs(g, key, ms) {
  const v = Math.max(0, Math.round(num(ms, 0)));
  if (v > 0) g[key] = Math.max(0, Math.round(num(g[key], 0))) + v;
}

/**
 * THE SESSION'S ONE CLOCK — `inProgress.startedAt`, and it is the GAME SESSION's start, not some
 * earlier page's. The study layer's `startPage` stamps it when it composes a page; when `startJob`
 * adopts a page that was composed earlier and never answered into, `startJob` re-stamps it to the
 * instant the session opens (see `startJob`, r3 split-honesty). Either way the stamp is the instant
 * this session began, which is what makes `splitOf` a share of THIS session.
 *
 * `null` for a page assembled without one, and then the meter degrades to "book only what the screen
 * declared" rather than inventing a clock.
 */
function startedAtOf(save) {
  const t = +(save?.inProgress?.startedAt);
  return Number.isFinite(t) ? t : null;
}

/** ms already attributed — by the invariant above, exactly `lastVerbAt − startedAt`. */
const measuredOf = (g) =>
  Math.max(0, Math.round(num(g.tGame, 0))) + Math.max(0, Math.round(num(g.tAnswer, 0)))
  + Math.max(0, Math.round(num(g.tAway, 0)));

/* ------------------------------------------------------------------------------------------------
   AN ABSENCE IS NOT A SESSION (r3, number-truth)

   The two halves partitioned the WALL CLOCK, and a student who closes the tab or puts the phone in
   a pocket is inside that denominator: everything the screen does not declare falls to `tAnswer`,
   and nothing re-stamped the clock when the session came back. The same six questions, answered at
   the same speed with the same decisions, printed 16 % · 5 % · 1 % · 0 % for a break of 0 min ·
   5 min · 1 h · 12 h. The arithmetic was exact; the sentence under it — "% of this session was the
   game" — was about a session nobody had.

   So the partition has a third part, and the ONLY thing that may enter it is a span the app itself
   declared it was not in use: `presence(save, { now, here: false })` when the document is hidden or
   the page is going away, `presence(… here: true )` (or the next verb, or `resume`) when it comes
   back. Duration is never evidence — a long interval with the app in front of the student is study
   time, as it always was, and still lowers the share. That asymmetry is the whole safety property:
   `tAway` grows ONLY from a declared absence, and the screen declares PRESENCE, never a duration, so
   the length is always the meter's own unattributed span and never a number it was handed.
   ------------------------------------------------------------------------------------------------ */

/**
 * Close an open absence at `now` and bank it to `tAway`. Returns the ms booked.
 *
 * THE ABSENCE IS NEVER A NUMBER THE APP IS TOLD. `away` is one bit; the LENGTH is derived, and it is
 * derived from the meter's own invariant: `presence(… here: false)` attributes every millisecond up
 * to the moment the app went away, so from then until this call the unattributed span IS the
 * absence, exactly. Nothing can inflate it — there is no duration to forge, no stamp to move, and no
 * arithmetic that can reach past the clock. With no clock to close it against the bit STANDS: a
 * meter that cannot measure must not silently forget that the app was away.
 */
function closeAbsence(save, g, now) {
  const base = startedAtOf(save);
  if (base == null || !Number.isFinite(now)) return 0;
  const away = !!num(g.away, 0);
  g.away = 0;
  if (!away) return 0;
  const ms = Math.max(0, Math.round(now - base) - measuredOf(g));
  addMs(g, 'tAway', ms);
  return ms;
}

/**
 * Advance the session clock to `opts.now` and attribute EVERY millisecond since the previous verb.
 *
 * `half` is the half this verb's OWN interval belongs to. When it is `tGame`, `opts.ms` — the screen's
 * measurement of the face-down card, from the paint to the tap — is the game decision, first capped by
 * the wall clock that actually elapsed (a screen may claim an interval that never happened) and then
 * by `deliberation`, which is the most one question may put into the game half. Every millisecond the
 * game half does not take is `tAnswer`. When `half` is `tAnswer`, all of it is.
 *
 * With no clock (`opts.now` absent, or a page with no `startedAt`) there is no session to take a share
 * of, so only the declared interval is booked, to the half named — and the cap still applies to the
 * game half, because that branch has no wall clock to bound a claim with. It can be wrong; it cannot
 * inflate past one deliberation.
 */
function tick(save, g, opts, half) {
  const declared = Math.max(0, Math.round(num(opts?.ms, 0)));
  const base = startedAtOf(save);
  const now = num(opts?.now, NaN);
  if (base == null || !Number.isFinite(now)) {
    addMs(g, half, half === 'tGame' ? deliberation(declared) : declared);
    return;
  }
  /* A verb can arrive with an absence still open — the page came back without a `visibilitychange`
     the screen could hear, or the tab was killed and this is the session resumed. The span between
     last verb and this one is the absence; it closes here, before anything else is attributed. */
  closeAbsence(save, g, now);
  const elapsed = Math.max(0, Math.round(now - base) - measuredOf(g));
  const gameMs = half === 'tGame' ? deliberation(Math.min(declared, elapsed)) : 0;
  addMs(g, 'tGame', gameMs);
  addMs(g, 'tAnswer', elapsed - gameMs);
}

/**
 * THE APP WENT AWAY, OR CAME BACK — the one signal the meter takes from outside the four verbs, and
 * the only way a millisecond ever reaches `tAway`.
 *
 * `here: false` (the document is hidden, or the page is going away) closes the books on the time the
 * student WAS here — it is booked to the answering half, exactly as an undeclared interval always
 * was — and sets the bit. `here: true` closes the absence at `now`. Both are idempotent:
 * `visibilitychange` and `pagehide` fire together on the way out, and a second set would throw away
 * the first one's absence, so only the first of a run counts.
 *
 * THE APP IS NEVER TOLD HOW LONG IT WAS AWAY. It reports presence, one bit, and the length is the
 * meter's own arithmetic — which is why no screen, however wrong, can shrink the denominator by more
 * than the interval it was actually away for. The bit is on the RECORD, not in the screen, which is
 * what makes a closed tab work: the span the student was present for is already booked when the page
 * dies, and the absence that follows it is closed by `resume` (or by the next verb) whenever the
 * session is opened again — hours later, or never.
 *
 * It prices nothing, prints nothing and moves no pile. A call of this with no clock, or on a page
 * with no `startedAt`, does nothing at all.
 * @param {object} save
 * @param {{now?: number, here?: boolean}} [opts]
 */
export function presence(save, opts = {}) {
  const s = guardSave(save);
  const g = mustState(s);
  const now = num(opts?.now, NaN);
  const base = startedAtOf(s);
  if (base == null || !Number.isFinite(now)) return g;
  if (opts?.here === false) {
    if (num(g.away, 0)) return g;                 // already away: the first of a run is the one that counts
    tick(s, g, { now }, 'tAnswer');
    g.away = 1;
    return g;
  }
  closeAbsence(s, g, now);
  return g;
}

/**
 * The MEASURED share of this session spent on game decisions, 0…100, or `null` when nothing has been
 * measured yet. The app prints this number and never a claimed one (CUT-BRIEF "Session shape").
 *
 * `tGame + tAnswer` is the session the student played — the wall clock since `inProgress.startedAt`
 * less only the spans the app declared it was not in use — not a sum of two chosen intervals; see
 * the invariant above. So this is `gameMs / playedMs`, and it FALLS when a student lingers over a
 * worked solution, because lingering is not a game decision.
 */
export function splitOf(game) {
  const g = isObj(game) ? game : {};
  const gameMs = Math.max(0, num(g.tGame, 0));
  const answerMs = Math.max(0, num(g.tAnswer, 0));
  const wall = gameMs + answerMs;
  return wall > 0 ? Math.round((gameMs / wall) * 100) : null;
}

/* ==========================================================================================
   The four verbs
   ========================================================================================== */

/**
 * Start a session over TONIGHT'S PAGE. The queue is `page.startPage`'s — the same composer, the same
 * opts, the same items, in the same order — so the game is Today's Page with a different top strip.
 *
 * Refuses over a page that has been answered into: those items are still due, and overwriting the
 * queue would remove them from the schedule. `opts.force` is the deliberate override.
 * @returns {object} the session record
 */
export function startJob(save, opts = {}) {
  const s = guardSave(save);
  const live = stateOf(s);
  if (live && !opts.force) return live;
  if (!opts.force) {
    const open = pageInProgress(s);
    if (open) throw new JobStateError('page-in-progress', `${open.left} left on Today's Page`);
  }
  const now = num(opts.now, 0) || Date.now();
  /* The page that was ALREADY open, if there is one. `startPage` composes a brand-new `inProgress`
     when there is not — and hands back the existing object, untouched, when there is. Identity is
     therefore the exact test for "this verb adopted a page it did not open", which is the one case
     the stamp below has to repair. */
  const prior = resumePage(s);
  const ip = startPage(s, { ...opts, now });
  if (!ip || !Array.isArray(ip.queue) || !ip.queue.length) throw new JobStateError('empty-page');
  /* THE SESSION'S CLOCK IS THE SESSION'S (r3, split-honesty).
     `startPage` stamps `startedAt` when it COMPOSES a page, and a page can be composed long before a
     game session opens over it: open Today's Page, answer nothing, come back to `#/run/job` — or
     toggle the game off and on in Settings, which deletes `inProgress.game` and keeps `inProgress`.
     `pageInProgress` lets both through because nothing has been answered (idx 0), so the page is
     adopted whole — and its stamp came with it. The meter then measured a session that began before
     the session did: the gap always lands in `tAnswer`, so the printed share only ever fell, and an
     overnight gap printed `0 % of this session was the game` over a session that was half game.
     A session adopting an unplayed page is starting NOW, so its clock starts now. */
  if (ip === prior) ip.startedAt = now;
  playerOf(s);
  gameOf(s, str(opts.day) ?? todayISO(new Date(now)));
  ip.game = serialize(freshState({ seed: ip.seed == null ? '' : String(ip.seed) }));
  return ip.game;
}

/**
 * The calls `call()` would accept RIGHT NOW, cheapest first. Everything this list omits is greyed by
 * the screen (`screens/job.js` renders `reading.offered`), so this is the one place the engine says
 * which of the three words is live.
 *
 * NOTHING is offered while a call already stands, and that is the engine speaking with one voice
 * rather than two (r3, player-feel). `call()` refuses every id over a locked bid (`called`) and
 * settles a REPEAT's bidless seal at nothing without locking anything — so a full list in either
 * state was the engine offering what it would not sell. Greyed is also exactly what the repeat's
 * face-down beat needs: the same single dashed-border cue an unaffordable call already draws, no new
 * control, no new copy, and no number added to the screen.
 */
export const callsFor = (save) => {
  const g = stateOf(save);
  return g && !isObj(g.call) ? econ.offered(g.pile, g.streak) : [];
};

/**
 * Is the question about to be shown one the game has ALREADY priced — a repeat, sealed bidless by
 * `sealRepeat`? The screen asks this to route the question to its face-down beat instead of straight
 * into the card: the beat prints the skill and the drawn rate, greys the three calls (`callsFor` is
 * empty above), and leaves BANK reachable — `bank()` permits it over a bidless seal, and without the
 * beat the student loses that control for a whole question with nothing on screen to say why.
 *
 * Derived, not stored: it reads the seal `sealRepeat` already writes, so it adds no field to the
 * record and no state to the machine.
 */
export const isBidless = (save) => {
  const g = stateOf(save);
  return isObj(g?.call) && g.call.id === null;
};

/** What each call pays and costs right now — the screen's third slot, and nothing else. */
export function priceOf(save, callId) {
  const g = stateOf(save);
  const m = g ? clamp(int(g.streak, 1), 1, econ.MULT_MAX) : 1;
  const pile = g ? Math.max(0, int(g.pile, 0)) : 0;
  return { pay: econ.payOf(callId, m), cost: econ.costOf(callId, m, pile), streak: m, pile };
}

/**
 * THE CALL — locked before the question is shown. One of `econ.CALLS`, and only one the pile covers.
 * `opts.ms` is the wall clock spent deciding; it is measured, and nothing prices it.
 */
export function call(save, callId, opts = {}) {
  const s = guardSave(save);
  const g = mustState(s);
  /* A REPEAT is already sealed, bidless (`sealRepeat`), and there is nothing here to sell: a caller
     that asks anyway — a headless driver, a screen that has not re-rendered — is handed the price
     this question will really be settled at, which is nothing, instead of an error it cannot act
     on. A SECOND real bid is still refused: one question, one call. */
  if (isObj(g.call) && g.call.id === null) return { ...priceOf(s, null), call: null };
  if (isObj(g.call)) throw new JobStateError('called', String(g.call.id));
  if (!econ.canCall(callId, g.pile, g.streak)) throw new JobStateError('unaffordable', String(callId));
  /* The SAME precondition `answer` has. A call locked over a question that is not there is a call
     the student can never settle: the screen renders the flip, finds no item, and re-renders it. */
  if (!isObj(currentItem(s))) throw new JobStateError('no-target');
  const now = num(opts.now, 0) || Date.now();
  /* The face-down card was up and the student was choosing: THIS is a game decision, and the only
     shape of interval that ever reaches `tGame`. Everything else since the last verb — the seconds
     spent reading the last worked solution, the tap that dismissed it — is study time. */
  tick(s, g, opts, 'tGame');
  g.call = { id: callId, at: now };
  return { ...priceOf(s, callId), call: callId };
}

/**
 * A CLEAN CLEAR — the bit the GAME prices, and it is the study layer's own, not a new one.
 *
 * Global rule 8: cleared on the first try with no hint revealed. `screens/card.js` computes it for
 * every clear it grades (`clean`, from `js/xp.js isClean`) and the whole app already turns on it —
 * the Leitner bucket advances on a clean clear and STANDS STILL on a hinted one (`js/schedule.js
 * outcomeOf`), mastery scores 100 against 70, rarity withholds the gold. This function reads that
 * field and derives it only when a caller did not send one.
 *
 * WHY THE GAME CANNOT GO ON PRICING `cleared` ALONE (r4, exploit-hunt). The hint ladder is on every
 * card by design ("COMPOSED global rule 1 — always, everywhere") and it costs XP quality, never an
 * attempt — and on the hardest skills in the bank H3 states the answer outright. Driven in the real
 * app on `def-02`: three taps on Hint, then submit, and the engine paid `pretty sure` in full — +18,
 * the streak ×2 → ×3, and one more filled mark on the row the next bid is read off. Exact DP over
 * the shipped table for one 17-question page: a student who can read scored **746** against 263.7
 * for a genuine 4-in-5 student and 184.2 for a 7-in-10 one, with no deliberate wrong answer anywhere
 * — so CUT-BRIEF math #5's proof could not see it — and with `q` a dial the student turns, `sure` is
 * uniquely optimal wherever it is offered and the other two calls are never correct (math #2, gone).
 *
 * THE HINT IS NOT PUNISHED; THE BID IS SETTLED. A hinted clear is not a wrong answer to the study
 * layer and nothing here makes it one: the schedule, the XP, the bucket and the rarity are written
 * by `screens/card.js` exactly as they always were (`ok` below is still `result.cleared`, and it is
 * still what decides whether a missed review is copied back onto the page). What changes is only
 * what the PILE pays for, and the student bid on knowing this cold. Settling it any other way was
 * tried on paper and each one is the same exploit wearing a different coat: paying nothing and
 * costing nothing makes the hint a free escape from a bad bid, and an escape whose price does not
 * depend on the call makes the dearest call the best one everywhere, which is the dominance the
 * three-call design dies of.
 */
const cleanOf = (result) => {
  if (!isObj(result) || result.cleared !== true) return false;
  if (typeof result.clean === 'boolean') return result.clean;   // card.js's own bit, always present
  if (result.firstTry === false || result.solutionShown === true) return false;
  return !(num(result.hints, 0) > 0) && !(int(result.attempt, 1) > 1);
};

/**
 * THE ANSWER — `result` is `screens/card.js`'s own grade object, unchanged. This function prices it
 * and hands it to the study layer's two functions; it writes not one byte of Ledger A itself.
 *
 * The bit the hit rate counts and the bit the game prices are THE SAME BIT: a CLEAN clear — see
 * `cleanOf` above and `job/call.js qHatDetail`, which counts that one and no other (CUT-SPEC §7
 * "Ninth"). `ok` — `result.cleared` — is the STUDY layer's bit and stays exactly where it was: the
 * schedule's own branch below reads it, and nothing about Ledger A moves.
 * @returns {{ok, pay, cost, delta, pile, pileBefore, streak, streakBefore, call, left}}
 */
export function answer(save, result, opts = {}) {
  const s = guardSave(save);
  const g = mustState(s);
  const it = currentItem(s);
  if (!isObj(it)) throw new JobStateError('no-target');
  if (!isObj(g.call)) throw new JobStateError('no-call');
  /* Everything between locking the call and grading it — the flip, reading the question, solving it —
     is the study half. No game decision is offered in there: `bank` refuses over a live call. */
  tick(s, g, opts, 'tAnswer');

  const callId = g.call.id;
  const ok = result?.cleared === true;          // LEDGER A's bit — the schedule's, untouched
  const earned = cleanOf(result);               // …and LEDGER B's: the clear the student did himself
  const m = clamp(int(g.streak, 1), 1, econ.MULT_MAX);
  const pileBefore = Math.max(0, int(g.pile, 0));
  /* A REPEAT IS NOT A SECOND EARNING SLOT (r1, exploit-hunt). `callId` is `null` on one, so the
     table prices it at nothing — see `isRepeat` below for why that is the whole fix. */
  const pay = econ.payOf(callId, m);
  const cost = econ.costOf(callId, m, pileBefore);
  const priced = isCall(callId);

  /* ---- LEDGER B: the pile. A loss comes only from the unbanked pile and floors at zero. ---- */
  g.pile = earned ? pileBefore + pay : Math.max(0, pileBefore - cost);
  if (priced) g.streak = earned ? Math.min(econ.MULT_MAX, m + 1) : 1;
  g.call = null;
  g.answered = Math.max(0, int(g.answered, 0)) + 1;

  /* ---- LEDGER A: the SCHEDULE, through the study layer's own two calls, in its own order ---- */
  const r = resultRecord(it, result);
  if (!ok && (it.isReview || it.isRematch)) requeueReview(s, { idx: idxOf(s), result: r });
  markItem(s, r, { idx: idxOf(s) });
  sealRepeat(g, currentItem(s), opts);

  return {
    /* `ok` IS THE GAME'S RECEIPT, so it is the bit the game settled on: a clear bought with a hint
       moved the pile the way a miss does, and a caller that printed `ok: true` over it would be
       describing a payment that did not happen. `result.cleared` is the study layer's and is on the
       result object the caller already holds.

       `cost` is already capped at the pile, so the loss IS `cost` — and when it is nothing, the
       delta is `0`, never `-0`: a surface that prints this number must never print a minus sign in
       front of a zero (CUT-BRIEF: no number that is not exactly the number the engine computes). */
    ok: earned, pay, cost, delta: earned ? pay : (cost === 0 ? 0 : -cost),
    pile: g.pile, pileBefore, streak: g.streak, streakBefore: m,
    call: callId, left: targetsLeft(s),
  };
}

/** Is this one of the three calls the table prices? `null` — a repeat's bidless seal — is not. */
const isCall = (id) => econ.CALLS.includes(id);

/**
 * A question the page is asking AGAIN: `page.requeueReview` marks its copy `requeued`.
 */
export const isRepeat = (it) => isObj(it) && int(it?.requeued, 0) > 0;

/**
 * THE REPEAT, AND THE EXPLOIT IT CLOSES (r1, exploit-hunt).
 *
 * Miss a Review and the study layer puts a COPY of it back on the page — `page.requeueReview`, the
 * same on both routes, and not the game's business. But a copy is another question, and while the
 * game priced it like any other, being wrong on purpose BOUGHT one: the loss was `min(pile, cost)`,
 * which is nothing at an empty pile, and the copy then paid full price on a question whose worked
 * solution was on screen a moment ago. Throwing every review beat honest play by 16–44 % through
 * the shipped state machine. The suite could not see it because its §7 #5 proof fixed the number of
 * questions in advance, and in the app a wrong answer on a review ADDS one.
 *
 * THE FIX IS SUBTRACTIVE: the game prices each QUESTION once. A repeat is sealed here with a
 * bidless call — `{ id: null }` — so the table prices it at nothing, the streak does not move, and
 * the pile is neither paid nor charged. `screens/job.js` renders the question straight away
 * (`isObj(g.call)` is its "the bid is in" test) so the student is never asked to bid on a question
 * he has already seen, and the strip goes on printing his hit rate rather than `pays 0` — the two
 * shapes the brief bans, a dead tap and a worthless call, both avoided by not asking.
 *
 * The schedule is untouched: the copy is still queued, still answered, still marked through
 * `markItem`, and `tests/job-ledger.test.mjs` still finds byte-identical study state.
 *
 * Bank is not offered over a repeat, for the same reason it is not offered over a question already
 * flipped: `bank` refuses while a call is sealed. It is live again on the next face-down card.
 */
function sealRepeat(g, next, opts) {
  if (isObj(g.call) || !isRepeat(next)) return;
  g.call = { id: null, at: num(opts?.now, 0) || Date.now() };
}

/**
 * The result object `page.markItem` records — BYTE-IDENTICAL to `screens/run.js record()`'s, which is
 * what the flat page writes. The game adds nothing to it and removes nothing from it; that identity
 * is half of what `tests/job-ledger.test.mjs` proves.
 */
const resultRecord = (it, result) => ({
  ...result, n: it.n, role: it.role, skill: it.skill ?? (it.skills || [])[0] ?? null, tier: it.tier,
});

/**
 * BANK — the pile becomes points and the streak goes back to ×1. Live at every moment the card is
 * face down, never required.
 *
 * REFUSED while a call is locked, and that is the whole first idea of the design holding itself up:
 * the call is a bid the pile backs, and the question is already on screen. Banking there would sell
 * the student two exploits at once — lock *sure* at ×5, bank, and the cost is floored to nothing
 * (a free question at full pay); or lock, read the question, and bank out of a bid you no longer
 * like. "You bid on yourself BEFORE you see the question" is only true if the bid stands until it is
 * answered. `screens/job.js` offers bank on the face-down card only, so this refusal is invisible.
 *
 * The DAY is the session's, never a fresh clock read: a session that runs through midnight keeps
 * banking into the day it started, so `save.game.today` cannot fall while the student is looking at
 * it (CUT-SPEC §7 #8). `startJob` is the one verb that rolls the day over.
 * @returns {{points, today, best, pile, streak}}
 */
export function bank(save, opts = {}) {
  const s = guardSave(save);
  const g = mustState(s);
  /* …refused over a BID. A repeat's bidless seal is not one — there is no wager standing on that
     question, so banking over it takes nothing away from anybody and "bank is always available"
     stays true (CUT-BRIEF's hard limits). */
  if (isObj(g.call) && g.call.id !== null) throw new JobStateError('called', String(g.call.id));
  /* Bank is offered on the face-down card only, so the interval the screen declares is the same
     game decision `call` declares — the student chose to take the pile instead of bidding it. */
  tick(s, g, opts, 'tGame');
  return bankPile(s, g, opts.day);
}

/**
 * The pile becomes points. Split out of `bank` so that `endJob` can bank WITHOUT re-running the
 * split meter: the closing interval is `endJob`'s, and it is not a game decision (see `endJob`).
 */
function bankPile(s, g, day) {
  const points = Math.max(0, int(g.pile, 0));
  const gm = gameOf(s, str(day));
  const p = playerOf(s);
  gm.today = Math.max(0, int(gm.today, 0)) + points;
  p.best = Math.max(int(p.best, 0), gm.today);
  g.pile = 0;
  g.streak = 1;
  return { points, today: gm.today, best: p.best, pile: 0, streak: 1 };
}

/**
 * The session ends. An unbanked pile banks itself, the page is closed through the study layer's own
 * `finishPage`, and the record goes with it.
 * @returns {{points, today, best, answered, split}}
 */
export function endJob(save, opts = {}) {
  const s = guardSave(save);
  const g = stateOf(s);
  if (!g) throw new JobStateError('no-job');
  /* An unanswered bid dies with the session: the question it was locked over is going back on the
     schedule unanswered, so it can neither pay nor cost. Voiding it here is also what keeps the
     auto-bank total — `bank` refuses over a live call, and the pile must always come home. */
  g.call = null;
  /* THE CLOSING INTERVAL IS NOT A GAME DECISION. It starts when the last question was GRADED and ends
     when the student taps through the worked solution — reading a graded question, which is study
     time under any reading of CUT-BRIEF, and which is dropped from the game half on every other
     question of the session. Booking it to `tGame` (which `bank(s, opts)` would do) both inflated the
     printed share and made this one question's reading time count differently from all the others. */
  tick(s, g, opts, 'tAnswer');
  const banked = bankPile(s, g, opts.day);
  const answeredN = Math.max(0, int(g.answered, 0));
  const split = splitOf(g);
  finishPage(s);                               // clears `inProgress`, and the record with it
  return {
    points: banked.points, today: banked.today, best: banked.best, answered: answeredN, split,
  };
}
