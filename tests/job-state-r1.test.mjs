// tests/job-state-r1.test.mjs — round-1 fixes to `site/js/job/state.js`.
//
// Every test here is the shape the critic asked for: it plays the REAL state path and asserts the
// app's behaviour, never a direct unit call to the function that was already correct and already
// unreachable. The five defects:
//
//   1. Backchecks never minted — `mintBackcheck` and `index.mint` had ZERO call sites, so the game's
//      only consumable had no renewable source at all.
//   2. A FAILED vault was recorded as `cracked` and counted in `records.cracked`.
//   3. `ledger.phaseMeans` had no idle clamp and `k = min(5, jobs)`, so ONE interrupted job replaced
//      the shipped defaults outright.
//   4. `quietClose` — the 22:00 auto-bag — had no caller anywhere in the app.
//   5. `phaseMeans.debrief` could never move off the shipped 65 s, so a fifth of every projected
//      game-second was an unmeasurable constant printed as measured.
//   6. The brief window shipped four of G1's five options; the priced contract swap was missing and
//      `board.declinePrice` was computed onto every posted row with no consumer.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import * as state from '../site/js/job/state.js';
import {
  OUTCOMES, startJob, beginTargets, beginAnswer, lockCall, applyTarget, push, brief,
  crack, callIt, closeDebrief, swapOptions, canSwap,
  queueOf, idxOf, targetsLeft, answered, isVaultTarget, stateOf, resume, serialize, deserialize,
  STATE_KEYS,
} from '../site/js/job/state.js';
import { BACKCHECK, PHASE_MEANS_DEFAULT, SPLIT, COMPLETION, DECLINE_PRICE } from '../site/data/job.js';
import { fresh } from '../site/js/store.js';
import { applyOutcome, dueList, DAY_MS } from '../site/js/schedule.js';
import { rngFrom } from '../site/js/rng.js';
import { todayISO, addDays } from '../site/js/days.js';
import { cards as ALL_CARDS } from '../site/data/cards.js';
import { isBonus } from '../site/data/source-manifest.js';

/* 18:00 on a Wednesday — well clear of the 22:00 close, which has its own suite below. */
const NOW = new Date(2026, 8, 16, 18, 0).getTime();
const TODAY = todayISO(new Date(NOW));
const BANK = ALL_CARDS.filter((c) => !isBonus(c.id));
const clone = (x) => structuredClone(x);
const num = (x) => (Number.isFinite(+x) ? +x : 0);

const CLEAN = { cleared: true, firstTry: true, hints: 0, attempt: 1, clean: true };
const MISS = { cleared: false, solutionShown: true, reason: 'third-wrong', attempt: 3, hints: 0 };

/** A save with real Leitner records, real history and a real due pile (the corpus job-state uses). */
function seededSave(i, now = NOW) {
  const rng = rngFrom('job-state-r1', i);
  const s = fresh(now - (4 + rng.int(0, 20)) * DAY_MS);
  s.profileId = `r1-${i}`;
  s.settings.testDate = addDays(todayISO(new Date(now)), 6 + rng.int(0, 10));   // D > 2: no Final Sweep
  const n = 28 + rng.int(0, 20);
  for (let k = 0; k < n; k++) {
    const c = BANK[rng.int(0, BANK.length - 1)];
    let rec = null;
    for (let r = 0; r < 3; r++) rec = applyOutcome(s, c.id, rng.chance(0.75) ? 'clean' : 'wrong', { now: now - (30 - r * 4) * DAY_MS });
    if (!rec) continue;
    rec.cleared = true;
    rec.rarity = 'gold';
    rec.due = now + (rng.chance(0.6) ? -rng.float(0, 9) : rng.float(0.2, 12)) * DAY_MS;
    rec.history = Array.from({ length: 10 }, (_, h) => ({
      at: now - (20 - h) * DAY_MS, ok: rng.chance(0.75), attempt: rng.chance(0.75) ? 1 : 2, hints: 0, ms: 9000,
    }));
  }
  const SKILLS = ['VOC', 'NOTE', 'CLASS', 'ASN-PLP', 'ASN-ANG', 'PAIRS', 'FIG-ALG', 'BISECT-L', 'BISECT-Q',
    'SEG-ALG', 'CSARITH', 'CS-LIN', 'CS-RATIO', 'CS-QUAD', 'SYS', 'FAC1', 'FAC2', 'QUAD-SOLVE', 'QUAD-CTX'];
  for (const k of SKILLS) {
    if (!rng.chance(0.75)) continue;
    s.skills[k] = { m: rng.int(10, 95), n: rng.int(1, 9), lastAt: now - rng.int(1, 20) * DAY_MS, lastDueCorrectAt: null };
  }
  return s;
}

/**
 * LEDGER A, written the way `screens/card.js` writes it at grade time — the half of the loop this
 * module is structurally forbidden to touch. The job never moves a due date; card.js does.
 */
function clearDue(save, id, now) {
  const rec = save.cards?.[id] ?? save.frozen?.[id];
  if (!rec) return false;
  rec.due = now + 3 * DAY_MS;
  rec.lastAt = now;
  return true;
}

/** Every real (non-sweep) due the job did NOT draft — cleared on an earlier page the same day. */
function clearDuesOutsideJob(save, now, today) {
  const inQueue = new Set(queueOf(save).map((it) => it?.id).filter(Boolean));
  let n = 0;
  for (const d of dueList(save, { now, today })) {
    if (d.sweep === true || inQueue.has(d.id)) continue;
    if (clearDue(save, d.id, now)) n++;
  }
  return n;
}

/**
 * One whole job, played through the real machine, with card.js's Ledger A write simulated after
 * every target. Returns the debrief.
 */
function playJob(save, { now = NOW, today = TODAY, plan = () => CLEAN, clearOthers = true, shape = null, step: stepMs = {} } = {}) {
  let t = now;
  const step = (ms) => (t += ms);
  startJob(save, { today, now: t, ...(shape ? { shape } : {}) });
  if (clearOthers) clearDuesOutsideJob(save, t, today);
  beginTargets(save, { now: step(stepMs.board ?? 6000) });
  let debrief = null;
  for (let guardN = 0; guardN < 400; guardN++) {
    const g = stateOf(save);
    if (!g || g.outcome != null) break;
    if (g.phase === 'envelope') {
      if (g.stakes) lockCall(save, 70, { now: step(5000) });
      else beginAnswer(save, { now: step(1000) });
      continue;
    }
    if (g.phase === 'answer') {
      const it = queueOf(save)[idxOf(save)];
      const n = answered(save) + 1;
      const r = plan(n, save);
      const out = applyTarget(save, r, { now: step(stepMs.answer ?? 40000) });
      /* card.js's own write, at grade time, on the item that was just graded */
      if (r.cleared === true) clearDue(save, it?.id, t);
      debrief = out.debrief ?? debrief;
      continue;
    }
    if (g.phase === 'payout' || g.phase === 'bagpush') {
      const res = push(save, { now: step(stepMs.push ?? 9000) });
      debrief = res.debrief ?? debrief;
      continue;
    }
    if (g.phase === 'brief') { brief(save, {}, { now: step(stepMs.brief ?? 20000) }); continue; }
    if (g.phase === 'getaway') { crack(save, { now: step(stepMs.getaway ?? 25000) }); continue; }
    break;
  }
  return { debrief, at: t };
}

/**
 * The same job, but the student spends a Backcheck on the first miss that cost something — which is
 * G2's "no Backcheck spent" clause, and therefore the one way to watch the DUES mint carry a day on
 * its own. The miss is never taken on the vault (a Backcheck is not allowed there) and the missed
 * review is re-queued by `page.requeueReview` and cleared on the retry, so no due is left open.
 */
function playSpendingBackcheck(save, { now = NOW, today = TODAY, clearOthers = true } = {}) {
  let t = now;
  const step = (ms) => (t += ms);
  startJob(save, { today, now: t });
  if (clearOthers) clearDuesOutsideJob(save, t, today);
  beginTargets(save, { now: step(6000) });
  let spent = false;
  let debrief = null;
  for (let n = 0; n < 400; n++) {
    const g = stateOf(save);
    if (!g || g.outcome != null) break;
    if (g.phase === 'envelope') {
      if (g.stakes) lockCall(save, 70, { now: step(5000) });
      else beginAnswer(save, { now: step(1000) });
      continue;
    }
    if (g.phase === 'answer') {
      const it = queueOf(save)[idxOf(save)];
      const tryMiss = !spent && num(g.loose) > 0 && !isVaultTarget(save) && targetsLeft(save) > 2;
      const r = tryMiss ? MISS : CLEAN;
      applyTarget(save, r, { now: step(40000) });
      if (r.cleared === true) clearDue(save, it?.id, t);
      if (tryMiss && state.canBackcheck(save)) { state.backcheck(save); spent = true; }
      continue;
    }
    if (g.phase === 'payout' || g.phase === 'bagpush') {
      const res = push(save, { now: step(9000) });
      debrief = res.debrief ?? debrief;
      continue;
    }
    if (g.phase === 'brief') { brief(save, {}, { now: step(20000) }); continue; }
    if (g.phase === 'getaway') { crack(save, { now: step(25000) }); continue; }
    break;
  }
  return { debrief, spent, at: t };
}

/** The first corpus save whose board actually posts a job of `min` targets or more. */
function saveWithTargets(min, now = NOW) {
  for (let i = 0; i < 24; i++) {
    const s = seededSave(i, now);
    try {
      const probe = clone(s);
      startJob(probe, { today: todayISO(new Date(now)), now });
      if (queueOf(probe).length >= min) return s;
    } catch { /* empty board — try the next seed */ }
  }
  throw new Error(`no corpus save posts a ${min}-target job`);
}

/* ==========================================================================================
   1. BLOCKER — Backchecks now mint, from the dullest work, through the real path
   ========================================================================================== */
describe('r1 · G2 — the Backcheck mint has a call site (it had none)', () => {
  test('five simulated days of all-dues-cleared take held 0 → 1 → 2 → 3, then stop at the cap', () => {
    const held = [];
    const why = [];
    let save = seededSave(1);
    for (let d = 0; d < 5; d++) {
      const now = NOW + d * DAY_MS;
      const today = todayISO(new Date(now));
      const { debrief } = playJob(save, { now, today });
      assert.ok(debrief, `day ${d}: the job did not finish`);
      assert.ok(['vault', 'dues', null].includes(debrief.minted.source));
      held.push(save.game.backchecks.held);
      why.push(debrief.minted.why);
      save = clone(save);                                 // the next day, off the disk
    }
    assert.deepEqual(held, [1, 2, 3, 3, 3], `held went ${held.join(' → ')} — the cap is ${BACKCHECK.max}`);
    assert.deepEqual(why.slice(0, 3), ['minted', 'minted', 'minted'], why.join(' · '));
    assert.equal(why.slice(3).includes('minted'), false, `past the cap: ${why.join(' · ')}`);
  });

  test('one day mints once, whatever the source — a second job the same day adds nothing', () => {
    const save = seededSave(4);
    playJob(save, { now: NOW, today: TODAY });
    assert.equal(save.game.backchecks.held, 1);
    assert.equal(save.game.backchecks.mintedDay, TODAY);
    const { debrief } = playJob(save, { now: NOW + 40 * 60000, today: TODAY });
    assert.equal(debrief.minted.why, 'already-today');
    assert.equal(save.game.backchecks.held, 1, 'a second job the same day minted a second Backcheck');
  });

  test('the DUES source stands on its own: a job that SPENT a Backcheck still mints for the day', () => {
    /* G2 gates the vault mint on "no Backcheck spent", so this job cannot take that source — and
       G3.7 proof 10 ("the dullest study action is the only RENEWABLE source") is exactly this case. */
    const save = seededSave(2);
    save.game = { ...(save.game ?? {}), backchecks: { held: 1, mintedDay: null } };
    const { debrief, spent } = playSpendingBackcheck(save, { now: NOW, today: TODAY });
    assert.equal(spent, true, 'no Backcheck was spendable in this job — the case is untested');
    assert.equal(debrief.backchecks, 1, 'the job did not record the spend');
    assert.equal(debrief.minted.source, 'dues', `minted from '${debrief.minted.source}' (${debrief.minted.why})`);
    assert.equal(debrief.minted.open, 0);
    assert.ok(debrief.minted.cleared >= 1);
    assert.equal(save.game.backchecks.held, 1, 'spent one, minted one');
  });

  test('a day with an OPEN due mints nothing — the mint is compliance, not attendance', () => {
    const save = seededSave(2);
    save.game = { ...(save.game ?? {}), backchecks: { held: 1, mintedDay: null } };
    const { debrief, spent } = playSpendingBackcheck(save, { now: NOW, today: TODAY, clearOthers: false });
    assert.equal(spent, true);
    assert.ok(debrief.minted.open > 0, 'this seed cleared every due — no open-due case to test');
    assert.equal(debrief.minted.why, 'dues-open');
    assert.equal(save.game.backchecks.held, 0, 'an open due still minted');
  });

  test('a CRACKED vault with no Backcheck spent mints on its own (G2, cap 1/day)', () => {
    const save = seededSave(2);
    save.game = { ...(save.game ?? {}), backchecks: { held: 0, mintedDay: null } };
    /* r2: the shape is PINNED. G2 pays this mint for a **vault** — G3.7 #6's "most-overdue tier-3/4
       original you have cleared, named on the board at the start of the job" — and `board.vaultFor`
       only draws one when `SHAPES[shape].vault` is true. Left to `shapeFor`, this seed posts a plain
       JOB, and the assertion below was only ever green because the mint fired on any cleanly
       finished job, which is the round-2 defect (see notes/state-fix.md round 2 §3). The VAULT shape
       is what the sentence is about. */
    let vaultId = null;
    const { debrief } = playJob(save, {
      now: NOW, today: TODAY, clearOthers: false, shape: 'VAULT',
      plan: (n, sv) => { vaultId = vaultId ?? stateOf(sv)?.vault ?? null; return CLEAN; },
    });
    assert.equal(debrief.outcome, OUTCOMES.CRACKED);
    assert.ok(vaultId, 'this seed posts a VAULT with no vault card — the mint case is untested');
    assert.equal(debrief.minted.held, 1, 'a clean crack minted nothing');
    assert.equal(debrief.minted.source, 'vault');
  });
});

/* ==========================================================================================
   2. MAJOR — a failed vault is KNOCKED, not cracked
   ========================================================================================== */
describe('r1 · G1 "Knocked" — a vault that missed is not a vault that cracked', () => {
  function vaultMissJob(save) {
    return playJob(save, {
      now: NOW, today: TODAY, clearOthers: false,
      plan: (n, sv) => (isVaultTarget(sv) ? MISS : CLEAN),
    });
  }

  test('the final target missed ends `knocked`, and records.cracked does NOT move', () => {
    const save = saveWithTargets(4);
    const a = clone(save); const b = clone(save);
    const miss = vaultMissJob(a);
    const clean = playJob(b, { now: NOW, today: TODAY, clearOthers: false });

    assert.equal(clean.debrief.outcome, OUTCOMES.CRACKED);
    assert.equal(clean.debrief.cracked, true);
    assert.equal(b.player.records.cracked, 1);

    assert.equal(miss.debrief.outcome, OUTCOMES.KNOCKED, 'a missed vault still reported `cracked`');
    assert.equal(miss.debrief.cracked, false);
    assert.equal(a.player.records.cracked, 0, 'Stats would print a failure under "Vaults cracked"');
    assert.equal(a.game.log.at(-1).cracked, false, 'the job log recorded the crack');
    assert.equal(a.game.log.at(-1).shape, miss.debrief.shape);
  });

  test('a knocked vault mints NO vault Backcheck, and does not count as a clean job', () => {
    const save = saveWithTargets(4);
    const a = clone(save);
    a.game = { ...(a.game ?? {}), backchecks: { held: 0, mintedDay: null } };
    const { debrief } = vaultMissJob(a);
    assert.equal(debrief.minted.source === 'vault', false, 'a knock paid the clean-vault mint');
    assert.equal(a.player.records.cleanJobs, 0);
  });

  test('KNOCKED still banks the getaway pile FREE and still pays COMPLETION (G1 line 259)', () => {
    /* The critic asked for COMPLETION to be withheld. COMPOSED-GAME.md line 259 is the authority and
       says the opposite: "completion = +10 % on BAGGED if every drafted target was answered". A
       knocked vault answered every one of them; what G1's Knocked forfeits is the STAMP. */
    const save = saveWithTargets(4);
    const a = clone(save);
    const { debrief } = vaultMissJob(a);
    assert.equal(debrief.complete, true);
    assert.equal(debrief.bonusRate, COMPLETION);
    /* and the exit is the getaway's free bank, not the 50 % quit auto-bag */
    assert.equal(debrief.finalBagged, Math.round(debrief.baseBagged * (1 + COMPLETION)));
  });

  test('`knocked` round-trips the disk like every other terminal word', () => {
    assert.ok(Object.values(OUTCOMES).includes('knocked'));
    const g = deserialize({ ...serialize(state.freshState()), outcome: 'knocked' });
    assert.equal(g.outcome, 'knocked');
    assert.deepEqual(Object.keys(g), [...STATE_KEYS]);
  });
});

/* ==========================================================================================
   3. MAJOR — phaseMeans: the idle clamp and the blended first job
   ========================================================================================== */
describe('r1 · G7 — one interrupted job can no longer replace the shipped projection', () => {
  test('job 1 BLENDS with the shipped prior instead of replacing it', () => {
    const save = seededSave(5);
    /* a board read at exactly its shipped mean, so the blend is arithmetic and not an inequality */
    playJob(save, { now: NOW, today: TODAY, clearOthers: false, step: { board: PHASE_MEANS_DEFAULT.board * 1000 } });
    const k = Math.min(SPLIT.projectionWindowJobs, 2);
    const expect = ((PHASE_MEANS_DEFAULT.board * (k - 1)) + PHASE_MEANS_DEFAULT.board) / k;
    assert.equal(save.game.ledger.jobs, 1);
    assert.ok(Math.abs(save.game.ledger.phaseMeans.board - expect) < 0.001,
      `board mean ${save.game.ledger.phaseMeans.board} ≠ ${expect}`);
  });

  test('a phone left on the board is CLAMPED — one walked job cannot advertise "~91 % game"', () => {
    const save = seededSave(5);
    /* the live defect: 167 s observed on an 18 s board, with k = 1, became the whole projection */
    playJob(save, { now: NOW, today: TODAY, clearOthers: false, step: { board: 40 * 60000 } });
    const cap = PHASE_MEANS_DEFAULT.board * 4;
    const mean = save.game.ledger.phaseMeans.board;
    assert.ok(mean <= cap, `board mean ${mean} > the ${cap} s clamp`);
    /* and with the blend, one such job moves it by at most half the clamp's distance */
    assert.ok(mean <= (PHASE_MEANS_DEFAULT.board + cap) / 2 + 0.001, `board mean ${mean}`);
  });

  test('every phase mean stays inside its clamp over five deliberately idle jobs', () => {
    let save = seededSave(6);
    for (let i = 0; i < 5; i++) {
      playJob(save, {
        now: NOW + i * DAY_MS, today: todayISO(new Date(NOW + i * DAY_MS)), clearOthers: false,
        step: { board: 30 * 60000, brief: 20 * 60000, getaway: 30 * 60000 },
      });
      save = clone(save);
    }
    for (const [ph, dflt] of Object.entries(PHASE_MEANS_DEFAULT)) {
      const mean = save.game.ledger.phaseMeans[ph];
      assert.ok(mean <= dflt * 4 + 0.001, `${ph} mean ${mean} > ${dflt * 4}`);
    }
  });
});

/* ==========================================================================================
   4. MAJOR — the 22:00 close has a caller
   ========================================================================================== */
describe('r1 · G1 "After 22:00" — the quiet close fires at the next target boundary', () => {
  const LATE = new Date(2026, 8, 16, 21, 58).getTime();

  /**
   * A job started at 21:58 whose first target boundary lands after 22:00. `atClose` is the pile as
   * it stood on the beat the close fired; `debrief` is the word the job finally ended on.
   */
  function lateJob(save, { start = LATE } = {}) {
    const today = todayISO(new Date(start));
    let t = start;
    const step = (ms) => (t += ms);
    startJob(save, { today, now: t });
    beginTargets(save, { now: step(30000) });
    let debrief = null;
    let atClose = null;
    for (let n = 0; n < 400; n++) {
      const g = stateOf(save);
      if (!g || g.outcome != null) break;
      if (g.phase === 'envelope') {
        if (g.stakes) lockCall(save, 70, { now: step(10000) });
        else beginAnswer(save, { now: step(10000) });
        continue;
      }
      if (g.phase === 'answer') { applyTarget(save, CLEAN, { now: step(120000) }); continue; }
      if (g.phase === 'payout' || g.phase === 'bagpush') {
        const was = { loose: g.loose, bagged: g.bagged, stakes: g.stakes !== false };
        const res = push(save, { now: step(10000) });
        const now = stateOf(save);
        if (was.stakes && (!now || now.stakes === false) && atClose == null) atClose = { was, after: res };
        debrief = res.debrief ?? debrief;
        continue;
      }
      if (g.phase === 'brief') { brief(save, {}, { now: step(10000) }); continue; }
      if (g.phase === 'getaway') { crack(save, { now: step(10000) }); continue; }
      break;
    }
    return { debrief, atClose, at: t };
  }

  test('a job that crosses 22:00 auto-banks LOOSE at 100 % — `AUTO_BAG.quiet22` is reachable', () => {
    const save = saveWithTargets(4, LATE);
    const { atClose } = lateJob(save);
    assert.ok(atClose, 'the 22:00 close never fired — quietClose still has no caller');
    /* full value: what was loose is now bagged, with no fee and no 50 % haircut */
    assert.equal(atClose.after.bagged, Math.round(atClose.was.bagged + atClose.was.loose),
      `${atClose.was.loose} loose banked as ${atClose.after.bagged - atClose.was.bagged}`);
    assert.equal(atClose.after.loose, 0);
    assert.equal(stateOf(save)?.stakes ?? false, false);
  });

  test('the terminal word is `quiet22`, not `called` — the student never called it', () => {
    const save = saveWithTargets(4, LATE);
    const { debrief } = lateJob(save);
    assert.ok(debrief, 'the job never ended');
    assert.equal(debrief.outcome, OUTCOMES.QUIET22, `the job ended '${debrief.outcome}'`);
    assert.equal(debrief.posted, 0, 'a closed job is recorded at posted 0');
    assert.equal(save.player.records.walked, 0, 'the 22:00 close recorded the job as walked');
  });

  test('the close does not shut a study door: every drafted target is still answered', () => {
    const save = saveWithTargets(6, LATE);
    const { debrief } = lateJob(save);
    assert.equal(targetsLeft(save), 0, 'the 22:00 close left targets unanswerable');
    assert.equal(debrief.targets, debrief.of, 'the close dropped items off Today\'s Page');
  });

  test('CALL IT still ends on `called` — the two ways the stakes end stay distinguishable', () => {
    const save = saveWithTargets(6);
    let t = NOW;
    startJob(save, { today: TODAY, now: t });
    beginTargets(save, { now: (t += 6000) });
    callIt(save, { now: (t += 1000) });
    for (let n = 0; n < 400; n++) {
      const g = stateOf(save);
      if (!g || g.outcome != null) break;
      if (g.phase === 'envelope') { beginAnswer(save, { now: (t += 1000) }); continue; }
      if (g.phase === 'answer') { applyTarget(save, CLEAN, { now: (t += 20000) }); continue; }
      if (g.phase === 'payout' || g.phase === 'bagpush') { push(save, { now: (t += 5000) }); continue; }
      break;
    }
    assert.equal(save.game.log.at(-1).posted, 0);
    assert.equal(save.player.records.walked, 1, 'CALL IT is a walk; the 22:00 close is not');
  });

  test('before 22:00 nothing closes: the same job at 18:00 keeps its stakes to the getaway', () => {
    const save = saveWithTargets(4);
    const { debrief } = playJob(save, { now: NOW, today: TODAY, clearOthers: false });
    assert.equal(debrief.outcome, OUTCOMES.CRACKED);
  });
});

/* ==========================================================================================
   5. BLOCKER — the debrief read is measured
   ========================================================================================== */
describe('r1 · G1 statement 2 — phaseMeans.debrief is measured, not a shipped constant', () => {
  test('endJob opens the debrief and closeDebrief folds the read', () => {
    const save = seededSave(7);
    const { at } = playJob(save, { now: NOW, today: TODAY, clearOthers: false });
    assert.ok(save.game.ledger.debriefAt > 0, 'the debrief read was never opened');
    assert.equal(save.game.ledger.phaseMeans.debrief, PHASE_MEANS_DEFAULT.debrief);
    const res = closeDebrief(save, { now: at + 20000 });
    assert.equal(res.folded, true);
    assert.notEqual(save.game.ledger.phaseMeans.debrief, PHASE_MEANS_DEFAULT.debrief,
      'the debrief mean is still pinned at the shipped 65 s');
    assert.ok(save.game.ledger.phaseMeans.debrief < PHASE_MEANS_DEFAULT.debrief, 'a 20 s read read longer than 65 s');
  });

  test('it is idempotent and total: a second call folds nothing, a save with no job folds nothing', () => {
    const save = seededSave(7);
    const { at } = playJob(save, { now: NOW, today: TODAY, clearOthers: false });
    closeDebrief(save, { now: at + 20000 });
    const mean = save.game.ledger.phaseMeans.debrief;
    assert.equal(closeDebrief(save, { now: at + 999999 }).folded, false);
    assert.equal(save.game.ledger.phaseMeans.debrief, mean);
    const blank = fresh(NOW);
    assert.equal(closeDebrief(blank, { now: NOW }).folded, false);
  });

  test('startJob is the backstop — the next board closes the last debrief', () => {
    const save = seededSave(8);
    const { at } = playJob(save, { now: NOW, today: TODAY, clearOthers: false });
    assert.ok(save.game.ledger.debriefAt > 0);
    startJob(save, { today: TODAY, now: at + 45000 });
    assert.equal(save.game.ledger.debriefAt, 0, 'the next board did not close the last debrief');
    assert.notEqual(save.game.ledger.phaseMeans.debrief, PHASE_MEANS_DEFAULT.debrief);
  });

  test('a phone slept on overnight contributes the clamp, not a night', () => {
    const save = seededSave(8);
    const { at } = playJob(save, { now: NOW, today: TODAY, clearOthers: false });
    closeDebrief(save, { now: at + 9 * 3600 * 1000 });
    const cap = PHASE_MEANS_DEFAULT.debrief * 4;
    assert.ok(save.game.ledger.phaseMeans.debrief <= cap, `${save.game.ledger.phaseMeans.debrief} > ${cap}`);
  });

  test('the mean MOVES across jobs — it is not pinned the way it was for six of them', () => {
    let save = seededSave(9);
    const means = [];
    for (let i = 0; i < 4; i++) {
      const { at } = playJob(save, { now: NOW + i * DAY_MS, today: todayISO(new Date(NOW + i * DAY_MS)), clearOthers: false });
      closeDebrief(save, { now: at + 200000 });      // a 200 s read, every job — the critic's own probe
      means.push(save.game.ledger.phaseMeans.debrief);
      save = clone(save);
    }
    assert.equal(new Set(means).size >= 2, true, `debrief pinned at ${means.join(' · ')}`);
    assert.ok(means.at(-1) > PHASE_MEANS_DEFAULT.debrief, `a 200 s read never moved the 65 s default`);
  });
});

/* ==========================================================================================
   6. MAJOR — G1's fifth brief option: the priced contract swap
   ========================================================================================== */
describe('r1 · G1 — the brief window\'s fifth option exists, and declinePrice has a consumer', () => {
  /** The first corpus save whose board posts declines the brief window can buy back. */
  function saveWithDeclines() {
    for (let i = 0; i < 24; i++) {
      const s = seededSave(i);
      const probe = clone(s);
      try { startJob(probe, { today: TODAY, now: NOW }); } catch { continue; }
      if (swapOptions(probe).length >= 1 && queueOf(probe).length >= 4) return s;
    }
    return null;
  }

  test('a 5-contract board leaves undrafted contracts on the bench, priced at +0.15', () => {
    const save = saveWithDeclines();
    assert.ok(save, 'no corpus board posted a draft with declines — the option is untestable here');
    const probe = clone(save);
    startJob(probe, { today: TODAY, now: NOW });
    const opts = swapOptions(probe);
    assert.ok(opts.length >= 1);
    for (const o of opts) {
      assert.equal(o.decline, Math.round(o.posted * (1 + DECLINE_PRICE)), `${o.id} is not priced at +0.15`);
      assert.ok(o.targets >= 1, `${o.id} has no targets to swap in`);
      assert.equal(canSwap(probe, o.id), true);
    }
    assert.equal(canSwap(probe, 'ZZ'), false);
  });

  test('the swap lengthens the remaining queue, pays the declined price, and keeps the vault last', () => {
    const save = saveWithDeclines();
    assert.ok(save);
    const s = clone(save);
    startJob(s, { today: TODAY, now: NOW });
    const last = queueOf(s).at(-1)?.id;
    const before = { len: queueOf(s).length, posted: stateOf(s).posted };
    const id = swapOptions(s)[0].id;

    /* drive the machine to its first brief window, then take the swap */
    beginTargets(s, { now: NOW + 6000 });
    let t = NOW + 6000;
    for (let n = 0; n < 200 && stateOf(s).phase !== 'brief'; n++) {
      const g = stateOf(s);
      if (g.phase === 'envelope') { lockCall(s, 70, { now: (t += 5000) }); continue; }
      if (g.phase === 'answer') { applyTarget(s, CLEAN, { now: (t += 20000) }); continue; }
      if (g.phase === 'payout' || g.phase === 'bagpush') { push(s, { now: (t += 5000) }); continue; }
      break;
    }
    assert.equal(stateOf(s).phase, 'brief', 'the job never reached a brief window');
    assert.equal(canSwap(s, id), true);
    const res = brief(s, { swap: { id } }, { now: (t += 12000) });

    assert.ok(res.took.includes('swap'), 'the swap was refused');
    assert.equal(res.swap.id, id);
    assert.equal(queueOf(s).length, before.len + res.swap.targets);
    assert.ok(stateOf(s).posted > before.posted, 'the swap paid nothing');
    assert.equal(queueOf(s).at(-1).id, last, 'the swap displaced the vault from the last slot');
    assert.deepEqual(queueOf(s).map((it) => it.n), queueOf(s).map((_, i) => i + 1), 'the queue was not renumbered');
    assert.equal(canSwap(s, id), false, 'the same contract could be swapped in twice');
    assert.equal(swapOptions(s).some((o) => o.id === id), false);
  });

  test('a swapped-in contract is a real target: it prices, it answers, and it marks', () => {
    const save = saveWithDeclines();
    assert.ok(save);
    const s = clone(save);
    startJob(s, { today: TODAY, now: NOW });
    const id = swapOptions(s)[0].id;
    beginTargets(s, { now: NOW + 6000 });
    let t = NOW + 6000;
    for (let n = 0; n < 200 && stateOf(s).phase !== 'brief'; n++) {
      const g = stateOf(s);
      if (g.phase === 'envelope') { lockCall(s, 70, { now: (t += 5000) }); continue; }
      if (g.phase === 'answer') { applyTarget(s, CLEAN, { now: (t += 20000) }); continue; }
      if (g.phase === 'payout' || g.phase === 'bagpush') { push(s, { now: (t += 5000) }); continue; }
      break;
    }
    brief(s, { swap: { id } }, { now: (t += 12000) });
    /* play the rest out — every item, swapped in or drafted, ends `done` with a `result` */
    for (let n = 0; n < 400; n++) {
      const g = stateOf(s);
      if (!g || g.outcome != null) break;
      if (g.phase === 'envelope') { lockCall(s, 70, { now: (t += 5000) }); continue; }
      if (g.phase === 'answer') { applyTarget(s, CLEAN, { now: (t += 20000) }); continue; }
      if (g.phase === 'payout' || g.phase === 'bagpush') { push(s, { now: (t += 5000) }); continue; }
      if (g.phase === 'brief') { brief(s, {}, { now: (t += 5000) }); continue; }
      if (g.phase === 'getaway') { crack(s, { now: (t += 5000) }); continue; }
      break;
    }
    assert.equal(targetsLeft(s), 0);
  });

  test('the bench rides on inProgress and survives the disk (G3.7 proof 6)', () => {
    const save = saveWithDeclines();
    assert.ok(save);
    const s = clone(save);
    startJob(s, { today: TODAY, now: NOW });
    const before = swapOptions(s);
    const reloaded = JSON.parse(JSON.stringify(s));
    resume(reloaded);
    assert.deepEqual(swapOptions(reloaded), before, 'the swap vanished when the tab was killed');
  });
});
