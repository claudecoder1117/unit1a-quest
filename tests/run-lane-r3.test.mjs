// tests/run-lane-r3.test.mjs — the run lane's round-3 fixes (notes/run-fix.md).
//
// Two findings, two sections. Each asserts the invariant that was missing — not the constant that
// happened to be wrong — and then pins the expression that made the old behaviour possible.
//
//   1. MAJOR — the debrief's call-regret line MIXED THE TWO LADDERS: it named `call.argmaxCall(q̂)`
//      (the CARRY argmax) and priced the difference in RATING credit. Outside G3.1's two published
//      disagreement bands the two ladders agree and nobody could see it; inside them the line named
//      the rung that LOSES the credit it was charging for. At q̂ = 0.885 (band 2, "money 95, rank
//      85") it printed `EV-max was 95, cost 1.2 rating` while `E[c](.95) = 5.760 < E[c](.85) =
//      5.880` — a student who followed the printed advice gave up 0.120 credit, on the one line G5
//      ranks as "the strongest teaching hook in the design", in the one band G3.1 calls "the only
//      place in the game where the player must choose what they are playing for".
//      `js/job/call.js` already exported `regretOf({call, qHat, ladder})`, which computes the pair
//      on ONE ladder — dead code, referenced by nothing, while the screen hand-rolled the mismatch.
//
//   2. MAJOR — the debrief printed two different quantities under one word, three lines apart:
//      `Posted 516 · 3 of 5 contracts, 10 targets` (the DRAFTED job) and `Tomorrow's board: 43 cold
//      locks … posted 956` (`dueList` over the WHOLE backlog — no draft, no shape cap), with
//      `COPY.deflation` — *"posted falls as you master the material. That is the point."* — printed
//      between them. Read straight down the screen it says posted falls, then quotes a number 1.9×
//      the one above it.
//
// Pure: `js/job/*` and `screens/run.js` only. No `Math.random`, no browser.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { read, stripCommentsAndStrings as strip } from './_helpers.mjs';

import * as run from '../site/js/screens/run.js';
import * as call from '../site/js/job/call.js';
import * as state from '../site/js/job/state.js';
import { fresh } from '../site/js/store.js';
import { applyOutcome, DAY_MS, dueList } from '../site/js/schedule.js';
import { todayISO, addDays } from '../site/js/days.js';
import { rngFrom } from '../site/js/rng.js';
import { cards as ALL_CARDS, byId as cardById } from '../site/data/cards.js';
import { isBonus } from '../site/data/source-manifest.js';
import { SKILL_IDS } from '../site/data/skills.js';
import { COPY } from '../site/data/job.js';

const RUN_SRC = read('site/js/screens/run.js');
const RUN_CODE = strip(RUN_SRC);
const CALL_SRC = read('site/js/job/call.js');

const NOW = new Date(2026, 8, 16, 18, 0).getTime();
const TODAY = todayISO(new Date(NOW));
const BANK = ALL_CARDS.filter((c) => !isBonus(c.id));

/** A save with real Leitner records and real skills, and a backlog far larger than one job. */
function seededSave(tag = 'r3', { cards = 60 } = {}) {
  const rng = rngFrom('run-r3', tag);
  const s = fresh(NOW - 9 * DAY_MS);
  s.profileId = `run-r3-${tag}`;
  s.settings.testDate = addDays(TODAY, 6);
  for (let k = 0; k < cards; k++) {
    const c = BANK[rng.int(0, BANK.length - 1)];
    let rec = null;
    for (let r = 0; r < 3; r++) rec = applyOutcome(s, c.id, rng.chance(0.7) ? 'clean' : 'wrong', { now: NOW - (30 - r * 4) * DAY_MS });
    if (!rec) continue;
    rec.cleared = true;
    rec.due = NOW + (rng.chance(0.5) ? -rng.float(0, 6) : rng.float(0.1, 1.9)) * DAY_MS;
  }
  for (const id of SKILL_IDS) {
    if (!rng.chance(0.8)) continue;
    s.skills[id] = { m: rng.int(15, 92), n: rng.int(1, 8), lastAt: NOW - rng.int(1, 18) * DAY_MS, lastDueCorrectAt: null };
  }
  return s;
}

const CLEAN = Object.freeze({ cleared: true, firstTry: true, hints: 0, attempt: 1, elapsedMs: 9000, xp: 40 });

/** One whole job, played through the real phase machine exactly as `screens/job.js` plays one. */
function playJob(save, { callOf = () => 70, now = NOW } = {}) {
  let t = now;
  state.startJob(save, { today: TODAY, now: t, shape: 'JOB' });
  const before = run.captureJobBefore(state.unguard(save), state.queueOf(save));
  const queue = state.queueOf(save).slice();
  let debrief = null;
  state.beginTargets(save, { now: (t += 6000) });
  for (let i = 0; i < 400; i++) {
    const g = state.stateOf(save);
    if (!g || g.outcome != null) break;
    if (g.phase === 'envelope') {
      if (g.stakes) state.lockCall(save, callOf(state.answered(save) + 1), { now: (t += 5000) });
      else state.beginAnswer(save, { now: (t += 1200) });
      continue;
    }
    if (g.phase === 'answer') {
      const it = state.currentItem(save);
      state.applyTarget(save, { ...CLEAN, id: it.id }, { now: (t += 40000), cards: cardById });
      continue;
    }
    if (g.phase === 'payout' || g.phase === 'bagpush') {
      if (state.targetsLeft(save) === 0) { debrief = state.endJob(save, state.OUTCOMES.COMPLETED, { now: (t += 1000), day: TODAY }); break; }
      state.push(save, { now: (t += 9000) });
      continue;
    }
    if (g.phase === 'brief') { state.brief(save, {}, { now: (t += 20000) }); continue; }
    if (g.phase === 'getaway') { state.crack(save, { now: (t += 25000) }); continue; }
    break;
  }
  assert.ok(debrief, 'the fixture must play a job to its terminal');
  return { debrief, queue, before, save };
}

/** `E[c]` at a rung, in the units `COPY.regret2` prints. */
const ec = (rung, q) => call.expectedCredit(rung / 100, q);

/* ================================================================================================
   1. ONE LADDER: the rung the line names is the argmax of the currency the line prices
   ================================================================================================ */

describe('run r3 §1 — the call-regret line names and prices the SAME ladder', () => {
  const FIX = playJob(seededSave('regret'), { callOf: () => 70 });
  const regretAt = (q) => run.jobRegret(FIX.debrief, { items: FIX.queue, decisions: [], qHatOf: () => q }).call;

  test('the declared ladder is one ladder, and it is the one COPY.regret2 denominates in', () => {
    assert.deepEqual(run.DEBRIEF_CALL_LADDER, { best: 'rating', cost: 'rating' });
    assert.match(COPY.regret2({ envelope: 1, called: 70, evMax: 85, cost: '0.3' }), /cost 0\.3 rating\./,
      'the sentence prices itself in rating credit, so the rung it names must maximise rating credit');
  });

  test('over a 101-point grid of q̂, the named rung is the maximiser of the printed currency', () => {
    let seen = 0;
    for (let i = 0; i <= 100; i++) {
      const q = i / 100;
      const got = regretAt(q);
      if (got.evMax == null) continue;                 // no regret to print at this q̂
      seen++;
      for (const lvl of call.CALL_LEVELS) {
        assert.ok(ec(got.evMax, q) + 1e-12 >= ec(lvl.id, q),
          `q̂ ${q}: printed EV-max ${got.evMax} (E[c] ${ec(got.evMax, q).toFixed(3)}) is beaten by ${lvl.id} (${ec(lvl.id, q).toFixed(3)})`);
      }
      assert.ok(ec(got.evMax, q) >= ec(got.called, q) - 1e-12,
        `q̂ ${q}: following the printed advice loses credit (${got.called} → ${got.evMax})`);
      assert.ok(Math.abs(got.cost - (ec(got.evMax, q) - ec(got.called, q))) < 1e-12,
        `q̂ ${q}: the printed cost is not the difference on the ladder it names`);
      assert.ok(got.cost > 0, `q̂ ${q}: a regret line is printed with no regret`);
    }
    assert.ok(seen >= 60, `the grid must actually exercise the line (${seen} points)`);
  });

  test('inside BOTH published disagreement bands it names the RANK rung, not the money rung', () => {
    const bands = call.CALL_DISAGREEMENT_BANDS;
    assert.equal(bands.length, 2, 'G3.1 publishes exactly two bands');
    for (const [i, b] of bands.entries()) {
      assert.notEqual(b.money, b.rank, `band ${i} must be a disagreement`);
      const step = (b.to - b.from) / 8;
      for (let q = b.from + step; q < b.to; q += step) {
        const got = regretAt(q);
        assert.equal(got.evMax, b.rank, `band ${i} at q̂ ${q.toFixed(4)}: named ${got.evMax}, rank rung is ${b.rank}`);
        assert.equal(got.evMax, call.honestCall(q));
        /* THE REGRESSION ITSELF — the old pair, recomputed here: the carry argmax, priced in credit.
           It is the money rung, and taking it COSTS credit, which is what the line charged for. */
        const old = { best: call.argmaxCall(q), cost: ec(call.argmaxCall(q), q) - ec(got.called, q) };
        assert.equal(old.best, b.money, `band ${i}: the old line named the money rung`);
        assert.ok(ec(old.best, q) < ec(got.evMax, q),
          `band ${i} at q̂ ${q.toFixed(4)}: the old line's rung must be strictly worse in the currency it printed`);
        assert.ok(old.cost !== got.cost, `band ${i}: the two pairs must differ, or this test proves nothing`);
      }
    }
  });

  test('G5 #2’s worked line still reproduces, because the two ladders AGREE at its q̂', () => {
    const q = 0.75;
    assert.equal(call.honestCall(q), call.argmaxCall(q), 'q̂ = .75 is not in a disagreement band');
    const got = call.regretOf({ call: 85, qHat: q, ladder: run.DEBRIEF_CALL_LADDER.best });
    assert.equal(got.best, 70);
    assert.equal(Math.round(got.cost * 10) / 10, 0.3);
    assert.equal(
      COPY.regret2({ envelope: 6, called: 85, evMax: got.best, cost: (Math.round(got.cost * 10) / 10).toFixed(1) }),
      'envelope 6: you called 85, EV-max was 70. cost 0.3 rating.',
      'notes/J6b.md claimed only the carry pair reproduces this line. It does not: the carry pair’s own cost is 0.05 loot.',
    );
    const carry = call.regretOf({ call: 85, qHat: q, ladder: 'carry' });
    assert.equal(carry.best, 70);
    assert.ok(Math.abs(carry.cost - 0.05) < 1e-9, `the carry pair prices the same rung at ${carry.cost}`);
  });

  test('the pair is `call.regretOf`’s, not the screen’s — and it is no longer dead code', () => {
    const jobRegret = RUN_CODE.slice(RUN_CODE.indexOf('export function jobRegret'), RUN_CODE.indexOf('export function captureJobBefore'));
    assert.ok(jobRegret.includes('jobCall.regretOf({'), 'the screen must call the module’s own implementation');
    assert.ok(!/argmaxCall|expectedCredit/.test(jobRegret), 'and must not hand-roll either half of it');
    assert.ok(/export function regretOf/.test(CALL_SRC), 'call.js still owns it');
  });

  test('a target with no q̂, and a perfect call, still print nothing', () => {
    const none = run.jobRegret(FIX.debrief, { items: FIX.queue, decisions: [], qHatOf: () => null }).call;
    assert.equal(none.line, '');
    assert.equal(none.cost, 0);
    const perfect = run.jobRegret(FIX.debrief, { items: FIX.queue, decisions: [], qHatOf: () => 0.70 }).call;
    assert.equal(call.honestCall(0.70), 70, 'the fixture called 70 everywhere');
    assert.equal(perfect.line, '', 'an honest call has no regret to teach');
  });
});

/* ================================================================================================
   2. TWO QUANTITIES, TWO NAMES: `posted` is the job's; the backlog says what it is
   ================================================================================================ */

describe('run r3 §2 — the debrief never prints two different quantities under one word', () => {
  const save = seededSave('posted');

  test('the two numbers really are different measures, on one save', () => {
    const tomorrow = run.tomorrowBoard(save, { now: NOW });
    const { debrief, queue, before } = playJob(structuredClone(save));
    const ctx = run.jobSummaryContext(structuredClone(save), debrief, { queue, before });
    const jobPosted = Number(ctx.job.posted);
    assert.ok(Number.isFinite(jobPosted) && jobPosted > 0, `the job posted ${jobPosted}`);
    /* the shape cap is the whole point: the job drafts `of` targets, the backlog has every lock. */
    assert.ok(tomorrow.locks > Number(ctx.job.of),
      `the fixture must have a backlog bigger than one job (${tomorrow.locks} locks vs ${ctx.job.of} targets)`);
    assert.ok(tomorrow.posted !== jobPosted, 'two measures that happen to be equal prove nothing here');
  });

  test('the backlog figure is not called `posted`, and says what it is instead', () => {
    const t = run.tomorrowBoard(save, { now: NOW });
    const line = run.tomorrowLine(t);
    assert.ok(t.locks > 1, `the fixture must have a backlog (${t.locks})`);
    assert.ok(line.includes(`worth ${t.posted} if you took them all`), line);
    assert.equal(/posted/i.test(line), false, `the backlog figure may not borrow the job's word: ${line}`);
    assert.equal(/\bworth\b/.test(COPY.deflation()), false,
      'and the deflation line must stay about the job’s posted, which is the only `posted` left on the screen');
  });

  test('the only `posted` NUMBER on the debrief is the drafted job’s', () => {
    /* The take block's `Posted` fact is the one place a number is printed under that word; the
       tomorrow block is built from `tomorrowLine`, asserted above to contain none. */
    const facts = RUN_SRC.match(/fact\('Posted',[^)]*\)/g) ?? [];
    assert.equal(facts.length, 1, `exactly one Posted fact, found ${facts.length}`);
    assert.match(facts[0], /job\.posted/, 'and it is the job’s own');
    /* read off the RAW source: `strip()` empties the template literals this function is built from.
       The slice starts AT the declaration, so the doc comment above it (which explains the word) is
       not in scope; the body carries no comments of its own. */
    const tomorrowFn = RUN_SRC.slice(RUN_SRC.indexOf('export function tomorrowLine'), RUN_SRC.indexOf('function jobTomorrowBlock'));
    assert.ok(tomorrowFn.includes('${t.posted}'), 'it still prints the number — under its own name');
    assert.equal(/posted/.test(tomorrowFn.split('t.posted').join('')), false,
      'the tomorrow line must not print the word `posted` at all');
  });

  test('the empty and singular boards still read as sentences', () => {
    const bare = { at: NOW, locks: 0, cold: 0, swept: 0, posted: 0, makes: [], safe: null, tags: [], drill: null };
    assert.equal(run.tomorrowLine(bare), 'Tomorrow’s board: nothing due — new locks only');
    assert.equal(run.tomorrowLine({ ...bare, locks: 1, cold: 1, posted: 12 }),
      'Tomorrow’s board: 1 cold lock · worth 12 if you take it');
    assert.equal(run.tomorrowLine({ ...bare, locks: 2, cold: 2, posted: 25, makes: [{ skill: 'FAC2', locks: 2, name: 'x' }] }),
      'Tomorrow’s board: 2 cold locks on FAC2 · worth 25 if you took them all');
  });
});
