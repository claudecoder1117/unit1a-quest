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
import { todayISO } from '../days.js';
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
import { postBoard } from '../job/board.js';
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
 * @param {number|null} qHat
 * @returns {string|null} the band in words, or `null` when there is no measurement
 */
export function evidenceWordsOf(qHat) {
  const i = callMod.evidenceBandOf(qHat);
  if (i == null) return null;
  const bands = callMod.evidenceBands();
  const b = bands[i];
  if (!b) return null;
  const pct = (x) => `${Math.round(num(x, 0) * 100)} %`;
  if (i === 0) return `clear rate under ${pct(b.to)}`;
  if (i === bands.length - 1) return `clear rate ${pct(b.from)} or more`;
  return `clear rate ${pct(b.from)}–${pct(b.to)}`;
}

/** The envelope's two printed lines — `COPY.envelope` and the coarse band (G1's sealed envelope). */
export function envelopeLinesOf(env, qHat) {
  const words = qHat && qHat.of > 0 ? evidenceWordsOf(qHat.qHat) : null;
  return {
    head: COPY.envelope({
      make: env.make, name: env.name, grade: env.grade,
      cold: econ.round(num(env.cold, 0), 1), posted: env.posted,
      from: env.from ?? (env.sources || []).join('') ?? '—',
      tell: env.tell?.tag ?? null,
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
 */
export function payoutLineOf(p, env) {
  if (!p || p.free) return '';
  if (p.ok) {
    const loose = Math.abs(econ.round(num(p.delta, 0)));
    if (num(p.w, 0) < callMod.INFORMATIVE_MIN) {
      return `+${loose} loose · chain ${p.chain} · rating unchanged · no measurement`;
    }
    return COPY.clear({
      loose, chain: p.chain,
      credit: econ.round(num(p.credit, 0), 1), w: econ.round(num(p.w, 0), 2),
    });
  }
  return COPY.miss({
    make: p.target?.make ?? env?.make ?? '—',
    tell: p.target?.tell?.tag ?? env?.tell?.tag ?? 'none',
    loose: Math.abs(econ.round(num(p.delta, 0))), chain: p.chain,
  });
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
    return mount(host, { seed: seedParam, gate });
  };
}

function mount(host, { seed = null, gate = null } = {}) {
  let destroyed = false;
  let view = null;                 // the live card view
  let board = null;                // the posted board, before the job starts
  let picks = [];                  // the draft, before the job starts
  let payout = null;               // the last applyTarget result
  let env = null;                  // the envelope the current target was bid on
  let debrief = null;              // the debrief, once the job is over
  let quitOpen = false;
  let commitOpen = false;
  let commitTimer = null;          // the bound declaration's watch — see `checkCommit()` (G3.9)
  const COMMIT_POLL_MS = 15000;    // ≤ 15 s late on a declared MINUTE, and cheap enough to idle in
  let tokenSel = 0;
  let bagDropped = false;          // G6 ANIMATION.bagDrop.oncePerJob
  /* The two things the debrief needs that `endJob` destroys on its way out (notes/J6b.md R1):
     the BEFORE snapshot, taken once at job start and stored on `inProgress.meta` so a mid-job reload
     ends on the debrief of the WHOLE job, and the queue, because `finishPage()` nulls `inProgress`. */
  let jobBefore = null;
  let jobQueue = [];
  let fitRaf = 0;                  // the pending `syncBoardFit` frame — see `scheduleBoardFit()`
  let fitTimer = null;             // …and its settle pass, once the beat's animations have run
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
         carries its own offset (see `.job-beat` in css/job.css), so it is deliberately not here. */
      const marks = root.querySelectorAll('.job-calls, .job-getaway .run-actions, .job-envelope .run-actions');
      if (!marks.length) { root.style.removeProperty('--job-board-fit'); return; }
      /* ITERATED TO ITS FIXED POINT, in one pass. Each write changes the sheet's height, which
         moves the decision; re-reading after the write is what makes the result independent of
         whatever the layout happened to be when this ran. Two passes is the arithmetic bound (the
         first lands `slack` on `FIT_STEP`, the second confirms it), the fourth is slack; the
         no-op-write guard is the stop condition, and it is also what keeps the ResizeObserver
         below from re-entering forever. */
      for (let pass = 0; pass < 4; pass++) {
        const bh = board.getBoundingClientRect().height;
        if (!(bh > 0)) return;                             // collapsed or unpainted — nothing to cap
        let low = -Infinity;
        for (const m of marks) low = Math.max(low, m.getBoundingClientRect().bottom);
        if (!Number.isFinite(low)) { root.style.removeProperty('--job-board-fit'); return; }
        const atRest = low + window.scrollY;               // where it sits with the page at its top
        const fit = Math.max(LAYOUT.boardCollapsedPx, Math.round(bh + (vh - atRest) - FIT_STEP));
        const next = `${fit}px`;
        if (root.style.getPropertyValue('--job-board-fit') === next) return;
        root.style.setProperty('--job-board-fit', next);
      }
    } catch { /* no layout to read; the CSS fallback leaves the sheet at its published cap */ }
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
           draft is live — once the job starts the verb has been used and the line would be noise. */
        started ? null : h('p.job-board-teach.fs-1',
          `take ${board?.draft ?? 3} of these — you answer every lock in the ones you take`),
        h('ul.job-contracts', ...rows.map((b, i) => contractRow(b, i, drafted, started))),
        board?.supplyLines?.length
          ? h('p.job-supply.muted.fs-1', board.supplyLines.join(' · '))
          : null,
        board?.x2 ? h('p.job-x2.muted.fs-1.mono', `×2: ${board.x2.count} target${board.x2.count === 1 ? '' : 's'}`) : null,
        board?.thinLine ? h('p.job-thin.fs-1', board.thinLine) : null,
        board?.dryLine ? h('p.job-dry.fs-1', board.dryLine) : null,
        vaultLine(gv),
      ),
    );
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
    return h('p.job-vault.muted.fs-1.mono', COPY.vault({
      make, grade: v?.grade ?? card?.tier ?? 3,
      hits: q.hits, of: Math.max(1, q.of), q: breakevenLabel(),
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

  function breakevenLabel() {
    const gv = g();
    if (!gv) return '—';
    try {
      const t = state.targetsLeft(getState()) ? state.pricedTarget(getState(), { tellFor: tellHookFor(getState()) }) : null;
      if (!t) return '—';
      return num(breakevenQOf(gv, t), 0).toFixed(2);
    } catch { return '—'; }
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
      h('div.run-actions',
        h('button.btn.btn-primary.job-primary', { type: 'button', onclick: () => startOrGo(tokens) },
          gv ? 'Start the first envelope' : (board?.primary ?? 'TAKE THE POSTED JOB')),
        h('a.btn', { href: '#/today' }, 'Today')),
      board?.projection ? h('p.job-projection.muted.fs-1', board.projection) : null,
      board?.everyDraftIdentical ? h('p.muted.fs-1', 'every draft yields the same union tonight') : null,
    );
    stage.replaceChildren(panel);
    // G1's GUARD line names a wing, so it may only be printed once the guard has DRAWN. Before the
    // job starts there is no draw — only the published distribution, which is the bars above.
    if (gv?.guard?.wing) sayGuard(gv);
  }

  /** `GUARD: WORDS.  your tokens: RECALL 2 (×1.50) · WORDS 1 (guarded, ×0.55) · FIGURES 0` (G1). */
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

  function tokenRow(w, i, tokens, spent) {
    const n = Math.max(0, int(tokens[w], 0));
    return h('div.job-token', { dataset: { wing: w, sel: String(i === tokenSel) } },
      h('button.btn.job-token-btn', {
        type: 'button', 'aria-label': `One fewer token on ${w}`, disabled: n <= 0,
        onclick: () => { tokenSel = i; bump(w, -1); },
      }, '−'),
      h('span.job-token-name', w),
      h('span.job-token-n.mono', `${GLYPHS.tokenOpen}${n}${GLYPHS.tokenClose}`),
      h('button.btn.job-token-btn', {
        type: 'button', 'aria-label': `One more token on ${w}`, disabled: spent >= GUARD.tokens,
        onclick: () => { tokenSel = i; bump(w, +1); },
      }, '+'),
    );
  }

  /** The board → guard boundary: the first touch of the press panel, whatever moved it. */
  function touchPress() { if (!pressAt) pressAt = now(); }

  function bump(wing, d) {
    touchPress();
    const gv = g();
    const cur = gv ? { ...gv.tokens } : { ...(board?.press?.tokens ?? {}) };
    const next = { ...cur, [wing]: Math.max(0, int(cur[wing], 0) + d) };
    const total = WING_IDS.reduce((t, w) => t + Math.max(0, int(next[w], 0)), 0);
    if (total > GUARD.tokens) return;
    if (gv) update((s) => { state.press(s, next); });
    else if (board) board.press = { ...board.press, tokens: next };
    render();
  }

  function commitBlock() {
    const c = getState().game?.commit ?? null;
    if (c?.bound) {
      return h('p.job-commit.fs-1', c.kind === 'walk'
        ? COPY.commitWalk({ minutes: c.byMin })
        : COPY.commitDoneBy({ at: `${String(Math.floor(c.byMin / 60)).padStart(2, '0')}:${String(c.byMin % 60).padStart(2, '0')}` }));
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
      h('button.btn.btn-ghost', { type: 'button', onclick: () => { commitOpen = false; render(); } }, 'Not tonight'),
    );
  }

  function doCommit(kind, byMin) {
    commitOpen = false;
    if (!g()) { render(); return; }                 // a declaration binds to a live job (J5c commitBind)
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
    try {
      update((s) => { payout = state.applyTarget(s, result, { now: now(), cards: cardById, tellFor: tellHookFor(s) }); });
    } catch (e) { console.error('job: applyTarget', e); return; }
    if (payout?.free) return;                      // almost / malformed: the target is still live
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
   */
  function payoutFromLast(gv) {
    const last = gv?.last;
    if (!isObj(last)) return null;
    return {
      kind: last.ok ? 'clear' : 'miss', rung: last.rung, rho: null, delta: num(last.d, 0), free: false,
      loose: num(gv.loose, 0), bagged: num(gv.bagged, 0), chain: int(gv.chain, 0),
      chainBefore: int(last.chainBefore, 0), posted: 0, call: null, ok: last.ok === true,
      credit: 0, w: 0, target: null, backcheckable: false, next: null,
    };
  }

  function renderPayout() {
    const s = getState();
    const gv = g();
    if (!payout) payout = payoutFromLast(gv);
    if (!payout) { beat.hidden = true; beat.replaceChildren(); return; }
    const staked = gv?.stakes !== false;
    const line = staked ? payoutLineOf(payout, env) : '';
    const ladder = staked ? ladderLineOf(payout) : '';
    const nextBeat = beatAfter(s);
    const ticks = chainTicksOf(payout.chain);
    const prompt = gv && nextBeat === 'bagpush' ? state.bagPrompt(s) : null;

    const rows = [
      line ? h('p.job-payout.mono', { dataset: { tone: payout.ok ? 'ok' : 'bad' } }, line) : null,
      ladder ? h('p.job-ladder.mono.muted.fs-1', ladder) : null,
      staked ? h('p.job-chain', { 'aria-label': `chain ${payout.chain} of ${ticks.of}, ×${ticks.mult.toFixed(1)}`, dataset: { tone: ticks.tone } },
        ...Array.from({ length: ticks.of }, (_, i) => h('span.job-tick', { 'aria-hidden': 'true' }, i < ticks.n ? GLYPHS.chainFilled : GLYPHS.chainEmpty)),
        h('span.job-chain-mult.mono.fs-1', ` ×${ticks.mult.toFixed(1)}`)) : null,
      thresholdRow(gv, staked && nextBeat === 'bagpush'),
    ];
    const actions = h('div.job-actions');
    if (nextBeat === 'bagpush') {
      add(actions,
        h('button.btn.job-bag', { type: 'button', onclick: () => doBag() },
          COPY.bagPrompt({ amount: prompt.amount, fee: prompt.fee, chainBefore: prompt.chainBefore }),
          h('span.job-key.mono', { 'aria-hidden': 'true' }, 'B')),
        h('button.btn.btn-primary.job-push', { type: 'button', onclick: () => continueBeat() },
          'PUSH', h('span.job-key.mono', { 'aria-hidden': 'true' }, '↵')),
      );
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
    const qStar = num(breakevenQOf(gv, t, call), 0).toFixed(2);
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
    return h('p.job-qstar.mono.fs-1', `next ${record} · breaks even at q ${qStar} if you call ${call}`);
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
    payout = null; env = null;
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
    payout = null; env = null;
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
    payout = null; env = null;
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
    const spent = support.reduce((t, w) => t + Math.max(0, int(gv.tokens[w], 0)), 0);
    if (tokenSel >= support.length) tokenSel = 0;
    add(panel, 
      h('h2.fs-3', 'Brief'),
      h('p.muted.fs-1', `${state.targetsLeft(s)} targets left · loose ${econ.round(num(gv.loose, 0))} · bagged ${econ.round(num(gv.bagged, 0))}`),
      h('ul.job-bars', ...bars.map((x) => h('li.job-bar', { dataset: { wing: x.wing } },
        h('span.job-bar-name', x.wing),
        h('span.job-bar-track', h('span.job-bar-fill', { style: { transform: `scaleX(${Math.max(0, Math.min(1, x.p))})` } })),
        h('span.job-bar-pct.mono.fs-1', `${x.pct}%`)))),
      h('div.job-tokens', { role: 'group', 'aria-label': `Press ${GUARD.tokens} tokens` },
        ...support.map((w, i) => tokenRow(w, i, gv.tokens, spent))),
      h('div.job-brief-opts',
        h('button.btn', { type: 'button', onclick: () => takeBrief({ repress: { ...gv.tokens } }) }, 'Re-press · redraw the guard'),
        ...swapRows(s),
        h('button.btn', { type: 'button', onclick: () => takeBrief({ tell: true }) }, "Take the next target's tell"),
        h('button.btn', { type: 'button', onclick: () => takeBrief({ tell: false }) }, 'Decline the tell'),
        h('button.btn', { type: 'button', onclick: () => { commitOpen = true; render(); } }, 'Declare a walk-away minute'),
      ),
      crewBlock(s),
      commitOpen ? commitBlock() : null,
      h('div.run-actions', h('button.btn.btn-primary', { type: 'button', onclick: () => takeBrief({}) },
        'Skip', h('span.job-key.mono', { 'aria-hidden': 'true' }, '↵'))),
    );
    stage.replaceChildren(panel);
    focusFirst(panel, '.btn-primary');
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
  function swapRows(s) {
    let opts = [];
    try { opts = state.swapOptions(s); } catch { return []; }
    return opts.map((o) => h('button.btn.job-swap', {
      type: 'button',
      dataset: { swap: o.id },
      onclick: () => takeBrief({ swap: { id: o.id } }),
    },
    `Swap in ${o.id}${o.label ? ` · ${o.label}` : ''} · +${o.targets} target${o.targets === 1 ? '' : 's'}`
      + ` · posted ${o.decline} (+${Math.round(DECLINE_PRICE * 100)} % declined)`));
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
       own key — so the ordering is readable rather than asserted. */
    const shape = g()?.shape ?? state.crew.DEFAULT_SHAPE;
    const makes = state.crew.crewOrder(s, { shape, of: onBoard });
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
    /* The three conditions G3.8's claim actually needs, each printed as the number it is: RANK (the
       HELD threshold, above), SUPPLY (what a point on the study top buys on THIS board, against the
       board's best-paying make), and EVIDENCE (how many candidates are still under the depth where
       `m_shown = m`). `domain.all` is all three; the grid used to print only the first. */
    const supplyLine = gap && gap.studyTop
      ? h('p.job-crew-supply.muted.fs-1', gap.agrees
        ? `on this board a point on ${gap.studyTop} pays ${n2(gap.studyPays)} over ${plural(gap.studySupply)}`
          + ' — the best-paying point there is tonight'
        : `on this board a point on ${gap.studyTop} pays ${n2(gap.studyPays)} over ${plural(gap.studySupply)}`
          + ` · ${gap.gameTop} pays ${n2(gap.gameValue)}`)
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
      h('p.job-crew-order.muted.fs-1', `ordered by w × (1 − m/100) — ${makes.length} makes left on the board`),
      align ? h('p.job-crew-align.muted.fs-1', align.held
        ? `a HELD point prices at ${n2(align.threshold)} in the same units`
          + ` — the study ordering ${align.holds ? 'leads it' : 'is outbid by it'}`
        : 'no HELD point is buyable tonight — the study ordering is the whole list') : null,
      supplyLine,
      thinLine,
      /* The grid printed three bare rung words with no price and no effect beside them. Both numbers
         are constants of `data/job.js`, read here rather than re-typed. */
      h('p.job-crew-legend.muted.fs-1',
        `STEADY ${state.crew.COSTS.STEADY} pt forgives 1 rung · `
        + `HELD ${state.crew.COSTS.HELD} pts forgives 2 and holds the chain at ${state.crew.CHAIN_HOLD_MIN}+`));
    for (const make of makes) {
      const at = state.crew.rankOf(s, make);
      const v = state.crew.crewValueDetail(s, make, shape);
      const row = h('p.job-crew-row.fs-1',
        h('span.job-crew-make.mono', make),
        // 2 dp, fixed, so the column reads as a ledger: `econ.round` drops trailing zeros and
        // printed `2` beside `3.12`, which is the one thing a sort key must not do.
        h('span.job-crew-key.mono.muted', ` m ${Math.round(num(v.m, 0))} · ${num(v.score, 0).toFixed(2)} `),
        h('span.job-crew-board.mono.muted',
          `${boardCount.get(make)?.left ?? 0} left · forgives ${boardCount.get(make)?.live ?? 0} `));
      for (const [rank, label] of [[0, 'bare'], [1, 'STEADY'], [2, 'HELD']]) {
        const legal = state.crew.canAllocate(s, make, rank).ok;
        add(row, h('button.btn.btn-ghost.job-crew-rank', {
          type: 'button',
          disabled: !legal && rank !== at,
          'aria-pressed': String(rank === at),
          dataset: { rank: String(rank) },
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
    takeBrief({ crew: { make, rank } });
  }

  function takeBrief(actions) {
    commitOpen = false;
    try { update((s) => { state.brief(s, actions, { now: now() }); }); }
    catch (e) { console.warn('job: brief', e); return; }
    syncHeader();
    render();
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
    add(panel, 
      h('h2.fs-3', 'Getaway'),
      h('p.job-vault-line.mono', COPY.vault({
        make, grade: info.target?.tier ?? 3, hits: q.hits, of: Math.max(1, q.of), q: breakevenLabel(),
      })),
      h('p.job-getaway-nums.mono.fs-1',
        `loose ${econ.round(info.loose)} · bagged ${econ.round(info.bagged)} · chain ${info.chain} · walk banks ${info.walkBanks}`),
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
        if (row) { ev.preventDefault(); toggleDraft(row.id); }
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
      if (k === KEYS.push && !interactive) { ev.preventDefault(); takeBrief({}); }
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
