// tests/job-state-r2.test.mjs — round-2 fixes to `site/js/job/state.js`.
//
// Same shape as the r1 suite: every test plays the REAL state machine and asserts the app's
// behaviour, never a direct unit call to the predicate under repair. The four defects:
//
//   1. The Backcheck's vault gate was off BY ONE. `canBackcheck` asked `isVaultTarget`, which reads
//      the POINTER — and `applyTarget` has already run `markItem` by then, so the pointer describes
//      the NEXT target. The Backcheck was refused on the target before the vault and ALLOWED on the
//      vault itself: the one beat G2's rule exists to leave unshielded.
//   2. `startJob` bailed only on an existing `inProgress.game`, so a live, half-answered PLAIN
//      Today's Page fell through and was overwritten — items removed from the schedule by a game
//      decision (COMPOSED global rule 5), with no `finishPage()` and no way back to a seeded Variant.
//   3. The clean-VAULT Backcheck mint fired on every cleanly finished job, including a RUN and an
//      ordinary JOB, whose shape carries no vault at all — G2's only scarce, dues-free source paid
//      out for finishing any evening.
//   4. A bound COMMIT never cleared `commit.bound`, so one tap added a COMMIT decision to the
//      debrief of every LATER job for the life of the save; and the binding itself had no trigger
//      inside the state machine, only a screen's timer.
//
// Plus the re-quote (`etaOf`): the board quotes the job's minutes once and the queue then grows.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  OUTCOMES, JobStateError, startJob, beginTargets, beginAnswer, lockCall, applyTarget, push, brief,
  crack, commitBind, canBackcheck, etaOf, pageInProgress, lastWasVault,
  queueOf, idxOf, targetsLeft, answered, currentItem, stateOf,
} from '../site/js/job/state.js';
import { SHAPES } from '../site/data/job.js';
import { startPage, markItem, resumePage } from '../site/js/page.js';
import { fresh } from '../site/js/store.js';
import { applyOutcome, DAY_MS } from '../site/js/schedule.js';
import { rngFrom } from '../site/js/rng.js';
import { todayISO, addDays } from '../site/js/days.js';
import { cards as ALL_CARDS } from '../site/data/cards.js';
import { isBonus } from '../site/data/source-manifest.js';

/* 18:00 on a Wednesday — well clear of the 22:00 close, which has its own suite in r1. */
const NOW = new Date(2026, 8, 16, 18, 0).getTime();
const TODAY = todayISO(new Date(NOW));
const BANK = ALL_CARDS.filter((c) => !isBonus(c.id));
const clone = (x) => structuredClone(x);
const num = (x) => (Number.isFinite(+x) ? +x : 0);

const CLEAN = { cleared: true, firstTry: true, hints: 0, attempt: 1, clean: true };
const MISS = { cleared: false, solutionShown: true, reason: 'third-wrong', attempt: 3, hints: 0 };

/** A save with real Leitner records, real history and a real due pile (the r1 corpus, verbatim). */
function seededSave(i, now = NOW) {
  const rng = rngFrom('job-state-r1', i);
  const s = fresh(now - (4 + rng.int(0, 20)) * DAY_MS);
  s.profileId = `r2-${i}`;
  s.settings.testDate = addDays(todayISO(new Date(now)), 6 + rng.int(0, 10));
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
  return s;
}

/**
 * One whole job through the real machine. `plan(n, save)` picks the result for target `n`; `beat`
 * is called at every payout with the beat's own facts, which is where the Backcheck gate is read.
 */
function playJob(save, { now = NOW, plan = () => CLEAN, beat = null, shape = null, held = 0, step: ms = {} } = {}) {
  let t = now;
  const step = (n) => (t += n);
  startJob(save, { today: TODAY, now: t, ...(shape ? { shape } : {}) });
  if (held > 0) save.game.backchecks = { held, mintedDay: null };
  beginTargets(save, { now: step(ms.board ?? 6000) });
  let debrief = null;
  for (let i = 0; i < 400; i++) {
    const g = stateOf(save);
    if (!g || g.outcome != null) break;
    if (g.phase === 'envelope') {
      if (g.stakes) lockCall(save, 70, { now: step(5000) });
      else beginAnswer(save, { now: step(1000) });
      continue;
    }
    if (g.phase === 'answer') {
      const n = answered(save) + 1;
      const out = applyTarget(save, plan(n, save), { now: step(ms.answer ?? 40000) });
      debrief = out.debrief ?? debrief;
      if (beat) {
        beat({
          n, d: num(stateOf(save)?.last?.d), leftAfter: targetsLeft(save),
          canBackcheck: canBackcheck(save), lastWasVault: lastWasVault(save),
          backcheckable: out.backcheckable === true,
          /* an INDEPENDENT read of "this was not the last target when it was answered": something
             still ahead that `requeueReview` did not splice in behind it on this very beat */
          freshAhead: queueOf(save).slice(idxOf(save)).some((it) => !(num(it?.requeued) > 0)),
        });
      }
      continue;
    }
    if (g.phase === 'payout' || g.phase === 'bagpush') { debrief = push(save, { now: step(ms.push ?? 9000) }).debrief ?? debrief; continue; }
    if (g.phase === 'brief') { brief(save, {}, { now: step(ms.brief ?? 20000) }); continue; }
    if (g.phase === 'getaway') { crack(save, { now: step(ms.getaway ?? 25000) }); continue; }
    break;
  }
  return { debrief, at: t };
}

/* ==========================================================================================
   1. MAJOR — the Backcheck's vault gate was off by one, in the permissive direction
   ========================================================================================== */
describe('r2 · G2 "Not available on the vault itself" — the gate reads the ANSWERED target', () => {
  /* The miss is taken on the last two targets, so both verdicts are observed in one run: the beat
     before the vault (which must ALLOW a Backcheck) and the vault (which must refuse it). */
  const missNearTheEnd = (n, sv) => (targetsLeft(sv) <= 3 ? MISS : CLEAN);

  test('the vault refuses the Backcheck and the target before it does not — the two were swapped', () => {
    const beats = [];
    const save = seededSave(2);
    playJob(save, { plan: missNearTheEnd, beat: (b) => beats.push(b), held: 3 });

    const vault = beats.filter((b) => b.leftAfter === 0);
    assert.equal(vault.length, 1, 'the job did not reach its last target');
    assert.ok(vault[0].d < 0, 'the vault miss cost nothing — nothing for a Backcheck to shield');
    assert.equal(vault[0].canBackcheck, false, 'a Backcheck was allowed ON the vault (G2, data/job.js allowedOnVault: false)');
    assert.equal(vault[0].backcheckable, false, "and applyTarget's own `backcheckable` said the same");
    assert.equal(vault[0].lastWasVault, true);

    const ordinary = beats.filter((b) => b.freshAhead && b.d < 0);
    assert.ok(ordinary.length > 0, 'no ordinary miss in this run — the case is untested');
    for (const b of ordinary) {
      assert.equal(b.canBackcheck, true, `target ${b.n} (${b.leftAfter} left) refused a Backcheck and is NOT the vault`);
      assert.equal(b.lastWasVault, false);
    }
  });

  test('every miss that cost something is shieldable EXCEPT the vault, across the corpus', () => {
    let vaults = 0;
    let ordinary = 0;
    for (let i = 0; i < 8; i++) {
      const save = seededSave(i);
      const beats = [];
      /* the pile has to be worth taking, so the run is CLEAN until the tail: a job that misses
         everything floors at LOOSE 0 and every `d` is 0, which is nothing to shield either way */
      try { playJob(save, { plan: missNearTheEnd, beat: (b) => beats.push(b), held: 3 }); }
      catch { continue; }                     // an empty board for this seed — try the next
      for (const b of beats) {
        if (!(b.d < 0)) continue;
        /* a VAULT beat is one with nothing ahead of it that the same beat did not splice in — the
           pointer's own `leftAfter === 0`, and the missed review whose retry copy landed behind it */
        if (!b.freshAhead) { vaults++; assert.equal(b.canBackcheck, false, `seed ${i}: the vault (target ${b.n}) was shieldable`); }
        else { ordinary++; assert.equal(b.canBackcheck, true, `seed ${i}: target ${b.n} was refused with ${b.leftAfter} left`); }
      }
    }
    assert.ok(vaults >= 3, `only ${vaults} vault beats observed`);
    assert.ok(ordinary >= 10, `only ${ordinary} ordinary beats observed`);
  });
});

/* ==========================================================================================
   2. MAJOR — startJob may not overwrite a live Today's Page (COMPOSED global rule 5)
   ========================================================================================== */
describe('r2 · global rule 5 — a live plain page is not a blank slate', () => {
  function halfAnsweredPage(i = 3) {
    const save = seededSave(i);
    startPage(save, { today: TODAY, now: NOW });
    for (let k = 0; k < 4; k++) markItem(save, { cleared: true }, {});
    return save;
  }

  test('startJob REFUSES over a half-answered page, and not one item leaves the schedule', () => {
    const save = halfAnsweredPage();
    const before = resumePage(save).queue.slice(resumePage(save).idx).map((it) => it.id);
    const idx0 = resumePage(save).idx;
    assert.ok(before.length > 0, 'the fixture page has nothing left to lose');

    assert.throws(() => startJob(save, { today: TODAY, now: NOW }), JobStateError, 'startJob wrote over a live page');
    try { startJob(save, { today: TODAY, now: NOW }); } catch (e) { assert.equal(e.code, 'page-in-progress'); }

    const ip = resumePage(save);
    assert.equal(ip.idx, idx0, 'the pointer moved');
    assert.equal(ip.game ?? null, null, 'a job record was written onto the page anyway');
    const still = new Set(ip.queue.map((it) => it.id));
    const lost = before.filter((id) => !still.has(id));
    assert.deepEqual(lost, [], `items removed from the schedule by a game decision: ${lost.join(' ')}`);
    assert.equal(save.counters?.pages ?? 0, 0, 'the abandoned page was counted as finished');
  });

  test('`pageInProgress` names the same page the refusal names, and clears when the page is done', () => {
    const save = halfAnsweredPage();
    const live = pageInProgress(save);
    assert.ok(live, 'a live half-answered page is not reported');
    assert.equal(live.left, live.queue.length - live.idx);
    while (resumePage(save).idx < resumePage(save).queue.length) markItem(save, { cleared: true }, {});
    assert.equal(pageInProgress(save), null, 'a fully answered page still blocks the board');
  });

  test('`force` is the deliberate override, and a save with no page is untouched by any of this', () => {
    const save = halfAnsweredPage();
    const g = startJob(save, { today: TODAY, now: NOW, force: true });
    assert.ok(g, 'force did not start the job');
    assert.ok(resumePage(save).game, 'force started a job with no record');

    const clean = seededSave(4);
    assert.equal(pageInProgress(clean), null);
    assert.ok(startJob(clean, { today: TODAY, now: NOW }), 'a save with no live page was refused a board');
  });
});

/* ==========================================================================================
   3. MAJOR — the clean-VAULT mint needs a shape that actually carries a vault
   ========================================================================================== */
describe('r2 · G2 — the free Backcheck is paid by a VAULT, not by finishing any job', () => {
  for (const shape of ['RUN', 'JOB', 'JOB12']) {
    test(`a clean ${shape} (SHAPES.${shape}.vault === false) mints no VAULT Backcheck`, () => {
      assert.equal(SHAPES[shape].vault, false, 'this shape carries a vault — the test is wrong');
      const save = seededSave(2);
      save.game = { ...(save.game ?? {}), backchecks: { held: 0, mintedDay: null } };
      const { debrief } = playJob(save, { shape, plan: () => CLEAN });
      assert.equal(stateOf(save) ?? null, null);
      assert.equal(debrief.minted.source === 'vault', false,
        `a ${shape} with g.vault = null paid G2's clean-vault mint`);
    });
  }

  test('a VAULT shape still mints it — the source is the boss the board named, not the word', () => {
    const save = seededSave(2);
    save.game = { ...(save.game ?? {}), backchecks: { held: 0, mintedDay: null } };
    let vaultId = null;
    const { debrief } = playJob(save, {
      shape: 'VAULT', plan: (n, sv) => { vaultId = vaultId ?? stateOf(sv).vault; return CLEAN; },
    });
    assert.equal(SHAPES.VAULT.vault, true);
    assert.ok(vaultId, 'this seed posts a VAULT with no vault card — the mint case is untested');
    assert.equal(debrief.minted.source, 'vault');
    assert.equal(save.game.backchecks.held, 1);
  });
});

/* ==========================================================================================
   4. MAJOR — a bound COMMIT dies with its own job, and binds without a screen
   ========================================================================================== */
describe('r2 · G3.9 — the declaration binds to ONE job', () => {
  test('`commit.bound` is cleared when the job ends, so later jobs do not count a decision they never had', () => {
    const save = seededSave(2);
    let t = NOW;
    startJob(save, { today: TODAY, now: t });
    /* a minute this job cannot reach: "a declaration that is never reached simply never fires" */
    commitBind(save, { kind: 'doneBy', byMin: 23 * 60 + 55 });
    assert.equal(save.game.commit.bound, true);
    beginTargets(save, { now: (t += 6000) });
    let first = null;
    for (let i = 0; i < 400; i++) {
      const g = stateOf(save);
      if (!g || g.outcome != null) break;
      if (g.phase === 'envelope') { lockCall(save, 70, { now: (t += 5000) }); continue; }
      if (g.phase === 'answer') { first = applyTarget(save, CLEAN, { now: (t += 40000) }).debrief ?? first; continue; }
      if (g.phase === 'payout' || g.phase === 'bagpush') { first = push(save, { now: (t += 9000) }).debrief ?? first; continue; }
      if (g.phase === 'brief') { brief(save, {}, { now: (t += 20000) }); continue; }
      if (g.phase === 'getaway') { crack(save, { now: (t += 25000) }); continue; }
      break;
    }
    assert.ok(first, 'the first job did not end');
    assert.equal(first.committed, true, 'the job the declaration was made on must count it');
    assert.equal(save.game.commit.bound, false, 'the declaration outlived its own job');
    assert.equal(save.game.commit.honored, 0, 'a declaration that never came due was recorded as honoured');

    const second = playJob(save, { now: t + 60000, plan: () => CLEAN }).debrief;
    assert.ok(second, 'the second job did not end');
    assert.equal(second.committed, false, 'one tap inflated a later job\'s decision count');
    assert.equal(second.decisions, 2 + second.calls.length + Math.max(0, second.calls.length - 1)
      + second.briefs.length + 1 + second.backchecks,
    'the decision count carries a COMMIT the job never had');
  });

  test('a bound declaration fires at the next TARGET BOUNDARY with no screen and no timer', () => {
    const save = seededSave(2);
    let t = NOW;
    startJob(save, { today: TODAY, now: t, shape: 'JOB' });
    commitBind(save, { kind: 'walk', byMin: 4 });        // +4 minutes, crossed a few targets in
    const { debrief } = (() => {
      beginTargets(save, { now: (t += 6000) });
      let d = null;
      for (let i = 0; i < 400; i++) {
        const g = stateOf(save);
        if (!g || g.outcome != null) break;
        if (g.phase === 'envelope') { lockCall(save, 70, { now: (t += 5000) }); continue; }
        if (g.phase === 'answer') { d = applyTarget(save, CLEAN, { now: (t += 40000) }).debrief ?? d; continue; }
        if (g.phase === 'payout' || g.phase === 'bagpush') { d = push(save, { now: (t += 9000) }).debrief ?? d; continue; }
        if (g.phase === 'brief') { brief(save, {}, { now: (t += 20000) }); continue; }
        if (g.phase === 'getaway') { crack(save, { now: (t += 25000) }); continue; }
        break;
      }
      return { debrief: d };
    })();
    assert.ok(debrief, 'the declared minute passed and the job ran on');
    assert.equal(debrief.outcome, OUTCOMES.COMMIT);
    assert.ok(debrief.left > 0, 'the fixture answered every target — the binding is untested');
    assert.equal(save.game.commit.honored, 1);
    assert.equal(save.game.commit.bound, false);
    /* the rest goes back to Today's Page, unremoved (G3.9, global rule 5) */
    assert.ok(resumePage(save), 'the rest of the page was destroyed');
    assert.equal(resumePage(save).game ?? null, null);
  });
});

/* ==========================================================================================
   5. MAJOR — the re-quote: a 15-minute job may not silently become a 25-minute job
   ========================================================================================== */
describe('r2 · G1 "telling the truth about time is mechanically necessary" — etaOf re-prices', () => {
  test('the queue grows, and the quote grows with it', () => {
    const save = seededSave(2);
    let t = NOW;
    startJob(save, { today: TODAY, now: t, shape: 'JOB' });
    const drafted = queueOf(save).length;
    const at0 = etaOf(save, { now: t });
    assert.equal(at0.of, drafted);
    assert.equal(at0.grew, false);
    assert.equal(at0.source, 'shipped', 'there is nothing measured yet to quote from');
    assert.ok(at0.minutesLeft > 0 && at0.endsAt > t);

    beginTargets(save, { now: (t += 6000) });
    const quotes = [];
    for (let i = 0; i < 400; i++) {
      const g = stateOf(save);
      if (!g || g.outcome != null) break;
      if (g.phase === 'envelope') { lockCall(save, 70, { now: (t += 5000) }); continue; }
      if (g.phase === 'answer') {
        const it = currentItem(save);
        const miss = !!(it?.isReview || it?.isRematch) && !it.requeued;
        applyTarget(save, miss ? MISS : CLEAN, { now: (t += 55000) });
        quotes.push({ ...etaOf(save, { now: t }) });
        continue;
      }
      if (g.phase === 'payout' || g.phase === 'bagpush') { push(save, { now: (t += 9000) }); continue; }
      if (g.phase === 'brief') { brief(save, {}, { now: (t += 20000) }); continue; }
      if (g.phase === 'getaway') { crack(save, { now: (t += 25000) }); continue; }
      break;
    }
    const grown = quotes.filter((q) => q.of > drafted);
    assert.ok(grown.length > 0, 'this seed never re-queued a review — the growth case is untested');
    for (const q of grown) {
      assert.equal(q.grew, true, 'the queue grew past the drafted shape and the quote did not say so');
      assert.equal(q.source, 'measured', 'the re-quote fell back to the shipped row after real targets');
    }
    /* the quote is the job's OWN clock: more targets left than the shape was quoted at, and a later
       end time than the draft's */
    const widest = grown.reduce((a, b) => (b.of > a.of ? b : a));
    assert.ok(widest.of > at0.of, `queue ${at0.of} → ${widest.of}`);
    assert.ok(widest.endsAt > at0.endsAt, 'the end time never moved while the job got longer');
    assert.equal(quotes.at(-1).left, 0);
    assert.equal(quotes.at(-1).secondsLeft, 0, 'a finished job still quotes time left');
  });

  test('minutes left falls monotonically once the queue stops growing', () => {
    const save = seededSave(2);
    let t = NOW;
    startJob(save, { today: TODAY, now: t, shape: 'RUN' });
    beginTargets(save, { now: (t += 6000) });
    const seen = [];
    for (let i = 0; i < 400; i++) {
      const g = stateOf(save);
      if (!g || g.outcome != null) break;
      if (g.phase === 'envelope') { lockCall(save, 70, { now: (t += 5000) }); continue; }
      if (g.phase === 'answer') { applyTarget(save, CLEAN, { now: (t += 40000) }); seen.push(etaOf(save, { now: t })); continue; }
      if (g.phase === 'payout' || g.phase === 'bagpush') { push(save, { now: (t += 9000) }); continue; }
      if (g.phase === 'brief') { brief(save, {}, { now: (t += 20000) }); continue; }
      if (g.phase === 'getaway') { crack(save, { now: (t += 25000) }); continue; }
      break;
    }
    const flat = seen.filter((q, i) => i > 0 && q.of === seen[i - 1].of);
    assert.ok(flat.length >= 2, 'no two consecutive beats at a steady queue length');
    for (let i = 1; i < seen.length; i++) {
      if (seen[i].of !== seen[i - 1].of) continue;
      assert.ok(seen[i].secondsLeft <= seen[i - 1].secondsLeft,
        `seconds left rose from ${seen[i - 1].secondsLeft} to ${seen[i].secondsLeft} with the queue unchanged`);
    }
  });
});

/* a guard on the corpus itself: these tests are worthless if the seed stops posting a job */
test('r2 · the corpus save still posts a multi-target job', () => {
  const s = clone(seededSave(2));
  startJob(s, { today: TODAY, now: NOW, shape: 'JOB' });
  assert.ok(queueOf(s).length >= 4, `only ${queueOf(s).length} targets`);
  assert.equal(idxOf(s), 0);
});
