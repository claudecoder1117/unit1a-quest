// plan.test.mjs — T14. The S7 plan, with the numbers the spec prints pinned literally.
//
// COMPOSED S6 names this file's required cases: "tier-weighted R; a fresh save at D = 7 gives q ≤ 12 with
// no warning; D = 2 gives the Final Sweep; provisional Readiness until the first Mock; Weak spots never
// lists an n = 0 skill." S7 adds the arithmetic (R ≈ 61, q ≈ 11 at D = 7, ≈ 7 at D = 10, cap 40, the
// warning + visible lowering above 12, the per-day floor of 2 M11/M12 Variants, the pills, the edge cases).

import test from 'node:test';
import assert from 'node:assert/strict';

import * as plan from '../site/js/plan.js';
import { qFor as pageQFor, composePage, LIMITS, TIER_WEIGHT as PAGE_TIER_WEIGHT, FAMILY_WEIGHT as PAGE_FAMILY_WEIGHT } from '../site/js/page.js';
import { fresh } from '../site/js/store.js';
import { readiness, weakSpots, skillStates } from '../site/js/readiness.js';
import { dueList, SWEEP_DAYS, SWEEP_BUCKET } from '../site/js/schedule.js';
import { cards as ALL_CARDS, byId } from '../site/data/cards.js';
import { families } from '../site/data/modules.js';

const T0 = new Date(2026, 8, 17, 10, 0, 0).getTime();   // Thu 2026-09-17, 10:00 local
const MORN = new Date(2026, 8, 17, 6, 30, 0).getTime();   // … and 06:30, before an 08:00 test
const TODAY = '2026-09-17';
const newSave = () => fresh(T0);

/** A save with a test date D days out. */
function saveAt(D, { time = '08:00' } = {}) {
  const s = newSave();
  s.settings.testDate = plan.addDays(TODAY, D);
  s.settings.testTime = time;
  return s;
}

/** Mark a card cleared the way the Card screen does. */
function clear(save, id, { at = T0, bucket = 1 } = {}) {
  save.cards[id] = {
    attempts: 1, cleared: true, rarity: 'gold', foil: false, foilProgress: [], setupTried: true,
    bucket, lastAt: at, due: at + bucket * 86400000, hintsUsed: 0, solutionShown: false, bestMs: 1000,
    placed: false, work: '', history: [{ at, ok: true, attempt: 1, hints: 0, ms: 1000 }], lastFirstTry: true,
  };
  return save;
}

/* ------------------------------------------------------------------ R: tier-weighted work */

test('S7: R is TIER-WEIGHTED, not a card count', async (t) => {
  await t.test('the weights are the spec table and page.js agrees', () => {
    assert.deepEqual({ ...plan.TIER_WEIGHT }, { 1: 1 / 6, 2: 1 / 2, 3: 1, 4: 1 });
    assert.deepEqual({ ...plan.TIER_WEIGHT }, { ...PAGE_TIER_WEIGHT });
    assert.equal(plan.FAMILY_WEIGHT, 3);
    assert.equal(plan.FAMILY_WEIGHT, PAGE_FAMILY_WEIGHT);
  });

  await t.test('a fresh save is R ≈ 61 (S7), not 164', () => {
    const w = plan.workR(newSave());
    assert.equal(w.cards, 164, 'the non-bonus bank');
    assert.equal(w.families, 4);
    assert.ok(w.R > 55 && w.R < 68, `R ≈ 61, got ${w.R}`);
    assert.equal(w.R, 62.5, 'the exact number this data set produces (S7 says "≈ 61")');
    // …and it is decisively smaller than the unweighted count, which is the whole point of the weighting.
    assert.ok(w.R < w.cards / 2, 'the weighting is what keeps the default week off the warning');
  });

  await t.test('the per-tier split is the S7 arithmetic', () => {
    const w = plan.workR(newSave());
    assert.deepEqual(w.counts, { 1: 105, 2: 52, 3: 3, 4: 4 });
    // 105 ten-second cards weigh 17.5, not 105.
    assert.equal(w.weights[1], 17.5);
    assert.equal(w.weights[2], 26);
    assert.equal(w.weights[3] + w.weights[4], 7);
    assert.equal(w.familyWeight, 12);
    // the printed R is rounded; the one q divides is the raw sum (⅙ is not representable)
    assert.ok(Math.abs(w.Rexact - w.R) < 0.005 && w.R === Math.round(w.R * 100) / 100);
  });

  await t.test('a tier-1 clear moves R by ⅙ and a tier-4 clear by 1', () => {
    const base = plan.workR(newSave()).R;
    const t1 = plan.workR(clear(newSave(), 'asn-01')).R;
    const t4 = plan.workR(clear(newSave(), 'ang-10')).R;
    assert.equal(byId['asn-01'].tier, 1);
    assert.equal(byId['ang-10'].tier, 4);
    assert.ok(Math.abs((base - t1) - 1 / 6) < 0.02, `tier 1 costs ⅙, got ${base - t1}`);
    assert.ok(Math.abs((base - t4) - 1) < 0.02, `tier 4 costs 1, got ${base - t4}`);
  });

  await t.test('Bonus never counts, a family tile counts 3, a placed module stops counting', () => {
    const s = newSave();
    const withBonus = plan.workR(clear(s, 'bonus-01')).R;
    assert.equal(withBonus, 62.5, 'clearing a Bonus card changes nothing');

    const famSave = newSave();
    famSave.variants['fam-sys'] = { clearsGold: 1, goldDays: ['2026-09-17'] };
    assert.equal(plan.workR(famSave).R, 62.5 - 3, 'a tile at Bronze is no longer uncleared work');

    const jumped = newSave();
    jumped.jumps.M10 = true;                                   // JUMP HERE placed M10 Factoring
    const dropped = 62.5 - plan.workR(jumped).R;
    assert.ok(dropped > 8 && dropped < 10, `18 tier-2/3 factorings ≈ 9, got ${dropped}`);
  });
});

/* ------------------------------------------------------------------ q: the day's target */

test('S7: q = ceil(R / max(D − 1, 1)), capped 40, warned above 12', async (t) => {
  const s = newSave();

  await t.test('the pinned numbers: ≈ 11 at D = 7 and ≈ 7 at D = 10', () => {
    assert.equal(plan.qFor(s, { D: 7 }).q, 11);
    assert.equal(plan.qFor(s, { D: 10 }).q, 7);
  });

  await t.test('a fresh save at D = 7 gives q ≤ 12 WITH NO WARNING (S6/S8 acceptance)', () => {
    const q = plan.qFor(s, { D: 7 });
    assert.ok(q.q <= 12, `q = ${q.q}`);
    assert.equal(q.warn, false, 'the warning is the exception, not the default state (S7)');
    assert.equal(q.target, q.q, 'nothing is lowered when nothing is over');
    assert.equal(plan.lowering(s, q).active, false);
  });

  await t.test('the warning starts exactly above 12 and lowers the target visibly', () => {
    assert.equal(plan.qFor(s, { D: 7 }).warn, false, 'q = 11');
    const six = plan.qFor(s, { D: 6 });
    assert.equal(six.q, 13);
    assert.equal(six.warn, true);
    assert.equal(six.target, 12, 'the target is LOWERED, not silently scheduled');
    const low = plan.lowering(s, six);
    assert.equal(low.active, true);
    assert.equal(low.microFlashOnly, true, 'M1 micro-cards drop to flash only');
    assert.equal(low.tier4PerDay, 1, 'tier-4 cards spread to one per day');
    assert.match(low.headline, /13/, 'the strip says the real number');
    assert.match(low.headline, /12/, '… and the one it will actually run');
    assert.ok(low.lines.length >= 2, 'the lowering is spelled out, never silent');
  });

  await t.test('q is capped at 40 and never NaN, however short the week', () => {
    for (const D of [0, 1, 2, 3]) {
      const q = plan.qFor(s, { D });
      assert.ok(Number.isInteger(q.q) && q.q <= 40, `D=${D} → ${q.q}`);
      assert.equal(q.target, 12, 'above the cap the student still sees 12 a day');
    }
    assert.equal(plan.qFor(s, { D: 1 }).qRaw, 63, 'the honest number is kept for the copy');
    assert.equal(plan.qFor(s, { D: 1 }).q, 40, '… but q itself is capped');
  });

  await t.test('no test date → q = 12, no warning (the no-date state)', () => {
    const q = plan.qFor(s, { D: null });
    assert.equal(q.q, 12);
    assert.equal(q.target, 12);
    assert.equal(q.warn, false);
    assert.equal(q.D, null);
    assert.equal(plan.qFor(newSave()).q, 12, 'a save with settings.testDate = null reads the same');
  });

  await t.test('q shrinks as the packet is cleared (falling behind redistributes silently)', () => {
    const half = newSave();
    for (const c of ALL_CARDS.slice(0, 80)) clear(half, c.id);
    assert.ok(plan.qFor(half, { D: 7 }).q < plan.qFor(s, { D: 7 }).q);
  });

  await t.test('plan.js and page.js compute ONE R and ONE q (they must never drift)', () => {
    const saves = [newSave(), clear(newSave(), 'ang-10'), (() => { const x = newSave(); x.jumps.M1 = true; return x; })()];
    for (const sv of saves) {
      for (const D of [null, 0, 1, 2, 3, 5, 6, 7, 9, 10, 14, 30]) {
        const a = plan.qFor(sv, { D }), b = pageQFor(sv, { D });
        assert.ok(Math.abs(a.R - b.R) < 0.005, `R at D=${D}: ${a.R} vs ${b.R}`);   // plan.js rounds to 2 dp
        assert.equal(a.q, b.q, `q at D=${D}`);
        assert.equal(a.warn, b.warn, `warn at D=${D}`);
        assert.equal(a.target, b.target, `target at D=${D}`);
      }
    }
  });
});

/* ------------------------------------------------------------------ the M11/M12 floor */

test('S7: a per-day floor of 2 M11/M12 Variants keeps the doc’s algebra topic on the plan', async (t) => {
  await t.test('the number is the same one page.js enforces', () => {
    assert.equal(plan.ALGEBRA_FLOOR, 2);
    assert.equal(plan.ALGEBRA_FLOOR, LIMITS.algebraFloor);
  });

  await t.test('a composed page on a fresh save really carries ≥ 2 of them', () => {
    const s = saveAt(7);
    const page = composePage(s, { now: T0, today: TODAY });
    const alg = page.queue.filter(it => it.module === 'M11' || it.module === 'M12');
    assert.ok(alg.length >= 2, `${alg.length} M11/M12 items: ${page.queue.map(i => i.module).join(',')}`);
  });

  await t.test('the plan hands the composer its lowered target', () => {
    const s = saveAt(6);                                   // q = 13 → warn
    const opts = plan.composeOpts(s, { D: 6 });
    assert.equal(opts.q, 12);
    assert.equal(opts.tier4, 1);
    const page = composePage(s, { now: T0, today: TODAY, q: opts.q });
    assert.ok(page.queue.filter(it => it.role === 'new').length <= 12, 'the composer honours it');
  });
});

/* ------------------------------------------------------------------ modes and edge cases */

test('S7 edge cases: every state the plan can be in', async (t) => {
  await t.test('no date → strip hidden, q = 12', () => {
    const p = plan.planFor(newSave(), { now: T0, today: TODAY });
    assert.equal(p.mode, 'nodate');
    assert.equal(p.D, null);
    assert.equal(p.q, 12);
    assert.equal(p.strip.visible, false, 'the strip is hidden until there is a date');
    assert.equal(p.pills.length, 0);
    assert.match(p.notes[0], /test date/i);
  });

  await t.test('D ≤ 1 → Night Before / Test Morning replace the page', () => {
    assert.equal(plan.planFor(saveAt(1), { now: T0, today: TODAY }).mode, 'night');
    assert.equal(plan.planFor(saveAt(0), { now: MORN, today: TODAY }).mode, 'morning');   // before the test hour
    assert.equal(plan.planFor(saveAt(2), { now: T0, today: TODAY }).mode, 'page');
  });

  await t.test('D = 0 after testTime + 90 min → Post-test; before it → Test Morning', () => {
    const s = saveAt(0, { time: '08:00' });
    const at = plan.planFor(s, { now: T0, today: TODAY }).testAt;
    assert.ok(Number.isFinite(at));
    assert.equal(plan.modeFor(s, { now: at - 1000, today: TODAY }), 'morning');
    assert.equal(plan.modeFor(s, { now: at + 60 * 60 * 1000, today: TODAY }), 'morning', 'still morning 60 min in');
    assert.equal(plan.modeFor(s, { now: at + 91 * 60 * 1000, today: TODAY }), 'post');
  });

  await t.test('a past date → Post-test, whatever the clock says', () => {
    const p = plan.planFor(saveAt(-1), { now: T0, today: TODAY });
    assert.equal(p.mode, 'post');
    assert.equal(p.post, true);
    assert.equal(p.strip.visible, false);
    assert.match(p.notes[0], /test is done/i);
  });

  await t.test('changing the date recomputes and never touches progress', () => {
    const s = saveAt(10);
    clear(s, 'wp-01');
    s.xp = 500;
    const before = plan.planFor(s, { now: T0, today: TODAY });
    assert.equal(before.target, plan.qFor(s, { D: 10 }).q);
    s.settings.testDate = plan.addDays(TODAY, 4);
    const after = plan.planFor(s, { now: T0, today: TODAY });
    assert.ok(after.target !== before.target || after.warn !== before.warn, 'the number just changes');
    assert.equal(s.xp, 500, 'XP untouched');
    assert.equal(s.cards['wp-01'].cleared, true, 'clears untouched');
  });

  await t.test('the Mock is available from day 1 and OFFERED from D − 4', () => {
    for (const D of [10, 7, 5]) assert.equal(plan.planFor(saveAt(D), { now: T0, today: TODAY }).mock.offered, false, `D=${D}`);
    for (const D of [4, 3, 2]) assert.equal(plan.planFor(saveAt(D), { now: T0, today: TODAY }).mock.offered, true, `D=${D}`);
    assert.equal(plan.planFor(saveAt(7), { now: T0, today: TODAY }).mock.available, true, 'on demand, any day');
    const scored = saveAt(3);
    scored.runs.push({ kind: 'baseline', status: 'done', accuracy: 0.7, submittedAt: T0, items: [] });
    assert.equal(plan.planFor(scored, { now: T0, today: TODAY }).mock.offered, false, 'a Baseline already scored A');
  });

  await t.test('D = 2 gives the Final Sweep (S6 case)', () => {
    const s = saveAt(2);
    clear(s, 'wp-01', { bucket: 5, at: T0 - 1000 });          // not due for 14 days …
    clear(s, 'wp-02', { bucket: 1, at: T0 - 1000 });          // … and one at bucket 1
    const p = plan.planFor(s, { now: T0, today: TODAY });
    assert.equal(p.sweep, true);
    assert.equal(plan.SWEEP_D, SWEEP_DAYS, 'the plan and the scheduler agree what "tight" means');
    const due = dueList(s, { now: T0, today: TODAY, D: 2 });
    const ids = due.map(d => d.id);
    assert.ok(ids.includes('wp-02'), 'bucket ≤ 2 is swept in');
    assert.ok(!ids.includes('wp-01'), `bucket ${SWEEP_BUCKET + 3} is not`);
    assert.ok(p.notes.some(n => /Final Sweep/i.test(n)), 'and the plan says so');
  });

  await t.test('the placement is trimmed to 4 items at D ≤ 2, with the copy that says why', () => {
    assert.equal(plan.placementSize(7), 8);
    assert.equal(plan.placementSize(3), 8);
    assert.equal(plan.placementSize(2), 4);
    assert.equal(plan.placementSize(1), 4);
    assert.equal(plan.placementSize(null), 8, 'no date → the full placement');
    assert.equal(plan.placementCopy(7), '');
    assert.match(plan.placementCopy(2), /2 days: spacing is tight/);
    assert.match(plan.placementCopy(2), /Readiness to top out lower/);
  });
});

/* ------------------------------------------------------------------ the pills */

test('S7: the plan strip is pills from today to the test', async (t) => {
  await t.test('a one-week plan ends on Night and Test, and today is marked', () => {
    const s = saveAt(7);
    const p = plan.planFor(s, { now: T0, today: TODAY });
    assert.equal(p.strip.visible, true);
    const kinds = p.pills.map(x => x.kind);
    assert.equal(kinds[kinds.length - 2], 'night');
    assert.equal(kinds[kinds.length - 1], 'morning');
    assert.equal(p.pills[0].state, 'today');
    assert.equal(p.pills[0].iso, TODAY);
    assert.equal(p.pills[p.pills.length - 1].iso, s.settings.testDate);
    assert.equal(p.pills[p.pills.length - 1].href, '#/morning');
    assert.equal(p.pills[p.pills.length - 2].href, '#/night');
    assert.ok(p.pills.length <= 7, `seven pills fit a 343 px column; got ${p.pills.length}`);
  });

  await t.test('every page pill carries the day’s planned number', () => {
    const p = plan.planFor(saveAt(7), { now: T0, today: TODAY });
    for (const pill of p.pills) {
      if (pill.kind !== 'page') continue;
      assert.equal(pill.planned, p.target);
      assert.match(pill.title, /new card/);
    }
  });

  await t.test('a goal-met day reads "done"; the long week collapses to a gap pill', () => {
    const s = saveAt(9);
    s.daily[TODAY] = { xp: 500, clears: 12, goalMet: true, mockDone: false };
    const p = plan.planFor(s, { now: T0, today: TODAY });
    assert.equal(p.pills[0].state, 'done');
    const gap = p.pills.find(x => x.kind === 'gap');
    assert.ok(gap, 'a 9-day plan collapses its middle');
    assert.match(gap.label, /^\+\d+$/);
    assert.ok(p.pills.length <= 7);
    // the collapsed days are named in the tooltip, never silently dropped
    assert.match(gap.title, /more page day/);
  });

  await t.test('D = 1 and D = 0 degenerate cleanly', () => {
    const one = plan.planFor(saveAt(1), { now: T0, today: TODAY });
    assert.deepEqual(one.pills.map(x => x.kind), ['night', 'morning']);
    assert.equal(one.pills[0].state, 'today');
    const zero = plan.planFor(saveAt(0), { now: MORN, today: TODAY });
    assert.deepEqual(zero.pills.map(x => x.kind), ['morning']);
    assert.equal(zero.pills[0].state, 'today');
  });

  await t.test('a ready Boss puts ♛ on today’s pill', () => {
    const s = saveAt(7);
    for (const id of ['ang-05', 'doc-05']) clear(s, id);        // M7 complete → B5 The Bisector
    const p = plan.planFor(s, { now: T0, today: TODAY });
    assert.ok(p.boss, 'the plan knows a boss is ready');
    assert.equal(p.pills[0].boss?.id, p.boss.id);
    assert.match(p.pills[0].title, /Boss:/);
  });

  await t.test('describePlan is a readable one-liner (notes + console)', () => {
    const line = plan.describePlan(plan.planFor(saveAt(7), { now: T0, today: TODAY }));
    assert.match(line, /^page D=7 R=62\.5 q=11 \|/);
  });
});

/* ------------------------------------------------------------------ the two S6 cases that live here */

test('S6: provisional Readiness until the first Mock', async (t) => {
  await t.test('a fresh save is provisional and says so', () => {
    const r = readiness(newSave());
    assert.equal(r.provisional, true);
    assert.equal(r.A, null, 'the A term is NOT scored as zero');
    assert.match(r.label, /provisional/i);
  });

  await t.test('the Baseline locks it (the first Mock-like run switches the formula)', () => {
    const s = newSave();
    for (const c of ALL_CARDS.slice(0, 40)) clear(s, c.id);
    const before = readiness(s);
    s.runs.push({ kind: 'baseline', status: 'done', accuracy: 0.8, submittedAt: T0, items: [] });
    const after = readiness(s);
    assert.equal(before.provisional, true);
    assert.equal(after.provisional, false);
    assert.equal(after.label, '');
    assert.ok(Math.abs(after.A - 0.8 * 0.8) < 1e-9, 'a mini-mock scores × 0.8');
  });

  await t.test('the plan itself never invents an A', () => {
    const p = plan.planFor(saveAt(3), { now: T0, today: TODAY });
    assert.equal(p.mock.scored, false);
    assert.equal(p.mock.offered, true, 'it asks for one instead');
  });
});

test('S7: Weak spots never lists an n = 0 skill', async (t) => {
  await t.test('a fresh save has 19 untested skills and zero weak spots', () => {
    const s = newSave();
    const states = skillStates(s);
    assert.equal(states.length, 19);
    assert.ok(states.every(x => x.untested && x.n === 0));
    assert.deepEqual(weakSpots(s), [], 'the day-0 strip never lists all 19');
  });

  await t.test('one attempt at m = 20 is weak; a placement write at m = 80 is not', () => {
    const weakSave = newSave();
    weakSave.skills['CS-LIN'] = { m: 20, n: 1, lastAt: T0, lastDueCorrectAt: null, placedAt: null };
    const w = weakSpots(weakSave);
    assert.equal(w.length, 1);
    assert.equal(w[0].id, 'CS-LIN');
    assert.equal(w[0].drill, '#/run/drill/CS-LIN');

    const placedSave = newSave();
    placedSave.skills['CS-LIN'] = { m: 80, n: 5, lastAt: T0, lastDueCorrectAt: null, placedAt: T0 };
    assert.deepEqual(weakSpots(placedSave), [], 'm_shown = 80 ≥ 70 is not a weak spot');
  });

  await t.test('a placement write shows the number it earned at once (n = 5)', () => {
    const s = newSave();
    s.skills['FAC2'] = { m: 80, n: 5, lastAt: T0, lastDueCorrectAt: null, placedAt: T0 };
    const st = skillStates(s).find(x => x.id === 'FAC2');
    assert.equal(st.mShown, 80, 'never 16 for 80 (S4)');
    assert.equal(st.untested, false);
    assert.equal(st.placed, true);
  });
});

/* ------------------------------------------------------------------ the data the plan reads */

test('the plan’s inputs exist', async (t) => {
  await t.test('every family tile the weighting counts is a real tile', () => {
    assert.equal(families.length, 4);
    for (const f of families) assert.ok(['M11', 'M12'].includes(f.module));
  });
  await t.test('every card the weighting counts has a tier in 1..4', () => {
    for (const c of ALL_CARDS) assert.ok(c.tier >= 1 && c.tier <= 4, `${c.id} tier ${c.tier}`);
  });
});

/* ------------------------------------------------------------------ onboarding + placement (S7) */

import * as onboard from '../site/js/screens/onboard.js';
import * as night from '../site/js/screens/night.js';
import * as sheetData from '../site/data/sheet.js';
import { getTemplate } from '../site/data/templates.js';
import { moduleById } from '../site/data/modules.js';

await onboard.loadData();
await night.loadAll();

test('S7 placement: 8 items, one per cluster, 4 when D ≤ 2', async (t) => {
  await t.test('the eight clusters are the ones S7 names', () => {
    const keys = onboard.PLACEMENT_CLUSTERS.map(c => c.key);
    assert.deepEqual(keys, ['notation', 'asn', 'cslin', 'fac2', 'ratio', 'sys', 'quad', 'bisect']);
    const byKey = Object.fromEntries(onboard.PLACEMENT_CLUSTERS.map(c => [c.key, c]));
    assert.equal(byKey.notation.template, 'T-notation');       // notation write (M1)
    assert.equal(byKey.asn.module, 'M9');                       // ASN (M9) — no generator, a real statement
    assert.equal(byKey.cslin.template, 'T-cs-lin');             // comp/supp linear (M4)
    assert.equal(byKey.ratio.template, 'T-cs-ratio');           // ratio (M4)
    assert.equal(byKey.fac2.template, 'T-factor-a2');           // factoring a > 1 (M10)
    assert.equal(byKey.sys.template, 'T-sys');                  // system (M12)
    assert.equal(byKey.bisect.template, 'T-fig-bisect-L');      // T-fig-bisect-L (M7)
    assert.equal(byKey.quad.template, 'T-quad-solve');          // T-quad-solve …
    assert.equal(byKey.quad.params.mode, 'a1');                 // … with a = 1
  });

  await t.test('no F2-type midpoint quadratic, no quadratic-with-rejection (S7)', () => {
    const used = onboard.PLACEMENT_CLUSTERS.map(c => c.template).filter(Boolean);
    assert.ok(!used.includes('T-seg-mid'), 'no midpoint quadratic on day 0');
    assert.ok(!used.includes('T-quad-ctx') && !used.includes('T-cs-quad'), 'no rejection problem on day 0');
    assert.ok(!used.includes('T-fig-xlines-Q') && !used.includes('T-fig-bisect-Q'), 'no two-case diagram on day 0');
  });

  await t.test('the size and the pool follow D', () => {
    const s = newSave();
    assert.equal(onboard.placementItems(s, { D: 7 }).length, 8);
    assert.equal(onboard.placementItems(s, { D: 2 }).length, 4);
    const short = onboard.placementItems(s, { D: 2 }).map(i => i.key);
    assert.deepEqual(short, ['notation', 'asn', 'cslin', 'fac2']);
    // the trimmed run is strictly tier ≤ 3 (S7: "no tier 4 on day 0")
    for (const it of onboard.placementItems(s, { D: 2 })) {
      const tier = it.source.template ? getTemplate(it.source.template).tier : 1;
      assert.ok(tier <= 3, `${it.key} is tier ${tier}`);
    }
  });

  await t.test('items are deterministic per save and never use Math.random', () => {
    const s = newSave();
    const a = onboard.placementItems(s, { D: 7 }).map(i => JSON.stringify(i.source));
    const b = onboard.placementItems(s, { D: 7 }).map(i => JSON.stringify(i.source));
    assert.deepEqual(a, b);
    // a different profile gets different seeds (the ASN index can legitimately collide 1 in 36, so the
    // assertion is on the Variant seed, which embeds the profile id)
    const other = { ...newSave(), profileId: 'someone-else' };
    assert.notEqual(onboard.placementItems(other, { D: 7 })[0].source.seed,
      onboard.placementItems(s, { D: 7 })[0].source.seed);
  });

  await t.test('"skip the rest" is offered after item 4', () => {
    assert.equal(onboard.SKIP_AFTER, 4);
  });
});

test('S7 placement writes: m = 80 / 50 / 0 WITH n = 5, and a clean item places its module', async (t) => {
  await t.test('the outcome rule is clean / retry / wrong', () => {
    assert.equal(onboard.outcomeOf({ cleared: true, clean: true }), 'clean');
    assert.equal(onboard.outcomeOf({ cleared: true, firstTry: true, hints: 0 }), 'clean');
    assert.equal(onboard.outcomeOf({ cleared: true, firstTry: true, hints: 1 }), 'retry');
    assert.equal(onboard.outcomeOf({ cleared: true, firstTry: false }), 'retry');
    assert.equal(onboard.outcomeOf({ cleared: false, solutionShown: true }), 'wrong');
    assert.equal(onboard.outcomeOf(null), 'wrong');
  });

  await t.test('every touched skill gets n = 5 so m_shown = m from the first minute', () => {
    const s = newSave();
    onboard.applyPlacement(s, {
      notation: { outcome: 'clean', skills: ['NOTE'], module: 'M1' },
      ratio: { outcome: 'retry', skills: ['CS-RATIO'], module: 'M4' },
      fac2: { outcome: 'wrong', skills: ['FAC2'], module: 'M10' },
    }, { now: 1000, total: 8, skipped: 5 });
    assert.equal(s.skills.NOTE.m, 80);
    assert.equal(s.skills['CS-RATIO'].m, 50);
    assert.equal(s.skills.FAC2.m, 0);
    for (const id of ['NOTE', 'CS-RATIO', 'FAC2']) assert.equal(s.skills[id].n, 5, id);
    assert.equal(skillStates(s).find(x => x.id === 'NOTE').mShown, 80, 'never 16 for 80');
  });

  await t.test('placedAt and jumps[M] only on a CLEAN item', () => {
    // W5: the clean item here is `fac2` (M10, 18 originals). `notation` is clean too but M1 is
    // withheld by §A2 below — the skill write is unchanged either way, which is what this case is for.
    const s = newSave();
    onboard.applyPlacement(s, {
      notation: { outcome: 'clean', skills: ['NOTE'], module: 'M1' },
      fac2: { outcome: 'clean', skills: ['FAC2'], module: 'M10' },
      quad: { outcome: 'retry', skills: ['QUAD-SOLVE'], module: 'M11' },
    }, { now: 1000, total: 8 });
    assert.equal(s.skills.NOTE.placedAt, 1000);
    assert.equal(s.skills.FAC2.placedAt, 1000);
    assert.equal(s.skills['QUAD-SOLVE'].placedAt, null);
    assert.deepEqual(Object.keys(s.jumps), ['M10']);
    assert.deepEqual(s.placement.placed, ['M10']);
  });

  // W5 integrator decision — notes/OPEN-ISSUES.md §A2 (raised by T14 #3, INTEGRATION-W5 §1.1).
  await t.test('a module too big for the placement to sample is NOT placed off one clean item', () => {
    const s = saveAt(7);
    const before = plan.qFor(s, { D: 7 });
    const out = onboard.applyPlacement(s, { notation: { outcome: 'clean', skills: ['NOTE'], module: 'M1' } }, { now: 1, total: 8 });

    assert.equal(onboard.originalsCount('M1'), 55, 'M1 holds 55 originals behind one placement cluster');
    assert.ok(onboard.originalsCount('M1') > onboard.PLACE_MAX_ORIGINALS);
    assert.equal(onboard.placeNeedsClean('M1'), onboard.PLACE_LARGE_CLEAN);
    assert.ok(onboard.placeWithheld('M1'), 'one cluster < two clean needed → the placement can never place M1');

    assert.deepEqual(out.placedModules, [], 'nothing placed');
    assert.deepEqual(out.withheld, ['M1'], 'M1 reported as withheld so the summary can say so');
    assert.ok(!s.jumps.M1, 'the 55 M1 originals stay in the new-card pool');
    assert.equal(s.skills.NOTE.m, 80, 'the skill still gets its number …');
    assert.equal(s.skills.NOTE.placedAt, 1, '… and its placedAt — what was demonstrated is recorded');
    assert.equal(plan.qFor(s, { D: 7 }).R, before.R, 'R does not collapse');

    // M9 (54 originals, one cluster) is the other one the rule catches.
    assert.ok(onboard.placeWithheld('M9'), 'M9 holds 54 originals behind the single ASN cluster');
    // …and JUMP HERE is still allowed to place M1 — 10 items, ≥ 8 is a real sample.
    const j = saveAt(7);
    onboard.applyJump(j, 'M1', { correct: 9, total: 10, skills: ['VOC', 'NOTE', 'CLASS'], now: 5 });
    assert.equal(j.jumps.M1, true, 'JUMP HERE still places the big module');
  });

  await t.test('M4 needs BOTH of its items clean (S7)', () => {
    const one = newSave();
    onboard.applyPlacement(one, {
      cslin: { outcome: 'clean', skills: ['CS-LIN'], module: 'M4' },
      ratio: { outcome: 'retry', skills: ['CS-RATIO'], module: 'M4' },
    }, { now: 1, total: 8 });
    assert.ok(!one.jumps.M4, 'one clean is not enough for M4');

    const both = newSave();
    onboard.applyPlacement(both, {
      cslin: { outcome: 'clean', skills: ['CS-LIN'], module: 'M4' },
      ratio: { outcome: 'clean', skills: ['CS-RATIO'], module: 'M4' },
    }, { now: 1, total: 8 });
    assert.equal(both.jumps.M4, true);

    const trimmed = newSave();     // the D ≤ 2 run only asks cslin, so M4 can never be placed from it
    onboard.applyPlacement(trimmed, { cslin: { outcome: 'clean', skills: ['CS-LIN'], module: 'M4' } }, { now: 1, total: 4 });
    assert.ok(!trimmed.jumps.M4);
  });

  await t.test('a placed module drops out of the plan (R and q move with it)', () => {
    const before = plan.qFor(saveAt(7), { D: 7 });
    const s = saveAt(7);
    onboard.applyPlacement(s, { fac2: { outcome: 'clean', skills: ['FAC2'], module: 'M10' } }, { now: 1, total: 8 });
    const after = plan.qFor(s, { D: 7 });
    assert.ok(after.R < before.R, `${after.R} < ${before.R}`);
    assert.ok(after.q <= before.q);
  });

  await t.test('the placement stamp records what happened', () => {
    const s = newSave();
    onboard.applyPlacement(s, { fac2: { outcome: 'clean', skills: ['FAC2'], module: 'M10' } }, { now: 7, total: 8, skipped: 7 });
    assert.deepEqual(s.placement, { done: true, at: 7, answered: 1, total: 8, skipped: 7, placed: ['M10'], results: { fac2: 'clean' } });
  });
});

test('S1 JUMP HERE: 10 items, ≥ 8 marks the module placed', async (t) => {
  await t.test('the numbers are S1’s', () => {
    assert.equal(onboard.JUMP_ITEMS, 10);
    assert.equal(onboard.JUMP_PASS, 8);
    assert.equal(onboard.PLACEMENT_M.clean, 80);
  });

  await t.test('8 of 10 places the module with m = 80, n = 5, placedAt and jumps[M]', () => {
    const s = newSave();
    const r = onboard.applyJump(s, 'M10', { correct: 8, total: 10, skills: ['FAC1', 'FAC2'], now: 500 });
    assert.equal(r.passed, true);
    assert.equal(s.jumps.M10, true);
    for (const id of ['FAC1', 'FAC2']) {
      assert.equal(s.skills[id].m, 80, id);
      assert.equal(s.skills[id].n, 5, id);
      assert.equal(s.skills[id].placedAt, 500, id);
    }
  });

  await t.test('7 of 10 places nothing and never stamps mastery over what the 10 cards earned', () => {
    const s = newSave();
    s.skills.FAC2 = { m: 70, n: 8, lastAt: 1, lastDueCorrectAt: null, placedAt: null };
    const before = readiness(s).C;
    const r = onboard.applyJump(s, 'M10', { correct: 7, total: 10, skills: ['FAC2'], now: 500 });
    assert.equal(r.passed, false);
    assert.ok(!s.jumps.M10);
    assert.deepEqual(s.skills.FAC2, { m: 70, n: 8, lastAt: 1, lastDueCorrectAt: null, placedAt: null },
      'one bad sitting does not wipe an earned 70 — the cards already moved mastery as they were answered');
    assert.equal(readiness(s).C, before, 'C counts only Cards actually cleared (S1)');
  });

  await t.test('every jumpable module can build a pool, and it is deterministic', () => {
    const s = newSave();
    for (const m of Object.values(moduleById)) {
      if (!m.jump) continue;
      const items = onboard.jumpItems(s, m.id);
      if (m.id === 'M3') { assert.ok(items.length > 0, 'M3 is generated'); continue; }
      assert.ok(items.length > 0, `${m.id} has a JUMP pool`);
      assert.ok(items.length <= 10, `${m.id} pool is ${items.length}`);
      assert.deepEqual(items.map(x => x.key), onboard.jumpItems(s, m.id).map(x => x.key), `${m.id} deterministic`);
    }
    assert.deepEqual(onboard.jumpItems(s, 'NOPE'), []);
  });
});

/* ------------------------------------------------------------------ Night Before / Test Morning (S7) */

test('S7 Night Before: four blocks, sized to 30 minutes', async (t) => {
  await t.test('block 1 is 12 M1 notation cards', () => {
    const items = night.flashItems(newSave());
    assert.equal(items.length, night.FLASH_COUNT);
    assert.equal(night.FLASH_COUNT, 12);
    assert.ok(items.slice(0, 9).every(i => /^not-\d\d$/.test(i.key)), 'the nine originals first');
    assert.ok(items.slice(9).every(i => i.source.template === 'T-notation'), 'then fresh Variants');
  });

  await t.test('block 2 is up to 8 items with bucket ≤ 2', () => {
    assert.equal(night.SWEEP_COUNT, 8);
    const s = saveAt(1);
    clear(s, 'wp-01', { bucket: 1, at: T0 - 5 * 86400000 });
    clear(s, 'wp-02', { bucket: 5, at: T0 - 5 * 86400000 });
    s.cards['wp-02'].due = T0 + 9 * 86400000;
    const items = night.sweepItems(s, { now: T0, today: TODAY });
    assert.ok(items.length <= 8);
    assert.ok(items.some(i => i.key === 'wp-01'), 'a bucket-1 card is swept in');
    const keys = items.map(i => i.key);
    assert.ok(keys.indexOf('wp-01') < 2, 'and it comes first (most overdue)');
  });

  await t.test('block 3 elites: ang-10 and doc-05 ONLY when already ≥ Bronze, else their LINEAR variants', () => {
    const fresh0 = night.miniMockItems(newSave()).map(i => i.key);
    assert.ok(fresh0.includes('T-fig-xlines-L'), 'ang-10 has never been cleared → its linear stand-in');
    assert.ok(fresh0.includes('T-fig-bisect-L'), 'doc-05 likewise');
    assert.ok(!fresh0.includes('ang-10') && !fresh0.includes('doc-05'), 'no new tier-4 content the night before');

    const seen = newSave();
    clear(seen, 'ang-10');
    clear(seen, 'doc-05');
    const keys = night.miniMockItems(seen).map(i => i.key);
    assert.ok(keys.includes('ang-10') && keys.includes('doc-05'), 'once cleared, the elites themselves');
    assert.ok(!keys.includes('T-fig-xlines-L') && !keys.includes('T-fig-bisect-L'));
  });

  await t.test('block 3 is 8 items, carries one Kuta a > 1, and nothing above tier 3 as filler', () => {
    const items = night.miniMockItems(newSave());
    assert.equal(items.length, night.MINI_COUNT);
    assert.equal(night.MINI_COUNT, 8);
    assert.ok(items.some(i => i.source.template === 'T-factor-a2'), 'one Kuta a > 1');
    assert.equal(night.MINI_LIMIT_MS, 15 * 60 * 1000, 'a 15-minute cap');
    for (const it of items.slice(3)) {
      assert.ok(getTemplate(it.source.template).tier <= 3, `${it.key} is filler above tier 3`);
    }
  });

  await t.test('the quiet hour is 22:00 (S7 soft close)', () => {
    assert.equal(night.QUIET_HOUR, 22);
  });
});

test('S7 Test Morning: 6 notation + 2 ASN + 1 factoring, drawn from rarity ≥ Silver', async (t) => {
  await t.test('the shape is 6 + 2 + 1', () => {
    assert.deepEqual([night.MORNING_NOTATION, night.MORNING_ASN, night.MORNING_FAC], [6, 2, 1]);
    const items = night.morningItems(newSave());
    assert.equal(items.length, 9);
    assert.equal(items.filter(i => i.key.startsWith('not-')).length, 6);
    assert.equal(items.filter(i => i.key.startsWith('asn-')).length, 2);
    assert.equal(items.filter(i => i.key.startsWith('fac-')).length, 1);
    assert.ok(items.every(i => byId[i.key].tier <= 2), 'tier 1–2 only');
  });

  await t.test('a Silver card is preferred over an untouched one (confidence, not challenge)', () => {
    const s = newSave();
    clear(s, 'not-07');   // gold
    s.cards['not-07'].rarity = 'silver';
    const items = night.morningItems(s).map(i => i.key);
    assert.equal(items[0], 'not-07', 'the one he has actually got right comes first');
  });

  await t.test('no duplicates, ever', () => {
    const items = night.morningItems(newSave()).map(i => i.key);
    assert.equal(new Set(items).size, items.length);
  });
});

/* ------------------------------------------------------------------ the cheat sheet (S7 block 4) */

test('S7 cheat sheet: personalised lines first, then the fixed sheet', async (t) => {
  await t.test('the fixed sheet covers every rule S7 lists, each with a worked example', () => {
    const ids = sheetData.FIXED.map(s => s.id);
    for (const id of ['notation', 'defs', 'setup', 'figure', 'ratio', 'roots', 'factor', 'system']) {
      assert.ok(ids.includes(id), `section ${id}`);
    }
    for (const sec of sheetData.FIXED) {
      assert.ok(sec.lines.length > 0, sec.id);
      for (const l of sec.lines) {
        assert.ok(l.rule && l.rule.length > 10, `${sec.id}/${l.id} rule`);
        assert.ok(l.example && l.example.length > 4, `${sec.id}/${l.id} example — every rule carries one`);
      }
    }
    assert.equal(sheetData.FIXED_LINE_COUNT, sheetData.FIXED.reduce((n, s) => n + s.lines.length, 0));
  });

  await t.test('the personalised block is ≤ 12 lines and leads with S7’s four headline areas', () => {
    const s = newSave();
    const lines = sheetData.personalLines(s);
    assert.ok(lines.length <= sheetData.MAX_PERSONAL, `${lines.length} lines`);
    assert.equal(sheetData.MAX_PERSONAL, 12);
    assert.deepEqual(lines.slice(0, 5).map(l => l.id),
      ['m-notation', 'm-comp-supp', 'm-setup', 'm-roots', 'm-factoring']);
    assert.ok(lines.slice(5).every(l => l.id.startsWith('v-')), 'then the four thinnest definitions');
    assert.equal(lines.filter(l => l.id.startsWith('v-')).length, 4);
  });

  await t.test('a real lapse replaces the fallback line and says how often it happened', () => {
    const s = newSave();
    s.errors = [
      { item: 'not-04', tags: ['ray-order'], cleared: false, t: 1 },
      { item: 'not-08', tags: ['ray-order'], cleared: false, t: 2 },
      { item: 'wp-03', tags: ['gave-complement'], cleared: false, t: 3 },
    ];
    const lines = sheetData.personalLines(s);
    const note = lines.find(l => l.id === 'm-notation');
    assert.match(note.why, /missed this 2 times/);
    assert.match(note.text, /endpoint/i, 'the catalogue fix, not the generic fallback');
    assert.match(lines.find(l => l.id === 'm-comp-supp').why, /1 time$/);
  });

  await t.test('the four thinnest definitions are the ones behind, not the first four alphabetically', () => {
    const s = newSave();
    for (const v of ['voc-01', 'voc-02', 'voc-03', 'voc-04', 'voc-05']) clear(s, v);
    const terms = sheetData.weakestTerms(s, { max: 4 }).map(v => v.id);
    assert.ok(!terms.includes('voc-01'), 'a Gold term is not one of the thinnest');
    assert.equal(terms.length, 4);
  });

  await t.test('nothing on the sheet is a packet ANSWER', () => {
    // S7: "methods, never memorised answers". The packet's own fixed answers must not appear as the
    // answer to the card that asks for them.
    const text = sheetData.FIXED.flatMap(s => s.lines).map(l => `${l.rule} ${l.example}`).join(' ');
    assert.ok(!/111\.5/.test(text), 'wp-07’s answer');
    assert.ok(!/\b84\b/.test(text) || !/perimeter/i.test(text), 'ang-04’s perimeter');
    assert.ok(!/176/.test(text), 'wp-12’s answer');
  });

  await t.test('sheetFor bundles both halves', () => {
    const { personal, fixed } = sheetData.sheetFor(newSave());
    assert.ok(Array.isArray(personal) && Array.isArray(fixed));
    assert.equal(fixed, sheetData.FIXED);
  });
});

/* ------------------------------------------------------------------ binder r1: Night Before honesty + notation */

import { readFileSync } from 'node:fs';
import { tileText } from '../site/js/screens/binder.js';
import { nightCounted, NIGHT_FLOOR } from '../site/js/trophies.js';

test('binder r1: the Night Before sheet preview renders mini-markup, never prints it raw', () => {
  const s = JSON.parse(readFileSync(new URL('../qa/fixtures/midweek.json', import.meta.url), 'utf8'));
  const raw = sheetData.personalLines(s, { max: 4 });
  assert.ok(raw.some(l => /\{(ray|seg|line|ang|m) /.test(l.text)), 'the fixture carries notation markup');
  const lines = night.sheetPreviewLines(s);
  assert.equal(lines.length, raw.length);
  for (const l of lines) {
    assert.ok(!l.text.includes('{') && !l.title.includes('{'), `raw markup leaked: ${l.text}`);
  }
  assert.ok(lines.some(l => l.text.includes('class="mf mf-ray"')), 'the ray is a real overline span, as #/sheet draws it');
});

test('binder r1: the mini-mock scores the FIRST submit and never a retry', () => {
  assert.deepEqual(night.miniVerdict({ graded: 0, result: null }), { answered: false, firstTry: false }, 'no submit = skipped');
  assert.deepEqual(night.miniVerdict({ graded: 1, result: null }), { answered: true, firstTry: false }, 'a submit then hand-in counts, wrong');
  assert.deepEqual(night.miniVerdict({ graded: 2, result: { cleared: true, firstTry: true } }), { answered: true, firstTry: true });
  assert.deepEqual(night.miniVerdict({ graded: 2, result: { cleared: true, firstTry: false } }), { answered: true, firstTry: false }, 'retried to green is still a miss');
  assert.deepEqual(night.miniVerdict({ graded: 1, result: { cleared: false, firstTry: false } }), { answered: true, firstTry: false });
});

test('binder r1: a night counts only past the work floor (8 answered, or some answered and 10 minutes)', () => {
  assert.equal(NIGHT_FLOOR.items, 8);
  assert.equal(nightCounted({ answered: 0, startedAt: 0, submittedAt: 60 * 60_000 }), false);
  assert.equal(nightCounted({ answered: 2, startedAt: 0, submittedAt: 5 * 60_000 }), false);
  assert.equal(nightCounted({ answered: 2, startedAt: 0, submittedAt: NIGHT_FLOOR.ms }), true);
  assert.equal(nightCounted({ answered: 8, startedAt: 0, submittedAt: 1000 }), true);
});

test('binder r1: list rows say what the tile is — the term for vocab, the problem for the rest, markup kept', async () => {
  const { byId } = await import('../site/data/cards.js');
  assert.equal(tileText(byId['voc-01'], 'voc-01'), 'point');
  assert.equal(tileText(byId['def-01'], 'def-01'), 'point');
  assert.ok(!tileText(byId['quad-01'], 'quad-01').startsWith('Solve by factoring'), 'the constant instruction is dropped');
  assert.ok(/x²|x\^2/.test(tileText(byId['quad-01'], 'quad-01')), 'the equation stays');
  assert.ok(!tileText(byId['fac-01'], 'fac-01').startsWith('Factor each'));
  assert.ok(/\{seg AC\}/.test(tileText(byId['ang-04'], 'ang-04')), 'mini-markup is kept for mathfmt, not stripped to bare letters');
  assert.equal(tileText(null, 'x-1'), 'x-1');
});
