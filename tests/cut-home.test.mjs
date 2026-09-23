// tests/cut-home.test.mjs — THE CUT, lane "home": `site/js/plan.js`'s game gate and `site/js/screens/home.js`.
//
// AUTHORITY designs/CUT-BRIEF.md and designs/CUT-SPEC.md; BUILD-POLICY.md wins.
//
// The old layer failed on Home before a question was asked: forty numbers on the first screen, and a
// grey line under the button that read "the game is Today's Page with a different top strip" — the
// design document, quoted at a 14-year-old. This lane's job is that Home carries no game except the
// one thing a student can act on. So these are the properties, and every one CAN be false:
//
//   A. THE SWITCH IS A DOOR.      `settings.game = false` → `nextActionFor` returns the very object it
//                                 was handed. Not a copy, not a copy with one extra key. Identity.
//   B. THE GAME ADDS NO WORD AND NO NUMBER TO THE BUTTON.  For one save, flipping `settings.game`
//                                 changes the button's HREF and nothing else a student can read: same
//                                 label, same sub-line, same numbers, same queue.
//   C. NO NEW ROUTE, AND NO DEAD END.  Every href the gate can emit matches one of the app's 13 route
//                                 patterns, and every refusal lands on a STUDY route — never on the
//                                 game's own, and never on nothing.
//   D. THE PLAN CANNOT PRICE ANYTHING.  `plan.js` imports no line of `js/job/*`, so the module that
//                                 decides Home's button cannot see the pile, the streak or a point.
//   E. THE BEST DAY IS ON HOME, and it is the ONLY thing the game puts there (round-1 finding 1: a
//                                 point buys nothing but beating `save.player.best`, and that number
//                                 was printed in exactly one place — the screen that had just set it).
//   F. A PILL THAT POINTS AT THIS SCREEN IS NOT A LINK (round-1 finding 3: `app.js`'s global
//                                 same-route click handler turned every decorative self-link in the
//                                 study app into a re-mount that throws the scroll to the top).
//   G. THE SESSION IS TODAY'S PAGE, AND AS SHORT AS THE STUDY LAYER ALLOWS (round-1 finding 2) —
//                                 with the one lever this lane has over its length, and the study
//                                 guarantee that lever breaks, both executable.
//   H. MEASURED, in a real browser: E and F are DOM behaviour, and a source scan can only approximate
//                                 them (`qa/cut-home.mjs`, gated on the repo's Playwright install).
//
// Each assertion below was run against a deliberately broken copy of the code first; the mutations
// and the failures they produced are recorded in notes/cut-home.md ("Negative controls").

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import * as plan from '../site/js/plan.js';
import * as home from '../site/js/screens/home.js';
import { nextAction, composePage, LIMITS, estimateMinutes } from '../site/js/page.js';
import { fresh } from '../site/js/store.js';
import { COPY } from '../site/data/job.js';
import { ROOT, read, readIfAny, stripCommentsAndStrings } from './_helpers.mjs';

/* ================================================================= fixtures */

const TODAY = '2026-09-17';                                   // a Thursday
const AT10 = new Date(2026, 8, 17, 10, 0, 0).getTime();       // 10:00 — open
const AT23 = new Date(2026, 8, 17, 23, 0, 0).getTime();       // 23:00 — past the 22:00 close
const AT0630 = new Date(2026, 8, 17, 6, 30, 0).getTime();     // 06:30 — before an 08:00 test, so D = 0 is Test Morning
const CLOCKS = Object.freeze([{ tag: '06:30', now: AT0630 }, { tag: '10:00', now: AT10 }, { tag: '23:00', now: AT23 }]);

/** A save with a test date `D` days out (or none), placement done so the page is the next action. */
function saveAt(D, over = {}) {
  const s = fresh(AT10);
  if (D != null) { s.settings.testDate = plan.addDays(TODAY, D); s.settings.testTime = '08:00'; }
  else s.settings.testDate = null;
  s.placement = { done: true, at: AT10 };
  if (over.game === false) s.settings.game = false;
  return s;
}

/** The same save with a LIVE session on it — `inProgress.game` is the only mark the gate reads. */
function withLiveJob(s) {
  const c = structuredClone(s);
  c.inProgress = {
    kind: 'page', seed: 1, seedTag: 'aaaaaa', queue: [{ key: 'k1', tier: 2 }, { key: 'k2', tier: 2 }], idx: 1,
    hearts: null, xp: 0, startedAt: AT10, day: TODAY, dayIndex: 0, pageIndex: 0, meta: { seedTag: 'aaaaaa', carried: [] },
    game: { pile: 8, streak: 2, call: null, answered: 1, tGame: 1000, tAnswer: 2000, seed: '1' },
  };
  return c;
}

/** The D values that reach every branch of `modeFor`: no date, past, test day, night before, page days. */
const DAYS = Object.freeze([null, -1, 0, 1, 2, 4, 7, 14]);

/** Every state the gate can be in: D × clock × the switch × a live session. */
function everyState() {
  const out = [];
  for (const D of DAYS) {
    for (const { tag, now } of CLOCKS) {
      for (const game of [true, false]) {
        for (const live of [false, true]) {
          const base = saveAt(D, { game });
          out.push({ D, tag, now, game, live, save: live ? withLiveJob(base) : base });
        }
      }
    }
  }
  return out;
}

/** The action kinds `page.nextAction` can return, as bare stand-ins (no compose cost). */
const ACT_KINDS = Object.freeze(['resume', 'post', 'morning', 'night', 'warmup', 'boss', 'mock', 'missed', 'page']);
const stubAct = (kind) => Object.freeze({ kind, label: `label-${kind}`, href: `#/stub/${kind}` });

/* ------------------------------------------------------- the route matcher */

/** The 13 patterns, read from app.js's SOURCE — importing app.js installs the trophy engine. */
const ROUTE_PATTERNS = (() => {
  const src = read('site/js/app.js');
  const m = src.match(/export const ROUTE_PATTERNS = Object\.freeze\(\[([\s\S]*?)\]\)/);
  assert.ok(m, 'app.js still declares ROUTE_PATTERNS as a frozen array literal');
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
})();

/** `/run/:kind/:id?` → /^\/run\/[^/]+(?:\/[^/]+)?$/ */
function patternRe(p) {
  let re = '^';
  for (const seg of p.split('/').filter(Boolean)) {
    if (seg.startsWith(':')) re += seg.endsWith('?') ? '(?:/[^/]+)?' : '/[^/]+';
    else re += '/' + seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`${re}$`);
}
const ROUTE_RES = ROUTE_PATTERNS.flatMap(p => p.split('|')).map(patternRe);
/** Does `#/run/job` (or `/run/job`) match one of the app's route patterns? */
const isRoute = (href) => {
  const path = String(href).replace(/^#/, '').split('?')[0];
  return ROUTE_RES.some(re => re.test(path));
};

/** Every digit-run in a rendered string, in order — the numbers a student would actually read. */
const numbersIn = (s) => String(s).match(/\d+(?:\.\d+)?/g) ?? [];

/* ================================================================= A. the switch is a door */

test('THE CUT · home: `settings.game = false` is byte-identical COMPOSED', async (t) => {
  await t.test('nextActionFor returns the VERY OBJECT it was given, for every action kind', () => {
    let checked = 0;
    for (const st of everyState()) {
      if (st.game) continue;                                   // this block is the switch OFF
      for (const kind of ACT_KINDS) {
        const act = stubAct(kind);
        const out = plan.nextActionFor(st.save, act, { today: TODAY, now: st.now });
        assert.equal(out, act, `D=${st.D} ${st.tag} live=${st.live} ${kind}: the game returned a different object`);
        checked++;
      }
    }
    assert.equal(checked, DAYS.length * CLOCKS.length * 2 * ACT_KINDS.length, 'every off state × every action kind');
    assert.equal(checked, 432);
  });

  await t.test('…including a LIVE session: a save the student switched the game off on resumes the flat page', () => {
    const off = withLiveJob(saveAt(7, { game: false }));
    const act = stubAct('resume');
    assert.equal(plan.nextActionFor(off, act, { today: TODAY, now: AT10 }), act);
    assert.equal(plan.hasLiveJob(off), true, 'the record is still on the save — the switch does not delete study state');
  });

  await t.test('the off action grows no key: no `.board`, no `.policy`, no `.sub`', () => {
    for (const kind of ACT_KINDS) {
      const out = plan.nextActionFor(saveAt(7, { game: false }), stubAct(kind), { today: TODAY, now: AT10 });
      assert.deepEqual(Object.keys(out), ['kind', 'label', 'href'], kind);
    }
  });

  await t.test('and the ON action carries no `.board` either — nothing has read one since the board was cut', () => {
    const s = saveAt(7);
    const act = stubAct('page');
    const out = plan.nextActionFor(s, act, { today: TODAY, now: AT10 });
    assert.equal('board' in out, false);
    assert.equal('sub' in out, false, 'jobAction has no sub-line: the game adds no copy');
    assert.equal('sub' in plan.jobAction(s, { today: TODAY, now: AT10 }), false);
  });
});

/* ================================================================= B. no word, no number */

test('THE CUT · home: the game adds no word and no number to Home', async (t) => {
  /** The same student, the same day, the switch the only difference. */
  function pair(D, { now = AT10 } = {}) {
    // ONE student. `fresh()` seeds each save differently, so the off save is a clone of the on save
    // with the switch flipped — otherwise the two would compose different pages for an honest reason
    // and the comparison below would be measuring the fixture instead of the game.
    const on = saveAt(D);
    const off = structuredClone(on);
    off.settings.game = false;
    const actOn = nextAction(on, { today: TODAY, now, compose: plan.pageOpts(on, { D }) });
    const actOff = nextAction(off, { today: TODAY, now, compose: plan.pageOpts(off, { D }) });
    return {
      on: plan.nextActionFor(on, actOn, { today: TODAY, now }),
      off: plan.nextActionFor(off, actOff, { today: TODAY, now }),
      raw: actOn,
    };
  }

  await t.test('the switch changes the HREF and nothing else the student reads', () => {
    for (const D of [2, 4, 7, 14]) {
      const { on, off } = pair(D);
      assert.equal(on.kind, 'job', `D=${D}: the game posts`);
      assert.equal(off.kind, 'page');
      assert.equal(on.href, '#/run/job');
      assert.equal(off.href, '#/run/page');
      assert.deepEqual(home.ctaLabel(on), home.ctaLabel(off), `D=${D}: the button's text`);
      assert.deepEqual(home.ctaSub(on, { breakdown: home.ctaLabel(on).breakdown }),
        home.ctaSub(off, { breakdown: home.ctaLabel(off).breakdown }), `D=${D}: the grey line`);
    }
  });

  await t.test('…and not one digit moves', () => {
    for (const D of [2, 4, 7, 14]) {
      const { on, off } = pair(D);
      const printed = (a) => {
        const { label, breakdown } = home.ctaLabel(a);
        return numbersIn([label, ...home.ctaSub(a, { breakdown })].join(' · '));
      };
      const nOn = printed(on), nOff = printed(off);
      assert.deepEqual(nOn, nOff, `D=${D}: ${nOn.join(',')} vs ${nOff.join(',')}`);
      assert.ok(nOn.length >= 2, `D=${D}: the page prints its own numbers, so this comparison is not vacuous`);
    }
  });

  await t.test('the queue is the same queue — the game never re-composes, adds, removes or reorders', () => {
    for (const D of [2, 7]) {
      const { on, off, raw } = pair(D);
      assert.equal(on.page, raw.page, 'the SAME object page.nextAction composed, not a copy');
      assert.deepEqual(on.page.queue.map(i => i.key), off.page.queue.map(i => i.key), `D=${D}`);
      assert.equal(on.page.meta.seedTag, off.page.meta.seedTag);
      assert.equal(on.label, raw.label, 'and the button keeps the PAGE\'s own label');
    }
  });

  await t.test('ctaSub branches on the PAGE, not on the kind: a job action and a page action over one page agree', () => {
    const page = composePage(saveAt(7), { now: AT10, today: TODAY, ...plan.pageOpts(saveAt(7), { D: 7 }) });
    const asPage = { kind: 'page', label: 'RUN NEXT · 11 new + 2 variants', href: '#/run/page', page };
    const asJob = { kind: 'job', label: asPage.label, href: '#/run/job', page, policy: { why: 'NEVER PRINT ME' } };
    assert.deepEqual(home.ctaSub(asJob, {}), home.ctaSub(asPage, {}));
    assert.deepEqual(home.ctaLabel(asJob), home.ctaLabel(asPage));
    assert.ok(home.ctaSub(asJob, {}).length > 0, 'not vacuous — the page arm does print a line');
  });

  await t.test('the two numbers the CTA computes itself are the study layer\'s own arithmetic, pinned', () => {
    // These are the only numbers `home.js` produces rather than quotes, so they are pinned literally:
    // a comparison between the game-on and game-off renders cannot catch a drift that moves both.
    assert.deepEqual({ ...home.EST_MIN }, { 1: 0.5, 2: 1.5, 3: 3, 4: 5 });
    //  4 × 0.5 + 2 × 1.5 + 1 × 3 + 2 × 5  =  2 + 3 + 3 + 10  =  18
    assert.equal(home.estMinutes([1, 1, 1, 1, 2, 2, 3, 4, 4].map(tier => ({ tier }))), 18);
    assert.equal(home.estMinutes([{ tier: 9 }, {}]), 3, 'an unknown tier is priced as a tier-2 item');
    assert.equal(home.estMinutes(null), 0);

    assert.equal(home.CTA_LABEL_MAX, 24);
    const page = { queue: new Array(25).fill({ tier: 2 }), meta: { seedTag: 'abc123', carried: [] } };
    const at25 = { kind: 'page', label: 'RUN NEXT · 4 new + 4 variants', href: '#/run/page', page };   // 29 chars
    assert.deepEqual(home.ctaLabel(at25), { label: 'RUN NEXT · 25 items', breakdown: '4 new + 4 variants' });
    const at24 = { ...at25, label: 'RUN NEXT · 14 more items' };                                      // 24 chars
    assert.equal(at24.label.length, 24);
    assert.deepEqual(home.ctaLabel(at24), { label: 'RUN NEXT · 14 more items', breakdown: null }, 'the boundary is inclusive');
  });

  await t.test('no gate diagnostic can reach the sub-line: every `why` string the gate emits is absent', () => {
    const whys = new Set();
    for (const st of everyState()) whys.add(plan.boardPolicy(st.save, { today: TODAY, now: st.now }).why);
    whys.delete('');
    assert.ok(whys.size >= 5, `the gate has ${whys.size} diagnostics to leak`);
    const page = composePage(saveAt(7), { now: AT10, today: TODAY });
    for (const D of [2, 7]) {
      const s = saveAt(D);
      const act = plan.nextActionFor(s, { kind: 'page', label: 'RUN NEXT · 11 new + 2 variants', href: '#/run/page', page }, { today: TODAY, now: AT10 });
      const { label, breakdown } = home.ctaLabel(act);
      const printed = [label, ...home.ctaSub(act, { breakdown })].join(' · ');
      for (const why of whys) assert.ok(!printed.includes(why), `D=${D}: the button printed "${why}"`);
    }
  });

  await t.test('and home.js never reads one — the screen cannot print what it does not touch', () => {
    const src = stripCommentsAndStrings(read('site/js/screens/home.js'));
    assert.ok(!/\.why\b/.test(src), 'home.js reads `.why`');
    assert.ok(!/\.policy\b/.test(src), 'home.js reads the gate policy');
    assert.ok(!/\bboard\b/.test(src), 'home.js still knows the word "board"');
  });

  await t.test('…and the renderer builds the CTA through these two functions and nothing else', () => {
    // The repo has no DOM harness (no third-party runtime or test dependency — BUILD-POLICY §2), so
    // the assertions above are on the pure functions. This is the line that ties them to the paint.
    const src = stripCommentsAndStrings(read('site/js/screens/home.js'));
    assert.match(src, /const \{ label: baseLabel, breakdown \} = ctaLabel\(act\);/);
    assert.match(src, /const sub = ctaSub\(act, \{ breakdown, inProgress: ip \}\);/);
    assert.equal((src.match(/sub\.push\(/g) ?? []).length, 0, 'the render path assembles no sub-line of its own');
    assert.equal((src.match(/\bctaSub\(/g) ?? []).length, 2, 'declared once, called once');
  });

  await t.test('CUT-SPEC §6 belongs to the game screen, not to Home: none of its words appear on this one', () => {
    // `pile`, `streak` and the three calls are the game's vocabulary. Home's OWN "day streak" is the
    // study layer's (COMPOSED S4) and predates the game, so the check is on the CTA. The game reaches
    // exactly one other thing on this screen — the best day — and block E owns that: it is `COPY.best`
    // verbatim, it is not on the button, and `best ` stays absent from the button below.
    const page = composePage(saveAt(7), { now: AT10, today: TODAY });
    const act = plan.nextActionFor(saveAt(7), { kind: 'page', label: 'RUN NEXT · 11 new + 2 variants', href: '#/run/page', page }, { today: TODAY, now: AT10 });
    const { label, breakdown } = home.ctaLabel(act);
    const printed = [label, ...home.ctaSub(act, { breakdown })].join(' · ').toLowerCase();
    for (const w of ['pile', 'streak', 'not sure', 'pretty sure', 'sure', 'bank', 'pays', 'points', 'best ']) {
      assert.ok(!printed.includes(w), `the button printed the game word "${w}": ${printed}`);
    }
  });
});

/* ================================================================= C. no new route, no dead end */

test('THE CUT · home: no new route, and no refusal is a dead end', async (t) => {
  await t.test('the app still has 13 route patterns', () => {
    assert.equal(ROUTE_PATTERNS.length, 13, ROUTE_PATTERNS.join(' '));
    assert.ok(isRoute('#/run/job'), 'the game rides the existing /run/:kind route');
    assert.ok(!isRoute('#/job'), 'the matcher is not vacuous');
  });

  await t.test('every href the gate can emit is one of them', () => {
    let seen = 0;
    const hrefs = new Set();
    for (const st of everyState()) {
      const opts = { today: TODAY, now: st.now };
      const p = plan.boardPolicy(st.save, opts);
      hrefs.add(p.href);
      const j = plan.jobAction(st.save, opts);
      if (j) hrefs.add(j.href);
      for (const kind of ACT_KINDS) {
        const out = plan.nextActionFor(st.save, stubAct(kind), opts);
        if (out.href.startsWith('#/stub/')) continue;          // the stand-in's own href, untouched
        hrefs.add(out.href);
      }
      seen++;
    }
    assert.equal(seen, DAYS.length * CLOCKS.length * 2 * 2, 'D × clock × switch × live');
    assert.equal(seen, 96);
    for (const href of hrefs) assert.ok(isRoute(href), `${href} is not one of the 13 patterns`);
    assert.ok(hrefs.size >= 4, `only ${hrefs.size} distinct hrefs — the sweep is not reaching the branches`);
  });

  /* `jobEntryGate` is deleted (site/js/plan.js, and the integrator's note): the ROUTE no longer
     refuses on the week, so what is asserted here is the surviving half — the week never POINTS the
     student at the game on a day it does not offer one, and it never leaves them nowhere. */
  await t.test('a week that does not offer the game always names a STUDY route instead', () => {
    const STUDY = new Set(['#/today', '#/run/page', '#/run/morning', '#/run/night', '#/binder']);
    let offers = 0, withholds = 0;
    for (const st of everyState()) {
      const opts = { today: TODAY, now: st.now };
      const p = plan.boardPolicy(st.save, opts);
      if (p.post) {
        assert.equal(p.href, '#/run/job', 'a week that posts the game names the game');
        offers++;
      } else {
        assert.ok(STUDY.has(p.href), `D=${st.D} ${st.tag}: href ${p.href}`);
        assert.notEqual(p.href, '#/run/job', 'a week that withholds the game must not name it');
        withholds++;
      }
      /* and the primary action agrees with the policy, on every action kind */
      for (const kind of ACT_KINDS) {
        const out = plan.nextActionFor(st.save, stubAct(kind), opts);
        if (out.href === '#/run/job') assert.ok(p.post || plan.hasLiveJob(st.save), `D=${st.D} ${st.tag}: ${kind} sent to the game on a week that withholds it`);
      }
    }
    assert.ok(offers > 0 && withholds > 0, `${offers} offers, ${withholds} withholds — both branches reached`);
  });

  await t.test('the 22:00 close stops Home OFFERING a new session, and never an old one', () => {
    const open = plan.boardPolicy(saveAt(7), { today: TODAY, now: AT10 });
    assert.equal(open.post, true, 'the game is offered at 10:00');
    assert.equal(open.href, '#/run/job');
    const shut = plan.boardPolicy(saveAt(7), { today: TODAY, now: AT23 });
    assert.equal(shut.post, false, 'the game is not offered at 23:00');
    assert.equal(shut.kind, 'closed');
    assert.equal(shut.href, '#/today', 'studying is one tap away');
    /* a LIVE session is never stranded by the clock: the resume still goes back into it */
    const live = withLiveJob(saveAt(7));
    const act = plan.nextActionFor(live, stubAct('resume'), { today: TODAY, now: AT23 });
    assert.equal(act.href, '#/run/job', 'the 22:00 close stranded a live pile');
  });

  await t.test('a live session resumes into the game, keeping the study layer\'s own label', () => {
    const s = withLiveJob(saveAt(7));
    const act = Object.freeze({ kind: 'resume', label: 'Continue page · 2 of 12', href: '#/run/page' });
    const out = plan.nextActionFor(s, act, { today: TODAY, now: AT23 });
    assert.equal(out.href, '#/run/job');
    assert.equal(out.kind, 'resume');
    assert.equal(out.label, act.label, 'the game does not rename the button');
    assert.deepEqual(Object.keys(out), Object.keys(act), 'and adds no field to it');
    // …and with no live session the same action is returned untouched, by identity.
    assert.equal(plan.nextActionFor(saveAt(7), act, { today: TODAY, now: AT10 }), act);
  });

  await t.test('a study action the page ranks above the page is never taken over', () => {
    const s = saveAt(7);
    for (const kind of ['post', 'morning', 'night', 'warmup', 'boss', 'mock', 'missed']) {
      const act = stubAct(kind);
      assert.equal(plan.nextActionFor(s, act, { today: TODAY, now: AT10 }), act, kind);
    }
  });
});

/* ================================================================= I. the day's page is dealt once

   ROUND 4, exploit-hunt, MAJOR. Home's own primary button re-dealt the page it had just finished:
   `nextActionFor` turned every `kind:'page'` action into `#/run/job` with no "already played today"
   test, so a finished session put "RUN NEXT · 17 items" back on the screen over a queue whose items
   were 15 of 17 the ones just answered — with every worked solution read. `save.game.today` and
   `save.player.best` therefore counted LAPS: 546 a lap on the fixture below, 746 on the critic's,
   unbounded, against 264–397 for honest play of the same page. `best` is the game's only reward
   (CUT-SPEC §8), and a record you beat by tapping the same button again is not a record.

   THE FIX IS SUBTRACTIVE AND IT IS AN OFFER, NOT A LOCK. The week posts the game over TODAY'S page;
   `page.pageIndexFor` is the study layer's own count of the pages closed today, so "Today's Page" is
   `pageIndex === 0` and everything after it is an extra page, offered as study on `#/run/page` with
   the study layer's own label and sub-line. Nothing is added to the screen and nothing is taken from
   the student: a second page is still one tap away, the ROUTE is still ungated (`jobEntryGate` stays
   deleted), and a live session still resumes into the game from any hour.

   RESIDUAL, and it is named rather than papered over (notes/cut-home.md R11): this closes the OFFER.
   `js/job/state.js bankPile` still banks over any session, so a student who types `#/run/job` by
   hand can still farm. That fix is one file this lane does not own; the request carries the code. */

test('THE CUT · home: the day\'s page is dealt once — the button never re-deals a played page', async (t) => {
  /** The run record `screens/run.js commitJobRun` (and the flat page's `finish()`) writes. */
  const pageRunAt = (startedAt) => ({ kind: 'page', id: null, startedAt, submittedAt: startedAt + 1000, results: [] });

  await t.test('a save with today\'s page closed: the week withholds the game and names a study route', () => {
    const fresh0 = saveAt(7);
    assert.equal(plan.pageSpentToday(fresh0, TODAY), false, 'no page closed yet');
    assert.equal(plan.boardPolicy(fresh0, { today: TODAY, now: AT10 }).post, true, 'the day\'s first page is the game');

    const spent = structuredClone(fresh0);
    spent.runs = [pageRunAt(AT10)];
    assert.equal(plan.pageSpentToday(spent, TODAY), true);
    const p = plan.boardPolicy(spent, { today: TODAY, now: AT10 });
    assert.equal(p.post, false, 'the game is posted a second time over a page already closed today');
    assert.equal(p.kind, 'spent');
    assert.notEqual(p.href, '#/run/job', 'a week that withholds the game must not name it');
    assert.ok(isRoute(p.href), `${p.href} is not one of the 13 patterns`);
  });

  await t.test('…and the button is then the flat page\'s, by identity — the switch-off door\'s own shape', () => {
    const spent = saveAt(7);
    spent.runs = [pageRunAt(AT10)];
    for (const kind of ACT_KINDS) {
      const act = stubAct(kind);
      assert.equal(plan.nextActionFor(spent, act, { today: TODAY, now: AT10 }), act,
        `${kind}: the game rewrote an action over a page the save had already closed today`);
    }
  });

  await t.test('yesterday\'s page does not spend today, and tomorrow\'s clock does not either', () => {
    const s = saveAt(7);
    const yesterday = new Date(2026, 8, 16, 10, 0, 0).getTime();
    s.runs = [pageRunAt(yesterday)];
    assert.equal(plan.pageSpentToday(s, TODAY), false, 'a page closed yesterday spends today');
    assert.equal(plan.boardPolicy(s, { today: TODAY, now: AT10 }).post, true);
    /* and the roll is the calendar's, not the clock's: the same save read on the 18th is open again */
    const s2 = saveAt(7);
    s2.runs = [pageRunAt(AT10)];
    assert.equal(plan.pageSpentToday(s2, '2026-09-18'), false, 'the next day starts spent');
  });

  await t.test('nothing is stranded: the route is ungated and a live session still resumes into it', () => {
    const spent = withLiveJob(saveAt(7));
    spent.runs = [pageRunAt(AT10)];
    const act = Object.freeze({ kind: 'resume', label: 'Continue page · 2 of 12', href: '#/run/page' });
    for (const { tag, now } of CLOCKS) {
      const out = plan.nextActionFor(spent, act, { today: TODAY, now });
      assert.equal(out.href, '#/run/job', `${tag}: a live pile was stranded by the day's page count`);
      assert.equal(out.label, act.label, 'the game does not rename the button');
      assert.deepEqual(Object.keys(out), Object.keys(act), 'and adds no field to it');
    }
    /* the ROUTE itself is untouched — the two doors `screens/job.js` refuses on, and no third */
    const job = stripCommentsAndStrings(read('site/js/screens/job.js'));
    assert.ok(!/\bpageSpentToday\b/.test(job), 'a calendar gate came back onto the route');
    assert.ok(!/\bpageIndexFor\b/.test(job), 'the route now counts the day\'s pages');
    /* …and the two matchers above are not vacuous: they find both names in the file that owns them */
    const gate = stripCommentsAndStrings(read('site/js/plan.js'));
    assert.ok(/\bpageSpentToday\b/.test(gate) && /\bpageIndexFor\b/.test(gate), 'the gate lives in plan.js');
    assert.ok(isRoute('#/run/job'), 'the game still rides the existing /run/:kind route');
  });

  await t.test('it adds no number and no tap: the policy carries the calendar and the clock, and no score', () => {
    const spent = saveAt(7);
    spent.runs = [pageRunAt(AT10)];
    const p = plan.boardPolicy(spent, { today: TODAY, now: AT10 });
    assert.deepEqual(Object.entries(p).filter(([, v]) => typeof v === 'number').map(([k]) => k).sort(), ['D', 'now']);
    assert.equal(typeof plan.pageSpentToday(spent, TODAY), 'boolean', 'the gate answers yes or no, never with a count');
    /* the button a spent day prints is the flat page's, word for word and number for number */
    const page = composePage(spent, { now: AT10, today: TODAY });
    const act = Object.freeze({ kind: 'page', label: 'RUN NEXT · 11 new + 2 variants', href: '#/run/page', page });
    const out = plan.nextActionFor(spent, act, { today: TODAY, now: AT10 });
    assert.deepEqual(home.ctaLabel(out), home.ctaLabel(act));
    assert.deepEqual(home.ctaSub(out, { breakdown: home.ctaLabel(out).breakdown }),
      home.ctaSub(act, { breakdown: home.ctaLabel(act).breakdown }));
  });

  /* THE MEASUREMENT. Everything above is the gate; this is the exploit, played on the shipped engine
     through the shipped verbs plus `screens/job.js`'s own two hooks, in the order that screen calls
     them. It is the arm that would go red if `pageIndexFor` ever stopped counting what the game
     closes — a gate on a fact nothing writes is not a gate. */
  await t.test('measured: a finished session leaves Home pointing at the flat page, over the same items', async () => {
    const [state, runScreen] = await Promise.all([
      import('../site/js/job/state.js'),
      import('../site/js/screens/run.js'),
    ]);
    const CLEAR = Object.freeze({ cleared: true, correct: true, first: true, firstTry: true, hinted: false, attempts: 1 });
    const D = 7;
    const save = saveAt(D);
    let t = AT10;

    /** One whole session, exactly as `screens/job.js` drives it. → the ids it asked about. */
    const playAPage = () => {
      state.startJob(save, { ...plan.pageOpts(save, { D }), now: t });
      const before = runScreen.captureJobBefore(save, state.queueOf(save).slice());
      const ids = state.queueOf(save).map(q => q.id ?? q.key);
      for (let guard = 0; guard < 80 && state.targetsLeft(save) > 0; guard++) {
        const bid = state.stateOf(save).call ? null : state.callsFor(save).slice(-1)[0];
        if (bid) state.call(save, bid, { now: (t += 10), ms: 10 });
        state.answer(save, CLEAR, { now: (t += 10), ms: 10 });
      }
      const queue = state.queueOf(save).slice();
      const over = state.endJob(save, { now: (t += 10), ms: 10 });
      runScreen.commitJobRun(save, { queue, before, now: t });
      t += 1000;
      return { ids, over };
    };
    /** What Home's primary button would be, right now, on this save. */
    const homeNow = () => plan.nextActionFor(save,
      nextAction(save, { today: TODAY, now: t, compose: plan.pageOpts(save, { D }) }), { today: TODAY, now: t });

    assert.equal(homeNow().href, '#/run/job', 'the day\'s first page is the game');
    const lap1 = playAPage();
    assert.ok(lap1.ids.length >= 8, `a page of ${lap1.ids.length} items is not a session`);
    assert.ok(lap1.over.points > 0, 'the session banked nothing — the driver is not playing the game');
    assert.equal(plan.pageSpentToday(save, TODAY), true, 'the session closed a page and nothing recorded it');

    const after = homeNow();
    assert.equal(after.href, '#/run/page', 'Home re-dealt the page it had just finished');
    assert.equal(after.kind, 'page');

    /* WHY IT MATTERS, stated rather than asserted away: the page behind that button is the one just
       answered. Only the generated variants re-seed; every CARD id comes back, with its solution read. */
    const lap2 = playAPage();
    const repeats = lap2.ids.filter(id => lap1.ids.includes(id));
    assert.ok(repeats.length >= lap1.ids.length - 3,
      `only ${repeats.length} of ${lap1.ids.length} items repeated — re-check what the second page is worth`);
    assert.equal(homeNow().href, '#/run/page', 'and it stays the flat page for the rest of the day');
  });
});

/* ================================================================= the one composed page */

test('THE CUT · home: one set of compose opts, so three routes cannot build three pages', async (t) => {
  await t.test('pageOpts is composeOpts without `q`, and `q` is dropped on purpose', () => {
    for (const D of [null, 2, 7, 14]) {
      const s = saveAt(D);
      const full = plan.composeOpts(s, { D });
      const cut = plan.pageOpts(s, { D });
      assert.equal('q' in cut, false, `D=${D}: an explicit q switches off page.js's session budget`);
      assert.deepEqual(Object.keys(cut), ['tier4', 'microFlashOnly']);
      const { q, ...rest } = full;
      assert.deepEqual(cut, rest, `D=${D}`);
      assert.ok(Number.isFinite(q));
    }
  });

  await t.test('a lowered week really does hand the composer one tier-4 item', () => {
    const tight = saveAt(2);                                   // R over two days → q > 12 → lowered
    const roomy = saveAt(14);
    assert.equal(plan.qFor(tight, { D: 2 }).warn, true, 'the fixture is on the lowered side of the line');
    assert.equal(plan.pageOpts(tight, { D: 2 }).tier4, plan.TIER4_PER_DAY_LOWERED);
    assert.equal(plan.pageOpts(tight, { D: 2 }).microFlashOnly, true);
    assert.equal(plan.pageOpts(roomy, { D: 14 }).tier4, plan.TIER4_PER_DAY);
  });

  await t.test('home.js starts every page through it — there is no second copy of the drop-q line', () => {
    const src = stripCommentsAndStrings(read('site/js/screens/home.js'));
    const starts = [...src.matchAll(/startPage\(([^\n]*?)\);/g)].map(m => m[1].trim());
    assert.equal(starts.length, 2, `${starts.length} startPage calls found: ${starts.join(' | ')}`);
    for (const arg of starts) assert.equal(arg, 's, planOpts(s, D)', `startPage(${arg}) bypasses the plan`);
    assert.ok(!/composeOpts/.test(src), 'home.js keeps its own copy of the drop-q line');
    assert.match(src, /const planOpts = \(save, D\) => pageOpts\(save, \{ D \}\)/);
  });
});

/* ================================================================= D. the plan cannot price anything */

test('THE CUT · home: the plan cannot see a point', async (t) => {
  const src = read('site/js/plan.js');
  const code = stripCommentsAndStrings(src);

  await t.test('plan.js imports no line of js/job/*', () => {
    // the RAW source: `stripCommentsAndStrings` empties the specifier out of every import line.
    const imports = [...src.matchAll(/^\s*(?:import|export)[^\n]*?\bfrom\s+'([^']+)'/gm)].map(m => m[1]);
    assert.ok(imports.length > 0);
    for (const spec of imports) assert.ok(!/\/job\/|^\.\/job\//.test(spec), `plan.js imports ${spec}`);
    assert.deepEqual(imports.filter(s => s.includes('data/job.js')), ['../data/job.js'],
      'the one thing it takes from the game is WEEK — a constants file with zero imports');
  });

  await t.test('and names none of the payoff vocabulary', () => {
    for (const w of ['PAYS', 'COSTS', 'payOf', 'costOf', 'honestCall', 'shouldPush', 'BANDS', 'econ', 'pile']) {
      assert.ok(!new RegExp(`\\b${w}\\b`).test(code), `plan.js names ${w}`);
    }
  });

  await t.test('the gate exports no number of its own', () => {
    const gate = ['gameOn', 'hasLiveJob', 'boardPolicy', 'jobAction', 'nextActionFor'];
    assert.equal(plan.jobEntryGate, undefined, 'jobEntryGate is deleted, not left uncalled');
    for (const name of gate) assert.equal(typeof plan[name], 'function', name);
    const p = plan.boardPolicy(saveAt(7), { today: TODAY, now: AT10 });
    const numeric = Object.entries(p).filter(([, v]) => typeof v === 'number').map(([k]) => k);
    assert.deepEqual(numeric.sort(), ['D', 'now'], 'the policy carries the calendar and the clock, and no score');
  });

  await t.test('the mechanics CUT-BRIEF deletes are not named here either', () => {
    for (const w of ['contract', 'crew', 'guard', 'wing', 'token', 'elo', 'backcheck', 'posted', 'loot', 'vault', 'getaway']) {
      assert.ok(!new RegExp(w, 'i').test(code), `plan.js still names "${w}"`);
    }
  });

  await t.test('and the dead week helpers are gone', () => {
    for (const name of ['quietLimit', 'nightBeforeDone', 'NIGHT_BEFORE_MINUTES', 'MORNING_MINUTES']) {
      assert.equal(plan[name], undefined, `${name} is exported but nothing reads it`);
    }
  });
});

/* ================================================================= E. the best day is on Home */

/* ROUND 1, finding 1 — "nothing carries to tomorrow where the student can see it".
   `save.player.best` is the game's whole reward: a point buys nothing but beating it. It was printed
   in exactly one place — the session-over screen, straight after `bank()` had already raised it to
   today's total — so the first session read your own score back to you and every later one hid it
   until the next session ended. `save.game.today` rolls to 0 at midnight. Home now prints the best
   day, and that is the ONE thing the game puts on this screen. */

test('THE CUT · home: the best day is on Home, and it is the only thing the game puts there', async (t) => {
  /** `saveAt(7)` with a best day on it. */
  const withBest = (best, over = {}) => { const s = saveAt(7, over); s.player = { best }; return s; };

  await t.test('the switch is still a door: game off prints nothing, at any score', () => {
    for (const best of [0, 1, 612, 99999]) {
      assert.equal(home.bestLine(withBest(best, { game: false })), null, `best ${best} leaked with the game off`);
    }
  });

  await t.test('and a student who has never banked a point gets no number either — there is no "best 0"', () => {
    assert.equal(home.bestLine(withBest(0)), null, 'a fresh player is `{ best: 0 }` — that is not a line');
    const none = saveAt(7); delete none.player;
    assert.equal(home.bestLine(none), null, 'a save with no player key at all');
    assert.equal(home.bestLine(undefined), null);
    assert.equal(home.bestLine({}), null);
    // `store.normalizePlayer` guarantees a non-negative integer; the line refuses anything else rather
    // than printing a number the engine never computed (CUT-BRIEF's hard limit).
    for (const junk of [null, '612', 6.5, -3, NaN, Infinity]) {
      assert.equal(home.bestLine(withBest(junk)), null, `player.best = ${String(junk)}`);
    }
  });

  await t.test('otherwise it prints `save.player.best` VERBATIM — one number, and it is that number', () => {
    for (const best of [1, 8, 186, 274, 612, 4096]) {
      const line = home.bestLine(withBest(best));
      assert.equal(line, `best ${best}`);
      assert.deepEqual(numbersIn(line), [String(best)], `${line}: a second number, or a derived one`);
    }
  });

  await t.test('…in CUT-SPEC §6\'s own words: the string comes out of data/job.js, not out of this screen', () => {
    assert.equal(home.bestLine(withBest(274)), COPY.best({ points: 274 }), 'CUT-SPEC §6 `best 274`');
    assert.match(home.bestLine(withBest(612)), /^best \d+$/, 'no caption this screen invented');
    const src = stripCommentsAndStrings(read('site/js/screens/home.js'));
    assert.match(src, /COPY\.best\(\{ points: best \}\)/, 'formatted once, by the vocabulary that owns it');
    assert.equal((src.match(/COPY\./g) ?? []).length, 1, 'Home reaches for exactly one entry of the game vocabulary');
  });

  await t.test('Home reads the ONE number that survives the night, and never the one that rolls to 0', () => {
    const src = stripCommentsAndStrings(read('site/js/screens/home.js'));
    assert.equal((src.match(/player\?\.best|player\.best/g) ?? []).length, 1, 'player.best is read in one place, inside bestLine');
    assert.ok(!/\bgame\?\.today\b|\bgame\.today\b/.test(src),
      'home.js reads `save.game.today` — it rolls to 0 every midnight, so Home would print "0" every morning');
    assert.ok(!/\bpile\b|\bstreak: \b/.test(src.replace(/state\.streak/g, '')), 'no pile on Home');
  });

  await t.test('the renderer prints it through `bestLine` and builds the string nowhere else', () => {
    // Both paints — the cold-open placeholder render AND the composed one — or the number a student
    // acts on would flicker in after the CTA resolves.
    const raw = read('site/js/screens/home.js');
    assert.equal((raw.match(/const best = bestLine\(state\);/g) ?? []).length, 2, 'render() and renderLight() both print it');
    assert.equal((raw.match(/best \? h\('p\.home-best\.muted\.fs-1\.mono', \{ dataset: \{ slot: 'best' \} \}, best\) : null,/g) ?? []).length, 2,
      'one node shape, printed only when there is something to print');
    const src = stripCommentsAndStrings(raw);
    assert.equal((src.match(/\bbestLine\(/g) ?? []).length, 3, 'declared once, called twice — nothing else formats a score');
  });

  await t.test('and it is not on the button: the CTA still reads only the composed page', () => {
    // `ctaLabel`/`ctaSub` take an ACTION, never the save, so the best day cannot reach them — and the
    // §6 word check above already asserts `best ` is absent from the button. This pins the structure:
    // the line is a SIBLING of `.home-cta`, not a child of it (measured in the browser by qa/cut-home.mjs).
    const raw = read('site/js/screens/home.js');
    assert.match(raw, /\n    cta,\n    best \? h\('p\.home-best/, 'the best line sits beside the CTA block, not inside it');
    assert.match(raw, /export function ctaLabel\(act\) \{/, 'ctaLabel takes an ACTION, so no save can reach the button');
    assert.match(raw, /export function ctaSub\(act, \{ breakdown = null, inProgress = null \} = \{\}\) \{/, 'and neither can one reach the grey line');
    // …and not vacuously: hand both a save-shaped action with a best day on it and nothing changes.
    const act = { kind: 'job', label: 'RUN NEXT · 13 items', href: '#/run/job', page: { queue: [{ tier: 2 }], meta: { seedTag: 'abc123', carried: [] } }, save: withBest(612) };
    assert.ok(!home.ctaSub(act, {}).join(' ').includes('612'));
    assert.ok(!home.ctaLabel(act).label.includes('612'));
  });
});

/* ================================================================= F. a self-link is not a link */

/* ROUND 1, finding 3 — `boot()` installs a global `sameRouteClick` that preventDefaults and re-routes
   any in-page anchor whose href is the WHOLE current URL. It was added for the game's "again" button
   and is not gated on `settings.game`, so it changed every screen: on `#/today` each page-day pill in
   the S7 plan strip points at `#/today`, and tapping one now re-mounted Home and threw the scroll to
   the top. A link to the screen you are on is not a link — so it is rendered without an href, which
   `sameRouteClick` (`a[href]`) cannot see. The study layer keeps every link that goes somewhere. */

test('THE CUT · home: a plan pill that points at this screen is not a link', async (t) => {
  await t.test('`hereNow` spells the current route the way a pill spells its destination', () => {
    assert.equal(plan.hereNow({ hash: '#/today' }), '#/today');
    assert.equal(plan.hereNow({ hash: '#/run/page?seed=x' }), '#/run/page', 'the query is not part of the screen');
    assert.equal(plan.hereNow({ hash: '#/today/' }), '#/today', 'a trailing slash is the same screen');
    for (const hash of ['', '#', undefined, null]) assert.equal(plan.hereNow({ hash }), null, JSON.stringify(hash));
    assert.equal(plan.hereNow(null), null);
    assert.equal(plan.hereNow(), null, 'under node there is no location, and no pill is "here"');
  });

  await t.test('on `#/today` every page-day pill is `self`, and the two that go somewhere are not', () => {
    const s = saveAt(7);
    const pills = plan.pillsFor(s, { today: TODAY, D: 7, here: '#/today' });
    assert.ok(pills.length >= 3, `${pills.length} pills`);
    for (const p of pills) {
      const goesSomewhereElse = p.href !== '#/today';
      assert.equal(p.self, !goesSomewhereElse, `${p.label} (${p.href}) self=${p.self}`);
    }
    const night = pills.find(p => p.kind === 'night'), morning = pills.find(p => p.kind === 'morning');
    assert.equal(night.self, false, 'the Night Before is a different screen');
    assert.equal(morning.self, false, 'so is the Test Morning');
    assert.ok(pills.some(p => p.kind === 'page' && p.self), 'and the page days are this one');
  });

  await t.test('…and the rule follows the route, so the strip is right wherever it is drawn', () => {
    const s = saveAt(7);
    const onNight = plan.pillsFor(s, { today: TODAY, D: 7, here: '#/night' });
    assert.deepEqual(onNight.filter(p => p.self).map(p => p.kind), ['night'], 'only the Night pill is "here" on #/night');
    const nowhere = plan.pillsFor(s, { today: TODAY, D: 7, here: '#/binder' });
    assert.deepEqual(nowhere.filter(p => p.self), [], 'on a screen no pill points at, every pill is a link');
    const unknown = plan.pillsFor(s, { today: TODAY, D: 7 });
    assert.deepEqual(unknown.filter(p => p.self), [], 'and with no route given (node), nothing is deadened by accident');
    assert.deepEqual(unknown.map(p => p.href), onNight.map(p => p.href), 'the DESTINATIONS never move — only whether they are rendered as links');
  });

  await t.test('the long-week gap pill is covered too — it is a `#/today` link on `#/today`', () => {
    const s = saveAt(14);
    const pills = plan.pillsFor(s, { today: TODAY, D: 14, here: '#/today' });
    const gap = pills.find(p => p.kind === 'gap');
    assert.ok(gap, 'a 14-day week collapses its middle into a gap pill');
    assert.equal(gap.self, true);
  });

  await t.test('`planFor` threads the route through, so the one DOM call site gets it', () => {
    const s = saveAt(7);
    const here = plan.planFor(s, { now: AT10, today: TODAY, here: '#/today' });
    const blind = plan.planFor(s, { now: AT10, today: TODAY });
    assert.ok(here.pills.some(p => p.self), 'planFor(here) marks them');
    assert.ok(!blind.pills.some(p => p.self), 'planFor() alone marks nothing');
    assert.deepEqual(here.pills.map(p => `${p.label}${p.href}`), blind.pills.map(p => `${p.label}${p.href}`), 'and changes nothing else');
  });

  await t.test('the painter drops the href for those, derives the route itself, and keeps the CSS', () => {
    const src = read('site/js/plan.js');
    assert.match(src, /const here = opts\.here !== undefined \? opts\.here : hereNow\(\);/,
      'fillPlanStrip asks the browser once — Home\'s call site is pinned by three other suites and cannot grow an argument');
    assert.match(src, /if \(p\.kind !== 'gap' && !p\.self\) a\.href = p\.href;/, 'a self pill gets no href');
    assert.match(src, /document\.createElement\(p\.kind === 'gap' \? 'span' : 'a'\)/,
      'and stays an <a>, so `.plan-pill a` in screens.css still styles it');
    assert.match(src, /li\.dataset\.self = 'true'; li\.setAttribute\('aria-label', p\.title\);/,
      'the description moves to the <li>, which is a listitem and announces one');
  });

  await t.test('…and Home\'s own fallback strip, which paints before plan.js has loaded', () => {
    // `mountHome` IS the `/today` screen, so a page-day pill there is a link to here — WHILE THE
    // GAME IS ON. With the flag off it is an ordinary `#/today` link again (see the gate below).
    const raw = read('site/js/screens/home.js');
    assert.match(raw, /const href = k === 0 \? '#\/morning' : k === 1 \? '#\/night' : gameIsOn\(state\) \? null : '#\/today';/,
      'the fallback page-day pill has no destination but this screen, so with the game on it has no href');
    assert.ok(!/const href = k === 0 \? '#\/morning' : k === 1 \? '#\/night' : '#\/today';/.test(raw),
      'the ungated self-link is gone, not merely shadowed');
    assert.match(raw, /if \(!href\) data\.self = 'true';/);
  });

  /* THE GATE (round-3 integration). CUT-BRIEF:89 — "`settings.game = false` returns the app to
     byte-identical COMPOSED behaviour" — was false of the shipped build while this rule and the
     `app.js` handler it compensates for both ignored the flag (`tests/cut-meta.test.mjs` carried
     them as two rows of `UNGATED`). Both read it now, so with the game off every pill is a link
     again and nothing re-mounts a screen under a student who has scrolled. */
  await t.test('WITH THE GAME OFF every pill is a link again — no pill is `self`, on any route', () => {
    for (const here of ['#/today', '#/night', '#/morning']) {
      const off = plan.pillsFor(saveAt(7, { game: false }), { today: TODAY, D: 7, here });
      const on = plan.pillsFor(saveAt(7), { today: TODAY, D: 7, here });
      assert.deepEqual(off.filter(p => p.self), [], `a pill is still deadened on ${here} with the game off`);
      assert.ok(on.some(p => p.self), `control: the game ON still marks a pill on ${here}`);
      assert.deepEqual(off.map(p => p.href), on.map(p => p.href), 'and the DESTINATIONS never moved either way');
      assert.deepEqual(off.map(p => p.label), on.map(p => p.label), 'nor anything else about the strip');
    }
  });

  await t.test('…the long-week gap pill is gated by the same clause, not by a second rule', () => {
    const off = plan.pillsFor(saveAt(14, { game: false }), { today: TODAY, D: 14, here: '#/today' });
    const gap = off.find(p => p.kind === 'gap');
    assert.ok(gap, 'a 14-day week still collapses its middle into a gap pill');
    assert.equal(gap.self, false, 'and with the game off it is a link like the rest');
    assert.equal(gap.href, '#/today', 'its destination is untouched');
  });

  await t.test('…and `app.js`\'s same-route handler reads the flag BEFORE it reads the event', () => {
    const src = read('site/js/app.js');
    const body = src.slice(src.indexOf('export function sameRouteClick'));
    const gate = body.indexOf("settings?.game === false) return;");
    const firstEventRead = body.indexOf('ev.defaultPrevented');
    assert.ok(gate > 0, 'sameRouteClick does not read settings.game at all');
    assert.ok(gate < firstEventRead,
      'the flag is read after the handler has started acting on the event — it must be the first line, '
      + 'so that with the game off the tap falls through to the browser exactly as COMPOSED left it');
    assert.match(body.slice(0, gate), /getState\(\)/, 'and it reads the LIVE state, not a boot-time snapshot');
  });
});

/* ================================================================= G. the session's length */

/* ROUND 1, finding 2 — the shipped session is 9–14 questions and the app's own estimate is 14–25
   minutes, against CUT-BRIEF "Session shape": 8–12 questions, 10–14 minutes. The measurement is
   right. What this block pins is what can be done about it from THIS lane, and what cannot:

     · CUT-BRIEF's other two sentences in that same paragraph are "Same queue as Today's Page, same
       length, same items" and "The composer still owns what is studied … it never chooses, adds,
       removes or reorders a question". So the game may not shorten the page on its own; the page
       itself would have to be shorter, for a student with the game switched off too.
     · `plan.js` hands the composer exactly two options (`tier4`, `microFlashOnly`) and neither
       shortens a page. The ONE lever that does is `composePage`'s minute budget — and every value of
       it that reaches the brief's window cuts the midweek fixture's review block from 10 to ≤ 3 and
       takes COMPOSED S7's per-day algebra floor with it. `tests/home-r1.test.mjs` pins the first of
       those ("reviews are never dropped, only deferred"); COMPOSED S7 is the authority for the second.

   So the session is not capped, and the decision is recorded in notes/cut-home.md (R6, for the
   brief's owner) rather than paid for out of the study layer. The sweep below is executable: the day
   `page.js` can compose a 10–14 minute page without deferring a due review, it goes red and the cap
   becomes available. Nothing here is a claim that the session is short enough. */

test('THE CUT · home: the session is Today\'s Page, and as short as the study layer allows', async (t) => {
  const NOW = AT10;
  /** The page the three routes actually start, at `D`. */
  const shipped = (D, extra = {}) => {
    const s = saveAt(D);
    return composePage(s, { now: NOW, today: TODAY, ...plan.pageOpts(s, { D }), ...extra });
  };
  const algOf = (p) => p.queue.filter(it => it.module === 'M11' || it.module === 'M12').length;

  await t.test('the shipped envelope, measured through the shipped composer', () => {
    // Pinned so it can only ever get SHORTER without someone reading this block. Deterministic: the
    // queue's length and estimate do not move with the profile id (only the seed tag does).
    const PINNED = { 10: [9, 14], 7: [13, 19], 5: [14, 17], 3: [14, 17], 2: [14, 17] };
    for (const [D, [len, min]] of Object.entries(PINNED)) {
      const p = shipped(Number(D));
      assert.deepEqual([p.queue.length, p.meta.minutes], [len, min], `D=${D}`);
      assert.equal(p.meta.minutes, Math.round(estimateMinutes(p.queue)), 'the printed estimate is the queue\'s own');
      assert.ok(p.queue.length <= LIMITS.pageMax, `D=${D}: COMPOSED S1's item budget`);
      assert.ok(p.meta.minutes <= LIMITS.minutesMax, `D=${D}: COMPOSED S1's 10–25 minute session`);
    }
  });

  await t.test('and the game does not touch it: "same queue, same length, same items"', () => {
    for (const D of [7, 2]) {
      const on = saveAt(D);
      const off = structuredClone(on);
      off.settings.game = false;
      const a = composePage(on, { now: NOW, today: TODAY, ...plan.pageOpts(on, { D }) });
      const b = composePage(off, { now: NOW, today: TODAY, ...plan.pageOpts(off, { D }) });
      assert.deepEqual(a.queue.map(i => i.key), b.queue.map(i => i.key), `D=${D}: the switch composed a different page`);
      assert.equal(a.meta.minutes, b.meta.minutes);
      assert.deepEqual(plan.pageOpts(on, { D }), plan.pageOpts(off, { D }), 'and the plan hands both the same opts');
    }
  });

  await t.test('CUT-BRIEF\'s window is not met, and the gap is named rather than papered over', () => {
    const BRIEF = { qMin: 8, qMax: 12, minMin: 10, minMax: 14 };
    const over = [];
    for (const D of [10, 7, 5, 3, 2]) {
      const p = shipped(D);
      if (p.queue.length > BRIEF.qMax || p.meta.minutes > BRIEF.minMax) over.push(`D=${D} ${p.queue.length}q/${p.meta.minutes}min`);
    }
    assert.ok(over.length > 0,
      `every page day is now inside CUT-BRIEF's 8–12 / 10–14 window (${over.length} over) — the cap in notes/cut-home.md R6 may be unnecessary; re-read it before deleting this test`);
  });

  await t.test('the one lever that would close it breaks "reviews are never dropped, only deferred"', () => {
    const mid = JSON.parse(readIfAny('qa/fixtures/midweek.json') ?? 'null');
    assert.ok(mid, 'qa/fixtures/midweek.json — the heavy-review fixture tests/home-r1.test.mjs pins');
    const { q, ...opts } = plan.composeOpts(mid, {});            // home-r1's own call shape
    assert.equal('q' in opts, false);
    const base = composePage(mid, opts);
    assert.ok(base.meta.counts.review >= 10,
      `the fixture has ${base.meta.counts.review} reviews — tests/home-r1.test.mjs requires ≥ 10, so fix THAT first`);

    const sweep = [];
    for (let m = 6; m <= LIMITS.minutesMax; m += 2) {
      const p = composePage(mid, { ...opts, minutes: m });
      sweep.push({ m, len: p.queue.length, min: p.meta.minutes, review: p.meta.counts.review ?? 0 });
    }
    const inWindow = (r) => r.len >= 8 && r.len <= 12 && r.min >= 10 && r.min <= 14;
    const reached = sweep.filter(inWindow);
    assert.ok(reached.length > 0, `not vacuous — the window IS reachable: ${JSON.stringify(sweep)}`);
    assert.deepEqual(reached.filter(r => r.review >= 10).map(r => r.m), [],
      `a minute budget reaches CUT-BRIEF's window AND keeps the review block — cap the session (notes/cut-home.md R6): ${JSON.stringify(reached)}`);
    assert.ok(Math.max(...reached.map(r => r.review)) <= 3,
      `and the price is the review block: ${JSON.stringify(reached)}`);
  });

  await t.test('…and takes COMPOSED S7\'s per-day algebra floor with it', () => {
    for (const D of [7, 5, 3, 2]) {
      const now = shipped(D);
      assert.ok(algOf(now) >= plan.ALGEBRA_FLOOR, `D=${D}: the shipped page keeps the floor (${algOf(now)})`);
      const capped = shipped(D, { minutes: 14 });
      assert.ok(capped.queue.length <= 12, `D=${D}: a 14-minute budget does reach the brief's count (${capped.queue.length})`);
      assert.ok(algOf(capped) < plan.ALGEBRA_FLOOR,
        `D=${D}: a 14-minute page now keeps the algebra floor (${algOf(capped)}) — half the price of the cap is gone, re-read notes/cut-home.md R6`);
    }
  });

  await t.test('and `plan.js` has no other lever: what it hands the composer cannot shorten a page', () => {
    const opts = plan.pageOpts(saveAt(7), { D: 7 });
    assert.deepEqual(Object.keys(opts).sort(), ['microFlashOnly', 'tier4']);
    const s = saveAt(7);
    const base = composePage(s, { now: NOW, today: TODAY });
    // `tier4: 1` and `microFlashOnly` are the lowering, and neither is a length bound: the first
    // swaps one hard item for carried work, the second swaps long cards for ten-second ones.
    const lowered = composePage(s, { now: NOW, today: TODAY, tier4: 1, microFlashOnly: true });
    assert.ok(lowered.queue.length >= base.queue.length - 1 && lowered.queue.length <= base.queue.length + 4,
      `the plan's two options are not a length bound (${base.queue.length} → ${lowered.queue.length})`);
  });
});

/* ================================================================= H. measured, in a browser */

/* notes/cut-home.md open issue 3: the repo has no jsdom and BUILD-POLICY §2 forbids adding one, so
   everything above runs against pure functions plus source pins. Two of round 1's findings are DOM
   BEHAVIOUR — whether a tap re-mounts the screen, and what is actually painted on Home — and a source
   pin can only approximate those. `qa/cut-home.mjs` measures them in Chromium against the real
   `site/`, the way qa/fix-stats-r2.mjs does for Stats; this is the gate the repo already uses. */

function browsersAvailable() {
  if (!existsSync(path.join(ROOT, 'qa', 'node_modules', 'playwright'))) return false;
  const probe = spawnSync(process.execPath, ['-e', `
    const { createRequire } = require('node:module');
    const req = createRequire(${JSON.stringify(path.join(ROOT, 'qa', 'shot.mjs'))});
    req('playwright').chromium.launch().then(b => b.close()).then(() => process.exit(0), () => process.exit(3));
  `], { cwd: ROOT, timeout: 90_000, encoding: 'utf8' });
  return probe.status === 0;
}

test('THE CUT · home: measured in a real browser — the pill is inert and the best day is painted', (t) => {
  if (!browsersAvailable()) { t.skip('no Playwright browser installed (cd qa && npx playwright install)'); return; }
  const run = spawnSync(process.execPath, ['qa/cut-home.mjs'], { cwd: ROOT, timeout: 300_000, encoding: 'utf8' });
  assert.equal(run.status, 0, `qa/cut-home.mjs failed:\n${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /ALL PASS/);
  // …and the numbers, so a "pass" that measured nothing cannot slip through.
  assert.match(run.stdout, /tapping it does not re-mount Home — remounted=false/);
  assert.match(run.stdout, /does not throw the scroll to the top — (\d+) → \1/);
  assert.match(run.stdout, /Home prints the best day — "best 612"/);
  assert.match(run.stdout, /game OFF: not a word of it — null/);
  assert.match(run.stdout, /the grey line is byte-identical, seed included/);
  /* THE GATE (round-3 integration) — the measured half of CUT-BRIEF:89. These four lines are quoted
     rather than trusted to `ALL PASS`, for the reason the four above them are: a probe that silently
     stopped running its game-OFF arms would still print ALL PASS. The CONTROL is quoted too — with
     the game ON the same tap on the same anchor must re-mount, or the OFF measurement is vacuous. */
  assert.match(run.stdout, /CONTROL — game ON: the header Home glyph DOES re-mount \(the handler is live\) — remounted=true/);
  assert.match(run.stdout, /game OFF: the page-day pill is a link again — hasHref=true href=#\/today/);
  assert.match(run.stdout, /game OFF: sameRouteClick is inert — tapping it re-mounts nothing — remounted=false/);
  assert.match(run.stdout, /game OFF: tapping it re-mounts nothing \(COMPOSED did nothing here\) — remounted=false/);
});
