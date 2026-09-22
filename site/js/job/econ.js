// site/js/job/econ.js — THE JOB: the economy core (J1).
//
// AUTHORITY: COMPOSED-GAME.md G1 (the ρ ladder), G2 (loot, multipliers, fee, chain, crew forgiveness),
// G3.1 (the two call ladders), G3.2 (push or bag), G3.3 (the fee's proof of work).
// Every constant comes from `site/data/job.js`; nothing numeric is spelled twice.
//
// THIS FILE IS DOM-FREE (BUILD-POLICY / G8): no `document`, no `window`, no CSS, no import from
// `js/screens/*`. It imports cleanly in plain node and every number in it is testable headless.
//
// WHAT LIVES HERE — the price of one target, and the arithmetic of one decision:
//   · `rhoFor` / `expectedRho`      the payout rung, and crew forgiveness
//   · `carryFor` / `missFor`        the two payout branches
//   · `bagFee` / `bagBank`          banking, and what the prompt prints
//   · `chainAfterTarget` / `chainAfterBag`   the four chain transitions
//   · `gainLFor` / `lossLFor`       the two `L`s the two branches charge (G2's deliberate asymmetry)
//   · `pushMinusBag` / `breakevenQ` the BAG/PUSH decision and the threshold the app PRINTS
//   · `carryEVAt` / `evMaxCallAt`   G3.1's carry EV at a real state, with the `min(LOOSE, ·)` cap
//   · `wTimesEc` / `stakePeak` / `stakeBand`  the stake band the app names (G3.1 point 2)
//   · `regretLine`                  the debrief's optimal line against the realised order
//   · `shapeTable` / `lootPerMinuteRows`      the published tables, recomputed from constants
//
// WHAT DOES NOT LIVE HERE: the rating pipeline (`ratingFrom`, `rankFor`, `argmaxCall`) is J2's
// `job/call.js`; the guard's distribution is J3's `job/guard.js`; crew allocation and the idle rule
// are J4's `job/crew.js`. `ratingWeight` / `expectedCredit` / `honestRung` below exist because the
// stake band is a J1 acceptance criterion — J2's `call.js` is the public authority for the rating and
// MUST agree with them (see notes/J1.md "Requests").
//
// Ledger law (G1 Global law 2): nothing in this file writes anything. Every function is pure.

import { scopeFor, comboTransition } from '../xp.js';
import { intervalDays } from '../schedule.js';
import {
  LADDER, LOOT, CHAIN, FEE, GETAWAY_FEE, TELL, TELL_BASE, COMPLETION, COMMIT_BONUS, COLD,
  RUNGS, MISS_RUNG, RUNG_BANDS, CARRY_LADDER, CALL_LEVELS, CREDIT, RATING, RANKS, GUARD,
  SHAPES, ANSWER_MINUTES_PER_TIER, DECISION_SECONDS, FIXED_PHASES, DECISIONS, X2, AUTO_BAG,
  BOARD, COPY,
} from '../../data/job.js';

/* ------------------------------------------------------------------ re-exports (the acceptance list) */

export { LOOT, LADDER, CHAIN, FEE, TELL, COMPLETION, COLD, GETAWAY_FEE, COMMIT_BONUS, AUTO_BAG, RUNGS, MISS_RUNG, RUNG_BANDS };

/* ------------------------------------------------------------------ small numeric helpers */

const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

/**
 * Round half-up, robust to binary representation. `0.9395` must give `0.940`, not `0.939`:
 * `0.9395 * 1000` is `939.4999999999999` in float64, so a bare `Math.round` loses the tie.
 * @param {number} x
 * @param {number} [dp=0]
 */
export function round(x, dp = 0) {
  const f = 10 ** dp;
  const s = x < 0 ? -1 : 1;
  return (s * Math.round(Math.abs(x) * f + 1e-9)) / f;
}

/** Round to 3 decimal places, half-up — the precision every published table in G2/G3 is printed at. */
export const r3 = (x) => round(x, 3);

/* ------------------------------------------------------------------ G1: the rung ladder and crew forgiveness */

/**
 * The payout rung, after crew forgiveness. G1: `ρ_eff = LADDER[max(0, rung − rank)]`.
 * Nothing random touches it.
 * @param {number} rung  0 clean · 1 one-hint · 2 attempt-2 · 3 attempt-3 · 4 miss
 * @param {number} [rank=0]  the crew rank on this make (0 bare · 1 STEADY · 2 HELD)
 * @returns {number} ρ_eff in [0, 1]
 */
export function rhoFor(rung, rank = 0) {
  const r = clamp(Math.trunc(num(rung)), 0, LADDER.length - 1);
  const k = clamp(Math.trunc(num(rank)), 0, LADDER.length - 1);
  return LADDER[Math.max(0, r - k)];
}

/** Is this rung a MISS (a loss) rather than a payout, given the crew rank? */
export function isMiss(rung, rank = 0) {
  return rhoFor(rung, rank) === 0;
}

/**
 * E[ρ] over a rung distribution. `RUNG_BANDS[85|60|40]` are the shipped bands (G2); this reproduces
 * the published E[ρ] table from `LADDER` alone.
 * @param {number[]|Record<number,number>|number} rungs  a distribution over rungs, or one rung index
 * @param {number} [rank=0]
 * @returns {number}
 */
export function expectedRho(rungs, rank = 0) {
  if (typeof rungs === 'number') return rhoFor(rungs, rank);
  const probs = Array.isArray(rungs) ? rungs : LADDER.map((_, i) => num(rungs?.[i]));
  let acc = 0;
  for (let i = 0; i < probs.length; i++) acc += num(probs[i]) * rhoFor(i, rank);
  return acc;
}

/**
 * `ρ̄` for a payout: a realised rung (a number) pays that rung; a distribution pays its expectation
 * (what the envelope's pre-decision estimate and the BAG/PUSH threshold use).
 * @param {number|number[]|Record<number,number>|null|undefined} rungs
 * @param {number} [rank=0]
 */
export function rhoBarFor(rungs, rank = 0) {
  if (rungs == null) return 1;               // the optimistic bound G3.2's published table uses
  return expectedRho(rungs, rank);
}

/* ------------------------------------------------------------------ G2: the multipliers */

/** G2 `m_chain = 1 + 0.2·min(chain, 8)` — cap ×2.6. */
export function chainMult(chain) {
  const c = Math.max(0, Math.trunc(num(chain)));
  return 1 + CHAIN.step * Math.min(c, CHAIN.cap);
}

/**
 * G2 `cold = 1 + 0.5·min(1, overdueDays / schedule.intervalDays(bucket))`, CAPPED at 1.50.
 * A bucket-1 card 1 day overdue and a bucket-5 card 14 days overdue are equally cold (both 1.50), so
 * letting a card rot past its own interval buys nothing (G12 #13).
 * @param {number} bucket  Leitner bucket 0..5
 * @param {number} overdueDays  `schedule.overdueDays(rec)`
 */
export function coldFor(bucket, overdueDays) {
  const od = Math.max(0, num(overdueDays));
  const iv = intervalDays(bucket);
  const ratio = iv > 0 ? od / iv : (od > 0 ? 1 : 0);
  return Math.min(COLD.cap, COLD.base + COLD.slope * Math.min(1, ratio));
}

/**
 * G2 `tell = 1.25 while the make has a triggered, unresolved, unsealed tag in save.errors; else 1`.
 * `index.resolve()` (J7) sets `cleared = true` and this drops to 1.00 that instant; sealing retires it.
 * @param {{triggered?: number, cleared?: boolean, sealed?: boolean}|boolean|null} tag
 */
export function tellFor(tag) {
  if (!tag) return TELL_BASE;
  if (tag === true) return TELL;
  if (tag.cleared === true || tag.sealed === true) return TELL_BASE;
  if (tag.triggered != null && !(num(tag.triggered) > 0)) return TELL_BASE;
  return TELL;
}

/** The guarded-wing loot multiplier for a rank (G2 "Rank": ×0.50 → ×0.75). */
export function guardMultFor(rank) {
  const row = RANKS.find((r) => r.rank === clamp(Math.trunc(num(rank, 1)), 1, RANKS.length)) ?? RANKS[0];
  return row.guardMult;
}

/**
 * G2 `wing = 1 + 0.25·(tokens on this wing) if unguarded; guardMult(rank) if guarded`.
 * Tokens on the guarded wing pay nothing.
 * @param {{tokens?: number, guarded?: boolean, rank?: number}} o
 */
export function wingMult({ tokens = 0, guarded = false, rank = 1 } = {}) {
  if (guarded) return guardMultFor(rank);
  return 1 + GUARD.tokenBonus * Math.max(0, Math.trunc(num(tokens)));
}

/** G2 `wing_pen = 2 on the guarded wing else 1` — the miss branch's guard term. */
export function wingPen(guarded) {
  return guarded ? GUARD.wingPenGuarded : GUARD.wingPenUnguarded;
}

/** The ×2 posting (G3.6): an independent 1-in-6 per target, drawn and MARKED before the call. */
export function x2Mult(on) {
  return on ? X2.mult : 1;
}

/** The carry ladder's `(W, P)` for a call id, with 50 as the fallback (the always-available rung). */
export function carryOf(call) {
  const id = typeof call === 'object' && call ? call.id : call;
  return CARRY_LADDER[id] ?? CARRY_LADDER[50];
}

/* ------------------------------------------------------------------ the target, priced */

/**
 * @typedef {object} Target
 * @property {number} [tier]          1..4 — picks `L` from LOOT
 * @property {number} [loot]          an explicit `L`, overriding `tier`
 * @property {number} [scope]         an explicit scope multiplier
 * @property {object} [scopeFlags]    `{isReview,isDrill,isVariant,isMastered,isBonusBank}` → xp.scopeFor
 * @property {number} [bucket]        Leitner bucket, for `cold`
 * @property {number} [overdueDays]   `schedule.overdueDays(rec)`
 * @property {number} [cold]          an explicit `cold`, overriding bucket/overdueDays
 * @property {object|boolean} [tell]  the live tag record, or a boolean
 * @property {number} [tokens]        tokens pressed on this target's wing
 * @property {boolean} [guarded]      is this target's wing the guarded one
 * @property {number} [rank]          the player's rank 1..5 (only read when `guarded`)
 * @property {boolean} [x2]           did the day's seed mark this target
 * @property {number} [mult]          any further multiplier (default 1) — kept so a shape can add one
 *                                    without this file growing a term
 */

/** `L` for a target. */
export function lootFor(target = {}) {
  if (Number.isFinite(target.loot)) return target.loot;
  const t = clamp(Math.trunc(num(target.tier, 1)), 1, 4);
  return LOOT[t];
}

/** `scope` for a target — `xp.scopeFor()` verbatim (G2), or the explicit override. */
export function scopeOf(target = {}) {
  if (Number.isFinite(target.scope)) return target.scope;
  if (target.scopeFlags) return scopeFor(target.scopeFlags);
  return 1;
}

/** `cold` for a target. */
export function coldOf(target = {}) {
  if (Number.isFinite(target.cold)) return target.cold;
  if (target.bucket != null || target.overdueDays != null) return coldFor(target.bucket, target.overdueDays);
  return COLD.base;
}

/**
 * The envelope's `posted` — what a target is worth BEFORE the call, the rung and the chain.
 * `posted = round(L · scope · wing · cold · tell · x2)`.
 */
export function postedFor(target = {}) {
  return round(lootFor(target) * scopeOf(target) * wingMult(target) * coldOf(target)
    * tellFor(target.tell) * x2Mult(target.x2) * num(target.mult, 1));
}

/**
 * G2 clear branch: `Δloose = round( L · ρ_eff · m_chain · W_call · scope · wing · cold · tell )`,
 * times the ×2 posting (G3.6 — a random object multiplies both branches identically, G3.7 proof 1).
 * ONE round, at the end, of the whole product.
 * @param {Target} target
 * @param {number|{id:number}} call    a call id (50/70/85/95)
 * @param {number} chain               the chain BEFORE this target
 * @param {number|number[]|Record<number,number>} rungs  the realised rung, or a rung distribution
 * @param {number} [crew=0]            the crew rank on this make (0/1/2)
 * @returns {number} Δloose, ≥ 0
 */
export function carryFor(target, call, chain, rungs, crew = 0) {
  const { W } = carryOf(call);
  const raw = lootFor(target)
    * rhoBarFor(rungs, crew)
    * chainMult(chain)
    * W
    * scopeOf(target)
    * wingMult(target)
    * coldOf(target)
    * tellFor(target?.tell)
    * x2Mult(target?.x2)
    * num(target?.mult, 1);
  return round(raw);
}

/**
 * G2 miss branch: `Δloose = −min( LOOSE, round( L · m_chain · P_call · wing_pen ) )`, times the ×2.
 * Note the asymmetry the spec authors deliberately: `scope`, `cold` and `tell` do NOT scale a loss —
 * only `L`, the chain, the call's `P` and the guard penalty do.
 *
 * Crew forgiveness can remove the miss entirely: at rank ≥ 1 the miss rung is forgiven to a paying
 * rung, so there is no loss. `missFor` returns 0 in that case rather than letting a caller
 * double-count — use `settle()` to route an outcome without thinking about it.
 * @param {Target} target
 * @param {number|{id:number}} call
 * @param {number} chain
 * @param {number} loose              LOOSE before this target (the loss is capped by it)
 * @param {number} [crew=0]
 * @returns {number} Δloose, ≤ 0
 */
export function missFor(target, call, chain, loose, crew = 0) {
  if (!isMiss(MISS_RUNG, crew)) return 0;
  const { P } = carryOf(call);
  const raw = lootFor(target) * chainMult(chain) * P * wingPen(target?.guarded) * x2Mult(target?.x2) * num(target?.mult, 1);
  const loss = Math.min(Math.max(0, num(loose)), round(raw));
  return loss === 0 ? 0 : -loss;        // never `-0`: this number is serialised into the save
}

/** LOOSE floors at 0 (G1 "The two piles"). There is no state in which the game takes what you earned. */
export function applyDelta(loose, delta) {
  return Math.max(0, num(loose) + num(delta));
}

/**
 * Route one answered target to its branch and its chain transition.
 * @param {Target & {call?: number, rung?: number, crew?: number, idle?: boolean, shielded?: boolean}} target
 * @param {number} chain  the chain BEFORE this target
 * @param {number} loose  LOOSE before this target
 * @returns {{kind: 'carry'|'miss'|'free', delta: number, loose: number, chain: number, rho: number}}
 */
export function settle(target = {}, chain = 0, loose = 0) {
  // `almost` / `malformed` are FREE: no rung, no payout, no chain change (G1, Global law 2).
  if (target.free === true) return { kind: 'free', delta: 0, loose: Math.max(0, num(loose)), chain: Math.max(0, Math.trunc(num(chain))), rho: null };
  const crew = target.idle ? 0 : Math.trunc(num(target.crew));
  const rung = Math.trunc(num(target.rung));
  const call = target.call ?? 50;
  const rho = rhoFor(rung, crew);
  if (rho === 0) {
    // A Backcheck shields the STAKE and only the stake (G2): the chain holds and LOOSE is not taken.
    const delta = target.shielded ? 0 : missFor(target, call, chain, loose, crew);
    const after = target.shielded ? chain : chainAfterTarget(rung, crew, chain, { idle: target.idle });
    return { kind: 'miss', delta, loose: applyDelta(loose, delta), chain: after, rho };
  }
  const delta = carryFor(target, call, chain, rung, crew);
  return { kind: 'carry', delta, loose: applyDelta(loose, delta), chain: chainAfterTarget(rung, crew, chain, { idle: target.idle }), rho };
}

/* ------------------------------------------------------------------ G2: banking */

/**
 * The mid-job bag fee — `0.10 of whatever you bag` (G2), as the integer the prompt prints.
 * `bagFee(s) + bagBank(s) === round(s)` always, so `bag 131 (fee 13)` → `bagged 118` adds up.
 */
export function bagFee(s) {
  return round(FEE * Math.max(0, num(s)));
}

/** What reaches BAGGED: `0.9·LOOSE`, expressed as `s − bagFee(s)` so the printed line adds up. */
export function bagBank(s) {
  const v = round(Math.max(0, num(s)));
  return v - bagFee(v);
}

/** The unrounded `0.9·LOOSE` of G2's `bag:` line, for anyone who wants it exact. */
export function bagBankExact(s) {
  return (1 - FEE) * Math.max(0, num(s));
}

/** Bagging at the getaway is FREE (G2 `fee = 0.10 of whatever you bag mid-job`). */
export function getawayBank(s) {
  return round(Math.max(0, num(s)));
}

/** A non-bag exit auto-banks 50 %; 22:00 and a bound COMMIT bank in full (G1, G5, G3.9). */
export function autoBank(s, kind = 'walk') {
  return round(Math.max(0, num(s)) * (AUTO_BAG[kind] ?? AUTO_BAG.walk));
}

/* ------------------------------------------------------------------ G2: the four chain transitions */

/**
 * The clear shapes `xp.comboTransition()` reads, one per rung — so the chain rules here are the
 * study layer's rules VERBATIM rather than a copy that can drift (G2 "Chain transitions are
 * xp.comboTransition() verbatim").
 */
const CLEAR_FOR_RUNG = Object.freeze([
  Object.freeze({ firstTry: true, hints: 0 }),                              // clean      → increment
  Object.freeze({ firstTry: true, hints: 1 }),                              // 1 hint     → hold
  Object.freeze({ firstTry: false, hints: 0 }),                             // attempt 2  → reset
  Object.freeze({ firstTry: false, hints: 0 }),                             // attempt 3  → reset
  Object.freeze({ firstTry: false, hints: 0, solutionShown: true }),         // miss       → reset
]);

/** The transition word `xp.comboTransition` gives this rung: 'increment' | 'hold' | 'reset'. */
export function transitionForRung(rung) {
  const r = clamp(Math.trunc(num(rung)), 0, CLEAR_FOR_RUNG.length - 1);
  return comboTransition(CLEAR_FOR_RUNG[r]);
}

/**
 * The chain after one answered target. `xp.comboTransition()` verbatim, plus ONE addition (G2):
 * a non-clean outcome on a **HELD** make at chain ≥ 3 HOLDS instead of resetting — and that hold is
 * suppressed on a due-review target, where the crew stands down (G12 #4).
 * @param {number} rung
 * @param {number} crewRank  0 bare · 1 STEADY · 2 HELD
 * @param {number} chain     the chain BEFORE this target
 * @param {{idle?: boolean}} [opts]  `idle: true` when this target is its make's own due review
 * @returns {number}
 */
export function chainAfterTarget(rung, crewRank, chain, opts = {}) {
  const c = Math.max(0, Math.trunc(num(chain)));
  const rank = opts?.idle ? 0 : Math.max(0, Math.trunc(num(crewRank)));
  const t = transitionForRung(rung);
  if (t === 'increment') return c + 1;
  if (t === 'hold') return c;
  if (rank >= 2 && c >= CHAIN.holdMinChain) return c;     // HELD's chain-hold
  return 0;
}

/**
 * The FOURTH chain transition, and the reason it is not `xp.comboTransition()`:
 * **BAG banks the pile and resets the chain to 0** (G2, G12 #3). The whole §3.2 threshold table
 * depends on it — it is the `m_chain = 1` term in the BAG branch.
 * @returns {0}
 */
export function chainAfterBag() {
  return 0;
}

/* ------------------------------------------------------------------ G3.2: push or bag */

/**
 * @typedef {object} PushState
 * @property {number} loose     `S` — LOOSE now
 * @property {number} chain     `c` — the chain now
 * @property {number} q         your clear probability on the next target
 * @property {Target} [target]  the next target — supplies the WHOLE price: `loot`/`tier` plus
 *                              `scope`, `tokens`/`guarded`/`rank`, `cold`, `tell`, `x2`, `mult`.
 *                              A flattened state (those fields set on the state itself) works too.
 *                              Passing only `L`/`tier` prices a BARE target, which is a different
 *                              threshold — see `gainLFor` / `lossLFor`.
 * @property {number} [L]       the next target's loot, overriding `target`
 * @property {number} [call]    the chosen call id (default 50)
 * @property {number|number[]|Record<number,number>} [rungs]  rung distribution → `ρ̄` (default 1)
 * @property {number} [crew]    the crew rank on the next target's make
 */

/**
 * The bare `L` a push/bag state names — `loot`/`tier`, times any `mult` folded into it.
 *
 * `carryFor` and `missFor` both end in `· num(target.mult, 1)` (G3.6's ×2 posting, and in the
 * debrief the ENTIRE realised pricing of a target: `screens/run.js realisedOrderOf` rebuilds each
 * one as `{loot: 1, scope: 1, cold: 1, …, mult: d/(ρ·m·W)}`, so the target's whole worth lives in
 * `mult`). Reading `loot`/`tier` alone therefore priced every debrief target at `L = 1`, which put
 * `isDeepPile` on the wrong branch and the printed `q*` up to 62 points out — and always biased
 * toward BAG.
 *
 * It is NOT the `L` either branch charges. Use `gainLFor` / `lossLFor`.
 */
const baseL = (s) => {
  const t = s?.target ?? s ?? {};
  const base = Number.isFinite(s?.L) ? s.L : lootFor(t);
  const mult = Number.isFinite(s?.mult) ? s.mult : num(t?.mult, 1);
  return base * mult;
};

/** The target a push/bag state describes: `state.target`, or the state itself when it is flattened. */
const stateTarget = (s) => s?.target ?? s ?? {};

/**
 * **The GAIN-side `L`** — everything `carryFor` multiplies that is not `ρ̄`, `m_chain` or `W`:
 * `L · scope · wing · cold · tell · ×2 · mult`.
 *
 * G2 gives the two branches DIFFERENT multiplier sets ("the asymmetry the spec authors
 * deliberately"), so a threshold built on one `L` cannot be the root of the app's own arithmetic.
 * Round 2 (econ-math) measured what that cost: on a T2 review that is cold, tagged and carrying two
 * tokens the printed `q*` was 0.628 against a true 0.288, and on the guarded wing the same number
 * was printed whether the miss cost 22 or 43 — the verdict flipped in 5 of 5 realistic states.
 * A bare target (no scope, no wing, no cold, no tell, no ×2) gives `gainLFor === lossLFor === L`,
 * which is why the published G3.2 table is unaffected.
 *
 * @param {PushState} state
 * @returns {number} the `L` the clear branch charges
 */
export function gainLFor(state = {}) {
  const t = stateTarget(state);
  return baseL(state) * scopeOf(t) * wingMult(t) * coldOf(t) * tellFor(t?.tell) * x2Mult(t?.x2);
}

/**
 * **The LOSS-side `L`** — everything `missFor` multiplies that is not `m_chain` or `P`:
 * `L · wing_pen · ×2 · mult`. `scope`, `wing`, `cold` and `tell` do NOT scale a loss (G2).
 *
 * It is **0 when the crew forgives the miss**, because `missFor` charges nothing there: at rank ≥ 1
 * `rhoFor(MISS_RUNG, rank)` is a paying rung, so the (1−q) branch takes no LOOSE at all and PUSH
 * cannot lose to BAG. The threshold printed a loss the payout would never take.
 *
 * @param {PushState} state
 * @returns {number} the `L` the miss branch charges, before `min(LOOSE, ·)`
 */
export function lossLFor(state = {}) {
  if (!isMiss(MISS_RUNG, num(state?.crew))) return 0;      // crew forgiveness — `missFor` returns 0
  const t = stateTarget(state);
  return baseL(state) * wingPen(t?.guarded) * x2Mult(t?.x2);
}

const stateRho = (s) => rhoBarFor(s?.rungs ?? s?.rhoBar ?? null, num(s?.crew));

/**
 * G3.2 BAG-then-answer: `0.9S + q·L_gain·ρ̄·1·W` — the `1` is `m_chain` after the bag's chain reset.
 * `L_gain` is `gainLFor`, i.e. exactly what `carryFor` would pay on that target at `m = 1`.
 */
export function bagThenAnswer(state = {}) {
  const S = Math.max(0, num(state.loose));
  const { W } = carryOf(state.call ?? 50);
  const m = chainMult(chainAfterBag());                 // === 1, by construction
  return (1 - FEE) * S + num(state.q) * gainLFor(state) * stateRho(state) * m * W;
}

/**
 * G3.2 PUSH: `S + q·L_gain·ρ̄·m·W − (1−q)·min(S, L_loss·m·P)`.
 * One `L` per branch, because G2 gives the two branches different multiplier sets — see `gainLFor`.
 */
export function pushThrough(state = {}) {
  const S = Math.max(0, num(state.loose));
  const q = num(state.q);
  const { W, P } = carryOf(state.call ?? 50);
  const m = chainMult(state.chain);
  return S + q * gainLFor(state) * stateRho(state) * m * W
    - (1 - q) * Math.min(S, lossLFor(state) * m * P);
}

/**
 * G3.2: `PUSH − BAG = 0.10·S + q·L_gain·ρ̄·W·(m − 1) − (1 − q)·min(S, L_loss·m·P)`.
 * Positive ⟹ PUSH. Identical to `pushThrough(state) − bagThenAnswer(state)` (asserted in the tests),
 * and the BAG branch is where `m = 1` comes from.
 */
export function pushMinusBag(state = {}) {
  const S = Math.max(0, num(state.loose));
  const q = num(state.q);
  const { W, P } = carryOf(state.call ?? 50);
  const m = chainMult(state.chain);
  return FEE * S + q * gainLFor(state) * stateRho(state) * W * (m - 1)
    - (1 - q) * Math.min(S, lossLFor(state) * m * P);
}

/**
 * Is this a DEEP pile? `S ≥ L_loss·m·P` — the loss is not truncated by the pile. The `L` here is the
 * MISS branch's own (`wing_pen`, `×2`), because it is the loss the pile has to be able to pay.
 */
export function isDeepPile(state = {}) {
  const S = Math.max(0, num(state.loose));
  const { P } = carryOf(state.call ?? 50);
  return S >= lossLFor(state) * chainMult(state.chain) * P;
}

/**
 * G3.2 deep-pile threshold, the clean asymptotic form (the fee term dropped):
 * `θ* = m·P / (ρ̄·W·(m − 1))`, `q* = θ* / (1 + θ*)`.
 * At `m = 1` the denominator is 0 and `q* = 1`: with no chain, dropping the fee means pushing never
 * pays. The published G3.2 table is exactly this function at `ρ̄ = 1`.
 *
 * **This is the published TABLE's form, not the number the app prints.** Dropping `0.10·S` drops the
 * term that DOMINATES a deep pile — the pile is deep precisely when `S` is large — so this function
 * disagrees in sign with `pushMinusBag` across most of the realistic grid (worst case: `m = 1`,
 * where it returns 1, "you would need certainty", in states where pushing strictly dominates).
 * G3.2's own parenthesis settles which one goes on screen: *"the app computes `ρ̄` per target from
 * your own rung distribution and prints the TRUE threshold"*. `breakevenQ` is that true threshold.
 */
export function deepQStar(state = {}) {
  const { W, P } = carryOf(state.call ?? 50);
  const m = chainMult(state.chain);
  /* One L per branch (G2 gives them different multiplier sets). On a bare target the two are equal
     and the ratio cancels to G3.2's published `θ* = m·P / (ρ̄·W·(m−1))` — which is why the table is
     untouched — but on a guarded, cold or ×2 target they are not, and the table's form has to say so
     or it prints the same threshold for two different economies. */
  const numer = lossLFor(state) * m * P;
  const den = gainLFor(state) * stateRho(state) * W * (m - 1);
  if (!(den > 0)) return numer > 0 ? 1 : 0;
  const theta = numer / den;
  return clamp(theta / (1 + theta), 0, 1);
}

/**
 * G3.2 shallow-pile threshold, which keeps the fee: `q* = 0.9·S / ( L_gain·ρ̄·W·(m − 1) + S )`.
 * The loss truncates at `S`, so only the GAIN branch's `L` appears (`gainLFor`).
 * At `c = 0` this is exactly **0.9 regardless of L** — early, with a shallow pile and no chain, the
 * threshold is brutal and the stakes are trivial.
 *
 * **The escalation claim is a property of THIS function, and only of this function.** On a shallow
 * pile the chain lowers `q*` monotonically (0.900 → 0.143 at `S = 12`, `L = 18`, call 95) while the
 * amount at risk grows — G3.2's "the escalation runs the other way from a slot machine". It is NOT
 * a property of the number the app prints: `breakevenQ` takes the deep branch once `S ≥ L_loss·m·P`,
 * and there the fee term `0.10·S` is what a shallow chain is fighting, so `q*` RISES with the chain
 * (`S = 200`, `L = 18`, call 85: 0.444 → 0.506 over chains 0…8). Pinned in both directions in
 * `job-econ.test.mjs` §5, and scoped in COMPOSED-GAME.md G3.2. See notes/econ-fix.md round 2 #2.
 *
 * **And it is a COMPARATIVE STATIC — hold `S`, vary `c` (round 3).** Let the pile accumulate with the
 * chain instead, which is what playing a job does, and this function RISES: it is `0.9·S/(A + S)` and
 * `S` outruns `A = L_gain·ρ̄·W·(m−1)` once the chain is paying. Eight tier-1 clears at call 95 walk
 * `0.000 · 0.696 · 0.712 · 0.726 · 0.738 · 0.748 · 0.756 · 0.763` here, while the printed `q*` walks
 * `… 0.738 · 0.731 · 0.705 · 0.682` (non-monotone) and only `deepQStar` falls — trivially, since
 * `θ* = m·P/(ρ̄·W·(m−1))` never reads the pile. So "the threshold falls as the chain deepens" is true
 * of this function ONLY at a fixed pile, and of no number over a session. `job-econ.test.mjs` §5
 * pins all three walks; COMPOSED-GAME.md G3.2 states it; notes/econ-fix.md round 3 #1.
 */
export function shallowQStar(state = {}) {
  const S = Math.max(0, num(state.loose));
  if (!(S > 0)) return 0;
  const { W } = carryOf(state.call ?? 50);
  const A = gainLFor(state) * stateRho(state) * W * (chainMult(state.chain) - 1);
  return clamp(((1 - FEE) * S) / (A + S), 0, 1);
}

/**
 * **The BAG/PUSH threshold the app prints** — the exact root of `pushMinusBag`, fee included, in
 * both branches. Alias of `breakevenQExact`; it keeps its own name because it is the public "what
 * goes on screen and in the debrief" entry point (`screens/job.js thresholdRow`, `regretLine`).
 *
 * It used to branch to `deepQStar` on a deep pile, which prints G3.2's fee-free asymptotic form.
 * That made the screen contradict the app's own arithmetic in 61 % of deep states — and at `c = 0`
 * print `q* 1.00` where `pushMinusBag` says PUSH by 28 loot. G3.2 asks for the table's form in the
 * table and *"the true threshold"* on screen, so the two forms now live in two functions and only
 * one of them is printed. `deepQStar` / `shallowQStar` remain exported for the published table.
 *
 * Invariant, asserted over a grid in `job-econ.test.mjs`: `q ≥ breakevenQ(st) ⟹ pushMinusBag ≥ 0`.
 *
 * **Round 2 (econ-math) found the other half of the same defect.** "The true threshold" was still the
 * threshold of a DIFFERENT economy: the state's `L` was read as `loot · mult` and handed to both
 * branches, so `scope`, `wing`, `cold`, `tell` and the ×2 posting were missing from the gain and
 * `wing_pen` and the ×2 from the loss — the guarded wing printed the same `q*` whether the miss cost
 * 22 or 43, and the verdict flipped in 5 of 5 realistic states. The two `L`s are now `gainLFor` and
 * `lossLFor`, which are `carryFor`'s and `missFor`'s own factor lists, and `job-econ.test.mjs` §5
 * asserts this function is the root of a PUSH−BAG **rebuilt out of `carryFor`/`missFor`** rather than
 * out of a second copy of the model.
 *
 * It follows that this function is only as good as the target it is handed: a caller that picks four
 * fields off a priced target gets the threshold of a bare one. Pass the whole priced target (or set
 * it as `state.target`). See notes/econ-fix.md round 2 → Requests (`screens/job.js breakevenQOf`).
 */
export function breakevenQ(state = {}) {
  return breakevenQExact(state);
}

/**
 * The exact `q` at which `pushMinusBag(state) === 0`, fee included, in BOTH branches, with **one `L`
 * per branch** (`gainLFor` / `lossLFor` — G2 gives the clear and the miss different multiplier sets):
 *   deep    (`S ≥ L_loss·m·P`):  `q* = (L_loss·m·P − 0.10·S) / (L_gain·ρ̄·W·(m−1) + L_loss·m·P)`
 *   shallow (`S < L_loss·m·P`):  `q* = 0.9·S / (L_gain·ρ̄·W·(m−1) + S)`   — the published shallow form
 * It differs from `deepQStar` in the deep branch, where G3.2 deliberately drops the fee to get a
 * form that does not mention the pile. `breakevenQ` is an alias of this function.
 */
export function breakevenQExact(state = {}) {
  const S = Math.max(0, num(state.loose));
  const { W, P } = carryOf(state.call ?? 50);
  const m = chainMult(state.chain);
  const A = gainLFor(state) * stateRho(state) * W * (m - 1);
  const D = lossLFor(state) * m * P;
  if (S >= D) {
    if (!(A + D > 0)) return 0;
    return clamp((D - FEE * S) / (A + D), 0, 1);
  }
  if (!(A + S > 0)) return 0;
  return clamp(((1 - FEE) * S) / (A + S), 0, 1);
}

/** 'push' | 'bag' — what the threshold says at this state's own `q`. Evidence, never a pre-call nudge. */
export function pushOrBag(state = {}) {
  return pushMinusBag(state) > 0 ? 'push' : 'bag';
}

/* ------------------------------------------------------------------ G3.1's carry EV, AT A STATE */

/**
 * G3.1's carry EV for one call **at an actual game state**, in loot (not in G3.1's `L·ρ·m·scope·wing`
 * units): `q·L·ρ̄·m·W − (1−q)·min(S, L·m·P)`. Identical to `pushThrough(state) − S`, deliberately:
 * a second model of the same branch is how two suites end up disagreeing about it.
 *
 * **Why this exists, and the dominance hole it makes visible.** G3.1 publishes `EV = q·W − (1−q)·P`
 * and an argmax column (50 at `q = .50`, 95 at `q = .90`). That formula has no `min(LOOSE, ·)` in it,
 * so the table is **conditional on the pile being able to pay the loss** — `S ≥ L·m·P`, G3.2's deep
 * pile. It is not the ladder a player faces at `S = 0`. G2's miss branch is capped by LOOSE, and BAG
 * empties LOOSE, so **immediately after a bag every call's miss costs exactly 0** and the clear
 * branch is strictly increasing in `W`: the highest call the rank allows is weakly dominant at that
 * beat, at every skill level. Bag-every-beat turns CALL into "always pick the top rung".
 *
 * That hole is in G2's published `−min(LOOSE, …)` (G3.7 #4 keeps the cap on purpose — it is the only
 * Kelly-ish brake in the design), so it cannot be closed from this file without contradicting the
 * spec. What this file CAN do is refuse to launder it: `evMaxCallAt` is the argmax the student is
 * actually facing, `job-econ.test.mjs §3b` pins the hole so it can never be re-discovered as a
 * surprise, and `PUBLISHED.evTable` now carries its condition. See `notes/econ-fix.md` (round 1,
 * finding 4) for the spec change that would close it and the Request filed against J2's `call.js`.
 *
 * @param {PushState} state
 * @param {number|{id:number}} [call]  the call to price; defaults to the state's own
 */
export function carryEVAt(state = {}, call = state?.call ?? 50) {
  const s = { ...state, call };
  return pushThrough(s) - Math.max(0, num(s.loose));
}

/**
 * The call with the highest `carryEVAt` at this state. Ties break to the LOWER rung, exactly as
 * J2's `argmaxCall` does (notes/J1.md §5.4) — cowardice keeps its money and buys no rank.
 * @param {PushState} state
 * @param {(number|{id:number})[]} [calls]  the rungs on offer; default all four, ascending
 * @returns {{call: number|null, ev: number}}
 */
export function evMaxCallAt(state = {}, calls = CALL_LEVELS) {
  let bestId = null; let bestV = -Infinity;
  for (const c of calls) {
    const id = typeof c === 'object' && c ? c.id : c;
    const v = carryEVAt(state, id);
    if (v > bestV + 1e-12) { bestV = v; bestId = id; }
  }
  return { call: bestId, ev: bestV };
}

/* ------------------------------------------------------------------ G3.1: the stake band */

/**
 * `w = 4·q̂(1−q̂)` — the anti-farming weight. A call is INFORMATIVE iff `w ≥ 0.25`.
 * J2's `call.js` owns the public `weightFor`; this exists because the stake band is a J1 criterion.
 */
export function ratingWeight(qHat) {
  const q = clamp(num(qHat), 0, 1);
  return RATING.weightK * q * (1 - q);
}

/** `c(p, o) = 10 − 40(p − o)²` — the Brier credit for one realised outcome (o = 1 clear, 0 miss). */
export function creditFor(p, ok) {
  const o = ok ? 1 : 0;
  return CREDIT.base - CREDIT.k * (num(p) - o) ** 2;
}

/**
 * `E[c] = 10 − 40[ q(1−p)² + (1−q)p² ]`. Strictly proper: `dE/dp = 80[q(1−p) − (1−q)p] = 0 ⟺ p = q`,
 * second derivative −80 < 0, so truthful reporting is the unique maximiser.
 */
export function expectedCredit(p, q) {
  const pp = num(p); const qq = num(q);
  return CREDIT.base - CREDIT.k * (qq * (1 - pp) ** 2 + (1 - qq) * pp ** 2);
}

/**
 * The honest DISCRETE rung at `q̂`: the `CALL_LEVELS` entry maximising `expectedCredit(p, q̂)`.
 * Computed, not thresholded — which is why it reproduces the published rating indifference points
 * 0.600 / 0.775 / 0.900 exactly. Ties go to the lower rung.
 * @returns {{id:number, p:number, W:number, P:number}}
 */
export function honestRung(qHat) {
  let best = CALL_LEVELS[0];
  let bestV = -Infinity;
  for (const lvl of CALL_LEVELS) {
    const v = expectedCredit(lvl.p, qHat);
    if (v > bestV + 1e-12) { bestV = v; best = lvl; }
  }
  return best;
}

/**
 * `w·E[c]` at a truthful CONTINUOUS report `p = q̂`:  `4q̂(1−q̂)·(10 − 40q̂(1−q̂)) = 40u − 160u²`
 * for `u = q̂(1−q̂)`. This is the object G3.1 point 2 publishes: peak at `q̂ = 0.854` (`u = 0.125`),
 * value 2.50, ≥80 %-of-peak band `[0.763, 0.925]`.
 */
export function wTimesEc(qHat) {
  return ratingWeight(qHat) * expectedCredit(qHat, qHat);
}

/**
 * `w·E[c]` on the DISCRETE four-rung ladder — the honest rung's `p`, not `q̂` itself. This is the
 * object G3.1's "Sanity" table is computed on: at `q̂ = 0.80` the honest rung is 85, so `E[c] = 3.5`
 * and `w·E[c] = 2.240` — NOT the continuous 2.304. Both objects ship; neither is "corrected".
 */
export function wTimesEcDiscrete(qHat) {
  return ratingWeight(qHat) * expectedCredit(honestRung(qHat).p, qHat);
}

/**
 * The domain the game stakes anything on: `q̂ ∈ [0.5, 1]` (G3.8 states the restriction explicitly —
 * `4q̂(1−q̂)` is monotone only there, and below `q̂ = 0.5` the composer serves a card as `new`/`weak`
 * with hints on rather than as a stake). Both `wTimesEc` objects are symmetric about `q̂ = 0.5`, so
 * the peak and the band are searched on this domain and nowhere else.
 */
export const STAKE_DOMAIN = Object.freeze([0.5, 1]);

const fnFor = (discrete) => (discrete ? wTimesEcDiscrete : wTimesEc);

/**
 * The peak of `w·E[c]` on `STAKE_DOMAIN`, by grid search then ternary refinement.
 * @param {{discrete?: boolean, steps?: number}} [opts]
 * @returns {{qHat: number, value: number}}
 */
export function stakePeak({ discrete = false, steps = 20000 } = {}) {
  const f = fnFor(discrete);
  const [lo0, hi0] = STAKE_DOMAIN;
  let bq = lo0; let bv = -Infinity;
  for (let i = 0; i <= steps; i++) {
    const q = lo0 + ((hi0 - lo0) * i) / steps;
    const v = f(q);
    if (v > bv) { bv = v; bq = q; }
  }
  // ternary-search refine inside the winning cell (the function is single-peaked on the domain)
  const h = (hi0 - lo0) / steps;
  let lo = Math.max(lo0, bq - h); let hi = Math.min(hi0, bq + h);
  for (let i = 0; i < 200 && hi - lo > 1e-12; i++) {
    const a = lo + (hi - lo) / 3; const b = hi - (hi - lo) / 3;
    if (f(a) < f(b)) lo = a; else hi = b;
  }
  const q = (lo + hi) / 2;
  return { qHat: q, value: f(q) };
}

/**
 * The band of `q̂` holding at least `frac` of the peak of `w·E[c]`, on `STAKE_DOMAIN`.
 * `stakeBand()` is `[0.763, 0.925]` — "material you have just learned and are still fumbling one
 * time in six", the desirable-difficulty band, and the band the app names.
 * @param {number} [frac=0.8]
 * @param {{discrete?: boolean}} [opts]
 * @returns {[number, number]}
 */
export function stakeBand(frac = 0.8, { discrete = false } = {}) {
  const f = fnFor(discrete);
  const { qHat: peakQ, value: peakV } = stakePeak({ discrete });
  const thr = frac * peakV;
  const [lo0, hi0] = STAKE_DOMAIN;
  const bisect = (a, b) => {           // f(a) and f(b) straddle `thr`; f is monotone between them
    let x = a; let y = b;
    for (let i = 0; i < 200 && Math.abs(y - x) > 1e-12; i++) {
      const mid = (x + y) / 2;
      if ((f(x) - thr) * (f(mid) - thr) <= 0) y = mid; else x = mid;
    }
    return (x + y) / 2;
  };
  const lo = f(lo0) >= thr ? lo0 : bisect(lo0, peakQ);
  const hi = f(hi0) >= thr ? hi0 : bisect(hi0, peakQ);
  return [lo, hi];
}

/** Is this call informative — `w ≥ 0.25`? Only informative calls enter the rating window (G3.1). */
export function isInformative(qHat) {
  return ratingWeight(qHat) >= RATING.informativeMin;
}

/* ------------------------------------------------------------------ G5 #2: the regret line */

/**
 * @typedef {object} OrderTarget
 * @property {number} rung   the realised rung (0..4)
 * @property {number} [call] the call the student locked
 * @property {number} [crew] the crew rank on this make
 * @property {boolean} [idle] this target is its make's own due review
 * @property {boolean} [shielded] a Backcheck was spent on this miss
 * @property {number} [qHat] the student's own q̂ on this make, for the printed line
 * @property {number} [tier] / {number} [loot] / … — every `Target` field, for pricing
 *
 * @typedef {object} Order
 * @property {OrderTarget[]} targets
 * @property {('bag'|'push')[]} [decisions]  one per target except the last (the getaway auto-bags);
 *                                           a decision for the last target is ignored
 * @property {boolean} [completion]  every drafted target was answered → +10 % on BAGGED
 * @property {boolean} [commit]      a bound declaration was honoured → +8 % on BAGGED
 */

const MAX_BRUTE_TARGETS = 20;   // 2^19 = 524 288 vectors; a job is at most 12 targets

/** Apply the end-of-job bonuses G2/G3.9 name, in the order the debrief prints them. */
function withBonuses(bagged, order) {
  let out = bagged;
  if (order?.completion) out *= 1 + COMPLETION;
  if (order?.commit) out *= 1 + COMMIT_BONUS;
  return out;
}

/**
 * Replay a realised order under a given BAG/PUSH vector and return the final BAGGED.
 * The outcomes are realised, so this is deterministic: the only freedom is where you banked.
 * @param {Order} order
 * @param {('bag'|'push')[]} decisions
 * @returns {number}
 */
export function playOrder(order, decisions = []) {
  const targets = order?.targets ?? [];
  let loose = 0; let bagged = 0; let chain = 0;
  for (let i = 0; i < targets.length; i++) {
    const s = settle(targets[i], chain, loose);
    loose = s.loose; chain = s.chain;
    const last = i === targets.length - 1;
    if (!last && decisions[i] === 'bag') {
      bagged += bagBank(loose);
      loose = 0;
      chain = chainAfterBag();
    }
  }
  bagged += getawayBank(loose);          // the getaway bag is free
  return withBonuses(bagged, order);
}

/**
 * The best BAGGED reachable on this realised order, by exhaustive search over every BAG/PUSH vector.
 * Path-dependent (a miss is capped by the pile, a chain multiplies the next clear), so there is no
 * greedy shortcut — and for `n ≤ 12` there are at most 2 048 vectors.
 *
 * Several vectors are often equally optimal. `prefer` (the student's realised decisions) breaks the
 * tie towards the optimal line that agrees with them for the LONGEST prefix, so `regretLine`'s
 * reported beat is genuinely the first beat at which optimal play was no longer possible.
 * @param {Order} order
 * @param {{prefer?: ('bag'|'push')[]}} [opts]
 * @returns {{value: number, decisions: ('bag'|'push')[]}}
 */
export function optimalOrder(order, { prefer } = {}) {
  const n = order?.targets?.length ?? 0;
  const beats = Math.max(0, n - 1);
  if (n > MAX_BRUTE_TARGETS) throw new RangeError(`optimalOrder: ${n} targets exceeds the ${MAX_BRUTE_TARGETS}-target brute-force bound`);
  const vectors = [];
  let bestV = -Infinity;
  for (let mask = 0; mask < 2 ** beats; mask++) {
    const d = [];
    for (let i = 0; i < beats; i++) d.push((mask >> i) & 1 ? 'bag' : 'push');
    const v = playOrder(order, d);
    vectors.push([v, d]);
    if (v > bestV) bestV = v;
  }
  const optimal = vectors.filter(([v]) => v >= bestV - 1e-9).map(([, d]) => d);
  if (!prefer) return { value: bestV, decisions: optimal[0] ?? [] };
  let best = optimal[0] ?? []; let bestAgree = -1;
  for (const d of optimal) {
    let k = 0;
    while (k < beats && d[k] === prefer[k]) k++;
    if (k > bestAgree) { bestAgree = k; best = d; }
  }
  return { value: bestV, decisions: best };
}

/**
 * THE OTHER EXIT: **WALK at the getaway.** Answer targets `0 … n−2` under some BAG/PUSH vector, then
 * bank LOOSE at FULL value and leave the last target due — no completion bonus, because targets
 * remain (`state.endJob`). `-Infinity`-shaped `null` for a one-target job, which has no getaway beat
 * at all (`state.js advance()`).
 *
 * `optimalOrder` deliberately models only the CRACK line: G5 #2's regret line is the BAG/PUSH regret
 * *within the line the student actually took*, and mixing the two exits into one "optimum" would
 * print a cost for a decision the bag/push copy cannot name. This function is the walk half, shipped
 * here rather than re-derived by whoever needs it (notes/J9.md §5 → J1, open issue 3: it was a
 * 14-line private reference in `tests/job-monotone.test.mjs`, and a second model of the economy is
 * how two suites end up disagreeing about it). The returned `decisions` is the bag/push vector for
 * beats `0 … n−3` with `'walk'` in the getaway beat, so it reads on the same axis as
 * `optimalOrder().decisions`.
 *
 * @param {Order} order
 * @returns {{value: number, decisions: ('bag'|'push'|'walk')[]}|null}
 */
export function walkOrder(order) {
  const targets = order?.targets ?? [];
  const n = targets.length;
  if (n < 2) return null;
  const beats = n - 2;
  if (beats > MAX_BRUTE_TARGETS) throw new RangeError(`walkOrder: ${n} targets exceeds the ${MAX_BRUTE_TARGETS}-target brute-force bound`);
  let best = -Infinity; let bestD = null;
  for (let mask = 0; mask < 2 ** beats; mask++) {
    const d = Array.from({ length: beats }, (_, i) => ((mask >> i) & 1 ? 'bag' : 'push'));
    let loose = 0; let bagged = 0; let chain = 0;
    for (let i = 0; i < n - 1; i++) {
      const st = settle(targets[i], chain, loose);
      loose = st.loose; chain = st.chain;
      if (i < beats && d[i] === 'bag') { bagged += bagBank(loose); loose = 0; chain = chainAfterBag(); }
    }
    const v = bagged + getawayBank(loose);        // the getaway bag is free, and WALK banks in full
    if (v > best) { best = v; bestD = [...d, 'walk']; }
  }
  return { value: best, decisions: bestD };
}

/**
 * G5 #2 — the debrief's regret line for BAG/PUSH: the solver's optimal line against yours.
 *
 * SCOPE (notes/J9.md open issue 3): `optimal` here is the best CRACKED line, because that is the
 * line the student took and the one `COPY.regret` can name a beat in. Where walking would have paid
 * more — common when the last target is a tier-4 at a high call — `walkOrder(order).value` is the
 * bigger number, and this `cost` is therefore an upper bound on the bag/push regret rather than the
 * regret over every exit. Both are pure; neither is hindsight beyond the order that happened.
 * `you bagged at chain 4; the threshold said push (q* 0.49, your q̂ 0.62). cost 31.`
 *
 * Pure information, computed from the realised order: no randomness, no hindsight beyond the order
 * that actually happened, and it appears only AFTER the decisions (Global law 6).
 *
 * **TWO MODELS, and which one each half of the sentence comes from.** `optimalOrder` is an exhaustive
 * replay over the *realised rungs* — hindsight. `pushMinusBag` is the ex-ante threshold the student
 * had in front of them at the beat. They are different economies and they can disagree. The copy
 * says "**the threshold** said push" and then prints that threshold's own `q*` next to the student's
 * `q̂`, so `said` and `qStar` MUST both come out of `pushMinusBag` at the same state: taking `said`
 * from the solver printed lines that refute themselves in one sentence
 * (`the threshold said push (q* 1.00, your q̂ 0.62)`). So:
 *   · `said` / `qStar` / `chain` / `qHat`  — the THRESHOLD, at the beat's own state.
 *   · `cost` / `optimal` / `best`          — the SOLVER, over the whole realised order.
 *   · `at`   — the first beat where the student OVERRODE the threshold. `solverAt` keeps the solver's
 *              own first divergence, so the two are visible rather than silently merged.
 *
 * Two beats are deliberately unnameable, and the debrief then prints nothing rather than something it
 * cannot back: a beat with no recorded `q̂` (there is no threshold verdict without one), and every
 * beat of a line that cost nothing (`cost ≤ 0` — you were unlucky, not wrong).
 *
 * @param {Order} order
 * @returns {{actual: number, optimal: number, cost: number, best: ('bag'|'push')[], at: number|null,
 *            solverAt: number|null, did: 'bag'|'push'|null, said: 'bag'|'push'|null,
 *            chain: number|null, qStar: number|null, qHat: number|null, line: string}}
 */
export function regretLine(order) {
  const targets = order?.targets ?? [];
  const beats = Math.max(0, targets.length - 1);
  const did = (order?.decisions ?? []).slice(0, beats);
  while (did.length < beats) did.push('push');

  const actual = playOrder(order, did);
  const { value: optimal, decisions: best } = optimalOrder(order, { prefer: did });
  const cost = optimal - actual;

  // Replay the student's OWN line once, and at every beat ask the threshold the same question the
  // student was asked. The state a beat is decided at is the state AFTER that target settled and
  // BEFORE the decision is applied, so the bag is carried into the next iteration, not this one.
  const judged = [];
  {
    let loose = 0; let chain = 0;
    for (let i = 0; i < beats; i++) {
      const s = settle(targets[i], chain, loose);
      loose = s.loose; chain = s.chain;
      const next = targets[i + 1] ?? {};
      const qHat = Number.isFinite(next.qHat) ? next.qHat : null;
      const st = { ...next, loose, chain, call: next.call ?? 50, q: num(qHat, 0), crew: num(next.crew), rungs: next.rungs };
      judged.push({
        chain,
        qHat,
        qStar: qHat == null ? null : breakevenQ(st),
        said: qHat == null ? null : pushOrBag(st),
      });
      if (did[i] === 'bag') { loose = 0; chain = chainAfterBag(); }
    }
  }

  // The solver's own first divergence — reported, never printed as "the threshold".
  let solverAt = null;
  if (cost > 1e-9) for (let i = 0; i < beats; i++) if (did[i] !== best[i]) { solverAt = i; break; }

  // The beat the line names: the first one the student took AGAINST the threshold, on a line that
  // actually cost money. Played optimally, there is no regret line and the debrief prints none.
  let at = null;
  if (cost > 1e-9) for (let i = 0; i < beats; i++) if (judged[i].said != null && judged[i].said !== did[i]) { at = i; break; }

  const chainAt = at == null ? null : judged[at].chain;
  const qStar = at == null ? null : judged[at].qStar;
  const qHatAt = at == null ? null : judged[at].qHat;

  const line = at == null
    ? ''
    : COPY.regret({
      did: did[at] === 'bag' ? 'bagged' : 'pushed',
      chain: chainAt,
      said: judged[at].said,
      qStar: qStar.toFixed(2),
      qHat: qHatAt == null ? '—' : qHatAt.toFixed(2),
      cost: round(cost),
    });

  return {
    actual, optimal, cost, best, at, solverAt,
    did: at == null ? null : did[at],
    said: at == null ? null : judged[at].said,
    chain: chainAt, qStar, qHat: qHatAt, line,
  };
}

/* ------------------------------------------------------------------ G2 / G1: the published tables, recomputed */

/** `loot per answer minute` for a tier — G2's first row: 12.0 / 12.0 / 12.7 / 14.0. */
export function lootPerAnswerMinute(tier) {
  const t = clamp(Math.trunc(num(tier, 1)), 1, 4);
  return LOOT[t] / ANSWER_MINUTES_PER_TIER[t];
}

/**
 * `loot per minute as experienced` — answer minutes PLUS that tier's decision seconds. G2's second
 * row, the one the student actually lives: 8.2 / 9.5 / 10.9 / 12.5.
 */
export function lootPerExperiencedMinute(tier) {
  const t = clamp(Math.trunc(num(tier, 1)), 1, 4);
  return LOOT[t] / (ANSWER_MINUTES_PER_TIER[t] + DECISION_SECONDS[t] / 60);
}

/**
 * Both published rows, T1..T4, rounded to one decimal place the way G2 prints them.
 * Both are monotone non-decreasing in tier, so hard work is never the worse deal per minute — the
 * single most important number in the economy, and it is COMPUTED from the shipped constants.
 */
export function lootPerMinuteRows() {
  const answer = [1, 2, 3, 4].map((t) => round(lootPerAnswerMinute(t), 1));
  const experienced = [1, 2, 3, 4].map((t) => round(lootPerExperiencedMinute(t), 1));
  return { answer, experienced };
}

const shapeOf = (shape) => (typeof shape === 'string' ? SHAPES[shape] : shape);

/**
 * The brief windows a shape can ACTUALLY serve — `min(briefs, |{n ∈ BOARD.briefAfterTargets : n < targets}|)`.
 *
 * `state.js push()` opens a window when `BOARD.briefAfterTargets.includes(done)`, and the target
 * where `left === 1` goes to the getaway instead of the next envelope, so a window at `n ≥ targets`
 * is never reached. `BOARD.briefAfterTargets` is `[4, 8]` and **VAULT is 7 targets**: its second
 * window falls after a target that shape does not have. Every published VAULT number that multiplied
 * by `SHAPES.VAULT.briefs = 2` was therefore charging the student for a surface they can never see —
 * `decisionCount` said 18 mandatory where a completed VAULT produces 17, and `screens/run.js` prints
 * both numbers in one line ("17 … 18 mandatory"), which reads as a decision skipped.
 *
 * `board.js projectFor` already clamps exactly this way, so the board and the published table used to
 * disagree with each other by construction. This is that clamp, in the one place that owns it.
 *
 * @param {string|object} shape
 * @returns {number}
 */
export function landedBriefs(shape) {
  const s = shapeOf(shape);
  const want = Math.max(0, Math.trunc(num(s?.briefs, 0)));
  const targets = Math.max(0, Math.trunc(num(s?.targets, 0)));
  const reachable = (BOARD?.briefAfterTargets ?? []).filter((n) => num(n, Infinity) < targets).length;
  return Math.min(want, reachable);
}

/** `L̄` — the shape's average loot per target (G2's four `L̄` values). */
export function lootMean(shape) {
  const s = shapeOf(shape);
  let acc = 0;
  for (const [tier, n] of Object.entries(s.tierMix)) acc += n * LOOT[tier];
  return acc / s.targets;
}

/** The shape's answer seconds, from `LIMITS.minutesPerTier` and the tier mix. */
export function answerSeconds(shape) {
  const s = shapeOf(shape);
  let acc = 0;
  for (const [tier, n] of Object.entries(s.tierMix)) acc += n * ANSWER_MINUTES_PER_TIER[tier] * 60;
  return acc;
}

/** The shape's per-target decision seconds, from `DECISION_SECONDS` and the tier mix. */
export function decisionSeconds(shape) {
  const s = shapeOf(shape);
  let acc = 0;
  for (const [tier, n] of Object.entries(s.tierMix)) acc += n * DECISION_SECONDS[tier];
  return acc;
}

/**
 * The shape's FIXED phase seconds on a path. Summed from the phases (`brief` × the windows the shape
 * can actually serve — `landedBriefs`, NOT its nominal `briefs`) where G1 publishes them; the
 * published total otherwise — which today is exactly one cell, `RUN.full`, where G1 prints 130 s
 * without its per-phase split.
 * @param {string|object} shape
 * @param {'default'|'full'} [path='default']
 */
export function fixedSeconds(shape, path = 'default') {
  const s = shapeOf(shape);
  const cell = FIXED_PHASES[s.fixed][path];
  const p = cell.phases;
  if (!p) return cell.total;
  return p.board + p.guard + p.brief * landedBriefs(s) + p.getaway + p.debrief + p.crew;
}

/**
 * One row of G1's shape table, every field recomputed: `game s = fixed + per-target`,
 * `wall clock = answer s + game s`, `split = game s / wall clock`.
 *
 * **NOMINAL.** Every field is a function of `SHAPES[id].tierMix`, which is a design-time budget, not
 * a description of a draft — `composeBundles` takes `budget.targets` of whatever `composePage` had
 * due, at whatever tiers those are. On the 50-save corpus a posted JOB runs a median 17.4 min at
 * 30 % game against this function's 12:20 at 43.2 %. `PUBLISHED.shapeTableDrafted` is the measured
 * row and `tests/job-shape-measured.test.mjs` owns the comparison. Callers that want "how long is
 * tonight's job" must use `board.js projectFor` (the drafted queue), never this. (Round 3.)
 *
 * The `split` here also uses the TABLE's basis — the debrief read inside `gameS`. The board and the
 * debrief headline put it in neither term (G1 statement 2); `PUBLISHED.nominalHeadlineSplit` is the
 * same four rows on that basis, 5–6 points lower.
 * @param {string|object} shape
 * @returns {{id:string, targets:number, answerS:number, decisionS:number, lootMean:number,
 *            gameS:{default:number, full:number}, wallS:{default:number, full:number},
 *            split:{default:number, full:number}}}
 */
export function shapeTable(shape) {
  const s = shapeOf(shape);
  const answerS = answerSeconds(s);
  const decisionS = decisionSeconds(s);
  const gameS = { default: fixedSeconds(s, 'default') + decisionS, full: fixedSeconds(s, 'full') + decisionS };
  const wallS = { default: answerS + gameS.default, full: answerS + gameS.full };
  return {
    id: s.id,
    targets: s.targets,
    answerS,
    decisionS,
    lootMean: lootMean(s),
    gameS,
    wallS,
    split: {
      default: round((100 * gameS.default) / wallS.default, 1),
      full: round((100 * gameS.full) / wallS.full, 1),
    },
  };
}

/**
 * G1's decision count — the mix-invariant version of the split claim.
 * mandatory = DRAFT + PRESS + CALL×targets + BAG/PUSH×(targets−1) + brief windows + getaway
 * full      = mandatory + (briefOptionsMax−1)×windows + COMMIT + Backcheck spends
 * For the JOB-10 shape that is 24 and 35.
 *
 * "Brief windows" is `landedBriefs(s)`, not `s.briefs`: VAULT's second window falls after target 8
 * of a 7-target shape and can never open, so publishing 2 charged a completed VAULT with a decision
 * it does not contain (18 published against 17 produced) — and the debrief prints the two numbers in
 * the same line. See `landedBriefs`.
 */
export function decisionCount(shape) {
  const s = shapeOf(shape);
  const briefs = landedBriefs(s);
  const mandatory = DECISIONS.draft + DECISIONS.press
    + DECISIONS.callPerTarget * s.targets
    + DECISIONS.bagPushPerTarget * (s.targets - DECISIONS.bagPushExcludesLast)
    + briefs
    + DECISIONS.getaway;
  const full = mandatory
    + (DECISIONS.briefOptionsMax - 1) * briefs
    + DECISIONS.commitFull + DECISIONS.backchecksFull;
  return { mandatory, full, perItem: { default: mandatory / s.targets, full: full / s.targets } };
}
