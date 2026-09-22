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
 * defeated RELOAD-scumming; this is what closes the other half. A walk now re-posts the SAME board.
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
 * `posted <gross> (−<shared> shared)` and the row of contract letters.
 * @returns the `draftUnion` result, with `line`, `label` and `net` added.
 */
export function draftFrom(bundles, picks, opts = {}) {
  const d = draftUnion(bundles, picks, opts);
  return {
    ...d,
    net: d.postedNet,
    gross: d.postedGross,
    label: d.picks.join(' '),
    /* both halves are `data/job.js COPY` — the flat case used to be a local literal here, which is
       how `COPY.postedFlat` came to have zero call sites while this file printed its text anyway
       (round 3, player-feel). One copy of the string, in the copy file. */
    line: d.shared > 0 ? COPY.postedNet({ gross: d.postedGross, shared: d.shared }) : COPY.postedFlat({ posted: d.postedNet }),
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
  const marks = x2Marks(day, jobIndex, budget.targets);

  /* every legal draft, priced, so the board sheet is complete and the recommendation is derived */
  const drafts = legalDrafts(bundles.bundles.length, bundles.draft)
    .map(p => draftFrom(bundles.bundles, p, { x2: marks }));
  const recommend = pickRecommended(drafts);

  /* the guard: support = the wings the posted contracts actually touch (G3.4, G12 #11) */
  const support = bundles.wings.length ? bundles.wings : undefined;
  const dist = guardDist(save, { support });
  const values = wingValues(save, (recommend?.queue ?? bundles.pool.map(t => t.item)));
  const press = pressAdvice(dist, values.byWing);

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
    deferredLine: bundles.deferred.length
      ? `${bundles.deferred.length} due ${bundles.deferred.length === 1 ? 'review is' : 'reviews are'} not posted tonight · they lead the next board`
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
    supplyLines: bundles.supplyLines,
    x2: { marks, count: marks.filter(Boolean).length, p: X2.p },
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
    /** the drafted union's payout, `posted 100 (−5 shared)`, for a screen that prints it on its own */
    postedLine: recommend ? recommend.line : null,
    /**
     * THE PRIMARY BUTTON, in the form G1 publishes:
     *
     *   [ TAKE THE POSTED JOB · A D E · 10 targets · posted 100 (−5 shared) · ~14 min · ends 20:31 · 48 % game ]
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
        recommend.line,                         // posted 100 (−5 shared) — what it pays
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
 * draft, and the projection needs both. A student who answers at the table's pace has rates of 1
 * and the number does not move; a student who takes twice as long over a stem sees their own
 * answer half of the split double. Nothing here is a constant the student never produced except on
 * job 1, where the rates are 1, the source is `projected`, and the line says so.
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
  /* how many REAL jobs are behind them — a zero-target walk is not one (G1: "your last N jobs") */
  const jobs = Math.min(SPLIT.projectionWindowJobs, rates.jobsOnRecord);
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
 * stand-in: J5's own acceptance row is that every legal draft serves the shape's target count
 * exactly (99.5 % of drafts, ±1 otherwise), which is exactly the quantity wanted here. A brief
 * window's swap can make a job LONGER than its shape, so the ratio is clamped at 1 and a job at or
 * past its shape's count is treated as complete.
 *
 * `queueTargets` is the field a writer should record if it ever wants to be exact; it is preferred
 * over the shape's row wherever it appears, and nothing in the repo writes it today.
 */
const queuedTargetsOf = (e) => (Number.isFinite(e?.queueTargets) && e.queueTargets > 0
  ? e.queueTargets
  : num(SHAPES[e?.shape]?.targets, 0));

/** true when the entry's job answered its whole drafted queue — so it reached the getaway phase */
const reachedGetaway = (e) => {
  const queued = queuedTargetsOf(e);
  return !(queued > 0) || num(e?.targets, 0) >= queued;
};

/**
 * HOW MUCH OF THAT JOB THE STUDENT ACTUALLY ANSWERED, per term (round 3, split-honesty).
 *
 * Round 2 made the two per-target terms the tables scaled by the student's own measured rate, and
 * built each past job's denominator on the log's `posted` (the tier mix's only available proxy —
 * see `personalRates`). That is right for a job that ran to the getaway and wrong for one that did
 * not: a student who answers 3 of 10 and walks contributes 3 targets of measured seconds against 10
 * targets of expectation, and the pooled `Σ measured / Σ expected` then reads them as 2–5× faster
 * than they are. Measured on this lane's own corpus, a table-pace student whose honest split is
 * 27.1 %, seasoned with N mid-job walks at target 4 of 10:
 *
 *      mid-job walks in the last 5 jobs    0      2      3      5
 *      board printed, before              27     31     37     69
 *      board prints, after                27     28     29     31
 *      debrief headlined                27.1   27.1   27.1   27.1
 *
 * — a line labelled `your last 5 jobs` missing the number the student's eye lands on by 41.9 points,
 * off a failure state G1 documents and prices (`WALK`, "Walked (quit, 50 % auto-bag)"). Round 2
 * fixed the ZERO-target half of this (a walk with nothing answered is not a job on record,
 * `jobsOnRecord`); this is the partial half.
 *
 * TWO FRACTIONS, NOT ONE, because the two terms are in different units. A job is served on the 1→4
 * tier ramp (G1; `page.js arrangeJob` enforces it), so the targets a walker answered are the
 * CHEAPEST ones — and the two tables disagree about how much cheaper: 4 of a JOB-10's 10 is 29 % of
 * its answer seconds (four tier-1 stems at 30 s against 8×30 + 2×90) but 37 % of its decision
 * seconds (the beats are far flatter across tiers). One flat `answered / targets` for both is wrong
 * in both directions at once; the shape's published `tierMix` and the two published tables give the
 * right fraction for each, and both are exactly 1 for a job that answered everything, so nothing on
 * the completed path moves.
 *
 * A `postedAnswered` field on the entry wins if a writer ever records one — that is the exact
 * quantity and this is the estimate of it (see notes/board-fix.md Requests).
 */
const WHOLE_JOB = Object.freeze({ answer: 1, decision: 1 });
function prefixFractionsOf(e, ramp) {
  const queued = queuedTargetsOf(e);
  const answered = num(e?.targets, 0);
  if (!(queued > 0) || !(answered > 0) || answered >= queued) return WHOLE_JOB;
  const part = Math.max(0, Math.min(1, answered / queued));
  /* TONIGHT'S OWN RAMP is the reference, exactly as it is for `share` itself: this function's whole
     job is "how much of a job like tonight's is a prefix this long worth", and tonight's draft is a
     real board's real tier mix where the shape's published `tierMix` is a nominal row nothing
     composes exactly (a JOB12 whose nominal mix carries a tier-3 lock the Page had not got read 7
     points low on the walked cells). The shape's row is the fallback for a board with no draft yet. */
  if (Array.isArray(ramp?.answer) && ramp.answer.length > 1 && ramp.answer.at(-1) > 0) {
    const n = ramp.answer.length - 1;
    const k = Math.min(n, Math.max(1, Math.round(part * n)));
    return {
      answer: ramp.answer[k] / ramp.answer[n],
      decision: ramp.decision[n] > 0 ? ramp.decision[k] / ramp.decision[n] : part,
    };
  }
  return {
    answer: rampFractionOf(e?.shape, answered, ANSWER_MINUTES_PER_TIER) ?? part,
    decision: rampFractionOf(e?.shape, answered, DECISION_SECONDS) ?? part,
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
 * driven by the tables themselves. So each past job's denominator carries the SAME deviation
 * tonight's draft has from its own shape's nominal row (`biasA`, `biasD` below). The bias then
 * cancels wherever the student is playing the kind of job they have been playing, which is the case
 * the criterion is about, and tonight's own tier mix still moves the projection, which is what round
 * 1 added. Each job's ratio is clamped to `[RATE_MIN, RATE_MAX]` and then averaged, so one outlier
 * is bounded rather than dominant. A student with no job on record rates 1 and 1 — exactly the
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
     moves — is the best available stand-in for the tier mix the log does not keep. A job's target
     COUNT is not: a RUN's six locks are the six lowest-tier of the same pool a JOB-10 draws ten
     from, so a per-target denominator rates a student's JOB history against a RUN's cheap slice and
     came out 7 points off on `RUN/full`. */
  const per = Math.max(1, num(tonight?.targets, here.targets));
  const postedHere = num(tonight?.posted, 0);
  const postedOf = (e) => (Number.isFinite(e?.postedAnswered) && e.postedAnswered > 0
    ? e.postedAnswered                                    // an exact answered-basis entry, if one is ever written
    : num(e?.posted, 0));
  const shareOf = (e) => (postedHere > 0 && postedOf(e) > 0
    ? postedOf(e) / postedHere                            // by posted value: the tier mix's own proxy
    : num(e?.targets, 0) / per);                          // a job recorded at posted 0 (CALL IT): by count
  const answer = { meas: 0, exp: 0, n: 0 };
  const decision = { meas: 0, exp: 0, n: 0 };
  /* POOLED, not a mean of per-job ratios: `Σ measured / Σ expected` is the unbiased estimator of one
     pace over several sittings, and the mean of ratios is not (it reads a 10-target job and a
     6-target job as equal evidence, and Jensen pulls it away from the truth — on the cross-shape
     walkthrough the mean of ratios said 0.88 where the pooled ratio says 1.00 for a student who IS
     the tables). A job whose own ratio is outside `[RATE_MIN, RATE_MAX]` is a phone left on the
     answer screen and is dropped from BOTH sums rather than clamped into them. */
  const add = (acc, meas, exp) => {
    if (!(exp > 0 && meas > 0)) return;
    const r = meas / exp;
    if (r < RATE_MIN || r > RATE_MAX) return;
    acc.meas += meas; acc.exp += exp; acc.n++;
  };
  for (const e of recent) {
    const id = SHAPES[e?.shape] ? e.shape : 'JOB';
    const s = SHAPES[id];
    const targets = num(e.targets, 0);
    /* `share` is the WHOLE job that entry recorded, as a fraction of tonight's draft; `prefix` is how
       much of that job the student actually answered before walking out, one fraction per term and
       both 1 on a job that finished (`prefixFractionsOf`). The measured seconds are the answered
       targets' own, so the expectation they are rated against has to be the answered targets' too —
       otherwise a mid-job WALK reads as a student 2–5× faster than they are. */
    const share = shareOf(e);
    const prefix = Number.isFinite(e?.postedAnswered) && postedHere > 0 && e.postedAnswered > 0
      ? WHOLE_JOB                                         // an exact answered-basis entry needs no estimate
      : prefixFractionsOf(e, tonight?.ramp);
    /* that job's OWN fixed phases: the student's means re-expressed in the column ITS shape used */
    const m = meansForShape(base, log, id);
    const landed = Math.min(s.briefs ?? 0, BOARD.briefAfterTargets.filter(n => n < targets).length);
    /* the phases that job REALLY sat through. `tGame` holds the board read, the guard, the windows
       that landed inside the answered stretch and — only if the job got that far — the getaway. A
       job walked at target 3 never saw a getaway, so subtracting its 25 s from `tGame` charges the
       decision term with seconds that were never spent and depresses a partial job's decision rate
       on top of the `posted` error above (round 3, split-honesty). */
    const fixedS = m.board + m.guard + m.brief * landed + (reachedGetaway(e) ? m.getaway : 0);
    add(answer, num(e.tAnswer, 0) / 1000, num(tonight?.answerS, 0) * share * prefix.answer);
    add(decision, (num(e.tGame, 0) / 1000) - fixedS, num(tonight?.decisionS, 0) * share * prefix.decision);
  }
  const rate = (acc) => (acc.n > 0 && acc.exp > 0 ? clampRate(acc.meas / acc.exp) : 1);
  return {
    answer: rate(answer), decision: rate(decision),
    jobsOnRecord: log.length,
    n: { answer: answer.n, decision: decision.n },
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

export { coverageOf, criticalReplicationFor };
