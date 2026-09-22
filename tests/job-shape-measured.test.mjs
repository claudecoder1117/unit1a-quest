// tests/job-shape-measured.test.mjs — the econ lane, round 3.
//
// AUTHORITY: COMPOSED-GAME.md G1 ("What the board actually posts"), G3.1 (the carry-EV table's
// condition), G3.2 (which way the escalation runs). BUILD-POLICY.md overrides both.
//
// WHY THIS FILE EXISTS. `PUBLISHED.shapeTable` is derived from `SHAPES[id].tierMix`, and `tierMix`
// is a design-time BUDGET: `composeBundles` serves `budget.targets` locks of whatever `composePage`
// had due, at whatever tiers those happen to be. The budget row was published as if it described the
// session — "JOB · 12:20 → 14:22 · 43.2 % → 51.3 %" — and it brackets **one** of the 45 JOB boards
// the corpus posts on wall clock and **none** of them on split. The suite could not see that,
// because `job-split.test.mjs`'s walkthrough rewrites each drafted target's tier to the shape's own
// `tierMix` before it measures (`canon`), which makes the walk reproduce the table by construction.
//
// So this file MEASURES. It rebuilds the 50-save corpus `job-board.test.mjs` builds, posts each
// board, costs the REAL drafted queue through the same three constant tables the shape table uses,
// and compares the distribution against `PUBLISHED.shapeTableDrafted`. `PUBLISHED` is still never an
// input to a computation — it is only ever the thing compared against.
//
// The last two sections guard the other two round-3 findings, both of which were documents claiming
// more than the code does: G3.1's argmax column published without its `S ≥ L·m·P` condition, and
// G3.2's "and the app says so" about a Settings sentence that scopes nothing.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { read } from './_helpers.mjs';

import { postBoard } from '../site/js/job/board.js';
import { shapeTable, breakevenQ, shallowQStar, r3 } from '../site/js/job/econ.js';
import { fresh } from '../site/js/store.js';
import { applyOutcome, recordRematch, DAY_MS, HOUR_MS } from '../site/js/schedule.js';
import { rngFrom } from '../site/js/rng.js';
import { addDays, todayISO } from '../site/js/days.js';
import { cards as ALL_CARDS } from '../site/data/cards.js';
import { isBonus } from '../site/data/source-manifest.js';
import {
  PUBLISHED as P, SHAPES, BOARD, FIXED_PHASES, ANSWER_MINUTES_PER_TIER, DECISION_SECONDS,
} from '../site/data/job.js';

/* ------------------------------------------------------------------ the corpus, rebuilt */

/* Deliberately a second copy of `job-board.test.mjs`'s builder rather than an import: importing one
   export out of a `.test.mjs` file drags its whole suite into this one (tests/_helpers.mjs, head). */
const NOW = new Date(2026, 8, 16, 19, 30).getTime();
const TODAY = todayISO(new Date(NOW));
const BANK = ALL_CARDS.filter((c) => !isBonus(c.id));
const SKILLS = ['VOC', 'NOTE', 'CLASS', 'ASN-PLP', 'ASN-ANG', 'PAIRS', 'FIG-ALG', 'BISECT-L', 'BISECT-Q',
  'SEG-ALG', 'CSARITH', 'CS-LIN', 'CS-RATIO', 'CS-QUAD', 'SYS', 'FAC1', 'FAC2', 'QUAD-SOLVE', 'QUAD-CTX'];

function seededSave(i) {
  const rng = rngFrom('job-board-corpus', i);
  const s = fresh(NOW - (2 + rng.int(0, 30)) * DAY_MS);
  s.profileId = `corpus-${i}`;
  s.settings.testDate = rng.chance(0.15) ? null : addDays('2026-09-16', 1 + rng.int(0, 20));
  const n = rng.int(0, 40);
  for (let k = 0; k < n; k++) {
    const c = BANK[rng.int(0, BANK.length - 1)];
    const reps = 1 + rng.int(0, 4);
    let rec = null;
    for (let r = 0; r < reps; r++) rec = applyOutcome(s, c.id, rng.chance(0.75) ? 'clean' : 'wrong', { now: NOW - (30 - r * 4) * DAY_MS });
    if (!rec) continue;
    rec.cleared = rng.chance(0.8); rec.attempts = 1; rec.rarity = rec.cleared ? 'gold' : null;
    rec.due = NOW + (rng.chance(0.6) ? -rng.float(0, 9) : rng.float(0.2, 12)) * DAY_MS;
  }
  for (const k of SKILLS) {
    if (!rng.chance(0.7)) continue;
    s.skills[k] = { m: rng.int(0, 100), n: rng.int(1, 9), lastAt: NOW - rng.int(1, 20) * DAY_MS, lastDueCorrectAt: rng.chance(0.4) ? NOW - DAY_MS : null };
  }
  if (rng.chance(0.5)) recordRematch(s, { item: BANK[rng.int(0, BANK.length - 1)].id, got: '7', now: NOW - HOUR_MS });
  return s;
}

const r1 = (x) => Math.round(x * 10) / 10;

/**
 * Cost ONE posted board the way `PUBLISHED.shapeTable` costs a shape — same three constant tables —
 * but applied to the queue the composer actually drafted instead of to `SHAPES[id].tierMix`.
 */
function costOf(board) {
  const queue = board.recommend.queue;
  const shape = SHAPES[board.shape];
  let answerS = 0;
  let decisionS = 0;
  for (const it of queue) {
    answerS += (ANSWER_MINUTES_PER_TIER[it.tier] ?? ANSWER_MINUTES_PER_TIER[2]) * 60;
    decisionS += DECISION_SECONDS[it.tier] ?? DECISION_SECONDS[2];
  }
  /* only the brief windows that can land in a draft this long — `econ.landedBriefs`' own clamp */
  const landed = Math.min(shape.briefs ?? 0, BOARD.briefAfterTargets.filter((n) => n < queue.length).length);
  /* no `crew` term — the column's sixth cell was a between-jobs phase the machine cannot enter, and
     a double charge besides (the crew re-rank is one of the brief window's five published options).
     Verify round 2, split-honesty; see `FIXED_PHASES` in data/job.js. */
  const fixed = (p) => p.board + p.guard + p.brief * landed + p.getaway + p.debrief;
  const out = { shape: board.shape, targets: queue.length, answerS, decisionS, boardSplit: board.split, tiers: {} };
  for (const it of queue) out.tiers[it.tier] = (out.tiers[it.tier] ?? 0) + 1;
  for (const path of ['default', 'full']) {
    const cell = FIXED_PHASES[shape.fixed][path].phases;
    const gameS = fixed(cell) + decisionS;
    const wallS = answerS + gameS;
    out[path] = {
      wallS,
      split: r1((100 * gameS) / wallS),
      /* the basis the board and the debrief headline use: the debrief read in NEITHER term */
      headline: r1((100 * (gameS - cell.debrief)) / (wallS - cell.debrief)),
    };
  }
  return out;
}

const CORPUS = [];
for (let i = 0; i < 50; i++) {
  let b = null;
  try { b = postBoard(seededSave(i), TODAY, { now: NOW }); } catch { b = null; }
  if (b?.recommend) CORPUS.push(costOf(b));
}
const BY_SHAPE = {};
for (const r of CORPUS) (BY_SHAPE[r.shape] ??= []).push(r);

const median = (a) => a[Math.floor(a.length / 2)];
const bandOf = (rows, f) => { const a = rows.map(f).sort((x, y) => x - y); return [a[0], median(a), a[a.length - 1]]; };

/** `published` is `[min, median, max]`: it must bracket the measurement and name its middle. */
function assertBand(published, measured, what) {
  assert.equal(published.length, 3, `${what}: published band is [min, median, max]`);
  assert.ok(published[0] <= measured[1] && measured[1] <= published[2],
    `${what}: the published band [${published}] does not bracket the product's median ${measured[1]} — re-measure the row, do not widen it`);
  const tol = (x) => Math.max(1, 0.05 * Math.abs(x));
  assert.ok(Math.abs(published[1] - measured[1]) <= tol(measured[1]),
    `${what}: published median ${published[1]} is not the measured median ${measured[1]}`);
  assert.ok(Math.abs(published[0] - measured[0]) <= 2 * tol(measured[0]),
    `${what}: published min ${published[0]} against measured ${measured[0]}`);
  assert.ok(Math.abs(published[2] - measured[2]) <= 2 * tol(measured[2]),
    `${what}: published max ${published[2]} against measured ${measured[2]}`);
}

/* =========================================================================================
   1. The measured shape table — what a JOB and a VAULT actually cost
   ========================================================================================= */

describe('G1 · the board’s real drafts, measured (round 3)', () => {
  test('the corpus posts boards at all, and only shapes the measured table publishes', () => {
    assert.ok(CORPUS.length >= 40, `expected ≥ 40 recommendable boards, got ${CORPUS.length}`);
    for (const id of Object.keys(BY_SHAPE)) {
      assert.ok(P.shapeTableDrafted[id], `shape ${id} is posted but has no measured row in PUBLISHED`);
    }
    for (const id of Object.keys(P.shapeTableDrafted)) {
      assert.ok(BY_SHAPE[id]?.length, `PUBLISHED publishes a measured ${id} row that the corpus never posts`);
    }
  });

  for (const id of ['JOB', 'VAULT']) {
    test(`${id}: every published measured field brackets the product's own median`, () => {
      const rows = BY_SHAPE[id];
      const pub = P.shapeTableDrafted[id];
      assert.ok(Math.abs(pub.n - rows.length) <= 2, `${id}: published n ${pub.n} against measured ${rows.length}`);
      assertBand(pub.targets, bandOf(rows, (r) => r.targets), `${id}.targets`);
      assertBand(pub.answerS, bandOf(rows, (r) => r.answerS), `${id}.answerS`);
      assertBand(pub.decisionS, bandOf(rows, (r) => r.decisionS), `${id}.decisionS`);
      for (const path of ['default', 'full']) {
        assertBand(pub.wallS[path], bandOf(rows, (r) => r[path].wallS), `${id}.wallS.${path}`);
        assertBand(pub.split[path], bandOf(rows, (r) => r[path].split), `${id}.split.${path}`);
        assertBand(pub.headline[path], bandOf(rows, (r) => r[path].headline), `${id}.headline.${path}`);
      }
    });
  }

  test('the headline band IS the percentage the board prints, row by row', () => {
    /* `board.js projectFor` puts the debrief read in neither term of the split and rounds to 0 dp.
       On job 1 — every corpus save — the rates are 1 and the means are the shipped defaults, so the
       recomputation above must reproduce the printed number exactly, not approximately. */
    for (const r of CORPUS) {
      assert.equal(Math.round(r.default.headline), r.boardSplit,
        `${r.shape}: recomputed headline ${r.default.headline} vs the board's printed ${r.boardSplit}`);
    }
  });

  test('the BUDGET row does not describe the session, and the document says so', () => {
    /* The finding, pinned in the direction it was found. If a later supply change makes the drafts
       match the budget, THIS test fails — and G1's "What the board actually posts" section, which
       states the divergence, has to be rewritten rather than left standing. */
    const rows = BY_SHAPE.JOB;
    const nominal = P.shapeTable.JOB;
    const wall = bandOf(rows, (r) => r.default.wallS);
    const split = bandOf(rows, (r) => r.default.split);
    assert.ok(nominal.wallS[1] < wall[1],
      `the budget row now reaches the drafted median (${nominal.wallS[1]} s vs ${wall[1]} s) — update G1, do not delete this test`);
    assert.ok(nominal.split[0] > split[1],
      `the budget split ${nominal.split[0]} % no longer overstates the drafted median ${split[1]} % — update G1`);
    const inWall = rows.filter((r) => r.default.wallS >= nominal.wallS[0] && r.default.wallS <= nominal.wallS[1]).length;
    const inSplit = rows.filter((r) => r.default.split >= nominal.split[0] && r.default.split <= nominal.split[1]).length;
    assert.ok(inWall <= 3, `the budget wall-clock range brackets ${inWall} of ${rows.length} boards`);
    assert.equal(inSplit, 0, `the budget split range brackets ${inSplit} of ${rows.length} boards`);
  });

  test('COMPOSED S1’s 25-minute ceiling: the median is inside it and the tail is counted, not rounded away', () => {
    const [lo, hi] = P.sessionBandS;
    assert.deepEqual([lo, hi], [600, 1500], 'S1 is a 10–25 minute session');
    for (const id of ['JOB', 'VAULT']) {
      const rows = BY_SHAPE[id];
      const med = bandOf(rows, (r) => r.default.wallS)[1];
      assert.ok(med >= lo && med <= hi, `${id}: the median board is ${med} s, outside [${lo}, ${hi}]`);
      const over = rows.filter((r) => r.default.wallS > hi).length;
      assert.equal(over, P.shapeTableDrafted[id].overSessionCeiling,
        `${id}: ${over} board(s) run past the ceiling; PUBLISHED says ${P.shapeTableDrafted[id].overSessionCeiling}`);
    }
  });

  test('the drafted tier mix is not the shape’s tierMix — which is the whole mechanism', () => {
    const rows = BY_SHAPE.JOB;
    const mean = (t) => rows.reduce((a, r) => a + (r.tiers[t] ?? 0), 0) / rows.length;
    assert.ok(mean(2) > mean(1), `a drafted JOB is T2-heavy: T1 ${mean(1).toFixed(2)} vs T2 ${mean(2).toFixed(2)}`);
    assert.ok(SHAPES.JOB.tierMix[1] > SHAPES.JOB.tierMix[2], 'the budget mix is T1-heavy');
    /* and the cost follows from exactly that: the answer column is the gap */
    assert.ok(bandOf(rows, (r) => r.answerS)[1] > shapeTable('JOB').answerS * 1.4,
      'the drafted answer seconds are far above the budget row’s');
  });

  test('nominalHeadlineSplit is recomputed from the fixed phases, not transcribed', () => {
    for (const id of ['RUN', 'JOB', 'JOB12', 'VAULT']) {
      const t = shapeTable(id);
      const fx = FIXED_PHASES[SHAPES[id].fixed];
      const want = ['default', 'full'].map((path, i) => {
        const db = (fx[path].phases ?? fx.default.phases).debrief;
        return r1((100 * (t.gameS[path] - db)) / (t.wallS[path] - db));
      });
      assert.deepEqual(P.nominalHeadlineSplit[id], want, `${id}: headline-basis split`);
      /* and it is strictly BELOW the table's own column — the basis gap the document publishes */
      assert.ok(want[0] < t.split.default && want[1] < t.split.full, `${id}: the headline basis is the lower one`);
    }
  });
});

/* =========================================================================================
   2. G3.1's argmax table is published with its condition (round-3 exploit-hunt)
   ========================================================================================= */

describe('G3.1 · the carry-EV table is published with the condition it needs', () => {
  const DOC = read('COMPOSED-GAME.md');
  const evTable = DOC.slice(DOC.indexOf('**Carry EV**'), DOC.indexOf('**Rating credit**'));

  test('the section that prints the argmax column names the deep-pile condition', () => {
    assert.ok(evTable.length > 200, 'found the Carry EV section');
    assert.ok(/S\s*≥\s*L·m·P/.test(evTable),
      'G3.1 prints an argmax column without naming `S ≥ L·m·P` — the condition may not live only in a data comment');
    assert.ok(/deep[- ]pile argmax/i.test(evTable), 'the argmax column is labelled as the deep-pile one');
  });

  test('it also names the state that breaks it, and where that state is reached', () => {
    assert.ok(/S\s*=\s*0/.test(evTable), 'the `S = 0` case is named');
    assert.ok(/weakly dominant/i.test(evTable), 'the dominance at `S = 0` is stated');
    assert.ok(/after every BAG/i.test(evTable) && /target 1 of every job/i.test(evTable),
      'the document must say WHERE the state is reached — it is the opening beat, not a corner case');
  });
});

/* =========================================================================================
   3. G3.2 no longer claims the app scopes the escalation direction (round-3 econ-math)
   ========================================================================================= */

describe('G3.2 · the escalation direction is not attributed to the app', () => {
  const DOC = read('COMPOSED-GAME.md');
  const SETTINGS = read('site/js/screens/settings.js');

  test('"and the app says so" is gone, because the app does not', () => {
    assert.equal(DOC.includes('and the app says so'), false,
      'COMPOSED-GAME.md claims the app scopes the threshold’s direction; site/js/screens/settings.js states it flat');
  });

  test('G3.2 describes the app’s copy correctly — the pairing, asserted in BOTH directions', () => {
    /* THE INVARIANT IS THE PAIRING, not the copy. G3.2 makes a claim ABOUT `screens/settings.js`, so
       the claim and the copy have to move together; `scoped` is MEASURED off the shipped file, never
       assumed. Round 3 wrote this one-directionally (`scoped === false`), which pinned the defect's
       presence: it would have failed the moment the screen lane applied this lane's own Request to
       scope the sentence — a red suite for someone else's correct fix, and an assertion no repair
       could satisfy. Both directions are asserted here instead, and exactly one arm fires, so a
       mismatch between the document and the copy still fails whichever side moves.
       (Round 4, repair-econ: the pairing is kept, the one-way pin is not.) */
    const hits = SETTINGS.match(/chain deepens[\s\S]{0,160}?threshold falls/g) ?? [];
    assert.ok(hits.length <= 1,
      `expected at most one statement of the direction in Settings, found ${hits.length} — G3.2 says there is exactly one place`);
    const claimsUnscoped = /does not scope|scopes nothing|with no scope/i.test(DOC);

    if (hits.length === 0) {
      assert.equal(claimsUnscoped, false,
        'Settings no longer states the direction at all, so G3.2 may not describe what that sentence says — rewrite the paragraph');
      return;
    }
    /* Read the scope off the SENTENCE the claim lives in, not off the matched fragment: a scope
       would most naturally be written in front of "as the chain deepens" (*"At a fixed pile, as the
       chain deepens…"*), which the fragment cannot see — the round-3 form would have called that
       copy unscoped. A ±character window is the other trap: two lines above this copy sits
       `shallowQStar(...)`, an identifier, so `/shallow/` over a window reads a scope that no student
       can see. Hence the sentence bounds, and `shallow` only when it is a word. */
    const idx = SETTINGS.indexOf('chain deepens');
    const from = SETTINGS.lastIndexOf('. ', idx) + 1;
    const stop = SETTINGS.indexOf('. ', idx);
    const sentence = SETTINGS.slice(from, stop < 0 ? SETTINGS.length : stop + 1);
    assert.ok(sentence.includes('threshold falls'),
      'the sentence bounds lost the claim itself — fix the slice before trusting either arm below');
    const scoped = /\bshallow(?![A-Za-z])|S\s*<|fixed pile|pile can pay|deep pile|once the pile/i.test(sentence);
    if (scoped) {
      assert.equal(claimsUnscoped, false,
        `the Settings sentence is now scoped — good; COMPOSED-GAME G3.2 still says it is not: ${JSON.stringify(hits[0].slice(0, 90))}`);
    } else {
      assert.ok(claimsUnscoped,
        'G3.2 must record that the app’s only statement of the direction is unscoped — it may not lean on a scope the copy does not carry');
    }
    /* and in NEITHER state may the document hand the scoping back to the app */
    assert.equal(DOC.includes('and the app says so'), false,
      'the attribution is back in COMPOSED-GAME.md — the app states the direction, it does not scope it');
  });
});

/* =========================================================================================
   4. G3.2's q* numerals are the shipped function's own answers (round 4, econ-math MINORs)

   The two MINORs in this lane are both *"a numeral published without the parameters that produce
   it"*: the shallow pair `0.900 → 0.143` (no `S`, no `L` — the c = 8 end runs 0.042 … 0.683 over
   realistic states) and the printed-`q*` table, whose last call-95 cell is the SHALLOW root while the
   caption states the deep one. The arithmetic is pinned in `job-econ.test.mjs` §5 against
   `PUBLISHED.printedQ` / `PUBLISHED.shallowQWalk`; what is pinned HERE is the other half — that the
   numerals the AUTHORITY prints are those same shipped answers, parsed out of the document rather
   than retyped, so the table cannot drift from the function it claims to tabulate.
   ========================================================================================= */

describe('G3.2 · the published q* numerals are the shipped ones, cell by cell', () => {
  const DOC = read('COMPOSED-GAME.md');

  test('every cell of the printed-q* table in G3.2 is `breakevenQ` at the parameters the table states', () => {
    const { S, L, chains, rows } = P.printedQ;
    for (const call of [70, 85, 95]) {
      const row = new RegExp(`\\|\\s*printed \`q\\\\?\\*\`, call ${call}\\s*\\|([^\\n]+)\\|`).exec(DOC);
      assert.ok(row, `G3.2 no longer prints a "printed q*, call ${call}" row — re-derive it from PUBLISHED.printedQ`);
      const cells = row[1].split('|').map((s) => s.trim()).filter((s) => s.length).map(Number);
      assert.equal(cells.length, chains.length,
        `call ${call}: the document prints ${cells.length} chain columns, PUBLISHED.printedQ has ${chains.length}`);
      cells.forEach((cell, i) => {
        const where = `call ${call}, c = ${chains[i]}`;
        assert.equal(cell, rows[call][i], `${where}: the document and PUBLISHED.printedQ disagree`);
        assert.equal(r3(breakevenQ({ loose: S, chain: chains[i], L, call })), cell,
          `${where}: the published numeral is not what breakevenQ returns at S = ${S}, L = ${L}, ρ̄ = 1`);
      });
    }
  });

  test('the 0.900 → 0.143 pair is `shallowQStar` at PUBLISHED.shallowQWalk’s own S and L', () => {
    const w = P.shallowQWalk;
    const printed = /0\.900 → 0\.143([^\n]{0,120})/.exec(DOC);
    assert.ok(printed, 'G3.2 no longer prints the 0.900 → 0.143 pair — re-derive it from PUBLISHED.shallowQWalk');
    assert.equal(r3(shallowQStar({ loose: w.S, chain: w.chains[0], L: w.L, call: w.call })), 0.900);
    assert.equal(r3(shallowQStar({ loose: w.S, chain: w.chains.at(-1), L: w.L, call: w.call })), 0.143);

    /* The parameters themselves are Spec correction 1 in notes/repair-econ.md: the document owner
       adds `at S = 12, L = 18, call 95`, and this lane may not edit COMPOSED-GAME.md. So the
       assertion is written CONDITIONALLY rather than as a lint that would leave the suite red on
       text nobody has written yet: the moment G3.2 names an S and an L beside the pair, they have to
       be a pair that actually produces 0.143. Today the arm does not fire — and `printed[1]` is
       asserted non-null above, so the test still fails if the pair itself disappears. */
    const sAt = /S\s*=\s*(\d+(?:\.\d+)?)/.exec(printed[1]);
    const lAt = /L\s*=\s*(\d+(?:\.\d+)?)/.exec(printed[1]);
    if (sAt && lAt) {
      assert.equal(r3(shallowQStar({ loose: Number(sAt[1]), chain: 8, L: Number(lAt[1]), call: w.call })), 0.143,
        `G3.2 now names S = ${sAt[1]}, L = ${lAt[1]} beside 0.900 → 0.143, and that pair does not produce 0.143`);
    }
  });
});
