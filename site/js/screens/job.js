// site/js/screens/job.js — THE GAME, rendered. designs/CUT-BRIEF.md, designs/CUT-SPEC.md.
//
// A card comes up face-down. It says which skill it is and how often you get that one right. You say
// how sure you are — not sure, pretty sure, sure. That sets what it pays and what it costs. Then it
// flips and you answer it. Right answers go on the pile; a wrong one takes a bite and puts the streak
// back to ×1. The pile is not yours until you bank it.
//
// THE HARD LIMITS THIS FILE IS HELD TO (CUT-BRIEF "Hard limits"):
//   · THREE NUMBERS ON SCREEN during play, never a fourth — the pile, the streak, and what this
//     question pays. Counted on the PRINTED NUMERALS (`screenNumeralsOf`), not on the slots: the
//     shipped strip printed `40 · ×3 · 7 of 10` at the one moment the game asks for a decision,
//     which is four numbers, and the one the brief names — what it pays — was not among them. The
//     hit rate is DRAWN instead, one mark per sitting (`hitMeterOf`), which prints no numeral; the
//     face-down card is the pile, the streak and nothing else.
//   · TWO taps per question — the call, then the answer. `requiredTapsOf()` is 1 in the call phase
//     (the call) and 0 in every other; the second tap is the study card's own Submit. Bank is a third
//     control that is always available and never required, and the way out is a fourth.
//   · no new screen and no new route: this mounts on `#/run/job`, the run route's own delegate.
//   · no word a 14-year-old would have to be taught — every student-visible string in this file comes
//     out of `data/job.js COPY`, off the card's own skill, or out of `FACE_NAMES` below. CUT-SPEC §6
//     is the whole list.
//   · no number that is not exactly the number the engine computed: `readingOf()` reads `job/state.js`
//     and `stripFor()` only formats it. Nothing in this file does arithmetic on a printed value. The
//     one drawn thing is geometry, not a value: a mark is one sitting, and it never becomes a figure.
//
// THE PRICE IS NOT ON THE CARD, AND THAT IS ROUND 2 UNDOING ROUND 1. The repair pass answered "the
// bid has no price in sight" by drawing `pay` and `cost` per call as two bars on a shared ruler.
// Round 2's simplicity audit counted what that put on the decision screen: two printed numerals plus
// six drawn prices plus the ruler plus the two drawn counts of the hit rate — ten numeric quantities
// against a hard limit of three, on a surface CUT-SPEC §5 describes in full and never mentions. A
// bar is not a loophole in "nothing else numeric", and the defence that geometry is not a numeral is
// the same move that lets a re-inflation pass a numeral count. `stakeOf`, `stakeEl`, `stakeBar` and
// `barWidth` are deleted, with `.job-stake*` in the stylesheet and `pay`/`cost`/`scale` off the view
// model's calls. The face-down card is now what the brief says it is: the skill, the drawn hit rate,
// three named calls, bank — and the way out.
//
// WHAT THE STUDENT BIDS ON, THEN, is the thing the design is about: how sure he is. The three calls
// are named in the words of the sentence he is answering (`not sure` / `pretty sure` / `sure`), the
// evidence is the drawn rate beside them, and Settings prints the band each call is honest over
// (CUT-SPEC §6). Honest calling wins over the shipped table at every reachable state
// (`tests/job-pay.test.mjs`), so a student who never sees a price cannot be beaten by one who has
// memorised it — which is exactly why the price does not have to be on screen.
//
// WHERE THE FEEL LIVES (CUT-BRIEF "What fun means here, concretely"):
//   · THE FLIP — locking a call does not swap the screen. The face-down card turns (`FLIP_MS`) and the
//     question arrives after it. A beat, not a transition. The strip prints `pays N` the instant the
//     call lands, so the beat is spent looking at what you just bought.
//   · THE STREAK — the ONE number that animates, and while it moves it is the biggest thing on the
//     screen (`--job-tick-scale`, asserted against every other type size in `css/job.css`).
//   · NO ADVICE. `pay.shouldPush` is never called here. The strip prints the hit rate and stops.
//
// ONE GRADE PATH. `screens/card.js`'s answering body is mounted as-is through `createCardView`; its
// `onDone` hands the result to `state.answer`, which prices it and passes it to the study layer's own
// `markItem` / `requeueReview`. Not one line of the grade path is duplicated here.
//
// THE SESSION CLOSES A PAGE, SO THE SESSION RECORDS A PAGE. `captureJobBefore` at the start and
// `commitJobRun` at the end (`screens/run.js`, "THE GAME'S TWO HOOKS INTO THIS SCREEN") — without
// them the answers that earn Flawless Page on `#/run/page` earn nothing here.
//
// A BID THE STUDENT WALKED AWAY FROM IS A BID HE LOST, AND HE WATCHES IT GO. The study card carries
// its own `←` (it is COMPOSED's, and untouchable), and `screens/card.js` rebuilds its attempt count
// on every mount — so leaving a question and coming back used to reset it, and the third wrong
// attempt that produces the only `cleared: false` result could be avoided for ever. The pile was
// then never charged: a student who knew nothing scored 496 where an omniscient honest player could
// reach 478. `settleAbandonedBid` closes it: a call can only still be locked when the screen is
// built if the session it was locked in was abandoned, so it settles at the engine's own price, on
// the pile alone. The question itself is untouched — still on the queue, still unanswered, still
// due — and it comes back SEALED BIDLESS: a question the student has read is priced at nothing,
// exactly as a requeued review is (`job/state.js sealRepeat`), so leaving costs what being wrong
// costs and buys nothing at all.
//
// ROUND 3 MOVED WHEN, NOT WHETHER. The settle used to run before the first paint, so the strip the
// student came back to had already been to zero and the whole of it happened where nobody was
// looking: `24 · ×3 · pays 30` at the moment he was interrupted, `0 · ×1` when he got back, with no
// motion in between. That is the one thing CUT-BRIEF does not let a loss be — a wrong answer prints
// no string, but the strip MOVES. So the beat is `settleBeat()`: the three slots hold the reading
// the engine still has, the bid settles in front of him, and the question arrives after. No string,
// no fourth number, no tap, nothing new on disk.
//
// AND THE CHARGE ITSELF IS FORCED, which is why round 3's "let a reload cost nothing" is not taken.
// The escape is offered AFTER the question is on screen, so it has to cost at least what missing
// costs or it is simply a better way to miss. Scored on the shipped table over a twelve-question
// session (`scratchpad/cut-screen-r3/abandon-dominance.mjs`, exact DP, no sampling): letting the bid
// stand across the load hands a student who knows NOTHING 496 points against 469.5 for one who is
// right 99 times in 100 — the r1 exploit exactly, back through a different door — and voiding it
// instead beats honest play at every rate on the grid (+305 % at q = 0.35, +4 % at q = 0.99). What
// a reload must not be is SILENT, and that is what the beat fixes.
//
// THE WAY OUT, and it is one control, one word, and it is on the face-down card only. The shell's
// Home link is on screen during a session but has nothing in it to see — every read-out in the
// header steps aside (`app.js HDR_JOB_HIDE`) and the anchor is a live 44×44 rectangle of blank paper
// in the corner. The flat page this screen re-skins offers three ways out; an installed Packet is
// `display: standalone`, so a student who opens a session and changes his mind had none. `css/job.css`
// takes the blank target off the header for the length of a session and this screen renders its own:
// `Today`, §6's own word, on §6's own route. It is never required and it costs no question a tap.
//
// ROUND 4 GAVE THE OTHER THREE MOMENTS THE SAME BEAT, and that is the whole of this round's change
// to the loop: no mechanic, no control, no number and no word was added to any of them.
//   · LOSING THE PILE. The strip repainted at the instant of the grade, so the biggest event in the
//     game was a 22 px numeral changing at the top of the viewport while the eye was on the grader's
//     red feedback 600 px lower. It now holds what it said when the bid was made and settles on
//     `lossBeat()`, alone on the screen, once the student taps Continue.
//   · A QUESTION THE GAME WILL NOT PRICE (a requeued review, and the question a walked-away bid
//     hands back) went straight into the card, so bank — "always available" — was absent for TEN
//     consecutive questions on a driven session. `bidlessBeat()` is the card `job/state.js
//     isBidless` has always said the screen draws: the calls greyed, bank live, no tap, no price.
//   · THE HIT RATE was drawn at a denominator of ten whatever the engine had measured. The row now
//     ends at the `of`-th mark (`marksEl` / `css/job.css`), so the fraction the eye takes is the
//     engine's own.
//
// ROUND 5 TOOK ONE THING OFF THE STRIP AND TAUGHT IT TO REPAINT. No mechanic, no number, no word, no
// control and no tap was added; one was removed and three paints were added where there were none.
//   · `pays N` IS A PROMISE, AND THE STRIP NOW STOPS MAKING IT when the question can no longer keep
//     it. The game prices a CLEAN clear (CUT-SPEC §7 "Ninth"), the hint ladder is on every card by
//     COMPOSED's rule 1, and a hinted or retried clear settles EXACTLY as a miss — so `pays 50` sat
//     beside a live `Hint 1 of 3` and `pays 30` sat over a grader printing `✓ SILVER +12 XP`. See
//     `stripFor`'s `earnable` and `earnableNow()`.
//   · THE WALKED-AWAY BID IS ON SCREEN WHILE IT MOVES. Round 3 gave the settle a hold; the settle
//     itself still happened in the same frame as the next card. `settleBeat` now has `lossBeat`'s
//     second half, so the moved pile stands alone for `FLIP_MS` before anything is built over it.
//   · THE SCREEN REPAINTS WHEN THE ENGINE MOVES UNDER IT. `store.js` rolls the day on its own clock
//     and a roll drains the unbanked pile: the strip printed `96 pile · ×5 streak` over an engine
//     holding 0 and ×1, with two dead controls on it. `resync()`, a store subscription, and `write()`
//     — the guard that keeps the screen from hearing its own verbs.
//   · LEAVING BY `Today` IS LEAVING. The absence was declared on `visibilitychange` / `pagehide`
//     only, and a hash change fires neither: the unmount closure now declares it too.
//
// IT IS NOT DRAWN OVER THE QUESTION, and round 3 is why. `← Today` was rendered in every phase, so
// the most destructive control on the screen was a neutral grey back arrow sitting where a back
// arrow sits: one tap on it at `8 · ×2 · pays 18` took the whole pile and the streak. `viewModel`
// already greys `bank` the instant a call is sealed, for the reason that governs here too — a
// control that claims to be live and is not is worse than one the screen does not offer — so the
// way out is offered while the card is face down and not once a bid is standing. Leaving is then
// free at every moment it is offered, and it is one Continue away from any question.

import { h, navigate, setJobHeader, setHeader, bus } from '../app.js';
import { getState, update, subscribe } from '../store.js';
import { readiness } from '../readiness.js';
import { gameOn, pageOpts } from '../plan.js';
import { byId as cardById } from '../../data/cards.js';
import { skillById } from '../../data/skills.js';
import * as T from '../../data/templates.js';
import { createCardView } from './card.js';
import { renameCard, captureJobBefore, commitJobRun } from './run.js';
import * as state from '../job/state.js';
import { qHatDetail, QHAT_WINDOW } from '../job/call.js';
import { CALLS, decides } from '../job/pay.js';
import { COPY } from '../../data/job.js';

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const add = (el, ...kids) => { for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k); return el; };

/* ============================================================== the pure half (no DOM, no clock) */

/** The four things the screen can be showing. `over` is after the queue ends; the rest are play. */
export const PHASES = Object.freeze(['call', 'flip', 'answer', 'over']);

/** The phases during which the three-slot strip is on screen. */
export const PLAY_PHASES = Object.freeze(['call', 'flip', 'answer']);

/** THE FLIP. Long enough to be a beat, short enough that nobody waits for it. */
export const FLIP_MS = 340;

/** How long the streak stays big after it moves. Longer than `css/job.css`'s `--dur-3`, so the
 *  climb finishes on screen rather than being cut off by the attribute coming back off. */
export const TICK_MS = 520;

/**
 * How long the strip says what banking just bought. Long enough to read a five-word line twice, and
 * it holds nothing up: the three calls stay live underneath it the whole time.
 */
export const BANK_MS = 1400;

/**
 * THE TWO SKILL NAMES THAT CARRY A DIGIT, said without one.
 *
 * CUT-BRIEF's hard limit is three numbers on screen at once during play. `data/skills.js` names two
 * of the nineteen skills `Factoring a = 1` and `Factoring a > 1`, and a Factoring card put that
 * fourth numeral on the face-down card and kept it through the flip: `8 pile · ×2 streak · pays 16`
 * over a card headed `Factoring a > 1`. It is 9 of the 100 weight in the graph and 12 of the 17
 * items on a page after the factoring sheet, so it is not a corner — it is the ordinary Friday.
 *
 * SAID IN THE STUDENT'S OWN WORDS, not the sheet's shorthand: `a` is the number in front of the
 * squared term, and the two skills are the two halves of the factoring sheet. Neither line carries a
 * digit, neither invents a word the student has not met, and both name the thing the card will
 * actually ask.
 *
 * THIS TABLE IS A STOPGAP AND IT KNOWS IT. The right home for a student-facing name is
 * `data/skills.js`, which this lane does not own; the request is in `notes/cut-screen.md`. So the
 * table is consulted ONLY when the data file's own name carries a digit — rename the two skills
 * there and these two lines go quietly dead, and the sweep in `tests/job-screen.test.mjs` still
 * holds the limit over every name that ships.
 */
export const FACE_NAMES = Object.freeze({
  FAC1: 'Factoring, no number in front',
  FAC2: 'Factoring, a number in front',
});

/**
 * The skill's student-facing name (`data/skills.js`) — the one word the face-down card carries, and
 * never one with a digit in it. A NEW digit-bearing name with no entry in `FACE_NAMES` reaches the
 * card as it is and `tests/job-screen.test.mjs` goes red on the next run, which is where that
 * argument belongs: the counter (`screenNumeralsOf`) is what the limit is measured on and it is
 * never taught an exception.
 */
export const makeNameOf = (id) => {
  const name = skillById[id]?.name ?? String(id ?? '');
  return /\d/.test(name) ? (FACE_NAMES[id] ?? name) : name;
};

const whole = (x) => Math.max(0, Math.trunc(Number(x) || 0));

/**
 * THE HIT RATE, DRAWN — one mark per sitting of the window: a filled mark for a question of this
 * skill the student got right, a struck one for a miss, and an empty one for a sitting they have not
 * had yet. `hits`, `of` and `window` are `qHatDetail`'s own three numbers and nothing here rounds,
 * scales or infers one; the renderer draws them and prints no numeral at all.
 *
 * WHY IT IS NO LONGER THE FIGURE `7 of 10`, and neither reason is a preference:
 *  · IT WAS THE FOURTH AND FIFTH NUMBER ON SCREEN. CUT-BRIEF allows three during play — the pile,
 *    the streak and what the question pays — and the face-down card printed `40 · ×3 · 7 of 10`,
 *    four numbers with the pay missing. Marks cost none of that budget, so the budget now pays for
 *    the thing the brief actually names.
 *  · `1 of 1` READ AS CERTAINTY. Every rate a first session can print is a perfect record off one
 *    to three sittings — six of fourteen cards said `new` and the other eight said `1 of 1`,
 *    `2 of 2`, `3 of 3` under the caption "you got this right", so day one read "tap `sure` unless
 *    it says new". One filled mark beside nine empty ones cannot be read as ten out of ten: the
 *    denominator is drawn at full size whether or not the student has filled it.
 *
 * @returns {{hits:number, misses:number, empty:number, of:number, window:number}}
 */
export function hitMeterOf(detail) {
  /* `win`, not `window`: this file has a DOM global of that name and a shadow of it here would be a
     trap for the next reader rather than a bug for this one. */
  const win = Math.max(1, Math.trunc(Number(detail?.window) || QHAT_WINDOW));
  const of = Math.min(win, whole(detail?.of));
  const hits = Math.min(of, whole(detail?.hits));
  return { hits, misses: of - hits, empty: win - of, of, window: win };
}

/**
 * The third slot's WORD before the call is in: `new` when the skill has no history at all, and
 * nothing when it has one — the marks carry it from there, and a row of marks under a number would
 * be the same count said twice.
 */
export function hitLineOf(detail) {
  return whole(detail?.of) > 0 ? '' : COPY.none;
}

/** The third slot, once the call is in. `pay` is `state.priceOf`'s, never recomputed here. */
export const paysLineOf = (pay) => COPY.pays({ n: pay });

/**
 * EVERY NUMBER THE SCREEN MAY PRINT, read straight off `job/state.js`. This is the only place the
 * screen touches the engine for a figure, so "no number that is not exactly the number the engine
 * computes" is a property of one ten-line function.
 * @returns {{pile:number, streak:number, call:string|null, pay:number|null, offered:string[]}|null}
 */
export function readingOf(save) {
  const g = state.stateOf(save);
  if (!g) return null;
  const call = isObj(g.call) && typeof g.call.id === 'string' ? g.call.id : null;
  return {
    pile: g.pile,
    streak: g.streak,
    call,
    pay: call == null ? null : state.priceOf(save, call).pay,
    offered: state.callsFor(save),
    /* CROSS-LANE (engine, r4 — notes/cut-engine.md §R2). Is this question one the game is NOT
       pricing — the copy a missed review put back on the page, or the question a walked-away bid
       hands back? The engine has always known (`state.isBidless`); nothing on screen said so. */
    bidless: state.isBidless(save),
  };
}

/**
 * THE THREE SLOTS, and never a fourth. Formatting only: every numeral below came out of `readingOf`,
 * and nothing here adds, scales or rounds one.
 *
 * THE THIRD SLOT IS THE BID, BEFORE AND AFTER. Face down it carries the evidence the bid is made on
 * — the marks, which print no numeral — and the instant the call lands it carries what that call
 * bought, `pays N`, which is the third number CUT-BRIEF names. So the one slot that changes is the
 * one the decision happens in, and the screen never shows four numbers to do it.
 *
 * `opts.earnable === false` MEANS THE QUESTION ON SCREEN CAN NO LONGER EARN WHAT THE BID BOUGHT, and
 * the slot then carries nothing at all — see the head of this file, round 5. `pays N` is a promise,
 * and the moment the promise cannot be kept the strip stops making it. It is not replaced by a
 * second figure, a word or a second form: the slot goes to the shape a bidless question already
 * gives it, which is the shape that already means "this question is not paying you".
 *
 * @returns {{slot:string, value:string, caption:string, meter:object|null}[]} exactly three
 */
export function stripFor(reading, detail = null, opts = {}) {
  const r = isObj(reading) ? reading : { pile: 0, streak: 1, call: null, pay: null };
  /* THE WORD OR THE RULER, NEVER BOTH — and the slot is 88 px wide on a 320 px phone. `new` and ten
     marks on one `nowrap` line measure 108.7 px there: the value ran 20.7 px out of its own track,
     the document went 4.7 px past the viewport, and `qa/layout-audit.mjs`'s own `doc-overflow`
     blocker fired in both engines and both themes. It is the DAY-ONE form — a save straight off an
     aced placement has no history on any skill, so the first session renders it on every card of
     the page — and the auditor could not see it because all five of its job states start from a
     midweek save where no skill is new. The word already says what the empty ruler would say. */
  const word = hitLineOf(detail);
  /* THE SLOT THAT SAYS WHAT THIS QUESTION PAYS IS EMPTY WHEN IT PAYS NOTHING (r4, player-feel —
     CROSS-LANE, engine, notes/cut-engine.md §R2). A requeued review is sealed bidless by the engine:
     it pays nothing, costs nothing and leaves the streak, which is the fix that closed round 1's
     thrown-review exploit — and the student was told none of it. He answered one correctly, the
     study layer printed `GOLD · +43 XP`, and the strip stayed at `28 pile · ×1 streak`: a right
     answer that moved neither number, with the only signal being a face-down beat that did not
     happen. CUT-SPEC §6 forbids the copy that would explain it, so the strip says it the way the
     strip says everything — by what it holds. Every priced question carries `pays N` from the moment
     the bid lands until the grade; this one carries NOTHING in that slot, from before the answer.
     No word, no number, no fourth slot, and one fewer thing on screen than a paid question has.

     …AND A QUESTION THAT CAN NO LONGER EARN ITS BID CARRIES NOTHING THERE EITHER (r5, number-truth
     + player-feel, MAJOR ×2). `pays N` was printed as the question's unconditional value, and it is
     not one: the game prices a CLEAN clear (CUT-SPEC §7 "Ninth" — first try, no hint, `js/xp.js
     isClean`), so three of the four ways the card can grade a question "correct" settle it exactly
     like a miss. Swept over the reachable space, a hinted clear leaves the same pile and the same
     streak as a miss in EVERY state × call pair — 4,546 of 4,546 at a 14-question depth (the finding
     that filed it), 3,646 of 3,646 at the 12-question depth `tests/job-screen.test.mjs` sweeps
     against the shipped `job/state.js answer` — and at pile 196 ×5 the strip went on
     reading `pays 50` with the hint button live beside it and the whole 50 already unreachable. The
     measured shape of it: `sure` at `26 pile · ×3 · pays 30`, one rejected submit and one hint, then
     the right answer — the grader printed "✓ SILVER +12 XP" over a strip still promising 30, and
     Continue took the pile to 2. CUT-SPEC §6 forbids a string that would explain any of that, so the
     strip says it the only way the strip says anything: it stops. The instant the card records a
     second attempt or reveals a hint the promise comes off, and `pays N` then means what it says at
     every instant it is on screen. Nothing is added — no word, no number, no control, no tap — and
     the slot's caption stays empty, so `data-form` does not move and the band does not resize under
     a question the student is reading. */
  const third = r.bidless || (r.call != null && opts?.earnable === false)
    ? { value: '', caption: '', meter: null }
    : r.call == null
      ? { value: word, caption: COPY.hitRate, meter: word ? null : hitMeterOf(detail) }
      : { value: paysLineOf(r.pay), caption: '', meter: null };
  return [
    { slot: 'pile', value: String(r.pile), caption: COPY.pile, meter: null },
    { slot: 'streak', value: `×${r.streak}`, caption: COPY.streak, meter: null },
    { slot: 'third', value: third.value, caption: third.caption, meter: third.meter },
  ];
}

/**
 * THE WAY OUT — one control, in `Today`, on `#/today`, on the FACE-DOWN CARD.
 *
 * It is not a game decision and it is not on any question's tap count: `requiredTapsOf` ignores it.
 * See the head of this file for why the screen has to carry its own rather than lean on the shell's,
 * and why it is not drawn once a bid is standing.
 */
export const exitOf = () => ({ label: COPY.today, href: '#/today' });

/**
 * The whole screen as data. The DOM builder below consumes this and invents nothing, which is what
 * lets `tests/job-screen.test.mjs` hold the §6 vocabulary and the three-slot limit over the reachable
 * state space instead of over a screenshot.
 *
 * @param {object} save
 * @param {{phase?:string, detail?:object, skill?:string|null, over?:object|null, banked?:number,
 *          earnable?:boolean}} [opts]
 */
export function viewModel(save, opts = {}) {
  const over = isObj(opts.over) ? opts.over : null;
  if (over) {
    return {
      phase: 'over',
      strip: [],
      skill: null,
      calls: [],
      bank: null,
      /* the session is finished, and the panel's own primary button IS Today: a second one beside
         it would be the same word twice on the one screen that has room for neither */
      exit: null,
      say: null,
      lines: [
        COPY.todayPoints({ points: over.today }),
        COPY.best({ points: over.best }),
        ...(over.split == null ? [] : [COPY.split({ percent: over.split })]),
      ],
      primary: COPY.today,
    };
  }
  const reading = readingOf(save);
  if (!reading) return null;
  const phase = PLAY_PHASES.includes(opts.phase) ? opts.phase : (reading.call == null ? 'call' : 'answer');
  const live = phase === 'call';
  /* THE BEAT AFTER A BANK, and the only thing in the layer that answers a tap with a sentence.
     Banking used to render EXACTLY like busting — the pile to 0, the streak to ×1, no string, no
     motion, no sound — so the student's own reward looked like a punishment and the second of the
     two surviving ideas died on first contact. For `BANK_MS` the three slots step aside and the
     strip says what the tap was worth. It is one number (`state.bank`'s own `today`), it replaces
     the other two rather than joining them, and it is gone before the next call is made. */
  const say = live && opts.banked != null && Number.isFinite(+opts.banked)
    ? COPY.todayPoints({ points: whole(opts.banked) })
    : null;
  return {
    phase,
    reading,
    say,
    /* `earnable` is the card's own state, read by the mount (`earnableNow`) and never a second
       opinion held here: the slot stops promising `pays N` the instant the question can no longer
       earn it. Absent — every caller outside a live question — it is true, which is the reading the
       engine has at the moment a bid is locked. */
    strip: say ? [] : stripFor(reading, opts.detail, { earnable: opts.earnable !== false }),
    skill: live || phase === 'flip' ? makeNameOf(opts.skill) : null,
    /* THE THREE CALLS, NAMED AND NOTHING ELSE. They used to carry `state.priceOf`'s `pay` and `cost`
       and a shared ruler, drawn as bars — six prices and a scale on the one screen a hard limit of
       three numbers is measured on, and a surface CUT-SPEC §5 does not describe. See the head of
       this file: what a student bids is how sure he is, and the evidence for that is the rate drawn
       beside these three words. */
    calls: CALLS.map((id) => ({ id, label: id, enabled: live && reading.offered.includes(id) })),
    /* BANK — on the face-down card and through the flip, never required, and it never advises.
       IT IS NOT ON THE QUESTION, and that is a measurement rather than a preference: with an OS
       keyboard open a phone leaves 331 px of visual viewport, `#dock` takes 117 px of it, and a
       control under the study card is then 150 px below the end of the scroll — `qa/layout-audit.mjs
       --only job` reported `.job-bank` as an offscreen BLOCKER there, and an unreachable control is
       worse than one the screen does not claim to offer. CUT-SPEC §4's "live at every moment,
       face-down card included" is read as what it was written against: bank is not gated behind a
       payout beat the way the old design gated it. The bank-or-push decision IS the face-down card —
       §4's own comparison is against "the free question after a bank" — and it is one Continue away
       from any question. Named in notes/cut-screen.md under "Open issues".

       AND IT IS DEAD THE INSTANT A CALL IS SEALED, which is this model agreeing with the engine
       rather than holding a second opinion about the rules. `state.bank` THROWS over a locked call —
       it has to, or `sure` at ×5 could be banked before the flip and the cost floored to nothing —
       and this model used to render the button live and ungreyed for the whole of `FLIP_MS`, where
       a tap hit the refusal, logged a warning and moved nothing on screen. A control that claims to
       be live and is not is worse than one the screen does not offer, so it stays on the beat (the
       strip must not jump) and it stays GREYED, saying exactly what the engine would say. */
    bank: live || phase === 'flip'
      ? { label: COPY.bank, enabled: reading.pile > 0 && reading.call == null, required: false }
      : null,
    /* …AND THE WAY OUT, ON THE FACE-DOWN CARD AND NOWHERE ELSE — the same rule `bank` above obeys,
       applied to the one control that could take more than a bid.

       It used to be drawn in every phase, and round 3 measured what that meant: at `8 · ×2 · pays 18`
       with a question on screen, one tap on a neutral grey `← Today` — where a back arrow sits, and
       the least destructive-looking thing on the screen — charged `priceOf().cost`, the whole pile,
       and put the streak back to ×1. The engine is right to charge it (see `settleAbandonedBid`: a
       free bail-out is simply a better way to miss). What is wrong is offering it. While a bid is
       standing there is no free way out of this screen, so the screen does not draw one — and what
       it does draw is then true: leaving is free every moment it is offered, and the face-down card
       where it is offered is one Continue away from any question. */
    exit: reading.call == null ? exitOf() : null,
    lines: [],
    primary: null,
  };
}

/**
 * Game decisions the student MUST make in this phase. One call, then the study card's own Submit.
 *
 * A FACE-DOWN CARD WITH NOTHING TO BID ON ASKS FOR NOTHING, and that is not an exemption: a repeat
 * is sealed bidless (`job/state.js sealRepeat`), `callsFor` offers no call over a seal, so the
 * model greys all three and the beat ends on its own clock (`bidlessBeat`). The cost of that
 * question is the answer and nothing else. Every state with a live call still reads 1 — `offered`
 * always returns at least `CALLS[0]`, so a face-down card the student can bid on can never fall
 * through this branch and quietly stop counting its own tap.
 */
export const requiredTapsOf = (model) =>
  (model && model.phase === 'call' && (model.calls || []).some((c) => c.enabled) ? 1 : 0);

/** Every student-visible string in a view model, in render order. */
export function stringsOf(model) {
  if (!isObj(model)) return [];
  const out = [];
  if (model.exit) out.push(model.exit.label);
  for (const s of model.strip || []) { if (s.value) out.push(s.value); if (s.caption) out.push(s.caption); }
  if (model.say) out.push(model.say);
  if (model.skill) out.push(model.skill);
  for (const c of model.calls || []) out.push(c.label);
  if (model.bank) out.push(model.bank.label);
  for (const l of model.lines || []) out.push(l);
  if (model.primary) out.push(model.primary);
  return out;
}

/** Every digit-run a set of slots prints, in order. */
export const numeralsOf = (strip) => (strip || [])
  .flatMap((s) => String(s.value ?? '').match(/\d+/g) || [])
  .map((n) => Number(n));

/**
 * EVERY NUMBER ON SCREEN in this state, in render order — the whole model, not just the strip.
 * CUT-BRIEF's hard limit is three numbers on screen at once during play, and the limit is counted on
 * this: a figure on a call, on a card or in a line of copy costs exactly what a figure in a slot
 * costs.
 *
 * THE SKILL NAME IS COUNTED HERE TOO, and it is counted rather than excused. This comment used to
 * claim that `data/skills.js` carries no digit and that one would land here and fail the suite: both
 * halves were false. Two of the nineteen names are `Factoring a = 1` and `Factoring a > 1`, and the
 * sweep that was supposed to catch them passed `skill: 'VOC'` on every one of its 3,666 calls — so a
 * Factoring card printed four numbers through the call and the flip for three verification rounds.
 * `makeNameOf` is where that is fixed (`FACE_NAMES`); this function is never taught an exception,
 * because it is the instrument the limit is measured with.
 */
export const screenNumeralsOf = (model) => stringsOf(model)
  .flatMap((s) => String(s).match(/\d+/g) || [])
  .map((n) => Number(n));

/**
 * A BID THE STUDENT WALKED AWAY FROM, SETTLED — at the engine's own price, on the pile alone.
 *
 * THE HOLE THIS CLOSES. The study card's `←` is COMPOSED's and stays; `screens/card.js` rebuilds its
 * attempt count on every mount, and the third wrong attempt is the only thing that produces a
 * `cleared: false` result. So leaving a question before the third wrong and coming back — two taps,
 * Home's own Continue — used to hand back the SAME question with the SAME call still locked and the
 * pile never charged. Every question became unloseable: `not sure → pretty sure → sure → sure …`
 * scores 496 on a twelve-question page knowing nothing, against 478 for a player who is right 99
 * times in 100. "Your streak is a pile you can lose" was false.
 *
 * WHY THE MOUNT IS THE PLACE. Inside a live session a call is locked and settled without the screen
 * being rebuilt (`lockCall` → the flip → `applyResult`), so a call that is STILL locked when this
 * screen is built can only have come from a session that was left — whether by the back link, a
 * reload or a killed tab. One check, at the one instant that means one thing.
 *
 * WHAT IT DOES AND WHAT IT REFUSES TO DO. Ledger B only: the pile pays `state.priceOf`'s `cost` (the
 * engine's number, already capped at the pile, so it floors at zero by construction) and the streak
 * goes back to ×1 — the same two writes a wrong answer makes. It does NOT mark, requeue or advance
 * the question: the queue, the index and every byte of Ledger A are exactly as the student left
 * them, so the question is still there, still unanswered and still due. Leaving therefore costs what
 * being wrong costs and buys nothing, which is all this needs to do.
 *
 * AND THE QUESTION COMES BACK SEALED BIDLESS (r2, player-feel). Clearing the call put the question
 * back FACE-DOWN with all three calls live, so the one he had just read could be bid on again: a
 * student who left `not sure` on a question, read it, and came back could bid `sure` on a question
 * he had already seen and bank it. `job/state.js`'s own `bank()` says why that cannot stand — "you
 * bid on yourself BEFORE you see the question is only true if the bid stands until it is answered"
 * — and the engine already has the shape for a question it will not price twice: the bidless seal
 * `{ id: null }` a requeued review gets (`sealRepeat`). So the abandoned question keeps the seal and
 * loses only the bid: the screen gives it the beat every bidless question gets (`bidlessBeat` —
 * the card, the three calls greyed, bank live), the table prices it at nothing, the streak does not
 * move on it and the pile is neither paid nor charged again. No new state, no new number, no new
 * word, and nothing to tap.
 *
 * The seal carries the ABANDONED BID'S OWN instant, not a fresh clock read: `qHatDetail` cuts the
 * printed hit rate at `call.at`, and the instant that rate was cut at is the instant the student
 * bid — which is still true of the question he is coming back to. This file reads no clock for it.
 *
 * ROUND 3 ASKED FOR THIS TO COST NOTHING WHEN THE STUDENT DID NOT CHOOSE IT — a reload, a tab the
 * phone killed — and the answer is that the screen cannot tell those apart from a bail-out, and the
 * cheap rule is not cheap. The escape is reached AFTER the question is on screen (that is the loop),
 * so a student who can see he is about to miss can take it, and it has to cost at least what missing
 * costs or it is strictly a better way to miss. Both shapes of "a reload costs nothing" were scored
 * against honest play on the shipped table, exact DP over a twelve-question session
 * (`scratchpad/cut-screen-r3/abandon-dominance.mjs`):
 *
 *     rule                                    q=0.35   q=0.80   q=0.99   a student who knows nothing
 *     the shipped settle                        28.2    167.7    469.5     0.0
 *     the bid stands across the load           496.0    496.0    496.0   496.0   ← r1's exploit, again
 *     the question comes back priced at 0      114.1    376.0    490.0     0.0
 *
 * 496 knowing nothing against 469.5 for a student who is right 99 times in 100 is the exact trace
 * the round-1 exploit hunt filed, arriving through a different door; and voiding the bid instead
 * beats honest play at every rate on the grid. So the charge stays, it stays exactly a miss, and
 * what round 3 actually bought is `settleBeat()`: the pile and the streak he left are on screen
 * when they move, rather than having gone before the first paint.
 *
 * @returns {{cost:number, pile:number, pileBefore:number, streak:number, call:string}|null}
 */
export function settleAbandonedBid(save) {
  const g = state.stateOf(save);
  if (!g || !isObj(g.call) || typeof g.call.id !== 'string') return null;
  const id = g.call.id;
  const { cost } = state.priceOf(save, id);
  const pileBefore = Math.max(0, Math.trunc(Number(g.pile) || 0));
  const at = Number.isFinite(+g.call.at) ? +g.call.at : 0;
  const after = state.writeGame(save, {
    ...g, pile: pileBefore - cost, streak: 1, call: { id: null, at },
  });
  return { cost, pile: after.pile, pileBefore, streak: after.streak, call: id, sealed: after.call };
}

/* ================================================================================== the mount */

export function mountJob() {
  return (host) => {
    /* THE SWITCH IS A DOOR (CUT-BRIEF: `settings.game = false` returns the app to byte-identical
       COMPOSED behaviour), and a half-answered Today's Page is a door too: its unanswered items are
       still due, and starting a session over them would take them off the schedule.

       THE CALENDAR IS NOT A DOOR, and this is a decision, not an oversight (notes/cut-home.md R2
       asked for `plan.jobEntryGate` here; the integration pass declined it and deleted it). That gate
       refused on the week as well as on the switch — the Night Before, the Morning Of, after the
       test, a save with no test date at all, and every hour after 22:00 — so `#/run/job` would have
       answered a bookmark differently depending on the day and the time. The game is Today's Page
       with a different top strip: if the page can be run, the strip can be on it. The 22:00 close
       still governs what Home OFFERS, which is how a student reaches this screen. */
    if (!gameOn(getState())) { navigate('/today'); return () => {}; }
    try {
      if (state.pageInProgress(getState())) { navigate('/run/page'); return () => {}; }
    } catch { /* a malformed save is the mount's problem, not the gate's */ }
    return mount(host);
  };
}

function mount(host) {
  let destroyed = false;
  let view = null;              // the live card view
  let over = null;              // the session summary, once it is over
  let flipping = false;         // the beat between locking the call and the question
  let flipTimer = 0;
  let tickTimer = 0;
  let bankSay = null;           // today's points, while the strip is saying what a bank just bought
  let bankTimer = 0;
  let settling = false;         // a bid he walked away from, on screen for the beat it is charged on
  let settleTimer = 0;
  let lost = null;              // the reading a loss is holding, until he has watched it go
  let lossTimer = 0;
  let bidless = 0;              // the face-down beat a question the game will not price gets:
                                // 0 not yet, 1 on screen, 2 spent on this question
  let bidlessTimer = 0;
  let spent = false;            // the question on screen can no longer earn what the bid bought
  let inVerb = 0;               // depth of this screen's own writes — see `write` / `resync`
  let offStore = null;          // the store subscription that catches a change nobody here made
  let jobQueue = [];          // the page this session is closing — `commitJobRun`'s record
  let before = null;            // …and the snapshot it is measured against

  /* WHAT THIS SCREEN DECLARES TO THE SPLIT METER, and it is one shape of interval and no other: the
     face-down card is up and the student is choosing — a call (`lockCall`) or to bank (`doBank`).
     That is the only thing that reaches `tGame`.

     IT DECLARES NOTHING ELSE, AND THAT IS NOW THE WHOLE JOB. `job/state.js`'s meter partitions the
     session off `inProgress.startedAt`: every millisecond since the last verb is attributed, the
     declared game decision is capped by the wall clock that actually elapsed, and EVERYTHING the
     screen does not declare falls to the answering half. So the flip, the card build and the seconds
     spent reading a graded question are counted — in `tAnswer`, where they belong — rather than
     dropped, and the printed `% of this session` is a share of the session. `skipBeat()` is what
     keeps them out of the GAME half: it closes an interval this screen is not claiming, so the next
     declaration measures the face-down card and not the reading before it. An interval this file
     gets wrong can only ever lower the printed share; it has no way to flatter the game. */
  let beatAt = Date.now();

  const root = h('section.screen.run-screen.job-screen', { dataset: { kind: 'job', phase: 'call' } });
  /* THE WAY OUT, above the strip and outside it: the strip is three slots and never a fourth thing
     of any kind. It is built once — it says the same word in every phase of play — and it is taken
     off the screen when the session is over, where the end panel's own primary button is Today. */
  const head = h('div.job-head');
  const strip = h('div.job-strip', { role: 'status', 'aria-live': 'polite' });
  const stage = h('div.job-stage.run-stage');
  const mountEl = h('div.job-mount');
  const foot = h('div.job-foot');
  stage.append(mountEl, foot);
  root.append(head, strip, stage);
  host.append(root);

  try {
    write((s) => {
      /* SAME QUEUE AS TODAY'S PAGE (CUT-BRIEF "Session shape"). `startJob` forwards these to
         `startPage`, so without `pageOpts` a lowered week composes a DIFFERENT page here than the one
         Home's plan strip just promised in print (notes/cut-home.md R1: two tier-4 items instead of
         one). `plan.pageOpts` is `composeOpts` minus `q` — the one implementation all three routes
         that start Today's Page now use. */
      /* `resume` takes the clock so a session re-opened after the tab died closes its absence HERE,
         at the instant the app came back, and not at the student's first decision (cross-lane,
         engine r3 — notes/cut-engine.md §R1). */
      if (state.stateOf(s)) state.resume(s, { now: Date.now() }); else state.startJob(s, { ...pageOpts(s), now: Date.now() });
      /* A CALL STILL LOCKED WHEN THIS SCREEN IS BUILT IS A BID THE STUDENT WALKED AWAY FROM — see
         `settleAbandonedBid`. It is settled on `settleBeat()` rather than here, so the pile and the
         streak he left are on screen when they move instead of having gone before the first paint;
         until that beat ends the save still holds the bid, so the strip is the engine's reading at
         every instant and nothing on screen is a remembered number.
         WITH NOTHING TO SEE THERE IS NO BEAT: an empty pile at ×1 loses nothing, so it settles here
         and the question is up immediately, exactly as it was. */
      const g0 = state.stateOf(s);
      const standing = isObj(g0?.call) && typeof g0.call.id === 'string';
      settling = standing && (g0.pile > 0 || g0.streak > 1);
      if (standing && !settling) settleAbandonedBid(s);
      jobQueue = state.queueOf(s).slice();
      /* the screen's snapshot, off the RAW save: `captureJobBefore` reads Ledger A, which `js/job/*`
         may not (`state.guardSave`), so it has always been the screen's to take. */
      before = captureJobBefore(s, jobQueue);
    });
  } catch (e) {
    console.error('job: cannot start', e);
    navigate('/today');
    return () => { destroyed = true; };
  }

  /* A SCREEN NOBODY IS LOOKING AT IS NOT A DECISION BEING MADE (notes/cut-machine.md §R3 / §R5.2).
     The engine caps one declared interval at `DELIBERATION_MS`, which closes an absence longer than
     the ceiling; it cannot tell twenty seconds of choosing from twenty seconds of not being there,
     and a student away on every card would print a share he did not play. Presence is the screen's
     to know, and the browser already says it. `screens/boss.js` does the same for the study layer.

     The body is `skipBeat()` and nothing else — no new state, no new number, no new tap, no clock
     read that reaches a payoff. `visibilitychange` fires on the way out AND on the way back, so the
     claim is dropped twice: the deciding time before the tab was hidden is forfeited, and the hidden
     span is never claimed when it returns. That is deliberately the pessimistic half of the trade —
     an interval this file gets wrong may only ever LOWER the printed share, never flatter it. */
  /* CROSS-LANE (engine, r3 — notes/cut-engine.md §R1). `skipBeat()` drops this screen's CLAIM on the
     interval; it does not tell the meter the app is gone, and the meter was booking the whole
     absence to the answering half — so a break printed `2 % of this session was the game` over a
     session that was 9 %. `state.presence` is the engine's side of the same event: the time the
     student WAS here is closed off, the span nobody was present for goes to neither half, and the
     bit is written to the save so a tab that never comes back has already closed its own books.
     It can only ever say "the document went away", never how long for — the engine clamps that to
     the clock. The handler still books nothing to the game half. */
  /* …AND THE WRITE HAS TO REACH THE DISK, which round 4 measured that it did not (split-honesty,
     BLOCKER). `store.js` registers its own `visibilitychange` → flush and `pagehide` → flush at
     module-eval time, i.e. BEFORE this screen mounts, so on an unloading document the store has
     already flushed by the time this handler runs and the default 250 ms debounce behind
     `update()` never fires again. Measured on a real same-origin navigation away from `#/run/job`:
     the handler ran, `away` was 1 in memory, and the save on disk read `{"tAway":0,"away":0}` — so
     `resume`'s `closeAbsence` had nothing to close and a five-minute break landed in `tAnswer`
     (`tAnswer` 4,276 → 310,030 ms across a 300 s kill, and the end panel printed 2 % over a
     session that was 8 %). `{ immediate: true }` writes inside the handler, which is what
     `screens/boss.js` does for the study layer on the same event (`writeProgress(); flush();`).
     `tests/job-screen.test.mjs` lints this call site: a screen edit takes the property back
     silently, and the defect it re-opens is invisible in every test that does not unload a page. */
  /* …AND THE UPDATE ITSELF CAN MOVE THE GAME UNDER THE SCREEN (r5, number-truth, MAJOR). `store.js`
     runs `reconcileGameDay` BEFORE every mutation, so an `update()` that crosses local midnight
     drains the unbanked pile into the closing day and writes `live.pile = 0` / `live.streak = 1`.
     This handler's own `update()` is the one that reaches it with no reload — phone locked at 21:00
     on a face-down card, unlocked the next morning — and it never repainted: the strip went on
     printing `96 pile · ×5 streak` over an engine holding 0 and ×1, and two of the three calls were
     dead taps because `lockCall` catches `unaffordable` and returns without rendering. `resync()` is
     the repaint, and it is the last thing this handler does so the reading it paints is the one the
     reconcile left. */
  const onAway = () => {
    skipBeat();
    try {
      write((s) => {
        if (state.stateOf(s)) state.presence(s, { now: Date.now(), here: document.visibilityState === 'visible' });
      }, { immediate: true });
    } catch { /* a measurement is never worth a broken session */ }
    resync();
  };
  document.addEventListener('visibilitychange', onAway);
  window.addEventListener('pagehide', onAway);

  /* THE PROMISE COMES OFF THE STRIP THE INSTANT IT CANNOT BE KEPT (r5) — see `stripFor` and
     `earnableNow`. `screens/card.js` emits both events itself, at the two instants that make a clear
     un-clean: `card:wrong` from `chargeWrong` (the second attempt opening) and `card:hint` from
     `revealHint` (the ladder, including the H1 the card shows itself after a second miss). They are
     the TRIGGER only; the truth is read back off the card's own state, so neither event has to be
     believed. The handler adds no state to the game, writes nothing to disk and moves no number:
     it repaints one slot to hold one fewer thing. */
  const onSpent = () => {
    if (destroyed || spent || !view) return;
    spent = true;
    renderStrip(modelNow('answer'));
  };
  const offWrong = bus.on('card:wrong', onSpent);
  const offHint = bus.on('card:hint', onSpent);

  /* THE DAY CAN TURN WITH NOBODY TOUCHING ANYTHING (r5, number-truth, MAJOR). `store.js` rolls the
     day as a transaction of its own — on its own midnight clock, on the document coming back, on
     load, and ahead of every verb — and a roll DRAINS the unbanked pile into the closing day and
     puts the streak back to ×1. The screen was reading the store once per render and never hearing
     about any of that: measured at `96 pile · ×5 streak` on a face-down card over an engine holding
     0 and ×1, with all three calls drawn live and two of them refusing every tap. `binder.js`,
     `sheet.js` and `stats.js` have always subscribed; this screen is the one that prints the game's
     three numbers, so it is the one that could not afford not to.

     AND IT IGNORES ITS OWN WRITES, which is what makes a subscription safe here at all. Every store
     write this file makes goes through `write()` below, and `resync()` stands down for the length of
     one: a verb that repainted from inside its own `update()` would mount the question before the
     flip (`lockCall`) and would repaint the strip at the instant round 4 requires it to HOLD the
     pre-bid reading (`applyResult`). What is left to hear is exactly what this screen did not do. */
  offStore = subscribe(() => resync());

  setJobHeader(true);
  render();

  return () => {
    destroyed = true;
    clearTimeout(flipTimer);
    clearTimeout(tickTimer);
    clearTimeout(bankTimer);
    clearTimeout(settleTimer);
    clearTimeout(lossTimer);
    clearTimeout(bidlessTimer);
    document.removeEventListener('visibilitychange', onAway);
    window.removeEventListener('pagehide', onAway);
    offWrong();
    offHint();
    if (offStore) { offStore(); offStore = null; }
    /* LEAVING BY THE SCREEN'S OWN WAY OUT IS STILL LEAVING (r5, split-honesty, MAJOR). The absence
       was declared on `visibilitychange` / `pagehide` only, and `← Today` — which this screen draws
       on every face-down card, and which Home's own CTA resumes from — is a hash change inside one
       live document: neither event fires, the document never stops being visible, and the whole
       break landed in `tAnswer`. Measured on the shipped path, the same six questions with a 15 min
       break printed 3 % taken by the button against 17 % taken by the phone's home button, on the
       one number CUT-BRIEF asks the app to measure honestly and CUT-SPEC §8 hands its owner a
       decision about. The screen already knows: this closure IS the student leaving. So it declares
       the same bit `onAway` declares, through the same verb, with the same immediate flush — no new
       state, no duration (the engine derives the length itself), and no number on any surface.
       `resume` closes the absence on the way back in (`mountJob` above). A finished session has no
       record left (`endJob` → `finishPage`), so `stateOf` is null and this is a no-op. */
    try {
      write((s) => {
        if (state.stateOf(s)) state.presence(s, { now: Date.now(), here: false });
      }, { immediate: true });
    } catch { /* a measurement is never worth a broken teardown */ }
    destroyView();
    setJobHeader(null);
  };

  /* ================================================================================ render */

  /**
   * Hand the shell back its Readiness at the END of a session, once the game header has stepped
   * aside. It is not pushed DURING play: every read-out in the header is hidden then (`app.js
   * HDR_JOB_HIDE`), because the three numbers the game may print live in the strip below it.
   */
  function syncHeader() {
    try { const r = readiness(getState()); setHeader({ readiness: r.r, provisional: !!r.provisional }); } catch { /* keep */ }
  }

  /** ms since the interval opened, and reopen it. */
  function beat() {
    const t = Date.now();
    const ms = Math.max(0, t - beatAt);
    beatAt = t;
    return ms;
  }

  /** Close an interval this screen is NOT declaring a game decision. `job/state.js` attributes it to
   *  the answering half off its own clock; all this drops is the claim. */
  function skipBeat() { beatAt = Date.now(); }

  /**
   * EVERY STORE WRITE THIS SCREEN MAKES, and the one thing the wrapper adds: while it runs, the
   * screen is not listening to itself. `store.update()` notifies its subscribers synchronously,
   * inside the call, so without this the subscription above would repaint in the middle of a verb —
   * `lockCall` would mount the question before the flip, and `applyResult` would repaint the strip
   * at the instant `lossBeat` needs it to hold the reading the bid was made under. Each verb already
   * renders when it is done, from the state it left.
   */
  function write(fn, opts) {
    inVerb++;
    try { return update(fn, opts); } finally { inVerb--; }
  }

  /**
   * THE ENGINE MOVED WITHOUT THE SCREEN ASKING IT TO — repaint from the engine (r5, number-truth).
   *
   * `store.js update()` reconciles the day before every mutation, so any update at all can drain the
   * pile across local midnight; and a verb this screen calls can be REFUSED, which leaves the last
   * paint describing a state the engine no longer has. Both used to end with a stale strip on screen
   * and `console.warn` in a log nobody reads: `96 pile · ×5 streak` over an engine at 0 and ×1, with
   * `sure` and `pretty sure` drawn live and refusing every tap. CUT-BRIEF's hard limit is "no number
   * on any surface that is not exactly the number the engine computes", so the answer is to paint the
   * engine's own reading, which is all `render()` has ever done.
   *
   * IT DOES NOT PAINT OVER A BEAT. `settleBeat`, `lossBeat`, `bidlessBeat` and the bank receipt are
   * each holding a reading ON PURPOSE for a fixed duration, and each ends by rendering from the
   * engine anyway — so the stale span is bounded by the beat the student is already watching, and
   * cutting one short would undo the round-3 and round-4 fixes that put it there. NOTHING ELSE is a
   * reason to skip: a mounted question repaints its strip and keeps its card (`renderAnswer` returns
   * early when `view` is live).
   *
   * AND IT NEVER RUNS INSIDE ONE OF THIS SCREEN'S OWN WRITES (`write`, `inVerb`). That is not an
   * optimisation: `store.update()` notifies synchronously, `screens/card.js` writes several times
   * inside `finishClear()` before `onDone` reaches `applyResult`, and each of this file's verbs
   * renders itself when it is finished. A repaint from inside a verb is a repaint of a half-finished
   * state.
   */
  function resync() {
    if (destroyed || over || inVerb > 0) return;
    if (settling || lost || bankSay != null || bidless === 1) return;
    render();
  }

  function setPhase(p) { root.dataset.phase = p; }

  function render() {
    if (destroyed) return;
    if (over) return renderOver();
    const s = getState();
    const gv = state.stateOf(s);
    if (!gv) { navigate('/today'); return; }
    /* re-read while the session is live: a missed review requeues a Rematch onto the page, and the
       record `commitJobRun` files must carry it (`tests/job-ledger.test.mjs`). */
    const q = state.queueOf(s);
    if (q.length) jobQueue = q.slice();
    if (state.targetsLeft(s) === 0) return finish();
    if (settling) return settleBeat();
    if (flipping) return renderFlip();
    /* A QUESTION THE GAME WILL NOT PRICE STILL GETS A CARD — see `bidlessBeat`. It is checked
       before the card, for the reason the settle is: the beat cannot be drawn once the question is
       up, and `state.isBidless` is the engine's own name for the state it is drawn for.

       …WHEN THERE IS SOMETHING ON IT (integration, r4). Two round-4 fixes landed in the same round
       with opposite answers to "does a question with nothing to bid on get a card?": `renderCall`
       below stopped drawing one at an empty pile (`pay.js decides` — the dead tap), while this
       branch went on drawing one for every repeat. Measured in chromium on the shipped build
       (`qa/cut-integrator.mjs` §4): a repeat at an empty pile drew the card with THREE DEAD CALLS
       AND A DEAD BANK for `BANK_MS`, a screen with nothing live on it at all — the one shape that
       reads as broken rather than as a beat.

       ONE RULE, IN BOTH PLACES, AND IT IS THE PREDICATE THAT WAS ALREADY WRITTEN: `pay.js decides`
       is "more than one call is offered, OR there is a pile to bank", which is exactly "is any
       control on this card live" — and on a repeat, where `callsFor` is empty by construction, it
       is the bank clause alone that answers. So the card is drawn when the student can do something
       with it and the question arrives when he cannot, whether the seal is there or not. Nothing is
       added: a repeat carrying a pile keeps the beat, the skill and the reachable BANK this branch
       was written for (`notes/cut-screen.md` round 4, findings 4 and 7). */
    if (bidless !== 2 && state.isBidless(s) && decides(gv.pile, gv.streak)) return bidlessBeat();
    if (isObj(gv.call)) return renderAnswer();
    return renderCall();
  }

  /**
   * THE THREE SLOTS, and never a fourth.
   *
   * `data-form` is the third slot's caption, hoisted onto the root so the stylesheet can size the
   * band: `pays 27` carries none and the strip fits on one line (49 px), the marks carry
   * "you got this right" and take two (85 px). The screen states the form rather than letting the
   * stylesheet guess, because `--stack-top` — what the card's own sticky rail parks against — is
   * measured off it.
   *
   * THE MARKS SIT INSIDE THE VALUE, not beside it: the slot's line box is then the same 22 px strut
   * it has always been, so the band is the height it was measured at whatever the third slot is
   * holding — and the widest thing the slot can now print is `pays 50`, not the 106 px `10 of 10`
   * that used to push a 320 px phone 2 px into a horizontal scroll. The slot carries the WORD or the
   * ruler and never both (`stripFor`): `new` beside ten marks measured 108.7 px in an 88 px track on
   * the first session of every save that has no history yet.
   *
   * `data-bank` is the beat after a bank: the three slots step aside and the strip says what the
   * tap was worth. One line, one number, gone in `BANK_MS`.
   */
  function renderStrip(model) {
    if (!model) { strip.replaceChildren(); root.dataset.form = 'line'; delete root.dataset.bank; return; }
    if (model.say) {
      root.dataset.form = 'line';
      root.dataset.bank = 'true';
      strip.replaceChildren(h('p.job-say.mono', model.say));
      return;
    }
    delete root.dataset.bank;
    root.dataset.form = model.strip[2] && model.strip[2].caption ? 'stack' : 'line';
    strip.replaceChildren(...model.strip.map((sl) => h('div.job-slot', { dataset: { slot: sl.slot } },
      h('span.job-slot-v.mono', sl.value, sl.meter ? marksEl(sl.meter) : null),
      h('span.job-slot-k.fs-1.muted', sl.caption))));
  }

  /* A FUNCTION DECLARATION, NOT A `const`: `render()` runs during `mount()`, before the tail of this
     closure has been evaluated, so an arrow in a `const` sits in its temporal dead zone and the whole
     screen throws on its first paint. Every helper below `render()`'s call site is declared this way
     for the same reason, and `tests/job-screen.test.mjs` lints for it. */
  function skillOf(it) { return isObj(it) ? (it.skill ?? (it.skills || [])[0] ?? null) : null; }

  /**
   * The model for right now. The hit rate is `qHatDetail`'s, cut at `inProgress.game.call.at` while
   * a call is sealed — so a call is never weighed by its own outcome — and live again once the
   * question has been graded, which is why the slot can go back to the rate the moment it is over.
   */
  function modelNow(phase, skill = undefined) {
    const s = getState();
    const sk = skill === undefined ? skillOf(state.currentItem(s)) : skill;
    const detail = qHatDetail(s, sk, { cards: cardById });
    return viewModel(s, { phase, detail, skill: sk, banked: bankSay, earnable: earnableNow() });
  }

  /**
   * CAN THE QUESTION ON SCREEN STILL EARN WHAT THE BID BOUGHT? (r5 — see `stripFor`.)
   *
   * The game prices a CLEAN clear and nothing else: `js/xp.js isClean` is first try with no hint,
   * `screens/card.js` puts that bit on every result it grades, and `job/state.js cleanOf` reads it.
   * So the answer is the card's OWN state — `hints` revealed and `wrongs` charged, the two counts
   * `isClean` is computed from — read back off the controller `createCardView` hands out, never a
   * count this screen keeps of its own. `spent` is the bus's half of it: `card:wrong` and
   * `card:hint` say WHEN to look, this says what is there. Either alone is enough to take the
   * promise off, so a rename on one side cannot quietly put a false `pays N` back on the strip.
   *
   * With no question mounted there is no promise to withdraw, and the answer is true: the face-down
   * card, the flip and every beat print from the engine's reading exactly as they always did.
   */
  function earnableNow() {
    if (spent) return false;
    const st = view && view.state;
    if (!isObj(st)) return true;
    if (Math.max(0, Number(st.hints) || 0) > 0) return false;
    for (const n of Object.values(st.wrongs || {})) if ((Number(n) || 0) > 0) return false;
    return true;
  }

  /** The way out, off the model. One control, one word, and it is the same one in every phase. */
  function renderHead(model) {
    if (!model?.exit) { head.replaceChildren(); return; }
    head.replaceChildren(h('a.btn.job-quit', { href: model.exit.href },
      h('span.job-quit-arrow', { 'aria-hidden': 'true' }, '←'), h('span.job-quit-label', model.exit.label)));
  }

  /**
   * THE BID HE WALKED AWAY FROM, CHARGED WHERE HE CAN SEE IT.
   *
   * A wrong answer prints no string (CUT-SPEC §6) — the strip simply moves — and walking away from a
   * bid costs exactly what being wrong costs, so it gets exactly that rendering and no other. The
   * only thing it was missing was somewhere to happen: `settleAbandonedBid` ran inside the mount's
   * own `update()`, before the first paint, so the student came back to a strip that had already
   * been to zero. Round 3 measured the whole event as `0 / ×1` with "no string, no motion and no
   * warning before or after".
   *
   * So the three slots hold the reading the engine still has — the pile, the streak and the `pays N`
   * he bid for — for the beat the bank receipt gets, and then the bid settles and they move. It is
   * the SAME BEAT because it is the same job: the strip is saying something and the student has to
   * have time to read it.
   *
   * NOTHING HERE IS A NUMBER THE ENGINE HAS NOT GOT. The save still carries the bid for the length
   * of the beat, so `modelNow` prints the live state rather than a remembered one, and the settle
   * that ends the beat is the one in `settleAbandonedBid` — same price, same seal, same two writes.
   * The question is not mounted until it is over, so there is nothing to tap and no answer can land
   * against a bid that is about to be voided.
   */
  function settleBeat() {
    destroyView();
    setPhase('answer');
    const model = modelNow('answer');
    if (!model) { settling = false; return finish(); }
    renderHead(model);                                 // a bid is standing, so there is no way out to draw
    renderStrip(model);
    mountEl.replaceChildren();
    foot.replaceChildren();
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      if (destroyed) { settling = false; return; }
      try { write((s) => { settleAbandonedBid(s); }); }
      catch (e) { console.error('job: settling a walked-away bid', e); }
      /* AND THEN IT IS ON SCREEN WHILE IT MOVES (r5, player-feel, BLOCKER). Round 3 put the hold in
         front of the settle; the settle itself was still followed IN THE SAME FRAME by the next
         card, so the only instant the moved pile existed alone was the instant the question was
         painted over it. Driven on a phone viewport from `8 pile · ×2 streak · pays 18`, the whole
         event was legible only to a screenshot taken inside the first second. So the second half of
         `lossBeat`'s hold is taken here too, for the same reason and with the same two durations:
         the three slots move, they stand alone for `FLIP_MS`, and the card is built after them.
         No string (a loss prints none — CUT-SPEC §6), no fourth number, no tap, nothing new on disk.
         `settling` stays true across both halves so nothing can repaint over the beat. */
      renderStrip(modelNow('answer'));
      settleTimer = setTimeout(() => {
        settling = false;
        if (destroyed) return;
        skipBeat();                                    // waiting is not a decision: the answering half's
        render();
      }, FLIP_MS);
    }, BANK_MS);
  }

  /**
   * THE QUESTION THE GAME WILL NOT PRICE, GIVEN ITS OWN CARD — round 4 (exploit-hunt and
   * split-honesty, independently), and it is a hard limit coming back rather than a polish item.
   *
   * WHAT WAS BROKEN. `job/state.js isBidless` has always documented the screen's half of a
   * contract — "The screen asks this to route the question to its face-down beat instead of
   * straight into the card … and leaves BANK reachable … without the beat the student loses that
   * control for a whole question with nothing on screen to say why" — and the screen never asked:
   * `grep -rn isBidless site/` returned the definition and nothing else. `render()` was
   * `if (isObj(gv.call)) return renderAnswer()`, and a repeat's seal IS an object, so a requeued
   * review went straight into the card. Driven on the midweek fixture with every review thrown:
   * TEN CONSECUTIVE QUESTIONS with `phase=answer call=(sealed) bank=none`, and in the deliberate
   * session eight of them stood at `pile 8 ×2` — three minutes with 8 points on the table and no
   * control on screen to take them. CUT-BRIEF's hard limit is "Banking is a third control that is
   * always available and never required"; the build already reads that down to "available on the
   * face-down card", and a question with no face-down card left nothing of it at all.
   *
   * WHAT IT IS. The same card, with the bid taken out of it: the skill, the drawn rate, the three
   * calls GREYED (`callsFor` returns none over a seal, so the model greys them without being told
   * to, and they wear the dashed cue an unaffordable call already wears), BANK live — `bank()`
   * permits it over a bidless seal — and the way out, which is free here because no bid is
   * standing. Then it turns over, on the flip every other question gets.
   *
   * WHAT IT COSTS, AND WHAT IT DOES NOT. No new number (the strip is the same three slots), no new
   * word (every string is the card's own), no new control, and no new tap: the beat ends on its own
   * clock. `requiredTapsOf` reads 0 here, which is the truth — a repeat asks for the answer and
   * nothing else — and the whole interval is handed to the answering half (`skipBeat`), because a
   * beat the student did not ask for must never flatter the game's share of the session.
   */
  function bidlessBeat() {
    destroyView();
    const s = getState();
    if (!isObj(state.currentItem(s))) return finish();
    const model = modelNow('call');
    if (!model) return finish();
    bidless = 1;
    setPhase('call');
    renderHead(model);
    renderStrip(model);
    mountEl.replaceChildren(faceDown(model));
    foot.replaceChildren(...[bankBtn(model)].filter(Boolean));
    /* nothing here is a call, so nothing here is focused: the one live control is bank, and a card
       that put the keyboard on it would bank the pile on the next Return the student pressed */
    skipBeat();
    clearTimeout(bidlessTimer);
    bidlessTimer = setTimeout(() => {
      bidless = 2;
      if (destroyed) return;
      flipBeat();
    }, BANK_MS);
  }

  /* ---- the face-down card: the skill, your rate, and the three calls ---- */
  function renderCall() {
    destroyView();
    const s = getState();
    if (!isObj(state.currentItem(s))) return finish();
    /* THE GAME DOES NOT ASK WHEN THERE IS NOTHING TO ASK (r4, player-feel — CROSS-LANE, engine,
       notes/cut-engine.md §R3).

       At an empty pile the table offers one call and nothing can be lost on it, and bank has nothing
       to take: the card carried ONE live control with ONE possible value, and the question would not
       appear until the student tapped it. That is on the first card of every session, after every
       bank, and after any miss that empties the pile, most of them for the student who is getting
       most of them wrong. `job/pay.js decides` is the engine's own answer to "is there a decision on
       this card"; where there is none, the one call there is is locked here and the question
       arrives, one tap for that question instead of two.

       HOW OFTEN, MEASURED RATHER THAN QUOTED (r5, player-feel, MAJOR). This comment used to say
       "29–41 % of the cards of a session", and that is not a range the shipped table produces at any
       hit rate. Simulated over the SHIPPED `decides` / `offered` / `payOf` / `costOf` across a
       twelve-question session of honest calling, `decides` is false on 8.5 % of the cards at
       q = 0.99 and 30.8 % at q = 0.35 with the student never banking, and on 8.5 % to 49.4 % when he
       banks by CUT-SPEC §4 — banking empties the pile, so the card after a bank has nothing on it to
       decide. AND CARD 1 OF EVERY SESSION IS ONE OF THEM, always: a session opens at pile 0 ×1,
       `offered(0, 1)` is `['not sure']` alone and `decides(0, 1)` is false, so the bid-on-yourself
       beat — the first of CUT-BRIEF's two surviving ideas — never introduces itself.

       IT IS NOT FIXED HERE, AND THAT IS A DECISION. The two remedies are the engine's (open a
       session at `BASE_PAY`, so the ladder is live on card 1) and the brief's (Session shape should
       admit that 1 in 8 to 1 in 2 of its questions carry no decision). The only screen-side one is
       to draw the card anyway: either with its single live control, which is the round-4 dead tap
       coming back, or on a beat with no tap, which is padding the session with waiting — the one
       remedy CUT-BRIEF's Session shape forbids by name. Filed for both owners in
       `notes/cut-screen.md`, Requests, round 5.

       IT DECLARES NO DECISION: `ms: 0`, because the student made none, so the split meter cannot be
       flattered by a card it did not ask about. The beat is not skipped either — `skipBeat()` hands
       the interval up to here to the study half, exactly as the flip is handed to it. */
    const gv = state.stateOf(s);
    if (gv && !isObj(gv.call) && !decides(gv.pile, gv.streak) && bankSay == null && lockOnly()) {
      render();
      return;
    }
    const model = modelNow('call');
    if (!model) return finish();
    setPhase('call');
    renderHead(model);
    renderStrip(model);
    mountEl.replaceChildren(faceDown(model));
    foot.replaceChildren(...[bankBtn(model)].filter(Boolean));
    /* the face-down card is up: the game's own interval opens here */
    skipBeat();
    focusFirst(mountEl, '.job-call:not([disabled])');
  }

  /**
   * THE CARD ITSELF, and there is only one of it. A question the game will not price gets the same
   * panel as one it will, with the three calls greyed by the model rather than by a second builder:
   * two card builders is how the shipped screen came to have a state with no card at all.
   */
  function faceDown(model) {
    const row = h('div.job-calls');
    for (const c of model.calls) {
      row.append(h('button.job-call', {
        type: 'button',
        disabled: !c.enabled || null,
        dataset: { call: c.id },
        onclick: () => lockCall(c.id),
      }, h('span.job-call-l', c.label)));
    }
    const panel = h('div.job-panel.job-face-down');
    return add(panel, h('p.job-skill', model.skill), row);
  }

  /** BANK — on the face-down card, never required, and it never advises. */
  function bankBtn(model) {
    if (!model?.bank) return null;
    return h('button.btn.job-bank', {
      type: 'button',
      disabled: !model.bank.enabled || null,
      onclick: () => doBank(),
    }, model.bank.label);
  }

  /**
   * THE ONLY CALL THERE IS, LOCKED WITHOUT ASKING — the card `pay.js decides` says has no question
   * on it (see `renderCall`). Returns whether it landed; where it does not, the face-down card is
   * drawn as it always was and the student taps, which is the behaviour this replaces.
   *
   * `ms: 0` IS THE POINT. No decision was made, so none is declared, and the interval up to here
   * goes to the study half with the rest of the undeclared time (`skipBeat`). A screen that booked
   * this card's dwell as a game decision would be padding the measured split with a card the game
   * never asked about — the one thing CUT-BRIEF's session shape forbids outright.
   */
  function lockOnly() {
    skipBeat();
    let locked = false;
    try {
      write((s) => {
        const only = state.callsFor(s)[0];
        if (!only) return;
        state.call(s, only, { now: Date.now(), ms: 0 });
        locked = true;
      });
    } catch (e) { console.warn('job: the only call was refused', e); }
    return locked;
  }

  function lockCall(id) {
    if (flipping) return;
    clearTimeout(bankTimer);
    bankSay = null;                    // the beat is over the moment the next bid is made
    const ms = beat();
    /* A REFUSAL IS A READING, NOT A WARNING (r5). The engine turns a call down for exactly one
       reason the student can be looking at — the pile no longer covers it — and the commonest way
       to get there is the midnight roll inside `update()` itself. Repainting is what tells him;
       returning without one leaves the number that was refused still on screen and still tappable. */
    try { write((s) => { state.call(s, id, { now: Date.now(), ms }); }); }
    catch (e) { console.warn('job: call refused', e); resync(); return; }
    /* THE BEAT. The strip prints what the call bought the instant it lands; the card turns; the
       question arrives after it. Nothing is tapped in between. */
    flipBeat();
  }

  /** The card turns and the question arrives behind it. One beat, one duration, two callers: the
   *  call that bought the question, and the repeat the game would not sell. */
  function flipBeat() {
    flipping = true;
    clearTimeout(flipTimer);
    render();
    flipTimer = setTimeout(() => {
      flipping = false;
      if (destroyed) return;
      skipBeat();                      // the flip is the student waiting: the answering half's
      render();
    }, reduceMotion() ? 0 : FLIP_MS);
  }

  function renderFlip() {
    const model = modelNow('flip');
    if (!model) return finish();
    setPhase('flip');
    renderHead(model);
    renderStrip(model);
    const panel = mountEl.querySelector('.job-face-down');
    if (panel) {
      panel.dataset.flip = 'true';
      for (const b of panel.querySelectorAll('button')) b.disabled = true;
    }
    /* bank stays on the beat so the strip does not jump, GREYED because the engine would refuse it:
       the model says so (`viewModel`), and the DOM must not disagree */
    foot.replaceChildren(...[bankBtn(model)].filter(Boolean));
  }

  /**
   * BANK. The tap that used to be indistinguishable from getting a question wrong — both numbers to
   * the floor, no string, no motion, nothing — and is now the one moment the app answers the student
   * with a sentence: for `BANK_MS` the three slots step aside and the strip says `today N points`,
   * `state.bank`'s own running total. It is not advice and it is not praise; it is a receipt.
   */
  function doBank() {
    const ms = beat();
    let banked = null;
    try { write((s) => { banked = state.bank(s, { now: Date.now(), ms }); }); }
    catch (e) { console.warn('job: bank refused', e); resync(); return; }
    skipBeat();
    bankSay = banked ? banked.today : null;
    clearTimeout(bankTimer);
    bankTimer = setTimeout(() => {
      bankSay = null;
      if (destroyed) return;
      /* the beat only ever covered the face-down card; if the student has moved on, it is already
         gone and the strip they are looking at is the one that phase drew.

         IT RE-RENDERS RATHER THAN RE-STRIPS (r4, engine): banking empties the pile, and an empty
         pile is a card with nothing to decide on it (`renderCall`), so the receipt is followed by
         the question rather than by a face-down card holding one dead control. Redrawing the strip
         alone would have left that card up with the receipt's own state underneath it. */
      if (root.dataset.phase === 'call') render();
    }, BANK_MS);
    /* the pile and the streak moved, so the calls and their prices moved with them — an empty pile
       greys two of the three. Re-read, never re-use: everything on screen is `state`'s at this
       instant and no other. */
    if (view) { renderStrip(modelNow('answer')); return; }
    render();
  }

  /* ---- the question: screens/card.js, mounted as-is ---- */
  function renderAnswer() {
    const s = getState();
    const gv = state.stateOf(s);
    const it = state.currentItem(s);
    if (!isObj(it) || !isObj(gv?.call)) { render(); return; }
    /* A NEW QUESTION IS A NEW PROMISE. `spent` has to outlive the card it belongs to — the graded
       frame and `lossBeat` both hold the strip after `destroyView()` — so it is cleared here, at the
       one instant a question with no card mounted is about to get one, and never at the grade. */
    if (!view) spent = false;
    const model = modelNow('answer');
    setPhase('answer');
    renderHead(model);
    renderStrip(model);
    foot.replaceChildren();                            // bank is not on the question — see `viewModel`
    if (view) return;                                  // already mounted for this question
    let source;
    try { source = sourceFor(it); }
    catch (e) {
      console.error('job: cannot build the question', it, e);
      return applyResult({ id: it.id, cleared: false, skipped: true, reason: 'broken', attempt: 3, hints: 0 });
    }
    mountEl.replaceChildren();
    view = createCardView(mountEl, source, {
      kind: it.kind === 'variant' ? 'variant' : 'card',
      review: it.isReview ? true : null,
      rematch: !!it.isRematch,
      drill: false,
      forCard: it.forCard ?? null,
      back: '/today',
      mode: 'card',
      hints: true,                                     // COMPOSED global rule 1 — always, everywhere
      rename: null,
      onDone: (r) => applyResult(r),
      /* the student is done with this question: if it took the pile, he watches it go before the
         next card is built (`lossBeat`) */
      onContinue: () => { destroyView(); if (lost) return lossBeat(); render(); },
    });
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
    /* the question is up. Nothing from here to the grade is a game decision, so this screen declares
       nothing and `job/state.js` books the whole interval — the flip and the build with it — to the
       answering half. */
    skipBeat();
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

  /**
   * The grade, priced. `state.answer` writes the pile and hands the result to the study layer; a
   * wrong answer prints NO STRING AT ALL (CUT-SPEC §6) — the strip simply moves.
   */
  function applyResult(result) {
    const ms = beat();
    /* the question's own skill, read BEFORE the answer lands: `state.answer` advances the queue, and
       the slot the student is looking at belongs to the question they just answered */
    const skill = skillOf(state.currentItem(getState()));
    let r = null;
    try { write((s) => { r = state.answer(s, result, { now: Date.now(), ms }); }); }
    catch (e) { console.error('job: answer', e); return; }
    /* whatever beat THIS question got, the next one gets its own */
    bidless = 0;
    /* THE PILE HE JUST LOST IS HELD UNTIL HE IS LOOKING AT IT — round 4 (player-feel, MAJOR), and
       it is the second of the two surviving ideas failing at the moment it is supposed to land.
       Measured: at `96 pile · ×5 streak · pays 50` a missed `sure` took the pile to 28, and the
       whole event was a 22 px numeral changing inside a 68 px band at the top of the viewport, no
       motion, while the eye was on the grader's red feedback 600 px lower down. "Your streak is a
       pile you can lose" with nothing to see at the instant it is lost is not that idea.
       So the strip does not repaint here. It goes on saying what it said when the bid was made —
       the engine's OWN `pileBefore`, `streakBefore` and `pay` off this very return value, not a
       remembered render — and it settles on `lossBeat()`, alone on the screen, the moment the
       student taps Continue. Same hold, same duration and same two slots as the beat a walked-away
       bid already gets (`settleBeat`); no word, no fourth number, no tap, nothing new on disk. */
    const fell = !!view && !!r && typeof r.call === 'string'
      && (r.pile < r.pileBefore || r.streak < r.streakBefore);
    lost = fell ? { pile: r.pileBefore, streak: r.streakBefore, call: r.call, pay: r.pay } : null;
    /* the seal is released, so the rate is live again and now counts this answer — the same count,
       from the same function, never a second number invented for the moment after a grade */
    if (!fell) renderStrip(modelNow('answer', skill));
    /* THE ONE NUMBER THAT ANIMATES, and only when it climbs. A wrong answer sets the streak to ×1
       and says nothing at all: no near-miss praise, no punishment, no "one more". */
    if (r && r.streak > r.streakBefore) tick();
  }

  /**
   * THE PILE GOING, WATCHED. The student has tapped Continue, so the question is off the screen and
   * the strip is the only thing on it — which is the whole of the fix: the event is not louder, it
   * is somewhere the student is looking, and it is not sharing the instant with the grader.
   *
   * IT HOLDS THE ENGINE'S OWN NUMBERS, never a remembered render: `state.answer` returns
   * `pileBefore`, `streakBefore` and the `pay` it priced this question at, and those three are what
   * the strip printed while the question was up. Then they are replaced by `modelNow`'s — the live
   * reading, the same function every other phase prints from — and a beat later the next card is
   * built. Nothing is animated: CUT-BRIEF gives the streak the only moving number in the layer, and
   * this is the strip taking a moment, which is what it is allowed to do.
   *
   * THE HEAD STAYS EMPTY through it. A bid was standing when the question was up, so there was no
   * way out drawn over it; drawing one for the length of the beat would push the strip 60 px down
   * the screen at the exact instant the student is being asked to look at it. It is back on the
   * next face-down card, which is one beat away.
   */
  function lossBeat() {
    const r = lost;
    if (!r) { render(); return; }
    setPhase('answer');
    head.replaceChildren();
    mountEl.replaceChildren();
    foot.replaceChildren();
    /* `earnable: earnableNow()` — the beat holds what the strip was holding, and after a fall that
       is never `pays N`: a fall means the clear was not clean (or was not a clear), and the promise
       came off at the second attempt or the first hint, before the grade (r5 — see `stripFor`). The
       flag is read rather than assumed so the held frame and the frame before it cannot disagree. */
    renderStrip({ say: null, strip: stripFor({ pile: r.pile, streak: r.streak, call: r.call, pay: r.pay }, null, { earnable: earnableNow() }) });
    clearTimeout(lossTimer);
    lossTimer = setTimeout(() => {
      lost = null;
      if (destroyed) return;
      renderStrip(modelNow('answer'));                 // …and it moves, with nothing beside it
      lossTimer = setTimeout(() => {
        if (destroyed) return;
        skipBeat();                                    // watching is not a decision: the answering half's
        render();
      }, FLIP_MS);
    }, BANK_MS);
  }

  function tick() {
    const el = strip.querySelector('[data-slot="streak"]');
    if (!el) return;
    clearTimeout(tickTimer);
    el.dataset.tick = 'true';
    tickTimer = setTimeout(() => { try { delete el.dataset.tick; } catch { /* gone */ } }, TICK_MS);
  }

  /* ---- the end: today's points, the best day, the measured split, and Today ---- */
  function finish() {
    if (over) return renderOver();
    /* THE CLOSING INTERVAL IS THE LAST WORKED SOLUTION BEING READ, and it is handed over as exactly
       that: `state.endJob` books it to the ANSWERING half, the same half the identical interval goes
       to on every other question of the session. It used to be banked as GAME time — the one
       interval of the session that was — and on a measured two-question run that alone printed
       `54 % of this session was the game` over a session that was 21 % game. */
    const ms = beat();
    const now = Date.now();
    try { write((s) => { over = state.endJob(s, { now, ms }); }); }
    catch (e) { console.error('job: endJob', e); navigate('/today'); return; }
    /* THE SESSION CLOSED A PAGE, SO IT RECORDS A PAGE — `runs[]`, the forecast point and the daily
       goal, exactly as `#/run/page`'s own `finish()` files them (`screens/run.js`). */
    try { commitJobRun(getState(), { queue: jobQueue, before, now }); }
    catch (e) { console.error('job: commitJobRun', e); }
    setJobHeader(null);
    syncHeader();
    renderOver();
  }

  function renderOver() {
    destroyView();
    setPhase('over');
    strip.replaceChildren();
    foot.replaceChildren();
    const model = viewModel(getState(), { over });
    renderHead(model);                                 // …which takes the way out off: the panel's own primary IS Today
    const panel = h('div.job-panel.job-over');
    add(panel,
      h('p.job-over-today.mono', model.lines[0]),
      ...model.lines.slice(1).map((l) => h('p.job-over-line.fs-1.muted', l)),
      h('div.run-actions', h('a.btn.btn-primary', { href: '#/today' }, model.primary)),
    );
    mountEl.replaceChildren(panel);
    focusFirst(mountEl, '.btn-primary');
  }

  function focusFirst(scope, sel) {
    try { scope.querySelector(sel)?.focus?.({ preventScroll: true }); } catch { /* no focus to give */ }
  }
}

/* ==================================================================== the one drawn quantity */

/**
 * THE HIT RATE AS MARKS — `hitMeterOf`'s three counts, one mark each, and not a numeral between
 * them. Filled for a clear, STRUCK for a miss (`css/job.css` draws the bar through it; hit and miss
 * differ in shape, not only in hue, or a red-green student reads two-of-three as three-of-three),
 * empty for a sitting the student has not had: the denominator is drawn at full width whether or
 * not it is full, so one mark in ten cannot be read as the ten-in-ten that `1 of 10` was being
 * mistaken for.
 *
 * It is drawn, but it is not silent: a student on a screen reader gets `qHatDetail`'s own count in
 * CUT-SPEC §6's own words (`COPY.hits`), which is the same information and no new vocabulary. With
 * no history at all the slot prints `new` and this row is not built at all (`stripFor`) — ten empty
 * marks beside the word said nothing twice and overflowed a 320 px phone doing it.
 *
 * AND THE SITTINGS HE HAS NOT HAD ARE NOT IN THE ROW HE READS — round 4 (number-truth, MAJOR).
 * The ten marks were one shape in one row, so the fraction the eye took was `hits / 10` when the
 * engine's own was `hits / of`, and on the shipped fixture EVERY reading had `of < 10`: 2 of 3,
 * 9 of 9, 5 of 5, 4 of 7, 3 of 5, 7 of 7, 2 of 2, 7 of 8, 5 of 8. Fed to the shipped `honestCall`,
 * four of those nine point at a different call drawn than they do measured — `5 of 5` is `sure` and
 * `5 of 10` is `not sure` — on the one surface the design's central theorem depends on.
 * So the `of`-th mark ENDS the row: what follows is smaller, it is set off by a break wider than
 * the row's own gap (`css/job.css`), and the eye takes the run of full marks as the denominator it
 * is. Nothing is dropped — a perfect record off one sitting still cannot be drawn as one off ten,
 * which is the round-2 finding this must not undo — and no numeral appears either way.
 */
function marksEl(m) {
  const marks = [
    ...Array.from({ length: m.hits }, () => 'hit'),
    ...Array.from({ length: m.misses }, () => 'miss'),
    ...Array.from({ length: m.empty }, () => 'none'),
  ];
  const named = m.of > 0
    ? { role: 'img', 'aria-label': COPY.hits({ hits: m.hits, of: m.of }) }
    : { 'aria-hidden': 'true' };
  /* `i === m.of` is the first sitting the student has not had: the break goes in front of it, and
     only when there is one, so a full window is the unbroken row it has always been. */
  return h('span.job-marks', named, marks.map((k, i) => h('i.job-mark', {
    dataset: i === m.of && m.of > 0 && m.empty > 0 ? { mark: k, edge: 'true' } : { mark: k },
  })));
}

/** The student asked for less motion: the beat becomes a cut, and nothing scales. */
function reduceMotion() {
  try { return !!window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}
