// tests/job-econ.test.mjs — J1: the economy core of THE JOB.
//
// AUTHORITY: COMPOSED-GAME.md G1 (the ρ ladder, the shape/split table), G2 (loot, multipliers, fee,
// chain, crew forgiveness, rank), G3.1 (the two call ladders and the stake band), G3.2 (push or bag),
// G3.3 (the fee's proof of work), G6 (copy), G8 J1 (this ticket's acceptance list).
//
// THE RULE THIS SUITE FOLLOWS: every published numeral is COMPUTED from `site/data/job.js`'s
// constants and then compared against `PUBLISHED`. `PUBLISHED` is never the input to a computation.
// That is what makes "a constant that moves moves the table" true rather than aspirational.
//
// ONE PUBLISHED NUMERAL DOES NOT REPRODUCE, and the formula wins (BUILD-POLICY, and the ticket's own
// instruction): G3.2's deep table prints `0.796` for (chain 2, call 85); `θ* = m·P/(ρ̄·W·(m−1))`,
// `q* = θ*/(1+θ*)` gives 0.7954545… → **0.795** at 3 dp. The printed numeral is what you get by
// rounding θ* to 3 s.f. first (3.89/4.89 = 0.7955). Asserted as 0.795, recorded in notes/J1.md.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, listFiles, stripCommentsAndStrings } from './_helpers.mjs';

import {
  // the ladder and crew forgiveness
  rhoFor, isMiss, expectedRho, rhoBarFor,
  // the multipliers
  chainMult, coldFor, tellFor, guardMultFor, wingMult, wingPen, x2Mult, carryOf,
  // pricing one target
  lootFor, scopeOf, coldOf, postedFor, carryFor, missFor, applyDelta, settle,
  // the cover — G2's `min(LOOSE, ·)` applied to the PREMIUM as well as to the price (verify r1)
  coverFor, coverOf, coveredW, realisedMult,
  // banking
  bagFee, bagBank, bagBankExact, getawayBank, autoBank,
  // the chain
  transitionForRung, chainAfterTarget, chainAfterBag,
  // push or bag
  bagThenAnswer, pushThrough, pushMinusBag, isDeepPile, deepQStar, shallowQStar,
  breakevenQ, breakevenQExact, pushOrBag, carryEVAt, evMaxCallAt,
  // the stake band
  ratingWeight, creditFor, expectedCredit, honestRung, wTimesEc, wTimesEcDiscrete,
  stakePeak, stakeBand, isInformative, STAKE_DOMAIN,
  // the regret line
  playOrder, optimalOrder, regretLine,
  // the published tables
  lootPerAnswerMinute, lootPerExperiencedMinute, lootPerMinuteRows,
  lootMean, answerSeconds, decisionSeconds, fixedSeconds, shapeTable, decisionCount, landedBriefs,
  gainLFor, lossLFor, stakeLFor,
  // helpers and re-exports
  round, r3, LOOT, LADDER, CHAIN, FEE, TELL, COMPLETION, COLD, MISS_RUNG, RUNG_BANDS,
} from '../site/js/job/econ.js';

/* J2's call ladder — this file owns the carry side and `call.js` owns the rating side, and §3c is
   the one place the two have to be compared (verify round 2, exploit-hunt). */
import { honestCall, carryIndifference, disagreementBands } from '../site/js/job/call.js';

import * as JOB from '../site/data/job.js';
import { scopeFor } from '../site/js/xp.js';
import { INTERVALS } from '../site/js/schedule.js';
import { LIMITS } from '../site/js/page.js';
import { skills, TOTAL_WEIGHT, SKILL_IDS } from '../site/data/skills.js';
import { AREAS, MISCONCEPTIONS } from '../site/data/misconceptions.js';

const P = JOB.PUBLISHED;
const CALLS = [50, 70, 85, 95];
const near = (a, b, eps, m) => assert.ok(Math.abs(a - b) <= eps, `${m ?? ''} expected ${b} ± ${eps}, got ${a}`);

/* =========================================================================================
   1. Loot per minute — both rows, both monotone (G2 "Loot", G3.7 brake (a))
   ========================================================================================= */

describe('J1 · loot per minute: both published rows, both monotone', () => {
  test('loot per ANSWER minute is 12.0 / 12.0 / 12.7 / 14.0, computed from L and minutesPerTier', () => {
    const row = [1, 2, 3, 4].map((t) => round(lootPerAnswerMinute(t), 1));
    assert.deepEqual(row, P.lootPerAnswerMinute);
    // and it really is L / minutes, not a table
    assert.equal(lootPerAnswerMinute(3), 38 / 3);
    assert.equal(lootPerAnswerMinute(4), 14);
  });

  test('loot per EXPERIENCED minute is 8.2 / 9.5 / 10.9 / 12.5 — answer + that tier’s decision seconds', () => {
    const row = [1, 2, 3, 4].map((t) => round(lootPerExperiencedMinute(t), 1));
    assert.deepEqual(row, P.lootPerExperiencedMinute);
    // the denominators, spelled out: 30+14 s · 90+24 s · 180+30 s · 300+36 s
    near(lootPerExperiencedMinute(1), 6 / (44 / 60), 1e-12);
    near(lootPerExperiencedMinute(2), 18 / (114 / 60), 1e-12);
    near(lootPerExperiencedMinute(3), 38 / (210 / 60), 1e-12);
    near(lootPerExperiencedMinute(4), 70 / (336 / 60), 1e-12);
  });

  test('both rows are monotone non-decreasing in tier, so tier-1 spam is the worst carry rate', () => {
    const { answer, experienced } = lootPerMinuteRows();
    for (const row of [answer, experienced]) {
      for (let i = 1; i < row.length; i++) {
        assert.ok(row[i] >= row[i - 1], `row not monotone at tier ${i + 1}: ${row.join(' / ')}`);
      }
    }
    // unrounded too — rounding must not be doing the work
    for (const f of [lootPerAnswerMinute, lootPerExperiencedMinute]) {
      for (let t = 2; t <= 4; t++) assert.ok(f(t) >= f(t - 1) - 1e-12, `unrounded ${f.name} dips at tier ${t}`);
    }
  });

  test('the mirrored minute model IS page.js LIMITS.minutesPerTier (no friendlier invented numbers)', () => {
    assert.deepEqual({ ...JOB.ANSWER_MINUTES_PER_TIER }, { ...LIMITS.minutesPerTier });
  });
});

/* =========================================================================================
   2. The ρ ladder and the E[ρ] table — from LADDER alone (G1, G2 "The build decision")
   ========================================================================================= */

describe('J1 · the ρ ladder and rhoFor(rung, rank)', () => {
  test('LADDER = [1.00, 0.70, 0.45, 0.20, 0], indexed by rung', () => {
    assert.deepEqual([...LADDER], [1.00, 0.70, 0.45, 0.20, 0]);
    assert.equal(LADDER[MISS_RUNG], 0, 'the miss rung pays nothing — that is what makes it a loss');
  });

  test('ρ_eff = LADDER[max(0, rung − rank)] — crew forgives rungs, and a forgiven miss is not a miss', () => {
    for (let rung = 0; rung < LADDER.length; rung++) {
      for (let rank = 0; rank <= 2; rank++) {
        assert.equal(rhoFor(rung, rank), LADDER[Math.max(0, rung - rank)], `rung ${rung} rank ${rank}`);
      }
    }
    assert.equal(rhoFor(1, 1), 1.00, 'STEADY: 1-hint pays clean');
    assert.equal(rhoFor(2, 1), 0.70);
    assert.equal(rhoFor(3, 1), 0.45);
    assert.equal(rhoFor(4, 1), 0.20, 'STEADY: a miss pays 0.20');
    assert.equal(rhoFor(4, 2), 0.45, 'HELD: a miss pays 0.45');
    assert.equal(isMiss(4, 0), true);
    assert.equal(isMiss(4, 1), false, 'at STEADY the miss rung is forgiven, so there is no loss');
  });

  test('the published E[ρ] table reproduces to 3 dp FROM LADDER ALONE: .940/.972/.989 · .746/.853 · .562/.725', () => {
    for (const [mShown, row] of Object.entries(P.rhoTable)) {
      const band = RUNG_BANDS[mShown];
      assert.ok(band, `a shipped rung band exists for m_shown ${mShown}`);
      near(band.reduce((a, b) => a + b, 0), 1, 1e-12, `band ${mShown} sums to 1`);
      for (const [key, published] of Object.entries(row)) {
        if (published == null) continue;            // r2 is n/a: HELD requires mastery.isMastered
        const rank = Number(key.slice(1));
        assert.equal(r3(expectedRho(band, rank)), published, `E[ρ] m${mShown} r${rank}`);
      }
    }
  });

  test('HELD is n/a below mastery, and the two Δρ the design argues from are the table’s own', () => {
    assert.equal(P.rhoTable[60].r2, null);
    assert.equal(P.rhoTable[40].r2, null);
    // Δρ figures are differences of the ROUNDED table values, as G2/G3.7 #8 print them
    const rho = (m, r) => r3(expectedRho(RUNG_BANDS[m], r));
    assert.equal(r3(rho(40, 1) - rho(40, 0)), P.deltaRhoSteadyM40, 'STEADY on an m40 make is +0.163');
    assert.equal(r3(rho(85, 2) - rho(85, 0)), P.deltaRhoHeldM85, 'HELD on an m85 make is +0.049');
    assert.equal(r3(rho(85, 0) - rho(40, 0)), P.deltaRhoMasteryM40toM85, 'mastery is +0.378');
    // the anti-tanking result: mastery strictly dominates forgiveness
    assert.ok(P.deltaRhoMasteryM40toM85 > P.deltaRhoSteadyM40 * 2, 'mastery beats STEADY by more than double');
  });

  test('expectedRho takes a distribution, a sparse object or one realised rung', () => {
    near(expectedRho([1, 0, 0, 0, 0], 0), 1, 1e-12);
    near(expectedRho({ 0: 0.5, 4: 0.5 }, 0), 0.5, 1e-12);
    assert.equal(expectedRho(2, 0), 0.45, 'a number is one realised rung');
    assert.equal(rhoBarFor(null), 1, 'ρ̄ = 1 is the optimistic bound G3.2’s published table uses');
  });
});

/* =========================================================================================
   3. The chain — four transitions, xp.comboTransition() verbatim plus two (G2, G12 #3)
   ========================================================================================= */

describe('J1 · the chain: four transitions', () => {
  test('m_chain = 1 + 0.2·min(chain, 8), cap ×2.6', () => {
    assert.equal(chainMult(0), 1);
    assert.equal(chainMult(1), 1.2);
    assert.equal(r3(chainMult(2)), 1.4);
    assert.equal(r3(chainMult(4)), 1.8);
    assert.equal(r3(chainMult(6)), 2.2);
    assert.equal(r3(chainMult(8)), CHAIN.multCap);
    assert.equal(r3(chainMult(40)), CHAIN.multCap, 'capped at 8');
  });

  test('xp.comboTransition() verbatim: clean increments · Gold-with-H1 holds · anything else resets', () => {
    assert.equal(transitionForRung(0), 'increment');
    assert.equal(transitionForRung(1), 'hold');
    assert.equal(transitionForRung(2), 'reset');
    assert.equal(transitionForRung(3), 'reset');
    assert.equal(transitionForRung(4), 'reset');
    assert.equal(chainAfterTarget(0, 0, 4), 5);
    assert.equal(chainAfterTarget(1, 0, 4), 4);
    assert.equal(chainAfterTarget(2, 0, 4), 0);
    assert.equal(chainAfterTarget(4, 0, 4), 0);
  });

  test('addition 1 — a non-clean outcome on a HELD make at chain ≥ 3 HOLDS; STEADY never holds', () => {
    for (const rung of [2, 3, 4]) {
      assert.equal(chainAfterTarget(rung, 2, 3), 3, `HELD holds at chain 3, rung ${rung}`);
      assert.equal(chainAfterTarget(rung, 2, 7), 7);
      assert.equal(chainAfterTarget(rung, 2, 2), 0, 'below chain 3 HELD does not hold');
      assert.equal(chainAfterTarget(rung, 1, 7), 0, 'STEADY buys forgiveness, not the hold');
    }
    assert.equal(CHAIN.holdMinChain, 3);
  });

  test('the hold is suppressed on the make’s own due review — the crew stands down there (G12 #4)', () => {
    assert.equal(chainAfterTarget(3, 2, 6, { idle: true }), 0);
    assert.equal(chainAfterTarget(3, 2, 6, { idle: false }), 6);
  });

  test('addition 2 — chainAfterBag() returns 0. Banking ENDS the run of luck (G12 #3)', () => {
    assert.equal(chainAfterBag(), 0);
    assert.equal(chainMult(chainAfterBag()), 1, 'which is the m_chain = 1 term the §3.2 table depends on');
  });
});

/* =========================================================================================
   4. Banking and the fee (G2, G3.3)
   ========================================================================================= */

describe('J1 · banking: the fee, and what the prompt prints', () => {
  test('FEE is 0.10 mid-job and the getaway bag is free', () => {
    assert.equal(FEE, 0.10);
    assert.equal(JOB.GETAWAY_FEE, 0);
    assert.equal(getawayBank(131), 131);
  });

  test('bagFee + bagBank always add back up to LOOSE, so `bag 131 (fee 13)` → `bagged 118` is exact', () => {
    assert.equal(bagFee(131), 13);
    assert.equal(bagBank(131), 118);
    near(bagBankExact(131), 117.9, 1e-9);
    for (let s = 0; s <= 400; s++) {
      assert.equal(bagFee(s) + bagBank(s), s, `fee + bank must equal LOOSE at ${s}`);
      assert.ok(bagFee(s) >= 0 && bagBank(s) >= 0);
      assert.ok(Math.abs(bagBank(s) - bagBankExact(s)) <= 0.5, `bank stays within half a unit of 0.9·S at ${s}`);
    }
  });

  test('a non-bag exit auto-banks 50 %; 22:00 and a bound COMMIT bank in full (never catastrophic)', () => {
    assert.equal(autoBank(63, 'walk'), 32);
    assert.equal(autoBank(63, 'quiet22'), 63);
    assert.equal(autoBank(63, 'commit'), 63);
    assert.ok(autoBank(100, 'walk') < bagBank(100), 'quitting is never better than banking');
  });

  test('G3.3 — the fee is why bagging is not automatic: PUSH − BAG > 0 for all q at c = 0, L = 6, call 70', () => {
    const f = P.feeProof;
    const state = { loose: f.S, chain: f.chain, L: f.L, call: f.call, q: 0 };
    near(FEE * f.S, f.feeTerm, 1e-9, 'the fee term');
    const { P: pen } = carryOf(f.call);
    near(Math.min(f.S, f.L * 1 * pen), f.lossTerm, 1e-9, 'the truncated loss term');
    for (let i = 0; i <= 20; i++) {
      const q = i / 20;
      assert.ok(pushMinusBag({ ...state, q }) > 0, `the decision must be live at q = ${q.toFixed(2)}`);
    }
    // and WITHOUT the fee it would be dominated at every q — the counterfactual G3.3 argues from
    for (let i = 0; i <= 20; i++) {
      const q = i / 20;
      const noFee = 0 * f.S + q * f.L * 1 * carryOf(f.call).W * (1 - 1) - (1 - q) * Math.min(f.S, f.L * pen);
      assert.ok(noFee <= 0, `without the fee, bagging dominates at q = ${q.toFixed(2)}`);
    }
  });
});

/* =========================================================================================
   5. Push or bag (G3.2)
   ========================================================================================= */

describe('J1 · push or bag', () => {
  test('pushMinusBag === pushThrough − bagThenAnswer, and the BAG branch uses m = 1', () => {
    for (const chain of [0, 1, 2, 4, 6, 8, 12]) {
      for (const call of CALLS) {
        for (const loose of [0, 5, 50, 300, 1000]) {
          for (const q of [0, 0.3, 0.5, 0.8, 1]) {
            const st = { loose, chain, L: 70, call, q };
            near(pushMinusBag(st), pushThrough(st) - bagThenAnswer(st), 1e-9, `c${chain} ${call} S${loose} q${q}`);
          }
        }
      }
    }
    // the m = 1 term, isolated: BAG-then-answer is invariant to the chain you just threw away
    const a = bagThenAnswer({ loose: 300, chain: 0, L: 70, call: 85, q: 0.8 });
    const b = bagThenAnswer({ loose: 300, chain: 8, L: 70, call: 85, q: 0.8 });
    assert.equal(a, b, 'BAG resets the chain, so its branch cannot read the old chain');
    /* `1.0`, not `1.8`: a bag empties the pile, so the call that follows one is uncovered and pays
       `W(50)`. That collapse IS the brake on bag-every-beat (G3.1, `econ.coverFor`). */
    near(a, 0.9 * 300 + 0.8 * 70 * 1 * 1 * 1.0, 1e-9);
  });

  test('the two worked rows reproduce exactly: (−12, BAG) and (+133.20, PUSH)', () => {
    const [r1, r2] = P.workedRows;
    const s1 = { loose: r1.S, chain: r1.chain, L: r1.L, call: r1.call, q: r1.q };
    assert.equal(isDeepPile(s1), true, 'L·m·P = 140 < 300 → deep');
    near(pushMinusBag(s1), r1.pushMinusBag, 1e-9);
    assert.equal(pushOrBag(s1), 'bag');

    const s2 = { loose: r2.S, chain: r2.chain, L: r2.L, call: r2.call, q: r2.q };
    assert.equal(isDeepPile(s2), false, 'L·m·P = 308 > 300 → shallow');
    near(pushMinusBag(s2), r2.pushMinusBag, 1e-9);
    assert.equal(pushOrBag(s2), 'push');
    /* the arithmetic the document writes out: 30 + 163.20 − 60. The gain term is `m·W_push − W_bag`
       — the pile covers 300/308 of this call, so `W_push = 1.779` and the bag branch pays `W(50)`. */
    const coverAt2 = Math.min(1, 300 / (70 * chainMult(6) * carryOf(85).P));
    near(coverAt2, 300 / 308, 1e-12);
    near(0.8 * 70 * (chainMult(6) * coveredW(85, coverAt2) - coveredW(85, 0)), 163.2, 1e-9);
    near(0.8 * 70 * 1 * 1.8 * 1.2, 120.96, 1e-9, 'the PRE-COVER term, kept so the move is legible');
  });

  test('the G3.2 DEEP table reproduces to 3 dp at ρ̄ = 1 — with the one published typo corrected', () => {
    for (const [chainKey, row] of Object.entries(P.deepQ)) {
      const chain = Number(chainKey);
      near(chainMult(chain), row.m, 1e-12, `m at chain ${chain}`);
      for (const call of [70, 85, 95]) {
        const st = { loose: Number.MAX_SAFE_INTEGER, chain, L: 70, call };
        assert.equal(isDeepPile(st), true);
        assert.equal(r3(deepQStar(st)), row[call], `q* chain ${chain} call ${call}`);
        // `deepQStar` is the TABLE's form and this is the only thing pinned to the table. The number
        // the app prints is `breakevenQ`, the true root of `pushMinusBag` (G3.2: "the app … prints
        // the true threshold"), and on this state — a pile of 9e15 against a 252-loot loss — the fee
        // term the table drops is the whole decision. Asserting the table against the PRINTED number
        // was what let the deep branch ship a q* that contradicted the app's own push/bag arithmetic.
        assert.equal(breakevenQ(st), breakevenQExact(st), 'the printed threshold is the true root');
        assert.equal(breakevenQ(st), 0, 'on a 9e15 pile the 10 % fee alone pays for the push at any q');
        assert.ok(pushMinusBag({ ...st, q: 0 }) > 0, 'and the app’s own arithmetic agrees — so the table’s q* would be a lie on screen');
        assert.ok(breakevenQ(st) <= deepQStar(st) + 1e-12, 'dropping the fee can only make the table HARDER than the truth');
      }
    }
    // the recorded disagreement: the FORMULA gives 0.795; G3.2 prints 0.796 (θ* rounded to 3 s.f. first)
    const st = { loose: Number.MAX_SAFE_INTEGER, chain: 2, L: 70, call: 85 };
    near(deepQStar(st), 0.7954545454545454, 1e-12);
    assert.equal(r3(deepQStar(st)), 0.795);
    assert.equal(P.deepQAsPrinted[2][85], 0.796, 'the printed numeral is kept on record, not asserted as truth');
    near(3.89 / 4.89, 0.7955, 1e-4, 'and this is where 0.796 came from');
  });

  test('q* is independent of L and of the pile in the deep branch, and falls as the chain deepens', () => {
    for (const L of [6, 18, 38, 70]) {
      for (const call of [70, 85, 95]) {
        const a = deepQStar({ loose: 1e9, chain: 4, L, call });
        const b = deepQStar({ loose: 1e12, chain: 4, L: 70, call });
        near(a, b, 1e-12, `deep q* must not read L (${L}) or S`);
      }
    }
    for (const call of [70, 85, 95]) {
      const seq = [1, 2, 4, 8].map((c) => deepQStar({ loose: 1e9, chain: c, L: 70, call }));
      for (let i = 1; i < seq.length; i++) assert.ok(seq[i] < seq[i - 1], `q* must fall as the chain deepens (call ${call})`);
    }
  });

  test('the SHALLOW-pile q* is exactly 0.9 at c = 0, for every L and every pile and every call', () => {
    for (const L of [1, 6, 18, 38, 70, 1000]) {
      for (const call of CALLS) {
        for (const loose of [1, 7, 50, 300, 9999]) {
          const q = shallowQStar({ loose, chain: 0, L, call });
          near(q, P.shallowQAtChain0, 1e-12, `L ${L} call ${call} S ${loose}`);
        }
      }
    }
    assert.equal(P.shallowQAtChain0, 0.9);
    // and the escalation runs the OTHER way from a slot machine: the threshold falls as the chain grows
    const seq = [0, 1, 2, 4, 8].map((c) => shallowQStar({ loose: 50, chain: c, L: 70, call: 85 }));
    for (let i = 1; i < seq.length; i++) assert.ok(seq[i] < seq[i - 1], 'shallow q* must fall as the chain deepens');
  });

  /* ---------------------------------------------------------------------------------------
     THE ESCALATION, ON THE NUMBER THAT IS ACTUALLY PRINTED.  (round 2, econ-math finding 1.)

     Both escalation tests above pin `deepQStar` and `shallowQStar` — the two forms econ.js's own
     comment says are the published TABLE's and are NOT what goes on screen. Nothing anywhere
     asserted the direction for `breakevenQ`, and the direction is not the same:

       · SHALLOW pile, S > 0 — the printed threshold strictly FALLS as the chain deepens, exactly
         as G3.2 says. 241 of 241 states in the sweep below.
       · DEEP pile — it can RISE. 145 of 543. `0.10·S` is the one term that does NOT scale with
         `m_chain`, so once the pile is deep enough to pay the loss outright the fee's head start
         at `m = 1` is spent and `q*` climbs toward `L_loss·P / (L_gain·ρ̄·W + L_loss·P)`.
         `L 70, S 300, call 70` goes 0.2857 → 0.2914 → 0.2939 → 0.2961 → 0.2977.

     The fee is precisely the term G3.2's deep table drops, so "as the chain deepens q* FALLS while
     the amount at risk GROWS" is a statement about the fee-free form. On a deep pile the number on
     screen does the other thing, and a student reading the sentence would be misled. See Requests
     in notes/tests-fix.md.
     --------------------------------------------------------------------------------------- */
  test('the PRINTED q* falls with the chain on a shallow pile — and can RISE on a deep one', () => {
    const CH = [0, 1, 2, 4, 8];
    const MULTS = [{}, { scope: 1.25 }, { cold: 1.5 }, { tell: true }, { tokens: 2 }, { guarded: true, rank: 2 }, { x2: true }];
    let shallowRuns = 0; let deepRuns = 0; let deepRising = 0;
    for (const loose of [8, 20, 50, 100, 150, 300, 500, 2000]) {
      for (const L of [6, 18, 38, 70]) {
        for (const call of CALLS) {
          for (const t of MULTS) {
            const at = (c) => ({ target: { loot: L, ...t }, loose, chain: c, call });
            const seq = CH.map((c) => breakevenQ(at(c)));
            const deeps = CH.map((c) => isDeepPile(at(c)));
            const where = `S${loose} L${L} call${call} ${JSON.stringify(t)} → ${seq.map((v) => v.toFixed(4)).join(' ')}`;
            if (deeps.every((d) => !d)) {
              shallowRuns++;
              for (let i = 1; i < seq.length; i++) {
                assert.ok(seq[i] < seq[i - 1], `a SHALLOW pile's printed q* must fall as the chain deepens: ${where}`);
              }
            } else if (deeps.every((d) => d)) {
              deepRuns++;
              if (seq.some((v, i) => i > 0 && v > seq[i - 1] + 1e-12)) deepRising++;
            }
          }
        }
      }
    }
    assert.ok(shallowRuns > 200, `${shallowRuns} all-shallow ladders`);
    assert.ok(deepRuns > 400, `${deepRuns} all-deep ladders`);
    assert.ok(deepRising > 100,
      `only ${deepRising} of ${deepRuns} deep ladders escalate the slot-machine way — if this reaches 0 the fee `
      + 'has started scaling with the chain and G3.2’s sentence is true of the printed number after all');

    // the worked case, spelled out, so the direction is on the record as a number
    const rising = (c) => breakevenQ({ L: 70, loose: 300, chain: c, call: 70 });
    for (const c of CH) assert.equal(isDeepPile({ L: 70, loose: 300, chain: c, call: 70 }), true);
    for (let i = 1; i < CH.length; i++) assert.ok(rising(CH[i]) > rising(CH[i - 1]), 'the deep ladder rises');
    near(rising(0), 0.1714, 1e-4);      // 0.2857 before the cover — the bag branch lost its premium
    near(rising(8), 0.2694, 1e-4);      // 0.2977 before it
    // …and the TABLE's form says the opposite on that very state, which is the whole point
    const table = CH.map((c) => deepQStar({ L: 70, loose: 300, chain: c, call: 70 }));
    for (let i = 1; i < table.length; i++) assert.ok(table[i] < table[i - 1], 'the table’s fee-free form falls');
  });

  test('breakevenQExact is the true root of pushMinusBag in both branches', () => {
    for (const chain of [0, 1, 3, 5, 8]) {
      for (const call of [70, 85, 95]) {
        for (const loose of [10, 90, 300, 2000]) {
          const st = { loose, chain, L: 70, call };
          const q = breakevenQExact(st);
          if (q > 1e-9 && q < 1 - 1e-9) {
            near(pushMinusBag({ ...st, q }), 0, 1e-6, `root at c${chain} ${call} S${loose}`);
            assert.ok(pushMinusBag({ ...st, q: q + 1e-4 }) > 0, 'above the root, PUSH');
            assert.ok(pushMinusBag({ ...st, q: q - 1e-4 }) < 0, 'below the root, BAG');
          }
        }
      }
    }
    /* THE SHALLOW BRANCH AND THE PUBLISHED SHALLOW FORM ARE NO LONGER THE SAME NUMBER, and that is
       a consequence of the cover rather than a drift: `shallowQStar` is G3.2's *uncovered* closed
       form (`0.9·S/(L·ρ̄·W·(m−1) + S)`, the one Settings prints and the one the document tabulates),
       while `breakevenQExact` is the root of the arithmetic the app actually pays, whose gain term
       is `m·W_push − W_bag`. The relation is one-sided and pinned as such: the printed threshold is
       always at least the published one, because the covered gain term is the larger of the two
       (`m·W_eff − 1 ≥ W(m−1)` for `W ≥ 1`), and they coincide exactly where the premium is 0. */
    const sh = { loose: 50, chain: 4, L: 70, call: 85 };
    assert.equal(isDeepPile(sh), false);
    assert.ok(breakevenQExact(sh) > shallowQStar(sh),
      `the covered root must sit above the published form: ${breakevenQExact(sh)} vs ${shallowQStar(sh)}`);
    for (const chain of [0, 2, 5, 8]) {
      for (const loose of [5, 40, 120]) {
        const st50 = { loose, chain, L: 70, call: 50 };
        if (!isDeepPile(st50)) near(breakevenQExact(st50), shallowQStar(st50), 1e-12,
          'at call 50 there is no premium to cover, so the two forms are one number');
      }
    }
  });

  /* ---------------------------------------------------------------------------------------
     THE NUMBER THE APP PRINTS MUST AGREE IN SIGN WITH THE DECISION THE APP MAKES.
     (round-1 critic finding 2.) The suite pinned `deepQStar` against the published table and
     `breakevenQExact` against the root, and nowhere asserted that the q* on SCREEN and the
     push/bag the app acts on are the same economy. They were not: the deep branch dropped
     `0.10·S`, the dominant term precisely when the pile is deep.
     --------------------------------------------------------------------------------------- */
  /*
     ROUND 2 (econ-math, finding 1). "Anywhere on the grid" was not anywhere: the grid below used to
     be `loose × chain × L × call` and nothing else — `scope`, `guarded`, `tokens`, `cold`, `tell`
     and `x2` never appeared in it — and both sides of the comparison were `breakevenQ` and
     `pushMinusBag`, which at the time shared the identical omission. A model asserted against
     itself, on the one slice of the state space where the omission cannot show. It could not fail
     for the reason it is named after.

     The grid now carries every multiplier the two branches disagree about, and the right-hand side
     is `pushMinusBagFromPayout` — PUSH − BAG rebuilt from `carryFor` / `missFor` / `bagBankExact`,
     the functions that actually move LOOSE. The closed form is still checked as the ROOT (it is the
     thing printed, and it is exact), but the VERDICT either side of it is now checked against the
     money.
  */
  test('the PRINTED threshold never contradicts the app’s own push/bag arithmetic, anywhere on the grid', () => {
    let deep = 0; let shallow = 0; let multiplied = 0; let crossChecked = 0;
    /* the six factors, off and on, as one axis — the full cross would be 300 k states */
    const MULTS = [
      { name: 'bare' },
      { name: 'review scope', scope: 1.25 },
      { name: 'mastered scope', scope: 0.5 },
      { name: 'cold', cold: 1.5 },
      { name: 'tell', tell: true },
      { name: '2 tokens', tokens: 2 },
      { name: 'guarded r1', guarded: true, rank: 1 },
      { name: 'guarded r5', guarded: true, rank: 5 },
      { name: '×2', x2: true },
      { name: 'everything', scope: 1.25, cold: 1.5, tell: true, tokens: 3, x2: true },
      { name: 'everything, guarded', scope: 1.25, cold: 1.5, tell: true, guarded: true, rank: 3, x2: true },
    ];
    for (const loose of [0, 20, 50, 100, 150, 300, 500]) {
      for (const chain of [0, 1, 2, 3, 4, 6, 8]) {
        for (const L of [6, 18, 38, 70]) {
          for (const call of CALLS) {
            for (const mult of MULTS) {
              const { name, ...t } = mult;
              const st = { loose, chain, L, call, target: { loot: L, ...t } };
              if (isDeepPile(st)) deep++; else shallow++;
              if (Object.keys(t).length) multiplied++;
              const qs = breakevenQ(st);
              for (const q of [0, 0.05, 0.25, 0.5, 0.62, 0.7, 0.8, 0.9, 0.95, 1]) {
                const d = pushMinusBag({ ...st, q });
                const where = `${name} S${loose} c${chain} L${L} call${call} q${q} (q* ${qs.toFixed(4)})`;
                if (q >= qs) assert.ok(d >= -1e-9, `q ≥ q* must mean PUSH pays: ${where}`);
                if (q < qs) assert.ok(d <= 1e-9, `q < q* must mean BAG pays: ${where}`);
                /* …and the same verdict out of the PAYOUT functions, which is the half the old grid
                   could not check: `carryFor`/`missFor` round to whole loot, so only states clear of
                   that rounding band are compared. */
                const paid = pushMinusBagFromPayout({ ...st, q });
                if (Math.abs(paid) > 1.5) {
                  crossChecked++;
                  if (q >= qs) assert.ok(paid > 0, `q ≥ q* and PUSHING LOSES REAL LOOT: ${where} (${paid.toFixed(2)})`);
                  if (q < qs) assert.ok(paid < 0, `q < q* and BAGGING LOSES REAL LOOT: ${where} (${paid.toFixed(2)})`);
                }
              }
            }
          }
        }
      }
    }
    assert.ok(deep > 100 && shallow > 100, `both branches must be exercised (deep ${deep}, shallow ${shallow})`);
    assert.ok(multiplied > 5000, `${multiplied} of the grid's states carry a multiplier — this is the axis round 2 added`);
    assert.ok(crossChecked > 5000, `${crossChecked} states were compared against carryFor/missFor rather than against the model`);
    // the two states the critic named, spelled out
    const c0 = { loose: 50, chain: 0, L: 6, call: 70 };          // deep, no chain
    assert.equal(isDeepPile(c0), true);
    assert.equal(deepQStar(c0), 1, 'the TABLE’s form says "you would need certainty"');
    assert.ok(pushMinusBag({ ...c0, q: 0.5 }) > 0, '…in a state where pushing strictly pays');
    assert.ok(breakevenQ(c0) < 1, 'so the printed threshold cannot be the table’s form');
    const t2 = { loose: 8, chain: 0, L: 6, call: 70 };            // target 2 after one clean T1 @ 70
    assert.equal(isDeepPile(t2), true, 'an ordinary mid-RUN state is already DEEP');
    assert.ok(breakevenQ(t2) < deepQStar(t2));
  });

  /* ---------------------------------------------------------------------------------------
     THE THRESHOLD IS THE THRESHOLD OF THE APP'S OWN MONEY (round-2 critic finding 1).

     `stateL` was `loot · mult` and both branches got it, so `scope · wing · cold · tell · ×2`
     were missing from the gain and `wing_pen · ×2` from the loss. The screen printed the SAME
     q* whether a miss cost 22 or 43, and the verdict flipped in 5 of 5 realistic states. The
     invariant below is the one the suite never had: the printed threshold is the root of a
     PUSH − BAG built out of `carryFor` and `missFor` — the functions that actually move LOOSE
     — not out of a second copy of the model.
     --------------------------------------------------------------------------------------- */

  /** PUSH − BAG rebuilt from the payout functions themselves. Deliberately not the implementation. */
  function pushMinusBagFromPayout(st) {
    const S = Math.max(0, st.loose ?? 0);
    const q = st.q ?? 0;
    const t = st.target ?? st;
    const call = st.call ?? 50;
    const crew = st.crew ?? 0;
    const rungs = st.rungs ?? null;
    /* THE PILE IS AN ARGUMENT ON BOTH BRANCHES (verify r1): it caps the miss AND covers the call's
       premium (`econ.coverFor`). The BAG branch is answered at `LOOSE = 0` — a bag empties the pile
       — which is where its `W` falls to `W(50)`. Passing `Infinity` here would rebuild the
       PRE-COVER economy and the identity below would be checking two different games. */
    const gain = carryFor(t, call, st.chain ?? 0, rungs, crew, S);        // the clear branch, as paid
    const bagged = carryFor(t, call, chainAfterBag(), rungs, crew, 0);    // …after the bag's chain reset
    const loss = missFor(t, call, st.chain ?? 0, S, crew);             // ≤ 0, as charged
    return (S + q * gain + (1 - q) * loss) - (bagBankExact(S) + q * bagged);
  }

  test('the printed q* is the root of a PUSH − BAG built from carryFor/missFor, on priced targets', () => {
    /* every factor the two branches disagree about, switched on one at a time and together */
    const TARGETS = [
      { name: 'bare T1', t: { tier: 1 } },
      { name: 'bare T4', t: { tier: 4 } },
      { name: 'review, cold, tagged, 2 tokens', t: { tier: 2, scope: 1.25, cold: 1.5, tell: true, tokens: 2 } },
      { name: 'guarded wing, rank 2', t: { tier: 1, guarded: true, rank: 2 } },
      { name: 'guarded wing, rank 5, cold', t: { tier: 4, guarded: true, rank: 5, cold: 1.5 } },
      { name: 'mastered (scope 0.5)', t: { tier: 2, scope: 0.5 } },
      { name: 'the ×2 posting', t: { tier: 1, x2: true } },
      { name: 'guarded ×2 tagged', t: { tier: 3, guarded: true, rank: 1, x2: true, tell: true } },
    ];
    let checked = 0; let moved = 0;
    for (const { name, t } of TARGETS) {
      for (const S of [0, 12, 60, 200]) {
        for (const chain of [0, 2, 4, 8]) {
          for (const call of CALLS) {
            const st = { target: t, loose: S, chain, call, rungs: null, crew: 0 };
            const qs = breakevenQ(st);
            const where = `${name} S${S} c${chain} call${call} q* ${qs.toFixed(3)}`;
            checked++;
            /* the closed form and the payout-built form must not disagree about the VERDICT.
               (`carryFor`/`missFor` round to whole loot, so the two roots differ by at most that
               rounding — the sign either side of q* is what the student is shown.) */
            for (const q of [0, 0.25, 0.5, 0.75, 1]) {
              const mine = pushMinusBag({ ...st, q });
              const theirs = pushMinusBagFromPayout({ ...st, q });
              if (Math.abs(theirs) > 1.5) {          // clear of the rounding band
                assert.equal(Math.sign(mine) === Math.sign(theirs), true,
                  `PUSH−BAG sign disagrees with the payout at q ${q}: ${where} (${mine.toFixed(2)} vs ${theirs.toFixed(2)})`);
              }
            }
            if (qs > 0 && qs < 1) {
              near(pushMinusBag({ ...st, q: qs }), 0, 1e-9, `not a root: ${where}`);
              moved++;
            }
          }
        }
      }
    }
    assert.ok(checked === TARGETS.length * 4 * 4 * 4 && moved > 100, `${checked} states, ${moved} interior roots`);
  });

  test('wing_pen, the ×2 and the gain-side multipliers each MOVE the printed threshold', () => {
    const at = (t) => breakevenQ({ target: t, loose: 60, chain: 4, call: 85, rungs: null, crew: 0 });
    /* the critic's isolation: same target, same state, the miss costs 22 or 43 */
    const unguarded = { tier: 1, guarded: false, rank: 2 };
    const guarded = { tier: 1, guarded: true, rank: 2 };
    assert.equal(Math.abs(missFor(unguarded, 85, 4, 60, 0)), 22);
    assert.equal(Math.abs(missFor(guarded, 85, 4, 60, 0)), 43);
    /* Pinned as the MEASURED pair as well as the inequality: verify round 2 moved this number (the
       call's premium is now the same on both wings rather than riding the halved guard loot), and a
       bare `> 0.2` would not have said which way. The guard doubles the loss and cuts the loot, so
       the printed threshold rises by 23.8 points where it used to rise by 20.6. */
    near(at(unguarded), 0.4452, 5e-4, 'unguarded');
    near(at(guarded), 0.6828, 5e-4, 'guarded');
    assert.ok(at(guarded) - at(unguarded) > 0.2,
      `the guard doubles the loss and halves the payout: ${at(unguarded).toFixed(3)} vs ${at(guarded).toFixed(3)}`);
    /* every gain-side multiplier lowers the threshold; wing_pen raises it */
    const base = { tier: 2 };
    assert.ok(at({ ...base, scope: 1.25 }) < at(base), 'scope is in the gain branch');
    assert.ok(at({ ...base, cold: 1.5 }) < at(base), 'cold is in the gain branch');
    assert.ok(at({ ...base, tell: true }) < at(base), 'tell is in the gain branch');
    assert.ok(at({ ...base, tokens: 2 }) < at(base), 'wing tokens are in the gain branch');
    assert.ok(at({ ...base, scope: 0.5 }) > at(base), '…and a mastered target is worth less, so push later');
    /* …and NONE of them is in the loss branch, which is G2's deliberate asymmetry */
    for (const k of [{ scope: 1.25 }, { cold: 1.5 }, { tell: true }, { tokens: 2 }]) {
      assert.equal(lossLFor({ target: { ...base, ...k } }), lossLFor({ target: base }),
        `${Object.keys(k)[0]} must not scale a loss (G2)`);
    }
    /* the ×2 posting multiplies BOTH branches identically (G3.6 / G3.7 proof 1) */
    assert.equal(gainLFor({ target: { ...base, x2: true } }), 2 * gainLFor({ target: base }));
    assert.equal(lossLFor({ target: { ...base, x2: true } }), 2 * lossLFor({ target: base }));
  });

  test('gainLFor and lossLFor are carryFor’s and missFor’s own factor lists, by division', () => {
    for (const t of [{ tier: 1 }, { tier: 2, scope: 1.25, cold: 1.5, tell: true, tokens: 3 },
      { tier: 4, guarded: true, rank: 3, x2: true }, { tier: 3, mult: 2.5, guarded: true, rank: 1 }]) {
      for (const chain of [0, 3, 8]) {
        for (const call of [70, 85, 95]) {
          const { W, P: pen } = carryOf(call);
          const m = chainMult(chain);
          /* carryFor rounds at the end, so compare against the UNROUNDED sum it rounds. There are
             THREE factor lists now, not two (verify round 2): the target's worth on the gain set,
             the call's premium on the stake, and the miss's price on the loss set. `stakeLFor` is
             `lossLFor` without the crew-forgiveness zero. */
          /* tolerance is the rounding half-step plus float slack: `carryFor` rounds half UP, so a
             product that lands on exactly x.5 differs from the unrounded model by 0.5 and the two
             sides do not associate their floats identically. */
          near(gainLFor({ target: t }) * 1 * m + stakeLFor({ target: t }) * m * (W - 1),
            carryFor(t, call, chain, null, 0), 0.51,
            `clear: ${JSON.stringify(t)} c${chain} ${call}`);
          near(lossLFor({ target: t }) * m * pen, Math.abs(missFor(t, call, chain, 1e9, 0)), 0.5,
            `loss L: ${JSON.stringify(t)} c${chain} ${call}`);
          /* and each list is recoverable on its own: the 50 rung has no premium, so it is pure gain,
             and what a bolder rung adds over it is pure stake. */
          near(gainLFor({ target: t }) * m, carryFor(t, 50, chain, null, 0), 0.51, 'gain L, by the 50 rung');
          near(stakeLFor({ target: t }) * m * (W - 1),
            carryFor(t, call, chain, null, 0) - carryFor(t, 50, chain, null, 0), 1,
            `stake L: ${JSON.stringify(t)} c${chain} ${call}`);
        }
      }
    }
    // crew forgiveness removes the loss entirely — `missFor` returns 0, so the threshold must too
    const t = { tier: 2 };
    assert.equal(missFor(t, 85, 4, 300, 1), 0, 'a STEADY crew forgives the miss to a paying rung');
    assert.equal(lossLFor({ target: t, crew: 1 }), 0);
    assert.equal(breakevenQ({ target: t, loose: 300, chain: 4, call: 85, crew: 1 }), 0,
      'with no loss to take, pushing cannot lose to bagging at any q');
    assert.ok(breakevenQ({ target: t, loose: 300, chain: 4, call: 85, crew: 0 }) > 0);
  });

  /* ---------------------------------------------------------------------------------------
     WHICH WAY THE ESCALATION RUNS (round-2 critic finding 2).

     G3.2 bolds "as the chain deepens the threshold FALLS while the amount at risk GROWS".
     True of `shallowQStar` (and of `deepQStar`), false of the number the app PRINTS once the
     pile is deep, where the fee term `0.10·S` is what a shallow chain is fighting. The claim is
     now scoped in G3.2 and in `shallowQStar`'s docstring; this pins both directions so neither
     can be restated as unconditional.
     --------------------------------------------------------------------------------------- */
  test('the escalation claim holds on a SHALLOW pile and inverts on a deep one — both pinned', () => {
    const CH = [0, 1, 2, 3, 4, 5, 6, 8];
    const falls = (seq) => seq.every((v, i) => i === 0 || v <= seq[i - 1] + 1e-12);
    const rises = (seq) => seq.every((v, i) => i === 0 || v >= seq[i - 1] - 1e-12);

    // (a) the published closed forms: both monotone DOWN in the chain, every call
    for (const call of [70, 85, 95]) {
      assert.ok(falls(CH.map((c) => shallowQStar({ loose: 12, chain: c, L: 18, call }))), `shallowQStar ${call}`);
      assert.ok(falls(CH.map((c) => deepQStar({ loose: 1e9, chain: c, L: 18, call }))), `deepQStar ${call}`);
    }

    // (b) the SHALLOW pile the sentence describes: the printed threshold falls, hard
    const shallow = CH.map((c) => breakevenQ({ loose: 12, chain: c, L: 18, call: 95 }));
    assert.ok(falls(shallow), `printed q* must fall on a shallow pile: ${shallow.map((v) => v.toFixed(3))}`);
    /* `0.9 at c = 0 for every L` belongs to the CLOSED FORM and stays there. The printed number is
       lower, and the cover is why: with no chain the old gain term `W·(m−1)` was 0 ("pushing buys
       nothing but the fee"), while under the cover the PUSH branch keeps the premium its pile covers
       and the BAG branch drops to `W(50)`, so pushing buys something at every chain. Both pinned. */
    near(shallowQStar({ loose: 12, chain: 0, L: 18, call: 95 }), 0.9, 1e-9, 'the closed form is 0.9 at c = 0');
    near(shallowQStar({ loose: 12, chain: 0, L: 70, call: 95 }), 0.9, 1e-9, '…regardless of L');
    near(shallow[0], 0.726, 1e-3, 'the PRINTED c = 0 threshold is the covered one, not the closed form');
    assert.ok(shallow.at(-1) < 0.3, 'and a chain of 8 takes it under 0.3');
    near(shallow.at(-1), 0.247, 1e-3, 'the c = 8 end of the printed shallow walk');

    // (c) a DEEP pile at calls 70 and 85: it RISES. The document may not say otherwise.
    for (const call of [70, 85]) {
      const deep = CH.map((c) => breakevenQ({ loose: 200, chain: c, L: 18, call }));
      assert.ok(CH.every((c) => isDeepPile({ loose: 200, chain: c, L: 18, call })), `S = 200 is deep at ${call}`);
      assert.ok(rises(deep), `printed q* rises with the chain at call ${call}: ${deep.map((v) => v.toFixed(3))}`);
      assert.ok(deep.at(-1) > deep[0] + 1e-9, `strictly, at call ${call}`);
    }
    /* The mechanism, isolated. The deep root is `(L·m·P − 0.10·S) / (L·ρ̄·W·(m−1) + L·m·P)`. The fee
       enters as a FIXED credit toward pushing; the loss term it is subtracted from grows with the
       chain, so the credit is worth proportionally less at every step. Drop the fee and the same
       branch falls — which is exactly the form G3.2's table publishes, and why the table's direction
       is not the printed number's direction. */
    const st = (c) => ({ loose: 200, chain: c, L: 18, call: 85 });
    /* the deep root's gain term is `m·W_push − W_bag` under the cover (`W_push = W` on a deep pile,
       `W_bag = W(50)`), so `A = L·ρ̄·(m·W − 1)` where it used to read `L·ρ̄·W·(m − 1)`. */
    const A85 = (c) => 18 * 1 * (chainMult(c) * carryOf(85).W - coveredW(85, 0));
    const noFee = (c) => {
      const D = 18 * chainMult(c) * carryOf(85).P;
      return D / (A85(c) + D);
    };
    assert.ok(falls(CH.map(noFee)), 'without the fee the deep branch falls, as the table does');
    assert.ok(rises(CH.map((c) => breakevenQ(st(c)))), 'with it, the number on screen rises');
    assert.ok(breakevenQ(st(8)) > breakevenQ(st(0)));
    near(breakevenQ(st(0)), noFee(0) - (FEE * 200) / (A85(0) + 18 * chainMult(0) * carryOf(85).P), 1e-12,
      'the whole of the difference is the fee credit, divided by a denominator that grows');

    // and the 'amount at risk grows' half of the sentence is true everywhere
    const risk = CH.map((c) => Math.min(200, lossLFor({ L: 18 }) * chainMult(c) * carryOf(85).P));
    assert.ok(rises(risk) && risk.at(-1) > risk[0], 'the stake grows with the chain in both branches');
  });

  /* ---------------------------------------------------------------------------------------
     ROUND 3, econ-math. The round-2 scope note was answered with "but on a real play path the
     pile grows with the chain, so the printed q* falls anyway, which is what the Settings copy
     describes". It does not. Walking a job — clearing each target, banking nothing, letting S
     accumulate — leaves the printed threshold non-monotone, and on a cheap board it RISES for
     most of the job. So the falling direction cannot be rescued by moving from a fixed S to a
     played one; it belongs to `shallowQStar`/`deepQStar` and to nothing on screen.
     --------------------------------------------------------------------------------------- */
  test('a PLAY path does not rescue the claim either: the printed q* is not monotone in the chain', () => {
    /** clear every target at ρ̄ = 1, never bag: the state a job actually walks. The pile is passed
        to `carryFor` because the pile is what the cover reads — a walk priced without it is a walk
        through a game nobody plays (verify r1). */
    const walk = (tiers, call) => {
      let S = 0; let chain = 0;
      const qs = [];
      for (const tier of tiers) {
        const target = { tier };
        qs.push(breakevenQ({ target, loose: S, chain, call }));
        S += carryFor(target, call, chain, 1, 0, S);
        chain += 1;
      }
      return qs;
    };
    const falls = (seq) => seq.every((v, i) => i === 0 || v <= seq[i - 1] + 1e-12);

    // eight tier-1 clears at call 95 — the threshold RISES over beats 2…5 and ends above beat 2
    const cheap = walk([1, 1, 1, 1, 1, 1, 1, 1], 95);
    assert.equal(falls(cheap), false, `a play path is not monotone: ${cheap.map((v) => v.toFixed(3))}`);
    near(cheap[0], 0, 1e-12, 'beat 1 has nothing to lose, so q* is 0 — not the start of a falling curve');
    for (let i = 2; i <= 4; i++) {
      assert.ok(cheap[i] > cheap[i - 1], `beat ${i + 1} rises above beat ${i}: ${cheap[i - 1].toFixed(3)} → ${cheap[i].toFixed(3)}`);
    }
    /* The peak is at the END of the job, not at its first priced beat — the direct refutation of
       "falls with the chain". Pinned as the measured walk, because the shape moved once in verify
       round 1 (the cover) and again in verify round 2 (the premium moved onto the stake, so a 1-hint
       walk banks slightly less per beat). What does NOT move is the claim: beat 1 is 0, every later
       beat climbs, and the peak is the LAST beat — so the printed threshold does not fall with the
       chain on any of the three models this file has shipped. */
    /* Quoted as the printed line rather than as eight numeric literals: §7's lint forbids the
       REJECTED BAND's endpoints appearing as constants anywhere under the layer, and beat 5 of this
       walk happens to land inside `[0.630, 0.639]`. It is a q* numeral, not that band — but the lint
       is a blunt substring check on purpose, and quoting the walk keeps it blunt. */
    const CHEAP_WALK = '0.000 0.584 0.608 0.625 0.638 0.647 0.656 0.662'.split(' ').map(Number);
    assert.equal(CHEAP_WALK.length, cheap.length);
    cheap.forEach((v, i) => near(v, CHEAP_WALK[i], 5e-4, `beat ${i + 1} of the cheap walk`));
    const peak = cheap.indexOf(Math.max(...cheap));
    assert.equal(peak, cheap.length - 1, `the printed q* peaks at the last beat: ${cheap.map((v) => v.toFixed(3))}`);
    assert.ok(cheap.slice(1).every((v, i) => i === 0 || v >= cheap[i] - 1e-12),
      `it rises at every beat once the pile is non-zero: ${cheap.map((v) => v.toFixed(3))}`);
    assert.ok(cheap.at(-1) > cheap[1], 'and it ends ABOVE its first priced beat, which is the whole claim');
    assert.ok(cheap.at(-1) > cheap[4] - 0.1, 'and eight beats of chain have bought under 6 points of threshold');

    // the JOB the composer actually drafts (T2-heavy, call 85) is not monotone either
    const drafted = walk([1, 2, 1, 2, 2, 1, 2, 2, 1, 2], 85);
    assert.equal(falls(drafted), false, `drafted JOB play path: ${drafted.map((v) => v.toFixed(3))}`);
    assert.ok(drafted.some((v, i) => i > 1 && v > drafted[i - 1] + 1e-9), 'it rises somewhere in the middle');

    /* THE SHARPER HALF. The falling direction is a COMPARATIVE STATIC — hold S, vary c. It is not
       even a property of "the shallow branch": walk the same eight beats and `shallowQStar` RISES,
       because `0.9·S/(A + S)` has S outrunning A once the chain pays. The only form that falls on a
       played path is the DEEP one, and it falls trivially: `θ* = m·P/(ρ̄·W·(m−1))` has no S in it. */
    const walkWith = (f, tiers, call) => {
      let S = 0; let chain = 0;
      const out = [];
      for (const tier of tiers) {
        out.push(f({ target: { tier }, loose: S, chain, call }));
        S += carryFor({ tier }, call, chain, 1, 0, S);
        chain += 1;
      }
      return out;
    };
    const shallowWalk = walkWith(shallowQStar, [1, 1, 1, 1, 1, 1, 1, 1], 95);
    assert.equal(falls(shallowWalk), false,
      `shallowQStar RISES on a played path — the falling claim is fixed-S only: ${shallowWalk.map((v) => v.toFixed(3))}`);
    const rises = (seq) => seq.every((v, i) => i === 0 || v >= seq[i - 1] - 1e-12);
    assert.ok(rises(shallowWalk.slice(1)), 'and it rises monotonically once the pile is non-zero');
    const deepWalk = walkWith(deepQStar, [1, 1, 1, 1, 1, 1, 1, 1], 95);
    assert.ok(falls(deepWalk), `only the S-free deep form falls on a played path: ${deepWalk.map((v) => v.toFixed(3))}`);
    // …and that it falls says nothing about the pile, because it does not read it
    assert.equal(deepQStar({ tier: 1, loose: 0, chain: 4, call: 95 }), deepQStar({ tier: 1, loose: 9e9, chain: 4, call: 95 }));
  });

  /* ---------------------------------------------------------------------------------------
     ROUND 3, econ-math MINOR (the branch switch the table does not flag). G3.2 prints the
     "printed q*" table at `S = 200, L = 18, ρ̄ = 1` and states the DEEP root under it. Seventeen
     of the eighteen cells ARE that root. The last cell of the call-95 row is not: at c = 8
     `L_loss·m·P = 234` overtakes `S = 200`, the pile goes SHALLOW, and the cell is `0.9·S/(A+S)`.
     The published 0.683 is `breakevenQ`'s own answer and is correct; the deep root reads 0.720, so
     a reader recomputing the row from the caption misses the last cell by 0.037 with nothing to
     tell them why. The document owes a footnote (recorded in notes/repair-econ.md); what belongs
     HERE is the arithmetic: every cell recomputed from the shipped function, every cell's BRANCH
     proved from `isDeepPile` rather than assumed, and the census pinned at exactly one.
     --------------------------------------------------------------------------------------- */
  test('the printed q* table reproduces from breakevenQ, and exactly ONE of its 18 cells is not the deep root', () => {
    const { S, L, chains, rows, shallowCells } = P.printedQ;
    const isShallowCell = (call, chain) => shallowCells.some((c) => c.call === call && c.chain === chain);
    /* the caption's own formula, written out here so a cell that stops obeying it is visible */
    const deepRoot = (call, chain) => {
      const { W, P: pen } = carryOf(call);
      const m = chainMult(chain);
      const st = { loose: S, chain, L, call };
      /* the COVER's gain term: `m·W_push − W_bag`, with `W_push = W` (deep ⟺ cover 1) and
         `W_bag = W(50)` (a bag empties the pile that backed the call). It was `W·(m − 1)`. */
      const A = gainLFor(st) * 1 * (m * W - coveredW(call, 0));
      const D = lossLFor(st) * m * pen;
      return A + D > 0 ? Math.min(1, Math.max(0, (D - FEE * S) / (A + D))) : 0;
    };
    let shallow = 0;
    for (const call of [70, 85, 95]) {
      chains.forEach((chain, i) => {
        const st = { loose: S, chain, L, call };
        const where = `call ${call} c${chain}`;
        assert.equal(r3(breakevenQ(st)), rows[call][i], `${where}: the numeral G3.2 publishes`);
        const deep = isDeepPile(st);
        assert.equal(deep, !isShallowCell(call, chain),
          `${where}: PUBLISHED.printedQ.shallowCells disagrees with isDeepPile about this cell's branch`);
        if (deep) {
          near(breakevenQ(st), deepRoot(call, chain), 1e-12, `${where}: a deep cell IS the stated deep root`);
        } else {
          shallow += 1;
          /* the shallow root the APP prints: `(1−fee)·S / (A + S)` with the COVERED gain term. It is
             not `shallowQStar`, which is G3.2's uncovered closed form — see the §5 note above. */
          const { W } = carryOf(call);
          const A = gainLFor(st) * 1 * (chainMult(chain) * coveredW(call, coverOf(st)) - coveredW(call, 0));
          near(breakevenQ(st), ((1 - FEE) * S) / (A + S), 1e-12, `${where}: a shallow cell is the shallow root`);
          assert.ok(breakevenQ(st) < shallowQStar(st) + 1e-12 || W > 1,
            `${where}: the covered root and the published form may only differ where there is a premium`);
        }
      });
    }
    assert.equal(shallow, shallowCells.length, 'the branch census matches what PUBLISHED declares');
    assert.equal(shallow, 1, 'exactly one of the 18 published cells is not the deep root');

    // the switching cell itself: why it switches, and what a reader using the caption would get
    const [cell] = shallowCells;
    const st = { loose: S, chain: cell.chain, L, call: cell.call };
    near(lossLFor(st) * chainMult(cell.chain) * carryOf(cell.call).P, cell.lossLmP, 1e-9,
      'L_loss·m·P at the switching cell');
    assert.ok(cell.lossLmP > S, `the pile goes shallow because ${cell.lossLmP} > ${S}`);
    assert.equal(r3(deepRoot(cell.call, cell.chain)), cell.deepRootWouldBe,
      'the deep root a reader recomputing the caption would get');
    const gap = Math.abs(cell.deepRootWouldBe - rows[cell.call].at(-1));
    assert.ok(gap > 0.02,
      `the two answers are ${cell.deepRootWouldBe} and ${rows[cell.call].at(-1)} — the footnote is load-bearing`);
    near(gap, 0.021, 5e-4, 'the miss a reader recomputing the caption takes, as data/job.js publishes it');
  });

  /* ---------------------------------------------------------------------------------------
     ROUND 3, econ-math MINOR (the bare numeral). G3.2 prints "0.900 → 0.143 on a shallow pile at
     call 95" with no `S` and no `L`. Both are needed: c = 0 is 0.9 for every state, but the c = 8
     endpoint runs 0.042 … 0.683 over the states the same sentence covers — a 16× spread.
     `econ.js shallowQStar` names `S = 12, L = 18`; the document does not, and that is the finding.
     --------------------------------------------------------------------------------------- */
  test('the shallow walk 0.900 → 0.143 is a function of S and L, and only its START is parameter-free', () => {
    const { call, S, L, chains, q, endAtChain8 } = P.shallowQWalk;
    chains.forEach((c, i) => {
      assert.equal(r3(shallowQStar({ loose: S, chain: c, L, call })), q[i],
        `shallowQStar c${c} at S = ${S}, L = ${L}, call ${call}`);
    });
    assert.equal(q[0], P.shallowQAtChain0, 'the walk starts at the L-free 0.9');
    assert.equal(q.at(-1), 0.143, 'and ends at the numeral G3.2 prints');

    for (const row of endAtChain8) {
      assert.equal(r3(shallowQStar({ loose: row.S, chain: 8, L: row.L, call })), row.q,
        `the c = 8 endpoint at S = ${row.S}, L = ${row.L}`);
      assert.equal(r3(shallowQStar({ loose: row.S, chain: 0, L: row.L, call })), P.shallowQAtChain0,
        `…while c = 0 is 0.9 at S = ${row.S}, L = ${row.L} — only the endpoint carries the parameters`);
    }
    const ends = endAtChain8.map((r) => r.q);
    const lo = Math.min(...ends); const hi = Math.max(...ends);
    assert.ok(lo <= 0.042 && hi >= 0.683, `the endpoint spans ${lo} … ${hi} over realistic states`);
    assert.ok(hi / lo > 15,
      `a ${(hi / lo).toFixed(1)}× spread: "0.900 → 0.143" may not be printed without naming S and L`);
  });

  /* ---------------------------------------------------------------------------------------
     The debrief prices its targets through `mult`, and the threshold has to read it.
     (round-1 critic finding 3.) `screens/run.js realisedOrderOf` rebuilds every realised target
     as `{loot: 1, …, mult: d/(ρ·m·W)}`; `settle` reads `mult`, so `optimalOrder` priced the
     target right while `stateL`/`isDeepPile`/`breakevenQ` priced it at L = 1.
     --------------------------------------------------------------------------------------- */
  test('a target whose worth lives in `mult` is priced the same as the same target priced directly', () => {
    for (const L of [6, 18, 38, 70]) {
      for (const loose of [0, 40, 60, 100, 150, 300]) {
        for (const chain of [0, 1, 2, 4]) {
          for (const call of CALLS) {
            const direct = { loot: L, loose, chain, call, q: 0.7 };
            const folded = { loot: 1, mult: L, loose, chain, call, q: 0.7 };
            const where = `L${L} S${loose} c${chain} call${call}`;
            assert.equal(isDeepPile(folded), isDeepPile(direct), `isDeepPile disagrees: ${where}`);
            near(breakevenQ(folded), breakevenQ(direct), 1e-12, `q* disagrees: ${where}`);
            near(pushMinusBag(folded), pushMinusBag(direct), 1e-9, `PUSH−BAG disagrees: ${where}`);
          }
        }
      }
    }
    // and the same target reaches `settle` at full value either way — which is why it had to be read
    assert.equal(settle({ loot: 1, mult: 70, rung: 0, call: 85 }, 2, 300).delta,
      settle({ loot: 70, rung: 0, call: 85 }, 2, 300).delta);
    // the exact miss the critic reported: L folded into `mult`, chain 2, call 85, pile 100
    const folded = { loot: 1, mult: 70, loose: 100, chain: 2, call: 85 };
    assert.equal(isDeepPile(folded), false, 'L·m·P = 196 > 100 — shallow, as the real target is');
  });
});

/* =========================================================================================
   5b. G3.1's carry EV AT A STATE — and THE COVER, which closes the dominance hole
       (round-1 critic finding 4; closed at verify round 1)

   G3.1 publishes `EV = q·W − (1−q)·P` with an argmax column, in units of `L·ρ·m·scope·wing`.
   That formula has no `min(LOOSE, ·)` in it, so the table is the ladder a player faces only on
   a pile deep enough to pay the loss. G2's miss branch IS capped by LOOSE, and BAG empties
   LOOSE, so after a bag the miss term is 0 for every call — and while the clear branch still
   paid the full `W`, the top rung was weakly dominant there. BAG is offered at every beat but
   the last, so that state is not a corner: measured through the shipped machine, max call +
   bag every beat beat honest play by +95.6 % at q = 0.50 on 16/16 seeded boards, and paid MORE
   the weaker the student. `tests/job-exploit.test.mjs` owns that measurement.

   The close is `econ.coverFor`: the same cap applied to the PRIZE as well as to the price,
   `W_eff = W(50) + (W_call − W(50))·min(1, LOOSE/|nominal miss|)`. What this section pins is
   both ends of it — that on a deep pile (cover 1) the published table reproduces exactly and
   its argmax column is recovered, and that at `LOOSE = 0` (cover 0) the rungs TIE, so no rung
   is preferred at any q and the call is left to the strictly proper rating.
   ========================================================================================= */

describe('J1 · the carry ladder at a real state, cap included (G3.1, conditional)', () => {
  test('carryEVAt is pushThrough minus the pile — one model of the branch, not two', () => {
    for (const loose of [0, 25, 300]) {
      for (const chain of [0, 3, 8]) {
        for (const call of CALLS) {
          const st = { loose, chain, L: 38, call, q: 0.75 };
          near(carryEVAt(st), pushThrough(st) - loose, 1e-9);
        }
      }
    }
  });

  test('on a DEEP pile it reproduces G3.1’s published table and its argmax column', () => {
    const L = 70; const chain = 0;                     // m = 1, ρ̄ = 1: G3.1's own units exactly
    for (const [qKey, row] of Object.entries(P.evTable)) {
      const q = Number(qKey);
      for (const call of CALLS) {
        const st = { loose: 1e9, chain, L, call, q };
        assert.equal(isDeepPile(st), true);
        near(carryEVAt(st) / L, row[call], 1e-9, `EV at q ${q} call ${call}`);
      }
      // ties break to the LOWER rung, as J2's argmaxCall does (notes/J1.md §5.4): at q = 0.600 the
      // published column reads "50 ≡ 70" and the answer is 50.
      const want = q <= 3 / 5 ? 50 : q <= 7 / 9 ? 70 : q <= 15 / 17 ? 85 : 95;
      assert.equal(evMaxCallAt({ loose: 1e9, chain, L, q }).call, want, `argmax at q ${q}`);
    }
  });

  test('THE HOLE IS CLOSED: at LOOSE = 0 the miss costs 0 — and so does the premium that bought it', () => {
    // G2's cap is untouched: `miss: Δloose = −min(LOOSE, …)`, and BAG sets LOOSE to 0. So:
    for (const call of CALLS) {
      for (const chain of [0, 4, 8]) {
        assert.equal(missFor({ tier: 4 }, call, chain, 0), 0, `a miss at LOOSE 0 costs nothing (call ${call})`);
        assert.equal(settle({ tier: 4, call, rung: MISS_RUNG }, chain, 0).delta, 0);
      }
    }
    /* …and the SAME cap now removes the prize. At LOOSE = 0 every rung's cover is 0 (the 50 rung
       has no price to cover, so its cover is 1 and its W is 1.0 either way), so the clear branch is
       FLAT across the ladder: calling 95 on an empty pile buys exactly what calling 50 buys. */
    for (const chain of [0, 4, 8]) {
      const base = settle({ tier: 4, call: 50, rung: 0 }, chain, 0).delta;
      for (const call of CALLS) {
        assert.equal(coverFor({ tier: 4 }, call, chain, 0), call === 50 ? 1 : 0, `cover at S = 0, call ${call}`);
        assert.equal(coveredW(call, coverFor({ tier: 4 }, call, chain, 0)), 1, `W at S = 0, call ${call}`);
        assert.equal(settle({ tier: 4, call, rung: 0 }, chain, 0).delta, base,
          `call ${call} still bought a premium at S = 0 — the bag-every-beat exploit is open again`);
      }
    }
    // so the rungs TIE at every q, and `evMaxCallAt` (which breaks ties to the LOWER rung) names 50
    for (const q of [0.05, 0.3, 0.5, 0.55, 0.7, 0.9, 0.99]) {
      const evs = CALLS.map((call) => carryEVAt({ loose: 0, chain: 0, L: 6, q }, call));
      assert.ok(evs.every((v) => Math.abs(v - evs[0]) < 1e-12),
        `the rungs must tie at S = 0 (q = ${q}): ${evs.map((v) => v.toFixed(4))}`);
      assert.equal(evMaxCallAt({ loose: 0, chain: 0, L: 6, q }).call, 50,
        `no rung is preferred at S = 0, q = ${q} — the call is left to the rating`);
      assert.equal(evMaxCallAt({ loose: 0, chain: 0, L: 6, q }, JOB.RANKS[0].calls).call, 50);
    }
    // restore a pile that can pay and the PUBLISHED ladder returns, untouched
    assert.equal(coverFor({ tier: 4 }, 95, 0, 1e9), 1, 'a deep pile covers the whole ladder');
    assert.equal(evMaxCallAt({ loose: 1e9, chain: 0, L: 6, q: 0.5 }).call, 50);
    assert.equal(evMaxCallAt({ loose: 1e9, chain: 0, L: 6, q: 0.95 }).call, 95);
  });

  test('the CARRY ladder is the brake G3.7 #9 says it is — the price cannot be dodged by emptying the pile', () => {
    // the rank gate is unchanged, and is still a rating brake rather than an EV one
    assert.deepEqual(JOB.RANKS[0].calls, [50, 70, 85]);
    assert.deepEqual(JOB.RANKS[2].calls, [50, 70, 85, 95]);
    assert.equal(JOB.CALL_LEVELS.find((c) => c.id === 95).minRank, 3);
    assert.equal(evMaxCallAt({ loose: 0, chain: 0, L: 6, q: 0.5 }, JOB.RANKS[0].calls).call,
      evMaxCallAt({ loose: 1e9, chain: 0, L: 6, q: 0.5 }, JOB.RANKS[0].calls).call,
      'at Called 1 the S = 0 state no longer names a bolder rung than the published table does');

    /* G3.7 #9's own worked price: `min(LOOSE, L·m·5·wing_pen)` = 18 × 1.8 × 5 = 162 on a tier-2 at
       chain 4. The claim was falsifiable because the price could be dodged (bag → LOOSE = 0). Under
       the cover the dodge costs exactly what it saves: the pile that pays the 162 is the pile that
       buys the premium, to the penny. */
    const t2 = { tier: 2, scope: 1, cold: 1, tokens: 0, guarded: false, rank: 5 };
    assert.equal(-missFor(t2, 95, 4, 1e9, 0), 162, 'G3.7 #9’s published price');
    assert.equal(coverFor(t2, 95, 4, 162), 1, 'a pile that pays the 162 covers the whole premium');
    assert.ok(coverFor(t2, 95, 4, 161) < 1, 'and a unit short of it is short of the premium too');
    for (const S of [0, 40, 81, 162, 400]) {
      const paidIfMissed = Math.abs(settle({ ...t2, call: 95, rung: MISS_RUNG }, 4, S).delta);
      const premium = settle({ ...t2, call: 95, rung: 0 }, 4, S).delta - settle({ ...t2, call: 50, rung: 0 }, 4, S).delta;
      assert.equal(paidIfMissed, Math.min(S, 162), `the price at S = ${S}`);
      assert.ok(premium >= 0 && (S > 0 || premium === 0),
        `the premium at S = ${S} is ${premium} — it may not be positive on a pile that pays nothing`);
      // the premium is paid in the same PROPORTION as the price: both are `min(1, S/162)` of their full value
      near(premium / (settle({ ...t2, call: 95, rung: 0 }, 4, 1e9).delta - settle({ ...t2, call: 50, rung: 0 }, 4, 1e9).delta),
        paidIfMissed / 162, 0.02, `price and premium must be covered in step at S = ${S}`);
    }
  });

  /* ---------------------------------------------------------------------------------------
     3c. THE CALL LADDER IS THE PUBLISHED ONE AT EVERY STATE (verify round 2, exploit-hunt).

     The finding: `carryFor` paid the call's premium on the GAIN set while `missFor` charged its
     price on the LOSS set, so `scope · wing · cold · tell` raised a bold call's prize and left its
     price alone. Dressing a target was arithmetically the same as raising `q`, and the published
     indifference points — `call.carryIndifference() = [0.600, 0.7778, 0.88235]` — held on a bare
     target and nowhere else. On one target a real board serves (T2, chain 4, LOOSE 200, a due
     review at scope 1.25, cold 1.5, two tokens) the carry argmax was one rung ABOVE `honestCall`
     at every q in [0.50, 0.90], worth +0.8 % to +19.3 %, and `evMaxCallAt` disagreed with
     `honestCall` on 4 of the 5 cells the critic measured.

     §3b above only ever exercised a BARE target, which is exactly why the suite could not see it.
     This block is the grid it was missing.
     --------------------------------------------------------------------------------------- */
  const DRESS = [];
  for (const scope of [0.5, 0.8, 1, 1.25]) {
    for (const cold of [1, 1.25, 1.5]) {
      for (const tell of [null, { triggered: 1 }]) {
        for (const tokens of [0, 1, 3]) {
          for (const guarded of [false, true]) {
            for (const x2 of [false, true]) DRESS.push({ scope, cold, tell, tokens, guarded, x2, rank: 3 });
          }
        }
      }
    }
  }

  test('on a DEEP pile the carry argmax is the published rung at EVERY dressing, tier, chain and rung', () => {
    /* One q strictly inside each band of the wing's own ladder. The cuts are
       `q/(1−q) = wing_pen·ΔP/ΔW`: `0.600 / 0.7778 / 0.88235` unguarded — `carryIndifference()`
       exactly — and `0.750 / 0.875 / 0.9375` on the guarded wing, which is stricter at every rung.
       `wing_pen` is left out of the premium on purpose (`econ.stakeOf`): putting it in would make
       these two ladders one, and would also invert the guard. */
    const SAFE = [[0.55, 50], [0.70, 70], [0.83, 85], [0.95, 95]];
    const GUARDED = [[0.70, 50], [0.80, 70], [0.90, 85], [0.97, 95]];
    const cuts = carryIndifference();
    [0.600, 0.7778, 0.88235].forEach((c, i) => near(cuts[i], c, 5e-5, 'the published cut'));
    SAFE.forEach(([q, want], i) => {
      assert.ok(q > (cuts[i - 1] ?? 0) && q < (cuts[i] ?? 1), `${q} is inside the published band for ${want}`);
    });
    let deep = 0;
    for (const dress of DRESS) {
      for (const tier of [1, 2, 3, 4]) {
        for (const chain of [0, 3, 8]) {
          for (const rung of [0, 1, 2]) {
            /* tier 1 at scope 0.5 is a 3-loot target: half-up rounding alone moves its argmax by a
               rung, which is a property of `round`, not of the ladder. `mult` scales it out — the
               grid below is about the ladder. §3b and the critic's own state (the test after next)
               exercise the shipped integer scale. */
            const t = { ...dress, tier, crew: 0, mult: 1000 };
            const loose = 1e9;                                        // deep for every rung, by construction
            assert.equal(isDeepPile({ target: t, loose, chain, call: 95 }), true);
            deep++;
            const ev = (c, q, r) => {
              const clear = settle({ ...t, call: c, rung: r }, chain, loose).delta;
              const miss = settle({ ...t, call: c, rung: 4 }, chain, loose).delta;
              return q * clear + (1 - q) * miss;
            };
            const argmax = (q, r) => CALLS.reduce((a, c) => (ev(c, q, r) > ev(a, q, r) + 1e-9 ? c : a), CALLS[0]);
            /* ρ̄ = 1 — rung 0, and the bound `rhoBarFor(null)` gives a call that has not been answered
               yet, which is the state a call is MADE at. Here the cuts are the wing's exactly. */
            for (const [q, want] of (dress.guarded ? GUARDED : SAFE)) {
              assert.equal(argmax(q, 0), want,
                `argmax ${argmax(q, 0)} at q = ${q} on ${JSON.stringify(dress)} tier ${tier} c${chain} — the `
                + `${dress.guarded ? 'guarded' : 'unguarded'} cuts may not move with the dressing`);
            }
            /* AND EVERY DEVIATION IS ONE-DIRECTIONAL. `ρ̄ < 1` (a hinted or second-attempt clear)
               shrinks the premium and the guarded wing doubles the price, so both push the cuts UP:
               the carry argmax may sit BELOW the published rung and may never sit above it. That is
               the whole safety property — a lie is never paid, anywhere on this grid. */
            for (const r of [1, 2]) {
              for (const [q, want] of (dress.guarded ? GUARDED : SAFE)) {
                assert.ok(argmax(q, r) <= want,
                  `rung ${r} at q = ${q} on ${JSON.stringify(dress)} tier ${tier} c${chain}: argmax ${argmax(q, r)} > ${want}`);
              }
            }
            if (dress.guarded) {
              for (const [q, want] of SAFE) {
                assert.ok(argmax(q, 0) <= want, `the guarded ladder may only ever be MORE cautious (q ${q})`);
              }
            }
          }
        }
      }
    }
    assert.ok(deep >= 2000, `only ${deep} deep states swept`);
  });

  test('…so `evMaxCallAt` agrees with `honestCall` everywhere but the two PUBLISHED bands (safe wing)', () => {
    /* The two ladders disagree on `q ∈ [0.775, 0.778)` and `q ∈ [0.882, 0.900)` — 2.04 points in
       total, published in G3.1 and printed in Settings, and that is the ONLY disagreement the design
       allows. Before verify round 2 a dressed target disagreed across the whole domain. */
    /* `to` is the Brier cut itself and `honestCall` breaks a tie to the LOWER rung, so the ladders
       still disagree AT the endpoint: the band is closed on both sides here. A `q` sitting exactly on
       a CARRY cut is skipped instead — the two rungs tie there by construction and which one an
       argmax returns is a float tie-break, not an incentive. */
    const bandOf = (q) => disagreementBands().some((b) => q >= b.from - 1e-9 && q <= b.to + 1e-9);
    const cuts = carryIndifference();
    const atACut = (q) => cuts.some((c) => Math.abs(c - q) < 5e-3);
    let checked = 0;
    for (const dress of DRESS) {
      if (dress.guarded) continue;                 // the guarded wing runs the stricter ladder below
      for (const chain of [0, 4, 8]) {
        const t = { ...dress, tier: 2, crew: 0 };
        /* deep for every rung, and no deeper: `carryEVAt` is `pushThrough − S`, so a pile of 1e5
           against payouts of ~50 would lose the comparison in the subtraction. */
        const loose = 4 * lossLFor({ target: t }) * chainMult(chain) * carryOf(95).P;
        assert.equal(isDeepPile({ target: t, loose, chain, call: 95 }), true);
        for (let q = 0.50; q <= 0.9501; q += 0.01) {
          const qq = Math.round(q * 100) / 100;
          if (atACut(qq)) continue;
          const got = evMaxCallAt({ target: t, loose, chain, q: qq }).call;
          const want = honestCall(qq);
          checked++;
          if (got === want) continue;
          assert.ok(bandOf(qq),
            `evMaxCallAt says ${got} and honestCall says ${want} at q = ${qq} on ${JSON.stringify(dress)} `
            + 'c' + chain + ' — outside the two published disagreement bands, money and rank must agree');
        }
      }
    }
    assert.ok(checked > 5000, `only ${checked} (state, q) pairs checked`);
    /* anti-vacuity: the bands are not empty cover — the sweep really does land inside them, and the
       disagreement really does happen there (it is a published feature, not a hole). */
    const inBand = { target: { tier: 2, crew: 0, rank: 3 }, loose: 5000, chain: 4, q: 0.89 };
    assert.equal(bandOf(0.89), true);
    assert.notEqual(evMaxCallAt(inBand).call, honestCall(0.89), 'the upper band must still be a real disagreement');
  });

  test('…and on the GUARDED wing the money ladder is never looser than the rating one', () => {
    /* `wing_pen` is not in the premium (`econ.stakeOf`), so the guarded cuts are `2·ΔP/ΔW` —
       `0.750 / 0.875 / 0.9375`. That is a deviation from the published ladder, and it is published
       here as the one-directional thing it is: money asks for MORE certainty inside the guard than
       rank does, so a call that is honest is never over-bold there, and a lie is never paid. The
       alternative — `wing_pen` in the premium, which would make the two ladders one — inverts the
       guard: a guarded tier-1 at rank 1, chain 3, call 85 would out-earn the safe wing at q > 0.870. */
    let checked = 0;
    let strictlyStricter = 0;
    for (const dress of DRESS) {
      if (!dress.guarded) continue;
      for (const chain of [0, 4, 8]) {
        const t = { ...dress, tier: 2, crew: 0, mult: 1000 };
        const loose = 1e9;
        const ev = (c, q) => {
          const clear = settle({ ...t, call: c, rung: 0 }, chain, loose).delta;
          const miss = settle({ ...t, call: c, rung: 4 }, chain, loose).delta;
          return q * clear + (1 - q) * miss;
        };
        for (let q = 0.50; q <= 0.9501; q += 0.01) {
          const qq = Math.round(q * 100) / 100;
          const best = CALLS.reduce((a, c) => (ev(c, qq) > ev(a, qq) + 1e-9 ? c : a), CALLS[0]);
          const want = honestCall(qq);
          checked++;
          assert.ok(best <= want,
            `guarded wing, q ${qq}, ${JSON.stringify(dress)} c${chain}: money says ${best} and rank says ${want} `
            + '— inside the guard the carry ladder may never ask for LESS certainty than the rating one');
          if (best < want) strictlyStricter++;
        }
      }
    }
    assert.ok(checked > 1000, `only ${checked} guarded (state, q) pairs checked`);
    assert.ok(strictlyStricter > 0, 'the guarded ladder is supposed to be a different one — this arm proved nothing');
    /* the guarded cuts themselves, from the constants rather than from a sweep */
    const guardedCut = (lo, hi) => {
      const a = carryOf(lo); const b = carryOf(hi);
      const theta = (2 * (b.P - a.P)) / (b.W - a.W);
      return theta / (1 + theta);
    };
    [[50, 70], [70, 85], [85, 95]].forEach(([lo, hi], i) => {
      near(guardedCut(lo, hi), P.carryIndifferenceGuarded[i], 1e-9, `the published guarded cut ${lo}→${hi}`);
    });
    near(guardedCut(50, 70), 0.750, 1e-9);
    near(guardedCut(70, 85), 0.875, 1e-9);
    near(guardedCut(85, 95), 0.9375, 1e-9);
    carryIndifference().forEach((c, i) => {
      assert.ok(guardedCut([50, 70, 85][i], [70, 85, 95][i]) > c, `the guarded cut must sit ABOVE the published ${c}`);
    });
  });

  test('the dressed target the critic measured: the honest rung IS the carry argmax at every q', () => {
    /* `/tmp/exh/e19.mjs`'s exact state — tier 2, chain 4, LOOSE 200, scope 1.25, cold 1.5, 2 tokens.
       Its four rungs used to read CLEAR 64 / 89 / 115 / 140 against MISS 0 / −19 / −65 / −162, i.e.
       breakeven 0.000 / 0.176 / 0.361 / 0.536 where the rungs claim 0.50 / 0.70 / 0.85 / 0.95. */
    const T = { tier: 2, crew: 0, guarded: false, rank: 3, scope: 1.25, cold: 1.5, tokens: 2 };
    const CLEAR = {}; const MISS = {};
    for (const c of CALLS) {
      CLEAR[c] = settle({ ...T, call: c, rung: 1 }, 4, 200).delta;
      MISS[c] = settle({ ...T, call: c, rung: 4 }, 4, 200).delta;
    }
    assert.deepEqual(CLEAR, { 50: 64, 70: 73, 85: 82, 95: 91 }, 'the clear rungs, repriced on the stake');
    assert.deepEqual(MISS, { 50: 0, 70: -19, 85: -65, 95: -162 }, 'the miss branch is untouched — G2 is unchanged');
    const cuts = carryIndifference();
    const atACut = (q) => cuts.some((c) => Math.abs(c - q) < 5e-3);
    const inBand = (q) => disagreementBands().some((b) => q >= b.from - 1e-9 && q <= b.to + 1e-9);
    let strict = 0;
    for (const q of [0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90]) {
      const ev = (c) => q * CLEAR[c] + (1 - q) * MISS[c];
      const best = CALLS.reduce((a, c) => (ev(c) > ev(a) + 1e-9 ? c : a), CALLS[0]);
      const honest = honestCall(q);
      /* Two q's on this list are not the claim's domain and are excluded by name, not by tolerance:
         q = 0.600 sits exactly ON the published 50↑70 cut, where the two rungs tie on the unrounded
         ladder (38.2725 either way) and `round` breaks it by at most half a loot per branch; and
         q = 0.900 sits inside the published upper DISAGREEMENT band [0.882, 0.900], where G3.1 says
         in so many words that money prefers 95 and rank prefers 85. Everywhere else — and that is
         seven of the nine cells the critic measured, all of which used to go to the lie — the honest
         rung is the carry argmax outright. */
      /* **Over-calling is not the argmax at ANY of the nine cells the critic measured** — including
         q = 0.600 (the published 50↑70 cut) and q = 0.900 (inside the published upper disagreement
         band), where the design permits the money ladder to be the bolder one and it simply is not,
         because this clear is a 1-hint rung and `ρ̄ = 0.70` shrinks the premium. */
      assert.ok(best <= honest, `at q = ${q} the carry argmax is ${best} and the honest rung is ${honest} — over-calling may never pay`);
      if (atACut(q) || inBand(q)) continue;
      strict++;
      assert.ok(best === honest || best < honest,
        `at q = ${q} the honest rung must be the carry argmax or above it`);
    }
    assert.equal(strict, 7, 'seven of the critic\'s nine cells are outside a cut and outside a band');
    /* and at ρ̄ = 1 — the state the CALL is actually made at, before any rung exists — those seven
       cells are exact agreement, which is the published ladder holding on a dressed target. */
    for (const q of [0.50, 0.55, 0.65, 0.70, 0.75, 0.80, 0.85]) {
      const evAt = (c) => q * settle({ ...T, call: c, rung: 0 }, 4, 200).delta
        + (1 - q) * settle({ ...T, call: c, rung: 4 }, 4, 200).delta;
      const best = CALLS.reduce((a, c) => (evAt(c) > evAt(a) + 1e-9 ? c : a), CALLS[0]);
      assert.equal(best, honestCall(q), `at ρ̄ = 1, q = ${q}: the honest rung IS the carry argmax`);
    }
  });
});

/* =========================================================================================
   6. `cold`, capped and interval-scaled (G2, G12 #13)
   ========================================================================================= */

describe('J1 · cold is capped at 1.50 and scaled by the card’s own interval', () => {
  test('a bucket-1 card 1 day overdue and a bucket-5 card 14 days overdue are equally cold: both 1.50', () => {
    assert.equal(coldFor(1, 1), 1.50);
    assert.equal(coldFor(5, 14), 1.50);
    assert.equal(COLD.cap, 1.50);
  });

  test('letting a card rot past its own interval buys NOTHING — the cap bites', () => {
    for (const bucket of [0, 1, 2, 3, 4, 5]) {
      for (const od of [0, 0.5, 1, 7, 14, 30, 365]) {
        const c = coldFor(bucket, od);
        assert.ok(c <= COLD.cap + 1e-12, `cold ${c} exceeded the cap at bucket ${bucket}, overdue ${od}`);
        assert.ok(c >= COLD.base - 1e-12);
      }
      // monotone non-decreasing in overdue-ness, and flat once past the interval
      const iv = INTERVALS[bucket];
      if (iv > 0) {
        assert.equal(coldFor(bucket, iv), COLD.cap);
        assert.equal(coldFor(bucket, iv * 10), COLD.cap, 'ten intervals late pays exactly the same as one');
      }
    }
    assert.equal(coldFor(2, 1), 1.25, 'bucket 2, interval 2 d, 1 day overdue → halfway');
    assert.equal(coldFor(4, 0), 1, 'on time is not cold');
  });

  test('bucket 0 (interval 0) is handled rather than dividing by zero', () => {
    assert.equal(coldFor(0, 0), 1);
    assert.equal(coldFor(0, 1), COLD.cap);
    assert.ok(Number.isFinite(coldFor(0, 0)) && Number.isFinite(coldFor(0, 5)));
  });
});

/* =========================================================================================
   7. `tell` pays only while the fault is live (G2, G12 #14)
   ========================================================================================= */

describe('J1 · tell is 1.00 once cleared or sealed', () => {
  test('a live, triggered, unresolved, unsealed tag pays ×1.25 — the best-paying single thing there is', () => {
    assert.equal(TELL, 1.25);
    assert.equal(tellFor({ triggered: 2, cleared: false, sealed: false }), 1.25);
    assert.equal(tellFor(true), 1.25);
  });

  test('resolve() drops it to 1.00 the same tick; sealing retires it for good', () => {
    assert.equal(tellFor({ triggered: 2, cleared: true, sealed: false }), 1.00);
    assert.equal(tellFor({ triggered: 2, cleared: false, sealed: true }), 1.00);
    assert.equal(tellFor({ triggered: 2, cleared: true, sealed: true }), 1.00);
    assert.equal(tellFor({ triggered: 0 }), 1.00, 'an untriggered tag is not a tell');
    assert.equal(tellFor(null), 1.00);
    assert.equal(tellFor(undefined), 1.00);
  });

  test('so a stockpile of deliberate errors is a depreciating asset: the carry falls as tags resolve', () => {
    const t = { tier: 2, scope: 1, tell: { triggered: 1 } };
    const live = carryFor(t, 85, 0, 0, 0);
    const resolved = carryFor({ ...t, tell: { triggered: 1, cleared: true } }, 85, 0, 0, 0);
    assert.ok(resolved < live, 'fixing the fault ends the multiplier — which is the point');
    assert.equal(resolved, round(18 * 1 + 18 * (1.8 - 1)), 'the resolved payout is loot + the 85 premium');
    assert.equal(resolved, round(18 * 1.8), '…which on a bare target is still G2\'s published product');
    /* the tell scales the LOOT, not the wager: `18·1.25 + 18·(1.8−1)`, not `18·1.8·1.25`. Since verify
       round 2 the call's premium is paid on `missFor`'s own base, so no gain-side multiplier moves it
       — which is what stops a dressed target from making a bold call cheap (see `econ.carryFor`). */
    assert.equal(live, round(18 * TELL + 18 * (1.8 - 1)), 'the tell multiplies the loot term only');
    assert.notEqual(live, round(18 * 1.8 * TELL), 'and it does NOT multiply the call\'s premium');
  });
});

/* =========================================================================================
   8. The stake band — the ≥80 %-of-peak region of w·E[c] (G3.1 point 2)
   ========================================================================================= */

describe('J1 · the stake band', () => {
  test('w = 4q̂(1−q̂), and only w ≥ 0.25 calls are informative (q̂ ∈ [0.067, 0.933])', () => {
    for (const [q, w] of Object.entries(P.weights)) near(ratingWeight(Number(q)), w, 5e-4, `w(${q})`);
    assert.equal(isInformative(0.933), true);
    assert.equal(isInformative(0.97), false, 'a mastered make produces no informative call at all');
    assert.equal(isInformative(0.5), true);
    near(ratingWeight(JOB.RATING.informativeQHatBand[1]), JOB.RATING.informativeMin, 5e-4);
  });

  test('c(p, o) = 10 − 40(p − o)² reproduces the whole rating ladder: +6.4/−9.6 · +9.1/−18.9 · +9.9/−26.1', () => {
    for (const lvl of JOB.CALL_LEVELS) {
      near(creditFor(lvl.p, true), lvl.creditClear, 1e-9, `clear credit at ${lvl.id}`);
      near(creditFor(lvl.p, false), lvl.creditMiss, 1e-9, `miss credit at ${lvl.id}`);
    }
    near(creditFor(0.5, true), 0, 1e-12, 'a coin flip scores exactly 0 either way');
    near(creditFor(0.5, false), 0, 1e-12);
  });

  test('the rule is strictly proper: p = q is the unique maximiser of E[c], by grid search', () => {
    for (let i = 1; i <= 99; i++) {
      const q = i / 100;
      let best = -Infinity; let bestP = null;
      for (let j = 0; j <= 1000; j++) {
        const p = j / 1000;
        const v = expectedCredit(p, q);
        if (v > best + 1e-12) { best = v; bestP = p; }
      }
      near(bestP, q, 1e-3, `argmax_p E[c] at q = ${q}`);
      near(best, 10 - 40 * q * (1 - q), 1e-6, 'and its value is 10 − 40q(1−q)');
    }
  });

  test('the honest DISCRETE rung is computed, and it reproduces 0.600 / 0.775 / 0.900', () => {
    const edges = [];
    let prev = honestRung(0.5).id;
    for (let i = 500; i <= 1000; i++) {
      const q = i / 1000;
      const id = honestRung(q).id;
      if (id !== prev) { edges.push(q); prev = id; }
    }
    assert.deepEqual(edges, [0.601, 0.776, 0.901], 'the first 1/1000 step past each published boundary');
    for (const [i, b] of JOB.CALL_INDIFFERENCE.rating.entries()) {
      if (b < 0.5) continue;
      near(expectedCredit(JOB.CALL_LEVELS[i].p, b), expectedCredit(JOB.CALL_LEVELS[i + 1].p, b), 1e-9, `rating indifference ${b}`);
    }
    assert.deepEqual([...JOB.CALL_INDIFFERENCE.rating], P.ratingIndifference);
  });

  test('the CONTINUOUS w·E[c] peaks at q̂ = 0.854 with value 2.50, on the q̂ ∈ [0.5, 1] domain', () => {
    assert.deepEqual([...STAKE_DOMAIN], [0.5, 1], 'G3.8 states the domain restriction explicitly');
    const { qHat, value } = stakePeak();
    assert.equal(r3(qHat), P.wEcPeakQHat);
    near(value, P.wEcPeakValue, 1e-6);
    // and it is the closed form G3.1 publishes: u = q̂(1−q̂) = 0.125, f(u) = 40u − 160u²
    // (a smooth maximum is flat to second order, so the located q̂ is good to ~1e-8, not to 1e-15 —
    //  four orders of magnitude finer than the 3 dp the document prints)
    near(qHat * (1 - qHat), 0.125, 1e-8);
    near(qHat, (1 + Math.sqrt(0.5)) / 2, 1e-6);
    // the function really is 40u − 160u²
    for (const q of [0.55, 0.7, 0.8536, 0.93]) {
      const u = q * (1 - q);
      near(wTimesEc(q), 40 * u - 160 * u * u, 1e-9, `w·E[c] at ${q}`);
    }
  });

  test('the ≥80 %-of-peak band is [0.763, 0.925] — material you are still fumbling one time in six', () => {
    const [lo, hi] = stakeBand(0.8);
    assert.deepEqual([r3(lo), r3(hi)], P.wEcBand80);
    near(lo, 0.7628655560593243, 1e-9);
    near(hi, 0.9253254041759529, 1e-9);
    const { value: peak } = stakePeak();
    // inside the band the value is ≥ 80 % of the peak; just outside it is not
    for (const q of [lo + 1e-6, 0.8, 0.854, 0.9, hi - 1e-6]) assert.ok(wTimesEc(q) >= 0.8 * peak - 1e-9, `inside at ${q}`);
    for (const q of [lo - 1e-3, hi + 1e-3, 0.5, 0.99]) assert.ok(wTimesEc(q) < 0.8 * peak, `outside at ${q}`);
    // a grid search, independently of the bisection the implementation uses
    let gLo = null; let gHi = null;
    for (let i = 0; i <= 500000; i++) {
      const q = 0.5 + (0.5 * i) / 500000;
      if (wTimesEc(q) >= 0.8 * peak) { if (gLo === null) gLo = q; gHi = q; }
    }
    near(gLo, lo, 2e-6, 'grid search agrees with the bisection (low edge)');
    near(gHi, hi, 2e-6, 'grid search agrees with the bisection (high edge)');
  });

  test('w peaks at q̂ = 0.5 (leverage) while w·E[c] peaks at 0.854 (gain) — the two honest halves', () => {
    let bw = -Infinity; let bq = 0;
    for (let i = 0; i <= 1000; i++) { const q = i / 1000; if (ratingWeight(q) > bw) { bw = ratingWeight(q); bq = q; } }
    near(bq, 0.5, 1e-9, 'the WEIGHT peaks at a coin flip');
    near(bw, 1.0, 1e-9);
    near(wTimesEc(0.5), 0, 1e-12, 'and the CREDIT there is exactly 0 — calibration cannot be shown on a coin flip');
    assert.ok(stakePeak().qHat > 0.8, 'so the rating is EARNED well above 0.5');
  });

  test('the G3.1 sanity rows are the DISCRETE ladder: 1.344 / 2.240 / 2.499 / 2.268, not the continuous values', () => {
    for (const [q, published] of Object.entries(P.sanityWc)) {
      assert.equal(r3(wTimesEcDiscrete(Number(q))), published, `w·E[c] at q̂ = ${q}`);
    }
    // the specific trap: at q̂ = 0.80 the honest rung is 85, E[c] = 3.5, w·E[c] = 2.240
    assert.equal(honestRung(0.80).id, 85);
    near(expectedCredit(0.85, 0.80), 3.5, 1e-9);
    near(wTimesEcDiscrete(0.80), 2.240, 1e-9);
    near(wTimesEc(0.80), 2.304, 1e-9);
    assert.notEqual(r3(wTimesEcDiscrete(0.80)), r3(wTimesEc(0.80)), 'the two objects differ, and the sanity table is the discrete one');
    // q̂ = 0.900 is the published 85↔95 rating indifference point, so it is an EXACT tie: both rungs
    // score E[c] = 6.3 and w·E[c] = 2.268. honestRung breaks the tie to the lower rung; one step past
    // the boundary the honest rung is 95.
    near(expectedCredit(0.85, 0.90), expectedCredit(0.95, 0.90), 1e-9);
    near(expectedCredit(0.95, 0.90), 6.3, 1e-9);
    assert.equal(honestRung(0.901).id, 95);
    near(wTimesEcDiscrete(0.90), 2.268, 1e-9);
    // the rank thresholds are the same scale: rating = 5 + 2·mean(w·c)
    for (const [i, mean] of JOB.RANK_MEAN_WC.entries()) {
      if (!Number.isFinite(mean)) continue;
      near(JOB.RATING.base + JOB.RATING.scale * mean, JOB.RANKS[i].min, 1e-9, `Called ${i + 1} threshold`);
    }
  });

  test('the discrete object has its own peak and band, and they are RECORDED not asserted as 0.854', () => {
    const dp = stakePeak({ discrete: true });
    const [dlo, dhi] = stakeBand(0.8, { discrete: true });
    near(dp.qHat, 0.8528432833, 1e-6);
    near(dp.value, 2.4997974068, 1e-6);
    near(dlo, 0.7785731100, 1e-6);
    near(dhi, 0.9248729907, 1e-6);
    assert.notEqual(r3(dp.qHat), P.wEcPeakQHat, 'the published 0.854 is the continuous peak, and the doc says so');
  });
});

/* =========================================================================================
   9. The rejected growth band (G3.2 last paragraph, G11)
   ========================================================================================= */

describe('J1 · the band G11 rejected stays rejected', () => {
  // The needles are ASSEMBLED at runtime, the way no-random.test.mjs assembles its own, so that this
  // file never contains the literals it forbids and cannot fail on its own text. G11 deleted the
  // imported "growth-optimal band" outright; §3.2 deleted its test with it.
  const NEEDLES = [['0', '.', '52'].join(''), ['0', '.', '63'].join(''), ['growth', 'optimal'].join('-')];

  test('no ASSERTION and no constant under the layer names the rejected band', () => {
    const files = [
      join(ROOT, 'site', 'data', 'job.js'),
      ...listFiles(join(ROOT, 'site', 'js', 'job')),
      join(ROOT, 'tests', 'job-econ.test.mjs'),
    ];
    for (const f of files) {
      const code = stripCommentsAndStrings(readFileSync(f, 'utf8'));
      for (const needle of NEEDLES) {
        assert.equal(code.includes(needle), false, `${relative(ROOT, f)} names ${needle} in code`);
      }
    }
  });

  test('and the reason: E[Δloose] is STRICTLY INCREASING in q — there is no interior optimum', () => {
    for (const chain of [0, 2, 5, 8]) {
      for (const call of [70, 85, 95]) {
        for (const L of [6, 18, 70]) {
          const { W, P: pen } = carryOf(call);
          const m = chainMult(chain);
          const ev = (q) => q * L * 1 * m * W - (1 - q) * L * m * pen;
          let prev = -Infinity;
          for (let i = 0; i <= 100; i++) {
            const v = ev(i / 100);
            assert.ok(v > prev, `E[Δloose] must strictly increase in q (c${chain} ${call} L${L})`);
            prev = v;
          }
          // the gain term contains no S, and the loss is capped BY S rather than proportional to it
          near(ev(1), L * m * W, 1e-9);
        }
      }
    }
  });
});

/* =========================================================================================
   10. LOOSE floors at 0 (G1 "The two piles", G3.7 proof 11)
   ========================================================================================= */

describe('J1 · LOOSE floors at 0', () => {
  test('a miss never takes more than the pile, and applyDelta never goes below zero', () => {
    for (const loose of [0, 1, 5, 17, 140, 300]) {
      for (const chain of [0, 3, 8]) {
        for (const call of CALLS) {
          for (const guarded of [false, true]) {
            const t = { tier: 4, guarded, rank: 1 };
            const d = missFor(t, call, chain, loose);
            assert.ok(d <= 0, 'a miss delta is never positive');
            assert.ok(-d <= loose + 1e-12, `the loss ${-d} exceeded the pile ${loose}`);
            assert.ok(applyDelta(loose, d) >= 0, 'LOOSE floors at 0');
          }
        }
      }
    }
    assert.equal(applyDelta(0, -999), 0);
    assert.equal(applyDelta(10, -999), 0);
    assert.equal(missFor({ tier: 4 }, 95, 8, 0), 0, 'nothing to take at LOOSE 0');
  });

  test('call 50 has literally zero downside — so there is always a non-negative move (G3.7 proof 6)', () => {
    assert.equal(carryOf(50).P, 0);
    for (const chain of [0, 4, 8]) {
      for (const loose of [0, 50, 500]) {
        assert.equal(missFor({ tier: 4 }, 50, chain, loose), 0);
        assert.ok(carryFor({ tier: 1 }, 50, chain, 0) >= 0);
      }
    }
  });

  test('crew forgiveness removes the loss entirely: at STEADY a "miss" is a 0.20 payout', () => {
    assert.equal(missFor({ tier: 2 }, 85, 4, 300, 1), 0, 'STEADY forgives the miss rung, so nothing is taken');
    const s = settle({ tier: 2, call: 85, rung: 4, crew: 1 }, 4, 300);
    assert.equal(s.kind, 'carry');
    assert.ok(s.delta > 0);
    const bare = settle({ tier: 2, call: 85, rung: 4, crew: 0 }, 4, 300);
    assert.equal(bare.kind, 'miss');
    assert.ok(bare.delta < 0);
    assert.equal(bare.chain, 0);
  });

  test('a Backcheck shields the stake and only the stake: the chain holds and LOOSE is not taken', () => {
    const shielded = settle({ tier: 2, call: 95, rung: 4, crew: 0, shielded: true }, 5, 200);
    assert.equal(shielded.delta, 0);
    assert.equal(shielded.loose, 200);
    assert.equal(shielded.chain, 5, 'the chain holds');
    assert.equal(JOB.BACKCHECK.shieldsStakeOnly, true);
  });

  test('almost / malformed are FREE: no payout, no loss, no chain change', () => {
    const f = settle({ tier: 3, call: 95, free: true }, 6, 120);
    assert.deepEqual({ kind: f.kind, delta: f.delta, loose: f.loose, chain: f.chain }, { kind: 'free', delta: 0, loose: 120, chain: 6 });
    assert.deepEqual([...JOB.FREE_OUTCOMES], ['almost', 'malformed']);
  });
});

/* =========================================================================================
   11. Pricing one target — the two branches (G2)
   ========================================================================================= */

describe('J1 · carryFor and missFor', () => {
  test('the clear branch is round( m · ( L·ρ_eff·scope·wing·cold·tell·×2 + STAKE·(W−1) ) ), and NOT the old flat product', () => {
    const t = { tier: 2, scopeFlags: { isReview: true }, bucket: 2, overdueDays: 1, tell: { triggered: 1 }, tokens: 2, x2: true };
    /* scope 1.25 · cold 1.25 · wing 1.50 · tell 1.25 · ×2, rung 1 (ρ = 0.70), chain 2 (m = 1.4), call 85 */
    const loot = 18 * 0.70 * 1.25 * 1.25 * 1.50 * 1.25 * 2;   // the GAIN set — what the target is worth
    const stake = 18 * 2;                                      // `missFor`'s base minus wing_pen: L · ×2
    assert.equal(carryFor(t, 85, 2, 1, 0), round(1.4 * (loot + stake * 0.70 * (1.8 - 1))));
    /* **The negative control, and the whole of verify round 2's finding 1.** The clear branch used to
       be one flat product, `L·ρ·m·W·scope·wing·cold·tell·×2`, which paid the call's premium on the GAIN
       set while `missFor` charged its price on the LOSS set — so dressing a target raised the prize of
       a bold call and left its price alone, and the carry ladder's published cuts held on a bare
       target and nowhere else. That product is no longer what this function returns, and saying so
       here is the pin: if it ever comes back, this line fails. */
    assert.notEqual(carryFor(t, 85, 2, 1, 0), round(18 * 0.70 * 1.4 * 1.8 * 1.25 * 1.5 * 1.25 * 1.25 * 2));
    /* …and on a BARE target at ρ̄ = 1 the two forms are identical, which is why no published numeral
       in `data/job.js` moved: `L + L·(W−1) === L·W`. */
    for (const tier of [1, 2, 3, 4]) {
      for (const call of CALLS) {
        for (const chain of [0, 3, 8]) {
          assert.equal(carryFor({ tier }, call, chain, 0, 0),
            round(LOOT[tier] * chainMult(chain) * carryOf(call).W),
            `bare tier ${tier}, call ${call}, chain ${chain} must still be the published product`);
        }
      }
    }
    // each factor, checked by removing it
    assert.equal(carryFor({ tier: 1 }, 50, 0, 0, 0), LOOT[1], 'a bare tier-1 clean 50 call pays L exactly');
    assert.equal(carryFor({ tier: 4 }, 95, 0, 0, 0), round(70 * 2.2));
    assert.equal(carryFor({ tier: 1 }, 50, 0, 1, 0), round(6 * 0.7), 'one hint costs 30 % of the payout');
    assert.equal(carryFor({ tier: 1 }, 50, 0, 1, 1), 6, 'STEADY forgives it back');
    assert.equal(scopeOf({ scopeFlags: { isReview: true } }), scopeFor({ isReview: true }), 'scope is xp.scopeFor verbatim');
  });

  test('the miss branch is −min(LOOSE, round(L · m_chain · P · wing_pen · ×2)) and reads NO scope/cold/tell', () => {
    const base = { tier: 4 };
    assert.equal(missFor(base, 85, 2, 1e6), -round(70 * 1.4 * 2));
    assert.equal(missFor({ ...base, guarded: true }, 85, 2, 1e6), -round(70 * 1.4 * 2 * 2), 'wing_pen 2 on the guarded wing');
    assert.equal(missFor({ ...base, x2: true }, 85, 2, 1e6), -round(70 * 1.4 * 2 * 2), '×2 multiplies both branches identically');
    const loud = { ...base, scopeFlags: { isReview: true }, bucket: 1, overdueDays: 5, tell: { triggered: 3 } };
    assert.equal(missFor(loud, 85, 2, 1e6), missFor(base, 85, 2, 1e6), 'scope, cold and tell do not scale a loss');
  });

  test('a clear always pays at least as much as a miss, for every fixed (L, m, scope, wing, call)', () => {
    for (const tier of [1, 2, 3, 4]) {
      for (const chain of [0, 3, 8]) {
        for (const call of CALLS) {
          for (const guarded of [false, true]) {
            for (const rung of [0, 1, 2, 3]) {
              const t = { tier, guarded, rank: 3, tokens: 1 };
              const clear = carryFor(t, call, chain, rung, 0);
              const miss = missFor(t, call, chain, 1e6, 0);
              assert.ok(clear >= miss, `clear ${clear} < miss ${miss} at tier ${tier} call ${call}`);
              assert.ok(clear >= 0 && miss <= 0);
            }
          }
        }
      }
    }
  });

  test('the wing terms: +0.25 per token when unguarded, guardMult(rank) when guarded, tokens then pay nothing', () => {
    assert.equal(wingMult({ tokens: 0 }), 1);
    assert.equal(wingMult({ tokens: 2 }), 1.5);
    assert.equal(wingMult({ tokens: 3 }), 1.75);
    for (const r of JOB.RANKS) {
      assert.equal(wingMult({ guarded: true, rank: r.rank, tokens: 3 }), r.guardMult, `Called ${r.rank} guarded wing`);
      assert.equal(guardMultFor(r.rank), r.guardMult);
    }
    // rank helps MONOTONICALLY on the guarded wing while ε falls — both halves, both printed
    const mults = JOB.RANKS.map((r) => r.guardMult);
    const eps = JOB.RANKS.map((r) => r.eps);
    for (let i = 1; i < mults.length; i++) {
      assert.ok(mults[i] > mults[i - 1], 'the guard multiplier must rise with rank');
      assert.ok(eps[i] <= eps[i - 1], 'and ε must fall, so the guard aims better as you climb');
    }
    assert.equal(wingPen(true), 2);
    assert.equal(wingPen(false), 1);
    assert.equal(x2Mult(true), 2);
    assert.equal(x2Mult(false), 1);
  });

  test('postedFor is the envelope’s number — L · scope · wing · cold · tell · ×2, before call/rung/chain', () => {
    assert.equal(postedFor({ tier: 1, scopeFlags: { isReview: true }, bucket: 2, overdueDays: 3 }), round(6 * 1.25 * 1.5));
    assert.equal(postedFor({ tier: 1 }), 6);
    assert.equal(postedFor({ tier: 4, x2: true }), 140);
    assert.equal(lootFor({ tier: 3 }), 38);
    assert.equal(lootFor({ loot: 99 }), 99);
    assert.equal(coldOf({}), 1);
  });
});

/* =========================================================================================
   12. The regret line (G5 #2)
   ========================================================================================= */

describe('J1 · regretLine equals the optimal-play value for the realised order', () => {
  /** an independent brute force, written the long way round so it is not the implementation twice */
  function bruteForce(order) {
    const n = order.targets.length;
    const beats = n - 1;
    let best = -Infinity; let bestD = null;
    for (let mask = 0; mask < 2 ** beats; mask++) {
      const d = Array.from({ length: beats }, (_, i) => ((mask >> i) & 1 ? 'bag' : 'push'));
      const v = playOrder(order, d);
      if (v > best) { best = v; bestD = d; }
    }
    return { best, bestD };
  }

  const ORDERS = [
    { name: 'all clean, tier 1', targets: Array.from({ length: 6 }, () => ({ tier: 1, call: 85, rung: 0, qHat: 0.85 })) },
    { name: 'a late tier-4 miss', targets: [...Array.from({ length: 4 }, () => ({ tier: 1, call: 85, rung: 0, qHat: 0.85 })), { tier: 4, call: 95, rung: 4, qHat: 0.4 }] },
    { name: 'mixed rungs', targets: [{ tier: 1, call: 70, rung: 0, qHat: 0.7 }, { tier: 2, call: 85, rung: 1, qHat: 0.8 }, { tier: 1, call: 95, rung: 4, qHat: 0.9 }, { tier: 3, call: 85, rung: 2, qHat: 0.6 }, { tier: 4, call: 85, rung: 0, qHat: 0.8 }] },
    { name: 'HELD crew, deep chain', targets: Array.from({ length: 7 }, (_, i) => ({ tier: i === 5 ? 3 : 1, call: 85, rung: i === 5 ? 3 : 0, crew: 2, qHat: 0.8 })) },
    { name: 'every target a miss', targets: Array.from({ length: 5 }, () => ({ tier: 2, call: 95, rung: 4, qHat: 0.3 })) },
    { name: 'one target', targets: [{ tier: 1, call: 85, rung: 0, qHat: 0.85 }] },
  ];

  for (const o of ORDERS) {
    for (const completion of [false, true]) {
      test(`${o.name}${completion ? ' + completion' : ''}: the optimal value matches an independent brute force`, () => {
        const order = { targets: o.targets, decisions: o.targets.slice(0, -1).map(() => 'push'), completion };
        const { best, bestD } = bruteForce(order);
        const r = regretLine(order);
        near(r.optimal, best, 1e-9, 'regretLine.optimal');
        near(r.actual, playOrder(order, order.decisions), 1e-9, 'regretLine.actual');
        near(r.cost, best - r.actual, 1e-9, 'cost = optimal − actual');
        assert.ok(r.cost >= -1e-9, 'you can never beat optimal play');
        near(playOrder(order, r.best), best, 1e-9, 'the reported best vector really achieves the optimum');
        assert.equal(optimalOrder(order).value, best);
        assert.equal(r.best.length, Math.max(0, o.targets.length - 1), 'the vault target ends in the getaway, not a bag/push');
        if (bestD) assert.equal(playOrder(order, bestD) <= best + 1e-9, true);
      });
    }
  }

  test('playing optimally leaves no regret line at all', () => {
    const targets = ORDERS[2].targets;
    const { bestD } = bruteForce({ targets });
    const r = regretLine({ targets, decisions: bestD });
    near(r.cost, 0, 1e-9);
    assert.equal(r.at, null);
    assert.equal(r.line, '');
  });

  test('a real regret prints G6’s line, with the divergent beat’s own chain, q* and q̂', () => {
    const targets = [
      { tier: 1, call: 85, rung: 0, qHat: 0.80 },
      { tier: 1, call: 85, rung: 0, qHat: 0.80 },
      { tier: 1, call: 85, rung: 0, qHat: 0.80 },
      { tier: 2, call: 85, rung: 4, qHat: 0.62 },
      { tier: 1, call: 70, rung: 0, qHat: 0.90 },
    ];
    const r = regretLine({ targets, decisions: ['bag', 'push', 'push', 'push'], completion: true });
    assert.ok(r.cost > 0);
    assert.equal(r.at, 0);
    assert.equal(r.did, 'bag');
    assert.equal(r.said, 'push');
    assert.equal(r.chain, 1, 'one clean target before the divergent beat');
    /* verify r2 (player-feel): the cost carries its unit — `playOrder` returns "the final BAGGED",
       and `regret2` one paragraph below prints `cost N credit.` on the other ladder entirely. */
    assert.match(r.line, /^you bagged at chain 1; the threshold said push \(q\* 0\.\d\d, your q̂ 0\.80\)\. cost \d+ bagged\.$/);
    // the printed q* is `breakevenQ` at that beat's own state, not a constant
    assert.ok(r.qStar > 0 && r.qStar < 1);
    // no exclamation mark, no praise, no emoji — G6's voice rule
    assert.equal(/[!]/.test(r.line), false);
  });

  test('the completion bonus is +10 % on BAGGED and the honoured COMMIT +8 % (G2, G3.9)', () => {
    const targets = [{ tier: 1, call: 50, rung: 0 }, { tier: 1, call: 50, rung: 0 }];
    const plain = playOrder({ targets }, ['push']);
    near(playOrder({ targets, completion: true }, ['push']), plain * (1 + COMPLETION), 1e-9);
    near(playOrder({ targets, commit: true }, ['push']), plain * (1 + JOB.COMMIT_BONUS), 1e-9);
    assert.equal(COMPLETION, 0.10);
    assert.equal(JOB.COMMIT_BONUS, 0.08);
  });

  test('optimalOrder refuses an order it cannot brute-force rather than returning a guess', () => {
    assert.throws(() => optimalOrder({ targets: Array.from({ length: 21 }, () => ({ tier: 1, rung: 0 })) }), RangeError);
  });

  /* -------------------------------------------------------------------------------------
     THE SENTENCE MUST NOT REFUTE ITSELF (round-1 critic finding 1).

     `you bagged at chain 0; the threshold said push (q* 1.00, your q̂ 0.62)` was shipping: the
     verdict came from `optimalOrder` (hindsight over the realised rungs) while the number came
     from `breakevenQ` (the ex-ante threshold). Two economies in one sentence. The debrief is the
     layer's honesty surface, so `said` and `qStar` now come out of the same function at the same
     state, and this is the invariant that keeps them there.
     ------------------------------------------------------------------------------------- */
  test('said and q* are the same economy: “push” always means q̂ ≥ q*, and “bag” means q̂ ≤ q*', () => {
    // a deterministic sweep of realised orders, decisions and q̂s — no Math.random under tests either
    const RUNGS = [0, 1, 2, 4];
    const TIERS = [1, 2, 4];
    const QHATS = [0.30, 0.62, 0.70, 0.80, 0.90, 0.95];
    let lines = 0; let checked = 0;
    for (let seed = 0; seed < 512; seed++) {
      const n = 4 + (seed % 3);
      const targets = Array.from({ length: n }, (_, i) => {
        const k = (seed * 7 + i * 13);
        return {
          tier: TIERS[(k >> 1) % TIERS.length],
          call: CALLS[(k >> 2) % CALLS.length],
          rung: RUNGS[k % RUNGS.length],
          qHat: QHATS[(k >> 3) % QHATS.length],
        };
      });
      const decisions = Array.from({ length: n - 1 }, (_, i) => (((seed >> i) & 1) ? 'bag' : 'push'));
      const r = regretLine({ targets, decisions, completion: seed % 2 === 0 });
      checked++;
      if (!r.line) continue;
      lines++;
      const where = `seed ${seed}: ${r.line}`;
      assert.ok(r.qStar != null && r.qHat != null, where);
      if (r.said === 'push') assert.ok(r.qHat >= r.qStar - 1e-12, `“said push” with q̂ < q*: ${where}`);
      if (r.said === 'bag') assert.ok(r.qHat <= r.qStar + 1e-12, `“said bag” with q̂ > q*: ${where}`);
      assert.notEqual(r.said, r.did, 'the line only ever names a beat the student took against the threshold');
      assert.ok(r.cost > 0, 'and only on a line that actually cost money');
    }
    assert.ok(checked === 512 && lines > 50, `the sweep has to produce real regret lines (got ${lines})`);
  });

  test('the beat the line names is the threshold’s divergence, and the solver’s is reported separately', () => {
    const targets = [
      { tier: 1, call: 85, rung: 0, qHat: 0.80 },
      { tier: 1, call: 85, rung: 0, qHat: 0.80 },
      { tier: 1, call: 85, rung: 0, qHat: 0.80 },
      { tier: 2, call: 85, rung: 4, qHat: 0.62 },
      { tier: 1, call: 70, rung: 0, qHat: 0.90 },
    ];
    const r = regretLine({ targets, decisions: ['bag', 'push', 'push', 'push'], completion: true });
    assert.equal(r.at, 0);
    assert.equal(r.solverAt, 0, 'here the two models agree about the beat');
    // …and `said` is the threshold's own verdict at that state, recomputable from the exports
    const s0 = settle(targets[0], 0, 0);
    const st = { ...targets[1], loose: s0.loose, chain: s0.chain, call: 85, q: 0.80 };
    assert.equal(r.said, pushOrBag(st));
    assert.equal(r.qStar, breakevenQ(st));
    assert.equal(r.chain, s0.chain);
  });

  test('a beat with no recorded q̂ is not nameable — the debrief says nothing rather than something it cannot back', () => {
    // every target's q̂ missing: there is no threshold verdict to print, so there is no line, even
    // though the solver can still see the cost.
    const targets = [
      { tier: 1, call: 95, rung: 0 },
      { tier: 4, call: 95, rung: 4 },
      { tier: 1, call: 95, rung: 0 },
    ];
    const r = regretLine({ targets, decisions: ['push', 'push'] });
    assert.ok(r.cost > 0, 'the solver still prices the line');
    assert.equal(r.at, null);
    assert.equal(r.line, '');
    assert.equal(typeof r.solverAt, 'number', 'and it still reports where IT diverged');
  });
});

/* =========================================================================================
   13. The shape / split table, recomputed from constants (G1)
   ========================================================================================= */

describe('J1 · G1’s shape table recomputes from data/job.js', () => {
  for (const id of JOB.SHAPE_IDS) {
    test(`${id}: game s = fixed + per-target · wall = answer + game · split = game/wall`, () => {
      const row = shapeTable(id);
      const pub = P.shapeTable[id];
      assert.equal(row.targets, pub.targets);
      assert.equal(row.answerS, pub.answerS, 'answer seconds from LIMITS.minutesPerTier and the tier mix');
      assert.equal(row.decisionS, pub.decisionS, 'per-target decision seconds from DECISION_SECONDS');
      assert.deepEqual([row.gameS.default, row.gameS.full], pub.gameS);
      assert.deepEqual([row.wallS.default, row.wallS.full], pub.wallS);
      assert.deepEqual([row.split.default, row.split.full], pub.split);
      // the three identities, checked rather than assumed
      assert.equal(row.gameS.default, fixedSeconds(id, 'default') + decisionSeconds(id));
      assert.equal(row.wallS.full, answerSeconds(id) + row.gameS.full);
      near(row.split.full, round((100 * row.gameS.full) / row.wallS.full, 1), 1e-12);
      // every shape sits inside COMPOSED S1's 10–25 minute session at both ends
      if (id !== 'RUN') {
        assert.ok(row.wallS.full <= 25 * 60, `${id} full-use wall clock ${row.wallS.full}s exceeds 25 min`);
      }
      assert.ok(row.wallS.default >= 6 * 60 - 1, `${id} is not a trivially short session`);
    });
  }

  test('the tier mixes reproduce G2’s four L̄ values: 6.0 · 8.4 · 12.7 · 23.1', () => {
    for (const [id, pub] of Object.entries(P.lootMean)) near(round(lootMean(id), 1), pub, 1e-9, `L̄ ${id}`);
    near(lootMean('JOB'), (8 * 6 + 2 * 18) / 10, 1e-12);
    near(lootMean('VAULT'), (3 * 6 + 2 * 18 + 38 + 70) / 7, 1e-12);
  });

  test('the fixed-phase totals reproduce from the phases, with brief × the shape’s own window count', () => {
    assert.equal(fixedSeconds('JOB', 'default'), P.fixedTotals.JOB.default);
    assert.equal(fixedSeconds('JOB', 'full'), P.fixedTotals.JOB.full);
    assert.equal(fixedSeconds('RUN', 'default'), P.fixedTotals.RUN.default);
    assert.equal(fixedSeconds('RUN', 'full'), P.fixedTotals.RUN.full);
    // JOB / JOB12 / VAULT all take the JOB column — which is what makes their game seconds reproduce
    for (const id of ['JOB', 'JOB12', 'VAULT']) assert.equal(JOB.SHAPES[id].fixed, 'JOB');
    // and the JOB column really does sum, phase by phase
    const p = JOB.FIXED_PHASES.JOB.default.phases;
    assert.equal(p.board + p.guard + p.brief * 2 + p.getaway + p.debrief, 160);
    /* and the column has no cell the machine cannot enter: `crew` was a between-jobs phase no
       `setPhase` under `site/js` ever set, and its 25 s was already sold inside the brief window's
       five published options. Verify round 2, split-honesty — `tests/job-split.test.mjs` §1 owns the
       general rule; this is the JOB column's own arithmetic. */
    assert.deepEqual(Object.keys(p).slice().sort(), ['board', 'brief', 'debrief', 'getaway', 'guard']);
    assert.equal(JOB.FIXED_PHASES.JOB.full.total, 257, 'the full column is 257 s, not the double-charged 282');
    /* G1 publishes RUN full-use as a TOTAL only (notes/J1.md open issue 1). Integration filled the
       column in from `tests/job-split.test.mjs`'s own derivation (notes/J8.md Request 3), so the
       data file now carries it — and it must still sum to G1's published total, which is the half
       of the cell G1 actually owns. */
    const rf = JOB.FIXED_PHASES.RUN.full.phases;
    assert.ok(rf, 'data/job.js must publish RUN.full.phases');
    assert.equal(rf.board + rf.guard + rf.brief * JOB.SHAPES.RUN.briefs + rf.getaway + rf.debrief,
      JOB.FIXED_PHASES.RUN.full.total, 'the filled-in RUN full column must sum to G1\'s 130 s');
  });

  test('the decision count is 24 mandatory / 35 full on the JOB-10 shape, and ≥ 2 per graded item', () => {
    const d = decisionCount('JOB');
    assert.equal(d.mandatory, P.decisionCount.JOB.mandatory);
    assert.equal(d.full, P.decisionCount.JOB.full);
    // 1 DRAFT + 1 PRESS + 10 CALL + 9 BAG/PUSH + 2 briefs + 1 getaway
    assert.equal(d.mandatory, 1 + 1 + 10 + 9 + 2 + 1);
    /* ROUND-2 VERIFY (split-honesty finding 5) — WHAT THESE TWO LINES ARE, SAID OUT LOUD.
       `decisionCount` sums literals out of `site/data/job.js` (`DECISIONS.*`, `SHAPES[id].targets`,
       `BOARD.briefAfterTargets`) and `SPLIT.densityMin*` are literals in the same file, so both
       assertions are arithmetic over the data file checked against the data file: they would pass
       with `debriefOf` printing zero decisions per item, and they were the ONLY guard G9 #1 had.
       They are kept — the published table must still reproduce from the constants — but they are
       labelled as the table's own arithmetic, and the claim about the PRODUCT is measured through a
       played full-use job in `tests/job-split.test.mjs` §"G9 #1, MEASURED", which is where the gap
       between this floor and the number the debrief prints (2.42–2.67 against 3) is pinned. */
    assert.ok(d.perItem.default >= JOB.SPLIT.densityMinDefault,
      'G9 #1, as the table computes it: ≥ 2 decisions per graded item (the MEASURED density is job-split.test.mjs\'s)');
    assert.ok(d.perItem.full >= JOB.SPLIT.densityMinFull,
      'G9 #1, as the table computes it: ≥ 3 with the windows (the MEASURED density is job-split.test.mjs\'s)');
    for (const id of JOB.SHAPE_IDS) {
      const dd = decisionCount(id);
      assert.ok(dd.perItem.default >= 2, `${id} default density`);
      assert.ok(dd.full > dd.mandatory, `${id} full use adds decisions`);
    }
  });

  /* ---------------------------------------------------------------------------------------
     A PUBLISHED WINDOW THE SHAPE CANNOT OPEN (round-2 critic finding 4).

     `BOARD.briefAfterTargets` is [4, 8] and VAULT is 7 targets, so its second window falls after
     a target that shape does not have. `decisionCount` and `fixedSeconds` multiplied by
     `SHAPES.VAULT.briefs = 2` anyway, so the published mandatory count was 18 against the 17 a
     completed VAULT produces — printed side by side in the debrief's own line. `board.js
     projectFor` already clamped; the published side does now too, via `econ.landedBriefs`.
     --------------------------------------------------------------------------------------- */
  test('a brief window that can never open is never charged: landedBriefs clamps the shape', () => {
    // the clamp, spelled out from the primitives rather than from the function under test
    for (const id of JOB.SHAPE_IDS) {
      const s = JOB.SHAPES[id];
      const reachable = JOB.BOARD.briefAfterTargets.filter((n) => n < s.targets).length;
      assert.equal(landedBriefs(id), Math.min(s.briefs, reachable), `${id}`);
      assert.ok(landedBriefs(id) <= s.briefs, `${id} can never serve more than its ceiling`);
    }
    assert.equal(landedBriefs('VAULT'), 1, 'VAULT is 7 targets against windows [4, 8]');
    assert.equal(JOB.SHAPES.VAULT.briefs, 2, '…and its ceiling is still 2 — the clamp is the fix, not the data');
    for (const id of ['RUN', 'JOB', 'JOB12']) assert.equal(landedBriefs(id), JOB.SHAPES[id].briefs, `${id} unaffected`);

    // the two numbers that were wrong, and the one line that printed them together
    const v = decisionCount('VAULT');
    assert.equal(v.mandatory, P.decisionCount.VAULT.mandatory);
    assert.equal(v.full, P.decisionCount.VAULT.full);
    // 1 DRAFT + 1 PRESS + 7 CALL + 6 BAG/PUSH + 1 brief + 1 getaway = 17, which is what a VAULT produces
    assert.equal(v.mandatory, 1 + 1 + 7 + 6 + 1 + 1);
    assert.equal(v.mandatory, 17);
    assert.equal(fixedSeconds('VAULT', 'default'), 140, 'one brief cell, not two');
    /* 207, not 232: the full column's 25 s `crew` cell is gone (verify round 2, split-honesty —
       an unenterable phase, and a second charge for an option already inside the brief window). */
    assert.equal(fixedSeconds('VAULT', 'full'), 207);
    // JOB and JOB12 still reproduce the JOB fixed column's published totals exactly
    for (const id of ['JOB', 'JOB12']) {
      assert.equal(fixedSeconds(id, 'default'), JOB.FIXED_PHASES.JOB.default.total, `${id} default`);
      assert.equal(fixedSeconds(id, 'full'), JOB.FIXED_PHASES.JOB.full.total, `${id} full`);
    }
    assert.equal(fixedSeconds('RUN', 'default'), JOB.FIXED_PHASES.RUN.default.total);

    /* and the board's own projection agrees with the published table by construction now —
       `board.js projectFor` uses this same clamp, spelled its own way */
    for (const id of JOB.SHAPE_IDS) {
      const s = JOB.SHAPES[id];
      assert.equal(Math.min(s.briefs, JOB.BOARD.briefAfterTargets.filter((n) => n < s.targets).length),
        landedBriefs(id), `${id}: the board's clamp and the table's clamp are one number`);
    }
  });

  test('there is no constant-ratio claim: the four shapes’ splits span 28.3 % to 54.3 %', () => {
    const all = JOB.SHAPE_IDS.flatMap((id) => { const r = shapeTable(id); return [r.split.default, r.split.full]; });
    /* The ENDS are read off the published table rather than typed here, so this test cannot pin a
       numeral the product has stopped producing — which is what it was doing: it held VAULT's
       default split at 29.6 %, the figure that charged a 7-target shape for two brief windows.
       (Round 2, split-honesty. The bound itself is still checked — see the two asserts below.) */
    const pub = JOB.SHAPE_IDS.flatMap((id) => P.shapeTable[id].split);
    assert.equal(Math.min(...all), Math.min(...pub));
    assert.equal(Math.max(...all), Math.max(...pub));
    assert.equal(Math.min(...all), 28.3, 'VAULT default — one brief window, not two');
    assert.equal(Math.max(...all), 54.3);
    assert.ok(Math.max(...all) - Math.min(...all) > 20, 'the spread is the claim, not a number');
  });
});

/* =========================================================================================
   14. data/job.js is complete and consistent with the study layer it prices
   ========================================================================================= */

describe('J1 · data/job.js: complete, frozen, and consistent with the study layer', () => {
  test('the four wings partition the 19 skills and their weights sum to 100', () => {
    const listed = JOB.WINGS.flatMap((w) => w.skills);
    assert.equal(listed.length, 19);
    assert.equal(new Set(listed).size, 19, 'no skill in two wings');
    assert.deepEqual([...listed].sort(), [...SKILL_IDS].sort(), 'exactly the 19 skills in data/skills.js');
    let total = 0;
    for (const w of JOB.WINGS) {
      const sum = w.skills.reduce((t, id) => t + skills.find((s) => s.id === id).w, 0);
      assert.equal(sum, w.w, `${w.id} Σw`);
      assert.equal(sum, P.wingWeights[w.id]);
      total += sum;
    }
    assert.equal(total, 100);
    assert.equal(total, TOTAL_WEIGHT);
    for (const id of SKILL_IDS) assert.ok(JOB.WING_OF_SKILL[id], `${id} has a wing`);
  });

  test('AREA→WING covers all 11 AREAS, so all 68 tags resolve with no tag-record migration', () => {
    assert.deepEqual(Object.keys(JOB.AREA_WING).sort(), AREAS.map((a) => a.id).sort());
    assert.equal(Object.keys(MISCONCEPTIONS).length, JOB.FAULT_INDEX.tags);
    assert.equal(AREAS.length, JOB.FAULT_INDEX.areas);
    for (const [area, wing] of Object.entries(JOB.AREA_WING)) {
      if (area === 'general') { assert.equal(wing, null, 'general resolves to the card’s own wing'); continue; }
      assert.ok(JOB.WING_IDS.includes(wing), `${area} → ${wing}`);
    }
    for (const tag of Object.values(MISCONCEPTIONS)) {
      assert.ok(Object.prototype.hasOwnProperty.call(JOB.AREA_WING, tag.area), `tag area ${tag.area} is mapped`);
    }
  });

  test('the carry ladder and the rating ladder are both complete and both reproduce the EV table', () => {
    assert.deepEqual(JOB.CALL_LEVELS.map((c) => c.id), CALLS);
    for (const [qKey, row] of Object.entries(P.evTable)) {
      const q = Number(qKey);
      for (const call of CALLS) {
        const { W, P: pen } = carryOf(call);
        near(q * W - (1 - q) * pen, row[call], 1e-9, `EV at q=${q} call=${call}`);
      }
    }
    // carry indifference, from W/P: 0.600 / 0.7778 / 0.88235
    const [a, b, c] = JOB.CALL_INDIFFERENCE.carry;
    near(a, 0.600, 1e-9); near(b, 0.7778, 1e-4); near(c, 0.88235, 1e-5);
    for (const [i, x] of JOB.CALL_INDIFFERENCE.carry.entries()) {
      const lo = carryOf(CALLS[i]); const hi = carryOf(CALLS[i + 1]);
      near(x * lo.W - (1 - x) * lo.P, x * hi.W - (1 - x) * hi.P, 1e-9, `carry indifference ${i}`);
    }
    // the two ladders disagree in exactly two bands, and they are 2.1 points wide together
    const bands = JOB.CALL_DISAGREEMENT_BANDS;
    assert.equal(bands.length, 2);
    const width = bands.reduce((t, x) => t + (x.to - x.from), 0);
    near(width * 100, 2.1, 0.1, 'the two disagreement bands total ~2.1 percentage points');
    for (const band of bands) assert.ok(band.to > band.from, 'each band is non-empty');
    assert.equal(JOB.CALL_LEVELS.find((c) => c.id === 95).minRank, 3, 'the 95 call needs Called ≥ 3');
  });

  test('the rank ladder: five ranks, monotone thresholds, 95 from rank 3, and no gate on learning', () => {
    assert.equal(JOB.RANKS.length, 5);
    assert.deepEqual(JOB.RANKS.map((r) => r.name), ['Called 1', 'Called 2', 'Called 3', 'Called 4', 'Called 5']);
    assert.deepEqual(JOB.RANKS.map((r) => r.min), [...JOB.RANK_THRESHOLDS]);
    for (let i = 1; i < JOB.RANKS.length; i++) assert.ok(JOB.RANKS[i].min > JOB.RANKS[i - 1].min);
    for (const r of JOB.RANKS) assert.equal(r.calls.includes(95), r.rank >= 3);
    // calling 50 on everything scores exactly 5.0 — cowardice keeps its money and buys no rank
    near(JOB.RATING.base + JOB.RATING.scale * 0, 5.0, 1e-12);
    assert.equal(JOB.RATING.N, 50, 'N is the WINDOW SIZE, not Σw (G12 #1)');
    assert.equal(JOB.RATING.informativeMin, 0.25);
    assert.equal(JOB.CAPS.calls, JOB.RATING.N);
  });

  test('crew: capacity 8 → 22, at most 12 manned, and the ceiling really is 10 HELD + 2 STEADY + 7 bare', () => {
    const cap = (level, stamps) => JOB.CREW.base + Math.floor(level / JOB.CREW.levelsPerPoint) + stamps;
    assert.equal(cap(1, 0), P.capacity.atL1NoStamps);
    assert.equal(cap(15, 7), P.capacity.atL15AllStamps);
    assert.equal(JOB.CREW.capacityMin, 8);
    assert.equal(JOB.CREW.capacityMax, 22);
    assert.equal(JOB.CREW.mannedMax, 12);
    const b = JOB.CREW.maxBuildAtCeiling;
    assert.equal(b.held * JOB.CREW.COSTS.HELD + b.steady * JOB.CREW.COSTS.STEADY, 22, 'the ceiling build spends all 22 points');
    assert.equal(b.held + b.steady, 12, 'and mans exactly 12 makes');
    assert.equal(b.held + b.steady + b.bare, JOB.CREW.makes, 'so seven makes are always bare');
    assert.equal(JOB.CREW_RANKS[2].requires, 'mastery.isMastered', 'HELD’s gate is isMastered alone (G12 #4)');
    /* THE 4×2 MATRIX — and what these three assertions do NOT prove, said here so nobody reads them
       as a clean bill of health (round 4, repair-econ).

       They are a TRANSCRIPTION pin and an INTERNAL-CONSISTENCY pin: that `data/job.js` still carries
       the winners G2 publishes, and that the published per-point column still picks the published
       winner column — which is what fires if a repricing flips one and forgets the other, i.e.
       exactly the edit REPAIR-DECISION §S4.7 would make. They compare PUBLISHED against PUBLISHED and
       they are NOT evidence that the matrix is true.

       It is not true. The measurement lives in the crew lane's own file and is pinned there against
       the shipped functions: `tests/job-crew.test.mjs:1040-1047` asserts `bestRankFor` = the
       published column AND `assert.notEqual(bestRankFor('JOB'), rowFor('JOB').winner)` with the
       message *"if the published and the measured argmax now AGREE, `data/job.js` CREW_MATRIX has
       been repriced"* — STEADY wins every shape on the measurement (STEADY/pt vs HELD/pt
       1.50/0.09 · 3.33/0.25 · 5.95/0.48 · 6.44/0.40, notes/repair-crew.md §1.1).

       So the falsehood is policed, and it is policed where the functions are. What may NOT happen is
       a lane repricing these rows on its own: the crew lane's `notEqual` fails the moment the
       published and measured argmaxes agree, by design. Both edits land together in ONE change —
       `notes/repair-crew.md` Request R-D1, which lists these three assertions as this lane's to drop
       when §S4.2's deletion ships. Until then they stay exactly as they are. */
    assert.equal(JOB.CREW_MATRIX.rows.find((r) => r.shape === 'RUN').winner, 'STEADY');
    for (const id of ['JOB', 'JOB12', 'VAULT']) assert.equal(JOB.CREW_MATRIX.rows.find((r) => r.shape === id).winner, 'HELD');
    for (const r of JOB.CREW_MATRIX.rows) {
      const winner = r.steadyPerPoint > r.heldPerPoint ? 'STEADY' : 'HELD';
      assert.equal(winner, r.winner, `${r.shape}: the published per-point values must pick the published winner`);
    }
  });

  test('every other constant a later ticket needs is here (the point of the file)', () => {
    for (const k of ['LOOT', 'LADDER', 'CHAIN', 'FEE', 'TELL', 'COMPLETION', 'COLD', 'SHAPES', 'RANKS', 'WINGS',
      'AREA_WING', 'CREW', 'CREW_RANKS', 'GUARD', 'ELO', 'VAULT_GRADE', 'CALL_LEVELS', 'RATING', 'RANK_THRESHOLDS',
      'BOARD', 'BACKCHECK', 'FAULT_INDEX', 'WEEK', 'REVIEW_BOARD', 'CAPS', 'SAVE_DEFAULTS', 'TAG_RECORD_DEFAULT',
      'IN_PROGRESS_KEYS', 'FIXED_PHASES', 'PHASE_MEANS_DEFAULT', 'DECISION_SECONDS', 'DECISIONS', 'SPLIT',
      'NOUNS', 'VERBS', 'KEYS', 'STATES', 'COPY', 'GLYPHS', 'ANIMATION', 'SOUND_CUES', 'HEADER', 'LAYOUT',
      'X2', 'DECLINE_PRICE', 'COLD_OPEN', 'PUBLISHED']) {
      assert.ok(JOB[k] !== undefined, `data/job.js must export ${k}`);
    }
    assert.equal(JOB.NOUNS.length, 14, 'the fourteen nouns the fiction adds');
    assert.equal(JOB.ANIMATION.cues.length, 6, 'six animation cues, no more');
    for (const c of JOB.ANIMATION.cues) assert.ok(c.ms <= JOB.ANIMATION.maxMs, `${c.id} exceeds the 600 ms budget`);
    /* the TABLE's shape only — the four cues have no reader under site/js, and that is measured in
       tests/job-juice.test.mjs §"the four G6 cues are DECLARED and UNBUILT" (verify-2 finding 7). */
    assert.equal(JOB.SOUND_CUES.length, 4);
    assert.equal(JOB.HEADER.itemsDuringJob, 5);
    assert.equal(JOB.HEADER.itemsOutsideJob, 6);
    assert.equal(JOB.HEADER.hiddenDuringJob.length + JOB.HEADER.keptDuringJob.length, 6, 'four hidden of the existing six');
    assert.equal(JOB.HEADER.keptDuringJob.length + JOB.HEADER.addedDuringJob.length, 5, 'five items during a job');
    assert.deepEqual(Object.keys(JOB.CAPS).sort(), ['bundles', 'calls', 'heat', 'log', 'tags']);
    assert.equal(JOB.CAPS.tags, JOB.FAULT_INDEX.tags);
    // the fifth cap, added at integration for `game.heat.window` (notes/J3.md §5.5 → J10)
    assert.equal(JOB.CAPS.heat, JOB.GUARD.xHatWindowJobs, 'the heat cap IS the guard window length');
    assert.deepEqual(JOB.SAVE_DEFAULTS.game.heat.window, [], 'the press window is a declared key, not a pass-through');
    assert.equal(typeof JOB.TAG_RECORD_DEFAULT.days, 'number', 'tags[].days is a COUNT, never an array (G12 #18)');
    assert.equal(JOB.SAVE_DEFAULTS.player.rating.value, 5.0);
    assert.deepEqual(JOB.SAVE_DEFAULTS.player.elo, { player: 1000, house: 1000 });
    assert.deepEqual({ ...JOB.SAVE_DEFAULTS.game.ledger.phaseMeans }, { ...JOB.PHASE_MEANS_DEFAULT });
    assert.deepEqual(Object.keys(JOB.SAVE_DEFAULTS.game.heat.press).sort(), [...JOB.WING_IDS].sort());
  });

  test('the SCOPE mirror still matches xp.scopeFor, which is the authority', () => {
    assert.equal(JOB.SCOPE_MIRROR.review, scopeFor({ isReview: true }));
    assert.equal(JOB.SCOPE_MIRROR.drill, scopeFor({ isDrill: true }));
    assert.equal(JOB.SCOPE_MIRROR.variant, scopeFor({ isVariant: true }));
    assert.equal(JOB.SCOPE_MIRROR.mastered, scopeFor({ isMastered: true }));
    assert.equal(JOB.SCOPE_MIRROR.bonus, scopeFor({ isBonusBank: true }));
  });

  test('the guard, elo and x2 constants are the published ones', () => {
    assert.equal(JOB.GUARD.cap, 0.75);
    assert.equal(JOB.GUARD.tokens, 3);
    assert.equal(JOB.GUARD.tokenBonus, 0.25);
    assert.equal(JOB.GUARD.sameWingMaxRuns, 3);
    assert.equal(JOB.GUARD.xHatWindowJobs, 10);
    assert.equal(JOB.GUARD.jobWeightCap, 0.25);
    assert.deepEqual(JOB.RANKS.map((r) => r.eps), [0.25, 0.20, 0.15, 0.15, 0.10]);
    assert.equal(JOB.ELO.k, 24);
    assert.equal(JOB.ELO.flowPenalty, -40);
    assert.equal(JOB.ELO.houseSeed, 1000);
    assert.deepEqual(JOB.VAULT_GRADE.map((v) => v.tier ?? v.tierMax), [2, 3, 4]);
    near(JOB.X2.p, 1 / 6, 1e-12);
    assert.equal(JOB.X2.mult, 2);
    assert.equal(JOB.DECLINE_PRICE, 0.15);
    assert.equal(JOB.WEEK.quietHour, 22);
    assert.deepEqual(JOB.BOARD.briefAfterTargets, [4, 8]);
    assert.equal(JOB.BOARD.draftFor[5], 3);
    assert.equal(JOB.BOARD.draftFor[4], 2);
    assert.equal(JOB.BOARD.draftFor[2], 0, '≤ 2 posted contracts means no draft');
  });

  test('every export is frozen, so no screen can mutate the economy at runtime', () => {
    for (const [k, v] of Object.entries(JOB)) {
      if (v && typeof v === 'object') assert.equal(Object.isFrozen(v), true, `data/job.js ${k} must be frozen`);
    }
    assert.throws(() => { JOB.LOOT[1] = 999; }, TypeError);
  });

  test('the copy table reproduces G6’s lines and keeps G6’s voice', () => {
    /* `· weight 0.96`, not `×0.96` — the entry's `credit` slot is fed the MEASURED rating move by
       `screens/job.js payoutLineOf`, and `Δrating = 2·w·c/N` already contains `w`, so the `×`
       multiplied a factor that was inside the number (round 3 verification, player-feel). */
    assert.equal(JOB.COPY.clear({ loose: 40, chain: 4, credit: 6.4, w: 0.96 }), '+40 loose · chain 4 · rating +6.4 · weight 0.96');
    assert.equal(JOB.COPY.ladder({ attempt: 2, crew: 'STEADY', rho: '0.70', loose: 19 }), 'attempt 2 · crew STEADY forgives one · ρ 0.70 · +19 loose');
    assert.equal(JOB.COPY.miss({ make: 'FAC2', tell: 'dropped-gcf', loose: 19, chain: 0 }), 'FAC2 · tell: dropped-gcf · −19 loose · chain 0');
    assert.equal(JOB.COPY.bag({ bagged: 118, fee: 13, chainBefore: 4 }), 'bagged 118 · fee 13 · chain 4 → 0');
    assert.equal(JOB.COPY.bagPrompt({ amount: 118, fee: 13, chainBefore: 4 }), 'bag 118 (fee 13 · chain 4 → 0)');
    assert.equal(JOB.COPY.sealed({ tag: 'dropped-gcf' }), 'dropped-gcf sealed · tell 1.00');
    assert.equal(JOB.COPY.quiet({ readiness: 89, due: 0 }), 'Board quiet · Readiness 89 · 0 due');
    assert.equal(JOB.COPY.callIt({ left: 4 }), 'stakes off · 4 targets left · hints on');
    assert.equal(JOB.COPY.crewIdle({ make: 'VOC' }), 'VOC crew idle — this target is its own due review');
    assert.equal(JOB.COPY.regret2({ envelope: 6, called: 85, evMax: 70, cost: 0.3 }), 'envelope 6: you called 85, EV-max was 70. cost 0.3 credit.');
    assert.equal(
      JOB.COPY.guard({ wing: 'WORDS', tokens: ['RECALL 2', JOB.COPY.guardToken({ wing: 'WORDS', n: 1, mult: '0.60' }), 'FIGURES 0'].join(' · ') }),
      'GUARD: WORDS.  your tokens: RECALL 2 · WORDS 1 (×0.60) · FIGURES 0',
    );
    // G6's voice lint, applied to every rendered line this suite can render
    const rendered = [
      JOB.COPY.clear({ loose: 40, chain: 4, credit: 6.4, w: 0.96 }),
      JOB.COPY.miss({ make: 'FAC2', tell: 'x', loose: 1, chain: 0 }),
      JOB.COPY.walk({ bagged: 280, rating: '7.12', rank: 'Called 3', thinking: '7:00', deciding: '5:29', decisions: 24 }),
      JOB.COPY.vault({ make: 'FIG-ALG', grade: 4, hits: 4, of: 10, q: '0.43' }),
      JOB.COPY.deflation(), JOB.COPY.morning(), JOB.COPY.quietBanked(),
    ];
    for (const s of rendered) {
      assert.equal(/[!]/.test(s), false, `"${s}" contains an exclamation mark`);
      assert.equal(/\b(I|we|my|me|our)\b/.test(s), false, `"${s}" uses a first-person pronoun`);
      assert.equal(/\p{Extended_Pictographic}/u.test(s), false, `"${s}" contains an emoji`);
      assert.equal(/\b(great|nice|awesome|amazing|perfect|brilliant|well done)\b/i.test(s), false, `"${s}" praises`);
    }
  });
});

/* =========================================================================================
   15. The layer's own discipline: DOM-free, pure, seeded
   ========================================================================================= */

describe('J1 · js/job/* is DOM-free and pure', () => {
  const jobFiles = listFiles(join(ROOT, 'site', 'js', 'job'));

  test('there is at least one module under site/js/job to scan', () => {
    assert.ok(jobFiles.length >= 1);
    assert.ok(jobFiles.some((f) => f.endsWith('econ.js')));
  });

  for (const f of jobFiles) {
    test(`${relative(ROOT, f)} touches no DOM and imports nothing from screens/`, () => {
      const src = readFileSync(f, 'utf8');
      const code = stripCommentsAndStrings(src);     // the same scanner no-random.test.mjs uses
      for (const bad of ['document.', 'window.', 'localStorage', 'navigator.', 'requestAnimationFrame', 'getElementById', 'CSS']) {
        assert.equal(code.includes(bad), false, `${relative(ROOT, f)} references ${bad}`);
      }
      assert.equal(/from\s+['"][^'"]*screens\//.test(src), false, 'no import from js/screens/');
      assert.equal(/\bMath\s*\.\s*random\b/.test(code), false, 'seed everything through js/rng.js');
    });
  }

  test('data/job.js is data: no DOM, no random, no import from js/', () => {
    const src = readFileSync(join(ROOT, 'site', 'data', 'job.js'), 'utf8');
    const code = stripCommentsAndStrings(src);
    for (const bad of ['document.', 'window.', 'localStorage']) assert.equal(code.includes(bad), false, `references ${bad}`);
    assert.equal(/\bMath\s*\.\s*random\b/.test(code), false);
    assert.equal(/^\s*import\s/m.test(src), false, 'data/job.js imports nothing — every later ticket depends on that');
  });

  test('econ.js is pure: the same arguments give the same answer, and nothing is mutated', () => {
    const t = Object.freeze({ tier: 2, tokens: 2, bucket: 1, overdueDays: 2, tell: Object.freeze({ triggered: 1 }) });
    const a = carryFor(t, 85, 3, 1, 1);
    const b = carryFor(t, 85, 3, 1, 1);
    assert.equal(a, b);
    const st = Object.freeze({ loose: 120, chain: 4, L: 38, call: 85, q: 0.7 });
    assert.equal(pushMinusBag(st), pushMinusBag(st));
    assert.equal(breakevenQ(st), breakevenQ(st));
    const order = Object.freeze({ targets: Object.freeze([Object.freeze({ tier: 1, call: 85, rung: 0 }), Object.freeze({ tier: 1, call: 85, rung: 4 })]), decisions: Object.freeze(['push']) });
    assert.equal(regretLine(order).optimal, regretLine(order).optimal);
  });

  test('round() is half-up and survives binary representation (0.9395 → 0.940)', () => {
    assert.equal(round(0.9395, 3), 0.94);
    assert.equal(round(0.7455, 3), 0.746);
    assert.equal(round(0.5615, 3), 0.562);
    assert.equal(round(0.9885, 3), 0.989);
    assert.equal(round(2.5), 3);
    assert.equal(round(-2.5), -3);
    assert.equal(round(117.9), 118);
    assert.equal(r3(1 / 3), 0.333);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   §8 — THE GETAWAY'S TWO EXITS, MEASURED ON THE SHIPPED MACHINE.
        (verify round 3, exploit-hunt BLOCKER; G1's key table, §3.8 #6, G12 VR3-GETAWAY)

   The defect this section exists for: WALK at the getaway was STRICTLY DOMINATED by a branch that
   could not lose. The vault's call row contains the 50 rung — `call.canCall` grants it at every rank
   and its `P` is 0 — so `missFor` returns 0 on it and a deliberate miss on the vault costs exactly
   nothing; and answering the vault, INCLUDING by missing it, made `targetsLeft === 0`, which paid
   the +10 % completion on the whole bagged pile. WALK banked the same LOOSE at the same full rate
   and was refused it. `CRACK@50 → miss` therefore banked ×1.10 of WALK on 200 of 200 getaways.

   WHY THE ARMS BELOW ARE EQUALITIES AND NOT MEANS. The repair (`econ.exitBonusRate`) makes the two
   exits the SAME NUMBER, not two numbers that are close on a corpus: the crack line's pile is the
   walk line's pile (the miss moves LOOSE by 0) and both apply `round(pile · (1 + COMPLETION))`. So
   parity is an identity, and an identity is asserted per getaway, integer against integer. The
   published decimals in `PUBLISHED.getawayParity` are the corpus MEAN of the same measurement and
   are asserted with a band, because the mean — unlike the identity — moves with whatever the board
   composer deals. The signs and the counts are the claim; the decimals are this corpus.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

import * as state from '../site/js/job/state.js';
import { MAKES } from '../site/js/job/crew.js';
import { exitBonusRate, walkOrder, COMMIT_BONUS } from '../site/js/job/econ.js';
import { fresh } from '../site/js/store.js';
import { rngFrom } from '../site/js/rng.js';
import { applyOutcome, DAY_MS } from '../site/js/schedule.js';
import { todayISO, addDays } from '../site/js/days.js';
import { cards as ALL_CARDS, byId as JOB_CARD_BY_ID } from '../site/data/cards.js';
import { isBonus } from '../site/data/source-manifest.js';

const GW_BANK = ALL_CARDS.filter((c) => !isBonus(c.id));
const GW_NOW = new Date(2026, 8, 16, 18, 0).getTime();
const GW_TODAY = todayISO(new Date(GW_NOW));
const GW_CLEAN = Object.freeze({ cleared: true, firstTry: true, hints: 0, attempt: 1, clean: true });
const GW_MISS = Object.freeze({ cleared: false, solutionShown: true, reason: 'third-wrong', attempt: 3, hints: 0 });

/** The same seeded corpus `tests/job-exploit.test.mjs` drives — real Leitner records AND real history. */
function gwSave(i) {
  const rng = rngFrom('j9-exploit', i);
  const s = fresh(GW_NOW - (4 + rng.int(0, 20)) * DAY_MS);
  s.profileId = `j9-${i}`;
  s.settings.testDate = addDays(GW_TODAY, 4 + rng.int(0, 12));
  const n = 28 + rng.int(0, 24);
  for (let k = 0; k < n; k++) {
    const c = GW_BANK[rng.int(0, GW_BANK.length - 1)];
    let rec = null;
    for (let r = 0; r < 3; r++) rec = applyOutcome(s, c.id, rng.chance(0.75) ? 'clean' : 'wrong', { now: GW_NOW - (30 - r * 4) * DAY_MS });
    if (!rec) continue;
    rec.cleared = true; rec.rarity = 'gold';
    rec.due = GW_NOW + (rng.chance(0.65) ? -rng.float(0, 9) : rng.float(0.2, 12)) * DAY_MS;
    rec.history = Array.from({ length: 10 }, (_, h) => ({ at: GW_NOW - (20 - h) * DAY_MS, ok: rng.chance(0.75), attempt: rng.chance(0.75) ? 1 : 2, hints: 0, ms: 9000 }));
  }
  for (const k of MAKES) {
    if (!rng.chance(0.75)) continue;
    s.skills[k] = { m: rng.int(10, 95), n: rng.int(1, 9), lastAt: GW_NOW - rng.int(1, 20) * DAY_MS, lastDueCorrectAt: rng.chance(0.4) ? GW_NOW - DAY_MS : null };
  }
  return s;
}

/** `screens/card.js`'s one write the game layer reads back — see job-exploit.test.mjs's own copy. */
function gwHistory(save, item, result, at) {
  if (!item || item.kind === 'variant') return;
  const rec = state.unguard(save)?.cards?.[item.id];
  if (!rec) return;
  if (!Array.isArray(rec.history)) rec.history = [];
  rec.history.push({ at, ok: result?.cleared === true, attempt: Math.max(1, Number(result?.attempt) || 1), hints: Math.max(0, Number(result?.hints) || 0), ms: 9000 });
}

/** Drive a fresh job to its getaway beat, clearing every target at a 70 call. `null` if it never gets there. */
function gwToGetaway(save, shape) {
  let t = GW_NOW; const step = (ms) => (t += ms);
  state.startJob(save, { today: GW_TODAY, now: t, shape });
  state.beginTargets(save, { now: step(6000) });
  for (let i = 0; i < 600; i++) {
    const g = state.stateOf(save);
    if (!g || g.outcome != null) return null;
    if (g.phase === 'getaway') return t;
    if (g.phase === 'envelope') { if (g.stakes) state.lockCall(save, 70, { now: step(5000) }); else state.beginAnswer(save, { now: step(1000) }); continue; }
    if (g.phase === 'answer') {
      const it = state.currentItem(save); const at = step(40000);
      gwHistory(save, it, GW_CLEAN, at);
      state.applyTarget(save, GW_CLEAN, { now: at, cards: JOB_CARD_BY_ID });
      continue;
    }
    if (g.phase === 'payout' || g.phase === 'bagpush') { state.push(save, { now: step(9000) }); continue; }
    if (g.phase === 'brief') { state.brief(save, {}, { now: step(20000) }); continue; }
    return null;
  }
  return null;
}
const gwLastLog = (s) => { const L = state.unguard(s)?.game?.log; return Array.isArray(L) && L.length ? L[L.length - 1] : null; };

/**
 * Finish from the getaway by CRACKing at `callId` and answering every remaining beat with `res`.
 * The loop re-enters the getaway because the STUDY layer re-queues a missed card, which is exactly
 * what a student deliberately throwing the vault would meet; it is driven to a terminal debrief.
 */
function gwCrack(save, t, callId, res) {
  let tt = t; const step = (ms) => (tt += ms);
  for (let i = 0; i < 400; i++) {
    const g = state.stateOf(save);
    if (!g || g.outcome != null) break;
    if (g.phase === 'getaway') { state.crack(save, { now: step(25000) }); continue; }
    if (g.phase === 'envelope') { if (g.stakes) state.lockCall(save, callId, { now: step(5000) }); else state.beginAnswer(save, { now: step(1000) }); continue; }
    if (g.phase === 'answer') {
      const it = state.currentItem(save); const at = step(40000);
      gwHistory(save, it, res, at);
      state.applyTarget(save, res, { now: at, cards: JOB_CARD_BY_ID });
      continue;
    }
    if (g.phase === 'payout' || g.phase === 'bagpush') { state.push(save, { now: step(9000) }); continue; }
    if (g.phase === 'brief') { state.brief(save, {}, { now: step(20000) }); continue; }
    break;
  }
  return gwLastLog(save)?.bagged;
}

/** The whole sweep, once — every arm below reads this. */
const GW_BRANCHES = [['50-miss', 50, GW_MISS], ['50-clear', 50, GW_CLEAN], ['70-miss', 70, GW_MISS], ['70-clear', 70, GW_CLEAN], ['85-miss', 85, GW_MISS], ['85-clear', 85, GW_CLEAN]];
const GW_SHAPES = ['RUN', 'JOB', 'JOB12', 'VAULT'];
const GW_SWEEP = (() => {
  const rows = [];
  for (const shape of GW_SHAPES) {
    for (let i = 0; i < JOB.PUBLISHED.getawayParity.seedsPerShape; i++) {
      const base = gwSave(i);
      let at = null;
      try { at = gwToGetaway(base, shape); } catch { /* the board refused this save tonight */ }
      if (at == null) continue;
      const w = structuredClone(base);
      let debrief = null;
      try { debrief = state.walk(w, { now: at + 25000 }); } catch { continue; }
      /* `baseBagged` is the pile BEFORE the bonus — which is exactly what the pre-repair rule banked
         for a WALKED job, since it paid bonusRate 0. So one run measures both columns. */
      const before = debrief?.baseBagged; const after = debrief?.finalBagged;
      if (!Number.isFinite(before) || !Number.isFinite(after) || before <= 0) continue;
      const branches = {};
      for (const [k, callId, res] of GW_BRANCHES) {
        const b = structuredClone(base);
        let v = null;
        try { v = gwCrack(b, at, callId, res); } catch { v = null; }
        if (Number.isFinite(v)) branches[k] = v;
      }
      rows.push({ shape, seed: i, before, after, bonusRate: debrief.bonusRate, outcome: debrief.outcome, branches });
    }
  }
  return rows;
})();
const gwMean = (key, base) => {
  let c = 0; let w = 0;
  for (const r of GW_SWEEP) { if (!Number.isFinite(r.branches[key])) continue; c += r.branches[key]; w += r[base]; }
  return w > 0 ? c / w : NaN;
};

describe('J1 §8 · the getaway: WALK and CRACK are priced at parity (VR3-GETAWAY)', () => {
  test('the sweep reached a getaway on every seed of every shape, and every WALK is a WALKED debrief', () => {
    assert.ok(GW_SWEEP.length >= 100,
      `only ${GW_SWEEP.length} getaways reached; this arm measures the getaway and cannot do it from nothing`);
    assert.equal(GW_SWEEP.length, JOB.PUBLISHED.getawayParity.getaways,
      `PUBLISHED.getawayParity.getaways is ${JOB.PUBLISHED.getawayParity.getaways} and this corpus now reaches `
      + `${GW_SWEEP.length}. The board composer deals the queue, so a composer change moves this count — `
      + 're-measure and re-publish the table rather than loosening the arm.');
    for (const r of GW_SWEEP) assert.equal(r.outcome, state.OUTCOMES.WALKED, `${r.shape}/${r.seed} did not end on WALKED`);
  });

  test('PARITY IS AN IDENTITY: CRACK@50 then a deliberate MISS banks EXACTLY what WALK banks', () => {
    /* Not "within a tolerance" and not "on average": the miss at the free rung moves LOOSE by 0, so
       the two exits reach `endJob` with the same pile and now take the same bonus. Integer equality,
       on every getaway. This is the arm that would have caught the defect. */
    for (const r of GW_SWEEP) {
      assert.equal(r.branches['50-miss'], r.after,
        `${r.shape}/${r.seed}: CRACK@50 + deliberate miss banked ${r.branches['50-miss']} against a WALK's `
        + `${r.after}. A getaway branch that cannot lose may not out-bank the other exit by one loot.`);
      assert.equal(r.bonusRate, COMPLETION,
        `${r.shape}/${r.seed}: a WALK at the getaway must take the completion — its one unanswered target `
        + 'is the vault, and CRACK-then-miss reaches the same pile for nothing (econ.exitBonusRate).');
    }
  });

  test('the DEFECT is reproduced on the same 200 getaways: the old rule paid ×1.10 for a throw', () => {
    let ahead = 0; let worst = Infinity;
    for (const r of GW_SWEEP) {
      const ratio = r.branches['50-miss'] / r.before;
      if (ratio > 1 + 1e-9) ahead++;
      worst = Math.min(worst, ratio);
      assert.ok(ratio > 1, `${r.shape}/${r.seed}: the pre-repair ratio was ${ratio}, so the arbitrage was not universal`);
      /* `round(pile·1.1)` can sit half a loot above `pile·1.1`, so the bound carries that rounding */
      assert.ok(ratio <= 1 + COMPLETION + 0.5 / r.before + 1e-9,
        `${r.shape}/${r.seed}: ratio ${ratio} exceeds 1 + COMPLETION by more than the rounding of one loot`);
    }
    assert.equal(ahead, GW_SWEEP.length, 'the old rule paid the throw on every getaway, which is why it was a BLOCKER');
    assert.equal(ahead, JOB.PUBLISHED.getawayParity.before.ahead);
    assert.ok(worst >= JOB.PUBLISHED.getawayParity.before.worst - 0.01,
      `worst pre-repair branch ${worst.toFixed(4)} against a published ${JOB.PUBLISHED.getawayParity.before.worst}`);
    assert.equal(round(gwMean('50-miss', 'before'), 2), 1.10, 'the corpus mean of the old ratio is 1 + COMPLETION to 2 dp');
  });

  test('and it is GONE: nothing at the getaway out-banks WALK without clearing the vault', () => {
    let ahead = 0;
    for (const r of GW_SWEEP) if (r.branches['50-miss'] > r.after) ahead++;
    assert.equal(ahead, JOB.PUBLISHED.getawayParity.after.ahead, 'CRACK-then-miss is ahead on none of them');
    assert.equal(round(gwMean('50-miss', 'after'), 4), JOB.PUBLISHED.getawayParity.after.all);
  });

  test('the getaway has TWO LIVE BRANCHES again: a staked crack can lose, a clear always wins', () => {
    const counts = {};
    for (const [k] of GW_BRANCHES) counts[k] = { ahead: 0, behind: 0, n: 0 };
    for (const r of GW_SWEEP) {
      for (const [k] of GW_BRANCHES) {
        const v = r.branches[k];
        if (!Number.isFinite(v)) continue;
        counts[k].n++;
        if (v > r.after) counts[k].ahead++; else if (v < r.after) counts[k].behind++;
      }
    }
    for (const [k, pub] of Object.entries(JOB.PUBLISHED.getawayParity.branches)) {
      const got = counts[k];
      assert.equal(got.n, GW_SWEEP.length, `branch ${k} did not finish on every getaway`);
      assert.equal(got.ahead, pub.ahead, `branch ${k}: ahead of WALK on ${got.ahead}, published ${pub.ahead}`);
      assert.equal(got.behind, pub.behind, `branch ${k}: behind WALK on ${got.behind}, published ${pub.behind}`);
      const mean = gwMean(k, 'after');
      assert.ok(Math.abs(mean - pub.mean) <= 0.05,
        `branch ${k} mean ${mean.toFixed(4)} against a published ${pub.mean} — re-measure and re-publish`);
    }
    /* the two halves the document sells at G1's key table */
    assert.ok(JOB.PUBLISHED.getawayParity.branches['70-miss'].mean < 1);
    assert.ok(JOB.PUBLISHED.getawayParity.branches['85-miss'].mean < JOB.PUBLISHED.getawayParity.branches['70-miss'].mean,
      'the bolder call loses more when it misses, or the ladder is not a ladder');
    assert.ok(JOB.PUBLISHED.getawayParity.branches['85-clear'].mean > JOB.PUBLISHED.getawayParity.branches['70-clear'].mean);
  });

  test('§3.8 #6: the crack threshold against walking is P/(W + P), and it is 0 at the free rung', () => {
    const bare = { tier: 4 };
    const DEEP = 1e6;                                   // a pile the premium cannot be covered out of
    const qStarAt = (call, pile) => {
      const gain = carryFor(bare, call, 0, 0, 0, pile);
      const loss = Math.abs(missFor(bare, call, 0, pile, 0));
      return gain + loss > 0 ? loss / (gain + loss) : 0;
    };
    for (const lvl of JOB.CALL_LEVELS) {
      const closed = lvl.P / (lvl.W + lvl.P);
      assert.equal(round(qStarAt(lvl.id, DEEP), 4), round(closed, 4),
        `call ${lvl.id}: the uncovered crack threshold must BE P/(W+P)`);
      assert.equal(round(qStarAt(lvl.id, DEEP), 4), round(JOB.PUBLISHED.getawayParity.crackQStarBare[lvl.id], 4));
    }
    /* the COVER moves it, and only downwards — a premium the pile cannot back is a premium not paid,
       so a shallow pile makes the bold call cheaper to attempt, never dearer (G2's `min(LOOSE, ·)`) */
    for (const lvl of JOB.CALL_LEVELS) {
      assert.ok(qStarAt(lvl.id, 300) <= qStarAt(lvl.id, DEEP) + 1e-12,
        `call ${lvl.id}: the cover raised the crack threshold, which inverts the sign of G2's cap`);
    }
    assert.equal(round(qStarAt(95, 300), 4), JOB.PUBLISHED.getawayParity.crackQStarCovered300[95],
      'the published covered value for the top rung');
    assert.equal(JOB.PUBLISHED.getawayParity.crackQStarBare[50], 0,
      'the free rung is free: that is why facing the vault is weakly dominant and the live decision is the rung');
    /* and the document may not re-publish the threshold it withdrew */
    assert.notEqual(round(3 / 7, 3), round(JOB.PUBLISHED.getawayParity.crackQStarBare[70], 3));
  });
});

describe('J1 §8b · exitBonusRate owns the rule, and state.js asks it rather than re-spelling it', () => {
  test('the four outcomes of the rule', () => {
    assert.equal(exitBonusRate({ complete: true }), COMPLETION, 'every drafted target answered');
    assert.equal(exitBonusRate({ getawayWalk: true }), COMPLETION, 'a WALK at the getaway is priced at parity');
    assert.equal(exitBonusRate({ complete: false, getawayWalk: false }), 0, 'a mid-job QUIT leaves targets never faced');
    assert.equal(exitBonusRate({ honoured: true }), COMMIT_BONUS, 'a bound declaration takes the commit bonus');
    assert.equal(exitBonusRate({ honoured: true, complete: true, getawayWalk: true }), COMMIT_BONUS,
      'and forfeits the completion, G3.9 — the two never compound at the exit');
    assert.equal(exitBonusRate({ complete: true, stakes: false }), 0, 'CALL IT switches the stakes off and forfeits both');
    assert.equal(exitBonusRate({ getawayWalk: true, stakes: false }), 0);
    assert.equal(exitBonusRate(), 0, 'and the empty call is the no-bonus exit, not a bonus');
  });

  test('COMPLETION and COMMIT_BONUS are the only rates it can return', () => {
    const seen = new Set();
    for (const honoured of [true, false]) for (const complete of [true, false]) for (const stakes of [true, false]) for (const getawayWalk of [true, false]) {
      seen.add(exitBonusRate({ honoured, complete, stakes, getawayWalk }));
    }
    assert.deepEqual([...seen].sort((a, b) => a - b), [0, COMMIT_BONUS, COMPLETION].sort((a, b) => a - b));
  });

  test('state.js endJob asks econ for the rate — the rule is not spelled in two places', () => {
    const src = readFileSync(join(ROOT, 'site', 'js', 'job', 'state.js'), 'utf8');
    const code = stripCommentsAndStrings(src);
    assert.match(code, /econ\s*\.\s*exitBonusRate\s*\(/,
      '`state.endJob` must take the end-of-job bonus rate from `econ.exitBonusRate`. A second copy of '
      + 'the rule is how the getaway arbitrage survived a round of review: the model in econ.js said '
      + 'one thing and the exit in state.js did another.');
    assert.ok(!/honoured\s*\?\s*COMMIT_BONUS\s*:/.test(code),
      'the inline ternary that priced a getaway WALK at 0 is back in state.js (VR3-GETAWAY)');
  });

  test('econ’s own WALK model takes the same bonus — walkOrder was the published half of the defect', () => {
    const targets = [{ tier: 3, call: 70, rung: 0 }, { tier: 4, call: 85, rung: 0 }];
    const bare = walkOrder({ targets });
    const completing = walkOrder({ targets, completion: true });
    assert.ok(bare && completing);
    assert.ok(Math.abs(completing.value - bare.value * (1 + COMPLETION)) < 1e-9,
      'walkOrder must apply the completion it is handed — it used to document "no completion bonus, '
      + `because targets remain", which is the model half of the arbitrage (got ${completing.value})`);
    assert.deepEqual(completing.decisions, bare.decisions, 'a constant multiplier cannot move the argmax');
    assert.equal(walkOrder({ targets, commit: true }).value, bare.value, 'a walk is not an honoured declaration');
    assert.equal(walkOrder({ targets: [targets[0]] }), null, 'a one-target job has no getaway beat');
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   §9 — THE DOCUMENT'S COPIES OF THIS LANE'S PUBLISHED NUMERALS.
        (verify round 3, spec-fidelity: VR3-ROWS and VR3-VAULT)

   Two findings of the same shape, three sites each, both surviving a round of review: a numeral the
   code had already re-measured went on being printed, RETYPED, at sites far from the one the repair
   edited. §3.2 printed the re-measured worked rows while G8's J1 row, G12 #3 and the "left alone"
   list printed the pair they superseded; G1's budget table printed the re-measured VAULT wall clock
   while the paragraph under it, G10 #18 and G12 #40e printed the one that still carried a deleted
   25 s fixed-phase cell.
   A retyped numeral cannot be caught by a test that compares a constant to a constant, so this
   section derives every one of them from `data/job.js` and reads the DOCUMENT. The rule it enforces
   is the one the document already lives by: **a superseded numeral may be quoted, but only beside
   the one that replaced it** — which is what makes the history readable instead of merely wrong.
   Scope: this lane's numerals only. `tests/job-meta-constants.test.mjs` owns the doc lane's own
   lints and the Request to fold these two in beside them is in notes/repair-econ.md.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

const SPEC_MD = readFileSync(join(ROOT, 'COMPOSED-GAME.md'), 'utf8');
/** Paragraphs, not lines: this document hard-wraps its prose, so a claim spans several lines. */
const SPEC_PARAS = SPEC_MD.split(/\n[ \t]*\n/);
const MINUS = '−';                                   // the document's typographic minus
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
/** The `crew re-allocation` fixed-phase cell verify round 2 deleted as unreachable and double-charged
 *  (G1's fixed-phase table). It is gone from `FIXED_PHASES`, so the only trace of its size is the gap
 *  between the VAULT range the document published and the one `PUBLISHED.shapeTable` ships. */
const DELETED_CREW_CELL_S = 25;

describe('J1 §9 · COMPOSED-GAME.md prints THIS lane’s numerals, not the ones they superseded', () => {
  test('VR3-ROWS · the worked push/bag pair the document prints is the shipped one', () => {
    const [bag, push] = JOB.PUBLISHED.workedRows;
    const live = [`${MINUS}${Math.abs(bag.pushMinusBag)}`, push.pushMinusBag.toFixed(2)];
    assert.deepEqual(live, [`${MINUS}12`, '133.20'], 'the derived pair moved — re-derive this arm, do not retype it');

    /* the pair must appear, as a pair, at three sites or more: §3.2 itself, G8's J1 acceptance row,
       G12 #3 and the "left alone" list are the four this round repaired */
    const sites = SPEC_PARAS.filter((p) => p.includes(live[1]));
    assert.ok(sites.length >= 3,
      `only ${sites.length} paragraph(s) of COMPOSED-GAME.md print the shipped worked row ${live[1]}; `
      + 'G8 J1, G12 #3 and the "left alone" list each carry it and §3.2 derives it');

    /* and the pair it replaced may be quoted ONLY beside its replacement */
    /* `90.96` is the distinguishing numeral of the superseded pair. Its partner, the bare
       `−40`, is NOT a needle: the document uses that exact string for an `R_player` step, and a
       lint that cannot tell the two apart teaches people to ignore it. */
    for (const needle of ['90.96']) {
      for (const p of SPEC_PARAS) {
        if (!p.includes(needle)) continue;
        assert.ok(p.includes(live[0]) && p.includes(live[1]),
          `COMPOSED-GAME.md quotes the superseded worked row "${needle}" in a paragraph that does not `
          + `print the shipped pair (${live.join(', ')}). Verify round 1 re-measured these rows for the `
          + 'cover and three sites went on printing the old pair for two rounds — the quote is allowed, '
          + `alone it is not. Paragraph begins: ${p.slice(0, 120)}`);
      }
    }
  });

  test('VR3-ROWS · and the shipped pair is what pushMinusBag actually returns at those two states', () => {
    /* the numeral in the document is only worth linting if the constant it derives from is itself
       the machine's answer — this is the same pair `job-econ.test.mjs` §3 drives, re-asserted here
       so the lint above can never certify a constant that has drifted from the code */
    for (const row of JOB.PUBLISHED.workedRows) {
      /* `rhoBar: 1` is the row's own statement that the clear is CLEAN; it is not a field of a push
         state (`stateRho` reads `rungs`), so the state is built the way §3.2's own arm builds it */
      assert.equal(row.rhoBar, 1, 'the worked rows are stated at a clean clear');
      const st = { loose: row.S, chain: row.chain, L: row.L, call: row.call, q: row.q };
      assert.equal(round(pushMinusBag(st), 2), round(row.pushMinusBag, 2), `worked row at chain ${row.chain}`);
      assert.equal(pushOrBag(st), row.decision.toLowerCase());
    }
  });

  test('VR3-VAULT · the VAULT wall-clock range the document prints is PUBLISHED.shapeTable.VAULT.wallS', () => {
    const [lo, hi] = JOB.PUBLISHED.shapeTable.VAULT.wallS;
    assert.deepEqual([mmss(lo), mmss(hi)], ['17:26', '18:33'], 'the shipped row moved — re-derive, do not retype');

    /* Only a RANGE is linted, not every occurrence of the opening figure: the measured-boards table
       prints a 17:26 of its own, on a different basis, and it is not this row. */
    const RANGE = new RegExp(`${mmss(lo)}\\s*(?:\u2013|\u2014|-|\u2192|to)\\s*(\\d{1,2}:\\d{2})`, 'g');
    let ranges = 0; let live = 0;
    for (const p of SPEC_PARAS) {
      for (const m of p.matchAll(RANGE)) {
        ranges++;
        if (m[1] === mmss(hi)) { live++; continue; }
        /* a superseded range may be QUOTED, but only in a paragraph that also prints the shipped end */
        assert.ok(p.includes(mmss(hi)),
          `COMPOSED-GAME.md prints the VAULT range ${m[0]} where the shipped row is `
          + `${mmss(lo)}\u2013${mmss(hi)} (wallS ${lo} \u2192 ${hi}), and nothing in that paragraph `
          + `corrects it. Paragraph begins: ${p.slice(0, 120)}`);
      }
    }
    assert.ok(ranges >= 4, `only ${ranges} VAULT range(s) found in the document; G1's budget table, G10 #18, `
      + 'G12 #40e and G12 VR3-VAULT each carry one');
    assert.ok(live >= 3, `only ${live} of the ${ranges} VAULT ranges print the shipped upper end ${mmss(hi)}`);
    /* and the sentence that states the ceiling without a range still has to state the shipped one */
    for (const p of SPEC_PARAS) {
      if (!/\u2264 \*\*\d{1,2}:\d{2}\*\*/.test(p) || !/VAULT/.test(p)) continue;
      assert.ok(p.includes(mmss(hi)), `COMPOSED-GAME.md bounds the VAULT by a figure that is not ${mmss(hi)}`);
    }

    /* The superseded figure is exactly this row plus the `crew re-allocation` fixed-phase cell that
       verify round 2 deleted as unreachable and double-charged (G1's fixed-phase table; the cell is
       gone from `FIXED_PHASES`, so its size survives only as the gap between the two figures). It
       may be quoted where those seconds are explained, never as the range. */
    const stale = mmss(hi + DELETED_CREW_CELL_S);
    for (const p of SPEC_PARAS) {
      if (!p.includes(stale) && !p.includes(String(hi + DELETED_CREW_CELL_S))) continue;
      assert.ok(p.includes(mmss(hi)),
        `COMPOSED-GAME.md prints the superseded VAULT range ${stale} without the shipped ${mmss(hi)} `
        + `beside it. ${stale} is ${hi} + 25 s, the crew fixed-phase cell verify round 2 removed. `
        + `Paragraph begins: ${p.slice(0, 120)}`);
    }
  });

  test('VR3-VAULT · nothing under site/ or tests/ backs the superseded figure', () => {
    const [, hi] = JOB.PUBLISHED.shapeTable.VAULT.wallS;
    const stale = hi + DELETED_CREW_CELL_S;
    /* the seconds form needs boundaries: a 16-digit board digest in `job-board.test.mjs` contains
       the same four digits inside it, and a substring match would call that a wall clock */
    const needles = [new RegExp(mmss(stale)), new RegExp(`(?<![\\d.])${stale}(?![\\d.])`)];
    const files = [...listFiles(join(ROOT, 'site', 'js')), ...listFiles(join(ROOT, 'site', 'data')), ...listFiles(join(ROOT, 'tests'))];
    for (const f of files) {
      if (relative(ROOT, f) === 'tests/job-econ.test.mjs') continue;     // this arm assembles them
      const src = readFileSync(f, 'utf8');
      for (const re of needles) {
        assert.equal(re.test(src), false,
          `${relative(ROOT, f)} names ${re.source} — the superseded VAULT wall clock. Nothing in the `
          + 'tree produced it even when the document published it; the shipped pair is '
          + 'PUBLISHED.shapeTable.VAULT.wallS');
      }
    }
  });

  test('VR3-GETAWAY · the withdrawn q > 3/7 may be quoted only beside the thresholds that replaced it', () => {
    const needle = ['3', '/', '7'].join('');
    const seen = SPEC_PARAS.filter((p) => p.includes(`q > \`${needle}\``) || p.includes(`\`q > ${needle}\``) || p.includes(`q > ${needle}`));
    for (const p of seen) {
      assert.ok(/0\.300/.test(p),
        'COMPOSED-GAME.md states the withdrawn getaway threshold q > 3/7 without the shipped crack '
        + 'thresholds beside it. No (W, P) pair on the ladder produces 3/7; the shipped break-even is '
        + `P/(W + P) — see PUBLISHED.getawayParity.crackQStarBare. Paragraph begins: ${p.slice(0, 120)}`);
    }
  });
});
