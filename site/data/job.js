// site/data/job.js — THE GAME: every constant of the game layer, in ONE place.
//
// AUTHORITY: designs/CUT-BRIEF.md and designs/CUT-SPEC.md. BUILD-POLICY.md overrides both.
//
// The game is two ideas: you bid on yourself before you see the question, and your streak is a pile
// you can lose. There is nothing else, so there is almost nothing here. The payoff table itself is
// `site/js/job/pay.js` (CUT-SPEC §2); this file holds the save schema, the copy and the two dates
// the week still cares about.
//
// DEMOLITION (notes/DEMOLISH.md): 1,308 lines → this. The ladder, the loot rows, the chain, the fee,
// the tell, the cold multiplier, the scope mirror, the ×2, the decline price, the credit ladder, the
// call levels, the rating and its bands, the ranks, the Elo pair, the guard, the vault grades, the
// crew and its matrix, the shapes, the phases, the board, the Backcheck, the Fault Index, the caps,
// the save budget, the fourteen nouns, the seven verbs and the whole COPY table went with the
// mechanics they priced (CUT-BRIEF "What is DELETED").
//
// RULES FOR THIS FILE
//   · data only. No DOM, no random draw, no imports at all.
//   · every export is deeply frozen; nothing here is mutated at runtime.
//   · every string a student can see is here or in `job/pay.js BANDS`, and nowhere else. CUT-SPEC §6
//     is the whole vocabulary: not on that list, not in the app.

const freeze = (o) => Object.freeze(o);
/** deep-freeze a plain object/array tree (data only — no class instances here) */
function deep(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    for (const v of Object.values(o)) deep(v);
    Object.freeze(o);
  }
  return o;
}

/* ==========================================================================================
   The hit rate
   ========================================================================================== */

/** CUT-SPEC §5 — the face-down card prints `hits of of` over this many sittings of the skill. */
export const QHAT = freeze({ window: 10 });

/* ==========================================================================================
   The session, and its measured split
   ========================================================================================== */

/**
 * CUT-BRIEF "Session shape" — the target band for the MEASURED share of wall clock spent on game
 * decisions. The app measures its own split and prints the measured number, never a claimed one; if
 * the honest measurement comes in under `lo`, the fix is fewer, harder questions — never padding.
 */
export const SPLIT = freeze({ lo: 45, hi: 55 });

/* ==========================================================================================
   The week — the two clock rules COMPOSED already had
   ========================================================================================== */

/* ONE rule, because one rule is read. `schoolWindow` went with `plan.inSchoolWindow` and
   `boardPolicy().school` (notes/cut-home.md R5): nothing under site/, tests/ or qa/ ever read it,
   and COMPOSED names no school-hours rule — it arrived with the deleted layer's week. */
export const WEEK = freeze({
  /** after this local hour no new session starts; the one in progress finishes where it started */
  quietHour: 22,
});

/* ==========================================================================================
   The save
   ========================================================================================== */

/**
 * The game's two top-level save keys, and every field in them. Mirrored by `store.js`'s
 * `freshPlayer()` / `freshGame()`; `tests/job-save.test.mjs` deep-equals the two copies in both
 * directions, so neither can grow a field the other does not have.
 *
 *   player.best   the best single day, in points. It is the ONLY thing a point buys.
 *   game.today    points banked today; `game.day` is the day they were banked on.
 */
export const SAVE_DEFAULTS = deep({
  player: { best: 0 },
  game: { today: 0, day: null },
});

/**
 * `inProgress.game` — the mid-session resume record, in serialisation order. The seed is pinned, so
 * re-opening a session cannot re-roll anything.
 *
 *   pile      the unbanked pile
 *   streak    the multiplier, 1…5
 *   call      the call sealed for the current question — `{ id, at }` — or null
 *   answered  how many questions have been answered
 *   tGame     ms spent on game decisions   ┐ the split meter, and the only clocks in the layer.
 *   tAnswer   ms spent answering           ┤ No payoff term reads any of them (CUT-BRIEF math #7).
 *   tAway     ms the app was not in use    ┘ …and nothing prints this one.
 *   away      1 while the app is away, 0 while the student is here — a bit, never a duration
 *   seed      the session's pinned seed
 *
 * THE THIRD CLOCK, and why it is on the disk. `tGame + tAnswer` is the share the end panel prints,
 * and CUT-BRIEF asks for that share to be "of this session". A tab that is hidden, backgrounded or
 * closed is not a session being played, so the span it covers belongs to NEITHER half — and it is
 * banked here instead, where no surface reads it. `away` is what makes it survive a killed tab: the
 * time the student WAS here is booked before the bit is set, so a session that never comes back has
 * already closed its own books, and the absence that follows is whatever the clock says it was when
 * the session is opened again — hours later, or never.
 */
export const IN_PROGRESS_KEYS = freeze([
  'pile', 'streak', 'call', 'answered', 'tGame', 'tAnswer', 'tAway', 'away', 'seed',
]);

/* ==========================================================================================
   Every string — CUT-SPEC §6. Not on this list, not in the app.
   ========================================================================================== */

export const COPY = deep({
  pile: 'pile',
  streak: 'streak',
  /** the third slot's caption before the call is in */
  hitRate: 'you got this right',
  /** …and what it reads with no history */
  none: 'new',
  /** …and after the call is in */
  pays: ({ n }) => `pays ${n}`,
  /**
   * `7 of 10` — a count, never a percentage (`of` can be under 10). NOT PRINTED ON THE STRIP: the
   * face-down card DRAWS the rate as one mark per sitting, and this string is that row's
   * `aria-label`. A ratio is two digit-runs and the strip may print three numbers in total, so the
   * only place a numeral could go here is the one CUT-BRIEF's hard limit closes. See
   * `screens/job.js hitLineOf` / `marksEl`.
   */
  hits: ({ hits, of }) => `${hits} of ${of}`,
  bank: 'bank',
  /** the primary button after a session. The app never says "one more". */
  today: 'Today',
  todayPoints: ({ points }) => `today ${points} points`,
  best: ({ points }) => `best ${points}`,
  /** the MEASURED share, printed after the session and never before it */
  split: ({ percent }) => `${percent} % of this session was the game`,
  /** Settings only */
  settings: deep({
    title: 'The game',
    on: 'on',
    off: 'off',
    /**
     * NOT "a call the pile cannot cover" (integration, r4 — `notes/cut-screen.md` round 4 finding 5,
     * a MAJOR no lane owned the file for). "call" is a noun the app uses NOWHERE a student can see
     * it — the three buttons say `not sure` / `pretty sure` / `sure` and nothing ever tells him they
     * are called anything — and "cover" is the finance sense of "afford". Two words to teach, in the
     * one line that exists to explain a greyed button, against CUT-BRIEF's "no word a 14-year-old
     * would have to be taught". This says the same thing in the words the buttons already use.
     */
    greyed: 'you can only pick one your pile can pay for',
  }),
});
