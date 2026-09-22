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
  gainLFor, lossLFor,
  // helpers and re-exports
  round, r3, LOOT, LADDER, CHAIN, FEE, TELL, COMPLETION, COLD, MISS_RUNG, RUNG_BANDS,
} from '../site/js/job/econ.js';

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
    near(a, 0.9 * 300 + 0.8 * 70 * 1 * 1 * 1.8, 1e-9);
  });

  test('the two worked rows reproduce exactly: (−40, BAG) and (+90.96, PUSH)', () => {
    const [r1, r2] = P.workedRows;
    const s1 = { loose: r1.S, chain: r1.chain, L: r1.L, call: r1.call, q: r1.q };
    assert.equal(isDeepPile(s1), true, 'L·m·P = 140 < 300 → deep');
    near(pushMinusBag(s1), r1.pushMinusBag, 1e-9);
    assert.equal(pushOrBag(s1), 'bag');

    const s2 = { loose: r2.S, chain: r2.chain, L: r2.L, call: r2.call, q: r2.q };
    assert.equal(isDeepPile(s2), false, 'L·m·P = 308 > 300 → shallow');
    near(pushMinusBag(s2), r2.pushMinusBag, 1e-9);
    assert.equal(pushOrBag(s2), 'push');
    // the arithmetic the document writes out: 30 + 120.96 − 60
    near(0.8 * 70 * 1 * 1.8 * 1.2, 120.96, 1e-9);
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
    near(rising(0), 0.2857, 1e-4);
    near(rising(8), 0.2977, 1e-4);
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
    // the shallow branch is the same published form in both functions (the fee is kept there)
    const sh = { loose: 50, chain: 4, L: 70, call: 85 };
    assert.equal(isDeepPile(sh), false);
    near(breakevenQExact(sh), shallowQStar(sh), 1e-12);
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
    const gain = carryFor(t, call, st.chain ?? 0, rungs, crew);        // the clear branch, as paid
    const bagged = carryFor(t, call, chainAfterBag(), rungs, crew);    // …after the bag's chain reset
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
          // carryFor rounds at the end, so compare against the UNROUNDED product it rounds
          near(gainLFor({ target: t }) * 1 * m * W, carryFor(t, call, chain, null, 0), 0.5,
            `gain L: ${JSON.stringify(t)} c${chain} ${call}`);
          near(lossLFor({ target: t }) * m * pen, Math.abs(missFor(t, call, chain, 1e9, 0)), 0.5,
            `loss L: ${JSON.stringify(t)} c${chain} ${call}`);
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
    near(shallow[0], 0.9, 1e-9, 'c = 0 is 0.9 regardless of L');
    assert.ok(shallow.at(-1) < 0.2, 'and a chain of 8 takes it under 0.2');

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
    const noFee = (c) => {
      const m = chainMult(c); const { W, P: pen } = carryOf(85);
      const D = 18 * m * pen;
      return D / (18 * 1 * W * (m - 1) + D);
    };
    assert.ok(falls(CH.map(noFee)), 'without the fee the deep branch falls, as the table does');
    assert.ok(rises(CH.map((c) => breakevenQ(st(c)))), 'with it, the number on screen rises');
    assert.ok(breakevenQ(st(8)) > breakevenQ(st(0)));
    near(breakevenQ(st(0)), noFee(0) - (FEE * 200) / (18 * chainMult(0) * carryOf(85).P), 1e-12,
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
    /** clear every target at ρ̄ = 1, never bag: the state a job actually walks */
    const walk = (tiers, call) => {
      let S = 0; let chain = 0;
      const qs = [];
      for (const tier of tiers) {
        const target = { tier };
        qs.push(breakevenQ({ target, loose: S, chain, call }));
        S += carryFor(target, call, chain, 1, 0);
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
    // the peak is in the MIDDLE of the job, not at its first priced beat — there is no falling curve
    const peak = cheap.indexOf(Math.max(...cheap));
    assert.equal(peak, 4, `the printed q* peaks at beat 5 of 8: ${cheap.map((v) => v.toFixed(3))}`);
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
        S += carryFor({ tier }, call, chain, 1, 0);
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
   5b. G3.1's carry EV AT A STATE — and the dominance hole the published table hides
       (round-1 critic finding 4)

   G3.1 publishes `EV = q·W − (1−q)·P` with an argmax column, in units of `L·ρ·m·scope·wing`.
   That formula has no `min(LOOSE, ·)` in it, so the table is the ladder a player faces only on
   a pile deep enough to pay the loss. G2's miss branch IS capped by LOOSE, and BAG empties
   LOOSE, so after a bag the miss term is 0 for every call and the top rung is weakly dominant.

   This section is not a claim that the table is wrong. It pins (a) that the table reproduces
   under its own condition, and (b) the exact shape of the hole, so nothing can re-discover it
   as a surprise and nothing can quietly start treating the table as unconditional. Closing the
   hole means changing G2's published cap or G2's fee — a spec decision, recorded in
   notes/econ-fix.md, not something this file may do on its own.
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

  test('KNOWN HOLE, pinned: at LOOSE = 0 every call’s miss costs 0 and the top rung is weakly dominant', () => {
    // G2: `miss: Δloose = −min(LOOSE, …)`. BAG sets LOOSE to 0 (G2, chainAfterBag). So:
    for (const call of CALLS) {
      for (const chain of [0, 4, 8]) {
        assert.equal(missFor({ tier: 4 }, call, chain, 0), 0, `a miss at LOOSE 0 costs nothing (call ${call})`);
        assert.equal(settle({ tier: 4, call, rung: MISS_RUNG }, chain, 0).delta, 0);
      }
    }
    // …so the EV-max rung at LOOSE = 0 is the highest one on offer, at EVERY q, and it does not
    // depend on q at all. This is the whole of the bag-every-beat exploit, in two assertions.
    for (const q of [0.05, 0.3, 0.5, 0.55, 0.7, 0.9, 0.99]) {
      assert.equal(evMaxCallAt({ loose: 0, chain: 0, L: 6, q }).call, 95,
        `LOOSE 0 makes the top rung dominant at q = ${q} — G3.1's argmax column does not apply here`);
      // and with the 95 rung locked (Called 1–2, RANKS), the same argument names 85
      assert.equal(evMaxCallAt({ loose: 0, chain: 0, L: 6, q }, JOB.RANKS[0].calls).call, 85);
    }
    // the hole is exactly the cap: restore a pile that can pay and the published argmax returns
    assert.equal(evMaxCallAt({ loose: 1e9, chain: 0, L: 6, q: 0.5 }).call, 50);
    assert.equal(evMaxCallAt({ loose: 0, chain: 0, L: 6, q: 0.5 }).call, 95);
  });

  test('the rank ladder is the only published brake on it, and it is a rating brake, not an EV one', () => {
    // 95 needs Called 3 (RANKS), and systematic over-calling drives the rating to 0 (G3.1 sanity),
    // so bag-every-beat + 95 revokes its own top rung. 85 is available at rank 1 and is not braked.
    assert.deepEqual(JOB.RANKS[0].calls, [50, 70, 85]);
    assert.deepEqual(JOB.RANKS[2].calls, [50, 70, 85, 95]);
    assert.equal(JOB.CALL_LEVELS.find((c) => c.id === 95).minRank, 3);
    assert.ok(evMaxCallAt({ loose: 0, chain: 0, L: 6, q: 0.5 }, JOB.RANKS[0].calls).call
      > evMaxCallAt({ loose: 1e9, chain: 0, L: 6, q: 0.5 }, JOB.RANKS[0].calls).call,
      'at Called 1 the hole still names a bolder rung than the published table does');
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
    assert.equal(resolved, round(18 * 1.8), 'the resolved payout is the product without the tell');
    assert.equal(live, round(18 * 1.8 * TELL), 'and the live one is that product times the tell');
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
  test('the clear branch is round(L · ρ_eff · m_chain · W · scope · wing · cold · tell · ×2)', () => {
    const t = { tier: 2, scopeFlags: { isReview: true }, bucket: 2, overdueDays: 1, tell: { triggered: 1 }, tokens: 2, x2: true };
    const expected = round(18 * 0.70 * 1.4 * 1.8 * 1.25 * 1.5 * 1.25 * 1.25 * 2);
    assert.equal(carryFor(t, 85, 2, 1, 0), expected);
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
    assert.match(r.line, /^you bagged at chain 1; the threshold said push \(q\* 0\.\d\d, your q̂ 0\.80\)\. cost \d+\.$/);
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
    assert.equal(p.board + p.guard + p.brief * 2 + p.getaway + p.debrief + p.crew, 160);
    /* G1 publishes RUN full-use as a TOTAL only (notes/J1.md open issue 1). Integration filled the
       column in from `tests/job-split.test.mjs`'s own derivation (notes/J8.md Request 3), so the
       data file now carries it — and it must still sum to G1's published total, which is the half
       of the cell G1 actually owns. */
    const rf = JOB.FIXED_PHASES.RUN.full.phases;
    assert.ok(rf, 'data/job.js must publish RUN.full.phases');
    assert.equal(rf.board + rf.guard + rf.brief * JOB.SHAPES.RUN.briefs + rf.getaway + rf.debrief + rf.crew,
      JOB.FIXED_PHASES.RUN.full.total, 'the filled-in RUN full column must sum to G1\'s 130 s');
  });

  test('the decision count is 24 mandatory / 35 full on the JOB-10 shape, and ≥ 2 per graded item', () => {
    const d = decisionCount('JOB');
    assert.equal(d.mandatory, P.decisionCount.JOB.mandatory);
    assert.equal(d.full, P.decisionCount.JOB.full);
    // 1 DRAFT + 1 PRESS + 10 CALL + 9 BAG/PUSH + 2 briefs + 1 getaway
    assert.equal(d.mandatory, 1 + 1 + 10 + 9 + 2 + 1);
    assert.ok(d.perItem.default >= JOB.SPLIT.densityMinDefault, 'G9 #1: ≥ 2 decisions per graded item');
    assert.ok(d.perItem.full >= JOB.SPLIT.densityMinFull, 'G9 #1: ≥ 3 with the windows');
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
    assert.equal(fixedSeconds('VAULT', 'full'), 232);
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
    // the 4×2 matrix flips shape by shape — STEADY on the RUN, HELD on everything longer
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
    assert.equal(JOB.COPY.clear({ loose: 40, chain: 4, credit: 6.4, w: 0.96 }), '+40 loose · chain 4 · rating +6.4 ×0.96');
    assert.equal(JOB.COPY.ladder({ attempt: 2, crew: 'STEADY', rho: '0.70', loose: 19 }), 'attempt 2 · crew STEADY forgives one · ρ 0.70 · +19 loose');
    assert.equal(JOB.COPY.miss({ make: 'FAC2', tell: 'dropped-gcf', loose: 19, chain: 0 }), 'FAC2 · tell: dropped-gcf · −19 loose · chain 0');
    assert.equal(JOB.COPY.bag({ bagged: 118, fee: 13, chainBefore: 4 }), 'bagged 118 · fee 13 · chain 4 → 0');
    assert.equal(JOB.COPY.bagPrompt({ amount: 118, fee: 13, chainBefore: 4 }), 'bag 118 (fee 13 · chain 4 → 0)');
    assert.equal(JOB.COPY.sealed({ tag: 'dropped-gcf' }), 'dropped-gcf sealed · tell 1.00');
    assert.equal(JOB.COPY.quiet({ readiness: 89, due: 0 }), 'Board quiet · Readiness 89 · 0 due');
    assert.equal(JOB.COPY.callIt({ left: 4 }), 'stakes off · 4 targets left · hints on');
    assert.equal(JOB.COPY.crewIdle({ make: 'VOC' }), 'VOC crew idle — this target is its own due review');
    assert.equal(JOB.COPY.regret2({ envelope: 6, called: 85, evMax: 70, cost: 0.3 }), 'envelope 6: you called 85, EV-max was 70. cost 0.3 rating.');
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
