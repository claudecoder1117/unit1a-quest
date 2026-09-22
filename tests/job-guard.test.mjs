// tests/job-guard.test.mjs — J3: the Guard and Elo.
//
// AUTHORITY: COMPOSED-GAME.md §3.4 (wings, the guard, the cap projection, the stake-weighted x̂,
// the mixed equilibrium), §3.5 (Elo, the vault grade, flow control), §3.6 (the guard draw),
// G4 ("tag → wing", "Mercy" — the three-in-a-row cap), G2 ("Rank" — ε and the guard multiplier),
// G8 J3 (this ticket's acceptance list). BUILD-POLICY overrides all of it.
//
// THE RULE THIS SUITE FOLLOWS (inherited from J1): every published numeral is COMPUTED from
// `site/data/job.js` + `site/data/skills.js` + `site/data/misconceptions.js` and compared against
// `PUBLISHED`. `PUBLISHED` is never an input to a computation.
//
// TWO PUBLISHED CLAIMS ARE CONDITIONAL and are reported rather than bent. Both conditions are
// exported from `guard.js` itself (`FARM_BAND`, `BEST_RESPONSE_ACCEPTANCE`) so a panel or a doc
// cannot restate them flat again, and every figure in those strings is recomputed here.
//
//   1. "a 3-RUN + 1-VAULT farm moves x̂ by < 0.08" (G12 #12) holds for every 10-job window that
//      contains plan-sized or vault work (measured 0.058–0.071) and fails at 0.103 for a window of
//      nothing but the default 10-target evening job — three 6-target RUNs are 108 posted against a
//      JOB-10's 84 and are therefore not "throwaway" — and at the full 0.200 for an all-RUN window,
//      the school-hours week, where every job posts the same and ω has no spread to read at all.
//   2. "a best-response simulation converges to (.60, .40) ±0.03 and to uniform for equal v" (G8 J3)
//      is an ε = 0 claim, and on the shipped path it is a claim about how a TIED argmax is settled:
//      ten jobs pressed in three whole tokens tie `v_i(1 − y_i)` exactly on most jobs, and settling
//      that tie by WING_IDS order costs 0.036 / 0.061 and lands on 7/11 and (4/11, 4/11, 3/11).
//      Settled uniformly — `pressAdvice(dist, v, {seed})` — the shipped loop meets the row.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, stripCommentsAndStrings } from './_helpers.mjs';

import {
  // wings
  WINGS, WING_IDS, WING_WEIGHTS, wingOf, wingOfTag, wingOfArea, areaOfTag, AREA_IDS,
  // study value
  wingValues, targetFrom,
  // x̂
  heatWindow, xHatFrom, pushHeat,
  // the projection and the distribution
  project, projectWithPasses, guardDist, guardBars, epsFor, rankOf, blockedWing, heldWing,
  // work, not stake
  targetsAnswered, workedJob, abandonedJob, workedPosted,
  // the draw
  drawGuard, drawGuardIndex,
  // the two sides of the fixed point, and the press the board actually commits
  fixedPointMix, maximinPress, pressAdvice, stationaryPress,
  X_HAT_FORMULA, GUARD_MIX_FORMULA, MAXIMIN_FORMULA, PRESS_FORMULA,
  BEST_RESPONSE_ACCEPTANCE, FARM_BAND, PRESS_PANEL_COPY, CAP_PANEL_COPY,
  // Elo
  elo, expectedScore, eloOutcome, eloSeed, flowControl, applyFlowControl, footholdFor,
  vaultGradeFor, vaultGradeRowFor,
  // re-exports
  GUARD, ELO, VAULT_GRADE, guardMultFor, wingMult, wingPen,
} from '../site/js/job/guard.js';

import { PUBLISHED, RANKS, AREA_WING, WING_OF_SKILL, SHAPES, COPY } from '../site/data/job.js';
import { skills, skillById, SKILL_IDS, TOTAL_WEIGHT } from '../site/data/skills.js';
import { TAGS, AREAS, MISCONCEPTIONS } from '../site/data/misconceptions.js';
import { lootMean, coldFor, lootFor, scopeOf, coldOf } from '../site/js/job/econ.js';
import { scopeFor } from '../site/js/xp.js';
import { mulberry32, rngFrom } from '../site/js/rng.js';

/* ROUND 6 — THE SHIPPED PATH. Two round-6 findings were both "the claim is false on the board the
   composer actually deals, and the test that checks it never runs the shipped path": the pre-press
   ordering was verified by calling `stationaryPress(v, wings, …)` with a RAW `v` and no `y` at all,
   and the hold's price was never evaluated. Both now run through `postBoard` → `startJob` → `walk`,
   so these five imports are the point of them rather than a convenience. */
import * as board from '../site/js/job/board.js';
import * as state from '../site/js/job/state.js';
import { fresh } from '../site/js/store.js';
import { applyOutcome, DAY_MS } from '../site/js/schedule.js';
import { todayISO, addDays } from '../site/js/days.js';
import { cards as ALL_CARDS } from '../site/data/cards.js';
import { isBonus } from '../site/data/source-manifest.js';

const sum = (a) => a.reduce((t, v) => t + v, 0);
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} — ${a} vs ${b} (tol ${tol})`);

/* ------------------------------------------------------------------ the shipped-board harness */

const SHIPPED_BANK = ALL_CARDS.filter((c) => !isBonus(c.id));
const SHIPPED_NOW = new Date(2026, 8, 16, 18, 0).getTime();
const SHIPPED_TODAY = todayISO(new Date(SHIPPED_NOW));

/**
 * `tests/job-exploit.test.mjs`'s seeded save (real Leitner records and real `history`, so the
 * composer and `qHatFor` both have food) PLUS the thing this file needs and that one does not: a
 * real 0-12-job PRESS history, pushed through the shipped `pushHeat`, so `x̂` — and therefore the
 * `y` the board prints — is NON-UNIFORM. With no press history `guardDist` cold-starts to uniform,
 * `1 − yᵢ` is a constant, and every ordering claim about `vᵢ(1 − yᵢ)` is trivially true: that is
 * exactly how the round-5 verification of the ordering managed to be vacuous.
 */
function shippedSave(i, { seedTag = 'j3-shipped' } = {}) {
  const rng = rngFrom(seedTag, i);
  const s = fresh(SHIPPED_NOW - (4 + rng.int(0, 20)) * DAY_MS);
  s.profileId = `j3-${i}`;
  s.settings.testDate = addDays(SHIPPED_TODAY, 4 + rng.int(0, 12));
  const n = 28 + rng.int(0, 24);
  for (let k = 0; k < n; k++) {
    const c = SHIPPED_BANK[rng.int(0, SHIPPED_BANK.length - 1)];
    let rec = null;
    for (let r = 0; r < 3; r++) {
      rec = applyOutcome(s, c.id, rng.chance(0.75) ? 'clean' : 'wrong', { now: SHIPPED_NOW - (30 - r * 4) * DAY_MS });
    }
    if (!rec) continue;
    rec.cleared = true;
    rec.rarity = 'gold';
    rec.due = SHIPPED_NOW + (rng.chance(0.65) ? -rng.float(0, 9) : rng.float(0.2, 12)) * DAY_MS;
    rec.history = Array.from({ length: 10 }, (_, h) => ({
      at: SHIPPED_NOW - (20 - h) * DAY_MS, ok: rng.chance(0.75), attempt: rng.chance(0.75) ? 1 : 2, hints: 0, ms: 9000,
    }));
  }
  for (const k of SKILL_IDS) {
    if (!rng.chance(0.75)) continue;
    s.skills[k] = {
      m: rng.int(10, 95), n: rng.int(1, 9), lastAt: SHIPPED_NOW - rng.int(1, 20) * DAY_MS,
      lastDueCorrectAt: rng.chance(0.4) ? SHIPPED_NOW - DAY_MS : null,
    };
  }
  const jobs = rng.int(0, 12);
  let heat = null;
  const log = [];
  for (let j = 0; j < jobs; j++) {
    const press = Object.fromEntries(WING_IDS.map((w) => [w, 0]));
    for (let left = GUARD.tokens; left > 0; left--) press[WING_IDS[rng.int(0, WING_IDS.length - 1)]] += 1;
    const shape = rng.chance(0.2) ? 'VAULT' : 'JOB';
    const targets = SHAPES[shape].targets;
    const posted = 60 + rng.int(0, 140);
    heat = pushHeat(heat, { press, posted, targets, shape });
    log.push({ day: SHIPPED_TODAY, shape, targets, bagged: 10, posted, guard: WING_IDS[rng.int(0, WING_IDS.length - 1)], press });
  }
  s.game = { ...(s.game ?? {}), heat: heat ?? undefined, log };
  return s;
}

/** The board a seeded save posts tonight, or `null` when it posts none. */
function shippedBoard(save, { now = SHIPPED_NOW } = {}) {
  try { return board.postBoard(save, SHIPPED_TODAY, { now }); } catch { return null; }
}

/* =========================================================================================
   1. The four wings partition the 19 skills (G3.4)
   ========================================================================================= */

describe('J3 · the four wings partition the 19 skills, Σw = 100 (G3.4)', () => {
  test('the four wing weights sum to 100, computed from data/skills.js', () => {
    const perWing = WINGS.map((w) => sum(w.skills.map((s) => skillById[s].w)));
    assert.equal(sum(perWing), 100);
    assert.equal(sum(perWing), TOTAL_WEIGHT);
    assert.equal(sum(WINGS.map((w) => w.w)), PUBLISHED.skillWeightTotal);
    // and each wing's declared weight IS the sum of its skills' weights
    WINGS.forEach((w, i) => assert.equal(w.w, perWing[i], `${w.id} declares ${w.w}, its skills sum to ${perWing[i]}`));
  });

  test('the published per-wing weights reproduce (32 / 26 / 23 / 19)', () => {
    for (const w of WINGS) assert.equal(w.w, PUBLISHED.wingWeights[w.id], w.id);
    assert.deepEqual(WING_WEIGHTS, { ...PUBLISHED.wingWeights });
  });

  test('the wings partition all 19 skills exactly: no gap, no overlap, no stranger', () => {
    const listed = WINGS.flatMap((w) => w.skills);
    assert.equal(listed.length, PUBLISHED.skillCount, 'exactly 19 slots');
    assert.equal(new Set(listed).size, listed.length, 'no skill appears in two wings');
    assert.deepEqual([...listed].sort(), [...SKILL_IDS].sort(), 'the slots ARE the 19 skills');
    assert.equal(skills.length, 19);
  });

  test('wingOf resolves every one of the 19 makes, and nothing else', () => {
    for (const id of SKILL_IDS) {
      const w = wingOf(id);
      assert.ok(WING_IDS.includes(w), `${id} → ${w}`);
      assert.equal(w, WING_OF_SKILL[id]);
    }
    assert.equal(wingOf('NOT-A-SKILL'), null);
    assert.equal(wingOf(null), null);
    assert.equal(wingOf(undefined), null);
    assert.equal(wingOf(7), null);
  });

  test('each skill lands in the wing data/job.js names, spot-checked against G3.4s own table', () => {
    const table = {
      RECALL: ['VOC', 'NOTE', 'CLASS', 'ASN-PLP', 'ASN-ANG'],
      FIGURES: ['PAIRS', 'FIG-ALG', 'BISECT-L', 'BISECT-Q', 'SEG-ALG'],
      WORDS: ['CSARITH', 'CS-LIN', 'CS-RATIO', 'CS-QUAD'],
      ALGEBRA: ['SYS', 'FAC1', 'FAC2', 'QUAD-SOLVE', 'QUAD-CTX'],
    };
    for (const [wing, ids] of Object.entries(table)) for (const id of ids) assert.equal(wingOf(id), wing, id);
  });
});

/* =========================================================================================
   2. tag → wing, through misconceptions.js's own 11 AREAS (G4)
   ========================================================================================= */

describe('J3 · wingOfTag covers all 68 tags via the 11 AREAS (G4, G12 #15)', () => {
  test('there are 68 tags and 11 areas, and data/misconceptions.js is untouched', () => {
    assert.equal(TAGS.length, 68);
    assert.equal(AREAS.length, 11);
    assert.deepEqual(AREA_IDS, AREAS.map((a) => a.id), 'AREA_IDS is derived from AREAS, not retyped');
    // the map in data/job.js covers exactly the 11 areas — no new taxonomy
    assert.deepEqual(Object.keys(AREA_WING).sort(), AREAS.map((a) => a.id).sort());
  });

  test('every one of the 68 tags names an area the map knows', () => {
    for (const tag of TAGS) {
      const area = areaOfTag(tag);
      assert.ok(AREAS.some((a) => a.id === area), `${tag} → area ${area}`);
      assert.ok(Object.hasOwn(AREA_WING, area), `AREA_WING has no entry for ${area}`);
    }
  });

  test('every one of the 68 tags resolves to a wing once the card s make is supplied', () => {
    let general = 0;
    for (const tag of TAGS) {
      for (const make of SKILL_IDS) {
        const w = wingOfTag(tag, make);
        assert.ok(WING_IDS.includes(w), `${tag} on ${make} → ${w}`);
      }
      if (wingOfTag(tag) === null) general++;
    }
    assert.equal(general, 3, 'exactly the three `general`-area tags need the card s wing');
  });

  test('the three general tags return null bare and the card s wing when given one', () => {
    const generals = TAGS.filter((t) => MISCONCEPTIONS[t].area === 'general');
    assert.deepEqual(generals.sort(), ['arithmetic', 'sign-flip', 'swapped-fields'].sort());
    assert.equal(AREA_WING.general, null, 'the map says `general` has no wing of its own');
    for (const t of generals) {
      assert.equal(wingOfTag(t), null);
      assert.equal(wingOfTag(t, 'FAC2'), 'ALGEBRA');
      assert.equal(wingOfTag(t, 'VOC'), 'RECALL');
      assert.equal(wingOfTag(t, 'NOT-A-SKILL'), null);
    }
  });

  test('the ten wing-bearing areas map where G4 says they do', () => {
    const published = {
      'comp-supp': 'WORDS', setup: 'WORDS', ratio: 'WORDS',
      roots: 'ALGEBRA', factoring: 'ALGEBRA',
      figure: 'FIGURES',
      notation: 'RECALL', vocab: 'RECALL', classify: 'RECALL', reasoning: 'RECALL',
    };
    for (const [area, wing] of Object.entries(published)) assert.equal(wingOfArea(area), wing, area);
    assert.equal(wingOfArea('general'), null);
    assert.equal(wingOfArea('nonsense'), null);
  });

  test('an unknown tag degrades to null rather than throwing (saves carry old tags)', () => {
    assert.equal(wingOfTag('a-tag-from-1997'), null);
    assert.equal(wingOfTag('a-tag-from-1997', 'FAC2'), null);
    assert.equal(wingOfTag(''), null);
    assert.equal(wingOfTag(null), null);
    assert.equal(areaOfTag('a-tag-from-1997'), null);
  });

  test('every tag in the catalogue is reachable from some wing (the Fault Index rolls up cleanly)', () => {
    const byWing = Object.fromEntries(WING_IDS.map((w) => [w, 0]));
    for (const tag of TAGS) {
      const w = wingOfTag(tag, 'FAC2');           // a make only the 3 general tags ever need
      byWing[w]++;
    }
    assert.equal(sum(Object.values(byWing)), 68);
    for (const w of WING_IDS) assert.ok(byWing[w] > 0, `${w} carries no tag at all`);
  });
});

/* =========================================================================================
   3. v_i — the wing's study value (G3.4)
   ========================================================================================= */

describe('J3 · wingValues = Σ L·scope·cold per wing (G3.4)', () => {
  const queue = [
    { id: 'a', skill: 'VOC', tier: 1, isReview: true, bucket: 1, overdue: 1 },     // RECALL
    { id: 'b', skill: 'NOTE', tier: 2, isReview: false },                          // RECALL
    { id: 'c', skill: 'PAIRS', tier: 1, isVariant: true },                         // FIGURES
    { id: 'd', skill: 'FAC2', tier: 3, isReview: true, bucket: 5, overdue: 14 },   // ALGEBRA
  ];

  test('the arithmetic is L · scope · cold, term by term', () => {
    const v = wingValues(null, queue).byWing;
    close(v.RECALL, 6 * 1.25 * coldFor(1, 1) + 18 * 1 * 1, 1e-9, 'RECALL');
    close(v.FIGURES, 6 * 0.8 * 1, 1e-9, 'FIGURES');
    close(v.ALGEBRA, 38 * 1.25 * coldFor(5, 14), 1e-9, 'ALGEBRA');
    assert.equal(v.WORDS, 0);
    assert.deepEqual(wingValues(null, queue).support.sort(), ['ALGEBRA', 'FIGURES', 'RECALL']);
  });

  test('scope is xp.scopeFor() verbatim, never a private table', () => {
    for (const flags of [{ isReview: true }, { isVariant: true }, { isMastered: true }, { isBonusBank: true }, {}]) {
      const t = targetFrom({ skill: 'VOC', tier: 1, ...flags });
      close(scopeOf(t), scopeFor(flags), 1e-12, JSON.stringify(flags));
    }
  });

  test('cold is G2 s CAPPED term: ten intervals late pays exactly what one interval late pays', () => {
    const late = wingValues(null, [{ skill: 'VOC', tier: 1, isReview: true, bucket: 1, overdue: 1 }]).byWing.RECALL;
    const rotten = wingValues(null, [{ skill: 'VOC', tier: 1, isReview: true, bucket: 1, overdue: 300 }]).byWing.RECALL;
    assert.equal(late, rotten, 'letting a card rot past its own interval buys the wing nothing');
    close(coldOf(targetFrom({ bucket: 1, overdue: 300 })), 1.5, 1e-12);
  });

  test('a target with no known make lands in `unassigned`, never in a wing', () => {
    const r = wingValues(null, [{ skill: null, tier: 4 }, { skill: 'NOPE', tier: 1 }]);
    assert.equal(sum(r.values), 0);
    close(r.unassigned, 70 + 6, 1e-9);
  });

  test('bucket and overdue fall back to save.cards when the queue item omits them', () => {
    const save = { cards: { z: { bucket: 1, overdue: 4 } } };
    const withSave = wingValues(save, [{ id: 'z', skill: 'VOC', tier: 1, isReview: true }]).byWing.RECALL;
    const inline = wingValues(null, [{ id: 'z', skill: 'VOC', tier: 1, isReview: true, bucket: 1, overdue: 4 }]).byWing.RECALL;
    assert.equal(withSave, inline);
  });

  test('wingValues is pure: it mutates neither the save nor the queue', () => {
    const q = queue.map((t) => Object.freeze({ ...t }));
    const save = Object.freeze({ cards: Object.freeze({}) });
    assert.doesNotThrow(() => wingValues(save, Object.freeze(q)));
    assert.deepEqual(wingValues(save, q).byWing, wingValues(save, q).byWing);
  });
});

/* =========================================================================================
   4. project — the water-filling cap (G3.4, G12 #10)
   ========================================================================================= */

describe('J3 · project(y, cap) — water-filling (G3.4, G12 #10)', () => {
  const uniform = (n) => Array.from({ length: n }, () => 1 / n);
  const mix = (xHat, eps) => xHat.map((x) => (1 - eps) * x + eps * (1 / xHat.length));

  test('the worked case: n = 3, ε = .10, x̂ = (1,0,0) → (0.750, 0.125, 0.125), Σ = 1.000', () => {
    const m = mix([1, 0, 0], 0.10);
    close(m[0], 0.9333333, 1e-6, 'the mixed vector before the projection');
    const { y, passes } = projectWithPasses(m, GUARD.cap);
    assert.deepEqual(y.map((v) => Number(v.toFixed(3))), [0.750, 0.125, 0.125]);
    close(sum(y), 1, 1e-9);
    assert.ok(passes <= 3 - 1, `${passes} passes for n = 3`);
    assert.equal(passes, 1);
  });

  test('the worked case: n = 2, ε = .10, x̂ = (1,0) → (0.75, 0.25)', () => {
    const { y, passes } = projectWithPasses(mix([1, 0], 0.10), GUARD.cap);
    assert.deepEqual(y.map((v) => Number(v.toFixed(3))), [0.750, 0.250]);
    close(sum(y), 1, 1e-9);
    assert.ok(passes <= 2 - 1);
  });

  test('PUBLISHED.projectWorked reproduces from the formula, both rows', () => {
    for (const row of PUBLISHED.projectWorked) {
      const m = mix(row.xHat, row.eps);
      row.mixed.forEach((v, i) => close(m[i], v, 5e-5, `mixed[${i}] for n=${row.n}`));
      const y = project(m, GUARD.cap);
      row.out.forEach((v, i) => close(y[i], v, 1e-9, `y[${i}] for n=${row.n}`));
      assert.equal(row.n, row.xHat.length);
    }
  });

  test('10 000 random cases: Σ = 1.000 ± 1e-9, every entry ≤ cap, ≤ n−1 passes', () => {
    const rng = mulberry32('j3-project');
    let worstSum = 0; let worstOver = 0; let worstPasses = 0;
    for (let k = 0; k < 10000; k++) {
      const n = 2 + (k % 3);                                  // n = 2, 3, 4 — every support size
      const raw = Array.from({ length: n }, () => rng.next() ** (1 + 4 * rng.next()));
      const t = sum(raw);
      const y0 = raw.map((v) => v / t);                        // a distribution
      const { y, passes } = projectWithPasses(y0, GUARD.cap);
      worstSum = Math.max(worstSum, Math.abs(sum(y) - 1));
      worstOver = Math.max(worstOver, Math.max(...y) - GUARD.cap);
      worstPasses = Math.max(worstPasses, passes - (n - 1));
      assert.equal(y.length, n);
      for (const v of y) assert.ok(v >= -1e-12, 'no negative mass');
    }
    assert.ok(worstSum <= 1e-9, `worst |Σy − 1| = ${worstSum}`);
    assert.ok(worstOver <= 1e-12, `worst overshoot above the cap = ${worstOver}`);
    assert.ok(worstPasses <= 0, `a case needed more than n−1 passes (by ${worstPasses})`);
  });

  test('an already-feasible distribution is returned unchanged, in zero passes', () => {
    const y0 = [0.5, 0.3, 0.2];
    const { y, passes } = projectWithPasses(y0, GUARD.cap);
    assert.deepEqual(y, y0);
    assert.equal(passes, 0);
    assert.deepEqual(project(uniform(4), GUARD.cap), uniform(4));
  });

  test('a capped index stays capped — the loop cannot cycle (this is what bounds it at n−1)', () => {
    // Two indices over the cap at once, with a tiny free tail: the naive version would push the
    // tail over the cap, uncap the first two, and oscillate.
    const { y, passes } = projectWithPasses([0.49, 0.49, 0.02], 0.4);
    close(sum(y), 1, 1e-12);
    assert.ok(Math.max(...y) <= 0.4 + 1e-12);
    assert.ok(passes <= 2);
    assert.deepEqual(y.map((v) => Number(v.toFixed(3))), [0.400, 0.400, 0.200]);
  });

  test('an infeasible cap (n·cap < Σy) returns the flat vector rather than losing mass', () => {
    const y = project([1], GUARD.cap);            // one wing cannot be held under 0.75
    assert.deepEqual(y, [1]);
    const z = project([0.6, 0.4], 0.25);          // 2 × 0.25 < 1
    assert.deepEqual(z, [0.5, 0.5]);
    close(sum(z), 1, 1e-12);
  });

  test('degenerate inputs do not throw', () => {
    assert.deepEqual(project([], GUARD.cap), []);
    assert.deepEqual(project(null, GUARD.cap), []);
    assert.deepEqual(project([0, 0, 0], GUARD.cap), [0, 0, 0]);
  });

  test('the cap constant IS 0.75 for n = 3 and n = 2 alike (G3.4)', () => {
    assert.equal(GUARD.cap, 0.75);
  });

  test('THE REDISTRIBUTION IS PROPORTIONAL, NOT LEVELLED — "water-filling" names the wrong rule', () => {
    /* ROUND 4. The excess is shared in proportion to the uncapped entries; water-filling proper —
       the Euclidean projection onto the capped simplex — LEVELS them, `y_i = min(cap, y_i + λ)`.
       The two agree whenever one entry is capped and the rest are equal (every worked example the
       doc and the panel print), and they differ as soon as the tail is uneven, which is every real
       x̂. The shipped rule is the one the doc and the panel print, so this pins the difference
       rather than letting a later "fix" rename the guard's distribution into the other one. */
    const level = (y, cap) => {                        // y_i = min(cap, y_i + λ), λ by bisection
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 200; i++) {
        const mid = (lo + hi) / 2;
        if (sum(y.map((v) => Math.min(cap, v + mid))) < sum(y)) lo = mid; else hi = mid;
      }
      return y.map((v) => Math.min(cap, v + (lo + hi) / 2));
    };
    const y0 = [0.90, 0.08, 0.02];
    assert.deepEqual(project(y0, GUARD.cap).map((v) => Number(v.toFixed(5))), [0.75, 0.20, 0.05]);
    assert.deepEqual(level(y0, GUARD.cap).map((v) => Number(v.toFixed(5))), [0.75, 0.155, 0.095]);
    // both are feasible and sum-preserving, so neither is "wrong" — they are different rules
    for (const f of [project(y0, GUARD.cap), level(y0, GUARD.cap)]) {
      close(sum(f), 1, 1e-9);
      assert.ok(Math.max(...f) <= GUARD.cap + 1e-9);
    }
    // the worked example both rules agree on, which is why the loose name survived this long
    const flatTail = [0.9333333333333333, 0.03333333333333333, 0.03333333333333333];
    project(flatTail, GUARD.cap).forEach((v, i) => close(v, level(flatTail, GUARD.cap)[i], 1e-9,
      'one wing over the cap and an even tail: proportional and levelled coincide'));
    // …and the shipped rule is idempotent and exactly sum-preserving over the sweep
    const rng = mulberry32('j3-proportional');
    for (let k = 0; k < 2000; k++) {
      const n = 2 + (k % 3);
      const raw = Array.from({ length: n }, () => rng.next() ** 3);
      const y = raw.map((v) => v / sum(raw));
      const once = project(y, GUARD.cap);
      close(sum(once), sum(y), 1e-12, 'mass is moved, never dropped');
      assert.deepEqual(project(once, GUARD.cap), once, 'idempotent');
    }
  });

  test('THE AUTHORITY\'S PRINTED BLOCK REACHES THE SAME LIMIT AND NOT IN ≤ n−1 PASSES', () => {
    /* COMPOSED-GAME.md:472 prints `free = { i : i ∉ over }` and the comment "terminates in ≤ n−1
       passes". A capped entry EQUALS the cap, so it is not in `over` on the next pass; the doc's
       version therefore re-frees it, hands it excess again, and converges by asymptote. Same limit
       to 1e-15, 20× to 46× the passes. This is the measurement behind the spec correction in
       notes/repair-guard.md; the shipped docblock and the Settings panel already print the
       corrected line (`i not capped`). */
    const docProject = (y, cap) => {                   // the printed block, implemented literally
      const out = y.slice();
      let passes = 0;
      for (;;) {
        const over = out.map((v, i) => [v, i]).filter(([v]) => v > cap + 1e-15).map(([, i]) => i);
        if (over.length === 0 || passes > 5000) return { y: out, passes };
        passes += 1;
        let excess = 0;
        for (const i of over) { excess += out[i] - cap; out[i] = cap; }
        const free = out.map((_, i) => i).filter((i) => !over.includes(i));
        const snap = free.map((i) => out[i]);
        const s = sum(snap);
        if (s > 0) free.forEach((i, k) => { out[i] += excess * (snap[k] / s); });
        else free.forEach((i) => { out[i] += excess / free.length; });
      }
    };
    for (const [y, cap, docPasses] of [
      [[0.60, 0.25, 0.10, 0.05], 0.30, 40],
      [[0.50, 0.30, 0.15, 0.05], 0.28, 92],
    ]) {
      const ship = projectWithPasses(y, cap);
      const doc = docProject(y, cap);
      assert.equal(ship.passes, 2, 'the shipped loop retires an index per pass');
      assert.equal(doc.passes, docPasses, `the printed block takes ${docPasses}`);
      assert.ok(doc.passes > y.length - 1, 'which is more than the n−1 it claims');
      ship.y.forEach((v, i) => close(v, doc.y[i], 1e-14, 'and the limit is the same vector'));
    }
    // on the doc's own worked example the two agree in one pass, which is how it went unnoticed
    const worked = [0.9333333333333333, 0.03333333333333333, 0.03333333333333333];
    assert.equal(projectWithPasses(worked, GUARD.cap).passes, 1);
    assert.equal(docProject(worked, GUARD.cap).passes, 1);
  });
});

/* =========================================================================================
   5. x̂ is stake-weighted, and no single job exceeds 25 % of the window (G12 #12)
   ========================================================================================= */

const POSTED = Object.fromEntries(Object.keys(SHAPES).map((k) => [k, lootMean(k) * SHAPES[k].targets]));
const jobRec = (shape, press) => ({ press, posted: POSTED[shape] });
const EVEN = { RECALL: 1, FIGURES: 1, WORDS: 1 };          // an honest press, spread over the board
const DECOY = { RECALL: 3, FIGURES: 0, WORDS: 0 };         // all three tokens on the wing you do not care about
const HONEST_NO_RECALL = { FIGURES: 1, WORDS: 1, ALGEBRA: 1 };   // an honest press that never touches the farmed wing
const REAL = { RECALL: 0, FIGURES: 3, WORDS: 0 };          // the wing you DO care about, on the vault
const rep = (n, shape, press) => Array.from({ length: n }, () => jobRec(shape, press));
const xOf = (jobs) => xHatFrom({ game: { heat: { window: jobs } } });
const unweighted = (jobs) => {
  const acc = Object.fromEntries(WING_IDS.map((w) => [w, 0]));
  for (const j of jobs) {
    const t = sum(WING_IDS.map((w) => j.press[w] ?? 0));
    for (const w of WING_IDS) acc[w] += (j.press[w] ?? 0) / t;
  }
  for (const w of WING_IDS) acc[w] /= jobs.length;
  return acc;
};

describe('J3 · x̂ is stake-weighted over the last 10 jobs (G3.4, G12 #12)', () => {
  test('the shapes price as G3.4 says: a RUN contributes about a fifth of a VAULT', () => {
    close(POSTED.RUN / POSTED.VAULT, 0.2, 0.03, 'RUN / VAULT');
    assert.ok(POSTED.RUN < POSTED.JOB && POSTED.JOB < POSTED.JOB12 && POSTED.JOB12 <= POSTED.VAULT);
  });

  test('ω_j = min(posted_j, 0.25·Σ posted) EXACTLY — 10 000 random windows', () => {
    const rng = mulberry32('j3-omega');
    for (let k = 0; k < 10000; k++) {
      const n = 1 + Math.floor(rng.next() * 10);
      const jobs = Array.from({ length: n }, () => ({
        press: { RECALL: rng.next(), FIGURES: rng.next(), WORDS: rng.next(), ALGEBRA: rng.next() },
        posted: Math.round(rng.next() ** 3 * 4000),
      })).filter((j) => sum(WING_IDS.map((w) => j.press[w])) > 0);
      if (jobs.length === 0) continue;
      const hat = xHatFrom({ game: { heat: { window: jobs } } });
      const total = sum(jobs.map((j) => j.posted));
      if (!(total > 0)) continue;
      const cap = GUARD.jobWeightCap * total;
      close(hat.cap, cap, 1e-9, 'the published cap');
      jobs.forEach((j, i) => {
        close(hat.weights[i], Math.min(j.posted, cap), 1e-9, `ω for job ${i}`);
        assert.ok(hat.weights[i] <= cap + 1e-9, 'no single job weighs more than 25 % of the window');
      });
      close(sum(hat.values), 1, 1e-9, 'x̂ is a distribution');
    }
  });

  test('the cap is 25 % and the window is 10 jobs (data/job.js)', () => {
    assert.equal(GUARD.jobWeightCap, 0.25);
    assert.equal(GUARD.xHatWindowJobs, 10);
  });

  test('a job with 5× the posted has 5× the influence while both sit under the cap', () => {
    const filler = Array.from({ length: 8 }, () => ({ press: { WORDS: 3 }, posted: 100 }));
    const hat = xOf([...filler, { press: DECOY, posted: 20 }, { press: REAL, posted: 100 }]);
    const total = 8 * 100 + 20 + 100;
    assert.ok(Math.max(...hat.weights) <= 0.25 * total + 1e-9, 'nothing is capped in this window');
    close(hat.byWing.FIGURES / hat.byWing.RECALL, 5, 1e-9, '100 posted against 20 posted');
    close(hat.byWing.RECALL, 20 / total, 1e-9);
  });

  test('the cap bites: one colossal job is held to 25 % of the window — share and all', () => {
    const b = xOf([...rep(3, 'RUN', DECOY), { press: REAL, posted: 100000 }]);
    const total = 3 * POSTED.RUN + 100000;
    const cap = 0.25 * total;
    assert.equal(b.weights[3], cap, 'its ω is the cap, not its posted');
    // ω ALONE never delivered the published bound: the cap scales with the window total, so the
    // survivor still owns 99 % of Σω. That was recorded here as a known gap and is now closed by
    // the uniform ballast — the quantity the student is told about is the SHARE, and it IS 0.25.
    assert.ok(b.weights[3] / sum(b.weights) > 0.99, 'Σω on its own still lets one job own the window');
    close(b.shares[3], GUARD.jobWeightCap, 1e-12, 'its share of the ballasted window IS the cap');
    close(b.maxShare, GUARD.jobWeightCap, 1e-12);
    close(b.byWing.FIGURES, 0.25 + 0.75 * 0.25, 2e-3, 'a quarter its press, three quarters uniform');
    assert.ok(b.byWing.FIGURES < 0.5, 'the cap stops one job owning the window outright');
  });

  test('"no single job is more than a quarter of the window" holds at EVERY window size', () => {
    // COMPOSED-GAME.md §3.4 and the Settings panel both publish that sentence. `ω_j = min(posted_j,
    // 0.25·Σposted)` does not deliver it — it bounds ω against Σposted, not ω_j/Σω — and for a
    // window of fewer than four jobs it is not even arithmetically reachable: on job 1 one job is
    // the whole window. `xHatFrom` therefore ballasts the window with uniform weight until the
    // largest job's SHARE is inside the cap. Asserted over reachable shapes, n = 1..10.
    const shapes = Object.keys(SHAPES);
    const rng = mulberry32('j3-share-cap');
    for (let k = 0; k < 3000; k++) {
      const n = 1 + Math.floor(rng.next() * 10);
      const jobs = Array.from({ length: n },
        () => jobRec(shapes[Math.floor(rng.next() * shapes.length)], DECOY));
      const hat = xOf(jobs);
      assert.ok(hat.maxShare <= GUARD.jobWeightCap + 1e-12, `n=${n}: maxShare ${hat.maxShare}`);
      hat.shares.forEach((sh, i) => assert.ok(sh <= GUARD.jobWeightCap + 1e-12, `n=${n} job ${i}`));
      close(sum(hat.shares) + hat.ballast / hat.denom, 1, 1e-9, 'shares + ballast ARE the window');
      close(sum(hat.values), 1, 1e-9, 'x̂ is still a distribution');
    }
    // job 1 is a quarter of the window; the other three quarters are uniform, not the press
    const one = xOf([jobRec('VAULT', DECOY)]);
    close(one.byWing.RECALL, 0.25 + 0.75 * 0.25, 1e-12, 'one job does not BECOME x̂');
    close(one.byWing.ALGEBRA, 0.75 * 0.25, 1e-12);
  });

  test('THE PUBLISHED FORMULA IS THE RUNNING ONE: X_HAT_FORMULA, implemented literally, IS xHatFrom', () => {
    /* The panel used to print `x̂ᵢ = Σⱼ(ωⱼ·shareᵢⱼ)/Σⱼωⱼ` — a shape the code has not run since the
       ballast went in, and one that breaks the 25 % sentence printed beside it (three RUNs and one
       VAULT put 52 % of that window on one job; nine tiny jobs and one huge one put 85 %). Both
       halves are now published from the implementation. This test writes out X_HAT_FORMULA by hand
       — ω, β, the lot — and asserts the two agree, so the published text cannot drift again. */
    assert.match(X_HAT_FORMULA.law, /β/, 'the ballast is IN the published law, not a footnote');
    assert.match(X_HAT_FORMULA.ballast, /max\(ω\)/);

    const published = (jobs, cap = GUARD.jobWeightCap) => {
      const shares = jobs.map((j) => {
        const t = sum(WING_IDS.map((w) => j.press[w] ?? 0));
        return Object.fromEntries(WING_IDS.map((w) => [w, (j.press[w] ?? 0) / t]));
      });
      const posted = jobs.map((j) => j.posted);
      const capAbs = cap * sum(posted);                              // ωⱼ = min(postedⱼ, cap·Σposted)
      const omega = posted.map((p) => Math.min(p, capAbs));
      const sw = sum(omega);
      const beta = Math.max(0, Math.max(...omega) / cap - sw);       // β = max(0, max(ω)/cap − Σω)
      const n = WING_IDS.length;
      return Object.fromEntries(WING_IDS.map((w) => [w,
        (sum(omega.map((o, j) => o * shares[j][w])) + beta / n) / (sw + beta)]));
    };

    const shapes = Object.keys(SHAPES);
    const presses = [EVEN, DECOY, REAL, { RECALL: 2, ALGEBRA: 1 }, { WORDS: 1, FIGURES: 2 }];
    const rng = mulberry32('j3-published-formula');
    for (let k = 0; k < 3000; k++) {
      const n = 1 + Math.floor(rng.next() * 10);
      const jobs = Array.from({ length: n }, () => ({
        press: presses[Math.floor(rng.next() * presses.length)],
        posted: POSTED[shapes[Math.floor(rng.next() * shapes.length)]],
      }));
      const mine = published(jobs);
      const hat = xOf(jobs);
      for (const w of WING_IDS) close(hat.byWing[w], mine[w], 1e-9, `n=${n} wing ${w}`);
    }

    // the doc's own named attack, and the window that broke the bound worst — both now inside it
    const farm = [...rep(3, 'RUN', DECOY), jobRec('VAULT', REAL)];
    close(xOf(farm).maxShare, GUARD.jobWeightCap, 1e-12, '3 RUNs + 1 VAULT: 52 % under the old text');
    const lopsided = [...rep(9, 'RUN', DECOY), { press: REAL, posted: 40000 }];
    close(xOf(lopsided).maxShare, GUARD.jobWeightCap, 1e-12, 'nine tiny jobs: 85 % under the old text');
    for (const w of WING_IDS) {
      close(xOf(farm).byWing[w], published(farm)[w], 1e-12);
      close(xOf(lopsided).byWing[w], published(lopsided)[w], 1e-12);
    }
  });

  test('the ballast is zero on any window already inside the bound, and never bends the ratio', () => {
    assert.equal(xOf(rep(10, 'JOB', EVEN)).ballast, 0, 'ten equal jobs already satisfy the cap');
    assert.equal(xOf([...rep(7, 'JOB', EVEN), ...rep(3, 'RUN', DECOY)]).ballast, 0);
    // relative stake weighting is untouched: a RUN still counts about a fifth of a VAULT
    const w = xOf([...rep(8, 'JOB', EVEN), jobRec('RUN', DECOY), jobRec('VAULT', REAL)]);
    assert.equal(w.ballast, 0);
    close(w.shares[8] / w.shares[9], POSTED.RUN / POSTED.VAULT, 1e-9, 'the ratio survives the fix');
  });

  test('only the last 10 jobs count', () => {
    const jobs = [...rep(10, 'VAULT', DECOY), ...rep(10, 'RUN', REAL)];
    const hat = xOf(jobs);
    assert.equal(hat.jobs, 10);
    close(hat.byWing.FIGURES, 1, 1e-9, 'the ten VAULTs have fallen out of the window');
    close(hat.byWing.RECALL, 0, 1e-9);
  });

  test('a job with no press contributes nothing; job 1 is a cold start, not a fabricated x̂', () => {
    assert.equal(xHatFrom(null).coldStart, true);
    assert.equal(xHatFrom({}).coldStart, true);
    assert.equal(xHatFrom({ game: { heat: { window: [] } } }).coldStart, true);
    assert.equal(xOf([{ press: { RECALL: 0, FIGURES: 0, WORDS: 0, ALGEBRA: 0 }, posted: 90 }]).coldStart, true);
    for (const v of xHatFrom(null).values) close(v, 0.25, 1e-12, 'cold start is uniform over the four wings');
  });

  test('save.game.log is read when it carries a press, and G7 s scalar accumulator is the last resort', () => {
    const fromLog = xHatFrom({ game: { log: [{ press: DECOY, posted: 100 }, { press: REAL, posted: 100 }] } });
    assert.equal(fromLog.source, 'game.log');
    close(fromLog.byWing.RECALL, fromLog.byWing.FIGURES, 1e-12, 'one job each, equally staked');
    close(fromLog.byWing.RECALL, 0.375, 1e-9, 'half the window is ballast on a two-job window');
    const fromAcc = xHatFrom({ game: { heat: { press: { RECALL: 30, FIGURES: 10, WORDS: 0, ALGEBRA: 0 }, weight: 40, jobs: 4 } } });
    assert.equal(fromAcc.source, 'heat.press');
    close(fromAcc.byWing.RECALL, 0.75, 1e-9);
    assert.equal(fromAcc.coldStart, false);
  });

  test('pushHeat keeps the window at ≤ 10 and the accumulator in step, without mutating', () => {
    let heat = null;
    for (let i = 0; i < 14; i++) heat = pushHeat(heat, { press: i % 2 ? DECOY : REAL, posted: 50 });
    assert.equal(heat.window.length, GUARD.xHatWindowJobs);
    assert.equal(heat.jobs, 14);
    close(heat.weight, 14 * 50, 1e-9);
    close(heat.press.RECALL + heat.press.FIGURES, 14 * 50, 1e-9);
    const frozen = Object.freeze({ press: Object.freeze({ RECALL: 1 }), weight: 1, jobs: 1, window: Object.freeze([]) });
    assert.doesNotThrow(() => pushHeat(frozen, { press: REAL, posted: 10 }));
    assert.equal(frozen.window.length, 0, 'the input heat is untouched');
  });
});

/* =========================================================================================
   5b. The farm — the claim the stake weighting exists for
   ========================================================================================= */

describe('J3 · a 3-RUN + 1-VAULT farm cannot walk the guard (G3.4, G12 #12)', () => {
  // The exploit G3.4 names: press the wing you do NOT care about through three free 6-target RUNs,
  // walk the guard onto it, then press the wing you DO care about on the VAULT. The three RUNs are
  // the throwaway half; the measurement is how far they move x̂ on the decoy wing.
  //
  // Each scenario is a full 10-job window of the student's own real play, with the three decoy RUNs
  // APPENDED (they evict the three oldest jobs, which is what the 10-job window does).
  const scenarios = {
    // the realistic week the plan actually serves: the evening default, two plan-sized nights, a vault
    mixedWeek: {
      base: [...rep(7, 'JOB', EVEN), ...rep(2, 'JOB12', EVEN), jobRec('VAULT', REAL)],
      farm: [...rep(4, 'JOB', EVEN), ...rep(2, 'JOB12', EVEN), jobRec('VAULT', REAL), ...rep(3, 'RUN', DECOY)],
    },
    vaultHeavy: { base: rep(10, 'VAULT', EVEN), farm: [...rep(7, 'VAULT', EVEN), ...rep(3, 'RUN', DECOY)] },
    planSized: { base: rep(10, 'JOB12', EVEN), farm: [...rep(7, 'JOB12', EVEN), ...rep(3, 'RUN', DECOY)] },
    jobAndVault: {
      base: [...rep(9, 'JOB', EVEN), jobRec('VAULT', REAL)],
      farm: [...rep(6, 'JOB', EVEN), jobRec('VAULT', REAL), ...rep(3, 'RUN', DECOY)],
    },
    defaultOnly: { base: rep(10, 'JOB', EVEN), farm: [...rep(7, 'JOB', EVEN), ...rep(3, 'RUN', DECOY)] },
    // the school-window week. `COPY.schoolWindow` is "School window · RUN only · Mon–Fri
    // 07:00–14:15", so a student who plays only between bells has a window of nothing but RUNs —
    // and then the three decoy RUNs are the same size as the honest work, which is the one shape
    // stake weighting has no grip on at all.
    runOnly: { base: rep(10, 'RUN', EVEN), farm: [...rep(7, 'RUN', EVEN), ...rep(3, 'RUN', DECOY)] },
  };
  const shift = (s) => xOf(s.farm).byWing.RECALL - xOf(s.base).byWing.RECALL;
  const flatStake = (s) => new Set(s.farm.map((j) => Math.round(j.posted))).size === 1;

  test('the realistic 10-job window: the farm moves x̂ by less than 0.08', () => {
    const d = shift(scenarios.mixedWeek);
    assert.ok(d > 0, 'the farm does move it — it is not free, it is priced');
    assert.ok(d < 0.08, `the mixed-week window moved x̂ by ${d.toFixed(4)}`);
  });

  test('a window holding plan-sized or vault work: the farm moves x̂ by less than 0.08', () => {
    for (const k of ['vaultHeavy', 'planSized']) {
      const d = shift(scenarios[k]);
      assert.ok(d < 0.08, `${k} moved x̂ by ${d.toFixed(4)}`);
    }
  });

  test('RECORDED, not bent: a window of nothing but the default JOB-10 moves 0.103, and the JOB+VAULT window 0.082', () => {
    // Three 6-target RUNs are 108 posted against a JOB-10's 84: they are not "throwaway", and the
    // published "< 0.08" does not hold there. The formula is the authority (notes/J3.md §5.1).
    close(shift(scenarios.defaultOnly), 0.1034, 5e-4, 'a JOB-10-only window');
    close(shift(scenarios.jobAndVault), 0.0821, 5e-4, 'a 9-JOB + 1-VAULT window');
  });

  test('RECORDED: an all-RUN window — the school-hours week — moves the full 0.200, and why', () => {
    /* The worst case of the published row, and it was not in this table at all. Stake weighting can
       only bite when the farm's jobs post LESS than the honest ones; between bells the board offers
       nothing but RUN (`COPY.schoolWindow`), so the decoy RUNs and the honest RUNs weigh exactly
       the same and ω is flat. What is left is the leverage bound, and the farm takes all of it:
       three of ten equal jobs is 0.30 of the window, and moving them off an even press onto one
       wing moves that wing by 0.30 × (1 − 1/3) = 0.200. This is NOT a defect in the weighting — it
       is the weighting having nothing to weigh — and it is the number the published "< 0.08" has
       to be stated against. */
    const d = shift(scenarios.runOnly);
    close(d, 0.20, 1e-9, 'an all-RUN window moves the full unweighted amount');
    assert.equal(flatStake(scenarios.runOnly), true, 'every job in that window posts the same');
    const naive = unweighted(scenarios.runOnly.farm).RECALL - unweighted(scenarios.runOnly.base).RECALL;
    close(d, naive, 1e-9, 'weighted and unweighted are the SAME number here, exactly');
    // it is the only scenario in the table with a flat stake, and the only one that reaches 0.200
    for (const [name, s] of Object.entries(scenarios)) {
      if (name === 'runOnly') continue;
      assert.equal(flatStake(s), false, `${name} has a stake spread`);
      assert.ok(shift(s) < 0.2 - 1e-9, `${name} moved ${shift(s).toFixed(4)}, under the flat-stake ceiling`);
    }
  });

  test('stake weighting halves the exploit or better in every window that HAS a stake spread', () => {
    // The guarantee, stated against its condition. A window whose jobs all post the same has no
    // spread for ω to read, and the halving is then arithmetically impossible, not merely missed.
    for (const [name, s] of Object.entries(scenarios)) {
      const weighted = shift(s);
      const naive = unweighted(s.farm).RECALL - unweighted(s.base).RECALL;
      close(naive, 0.20, 1e-9, `${name}: the unweighted scheme always moves 0.200`);
      if (flatStake(s)) {
        close(weighted, naive, 1e-9, `${name}: flat stake — nothing to weigh, so nothing is halved`);
      } else {
        assert.ok(weighted < naive / 1.9, `${name}: weighted ${weighted.toFixed(4)} vs unweighted ${naive.toFixed(4)}`);
      }
    }
  });

  test('FARM_BAND publishes that band and its condition, so the doc cannot drift from the numbers', () => {
    // the four measured figures, recomputed here and matched against the exported strings
    const measured = {
      vaultHeavy: shift(scenarios.vaultHeavy), planSized: shift(scenarios.planSized),
      mixedWeek: shift(scenarios.mixedWeek), jobAndVault: shift(scenarios.jobAndVault),
      defaultOnly: shift(scenarios.defaultOnly), runOnly: shift(scenarios.runOnly),
    };
    for (const [k, v] of Object.entries(measured)) {
      const want = v.toFixed(3);
      const inHolds = FARM_BAND.holds.includes(want);
      const inMisses = FARM_BAND.misses.includes(want) || FARM_BAND.bound.includes(want);
      assert.ok(inHolds || inMisses, `${k} measured ${want}, which appears in neither FARM_BAND string`);
      assert.equal(v < 0.08, inHolds, `${k} (${want}) is filed under the half that matches its size`);
    }
    assert.match(FARM_BAND.claim, /< 0\.08/);
    assert.match(FARM_BAND.misses, /school/, 'the all-RUN window is named, not averaged away');
    assert.equal(Object.isFrozen(FARM_BAND), true);
    /* ROUND 5 — and no string here may generalise the band off the window it was measured on.
       `holds` has always said "a 10-job window"; the doc dropped the qualifier to "any window" and
       "every window", and both are false on the four-job window the sentence itself names. */
    for (const [k, s] of Object.entries(FARM_BAND)) {
      if (k === 'claim' || k === 'bound') continue;
      assert.equal(/on (any|every) window/.test(s), false,
        `FARM_BAND.${k} generalises the band to every window: ${s}`);
    }
    assert.match(FARM_BAND.holds, /FULL 10-job window/, 'the window length is IN the sentence');
    assert.match(FARM_BAND.holds, /spreads the honest press/, 'and so is the press shape');
  });

  test('SHORT WINDOWS: under ten jobs the three decoy RUNs are ADDED, not substituted — 0.300 at four', () => {
    /* ROUND 5 (guard-equilibrium). Every scenario above is built as a ten-job list, and the only
       thing asserted about the published strings was that each ten-job figure appears in one of
       them — so the quantifier was never measured. `heatWindow` is `jobs.slice(-10)`: under ten
       jobs NOTHING is evicted, so the three RUNs own three of four jobs instead of three of ten.
       The window the published sentence literally names — three RUNs and one VAULT, which is what
       a student has after four jobs — moves x̂ by 0.300, not 0.058.

       Driven through `pushHeat`, the writer `state.endJob` actually calls, rather than by handing
       `xHatFrom` a window object. */
    const viaPushHeat = (jobs) => {
      let heat = null;
      for (const j of jobs) heat = pushHeat(heat, j);
      return xHatFrom({ game: { heat } });
    };
    const band = [];
    for (let m = 1; m <= 8; m++) {
      const honest = rep(m, 'VAULT', EVEN);
      const farmed = viaPushHeat([...honest, ...rep(3, 'RUN', DECOY)]);
      band.push({ jobs: farmed.jobs, d: farmed.byWing.RECALL - viaPushHeat(honest).byWing.RECALL });
    }
    assert.equal(band[0].jobs, 4, 'three RUNs and one VAULT is a FOUR-job window');
    close(band[0].d, 0.30, 5e-4, 'and it moves x̂ by the full leverage share, not by 0.058');
    assert.ok(band[0].d > 0.08, 'the published band does not hold on the window the sentence names');
    for (const row of band) assert.ok(row.d > 0, 'the farm always costs something');
    for (let i = 1; i < band.length; i++) {
      assert.ok(band[i].d <= band[i - 1].d + 1e-12,
        `the band decays as the window fills: ${band[i - 1].d} then ${band[i].d}`);
    }
    const firstInside = band.findIndex((r) => r.d < 0.08);
    assert.equal(band[firstInside].jobs, 8, 'nothing is inside 0.08 until the eighth job');
    // every figure of the band is in the published string, to the three places it publishes
    for (const row of band.slice(0, 5)) {
      assert.ok(FARM_BAND.shortWindow.includes(row.d.toFixed(3)),
        `the ${row.jobs}-job window measured ${row.d.toFixed(3)}, which FARM_BAND.shortWindow does not publish`);
    }
    assert.match(FARM_BAND.shortWindow, /BELOW ten jobs/);
    // the leverage bound is what survives down here, and it does survive
    for (let m = 1; m <= 8; m++) {
      const hat = viaPushHeat([...rep(m, 'VAULT', EVEN), ...rep(3, 'RUN', DECOY)]);
      assert.ok(hat.maxShare <= GUARD.jobWeightCap + 1e-12, `maxShare ${hat.maxShare} at ${hat.jobs} jobs`);
    }
  });

  test('AND A FULL TEN-JOB WINDOW IS NOT ENOUGH ON ITS OWN: a concentrated honest press gives up 0.087', () => {
    /* The move is `the decoys' share of the window × (1 − the farmed wing's honest share)`, so the
       three published figures are figures for a student who SPREADS the honest press. A ten-job
       VAULT window whose honest press never touched RECALL gives up the whole share — over the
       band, on a full window holding VAULT work — which is why `holds` names the spread too. */
    const base = rep(10, 'VAULT', REAL);
    const farm = [...rep(7, 'VAULT', REAL), ...rep(3, 'RUN', DECOY)];
    const hat = xOf(farm);
    const d = hat.byWing.RECALL - xOf(base).byWing.RECALL;
    close(d, 0.087, 5e-4, 'a full ten-job VAULT window with a concentrated honest press');
    assert.ok(d > 0.08, 'which is OVER the published band, on a ten-job window holding VAULT work');
    assert.ok(FARM_BAND.misses.includes(d.toFixed(3)),
      `measured ${d.toFixed(3)}, which FARM_BAND.misses does not publish`);
    // and it is exactly the leverage bound, because the honest press held 0 of the farmed wing
    close(xOf(base).byWing.RECALL, 0, 1e-12, 'the honest press never touched RECALL');
    close(d, sum(hat.shares.slice(7)), 1e-9, 'so the farm takes the decoys’ whole share of the window');
    assert.ok(d <= sum(hat.shares.slice(7)) + 1e-9, 'never more than that share — the bound that always holds');
  });

  test('the leverage bound: changing the press on a subset moves x̂ by at most that subset s weight share', () => {
    const rng = mulberry32('j3-leverage');
    for (let k = 0; k < 2000; k++) {
      const n = 2 + Math.floor(rng.next() * 9);
      const posted = Array.from({ length: n }, () => 1 + Math.round(rng.next() ** 2 * 400));
      const honest = posted.map(() => ({ press: { ...EVEN }, posted: 0 }));
      honest.forEach((j, i) => { j.posted = posted[i]; });
      const farmed = honest.map((j, i) => (i >= n - Math.max(1, Math.floor(n / 3)) ? { press: DECOY, posted: j.posted } : j));
      const changed = farmed.filter((j, i) => j.press === DECOY);
      const hat = xOf(farmed);
      const share = sum(changed.map((j) => Math.min(j.posted, hat.cap))) / sum(hat.weights);
      const moved = Math.abs(xOf(farmed).byWing.RECALL - xOf(honest).byWing.RECALL);
      assert.ok(moved <= share + 1e-9, `moved ${moved} > the subset s weight share ${share}`);
    }
  });
});

/* =========================================================================================
   5c. Quitting is free and never a strategy (G3.7 proof 6)
   ========================================================================================= */

describe('J3 · a board that was drafted and abandoned is not a job (G3.7 proof 6)', () => {
  const DAY = '2026-09-21';
  /** Exactly the two records `state.endJob` writes per job: a log entry that knows what was
   *  answered, and a heat-window entry that — before this fix — knew only the board's stake. */
  const rec = (shape, press, { targets, bagged = 0, wing = 'RECALL' } = {}) => ({
    shape, press, targets, bagged, wing, posted: Math.round(POSTED[shape]),
  });
  const saveOf = (jobs) => ({
    game: {
      heat: {
        press: {}, weight: 0, jobs: jobs.length,
        window: jobs.map((j) => ({ press: j.press, posted: j.posted })),
      },
      log: jobs.map((j) => ({
        day: DAY, shape: j.shape, targets: j.targets, bagged: j.bagged,
        posted: j.posted, guard: j.posted > 0 ? j.wing : null,
      })),
    },
  });
  const quit = (shape, press) => rec(shape, press, { targets: 0 });
  const played = (shape, press) => rec(shape, press, { targets: SHAPES[shape].targets, bagged: 9999 });

  test('the work predicates read evidence, and read its absence as work (old saves keep meaning)', () => {
    assert.equal(targetsAnswered({ targets: 0 }), 0);
    assert.equal(targetsAnswered({ answered: 4 }), 4);
    assert.equal(targetsAnswered({ posted: 200 }), null, 'no evidence is not zero evidence');
    assert.equal(workedJob({ posted: 200 }), true, 'a record from before the fix still counts');
    assert.equal(workedJob({ targets: 0, posted: 200 }), false);
    assert.equal(abandonedJob({ targets: 0, posted: 200 }), true);
    assert.equal(abandonedJob({ targets: 0, posted: 0 }), false, 'a stakes-off page is not a scum');
    assert.equal(workedPosted({ targets: 0, posted: 200, shape: 'JOB' }), 0);
    assert.equal(workedPosted({ targets: 10, posted: 200, shape: 'JOB' }), 200, 'all ten answered');
    assert.equal(workedPosted({ targets: 5, posted: 200, shape: 'JOB' }), 100, 'half answered, half credited');
    assert.equal(workedPosted({ posted: 200 }), 200, 'no evidence — the legacy reading');
  });

  test('THE EXPLOIT: three one-tap board-walks move x̂ by exactly nothing', () => {
    // Drafted stake credited as if it were work done: three VAULT boards started and quit in two
    // seconds each pinned the guard at its 0.75 cap on a wing of the student's choosing.
    const honest = Array.from({ length: 7 }, () => played('JOB', EVEN));
    const clean = xHatFrom(saveOf(honest));
    const farmed = xHatFrom(saveOf([...honest, quit('VAULT', DECOY), quit('VAULT', DECOY), quit('VAULT', DECOY)]));
    for (const w of WING_IDS) close(farmed.byWing[w], clean.byWing[w], 1e-12, `${w} moved`);
    assert.equal(farmed.jobs, 7, 'the three walks are not in the window at all');

    // and with nothing but walks there is no x̂ to speak of — a cold start, not a pinned guard
    const only = xHatFrom(saveOf([quit('VAULT', DECOY), quit('VAULT', DECOY), quit('VAULT', DECOY)]));
    assert.equal(only.coldStart, true);
    for (const v of only.values) close(v, 0.25, 1e-12, 'uniform, not the decoy wing');
  });

  test('a job abandoned half way credits half: the window weighs work, not the board s stake', () => {
    const half = rec('JOB', DECOY, { targets: 5, bagged: 10 });
    const full = rec('JOB', DECOY, { targets: 10, bagged: 10 });
    const seven = Array.from({ length: 7 }, () => played('JOB', EVEN));
    const one = xHatFrom(saveOf([...seven, half]));
    const two = xHatFrom(saveOf([...seven, full]));
    close(one.weights[7] / two.weights[7], 0.5, 1e-9, 'five of ten targets is half the weight');
    assert.ok(one.byWing.RECALL < two.byWing.RECALL, 'and therefore less influence');
  });

  test('pushHeat refuses to record a job that answered nothing, and records what it credits', () => {
    let heat = null;
    heat = pushHeat(heat, { press: REAL, posted: 84, targets: 10, shape: 'JOB' });
    assert.equal(heat.window.length, 1);
    assert.equal(heat.window[0].targets, 10);
    assert.equal(heat.window[0].posted, 84, 'the RAW stake is kept, so the entry stays checkable');
    close(heat.weight, 84, 1e-9, 'the accumulator credits the WORKED posted');
    const after = pushHeat(heat, { press: DECOY, posted: 162, targets: 0, shape: 'VAULT' });
    assert.equal(after.window.length, 1, 'the walk is not in the window');
    assert.equal(after.jobs, 1, 'and it is not a job');
    close(after.weight, 84, 1e-9, 'and it weighs nothing');
    close(after.press.FIGURES, 84, 1e-9);
    close(after.press.RECALL, 0, 1e-9, 'the decoy wing got no credit at all');
  });

  test('a window written before the fix is paired against the log, and DROPS what it cannot pair', () => {
    const jobs = [played('JOB', EVEN), quit('VAULT', DECOY)];
    const save = saveOf(jobs);
    assert.equal(save.game.heat.window.every((e) => e.targets === undefined), true, 'the old shape');
    assert.equal(xHatFrom(save).jobs, 1, 'paired by position and checksummed on posted');

    /* When the pairing cannot be established at all, an un-attributable row is DROPPED, not
       credited — the log says a board was walked out of in this reach and any one of these rows
       could be it. Crediting them is the exploit; dropping them costs history and pays nobody. */
    const broken = saveOf(jobs);
    broken.game.log[1].posted += 7;                       // the checksum fails
    assert.equal(xHatFrom(broken).jobs, 0, 'nothing is credited on a guess, and nothing is half-merged');
    assert.equal(xHatFrom(broken).coldStart, true);
    const short = saveOf(jobs);
    short.game.log = short.game.log.slice(1);             // fewer log entries than window entries
    assert.equal(xHatFrom(short).jobs, 0, 'no pairing is possible, so the walk is not credited either');

    /* …and with no walk in reach there is nothing to defend against, so the legacy reading stands
       and an old save keeps every job it earned. */
    const clean = saveOf([played('JOB', EVEN), played('VAULT', DECOY)]);
    clean.game.log[1].posted += 7;
    assert.equal(xHatFrom(clean).jobs, 2, 'no abandoned board in reach — the legacy reading stands');
  });

  test('THE DESYNC: pressing zero tokens on one job does not switch the defence off', () => {
    /* `pushHeat` refuses a row whose press total is 0 while `state.endJob` logs that job anyway, so
       one zero-token press shortens the window by one and slides every older row off its own log
       entry. Three clicks (screens/job.js disables "−" only at n <= 0) then bought a window in which
       three abandoned boards were paired against worked jobs and credited at FULL posted. */
    const varied = (press, targets, posted) => ({ shape: 'JOB', press, targets, bagged: targets ? 9999 : 0, wing: 'RECALL', posted });
    const honest = (p) => Array.from({ length: 7 }, (_, i) => varied(i === 3 && p ? {} : EVEN, 10, 80 + i * 7));
    const walks = [varied(DECOY, 0, 129), varied(DECOY, 0, 136), varied(DECOY, 0, 143)];
    const windowOf = (js) => js.filter((j) => sum(WING_IDS.map((w) => j.press[w] ?? 0)) > 0);
    /* ROUND 7 — the fixture used to set `heat.jobs = js.length`, which is the number of jobs that
       ENDED. `pushHeat` sets it to the number of rows it ACCEPTED, and the gap between the two is
       exactly the desync this test is about, so the old fixture declared "in step" on the very
       window it had put out of step. It is written the way the shipped machine writes it now, and
       `ledger.jobs` — which `state.endJob` folds on every job, next to the log write — with it. */
    const saveRaw = (js) => ({ game: {
      heat: { press: {}, weight: 0, jobs: windowOf(js).length, window: windowOf(js).map((j) => ({ press: j.press, posted: j.posted })) },
      ledger: { jobs: js.length },
      log: js.map((j) => ({ day: DAY, shape: j.shape, targets: j.targets, bagged: j.bagged, posted: j.posted, guard: j.wing })),
    } });

    const baseline = xHatFrom(saveRaw(honest(false))).byWing.RECALL;
    const control = xHatFrom(saveRaw([...honest(false), ...walks])).byWing.RECALL;
    const desynced = xHatFrom(saveRaw([...honest(true), ...walks])).byWing.RECALL;
    close(control, baseline, 1e-12, 'three walks move nothing when every job pressed');
    close(desynced, baseline, 1e-12, 'and they move nothing when one job pressed no tokens either');
    assert.ok(desynced < 0.4, `the decoy wing bought ${desynced.toFixed(4)} of x̂`);

    /* THE SAME WINDOW WITH IDENTICAL JOB-10s, which is where the old defence actually broke. The
       comment here used to read "the exact tail pairing still holds, because a week of 84s pairs
       onto itself whichever way the skip fell" — and that is false: the old tier 2 checked only
       that the last `rows.length` log entries matched the rows on `posted`, never that the rows
       WERE that tail, so on a week of equal stakes a SHIFTED pairing passed. It happened to be
       harmless here only because both walks sit AFTER the skip; move the skip after a walk and the
       walk inherits a worked job's targets (see the school-week test below). The pairing is no
       longer taken on that check: the counters say the lists are one out of step, so every row is
       matched only where all of its feasible log entries agree. The walks are dropped either way,
       and x̂ is where it was. */
    const flat = Array.from({ length: 7 }, (_, i) => varied(i === 3 ? {} : EVEN, 10, 84));
    const flatWalks = [varied(DECOY, 0, 84), varied(DECOY, 0, 84)];
    close(xHatFrom(saveRaw([...flat, ...flatWalks])).byWing.RECALL,
      xHatFrom(saveRaw(flat)).byWing.RECALL, 1e-12, 'identical posted, same answer');

    /* THE SCHOOL WEEK, AND THE ORDER THAT USED TO PAY: an all-RUN week at a flat 36, a board
       drafted and WALKED at job 3 pressing all three tokens on RECALL, and one night at job 6 where
       every token came off before the start. Before round 7 the walk's row slid onto job 4's log
       entry and was credited at full posted — x̂ RECALL 0.125 against 0.000 with the lists in step,
       an honest row dropped in its place, and `FARM_BAND.claim`'s band broken by a factor of three
       off one free action. */
    const runs = ({ zeroAt }) => Array.from({ length: 10 }, (_, i) => {
      if (i === 3) return { shape: 'RUN', press: DECOY, targets: 0, bagged: 0, wing: 'RECALL', posted: 36 };
      if (i === zeroAt) return { shape: 'RUN', press: {}, targets: 4, bagged: 50, wing: 'RECALL', posted: 36 };
      return { shape: 'RUN', press: HONEST_NO_RECALL, targets: 4, bagged: 50, wing: 'RECALL', posted: 36 };
    });
    const week = xHatFrom(saveRaw(runs({ zeroAt: 6 })));
    const inStep = xHatFrom(saveRaw(runs({ zeroAt: -1 })));
    close(inStep.byWing.RECALL, 0, 1e-12, 'in step, the walk buys nothing — that was never in doubt');
    close(week.byWing.RECALL, 0, 1e-12,
      `one zero-press night bought the walked board ${week.byWing.RECALL.toFixed(4)} of x̂`);
    assert.equal(week.jobs < inStep.jobs, true,
      'and it is paid for in history: the rows it cannot attribute are dropped, not guessed at');
  });

  test('NO desync shape pays: 4 000 adversarial windows of walks, zero presses and mixed posted', () => {
    const varied = (press, targets, posted) => ({ press, targets, posted });
    const windowOf = (js) => js.filter((j) => sum(WING_IDS.map((w) => j.press[w] ?? 0)) > 0);
    // `heat.jobs` is the ACCEPTED-row count and `ledger.jobs` the ended-job count — see the note on
    // the fixture above; the gap between them is what tells `withLogEvidence` the lists are apart.
    const saveRaw = (js) => ({ game: {
      heat: { press: {}, weight: 0, jobs: windowOf(js).length, window: windowOf(js).map((j) => ({ press: j.press, posted: j.posted })) },
      ledger: { jobs: js.length },
      log: js.map((j) => ({ day: DAY, shape: 'JOB', targets: j.targets, bagged: 0, posted: j.posted, guard: 'RECALL' })),
    } });
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    let worst = 0;
    let worstAt = null;
    for (let t = 0; t < 4000; t++) {
      const nH = 4 + Math.floor(rnd() * 6);
      const nZ = Math.floor(rnd() * 3);
      const nQ = 1 + Math.floor(rnd() * 4);
      const flat = rnd() < 0.5;
      const post = () => (flat ? 84 : 80 + Math.floor(rnd() * 90));
      const js = [];
      for (let i = 0; i < nH; i++) js.push(varied(EVEN, 10, post()));
      for (let i = 0; i < nZ; i++) js.splice(Math.floor(rnd() * (js.length + 1)), 0, varied({}, 10, post()));
      for (let i = 0; i < nQ; i++) js.push(varied(DECOY, 0, post()));
      const gain = xHatFrom(saveRaw(js)).byWing.RECALL
        - xHatFrom(saveRaw(js.filter((j) => j.targets > 0))).byWing.RECALL;
      if (gain > worst) { worst = gain; worstAt = { nH, nZ, nQ, flat }; }
    }
    assert.ok(worst <= 1e-12, `walking out bought ${worst.toFixed(6)} of x̂ at ${JSON.stringify(worstAt)}`);
  });

  test('THE DESYNC IS ONE FREE ACTION, and the shipped machine still pays the farm nothing', () => {
    /* ROUND 7 (guard-equilibrium). `screens/job.js` enables "−" while n > 0 and `pressRefusal` does
       not refuse a zero press at the board, so three taps take every token off; `state.endJob` then
       logs that job while `pushHeat` refuses a zero-press row, and the two lists are one out of step
       FOR GOOD. The old `withLogEvidence` tier 2 checked only that the last `rows.length` log
       entries matched the rows on `posted`, never that the rows WERE that tail, so the shifted
       pairing passed and the walked board inherited a worked job's targets.

       This drives the whole thing through the shipped machine — `postBoard` → `startJob` → `walk` —
       and asks the only question that matters: can the walk's CHOICE OF WING move x̂? Comparing the
       same seeded save walked with three tokens on wing W against the same save walked with three
       tokens somewhere else isolates the farm from the drop (dropping rows moves x̂ toward uniform
       whatever the press was, which pays the farmer nothing because it cannot aim). */
    let pairs = 0; let desyncs = 0; let worst = 0; let worstAt = null;
    const drive = (i, { farmWing }) => {
      const save = shippedSave(i);
      const b0 = shippedBoard(save);
      if (!b0?.press?.wings?.length || !b0.pressMatters) return null;
      const before = save.game.log.length - (save.game.heat?.window?.length ?? 0);
      const zero = Object.fromEntries(b0.press.wings.map((w) => [w, 0]));   // three taps
      try {
        state.startJob(save, {
          today: SHIPPED_TODAY, now: SHIPPED_NOW, board: b0, seed: b0.seed, tokens: zero,
          picks: b0.recommend?.picks,
        });
      } catch { return null; }
      state.walk(save, { now: SHIPPED_NOW + 1000 });
      const gap = save.game.log.length - (save.game.heat?.window?.length ?? 0);

      const b1 = shippedBoard(save, { now: SHIPPED_NOW + 2000 });
      if (!b1?.press?.wings?.includes(farmWing)) return null;
      const t = Object.fromEntries(b1.press.wings.map((w) => [w, w === farmWing ? GUARD.tokens : 0]));
      try {
        state.startJob(save, {
          today: SHIPPED_TODAY, now: SHIPPED_NOW + 2000, board: b1, seed: b1.seed, tokens: t,
          picks: b1.recommend?.picks,
        });
      } catch { return null; }
      state.walk(save, { now: SHIPPED_NOW + 3000 });
      return { x: xHatFrom(save), desynced: gap > before };
    };
    for (let i = 0; i < 60; i++) {
      for (const W of WING_IDS) {
        const other = WING_IDS.find((w) => w !== W);
        const farm = drive(i, { farmWing: W });
        const ctrl = drive(i, { farmWing: other });
        if (!farm || !ctrl) continue;
        pairs += 1;
        if (farm.desynced) desyncs += 1;
        const gap = Math.abs(farm.x.byWing[W] - ctrl.x.byWing[W]);
        if (gap > worst) { worst = gap; worstAt = { i, W, farm: farm.x.byWing[W], ctrl: ctrl.x.byWing[W] }; }
      }
    }
    assert.ok(pairs >= 100, `only ${pairs} walked pairs reached the comparison`);
    assert.ok(desyncs === pairs,
      `the zero press must put the lists out of step on every run, and it did on ${desyncs} of ${pairs}`);
    assert.ok(worst <= 1e-12,
      `the walk's chosen wing moved x̂ by ${worst.toFixed(6)} at ${JSON.stringify(worstAt)}`);
  });

  test('40 000 desynced windows, real per-shape stakes: choosing the farmed wing buys nothing', () => {
    /* The sweep behind R7-1. Every window is ten jobs at the shipped per-shape posted values, with
       ONE board drafted and walked and ONE night where every token came off — the desync — at
       independent positions, half of them an all-RUN school week (every stake identical, which is
       where the old pairing was blindest) and half mixed. Measured against the pre-round-7 pairing
       the same sweep reported 10 093 of 40 000 windows moved and a worst case of 0.184 on the
       farmed wing, over twice `FARM_BAND.bound`'s all-RUN ceiling. */
    const SHAPE_POSTED = { RUN: 36, JOB: 84, JOB12: 152, VAULT: 162 };
    const SHAPE_IDS = Object.keys(SHAPE_POSTED);
    const saveRaw = (js) => {
      const window = js.filter((j) => sum(WING_IDS.map((w) => j.press[w] ?? 0)) > 0);
      return { game: {
        heat: { press: {}, weight: 0, jobs: window.length, window: window.map((j) => ({ press: j.press, posted: j.posted })) },
        ledger: { jobs: js.length },
        log: js.map((j) => ({ day: DAY, shape: j.shape, targets: j.targets, bagged: 0, posted: j.posted, guard: 'RECALL' })),
      } };
    };
    const xr = (js) => xHatFrom(saveRaw(js)).byWing.RECALL;
    let seed = 20260922;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    let worst = 0; let worstAt = null; let reached = 0; let allRunWeeks = 0;
    const N = 40000;
    for (let t = 0; t < N; t++) {
      const allRun = rnd() < 0.5;
      if (allRun) allRunWeeks += 1;
      const walkAt = Math.floor(rnd() * 10);
      let zeroAt = Math.floor(rnd() * 10);
      if (zeroAt === walkAt) zeroAt = (zeroAt + 1) % 10;
      const shapes = Array.from({ length: 10 }, () => (allRun ? 'RUN' : SHAPE_IDS[Math.floor(rnd() * SHAPE_IDS.length)]));
      const build = (walkPress) => shapes.map((shape, i) => {
        const posted = SHAPE_POSTED[shape];
        if (i === walkAt) return { shape, press: walkPress, targets: 0, posted };
        if (i === zeroAt) return { shape, press: {}, targets: 4, posted };
        return { shape, press: HONEST_NO_RECALL, targets: 4, posted };
      });
      const gain = xr(build(DECOY)) - xr(build(HONEST_NO_RECALL));
      if (gain > 1e-12) reached += 1;
      if (gain > worst) { worst = gain; worstAt = { allRun, walkAt, zeroAt }; }
    }
    assert.ok(allRunWeeks > 1000 && allRunWeeks < N - 1000, `the sweep must drive both weeks: ${allRunWeeks} all-RUN`);
    assert.equal(reached, 0, `the walk's press reached x̂ on ${reached} of ${N} windows`);
    assert.ok(worst <= 1e-12, `max Δx̂ on the farmed wing ${worst.toFixed(6)} at ${JSON.stringify(worstAt)}`);
  });

  test('THE REROLL: the guard you walked out on is still standing', () => {
    // board.jobIndexFor counts logged jobs and a quit writes one, so quitting after the wing was
    // shown re-seeded the draw: press, look, quit, retry, ~2 s a try, mean 1.81 tries. The pinned
    // seed only ever defended the reload. Now there is nothing to reroll.
    const walked = saveOf([played('JOB', EVEN), rec('VAULT', DECOY, { targets: 0, wing: 'ALGEBRA' })]);
    assert.equal(heldWing(walked), 'ALGEBRA');
    const d = guardDist(walked, { support: WING_IDS });
    assert.equal(d.held, 'ALGEBRA');
    assert.deepEqual(d.byWing, { RECALL: 0, FIGURES: 0, WORDS: 0, ALGEBRA: 1 });
    for (let k = 0; k < 200; k++) assert.equal(drawGuard(d, `seed-${k}`), 'ALGEBRA', 'every seed, same wing');
    assert.equal(sum(guardBars(d).map((b) => b.pct)), 100);
    assert.equal(guardBars(d).find((b) => b.wing === 'ALGEBRA').held, true, 'and the board can print it');

    // quitting again does not shake it loose; answering ONE target does
    const twice = saveOf([
      played('JOB', EVEN),
      rec('VAULT', DECOY, { targets: 0, wing: 'ALGEBRA' }),
      rec('VAULT', DECOY, { targets: 0, wing: 'ALGEBRA' }),
    ]);
    assert.equal(heldWing(twice), 'ALGEBRA');
    const released = saveOf([played('JOB', EVEN), rec('VAULT', DECOY, { targets: 1, wing: 'ALGEBRA' })]);
    assert.equal(heldWing(released), null, 'one answered target ends the hold');
    assert.equal(guardDist(released, { support: WING_IDS }).held, null);

    // a stakes-off page carries no guard, so it holds nothing
    const noStake = saveOf([rec('JOB', EVEN, { targets: 0 })]);
    noStake.game.log[0].posted = 0;
    noStake.game.log[0].guard = null;
    assert.equal(heldWing(noStake), null);
  });

  test('the pre-press does not spend a token on a wing the guard is CERTAIN to take', () => {
    const walked = saveOf([played('JOB', EVEN), rec('VAULT', DECOY, { targets: 0, wing: 'ALGEBRA' })]);
    const d = guardDist(walked, { support: WING_IDS });
    assert.equal(d.byWing.ALGEBRA, 1, 'held, with certainty');
    const a = pressAdvice(d, { RECALL: 60, FIGURES: 90, WORDS: 40, ALGEBRA: 200 });
    assert.equal(a.tokens.ALGEBRA, 0, 'a token there pays guardMult, not a bonus — it is waste');
    assert.equal(sum(Object.values(a.tokens)), GUARD.tokens, 'and all three are still spent');
    assert.equal(a.pressSupport.includes('ALGEBRA'), false);
    // the Mercy-blocked wing is the mirror case and is deliberately NOT pre-pressed greedily
    const safe = pressAdvice({ wings: WING_IDS, y: [0.4, 0.3, 0.3, 0] }, { RECALL: 60, FIGURES: 90, WORDS: 40, ALGEBRA: 30 });
    assert.equal(sum(Object.values(safe.tokens)), GUARD.tokens);
    assert.equal(safe.bestResponseWing, 'FIGURES');
  });

  test('RECORDED: the hold ends the SHOPPING, and what it does not end', () => {
    // What the hold closes, and it is the half that paid: the wing can no longer be CHOSEN. Before,
    // a student quit until the draw put the guard on the wing they cared least about — measured over
    // 100 seeded saves x 8 quit-and-retry attempts through the real postBoard/startJob/walk,
    // `scratchpad/shop.mjs`: 1.000 distinct wings reachable per save, from a mean of 1.81 retries to
    // reroll. Deterministic, and printed on the board rather than hidden in a seed.
    const walked = saveOf([played('JOB', EVEN), rec('VAULT', DECOY, { targets: 0, wing: 'ALGEBRA' })]);
    const a = guardDist(walked, { support: WING_IDS });
    const b = guardDist(walked, { support: WING_IDS });
    assert.deepEqual(a.byWing, b.byWing, 'the same board, twice, whatever the seed would have been');

    // What it does NOT close, recorded rather than hidden: the board prints its distribution BEFORE
    // the press (Global law 6), so a held board tells the student the wing before they commit their
    // tokens. That is an edge over honest play, and no fix that lives in this file can remove it —
    // pinning the seed on a getaway count (the critic's own first suggestion) leaks it in exactly
    // the same way, because it is also deterministic. The fix that removes it is state.js/board.js:
    // an abandoned board must be RESUMED, with its press, not re-posted. notes/guard-fix.md R1b.
    // ROUND 6 — and the edge is no longer merely NAMED here: the next test prices it.
    assert.equal(Math.max(...a.y), 1, 'a held board publishes a certainty, and a certainty is knowable');
    assert.equal(a.note === null || typeof a.note === 'string', true);
  });

  test('THE HOLD IS NOT A PRICE: one walk at the board is free, and worth +13.6 % of the board on 120 of 120', () => {
    /* ROUND 6 (guard-equilibrium, verification round 2) — THE BLOCKER, PINNED.
       `guard.js` said "the hold is what makes quitting worthless", `CAP_PANEL_COPY[2]` printed it to
       the student, and `COMPOSED-GAME.md` says "Quitting is free and never a strategy". Measured
       through the shipped machine, the hold ends the SHOPPING for a wing and nothing else: it pins
       the wing you were already shown, at a price of nothing, and hands the next board a fresh
       three-token press against a guard that is now a certainty.

       THIS TEST DOES NOT ASSERT THAT THE GAME IS SOUND. It asserts the size of a hole that no fix
       inside `guard.js` can close (the board must publish the distribution before the press —
       Global law 6), so that the published copy cannot drift back to the opposite of it. The fix
       belongs to `state.js`/`board.js`: an abandoned board RESUMED with its committed press rather
       than re-posted (`notes/guard-fix.md` R1b). See Requests in `notes/repair-guard.md`. */
    const bonus = GUARD.tokenBonus;
    const payoff = (wings, v, tokens, W, rank) => wings.reduce((t, w, i) => (
      t + v[i] * (w === W ? guardMultFor(rank) : 1 + bonus * Math.max(0, tokens[w] ?? 0))
    ), 0);
    /** the whole press on the highest-value wing the guard is NOT on — the one-shot optimum */
    const bestTokens = (wings, v, W) => {
      let k = -1; let best = -Infinity;
      wings.forEach((w, i) => { if (w !== W && v[i] > best) { best = v[i]; k = i; } });
      const t = Object.fromEntries(wings.map((w) => [w, 0]));
      if (k >= 0) t[wings[k]] = GUARD.tokens;
      return t;
    };

    let boards = 0; let heldOk = 0; let sameSeed = 0; let sameContracts = 0;
    let freeRun = 0; let walkedTally = 0;
    let bestBetter = 0; let bestWorse = 0; let preBetter = 0; let preWorse = 0;
    let sumBest = 0; let sumPre = 0; let minBest = Infinity; let maxBest = -Infinity;
    for (let i = 0; i < 120; i++) {
      const save = shippedSave(i);
      const b0 = shippedBoard(save);
      if (!b0?.press?.wings?.length || !b0.pressMatters) continue;
      const rank = rankOf(save);
      const { wings } = b0.press;
      const v = b0.press.v.slice();
      const t0 = { ...b0.press.tokens };

      // the press is sealed HERE, and only then does the guard draw and get printed
      let g0 = null;
      try {
        g0 = state.startJob(save, {
          today: SHIPPED_TODAY, now: SHIPPED_NOW, board: b0, seed: b0.seed, tokens: t0,
          picks: b0.recommend?.picks,
        });
      } catch { continue; }
      const W = g0?.guard?.wing ?? null;
      if (!W || !wings.includes(W)) continue;
      boards += 1;

      const before = {
        rating: save.player?.rating?.value ?? null,
        elo: JSON.stringify(save.player?.elo ?? null),
        walked: save.player?.records?.walked ?? 0,
        bagged: save.player?.bank ?? null,
      };
      const carryOn = payoff(wings, v, t0, W, rank);

      // W → Leave
      const out = state.walk(save, { now: SHIPPED_NOW + 1000 });
      const free = out?.ratesElo !== true
        && !((out?.banked ?? 0) > 0)
        && (save.player?.rating?.value ?? null) === before.rating
        && JSON.stringify(save.player?.elo ?? null) === before.elo;
      if (free) freeRun += 1;
      walkedTally += (save.player?.records?.walked ?? 0) - before.walked;

      // …and re-post
      const b1 = shippedBoard(save, { now: SHIPPED_NOW + 2000 });
      if (!b1?.press?.wings?.length) continue;
      if (b1.seed === b0.seed) sameSeed += 1;
      if (b1.contracts.map((c) => c.line).join('|') === b0.contracts.map((c) => c.line).join('|')) sameContracts += 1;
      if (b1.guard.held === W && Math.abs((b1.guard.byWing[W] ?? 0) - 1) < 1e-9) heldOk += 1;

      const w1 = b1.press.wings;
      const v1 = b1.press.v.slice();
      const rank1 = rankOf(save);
      const gainBest = (payoff(w1, v1, bestTokens(w1, v1, W), W, rank1) - carryOn) / carryOn;
      const gainPre = (payoff(w1, v1, { ...b1.press.tokens }, W, rank1) - carryOn) / carryOn;
      sumBest += gainBest; sumPre += gainPre;
      minBest = Math.min(minBest, gainBest); maxBest = Math.max(maxBest, gainBest);
      if (gainBest > 1e-9) bestBetter += 1; else if (gainBest < -1e-9) bestWorse += 1;
      if (gainPre > 1e-9) preBetter += 1; else if (gainPre < -1e-9) preWorse += 1;
    }

    assert.equal(boards, 120, `the sweep must reach 120 shipped boards: ${boards}`);

    // 1. the walk costs nothing but a tally
    assert.equal(freeRun, boards, 'a walk at the board moved Elo, the rating or the bank');
    assert.equal(walkedTally, boards, 'records.walked is the ONLY durable write, and it is +1 a walk');

    // 2. and buys nothing that a re-roll would have bought: the same board comes back
    assert.equal(sameSeed, boards, 'the re-posted board changed seed — the hold would be shoppable');
    assert.equal(sameContracts, boards, 'the re-posted board changed contracts');
    assert.equal(heldOk, boards, 'the re-posted board did not publish the held wing as a certainty');

    // 3. …but the wing is now KNOWN, and a known wing is worth a press
    assert.equal(bestWorse, 0, 'a walk was worse than playing on, under best play');
    assert.equal(bestBetter, boards,
      `a walk is better on ${bestBetter} of ${boards} boards, not on all of them — restate the copy`);
    assert.ok(minBest > 0, `the walk is weakly dominant by construction: worst board ${(100 * minBest).toFixed(2)} %`);
    const meanBest = 100 * sumBest / boards;
    const meanPre = 100 * sumPre / boards;
    assert.ok(meanBest > 5, `the edge is ${meanBest.toFixed(2)} % — if it has collapsed, restate the copy`);

    /* 4. the copy publishes those numbers and not their opposite. The figures and the measurement
          are one object, exactly as `FARM_BAND` and `X_HAT_FORMULA` are. */
    const hold = CAP_PANEL_COPY[2];
    const num = (re, what) => {
      const m = re.exec(hold);
      assert.ok(m, `${what} is not in the published clause any more: ${hold}`);
      return +m[1];
    };
    assert.equal(/quitting is worthless|never a strategy/i.test(hold), false,
      'the clause claims quitting is worthless again, and it is measured false here');
    assert.match(hold, /ends the SHOPPING/, 'the clause must name what the hold DOES close');
    assert.match(hold, /priced at nothing|costs nothing/, 'and that the walk itself is free');
    assert.equal(num(/better on (\d+) of \d+ boards/, 'the win count'), bestBetter);
    assert.equal(num(/better on \d+ of (\d+) boards/, 'the board count'), boards);
    close(num(/\+([\d.]+) % mean/, 'the mean edge'), meanBest, 0.2, 'the published mean edge');
    close(num(/\+([\d.]+) % at worst/, 'the worst-case edge'), 100 * minBest, 0.2, 'the published floor');
    assert.equal(num(/better on (\d+) and worse on \d+ taking/, 'the pre-press win count'), preBetter);
    assert.equal(num(/better on \d+ and worse on (\d+) taking/, 'the pre-press loss count'), preWorse);
    assert.ok(Math.abs(meanPre) > 0, `(the pre-press mean is ${meanPre.toFixed(2)} %)`);

    // 5. and the docblock that carried the withdrawn sentence carries the measurement instead
    const src = readFileSync(join(ROOT, 'site', 'js', 'job', 'guard.js'), 'utf8');
    assert.equal(/the hold is what makes quitting worthless/.test(src), false,
      'the withdrawn sentence is back in guard.js');
    assert.match(src, /It does not make quitting worthless/,
      'heldWing must carry what was measured, next to the mechanism it describes');
  });

  test('MERCY is not for sale: three walks on one wing do not buy that wing an exemption', () => {
    const three = (targets) => saveOf(Array.from({ length: 3 },
      () => rec('JOB', EVEN, { targets, wing: 'RECALL' })));
    assert.equal(blockedWing(three(10)), 'RECALL', 'three JOBS the guard really took');
    assert.equal(blockedWing(three(0)), null, 'three boards walked off buy nothing');
  });
});

/* =========================================================================================
   6. guardDist — the published distribution (G3.4, G3.6)
   ========================================================================================= */

describe('J3 · guardDist publishes y = project((1−ε)x̂ + ε·uniform, 0.75)', () => {
  test('job 1: uniform, and the board says so — no fabricated cold-start x̂', () => {
    const d = guardDist({}, undefined, undefined);
    assert.equal(d.coldStart, true);
    assert.equal(d.note, COPY.guardColdStart({ n: d.n }));
    for (const v of d.y) close(v, 1 / d.n, 1e-12);
    close(sum(d.y), 1, 1e-12);
    const three = guardDist({}, { support: ['RECALL', 'FIGURES', 'WORDS'] });
    assert.equal(three.note, 'no data — uniform 1/3');
  });

  test('ε comes from the rank ladder (0.25 → 0.10), and rank comes from save.player.rank', () => {
    for (const row of RANKS) {
      assert.equal(epsFor({ player: { rank: row.rank } }), row.eps, `Called ${row.rank}`);
      assert.equal(guardDist({ player: { rank: row.rank } }, undefined, undefined).eps, row.eps);
    }
    assert.equal(rankOf({}), 2, 'the schema default');
    assert.equal(rankOf({ player: { rank: 99 } }), RANKS.length);
    assert.equal(rankOf({ player: { rank: -4 } }), 1);
    assert.equal(epsFor(3), RANKS[2].eps);
  });

  test('the worked case end to end: one wing pressed always, ε = .10, n = 3 → 0.750 / 0.125 / 0.125', () => {
    const save = { game: { heat: { window: rep(4, 'JOB', DECOY) } } };
    const d = guardDist(save, { eps: 0.10, support: ['RECALL', 'FIGURES', 'WORDS'] });
    assert.deepEqual(d.xHat.map((v) => Number(v.toFixed(3))), [1, 0, 0]);
    assert.deepEqual(d.y.map((v) => Number(v.toFixed(3))), [0.750, 0.125, 0.125]);
    close(sum(d.y), 1, 1e-9);
    assert.ok(d.passes <= d.n - 1);
    assert.equal(d.byWing.RECALL, d.y[0]);
  });

  test('y_i ≤ 0.75 on every support of 2 or more — on a board with no log, which is the ONLY regime this sweep reaches', () => {
    /* THE REGIME IS PART OF THE CLAIM. These saves carry a heat window and no `game.log`, so
       `blockedWing` and `heldWing` can only return null and the two regimes in which the shipped
       draw IS a certainty are unreachable here — which is why this test used to be titled "the
       guard is never a certainty" and passed anyway. The bound below is unchanged and unweakened;
       the exceptions are measured in §6b, which drives saves that have a log. */
    const rng = mulberry32('j3-dist');
    for (let k = 0; k < 2000; k++) {
      const n = 2 + (k % 3);
      const support = WING_IDS.slice(0, n);
      const window = Array.from({ length: 1 + Math.floor(rng.next() * 10) }, () => ({
        press: Object.fromEntries(support.map((w) => [w, Math.floor(rng.next() * 4)])),
        posted: Math.round(rng.next() * 300),
      }));
      const save = { game: { heat: { window } }, player: { rank: 1 + (k % 5) } };
      assert.equal(blockedWing(save, support), null, 'no log — Mercy cannot fire in this sweep');
      assert.equal(heldWing(save), null, 'no log — the hold cannot fire in this sweep either');
      const d = guardDist(save, { support });
      close(sum(d.y), 1, 1e-9, 'y is a distribution');
      assert.ok(Math.max(...d.y) <= GUARD.cap + 1e-9, `max y = ${Math.max(...d.y)}`);
      assert.ok(Math.min(...d.y) >= -1e-12);
    }
  });

  test('the ε floor keeps every wing in the draw — no cluster becomes dead weight', () => {
    const save = { game: { heat: { window: rep(10, 'JOB', DECOY) } }, player: { rank: 1 } };
    const d = guardDist(save, { support: ['RECALL', 'FIGURES', 'WORDS'] });
    for (const v of d.y) assert.ok(v > 0, 'a wing never drops to probability zero through ε alone');
    close(d.y[1], d.y[2], 1e-12, 'the two unpressed wings are symmetric');
  });

  test('the support is the wings the board actually touches, and the board can print n', () => {
    const d2 = guardDist({}, { support: ['RECALL', 'ALGEBRA'] });
    assert.equal(d2.n, 2);
    assert.deepEqual(d2.wings, ['RECALL', 'ALGEBRA']);
    assert.equal(COPY.guardSupport({ n: d2.n }), 'guard: 2 wings on the board');
    // a support can also be handed over as the token map the press produces
    assert.deepEqual(guardDist({}, { support: { WORDS: 2, ALGEBRA: 1 } }).wings, ['WORDS', 'ALGEBRA']);
    // and it is read off inProgress.game when the job is already live
    assert.deepEqual(guardDist({ inProgress: { game: { support: ['FIGURES', 'WORDS'] } } }, {}).wings, ['FIGURES', 'WORDS']);
  });

  test('guardBars prints whole percentages that still sum to 100', () => {
    const bars = guardBars(guardDist({}, { support: ['RECALL', 'FIGURES', 'WORDS'] }));
    assert.equal(sum(bars.map((b) => b.pct)), 100);
    assert.deepEqual(bars.map((b) => b.wing), ['RECALL', 'FIGURES', 'WORDS']);
  });

  test('guardDist is pure and does not mutate the save', () => {
    const save = Object.freeze({ player: Object.freeze({ rank: 3 }), game: Object.freeze({ heat: Object.freeze({ window: Object.freeze([]) }) }) });
    assert.deepEqual(guardDist(save, undefined, undefined).y, guardDist(save, undefined, undefined).y);
  });
});

/* =========================================================================================
   6b. The cap, published WITH every condition it has (G4 "Mercy", G3.7 proof 6)
   ========================================================================================= */

/*
   ROUND 4 (guard-equilibrium, finding "the guard may not take the same wing more than 3 jobs
   running is falsifiable — heldWing overrides Mercy"). The finding is right and the CODE is right:
   the hold has to beat Mercy or quitting buys a wing's exemption. What was wrong was the published
   sentence, in two panels and in the doc, and what let it stay wrong was §6's sweep — 2 000 saves
   that carry a heat window and NO `game.log`, so `blockedWing` and `heldWing` are structurally
   unable to fire and "the guard is never a certainty" was asserted over the one regime in which it
   is true.

   This section drives saves that have a log, counts the regimes it reaches, and asserts the law in
   each of them:

       plain board                max y ≤ cap = 0.75
       Mercy on a 2-wing board    the OTHER wing is drawn with certainty
       a board walked out on      that wing is drawn with certainty, Mercy notwithstanding
       a ONE-WING board           that wing is drawn with certainty, with neither of the above

   Measured, shipped path, 3 worked RECALL guards + one abandoned RECALL board:
   `blockedWing → RECALL`, `heldWing → RECALL`, `guardDist().byWing → {RECALL:1, …}`,
   `.blocked → null`. Negative control run before this landed: assert `max y ≤ cap` over this same
   sweep and it fails on the first held save at `max y = 1`.

   ROUND 5 (guard-equilibrium, "a one-wing board is a third exception and the sweep is built so it
   cannot reach one"). The sweep set `n = 2 + (k % 3)`, so n ∈ {2,3,4} and the ONE-wing support was
   excluded by construction — while `tests/job-board.test.mjs` builds exactly that board out of a
   due list that is nothing but one ASN sheet, and `projectWithPasses` returns y unchanged there
   (`n·cap = 0.75 < 1`, so there is no feasible projection to run) with `blocked` and `held` both
   null. The sweep drives n ∈ {1,2,3,4} now and asserts the one-wing regime instead of excluding it;
   `CAP_PANEL_COPY` states the bound on boards with two or more wings and names the one-wing board.
   ========================================================================================= */

describe('J3 · the cap is a bound with its conditions published, not a promise (G4, G3.7 proof 6)', () => {
  const DAY = '2026-09-21';
  /** The two records `state.endJob` writes per job, built through the shipped writer `pushHeat`. */
  const saveOfJobs = (jobs, rank = 3) => {
    let heat = null;
    const log = [];
    for (const j of jobs) {
      heat = pushHeat(heat, { press: j.press, posted: j.posted, targets: j.targets, shape: 'JOB' });
      log.push({
        day: DAY, shape: 'JOB', targets: j.targets, bagged: j.targets ? 9999 : 0,
        posted: j.posted, guard: j.posted > 0 ? j.wing : null,
      });
    }
    return { player: { rank }, game: { heat, log } };
  };

  test('THE CONJUNCTION: three worked guards on one wing, then a board walked out on it — the hold wins', () => {
    const jobs = [
      { press: EVEN, posted: 84, targets: 10, wing: 'RECALL' },
      { press: EVEN, posted: 84, targets: 10, wing: 'RECALL' },
      { press: EVEN, posted: 84, targets: 10, wing: 'RECALL' },
    ];
    const merciful = saveOfJobs(jobs);
    assert.equal(blockedWing(merciful), 'RECALL', 'three worked RECALL guards: Mercy blocks it');
    assert.equal(heldWing(merciful), null);
    const control = guardDist(merciful, { support: WING_IDS });
    assert.equal(control.blocked, 'RECALL');
    assert.equal(control.byWing.RECALL, 0, 'the blocked wing leaves the draw');
    assert.ok(Math.max(...control.y) <= GUARD.cap + 1e-9, 'and the rest is still under the cap');

    // …and now walk out on a fourth board whose guard was the blocked wing
    const walked = saveOfJobs([...jobs, { press: DECOY, posted: 100, targets: 0, wing: 'RECALL' }]);
    assert.equal(blockedWing(walked), 'RECALL', 'Mercy still says RECALL — the walk is not a job');
    assert.equal(heldWing(walked), 'RECALL', 'and the walked board is still holding RECALL');
    const d = guardDist(walked, { support: WING_IDS });
    assert.deepEqual(d.byWing, { RECALL: 1, FIGURES: 0, WORDS: 0, ALGEBRA: 0 },
      'the hold OVERRIDES Mercy: the wing Mercy forbids is drawn with certainty');
    assert.equal(d.held, 'RECALL');
    assert.equal(d.blocked, null, 'and the board prints the hold, not the block');
    assert.equal(Math.max(...d.y), 1, 'so "no wing above 0.75" is false in this reachable state');
    for (let k = 0; k < 50; k++) assert.equal(drawGuard(d, `s-${k}`), 'RECALL', 'every seed');
    // one answered target ends it and Mercy is back in charge
    const resumed = saveOfJobs([...jobs, { press: DECOY, posted: 100, targets: 1, wing: 'RECALL' }]);
    assert.equal(heldWing(resumed), null);
    assert.equal(guardDist(resumed, { support: WING_IDS }).byWing.RECALL, 0, 'blocked again');
  });

  test('MERCY ON A TWO-WING BOARD is the other certainty: the block empties the support', () => {
    const jobs = Array.from({ length: 3 }, () => ({ press: EVEN, posted: 84, targets: 10, wing: 'RECALL' }));
    const d = guardDist(saveOfJobs(jobs), { support: ['RECALL', 'FIGURES'] });
    assert.equal(d.blocked, 'RECALL');
    assert.deepEqual(d.byWing, { RECALL: 0, FIGURES: 1 });
    assert.equal(Math.max(...d.y), 1, 'two wings, one blocked — the other is a certainty');
    close(sum(d.y), 1, 1e-12);
    // with three wings on the board the block is absorbed and the cap holds again
    const three = guardDist(saveOfJobs(jobs), { support: ['RECALL', 'FIGURES', 'WORDS'] });
    assert.ok(Math.max(...three.y) <= GUARD.cap + 1e-9, `max y = ${Math.max(...three.y)}`);
  });

  test('3 000 random saves WITH a log: the bound holds outside its conditions, and the sweep reaches every one', () => {
    const rng = mulberry32('j3-cap-regimes');
    const regimes = { plain: 0, held: 0, mercy2: 0, mercyWide: 0, one: 0 };
    for (let k = 0; k < 3000; k++) {
      const n = 1 + (k % 4);                                  // ROUND 5: n = 1 is in the sweep now
      const support = WING_IDS.slice(0, n);
      const count = 1 + Math.floor(rng.next() * 10);
      const jobs = [];
      for (let j = 0; j < count; j++) {
        jobs.push({
          press: Object.fromEntries(support.map((w) => [w, Math.floor(rng.next() * 4)])),
          posted: 20 + Math.round(rng.next() * 280),
          targets: rng.next() < 0.15 ? 0 : 10,
          wing: support[Math.floor(rng.next() * n)],
        });
      }
      // a third of the sweep is steered into the two exception regimes on purpose, because a sweep
      // that reaches them once in ten thousand tries is the blindness this section exists to close
      if (rng.next() < 0.33) for (const j of jobs.slice(-3)) { j.wing = support[0]; j.targets = 10; }
      if (rng.next() < 0.33) { const last = jobs[jobs.length - 1]; last.targets = 0; last.wing = support[Math.floor(rng.next() * n)]; }

      const save = saveOfJobs(jobs, 1 + (k % 5));
      const held = heldWing(save);
      const blocked = blockedWing(save, support);
      const d = guardDist(save, { support });
      close(sum(d.y), 1, 1e-9, 'y is a distribution in every regime');
      assert.ok(Math.min(...d.y) >= -1e-12);

      if (held && support.includes(held)) {
        regimes.held += 1;
        assert.equal(d.held, held);
        assert.equal(d.blocked, null, 'the hold is published instead of the block');
        assert.equal(d.byWing[held], 1, `held ${held} is a certainty`);
        assert.equal(Math.max(...d.y), 1);
      } else if (blocked && n === 2) {
        regimes.mercy2 += 1;
        assert.equal(d.blocked, blocked);
        assert.equal(d.byWing[blocked], 0, 'the blocked wing leaves the draw entirely');
        assert.equal(Math.max(...d.y), 1, 'and the only wing left is a certainty');
      } else if (n === 1) {
        /* THE THIRD CONDITION. `n·cap = 0.75 < 1`, so `projectWithPasses` has nothing feasible to
           project onto and returns the mix unchanged: the one wing on the board is drawn with
           certainty, with NEITHER printed exception in play. `blockedWing` refuses a one-wing
           support outright ("nowhere else to send it"), so Mercy cannot be what is happening. */
        regimes.one += 1;
        assert.equal(d.held, null, 'not the hold');
        assert.equal(d.blocked, null, 'and not Mercy — a one-wing support cannot be blocked');
        assert.equal(d.byWing[support[0]], 1, `the one wing on the board is a certainty (${support[0]})`);
        assert.equal(Math.max(...d.y), 1,
          'so the 0.75 bound is a bound on boards with TWO OR MORE wings, which is what CAP_PANEL_COPY says');
        assert.equal(projectWithPasses(d.mixed, GUARD.cap).passes, 0, 'no projection pass ran at all');
      } else {
        if (blocked) regimes.mercyWide += 1; else regimes.plain += 1;
        assert.equal(d.held, null);
        assert.ok(Math.max(...d.y) <= GUARD.cap + 1e-9,
          `max y = ${Math.max(...d.y)} on a board with no hold and ${n} wings`);
      }
    }
    // the coverage guarantee: every regime the law names was actually driven
    assert.ok(regimes.held > 100, `held boards reached: ${regimes.held}`);
    assert.ok(regimes.mercy2 > 20, `two-wing Mercy boards reached: ${regimes.mercy2}`);
    assert.ok(regimes.mercyWide > 20, `Mercy on a wider board: ${regimes.mercyWide}`);
    assert.ok(regimes.plain > 400, `plain boards reached: ${regimes.plain}`);
    assert.ok(regimes.one > 100, `one-wing boards reached: ${regimes.one}`);
  });

  test('THE THIRD CONDITION, on the repo\'s own one-wing board: the certainty is printed before the press', () => {
    /* The board `tests/job-board.test.mjs` builds from a due list of nothing but one ASN sheet —
       "an evening whose whole due list is ASN-ANG is ordinary, not exotic" (`board.js`). Driven
       here through `guardDist` alone, so this file stays free of `board.js`. */
    const d = guardDist({ player: { rank: 3 }, game: { heat: { window: [] }, log: [] } }, { support: ['RECALL'] });
    assert.equal(d.n, 1);
    assert.deepEqual(d.y, [1]);
    assert.equal(d.blocked, null);
    assert.equal(d.held, null);
    assert.ok(Math.max(...d.y) > GUARD.cap, 'above the printed cap, with neither printed exception');
    // …and a one-wing board that has ALSO been walked reads as the hold, not as this condition
    const walked = guardDist(
      { player: { rank: 3 }, game: { heat: { window: [] }, log: [{ day: '2026-09-21', shape: 'JOB', targets: 0, bagged: 0, posted: 80, guard: 'RECALL' }] } },
      { support: ['RECALL'] },
    );
    assert.equal(walked.held, 'RECALL');
    // the legend states the bound against this regime rather than enumerating around it
    const [cap, , , summary] = CAP_PANEL_COPY;
    assert.match(cap, /two or more wings/, 'the cap clause names the support size it is a bound on');
    assert.match(cap, /one wing tonight/, 'and names what a one-wing board prints instead');
    assert.match(summary, /two or more wings/, 'and so does the closing sentence');
    assert.match(summary, /three conditions/, 'which counts them, and the count is now three');
  });

  test('CAP_PANEL_COPY publishes the bound WITH all three conditions, and every clause is measured', () => {
    assert.equal(CAP_PANEL_COPY.length, 4);
    assert.equal(Object.isFrozen(CAP_PANEL_COPY), true);
    const [cap, mercy, hold, summary] = CAP_PANEL_COPY;
    // the numerals are the constants, not typed again
    assert.ok(cap.includes(String(GUARD.cap)), 'the cap is printed from GUARD.cap');
    assert.ok(mercy.includes(String(GUARD.sameWingMaxRuns)), 'and the run limit from GUARD.sameWingMaxRuns');
    assert.ok(summary.includes(String(GUARD.cap)) && summary.includes(String(GUARD.sameWingMaxRuns)));
    // clause 1 does not call the press unexploitable, and points at the vector that is
    assert.ok(cap.includes(MAXIMIN_FORMULA), 'the word "unexploitable" is attached to the maximin');
    assert.match(cap, /not a promise/);
    // clause 2 and 3 are the two exceptions, named as exceptions
    assert.match(mercy, /two wings[\s\S]*certainty/);
    assert.match(hold, /probability 1/);
    assert.match(hold, /One answered target ends the hold/);
    // the legend never states the bound without naming its conditions
    assert.equal(CAP_PANEL_COPY.some((s) => /exception|condition/.test(s)), true);
    /* ROUND 5 — and no clause may state the 0.75 bound without the support-size condition beside
       it. A one-wing board draws its wing with probability 1 and is neither the hold nor Mercy, so
       any sentence that prints `GUARD.cap` as an unconditional ceiling is false on a board the
       composer deals tonight. Measured in "THE THIRD CONDITION" above. */
    for (const s of CAP_PANEL_COPY) {
      if (!s.includes(String(GUARD.cap))) continue;
      assert.match(s, /two or more wings|two-wing|exception|condition/,
        `a clause states the ${GUARD.cap} bound with no condition beside it: ${s}`);
    }
    assert.equal(CAP_PANEL_COPY.filter((s) => /two or more wings/.test(s)).length, 2,
      'the support-size condition is on the cap clause AND on the closing sentence');
  });

  test('MERCY IS ON THE BOARD AS A NUMBER AND A LINE, and the copy claims only what is there', () => {
    /* ROUND 7 (guard-equilibrium). `CAP_PANEL_COPY[1]` published "the board prints the block", and
       the board printed nothing: `guardDist` sets the blocked wing's y to 0, `screens/job.js` puts
       `blocked` on `dataset.blocked` and the fill to `scaleX(0)`, and the ONE style that reads the
       flag — `site/css/job.css`, `.job-bar[data-blocked="true"] .job-bar-fill { background:
       var(--muted) }` — recolours a zero-width element. "Mercy" appears in no screen file. So a
       blocked wing was on screen as "RECALL 0%", indistinguishable from any other wing at 0 %.

       Two halves. The COPY now claims only the 0 % — which is asserted here against `guardBars` —
       and `guardDist` now carries a NOTE, the way it already does for the cold start and the hold,
       so the screen has a line to print rather than a flag to style. Printing it is the screen
       lane's (notes/repair-guard.md R7-a). */
    const worked = (wing) => ({ press: { [wing]: 3 }, targets: 10, wing, posted: 84 });
    const save = saveOfJobs([worked('RECALL'), worked('RECALL'), worked('RECALL')]);
    const support = ['RECALL', 'FIGURES', 'WORDS'];
    assert.equal(blockedWing(save, support), 'RECALL', 'three in a row blocks the wing');

    const d = guardDist(save, { support });
    assert.equal(d.blocked, 'RECALL');
    const bars = guardBars(d);
    const row = bars.find((b) => b.wing === 'RECALL');
    assert.equal(row.blocked, true, 'the bar carries the flag');
    assert.equal(row.pct, 0, 'and the number the board prints beside it is 0 %');
    assert.equal(sum(bars.map((b) => b.pct)), 100, 'the rest of the board still sums to 100');

    // the note: a line, in words, naming the wing and the rule — not a style hook
    assert.equal(typeof d.note, 'string', 'a blocked board carries a note the board can print');
    assert.ok(d.note.includes('RECALL'), `the note names the wing: ${d.note}`);
    assert.ok(d.note.includes(String(GUARD.sameWingMaxRuns)), 'and the run limit it came from');
    assert.equal(guardDist(saveOfJobs([worked('RECALL')]), { support }).note, null,
      'and an ordinary board carries no such line');

    // the published sentence claims the 0 %, and does not claim a block is "printed"
    const [, mercy] = CAP_PANEL_COPY;
    assert.equal(/prints the block/.test(mercy), false,
      'the claim that the board prints the block is withdrawn, not reworded');
    assert.match(mercy, /0 %/, 'what it claims instead is the number the board actually shows');
    assert.match(mercy, /leaves the draw entirely/, 'and the mechanism is unchanged');
  });

  test('THE HOLD ALSO BUYS THE BRIEF WINDOWS, and CAP_PANEL_COPY[2] now counts them', () => {
    /* ROUND 7 (guard-equilibrium). The S5 repair prices the brief window's re-press at a REDRAW:
       `state.press` calls `drawGuard(g.guard.dist, repressSeed(g))`, and `g.guard.dist` is the
       board's published `byWing`. On a held board that published vector is a one-hot, so the redraw
       returns the held wing for every seed there is — the price is zero, twice per JOB, against a
       wing that is already known. `CAP_PANEL_COPY[2]` enumerates what the hold is and is not and
       did not contain it.

       `guardDist` now also returns `unheld`, the projection the hold overwrote, so `state.js` CAN
       charge the redraw on a held board (notes/repair-guard.md R7-b). This measures the price with
       and without the hold. */
    const base = saveOfJobs([{ press: EVEN, targets: 10, wing: 'RECALL', posted: 84 }]);
    const plain = guardDist(base, { support: WING_IDS });
    assert.deepEqual(plain.unheld, plain.y, 'on an ordinary board the two vectors are the same');

    const walked = saveOfJobs([
      { press: EVEN, targets: 10, wing: 'RECALL', posted: 84 },
      { press: DECOY, targets: 0, wing: 'ALGEBRA', posted: 162 },
    ]);
    const held = guardDist(walked, { support: WING_IDS });
    assert.equal(held.held, 'ALGEBRA');
    assert.deepEqual(held.byWing, { RECALL: 0, FIGURES: 0, WORDS: 0, ALGEBRA: 1 });
    assert.notDeepEqual(held.unheld, held.y, 'and `unheld` is NOT the one-hot the board publishes');
    close(sum(held.unheld), 1, 1e-9, 'it is a distribution');
    assert.ok(held.unheld.filter((p) => p > 1e-9).length >= 2, 'over more than one wing, so a redraw can move');

    // the price of a redraw, with the hold and without it
    let heldMoved = 0; let unheldMoved = 0;
    const seeds = 200;
    for (let k = 0; k < seeds; k++) {
      const s = `job-seed-${k}|brief1`;
      if (drawGuard(held, s) !== 'ALGEBRA') heldMoved += 1;
      if (drawGuard({ wings: held.wings, y: held.unheld }, s) !== 'ALGEBRA') unheldMoved += 1;
    }
    assert.equal(heldMoved, 0, `the published one-hot redraws to a different wing on ${heldMoved} of ${seeds} seeds`);
    assert.ok(unheldMoved > seeds / 4,
      `the board's unheld distribution is a real price: it moved on only ${unheldMoved} of ${seeds}`);
    assert.equal(SHAPES.JOB.briefs, 2, 'and a JOB has two of those windows');

    const [, , hold] = CAP_PANEL_COPY;
    assert.match(hold, /TWO MORE FREE MOVES/, 'the measured list names the brief windows');
    assert.ok(hold.includes('62.6 %'), 'with the ordinary board s redraw price');
    assert.ok(hold.includes('1000 times out of 1000'), 'and the held board s');
    assert.match(hold, /unheld/, 'and names the vector a fix would draw from');
  });

  test('THE SETTINGS GUARD CARD QUOTES THESE LEGENDS AND DOES NOT RE-AUTHOR THEM', () => {
    /* ROUND 5 (guard-equilibrium BLOCKER). `settings.js guardCard()` printed `CAP_PANEL_COPY` — the
       bound WITH its conditions — and then, thirty lines lower in the same <dl>, a hand-written
       closing line restating the same bound as unconditional and crediting the projection step
       with enforcing it. Both are in the shipped render path whenever the game toggle is on, and
       the second one is false in all three certainty regimes (§6b above). Nothing linted it:
       `tests/job-copy.test.mjs` LAYER_SOURCES is `data/job.js` + `js/job/*.js` + `js/screens/job.js`
       and has never included `settings.js`. This is the guard lane's own lint on its own legends —
       the panel may RENDER `CAP_PANEL_COPY` / `PRESS_PANEL_COPY`, and may not write a second,
       weaker sentence about the cap beside them. */
    const src = readFileSync(join(ROOT, 'site', 'js', 'screens', 'settings.js'), 'utf8');
    // the card is the slice from `function guardCard()` to the next sibling card
    const start = src.indexOf('function guardCard()');
    assert.ok(start > 0, 'settings.js no longer has a guardCard() — this lint needs re-aiming');
    // the next sibling card, whatever it is called
    const end = src.indexOf('\n    function ', start + 1);
    assert.ok(end > start, 'guardCard() has no sibling after it — this lint needs re-aiming');
    const card = src.slice(start, end);
    // every clause of both legends is rendered, so a condition cannot be dropped at the panel
    for (let i = 0; i < CAP_PANEL_COPY.length; i++) {
      assert.ok(card.includes(`CAP_PANEL_COPY[${i}]`), `CAP_PANEL_COPY[${i}] is not rendered by the card`);
    }
    assert.match(card, /PRESS_PANEL_COPY\.map/, 'and the press paragraph is rendered whole');

    // the card's own prose, with its comments removed
    const prose = card.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
    assert.equal(/ROUND 5 \(guard-equilibrium/.test(prose), false, 'the comment stripper works');
    assert.ok(prose.includes('What a token is worth'), 'and it keeps the card s actual copy');

    /* A sentence that pairs the cap with a universal quantifier is the defect this lint exists for:
       the bound is false on a held board, on a two-wing Mercy board and on a one-wing board, so
       "ever"/"always"/"whatever your history" beside it is false however it is worded. The worked
       `project` examples in this card carry 0.75 without any quantifier and are untouched. */
    const capNumerals = [String(GUARD.cap), `${Math.round(GUARD.cap * 100)} %`, 'GUARD.cap'];
    const universal = /\b(ever|never|always|whatever|regardless|every board|any board)\b/i;
    for (const line of prose.split('\n')) {
      if (!capNumerals.some((c) => line.includes(c))) continue;
      assert.equal(universal.test(line), false,
        `settings.js states the ${GUARD.cap} cap with a universal quantifier: ${line.trim()}`);
    }
    // and the exact sentence that was withdrawn may not return in its own words
    assert.equal(/no wing is ever drawn more/.test(prose), false,
      'the withdrawn unconditional cap sentence is back in settings.js');
    assert.equal(/whatever your press history/.test(prose), false,
      'the withdrawn unconditional cap sentence is back in settings.js');

    /* ROUND 6 — ONE SYMBOL, ONE LAW, PER CARD. This card prints the real draw law under `y`
       (`formula('y = project( (1 − ε)·x̂ + ε·uniform_n, cap = … )')`) and then, thirty lines lower,
       `PRESS_PANEL_COPY[2]`. That second string used to be written under the SAME letter, so the
       card published two different laws for `y` — and the second one is off the printed bars by a
       mean of 0.33 (see "g IS NOT THE PRINTED y"). The legend strings are `guard.js`'s, so the fix
       is there; this asserts the card cannot be read the old way whatever it quotes. */
    assert.match(card, /y = project\(/, 'the card no longer prints the real draw law — re-aim this lint');
    const printed = [...CAP_PANEL_COPY, ...PRESS_PANEL_COPY].join('\n');
    assert.equal(/yᵢ\s*=\s*1 − k\/vᵢ/.test(printed), false,
      'a legend this card renders defines `y` a second time, against the draw law above it');
  });
});

/* =========================================================================================
   7. drawGuard — seeded, replayable (G3.6, G3.7 proof 6)
   ========================================================================================= */

describe('J3 · drawGuard is deterministic per seed (G3.6)', () => {
  const dist = guardDist({ game: { heat: { window: rep(3, 'JOB', { RECALL: 2, FIGURES: 1, WORDS: 0 }) } } },
    { eps: 0.15, support: ['RECALL', 'FIGURES', 'WORDS'] });

  test('the same (dist, seed) gives the same wing, 1 000 seeds over', () => {
    for (let i = 0; i < 1000; i++) {
      const s = `job|2026-09-18|${i}`;
      const a = drawGuard(dist, s);
      assert.equal(a, drawGuard(dist, s), `seed ${s}`);
      assert.ok(dist.wings.includes(a));
    }
  });

  test('a number seed and its string form agree — inProgress.game may hold either', () => {
    for (let i = 0; i < 50; i++) assert.equal(drawGuard(dist, i), drawGuard(dist, String(i)));
  });

  test('the realised frequencies match the published bars (20 000 draws, ±0.02)', () => {
    const counts = Object.fromEntries(dist.wings.map((w) => [w, 0]));
    const N = 20000;
    for (let i = 0; i < N; i++) counts[drawGuard(dist, `f${i}`)]++;
    dist.wings.forEach((w, i) => close(counts[w] / N, dist.y[i], 0.02, `${w} drew ${counts[w]}/${N} against a published ${dist.y[i].toFixed(3)}`));
  });

  test('a zero-probability wing is never drawn', () => {
    const d = { wings: ['RECALL', 'FIGURES', 'WORDS'], y: [0.5, 0.5, 0] };
    for (let i = 0; i < 3000; i++) assert.notEqual(drawGuard(d, i), 'WORDS');
  });

  test('drawGuard accepts a bare array, a {wing: p} map and a guardDist result alike', () => {
    assert.equal(drawGuard([1, 0, 0, 0], 'x'), 'RECALL');
    assert.equal(drawGuard({ RECALL: 0, FIGURES: 0, WORDS: 1, ALGEBRA: 0 }, 'x'), 'WORDS');
    assert.ok(WING_IDS.includes(drawGuard(guardDist({}, undefined, undefined), 'x')));
    assert.equal(drawGuard([], 'x'), null);
    assert.equal(drawGuardIndex([0, 0], 'x'), -1);
  });

  test('every draw in this file comes from js/rng.js — guard.js imports rngFrom and nothing else random', () => {
    const src = readFileSync(join(ROOT, 'site', 'js', 'job', 'guard.js'), 'utf8');
    assert.ok(/from\s+['"]\.\.\/rng\.js['"]/.test(src), 'guard.js seeds from js/rng.js');
    const code = stripCommentsAndStrings(src);
    assert.equal(new RegExp(`\\b${['Math', 'random'].join('\\s*\\.\\s*')}\\b`).test(code), false);
  });
});

/* =========================================================================================
   8. The three-in-a-row guard cap (G4 "Mercy")
   ========================================================================================= */

describe('J3 · the guard cannot take the same wing more than three jobs running (G4)', () => {
  const logOf = (...wings) => ({ game: { log: wings.map((w) => ({ guard: w, posted: 100, bagged: 100 })) } });

  test('the constant is 3 (data/job.js)', () => assert.equal(GUARD.sameWingMaxRuns, 3));

  test('three in a row blocks the fourth: y = 0 and 2 000 seeds never draw it', () => {
    const save = logOf('RECALL', 'RECALL', 'RECALL');
    assert.equal(blockedWing(save), 'RECALL');
    const d = guardDist(save, { support: ['RECALL', 'FIGURES', 'WORDS'] });
    assert.equal(d.blocked, 'RECALL');
    assert.equal(d.y[0], 0);
    close(sum(d.y), 1, 1e-9);
    for (let i = 0; i < 2000; i++) assert.notEqual(drawGuard(d, i), 'RECALL');
  });

  test('two in a row does not block, and a break in the run clears it', () => {
    assert.equal(blockedWing(logOf('RECALL', 'RECALL')), null);
    assert.equal(blockedWing(logOf('RECALL', 'RECALL', 'FIGURES')), null);
    assert.equal(blockedWing(logOf('RECALL', 'FIGURES', 'RECALL')), null);
    assert.equal(blockedWing(logOf('WORDS', 'RECALL', 'RECALL', 'RECALL')), 'RECALL', 'only the last three count');
  });

  test('jobs with no guard (the D−2 REVIEW BOARD) are skipped, not counted and not a break', () => {
    const save = { game: { log: [{ guard: 'RECALL' }, { guard: null }, { guard: 'RECALL' }, { guard: 'RECALL' }] } };
    assert.equal(blockedWing(save), 'RECALL');
  });

  test('on a two-wing board the block sends the guard to the other wing with certainty', () => {
    const d = guardDist(logOf('RECALL', 'RECALL', 'RECALL'), { support: ['RECALL', 'WORDS'] });
    assert.deepEqual(d.y, [0, 1]);
    assert.equal(drawGuard(d, 'anything'), 'WORDS');
  });

  test('a one-wing support cannot be blocked — there is nowhere else to send it', () => {
    const d = guardDist(logOf('RECALL', 'RECALL', 'RECALL'), { support: ['RECALL'] });
    assert.equal(d.blocked, null);
    assert.deepEqual(d.y, [1]);
  });

  test('the block is printable: the bar carries `blocked` and the percentages still sum to 100', () => {
    const bars = guardBars(guardDist(logOf('WORDS', 'WORDS', 'WORDS'), { support: ['RECALL', 'FIGURES', 'WORDS'] }));
    assert.equal(bars.find((b) => b.wing === 'WORDS').blocked, true);
    assert.equal(sum(bars.map((b) => b.pct)), 100);
  });

  test('the cap can be overridden explicitly (a shape with no guard history to read)', () => {
    const d = guardDist(logOf('RECALL', 'RECALL', 'RECALL'), { support: ['RECALL', 'FIGURES', 'WORDS'], blocked: null });
    assert.equal(d.blocked, null);
    assert.ok(d.y[0] > 0);
  });
});

/* =========================================================================================
   9. The mixed equilibrium (G3.4)
   ========================================================================================= */

describe('J3 · the fixed point: v_i(1 − y_i) = k, Σy = 1 (G3.4)', () => {
  test('v = (30, 20, 10) → wing 3 leaves the support, n = 2, k = 12.0, y = (0.60, 0.40)', () => {
    const row = PUBLISHED.guardFixedPoints[0];
    const eq = fixedPointMix(row.v, ['A', 'B', 'C']);
    close(eq.k, row.k, 1e-9, 'k');
    close(eq.y[0], row.y[0], 1e-9);
    close(eq.y[1], row.y[1], 1e-9);
    close(eq.y[2], 0, 1e-12, 'the wing that left the support');
    assert.deepEqual(eq.support, ['A', 'B']);
    assert.deepEqual(eq.dropped, ['C']);
    close(sum(eq.y), 1, 1e-9);
    // and the defining condition holds on the support
    close(row.v[0] * (1 - eq.y[0]), eq.k, 1e-9);
    close(row.v[1] * (1 - eq.y[1]), eq.k, 1e-9);
    // k = (n−1)/Σ(1/v) on the surviving support
    close(eq.k, (2 - 1) / (1 / 30 + 1 / 20), 1e-9);
  });

  test('equal values → pure rotation, y = (⅓, ⅓, ⅓), k = 2v/3', () => {
    const eq = fixedPointMix([17, 17, 17], ['A', 'B', 'C']);
    for (const v of eq.y) close(v, 1 / 3, 1e-12);
    close(eq.k, (2 * 17) / 3, 1e-9);
    assert.deepEqual(eq.dropped, []);
  });

  test('the support trimming is correct for every n from 1 to 4', () => {
    assert.deepEqual(fixedPointMix([5], ['A']).y, [1]);
    close(sum(fixedPointMix([9, 1], ['A', 'B']).y), 1, 1e-12);
    const four = fixedPointMix([40, 30, 20, 10], WING_IDS);
    close(sum(four.y), 1, 1e-9);
    for (let i = 0; i < 4; i++) assert.ok(four.y[i] >= -1e-12, 'no negative mass survives the trim');
    for (const w of four.support) close(four.byWing[w] === 0 ? 0 : 1, 1, 1e-12);
  });

  test('a wing worth nothing is dropped and never blocks the solve', () => {
    const eq = fixedPointMix({ RECALL: 30, FIGURES: 20, WORDS: 0, ALGEBRA: 0 });
    close(eq.byWing.RECALL, 0.6, 1e-9);
    close(eq.byWing.FIGURES, 0.4, 1e-9);
    assert.equal(eq.byWing.WORDS, 0);
    assert.deepEqual(fixedPointMix([0, 0, 0], ['A', 'B', 'C']).y.map((v) => Number(v.toFixed(6))), [0.333333, 0.333333, 0.333333]);
  });

  test('pressAdvice publishes the marginal 0.25·v_i·(1 − y_i) and the PLAYER s press, not the house s', () => {
    const dist = { wings: ['RECALL', 'FIGURES', 'WORDS'], y: [0.5, 0.3, 0.2] };
    const v = { RECALL: 30, FIGURES: 20, WORDS: 10 };
    const a = pressAdvice(dist, v);
    close(a.marginal[0], GUARD.tokenBonus * 30 * 0.5, 1e-12);
    close(a.marginal[1], GUARD.tokenBonus * 20 * 0.7, 1e-12);
    close(a.marginal[2], GUARD.tokenBonus * 10 * 0.8, 1e-12);
    assert.equal(sum(Object.values(a.tokens)), GUARD.tokens, 'three tokens, all of them spent');

    // The house's fixed point is still published as evidence, under the name of the side it belongs
    // to. NOTHING in this object is called `equilibrium` any more: there are three vectors here and
    // the word named whichever one the reader was looking at.
    assert.equal('equilibrium' in a, false, 'one name per vector, and none of them is that one');
    assert.equal('equilibrium' in a.byWing.RECALL, false);
    close(a.k, 12, 1e-9);
    close(a.value, 12, 1e-9, 'k IS the value of the game, and both sides are stated over it');
    assert.deepEqual(a.support, ['RECALL', 'FIGURES'], 'the HOUSE s support drops the 10-value wing');
    close(a.guardMix[0], 0.6, 1e-9);
    close(a.guardMix[1], 0.4, 1e-9);
    close(a.guardMix[2], 0, 1e-9);
    // and the PLAYER's half of that same fixed point is the reciprocal ordering, not `guardMix`
    close(a.maximin[0], 0.4, 1e-9);
    close(a.maximin[1], 0.6, 1e-9);
    close(a.maximin[2], 0, 1e-9);

    // ...but the TOKENS are the player's side. Pre-pressing y put the player on the house's half of
    // a zero-sum game: on this board it guarantees 8.0 against a flat press's 10.0.
    assert.notDeepEqual(a.tokens, { RECALL: 2, FIGURES: 1, WORDS: 0 }, 'not the house s vector');
    assert.deepEqual(a.tokens, { RECALL: 1, FIGURES: 1, WORDS: 1 });
    assert.deepEqual(a.pressSupport.slice().sort(), ['FIGURES', 'RECALL', 'WORDS']);
    assert.equal(a.bestResponseWing, 'RECALL');
  });

  test('the press is p_i = A − B/v_i, the best stationary reply to the guard this file implements', () => {
    // y_i = (1−ε)x̂_i + ε/n and a repeated press IS x̂, so U(p) = Σ p_i v_i (1 − (1−ε)p_i − ε/n).
    // ∂U/∂p_i = λ gives p_i = A − B/v_i with A = (1 − ε/n)/(2(1−ε)). Re-derived here from the
    // definition of U by grid search, never from the closed form the module uses.
    const wings = ['RECALL', 'FIGURES', 'WORDS'];
    const v = [30, 20, 10];
    const eps = epsFor(null);
    const n = 3;
    const U = (p) => sum(p.map((pi, i) => pi * v[i] * (1 - (1 - eps) * pi - eps / n)));
    const got = stationaryPress(v, wings, { eps, n });
    close(sum(got.p), 1, 1e-12, 'a distribution');

    let best = null;
    let bestU = -Infinity;
    const step = 0.002;
    for (let a = 0; a <= 1 + 1e-9; a += step) {
      for (let b = 0; a + b <= 1 + 1e-9; b += step) {
        const p = [a, b, 1 - a - b];
        const u = U(p);
        if (u > bestU) { bestU = u; best = p; }
      }
    }
    best.forEach((pi, i) => close(got.p[i], pi, 2 * step, `wing ${i}: grid ${pi} vs closed form ${got.p[i]}`));
    assert.ok(U(got.p) >= bestU - 1e-6, 'the closed form attains the grid optimum');

    // and it beats both of the things that were shipped or suggested before it
    const flat = [1 / 3, 1 / 3, 1 / 3];
    const houseEq = fixedPointMix(v, wings).y;
    assert.ok(U(got.p) > U(flat), `stationary ${U(got.p)} vs flat ${U(flat)}`);
    assert.ok(U(flat) > U(houseEq), `flat ${U(flat)} vs the house s own mix ${U(houseEq)}`);

    // p is increasing in v, and positive on every wing a real board deals
    for (let i = 1; i < v.length; i++) assert.ok(got.p[i - 1] > got.p[i], 'more value, more pressure');
    const real = stationaryPress([43.8, 131.3, 71.3, 33.8], WING_IDS, { eps, n: 4 });
    real.p.forEach((pi, i) => assert.ok(pi > 0, `${WING_IDS[i]} is pressed, not abandoned`));
    close(sum(real.p), 1, 1e-12);
  });

  test('a wing worth too little to press leaves the press support rather than taking a token', () => {
    const got = stationaryPress([100, 1], ['RECALL', 'FIGURES'], { eps: 0, n: 2 });
    close(sum(got.p), 1, 1e-12);
    got.p.forEach((pi) => assert.ok(pi >= 0, 'never a negative press'));
    const one = stationaryPress([50], ['RECALL'], { eps: 0.2, n: 1 });
    assert.deepEqual(one.p, [1]);
    assert.deepEqual(stationaryPress([0, 0], ['RECALL', 'FIGURES'], { eps: 0.2, n: 2 }).p, [0.5, 0.5]);
  });

  test('y = 1 − k/v is the GUARD s side: pressing it is exploitable, x ∝ 1/v is not', () => {
    /* COMPOSED-GAME.md §3.4 derives y from `v_i(1 − y_i) = k`. That is the PLAYER's indifference
       condition, and the side a condition pins is the other one — so y is the House's mix. Settings
       published it as "the unexploitable" press. It is not: against a guard that reads the press and
       takes the best wing for itself, pressing y scores strictly under the value of the game, and
       the vector that does score the value is the reciprocal ordering. */
    const v = [30, 20, 10];
    const wings = ['RECALL', 'FIGURES', 'WORDS'];
    const value = (x) => sum(x.map((xi, i) => xi * v[i])) - Math.max(...x.map((xi, i) => xi * v[i]));

    const house = fixedPointMix(v, wings);
    const mm = maximinPress(v, wings);
    close(house.k, 12, 1e-9);
    close(mm.value, house.k, 1e-12, 'the value of the game is k, and maximinPress states it');
    assert.deepEqual(mm.support, house.support, 'both sides live on the same support');
    close(mm.x[0], 0.4, 1e-9);
    close(mm.x[1], 0.6, 1e-9);
    close(mm.x[2], 0, 1e-9);
    // x_i · v_i is equal across the support — which is exactly why no wing is worth guarding
    close(mm.x[0] * v[0], mm.x[1] * v[1], 1e-9);

    close(value(mm.x), house.k, 1e-9, 'x ∝ 1/v guarantees the value against ANY guard');
    close(value(house.y), 8, 1e-9, 'the published press guarantees 8.0 of an available 12.0');
    assert.ok(value(house.y) < value(mm.x) - 1e-9, 'so the published press IS exploitable');
    close(value(v.map((x) => x / sum(v))), 25 / 3, 1e-9);
    assert.ok(value(v.map((x) => x / sum(v))) < value(mm.x) - 1e-9,
      'and "in proportion to study value" is not the maximin either — it is its reciprocal, and it '
      + 'gives up 8.33 of 12.00');

    /* …and neither of those is what the board should press, because the guard this layer ships does
       not minimise: `y` mirrors `x̂` (G3.4), and a repeated press IS `x̂`. Against THAT house the
       stationary press wins, which is why it is the vector `tokens` apportions. */
    const eps = 0.15;
    const vs = (x) => sum(x.map((xi, i) => xi * v[i] * (1 - ((1 - eps) * xi + eps / 3))));
    const shipped = stationaryPress(v, wings, { eps, n: 3 }).p;
    assert.ok(vs(shipped) > vs(house.y) + 1e-9, 'the board s press beats the guard s own mix');
    assert.ok(vs(shipped) > vs(mm.x) + 1e-9, 'and beats the maximin, against the house that exists');
    assert.ok(value(shipped) > value(house.y) + 1e-9, 'while still beating it against a minimiser');

    // one name per vector, and each names the side it belongs to
    assert.match(GUARD_MIX_FORMULA, /GUARD/);
    assert.match(MAXIMIN_FORMULA, /1\/vᵢ/);
    assert.match(PRESS_FORMULA, /A − B\/vᵢ/);
    const a = pressAdvice({ wings, y: [0.4, 0.35, 0.25], eps }, { RECALL: 30, FIGURES: 20, WORDS: 10 });
    assert.deepEqual(a.guardMix.map((x) => +x.toFixed(6)), house.y.map((x) => +x.toFixed(6)));
    assert.deepEqual(a.maximin.map((x) => +x.toFixed(6)), mm.x.map((x) => +x.toFixed(6)));
    assert.deepEqual(a.press.map((x) => +x.toFixed(6)), shipped.map((x) => +x.toFixed(6)));
  });

  test('THE THREE PUBLISHED LAWS ARE THE RUNNING ONES: each string, READ and executed, reproduces its own function', () => {
    /* ROUND 5. The round-4 replacement for the regex-only lint had the arrow the wrong way round:
       it typed the law into the TEST (`const A_of = (eps, n) => (1 - eps / n) / (2 * (1 - eps))`)
       and asserted `stationaryPress().A` against THAT, and it never dereferenced `PRESS_FORMULA` or
       `GUARD_MIX_FORMULA` at all — they appeared only inside its comments. So both published
       strings were free: mutating `PRESS_FORMULA`'s A to `1/(2(1 − ε))` — the exact falsehood that
       test called its negative control — and `GUARD_MIX_FORMULA`'s k to `n/Σ(1/vᵢ)` left the full
       suite green, while both strings are rendered verbatim to the student (`settings.js`
       `PRESS_PANEL_COPY.map(line => hint(line))`).

       The law is now taken OUT OF THE STRING and executed. `readLaw` below is a reader for the
       glyphs the published strings are written in (−, ᵢ, ε, implicit multiplication) and knows no
       algebra whatsoever: it evaluates + − × ÷, parentheses and the names it is handed, and throws
       on anything else. Nothing in this test names the shape of a law; the strings do.

       THE NEGATIVE CONTROLS ARE SHIPPED, not run once in a scratchpad — both mutations above are
       fed to the same reader at the end of this test and asserted to be caught. */

    /** Evaluate one published sub-expression. Reader only: no algebra, no functions, no names but
     *  the ones `env` binds. Throws rather than returning NaN, so a law it cannot read is red. */
    const readLaw = (src, env) => {
      const s = String(src).replace(/−/g, '-').replace(/[·×]/g, '*').replace(/ᵢ/g, '').replace(/\s+/g, '');
      let i = 0;
      const factor = () => {
        if (s[i] === '-') { i += 1; return -factor(); }
        if (s[i] === '(') {
          i += 1;
          const v = expr();
          assert.equal(s[i], ')', `unbalanced parentheses in the published law: ${src}`);
          i += 1;
          return v;
        }
        const num = /^\d+(\.\d+)?/.exec(s.slice(i));
        if (num) { i += num[0].length; return +num[0]; }
        const name = /^[A-Za-zε]+/.exec(s.slice(i));
        assert.ok(name, `the reader cannot read the published law at ${i}: ${src}`);
        i += name[0].length;
        assert.ok(Object.hasOwn(env, name[0]),
          `the published law names "${name[0]}", which this test does not bind: ${src}`);
        return env[name[0]];
      };
      const term = () => {
        let v = factor();
        for (;;) {
          if (s[i] === '*') { i += 1; v *= factor(); } else if (s[i] === '/') { i += 1; v /= factor(); } else if (s[i] === '(') { v *= factor(); } else return v;
        }
      };
      const expr = () => {
        let v = term();
        for (;;) {
          if (s[i] === '+') { i += 1; v += term(); } else if (s[i] === '-') { i += 1; v -= term(); } else return v;
        }
      };
      const out = expr();
      assert.equal(i, s.length, `the reader did not consume the whole published law: ${src}`);
      assert.ok(Number.isFinite(out), `the published law did not evaluate to a number: ${src}`);
      return out;
    };
    /** Pull one named piece out of a published string, and fail loudly if it is not there. */
    const piece = (src, re, what) => {
      const m = re.exec(src);
      assert.ok(m, `${what} is not in the published string any more: ${src}`);
      return m[1].trim();
    };

    /* what each string says, lifted from the string itself */
    /* ROUND 6 — the symbol is `gᵢ`, not `yᵢ`. The settings card prints the real draw law
       `y = project((1 − ε)x̂ + ε·uniform, cap)` and this string in the same <dl>, and one card may
       not publish two different laws for one letter. See "g IS NOT THE PRINTED y" below. */
    const yRule = piece(GUARD_MIX_FORMULA, /^\s*gᵢ\s*=\s*([^,]+)/, 'the g rule');          // '1 − k/vᵢ'
    const kRule = piece(GUARD_MIX_FORMULA, /,\s*k\s*=\s*([^—]+)/, 'the k rule');           // '(n − 1)/Σ(1/vᵢ)'
    const [kNumer, kSigma] = kRule.split('/Σ');
    assert.ok(kSigma, `the k rule stopped being a quotient by a Σ: ${kRule}`);
    const xRule = piece(MAXIMIN_FORMULA, /^\s*xᵢ\s*∝\s*(\S+)/, 'the maximin rule');         // '1/vᵢ'
    assert.match(MAXIMIN_FORMULA, /over the same support/, 'the maximin string names its support');
    const pRule = piece(PRESS_FORMULA, /^\s*pᵢ\s*=\s*([^,]+)/, 'the press rule');           // 'A − B/vᵢ'
    const aRule = piece(PRESS_FORMULA, /,\s*A\s*=\s*([^,]+)/, 'the A term');                // '(1 − ε/n)/(2(1 − ε))'
    const pTotal = +piece(PRESS_FORMULA, /Σp\s*=\s*(\d+(?:\.\d+)?)/, 'the Σp normalisation');

    const rng = mulberry32('j3-laws');
    for (let k = 0; k < 600; k++) {
      const n = 2 + (k % 3);
      const wings = WING_IDS.slice(0, n);
      const v = Array.from({ length: n }, () => 1 + rng.next() * 200);

      // GUARD_MIX_FORMULA — read out of the string, then run against fixedPointMix
      const eq = fixedPointMix(v, wings);
      const S = eq.support.map((w) => wings.indexOf(w));
      const kLaw = readLaw(kNumer, { n: S.length }) / sum(S.map((i) => readLaw(kSigma, { v: v[i] })));
      close(eq.k, kLaw, 1e-9, `${GUARD_MIX_FORMULA} — k over the support it settles on (n = ${S.length})`);
      for (const i of S) close(eq.y[i], readLaw(yRule, { k: kLaw, v: v[i] }), 1e-9, `${GUARD_MIX_FORMULA} — y on the support`);
      for (let i = 0; i < n; i++) if (!S.includes(i)) close(eq.y[i], 0, 1e-12, 'and 0 off the support');
      close(sum(eq.y), 1, 1e-9, 'y is a distribution');

      // MAXIMIN_FORMULA — the proportionality is read out of the string too
      const mm = maximinPress(v, wings);
      assert.deepEqual(mm.support, eq.support, 'the same support, as the string says');
      const raw = S.map((i) => readLaw(xRule, { v: v[i] }));
      const rawSum = sum(raw);
      S.forEach((i, j) => close(mm.x[i], raw[j] / rawSum, 1e-12, `${MAXIMIN_FORMULA} — on the support`));
      for (let i = 0; i < n; i++) if (!S.includes(i)) close(mm.x[i], 0, 1e-12, 'and 0 off it');
      close(sum(mm.x), 1, 1e-12);
      close(mm.value, kLaw, 1e-9, 'worth k — the string says k, so k is checked, not just Σx');
      const worth = sum(mm.x.map((xi, i) => xi * v[i])) - Math.max(...mm.x.map((xi, i) => xi * v[i]));
      close(worth, kLaw, 1e-9, 'and k is what it is worth against a guard that takes the best wing');

      // PRESS_FORMULA — A, the p rule and the Σp normalisation, all three read out of the string
      for (const r of RANKS) {
        const sp = stationaryPress(v, wings, { eps: r.eps, n });
        close(sp.A, readLaw(aRule, { ε: r.eps, n }), 1e-12,
          `${PRESS_FORMULA} — A at Called ${r.rank}`);
        const P = sp.support.map((w) => wings.indexOf(w));
        for (const i of P) close(sp.p[i], readLaw(pRule, { A: sp.A, B: sp.B, v: v[i] }), 1e-12,
          `${PRESS_FORMULA} — p on the support`);
        close(sum(sp.p), pTotal, 1e-12, 'B is set so Σp = 1, as the string says');
        if (P.length > 1) {
          close(sp.B, (P.length * sp.A - 1) / sum(P.map((i) => 1 / v[i])), 1e-9,
            'which pins B to (|S|·A − 1)/Σ_S(1/vᵢ)');
        }
        for (const p of sp.p) assert.ok(p >= -1e-12, 'never a negative press');
      }
    }

    /* THE NEGATIVE CONTROLS, SHIPPED. Each is the mutation that survived the round-4 test; the
       reader is handed the mutated law and the disagreement with the running function is asserted,
       so this test is known to be able to fail rather than merely observed to pass. */
    const v3 = [30, 20, 10];
    const wings3 = ['A', 'B', 'C'];
    const sp3 = stationaryPress(v3, wings3, { eps: RANKS[0].eps, n: 3 });
    close(sp3.A, 0.611111111111111, 1e-12, 'A at Called 1 on a three-wing board');
    const badA = piece(PRESS_FORMULA.replace(aRule, '1/(2(1 − ε))'), /,\s*A\s*=\s*([^,]+)/, 'the mutated A');
    assert.notEqual(badA, aRule, 'the control must actually differ from the shipped law');
    close(readLaw(badA, { ε: RANKS[0].eps, n: 3 }), 0.6666666666666666, 1e-12, 'the dropped-ε/n control');
    assert.ok(Math.abs(readLaw(badA, { ε: RANKS[0].eps, n: 3 }) - sp3.A) > 0.05,
      'A = 1/(2(1 − ε)) must be CAUGHT by this reader — it is 0.0556 out at Called 1');

    const eq3 = fixedPointMix(v3, wings3);
    close(eq3.k, 12, 1e-9);
    const S3 = eq3.support.map((w) => wings3.indexOf(w));
    const sigma3 = sum(S3.map((i) => readLaw(kSigma, { v: v3[i] })));
    close(readLaw(kNumer, { n: S3.length }) / sigma3, eq3.k, 1e-9, 'the shipped k rule, read and run');
    const badKNumer = kNumer.replace(/\(\s*n\s*-\s*1\s*\)|\(\s*n\s*−\s*1\s*\)/, '(n)');
    assert.notEqual(badKNumer, kNumer, 'the control must actually differ from the shipped numerator');
    assert.ok(Math.abs(readLaw(badKNumer, { n: S3.length }) / sigma3 - eq3.k) > 1,
      'k = n/Σ(1/vᵢ) must be CAUGHT by this reader — it is 24 against the shipped 12 here');

    /* And a pin on the strings themselves, because a reader can only catch a law that still parses:
       a silent reword is caught here instead. These literals are the drift guard, never the source
       of truth — every assertion above runs the string, not this table. */
    assert.equal(GUARD_MIX_FORMULA, 'gᵢ = 1 − k/vᵢ,  k = (n − 1)/Σ(1/vᵢ)   — the way a GUARD that MINIMISED would have to mix; this one does not, it mirrors x̂');
    /* ROUND 6 — and the two halves that make it unreadable as the printed bars stay pinned: a
       symbol that is not `y`, and a tense that is not the present indicative about this guard. */
    assert.equal(/^yᵢ\s*=/.test(GUARD_MIX_FORMULA), false,
      'the guard-mix string is back under the letter the drawn distribution already uses');
    assert.equal(/the GUARD mixes this way/.test(GUARD_MIX_FORMULA), false,
      'the unqualified present tense is back: this guard does not mix this way');
    assert.match(GUARD_MIX_FORMULA, /MINIMISED|minimis/,
      'the string must say whose mixing it is — a minimiser s, not this one s');
    assert.match(GUARD_MIX_FORMULA, /mirrors x̂/, 'and name what this one does instead');
    assert.equal(MAXIMIN_FORMULA, 'xᵢ ∝ 1/vᵢ over the same support   — worth k against a guard that reads your press');
    assert.equal(PRESS_FORMULA, 'pᵢ = A − B/vᵢ,  A = (1 − ε/n)/(2(1 − ε)),  B set so Σp = 1');
    assert.equal(X_HAT_FORMULA.law, 'x̂ᵢ = (Σⱼ ωⱼ·shareᵢⱼ + β/n) / (Σⱼ ωⱼ + β)');
  });

  test('PRESS_PANEL_COPY names each vector for its own side, and the numbers back every sentence', () => {
    /* The one panel G7 lets print the real formula printed `y` as "the unexploitable answer … in
       proportion to their study value". Three separate things wrong, all of them measurable, so the
       paragraph is assembled from the three exported formulae rather than written again by hand. */
    const wings = ['RECALL', 'FIGURES', 'WORDS'];
    const v = { RECALL: 30, FIGURES: 20, WORDS: 10 };
    const a = pressAdvice({ wings, y: [0.4, 0.35, 0.25], eps: 0.15 }, v);

    assert.equal(PRESS_PANEL_COPY.length, 4);
    assert.equal(Object.isFrozen(PRESS_PANEL_COPY), true);
    const [rule, press, guard, maximin] = PRESS_PANEL_COPY;
    assert.match(rule, /pays only where the guard is not/);
    assert.ok(press.includes(PRESS_FORMULA), 'sentence 2 prints the formula the board pre-presses');
    assert.ok(guard.includes(GUARD_MIX_FORMULA), 'sentence 3 prints the guard s, named as the guard s');
    assert.ok(maximin.includes(MAXIMIN_FORMULA), 'sentence 4 prints the maximin, named as the maximin');
    assert.match(press, /pre-presses/);
    assert.match(guard, /HOUSE/);
    assert.match(maximin, /unexploitable/);
    for (const s of PRESS_PANEL_COPY) {
      assert.equal(/in proportion to (their|the) study value/.test(s), false,
        'the sentence that reversed the ordering is gone, not reworded');
    }
    assert.equal(rule.includes(GUARD_MIX_FORMULA) || press.includes(GUARD_MIX_FORMULA), false,
      'the guard s mixing is never printed as the answer or as the pre-press');

    // …and the claims the sentences make, measured on the board the panel describes
    assert.deepEqual(a.tokens, { RECALL: 1, FIGURES: 1, WORDS: 1 }, 'the pre-press spends on all three');
    assert.ok(a.guardMix[2] < 1e-9 && a.tokens.WORDS === 1,
      'y puts 0 of 3 on the third wing and the board puts 1 — the whole-token difference the panel used to publish');
    assert.ok(a.maximin[1] > a.maximin[0] + 1e-9,
      'the maximin really does weight the LOWER-value wing more, so sentence 4 is not a slogan');
    assert.ok(a.press[0] > a.press[1] + 1e-9 && a.press[1] > a.press[2] + 1e-9,
      'while the press the board commits is increasing in v, and positive on every wing IT KEEPS');
    for (const p of a.press) assert.ok(p > 0, 'every wing of THIS board is pressed');
  });

  test('SENTENCE 2 IS TRUE ON FOUR WINGS TOO: the press keeps a support, and drops what is worth too little', () => {
    /* ROUND 5 (guard-equilibrium). The sentence read "positive on every wing of every board the
       composer deals", and the only board it was ever checked on was the hand-made three-wing
       `v = (30, 20, 10)` above, where the drop never fires. Measured through the shipped
       `postBoard` over 500 seeded saves: a support wing is pressed at 0 on 55.6 % of FOUR-wing
       boards (86 of 500 boards overall) — `stationaryPress` drops a wing exactly as `fixedPointMix`
       does. `v = (58.5, 131.25, 71.25, 18)` below is one of those real boards, wing order
       `WING_IDS`, and PRESS_PANEL_COPY prints its numbers.

       What IS universal — and what the sentence claims now — is the ORDERING and positivity on the
       support the press keeps. `B = (|S|·A − 1)/Σ_S(1/vᵢ) ≥ 0` because `A ≥ ½` and `|S| ≥ 2`, so
       `p = A − B/v` is non-decreasing in `v`, and a dropped wing is always one of the lowest-value
       ones. Both are asserted over 3 000 random boards, four wings included. */
    const [, press] = PRESS_PANEL_COPY;
    assert.equal(/positive on every wing of every board/.test(press), false,
      'the universal is gone, not reworded');
    assert.match(press, /positive on every wing the press KEEPS/);

    /* THE ORDERING IS BY STUDY VALUE, WITH ONE EXCEPTION, and the sentence says exactly that.
       `pressAdvice` zeroes a wing the guard is CERTAIN to take before the press is solved (`vPress`
       — a token there pays `guardMult`, not `1 + 0.25·tokens`), so a held board can print a wing
       with the highest v on the board and 0 tokens on it. That is the ONLY place `p` departs from
       `v`; everywhere else it follows `v` exactly, which is NOT the same as following what a token
       is worth. ROUND 6: the round-5 sentence said "a wing a token is worth more on" and is
       measured false on 17.6 % of shipped boards — see the next test. */
    const heldBoard = pressAdvice({ wings: ['RECALL', 'FIGURES', 'WORDS'], y: [1, 0, 0], eps: 0.2 },
      { RECALL: 500, FIGURES: 20, WORDS: 10 });
    assert.equal(heldBoard.press[0], 0, 'the wing the guard is certain to take is pressed at 0…');
    assert.ok(heldBoard.press[1] > 0 && heldBoard.press[2] > 0, '…however high its study value');
    assert.equal(heldBoard.v[0], 500, 'and it really is the highest-value wing on that board');
    assert.match(press, /never presses one wing harder than a wing of greater STUDY VALUE/,
      'the sentence orders by the value the press actually orders by');
    assert.equal(/never presses one wing harder than a wing a token is worth more on/.test(press), false,
      'the round-5 ordering claim is back, and it is false on 17.6 % of shipped boards');
    assert.match(press, /a wing the guard is certain to take, however high its study value/,
      'and names the certain-guard wing as the one exception to the v ordering');

    // the real four-wing board the sentence prints, at every rank's ε
    const w4 = ['RECALL', 'FIGURES', 'WORDS', 'ALGEBRA'];
    const v4 = [58.5, 131.25, 71.25, 18];
    assert.ok(press.includes(`v = (${v4.join(', ')})`), `the sentence prints v = (${v4.join(', ')})`);
    for (const r of RANKS) {
      const sp = stationaryPress(v4, w4, { eps: r.eps, n: 4 });
      assert.deepEqual(sp.dropped, ['ALGEBRA'], `Called ${r.rank}: the lowest-value wing leaves the support`);
      assert.equal(sp.p[3], 0, 'and is pressed at 0 — a support wing of the board, pressed at nothing');
      assert.ok(sp.support.length === 3 && !sp.support.includes('ALGEBRA'));
    }
    const shown = stationaryPress(v4, w4, { eps: epsFor(null), n: 4 }).p;
    assert.deepEqual(shown.map((p) => +p.toFixed(2)), [0.25, 0.44, 0.31, 0],
      'the vector the sentence prints is the vector the function returns at the default rank');
    const printed = `(${shown.map((p) => (p > 0 ? p.toFixed(2) : '0')).join(', ')})`;
    assert.ok(press.includes(printed),
      `the sentence must print the vector stationaryPress returns, ${printed}`);

    /* The two universals that replaced it, over 3 000 random boards including four-wing ones.
       ROUND 6 — THIS SWEEP PROVES MONOTONICITY IN `v` AND NOTHING ELSE. It calls `stationaryPress`
       with a raw `v`, no `y` and no `pressAdvice`, and it used to label its own failure "a wing a
       token is worth LESS on was pressed harder", which is a different claim and one this sweep
       cannot see. The messages say what is being proved now, and the claim the old label named is
       measured — through `postBoard` and `pressAdvice` — in the test after this one. */
    const rng = mulberry32('j3-press-support');
    let dropsSeen = 0;
    for (let k = 0; k < 3000; k++) {
      const n = 2 + (k % 3);
      const wings = WING_IDS.slice(0, n);
      const v = Array.from({ length: n }, () => 1 + rng.next() ** 3 * 400);
      const sp = stationaryPress(v, wings, { eps: RANKS[k % RANKS.length].eps, n });
      const idx = wings.map((w) => wings.indexOf(w));
      for (const i of idx) {
        for (const j of idx) {
          if (v[i] > v[j] + 1e-9) {
            assert.ok(sp.p[i] >= sp.p[j] - 1e-12,
              `p is not monotone in the value it is handed: v ${v[j]} got ${sp.p[j]} against v ${v[i]}'s ${sp.p[i]}`);
          }
        }
      }
      for (const w of sp.support) assert.ok(sp.byWing[w] > 0, 'positive on every wing the press keeps');
      for (const w of sp.dropped) {
        assert.equal(sp.byWing[w], 0, 'and exactly 0 on the wings it drops');
        dropsSeen += 1;
        const lowest = Math.min(...sp.support.map((s) => v[wings.indexOf(s)]));
        assert.ok(v[wings.indexOf(w)] <= lowest + 1e-9, 'a dropped wing is never worth more than a kept one');
      }
      close(sum(sp.p), 1, 1e-12);
    }
    assert.ok(dropsSeen > 100, `the sweep must actually reach the drop: ${dropsSeen} drops seen`);
  });

  test('THE PRESS ORDERS BY STUDY VALUE, NOT BY WHAT A TOKEN BUYS — measured through postBoard, and the sentence says so', () => {
    /* ROUND 6 (guard-equilibrium, verification round 2). The round-5 repair published, to the
       student, "never presses one wing harder than a wing A TOKEN IS WORTH MORE ON". This file
       defines what a token is worth — `pressAdvice`: `marginalᵢ = GUARD.tokenBonus·vᵢ·(1 − yᵢ)` —
       and `stationaryPress` solves `p = A − B/vPress` where `vPress` is the RAW `vᵢ` on every wing
       the guard is not certain to take. `(1 − yᵢ)` is not in the solve, so `p` is monotone in `v`,
       and whenever tonight's `y` reverses the `v` ordering the press is heavier where a token is
       worth less. Both bars are on the same screen, so one board falsifies it.

       And the round-5 verification could not see it: it swept `stationaryPress(v, wings, {eps, n})`
       — raw `v`, no `y`, no `pressAdvice`, no board — and asserted monotonicity in `v`, which is
       not the published claim. This one runs the shipped path.

       THE SOLVE IS NOT THE DEFECT. `p` is the STATIONARY reply: it answers the `y` that a repeated
       press itself creates, `yᵢ = (1 − ε)pᵢ + ε/n`, and AT THAT `y` the two orderings coincide —
       asserted below over 2 000 boards with 0 violations. Ordering by tonight's `marginal` instead
       would make the pre-press a greedy reply to the bars on screen, which Global law 6 forbids the
       board to pre-fill. So the sentence was corrected and the maths was left alone. */
    const [, press] = PRESS_PANEL_COPY;
    const pct = (re, what) => {
      const m = re.exec(press);
      assert.ok(m, `${what} is not in the published sentence any more: ${press}`);
      return +m[1];
    };
    const saidP = pct(/([\d.]+) % of 500 shipped boards/, 'the rate the sentence publishes');
    const saidTokens = pct(/([\d.]+) % of them in the whole tokens/, 'the whole-token rate');

    let live = 0; let nonUniform = 0; let viol = 0; let violTokens = 0; let worst = null;
    for (let i = 0; i < 500; i++) {
      const b = shippedBoard(shippedSave(i));
      if (!b?.press?.wings?.length || !b.pressMatters) continue;
      live += 1;
      const { wings, v, y, marginal } = b.press;
      if (Math.max(...y) - Math.min(...y) > 1e-9) nonUniform += 1;
      /* the file's own marginal, recomputed from the board's own printed bars — not a copy of the
         formula: `pressAdvice` already returns it, and this line only checks it IS that formula */
      for (let k = 0; k < wings.length; k++) {
        close(marginal[k], GUARD.tokenBonus * v[k] * (1 - y[k]), 1e-9,
          'the board s own `marginal` is no longer 0.25·v·(1 − y)');
      }
      let bad = false; let badTok = false;
      for (let a = 0; a < wings.length; a++) {
        for (let c = 0; c < wings.length; c++) {
          if (!(marginal[a] > marginal[c] + 1e-9)) continue;
          if (b.press.press[a] < b.press.press[c] - 1e-9) bad = true;
          if ((b.press.tokens[wings[a]] ?? 0) < (b.press.tokens[wings[c]] ?? 0)) badTok = true;
        }
      }
      if (bad) viol += 1;
      if (badTok) { violTokens += 1; worst = worst ?? { i, wings, v, y, marginal, tokens: b.press.tokens }; }
    }

    assert.ok(live >= 400, `the sweep must actually post boards: ${live} of 500`);
    assert.ok(nonUniform >= live * 0.7,
      `the sweep is vacuous unless the guard s bars are NON-uniform: ${nonUniform} of ${live}`);
    /* the withdrawn claim is false, and not rarely — a sweep that found none would mean the harness
       stopped reaching the reversal, not that the sentence came true */
    assert.ok(viol > 0, 'no board pressed harder where a token is worth less — re-read this test');
    assert.ok(worst, 'and none did it in WHOLE TOKENS, which is the half a student can see');

    /* the published figure and the measured figure are one number, to a point either way: if the
       composer drifts, this fails and the SENTENCE is what has to be restated */
    const gotP = 100 * viol / live;
    const gotTokens = 100 * violTokens / live;
    assert.ok(Math.abs(gotP - saidP) <= 5,
      `the sentence publishes ${saidP} % and the shipped boards measure ${gotP.toFixed(1)} %`);
    assert.ok(Math.abs(gotTokens - saidTokens) <= 3,
      `the sentence publishes ${saidTokens} % in whole tokens and the boards measure ${gotTokens.toFixed(1)} %`);

    /* A DETERMINISTIC PIN on one real board, so the counterexample survives any drift in the
       composer: `save 41` of the sweep above, its own v and its own printed y, through
       `pressAdvice`. The board pre-presses TWO tokens on the wing a token is worth 16.83 on and ONE
       on the wing it is worth 22.05 on. */
    const w3 = ['RECALL', 'FIGURES', 'ALGEBRA'];
    const pin = pressAdvice({ wings: w3, y: [0.148, 0.487, 0.365], eps: 0.20 },
      { RECALL: 103.5, FIGURES: 131.25, ALGEBRA: 33.75 });
    assert.deepEqual(pin.marginal.map((m) => +m.toFixed(2)), [22.05, 16.83, 5.36]);
    assert.deepEqual(pin.tokens, { RECALL: 1, FIGURES: 2, ALGEBRA: 0 });
    assert.ok(pin.marginal[0] > pin.marginal[1] + 1e-9 && pin.tokens.FIGURES > pin.tokens.RECALL,
      'the pinned board no longer presses harder where a token is worth less');
    assert.ok(pin.v[1] > pin.v[0], 'and it does so because it orders by STUDY VALUE, which is reversed here');

    /* WHY THE SOLVE STAYS: at the `y` a repeated press of `p` itself induces, the two orderings are
       the same, so `p` is not inconsistent — it is stationary. 0 violations over 2 000 boards. */
    const rngS = mulberry32('j3-press-stationary');
    let stationaryViol = 0;
    for (let k = 0; k < 2000; k++) {
      const n = 2 + (k % 3);
      const wings = WING_IDS.slice(0, n);
      const v = Array.from({ length: n }, () => 1 + rngS.next() * 200);
      const eps = RANKS[k % RANKS.length].eps;
      const p = stationaryPress(v, wings, { eps, n }).p;
      const yStat = p.map((pi) => (1 - eps) * pi + eps / n);
      const mStat = v.map((vi, i) => GUARD.tokenBonus * vi * (1 - yStat[i]));
      for (let a = 0; a < n; a++) {
        for (let c = 0; c < n; c++) {
          if (mStat[a] > mStat[c] + 1e-9 && p[a] < p[c] - 1e-12) stationaryViol += 1;
        }
      }
    }
    assert.equal(stationaryViol, 0,
      'against the y a repeated press of p creates, p IS ordered by what a token buys — that is the '
      + 'claim the solve supports, and the one the sentence may make');
  });

  test('SENTENCE 3 IS BOUNDED TO WHAT IS MEASURED: y loses to a flat press on the worked board, not on every board', () => {
    /* ROUND 5 (guard-equilibrium). The sentence read "pressed by a player it is worth less than a
       flat press", full stop. True on the worked vector and false in general: where `y` collapses
       onto two wings and the flat press spreads over four, `y` wins — on 19.6 % of random boards
       against a minimising guard and on 36.4 % of them against the shipped mirror guard (and on
       real `postBoard` boards at 8.2 % / 9.6 %). The comparison itself was never evaluated by this
       suite at all: the only assertion on the sentence was `guard.includes(GUARD_MIX_FORMULA)`.

       So the sentence now prints the worked board's three numbers, and the two dominances that ARE
       universal — the maximin against a minimiser, `stationaryPress` against the House that ships —
       are asserted here over 4 000 boards, with the counterexample to the withdrawn universal
       asserted to still exist so it cannot quietly come back. */
    const [, , guard] = PRESS_PANEL_COPY;
    assert.equal(/worth less than a flat press/.test(guard), false, 'the universal is gone, not reworded');

    const v3 = [30, 20, 10];
    const w3 = ['RECALL', 'FIGURES', 'WORDS'];
    const valueMin = (x, v) => sum(x.map((xi, i) => xi * v[i])) - Math.max(...x.map((xi, i) => xi * v[i]));
    const y3 = fixedPointMix(v3, w3).y;
    const flat3 = w3.map(() => 1 / 3);
    const mm3 = maximinPress(v3, w3).x;
    close(valueMin(y3, v3), 8, 1e-9, 'pressing the House s mix on the worked board is worth 8.0');
    close(valueMin(flat3, v3), 10, 1e-9, 'a flat press there is worth 10.0');
    close(valueMin(mm3, v3), 12, 1e-9, 'and the maximin 12.0');
    for (const n of ['8.0', '10.0', '12.0']) assert.ok(guard.includes(n), `the sentence prints ${n}`);
    assert.ok(guard.includes('v = (30, 20, 10)'), 'named against the board it is measured on');

    // the two dominances the sentence claims universally — over 4 000 boards, every rank
    const rng = mulberry32('j3-flat-vs-y');
    let yBeatsFlatMin = 0;
    let yBeatsFlatShipped = 0;
    for (let k = 0; k < 4000; k++) {
      const n = 2 + (k % 3);
      const wings = WING_IDS.slice(0, n);
      const v = Array.from({ length: n }, () => 1 + rng.next() * 200);
      const eps = RANKS[k % RANKS.length].eps;
      const y = fixedPointMix(v, wings).y;
      const mm = maximinPress(v, wings).x;
      const p = stationaryPress(v, wings, { eps, n }).p;
      const flat = wings.map(() => 1 / n);
      const valueShipped = (x) => sum(x.map((xi, i) => xi * v[i] * (1 - (1 - eps) * xi - eps / n)));
      assert.ok(valueMin(mm, v) >= valueMin(y, v) - 1e-9,
        'the maximin is never worse than y against a guard that minimises');
      /* ROUND 7 — READ THIS ONE AS WHAT IT IS. `valueShipped` IS the objective `stationaryPress`
         solves by construction, so this line asserts that the optimiser optimises: it is an
         OPTIMISER CHECK (the solve matches the objective this file publishes for it), and it is
         not evidence for any sentence about the guard on tonight's board. The sentence's claim is
         measured against the board's own printed y in the test below. */
      assert.ok(valueShipped(p) >= valueShipped(y) - 1e-9,
        'stationaryPress must actually solve the stationary objective this file publishes for it');
      if (valueMin(y, v) > valueMin(flat, v) + 1e-9) yBeatsFlatMin += 1;
      if (valueShipped(y) > valueShipped(flat) + 1e-9) yBeatsFlatShipped += 1;
    }
    /* the counterexample, kept alive: if these ever hit 0 the withdrawn universal would be true
       again and the sentence should be re-examined rather than quietly restored */
    assert.ok(yBeatsFlatMin > 200,
      `y beat a flat press against a minimiser on only ${yBeatsFlatMin} of 4 000 boards`);
    assert.ok(yBeatsFlatShipped > 200,
      `y beat a flat press against the shipped guard on only ${yBeatsFlatShipped} of 4 000 boards`);
    assert.match(guard, /A flat press does not always beat it/,
      'and the sentence says so, rather than publishing the universal again');
  });

  test('THE PRESS BEATS g AGAINST THE GUARD IT CONVERGES TO, NOT AGAINST TONIGHT S BARS', () => {
    /* ROUND 7 (guard-equilibrium). The sentence closed *"…and the press above beats it on every
       board against the guard that ships"*, in the same breath as a clause about "a guard that
       minimises" — two different guards, neither named. "The guard that ships" reads, on that
       screen, as the y drawn as bars ten lines above; under that y the claim is false on nearly
       every board. It is true only under the STATIONARY objective, the y a repeated press of x
       itself creates — and that objective is the one `stationaryPress` solves, which is why the
       4 000-board assertion above can never fail and is labelled an optimiser check now.

       Both readings, measured over the shipped `postBoard` corpus, with the numbers the sentence
       prints tied to the numbers computed here. */
    const [, , guard] = PRESS_PANEL_COPY;
    let boards = 0; let worseStationary = 0; let worsePrinted = 0;
    let shortfall = 0; let maxShortfall = 0;
    for (let i = 0; i < 4000 && boards < 500; i++) {
      const b = shippedBoard(shippedSave(i));
      if (!b?.press?.v?.length || !b?.guard) continue;
      const wings = b.press.wings;
      const v = b.press.v.slice();
      if (!(sum(v) > 0) || wings.length < 2) continue;
      const { eps } = b.press;
      const n = wings.length;
      const yPrinted = wings.map((w) => b.guard.byWing[w] ?? 0);
      const g = fixedPointMix(v, wings).y;
      const p = stationaryPress(v, wings, { eps, n }).p;
      const stationary = (x) => sum(x.map((xi, k) => xi * v[k] * (1 - (1 - eps) * xi - eps / n)));
      const printed = (x) => sum(x.map((xi, k) => xi * v[k] * (1 - yPrinted[k])));
      boards += 1;
      if (stationary(p) < stationary(g) - 1e-9) worseStationary += 1;
      if (printed(p) < printed(g) - 1e-9) {
        worsePrinted += 1;
        const s = (printed(g) - printed(p)) / Math.max(1e-12, printed(g));
        shortfall += s;
        if (s > maxShortfall) maxShortfall = s;
      }
    }
    assert.equal(boards, 500, 'the corpus is 500 shipped boards');
    assert.equal(worseStationary, 0,
      `p lost to g under the stationary objective on ${worseStationary} boards — the half that IS universal`);
    assert.equal(worsePrinted, 491,
      `g beat p against the board's own printed y on ${worsePrinted} of ${boards}, not the published 491`);
    const mean = shortfall / worsePrinted;
    assert.ok(Math.abs(mean - 0.117) < 0.0005, `the mean shortfall is ${(100 * mean).toFixed(1)} %`);
    assert.ok(Math.abs(maxShortfall - 0.317) < 0.0005, `the worst shortfall is ${(100 * maxShortfall).toFixed(1)} %`);

    // …and the sentence prints those numbers, against the guard each half is measured on
    assert.ok(guard.includes('491 of 500'), 'the sentence prints the count it is measured at');
    assert.ok(guard.includes('11.7 %') && guard.includes('31.7 %'), 'and the mean and the worst case');
    assert.match(guard, /a guard that MINIMISES/, 'the maximin half names its guard');
    assert.match(guard, /NOT the bars above/, 'and the press half names a guard that is not the printed one');
    assert.equal(/against the guard that ships\./.test(guard), false,
      'the unqualified "the guard that ships" is gone, not reworded around');
  });

  test('g IS NOT THE PRINTED y: one card may not publish two laws for one symbol, and the two vectors are measured apart', () => {
    /* ROUND 6 (guard-equilibrium, verification round 2). `settings.js guardCard()` prints, in this
       order, the real draw law — `y = project((1 − ε)·x̂ + ε·uniform_n, cap = 0.75)` — and then, in
       the same <dl>, `PRESS_PANEL_COPY[2]`, which carried `yᵢ = 1 − k/vᵢ … — the GUARD mixes this
       way`: the same letter for two different objects, thirty lines apart, the second in the
       unqualified present tense about a guard that does not do it. Sentence 2 of the same card
       already said the opposite ("whose y is a published mirror of your own last 10 jobs and not a
       minimiser"). The only assertion on it was `guard.includes(GUARD_MIX_FORMULA)` plus a match on
       /HOUSE/, so nothing ever compared the claim with `guardDist`.

       The symbol is `g` now, the tense is counterfactual, and the distance between the two vectors
       is measured on shipped boards rather than argued. */
    const [, , guard] = PRESS_PANEL_COPY;
    assert.equal(/\byᵢ = 1 − k\/vᵢ/.test(guard), false,
      'the guard-mix law is printed under `y` again, which is the letter the drawn bars use');
    assert.equal(/the GUARD mixes this way/.test(guard), false, 'the present-tense mechanism claim is back');
    assert.match(guard, /NOT the bars/, 'the sentence must say it is not the printed distribution');

    const said = (re, what) => {
      const m = re.exec(guard);
      assert.ok(m, `${what} is not in the published sentence any more: ${guard}`);
      return +m[1];
    };
    const saidMean = said(/mean of ([\d.]+)/, 'the published mean deviation');
    const saidMax = said(/as much as ([\d.]+)/, 'the published max deviation');
    const saidAgree = said(/agree on (\d+) of them/, 'the published agreement count');

    let boards = 0; let agree = 0; let maxDev = 0; let sumDev = 0; let sample = null;
    for (let i = 0; i < 400; i++) {
      const b = shippedBoard(shippedSave(i));
      if (!b?.press?.wings?.length) continue;
      boards += 1;
      const wings = b.press.wings;
      const printed = wings.map((w) => b.guard.byWing[w] ?? 0);        // the bars the board prints
      const g = fixedPointMix(b.press.v, wings).y;                     // what GUARD_MIX_FORMULA is
      const dev = Math.max(...wings.map((_, k) => Math.abs(g[k] - printed[k])));
      maxDev = Math.max(maxDev, dev); sumDev += dev;
      if (dev < 1e-9) agree += 1;
      if (!sample && dev > 0.5) sample = { i, wings, v: b.press.v, printed, g };
    }
    assert.ok(boards >= 300, `the sweep must actually post boards: ${boards} of 400`);
    assert.ok(sample, 'no board separated the two vectors by half a bar — re-read this test');
    assert.equal(agree, saidAgree,
      `the sentence says the two agree on ${saidAgree} boards; ${agree} of ${boards} agree`);
    close(sumDev / boards, saidMean, 0.05, 'the published MEAN deviation is not the measured one');
    close(maxDev, saidMax, 0.05, 'the published MAX deviation is not the measured one');

    /* and the mechanism claim itself: the shipped draw does not read `v` at all. Two boards with
       the SAME press history and different `v` draw the same bars; `fixedPointMix` does not. */
    const save = { player: { rank: 3 }, game: { heat: { press: { RECALL: 80, FIGURES: 20 }, weight: 100, jobs: 4, window: [] }, log: [] } };
    const d = guardDist(save, { support: ['RECALL', 'FIGURES', 'WORDS'], eps: 0.2 });
    const lo = fixedPointMix([30, 20, 10], d.wings).y;
    const hi = fixedPointMix([10, 20, 30], d.wings).y;
    assert.notDeepEqual(lo, hi, 'fixedPointMix reads v — that is the whole of it');
    for (const y of [lo, hi]) {
      assert.equal(y.every((yi, k) => Math.abs(yi - d.y[k]) < 1e-9), false,
        'the guard the layer ships drew the minimiser s mix — guardDist has started reading v');
    }
  });

  test('pressAdvice always spends exactly GUARD.tokens, over 2 000 random boards', () => {
    const rng = mulberry32('j3-press');
    for (let k = 0; k < 2000; k++) {
      const n = 2 + (k % 3);
      const wings = WING_IDS.slice(0, n);
      const y = project(Array.from({ length: n }, () => rng.next()).map((v, _, arr) => v / sum(arr)), GUARD.cap);
      const v = Object.fromEntries(wings.map((w) => [w, rng.next() * 100]));
      const a = pressAdvice({ wings, y }, v);
      assert.equal(sum(Object.values(a.tokens)), GUARD.tokens);
      for (const t of Object.values(a.tokens)) assert.ok(t >= 0 && Number.isInteger(t));
      close(sum(a.guardMix), 1, 1e-9);
      close(sum(a.maximin), 1, 1e-9);
    }
  });
});

/* =========================================================================================
   10. The best-response simulation (G3.4)
   ========================================================================================= */

/*
   ROUND 2 (guard-equilibrium). G8's J3 row reads *"a 500-job best-response simulation converges to
   `y = (.60,.40)` for `v = (30,20,10)` ±0.03"*, and `y` is a named object in this module: the
   GUARD's published distribution, `guardDist(save).y`. This section used to return
   `counts.map(c => c/total)` — the PLAYER's empirical press `x` — and assert THAT against
   (.60, .40). The two are the same number only at ε = 0; at every rank the game actually ships,
   `y = project((1−ε)x̂ + ε/n)` and the ε floor moves it outside the published ±0.03:

       rank 1 (ε = .25)  y = (.5667, .3500, .0833)      ← .60 is 0.033 away
       rank 2 (ε = .20)  y = (.5733, .3600, .0667)
       rank 3/4 (ε = .15) y = (.5800, .3700, .0500)
       rank 5 (ε = .10)  y = (.5867, .3800, .0333)

   Those are not tolerances — they are a CLOSED FORM, derived below and asserted to 1e-3. The same
   floor also settles the old "the wing that left the support" line: wing 3 leaves the support only
   at ε = 0. In the shipped game it is held at exactly ε/n, which is the whole point of a mix floor.

   So this section now (a) runs the idealised loop and returns `y`, not `x`; (b) asserts `y` against
   the ε-floored equilibrium at every rank's ε; (c) runs the SAME dynamic through the shipped code
   path — `pushHeat` → `xHatFrom` → `guardDist` — and shows the shipped guard lands on the same
   closed form; and (d) records that the published (.60,.40) row is the ε = 0 idealisation, which is
   what COMPOSED-GAME G3.4 should say. See Requests in notes/tests-fix.md.
   ========================================================================================= */

describe('J3 · 500 jobs of best response converge on the equilibrium (G3.4)', () => {
  /**
   * **The equilibrium of the best-response dynamic WITH the mix floor**, in closed form.
   *
   * The player dumps every token on `argmax v_i(1 − y_i)`, so at rest the pressed wings must all
   * pay the same: `v_i(1 − y_i) = k`, i.e. `y_i = 1 − k/v_i`. The wings nobody presses are not 0 —
   * they sit at the floor `ε/n`, because `y = (1−ε)x̂ + ε/n` and their `x̂` is 0. That leaves
   * `M = 1 − (n − m)·ε/n` for the `m` pressed wings, and `Σ(1 − k/v_i) = M` gives
   * `k = (m − M) / Σ(1/v_i)`. Wings are dropped from the press support, weakest first, until every
   * pressed `y_i` clears the floor. At ε = 0 this is exactly `fixedPointMix`.
   */
  function equilibriumY(values, eps) {
    const n = values.length;
    const floor = eps / n;
    const order = values.map((_, i) => i).sort((a, b) => values[b] - values[a]);
    for (let m = n; m >= 1; m--) {
      const S = order.slice(0, m);
      const M = 1 - (n - m) * floor;
      const k = (m - M) / sum(S.map((i) => 1 / values[i]));
      const y = new Array(n).fill(floor);
      let ok = true;
      for (const i of S) { y[i] = 1 - k / values[i]; if (y[i] < floor - 1e-12) ok = false; }
      if (ok) return y;
    }
    return values.map(() => 1 / n);
  }

  /** The dynamic G3.4 describes: the guard publishes y from your own press history; you dump all
   *  three tokens on argmax v_i(1 − y_i); doing that drives y_i up until the payoff decays.
   *  It returns the GUARD's y — the quantity G8's acceptance names — alongside the player's x. */
  function simulate(values, { jobs = 500, eps = 0, cap = GUARD.cap, tail = 100 } = {}) {
    const n = values.length;
    const counts = new Array(n).fill(0);
    const ys = [];
    let total = 0;
    for (let j = 0; j < jobs; j++) {
      const xHat = total > 0 ? counts.map((c) => c / total) : counts.map(() => 1 / n);
      const y = project(xHat.map((x) => (1 - eps) * x + eps / n), cap);
      ys.push(y);
      const advice = pressAdvice({ wings: WING_IDS.slice(0, n), y }, values);
      const i = WING_IDS.indexOf(advice.bestResponseWing);
      counts[i] += GUARD.tokens;
      total += GUARD.tokens;
    }
    const last = ys.slice(-tail);
    return {
      y: last[0].map((_, i) => sum(last.map((r) => r[i])) / last.length),
      x: counts.map((c) => c / total),
    };
  }

  /**
   * THE SAME DYNAMIC, THROUGH THE SHIPPED CODE. `guardDist` reads `x̂` from `xHatFrom`, which is a
   * 10-job STAKE-WEIGHTED window with uniform ballast — not the all-time count average the
   * idealised loop above uses — and the press is written by `pushHeat` exactly as `state.endJob`
   * writes it. Nothing here re-implements `x̂`.
   *
   * `seed` is the half that makes this a best-response loop rather than an index-order loop. On the
   * shipped grid — ten jobs, three whole tokens — `v_i(1 − y_i)` ties EXACTLY on most jobs
   * (counted below), and the argmax is then a SET. With a seed, `pressAdvice` settles it with a
   * seeded uniform draw, which is what a best response to an indifference is; with none it takes
   * the first wing of `WING_IDS`, and that standing bias is worth 0.036-0.061 of the published
   * figure. Both readings are run below and both are asserted.
   */
  function simulateShipped(values, { jobs = 500, eps = 0, posted = 200, tail = 100, seed = null } = {}) {
    const n = values.length;
    const wings = WING_IDS.slice(0, n);
    const byWing = Object.fromEntries(wings.map((w, i) => [w, values[i]]));
    const save = { game: { heat: null, log: [] } };
    const ys = [];
    const counts = new Array(n).fill(0);
    const pressed = [];
    let tied = 0;
    for (let j = 0; j < jobs; j++) {
      const dist = guardDist(save, { eps, support: wings });
      ys.push(dist.y.slice());
      const advice = pressAdvice({ wings, y: dist.y }, byWing, seed == null ? {} : { seed: `${seed}-${j}` });
      if (advice.bestResponseWings.length > 1) tied += 1;
      const i = wings.indexOf(advice.bestResponseWing);
      pressed.push(i);
      counts[i] += GUARD.tokens;
      const press = Object.fromEntries(wings.map((w, k) => [w, k === i ? GUARD.tokens : 0]));
      save.game.heat = pushHeat(save.game.heat, { press, posted, targets: 10, shape: 'JOB' });
      save.game.log.push({ day: `d${j}`, shape: 'JOB', targets: 10, posted });
    }
    const last = ys.slice(-tail);
    return {
      y: last[0].map((_, i) => sum(last.map((r) => r[i])) / last.length),
      x: counts.map((c) => c / sum(counts)),
      xHat: xHatFrom(save).values,
      tiedFraction: tied / jobs,
      pressed,
    };
  }

  /** the length of the repeat a settled loop is in, or null — asserted, because the exported
   *  `BEST_RESPONSE_ACCEPTANCE` calls the index-order attractor a period-11 CYCLE */
  function periodOf(seq) {
    for (let p = 1; p <= 40; p++) {
      if (seq.slice(0, seq.length - p).every((x, i) => x === seq[i + p])) return p;
    }
    return null;
  }

  test('v = (30, 20, 10) converges to y = (.60, .40) within 0.03 — the ε = 0 idealisation', () => {
    const { y, x } = simulate([30, 20, 10]);
    close(y[0], 0.60, 0.03, 'wing 1');
    close(y[1], 0.40, 0.03, 'wing 2');
    close(y[2], 0.00, 0.03, 'the wing that leaves the support — only at ε = 0');
    close(sum(y), 1, 1e-9);
    // at ε = 0 the guard's y and the player's press are the same vector, which is why the published
    // row can be read either way. At every ε the game ships they are not (see the next test).
    // (y is the mean of the last 100 published mixes, x the all-time press, hence 1e-5 and not 0)
    y.forEach((v, i) => close(v, x[i], 1e-5, 'y is x at ε = 0'));
  });

  test('THE PUBLISHED ROW IS THE ε = 0 CASE: at every rank the floor moves y off (.60, .40)', () => {
    const v = [30, 20, 10];
    for (const r of RANKS) {
      const { y } = simulate(v, { eps: r.eps });
      const want = equilibriumY(v, r.eps);
      y.forEach((got, i) => close(got, want[i], 1e-3,
        `rank ${r.rank} (ε = ${r.eps}) wing ${i + 1}: the ε-floored equilibrium`));
      // the floor is exactly where the un-pressed wing sits — it never "leaves the support"
      close(y[2], r.eps / 3, 1e-3, `rank ${r.rank}: wing 3 is held at ε/n, not driven to 0`);
      close(sum(y), 1, 1e-9);
    }
    // and the published ±0.03 is genuinely missed at the bottom two ranks — the number, not a mood
    const rank1 = simulate(v, { eps: RANKS[0].eps }).y;
    assert.ok(Math.abs(rank1[0] - 0.60) > 0.03,
      `at Called 1 the guard's y₁ is ${rank1[0].toFixed(4)}, ${Math.abs(rank1[0] - 0.6).toFixed(4)} from the published 0.60`);
    assert.ok(Math.abs(rank1[2] - 0.00) > 0.03,
      `…and y₃ is ${rank1[2].toFixed(4)}, not 0: G3.4's "wing 3 leaves the support" is an ε = 0 statement`);
  });

  test('THE SHIPPED PATH: guardDist + xHatFrom + pushHeat lands on the same closed form', () => {
    const v = [30, 20, 10];
    for (const eps of [RANKS[0].eps, RANKS[2].eps, RANKS[4].eps]) {
      const s = simulateShipped(v, { eps });
      const want = equilibriumY(v, eps);
      s.y.forEach((got, i) => close(got, want[i], 0.025,
        `ε ${eps} wing ${i + 1}: the shipped guard's y against the closed form`));
      close(s.y[2], eps / 3, 1e-9, `ε ${eps}: the floor is exact in the shipped path too`);
      close(sum(s.y), 1, 1e-9);
    }
    /* ε = 0 with the argmax settled BY WING_IDS ORDER does NOT reach (.60, .40) within 0.03, and
       the reason is the tie-break rather than the window: `xHatFrom` reads a TEN-job window and the
       press is three indivisible tokens, so the reachable mixes are multiples of 1/10 and
       `v_i(1 − y_i)` ties EXACTLY on most jobs. Take the first wing out of that tied set every time
       and the loop locks into a period-11 cycle whose mean is 7/11 : 4/11. The all-time average of
       the idealised loop has no such grid, so it never sees the tie at all. RECORDED, not bent —
       and the next test settles the same ties uniformly and lands on the published row. */
    const s0 = simulateShipped(v, { eps: 0 });
    close(s0.y[0], 7 / 11, 0.01, 'the 10-job window + 3-token granularity attractor');
    close(s0.y[1], 4 / 11, 0.01);
    assert.ok(Math.abs(s0.y[0] - 0.60) > 0.03,
      `settled by index order the shipped guard sits at y₁ = ${s0.y[0].toFixed(4)} even at ε = 0 — ${Math.abs(s0.y[0] - 0.6).toFixed(4)} from 0.60`);
    close(s0.y[2], 0, 1e-9, 'with no floor, wing 3 really does leave the support');
    assert.ok(s0.tiedFraction > 0.5,
      `the argmax is a SET on most jobs — tied on ${(s0.tiedFraction * 100).toFixed(0)} % of them`);
    // …and the index-order attractor is a fixed point of the loop, not a slow transient
    const s0long = simulateShipped(v, { eps: 0, jobs: 5000, tail: 3000 });
    close(s0long.y[0], 7 / 11, 0.005, 'still 7/11 out at 5000 jobs');
    assert.equal(periodOf(s0long.pressed.slice(-220)), 11,
      'and 7/11 is a period-11 cycle of the press, not an average over a wander');
  });

  test('THE PUBLISHED ROW IS TRUE OF THE SHIPPED PATH once a TIED argmax is settled uniformly', () => {
    /* The acceptance row names "a best-response simulation". A best response to an indifference is
       the whole tied set, and `pressAdvice(dist, v, {seed})` draws from it — seeded, so this is
       still one number per seed and not a mood. The same loop, the same `guardDist`/`pushHeat`,
       only the tie settled the way the game it models settles it. */
    const v = [30, 20, 10];
    for (const seed of ['j3-a', 'j3-b', 'j3-c', 'j3-d']) {
      const s = simulateShipped(v, { eps: 0, jobs: 2000, tail: 500, seed });
      close(s.y[0], 0.60, 0.03, `${seed}: wing 1 — the published figure, on the shipped path`);
      close(s.y[1], 0.40, 0.03, `${seed}: wing 2`);
      close(s.y[2], 0.00, 0.03, `${seed}: wing 3 leaves the support at ε = 0`);
      close(sum(s.y), 1, 1e-9);
      assert.ok(s.tiedFraction > 0.5, `${seed}: and it is still the same tie-ridden grid`);
    }
    // equal v: the row's second half, on the shipped path, which the suite used to test only on the
    // idealised loop while the (30, 20, 10) case right above it went through `simulateShipped`
    for (const seed of ['j3-a', 'j3-b', 'j3-c']) {
      const { y } = simulateShipped([25, 25, 25], { eps: 0, jobs: 2000, tail: 500, seed });
      y.forEach((got, i) => close(got, 1 / 3, 0.03, `${seed}: equal v, wing ${i + 1}`));
    }
    const four = simulateShipped([25, 25, 25, 25], { eps: 0, jobs: 2000, tail: 500, seed: 'j3-a' });
    four.y.forEach((got, i) => close(got, 0.25, 0.03, `four equal wings, wing ${i + 1}`));
    /* The one residual a seed does NOT rescue, because it is the ε-floor and not the tie-break: at
       Called 1 the target is the ε-floored equilibrium (0.5667, 0.35, 0.0833) and the loop reaches
       IT, which puts y₁ 0.039 from the published 0.60. The published row is an ε = 0 row. */
    const r1 = simulateShipped(v, { eps: RANKS[0].eps, jobs: 2000, tail: 500, seed: 'j3-a' });
    equilibriumY(v, RANKS[0].eps).forEach((want, i) => close(r1.y[i], want, 0.01,
      `Called 1, wing ${i + 1}: the shipped loop reaches the ε-floored equilibrium`));
    assert.ok(Math.abs(r1.y[0] - 0.60) > 0.03,
      `at Called 1 the shipped y₁ is ${r1.y[0].toFixed(4)}, ${Math.abs(r1.y[0] - 0.6).toFixed(4)} from the published 0.60`);
    // and at every rank the ε-floor moves the TARGET, not the convergence: equal v stays uniform
    for (const r of RANKS) {
      const { y } = simulateShipped([25, 25, 25], { eps: r.eps, jobs: 2000, tail: 500, seed: 'j3-a' });
      y.forEach((got, i) => close(got, 1 / 3, 0.03, `rank ${r.rank} (ε = ${r.eps}), wing ${i + 1}`));
    }
  });

  test('RECORDED: equal v settled by WING_IDS order is (4/11, 4/11, 3/11), and it is an attractor', () => {
    /* The asymmetry this closes: the (30, 20, 10) block above always drove `simulateShipped`, and
       this case only ever drove the idealised loop, so the shipped equal-v number was never on the
       record at all. It is 0.06 off uniform under index-order ties, at every rank, and it does not
       decay with more jobs — (4/11, 4/11, 3/11) is where the period-11 cycle sits. */
    const three = simulateShipped([25, 25, 25], { eps: 0, jobs: 500, tail: 100 });
    close(three.y[0], 4 / 11, 0.01, 'wing 1');
    close(three.y[1], 4 / 11, 0.01, 'wing 2');
    close(three.y[2], 3 / 11, 0.01, 'wing 3 — the one index order starves');
    const dev = Math.max(...three.y.map((w) => Math.abs(w - 1 / 3)));
    assert.ok(dev > 0.03, `index-order ties miss uniform by ${dev.toFixed(4)}, outside the published 0.03`);
    const long = simulateShipped([25, 25, 25], { eps: 0, jobs: 5000, tail: 3000 });
    close(long.y[2], 3 / 11, 0.005, 'not a transient: identical out to 5000 jobs');
    assert.equal(periodOf(long.pressed.slice(-220)), 11, 'the same period-11 cycle, 4 : 4 : 3');
    const four = simulateShipped([25, 25, 25, 25], { eps: 0, jobs: 2000, tail: 500 });
    close(four.y[3], 2 / 11, 0.01, 'four equal wings starve the last one to 2/11');
    // every rank, so "to uniform for equal v" is not rescued by the ε-floor either
    for (const r of RANKS) {
      const { y } = simulateShipped([25, 25, 25], { eps: r.eps, jobs: 2000, tail: 500 });
      const d = Math.max(...y.map((w) => Math.abs(w - 1 / 3)));
      assert.ok(d > 0.03, `rank ${r.rank} (ε = ${r.eps}): index-order ties sit ${d.toFixed(4)} off uniform`);
    }
  });

  test('BEST_RESPONSE_ACCEPTANCE says exactly that, so the panel and the doc cannot drift from it', () => {
    for (const k of ['claim', 'holds', 'ranks', 'indexOrderTies']) {
      assert.equal(typeof BEST_RESPONSE_ACCEPTANCE[k], 'string', `${k} is published`);
    }
    assert.match(BEST_RESPONSE_ACCEPTANCE.holds, /seed/, 'the condition the figure needs is IN the string');
    assert.match(BEST_RESPONSE_ACCEPTANCE.indexOrderTies, /7\/11/);
    assert.match(BEST_RESPONSE_ACCEPTANCE.indexOrderTies, /4\/11, 4\/11, 3\/11/);
    assert.match(BEST_RESPONSE_ACCEPTANCE.ranks, /0\.039/, 'the Called 1 miss is published, not buried');
    assert.equal(Object.isFrozen(BEST_RESPONSE_ACCEPTANCE), true);
  });

  test('equal values converge to uniform — pure rotation (the idealised loop)', () => {
    // the shipped path's two readings of this same case are the two tests above it
    for (const eps of [0, RANKS[0].eps, RANKS[4].eps]) {
      const { y } = simulate([25, 25, 25], { eps });
      for (const v of y) close(v, 1 / 3, 0.03, `ε = ${eps}`);
      // the closed form says the floor cannot bite when every wing is pressed
      equilibriumY([25, 25, 25], eps).forEach((w) => close(w, 1 / 3, 1e-12));
    }
  });

  test('the converged mix IS the closed-form fixed point, not a coincidence of the loop', () => {
    const { y } = simulate([30, 20, 10]);
    const closed = fixedPointMix([30, 20, 10], ['A', 'B', 'C']).y;
    y.forEach((v, i) => close(v, closed[i], 0.03, `wing ${i + 1}`));
    // …and `fixedPointMix` is exactly `equilibriumY` at ε = 0, which is what makes the row the
    // idealisation rather than a different model
    equilibriumY([30, 20, 10], 0).forEach((w, i) => close(w, closed[i], 1e-12, `wing ${i + 1}`));
  });

  test('a four-wing board converges too (the real support size on a full board)', () => {
    const v = [40, 30, 20, 10];
    const { y } = simulate(v, { jobs: 800 });
    const closed = fixedPointMix(v, WING_IDS).y;
    y.forEach((x, i) => close(x, closed[i], 0.04, `wing ${i + 1}`));
    // with a floor, the fourth wing is held at ε/n and the other three re-solve around it
    const eps = RANKS[2].eps;
    const { y: yEps } = simulate(v, { jobs: 800, eps });
    equilibriumY(v, eps).forEach((w, i) => close(yEps[i], w, 0.03, `ε ${eps} wing ${i + 1}`));
    close(yEps[3], eps / 4, 1e-3, 'the weakest wing sits on the floor');
  });
});

/* =========================================================================================
   11. Elo (G3.5)
   ========================================================================================= */

describe('J3 · Elo is symmetric with K = 24 (G3.5)', () => {
  test('K = 24 and the divisor is 400 (data/job.js)', () => {
    assert.equal(ELO.k, 24);
    assert.equal(ELO.divisor, 400);
  });

  test('E_player = 1/(1 + 10^((R_house − R_player)/400))', () => {
    close(expectedScore(1000, 1000), 0.5, 1e-12);
    close(expectedScore(1400, 1000), 1 / (1 + 10 ** -1), 1e-12);
    close(expectedScore(1000, 1400), 1 / (1 + 10 ** 1), 1e-12);
    close(expectedScore(1200, 1000) + expectedScore(1000, 1200), 1, 1e-12);
  });

  test('one update at level ratings moves exactly ±K/2', () => {
    const w = elo(1000, 1000, 1);
    close(w.delta, 12, 1e-12);
    close(w.player, 1012, 1e-12);
    close(w.house, 988, 1e-12);
    const l = elo(1000, 1000, 0);
    close(l.delta, -12, 1e-12);
    close(l.house, 1012, 1e-12);
  });

  test('symmetric: the two ratings move by equal and opposite amounts — 10 000 random states', () => {
    const rng = mulberry32('j3-elo');
    let worstSum = 0; let worstK = 0;
    for (let i = 0; i < 10000; i++) {
      const rp = 600 + rng.next() * 1800;
      const rh = 600 + rng.next() * 1800;
      const o = rng.next() < 0.5 ? 0 : 1;
      const r = elo(rp, rh, o);
      worstSum = Math.max(worstSum, Math.abs((r.player + r.house) - (rp + rh)));
      close(r.deltaHouse, -r.delta, 1e-9, 'equal and opposite');
      worstK = Math.max(worstK, Math.abs(r.delta));
      close(r.expected + r.expectedHouse, 1, 1e-12);
    }
    assert.ok(worstSum <= 1e-9, `R_player + R_house drifted by ${worstSum}`);
    assert.ok(worstK <= ELO.k + 1e-9, `a single update moved more than K (${worstK})`);
  });

  test('outcome is 1 iff BAGGED ≥ posted', () => {
    assert.equal(eloOutcome({ bagged: 120, posted: 100 }), 1);
    assert.equal(eloOutcome({ bagged: 100, posted: 100 }), 1);
    assert.equal(eloOutcome({ bagged: 99, posted: 100 }), 0);
    assert.equal(eloOutcome({}), 1, 'a posted-0 board cannot be lost');
  });

  test('the seeds: placement clamps to [800, 1400], a skipped placement seeds both at 1000', () => {
    assert.deepEqual(eloSeed({ placementScore: 50 }), { player: 1000, house: 1000, placement: true });
    assert.equal(eloSeed({ placementScore: 100 }).player, 1200);
    assert.equal(eloSeed({ placementScore: 0 }).player, 800);
    assert.equal(eloSeed({ placementScore: 1000 }).player, ELO.seedMax);
    assert.equal(eloSeed({ placementScore: -1000 }).player, ELO.seedMin);
    assert.deepEqual(eloSeed({ skipped: true }), { player: 1000, house: 1000, placement: false });
    assert.deepEqual(eloSeed({}), { player: 1000, house: 1000, placement: false });
  });

  test('boolean outcomes and a draw are accepted', () => {
    assert.deepEqual(elo(1000, 1000, true).player, elo(1000, 1000, 1).player);
    assert.deepEqual(elo(1000, 1000, false).player, elo(1000, 1000, 0).player);
    close(elo(1000, 1000, 0.5).delta, 0, 1e-12);
  });
});

/* =========================================================================================
   12. The vault grade rides R_player (G3.5, G12 #8)
   ========================================================================================= */

describe('J3 · vaultGradeFor reads R_player, and win streaks raise it (G12 #8)', () => {
  const streak = (state, n, outcome) => {
    let s = { ...state };
    for (let i = 0; i < n; i++) { const r = elo(s.player, s.house, outcome); s = { player: r.player, house: r.house }; }
    return s;
  };

  test('the published bands: < 1000 → tier ≤ 2 · 1000–1199 → 3 · ≥ 1200 → 4', () => {
    assert.equal(vaultGradeFor(999.9), 2);
    assert.equal(vaultGradeFor(800), 2);
    assert.equal(vaultGradeFor(1000), 3);
    assert.equal(vaultGradeFor(1199), 3);
    assert.equal(vaultGradeFor(1199.9), 3);
    assert.equal(vaultGradeFor(1200), 4);
    assert.equal(vaultGradeFor(2000), 4);
    assert.equal(vaultGradeRowFor(900).tierMax, 2, 'the lowest band publishes a MAX, not a fixed tier');
    assert.equal(VAULT_GRADE.length, 3);
  });

  test('it is monotone non-decreasing in R_player across the whole range', () => {
    let prev = 0;
    for (let r = 700; r <= 1500; r += 0.5) {
      const g = vaultGradeFor(r);
      assert.ok(g >= prev, `grade fell at R_player ${r}`);
      prev = g;
    }
  });

  test('TWO simulated win streaks RAISE the vault grade; two loss streaks lower it', () => {
    const seed = eloSeed({ skipped: true });
    assert.equal(vaultGradeFor(seed.player), 3);

    const w1 = streak(seed, 25, 1);
    const w2 = streak(w1, 25, 1);
    assert.ok(w1.player > seed.player && w2.player > w1.player, 'R_player climbs on every win');
    assert.equal(vaultGradeFor(w2.player), 4, `R_player ${w2.player.toFixed(1)} after two win streaks`);
    assert.ok(vaultGradeFor(w2.player) > vaultGradeFor(seed.player), 'the grade RISES');

    const l1 = streak(w2, 25, 0);
    const l2 = streak(l1, 25, 0);
    assert.ok(l1.player < w2.player && l2.player < l1.player, 'R_player falls on every loss');
    assert.equal(vaultGradeFor(l2.player), 2, `R_player ${l2.player.toFixed(1)} after two loss streaks`);
    assert.ok(vaultGradeFor(l2.player) < vaultGradeFor(w2.player), 'the grade FALLS');
  });

  test('the bug G12 #8 names is closed: a win LOWERS R_house, so a house-driven grade would fall', () => {
    const seed = eloSeed({ skipped: true });
    const after = streak(seed, 50, 1);
    assert.ok(after.house < seed.house, 'symmetric Elo moves R_house down on a player win');
    assert.equal(vaultGradeFor(after.house), 2, 'reading R_house would make a 50-win streak EASIER');
    assert.equal(vaultGradeFor(after.player), 4, 'reading R_player makes it harder, which is the spec');
  });

  test('a non-finite rating falls back to the seed band rather than throwing', () => {
    assert.equal(vaultGradeFor(undefined), 3);
    assert.equal(vaultGradeFor(NaN), 3);
    assert.equal(vaultGradeFor('nonsense'), 3);
  });
});

/* =========================================================================================
   13. Flow control moves R_player, not R_house (G3.5)
   ========================================================================================= */

describe('J3 · flow control moves R_player, never R_house (G3.5)', () => {
  const job = (bagged, posted = 100) => ({ bagged, posted, guard: 'RECALL' });

  test('it fires only after TWO consecutive jobs under half the posted value', () => {
    assert.equal(flowControl([job(40), job(40)]).fire, true);
    assert.equal(flowControl([job(40)]).fire, false, 'one job is not a pattern');
    assert.equal(flowControl([job(40), job(60)]).fire, false);
    assert.equal(flowControl([job(60), job(40)]).fire, false);
    assert.equal(flowControl([job(50), job(40)]).fire, false, '0.5·posted exactly is not under it');
    assert.equal(flowControl([job(10), job(10), job(90), job(40)]).fire, false, 'only the last two count');
    assert.equal(flowControl([]).fire, false);
    assert.equal(flowControl(null).fire, false);
    assert.equal(flowControl({ game: { log: [job(10), job(10)] } }).fire, true, 'a save works too');
  });

  test('the penalty is −40 on R_player and exactly 0 on R_house', () => {
    const f = flowControl([job(10), job(10)]);
    assert.equal(f.deltaPlayer, ELO.flowPenalty);
    assert.equal(f.deltaPlayer, -40);
    assert.equal(f.deltaHouse, 0);
    const out = applyFlowControl({ player: 1100, house: 980 }, [job(10), job(10)]);
    assert.equal(out.player, 1060);
    assert.equal(out.house, 980, 'R_house is untouched — that is the criterion, not a detail');
  });

  test('nothing moves when it does not fire', () => {
    const out = applyFlowControl({ player: 1100, house: 980 }, [job(90), job(90)]);
    assert.equal(out.player, 1100);
    assert.equal(out.house, 980);
    assert.equal(out.flow.foothold, null);
  });

  test('the FOOTHOLD it opens is the published contract, and it is stated on the board', () => {
    const f = flowControl([job(10), job(10)]);
    assert.deepEqual({ ...f.foothold }, { targets: 3, tier: 1, role: 'review', guardMult: 0.5 });
    assert.equal(COPY.foothold(), 'FOOTHOLD');
  });

  test('a board-walk is not a bad job: three of them leave R_player and the vault grade untouched', () => {
    // `flowControl` fires on `posted > 0 && bagged < 0.5·posted`, which every one-tap walk off the
    // board satisfies — in the same function whose own `ratesElo` gate exists to keep a quit from
    // counting. Three walks cost 80 R_player and silently demoted the next vault a whole tier.
    const walk = { posted: 162, bagged: 0, targets: 0, guard: 'RECALL' };
    const start = { player: 1020, house: 980 };
    assert.equal(vaultGradeFor(start.player), 3);
    let elo = start;
    for (let k = 1; k <= 3; k++) {
      elo = applyFlowControl(elo, Array.from({ length: k }, () => walk));
      assert.equal(elo.player, start.player, `after ${k} walks R_player is unmoved`);
    }
    assert.equal(vaultGradeFor(elo.player), 3, 'and the vault is still the grade it earned');
    assert.equal(flowControl(Array.from({ length: 12 }, () => walk)).fire, false, 'twelve of them, too');
    assert.equal(flowControl([walk, walk]).played, 0, 'none of them is a job');
    // the same record with ONE target answered is a bad job again, and is priced as one
    const worked = { ...walk, targets: 1 };
    assert.equal(flowControl([worked, worked]).fire, true);
  });

  test('one pattern fires ONCE: a run of bad jobs is not an unbounded slide', () => {
    // `state.endJob` pushes the current job's entry and then reads `log.slice(-2)`, so three bad
    // jobs fired the penalty twice and four fired it three times — uncommunicated, and it drives
    // the vault grade. The penalty now fires on the transition into the pattern.
    const bad = (i) => ({ posted: 100, bagged: 10, targets: 10, guard: 'RECALL', id: i });
    const good = (i) => ({ posted: 100, bagged: 100, targets: 10, guard: 'RECALL', id: i });
    const log = [];
    const fired = [];
    for (let i = 0; i < 6; i++) { log.push(bad(i)); if (flowControl(log).fire) fired.push(i); }
    assert.deepEqual(fired, [1], 'six bad jobs running cost 40, not 200');

    const log2 = [];
    const fired2 = [];
    for (const step of [bad, bad, good, bad, bad]) { log2.push(step(log2.length)); if (flowControl(log2).fire) fired2.push(log2.length - 1); }
    assert.deepEqual(fired2, [1, 4], 'and one job that clears the bar re-arms it');

    // walks in between neither fire it nor re-arm it
    const walk = { posted: 100, bagged: 0, targets: 0 };
    assert.equal(flowControl([bad(0), bad(1), walk, walk]).fire, false, 'already fired; walks add nothing');
    assert.equal(flowControl([good(0), walk, bad(1), bad(2)]).fire, true, 'and hide nothing either');
  });

  test('the FOOTHOLD is a board the caller can build, not a constant compared with itself', () => {
    const bad = { posted: 100, bagged: 10, targets: 10 };
    const f = footholdFor([bad, bad]);
    assert.equal(f.fire, true);
    assert.deepEqual(f.contract, { ...ELO.footholdContract });
    assert.equal(f.contract.targets, 3);
    assert.equal(f.contract.tier, 1);
    assert.equal(f.contract.role, 'review');
    assert.equal(f.contract.guardMult, 0.5);
    assert.equal(f.label, COPY.foothold());
    assert.equal(f.deltaPlayer, ELO.flowPenalty);
    assert.notEqual(f.contract, ELO.footholdContract, 'a copy, so a board may not edit the constant');
    const quiet = footholdFor([{ posted: 100, bagged: 100, targets: 10 }]);
    assert.deepEqual([quiet.fire, quiet.contract, quiet.label, quiet.deltaPlayer], [false, null, null, 0]);

    // the −40 is charged once, by endJob; the easier board is a STATE, and a walk between the
    // two does not quietly cancel it, nor does a third bad job
    const walk = { posted: 100, bagged: 0, targets: 0 };
    assert.equal(flowControl([bad, bad, walk]).fire, false, 'the penalty does not re-fire');
    assert.equal(footholdFor([bad, bad, walk]).fire, true, 'the FOOTHOLD is still owed');
    assert.equal(flowControl([bad, bad, bad]).fire, false);
    assert.equal(footholdFor([bad, bad, bad]).fire, true);
    assert.equal(footholdFor([bad, bad, { posted: 100, bagged: 100, targets: 10 }]).fire, false,
      'one job that clears the bar ends it');
  });

  test('flow control can push the vault grade down a band — and only through R_player', () => {
    const before = { player: 1020, house: 980 };
    assert.equal(vaultGradeFor(before.player), 3);
    const after = applyFlowControl(before, [job(10), job(10)]);
    assert.equal(after.player, 980);
    assert.equal(vaultGradeFor(after.player), 2);
    assert.equal(after.house, before.house);
  });
});

/* =========================================================================================
   14. The guard's PRICE stays in econ.js (notes/J1.md §7)
   ========================================================================================= */

describe('J3 · the guard s distribution and the guard s price live in different files', () => {
  test('the guarded-wing multiplier is the rank ladder, re-exported from econ.js not re-derived', () => {
    for (const row of RANKS) assert.equal(guardMultFor(row.rank), row.guardMult);
    assert.equal(guardMultFor(1), 0.50);
    assert.equal(guardMultFor(5), 0.75);
  });

  test('a token pays +0.25× only on an unguarded wing; the guarded wing pays guardMult', () => {
    assert.equal(wingMult({ tokens: 2, guarded: false }), 1 + 2 * GUARD.tokenBonus);
    assert.equal(wingMult({ tokens: 2, guarded: true, rank: 3 }), 0.60);
    assert.equal(wingPen(true), GUARD.wingPenGuarded);
    assert.equal(wingPen(false), GUARD.wingPenUnguarded);
  });

  test('rank helps monotonically on the guarded wing while ε falls — both halves printed', () => {
    for (let i = 1; i < RANKS.length; i++) {
      assert.ok(RANKS[i].guardMult >= RANKS[i - 1].guardMult, 'the guard bites less as you climb');
      assert.ok(RANKS[i].eps <= RANKS[i - 1].eps, 'and it aims better at you as you climb');
    }
  });
});

/* =========================================================================================
   15. Discipline: DOM-free, clock-free, pure
   ========================================================================================= */

describe('J3 · guard.js is DOM-free, clock-free and pure', () => {
  const src = readFileSync(join(ROOT, 'site', 'js', 'job', 'guard.js'), 'utf8');
  const code = stripCommentsAndStrings(src);

  test('no DOM, no storage, no import from screens/', () => {
    for (const bad of ['document.', 'window.', 'localStorage', 'navigator.', 'requestAnimationFrame', 'getElementById', 'CSS']) {
      assert.equal(code.includes(bad), false, `guard.js references ${bad}`);
    }
    assert.equal(/from\s+['"][^'"]*screens\//.test(src), false);
  });

  test('no payoff term reads a clock (G3.7 proof 5: the tick law)', () => {
    for (const word of ['Date', 'elapsed']) {
      assert.equal(new RegExp(`\\b${word}\\b`).test(code), false, `guard.js mentions ${word}`);
    }
  });

  test('it imports only data/, rng.js and econ.js — nothing from the study layer s writers', () => {
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]).sort();
    assert.deepEqual(imports, ['../../data/job.js', '../../data/misconceptions.js', '../rng.js', './econ.js']);
  });

  test('nothing here writes to a save', () => {
    const save = { player: { rank: 3 }, game: { heat: { window: rep(2, 'JOB', DECOY) }, log: [{ guard: 'RECALL' }] }, cards: {} };
    const before = JSON.stringify(save);
    guardDist(save, undefined, undefined);
    xHatFrom(save);
    heatWindow(save);
    blockedWing(save);
    wingValues(save, [{ skill: 'VOC', tier: 1 }]);
    pushHeat(save.game.heat, { press: REAL, posted: 10 });
    assert.equal(JSON.stringify(save), before, 'the save was mutated');
  });

  test('the whole module imports cleanly with no DOM shim and every named export is present', () => {
    for (const fn of [wingOf, wingOfTag, wingValues, guardDist, project, drawGuard, pressAdvice, elo, vaultGradeFor]) {
      assert.equal(typeof fn, 'function');
    }
    assert.ok(Array.isArray(WINGS) && WINGS.length === 4);
    assert.ok(Object.isFrozen(WING_WEIGHTS));
  });
});
