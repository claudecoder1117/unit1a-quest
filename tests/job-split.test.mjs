// tests/job-split.test.mjs — J8: THE SPLIT MEASUREMENT.
//
// COMPOSED-GAME G1 "The split, measured against the engine's own time model — two honest columns",
// G9 #1, G10 #17. The three statements this file is the evidence for:
//
//   1. "The split is a function of tier mix AND of how much of the optional decision surface you
//      use, and the board prints your own number, not the brochure's."
//   2. "Both numbers are measured, not claimed" — two wall-clock accumulators, and the split the
//      board printed BEFORE the job agrees with the split the debrief printed after it.
//   3. "The claim this document defends is the range, the density and the measurement — not a
//      number." **There is no constant-ratio claim in this product**, and §6 of this file proves no
//      test in the suite smuggles one in.
//
// WHAT IS RECOMPUTED AND WHAT IS READ (the ticket's own rule: "recomputes the WHOLE G1 shape table
// from data/job.js's constants rather than reading the printed numerals, so a constant that moves
// moves the table"). §1 rebuilds every cell of G1's shape table from `LOOT`-adjacent primitives —
// `ANSWER_MINUTES_PER_TIER`, `DECISION_SECONDS`, `FIXED_PHASES`, `SHAPES[*].tierMix/briefs/fixed` —
// with arithmetic that takes those constants as PARAMETERS, so §1.2 can perturb one and watch the
// table move. G1's printed numerals live in `data/job.js PUBLISHED.shapeTable`; they are the thing
// compared TO, never the thing computed from.
//
// THE WALKTHROUGHS (§2) drive the real machine (`js/job/state.js`) over a real board
// (`js/job/board.js`) with a scripted clock, spending exactly the seconds G1's fixed-phase table
// publishes for the path being walked. Nothing is stubbed: `tGame`/`tAnswer` are banked by
// `setPhase` from the `now` each call is given, the way the screen banks them from `Date.now()`.
//
// ONE MEASUREMENT GAP, MEASURED RATHER THAN PAPERED OVER (notes/J8.md §1 and §5.8, and the Requests
// there): the machine sets `phase = 'debrief'` inside `endJob` and the record is gone one line later,
// so the 65 s G1 credits to reading the debrief is the one phase the job cannot measure about itself.
// Both bases are therefore carried through this whole file, BOTH ARE PRINTED on the debrief line, and
// every agreement assertion compares LIKE WITH LIKE:
//   · `measured`  — `tGame / (tGame + tAnswer)` as `state.debriefOf` returns it, and the debrief's
//                   HEADLINE. What `save.game.log[]` stores, and what the board's ledger projection
//                   reads back — so those two are the same quantity and agree to a fraction of a point.
//   · `session`   — the same with the debrief read credited from the student's own rolling
//                   `game.ledger.phaseMeans.debrief`, printed beside the headline as `43 % with this
//                   screen`. What G1's published table counts, and what the board's job-1 fallback
//                   projects.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import * as state from '../site/js/job/state.js';
import {
  startJob, beginTargets, lockCall, applyTarget, push, bag, brief, crack, tick, backcheck,
  canBackcheck, commitBind, resume, stateOf, queueOf, idxOf, targetsLeft, debriefOf,
} from '../site/js/job/state.js';
import { postBoard } from '../site/js/job/board.js';
import { finalWordOf } from '../site/js/screens/job.js';
import { shapeTable, decisionCount, answerSeconds, decisionSeconds, fixedSeconds, round } from '../site/js/job/econ.js';
import { sessionSplit } from '../site/js/screens/run.js';
import {
  SHAPES, SHAPE_IDS, DECISIONS, DECISION_SECONDS, DECISION_PARTS_T1, ANSWER_MINUTES_PER_TIER,
  FIXED_PHASES, PHASE_MEANS_DEFAULT, PHASE_ORDER, GAME_PHASES, ANSWER_PHASES, SPLIT, BOARD,
  PUBLISHED, COPY,
} from '../site/data/job.js';
import { fresh } from '../site/js/store.js';
import { applyOutcome, DAY_MS } from '../site/js/schedule.js';
import { rngFrom } from '../site/js/rng.js';
import { todayISO, addDays } from '../site/js/days.js';
import { cards as ALL_CARDS } from '../site/data/cards.js';
import { isBonus } from '../site/data/source-manifest.js';
import { read, listFiles, stripCommentsAndStrings as strip } from './_helpers.mjs';

const NOW = new Date(2026, 8, 16, 18, 0).getTime();
const TODAY = todayISO(new Date(NOW));
const BANK = ALL_CARDS.filter((c) => !isBonus(c.id));
const clone = (x) => structuredClone(x);
const abs = Math.abs;

/* ================================================================================================
   0. the corpus and the scripted walkthrough
   ================================================================================================ */

/** A save with real Leitner records, real `history` and real skills — no `Math.random` anywhere. */
function seededSave(i) {
  const rng = rngFrom('j8-split-corpus', i);
  const s = fresh(NOW - (4 + rng.int(0, 20)) * DAY_MS);
  s.profileId = `split-${i}`;
  s.settings.testDate = addDays(TODAY, 4 + rng.int(0, 12));
  const n = 30 + rng.int(0, 30);
  for (let k = 0; k < n; k++) {
    const c = BANK[rng.int(0, BANK.length - 1)];
    let rec = null;
    for (let r = 0; r < 3; r++) rec = applyOutcome(s, c.id, rng.chance(0.75) ? 'clean' : 'wrong', { now: NOW - (30 - r * 4) * DAY_MS });
    if (!rec) continue;
    rec.cleared = true;
    rec.rarity = 'gold';
    rec.due = NOW + (rng.chance(0.65) ? -rng.float(0, 9) : rng.float(0.2, 12)) * DAY_MS;
    rec.history = Array.from({ length: 10 }, (_, h) => ({ at: NOW - (20 - h) * DAY_MS, ok: rng.chance(0.75), attempt: 1, hints: 0, ms: 9000 }));
  }
  const SKILLS = ['VOC', 'NOTE', 'CLASS', 'ASN-PLP', 'ASN-ANG', 'PAIRS', 'FIG-ALG', 'BISECT-L', 'BISECT-Q',
    'SEG-ALG', 'CSARITH', 'CS-LIN', 'CS-RATIO', 'CS-QUAD', 'SYS', 'FAC1', 'FAC2', 'QUAD-SOLVE', 'QUAD-CTX'];
  for (const k of SKILLS) {
    if (!rng.chance(0.8)) continue;
    s.skills[k] = { m: rng.int(10, 95), n: rng.int(1, 9), lastAt: NOW - rng.int(1, 20) * DAY_MS, lastDueCorrectAt: null };
  }
  return s;
}
const CORPUS = Array.from({ length: 6 }, (_, i) => seededSave(i));

const CLEAN = { cleared: true, firstTry: true, hints: 0, attempt: 1, clean: true };
const MISS = { cleared: false, solutionShown: true, reason: 'third-wrong', attempt: 3, hints: 0 };

/** G1's fixed-phase column for a shape and a path, per phase. */
function phasesFor(shapeId, path) {
  const cell = FIXED_PHASES[SHAPES[shapeId].fixed][path];
  if (cell.phases) return cell.phases;
  throw new Error(`FIXED_PHASES.${SHAPES[shapeId].fixed}.${path} has no phases — data/job.js owns the allocation`);
}

/* The one cell G1 published as a TOTAL only — `RUN.full` at 130 s — was derived here and is now IN
   `data/job.js` (notes/J1.md open issue 1 → notes/J8.md Request 3, done at integration), so the data
   file is the single source and this file no longer carries a second copy of it. The derivation is
   re-run below as an assertion rather than as a fallback: the growth over the default column goes to
   the two optional surfaces a RUN actually has, in the 37:30 ratio the JOB column grows them in. */
function derivedRunFullPhases() {
  const d = FIXED_PHASES.RUN.default.phases;
  const briefs = SHAPES.RUN.briefs;
  const jobD = FIXED_PHASES.JOB.default.phases;
  const jobF = FIXED_PHASES.JOB.full.phases;
  const grow = FIXED_PHASES.RUN.full.total
    - (d.board + d.guard + d.brief * briefs + d.getaway + d.debrief);
  const wBoard = jobF.board - jobD.board;
  const wBrief = (jobF.brief - jobD.brief) * briefs;
  const board = d.board + Math.round((grow * wBoard) / (wBoard + wBrief));
  const brief = d.brief + Math.round((grow - (board - d.board)) / briefs);
  return { ...d, board, brief };
}

/**
 * ONE scripted job, on the real machine, with a scripted clock.
 *
 * Every `now` handed to the machine is `t0 + Σ(the seconds G1 publishes for this phase and tier)`,
 * so the two accumulators bank exactly the session the fixed-phase table describes. `canon` rewrites
 * the drafted queue's tiers to the shape's own `tierMix`, which is what makes a walkthrough a
 * walkthrough OF A SHAPE rather than of whatever tonight's board happened to hold (§2); the
 * agreement suite (§3) leaves the real queue alone, because the board priced that queue.
 *
 * @returns {{debrief, board, elapsed, split, save, briefs, phases}}
 */
function walkthrough(save0, shapeId, path = 'default', { canon = false, spend = false, seed = null, boardOpts = {}, watch = null } = {}) {
  const save = clone(save0);
  const board = postBoard(save, TODAY, { now: NOW, shape: shapeId, ...boardOpts });
  const FX = phasesFor(shapeId, path);
  /* the one-per-session crew re-allocation, spent in the FIRST window that opens — because that is
     where `state.brief` takes it (`actions.crew` → `crew.allocate`). The column used to charge it to
     a `crew` phase instead, which no `setPhase` in `site/js` ever sets, so the walkthrough could not
     spend it at all and every full-use cell came out 1.2–1.7 points under its published value. */
  const full = path === 'full';
  let t = NOW;
  const step = (secs) => (t += Math.round(secs * 1000));

  startJob(save, { today: TODAY, now: t, board, seed: seed ?? undefined });
  if (canon) {
    const tiers = [];
    for (const [tier, n] of Object.entries(SHAPES[shapeId].tierMix)) for (let i = 0; i < n; i++) tiers.push(+tier);
    queueOf(save).forEach((it, i) => { if (tiers[i]) it.tier = tiers[i]; });
  }
  const queue0 = queueOf(save).map((it) => ({ ...it }));
  if (full) {
    save.game.backchecks = { ...save.game.backchecks, held: DECISIONS.backchecksFull };
    commitBind(save, { kind: 'walk', byMin: 600 }, { now: t });      // the COMMIT verb: at the board (G1)
  }
  /* board read + draft, then the guard reveal and the token press */
  if (watch) watch.add(stateOf(save).phase);          // 'board' — the phase `startJob` opens in
  tick(save, 'guard', step(FX.board));
  if (watch) watch.add(stateOf(save).phase);
  beginTargets(save, { now: step(FX.guard) });

  /* a Backcheck needs a miss that cost something — and a miss queues a Rematch, which lengthens the
     job. G1: "A Backcheck spend is a decision but not a phase", so the SPLIT walkthroughs run clean
     and §5.3 spends them in a walkthrough of its own. */
  const misses = spend ? new Set([3, 6]) : new Set();
  let spent = 0;
  let out = null;
  let ph = null;                 // `g.ph`, snapshotted while there is still a job to read it off
  const took = [];
  for (let stop = 0; stop < 900; stop++) {
    const g = stateOf(save);
    if (watch && g) watch.add(g.phase);               // includes the terminal 'debrief' on the last pass
    if (!g || g.outcome != null) break;
    ph = { ...g.ph };
    if (g.phase === 'envelope') { lockCall(save, 70, { now: step(DECISION_PARTS_T1.call) }); continue; }
    if (g.phase === 'answer') {
      const it = queueOf(save)[idxOf(save)];
      const n = idxOf(save) + 1;
      applyTarget(save, misses.has(n) ? MISS : CLEAN, { now: step(ANSWER_MINUTES_PER_TIER[it.tier] * 60) });
      continue;
    }
    if (g.phase === 'payout' || g.phase === 'bagpush') {
      const it = queueOf(save)[Math.max(0, idxOf(save) - 1)];
      /* the payout line carries the tell, the chain arithmetic and the crew note — the rest of the
         tier's published decision seconds after the 5 s call */
      if (spend && spent < DECISIONS.backchecksFull && canBackcheck(save)) { backcheck(save); spent++; }
      const when = step(DECISION_SECONDS[it.tier] - DECISION_PARTS_T1.call);
      /* the screen calls `endJob` itself on the last target, because `push` ends the job and returns
         a status rather than the debrief (screens/job.js `finish()` / `finalWordOf`). */
      if (targetsLeft(save) === 0) out = state.endJob(save, finalWordOf(save), { now: when, day: TODAY });
      else push(save, { now: when });
      continue;
    }
    if (g.phase === 'brief') {
      const actions = full
        ? { repress: { ...g.tokens }, crew: { make: queueOf(save)[idxOf(save)]?.skill ?? 'VOC', rank: 1 }, tell: true, commit: { kind: 'walk', byMin: 600 } }
        : {};
      const r = brief(save, actions, { now: step(FX.brief) });
      took.push(r.took.length);
      continue;
    }
    if (g.phase === 'getaway') { crack(save, { now: step(FX.getaway) }); continue; }
    break;
  }
  const d = out ?? debriefOf(save);
  const entry = save.game.log[save.game.log.length - 1] ?? null;
  const measuredWall = (entry?.tGame ?? 0) + (entry?.tAnswer ?? 0);
  const credit = FX.debrief * 1000;
  return {
    board,
    save,
    queue: queue0,
    spent,
    entry,
    debrief: d,
    briefs: took,
    phases: FX,
    ph,
    elapsed: t - NOW,
    /* the two bases, both printed on the debrief line (screens/run.js `sessionSplit`) */
    measured: measuredWall > 0 ? (entry.tGame / measuredWall) : 0,
    session: measuredWall > 0 ? ((entry.tGame + credit) / (measuredWall + credit)) : 0,
    credit,
  };
}

/* ================================================================================================
   1. G1's shape table, rebuilt from the constants — a constant that moves moves the table
   ================================================================================================ */

/**
 * The table, from primitives, with every constant taken as a PARAMETER. `K` defaults to the shipped
 * `data/job.js`; §1.2 hands it a perturbed copy and the row has to move.
 */
function tableFrom(shapeId, K = {}) {
  const shapes = K.SHAPES ?? SHAPES;
  const answerMin = K.ANSWER_MINUTES_PER_TIER ?? ANSWER_MINUTES_PER_TIER;
  const decision = K.DECISION_SECONDS ?? DECISION_SECONDS;
  const fixed = K.FIXED_PHASES ?? FIXED_PHASES;
  const s = shapes[shapeId];
  let answerS = 0;
  let decisionS = 0;
  for (const [tier, n] of Object.entries(s.tierMix)) {
    answerS += n * answerMin[tier] * 60;
    decisionS += n * decision[tier];
  }
  /* the windows that can actually OPEN: `state.js push()` gates on
     `BOARD.briefAfterTargets.includes(done)` and the `left === 1` target goes to the getaway, so a
     window at `n ≥ targets` never lands. VAULT is 7 targets against windows [4, 8] — it serves one.
     Spelled out from the primitives here, deliberately: this file is the INDEPENDENT recomputation,
     so it must not call `econ.landedBriefs`. (Round 2, split-honesty.) */
  const windows = Math.min(s.briefs, (K.BOARD ?? BOARD).briefAfterTargets.filter((n) => n < s.targets).length);
  const fixedFor = (path) => {
    const cell = fixed[s.fixed][path];
    const p = cell.phases;
    /* no `crew` term: the crew re-rank is one of the brief window's five published options, so its
       seconds are inside `brief` already (verify round 2, split-honesty — the sixth cell this line
       used to add billed them twice, to a phase no `setPhase` in `site/js` ever set). */
    return p ? p.board + p.guard + p.brief * windows + p.getaway + p.debrief : cell.total;
  };
  const gameS = { default: fixedFor('default') + decisionS, full: fixedFor('full') + decisionS };
  const wallS = { default: answerS + gameS.default, full: answerS + gameS.full };
  const pct = (g, w) => Math.round((1000 * g) / w) / 10;
  return {
    id: s.id, targets: s.targets, answerS, decisionS, gameS, wallS,
    split: { default: pct(gameS.default, wallS.default), full: pct(gameS.full, wallS.full) },
  };
}

describe('J8 §1 — G1\'s shape table is RECOMPUTED from data/job.js, never read off the page', () => {
  test('every cell of all four rows reproduces from the tier mix and the fixed-phase table', () => {
    for (const id of SHAPE_IDS) {
      const got = tableFrom(id);
      const pub = PUBLISHED.shapeTable[id];
      assert.equal(got.targets, pub.targets, `${id} targets`);
      assert.equal(got.answerS, pub.answerS, `${id} answer s`);
      assert.equal(got.decisionS, pub.decisionS, `${id} per-target decision s`);
      assert.deepEqual([got.gameS.default, got.gameS.full], pub.gameS, `${id} game s`);
      assert.deepEqual([got.wallS.default, got.wallS.full], pub.wallS, `${id} wall clock`);
      assert.deepEqual([got.split.default, got.split.full], pub.split, `${id} split`);
      /* `game s = fixed + per-target` and `wall clock = answer s + game s`, as G1 promises */
      assert.equal(got.gameS.default, fixedSeconds(id, 'default') + got.decisionS);
      assert.equal(got.gameS.full, fixedSeconds(id, 'full') + got.decisionS);
      assert.equal(got.wallS.default - got.answerS, got.gameS.default);
    }
  });

  test('econ.shapeTable is the same arithmetic — the product and the test agree cell by cell', () => {
    for (const id of SHAPE_IDS) {
      const mine = tableFrom(id);
      const theirs = shapeTable(id);
      assert.equal(theirs.answerS, mine.answerS, `${id} answerS`);
      assert.equal(theirs.decisionS, mine.decisionS, `${id} decisionS`);
      assert.deepEqual({ ...theirs.gameS }, mine.gameS, `${id} gameS`);
      assert.deepEqual({ ...theirs.wallS }, mine.wallS, `${id} wallS`);
      assert.deepEqual({ ...theirs.split }, mine.split, `${id} split`);
      assert.equal(theirs.answerS, answerSeconds(id));
      assert.equal(theirs.decisionS, decisionSeconds(id));
    }
  });

  test('a constant that moves moves the table (the numerals are derived, not transcribed)', () => {
    /* +1 s on a tier-1 call row: every shape holds tier-1 targets, so every row must move. */
    const slower = { DECISION_SECONDS: { ...DECISION_SECONDS, 1: DECISION_SECONDS[1] + 1 } };
    for (const id of SHAPE_IDS) {
      const base = tableFrom(id);
      const moved = tableFrom(id, slower);
      const n = SHAPES[id].tierMix[1] ?? 0;
      assert.ok(n > 0, `${id} has no tier-1 target to move`);
      assert.equal(moved.decisionS, base.decisionS + n, `${id} decision seconds did not move`);
      assert.ok(moved.split.default > base.split.default, `${id} split did not follow its constants`);
      assert.notDeepEqual([moved.split.default, moved.split.full], PUBLISHED.shapeTable[id].split);
    }
    /* and a slower answer clock moves it the other way */
    const slowAnswers = { ANSWER_MINUTES_PER_TIER: { ...ANSWER_MINUTES_PER_TIER, 1: 1 } };
    for (const id of SHAPE_IDS) {
      assert.ok(tableFrom(id, slowAnswers).split.default < tableFrom(id).split.default, `${id} answer clock`);
    }
  });

  test('the fixed-phase columns sum to the totals G1 publishes, RUN.full included', () => {
    for (const id of SHAPE_IDS) {
      for (const path of ['default', 'full']) {
        const cell = FIXED_PHASES[SHAPES[id].fixed][path];
        const p = phasesFor(id, path);
        const summed = p.board + p.guard + p.brief * SHAPES[id].briefs + p.getaway + p.debrief;
        assert.ok(cell.phases, `${id}/${path} publishes no phase column — data/job.js owns every one`);
        assert.equal(summed, cell.total, `${id}/${path} published phases do not sum to the total`);
      }
    }
    /* The one cell G1 left as a TOTAL only (notes/J1.md open issue 1) is now a published column in
       `data/job.js` (notes/J8.md Request 3, done at integration). Its total is still G1's 130, and
       the allocation is still the one this file derived — re-derived here so the constant cannot
       drift away from the reasoning that produced it. */
    assert.equal(FIXED_PHASES.RUN.full.total, 130);
    assert.ok(FIXED_PHASES.RUN.full.phases, 'data/job.js must publish RUN.full.phases');
    assert.deepEqual({ ...FIXED_PHASES.RUN.full.phases }, derivedRunFullPhases(),
      'RUN.full.phases no longer matches the 37:30 allocation of its published 130 s total');
    assert.deepEqual({ ...phasesFor('RUN', 'full') }, { ...FIXED_PHASES.RUN.full.phases },
      'phasesFor must read data/job.js, never keep an allocation of its own');
  });

  test('every phase of PHASE_ORDER is classified, so no phase can fall outside the measurement', () => {
    assert.deepEqual([...GAME_PHASES, ...ANSWER_PHASES].slice().sort(), [...PHASE_ORDER].slice().sort());
    assert.equal(new Set([...GAME_PHASES, ...ANSWER_PHASES]).size, PHASE_ORDER.length, 'a phase is in both sets');
    for (const k of Object.keys(PHASE_MEANS_DEFAULT)) assert.ok(PHASE_ORDER.includes(k), `${k} is not a phase`);
  });
});

/* ================================================================================================
   2. the two headline walkthroughs — 43.2 % tapping through, 51.3 % using the windows
   ================================================================================================ */

describe('J8 §2 — the scripted walkthroughs measure G1\'s two honest columns', () => {
  test('a DEFAULT-path 10-target walkthrough measures 43.2 % ± 5', () => {
    const w = walkthrough(CORPUS[0], 'JOB', 'default', { canon: true });
    const pub = PUBLISHED.shapeTable.JOB.split[0];
    const got = 100 * w.session;
    assert.equal(w.debrief.targets, SHAPES.JOB.targets, 'a 10-target job');
    assert.ok(abs(got - pub) <= 5, `default path measured ${got.toFixed(1)} % against G1's ${pub} %`);
    /* it is not merely inside the band: the scripted session reproduces the published cell exactly */
    assert.equal(round(got, 1), pub, `measured ${got.toFixed(1)} %`);
    assert.equal(w.entry.tAnswer / 1000, shapeTable('JOB').answerS);
    assert.equal(w.entry.tGame / 1000 + w.phases.debrief, shapeTable('JOB').gameS.default);
  });

  test('a FULL-USE walkthrough of the same shape measures G1\'s full column EXACTLY — no phantom phase in the band', () => {
    const w = walkthrough(CORPUS[0], 'JOB', 'full', { canon: true });
    const pub = PUBLISHED.shapeTable.JOB.split[1];
    const got = 100 * w.session;
    assert.ok(abs(got - pub) <= 5, `full-use path measured ${got.toFixed(1)} % against G1's ${pub} %`);
    /* **The ±5 band used to be the only thing this assertion did**, and a 1.5-point deficit lived
       inside it. The full column billed 25 s to a `crew` phase that `PHASE_ORDER` listed and no
       `setPhase` under `site/js` ever set, so no walkthrough could spend it and the published 51.3 %
       was a number no shipped path produces; this file wrote the gap down as a tolerance ("the crew
       phase is not creditable") instead of closing it. The cell was also a DOUBLE charge — G1 sells
       the crew re-rank as one of the brief window's five options inside its 50 s, and G1's decision
       table charges it the same way — so it is gone, and the published full cell is now the 49.8 %
       the machine has always measured. Asserted as an EQUALITY, exactly like the default path above,
       so nothing unmeasurable can hide in the band again. (Verify round 2, split-honesty.) */
    assert.equal(round(got, 1), pub, `full-use measured ${got.toFixed(1)} % against G1's ${pub} %`);
    assert.equal(w.entry.tAnswer / 1000, shapeTable('JOB').answerS);
    assert.equal(w.entry.tGame / 1000 + w.phases.debrief, shapeTable('JOB').gameS.full);
    /* and every fixed second the column charges landed in a phase the machine entered */
    assert.equal(w.ph.brief, w.phases.brief * 2 * 1000, 'both brief windows, and nothing beside them');
    assert.equal(w.ph.board + w.ph.guard + w.ph.brief + w.ph.getaway,
      (w.phases.board + w.phases.guard + w.phases.brief * 2 + w.phases.getaway) * 1000,
      'the four measurable fixed phases must account for the whole fixed column but the debrief read');
  });

  test('every shape reproduces BOTH published cells exactly — the full column included', () => {
    for (const id of SHAPE_IDS) {
      for (const [path, i] of [['default', 0], ['full', 1]]) {
        const w = walkthrough(CORPUS[0], id, path, { canon: true });
        const pub = PUBLISHED.shapeTable[id].split[i];
        assert.equal(round(100 * w.session, 1), pub, `${id}/${path} measured ${(100 * w.session).toFixed(1)} % against ${pub} %`);
        assert.equal(round(100 * w.measured, 1), PUBLISHED.nominalHeadlineSplit[id][i],
          `${id}/${path} headline basis`);
      }
    }
  });

  test('no cell of FIXED_PHASES charges seconds to a phase the machine cannot enter', () => {
    /* the defect the two tests above now close, stated as the general rule. Every key of every
       published phase column has to be a phase a real job passes through — otherwise its seconds
       are unmeasurable and the published split is above anything the app can produce. */
    const seen = new Set();
    let last = null;
    for (const id of SHAPE_IDS) {
      for (const path of ['default', 'full']) last = walkthrough(CORPUS[0], id, path, { canon: true, watch: seen });
    }
    /* `endJob` stamps the terminal phase and tears the job down in the same call, so it is the one
       phase no `stateOf()` can be caught holding. Its stamp is what proves it was entered: the same
       line writes `ledger.debriefAt`, which is the clock `closeDebrief` later banks the read from. */
    assert.ok(last.save.game.ledger.debriefAt > 0, 'the finished job never stamped the debrief');
    seen.add(state.TERMINAL_PHASE);
    assert.ok(seen.size >= 8, `the walkthroughs entered only ${[...seen].join(', ')}`);
    for (const col of Object.values(FIXED_PHASES)) {
      for (const [path, cell] of Object.entries(col)) {
        for (const k of Object.keys(cell.phases ?? {})) {
          assert.ok(seen.has(k), `FIXED_PHASES.*.${path} charges ${cell.phases[k]} s to '${k}', which no job enters`);
          assert.ok(PHASE_ORDER.includes(k), `'${k}' is not in PHASE_ORDER`);
        }
      }
    }
    assert.ok(!PHASE_ORDER.includes('crew'), "'crew' is an action inside the brief window, not a phase");
    assert.ok(!GAME_PHASES.includes('crew'));
    /* and the machine refuses it by name, so it cannot come back as a silent no-op */
    const s = clone(CORPUS[0]);
    startJob(s, { today: TODAY, now: NOW, board: postBoard(s, TODAY, { now: NOW, shape: 'JOB' }) });
    assert.throws(() => tick(s, 'crew', NOW + 1000), (e) => e.code === 'bad-phase',
      'tick must refuse a phase that is not in PHASE_ORDER');
    assert.equal(tick(s, 'guard', NOW + 1000), 'guard', 'a real phase still ticks');
  });

  test('the full-use path is the longer, more decision-dense session — both columns, all four shapes', () => {
    for (const id of SHAPE_IDS) {
      const d = walkthrough(CORPUS[1], id, 'default', { canon: true });
      const f = walkthrough(CORPUS[1], id, 'full', { canon: true });
      assert.ok(f.session > d.session, `${id}: using the windows must raise the split`);
      assert.equal(d.entry.tAnswer, f.entry.tAnswer, `${id}: the same answering work either way`);
      assert.ok(f.entry.tGame > d.entry.tGame, `${id}: the windows cost game seconds`);
      /* and every shape lands inside G1's own two columns, ±5, on its own path */
      for (const [w, i] of [[d, 0], [f, 1]]) {
        const pub = PUBLISHED.shapeTable[id].split[i];
        const got = 100 * w.session;
        assert.ok(abs(got - pub) <= 5, `${id}/${i ? 'full' : 'default'} measured ${got.toFixed(1)} % against ${pub} %`);
      }
    }
  });

  test('the RUN is over half game on both paths, and a tier-heavy job honestly is not', () => {
    const run = walkthrough(CORPUS[1], 'RUN', 'default', { canon: true });
    assert.ok(100 * run.session > 50, `a recall RUN is more than half game (${(100 * run.session).toFixed(1)} %)`);
    const vault = walkthrough(CORPUS[1], 'VAULT', 'default', { canon: true });
    assert.ok(100 * vault.session < 40, 'a tier-4-heavy job is honestly a third game and says so');
    assert.ok(100 * vault.session > 25);
  });
});

/* ================================================================================================
   3. the board printed it BEFORE the job; the debrief printed it after — within 5 points
   ================================================================================================ */

/**
 * The projection the board could make from the student's OWN phase means and THIS draft's tiers —
 * the per-shape projection G1 statement 1 describes ("the board's per-shape projection is computed
 * from that"). It is here, in the test, because `js/job/board.js` belongs to J5; notes/J8.md §6
 * carries it as a drop-in for `projectFor`, and §3.3 is the evidence that it holds.
 */
function referenceProjection(save, queue, shapeId, { path = 'default' } = {}) {
  const means = { ...PHASE_MEANS_DEFAULT, ...(save?.game?.ledger?.phaseMeans ?? null) };
  const shape = SHAPES[shapeId];
  const landed = Math.min(shape.briefs, BOARD.briefAfterTargets.filter((n) => n < queue.length).length);
  let answerS = 0;
  let decisionS = 0;
  for (const it of queue) {
    answerS += ANSWER_MINUTES_PER_TIER[it.tier] * 60;
    decisionS += DECISION_SECONDS[it.tier];
  }
  const gameS = means.board + means.guard + means.brief * landed + means.getaway + means.debrief + decisionS;
  return { split: Math.round((100 * gameS) / (answerS + gameS)), gameS, answerS, path };
}

/**
 * The one number G1 concedes and this file measures: on JOB 1 — no history at all, so the projection
 * spends `PHASE_MEANS_DEFAULT`, which is the DEFAULT-path column — a student who then uses every
 * optional window is projected low. Nothing on job 1 predicts that choice; the very first job on
 * record fixes it (§3.3, where the same student's own means carry both paths inside 5). Published in
 * COMPOSED-GAME G1 statement 2 beside the 5-point criterion, so it lives in the document and not only
 * here; measured at 6.9 points (JOB/full) at round 1's fix.
 */
const PROJECTED_FULL_USE_POINTS = 7;

describe('J8 §3 — the split the board printed and the split the debrief printed agree', () => {
  test('job 1 labels its projection `projected` and falls back to the shipped phase defaults', () => {
    const b = postBoard(clone(CORPUS[0]), TODAY, { now: NOW, shape: 'JOB' });
    assert.equal(b.projectionSource, 'projected');
    assert.equal(b.projection, COPY.projection({ split: b.split, jobs: 0 }));
    assert.match(b.projection, /projected$/);
    /* the fallback is the SESSION basis: it spends the phase means, debrief included */
    const s = clone(CORPUS[0]);
    assert.deepEqual({ ...s.game.ledger.phaseMeans }, { ...PHASE_MEANS_DEFAULT });
  });

  test('a student with jobs behind them gets their OWN number, labelled with the job count', () => {
    const s = clone(CORPUS[0]);
    const w = walkthrough(s, 'JOB', 'default');
    /* BOTH signals a returning student leaves behind: the log the shipped projection reads, and the
       ledger the per-shape one does (notes/J8.md §6, Request 1) — so this passes either way. */
    s.game.log = [w.entry, w.entry, w.entry];
    s.game.ledger = { ...s.game.ledger, jobs: 3 };
    const b = postBoard(s, TODAY, { now: NOW, shape: 'JOB' });
    assert.equal(b.projectionSource, 'ledger');
    assert.match(b.projection, /your last 3 jobs$/);
  });

  test('the LEDGER projection matches the debrief within 5 points — four shapes, both paths', () => {
    /**
     * The history is the ledger `endJob` ITSELF wrote — the rolling per-phase means of G1 statement 1
     * — not a hand-built `{ jobs: 3 }`. ROUND 1 (split-honesty) is why: the old fixture wrote the log
     * and left `phaseMeans` at the shipped defaults, which only ever exercised the raw
     * `Σ tGame / Σ (tGame + tAnswer)` ledger branch. That branch is gone; this is the student's own
     * model, spent on tonight's own draft.
     */
    const rows = [];
    for (const id of SHAPE_IDS) {
      for (const path of ['default', 'full']) {
        const first = walkthrough(CORPUS[2], id, path);
        const s = clone(CORPUS[2]);
        s.game.log = [first.entry, first.entry, first.entry];       // three sessions of this student's own
        s.game.ledger = clone(first.save.game.ledger);              // …and the means the machine measured
        const again = walkthrough(s, id, path);
        const printedBefore = again.board.split;                     // the board, BEFORE the job
        const printedAfter = 100 * again.measured;                   // the debrief's HEADLINE
        rows.push([`${id}/${path}`, printedBefore, +printedAfter.toFixed(1), +abs(printedBefore - printedAfter).toFixed(1)]);
        assert.equal(again.board.projectionSource, 'ledger');
        assert.ok(abs(printedBefore - printedAfter) <= SPLIT.agreeWithinPoints,
          `${id}/${path}: board printed ${printedBefore} %, debrief headlined ${printedAfter.toFixed(1)} %`);
      }
    }
    assert.equal(rows.length, 8);
    if (process.env.J8_PRINT) console.table(rows);
  });

  test('…and on a shape the ledger has NEVER SEEN — the cross-shape case round 1 broke', () => {
    /**
     * ROUND 1 (split-honesty), the finding this test exists for: with any log at all, `projectFor`
     * returned a raw `Σ tGame / Σ (tGame + tAnswer)` over the last five entries — whatever shapes and
     * paths those were — and threw away the per-draft `gameS` it had just computed. Five VAULT/full
     * jobs behind a JOB12/default night printed `~48 % game · your last 5 jobs` against a debrief that
     * headlined 35.2 %: 12.8 points, on a line the document calls measured. The old §3.3 could not
     * catch it, because it built its history out of walkthroughs of the SAME shape and path.
     *
     * Here the student is SEASONED — they have played every other shape, and the ledger is the blend
     * of those sittings, exactly as `endJob` rolls it — and tonight's shape is one the ledger has
     * never seen. Everything that carries the shape now comes from tonight's own draft: the answer
     * seconds, the decision seconds and the brief windows that can actually land.
     */
    const rows = [];
    let worst = { at: null, d: 0 };
    for (const id of SHAPE_IDS) {
      for (const path of ['default', 'full']) {
        let s = clone(CORPUS[2]);
        for (const past of SHAPE_IDS) {
          if (past === id) continue;                                 // never tonight's shape
          s = walkthrough(s, past, path).save;                       // the machine folds each into the means
        }
        assert.ok(s.game.log.length >= SHAPE_IDS.length - 1, 'the seasoning did not reach the log');
        const tonight = walkthrough(s, id, path);
        const d = abs(tonight.board.split - 100 * tonight.measured);
        rows.push([`${id}/${path}`, tonight.board.split, +(100 * tonight.measured).toFixed(1), +d.toFixed(1)]);
        if (d > worst.d) worst = { at: `${id}/${path}`, d };
        assert.equal(tonight.board.projectionSource, 'ledger');
        assert.ok(d <= SPLIT.agreeWithinPoints,
          `${id}/${path} on a ledger of every OTHER shape: board printed ${tonight.board.split} %, debrief headlined ${(100 * tonight.measured).toFixed(1)} %`);
      }
    }
    assert.equal(rows.length, 8);
    if (process.env.J8_PRINT) { console.table(rows); console.log('cross-shape worst', worst); }
  });

  test('JOB 1 — the board and the debrief HEADLINE are the same quantity, and the drift is measured', () => {
    /**
     * ROUND 1 (split-honesty): this compared the board against `w.session` — the basis that credits
     * the debrief read — while the debrief's own headline is `pct1(split.measured)`, which does not.
     * The board therefore agreed with a number the student never sees and sat up to 9.3 points from
     * the one they do (`save3 RUN/default`: board 49, headline 39.7). `board.projectFor` now projects
     * the headline's own quantity, so this compares like with like; the clock (`ends HH:MM`) still
     * spends the debrief read, because the student still sits through it.
     */
    const seen = { default: 0, full: 0 };
    const rows = [];
    for (const id of SHAPE_IDS) {
      for (const path of ['default', 'full']) {
        const w = walkthrough(CORPUS[2], id, path);
        assert.equal(w.board.projectionSource, 'projected', `${id}/${path}: job 1 must label itself projected`);
        const d = abs(w.board.split - 100 * w.measured);
        rows.push([`${id}/${path}`, w.board.split, +(100 * w.measured).toFixed(1), +d.toFixed(1)]);
        seen[path] = Math.max(seen[path], d);
      }
    }
    if (process.env.J8_PRINT) console.table(rows);
    /* The default path is the criterion and it is met with nothing to spare in the document's 5.
       The full-use path is the one thing job 1 cannot know — whether the student will spend the
       optional decision surface — which is exactly what G1 concedes by labelling the number
       `projected`, and what the very first job on record fixes (§3.3 above, where the same student's
       own phase means carry both paths inside 5). The bound is the measurement, not an exemption:
       it is asserted here so a regression moves it, and it is published in G1. */
    assert.ok(seen.default <= SPLIT.agreeWithinPoints,
      `job 1 is ${seen.default.toFixed(1)} points from the debrief headline on a default path`);
    assert.ok(seen.full <= PROJECTED_FULL_USE_POINTS,
      `job 1 is ${seen.full.toFixed(1)} points from the debrief headline on a full-use path`);
  });

  test('the job-1 projection is the SESSION basis too, and both bases are printed side by side', () => {
    /* The debrief prints BOTH: the headline (`measured`, the basis the board now projects) and
       `… % with this screen` (`session`, the basis G1's published table counts). The residue between
       them is exactly the debrief read the job cannot measure about itself — recorded here so the two
       bases stay a known, printed distance apart instead of drifting into each other. */
    for (const id of SHAPE_IDS) {
      for (const path of ['default', 'full']) {
        const w = walkthrough(CORPUS[2], id, path);
        assert.ok(w.session > w.measured, `${id}/${path}: the session basis must credit the debrief read`);
        const wall = (w.entry.tGame + w.entry.tAnswer) + w.credit;
        assert.ok(abs(100 * w.session - 100 * ((w.entry.tGame + w.credit) / wall)) < 1e-9,
          `${id}/${path}: the session basis is not the headline plus the debrief read`);
      }
    }
  });

  test('the per-shape projection holds on BOTH paths and across the corpus (the drop-in for projectFor)', () => {
    const worst = { id: null, d: 0 };
    for (const save of CORPUS) {
      for (const id of SHAPE_IDS) {
        for (const path of ['default', 'full']) {
          const w = walkthrough(save, id, path);
          const s = clone(w.save);
          /* a student whose own phase means describe how they play (G1 statement 1) */
          s.game.ledger = { ...s.game.ledger, phaseMeans: { ...w.phases } };
          const ref = referenceProjection(s, w.queue, id, { path });
          const got = 100 * w.session;
          const d = abs(ref.split - got);
          if (d > worst.d) { worst.d = d; worst.id = `${save.profileId} ${id}/${path}`; }
          assert.ok(d <= SPLIT.agreeWithinPoints,
            `${save.profileId} ${id}/${path}: projected ${ref.split} %, measured ${got.toFixed(1)} % (${d.toFixed(1)} points)`);
        }
      }
    }
    assert.ok(worst.d <= SPLIT.agreeWithinPoints, `worst disagreement ${worst.d.toFixed(1)} at ${worst.id}`);
  });

  test('the debrief line prints BOTH bases, and they are the two numbers the two projections use', () => {
    const w = walkthrough(CORPUS[0], 'JOB', 'default', { canon: true });
    const line = sessionSplit(w.debrief, w.save);
    assert.ok(abs(line.measured - w.measured) < 1e-9, 'the measured number is debriefOf\'s own split');
    assert.ok(abs(line.split - w.session) < 1e-9, 'the session number credits the debrief read');
    assert.equal(line.credit, PHASE_MEANS_DEFAULT.debrief * 1000, 'job 1 credits the shipped mean');
    /* and the credit is the student's OWN mean once they have one */
    const s = clone(w.save);
    s.game.ledger = { ...s.game.ledger, phaseMeans: { ...PHASE_MEANS_DEFAULT, debrief: 40 } };
    assert.equal(sessionSplit(w.debrief, s).credit, 40000);
    assert.ok(sessionSplit(w.debrief, s).split < line.split, 'a faster reader spends fewer game seconds');
  });
});

/* ================================================================================================
   4. the accumulators are wall-clock deltas, and they survive a visibilitychange
   ================================================================================================ */

describe('J8 §4 — tGame / tAnswer are wall-clock deltas', () => {
  test('every millisecond of the job lands in exactly one of the two accumulators', () => {
    for (const id of SHAPE_IDS) {
      const w = walkthrough(CORPUS[3], id, 'default');
      assert.equal(w.entry.tGame + w.entry.tAnswer, w.elapsed,
        `${id}: the two accumulators must sum to the wall clock the walkthrough spent`);
      assert.equal(w.debrief.wall, w.debrief.tGame + w.debrief.tAnswer);
    }
  });

  test('scaling every delta by 10 scales both accumulators by 10 — they are deltas, not counts', () => {
    const base = walkthrough(CORPUS[3], 'JOB', 'default', { canon: true });
    /* the same script, ten times slower, driven through the same machine */
    const slow = walkthroughScaled(CORPUS[3], 'JOB', 10);
    assert.equal(slow.tGame, base.entry.tGame * 10);
    assert.equal(slow.tAnswer, base.entry.tAnswer * 10);
    assert.ok(abs(slow.tGame / (slow.tGame + slow.tAnswer) - base.measured) < 1e-12, 'the split is scale-free');
  });

  test('a visibilitychange mid-job loses nothing: the hidden interval banks into the live phase', () => {
    const save = clone(CORPUS[4]);
    const board = postBoard(save, TODAY, { now: NOW, shape: 'JOB' });
    let t = NOW;
    const step = (s) => (t += Math.round(s * 1000));
    startJob(save, { today: TODAY, now: t, board });
    tick(save, 'guard', step(18));
    beginTargets(save, { now: step(12) });
    lockCall(save, 70, { now: step(5) });                       // phase: answer
    const before = { ...stateOf(save) };

    /* the tab goes away for four minutes WHILE the stem is open. `store.js` flushes the save on
       `visibilitychange`; the record goes to disk and comes back as JSON, which is the only thing a
       hidden tab can do to it. */
    const disk = JSON.parse(JSON.stringify(save));
    const back = clone(disk);
    resume(back);
    const g = stateOf(back);
    assert.equal(g.tGame, before.tGame, 'tGame survived the flush byte-for-byte');
    assert.equal(g.tAnswer, before.tAnswer, 'tAnswer survived the flush byte-for-byte');
    assert.equal(g.phase, 'answer');
    assert.equal(g.phaseAt, before.phaseAt, 'the phase stamp is the anchor the next delta is measured from');

    /* four minutes later the student comes back and answers. The elapsed wall clock — hidden or not —
       belongs to the phase that was live, because the delta is `now − phaseAt`. */
    const hidden = 4 * 60 * 1000;
    const answerMs = 30 * 1000;
    applyTarget(back, CLEAN, { now: g.phaseAt + hidden + answerMs });
    assert.equal(stateOf(back).tAnswer, before.tAnswer + hidden + answerMs);
    assert.equal(stateOf(back).tGame, before.tGame, 'no game second was invented by the round trip');
  });

  test('the screen registers a visibilitychange flush and never assigns the accumulators', () => {
    const raw = read('site/js/screens/job.js');
    const src = strip(raw);
    assert.match(raw, /addEventListener\('visibilitychange'/, 'the job screen must flush on hide');
    assert.doesNotMatch(src, /\.tGame\s*=[^=]/, 'no screen may write tGame onto the record');
    assert.doesNotMatch(src, /\.tAnswer\s*=[^=]/, 'no screen may write tAnswer onto the record');
    const run = strip(read('site/js/screens/run.js'));
    assert.doesNotMatch(run, /\.tGame\s*=[^=]/, 'the debrief reads the accumulators, it does not set them');
    assert.doesNotMatch(run, /\.tAnswer\s*=[^=]/);
    /* and the only clock in the layer is `setPhase` — no payoff term reads elapsed time (G3.7 #5) */
    const st = strip(read('site/js/job/state.js'));
    const econSrc = strip(read('site/js/job/econ.js'));
    assert.doesNotMatch(econSrc, /Date\.now\(\)/, 'no payoff term may read the clock');
    assert.ok((st.match(/Date\.now\(\)/g) ?? []).length > 0, 'the machine does read a clock — in setPhase');
  });
});

/** The §4.2 replay: the same scripted JOB with every delta multiplied by `k`. */
function walkthroughScaled(save0, shapeId, k) {
  const save = clone(save0);
  const board = postBoard(save, TODAY, { now: NOW, shape: shapeId });
  const FX = phasesFor(shapeId, 'default');
  let t = NOW;
  const step = (secs) => (t += Math.round(secs * 1000) * k);
  startJob(save, { today: TODAY, now: t, board });
  const tiers = [];
  for (const [tier, n] of Object.entries(SHAPES[shapeId].tierMix)) for (let i = 0; i < n; i++) tiers.push(+tier);
  queueOf(save).forEach((it, i) => { if (tiers[i]) it.tier = tiers[i]; });
  tick(save, 'guard', step(FX.board));
  beginTargets(save, { now: step(FX.guard) });
  for (let stop = 0; stop < 900; stop++) {
    const g = stateOf(save);
    if (!g || g.outcome != null) break;
    if (g.phase === 'envelope') { lockCall(save, 70, { now: step(DECISION_PARTS_T1.call) }); continue; }
    if (g.phase === 'answer') {
      const it = queueOf(save)[idxOf(save)];
      applyTarget(save, CLEAN, { now: step(ANSWER_MINUTES_PER_TIER[it.tier] * 60) });
      continue;
    }
    if (g.phase === 'payout' || g.phase === 'bagpush') {
      const it = queueOf(save)[Math.max(0, idxOf(save) - 1)];
      push(save, { now: step(DECISION_SECONDS[it.tier] - DECISION_PARTS_T1.call) });
      continue;
    }
    if (g.phase === 'brief') { brief(save, {}, { now: step(FX.brief) }); continue; }
    if (g.phase === 'getaway') { crack(save, { now: step(FX.getaway) }); continue; }
    break;
  }
  const e = save.game.log[save.game.log.length - 1];
  return { tGame: e.tGame, tAnswer: e.tAnswer };
}

/* ================================================================================================
   5. the decision count, and 0 ms of any state that is neither input nor result
   ================================================================================================ */

describe('J8 §5 — the debrief prints the decision count and 0 ms of dead time', () => {
  test('the DEFAULT path measures exactly G1\'s mandatory count, per shape', () => {
    for (const id of SHAPE_IDS) {
      const w = walkthrough(CORPUS[0], id, 'default');
      const published = decisionCount(id);
      /* A brief window that has nowhere to land is not a decision the student made — the VAULT's
         second window falls after target 8 of a 7-target shape (notes/J1.md open issue 2) — and the
         PUBLISHED count now says so: `econ.decisionCount` is charged from the windows that can open,
         not from `SHAPES[id].briefs`. This used to read `published.mandatory − missing`, i.e. it
         subtracted the over-count back out and let the inflated numeral ship beside the real one in
         the debrief ("17 … 18 mandatory"). The subtraction is gone; the equality is exact, per
         shape, and the clamp itself is asserted below. (Round 2, split-honesty.) */
      const landed = w.debrief.briefs.length;
      const reachable = Math.min(SHAPES[id].briefs, BOARD.briefAfterTargets.filter((n) => n < SHAPES[id].targets).length);
      assert.equal(landed, reachable, `${id}: ${landed} windows opened, ${reachable} can`);
      assert.equal(w.debrief.decisions, published.mandatory,
        `${id}: measured ${w.debrief.decisions} against G1's ${published.mandatory}`);
      assert.equal(w.debrief.decisions,
        DECISIONS.draft + DECISIONS.press + w.debrief.calls.length
        + (w.debrief.calls.length - DECISIONS.bagPushExcludesLast) + landed + DECISIONS.getaway);
      assert.ok(w.debrief.perItem >= SPLIT.densityMinDefault - 0.35,
        `${id}: ${w.debrief.perItem.toFixed(2)} decisions per item`);
    }
    /* the recommended evening shape hits G1's own two numerals exactly */
    const job = walkthrough(CORPUS[0], 'JOB', 'default', { canon: true });
    assert.equal(job.debrief.decisions, decisionCount('JOB').mandatory);
    assert.equal(job.debrief.decisions, 24);
    assert.equal(round(job.debrief.perItem, 1), 2.4);
  });

  test('the FULL-USE path adds the windows and the COMMIT, and reaches G1\'s 35', () => {
    const w = walkthrough(CORPUS[0], 'JOB', 'full', { canon: true });
    const published = decisionCount('JOB');
    assert.ok(w.debrief.decisions > published.mandatory);
    assert.equal(w.debrief.calls.length, SHAPES.JOB.targets, 'a clean full-use job is still 10 targets');
    /* `debriefOf` counts a brief window as ONE decision — the skip; G1's full column counts the
       options taken inside it (up to 5). Counted G1's way, with the window itself plus the four
       options this machine implements (the fifth, the contract swap, is notes/J5c.md §5.8): */
    const tookPerWindow = Math.max(...w.briefs);
    const optionCount = w.debrief.decisions - w.debrief.briefs.length
      + w.briefs.reduce((t, n) => t + 1 + n, 0);
    assert.equal(tookPerWindow, 4, 'four of G1\'s five brief options are implemented');
    assert.equal(w.briefs.length, SHAPES.JOB.briefs);
    /* G1's own arithmetic: DRAFT 1 · PRESS 1 · CALL 10 · BAG/PUSH 9 · windows 10 · getaway 1 ·
       COMMIT 1 · Backchecks 2 = 35. The two Backcheck spends are the §5.3 walkthrough's, because a
       miss queues a Rematch and this one is clean. */
    assert.equal(optionCount + DECISIONS.backchecksFull, published.full,
      `full-use count ${optionCount} + ${DECISIONS.backchecksFull} Backchecks against G1's ${published.full}`);
    assert.ok((optionCount + DECISIONS.backchecksFull) / w.debrief.calls.length >= SPLIT.densityMinFull,
      `${((optionCount + DECISIONS.backchecksFull) / w.debrief.calls.length).toFixed(2)} decisions per item on the full-use path`);
  });

  /* ---------------------------------------------------------------------------------------------
     ROUND-2 VERIFY (split-honesty finding 5) — THE SHIPPED `perItem`, AGAINST THE PUBLISHED FLOOR.

     G9 #1 is published as "≥ 3 decisions per graded item with the windows", and the only assertion
     that guarded it was `decisionCount('JOB').perItem.full >= JOB.SPLIT.densityMinFull` — arithmetic
     over literals in `site/data/job.js` compared against another literal in `site/data/job.js`. It
     would pass if `debriefOf` printed zero decisions. The arm above avoided the shipped number too:
     it rebuilds the count G1's way (`optionCount`) and divides that.

     So here is the number the MACHINE prints, on every shape, measured through a played full-use
     job — and it does not clear the floor. The two counts are not the same quantity:

       shape   debrief.perItem (window = 1 decision)   G1's count (window = up to 5 options)
       RUN                       2.67                                    3.67
       JOB                       2.50                                    3.50
       JOB12                     2.42                                    3.25
       VAULT                     2.57                                    3.43

     THE GAP IS A DEFINITION, and the defect is that only one of the two definitions is published:
     `debriefOf` charges a brief WINDOW as one decision (the skip), G1 charges the options taken
     inside it. Until one of them moves, the floor `SPLIT.densityMinFull` is a statement about G1's
     count and about nothing the student is shown. Filed as notes/repair-tests.md Requests · G (the
     econ lane owns `debriefOf`'s counter and `data/job.js`'s constant).

     Both directions are pinned: the machine's own density may not fall (it clears the DEFAULT floor
     on every shape), and it does not yet reach the published FULL floor — the day it does, this arm
     fails and says to make it the plain `>= densityMinFull` assertion G9 #1 always claimed.
     --------------------------------------------------------------------------------------------- */
  test('G9 #1, MEASURED: debriefOf().perItem on a played full-use job, every shape', () => {
    const rows = [];
    for (const id of SHAPE_IDS) {
      const w = walkthrough(CORPUS[0], id, 'full', { canon: true });
      const optionCount = w.debrief.decisions - w.debrief.briefs.length
        + w.briefs.reduce((t, n) => t + 1 + n, 0);
      rows.push({
        id,
        perItem: w.debrief.perItem,
        g1: (optionCount + DECISIONS.backchecksFull) / w.debrief.calls.length,
        items: w.debrief.calls.length,
      });
    }
    if (process.env.J8_PRINT) console.log(`  G9#1 measured: ${JSON.stringify(rows.map((r) => ({ ...r, perItem: +r.perItem.toFixed(2), g1: +r.g1.toFixed(2) })))}`);
    const note = JSON.stringify(rows.map((r) => `${r.id}: debrief ${r.perItem.toFixed(2)} / G1 ${r.g1.toFixed(2)}`));

    for (const r of rows) {
      assert.ok(r.items > 0, `${r.id}: no graded items`);
      // the machine's own density clears the DEFAULT floor on the full-use path, on every shape
      assert.ok(r.perItem >= SPLIT.densityMinDefault,
        `${r.id}: the debrief prints ${r.perItem.toFixed(2)} decisions per graded item, below the ${SPLIT.densityMinDefault} `
        + `G9 #1 claims even for the default path — ${note}`);
      // …and G1's own count, the one the published floor is about, clears the FULL floor
      assert.ok(r.g1 >= SPLIT.densityMinFull,
        `${r.id}: counted G1's way it is ${r.g1.toFixed(2)}, below the published ${SPLIT.densityMinFull} — ${note}`);
    }
    const short = rows.filter((r) => r.perItem < SPLIT.densityMinFull);
    assert.equal(short.length, rows.length,
      `${note} — the SHIPPED density now reaches ${SPLIT.densityMinFull} on ${rows.length - short.length} of ${rows.length} shapes: `
      + 'replace this arm with the plain `perItem >= SPLIT.densityMinFull` assertion G9 #1 has always claimed, '
      + 'and strike notes/repair-tests.md Requests · G');
    assert.ok(Math.min(...rows.map((r) => r.g1 - r.perItem)) > 0.3,
      `${note} — the two counts have converged; if the window is now charged its options, assert the shipped number directly`);
  });

  test('a Backcheck spend is a decision but NOT a phase (G1, the fixed-phase table\'s own note)', () => {
    const clean = walkthrough(CORPUS[0], 'JOB', 'full', { canon: true });
    const spent = walkthrough(CORPUS[0], 'JOB', 'full', { canon: true, spend: true });
    assert.equal(spent.spent, DECISIONS.backchecksFull, 'both Backchecks were spent');
    assert.equal(spent.debrief.backchecks, DECISIONS.backchecksFull);
    /* each spend adds exactly one decision, and zero seconds: the per-target decision seconds of the
       payout line are the same on both runs, so the whole difference in `tGame` is the two Rematch
       targets a miss queues — never the spend itself. */
    const perTarget = (w) => w.entry.tGame - (w.phases.board + w.phases.guard + w.phases.brief * w.briefs.length + w.phases.getaway) * 1000;
    const extraTargets = spent.debrief.calls.length - clean.debrief.calls.length;
    assert.equal(extraTargets, 2, 'two misses queue two Rematches');
    assert.equal(perTarget(spent) - perTarget(clean), extraTargets * DECISION_SECONDS[1] * 1000,
      'a Backcheck spend costs no phase seconds of its own');
    assert.equal(spent.debrief.decisions - clean.debrief.decisions,
      DECISIONS.backchecksFull + extraTargets + (extraTargets - 0),
      'each Rematch adds a CALL and a BAG/PUSH; each Backcheck adds one decision');
  });

  test('0 ms of any state where the app is neither accepting input nor showing a result', () => {
    for (const id of SHAPE_IDS) {
      for (const path of ['default', 'full']) {
        const w = walkthrough(CORPUS[5], id, path);
        /* the independent clock: what the walkthrough actually spent, against what the machine banked */
        const banked = w.debrief.tGame + w.debrief.tAnswer;
        assert.equal(w.elapsed - banked, SPLIT.deadMs,
          `${id}/${path}: ${w.elapsed - banked} ms fell outside every phase`);
        /* and the number the debrief prints is that same difference.

           REPAIR (r3 split-honesty, MINOR). This line used to read
           `sessionSplit(w.debrief, w.save).idle === SPLIT.deadMs` with NO third argument — and
           `run.js:2058-2064` returns `idle: 0` whenever `opts.wall` is absent, while `SPLIT.deadMs`
           IS 0. The assertion was `0 === 0` for every job in the corpus, measured or not: it passed
           for a session with ten minutes of dead time. Negative control, run before the fix:
           feeding the same debrief `{ wall: banked + 600_000 }` prints `idle 600000,
           idleMeasured true`, and the old un-opted call still printed `idle 0, idleMeasured false`
           — i.e. the old line could not see 10 minutes of idle.
           The walkthrough's own clock (`w.elapsed`) is the independent second clock the line above
           uses, so it is what is handed in; `idleMeasured` is asserted so a null clock coerced to 0
           cannot put the tautology back (run.js:2056-2057 warns about exactly that). */
        const split = sessionSplit(w.debrief, w.save, { wall: w.elapsed });
        assert.equal(split.idleMeasured, true,
          `${id}/${path}: the split line did not measure the idle at all`);
        assert.equal(split.idle, SPLIT.deadMs,
          `${id}/${path}: the debrief printed ${split.idle} ms idle against a measured ${w.elapsed - banked}`);
        /* the control that keeps this arm honest: the same call with a clock 10 minutes longer than
           the banked phases MUST print that gap, or the measurement is still not happening */
        const dead = sessionSplit(w.debrief, w.save, { wall: banked + 600000 });
        assert.equal(dead.idle, 600000, `${id}/${path}: sessionSplit cannot see 600000 ms of dead time`);
      }
    }
  });

  test('the debrief line prints the count, both bases and the idle number', () => {
    /* the raw source, not the stripped one: these ARE strings, and `strip` empties every string */
    const src = read('site/js/screens/run.js');
    assert.match(src, /fact\('Split',\s*pct1\(split\.measured\)/, 'the debrief headlines the MEASURED split');
    assert.match(src, /ms idle/, 'the split line prints the idle measurement');
    assert.match(src, /with this screen/, 'the split line prints the credited basis beside the measured one');
    assert.match(src, /fact\('Decisions', String\(job\.decisions\)/, 'the debrief prints the decision count');
    assert.match(strip(src), /decisionCount\(/, 'against the published count, recomputed');
    /* The in-screen debrief no longer computes a split line of its own: it RENDERS run.js's Page
       Summary (G7, notes/J6b.md R1), which is the only caller of `sessionSplit` left and therefore a
       stronger guarantee than a grep for the call — there is now exactly one split line in the
       product, not two that agree. J8's Request 4 asked for precisely this. */
    const jobSrc = strip(read('site/js/screens/job.js'));
    assert.match(jobSrc, /renderJobSummary\(stage,\s*jobSummaryContext\(/, 'the in-screen debrief IS run.js\'s Page Summary');
    assert.equal(/sessionSplit\(/.test(jobSrc), false, 'and it must not compute a second split line beside it');
  });
});

/* ================================================================================================
   6. there is no constant-ratio claim in this product
   ================================================================================================ */

describe('J8 §6 — no assertion anywhere requires a constant 45–55 % band', () => {
  test('no test in the suite bands a split between two constants', () => {
    const offenders = [];
    const files = listFiles('tests', /\.test\.mjs$/);
    assert.ok(files.length > 20, `only ${files.length} test files were scanned`);
    for (const file of files) {
      const name = file.split('/').pop();
      const code = strip(read(`tests/${name}`));
      for (const line of code.split('\n')) {
        if (!/split/i.test(line)) continue;
        if (!/assert/.test(line)) continue;
        const has45 = /\b(45|0\.45)\b/.test(line);
        const has55 = /\b(55|0\.55)\b/.test(line);
        if (has45 && has55) offenders.push(`${name}: ${line.trim().slice(0, 120)}`);
      }
    }
    assert.deepEqual(offenders, [], 'a constant-ratio band is asserted somewhere');
  });

  test('this file\'s own split assertions are all derived or ±5 agreements', () => {
    const mine = strip(read('tests/job-split.test.mjs'));
    /* the only bare numerals allowed beside a split are G1's own published cells, which come from
       `PUBLISHED.shapeTable`, and the agreement band, which comes from `SPLIT.agreeWithinPoints`. */
    assert.match(mine, /PUBLISHED\.shapeTable/);
    assert.match(mine, /SPLIT\.agreeWithinPoints/);
    for (const line of mine.split('\n')) {
      if (!/assert\.ok\(/.test(line) || !/session|measured|split/.test(line)) continue;
      assert.ok(!/\b(45|55)\s*(<|>|<=|>=)/.test(line), `a constant band slipped in: ${line.trim()}`);
    }
  });

  test('the product states the range, not a ratio: SPLIT carries a band width and no target', () => {
    assert.equal(SPLIT.agreeWithinPoints, 5);
    assert.equal(SPLIT.deadMs, 0);
    assert.equal(SPLIT.projectionWindowJobs, 5);
    assert.ok(!('targetSplit' in SPLIT) && !('minSplit' in SPLIT) && !('maxSplit' in SPLIT),
      'no constant ratio may live in the constants either');
    /* the four shapes span 29.6 → 54.3 %: a product with a constant ratio could not print this table */
    const splits = SHAPE_IDS.flatMap((id) => PUBLISHED.shapeTable[id].split);
    assert.ok(Math.max(...splits) - Math.min(...splits) > 20, 'the shapes must disagree about the split');
  });
});

/* ================================================================================================
   THE CRITERION, DRIVEN BY A CLOCK THE PROJECTION DOES NOT OWN
   (ticket fix:tests r1 wrote this section red on purpose; ticket fix:board r2 turns it green)
   ================================================================================================

   THE OBJECTION, and it was correct. Every walkthrough above advances its fake clock by exactly the
   numbers `projectFor` used to add up:

       tests/job-split.test.mjs:173   lockCall(save, 70, { now: step(DECISION_PARTS_T1.call) })
       tests/job-split.test.mjs:176   applyTarget(…,  { now: step(ANSWER_MINUTES_PER_TIER[it.tier] * 60) })
       tests/job-split.test.mjs:185   const when = step(DECISION_SECONDS[it.tier] - DECISION_PARTS_T1.call)
       site/js/job/board.js             answerS += ANSWER_MINUTES_PER_TIER[it.tier] * 60
                                        decisionS += DECISION_SECONDS[it.tier]

   Both sides summed the same two constant tables, so "the board's projection matches the debrief's
   measurement within 5 points" was arithmetic on one table, not a measurement of a student. The
   fixed phases were measured — `endJob` folds `g.ph[phase]` into `game.ledger.phaseMeans` and
   `projectFor` reads them back — but the two per-target terms, 60–80 % of the projection, were
   constants at both ends and nothing folded them. Round 2 measured what that cost over the screen's
   own call sequence: a slow answerer's board printed `~29 % game · your last 5 jobs` against a
   debrief that headlined 11.5 %, and a fast answerer who deliberates printed `~37 %` against 70.8 %
   — 17 to 35 points, in both directions, on a line whose label claims it came from the student.

   ROUND 2's FIX, and what this section now asserts. `save.game.log` keeps each job's own `tGame`,
   `tAnswer`, `targets`, `shape` and `posted`, so the two per-target terms are now the tables SCALED
   BY THE STUDENT'S OWN MEASURED RATE against them (`board.js personalRates`), and the rolling phase
   means are re-expressed in tonight's shape's own published column (`meansForShape`). The clock
   below is still nobody's constant. The assertion is the one the round-1 note asked for:
   AGREEMENT, at the same published ceiling every other agreement test in this file uses, in both
   directions of error. */

describe('J8 · the split criterion against a clock the projection does not own', () => {
  /** A student who is NOT the published tables: slower on the stem, quicker on the decision. */
  const STUDENT = Object.freeze({
    answerS: { 1: 62, 2: 110, 3: 205, 4: 335 },     // vs ANSWER_MINUTES_PER_TIER × 60 = 30/90/180/300
    callS: { 1: 3, 2: 4, 3: 5, 4: 6 },
    beatS: { 1: 4, 2: 6, 3: 8, 4: 10 },             // vs DECISION_SECONDS − 5 = 9/19/25/31
    board: 22, guard: 10, brief: 15, getaway: 18,
  });

  /** The same walkthrough, with every duration taken from `clock` instead of from `data/job.js`. */
  function walkWithClock(save0, shapeId, clock) {
    const save = clone(save0);
    const board = postBoard(save, TODAY, { now: NOW, shape: shapeId });
    let t = NOW;
    const step = (secs) => (t += Math.round(secs * 1000));
    startJob(save, { today: TODAY, now: t, board });
    tick(save, 'guard', step(clock.board));
    beginTargets(save, { now: step(clock.guard) });
    let out = null;
    for (let stop = 0; stop < 900; stop++) {
      const g = stateOf(save);
      if (!g || g.outcome != null) break;
      if (g.phase === 'envelope') {
        const it = queueOf(save)[idxOf(save)];
        lockCall(save, 70, { now: step(clock.callS[it?.tier ?? 2]) });
        continue;
      }
      if (g.phase === 'answer') {
        const it = queueOf(save)[idxOf(save)];
        applyTarget(save, CLEAN, { now: step(clock.answerS[it?.tier ?? 2]) });
        continue;
      }
      if (g.phase === 'payout' || g.phase === 'bagpush') {
        const it = queueOf(save)[Math.max(0, idxOf(save) - 1)];
        const when = step(clock.beatS[it?.tier ?? 2]);
        if (targetsLeft(save) === 0) out = state.endJob(save, finalWordOf(save), { now: when, day: TODAY });
        else push(save, { now: when });
        continue;
      }
      if (g.phase === 'brief') { brief(save, {}, { now: step(clock.brief) }); continue; }
      if (g.phase === 'getaway') { crack(save, { now: step(clock.getaway) }); continue; }
      break;
    }
    const d = out ?? debriefOf(save);
    const entry = save.game.log[save.game.log.length - 1] ?? null;
    const wall = (entry?.tGame ?? 0) + (entry?.tAnswer ?? 0);
    return { board, save, debrief: d, entry, measured: wall > 0 ? entry.tGame / wall : 0 };
  }

  test('the clock is genuinely independent: not one of its numbers is a shipped constant', () => {
    for (const tier of [1, 2, 3, 4]) {
      assert.notEqual(STUDENT.answerS[tier], ANSWER_MINUTES_PER_TIER[tier] * 60, `tier ${tier} answer seconds`);
      assert.notEqual(STUDENT.callS[tier] + STUDENT.beatS[tier], DECISION_SECONDS[tier], `tier ${tier} decision seconds`);
    }
    assert.notEqual(STUDENT.board, PHASE_MEANS_DEFAULT.board);
    assert.notEqual(STUDENT.brief, PHASE_MEANS_DEFAULT.brief);
  });

  test('the machine measures THIS student, not the table — tGame and tAnswer follow the clock', () => {
    // First: the two accumulators really are wall-clock deltas of whatever `now` they are handed.
    // If this failed, nothing below would mean anything.
    const w = walkWithClock(CORPUS[2], 'JOB', STUDENT);
    assert.ok(w.entry, 'the job wrote no log entry');
    const targets = w.save.game.log.at(-1).targets;
    assert.ok(w.entry.tAnswer > 0 && w.entry.tGame > 0);
    // the answer clock is the student's, so it is far above the table's 10 × 30 s for a tier-1 job
    const tableAnswerS = targets * ANSWER_MINUTES_PER_TIER[1] * 60;
    assert.ok(w.entry.tAnswer / 1000 > tableAnswerS,
      `measured answer seconds ${(w.entry.tAnswer / 1000).toFixed(0)} did not exceed the table's ${tableAnswerS}`);
  });

  /**
   * The mirror of `STUDENT`, and the case that made the round-2 critic's gap change sign: someone
   * who answers fast and deliberates slowly. The two clocks bracket the error in both directions,
   * which matters because a projection can be made to agree with one of them by a constant fudge
   * and with both only by measuring.
   */
  const DELIBERATOR = Object.freeze({
    answerS: { 1: 7, 2: 19, 3: 41, 4: 66 },           // vs 30/90/180/300
    callS: { 1: 11, 2: 13, 3: 15, 4: 17 },
    beatS: { 1: 26, 2: 33, 3: 41, 4: 52 },            // vs 9/19/25/31
    board: 50, guard: 24, brief: 46, getaway: 40,
  });

  const seasoned = (id, clock, jobs = 3) => {
    // a SEASONED student: the ledger holds this student's own sittings, folded by `endJob` itself,
    // so the fixed phases are their numbers AND — round 2 — so are the two per-target terms.
    let s = clone(CORPUS[2]);
    for (let k = 0; k < jobs; k++) s = walkWithClock(s, id, clock).save;
    return walkWithClock(s, id, clock);
  };

  test('THE CRITERION: the board and the debrief HEADLINE agree within 5 points, on a clock that is nobody\'s table', () => {
    const rows = [];
    let worst = 0;
    for (const [who, clock] of [['slow answerer', STUDENT], ['deliberator', DELIBERATOR]]) {
      for (const id of SHAPE_IDS) {
        const w = seasoned(id, clock);
        assert.equal(w.board.projectionSource, 'ledger', `${who}/${id}: the projection is not reading the ledger`);
        const printed = w.board.split;
        const measured = 100 * w.measured;
        const gap = Math.abs(printed - measured);
        rows.push([`${who}/${id}`, printed, +measured.toFixed(1), +gap.toFixed(1)]);
        worst = Math.max(worst, gap);
        assert.ok(gap <= SPLIT.agreeWithinPoints,
          `${who}/${id}: board printed ${printed} %, debrief headlined ${measured.toFixed(1)} %, gap ${gap.toFixed(1)}`);
      }
    }
    if (process.env.J8_PRINT) console.table(rows);
  });

  test('…and the two students really are far apart, so the agreement is not a constant', () => {
    /* If the projection had stayed the brochure, these two boards would print the SAME number on the
       same save and the same shape — which is exactly what round 2 measured: `~29 %` for a student
       the debrief headlined at 11.5 %, and `~37 %` for one it headlined at 70.8 %. */
    for (const id of SHAPE_IDS) {
      const slow = seasoned(id, STUDENT);
      const fast = seasoned(id, DELIBERATOR);
      assert.ok(100 * fast.measured - 100 * slow.measured > 30,
        `${id}: the two clocks are not far enough apart to prove anything`);
      assert.ok(fast.board.split - slow.board.split > 30,
        `${id}: the BOARD printed ${slow.board.split} % and ${fast.board.split} % for two students `
        + `the debrief separates by ${(100 * (fast.measured - slow.measured)).toFixed(1)} points — the line is still the brochure`);
    }
  });

  test('…and it is the PER-TARGET terms that do it: feed the machine the tables and it agrees again', () => {
    // The control that names the mechanism. Same function, same machine — only the clock changes,
    // to one built out of the two constant tables. The gap collapses, which is precisely why the
    // constant-table walkthroughs in §3 agree: they are the arithmetic, not the measurement.
    const TABLE_CLOCK = {
      answerS: Object.fromEntries([1, 2, 3, 4].map((t) => [t, ANSWER_MINUTES_PER_TIER[t] * 60])),
      callS: Object.fromEntries([1, 2, 3, 4].map((t) => [t, DECISION_PARTS_T1.call])),
      beatS: Object.fromEntries([1, 2, 3, 4].map((t) => [t, DECISION_SECONDS[t] - DECISION_PARTS_T1.call])),
      board: PHASE_MEANS_DEFAULT.board, guard: PHASE_MEANS_DEFAULT.guard,
      brief: PHASE_MEANS_DEFAULT.brief, getaway: PHASE_MEANS_DEFAULT.getaway,
    };
    let s = clone(CORPUS[2]);
    for (let k = 0; k < 3; k++) s = walkWithClock(s, 'JOB', TABLE_CLOCK).save;
    const w = walkWithClock(s, 'JOB', TABLE_CLOCK);
    const gap = Math.abs(w.board.split - 100 * w.measured);
    assert.ok(gap <= SPLIT.agreeWithinPoints,
      `driven by the tables themselves the gap is ${gap.toFixed(1)} points — the agreement suite's premise has moved`);
  });
});
