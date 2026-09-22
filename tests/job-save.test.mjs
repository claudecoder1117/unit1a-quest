// tests/job-save.test.mjs — J10. Save, offline, mid-job reload.
//
// AUTHORITY: COMPOSED-GAME.md G7 "Save-schema delta (v1 → v2), two new top-level keys"; BUILD-POLICY
// overrides it. This suite owns the four things that break silently and cost a student real work:
//
//   1. the v1 → v2 migration is lossless and idempotent, and a corrupt `player` / `game` is discarded
//      to defaults WITHOUT taking a sibling key with it;
//   2. the two keys are priced — a worst-case save with a 12-target job live adds ≤ 26 KB
//      (`SAVE_BUDGET_KB.totalAdded`; measured 25.69 KB), every LINE of G7's table is at or under its
//      own stated figure, and the `inProgress.game` fixture is a fixed point of the shipped
//      `js/job/state.js` serialiser so it cannot drift away from the record it is pricing;
//   3. killing the tab mid-job restores the whole job, and the PINNED SEED means re-opening cannot
//      re-roll the guard, the bundle partition or the ×2 (G3.7 proof 6 — the anti-quit-scum device);
//   4. every file a job needs is precached, so airplane mode after one load runs a job start to finish.
//
// Plus the handoff: `player` is in KEPT_KEYS and `game` in ARCHIVED_KEYS, both TOP-LEVEL, verified
// against a stub Unit-1B data set through the REAL `archiveUnit` — not a re-implementation of it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, posix } from 'node:path';
import {
  SAVE_KEY, SAVE_VERSION, CAPS, MIGRATIONS, KEPT_KEYS, ARCHIVED_KEYS,
  fresh, migrate, applyCaps, pack, unpack, createStore, archiveUnit,
  freshPlayer, freshGame, freshTag, normalizePlayer, normalizeGame,
} from '../site/js/store.js';
import { SAVE_DEFAULTS, TAG_RECORD_DEFAULT, CAPS as JOB_CAPS, BACKCHECK, SAVE_BUDGET_KB, WING_IDS, GUARD } from '../site/data/job.js';
// THIS build's make list — the thing `normalizeGame`'s crew filter is filtered against, and the thing
// the handoff suite has to prove a fixture make is NOT in, or its "nothing is deleted" test is vacuous.
import { SKILL_IDS } from '../site/data/skills.js';
// The SHIPPED `inProgress.game` serialiser. The budget suite measures what THIS writes, not a literal
// that drifted from it — `_helpers.mjs` may not import from `site/`, so the pinning happens here.
import { serialize, freshState, STATE_KEYS } from '../site/js/job/state.js';
// the STUDY layer's own queue writer — the other half of the split. Round 3 derives the attribution
// rule from the difference between what these two write, instead of maintaining it by hand.
import { startPage } from '../site/js/page.js';
// the GAME layer's before-snapshot writer (round 4). The STUDY layer's equivalent is a literal
// inside run.js's own mount, not an exported function, so it is read as SOURCE below.
import { captureJobBefore } from '../site/js/screens/run.js';
// the SHIPPED reader of `settings.game` — the layer's master switch is asserted through the function
// every screen calls, not through a copy of `!== false` typed into this file (round 3, finding 54).
import * as plan from '../site/js/plan.js';
/* ROUND 2: the budget is now measured against REAL jobs, not only against a literal. These are the
   shipped writers whose output the fixture claims to be no narrower than — driven end to end below
   in "the fixture is not NARROWER than the shipped writers". */
import {
  startJob, beginTargets, lockCall, applyTarget, bag, push, brief, crack,
  stateOf, callsAvailable, swapOptions,
} from '../site/js/job/state.js';
import * as call from '../site/js/job/call.js';
import * as guard from '../site/js/job/guard.js';
import { RATING } from '../site/data/job.js';
import { applyOutcome, DAY_MS } from '../site/js/schedule.js';
import { todayISO, addDays } from '../site/js/days.js';
import { cards as ALL_CARDS } from '../site/data/cards.js';
// the template registry — the corpus seeds `save.frozen` with real ids and their real
// `templateVersion`, so a frozen-Variant review is composed from a record the app could have written.
import { templates as TEMPLATES } from '../site/data/templates.js';
import { isBonus } from '../site/data/source-manifest.js';
// the 68 real Fault Index tags — the corpus seeds `errors[].tags` with them so a driven job writes
// real `game.tags` records, which is what the budget's largest line is measured against.
import { MISCONCEPTIONS } from '../site/data/misconceptions.js';
import { rngFrom } from '../site/js/rng.js';
import {
  ROOT, listFiles, stripCommentsAndStrings, GAME_RUN_FIELDS, worstCasePlayer, worstCaseGame,
  inProgressJob12, worstCaseBench, withoutGameKeys, WIDE_DOUBLE, WIDE_SIGNED_DOUBLE, WIDEST_SKILL, WIDEST_W, WIDEST_Q,
  // round 3: the two lines that were in no fixture and no budget row — the job's own queue fields
  // and the six trophies only a job can earn.
  worstCaseJobQueue, worstCaseGameTrophies, GAME_QUEUE_FIELDS, GAME_TROPHY_IDS,
  // round 5: the OTHER shape composePage writes into inProgress.queue — a frozen-Variant review,
  // which carries `frozenKey` and `templateVersion` and cannot carry `rename`/`bucket`/`overdue`/`sweep`.
  worstCaseFrozenReviewItem, FROZEN_REVIEW_FIELDS,
  JOB_QUEUE_DRAFTED, JOB_QUEUE_ITEMS, BENCH_ENTRIES,
  // round 4 (verify): the before-snapshot's six game fields — the same defect as the queue's, one
  // level further out (`inProgress.meta.before`, written by `screens/run.js captureJobBefore`).
  GAME_META_FIELDS, worstCaseJobBefore,
  // round 3, finding 55: the layer's bytes inside `save.archive[*]`, which the split cannot see
  // because they sit in both of its halves and cancel.
  archivedGameBytes,
} from './_helpers.mjs';
import { readList } from '../qa/gen-precache.mjs';

const T0 = Date.UTC(2026, 8, 16, 12);          // 2026-09-16 noon UTC
const SITE = join(ROOT, 'site');
const KB = 1024;

/* --------------------------------------------- a seeded corpus of REAL jobs (round 2)

   The budget's per-leaf widths are claims about what `js/job/*` writes, so they are checked against
   jobs the shipped code actually drives rather than against a literal in `_helpers.mjs`. Same shape
   as `job-state.test.mjs`'s corpus: real Leitner records with real `history`, so `call.qHatFor` has
   something to read and the rating window fills instead of staying empty.                        */
const NOW = new Date(2026, 8, 16, 18, 0).getTime();
const BANK = ALL_CARDS.filter((c) => !isBonus(c.id));
const CORPUS_SKILLS = ['VOC', 'NOTE', 'CLASS', 'ASN-PLP', 'ASN-ANG', 'PAIRS', 'FIG-ALG', 'BISECT-L', 'BISECT-Q',
  'SEG-ALG', 'CSARITH', 'CS-LIN', 'CS-RATIO', 'CS-QUAD', 'SYS', 'FAC1', 'FAC2', 'QUAD-SOLVE', 'QUAD-CTX'];
const TAG_IDS = Object.keys(MISCONCEPTIONS);
const TEMPLATE_IDS = Object.keys(TEMPLATES);
const CLEAN = { cleared: true, firstTry: true, hints: 0, attempt: 1, clean: true };
const MISS = { cleared: false, solutionShown: true, reason: 'third-wrong', attempt: 3, hints: 0 };

/**
 * `allOverdue` (round 3): every card due in the PAST — an ordinary week-off catch-up, and the state
 * the board drafts its longest queues from. The round-2 corpus was half this by accident (`chance
 * (0.65)`); making it an explicit arm is what lets 89 jobs reach the structural queue maximum that
 * 6 000 ad-hoc ones do.
 *
 * `frozenN` (round 5, verify): seeds `save.frozen` with real frozen-Variant records, all due, the
 * way `schedule.freezeVariant` writes them after a missed generated item. Without them the corpus
 * composed no `kind: 'variant'` DUE at all, so `frozenKey` and `templateVersion` — the two keys
 * `page.js:287` puts on such an entry — were as invisible to the completeness guard as `params`
 * was. (The corpus cannot reach them by driving: the freeze happens in `screens/card.js`, not in
 * the state machine, and a frozen Variant comes due days later.)
 *
 * `lowDue` (round 5, verify): the OPPOSITE arm, and the one whose absence made the queue-entry
 * completeness guard below vacuous for two rounds. Every card due in the FUTURE, so the board is
 * short and `composePage`'s S7 algebra floor actually fires — the floor is the only writer of
 * `item.params`, and a queue entry that carries it is drafted into a JOB in 198 of 200 such saves.
 * With `allOverdue` on one half and a 65 %-overdue mixture on the other, this corpus made **zero**
 * `params` entries in 546 000 observations, so "the fixture prices every key a real queue entry
 * carries" could not fail on the one key the study composer writes that the fixture did not price.
 */
function seededSave(i, { allOverdue = false, lowDue = false, frozenN = 0 } = {}) {
  const rng = rngFrom('job-save-budget-corpus', i);
  const today = todayISO(new Date(NOW));
  const s = fresh(NOW - (4 + rng.int(0, 20)) * DAY_MS);
  s.profileId = `save-${i}`;
  s.settings.testDate = addDays(today, 4 + rng.int(0, 12));
  for (let k = 0, n = 24 + rng.int(0, 24); k < n; k++) {
    const c = BANK[rng.int(0, BANK.length - 1)];
    let rec = null;
    for (let r = 0; r < 3; r++) rec = applyOutcome(s, c.id, rng.chance(0.75) ? 'clean' : 'wrong', { now: NOW - (30 - r * 4) * DAY_MS });
    if (!rec) continue;
    rec.cleared = true; rec.rarity = 'gold';
    rec.due = allOverdue
      ? NOW - rng.float(0.2, 12) * DAY_MS
      : lowDue
        ? NOW + rng.float(0.2, 12) * DAY_MS
        : NOW + (rng.chance(0.65) ? -rng.float(0, 9) : rng.float(0.2, 12)) * DAY_MS;
    rec.history = Array.from({ length: 10 }, (_, h) => ({ at: NOW - (20 - h) * DAY_MS, ok: rng.chance(0.75), attempt: rng.chance(0.75) ? 1 : 2, hints: 0, ms: 9000 }));
    /* a real `errors[]` row with real tag ids on it — `state.missTagsOf` reads the LAST error for
       the item and hands its tags to `index.trigger`, so without these a driven job writes NO
       `game.tags` at all and the largest line of G7's budget (8.10 KB, 68 records) would be measured
       against nothing. With them the corpus writes real Fault Index records and the width check
       below covers the tag id and the tag record too. */
    s.errors.push({
      item: c.id, seed: 'a91f2c', t: NOW - 3 * DAY_MS, got: 'x = 3',
      tags: [TAG_IDS[rng.int(0, TAG_IDS.length - 1)], TAG_IDS[rng.int(0, TAG_IDS.length - 1)]], cleared: false,
    });
  }
  for (const k of CORPUS_SKILLS) {
    /* the `lowDue` arm gives EVERY make a MASTERED record, and both halves of that matter:
       `needsMet(['QUAD-SOLVE'])` is what the floor reads to choose the mode it writes into `params`
       (an unmastered arm only ever exercises `'a1'`), and a page with no weak makes is SHORT — 12
       items against the ~15 a mixed-mastery save composes — which is what gets the floor item
       DRAFTED rather than left in an undrafted contract. Measured: mastered + no backlog puts
       `params` on a real drafted queue in half the arm's jobs; unmastered + no backlog composes the
       floor item on the page and drafts it 0 times in 20. */
    if (!lowDue && !rng.chance(0.75)) continue;
    s.skills[k] = lowDue
      ? { m: 88 + rng.int(0, 10), n: 6 + rng.int(0, 6), lastAt: NOW - rng.int(1, 4) * DAY_MS, lastDueCorrectAt: NOW - DAY_MS }
      : { m: rng.int(10, 95), n: rng.int(1, 9), lastAt: NOW - rng.int(1, 20) * DAY_MS, lastDueCorrectAt: rng.chance(0.4) ? NOW - DAY_MS : null };
  }
  /* frozen Variants, written exactly as `schedule.freezeVariant` writes them (`seed`,
     `templateVersion` off the template registry, `template`, `bucket`, `lastAt`, `due`, `forCard`) —
     the state a save is in after missing generated items. `dueList` turns each into a
     `kind: 'frozen'` due and `composePage` into a review entry carrying `frozenKey` +
     `templateVersion`. */
  for (let f = 0; f < frozenN; f++) {
    const t = TEMPLATE_IDS[rng.int(0, TEMPLATE_IDS.length - 1)];
    const seed = rng.int(0x100000, 0xffffff).toString(16);
    s.frozen[`${t}#${seed}`] = {
      seed, templateVersion: TEMPLATES[t]?.version ?? 1, template: t,
      bucket: rng.int(0, 2), lastAt: NOW - 3 * DAY_MS, due: NOW - rng.float(0.2, 6) * DAY_MS, forCard: null,
    };
  }
  return s;
}

function fakeStorage(init = {}) {
  const map = new Map(Object.entries(init));
  const st = {
    map, failSet: false, failGet: false,
    getItem: k => { if (st.failGet) throw new Error('SecurityError'); return map.has(k) ? map.get(k) : null; },
    setItem: (k, v) => { if (st.failSet) throw new Error('QuotaExceededError'); map.set(k, String(v)); },
    removeItem: k => { map.delete(k); },
  };
  return st;
}

/** A Document double that can actually fire the two events `createStore` flushes on. */
function fakeDoc() {
  const on = {};
  const add = (t, fn) => { (on[t] ??= []).push(fn); };
  return {
    visibilityState: 'visible',
    addEventListener: add,
    defaultView: { addEventListener: add },
    fire(t) { for (const fn of on[t] ?? []) fn(); },
  };
}

/* ---------------- a lived-in v1 save: every v1 key non-default, no `player`, no `game` ---------------- */
function v1Save() {
  return {
    v: 1,
    unitId: 'u1a',
    profileId: 'p-fixed-profile-id',
    createdAt: T0 - 30 * 86400000,
    settings: { theme: 'dark', sound: true, dailyGoal: 600, testDate: '2026-09-22', testTime: '08:00', askReasonOnMiss: true, callYourShot: false },
    xp: 4820,
    streak: { count: 11, best: 14, lastDay: '2026-09-16', freezes: 2 },
    daily: { '2026-09-15': { xp: 480, clears: 12, goalMet: true } },
    cards: {
      'ang-10': { attempts: 4, cleared: true, rarity: 'gold', bucket: 3, due: T0 + 4e8, work: 'let x be the angle',
        history: [{ at: T0, ok: false, attempt: 1, hints: 1, ms: 61000 }], foilProgress: [{ day: '2026-09-15', via: 'T-fig-alg#a1' }] },
      'wp-07': { attempts: 1, cleared: true, rarity: 'silver', bucket: 1, due: T0 + 1e8 },
    },
    variants: { 'T-cs-lin': { clearsGold: 6, goldDays: ['2026-09-14'] } },
    frozen: { 'T-cs-lin#a91f2c': { seed: 'a91f2c', templateVersion: 2, bucket: 1, due: T0 + 2e8, forCard: 'wp-07' } },
    skills: { VOC: { m: 92.5, n: 14, lastAt: T0 }, FAC2: { m: 61, n: 9, lastAt: T0 } },
    errors: [{ item: 'wp-07', seed: null, t: T0 + 2e6, got: '68.5', tags: ['gave-complement'], cleared: false }],
    counters: { cleanInARow: 9, mocksTaken: 3 },
    trophies: { 'first-platinum': { at: T0 } },
    runs: [{ kind: 'mock', n: 2, seed: 'mock#2', startedAt: T0, submittedAt: T0 + 3.4e6, status: 'done', score: 81, pred: 88, items: [{ id: 'wp-07', credit: 0.4, ms: 61000 }] }],
    inProgress: { kind: 'page', seed: 12345, idx: 3, hearts: 3, xp: 120, startedAt: T0, queue: [{ id: 'ang-10', kind: 'original' }] },
    forecastLog: [{ day: '2026-09-16', r: 73 }],
    seedCounter: 77,
    placement: { done: true, at: T0 },
    jumps: { M9: true, M10: true },
    postTest: { score: 88 },
    archive: {},
  };
}
const V1_KEYS = Object.freeze(Object.keys(v1Save()).filter(k => k !== 'v'));

/* ================================================================================================
   1. The schema itself
   ================================================================================================ */
describe('J10 — the v2 schema', () => {
  test('SAVE_VERSION is 2 and MIGRATIONS[1] bumps a bare {v:1} to v2', () => {
    assert.equal(SAVE_VERSION, 2);
    assert.equal(typeof MIGRATIONS[1], 'function');
    const out = MIGRATIONS[1]({ v: 1 });
    assert.equal(out.v, 2);
    assert.deepEqual(out.player, freshPlayer(), 'MIGRATIONS[1] must not depend on any other key being present');
    assert.deepEqual(out.game, freshGame());
  });

  test('CAPS.game holds all five caps, at G7\'s numbers', () => {
    /* `heat` is the fifth, added at integration for `game.heat.window` — the stake-weighted press
       window `guard.pushHeat` writes (notes/J3.md §5.5 → J10). It is GUARD.xHatWindowJobs by
       construction, asserted equal below. */
    assert.deepEqual(CAPS.game, { calls: 50, log: 30, tags: 68, bundles: 5, heat: 10 });
    assert.equal(CAPS.game.heat, GUARD.xHatWindowJobs, 'the heat cap IS the guard window length');
    assert.equal(Object.isFrozen(CAPS.game), true, 'a cap nobody can reassign at runtime');
  });

  test('`player` is a KEPT key and `game` an ARCHIVED key — both TOP-LEVEL, neither in both', () => {
    assert.ok(KEPT_KEYS.includes('player'), 'KEPT_KEYS must contain "player"');
    assert.ok(ARCHIVED_KEYS.includes('game'), 'ARCHIVED_KEYS must contain "game"');
    assert.equal(KEPT_KEYS.includes('game'), false);
    assert.equal(ARCHIVED_KEYS.includes('player'), false);
    // G7 #19: the split is two TOP-LEVEL keys precisely because archiveUnit copies top-level keys
    // only. A dotted path in either list would be silently ignored by `entry[k] = save[k]`.
    for (const k of [...KEPT_KEYS, ...ARCHIVED_KEYS]) assert.equal(k.includes('.'), false, `${k} is a sub-key path — archiveUnit cannot follow one`);
    assert.deepEqual([...KEPT_KEYS, ...ARCHIVED_KEYS].sort(), Object.keys(fresh(T0)).sort(),
      'every key of a fresh save is either kept or archived');
  });

  test('fresh() carries G7\'s exact defaults, and every save gets its OWN mutable copy', () => {
    const a = fresh(T0), b = fresh(T0);
    assert.deepEqual(a.player, SAVE_DEFAULTS.player);
    assert.deepEqual(a.game, SAVE_DEFAULTS.game);
    assert.notEqual(a.player, b.player, 'two saves must not share one player object');
    assert.notEqual(a.game.ledger.phaseMeans, b.game.ledger.phaseMeans, 'nor a nested one');
    // data/job.js deep-freezes SAVE_DEFAULTS; a shallow spread of it would hand the app a frozen
    // save that silently refuses every write. These four must be live objects.
    assert.doesNotThrow(() => { a.player.rating.calls.push({ p: 0.85, ok: true }); });
    assert.doesNotThrow(() => { a.game.tags['dropped-gcf'] = freshTag(); });
    assert.doesNotThrow(() => { a.game.crew.FAC2 = 1; a.game.log.push({ day: '2026-09-17' }); });
    assert.deepEqual(b.player.rating.calls, [], 'and the other save is untouched');
  });

  test('store.js\'s literals and data/job.js\'s constants cannot drift (the anti-duplication check)', () => {
    // store.js deliberately does NOT import data/job.js — it is on the cold-open boot path of every
    // screen and data/job.js is 41 KB a student with `settings.game = false` never needs. This test
    // is what makes the repetition safe: change one and the other fails the same minute.
    assert.deepEqual(freshPlayer(), SAVE_DEFAULTS.player, 'store.freshPlayer() ≠ data/job.js SAVE_DEFAULTS.player');
    assert.deepEqual(freshGame(), SAVE_DEFAULTS.game, 'store.freshGame() ≠ data/job.js SAVE_DEFAULTS.game');
    assert.deepEqual(freshTag(), TAG_RECORD_DEFAULT, 'store.freshTag() ≠ data/job.js TAG_RECORD_DEFAULT');
    assert.deepEqual(CAPS.game, JOB_CAPS, 'store CAPS.game ≠ data/job.js CAPS');
    assert.deepEqual(Object.keys(freshGame().heat.press).sort(), [...WING_IDS].sort(), 'heat.press must key on the four wings');
    /* the crew map is keyed by MAKE, and a key from another unit's data set is dropped on load
       (notes/J4.md §7 → J10, done at integration) */
    const dirty = normalizeGame({ crew: { VOC: 2, 'NOT-A-MAKE': 2, FAC2: 1, TRIG: 1 } }).crew;
    assert.deepEqual(dirty, { VOC: 2, FAC2: 1 }, 'a make from another unit must not survive a load');
    // backchecks are clamped at BACKCHECK.max on load
    const held = normalizeGame({ backchecks: { held: 99 } }).backchecks.held;
    assert.equal(held, BACKCHECK.max, `held clamped to BACKCHECK.max (${BACKCHECK.max}), got ${held}`);
  });

  /* ----------------------------------------------------------------------------------------------
     `game.ledger.debriefAt` — round 2. `state.endJob` stamps it on EVERY job end and `closeDebrief`
     reads `now − debriefAt` to fold the one phase mean the job that opened the debrief cannot
     measure. It shipped for a whole round without appearing in ANY of the three places that are
     supposed to be the schema: `SAVE_DEFAULTS.game.ledger`, `store.freshGame()` and G7's schema
     block. It reached disk only because `normalizeGame`'s `over()` is a merge and not a whitelist —
     which is the SAME drift class the round-1 audit was opened to kill, alive on a different key.
     Three assertions, one per place it went missing, plus the coercion it never had.
     ---------------------------------------------------------------------------------------------- */
  test('game.ledger.debriefAt is declared, defaulted and COERCED — not an undeclared pass-through', () => {
    assert.ok('debriefAt' in SAVE_DEFAULTS.game.ledger, 'data/job.js SAVE_DEFAULTS.game.ledger does not declare debriefAt');
    assert.ok('debriefAt' in freshGame().ledger, 'store.freshGame().ledger does not declare debriefAt');
    assert.equal(freshGame().ledger.debriefAt, null, 'a fresh save has no open debrief');

    // the writer really does write it, so the schema is not documenting a dead key
    const stateSrc = readFileSync(join(SITE, 'js/job/state.js'), 'utf8');
    assert.ok(/debriefAt:\s*now/.test(stateSrc), 'state.js no longer stamps ledger.debriefAt — drop it from both defaults and from G7');

    // and a corrupt stamp can no longer reach `closeDebrief`'s `now − debriefAt` subtraction
    for (const bad of ['2026-09-17', NaN, Infinity, -1, null, undefined, {}, []]) {
      assert.equal(normalizeGame({ ledger: { debriefAt: bad } }).ledger.debriefAt, null, `debriefAt: ${JSON.stringify(bad)} must normalise to null`);
    }
    assert.equal(normalizeGame({ ledger: { debriefAt: T0 } }).ledger.debriefAt, T0, 'a real stamp survives the load');
    /* `closeDebrief` stamps 0 after it folds, so 0 and null both mean "no open debrief" and both
       must survive — `closeDebrief` reads `num(L.debriefAt, 0)` and folds nothing unless it is > 0. */
    assert.equal(normalizeGame({ ledger: { debriefAt: 0 } }).ledger.debriefAt, 0, 'closeDebrief\'s own "already folded" stamp must survive');
  });

  /* ----------------------------------------------------------------------------------------------
     `settings.game` — round 3, finding 54, and the SAME drift class one level out: the layer's own
     MASTER SWITCH. `screens/settings.js:318` writes it, `plan.gameOn`, `screens/settings.js:314,746`
     and `screens/stats.js:223` read it, and it was declared in neither `fresh()` nor G7 — it reached
     disk only because `fillDefaults`'s `{...d.settings, ...s.settings}` is not a whitelist, verbatim
     the mechanism `ledger.debriefAt` and `tags[].days` were each caught for. It failed OPEN (any
     non-`false` value left the layer on), so nothing broke — a `"false"` string out of a hand-edited
     export or a half-written import switched the layer back ON while reading as "off" to a human.
     The coercion keeps the fail-open direction exactly and makes the stored value a boolean.
     Read through the SHIPPED reader (`plan.gameOn`), not through a copy of `!== false` typed here.
     ---------------------------------------------------------------------------------------------- */
  test('settings.game is declared, defaulted and COERCED — not an undeclared pass-through', () => {
    assert.ok('game' in fresh(T0).settings, 'store.fresh().settings does not declare game — THE JOB has no master switch in the schema');
    assert.equal(fresh(T0).settings.game, true, 'a fresh save has THE JOB on (G7: the layer is on unless Settings switched it off)');
    assert.equal(plan.gameOn(fresh(T0)), true, 'the shipped reader must see a fresh save as on');

    // the writer really does write it, so the schema is not documenting a dead key
    const settingsSrc = readFileSync(join(SITE, 'js/screens/settings.js'), 'utf8');
    assert.ok(/settings\.game\s*=/.test(settingsSrc), 'no screen writes settings.game any more — drop it from fresh(), fillDefaults and G7');

    /* every non-boolean a hand-edited save, an import or a half-written write can carry. Each must
       arrive as the BOOLEAN `true` — the same answer the readers gave it before, now stored. */
    for (const bad of ['false', 'off', '', {}, [], [1, 2], 0, 1, NaN, null, 'true']) {
      const out = migrate({ v: SAVE_VERSION, settings: { game: bad } }, T0);
      assert.equal(out.settings.game, true, `settings.game: ${JSON.stringify(bad)} must normalise to the boolean true (it read as "on" before, and it is not a boolean on disk)`);
      assert.equal(typeof out.settings.game, 'boolean', `settings.game: ${JSON.stringify(bad)} reached disk uncoerced`);
      assert.equal(plan.gameOn(out), true, `the shipped reader disagrees with the stored value for ${JSON.stringify(bad)}`);
    }
    // and the one value that means OFF survives a load, a pack/unpack round trip and a re-migrate
    const off = migrate({ v: SAVE_VERSION, settings: { game: false } }, T0);
    assert.equal(off.settings.game, false, 'the student switched THE JOB off; the save must remember');
    assert.equal(plan.gameOn(off), false, 'the shipped reader must see a switched-off save as off');
    assert.equal(migrate(unpack(JSON.parse(JSON.stringify(pack(off)))), T0).settings.game, false, 'the switch did not survive a disk round trip');
  });

  /* ----------------------------------------------------------------------------------------------
     `player.records.bestRating` — REPAIR-DECISION S3.1(c). Under the rank RATCHET, `p.rank` is a
     stored high-water and stops being recomputable from the 50-call window, so the rating that
     earned it is recorded and printed beside it on the audit surfaces (G9 #4's one printed
     exception). The DEFAULT is not declared here yet: `data/job.js SAVE_DEFAULTS.player` is the
     second copy of this schema and the two are asserted deep-equal in both directions below, so
     declaring it in `store.freshPlayer()` alone would turn that pin red — and `data/job.js` belongs
     to another lane this round (the one-line request is in notes/repair-save.md § Requests).
     What ships now is the COERCION, so the field cannot reach disk as an uncoerced pass-through of
     `over()` the moment `state.applyTarget` / `endJob` starts writing it — which is exactly how
     `ledger.debriefAt` and `settings.game` both shipped. This test is correct under BOTH regimes and
     the mirror pin flips it: when `SAVE_DEFAULTS.player.records` declares it, `freshPlayer()` must.
     ---------------------------------------------------------------------------------------------- */
  test('player.records.bestRating is coerced whenever it is present, declared or not (S3 ratchet audit record)', () => {
    const declared = 'bestRating' in SAVE_DEFAULTS.player.records;
    assert.equal('bestRating' in freshPlayer().records, declared,
      'store.freshPlayer().records and data/job.js SAVE_DEFAULTS.player.records disagree about bestRating — the two copies of the schema must declare the same fields');

    // a corrupt high-water can never reach the audit surfaces as a string, a NaN or an object
    for (const bad of ['9.9', NaN, Infinity, -Infinity, null, {}, [], true]) {
      const out = normalizePlayer({ records: { bestRating: bad } });
      assert.equal(out.records.bestRating, 0, `bestRating: ${JSON.stringify(bad)} must normalise to 0`);
      assert.equal(typeof out.records.bestRating, 'number', `bestRating: ${JSON.stringify(bad)} reached disk uncoerced`);
    }
    // a real high-water survives the load unrounded (`ratingDetail().value` rounds nothing)
    const keep = normalizePlayer({ records: { bestRating: 9.536000000000001 } });
    assert.equal(keep.records.bestRating, 9.536000000000001, 'a real best rating must survive the load exactly');
    // and while it is undeclared, a save that has never held one must not grow the field
    if (!declared) {
      assert.ok(!('bestRating' in normalizePlayer({}).records),
        'bestRating is not declared in either copy of the schema yet, so a save that never held one must not gain it — declare it in BOTH (see notes/repair-save.md § Requests)');
    } else {
      assert.equal(normalizePlayer({}).records.bestRating, 0, 'a declared bestRating must default to 0');
    }
  });

  /* ----------------------------------------------------------------------------------------------
     …AND IT IS THE NUMBER THAT BOUGHT THE RANK, NOT THE NUMBER THE DICE PAID (verify round 2).

     The round-4 cap prices the rank off `detail.earned = min(value, ceiling)` — `ceiling` is what
     the student's own reporting policy was WORTH on this material, `value` is what the dice paid
     for it — so on a CAPPED window (which is most of them) the printed rating and the rank-buying
     rating diverge, measured here by points and not by hundredths. All three writers of
     `p.rating.value` used to record `detail.value`, so the audit record S3.1(c) exists to make the
     held rank recomputable published a rating that had bought nothing: `2.59 · Called 3 · best
     rating 10.00`, a pair a reviewer cannot reconcile, on the one surface G9 #4 grants an exception
     to. No test compared the two, which is why a 7.9-point divergence shipped.

     What is pinned here is the CONTRACT, driven end to end through the shipped machine:
       (1) the record is the running maximum of `detail.earned`, at every staked target;
       (2) it never exceeds a ceiling the window actually reached — the finding's own assertion,
           in its time-honest form (a max over history against the max ceiling over history);
       (3) `player.rank === max(the rank the save started at, rankFor(record))`, which IS the audit
           the exception is published to make possible (`rankFor` is monotone and the rank is a
           ratchet over `rankFor(earned)`, so the equality is exact, not a bound); and
       (4) the arm is not vacuous — the corpus is asserted to reach a window where the old field
           would have printed a rank STRICTLY ABOVE the one held.
     ---------------------------------------------------------------------------------------------- */
  test('records.bestRating is the high-water EARNED rating, so the held rank recomputes from it (S3 ratchet audit)', () => {
    const N = CAPS.game.calls;
    let staked = 0, cappedTargets = 0, divergentSaves = 0, unreconcilable = 0;
    let widestGap = 0, sample = null;

    for (let i = 0; i < 24; i++) {
      const save = seededSave(i, { allOverdue: true });
      const startRank = save.player.rank;
      let maxEarned = 0, maxValue = 0, maxCeiling = 0;
      let t = NOW;
      const step = (ms) => (t += ms);
      try { startJob(save, { today: todayISO(new Date(t)), now: t, shape: 'JOB12' }); } catch { continue; }
      beginTargets(save, { now: step(6000) });
      for (let n = 0; n < 400; n++) {
        const g = stateOf(save);
        if (!g || g.outcome != null) break;
        if (g.phase === 'envelope') {
          /* half the corpus OVER-REPORTS on every target (the highest legal rung, every time),
             which is exactly the regime THE CAP exists for and the one where `value` and `earned`
             separate by points rather than hundredths. */
          const av = callsAvailable(save);
          const want = i % 2 ? av[av.length - 1] : [95, 85, 70][n % 3];
          lockCall(save, av.includes(want) ? want : av[av.length - 1], { now: step(5000) });
          continue;
        }
        if (g.phase === 'answer') {
          applyTarget(save, n % 4 === 3 ? MISS : CLEAN, { now: step(40000) });
          if (save.player.rating.calls.length > 0) {
            /* Recomputed off the window the writer just wrote, after EVERY target and not only
               after an informative one: a blank slot still goes through `windowPush`, the writer
               still runs, and a running maximum that skipped those beats would not be the one the
               writer keeps. `earned` depends on the WINDOW alone and not on the floor, so this is
               the exact number `applyTarget` consumed. */
            const d = call.ratingDetail(save.player.rating.calls, N);
            staked++;
            if (d.capped) cappedTargets++;
            maxEarned = Math.max(maxEarned, d.earned);
            maxValue = Math.max(maxValue, d.value);
            maxCeiling = Math.max(maxCeiling, d.ceiling);
            assert.equal(save.player.records.bestRating, maxEarned,
              `save ${i} target ${n}: the audit record reads ${save.player.records.bestRating} where the `
              + `high-water EARNED rating is ${maxEarned} (the window printed ${d.value} against a ceiling `
              + `of ${d.ceiling}) — a record written off detail.value is a rating that bought no rung`);
          }
          continue;
        }
        if (g.phase === 'payout' || g.phase === 'bagpush') { push(save, { now: step(9000) }); continue; }
        if (g.phase === 'brief') { brief(save, {}, { now: step(20000) }); continue; }
        if (g.phase === 'getaway') { crack(save, { now: step(25000) }); continue; }
        break;
      }
      if (maxEarned === 0) continue;
      const best = save.player.records.bestRating;

      // (2) the record never exceeds a ceiling the window actually reached
      assert.ok(best <= maxCeiling + 1e-9,
        `save ${i}: the audit record is ${best} where the widest ceiling this window ever reached is ${maxCeiling} — `
        + 'the record is a rating the reports could not have been worth');

      // (3) the rank recomputes from the record — G9 #4's one exception, made true
      assert.equal(save.player.rank, Math.max(startRank, call.rankFor(best)),
        `save ${i}: Called ${save.player.rank} beside a best rating of ${best}, which buys Called ${call.rankFor(best)} `
        + `on a save that started at Called ${startRank} — the audit record no longer recomputes the rank it is `
        + 'published to explain');

      if (maxValue > best + 1e-9) {
        divergentSaves++;
        if (maxValue - best > widestGap) { widestGap = maxValue - best; sample = { i, best, maxValue, rank: save.player.rank }; }
        // (4) the negative control, as an observation rather than a comment: what the OLD field
        // would have published beside this rank.
        if (call.rankFor(maxValue) > save.player.rank) unreconcilable++;
      }
    }

    assert.ok(staked >= 40, `only ${staked} staked targets across the corpus — the arm is too short to pin a running maximum`);
    assert.ok(cappedTargets > 0,
      `no window in the corpus ran ahead of its ceiling (${staked} staked targets) — the arm cannot tell `
      + 'detail.value from detail.earned and is vacuous');
    assert.ok(divergentSaves > 0,
      'no save in the corpus separated the printed rating from the earned one — the arm is vacuous');
    assert.ok(unreconcilable > 0,
      `the corpus never reached a window where the high-water PRINTED rating implies a higher rank than the one `
      + `held (${divergentSaves} divergent saves, widest gap ${widestGap.toFixed(3)}) — the arm no longer covers the `
      + 'defect it exists for, so it would pass on a save that re-introduced detail.value');
    console.log(`  S3.1(c) audit record: ${staked} staked targets, ${cappedTargets} capped · ${unreconcilable} of ${divergentSaves} `
      + `divergent saves would print an unreconcilable rank off detail.value · widest gap ${widestGap.toFixed(3)} rating points`
      + (sample ? ` (save ${sample.i}: Called ${sample.rank}, earned ${sample.best.toFixed(3)}, printed ${sample.maxValue.toFixed(3)})` : ''));
  });
});

/* ================================================================================================
   2. v1 → v2: zero data loss, idempotent
   ================================================================================================ */
describe('J10 — v1 → v2 migration', () => {
  test('ZERO DATA LOSS: every v1 key survives byte-identical and exactly two keys are added', () => {
    const before = v1Save();
    const snapshot = structuredClone(before);
    const after = migrate(before, T0);

    assert.equal(after.v, 2);
    /* Every v1 TOP-LEVEL key survives byte-identical. `settings` is the one of them `fillDefaults`
       may legitimately add a SUB-key to: it fills every missing sub-key with its default, exactly as
       it does for a save written before `callYourShot` existed. The fixture above carries every
       settings key v1 had, so the only additions possible are keys DECLARED SINCE — and each of
       those must arrive at its own `fresh()` default and take nothing with it. Asserting plain
       byte-identity on `settings` looked stronger and was not: it held only because the fixture is
       saturated, so a newly declared setting failed here instead of the thing that should
       (round 4, finding 54 — `settings.game`, THE JOB's master switch). */
    for (const k of V1_KEYS) {
      if (k === 'settings') continue;
      assert.deepEqual(after[k], snapshot[k], `${k} changed during the v1 → v2 migration`);
    }
    for (const k of Object.keys(snapshot.settings)) {
      assert.deepEqual(after.settings[k], snapshot.settings[k], `settings.${k} changed during the v1 → v2 migration`);
    }
    const addedSettings = Object.keys(after.settings).filter(k => !(k in snapshot.settings));
    assert.deepEqual(addedSettings.sort(), ['game'],
      `the migration added the settings key(s) ${addedSettings.join(', ') || '(none)'} — a setting the layer reads must be DECLARED in fresh() and coerced in fillDefaults, not carried by the merge`);
    for (const k of addedSettings) {
      assert.deepEqual(after.settings[k], fresh(T0).settings[k], `settings.${k} did not arrive at its declared fresh() default`);
    }
    const added = Object.keys(after).filter(k => !(k in snapshot));
    assert.deepEqual(added.sort(), ['game', 'player'], 'v2 adds exactly these two keys and no others');
    assert.deepEqual(after.player, SAVE_DEFAULTS.player);
    assert.deepEqual(after.game, SAVE_DEFAULTS.game);
  });

  test('idempotent: migrating twice equals migrating once', () => {
    const once = migrate(v1Save(), T0);
    const twice = migrate(structuredClone(once), T0);
    assert.deepEqual(twice, once, 'migrate(migrate(x)) ≠ migrate(x)');
    const thrice = migrate(structuredClone(twice), T0);
    assert.deepEqual(thrice, once);
    // and through the disk codec, which is how it actually happens
    assert.deepEqual(migrate(unpack(JSON.parse(JSON.stringify(pack(once)))), T0), once, 'not idempotent across a pack/unpack round trip');
  });

  test('a lived-in v2 save re-migrates to itself — nothing the game wrote is normalised away', () => {
    const s = migrate(v1Save(), T0);
    s.player = worstCasePlayer(T0, CAPS.game);
    s.game = worstCaseGame(T0, CAPS.game);
    s.inProgress = { kind: 'job', seed: 99, idx: 7, queue: [{ id: 'ang-10', kind: 'original' }], game: inProgressJob12(T0, CAPS.game) };
    const again = migrate(structuredClone(s), T0);
    assert.deepEqual(again.player, s.player, 'a full 50-call window must survive a reload untouched');
    assert.deepEqual(again.game, s.game, 'crew, 68 tags, heat, ledger, 30 log records and commit must survive');
    assert.deepEqual(again.inProgress, s.inProgress, 'the live job must survive');
  });

  test('a v1 save on disk is migrated on the next open and written back at v2', () => {
    const st = fakeStorage({ [SAVE_KEY]: JSON.stringify(pack(v1Save())) });
    const store = createStore({ storage: st, now: () => T0, unit: null });
    const s = store.load();
    assert.equal(s.v, 2);
    assert.equal(s.xp, 4820, 'the v1 data is still there');
    const onDisk = JSON.parse(st.map.get(SAVE_KEY));
    assert.equal(onDisk.v, 2, 'the migration is persisted immediately, not left in memory');
    assert.deepEqual(onDisk.player, SAVE_DEFAULTS.player);
    assert.deepEqual(onDisk.game, SAVE_DEFAULTS.game);
  });

  test('an unversioned pre-release save walks the whole chain 0 → 1 → 2', () => {
    const s = migrate({ xp: 320, cards: { 'ang-10': { attempts: 2 } } }, T0);
    assert.equal(s.v, 2);
    assert.equal(s.xp, 320);
    assert.deepEqual(s.player, SAVE_DEFAULTS.player);
    assert.deepEqual(s.game, SAVE_DEFAULTS.game);
  });
});

/* ================================================================================================
   3. Corruption is contained
   ================================================================================================ */
describe('J10 — a corrupt player or game is discarded to defaults, and nothing else moves', () => {
  const JUNK = [null, undefined, 'a string', 42, [], [1, 2], true, NaN];

  for (const junk of JUNK) {
    test(`player = ${JSON.stringify(junk) ?? String(junk)} → defaults, every other key untouched`, () => {
      const good = migrate(v1Save(), T0);
      const bad = structuredClone(good); bad.player = junk;
      const fixed = migrate(bad, T0);
      assert.deepEqual(fixed.player, SAVE_DEFAULTS.player, 'player must fall back to the defaults');
      for (const k of Object.keys(good)) if (k !== 'player') assert.deepEqual(fixed[k], good[k], `${k} was collateral damage`);
    });

    test(`game = ${JSON.stringify(junk) ?? String(junk)} → defaults, every other key untouched`, () => {
      const good = migrate(v1Save(), T0);
      const bad = structuredClone(good); bad.game = junk;
      const fixed = migrate(bad, T0);
      assert.deepEqual(fixed.game, SAVE_DEFAULTS.game, 'game must fall back to the defaults');
      for (const k of Object.keys(good)) if (k !== 'game') assert.deepEqual(fixed[k], good[k], `${k} was collateral damage`);
    });
  }

  test('a corrupt SUB-object is repaired on its own — its siblings keep their values', () => {
    const s = migrate(v1Save(), T0);
    s.player = { rating: 'gone', rank: 4, elo: [], records: { bestChain: 8, cleanGetaway: 'yes' } };
    s.game = { crew: { FAC2: 2, NOTE: 'nope', VOC: 7 }, heat: null, tags: 5, backchecks: { held: '3' }, ledger: { jobs: 9, phaseMeans: 'x' }, log: 'nope', commit: undefined };
    const f = migrate(s, T0);

    assert.deepEqual(f.player.rating, SAVE_DEFAULTS.player.rating, 'a corrupt rating resets');
    assert.equal(f.player.rank, 4, 'the sibling rank survives');
    assert.deepEqual(f.player.elo, { player: 1000, house: 1000 });
    assert.equal(f.player.records.bestChain, 8, 'a good record field survives');
    assert.equal(f.player.records.cleanGetaway, false, 'a bad one defaults');

    assert.deepEqual(f.game.crew, { FAC2: 2 }, 'only ranks 1 and 2 are legal crew values');
    assert.deepEqual(f.game.heat, SAVE_DEFAULTS.game.heat);
    assert.deepEqual(f.game.tags, {});
    assert.equal(f.game.backchecks.held, 0, 'a string is not a count');
    assert.equal(f.game.ledger.jobs, 9, 'the sibling ledger count survives');
    assert.deepEqual(f.game.ledger.phaseMeans, SAVE_DEFAULTS.game.ledger.phaseMeans);
    assert.deepEqual(f.game.log, []);
    assert.deepEqual(f.game.commit, SAVE_DEFAULTS.game.commit);
  });

  test('a key a LATER ticket adds inside player/game survives normalisation', () => {
    const s = migrate(v1Save(), T0);
    s.player.futureField = { j: 7 };
    s.game.futureField = ['keep', 'me'];
    const f = migrate(structuredClone(s), T0);
    assert.deepEqual(f.player.futureField, { j: 7 }, 'normalizePlayer must not be a whitelist');
    assert.deepEqual(f.game.futureField, ['keep', 'me']);
  });

  test('the corrupt-save path still works: unparseable JSON → .bak + a fresh v2 save', () => {
    const st = fakeStorage({ [SAVE_KEY]: '{"v":1,"xp":12,"game":{"tags":{' });
    const store = createStore({ storage: st, now: () => T0, unit: null });
    const s = store.load();
    assert.equal(s.v, 2);
    assert.deepEqual(s.player, SAVE_DEFAULTS.player);
    assert.deepEqual(s.game, SAVE_DEFAULTS.game);
    assert.equal(st.map.get('u1a.save.bak'), '{"v":1,"xp":12,"game":{"tags":{');
  });

  test('normalizePlayer / normalizeGame are idempotent on every input they repair', () => {
    for (const junk of [...JUNK, { rating: { calls: 'x' } }, { tags: { a: { days: ['x'] } } }]) {
      const p1 = normalizePlayer(junk); assert.deepEqual(normalizePlayer(p1), p1);
      const g1 = normalizeGame(junk); assert.deepEqual(normalizeGame(g1), g1);
    }
  });
});

/* ================================================================================================
   4. tags[].days is a NUMBER — G12 #18, the single largest error in the old budget
   ================================================================================================ */
describe('J10 — tags[].days is a count plus a last date, never an array', () => {
  test('the default record has days: 0 (a number) and lastDay: null', () => {
    assert.equal(typeof freshTag().days, 'number');
    assert.equal(freshTag().lastDay, null);
    assert.equal(Array.isArray(freshTag().days), false);
  });

  test('an ARRAY of dates is collapsed to its length, and its last entry becomes lastDay', () => {
    const g = normalizeGame({ tags: { 'dropped-gcf': { resolved: 4, triggered: 1, days: ['2026-09-15', '2026-09-16', '2026-09-17'], cleared: true } } });
    const t = g.tags['dropped-gcf'];
    assert.equal(t.days, 3, 'the count is the array length');
    assert.equal(typeof t.days, 'number');
    assert.equal(t.lastDay, '2026-09-17', 'the last date is kept — sealing needs a count and a last date, nothing more');
    assert.equal(t.resolved, 4); assert.equal(t.cleared, true, 'the rest of the record is untouched');
  });

  test('an explicit lastDay wins over the array\'s tail, and an empty array is 0', () => {
    const g = normalizeGame({ tags: {
      a: { days: ['2026-09-15'], lastDay: '2026-09-18' },
      b: { days: [] },
      c: { days: 'seven' },
      d: { days: -3, lastDay: 42 },
    } });
    assert.equal(g.tags.a.lastDay, '2026-09-18');
    assert.equal(g.tags.b.days, 0);
    assert.equal(g.tags.c.days, 0);
    assert.equal(g.tags.d.days, 0); assert.equal(g.tags.d.lastDay, null, 'a number is not an ISO day');
  });

  test('NO tag record anywhere in a saturated save has an array `days`, through the disk codec', () => {
    const s = migrate(v1Save(), T0);
    s.game = worstCaseGame(T0, CAPS.game);
    const round = migrate(unpack(JSON.parse(JSON.stringify(pack(s)))), T0);
    const ids = Object.keys(round.game.tags);
    assert.equal(ids.length, CAPS.game.tags);
    for (const id of ids) {
      const t = round.game.tags[id];
      assert.equal(typeof t.days, 'number', `tags[${id}].days is ${typeof t.days}`);
      assert.equal(Array.isArray(t.days), false);
      assert.ok(t.lastDay === null || typeof t.lastDay === 'string', `tags[${id}].lastDay must be a string or null`);
    }
  });
});

/* ================================================================================================
   5. The caps actually bind
   ================================================================================================ */
describe('J10 — CAPS.game binds on every load', () => {
  test('the rating window keeps the NEWEST 50 calls — it is a window, not a stock (G2)', () => {
    const calls = Array.from({ length: 140 }, (_, i) => ({ p: 0.7, ok: true, w: 0.42, skill: 'VOC', at: T0 + i }));
    const p = normalizePlayer({ rating: { calls, value: 7, n: 140 } });
    assert.equal(p.rating.calls.length, CAPS.game.calls);
    assert.equal(p.rating.calls[0].at, T0 + (140 - CAPS.game.calls), 'the newest 50, not the oldest 50');
    assert.equal(p.rating.calls.at(-1).at, T0 + 139);
  });

  test('log keeps the newest 30; tags stop at 68; malformed entries never count toward a cap', () => {
    const g = normalizeGame({
      log: [...Array.from({ length: 90 }, (_, i) => ({ day: '2026-09-17', n: i })), 'junk', null],
      tags: Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`t${i}`, { resolved: 1 }])),
    });
    assert.equal(g.log.length, CAPS.game.log);
    assert.equal(g.log.at(-1).n, 89, 'the newest kept');
    assert.equal(Object.keys(g.tags).length, CAPS.game.tags);
  });

  test('applyCaps binds them BETWEEN reloads too — a long session cannot outgrow the budget', () => {
    const s = fresh(T0);
    s.player.rating.calls = Array.from({ length: 300 }, (_, i) => ({ p: 0.7, ok: true, w: 0.4, skill: 'VOC', at: T0 + i }));
    s.game.log = Array.from({ length: 300 }, (_, i) => ({ day: '2026-09-17', n: i }));
    for (let i = 0; i < 300; i++) s.game.tags['t' + String(i).padStart(3, '0')] = freshTag();
    applyCaps(s);
    assert.equal(s.player.rating.calls.length, CAPS.game.calls);
    assert.equal(s.player.rating.calls.at(-1).at, T0 + 299, 'the newest kept');
    assert.equal(s.game.log.length, CAPS.game.log);
    assert.equal(s.game.log.at(-1).n, 299);
    assert.equal(Object.keys(s.game.tags).length, CAPS.game.tags);
    assert.deepEqual(applyCaps(structuredClone(s)), s, 'applyCaps is idempotent on the game keys');
    assert.doesNotThrow(() => applyCaps({ ...fresh(T0), player: 'junk', game: 7 }), 'and tolerates junk, like every other cap');
  });

  test('the caps survive a real store round trip (load → update → reload)', () => {
    const st = fakeStorage();
    const s1 = createStore({ storage: st, now: () => T0, unit: null });
    s1.load();
    s1.update(s => {
      s.player.rating.calls = Array.from({ length: 120 }, (_, i) => ({ p: 0.7, ok: true, w: 0.4, skill: 'VOC', at: T0 + i }));
      s.game.log = Array.from({ length: 77 }, (_, i) => ({ day: '2026-09-17', n: i }));
    }, { immediate: true });
    const s2 = createStore({ storage: st, now: () => T0, unit: null }).load();
    assert.equal(s2.player.rating.calls.length, CAPS.game.calls);
    assert.equal(s2.game.log.length, CAPS.game.log);
  });
});

/* ================================================================================================
   6. The budget — ≤ SAVE_BUDGET_KB.totalAdded added, with a 12-target job live
   ================================================================================================ */
describe('J10 — the measured budget (G7 "The measured budget")', () => {
  /**
   * The delta is additive: the seven `runs[]` fields cost the same number of characters whichever
   * run record they are attached to, so a minimal carrier measures exactly the delta that
   * `state.test.mjs`'s full S6 worst case measures. That suite owns the total; this one owns the
   * addition, and prints both halves.
   *
   * `runFields` exists because the seven `runs[]` game fields are the one line of G7's table that no
   * shipped path writes yet: `screens/job.js` pushes NO run record at all (`grep -n 'pushRun' site/js/screens/job.js`
   * is empty), so `ratingDelta` does not occur anywhere under `site/`. The line is a RESERVED ceiling
   * for the fields G7 specifies, and the suite prints the addition both ways so the published number
   * can never quietly be a sixth of something the app does not produce. See notes/save-fix.md "Requests".
   *
   * ROUND 2: the carrier also carries a BENCH. `job.startJob` writes `inProgress.bench` and
   * `page.startPage` does not, so it is a game-layer cost — but neither worst-case carrier created
   * one and `withoutGameKeys` never deleted one, so ~1.9 KB of game bytes were being charged to the
   * study half AND left out of the addition at the same time. Both ends are fixed.
   */
  function carrier({ runFields = true, bench = true, queue = true, trophies = true, meta = true } = {}) {
    const s = fresh(T0);
    s.player = worstCasePlayer(T0, CAPS.game);
    s.game = worstCaseGame(T0, CAPS.game);
    /* ROUND 4 (verify) — the carrier carries the BEFORE-SNAPSHOT. `screens/job.js:533` calls
       `captureJobBefore` inside `update()` on every job, so `inProgress.meta.before` reaches disk on
       every job; neither carrier wrote an `inProgress.meta` at all, so the six fields the game layer
       adds to it (`GAME_META_FIELDS`) were charged to the STUDY half by `withoutGameKeys` and
       counted in no measurement — the bench's defect, the queue's defect, one level further out.
       The fixture carries the STUDY half of the snapshot too, so `inProgress.meta` is a DELTA row. */
    s.inProgress = { kind: 'job', seed: 12345, idx: 7, startedAt: T0, queue: queue ? worstCaseJobQueue(T0) : [], game: inProgressJob12(T0, CAPS.game), ...(bench ? { bench: worstCaseBench(T0) } : {}), ...(meta ? { meta: { before: worstCaseJobBefore(T0, CAPS.game) } } : {}) };
    s.runs = Array.from({ length: CAPS.runs }, (_, n) => ({ kind: 'job', n, seed: 'job#' + n, startedAt: T0, status: 'done', items: [], ...(runFields ? GAME_RUN_FIELDS : {}) }));
    if (trophies) Object.assign(s.trophies, worstCaseGameTrophies(T0));
    return s;
  }
  /** the bytes the layer adds to a key that BOTH halves write — the queue, and `save.trophies`. */
  const deltaOn = (s, pick) => JSON.stringify(pick(pack(s))).length - JSON.stringify(pick(pack(withoutGameKeys(s)))).length;
  const addedBy = (s) => JSON.stringify(pack(s)).length - JSON.stringify(pack(withoutGameKeys(s))).length;

  /**
   * THE FIXTURE IS THE RECORD. `_helpers.mjs` may not import from `site/`, so nothing used to stop
   * `inProgressJob12` from drifting away from `js/job/state.js` — and it had: 8 of the serialiser's
   * keys missing (`stakes`, `outcome`, `locked`, `posted`, `bc`, `last`, `ph`, `rating0`) and a call
   * shape of `{p, carry}` that `cleanCall` has never emitted. A budget measured off that literal was
   * measuring a record the app cannot write. This pins it: the fixture must be a FIXED POINT of the
   * shipped serialiser, so a new key on `inProgress.game` fails here until it is priced.
   */
  /**
   * ROUND 3 — THE ATTRIBUTION IS MACHINE-CHECKED, NOT ASSERTED IN A COMMENT.
   *
   * Everything in this table rests on one rule: a field the GAME layer's writer adds, that the STUDY
   * layer's equivalent writer does not, is the layer's cost. Three rounds running, that rule was
   * applied by hand to whatever the last finding named — the two top-level keys, then
   * `inProgress.game`, then `inProgress.bench` — and each time the level below it went unnoticed.
   * So it is now DERIVED from the two shipped writers: start a page and start a job from the SAME
   * save, and the difference between their queue entries' key sets must be exactly
   * `GAME_QUEUE_FIELDS` — the set `withoutGameKeys` deletes. A field added to `page.draftUnion` or
   * `state.benchFor` that nobody prices fails here, naming it, before it can be charged to the
   * study half.
   */
  test('GAME_QUEUE_FIELDS is exactly what startJob adds to a queue entry that startPage does not', () => {
    const today = todayISO(new Date(NOW));
    /* UNION OVER MANY SAVES, both sides. A single save is not enough: `composePage` only writes
       `rename` when the queue happens to hold a figure card (`page.js:283`), so a one-save diff
       would read a study field as a game one on the first seed that put one in the job's queue and
       not the page's. */
    let pageKeys = new Set(), jobKeys = new Set(), benchKeys = new Set(), checked = 0;
    for (let i = 0; i < 24; i++) {
      const a = seededSave(i), b = seededSave(i);
      try { startPage(a, { now: NOW, today }); startJob(b, { now: NOW, today, shape: 'JOB12' }); } catch { continue; }
      const keysOf = (q) => { const o = new Set(); for (const it of q ?? []) for (const k of Object.keys(it)) o.add(k); return o; };
      const pk = keysOf(a.inProgress?.queue), jk = keysOf(b.inProgress?.queue);
      if (!pk.size || !jk.size) continue;
      checked++;
      for (const k of pk) pageKeys.add(k);
      for (const k of jk) jobKeys.add(k);
      // the bench entries a brief-window swap splices into that queue (`benchFor` → `swapIn`)
      for (const it of b.inProgress?.bench ?? []) for (const k of Object.keys(it)) benchKeys.add(k);
    }
    assert.ok(checked >= 8, `only ${checked} of 24 seeded saves produced both a page and a job queue — the diff below is not a union any more`);
    const priced = Object.keys(GAME_QUEUE_FIELDS).sort();
    const extra = [...jobKeys].filter((k) => !pageKeys.has(k)).sort();
    /* the DRAFTED queue's own additions must be a subset of what is priced (they are 6 of the 8;
       `basePosted` and `declined` only reach the queue once a swap is taken) … */
    assert.deepEqual(extra.filter((k) => !priced.includes(k)), [],
      `the GAME layer adds ${extra.join(', ')} to a drafted queue entry, but withoutGameKeys() strips ${priced.join(', ')} — the difference is being charged to the wrong half of the split. Update GAME_QUEUE_FIELDS in tests/_helpers.mjs and restate SAVE_BUDGET_KB.queueDelta`);
    // … and the BENCH entries `swapIn` splices in must account for the rest, with nothing left over.
    const benchExtra = [...benchKeys].filter((k) => !pageKeys.has(k)).sort();
    assert.deepEqual(benchExtra.filter((k) => !priced.includes(k)), [],
      `a benched entry carries ${benchExtra.join(', ')}, which swapIn splices straight into inProgress.queue — withoutGameKeys() strips only ${priced.join(', ')}`);
    assert.deepEqual([...new Set([...extra, ...benchExtra])].sort(), priced,
      `GAME_QUEUE_FIELDS prices ${priced.join(', ')} but the two shipped writers between them add ${[...new Set([...extra, ...benchExtra])].sort().join(', ')} — a priced field nothing writes any more is dead weight in the budget; drop it and restate SAVE_BUDGET_KB.queueDelta`);
  });

  /**
   * The same rule for `save.trophies`: the six ids whose predicates read only `player` / `game` are
   * the layer's, and no other trophy may be. `data/trophies.js` is the authority; this reads it as
   * SOURCE (the file is data, and its predicates are closures this test cannot evaluate) so that a
   * seventh game trophy added there fails here rather than landing unpriced in the study half.
   */
  test('GAME_TROPHY_IDS is every trophy whose predicate reads only the game layer', () => {
    const src = readFileSync(join(ROOT, 'site/data/trophies.js'), 'utf8');
    /* one block per literal-id `def(` call: from its own `def(` to the next one (or EOF). Loop-built
       ids (`def(\`boss:${b.id}\`…)`) are deliberately not matched — they are study trophies and
       their bodies cannot read the layer. */
    const starts = [...src.matchAll(/\bdef\(\s*'([a-z0-9:-]+)'/g)];
    assert.ok(starts.length >= 12, `the trophy catalogue scan found ${starts.length} literal-id defs — the def('id' shape changed`);
    const blocks = starts.map((m, i) => {
      /* a def() call is one statement followed by a blank line; stop at whichever comes first, the
         blank line or the next def(, so a block can never swallow the helper functions defined
         between two calls (that is how `night-owl-no` first read as game-layer). */
      const hard = starts[i + 1]?.index ?? src.length;
      const blank = src.indexOf('\n\n', m.index);
      return [src.slice(m.index, Math.min(hard, blank === -1 ? hard : blank)), m[1]];
    });
    // every id this lane prices must actually be defined there …
    for (const id of GAME_TROPHY_IDS) {
      assert.ok(starts.some((m) => m[1] === id), `${id} is no longer a trophy in site/data/trophies.js`);
    }
    // … and the game-only helpers must be used by those six and no others.
    const gameish = blocks.filter(([body]) => /\b(wingsManned|sealedTags|bestChain|rollingBrier|cleanGetaway)\b/.test(body)).map(([, id]) => id).sort();
    assert.deepEqual(gameish, [...GAME_TROPHY_IDS].sort(),
      `these trophies read game-layer state but are not in GAME_TROPHY_IDS (so withoutGameKeys charges them to the STUDY half): ${gameish.filter((x) => !GAME_TROPHY_IDS.includes(x)).join(', ') || '(none missing; some priced id no longer reads the layer)'}`);
  });

  /* ------------------------------------------------------------------------------------------
     ROUND 4 (verify) — THE SAME DERIVATION, ONE LEVEL FURTHER OUT: `inProgress.meta.before`.

     Both paths write the before-snapshot into the SAME slot. `screens/run.js`'s flat-Page mount
     writes `const snap = { ...before, tiles: tilesBefore }` — five keys; `captureJobBefore` writes
     those five plus six of its own, and `screens/job.js` calls it inside `update()` on every job, so
     they reach disk. `withoutGameKeys` stripped `inProgress`'s key list and the queue ENTRIES and
     stopped there, so the six were charged to the STUDY half and priced in no row — the bench's
     defect (round 2) and the queue fields' (round 3), a third time.

     So it is DERIVED, not typed: run.js's own flat-Page literal is read as SOURCE (it is not an
     exported function — the mount builds it inline) and diffed against what the shipped
     `captureJobBefore` returns over a corpus of real jobs. A seventh key fails here, naming itself.
     ------------------------------------------------------------------------------------------ */

  /** The top-level keys of the object literal whose opening `{` is at `i` (strings and nesting safe). */
  function literalKeys(src, i) {
    const keys = [];
    let depth = 0;
    for (let j = i; j < src.length; j++) {
      const c = src[j];
      if (c === '"' || c === "'" || c === '`') {
        const q = c; j++;
        while (j < src.length && src[j] !== q) { if (src[j] === '\\') j++; j++; }
        continue;
      }
      if (c === '{' || c === '[' || c === '(') { depth++; continue; }
      if (c === '}' || c === ']' || c === ')') { depth--; if (depth === 0) break; continue; }
      if (depth === 1 && c === ':') {
        let k = j - 1;
        while (k >= 0 && /\s/.test(src[k])) k--;
        const end = k + 1;
        while (k >= 0 && /[A-Za-z0-9_$]/.test(src[k])) k--;
        const name = src.slice(k + 1, end);
        if (name) keys.push(name);
      }
    }
    return keys;
  }

  /**
   * The keys `screens/run.js`'s FLAT PAGE path snapshots, read out of run.js's own literals.
   *
   * The anchor is the WRITE — `const snap = { ...before, tiles: tilesBefore }`, the statement that
   * puts the flat Page's snapshot on `inProgress.meta.before` — and the `before = { … }` literal it
   * spreads is then the nearest one ABOVE it. Anchoring on `before = {` alone matched
   * `mintedTiles(before = {}, …)`'s default parameter and read the page's snapshot as empty.
   */
  function pageBeforeKeys() {
    const src = readFileSync(join(ROOT, 'site/js/screens/run.js'), 'utf8');
    const b = src.indexOf('{ ...before,');
    assert.ok(b > 0, 'run.js no longer writes `{ ...before, … }` into inProgress.meta.before — re-derive GAME_META_FIELDS against whatever replaced it, do not hand-maintain the list');
    const a = src.lastIndexOf('before = {', b);
    assert.ok(a > 0, "run.js no longer builds the flat Page's before-snapshot as `before = { … }` — re-derive GAME_META_FIELDS");
    const keys = [...literalKeys(src, src.indexOf('{', a)), ...literalKeys(src, b)];
    assert.ok(keys.length >= 5, `the flat Page's snapshot literal parsed to ${keys.length} keys (${keys.join(', ')}) — the parse is stale, not the budget`);
    return new Set(keys);
  }

  /** `captureJobBefore`'s snapshot on `n` real jobs — the union of its keys, and one sample. */
  function jobBeforeCorpus(n = 24, { sealAll = false } = {}) {
    const keys = new Set(); let checked = 0, sample = null;
    for (let i = 0; i < n; i++) {
      const s = seededSave(i, { allOverdue: true });
      /* A REAL `profileId`, because `inProgress.seed` is `job|<profileId>|<day>|<n>` and
         `store.newProfileId()` writes a 36-character UUID. This suite's corpus labels saves
         `save-<i>`, which would measure the seed 30 B narrower than any real save's. */
      s.profileId = `d6f2162f-4078-43a8-ba34-3d1c713c89${String(i).padStart(2, '0')}`;
      if (sealAll) {
        s.game.tags = Object.fromEntries(TAG_IDS.map((id) => [id,
          { ...TAG_RECORD_DEFAULT, triggered: 11, resolved: 4, cleared: true, sealed: true, days: 3, lastDay: todayISO(new Date(NOW)) }]));
      }
      try { startJob(s, { now: NOW, today: todayISO(new Date(NOW)), shape: 'JOB12' }); } catch { continue; }
      if (!s.inProgress) continue;
      const snap = captureJobBefore(s, s.inProgress.queue);
      if (!snap) continue;
      checked++;
      for (const k of Object.keys(snap)) keys.add(k);
      if (!sample || (sealAll && (snap.tags?.length ?? 0) > (sample.tags?.length ?? 0))) sample = snap;
    }
    return { keys, checked, sample };
  }

  test('GAME_META_FIELDS is exactly what captureJobBefore adds to the before-snapshot that the flat Page does not', () => {
    const pageKeys = pageBeforeKeys();
    const { keys: jobKeys, checked } = jobBeforeCorpus();
    assert.ok(checked >= 8, `only ${checked} of 24 seeded saves produced a job before-snapshot — the union below is not a union any more`);
    console.log(`  before-snapshot: flat Page writes ${[...pageKeys].sort().join(', ')}`);
    console.log(`  before-snapshot: a job writes     ${[...jobKeys].sort().join(', ')}`);
    /* the parse has to be LIVE: every key run.js's flat literal names must be in the job's snapshot
       too, or the two paths have diverged and the diff below is measuring a stale read of run.js. */
    assert.deepEqual([...pageKeys].filter((k) => !jobKeys.has(k)), [],
      'run.js\'s flat-Page snapshot literal names keys captureJobBefore does not write — the source parse above is stale, or the two paths have diverged');
    const extra = [...jobKeys].filter((k) => !pageKeys.has(k)).sort();
    assert.deepEqual(extra, [...GAME_META_FIELDS].sort(),
      `captureJobBefore adds ${extra.join(', ')} to inProgress.meta.before, but withoutGameKeys() strips ${[...GAME_META_FIELDS].sort().join(', ')} — the difference is being charged to the STUDY half of the split and priced in no row. Update GAME_META_FIELDS in tests/_helpers.mjs and restate SAVE_BUDGET_KB.metaDelta`);
  });

  test('the before-snapshot fixture is no NARROWER than what a real job writes, and prices nothing it does not', () => {
    const { sample, checked } = jobBeforeCorpus(24, { sealAll: true });
    assert.ok(checked >= 8 && sample, `only ${checked} seeded saves produced a before-snapshot`);
    assert.equal(sample.tags.length, CAPS.game.tags,
      `the corpus sealed ${sample.tags.length} tags, not all ${CAPS.game.tags} — the tags line would be measured against a snapshot that is not at its cap (index-68 is a shipped trophy, so all 68 sealed is reachable by construction)`);
    const fx = worstCaseJobBefore(T0, CAPS.game);
    /* COMPLETENESS both ways — the fixture must price every key a real snapshot carries, and must
       not price one it does not (dead weight in the budget is the other half of the same defect). */
    assert.deepEqual(Object.keys(sample).sort(), Object.keys(fx).sort(),
      'worstCaseJobBefore() is not a fixed point of captureJobBefore() — it would price a snapshot the app cannot write');
    assert.deepEqual(Object.keys(sample.index).sort(), Object.keys(fx.index).sort(), 'the index record drifted from jobIndex.indexProgress()');
    assert.deepEqual(Object.keys(sample.coverage).sort(), Object.keys(fx.coverage).sort(), 'the coverage record drifted from readiness.coverageCount()');
    assert.deepEqual(Object.keys(sample.readiness).sort(), Object.keys(fx.readiness).sort(), 'the readiness record drifted');
    assert.deepEqual(Object.keys(sample.skills[0]).sort(), Object.keys(fx.skills[0]).sort(), 'the skill-state record drifted from readiness.skillStates()');
    assert.equal(String(sample.seed).split('|')[1]?.length, 36,
      'the corpus save no longer carries a UUID profileId — inProgress.seed would be measured 30 B narrower than any real save writes it');
    assert.ok(SKILL_IDS.length <= fx.skills.length,
      `data/skills.js has ${SKILL_IDS.length} makes and the fixture prices ${fx.skills.length} skillStates entries — raise SKILL_STATES in tests/_helpers.mjs`);
    // … and every leaf at least as wide, measured rather than asserted in a comment.
    const W = (x) => JSON.stringify(x ?? null).length;
    const rows = [
      ['tags', W(sample.tags), W(fx.tags)],
      ['index', W(sample.index), W(fx.index)],
      ['rating', W(sample.rating), W(fx.rating)],
      ['startedAt', W(sample.startedAt), W(fx.startedAt)],
      ['seed', W(sample.seed), W(fx.seed)],
      ['seedTag', W(sample.seedTag), W(fx.seedTag)],
      ['composed', W(sample.composed), W(fx.composed)],
      ['skills[]', Math.max(...sample.skills.map(W)), Math.max(...fx.skills.map(W))],
      ['tiles', W(sample.tiles), W(fx.tiles)],
    ];
    console.log(`  before-snapshot leaves (real @ ${sample.tags.length} sealed tags vs priced):`);
    for (const [k, real, priced] of rows) console.log(`   ${real > priced ? 'OVER' : '  ok'} ${k.padEnd(12)} real ${String(real).padStart(5)} B  priced ${String(priced).padStart(5)} B`);
    const over = rows.filter(([, real, priced]) => real > priced).map(([k]) => k);
    assert.deepEqual(over, [],
      `these before-snapshot leaves are WIDER in a real save than tests/_helpers.mjs prices them: ${over.join(', ')} — widen worstCaseJobBefore() and RESTATE SAVE_BUDGET_KB.metaDelta, do not widen the assertion`);
  });

  test('the inProgress.game fixture is exactly what js/job/state.js serialize() emits', () => {
    const fx = inProgressJob12(T0, CAPS.game);
    assert.deepEqual(STATE_KEYS.filter((k) => !(k in fx)), [],
      'inProgress.game gained a key: give it a worst-case value in tests/_helpers.mjs inProgressJob12() and a row in G7\'s budget table');
    assert.deepEqual(Object.keys(fx).filter((k) => !STATE_KEYS.includes(k)), [], 'the fixture prices a key the serialiser does not emit');
    assert.deepEqual(serialize(freshState(fx)), fx, 'the fixture is not a fixed point of serialize() — it would price a record the app cannot write');
    assert.deepEqual(Object.keys(serialize(freshState(fx)).calls[0]).sort(), Object.keys(fx.calls[0]).sort(), 'the call shape drifted from cleanCall');
  });

  /* ------------------------------------------------------------------------------------------
     ROUND 2. The fixed-point test above pins the fixture's SHAPE. It does not pin its SIZES, and
     that is exactly where the published bound went wrong: `_helpers.mjs` hand-typed `rating: 7.1234`
     where `call.ratingDetail()` returns `6.685919999999999`, `elo: {player:1187.5}` where
     `guard.elo()` returns `1113.257822343893`, `w: 0.2549` where `callEntry` rounds to 6 dp, and a
     skill cycle whose median id is shorter than the longest make there is. Four leaves, 664 B, and
     the "≤ 26 KB (measured 25.69)" the doc published carried only 313 B of margin — so the headline
     was false by 351 B with the whole suite green.

     The two tests below are the guard that makes a restatement unnecessary next time:
       · the VALUES the fixture types are the values the shipped writers emit, rebuilt here;
       · the WIDTHS the fixture prices are never narrower than what REAL jobs driven through
         `js/job/state.js` write — measured, per leaf, on every run.
     ------------------------------------------------------------------------------------------ */

  test('the fixture\'s values are what the shipped writers emit (rebuilt, not re-typed)', () => {
    const fx = worstCasePlayer(T0, CAPS.game);

    // the rating window, rebuilt with the shipped windowPush at its widest inputs
    let win = [];
    for (let i = 0; i < CAPS.game.calls; i++) {
      win = call.windowPush(win, { call: 85, ok: i % 3 !== 0, qHat: 1 / 3, skill: WIDEST_SKILL, at: T0 + i * 60000 }, { N: CAPS.game.calls });
    }
    assert.equal(win.length, CAPS.game.calls, 'windowPush dropped an entry — q̂ = 1/3 is meant to be informative');
    assert.deepEqual(fx.rating.calls, win,
      'worstCasePlayer()\'s window is no longer what call.windowPush writes — rebuild it, do not re-type it');

    /* THE WINDOW ENTRY HAS TWO PRICED LEAVES SINCE VERIFY ROUND 2, and both are derived here rather
       than typed. `callEntry`'s q̂ form now stores the q̂ itself (`q`) and derives the weight from it,
       while the Mock's defined-weight form still stores `w`; `state.applyTarget` writes the derived
       weight into `inProgress.game.calls[].w` through `call.weightOf`. q̂ is `k/n` with
       `n ≤ RATING.qHatWindow`, so thirds are reachable on both leaves. */
    const qs = [];
    for (let n = 1; n <= RATING.qHatWindow; n++) for (let k = 0; k <= n; k++) qs.push(k / n);
    const entries = qs.map((q) => call.callEntry({ call: 85, ok: true, qHat: q, skill: WIDEST_SKILL, at: T0 }));
    assert.ok(entries.some((e) => 'q' in e && e.q != null),
      'call.callEntry no longer stores a q̂ on any window entry — re-derive what the `calls[]` leaf prices');
    const widestQ = Math.max(...entries.map((e) => JSON.stringify(e.q).length));
    assert.equal(JSON.stringify(WIDEST_Q).length, widestQ,
      `call.callEntry can emit a ${widestQ}-character q; the fixture prices ${JSON.stringify(WIDEST_Q).length}`);
    const widestW = Math.max(...entries.map((e) => JSON.stringify(call.weightOf(e)).length));
    assert.equal(JSON.stringify(WIDEST_W).length, widestW,
      `call.weightOf can emit a ${widestW}-character w — the leaf state.applyTarget writes into `
      + `inProgress.game.calls[]; the fixture prices ${JSON.stringify(WIDEST_W).length}`);

    // the longest make id there is — 50 window entries and 26 job calls are priced off it
    const longest = SKILL_IDS.reduce((a, x) => (x.length > a.length ? x : a), '');
    assert.equal(WIDEST_SKILL.length, longest.length, `SKILL_IDS now has a longer id (${longest}) than the fixture prices`);

    // the widest JSON a double can take — the width every unrounded leaf is priced at
    assert.equal(JSON.stringify(WIDE_DOUBLE).length, 24, 'WIDE_DOUBLE is not 24 characters');
    assert.equal(JSON.stringify(WIDE_SIGNED_DOUBLE).length, 25, 'WIDE_SIGNED_DOUBLE is not 25 characters');
    for (const v of [1 / 3, Math.PI, 1e-6, 12345.6789, 1 / 7, 2 / 3, 1e20 / 3]) {
      assert.ok(JSON.stringify(v).length <= 24, `JSON.stringify(${v}) is wider than WIDE_DOUBLE`);
    }

    /* and the two writers the round-2 critic caught round NOTHING, which is why their leaves are
       priced at WIDE_DOUBLE rather than at a hand-typed `7.1234` / `1187.5`. Shown, not asserted in
       prose: two Elo updates and one rating read, and their JSON is already 17 significant digits. */
    let e = { player: 1000, house: 1000 };
    for (let i = 0; i < 2; i++) { const m = guard.elo(e.player, e.house, i % 2); e = { player: m.player, house: m.house }; }
    assert.ok(JSON.stringify(e).length > JSON.stringify({ player: 1187.5, house: 1043.25 }).length,
      `guard.elo() rounds nothing: two updates give ${JSON.stringify(e)} — the fixture must price an unrounded double`);
    assert.ok(JSON.stringify(e).length <= JSON.stringify(fx.elo).length, 'the fixture prices player.elo narrower than guard.elo() emits');
    const v = call.ratingDetail(win.slice(0, 7), CAPS.game.calls).value;
    assert.ok(JSON.stringify(v).length > 6, `call.ratingDetail() rounds nothing: ${JSON.stringify(v)}`);
    assert.ok(JSON.stringify(v).length <= JSON.stringify(fx.rating.value).length, 'the fixture prices rating.value narrower than ratingDetail() emits');
  });

  test('the fixture is not NARROWER than the shipped writers: every leaf, measured on real jobs', () => {
    /* The corpus is 80 seeded saves driven through the real `startJob` → `applyTarget` → `crack`
       path, every one of them missing enough to requeue and taking every swap the brief offers, plus
       three of them replayed for four days so the `game` half (log, ledger, heat, elo, records) is
       written by `endJob` and not by this file. For every leaf the budget prices, the widest JSON
       the corpus produces must be no wider than the fixture prices it.

       ROUND 3 — TWO THINGS ABOUT THIS CORPUS WERE FICTION, AND THEY BOTH INFLUENCED PUBLISHED
       NUMBERS.
         · IT NEVER TOOK A SWAP. The line read `brief(save, { swap: o[0].id })` — a STRING — and
           `state.brief` takes `{ swap: { id } }` (`if (isObj(actions.swap) && str(actions.swap.id))`;
           `screens/job.js:1150` sends `takeBrief({ swap: { id: o.id } })`). A non-object is silently
           ignored, so "taking every swap" took none, and the `calls` maximum this test re-measures —
           the number round 2 published as 23 and priced at 26 — was the maximum of jobs whose queue
           never grew by a swap. With the shipped action shape the same driver reaches 28.
         · IT NEVER MEASURED `inProgress.queue`. The 8 fields `page.draftUnion` and `state.swapIn`
           add to every queue entry were in no fixture and no budget row, and `withoutGameKeys`
           charged them to the study half. They are measured per key below.
       Both are now asserted, including "a swap was actually taken", so neither can go quiet again. */
    const fxP = worstCasePlayer(T0, CAPS.game), fxG = worstCaseGame(T0, CAPS.game), fxI = inProgressJob12(T0, CAPS.game);
    const fxQ = worstCaseJobQueue(T0);
    const W = (v) => JSON.stringify(v).length;
    const worst = {};                                   // leaf → widest JSON seen
    const see = (k, v) => { const n = W(v); if (!(k in worst) || n > worst[k]) worst[k] = n; };
    const counts = {};                                  // leaf → the largest COUNT seen (not a width)
    const count = (k, n) => { if (!(k in counts) || n > counts[k]) counts[k] = n; };
    let jobs = 0, ended = 0, swapsTaken = 0;
    const qKeys = new Set();                            // every key a REAL job queue entry carries
    let paramsSeen = 0, benchParamsSeen = 0;            // round 5: entries carrying the floor's `params`
    let frozenSeen = 0;                                 // round 5: entries carrying a frozen Variant's keys

    for (let i = 0; i < 120; i++) {
      // half the first 80 is a week-off catch-up (everything overdue), which is where the longest
      // boards and therefore the longest queues and call lists come from. The last 20 are the
      // OPPOSITE state — no backlog at all — which is the only one that composes an S7 algebra
      // floor item, and therefore the only one that writes a queue entry carrying `params`. Round 5
      // added it: with the first 80 alone this corpus produced none in 546 000 observations, and the
      // completeness guard below could not fail on a key the shipped composer writes.
      // …and the last 20 carry frozen Variants, all due, which is the only state that composes the
      // OTHER queue-entry shape — a `kind: 'frozen'` due, which `page.js:287` writes with
      // `frozenKey` + `templateVersion` and without `rename`/`bucket`/`overdue`/`sweep`.
      const save = i < 80 ? seededSave(i, { allOverdue: i % 2 === 1 })
        : i < 100 ? seededSave(i, { lowDue: true })
          : seededSave(i, { frozenN: 6 });
      const days = i < 3 ? 4 : 1;
      for (let d = 0; d < days; d++) {
        let t = NOW + d * DAY_MS;
        const step = (ms) => (t += ms);
        try { startJob(save, { today: todayISO(new Date(t)), now: t, shape: 'JOB12' }); } catch { break; }
        jobs++;
        see('inProgress.bench', save.inProgress?.bench ?? []);
        count('bench.entries', save.inProgress?.bench?.length ?? 0);
        count('queue.drafted', save.inProgress?.queue?.length ?? 0);
        beginTargets(save, { now: step(6000) });
        for (let n = 0; n < 400; n++) {
          const g = stateOf(save);
          if (!g || g.outcome != null) break;
          const ser = serialize(g);
          for (const k of STATE_KEYS) see(`inProgress.game.${k}`, ser[k]);
          see('inProgress.game', ser);
          count('calls', ser.calls.length);
          count('locks', ser.bundles.reduce((a, b) => a + b.locks.length, 0));
          count('locksPerBundle', Math.max(0, ...ser.bundles.map((b) => b.locks.length)));
          /* the queue, per key — the line round 3 found in no fixture and no budget row. */
          const q = save.inProgress?.queue ?? [];
          count('queue.entries', q.length);
          see('inProgress.queue', q);                 // the whole line, not just its widest entry
          for (const it of q) {
            see('inProgress.queue[]', it);
            if ('params' in it) paramsSeen++;
            if ('frozenKey' in it) frozenSeen++;
            /* THE TWO SHAPES NEVER MEET, which is what makes it sound to price the LINE on 36
               card-shaped entries while pricing the frozen shape's two extra KEYS separately. */
            assert.ok(!('rename' in it && 'frozenKey' in it),
              `a real queue entry carries BOTH \`rename\` and \`frozenKey\` (${it.id}) — the two composer branches have merged, so worstCaseJobQueue() must price the union on every entry and SAVE_BUDGET_KB must be restated on the wider line`);
            for (const k of Object.keys(it)) { qKeys.add(k); see(`inProgress.queue[].${k}`, it[k]); }
          }
          for (const it of save.inProgress?.bench ?? []) { if ('params' in it) benchParamsSeen++; see('inProgress.bench[]', it); }
          if (g.phase === 'envelope') { const av = callsAvailable(save); const want = [95, 85, 70, 50][n % 4]; lockCall(save, av.includes(want) ? want : av[av.length - 1], { now: step(5000) }); continue; }
          /* half the corpus misses EVERYTHING: a missed review is re-queued (`page.requeueReview`,
             once each) and the queue a call is written per grows past the 12 drafted targets. */
          if (g.phase === 'answer') { applyTarget(save, (i % 2 === 0 || n % 3 === 0 ? MISS : CLEAN), { now: step(40000) }); continue; }
          if (g.phase === 'payout' || g.phase === 'bagpush') { if (n % 7 === 0) bag(save, { now: step(9000) }); else push(save, { now: step(9000) }); continue; }
          if (g.phase === 'brief') {
            const o = swapOptions(save);
            // THE SHIPPED ACTION SHAPE — `{ swap: { id } }`, not `{ swap: id }`. See the note above.
            const res = brief(save, o.length ? { swap: { id: o[0].id } } : {}, { now: step(20000) });
            if (res?.swap) swapsTaken++;
            continue;
          }
          if (g.phase === 'getaway') { crack(save, { now: step(25000) }); continue; }
          break;
        }
        if (stateOf(save) == null) ended++;
        for (const e of save.player?.rating?.calls ?? []) see('player.rating.calls[]', e);
        see('player.rating.value', save.player?.rating?.value ?? 0);
        see('player.elo', save.player?.elo ?? {});
        see('player.records', save.player?.records ?? {});
        see('player.records.bestRating20', save.player?.records?.bestRating20 ?? 0);
        for (const e of save.game?.log ?? []) see('game.log[]', e);
        see('game.ledger', save.game?.ledger ?? {});
        see('game.ledger.phaseMeans', save.game?.ledger?.phaseMeans ?? {});
        see('game.heat.press', save.game?.heat?.press ?? {});
        see('game.heat.weight', save.game?.heat?.weight ?? 0);
        for (const w of save.game?.heat?.window ?? []) see('game.heat.window[]', w);
        for (const id of Object.keys(save.game?.tags ?? {})) { see('game.tags[]', save.game.tags[id]); see('game.tags key', id); }
      }
    }
    assert.ok(jobs >= 10 && ended >= 8, `the corpus did not run: ${jobs} jobs started, ${ended} finished — this test would pass vacuously`);

    /* COMPLETENESS FIRST. A leaf that is not priced at all is the bug this whole round was about
       (`ledger.debriefAt` was written by every job end and declared in none of the three places that
       are the schema), so before comparing widths: the key set a REAL save's `player` / `game` /
       `game.ledger` / `game.heat` carries must be exactly the key set the fixtures price. A lane that
       adds a key fails HERE, naming it, instead of quietly widening the save. */
    const real = seededSave(99);
    for (let d = 0; d < 2; d++) {
      let t = NOW + d * DAY_MS;
      try { startJob(real, { today: todayISO(new Date(t)), now: t, shape: 'JOB12' }); } catch { break; }
      beginTargets(real, { now: (t += 6000) });
      for (let n = 0; n < 400; n++) {
        const g = stateOf(real);
        if (!g || g.outcome != null) break;
        if (g.phase === 'envelope') { const av = callsAvailable(real); lockCall(real, av[av.length - 1], { now: (t += 5000) }); continue; }
        if (g.phase === 'answer') { applyTarget(real, n % 3 ? CLEAN : MISS, { now: (t += 40000) }); continue; }
        if (g.phase === 'payout' || g.phase === 'bagpush') { push(real, { now: (t += 9000) }); continue; }
        if (g.phase === 'brief') { brief(real, {}, { now: (t += 20000) }); continue; }
        if (g.phase === 'getaway') { crack(real, { now: (t += 25000) }); continue; }
        break;
      }
    }
    const keys = (o) => Object.keys(o ?? {}).sort();
    assert.deepEqual(keys(real.player), keys(fxP), 'a real save.player has keys the G7 fixture does not price');
    assert.deepEqual(keys(real.game), keys(fxG), 'a real save.game has keys the G7 fixture does not price');
    assert.deepEqual(keys(real.game.ledger), keys(fxG.ledger), 'a real game.ledger has keys the G7 fixture does not price — declare it in SAVE_DEFAULTS, freshGame() and G7 first');
    assert.deepEqual(keys(real.game.heat), keys(fxG.heat), 'a real game.heat has keys the G7 fixture does not price');
    assert.deepEqual(keys(real.player.records), keys(fxP.records), 'a real player.records has keys the G7 fixture does not price');
    assert.deepEqual(keys(real.game.log[0] ?? {}), keys(fxG.log[0]), 'a real game.log record has keys the G7 fixture does not price');
    assert.deepEqual(keys(real.player.rating.calls[0] ?? {}), keys(fxP.rating.calls[0]), 'a real rating-window entry has keys the G7 fixture does not price');
    /* ROUND 3 — the same completeness check for the queue entry, the record whose game fields were
       in no fixture at all. The fixture must price every key a real job's queue entry carries. */
    /* ROUND 5 — the fixture is TWO shapes, so the guard is against the UNION of what they price and
       not against entry 0 alone. `worstCaseJobQueue()` is the card-shaped review/rematch;
       `worstCaseFrozenReviewItem()` is the frozen-Variant review, which carries `frozenKey` and
       `templateVersion` and cannot carry `rename`/`bucket`/`overdue`/`sweep`. Checking `fxQ[0]` only
       would report the frozen shape's own keys as unpriced the moment the corpus produced one. */
    const fxFrozen = worstCaseFrozenReviewItem(T0);
    const fxQueueKeys = new Set([...Object.keys(fxQ[0]), ...Object.keys(fxFrozen)]);
    const qMissing = [...qKeys].filter((k) => !fxQueueKeys.has(k)).sort();
    assert.deepEqual(qMissing, [],
      `a real job's inProgress.queue entry carries keys worstCaseJobQueue() does not price: ${qMissing.join(', ')} — price them, and if the GAME layer adds them, add them to GAME_QUEUE_FIELDS so withoutGameKeys() stops charging them to the study half`);
    /* ROUND 5 (verify) — AND THE GUARD ABOVE IS NOT VACUOUS ON THE OPTIONAL KEYS. `params` is written
       by `composePage`'s S7 algebra floor only, so it is present on SOME queue entries and absent
       from most; a corpus made only of backlog saves composes no floor at all and the guard passed
       for two rounds on a key the shipped composer writes and `worstCaseJobQueue()` did not price
       (546 000 entry observations, zero `params`). The `lowDue` arm exists to produce them, and this
       is the assertion that keeps it doing so: if the arm stops composing a floor — a LIMITS change,
       a board change — this fails HERE, naming the reason, instead of the completeness check going
       quietly blind again. Every OTHER key a queue entry carries is unconditional, so the deepEqual
       above is non-vacuous for those by construction (`qKeys` is non-empty and `jobs >= 10`). */
    /* the same non-vacuity pin for the frozen shape, and the dominance the LINE's pricing rests on:
       a frozen-Variant entry at its widest must be no wider than the card-shaped entry the 36-entry
       line is built from, or the line is priced on the wrong shape. */
    assert.ok(qKeys.has('frozenKey') && qKeys.has('templateVersion') && frozenSeen > 0,
      `no queue entry in the corpus carried a frozen Variant's \`frozenKey\`/\`templateVersion\` (${frozenSeen} of ${jobs} jobs) — only a \`kind: 'frozen'\` due composes that shape (site/js/page.js:287), so without the \`frozenN\` arm the completeness check above cannot see either key. Fix the arm, do not delete this assertion`);
    assert.ok(W(fxFrozen) <= Math.max(...fxQ.map(W)),
      `the frozen-Variant shape is now ${W(fxFrozen)} B against the card shape's ${Math.max(...fxQ.map(W))} B — inProgress.queue is priced as ${fxQ.length} card-shaped entries because that shape DOMINATED. It no longer does: price the line on the frozen shape and restate SAVE_BUDGET_KB.queueDelta and COMPOSED.md S6's study half`);
    assert.ok(qKeys.has('params') && paramsSeen > 0,
      `no queue entry in the corpus carried \`params\` (${jobs} jobs, ${paramsSeen} entry observations) — the S7 algebra floor (site/js/page.js:392) is the only writer of it, and without a save whose board is short enough to compose one, the completeness check above cannot see an unpriced optional key. Fix the \`lowDue\` arm, do not delete this assertion`);

    /* leaf → what the fixture prices it at. */
    const priced = {
      'player.rating.calls[]': W(fxP.rating.calls[0]),
      'player.rating.value': W(fxP.rating.value),
      'player.elo': W(fxP.elo),
      'player.records': W(fxP.records),
      'player.records.bestRating20': W(fxP.records.bestRating20),
      'game.log[]': W(fxG.log[0]),
      'game.ledger': W(fxG.ledger),
      'game.ledger.phaseMeans': W(fxG.ledger.phaseMeans),
      'game.heat.press': W(fxG.heat.press),
      'game.heat.weight': W(fxG.heat.weight),
      'game.heat.window[]': W(fxG.heat.window[0]),
      'game.tags[]': W(Object.values(fxG.tags)[0]),
      'game.tags key': W(Object.keys(fxG.tags)[0]),
      'inProgress.bench': W(worstCaseBench(T0)),
      /* per ENTRY as well as per line (round 5): a real bench is 1-2 entries against the fixture's
         four, so the line total can stay green while a single entry is wider than priced. */
      'inProgress.bench[]': Math.max(...worstCaseBench(T0).map(W)),
      'inProgress.game': W(fxI),
      ...Object.fromEntries(STATE_KEYS.map((k) => [`inProgress.game.${k}`, W(fxI[k])])),
      /* the WIDEST fixture entry per key, not entry 0's: `n` and the `result.n` inside it are
         1-digit on the first entry and 2-digit from the tenth, and a real job's tenth entry is the
         one that would otherwise come in over. */
      'inProgress.queue': W(fxQ),
      'inProgress.queue[]': Math.max(...fxQ.map(W), W(fxFrozen)),
      /* per key, over BOTH shapes and over whichever entries actually carry the key — `frozenKey`
         and `templateVersion` live only on the frozen-Variant entry, `rename`/`bucket`/`overdue`/
         `sweep` only on the card-shaped ones. */
      ...Object.fromEntries([...fxQueueKeys].map((k) => [`inProgress.queue[].${k}`,
        Math.max(...[...fxQ, fxFrozen].filter((e) => k in e).map((e) => W(e[k])))])),
    };
    const rows = Object.keys(priced).filter((k) => k in worst).sort();
    const over = rows.filter((k) => worst[k] > priced[k]);
    console.log(`  widest real leaf vs priced (${jobs} real jobs, ${ended} finished):`);
    for (const k of rows) console.log(`   ${over.includes(k) ? 'OVER' : '  ok'} ${k.padEnd(30)} real ${String(worst[k]).padStart(5)} B  priced ${String(priced[k]).padStart(5)} B`);
    assert.deepEqual(over, [],
      `these leaves are WIDER in a real save than tests/_helpers.mjs prices them: ${over.map((k) => `${k} ${worst[k]} > ${priced[k]}`).join('; ')} — widen the fixture and RESTATE SAVE_BUDGET_KB, do not widen the assertion`);

    /* THE COUNTS, which are not widths: a call is written per ANSWERED queue entry, so requeues and
       brief-window swaps carry both past the 12 drafted targets; the bench is one entry per
       undrafted target the drafted queue does not already hold.

       ROUND 3 — EVERY LINK OF THE STRUCTURAL CHAIN IS ASSERTED, not just its last term. Rounds 1-2
       asserted only `calls ≤ fixture` and published the corpus maximum (12, then 23) as "the number
       a real JOB12 reaches". That number was measured on a corpus that never took a swap, and the
       fixture that quoted it ended up EXACTLY saturated: the shipped `{ swap: { id } }` form reaches
       28 against a priced 26, on a line with 61 B of slack. So the fixture is now derived —
       `JOB_QUEUE_ITEMS = 2 × (JOB_QUEUE_DRAFTED + BENCH_ENTRIES)` — and each input of that formula
       is checked against the corpus here, so a board that starts drafting 15 targets fails on the
       DRAFTED line, naming it, rather than silently eating the derived headroom. */
    const fxLocks = fxI.bundles.reduce((a, b) => a + b.locks.length, 0);
    console.log(`   counts: calls ${counts.calls}/${fxI.calls.length} · queue ${counts['queue.entries']}/${fxQ.length} (drafted ${counts['queue.drafted']}/${JOB_QUEUE_DRAFTED}) · locks ${counts.locks}/${fxLocks} (max per bundle ${counts.locksPerBundle}/${Math.max(...fxI.bundles.map((b) => b.locks.length))}) · bench ${counts['bench.entries']}/${BENCH_ENTRIES} · swaps taken ${swapsTaken} · entries carrying \`params\` ${paramsSeen} queue / ${benchParamsSeen} bench · frozen-Variant entries ${frozenSeen}`);
    /* NON-VACUITY, and the one that matters most: for two rounds this driver passed a STRING where
       `state.brief` wants `{ id }`, so "taking every swap" took none and every count below was the
       count of a job whose queue could not grow by a swap. */
    assert.ok(swapsTaken > 0,
      'the corpus never actually took a brief-window swap — `state.brief` wants `{ swap: { id } }` and silently ignores anything else, so the calls/queue maxima below are not measuring the longest jobs the app can produce');
    assert.equal(fxQ.length, 2 * (JOB_QUEUE_DRAFTED + BENCH_ENTRIES),
      'the queue fixture is no longer the structural ceiling 2 × (drafted + bench) — see tests/_helpers.mjs JOB_QUEUE_ITEMS');
    assert.equal(fxI.calls.length, fxQ.length,
      'a call is written per ANSWERED queue entry, so the two fixtures must price the same count');
    assert.ok(counts['queue.drafted'] <= JOB_QUEUE_DRAFTED,
      `a real JOB12 board drafted ${counts['queue.drafted']} targets; the structural ceiling is built on ${JOB_QUEUE_DRAFTED}. Raise JOB_QUEUE_DRAFTED in tests/_helpers.mjs and restate SAVE_BUDGET_KB`);
    assert.ok(counts['queue.entries'] <= fxQ.length,
      `a real JOB12 queue reached ${counts['queue.entries']} entries; the fixture prices ${fxQ.length}`);
    assert.ok(counts.calls <= fxI.calls.length,
      `a real JOB12 reached ${counts.calls} calls; the fixture prices ${fxI.calls.length}. serialize() puts no cap on the array — raise the fixture and restate SAVE_BUDGET_KB.inProgress, or cap it in state.serialize()`);
    assert.ok(counts.locks <= fxLocks, `a real board posted ${counts.locks} locks; the fixture prices ${fxLocks}`);
    assert.ok(counts['bench.entries'] <= BENCH_ENTRIES,
      `a real board benched ${counts['bench.entries']} contracts; the fixture prices ${BENCH_ENTRIES}`);
    /* THE TWO AXES ARE MEASURED SEPARATELY, and this is why. Round 1's `inProgress.game` line passed
       only because the fixture over-priced one axis (5 bundles × 12 locks, where a real JOB12 board
       posts ~33 in total) by about as much as it under-priced the other (12 calls, where a real job
       reaches 23) — two errors pointing opposite ways, and the 89 B of slack on the line was their
       accidental difference. A per-line byte total cannot see that; a per-axis count can. */
    assert.ok(counts.calls > 12,
      'no job in the corpus went past its 12 drafted targets — the corpus stopped exercising requeues and swaps, so the calls bound is no longer measured');
  });

  test('a worst-case save with a 12-TARGET JOB IN PROGRESS adds at most SAVE_BUDGET_KB.totalAdded', () => {
    const s = applyCaps(carrier());
    const added = addedBy(s);
    const withoutRunFields = addedBy(applyCaps(carrier({ runFields: false })));
    const p = pack(s);
    const part = (x) => JSON.stringify(x).length;
    const qDelta = deltaOn(s, (x) => x.inProgress.queue), tDelta = deltaOn(s, (x) => x.trophies);
    console.log(`  game keys added: ${added} B = ${(added / KB).toFixed(2)} KB  (player ${part(p.player)} · game ${part(p.game)} · inProgress.game ${part(p.inProgress.game)} · inProgress.bench ${part(p.inProgress.bench)} · inProgress.queue ${qDelta} · trophies ${tDelta} · runs delta ${added - part(p.player) - part(p.game) - part(p.inProgress.game) - part(p.inProgress.bench) - qDelta - tDelta})`);
    console.log(`  of game: tags ${part(p.game.tags)} · log ${part(p.game.log)} · heat.window ${part(p.game.heat.window)} · calls ${part(p.player.rating.calls)}`);
    console.log(`  without the reserved runs[] game fields (what the app writes TODAY): ${withoutRunFields} B = ${(withoutRunFields / KB).toFixed(2)} KB`);
    assert.ok(added <= SAVE_BUDGET_KB.totalAdded * KB, `the game layer added ${(added / KB).toFixed(2)} KB > ${SAVE_BUDGET_KB.totalAdded} KB`);
    assert.ok(added > 10 * KB, 'the carrier is not saturated — this test would pass vacuously');
    assert.ok(withoutRunFields <= added, 'omitting a run field cannot cost more');
    /* THE NUMBER THE APP ACTUALLY COSTS, asserted rather than printed (ticket fix:tests r1,
       round-1 ledger-invariance finding on the ≤ 26 KB bound). `withoutRunFields` was being printed
       to the console and then checked only against `<= added`, which is true for free. The seven
       `runs[]` fields are a RESERVED line — no shipped path writes them (asserted below) — so this
       two-sided bound is what the published `subtotal` rests on. If a path starts writing them, this
       figure moves and G7's subtotal row is folded into `totalAdded`. */
    assert.ok(withoutRunFields <= SAVE_BUDGET_KB.subtotal * KB,
      `without the reserved runs[] fields the layer adds ${(withoutRunFields / KB).toFixed(2)} KB, over G7's subtotal of ${SAVE_BUDGET_KB.subtotal} KB`);
    assert.ok(withoutRunFields > 15 * KB,
      `without the reserved runs[] fields the layer adds only ${(withoutRunFields / KB).toFixed(2)} KB — the carrier has stopped saturating`);
    assert.ok(added - withoutRunFields > 4 * KB,
      `the reserved runs[] line is worth ${((added - withoutRunFields) / KB).toFixed(2)} KB of the ${SAVE_BUDGET_KB.totalAdded} KB bound`);
    /* THE BENCH IS GAME BYTES (round 2). `withoutGameKeys` used to leave `inProgress.bench` in the
       study half, so the split was wrong in BOTH directions at once and neither carrier had a bench
       to make it visible. Assert the split moves when the bench does — a `withoutGameKeys` that
       stops deleting it fails here rather than silently mis-attributing ~1.9 KB. */
    const withoutBench = addedBy(applyCaps(carrier({ bench: false })));
    assert.ok(added - withoutBench > KB,
      `the bench is worth ${added - withoutBench} B of the addition — withoutGameKeys() is charging it to the study half again`);
    /* THE QUEUE FIELDS AND THE SIX TROPHIES ARE GAME BYTES TOO (round 3) — the same defect as the
       bench, one level deeper: `withoutGameKeys` stopped at the `inProgress` KEY LIST and at the
       top-level keys, so the 8 fields the layer adds to every queue ENTRY and the six trophies only
       a job can earn were both charged to the study half AND left out of the addition. These two
       assertions are the tripwire: a `withoutGameKeys` that stops deleting either fails here. */
    assert.ok(qDelta > KB,
      `the job's queue fields are worth ${qDelta} B of the addition — withoutGameKeys() is charging them to the study half again (site/js/page.js draftUnion adds from/sources/wing/posted/x2/critical; state.swapIn adds basePosted/declined)`);
    assert.ok(tDelta > 150,
      `the six game trophies are worth ${tDelta} B of the addition — withoutGameKeys() is charging them to the study half again`);
    const withoutQueue = addedBy(applyCaps(carrier({ queue: false })));
    const withoutTrophies = addedBy(applyCaps(carrier({ trophies: false })));
    assert.equal(added - withoutQueue, qDelta, 'the queue line must be exactly the queue delta');
    assert.equal(added - withoutTrophies, tDelta, 'the trophy line must be exactly the trophy delta');
    /* THE BEFORE-SNAPSHOT'S SEVEN FIELDS ARE GAME BYTES TOO (round 4, verify) — the same defect a
       fourth time, one level past the queue ENTRIES. Two assertions, because this row is a DELTA on
       a key BOTH paths write: the delta must be the game fields (a `withoutGameKeys` that stops
       stripping them fails the first), and it must be ONLY the game fields — a `withoutGameKeys`
       that deleted `before`, or `meta`, outright would charge the flat Page's own five keys to this
       layer and fail the second. */
    const mDelta = deltaOn(s, (x) => x.inProgress.meta);
    const withoutMeta = addedBy(applyCaps(carrier({ meta: false })));
    assert.equal(added - withoutMeta, mDelta, 'the before-snapshot line must be exactly the inProgress.meta delta');
    assert.ok(mDelta > KB,
      `the job's before-snapshot fields are worth ${mDelta} B of the addition — withoutGameKeys() is charging them to the study half again (screens/run.js captureJobBefore adds tags/index/rating/startedAt/seed/seedTag/composed to the five keys the flat Page path writes)`);
    const studyKept = pack(withoutGameKeys(s)).inProgress.meta.before;
    assert.deepEqual(Object.keys(studyKept).sort(), ['coverage', 'readiness', 'skills', 'tiles', 'xp'],
      'withoutGameKeys() must leave the flat Page\'s own five snapshot keys in the STUDY half — stripping `before` or `meta` outright would charge the study layer\'s own bytes to the game layer');
  });

  /* ---------------------------------------------------------------------------------------------
     ROUND-2 VERIFY (save-budget finding 9) — S6 IS CLOSED AGAINST A MEASURED SAVE, NOT THREE
     CONSTANTS.

     What stood here was `500_000 + SAVE_BUDGET_KB.totalAdded * 1024 < 528 * 1024` — 540 550.4 <
     540 672, a literal plus a literal against a literal, with 121.6 B of margin and no measurement
     in the closing assertion at all (the `added` it measured was used only on the line above). It
     could not fail for the thing it exists to catch, and it could not see the case that breaks it:
     the 500 000 term is T01's BOUND, and `tests/state.test.mjs` already asserts that the same
     carrier carrying a LIVE before-snapshot is 4 843 chars OVER it.

     So the closure is now a measurement on a carrier that saturates BOTH halves at once — the study
     layer at every `store.CAPS` line (the same recipe `state.test.mjs`'s carrier uses, asserted
     saturated below rather than assumed) and the game layer at every `CAPS.game` line, with the
     page-label block the shipped `startPage` writes and the FULL before-snapshot `captureJobBefore`
     writes. Measured on this tree:

         study half   505 671 chars   (T01's bound 500 000 — over by 5 671, notes/repair-save.md D)
         addition      40 333 chars   (SAVE_BUDGET_KB.totalAdded 39.7 KB = 40 652.8 — inside it)
         TOTAL        546 004 chars = 533.2 KB against COMPOSED S6's 528 KB — OVER by 5 332

     (round 4 verify read 504 843 / 40 225 / 545 068, OVER by 4 396; round 5 priced `params` — 828 B
     of STUDY bytes on the queue — and `tellOff`, which is where the +828 / +108 came from.)

     THE OVERRUN IS THE SAME 5.3 KB IN BOTH LINES, and it is one thing: the before-snapshot's STUDY
     half (`skills` alone is 3.6 KB of `readiness.skillStates()`) is written by the flat Page route
     too, so it belongs inside T01's bound and does not fit there. It is pinned here in both
     directions — it must still be over (or Request D has been answered and this arm becomes the
     plain `total < S6_BUDGET` assertion), and it may not grow.
     --------------------------------------------------------------------------------------------- */
  describe('COMPOSED S6, measured on a save that saturates BOTH halves', () => {
    const S6_BUDGET = 528 * KB;                   // COMPOSED.md S6, restated at the round-3 save audit
    const T01_STUDY_BOUND = 500_000;              // T01's, asserted in state.test.mjs

    /** `page.startPage`'s own label block — the keys every live page and every live job carries. */
    const PAGE_META = (() => {
      const s0 = fresh(T0 - 40 * DAY_MS);
      s0.settings.testDate = '2026-09-30';
      return startPage(s0, { now: T0 }).meta;
    })();

    const SHEETS = ['ang', 'wp', 'asn', 'qz', 'fac', 'voc', 'not', 'def', 'fact', 'cls', 'doc', 'quad', 'bonus'];

    /**
     * THE WHOLE SAVE AT ITS CAPS. The study half is filled past every `store.CAPS` line and then
     * `applyCaps` cuts it back to them, so the fixture cannot quietly sit under a cap; the game half
     * is `_helpers.mjs`'s worst case, the same one every row of G7's table is measured on.
     */
    function s6Carrier() {
      const s = fresh(T0);
      for (let i = 0; i < 140; i++) {
        s.cards[`${SHEETS[i % SHEETS.length]}-${String(i).padStart(2, '0')}`] = {
          attempts: 12, cleared: true, rarity: 'silver', foil: false,
          foilProgress: Array.from({ length: CAPS.foilProgress + 4 }, (_, k) => ({ day: `2026-09-${String(10 + k).padStart(2, '0')}`, via: 'T-wp-07#a91f2c' })),
          setupTried: true, bucket: 3, lastAt: T0 + i, due: T0 + i * 1000, hintsUsed: 3, solutionShown: false, bestMs: 123456, placed: false,
          work: 'w'.repeat(CAPS.cardWork + 500),
          history: Array.from({ length: CAPS.history + 5 }, (_, k) => ({ at: T0 + k * 100000, ok: k % 2 === 0, attempt: 2, hints: 1, ms: 123456 })),
        };
      }
      for (let i = 0; i < CAPS.runs + 5; i++) {
        s.runs.push({
          kind: 'mock', n: i, seed: 'mock#' + i, startedAt: T0, submittedAt: T0 + 2400000, limitMs: 2400000, tabAway: 3, status: 'done',
          items: Array.from({ length: 20 }, () => ({ id: 'T-wp-07#a91f2c1', skill: 'CS-RATIO', tier: 3, raw: 'x = 3 or x = -1/2 and 174.5', credit: 0.4, ms: 123456, flagged: true, work: 'k'.repeat(CAPS.workChars + 1000) })),
          score: 81, pred: 88, splits: Array.from({ length: 20 }, (_, k) => 12345 + k), flagged: false,
          ...GAME_RUN_FIELDS,
        });
      }
      for (let i = 0; i < CAPS.errors + 50; i++) s.errors.push({ item: 'T-wp-07#a91f2c1', seed: 'a91f2c1', t: T0 + i, got: 'x = 3 or x = -1/2', tags: ['gave-complement', 'stopped-early'], cleared: i % 3 === 0 });
      for (const k of SKILL_IDS) s.skills[k] = { m: 72.123456789, n: 19, lastAt: T0, lastDueCorrectAt: T0, placedAt: T0 };
      for (let i = 0; i < CAPS.frozen + 100; i++) s.frozen['T-wp-07#' + i.toString(16).padStart(6, '0')] = { seed: 'a91f2c' + i, templateVersion: 3, bucket: i % 3, due: T0 + i * 3600000, forCard: 'wp-07' };
      for (let i = 0; i < 60; i++) s.variants['T-tpl-' + i] = { clearsGold: 12, goldDays: ['2026-09-17', '2026-09-18', '2026-09-19'] };
      for (let i = 0; i < CAPS.daily + 60; i++) s.daily[addDays('2026-01-01', i)] = { xp: 612, clears: 14, goalMet: true, mockDone: true };
      for (let i = 0; i < CAPS.forecastLog + 60; i++) s.forecastLog.push({ day: addDays('2026-01-01', i), r: 73 });
      for (let i = 0; i < 40; i++) s.trophies['sheet-gold:AP-' + i] = { at: T0 };
      Object.assign(s.trophies, worstCaseGameTrophies(T0));
      for (let i = 0; i < 30; i++) s.counters['counter-name-' + i] = 1234;
      s.settings.testDate = '2026-09-22'; s.placement = { done: true, at: T0 }; s.jumps = { M10: true, M9: true };
      s.player = worstCasePlayer(T0, JOB_CAPS.game ?? CAPS.game);
      s.game = worstCaseGame(T0, CAPS.game);
      s.inProgress = {
        kind: 'job', seed: 123456789, idx: 7, hearts: 3, xp: 120, startedAt: T0,
        queue: worstCaseJobQueue(T0), game: inProgressJob12(T0, CAPS.game), bench: worstCaseBench(T0),
        meta: { ...PAGE_META, before: worstCaseJobBefore(T0, CAPS.game) },
      };
      return s;
    }

    test('the carrier really is the worst case: every capped line is AT its cap, and both halves are on it', () => {
      const s = applyCaps(s6Carrier());
      assert.equal(s.runs.length, CAPS.runs, 'runs[] is not at its cap');
      assert.equal(s.errors.length, CAPS.errors, 'errors[] is not at its cap');
      assert.equal(Object.keys(s.frozen).length, CAPS.frozen, 'frozen is not at its cap');
      assert.equal(Object.keys(s.daily).length, CAPS.daily, 'daily is not at its cap');
      assert.equal(s.forecastLog.length, CAPS.forecastLog, 'forecastLog is not at its cap');
      for (const rec of Object.values(s.cards)) {
        assert.equal(rec.history.length, CAPS.history, 'a card history is not at its cap');
        assert.equal(rec.work.length, CAPS.cardWork, 'a card work buffer is not at its cap');
      }
      // the GAME half is on it too, and the before-snapshot carries BOTH of its halves
      assert.equal(s.inProgress.game.calls.length ?? 0, s.inProgress.game.calls.length, 'the job state is missing');
      assert.deepEqual(Object.keys(s.inProgress.meta.before).filter((k) => GAME_META_FIELDS.includes(k)).sort(),
        [...GAME_META_FIELDS].sort(), 'the before-snapshot is missing its game fields');
      for (const k of ['skills', 'readiness', 'xp', 'coverage', 'tiles']) {
        assert.ok(k in s.inProgress.meta.before, `the before-snapshot is missing the flat Page's own ${k}`);
      }
      assert.ok(Object.keys(s.inProgress.meta).length > GAME_META_FIELDS.length,
        'the page-label block startPage writes is not on the carrier');
    });

    test('S6 CLOSES, OR IT DOES NOT: the measured total against 528 KB', () => {
      const s = applyCaps(s6Carrier());
      const total = JSON.stringify(pack(s)).length;
      const study = JSON.stringify(pack(withoutGameKeys(s))).length;
      const added = total - study;
      const over = total - S6_BUDGET;
      console.log(`  COMPOSED S6, measured: ${(total / KB).toFixed(1)} KB total = ${(study / KB).toFixed(1)} KB study `
        + `+ ${(added / KB).toFixed(1)} KB addition, against ${S6_BUDGET / KB} KB `
        + `(${over > 0 ? `OVER by ${over} chars` : `${-over} chars to spare`}); study half vs T01's ${T01_STUDY_BOUND}: `
        + `${study - T01_STUDY_BOUND > 0 ? `over by ${study - T01_STUDY_BOUND}` : `${T01_STUDY_BOUND - study} to spare`}`);

      /* …and the OTHER quantity, printed beside it and labelled, because G7 published the two as one
         sentence for two rounds and cited this file as printing a closure it has never printed
         (round-5 verify, spec-fidelity + save-budget). One is a measurement on a carrier; this one
         is arithmetic on two published BOUNDS and nothing is measured in it at all. */
      const bounds = T01_STUDY_BOUND + SAVE_BUDGET_KB.totalAdded * KB;
      console.log(`  the two BOUNDS (arithmetic, NOT a measurement): T01's ${T01_STUDY_BOUND} + G7's `
        + `${SAVE_BUDGET_KB.totalAdded} KB = ${bounds} B of COMPOSED S6's ${S6_BUDGET} B — `
        + `${(S6_BUDGET - bounds).toFixed(1)} B to spare`);

      // the identity: the two halves are measured on ONE save, and they are the whole of it
      assert.equal(study + added, total, 'the split does not account for every byte of the save');
      // the ADDITION is inside the figure G7 publishes — that half of the budget holds
      assert.ok(added <= SAVE_BUDGET_KB.totalAdded * KB,
        `the game layer adds ${(added / KB).toFixed(2)} KB against the published ${SAVE_BUDGET_KB.totalAdded} KB`);

      /* THE RATCHET. The overrun is the before-snapshot's study half (notes/repair-save.md Request
         D); until that is ruled on, S6's 528 KB is not a bound on the worst case and this file says
         so with the measurement rather than closing on three constants. */
      assert.ok(over > 0,
        `the measured worst case is ${(total / KB).toFixed(1)} KB and now FITS COMPOSED S6's ${S6_BUDGET / KB} KB `
        + `with ${-over} chars to spare — Request D has been answered: replace this ratchet with `
        + '`assert.ok(total < S6_BUDGET)` and restate the figure in notes/repair-tests.md');
      assert.ok(over <= 8 * KB,
        `the measured worst case is ${over} chars over COMPOSED S6's ${S6_BUDGET / KB} KB, against the 5 332 measured at `
        + 'round-5 verification (4 396 at round 2; +828 B when `params` was priced, +108 B for `tellOff` and the '
        + 'bench\'s copy of `params`) — the overrun is growing and nothing has ruled on it yet');
      assert.ok(study > T01_STUDY_BOUND,
        `the study half is ${study} against T01's ${T01_STUDY_BOUND} and now fits — fold the snapshot into the `
        + 'carrier, answer Request D, and rewrite both halves of this arm');
      /* …and the old arithmetic is kept as what it was: a statement about two BOUNDS, which closes
         only because the study term is a bound the live carrier exceeds. */
      assert.ok(T01_STUDY_BOUND + SAVE_BUDGET_KB.totalAdded * KB < S6_BUDGET,
        'the two published bounds no longer sum to under S6 — restate COMPOSED.md S6');
      assert.ok(total > T01_STUDY_BOUND + SAVE_BUDGET_KB.totalAdded * KB,
        'the measured total is now under the sum of the two bounds — the constant-only closure would be sound again');
    });
  });

  test('every line of G7\'s budget table is AT OR UNDER its stated figure', () => {
    const s = applyCaps(carrier());
    const p = pack(s);
    const kb = (x) => JSON.stringify(x).length / KB;
    /* These used to be asserted as `< 2 × the stated figure` — a hardcoded constant checked against
       twice another hardcoded constant, which could not fail unless a line MORE THAN DOUBLED, and
       did not fail while `inProgress.game` sat at 3.50 KB against a published 2.1 KB. Every figure in
       `SAVE_BUDGET_KB` is now the measured byte count rounded UP to 0.1 KB, so each line is a real
       ceiling and the slack it carries is at most 100 B. A line that grows past its figure is a
       budget change: re-measure, restate the constant AND G7's table row, and say so in the note. */
    /* ROUND 3 — `inProgress.queue` and `trophies` are DELTA rows, like `runs[]`: both halves of the
       split write the key, and only the fields the game layer adds to it are the layer's cost. They
       are here because they were in no row at all: 2.0 KB of queue fields and 199 B of trophies were
       charged to the study half by `withoutGameKeys` and counted in neither measurement. */
    const lines = [
      ['player', kb(p.player), SAVE_BUDGET_KB.player],
      ['game', kb(p.game), SAVE_BUDGET_KB.game],
      ['inProgress.game', kb(p.inProgress.game), SAVE_BUDGET_KB.inProgress],
      ['inProgress.bench', kb(p.inProgress.bench), SAVE_BUDGET_KB.bench],
      ['inProgress.queue delta', deltaOn(s, (x) => x.inProgress.queue) / KB, SAVE_BUDGET_KB.queueDelta],
      /* ROUND 4 — the third DELTA row, and the third time the split stopped one level short of the
         writers: `inProgress.meta.before` is written by both paths, and the seven fields
         `captureJobBefore` adds to it were charged to the STUDY half and priced nowhere. */
      ['inProgress.meta delta', deltaOn(s, (x) => x.inProgress.meta) / KB, SAVE_BUDGET_KB.metaDelta],
      ['trophies delta', deltaOn(s, (x) => x.trophies) / KB, SAVE_BUDGET_KB.trophies],
      ['runs[] delta', (JSON.stringify(pack(s).runs).length - JSON.stringify(pack(withoutGameKeys(s)).runs).length) / KB, SAVE_BUDGET_KB.runsDelta],
    ];
    for (const [name, got, stated] of lines) console.log(`  ${name.padEnd(22)} ${got.toFixed(2)} KB of ${stated} KB (${((stated - got) * KB).toFixed(0)} B slack)`);
    for (const [name, got, stated] of lines) {
      assert.ok(typeof stated === 'number', `SAVE_BUDGET_KB has no row for "${name}" — every measured line needs a published ceiling`);
      assert.ok(got <= stated, `${name} is ${got.toFixed(2)} KB, over G7's stated ${stated} KB — restate the line, do not widen the assertion`);
    }
    /* The line ceilings must SUM to `totalAdded` — otherwise a line could be restated upward
       while the headline stayed put, which is how the published figure came adrift in the first
       place. Floating-point addition of 0.1-KB steps needs the epsilon. */
    const sumOfLines = lines.reduce((a, [, , stated]) => a + stated, 0);
    assert.ok(Math.abs(sumOfLines - SAVE_BUDGET_KB.totalAdded) < 0.05,
      `G7's line ceilings sum to ${sumOfLines.toFixed(1)} KB but the headline says ${SAVE_BUDGET_KB.totalAdded} KB`);
    /* the SUBTOTAL is every line but the reserved `runs[]` one — what the layer costs TODAY. It is
       derived from `lines` rather than re-listed, so a row added above can never be left out of it
       (which is how `inProgress.queue` and `trophies` stayed invisible for three rounds). */
    const subtotal = lines.filter(([n]) => n !== 'runs[] delta').reduce((a, [, got]) => a + got, 0);
    console.log(`  ${'subtotal'.padEnd(22)} ${subtotal.toFixed(2)} KB of ${SAVE_BUDGET_KB.subtotal} KB (${((SAVE_BUDGET_KB.subtotal - subtotal) * KB).toFixed(0)} B slack)`);
    assert.ok(subtotal <= SAVE_BUDGET_KB.subtotal, `subtotal ${subtotal.toFixed(2)} KB > ${SAVE_BUDGET_KB.subtotal} KB`);
    /* `subtotal` is the measurement rounded up, not the sum of the other ceilings (each of which
       carries its own ≤ 100 B rounding), so it must sit between the two: at or above what the
       layer costs today, and at or below the headline minus the one reserved line. */
    assert.ok(SAVE_BUDGET_KB.subtotal <= SAVE_BUDGET_KB.totalAdded - SAVE_BUDGET_KB.runsDelta + 1e-9,
      `SAVE_BUDGET_KB.subtotal (${SAVE_BUDGET_KB.subtotal}) exceeds the headline minus the reserved runs[] line`);
  });

  test('THE RESERVED LINE IS STILL RESERVED — no shipped path writes the seven runs[] game fields', () => {
    /* G7's budget table prices `runs[] +{bagged, posted, ratingDelta, guard, cracked, tGame,
       tAnswer}` × 40 at 5.4 KB, a sixth of the ≤ 31.6 KB bound. `GAME_RUN_FIELDS` in
       tests/_helpers.mjs is a literal standing in for records the app does not produce, so the
       measured `runs` delta is that literal minus the same literal deleted. Whether that is a
       reserved ceiling or a dead line is a product question, but it must not be answerable only by
       reading a comment: this is the grep, machine-checked (ticket fix:tests r1).

       Two acceptable resolutions, and the suite should fail when either lands:
         (a) a shipped path starts writing those fields onto a run record — then this test goes red
             and the budget is re-measured off a REAL completed job instead of off GAME_RUN_FIELDS;
         (b) a job is deliberately not a run — then the `runs[]` row comes out of G7's table, the
             bound is restated at the subtotal, and `GAME_RUN_FIELDS` is deleted with it.

       ROUND 2 — WHAT THIS TEST ASSERTS, AND WHAT IT DELIBERATELY DOES NOT.
       The budget line depends on ONE fact: are the seven fields written? It does NOT depend on
       whether a job pushes a `runs[]` record at all — a record without them costs the study layer's
       bytes, not the game layer's, so it changes nothing here. The round-1 version of this test also
       asserted `screens/job.js` contains no `pushRun(`, which conflates the two: it is the tripwire
       for notes/save-fix.md's finding 7, and `tests/job-ledger.test.mjs` owns that claim. It is
       reported below, not asserted, so a job that starts recording itself does not red-line the save
       suite for a budget that did not move.

       And the scan is COMMENT-STRIPPED. The raw-source version went red the moment `screens/run.js`
       gained a doc comment saying the seven fields are *deliberately not* written — a prose mention
       of a field is not a write, which is exactly what `stripCommentsAndStrings` exists for. */
    const writesAny = listFiles(join(ROOT, 'site'), /\.m?js$/)
      .map((f) => [f.replace(ROOT + '/', ''), stripCommentsAndStrings(readFileSync(f, 'utf8'))])
      .filter(([, src]) => /\bratingDelta\b/.test(src))
      .map(([rel]) => rel);
    assert.deepEqual(writesAny, [],
      `ratingDelta is now WRITTEN under site/ (${writesAny.join(', ')}) — the reserved runs[] line has become real: re-measure it off a real completed job, fold SAVE_BUDGET_KB.subtotal into totalAdded and drop the "reserved" note from G7`);

    // reported, not asserted — see above. `job-ledger.test.mjs` owns the trophy/forecast claim.
    const jobScreen = stripCommentsAndStrings(readFileSync(join(ROOT, 'site/js/screens/job.js'), 'utf8'));
    const pushes = /\bpushRun\s*\(|\bpushJobRun\s*\(/.test(jobScreen);
    console.log(`  a finished job pushes a runs[] record: ${pushes ? 'YES (it costs study bytes, not game bytes — budget unchanged)' : 'no — notes/save-fix.md finding 7 is still open'}`);
  });

  test('a save with the layer never used costs almost nothing (the empty defaults)', () => {
    const s = fresh(T0);
    const added = JSON.stringify(pack(s)).length - JSON.stringify(pack(withoutGameKeys(s))).length;
    console.log(`  an untouched game layer costs ${added} B`);
    assert.ok(added < 600, `${added} B for two empty keys`);
  });

  /* ----------------------------------------------------------------------------------------------
     ROUND 3, FINDING 55 — THE SCOPE OF THE BOUND, MEASURED.
     `game` is an ARCHIVED key, so a unit handoff files a whole saturated copy of the layer under
     `save.archive[<old unit>]` and resets the live one. That copy sits in BOTH halves of the split
     (`archive` is a kept key and nothing inside it is stripped), so it cancels: `addedBy()` reports
     the same number with a 27 KB archived unit underneath it as without one. Nothing was wrong with
     the arithmetic — the archive HAS to cancel, or the split would charge an archived unit's ~227 KB
     of study cards to the layer — but the published figure was a bound on LIVE keys per unit while
     the document read as a bound on the layer's whole footprint. Both facts are now asserted here,
     and the per-unit scope is stated in G7 (notes/repair-save.md § Spec corrections).
     ---------------------------------------------------------------------------------------------- */
  test('the bound is per-unit and LIVE: an archived unit carries a second copy the split cannot see', () => {
    const U1B = Object.freeze({ id: 'u1b', skills: ['VOC', 'NOTE', 'FAC2'] });
    const live = applyCaps(carrier());
    const handed = archiveUnit(structuredClone(live), U1B, T0 + 30 * DAY_MS);

    // 1. the handoff really happened, on a SATURATED carrier — not on an empty `game`
    assert.equal(handed.unitId, 'u1b');
    assert.deepEqual(handed.game, SAVE_DEFAULTS.game, 'the live game key must be reset by the handoff');
    assert.equal(Object.keys(handed.archive['u1a'].game.tags).length, CAPS.game.tags, 'the archived copy is not saturated — this test would measure nothing');

    // 2. the second copy, priced by the same attribution rule the split uses
    const archived = archivedGameBytes(handed);
    const archivedToday = archivedGameBytes(archiveUnit(structuredClone(applyCaps(carrier({ runFields: false }))), U1B, T0 + 30 * DAY_MS));
    const liveAdded = addedBy(live);
    console.log(`  after ONE handoff: live ${addedBy(handed)} B · archived copy ${archived} B = ${(archived / KB).toFixed(2)} KB (${(archivedToday / KB).toFixed(2)} KB without the reserved runs[] fields) · a re-saturated unit on top of it = ${((archived + liveAdded) / KB).toFixed(2)} KB of game bytes on disk`);
    assert.ok(archived > 20 * KB, `the archived copy measures ${archived} B — this assertion is meant to be measuring a saturated unit`);
    /* The ceiling, derived from G7's own rows rather than invented: `player` and `trophies` are KEPT
       keys, so they are the two lines of the table an archive entry can never hold; every other line
       is archived with the unit. An archived copy that exceeds that is a line nobody priced. */
    const archiveCeiling = (SAVE_BUDGET_KB.totalAdded - SAVE_BUDGET_KB.player - SAVE_BUDGET_KB.trophies) * KB;
    assert.ok(archived <= archiveCeiling,
      `an archived unit carries ${(archived / KB).toFixed(2)} KB of game bytes against a ceiling of ${(archiveCeiling / KB).toFixed(2)} KB (totalAdded − player − trophies, the two KEPT lines) — re-measure G7's archive note before shipping this`);

    // 3. THE BLIND SPOT ITSELF: the split reports the same addition with the archive and without it
    const withoutArchive = { ...structuredClone(handed), archive: {} };
    assert.equal(addedBy(handed), addedBy(withoutArchive),
      'the archived copy no longer cancels in the split — addedBy() has become a statement about the archive too, and every per-line figure in G7 would have to be re-measured');
    assert.ok(addedBy(handed) < SAVE_BUDGET_KB.totalAdded * KB,
      'a handed-off save has an empty live game key; its addition cannot exceed the bound');

    // 4. and the number the document may claim: LIVE keys, per unit, one archived copy each
    const units = Object.keys(handed.archive).length;
    assert.ok(liveAdded + archived <= (1 + units) * SAVE_BUDGET_KB.totalAdded * KB,
      `one unit live (${(liveAdded / KB).toFixed(2)} KB) plus ${units} archived (${(archived / KB).toFixed(2)} KB) exceeds ${1 + units} × the per-unit bound`);
  });
});

/* ================================================================================================
   7. Killing the tab mid-job
   ================================================================================================ */
describe('J10 — mid-job reload restores the job exactly', () => {
  /** The eight things the acceptance names, each read from the key that actually owns it. */
  const RESTORED = Object.freeze([
    ['loose', s => s.inProgress.game.loose],
    ['bagged', s => s.inProgress.game.bagged],
    ['chain', s => s.inProgress.game.chain],
    ['calls', s => s.inProgress.game.calls],
    ['guard', s => s.inProgress.game.guard],
    ['tokens', s => s.inProgress.game.tokens],
    ['crew', s => s.game.crew],                       // crew lives in save.game — it outlives the job
    ['idx', s => s.inProgress.idx],                   // idx lives on the existing page record
  ]);

  function liveJobSave() {
    const s = migrate(v1Save(), T0);
    s.game = worstCaseGame(T0, CAPS.game);
    s.player = worstCasePlayer(T0, CAPS.game);
    s.inProgress = {
      kind: 'job', seed: 12345, idx: 7, hearts: 3, xp: 120, startedAt: T0,
      queue: Array.from({ length: 12 }, (_, k) => ({ id: `T-cs-ratio-0${k}#a91f2c`, kind: 'variant', seed: 'a91f2c' + k, forCard: 'wp-07' })),
      game: inProgressJob12(T0, CAPS.game),
    };
    return s;
  }

  test('loose / bagged / chain / calls / guard / tokens / crew / idx all come back exactly', () => {
    const before = liveJobSave();
    const st = fakeStorage({ [SAVE_KEY]: JSON.stringify(pack(before)) });
    const after = createStore({ storage: st, now: () => T0 + 5000, unit: null }).load();   // a NEW tab
    for (const [label, read] of RESTORED) assert.deepEqual(read(after), read(before), `${label} did not survive the reload`);
    assert.deepEqual(after.inProgress.queue, before.inProgress.queue, 'and the queue itself');
    assert.deepEqual(after.inProgress.game, before.inProgress.game, 'the whole inProgress.game record is byte-identical');
  });

  test('every key G7 lists on inProgress.game is present after the reload', () => {
    const before = liveJobSave();
    const st = fakeStorage({ [SAVE_KEY]: JSON.stringify(pack(before)) });
    const after = createStore({ storage: st, now: () => T0, unit: null }).load();
    // G7's sixteen AND `js/job/state.js`'s EXTRA_KEYS — i.e. every key the shipped serialiser emits,
    // read from STATE_KEYS rather than re-typed, so a key added there cannot go untested here.
    for (const k of STATE_KEYS) assert.ok(k in after.inProgress.game, `inProgress.game.${k} was dropped`);
  });

  test('a tab hidden mid-job flushes the job to disk (visibilitychange), and it reloads', () => {
    const st = fakeStorage(); const doc = fakeDoc();
    const store = createStore({ storage: st, now: () => T0, doc, debounceMs: 100_000, unit: null });
    store.load();
    store.update(s => { s.inProgress = liveJobSave().inProgress; s.game.crew = { FAC2: 2 }; });   // debounced — NOT on disk yet
    assert.equal(JSON.parse(st.map.get(SAVE_KEY)).inProgress, null, 'the debounce is real');
    doc.visibilityState = 'hidden'; doc.fire('visibilitychange');
    const after = createStore({ storage: st, now: () => T0, unit: null }).load();
    const fx = inProgressJob12(T0, CAPS.game);                       // read from the fixture, not re-typed
    assert.equal(after.inProgress.game.chain, fx.chain);
    assert.equal(after.inProgress.game.loose, fx.loose);
    assert.equal(after.inProgress.game.rating0, fx.rating0, 'an un-rounded rating survives the disk verbatim');
    assert.deepEqual(after.game.crew, { FAC2: 2 });
  });

  test('THE PINNED SEED: re-opening cannot re-roll the guard, the bundles or the ×2 (G3.7 proof 6)', () => {
    // guard.js (J3) and board.js (J5) do not exist yet, so the three draws are modelled here with
    // the SAME primitive the whole layer is required to use — `rng.js`'s seeded generators. What is
    // under test is the save layer's half of the proof: the seed is pinned at job start, survives
    // the disk verbatim, and therefore reproduces every draw made from it.
    const WINGS = [...WING_IDS];
    const drawGuard = (seed) => rngFrom('guard', seed).weighted(WINGS, [32, 26, 23, 19]);
    const drawBundles = (seed, ids) => rngFrom('bundles', seed).shuffle([...ids]);
    const drawX2 = (seed, n) => Array.from({ length: n }, (_, i) => rngFrom('x2', seed, i).chance(1 / 6));

    const before = liveJobSave();
    const seedBefore = before.inProgress.game.seed;
    const locks = before.inProgress.game.bundles[0].locks;

    const st = fakeStorage({ [SAVE_KEY]: JSON.stringify(pack(before)) });
    const after = createStore({ storage: st, now: () => T0 + 60000, unit: null }).load();
    const seedAfter = after.inProgress.game.seed;

    assert.equal(seedAfter, seedBefore, 'the job seed must survive the disk verbatim');
    assert.equal(drawGuard(seedAfter), drawGuard(seedBefore), 'the guard was re-rolled');
    assert.deepEqual(drawBundles(seedAfter, locks), drawBundles(seedBefore, locks), 'the bundle partition was re-rolled');
    assert.deepEqual(drawX2(seedAfter, 12), drawX2(seedBefore, 12), 'the ×2 placement was re-rolled');

    // …and the test is not vacuous: a DIFFERENT seed does move all three.
    const other = seedBefore + '#quit-scum';
    assert.notDeepEqual(drawBundles(other, locks), drawBundles(seedBefore, locks), 'a different seed must draw differently');
    assert.notDeepEqual(drawX2(other, 12), drawX2(seedBefore, 12));

    // Reloading ten times must not drift the seed by one character.
    let s = after;
    for (let i = 0; i < 10; i++) s = createStore({ storage: fakeStorage({ [SAVE_KEY]: JSON.stringify(pack(s)) }), now: () => T0, unit: null }).load();
    assert.equal(s.inProgress.game.seed, seedBefore, 'the seed drifted across repeated reloads');
  });

  test('an export/import of a live job carries the job across devices unchanged', () => {
    const st = fakeStorage({ [SAVE_KEY]: JSON.stringify(pack(liveJobSave())) });
    const a = createStore({ storage: st, now: () => T0, unit: null }); a.load();
    const b = createStore({ storage: fakeStorage(), now: () => T0, unit: null }); b.load();
    b.importJSON(a.exportJSON());
    assert.deepEqual(b.getState().inProgress.game, a.getState().inProgress.game);
    assert.deepEqual(b.getState().player, a.getState().player);
    assert.deepEqual(b.getState().game, a.getState().game);
  });
});

/* ================================================================================================
   8. The unit handoff, through the REAL archiveUnit
   ================================================================================================ */
describe('J10 — the unit handoff (a stub Unit-1B data set, the real archiveUnit)', () => {
  // Deliberately a literal, like T19's: the point is that store.js needs nothing from the next unit
  // but its id and its skill-id list.
  const U1B = Object.freeze({ id: 'u1b', skills: ['VOC', 'NOTE', 'FAC2', 'TRI-CONG', 'PROOF'] });
  const NOW1 = T0 + 30 * 86400000;

  function playedSave() {
    const s = migrate(v1Save(), T0);
    s.player = worstCasePlayer(T0, CAPS.game);
    s.game = worstCaseGame(T0, CAPS.game);
    s.inProgress = { kind: 'job', seed: 12345, idx: 7, queue: [], game: inProgressJob12(T0, CAPS.game) };
    return s;
  }

  test('`game` is archived byte-identical under the old unit and reset live; `player` never moves', () => {
    const before = playedSave();
    const snapshot = structuredClone(before);
    const after = migrate(before, NOW1, { unit: U1B });

    assert.equal(after.unitId, 'u1b');
    assert.deepEqual(after.archive['u1a'].game, snapshot.game, 'archive[u1a].game must be the old game key, whole');
    assert.deepEqual(after.game, SAVE_DEFAULTS.game, 'the live game key starts empty under the new unit');
    assert.deepEqual(after.player, snapshot.player, 'player measures the STUDENT — it survives the swap untouched');
    assert.equal(after.player.rating.calls.length, CAPS.game.calls, 'including the whole 50-call window');
    assert.deepEqual(after.archive['u1a'].inProgress, snapshot.inProgress, 'a half-finished 1A job is archived, not deleted');
    assert.equal(after.inProgress, null, 'and cannot resume under 1B');
  });

  test('called directly, archiveUnit does the same thing and is idempotent', () => {
    const s = archiveUnit(playedSave(), U1B, NOW1);
    const once = structuredClone(s);
    archiveUnit(s, U1B, NOW1 + 1);
    assert.deepEqual(s, once, 'archiving into the unit you are already in is a no-op');
    assert.ok('game' in s.archive['u1a'], 'game is in the archive entry');
    assert.equal('player' in s.archive['u1a'], false, 'player is NOT archived — it is a kept key');
  });

  test('the 68 tags and the crew are still readable in the archive after the swap', () => {
    const after = migrate(playedSave(), NOW1, { unit: U1B });
    assert.equal(Object.keys(after.archive['u1a'].game.tags).length, CAPS.game.tags);
    assert.equal(Object.keys(after.archive['u1a'].game.crew).length, 12, 'nothing is deleted — the archive is part of the exported JSON');
  });

  /**
   * The assertion above used to be a TAUTOLOGY and the loss it names was unreachable from inside this
   * build: every make in `_helpers.mjs`'s crew fixture is in THIS build's `SKILL_IDS`, so
   * `normalizeGame`'s crew filter (which runs inside `migrate`, BEFORE `archiveUnit` copies `game`)
   * had nothing to delete. Under the NEXT unit's build it would have had plenty — `SKILL_IDS` is then
   * 1B's list, and a 1A crew rank on a make 1B does not reuse was erased on the way into the archive.
   * This test reproduces that by manning makes that are demonstrably NOT in this build's list, which
   * is the only shape in which the claim at store.js's ARCHIVED_KEYS comment can fail.
   */
  test('crew ranks on makes THIS build does not know survive into the archive (the claim, made falsifiable)', () => {
    const FOREIGN = Object.freeze(['TRI-CONG', 'PROOF', 'ANG-SUM']);        // two of them are 1B makes
    for (const m of FOREIGN) assert.equal(SKILL_IDS.includes(m), false, `${m} must be foreign to this build, or this test is vacuous again`);

    const s = playedSave();
    s.game.crew = { VOC: 2, FAC2: 1, 'TRI-CONG': 2, PROOF: 1, 'ANG-SUM': 2 };
    const before = structuredClone(s.game.crew);
    const after = migrate(s, NOW1, { unit: U1B });

    assert.deepEqual(after.archive['u1a'].game.crew, before,
      'the archive is the export — a crew rank the next unit does not reuse must be readable there, not deleted');
    assert.deepEqual(after.game.crew, {}, 'and the LIVE crew starts empty under the new unit, so nothing foreign is spendable');
  });

  test('a save opened under the SAME unit still has its crew cleaned (the filter is only skipped at a handoff)', () => {
    const s = playedSave();
    s.game.crew = { VOC: 2, 'TRI-CONG': 2, 'NOT-A-MAKE': 1 };
    const same = migrate(s, NOW1, { unit: { id: 'u1a', skills: SKILL_IDS } });
    assert.deepEqual(same.game.crew, { VOC: 2 }, 'a stale make must not survive a load into play');
    assert.deepEqual(migrate(playedSave(), NOW1).game.crew, worstCaseGame(T0, CAPS.game).crew, 'and migrate() with no unit is unchanged');
  });

  test('a stored 1A save with a live job hands off on the next open and persists', () => {
    const st = fakeStorage({ [SAVE_KEY]: JSON.stringify(pack(playedSave())) });
    const store = createStore({ storage: st, now: () => NOW1, unit: U1B });
    const s = store.load();
    assert.equal(s.unitId, 'u1b');
    assert.equal(store.flags.archivedUnit, 'u1a');
    const onDisk = JSON.parse(st.map.get(SAVE_KEY));
    assert.deepEqual(onDisk.game, SAVE_DEFAULTS.game);
    assert.equal(onDisk.player.rank, worstCasePlayer(T0, CAPS.game).rank, 'the kept key was written back, not dropped');
    assert.equal(Object.keys(onDisk.archive['u1a'].game.tags).length, CAPS.game.tags);
  });
});

/* ================================================================================================
   9. Offline — airplane mode after one load runs a full job
   ================================================================================================ */
describe('J10 — the precache list covers the game layer', () => {
  const PRECACHE = readList(readFileSync(join(SITE, 'sw.js'), 'utf8'));
  const listed = new Set(PRECACHE);
  const rel = (abs) => abs.slice(SITE.length + 1).split('\\').join('/');

  test('every file of the game layer is precached (js/job/*, data/job.js, and the job screen + css)', () => {
    const jobFiles = [
      ...listFiles(join(SITE, 'js', 'job'), /\.js$/).map(rel),
      ...['data/job.js', 'js/screens/job.js', 'css/job.css'].filter(p => existsSync(join(SITE, p))),
    ];
    assert.ok(jobFiles.includes('js/job/econ.js'), 'js/job/econ.js must exist by J10 (J1 shipped it)');
    assert.ok(jobFiles.includes('data/job.js'));
    const missing = jobFiles.filter(p => !listed.has(p));
    assert.deepEqual(missing, [], `the job layer would 404 in airplane mode: ${missing.join(', ')} — run: node qa/gen-precache.mjs`);
  });

  test('no module reachable from the app entry is missing from the cache (the offline closure)', () => {
    // Walk every static `from '…'` / bare `import '…'` and every dynamic `import('…')` from js/app.js
    // outward. A path that resolves to a file NOT in PRECACHE is a screen that works online and dies
    // in airplane mode; a path that resolves to nothing is a broken import. Both fail here.
    const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
    const SPECIFIERS = [/\bfrom\s*['"]([^'"]+)['"]/g, /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, /^\s*import\s+['"]([^'"]+)['"]/gm];

    const seen = new Set(), missing = [], broken = [];
    const walk = (relPath) => {
      if (seen.has(relPath)) return;
      seen.add(relPath);
      const abs = join(SITE, relPath);
      if (!existsSync(abs) || !statSync(abs).isFile()) { broken.push(relPath); return; }
      if (!listed.has(relPath)) missing.push(relPath);
      const src = strip(readFileSync(abs, 'utf8'));
      for (const re of SPECIFIERS) {
        for (const m of src.matchAll(re)) {
          const spec = m[1];
          if (!spec.startsWith('.')) continue;                       // no bare specifiers in this app
          walk(posix.normalize(posix.join(posix.dirname(relPath), spec)));
        }
      }
    };
    walk('js/app.js');

    assert.deepEqual(broken, [], `imported but not on disk: ${broken.join(', ')}`);
    assert.deepEqual(missing, [], `reachable from js/app.js but NOT precached: ${missing.join(', ')} — run: node qa/gen-precache.mjs`);
    // non-vacuous: the walk must actually have reached the deep screens, not stopped at app.js
    for (const p of ['js/store.js', 'js/screens/card.js', 'js/screens/run.js', 'js/page.js']) {
      assert.ok(seen.has(p), `the import walk never reached ${p} — the closure test is vacuous`);
    }
    console.log(`  offline closure: ${seen.size} modules reachable from js/app.js, all precached`);
  });

  test('a full job boots against the DEFAULTS this ticket ships — no key a job reads is missing', () => {
    // The shape a job needs on turn one, per G7. Later tickets fill these; today they must exist and
    // be of the right type, or `screens/job.js` would have to defend against undefined on every read.
    const s = fresh(T0);
    const reads = [
      [s.player.rating.calls, 'array'], [s.player.rating.value, 'number'], [s.player.rank, 'number'],
      [s.player.elo.player, 'number'], [s.player.elo.house, 'number'], [s.player.records.bestChain, 'number'],
      [s.game.crew, 'object'], [s.game.tags, 'object'], [s.game.log, 'array'],
      [s.game.heat.press.RECALL, 'number'], [s.game.heat.weight, 'number'], [s.game.heat.jobs, 'number'],
      [s.game.backchecks.held, 'number'], [s.game.ledger.jobs, 'number'], [s.game.ledger.phaseMeans.board, 'number'],
      [s.game.commit.honored, 'number'], [s.game.commit.bound, 'boolean'],
    ];
    for (const [v, kind] of reads) {
      if (kind === 'array') assert.ok(Array.isArray(v));
      else if (kind === 'object') assert.ok(v && typeof v === 'object' && !Array.isArray(v));
      else assert.equal(typeof v, kind);
    }
    assert.equal(s.game.backchecks.mintedDay, null, 'a fresh save has minted nothing');
    assert.equal(s.game.commit.kind, null);
    assert.deepEqual(Object.keys(s.game.ledger.phaseMeans).sort(), ['board', 'brief', 'debrief', 'getaway', 'guard'],
      'the job-1 split projection falls back to these five phase means');
  });
});
