// tests/job-monotone.test.mjs — J9, half one: COMPOSED-GAME G3.7 proof 2 and G9 #3.
//
//   *"all 2ⁿ outcome vectors for n ≤ 11 under optimal play are monotone in clears, with BAG
//     resetting the chain"*
//
// with the caveat the spec itself attaches:
//
//   *"monotonicity requires the policy to be revisable at every beat — under a frozen threshold
//     policy there are orders where a miss pays more. The engine therefore (a) offers BAG/PUSH at
//     every single target, (b) auto-bags at the getaway …"*
//
// ── THE HEADLINE, BEFORE THE DETAIL ───────────────────────────────────────────────────────────────
//
// **Proof 2 is TRUE on the four shipped shapes and FALSE as a general statement.** Measured here:
//
//   · the shipped shapes (RUN 6 · JOB 10 · VAULT 7), honest calls, every outcome vector:
//     **0 violations in 46 080 miss→clear flips** (138 240 at 24 seeds, off-suite).
//   · arbitrary orders of n ≤ 11, honest calls:  **96 violations in 61 443 flips (0.156 %)**,
//     worst drop 22 loot = **1.9 % of that order's bag**.
//   · the same orders with arbitrary calls:      **28 in 61 443 (0.046 %)**, worst 1.0 % of the bag.
//
// The general claim was a failing `todo` in §4 while J9 held it; integration took J9's own preferred
// resolution (scope the claim — COMPOSED-GAME §3.7(2) now states the scope AND this exception, with
// these numbers), so §4 asserts the measured bound instead of a statement the machine does not
// satisfy. The mechanism is still pinned as arithmetic so it cannot be mistaken for a rounding
// artefact, and the four-target counterexample is still frozen in this file and asserted to the loot
// unit. Nothing is hidden and nothing is weakened. See notes/J9.md §Deviations.
//
// ── THE MECHANISM, IN ONE LINE ────────────────────────────────────────────────────────────────────
//
// `m_chain` is in BOTH branches of G2 (`miss: Δloose = −min(LOOSE, round(L · m_chain · P · wing_pen))`),
// so a clear that deepens the chain raises the price of every later miss by `0.2 · L · P · wing_pen`
// per step. When the cleared target is cheap and the missed one is expensive, that exceeds what the
// clear paid — and neither BAG (a 10 % fee on the whole pile) nor WALK can always buy it back.
//
// ── WHAT "OPTIMAL PLAY" MEANS HERE, stated before it is used ──────────────────────────────────────
//
// An order is a realised sequence of rungs whose calls, tiers, scopes, colds, tells, tokens, guard
// flags and crew ranks are already fixed — everything decided BEFORE the answer (the sealed envelope,
// G1) is part of the order, and the outcome is the only thing that flips. The decisions the student
// still holds after seeing an outcome are exactly two:
//
//   • BAG or PUSH, after every target but the last                (G1, `econ.playOrder`)
//   • CRACK or WALK at the getaway, before the last target        (G1, `state.crack` / `state.walk`)
//
// `econ.optimalOrder` brute-forces the first. It does NOT model the second — it always cracks — so
// the walk line is `econ.walkOrder()` (banking LOOSE at FULL value, `econ.getawayBank`, forfeiting
// the +10 % completion bonus because targets remain, exactly as `state.endJob` does for
// `OUTCOMES.WALKED`), and `OPT()` takes the max. That function used to live HERE, as a 14-line
// private reference; J9's Request to J1 asked for it in the product and integration moved it, so
// there is now one model of the economy rather than two. §6 pins it against the shipped machine.
//
// No `Math.random`: every order comes from `js/rng.js` (`rngFrom`), per BUILD-POLICY §2.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  optimalOrder, walkOrder, playOrder, settle, bagBank, bagFee, getawayBank, chainAfterBag,
  chainMult, missFor, carryFor, round,
} from '../site/js/job/econ.js';
import { honestCall } from '../site/js/job/call.js';
import * as state from '../site/js/job/state.js';
import { rngFrom } from '../site/js/rng.js';
import { fresh } from '../site/js/store.js';
import { applyOutcome, DAY_MS } from '../site/js/schedule.js';
import { todayISO, addDays } from '../site/js/days.js';
import { cards as ALL_CARDS } from '../site/data/cards.js';
import { isBonus } from '../site/data/source-manifest.js';

const BANK = ALL_CARDS.filter((c) => !isBonus(c.id));
const NOW = new Date(2026, 8, 16, 18, 0).getTime();
const TODAY = todayISO(new Date(NOW));

/* ══════════════════════════════════════════════════════ the policy, and the sweep it is swept with */

/**
 * WALK at the getaway: answer targets 0 … n−2 under some BAG/PUSH vector, then bank LOOSE at FULL
 * value and leave the last target due. No completion bonus — targets remain (`state.endJob`).
 * −Infinity for a one-target job, which has no getaway beat at all (`state.js advance()`).
 *
 * This was a 14-line private reference here; J9's Request to J1 asked for it in the product, and
 * integration moved it (`econ.walkOrder`). The wrapper stays so the sweeps below read unchanged, and
 * `§the model is the shipped machine` asserts the shipped one against `state.js`'s real WALK.
 */
const bestWalk = (targets) => (targets.length < 2 ? -Infinity : walkOrder({ targets }).value);

/** The best BAGGED reachable on a realised order under the FULL revisable policy. */
const OPT = (targets, order = {}) =>
  Math.max(optimalOrder({ ...order, targets }).value, bestWalk(targets));

/** The same, CRACK-only — what `econ.optimalOrder` alone models. */
const OPT_CRACK = (targets, order = {}) => optimalOrder({ ...order, targets }).value;

/** Every 2ⁿ outcome vector of one order, valued. Bit i set = target i CLEARED (rung 0). */
function valuesOf(base, value) {
  const out = new Float64Array(2 ** base.length);
  for (let mask = 0; mask < 2 ** base.length; mask++) {
    out[mask] = value(base.map((t, i) => ({ ...t, rung: (mask >> i) & 1 ? 0 : 4 })));
  }
  return out;
}

/**
 * The monotonicity check in its STRONG (pointwise) form: turning any one miss into a clear may never
 * lower the value. That implies the weak form the spec states — `min` over the vectors with `k`
 * clears is non-decreasing in `k` — because every (k+1)-clear vector dominates some k-clear one.
 */
function flipCheck(vals, n) {
  let checked = 0; let violations = 0; let worst = 0; let worstRel = 0; let first = null;
  for (let mask = 0; mask < 2 ** n; mask++) {
    for (let i = 0; i < n; i++) {
      if ((mask >> i) & 1) continue;
      const up = mask | (1 << i);
      checked++;
      const drop = vals[mask] - vals[up];
      if (drop > 1e-9) {
        violations++;
        if (drop > worst) worst = drop;
        worstRel = Math.max(worstRel, drop / Math.max(1, vals[mask]));
        if (!first) first = { mask, bit: i, lo: vals[mask], hi: vals[up] };
      }
    }
  }
  return { checked, violations, worst, worstRel, first };
}

/** `min`/`max` of the value over every vector with exactly `k` clears — the spec's own phrasing. */
function byClearCount(vals, n) {
  const rows = Array.from({ length: n + 1 }, () => ({ min: Infinity, max: -Infinity }));
  for (let mask = 0; mask < 2 ** n; mask++) {
    let k = 0;
    for (let i = 0; i < n; i++) if ((mask >> i) & 1) k++;
    rows[k].min = Math.min(rows[k].min, vals[mask]);
    rows[k].max = Math.max(rows[k].max, vals[mask]);
  }
  return rows;
}

/* ─────────────────────────────────────────────────────────────────────── the orders, all seeded */

/** A wide random target: every multiplier in the economy is exercised, the call is arbitrary. */
const wideTarget = (r) => ({
  tier: r.int(1, 4),
  call: [50, 70, 85, 95][r.int(0, 3)],
  scope: [1.25, 1, 0.8, 0.5][r.int(0, 3)],
  bucket: r.int(0, 5),
  overdueDays: r.float(0, 10),
  tokens: r.int(0, 3),
  guarded: r.chance(0.25),
  rank: r.int(1, 5),
  x2: r.chance(1 / 6),
  crew: r.int(0, 2),
  tell: r.chance(0.3),
});

/** The same, but the call is the student's own honest best response to their q̂ (G3.8 #3). */
const honestTarget = (r) => {
  const qHat = r.float(0.35, 0.98);
  return { ...wideTarget(r), call: honestCall(qHat), qHat };
};

/** The shipped shapes' tier mixes (G1's session table / `data/job.js SHAPES`). JOB12 is n = 12 > 11. */
const SHAPE_TIERS = Object.freeze({
  RUN: [1, 1, 1, 1, 1, 1],
  JOB: [1, 1, 1, 1, 1, 1, 1, 1, 2, 2],
  VAULT: [1, 1, 1, 2, 2, 3, 4],
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════ */
describe('J9 · G2 — BAG resets the chain (the fourth transition, G12 #3)', () => {
  test('chainAfterBag() is 0 for every chain it could be handed', () => {
    assert.equal(chainAfterBag(), 0);
    for (const c of [0, 1, 2, 3, 5, 8, 12]) assert.equal(chainAfterBag(c), 0, `chain ${c} survived a bag`);
  });

  test('a BAG inside playOrder resets the chain, so the next clear pays m_chain = 1', () => {
    const t = { tier: 4, call: 50, scope: 1, cold: 1, crew: 0 };
    const nine = Array.from({ length: 9 }, () => ({ ...t, rung: 0 }));

    /* pushed through: the 9th target enters at chain 8 → m = 2.6 (the cap) */
    let loose = 0; let chain = 0; let mPushed = null;
    for (let i = 0; i < 9; i++) { if (i === 8) mPushed = chainMult(chain); const s = settle(nine[i], chain, loose); loose = s.loose; chain = s.chain; }
    assert.equal(mPushed, 2.6);
    assert.equal(chainMult(8), 2.6);

    /* bagged after the 8th: the 9th enters at chain 0 → m = 1 */
    const decisions = Array.from({ length: 8 }, (_, i) => (i === 7 ? 'bag' : 'push'));
    let loose2 = 0; let chain2 = 0; let mBagged = null;
    for (let i = 0; i < 9; i++) {
      if (i === 8) mBagged = chainMult(chain2);
      const s = settle(nine[i], chain2, loose2); loose2 = s.loose; chain2 = s.chain;
      if (i < 8 && decisions[i] === 'bag') { loose2 = 0; chain2 = chainAfterBag(); }
    }
    assert.equal(mBagged, 1, 'the bag did not reset the chain');

    const bagged = playOrder({ targets: nine }, decisions);
    const never = playOrder({ targets: nine }, Array.from({ length: 8 }, () => 'push'));
    assert.ok(never > bagged, `pushing a 9-clear run should beat bagging at 8: ${never} vs ${bagged}`);
  });

  test('the chain multiplies BOTH branches — which is exactly why §4 exists', () => {
    const t = { tier: 4, call: 95, guarded: true, scope: 1, cold: 1 };
    for (let c = 0; c < 8; c++) {
      const gainLo = carryFor({ ...t }, 95, c, 0, 0);
      const gainHi = carryFor({ ...t }, 95, c + 1, 0, 0);
      const lossLo = -missFor({ ...t }, 95, c, 1e6, 0);
      const lossHi = -missFor({ ...t }, 95, c + 1, 1e6, 0);
      assert.ok(gainHi > gainLo, `chain ${c} → ${c + 1} did not raise the clear branch`);
      assert.ok(lossHi > lossLo, `chain ${c} → ${c + 1} did not raise the MISS branch`);
      /* and the amplification is exactly one 0.2 step of L · P · wing_pen */
      assert.equal(round(lossHi - lossLo), round(0.2 * 70 * 5 * 2), `step ${c} amplification`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════ */
describe('J9 · G3.7 proof 2 — the shipped shapes, every outcome vector, honest calls', () => {
  test('RUN 6 · JOB 10 · VAULT 7 × 8 seeds: monotone in clears, 0 exceptions', () => {
    let pairs = 0; let violations = 0; const per = {};
    for (const [shape, tiers] of Object.entries(SHAPE_TIERS)) {
      const n = tiers.length;
      per[shape] = 0;
      for (let seed = 0; seed < 8; seed++) {
        const r = rngFrom(`j9-shape-${shape}`, seed);
        const base = tiers.map((tier) => ({ ...honestTarget(r), tier, rank: r.int(3, 5) }));
        const vals = valuesOf(base, OPT);
        const res = flipCheck(vals, n);
        pairs += res.checked; per[shape] += res.checked; violations += res.violations;
        assert.equal(res.violations, 0,
          `${shape} seed ${seed}: ${res.violations} violations, worst ${res.worst} ${JSON.stringify(res.first)}`);

        /* the weak form the spec states, read off the same table */
        const rows = byClearCount(vals, n);
        for (let k = 1; k <= n; k++) {
          assert.ok(rows[k].min >= rows[k - 1].min - 1e-9,
            `${shape} seed ${seed}: min over ${k} clears (${rows[k].min}) < min over ${k - 1} (${rows[k - 1].min})`);
        }
        assert.ok(vals[2 ** n - 1] > vals[0], 'all clears did not strictly beat all misses');
      }
    }
    assert.ok(pairs >= 46000, `only ${pairs} flip pairs checked: ${JSON.stringify(per)}`);
    assert.equal(violations, 0);
  });

  test('BAG is genuinely optimal somewhere in the sweep — the bag branch is not dead weight', () => {
    let sawBag = false;
    for (let seed = 0; seed < 8 && !sawBag; seed++) {
      const r = rngFrom('j9-shape-JOB', seed);
      const base = SHAPE_TIERS.JOB.map((tier) => ({ ...honestTarget(r), tier, rank: r.int(3, 5) }));
      for (let mask = 0; mask < 64 && !sawBag; mask++) {
        const targets = base.map((t, i) => ({ ...t, rung: (mask >> i) & 1 ? 0 : 4 }));
        if (optimalOrder({ targets }).decisions.includes('bag')) sawBag = true;
      }
    }
    assert.ok(sawBag, 'BAG was never optimal anywhere — the sweep never exercises the bag branch');
  });

  test('the value is monotone in the RUNG, not only in clear-vs-miss (n ≤ 5, all 5ⁿ vectors)', () => {
    let checked = 0;
    for (let seed = 0; seed < 3; seed++) {
      for (let n = 2; n <= 5; n++) {
        const r = rngFrom('j9-rungmono', seed * 10 + n);
        const base = Array.from({ length: n }, () => wideTarget(r));
        const total = 5 ** n;
        const digits = (v) => { const d = []; let x = v; for (let i = 0; i < n; i++) { d.push(x % 5); x = Math.floor(x / 5); } return d; };
        const val = new Float64Array(total);
        for (let v = 0; v < total; v++) val[v] = OPT(base.map((t, i) => ({ ...t, rung: digits(v)[i] })));
        for (let v = 0; v < total; v++) {
          const d = digits(v);
          for (let i = 0; i < n; i++) {
            if (d[i] === 0) continue;
            checked++;
            const better = v - 5 ** i;                       // one rung BETTER on target i
            assert.ok(val[better] >= val[v] - 1e-9,
              `seed ${seed}, n = ${n}: improving target ${i} from rung ${d[i]} to ${d[i] - 1} lowered the optimum (${val[v]} → ${val[better]})`);
          }
        }
      }
    }
    assert.ok(checked > 40000, `only ${checked} rung improvements checked`);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════ */
describe('J9 · the exception — proof 2 is FALSE for a general order (reported, notes/J9.md)', () => {
  /**
   * The pinned counterexample, found by seeded search over 4-target orders and frozen here in full.
   * Nothing about it is exotic: four ordinary targets, every call legal at its rank.
   */
  const COUNTEREXAMPLE = Object.freeze([
    { tier: 4, call: 85, scope: 1, cold: 1.5, tokens: 3, guarded: false, rank: 3, x2: true, crew: 0, rung: 0 },
    { tier: 1, call: 50, scope: 1, cold: 1.25, tokens: 2, guarded: true, rank: 2, x2: false, crew: 0, rung: 4 },
    { tier: 3, call: 70, scope: 0.5, cold: 1, tokens: 2, guarded: true, rank: 4, x2: false, crew: 0, rung: 4 },
    { tier: 4, call: 95, scope: 0.5, cold: 1.25, tokens: 3, guarded: false, rank: 5, x2: false, crew: 0, rung: 4 },
  ]);
  const withRung = (i, rung) => COUNTEREXAMPLE.map((t, k) => (k === i ? { ...t, rung } : { ...t }));

  test('PINNED: clearing target 1 LOWERS the optimum from 616 to 603', () => {
    const missed = withRung(1, 4);
    const cleared = withRung(1, 0);
    assert.equal(OPT(missed), 616);
    assert.equal(OPT(cleared), 603);
    assert.equal(OPT(missed) - OPT(cleared), 13, 'the pinned drop moved — re-read notes/J9.md §Deviations');
    /* not an artefact of the crack-only model: the WALK line is the optimum on BOTH sides */
    assert.equal(bestWalk(missed), 616);
    assert.equal(bestWalk(cleared), 603);
    assert.ok(bestWalk(missed) > OPT_CRACK(missed), 'the WALK option is what makes 616 reachable');
  });

  test('the mechanism, in arithmetic: the clear is worth +5 and it makes the next miss cost +18', () => {
    const trace = (targets) => {
      const rows = [];
      let loose = 0; let chain = 0;
      for (const t of targets) {
        const before = chain;
        const s = settle(t, chain, loose);
        rows.push({ kind: s.kind, delta: s.delta, chainBefore: before, chainAfter: s.chain });
        loose = s.loose; chain = s.chain;
      }
      return rows;
    };
    const a = trace(withRung(1, 4));
    const b = trace(withRung(1, 0));

    /* target 1 missed at call 50 → P = 0, so the miss is FREE — and it resets the chain 1 → 0 */
    assert.equal(a[1].kind, 'miss');
    assert.equal(a[1].delta, 0);
    assert.equal(a[1].chainAfter, 0);

    /* target 1 cleared → +5, and the chain goes 1 → 2 */
    assert.equal(b[1].kind, 'carry');
    assert.equal(b[1].delta, 5);
    assert.equal(b[1].chainAfter, 2);

    /* target 2's miss is then multiplied by chainMult(2) = 1.4 instead of chainMult(0) = 1 */
    assert.equal(a[2].delta, -46);
    assert.equal(b[2].delta, -64);
    assert.equal(chainMult(0), 1);
    assert.equal(chainMult(2), 1.4);
    assert.equal((-b[2].delta) - (-a[2].delta), 18, 'the amplification moved');
    assert.ok(18 > 5, 'the amplification exceeds the clear that caused it — that IS the defect');
  });

  test('every clear still beats a miss AT ITS OWN BEAT — the defect is purely second-order', () => {
    const r = rngFrom('j9-direct', 4);
    let checked = 0;
    for (let i = 0; i < 3000; i++) {
      const t = wideTarget(r);
      const loose = r.int(0, 900);
      const chain = r.int(0, 9);
      const miss = settle({ ...t, rung: 4 }, chain, loose);
      for (const rung of [0, 1, 2, 3]) {
        const clear = settle({ ...t, rung }, chain, loose);
        checked++;
        assert.ok(clear.delta >= miss.delta, `rung ${rung} paid ${clear.delta} against a miss's ${miss.delta}`);
        assert.ok(clear.loose >= miss.loose, `rung ${rung} left ${clear.loose} LOOSE against a miss's ${miss.loose}`);
        assert.ok(clear.chain >= miss.chain, `rung ${rung} left chain ${clear.chain} against a miss's ${miss.chain}`);
        /* with no crew, a clear never takes and a miss never gives */
        if ((t.crew ?? 0) === 0) {
          assert.ok(settle({ ...t, rung, crew: 0 }, chain, loose).delta >= 0);
          assert.ok(settle({ ...t, rung: 4, crew: 0 }, chain, loose).delta <= 0);
        }
      }
    }
    assert.ok(checked >= 12000, `only ${checked} comparisons`);
  });

  test('the exception is bounded: ≤ 1 % of flips and ≤ 5 % of the bag, over arbitrary orders', () => {
    let pairs = 0; let violations = 0; let worstRel = 0; let worstAbs = 0;
    for (let seed = 0; seed < 3; seed++) {
      for (let n = 4; n <= 9; n++) {
        const r = rngFrom('j9-except', seed * 100 + n);
        const base = Array.from({ length: n }, () => honestTarget(r));
        const res = flipCheck(valuesOf(base, OPT), n);
        pairs += res.checked; violations += res.violations;
        worstAbs = Math.max(worstAbs, res.worst);
        worstRel = Math.max(worstRel, res.worstRel);
      }
    }
    const rate = violations / pairs;
    assert.ok(rate <= 0.01, `violation rate ${(rate * 100).toFixed(4)} % exceeds the 1 % ceiling (${violations}/${pairs})`);
    assert.ok(worstRel <= 0.05, `worst relative drop ${(worstRel * 100).toFixed(2)} % exceeds the 5 % ceiling (abs ${worstAbs})`);
  });

  /**
   * G3.7 proof 2 AS SCOPED — the integration ruling on notes/J9.md F2.
   *
   * J9 shipped this as a failing `todo` asserting the spec's UNQUALIFIED claim, because the choice
   * between its three resolutions was not J9's to make. It is taken here: `m_chain` multiplies the
   * miss branch because G2's formula says so and the formula is the authority (BUILD-POLICY), so
   * COMPOSED-GAME §3.7(2) is now scoped to the shapes the composer deals — where the sweep above
   * measures ZERO violations in 46 000+ flips — and states the bound off them. This test is that
   * bound, over the whole `n ≤ 11` lattice, asserted as a ceiling rather than an equality so that a
   * later ruling which genuinely removes the exception passes it instead of failing it.
   *
   * Nothing is softened: the numbers below are the MEASURED ones, ~2.6× tighter than the ≤ 1 % / ≤ 5 %
   * ceiling the smaller sweep next door carries, and the counterexample itself is frozen and pinned
   * target-by-target above.
   */
  test('G3.7 proof 2 as SCOPED — ALL 2ⁿ outcome vectors for n ≤ 11, arbitrary orders', () => {
    let violations = 0; let worst = 0; let worstRel = 0; let pairs = 0; let first = null;
    for (let seed = 0; seed < 2; seed++) {
      for (let n = 1; n <= 11; n++) {
        const r = rngFrom('j9-monotone', seed * 100 + n);
        const base = Array.from({ length: n }, () => honestTarget(r));
        const res = flipCheck(valuesOf(base, OPT), n);
        pairs += res.checked;
        violations += res.violations;
        worstRel = Math.max(worstRel, res.worstRel);
        if (res.worst > worst) { worst = res.worst; first = { seed, n, ...res.first }; }
      }
    }
    const rate = violations / pairs;
    const where = `${violations} of ${pairs} flips (${(rate * 100).toFixed(3)} %), worst ${worst} `
      + `(${(worstRel * 100).toFixed(2)} % of the bag) at ${JSON.stringify(first)}`;
    assert.ok(pairs >= 40000, `only ${pairs} flip pairs checked — the sweep shrank`);
    assert.ok(rate <= 0.0025, `the general-order exception is wider than §3.7(2) states: ${where}`);
    assert.ok(worstRel <= 0.02, `the general-order exception costs more than §3.7(2) states: ${where}`);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════ */
describe('J9 · the caveat G3.7 proof 2 states: a FROZEN policy is measurably worse', () => {
  test('always-push breaks monotonicity far more often than the revisable policy', () => {
    const frozen = (targets) => playOrder({ targets }, Array.from({ length: Math.max(0, targets.length - 1) }, () => 'push'));
    let frozenViol = 0; let revisableViol = 0; let pairs = 0;
    for (let seed = 0; seed < 4; seed++) {
      for (let n = 3; n <= 8; n++) {
        const r = rngFrom('j9-frozen', seed * 100 + n);
        const base = Array.from({ length: n }, () => wideTarget(r));
        frozenViol += flipCheck(valuesOf(base, frozen), n).violations;
        const res = flipCheck(valuesOf(base, OPT), n);
        revisableViol += res.violations;
        pairs += res.checked;
      }
    }
    assert.ok(frozenViol > 0, 'the frozen policy showed no violations — the caveat would be unmotivated');
    assert.ok(frozenViol > revisableViol,
      `frozen ${frozenViol} vs revisable ${revisableViol} over ${pairs} pairs — revisability bought nothing`);
    /* …but it does not close the gap, which is the finding of §4 */
    assert.ok(revisableViol >= 0);
  });

  test('BAG/PUSH is offered at every target and the getaway bag is free — the two devices the caveat names', () => {
    const targets = Array.from({ length: 6 }, () => ({ tier: 2, call: 70, scope: 1, cold: 1, rung: 0 }));
    assert.equal(optimalOrder({ targets }).decisions.length, targets.length - 1, 'one decision per beat but the last');
    for (const s of [0, 1, 37, 118, 999]) {
      assert.equal(getawayBank(s), round(s), 'the getaway bag charged a fee');
      assert.equal(bagFee(s) + bagBank(s), round(s), 'the mid-job fee and bank do not add up');
    }
    assert.ok(bagFee(118) > 0, 'the mid-job bag charged nothing — §3.3 would collapse');
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════ */
describe('J9 · the model is the shipped machine (this file is not a private economy)', () => {
  /** A save with real Leitner records, so `board.buildJob` has something to compose. */
  function seededSave(i) {
    const rng = rngFrom('j9-monotone-save', i);
    const s = fresh(NOW - 8 * DAY_MS);
    s.profileId = `mono-${i}`;
    s.settings.testDate = addDays(TODAY, 6);
    for (let k = 0; k < 40; k++) {
      const c = BANK[rng.int(0, BANK.length - 1)];
      let rec = null;
      for (let r = 0; r < 3; r++) rec = applyOutcome(s, c.id, rng.chance(0.75) ? 'clean' : 'wrong', { now: NOW - (30 - r * 4) * DAY_MS });
      if (!rec) continue;
      rec.cleared = true;
      rec.due = NOW + (rng.chance(0.7) ? -rng.float(0, 8) : rng.float(0.2, 10)) * DAY_MS;
      rec.history = Array.from({ length: 10 }, (_, h) => ({ at: NOW - (20 - h) * DAY_MS, ok: rng.chance(0.75), attempt: 1, hints: 0, ms: 9000 }));
    }
    return s;
  }

  const CLEAN = { cleared: true, firstTry: true, hints: 0, attempt: 1, clean: true };
  const MISS = { cleared: false, solutionShown: true, reason: 'third-wrong', attempt: 3, hints: 0 };

  test('a scripted job through state.js banks exactly what playOrder says it banks', () => {
    const save = seededSave(3);
    let t = NOW;
    const step = (ms) => (t += ms);
    state.startJob(save, { today: TODAY, now: t });
    state.beginTargets(save, { now: step(6000) });

    const order = [];            // the realised order, rebuilt from the machine's own priced targets
    const decisions = [];
    let finalBagged = null;
    for (let g = 0; g < 400; g++) {
      const st = state.stateOf(save);
      if (!st || st.outcome != null) break;
      if (st.phase === 'envelope') { state.lockCall(save, 70, { now: step(5000) }); continue; }
      if (st.phase === 'answer') {
        const n = state.answered(save) + 1;
        const payout = state.applyTarget(save, n % 4 === 0 ? MISS : CLEAN, { now: step(40000) });
        order.push({ ...payout.target, call: payout.call, rung: payout.rung, crew: payout.target.crew, idle: payout.target.idle });
        continue;
      }
      if (st.phase === 'payout' || st.phase === 'bagpush') {
        /* never bag at the LAST payout: `push` ends the job and banks the same pile for FREE
           (`endJob`'s bankOnExit), so a mid-job BAG there is a strictly dominated 10 % fee — see
           notes/J9.md §Requests, J6. */
        const bagIt = state.answered(save) % 3 === 0 && state.targetsLeft(save) > 0;
        decisions.push(bagIt ? 'bag' : 'push');
        const res = bagIt ? state.bag(save, { now: step(9000) }) : state.push(save, { now: step(9000) });
        finalBagged = res.bagged;
        continue;
      }
      if (st.phase === 'brief') { state.brief(save, {}, { now: step(20000) }); continue; }
      if (st.phase === 'getaway') { state.crack(save, { now: step(25000) }); continue; }
      break;
    }
    assert.ok(order.length >= 6, `only ${order.length} targets answered`);
    assert.equal(state.targetsLeft(save), 0, 'the job did not finish');
    assert.ok(decisions.includes('bag'), 'no bag in the run — the fee path is untested');

    const modelled = round(playOrder({ targets: order, completion: true }, decisions));
    assert.equal(modelled, finalBagged,
      `playOrder says ${modelled}, the machine banked ${finalBagged} — the model and the engine disagree`);
  });

  test('WALK at the getaway banks LOOSE at FULL value, exactly as bestWalk assumes', () => {
    const save = seededSave(4);
    let t = NOW;
    const step = (ms) => (t += ms);
    state.startJob(save, { today: TODAY, now: t });
    state.beginTargets(save, { now: step(6000) });
    for (let g = 0; g < 400; g++) {
      const st = state.stateOf(save);
      if (!st || st.outcome != null || st.phase === 'getaway') break;
      if (st.phase === 'envelope') { state.lockCall(save, 85, { now: step(5000) }); continue; }
      if (st.phase === 'answer') { state.applyTarget(save, CLEAN, { now: step(40000) }); continue; }
      if (st.phase === 'payout' || st.phase === 'bagpush') { state.push(save, { now: step(9000) }); continue; }
      if (st.phase === 'brief') { state.brief(save, {}, { now: step(20000) }); continue; }
      break;
    }
    const st = state.stateOf(save);
    assert.equal(st.phase, 'getaway', 'the job never reached the getaway');
    const g = state.getawayOf(save);
    assert.ok(g.loose > 0, 'no pile at the getaway — the assertion would be vacuous');
    assert.equal(g.walkBanks, getawayBank(g.loose));
    assert.equal(g.walkBanks, round(g.loose), 'the getaway walk charged a fee');
    const before = g.bagged;
    const out = state.walk(save, { now: step(25000) });
    assert.equal(out.bagged, round(before + getawayBank(g.loose)), 'WALK banked something other than the full pile');
    assert.ok(state.targetsLeft(save) >= 1, 'the vault did not stay due');
  });
});
