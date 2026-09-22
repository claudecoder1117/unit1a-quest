// tests/job-state-r3.test.mjs — round-3 fix to `site/js/job/state.js`: THE BRIEF WINDOW'S RE-PRESS.
//
// ── THE DEFECT ────────────────────────────────────────────────────────────────────────────────────
// `press()` was legal at phase `brief` and did nothing there but write the new allocation. By the
// brief window the guard's wing is PUBLIC — `envelopeFor` has printed `guarded` on every target
// served — so the student could move tokens off the wing they already knew was dead, tap **Skip**,
// and keep the same guard. `brief({ repress })`, the option COMPOSED-GAME prices at "re-press ONE
// token WITH THE GUARD DISTRIBUTION REDRAWN", was therefore strictly dominated by not using it.
//
//   measured, 8 seeds, same answers, Σ `envelopeFor().posted` over the targets served after the
//   first window, re-optimising the press at every brief against the known wing:
//       before   1368 → 1576   +15.2 %   (and `briefs[].took` recorded `[]`: no decision at all)
//       after    1368 → 1359   −0.7 %    (a trade with a real downside in 4 of 8 seeds)
//
// ── THE FIX ───────────────────────────────────────────────────────────────────────────────────────
// The redraw moved OUT of `brief({repress})` and INTO `press()` itself, because `screens/job.js`'s
// +/− handler commits through `press()` directly and never reaches `brief()`'s action list. At a
// brief a press now (a) moves at most ONE token, (b) redraws the guard from the same published
// distribution on the same PINNED seed `${seed}|brief${n}`, and (c) is recorded as a `repress`
// decision whichever button closed the window.
//
// The one-token ledger has NO new key on `inProgress.game` (G7's budget is exact): `setPhase`
// stamps `phaseAt` when the window opens and `press()` stamps `guard.drawnAt` when it redraws, so
// `drawnAt > phaseAt` IS "this window's token has been lifted" — in the save, and so reload-proof.
//
// House rules as everywhere else: no `Math.random`, no wall clock except through an injected `now`,
// and every test drives the REAL machine rather than calling the repaired predicate directly.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  JobStateError, startJob, beginTargets, lockCall, applyTarget, push, brief, crack,
  press, canPress, stateOf, envelopeFor, queueOf, idxOf, targetsLeft, serialize,
} from '../site/js/job/state.js';
import { drawGuard } from '../site/js/job/guard.js';
import { WING_IDS, GUARD } from '../site/data/job.js';
import { fresh } from '../site/js/store.js';
import { applyOutcome, DAY_MS } from '../site/js/schedule.js';
import { rngFrom } from '../site/js/rng.js';
import { todayISO, addDays } from '../site/js/days.js';
import { cards as ALL_CARDS } from '../site/data/cards.js';
import { isBonus } from '../site/data/source-manifest.js';

const NOW = new Date(2026, 8, 16, 18, 0).getTime();
const TODAY = todayISO(new Date(NOW));
const BANK = ALL_CARDS.filter((c) => !isBonus(c.id));
const CLEAN = { cleared: true, firstTry: true, hints: 0, attempt: 1, clean: true };
const total = (t) => WING_IDS.reduce((n, w) => n + Math.max(0, t?.[w] ?? 0), 0);

/** The r1/r2 corpus, verbatim: real Leitner records, real history, a real due pile. */
function seededSave(i, now = NOW) {
  const rng = rngFrom('job-state-r1', i);
  const s = fresh(now - (4 + rng.int(0, 20)) * DAY_MS);
  s.profileId = `r3-${i}`;
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
    rec.history = Array.from({ length: 10 }, (_, h) => ({ at: now - (20 - h) * DAY_MS, ok: rng.chance(0.75), attempt: 1, hints: 0, ms: 9000 }));
  }
  return s;
}

/**
 * Play the REAL machine until the first brief window is open, and stop there. `served` is what the
 * envelopes told the student on the way — including which wing they watched pay nothing.
 */
function toBrief(save, { seed = 0, now = NOW } = {}) {
  let t = now;
  const step = (n) => (t += n);
  startJob(save, { today: TODAY, now: t });
  beginTargets(save, { now: step(6000) });
  const served = [];
  for (let i = 0; i < 400; i++) {
    const g = stateOf(save);
    if (!g || g.outcome != null) break;
    if (g.phase === 'envelope') {
      const e = envelopeFor(save);
      served.push({ wing: e.wing, guarded: e.guarded, tokens: e.tokens });
      lockCall(save, 70, { now: step(5000) });
      continue;
    }
    if (g.phase === 'answer') { applyTarget(save, CLEAN, { now: step(40000) }); continue; }
    if (g.phase === 'payout' || g.phase === 'bagpush') { push(save, { now: step(9000) }); continue; }
    if (g.phase === 'brief') return { save, served, at: t, step };
    if (g.phase === 'getaway') { crack(save, { now: step(25000) }); continue; }
    break;
  }
  return { save, served, at: t, step, none: true };
}

/** A save parked in a brief window with all three tokens down — the shape the window is written for. */
function brieffed(i = 0) {
  for (let seed = i; seed < i + 12; seed++) {
    const r = toBrief(seededSave(seed));
    const g = stateOf(r.save);
    if (!r.none && g?.phase === 'brief' && total(g.tokens) === GUARD.tokens) return { ...r, g, seed };
  }
  throw new Error('no seed reached a brief window with a full press');
}

/** The wing the guard MUST show after a re-press: the published distribution on the pinned seed. */
const redrawnWing = (g) => drawGuard(g.guard.dist, `${g.seed}|brief${g.briefs.length}`);

/** A wing that is not `not`, preferring one the remaining targets actually use. */
function otherWing(save, not) {
  const rest = queueOf(save).slice(idxOf(save));
  const seen = new Set(rest.map((it) => it?.wing).filter(Boolean));
  return WING_IDS.find((w) => w !== not && seen.has(w)) ?? WING_IDS.find((w) => w !== not);
}

/* ==========================================================================================
   1. BLOCKER — the brief window used to re-press for free, against a wing already known
   ========================================================================================== */
describe('r3 · the brief re-press is PRICED: touching the press redraws the guard', () => {
  test('the guard has shown its wing by the brief — the student is not pressing blind', () => {
    const { served, g } = brieffed(0);
    assert.ok(served.length >= 1, 'no target was served before the brief window');
    for (const s of served) {
      assert.equal(s.guarded, s.wing === g.guard.wing, `the envelope for ${s.wing} disagreed with guard.wing`);
      if (s.guarded) assert.equal(s.tokens, 0, 'a guarded wing still paid its tokens');
    }
    assert.ok(g.guard.wing, 'the guard never drew a wing');
  });

  test('moving a token at the brief and tapping SKIP redraws the guard and is recorded', () => {
    const { save, g, step } = brieffed(0);
    const known = g.guard.wing;
    const drawnAt0 = g.guard.drawnAt;
    const tokens0 = { ...g.tokens };                 // `g` is the LIVE record; press replaces `g.tokens`
    const from = WING_IDS.find((w) => (tokens0[w] ?? 0) > 0);
    const to = otherWing(save, from);
    const want = redrawnWing(g);

    press(save, { ...tokens0, [from]: tokens0[from] - 1, [to]: (tokens0[to] ?? 0) + 1 });
    const r = brief(save, {}, { now: step(20000) });          // <- "Skip", the free path in round 2

    const after = stateOf(save);
    assert.equal(after.guard.wing, want, 'the guard did NOT redraw: the re-press was free');
    assert.ok(after.guard.drawnAt > drawnAt0, 'guard.drawnAt did not move — no draw happened');
    assert.deepEqual(r.took, ['repress'], 'the window recorded no decision for a press it committed');
    assert.equal(after.briefs.at(-1).took[0], 'repress', "briefs[].took is the debrief's own record");
    assert.equal(total(after.tokens), GUARD.tokens, 'the re-press lost or minted a token');
    // and the student really did move it — this is not a test of a no-op
    assert.notDeepEqual(after.tokens, tokens0);
    assert.ok(known, 'sanity: a wing was known before the press');
  });

  test('the guard does NOT read the press: two different re-presses face the same drawn wing', () => {
    const a = brieffed(0);
    const b = brieffed(0);
    assert.equal(a.seed, b.seed, 'the two runs did not pick the same seed');
    const wA = WING_IDS.find((w) => (a.g.tokens[w] ?? 0) > 0);
    const wB = WING_IDS.slice().reverse().find((w) => (b.g.tokens[w] ?? 0) > 0);
    press(a.save, { ...a.g.tokens, [wA]: a.g.tokens[wA] - 1, [otherWing(a.save, wA)]: (a.g.tokens[otherWing(a.save, wA)] ?? 0) + 1 });
    press(b.save, { ...b.g.tokens, [wB]: b.g.tokens[wB] - 1 });
    assert.equal(stateOf(a.save).guard.wing, stateOf(b.save).guard.wing,
      'the redraw moved with the allocation — the House would be reading the press');
    assert.equal(stateOf(a.save).guard.wing, redrawnWing(a.g), 'the redraw is not the published draw on the pinned seed');
  });

  test('an untouched window is still free: Skip redraws nothing and costs no decision', () => {
    const { save, g, step } = brieffed(0);
    const wing0 = g.guard.wing;
    const drawnAt0 = g.guard.drawnAt;
    const tokens0 = { ...g.tokens };
    const r = brief(save, {}, { now: step(20000) });
    const after = stateOf(save);
    assert.equal(after.guard.wing, wing0, 'an honest Skip moved the guard');
    assert.equal(after.guard.drawnAt, drawnAt0, 'an honest Skip re-stamped the draw');
    assert.deepEqual(after.tokens, tokens0);
    assert.deepEqual(r.took, [], 'an honest Skip was billed for a decision it did not take');
  });

  test('the PRICED button still prices: brief({repress}) redraws and counts, unchanged allocation or not', () => {
    const { save, g, step } = brieffed(0);
    const want = redrawnWing(g);
    const r = brief(save, { repress: { ...g.tokens } }, { now: step(20000) });   // screens/job.js's own call
    assert.deepEqual(r.took, ['repress'], "the full-use decision count lost its repress");
    assert.equal(stateOf(save).guard.wing, want, 'the button did not redraw the guard');
  });
});

/* ==========================================================================================
   2. "Re-press ONE token" — COMPOSED-GAME §"What a brief window is", enforced
   ========================================================================================== */
describe('r3 · ONE token per brief window, and never a token that was not pressed', () => {
  test('a second token cannot be lifted in the same window', () => {
    const { save, g } = brieffed(0);
    const from = WING_IDS.find((w) => (g.tokens[w] ?? 0) > 0);
    const to = otherWing(save, from);
    press(save, { ...g.tokens, [from]: g.tokens[from] - 1, [to]: (g.tokens[to] ?? 0) + 1 });
    const now = stateOf(save).tokens;
    const again = WING_IDS.find((w) => (now[w] ?? 0) > 0 && w !== to);
    if (again) {
      assert.throws(() => press(save, { ...now, [again]: now[again] - 1 }),
        (e) => e instanceof JobStateError && e.code === 'repress-spent', 'a second token moved in one window');
    }
    assert.deepEqual(stateOf(save).tokens, now, 'the refused press wrote anyway');
  });

  test('a token cannot be PLACED without lifting one first — the window mints nothing', () => {
    const { save, g } = brieffed(0);
    const w = otherWing(save, null) ?? WING_IDS[0];
    assert.throws(() => press(save, { ...g.tokens, [w]: (g.tokens[w] ?? 0) + 1 }),
      (e) => e instanceof JobStateError && ['repress-lift-first', 'too-many-tokens'].includes(e.code));
    assert.equal(total(stateOf(save).tokens), GUARD.tokens);
  });

  test('a wholesale re-allocation is refused outright (the +15.2 % play)', () => {
    const { save, g } = brieffed(0);
    const best = otherWing(save, g.guard.wing);
    const all = Object.fromEntries(WING_IDS.map((w) => [w, 0]));
    all[best] = GUARD.tokens;
    if (JSON.stringify(all) !== JSON.stringify(g.tokens)) {
      assert.throws(() => press(save, all),
        (e) => e instanceof JobStateError && e.code === 'repress-step', 'three tokens moved in one window');
    }
  });

  test('the two-step +/− the screen actually fires is ONE token, and the second move is refused', () => {
    const { save, g } = brieffed(0);
    const from = WING_IDS.find((w) => (g.tokens[w] ?? 0) > 0);
    const to = otherWing(save, from);
    press(save, { ...g.tokens, [from]: g.tokens[from] - 1 });                 // bump(from, -1)
    const mid = { ...stateOf(save).tokens };
    assert.equal(total(mid), GUARD.tokens - 1);
    press(save, { ...mid, [to]: (mid[to] ?? 0) + 1 });                        // bump(to,   +1)
    const done = { ...stateOf(save).tokens };
    assert.equal(total(done), GUARD.tokens, 'the lift-then-place did not restore the press');
    const third = WING_IDS.find((w) => (done[w] ?? 0) > 0 && w !== to);
    assert.throws(() => press(save, { ...done, [third]: done[third] - 1 }),
      (e) => e instanceof JobStateError && e.code === 'repress-spent');
  });

  test('`canPress` is the same rule the machine enforces, so a screen can grey the button', () => {
    const { save, g } = brieffed(0);
    const tokens0 = { ...g.tokens };
    const from = WING_IDS.find((w) => (tokens0[w] ?? 0) > 0);
    const to = otherWing(save, from);
    const lift = { ...tokens0, [from]: tokens0[from] - 1 };
    const mint = { ...tokens0, [to]: (tokens0[to] ?? 0) + 1 };
    assert.equal(canPress(save, lift), true);
    assert.equal(canPress(save, mint), false);
    press(save, lift);
    assert.equal(canPress(save, { ...lift, [to]: (lift[to] ?? 0) + 1 }), true, 'the place after the lift was refused');
    assert.equal(canPress(save, tokens0), true, 'putting it back where it was is still one token');
    const second = WING_IDS.find((w) => (lift[w] ?? 0) > 0);
    assert.ok(second, 'sanity: a token was still standing after the lift');
    assert.equal(canPress(save, { ...lift, [to]: (lift[to] ?? 0) + 1, [second]: lift[second] - 1 }), false,
      'a SECOND token was moved after the lift');
  });
});

/* ==========================================================================================
   3. The ledger is in the SAVE — a reload cannot re-open a spent window
   ========================================================================================== */
describe('r3 · the one-token ledger survives a reload, and adds no key to inProgress.game', () => {
  test('a reload mid-window still refuses the second token, and the wing does not re-roll', () => {
    const { save, g } = brieffed(0);
    const from = WING_IDS.find((w) => (g.tokens[w] ?? 0) > 0);
    const to = otherWing(save, from);
    press(save, { ...g.tokens, [from]: g.tokens[from] - 1, [to]: (g.tokens[to] ?? 0) + 1 });
    const wing = stateOf(save).guard.wing;

    // the reload: `inProgress` is pass-through in store.js, so a JSON round trip IS the reload
    const reloaded = JSON.parse(JSON.stringify(save));
    const rg = stateOf(reloaded);
    assert.equal(rg.phase, 'brief');
    assert.equal(rg.guard.wing, wing, 'the redraw re-rolled across a reload');
    const again = WING_IDS.find((w) => (rg.tokens[w] ?? 0) > 0 && w !== to);
    assert.throws(() => press(reloaded, { ...rg.tokens, [again]: rg.tokens[again] - 1 }),
      (e) => e instanceof JobStateError && e.code === 'repress-spent',
      'a reload handed the student a second token');
  });

  test('serialize() still emits exactly the keys it did — the ledger costs G7 nothing', () => {
    const { save, g } = brieffed(0);
    const before = Object.keys(serialize(g));
    const from = WING_IDS.find((w) => (g.tokens[w] ?? 0) > 0);
    press(save, { ...g.tokens, [from]: g.tokens[from] - 1 });
    assert.deepEqual(Object.keys(serialize(stateOf(save))), before);
    assert.deepEqual(Object.keys(stateOf(save)), before, 'the live record grew a key the serialiser does not emit');
  });
});

/* ==========================================================================================
   4. The BOARD press is untouched — it is blind, free and sealed
   ========================================================================================== */
describe('r3 · the board press is not the brief press', () => {
  test('at the board every allocation is legal and nothing redraws', () => {
    const save = seededSave(0);
    const g = startJob(save, { today: TODAY, now: NOW });
    const wing0 = g.guard.wing;
    const drawnAt0 = g.guard.drawnAt;
    for (const w of WING_IDS) {
      const all = Object.fromEntries(WING_IDS.map((x) => [x, x === w ? GUARD.tokens : 0]));
      assert.deepEqual(press(save, all), all, `the board refused ${GUARD.tokens} tokens on ${w}`);
      assert.equal(stateOf(save).guard.wing, wing0, 'the BOARD press redrew the guard');
      assert.equal(stateOf(save).guard.drawnAt, drawnAt0);
    }
    assert.throws(() => press(save, { [WING_IDS[0]]: GUARD.tokens + 1 }),
      (e) => e instanceof JobStateError && e.code === 'too-many-tokens');
  });

  test('press is still refused once the targets start', () => {
    const save = seededSave(0);
    startJob(save, { today: TODAY, now: NOW });
    beginTargets(save, { now: NOW + 6000 });
    assert.throws(() => press(save, { [WING_IDS[0]]: 1 }),
      (e) => e instanceof JobStateError && e.code === 'press-closed');
    assert.equal(canPress(save, { [WING_IDS[0]]: 1 }), false);
  });
});

/* ==========================================================================================
   5. The value, over the corpus: the dodge is a trade now, not a free +15 %
   ========================================================================================== */
describe('r3 · the measured payoff of re-pressing against the wing you already know', () => {
  /** Σ `envelopeFor().posted` over the targets served after the first brief window. */
  function playFrom(save, dodge) {
    let t = NOW;
    const step = (n) => (t += n);
    startJob(save, { today: TODAY, now: t });
    beginTargets(save, { now: step(6000) });
    let posted = 0; let branched = false;
    for (let i = 0; i < 400; i++) {
      const g = stateOf(save);
      if (!g || g.outcome != null) break;
      if (g.phase === 'envelope') {
        if (branched) posted += envelopeFor(save).posted;
        lockCall(save, 70, { now: step(5000) });
        continue;
      }
      if (g.phase === 'answer') { applyTarget(save, CLEAN, { now: step(40000) }); continue; }
      if (g.phase === 'payout' || g.phase === 'bagpush') { push(save, { now: step(9000) }); continue; }
      if (g.phase === 'brief') {
        if (dodge) {
          const w = g.guard.wing;
          if (w && (g.tokens[w] ?? 0) > 0) {
            const to = otherWing(save, w);
            try { press(save, { ...g.tokens, [w]: g.tokens[w] - 1, [to]: (g.tokens[to] ?? 0) + 1 }); } catch { /* refused is a pass */ }
          }
        }
        brief(save, {}, { now: step(20000) });
        branched = true;
        continue;
      }
      if (g.phase === 'getaway') { crack(save, { now: step(25000) }); continue; }
      break;
    }
    return posted;
  }

  test('re-pressing off the known wing no longer beats an honest Skip across the corpus', () => {
    let honest = 0; let dodged = 0; let worse = 0;
    for (let seed = 0; seed < 8; seed++) {
      const h = playFrom(seededSave(seed), false);
      const d = playFrom(seededSave(seed), true);
      honest += h; dodged += d;
      if (d < h) worse++;
    }
    assert.ok(honest > 0, 'the corpus posted nothing');
    const gain = (dodged - honest) / honest;
    assert.ok(gain <= 0.05,
      `re-pressing against the known wing is worth ${(gain * 100).toFixed(1)} % — it was +15.2 % before the redraw, and must not pay for free`);
    assert.ok(worse >= 2,
      `the redraw never cost the student anything on ${8 - worse}/8 seeds — it is not a trade`);
  });

  test('a whole corpus of jobs plays through with the re-press wired in', () => {
    for (let seed = 0; seed < 6; seed++) {
      const save = seededSave(seed);
      playFrom(save, true);
      const g = stateOf(save);
      assert.ok(!g || g.outcome != null || targetsLeft(save) >= 0);
      for (const b of (g?.briefs ?? [])) {
        assert.ok(b.took.filter((x) => x === 'repress').length <= 1, 'a window recorded two re-presses');
      }
    }
  });
});
