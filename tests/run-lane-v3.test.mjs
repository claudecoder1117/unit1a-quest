// tests/run-lane-v3.test.mjs — repair:run, VERIFY ROUND 3 (notes/repair-run.md).
//
// Three findings, three sections. Each asserts the property that was missing, across the two
// surfaces that disagreed, rather than the constant that happened to be printed.
//
//   §1  call-propriety (MAJOR) — "EV-max" NAMED TWO DIFFERENT RUNGS ON TWO SCREENS. `settings.js`
//       prints `call.evMaxBands()` under *"The EV-max rung, by true clear rate"* — the CARRY
//       argmax — and promises *"the debrief prints what the EV-max call would have been"*. Round 3
//       moved the debrief onto the RATING ladder (`honestCall`), correctly: the rung a sentence
//       names has to be the maximiser of the currency it prices, and `COPY.regret2` prices credit.
//       The word did not move with it, so the contradiction moved from inside the line to BETWEEN
//       the two screens: at a reachable q̂ = 8/9 Settings' table says 95 and the debrief said
//       "EV-max was 85. cost 0.1 credit" — the student who followed the table was charged for it,
//       by name, in the two bands G3.1 calls "the only place in the game where the player must
//       choose what they are playing for".
//       PINNED HERE: over a 2 001-point grid of q̂ × a played job at EVERY rung (four fixtures —
//       one column of the ladder cannot see band 0 at all), wherever the printed sentence uses the
//       word it names EXACTLY the rung Settings publishes under it; inside both disagreement bands
//       it names both rungs in Settings' own words and does not use the word; and the pre-fix
//       sentence is rebuilt and shown to fail that rule, so the rule cannot pass vacuously.
//
//   §2  spec-fidelity (MAJOR) — G8's J8 acceptance row publishes two debrief outputs the shipped
//       debrief does not produce: an un-based "24 mandatory / 35 full", which is the verify-round-2
//       split-honesty BLOCKER that R-3 closed everywhere else, and a `0 ms` idle that run r1
//       deleted as a tautology (`wall = tGame + tAnswer`, so the printed quantity was `x − x`).
//       PINNED HERE: the four numerals the corrected row must quote, measured out of the shipped
//       tables, and the two branches the idle line can actually print.
//
//   §3  player-feel (BLOCKER) — `Another board` WAS A DEAD BUTTON. The debrief renders
//       `h('a.btn', { href: '#/run/job' }, 'Another board')` and the debrief IS `#/run/job`; the
//       whole router was `window.addEventListener('hashchange', route)`, and an anchor whose href
//       resolves to the current URL fires no `hashchange`. Measured before the fix, chromium, on
//       the shipped fixture: press it and `phase` is still `debrief`, `.job-contracts` absent,
//       `.job-primary` absent — while a reload of the identical URL posts a board. The same shape
//       is `Another page` and `againLabel(kind)` on the FLAT path.
//       PINNED HERE: the router's own activation handler, structurally, plus the measured press in
//       a real browser through `tests/_run-again.mjs` (which skips when none is installed).
//
// Pure: `js/job/*`, `screens/run.js` and `app.js` source only — no `Math.random`, no browser in
// this file itself.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { read, repoPath, stripCommentsAndStrings as strip } from './_helpers.mjs';
import * as run from '../site/js/screens/run.js';
import * as call from '../site/js/job/call.js';
import * as state from '../site/js/job/state.js';
import * as econ from '../site/js/job/econ.js';
import { fresh } from '../site/js/store.js';
import { applyOutcome, DAY_MS } from '../site/js/schedule.js';
import { todayISO, addDays } from '../site/js/days.js';
import { rngFrom } from '../site/js/rng.js';
import { cards as ALL_CARDS, byId as cardById } from '../site/data/cards.js';
import { isBonus } from '../site/data/source-manifest.js';
import { SKILL_IDS } from '../site/data/skills.js';
import { COPY, DECISIONS } from '../site/data/job.js';

const RUN_SRC = read('site/js/screens/run.js');
const RUN_CODE = strip(RUN_SRC);
const APP_SRC = read('site/js/app.js');
const APP_CODE = strip(APP_SRC);
const SETTINGS_SRC = read('site/js/screens/settings.js');

const NOW = new Date(2026, 8, 16, 18, 0).getTime();
const TODAY = todayISO(new Date(NOW));
const BANK = ALL_CARDS.filter((c) => !isBonus(c.id));

/** A save with real Leitner records and real skills, and a backlog far larger than one job. */
function seededSave(tag = 'v3', { cards = 60 } = {}) {
  const rng = rngFrom('run-v3', tag);
  const s = fresh(NOW - 9 * DAY_MS);
  s.profileId = `run-v3-${tag}`;
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
  return { debrief, queue, save };
}

/* ================================================================================================
   §1 — ONE WORD, ONE RUNG: what the debrief calls EV-max is what Settings calls EV-max
   ================================================================================================ */

describe('run v3 §1 — the debrief and Settings can no longer name two rungs with one word', () => {
  /* One played job per rung, because the call the line is about is the one the JOB locked — a
     single fixture can only ever exercise one column of the ladder, and band 0 (money 70, rank 85)
     is invisible from the 70 column, which is exactly where the fixture the round-3 file uses sits. */
  const FIX = new Map(call.CALL_LEVELS.map((lvl) => {
    const save = seededSave(`word-${lvl.id}`);
    save.player.rank = 5;                              // every rung available, as Settings' table is
    return [lvl.id, playJob(save, { callOf: () => lvl.id })];
  }));
  /** the sentence the debrief prints for a job called at `called`, with every q̂ read as `q`. */
  const lineAt = (called, q) => {
    const f = FIX.get(called);
    return run.jobRegret(f.debrief, { items: f.queue, decisions: [], qHatOf: () => q }).call;
  };

  test('the premise: the word on the Settings surface IS the carry argmax', () => {
    /* `settings.js` prints `evMaxBands()` under that heading, and `evMaxBands` is derived from
       `carryIndifference()` — so "EV-max", unqualified, means `argmaxCall` to a student who has
       read the one panel that defines it. This is the fact that makes the assertions below the
       right ones; if this ever changes, they change with it rather than silently passing. */
    assert.match(SETTINGS_SRC, /The EV-max rung, by true clear rate/);
    assert.match(SETTINGS_SRC, /h\('p\.set-bands', \.\.\.evMaxBands\(\)/);
    for (const b of call.evMaxBands()) {
      const inside = b.to - 1e-9;
      assert.equal(b.call, call.argmaxCall(inside), `evMaxBands names ${b.call} at q̂ ${inside}`);
    }
  });

  test('the split sentence exists, names both ladders, and does not use the word', () => {
    const s = COPY.regret2Split({ envelope: 6, called: 70, money: 95, rank: 85, cost: '1.3' });
    assert.equal(s, 'envelope 6: you called 70. the money said 95, the rating said 85. cost 1.3 credit against 85.');
    for (const needle of ['argmaxcall', 'evtable', 'ev-max', 'ev max', 'evmax']) {
      assert.ok(!s.toLowerCase().includes(needle), `the split line must not use "${needle}" — Settings owns that word`);
    }
    /* Settings' own wording for the same two rungs, so the two screens read as one vocabulary. */
    assert.match(SETTINGS_SRC, /the money says call \$\{b\.money\}, the rating says call \$\{b\.rank\}/);
  });

  test('over 2 001 q̂ × every rung: wherever the WORD is printed it names Settings’ own rung', () => {
    let withWord = 0; let split = 0; let none = 0;
    for (let i = 0; i <= 2000; i++) {
      const q = i / 2000;
      for (const lvl of call.CALL_LEVELS) {
        const got = lineAt(lvl.id, q);
        if (!got.line) { none++; assert.equal(got.money, null, 'no line, no rung'); continue; }
        const named = /EV-max was (\d+)/.exec(got.line);
        if (named) {
          withWord++;
          assert.equal(Number(named[1]), call.argmaxCall(q),
            `q̂ ${q} called ${lvl.id}: the word named ${named[1]}, Settings publishes ${call.argmaxCall(q)} — "${got.line}"`);
          assert.equal(Number(named[1]), call.honestCall(q),
            'and it must still be the maximiser of the credit the same sentence prices');
          assert.equal(got.split, false);
        } else {
          split++;
          const both = /the money said (\d+), the rating said (\d+)/.exec(got.line);
          assert.ok(both, `a line that drops the word has to name both rungs: "${got.line}"`);
          assert.equal(Number(both[1]), call.argmaxCall(q), 'the money rung is Settings’ own argmax');
          assert.equal(Number(both[2]), call.honestCall(q), 'the rating rung is the one the cost prices');
          assert.equal(got.split, true);
          assert.notEqual(both[1], both[2], 'a split line is only printed where the two ladders differ');
        }
      }
    }
    assert.ok(withWord > 500, `the grid must actually print the word (${withWord} lines)`);
    assert.ok(split > 0, `the grid must actually reach a disagreement band (${split} lines)`);
    assert.ok(none > 0, 'and an honest call must still print nothing');
  });

  test('inside BOTH published bands the line names both rungs, and the word never appears', () => {
    const bands = call.CALL_DISAGREEMENT_BANDS;
    assert.equal(bands.length, 2, 'G3.1 publishes exactly two bands');
    for (const [i, b] of bands.entries()) {
      const step = (b.to - b.from) / 8;
      let seen = 0;
      for (let q = b.from + step; q < b.to; q += step) {
        for (const lvl of call.CALL_LEVELS) {
          const got = lineAt(lvl.id, q);
          if (!got.line) continue;
          seen++;
          assert.ok(!/EV-max/.test(got.line), `band ${i} at q̂ ${q.toFixed(4)}: "${got.line}"`);
          assert.equal(got.money, b.money, `band ${i}: the money rung is ${b.money}`);
          assert.equal(got.evMax, b.rank, `band ${i}: the rating rung is ${b.rank}`);
          assert.equal(got.line, COPY.regret2Split({
            envelope: got.envelope, called: got.called, money: b.money, rank: b.rank,
            cost: (Math.round(got.cost * 10) / 10).toFixed(1),
          }));
        }
      }
      assert.ok(seen >= 4, `band ${i} printed ${seen} lines`);
    }
  });

  test('the three reachable q̂ the critic measured, as they print now', () => {
    /* `of = 9` and `of = 10` both reach these, and all three sit inside the two published bands.
       The student who followed Settings' table and called 95 at q̂ = 8/9 used to be told "EV-max
       was 85" and charged 0.1 credit for obeying it. */
    assert.equal(lineAt(95, 8 / 9).line, 'envelope 1: you called 95. the money said 95, the rating said 85. cost 0.1 credit against 85.');
    assert.equal(lineAt(95, 7 / 9).line, 'envelope 1: you called 95. the money said 70, the rating said 85. cost 1.0 credit against 85.');
    assert.equal(lineAt(70, 0.885).line, 'envelope 1: you called 70. the money said 95, the rating said 85. cost 1.3 credit against 85.');
    /* …and outside the bands the published sentence is untouched, because there the word is true:
       G5 #2's own worked line, which is at q̂ = .75 where the two ladders agree. */
    assert.equal(lineAt(85, 0.75).line, 'envelope 1: you called 85, EV-max was 70. cost 0.3 credit.');
    assert.equal(call.honestCall(0.75), call.argmaxCall(0.75));
  });

  test('THE NEGATIVE CONTROL — the pre-fix pairing fails this file’s own rule', () => {
    /* What shipped before: `COPY.regret2` (the word) on `honestCall`, at every q̂. Rebuilt here so
       the rule above cannot pass vacuously — inside band 2 it names 85 under a word Settings
       publishes as 95. */
    const q = 0.885;
    const old = COPY.regret2({ envelope: 1, called: 70, evMax: call.honestCall(q), cost: '1.3' });
    assert.match(old, /EV-max was 85/);
    assert.equal(call.argmaxCall(q), 95);
    assert.throws(() => assert.equal(Number(/EV-max was (\d+)/.exec(old)[1]), call.argmaxCall(q)),
      'the old sentence must violate the rule this file enforces, or the rule proves nothing');
  });

  test('the screen still hand-rolls neither ladder: both rungs come from `call.regretOf`', () => {
    const src = RUN_SRC.slice(RUN_SRC.indexOf('export function jobRegret'), RUN_SRC.indexOf('export function composedCountOf'));
    const bare = RUN_CODE.slice(RUN_CODE.indexOf('export function jobRegret'), RUN_CODE.indexOf('export function composedCountOf'));
    assert.ok(src.includes('ladder: DEBRIEF_CALL_LADDER.best'), 'the priced rung is the declared ladder’s');
    assert.ok(src.includes("ladder: 'carry'"), 'the money rung is taken through the same module pair');
    assert.ok(!/argmaxCall|expectedCredit|honestCall/.test(bare), 'and neither half is recomputed here');
    assert.deepEqual(run.DEBRIEF_CALL_LADDER, { best: 'rating', cost: 'rating' }, 'the priced ladder is unchanged by this round');
  });
});

/* ================================================================================================
   §2 — G8's J8 acceptance row: the numerals the debrief can actually print
   ================================================================================================ */

describe('run v3 §2 — the J8 acceptance row’s two debrief outputs, measured', () => {
  test('the decision count has TWO bases and the row must name both', () => {
    const published = econ.decisionCount('JOB');
    assert.equal(published.mandatory, 24, 'G1’s published mandatory column, out of data/job.js');
    assert.equal(published.full, 35, 'G1’s published full column, out of data/job.js');
    /* The counter's OWN full-use column — what `state.debriefOf` can reach, because it charges one
       decision per brief window however many options were taken. The screen prints this beside the
       measured count and names G1's 35 as the different quantity it is (verify r2, split-honesty;
       `tests/run-lane-v2.test.mjs` §1 measures it through the machine). The acceptance row quoted
       "24 mandatory / 35 full" with no basis at all, which is the defect R-3 closed everywhere
       else and did not carry here. */
    assert.equal(published.mandatory + DECISIONS.commitFull, 25);
    assert.equal(DECISIONS.briefOptionsMax, 5);
    assert.equal(DECISIONS.backchecksFull, 2);
    const slice = RUN_SRC.slice(RUN_SRC.indexOf("fact('Decisions'"), RUN_SRC.indexOf("fact('Posted'"));
    for (const needle of ['published.mandatory', 'fullHere', 'briefOptionsMax', 'backchecksFull']) {
      assert.ok(slice.includes(needle), `the printed line must carry ${needle}`);
    }
    assert.match(RUN_SRC, /mandatory \/ \$\{fullHere\} full use, counting a brief window once/);
    assert.match(RUN_SRC, /G1’s \$\{published\.full\} counts its/);
  });

  test('`0 ms idle` is not a thing the debrief can print: the idle line is a two-clock difference', () => {
    /* run r1 deleted it as a tautology — `state.debriefOf` derives `wall` as `tGame + tAnswer`, so
       `wall − (tGame + tAnswer)` was `x − x` for every session the app can produce. Without a
       second clock there is no measurement and the line says so. */
    const { debrief } = playJob(seededSave('idle'));
    const blind = run.sessionSplit(debrief, null, {});
    assert.equal(blind.idleMeasured, false, 'no second clock, no measurement');
    assert.equal(blind.idle, 0);
    assert.match(RUN_SRC, /split\.idleMeasured \? `\$\{split\.idle\} ms idle` : 'idle not measured'/);
    assert.ok(!/['"`]0 ms/.test(RUN_CODE), 'no literal `0 ms` may come back into this screen');
    assert.ok(!/\bjob\.wall\b/.test(RUN_CODE.slice(RUN_CODE.indexOf('export function sessionSplit'), RUN_CODE.indexOf('function jobTakeBlock'))),
      'sessionSplit may never read the derived wall again (run r1 §1)');
  });
});

/* ================================================================================================
   §3 — `Another board`: the router answers the control, not only the hash
   ================================================================================================ */

describe('run v3 §3 — a link to the route you are already on acts', () => {
  test('the debrief renders exactly one `Another board`, and it points at the route it is on', () => {
    const actions = RUN_SRC.slice(RUN_SRC.indexOf('const actions = job'), RUN_SRC.indexOf('for (const node of ['));
    assert.match(actions, /h\('a\.btn\.btn-primary', \{ href: '#\/today' \}, 'Home'\)/, 'G6: the primary is Home');
    assert.match(actions, /h\('a\.btn', \{ href: '#\/run\/job' \}, 'Another board'\)/, 'and the secondary is Another board');
    assert.equal((RUN_SRC.match(/'Another board'/g) ?? []).length, 1, 'one control, one place');
    /* the route the debrief is MOUNTED at is the same one — that is the whole hazard */
    assert.equal(run.delegateOf('job').mod, './job.js');
    assert.equal(run.kindMeta('job')?.title, 'The Job');
  });

  test('the router binds the ACTIVATION as well as the hash', () => {
    assert.match(APP_SRC, /window\.addEventListener\('hashchange', route\)/, 'the hash listener stays');
    assert.match(APP_SRC, /document\.addEventListener\('click', sameRouteClick\)/, 'and the activation is bound once, at boot');
    assert.equal((APP_SRC.match(/document\.addEventListener\('click'/g) ?? []).length, 1, 'one document-level click listener, not one per screen');
    const fn = APP_SRC.slice(APP_SRC.indexOf('export function sameRouteClick'), APP_SRC.indexOf('/* ---------------- boot'));
    assert.ok(fn.includes('a.href !== location.href'), 'it acts only on the route the document is already at');
    assert.ok(fn.includes('ev.preventDefault()') && /\broute\(\)/.test(fn), 'and then routes in place');
    for (const guard of ['ev.defaultPrevented', 'ev.button !== 0', 'ev.metaKey', 'ev.ctrlKey', 'ev.shiftKey', 'ev.altKey', 'a.target', "hasAttribute('download')"]) {
      assert.ok(fn.includes(guard), `the handler must leave ${guard} alone`);
    }
    assert.ok(/href\[0\] !== '#'/.test(fn), 'in-app hash links only');
    // a same-route press must not push history: it re-posts a board, it does not add a page
    assert.ok(!/location\.hash =|pushState/.test(fn), 'and it must not touch history');
  });

  test('MEASURED: pressing it posts a board, in place, in a real browser', (t) => {
    const REPO = repoPath('.');
    if (!existsSync(path.join(REPO, 'qa', 'node_modules', 'playwright'))) { t.skip('no Playwright install under qa/'); return; }
    const probe = spawnSync(process.execPath, ['-e', `
      const { createRequire } = require('node:module');
      const req = createRequire(${JSON.stringify(path.join(REPO, 'qa', 'shot.mjs'))});
      req('playwright').chromium.launch().then(b => b.close()).then(() => process.exit(0), () => process.exit(3));
    `], { cwd: REPO, timeout: 90_000, encoding: 'utf8' });
    if (probe.status !== 0) { t.skip('no Playwright browser binary installed (run: cd qa && npx playwright install chromium)'); return; }
    const driver = path.join(REPO, 'tests', '_run-again.mjs');
    const r = spawnSync(process.execPath, [driver, '--engines', 'chromium'], { cwd: REPO, timeout: 600_000, encoding: 'utf8' });
    assert.equal(r.status, 0, `tests/_run-again.mjs failed\n${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /ALL PASS/);
    // a driver that measured nothing "passes" too: the press has to have actually posted a board
    assert.match(r.stdout, /job-debrief\s+BEFORE .*phase=debrief summary=true/, `the debrief was never reached:\n${r.stdout}`);
    assert.match(r.stdout, /job-debrief\s+AFTER\s+hash=#\/run\/job phase=board summary=false loads=(\d+) contracts=[1-9]/,
      `the press did not post a board at the same hash:\n${r.stdout}`);
    const loads = /job-debrief\s+BEFORE .*loads=(\d+)/.exec(r.stdout)?.[1];
    assert.ok(new RegExp(`job-debrief\\s+AFTER .*loads=${loads} `).test(r.stdout), `the press reloaded the document:\n${r.stdout}`);
    // and the flat path's own repeat control, which was dead for exactly the same reason
    assert.match(r.stdout, /run-page-summary\s+AFTER .*summary=false/, `the flat path's repeat control is still inert:\n${r.stdout}`);
  });
});
