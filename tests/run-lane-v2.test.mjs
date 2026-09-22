// tests/run-lane-v2.test.mjs — repair:run, VERIFY ROUND 2.
//
// Three findings, each pinned against a property of a played corpus rather than against the
// expression the code uses — which is the failure mode round 2's critics named three times over:
// `rec.partial === (rec.drafted < deal)` and `rec.drafted === rec.items.length` are the
// implementation restated, so they passed while the field they guard was measuring the wrong thing.
//
//   §1  split-honesty (BLOCKER) — the debrief printed the MEASURED decision count beside a
//       published ceiling on a DIFFERENT BASIS. `state.debriefOf` charges ONE decision per brief
//       window (`+ g.briefs.length`); `econ.decisionCount`'s full column charges
//       `DECISIONS.briefOptionsMax` per window plus two Backcheck spends. So "35 full use / 3.5 per
//       item" is unreachable on the counter that printed next to it — a clean full-use JOB-10
//       measures 25 · 2.5 — and no word on the line said the two were different quantities.
//       PINNED HERE: the counter's own two columns, MEASURED per shape through the shipped machine,
//       and that the screen prints both bases and names each.
//
//   §2  ledger-invariance (MAJOR) — `partial` compared ANSWERS to ITEMS. `results.length` counts one
//       entry per answered queue entry and `page.requeueReview` splices a second copy of every
//       missed review into the queue, while `composed` counts DISTINCT items. The comparison moved
//       the WRONG WAY: the more the student missed, the more of the page the row claimed. Measured
//       over 4 shapes × 4 answer policies × 40 corpus saves = 640 completed jobs, 20 rows would have
//       been stamped `partial: false` — "this WAS a whole Page" — while covering 10 distinct items
//       of 18, and one claimed 17 of a page that holds 16.
//       PINNED HERE: the monotone property no restatement of the formula can satisfy — a miss-heavy
//       job never reports MORE coverage than a clean one on the same board — plus the unit itself.
//
//   §3  player-feel (MAJOR) — `COPY.regret` printed `cost 35.` with no unit directly above
//       `COPY.regret2`'s `cost 3.5 credit.`, under one heading. The first is `optimal − actual` out
//       of `econ.playOrder` ("return the final BAGGED"); the second is a credit gap. A reader
//       compares 35 with 3.5. PINNED HERE: every `cost` figure the copy table can print carries a
//       unit — the lint finding 40's repair should have left behind.
//
// The walk-at-the-getaway BLOCKER is pinned in `tests/run-lane-r2.test.mjs` ("THE WALK: a job
// walked at the getaway and finished flat earns exactly what the completed job earns"), beside the
// other arms over the same row.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  startJob, beginTargets, lockCall, applyTarget, push, brief, crack, tick, backcheck, canBackcheck,
  commitBind, swapOptions, stateOf, queueOf, idxOf, targetsLeft, endJob, OUTCOMES, unguard,
} from '../site/js/job/state.js';
import { postBoard } from '../site/js/job/board.js';
import { decisionCount } from '../site/js/job/econ.js';
import { SHAPES, SHAPE_IDS, DECISIONS, COPY } from '../site/data/job.js';
import { fresh } from '../site/js/store.js';
import { applyOutcome, DAY_MS, checkDailyGoal } from '../site/js/schedule.js';
import { logForecast } from '../site/js/readiness.js';
import { rngFrom } from '../site/js/rng.js';
import { todayISO, addDays } from '../site/js/days.js';
import { cards as ALL_CARDS, byId as cardById } from '../site/data/cards.js';
import { isBonus } from '../site/data/source-manifest.js';
import { captureJobBefore, jobSummaryContext, composedCountOf, draftedCountOf, pageSizeExtra } from '../site/js/screens/run.js';
import { read } from './_helpers.mjs';

const NOW = new Date(2026, 8, 16, 18, 0).getTime();
const TODAY = todayISO(new Date(NOW));
const BANK = ALL_CARDS.filter((c) => !isBonus(c.id));
const clone = (x) => structuredClone(x);
const num = (x, d = 0) => (Number.isFinite(+x) ? +x : d);

/** The `job-split.test.mjs` corpus save, verbatim: real Leitner records, real history, no Math.random. */
function seededSave(i) {
  const rng = rngFrom('j8-split-corpus', i);
  const s = fresh(NOW - (4 + rng.int(0, 20)) * DAY_MS);
  s.profileId = `split-${i}`;
  s.settings.testDate = addDays(TODAY, 4 + rng.int(0, 12));
  const n = 30 + rng.int(0, 30);
  for (let k = 0; k < n; k++) {
    const c = BANK[rng.int(0, BANK.length - 1)];
    let rec = null;
    for (let r = 0; r < 3; r++) rec = applyOutcome(s, c.id, rng.chance(0.75) ? 'clean' : 'wrong', { now: NOW - (30 - r * 4) * DAY_MS });
    if (!rec) continue;
    rec.cleared = true; rec.rarity = 'gold';
    rec.due = NOW + (rng.chance(0.65) ? -rng.float(0, 9) : rng.float(0.2, 12)) * DAY_MS;
    rec.history = Array.from({ length: 10 }, (_, h) => ({ at: NOW - (20 - h) * DAY_MS, ok: rng.chance(0.75), attempt: 1, hints: 0, ms: 9000 }));
  }
  const SKILLS = ['VOC', 'NOTE', 'CLASS', 'ASN-PLP', 'ASN-ANG', 'PAIRS', 'FIG-ALG', 'BISECT-L', 'BISECT-Q',
    'SEG-ALG', 'CSARITH', 'CS-LIN', 'CS-RATIO', 'CS-QUAD', 'SYS', 'FAC1', 'FAC2', 'QUAD-SOLVE', 'QUAD-CTX'];
  for (const k of SKILLS) {
    if (!rng.chance(0.8)) continue;
    s.skills[k] = { m: rng.int(10, 95), n: rng.int(1, 9), lastAt: NOW - rng.int(1, 20) * DAY_MS, lastDueCorrectAt: null };
  }
  return s;
}

const CLEAN = Object.freeze({ cleared: true, firstTry: true, hints: 0, attempt: 1, clean: true, elapsedMs: 9000, xp: 40 });
const ATT2 = Object.freeze({ cleared: true, firstTry: false, hints: 0, attempt: 2, elapsedMs: 21000, xp: 25 });
const MISS = Object.freeze({ cleared: false, solutionShown: true, reason: 'third-wrong', attempt: 3, hints: 0, elapsedMs: 40000, xp: 0 });

const POLICIES = {
  clean: () => CLEAN,
  mixed: (n) => (n % 3 === 0 ? ATT2 : CLEAN),
  miss: (n) => (n % 3 === 0 ? MISS : CLEAN),
  missHeavy: () => MISS,
};

/**
 * One job of a given shape, played to its end through the SHIPPED machine, ending in the screen
 * terminal (`jobSummaryContext` → `commitJobRun`) so the row this file is about actually exists.
 * `full` takes every brief option G1 publishes; `swap` adds the fifth.
 */
function playShape(save0, shapeId, { policy = 'clean', full = false, swap = false, spend = false, misses = null } = {}) {
  const save = clone(save0);
  let board = null;
  try { board = postBoard(save, TODAY, { now: NOW, shape: shapeId }); } catch { return null; }
  let t = NOW;
  try { startJob(save, { today: TODAY, now: t, board }); } catch { return null; }
  const before = captureJobBefore(unguard(save), queueOf(save));
  const composedAt = composedCountOf(save.inProgress);
  const draftedAt = draftedCountOf(save.inProgress);
  if (full) {
    save.game.backchecks = { ...save.game.backchecks, held: DECISIONS.backchecksFull };
    commitBind(save, { kind: 'walk', byMin: 600 }, { now: t });
  }
  const answerFor = POLICIES[policy];
  let live = queueOf(save).slice();
  let debrief = null, n = 0, spent = 0;
  const took = [];
  tick(save, 'guard', (t += 18000));
  beginTargets(save, { now: (t += 12000) });
  for (let i = 0; i < 900; i++) {
    const g = stateOf(save);
    if (!g || g.outcome != null) break;
    live = queueOf(save).slice();
    if (g.phase === 'envelope') { lockCall(save, 70, { now: (t += 5000) }); continue; }
    if (g.phase === 'answer') {
      const it = queueOf(save)[idxOf(save)];
      n += 1;
      const r = misses ? (misses.has(n) ? MISS : CLEAN) : answerFor(n);
      applyTarget(save, { ...r, id: it.id }, { now: (t += 40000), cards: cardById });
      continue;
    }
    if (g.phase === 'payout' || g.phase === 'bagpush') {
      if (spend && spent < DECISIONS.backchecksFull && canBackcheck(save)) { backcheck(save); spent += 1; }
      if (targetsLeft(save) === 0) { debrief = endJob(save, OUTCOMES.COMPLETED, { now: (t += 4000), day: TODAY }); break; }
      push(save, { now: (t += 9000) });
      continue;
    }
    if (g.phase === 'brief') {
      let actions = {};
      if (full) {
        actions = {
          repress: { ...g.tokens },
          crew: { make: queueOf(save)[idxOf(save)]?.skill ?? 'VOC', rank: 1 },
          tell: true,
          commit: { kind: 'walk', byMin: 600 },
        };
        if (swap) {
          const opts = swapOptions(save) ?? [];
          const pick = Array.isArray(opts) ? opts[0] : null;
          const id = typeof pick === 'string' ? pick : pick?.id;
          if (id) actions.swap = { id };
        }
      }
      took.push(brief(save, actions, { now: (t += 20000) }).took.length);
      continue;
    }
    if (g.phase === 'getaway') { crack(save, { now: (t += 25000) }); continue; }
    break;
  }
  if (!debrief) return null;
  jobSummaryContext(save, debrief, { queue: live, before });
  const rec = (save.runs ?? []).at(-1) ?? null;
  if (!rec || rec.status !== 'done') return null;
  return { save, debrief, rec, took, spent, composedAt, draftedAt, queue: live };
}

const RUN_SRC = read('site/js/screens/run.js');

/* ================================================================================================
   §1 — the decision line: two numerals, one basis
   ================================================================================================ */

describe('run v2 §1 — the debrief’s decision ceiling is on the counter’s own basis', () => {
  test('the DEFAULT path lands exactly on `decisionCount(shape).mandatory`, per shape', () => {
    let checked = 0;
    for (const id of SHAPE_IDS) {
      const pub = decisionCount(id);
      for (let i = 0; i < 6; i++) {
        const r = playShape(seededSave(i), id);
        if (!r) continue;
        /* only a job the board could deal at the shape's own size is a statement about the column */
        if (r.debrief.calls.length !== SHAPES[id].targets) continue;
        assert.equal(r.debrief.decisions, pub.mandatory,
          `${id}/save ${i}: the default path measured ${r.debrief.decisions} against a published ${pub.mandatory}`);
        checked += 1;
      }
    }
    assert.ok(checked >= 12, `only ${checked} jobs reached their shape's own target count`);
  });

  test('FULL USE of every brief option is worth exactly ONE more decision — the COMMIT — and that is the ceiling the debrief prints', () => {
    let checked = 0;
    for (const id of SHAPE_IDS) {
      const pub = decisionCount(id);
      const ownFull = pub.mandatory + DECISIONS.commitFull;
      for (let i = 0; i < 6; i++) {
        const r = playShape(seededSave(i), id, { full: true });
        if (!r) continue;
        if (r.debrief.calls.length !== SHAPES[id].targets) continue;
        assert.ok(r.took.length > 0 && Math.max(...r.took) >= 4,
          `${id}/save ${i}: the full-use arm took ${r.took} options — it is not exercising the windows`);
        assert.equal(r.debrief.decisions, ownFull,
          `${id}/save ${i}: full use measured ${r.debrief.decisions} against this counter's own ${ownFull}`);
        /* …and the published full column is NOT reachable on this counter, which is the finding */
        assert.ok(r.debrief.decisions < pub.full,
          `${id}: the counter reached G1's option-counted ${pub.full}, so the two bases have merged `
          + 'and this whole section can be deleted');
        checked += 1;
      }
    }
    assert.ok(checked >= 12, `only ${checked} full-use jobs reached their shape's own target count`);
  });

  test('G1’s own full column is a different quantity, and the gap is exactly the brief windows', () => {
    for (const id of SHAPE_IDS) {
      const pub = decisionCount(id);
      const windows = Math.min(SHAPES[id].briefs, [4, 8].filter((k) => k < SHAPES[id].targets).length);
      assert.equal(pub.full - (pub.mandatory + DECISIONS.commitFull),
        (DECISIONS.briefOptionsMax - 1) * windows + DECISIONS.backchecksFull,
        `${id}: the two columns differ by something other than the window options and the Backchecks`);
    }
  });

  test('the screen prints BOTH bases and names each — the two numerals may never sit on one line unlabelled', () => {
    const sub = RUN_SRC.slice(RUN_SRC.indexOf("fact('Decisions'"), RUN_SRC.indexOf("fact('Posted'"));
    assert.ok(sub.length > 0, 'the Decisions fact is gone from the debrief');
    assert.match(sub, /\$\{published\.mandatory\} mandatory \/ \$\{fullHere\} full use/,
      'the debrief no longer prints its own counter’s column');
    assert.match(sub, /counting a brief window once/,
      'the counter’s column is printed without saying what a brief window costs on it');
    assert.match(sub, /G1[’']s \$\{published\.full\}/,
      'G1’s own column is no longer printed beside it');
    assert.match(sub, /\$\{JOB_DECISIONS\.briefOptionsMax\} options/,
      'G1’s column is printed without naming the basis that produces it');
    /* the regression this replaces: the published full column alone, with nothing to read it by */
    assert.equal(/\$\{published\.full\} full use/.test(sub), false,
      'the debrief is printing G1’s option-counted ceiling as if it were the counter’s own');
  });
});

/* ================================================================================================
   §2 — `partial` is a comparison in ONE unit
   ================================================================================================ */

describe('run v2 §2 — the row reports coverage in the unit the page is measured in', () => {
  test('`drafted` is DISTINCT items, never answers: a miss adds an answer and no coverage', () => {
    let withRequeues = 0;
    for (const id of SHAPE_IDS) {
      for (let i = 0; i < 10; i++) {
        const r = playShape(seededSave(i), id, { policy: 'missHeavy' });
        if (!r) continue;
        const distinct = new Set(r.rec.items.map((it) => it.id)).size;
        assert.equal(r.rec.drafted, distinct,
          `${id}/save ${i}: the row reports ${r.rec.drafted} of coverage over ${distinct} distinct items`);
        assert.ok(r.rec.drafted <= r.rec.composed,
          `${id}/save ${i}: the row claims ${r.rec.drafted} of a page that holds ${r.rec.composed}`);
        if (r.rec.items.length > r.rec.drafted) withRequeues += 1;
      }
    }
    assert.ok(withRequeues >= 8,
      `only ${withRequeues} jobs re-answered anything, so the two units cannot be told apart by this corpus`);
  });

  test('THE CORPUS PROPERTY: a miss-heavy job never reports more of the page than a clean one on the SAME board', () => {
    let pairs = 0, worse = 0, strictlyFewerAnswers = 0;
    for (const id of SHAPE_IDS) {
      for (let i = 0; i < 10; i++) {
        const c = playShape(seededSave(i), id, { policy: 'clean' });
        const m = playShape(seededSave(i), id, { policy: 'missHeavy' });
        if (!c || !m) continue;
        pairs += 1;
        if (m.rec.drafted > c.rec.drafted) worse += 1;
        if (m.rec.items.length > c.rec.items.length) strictlyFewerAnswers += 1;
      }
    }
    assert.ok(pairs >= 20, `only ${pairs} same-board pairs were played`);
    assert.ok(strictlyFewerAnswers >= 8,
      'no pair differed in ANSWER count, so this property cannot distinguish the two units');
    assert.equal(worse, 0,
      `${worse} of ${pairs} boards report MORE coverage for the arm that missed more — which is the `
      + 'defect: `drafted` counted answers and `composed` counts items');
  });

  test('`partial: false` means the draft IS the page — never "the student re-answered enough"', () => {
    for (const id of SHAPE_IDS) {
      for (const policy of Object.keys(POLICIES)) {
        for (let i = 0; i < 6; i++) {
          const r = playShape(seededSave(i), id, { policy });
          if (!r) continue;
          if (r.rec.partial === false) {
            assert.equal(r.rec.drafted, r.rec.composed,
              `${id}/${policy}/save ${i}: a row says it is a WHOLE Page while covering `
              + `${r.rec.drafted} of ${r.rec.composed}`);
          }
        }
      }
    }
  });

  test('`pageSizeExtra` is null for a page the board never drafted — the study route is untouched', () => {
    assert.equal(pageSizeExtra(null, [{ id: 'a' }, { id: 'b' }]), null);
    assert.equal(pageSizeExtra({ composed: 0 }, [{ id: 'a' }]), null);
    assert.deepEqual(pageSizeExtra({ composed: 5 }, [{ id: 'a' }, { id: 'b' }]),
      { drafted: 2, composed: 5, partial: true });
    /* a requeued copy adds an answer and no coverage — `page.js requeueReview` is the only writer
       of `requeued`, and `composePage` composes none */
    assert.deepEqual(pageSizeExtra({ composed: 2 }, [{ id: 'a' }, { id: 'b' }, { id: 'a', requeued: 1 }]),
      { drafted: 2, composed: 2, partial: false });
    assert.equal(draftedCountOf({ queue: [{ id: 'a' }, { id: 'a', requeued: 1 }, { id: 'b' }] }), 2);
  });
});

/* ================================================================================================
   §3 — every printed `cost` carries its unit
   ================================================================================================ */

describe('run v2 §3 — no line in the copy table prints a bare `cost`', () => {
  /** the units this product denominates a cost in, and nothing else */
  const UNITS = new Set(['bagged', 'credit', 'loose', 'rating', 'points', 'posted']);

  /** a stub that answers a realistic NUMBER for every field, so a `cost` renders as a numeral */
  const stub = new Proxy({}, {
    get: (_t, k) => {
      if (typeof k !== 'string') return undefined;
      if (k === 'cost') return 31;
      if (k === 'did') return 'bagged';
      if (k === 'said') return 'push';
      return 7;
    },
  });

  test('every `cost` figure the table can print is followed by a unit word', () => {
    const offenders = [];
    let seen = 0;
    for (const [key, fn] of Object.entries(COPY)) {
      if (typeof fn !== 'function') continue;
      let line = '';
      try { line = String(fn(stub)); } catch { continue; }
      for (const m of line.matchAll(/\bcost\s+(-?[\d.]+)\s*([A-Za-z]+)?/g)) {
        seen += 1;
        const unit = (m[2] ?? '').toLowerCase();
        if (!UNITS.has(unit)) offenders.push(`COPY.${key}: "${m[0].trim()}" in — ${line}`);
      }
    }
    assert.ok(seen >= 2, `only ${seen} cost figures were rendered — the lint is not reaching the copy`);
    assert.deepEqual(offenders, [],
      'a copy line prints a cost with no unit. Two costs on one debrief block in two different '
      + 'units, one of them unlabelled, is verify-round-2 finding "cost 35. / cost 3.5 credit." — '
      + 'the units are BAGGED points and rating credit and they are not comparable.');
  });

  test('the two regret lines name DIFFERENT units, because they are different quantities', () => {
    const a = COPY.regret({ did: 'bagged', chain: 4, said: 'push', qStar: '0.49', qHat: '0.62', cost: 31 });
    const b = COPY.regret2({ envelope: 6, called: 85, evMax: 70, cost: '0.3' });
    assert.match(a, /cost 31 bagged\.$/, '`COPY.regret` prices the BAG/PUSH line in `playOrder`’s own unit');
    assert.match(b, /cost 0\.3 credit\.$/, '`COPY.regret2` prices the CALL line in credit');
    const unitOf = (s) => s.match(/\bcost\s+-?[\d.]+\s+([A-Za-z]+)/)?.[1];
    assert.notEqual(unitOf(a), unitOf(b),
      'the two lines of one debrief block print the same unit word for two different economies');
  });
});
