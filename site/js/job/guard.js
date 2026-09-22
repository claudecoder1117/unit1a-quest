// job/guard.js — THE JOB, ticket J3: the Guard (matching pennies on your own habits) and Elo.
//
// Authority: COMPOSED-GAME.md §3.4 (the Guard), §3.5 (Elo), G4 ("tag → wing", "Mercy"), G2 ("Rank").
// BUILD-POLICY §2 wins over both.
//
// DOM-free and pure. No `document`, no `window`, no CSS, no `Date`, no elapsed-time term
// (G3.7 proof 5: the tick law). Every draw is seeded through `js/rng.js` (G3.6). Nothing here
// writes to a save — the callers (job/state.js, job/board.js) own the writes.
//
// Every constant comes from `data/job.js`; every tag→area fact comes from `data/misconceptions.js`,
// which is READ and never edited (G4 "tag → wing", G12 #15). The guard's two LOOT terms
// (`wingMult`, `wingPen`, `guardMultFor`) live in `job/econ.js` and are re-exported here rather
// than re-derived, so the guard's *distribution* and the guard's *price* stay in separate files
// (notes/J1.md §7).

import {
  WINGS, WING_IDS, WING_OF_SKILL, AREA_WING, GUARD, ELO, VAULT_GRADE, RANKS, SHAPES, COPY, CAPS,
} from '../../data/job.js';
import { MISCONCEPTIONS, AREAS } from '../../data/misconceptions.js';
import { rngFrom } from '../rng.js';
import {
  lootFor, scopeOf, coldOf, guardMultFor, wingMult, wingPen, round, r3,
} from './econ.js';

/* ------------------------------------------------------------------ tiny local helpers */

const EPS = 1e-12;
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const sum = (a) => a.reduce((t, v) => t + v, 0);

/* ==========================================================================================
   G3.4 — the four wings
   ========================================================================================== */

export { WINGS, WING_IDS, GUARD, ELO, VAULT_GRADE };
/** The guard's two LOOT terms and the guarded-wing multiplier, from econ.js (J1 owns them). */
export { guardMultFor, wingMult, wingPen };

/** The wing weights, `{RECALL: 32, FIGURES: 26, WORDS: 23, ALGEBRA: 19}` — Σ = 100 by construction. */
export const WING_WEIGHTS = Object.freeze(Object.fromEntries(WINGS.map((w) => [w.id, w.w])));

/**
 * G3.4 — which wing a make belongs to. The four wings partition the 19 skills exactly.
 * @param {string} skillId  a skill id from `data/skills.js` (the envelope's "make")
 * @returns {string|null} the wing id, or `null` for an unknown make
 */
export function wingOf(skillId) {
  if (typeof skillId !== 'string') return null;
  return WING_OF_SKILL[skillId] ?? null;
}

/**
 * G4 — which wing an AREA of `data/misconceptions.js` belongs to, through `AREA_WING`.
 * `general` maps to `null` on purpose: a general tag resolves to the target card's own wing.
 * @param {string} area  one of the 11 `AREAS` ids
 * @returns {string|null}
 */
export function wingOfArea(area) {
  if (typeof area !== 'string') return null;
  return Object.hasOwn(AREA_WING, area) ? AREA_WING[area] : null;
}

/**
 * G4 "tag → wing" — derived from `data/misconceptions.js`'s own 11 `AREAS` plus the 11-entry
 * `AREA_WING` map in `data/job.js`. No new taxonomy, no edit to any of the 68 tag records.
 *
 * The three `general`-area tags (`sign-flip`, `arithmetic`, `swapped-fields`) have no wing of their
 * own and resolve to the TARGET CARD's own wing, so pass the card's make as the second argument
 * wherever one exists.
 *
 * @param {string} tag              a key of `MISCONCEPTIONS`
 * @param {string|null} [forSkill]  the make of the card the tag fired on (for `general`)
 * @returns {string|null} a wing id, or `null` when the tag is unknown, or is `general` with no make
 */
export function wingOfTag(tag, forSkill = null) {
  if (typeof tag !== 'string' || !tag) return null;
  const rec = Object.hasOwn(MISCONCEPTIONS, tag) ? MISCONCEPTIONS[tag] : null;
  if (!rec) return null;                       // unknown tag — `lookup()` degrades gracefully too
  const wing = wingOfArea(rec.area);
  if (wing) return wing;
  return wingOf(forSkill);                     // `general` → the card's own wing
}

/** The area of a tag, or `null` — a convenience for the Fault Index's 11-area rollup (J7). */
export function areaOfTag(tag) {
  if (typeof tag !== 'string') return null;
  return Object.hasOwn(MISCONCEPTIONS, tag) ? MISCONCEPTIONS[tag].area : null;
}

/** The 11 area ids, in `data/misconceptions.js`'s own order. */
export const AREA_IDS = Object.freeze(AREAS.map((a) => a.id));

/* ==========================================================================================
   G3.4 — `v_i`, the wing's STUDY VALUE
   ========================================================================================== */

/**
 * Normalise one queue item into the `Target` shape `econ.js` prices.
 * Reads only what `page.composePage` already puts on a queue item
 * (`skill`, `tier`, `isReview`/`isVariant`/`isRematch`, `bucket`, `overdue`) — no clock, no cards.
 * @param {object} item
 * @returns {{tier: number, skill: string|null, scopeFlags: object, bucket: number, overdueDays: number}}
 */
export function targetFrom(item = {}) {
  const flags = item.scopeFlags ?? {
    isBonusBank: item.isBonusBank === true,
    isReview: item.isReview === true || item.role === 'review',
    isDrill: item.isDrill === true || item.role === 'drill',
    isVariant: item.isVariant === true,
    isMastered: item.isMastered === true,
  };
  const out = {
    skill: typeof item.skill === 'string' ? item.skill : (typeof item.make === 'string' ? item.make : null),
    tier: clamp(Math.trunc(num(item.tier, 1)), 1, 4),
    bucket: Math.trunc(num(item.bucket, 0)),
    overdueDays: Math.max(0, num(item.overdue ?? item.overdueDays, 0)),
  };
  if (Number.isFinite(item.loot)) out.loot = item.loot;
  if (Number.isFinite(item.scope)) out.scope = item.scope; else out.scopeFlags = flags;
  if (Number.isFinite(item.cold)) out.cold = item.cold;
  return out;
}

/**
 * G3.4 — `v_i = Σ_targets L · scope · cold`, the wing's study value and the guard game's payoff
 * weight. `cold` is G2's CAPPED, interval-scaled term (`econ.coldFor`), so a rotting card cannot
 * inflate a wing (G12 #13).
 *
 * `save` is accepted for symmetry with the rest of the layer and is only read for per-card
 * `bucket`/`overdue` when the queue item does not carry them (composePage's review items do).
 *
 * @param {object|null} save   the save (optional; `save.cards[id]` fills a missing bucket/overdue)
 * @param {object[]} queue     the posted/drafted targets
 * @returns {{byWing: Record<string, number>, values: number[], wings: string[],
 *            support: string[], perTarget: object[], unassigned: number}}
 */
export function wingValues(save, queue = []) {
  const byWing = Object.fromEntries(WING_IDS.map((w) => [w, 0]));
  const perTarget = [];
  let unassigned = 0;
  const cards = save && typeof save === 'object' ? (save.cards ?? {}) : {};
  for (const raw of Array.isArray(queue) ? queue : []) {
    if (!raw || typeof raw !== 'object') continue;
    const rec = (raw.bucket == null && raw.overdue == null && raw.overdueDays == null && raw.id != null)
      ? cards[raw.id] : null;
    const item = rec ? { ...raw, bucket: rec.bucket, overdue: rec.overdue } : raw;
    const t = targetFrom(item);
    const wing = wingOf(t.skill);
    const v = lootFor(t) * scopeOf(t) * coldOf(t);
    perTarget.push({ id: raw.id ?? null, skill: t.skill, wing, value: v });
    if (!wing) { unassigned += v; continue; }
    byWing[wing] += v;
  }
  const values = WING_IDS.map((w) => byWing[w]);
  return {
    byWing, values, wings: WING_IDS.slice(),
    support: WING_IDS.filter((w) => byWing[w] > 0),
    perTarget, unassigned,
  };
}

/* ==========================================================================================
   WORK, NOT STAKE — the one predicate every log-derived quantity in this file goes through
   ========================================================================================== */

/*
 * `posted` is the BOARD's drafted stake: it is decided before the first envelope is opened and it is
 * the same number whether the student answered ten targets or walked out in two seconds. Three things
 * in this file used to read it as if it were work done — the heat window (`x̂`), Mercy
 * (`blockedWing`) and flow control — and all three were therefore farmable by starting a job and
 * quitting it. `state.endJob` already refuses to rate a quit ("quitting must not pay"); these
 * predicates are the same refusal, applied to everything the guard reads out of the log.
 *
 * Evidence is read from whatever the record carries (`targets` / `answered` / `worked`). A record
 * that carries NONE — a pre-fix save, or a synthetic window in a test — reads as worked, so old data
 * keeps its old meaning instead of being silently zeroed.
 */

/**
 * How many targets a job actually answered, or `null` when the record says nothing either way.
 * @param {object|null} entry  a `game.log` entry or a heat-window entry
 * @returns {number|null}
 */
export function targetsAnswered(entry) {
  if (!entry || typeof entry !== 'object') return null;
  for (const k of ['targets', 'answered']) {
    if (Number.isFinite(+entry[k])) return Math.max(0, Math.trunc(+entry[k]));
  }
  if (entry.worked === true) return 1;
  if (entry.worked === false) return 0;
  return null;
}

/** A job the student actually worked. No evidence reads as worked (old saves keep their meaning). */
export function workedJob(entry) {
  const t = targetsAnswered(entry);
  return t == null ? true : t > 0;
}

/**
 * A board that was posted with stakes and abandoned before a single answer — the shape of every
 * quit-scum attempt. It is NOT a bad job; it is not a job.
 */
export function abandonedJob(entry) {
  return targetsAnswered(entry) === 0 && Math.max(0, num(entry?.posted, 0)) > 0;
}

/** The shape's target count, when the record names a shape `data/job.js` knows. */
function shapeTargets(entry) {
  const id = typeof entry?.shape === 'string' ? entry.shape : null;
  const n = id && Object.hasOwn(SHAPES, id) ? num(SHAPES[id].targets, 0) : 0;
  return n > 0 ? n : null;
}

/**
 * The POSTED value the heat window is allowed to credit: the posted value of the targets ACTUALLY
 * ANSWERED, pro-rated over the shape, rather than the board's drafted stake. A job abandoned before
 * the first answer credits exactly 0; a job answered in full credits its posted exactly.
 * @param {object|null} entry
 * @returns {number}
 */
export function workedPosted(entry) {
  const posted = Math.max(0, num(entry?.posted, 0));
  const t = targetsAnswered(entry);
  if (t == null) return posted;                          // no evidence — the legacy reading
  if (t <= 0) return 0;
  const of = shapeTargets(entry);
  return of ? posted * clamp(t / of, 0, 1) : posted;
}

/* ==========================================================================================
   G3.4 — `x̂`, STAKE-weighted over the last 10 jobs
   ========================================================================================== */

/**
 * THE PUBLISHED FORMULAE, as strings, so that a panel prints what this file runs.
 *
 * Settings published `x̂ᵢ = Σⱼ(ωⱼ·shareᵢⱼ)/Σⱼωⱼ` next to the sentence "no single job may be more
 * than a quarter of the window", and the two contradicted each other AND the code: that ratio puts
 * 52 % of the window on one job in the doc's own named 3-RUN + 1-VAULT attack, and 85 % in a window
 * of nine tiny jobs, while the code ran a third term (`β`) that appeared in neither. The formulae
 * are exported from the implementation now, so the published shape and the running shape are one
 * object and cannot drift apart again. `tests/job-guard.test.mjs` §5 executes `X_HAT_FORMULA`
 * literally and asserts it reproduces `xHatFrom` on random windows.
 *
 * Each is the LAW its function implements; the wing values `v_i` are `wingValues()`'s.
 */
export const X_HAT_FORMULA = Object.freeze({
  law: 'x̂ᵢ = (Σⱼ ωⱼ·shareᵢⱼ + β/n) / (Σⱼ ωⱼ + β)',
  omega: 'ωⱼ = min(postedⱼ, cap · Σₖ postedₖ)',
  ballast: 'β = max(0, max(ω)/cap − Σω)   — uniform weight added until the largest job IS `cap` of the window',
  bound: 'therefore ωⱼ/(Σω + β) ≤ cap for every job, at every window size, job 1 included',
});
/**
 * The mixing a MINIMISING guard would be forced to, from the player's indifference condition —
 * `fixedPointMix`. IT IS NOT THE GUARD THIS LAYER SHIPS and it is not the vector the board prints:
 * `guardDist` mirrors `x̂` and never reads `v` at all.
 *
 * ROUND 6 — the symbol is `g`, not `y`, and the tense is counterfactual. The settings card prints
 * the real draw law `y = project((1 − ε)·x̂ + ε·uniform, cap)` and then, thirty lines lower, printed
 * this string under the SAME letter `y` and in the unqualified present tense ("the GUARD mixes this
 * way"), so one card published two different laws for one symbol. The second was measurably not the
 * bars beside it: over 400 shipped `postBoard` boards, `fixedPointMix(board.press.v).y` differs from
 * the printed bars by a mean of 0.332 and by as much as 0.709, and matches them on 0 of 400.
 * Asserted in §7 of `tests/job-guard.test.mjs` ("`g` IS NOT THE PRINTED `y`").
 */
export const GUARD_MIX_FORMULA = 'gᵢ = 1 − k/vᵢ,  k = (n − 1)/Σ(1/vᵢ)   — the way a GUARD that MINIMISED would have to mix; this one does not, it mirrors x̂';
/** The PLAYER's maximin against ANY guard, worth the game's value `k` — see `maximinPress`. */
export const MAXIMIN_FORMULA = 'xᵢ ∝ 1/vᵢ over the same support   — worth k against a guard that reads your press';
/** What the board PRE-PRESSES: the best reply to the guard this layer ships — `stationaryPress`. */
export const PRESS_FORMULA = 'pᵢ = A − B/vᵢ,  A = (1 − ε/n)/(2(1 − ε)),  B set so Σp = 1';

/**
 * THE PARAGRAPH THE SETTINGS PANEL PRINTS next to the pre-press, assembled from the three strings
 * above so that the one panel G7 lets print the real formula cannot print it against the wrong
 * side. It exists because that panel published `gᵢ = 1 − k/vᵢ` as "the unexploitable answer … in
 * proportion to their study value", and all three halves of that sentence are false of this file:
 * `g` is a MINIMISING guard's mixing, the unexploitable press is its RECIPROCAL (`x ∝ 1/v`, most
 * weight on the LOWEST-value wing), and neither of them is what `pressAdvice().tokens` pre-presses
 * — that is `p`, the best reply to the mirror-House this layer actually ships. On `v = (30, 20, 10)`
 * the difference is a whole token: `g` puts 0 of 3 on the third wing and the board puts 1.
 *
 * Sentence order is (1) the rule, (2) what the board pre-presses, (3) whose mix `g` is, (4) what
 * "unexploitable" names. `tests/job-guard.test.mjs` executes it against the vectors.
 *
 * ROUND 5 — TWO UNIVERSALS IN THIS PARAGRAPH WERE MEASURABLY FALSE, and both are now stated
 * against what was measured:
 *
 *   (2) *"positive on every wing of every board the composer deals"*. `stationaryPress` DROPS a
 *       wing whose `A − B/vᵢ` comes out negative, exactly as `fixedPointMix` drops one — and on a
 *       four-wing board that is the ordinary case, not a corner: over 500 saves through the shipped
 *       `postBoard`, a support wing was pressed at 0 on 55.6 % of four-wing boards (86 of 500
 *       boards overall). `v = (58.5, 131.25, 71.25, 18)` — a real one — drops ALGEBRA at every
 *       rank's ε. What survives is positivity ON THE SUPPORT THE PRESS KEEPS, plus an ordering —
 *       but see ROUND 6 for WHICH ordering, because round 5 named the wrong one.
 *   (3) *"pressed by a player it is worth less than a flat press"*. True on the worked vector
 *       `v = (30, 20, 10)` (8.0 against 10.0) and false in general: where `g` collapses onto two
 *       wings and the flat press spreads over four, `g` wins — on 19.6 % of random boards against a
 *       minimising guard and 36.4 % against the shipped mirror guard. What IS universal is the pair
 *       of dominances that actually matter, and both are asserted over 4 000 boards: the maximin is
 *       never worse than `g` against a minimiser, and `stationaryPress` is never worse than `g`
 *       against the guard this layer ships — but see ROUND 7, because "the guard this layer ships"
 *       named two different objects and the sentence did not say which.
 *
 * ROUND 7 — "THE GUARD THAT SHIPS" IS NOT THE GUARD ON THE BOARD IN FRONT OF YOU, and the sentence
 * read as if it were. The clause *"the press above beats it on every board against the guard that
 * ships"* is true under the STATIONARY objective, `U(x) = Σ xᵢvᵢ(1 − (1 − ε)xᵢ − ε/n)` — the `y` a
 * repeated press of `x` itself creates — and false under tonight's printed `y`, which is what a
 * student reads "the guard that ships" as, because it is drawn on the same screen ten lines above.
 * Both readings, over 500 boards driven through the shipped `board.postBoard`
 * (`tests/job-guard.test.mjs` §PRESS_PANEL_COPY, "THE PRESS BEATS g AGAINST THE GUARD IT CONVERGES
 * TO"):
 *
 *     (A) stationary objective  U(x) = Σ xᵢvᵢ(1 − (1 − ε)xᵢ − ε/n)   p worse than g on   0 / 500
 *     (B) tonight's printed y   U(x) = Σ xᵢvᵢ(1 − yᵢ)                p worse than g on 491 / 500
 *                                                              mean shortfall 11.7 %, max 31.7 %
 *
 * The suite's own assertion could never have caught it: `valueShipped` in the 4 000-board loop IS
 * the objective `stationaryPress` solves by construction, so `valueShipped(p) >= valueShipped(g)`
 * said "the optimiser optimises" four thousand times. It is kept — as an OPTIMISER CHECK, labelled
 * as one — and the sentence's number is now measured against the board's own printed `y`. The
 * other half of the sentence was never vacuous: `maximin` vs `g` against a minimiser is a genuine
 * comparison of two different vectors, and it holds 500 / 500 on the same corpus.
 *
 * ROUND 6 — THE ORDERING ROUND 5 PUBLISHED IS THE WRONG ONE, and it is false on the shipped board.
 * The sentence read *"never presses one wing harder than a wing A TOKEN IS WORTH MORE ON"*, and
 * this file defines what a token is worth: `marginalᵢ = 0.25·vᵢ·(1 − yᵢ)` (`pressAdvice`). But
 * `stationaryPress` solves `p = A − B/vPress` and `vPress` is the RAW study value on every wing the
 * guard is not certain to take — `(1 − yᵢ)` is nowhere in it — so `p` is monotone in `v`, and
 * whenever `y` reverses the `v` ordering the press is heavier where a token is worth less.
 * Measured through the shipped `postBoard` over 500 seeded saves carrying a real 0-12-job press
 * history (`tests/job-guard.test.mjs` §7, "THE PRESS ORDERS BY STUDY VALUE…"):
 *
 *     ordering by `marginal` violated in `p`                       88 / 500   (17.6 %)
 *     …and violated in the WHOLE TOKENS the board pre-fills        14 / 500   ( 2.8 %)
 *     a real board: v = (103.5, 131.25, 33.75), y = (0.148, 0.487, 0.365)
 *       marginal = (22.05, 16.83, 5.36) — and the board pre-presses (1, 2, 0)
 *
 * Both `v` and `y` are printed as bars on the same screen, so a student can falsify the round-5
 * sentence from one board. THE MATHS IS NOT THE DEFECT and was not changed: `p` is the STATIONARY
 * reply, solved against the `y` a repeated press itself creates (`yᵢ = (1 − ε)pᵢ + ε/n`), and at
 * that `y` the marginal ordering and the `v` ordering coincide — `vᵢ(1 − yᵢ) = vᵢ(1 − ε/n)/2 +
 * (1 − ε)B`, increasing in `vᵢ`. Ordering by tonight's `marginal` instead would make the pre-press
 * a greedy best reply to the bars on screen, which is what Global law 6 forbids the board to
 * pre-fill (`bestResponseWing` is DEBRIEF material for exactly that reason) and what makes the
 * mirror-House loop cycle (`BEST_RESPONSE_ACCEPTANCE.indexOrderTies`). So the SENTENCE is what was
 * wrong, and the sentence now states the ordering `p` has and names the gap, with the measurement.
 */
export const PRESS_PANEL_COPY = Object.freeze([
  'A token pays only where the guard is not.',
  `The board pre-presses ${PRESS_FORMULA} — the best reply to the guard this layer ships, whose y is a published mirror of your own last ${GUARD.xHatWindowJobs} jobs and not a minimiser. It is positive on every wing the press KEEPS, and it never presses one wing harder than a wing of greater STUDY VALUE — a wing worth too little to press leaves that support exactly as a wing worth too little to defend leaves the guard's, and so does a wing the guard is certain to take, however high its study value, because a token there buys nothing. On a four-wing board a drop is the ordinary case and not a corner: v = (58.5, 131.25, 71.25, 18) presses (0.25, 0.44, 0.31, 0) and spends nothing on the fourth. STUDY VALUE IS NOT WHAT A TOKEN IS WORTH TONIGHT, and p does not claim it is: a token buys ${GUARD.tokenBonus}·vᵢ·(1 − yᵢ), tonight's y is not in v's order, so the press can be heavier on a wing a token is worth less on — 17.6 % of 500 shipped boards, and 2.8 % of them in the whole tokens the board pre-fills. That is p being stationary rather than greedy: it answers the guard a repeated press creates, not the one drawn against tonight's bars. Both v and y are printed above, so the gap is checkable on the board it happens on.`,
  `The other half of the fixed point is ${GUARD_MIX_FORMULA}. It is the HOUSE's side of the algebra, published as evidence and not a press to copy, and it is NOT the bars printed above it: over 400 shipped boards g and the drawn y differ by a mean of 0.33 and by as much as 0.71, and agree on 0 of them. On the worked board v = (30, 20, 10), pressing g is worth 8.0 against a flat press's 10.0 and the maximin's 12.0. A flat press does not always beat it — where g collapses onto two wings and the flat press spreads over four, g wins — but the maximin below beats it on every board against a guard that MINIMISES, and the press above beats it on every board against the y a repeated press of itself creates, yᵢ = (1 − ε)pᵢ + ε/n, which is the guard this layer converges to and NOT the bars above. Against the bars above it does not: measured on the y printed on the board, g beats the press on 491 of 500 shipped boards by a mean of 11.7 % and by as much as 31.7 %. That is the same fact as the paragraph before it — p is stationary, not greedy — and it is why the two halves of this sentence name two different guards.`,
  `Against a guard that reads the press and minimises, the unexploitable press is the maximin ${MAXIMIN_FORMULA}. It puts the most weight on the LOWEST-value wing, because that is what equalises xᵢ·vᵢ and leaves the guard no wing it prefers.`,
]);

/**
 * G8's J3 acceptance row for the best-response simulation, and G12 #12's farm figure, restated as
 * what THIS FILE measurably does — exported for the same reason `X_HAT_FORMULA` is: a published
 * figure and the running figure are one object here and cannot drift apart again. Every number
 * below is produced by simulation in `tests/job-guard.test.mjs` §10 and §5b, driven through
 * `guardDist` → `pressAdvice` → `pushHeat` → `xHatFrom`, never by a re-implementation of them.
 *
 * The two rows that used to be published flat — "converges to `(.60, .40)` ±0.03 and to uniform"
 * and "a 3-RUN + 1-VAULT farm moves `x̂` by < 0.08" — are each true under a condition the flat
 * sentence dropped, and false outside it. The conditions are the point, so they are the strings.
 */
export const BEST_RESPONSE_ACCEPTANCE = Object.freeze({
  claim: 'a 500-job best-response simulation settles on y = (.60, .40) for v = (30, 20, 10), and on uniform for equal v, to ±0.03',
  holds: 'at ε = 0, for the idealised all-time-average loop AND for the shipped 10-job-window loop, when a TIED argmax is settled uniformly (`pressAdvice(dist, v, {seed})`): 0.583-0.587 and uniform to 0.005',
  ranks: 'at ε > 0 the target is the ε-floored equilibrium and NOT (.60, .40): the shipped loop is inside 0.025 of that closed form at every rank, while (.60, .40) itself is missed by 0.039 at Called 1',
  indexOrderTies: 'settled by WING_IDS order instead, the SAME loop cycles with period 11 and averages (7/11, 4/11) for v = (30, 20, 10) and (4/11, 4/11, 3/11) for equal v — 0.036 and 0.061 out, stable to 5000 jobs, because a ten-job window pressed in three whole tokens ties the argmax exactly',
});
/**
 * G12 #12's farm figure, with the window it holds on and the bound that holds on every window.
 *
 * ROUND 4 — `holds` says TEN-JOB and it means it. The `< 0.08` figure is a statement about a FULL
 * window, because `heatWindow` is `jobs.slice(-10)`: under ten jobs the three decoy RUNs are ADDED
 * to the window rather than substituted into it, so they own three of four jobs instead of three of
 * ten and the farm moves x̂ by 0.300, not 0.058 (`shortWindow` below, measured through `pushHeat`).
 * A doc sentence that says "any window" or "every window" holding plan-sized or VAULT work is false
 * on the very window it names — three RUNs and one VAULT is four jobs.
 *
 * The other condition is the HONEST PRESS. The move is `subset share × (1 − the farmed wing's honest
 * share)`, so the three published figures are figures for a student who spreads their press; a
 * ten-job VAULT window whose honest press never touched the farmed wing moves the full share, 0.087,
 * which is over the band. `bound` is the only unconditional sentence here.
 */
export const FARM_BAND = Object.freeze({
  claim: 'a 3-RUN + 1-VAULT farm moves x̂ by < 0.08',
  holds: 'on a FULL 10-job window that holds plan-sized or VAULT work and spreads the honest press: 0.058 vault-heavy, 0.061 plan-sized, 0.071 the mixed week',
  shortWindow: 'BELOW ten jobs the three RUNs are added to the window instead of evicting three of it, so nothing under 0.08 holds until the eighth job: 0.300 at four jobs (the literal 3-RUN + 1-VAULT window), 0.188 at five, 0.136 at six, 0.095 at seven, and first inside the band at 0.078 on eight',
  misses: '0.082 on a 9-JOB + 1-VAULT window, 0.087 on a 10-job VAULT window whose honest press never touched the farmed wing, 0.103 on a JOB-10-only window, 0.200 on an all-RUN window (the school-hours week), where every job posts the same and the stake weighting has nothing to weigh',
  bound: 'what holds on EVERY window: re-pressing a subset moves x̂ by at most that subset share of the window weight — three of ten equal jobs is 0.30 of it, and 0.30 x (1 - 1/3) = 0.200 exactly',
});

/**
 * One job's contribution to the heat window, normalised. `posted` is the CREDITED posted
 * (`workedPosted`), never the drafted stake, and a job with no work is dropped exactly as a job with
 * no press is.
 * @param {object} entry  `{press|tokens|shares: {wing: n}, posted, targets?, shape?}`
 * @returns {{shares: Record<string, number>, posted: number, targets: number|null}|null}
 */
function heatEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const raw = entry.shares ?? entry.press ?? entry.tokens ?? null;
  if (!raw || typeof raw !== 'object') return null;
  const shares = {};
  let total = 0;
  for (const w of WING_IDS) {
    const v = Math.max(0, num(raw[w], 0));
    shares[w] = v;
    total += v;
  }
  if (!(total > 0)) return null;                        // a job with no press tells us nothing
  if (!workedJob(entry)) return null;                   // a job with no work tells us nothing either
  for (const w of WING_IDS) shares[w] /= total;
  return { shares, posted: workedPosted(entry), targets: targetsAnswered(entry) };
}

/**
 * Pair each heat-window entry with the `game.log` entry of the same job, so a window written before
 * the call site passes work evidence (entries carrying a stake and nothing else) can still be read
 * honestly.
 *
 * THIS IS A REPAIR, NOT THE DEFENCE. The defence WOULD be `row.targets`, written by the caller: a
 * row that carries it never reaches this function's slow path at all (tier 1 below), and `pushHeat`
 * already stores `targets` and `shape` when it is handed them.
 *
 * **No shipped caller hands them over today, and this is a priced decision, not an oversight.**
 * `state.endJob` is the only caller (`site/js/job/state.js`, `guard.pushHeat(gm.heat, { press:
 * g.tokens, posted: postedRecorded })`) and it has both values in scope one statement earlier — it
 * writes them into the `game.log` entry on the same line. Passing them costs save budget the
 * published figure does not currently carry: `tests/_helpers.mjs` prices a window row at 71 B and a
 * real row measures 69 B, so the headroom is 2 B, while `{targets, shape}` is **+29 B a row, +290 B
 * over the ten-job window** (`targets` alone is +13 B a row, +130 B). `tests/job-save.test.mjs`
 * refuses that in terms — *"widen the fixture and RESTATE SAVE_BUDGET_KB, do not widen the
 * assertion"* — so closing this needs `SAVE_BUDGET_KB` in `site/data/job.js` and G7's save-schema
 * table moved together with the fixture, which is the save lane's call and not this file's.
 *
 * Until that happens everything below is load-bearing, not a fallback, and its ONE job is that the
 * abandoned-board rule can never be switched off by desynching the two lists — which is three
 * clicks, because `pushHeat` refuses a row whose press total is 0 while `state.endJob` logs that job
 * anyway, so pressing zero tokens on any one job shortens the window by one and slides every older
 * pairing off its own log entry.
 *
 * ROUND 7 — THE ONE-JOB DESYNC DEFEATED THE WHOLE DEFENCE, and the docblock that stood here said it
 * could not. Two sentences were false, and a third described a test the code did not run:
 *
 *   • *"Tier 2 already covers that week, because a tail of equal `posted` pairs onto itself
 *     whichever way the skip fell."* It does not. The old tier 2 checked only that the last
 *     `rows.length` log entries matched the rows on `posted`, POSITION FOR POSITION — never that
 *     the rows WERE that tail. One job out of step and a SHIFTED pairing passes that check on any
 *     week of equal stakes, and the shift runs the farmer's way.
 *   • Tier 3's *"as LATE as possible and as EARLY as possible"* uniqueness test anchored the
 *     EARLIEST pass at `latest[0]`, so the two passes agreed on row 0 by construction and could
 *     never disagree about a prefix. The criterion was published; the test was not run.
 *
 * Measured on an all-RUN school week (ten jobs at 36, a board drafted and walked at job 3 pressing
 * three tokens on RECALL, one night at job 6 where every token was taken off before the start):
 *
 *     log 10, heat rows 9   credited 8   shares RECALL [0,1,0,0,0,0,0,0]   x̂ RECALL 0.125
 *     lists in step         credited 9   shares RECALL [0,0,0,0,0,0,0,0,0] x̂ RECALL 0.000
 *
 * The walk's whole press reached `x̂` at full posted, over three times `FARM_BAND.claim`'s band and
 * above `FARM_BAND.bound`'s all-RUN ceiling, bought with one free action.
 *
 * THE REPAIR IS TO STOP GUESSING THE PAIRING AND START PROVING IT. Two facts the save already
 * carries make that exact, at no save cost: `game.ledger.jobs` counts every job that reached
 * `state.endJob` (which is every job that wrote a log entry, on the line above), and `heat.jobs`
 * counts every job `pushHeat` accepted (which is every job that wrote a row). Their difference IS
 * the number of jobs that ended without writing a row — the desync, counted rather than assumed.
 *
 * Four tiers, in order:
 *
 *   1. SELF-DESCRIBING — every row already knows what it answered. Nothing to do.
 *   2. IN STEP, AND PROVED — `skipsEver(save) === 0`: every job that ended wrote a row, so the
 *      window IS the log's tail, position for position. Checksummed on `posted` as before. This is
 *      the ordinary case (a student who never empties the press) and it is now a proof rather than
 *      an assumption.
 *   3. FORCED — otherwise the rows are a subsequence of the log and the alignment is a guess. So
 *      the guess is not taken: for each row the FEASIBLE log entries are computed (every position
 *      between the earliest and the latest that an order-preserving match can put it at, with
 *      matching `posted`), and the row takes the evidence only when EVERY feasible entry agrees on
 *      it — same `targets`, same `shape`. Agreement makes the conclusion independent of which
 *      alignment is the true one, which is the only thing this function needs. Both passes run over
 *      the same reach, and the reach is bounded by the counted desync (`rows.length + skips`), so
 *      it is a real test and not one anchored to its own answer.
 *   4. WHAT IS STILL UNATTRIBUTABLE, AND ONLY WHEN THE LOG SHOWS AN ABANDONED BOARD — those rows
 *      are DROPPED rather than credited. They cannot be attributed, and the log says at least one
 *      of them may be a board that was drafted and walked out of; crediting them is the exploit,
 *      and dropping them costs a legacy save some history and pushes `x̂` toward uniform, which is
 *      the direction that pays the farmer nothing. With no abandoned board in reach there is
 *      nothing to defend against, so the legacy reading stands untouched.
 *
 * On the week above, tier 2 is refused (the counters differ by one), the walked row's two feasible
 * entries disagree (its own log entry says 0 targets, its neighbour says 4), and the row is dropped:
 * the farmed wing buys 0.000 of `x̂`, in step or out of it. `tests/job-guard.test.mjs` §5b drives it
 * through the shipped `postBoard` → `startJob` → press → walk machine and sweeps 40 000 windows.
 *
 * @returns {Array} the rows, with evidence merged in where it could be established, and with
 *                  unattributable rows removed when the log shows a walk in the same reach.
 */
function withLogEvidence(rows, save) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  if (rows.every((e) => targetsAnswered(e) != null)) return rows;       // 1. already self-describing
  const log = Array.isArray(save?.game?.log) ? save.game.log : [];
  const postedOf = (e) => num(e?.posted, 0);
  const sameStake = (a, b) => Math.abs(postedOf(a) - postedOf(b)) <= 1e-9;
  const merge = (row, src) => ({
    ...row,
    targets: targetsAnswered(row) ?? targetsAnswered(src),
    shape: row?.shape ?? src?.shape,
  });
  /* 4, as a closure, because three different failures end here. */
  const settle = (out) => {
    const reach = log.slice(-Math.max(rows.length, GUARD.xHatWindowJobs));
    if (!reach.some(abandonedJob)) return out;
    return out.filter((e) => targetsAnswered(e) != null);
  };
  if (log.length < rows.length) return settle(rows);        // no alignment exists at all

  let skips = skipsEver(save, rows.length);

  /* 2. IN STEP, AND PROVED: no job ever ended without writing a row, so the window is the log's
        tail one for one. The `posted` checksum stays, so a save whose counters say "in step" while
        its two lists plainly are not falls through to 3 — and falls through with `skips` back at
        `null`, because a counter that cannot describe THIS window may not be trusted to bound the
        reach for it either. Widening the reach can only make more rows unattributable, never
        fewer, so the unreliable-counter case costs history rather than paying it out. */
  if (skips === 0) {
    const tail = log.slice(-rows.length);
    let ok = true;
    for (let i = 0; i < rows.length && ok; i++) {
      if (targetsAnswered(tail[i]) == null) ok = false;
      else if (!sameStake(rows[i], tail[i])) ok = false;
    }
    if (ok) return rows.map((e, i) => merge(e, tail[i]));
    skips = null;
  }

  /* 3. FORCED. The reach is the last `rows.length + skips` log entries — the widest span the rows
        can occupy when `skips` of the jobs inside it wrote no row — and the whole log when the save
        cannot say (`skips === null`), which is the conservative reading and not the convenient one.
        `latest[r]` / `earliest[r]` are the last and first positions an order-preserving match can
        give row `r`; every position between them whose `posted` matches is feasible too, so those
        are exactly the entries the row could be. */
  const span = skips == null ? log.length : Math.min(log.length, rows.length + Math.max(0, skips));
  const lo = Math.max(0, log.length - span);
  const latest = (() => {
    const at = new Array(rows.length).fill(-1);
    let r = rows.length - 1;
    let l = log.length - 1;
    while (r >= 0 && l >= lo) {
      if (sameStake(rows[r], log[l])) { at[r] = l; r--; }
      l--;
    }
    return r >= 0 ? null : at;                                   // ran out of reach
  })();
  const earliest = (() => {
    if (!latest) return null;
    const at = new Array(rows.length).fill(-1);
    let r = 0;
    let l = lo;                                                  // the SAME reach, from its front
    while (r < rows.length && l < log.length) {
      if (sameStake(rows[r], log[l])) { at[r] = l; r++; }
      l++;
    }
    return r < rows.length ? null : at;
  })();
  if (!latest || !earliest) return settle(rows);

  return settle(rows.map((row, r) => {
    let forced;
    for (let l = earliest[r]; l <= latest[r]; l++) {
      if (!sameStake(row, log[l])) continue;
      const t = targetsAnswered(log[l]);
      if (t == null) return row;                                 // a log from before the evidence
      const shape = typeof log[l]?.shape === 'string' ? log[l].shape : null;
      if (forced === undefined) forced = { t, shape };
      else if (forced.t !== t || forced.shape !== shape) return row;   // the feasible entries disagree
    }
    return forced === undefined ? row : merge(row, { targets: forced.t, shape: forced.shape ?? undefined });
  }));
}

/**
 * How many jobs ENDED WITHOUT WRITING A HEAT ROW over this save's life, or `null` when the save
 * cannot say. This is the desync of finding R7-1, counted from two counters the save already keeps:
 *
 *   `game.ledger.jobs`  — every job that reached `state.endJob`, which is every job that wrote a
 *                         `game.log` entry (`state.js` writes the log and folds the ledger in the
 *                         same function, unconditionally).
 *   `game.heat.jobs`    — every job `pushHeat` ACCEPTED, which is every job that wrote a window row.
 *
 * `ledger.jobs` is the authority; a save too old to carry it can still be read when its log has
 * never been truncated (`log.length < CAPS.log`), because then the log IS every job it ever played.
 * Anything inconsistent — a row count above the job count, a window longer than the rows ever
 * pushed — returns `null`, which makes tier 3 read the whole log and tier 4 do the dropping. Being
 * wrong in that direction costs a legacy save some history; being wrong in the other direction is
 * the farm.
 *
 * @param {object|null} save
 * @param {number} windowRows  the number of rows the window currently holds
 * @returns {number|null}
 */
function skipsEver(save, windowRows) {
  const g = save?.game;
  const log = Array.isArray(g?.log) ? g.log : [];
  const rowsEver = Number.isFinite(+g?.heat?.jobs) ? Math.trunc(+g.heat.jobs) : null;
  const ledgerJobs = Number.isFinite(+g?.ledger?.jobs) ? Math.trunc(+g.ledger.jobs) : null;
  const jobsEver = ledgerJobs != null && ledgerJobs >= log.length
    ? ledgerJobs
    : (log.length < CAPS.log ? log.length : null);
  if (rowsEver == null || jobsEver == null) return null;
  if (rowsEver < windowRows || rowsEver > jobsEver) return null;        // the counters do not add up
  return jobsEver - rowsEver;
}

/**
 * The stake-weighted press window: the last `GUARD.xHatWindowJobs` (10) jobs that pressed tokens.
 *
 * Read in priority order, so the layer works whichever of G7's two shapes `state.js` writes:
 *   1. `save.game.heat.window` — `[{press: {wing: tokens}, posted, targets?}]` (the authority)
 *   2. `save.game.log`         — entries that carry a press AND a posted
 *   3. `save.game.heat.press` / `.weight` — the running accumulator of G7's schema, used UNCAPPED
 *      as a last resort (the 25 % cap cannot be recovered from a scalar accumulator).
 *
 * `sealed` says the window held rows, so 2 and 3 are off the table even when every row turned out to
 * be an abandoned board — see the note in the body.
 *
 * @param {object|null} save
 * @returns {{jobs: Array<{shares: Record<string, number>, posted: number, targets: number|null}>,
 *            source: string, sealed: boolean}}
 */
export function heatWindow(save) {
  const heat = save?.game?.heat;
  const take = (arr) => (Array.isArray(arr) ? arr.map(heatEntry).filter(Boolean) : []);
  const rows = Array.isArray(heat?.window) ? heat.window : null;
  /* A window that HELD jobs has spoken, even when every one of them turns out to be an abandoned
     board: the answer is then "no data", not "ask the accumulator". `heat.press` is a running sum
     that cannot be un-credited (the 25 % cap cannot be recovered from a scalar either), so reaching
     for it here would hand the exploit straight back — G7's schema calls it the last resort and
     this is what that means. */
  const sealed = rows != null && rows.length > 0;
  let jobs = take(withLogEvidence(rows, save));
  let source = 'heat.window';
  if (jobs.length === 0 && !sealed) { jobs = take(save?.game?.log); source = 'game.log'; }
  if (jobs.length === 0) return { jobs: [], source: sealed ? 'heat.window' : 'none', sealed };
  return { jobs: jobs.slice(-GUARD.xHatWindowJobs), source, sealed };
}

/**
 * G3.4 / G12 #12 — `x̂`, in full and with nothing left out:
 *
 * ```
 *   x̂_i = ( Σ_j ω_j·share_ij + β/n ) / ( Σ_j ω_j + β )
 *   ω_j = min( posted_j , 0.25 · Σ_k posted_k )
 *   β   = max( 0 , max_j(ω_j)/0.25 − Σ_j ω_j )
 * ```
 *
 * `β` IS PART OF THE FORMULA, not an implementation detail, and it is the half that delivers the
 * published bound: `ω_j ≤ 0.25·Σposted` does NOT hold one job to a quarter of the window, because
 * the cap scales with the window total (three RUNs and one VAULT leave the VAULT owning 52 % of
 * Σω; nine tiny jobs and one huge one leave it owning 85 %; on job 2 one job owns 50 %). `β` is
 * uniform weight added until the largest job's share of the window IS 0.25 exactly — and none at
 * all once the window is broad enough to satisfy the bound on its own, which every realistic
 * 10-job window is. Relative stake weighting between real jobs is untouched by it: a RUN still
 * counts about a fifth of a VAULT.
 *
 * Anything that publishes this formula must publish `β` with it — the string is
 * `X_HAT_FORMULA` above, exported so a panel cannot print a shape the code does not run.
 *
 * `posted` here is always the CREDITED posted (`workedPosted`), so a board that was drafted and
 * abandoned weighs nothing at all — WHICH IS A STATEMENT ABOUT THE WHOLE READ PATH AND NOT ABOUT
 * THIS LINE (round 7). `workedPosted` can only credit 0 if the row is carrying the walk's own
 * evidence, and on a window written by the shipped `state.endJob` the row carries none: it is
 * `withLogEvidence` that must find the walk's log entry, and until round 7 one zero-press job was
 * enough to hand the walk a worked job's evidence instead. The sentence holds because that pairing
 * is now PROVED (the two counters agree) or FORCED (every feasible log entry says the same thing)
 * or else refused, and a row that cannot be attributed with an abandoned board in reach is dropped
 * rather than credited. In step or out of step, the walk weighs nothing.
 *
 * @param {object|null} save
 * @returns {{byWing: Record<string, number>, values: number[], wings: string[], jobs: number,
 *            weights: number[], cap: number, totalPosted: number, ballast: number, denom: number,
 *            shares: number[], maxShare: number, coldStart: boolean, source: string}}
 */
export function xHatFrom(save) {
  const { jobs, source, sealed } = heatWindow(save);
  const wings = WING_IDS.slice();
  const cold = {
    byWing: Object.fromEntries(wings.map((w) => [w, 1 / wings.length])),
    values: wings.map(() => 1 / wings.length),
    wings, jobs: 0, weights: [], cap: 0, totalPosted: 0,
    ballast: 0, denom: 0, shares: [], maxShare: 0, coldStart: true, source,
  };

  if (jobs.length === 0) {
    // Last resort: G7's scalar accumulator. Uncapped by construction — recorded in notes/J3.md —
    // and un-refundable, so it is consulted ONLY when no window has ever been written.
    const press = sealed ? null : save?.game?.heat?.press;
    if (press && typeof press === 'object') {
      const vals = wings.map((w) => Math.max(0, num(press[w], 0)));
      const t = sum(vals);
      if (t > 0) {
        return {
          byWing: Object.fromEntries(wings.map((w, i) => [w, vals[i] / t])),
          values: vals.map((v) => v / t), wings,
          jobs: Math.max(0, Math.trunc(num(save?.game?.heat?.jobs, 0))),
          weights: [], cap: 0, totalPosted: Math.max(0, num(save?.game?.heat?.weight, 0)),
          ballast: 0, denom: t, shares: [], maxShare: 0,
          coldStart: false, source: 'heat.press',
        };
      }
    }
    return cold;
  }

  const totalPosted = sum(jobs.map((j) => j.posted));
  const cap = GUARD.jobWeightCap * totalPosted;
  // Every job posted 0 (a synthetic or a dry board): fall back to equal weights so the window is
  // still readable, rather than dividing by zero.
  const weights = totalPosted > 0 ? jobs.map((j) => Math.min(j.posted, cap)) : jobs.map(() => 1);
  const wTotal = sum(weights);
  if (!(wTotal > 0)) return cold;

  /* The bound the Settings panel publishes — "no single job may be more than a quarter of the
     window" — is NOT delivered by `ω_j ≤ 0.25·Σposted`, because that cap scales with the window
     total: one job against three RUNs still owns 99 % of Σω, and on job 2 one job IS the window.
     So the window carries UNIFORM BALLAST: enough uniform weight that the largest job's share of
     the total is exactly `GUARD.jobWeightCap`, and none at all once the window is broad enough to
     satisfy the bound on its own (every realistic 10-job window). Relative stake weighting is
     untouched — a RUN still counts about a fifth of a VAULT — and a two-job window is
     three-quarters uniform rather than being the student's last press, verbatim, as `x̂`. */
  const capFrac = num(GUARD.jobWeightCap, 0.25) > 0 ? num(GUARD.jobWeightCap, 0.25) : 1;
  const maxW = Math.max(...weights);
  const ballast = Math.max(0, maxW / capFrac - wTotal);
  const denom = wTotal + ballast;
  const fill = ballast / wings.length;

  const values = wings.map((w) => (sum(jobs.map((j, i) => weights[i] * j.shares[w])) + fill) / denom);
  return {
    byWing: Object.fromEntries(wings.map((w, i) => [w, values[i]])),
    values, wings, jobs: jobs.length, weights, cap, totalPosted,
    ballast, denom,
    shares: weights.map((w) => w / denom),
    maxShare: maxW / denom,
    coldStart: false, source,
  };
}

/**
 * The pure updater `state.js` should call when a job ends, so the window and G7's accumulator stay
 * in step. Returns a NEW heat object; nothing is mutated.
 *
 * A job that answered NOTHING is not pushed at all — the window records work, not intent — SO LONG
 * AS THIS FUNCTION IS TOLD (round 7). Pass `targets` (and `shape`, for the pro-rating) alongside
 * `posted` and the refusal happens here, on the spot, and drafting a board and walking out of it
 * two seconds later leaves `x̂` exactly where it was. WITHOUT them this function cannot tell a walk
 * from a worked job and pushes the row; the refusal then happens at READ time instead, in
 * `withLogEvidence`, which has to find the walk's own `game.log` entry first. That is the shipped
 * path today (`state.endJob` passes neither — see `withLogEvidence` for why, and for the save-budget
 * price of closing it), and it is the path round 7 had to repair: the two lists can fall out of
 * step, because this function refuses a row whose press total is 0 while `state.endJob` logs that
 * job anyway. `x̂` ends up in the same place either way now, but only one of the two routes is a
 * one-line refusal and the other is a proof.
 *
 * The window stores the RAW `posted` and the work evidence separately, not the credited product, so
 * an entry stays checkable against the log entry of the same job.
 *
 * @param {object|null} heat   `save.game.heat`
 * @param {{press?: object, tokens?: object, posted?: number, targets?: number, shape?: string}} entry
 * @returns {object} the new `save.game.heat`
 */
export function pushHeat(heat, entry) {
  const e = heatEntry(entry);
  const prevWindow = Array.isArray(heat?.window) ? heat.window : [];
  const press = { ...Object.fromEntries(WING_IDS.map((w) => [w, Math.max(0, num(heat?.press?.[w], 0))])) };
  const out = {
    press,
    weight: Math.max(0, num(heat?.weight, 0)),
    jobs: Math.max(0, Math.trunc(num(heat?.jobs, 0))),
    window: prevWindow.slice(-GUARD.xHatWindowJobs),
  };
  if (!e) return out;
  const raw = entry.press ?? entry.tokens ?? entry.shares ?? {};
  const row = {
    press: Object.fromEntries(WING_IDS.map((w) => [w, Math.max(0, num(raw[w], 0))])),
    posted: Math.max(0, num(entry.posted, 0)),
  };
  if (e.targets != null) row.targets = e.targets;
  if (typeof entry.shape === 'string') row.shape = entry.shape;
  out.window = [...out.window, row].slice(-GUARD.xHatWindowJobs);
  out.jobs += 1;
  out.weight += e.posted;
  for (const w of WING_IDS) out.press[w] += e.posted * e.shares[w];
  return out;
}

/* ==========================================================================================
   G3.4 — the cap projection ("water-filling", loosely — see below: the excess is shared in
   proportion, not levelled)
   ========================================================================================== */

/**
 * G3.4's published pseudo-code, verbatim, with the one clarification its own "terminates in ≤ n−1
 * passes" claim forces: an index that has been capped STAYS capped (it is never returned to `free`),
 * so every pass retires at least one index and the loop cannot cycle.
 *
 * ```
 * project(y, cap):
 *   loop:
 *     over = { i : y_i > cap }
 *     if over is empty: return y
 *     excess = Σ_{i∈over} (y_i − cap)
 *     for i in over: y_i = cap        // and i is retired: it is never `free` again
 *     free = { i : i not capped }
 *     if Σ_{i∈free} y_i > 0: distribute excess over `free` in proportion to current y_i
 *     else:                  distribute excess over `free` uniformly
 * ```
 *
 * THE CLARIFICATION IS LOAD-BEARING, and it is the one the authority's printed block drops
 * (`COMPOSED-GAME.md:472`, `free = { i : i ∉ over }`). A capped entry is *equal* to `cap`, not above
 * it, so it is not in `over` on the next pass; re-freeing it hands it excess again, and the same
 * limit is then reached by an asymptote instead of by retirement. Measured, both implementations
 * side by side (`tests/job-guard.test.mjs` §4, and it is asserted, not recalled):
 *
 *     cap 0.30, y = (0.60, 0.25, 0.10, 0.05) → (0.300, 0.300, 0.267, 0.133): here 2 passes, doc 40
 *     cap 0.28, y = (0.50, 0.30, 0.15, 0.05) → (0.280, 0.280, 0.280, 0.160): here 2 passes, doc 92
 *
 * Same limit to 1e-15, wildly different pass count — so "terminates in ≤ n−1 passes" is false of
 * the printed block and true of this one. The Settings panel already prints the corrected line.
 *
 * "WATER-FILLING" IS A LOOSE NAME for what this does, and the difference is visible, so it is
 * recorded rather than papered over: the excess is shared PROPORTIONALLY to the uncapped entries,
 * where water-filling proper (the Euclidean projection onto the capped simplex) LEVELS them,
 * `y_i = min(cap, y_i + λ)`. On `(0.90, 0.08, 0.02)` with `cap = 0.75` this returns
 * `(0.750, 0.200, 0.050)` and level-filling returns `(0.750, 0.155, 0.095)`. Both are feasible and
 * sum-preserving; only the proportional rule is the one the guard draws from, it is the rule the
 * doc and the panel both print, and §4 pins the difference so that nobody "corrects" the guard's
 * distribution into the other one by renaming it.
 *
 * The sum is preserved exactly (excess is moved, never dropped), so a distribution in goes a
 * distribution out. When `n · cap < Σy` the constraint is infeasible — no vector of `n` entries can
 * both sum to `Σy` and stay under `cap` — and the projection returns the flat vector `Σy / n`,
 * which is the closest feasible point in that (unreachable for `cap ≥ 1/n`) case.
 *
 * @param {number[]} y    a distribution (non-negative; normally summing to 1)
 * @param {number} [cap]  `GUARD.cap` = 0.75
 * @returns {{y: number[], passes: number}}
 */
export function projectWithPasses(y, cap = GUARD.cap) {
  const src = Array.isArray(y) ? y : [];
  const n = src.length;
  const out = src.map((v) => Math.max(0, num(v, 0)));
  if (n === 0) return { y: out, passes: 0 };
  const c = num(cap, GUARD.cap);
  const total = sum(out);
  if (!(c > 0) || n * c < total - EPS) return { y: out.map(() => total / n), passes: 0 };

  const capped = new Set();
  let passes = 0;
  for (;;) {
    const over = [];
    for (let i = 0; i < n; i++) if (!capped.has(i) && out[i] > c + EPS) over.push(i);
    if (over.length === 0) return { y: out, passes };
    passes++;
    let excess = 0;
    for (const i of over) { excess += out[i] - c; out[i] = c; capped.add(i); }
    const free = [];
    for (let i = 0; i < n; i++) if (!capped.has(i)) free.push(i);
    if (free.length === 0) return { y: out, passes };     // unreachable while n·cap ≥ Σy
    const snapshot = free.map((i) => out[i]);
    const freeSum = sum(snapshot);
    if (freeSum > 0) free.forEach((i, k) => { out[i] += excess * (snapshot[k] / freeSum); });
    else free.forEach((i) => { out[i] += excess / free.length; });
  }
}

/**
 * G3.4 — the cap projection. `project((1−ε)x̂ + ε·uniform_n, 0.75)` is the guard's published draw.
 * @param {number[]} y
 * @param {number} [cap]  the draw cap (`GUARD.cap` = 0.75); see `projectWithPasses` on the name
 * @returns {number[]}
 */
export function project(y, cap = GUARD.cap) {
  return projectWithPasses(y, cap).y;
}

/* ==========================================================================================
   G3.4 — the published distribution
   ========================================================================================== */

/** The player's rank (G2 "Rank"), 1–5. Read from `save.player.rank`; 2 is the schema default. */
export function rankOf(save) {
  const r = typeof save === 'number' ? save : save?.player?.rank;
  return clamp(Math.trunc(num(r, 2)), 1, RANKS.length);
}

/** G2 "Rank" — the guard's mix floor `ε` for a rank (0.25 at Called 1 → 0.10 at Called 5). */
export function epsFor(rankOrSave) {
  const rank = rankOf(rankOrSave);
  return (RANKS.find((r) => r.rank === rank) ?? RANKS[0]).eps;
}

/** Normalise a support argument (array of wing ids, or a `{wing: tokens}` map) to wing ids. */
function normSupport(support) {
  if (!support) return null;
  const raw = Array.isArray(support) ? support : Object.keys(support);
  const out = WING_IDS.filter((w) => raw.includes(w));
  return out.length > 0 ? out : null;
}

/**
 * G4 "Mercy" — the guard cannot take the same wing more than three jobs running. Reads the last
 * `GUARD.sameWingMaxRuns` (3) logged guards; jobs with no guard (a REVIEW BOARD, D = 2) are skipped
 * rather than counted or treated as a break, and so are abandoned boards — Mercy exists to stop the
 * HOUSE pinning a wing, so a student who starts and quits three boards must not be able to buy a
 * wing's exemption with six seconds of clicking.
 *
 * MERCY IS NOT THE WHOLE SENTENCE, and any panel that prints it flat is printing something
 * falsifiable: `heldWing` OVERRIDES this block in `guardDist`. Three worked RECALL guards followed
 * by a board walked out on with RECALL standing draws RECALL again with probability 1, and
 * `guardDist().blocked` then reads `null` while `.held` reads `RECALL` (measured; §6b of
 * `tests/job-guard.test.mjs`). That is deliberate — the hold ends the SHOPPING for a wing (G3.7
 * proof 6) and Mercy is a promise against the House, not a lever a walked board may pull — but it
 * is a condition on the published clause, so the clause is published WITH it, from
 * `CAP_PANEL_COPY` below, rather than written out again by hand in a screen.
 * @param {object|null} save
 * @param {string[]} [support]
 * @returns {string|null} the wing this job may NOT draw, or `null`
 */
export function blockedWing(save, support = WING_IDS) {
  const runs = Math.max(1, Math.trunc(num(GUARD.sameWingMaxRuns, 3)));
  const log = Array.isArray(save?.game?.log) ? save.game.log : [];
  const recent = [];
  for (let i = log.length - 1; i >= 0 && recent.length < runs; i--) {
    if (!workedJob(log[i])) continue;                    // an abandoned board is not a job it took
    const g = log[i]?.guard;
    const wing = typeof g === 'string' ? g : (g && typeof g === 'object' ? g.wing : null);
    if (typeof wing !== 'string' || !WING_IDS.includes(wing)) continue;
    recent.push(wing);
  }
  if (recent.length < runs) return null;
  const w = recent[0];
  if (!recent.every((x) => x === w)) return null;
  const sup = normSupport(support) ?? WING_IDS;
  if (!sup.includes(w) || sup.length < 2) return null;   // nowhere else to send it
  return w;
}

/**
 * G3.7 proof 6, the half the pinned seed does not cover — "no reroll exists".
 *
 * Pinning the job seed in `inProgress.game` defends the RELOAD vector and nothing else. The job
 * index that seeds the draw counts logged jobs, and a quit writes a log entry, so quitting after the
 * wing is shown and starting again drew a fresh guard: press, look, quit, repeat, for about two
 * seconds a try. The seed was never the place to fix that — the fix is that THERE IS NOTHING TO
 * REROLL. A board abandoned before its first answer leaves its guard standing: the next board's
 * distribution is that wing with probability 1, until a job is actually worked.
 *
 * Only the most recent log entry is consulted, so one answered target releases the hold, and the
 * hold cannot outlive the board that earned it.
 *
 * ── WHAT THE HOLD DOES NOT DO, MEASURED (ROUND 6) ────────────────────────────────────────────────
 * It does not make quitting worthless. It makes the wing UNSHOPPABLE, which is a different thing,
 * and the difference is worth roughly a tenth of a board TO THE STUDENT. Driven through the shipped
 * machine — `postBoard` → `startJob` (the press is sealed and the guard is drawn and printed) →
 * `walk` → `postBoard` — over 120 seeded saves (§5c of `tests/job-guard.test.mjs`, "THE HOLD IS NOT
 * A PRICE"):
 *
 *   the walk costs nothing  `ratesElo` false, 0 banked, rating unmoved, Elo unmoved on 120/120;
 *                           the only durable write is `records.walked += 1`
 *   the board is the same   seed identical 120/120, contract lines identical 120/120
 *   the wing is now certain `guardDist().held` is the wing that was drawn, `byWing[wing] = 1`
 *   and it is worth having  against the wing already shown, a sealed press replaced by a fresh
 *                           three-token press against a KNOWN guard is better on 120 of 120 boards,
 *                           +13.56 % mean, +0.87 % at worst, +24.85 % at best; taking the re-posted
 *                           board's own pre-press instead, better on 106, equal on 14, worse on 0
 *                           (+7.61 % mean)
 *
 * It also undercuts the S5 brief-window economy it was meant to complement: a brief window buys ONE
 * token move plus a redraw, and this buys all three with no redraw, before the first envelope.
 *
 * NO FIX INSIDE THIS FILE REMOVES IT. The board publishes its distribution BEFORE the press (Global
 * law 6), so a held board must tell the student the wing, and pinning the seed on a getaway count
 * leaks it identically. The fix belongs to `state.js`/`board.js`: an abandoned board must be
 * RESUMED with its committed press, not re-posted (`notes/guard-fix.md` R1b — `startJob` refuses a
 * fresh post while a held board stands). Until it lands, `CAP_PANEL_COPY[2]` publishes the numbers
 * above rather than the sentence "quitting is worthless", which is measured false.
 *
 * @param {object|null} save
 * @returns {string|null} the wing still standing from an abandoned board, or `null`
 */
export function heldWing(save) {
  const log = Array.isArray(save?.game?.log) ? save.game.log : [];
  const last = log[log.length - 1];
  if (!last || !abandonedJob(last)) return null;
  const g = last.guard;
  const wing = typeof g === 'string' ? g : (g && typeof g === 'object' ? g.wing : null);
  return typeof wing === 'string' && WING_IDS.includes(wing) ? wing : null;
}

/**
 * THE `cap` LEGEND THE SETTINGS PANEL PRINTS, assembled from `GUARD` so that it cannot drift from
 * the constants, and carrying the two conditions the shipped draw actually has — for the same
 * reason `PRESS_PANEL_COPY` exists: the panel prints this file's behaviour or it prints a claim a
 * student can falsify in one evening.
 *
 * The two sentences it replaces were each falsifiable as published. (1) *"no wing may be drawn with
 * probability above 0.75, and the guard may not take the same wing more than 3 jobs running"* — the
 * second clause has no exception printed beside it, and `heldWing` is an exception to it (see
 * `blockedWing`). (2) The word *"unexploitable"*, used of the press: the press is not unexploitable
 * (that is `MAXIMIN_FORMULA`, and it is not what the board commits), and the cap is not a promise
 * of unexploitability either. What the cap IS, is a bound — and the bound is a bound on boards with
 * TWO OR MORE wings in play, with two named exceptions, all of which the board PRINTS before the
 * press (Global law 6), which is why they are conditions rather than leaks:
 *
 *     plain board          max y ≤ cap = 0.75                     (asserted over 3 000 random saves)
 *     Mercy, 2-wing board  the other wing is drawn with certainty  (the block empties the support)
 *     a board you walked   that wing is drawn with certainty       (the hold, G3.7 proof 6)
 *     ONE-WING board       that wing is drawn with certainty       (n·cap < 1, so there is no
 *                                                                   projection to run — see
 *                                                                   `projectWithPasses`)
 *
 * ROUND 4 — the one-wing board is the third regime, and the legend used to enumerate two. It is
 * reachable and ordinary: the RECALL wing owns 5 of the 19 makes, so an evening whose whole due list
 * is one ASN sheet posts one wing (`board.js` has a branch and a printed line for it — "one wing
 * tonight · <wing> · no press"). `blockedWing` already refuses to block a one-wing support and
 * `heldWing` may still fire there, so this is a THIRD condition and not a case of either of the
 * other two. The §6b sweep drove n ∈ {2,3,4} and therefore could not see it; it drives n ∈ {1,2,3,4}
 * now, and the one-wing regime is asserted rather than excluded.
 *
 * `tests/job-guard.test.mjs` §6b drives all four regimes through `guardDist` and asserts each
 * clause of this legend against the measurement, including that the random sweep REACHES both
 * exception regimes rather than asserting a bound it never tests.
 *
 * ROUND 7 — *"the board prints the block"* WAS NOT TRUE OF ANY PIXEL ON THE BOARD. `guardDist` sets
 * the blocked wing's `y` to exactly 0 and `guardBars` returns `blocked: true`, `screens/job.js` puts
 * that on `dataset.blocked`, and the ONE rule that reads the flag (`site/css/job.css`,
 * `.job-bar[data-blocked="true"] .job-bar-fill { background: var(--muted) }`) recolours a fill the
 * same element sets to `scaleX(0)` — a zero-width box. The word "Mercy" appears in no screen file.
 * A blocked wing was on screen as `RECALL 0 %`, and nothing else.
 *
 * Two halves, and this file owns one of them. THE COPY now claims only what a student can see — the
 * wing is printed at 0 % before the press, which `guardBars` guarantees (`pct` 0, `blocked` true) —
 * and `guardDist` now carries a `note` on a blocked board, the way it already does for the cold
 * start and the hold, so a screen has a LINE to print rather than a flag to style. Printing it is
 * `screens/job.js`'s call and is filed as a request in `notes/repair-guard.md` (R7-a), together with
 * the second half of the same defect, which is also not in this file: `screens/job.js` rebuilds the
 * distribution as `{ byWing, eps }` once the job is live, and `blocked`/`held` do not survive that
 * — `distOf` reads them off the object it is handed, so they must be handed over.
 */
export const CAP_PANEL_COPY = Object.freeze([
  `cap — on a board with two or more wings in play, no wing is drawn with probability above ${GUARD.cap}: outside the two exceptions below, the guard is never a certainty. A board that posts ONE wing is the third condition and is not an exception you have to hunt for — it prints itself, "one wing tonight", and asks for no press at all, because ${GUARD.tokens} tokens cannot change a payoff when every wing on the board is the guarded one. That bound is what the cap buys. It is not a promise that the guard cannot be out-pressed, and it is not the word "unexploitable" — that word belongs to a vector the board does not press, the maximin: ${MAXIMIN_FORMULA}.`,
  `Mercy — the guard may not take the same wing more than ${GUARD.sameWingMaxRuns} jobs running: on the fourth the wing leaves the draw entirely, and the board prints that wing at 0 % before you press. On a board with only two wings on it that sends the guard to the other wing with certainty, which is the first of the cap's two exceptions.`,
  'The second exception is the one you choose: a board you walk out on keeps its guard standing, and the next board draws that wing with probability 1 — Mercy included, because Mercy is a promise against the House and not a lever a walked board may pull. One answered target ends the hold. WHAT THE HOLD IS, AND WHAT IT IS NOT, measured over 120 shipped boards: it ends the SHOPPING — the re-posted board is the same seed and the same contracts on 120 of 120, so the wing cannot be re-rolled — and it hands you that wing for free. A walk at the board is priced at nothing: no Elo, no rating, nothing banked, one tally in records.walked. So it turns a sealed press against a wing just drawn into a fresh three-token press against a wing already known, which is better on 120 of 120 boards (+13.6 % mean, +0.9 % at worst), or better on 106 and worse on 0 taking the new board\'s own pre-press. AND IT BUYS TWO MORE FREE MOVES INSIDE THE JOB, which this list used to leave out. A brief window lets you move one token, and the price of moving it is that the guard is DRAWN AGAIN: on an ordinary board that redraw lands on a different wing 62.6 % of the time (500 shipped boards, both windows). On a held board it is drawn from a distribution that is 1 on the held wing, so it lands on the same wing 1000 times out of 1000 — the price is zero, and a JOB has two of those windows. The hold beats the re-roll; it does not make quitting worthless, and it does not leave the brief window costing anything. What would is a board RESUMED with its press instead of re-posted, and a brief redraw taken from the board\'s UNHELD distribution (`guardDist().unheld`, computed here for exactly that) instead of from the published one-hot. Both live in the state machine rather than here.',
  `So the honest sentence is the bound and its three conditions: on a board with two or more wings, and outside a held board and a ${GUARD.sameWingMaxRuns}-in-a-row block on a two-wing board, no wing is above ${GUARD.cap}; inside any of the three the board publishes a certainty, and it publishes it before you press.`,
]);

/**
 * G3.4 — the guard's PUBLISHED distribution: `y = project((1−ε)·x̂ + ε·uniform_n, cap)` over the
 * support (the wings the drafted contracts actually touch). Printed as bars with percentages
 * BEFORE the token press (Global law 6: evidence before the decision).
 *
 * On job 1 there is no `x̂`, so the mix is uniform and `note` reads `no data — uniform 1/n`
 * (`COPY.guardColdStart`) — no fabricated rating, no cold-start lie.
 *
 * @param {object|null} save
 * @param {number|{eps?: number, cap?: number, support?: string[]|object, wings?: string[],
 *                 blocked?: string|null}} [eps]  ε, or an options object
 * @param {number} [cap]  the draw cap (`GUARD.cap` = 0.75)
 * `unheld` / `unheldByWing` are the same projection BEFORE the hold flattened it onto one wing —
 * identical to `y` on every board that is not held. A caller that has to charge for a re-draw on a
 * held board (the brief window, `state.press`) needs a distribution that can still move; this is
 * it. On an unheld board the two are the same object's values, so reading `unheld` is never wrong.
 *
 * @returns {{wings: string[], n: number, eps: number, cap: number, xHat: number[], mixed: number[],
 *            y: number[], unheld: number[], byWing: Record<string, number>,
 *            unheldByWing: Record<string, number>, passes: number, blocked: string|null,
 *            held: string|null, coldStart: boolean, jobs: number, source: string,
 *            note: string|null}}
 */
export function guardDist(save, eps, cap) {
  const opts = (eps && typeof eps === 'object') ? eps : {};
  const wings = normSupport(opts.support ?? opts.wings ?? save?.support
    ?? save?.inProgress?.game?.support ?? save?.inProgress?.game?.tokens) ?? WING_IDS.slice();
  const n = wings.length;
  const e = clamp(num(opts.eps ?? (typeof eps === 'number' ? eps : undefined), epsFor(save)), 0, 1);
  const c = num(opts.cap ?? cap, GUARD.cap);

  const hat = xHatFrom(save);
  let x = wings.map((w) => (hat.coldStart ? 1 / n : Math.max(0, num(hat.byWing[w], 0))));
  const xs = sum(x);
  // A support the student has never pressed reads as uniform rather than as a divide-by-zero.
  x = xs > 0 ? x.map((v) => v / xs) : wings.map(() => 1 / n);

  let mixed = x.map((v) => (1 - e) * v + e * (1 / n));

  const blocked = Object.hasOwn(opts, 'blocked') ? opts.blocked : blockedWing(save, wings);
  const bIdx = blocked ? wings.indexOf(blocked) : -1;
  let y;
  let passes = 0;
  if (bIdx >= 0 && n >= 2) {
    // The three-in-a-row cap: the wing leaves the draw entirely, and the rest is renormalised and
    // projected over the smaller support — so a 2-wing board sends the guard to the other wing with
    // certainty rather than through an infeasible 0.75 cap.
    const keep = mixed.filter((_, i) => i !== bIdx);
    const kt = sum(keep);
    const norm = kt > 0 ? keep.map((v) => v / kt) : keep.map(() => 1 / keep.length);
    const p = projectWithPasses(norm, c);
    passes = p.passes;
    y = [];
    let k = 0;
    for (let i = 0; i < n; i++) y.push(i === bIdx ? 0 : p.y[k++]);
    mixed = mixed.map((v, i) => (i === bIdx ? 0 : v / (kt > 0 ? kt : 1)));
  } else {
    const p = projectWithPasses(mixed, c);
    y = p.y; passes = p.passes;
  }

  /* The guard you walked out on is still there (see `heldWing`). This OVERRIDES both the draw and
     Mercy: Mercy is a promise against the house, not a lever an abandoned board may pull.

     `unheld` is the distribution the board WOULD have drawn from — the projection above, before the
     hold flattened it onto one wing. It is kept because the hold makes one price disappear: the
     brief window's re-press is paid for by a REDRAW (`state.press` draws again from the board's
     stored `dist`), and a redraw from a one-hot is not a price, it is a formality. Nothing in this
     file can charge it — `state.js` owns the redraw — but the vector it needs to charge it with is
     computed here and was being thrown away. See R7-b in `notes/repair-guard.md`. */
  const held = Object.hasOwn(opts, 'held') ? opts.held : heldWing(save);
  const hIdx = held && WING_IDS.includes(held) ? wings.indexOf(held) : -1;
  const unheld = y.slice();
  if (hIdx >= 0) y = wings.map((_, i) => (i === hIdx ? 1 : 0));

  return {
    wings, n, eps: e, cap: c,
    xHat: x, mixed, y, unheld, passes,
    byWing: Object.fromEntries(wings.map((w, i) => [w, y[i]])),
    unheldByWing: Object.fromEntries(wings.map((w, i) => [w, unheld[i]])),
    blocked: hIdx >= 0 ? null : (bIdx >= 0 ? blocked : null),
    held: hIdx >= 0 ? held : null,
    coldStart: hat.coldStart, jobs: hat.jobs, source: hat.source,
    note: hIdx >= 0
      ? (COPY.guardHeld?.({ wing: held }) ?? null)
      : (bIdx >= 0 && n >= 2
        ? (COPY.guardBlocked?.({ wing: blocked, runs: GUARD.sameWingMaxRuns }) ?? GUARD_BLOCK_NOTE(blocked))
        : (hat.coldStart ? COPY.guardColdStart({ n }) : null)),
  };
}

/**
 * The line a board prints when Mercy has taken a wing out of the draw — this file's own string,
 * used when `data/job.js` has no `COPY.guardBlocked` of its own (it does not today, and `COPY` is
 * not this lane's file). It exists so `guardDist().note` is never a flag a screen has to invent
 * words for: R7-3's defect was a block with no text anywhere in the layer.
 * @param {string} wing
 * @returns {string}
 */
export const GUARD_BLOCK_NOTE = (wing) =>
  `${wing} is blocked — ${GUARD.sameWingMaxRuns} jobs running is the limit, so the guard cannot take it tonight`;

/** The bars the board prints, as whole percentages that still sum to 100 (largest remainder). */
export function guardBars(dist) {
  const d = distOf(dist);
  const pct = largestRemainder(d.y, 100);
  const held = (dist && typeof dist === 'object' && !Array.isArray(dist)) ? dist.held ?? null : null;
  return d.wings.map((w, i) => ({
    wing: w, p: d.y[i], pct: pct[i], blocked: d.blocked === w, held: held === w,
  }));
}

/* ==========================================================================================
   G3.6 — the draw
   ========================================================================================== */

/** Accept a `guardDist` result, a `{wing: p}` map, or a bare probability array. */
function distOf(dist, wings = WING_IDS) {
  if (Array.isArray(dist)) {
    const w = wings.slice(0, dist.length);
    return { wings: w, y: dist.map((v) => Math.max(0, num(v, 0))), blocked: null };
  }
  if (dist && Array.isArray(dist.y) && Array.isArray(dist.wings)) {
    return { wings: dist.wings.slice(), y: dist.y.map((v) => Math.max(0, num(v, 0))), blocked: dist.blocked ?? null };
  }
  if (dist && typeof dist === 'object') {
    const src = dist.byWing && typeof dist.byWing === 'object' ? dist.byWing : dist;
    const w = WING_IDS.filter((k) => Number.isFinite(+src[k]));
    return { wings: w, y: w.map((k) => Math.max(0, num(src[k], 0))), blocked: dist.blocked ?? null };
  }
  return { wings: [], y: [], blocked: null };
}

/**
 * G3.6 — the guard draw. Seeded from `js/rng.js` alone, so the job seed pinned in `inProgress.game`
 * replays it exactly.
 *
 * The pinned seed defends the RELOAD vector and only that one. G3.7 proof 6's "no reroll exists"
 * covers quitting because of `heldWing` — an abandoned board leaves its guard standing, so there is
 * nothing for a restart to re-draw — not because of anything the seed does. See `heldWing`.
 *
 * @param {object|number[]} dist  a `guardDist()` result, a `{wing: p}` map, or a probability array
 * @param {string|number} seed    the job seed
 * @returns {number} the index into `dist.wings`, or −1 when the distribution is empty
 */
export function drawGuardIndex(dist, seed) {
  const d = distOf(dist);
  const total = sum(d.y);
  if (d.wings.length === 0 || !(total > 0)) return -1;
  const r = rngFrom('guard', String(seed)).next() * total;
  let acc = 0;
  for (let i = 0; i < d.y.length; i++) {
    acc += d.y[i];
    if (r < acc) return i;
  }
  return d.y.length - 1;
}

/**
 * G3.6 — the guarded wing for this job. Deterministic per `(dist, seed)`.
 * @param {object|number[]} dist
 * @param {string|number} seed
 * @returns {string|null}
 */
export function drawGuard(dist, seed) {
  const d = distOf(dist);
  const i = drawGuardIndex(dist, seed);
  return i < 0 ? null : d.wings[i];
}

/* ==========================================================================================
   G3.4 — the two sides of the fixed point, and the press the board commits
   ========================================================================================== */

/**
 * G3.4's fixed point — THE GUARD'S MIX, and only the guard's.
 *
 * `v_i(1 − y_i) = k` is the condition that makes the PLAYER indifferent between the wings, and the
 * side a condition pins is the OTHER side: it is the House that has to mix this way. Read the
 * matching-pennies pair whole and the two halves are
 *
 *     guard    `y_i = 1 − k/v_i`          (this function)
 *     player   `x_i ∝ 1/v_i` on the same support, value `k`   (`maximinPress`)
 *
 * and they are opposite orderings — the guard leans on the wings worth MOST, the player presses
 * hardest where a token is worth LEAST, because that is what equalises `x_i·v_i`. So `y` is not
 * "the unexploitable press", it is what the unexploitable press is unexploitable AGAINST, and
 * pressing it scores `Σv − max` at `x = y` instead of the game's value `k`. Neither of these is
 * what the board pre-presses, because the shipped House is not a strategic minimiser at all — it
 * is a published mirror of `x̂` — and the best reply to THAT is `stationaryPress`.
 *
 * `k = (n − 1) / Σ(1/v_i)`, and a wing whose `y_i` comes out negative is worth too little to defend
 * and leaves the support; the solve repeats on what is left. The support the loop settles on is the
 * game's, so both sides above are stated over it.
 *
 * Equal values `(v, v, v)` → `k = 2v/3`, `y = (⅓, ⅓, ⅓)` — pure rotation.
 * `v = (30, 20, 10)` → wing 3 leaves, `n = 2`, `k = 12.0`, `y = (0.60, 0.40)`.
 *
 * Both of those are the ε = 0 CLOSED FORM. The dynamic that reaches them is the separate claim, and
 * it is stated — with the condition it needs and the two places it fails without it — in
 * `BEST_RESPONSE_ACCEPTANCE` above.
 *
 * @param {number[]|Record<string, number>} values
 * @param {string[]} [wings]
 * @returns {{y: number[], wings: string[], k: number, support: string[], byWing: Record<string, number>,
 *            dropped: string[]}}
 */
export function fixedPointMix(values, wings = WING_IDS) {
  const pairs = Array.isArray(values)
    ? values.map((v, i) => [wings[i] ?? String(i), Math.max(0, num(v, 0))])
    : Object.entries(values).map(([k, v]) => [k, Math.max(0, num(v, 0))]);
  const live = pairs.filter(([, v]) => v > 0);
  const dropped = pairs.filter(([, v]) => !(v > 0)).map(([k]) => k);
  if (live.length === 0) {
    const byWing = Object.fromEntries(pairs.map(([k]) => [k, pairs.length ? 1 / pairs.length : 0]));
    return { y: pairs.map(() => (pairs.length ? 1 / pairs.length : 0)), wings: pairs.map(([k]) => k), k: 0, support: pairs.map(([k]) => k), byWing, dropped: [] };
  }
  let support = live.slice().sort((a, b) => b[1] - a[1]);
  let k = 0;
  for (;;) {
    const n = support.length;
    if (n === 1) { k = 0; break; }
    const invSum = sum(support.map(([, v]) => 1 / v));
    k = (n - 1) / invSum;
    const worst = support[n - 1];
    if (1 - k / worst[1] >= -EPS) break;
    dropped.push(worst[0]);
    support = support.slice(0, n - 1);
  }
  const mix = new Map(support.map(([w, v]) => [w, support.length === 1 ? 1 : Math.max(0, 1 - k / v)]));
  const order = pairs.map(([w]) => w);
  const y = order.map((w) => mix.get(w) ?? 0);
  return {
    y, wings: order, k,
    support: support.map(([w]) => w),
    byWing: Object.fromEntries(order.map((w, i) => [w, y[i]])),
    dropped,
  };
}

/**
 * The PLAYER's half of `fixedPointMix` — the matching-pennies MAXIMIN press, `x_i ∝ 1/v_i` over the
 * support `fixedPointMix` settles on, which guarantees the game's value `k` against ANY guard,
 * including one that reads the press and guards the best wing for it.
 *
 * This is the vector the phrase "the unexploitable press" names. It is NOT `y_i = 1 − k/v_i`
 * (that is the guard's) and it is NOT "in proportion to study value" (that is its reciprocal): it
 * equalises `x_i·v_i` across the support, so that the guard has no wing it prefers to take.
 *
 * It is published here as EVIDENCE and as the honest referent of that phrase, not as the board's
 * advice. The shipped House does not minimise — `y` mirrors `x̂` (G3.4) — so against the mechanism
 * that actually runs, `stationaryPress` beats this, and `stationaryPress` is what the button
 * commits. Both numbers are on the record, with the guard each is optimal against.
 *
 * `v = (30, 20, 10)` → support `{30, 20}`, `k = 12.0`, `x = (0.40, 0.60, 0)` — worth 12.0 against a
 * minimising guard, where `y = (0.60, 0.40, 0)` pressed by the player is worth 8.0.
 *
 * @param {number[]|Record<string, number>} values
 * @param {string[]} [wings]
 * @returns {{x: number[], wings: string[], byWing: Record<string, number>, support: string[],
 *            k: number, value: number}}
 */
export function maximinPress(values, wings = WING_IDS) {
  const eq = fixedPointMix(values, wings);
  const order = eq.wings;
  const v = Array.isArray(values)
    ? order.map((_, i) => Math.max(0, num(values[i], 0)))
    : order.map((w) => Math.max(0, num(values[w], 0)));
  const inSupport = order.map((w) => eq.support.includes(w));
  const invSum = sum(order.map((_, i) => (inSupport[i] && v[i] > 0 ? 1 / v[i] : 0)));
  const x = invSum > 0
    ? order.map((_, i) => (inSupport[i] && v[i] > 0 ? (1 / v[i]) / invSum : 0))
    : order.map(() => (order.length ? 1 / order.length : 0));
  return {
    x, wings: order, byWing: Object.fromEntries(order.map((w, i) => [w, x[i]])),
    support: eq.support.slice(), k: eq.k, value: eq.k,
  };
}

/**
 * The PLAYER's press against the guard THIS FILE ACTUALLY IMPLEMENTS, and the one the primary
 * button commits.
 *
 * `fixedPointMix` solves `v_i(1 − y_i) = k`: that is the mixing which makes the PLAYER indifferent,
 * i.e. it is the HOUSE's strategy, and pre-pressing it was strictly dominated — it is beaten by a
 * flat press, and on `v = (30, 20, 10)` it guarantees 8.0 against the flat press's 10.0 and the
 * optimum's 12.0. This function solves the player's side against the guard the code actually
 * implements: `y_i = (1 − ε)·x̂_i + ε/n`, and a repeated press IS `x̂`, so
 *
 *   `U(p) = Σ p_i · v_i · (1 − (1−ε)p_i − ε/n)`
 *   `∂U/∂p_i = λ  ⟹  p_i = A − B/v_i`,  `A = (1 − ε/n) / (2(1 − ε))`,  `B = (|S|·A − 1) / Σ_{S}(1/v_i)`
 *
 * `p` is non-decreasing in `v_i` — `B = (|S|·A − 1)/Σ_S(1/v_i) ≥ 0`, because `A ≥ ½` and `|S| ≥ 2`
 * on every support the loop keeps — so a wing is never pressed harder than one with a larger `v_i`,
 * and `p` is POSITIVE ON THE SUPPORT IT KEEPS.
 *
 * **THAT ORDERING IS BY STUDY VALUE AND BY NOTHING ELSE** (ROUND 6). The `v` `pressAdvice` hands
 * this function is `vPress`, which is the RAW study value on every wing except one the guard is
 * CERTAIN to take (`y_i ≥ 1 − EPS`), which is zeroed — so on a held board the highest-study-value
 * wing can be the one that is dropped, and everywhere else `p` follows `v`. It does NOT follow
 * `marginal_i = 0.25·v_i·(1 − y_i)`, the value `pressAdvice` publishes for a token on wing *i*:
 * `(1 − y_i)` is not in this solve at all. Where tonight's `y` reverses the `v` ordering the two
 * disagree, and they disagree on 17.6 % of 500 shipped `postBoard` boards (2.8 % in whole tokens).
 * That is correct and deliberate — `p` is the stationary reply to the `y` a repeated press creates,
 * not the greedy reply to the bars on screen, and Global law 6 forbids the board to pre-fill the
 * greedy one — but it is not what `PRESS_PANEL_COPY` used to say, so the sentence was corrected
 * rather than the solve. See the ROUND 6 block on `PRESS_PANEL_COPY`. It is NOT positive on every wing
 * of every board: a wing whose `p_i` comes out negative is worth too little to press at all and
 * leaves the support, exactly as in `fixedPointMix`. That is the ordinary case on a four-wing board,
 * not a corner — 55.6 % of the four-wing boards in the 500-save `postBoard` corpus press a support
 * wing at 0, and `v = (58.5, 131.25, 71.25, 18)`, a real one, drops its fourth wing at every rank's
 * ε. "Spread pressure across the wings" therefore means across the wings the press keeps, and
 * `PRESS_PANEL_COPY` says so; the universal it used to say is measured false in §PRESS_PANEL_COPY
 * of `tests/job-guard.test.mjs`.
 *
 * @param {number[]|Record<string, number>} values
 * @param {string[]} [wings]
 * @param {{eps?: number, n?: number}} [opts]  ε, and the guard's support size (default `wings.length`)
 * @returns {{p: number[], wings: string[], byWing: Record<string, number>, support: string[],
 *            dropped: string[], A: number, B: number, eps: number, n: number}}
 */
export function stationaryPress(values, wings = WING_IDS, opts = {}) {
  const pairs = Array.isArray(values)
    ? values.map((v, i) => [wings[i] ?? String(i), Math.max(0, num(v, 0))])
    : Object.entries(values).map(([k, v]) => [k, Math.max(0, num(v, 0))]);
  const order = pairs.map(([w]) => w);
  const n = Math.max(1, Math.trunc(num(opts.n, order.length || 1)));
  const eps = clamp(num(opts.eps, 0), 0, 0.999999);
  const A = (1 - eps / n) / (2 * (1 - eps));

  const live = pairs.filter(([, v]) => v > 0);
  const dropped = pairs.filter(([, v]) => !(v > 0)).map(([k]) => k);
  const flat = () => ({
    p: order.map(() => (order.length ? 1 / order.length : 0)), wings: order,
    byWing: Object.fromEntries(order.map((w) => [w, order.length ? 1 / order.length : 0])),
    support: order.slice(), dropped: [], A, B: 0, eps, n,
  });
  if (live.length === 0) return flat();

  let support = live.slice().sort((a, b) => b[1] - a[1]);   // highest value first
  let B = 0;
  for (;;) {
    const m = support.length;
    if (m === 1) { B = 0; break; }
    const invSum = sum(support.map(([, v]) => 1 / v));
    B = (m * A - 1) / invSum;
    const worst = support[m - 1];
    if (A - B / worst[1] >= -EPS) break;
    dropped.push(worst[0]);
    support = support.slice(0, m - 1);
  }
  const mix = new Map(support.map(([w, v]) => [w, support.length === 1 ? 1 : Math.max(0, A - B / v)]));
  const raw = order.map((w) => mix.get(w) ?? 0);
  const t = sum(raw);
  const p = t > 0 ? raw.map((v) => v / t) : order.map(() => 1 / order.length);
  return {
    p, wings: order, byWing: Object.fromEntries(order.map((w, i) => [w, p[i]])),
    support: support.map(([w]) => w), dropped, A, B, eps, n,
  };
}

/** Largest-remainder apportionment of `total` whole units over the shares in `mix`. */
function largestRemainder(mix, total) {
  const t = sum(mix.map((v) => Math.max(0, num(v, 0))));
  if (!(t > 0) || mix.length === 0) return mix.map(() => 0);
  const exact = mix.map((v) => (Math.max(0, num(v, 0)) / t) * total);
  const base = exact.map((v) => Math.floor(v + EPS));
  let left = total - sum(base);
  const order = exact
    .map((v, i) => ({ i, rem: v - Math.floor(v + EPS) }))
    .sort((a, b) => (b.rem - a.rem) || (a.i - b.i));
  for (let k = 0; left > 0 && k < order.length; k++, left--) base[order[k].i] += 1;
  for (let k = 0; left > 0; k++) { base[order[k % order.length].i] += 1; left--; }
  return base;
}

/**
 * G3.4 — what the token row shows BEFORE the press, and what the primary button pre-presses.
 *
 * THREE DIFFERENT VECTORS, THREE DIFFERENT NAMES. This object used to return two of them and call
 * one of them `equilibrium`, while the board pre-pressed the other — so "the equilibrium" named
 * whichever one the reader happened to be looking at, and the Settings panel published the one that
 * loses. Nothing here is called "the equilibrium" any more:
 *
 *   `guardMix`  `y_i = 1 − k/v_i`  — the GUARD's mixing (`fixedPointMix`). Evidence, never advice.
 *                                    Pressed by the player it is worth `Σv − max`, not `k`.
 *   `maximin`   `x_i ∝ 1/v_i`      — the PLAYER's maximin (`maximinPress`), worth the game's value
 *                                    `k` against any guard at all, a minimising one included.
 *   `press`     `p_i = A − B/v_i`  — the best reply to the guard THIS LAYER SHIPS, whose `y` mirrors
 *                                    `x̂` rather than minimising (`stationaryPress`). `tokens`
 *                                    apportions THIS one, because this is the House that exists.
 *
 * `marginal_i = 0.25 · v_i · (1 − y_i)` is the marginal value of one token on wing *i* — the
 * evidence. `bestResponseWing` is the greedy argmax and is DEBRIEF/Settings material (Global law 6
 * — never a pre-choice recommendation), exactly as `call.argmaxCall` is.
 *
 * **THE ARGMAX IS A SET, AND ON THIS BOARD IT USUALLY HAS MORE THAN ONE MEMBER**, which is why
 * `bestResponseWings` is returned next to it. `x̂` is a TEN-job window pressed in THREE whole
 * tokens (`GUARD.xHatWindowJobs`, `GUARD.tokens`), so the reachable `y` are multiples of 1/10 and
 * `v_i(1 − y_i)` ties EXACTLY rather than nearly: a 500-job best-response run on
 * `v = (30, 20, 10)` is tied on 63 % of its jobs, and on equal `v` on 73 % of them (counted by the
 * suite itself: `simulateShipped` returns `tiedFraction`, §10).
 * Taking the first wing of `WING_IDS` out of that set is therefore not a neutral default — it is a
 * standing bias toward RECALL, and it was large enough to move the game's own acceptance figures:
 * settled by index order the shipped best-response loop cycles with period 11 and averages
 * `(7/11, 4/11)` rather than `(0.60, 0.40)`, and `(4/11, 4/11, 3/11)` rather than uniform for equal
 * `v`. Settle the *same* ties uniformly — which is what a best response to an indifference is — and
 * the shipped loop lands on `(0.58, 0.42)` and on uniform to 0.005, at every rank. Both readings are
 * asserted, with their numbers, in §10 of the suite.
 *
 * So: pass the job seed as `opts.seed` and the pick is a seeded uniform draw from the tied set
 * (G3.6 — every draw in this file goes through `js/rng.js`, so it stays reproducible). With no seed
 * the pick stays index-order and deterministic, because every caller that exists is.
 *
 * @param {object|number[]} dist               a `guardDist()` result
 * @param {Record<string, number>|number[]|{byWing: object}} values  `wingValues()`'s `byWing`
 * @param {{seed?: string|number}} [opts]      a job seed, to settle a tied argmax uniformly
 * @returns {{wings: string[], y: number[], v: number[], marginal: number[],
 *            byWing: Record<string, {y, v, marginal, tokens, guardMix, maximin, press}>,
 *            guardMix: number[], maximin: number[], press: number[], k: number, value: number,
 *            support: string[], tokens: Record<string, number>, total: number,
 *            bestResponseWing: string|null, bestResponseWings: string[]}}
 */
export function pressAdvice(dist, values, opts = {}) {
  const d = distOf(dist);
  const wings = d.wings.length ? d.wings : WING_IDS.slice();
  const src = Array.isArray(values) ? values
    : (values && typeof values === 'object' ? (values.byWing ?? values) : {});
  const v = Array.isArray(src)
    ? wings.map((_, i) => Math.max(0, num(src[i], 0)))
    : wings.map((w) => Math.max(0, num(src[w], 0)));
  const y = wings.map((_, i) => Math.max(0, num(d.y[i], 0)));

  const marginal = wings.map((_, i) => GUARD.tokenBonus * v[i] * (1 - y[i]));
  const eq = fixedPointMix(v, wings);
  const eps = Number.isFinite(+dist?.eps) ? +dist.eps : epsFor(null);
  /* A wing the guard is CERTAIN to take this job (a held wing — see `heldWing`) pays `guardMult`,
     not `1 + 0.25·tokens`, so a token on it is not a gamble, it is a waste. It leaves the press
     support the same way a worthless wing does. The blocked wing (G4 "Mercy") is the mirror case —
     guaranteed safe, so it never loses its bonus — and is left to the student and to
     `bestResponseWing`, because a pre-pressed greedy argmax is what Global law 6 forbids. */
  const vPress = v.map((vi, i) => (y[i] >= 1 - EPS ? 0 : vi));
  const mix = stationaryPress(vPress, wings, { eps, n: wings.length });
  const total = Math.max(0, Math.trunc(num(GUARD.tokens, 3)));
  const counts = largestRemainder(mix.p, total);

  /* The argmax SET, not its first member — see the header. The tolerance is relative, because the
     ties this grid produces are exact in arithmetic and 1-ulp apart in floating point
     (`30·(1 − 0.6)` against `20·(1 − 0.4)`). */
  const bestV = wings.length ? Math.max(...marginal) : -Infinity;
  const tieTol = 1e-9 * Math.max(1, Math.abs(bestV));
  const tiedBest = wings.filter((_, i) => marginal[i] >= bestV - tieTol);
  const seed = opts?.seed;
  const best = tiedBest.length === 0
    ? null
    : (seed == null ? tiedBest[0] : (rngFrom('press', String(seed)).pick(tiedBest) ?? tiedBest[0]));

  const mm = maximinPress(v, wings);
  return {
    wings, y, v, marginal,
    guardMix: eq.y, maximin: mm.x, k: eq.k, value: eq.k, support: eq.support,
    press: mix.p, pressSupport: mix.support, eps, A: mix.A, B: mix.B,
    tokens: Object.fromEntries(wings.map((w, i) => [w, counts[i]])),
    total,
    byWing: Object.fromEntries(wings.map((w, i) => [w, {
      y: y[i], v: v[i], marginal: marginal[i], tokens: counts[i],
      guardMix: eq.y[i], maximin: mm.x[i], press: mix.p[i],
    }])),
    bestResponseWing: best,
    bestResponseWings: tiedBest,
  };
}

/* ==========================================================================================
   G3.5 — Elo
   ========================================================================================== */

/** `E_player = 1/(1 + 10^((R_house − R_player)/400))`. */
export function expectedScore(rPlayer, rHouse) {
  return 1 / (1 + 10 ** ((num(rHouse, ELO.houseSeed) - num(rPlayer, ELO.seedBase)) / ELO.divisor));
}

/**
 * G3.5 — one symmetric Elo update, `K = 24`. The two ratings move by equal and opposite amounts, so
 * `R_player + R_house` is invariant: a player win raises `R_player` AND lowers `R_house`, which is
 * exactly why the vault grade must read `R_player` (G12 #8).
 *
 * @param {number} rp        `R_player`
 * @param {number} rh        `R_house`
 * @param {number|boolean} outcome  1 / `true` = the player won (`BAGGED ≥ posted`), 0 = lost, 0.5 = draw
 * @returns {{player: number, house: number, delta: number, deltaHouse: number,
 *            expected: number, expectedHouse: number, k: number}}
 */
export function elo(rp, rh, outcome) {
  const P = num(rp, ELO.seedBase);
  const H = num(rh, ELO.houseSeed);
  const o = outcome === true ? 1 : outcome === false ? 0 : clamp(num(outcome, 0), 0, 1);
  const k = num(ELO.k, 24);
  const e = expectedScore(P, H);
  const delta = k * (o - e);
  return {
    player: P + delta,
    house: H - delta,
    delta,
    deltaHouse: -delta,
    expected: e,
    expectedHouse: 1 - e,
    k,
  };
}

/** G3.5 — `outcome = 1 if BAGGED ≥ posted else 0`. */
export function eloOutcome({ bagged = 0, posted = 0 } = {}) {
  return ELO.winIfBaggedAtLeastPosted && num(bagged, 0) >= num(posted, 0) ? 1 : 0;
}

/**
 * G3.5 — the seeds. `R_player = clamp(1000 + 4·(placementScore − 50), 800, 1400)`, `R_house = 1000`.
 * If placement is skipped (S7 allows it) BOTH seed at 1000, and Settings says so (G12 #40c).
 * @param {{placementScore?: number|null, skipped?: boolean}} [o]
 */
export function eloSeed({ placementScore = null, skipped = false } = {}) {
  if (skipped || placementScore == null || !Number.isFinite(+placementScore)) {
    return { player: ELO.skippedPlacementSeed, house: ELO.houseSeed, placement: false };
  }
  const p = ELO.seedBase + ELO.seedPerPlacementPoint * (+placementScore - 50);
  return { player: clamp(p, ELO.seedMin, ELO.seedMax), house: ELO.houseSeed, placement: true };
}

/**
 * G3.5 "Flow control, printed never silent" — after two consecutive jobs with
 * `BAGGED < 0.5 · posted`, **`R_player − 40`** and the next board opens with a FOOTHOLD.
 * It moves `R_player` ONLY; `R_house` is untouched, so the adjustment is never confusable in sign
 * with losing (which moves both).
 *
 * Two things the window is NOT, both of which it used to be:
 *
 * 1. **It is not the raw log.** `state.endJob` writes a log entry for every exit, a quit included,
 *    carrying the board's full `posted` and `bagged: 0` — which satisfies `bagged < 0.5·posted`
 *    exactly. Three one-tap walks off the board therefore cost 80 R_player and silently demoted the
 *    next vault a whole tier, in the same function whose own `ratesElo` gate exists to stop a quit
 *    counting. Only jobs that were WORKED are read here.
 * 2. **It is not re-armed by the job that just fired it.** The penalty fires once on the transition
 *    INTO the pattern, so a run of three bad jobs costs 40 rather than 80 and a run of four costs 40
 *    rather than 120. One job that clears the bar re-arms it.
 *
 * @param {object|Array} saveOrLog  the save, or `save.game.log` directly
 * @returns {{fire: boolean, deltaPlayer: number, deltaHouse: 0, foothold: object|null, jobs: number,
 *            played: number, streak: number, armed: boolean}}
 */
export function flowControl(saveOrLog) {
  const log = Array.isArray(saveOrLog) ? saveOrLog : (Array.isArray(saveOrLog?.game?.log) ? saveOrLog.game.log : []);
  const need = Math.max(1, Math.trunc(num(ELO.flowJobs, 2)));
  const played = log.filter(workedJob);
  const under = (r) => {
    const posted = num(r?.posted, 0);
    return posted > 0 && num(r?.bagged, 0) < ELO.flowThreshold * posted;
  };
  let streak = 0;
  for (let i = played.length - 1; i >= 0 && under(played[i]); i--) streak++;
  const before = played.length > need ? played[played.length - need - 1] : null;
  const armed = !(before && under(before));
  /* The job that just ended must BE the one that completed the pattern. Without this a walk taken
     after the penalty has fired re-fires it — `state.endJob` evaluates flow control on every exit,
     and a walk adds no worked job for `armed` to see. */
  const justCompleted = log.length > 0 && workedJob(log[log.length - 1]);
  const pending = streak >= need;
  const fire = pending && armed && justCompleted;
  return {
    fire,
    /* The PENALTY fires once, on the exit that completed the pattern. The FOOTHOLD is a state of the
       next board, so it stands for as long as the pattern does — a walk taken in between must not
       quietly cancel it, and a third bad job must not cancel it either. `board.postBoard` reads
       `pending` (through `footholdFor`); `state.endJob` reads `fire`. */
    pending,
    deltaPlayer: fire ? num(ELO.flowPenalty, -40) : 0,
    deltaHouse: 0,
    foothold: fire ? ELO.footholdContract : null,
    jobs: Math.min(played.length, need),
    played: played.length,
    streak,
    armed,
  };
}

/**
 * G3.5 "the next board opens with a FOOTHOLD" — what `board.postBoard` must put in contract 1 while
 * the flow-control pattern stands: three tier-1 dues at guard ×0.5, labelled `COPY.foothold()` ON
 * THE BOARD. Exported as one call so the board never has to re-derive the window.
 *
 * It reads `pending`, not `fire`: the −40 is charged once, by `endJob`, but the easier board is a
 * state the student is in, and a walk taken between the two does not end it.
 *
 * `contract` is a COPY, so a board may not edit `ELO.footholdContract` under everybody else.
 *
 * @param {object|Array} saveOrLog
 * @returns {{fire: boolean, contract: object|null, label: string|null, deltaPlayer: number}}
 */
export function footholdFor(saveOrLog) {
  const flow = flowControl(saveOrLog);
  return {
    fire: flow.pending,
    contract: flow.pending ? { ...ELO.footholdContract } : null,
    label: flow.pending ? (COPY.foothold?.() ?? 'FOOTHOLD') : null,
    deltaPlayer: flow.deltaPlayer,
  };
}

/**
 * Apply flow control to an `{player, house}` elo record. `house` is returned unchanged — that is
 * the criterion (G12 #8), not an implementation detail.
 * @param {{player?: number, house?: number}} eloState
 * @param {object|Array} saveOrLog
 */
export function applyFlowControl(eloState, saveOrLog) {
  const flow = flowControl(saveOrLog);
  return {
    player: num(eloState?.player, ELO.seedBase) + flow.deltaPlayer,
    house: num(eloState?.house, ELO.houseSeed),
    flow,
  };
}

/* ==========================================================================================
   G3.5 — the vault grade
   ========================================================================================== */

/**
 * G3.5 — the ONE dial `R_player` drives: the grade of the final all-in.
 * `< 1000` → tier ≤ 2 · `1000–1199` → tier 3 · `≥ 1200` → tier 4.
 * It reads `R_player` and nothing else — a win raises it, a loss lowers it (G12 #8).
 * @param {number} rPlayer
 * @returns {number} the vault's tier (2, 3 or 4)
 */
export function vaultGradeFor(rPlayer) {
  return vaultGradeRowFor(rPlayer).tier;
}

/**
 * The same, with the row's own shape: `{tier, tierMax, from, to}`. The lowest band publishes a
 * `tierMax` ("tier ≤ 2") rather than a fixed tier, because a weak player's vault may be easier
 * still if the packet has nothing harder cleared.
 * @param {number} rPlayer
 */
export function vaultGradeRowFor(rPlayer) {
  const r = num(rPlayer, ELO.seedBase);
  // The bands are HALF-OPEN on their lower bound: `1000–1199` means `[1000, 1200)`. Elo ratings are
  // fractional (K·(o − E) is never an integer after the first update), so a closed `≤ 1199` reading
  // would drop 1199.4 through the floor. The `below` row is the implicit (−∞, below) head.
  const lows = VAULT_GRADE.map((row) => (Number.isFinite(row.from) ? row.from : -Infinity));
  let i = 0;
  for (let k = 0; k < lows.length; k++) if (r >= lows[k]) i = k;
  const row = VAULT_GRADE[i];
  const hi = i + 1 < lows.length ? lows[i + 1] : Infinity;
  return {
    tier: Number.isFinite(row.tier) ? row.tier : row.tierMax,
    tierMax: Number.isFinite(row.tierMax) ? row.tierMax : row.tier,
    from: Number.isFinite(row.from) ? row.from : null,
    to: Number.isFinite(hi) ? hi : null,          // exclusive upper bound
  };
}

/* re-exported rounding helpers, so a caller printing a guard percentage uses J1's rounding */
export { round, r3 };
