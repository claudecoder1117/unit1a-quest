// tests/job-align.test.mjs — J4: THE ALIGNMENT THEOREM.
//
//   "argmax(game) = argmax(ΔReadiness) on the domain where the game stakes anything."
//                                                            — COMPOSED-GAME.md G3.8
//
// AUTHORITY: COMPOSED-GAME.md G3.8 ("The fixed point of the meta — and the incentive-alignment
// proof"), G2 ("The build decision" flip 2 — *"the only decision left is which weak makes to STEADY
// — ordered by `w · (1 − m/100) · encounters`, which is the exact sort key `readiness.weakSpots()`
// already uses. Same function, two names."*), G8 J4. BUILD-POLICY overrides all of it.
//
// WHAT IS BEING PROVED, in one sentence: a student who min-maxes the crew build is, provably, doing
// the single best available study action — because the number the game maximises and the number
// Readiness maximises are the same number up to a positive constant.
//
// G3.8's table has three rows. This file owns row 2 (the crew gradient) and row 3's DOMAIN, which
// the document deliberately carries rather than hides:
//
//   | game quantity        | its gradient          | equals                                     |
//   | wing token equilibr. | v_i = Σ L·scope·cold  | the composer's own priority     (J3 owns)  |
//   | crew marginal value  | Δρ(m_i)·encounters_i  | readiness.weakSpots()'s sort key, EXACTLY  |
//   | rating weight        | 4q̂(1−q̂)              | (1 − m/100) RESTRICTED TO q̂ ∈ [0.5, 1]    |
//
// The third row is NOT a monotone transform of (1 − m/100) on [0, 1] — it inverts below q̂ = 0.5.
// §3 below asserts the restriction explicitly, with a worked counterexample, rather than papering
// over it. Below q̂ = 0.5 a card is not yet answerable in one try and the composer serves it as a
// `new` or `weak` item with hints on: the game stakes nothing there, which is exactly why the
// theorem is stated on the restricted domain and is true there.
//
// ── ROUND-1 FIX PASS (notes/crew-fix.md) ────────────────────────────────────────────────────────
// Two independent critics showed that the sentence at the top of this file is FALSE as written, and
// that this suite hid both failures rather than reporting them. §4 and §5 now measure them:
//
//  · ΔReadiness reads `m_shown = m · min(1, n/5)`. The published derivation drops `min(1, n/5)`
//    across a "∝", and this file's §4 used to drop it too — by filtering the population to `n ≥ 5`
//    and calling that "the set a build chooses from". A build chooses from all 19 makes, and this
//    file's own generator draws n ∈ [1, 8]. §4 now measures the disagreement on the UNFILTERED
//    population with the shipped `mastery.updateSkill` + `mastery.mShown`, and states the
//    restriction (equal evidence depth) as the theorem's domain instead of as a filter.
//  · The build has two rungs and `crewValue` prices one. HELD's gate is `isMastered`, so the
//    game's best point can go to a make `crewOrder` ranks last — "there is no step in the
//    min-maxer's list that is not also the best available study action" is false outside a domain
//    the document never printed. §5 prices both rungs (`crew.heldValue`), finds the real build
//    argmax (`crew.bestBuy`) and prints the threshold (`crew.alignmentFor`).
//
// Neither is fixed by bending a number: the crew gradient is still exactly `weakSpots()`'s sort key
// (§1, ρ = 1, unchanged), and what changed is which claims this suite is willing to make about it.
//
// §6 was added in the same round by the `tests` lane (notes/tests-fix.md §2), independently of the
// two fixes above: §1's ρ = 1 is an ARITHMETIC identity between `crewValue` and
// `skillState().score`, so §6 carries the acceptance instead — it correlates the two quantities
// `crewValue` is a MODEL OF, measured through the shipped code on both sides. Both lanes numbered
// their new section "5"; the integrator renumbered this one to 6 so file order is numeric order.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  crewValue, crewValueDetail, crewOrder, MAKES, DRHO_SLOPE, W_MEAN, weightOf, mOf, dRhoModel, matrixParamsFor,
  readinessGradient, nOf, evidenceDepth, heldValue, buildOptions, bestBuy, alignmentFor, canHold,
  shapeConstant, allocate, STEADY, HELD, dRhoTrue, steadyValueTrue, BAND_FLOOR, crewOrderTrue,
  // verify-1 — the board-priced build decision (§7-§10)
  steadyValueOn, heldValueOn, measuredParamsOn, reallocatable, encountersIn,
} from '../site/js/job/crew.js';
import { weakSpots, skillStates, skillState, WEAK_THRESHOLD, readiness } from '../site/js/readiness.js';
import { weightFor, isInformative, INFORMATIVE_MIN, qHatFor, qHatDetail } from '../site/js/job/call.js';
import { STAKE_DOMAIN } from '../site/js/job/econ.js';
import { SKILL_IDS, skillById } from '../site/data/skills.js';
import { SHAPES } from '../site/data/job.js';
import { fresh } from '../site/js/store.js';
import { mulberry32, cyrb53 } from '../site/js/rng.js';
import { byId } from '../site/data/cards.js';
// verify-1 (§7-§10): the drafted path the brief window's crew grid is actually rendered against.
// (`composePage`, `applyOutcome`, the card bank and `isBonus` are already imported by §6, below.)
import { composeBundles, draftUnion } from '../site/js/page.js';
import { bosses } from '../site/data/modules.js';

const NOW = new Date(2026, 8, 16, 18, 0).getTime();
const DAY = 24 * 3600 * 1000;
const SHAPE_IDS = ['RUN', 'JOB', 'JOB12', 'VAULT'];
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} — ${a} vs ${b} (tol ${tol})`);

/* ------------------------------------------------------------------ Spearman ρ, ties included */

/**
 * Fractional ranks (1-based, ties share their mean rank) of `xs`, descending. Ties MUST share a rank
 * for this theorem: `crewValue` is an exact positive multiple of `weakSpots`'s key, so a tie in one
 * is a tie in the other, and a tie-break by list order would make ρ = 1 an artefact of the sort
 * rather than a property of the two functions.
 */
function ranksDesc(xs, eps = 1e-9) {
  const idx = xs.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
  const out = new Array(xs.length);
  let k = 0;
  while (k < idx.length) {
    let j = k;
    while (j + 1 < idx.length && Math.abs(idx[j + 1].v - idx[k].v) <= eps * Math.max(1, Math.abs(idx[k].v))) j++;
    const r = (k + j) / 2 + 1;
    for (let t = k; t <= j; t++) out[idx[t].i] = r;
    k = j + 1;
  }
  return out;
}

/** Spearman ρ = Pearson correlation of the fractional rank vectors (the tie-correct definition). */
function spearman(a, b) {
  const ra = ranksDesc(a);
  const rb = ranksDesc(b);
  const n = ra.length;
  if (n < 2) return 1;
  const ma = ra.reduce((t, v) => t + v, 0) / n;
  const mb = rb.reduce((t, v) => t + v, 0) / n;
  let num = 0; let da = 0; let db = 0;
  for (let i = 0; i < n; i++) { const x = ra[i] - ma; const y = rb[i] - mb; num += x * y; da += x * x; db += y * y; }
  if (da === 0 || db === 0) return 1;          // one side is all-ties: the orderings cannot disagree
  return num / Math.sqrt(da * db);
}

/* ------------------------------------------------------------------ the population */

/**
 * A seeded save. Every draw comes from `rng.mulberry32` — BUILD-POLICY forbids `Math.random` under
 * `site/`, and a test that seeds itself differently on every run cannot pin a theorem.
 *
 * The population is deliberately harsh on the theorem: every make gets a random `m`, a random `n`
 * and a random weakness marker, so weak and strong makes, high and low test weights, tested and
 * untested makes all appear together in every ordering.
 */
function randomSave(i) {
  const R = mulberry32(cyrb53(`j4|align|${i}`) >>> 0);
  const s = fresh(NOW - 20 * DAY);
  s.profileId = `align-${i}`;
  s.xp = Math.floor(R.next() * 12000);
  for (const id of SKILL_IDS) {
    if (R.next() < 0.08) continue;                            // untested: never weak, still ordered
    const m = Math.round(R.next() * 100);
    const n = 1 + Math.floor(R.next() * 8);
    s.skills[id] = {
      m, n, lastAt: NOW - Math.floor(R.next() * 10) * DAY,
      misses: R.next() < 0.6 ? 1 + Math.floor(R.next() * 3) : 0,
      helped: R.next() < 0.5 ? 1 : 0,
    };
  }
  return s;
}

const SAVES = Array.from({ length: 1000 }, (_, i) => randomSave(i));

/* =========================================================================================
   1. THE THEOREM — Spearman ρ = 1, over 1 000 random saves   (ACCEPTANCE)
   ========================================================================================= */

describe('J4 · align · 1 · Spearman ρ = 1 between crewValue and readiness.weakSpots() (G3.8)', () => {
  test('ρ = 1 on the WEAK SPOTS themselves — the set the build decision is actually over', () => {
    let checked = 0; let nonTrivial = 0; let worst = 1;
    for (const save of SAVES) {
      const weak = weakSpots(save, { max: SKILL_IDS.length });
      if (weak.length < 2) continue;
      checked++;
      if (weak.length >= 3) nonTrivial++;
      const ids = weak.map((w) => w.id);
      const game = ids.map((id) => crewValue(save, id));
      const study = ids.map((id) => skillState(save, id).score);
      const rho = spearman(game, study);
      worst = Math.min(worst, rho);
      close(rho, 1, 1e-12, `save ${save.profileId}: ρ over ${ids.length} weak spots`);
    }
    assert.ok(checked >= 800, `${checked} of 1 000 saves have two or more weak spots`);
    assert.ok(nonTrivial >= 600, `${nonTrivial} saves have three or more — the test is not trivial`);
    assert.equal(worst, 1, 'and the worst ρ over all 1 000 saves is exactly 1');
  });

  test('ρ = 1 over ALL NINETEEN makes, not just the weak ones — the ordering never disagrees', () => {
    for (const save of SAVES) {
      const game = SKILL_IDS.map((id) => crewValue(save, id));
      const study = SKILL_IDS.map((id) => skillState(save, id).score);
      close(spearman(game, study), 1, 1e-12, `save ${save.profileId}`);
    }
  });

  test('ρ = 1 on every one of the four shapes — the shape is a positive constant, never a reordering', () => {
    for (const shape of SHAPE_IDS) {
      for (const save of SAVES.slice(0, 250)) {
        const game = SKILL_IDS.map((id) => crewValue(save, id, shape));
        const study = SKILL_IDS.map((id) => skillState(save, id).score);
        close(spearman(game, study), 1, 1e-12, `${shape} / ${save.profileId}`);
      }
    }
  });

  test('the top weak spot Home already prints IS the make crewOrder leads with', () => {
    let agreed = 0; let of = 0;
    for (const save of SAVES) {
      const weak = weakSpots(save, { max: 5 });
      if (!weak.length) continue;
      of++;
      const order = crewOrder(save, { of: weak.map((w) => w.id) });
      assert.deepEqual(order, weak.map((w) => w.id), `save ${save.profileId}: the two lists are the same list`);
      if (order[0] === weak[0].id) agreed++;
    }
    assert.equal(agreed, of, `all ${of} saves agree on the leading make`);
    assert.ok(of >= 900, 'the population really has weak spots');
  });

  test('"Same function, two names": crewValue IS the sort key times a positive constant of the shape', () => {
    for (const shape of SHAPE_IDS) {
      const p = matrixParamsFor(shape);
      const k = (p.lootMean * p.mBar * p.eForgiven * DRHO_SLOPE) / W_MEAN;
      assert.ok(k > 0, `${shape}: the constant is positive`);
      for (const save of SAVES.slice(0, 100)) {
        for (const id of SKILL_IDS) {
          const study = skillState(save, id).score;          // w × (1 − m/100), readiness.js's own
          close(crewValue(save, id, shape), k * study, 1e-12, `${shape}/${id}`);
          close(crewValueDetail(save, id, shape).score, study, 1e-12, `${shape}/${id} score`);
        }
      }
    }
  });

  test('and it reads the SAME field: `rec.m`, not `m_shown` — a mismatch here would break ρ silently', () => {
    const s = fresh(NOW);
    s.skills.FAC2 = { m: 60, n: 1, misses: 1 };               // m 60, m_shown 12
    close(mOf(s, 'FAC2'), 60, 1e-12);
    close(skillState(s, 'FAC2').m, 60, 1e-12);
    assert.notEqual(skillState(s, 'FAC2').mShown, 60, 'm_shown is a different number here');
    close(crewValueDetail(s, 'FAC2').score, skillById.FAC2.w * 0.4, 1e-12);
    close(skillState(s, 'FAC2').score, skillById.FAC2.w * 0.4, 1e-12);
  });

  test('the theorem is falsifiable: a crewValue that read m_shown would NOT score ρ = 1', () => {
    // the control. If the two functions read different mastery fields, the orderings come apart —
    // which is why §1 asserts the field as well as the correlation.
    let broke = 0;
    for (const save of SAVES.slice(0, 300)) {
      const wrong = SKILL_IDS.map((id) => weightOf(id) * (1 - skillState(save, id).mShown / 100));
      const study = SKILL_IDS.map((id) => skillState(save, id).score);
      if (spearman(wrong, study) < 1 - 1e-9) broke++;
    }
    assert.ok(broke > 250, `${broke} of 300 saves distinguish the two readings — the test can fail`);
  });
});

/* =========================================================================================
   2. The gradient is the one G3.8 names: Δρ(m) · encounters ∝ w · (1 − m/100)
   ========================================================================================= */

describe('J4 · align · 2 · the crew gradient factorises into Δρ(m) × encounters(w)', () => {
  test('Δρ̂(m) is strictly decreasing in m and vanishes at m = 100', () => {
    for (let m = 0; m < 100; m++) assert.ok(dRhoModel(m) > dRhoModel(m + 1), `m ${m}`);
    close(dRhoModel(100), 0, 1e-12, 'a perfect make gains nothing from forgiveness');
    close(dRhoModel(0) / dRhoModel(50), 2, 1e-12, 'and it is linear in (1 − m/100)');
  });

  test('encounters is strictly increasing in the make\'s test weight', () => {
    const s = fresh(NOW);
    const byW = [...SKILL_IDS].sort((a, b) => weightOf(a) - weightOf(b));
    for (let i = 1; i < byW.length; i++) {
      const lo = crewValueDetail(s, byW[i - 1]).encounters;
      const hi = crewValueDetail(s, byW[i]).encounters;
      assert.ok(hi >= lo, `${byW[i - 1]} (w ${weightOf(byW[i - 1])}) ≤ ${byW[i]} (w ${weightOf(byW[i])})`);
      if (weightOf(byW[i]) > weightOf(byW[i - 1])) assert.ok(hi > lo, 'strictly, where the weights differ');
    }
  });

  test('the two factors trade off exactly as G2 flip 2 says: weight × weakness, nothing else', () => {
    const s = fresh(NOW);
    // CS-LIN (w 9) at m 80 against QUAD-CTX (w 2) at m 0
    s.skills['CS-LIN'] = { m: 80, n: 5, misses: 1 };
    s.skills['QUAD-CTX'] = { m: 0, n: 1, misses: 1 };
    const a = crewValueDetail(s, 'CS-LIN');
    const b = crewValueDetail(s, 'QUAD-CTX');
    close(a.score, 9 * 0.2, 1e-12);
    close(b.score, 2 * 1.0, 1e-12);
    assert.ok(b.value > a.value, 'a weight-2 make you cannot do beats a weight-9 make you nearly can');
    // and the indifference point is exactly where the products meet
    s.skills['CS-LIN'].m = 100 - (2 * 100) / 9;
    close(crewValue(s, 'CS-LIN'), crewValue(s, 'QUAD-CTX'), 1e-12, 'w·(1−m/100) equal → equal value');
  });

  test('G3.7 #8 in the ordering: mastering a make REMOVES it from the top of the crew list', () => {
    const s = fresh(NOW);
    for (const id of SKILL_IDS) s.skills[id] = { m: 50, n: 4, misses: 1 };
    s.skills['CS-LIN'] = { m: 10, n: 4, misses: 1 };
    assert.equal(crewOrder(s)[0], 'CS-LIN', 'the weakest heavy make leads');
    s.skills['CS-LIN'] = { m: 95, n: 5, misses: 1, lastDueCorrectAt: NOW - DAY };
    assert.notEqual(crewOrder(s)[0], 'CS-LIN', 'mastering it moves it off the top');
    assert.ok(crewOrder(s).indexOf('CS-LIN') > 10, 'and a long way down — "mastering it frees the slot"');
  });
});

/* =========================================================================================
   3. THE DOMAIN RESTRICTION, asserted explicitly   (ACCEPTANCE)
   ========================================================================================= */

describe('J4 · align · 3 · the q̂ ≥ 0.5 domain restriction, carried rather than hidden (G3.8)', () => {
  /**
   * The link the theorem's third row needs, stated rather than assumed: `q̂` (the first-try rate on
   * a make) rises with `m` (the mastery score of that make). Any strictly increasing link works;
   * this file uses the simplest one, `q̂ = m/100`, and §3.5 checks it against the REAL `q̂` the app
   * computes from `save.cards[*].history`.
   */
  const qHatModel = (m) => m / 100;

  test('STAKE_DOMAIN is [0.5, 1] and it is the domain the restriction names', () => {
    assert.deepEqual([...STAKE_DOMAIN], [0.5, 1]);
    close(INFORMATIVE_MIN, 0.25, 1e-12);
  });

  test('4q̂(1−q̂) is strictly DECREASING in q̂ on [0.5, 1] and strictly INCREASING on [0, 0.5]', () => {
    for (let q = 0.5; q < 0.999; q += 0.001) {
      assert.ok(weightFor(q) > weightFor(q + 0.001) - 1e-15, `decreasing at q̂ ${q.toFixed(3)}`);
    }
    for (let q = 0; q < 0.499; q += 0.001) {
      assert.ok(weightFor(q) < weightFor(q + 0.001) + 1e-15, `increasing at q̂ ${q.toFixed(3)}`);
    }
    close(weightFor(0.5), 1, 1e-12, 'the peak is at q̂ = 0.5');
    close(weightFor(0.2), weightFor(0.8), 1e-12, 'and it is symmetric — which is the whole problem');
  });

  test('ON the domain: the rating weight orders makes exactly as (1 − m/100) does, ρ = 1', () => {
    let checked = 0;
    for (const save of SAVES) {
      const ids = SKILL_IDS.filter((id) => {
        const rec = save.skills?.[id];
        return rec && qHatModel(rec.m) >= STAKE_DOMAIN[0];
      });
      if (ids.length < 3) continue;
      checked++;
      const weight = ids.map((id) => weightFor(qHatModel(save.skills[id].m)));
      const weakness = ids.map((id) => 1 - save.skills[id].m / 100);
      close(spearman(weight, weakness), 1, 1e-12, `save ${save.profileId} on q̂ ≥ 0.5`);
    }
    assert.ok(checked >= 800, `${checked} of 1 000 saves have three or more makes on the domain`);
  });

  test('OFF the domain the relation INVERTS — the counterexample, worked', () => {
    // two makes of equal test weight: one the student can almost never do, one they nearly can
    const almostNever = 0.10;     // q̂ = 0.10 → weakness 0.90
    const nearlyCan = 0.80;       // q̂ = 0.80 → weakness 0.20
    assert.ok((1 - almostNever) > (1 - nearlyCan), 'the first is the weaker make, by a mile');
    assert.ok(weightFor(almostNever) < weightFor(nearlyCan),
      `but the rating weight prefers the second (${weightFor(almostNever).toFixed(3)} < ${weightFor(nearlyCan).toFixed(3)}) — the inversion G3.8 admits to`);
    // and over a whole population, admitting q̂ < 0.5 breaks ρ = 1
    let broke = 0; let of = 0;
    for (const save of SAVES.slice(0, 400)) {
      const ids = SKILL_IDS.filter((id) => save.skills?.[id]);
      if (ids.length < 5) continue;
      of++;
      const weight = ids.map((id) => weightFor(qHatModel(save.skills[id].m)));
      const weakness = ids.map((id) => 1 - save.skills[id].m / 100);
      if (spearman(weight, weakness) < 1 - 1e-9) broke++;
    }
    assert.ok(broke > of * 0.95, `${broke} of ${of} saves break ρ = 1 once q̂ < 0.5 is admitted`);
  });

  test('the restriction is NOT needed for row 2: crewValue orders correctly on the whole of [0, 1]', () => {
    // This is the asymmetry that makes the theorem worth having. The crew gradient is linear in
    // (1 − m/100), so it never inverts; only the rating weight does, and only below q̂ = 0.5, which
    // is where the composer serves an item as `new`/`weak` with hints on and the game stakes nothing.
    for (const save of SAVES.slice(0, 300)) {
      const low = SKILL_IDS.filter((id) => save.skills?.[id] && qHatModel(save.skills[id].m) < 0.5);
      if (low.length < 3) continue;
      const game = low.map((id) => crewValue(save, id));
      const study = low.map((id) => skillState(save, id).score);
      close(spearman(game, study), 1, 1e-12, `save ${save.profileId} BELOW the domain`);
    }
  });

  test('the real q̂ — read from save.cards[*].history by call.qHatFor — rises with the first-try rate', () => {
    // the model link of this file, grounded once against the app's own q̂ rather than left notional
    const mk = (hits, of) => {
      const s = fresh(NOW);
      const ids = Object.keys(byId).filter((id) => (byId[id].skills ?? []).includes('FAC2')).slice(0, 1);
      assert.ok(ids.length, 'the bank has a FAC2 card to hang a history on');
      const history = [];
      for (let k = 0; k < of; k++) {
        history.push({ at: NOW - (of - k) * 3600 * 1000, ok: k < hits, attempt: 1, hints: 0, ms: 9000 });
      }
      s.cards[ids[0]] = { cleared: true, attempts: of, bucket: 3, due: NOW, history };
      return s;
    };
    for (const [hits, of, want] of [[10, 10, 1], [8, 10, 0.8], [5, 10, 0.5], [2, 10, 0.2]]) {
      const d = qHatDetail(mk(hits, of), 'FAC2', { cards: byId });
      close(d.qHat, want, 1e-9, `${hits}/${of}`);
      close(weightFor(d.qHat), 4 * want * (1 - want), 1e-9, `w at q̂ ${want}`);
      assert.equal(isInformative(d.qHat), 4 * want * (1 - want) >= INFORMATIVE_MIN, `informative at q̂ ${want}`);
    }
    // and the app's own q̂ is monotone in the first-try rate, which is the link this file assumed
    const qs = [2, 4, 6, 8, 10].map((h) => qHatFor(mk(h, 10), 'FAC2', { cards: byId }));
    for (let i = 1; i < qs.length; i++) assert.ok(qs[i] > qs[i - 1], 'q̂ rises with the first-try rate');
  });
});

/* =========================================================================================
   4. What the theorem is FOR: a min-maxer is an optimal student
   ========================================================================================= */

describe('J4 · align · 4 · a min-maxer is an optimal student (G3.8 step 5)', () => {
  test('ON THE DOMAIN — equal evidence depth: argmax(game) = argmax(ΔReadiness), exactly', () => {
    // dR ∝ w_i · (1 − m_i/100) · min(1, n_i/5), where the n-term is `mastery.mShown`'s discount and
    // `readiness.masteryTerm` reads it. It is a positive factor OF THE MAKE, so on a set of makes
    // whose evidence depth is equal the two argmaxes coincide — and THAT is the domain, stated as a
    // domain. `readinessGradient` is the exact ΔReadiness for one clean clear (it runs the shipped
    // `mastery.updateSkill` and differences the shipped `m_shown`), not the linearisation.
    let checked = 0;
    for (const save of SAVES.slice(0, 400)) {
      const ids = SKILL_IDS.filter((id) => nOf(save, id) >= 5);   // equal n-term (= 1)
      if (ids.length < 3) continue;
      checked++;
      for (const id of ids) close(evidenceDepth(save, id), 1, 1e-12, `${id}: n ≥ 5 ⇒ m_shown = m`);
      const game = ids.map((id) => crewValue(save, id));
      const dR = ids.map((id) => readinessGradient(save, id));
      close(spearman(game, dR), 1, 1e-12, `save ${save.profileId}`);
      const bestGame = ids[game.indexOf(Math.max(...game))];
      const bestStudy = ids[dR.indexOf(Math.max(...dR))];
      close(crewValue(save, bestGame), crewValue(save, bestStudy), 1e-12, 'argmax(game) = argmax(ΔReadiness)');
    }
    assert.ok(checked >= 100, `${checked} saves carry ≥ 3 makes at n ≥ 5`);
  });

  test('OFF IT — the UNFILTERED population: the two argmaxes disagree, and the suite says how often', () => {
    // r1 BLOCKER fix. The test above used to be the whole of this claim, with its `n ≥ 5` filter
    // described as "the set a build chooses from". A build chooses from all 19 makes, and this
    // file's own generator draws n ∈ [1, 8] — so the filter was removing precisely the makes the
    // dropped term applies to. Unfiltered, the disagreement is not an edge case.
    let disagree = 0; let total = 0; const example = [];
    for (const save of SAVES) {
      const ids = SKILL_IDS.filter((id) => save.skills?.[id]);
      if (ids.length < 3) continue;
      total++;
      const game = ids.map((id) => crewValue(save, id));
      const dR = ids.map((id) => readinessGradient(save, id));
      const bg = ids[game.indexOf(Math.max(...game))];
      const bs = ids[dR.indexOf(Math.max(...dR))];
      if (bg !== bs) {
        disagree++;
        if (example.length < 2) example.push({ save: save.profileId, game: bg, study: bs, nGame: nOf(save, bg), nStudy: nOf(save, bs) });
      }
    }
    const rate = disagree / total;
    assert.ok(rate > 0.25, `the argmaxes disagree on ${(rate * 100).toFixed(1)} % of ${total} saves — this is not an edge case`);
    assert.ok(rate < 0.80, `…and not universal either (${(rate * 100).toFixed(1)} %)`);
    // the mechanism, named: the game's pick is the thinner-evidence make
    const thinner = example.filter((e) => e.nGame < e.nStudy).length;
    assert.ok(thinner >= 1, `the game prefers the thin-evidence make: ${JSON.stringify(example)}`);
    // The missing factor is exactly `min(1, n/5)`: restoring it reproduces the document's OWN
    // derivation `dR = 0.5·w·0.35·(1 − m/100)·min(1, n/5)` to the bit, on every save.
    for (const save of SAVES.slice(0, 200)) {
      const ids = SKILL_IDS.filter((id) => save.skills?.[id]);
      if (ids.length < 3) continue;
      const patched = ids.map((id) => crewValue(save, id) * evidenceDepth(save, id));
      const docDR = ids.map((id) => 0.5 * weightOf(id) * 0.35 * (1 - mOf(save, id) / 100) * Math.min(1, nOf(save, id) / 5));
      close(spearman(patched, docDR), 1, 1e-9, `save ${save.profileId}: the dropped term IS min(1, n/5)`);
    }
    // …and even THAT is only a gradient: one clean clear also raises `n`, which lifts the m_shown the
    // make already had, so the exact step (`readinessGradient`, off the shipped `mastery.updateSkill`)
    // is a third ordering again. Below n = 5 the linearisation is not a safe stand-in for ΔReadiness
    // in either direction — which is why the theorem's domain is equal evidence depth, not a filter.
    let linearWrong = 0; let n = 0;
    for (const save of SAVES.slice(0, 200)) {
      const ids = SKILL_IDS.filter((id) => save.skills?.[id]);
      if (ids.length < 3) continue;
      n++;
      const patched = ids.map((id) => crewValue(save, id) * evidenceDepth(save, id));
      const exact = ids.map((id) => readinessGradient(save, id));
      if (ids[patched.indexOf(Math.max(...patched))] !== ids[exact.indexOf(Math.max(...exact))]) linearWrong++;
    }
    assert.ok(linearWrong > 0,
      `the document's linearised dR picks a different make from the shipped step on ${linearWrong} of ${n} saves`);
  });

  test('there is no make on which the game and the study plan disagree about direction', () => {
    // answering a make correctly RAISES m, which LOWERS both its crew value and its ΔReadiness —
    // the economy deflates as you master the material, in both currencies at once (G2's last line)
    for (const id of ['VOC', 'FAC2', 'CS-LIN', 'QUAD-CTX']) {
      let lastGame = Infinity; let lastStudy = Infinity;
      for (let m = 0; m <= 100; m += 5) {
        const s = fresh(NOW);
        s.skills[id] = { m, n: 5, misses: 1 };
        const g = crewValue(s, id);
        const r = skillState(s, id).score;
        assert.ok(g <= lastGame + 1e-12, `${id}: crew value falls as m rises`);
        assert.ok(r <= lastStudy + 1e-12, `${id}: the study key falls as m rises`);
        lastGame = g; lastStudy = r;
      }
      close(lastGame, 0, 1e-12, `${id}: at m = 100 the ADVISORY ORDERING is zero`);
    }
  });

  // r3 fix. The line above used to carry the message "at m = 100 the crew is worth nothing", which
  // is true of `crewValue` — an ordering — and FALSE of the game. `bandFor` clamps at the TOP band
  // as well as the bottom, so a make at m = 100 is paid at exactly the m85 rate: the crew grid says
  // a mastered make's point is worth nothing while the shipped ladder pays it 0.0325 of ρ. The
  // assertion above is kept (it pins the ordering's own zero); this one states the other half, so
  // the pair can never again be read as a claim about the payoff.
  test('…but the PAYOFF at m = 100 is not zero — the top band clamps too (r3)', () => {
    close(dRhoTrue(100), dRhoTrue(85), 1e-12, 'bandFor clamps at the highest published band');
    assert.ok(dRhoTrue(100) > 0, `Δρ at m = 100 is ${dRhoTrue(100).toFixed(4)}, not 0`);
    for (const id of ['VOC', 'FAC2', 'CS-LIN', 'QUAD-CTX']) {
      const s = fresh(NOW);
      s.skills[id] = { m: 100, n: 5, misses: 1 };
      assert.equal(crewValue(s, id), 0, `${id}: the ordering says nothing is left to study`);
      assert.ok(steadyValueTrue(s, id) > 0,
        `${id}: …while a STEADY point on it still pays ${steadyValueTrue(s, id).toFixed(4)}`);
    }
    // and the same clamp at the BOTTOM is the fourth domain condition of the theorem this file
    // proves: `alignmentFor().domain.band` (tests/job-crew.test.mjs §15, notes/crew-fix.md R5).
    close(dRhoTrue(0), dRhoTrue(BAND_FLOOR), 1e-12, 'flat across the whole weak-spot range');
    const s = fresh(NOW);
    for (const id of SKILL_IDS) s.skills[id] = { m: 55, n: 6, misses: 1 };
    assert.equal(alignmentFor(s).domain.band, true);
    s.skills.VOC = { m: 20, n: 6, misses: 1 };
    assert.equal(alignmentFor(s).domain.band, false, 'one make in the flat tail leaves the domain');
  });

  test('the weak threshold readiness.js uses does not move the ordering, only the membership', () => {
    // weakSpots FILTERS at m_shown < 70; crewValue does not filter at all. The theorem is about the
    // ORDER on the intersection, and the filter is readiness's own product decision (S7), not a
    // second sort key. Asserted so a future change to WEAK_THRESHOLD cannot silently break ρ = 1.
    assert.equal(WEAK_THRESHOLD, 70);
    for (const save of SAVES.slice(0, 300)) {
      const weak = weakSpots(save, { max: SKILL_IDS.length }).map((w) => w.id);
      const all = crewOrder(save);
      const projected = all.filter((id) => weak.includes(id));
      assert.deepEqual(projected, weak, `save ${save.profileId}: weakSpots is crewOrder, filtered`);
    }
  });

  test('the population is what it claims to be — 1 000 seeded saves, no Math.random', () => {
    assert.equal(SAVES.length, 1000);
    assert.equal(new Set(SAVES.map((s) => s.profileId)).size, 1000);
    // re-seeding reproduces byte-identically: the theorem is pinned, not sampled afresh each run
    assert.deepEqual(randomSave(0).skills, SAVES[0].skills);
    assert.deepEqual(randomSave(999).skills, SAVES[999].skills);
    const tested = SAVES.map((s) => SKILL_IDS.filter((id) => s.skills?.[id]).length);
    assert.ok(Math.min(...tested) >= 10, 'every save has most of the 19 makes tested');
    // and the m values really do span the range, so the domain restriction has something to bite on
    const ms = SAVES.flatMap((s) => SKILL_IDS.map((id) => s.skills?.[id]?.m).filter((m) => m != null));
    assert.ok(Math.min(...ms) <= 2 && Math.max(...ms) >= 98, 'm spans [0, 100]');
    assert.ok(ms.filter((m) => m < 50).length > ms.length * 0.4, 'and half of it is below q̂ = 0.5');
  });
});

/* =========================================================================================
   5. THE BUILD HAS TWO RUNGS — the real argmax, and the domain the theorem holds on
   (r1 BLOCKER: "on the evening default the game's best crew point goes to a MASTERED make")
   ========================================================================================= */

describe('J4 · align · 5 · argmax over the REAL build (both rungs), and its printed domain', () => {
  /**
   * The align population with mastery switched on where the record already qualifies: `isMastered`
   * needs `m ≥ 85 ∧ n ≥ 3 ∧ lastDueCorrectAt`, and the §1–§4 population never writes the third
   * clause — so HELD does not exist in it at all, which is exactly how this defect stayed invisible.
   */
  function masteredSave(i) {
    const s = randomSave(i);
    for (const id of SKILL_IDS) {
      const rec = s.skills?.[id];
      if (rec && rec.m >= 85 && rec.n >= 3) rec.lastDueCorrectAt = NOW - 2 * DAY;
    }
    s.xp = 12000;                                   // capacity 22: every build decision is live
    return s;
  }
  const HELD_SAVES = Array.from({ length: 400 }, (_, i) => masteredSave(i));
  const WITH_HELD = HELD_SAVES.filter((s) => SKILL_IDS.some((id) => canHold(s, id)));

  test('the population can actually buy HELD — otherwise this whole section is vacuous', () => {
    assert.ok(WITH_HELD.length >= 100, `${WITH_HELD.length} of 400 saves have a mastered make`);
    assert.equal(SKILL_IDS.filter((id) => canHold(SAVES[0], id)).length, 0,
      'and §1–§4\'s population has none — which is why the two-rung defect never showed up there');
  });

  test('heldValue: 0 unless the gate passes, and it scales with the make\'s share of the board', () => {
    const s = WITH_HELD[0];
    for (const id of SKILL_IDS) {
      if (!canHold(s, id)) assert.equal(heldValue(s, id), 0, `${id}: the gate is isMastered`);
      else assert.ok(heldValue(s, id) > 0, `${id}: a mastered make has a HELD price`);
    }
    // two mastered makes of different test weight: the heavier one is worth more per point
    const mastered = SKILL_IDS.filter((id) => canHold(s, id)).sort((a, b) => weightOf(b) - weightOf(a));
    if (mastered.length >= 2 && weightOf(mastered[0]) > weightOf(mastered[mastered.length - 1])) {
      const hi = mastered[0]; const lo = mastered[mastered.length - 1];
      assert.ok(heldValue(s, hi) > heldValue(s, lo), `${hi} (w ${weightOf(hi)}) outbids ${lo} (w ${weightOf(lo)})`);
    }
    // and it is the row price when the make carries exactly the mean weight share
    for (const shape of SHAPE_IDS) {
      const p = matrixParamsFor(shape);
      const any = mastered[0];
      const expected = heldValue(s, any, shape);
      assert.ok(expected > 0 && Number.isFinite(expected), `${shape}: finite`);
      assert.ok(heldValue(s, any, shape) / heldValue(s, any, 'RUN') > 0 || shape === 'RUN', `${shape}: positive`);
      assert.equal(p.shape, shape);
    }
  });

  test('THE DEFECT, MEASURED: the game\'s best point goes to a make crewOrder ranks LAST', () => {
    // `crewValue ∝ (1 − m/100)` and HELD's gate is `m ≥ 85`, so every make eligible for a HELD point
    // sits at the bottom of the study plan's list. Whenever HELD outbids STEADY, the build argmax
    // and the study argmax are not merely different — they are at opposite ends of the same list.
    let flipped = 0; const worked = [];
    for (const s of WITH_HELD) {
      const a = alignmentFor(s, { shape: 'JOB' });
      if (a.holds) continue;
      flipped++;
      const order = crewOrder(s);
      if (worked.length < 2) {
        worked.push({
          save: s.profileId, buy: `${a.best.name} on ${a.best.make}`,
          rankInStudyPlan: order.indexOf(a.best.make) + 1, of: order.length,
          studyPick: order[0], threshold: +a.threshold.toFixed(3),
        });
      }
      assert.equal(a.best.rank, HELD, 'when the claim fails it fails because HELD won');
      assert.ok(canHold(s, a.best.make), 'on a mastered make — a make with nothing left to study');
      assert.ok(crewOrder(s).indexOf(a.best.make) > 8,
        `${s.profileId}: the game's pick sits at position ${crewOrder(s).indexOf(a.best.make) + 1} of the study plan`);
    }
    assert.ok(flipped > 0, `the unrestricted claim fails on ${flipped} of ${WITH_HELD.length} saves: ${JSON.stringify(worked)}`);
  });

  test('alignmentFor IS the domain: while it holds, the build argmax IS the study argmax', () => {
    for (const shape of SHAPE_IDS) {
      let held = 0; let total = 0;
      for (const s of WITH_HELD) {
        const a = alignmentFor(s, { shape });
        total++;
        if (!a.holds) continue;
        held++;
        // the claim, on its own domain: the best buy is a STEADY, and it is the top of crewOrder
        assert.equal(a.best.rank, STEADY, `${s.profileId}/${shape}: the best point is a STEADY`);
        assert.equal(a.best.make, crewOrder(s, { shape })[0], `${s.profileId}/${shape}: …on the top weak spot`);
        assert.equal(bestBuy(s, { shape }).make, a.best.make);
      }
      assert.ok(held > 0 && held < total, `${shape}: the domain is non-trivial — holds on ${held} of ${total}`);
    }
  });

  test('the threshold is printed in the units Home sorts Weak spots in, and it is the real boundary', () => {
    // holds ⇔ max_i w_i(1 − m_i/100) ≥ heldValue(best) / k(shape). The threshold is that right-hand
    // side, in `w · (1 − m/100)` units, so a student can read it against their own weak-spot list.
    for (const shape of SHAPE_IDS) {
      for (const s of WITH_HELD.slice(0, 120)) {
        const a = alignmentFor(s, { shape });
        if (!a.held) continue;
        const key = Math.max(...SKILL_IDS.map((id) => weightOf(id) * (1 - mOf(s, id) / 100)));
        close(a.threshold * shapeConstant(shape), a.held.value, 1e-9, `${shape}: threshold × k = HELD's price`);
        assert.equal(a.holds, key >= a.threshold - 1e-12, `${shape}/${s.profileId}: the boundary is the threshold`);
      }
    }
    if (process.env.J4_PRINT) {
      for (const shape of SHAPE_IDS) {
        const ts = WITH_HELD.map((s) => alignmentFor(s, { shape })).filter((a) => a.held).map((a) => a.threshold);
        const holds = WITH_HELD.filter((s) => alignmentFor(s, { shape }).holds).length;
        console.log(`${shape.padEnd(6)} alignment holds on ${holds}/${WITH_HELD.length}  median threshold ${ts.sort((a, b) => a - b)[Math.floor(ts.length / 2)].toFixed(2)}`);
      }
    }
  });

  test('buildOptions is a total, deterministic ordering of every point the save could buy', () => {
    const s = WITH_HELD[0];
    const opts = buildOptions(s);
    assert.equal(opts.filter((o) => o.rank === STEADY).length, SKILL_IDS.length, 'a STEADY price for all 19');
    assert.equal(opts.filter((o) => o.rank === HELD).length, SKILL_IDS.filter((id) => canHold(s, id)).length);
    for (let i = 1; i < opts.length; i++) assert.ok(opts[i - 1].value >= opts[i].value, 'descending');
    assert.deepEqual(buildOptions(s), opts, 'pure: same save, same list');
    assert.equal(bestBuy(s).make, opts[0].make);
    assert.equal(bestBuy(s).rank, opts[0].rank);
  });

  test('the TRUE band payoff is not this linear model, and the suite says where they part', () => {
    // r1 MAJOR: `dRhoModel` fits through the origin; the real Δρ comes from RUNG_BANDS via bandFor,
    // which clamps below m = 40 — the whole weak-spot range — so the real payoff orders makes by
    // test weight ALONE there, while crewValue orders by w · (1 − m/100).
    for (const m of [0, 10, 25, 39, 40]) close(dRhoTrue(m), dRhoTrue(40), 1e-12, `Δρ is FLAT at m = ${m}`);
    assert.ok(dRhoModel(0) > dRhoTrue(0) * 1.5, 'and the model keeps rising where the truth does not');
    assert.ok(Math.abs(dRhoModel(85) / dRhoTrue(85) - 1) > 0.20, 'at m = 85 — where HELD\'s gate sits — the model is 20 %+ high');
    // how often the two orderings disagree about the TOP make, on the align population
    let inverted = 0; let total = 0;
    for (const s of SAVES) {
      const ids = SKILL_IDS.filter((id) => s.skills?.[id]);
      if (ids.length < 3) continue;
      total++;
      const byModel = ids.slice().sort((a, b) => crewValue(s, b) - crewValue(s, a))[0];
      const byTrue = ids.slice().sort((a, b) => steadyValueTrue(s, b) - steadyValueTrue(s, a))[0];
      if (byModel !== byTrue && Math.abs(steadyValueTrue(s, byModel) - steadyValueTrue(s, byTrue)) > 1e-9) inverted++;
    }
    assert.ok(inverted / total > 0.15,
      `the linear gradient and the shipped-band payoff pick different makes in ${(inverted / total * 100).toFixed(1)} % of saves`);
  });
});

/* =========================================================================================
   6. THE THEOREM, MEASURED — the REALISED payoff gradient against a REALISED ΔReadiness
   =========================================================================================

   Why this section exists (ticket fix:tests r1, finding 2). §1 asserts Spearman ρ = 1 between
   `crewValue` and `readiness.skillState().score`. That is true, and it is also an ARITHMETIC
   identity: `crew.js:545` returns `shapeConstant(shape) * (w * (1 − m/100))` and `readiness.js:307`
   returns `def.w * (1 − (rec?.m ?? 0) / 100)`. The two differ by one positive scalar, so ρ = 1 is a
   property of the expression, not of the game, and §1's own falsifiability control only shows that a
   DIFFERENT function would score less than 1 — it never puts the tested one at risk.

       $ node -e "…crewValue(s, id) / skillState(s, id).score for all 19 makes…"
       [ 0.8417201032258065, 0.8417201032258066, 0.8417201032258067 ]   // = shapeConstant('JOB')

   So this section measures the two things `crewValue` is a MODEL OF, through the shipped code, and
   correlates those instead:

     · the GAME side — the marginal LOOSE a point of crew actually returns on one make, priced off
       J1's `rhoFor` / `carryFor` / `missFor` / `chainAfterTarget`, over rungs drawn from the make's
       own shipped `RUNG_BANDS` through `crew.bandFor` + `crew.drawRung`, under G2's real idle rule
       (`crew.ownDueReviewIndices` — the ONE review that made the make cold, which is what
       `crew.isIdleFor` ships; note that `crew.simulateJob` and `crew.encountersIn` still use the
       broader `isDueReview`, and on this population that difference is worth ~50 % of e_forgiven).
       Common random numbers: the two arms see the SAME rungs, so the difference is the crew point
       and nothing else.

     · the STUDY side — `readiness(save).r` before and after one clean answer on that make, through
       the shipped `mastery.updateSkill`. No model of ΔReadiness appears anywhere below.

   WHAT IT FINDS, and it is not ρ = 1 — the numbers below are COMPUTED by this file (§6.2/§6.3) on
   the shipped seeds and asserted, never typed:

     · per board, over all nineteen makes: the game's best make is in ΔReadiness's top three on
       **43 %** of boards and is its exact argmax on **19 %**.
     · per board, restricted to the makes the board actually SERVES: 99 % and 57 % — and that
       reading is circular, which is why it is not the headline. Restricted supply is the thing
       that breaks alignment, so measuring agreement only where supply exists asks the question
       with the answer already in it; with a mean of ~5 served makes a top-three hit is ≈ 60 % by
       chance alone. §6.2 asserts both and says which is which.
     · corpus-level: ρ = 0.65 over all nineteen makes, and the game's best make (FAC2) ranks 8 of
       19 by total ΔReadiness.

   ROUND-2 CORRECTION (crew-alignment critic, findings 3 and 4). This header used to claim 97 % and
   42 %. Neither reproduces under any reading of §6's own generator, own seeds and own realisedTake
   — the two numbers were prose, asserted by nothing. They are now the measured 43 % / 19 %, and
   §6.2 computes them so the header cannot drift again. The same critic showed that the old
   `rServed > 0.15` was a seed-specific constant: with the generator, the recipe and the boards all
   held fixed and ONLY the seed string changed, rServed spans −0.07 to 0.61 and falls below 0.15 on
   a third of re-seeds. With nine served makes the standard error of a Spearman ρ is about
   1/√(n−1) ≈ 0.35, so one corpus's 0.233 is not distinguishable from zero. §6.3 therefore asserts
   the DISTRIBUTION over 24 independent corpora instead of a floor on one.

   The mechanism is unchanged and is the finding: the composer's supply is lumpy — a make the board
   does not serve returns exactly zero whatever its weakness. `encounters_i ∝ w_i`, the middle
   factor of `crewValue`, is the modelling step that does not survive contact with `composePage`. */

import { rhoFor, carryFor, missFor, chainAfterTarget } from '../site/js/job/econ.js';
import { bandFor, drawRung, ownDueReviewIndices, makeOf, STEADY as CREW_STEADY } from '../site/js/job/crew.js';
import { updateSkill } from '../site/js/mastery.js';
import { composePage } from '../site/js/page.js';
import { applyOutcome as applySchedule } from '../site/js/schedule.js';
import { cards as ALL_CARDS } from '../site/data/cards.js';
import { isBonus } from '../site/data/source-manifest.js';

const M_BANK = ALL_CARDS.filter((c) => !isBonus(c.id));

/**
 * A seeded save that composes a real 10-target board.
 * `tag` is the seed STRING: the shipped corpus is `j4|align|measured`, and §6.3 varies nothing but
 * this to show what the measurement does and does not depend on.
 */
function boardSave(i, tag = 'j4|align|measured') {
  const R = mulberry32(cyrb53(`${tag}|${i}`) >>> 0);
  const s = fresh(NOW - 30 * DAY);
  s.profileId = `align-m-${i}`;
  s.settings.testDate = '2026-09-30';
  s.xp = 4000;
  for (const id of SKILL_IDS) {
    s.skills[id] = { m: Math.round(R.next() * 100), n: 5 + Math.floor(R.next() * 4), lastAt: NOW - DAY, misses: 1 };
  }
  const n = Math.floor(M_BANK.length * (0.4 + 0.4 * R.next()));
  for (let k = 0; k < n; k++) {
    const c = M_BANK[Math.floor(R.next() * M_BANK.length)];
    const rec = applySchedule(s, c.id, R.next() < 0.75 ? 'clean' : 'retry', { now: NOW - (1 + Math.floor(R.next() * 25)) * DAY });
    rec.cleared = true;
    rec.rarity = 'gold';
    if (R.next() < 0.45) rec.due = NOW - Math.floor(R.next() * 6) * DAY;
  }
  return s;
}

/**
 * One job's total take under the shipped rules, with `rankOf` deciding the crew on each target.
 * Deterministic in `seed`, so two arms can be run on identical rungs (common random numbers).
 */
function realisedTake(queue, save, rankOf, seed) {
  const rng = mulberry32(cyrb53(seed) >>> 0);
  const own = ownDueReviewIndices(queue);
  const rungs = queue.map((t) => drawRung(bandFor(save.skills?.[makeOf(t)]?.m ?? 50), rng.next()));
  let total = 0; let loose = 0; let chain = 0;
  for (let i = 0; i < queue.length; i++) {
    const t = queue[i];
    const rank = rankOf(t);
    const idle = rank > 0 && own.get(makeOf(t)) === i;      // G2's idle rule, exactly
    const eff = idle ? 0 : rank;
    const d = rhoFor(rungs[i], eff) > 0
      ? carryFor({ ...t, tier: t.tier ?? 1 }, 50, chain, rungs[i], eff)
      : missFor({ ...t, tier: t.tier ?? 1 }, 50, chain, loose, eff);
    loose = Math.max(0, loose + d);
    total += d;
    chain = chainAfterTarget(rungs[i], eff, chain, { idle });
  }
  return total;
}

const REPS = 8;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const sd = (xs) => (xs.length > 1 ? Math.sqrt(xs.reduce((t, v) => t + (v - mean(xs)) ** 2, 0) / (xs.length - 1)) : 0);

/**
 * ONE corpus of boards, with the realised payoff gradient and the realised ΔReadiness measured on
 * every one of the nineteen makes.
 *
 * `saveTag` / `repTag` are the two seed STRINGS; §6.3 varies nothing but those two.
 *
 * ROUND-2 VERIFY, crew-alignment finding 3 — THE BOARD IS THE ONE A JOB IS PLAYED ON.
 * This used to be `composePage(s).queue.slice(0, 10)`: Today's Page, truncated to ten items. No job
 * is ever played on that. A job's board is `composeBundles → draftUnion(picks).queue` — the path
 * §7's own 300-board corpus (line ~1120) has always used — and the draft is a SELECTION, so the ten
 * targets it picks are not the page's first ten. It changes the headline: the neighbourhood rate
 * §6.2 publishes is 43 % / 19 % on the page slice and **64 % / 32 %** on the board. G3.8's claim is
 * about the board a crew point is spent on, so the board is what §6 measures now; `board: 'page'`
 * keeps the old corpus, and it is asserted BESIDE the shipped one (§6.2b) and labelled as Today's
 * Page rather than as the board, so the two readings can never be confused again.
 */
function corpusOf({ saveTag = 'j4|align|measured', repTag = 'j4|align|rep', boards = 100, board = 'drafted' } = {}) {
  const BOARDS = [];
  for (let i = 0; BOARDS.length < boards && i < boards * 4; i++) {
    const s = boardSave(i, saveTag);
    const page = composePage(s, { now: NOW });
    if (page.queue.length < 8) continue;
    if (board === 'page') { BOARDS.push({ src: i, save: s, queue: page.queue.slice(0, 10) }); continue; }
    /* the shipped draft: the bundles the board offers, and the union of the ones a player takes */
    const b = composeBundles(s, { now: NOW, page, shape: 'JOB', seed: `${saveTag}|JOB|${i}` });
    if (!b.bundles?.length) continue;
    const picks = b.bundles.slice(0, Math.max(1, b.draft)).map((x) => x.id);
    const queue = draftUnion(b.bundles, picks).queue;
    if (!queue?.length) continue;
    BOARDS.push({ src: i, save: s, queue });
  }

  /** per board: { gain: make → Δ realised take of one STEADY point, dR: make → ΔReadiness } */
  const ROWS = BOARDS.map(({ src, save, queue }, i) => {
    const gain = {}; const dR = {};
    const r0 = readiness(save).r;
    for (const id of SKILL_IDS) {
      let g = 0;
      for (let rep = 0; rep < REPS; rep++) {
        const seed = `${repTag}|${i}|${rep}`;
        g += realisedTake(queue, save, (t) => (makeOf(t) === id ? CREW_STEADY : 0), seed)
           - realisedTake(queue, save, () => 0, seed);
      }
      gain[id] = g / REPS;
      const after = { ...save, skills: { ...save.skills, [id]: updateSkill(save.skills[id], 100, { at: NOW, dueReview: true }) } };
      dR[id] = readiness(after).r - r0;
    }
    return { src, save, queue, gain, dR, served: SKILL_IDS.filter((id) => gain[id] !== 0) };
  });

  /** The population-level gradient: what a crew point on this make returns over the whole corpus. */
  const GAIN = Object.fromEntries(SKILL_IDS.map((id) => [id, ROWS.reduce((t, r) => t + r.gain[id], 0)]));
  const DR = Object.fromEntries(SKILL_IDS.map((id) => [id, ROWS.reduce((t, r) => t + r.dR[id], 0)]));
  const SERVED = SKILL_IDS.filter((id) => GAIN[id] !== 0);
  return {
    ROWS, GAIN, DR, SERVED,
    rAll: spearman(SKILL_IDS.map((id) => GAIN[id]), SKILL_IDS.map((id) => DR[id])),
    rServed: spearman(SERVED.map((id) => GAIN[id]), SERVED.map((id) => DR[id])),
  };
}

/**
 * PER BOARD, not per corpus: how often is the board's best-paying make also near the top of that
 * board's own ΔReadiness order?
 *
 * `pop` picks the comparison population, and the choice is the whole argument of finding 3:
 *   · `'all'`    — all nineteen makes, which is the population §6 correlates and the honest one.
 *   · `'served'` — only the makes this board serves, which cannot fail for the interesting reason:
 *                  restricted supply IS the thing that breaks alignment, and with ~5 candidates a
 *                  top-three hit is ≈ 60 % by chance.
 * Boards whose every make returned 0 order nothing and are not counted either way.
 */
function neighbourhoodRates(ROWS, pop) {
  let top3 = 0; let arg = 0; let n = 0;
  for (const r of ROWS) {
    const ids = pop === 'served' ? r.served : SKILL_IDS;
    if (!ids.length || !ids.some((id) => r.gain[id] !== 0)) continue;
    n++;
    const best = ids.reduce((a, b) => (r.gain[a] >= r.gain[b] ? a : b));
    const byStudy = ids.slice().sort((a, b) => r.dR[b] - r.dR[a]);
    if (byStudy.indexOf(best) < 3) top3++;
    if (byStudy[0] === best) arg++;
  }
  return { n, top3, arg, top3pct: Math.round(100 * top3 / n), argpct: Math.round(100 * arg / n) };
}

describe('J4 · align · 6 · the MEASURED gradient: realised payoff vs realised ΔReadiness', () => {
  const SHIPPED = corpusOf();
  const { ROWS, GAIN, DR, SERVED } = SHIPPED;
  /* The retired corpus — Today's Page truncated to ten. §6.2b asserts its figures and §6.2c checks
     the document attributes them to it; building it once costs ~2 s and neither arm may build a
     DIFFERENT one, or the two would be comparing different corpora under one name. */
  let pageCorpus = null;
  const pageSlice = () => (pageCorpus ??= corpusOf({ board: 'page' }));

  if (process.env.J4_PRINT) {
    console.log(`align5: boards ${ROWS.length}, served makes ${SERVED.length}/19, ` +
      `ρ(all) ${spearman(SKILL_IDS.map((id) => GAIN[id]), SKILL_IDS.map((id) => DR[id])).toFixed(4)}, ` +
      `ρ(served) ${spearman(SERVED.map((id) => GAIN[id]), SERVED.map((id) => DR[id])).toFixed(4)}`);
    for (const id of SKILL_IDS.slice().sort((a, b) => GAIN[b] - GAIN[a])) {
      console.log(`  ${id.padEnd(11)} w${String(weightOf(id)).padStart(2)}  gain ${GAIN[id].toFixed(1).padStart(10)}  ΔR ${DR[id].toFixed(2).padStart(9)}`);
    }
  }

  test('the population is real: 100 composed boards, and the crew point moves real money', () => {
    assert.equal(ROWS.length, 100);
    assert.ok(SERVED.length >= 6, `only ${SERVED.length} of 19 makes returned anything over the whole corpus`);
    assert.ok(ROWS.some((r) => r.served.length >= 2), 'no board served two makes');
    // ΔReadiness is a REAL delta, and it is not flat
    for (const r of ROWS.slice(0, 10)) {
      const vals = SKILL_IDS.map((id) => r.dR[id]);
      assert.ok(Math.max(...vals) > Math.min(...vals) + 1e-9, 'ΔReadiness is flat — nothing is being ordered');
    }
  });

  test('AT MOST A HANDFUL OF MAKES CAN PAY AT ALL — the supply ceiling, per board', () => {
    // The fact that reframes the build decision. A crew point returns something only on a make the
    // board serves TWICE or more: the make's own due review is idle by G2, so a make with one
    // target pays nothing. On a 10-target board that leaves two to four candidates out of 19.
    const counts = ROWS.map((r) => r.served.length);
    assert.ok(Math.max(...counts) <= 8, `a board served ${Math.max(...counts)} makes — the ceiling has moved`);
    assert.ok(mean(counts) < 6, `mean ${mean(counts).toFixed(2)} makes per board return anything to a crew point`);
    assert.ok(mean(counts) >= 1, `mean ${mean(counts).toFixed(2)} — if this reaches 0 the measurement is broken`);
    // and `crewOrder` — the list the crew grid prints — is over all nineteen regardless
    assert.equal(crewOrder(ROWS[0].save).length, SKILL_IDS.length);
  });

  test('THE HONEST NUMBER: the orderings agree in DIRECTION, and it is not the identity\'s ρ = 1', () => {
    const rAll = SHIPPED.rAll;
    const rServed = SHIPPED.rServed;
    assert.ok(rAll > 0.4, `ρ over all 19 makes is ${rAll.toFixed(4)}`);
    assert.ok(rAll < 0.99, `ρ over all 19 makes is ${rAll.toFixed(4)} — §1's ρ = 1 is the MODEL's, not the game's`);
    /* ROUND 2, finding 4: `rServed > 0.15` used to live here. It is a hardcoded constant checked
       against a hardcoded constant — the SAME generator with a different seed string fails it on a
       third of re-seeds (§6.3 runs 24 of them). It is recorded, not asserted; §6.3 carries the
       claim, on the distribution. */
    assert.ok(Number.isFinite(rServed), `ρ over the ${SERVED.length} served makes is ${rServed.toFixed(4)}`);
    assert.ok(rServed < 0.95,
      `ρ over the served makes is ${rServed.toFixed(4)} — the realised payoff gradient and ΔReadiness do NOT `
      + 'induce the same order, because `encounters_i ∝ w_i` (crewValue\'s middle factor) is not what composePage supplies');
    // the top of one list is in the top half of the other — the claim that survives measurement
    const bestGame = SERVED.reduce((a, b) => (GAIN[a] >= GAIN[b] ? a : b));
    const byStudy = SKILL_IDS.slice().sort((a, b) => DR[b] - DR[a]);
    assert.ok(byStudy.indexOf(bestGame) < SKILL_IDS.length / 2,
      `the game's best make (${bestGame}) is ranked ${byStudy.indexOf(bestGame) + 1} of 19 by ΔReadiness`);
    /* …and one corpus-level comparison is ONE sample, which is why §6.2 exists: the per-board rate
       the header sells is measured over 100 boards, not read off this single aggregated ordering.
       ROUND-2 VERIFY: both numerals moved when the corpus moved off Today's Page and onto the board
       a job is drafted on (finding 3) — they are the DRAFTED board's, re-measured, not inherited. */
    assert.equal(bestGame, 'NOTE');
    assert.equal(byStudy.indexOf(bestGame) + 1, 4, 'the corpus argmax ranks 4th of 19 by total ΔReadiness');
  });

  /* ---------------------------------------------------------------------------------------------
     §6.2 — THE NEIGHBOURHOOD RATE, computed rather than claimed.  (round 2, crew-alignment #3)

     The header of this section used to assert nothing and claim two numbers — "top three on 97 % of
     boards", "exact argmax 42 %" — that do not reproduce under any reading of this file's own
     generator, seeds and `realisedTake`.

     ROUND-2 VERIFY (crew-alignment finding 3) — AND THE BOARD IS THE DRAFTED ONE NOW. The 43 % /
     19 % this arm published were measured on `composePage().queue.slice(0, 10)`: Today's Page, cut
     to ten, which is not a board any job is played on. On the board the shipped draft actually
     deals (`composeBundles → draftUnion`) the same generator, the same seeds and the same
     `realisedTake` give **58 %** and **20 %**. The page-slice figures are kept — §6.2b — because
     they are the ones COMPOSED-GAME published and the difference between the two IS the finding,
     but they are labelled there as Today's Page and no longer as the board.
     --------------------------------------------------------------------------------------------- */
  test('§6.2 THE NEIGHBOURHOOD, per DRAFTED board: top-three 58 %, exact argmax 20 % over all nineteen makes', () => {
    const all = neighbourhoodRates(ROWS, 'all');
    const served = neighbourhoodRates(ROWS, 'served');
    if (process.env.J4_PRINT) {
      console.log(`align6.2  all 19  top3 ${all.top3}/${all.n} = ${all.top3pct}%  argmax ${all.arg}/${all.n} = ${all.argpct}%`);
      console.log(`align6.2  served  top3 ${served.top3}/${served.n} = ${served.top3pct}%  argmax ${served.arg}/${served.n} = ${served.argpct}%`);
    }
    const moved = ' — if this has moved, recompute it, put the new number in this section’s header '
      + 'and in COMPOSED-GAME G3.8, and do not leave the header saying something the file no longer measures';
    assert.equal(all.n, 100, 'every board in the corpus is counted');
    assert.equal(all.top3pct, 58, `the top-three rate over all nineteen makes${moved}`);
    assert.equal(all.argpct, 20, `the exact-argmax rate over all nineteen makes${moved}`);

    /* The only reading that gets near the retracted 97 % restricts the comparison to the makes the
       board serves — which is circular, because restricted supply is the defect being measured. It
       is asserted so the two readings can never be confused again, and bounded against chance. */
    assert.equal(served.top3pct, 91, `the served-only top-three rate${moved}`);
    assert.equal(served.argpct, 44, `the served-only argmax rate${moved}`);
    const meanServed = mean(ROWS.map((r) => r.served.length));
    assert.ok(meanServed < 6, `mean ${meanServed.toFixed(2)} served makes per board`);
    const byChance = mean(ROWS.filter((r) => r.served.length).map((r) => Math.min(3, r.served.length) / r.served.length));
    assert.ok(served.top3pct / 100 - byChance < 0.45,
      `the served-only top-three rate (${served.top3pct} %) is barely above the ${(100 * byChance).toFixed(0)} % a coin gets `
      + 'on a list that short — which is why the honest headline is the all-nineteen rate');
    // 20 % is what the theorem earns on the exact argmax; it is not near the ρ = 1 of §1.
    assert.ok(all.argpct < 3 * all.top3pct / 4, 'the neighbourhood claim is much stronger than the argmax claim');
  });

  /* ---------------------------------------------------------------------------------------------
     §6.2b — THE PAGE-SLICE CORPUS, kept and LABELLED.  (round-2 verify, crew-alignment finding 3)

     The published 43 % / 19 % are reproduced here, from the same generator with `board: 'page'`, so
     the retired figures stay machine-checked and the DIFFERENCE between the two boards is asserted
     rather than described. Every number in this arm is Today's Page truncated to ten items: it is
     the study plan's own ordering of the day, not the board a crew point is spent on, and G3.8's
     claim is about the board. If COMPOSED-GAME still prints 43/19 as "the board", it is quoting
     this arm's corpus under §6.2's name.
     --------------------------------------------------------------------------------------------- */
  test('§6.2b Today’s Page, sliced to ten, is a DIFFERENT board — and it is where 43 % / 19 % came from', () => {
    const page = pageSlice();
    const all = neighbourhoodRates(page.ROWS, 'all');
    const served = neighbourhoodRates(page.ROWS, 'served');
    if (process.env.J4_PRINT) {
      console.log(`align6.2b page-slice  all 19  top3 ${all.top3pct}%  argmax ${all.argpct}%  |  served top3 ${served.top3pct}%  argmax ${served.argpct}%  |  ρ(all) ${page.rAll.toFixed(4)}`);
    }
    assert.equal(all.n, 100);
    assert.equal(all.top3pct, 43, 'the page-slice top-three rate — the figure COMPOSED-GAME published');
    assert.equal(all.argpct, 19, 'the page-slice argmax rate — the other published figure');
    assert.equal(served.top3pct, 99);
    assert.equal(served.argpct, 57);

    /* …and the two boards really are different populations, which is the whole of finding 3: the
       draft is a SELECTION over bundles, so it is not the page's first ten items in any order. */
    const drafted = neighbourhoodRates(ROWS, 'all');
    assert.ok(drafted.top3pct - all.top3pct >= 10,
      `the drafted board scores ${drafted.top3pct} % against the page slice's ${all.top3pct} % — if these have `
      + 'converged, one of the two corpora has stopped being what its name says');
    assert.ok(page.rAll < SHIPPED.rAll,
      `ρ(all) is ${page.rAll.toFixed(4)} on the page slice and ${SHIPPED.rAll.toFixed(4)} on the board`);
    /* compared on the SAME SAVE: the two corpora skip different seeds (a save can compose a page
       and draft no bundles), so row i of one is not row i of the other. `src` is the seed index. */
    const bySrc = new Map(page.ROWS.map((r) => [r.src, r]));
    const pairs = ROWS.filter((r) => bySrc.has(r.src));
    assert.ok(pairs.length >= 80, `only ${pairs.length} of ${ROWS.length} drafted boards have a page-slice twin`);
    const ids = (q) => JSON.stringify(q.map((t) => t.id));
    const sameQueue = pairs.filter((r) => ids(r.queue) === ids(bySrc.get(r.src).queue)).length;
    assert.ok(sameQueue <= 5,
      `${sameQueue} of ${pairs.length} saves drafted exactly the page's first ten, in order — these are one corpus, not two`);
  });

  /* ---------------------------------------------------------------------------------------------
     §6.2c — THE ATTRIBUTION LINT.  (VERIFY ROUND 3, crew-alignment + spec-fidelity, BLOCKER)

     §6.2b has said in writing since round 2: *"If COMPOSED-GAME still prints 43/19 as 'the board',
     it is quoting this arm's corpus under §6.2's name."* It did, at four sites — G3.8's "What is a
     MEASUREMENT", G8's J4 acceptance row, G9 #5 and G12 #53 — for a full round, and the retired
     ρ(all) = 0.65 with them (which was never a mean over 24 corpora at all, but this arm's single
     corpus's ρ(all) = 0.6546). A sentence in a test header cannot stop that; an assertion can.

     The rule: a line of the authority that puts a page-slice numeral beside §6.2 or §6.3 must also
     say, on that same line, which corpus it is. The retired figures stay quotable — they are the
     finding — but never unlabelled. The shipped numerals are computed here, not typed, so the lint
     moves with the arms above it.
     --------------------------------------------------------------------------------------------- */
  test('§6.2c COMPOSED-GAME attributes each figure to the arm that asserts it, not to §6.2’s name', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const path = await import('node:path');
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const DOC = readFileSync(path.join(root, 'COMPOSED-GAME.md'), 'utf8');

    const board = neighbourhoodRates(ROWS, 'all');
    const served = neighbourhoodRates(ROWS, 'served');
    const slice = neighbourhoodRates(pageSlice().ROWS, 'all');

    /* (a) the shipped figures are IN the document — if §6.2 moves, this fails and the document is
       the thing that has to change, which is what §6.2's own "moved" message already asks for. */
    for (const [n, what] of [[board.top3pct, 'the drafted top-three rate'], [board.argpct, 'the drafted argmax rate'],
      [served.top3pct, 'the served-only top-three rate'], [served.argpct, 'the served-only argmax rate']]) {
      assert.ok(DOC.includes(`${n} %`),
        `${what} (${n} %) appears nowhere in COMPOSED-GAME.md — §6.2 measures it and the document publishes something else`);
    }
    assert.ok(/ρ\(all\) = 0\.83/.test(DOC),
      'the document does not publish §6.3\'s mean ρ(all) = 0.83 anywhere');

    /* (b) …and no line attributes a PAGE-SLICE figure to the shipped arms without naming the slice.
       `labelled` is deliberately generous — any of the three ways this document names that corpus
       counts — because the requirement is that a reader can tell which board is meant, not that a
       particular phrase is used. */
    const labelled = (line) => /6\.2b|Today's Page|Today’s Page|page[- ]slice/i.test(line);
    const slicePair = new RegExp(`\\*\\*${slice.top3pct} %\\*\\*|${slice.top3pct} % / ${slice.argpct} %|${slice.top3pct} % top-three`);
    const offenders = [];
    for (const line of DOC.split('\n')) {
      if (!/§6\.2|§6\.3/.test(line)) continue;
      if (slicePair.test(line) && !labelled(line)) offenders.push(`page-slice ${slice.top3pct}/${slice.argpct}: ${line.slice(0, 160)}`);
      if (/ρ\(all\) = 0\.65/.test(line) && !labelled(line)) offenders.push(`the page slice's ρ(all): ${line.slice(0, 160)}`);
    }
    assert.deepEqual(offenders, [],
      'COMPOSED-GAME quotes §6.2b\'s corpus under §6.2 / §6.3\'s name — the page slice is '
      + '`composePage(s).queue.slice(0, 10)` and no job is ever played on it');

    /* (c) the control: the lint can fail. The exact sentence that shipped for a round is caught. */
    const bad = `§6.2 correlates … the game's best crew point is in the study plan's top three on **${slice.top3pct} %** of boards`;
    assert.ok(/§6\.2|§6\.3/.test(bad) && slicePair.test(bad) && !labelled(bad),
      'the lint above would not have caught the sentence it exists to catch');
  });

  /* ---------------------------------------------------------------------------------------------
     §6.3 — THE DISTRIBUTION, not one corpus.  (round 2, crew-alignment #4)

     `rServed > 0.15` was the only positive alignment claim §6 made, and it was a property of one
     seed string. 24 independent corpora — same generator, same recipe, same 100 boards, only the
     seed strings changed — put ρ(served) anywhere between −0.07 and 0.61 on the page slice and
     between 0.17 and 0.78 on the drafted board. With ~10 served makes the standard error of a
     Spearman ρ is ≈ 1/√9 = 0.33, so no single corpus can carry this claim.
     What survives is the MEAN, and the fact that ρ over all nineteen makes barely moves at all.

     ROUND-2 VERIFY: every figure below is re-measured on the DRAFTED board (finding 3). ρ(all) went
     from mean 0.65 on the page slice to **0.8334 ± 0.0305**, ρ(served) from 0.30 to **0.595**, and
     the supply ceiling from ~9.6 served makes to 10.71 — the job's own board is BETTER aligned with
     the study plan than Today's Page truncated to ten, not worse.
     --------------------------------------------------------------------------------------------- */
  describe('§6.3 · the claim aggregated over 24 independent corpora', () => {
    const K = 24;
    const CORPORA = Array.from({ length: K }, (_, k) =>
      corpusOf({ saveTag: `j4|align|corpus|${k}`, repTag: `j4|align|corpusrep|${k}` }));
    const rAlls = CORPORA.map((c) => c.rAll);
    const rServeds = CORPORA.map((c) => c.rServed);

    const RATES = CORPORA.map((c) => neighbourhoodRates(c.ROWS, 'all'));
    const top3s = RATES.map((r) => r.top3pct);
    const args = RATES.map((r) => r.argpct);
    const servedCounts = CORPORA.map((c) => c.SERVED.length);

    if (process.env.J4_PRINT) {
      console.log(`align6.3  rAll    mean ${mean(rAlls).toFixed(4)} sd ${sd(rAlls).toFixed(4)} [${Math.min(...rAlls).toFixed(3)}, ${Math.max(...rAlls).toFixed(3)}]`);
      console.log(`align6.3  rServed mean ${mean(rServeds).toFixed(4)} sd ${sd(rServeds).toFixed(4)} [${Math.min(...rServeds).toFixed(3)}, ${Math.max(...rServeds).toFixed(3)}]`);
      console.log(`align6.3  rServed sorted ${rServeds.slice().sort((a, b) => a - b).map((v) => v.toFixed(3)).join(' ')}`);
      console.log(`align6.3  top3    mean ${mean(top3s).toFixed(2)} sd ${sd(top3s).toFixed(2)} [${Math.min(...top3s)}, ${Math.max(...top3s)}]`);
      console.log(`align6.3  argmax  mean ${mean(args).toFixed(2)} sd ${sd(args).toFixed(2)} [${Math.min(...args)}, ${Math.max(...args)}]`);
      console.log(`align6.3  served  mean ${mean(servedCounts).toFixed(2)} [${Math.min(...servedCounts)}, ${Math.max(...servedCounts)}]`);
    }

    test('ρ over ALL NINETEEN makes is the robust half: mean 0.83, and no corpus falls below 0.7', () => {
      assert.equal(CORPORA.length, K);
      assert.ok(mean(rAlls) > 0.75 && mean(rAlls) < 0.90, `mean ρ(all) ${mean(rAlls).toFixed(4)} over ${K} corpora`);
      assert.ok(sd(rAlls) < 0.12, `sd ${sd(rAlls).toFixed(4)} — ρ(all) is a property of the game, not of the seed`);
      assert.ok(Math.min(...rAlls) > 0.7,
        `the worst of ${K} corpora is ${Math.min(...rAlls).toFixed(4)} — this is the direction claim that survives re-seeding`);
      assert.ok(Math.max(...rAlls) < 0.95, 'and it is never the identity');
    });

    /* ROUND-2 VERIFY — the neighbourhood rate is a DISTRIBUTION too, for the same reason ρ is. §6.2
       asserts one corpus's 58 % / 20 %; those two numerals are a seed's, and the critic who found
       the page-slice defect measured 64 % / 32 % with their own draft seed. Both are inside the
       band this arm asserts, which is the honest shape of the claim: the rate is ~61 ± 6 and the
       argmax ~29 ± 5 across independent corpora, and the whole band sits far above the page-slice
       43 % / 19 % §6.2b keeps. A published headline has to be the band, not one draw. */
    test('…and so is the NEIGHBOURHOOD rate: top-three 61 % ± 6, exact argmax 29 % ± 5 across corpora', () => {
      assert.ok(mean(top3s) > 55 && mean(top3s) < 68, `mean top-three ${mean(top3s).toFixed(2)} % over ${K} corpora`);
      assert.ok(mean(args) > 23 && mean(args) < 35, `mean argmax ${mean(args).toFixed(2)} % over ${K} corpora`);
      assert.ok(sd(top3s) < 12 && sd(args) < 12,
        `sd ${sd(top3s).toFixed(2)} / ${sd(args).toFixed(2)} — the per-board rate is a property of the draft, not of the seed`);
      assert.ok(Math.min(...top3s) > 43,
        `the WORST of ${K} corpora scores ${Math.min(...top3s)} % on the drafted board — at or below the page slice's 43 %, `
        + 'the two boards can no longer be told apart by this measurement');
      /* THE TWO SEPARATIONS ARE NOT EQUALLY STRONG, and the weaker one is stated as what it is.
         Top-three: every one of the 24 corpora beats the page slice's 43 %, so that separation is a
         FLOOR. Exact argmax: the mean (28.6 %) beats the page slice's 19 % by many standard errors,
         but the worst corpus measures 18 % — the bands overlap, so that one is a MEAN and may not
         be quoted as "every board". */
      const seArg = sd(args) / Math.sqrt(K);
      assert.ok(mean(args) - 19 > 3 * seArg,
        `the mean argmax rate ${mean(args).toFixed(2)} % is not 3 se (${(3 * seArg).toFixed(2)}) clear of the page slice's 19 %`);
      assert.ok(Math.min(...args) < mean(args),
        `the worst corpus's argmax rate is ${Math.min(...args)} % against a mean of ${mean(args).toFixed(2)} % — quote the mean, not a floor`);
      // the §6.2 corpus is one draw from this distribution and must sit inside it
      const one = neighbourhoodRates(SHIPPED.ROWS, 'all');
      assert.ok(one.top3pct >= Math.min(...top3s) && one.top3pct <= Math.max(...top3s),
        `§6.2's ${one.top3pct} % is outside the [${Math.min(...top3s)}, ${Math.max(...top3s)}] the re-seeds produce`);
    });

    test('ρ over the SERVED makes is positive ON AVERAGE and much noisier than ρ(all)', () => {
      assert.ok(mean(rServeds) > 0.10,
        `mean ρ(served) ${mean(rServeds).toFixed(4)} ± ${(sd(rServeds) / Math.sqrt(K)).toFixed(4)} (se) over ${K} corpora`);
      // …and the spread is the finding: a floor on ONE corpus is a coin flip.
      assert.ok(sd(rServeds) > 0.10,
        `sd ${sd(rServeds).toFixed(4)} — if this collapses, the served-makes estimate has become stable and a floor could be asserted directly`);
      assert.ok(sd(rServeds) > 4 * sd(rAlls),
        `ρ(served) sd ${sd(rServeds).toFixed(4)} against ρ(all)'s ${sd(rAlls).toFixed(4)} — the served-makes reading is the `
        + 'unstable one, which is why the headline is the all-nineteen number');
      const below = rServeds.filter((r) => r <= 0.15).length;
      assert.ok(below <= K / 4,
        `${below} of ${K} corpora fall at or below 0.15 on the DRAFTED board — on the page slice a third of them did, `
        + 'and that is what retired the old `rServed > 0.15` floor; re-measure before restoring it');
      assert.ok(Math.min(...rServeds) < mean(rServeds) - 2 * sd(rServeds),
        `the worst corpus is ${Math.min(...rServeds).toFixed(4)} against a mean of ${mean(rServeds).toFixed(4)}: one corpus still `
        + 'cannot carry this claim');
      /* WHY one corpus cannot carry it, in one line: a Spearman ρ over n points has a standard
         error of about 1/√(n−1), and n here is the number of SERVED makes (~9.6), giving ≈ 0.35.
         The spread actually observed across the 24 corpora is the same order of magnitude, so the
         variation is sampling noise in ρ itself rather than a difference between the corpora. */
      const nServed = mean(CORPORA.map((c) => c.SERVED.length));
      const se = 1 / Math.sqrt(nServed - 1);
      assert.ok(sd(rServeds) > se / 4 && sd(rServeds) < se * 2,
        `the observed spread ${sd(rServeds).toFixed(3)} is not the order of 1/√(n−1) = ${se.toFixed(3)} `
        + `for n = ${nServed.toFixed(1)} served makes — something other than sampling noise is moving ρ(served)`);
    });

    test('the supply ceiling is not a property of the seed either', () => {
      const served = CORPORA.map((c) => c.SERVED.length);
      assert.ok(Math.max(...served) <= 13, `a corpus served ${Math.max(...served)} of 19 makes`);
      assert.ok(mean(served) < 12, `mean ${mean(served).toFixed(2)} of 19 makes ever return anything`);
    });
  });

  test('WHY they come apart: supply, not weakness — a make the board never serves returns zero', () => {
    let zeroButWorthStudying = 0;
    for (const id of SKILL_IDS) if (GAIN[id] === 0 && DR[id] > 0) zeroButWorthStudying++;
    assert.ok(zeroButWorthStudying > 0,
      'every make the corpus never served is still worth studying — that asymmetry is the whole finding');
    assert.equal(zeroButWorthStudying, SKILL_IDS.length - SERVED.length);
    // and the MODEL ranks them by weakness anyway: `crewValue` never asks what is on the board
    const zeroMakes = SKILL_IDS.filter((id) => GAIN[id] === 0);
    const anyInversion = zeroMakes.some((z) => SERVED.some((v) => crewValue(ROWS[0].save, z) > crewValue(ROWS[0].save, v)));
    assert.ok(anyInversion, 'crewValue orders a make the board does not serve above one it does');
  });

  test('the control: a SCRAMBLED gradient scores materially worse — the measurement can fail', () => {
    const d = SKILL_IDS.map((id) => DR[id]);
    const real = spearman(SKILL_IDS.map((id) => GAIN[id]), d);
    const rots = [];
    for (let rot = 1; rot < SKILL_IDS.length; rot++) {
      rots.push(spearman(SKILL_IDS.map((_, k) => GAIN[SKILL_IDS[(k + rot) % SKILL_IDS.length]]), d));
    }
    assert.ok(real > mean(rots) + 0.3,
      `real ρ ${real.toFixed(4)} vs the mean of ${rots.length} rotations ${mean(rots).toFixed(4)} — the correlation is about the makes`);
    assert.ok(Math.max(...rots) < real, 'and no rotation beats the real pairing');
  });
});

/* =========================================================================================
   7. VERIFY-1 — WHAT THE BRIEF WINDOW PRINTS, AT THE ONE SURFACE THAT CAN SPEND A POINT
   =========================================================================================

   The round-3 critic's BLOCKER, measured here so it cannot come back. `screens/job.js crewBlock`
   prints, beside three live rung buttons:

       `a HELD point prices at ${n2(align.threshold)} on this list's own scale`
       ` — the study ordering ${align.holds ? 'leads it' : 'is outbid by it'}`

   and both halves came out of `crew.heldValue` → `matrixParamsFor` → `data/job.js CREW_MATRIX`,
   whose JOB row still carries `{eHeld: 5, pChain3: 0.42, mSaved: 3}` — the three parameters
   COMPOSED-GAME.md G2 publishes as measured-false, in the same document that says (G2, "What is
   dominant") *"a point spent as STEADY beats a HELD upgrade on every shape the composer deals, by
   more than 4× on each"*. The app and its authority contradicted each other at the point of
   decision, and the app was the half that was wrong.

   `alignmentFor` now prices both rungs on the board (`steadyValueOn` / `heldValueOn`) at parameters
   measured on that same board (`measuredParamsOn`). The three arms below assert, in order: that the
   shipped call is the board-priced one, what it now prints, and — the control, without which this
   section could not fail — that the published-parameter price it replaced really is the number the
   critic measured.

   Nothing here weakens: the OLD number is recomputed from the shipped `heldValue`/`crewValue`, so if
   a later change puts the document's constants back on this surface both the control arm and the
   measurement arm fail together. */

const R7_BANK = M_BANK;   // §6's card bank — the same non-bonus pool

/** The r13/S4 population: seeded, spread across the unit, with real card history. */
function r7Save(i) {
  const R = mulberry32(cyrb53(`j4|save|${i}`) >>> 0);
  const rng = () => R.next();
  const s = fresh(NOW - (10 + Math.floor(rng() * 40)) * DAY);
  s.profileId = `j4-${i}`;
  s.settings.testDate = '2026-09-30';
  const u = 0.3 + 0.7 * rng();
  s.xp = Math.floor(u * u * 12000);
  for (const id of SKILL_IDS) {
    if (rng() < 0.10) continue;
    const m = Math.max(0, Math.min(100, Math.round(100 * u * (0.55 + 0.6 * rng()))));
    const n = 2 + Math.floor(rng() * 7);
    const rec = { m, n, lastAt: NOW - Math.floor(rng() * 10) * DAY,
      misses: rng() < 0.5 ? 1 + Math.floor(rng() * 2) : 0, helped: rng() < 0.4 ? 1 : 0 };
    if (m >= 85 && n >= 3 && rng() < 0.8) rec.lastDueCorrectAt = NOW - Math.floor(1 + rng() * 6) * DAY;
    s.skills[id] = rec;
  }
  const nCards = Math.floor(R7_BANK.length * u * (0.4 + 0.6 * rng()));
  for (let k = 0; k < nCards; k++) {
    const c = R7_BANK[Math.floor(rng() * R7_BANK.length)];
    const out = rng() < 0.75 ? 'clean' : (rng() < 0.6 ? 'hints' : 'retry');
    const rec = applySchedule(s, c.id, out, { now: NOW - (1 + Math.floor(rng() * 25)) * DAY });
    rec.cleared = true; rec.attempts = 1; rec.rarity = 'gold';
    if (rng() < 0.45) rec.due = NOW - Math.floor(rng() * 6) * DAY;
  }
  for (const b of bosses) if (rng() < u * 0.6) s.trophies[`boss:${b.id}`] = NOW;
  return s;
}

/** 300 boards drafted through the shipped path — `composePage → composeBundles → draftUnion`. */
const BOARDS = (() => {
  const out = [];
  for (let i = 0; out.length < 300 && i < 1200; i++) {
    const s = r7Save(i);
    const page = composePage(s, { now: NOW });
    if (!page.queue.length) continue;
    const b = composeBundles(s, { now: NOW, page, shape: 'JOB', seed: `j4|r13|JOB|${i}` });
    if (!b.bundles?.length) continue;
    const picks = b.bundles.slice(0, Math.max(1, b.draft)).map((x) => x.id);
    const queue = draftUnion(b.bundles, picks).queue;
    if (!queue?.length) continue;
    const onBoard = [...new Set(queue.map((t) => makeOf(t)).filter(Boolean))];
    if (!onBoard.length) continue;
    out.push({ i, save: s, queue, onBoard });
  }
  return out;
})();

describe('J4 · align · 7 · verify-1: the brief prices the BOARD, not data/job.js CREW_MATRIX', () => {
  test('the corpus is the drafted path, and the shipped call is the board-priced one', () => {
    assert.ok(BOARDS.length >= 250, `${BOARDS.length} drafted JOB boards`);
    for (const { save, queue, onBoard } of BOARDS.slice(0, 40)) {
      const a = alignmentFor(save, { shape: 'JOB', of: onBoard, queue });
      assert.equal(a.pricedOn, 'board', 'a call WITH a queue prices on the board');
      assert.equal(a.params.source, 'board', 'and its parameters were measured on that board');
      assert.equal(alignmentFor(save, { shape: 'JOB', of: onBoard }).pricedOn, 'model',
        'and a call WITHOUT one is still the population model, unchanged since r1');
    }
  });

  test('THE MEASUREMENT: the printed HELD price, and how often it says the dominated rung wins', () => {
    let spoke = 0; let outbid = 0; let sumT = 0;
    let oldSpoke = 0; let oldOutbid = 0; let oldSumT = 0;
    for (const { save, queue, onBoard } of BOARDS) {
      const a = alignmentFor(save, { shape: 'JOB', of: onBoard, queue });
      if (a.held) {
        spoke++; sumT += a.threshold;
        if (!a.holds) outbid++;
        // the line is internally consistent: what it prints IS the comparison it reports
        close(a.threshold * shapeConstant(a.params), a.held.value, 1e-9, 'threshold × k = the HELD price');
        assert.equal(a.holds, a.steadyThreshold >= a.threshold, 'and `holds` is those two numbers');
      }
      /* THE CONTROL — the same grid priced the way it was priced before this fix: `heldValue` and
         `crewValue`, straight off CREW_MATRIX. If this arm ever stops finding the defect, the
         measurement above has stopped measuring anything. */
      const opts = buildOptions(save, { shape: 'JOB', of: onBoard });
      const oldHeld = opts.find((o) => o.rank === HELD) ?? null;
      const oldSteady = opts.find((o) => o.rank === STEADY) ?? null;
      if (oldHeld) {
        oldSpoke++; oldSumT += oldHeld.value / shapeConstant('JOB');
        if (!(oldSteady && oldSteady.value >= oldHeld.value)) oldOutbid++;
      }
    }
    const meanT = sumT / spoke;
    const oldMeanT = oldSumT / oldSpoke;
    if (process.env.J4_PRINT) {
      console.log(`  verify-1 brief | boards ${BOARDS.length} | speaks ${spoke}`
        + ` | mean threshold ${meanT.toFixed(4)} (published-parameter ${oldMeanT.toFixed(4)})`
        + ` | "outbid" ${outbid}/${spoke} (published-parameter ${oldOutbid}/${oldSpoke})`);
    }
    // (a) the control really does reproduce the critic's finding
    assert.ok(oldSpoke >= 30, `${oldSpoke} boards offered a HELD point at all`);
    assert.ok(oldOutbid / oldSpoke > 0.5,
      `priced from CREW_MATRIX the grid told the student the DOMINATED rung wins on only `
      + `${oldOutbid}/${oldSpoke} boards — the r3 BLOCKER measured 40/66, so this control has gone stale`);
    assert.ok(oldMeanT > 4,
      `the published-parameter price averaged ${oldMeanT.toFixed(3)} — the control expects ~6`);
    // (b) what ships now
    assert.ok(meanT < oldMeanT / 4,
      `board-priced mean ${meanT.toFixed(4)} vs published-parameter ${oldMeanT.toFixed(4)} — the `
      + 'over-pricing (measured at 13.2×) has to be gone, not trimmed');
    assert.ok(outbid / spoke < 0.15,
      `the grid still prints "the study ordering is outbid by it" on ${outbid}/${spoke} boards; `
      + 'COMPOSED-GAME.md G2 prices a STEADY point above a HELD upgrade by 4×–17× on every shape');
  });

  test('and on the board the two rungs are one comparison, not two regimes', () => {
    // G3.8 condition 2 (rank) used to be `heldValue` (a population model) against condition 3's
    // `supplyGapFor` (a board measurement). Both are board prices now — assert it numerically.
    let checked = 0;
    for (const { save, queue, onBoard } of BOARDS.slice(0, 60)) {
      const a = alignmentFor(save, { shape: 'JOB', of: onBoard, queue });
      if (!a.held || !a.steady) continue;
      checked++;
      close(a.held.value, heldValueOn(save, a.held.make, queue, { shape: a.params }), 1e-12,
        `${a.held.make}: the HELD side is heldValueOn at the board's own parameters`);
      close(a.steady.value, steadyValueOn(save, a.steady.make, queue, { shape: a.params }), 1e-12,
        `${a.steady.make}: and the STEADY side is steadyValueOn at the same parameters`);
      assert.equal(a.domain.rank, a.steady.value >= a.held.value);
    }
    assert.ok(checked >= 10, `only ${checked} boards offered both rungs`);
  });

  test('the board measurement is deterministic, and it is the board that moves it', () => {
    const { save, queue } = BOARDS[0];
    const p1 = measuredParamsOn(save, queue, { shape: 'JOB' });
    const p2 = measuredParamsOn(save, queue, { shape: 'JOB' });
    assert.deepEqual(p1, p2, 'same board, same parameters — every draw is seeded (BUILD-POLICY §2)');
    const pub = matrixParamsFor('JOB');
    assert.equal(p1.lootMean, pub.lootMean, 'the shape constants are kept');
    assert.notEqual(p1.pChain3, pub.pChain3, 'and the three measured-false ones are replaced');
    // an EMPTY board is not the population model dressed up as a measurement
    const empty = measuredParamsOn(save, [], { shape: 'JOB' });
    assert.equal(empty.source, 'published');
    assert.equal(heldValueOn(save, MAKES[0], [], { shape: 'JOB' }) >= 0, true);
  });
});

/* =========================================================================================
   8. VERIFY-1 — THE r3 COUNTEREXAMPLE TO G3.8, AND WHY IT CANNOT BE BUILT ON THE BOARD PATH
   =========================================================================================

   A critic hand-built a save on which all FOUR domain conditions are true and the board-true best
   crew point is still HELD on a mastered make. It worked because conditions 2 and 3 were evaluated
   in different pricing regimes — 2 against `CREW_MATRIX`, 3 against the board. The save is rebuilt
   here from its description and both regimes are priced, so the collapse is arithmetic. */

describe('J4 · align · 8 · verify-1: the two-regime counterexample, rebuilt and closed', () => {
  const T = (skill, role, tier = 1, key) => ({ skill, role, tier, key: key ?? `${skill}:${role}:${tier}` });

  /** The critic's save: 19 makes at n = 6, CS-LIN the one weak spot at m 41, CLASS mastered at m 90. */
  function counterSave() {
    const s = fresh(NOW - 20 * DAY);
    s.profileId = 'critT-counter';
    s.xp = 9000;
    for (const id of SKILL_IDS) s.skills[id] = { m: 75, n: 6, misses: 0, helped: 0, lastAt: NOW - DAY };
    s.skills['CS-LIN'] = { m: 41, n: 6, misses: 1, helped: 0, lastAt: NOW - DAY };
    s.skills['CLASS'] = { m: 90, n: 6, misses: 0, helped: 0, lastAt: NOW - DAY, lastDueCorrectAt: NOW - 2 * DAY };
    return s;
  }
  /* The critic's board: CS-LIN served twice, one of them its OWN due review (so the idle rule leaves
     it `act 1`), and CLASS served three times with none of them a review (`holdAct 3`). A 10-target
     JOB-10 with 3 of one make is legal under `LIMITS.sameSkillRun`. */
  const QUEUE = [
    T('CS-LIN', 'new'), T('CS-LIN', 'review'),
    T('CLASS', 'new'), T('CLASS', 'weak'), T('CLASS', 'new', 2, 'CLASS:n2'),
    T('VOC', 'review'), T('NOTE', 'review'), T('FAC2', 'review'), T('PAIRS', 'review'), T('SEG-ALG', 'review'),
  ];
  const ON_BOARD = [...new Set(QUEUE.map((t) => makeOf(t)))];

  test('the board is the one the finding describes, target for target', () => {
    const s = counterSave();
    assert.equal(canHold(s, 'CLASS'), true, 'CLASS is mastered, so a HELD point is buyable on it');
    assert.equal(canHold(s, 'CS-LIN'), false, 'and CS-LIN is not');
    const cs = encountersIn(QUEUE, 'CS-LIN');
    const cl = encountersIn(QUEUE, 'CLASS');
    assert.deepEqual([cs.active, cs.holdActive], [1, 1], 'CS-LIN: act 1 (its own due review is idle)');
    assert.deepEqual([cl.active, cl.holdActive], [3, 3], 'CLASS: act 3, holdAct 3');
    for (const id of SKILL_IDS) assert.ok(nOf(s, id) >= 5, `${id}: full evidence depth`);
    assert.ok(mOf(s, 'CS-LIN') > BAND_FLOOR, 'nothing sits in the flat tail below the band floor');
    assert.equal(crewOrder(s, { shape: 'JOB', of: ON_BOARD })[0], 'CS-LIN', 'the study plan puts CS-LIN first');
    assert.equal(crewOrder(s, { shape: 'JOB', of: ON_BOARD }).at(-1), 'CLASS', 'and CLASS last of all');
  });

  test('THE FINDING: two regimes certify a domain the board contradicts', () => {
    const s = counterSave();
    /* Condition 2 in its OLD regime — a POPULATION model on both sides (`crewValue` vs `heldValue`,
       both off CREW_MATRIX) — says the study argmax wins, and with it all four conditions pass. */
    const old = alignmentFor(s, { shape: 'JOB', of: ON_BOARD });
    /* VERIFY-2 (finding 6): `domain.band` reads BOTH clamps now, and this save's mastered CLASS sits
       at m 90 — in the top flat range, where `bandFor` pays a constant 0.0325 and `crewValue`'s
       model has fallen to 0.0269. So the band condition no longer passes here, on the same make
       that makes the save a counterexample. The three conditions that ARE about the two-regime hole
       are asserted individually, which is what this arm was always about. */
    assert.equal(old.domain.evidence, true, 'every candidate is at full evidence depth');
    assert.equal(old.domain.rank, true, 'and priced from the POPULATION the rank condition passes…');
    assert.equal(old.domain.supply, null, '…with supply unknown, because no queue was passed');
    assert.deepEqual(old.bandCeiled, ['CLASS'], 'the mastered make is in the top flat band');
    assert.equal(alignmentFor(s, { shape: 'JOB', of: ON_BOARD.filter((m) => m !== 'CLASS') }).domain.band,
      true, 'and it is the only candidate either clamp catches');
    assert.equal(old.best.rank, STEADY);
    assert.equal(old.best.make, 'CS-LIN');
    /* …while the BOARD's own prices, at the published parameters condition 3 already used, put the
       best point on the MASTERED make. That is the hole: a conjunction of conditions evaluated in
       two different pricing regimes does not imply the claim. */
    const boardSteady = Math.max(...ON_BOARD.map((mk) => steadyValueOn(s, mk, QUEUE, { shape: 'JOB' })));
    const boardHeld = Math.max(...ON_BOARD.map((mk) => heldValueOn(s, mk, QUEUE, { shape: 'JOB' })));
    assert.ok(boardHeld > boardSteady,
      `the board's best HELD ${boardHeld.toFixed(3)} outbids its best STEADY ${boardSteady.toFixed(3)} `
      + 'while the domain above certifies the opposite');
    // and the supply condition really is satisfied here — it is not doing the work
    assert.equal(alignmentFor(s, { shape: 'JOB', of: ON_BOARD, queue: QUEUE }).gap.agrees, true);
  });

  test('THE FIX: with both rungs on the board, the certification becomes SOUND — the argmax is the study argmax', () => {
    const s = counterSave();
    const a = alignmentFor(s, { shape: 'JOB', of: ON_BOARD, queue: QUEUE });
    assert.equal(a.pricedOn, 'board');
    // condition 2 is now the board's own comparison, so it is answering the same question as
    // condition 3 — and on this board the answer it gives is one the board agrees with
    assert.equal(a.best.rank, STEADY, 'the board-true argmax is a first rung, not a mastered upgrade');
    assert.equal(a.best.make, 'CS-LIN', 'on the one make the student is actually weak at');
    assert.equal(a.best.make, crewOrder(s, { shape: 'JOB', of: ON_BOARD })[0],
      'which IS readiness.weakSpots()\'s first make — the theorem, on the save built to break it');
    assert.equal(a.domain.rank, true);
    /* VERIFY-2 (finding 1). This arm used to assert `domain.all === true` and call that a
       certification. It is not one: `domain.rank && domain.supply` IS the claim restated (both are
       argmax comparisons over the same `steadyValueOn` and the same tie-break), and the other two
       conditions cannot move it. So what is asserted is the CLAIM — computed directly off
       `options[0]` — together with the equivalence, per board, and the band condition is reported
       rather than credited. */
    assert.equal(a.claim, true, 'the board-true best point IS a STEADY on the study plan\'s first make');
    assert.equal(a.claimIsConditions, true, 'and that is exactly `domain.rank && domain.supply`');
    assert.deepEqual(a.claimParts, { rank: true, supply: true });
    assert.equal(a.domain.band, false, 'while the band condition fails — on CLASS, at m 90, in the top clamp');
    assert.equal(a.domain.all, false,
      'so `domain.all` is FALSE on a board where the claim is TRUE: the conjunction is not the '
      + 'claim\'s domain, which is the whole of verify-2 finding 1');
    assert.ok(a.steady.value > a.held.value,
      `STEADY ${a.steady.value.toFixed(3)} against HELD ${a.held.value.toFixed(3)} — both board prices`);
  });

  test('…and the chain-hold half collapses once its two constants are measured on that board', () => {
    const s = counterSave();
    const pub = matrixParamsFor('JOB');
    const p = measuredParamsOn(s, QUEUE, { shape: 'JOB' });
    const heldPub = heldValueOn(s, 'CLASS', QUEUE, { shape: 'JOB' });
    const heldMeas = heldValueOn(s, 'CLASS', QUEUE, { shape: p });
    const steadyMeas = steadyValueOn(s, 'CS-LIN', QUEUE, { shape: p });
    if (process.env.J4_PRINT) {
      console.log(`  verify-1 counter | CLASS HELD published ${heldPub.toFixed(3)} -> measured ${heldMeas.toFixed(3)}`
        + ` | CS-LIN STEADY ${steadyMeas.toFixed(3)} | p3 ${p.pChain3.toFixed(3)} (pub ${pub.pChain3})`
        + ` mSaved ${p.mSaved.toFixed(3)} (pub ${pub.mSaved}) holds ${p.holds}/${p.samples}`);
    }
    assert.ok(heldMeas < heldPub,
      `the published constants over-price this rung: ${heldPub.toFixed(3)} against ${heldMeas.toFixed(3)}`);
    assert.ok(steadyMeas > heldMeas,
      `and measured, the STEADY point on the weak make ${steadyMeas.toFixed(3)} beats the HELD upgrade `
      + `${heldMeas.toFixed(3)} — which is what COMPOSED-GAME.md G2 publishes and what the app now says`);
    // the estimator is the reason: a rare hold priced at the MODEL's hold rate is the old error
    assert.ok(p.holds > 0, 'the board fired a chain-hold at least once, or there is nothing to price');
    assert.ok(p.mSavedPerHold > p.mSaved,
      'mean-of-ratios over a rare event reads high; the shipped parameter is the measured expectation');
  });
});


/* =========================================================================================
   9. VERIFY-1 — HOW OFTEN G3.8's FOUR-CONDITION DOMAIN IS REACHED AT ALL
   =========================================================================================

   COMPOSED-GAME.md G3.8 publishes the theorem as holding "only on
   `crew.alignmentFor(save, {shape, queue}).domain.all`" and publishes the off-domain figure, but
   nowhere publishes how often that domain is reached. It is reached on 0 % of drafted boards over
   the 19-make default pool and on ~1 % at the call the brief actually makes. Conditions 1 and 4 are
   universally quantified over the whole pool, so one untouched make or one weak spot at m ≤ 40
   empties the conjunction — and a student with no weak spot below 40 has nothing left to study.

   These are asserted, not printed, so the number cannot drift back into prose. */

describe('J4 · align · 9 · verify-1: the four-condition domain is a limit case, and here is the rate', () => {
  function rates(of) {
    const n = { evidence: 0, rank: 0, supply: 0, band: 0, all: 0, cAll: 0, cEvidence: 0, cBand: 0 };
    let boards = 0;
    for (const b of BOARDS) {
      const pool = of === 'board' ? b.onBoard : MAKES;
      const a = alignmentFor(b.save, { shape: 'JOB', of: pool, queue: b.queue });
      boards++;
      for (const key of ['evidence', 'rank', 'supply', 'band', 'all']) if (a.domain[key]) n[key]++;
      if (a.contenderDomain.all) n.cAll++;
      if (a.contenderDomain.evidence) n.cEvidence++;
      if (a.contenderDomain.band) n.cBand++;
    }
    return { boards, ...n };
  }

  test('THE REACHABILITY: domain.all over the 19-make pool, and at the brief\'s own call', () => {
    const all19 = rates('all');
    const board = rates('board');
    if (process.env.J4_PRINT) {
      const pc = (x, b) => `${(100 * x / b).toFixed(1)} %`;
      console.log(`  verify-1 domain | 19 makes: evidence ${pc(all19.evidence, all19.boards)} rank ${pc(all19.rank, all19.boards)}`
        + ` supply ${pc(all19.supply, all19.boards)} band ${pc(all19.band, all19.boards)} ALL ${pc(all19.all, all19.boards)}`
        + ` | contenderDomain.all ${pc(all19.cAll, all19.boards)}`);
      console.log(`  verify-1 domain | brief   : evidence ${pc(board.evidence, board.boards)} rank ${pc(board.rank, board.boards)}`
        + ` supply ${pc(board.supply, board.boards)} band ${pc(board.band, board.boards)} ALL ${pc(board.all, board.boards)}`
        + ` | contenderDomain.all ${pc(board.cAll, board.boards)}`);
    }
    assert.ok(all19.all / all19.boards <= 0.01,
      `domain.all over the 19-make pool is reached on ${all19.all}/${all19.boards} drafted boards — `
      + 'G3.8 must be published as a limit case, not as a statement about an evening');
    assert.ok(board.all / board.boards <= 0.05,
      `domain.all at the brief's own call is reached on ${board.all}/${board.boards} boards`);
    // and WHICH conditions empty it: the two the r3 repair added, both universally quantified
    assert.ok(all19.evidence / all19.boards <= 0.05, 'condition 1 (evidence, over all 19) is near-impossible');
    assert.ok(all19.band / all19.boards <= 0.20, 'condition 4 (band, over all 19) nearly as bad');
    assert.ok(all19.rank / all19.boards > 0.90,
      'while the rank condition — the one this fix repriced — now holds nearly everywhere');
  });

  test('the per-candidate form is reachable, and it is still rare: supply is what binds', () => {
    const board = rates('board');
    assert.ok(board.cAll > board.all,
      'stating conditions 1 and 4 per candidate reaches strictly more boards than the universal form');
    assert.ok(board.cAll / board.boards < 0.25,
      `contenderDomain.all on ${board.cAll}/${board.boards} boards — still not a description of an evening`);
    assert.ok(board.cEvidence > board.evidence && board.cBand > board.band,
      'and it is conditions 1 and 4 that the per-candidate form frees');
    assert.ok(board.supply / board.boards < 0.5,
      `supply is the binding condition at ${board.supply}/${board.boards} — the board does not pay for `
      + 'the study plan\'s first make on most nights');
  });
});

/* =========================================================================================
   10. VERIFY-1 — "a build mistake costs you at most one job" is false while the control
       lists the board's makes alone
   =========================================================================================

   `save.game.crew` persists across jobs (`store.js freshGame()` puts `crew` on `game`; nothing in
   `state.js` clears it at `startJob`), and the only control is the brief's grid, which renders
   `crewOrder(s, {shape, of: onBoard})`. A point spent on a make tonight's board does not serve
   therefore cannot be handed back tonight either. `reallocatable` is the fix for the grid; the
   sentence itself lives in COMPOSED-GAME.md:214 and `screens/stats.js:336`, neither of which this
   lane owns — see notes/repair-crew.md → Requests. */

describe('J4 · align · 10 · verify-1: a rank can only be changed on a night the board serves the make', () => {
  test('THE MEASUREMENT: how often each make is reachable on a drafted board', () => {
    const seen = Object.fromEntries(SKILL_IDS.map((id) => [id, 0]));
    for (const b of BOARDS) for (const mk of b.onBoard) seen[mk]++;
    const pct = SKILL_IDS.map((id) => seen[id] / BOARDS.length).sort((a, b) => a - b);
    const median = pct[Math.floor(pct.length / 2)];
    const never = SKILL_IDS.filter((id) => seen[id] === 0);
    if (process.env.J4_PRINT) {
      console.log(`  verify-1 reach | median make offered on ${(100 * median).toFixed(1)} % of ${BOARDS.length} boards`
        + ` | never offered: ${never.join(', ') || '(none)'}`);
    }
    assert.ok(median < 0.30,
      `the median make is offered on ${(100 * median).toFixed(1)} % of boards, so a point spent on it `
      + 'is locked for several jobs — "a build mistake costs you at most one job" is false as shipped');
    assert.ok(never.length >= 1 || pct[0] < 0.02,
      'and the rarest make is effectively unreachable, which is the half the sentence cannot survive');
  });

  test('reallocatable() offers the board PLUS every make already manned, so a point can always come back', () => {
    const { save, queue, onBoard } = BOARDS.find((b) => b.onBoard.length < SKILL_IDS.length - 2);
    const offBoard = SKILL_IDS.find((id) => !onBoard.includes(id));
    const spent = allocate(save, offBoard, STEADY);
    assert.equal(spent.ok, true, `${offBoard}: the point is spendable (it is a whole-save allocation)`);
    const after = spent.save;
    assert.ok(!crewOrder(after, { shape: 'JOB', of: onBoard }).includes(offBoard),
      'the grid as shipped cannot show the make, so the point cannot be handed back tonight');
    const rows = reallocatable(after, { shape: 'JOB', of: onBoard });
    assert.ok(rows.includes(offBoard), 'reallocatable lists it, because the save has a point on it');
    for (const mk of onBoard) assert.ok(rows.includes(mk), `${mk}: and the board's makes are all still there`);
    // it is crewOrder's ordering, restricted to nothing — the sort key does not change
    assert.deepEqual(rows, crewOrder(after, { shape: 'JOB', of: rows }), 'same order, more rows');
    assert.deepEqual(reallocatable(save, { shape: 'JOB', of: onBoard }),
      crewOrder(save, { shape: 'JOB', of: onBoard }),
      'and with nothing manned off the board it is exactly the shipped list');
    assert.equal(queue.length > 0, true);
  });
});
