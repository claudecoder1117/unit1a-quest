/**
 * pay.js — THE PAYOFF TABLE. designs/CUT-SPEC.md §2 "The calls", §3 "Streak", §4 "Bank or push".
 *
 * THE FILENAME. This was `econ.js` while seven lanes built against it in parallel: the three
 * importers (`job/state.js`, `screens/job.js`, `screens/settings.js`) and `sw.js`'s precache belonged
 * to four other lanes, and a rename that half-lands is a blank screen. The lanes have landed, so the
 * integration pass took CUT-SPEC §8's name in one move, with the importers. There is still exactly
 * ONE payoff module — the thing the rename was meant to protect — and no `econ.js` beside it.
 * `tests/job-pay.test.mjs` is CUT-SPEC §7 against this file.
 *
 * DOM-FREE and dependency-free: plain node imports it (BUILD-POLICY §2), and nothing here reads a
 * clock (CUT-BRIEF math #7 — "answers tick; time does not").
 *
 * Whole points only. `m` is the streak multiplier (1…5), `P` the pile, and `S` THE SHARE — half of
 * whatever the pile holds above 40, which is the largest bite the flat table itself can take
 * (`sure` at ×5). Below 40 the share is nothing and this is the flat table exactly.
 *
 *   not sure     right  P += 8m    wrong  P −= min(P, 2m + S)   always offered
 *   pretty sure  right  P += 9m    wrong  P −= min(P, 4m + S)   offered at P ≥ 4m
 *   sure         right  P += 10m   wrong  P −= min(P, 8m + S)   offered at P ≥ 8m
 *
 * WHY THE SHARE EXISTS (r1, player-feel + exploit-hunt). With a flat bite the indifference rate
 * `q* = cost / (cost + pay − 8)` does not contain the pile at all: the bank decision at pile 8 and
 * at pile 600 was byte-identical, banking was right only at ×1, and never touching the button cost
 * a student who is right 4 times in 5 exactly nothing. CUT-BRIEF's second surviving idea is a pile
 * you can LOSE, and its feel section promises "the bank decision getting harder". A bite of 8m out
 * of a pile of 600 is neither.
 *
 * WHY IT IS THE SAME SHARE FOR ALL THREE CALLS, and why it starts at 40. The share is added to
 * every call's price identically, so it CANCELS in every comparison between calls: the band edges
 * stay exactly 2/3 and 4/5 at every pile and every streak, which is what lets Settings print three
 * fixed bands (CUT-BRIEF math #1 and #2). A share that differed by call would move the edges with
 * the pile and make that copy false. And 40 is not a tuning knob: it is `COSTS.sure × MULT_MAX`,
 * the biggest number this table can charge. Starting there is what keeps the GATE below untouched —
 * a call is offered exactly when the pile covers its full price, and the ladder (0, 8, 24, 48, 80 —
 * one right answer opens the second call, two open the third) is the flat table's, unchanged.
 *
 * Expected points at hit rate `q` are `10q−2−S′`, `13q−4−S′`, `18q−8−S′` with `S′ = (1−q)S`, so
 * **not sure** is uniquely optimal below 2/3, **pretty sure** between 2/3 and 4/5, **sure** above
 * 4/5; a tie at an edge takes the lower call. `m` scales pay and bite alike, so the edges hold at
 * every multiplier, and `S` is common, so they hold at every pile.
 */

/** The three calls, cheapest first. The id is the string the screen prints. */
export const CALLS = Object.freeze(['not sure', 'pretty sure', 'sure']);

/** What a right answer adds, before the streak multiplier. */
export const PAYS = Object.freeze({ 'not sure': 8, 'pretty sure': 9, sure: 10 });

/** What a wrong answer takes, before the streak multiplier (capped at the pile). */
export const COSTS = Object.freeze({ 'not sure': 2, 'pretty sure': 4, sure: 8 });

/** The streak multiplier caps at ×5 (CUT-SPEC §3). */
export const MULT_MAX = 5;

/** What the first question after a bank pays: not sure, ×1, empty pile. */
export const BASE_PAY = PAYS[CALLS[0]];

const isCall = (c) => Object.prototype.hasOwnProperty.call(PAYS, c);
const int = (x, d = 0) => (Number.isFinite(+x) ? Math.trunc(+x) : d);

/**
 * A streak, as a price. The multiplier is CAPPED HERE as well as in the state machine: ×5 is the
 * last rung §3 defines, so there is no such thing as the price at ×6 — a caller holding a larger
 * number must not be handed one, or the screen prints a number the game can never charge.
 */
const mOf = (m) => Math.min(MULT_MAX, Math.max(1, int(m, 1)));

/**
 * A pile, as a number: whole points, never negative, always finite. A missing pile is an empty one.
 *
 * THE SENTINEL IS GONE. `costOf` used to take `pile = Infinity`, "no pile to cap against", because
 * the price did not depend on the pile. It does now, so there is no such thing as this call's cost
 * at an unknown pile, and a caller that omits it is asking the price at an empty pile — which is
 * nothing, because a loss can only ever come out of the pile (CUT-BRIEF math #8).
 */
const pOf = (pile) => Math.max(0, int(pile, 0));

/**
 * The pile is only at stake ABOVE the biggest bite the flat table can take — `sure` at ×5. Below
 * it, a wrong answer takes the call's bite and nothing else, exactly as it always did.
 */
const RISK_FROM = COSTS[CALLS[2]] * MULT_MAX;

/**
 * THE SHARE: half of the pile above `RISK_FROM`, floored to a whole point. One division, on a whole
 * number of points, floored — so every price this module returns is still an integer, and the same
 * pile always yields the same share (nothing here reads a clock or a die).
 */
const shareOf = (P) => (P > RISK_FROM ? Math.floor((P - RISK_FROM) / 2) : 0);

/** The streak multiplier for `n` right answers since the last wrong answer or bank: `1 + n`, ≤ 5. */
export const mult = (n) => mOf(1 + Math.max(0, int(n, 0)));

/** What this call pays at this streak. */
export const payOf = (call, m = 1) => (isCall(call) ? PAYS[call] * mOf(m) : 0);

/**
 * What a wrong answer takes at this streak and this pile: the call's bite, plus the share of the
 * pile above `RISK_FROM`, capped at the pile. The gate below means the cap never binds on an
 * OFFERED call that sits beside an alternative — the only two states where it binds at all
 * (`pile 0 ×1` and `pile 1 ×1`) offer one call, so no comparison is ever made at a capped price.
 * The cap is what makes CUT-BRIEF math #8 structural: a loss can only ever empty the pile.
 */
export const costOf = (call, m = 1, pile = 0) => (isCall(call)
  ? Math.min(pOf(pile), COSTS[call] * mOf(m) + shareOf(pOf(pile)))
  : 0);

/**
 * The calls this pile covers at full price, cheapest first. *Not sure* is always offered; the other
 * two are offered only when the pile covers their full cost, which is what makes the payoff table
 * above true. Unaffordable calls are greyed, never hidden (CUT-SPEC §2).
 *
 * Minimum pile by streak is 0, 8, 24, 48, 80, so **one right answer opens the second call and two
 * open the third** — the ladder a student climbs without being told it exists.
 */
export function offered(pile, m = 1) {
  const P = pOf(pile);
  const k = mOf(m);
  const S = shareOf(P);
  /* THE FULL PRICE, share included — which is what keeps the cap from ever binding beside an
     alternative. It is also, at every pile, the SAME SET the flat gate `P ≥ COSTS[c] × k` gives:
     the share is at most `(P − 40)/2` and a bite is at most 40, so `COSTS[c]×k + S ≤ P` the moment
     `COSTS[c]×k ≤ P`. The ladder is the flat table's, and `tests/job-pay.test.mjs` proves the two
     gates agree at every pile and streak rather than taking this comment's word for it. */
  return CALLS.filter((c, i) => i === 0 || P >= COSTS[c] * k + S);
}

/** Is this call affordable at this pile and streak? */
export const canCall = (call, pile, m = 1) => isCall(call) && offered(pile, m).includes(call);

/**
 * IS THERE ANYTHING TO DECIDE HERE? (r4, player-feel.)
 *
 * The face-down card asks a question, and at an EMPTY PILE the table has no question to ask. Every
 * call costs `min(P, …)`, so at `P = 0` nothing can be lost; a call that cannot be lost on is free
 * money, and the gate is what keeps `sure` from being exactly that — which leaves *not sure* alone
 * on the card, one control with one possible value. Banking is the other decision and it is not one
 * either: there is nothing in the pile to take. So the student was made to tap a control that could
 * only say one thing before the question would appear, on the first card of every session and after
 * every bank — the dead tap `job/state.js sealRepeat` names as banned, opening the game.
 *
 * This is the table's own answer to it, because the table is what makes it true: **a state decides
 * something when more than one call is offered, or when there is a pile to bank.** `screens/job.js`
 * asks before it draws the card, and where the answer is no it locks the one call there is and goes
 * straight to the question — one tap for that question instead of two, no control that buys nothing,
 * and not one number added to the screen.
 *
 * It is NOT a rule about what may be played: `offered` is unchanged, `canCall` is unchanged, and a
 * caller that locks *not sure* at an empty pile gets exactly what it always got.
 */
export const decides = (pile, m = 1) => offered(pile, m).length > 1 || pOf(pile) > 0;

/**
 * The call that maximises expected points at true hit rate `q`. Integer comparisons, so the two
 * edges are exact: `q = 2/3` takes *not sure* and `q = 4/5` takes *pretty sure* (ties take the
 * lower call). A rate the app has never measured (`new`) is not a reason to spend, so it calls
 * *not sure*.
 */
export function honestCall(q) {
  const x = Number.isFinite(+q) ? +q : 0;
  if (3 * x <= 2) return CALLS[0];
  if (5 * x <= 4) return CALLS[1];
  return CALLS[2];
}

/** Where each call is uniquely optimal. Settings prints these three lines and nothing else. */
export const BANDS = Object.freeze([
  Object.freeze({ call: 'not sure', lo: 0, hi: 2 / 3, copy: 'not sure — you get it right less than 2 times in 3' }),
  Object.freeze({ call: 'pretty sure', lo: 2 / 3, hi: 4 / 5, copy: 'pretty sure — between 2 in 3 and 4 in 5' }),
  Object.freeze({ call: 'sure', lo: 4 / 5, hi: 1, copy: 'sure — more than 4 in 5' }),
]);

/**
 * PUSH when `h × (pay − 8) > (n − h) × cost`, otherwise BANK (CUT-SPEC §4). `8` is what the first
 * question after a bank pays, so the left side is what pushing wins OVER banking and the right side
 * is what it risks. Never printed during play — the app does not advise; this is the rule the tests
 * hold the design to.
 * @param {{hits:number, of:number, pay:number, cost:number}} o
 * @returns {boolean} true to push
 */
export function shouldPush({ hits = 0, of = 0, pay = 0, cost = 0 } = {}) {
  const h = Math.max(0, int(hits, 0));
  const n = Math.max(h, int(of, 0));
  return h * (int(pay, 0) - BASE_PAY) > (n - h) * int(cost, 0);
}
