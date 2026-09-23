// tests/cut-integrate.test.mjs — the seams between the seven lanes of THE CUT.
//
// AUTHORITY: designs/CUT-BRIEF.md; BUILD-POLICY.md overrides it on engineering.
//
// Every lane proved its own module. What no lane could prove is the JOIN, because each of these
// three defects lived in one lane's file and was only visible from another's:
//
//   1. the game composed a DIFFERENT page from Today's Page on a lowered week (notes/cut-home.md R1,
//      notes/cut-run.md R5) — `screens/job.js` called `startJob` with no compose opts;
//   2. `plan.jobEntryGate` had no caller (notes/cut-home.md R2). It is DELETED rather than adopted:
//      it refused on the whole week, not on the switch, so the route would have answered a bookmark
//      differently by the day and the hour — `qa/fixtures/midweek.json` is refused by it outright.
//      What the week decides is what Home OFFERS, and that rule never left the app;
//   3. NOTHING rolled the game's day while a session stayed open. `bank()` reads no clock by design
//      (notes/cut-machine.md §1.2) and `store.reconcileGameDay` skipped the roll under a live session
//      (R4, and §2.2 of this note) — so a session started before bed and finished the next afternoon
//      printed `today 548 points` over 48 banked today, and wrote the two-day sum into `best`, which
//      is never lowered again. §3 below asserts the calendar, and used to assert the opposite.
//
// …plus the one thing an integration pass owns outright: there is exactly ONE payoff module, it is
// the name CUT-SPEC §8 gives it, and the precache and every importer agree with each other.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fresh, migrate, reconcileGameDay, createStore } from '../site/js/store.js';
import * as plan from '../site/js/plan.js';
import { todayISO, addDays } from '../site/js/days.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const src = (p) => readFileSync(root + p, 'utf8');
/** Comments cannot satisfy a source scan, and must not be able to break one either. */
const code = (p) => src(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const NOW = new Date(2026, 8, 22, 18, 0).getTime();
const TODAY = todayISO(new Date(NOW));
const YESTERDAY = addDays(TODAY, -1);
const JOB = code('site/js/screens/job.js');

/** A live session record — `IN_PROGRESS_KEYS`, with a pile worth losing. */
const liveGame = () => ({ pile: 186, streak: 3, call: null, answered: 4, tGame: 9000, tAnswer: 11000, seed: 'abc123' });
/** …in the slot `page.startPage` creates for it. `fresh()` leaves `inProgress` null. */
const withLive = (s, game = liveGame()) => { s.inProgress = { kind: 'page', queue: [], idx: 0, game }; return s; };

/** In-memory Storage double, the shape `createStore({ storage })` wants. */
function fakeStorage(init = {}) {
  const map = new Map(Object.entries(init));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

/* ==========================================================================================
   1 — SAME QUEUE AS TODAY'S PAGE
   ========================================================================================== */

describe('the game composes Today\'s Page, not a page of its own', () => {
  test('`screens/job.js` starts the session through `plan.pageOpts`', () => {
    assert.match(JOB, /state\.startJob\(s,\s*\{\s*\.\.\.pageOpts\(s\)/,
      'screens/job.js must call startJob with pageOpts — without them a lowered week composes a '
      + 'different page here than the one Home\'s plan strip promised in print');
    assert.match(JOB, /import \{[^}]*\bpageOpts\b[^}]*\} from '\.\.\/plan\.js'/, 'pageOpts comes from plan.js');
    assert.ok(!/composeOpts/.test(JOB), 'screens/job.js must not grow a private copy of the drop-q line');
  });

  /* Raw source, not `code()`: these are call shapes no comment carries, and home.js holds a `/*`
     inside a line comment that makes any naive block-comment strip swallow the line under test. */
  test('all three routes that start Today\'s Page pass the SAME opts', () => {
    const sites = [
      ['site/js/screens/home.js', /=>\s*pageOpts\(save,\s*\{\s*D\s*\}\)/],
      ['site/js/screens/run.js', /startPage\(s,\s*\{\s*\.\.\.pageOpts\(s\)/],
      ['site/js/screens/job.js', /startJob\(s,\s*\{\s*\.\.\.pageOpts\(s\)/],
    ];
    for (const [p, re] of sites) assert.match(src(p), re, `${p} does not start its page through plan.pageOpts`);
  });

  test('…and those opts are the plan\'s, lowering included', () => {
    const s = fresh(NOW);
    s.settings.testDate = addDays(TODAY, 2);
    const lowered = plan.pageOpts(s, {});
    assert.deepEqual(Object.keys(lowered).sort(), ['microFlashOnly', 'tier4'], 'pageOpts grew a key');
    assert.ok(!('q' in lowered), 'pageOpts must drop q — the game does not re-choose the queue');
  });
});

/* ==========================================================================================
   2 — THE ROUTE'S ONLY DOOR IS THE SWITCH
   ========================================================================================== */

describe('`#/run/job` refuses on the switch and on nothing else', () => {
  test('`plan.jobEntryGate` is deleted, not left uncalled', () => {
    assert.equal(plan.jobEntryGate, undefined,
      'an uncalled exported gate is the dead code CUT-BRIEF names outright');
    assert.ok(!/jobEntryGate\s*\(/.test(code('site/js/plan.js')), 'plan.js still defines the gate');
    assert.ok(!/\bjobEntryGate\b/.test(code('site/js/screens/job.js')), 'screens/job.js still calls the gate');
  });

  test('the switch is still a door, and it is the only one the calendar cannot open', () => {
    assert.match(JOB, /if \(!gameOn\(getState\(\)\)\)\s*\{\s*navigate\('\/today'\)/,
      'mountJob must refuse when settings.game is false');
    assert.match(JOB, /pageInProgress\(getState\(\)\)/, 'a half-answered page is still a door');
    for (const w of ['isQuietNow', 'boardPolicy', 'inSchoolWindow', 'QUIET_HOUR']) {
      assert.ok(!new RegExp(`\\b${w}\\b`).test(JOB), `screens/job.js reads the clock/calendar through ${w}`);
    }
  });

  test('the week still decides what Home OFFERS — the rule did not leave the app', () => {
    const s = fresh(NOW);
    s.settings.testDate = addDays(TODAY, 7);
    const open = plan.boardPolicy(s, { today: TODAY, now: new Date(2026, 8, 22, 10).getTime() });
    const shut = plan.boardPolicy(s, { today: TODAY, now: new Date(2026, 8, 22, 23).getTime() });
    assert.equal(open.post, true, 'a mid-week morning offers the game');
    assert.equal(open.href, '#/run/job');
    assert.equal(shut.post, false, 'the 22:00 close still withholds it');
    assert.equal(shut.href, '#/today');
  });
});

/* ==========================================================================================
   3 — THE DAY BELONGS TO THE CALENDAR, NOT TO THE SESSION

   This section used to assert the opposite, and that is the seam it now owns. The machine lane
   closed a hole inside `bank()` by taking the clock out of it (notes/cut-machine.md §1.2), and the
   integration pass then made `store.reconcileGameDay` skip the roll whenever `inProgress.game`
   existed (§2.2), so that a session running through local midnight did not watch `today` fall across
   a reload. Between them, NOTHING rolled the day for as long as a session stayed open — and a
   session is only closed by finishing it. Start one before bed, bank once, finish it the next
   afternoon, and the app printed `today 548 points` over 48 points banked today; because `best` is
   only ever raised, the two-day sum became the student's best single day permanently.

   `today` naming a day the student is not looking at is a number the engine never computed, which is
   the one thing CUT-BRIEF's hard limits forbid outright. A `today` that falls to 0 at midnight is
   surprising; it is also exact, and nothing is lost when it falls — the closing day is floored into
   `best` first, and its unbanked pile goes home with it.

   THAT LAST CLAUSE USED TO SAY the roll never touched `inProgress.game`, and that was the other half
   of the same defect (r3, exploit-hunt): banking is never required, so the pile simply survived the
   roll and banked the next afternoon, and `today 946 points` / `best 946` then named a day on which
   the student had answered nothing. The roll now takes the closing day's pile into its own `today`
   before flooring and zeroing it, so `best` is one day, whole, and every point of it earned on it.
   The session itself carries on — only the pile stops crossing the date line. `store.js` owns the
   rule and `tests/job-save.test.mjs` owns its proof against the shipped `bank()`; what §3 asserts is
   that this store, on this save, agrees.
   ========================================================================================== */

describe('a live session does not own the calendar', () => {
  const staleLive = () => {
    const s = withLive(fresh(NOW));
    s.game = { today: 186, day: YESTERDAY };
    s.player = { best: 274 };
    return s;
  };

  test('a session that outlives its own day rolls it, and sends its unbanked pile home with it', () => {
    const s = reconcileGameDay(staleLive(), TODAY);
    assert.equal(s.game.today, 0, 'yesterday\'s 186 points are still being printed as today\'s');
    assert.equal(s.game.day, TODAY, '`bank()` reads no clock — it would add tonight\'s points to yesterday');
    assert.equal(s.player.best, 372, 'the closing day was worth 186 banked + 186 on the record, and best is one day');
    assert.equal(s.inProgress.game.pile, 0, 'the pile crossed the date line and banks into a day it was not won on');
    assert.equal(s.inProgress.game.streak, 1, 'the pile went home and the streak did not — that is a free bank');
    assert.equal(s.inProgress.game.answered, 4, 'the roll ended the session instead of sending its pile home');
    assert.equal(s.inProgress.game.seed, 'abc123', 'the roll re-rolled the session');
  });

  test('…and with no live session it rolls exactly the same way', () => {
    const s = staleLive();
    delete s.inProgress.game;
    reconcileGameDay(s, TODAY);
    assert.equal(s.game.today, 0, 'yesterday\'s points printed as today\'s');
    assert.equal(s.game.day, TODAY);
  });

  test('the floor fires in both cases, BEFORE the roll, and never lowers `best`', () => {
    for (const live of [true, false]) {
      for (const day of [YESTERDAY, TODAY]) {
        const s = staleLive();
        s.player.best = 9;
        s.game = { today: 186, day };
        if (!live) delete s.inProgress.game;
        reconcileGameDay(s, TODAY);
        /* 372 in the one case where a day is CLOSING under a live session: its 186-point pile goes
           home to it before the floor reads `today`. Everywhere else the floor sees 186 alone. */
        const want = live && day === YESTERDAY ? 372 : 186;
        assert.equal(s.player.best, want, `best was not floored by a day that happened (live: ${live}, day: ${day})`);
      }
    }
  });

  test('it is idempotent and total over a live session', () => {
    const once = reconcileGameDay(staleLive(), TODAY);
    const twice = reconcileGameDay(structuredClone(once), TODAY);
    assert.deepEqual(twice.game, once.game);
    assert.deepEqual(twice.player, once.player);
    for (const junk of [null, 0, 'x', [], NaN]) {
      const s = staleLive();
      s.inProgress.game = junk;
      assert.doesNotThrow(() => reconcileGameDay(s, TODAY), `reconcileGameDay threw on inProgress.game = ${String(junk)}`);
    }
  });

  test('a real store load across midnight prints the points banked TODAY, and keeps the best day', () => {
    const storage = fakeStorage();
    const yesterday = createStore({ storage, now: () => new Date(2026, 8, 21, 23, 40).getTime() });
    yesterday.load();
    yesterday.update((d) => {
      d.game = { today: 186, day: YESTERDAY };
      d.player = { best: 274 };
      withLive(d);
    }, { immediate: true });

    const reopened = createStore({ storage, now: () => NOW }).load();
    assert.equal(reopened.game.today, 0, 'a reload the next day still printed yesterday\'s points as today\'s');
    assert.equal(reopened.game.day, TODAY);
    assert.equal(reopened.player.best, 372, 'the best day is not the closing day, banked pile and all');
    assert.ok(reopened.inProgress?.game, 'the roll dropped the live session');
    assert.equal(reopened.inProgress.game.pile, 0, 'the pile is still on the record, waiting to bank into today');
  });
});

/* ==========================================================================================
   4 — EXACTLY ONE PAYOFF MODULE, AND IT IS CUT-SPEC §8'S NAME
   ========================================================================================== */

describe('one payoff module', () => {
  test('`js/job/pay.js` is the module and `js/job/econ.js` is gone', () => {
    assert.ok(existsSync(root + 'site/js/job/pay.js'), 'site/js/job/pay.js is missing');
    assert.ok(!existsSync(root + 'site/js/job/econ.js'), 'a second payoff module is beside the first');
  });

  test('every importer names it, and none names the old one', () => {
    const importers = [
      'site/js/job/state.js', 'site/js/screens/job.js', 'site/js/screens/settings.js',
      'tests/job-pay.test.mjs', 'tests/job-screen.test.mjs',
    ];
    for (const p of importers) {
      const t = src(p);
      assert.ok(/(job\/pay|\.\/pay)\.js/.test(t), `${p} does not reach the payoff module by its name`);
      assert.ok(!/(job\/econ|\.\/econ)\.js['"]/.test(t), `${p} still imports the old filename`);
    }
  });

  test('the worker precaches the module the app actually loads', () => {
    const sw = src('site/sw.js');
    assert.ok(sw.includes("'js/job/pay.js'"), 'sw.js does not precache the payoff module');
    assert.ok(!sw.includes("'js/job/econ.js'"), 'sw.js precaches a file that does not exist');
  });

  test('the cache name is the version, and the version was bumped for the cut', () => {
    const v = src('site/version.js').match(/APP_VERSION\s*=\s*"([^"]+)"/);
    assert.ok(v, 'version.js does not declare APP_VERSION');
    assert.notEqual(v[1], '2026-09-21a', 'APP_VERSION was not bumped — a returning student keeps the pre-cut cache');
    assert.match(src('site/sw.js'), /packet-\$\{(self\.)?APP_VERSION\}/, 'the cache is not keyed on the version');
  });
});

/* ==========================================================================================
   5 — THE SWITCH RETURNS THE APP TO COMPOSED
   ========================================================================================== */

describe('settings.game = false is byte-identical COMPOSED', () => {
  test('a v1 save and an elaborate-layer save both migrate with the game switched off', () => {
    const v1 = { v: 1, xp: 55, settings: { theme: 'dark' }, cards: { 'ang-wu-1': { seen: 3 } }, skills: {} };
    const out1 = migrate(structuredClone(v1), NOW);
    assert.equal(out1.xp, 55, 'a v1 save lost XP');
    assert.deepEqual(out1.cards['ang-wu-1'].seen, 3, 'a v1 save lost a card record');

    /* the elaborate layer's own shape: two top-level keys full of cut mechanics */
    const v2 = {
      v: 2, xp: 410, settings: {}, cards: {}, skills: {},
      player: { elo: 1412, rank: 4, calls: [1, 0, 1], best: 274, bestBag: 419 },
      game: { today: 186, day: TODAY, log: [{ rating: -0.09 }], heat: 7, tags: {}, crew: {}, posted: 526 },
    };
    const out2 = migrate(structuredClone(v2), NOW);
    assert.equal(out2.xp, 410, 'the study ledger lost XP across the cut');
    for (const k of ['elo', 'rank', 'calls', 'bestBag']) assert.equal(k in out2.player, false, `player.${k} survived the cut`);
    for (const k of ['log', 'heat', 'tags', 'crew', 'posted']) assert.equal(k in out2.game, false, `game.${k} survived the cut`);
    assert.equal(Number.isFinite(out2.player.best), true, 'player.best is not a number');
    assert.equal(Number.isFinite(out2.game.today), true, 'game.today is not a number');
  });

  test('with the game off, `nextActionFor` returns the very object it was handed', () => {
    const s = fresh(NOW);
    s.settings.game = false;
    for (const kind of ['page', 'resume', 'warmup', 'boss', 'mock', 'missed', 'morning', 'night']) {
      const act = { kind, label: 'RUN NEXT', href: '#/run/page' };
      assert.equal(plan.nextActionFor(s, act, { now: NOW }), act, `the game rewrote a ${kind} action with the switch off`);
    }
  });

  test('no screen outside `js/job/` and `screens/job.js` reaches the payoff module', () => {
    for (const p of ['site/js/screens/home.js', 'site/js/screens/stats.js', 'site/js/screens/run.js', 'site/js/plan.js', 'site/js/page.js']) {
      assert.ok(!/job\/pay\.js/.test(code(p)), `${p} imports the payoff table — it must not be able to price anything`);
    }
  });
});
