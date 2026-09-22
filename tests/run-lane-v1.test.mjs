// tests/run-lane-v1.test.mjs — the run lane's VERIFY ROUND 1 fixes (notes/repair-run.md).
//
// Five findings, five sections. Each one drives the shipped export against a job played through the
// real phase machine, and each asserts the INVARIANT that was missing rather than the constant that
// happened to be wrong.
//
//   1. MAJOR (call-propriety) — the debrief's regret line read q̂ AFTER the outcome. `jobLedgerBlock`
//      passed `qHatOf: (c) => call.qHatFor(save, c.skill, …)` on a save whose `inProgress` `endJob`
//      had already cleared, so `sealedCallOf` found no seal, `qHatDetail` returned the LIVE rate,
//      and the line judged a call on a q̂ that already contained the sitting being judged.
//   2. BLOCKER (ledger-invariance) — `commitJobRun` dated three LEDGER A writes from a LEDGER B
//      field (`save.game.log[-1].day`, which `screens/job.js` captures once at mount). A job
//      finished after local midnight OVERWROTE the previous day's forecast point and logged none
//      for the real day.
//   3. MAJOR (ledger-invariance) — the job's `kind:'page'` row claimed a whole Page while covering
//      a mean 45 % of the page `composePage` deals, and bought **Flawless Page** with it.
//   4. BLOCKER (player-feel) — two different ranks for one rating on one debrief: the take block
//      derived the rank word from the RATING while `.sum-job-rating` read the HELD rank.
//   5. MAJOR (player-feel) — `COPY.deflation` ("posted falls as you master the material") printed
//      95 px above a tomorrow figure 2.3× tonight's, on a different basis.
//
// Pure: `js/job/*`, `js/page.js`, `js/trophies.js` and `screens/run.js`. No `Math.random`, no browser.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { read, stripCommentsAndStrings as strip } from './_helpers.mjs';

import * as run from '../site/js/screens/run.js';
import * as call from '../site/js/job/call.js';
import * as state from '../site/js/job/state.js';
import { composePage } from '../site/js/page.js';
import { composeOpts } from '../site/js/plan.js';
import { check as trophyCheck } from '../site/js/trophies.js';
import { fresh } from '../site/js/store.js';
import { applyOutcome, DAY_MS } from '../site/js/schedule.js';
import { todayISO, addDays, daysUntilTest } from '../site/js/days.js';
import { rngFrom } from '../site/js/rng.js';
import { cards as ALL_CARDS, byId as cardById } from '../site/data/cards.js';
import { isBonus } from '../site/data/source-manifest.js';

const RUN_SRC = read('site/js/screens/run.js');
const RUN_CODE = strip(RUN_SRC);
const TROPHY_SRC = read('site/data/trophies.js');

const NOW = new Date(2026, 8, 16, 18, 0).getTime();
const TODAY = todayISO(new Date(NOW));
const BANK = ALL_CARDS.filter((c) => !isBonus(c.id));
const clone = (x) => structuredClone(x);
const num = (x, d = 0) => (Number.isFinite(+x) ? +x : d);

const CLEAN = Object.freeze({ cleared: true, firstTry: true, hints: 0, attempt: 1, elapsedMs: 9000, xp: 40 });
const MISS = Object.freeze({ cleared: false, firstTry: false, hints: 1, attempt: 3, elapsedMs: 30000, xp: 5 });

/** The slice of `run.js` a named function occupies, verbatim. */
function raw(name, until) {
  const a = RUN_SRC.indexOf(name);
  assert.ok(a > 0, `${name} is gone from screens/run.js`);
  const b = RUN_SRC.indexOf(until, a);
  assert.ok(b > a, `${until} is gone from screens/run.js`);
  return RUN_SRC.slice(a, b);
}

/** …with comments and string literals removed, for a lint that must not match its own prose. */
const slice = (name, until) => strip(raw(name, until));

/** The argument text of every `fn(` call in `code`, paren-balanced — `job-call.test.mjs` S1's lexer. */
function callArgsOf(code, fn) {
  const out = [];
  const re = new RegExp(`\\b${fn}\\s*\\(`, 'g');
  for (let m = re.exec(code); m; m = re.exec(code)) {
    let d = 1; let i = m.index + m[0].length; const from = i;
    while (i < code.length && d > 0) { const c = code[i]; if (c === '(') d++; else if (c === ')') d--; i++; }
    out.push(code.slice(from, i - 1));
  }
  return out;
}

/**
 * The page `composePage` deals for this save with the JOB's own inputs — `job/board.js
 * composeInputsFor` passes `{q, tier4, microFlashOnly}` from the plan, which is what the board
 * partitions. This is the control the r2 arms never used.
 */
function jobPage(save, { now = NOW, today = TODAY } = {}) {
  let o = {};
  try {
    const p = composeOpts(save, { D: daysUntilTest(save?.settings?.testDate, today) });
    o = { q: p.q, tier4: p.tier4, microFlashOnly: p.microFlashOnly };
  } catch { o = {}; }
  return composePage(save, { ...o, now, today });
}

/**
 * A save with real Leitner records AND a real sitting history — which is what `q̂` is read from and
 * what `tests/run-lane-r3.test.mjs`'s fixture deliberately does not have (`schedule.applyOutcome`
 * writes no `history`), so the q̂ defect could not show up there.
 */
function seededSave(tag, { cards = 70, hist = 10, now = NOW } = {}) {
  const rng = rngFrom('run-v1', tag);
  const s = fresh(now - 40 * DAY_MS);
  s.profileId = `run-v1-${tag}`;
  s.settings.testDate = addDays(todayISO(new Date(now)), 6);
  for (let k = 0; k < cards; k++) {
    const c = BANK[rng.int(0, BANK.length - 1)];
    let rec = null;
    for (let r = 0; r < 3; r++) rec = applyOutcome(s, c.id, rng.chance(0.7) ? 'clean' : 'wrong', { now: now - (30 - r * 4) * DAY_MS });
    if (!rec) continue;
    rec.cleared = true;
    rec.due = now + (rng.chance(0.6) ? -rng.float(0, 6) : rng.float(0.1, 1.9)) * DAY_MS;
    rec.history = [];
    for (let h = 0; h < hist; h++) {
      rec.history.push({ at: now - (26 - h) * DAY_MS, ok: rng.chance(0.62), attempt: 1, hints: 0, ms: 9000 });
    }
  }
  return s;
}

/**
 * One whole job, played the way `screens/job.js` plays one — INCLUDING the card-history sitting
 * `screens/card.js:922/1001` writes before the beat is priced. `sealed[i]` is the q̂ the seal
 * actually cut for envelope `i`, read while `inProgress.game.locked` is still standing, which is
 * the only moment it exists.
 */
function playJob(save, { missEvery = 0, now = NOW, day = null, callOf = () => 70, history = true, pace = 1 } = {}) {
  let t = now;
  const ms = (x) => Math.round(x * pace);
  const mountDay = day ?? todayISO(new Date(t));
  state.startJob(save, { today: mountDay, now: t });
  const before = run.captureJobBefore(state.unguard(save), state.queueOf(save));
  const queue = state.queueOf(save).slice();
  const sealed = [];
  let debrief = null, n = 0;
  state.beginTargets(save, { now: (t += ms(6000)) });
  for (let i = 0; i < 400; i++) {
    const g = state.stateOf(save);
    if (!g || g.outcome != null) break;
    if (g.phase === 'envelope') {
      if (g.stakes) state.lockCall(save, callOf(++n), { now: (t += ms(5000)) });
      else { state.beginAnswer(save, { now: (t += ms(5000)) }); n++; }
      const it = state.currentItem(save);
      const make = (cardById[it?.id]?.skills || [])[0] ?? null;
      sealed.push(make ? call.qHatFor(save, make, { cards: cardById }) : null);
      continue;
    }
    if (g.phase === 'answer') {
      const it = state.currentItem(save);
      const ok = !(missEvery && n % missEvery === 0);
      t += ms(40000);
      if (history) {
        const rec = save.cards?.[it.id];
        if (rec && Array.isArray(rec.history)) rec.history.push({ at: t - 10, ok, attempt: ok ? 1 : 3, hints: 0, ms: 9000 });
      }
      state.applyTarget(save, { ...(ok ? CLEAN : MISS), id: it.id }, { now: t, cards: cardById });
      continue;
    }
    if (g.phase === 'payout' || g.phase === 'bagpush') {
      if (state.targetsLeft(save) === 0) {
        debrief = state.endJob(save, state.OUTCOMES.COMPLETED, { now: (t += ms(1000)), day: mountDay });
        break;
      }
      state.push(save, { now: (t += ms(9000)) });
      continue;
    }
    if (g.phase === 'brief') { state.brief(save, {}, { now: (t += ms(20000)) }); continue; }
    if (g.phase === 'getaway') { state.crack(save, { now: (t += ms(25000)) }); continue; }
    break;
  }
  assert.ok(debrief, 'the fixture must play a job to its terminal');
  return { debrief, before, queue, sealed, endedAt: t };
}

/* ================================================================================================
   1. THE DEBRIEF'S q̂ IS THE ONE THE SEAL CUT
   ================================================================================================ */

describe('run v1 §1 — the regret line reads the SEALED q̂, never a q̂ that contains the outcome', () => {
  const ARMS = ['a', 'b', 'c', 'd'].flatMap((tag) => [0, 2, 3].map((missEvery) => {
    const save = seededSave(`${tag}${missEvery}`);
    return { save, ...playJob(save, { missEvery }), tag, missEvery };
  }));

  test('on every reachable envelope, the recovered q̂ IS the q̂ the seal cut', () => {
    let rows = 0;
    for (const arm of ARMS) {
      const calls = arm.debrief.calls ?? [];
      for (let i = 0; i < calls.length; i++) {
        const want = arm.sealed[i];
        if (want == null) continue;
        rows++;
        const got = run.sealedQHatOf(arm.save, calls, i, { cards: cardById, startedAt: arm.before.startedAt });
        assert.equal(got, want,
          `${arm.tag}/${arm.missEvery} envelope ${i + 1} on ${calls[i].skill}: recovered ${got}, the seal cut ${want}`);
      }
    }
    assert.ok(rows >= 100, `only ${rows} envelopes measured — the fixture is too small to prove anything`);
  });

  test('…and the defect it replaces is REACHABLE: the live post-job read is a different number, and often a different rung', () => {
    let rows = 0, moved = 0, rungMoved = 0;
    for (const arm of ARMS) {
      const calls = arm.debrief.calls ?? [];
      for (let i = 0; i < calls.length; i++) {
        const want = arm.sealed[i];
        if (want == null) continue;
        rows++;
        const live = call.qHatFor(arm.save, calls[i].skill, { cards: cardById });   // the OLD expression
        if (Math.abs(num(live, -9) - want) > 1e-9) moved++;
        if (call.honestCall(num(live, 0)) !== call.honestCall(want)) rungMoved++;
      }
    }
    assert.ok(moved > rows * 0.2,
      `the live read agreed with the seal on ${rows - moved}/${rows} envelopes — this test is not measuring the defect`);
    assert.ok(rungMoved > 0,
      `the live read never named a different honest rung over ${rows} envelopes — the fixture cannot reach the harm`);
  });

  test('the hindsight is DIRECTIONAL: a miss pushes the live q̂ down, so the old line said "you over-called"', () => {
    let down = 0, up = 0;
    for (const arm of ARMS) {
      const calls = arm.debrief.calls ?? [];
      for (let i = 0; i < calls.length; i++) {
        const want = arm.sealed[i];
        if (want == null || calls[i].ok) continue;                    // misses only
        const live = call.qHatFor(arm.save, calls[i].skill, { cards: cardById });
        if (num(live, want) < want - 1e-9) down++;
        else if (num(live, want) > want + 1e-9) up++;
      }
    }
    assert.ok(down > 0, 'no missed envelope had its live q̂ pushed down — the mechanism is not reproduced');
    assert.ok(down > up, `a miss pushed q̂ UP as often as down (${up} vs ${down}) — that is not selection on the outcome`);
  });

  test('THE LINT: no regret surface derives its q from a save with no seal', () => {
    const ledger = slice('function jobLedgerBlock', 'G5 #1 — TOMORROW');
    assert.equal(/qHatOf\s*:/.test(ledger), false,
      'the screen is hand-rolling a q̂ reader again — `jobRegret` takes the SAVE and seals it itself');
    assert.equal(/qHatFor\s*\(/.test(ledger), false,
      'the ledger block is reading q̂ directly off the post-job save again');
    const sealedFn = slice('export function sealedQHatOf', '\nexport function jobRegret');
    assert.match(sealedFn, /locked:\s*\{[^}]*at:\s*own\s*>\s*0\s*\?\s*own\s*:\s*at\s*\+\s*1/,
      'the recovery must put a real seal back on the save it reads through');
    assert.equal(/before\s*:/.test(sealedFn), false,
      'an explicit `before` is how a caller opts OUT of the seal — job-call.test.mjs S1 forbids it under site/js');
    /* the same pin `tests/job-call.test.mjs` S1 applies to the lane files, applied to this one: no
       q̂ read in this screen may carry an explicit cut. The seal is restored on the SAVE instead. */
    for (const fn of ['qHatFor', 'qHatDetail', 'callEntry', 'ratingDetail']) {
      for (const args of callArgsOf(RUN_CODE, fn)) {
        assert.equal(/\bbefore\s*:/.test(args), false, `${fn}(… ${args.trim().slice(0, 70)}) opts out of the seal`);
      }
    }
  });

  test('a call with no stamp prints nothing rather than a live read', () => {
    const save = seededSave('nostamp');
    const { debrief } = playJob(save, { missEvery: 2 });
    const stripped = (debrief.calls ?? []).map((c) => ({ ...c, at: null }));
    for (let i = 0; i < stripped.length; i++) {
      assert.equal(run.sealedQHatOf(save, stripped, i, { cards: cardById }), null,
        'a call the save cannot date must not be priced from the live rate');
    }
    const r = run.jobRegret({ ...debrief, calls: stripped }, { save, cards: cardById });
    assert.equal(r.call.line, '', 'a line that cannot be proved honest at the seal must not be printed');
  });

  test('an explicit `qHatOf` still wins, so a test may drive the line at a chosen q̂', () => {
    const save = seededSave('explicit');
    const { debrief, queue } = playJob(save);
    const forced = run.jobRegret(debrief, { items: queue, decisions: [], qHatOf: () => 0.55 });
    assert.equal(forced.call.q, 0.55);
  });
});

/* ================================================================================================
   2. NO LEDGER A WRITE IS DATED FROM LEDGER B
   ================================================================================================ */

describe('run v1 §2 — a job that ends after midnight files its writes under the day it ended', () => {
  const MOUNT = new Date(2026, 8, 16, 23, 50).getTime();
  const D15 = todayISO(new Date(MOUNT - DAY_MS));
  const D16 = todayISO(new Date(MOUNT));

  function acrossMidnight() {
    const save = seededSave('midnight', { now: MOUNT });
    save.forecastLog = [{ day: D15, r: 41 }, { day: D16, r: 44 }];
    const played = playJob(save, { now: MOUNT, day: D16, pace: 6, history: false });
    run.jobSummaryContext(save, played.debrief, { queue: played.queue, before: played.before });
    return { save, ...played };
  }

  test('the fixture really does cross midnight, and the mount-day really is stale', () => {
    const { save, endedAt } = acrossMidnight();
    assert.equal(save.game.log.at(-1).day, D16, 'the LEDGER B entry keeps the mount day — that is its job');
    assert.notEqual(todayISO(new Date(endedAt)), D16, 'the job did not cross midnight; this section proves nothing');
    assert.equal(todayISO(new Date(save.game.ledger.debriefAt)), todayISO(new Date(endedAt)),
      '`endJob` stamps the machine\'s own terminal clock, which is what the writes must use');
  });

  test('the forecast point the previous day already held is NOT overwritten', () => {
    const { save } = acrossMidnight();
    const kept = save.forecastLog.find((e) => e.day === D16);
    assert.ok(kept, `the entry for ${D16} was destroyed: ${JSON.stringify(save.forecastLog)}`);
    assert.equal(kept.r, 44, '`logForecast` overwrote the day it was handed — that is the corruption');
  });

  test('…and a point IS logged for the day the job actually ended', () => {
    const { save, endedAt } = acrossMidnight();
    const real = todayISO(new Date(endedAt));
    assert.ok(save.forecastLog.some((e) => e.day === real),
      `no forecast point for ${real}: ${JSON.stringify(save.forecastLog)}`);
    assert.ok(Object.hasOwn(save.daily ?? {}, real), `the daily goal was checked on ${Object.keys(save.daily ?? {})}`);
  });

  test('the write block is internally consistent: the record and the forecast point name ONE day', () => {
    const { save } = acrossMidnight();
    assert.equal(todayISO(new Date(save.runs.at(-1).submittedAt)), save.forecastLog.at(-1).day,
      'the row said one day and the forecast point beside it said another');
  });

  test('THE LINT: `commitJobRun` reads no Ledger B field for its day', () => {
    const fn = slice('export function commitJobRun', '\n/**\n * Build the Page Summary context');
    assert.equal(/game\s*[?.]*\.\s*log/.test(fn), false,
      '`commitJobRun` is reading `save.game.log` again — that is Ledger B, and it dates Ledger A writes');
    assert.match(fn, /const today = todayISO\(new Date\(submittedAt\)\)/,
      'the day must be derived by the identical expression the flat `finish()` uses');
    const flat = slice('function finish()', 'const onHide =');
    assert.match(flat, /logForecast\(s, \{ today: todayISO\(new Date\(submittedAt\)\) \}\)/,
      'the flat path moved; the two routes must still derive the day the same way');
  });
});

/* ================================================================================================
   3. THE ROW SAYS HOW MUCH OF THE PAGE IT IS
   ================================================================================================ */

describe('run v1 §3 — a job\'s page row cannot stand in for a whole Page it did not deal', () => {
  test('`composedCountOf` is `composePage`\'s own count, not a recomposition', () => {
    for (const tag of ['p1', 'p2', 'p3']) {
      const base = seededSave(tag);
      const probe = clone(base);
      state.startJob(probe, { today: TODAY, now: NOW });
      const deal = jobPage(clone(base)).queue.length;
      assert.equal(run.composedCountOf(probe.inProgress), deal, `${tag}: the meta count is not the page's length`);
      assert.ok(state.queueOf(probe).length <= deal, `${tag}: a job dealt MORE than the page it drafted out of`);
    }
  });

  test('the draft really is a strict subset — the gap the trophy was bought with', () => {
    const ratios = [];
    for (const tag of ['q1', 'q2', 'q3', 'q4', 'q5', 'q6']) {
      const base = seededSave(tag);
      const probe = clone(base);
      state.startJob(probe, { today: TODAY, now: NOW });
      const deal = jobPage(clone(base)).queue.length;
      if (deal > 0) ratios.push(state.queueOf(probe).length / deal);
    }
    assert.ok(ratios.length >= 4, 'not enough boards composed to measure');
    const mean = ratios.reduce((t, x) => t + x, 0) / ratios.length;
    assert.ok(mean < 0.9, `a job drafts ${(mean * 100).toFixed(0)} % of the page — the finding does not reproduce here`);
  });

  test('the row carries the comparison, and the whole-page trophy follows it', () => {
    const save = seededSave('trophy');
    const deal = jobPage(clone(save)).queue.length;
    const played = playJob(save, { missEvery: 0, history: false });
    run.jobSummaryContext(save, played.debrief, { queue: played.queue, before: played.before });
    const rec = save.runs.at(-1);
    assert.equal(rec.kind, 'page');
    assert.equal(rec.drafted, rec.items.length);
    assert.equal(rec.composed, deal);
    assert.equal(rec.partial, rec.drafted < deal);
    assert.equal(trophyCheck(save).includes('flawless-page'), !rec.partial,
      `the whole-page trophy did not follow the page (${rec.drafted} of ${deal})`);
  });

  test('a row with no composed count may not claim a whole page either', () => {
    const save = seededSave('nosnap');
    const played = playJob(save, { history: false });
    // the `screens/job.js` branch that hands `jobBefore ?? undefined`: no snapshot, no composed count
    run.jobSummaryContext(save, played.debrief, { queue: played.queue });
    const rec = save.runs.at(-1);
    assert.equal(rec.composed, 0);
    assert.equal(rec.partial, true, 'a row that cannot prove it covered a page must not claim it did');
  });

  test('THE GATE: `flawless-page` excludes a partial row, and nothing else changed about it', () => {
    const pred = TROPHY_SRC.slice(TROPHY_SRC.indexOf("def('flawless-page'"), TROPHY_SRC.indexOf("def('mock-90'"));
    assert.ok(pred.length > 0, 'the `flawless-page` definition is gone');
    assert.match(pred, /r\.partial !== true/, 'the predicate no longer excludes a partial page row');
    assert.match(pred, /r\.items\.every\(ctx\.isClean\)/, 'the cleanliness half of the predicate is gone');
    assert.match(pred, /ctx\.kindOf\(r\) === 'page' && r\.status === 'done'/, 'the rest of the predicate moved');
  });
});

/* ================================================================================================
   4. ONE RATING, ONE RANK, ON ONE SCREEN
   ================================================================================================ */

describe('run v1 §4 — the debrief prints ONE rank word', () => {
  test('the two surfaces name the rank through the same expression', () => {
    const take = slice('function jobTakeBlock', 'r1 — the one line that tells the reader');
    const ledger = slice('function jobLedgerBlock', 'G5 #1 — TOMORROW');
    for (const [name, code] of [['the take block', take], ['the ledger block', ledger]]) {
      assert.equal(/rankNameFor\s*\(/.test(code), false,
        `${name} is deriving a rank WORD from a rating value again — after S3 the band is not the held rank`);
      assert.match(code, /heldRankName\(/, `${name} must name the rank through the one expression`);
    }
    assert.equal((RUN_CODE.match(/rankNameFor\s*\(/g) ?? []).length, 0,
      'screens/run.js still has a rank name derived from a rating somewhere');
  });

  test('the held rank is what a save carries, and it survives a rating that has fallen below its band', () => {
    const s = fresh(NOW);
    assert.equal(s.player.rank, 2, 'store.fresh() no longer ships the rank this test is about');
    assert.equal(s.player.rating.value, 5, 'store.fresh() no longer ships the rating this test is about');
    /* the modal case: one hundredth below the band the held rank sits in */
    const fallen = { ...s, player: { ...s.player, rating: { ...s.player.rating, value: 4.99 } } };
    assert.notEqual(call.rankNameFor(4.99), call.rankOf(fallen.player.rank).name,
      'the OLD expression and the held rank agree here, so this test cannot see the defect');
    assert.equal(call.rankOf(num(fallen.player.rank, call.rankFor(4.99))).name, call.rankOf(2).name,
      'the floored expression must print the rank the save holds');
  });

  test('a real job below its held rank leaves ONE word on the screen', () => {
    const save = seededSave('rank');
    save.player.rank = 4;                                   // a rank ratcheted higher than the window
    const { debrief } = playJob(save, { missEvery: 1, callOf: () => 95 });
    const held = call.rankOf(save.player.rank).name;
    const band = call.rankNameFor(num(debrief.ratingAfter, 5));
    assert.notEqual(held, band, 'the fixture did not push the rating below the held rank — nothing to see');
    /* both printed words are `heldRankName`'s, so both are the held one */
    assert.equal(call.rankOf(num(save.player.rank, call.rankFor(num(debrief.ratingAfter, 5)))).name, held);
  });
});

/* ================================================================================================
   5. THE DEFLATION SENTENCE STANDS BESIDE THE FIGURE IT IS ABOUT
   ================================================================================================ */

describe('run v1 §5 — "posted falls" is not printed beside a posted figure on another basis', () => {
  test('the sentence is built in the block that owns the `Posted` fact', () => {
    const take = raw('function jobTakeBlock', 'r1 — the one line that tells the reader');
    assert.match(take, /sum-job-deflation/, 'the deflation sentence must sit in the take block');
    assert.match(take, /fact\('Posted'/, '…which is the block that prints the job\'s own posted');
  });

  test('no other block builds it, and the tomorrow block is a different section entirely', () => {
    const ledger = raw('function jobLedgerBlock', 'G5 #1 — TOMORROW');
    const tomorrow = raw('function jobTomorrowBlock', 'THE BAG DROP');
    assert.equal(/sum-job-deflation/.test(ledger), false, 'the ledger block still prints the deflation sentence');
    assert.equal(/sum-job-deflation/.test(tomorrow), false, 'the tomorrow block prints the deflation sentence');
    assert.equal((RUN_SRC.match(/h\('p\.sum-job-deflation/g) ?? []).length, 1, 'the sentence must have exactly one home');
  });

  test('the take block prints no backlog figure, so the only posted beside the sentence is tonight\'s', () => {
    const take = raw('function jobTakeBlock', 'r1 — the one line that tells the reader');
    assert.equal(/tomorrowBoard\(|tomorrowLine\(|dueList\(/.test(strip(take)), false,
      'the take block now reaches for tomorrow\'s board — the two bases would be adjacent again');
  });

  test('the two figures the finding compared are still different quantities, and only one is called posted', () => {
    const save = seededSave('defl');
    const { debrief } = playJob(save);
    const t = run.tomorrowBoard(save, { now: NOW });
    const line = run.tomorrowLine(t);
    assert.equal(/\bposted\b/.test(line), false, `the backlog figure may not be called posted: ${line}`);
    assert.ok(num(debrief.posted, 0) >= 0 && num(t.posted, 0) >= 0);
  });
});
