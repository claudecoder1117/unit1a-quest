// integration-w4.test.mjs — the seams Wave 4 created (T12 Bosses · T13 Mock/Report/Baseline ·
// T14 Plan/Onboarding/Night/Sheet · T16 Run). Every ticket's own suite is green in isolation; these are
// the places where two green modules meet and can still be wrong together. Written by the integrator, so
// each case names the request or the defect it came from (see notes/INTEGRATION-W4.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { fresh } from '../site/js/store.js';
import { skills as ALL_SKILLS } from '../site/data/skills.js';
import { moduleById } from '../site/data/modules.js';
import * as page from '../site/js/page.js';
import * as plan from '../site/js/plan.js';
import * as onboard from '../site/js/screens/onboard.js';
import * as run from '../site/js/screens/run.js';
import { mShown } from '../site/js/mastery.js';
import { ROOT, read as src } from './_helpers.mjs';   // T17

const NOW = Date.parse('2026-09-17T12:00:00');
const DAY = 86400000;

/** A save whose weak spots are tier-4 skills whose prerequisites are met (m ≥ 40). */
function tier4Save() {
  const s = fresh();
  s.settings.testDate = '2026-09-23';
  for (const sk of ALL_SKILLS) s.skills[sk.id] = { m: 90, n: 4, lastAt: NOW - DAY };
  for (const id of ['BISECT-1', 'BISECT-2', 'MID-TRI', 'QUAD-CTX', 'DIAG-ALG']) {
    if (s.skills[id]) s.skills[id] = { m: 45, n: 3, lastAt: NOW - DAY };
  }
  return s;
}

/* ------------------------------------------------------------------ the plan → the composer */

test('W4: the plan\'s day target and page.js\'s own are one number', async (t) => {
  // Home and run.js hand `plan.composeOpts()` to `startPage`, MINUS its `q` (see the next test for why).
  // That is only safe while the two modules derive the identical target, so pin it on every plan state.
  await t.test('composeOpts().q === page.qFor().target for every D the plan can be in', () => {
    for (const [iso, D] of [[null, null], ['2026-09-24', 7], ['2026-09-23', 6], ['2026-09-19', 2], ['2026-09-18', 1]]) {
      const s = fresh();
      s.settings.testDate = iso;
      const a = plan.composeOpts(s, { D });
      const b = page.qFor(s, { D });
      assert.equal(a.q, b.target, `D ${D}: plan ${a.q} vs page ${b.target}`);
    }
  });

  await t.test('a lowered day really lowers the tier-4 cap (notes/T14.md Requests → T10)', () => {
    const s = tier4Save();
    const two = page.composePage(s, { now: NOW, tier4: 2 }).queue.filter((i) => i.tier >= 4);
    const one = page.composePage(s, { now: NOW, tier4: 1 }).queue.filter((i) => i.tier >= 4);
    const none = page.composePage(s, { now: NOW, tier4: 0 }).queue.filter((i) => i.tier >= 4);
    assert.equal(two.length, 2, 'the S1 default is 2 tier-4 items');
    assert.equal(one.length, 1, 'the plan\'s lowered cap is honoured — this is what the strip promises in print');
    assert.equal(none.length, 0);
    assert.equal(page.composePage(s, { now: NOW }).queue.filter((i) => i.tier >= 4).length, 2, 'no opts → LIMITS.tier4');
  });

  await t.test('a lowered plan really asks for tier4: 1', () => {
    const s = fresh();
    s.settings.testDate = '2026-09-23';                      // D = 6 → q = 13 → warn → target 12
    const o = plan.composeOpts(s, { D: 6 });
    assert.equal(o.q, 12);
    assert.equal(o.tier4, plan.TIER4_PER_DAY_LOWERED);
    assert.equal(o.tier4, 1);
  });

  await t.test('the session budget survives the plan opts (the W4 33-item regression)', () => {
    // An EXPLICIT q switches off page.js's `pageMax` shrink, so forwarding `composeOpts().q` blew a
    // 25-item page up to 33 (~44 min) on a heavy-review day. The call sites drop `q`; this is the guard.
    const s = fresh();
    s.settings.testDate = '2026-09-22';
    const now = NOW;
    for (const c of ['voc-01', 'voc-02', 'voc-03', 'not-01', 'not-02', 'not-03', 'not-04', 'not-05', 'cls-01', 'cls-02', 'cls-03', 'cls-04', 'def-13', 'voc-15', 'not-09', 'voc-04', 'voc-05', 'voc-06']) {
      s.cards[c] = { seen: 1, cleared: true, bucket: 1, lastAt: now - 3 * DAY, due: now - DAY, rarity: 'gold' };
    }
    s.counters.pages = 3;
    const { q, ...planOpts } = plan.composeOpts(s, {});
    const withPlan = page.composePage(s, { now, ...planOpts }).queue.length;
    const without = page.composePage(s, { now }).queue.length;
    assert.equal(withPlan, without, `the plan must not enlarge the page (${withPlan} vs ${without})`);
    assert.ok(page.composePage(s, { now, q }).queue.length >= withPlan, 'an explicit q is still an exact override for callers that mean it');
  });

  await t.test('the call sites drop `q` on purpose and say so', () => {
    const home = src('site/js/screens/home.js');
    const runSrc = src('site/js/screens/run.js');
    assert.match(home, /const planOpts = \(save, D\) => \{ const \{ q, \.\.\.rest \} = composeOpts/, 'home.js strips q');
    assert.ok(!/startPage\(s, composeOpts\(/.test(home), 'home.js must never forward the plan q straight through');
    assert.match(runSrc, /const \{ q, \.\.\.planOpts \} = composeOpts\(s\); startPage\(s, \{ \.\.\.planOpts/, 'run.js strips q');
    for (const f of ['site/js/screens/home.js', 'site/js/screens/run.js']) assert.match(src(f), /composeOpts/, `${f} composes with the plan`);
  });

  await t.test('nextAction previews the page it is about to start', () => {
    // Home prints "~N min · seed …" from `act.page`; if that preview is composed with different opts from
    // the queue the button then builds, the line is a lie. `compose` is the pass-through that fixes it.
    const s = tier4Save();
    const a = page.nextAction(s, { now: NOW, compose: { tier4: 1 } });
    if (a.kind === 'page') assert.ok(a.page.queue.filter((i) => i.tier >= 4).length <= 1, 'the preview honours the plan');
    const b = page.nextAction(s, { now: NOW });
    if (b.kind === 'page') assert.ok(b.page.queue.filter((i) => i.tier >= 4).length <= 2);
  });
});

/* ------------------------------------------------------------------ one JUMP, two writers */

test('W4: onboard.js and run.js write the same JUMP placement (notes/T16.md Requests)', async (t) => {
  const MOD = 'M10';
  const skillsOf = (id) => (moduleById[id]?.skills ?? []).slice();

  await t.test('the constants agree', () => {
    assert.equal(onboard.JUMP_ITEMS, run.JUMP.items);
    assert.equal(onboard.JUMP_PASS, run.JUMP.pass);
    assert.equal(onboard.PLACEMENT_M.clean, run.JUMP.m);
    assert.equal(onboard.PLACEMENT_N, 5);
  });

  await t.test('a pass writes m = 80 with n = 5, placedAt and jumps[M] — in both', () => {
    const a = fresh(); const b = fresh();
    onboard.applyJump(a, MOD, { correct: 8, total: 10, skills: skillsOf(MOD), now: NOW });
    run.applyJump(b, MOD, { correct: 8, total: 10, at: NOW });
    assert.equal(a.jumps[MOD], true);
    assert.equal(b.jumps[MOD], true);
    for (const id of skillsOf(MOD)) {
      if (!a.skills[id] && !b.skills[id]) continue;
      assert.equal(a.skills[id].m, 80, `onboard ${id}`);
      assert.equal(b.skills[id].m, 80, `run ${id}`);
      assert.equal(a.skills[id].n, 5);
      assert.equal(b.skills[id].n, 5);
      assert.equal(mShown(a.skills[id]), 80, 'm_shown is 80 from the first minute (S1)');
      assert.equal(mShown(b.skills[id]), 80);
    }
  });

  await t.test('a fail writes NOTHING — in both (a bad JUMP must not zero a module)', () => {
    const a = fresh(); const b = fresh();
    const before = JSON.stringify({ skills: a.skills, jumps: a.jumps ?? null });
    onboard.applyJump(a, MOD, { correct: 5, total: 10, skills: skillsOf(MOD), now: NOW });
    run.applyJump(b, MOD, { correct: 5, total: 10, at: NOW });
    assert.equal(JSON.stringify({ skills: a.skills, jumps: a.jumps ?? null }), before, 'onboard.js wrote something');
    assert.equal(JSON.stringify({ skills: b.skills, jumps: b.jumps ?? null }), before, 'run.js wrote something');
  });
});

/* ------------------------------------------------------------------ the wiring the wave asked for */

test('W4: the Wave-4 call sites exist', async (t) => {
  await t.test('a hidden hint ladder records no hint (notes/T12.md Requests → T09)', () => {
    const card = src('site/js/screens/card.js');
    assert.match(card, /if \(n === 2 && !hintWrap\.hidden\) revealHint\(0, \{ auto: true \}\)/,
      'the second-miss auto-hint must respect a Boss / hints:false run');
  });

  await t.test('rootcase restores what it snapshots (notes/T13.md Requests → T08a)', () => {
    const w = src('site/js/widgets/rootcase.js');
    assert.match(w, /function restoreValues\(v\)/);
    assert.match(w, /restoreValues\(ctx\.values\)/, 'and it is actually called on mount');
    assert.ok((w.match(/setValues/g) ?? []).length >= 4, 'all three stages define one, and restoreValues calls it');
    assert.match(w, /s\.ui\?\.setValues\?\.\(v\[s\.key\]\)/, 'each stage gets its own slice of the snapshot');
    assert.match(w, /if \(Array\.isArray\(v\.found\) && v\.found\.length\) found = v\.found\.slice\(\);/,
      '`found` must be restored BEFORE the reject rows and case tabs are built from it');
  });

  await t.test('`missesDrilled` is written when the drill FINISHES (notes/T13.md open issue 1)', () => {
    const report = src('site/js/screens/report.js');
    const runSrc = src('site/js/screens/run.js');
    assert.ok(!/d\.missesDrilled = true/.test(report), 'the report must not set it on a tap any more');
    assert.match(runSrc, /if \(kind === 'drill' && sum\.count\)/);
    assert.match(runSrc, /if \(d\.mockDone\) d\.missesDrilled = true;/, 'and only as the Mock half of the S4 goal');
  });

  await t.test('the Boss is reachable from Home with its intro skipped, and from the Binder', () => {
    const home = src('site/js/screens/home.js');
    const binder = src('site/js/screens/binder.js');
    assert.match(home, /const bossHref = \(id\) =>/);
    assert.match(home, /\?start=1/);
    assert.match(binder, /#\/boss\/\$\{b\.id\}/, 'a ready boss is offered on its module tile');
    assert.match(binder, /#\/run\/blitz\/\$\{t\.module\}/, 'BLITZ is offered on M1/M3/M9 tiles');
    assert.match(binder, /readyBossesFor/);
  });

  await t.test('a long teacher number does not paint over the stem', async () => {
    // The five AP-1 warm-up cards number themselves "Warm up! — item N"; `.card-no` is the paper's 44 px
    // left gutter. card.js now labels the paper so the CSS can move a long one into the flow.
    const { cards } = await import('../site/data/cards.js');
    const long = cards.filter((c) => String(c.teacherNo ?? '').length > 4);
    assert.ok(long.length >= 5, 'the warm-up cards still carry phrase numbers');
    assert.match(src('site/js/screens/card.js'), /paper\.dataset\.no = !item\.numbering \? 'none' : String\(item\.numbering\)\.length > 4 \? 'long' : 'short'/);
    const css = src('site/css/screens.css');
    assert.match(css, /\.card-paper\[data-no="long"\] \.card-no \{[\s\S]*?position: static/);
    assert.match(css, /\.card-paper\[data-no="long"\] \{ padding-left: 20px; \}/);
  });

  await t.test('the Readiness ring is the shell\'s, so a deep link never shows "—"', () => {
    const app = src('site/js/app.js');
    assert.match(app, /readiness as readinessOf/);
    assert.match(app, /hdr\.readiness = r\.r; hdr\.provisional = r\.provisional/);
  });
});

/* ------------------------------------------------------------------ every boss is reachable */

test('W4: a generator-only module does not lock a boss out forever', async (t) => {
  const { bosses } = await import('../site/data/modules.js');

  await t.test('M3 has no originals and no family tiles — it can never be "cleared"', () => {
    const m3 = moduleById.M3;
    assert.equal(m3.originals.length, 0);
    assert.equal(m3.families.length, 0);
  });

  await t.test('B1 becomes ready when M1 is cleared (it used to be unreachable)', () => {
    const s = fresh();
    assert.deepEqual(page.bossReady(s).map((b) => b.id), [], 'a fresh save has no boss ready');
    for (const id of moduleById.M1.originals) {
      s.cards[id] = { seen: 2, cleared: true, bucket: 3, lastAt: NOW - DAY, due: NOW + DAY, rarity: 'gold' };
    }
    assert.deepEqual(page.bossReady(s).map((b) => b.id), ['B1'], 'B1 = M1 + M3, and M3 has nothing to clear');
    s.trophies['boss:B1'] = { at: NOW };
    assert.deepEqual(page.bossReady(s).map((b) => b.id), [], 'a beaten boss is not offered again');
  });

  await t.test('every boss in the catalogue can be reached by clearing its modules', () => {
    for (const b of bosses) {
      const s = fresh();
      for (const mid of b.modules) {
        const m = moduleById[mid];
        for (const id of m.originals) s.cards[id] = { seen: 2, cleared: true, bucket: 3, lastAt: NOW - DAY, due: NOW + DAY, rarity: 'gold' };
        for (const f of m.families) s.variants[f] = { clearsGold: 1, goldDays: ['2026-09-16'] };
      }
      assert.ok(page.bossReady(s).some((r) => r.id === b.id), `${b.id} ${b.name} is unreachable`);
    }
  });
});

/* ------------------------------------------------------------------ the route map, after four waves */

test('W4: every screen is registered and every route has a screen', async () => {
  const { ROUTE_PATTERNS, ALIASES } = await import('../site/js/app.js');
  const { screens } = await import('../site/js/screens/index.js');
  const registered = new Set(Object.keys(screens));
  const wanted = ROUTE_PATTERNS.flatMap((p) => p.split('|')).filter((p) => !(p in ALIASES));
  for (const p of wanted) assert.ok(registered.has(p), `route ${p} has no screen`);
  for (const p of registered) assert.ok(wanted.includes(p), `screen ${p} is not one of the 13 routes`);
  for (const [p, fn] of Object.entries(screens)) assert.equal(typeof fn, 'function', `${p} is not a handler`);
  // the two aliases still point at live run kinds
  assert.equal(ALIASES['/night'], '/run/night');
  assert.equal(ALIASES['/morning'], '/run/morning');
  for (const kind of ['night', 'morning']) assert.ok(run.delegateOf(kind), `#/run/${kind} has no delegate`);
});
