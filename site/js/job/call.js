// site/js/job/call.js — THE JOB: the Call ladder, the rating window and the rank (J2).
//
// AUTHORITY: COMPOSED-GAME.md G3.1 (the two ladders, the Brier credit, the anti-farming weight, the
// fixed-N window), G2 "Rank" (the five bands, the calls each unlocks), G3.7 #9 (call-tanking),
// G3.8 (the domain restriction). BUILD-POLICY.md overrides both.
//
// WHAT THIS FILE IS. One button row, two ladders. The CARRY ladder pays multipliers of
// `L·ρ·m·scope·wing` (`W` on a clear, `P` on a miss); the RATING ladder pays a Brier credit
// `c(p, o) = 10 − 40(p − o)²`. The carry ladder is strictly increasing in `q`; the rating ladder is
// strictly PROPER — `dE/dp = 80[q(1−p) − (1−q)p]` is zero only at `p = q` and `d²E/dp² = −80 < 0`, so
// truthful reporting is the unique maximiser. The two disagree in exactly two slivers of `q`
// (`disagreementBands()`, 2.04 percentage points wide in total), which is the only place in the game
// where the student must choose what they are playing for.
//
// ┌─────────────────────────────────────────────────────────────────────────────────────────────┐
// │ ONE EVENT. The Call is a forecast of exactly one thing: **will this target CLEAR** — i.e.    │
// │ `result.cleared === true`, any rung above MISS, within the three attempts the run gives you. │
// │ That single event has to appear in all three places or the rule is not proper in anything    │
// │ the student can see:                                                                         │
// │   · `o` in `c(p, o)`      — written by `state.applyTarget` as `result?.cleared === true`.     │
// │   · `q̂` in `w = 4q̂(1−q̂)` — `qHatDetail` below: the CLEAR rate over the trailing 10 sittings. │
// │   · the honest report     — `honestCall(q̂)`, the debrief regret line, Settings' EV table.    │
// │ It did NOT before. `q̂` used to be the FIRST-TRY rate (`e.ok ∧ e.attempt ≤ 1`) while the      │
// │ credit was paid on CLEARING, so `w`, the informative gate, the envelope's evidence line and   │
// │ `honestCall` all spoke about a different random variable from the one `c(p, o)` scored. The   │
// │ consequences were not cosmetic: on the shipped `RUNG_BANDS` the gap is 0.94 vs 0.99 (m85),    │
// │ 0.71 vs 0.92 (m60) and 0.50 vs 0.81 (m40), so calling 95 on "q̂ = 0.5" material scored +9.9 a  │
// │ slot instead of the 0.0 the ladder intends, every honest window clamped at 10.00, `always 95` │
// │ strictly dominated the app's own honest call, and a farmer who fumbled one first attempt in   │
// │ ten walked to Called 5 in 29 calls on material they cleared 10 times out of 10.               │
// │ `histEntry` still parses `attempt` — deliberately, so that the field is visible and the next  │
// │ reader can see it is NOT used here. Reintroducing it re-opens all of the above.               │
// └─────────────────────────────────────────────────────────────────────────────────────────────┘
//
// ┌─────────────────────────────────────────────────────────────────────────────────────────────┐
// │ ONE CONTRACT A CALLER MUST KEEP, AND ONE THIS FILE NOW KEEPS FOR THEM (round 3).             │
// │ 1. THE WINDOW IS THE LAST FIFTY CALLS, not the last fifty informative ones. A call below the │
// │    gate is written as a BLANK SLOT (`p: null, w: 0`) and still displaces the oldest entry.    │
// │    `windowPush`'s banner has the three blockers that came of getting this wrong.              │
// │ 2. THE WEIGHT IS EXOGENOUS TO THE OUTCOME IT WEIGHS — BY DEFAULT, NOT BY ETIQUETTE.           │
// │    Round 2 wrote this half as a request to the caller: snapshot `q̂` at the lock and hand the  │
// │    number to `callEntry({ w })`. Round 3 measured what a request is worth. NOTHING in `site/` │
// │    ever passed `before:` — `grep -rn "before:" site/js` had no call site — so `q̂` was read    │
// │    back out of a save that already carried the sitting being scored, `w_clear ≠ w_miss`, the  │
// │    objective stopped being `w·E[c]`, and the optimum report fell to                           │
// │    `p* = q·w_clear/(q·w_clear + (1−q)·w_miss) < q`. Measured through the shipped pipeline:     │
// │    at a true `q = 0.80` the 70 call paid 1.389 against the honest 85's 1.100, and the lie was │
// │    worth +0.579 rating — a whole rank. A miss entered the fifty slots with probability 1 and  │
// │    a clear with probability 0.38 at `q = .95`, so the surviving sample was selected ON THE    │
// │    OUTCOME, which is the very defect `windowPush`'s banner claims to have closed.             │
// │    THE FIX IS HERE, not in a docblock: `qHatDetail` DEFAULTS its `before` cut to the instant  │
// │    of the sealed call it finds in the save (`sealedCallOf` — `state.lockCall`'s own           │
// │    `inProgress.game.locked.at`). A caller that has a seal gets the snapshot whether it asks   │
// │    for one or not; `before: null` is the explicit opt-out for a surface that really wants the │
// │    live rate. `job-call.test.mjs` §13/§14 pin both regimes AND drive the real                 │
// │    `state.startJob → lockCall → applyTarget` path to assert `w_clear === w_miss`.             │
// └─────────────────────────────────────────────────────────────────────────────────────────────┘
//
// NOTE, recorded in notes/J2.md §5.2 and FIXED at integration: `CALL_DISAGREEMENT_BANDS[0]` in
// `data/job.js` used to label its band `money: 85, rank: 70`; the ladders say the opposite there
// (carry EV prefers 70, the Brier prefers 85). The constant now carries the computed labels.
// `disagreementBands()` still COMPUTES both rather than reading them, so nothing downstream can ever
// inherit a mislabelled band again, and `job-call.test.mjs` asserts the two agree.
//
// ┌─────────────────────────────────────────────────────────────────────────────────────────────┐
// │ GLOBAL LAW 6 (G1): evidence before the decision; recommendation AFTER it.                   │
// │ `argmaxCall`, `honestCall`, `evTable`, `evMaxBands` and `regretOf` are SETTINGS-AND-DEBRIEF  │
// │ ONLY. They must never be reachable from a pre-call surface — printing the argmax rung on an  │
// │ envelope would score the student's obedience instead of their self-knowledge, and would make │
// │ the scoring rule a measure of button-following. The EV-max table lives in Settings as a      │
// │ static formula (it is attached to no target) and in the debrief's regret line. NOWHERE ELSE. │
// │ `tests/job-call.test.mjs` enforces this twice: it renders every pre-call copy template in    │
// │ `data/job.js` and greps it, and it allowlists the files that may reference these functions.  │
// └─────────────────────────────────────────────────────────────────────────────────────────────┘
//
// RULES FOR THIS FILE (BUILD-POLICY §2, G7 "every one under js/job/ is DOM-free and Node-testable")
//   · DOM-free and pure. No `document`, no `window`, no storage, no `Date.now()`, no `Math.random`.
//     Nothing here mutates its arguments: `windowPush` returns a NEW array.
//   · every constant comes from `../../data/job.js`. Not one numeral of either ladder, of the rating
//     formula or of the rank bands is restated here — `job-call.test.mjs` greps for them.
//   · `econ.js` carries `ratingWeight` / `creditFor` / `expectedCredit` / `honestRung` because the
//     stake band was a J1 acceptance criterion. THIS file is the public authority for the rating
//     pipeline; the suite asserts the two agree pointwise so they can never drift (notes/J1.md §7).
import {
  CALL_LEVELS, CARRY_LADDER, RATING_LADDER, CREDIT, RATING,
  RANKS, RANK_THRESHOLDS, RANK_MEAN_WC, CALL_INDIFFERENCE, CALL_DISAGREEMENT_BANDS, CAPS,
} from '../../data/job.js';

/* ------------------------------------------------------------------ small numeric helpers */

const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

/** Two floats that differ by less than this are a TIE, and a tie goes to the LOWER rung. */
const TIE = 1e-12;

/**
 * Round half-up, robust to binary representation (the same helper `econ.round` uses, and the suite
 * asserts the two agree on a grid). Only used to keep a stored `w` short — see `callEntry`.
 */
function round(x, dp = 0) {
  const f = 10 ** dp;
  const s = x < 0 ? -1 : 1;
  return (s * Math.round(Math.abs(x) * f + 1e-9)) / f;
}

/* ------------------------------------------------------------------ the four buttons */

/** G3.1 — the ladder itself, re-exported verbatim. Never rebuilt, never reordered. */
export { CALL_LEVELS };

/** The call ids in ladder order: `[50, 70, 85, 95]`. */
export const CALL_IDS = Object.freeze(CALL_LEVELS.map((c) => c.id));

/** G3.1 — a call is INFORMATIVE iff `w ≥ 0.25`. Only informative calls enter the rating window. */
export const INFORMATIVE_MIN = RATING.informativeMin;

/** G3.1 — `q̂` is the CLEAR rate on that make over the trailing 10 sittings (see "ONE EVENT"). */
export const QHAT_WINDOW = RATING.qHatWindow;

/** G3.1 — the rating window is a FIXED 50 slots. An unfilled slot contributes 0. */
export const WINDOW_N = RATING.N;

const BY_ID = new Map(CALL_LEVELS.map((c) => [c.id, c]));

/**
 * The `CALL_LEVELS` entry for a call, by id or by the entry itself. `null` for anything else — a
 * caller that made up a rung gets `null` rather than a silently invented ladder row.
 * @param {number|{id:number}|null} call
 * @returns {{id:number,label:string,p:number,W:number,P:number,creditClear:number,creditMiss:number,minRank:number,key:string}|null}
 */
export function callLevel(call) {
  if (call && typeof call === 'object' && Number.isFinite(call.id)) return BY_ID.get(call.id) ?? null;
  return BY_ID.get(num(call, NaN)) ?? null;
}

/** The carry pair `{W, P}` for a call — `CARRY_LADDER` verbatim. `null` for an unknown call. */
export function carryOf(call) {
  const lvl = callLevel(call);
  return lvl ? CARRY_LADDER[lvl.id] : null;
}

/** The published rating pair `{clear, miss}` for a call — `RATING_LADDER` verbatim. */
export function ratingPairOf(call) {
  const lvl = callLevel(call);
  return lvl ? RATING_LADDER[lvl.id] : null;
}

/** The calls a rank may make (G2 "Rank": 95 needs Called ≥ 3). */
export function callsFor(rank) {
  return rankOf(rank).calls;
}

/** May this rank make this call? The 95 rung is the ONLY thing rank gates besides loot. */
export function canCall(call, rank) {
  const lvl = callLevel(call);
  return !!lvl && rankOf(rank).rank >= lvl.minRank;
}

/* ------------------------------------------------------------------ G3.1: the rating ladder */

/**
 * `c(p, o) = 10 − 40(p − o)²` — the Brier credit for ONE realised outcome.
 * `o = 1` on a CLEAR (`result.cleared`, any rung above MISS), `0` on a miss. This is THE event of
 * the whole file — `q̂` measures it and `honestCall` reports it. At `p = 0.5` it is exactly 0 either
 * way, which is why calling 50 on everything scores exactly 5.00 (G3.7 #9).
 * @param {number} p  the called probability (the rung's own `p`, not `q̂`)
 * @param {boolean|number} ok  did the target clear
 */
export function credit(p, ok) {
  const o = ok ? 1 : 0;
  return CREDIT.base - CREDIT.k * (num(p) - o) ** 2;
}

/** The credit at a CALL's own `p` — identical to `RATING_LADDER[call]`, computed rather than read. */
export function creditOf(call, ok) {
  const lvl = callLevel(call);
  return lvl ? credit(lvl.p, ok) : 0;
}

/**
 * `E[c] = 10 − 40[ q(1−p)² + (1−q)p² ]`.
 * Strictly proper: `dE/dp = 80[q(1−p) − (1−q)p]`, zero only at `p = q`; `d²E/dp² = −80 < 0`.
 */
export function expectedCredit(p, q) {
  const pp = num(p); const qq = num(q);
  return CREDIT.base - CREDIT.k * (qq * (1 - pp) ** 2 + (1 - qq) * pp ** 2);
}

/** `dE/dp = 80[q(1−p) − (1−q)p]` — the propriety derivative, exported so the suite can check it. */
export function dExpectedCredit(p, q) {
  const pp = num(p); const qq = num(q);
  return 2 * CREDIT.k * (qq * (1 - pp) - (1 - qq) * pp);
}

/**
 * `w = 4·q̂(1−q̂)` — the anti-farming weight (G3.1). Peaks at `q̂ = 0.5` (leverage, not gain) and
 * collapses as you get good: `.8 → .64`, `.9 → .36`, `.933 → .25`, `.97 → .116`.
 * `q̂` is the CLEAR rate, so the collapse now lands where the design wanted it: on the shipped
 * `RUNG_BANDS` a mastered (m85) make clears 0.99 of the time → `w = 0.040`, below the gate and out
 * of the window; a consolidating m60 make clears 0.92 → `w = 0.294`, in; a weak m40 make clears
 * 0.81 → `w = 0.616`, in and near the `w·E[c]` peak. Farming is blocked by arithmetic rather than
 * by a knife-edge one fumbled first attempt wide.
 * A non-finite / missing `q̂` weighs 0, which is the honest reading: a make with no attempt history
 * cannot carry a calibration measurement, so its call is not informative.
 */
export function weightFor(qHat) {
  const q = clamp(num(qHat), 0, 1);
  return RATING.weightK * q * (1 - q);
}

/** Is a call on this `q̂` informative — `w ≥ 0.25`? Only informative calls enter the window. */
export function isInformative(qHat) {
  return weightFor(qHat) >= INFORMATIVE_MIN;
}

/**
 * The exact `q̂` band in which a call is informative: the roots of `k·q(1−q) = min`, i.e.
 * `q = [1 ± √(1 − 4·min/k)] / 2`. At `k = 4`, `min = 0.25` that is `[0.0669873, 0.9330127]`, which
 * is what G3.1's printed `[0.067, 0.933]` rounds to — and why `q̂ = 0.933` is (just) informative.
 * @returns {[number, number]}
 */
export function informativeBand(min = INFORMATIVE_MIN) {
  const disc = 1 - (4 * num(min)) / RATING.weightK;
  if (disc < 0) return [NaN, NaN];
  const root = Math.sqrt(disc);
  return [(1 - root) / 2, (1 + root) / 2];
}

/** The informative band, frozen: `[0.0669873…, 0.9330127…]`. */
export const INFORMATIVE_BAND = Object.freeze(informativeBand());

/* ------------------------------------------------------------------ G3.1: the carry ladder */

/** Carry EV for one call: `EV = q·W − (1−q)·P`, in units of `L·ρ·m·scope·wing`. */
export function evFor(q, call) {
  const c = carryOf(call);
  if (!c) return NaN;
  const qq = num(q);
  return qq * c.W - (1 - qq) * c.P;
}

/**
 * G3.1's carry-EV table at one `q`, keyed by call id.
 * SETTINGS-AND-DEBRIEF ONLY (Global law 6) — never render this next to an envelope.
 * @param {number} q
 * @returns {Record<number, number>}
 */
export function evTable(q) {
  const out = {};
  for (const lvl of CALL_LEVELS) out[lvl.id] = evFor(q, lvl.id);
  return out;
}

/**
 * The EV-max call at `q` — the argmax of the CARRY ladder.
 * SETTINGS-AND-DEBRIEF ONLY (Global law 6). See the banner at the top of this file.
 * Ties go to the LOWER rung (notes/J1.md §5.4), so the carry and rating regret lines agree about
 * every boundary: at `q = 3/5` the answer is 50, at `7/9` it is 70, at `15/17` it is 85.
 * @param {number} q
 * @param {{rank?: number, calls?: number[]}} [opts] restrict to the calls actually available
 * @returns {number} the call id
 */
export function argmaxCall(q, opts = {}) {
  return argmaxOver(CALL_LEVELS, (lvl) => evFor(q, lvl.id), opts);
}

/**
 * The honest call at `q̂` — the argmax of the RATING ladder, i.e. the discrete rung whose `p` is the
 * most truthful report available. Because the rule is proper this is simply the rung nearest `q̂` in
 * the `E[c]` sense, and its boundaries are the midpoints 0.600 / 0.775 / 0.900.
 *
 * `q̂` MUST be a probability of the event `c(p, o)` scores — P(this target clears). Hand it a
 * first-try rate and this function returns a rung that `always 95` strictly dominates, on both
 * currencies, which is what shipped. `qHatDetail` is the only supported source.
 * SETTINGS-AND-DEBRIEF ONLY (Global law 6) — it is a recommendation.
 * @returns {number} the call id
 */
export function honestCall(qHat, opts = {}) {
  return argmaxOver(CALL_LEVELS, (lvl) => expectedCredit(lvl.p, qHat), opts);
}

function argmaxOver(levels, score, opts = {}) {
  const allowed = Array.isArray(opts.calls)
    ? new Set(opts.calls.map((c) => callLevel(c)?.id).filter((id) => id != null))
    : opts.rank != null ? new Set(callsFor(opts.rank)) : null;
  let best = null; let bestV = -Infinity;
  for (const lvl of levels) {
    if (allowed && !allowed.has(lvl.id)) continue;
    const v = score(lvl);
    if (!Number.isFinite(v)) continue;
    if (v > bestV + TIE) { bestV = v; best = lvl; }   // strictly greater ⟹ ties keep the lower rung
  }
  return (best ?? CALL_LEVELS[0]).id;
}

/**
 * Carry indifference points, computed from `W`/`P` alone:
 * `EV_i = q(W_i + P_i) − P_i`, so `q* = (P_i − P_j) / [(W_i+P_i) − (W_j+P_j)]`.
 * Adjacent rungs give exactly `3/5`, `7/9`, `15/17` (G3.1).
 * @returns {number[]}
 */
export function carryIndifference() {
  const out = [];
  for (let i = 1; i < CALL_LEVELS.length; i++) {
    const a = CALL_LEVELS[i - 1]; const b = CALL_LEVELS[i];
    out.push((a.P - b.P) / ((a.W + a.P) - (b.W + b.P)));
  }
  return out;
}

/**
 * Rating indifference points. `E[c]` for a report `p` reduces to `q − 2qp + p²` up to constants, so
 * two rungs are indifferent exactly at the MIDPOINT of their two `p`s: 0.600 / 0.775 / 0.900.
 * @returns {number[]}
 */
export function ratingIndifference() {
  const out = [];
  for (let i = 1; i < CALL_LEVELS.length; i++) out.push((CALL_LEVELS[i - 1].p + CALL_LEVELS[i].p) / 2);
  return out;
}

/**
 * The two bands where money prefers the bolder call and rank prefers the honest one (G3.1), computed
 * from the two indifference lists rather than transcribed. Printed in Settings, never on an envelope.
 * @returns {{from:number,to:number,money:number,rank:number,widthPoints:number}[]}
 */
export function disagreementBands() {
  const carry = carryIndifference();
  const rating = ratingIndifference();
  const out = [];
  for (let i = 0; i < Math.min(carry.length, rating.length); i++) {
    const lo = Math.min(carry[i], rating[i]); const hi = Math.max(carry[i], rating[i]);
    if (hi - lo <= TIE) continue;
    const mid = (lo + hi) / 2;
    out.push({
      from: lo, to: hi, money: argmaxCall(mid), rank: honestCall(mid), widthPoints: (hi - lo) * 100,
    });
  }
  return out;
}

/**
 * The EV-max ladder as `q` bands, derived from `carryIndifference()`. `to` is INCLUSIVE, because a
 * tie goes to the lower rung. SETTINGS-ONLY (Global law 6).
 * @returns {{call:number, to:number}[]}
 */
export function evMaxBands() {
  const cuts = carryIndifference();
  return CALL_LEVELS.map((lvl, i) => ({ call: lvl.id, to: i < cuts.length ? cuts[i] : 1 }));
}

/**
 * ── THE ONE PRE-CALL SURFACE THIS FILE IS ALLOWED TO DESCRIBE ─────────────────────────────────
 * The coarsest honest partition of `q̂`: a band list whose cuts sit at the MIDPOINTS BETWEEN the
 * rung boundaries, so every band straddles exactly one boundary and therefore contains at least two
 * different answers on BOTH ladders. Knowing which band you are in never names a rung.
 *
 * This is the primitive `COPY.evidence` needs. Global law 6 is not "do not print the argmax": it is
 * "no pre-call surface may determine the argmax", and `your last 10 on FAC2: 8/10` determines it the
 * moment Settings prints a q̂→rung band list one tap away (notes/call-fix.md round 1 §4, round 2 §4).
 * A caller that prints `evidenceBandOf(q̂)`'s INDEX in its own words — this file holds no copy —
 * satisfies the condition `qHatDetail`'s docblock states, with no constant to invent and nothing to
 * keep in sync: move a rung's `p` and the bands move with it.
 *
 * Derived, never transcribed: cuts = the midpoints of consecutive `ratingIndifference()` points, and
 * the open ends are the ends of the probability scale. With the shipped ladder the boundaries are
 * 0.600 / 0.775 / 0.900 and the cuts land at 0.6875 / 0.8375 — one boundary strictly inside each of
 * the three bands, and `carryIndifference()`'s 0.600 / 0.778 / 0.882 inside them too.
 * @returns {{from:number, to:number}[]}  `to` exclusive, `from` inclusive; the last `to` is 1
 */
export function evidenceBands() {
  const cuts = ratingIndifference();
  const edges = [];
  for (let i = 1; i < cuts.length; i++) edges.push((cuts[i - 1] + cuts[i]) / 2);
  const out = [];
  let from = 0;
  for (const e of edges) { out.push({ from, to: e }); from = e; }
  out.push({ from, to: 1 });
  return out;
}

/** The index into `evidenceBands()` a `q̂` falls in, or `null` for no measurement. */
export function evidenceBandOf(qHat) {
  if (!Number.isFinite(qHat)) return null;
  const bands = evidenceBands();
  const q = clamp(qHat, 0, 1);
  for (let i = 0; i < bands.length; i++) if (q < bands[i].to) return i;
  return bands.length - 1;
}

/* ------------------------------------------------------------------ G3.1: the rating window */

/**
 * One `player.rating.calls[]` entry, in the save's own key order so two entries built from the same
 * outcome are byte-identical under `JSON.stringify` (J7's Backcheck criterion: a shielded miss must
 * write the same entry as an unshielded one — a Backcheck shields the STAKE and only the stake).
 * `w` is rounded to 6 dp to keep the entry inside G7's 63-byte-per-entry save budget.
 *
 * A NON-INFORMATIVE call (`w < 0.25`) is written as a BLANK SLOT: `p: null, w: 0`. It still takes a
 * slot — that is the whole of the round-2 window fix (`windowPush`) — and it pays exactly 0, so the
 * rung it was made at changes nothing it could be read for. Nulling `p` is not tidiness: every
 * consumer that means *informative calls* already selects on a finite `p` (`data/trophies.js`
 * `rollingBrier`, `screens/stats.js` `reliabilityBlock`, both documented as "the last 20 INFORMATIVE
 * calls"), and handing them a farmed `p = 0.95 / ok = true` row would have made the `calibrated`
 * trophy and the reliability diagram farmable by the exact material the gate exists to exclude.
 * @param {{p?:number, call?:number, ok?:boolean, qHat?:number, w?:number, skill?:string|null, at?:number|null}} o
 * @returns {{p:number|null, ok:boolean, w:number, skill:string|null, at:number|null}}
 */
export function callEntry(o = {}) {
  const lvl = o.call != null ? callLevel(o.call) : null;
  const p = lvl ? lvl.p : num(o.p);
  const w = round(Number.isFinite(o.w) ? clamp(o.w, 0, RATING.weightK / 4) : weightFor(o.qHat), 6);
  const blank = w < INFORMATIVE_MIN;
  return {
    p: blank ? null : p,
    ok: !!o.ok,
    w: blank ? 0 : w,
    skill: typeof o.skill === 'string' && o.skill ? o.skill : null,
    at: Number.isFinite(o.at) ? o.at : null,
  };
}

/**
 * Append a call to the rating window — the ONLY way a call should enter `player.rating.calls`.
 * Pure: returns a NEW array, capped at `CAPS.calls` with the newest kept.
 *
 * ┌─────────────────────────────────────────────────────────────────────────────────────────────┐
 * │ A SLOT IS A CALL, NOT AN INFORMATIVE CALL (round-2 blockers 2, 3 and 7).                     │
 * │ This used to `return list` unchanged when `w < 0.25`, so the fifty slots were the last fifty │
 * │ INFORMATIVE calls. Once fifty of those existed the window never had an empty slot again and  │
 * │ the "fixed" divisor silently became the count — which is a weighted MEAN, and a weighted     │
 * │ mean is invariant to the weights when every call is the same kind. Three consequences, all   │
 * │ measured (notes/call-fix.md round 2 §1):                                                     │
 * │   · a 0.99-clear farmer converged to 9.53 = Called 5, not to the 5.00 G3.1 publishes: 9.6 %  │
 * │     of their makes carry one miss in ten (q̂ = 0.9, w = 0.36, informative), and with nothing  │
 * │     else in the divisor those few calls WERE the rating.                                     │
 * │   · rank froze: nothing a mastered player did could evict a stale slot, because a q̂ = 1 call │
 * │     returned the list unchanged. Hint-brute-forcing 200 targets left 10.00/Called 5 intact.  │
 * │   · the surviving sample was selected ON THE OUTCOME — a clear can push q̂ to 1 and drop the  │
 * │     call, a miss never can — which is the second half of the propriety blocker.              │
 * │ Every call now takes its slot. A non-informative one takes it and pays exactly 0, which is   │
 * │ what "an unfilled slot contributes 0, which pulls the rating toward exactly 5.00" always     │
 * │ meant. `ratingDetail().n` still counts only the informative ones, so the board's             │
 * │ `n/50 informative calls` line is unchanged.                                                  │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 * @param {Array} calls  the existing window
 * @param {object} entry  a `callEntry`-shaped object, or the arguments for one
 * @param {{N?: number}} [opts]
 * @returns {Array} the new window
 */
export function windowPush(calls, entry, opts = {}) {
  const list = Array.isArray(calls) ? calls : [];
  const e = callEntry(entry);
  const cap = Math.max(1, Math.floor(num(opts.N, CAPS.calls)));
  return [...list, e].slice(-cap);
}

/**
 * The last `N` calls of a window, each with its computed credit and the weight the gate leaves it.
 * A call below `INFORMATIVE_MIN` keeps its slot and carries `w = 0`, so it contributes nothing to
 * `Σ(w·c)` and still displaces the oldest entry. `informative` is the gate's own answer, kept so
 * `ratingDetail` can report "how many of these fifty were measurements".
 */
function windowOf(calls, N) {
  const src = Array.isArray(calls) ? calls : [];
  const keep = [];
  for (const raw of src) {
    if (!raw || typeof raw !== 'object') continue;
    const p = num(raw.p, NaN);
    const stored = Number.isFinite(raw.w) ? clamp(raw.w, 0, RATING.weightK / 4) : weightFor(raw.qHat);
    /* the informative gate, G3.1 — a blank slot (`p: null`, or a weight under the gate) is KEPT and
       scores 0, so it displaces the oldest entry exactly as a measured call does */
    const informative = Number.isFinite(p) && stored >= INFORMATIVE_MIN;
    keep.push({
      w: informative ? stored : 0, c: informative ? credit(p, raw.ok) : 0,
      p: Number.isFinite(p) ? p : null, ok: !!raw.ok, informative,
      skill: raw.skill ?? null, at: raw.at ?? null,
    });
  }
  return keep.slice(-N);
}

/**
 * `rating = clamp(0, 10, 5 + 2 · Σ(w_i · c_i) / N)` with **N = 50 FIXED** (G3.1, G12 #1).
 *
 * The divisor is the WINDOW SIZE, not `Σw` and not the number of INFORMATIVE calls. That is
 * load-bearing twice over: a weighted mean is invariant to the weights when every call is the same
 * kind (which made farming mastered tier-1 locks the fastest route to the top rank), and a slot
 * whose call weighed nothing contributes 0, which pulls the rating toward exactly 5.00.
 *
 * The fifty slots are the student's last fifty CALLS (`windowPush`, and the banner there). Until
 * round 2 they were the last fifty *informative* calls, which is not the same window and is not the
 * one G3.1 describes: a mastered farmer's rare one-miss-in-ten call was the only thing in the
 * divisor, so it WAS the rating (9.53, Called 5). With the real window, a farmer's rating falls back
 * to 5.00 as fast as their informative calls thin out — measured at q = 0.99: 5.63; at q = 1: 5.00.
 * @param {Array<{p:number, ok:boolean, w?:number, qHat?:number}>} calls
 * @param {number} [N=50]
 * @returns {number} 0.0 … 10.0
 */
export function ratingFrom(calls, N = RATING.N) {
  return ratingDetail(calls, N).value;
}

/**
 * `ratingFrom` with its working shown — what the board's `rating 5.00 · 0/50 informative calls` line
 * and the debrief's rating delta both need.
 *
 * `n` counts the INFORMATIVE calls among the fifty slots (the board's `n/50 informative calls`);
 * `slots` counts the calls actually in the window, informative or not. `mean` is `Σ(w·c)/n` — the
 * per-MEASUREMENT figure G4 quotes — while the rating itself divides by `N`. The two differ exactly
 * when the window is not all measurements, which after round 2 is most windows.
 *
 * `measured` is the field a display must read before it prints a rank. `value === 5.00` has TWO
 * causes that are not the same claim about the student: a window of fifty 50-calls (measured
 * cowardice) and a window with no informative call in it at all (NO MEASUREMENT — every make the
 * student staked on sits outside `INFORMATIVE_BAND`, which is where a genuinely mastered player
 * lives). Printing the second as `Called 2` demotes a student for improving. Pass `opts.rank` — the
 * rank they already hold — and an unmeasured window HOLDS it instead of recomputing to `Called 2`;
 * `held` says that is what happened. Default-off: with no `opts` this is the shipped behaviour.
 * @param {Array} calls
 * @param {number} [N=50]
 * @param {{rank?: number|null}} [opts] the currently-held rank, to hold across an unmeasured window
 * @returns {{value:number, raw:number, sum:number, mean:number, n:number, slots:number, N:number, filled:number, rank:number, measured:boolean, held:boolean, clamped:boolean}}
 */
export function ratingDetail(calls, N = RATING.N, opts = {}) {
  const size = Math.max(1, Math.floor(num(N, RATING.N)));
  const win = windowOf(calls, size);
  let sum = 0; let n = 0;
  for (const e of win) { sum += e.w * e.c; if (e.informative) n++; }
  const raw = RATING.base + RATING.scale * (sum / size);
  const value = clamp(raw, RATING.min, RATING.max);
  const measured = n > 0;
  const held = !measured && Number.isFinite(opts.rank);
  return {
    value, raw, sum,
    mean: n ? sum / n : 0,
    n, slots: win.length, N: size, filled: n / size,
    rank: held ? rankOf(opts.rank).rank : rankFor(value),
    measured, held, clamped: value !== raw,
  };
}

/**
 * The rating a window of `n` truthful calls at one `q̂` is WORTH in expectation — the object G3.1's
 * "Sanity" table is built from, on the DISCRETE four-rung ladder (at `q̂ = 0.80` the honest rung is
 * 85, so `E[c] = 3.5` and `w·E[c] = 2.240`, NOT the continuous 2.304 — notes/J1.md §5.3).
 * Non-informative `q̂` contributes 0 per slot, so 50 farmed `q̂ = .97` calls are worth exactly 5.00.
 * @param {number} qHat
 * @param {{n?: number, N?: number, call?: number|null}} [opts]
 */
export function expectedRating(qHat, opts = {}) {
  const N = Math.max(1, Math.floor(num(opts.N, RATING.N)));
  const n = Math.max(0, Math.floor(num(opts.n, N)));
  const w = weightFor(qHat);
  const id = opts.call != null ? callLevel(opts.call)?.id : honestCall(qHat);
  const lvl = callLevel(id);
  const per = !lvl || w < INFORMATIVE_MIN ? 0 : w * expectedCredit(lvl.p, qHat);
  return clamp(RATING.base + (RATING.scale * (n * per)) / N, RATING.min, RATING.max);
}

/** `w · E[c]` at a truthful DISCRETE report — the per-slot quantity `expectedRating` sums. */
export function wTimesEcDiscrete(qHat) {
  const w = weightFor(qHat);
  return w * expectedCredit(callLevel(honestCall(qHat)).p, qHat);
}

/* ------------------------------------------------------------------ G2: rank */

/**
 * The rank a rating buys: 1..5, the last `RANK_THRESHOLDS` entry the rating reaches (G2 "Rank").
 * Calling 50 on everything scores exactly 5.0 → **Called 2 forever** (G3.7 #9): cowardice keeps its
 * money and buys no rank. Rank gates the 95 call and the guard multiplier — loot, never learning.
 *
 * `opts.floor` is the rank the result may not fall below — the hook a display needs so the ladder
 * never DEMOTES (see `ratingDetail`'s `measured`, and notes/call-fix.md §6). Default-off.
 * @param {number} rating
 * @param {{floor?: number|null}} [opts]
 * @returns {number} 1 … 5
 */
export function rankFor(rating, opts = {}) {
  const r = clamp(num(rating, RATING.base), RATING.min, RATING.max);
  let rank = 1;
  for (let i = 0; i < RANK_THRESHOLDS.length; i++) if (r >= RANK_THRESHOLDS[i] - 1e-9) rank = i + 1;
  return Number.isFinite(opts.floor) ? Math.max(rank, rankOf(opts.floor).rank) : rank;
}

/** The `RANKS` entry for a rank number, clamped into 1..5. */
export function rankOf(rank) {
  const i = clamp(Math.round(num(rank, 1)), 1, RANKS.length) - 1;
  return RANKS[i];
}

/** `rating 7.1 · Called 3` — the ladder is the rating band printed as a word (G2). */
export function rankNameFor(rating) {
  return rankOf(rankFor(rating)).name;
}

/** The mean `w·c` PER WINDOW SLOT a rank requires: `mean = (rating − 5)/2` (G2 `RANK_MEAN_WC`). */
export function meanWcFor(rank) {
  return RANK_MEAN_WC[clamp(Math.round(num(rank, 1)), 1, RANK_MEAN_WC.length) - 1];
}

/* ------------------------------------------------------------------ G3.1: q̂ */

/**
 * `q̂` — the student's CLEAR rate on one make over the trailing `QHAT_WINDOW` (10) sittings.
 *
 * Read from `save.cards[*].history` (G2 "Rung distributions are read from `save.cards[*].history`").
 * A history entry is one sitting, `{at, ok, attempt, hints, ms}` (or its packed 5-array form); a hit
 * is `ok` — the sitting cleared. Neither the attempt index nor the hint count disqualifies it,
 * because neither changes `o` in `c(p, o)`: a clear on attempt 3 with a hint is still a clear, and
 * the ρ ladder is where those cost you. Variant sittings write `save.variants`, not card history,
 * so they are out.
 *
 * ── THE CARD INDEX ─────────────────────────────────────────────────────────────────────────────
 * The save does not store which skills a card teaches, and this file deliberately does NOT import
 * `data/cards.js`: that is 236 KB of card data, and Home paints the board on the cold-open budget
 * (G7 "Home paints the board in two passes"; `tests/home-r2.test.mjs` already forbids a static
 * `page.js` import for exactly this reason). So the caller passes the index it already holds:
 *
 *     import { byId } from '../../data/cards.js';
 *     qHatFor(save, 'FAC2', { cards: byId });
 *
 * `opts.cards` accepts an id→card map (`byId`), an id→skills map, a `Map`, an array of cards, or a
 * function `(cardId) => skills[]`. With no index it falls back to `save.cards[id].skills` if a
 * record happens to carry one, and otherwise reports `of: 0` and `qHat: null` — "no data", the same
 * answer the guard gives on job 1, never a fabricated rate.
 *
 * Evidence flows to EVERY skill on the card by default, which is what `mastery.applyOutcome(skills,
 * item.skills, s)` already does. `opts.primaryOnly` restricts it to `skills[0]`, the make the
 * composer labels the item with.
 *
 * ── `opts.before`: THE SNAPSHOT, AND WHY IT IS THE DEFAULT ────────────────────────────────────
 * `w = 4q̂(1−q̂)` is only an anti-farming weight if it is EXOGENOUS to the outcome it weighs. Read
 * `q̂` out of a save that already carries the sitting being scored and it is not: the same clear
 * that sets `o = 1` also moves `q̂`, so `w` becomes a function of the student's own answer and the
 * rule stops being proper (`E[w·c]` is then maximised at `p* = q·w_clear/(q·w_clear + (1−q)·w_miss)`,
 * strictly below `q` whenever `q̂ > 0.5`). The cut at the lock instant is the fix: the window stops
 * at the sittings that existed when the student committed, so the weight is fixed by the seal.
 *
 * Round 2 asked callers to pass it. Round 3 measured that not one of the six call sites in `site/`
 * ever did, and that the lie therefore paid — so the cut is now applied AUTOMATICALLY:
 *
 *   · `before: <number>`  — cut there. The explicit form; unchanged.
 *   · `before` omitted    — cut at `sealedCallOf(save).at` when the save has a call sealed, i.e.
 *                           exactly while an answer is being graded against a committed forecast.
 *                           With no seal (an envelope before the call, a debrief after the job)
 *                           there is nothing to be endogenous to and the full history is read.
 *   · `before: null`      — the opt-out. No cut, ever. Only for a surface that genuinely wants the
 *                           live rate while a call is open; it must not feed `callEntry`.
 *
 * @param {object} save
 * @param {string} skillId
 * @param {{cards?: any, window?: number, primaryOnly?: boolean, before?: number|null}} [opts]
 * @returns {number|null} the clear rate, or `null` when the make has no attempt history
 */
export function qHatFor(save, skillId, opts = {}) {
  return qHatDetail(save, skillId, opts).qHat;
}

/**
 * ── THE SEAL, READ OUT OF THE SAVE ────────────────────────────────────────────────────────────
 * `state.lockCall`'s own record — `save.inProgress.game.locked = { call, n, at }` — or `null` when
 * no call is currently sealed. This is the ONLY save path this file reads besides `save.cards`,
 * and it is read for exactly one reason: `qHatDetail` defaults its `before` cut to `locked.at`, so
 * the anti-farming weight is exogenous to the outcome it weighs whether or not the caller remembers
 * to ask. Round 3's blocker was that no caller ever did (see the banner at the top of this file).
 *
 * WHY HERE AND NOT IN `state.js`. The propriety of the rating ladder is this file's claim — it is
 * the file Settings and the debrief quote when they tell the student *"the only way to score well
 * is to say what you actually believe"* — and a claim a caller can silently break is not a property
 * of the rule, it is a property of the caller's memory. `lockCall` already writes the one number
 * the snapshot needs, at the one instant that is correct, into the save this function is handed.
 * Reading it costs nothing, imports nothing (`job-call.test.mjs` pins that call.js imports exactly
 * `data/job.js`) and removes the failure mode instead of documenting it.
 *
 * Shape-tolerant on purpose: anything that is not an object with a finite `at` is "no seal", which
 * is the same answer a save with no job in progress gives.
 * @param {object} save
 * @returns {{call?:number, n?:number, at:number}|null}
 */
export function sealedCallOf(save) {
  const ip = save && typeof save === 'object' ? save.inProgress : null;
  const g = ip && typeof ip === 'object' ? ip.game : null;
  const locked = g && typeof g === 'object' ? g.locked : null;
  if (!locked || typeof locked !== 'object' || !Number.isFinite(locked.at)) return null;
  return locked;
}

/**
 * `qHatFor` with its working shown — the numbers the envelope's evidence line prints
 * (`your last 10 on FAC2: 7/10`, `COPY.evidence({hits, of, make})`).
 * `source` says WHY a `null` is null: `'none'` is an honest empty history; `'no-index'` means the
 * save has card records but no card index resolved a single skill — the caller forgot `opts.cards`.
 *
 * GLOBAL LAW 6, THE COMPOSITION HAZARD (notes/call-fix.md §4). The letter of the law is about the
 * argmax; the law is about whether a pre-call surface hands the student the answer. `hits/of` over
 * a 10-sitting window takes exactly 11 values, and Settings prints the q̂→rung band list, so an
 * envelope that renders the bare fraction plus a Settings table IS the advisor line, one tap apart.
 * Whatever a caller prints before the call must be coarser than the rung boundaries
 * (`ratingIndifference()` — 0.600 / 0.775 / 0.900), or the two surfaces compose back into it.
 * @returns {{qHat:number|null, hits:number, of:number, window:number, attempts:number, w:number, informative:boolean, source:'history'|'none'|'no-index'}}
 */
export function qHatDetail(save, skillId, opts = {}) {
  const size = Math.max(1, Math.floor(num(opts.window, RATING.qHatWindow)));
  const skillsOf = skillsResolver(opts.cards, save);
  const want = typeof skillId === 'string' ? skillId : null;
  const recs = save && typeof save.cards === 'object' && save.cards ? save.cards : null;
  const rows = [];
  let seen = 0;         // card records scanned
  let resolved = 0;     // …of which the index could name at least one skill
  if (want && recs) {
    for (const id of Object.keys(recs)) {
      seen++;
      const list = skillsOf(id);
      if (list.length) resolved++;
      const hit = opts.primaryOnly ? list[0] === want : list.includes(want);
      if (!hit) continue;
      const hist = recs[id] && recs[id].history;
      if (!Array.isArray(hist)) continue;
      for (const h of hist) { const e = histEntry(h); if (e) rows.push(e); }
    }
  }
  rows.sort((a, b) => a.at - b.at);
  /* THE SNAPSHOT (see `qHatFor`). The cut stops the history at the instant the call was locked, so
     the weight a call carries cannot be a function of that call's own outcome. Strictly `<`: the
     sitting written for THIS target is stamped at or after the lock and must not be in its own q̂.
     Explicit `before` wins; `before: null` opts out; otherwise the save's own seal supplies it. */
  const seal = opts.before === undefined ? sealedCallOf(save) : null;
  const before = Number.isFinite(opts.before) ? opts.before : seal ? seal.at : null;
  const cut = Number.isFinite(before);
  const seenBefore = cut ? rows.filter((e) => e.at < before) : rows;
  const win = seenBefore.slice(-size);
  const of = win.length;
  let hits = 0;
  /* THE EVENT. A hit is a CLEAR — exactly what `state.applyTarget` writes as `o` in `c(p, o)`.
     `e.attempt` is parsed and deliberately ignored: the rung a clear arrived on decides ρ and the
     carry, never the forecast. See the "ONE EVENT" banner at the top of this file. */
  for (const e of win) if (e.ok) hits++;
  const qHat = of > 0 ? hits / of : null;
  const w = qHat == null ? 0 : weightFor(qHat);
  const source = of > 0 ? 'history' : seen > 0 && resolved === 0 ? 'no-index' : 'none';
  return {
    qHat, hits, of, window: size, attempts: seenBefore.length, w,
    informative: w >= INFORMATIVE_MIN, source,
    /** the instant the history was cut at, or `null` for an uncut (live) read */
    before: cut ? before : null,
    /** did the cut come from the save's own sealed call rather than from the caller */
    sealed: cut && seal != null,
  };
}

/** One card-history sitting, from either the unpacked object or the packed 5-array (store.js). */
function histEntry(h) {
  if (Array.isArray(h)) {
    if (h.length < 3) return null;
    return { at: num(h[0]), ok: !!h[1], attempt: num(h[2], 1), hints: num(h[3]) };
  }
  if (h && typeof h === 'object') return { at: num(h.at), ok: !!h.ok, attempt: num(h.attempt, 1), hints: num(h.hints) };
  return null;
}

/** id → skill-id list, from whatever shape of card index the caller has (see `qHatFor`). */
function skillsResolver(cards, save) {
  if (typeof cards === 'function') return (id) => skillList(cards(id));
  if (cards instanceof Map) return (id) => skillList(cards.get(id));
  if (Array.isArray(cards)) {
    const idx = new Map();
    for (const c of cards) if (c && typeof c.id === 'string') idx.set(c.id, c);
    return (id) => skillList(idx.get(id));
  }
  if (cards && typeof cards === 'object') return (id) => skillList(cards[id]);
  return (id) => skillList(save && save.cards ? save.cards[id] : null);
}

function skillList(v) {
  if (!v) return [];
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string' && x);
  if (typeof v === 'object' && Array.isArray(v.skills)) return v.skills.filter((x) => typeof x === 'string' && x);
  return [];
}

/* ------------------------------------------------------------------ the debrief's regret line */

/**
 * The CALL regret for one envelope, for the debrief only (`COPY.regret2`). Evidence after the
 * decision is the whole point of Global law 6 — this is where the argmax is finally allowed to be
 * printed, attached to a target that is already answered.
 *
 * ── TWO UNITS, BOTH NAMED, BECAUSE THE DEBRIEF PRINTED THE WRONG ONE (round 3) ────────────────
 * `cost` is in the unit of the ladder asked for and it is NOT a rating:
 *   · `ladder: 'rating'` — CREDIT points, the `c` of `c(p, o)`. A whole rung of over-calling at
 *     `q̂ = .8` is a credit gap of 0.30; at `q̂ = .55` it is 0.80; the debrief has printed 3.5.
 *   · `ladder: 'carry'`  — multiples of `L·ρ·m·scope·wing`, i.e. loose.
 * One credit point is NOT one rating point. A slot contributes `scale·w·c / N` to the rating, so at
 * `N = 50`, `scale = 2` the conversion is `w·c / 25` — up to 25× smaller, and exactly 0 for a call
 * that was not informative enough to enter the window at all. Round 3 measured the consequence: the
 * live debrief printed *"envelope 3: you called 70, EV-max was 95. cost 3.5 rating."* directly under
 * *"Rating 4.78 · Called 1 · −0.22"* — one envelope claiming 16× the whole job's rating movement.
 * `ratingCost` is that number, computed here so no surface has to know the conversion, and `null`
 * on the carry ladder, where a rating cost is not a thing loot has. (The fix to the SENTENCE is
 * `screens/run.js` + `data/job.js COPY.regret2`, which this lane does not own — notes/call-fix.md
 * round 3 §Requests. This file's job is to stop handing out an unlabelled number.)
 * @param {{call:number, qHat?:number|null, q?:number|null, ladder?:'rating'|'carry'}} o
 * @returns {{called:number, best:number, cost:number, ladder:string, w:number, ratingCost:number|null}}
 */
export function regretOf(o = {}) {
  const ladder = o.ladder === 'carry' ? 'carry' : 'rating';
  const q = Number.isFinite(o.q) ? o.q : Number.isFinite(o.qHat) ? o.qHat : null;
  const called = callLevel(o.call)?.id ?? CALL_LEVELS[0].id;
  const rating = ladder !== 'carry';
  if (q == null) return { called, best: called, cost: 0, ladder, w: 0, ratingCost: rating ? 0 : null };
  const best = ladder === 'carry' ? argmaxCall(q) : honestCall(q);
  const score = ladder === 'carry' ? (id) => evFor(q, id) : (id) => expectedCredit(callLevel(id).p, q);
  const cost = Math.max(0, score(best) - score(called));
  /* the weight the window would actually have given this call — below the gate it is a blank slot,
     so its rating cost is exactly 0, which is the same arithmetic `windowOf` does */
  const raw = weightFor(q);
  const w = raw >= INFORMATIVE_MIN ? raw : 0;
  return { called, best, cost, ladder, w, ratingCost: rating ? (RATING.scale * w * cost) / RATING.N : null };
}

/* ------------------------------------------------------------------ re-exports for the panels */

export { CALL_INDIFFERENCE, CALL_DISAGREEMENT_BANDS, CARRY_LADDER, RATING_LADDER, RANKS, RANK_THRESHOLDS, RATING, CREDIT };
