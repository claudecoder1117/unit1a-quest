// job/board.js — J5. TONIGHT'S BOARD: what is posted, what a draft costs, and the job it builds.
//
// COMPOSED-GAME G1 ("What a contract is", "The first 90 seconds"), G3.6 (the ×2 posting), G3.7 proof 7
// (critical replication and draft-time dedupe), G3.8 #6 (the vault), G4 (supply and the thin board).
//
// DOM-free and clock-free in the payoff sense (G3.7 proof 5): the only `Date.now()` here is the
// board's truthful `ends HH:MM` and the `drawnAt` stamp, neither of which enters any payoff term.
// Nothing in this file writes to a save — the callers (`job/state.js`, `screens/job.js`) own the
// writes, and nothing here marks, drops or re-schedules a study item (COMPOSED Global rule 5).
//
// The partition itself lives in `page.js` beside the composer that produced the queue
// (`composeBundles` / `draftUnion` / `jobBudget`, all additive — `composePage` is untouched).
// This file is the board around it: the shape, the pinned seed, the ×2 marks, the guard's support,
// the recommendation the primary button pre-drafts, the decline price, the vault and `inProgress.game`.

import {
  composeBundles, draftUnion, jobBudget, bossReady,
  JOB_BUNDLE_IDS, JOB_WINGS_MIN, coverageOf, criticalReplicationFor,
} from '../page.js';
import { composeOpts as planComposeOpts } from '../plan.js';
import { rngFrom } from '../rng.js';
import { todayISO, timeHM, daysUntilTest } from '../days.js';
import { overdueDays as overdueDaysOf } from '../schedule.js';
import { isCleared } from '../readiness.js';
import { cards as ALL_CARDS, byId as cardById } from '../../data/cards.js';
import { isBonus } from '../../data/source-manifest.js';
import {
  SHAPES, SHAPE_IDS, BOARD, COPY, DECLINE_PRICE, X2, CAPS, WING_OF_SKILL,
  PHASE_MEANS_DEFAULT, ANSWER_MINUTES_PER_TIER, DECISION_SECONDS, SPLIT, FIXED_PHASES,
} from '../../data/job.js';
import { round } from './econ.js';
import {
  guardDist, guardBars, drawGuard, pressAdvice, wingValues, wingOf,
  rankOf, guardMultFor, vaultGradeFor,
} from './guard.js';

export { SHAPES, SHAPE_IDS, BOARD, DECLINE_PRICE };

/** G3.8 #6 — the vault is the most-overdue tier-3/4 ORIGINAL you have cleared. */
export const VAULT_TIERS = Object.freeze([3, 4]);

const num = (x, d = 0) => (Number.isFinite(x) ? x : d);
const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const runKind = (r) => String(r?.kind ?? '').split(':')[0];

/* ================================================================= the ×2 posting */

/**
 * x2Marks(dateISO, jobIndex, targets) → the day's ×2 marks: an INDEPENDENT `p = 1/6` per target,
 * seeded `cyrb53(dateISO|jobIndex|targetIndex)` exactly as G3.6 defines it. The vector is computed
 * for the shape's target indices BEFORE the draft, so the realised count is on the board and the
 * mark is on the envelope before the call (G3.6, G11 "the ×2 is marked *before* the choice").
 * @returns {boolean[]} one flag per target index
 */
export function x2Marks(dateISO, jobIndex, targets) {
  const out = [];
  for (let i = 0; i < targets; i++) out.push(rngFrom(dateISO, jobIndex, i).next() < X2.p);
  return out;
}

/* ================================================================= the day's job index and seed */

/**
 * Which job of the day this is — the second half of the ×2 seed (G3.6: "seeded per JOB INDEX, not per
 * day, so after job 1 the placement is not already known"). Counts finished job runs and logged jobs.
 *
 * ONLY A JOB THAT ANSWERED SOMETHING COUNTS (`targets > 0`). `state.endJob` writes a log entry for
 * every outcome, a zero-target walk included, and the day's seed hangs off this index — so counting
 * walks made WALK-scumming free: one keystroke at the board re-rolled the guard wing, the bundle
 * partition, the ×2 placement and the posted value, at a cost of nothing. Twelve walks on one save
 * gave twelve distinct seeds, ×2 counts from 0 to 5 and posted 177…279; an arm that walked until the
 * board showed ≥ 3 ×2 marks averaged posted 319 against 225 for taking the first board
 * (notes/board-fix.md §6). G3.7 proof 6 says "no reroll exists", and the pinned seed only ever
 * defeated RELOAD-scumming; this is what closes the other half.
 *
 * EXACTLY WHAT IT CLOSES, IN WORDS THAT ARE TRUE OF THE CODE (round 3, exploit-hunt). A walk that
 * answered NOTHING re-posts the byte-identical board: the index does not move, so neither does the
 * seed, the partition, the guard draw, the ×2 placement or the posted value (eight consecutive walks,
 * asserted in `tests/job-board.test.mjs` "WALK-SCUMMING IS DEAD"). A walk that ANSWERED A TARGET is
 * a job on record and the index DOES move: on corpus save 6 the recommended draft goes from posted
 * 290 to 452, and best-of-16 over a day's indices is worth +46…62 % of the first board's posted
 * value. That is not a leak in this function — G3.6 seeds the ×2 per job index precisely so that
 * "after job 1 the placement is not already known" (G12 #30), and the guard lane uses the same
 * criterion for its own held wing ("one answered target ends the hold", tests/job-guard.test.mjs).
 * What stops a student walking the board round by round is the JOB THEY STARTED: its targets came
 * off Today's Page, so `state.startJob` refuses the next one with `page-in-progress: 9 left on
 * Today's Page` until the residue is cleared by hand — nine unstaked answers per reroll, measured.
 * So "no reroll exists" is true of the pin and of the zero-target walk, and the partial walk is held
 * by that refusal and its toll rather than by the seed. The test below says so in the shipped path,
 * and notes/repair-board.md carries the spec correction (finding 23).
 */
export function jobIndexFor(save, today = todayISO()) {
  const answered = (x) => !(Number.isFinite(x?.targets) && x.targets <= 0);
  let runs = 0;
  for (const r of save?.runs ?? []) {
    if (runKind(r) !== 'job') continue;
    if (r.startedAt != null && todayISO(new Date(r.startedAt)) === today && answered(r)) runs++;
  }
  let logged = 0;
  for (const e of save?.game?.log ?? []) if (e?.day === today && answered(e)) logged++;
  return Math.max(runs, logged);
}

/**
 * The PINNED job seed (G3.7 proof 6 — re-opening may not re-roll the guard draw, the bundle partition
 * or the ×2 placement). Everything random in a job hangs off this string and the day.
 */
export function jobSeedFor(save, today = todayISO(), jobIndex = 0) {
  return `job|${save?.profileId ?? 'anon'}|${today}|${jobIndex}`;
}

/* ================================================================= the shape */

/**
 * Which shape the board posts. `opts.shape` always wins; otherwise a ready boss makes it a VAULT, a
 * short sitting a RUN, a plan-sized queue a JOB12, and everything else the evening default JOB-10.
 * The WEEK rules (D = 2 REVIEW BOARD, D ≤ 1 no board, the 22:00 close) are J11's, not this file's.
 */
export function shapeFor(save, opts = {}) {
  if (opts.shape && SHAPES[opts.shape]) return opts.shape;
  if (opts.short === true || num(opts.minutes, Infinity) <= 8) return 'RUN';
  if (bossReady(save).length) return 'VAULT';
  const q = num(opts.queueLength, 0);
  if (q >= SHAPES.JOB12.targets) return 'JOB12';
  return 'JOB';
}

/* ================================================================= drafts */

/** Every legal draft of `d` from `n` contracts, in lexicographic id order: C(5, 3) = 10 of them. */
export function legalDrafts(n, d) {
  const ids = JOB_BUNDLE_IDS.slice(0, n);
  if (d <= 0 || d >= n) return [ids.slice()];
  const out = [];
  const walk = (start, acc) => {
    if (acc.length === d) { out.push(acc.slice()); return; }
    for (let i = start; i < ids.length; i++) { acc.push(ids[i]); walk(i + 1, acc); acc.pop(); }
  };
  walk(0, []);
  return out;
}

/**
 * draftFrom(bundles, picks, opts) — `page.draftUnion` plus the two numbers the board prints:
 * the payout line and the row of contract letters.
 *
 * THE LINE LEADS WITH THE NUMBER THE DEBRIEF WILL REPORT (round-1 verification, player-feel).
 *
 * `draftUnion` returns three different payouts and round 3 wired the button to the wrong one. On one
 * browser run — one job, nothing walked, ten of ten answered — the board's primary button said
 * `posted 526 (−199 shared)` and the debrief said `Posted 419`, and the line's own arithmetic
 * (526 − 199) lands on 327, which is a third number. All three are real quantities:
 *
 *    postedGross 526   what the three drafted contracts posted BETWEEN them, before the dedupe
 *    postedNet   327   the union, each shared lock counted once — the pre-×2 sum
 *    postedLive  419   the drafted QUEUE's own posted values, with the day's ×2 marks realised
 *
 * and exactly one of them is what the job pays: `state.startJob` writes
 * `g.posted = econ.round(queue.reduce(…it.posted))` in `startJob` — `postedLive`, to the point — and
 * `endJob` records that as `posted`, which is what `run.js` prints as `Posted` and what every later
 * surface reads. So the one number the board promises before you commit is now that one, and the
 * sharing toll rides beside it ON THE SAME BASIS (`sharedLive`: the live value of every lock that
 * two drafted contracts both posted), instead of a gross on a basis no other surface uses.
 *
 * `tests/job-board.test.mjs` starts a job from the recommended draft and requires the number inside
 * `COPY.postedNet` / `COPY.postedFlat` to EQUAL `state.stateOf(save).posted`, so the board's promise
 * and the debrief's report cannot be two different quantities under one word again.
 *
 * Both halves are `data/job.js COPY` — the flat case used to be a local literal here, which is how
 * `COPY.postedFlat` came to have zero call sites while this file printed its text anyway (round 3,
 * player-feel).
 *
 * THE PAYOUT LINE IS NOT A SUBTRACTION SUM (round-2 verification, player-feel).
 *
 * Round 1 put the right NUMBER on the button and left the wrong SHAPE around it. `COPY.postedNet`
 * renders `posted ${gross} (−${shared} shared)`, and the line the button carried was
 *
 *      posted 419 (−239 shared)
 *
 * where 419 is the union WITH the day's ×2 marks — the number the job really pays, and the number
 * the debrief prints as `Posted` — while 239 is the live value of the locks two drafted contracts
 * both posted. A minus sign inside a bracket after a price is read as money coming off the top, and
 * no arithmetic anywhere on that screen produces 419 from it: `419 − 239` is 180, the three contract
 * rows printed directly above add to 526 and `526 − 239` is 287, and 239's own basis (a live gross
 * of 658) is printed nowhere. A 14-year-old is being shown a deduction that is not one.
 *
 * So the two facts are separated, and each is printed on a basis its own arithmetic closes:
 *   · `line` — the promise, and the only payout segment on the primary button — is
 *     `COPY.postedFlat`, always: **`posted 419`**, the number `state.startJob` will write as
 *     `g.posted` and the debrief will headline. No operator, nothing to subtract from anything.
 *   · `sharedLine` — the explanation, never on the button — carries the toll.
 *
 * THE EXPLANATION HAS TO SUBTRACT FROM A NUMBER THAT IS ON THE SCREEN (round-3 verification,
 * player-feel). Round 2 fed `COPY.postedNet` the drafted contracts' LIVE gross and the live toll, so
 * `658 − 239 = 419` closed onto the button — and 658 is a quantity NOTHING on the board prints. The
 * rows a student can actually add up are the contract rows (`posted 218`, `posted 175`, `posted 133`
 * → 526), which are `composeBundles`' pre-×2 values, i.e. `draftUnion`'s own `postedGross`. A live
 * gross double-counts the day's ×2 uplift on every shared lock, which is exactly how 526 became 658.
 *
 * So the line is built on the printed rows' own basis and walks the whole way to the button in
 * segments whose every number is on the screen:
 *
 *      17 locks (−7 shared) · 10 targets · posted 346 (−146 shared)
 *      15 locks (−5 shared) · 10 targets · posted 526 (−107 shared) · +132 ×2 · posted 551
 *
 *   · `${lockPostings} locks (−${sharedLocks} shared)` — the contract rows print `6 locks`,
 *     `5 locks`, `4 locks`; they add to 15 and the job has 10 targets, because five of those
 *     postings are the same lock twice. That gap had no sentence anywhere on the board, and the
 *     teach line above the rows ("you answer every lock in the ones you take") reads as a promise
 *     of 15.
 *   · `${targets} targets` — the union, the same number the primary button prints.
 *   · `COPY.postedNet({ gross: postedGross, shared: postedGross − postedNet })` — the rows' own sum
 *     and what the dedupe takes off it; the difference IS `postedNet`.
 *   · `+${x2Up} ×2 · posted ${live}` — only when the day's marks landed on a drafted target, because
 *     `postedNet` is pre-×2 and the button's `live` is not. With no marks the subtraction above
 *     already lands on the button's number and the tail is omitted.
 *
 * `tests/job-board.test.mjs` parses every number back out of the line and requires the chain to
 * close on `state.stateOf(save).posted`. It also asserts that a RENDER SITE exists — that file
 * cannot mount a DOM, so what it asserts is the grep the finding was made of (`grep -rn sharedLine
 * site/` returned only this file for two rounds) plus that the screen takes the QUOTE's line rather
 * than the board's. `qa/job-screen.mjs` is what reads the rendered text in a browser.
 * (`COPY.postedNet`'s first parameter is spelled `gross` and is fed one: the rename asked for in
 * notes/repair-board.md Requests 2 is withdrawn.)
 *
 * @returns the `draftUnion` result, with `line`, `sharedLine`, `label`, `net`, `gross`, `live`,
 *   `sharedLive`, `liveGross`, `locks`, `sharedLocks`, `sharedPoints` and `x2Up`.
 */
export function draftFrom(bundles, picks, opts = {}) {
  const d = draftUnion(bundles, picks, opts);
  const queue = d.queue ?? [];
  const live = num(d.postedLive, num(d.postedNet, 0));
  const net = num(d.postedNet, 0);
  /* what the printed contract rows add to — `draftUnion`'s own `Σ chosen.posted`, pre-×2 */
  const rowGross = num(d.postedGross, 0);
  const sharedPoints = Math.max(0, round(rowGross - net, 0));
  /* the day's realised ×2 uplift on the drafted union: `postedNet` is pre-×2, the button is not */
  const x2Up = Math.max(0, round(live - net, 0));
  /* how many LOCK POSTINGS the drafted contracts printed between them, and how many of those are the
     same lock twice: `sources` (kept by `draftUnion`'s dedupe) says how many contracts posted each
     queued lock, so `Σ sources` is exactly `Σ chosen.locks.length` and `Σ sources − |queue|` is the
     count the rows over-promise. */
  const lockPostings = queue.reduce((s, it) => s + Math.max(1, (it.sources?.length ?? 1)), 0);
  const sharedLocks = Math.max(0, lockPostings - queue.length);
  /* the sharing toll in LIVE points is still a real quantity (it is what a live gross would deduct);
     it is no longer what the line prints, because a live gross is on nobody's screen. */
  const liveGross = queue.reduce((s, it) => s + num(it.posted, 0) * Math.max(1, (it.sources?.length ?? 1)), 0);
  const sharedLive = Math.max(0, round(liveGross - live, 0));
  return {
    ...d,
    net: d.postedNet,
    gross: d.postedGross,
    live,
    sharedLive,
    /** the drafted contracts' LIVE gross, rebuilt from `live + sharedLive` so the pair is exact */
    liveGross: live + sharedLive,
    /** the lock arithmetic the contract rows print: postings, duplicates, and the union's targets */
    locks: lockPostings,
    sharedLocks,
    /** the toll and the ×2 uplift on the PRINTED ROWS' basis (`postedGross` → `postedNet` → `live`) */
    sharedPoints,
    x2Up,
    label: d.picks.join(' '),
    /** THE PROMISE: what this draft pays, with no operator in it (see above) */
    line: COPY.postedFlat({ posted: live }),
    /** THE EXPLANATION, on the printed rows' basis and never on the button (see above) */
    sharedLine: (sharedLocks > 0 || sharedPoints > 0)
      ? [
        `${lockPostings} locks (−${sharedLocks} shared)`,
        `${queue.length} targets`,
        COPY.postedNet({ gross: rowGross, shared: sharedPoints }),
        x2Up > 0 ? `+${x2Up} ×2` : null,
        x2Up > 0 ? COPY.postedFlat({ posted: live }) : null,
      ].filter(Boolean).join(' · ')
      : null,
  };
}

/**
 * G1 "Declines are priced" — the contracts you refuse at the board return in a brief window at
 * **+0.15 posted** each. Drafting is mandatory, so a decline is a trade and never a free reroll.
 * @param {number} n  the contract's posted value (or the contract itself)
 */
export function declinePrice(n) {
  const posted = typeof n === 'object' && n ? num(n.posted, 0) : num(n, 0);
  return Math.round(posted * (1 + DECLINE_PRICE));
}

/** The recommendation the primary button pre-drafts: most wings first (the token press needs them). */
function pickRecommended(priced) {
  return priced.slice().sort((a, b) =>
    (b.wings.length - a.wings.length)
    || (b.postedNet - a.postedNet)
    || (a.minutes - b.minutes)
    || cmpStr(a.picks.join(''), b.picks.join('')))[0] ?? null;
}

/* ================================================================= the supply row */

/**
 * THE SUPPLY ROW, WITH ITS FOUR WORDS PRINTED ONCE (round 3, player-feel).
 *
 * `wingSupply` (`js/gen/asn-reason.js` — the study layer, not this lane's file) builds one line per
 * wing and `screens/job.js:637` renders `board.supplyLines.join(' · ')`. With four wings that was
 * 135 characters of which 88 were the same four words, four times:
 *
 *   RECALL 103 locks available today · FIGURES 15 locks available today · WORDS 26 locks available
 *   today · ALGEBRA 31 locks available today
 *
 * — the same defect G1's round-2 `assignLabels` repair was written for ("five rows a student reads
 * as one row"), one line below the rows it fixed. The board publishes the row the screen renders, so
 * the de-duplication belongs here and reaches the eye without touching either file:
 *
 *   locks available today · RECALL 103 · FIGURES 15 · WORDS 26 · ALGEBRA 31
 *
 * THE PHRASE IS NOT RETYPED. It is `COPY.supply` with the wing and the count taken out of it, so
 * `data/job.js` stays the one place that sentence lives; `tests/job-board.test.mjs` asserts that
 * `COPY.supply({wing, locks})` rebuilds `wingSupply`'s own long line exactly, so the copy file, the
 * supply generator and this row cannot drift apart silently. If that reconstruction ever fails the
 * long lines are published unchanged rather than mangled.
 */
const SUPPLY_PHRASE = typeof COPY.supply === 'function'
  ? String(COPY.supply({ wing: '', locks: '' })).replace(/\s+/g, ' ').trim()
  : '';                              // the copy file is another lane's: never throw at import

/** @returns {string[]} the supply row: the phrase once, then `WING n` per wing, in supply order */
export function supplyRow(supply, order, lines = []) {
  const rows = (Array.isArray(order) ? order : Object.keys(supply ?? {}))
    .map(id => supply?.[id])
    .filter(r => r && Number.isFinite(r.locks));
  if (!rows.length || !SUPPLY_PHRASE) return lines;
  /* the guard: every long line has to BE `${label} ${locks} ${phrase}`, or this lane is not looking
     at the sentence it thinks it is and the generator's own lines are the safer thing to print */
  const rebuilt = rows.map(r => `${r.label ?? r.id} ${r.locks} ${SUPPLY_PHRASE}`);
  if (lines.length && rebuilt.join('|') !== lines.join('|')) return lines;
  return [SUPPLY_PHRASE, ...rows.map(r => `${r.label ?? r.id} ${r.locks}`)];
}

/* ================================================================= the vault */

/**
 * vaultFor(save) → the most-overdue CLEARED tier-3/4 original, named on the board at the START of the
 * job (G3.8 #6 — "a commitment device for free"). Seed-independent by construction: no rng, no shuffle,
 * ties broken by card id. `grade` is the tier the player's own Elo says the vault should be (§3.5).
 */
export function vaultFor(save, { now = Date.now(), tiers = VAULT_TIERS } = {}) {
  let best = null;
  for (const c of ALL_CARDS) {
    if (isBonus(c.id)) continue;
    const tier = Number.isInteger(c.tier) ? c.tier : 2;
    if (!tiers.includes(tier)) continue;
    const rec = save?.cards?.[c.id];
    if (!isCleared(rec)) continue;
    const overdueDays = rec?.due != null ? overdueDaysOf(rec, now) : 0;
    if (best && !(overdueDays > best.overdueDays
      || (overdueDays === best.overdueDays && cmpStr(c.id, best.id) < 0))) continue;
    const skill = (Array.isArray(c.skills) && c.skills[0]) || null;
    best = {
      id: c.id, tier, skill, wing: wingOf(skill) ?? WING_OF_SKILL[skill] ?? null,
      module: c.module, sheet: c.sheet,
      bucket: num(rec?.bucket, 0),
      overdueDays: round(overdueDays, 2),
    };
  }
  const rPlayer = num(save?.player?.elo?.player, 1000);
  return best ? { ...best, grade: vaultGradeFor(rPlayer) } : null;
}

/* ================================================================= the board */

/**
 * THE COMPOSITION INPUTS ARE THE SAVE'S, NEVER THE CALLER'S (Global law 4 — "the board is a
 * projection of the save"), and this function is the whole of that rule.
 *
 * Round 2, the player-feel BLOCKER: the board Home painted was not the board you got when you
 * tapped it. `screens/home.js:417` composed with `{...plan.composeOpts(save), page: act.page}` and
 * `screens/job.js:243` composed with `{now, seed, tellFor}` — same save, same day, same pinned seed
 * `job|…|0`, two different queues, because `postBoard` forwarded whatever composition options and
 * whatever pre-composed `page` its caller happened to hold. Measured on one 375×812 session:
 *
 *   HOME PAINTED          A ASN-PLP · B VOC · C FAC2 · D ASN-ANG · E NOTE
 *   THE JOB SCREEN POSTED A ASN-PLP · B FAC2 · C ASN-ANG · D CS-RATIO · E VOC
 *
 * Worse, the job screen's queue was the UNLOWERED one: Home printed "13 new a day is more than a
 * day holds — the target is 12" directly under a board composed with `tier4 = 1, microFlashOnly`,
 * and the job then composed with the S1 defaults. So the fix is not "pick one caller's options", it
 * is that no caller has any: `postBoard` asks `plan.composeOpts(save)` itself, which is the same
 * answer for every caller and is the answer the plan strip is already printing.
 *
 * `opts.pageOverride` is the one seam, and it is for FIXTURES ONLY (`tests/job-board.test.mjs`
 * builds thin/dry/mixed-grade queues no save can produce). `opts.page` is deliberately ignored:
 * that is the key `screens/home.js` passes, and honouring it is exactly the bug above.
 */
function composeInputsFor(save, day) {
  try {
    const o = planComposeOpts(save, { D: daysUntilTest(save?.settings?.testDate, day) });
    return { q: o.q, tier4: o.tier4, microFlashOnly: o.microFlashOnly };
  } catch { return {}; }
}

/**
 * postBoard(save, today, opts) → TONIGHT'S BOARD.
 *
 * Everything on it is derived from the save (COMPOSED-GAME Global law 4 — "the board is a projection
 * of the save"): the contracts from `composeBundles`, the guard's published distribution from
 * `job/guard.js`, the ×2 marks from `dateISO|jobIndex|targetIndex`, the per-wing supply from
 * `wingSupply`, the vault from the Leitner record, and one priced row for EVERY legal draft so the
 * draw distribution is exactly computable by the player before they choose (G3.6, "the board sheet").
 *
 * @param {object} save
 * @param {string|object|null} [today]  the ISO day (or the opts object)
 * @param {object} [opts]  `now`, `shape`, `seed`, `jobIndex`, `page`, `tellFor`, plus composePage opts
 */
export function postBoard(save, today = null, opts = {}) {
  if (today && typeof today === 'object') { opts = today; today = null; }
  const now = opts.now ?? Date.now();
  const day = today ?? opts.today ?? todayISO(new Date(now));
  const jobIndex = Number.isInteger(opts.jobIndex) ? opts.jobIndex : jobIndexFor(save, day);
  const seed = opts.seed ?? jobSeedFor(save, day, jobIndex);
  const shape = shapeFor(save, { ...opts, now, today: day });
  const bundles = composeBundles(save, {
    ...composeInputsFor(save, day),          // the plan's options, not the caller's — see above
    now, today: day, shape, seed, jobIndex,
    tellFor: opts.tellFor ?? null,
    ...(opts.pageOverride ? { page: opts.pageOverride } : null),
  });
  const budget = bundles.budget;

  /* G3.6 — the ×2 marks, one independent 1-in-6 per target index, known before the draft. */
  const picksList = legalDrafts(bundles.bundles.length, bundles.draft);
  let marks = x2Marks(day, jobIndex, budget.targets);
  /* every legal draft, priced, so the board sheet is complete and the recommendation is derived */
  let drafts = picksList.map(p => draftFrom(bundles.bundles, p, { x2: marks }));

  /* THE VECTOR COVERS THE LONGEST DRAFT, NOT THE SHAPE'S BUDGET (round 3, board-schedule).
     `page.draftUnion` reads `opts.x2[i]` by queue position, so an index past the end of the array is
     `undefined` → false. The shape's budget is not the ceiling on a drafted queue's length: step 7
     of `composeBundles` pushes one cross-wing donor lock into a bundle to keep G3.4's "every legal
     3-of-5 draft spans ≥ 2 wings", and every draft holding that bundle then runs ONE target long. So
     the last target of those drafts had a ×2 probability of 0 instead of 1/6, against the G8 J5 row
     ("the ×2 lands independently at `p = 1/6` per target"). Measured over 4 shapes × 400 corpus
     saves × every legal draft = 15 984 drafts: 252 run long (RUN 132 · VAULT 87 · JOB 24 · JOB12 9),
     overshoot exactly 1 every time, and on every one of them the tail target was unmarked.
     `x2Marks` is PREFIX-STABLE by construction — index `i` draws from `dateISO|jobIndex|i` and
     nothing else — so extending the vector cannot move a mark that was already drawn, and the
     re-price below is the same board with the tail filled in. It costs a second draft pass on the
     1.6 % of boards that need one, and nothing on the rest. */
  const longest = drafts.reduce((n, d) => Math.max(n, d.queue.length), 0);
  if (longest > marks.length) {
    marks = x2Marks(day, jobIndex, longest);
    drafts = picksList.map(p => draftFrom(bundles.bundles, p, { x2: marks }));
  }
  const recommend = pickRecommended(drafts);

  /* the guard: support = the wings the posted contracts actually touch (G3.4, G12 #11) */
  const support = bundles.wings.length ? bundles.wings : undefined;
  const dist = guardDist(save, { support });
  const values = wingValues(save, (recommend?.queue ?? bundles.pool.map(t => t.item)));
  /* `{ seed }` settles a TIED argmax by the board's own pinned seed instead of by `WING_IDS` order
     (notes/repair-guard.md R15, landed at integration). Without it `bestResponseWing` named RECALL
     on every exact tie — and `v_i·(1 − y_i)` ties exactly on most boards, because ten jobs pressed
     in three whole tokens is a coarse grid. Nothing about the payoff moves: `tokens` apportions
     `press` (the stationary mix), never the argmax, and `bestResponseWings` still carries the whole
     tied set for the debrief. The seed is the pinned job seed, so a re-open names the same wing. */
  const press = pressAdvice(dist, values.byWing, { seed });

  /* THE PRESS IS DROPPED WHEN IT CANNOT MATTER (round 2, player-feel).
     `GUARD.postedSpanWings = 3` is a promise about the BOARD, and `page.js choiceLocks()` keeps it
     wherever the composed Page carries three wings. It cannot keep it on a Page that does not: the
     RECALL wing owns 5 of the 19 makes, including both 35-card ASN sheets and the 37-card VOC
     sheet, so an evening whose whole due list is ASN-ANG is ordinary, not exotic. On such a board
     every wing in the support is certain to be taken, `pressAdvice`'s own `marginal` is 0 across
     the board — a token buys `GUARD.tokenBonus · v · (1 − y)` and `y = 1` — and yet `pressAdvice`
     is required by G3.4 to spend all three tokens somewhere, so it spent them on the one wing that
     is guaranteed to be guarded. That is a 3-token allocation that cannot change a single payoff:
     one of G1's 24 mandatory decisions, priced at nothing. The board now says so and recommends
     zero, which is the correct play, instead of asking for an allocation that cannot matter. */
  const pressMatters = press.marginal.some(m => m > 1e-9);
  if (!pressMatters) {
    press.tokens = Object.fromEntries(press.wings.map(w => [w, 0]));
    press.total = 0;
    press.byWing = Object.fromEntries(press.wings.map(w => [w, { ...press.byWing[w], tokens: 0 }]));
  }
  press.matters = pressMatters;
  /* the makes the five rows are NAMED after: one make on all of them is a board with one decision */
  const makes = [...new Set(bundles.bundles.map(b => b.label).filter(Boolean))];

  /* the truthful wall clock and the projected split, both printed BEFORE you press (G9 #1) */
  const projection = projectFor(save, recommend ?? { queue: [], minutes: budget.minutes }, budget);
  const endsAt = now + Math.round(projection.wallS * 1000);

  const rows = bundles.bundles.map(b => ({
    ...b,
    decline: declinePrice(b.posted),
    line: `${b.id}  ${String(b.label).padEnd(8)} · ${b.locks.length} ${b.coldLocks ? 'cold ' : ''}locks · ${b.gradeLabel} · posted ${b.posted} · ~${b.minutes} min · ${b.wing ?? '—'}`,
  }));

  const dry = bundles.pool.length > 0 && bundles.pool.every(t => t.item?.isVariant && !t.item?.isReview);
  const thin = bundles.posted < BOARD.postedMax;

  return {
    day, jobIndex, seed, now,
    shape: budget.id,
    budget,
    contracts: rows,
    bundles: bundles.bundles,
    pool: bundles.pool,
    page: bundles.page,
    /* the two kinds of lock the pool is made of (page.js `composeBundles` step 4): every draft
       carries the whole `core`, and exactly `draft` of the `posted` `choice` locks. */
    core: bundles.core,
    choice: bundles.choice,
    /* the three named parts of the Page's critical dues (page.js `composeBundles`): the core is in
       every draft, the optional ones are posted one contract each, the deferred are not posted at
       all — and `critical + criticalOptional + deferred` is every critical the composer scheduled. */
    critical: bundles.critical,
    criticalOptional: bundles.criticalOptional,
    deferred: bundles.deferred,
    /**
     * THE DEFERRED LINE SAYS WHAT THE COMPOSER CAN KEEP (round-2 verification, board-schedule).
     *
     * It used to end "they lead the next board", which is a stronger sentence than `composePage`
     * ever promised and is false three ways. Swept over 400 saves × every shape — 1 162 boards that
     * defer a critical and leave a target unposted, each answered through the study layer's own
     * writers and re-composed the way Home composes it: **no item is ever unscheduled (1 162 of
     * 1 162, which is COMPOSED Global rule 5 and is what this line is really about)**, but
     * `LIMITS.dues` caps what one Page serves, so the least overdue of eighteen dues waits (4 of
     * 1 162 are not on the NEXT Page at all), and the deferred critical does not lead the review
     * block on 14 of 1 162 — a TIER-4 one can never lead a Page at all, because `composePage`'s own
     * rule is that a hard item is never first. So the line promises the schedule, which is kept, and
     * not a position on the next Page, which is not this file's to give
     * (`tests/job-board.test.mjs` "a target a job does not reach stays due…";
     * designs/SPEC-CORRECTIONS.md A-5).
     */
    deferredLine: bundles.deferred.length
      /* the line ends on a STATE, not an invitation: the two-word return-to-the-app phrase it first
         ended with is on `tests/job-copy.test.mjs`'s banned register (G12 #35), which is the same
         reason this file may not say it in a comment either — the lint reads the source. */
      ? `${bundles.deferred.length} due ${bundles.deferred.length === 1 ? 'review is' : 'reviews are'} not posted tonight · still due · on a later board`
      : null,
    posted: bundles.posted,
    draft: bundles.draft,
    replication: bundles.replication,
    choicePer: bundles.choicePer,
    drafts,
    recommend,
    guard: dist,
    guardBars: guardBars(dist),
    guardSupport: dist.n === 1 ? 'guard: 1 wing on the board' : COPY.guardSupport({ n: dist.n }),
    press,
    /** false when every posted wing is certain to be guarded — the 3 tokens are recommended at 0 */
    pressMatters,
    pressLine: pressMatters ? null
      : `${bundles.wings.length <= 1 ? `one wing tonight · ${bundles.wings[0] ?? '—'}` : 'every posted wing is guarded'} · no press · the 3 tokens cannot change a payoff`,
    /** the wings the POSTED contracts touch, against G3.4's floor (`GUARD.postedSpanWings`) */
    wingsPosted: bundles.wings.length,
    wingsShort: bundles.wings.length < JOB_WINGS_MIN,
    /** every posted contract carries the same name: the DRAFT is 3 slices of one block, and says so */
    oneMake: bundles.bundles.length > 1 && makes.length <= 1,
    oneMakeLine: bundles.bundles.length > 1 && makes.length <= 1
      ? `one make tonight · ${makes[0] ?? '—'} · every contract is a slice of the same block`
      : null,
    wingValues: values,
    wings: bundles.wings,
    supply: bundles.supply,
    /** the phrase once, then the numbers (`supplyRow`) — 135 characters became 62 */
    supplyLines: supplyRow(bundles.supply, bundles.supplyOrder, bundles.supplyLines),
    /* `count` is what the board PRINTS before the draft — the realised count over the shape's own
       target indices, which is the quantity G3.6 publishes an expectation for (1.67 on a JOB-10 =
       10 × 1/6). `marks` runs one index longer on the drafts that do (see above), and each draft's
       own realised count is `draft.x2`, so no number here is quietly counting a target the drafted
       job does not have. */
    x2: { marks, count: marks.slice(0, budget.targets).filter(Boolean).length, p: X2.p },
    vault: budget.vault ? vaultFor(save, { now }) : null,
    minutes: recommend ? recommend.minutes : bundles.minutes,
    endsAt,
    ends: timeHM(new Date(endsAt)),
    split: projection.split,
    projection: COPY.projection({ split: projection.split, jobs: projection.jobs }),
    projectionSource: projection.source,
    /** the student's own pace, as a multiple of the two shipped tables (`personalRates`) */
    projectionRates: projection.rates,
    thin,
    thinLine: thin
      ? COPY.thin({
        contracts: bundles.posted, draft: bundles.draft,
        wing: bundles.wings[0] ?? '—',
        locks: bundles.supply?.[bundles.wings[0]]?.locks ?? 0,
      })
      : null,
    dry,
    dryLine: dry ? COPY.dryBoard() : null,
    /** every legal draft yields the same union — the board offers no real choice tonight */
    everyDraftIdentical: drafts.length > 1
      && drafts.every(d => d.union.slice().sort().join('|') === drafts[0].union.slice().sort().join('|')),
    /** the drafted union's payout, `posted 100`, for a screen that prints it on its own */
    postedLine: recommend ? recommend.line : null,
    /** the sharing toll, on its own basis and its own line: `posted 105 (−5 shared)`, never on the
        button — `draftFrom`'s note says why a minus sign beside the payout was read as a deduction */
    sharedLine: recommend ? (recommend.sharedLine ?? null) : null,
    /**
     * THE PRIMARY BUTTON, in the form G1 publishes:
     *
     *   [ TAKE THE POSTED JOB · A D E · 10 targets · posted 100 · ~14 min · ends 20:31 · 48 % game ]
     *
     * Round 3, player-feel: the shipped button dropped BOTH of the segments that say what you are
     * agreeing to — WHICH contracts the tap pre-drafts (`A D E`) and WHAT THE JOB PAYS. It read
     * `JOB · 10 targets · ~23 min · ends 19:52 · 26 % game`, so the word `posted` did not appear
     * anywhere on the board's own call to action, and `Posted 516` first reached the student in the
     * debrief — after the job. `draftFrom().line` and `COPY.postedNet` / `COPY.postedFlat` had been
     * composed for exactly this line since J5 and had no render site at all.
     *
     * `COPY.primary` is the same sentence with those two segments missing, and `screens/home.js`
     * still falls back to it when there is no board; the test `the primary is G1's button` asserts
     * this line IS that template plus the letters and the payout, so the two cannot drift apart.
     * (A `COPY` entry that takes all seven segments is filed under Requests in notes/board-fix.md —
     * `data/job.js` is not this lane's file.)
     */
    primary: recommend
      ? [
        SHAPES[budget.id].name,
        recommend.label,                        // A D E — which contracts one tap drafts
        `${recommend.queue.length} targets`,
        recommend.line,                         // posted 100 — what it pays, with no operator in it
        /* WALL-CLOCK minutes, not the draft's answer minutes: `ends` is `now + wallS`, and G9 #9
           makes the printed minutes and the printed end time the same clock. Answer minutes beside a
           wall-clock end time is what made Home say ~20 min and this line say ~15 min for one board
           (notes/J11.md §6 → J5, notes/J13.md Request 2). `recommend.minutes` is still on the object
           for anyone who wants the answering half. */
        `~${Math.ceil((endsAt - now) / 60000)} min`,
        `ends ${timeHM(new Date(endsAt))}`,
        `${projection.split} % game`,
      ].join(' · ')
      : null,
    D: daysUntilTest(save?.settings?.testDate, day),
  };
}

/**
 * The projected split — ONE model, the student's own, on the basis the debrief headlines.
 *
 * G1 statement 1 is the specification: "`save.game.ledger` keeps a rolling mean of the student's own
 * phase durations over the last 5 jobs; **the board's per-shape projection is computed from that**".
 * It used to be computed from that only on job 1: with any log at all the function threw away the
 * per-draft `gameS` it had just built and returned a raw `Σ tGame / Σ (tGame + tAnswer)` over the last
 * five log entries — whatever shapes and paths those were, with no shape term in it at all. Two
 * consequences, both measured in round 1 (notes/board-fix.md §7 and §9):
 *   · five VAULT/full-use jobs behind you and a JOB12 tonight printed `~48 %` against a debrief that
 *     headlined 35.2 % — 12.8 points, on a line labelled "measured";
 *   · a zero-target WALK writes a log entry with `tAnswer = 0`, so three walks printed `~100 % game ·
 *     your last 3 jobs`. A walk is not a measurement of anything.
 * Both are gone: the phase means (the student's own, per phase, rolling over five jobs) are the
 * model's constants, and THIS draft's own tiers and windows are what they are spent on. The log is
 * read for one thing only — how many real jobs are behind the student, which is what the line is
 * allowed to claim (`your last N jobs`), and a walk is not one of them.
 *
 * THE BASIS. `state.debriefOf` cannot measure the debrief read about itself (the phase is set inside
 * `endJob` and the record is gone one line later), so the debrief's HEADLINE is
 * `tGame / (tGame + tAnswer)` with the debrief read in neither term, and its sub-line prints the
 * session basis beside it (`48 % with this screen`). The board printed the session basis and was
 * therefore up to 9.3 points from the headline the student's eye lands on. `split` is now the
 * headline's own quantity — debrief read in neither term — so the two numbers are the same
 * measurement taken twice. `wallS` is the other question ("when am I done?") and still spends
 * `means.debrief`, because the student really does sit through it: `ends HH:MM` is unchanged.
 *
 * THE PER-DRAFT TERMS. The shape alone is blind to the two things that actually move a session: the
 * DRAFT'S OWN TIERS (a 10-target job of tier-1 drills and a 10-target job of tier-4 originals are the
 * same shape and a different session) and how many brief windows will really land. Both are spent
 * here, over the drafted queue itself; notes/J8.md Request 1 is where this form was written.
 *
 * THE STUDENT'S OWN RATE (round 2, the split-honesty BLOCKER). Until round 2 the two per-target
 * terms were SHIPPED CONSTANTS at both ends — `ANSWER_MINUTES_PER_TIER` and `DECISION_SECONDS` —
 * so `~29 % game · your last 5 jobs` was a sentence with the student's name on a number they had
 * contributed 14 % of. Driven over the screen's own call sequence with a clock that is nobody's
 * table, the line missed the debrief's own headline by 17–18 points for a slow answerer and by
 * 34–35 points the other way for a fast answerer who deliberates, and no amount of history closed
 * it, because no term in it could move (`tests/job-split.test.mjs` §the criterion, round 1's
 * `assert.ok(gap > 5)`, which this replaces with the agreement it was holding the place for).
 *
 * `save.game.log` already stores what closes it: per job, the student's own `tGame`, `tAnswer` and
 * `targets`. So the two per-target terms are now the TABLES SCALED BY THE STUDENT'S OWN MEASURED
 * RATE against those same tables (`personalRates`), which is the only form that keeps the tier mix
 * of TONIGHT'S draft — a rate is a property of the student, the tier mix is a property of the
 * draft, and the projection needs both. A student who takes twice as long over a stem sees their own
 * answer half of the split double. Nothing here is a constant the student never produced except on
 * job 1, where the rates are 1, the source is `projected`, and the line says so.
 *
 * WHAT "THE TABLE'S PACE READS 1" IS TRUE OF, EXACTLY (round-3 verification, board-schedule). This
 * paragraph used to say, flatly, "a student who answers at the table's pace has rates of 1 and the
 * number does not move". Measured on `TABLE_PACE` — the clock that IS `ANSWER_MINUTES_PER_TIER × 60`
 * and `DECISION_SECONDS` byte for byte — over 25 corpus saves per row, five completed jobs of the
 * history's shape and then tonight's board:
 *
 *      same shape as tonight    answer 1.000 and decision 1.000, EXACTLY, on all four shapes
 *      any other shape          answer mean 0.93–1.03, worst cell 0.213
 *                               decision mean 0.84–1.03, worst cell 0.409
 *
 * The same-shape row is what `expectedSecondsFor` now prices on tonight's own ramp; the other row is
 * an information limit in the log (`shareOf`'s note) and is published rather than claimed away —
 * COMPOSED-GAME G1 statement 2's cross-shape band, and `tests/job-board.test.mjs`'s own estimator
 * arm, carry the numbers. Before that repair even the same-shape row read 0.933–1.015.
 */
function projectFor(save, drafted, budget) {
  const stored = save?.game?.ledger?.phaseMeans;
  const base = { ...PHASE_MEANS_DEFAULT, ...(stored && typeof stored === 'object' ? stored : null) };
  const queue = drafted.queue ?? [];
  const shape = SHAPES[budget.id] ?? SHAPES.JOB;
  const means = meansForShape(base, jobsOnRecord(save), shape.id);
  /* only the windows that can actually land: `briefAfterTargets` inside this draft's length */
  const landed = Math.min(shape.briefs ?? 0, BOARD.briefAfterTargets.filter(n => n < queue.length).length);
  let answerS = 0;
  let decisionS = 0;
  /* the RAMP, as cumulative seconds: `ramp.answer[k]` is what the first `k` targets of tonight's own
     draft cost. A job the student walked out of answered a PREFIX of a ramp exactly like this one,
     and `personalRates` needs to know what a prefix is worth — 6 of a JOB12's 12 is half the targets
     and a quarter of the seconds, because the ramp puts the cheap locks first. */
  const ramp = { answer: [0], decision: [0] };
  for (const it of queue) {
    answerS += (ANSWER_MINUTES_PER_TIER[it.tier] ?? ANSWER_MINUTES_PER_TIER[2]) * 60;
    decisionS += DECISION_SECONDS[it.tier] ?? DECISION_SECONDS[2];
    ramp.answer.push(answerS);
    ramp.decision.push(decisionS);
  }
  if (!queue.length) {                       // nothing drafted yet: fall back to the shape's own row
    answerS = (drafted.minutes ?? budget.minutes) * 60;
    decisionS = jobBudget(budget.id).decisionS;
  }
  /* THIS draft's tier mix, at THIS student's measured pace (1 and 1 until they have a job on record) */
  const rates = personalRates(save, base, {
    shape: shape.id, targets: Math.max(1, queue.length || shape.targets),
    /* ON THE LOG'S OWN BASIS. `endJob` writes `g.posted` — the drafted queue's posted values WITH the
       day's ×2 marks realised — so tonight's figure has to be on that basis too, or a post-×2
       history is rated against a pre-×2 tonight and every rate comes out ~15 % (= `X2.p`) low.
       But it is the EXPECTATION that is used, not tonight's own realised marks: the marks are a
       1-in-6 coin per target and the log cannot say how the history's fell, so spending tonight's
       realisation here would read a lucky board as a fast student. `postedNet` is the pre-×2 sum. */
    posted: num(drafted.postedNet, 0) * (1 + X2.p),
    answerS, decisionS, ramp,
  });
  answerS *= rates.answer;
  decisionS *= rates.decision;
  /* the DEBRIEF-HEADLINE basis: the debrief read is in neither term of the split … */
  const gameS = means.board + means.guard + means.brief * landed + means.getaway + decisionS;
  /* … and in the clock, because the student sits through it: `ends` is `now + wallS` */
  const wallS = answerS + gameS + means.debrief;
  /**
   * HOW MANY JOBS THE SENTENCE MAY NAME — the jobs this projection actually RATED, not the jobs on
   * record (round-1 verification, split-honesty BLOCKER).
   *
   * `jobs` was `min(5, rates.jobsOnRecord)` and `jobsOnRecord` is `log.length`: the count of jobs
   * the student HAS, not of jobs either term of this number is built from. Those two are the same
   * only while every job in the window produces a usable observation, and `personalRates` has two
   * ways not to — a term whose measured seconds or whose expectation is not a positive number
   * (`add`'s guard: a job recorded at `tAnswer 0`, a decision measurement that the fixed phases eat
   * whole) — after which `rate()` falls back to **1**, the shipped `ANSWER_MINUTES_PER_TIER` table.
   * A board that prints the brochure's own constant under the words `your last 5 jobs` is the round-2
   * BLOCKER again ("a sentence with the student's name on a number they had contributed 14 % of"),
   * except at 0 %: measured at 58.1 points from the debrief headline before the clamp was changed to
   * bound an outlier instead of deleting it (see `add`). The bound closes the common road to an empty
   * window; this closes the label, so an empty accumulator can never again be printed as a
   * measurement. Both terms must have rated at least one job before the line may say `ledger`, and
   * the number it names is the jobs the THINNER term spent — `your last 3 jobs` when that is what
   * was rated, `projected` when nothing was.
   *
   * AND A TERM THAT IS SITTING ON A CLAMP BOUND HAS NOT MEASURED THE STUDENT EITHER (round-3
   * verification, split-honesty BLOCKER). `personalRates` reports `bounded` per term: every job it
   * rated left the same end of `[RATE_MIN, RATE_MAX]`, so the pooled rate IS that end. The number on
   * the board is then `RATE_MIN × the shipped table` — a constant five different students share,
   * measured at up to 20.4 points from the debrief headline over the corpus on a flat 8 s/stem clock
   * (45 of 50 cells outside the published 5), and it stops moving however much faster the student
   * gets. `add`'s own note has the table. That is the same information state as a five-of-five walk —
   * the window holds no observation this projection can call the student's — so the line demotes
   * itself the same way, to `projected`. The printed percentage is unchanged: the rate is still
   * spent, because the bound is a far better guess than 1; only the sentence's claim is withdrawn.
   */
  const rated = Math.min(rates.n.answer, rates.n.decision);
  const onABound = rates.bounded.answer || rates.bounded.decision;
  const jobs = onABound ? 0 : Math.min(SPLIT.projectionWindowJobs, rated);
  return {
    split: round((100 * gameS) / (answerS + gameS), 0),
    jobs,
    source: jobs > 0 ? 'ledger' : 'projected',
    rates,
    wallS,
  };
}

/**
 * How far one observation of a rate may sit from the shipped table before it is treated as a phone
 * left on the answer screen rather than a student thinking. The fixed phases already have this
 * guard in `job/state.js` (`PHASE_OBSERVED_CAP_X = 4`); without it here, one job abandoned on an
 * envelope for an hour would own the mean of five, and the board would advertise `~3 % game`.
 * Deliberately wide — a 14-year-old who takes six times the table's 30 s over a tier-1 stem is a
 * real student and the projection should say so; sixty times is a phone.
 */
const RATE_MIN = 1 / 6;
const RATE_MAX = 6;

/** the same two numbers, for a test that must assert against the shipped bound rather than retype it */
export const RATE_CLAMP = Object.freeze({ min: RATE_MIN, max: RATE_MAX });

/** The student's real jobs, newest last — a zero-target walk is not one (G1: "your last N jobs"). */
const jobsOnRecord = (save) => (save?.game?.log ?? []).filter(e =>
  Number.isFinite(e?.tGame) && Number.isFinite(e?.tAnswer) && num(e?.targets, 0) > 0);

/**
 * HOW LONG THE JOB BEHIND THIS LOG ENTRY ACTUALLY WAS — the drafted queue, not the answered part.
 *
 * `state.js endJob` writes `targets: answered(s)` (what the student answered) beside
 * `posted: g.posted` (what the WHOLE drafted queue was worth, set once at `startJob` and only ever
 * increased by a brief-window swap). On a completed job those two agree about the same job. On a
 * mid-job WALK — a first-class, documented failure state, one tap, wired to the screen — they do
 * not: `targets 3, posted 170` is three targets' seconds against ten targets' work.
 *
 * The entry does not record the queue's length, so the shape's own published target count is the
 * stand-in. THAT IS AN ESTIMATE AND NOT A GOOD ONE, and this docblock used to cite J5's acceptance
 * row ("every legal draft serves the shape's target count exactly — 99.5 % of drafts, ±1 otherwise")
 * as though it were. Measured through the shipped call over 400 saves × every legal draft, per shape
 * (round-1 verification, board-schedule):
 *
 *      RUN    want 6    96.70 % exact   deltas {0: 3864, +1: 132}
 *      JOB    want 10   99.25 % exact   deltas {−1: 6, 0: 3966, +1: 24}
 *      JOB12  want 12   96.37 % exact   deltas {−3: 6, −2: 20, −1: 110, 0: 3851, +1: 9}
 *      VAULT  want 7    97.82 % exact   deltas {0: 3909, +1: 87}
 *
 * — 97.54 % over all shapes, no shape at 99.5 %, and JOB12 outside ±1 twenty-six times, down to −3
 * of 12 on a Page too thin to feed a twelve-target shape. So this stand-in is wrong by up to 3 of 12
 * (25 %) on a JOB12, and the consequence is visible in the suite: a job that answered its whole
 * 9-target queue is read as a WALK (9 < 12) and its decision measurement is abstained. Counted
 * there, at "THE CRITERION survives a history of mid-job walks" (7 of 3 000 jobs on the corpus).
 * The correction is filed in designs/SPEC-CORRECTIONS.md A-6; a brief window's swap can also make a
 * job LONGER than its shape, so a job at or past its shape's count is treated as complete.
 *
 * `queueTargets` is the field a writer should record if it ever wants to be exact, and it is
 * preferred over the shape's row wherever it appears. **`state.endJob` WRITES IT NOW** (the state
 * lane, round-3 verification, byte-neutral: the row pays for it by rounding its own copy of
 * `rating`), so every stand-in below applies only to a log row written before that landed. The
 * whole-job/prefix classification is exact on a row that carries it.
 *
 * TONIGHT'S OWN DRAFT OUTRANKS THE SHAPE'S PUBLISHED ROW (round-2 verification, board-schedule).
 *
 * The nominal row is not merely imprecise, it is BIASED THE SAME WAY EVERY NIGHT for one student,
 * because what makes a draft short is the save's own Page being too thin to feed the shape — a
 * property of that save, not a coin. Measured over 400 saves × the recommended draft, the shape's
 * row overstates the served queue on 0/400 RUNs, 1/400 JOBs and **14/400 JOB12s (3.5 %)**. For those
 * fourteen it is not one job in a while: every job they ever finish is read as a walk, the decision
 * term abstains on all five, `projectFor` prints `projected` forever and the split lands 3.9 points
 * (this file's own CLOCK), 6.7 (a slow stem) or 8.9 (a deliberator) from the debrief headline — on
 * corpus save 25/JOB12, whose five log entries are five COMPLETED eleven-target jobs.
 *
 * So when the entry's shape is TONIGHT'S shape, tonight's own drafted queue length joins the shape's
 * row as a second reading of the same quantity — a measurement of what this save's Page actually
 * serves that shape, taken from the same composer, on the same save, rather than a constant from
 * `data/job.js` — and the SMALLER of the two is the stand-in. Both errors are possible (`composeBundles`
 * step 7 can push a draft one target PAST the shape's row as well as fall short of it: on corpus save
 * 27 tonight's VAULT draft is 8 where the row says 7, and the entry that answered its whole 7-target
 * queue then reads as a walk), and the trade between them is one-sided: misreading a nearly-finished
 * walk as complete costs one decision cycle of ambiguity out of seven or twelve, while misreading a
 * completed job as a walk costs the whole decision term and prints `projected` instead of a
 * measurement. Leaning toward complete is therefore the correct bias, and `min` is what leans.
 *
 * SCORED AGAINST THE TRUTH, on the criterion sweep's own population — 24 000 log entries (4 clocks ×
 * 6 walk levels × 50 saves × 4 shapes × the five-job window), where the seasoning knows which jobs
 * were walked and which were finished:
 *
 *      stand-in                    completed job read as a walk     walk read as completed
 *      the shape's published row                  60                          0
 *      tonight's drafted length                    4                          0
 *      min of the two                              0                          0
 *
 * — and `tests/job-board.test.mjs` asserts the third row's zero (`missedComplete`) on every run.
 */
const queuedTargetsOf = (e, tonight) => {
  if (Number.isFinite(e?.queueTargets) && e.queueTargets > 0) return e.queueTargets;
  const nominal = num(SHAPES[e?.shape]?.targets, 0);
  const drafted = num(tonight?.targets, 0);
  if (drafted > 0 && e?.shape != null && e.shape === tonight?.shape) {
    return nominal > 0 ? Math.min(nominal, drafted) : drafted;
  }
  return nominal;
};

/** true when the entry's job answered its whole drafted queue — so it reached the getaway phase */
const reachedGetaway = (e, tonight) => {
  const queued = queuedTargetsOf(e, tonight);
  return !(queued > 0) || num(e?.targets, 0) >= queued;
};

/**
 * WHAT THE TABLES SAY THE JOB BEHIND THIS LOG ENTRY SHOULD HAVE COST THE STUDENT — the denominator
 * of one job's ratio, per term, in seconds.
 *
 * Two regimes, because the log supports two different questions, and round 3 answered the second one
 * with the first one's instrument.
 *
 * A JOB OF TONIGHT'S OWN SHAPE IS PRICED BY COUNT, ON TONIGHT'S OWN RAMP — whole job or prefix
 * (round-3 verification, board-schedule). `share` (the entry's `posted` over tonight's) is the tier
 * mix's only available proxy for a job of some OTHER shape, and it is a lossy one: `posted` also
 * carries the day's realised ×2 marks, the tell, the cold flag and how overdue each lock was, none
 * of which costs a second. Driven through the shipped machine on `TABLE_PACE` — the student who IS
 * both published tables byte for byte, so every honest rate is exactly 1.000 and any deviation is
 * this estimator's own — over 25 corpus saves per row, five COMPLETED jobs of the history's shape:
 *
 *      history→tonight   share (round 3)        by count on tonight's ramp
 *      RUN   → RUN       mean 1.015  |a−1| .050     mean 1.000   |a−1| .000
 *      JOB   → JOB       mean 0.942  |a−1| .107     mean 1.000   |a−1| .000
 *      JOB12 → JOB12     mean 0.933  |a−1| .099     mean 1.000   |a−1| .000
 *      VAULT → VAULT     mean 1.012  |a−1| .041     mean 1.000   |a−1| .000
 *
 * — same-shape, the ramp is EXACT, because tonight's ramp at `k` is that job's own table cost when
 * the two drafts are the same shape and the same length, and the shipped-table student's `tAnswer`
 * is that number to the second. The 6 % the share estimator was low is directly measurable as the
 * thing `share` assumes away: over ten seasoned saves, tonight's board posts **0.356 points per
 * answer-second against the five jobs behind it at 0.382** — a 7 % gap, and per job the figure runs
 * 0.30 … 0.48 on one save. `share` prices a past job as though that number were the same for both,
 * and it is not, because `posted` carries the day's realised ×2 marks, the tell, the cold flag and
 * how overdue each lock was, none of which costs an answer second.
 *
 * ACROSS SHAPES THE RAMP IS WORSE, AND BY A LOT, so `share` keeps that case: a RUN's six locks are
 * whatever was due, while tonight's JOB12 ramp at 6 is its six CHEAPEST targets, and the same sweep
 * reads `RUN → JOB12` at mean 2.129 (worst 3.333) by count against 1.025 (worst .192) by share. The
 * published nominal `tierMix` rows cannot bridge them either — correcting the ramp by
 * `nominal(e.shape, k) / nominal(tonight.shape, k)` reads `RUN → VAULT` at 3.198, because `tierMix`
 * is a budget and not a draft (`data/job.js`: a posted JOB's real mix runs T1 ≈ 4 / T2 ≈ 5.4 against
 * the published `{1: 8, 2: 2}`). So the rule is the one the evidence supports and no more: tonight's
 * own ramp where the shapes agree AND tonight's ramp actually REACHES that many targets, the posted
 * share everywhere else. The reach condition is not a detail — a same-shape Page can serve 19 locks
 * against tonight's 10 (`tests/job-week.test.mjs`'s D−7 save), and past its last entry `rampAt`
 * extends at the dearest target's own cost, which is the right bias for a walked prefix and a wild
 * extrapolation for a whole job nearly twice tonight's length: 1 350 s of "table" against 540 s of
 * real ramp, a rate of 0.66, and a board 7 points from the headline that the posted share puts
 * inside the band.
 *
 * WHAT IS LEFT, MEASURED AND PUBLISHED RATHER THAN CLAIMED AWAY: across shapes the same sweep reads
 * the answer term 0.93–1.03 in the mean and up to 0.213 off in a cell, and the decision term up to
 * 0.409 off, for a student whose every stem and every beat is the published table. That is an
 * information limit in `save.game.log` — it keeps a shape, a count and a posted value, and the tier
 * mix and the day's multipliers are gone — and it is what COMPOSED-GAME G1 statement 2's
 * cross-shape band is now published from (`designs/SPEC-CORRECTIONS.md`), not a residue this
 * docblock asserts is zero.
 *
 * A JOB OF SOME OTHER SHAPE THAT WAS WALKED OUT OF cannot be priced by `share` at all, and round 3's
 * repair did it anyway — `share × prefixFraction`, the whole job's posted times the answered fraction
 * of tonight's ramp.
 * Both halves are defensible and the PRODUCT is not, because the two things the entry's `posted`
 * carries — the expensive TAIL the student never reached, and the day's realised ×2 marks, which
 * cost no seconds at all — are exactly the two things a prefix does not contain. Driven through the
 * shipped machine on a student who IS the tables (so every honest ratio is 1.000 and any deviation
 * is this estimator's own), five jobs each walked one target in, every answered target costing
 * exactly its published 30 s:
 *
 *      save 0 VAULT  rate 0.918      save 1 VAULT  rate 0.628
 *      save 2 JOB    rate 1.075      save 3 JOB    rate 0.962        (truth: 1.000, all of them)
 *
 * — save 1's five entries recorded `posted` 278, 264, 163, 236 and 351 for five identical tier-1
 * stems, and the spread went straight into the denominator. On the board that is 8 to 11 points at
 * the published 5 (`agreeWithinPoints`), in BOTH directions, on a line labelled with the student's
 * own last five jobs.
 *
 * SO A PREFIX IS PRICED BY COUNT, ON TONIGHT'S OWN RAMP. The one thing the entry says about the part
 * that was answered is HOW MANY TARGETS it was, and a job is served on the 1→4 tier ramp (G1;
 * `page.js arrangeJob` enforces it, `draftUnion` re-enforces it), so the first `k` targets of any
 * board are the cheap end of a ramp like tonight's. `ramp.answer[k]` is what tonight's own first `k`
 * targets cost at the table — a real board's real tier mix, not the shape's nominal `tierMix` row,
 * which nothing composes exactly. No `posted` term enters, so neither the tail nor the ×2 can.
 * Past the end of tonight's ramp (a JOB12 walked at 10 against a RUN tonight) it is extended at the
 * dearest target's own cost rather than saturating, so a longer prefix is never cheaper.
 *
 * Both terms get the same treatment and each off its own table, because they disagree about how much
 * cheaper the cheap end is: 4 of a JOB-10's 10 is 29 % of its answer seconds (four tier-1 stems at
 * 30 s against 8×30 + 2×90) but 37 % of its decision seconds (the beats are far flatter across
 * tiers). The shape's published `tierMix` is still the fallback for a board with no draft yet.
 *
 * `postedAnswered` — the answered prefix's own posted value — wins outright if a writer ever records
 * one: `shareOf` prefers it and the job is then priced as a whole job of that size, with no estimate
 * at all. Nothing in the repo writes it, and nothing should: the board lane MEASURED the proposal
 * and REFUTED it (notes/repair-board.md — `state.endJob` writing the whole queue's posted into that
 * field reproduces the round-3 defect exactly, and `tests/job-board.test.mjs`'s own control does
 * precisely that to reproduce it). The remaining useful field is `calls`.
 */
/** tonight's cumulative ramp at `k` targets, extended past its end at the dearest target's cost */
function rampAt(arr, k) {
  const n = arr.length - 1;
  if (k <= n) return arr[k];
  const step = n >= 1 ? arr[n] - arr[n - 1] : 0;
  return arr[n] + (k - n) * step;
}

/** is tonight's board carrying a usable two-term ramp over its own drafted queue? */
const hasRamp = (ramp) => Array.isArray(ramp?.answer) && ramp.answer.length > 1 && ramp.answer.at(-1) > 0
  && Array.isArray(ramp.decision) && ramp.decision.length === ramp.answer.length;

function expectedSecondsFor(e, tonight, share) {
  const answerS = num(tonight?.answerS, 0);
  const decisionS = num(tonight?.decisionS, 0);
  const queued = queuedTargetsOf(e, tonight);
  const answered = num(e?.targets, 0);
  /* an exact answered-basis entry is already a whole job of its own size — `shareOf` used it */
  const exact = Number.isFinite(e?.postedAnswered) && e.postedAnswered > 0;
  const ramp = tonight?.ramp;
  /* TONIGHT'S OWN SHAPE IS PRICED ON TONIGHT'S OWN RAMP, whole job or prefix (see above): same shape
     and same length makes `ramp.answer[k]` that job's own table cost exactly, with no `posted` term
     in it, so none of the day's multipliers can reach the denominator.
     ONLY WHERE THE RAMP REACHES. `rampAt` extends past its last entry at the DEAREST target's own
     cost, which is the right bias for a PREFIX (a longer prefix is never cheaper) and is a wild
     extrapolation for a whole job nearly twice tonight's length — and those exist: a JOB whose Page
     served 19 locks against tonight's 10 (`tests/job-week.test.mjs`'s D−7 save) reads 1 350 s of
     "table" against 540 s of real ramp, and the rate comes out 0.66 for a student the share
     estimator puts inside the band. Past `queue.length` there is no measurement of tonight's, only
     an extension, and the posted share — which does carry the past job's own size — is better. */
  const withinRamp = hasRamp(ramp) && answered <= ramp.answer.length - 1;
  if (!exact && answered > 0 && e?.shape != null && e.shape === tonight?.shape && withinRamp) {
    return { answer: rampAt(ramp.answer, answered), decision: rampAt(ramp.decision, answered) };
  }
  if (exact || !(queued > 0) || !(answered > 0) || answered >= queued) {
    return { answer: answerS * share, decision: decisionS * share };
  }
  if (hasRamp(ramp)) {
    return { answer: rampAt(ramp.answer, answered), decision: rampAt(ramp.decision, answered) };
  }
  /* no draft yet: the shape's published nominal mix, one fraction per term (`rampFractionOf`) */
  const part = Math.max(0, Math.min(1, answered / queued));
  return {
    answer: answerS * share * (rampFractionOf(e?.shape, answered, ANSWER_MINUTES_PER_TIER) ?? part),
    decision: decisionS * share * (rampFractionOf(e?.shape, answered, DECISION_SECONDS) ?? part),
  };
}

/**
 * What fraction of a shape's `table` cost its first `answered` targets are — the ANSWERED PREFIX of
 * the 1→4 ramp, in the table's own units, off the shape's published nominal `tierMix`. Returns null
 * for a shape with no published mix, so the caller can fall back to the flat count share.
 */
function rampFractionOf(shapeId, answered, table) {
  const mix = SHAPES[shapeId]?.tierMix;
  if (!mix) return null;
  const tiers = Object.keys(mix).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  let total = 0;
  for (const t of tiers) total += num(mix[t], 0) * num(table[t], 0);
  if (!(total > 0)) return null;
  let taken = 0;
  let seen = 0;
  for (const t of tiers) {
    const n = num(mix[t], 0);
    taken += Math.max(0, Math.min(n, answered - seen)) * num(table[t], 0);
    seen += n;
  }
  return Math.max(0, Math.min(1, taken / total));
}

/** The published fixed-phase column a shape reads (`SHAPES[id].fixed`), default path. */
const fixedColumnOf = (id) => (FIXED_PHASES[SHAPES[id]?.fixed] ?? FIXED_PHASES.JOB).default.phases;

/**
 * meansForShape(base, log, shapeId) — the student's rolling phase means, RE-EXPRESSED IN TONIGHT'S
 * SHAPE'S OWN COLUMN.
 *
 * `game.ledger.phaseMeans` is one number per phase, blended over whatever shapes the student has
 * played, and `projectFor` spent it as if a board read were a board read. It is not: `FIXED_PHASES`
 * publishes a RUN's board at 12 s against a JOB's 18, its getaway at 20 against 25 and its debrief
 * at 40 against 65, because a RUN is a shorter sitting with less on the board. So a student whose
 * five jobs were JOBs had a RUN night projected with a JOB's fixed phases, and on the cross-shape
 * walkthrough that alone was worth 3.4 points before round 2 touched anything — and it was worth 7
 * once the decision term (`tGame` minus these very means) started being rated against them, because
 * the error then entered the projection twice.
 *
 * The two published columns are the conversion: scale each mean by tonight's column over the blend
 * of the columns the jobs on record used. A student with no history, or one whose history is all
 * the same column as tonight, is unchanged — the ratio is 1.
 */
function meansForShape(base, log, shapeId) {
  const here = fixedColumnOf(shapeId);
  const recent = log.slice(-SPLIT.projectionWindowJobs);
  const cols = recent.length
    ? recent.map(e => fixedColumnOf(SHAPES[e?.shape] ? e.shape : 'JOB'))
    : [FIXED_PHASES.JOB.default.phases];     // what PHASE_MEANS_DEFAULT itself is
  const out = { ...base };
  for (const k of Object.keys(PHASE_MEANS_DEFAULT)) {
    const ref = cols.reduce((s, c) => s + num(c[k], 0), 0) / cols.length;
    const mine = num(here[k], 0);
    if (ref > 0 && mine > 0) out[k] = num(base[k], 0) * (mine / ref);
  }
  return out;
}

/**
 * personalRates(save, means, tonight) → `{ answer, decision }`, the student's own pace as a MULTIPLE
 * of the two shipped tables, measured over their last `SPLIT.projectionWindowJobs` real jobs.
 *
 * Per logged job, both sides of each ratio are seconds:
 *   answer    measured `tAnswer`        ÷ what the tables say a job of that shape and length costs
 *   decision  measured `tGame − fixed`  ÷ the same, for `DECISION_SECONDS`
 * where `fixed` is that student's own rolling phase means for the phases `tGame` also contains
 * (board, guard, brief × the windows a job of that length reaches, getaway), so what is left of
 * `tGame` is the per-target decision surface, which is precisely the term being rated.
 *
 * THE ONE PLACE THIS COULD HAVE GONE WRONG, and how the denominator is built. `save.game.log` keeps
 * a job's `shape` and `targets` but NOT its tier mix, so the expected cost of a past job has to be
 * estimated — and the obvious estimate, the shape's published `tierMix`, is biased: a composed
 * JOB-10 is not `SHAPES.JOB.tierMix`, it is whatever `composePage` had due that night, and it is
 * biased the same way every night for the same student. Rating a measurement against a biased
 * reference and then spending the rate on an UNBIASED one (tonight's real draft) puts the bias into
 * the answer twice: it took `RUN/default` from a 1-point agreement to 11, on the walkthrough that is
 * driven by the tables themselves.
 *
 * THE TWO TERMS THIS PARAGRAPH USED TO NAME DO NOT EXIST (round-3 verification, board-schedule). It
 * read "each past job's denominator carries the SAME deviation tonight's draft has from its own
 * shape's nominal row (`biasA`, `biasD` below)", and `grep -rn 'biasA\|biasD' site/ tests/ notes/`
 * returned exactly one hit: this sentence. Nothing computed them; the paragraph explained the
 * estimator's unbiasedness by naming two terms the shipped function never had. What the code does,
 * and what the deviation is measured to be, is written where it happens (`expectedSecondsFor`):
 * a past job of TONIGHT'S OWN shape is priced on tonight's own drafted ramp by count, which is that
 * job's own table cost exactly and is why `TABLE_PACE` now reads 1.000/1.000 there; a job of any
 * other shape is priced by `share`, the posted proxy, whose residual deviation is measured, bounded
 * and published rather than asserted to cancel.
 *
 * Each job's ratio is clamped to `[RATE_MIN, RATE_MAX]` and then pooled, so one outlier
 * is bounded rather than dominant — and when EVERY rated job is at the same bound, `bounded` says
 * so and `projectFor` stops calling the result a measurement. A student with no job on record rates 1 and 1 — exactly the
 * shipped projection, printed `projected`.
 */
function personalRates(save, base, tonight) {
  const log = jobsOnRecord(save);
  const recent = log.slice(-SPLIT.projectionWindowJobs);
  const here = SHAPES[tonight?.shape] ?? SHAPES.JOB;
  /* tonight's own draft is the calibration both denominators are built from: its answer seconds and
     its decision seconds PER POSTED POINT. `LOOT` is very nearly proportional to
     `ANSWER_MINUTES_PER_TIER` across the four tiers (6/30, 18/90, 38/180, 70/300 = .200 .200 .211
     .233), so a job's own posted value — which the log DOES keep, and which the tier mix is what
     moves — is the best available stand-in for the tier mix the log does not keep, ACROSS SHAPES.
     A job's target COUNT is not: a RUN's six locks are whatever was due, while a JOB12's first six
     are its six cheapest, so a count-based denominator rates a RUN history against a JOB12's cheap
     slice and reads 2.129 for a student whose every stem is the table (`expectedSecondsFor`). Within
     tonight's OWN shape the comparison is like for like and the count is exact, which is the case
     `expectedSecondsFor` takes off this proxy and prices on tonight's real ramp instead. */
  const per = Math.max(1, num(tonight?.targets, here.targets));
  const postedHere = num(tonight?.posted, 0);
  const postedOf = (e) => (Number.isFinite(e?.postedAnswered) && e.postedAnswered > 0
    ? e.postedAnswered                                    // an exact answered-basis entry, if one is ever written
    : num(e?.posted, 0));
  const shareOf = (e) => (postedHere > 0 && postedOf(e) > 0
    ? postedOf(e) / postedHere                            // by posted value: the tier mix's own proxy
    : num(e?.targets, 0) / per);                          // a job recorded at posted 0 (CALL IT): by count
  /* `lo` / `hi` count the jobs whose own ratio left `[RATE_MIN, RATE_MAX]` and was clamped INTO it,
     per side. When every rated job is on the same side the pooled rate IS that bound and not the
     student — see `bounded` below, and `projectFor`'s label. */
  const answer = { meas: 0, exp: 0, n: 0, lo: 0, hi: 0 };
  const decision = { meas: 0, exp: 0, n: 0, lo: 0, hi: 0 };
  /**
   * A WHOLE JOB OUTRANKS A PREFIX, AND A PREFIX IS THE FALLBACK RATHER THAN A PEER
   * (round-2 verification, board-schedule).
   *
   * A prefix's `tAnswer` is exact — `applyTarget` folds only a completed answer into it — so round 1
   * was right that the answer term CAN rate a walked job. What it cannot do is treat that rating as
   * evidence about tonight's whole job, because a prefix only ever measures the CHEAP END of the
   * ramp, and a student's pace is not one number across the tiers. This file's own CLOCK is the
   * example: 44 s on a tier-1 stem against a published 30 (rate 1.47) and 71 s on a tier-2 against a
   * published 90 (rate 0.79). A JOB-10 walked at 5 answers five tier-1 stems and nothing else, so it
   * reads 1.47 — the student's true tier-1 pace, correctly measured — while the same student's whole
   * ten-target job reads 0.96. Pooling the two by expected seconds then splits the difference: four
   * such prefixes and one finished job read 1.25 where the truth is 0.96, and the board printed
   * 25 % game against a debrief headlining 30.0 on nine of the fifty corpus saves — under the words
   * `your last 1 job`, which is a `ledger` line, not a `projected` one.
   *
   * Four prefixes are not four independent observations either: they are four readings of the SAME
   * corner of the ramp, and the pooled estimator weights them as if they were. So the window's
   * whole jobs — the ones whose basket is tonight's basket — are the answer term's evidence whenever
   * it has any, and the prefixes are what it falls back to when the window holds nothing else. That
   * is the rule the DECISION term already follows (it abstains on a prefix); the difference is that
   * the answer term must not abstain outright, because a tier-1-weighted rate the student really
   * produced is still far better than `1` — the shipped table, i.e. the brochure — and the fallback
   * is exactly the case the line labels `projected`. Measured at five of five, with the fallback and
   * with the shipped tables instead, over 200 cells per clock: a slow answerer goes from 0 % of
   * cells outside the published band to 100 % without it, and a deliberator's median error doubles
   * (14.2 → 30.2). The one clock it costs is the clock whose whole-job pace already IS the table.
   */
  const ratesPrefixes = !recent.some(e => reachedGetaway(e, tonight));
  /**
   * POOLED, not a mean of per-job ratios: `Σ measured / Σ expected` is the unbiased estimator of one
   * pace over several sittings, and the mean of ratios is not (it reads a 10-target job and a
   * 6-target job as equal evidence, and Jensen pulls it away from the truth — on the cross-shape
   * walkthrough the mean of ratios said 0.88 where the pooled ratio says 1.00 for a student who IS
   * the tables).
   *
   * AN OUTLIER IS BOUNDED, NOT DELETED (round-1 verification, split-honesty BLOCKER). A job whose
   * own ratio leaves `[RATE_MIN, RATE_MAX]` is a phone left on the answer screen, and this used to
   * DROP it from both sums. Dropping is not a bound, it is a deletion — and the deletions are not
   * independent of each other: the clamp is measured against ONE shipped table, so a student who is
   * outside it on one stem is outside it on all of them. A flat clock (taps and reveals — 15 s on a
   * VAULT's tier-3/4 originals is "I don't know it, reveal", not a phone) emptied the whole window
   * at once, `rate()` fell back to 1, and the board printed the shipped table's own projection under
   * the words `your last 5 jobs` — 46.7 to 58.1 points from the debrief headline, and a CLIFF, not a
   * gradient: five seconds per stem flipped the line from the student's own number to the brochure's
   * with no change to the sentence. Clamping the ratio INTO the interval keeps the job in the window
   * and bounds the error at the clamp, which is what the docblock above always claimed this did.
   * `exp` is banked unchanged so the pooling still weights each job by how much of it there was.
   *
   * A BOUND IS NOT A MEASUREMENT EITHER, AND THE LABEL NOW SAYS SO (round-3 verification,
   * split-honesty BLOCKER). Bounding fixed the CLIFF and left the CONSTANT: once every job in the
   * window is outside the same end of `[RATE_MIN, RATE_MAX]`, the pooled ratio IS that end, and it
   * stops moving while the student keeps getting faster. Driven through the shipped machine on a flat
   * clock — the same `sec` on every stem, table pace on every beat, which is taps-and-reveals on a
   * VAULT's tier-3/4 originals and not a phone — with five completed seasoning jobs and one measured,
   * on corpus save 0, the `ledger` line printed:
   *
   *      20 s/stem  ~59 % · your last 5 jobs   debrief 58.8   gap  0.2   rateA 0.316
   *      15 s/stem  ~66 %                      debrief 65.5   gap  0.5   rateA 0.237
   *      12 s/stem  ~70 %                      debrief 70.4   gap  0.4   rateA 0.195
   *      10 s/stem  ~73 %                      debrief 74.0   gap  1.0   rateA 0.173
   *       8 s/stem  ~73 %                      debrief 78.1   gap  5.1   rateA 0.167  ← the bound
   *       6 s/stem  ~73 %                      debrief 82.6   gap  9.6   rateA 0.167  ← the bound
   *
   * — one printed sentence for three students the debrief separates by nine points, and over the
   * fifty corpus saves at 8 s/stem it is 45 of 50 cells outside the published 5 (worst 20.4), every
   * one of them a `ledger` line. The clamp itself is right and widening it only moves the cliff. What
   * was wrong is the LABEL: at the bound the number on the board is `RATE_MIN × the shipped table`,
   * which is no more the student's own than the shipped table is, so `lo`/`hi` are counted here and
   * `projectFor` demotes the line to `projected` — the same information state the five-of-five walk
   * register already demotes for, and the same word job 1 uses. The number does not change; the claim
   * does. The opposite end costs almost nothing in printed points (the split is a ratio, so it
   * saturates: `k = 10 × both tables` reads a clamped rate of 6.000 and a median gap of 2.0), but it
   * is the same information state and is demoted on the same rule rather than on a measurement of
   * how much it happens to hurt.
   */
  const add = (acc, meas, exp) => {
    if (!(exp > 0 && meas > 0)) return;
    const raw = meas / exp;
    if (raw < RATE_MIN) acc.lo++; else if (raw > RATE_MAX) acc.hi++;
    acc.meas += exp * clampRate(raw); acc.exp += exp; acc.n++;
  };
  for (const e of recent) {
    const id = SHAPES[e?.shape] ? e.shape : 'JOB';
    const s = SHAPES[id];
    const targets = num(e.targets, 0);
    /* The measured seconds are the ANSWERED targets' own, so the expectation they are rated against
       has to be the answered targets' too — otherwise a mid-job WALK reads as a student 2–5× faster
       than they are. `share` prices a job that finished (its `posted` over tonight's); a job that
       was walked out of is priced by COUNT on tonight's ramp, because its `posted` is the tail it
       never reached (`expectedSecondsFor`). */
    const share = shareOf(e);
    const exp = expectedSecondsFor(e, tonight, share);
    /** did this job answer its whole drafted queue? both terms turn on it — see `queuedTargetsOf` */
    const isWholeJob = reachedGetaway(e, tonight);
    /* that job's OWN fixed phases: the student's means re-expressed in the column ITS shape used */
    const m = meansForShape(base, log, id);
    const landed = Math.min(s.briefs ?? 0, BOARD.briefAfterTargets.filter(n => n < targets).length);
    /* the phases that job REALLY sat through. `tGame` holds the board read, the guard, the windows
       that landed inside the answered stretch and — only if the job got that far — the getaway. A
       job walked at target 3 never saw a getaway, so subtracting its 25 s from `tGame` charges the
       decision term with seconds that were never spent and depresses a partial job's decision rate
       on top of the `posted` error above (round 3, split-honesty). */
    const fixedS = m.board + m.guard + m.brief * landed + (isWholeJob ? m.getaway : 0);
    /**
     * `tAnswer` IS A PREFIX; `tGame` IS NOT (round-1 verification, split-honesty / board-schedule).
     *
     * `state.applyTarget` folds an answered target's seconds into `tAnswer` and nothing else does,
     * so a job walked after `k` answers recorded exactly `k` answers' worth of answering — measured
     * through the shipped machine on a table-pace student, `tAnswer` is 30 s, 120 s, 180 s … to the
     * second. The answer term can therefore rate a prefix.
     *
     * The decision surface cannot: it is a CYCLE per target — CALL, answer, BAG/PUSH — and the WALK
     * button is live inside every one of them, so `tGame − fixed` after `k` answers lies anywhere in
     *
     *      [ (k−1)·D + call ,  k·D + call ]          D = that target's `DECISION_SECONDS`
     *
     * depending on whether the student walked during target k's payout beat or after locking target
     * k+1's call, and NOTHING in the entry distinguishes the two. At k = 1 that interval is 5 s to
     * 19 s against a 14 s table — the same student reads 0.36 or 1.36 — and a window of five such
     * jobs reads a pace the student never had: 9.6 to 11.2 points off the debrief headline on the
     * walk-at-the-beat harness, 5.2 to 6.6 the other way on the walk-at-the-stem one, for a student
     * who IS the tables in both. The width is one whole cycle at every k, so the read is only ever
     * as good as k is large, and at k = 1 it is worthless.
     *
     * So the decision term rates the jobs whose measurement is a WHOLE number of cycles, and abstains
     * on the rest. It is not a drop for convenience: the answer term keeps every walked job, and when
     * the whole window is walks the abstention is visible — `projectFor` prints `projected`, not
     * `your last 5 jobs`, because half of that number would then be the shipped table's.
     */
    if (isWholeJob || ratesPrefixes) add(answer, num(e.tAnswer, 0) / 1000, exp.answer);
    if (isWholeJob) add(decision, (num(e.tGame, 0) / 1000) - fixedS, exp.decision);
  }
  const rate = (acc) => (acc.n > 0 && acc.exp > 0 ? clampRate(acc.meas / acc.exp) : 1);
  /** the pooled rate IS a clamp bound: every rated job left the same end of `[RATE_MIN, RATE_MAX]` */
  const bounded = (acc) => acc.n > 0 && (acc.lo === acc.n || acc.hi === acc.n);
  return {
    answer: rate(answer), decision: rate(decision),
    jobsOnRecord: log.length,
    n: { answer: answer.n, decision: decision.n },
    /** per term: is this number the student's pace, or the bound the clamp put it at? */
    bounded: { answer: bounded(answer), decision: bounded(decision) },
  };
}


const clampRate = (r) => (Number.isFinite(r) ? Math.min(RATE_MAX, Math.max(RATE_MIN, r)) : 1);

/* ================================================================= buildJob */

/**
 * buildJob(save, opts) → `inProgress.game`, exactly the sixteen keys of `data/job.js IN_PROGRESS_KEYS`
 * so `store.js` can round-trip it. The drafted queue (for `inProgress.queue`), the board it came from
 * and the priced draft ride along as NON-ENUMERABLE properties, so `JSON.stringify`, `structuredClone`
 * and `assert.deepStrictEqual` all see only the sixteen persisted keys. `jobQueueOf(game)` reads them.
 *
 * @param {object} save
 * @param {object} [opts]  `board`, `picks`, `tokens`, `now`, `today`, `jobIndex`, `shape`, `seed`
 */
export function buildJob(save, opts = {}) {
  const now = opts.now ?? Date.now();
  const board = opts.board ?? postBoard(save, opts.today ?? null, { ...opts, now });
  const picks = Array.isArray(opts.picks) && opts.picks.length
    ? opts.picks
    : (board.recommend?.picks ?? board.bundles.map(b => b.id));
  const drafted = draftFrom(board.bundles, picks, { x2: board.x2.marks });
  const tokens = opts.tokens ?? board.press.tokens;
  const wing = drawGuard(board.guard, board.seed);
  const rank = rankOf(save);

  const game = {
    shape: board.shape,
    seed: board.seed,
    bundles: board.bundles.slice(0, CAPS.bundles).map(serializeBundle),
    picks: drafted.picks.slice(),
    tokens: { ...tokens },
    guard: {
      wing,
      dist: { ...board.guard.byWing },
      eps: board.guard.eps,
      mult: guardMultFor(rank),
      drawnAt: now,
    },
    loose: 0,
    bagged: 0,
    chain: 0,
    calls: [],
    briefs: [],
    vault: board.vault?.id ?? null,
    tGame: 0,
    tAnswer: 0,
    phase: 'board',
    phaseAt: now,
  };
  define(game, 'queue', drafted.queue);
  define(game, 'draft', drafted);
  define(game, 'board', board);
  return game;
}

/** The queue `buildJob` drafted for `inProgress.queue` (non-enumerable on the game object). */
export const jobQueueOf = (game) => game?.queue ?? null;
/** The board `buildJob` drafted from (non-enumerable on the game object). */
export const jobBoardOf = (game) => game?.board ?? null;

function define(obj, key, value) {
  Object.defineProperty(obj, key, { value, enumerable: false, writable: true, configurable: true });
}

/** A contract as the save stores it: ids only, no target objects (G7's ≈ 2.1 KB budget for a live job). */
function serializeBundle(b) {
  return {
    id: b.id, label: b.label, overflow: b.overflow, wing: b.wing,
    posted: b.posted, minutes: b.minutes, grade: b.grade, cold: b.cold,
    locks: b.locks.slice(),
  };
}

export { coverageOf, criticalReplicationFor, projectFor };   /* + projectFor (one-line addition by the screen lane, BUILD-POLICY §2): `screens/job.js` re-prices the primary button for the draft ON SCREEN, and the split and the wall clock are this function's — notes/repair-screen.md Request 1 asks for a `quoteFor(board, picks)` here instead. */
