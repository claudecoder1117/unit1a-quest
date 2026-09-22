// screens/job.js — J6. THE JOB, the only DOM file in the game layer.
//
// COMPOSED-GAME.md G1 (the loop), G3 (the mechanics it prints), G6 (fiction, keys, juice),
// G7 ("the only DOM file: board sheet, envelope, call row, mounts card.js's answering body, payout
// line, bag/push, brief sheet, getaway"), G10 #10/#13/#14/#22. BUILD-POLICY.md overrides both.
//
// THIS SCREEN DECIDES NOTHING. Every number it prints comes from `js/job/state.js` (J5c) and every
// string from `data/job.js COPY` (J12's lint reads that table, not this file). The machine is:
//
//   board → guard → envelope → call → answer → payout → bag/push → brief → getaway → debrief
//
// and each phase here is one `render*()` over `state.stateOf(save)`. Three laws are structural
// rather than promised:
//
//   1. **The seal.** The stem is fetched from `state.stemRefFor(save)`, which returns `null` until
//      the call is locked (or `beginAnswer` opens a no-stakes target). `envelopeFor()` carries no
//      card id, so there is nothing to render a stem FROM before the call. `renderEnvelope` never
//      touches `cardById`, `templates.js` or `createCardView`.
//   2. **No pre-call recommendation** (Global law 6). This file does not import `argmaxCall`,
//      `evTable` or `evFor`, and the call row is built from `envelopeFor().calls` alone.
//   3. **One grade path.** `screens/card.js`'s answering body is mounted as-is through
//      `createCardView`; its `onDone` hands the result to `state.applyTarget`, which prices it.
//      Not one line of the grade path is duplicated here (COMPOSED S1: one place writes a grade).
//
// LAYOUT (notes/LAYOUT-ROOT.md, notes/AUDIT.md). This screen hosts a card inside a NEW container,
// which is exactly the shape that collapsed the placement's stem to one letter per line. So:
// `.job-board` and `.job-panel` are their own `@container job` boxes (a component queries its own
// width, never the viewport), every text track in `css/job.css` carries a `ch` floor, every grid
// falls back to one column, and the board collapses to LAYOUT.boardCollapsedPx the moment a
// `.card-screen` is in the DOM — driven by `:has(.card-screen)` in CSS, so it cannot desync from
// the stem it is making room for.

import { h, navigate, setHeader, setJobHeader, bus } from '../app.js';
import { getState, update, flush } from '../store.js';
import { todayISO, timeHM } from '../days.js';
import { readiness } from '../readiness.js';
// J11's week gate (`plan.js` is pure policy — no DOM, no clock of its own beyond the one it is
// handed). `#/run/job` is a DOOR, and this is the only decision behind it: see `mountJob`.
import { jobEntryGate } from '../plan.js';
import { byId as cardById } from '../../data/cards.js';
import { skillById } from '../../data/skills.js';
import * as T from '../../data/templates.js';
import { createCardView } from './card.js';
// S4 renamed reviews — run.js owns the rewrite; sessionSplit is J8's split line; the last three are
// J6b's Page Summary extension, which IS the debrief (G7: "one screen, one Page Summary").
import { renameCard, sessionSplit, captureJobBefore, jobSummaryContext, renderJobSummary } from './run.js';
import * as state from '../job/state.js';
import { postBoard, draftFrom, projectFor } from '../job/board.js';
import { tellHookFor as indexTellHookFor } from '../job/index.js';
import {
  COPY, GLYPHS, KEYS, SHAPES, LAYOUT, CHAIN, WING_IDS, GUARD, WEEK, CALL_LEVELS, DECLINE_PRICE,
} from '../../data/job.js';

const { econ, call: callMod, guard: guardMod } = state;

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
/**
 * Append, skipping the blanks. `h()` filters `null` children; the native `Element.append()` does
 * NOT — it stringifies `null` into the literal text "null" — and every panel here is built from
 * conditional rows. One helper, used everywhere, so a conditional row can never print itself.
 */
const add = (el, ...kids) => { for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k); return el; };
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const int = (v, d = 0) => Math.trunc(num(v, d));
/**
 * `player.rating.value` as it stands, or `null` when the save carries no measurement yet. Read
 * either side of `state.applyTarget` it gives the rating's own move over one target — the number
 * `payoutLineOf` prints, and the only one in the layer that is in rating points. Every writer of
 * the window keeps this field in step with it (`applyTarget`, `endJob`, `screens/mock.js`), so
 * this is a read of the machine's own figure and not a second computation of it.
 */
const ratingValueOf = (s) => (Number.isFinite(s?.player?.rating?.value) ? s.player.rating.value : null);
/**
 * The call a BAG/PUSH threshold is quoted at when nothing is locked (the board's vault line, the
 * getaway): the LOWEST rung that stakes anything — `P > 0` — read off `CALL_LEVELS` rather than
 * re-typed. At `50` the penalty is 0, so the deep-pile threshold degenerates to `q* = 0` and the
 * line would print a number that means nothing. This used to be a bare `70` in two places.
 */
const CALL_FALLBACK = (CALL_LEVELS.find((c) => num(c?.P, 0) > 0) ?? CALL_LEVELS[CALL_LEVELS.length - 1]).id;

/* ================================================================== pure helpers (no DOM) */

/** The make's student-facing name (`data/skills.js`), for `COPY.envelope`'s second field. */
export const makeNameOf = (id) => skillById[id]?.name ?? String(id ?? '');

/** The 8 px grid every box in `css/job.css` is laid out on — `syncBoardFit`'s safety step. */
const FIT_STEP = 8;
/**
 * THE DECISIONS `syncBoardFit` MEASURES THE SHEET AGAINST — one selector, exported, so the classes
 * the screen renders and the classes the measurement looks for cannot drift apart again.
 *
 * `.job-calls` is the staked envelope's four rungs, `.job-envelope .run-actions` the no-stakes
 * envelope's single OPEN, and `.job-actions` inside the getaway is CRACK/WALK — which the shipped
 * selector named `.run-actions` and therefore never found (round 1 verification, layout-safari:
 * `marks=0` at every viewport in both engines, so the measured term was switched off at the exact
 * beat css/job.css:143 cites for it). `tests/job-screen.test.mjs` renders each of those phases and
 * asserts this selector matches something.
 *
 * **AND THE BOARD PHASE IS HERE NOW** (round 3 verification, layout-safari, MAJOR). It was excluded
 * on the premise that `.job-start > .run-actions` "is sticky and rides the fold", which css/job.css
 * repeated. **A sticky box cannot be shifted above its containing block**, and `.job-panel.job-start`
 * puts ~600 px of content above that footer, so the shift is clamped to 0 long before the fold is
 * reached. Measured at rest, chromium, scrollY forced to 0, no resize:
 *
 *     320×568  footer y=458 b=619  fold 568   → 51 px PAST the fold
 *     844×390  footer y=308 b=425  fold 390   → 35 px PAST the fold
 *     375×667  footer y=530 b=667             → pinned, which is why it was never noticed
 *
 * and with the browser text size at 20 px — the exact idiom `tests/_job-reach.mjs` rule 6 uses — the
 * BUTTON itself goes past it in both engines, identical to the pixel: `320×568 primary y=469 b=603`
 * (35 px below), `844×390 primary y=322 b=398` (8 px below). TAKE THE POSTED JOB is the decision
 * every job starts with, and the repo's own at-rest rule had no term for it: rule 6's id list ran
 * over the three staked beats and not the board, and `qa/layout-audit.mjs`'s offscreen detector only
 * fires in its `bottom` phase. The mark is the BUTTON rather than the row, because the row is the
 * box whose sticky offset made the claim look true.
 *
 * The payout beat stays out: `.job-beat` is sticky against a container it can actually travel in,
 * and it carries its own offset (see `.job-beat` in css/job.css).
 */
export const MARKS_SELECTOR = '.job-calls, .job-getaway .job-actions, .job-envelope .run-actions,'
  + ' .job-start > .run-actions .btn-primary';
/** One step past G6's longest entry animation (`ANIMATION` tops out at 300 ms) — the settle pass. */
const FIT_SETTLE_MS = 320;

/**
 * The tell hook every priced surface takes: `(skillId) => index.tellFor(save, skillId)`.
 * J7's record carries `{tag, triggered, cleared, sealed}` — exactly what `econ.tellFor` reads.
 * The hook itself lives in `js/job/index.js` so this screen and `screens/home.js` post the board at
 * the SAME price (integration; notes/J13.md Request 2). This is the binding of its `cards` index.
 */
export const tellHookFor = (save) => indexTellHookFor(save, { cards: cardById });

/**
 * The 36 px line the board collapses to at call-lock (`COPY.collapsedBoard`). Pure, so the DOM test
 * and the layout auditor measure the same string the student reads.
 *
 * **It is about the TARGET YOU ARE ANSWERING, not about the guard** (round 2, player-feel). It used
 * to print `g.guard.wing` — the GUARDED wing, whichever target was live — and, as `tokens`, the SUM
 * of every wing's tokens: `WORDS ⟨3⟩` on a target whose own wing held one token and whose own
 * multiplier was ×1.25. While a stem is on screen this is the only line the job still owns, so it
 * said the wrong wing and the wrong count at exactly the moment both decide the payout.
 *
 * Now: the current target's wing, THAT wing's own tokens, and THAT wing's own multiplier —
 * `RECALL ×1.25 ⟨1⟩ · loose 35 · ×1.4 · chain 2`. On the guarded wing the tokens are void (G3.4,
 * `pricedTarget` zeroes them) and the guard's own multiplier is the one that prices the clear, so
 * the line says `WORDS guarded ×0.55 ⟨0⟩`. The trailing `×` and `chain` stay the pair G6's own
 * example prints (`RECALL ⟨2⟩ · loose 131 · ×1.8 · chain 4` — `×1.8` is `chainMult(4)`).
 *
 * @param {object} g          the live job record
 * @param {string} [wing]     the CURRENT target's wing; defaults to the guarded one when the screen
 *                            has no priced target to read (pre-draw, or a broken price).
 */
export function collapsedLineOf(g, wing = g?.guard?.wing ?? '—') {
  const guarded = !!wing && g?.guard?.wing === wing;
  const pressed = Math.max(0, int(g?.tokens?.[wing], 0));
  const tokens = guarded ? 0 : pressed;              // the guard voids its own wing's tokens (G3.4)
  const chain = Math.max(0, int(g?.chain, 0));
  const wingMult = guarded ? num(g?.guard?.mult, 0.5) : 1 + GUARD.tokenBonus * tokens;
  return COPY.collapsedBoard({
    wing: `${wing}${guarded ? ' guarded' : ''} ×${wingMult.toFixed(2)}`,
    tokens,
    loose: econ.round(num(g?.loose, 0)),
    mult: econ.chainMult(chain).toFixed(1), chain,
  });
}

/**
 * ── GLOBAL LAW 6, BY COMPOSITION — the one pre-call surface that describes the record ──────────
 *
 * `call.js:651` states the rule this screen used to break: *"Whatever a caller prints before the
 * call must be coarser than the rung boundaries (`ratingIndifference()` — 0.600 / 0.775 / 0.900),
 * or the two surfaces compose back into it."* `COPY.evidence` prints the bare fraction
 * (`your last 10 on FAC2: 7/10`) and `screens/settings.js` prints `evMaxBands()` — the q̂ → EV-max
 * rung table — one live route away (`#/settings`, and `inProgress.game` survives the trip by
 * design, G3.7 #6). All ELEVEN reachable fractions on a 10-sitting window decode to exactly one
 * EV-max rung, so the sealed envelope was the advisor line in two taps (round 3, call-propriety).
 *
 * `call.js` shipped `evidenceBands()`/`evidenceBandOf()` in round 2 for exactly this and no screen
 * called them. This is the caller. The partition is derived from `ratingIndifference()` — every
 * band straddles a boundary, so a band never names a rung — and `call.js` deliberately holds no
 * copy, so the words live here.
 *
 * **THE WINDOW COUNT IS NOT PRINTED, and that is the fix, not an omission.** The band is coarse
 * over the CONTINUUM; over the reachable GRID `hits/of` it is not. Measured over the shipped
 * ladder (`scratchpad/r3/f1b.mjs`), the pair (band, `of`) decodes to a single EV-max rung at
 * **every** window size — at `of = 10`, band 0 is 50 alone and band 2 is 95 alone; at `of = 4`
 * all three bands are singletons. So printing `of` beside the band composes the answer back
 * exactly as the fraction did. What survives is the band and the make: the student's own record,
 * at the granularity that cannot be decoded into a call.
 *
 * ── …AND WHETHER THE CALL WILL COUNT, WHICH THE BAND ALONE CANNOT SAY (verify r3, player-feel) ──
 * `INFORMATIVE_MIN` cuts at q̂ = 0.9330127, STRICTLY INSIDE the top band. One printed sentence,
 * `clear rate 84 % or more`, therefore covered `q̂ 0.84 → w 0.5376` (counts) and `q̂ 1.00 → w 0`
 * (pays exactly 0, `call.callEntry` writes a blank slot) alike, and the student found out which
 * only in `payoutLineOf`, after committing. That is not a corner: on the repo's own mid-week
 * fixture **60 % of a 40-job arm's calls (240 of 400) are blank slots**, because spaced repetition
 * drives q̂ to 1 on reviewed makes — the better the student, the more of their calls stop counting.
 *
 * So a non-measuring record gets ITS OWN sentence, printed INSTEAD of the band, never beside it.
 * Global law 6 is untouched, and in fact better served: `call.evidenceOf().measures === false`
 * means q̂ ∈ [0, 0.06699) ∪ (0.93301, 1], whose honest rung is 50 OR 95 and whose EV-max rung is
 * 50 OR 95 — so the sentence spans BOTH ends of both ladders and resolves neither, while the bands
 * it replaces (band 0 and band 2) each resolve their own tail. It names no rung, no fraction and
 * no window size. `call.js evidenceOf` carries the argument; `job-call.test.mjs` §9 pins it.
 *
 * @param {number|null} qHat
 * @returns {string|null} the band in words, the blank-record sentence, or `null` for no history
 */
export function evidenceWordsOf(qHat) {
  const ev = callMod.evidenceOf(qHat);
  /* the two tails share ONE sentence and it must not say which tail: "one-sided" is true of both */
  if (!ev.measures) {
    return Number.isFinite(qHat) ? 'too one-sided to score a call — loot still pays, the rating does not' : null;
  }
  const bands = callMod.evidenceBands();
  const b = bands[ev.band];
  if (!b) return null;
  const pct = (x) => `${Math.round(num(x, 0) * 100)} %`;
  if (ev.band === 0) return `clear rate under ${pct(b.to)}`;
  if (ev.band === bands.length - 1) return `clear rate ${pct(b.from)} or more`;
  return `clear rate ${pct(b.from)}–${pct(b.to)}`;
}

/**
 * THE VAULT LINE — the board's preview and the getaway, both of which printed the bare fraction.
 *
 * `COPY.vault` is `${make} grade ${grade} · your last ${of}: ${hits}/${of} · crack breaks even at
 * ${q}`, and it is the surface round 3's envelope repair did not reach. Two consecutive screens of
 * one shipped run (round 1 verification, player-feel):
 *
 *     T8 GETAWAY   .job-vault-line   FAC2 grade 3 · your last 9: 7/9 · crack breaks even at 0.00
 *     T9 ENVELOPE  .job-env-line     FAC2 · Factoring a > 1 · grade 3 · cold 1.1 d · posted 39 · from A
 *                  .job-env-evidence your record on FAC2 · clear rate 69 %–84 %
 *
 * — the same make, one tap apart, the second one deliberately coarse. `7/9 → q̂ 0.7778 →
 * argmaxCall = 70`, a SINGLE rung, and `settings.js` publishes the decoder (`evMaxBands()`), so the
 * sealed envelope was the advisor line in two taps exactly as `evidenceWordsOf`'s own docblock
 * describes. The band straddles the 70/85 boundary at 0.7778, which is why the band is safe and the
 * fraction is not; `of` is the carrier, so it is gone from the line too, not merely the hits.
 *
 * So the vault line prints what the envelope prints: the coarse band, and no window size. That
 * makes `COPY.vault` the SECOND copy entry struck for this reason — `COPY.evidence` was the first
 * (round 3, call-propriety) and `tests/job-screen.test.mjs` asserts by name that neither is called.
 * A one-line rewording of the entry (`… · ${evidence} · crack breaks even at ${q}`) would let the
 * table own this sentence again; `site/data/job.js` is another lane's file and two of its tests pin
 * the current string, so it is Request 2 in notes/repair-screen.md.
 *
 * **AND IT NAMES THE RUNG THE THRESHOLD IS QUOTED AT** (round 4 verification, exploit-hunt). The
 * getaway's number used to be `breakevenQOf`, the BAG/PUSH root, quoted at `callOf(gv)` — the call
 * the student locked on the PREVIOUS target, since nothing is locked at the getaway. A threshold
 * that depends on a rung and does not say which rung is not evidence; `at` is that rung, and the
 * clause without it is left byte-identical for the surfaces that quote no rung at all.
 *
 * @param {{make: string, grade: (number|string), qHat: object|null, breakeven: string|null,
 *          at: (number|null)}} v
 */
export function vaultLineOf({ make, grade, qHat = null, breakeven = null, at = null }) {
  const words = qHat && num(qHat.of, 0) > 0 ? evidenceWordsOf(qHat.qHat) : null;
  const crack = breakeven == null ? ''
    : at == null ? ` · crack breaks even at ${breakeven}`
      : ` · crack at ${at} breaks even at ${breakeven}`;
  return `${make} grade ${grade} · ${words ?? 'no history yet'}${crack}`;
}

/**
 * ── THE GETAWAY IS **CRACK vs WALK**, AND THAT IS NOT BAG vs PUSH ───────────────────────────────
 *
 * (Round 4 verification, exploit-hunt, MAJOR.) The getaway printed `breakevenLabel()`, whose root
 * is `econ.breakevenQExact` — the PUSH-vs-BAG threshold. Three things are wrong with it here, and
 * they all push the same way:
 *
 *   1. it carries `FEE = 0.10`, the MID-JOB bag fee, while the walk at the getaway is fee-free
 *      (`econ.getawayBank`, `bankOnExit`: *"the getaway banks free"*);
 *   2. it has no COMPLETION term, and answering the vault — cleared OR knocked — makes
 *      `targetsLeft === 0`, which is `endJob`'s whole test for the +10 % on BAGGED;
 *   3. it is quoted at `callOf(gv)`, and at the getaway nothing is locked, so that is the rung
 *      used on the PREVIOUS target — which the student has not chosen for the vault.
 *
 * Measured over 60 getaway states, the shipped label said WALK at the student's own q̂ on 6 of
 * them while cracking at the 50 rung banked more in every one (`seed 2: "crack breaks even at
 * 0.61", q̂ 0.60 → WALK; cracking at 50 banks 596 against walking's 542`).
 *
 * The real root, built from the layer's own pricing functions and nothing else. Write `V = bagged
 * + getawayBank(loose)` — the pile both exits bank, at the same fee-free rate — and take the two
 * end-of-job bonus rates from `econ.exitBonusRate`, which is the ONE place the rule lives:
 *
 *     r_walk  = exitBonusRate({ getawayWalk: true,  stakes })      WALK  = (1 + r_walk )·V
 *     r_crack = exitBonusRate({ complete: true,     stakes })      CRACK = (1 + r_crack)·(V + Δ)
 *
 * with `Δ = +gain` on a clear (`econ.carryFor`) and `−loss` on a miss (`|econ.missFor|`), so
 *
 *     q* = ( loss − V·(1 − (1 + r_walk)/(1 + r_crack)) ) / (gain + loss)
 *
 * The rates are READ, never assumed, because the econ lane's own round-3 repair changed them
 * while this one was open: `exitBonusRate` now pays `COMPLETION` on a getaway WALK too (the parity
 * clause that killed the CRACK@50-then-miss arbitrage). Under parity the `V` term vanishes and
 * `q*` collapses to `loss/(gain + loss)` = `P/(W + P)` on a bare vault — `PUBLISHED.getawayParity.
 * crackQStarBare`, which is the same number this function computes from the priced vault.
 *
 * It is evaluated over the rungs `state.callsAvailable` really offers, because CRACK is the
 * decision and the rung is chosen after it: cracking beats walking as soon as SOME offered rung
 * clears its threshold, so the rung with the LOWEST `q*` is the one the CRACK/WALK decision turns
 * on, and the line names it.
 *
 * **`q* = 0` is the answer, not a missing label.** At the rung whose `P` is 0 nothing is staked,
 * so `loss` is 0 and no `q` makes walking pay more. The round-1 repair hid that case (`q > 0 ?
 * … : null`, `breakevenLabel`) and the getaway therefore printed nothing at the one beat where the
 * arithmetic has a definite answer. The caller prints the number AND the two banks it comes out of
 * — `free` carries them — so the reader can check it rather than take it.
 *
 * **This is not a call recommendation** (Global law 6). The rung named is the one that stakes
 * nothing, which is a published property of `CALL_LEVELS[0]` and is the EV-max rung only on the
 * weakest makes; the sentence is about CRACK vs WALK, and no rung is compared with another.
 *
 * @returns {{call: number, q: number, free: boolean, gain: number, loss: number,
 *            walkBank: number, missBank: number}|null}
 */

export function getawayThresholdOf({
  bagged = 0, loose = 0, chain = 0, stakes = true, target = null, rungs = null, crew = 0, calls = [],
} = {}) {
  if (!target) return null;
  try {
    /* the machine's own rule for both exits; the fallback is `endJob`'s pre-parity arithmetic, so a
       build without `exitBonusRate` still prices the two branches rather than throwing */
    const rateFor = (at) => (typeof econ.exitBonusRate === 'function'
      ? num(econ.exitBonusRate(at), 0)
      : (at.complete === true && stakes ? num(econ.COMPLETION, 0) : 0));
    const rWalk = rateFor({ complete: false, stakes, getawayWalk: true });
    const rCrack = rateFor({ complete: true, stakes, getawayWalk: false });
    const S = Math.max(0, num(loose, 0));
    const V = num(econ.getawayBank(S), 0) + Math.max(0, num(bagged, 0));
    const edge = V * (1 - (1 + rWalk) / (1 + rCrack));         // exactly 0 under the parity rule
    const c = Math.max(0, int(chain, 0));
    const rank = Math.max(0, int(crew, 0));
    let best = null;
    for (const id of Array.isArray(calls) ? calls : []) {
      const gain = num(econ.carryFor(target, id, c, rungs, rank, S), 0);
      const loss = Math.abs(num(econ.missFor(target, id, c, S, rank), 0));
      if (!(gain + loss > 0)) continue;
      const q = Math.max(0, Math.min(1, (loss - edge) / (gain + loss)));
      const row = {
        call: int(id, 0), q, free: q === 0, gain, loss,
        walkBank: econ.round((1 + rWalk) * V),
        missBank: econ.round((1 + rCrack) * Math.max(0, V - loss)),
      };
      if (!best || row.q < best.q || (row.q === best.q && row.call < best.call)) best = row;
    }
    return best;
  } catch { return null; }
}

/**
 * **THE ROW IS PRICED ON WHAT IT DELIVERS** (round 4 verification, exploit-hunt, BLOCKER).
 *
 * The row printed `· posted ${o.decline}` — `swapOptions`' `round(bundle.posted · 1.15)`, the
 * DECLINED price of the WHOLE contract — on the same line as `+N target(s)`, the number it really
 * adds. They are not the same quantity: `swapIn` splices only the bench items the queue does not
 * already hold, and criticals are replicated across bundles, so a contract's other targets are
 * usually already drafted. Measured over 60 corpus saves driven to the first brief window, 119
 * rows of 119 overstated it — printed/actual **2.45× min · 10.50× median · 58.67× max**, not one
 * row where the two agreed (`seed 1 C: "+1 target · posted 71" against an actual 23`). Global law
 * 6 makes this line the evidence the swap decision is made on.
 *
 * `swapDeliveryOf` is `swapIn`'s own filter and `swapIn`'s own sum — the same `!have.has(it.id)`
 * over `inProgress.bench` and the same `Σ it.posted`, which is the number `swapIn` adds to
 * `g.posted`. So the row prints the machine's own figure rather than a second estimate of it, and
 * a contract whose bench no longer delivers anything renders NO row at all: taking it would close
 * the window (`brief()` always advances the phase) in exchange for nothing.
 *
 * The whole contract's declined price is still printed, because the trade is partly about what
 * the decline cost — but it is labelled as the contract's and set apart from the `+N target(s)`
 * clause, so the two numbers can no longer be read as one.
 */
export function swapDeliveryOf(s, id) {
  const bench = Array.isArray(s?.inProgress?.bench) ? s.inProgress.bench : [];
  const have = new Set(state.queueOf(s).map((it) => it?.id).filter(Boolean));
  const add = bench.filter((it) => it?.declined === id && it?.id && !have.has(it.id));
  return { targets: add.length, posted: econ.round(add.reduce((t, it) => t + num(it.posted, 0), 0)) };
}


/** The envelope's two printed lines — `COPY.envelope` and the coarse band (G1's sealed envelope). */
export function envelopeLinesOf(env, qHat) {
  const words = qHat && qHat.of > 0 ? evidenceWordsOf(qHat.qHat) : null;
  return {
    head: COPY.envelope({
      make: env.make, name: env.name, grade: env.grade,
      cold: econ.round(num(env.cold, 0), 1), posted: env.posted,
      from: env.from ?? (env.sources || []).join('') ?? '—',
      /* COMPOSED-GAME.md:41 — the envelope names the tell "if you have one LIVE on this make", and
         `index.tellDetail` deliberately also offers a CLEARED-but-unsealed tag (ranked behind every
         live one) so resolutions #2 and #3 can reach the seal. That record arrives with
         `live: false`, and printing it as `· tell:` claimed a ×1.25 fault where the board is paying
         1.00. The payout is unaffected either way — `econ.tellFor` prices a cleared record at 1.00,
         so `settle` is byte-identical — this is the LABEL (notes/repair-index.md Request 2). Named
         as its own kind of tell instead of hidden is the alternative the doc owner may still
         prefer; it needs a second COPY form and is filed as an open item in the integration note. */
      tell: env.tell?.live === false ? null : (env.tell?.tag ?? null),
    }),
    evidence: words ? `your record on ${env.make} · ${words}` : `no history on ${env.make} yet`,
  };
}

/**
 * The payout line — `COPY.clear` on a clear, `COPY.miss` on a miss (G6's copy table, verbatim)…
 *
 * …EXCEPT on a call the rating window scored as a BLANK SLOT. `call.callEntry` zeroes `w` below
 * `INFORMATIVE_MIN` (0.25 — i.e. q̂ outside `RATING.informativeQHatBand`, a record so one-sided
 * that the outcome carried no information), and `call.js:439` then pays that slot exactly 0. The
 * screen printed `COPY.clear`'s `rating +6.4 ×0` anyway: a signed positive with a nullifier
 * hung off the end, in the game's most-repeated line. On the repo's own recommended evening
 * (`qa/fixtures/midweek.json`) **five of ten targets** print `×0`, and ten clean clears on a 9/9
 * make measurably LOWER the rating (9.096 → 8.277) because every call takes a slot and a blank
 * one pulls the mean toward 5.00 — while the line read `rating +6.4` ten times (round 3,
 * player-feel). `+6.4` is also `credit(0.70, clear)`, a constant of the button, so the clause
 * restated the tap and nothing about this target.
 *
 * So a blank slot says what actually happened, in words, and no `×0` is ever rendered.
 *
 * ------------------------------------------------------------------------------------------------
 * ROUND-1 VERIFICATION OF THAT REPAIR — both halves of the sentence were still false.
 *
 * 1. **"rating unchanged · no measurement" is false on every FULL window.** A blank slot is not a
 *    no-op: `call.windowPush` keeps a fixed 50-slot window (`[...list, e].slice(-CAPS.calls)`) and
 *    `ratingDetail` divides by N = 50, so a blank slot scores 0 AND evicts the oldest informative
 *    call. Below 50 slots "unchanged" is true; at 50 it is not. Driven through the shipped path
 *    (`state.applyTarget` → `call.windowPush` → `call.ratingDetail`) on a student five jobs in,
 *    the line printed "rating unchanged" while the rating went 7.6880 → 7.4730 (Δ −0.2150), and
 *    ten consecutive blank calls walked it 7.6880 → 7.1504 across a rank boundary and back.
 * 2. **`rating +9.1 ×0.64` printed CREDIT units under the word "rating".** `p.credit` is
 *    `call.creditOf(call, ok)` — a pure function of which BUTTON was pressed (0 / 6.4 / 9.1 / 9.9
 *    on a clear), nothing about this target. Measured through the machine, the tap that printed
 *    `rating +9.1` moved the rating by +0.3236 on a fresh window and +0.1085 on a full one: 28×
 *    and 84× the printed figure, on a 0–10 scale whose rank bands are 1.1–1.5 wide. It is the same
 *    substitution round 3 graded a BLOCKER on the debrief's regret line (data/job.js:749, "One
 *    credit point is not one rating point … the remedy is the WORD, not the number").
 *
 * THE REMEDY HERE IS THE NUMBER, because the word is `COPY.clear`'s and this file may not retype a
 * line the copy table owns (`tests/job-screen.test.mjs` — "the screen composes no user-facing
 * sentence of its own"). `move` is the MEASURED move of `player.rating.value` across this one
 * `applyTarget`, read either side of the write by `applyResult` below — eviction included, because
 * that is what the student's rating actually did on this tap. So the numeral beside the word
 * "rating" is the rating's own move, in rating points, and it is a measurement rather than a
 * restatement of the tap.
 *
 * With the move in hand, the blank-slot branch stops asserting a fact about the RATING from a fact
 * about the SLOT: it prints the move, and then says the one thing that is true of the slot.
 *
 * ------------------------------------------------------------------------------------------------
 * ROUND-3 VERIFICATION — the `×` and the unexplained fall (player-feel, two MAJORs).
 *
 * 1. **`rating +0.23 ×0.89` multiplied a factor that is already inside the number.** Feeding the
 *    MEASURED move to `COPY.clear`'s `credit` slot left the `×${w}` beside it untouched, and
 *    `Δrating = 2·w·c/50` — the printed 0.23 ALREADY contains the 0.89. A reader who does what the
 *    `×` tells them gets 0.205, which is nothing in the system. Before the round-3 repair the pair
 *    at least multiplied to the slot's own `w·c`; after it, it multiplied to a fiction, in the
 *    game's most repeated line. The remedy is the copy entry, which is why it was filed as a
 *    Request twice: `COPY.clear` now reads `rating <move> · weight <w>` — the two facts, side by
 *    side, with no operator claiming a relation between them. (data/job.js is another lane's file;
 *    the one-line reword and the two literal pins that moved with it are recorded in
 *    notes/repair-screen.md under "the cross-lane edit".)
 * 2. **A CLEARED target could print `rating −0.09` with no cause**, while the blank-slot branch
 *    three lines up explains that exact eviction. Once `player.rating.calls` is at 50 the window
 *    stays full for the rest of the student's life, so this is the steady state, not a transient:
 *    one career on the shipped fixture printed 3 negative informative clears against 55 positive
 *    ones, each of them a correct answer called at the strongest legal rung and paid 50 loose,
 *    beside a rating that fell with nothing on screen saying why.
 *
 *    **A negative move on a CLEAR *is* an eviction, and it needs no extra plumbing to prove it.**
 *    `ratingDetail` is `base + scale·Σ(w·c)/N` with N the FIXED 50, and on a clear `c = 10 −
 *    40(p − 1)²` is ≥ 0 at every rung the game offers (`p ≥ 0.5`), so a push onto a window that is
 *    not yet full can only add a non-negative term: the value cannot fall. `moved < 0` on this
 *    branch therefore happens if and only if the window was full AND the slot that left scored more
 *    than the one that arrived — which is exactly what the clause says. (`tests/job-screen.test.mjs`
 *    pins both halves: the implication over the shipped `call.ratingDetail`, and the line.)
 *
 * @param {object} p        `state.applyTarget`'s result
 * @param {object} [env]    the envelope, for a miss whose priced target is gone
 * @param {number} [move]   the measured `player.rating.value` delta across this target; `null`
 *                          when no measurement was taken (nothing about the rating is then printed)
 */
export function payoutLineOf(p, env, move = null) {
  if (!p || p.free) return '';
  const moved = Number.isFinite(move) ? econ.round(move, 2) : null;
  const ratingPart = moved == null ? '' : ` · rating ${moved >= 0 ? '+' : '−'}${Math.abs(moved)}`;
  if (p.ok) {
    const loose = Math.abs(econ.round(num(p.delta, 0)));
    const w = econ.round(num(p.w, 0), 2);
    if (num(p.w, 0) < callMod.INFORMATIVE_MIN) {
      /* **ONE CLAUSE, AND THE CAUSE BETWEEN THEM** (round 2 verify, player-feel). The round-1 repair
         implemented BOTH halves of its finding at once and the conjunction contradicted itself:
         `+213 loose · chain 5 · rating −0.22 · this call was not a measurement` — a signed rating
         move printed beside a sentence saying the call measured nothing, on 6 of the 10 targets of
         the board the game itself recommends.

         Both halves are true, and the relation between them is the only thing that makes them
         readable together, so the line now states it. A blank slot scores exactly 0 and the divisor
         is the FIXED 50 (`call.ratingDetail`: `RATING.base + scale · Σ(w·c)/N`), so the slot itself
         can never move the rating: `move ≠ 0` happens if and only if the push EVICTED a scoring call
         (`windowPush` = `[...list, e].slice(-50)`). That eviction is the whole cause of the number,
         and it is what the student is owed — the sign included, because a −0.22 and a +0.32 on two
         blank calls differ only in what left the window.

         So: no move (or a window that was not yet full) → the fact about the slot alone; a move →
         the fact, its cause, and the rating's own measured delta, in that order. `rating ±x` never
         again sits next to a flat "not a measurement" with nothing joining them. */
      const blank = `+${loose} loose · chain ${p.chain}`;
      if (moved == null || moved === 0) return `${blank} · this call was not a measurement`;
      return `${blank} · not a measurement — its slot pushed an older call out${ratingPart}`;
    }
    if (moved == null) return `+${loose} loose · chain ${p.chain} · weight ${w}`;
    const line = COPY.clear({ loose, chain: p.chain, credit: moved, w });
    /* THE SAME CAUSE THE BLANK BRANCH ALREADY GIVES, at the one beat that needed it more: this one
       is a target the student CLEARED (see the docblock's round-3 note 2). On a clear the slot's own
       `w·c` is ≥ 0, so a fall can only be an eviction, and the sentence names it. */
    return moved < 0 ? `${line} — its slot pushed a stronger call out` : line;
  }
  const make = p.target?.make ?? env?.make ?? '—';
  const tell = p.target?.tell?.tag ?? env?.tell?.tag ?? 'none';
  const lost = Math.abs(econ.round(num(p.delta, 0)));
  /* `−0 loose` — G6's miss line hardcodes the minus, and on a miss into an EMPTY pile the number
     is 0: `econ.settle`'s loss branch is `min(LOOSE, L·m·P)`. Measured over one full shipped job on
     the repo's own `qa/fixtures/audit/midweek.json` at 19:30, taking the board's own recommendation:
     six of ten payout lines printed `−0 loose` (round 1 verification, player-feel). COPY.miss's own
     voice rule is "a miss names the make, the tell and the number and stops" — so when there is no
     number, it names the make, the tell and the chain the miss just broke, and stops. */
  if (lost === 0) return `${make} · tell: ${tell} · chain ${p.chain}`;
  return COPY.miss({ make, tell, loose: lost, chain: p.chain });
}

/**
 * The brief's crew grid's alignment line — G3.8's RANK condition, printed as the two numbers it
 * compares. Pure and exported so the claim can be measured over real `crew.alignmentFor` output
 * rather than read off the source (`tests/job-screen.test.mjs`).
 *
 * **IT PRINTED ONE PRICE AND NAMED THE WRONG SCALE** (round 2 verify, crew-alignment, MAJOR). The
 * line read `a HELD point prices at ${threshold} on this list's own scale`, and the list's own scale
 * is the column the grid prints six rows below: `crew.crewValueDetail(...).score` = `w · (1 − m/100)`.
 * `threshold` is not on it — it is `held.value / shapeConstant(measuredParamsOn(board))`, a price
 * taken ON THE BOARD. Measured over 200 drafted JOB-10 boards, on the 101 that printed the sentence:
 *
 *     printed "prices at" (threshold)      : min 0.000 med 0.000 max 1.688
 *     steadyThreshold (the same transform) : min 0.908 med 3.864 max 6.853
 *     the grid's own top-row column value  : min 1.680 med 6.510 max 9.000
 *     steadyThreshold differs from the printed column of the SAME list by > 25 % on 75 of 101
 *
 * so a student was told a number was on the list's scale and invited to read it against a column
 * whose top entry sits five times away from where the same transform puts the best STEADY point.
 *
 * Both halves are now printed — which is also what `crew.js:1534` asks of any surface printing
 * `threshold` beside this grid ("A surface that prints `threshold` beside the grid's own score
 * column should print `steadyThreshold` with it") — and the scale is named for what it is:
 * `alignmentFor` prices both rungs on the board when it is handed the queue (`pricedOn === 'board'`)
 * and off the population model when it is not. `holds` is exactly `steadyThreshold ≥ threshold`, so
 * the sentence's verb is now a comparison the reader can make with their own eyes.
 *
 * @param {object} align `crew.alignmentFor(save, {shape, of, queue})`
 * @returns {string}
 */
export function crewAlignLineOf(align) {
  if (!align) return '';
  if (!align.held) return 'no HELD point is buyable tonight — the study ordering is the whole list';
  const n2 = (x) => num(x, 0).toFixed(2);
  const steady = state.crew.RANK_NAMES?.[1] ?? 'STEADY';
  const scale = align.pricedOn === 'board' ? "the board's own prices" : 'model prices';
  return `a HELD point prices at ${n2(align.threshold)} against the best ${steady} point's `
    + `${n2(align.steadyThreshold)} — ${scale}, not the column below — so the study ordering `
    + `${align.holds ? 'leads it' : 'is outbid by it'}`;
}

/**
 * G1's ladder line, printed when crew forgiveness or a hint moved ρ off 1.00.
 *
 * **The crew half is now gated on the forgiveness that was actually applied** (round 2, twice over:
 * player-feel and spec-fidelity; notes/crew-fix.md R8). It used to print
 * `attempt 2 · crew VOC forgives one · ρ 0.45 · +10 loose` on EVERY non-clean clear — on a save with
 * no crew at all, naming the MAKE where G6's copy table prints the RANK, and asserting a
 * forgiveness the ρ beside it disproves (`ρ 0.45` is `LADDER[2]` un-forgiven).
 *
 * So: `p.target.crewInfo.forgives` is the number the payout honoured (`crewFor` applies G2's idle
 * rule to it), and with no crew on the make the line says only why ρ moved — the hint, or the
 * attempt — and stops. `COPY.ladder`'s own "forgives one" is true of exactly one rung, so STEADY
 * keeps the published sentence verbatim and HELD's two rungs are named instead of rounded down.
 */
export function ladderLineOf(p) {
  if (!p || p.free || !p.ok || p.rung === 0) return '';
  const rung = int(p.rung, 0);
  const why = rung >= 2 ? `attempt ${rung}` : 'hint';
  const rho = num(p.rho, 0).toFixed(2);
  const loose = Math.abs(econ.round(num(p.delta, 0)));
  const c = p.target?.crewInfo ?? null;
  const forgives = Math.max(0, int(c?.forgives, 0));
  const rank = c?.name || state.crew.RANK_NAMES[forgives] || '';
  if (forgives === 1 && rank) return COPY.ladder({ attempt: rung >= 2 ? rung : 1, crew: rank, rho, loose });
  if (forgives > 1 && rank) return `${why} · crew ${rank} forgave ${forgives} rungs · ρ ${rho} · +${loose} loose`;
  return `${why} · ρ ${rho} · +${loose} loose`;
}

/** The chain ticks — `CHAIN.ticks` glyphs, amber at 5, violet at 8 (G6; geometric shapes, no emoji). */
export function chainTicksOf(chain) {
  const c = Math.max(0, int(chain, 0));
  const tone = c >= CHAIN.tickViolet ? 'violet' : c >= CHAIN.tickAmber ? 'amber' : 'flat';
  return { n: Math.min(c, CHAIN.ticks), of: CHAIN.ticks, tone, mult: econ.chainMult(c) };
}

/** Which beat the payout row offers: the last target has no bag/push (G1's 9 beats for 10 targets). */
export const beatAfter = (save) => (state.targetsLeft(save) === 0
  ? 'finish'
  : state.stateOf(save)?.stakes === false ? 'next' : 'bagpush');

/**
 * **THE PRIMARY BUTTON, PRICED FOR THE DRAFT THAT IS ON SCREEN.**
 *
 * `board.primary` and `board.projection` are composed ONCE, inside `postBoard`, from
 * `board.recommend` — and the board sheet then lets the student toggle any of the five contracts,
 * re-rendering those same two frozen strings. `startJob` honours the student's picks
 * (`buildJob` → `draftFrom`), so the job taken was not the job the button described. Measured over
 * a 50-save corpus at 19:30 (round 1 verification, split-honesty): **450 of 450** non-recommended
 * drafts printed the wrong letters, the posted value was out by up to 58, and played through the
 * machine the printed `~N min` missed the real wall clock by more than 3 minutes on 15 of 360
 * (worst: 24 min printed against 18.2 real) with the split out by 5.8 points. The button read
 * `JOB · A C D · 10 targets · posted 321 (−105 shared) · ~24 min · ends 19:53 · 24 % game` over a
 * student who had drafted `A B C`.
 *
 * Every term is re-derived here from the two pure functions the board itself uses — `draftFrom`
 * for the union and its posted line, `projectFor` for the split and the wall clock — against the
 * SAME pinned seed, ×2 marks and post-time, so the board does not move under the draft
 * (`tests/job-board.test.mjs` pins that the board is stable across drafts). The empty-draft case
 * mirrors `buildJob`'s own rule — no picks means the recommendation — so the button describes the
 * job the tap will actually start in that state too.
 *
 * The segment list is `board.js`'s (`postBoard().primary`); `tests/job-screen.test.mjs` asserts
 * this function reproduces `board.primary` and `board.projection` EXACTLY for the recommended
 * picks over corpus boards, so the two compositions cannot drift apart silently.
 *
 * @returns {null|{picks, label, line, targets, minutes, ends, split, primary, projection}}
 */
export function quoteFor(save, board, picks) {
  if (!board || !Array.isArray(board.bundles) || !board.budget) return null;
  const chosen = Array.isArray(picks) && picks.length ? picks : (board.recommend?.picks ?? []);
  let drafted; let proj;
  try {
    drafted = draftFrom(board.bundles, chosen, { x2: board.x2?.marks });
    proj = projectFor(save, drafted, board.budget);
  } catch (e) { console.error('job: cannot price the draft', e); return null; }
  const at = num(board.now, 0) || Date.now();
  const endsAt = at + Math.round(num(proj.wallS, 0) * 1000);
  const ends = timeHM(new Date(endsAt));
  const minutes = Math.ceil((endsAt - at) / 60000);
  const targets = drafted.queue.length;
  return {
    picks: drafted.picks.slice(),
    label: drafted.label,
    line: drafted.line,
    /* the sharing/×2 explanation for the draft ON SCREEN (one-line addition by the board lane,
       BUILD-POLICY §2 — notes/repair-board.md Requests). Without it `renderBoard` would render
       `board.sharedLine`, which is the RECOMMENDED draft's, under a student's own picks. */
    sharedLine: drafted.sharedLine ?? null,
    targets,
    minutes,
    ends,
    split: proj.split,
    primary: [
      SHAPES[board.budget.id]?.name ?? SHAPES.JOB.name,
      drafted.label,
      `${targets} targets`,
      drafted.line,
      `~${minutes} min`,
      `ends ${ends}`,
      `${proj.split} % game`,
    ].join(' · '),
    projection: COPY.projection({ split: proj.split, jobs: proj.jobs }),
  };
}

/**
 * The terminal word `state.advance()` would choose. `push()` ends the job itself but returns a
 * status rather than the debrief, and `finishPage` nulls `inProgress` on the way out, so the screen
 * calls `endJob` directly on the last target to keep the debrief. See notes/J6.md → Requests (J5c).
 */
export function finalWordOf(save) {
  const g = state.stateOf(save);
  const O = state.OUTCOMES;
  if (!g) return O.QUIT;
  /* THE WORD IS `state.advance()`'s WORD, term for term (state.js:1014-1017). This function is the
     other half of a two-headed decision, and it had lost two of the three branches (round 2,
     spec-fidelity): a vault the student CRACKED and MISSED was recorded `cracked`, so
     `records.cracked`, the debrief, `game.log` and the "1 per vault cracked" Backcheck all counted
     G1's **Knocked** as a success and `OUTCOMES.KNOCKED` was unreachable in the shipped app; and a
     22:00 close came back `called`, which is `records.walked`, because `g.quiet` was never read.
     `g.last` is written by `applyTarget` for every non-free target, so `ok` is the crack's own
     result. (Request to state.js's owner: export this expression so there is ONE definition.) */
  if (g.stakes === false) return g.quiet === true ? O.QUIET22 : O.CALLED;
  if (state.queueOf(save).length > 1) return g.last?.ok === true ? O.CRACKED : O.KNOCKED;
  return O.COMPLETED;                                  // a one-target job has no getaway beat
}

/* ================================================================== the screen */

/**
 * `#/run/job?seed=` — mounted by `screens/run.js`'s DELEGATES table (no new route; G10 #14).
 * @param {{kind: string, id?: string|null}} params
 * @param {URLSearchParams} [query]
 * @returns {(el: HTMLElement) => () => void}
 */
export function mountJob(params, query) {
  const seedParam = query?.get?.('seed') ?? null;
  return (host) => {
    /* THE WEEK IS A DOOR, not a decoration (G9 #9: "D = 2 drops the stakes, D = 1 posts no board at
       all, any shape that would end after 22:00 is refused before it starts, after 22:00 the board
       closes — and none of it locks a single study door").
       Home and `jobAction` stop OFFERING a board when the week says no, but the ROUTE stayed open,
       and `screens/run.js`'s debrief links straight at it (`Another board`), so `Board closed ·
       after 22:00`, `D = 1 — no board` and `School window · RUN only` were all true of the button
       and false of the app: `#/run/job` posted a full stakes board at 22:30, at D = 1 and at D = 0.
       `plan.jobEntryGate` is the ONE decision — the same `boardPolicy` Home reads — so a deep link,
       the debrief's secondary and Home's primary now obey one rule. It subsumes the layer switch
       (G10 #22: `policy.on === false` → `#/today`); a LIVE job is always allowed through, because
       whether a NEW board may post has nothing to do with finishing the one already on the disk,
       and nothing here locks a study door: every refusal navigates to the study route the week
       itself named (`#/run/night`, `#/run/morning`, `#/today`). */
    const gate = jobEntryGate(getState());
    if (!gate.allow) { navigate(String(gate.redirect || '#/today').replace(/^#/, '')); return () => {}; }
    /* **AND A HALF-ANSWERED PAGE IS A DOOR TOO — ON ENTRY, NOT AFTER THE RITUAL** (round 2 verify,
       ledger-invariance). `state.startJob` refuses a board over an answered-into Today's Page
       (`JobStateError('page-in-progress')`, job/state.js:840-843 — COMPOSED global rule 5, because
       the unanswered remainder of that queue is not re-derivable). The refusal is right and stays
       where it is; what was wrong is WHERE THE STUDENT MET IT. `screens/run.js:1418` puts `Another
       board` on every debrief, beside a `Today's Page` button whose own condition is `left > 0` —
       i.e. it is offered EXACTLY when the page is live — and `state.js:1980` leaves that page live
       after a walk or a quit. So the tap posted a board, the student drafted contracts, pressed
       tokens and pressed START, and `startOrGo` then caught the throw into `renderBroken`:
       *"The board could not be posted · page-in-progress: 7 left on Today's Page"*, after the whole
       ritual. Measured: `after WALK: outcome=quit left=7` → both buttons rendered → `startJob THREW`.

       `state.pageInProgress` is exported for exactly this (its own docblock: *"so a screen can
       redirect on the same predicate the refusal uses, rather than guess at it"*), and it returns
       `null` while a job is live (`isObj(ip.game)`), so a live job is never touched. The redirect
       is the study route, which is what every other refusal here navigates to. `plan.jobEntryGate`
       is still the right long-term home for the clause — filed as Request 1 in
       notes/repair-screen.md, with the debrief button — but the refusal has to land BEFORE the
       board is posted, and this is the one place this lane owns that runs before it. */
    try {
      const live = state.pageInProgress(getState());
      if (live) { navigate('/run/page'); return () => {}; }
    } catch { /* a malformed save is the mount's problem, not the gate's */ }
    return mount(host, { seed: seedParam, gate });
  };
}

function mount(host, { seed = null, gate = null } = {}) {
  let destroyed = false;
  let view = null;                 // the live card view
  let board = null;                // the posted board, before the job starts
  let picks = [];                  // the draft, before the job starts
  let payout = null;               // the last applyTarget result
  /**
   * THE RATING'S OWN MOVE ACROSS THAT ONE `applyTarget`, measured (round 1 verification).
   *
   * `player.rating.value` is rewritten inside `applyTarget` (state.js:1186, from
   * `call.ratingDetail(p.rating.calls, CAPS.calls, { rank: p.rank })` after the window push), so
   * reading it either side of the same `update` gives the move the student's rating actually made
   * — the evicted slot included. It is the only number in the layer that can honestly sit behind
   * the word "rating" on a per-target line; `p.credit` is a constant of the button pressed. `null`
   * whenever the beat was rebuilt from the save rather than driven (a reload onto the payout), in
   * which case `payoutLineOf` prints nothing about the rating at all.
   */
  let payoutMove = null;
  let env = null;                  // the envelope the current target was bid on
  let debrief = null;              // the debrief, once the job is over
  let quitOpen = false;
  let commitOpen = false;
  let commitTimer = null;          // the bound declaration's watch — see `checkCommit()` (G3.9)
  const COMMIT_POLL_MS = 15000;    // ≤ 15 s late on a declared MINUTE, and cheap enough to idle in
  let tokenSel = 0;
  /* THE STAGED BRIEF PRESS (S5). The brief window's re-press is held HERE until the student submits
     it, so no allocation reaches `state.press` — and therefore no guard redraw happens — until the
     whole move is committed. `pendingAt` is the window the staging belongs to (`briefs.length`), so
     a staging cannot survive into the next window, a phase change or a reload. See `bump()`. */
  let pending = null;
  let pendingAt = -1;
  /* ── THE WHOLE BRIEF WINDOW IS STAGED, NOT ONLY ITS PRESS (round 4 verification, exploit-hunt) ──
     G1 publishes the window as *"Any subset, `Enter` to skip"* over five options, and the debrief
     counts `mandatory + (briefOptionsMax − 1)·briefs + …` for its "35 if you use every optional
     window". Every control in `renderBrief` used to call `takeBrief(<one action>)`, and
     `state.brief`'s last act is `setPhase(g, … )` — so the FIRST option taken closed the window and
     the other four were refused (`not-at-brief: envelope`). Measured: `took = ["swap"]`, window
     shut, second option refused; the ceiling the screen could reach was `mandatory + 1·briefs +
     COMMIT` = 27 on a JOB-10, not 35, and "any subset" was reachable only as "any one".
     `state.brief(save, {repress, swap, crew, tell, commit})` has accepted all five together since
     J5c, so the remedy is here: the four cheap options STAGE (the press already did, S5), and one
     submit sends the window in ONE call. `briefAt` is the window the staging belongs to
     (`briefs.length`), exactly as `pendingAt` is for the press, so nothing can survive into the next
     window, a phase change or a reload. */
  let briefStage = null;
  let briefAt = -1;
  let bagDropped = false;          // G6 ANIMATION.bagDrop.oncePerJob
  /* The two things the debrief needs that `endJob` destroys on its way out (notes/J6b.md R1):
     the BEFORE snapshot, taken once at job start and stored on `inProgress.meta` so a mid-job reload
     ends on the debrief of the WHOLE job, and the queue, because `finishPage()` nulls `inProgress`. */
  let jobBefore = null;
  let jobQueue = [];
  let fitRaf = 0;                  // the pending `syncBoardFit` frame — see `scheduleBoardFit()`
  let fitTimer = null;             // …and its settle pass, once the beat's animations have run
  let boardNeed = 0;               // the measured height of ONE whole contract row — `boardFitState`
  let boardAt = 0;                 // when the board was painted — the session's real start (J8 R5)
  let pressAt = 0;                 // when the press panel was first TOUCHED — the board/guard boundary
  let saidAt = null;               // the phase the `.job-say` line belongs to (declared here, not
                                   // beside render(): the boot block calls render() before that line)
  const now = () => Date.now();
  const today = todayISO();

  /* ---- skeleton ---- */
  const root = h('section.screen.run-screen.job-screen', { dataset: { kind: 'job' } });
  const headSlot = h('div.job-head-slot');
  const boardEl = h('section.job-board', { 'aria-label': "Tonight's board" });
  const stage = h('div.job-stage');
  // G6 "aria-live announces payout, guard and bag". Both regions are PERSISTENT elements whose text
  // changes — an `aria-live` node that is re-created on every render announces nothing — and both
  // are visible, because the lines they carry are G1's own printed lines (`GUARD: WORDS. your
  // tokens: …`, `bagged 24 · fee 2 · chain 1 → 0`). A hidden duplicate of visible copy would be a
  // second source of truth for the same sentence; this way the announcement IS the screen.
  const beat = h('div.job-beat', { hidden: true, role: 'status', 'aria-live': 'polite' });
  const live = h('p.job-say.mono.fs-1', { role: 'status', 'aria-live': 'polite' });
  /* THE RAIL (G6's phone-layout paragraph: *"≥ 1024 px: the board lives in the 320 px right rail,
     permanently visible"*). That sentence described a layout no student could reach — job.css had
     no width rule at all and the board was one 36 px line at 2560 px as well as at 375 px (round 1,
     layout-safari). It is a DOM shape, not a media query: the board sheet and the reading column are
     siblings of one `.job-body` grid, so `css/job.css` turns the two-column form on with a single
     `@container jobscreen` rule and no renderer ever has to know the width. `.job-main` carries
     everything that reads as one column — the walk prompt, the stage, and the payout beat. */
  const main = h('div.job-main', stage, beat);
  const body = h('div.job-body', boardEl, main);
  root.append(headSlot, live, body);
  host.append(root);

  /* ---- boot: resume a live job, or post tonight's board ---- */
  try {
    const s0 = getState();
    if (state.stateOf(s0)) update((s) => { state.resume(s); });
    else {
      /* The session begins when the board is POSTED, not when it is left. `startJob` is handed this
         stamp so `beginTargets` banks the student's real board read into `ph.board` — and so
         `inProgress.startedAt` and `guard.drawnAt` are the moment they sat down, which is what
         `commitDue`'s "walk at N minutes" counts from (notes/J8.md Request 5). */
      boardAt = now();
      /* THE WEEK NARROWS THE BOARD, not only the button. `job/board.js shapeFor` says so itself:
         "The WEEK rules (D = 2 REVIEW BOARD, D ≤ 1 no board, the 22:00 close) are J11's, not this
         file's" — so the week's shape has to be HANDED to it. Without this the school window posted
         a ten-target JOB while Home printed `RUN only` (`opts.shape` always wins in `shapeFor`, and
         `state.startJob` is handed this very board, so the shape carries all the way into the
         record). `gate.shapeOpts` is `boardPolicy`'s own `{ shape }`; `shape: null` at D ≥ 3 and at
         the terminus deliberately leaves the choice to `shapeFor`, which is why it is spread only
         when the week actually names one. */
      board = postBoard(getState(), today, {
        now: boardAt, seed: seed ?? undefined, tellFor: tellHookFor(getState()),
        ...(gate?.shapeOpts ?? {}),
        ...(gate?.shape ? { shape: gate.shape } : {}),
      });
    }
  } catch (e) {
    console.error('job: cannot post the board', e);
    board = null;
  }
  if (!state.stateOf(getState())) picks = board?.recommend?.picks?.slice() ?? [];
  else holdForDebrief();          // a mid-job reload: the snapshot is already on `inProgress.meta`

  syncHeader();
  render();

  /* ================================================================ render */

  function g() { return state.stateOf(getState()); }

  /**
   * `--job-dock-h` — how tall `screens/card.js`'s sticky dock is RIGHT NOW, measured rather than
   * assumed, so the payout beat can sit ON the dock instead of 290 px below the fold.
   *
   * G1 counts BAG / PUSH nine times a job and G7 calls it the headline decision; on a 375×812 phone
   * the payout line rendered at y = 1016 and the BAG button at y = 1100, and the one control a
   * student could see at rest was the dock's full-width PUSH (round 1, player-feel). The beat is
   * `position: sticky` now, and this is its offset. The dock's height changes with the key row, so
   * it is re-read on every render rather than frozen into a constant.
   */
  function syncDockOffset() {
    try {
      const dock = document.getElementById('dock');
      const px = dock && !dock.hidden ? Math.round(dock.getBoundingClientRect().height) : 0;
      root.style.setProperty('--job-dock-h', `${Math.max(0, px)}px`);
    } catch { /* no layout to read (a non-DOM host); the CSS fallback is 0px */ }
  }

  /**
   * `--job-board-fit` — THE BOARD SHEET'S THIRD TERM, MEASURED.
   *
   * Round 2 capped the sheet at `min(LAYOUT.boardSheetPx, 38dvh)` because the uncapped sheet put
   * the four call rungs below the fold at 375×667. That cap was tuned against ONE phone and it
   * left **5 px** of clearance there. Round 3 (layout-safari) measured the first row of the
   * auditor's own `VP_ALL` — 320×568, an iPhone SE — and found the call row **110 px** below the
   * fold at rest, the vault's 93 px and the getaway's CRACK/WALK 52 px, in both engines. 360×640
   * misses by 12 px. A second `@media (max-height: …)` breakpoint would repeat the mistake one
   * phone further along, and the true budget is not a height at all: it is *how much chrome this
   * particular beat puts above and below the board at this particular WIDTH* — `.job-say` alone is
   * one line at 375 px and two at 320 px.
   *
   * So the screen measures it, the way it already measures card.js's dock — and it measures it
   * RELATIVELY, which is the whole of the difference between a rule that holds and a rule that is
   * 25 px out:
   *
   *     slack = clientHeight − (the decision's bottom, at the document's top)
   *     fit   = the board's CURRENT height + slack − one 8 px step
   *
   * Every term is read from the layout as it stands, so nothing has to be assumed about what is
   * above the sheet. The absolute form — `clientHeight − board.top − (decision − board.bottom)` —
   * was tried first and reads 25 px too generous at exactly the moment it runs: `.job-say` is
   * `display: none` while empty (css/job.css) and `render()` paints the panel before the beat's
   * line is filled, so the board's top is measured one whole row too high. The relative form has
   * no such term; it converges on `slack === FIT_STEP` and is a fixed point once there, so
   * re-running it is free and a later reflow simply corrects it.
   *
   * The floor is `LAYOUT.boardCollapsedPx`: when even that does not fit, the sheet gives up its
   * last pixel to the decision rather than the other way round. `css/job.css` reads this as the
   * third term of the `min()`, so `LAYOUT.boardSheetPx` and the 38dvh landscape term still win
   * whenever they are smaller, and the more specific collapse rules win outright.
   */
  function scheduleBoardFit() {
    if (destroyed) return;
    if (typeof requestAnimationFrame !== 'function') { syncBoardFit(); return; }
    if (fitRaf) return;
    /* TWO frames, not one. The first lands the cap against the layout as it stands; the second
       catches the reflow that the first one's own write (and anything else still settling — the
       live line, a web font, the dock swapping its key row) produced. The write is idempotent at
       the fixed point, so the second frame costs a `getBoundingClientRect` and nothing else. */
    fitRaf = requestAnimationFrame(() => {
      if (destroyed) { fitRaf = 0; return; }
      syncBoardFit();
      fitRaf = requestAnimationFrame(() => { fitRaf = 0; if (!destroyed) syncBoardFit(); });
    });
    /* …and once more after the beat has stopped moving. G6's entry animations run to 300 ms and
       `.job-say` is rewritten by paths that do not re-render, so the two frames above can land one
       reflow early — measured as a 1–9 px overhang that moved from run to run until this pass
       existed. Idempotent, so a settled layout pays one `getBoundingClientRect`. */
    if (fitTimer == null && typeof setTimeout === 'function') {
      fitTimer = setTimeout(() => { fitTimer = null; if (!destroyed) syncBoardFit(); }, FIT_SETTLE_MS);
    }
  }
  function cancelBoardFit() {
    if (fitRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(fitRaf);
    fitRaf = 0;
    if (fitTimer != null) { clearTimeout(fitTimer); fitTimer = null; }
  }
  function syncBoardFit() {
    try {
      const board = root.querySelector('.job-board');
      const vh = document.documentElement.clientHeight;
      if (!board || !vh) return;
      /* THE DECISION, at the beats that have one below the board. The payout beat is `sticky` and
         carries its own offset (see `.job-beat` in css/job.css), so it is deliberately not here.
         The BOARD phase used to be excluded on the same grounds — "its decision row is sticky too" —
         and that premise was wrong: a sticky box cannot be shifted above its containing block, and
         `.job-panel.job-start` puts ~600 px of content above that row, so the shift clamps to 0 and
         TAKE THE POSTED JOB sat 35 px below the fold at 320×568 at 20 px text (round 3
         verification, layout-safari). `MARKS_SELECTOR` carries the button now; see its docblock.

         **THE GETAWAY'S TERM NAMED A CLASS NOTHING RENDERS** (round 1 verification, layout-safari).
         The selector read `.job-getaway .run-actions`; `renderGetaway` emits `h('div.job-actions',
         … CRACK … WALK)` and always has, so at the one beat the comment above cites as its reason
         for existing — job.css:143, "the getaway's CRACK/WALK 52 px [below the fold]" — this
         `querySelectorAll` returned 0 nodes and the very next line REMOVED the cap. Measured, at
         rest, harness-free (chromium and webkit, 320×568 / 360×640 / 375×667 / 390×844 / 844×390):
         `marks=0 · fit=(unset)` at the getaway against `fit=80–232px` at the envelope, which has
         `.job-calls`. It held on the `38dvh` term alone, with 23 px of clearance at 360×640 — one
         extra line of `.job-say` from a regression the mechanism is supposed to catch.
         `MARKS_SELECTOR` is exported so `tests/job-screen.test.mjs` can assert a rendered getaway
         matches it: a renamed class now fails the suite instead of switching the term off. */
      const marks = root.querySelectorAll(MARKS_SELECTOR);
      if (!marks.length) {
        root.style.removeProperty('--job-board-fit');
        delete root.dataset.boardfit;
        syncBoardMore();
        return;
      }
      /* ITERATED TO ITS FIXED POINT, in one pass. Each write changes the sheet's height, which
         moves the decision; re-reading after the write is what makes the result independent of
         whatever the layout happened to be when this ran. Two passes is the arithmetic bound (the
         first lands `slack` on `FIT_STEP`, the second confirms it), the fourth is slack; the
         no-op-write guard is the stop condition, and it is also what keeps the ResizeObserver
         below from re-entering forever. */
      for (let pass = 0; pass < 4; pass++) {
        const was = root.dataset.boardfit || 'open';
        const bh = board.getBoundingClientRect().height;
        if (!(bh > 0) && was !== 'off') return;             // collapsed or unpainted — nothing to cap
        let low = -Infinity;
        for (const m of marks) low = Math.max(low, m.getBoundingClientRect().bottom);
        if (!Number.isFinite(low)) { root.style.removeProperty('--job-board-fit'); return; }
        const atRest = low + window.scrollY;               // where it sits with the page at its top
        /* The BUDGET: the height the sheet may have for the decision's bottom to sit one step above
           the fold. Both of its terms are invariant under the sheet's own height — that is what
           makes the loop converge, and it is also what lets the three states below be compared
           against each other without any of them changing the number being compared. */
        const budget = Math.round(bh + (vh - atRest) - FIT_STEP);
        /* `boardFitState` is called at every phase, because it is also what MEASURES `boardNeed` —
           the height one whole contract row takes at the student's own text size. */
        const measured = boardFitState(board, budget, was);
        /* **THE DRAFT DOES NOT ESCALATE** (round 3 verification, layout-safari — the other half of
           the repair that brought the board phase into `MARKS_SELECTOR`). At every other beat the
           sheet is CHROME beside a decision, so when taking pixels away is not enough it takes the
           one-line strip and then gives up its last 36 px. At the DRAFT the five contracts ARE the
           decision: `strip` hides `.job-board-body`, and a draft screen with no contracts on it is
           not a smaller version of the decision, it is the absence of one. So here the ladder stops
           at `open` and the floor is one WHOLE ROW rather than `LAYOUT.boardCollapsedPx` — the
           sheet still shrinks (which is the whole point: 264 → 152 px at 320×568 with the text at
           20 px is what puts TAKE THE POSTED JOB back above the fold), and `.job-board-more`'s live
           `N more ↓` is what says the list continues. If even one whole row cannot clear the fold,
           the sticky row pins itself on the first pixel of scroll, which is strictly better than a
           list the student cannot read. */
        const atBoard = root.dataset.phase === 'board';
        const floor = atBoard && boardNeed > 0
          ? Math.max(LAYOUT.boardCollapsedPx, boardNeed) : LAYOUT.boardCollapsedPx;
        const fit = Math.max(floor, budget);
        const state = atBoard ? 'open' : measured;
        const next = `${fit}px`;
        const same = root.style.getPropertyValue('--job-board-fit') === next && was === state;
        if (state === 'open') delete root.dataset.boardfit; else root.dataset.boardfit = state;
        root.style.setProperty('--job-board-fit', next);
        if (same) break;
      }
      syncBoardMore();
    } catch { /* no layout to read; the CSS fallback leaves the sheet at its published cap */ }
  }

  /**
   * **THE THIRD AND FOURTH REMEDIES, WHEN THE CAP HAS NO PIXEL LEFT TO GIVE** (round 2 verify,
   * layout-safari ×2). The measured term's floor is `LAYOUT.boardCollapsedPx` = 36, and two
   * separate measurements showed the floor is not the end of the problem:
   *
   *   · **The sliced row.** `job-envelope 320×568: h=80 client=78 scrollH=677 rows=5 whole=0` — a
   *     78 px window onto a 677 px list, with `A PAIRS · 4` cut horizontally through the middle of
   *     its glyphs by the sheet's bottom edge. A sheet too short to show ONE contract row whole is
   *     not "the exact remaining composition, open at all times" (G3.6); it is a list that looks
   *     finished and is not. The 36 px strip — one ellipsised line about the target in hand — says
   *     strictly less and claims nothing false, so below the height where a whole row fits, the
   *     sheet takes the strip.
   *   · **The floor that still does not clear.** At 320×568 with the browser's text size at 20 px
   *     (`html{font-size:20px}`, a student's own accessibility setting, installed before the state
   *     is prepared): `board=36 fit=36px decision=457-584 fold=568` — the call row 16 px BELOW the
   *     fold at rest in BOTH engines with the mechanism already at its floor. So there is a fourth
   *     state under the strip: the sheet gives up its last 36 px too. `display: none`, and NOT a
   *     zero-height clip — the first form of this rule clipped it so the rows would stay
   *     measurable, and `qa/layout-audit.mjs` rule 2 graded that a BLOCKER on sight
   *     (`zero-track · section.job-board · grid child collapsed to 0.0px tall but carries text`,
   *     light and dark, 320×568@zoom20). It is right to: a list clipped to nothing is still read
   *     aloud in full, so the sighted and the screen-reader student would get different screens.
   *     The threshold that lets the sheet open again is cached instead (`boardNeed`).
   *
   * The two thresholds are measured, never typed: `need` is the first contract row's own bottom in
   * the sheet's content coordinates (so it tracks the student's text size, the row's own wrapping
   * and the head above it), and the floor is the published constant. `was` supplies one step of
   * hysteresis on the way back out of `off`, where the removed box also removes its grid gap.
   */
  function boardFitState(board, budget, was) {
    const floor = LAYOUT.boardCollapsedPx;
    if (budget < floor + (was === 'off' ? FIT_STEP : 0)) return 'off';
    const first = board.querySelector('.job-contract');
    if (!first) return 'open';                             // nothing to slice — the strip has no job
    const r = first.getBoundingClientRect();
    /* MEASURED WHENEVER IT CAN BE, CACHED WHEN IT CANNOT. In `strip` the body is `display: none`
       and in `off` the sheet is, so the rows have no boxes to measure and the threshold that would
       let the sheet OPEN again would be unreadable from inside the state that closed it — a
       one-way door on a rotation or a keyboard close. `boardNeed` is therefore the last height a
       whole row actually took, re-measured on every pass where the rows are laid out; with nothing
       ever measured (a mount straight into a tiny viewport) the state falls to `open` on the pass
       after the budget recovers, and the pass after that re-measures and re-decides — inside the
       same synchronous loop. */
    if (r.height > 0) {
      boardNeed = Math.ceil(r.bottom - board.getBoundingClientRect().top + board.scrollTop + FIT_STEP);
    }
    if (!(boardNeed > 0)) return 'open';
    return budget >= boardNeed ? 'open' : 'strip';
  }

  function phase() {
    const live0 = g();
    if (debrief) return 'debrief';
    if (!live0) return 'board';
    return live0.phase;
  }

  /**
   * Hold what the debrief will need. `captureJobBefore` is idempotent and writes its snapshot onto
   * `inProgress.meta.before`, so it is taken ONCE — at job start, or on the first render after a
   * mid-job reload — and the queue is re-read while the job is live because the brief can swap a
   * contract into it. `endJob` → `finishPage()` nulls `inProgress`, which is why both are held here
   * rather than read at the debrief (notes/J6b.md R1).
   */
  function holdForDebrief() {
    if (!state.stateOf(getState())) return;
    try {
      update((s) => { jobBefore = captureJobBefore(s, state.queueOf(s)); });
      jobQueue = state.queueOf(getState()).slice();
    } catch (e) { console.warn('job: debrief snapshot', e); }
  }

  function render() {
    if (destroyed) return;
    if (g()) jobQueue = state.queueOf(getState()).slice();
    const ph = phase();
    /* G6: one live line, about THIS beat. A bag receipt from target 4 must not still be the first
       line a student reads on the getaway or the debrief (notes/J13.md Request 3). */
    if (saidAt !== ph) { live.textContent = ''; saidAt = ph; }
    root.dataset.phase = ph;
    root.dataset.stakes = String(g()?.stakes !== false);
    renderHead();
    renderBoard();
    if (ph !== 'answer' && ph !== 'payout') destroyView();
    if (ph !== 'payout') { beat.hidden = true; beat.replaceChildren(); }
    switch (ph) {
      case 'board': case 'guard': renderStart(); break;
      case 'envelope': case 'call': renderEnvelope(); break;
      case 'answer': renderAnswer(); break;
      case 'payout': case 'bagpush': renderPayout(); break;
      case 'brief': renderBrief(); break;
      case 'getaway': renderGetaway(); break;
      case 'debrief': renderDebrief(); break;
      default: renderStart();
    }
    renderQuit();
    syncDockOffset();
    syncBoardFit();
    scheduleBoardFit();
  }

  function say(text) {
    if (text) { live.textContent = String(text); saidAt = phase(); scheduleBoardFit(); }
  }

  function syncHeader() {
    const gv = g();
    if (gv && gv.outcome == null) {
      setJobHeader({ loose: econ.round(num(gv.loose, 0)), bagged: econ.round(num(gv.bagged, 0)), chain: int(gv.chain, 0) });
    } else if (debrief) {
      setJobHeader({ loose: 0, bagged: econ.round(num(debrief.bagged, 0)), chain: 0, drop: bagDropped });
    } else {
      setJobHeader(null);
    }
    try { const r = readiness(getState()); setHeader({ readiness: r.r, provisional: !!r.provisional }); } catch { /* keep */ }
  }

  /* ---- head ---- */
  function renderHead() {
    const gv = g();
    const shapeId = gv?.shape ?? debrief?.shape ?? board?.shape ?? 'JOB';
    const shape = SHAPES[shapeId] ?? SHAPES.JOB;
    /* At the debrief `inProgress` is already gone, so `answered()` reads 0 of a finished job and the
       bar draws empty — the debrief's own counts are the honest ones (notes/J13.md Request 3 d). */
    const total = debrief
      ? Math.max(int(debrief.of, 0), jobQueue.length)
      : gv ? state.queueOf(getState()).length : (board?.recommend?.queue?.length ?? shape.targets);
    const done = debrief ? int(debrief.targets, total) : gv ? state.answered(getState()) : 0;
    const head = h('header.run-head.job-head', { dataset: { kind: 'job' } });
    add(head, 
      /* At the debrief there is nothing left to walk away from — `renderQuit` refuses without a live
         record, so the button was a dead tap. It becomes the way out instead (notes/J13.md R3 c). */
      debrief
        ? h('a.btn.run-quit', { href: '#/today', 'aria-label': 'Today' },
          h('span.run-quit-arrow', { 'aria-hidden': 'true' }, '←'), h('span.run-quit-label', ' Today'))
        : h('button.btn.run-quit', {
          type: 'button', 'aria-label': 'Walk — progress is kept', title: 'Walk (W)',
          onclick: () => openQuit(),
        }, h('span.run-quit-arrow', { 'aria-hidden': 'true' }, '←'), h('span.run-quit-label', ' Walk')),
      h('div.run-titles',
        h('h1.run-title.fs-4', 'The Job'),
        h('p.run-sub.muted.fs-1', debrief
          ? `${shape.name} · ${total} targets · ${String(debrief.outcome ?? 'done')}`
          : gv
            ? `${shape.name} · ${total} targets · ${gv.stakes === false ? COPY.quietReview() : `chain ${int(gv.chain, 0)}`}`
            : `${shape.name} · ${total} targets · draft ${board?.draft ?? 3} of ${board?.contracts?.length ?? 0}`)),
      progress(done, total),
    );
    headSlot.replaceChildren(head);
  }

  function progress(done, total) {
    return h('div.job-progress', {
      role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total),
      'aria-valuenow': String(done), 'aria-label': 'Job progress',
    },
      h('div.job-progress-track', h('div.job-progress-fill', { style: { transform: `scaleX(${total ? done / total : 0})` } })),
      h('span.job-progress-n.mono.fs-1', `${done} of ${total}`));
  }

  /* ---- the board sheet (open at all times — G3.6 "the exact remaining composition") ---- */
  function renderBoard() {
    const gv = g();
    /* RETIRED at the debrief. G3.6 wants the sheet open while there is "remaining composition" to
       read; once the job is over there is none, and leaving it open put 477 px of dead contracts
       above the result on a 667 px screen (notes/J13.md Request 3 c). */
    if (debrief) { boardEl.replaceChildren(); boardEl.hidden = true; return; }
    boardEl.hidden = false;
    const rows = gv ? gv.bundles : (board?.contracts ?? []);
    const drafted = gv ? gv.picks : picks;
    const started = !!gv;
    boardEl.replaceChildren(
      h('p.job-board-line.mono.fs-1', { 'aria-hidden': 'true' }, gv ? collapsedLineOf(gv, currentWing() ?? gv.guard?.wing ?? '—') : 'board'),
      h('div.job-board-body',
        h('p.job-board-head.fs-1',
          h('span.job-board-title', "TONIGHT'S BOARD"),
          h('span.muted', ' · '),
          h('span.mono', board ? board.guardSupport : COPY.guardSupport({ n: Object.keys(gv?.guard?.dist ?? {}).length || GUARD.tokens }))),
        /* ONE SENTENCE, THE FIRST TIME THE VERB APPEARS (round 2, player-feel: "nothing teaches the
           game; the rulebook is Settings, written in Greek letters"). It is printed only while the
           draft is live — once the job starts the verb has been used and the line would be noise.

           **IT NAMES HOW MANY "THESE" ARE** (round 1 verification, player-feel). The sheet is a
           251 px window onto a 502 px list at 375×667, so "take 3 of these" sat over two and a half
           visible contracts of five: the count is the one part of the sentence the clip can take
           away, and it is the part that says there is more to scroll to. `rows.length` is the board
           the student is actually looking at, never `BOARD.postedMax`. */
        started ? null : h('p.job-board-teach.fs-1',
          `take ${board?.draft ?? 3} of these ${rows.length} — you answer every lock in the ones you take`),
        h('ul.job-contracts', ...rows.map((b, i) => contractRow(b, i, drafted, started))),
        board?.supplyLines?.length
          ? h('p.job-supply.muted.fs-1', board.supplyLines.join(' · '))
          : null,
        board?.x2 ? h('p.job-x2.muted.fs-1.mono', `×2: ${board.x2.count} target${board.x2.count === 1 ? '' : 's'}`) : null,
        board?.thinLine ? h('p.job-thin.fs-1', board.thinLine) : null,
        board?.dryLine ? h('p.job-dry.fs-1', board.dryLine) : null,
        vaultLine(gv),
      ),
      /**
       * **THE COUNT OF WHAT THE CLIP IS TAKING AWAY, LIVE, AT EVERY PHASE** (round 2 verify:
       * player-feel MAJOR and layout-safari MAJOR, which are the same defect at two beats).
       *
       * The round-1 repair put the remainder in `.job-board-teach` (`take 3 of these 5`) and the
       * scroll shadow in `[data-phase="board"]`, so BOTH affordances existed only while the DRAFT
       * was live. Measured at the staked beats, where the sheet is smallest:
       *
       *   job-envelope 320×568  h=80  client=78  scrollH=677  rows=5  whole=0  shadows=none  teach=null
       *   job-vault    320×568  h=146 client=144 scrollH=650  rows=5  whole=0  shadows=none  teach=null
       *
       * — an 11 % window onto the list, not one contract row wholly on screen, the one visible row
       * cut through its own glyphs, and nothing anywhere saying it scrolls. (Overlay scrollbars
       * paint nothing on a touch phone, so `scrollbar-width: thin` is not an affordance there
       * either.) This line is a direct child of the scroller and `position: sticky; bottom: 0`, so
       * it rides the sheet's own bottom edge at whatever height the fit leaves, and it is LIVE:
       * `syncBoardMore` recounts on every render, every scroll of the sheet and every resize, and
       * hides it the moment the list is read to the end. `aria-hidden` because the rows themselves
       * are in the accessibility tree already — this is the visual cue for a clip AT has no clip of.
       */
      h('p.job-board-more.mono.fs-1', { hidden: true, 'aria-hidden': 'true' }, ''),
    );
    syncBoardMore();
  }

  /**
   * `N more ↓` — how many contract rows are wholly below the sheet's own bottom edge, right now.
   * Hidden when the sheet does not scroll, when it has been scrolled to the end, and in the two
   * measured states where the sheet is not a list at all (`strip`, `off` — see `syncBoardFit`).
   */
  function syncBoardMore() {
    try {
      const more = boardEl.querySelector('.job-board-more');
      if (!more) return;
      const rows = boardEl.querySelectorAll('.job-contract');
      const clip = boardEl.getBoundingClientRect();
      const tooShort = boardEl.clientHeight < LAYOUT.boardCollapsedPx + FIT_STEP;
      let below = 0;
      if (rows.length && !tooShort && boardEl.scrollHeight > boardEl.clientHeight + 1) {
        for (const r of rows) { const b = r.getBoundingClientRect(); if (b.height > 0 && b.bottom > clip.bottom + 1) below++; }
      }
      const text = below ? `${below} more ↓` : '';
      /* WRITTEN ONLY WHEN IT CHANGES. `fitMut` observes this subtree for `childList` and
         `characterData`, and assigning `textContent` replaces the text node even when the string is
         identical — so an unconditional write here is a mutation that schedules a fit pass that
         writes again, for ever. The comparison is the stop condition. */
      if (more.textContent !== text) more.textContent = text;
      more.hidden = below === 0;
    } catch { /* no layout to read; the line stays as it was rendered (hidden) */ }
  }

  /**
   * The wing the collapsed board line is ABOUT: the target on screen.
   *
   * `env` is the envelope the live target was bid on, so while a stem (or its payout) is up it is
   * the target the student is looking at; between targets — the brief — the screen is priced at the
   * NEXT one, which is what `pricedTarget` returns and what the brief is a decision about. Either
   * way the strip names a target that exists, which is the whole of round 2's finding: it used to
   * name the GUARDED wing, which is a property of the job and not of the question in front of you.
   */
  function currentWing() {
    if (env?.wing) return env.wing;
    const gv = g();
    if (!gv) return null;
    try {
      if (state.targetsLeft(getState()) === 0) return null;
      return state.pricedTarget(getState(), { tellFor: tellHookFor(getState()) })?.wing ?? null;
    } catch { return null; }
  }

  function vaultLine(gv) {
    const v = board?.vault ?? null;
    const id = gv?.vault ?? v?.id ?? null;
    if (!id) return null;
    const card = cardById[id];
    const make = (card?.skills || [])[0] ?? v?.skill ?? '—';
    const q = callMod.qHatDetail(getState(), make, { cards: cardById });
    return h('p.job-vault.muted.fs-1.mono', vaultLineOf({
      make, grade: v?.grade ?? card?.tier ?? 3, qHat: q, breakeven: breakevenLabel(),
    }));
  }

  /**
   * **`q*` at THIS target's own `ρ̄`** — G3.2's threshold, not G3.2's brochure row.
   *
   * `econ.breakevenQ` defaults `ρ̄` to 1 when it is handed no rung distribution
   * (`econ.rhoBarFor(null) → 1`, "the optimistic bound G3.2's published table uses"), and this
   * screen handed it none — so every q* the app has ever printed was the ρ̄ = 1 bound while G3.2 and
   * Settings both told the student it was computed from their own rung distribution (round 1,
   * econ-math). Two arguments close that gap, and both already existed:
   *
   *   · `rungs` — `crew.bandFor(m_shown)`, G2's own reading of `save.cards[*].history` per make,
   *     interpolated between the three shipped bands. This is the distribution G3.2 names.
   *   · `crew` — the rank this target will ACTUALLY be forgiven at, which is `crewInfo.forgives`
   *     rather than the stored rank: a target that is its own due review is forgiven at BARE (the
   *     idle rule), so pricing it at STEADY would print a threshold the payout will not honour.
   *
   * The branch (deep vs shallow) and the fee convention stay exactly G3.2's published closed forms —
   * only `ρ̄` stops being a constant.
   */
  /**
   * The call `q*` is stated AT. `(W, P)` are a function of the call, and at a bag-or-push the next
   * target has not been called yet — nothing could know it without recommending one (Global law 6).
   * So the threshold is quoted at the call the student themself last locked, and the line says so
   * rather than hiding the assumption behind a default.
   *
   * **`g.locked` IS NULL AT EVERY PAYOUT** — `state.js:1015` clears it inside `applyTarget`, so the
   * sentence above was false of the one beat that prints this number: `callOf` returned the hard
   * `CALL_FALLBACK` (70) every single time, and the line printed `at call 70` as though the student
   * had chosen it (round 3, player-feel). `g.calls` is the window `applyTarget` has just pushed the
   * real call into, so the *last locked call* is readable after all — and the fallback survives for
   * the only state where nothing has been locked yet, the first envelope.
   */
  function callOf(gv) {
    const calls = Array.isArray(gv?.calls) ? gv.calls : [];
    const last = calls.length ? calls[calls.length - 1] : null;
    return int(gv?.locked?.call ?? last?.call ?? CALL_FALLBACK, CALL_FALLBACK);
  }

  function breakevenQOf(gv, t, call = callOf(gv)) {
    return econ.breakevenQ({
      /* THE WHOLE PRICED TARGET (notes/econ-fix.md Request 1, notes/tests-fix.md Request 5).
         `state.pricedTarget` already carries `scopeFlags`, `bucket`, `overdueDays`, `tell`,
         `tokens`, `guarded`, `rank` and `x2`, and round 2 made `econ.gainLFor` / `lossLFor` read
         every one of them. Picking four fields off it priced a BARE T1 and printed that threshold
         over a cold tagged review on the guarded wing — a verdict flip somewhere on q ∈ [0.3, 0.9]
         in 52.5 % of realistic states. The spread goes FIRST, so the two explicit arguments below
         (round 1's ρ̄ and idle-rule fixes) still win. `tier` and `loot` arrive with the spread. */
      ...t,
      loose: gv.loose,
      chain: gv.chain,
      call,
      rungs: state.crew.bandFor(state.crew.mShownOf(getState(), t.make)),
      crew: Math.max(0, int(t.crewInfo?.forgives ?? t.crew, 0)),
    });
  }

  /**
   * The vault's `crack breaks even at …`, or `null` when there is no threshold to quote — which is
   * BOTH of the states that used to print a number that means nothing: no live job (the board's
   * preview, where `pricedTarget` has nothing to price) and a `q*` of exactly 0 (an empty pile, or
   * a rung that stakes nothing — see `thresholdRow`). It printed `crack breaks even at —` on the
   * board and `at 0.00` at the getaway on seven of nine beats of one shipped job.
   */
  function breakevenLabel() {
    const gv = g();
    if (!gv) return null;
    try {
      const t = state.targetsLeft(getState()) ? state.pricedTarget(getState(), { tellFor: tellHookFor(getState()) }) : null;
      if (!t) return null;
      const q = num(breakevenQOf(gv, t), 0);
      return q > 0 ? q.toFixed(2) : null;
    } catch { return null; }
  }

  /** `getawayThresholdOf` bound to the live job — every argument read off the machine. */
  function getawayThreshold() {
    const gv = g();
    if (!gv) return null;
    const s = getState();
    try {
      const t = state.targetsLeft(s) ? state.pricedTarget(s, { tellFor: tellHookFor(s) }) : null;
      if (!t) return null;
      return getawayThresholdOf({
        bagged: gv.bagged, loose: gv.loose, chain: gv.chain, stakes: gv.stakes !== false,
        target: t,
        rungs: state.crew.bandFor(state.crew.mShownOf(s, t.make)),
        crew: Math.max(0, int(t.crewInfo?.forgives ?? t.crew, 0)),
        calls: state.callsAvailable(s),
      });
    } catch { return null; }
  }

  function contractRow(b, i, drafted, started) {
    const on = drafted.includes(b.id);
    const key = String(i + 1);
    const inner = [
      h('span.job-c-key.mono', { 'aria-hidden': 'true' }, key),
      h('span.job-c-name', h('span.job-c-id.mono', b.id), ' ', h('span.job-c-label', b.label ?? b.wing ?? '—'),
        b.overflow ? h('span.muted', ` +${b.overflow}`) : null),
      /* THE BAND, not the floor (notes/board-fix.md Requests 1, filed in both rounds). `page.js`
         composes `gradeLabel` as `grade N` or `grade N–M` over the bundle's own tiers; this row
         printed `b.grade`, which is `Math.min(...tiers)` — so a bundle holding grade-1 and grade-4
         locks (3 answer-minutes against 0.5) read `grade 1`, and on a real board every row read
         `grade 1`. The one column that prices the draft was constant and wrong. */
      h('span.job-c-meta.muted.fs-1', `${(b.locks || []).length} locks · ${b.gradeLabel ?? `grade ${b.grade ?? 1}`} · ${b.wing ?? '—'} · ~${Math.round(num(b.minutes, 0))} min`),
      h('span.job-c-posted.mono', `posted ${econ.round(num(b.posted, 0))}`),
    ];
    if (started) {
      /* `REVIEW · no stakes` over five live prices is a lie about what the next answer costs, so the
         posted column goes grey the moment the stakes come off (notes/J13.md Request 3 c). */
      const stakes = g()?.stakes !== false;
      return h('li', h('div.job-contract', { dataset: { picked: String(on), stakes: String(stakes) } }, ...inner));
    }
    return h('li', h('button.job-contract', {
      type: 'button', dataset: { picked: String(on) }, 'aria-pressed': String(on),
      onclick: () => toggleDraft(b.id),
    }, ...inner));
  }

  /** Scroll the sheet — never the page — so contract `i` is inside the 251 px window. */
  function showContract(i) {
    try {
      const el = boardEl.querySelectorAll('.job-contract')[i];
      if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
    } catch { /* no layout to scroll (a non-DOM host) */ }
  }

  function toggleDraft(id) {
    const want = board?.draft ?? 3;
    if (picks.includes(id)) picks = picks.filter((p) => p !== id);
    else if (picks.length < want) picks = [...picks, id];
    else picks = [...picks.slice(1), id];
    picks.sort();
    render();
  }

  /* ---- the board phase: guard bars, the token press, COMMIT, the primary ---- */
  function renderStart() {
    const gv = g();
    const dist = gv ? { byWing: gv.guard.dist, eps: gv.guard.eps } : board?.guard ?? null;
    const bars = dist ? guardMod.guardBars(dist) : [];
    const tokens = gv ? { ...gv.tokens } : { ...(board?.press?.tokens ?? {}) };
    const support = bars.map((x) => x.wing);
    if (tokenSel >= support.length) tokenSel = 0;
    const spent = support.reduce((t, w) => t + Math.max(0, int(tokens[w], 0)), 0);
    /* THE BUTTON IS RE-PRICED HERE, on every render — and `toggleDraft` calls `render()` — so the
       letters, the posted value, the wall clock and the split are the DRAFT'S, not the
       recommendation's (see `quoteFor`). Once the job is live the draft is fixed and the button is
       "Start the first envelope", so the quote is only computed while the board is still open. */
    const quote = gv ? null : quoteFor(getState(), board, picks);

    const panel = h('div.job-panel.job-start');
    add(panel, 
      h('h2.fs-3', 'Guard'),
      board?.guard?.coldStart ? h('p.job-guard-cold.muted.fs-1', COPY.guardColdStart({ n: bars.length || GUARD.tokens })) : null,
      h('ul.job-bars', ...bars.map((x) => h('li.job-bar', { dataset: { wing: x.wing, blocked: String(!!x.blocked) } },
        h('span.job-bar-name', x.wing),
        h('span.job-bar-track', h('span.job-bar-fill', { style: { transform: `scaleX(${Math.max(0, Math.min(1, x.p))})` } })),
        h('span.job-bar-pct.mono.fs-1', `${x.pct}%`)))),
      h('h2.fs-3', 'Press'),
      /* THE SECOND SENTENCE (round 2, player-feel). The press control rendered as `− RECALL ⟨1⟩ +`
         and nothing else: the ×1.25 first appeared on the NEXT screen, inside the GUARD line, after
         the decision had been taken. The two numbers are `data/job.js`'s own (`GUARD.tokenBonus`,
         and the guard's multiplier from the live record or the rank the board posts), so the
         sentence cannot drift from the arithmetic it describes. */
      h('p.job-token-teach.fs-1',
        `a token is +${Math.round(GUARD.tokenBonus * 100)} % on that wing's loot`
        + ` · the guard takes one wing tonight, and tokens on it are void`),
      h('div.job-tokens', { role: 'group', 'aria-label': `Press ${GUARD.tokens} tokens` },
        ...support.map((w, i) => tokenRow(w, i, tokens, spent))),
      h('p.job-token-hint.muted.fs-1', `← / → press · ↑ / ↓ pick a wing · ${GUARD.tokens - spent} left`),
      commitBlock(),
      /* **THE PRESS IS BELOW THE FOLD AND THE BUTTON THAT PASSES IT IS NOT** — measured, and
         deliberately NOT patched here (round 2 verify, player-feel, the last paragraph of the sheet
         finding). At rest, chromium, this fixture: `.job-tokens` 701–919 and `.job-commit-btn`
         962–1006 on a 667 px screen, 750–968 and 1011–1055 on a 568 px one, while `.job-primary` —
         inside the sticky row below — floats at 469–557. A phone cannot hold five contracts, three
         token rows, COMMIT and START above one fold: the sheet is G6's published 264 px and the
         press is 218 px on its own.
         A "N tokens still to press ↓" cue was built into the sticky row and then removed, because
         it is dead by construction: the posted board arrives with the press already SPENT
         (`⟨1⟩⟨1⟩⟨1⟩⟨0⟩` at the draft, `spent === GUARD.tokens`), so the token rows are a default to
         ADJUST, not a decision to make — `startOrGo`'s own note says so ("a student who accepts the
         posted mix without touching it presses at `now`"). The only state the cue could render in
         is one the student reached by un-pressing on purpose, where it would nag about a choice
         they had just made. The honest report is in notes/repair-screen.md rather than in a control
         nobody would see. */
      h('div.run-actions',
        h('button.btn.btn-primary.job-primary', { type: 'button', onclick: () => startOrGo(tokens) },
          gv ? 'Start the first envelope' : (quote?.primary ?? board?.primary ?? 'TAKE THE POSTED JOB')),
        h('a.btn', { href: '#/today' }, 'Today')),
      /* THE PAYOUT AND TARGET ARITHMETIC THE BUTTON DOES NOT CLOSE, under the button and never on it
         (one-line addition by the board lane, BUILD-POLICY §2 — notes/repair-board.md Requests).
         `board.js draftFrom` composed this line for two rounds and `grep -rn sharedLine site/`
         returned only `board.js`: the button promised `posted 419` under three contract rows that
         add to 526 and a teach line promising all 15 of their locks, and nothing on the screen said
         why. The quote's line is the draft ON SCREEN, exactly as the button beside it is. */
      (gv ? null : (quote?.sharedLine ?? board?.sharedLine))
        ? h('p.job-shared.muted.fs-1', quote?.sharedLine ?? board.sharedLine) : null,
      (quote?.projection ?? board?.projection) ? h('p.job-projection.muted.fs-1', quote?.projection ?? board.projection) : null,
      board?.everyDraftIdentical ? h('p.muted.fs-1', 'every draft yields the same union tonight') : null,
    );
    stage.replaceChildren(panel);
    // G1's GUARD line names a wing, so it may only be printed once the guard has DRAWN. Before the
    // job starts there is no draw — only the published distribution, which is the bars above.
    if (gv?.guard?.wing) sayGuard(gv);
  }

  /**
   * `GUARD: WORDS.  your tokens: RECALL 2 (×1.5) · WORDS 1 (guarded, ×0.55) · FIGURES 0` (G1).
   *
   * The example is COMPOSED, not typed: `COPY.guardToken` interpolates the multiplier raw, so
   * `econ.round(1 + GUARD.tokenBonus · 2, 2) = 1.5` renders `×1.5` and never `×1.50`; the guarded
   * wing's own figure is the RANK's (`×0.50 … ×0.75`), here Called 2's. COMPOSED-GAME.md G6's copy
   * table prints a third form again — `RECALL 2 · WORDS 1 (×0.60)`, which drops the unguarded
   * wing's multiplier and the `guarded,` tag — and that row is filed as a Request in
   * notes/repair-screen.md (verify round 2, spec-fidelity) rather than fixed here: the document is
   * the doc lane's file, and this comment is the shipped composition it should be copied from.
   */
  function sayGuard(gv) {
    const wings = WING_IDS.filter((w) => gv.guard?.dist?.[w] != null);
    say(COPY.guard({
      wing: gv.guard.wing,
      tokens: wings.map((w) => {
        const n = Math.max(0, int(gv.tokens?.[w], 0));
        const guarded = gv.guard.wing === w;
        return COPY.guardToken({
          wing: w, n, guarded,
          mult: guarded ? num(gv.guard.mult, 0.5) : (n > 0 ? econ.round(1 + GUARD.tokenBonus * n, 2) : null),
        });
      }).join(' · '),
    }));
  }

  /**
   * One wing's ± row. `gate` is the brief window's own legality test (S5): there a ± stages a move
   * rather than committing one, and what may be staged is `state.canPress`'s answer about the
   * candidate — the machine's own `pressRefusal`, so the greyed button IS the rule that would
   * refuse. At the board there is nothing to ask: the press is free until it is sealed.
   */
  function tokenRow(w, i, tokens, spent, gate = null) {
    const n = Math.max(0, int(tokens[w], 0));
    const can = (d) => (gate ? gate(w, d) : (d < 0 ? n > 0 : spent < GUARD.tokens));
    return h('div.job-token', { dataset: { wing: w, sel: String(i === tokenSel) } },
      h('button.btn.job-token-btn', {
        type: 'button', 'aria-label': `One fewer token on ${w}`, disabled: !can(-1),
        onclick: () => { tokenSel = i; bump(w, -1); },
      }, '−'),
      h('span.job-token-name', w),
      h('span.job-token-n.mono', `${GLYPHS.tokenOpen}${n}${GLYPHS.tokenClose}`),
      h('button.btn.job-token-btn', {
        type: 'button', 'aria-label': `One more token on ${w}`, disabled: !can(+1),
        onclick: () => { tokenSel = i; bump(w, +1); },
      }, '+'),
    );
  }

  /** The board → guard boundary: the first touch of the press panel, whatever moved it. */
  function touchPress() { if (!pressAt) pressAt = now(); }

  /**
   * ── S5, THE GUARD GAME: A BRIEF PRESS IS ONE ATOMIC SUBMIT ──────────────────────────────────────
   *
   * `state.press` REDRAWS THE GUARD, and this handler used to commit through it on every ± tap. So
   * inside a brief window the round-3 repair moved the leak rather than closing it: the lift
   * redrew, `envelopeFor` published the new wing, and the student then placed the freed token
   * against a wing they already knew — and because the redraw is pinned to `${seed}|brief${n}`, the
   * seed pin that exists to defeat re-rolling is exactly what guaranteed the second half of the
   * two-step faced a certainty. `pressRefusal`'s own lift-first clause
   * (`added > 0 && removed === 0 && !lifted`, state.js:841) waved it through, because the lift had
   * set `lifted`. The token is worth `+0.25·v` on an unguarded wing and 0 on the guarded one, so
   * placing after the draw is worth `y·0.25·v` a window — up to 4× the token's marginal value at
   * the published 0.75 cap; the pre-fix form of the same hole measured +9.4 % posted over 8 seeds.
   *
   * The fix is HERE and not in the machine, and that is a constraint rather than a preference:
   * `tests/job-state-r3.test.mjs` pins the two-step legal at module level (16 tests — "the place
   * after the lift was refused" is an assertion that it is NOT), and `state.press`'s bare branch
   * must stay legal because that file's priced-button test, `job-split.test.mjs:194` and the
   * fixture in `tests/_helpers.mjs` all exercise it. So the brief's ± stage a SCREEN-LOCAL
   * allocation, gated by `state.canPress` — the same `pressRefusal` the machine will run — and the
   * one press the window gets is submitted whole by the button below, with `added === 1` and
   * `removed === 1`, which fires exactly one redraw AFTER the move is committed.
   *
   * The board press is untouched: there the press is free, blind and sealed before any draw.
   */
  function bump(wing, d) {
    touchPress();
    const gv = g();
    if (gv && gv.phase === 'brief') {
      const cur = pendingOf(gv);
      const next = { ...cur, [wing]: Math.max(0, int(cur[wing], 0) + d) };
      /* The state machine's own rule, asked about the candidate: the total cap, one lift per
         window, no place before a lift, and nothing at all below a full press. A candidate it
         refuses is a button this screen greys out (`tokenRow`), so the greyed button and the
         refusal are one decision and cannot drift. */
      if (!state.canPress(getState(), next)) return;
      pending = next;
      pendingAt = int(gv.briefs?.length, 0);
      render();
      return;
    }
    const cur = gv ? { ...gv.tokens } : { ...(board?.press?.tokens ?? {}) };
    const next = { ...cur, [wing]: Math.max(0, int(cur[wing], 0) + d) };
    const total = WING_IDS.reduce((t, w) => t + Math.max(0, int(next[w], 0)), 0);
    if (total > GUARD.tokens) return;
    if (gv) update((s) => { state.press(s, next); });
    else if (board) board.press = { ...board.press, tokens: next };
    render();
  }

  /** The staged allocation for THIS brief window, or the live one when nothing is staged yet. */
  function pendingOf(gv) {
    if (pending && pendingAt === int(gv?.briefs?.length, 0)) return { ...pending };
    pending = null; pendingAt = -1;
    return { ...(gv?.tokens ?? {}) };
  }

  /**
   * The staged move, as the machine will read it: how many tokens are up and how many are down
   * against the LIVE allocation. `atomic` is the only submittable shape — one lifted and one
   * placed, which `pressRefusal` accepts with `lifted === false` and which redraws once.
   *
   * A lift on its own is deliberately NOT submittable. It is legal in the machine, but committing
   * it leaves the window `lifted` with a token in hand, and `pressRefusal` then accepts a bare
   * place — the informed placement this whole repair exists to close. The screen therefore submits
   * the move or nothing, and "redraw and move nothing" (`added === 0 && removed === 0`, the branch
   * state.js:837 calls "always legal") is not offered either: a free redraw is weakly dominant at
   * every realisation and strictly positive when the draw went against you, which is the shape
   * G11 rejects by name.
   */
  function pressMove(gv) {
    const cur = gv?.tokens ?? {};
    const next = pendingOf(gv);
    let added = 0; let removed = 0;
    for (const w of WING_IDS) {
      const d = Math.max(0, int(next[w], 0)) - Math.max(0, int(cur[w], 0));
      if (d > 0) added += d; else removed -= d;
    }
    return { tokens: next, added, removed, atomic: added === 1 && removed === 1, staged: added + removed > 0 };
  }

  function commitBlock() {
    const c = getState().game?.commit ?? null;
    if (c?.bound) {
      return h('p.job-commit.fs-1', c.kind === 'walk'
        ? COPY.commitWalk({ minutes: c.byMin })
        : COPY.commitDoneBy({ at: `${String(Math.floor(c.byMin / 60)).padStart(2, '0')}:${String(c.byMin % 60).padStart(2, '0')}` }));
    }
    /* A declaration STAGED inside a brief window is not bound yet — it binds through
       `state.brief({commit})` when the window is submitted, which is the one call that also carries
       the window's other four options. It reads back as the sentence it will become, marked staged.
       (Round 4 verification, exploit-hunt: `doCommit` used to bind straight through `commitBind`,
       which is why COMMIT was the ONLY option that did not close the window — and the only reason
       the other four were ever reachable in the same window as anything.) */
    const stagedCommit = g()?.phase === 'brief' ? stageFor(g()).commit : null;
    if (stagedCommit && !commitOpen) {
      return h('p.job-commit.fs-1', { dataset: { staged: 'true' } },
        stagedCommit.kind === 'walk'
          ? COPY.commitWalk({ minutes: stagedCommit.byMin })
          : COPY.commitDoneBy({ at: `${String(Math.floor(stagedCommit.byMin / 60)).padStart(2, '0')}:${String(stagedCommit.byMin % 60).padStart(2, '0')}` }),
        ' ',
        h('button.btn.btn-ghost.fs-1.job-commit-undo', { type: 'button', onclick: () => stageBrief({ commit: null }) }, 'Not tonight'));
    }
    if (!commitOpen) {
      return h('p.job-commit', h('button.btn.job-commit-btn', { type: 'button', onclick: () => { commitOpen = true; render(); } },
        'COMMIT ', h('span.muted.fs-1', '(C)')));
    }
    const d = WEEK.commitDefaults;
    return h('div.job-commit.job-commit-open', { role: 'group', 'aria-label': 'Commit' },
      h('button.btn', { type: 'button', onclick: () => doCommit('walk', d.walkAtMinutes) }, COPY.commitWalk({ minutes: d.walkAtMinutes })),
      h('button.btn', { type: 'button', onclick: () => doCommit('doneBy', d.doneByMin) },
        COPY.commitDoneBy({ at: `${Math.floor(d.doneByMin / 60)}:${String(d.doneByMin % 60).padStart(2, '0')}` })),
      /* `Not tonight` closes the picker AND takes a staged declaration back off the table — the
         picker can be reopened over a staged one to change it, so this is the only control that
         means "no declaration this window". */
      h('button.btn.btn-ghost', { type: 'button', onclick: () => { commitOpen = false; if (g()?.phase === 'brief') { stageBrief({ commit: null }); return; } render(); } }, 'Not tonight'),
    );
  }

  function doCommit(kind, byMin) {
    commitOpen = false;
    if (!g()) { render(); return; }                 // a declaration binds to a live job (J5c commitBind)
    /* inside a brief window the declaration is one of the window's five options, so it is staged and
       bound by `state.brief({commit})` at the submit — see `commitBlock` */
    if (g().phase === 'brief') { stageBrief({ commit: { kind, byMin } }); return; }
    try { update((s) => { state.commitBind(s, { kind, byMin }); }); } catch (e) { console.warn('job: commit', e); }
    render();
  }

  /**
   * **`ph.guard` becomes a measurement** (round 2, split-honesty). G1's fixed-phase table publishes
   * two beats here — *"board read + draft 18 s"* and *"guard reveal + token press 12 s"* — and
   * `game.ledger.phaseMeans` keeps a rolling mean of both. The screen painted them as ONE panel and
   * went `board → envelope`, so `g.ph.guard` was never written by any shipped path: `foldMean`
   * returns early on a zero observation, `phaseMeans.guard` stayed exactly `PHASE_MEANS_DEFAULT`
   * forever, and the board's `~N min · ends HH:MM` carried a permanent 12 s constant on top of a
   * `means.board` that had already absorbed the press.
   *
   * The boundary is the student's own first touch of the press panel — a token, or the keys that
   * pick a wing. Before it they are reading the board; after it they are pressing. Nothing about the
   * game's order changes (the press is still sealed BEFORE the guard draws, which is the whole
   * seal), and the walk drivers still reach the first envelope in one tap. A student who accepts the
   * posted mix without touching it presses at `now`, so `guard` observes 0 and `foldMean` ignores
   * it — the honest outcome: their whole read is `board`, and nothing invents a beat they skipped.
   */
  function startOrGo(tokens) {
    const gv = g();
    const pressed = pressAt || now();
    if (!gv) {
      if (!board) { navigate('/today'); return; }
      try {
        update((s) => {
          state.startJob(s, { picks: picks.length ? picks : undefined, tokens, now: boardAt || now(), today, board, seed: board.seed });
          state.tick(s, 'guard', pressed);           // banks the REAL board-read seconds into ph.board
          state.beginTargets(s, { now: now() });     // …and the press seconds into ph.guard
        });
      } catch (e) { console.error('job: cannot start', e); renderBroken(e); return; }
      holdForDebrief();                            // before the first answer moves a skill bar
    } else {
      try {
        update((s) => {
          state.press(s, tokens);
          state.tick(s, 'guard', pressed);
          state.beginTargets(s, { now: now() });
        });
      } catch (e) { console.error('job: cannot begin', e); }
    }
    syncHeader();
    const gv2 = g();
    if (gv2?.guard?.wing) sayGuard(gv2);
    render();
  }

  /* ---- the SEALED envelope + the call row ---- */
  function renderEnvelope() {
    const s = getState();
    const gv = g();
    if (!gv) return;
    if (gv.stakes === false) return renderNoStakes();
    try { env = state.envelopeFor(s, { makeName: makeNameOf(state.currentItem(s)?.skill) }); }
    catch (e) { console.error('job: envelope', e); return renderBroken(e); }
    const qHat = callMod.qHatDetail(s, env.make, { cards: cardById });
    const lines = envelopeLinesOf(env, qHat);

    const panel = h('div.job-panel.job-envelope', { dataset: { x2: String(!!env.x2), guarded: String(!!env.guarded) } });
    // The call row is DESCRIBED BY the two envelope lines rather than duplicating them into a hidden
    // live region: the student and the screen reader get the same sentence, once.
    const lineId = `job-env-line-${env.n}`;
    const evId = `job-env-ev-${env.n}`;
    add(panel, 
      h('p.job-env-n.muted.fs-1', `Envelope ${env.n} of ${env.of}`, env.x2 ? h('span.job-x2-mark.mono', ' ×2') : null),
      h(`p.job-env-line.mono#${lineId}`, lines.head),
      h(`p.job-env-evidence.mono.muted.fs-1#${evId}`, lines.evidence),
      env.guarded ? h('p.job-env-note.fs-1', `${env.wing} is guarded — ×${num(gv.guard?.mult, 0.5).toFixed(2)} on a clear, double on a miss`) : null,
      env.idle ? h('p.job-env-note.fs-1', COPY.crewIdle({ make: env.make })) : null,
      !env.idle && env.crew > 0 ? h('p.job-env-note.muted.fs-1', `crew ${env.make} forgives ${env.crew} rung${env.crew === 1 ? '' : 's'}`) : null,
      h('div.job-calls', { role: 'group', 'aria-label': 'Call your confidence before the stem', 'aria-describedby': `${lineId} ${evId}` },
        ...env.calls.map((c, i) => h('button.btn.job-call', {
          type: 'button', dataset: { call: String(c) },
          onclick: () => lockCall(c),
        }, h('span.job-call-key.mono', { 'aria-hidden': 'true' }, String(i + 1)), h('span.job-call-n', String(c))))),
      /* THE THIRD SENTENCE, on the FIRST envelope only (round 2, player-feel). The call row is four
         bare numbers; what they mean was published only in Settings, as `PUSH − BAG = θ·S + …`. It
         says what the call IS, never which one to take — Global law 6 bans the argmax here, and the
         sentence deliberately carries no rung and no comparison. */
      env.n <= 1 ? h('p.job-call-teach.fs-1', 'call how sure you are — a higher call pays more and costs more') : null,
      h('p.job-call-hint.muted.fs-1', 'The stem opens once the call is locked.'),
    );
    stage.replaceChildren(panel);
    focusFirst(panel, '.job-call');
  }

  /** A no-stakes target (after CALL IT, or after the 22:00 close): one door, `beginAnswer`. */
  function renderNoStakes() {
    const s = getState();
    const left = state.targetsLeft(s);
    env = null;
    const panel = h('div.job-panel.job-envelope.job-nostakes');
    add(panel, 
      h('p.job-env-n.muted.fs-1', `${state.answered(s) + 1} of ${state.queueOf(s).length}`),
      h('p.job-env-line.mono', COPY.callIt({ left })),
      h('div.run-actions', h('button.btn.btn-primary', { type: 'button', onclick: () => openAnswer() }, 'Open the question')),
    );
    stage.replaceChildren(panel);
    focusFirst(panel, '.btn-primary');
  }

  function lockCall(c) {
    try { update((s) => { state.lockCall(s, c, { now: now() }); }); }
    catch (e) { console.warn('job: call refused', e); return; }
    render();
  }

  function openAnswer() {
    try { update((s) => { state.beginAnswer(s, { now: now() }); }); }
    catch (e) { console.warn('job: beginAnswer', e); return; }
    render();
  }

  /* ---- the answering body: screens/card.js, mounted as-is ---- */
  function renderAnswer() {
    if (view) return;                              // already mounted for this target
    const s = getState();
    const ref = state.stemRefFor(s);
    if (!ref) { render(); return; }                // the seal: no call, no stem
    const it = ref.item;
    let source;
    try { source = sourceFor(it); }
    catch (e) {
      console.error('job: cannot build the target', it, e);
      return applyResult({ id: it.id, cleared: false, skipped: true, reason: 'broken', attempt: 3, hints: 0 });
    }
    stage.replaceChildren();
    view = createCardView(stage, source, {
      kind: it.kind === 'variant' ? 'variant' : 'card',
      review: it.isReview ? true : null,
      rematch: !!it.isRematch,
      drill: false,
      forCard: it.forCard ?? null,
      back: '/today',
      mode: 'card',
      hints: state.hintsOn(),                      // always true (COMPOSED global rule 1)
      rename: null,
      onDone: (r) => applyResult(r),
      onContinue: () => continueBeat(),
    });
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
    sayHintPrice();
  }

  /**
   * **WHAT A HINT COSTS, PRINTED BEFORE THE HINT** (round 2, player-feel).
   *
   * Global law 6: *"Every probability, distribution and price is printed before the choice it
   * affects."* G3 publishes the price — *"hints stay free and infinite everywhere (Global law 1);
   * what a hint costs is 30 % of the payout"* — and the only sentence on screen was `card.js`'s
   * side rail, *"Hints (H) — cost XP quality, never an attempt"*, which is true of Ledger A and
   * silent about the stake: on a measured target rung 0 pays 122 loose and rung 1 pays 85.
   *
   * The number is this target's own, not the 30 % brochure figure: `econ.settle` at rung 0 against
   * rung 1, the same call the payout will use, so a crew rank that forgives the first rung correctly
   * prices the hint at ZERO and the line stays quiet rather than inventing a cost. It is said on the
   * job's own live region because `screens/card.js` belongs to another lane — a `hintNote` option on
   * the card view would put it on the button itself (notes/screen-fix.md → Requests).
   */
  function sayHintPrice() {
    const s = getState();
    const gv = g();
    if (!gv || gv.stakes === false) return;            // stakes off (CALL IT / 22:00): no price
    try {
      const t = state.pricedTarget(s, { tellFor: tellHookFor(s) });
      const call = int(gv.locked?.call ?? CALL_FALLBACK, CALL_FALLBACK);
      const at = (rung) => num(econ.settle({ ...t, call, rung, crew: t.crew, idle: t.idle },
        int(gv.chain, 0), num(gv.loose, 0)).delta, 0);
      const clean = econ.round(at(0));
      const cost = econ.round(clean - at(1));
      if (!(cost > 0)) return;
      say(`hints are free · this one costs ${cost} of ${clean} loose`);
    } catch { /* an unpriceable target says nothing rather than a wrong number */ }
  }

  function sourceFor(it) {
    if (it.kind === 'variant') return { item: T.generate(it.template, it.seed, it.params ?? {}) };
    const card = cardById[it.id];
    if (isObj(it.rename) && card) return { id: it.id, item: renameCard(card, it.rename) };
    return { id: it.id };
  }

  function destroyView() {
    if (view) { try { view.destroy(); } catch (e) { console.error(e); } view = null; }
  }

  /* ---- the payout beat ---- */
  function applyResult(result) {
    payoutMove = null;
    try {
      update((s) => {
        const before = ratingValueOf(s);
        payout = state.applyTarget(s, result, { now: now(), cards: cardById, tellFor: tellHookFor(s) });
        const after = ratingValueOf(s);
        payoutMove = before == null || after == null ? null : after - before;
      });
    } catch (e) { console.error('job: applyTarget', e); return; }
    if (payout?.free) { payoutMove = null; return; }   // almost / malformed: the target is still live
    syncHeader();
    root.dataset.phase = 'payout';
    /* This beat is painted WITHOUT `render()`, so the one rule `render()` enforces about the live
       line has to be enforced here too (G6: one live line, about THIS beat). The answer phase's
       line is the hint's price, and the price of a hint you can no longer take is not news. */
    if (saidAt !== 'payout') { live.textContent = ''; saidAt = 'payout'; }
    renderHead();
    renderBoard();
    renderPayout();
    renderQuit();
  }

  /**
   * A reload can land ON the payout beat: `inProgress.game.last` is the beat's undo record, so the
   * line is rebuilt from the save rather than from a variable the reload threw away.
   *
   * **`w` COMES BACK WITH IT.** `applyTarget` pushes `{call, ok, w, skill, rung, d, at}` onto
   * `g.calls` for every staked target (state.js:1194), so the slot's own weight survives the
   * reload even though the rating's before-value does not. Rebuilt with `w: 0` — as it was — the
   * line took `payoutLineOf`'s blank-slot branch on every reload and told a student whose call WAS
   * a measurement that it was not. The rating move stays unmeasurable on this path (`payoutMove`
   * is null), and the line then prints nothing about the rating rather than guessing at it.
   */
  function payoutFromLast(gv) {
    const last = gv?.last;
    if (!isObj(last)) return null;
    const calls = Array.isArray(gv?.calls) ? gv.calls : [];
    const slot = calls.length ? calls[calls.length - 1] : null;
    return {
      kind: last.ok ? 'clear' : 'miss', rung: last.rung, rho: null, delta: num(last.d, 0), free: false,
      loose: num(gv.loose, 0), bagged: num(gv.bagged, 0), chain: int(gv.chain, 0),
      chainBefore: int(last.chainBefore, 0), posted: 0, call: int(slot?.call, 0) || null, ok: last.ok === true,
      credit: 0, w: num(slot?.w, 0), target: null, backcheckable: false, next: null,
    };
  }

  function renderPayout() {
    const s = getState();
    const gv = g();
    if (!payout) payout = payoutFromLast(gv);
    if (!payout) { beat.hidden = true; beat.replaceChildren(); return; }
    const staked = gv?.stakes !== false;
    const line = staked ? payoutLineOf(payout, env, payoutMove) : '';
    const ladder = staked ? ladderLineOf(payout) : '';
    const nextBeat = beatAfter(s);
    const ticks = chainTicksOf(payout.chain);
    const prompt = gv && nextBeat === 'bagpush' ? state.bagPrompt(s) : null;
    /**
     * **A BAG THAT BANKS NOTHING IS NOT A DECISION** (round 1 verification, player-feel).
     *
     * `bagPrompt` is offered on every beat with a target left, and after a miss into an empty pile
     * its amount is 0: one full shipped job on `qa/fixtures/audit/midweek.json` at 19:30, taking
     * the board's own recommendation, offered `bag 0 (fee 0 · chain 0 → 0)` on SEVEN of its nine
     * beats, beside `breaks even at q 0.00` seven times. G1 counts BAG/PUSH nine times a job and
     * calls it the headline decision; seven of those nine were a button that banks nothing beside
     * a threshold of nothing. So when the pile is empty the beat has ONE move and renders one
     * control — `state.bag` is not offered, `state.push` is the whole beat, and the line below
     * says which of the two numbers is zero rather than printing three zeros.
     *
     * THE TEST IS "DOES BAGGING DO ANYTHING", not "is the amount 0". Bagging also ends the chain,
     * so a 0-value bag on a LIVE chain is still a move with a consequence and stays on screen
     * (Global rule 5: this layer never takes a decision away). The suppressed case is the one the
     * shipped job hit seven times in nine — `amount 0` AND `chain 0 → 0`: it banks nothing and it
     * breaks nothing.
     */
    const bagPays = num(prompt?.amount, 0) > 0 || int(prompt?.chainBefore, 0) > 0;

    const rows = [
      line ? h('p.job-payout.mono', { dataset: { tone: payout.ok ? 'ok' : 'bad' } }, line) : null,
      ladder ? h('p.job-ladder.mono.muted.fs-1', ladder) : null,
      staked ? h('p.job-chain', { 'aria-label': `chain ${payout.chain} of ${ticks.of}, ×${ticks.mult.toFixed(1)}`, dataset: { tone: ticks.tone } },
        ...Array.from({ length: ticks.of }, (_, i) => h('span.job-tick', { 'aria-hidden': 'true' }, i < ticks.n ? GLYPHS.chainFilled : GLYPHS.chainEmpty)),
        h('span.job-chain-mult.mono.fs-1', ` ×${ticks.mult.toFixed(1)}`)) : null,
      staked && nextBeat === 'bagpush' && !bagPays
        /* the fact, with no verb in it: naming PUSH here would be the recommendation `thresholdRow`
           says Global law 6 bans, and the beat's one remaining control says it anyway */
        ? h('p.job-nobag.mono.muted.fs-1', `loose ${econ.round(num(gv?.loose, 0))} · nothing to bag`)
        : thresholdRow(gv, staked && nextBeat === 'bagpush'),
    ];
    const actions = h('div.job-actions');
    if (nextBeat === 'bagpush' && bagPays) {
      add(actions,
        h('button.btn.job-bag', { type: 'button', onclick: () => doBag() },
          COPY.bagPrompt({ amount: prompt.amount, fee: prompt.fee, chainBefore: prompt.chainBefore }),
          h('span.job-key.mono', { 'aria-hidden': 'true' }, 'B')),
        h('button.btn.btn-primary.job-push', { type: 'button', onclick: () => continueBeat() },
          'PUSH', h('span.job-key.mono', { 'aria-hidden': 'true' }, '↵')),
      );
    } else if (nextBeat === 'bagpush') {
      add(actions, h('button.btn.btn-primary.job-push', { type: 'button', onclick: () => continueBeat() },
        'PUSH', h('span.job-key.mono', { 'aria-hidden': 'true' }, '↵')));
    } else {
      add(actions, h('button.btn.btn-primary.job-push', { type: 'button', onclick: () => continueBeat() },
        nextBeat === 'finish' ? 'Finish' : 'Next', h('span.job-key.mono', { 'aria-hidden': 'true' }, '↵')));
    }
    if (state.canBackcheck(s)) {
      add(actions, h('button.btn.job-backcheck', { type: 'button', onclick: () => doBackcheck() },
        `Backcheck (${int(getState().game?.backchecks?.held, 0)} held)`));
    }
    if (state.canCallIt(s)) {
      add(actions, h('button.btn.btn-ghost.job-callit', { type: 'button', onclick: () => doCallIt() }, 'CALL IT'));
    }
    rows.push(actions);
    beat.replaceChildren(...rows.filter(Boolean));
    beat.hidden = false;
    /* G10 #10: the bag/push prompt OCCUPIES the continue tap — card.js's dock Continue is that tap,
       so it is relabelled rather than duplicated. (Request to card.js's owner: a `continueLabel`
       opt.) It WAS duplicated, invisibly: the beat carries a `.job-push` of its own, and until this
       beat became sticky that copy sat ~290 px below the fold where nobody could see there were
       two. Now they would be adjacent, so the beat's copy stands down whenever the dock really is
       carrying the tap, and steps back in when there is no dock to relabel. BAG has no such twin —
       which is the whole point: it is the button that was never on screen. */
    beat.dataset.dock = String(relabelContinue(nextBeat === 'bagpush' ? 'PUSH' : nextBeat === 'finish' ? 'Finish' : 'Next'));
    // `applyResult` paints this beat without going through `render()`, so the sticky offset is
    // re-measured here too — the dock has just swapped Submit for Continue and changed height.
    syncDockOffset();
  }

  /**
   * **The threshold, at the beat it is a threshold FOR.** Settings tells the student *"the app
   * prints your q* before every bag-or-push"*; until this row existed the only surface carrying q*
   * was the board's vault line, which `:has(.card-screen)` has already collapsed to one 36 px strip
   * by the time a payout is on screen — so the sentence was true of a line nobody could read
   * (round 1, econ-math). It is evidence, never a nudge: the threshold and the student's own record
   * on the next make, with no verb. Naming BAG or PUSH here would be the recommendation G1's Global
   * law 6 bans, and the word is deliberately absent.
   */
  function thresholdRow(gv, on) {
    if (!on || !gv) return null;
    let t;
    try { t = state.pricedTarget(getState(), { tellFor: tellHookFor(getState()) }); }
    catch { return null; }
    const call = callOf(gv);
    const qStar = num(breakevenQOf(gv, t, call), 0);
    const qh = callMod.qHatDetail(getState(), t.make, { cards: cardById });
    const words = int(qh.of, 0) > 0 ? evidenceWordsOf(qh.qHat) : null;
    /* EVERY NOUN IN THIS LINE IS NAMED (round 3, player-feel). It read
       `q* 0.37 at call 70 · your last 3 on PAIRS: 2/3` under a card whose own chips said `FAC · 16`,
       and nothing on screen said PAIRS was the NEXT lock rather than the one just answered, or that
       70 was a hypothetical. Four layers of indirection in a 45-char mono line at the decision point
       is not evidence, it is noise. The record is also the coarse band now, not the fraction: this
       row is a PRE-CALL surface for the next target, so `COPY.evidence` composed with Settings'
       `evMaxBands()` here exactly as it did on the envelope (see `evidenceWordsOf`). */
    const record = words ? `${t.make}: ${words}` : `${t.make}: no history yet`;
    /**
     * **A THRESHOLD OF 0 IS NOT A THRESHOLD** (round 1 verification, player-feel). `econ.breakevenQ`
     * returns exactly 0 in two degenerate states, and one of them is common: an EMPTY PILE (the
     * shallow branch is `0.9·S / (A + S)` and `S = 0`), which is where a miss leaves the student —
     * seven of nine beats of one shipped job printed `breaks even at q 0.00`. The other is a rung
     * that stakes nothing (`P = 0` at call 50, the deep branch's `(D − 0.10·S)/(A + D)` with
     * `D = 0`), which `CALL_FALLBACK` at the top of this file already names: *"the line would print
     * a number that means nothing"*. That repair guarded the fallback RUNG only; this guards the
     * VALUE, which is the state the game actually reaches. The evidence half of the line — the
     * next make's own coarse band — is unaffected by either, so it is what remains.
     */
    const threshold = qStar > 0 ? ` · breaks even at q ${qStar.toFixed(2)} if you call ${call}` : '';
    return h('p.job-qstar.mono.fs-1', `next ${record}${threshold}`);
  }

  /** @returns {boolean} whether card.js's dock really is carrying the continue tap right now. */
  function relabelContinue(label) {
    try {
      const btn = document.querySelector('#dock .card-continue');
      if (!btn || btn.hidden) return false;
      btn.replaceChildren(document.createTextNode(label + ' '), h('span.fs-1', '↵'));
      return true;
    } catch { return false; }    // the dock is card.js's; a missing one is not an error
  }

  function doBag() {
    const s = getState();
    if (beatAfter(s) !== 'bagpush') return;
    let r = null;
    try { update((st2) => { r = state.bag(st2, { now: now() }); }); }
    catch (e) { console.warn('job: bag', e); return; }
    say(COPY.bag({ bagged: r.bagged, fee: r.fee, chainBefore: r.chainBefore }));
    if (r.debrief) debrief = r.debrief;          // `bag()` on the last beat ends the job (J6 §5.3)
    payout = null; payoutMove = null; env = null;
    syncHeader();
    afterBeat();
  }

  function continueBeat() {
    const s = getState();
    const nextBeat = beatAfter(s);
    if (nextBeat === 'finish') return finish();
    let r = null;
    try { update((st2) => { r = state.push(st2, { now: now() }); }); }
    catch (e) { console.warn('job: push', e); return; }
    if (r?.debrief) debrief = r.debrief;         // `push()` on the last beat ends the job (J6b R3)
    payout = null; payoutMove = null; env = null;
    syncHeader();
    afterBeat();
  }

  /**
   * THE SCROLL COMES FIRST (round 2, layout-safari). It used to run AFTER `render()`: the new
   * phase painted, `focusFirst` focused its first control with `preventScroll`, and the very next
   * statement scrolled the document back to 0 — which put the focused `.job-call` at y 809 on a
   * 375×667 phone, 142 px below the fold, with the focus ring on a control nobody could see. The
   * page is returned to the top BEFORE the beat paints, so the focus lands inside a viewport that
   * has already stopped moving, and `focusFirst` keeps it there (see `ensureInView`).
   */
  function afterBeat() {
    destroyView();
    if (!g()) return finish();
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
    render();
  }

  function doBackcheck() {
    try { update((s) => { state.backcheck(s, { now: now() }); }); }
    catch (e) { console.warn('job: backcheck', e); return; }
    syncHeader();
    renderPayout();
  }

  function doCallIt() {
    try { update((s) => { state.callIt(s, { now: now() }); }); }
    catch (e) { console.warn('job: call it', e); return; }
    payout = null; payoutMove = null; env = null;
    destroyView();
    syncHeader();
    render();
  }

  /* ---- the brief window ---- */
  function renderBrief() {
    const s = getState();
    const gv = g();
    const panel = h('div.job-panel.job-brief', { role: 'group', 'aria-label': 'Brief' });
    const bars = guardMod.guardBars({ byWing: gv.guard.dist, eps: gv.guard.eps });
    const support = bars.map((x) => x.wing);
    /* THE STAGED PRESS (S5): the rows, the counts and the ⟨n⟩ glyphs are the PENDING allocation, and
       nothing here has touched `state.press` — so `gv.guard.wing` is still the wing the student was
       shown, and it stays that wing until the move below is submitted. */
    const move = pressMove(gv);
    const spent = support.reduce((t, w) => t + Math.max(0, int(move.tokens[w], 0)), 0);
    const gate = (w, d) => {
      const at = Math.max(0, int(move.tokens[w], 0));
      if (d < 0 && at <= 0) return false;
      return state.canPress(s, { ...move.tokens, [w]: Math.max(0, at + d) });
    };
    if (tokenSel >= support.length) tokenSel = 0;
    add(panel,
      h('h2.fs-3', 'Brief'),
      h('p.muted.fs-1', `${state.targetsLeft(s)} targets left · loose ${econ.round(num(gv.loose, 0))} · bagged ${econ.round(num(gv.bagged, 0))}`),
      h('ul.job-bars', ...bars.map((x) => h('li.job-bar', { dataset: { wing: x.wing } },
        h('span.job-bar-name', x.wing),
        h('span.job-bar-track', h('span.job-bar-fill', { style: { transform: `scaleX(${Math.max(0, Math.min(1, x.p))})` } })),
        h('span.job-bar-pct.mono.fs-1', `${x.pct}%`)))),
      h('div.job-tokens', { role: 'group', 'aria-label': `Press ${GUARD.tokens} tokens` },
        ...support.map((w, i) => tokenRow(w, i, move.tokens, spent, gate))),
      /* What the staged move is, in words, above the button that submits it (Global law 6: the
         redraw is a price, so it is printed before the choice it affects — and after the move it
         can land on the same wing with probability `y_w`, which the bars above publish). */
      h('p.job-repress-hint.muted.fs-1', move.atomic
        ? `submit and the guard redraws once from the odds above — it can land on ${gv.guard.wing} again`
        : move.staged
          ? 'one token is up — place it on another wing, then submit'
          : 'lift one token and place it on another wing · the guard redraws after the move, never before'),
      h('div.job-brief-opts',
        /* ONE ATOMIC SUBMIT (S5). The label is the move it makes — "Re-press · redraw the guard"
           described a redraw the student could take for nothing, which is no longer offered — and
           the button is dead until the staged move is a one-for-one swap, so neither a bare redraw
           nor a half-made two-step can be committed. `COPY.repressMove` is `data/job.js`'s and it
           LANDED at integration (notes/repair-screen.md → Requests), so the guarded screen literal
           that stood in for it is gone: this panel no longer authors the label.

           ROUND 4: it still submits, and it still submits ONE press — but what it submits is the
           WINDOW (`submitBrief`), press included, so taking the re-press no longer costs the
           student the other four options. `qa/job-screen.mjs` rule 12 drives exactly this button
           and reads the redraw, the `took` entry and the closed window back out of the save. */
        h('button.btn.job-repress', {
          type: 'button',
          disabled: !move.atomic,
          onclick: () => submitBrief(),
        }, COPY.repressMove()),
        ...swapRows(s, stageFor(gv)),
        ...tellRows(stageFor(gv)),
        h('button.btn', {
          type: 'button',
          'aria-pressed': String(!!stageFor(gv).commit),
          onclick: () => { commitOpen = true; render(); },
        }, 'Declare a walk-away minute'),
      ),
      crewBlock(s),
      commitOpen || stageFor(gv).commit ? commitBlock() : null,
      /* WHAT IS ON THE TABLE, above the one button that sends it. Each staged option is named in the
         order `state.brief` applies it, so the student reads the window back before submitting it
         rather than discovering it in the debrief's decision count. */
      stagedLineOf(stageFor(gv), move) ? h('p.job-brief-staged.mono.fs-1', stagedLineOf(stageFor(gv), move)) : null,
      h('div.run-actions', h('button.btn.btn-primary', { type: 'button', onclick: () => submitBrief() },
        primaryLabelOf(stageFor(gv), move), h('span.job-key.mono', { 'aria-hidden': 'true' }, '↵'))),
    );
    stage.replaceChildren(panel);
    focusFirst(panel, '.btn-primary');
  }

  /** The staged window for the brief the job is in now, cleared whenever the window changes. */
  function stageFor(gv) {
    const n = int(gv?.briefs?.length, 0);
    if (!briefStage || briefAt !== n) { briefStage = { swap: null, crew: null, tell: null, commit: null }; briefAt = n; }
    return briefStage;
  }
  /** Stage one option (or un-stage it by passing the same value again) and repaint. */
  function stageBrief(patch) {
    const gv = g();
    if (!gv || gv.phase !== 'brief') return;
    Object.assign(stageFor(gv), patch);
    render();
  }

  /**
   * **THE WINDOW, IN ONE `state.brief` CALL.** `brief()` accepts `{repress, swap, crew, tell,
   * commit}` together and pushes ONE entry onto `g.briefs` with every option it took, which is the
   * shape `DECISIONS.briefOptionsMax` and G1's "any subset" are both written against. The press is
   * included only when the staged move is the one-for-one swap `pressRefusal` accepts, and it is
   * re-read from the LIVE record at the tap so a staging this paint does not know about can neither
   * be sent nor sent stale.
   */
  function submitBrief() {
    const gv = g();
    if (!gv || gv.phase !== 'brief') return;
    const st = { ...stageFor(gv) };
    /* re-read at the tap: what is submitted is the move as the LIVE record sees it, so a staging
       this paint does not know about can neither be sent nor sent stale */
    const m = pressMove(g());
    const actions = {
      ...(m.atomic ? { repress: m.tokens } : null),
      ...(st.swap ? { swap: { id: st.swap.id } } : null),
      ...(st.crew ? { crew: { make: st.crew.make, rank: st.crew.rank } } : null),
      ...(st.commit ? { commit: st.commit } : null),
      ...(st.tell === true ? { tell: true } : null),
      ...(st.tell === false ? { tell: false } : null),
    };
    const took = takeBrief(actions);
    /* `brief()` applies the swap BEFORE the crew, and a swap changes what is on the board — so a
       rank this paint priced as legal can be refused by `crew.allocate` at the moment it runs, and
       `brief()` drops it silently. The refusal the student already knows is the one that is said. */
    if (st.crew && took && !took.includes('crew')) {
      say(COPY.crewRefused({ make: st.crew.make, why: 'not available once the window was submitted' }));
    }
  }

  /** `Skip` on an empty window; otherwise the count the debrief will record for it. */
  function primaryLabelOf(st, move) {
    const n = (move?.atomic ? 1 : 0) + (st.swap ? 1 : 0) + (st.crew ? 1 : 0) + (st.commit ? 1 : 0)
      + (st.tell === true || st.tell === false ? 1 : 0);
    return n === 0 ? 'Skip' : `Take ${n} decision${n === 1 ? '' : 's'}`;
  }

  /** The staged window in words, in `state.brief`'s own order of application. Pure, and exported. */
  function stagedLineOf(st, move) {
    const parts = [];
    if (move?.atomic) parts.push('re-press');
    if (st.swap) parts.push(`swap ${st.swap.id}`);
    if (st.crew) parts.push(`crew ${st.crew.make} ${state.crew.RANK_NAMES[st.crew.rank] || 'bare'}`);
    if (st.commit) parts.push(st.commit.kind === 'walk' ? 'walk-away declared' : 'done-by declared');
    if (st.tell === true) parts.push('tell taken');
    if (st.tell === false) parts.push('tell declined');
    return parts.length ? `staged: ${parts.join(' · ')}` : '';
  }

  /**
   * G1's fourth option, staged. Both rungs are rendered so the choice is visible either way, and a
   * second tap on the rung already staged takes it back off the table (`Enter` then skips a window
   * that really is empty, which is what G1's own "Enter to skip" promises).
   */
  function tellRows(st) {
    const row = (v, label) => h('button.btn', {
      type: 'button',
      'aria-pressed': String(st.tell === v),
      dataset: { staged: String(st.tell === v) },
      onclick: () => stageBrief({ tell: st.tell === v ? null : v }),
    }, label);
    return [row(true, "Take the next target's tell"), row(false, 'Decline the tell')];
  }

  /**
   * **G1's SECOND brief option, which no surface in the app had ever rendered** (round 2, found
   * twice: exploit-hunt and player-feel). G1: *"swap one undrafted contract in at its declined price
   * (+0.15, see below)"*, and *"Declines are priced (incremental). The two contracts you refuse at
   * the board return to the brief window at +0.15 posted each."*
   *
   * `state.swapOptions` / `state.brief({ swap })` / `inProgress.bench` have served it since J5c —
   * `grep -rn 'swapOptions\|canSwap' site/js/` found ZERO call sites — so the window shipped four of
   * its five published options while the debrief printed `DECISIONS.briefOptionsMax = 5`'s "35 full
   * use", a decision count the app could not reach. One row per undrafted contract that still has
   * targets on the bench, and nothing is implied: the row prints what it costs you in targets and
   * what it comes back at, so the trade is readable before it is taken (Global law 6).
   *
   * The DIRECTION of `DECLINE_PRICE` is `data/job.js`'s and G1's, not this screen's: +0.15 on the
   * posted price is what both publish, so it is printed as the `+15 %` it is. See
   * notes/screen-fix.md → Requests: an exploit-hunt sim measures take-every-swap at ×1.148 over
   * skip-every-brief, which is a question for the econ/state owners, not a reason to leave G1's
   * option unreachable and the printed decision count wrong.
   */
  function swapRows(s, st = { swap: null }) {
    let opts = [];
    try { opts = state.swapOptions(s); } catch { return []; }
    const rows = [];
    for (const o of opts) {
      const got = swapDeliveryOf(s, o.id);
      if (got.targets < 1) continue;                 // nothing to splice — the row would buy nothing
      const on = st.swap?.id === o.id;
      rows.push(h('button.btn.job-swap', {
        type: 'button',
        'aria-pressed': String(on),
        dataset: { swap: o.id, staged: String(on), targets: String(got.targets), posted: String(got.posted) },
        onclick: () => stageBrief({ swap: on ? null : { id: o.id } }),
      },
      `Swap in ${o.id}${o.label ? ` · ${o.label}` : ''} · +${got.targets} target${got.targets === 1 ? '' : 's'}`
        + ` · posted +${got.posted} (+${Math.round(DECLINE_PRICE * 100)} % declined)`,
      h('span.job-swap-whole.muted.fs-1',
        ` contract ${o.id} is posted ${o.decline} declined · ${got.targets} of its targets`
        + ` ${got.targets === 1 ? 'is' : 'are'} still on the bench, the rest are already drafted`)));
    }
    return rows;
  }

  /**
   * The brief's CREW RE-RANK — G1's fifth option, and the one `state.brief` accepted while nothing
   * rendered a control for it (notes/J13.md Request 4). One row per make still on the board, three
   * rungs each (bare · STEADY · HELD). `crew.canAllocate` is the single authority on what is legal,
   * so a rung the capacity or the HELD gate refuses is DISABLED rather than offered and then
   * rejected — and a refusal that still gets through prints its reason instead of failing silently.
   */
  function crewBlock(s) {
    const queue = state.queueOf(s).slice(state.idxOf(s));
    const onBoard = [...new Set(queue.map((it) => state.crew.makeOf(it)).filter(Boolean))];
    if (!onBoard.length) return null;
    /* G3.8 step 5 IN THE APP, not only in the theorem. `crew.crewOrder` is documented as "the crew
       grid's recommended order" and was called by nothing outside `crew.js`: the only surface that
       can actually allocate is this block, and it listed makes in QUEUE order, so the min-maxer the
       alignment theorem is written for had to compute `w · (1 − m/100)` by hand to follow their own
       step 5 (round 1, crew-alignment). The rows are now in `crewOrder`, and each one carries the
       sort key that order IS — `crewValueDetail().score`, byte-identical to `readiness.weakSpots()`'s
       own key — so the ordering is readable rather than asserted.

       VERIFY-2 (crew, finding 2): the list is `crew.reallocatable`, not `crew.crewOrder` — the
       makes on the board PLUS every make this save already has a point on. `save.game.crew`
       persists across jobs and this grid is the only control, so with the bare `onBoard` list a
       point spent on a make tonight's board does not serve could not be handed back tonight
       either, and the median make is offered on 15.7 % of drafted boards (a 6.4-job expected wait,
       three or four of the nineteen under 2 %). Same sort key, same order, strictly more rows —
       `tests/job-align.test.mjs` §10 pins both halves of that. */
    const shape = g()?.shape ?? state.crew.DEFAULT_SHAPE;
    const makes = state.crew.reallocatable(s, { shape, of: onBoard });
    const budget = state.crew.budgetFor(s);
    /* WHAT A POINT ON THIS MAKE BUYS **TONIGHT** (round 2, crew-alignment). `crewOrder` prices the
       make over the shape's mean encounters; the board in front of the student is one sample of it,
       and on a real board the top-listed make often has one target left — and if that target is the
       make's own due review, G2's idle rule stands the crew down on it and the point forgives
       nothing at all. So each row now carries the two counts it takes to read the ordering honestly:
       how many of this make are still on the board, and how many of those a crew would be awake for.
       The idle test is `isIdleFor`'s own, minus its rank gate — the question here is what a point
       WOULD buy, and `isIdleFor` answers `false` for an unmanned make ("no crew → nothing to stand
       down"), which is the one reading that cannot inform a purchase. */
    const boardCount = new Map();
    for (const it of queue) {
      const mk = state.crew.makeOf(it);
      if (!mk) continue;
      const c = boardCount.get(mk) ?? { left: 0, live: 0 };
      c.left += 1;
      const own = state.crew.ownDueReviewKey(s, mk, { queue });
      const idle = state.crew.isDueReview(it) && (own == null || state.crew.keyOf(it) === own);
      if (!idle) c.live += 1;
      boardCount.set(mk, c);
    }
    /* THE ALIGNMENT THEOREM'S OWN DOMAIN, printed where the allocation happens. G3.8's claim —
       "there is no step in the min-maxer's list that is not also the best available study action" —
       holds exactly while the best STEADY outbids the best HELD, and `crew.alignmentFor` computes
       that boundary in `w × (1 − m/100)` units: the same units this grid's sort column is in, so the
       two numbers can be read against each other. It was exported in round 1 with no caller
       anywhere outside `crew.js`. Evidence, not a nudge (Global law 6): it names a threshold and a
       column, never a make to buy. */
    /* …AND THE QUEUE, WHICH THIS FUNCTION ALREADY HOLDS ON ITS OWN FIRST LINE (round 3,
       crew-alignment). `alignmentFor` documents the parameter — *"Pass `queue` (the drafted job) to
       get `domain.supply` and `gap`"* — and without it `crew.js:1126` sets `supply: null` and
       `domain.all` silently drops the one condition that fails most. So the grid printed
       *"the study ordering leads it ON THIS BOARD"* having never looked at the board: measured over
       250 drafted JOB-10s, of the 64 boards where that sentence was printed beside a buyable HELD
       point, **42 (66 %)** had `domain.supply === false` once the queue was passed — the study
       ordering's first make forgiving nothing and paying exactly 0 on the board in front of them,
       at the one surface where a crew point can actually be spent. */
    let align = null;
    try { align = state.crew.alignmentFor(s, { shape, of: onBoard, queue }); } catch { align = null; }
    const gap = align?.gap ?? null;
    const n2 = (x) => num(x, 0).toFixed(2);
    const plural = (n) => `${n} target${n === 1 ? '' : 's'}`;
    /* WHAT THE ROW ITSELF PAYS (verify round 2, player-feel finding 8). The grid sorted by — and
       printed — `w · (1 − m/100)`, the study key, while the line directly above it printed
       `gap.studyPays`, a BOARD price. On a real brief the top row read `6.30` and the sentence one
       line up read `pays 0.00 over 0 targets` about that same make: two numbers, two units, nothing
       on screen saying which one a point actually buys. Every row now carries the board price of a
       first rung on it, in `studyPays`' own units, read off `alignmentFor().options` so this screen
       still has exactly ONE entry point into the pricing (`tests/job-crew.test.mjs` §S4·2(c)). */
    const paysOf = new Map();
    for (const o of align?.options ?? []) {
      if (o.rank === state.crew.STEADY && !paysOf.has(o.make)) paysOf.set(o.make, o.value);
    }
    /* The three conditions G3.8's claim actually needs, each printed as the number it is: RANK (the
       HELD threshold, above), SUPPLY (what a point on the study top buys on THIS board, against the
       board's best-paying make), and EVIDENCE (how many candidates are still under the depth where
       `m_shown = m`). `domain.all` is all three; the grid used to print only the first. */
    const supplyLine = gap && gap.studyTop
      ? h('p.job-crew-supply.muted.fs-1', gap.agrees
        ? `on this board a point on ${gap.studyTop} pays ${n2(gap.studyPays)} over ${plural(gap.studySupply)}`
          + ' it forgives — the best-paying point there is tonight'
        : `on this board a point on ${gap.studyTop} pays ${n2(gap.studyPays)} over ${plural(gap.studySupply)}`
          + ` it forgives · ${gap.gameTop} pays ${n2(gap.gameValue)}`)
      : null;
    const thinLine = align && align.domain && align.domain.evidence === false
      ? h('p.job-crew-thin.muted.fs-1',
        `${align.thinEvidence.length} of these makes ${align.thinEvidence.length === 1 ? 'is' : 'are'} under `
        + `${align.evidenceFloor} attempts, so the ordering reads a shrunk mastery`)
      : null;
    const block = h('div.job-brief-crew', { role: 'group', 'aria-label': 'Crew' },
      h('p.job-crew-budget.mono.fs-1', COPY.crewBudget({
        manned: budget.manned, mannedMax: budget.mannedMax, spent: budget.spent, capacity: budget.capacity,
      })),
      /* `weakest first`, not the algebra (notes/repair-crew.md C8 + R-5, landed at integration).
         The brief window is a 50-second live allocation; `w × (1 − m/100)` beside it was a formula
         printed as UI copy. The sort key is published once, in the Settings card that prints every
         other formula ("What a crew does"). */
      h('p.job-crew-order.muted.fs-1', `weakest first — ${onBoard.length} makes left on the board`
        + (makes.length > onBoard.length ? ` · ${makes.length - onBoard.length} you are manning elsewhere` : '')),
      /* **THE ALIGN LINE PRINTS BOTH PRICES, AND NAMES THE SCALE THEY ARE ON** (round 2 verify,
         crew-alignment). It read `a HELD point prices at 0.00 on this list's own scale`, and the
         list's own scale is the column six lines below — `crewValueDetail(...).score`, which is
         `w · (1 − m/100)`. `align.threshold` is not on it: it is `held.value / shapeConstant(
         measuredParamsOn(board))`, a BOARD price. Measured over 200 drafted JOB-10 boards, the 101
         that printed this sentence put the same transform of the best STEADY point (`steadyThreshold`)
         more than 25 % away from the column's own top entry on 75 of them — `column top 5.40 ·
         sentence "prices at 0.00" · steady on that same transform 1.00`. A student was told a number
         was on the list's scale and invited to read it against a column 5× away from it.

         `holds` is the comparison `steadyThreshold ≥ threshold` and nothing else, so BOTH numbers are
         now printed — which is also what `crew.js:1534` asks any surface printing `threshold` beside
         this grid to do — and the scale is named for what it is: `alignmentFor` prices both rungs on
         the board when it is handed the queue (`pricedOn === 'board'`), and off the population model
         when it is not. Neither is the sort column, so the line says so. */
      align ? h('p.job-crew-align.muted.fs-1', crewAlignLineOf(align)) : null,
      supplyLine,
      thinLine,
      /* The grid printed three bare rung words with no price and no effect beside them. Both numbers
         are constants of `data/job.js`, read here rather than re-typed. */
      /* …and the RANK NAMES are `crew.RANK_NAMES`, not two words typed here: the r2 rung's name is
         the crew module's to change (S4 renames it), and a screen that spells it out is a second
         source for the same word. The chain-hold clause is printed only while the mechanic exists
         — `CHAIN_HOLD_MIN` is the constant S4 deletes with it — so the legend cannot outlive the
         rung it describes. */
      h('p.job-crew-legend.muted.fs-1',
        `${state.crew.RANK_NAMES[1]} ${state.crew.COSTS.STEADY} pt forgives 1 rung · `
        + `${state.crew.RANK_NAMES[2]} ${state.crew.COSTS.HELD} pts forgives 2`
        + (Number.isFinite(state.crew.CHAIN_HOLD_MIN)
          ? ` and holds the chain at ${state.crew.CHAIN_HOLD_MIN}+` : '')));
    for (const make of makes) {
      const at = state.crew.rankOf(s, make);
      const v = state.crew.crewValueDetail(s, make, shape);
      const row = h('p.job-crew-row.fs-1',
        h('span.job-crew-make.mono', make),
        // 2 dp, fixed, so the column reads as a ledger: `econ.round` drops trailing zeros and
        // printed `2` beside `3.12`, which is the one thing a sort key must not do.
        h('span.job-crew-key.mono.muted', ` m ${Math.round(num(v.m, 0))} · ${num(v.score, 0).toFixed(2)} `),
        h('span.job-crew-board.mono.muted',
          `${boardCount.get(make)?.left ?? 0} left · forgives ${boardCount.get(make)?.live ?? 0} `),
        // the price, in the supply line's units — never in the sort column's (verify-2, finding 8)
        paysOf.has(make)
          ? h('span.job-crew-pays.mono.muted', `· pays ${n2(paysOf.get(make))} `) : null);
      /* the rung the window is STAGED at, when this window has staged one on this make — the live
         rank otherwise, so the grid reads as the allocation the submit will make */
      const stagedRank = g()?.phase === 'brief' && stageFor(g()).crew?.make === make
        ? int(stageFor(g()).crew.rank, at) : at;
      for (const [rank, label] of [0, 1, 2].map((r) => [r, state.crew.RANK_NAMES[r] || 'bare'])) {
        const legal = state.crew.canAllocate(s, make, rank).ok;
        add(row, h('button.btn.btn-ghost.job-crew-rank', {
          type: 'button',
          disabled: !legal && rank !== at,
          'aria-pressed': String(rank === stagedRank),
          dataset: { rank: String(rank), staged: String(rank === stagedRank && stagedRank !== at) },
          onclick: () => setCrewRank(make, rank),
        }, label), ' ');
      }
      add(block, row);
    }
    return block;
  }

  function setCrewRank(make, rank) {
    const check = state.crew.canAllocate(getState(), make, rank);
    if (!check.ok) { say(COPY.crewRefused({ make, why: String(check.reason).replace(/-/g, ' ') })); return; }
    /* STAGED, not submitted (round 4 verification, exploit-hunt): this used to be the window's one
       and only decision, because `state.brief` ends by advancing the phase. A second tap on the
       rung already staged takes the allocation back off the table. */
    const staged = stageFor(g()).crew;
    stageBrief({ crew: staged && staged.make === make && staged.rank === rank ? null : { make, rank } });
  }

  /** @returns {string[]|null} the options `state.brief` recorded for this window, or `null` if it refused. */
  function takeBrief(actions) {
    commitOpen = false;
    pending = null; pendingAt = -1;     // the window's one press is spent, or the window is closing
    briefStage = null; briefAt = -1;    // …and the staged window goes with it
    let r = null;
    try { update((s) => { r = state.brief(s, actions, { now: now() }); }); }
    catch (e) { console.warn('job: brief', e); return null; }
    syncHeader();
    render();
    return Array.isArray(r?.took) ? r.took : [];
  }

  /* ---- the getaway ---- */
  function renderGetaway() {
    const s = getState();
    let info;
    try { info = state.getawayOf(s, { tellFor: tellHookFor(s) }); }
    catch (e) { console.error('job: getaway', e); return renderBroken(e); }
    const make = info.target?.make ?? '—';
    const q = callMod.qHatDetail(s, make, { cards: cardById });
    const panel = h('div.job-panel.job-getaway');
    /* THE GETAWAY'S OWN THRESHOLD, not the bag/push one (see `getawayThreshold`). The rung is named
       because the number depends on it, and `q* = 0` is printed as the two constants it comes out of
       rather than as a bare `0.00` — which is the same rule `thresholdRow` applies to the beat below
       it, read the other way round: there a 0 means the line says nothing, here it means the line
       has an answer that is not a probability. */
    const th = getawayThreshold();
    add(panel,
      h('h2.fs-3', 'Getaway'),
      h('p.job-vault-line.mono', vaultLineOf({
        make, grade: info.target?.tier ?? 3, qHat: q,
        breakeven: th ? th.q.toFixed(2) : null,
        at: th ? th.call : null,
      })),
      h('p.job-getaway-nums.mono.fs-1',
        `loose ${econ.round(info.loose)} · bagged ${econ.round(info.bagged)} · chain ${info.chain} · walk banks ${info.walkBanks}`),
      /* A `0.00` is the answer here, not an empty label — so the two banks it comes out of are
         printed beside it and the student can check the claim instead of taking it. */
      th && th.free
        /* `final bagged`, not `banks` — the line above prints `walk banks N`, which is what the WALK
           moves into the pile, and these two are the end-of-job totals the exit bonus is already on.
           Two numbers one line apart may not wear the same word for different quantities. */
        ? h('p.job-getaway-floor.muted.fs-1',
          `a ${th.call} call stakes nothing — final bagged ${th.missBank} if the vault is missed,`
          + ` ${th.walkBank} if you walk`)
        : null,
      h('div.job-actions',
        h('button.btn.btn-primary.job-crack', { type: 'button', onclick: () => doCrack() },
          'CRACK', h('span.job-key.mono', { 'aria-hidden': 'true' }, 'K')),
        h('button.btn.job-walk', { type: 'button', onclick: () => doWalk({ getaway: true }) },
          'WALK', h('span.job-key.mono', { 'aria-hidden': 'true' }, 'W'))),
    );
    stage.replaceChildren(panel);
    focusFirst(panel, '.job-crack');
  }

  function doCrack() {
    try { update((s) => { state.crack(s, { now: now() }); }); }
    catch (e) { console.warn('job: crack', e); return; }
    render();
  }

  /* ---- WALK, the quit prompt, and the end ---- */
  function openQuit() {
    if (debrief) { navigate('/today'); return; }
    if (!g()) { navigate('/today'); return; }
    if (phase() === 'getaway') { doWalk({ getaway: true }); return; }
    quitOpen = true;
    renderQuit();
  }

  function renderQuit() {
    const old = root.querySelector('.job-quit');
    if (old) old.remove();
    if (!quitOpen || !g()) return;
    const p = state.walkPrompt(getState());
    const panel = h('div.job-quit', { role: 'group', 'aria-label': 'Walk' },
      h('p.job-quit-q', COPY.walkConfirm({ amount: p.loose })),
      h('p.job-quit-nums.mono.fs-1', `bag & leave banks ${p.bagAndLeave} · leave banks ${p.leave}`),
      h('div.job-actions',
        h('button.btn.btn-primary.job-quit-bag', { type: 'button', onclick: () => doWalk({ bagFirst: true }) }, COPY.walkBagLabel()),
        h('button.btn.job-quit-leave', { type: 'button', onclick: () => doWalk({ bagFirst: false }) }, COPY.walkLeaveLabel()),
        h('button.btn.btn-ghost', { type: 'button', onclick: () => { quitOpen = false; renderQuit(); } }, 'Stay')),
    );
    main.insertBefore(panel, stage);   // the reading column, so the rail keeps the board beside it
    panel.querySelector('.job-quit-bag')?.focus({ preventScroll: true });
  }

  function doWalk({ bagFirst = false, getaway = false } = {}) {
    quitOpen = false;
    let out = null;
    try { update((s) => { out = state.walk(s, { bagFirst, now: now() }); }); }
    catch (e) { console.error('job: walk', e); return; }
    debrief = out ?? null;
    void getaway;
    endScreen();
  }

  function finish() {
    const s = getState();
    if (!state.stateOf(s)) { debrief = debrief ?? null; return endScreen(); }
    let out = null;
    try { update((st2) => { out = state.endJob(st2, finalWordOf(st2), { now: now(), day: today }); }); }
    catch (e) { console.error('job: endJob', e); return; }
    debrief = out ?? null;
    endScreen();
  }

  function endScreen() {
    destroyView();
    stopCommitWatch();
    try { flush(); } catch { /* memory store */ }
    syncHeader();
    render();
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
    bus.emit('run:done', { kind: 'job', id: null, sum: null, readiness: readiness(getState()).r });
  }

  /* ================================================================ the bound declaration (G3.9)
     "A declaration **BINDS**: at the declared minute the job **auto-bags at full value and ends**,
     you take **+8 % on BAGGED**, and you forfeit the chain in progress and the +10 % completion
     bonus if targets remain." G11 rejects the alternative by name: *"A free-and-non-binding COMMIT —
     weakly dominant, therefore not a decision."*

     `commitBind` was wired (the board's `DONE BY 21:45` / `WALK AT 12:00` buttons) and `commitDue` /
     `commitFire` had NO CALL SITE anywhere in `site/`, so the declaration cost nothing, paid nothing
     and ended nothing — exactly the non-binding COMMIT the murder board killed. `endJob` pays the
     +8 % only on `OUTCOMES.COMMIT`, and only `commitFire` produces that word, so this watch is the
     whole binding.

     It is a CLOCK, not a boundary: `plan.jobBoundary` reports the same decision for the caller that
     is already standing at a target boundary, but §3.9 says "at the declared minute", and a student
     mid-target at 21:45 declared 21:45. Nothing is at risk in firing early — the close banks LOOSE
     at FULL value and every unanswered target stays due on Today's Page (G9 #2, #8), which is why
     this may interrupt any phase. The 22:00 close is deliberately NOT duplicated here: `state.advance`
     owns it structurally at the next target boundary (state.js), which is what G1 asks for.

     `COMMIT_POLL_MS` is a quarter-minute so the fire is within 15 s of the declared minute even when
     the tab is idle; the watch also re-checks when the tab comes back, because background timers are
     throttled and a phone that slept through 21:45 must still land on the debrief. */
  function stopCommitWatch() {
    if (commitTimer == null) return;
    try { clearInterval(commitTimer); } catch { /* no timers on this host */ }
    commitTimer = null;
  }

  /** @returns {boolean} true when the declaration fired and the job is over. */
  function checkCommit() {
    if (destroyed || debrief) { stopCommitWatch(); return false; }
    let due = false;
    try { due = state.commitDue(getState(), now()) === true; } catch { due = false; }
    if (!due) return false;
    let out = null;
    try { update((s) => { out = state.commitFire(s, { now: now(), day: today }); }); }
    catch (e) { console.error('job: commit', e); stopCommitWatch(); return false; }
    debrief = out ?? null;
    endScreen();                    // the debrief prints the word, the +8 % and `n left on Today's Page`
    return true;
  }

  if (typeof setInterval === 'function') commitTimer = setInterval(checkCommit, COMMIT_POLL_MS);

  /**
   * The debrief — G7's *"The Page Summary becomes the debrief (same screen, same tile mint, same
   * skill bars, same Readiness delta, plus the bag drop, the rating delta, the guard redraw, the
   * regret lines, the split and the decision count)"*.
   *
   * J6b's Page Summary extension lives in `screens/run.js`; this screen is its caller, which is what
   * keeps the promise ONE screen and ONE summary (notes/J6b.md R1 — until this landed, the real
   * debrief was unreachable on `#/run/job` and this function rendered a placeholder panel of its
   * own). `jobBefore` and `jobQueue` were held at job start because `endJob` → `finishPage()` clears
   * `inProgress`; `decisions` is deliberately omitted — `inferDecisions()` recovers the BAG/PUSH
   * vector from the save, and a vector this screen reconstructed would be a second source of truth.
   */
  function renderDebrief() {
    const d = debrief;
    beat.hidden = true;
    /* The stage is cleared FIRST and in every branch: the bag drop must be the only thing animating
       in the document while it runs (G10 #13), so the envelope, the call row, the payout line and
       the chain ticks are gone before the latch is set. */
    stage.replaceChildren();
    if (!d) {
      stage.replaceChildren(h('div.job-panel', h('p.muted', 'This job is over.'), h('p', h('a.btn.btn-primary', { href: '#/today' }, 'Today'))));
      return;
    }
    try {
      /* `before` is not only the skill snapshot: `captureJobBefore` stamps `startedAt` onto it, and
         `run.js`'s `jobWallMs(before)` measures THAT against `Date.now()` to get the debrief's idle
         line. `debriefOf` derives `wall` as `tGame + tAnswer`, so an idle computed from the debrief
         alone is `x − x` and can never be anything but 0 (round 1, split-honesty); the independent
         clock is the snapshot's stamp, which is why handing `before` through matters here and is
         not merely an optimisation of the skill bars. run.js owns the measurement. */
      renderJobSummary(stage, jobSummaryContext(getState(), d, { queue: jobQueue, before: jobBefore ?? undefined }));
    } catch (e) {
      console.error('job: the Page Summary failed', e);
      stage.replaceChildren(h('div.job-panel',
        h('h2.fs-4', String(d.outcome ?? 'done')),
        h('p.mono', COPY.walk({
          bagged: econ.round(num(d.finalBagged ?? d.bagged, 0)),
          rating: num(d.ratingAfter ?? 0, 0).toFixed(2),
          rank: callMod.rankOf(num(d.rank, 2)).name,   // J12: `d.rank` is the 1–5 rank, not the rating
          thinking: mmss(d.tAnswer), deciding: mmss(d.tGame), decisions: d.decisions,
        })),
        h('p.run-actions', h('a.btn.btn-primary', { href: '#/today' }, 'Today'))));
    }
    if (!bagDropped) { bagDropped = true; syncHeader(); }
  }

  const mmss = (ms) => `${Math.floor(num(ms, 0) / 60000)}:${String(Math.floor((num(ms, 0) % 60000) / 1000)).padStart(2, '0')}`;

  function renderBroken(e) {
    stage.replaceChildren(h('div.job-panel',
      h('h2.fs-3', 'The board could not be posted'),
      h('p.muted.mono.fs-1', String(e?.message ?? e ?? '')),
      h('p.run-actions', h('a.btn.btn-primary', { href: '#/run/page' }, "Run Today's Page"), h('a.btn', { href: '#/today' }, 'Today'))));
  }

  function focusFirst(panel, sel) {
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = panel.querySelector(sel);
    if (!el) return;
    el.focus({ preventScroll: true });
    ensureInView(el);
  }

  /**
   * `preventScroll` is right — a focus that yanks the page is worse than one that does not — but it
   * is only right while the focused control is ON SCREEN. The board sheet is capped and the beat is
   * sticky, so at 375×667 and 844×390 it is; this is the guard for the case the layout did not
   * foresee, and it moves the page only when the control is actually outside it.
   */
  function ensureInView(el) {
    try {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || 0;
      if (!vh || (r.top >= 0 && r.bottom <= vh)) return;
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
    } catch { /* no layout to read */ }
  }

  /* ================================================================ the keyboard (G6) */

  const onKey = (ev) => {
    if (destroyed || ev.defaultPrevented || ev.altKey || ev.ctrlKey || ev.metaKey || !root.isConnected) return;
    const t = ev.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const interactive = t && t.nodeType === 1 && (t.tagName === 'BUTTON' || t.tagName === 'A');
    const k = String(ev.key);
    const low = k.toLowerCase();
    const ph = phase();
    const [K_LEFT, K_RIGHT] = KEYS.tokens;      // PRESS is on the arrows (G1's verb table)

    if (quitOpen) { if (k === KEYS.walkConfirm) { ev.preventDefault(); quitOpen = false; renderQuit(); } return; }
    if (low === KEYS.walk && ph !== 'debrief') { ev.preventDefault(); ph === 'getaway' ? doWalk({ getaway: true }) : openQuit(); return; }

    if (ph === 'board' || ph === 'guard') {
      if (KEYS.draft.includes(k) && !g()) {
        const row = board?.contracts?.[Number(k) - 1];
        /* …and the row is brought into the sheet's own scroll window. Two of the five contracts
           are below the sheet's bottom edge at 375×667, so `5` toggled a contract the student could
           not see change (round 1 verification, player-feel). `nearest` scrolls the SHEET, not the
           page, and does nothing when the row is already visible. */
        if (row) { ev.preventDefault(); toggleDraft(row.id); showContract(Number(k) - 1); }
        return;
      }
      const support = WING_IDS.filter((w) => (g() ? g().guard.dist[w] != null : board?.guard?.byWing?.[w] != null));
      if (k === K_RIGHT) { ev.preventDefault(); bump(support[tokenSel] ?? WING_IDS[0], +1); return; }
      if (k === K_LEFT) { ev.preventDefault(); bump(support[tokenSel] ?? WING_IDS[0], -1); return; }
      if (k === 'ArrowDown') { ev.preventDefault(); touchPress(); tokenSel = (tokenSel + 1) % Math.max(1, support.length); render(); return; }
      if (k === 'ArrowUp') { ev.preventDefault(); touchPress(); tokenSel = (tokenSel - 1 + Math.max(1, support.length)) % Math.max(1, support.length); render(); return; }
      if (low === KEYS.commit) { ev.preventDefault(); commitOpen = !commitOpen; render(); return; }
      if (k === KEYS.push && !interactive) { ev.preventDefault(); root.querySelector('.job-primary')?.click(); }
      return;
    }

    if (ph === 'envelope' || ph === 'call') {
      const i = KEYS.call.indexOf(k);
      if (i >= 0 && env && env.calls[i] != null) { ev.preventDefault(); lockCall(env.calls[i]); return; }
      if (k === KEYS.push && !interactive && g()?.stakes === false) { ev.preventDefault(); openAnswer(); }
      return;
    }

    if (ph === 'payout' || ph === 'bagpush') {
      if (low === KEYS.bag) { ev.preventDefault(); doBag(); return; }
      // Enter is card.js's own Continue (it holds focus after a grade) — that tap IS the push
      // (G10 #10), so this branch only covers the case where nothing is focused.
      if (k === KEYS.push && !interactive) { ev.preventDefault(); continueBeat(); }
      return;
    }

    if (ph === 'brief') {
      const support = WING_IDS.filter((w) => g()?.guard?.dist?.[w] != null);
      if (k === K_RIGHT) { ev.preventDefault(); bump(support[tokenSel] ?? WING_IDS[0], +1); return; }
      if (k === K_LEFT) { ev.preventDefault(); bump(support[tokenSel] ?? WING_IDS[0], -1); return; }
      if (k === 'ArrowDown') { ev.preventDefault(); tokenSel = (tokenSel + 1) % Math.max(1, support.length); render(); return; }
      if (k === 'ArrowUp') { ev.preventDefault(); tokenSel = (tokenSel - 1 + Math.max(1, support.length)) % Math.max(1, support.length); render(); return; }
      if (low === KEYS.commit) { ev.preventDefault(); commitOpen = !commitOpen; render(); return; }
      // G1's "Enter to skip" is the same key on a window that HAS staged something: it submits the
      // subset, which is what `Enter` has always meant here — `submitBrief` sends an empty window
      // as the skip it is.
      if (k === KEYS.push && !interactive) { ev.preventDefault(); submitBrief(); }
      return;
    }

    if (ph === 'getaway') {
      if (low === KEYS.crack) { ev.preventDefault(); doCrack(); return; }
      if (k === KEYS.push && !interactive) { ev.preventDefault(); doCrack(); }
    }
  };
  document.addEventListener('keydown', onKey);

  /* Hidden: bank the save. VISIBLE AGAIN: re-read the declaration's clock at once — a backgrounded
     tab throttles `setInterval` to a minute or more (and a sleeping phone stops it dead), so the
     student who declared `DONE BY 21:45` and came back at 21:58 must land on the debrief, not on a
     job the declaration never ended. */
  const onHide = () => {
    if (document.visibilityState === 'hidden') { try { flush(); } catch { /* gone */ } return; }
    checkCommit();
  };
  document.addEventListener('visibilitychange', onHide);

  /* The sheet's measured cap is a function of the viewport, so it is re-read when the viewport
     changes — a rotation, a desktop window drag, or the `visualViewport` resize an on-screen
     keyboard fires. Cheap: two `getBoundingClientRect` reads and one custom-property write. */
  const onResize = () => { if (!destroyed) { syncDockOffset(); scheduleBoardFit(); } };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
  /* `N more ↓` is a statement about where the student has scrolled TO, so it is recounted as they
     scroll the sheet — passive, one `getBoundingClientRect` per row, and the only write is a text
     node that is not inside the sheet's own scroll flow. */
  const onBoardScroll = () => { if (!destroyed) syncBoardMore(); };
  boardEl.addEventListener('scroll', onBoardScroll, { passive: true });
  /* …and when the CONTENT around the sheet changes height without a resize or a render. The beat's
     live line is `display: none` while empty and two rows tall once the guard has drawn, and it is
     filled outside the paint that laid the panel out — so a one-shot measurement reads a stack
     25 px shorter than the one the student ends up looking at. These two boxes are everything the
     budget depends on that this screen does not already re-render: the live line above the sheet
     and the panel below it. The write is idempotent at the fixed point, so the observer settles. */
  const fitObs = typeof ResizeObserver === 'function' ? new ResizeObserver(() => scheduleBoardFit()) : null;
  try { fitObs?.observe(live); fitObs?.observe(stage); } catch { /* nothing to observe */ }
  /* …and on any DOM change anywhere in the screen, which is the only trigger that cannot be one
     beat behind: the beat line, the panel and the beat are written by half a dozen paths that do
     not all go through `render()`. `childList` + `characterData` only — the style attribute this
     writes is deliberately NOT observed, so the measurement can never re-trigger itself. */
  const fitMut = typeof MutationObserver === 'function' ? new MutationObserver(() => scheduleBoardFit()) : null;
  try { fitMut?.observe(root, { subtree: true, childList: true, characterData: true }); } catch { /* none */ }

  return () => {
    destroyed = true;
    stopCommitWatch();
    cancelBoardFit();
    destroyView();
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    window.visualViewport?.removeEventListener('resize', onResize);
    boardEl.removeEventListener('scroll', onBoardScroll);
    try { fitObs?.disconnect(); } catch { /* already gone */ }
    try { fitMut?.disconnect(); } catch { /* already gone */ }
    /* **BANK THE DEBRIEF READ** (round 2, split-honesty). `state.js:1588` states the contract — "this
       stamp is the debrief's start, and `closeDebrief()` banks it (the screen on unmount, or
       `startJob` as the backstop)" — and the screen half did not exist: `grep -rn closeDebrief site/`
       found the definition, the backstop and three comments, no caller. So the only observation ever
       folded was `now(next startJob) − debriefAt`, which on the design's own one-job-an-evening
       default is always the `PHASE_OBSERVED_CAP_X × 65 = 260 s` clamp: `phaseMeans.debrief` drifted
       65 → 162 → 240 over eight identical evenings and the board advertised ~17 min on night 1 and
       ~20 min on night 8 for the same 18.2-minute session. `closeDebrief` is TOTAL and idempotent —
       no stamp is a no-op — so this is safe on every unmount, including one that never reached a
       debrief, and `startJob` stays the backstop for a tab that is closed rather than navigated. */
    try { update((s) => { state.closeDebrief(s, { now: now() }); }); } catch { /* gone */ }
    setJobHeader(null);
    try { flush(); } catch { /* gone */ }
  };
}

export default mountJob;
